/**
 * DashScopeAgent: DashScope-based observation extraction
 *
 * Alternative to SDKAgent that uses Alibaba Cloud's DashScope API
 * for accessing Qwen series models (OpenAI-compatible endpoint).
 *
 * Responsibility:
 * - Call DashScope REST API for observation extraction
 * - Parse XML responses (same format as Claude/Gemini/OpenRouter)
 * - Sync to database and Chroma
 * - Support dynamic model selection (qwen-plus, qwen-turbo, qwen-max, etc.)
 */

import { DatabaseManager } from './DatabaseManager.js';
import { SessionManager } from './SessionManager.js';
import { logger } from '../../utils/logger.js';
import { buildInitPrompt, buildObservationPrompt, buildSummaryPrompt, buildContinuationPrompt } from '../../sdk/prompts.js';
import { SettingsDefaultsManager } from '../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../shared/paths.js';
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

// DashScope API endpoint (OpenAI-compatible)
const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

// Context window management constants (defaults, overridable via settings)
const DEFAULT_MAX_CONTEXT_MESSAGES = 20;
const DEFAULT_MAX_ESTIMATED_TOKENS = 100000;
const CHARS_PER_TOKEN_ESTIMATE = 4;

// OpenAI-compatible message format
interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface DashScopeResponse {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    code?: string;
  };
}

export class DashScopeAgent {
  private dbManager: DatabaseManager;
  private sessionManager: SessionManager;
  private fallbackAgent: FallbackAgent | null = null;
  private budgetController: BudgetController | null = null;

  constructor(dbManager: DatabaseManager, sessionManager: SessionManager) {
    this.dbManager = dbManager;
    this.sessionManager = sessionManager;
  }

  /**
   * Set the fallback agent (Claude SDK) for when DashScope API fails
   * Must be set after construction to avoid circular dependency
   */
  setFallbackAgent(agent: FallbackAgent): void {
    this.fallbackAgent = agent;
  }

  /**
   * Set the budget controller for cost tracking
   * Must be set after construction to avoid circular dependency
   */
  setBudgetController(controller: BudgetController): void {
    this.budgetController = controller;
  }

  /**
   * Start DashScope agent for a session
   * Uses multi-turn conversation to maintain context across messages
   */
  async startSession(session: ActiveSession, worker?: WorkerRef): Promise<void> {
    try {
      // Get DashScope configuration
      const { apiKey, model } = this.getDashScopeConfig();

      if (!apiKey) {
        throw new Error('DashScope API key not configured. Set CLAUDE_MEM_DASHSCOPE_API_KEY in settings or DASHSCOPE_API_KEY environment variable.');
      }

      // Generate synthetic memorySessionId (DashScope is stateless, doesn't return session IDs)
      if (!session.memorySessionId) {
        const syntheticMemorySessionId = `dashscope-${session.contentSessionId}-${Date.now()}`;
        session.memorySessionId = syntheticMemorySessionId;
        this.dbManager.getSessionStore().updateMemorySessionId(session.sessionDbId, syntheticMemorySessionId);
        logger.info('SESSION', `MEMORY_ID_GENERATED | sessionDbId=${session.sessionDbId} | provider=DashScope`);
      }

      // Load active mode
      const mode = ModeManager.getInstance().getActiveMode();

      // Build initial prompt
      const initPrompt = session.lastPromptNumber === 1
        ? buildInitPrompt(session.project, session.contentSessionId, session.userPrompt, mode)
        : buildContinuationPrompt(session.userPrompt, session.lastPromptNumber, session.contentSessionId, mode);

      // Add to conversation history and query DashScope with full context
      session.conversationHistory.push({ role: 'user', content: initPrompt });
      const initResponse = await this.queryDashScopeMultiTurn(session.conversationHistory, apiKey, model, session.sessionDbId);

      if (initResponse.content) {
        // Track token usage
        const tokensUsed = initResponse.tokensUsed || 0;
        session.cumulativeInputTokens += Math.floor(tokensUsed * 0.7);
        session.cumulativeOutputTokens += Math.floor(tokensUsed * 0.3);

        // Process response using shared ResponseProcessor
        await processAgentResponse(
          initResponse.content,
          session,
          this.dbManager,
          this.sessionManager,
          worker,
          tokensUsed,
          null,
          'DashScope',
          undefined
        );
      } else {
        logger.error('SDK', 'Empty DashScope init response - session may lack context', {
          sessionId: session.sessionDbId,
          model
        });
      }

      // Track lastCwd from messages for CLAUDE.md generation
      let lastCwd: string | undefined;

      // Process pending messages
      let messageIndex = 0;
      for await (const message of this.sessionManager.getMessageIterator(session.sessionDbId)) {
        messageIndex++;
        logger.debug('SDK', `DashScope processing message #${messageIndex}`, {
          sessionDbId: session.sessionDbId,
          type: message.type,
          toolName: message.tool_name || undefined,
          promptNumber: message.prompt_number
        });

        // CLAIM-CONFIRM: Track message ID for confirmProcessed() after successful storage
        session.processingMessageIds.push(message._persistentId);

        // Capture cwd from messages for proper worktree support
        if (message.cwd) {
          lastCwd = message.cwd;
        }
        // Capture earliest timestamp BEFORE processing (will be cleared after)
        const originalTimestamp = session.earliestPendingTimestamp;

        if (message.type === 'observation') {
          // Update last prompt number
          if (message.prompt_number !== undefined) {
            session.lastPromptNumber = message.prompt_number;
          }

          // CRITICAL: Check memorySessionId BEFORE making expensive LLM call
          if (!session.memorySessionId) {
            logger.error('SDK', 'Cannot process observation: memorySessionId missing', {
              sessionDbId: session.sessionDbId,
              contentSessionId: session.contentSessionId,
              messageType: 'observation',
              toolName: message.tool_name
            });
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

          // Add to conversation history and query DashScope with full context
          session.conversationHistory.push({ role: 'user', content: obsPrompt });
          const obsResponse = await this.queryDashScopeMultiTurn(session.conversationHistory, apiKey, model, session.sessionDbId);

          let tokensUsed = 0;
          if (obsResponse.content) {
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
            'DashScope',
            lastCwd
          );

        } else if (message.type === 'summarize') {
          // CRITICAL: Check memorySessionId BEFORE making expensive LLM call
          if (!session.memorySessionId) {
            logger.error('SDK', 'Cannot process summary: memorySessionId missing', {
              sessionDbId: session.sessionDbId,
              contentSessionId: session.contentSessionId,
              messageType: 'summarize'
            });
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

          // Add to conversation history and query DashScope with full context
          session.conversationHistory.push({ role: 'user', content: summaryPrompt });
          const summaryResponse = await this.queryDashScopeMultiTurn(session.conversationHistory, apiKey, model, session.sessionDbId);

          let tokensUsed = 0;
          if (summaryResponse.content) {
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
            'DashScope',
            lastCwd
          );
        }
      }

      // Mark session complete
      const sessionDuration = Date.now() - session.startTime;
      logger.success('SDK', 'DashScope agent completed', {
        sessionId: session.sessionDbId,
        duration: `${(sessionDuration / 1000).toFixed(1)}s`,
        historyLength: session.conversationHistory.length,
        model
      });

    } catch (error: unknown) {
      if (isAbortError(error)) {
        logger.warn('SDK', 'DashScope agent aborted', { sessionId: session.sessionDbId });
        throw error;
      }

      // Check if we should fall back to Claude
      if (shouldFallbackToClaude(error) && this.fallbackAgent) {
        logger.warn('SDK', 'DashScope API failed, falling back to Claude SDK', {
          sessionDbId: session.sessionDbId,
          error: error instanceof Error ? error.message : String(error),
          historyLength: session.conversationHistory.length
        });

        return this.fallbackAgent.startSession(session, worker);
      }

      logger.failure('SDK', 'DashScope agent error', { sessionDbId: session.sessionDbId }, error as Error);
      throw error;
    }
  }

  /**
   * Estimate token count from text (conservative estimate)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
  }

  /**
   * Truncate conversation history to prevent runaway context costs
   * Keeps most recent messages within token budget
   */
  private truncateHistory(history: ConversationMessage[]): ConversationMessage[] {
    const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);

    const MAX_CONTEXT_MESSAGES = parseInt(settings.CLAUDE_MEM_DASHSCOPE_MAX_CONTEXT_MESSAGES) || DEFAULT_MAX_CONTEXT_MESSAGES;
    const MAX_ESTIMATED_TOKENS = parseInt(settings.CLAUDE_MEM_DASHSCOPE_MAX_TOKENS) || DEFAULT_MAX_ESTIMATED_TOKENS;

    if (history.length <= MAX_CONTEXT_MESSAGES) {
      const totalTokens = history.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
      if (totalTokens <= MAX_ESTIMATED_TOKENS) {
        return history;
      }
    }

    // Sliding window: keep most recent messages within limits
    const truncated: ConversationMessage[] = [];
    let tokenCount = 0;

    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      const msgTokens = this.estimateTokens(msg.content);

      if (truncated.length >= MAX_CONTEXT_MESSAGES || tokenCount + msgTokens > MAX_ESTIMATED_TOKENS) {
        logger.warn('SDK', 'Context window truncated to prevent runaway costs', {
          originalMessages: history.length,
          keptMessages: truncated.length,
          droppedMessages: i + 1,
          estimatedTokens: tokenCount,
          tokenLimit: MAX_ESTIMATED_TOKENS
        });
        break;
      }

      truncated.unshift(msg);
      tokenCount += msgTokens;
    }

    return truncated;
  }

  /**
   * Convert shared ConversationMessage array to OpenAI-compatible message format
   */
  private conversationToOpenAIMessages(history: ConversationMessage[]): OpenAIMessage[] {
    return history.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    }));
  }

  /**
   * Query DashScope via REST API with full conversation history (multi-turn)
   * Sends the entire conversation context for coherent responses
   * Integrates with BudgetController for cost tracking
   */
  private async queryDashScopeMultiTurn(
    history: ConversationMessage[],
    apiKey: string,
    model: string,
    sessionDbId?: number
  ): Promise<{ content: string; tokensUsed?: number }> {
    // Truncate history to prevent runaway costs
    const truncatedHistory = this.truncateHistory(history);
    const messages = this.conversationToOpenAIMessages(truncatedHistory);
    const totalChars = truncatedHistory.reduce((sum, m) => sum + m.content.length, 0);
    const estimatedTokens = this.estimateTokens(truncatedHistory.map(m => m.content).join(''));

    logger.debug('SDK', `Querying DashScope multi-turn (${model})`, {
      turns: truncatedHistory.length,
      totalChars,
      estimatedTokens
    });

    // Reserve budget before API call
    let txId: string | null = null;
    if (this.budgetController && this.budgetController.isTrackingEnabled()) {
      const estimatedCost = this.budgetController.estimateCost(estimatedTokens);

      const reserveResult = this.budgetController.reserve(estimatedCost, 'dashscope', sessionDbId);
      if (!reserveResult.success) {
        logger.warn('BUDGET', 'DashScope request blocked by budget limit', {
          reason: reserveResult.reason,
          used: reserveResult.used,
          limit: reserveResult.limit
        });
        throw new Error(`Budget limit exceeded (${reserveResult.reason}): used $${reserveResult.used?.toFixed(2)}, limit $${reserveResult.limit?.toFixed(2)}`);
      }
      txId = reserveResult.txId;
      logger.debug('BUDGET', 'DashScope budget reserved', {
        sessionDbId,
        txId,
        estimatedCost: estimatedCost.toFixed(6),
        estimatedTokens
      });
    }

    try {
      const response = await fetch(DASHSCOPE_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DashScope API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as DashScopeResponse;

      // Check for API error in response body
      if (data.error) {
        throw new Error(`DashScope API error: ${data.error.code} - ${data.error.message}`);
      }

      if (!data.choices?.[0]?.message?.content) {
        logger.error('SDK', 'Empty response from DashScope');
        if (txId && this.budgetController) {
          this.budgetController.commit(txId, 0, 0);
        }
        return { content: '' };
      }

      const content = data.choices[0].message.content;
      const tokensUsed = data.usage?.total_tokens;
      const inputTokens = data.usage?.prompt_tokens || 0;
      const outputTokens = data.usage?.completion_tokens || 0;

      // Commit actual cost
      if (txId && this.budgetController) {
        const actualCost = this.budgetController.calculateCost(inputTokens, outputTokens);
        this.budgetController.commit(txId, 0, actualCost, {
          inputTokens,
          outputTokens
        });
        logger.debug('BUDGET', 'DashScope cost committed', {
          txId,
          inputTokens,
          outputTokens,
          actualCost: actualCost.toFixed(6)
        });
      }

      // Log actual token usage
      if (tokensUsed) {
        logger.info('SDK', 'DashScope API usage', {
          model,
          inputTokens,
          outputTokens,
          totalTokens: tokensUsed,
          messagesInContext: truncatedHistory.length
        });

        if (tokensUsed > 50000) {
          logger.warn('SDK', 'High token usage detected - consider reducing context', {
            totalTokens: tokensUsed
          });
        }
      }

      return { content, tokensUsed };
    } catch (error) {
      // Rollback on API failure
      if (txId && this.budgetController) {
        const reason = (error as Error).message || 'API error';
        this.budgetController.rollback(txId, reason);
        logger.debug('BUDGET', 'DashScope cost rolled back', { txId, reason });
      }
      throw error;
    }
  }

  /**
   * Get DashScope configuration from settings or environment
   */
  private getDashScopeConfig(): { apiKey: string; model: string } {
    const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);

    const apiKey = settings.CLAUDE_MEM_DASHSCOPE_API_KEY || getCredential('DASHSCOPE_API_KEY') || '';
    const model = settings.CLAUDE_MEM_DASHSCOPE_MODEL || 'qwen-plus';
    const keySource = settings.CLAUDE_MEM_DASHSCOPE_API_KEY ? 'settings' : (getCredential('DASHSCOPE_API_KEY') ? 'env' : 'none');

    logger.debug('SDK', 'DashScope config loaded', {
      model,
      keySource,
      hasApiKey: !!apiKey
    });

    return { apiKey, model };
  }
}

/**
 * Check if DashScope is available (has API key configured)
 */
export function isDashScopeAvailable(): boolean {
  const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
  return !!(settings.CLAUDE_MEM_DASHSCOPE_API_KEY || getCredential('DASHSCOPE_API_KEY'));
}

/**
 * Check if DashScope is the selected provider
 */
export function isDashScopeSelected(): boolean {
  const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
  return settings.CLAUDE_MEM_PROVIDER === 'dashscope';
}

/**
 * Test DashScope API connection with a simple request
 * Returns success status and latency information
 */
export async function testDashScopeConnection(
  apiKey: string,
  model: string
): Promise<{ success: boolean; message: string; model?: string; latencyMs?: number }> {
  logger.info('SDK', 'Testing DashScope connection', { model });
  const startTime = Date.now();

  try {
    const response = await fetch(DASHSCOPE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hello, respond with just "OK"' }],
        temperature: 0,
        max_tokens: 10,
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

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

      logger.error('SDK', 'DashScope connection test failed', { model, latencyMs, status: response.status, error: errorMessage });
      return {
        success: false,
        message: errorMessage,
        model,
        latencyMs,
      };
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };

    if (!data.choices?.[0]?.message?.content) {
      logger.error('SDK', 'DashScope connection test: invalid response format', { model, latencyMs });
      return {
        success: false,
        message: 'Invalid response format from API',
        model,
        latencyMs,
      };
    }

    logger.info('SDK', 'DashScope connection test succeeded', { model, latencyMs });
    return {
      success: true,
      message: `Connected successfully (${latencyMs}ms)`,
      model,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('SDK', 'DashScope connection test error', { model, latencyMs, error: errorMessage });

    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
      return {
        success: false,
        message: 'Cannot connect to DashScope API. Check network connection.',
        model,
        latencyMs,
      };
    }

    if (errorMessage.includes('fetch failed') || errorMessage.includes('Unable to connect')) {
      return {
        success: false,
        message: 'Network error. DashScope API may be unreachable.',
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
