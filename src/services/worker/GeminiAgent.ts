/**
 * GeminiAgent: Gemini-based observation extraction
 *
 * Alternative to SDKAgent that uses Google's Gemini API directly
 * for extracting observations from tool usage.
 *
 * Responsibility:
 * - Call Gemini REST API for observation extraction
 * - Parse XML responses (same format as Claude)
 * - Sync to database and Chroma
 */

import path from 'path';
import { homedir } from 'os';
import { DatabaseManager } from './DatabaseManager.js';
import { SessionManager } from './SessionManager.js';
import { logger } from '../../utils/logger.js';
import { buildInitPrompt, buildObservationPrompt, buildSummaryPrompt, buildContinuationPrompt } from '../../sdk/prompts.js';
import { SettingsDefaultsManager } from '../../shared/SettingsDefaultsManager.js';
import { getCredential } from '../../shared/EnvManager.js';
import type { ActiveSession, ConversationMessage } from '../worker-types.js';
import { ModeManager } from '../domain/ModeManager.js';
import {
  processAgentResponse,
  shouldFallbackToClaude,
  isAbortError,
  type WorkerRef,
  type FallbackAgent
} from './agents/index.js';
import { BudgetController } from './budget/BudgetController.js';

// Gemini API endpoint (default, can be overridden via settings)
const DEFAULT_GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// Gemini model types (available via API)
export type GeminiModel =
  | 'gemini-2.5-flash-lite'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'gemini-2.0-flash'
  | 'gemini-2.0-flash-lite'
  | 'gemini-3-flash-preview';

// Free tier RPM limits by model (requests per minute)
const GEMINI_RPM_LIMITS: Record<GeminiModel, number> = {
  'gemini-2.5-flash-lite': 10,
  'gemini-2.5-flash': 10,
  'gemini-2.5-pro': 5,
  'gemini-2.0-flash': 15,
  'gemini-2.0-flash-lite': 30,
  'gemini-3-flash-preview': 5,
};

// Track last request time for rate limiting
let lastRequestTime = 0;

/**
 * Enforce RPM rate limit for Gemini free tier.
 * Waits the required time between requests based on model's RPM limit + 100ms safety buffer.
 * Skipped entirely if rate limiting is disabled (billing users with 1000+ RPM available).
 */
async function enforceRateLimitForModel(model: GeminiModel, rateLimitingEnabled: boolean): Promise<void> {
  // Skip rate limiting if disabled (billing users with 1000+ RPM)
  if (!rateLimitingEnabled) {
    return;
  }

  const rpm = GEMINI_RPM_LIMITS[model] || 5;
  const minimumDelayMs = Math.ceil(60000 / rpm) + 100; // (60s / RPM) + 100ms safety buffer

  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < minimumDelayMs) {
    const waitTime = minimumDelayMs - timeSinceLastRequest;
    logger.debug('SDK', `Rate limiting: waiting ${waitTime}ms before Gemini request`, { model, rpm });
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastRequestTime = Date.now();
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

/**
 * Gemini content message format
 * role: "user" or "model" (Gemini uses "model" not "assistant")
 */
interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export class GeminiAgent {
  private dbManager: DatabaseManager;
  private sessionManager: SessionManager;
  private fallbackAgent: FallbackAgent | null = null;
  private budgetController: BudgetController | null = null;

  constructor(dbManager: DatabaseManager, sessionManager: SessionManager) {
    this.dbManager = dbManager;
    this.sessionManager = sessionManager;
  }

  /**
   * Set the budget controller for cost tracking
   * Must be set after construction to avoid circular dependency
   */
  setBudgetController(controller: BudgetController): void {
    this.budgetController = controller;
  }

  /**
   * Set the fallback agent (Claude SDK) for when Gemini API fails
   * Must be set after construction to avoid circular dependency
   */
  setFallbackAgent(agent: FallbackAgent): void {
    this.fallbackAgent = agent;
  }

  /**
   * Start Gemini agent for a session
   * Uses multi-turn conversation to maintain context across messages
   */
  async startSession(session: ActiveSession, worker?: WorkerRef): Promise<void> {
    try {
      // Get Gemini configuration
      const { apiKey, apiUrl, model, rateLimitingEnabled } = this.getGeminiConfig();

      if (!apiKey) {
        throw new Error('Gemini API key not configured. Set CLAUDE_MEM_GEMINI_API_KEY in settings or GEMINI_API_KEY environment variable.');
      }

      // Generate synthetic memorySessionId (Gemini is stateless, doesn't return session IDs)
      if (!session.memorySessionId) {
        const syntheticMemorySessionId = `gemini-${session.contentSessionId}-${Date.now()}`;
        session.memorySessionId = syntheticMemorySessionId;
        this.dbManager.getSessionStore().updateMemorySessionId(session.sessionDbId, syntheticMemorySessionId);
        logger.info('SESSION', `MEMORY_ID_GENERATED | sessionDbId=${session.sessionDbId} | provider=Gemini`);
      }

      // Load active mode
      const mode = ModeManager.getInstance().getActiveMode();

      // Build initial prompt
      const initPrompt = session.lastPromptNumber === 1
        ? buildInitPrompt(session.project, session.contentSessionId, session.userPrompt, mode)
        : buildContinuationPrompt(session.userPrompt, session.lastPromptNumber, session.contentSessionId, mode);

      // Add to conversation history and query Gemini with full context
      session.conversationHistory.push({ role: 'user', content: initPrompt });
      const initResponse = await this.queryGeminiMultiTurn(session.conversationHistory, apiKey, apiUrl, model, rateLimitingEnabled, session.sessionDbId);

      if (initResponse.content) {
        // Add response to conversation history
        session.conversationHistory.push({ role: 'assistant', content: initResponse.content });

        // Track token usage
        const tokensUsed = initResponse.tokensUsed || 0;
        session.cumulativeInputTokens += Math.floor(tokensUsed * 0.7);  // Rough estimate
        session.cumulativeOutputTokens += Math.floor(tokensUsed * 0.3);

        // Process response using shared ResponseProcessor (no original timestamp for init - not from queue)
        await processAgentResponse(
          initResponse.content,
          session,
          this.dbManager,
          this.sessionManager,
          worker,
          tokensUsed,
          null,
          'Gemini'
        );
      } else {
        logger.error('SDK', 'Empty Gemini init response - session may lack context', {
          sessionId: session.sessionDbId,
          model
        });
      }

      // Process pending messages
      // Track cwd from messages for CLAUDE.md generation
      let lastCwd: string | undefined;

      for await (const message of this.sessionManager.getMessageIterator(session.sessionDbId)) {
        // CLAIM-CONFIRM: Track message ID for confirmProcessed() after successful storage
        // The message is now in 'processing' status in DB until ResponseProcessor calls confirmProcessed()
        session.processingMessageIds.push(message._persistentId);

        // Capture cwd from each message for worktree support
        if (message.cwd) {
          lastCwd = message.cwd;
        }
        // Capture earliest timestamp BEFORE processing (will be cleared after)
        // This ensures backlog messages get their original timestamps, not current time
        const originalTimestamp = session.earliestPendingTimestamp;

        if (message.type === 'observation') {
          // Update last prompt number
          if (message.prompt_number !== undefined) {
            session.lastPromptNumber = message.prompt_number;
          }

          // CRITICAL: Check memorySessionId BEFORE making expensive LLM call
          // This prevents wasting tokens when we won't be able to store the result anyway
          if (!session.memorySessionId) {
            throw new Error('Cannot process observations: memorySessionId not yet captured. This session may need to be reinitialized.');
          }

          // Build observation prompt
          const obsPrompt = buildObservationPrompt({
            id: 0,
            tool_name: message.tool_name!,
            tool_input: JSON.stringify(message.tool_input),
            tool_output: JSON.stringify(message.tool_response),
            created_at_epoch: originalTimestamp ?? Date.now(),
            cwd: message.cwd
          });

          // Add to conversation history and query Gemini with full context
          session.conversationHistory.push({ role: 'user', content: obsPrompt });
          const obsResponse = await this.queryGeminiMultiTurn(session.conversationHistory, apiKey, apiUrl, model, rateLimitingEnabled, session.sessionDbId);

          let tokensUsed = 0;
          if (obsResponse.content) {
            // Add response to conversation history
            session.conversationHistory.push({ role: 'assistant', content: obsResponse.content });

            tokensUsed = obsResponse.tokensUsed || 0;
            session.cumulativeInputTokens += Math.floor(tokensUsed * 0.7);
            session.cumulativeOutputTokens += Math.floor(tokensUsed * 0.3);
          }

          // Process response using shared ResponseProcessor
          await processAgentResponse(
            obsResponse.content || '',
            session,
            this.dbManager,
            this.sessionManager,
            worker,
            tokensUsed,
            originalTimestamp,
            'Gemini',
            lastCwd
          );

        } else if (message.type === 'summarize') {
          // CRITICAL: Check memorySessionId BEFORE making expensive LLM call
          if (!session.memorySessionId) {
            throw new Error('Cannot process summary: memorySessionId not yet captured. This session may need to be reinitialized.');
          }

          // Build summary prompt
          const summaryPrompt = buildSummaryPrompt({
            id: session.sessionDbId,
            memory_session_id: session.memorySessionId,
            project: session.project,
            user_prompt: session.userPrompt,
            last_assistant_message: message.last_assistant_message || ''
          }, mode);

          // Add to conversation history and query Gemini with full context
          session.conversationHistory.push({ role: 'user', content: summaryPrompt });
          const summaryResponse = await this.queryGeminiMultiTurn(session.conversationHistory, apiKey, apiUrl, model, rateLimitingEnabled, session.sessionDbId);

          let tokensUsed = 0;
          if (summaryResponse.content) {
            // Add response to conversation history
            session.conversationHistory.push({ role: 'assistant', content: summaryResponse.content });

            tokensUsed = summaryResponse.tokensUsed || 0;
            session.cumulativeInputTokens += Math.floor(tokensUsed * 0.7);
            session.cumulativeOutputTokens += Math.floor(tokensUsed * 0.3);
          }

          // Process response using shared ResponseProcessor
          await processAgentResponse(
            summaryResponse.content || '',
            session,
            this.dbManager,
            this.sessionManager,
            worker,
            tokensUsed,
            originalTimestamp,
            'Gemini',
            lastCwd
          );
        }
      }

      // Mark session complete
      const sessionDuration = Date.now() - session.startTime;
      logger.success('SDK', 'Gemini agent completed', {
        sessionId: session.sessionDbId,
        duration: `${(sessionDuration / 1000).toFixed(1)}s`,
        historyLength: session.conversationHistory.length
      });

    } catch (error: unknown) {
      if (isAbortError(error)) {
        logger.warn('SDK', 'Gemini agent aborted', { sessionId: session.sessionDbId });
        throw error;
      }

      // Check if we should fall back to Claude
      if (shouldFallbackToClaude(error) && this.fallbackAgent) {
        logger.warn('SDK', 'Gemini API failed, falling back to Claude SDK', {
          sessionDbId: session.sessionDbId,
          error: error instanceof Error ? error.message : String(error),
          historyLength: session.conversationHistory.length
        });

        // Fall back to Claude - it will use the same session with shared conversationHistory
        // Note: With claim-and-delete queue pattern, messages are already deleted on claim
        return this.fallbackAgent.startSession(session, worker);
      }

      logger.failure('SDK', 'Gemini agent error', { sessionDbId: session.sessionDbId }, error as Error);
      throw error;
    }
  }

  /**
   * Convert shared ConversationMessage array to Gemini's contents format
   * Maps 'assistant' role to 'model' for Gemini API compatibility
   */
  private conversationToGeminiContents(history: ConversationMessage[]): GeminiContent[] {
    return history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
  }

  /**
   * Query Gemini via REST API with full conversation history (multi-turn)
   * Sends the entire conversation context for coherent responses
   * Integrates with BudgetController for cost tracking
   */
  private async queryGeminiMultiTurn(
    history: ConversationMessage[],
    apiKey: string,
    apiUrl: string,
    model: GeminiModel,
    rateLimitingEnabled: boolean,
    sessionDbId?: number
  ): Promise<{ content: string; tokensUsed?: number }> {
    const contents = this.conversationToGeminiContents(history);
    const totalChars = history.reduce((sum, m) => sum + m.content.length, 0);

    logger.debug('SDK', `Querying Gemini multi-turn (${model})`, {
      turns: history.length,
      totalChars,
      apiUrl: apiUrl !== DEFAULT_GEMINI_API_URL ? apiUrl : 'default'
    });

    // Reserve budget before API call (using BudgetController's configured preset)
    let txId: string | null = null;
    if (this.budgetController && this.budgetController.isTrackingEnabled()) {
      // Estimate input tokens (rough: 4 chars per token)
      const estimatedInputTokens = Math.ceil(totalChars / 4);
      const estimatedCost = this.budgetController.estimateCost(estimatedInputTokens);

      const reserveResult = this.budgetController.reserve(estimatedCost, 'gemini', sessionDbId);
      if (!reserveResult.success) {
        logger.warn('BUDGET', 'Gemini request blocked by budget limit', {
          reason: reserveResult.reason,
          used: reserveResult.used,
          limit: reserveResult.limit
        });
        throw new Error(`Budget limit exceeded (${reserveResult.reason}): used $${reserveResult.used?.toFixed(2)}, limit $${reserveResult.limit?.toFixed(2)}`);
      }
      txId = reserveResult.txId;
    }

    try {
      // Remove trailing slash from apiUrl to avoid double-slash issues
      const cleanApiUrl = apiUrl.replace(/\/+$/, '');
      const url = `${cleanApiUrl}/${model}:generateContent?key=${apiKey}`;

      // Enforce RPM rate limit for free tier (skipped if rate limiting disabled)
      await enforceRateLimitForModel(model, rateLimitingEnabled);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.3,  // Lower temperature for structured extraction
            maxOutputTokens: 4096,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${error}`);
      }

      const data = await response.json() as GeminiResponse;

      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        logger.error('SDK', 'Empty response from Gemini');
        // Commit with zero cost for empty responses
        if (txId && this.budgetController) {
          this.budgetController.commit(txId, 0, 0);
        }
        return { content: '' };
      }

      const content = data.candidates[0].content.parts[0].text;
      const tokensUsed = data.usageMetadata?.totalTokenCount;
      const inputTokens = data.usageMetadata?.promptTokenCount || 0;
      const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;

      // Commit actual cost using BudgetController's configured preset
      if (txId && this.budgetController) {
        const actualCost = this.budgetController.calculateCost(inputTokens, outputTokens);
        this.budgetController.commit(txId, 0, actualCost, {
          inputTokens,
          outputTokens
        });
        logger.debug('BUDGET', 'Gemini cost committed', {
          txId,
          inputTokens,
          outputTokens,
          actualCost: actualCost.toFixed(6)
        });
      }

      return { content, tokensUsed };
    } catch (error) {
      // Rollback on API failure
      if (txId && this.budgetController) {
        const reason = (error as Error).message || 'API error';
        this.budgetController.rollback(txId, reason);
        logger.debug('BUDGET', 'Gemini cost rolled back', { txId, reason });
      }
      throw error;
    }
  }

  /**
   * Get Gemini configuration from settings or environment
   * Issue #733: Uses centralized ~/.claude-mem/.env for credentials, not random project .env files
   */
  private getGeminiConfig(): { apiKey: string; apiUrl: string; model: GeminiModel; rateLimitingEnabled: boolean } {
    const settingsPath = path.join(homedir(), '.claude-mem', 'settings.json');
    const settings = SettingsDefaultsManager.loadFromFile(settingsPath);

    // API key: check settings first, then centralized claude-mem .env (NOT process.env)
    // This prevents Issue #733 where random project .env files could interfere
    const apiKey = settings.CLAUDE_MEM_GEMINI_API_KEY || getCredential('GEMINI_API_KEY') || '';

    // API URL: check settings first, then environment variable, then default
    const apiUrl = settings.CLAUDE_MEM_GEMINI_API_URL || process.env.GEMINI_API_URL || DEFAULT_GEMINI_API_URL;

    // Model: from settings or default, with validation (skip validation for custom API URLs)
    const defaultModel: GeminiModel = 'gemini-2.5-flash';
    const configuredModel = settings.CLAUDE_MEM_GEMINI_MODEL || defaultModel;
    const validModels: GeminiModel[] = [
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-3-flash-preview',
    ];

    let model: GeminiModel;
    // Skip model validation for custom API URLs (they may support different models)
    const isCustomApiUrl = apiUrl !== DEFAULT_GEMINI_API_URL;
    if (isCustomApiUrl || validModels.includes(configuredModel as GeminiModel)) {
      model = configuredModel as GeminiModel;
    } else {
      logger.warn('SDK', `Invalid Gemini model "${configuredModel}", falling back to ${defaultModel}`, {
        configured: configuredModel,
        validModels,
      });
      model = defaultModel;
    }

    // Rate limiting: enabled by default for free tier users
    const rateLimitingEnabled = settings.CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED !== 'false';

    return { apiKey, apiUrl, model, rateLimitingEnabled };
  }
}

/**
 * Check if Gemini is available (has API key configured)
 * Issue #733: Uses centralized ~/.claude-mem/.env, not random project .env files
 */
export function isGeminiAvailable(): boolean {
  const settingsPath = path.join(homedir(), '.claude-mem', 'settings.json');
  const settings = SettingsDefaultsManager.loadFromFile(settingsPath);
  return !!(settings.CLAUDE_MEM_GEMINI_API_KEY || getCredential('GEMINI_API_KEY'));
}

/**
 * Check if Gemini is the selected provider
 */
export function isGeminiSelected(): boolean {
  const settingsPath = path.join(homedir(), '.claude-mem', 'settings.json');
  const settings = SettingsDefaultsManager.loadFromFile(settingsPath);
  return settings.CLAUDE_MEM_PROVIDER === 'gemini';
}

/**
 * Test Gemini API connection with a simple request
 * Returns success status and latency information
 */
export async function testGeminiConnection(
  apiKey: string,
  apiUrl: string,
  model: string
): Promise<{ success: boolean; message: string; model?: string; latencyMs?: number }> {
  const startTime = Date.now();

  try {
    // Remove trailing slash from apiUrl to avoid double-slash issues
    const cleanApiUrl = apiUrl.replace(/\/+$/, '');
    const url = `${cleanApiUrl}/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 50,  // Increased to handle different tokenizers
        },
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      // Parse common error messages
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }
      } catch {
        if (errorText.length < 200) {
          errorMessage = errorText;
        }
      }

      return {
        success: false,
        message: errorMessage,
        model,
        latencyMs,
      };
    }

    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      // Log the actual response structure for debugging
      logger.debug('SDK', 'Gemini test response structure', {
        hasData: !!data,
        hasCandidates: !!data?.candidates,
        candidatesLength: data?.candidates?.length,
        firstCandidate: data?.candidates?.[0] ? JSON.stringify(data.candidates[0]).slice(0, 200) : 'null'
      });
      return {
        success: false,
        message: `Invalid response format from API. Response: ${JSON.stringify(data).slice(0, 100)}`,
        model,
        latencyMs,
      };
    }

    return {
      success: true,
      message: `Connected successfully (${latencyMs}ms)`,
      model,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for common network errors
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
      return {
        success: false,
        message: 'Cannot connect to API endpoint. Check URL and network.',
        model,
        latencyMs,
      };
    }

    if (errorMessage.includes('fetch failed') || errorMessage.includes('Unable to connect')) {
      return {
        success: false,
        message: 'Network error. API endpoint may be blocked or unreachable.',
        model,
        latencyMs,
      };
    }

    return {
      success: false,
      message: errorMessage,
      model,
      latencyMs,
    };
  }
}
