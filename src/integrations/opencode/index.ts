/**
 * OpenCode Plugin for claude-mem
 *
 * Thin HTTP bridge that connects OpenCode's plugin system to the
 * centralized claude-mem Worker service at localhost:37777.
 *
 * Architecture follows the OpenClaw plugin pattern:
 * - Events → HTTP POST to worker API → SQLite/Chroma storage
 * - Context injection via AGENTS.md file sync
 * - Custom search tool registered in OpenCode's tool system
 *
 * Plugin API reference: https://opencode.ai/docs/plugins
 */

import { writeFile } from 'fs/promises';
import { join, basename } from 'path';
import { type Plugin, tool } from '@opencode-ai/plugin';
import type { Event } from '@opencode-ai/sdk';
import type {
  ClaudeMemOpenCodeConfig,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_WORKER_PORT = 37777;
const MAX_TOOL_RESPONSE_LENGTH = 4000;

// ============================================================================
// Privacy tag stripping (edge processing)
//
// Matches Claude Code's hook-layer pattern: strip <private> and
// <claude-mem-context> tags before data reaches the worker service.
// Inlined here to keep the plugin self-contained (avoids bundling the
// file-system logger from src/utils/tag-stripping.ts).
// ============================================================================

function stripPrivateTags(content: string): string {
  // Fast path: no tags present, return as-is (preserves trailing newlines etc.)
  if (!content.includes('<private>') && !content.includes('<claude-mem-context>')) {
    return content;
  }
  return content
    .replace(/<claude-mem-context>[\s\S]*?<\/claude-mem-context>/g, '')
    .replace(/<private>[\s\S]*?<\/private>/g, '')
    .trim();
}

/**
 * Returns true when the original content was entirely wrapped in <private>
 * tags (i.e., nothing remains after stripping). Used to skip observations
 * that the user has explicitly marked as private.
 */
function isEntirelyPrivate(original: string, stripped: string): boolean {
  return original.includes('<private>') && stripped.length === 0;
}

// ============================================================================
// Worker HTTP Client
// ============================================================================

function workerBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

async function workerPost(
  port: number,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${workerBaseUrl(port)}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.warn(`[claude-mem] Worker POST ${path} returned ${response.status}`);
      return null;
    }
    return (await response.json()) as Record<string, unknown>;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[claude-mem] Worker POST ${path} failed: ${message}`);
    return null;
  }
}

function workerPostFireAndForget(
  port: number,
  path: string,
  body: Record<string, unknown>,
): void {
  fetch(`${workerBaseUrl(port)}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[claude-mem] Worker POST ${path} failed: ${message}`);
  });
}

async function workerGetText(
  port: number,
  path: string,
): Promise<string | null> {
  try {
    const response = await fetch(`${workerBaseUrl(port)}${path}`);
    if (!response.ok) {
      console.warn(`[claude-mem] Worker GET ${path} returned ${response.status}`);
      return null;
    }
    return await response.text();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[claude-mem] Worker GET ${path} failed: ${message}`);
    return null;
  }
}

// ============================================================================
// Utility: Project name from directory
// ============================================================================

function getProjectNameFromDir(directory: string): string {
  try {
    return basename(directory) || 'opencode';
  } catch {
    return 'opencode';
  }
}

// ============================================================================
// Plugin Entry Point
// ============================================================================

export const claudeMemPlugin: Plugin = async (ctx) => {
  console.log('[claude-mem] Plugin initializing', { directory: ctx.directory });

  // Read config from OpenCode's plugin config system.
  // OpenCode passes config via the ctx object or environment.
  // Config may be passed via ctx.config (OpenCode plugin config system) or default to empty
  const config: ClaudeMemOpenCodeConfig = (ctx as any).config ?? {};
  const workerPort = config.workerPort || DEFAULT_WORKER_PORT;
  // ctx.project?.name is the OpenCode project name (optional field); fall back to directory basename
  const projectName = config.project || (ctx as any).project?.name || getProjectNameFromDir(ctx.directory);
  const syncAgentsMd = config.syncAgentsMd !== false;
  // Build a Set for O(1) skip lookups; tools starting with "claude_mem" are always skipped
  const skipToolsSet = new Set<string>(config.skipTools ?? []);
  console.log('[claude-mem] Config:', { workerPort, projectName, syncAgentsMd, skipTools: [...skipToolsSet] });

  // ------------------------------------------------------------------
  // Session tracking
  // ------------------------------------------------------------------
  // Maps OpenCode sessionID → claude-mem contentSessionId
  const sessionIds = new Map<string, string>();
  // Tracks which sessions have been initialized with the worker
  const initializedSessions = new Set<string>();
  const lastAssistantMessages = new Map<string, string>();
  // Tracks the last assistant text sent as observation per session (for dedup)
  const lastSentAssistantText = new Map<string, string>();
  // Stores messageID → text content accumulated from message.part.updated events.
  // Only consumed for assistant messages; user messages are handled via chat.message hook.
  const messageTexts = new Map<string, string>();
  // Tracks the latest user prompt per session (set by chat.message hook)
  const lastUserPrompts = new Map<string, string>();

  function getContentSessionId(sessionID: string): string {
    if (!sessionIds.has(sessionID)) {
      sessionIds.set(sessionID, `opencode-${sessionID}-${Date.now()}`);
    }
    return sessionIds.get(sessionID)!;
  }

  /**
   * Ensure a session is initialized with the worker.
   * OpenCode does NOT fire 'session.created' events - it only fires 'session.updated'.
   * We lazily initialize on first contact with any session ID.
   */
  async function ensureSessionInitialized(sessionID: string, prompt?: string): Promise<string> {
    const contentSessionId = getContentSessionId(sessionID);
    if (!initializedSessions.has(sessionID)) {
      const result = await workerPost(workerPort, '/api/sessions/init', {
        contentSessionId,
        project: projectName,
        prompt: prompt || lastUserPrompts.get(sessionID) || '',
      });
      // Only mark initialized after worker confirms success
      if (result !== null) {
        initializedSessions.add(sessionID);
        await syncAgentsContext();
      }
    }
    return contentSessionId;
  }

  // ------------------------------------------------------------------
  // AGENTS.md context sync
  // ------------------------------------------------------------------
  async function syncAgentsContext(): Promise<void> {
    if (!syncAgentsMd) return;

    const contextText = await workerGetText(
      workerPort,
      `/api/context/inject?projects=${encodeURIComponent(projectName)}`,
    );

    if (!contextText || contextText.trim().length === 0) return;

    // Respect OPENCODE_CONFIG_DIR env var for config location
    const agentsMdPath = join(ctx.directory, 'AGENTS.md');

    try {
      // Read existing AGENTS.md and merge claude-mem context
      let existingContent = '';
      try {
        const { readFile } = await import('fs/promises');
        existingContent = await readFile(agentsMdPath, 'utf-8');
      } catch {
        // File doesn't exist yet
      }

      const startTag = '<claude-mem-context>';
      const endTag = '</claude-mem-context>';
      const contextBlock = `${startTag}\n${contextText}\n${endTag}`;

      let newContent: string;
      const startIdx = existingContent.indexOf(startTag);
      const endIdx = existingContent.indexOf(endTag);

      if (startIdx !== -1 && endIdx !== -1) {
        // Replace existing claude-mem section
        newContent =
          existingContent.substring(0, startIdx) +
          contextBlock +
          existingContent.substring(endIdx + endTag.length);
      } else {
        // Append claude-mem section
        newContent = existingContent
          ? `${existingContent}\n\n${contextBlock}\n`
          : `${contextBlock}\n`;
      }

      await writeFile(agentsMdPath, newContent, 'utf-8');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[claude-mem] Failed to sync AGENTS.md: ${msg}`);
    }
  }

  // ------------------------------------------------------------------
  // Debounced AGENTS.md sync (coalesces rapid fire-and-forget calls)
  // ------------------------------------------------------------------
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  const SYNC_DEBOUNCE_MS = 5000;

  function debouncedSyncAgentsContext(): void {
    if (syncTimer) return; // already scheduled
    syncTimer = setTimeout(() => {
      syncTimer = null;
      syncAgentsContext().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[claude-mem] Debounced AGENTS.md sync failed: ${msg}`);
      });
    }, SYNC_DEBOUNCE_MS);
  }

  // ------------------------------------------------------------------
  // Initial context injection on plugin load
  // ------------------------------------------------------------------
  await syncAgentsContext();

  // ------------------------------------------------------------------
  // Return plugin hooks
  // ------------------------------------------------------------------
  const pluginReturn = {
    // ================================================================
    // User message hook: deterministic capture of user intent
    //
    // chat.message fires synchronously inside createUserMessage() BEFORE:
    //   - the message is written to the database
    //   - message.updated / message.part.updated events are published
    //   - any tool execution begins
    //
    // This guarantees session init always has a real prompt, eliminating
    // the race condition where tool.execute.after fires before message.updated.
    // ================================================================
    'chat.message': async (
      input: { sessionID: string; agent?: string; model?: { providerID: string; modelID: string }; messageID?: string; variant?: string },
      output: { message: any; parts: any[] },
    ) => {
      console.log('[claude-mem] chat.message:', input.sessionID);
      const { sessionID } = input;
      const { parts } = output;

      // Extract text directly from assembled parts — no event-timing games needed.
      // Filter out synthetic parts (auto-injected content, e.g. Read tool output).
      const rawText = parts
        .filter((p: any) => p.type === 'text' && !p.synthetic)
        .map((p: any) => String(p.text || ''))
        .join('\n')
        .trim();

      // Fall back to placeholder for media-only messages (images, files)
      const text = rawText || '[media prompt]';

      // Strip privacy tags at edge before sending to worker
      const strippedText = stripPrivateTags(text);
      if (isEntirelyPrivate(text, strippedText)) return;

      lastUserPrompts.set(sessionID, strippedText);
      const contentSessionId = getContentSessionId(sessionID);

      if (!initializedSessions.has(sessionID)) {
        // First message: initialize session with real user text
        const initResult = await workerPost(workerPort, '/api/sessions/init', {
          contentSessionId,
          project: projectName,
          prompt: strippedText,
        });
        if (initResult !== null) {
          initializedSessions.add(sessionID);
          await syncAgentsContext();
        }
      } else {
        // Subsequent turns: record new prompt (worker increments prompt counter)
        await workerPost(workerPort, '/api/sessions/init', {
          contentSessionId,
          project: projectName,
          prompt: strippedText,
        });
      }
    },

    // ================================================================
    // Tool interceptor: capture every tool execution
    // ================================================================
    'tool.execute.after': async (
      input: { tool: string; sessionID: string; callID: string; args: any },
      output: { title: string; output: string; metadata: any },
    ) => {
      console.log('[claude-mem] tool.execute.after:', input.tool, input.sessionID);
      const toolName = input.tool;
      if (!toolName) return;

      // Skip claude-mem tools to prevent recursive observation loops (always enforced)
      if (toolName.startsWith('claude_mem')) return;
      // Skip user-configured tools
      if (skipToolsSet.has(toolName)) return;

      // Lazily initialize session on first tool use
      const contentSessionId = await ensureSessionInitialized(input.sessionID);

      // Strip privacy tags then truncate long tool output
      let toolResponse = stripPrivateTags(output.output || '');
      if (toolResponse.length > MAX_TOOL_RESPONSE_LENGTH) {
        toolResponse = toolResponse.slice(0, MAX_TOOL_RESPONSE_LENGTH);
      }

      workerPostFireAndForget(workerPort, '/api/sessions/observations', {
        contentSessionId,
        tool_name: toolName,
        tool_input: input.args || {},
        tool_response: toolResponse,
        cwd: ctx.directory,
      });

      // Re-sync AGENTS.md after observations (debounced to avoid 100+ writes/session)
      debouncedSyncAgentsContext();
    },

    // ================================================================
    // Bus event listener: session lifecycle
    // ================================================================
    event: async ({ event }: { event: Event }) => {
      console.log('[claude-mem] event received:', event.type);
      // OpenCode Event structure: { type: string, properties: { ... } }
      // Properties vary by event type - see @opencode-ai/sdk types
      const props = (event as any).properties || {};

      switch (event.type) {
        // OpenCode fires session.updated frequently — do NOT init here.
        // Session init happens lazily on first tool use or user message,
        // so we always have a real prompt instead of an empty placeholder.
        case 'session.updated': {
          break;
        }

        case 'session.compacted': {
          // properties: { sessionID: string }
          // Clear the initialized flag so the next user message re-inits with a real prompt
          const sessionID = props.sessionID || 'default';
          initializedSessions.delete(sessionID);
          break;
        }

        case 'message.part.updated': {
          // properties: { part: Part, delta?: string }
          // Accumulates text for assistant messages; user message text is captured
          // directly in the chat.message hook (which has the complete parts array).
          const part = props.part;
          if (part?.type === 'text' && part.messageID) {
            const text = part.text || '';
            if (text) {
              messageTexts.set(part.messageID, text);
            }
          }
          break;
        }

        case 'message.updated': {
          // properties: { info: Message } where Message = UserMessage | AssistantMessage
          const msgInfo = props.info;
          if (!msgInfo?.sessionID) break;

          const sessionID = msgInfo.sessionID;
          const messageID = msgInfo.id;

          if (msgInfo.role === 'assistant') {
            // Assistant text comes from the accumulated messageTexts cache
            const text = messageID ? messageTexts.get(messageID) || '' : '';
            if (text) {
              // Strip tags at edge before storing or sending to worker
              const strippedAssistant = stripPrivateTags(text);
              if (strippedAssistant) {
                lastAssistantMessages.set(sessionID, strippedAssistant);
              }
            }
            const lastText = lastAssistantMessages.get(sessionID) || '';
            // Only send observation if text actually changed (dedup streaming updates)
            if (lastText && lastText !== lastSentAssistantText.get(sessionID)) {
              lastSentAssistantText.set(sessionID, lastText);
              const contentSessionId = await ensureSessionInitialized(sessionID);
              workerPostFireAndForget(workerPort, '/api/sessions/observations', {
                contentSessionId,
                tool_name: 'assistant_message',
                tool_input: {},
                tool_response: lastText.length > MAX_TOOL_RESPONSE_LENGTH
                  ? lastText.slice(0, MAX_TOOL_RESPONSE_LENGTH)
                  : lastText,
                cwd: ctx.directory,
              });
            }
          }
          // user role: handled by chat.message hook — nothing to do here

          // Always clean up the text cache entry to prevent memory leaks
          if (messageID) {
            messageTexts.delete(messageID);
          }
          break;
        }

        case 'file.edited': {
          // properties: { file: string } or { path: string } - no sessionID available
          const filePath = props.path || props.file || '';
          // Use the most recent active session, or a default
          const activeSessionID = sessionIds.keys().next().value || 'default';
          const contentSessionId = await ensureSessionInitialized(activeSessionID);

          workerPostFireAndForget(workerPort, '/api/sessions/observations', {
            contentSessionId,
            tool_name: 'file_edit',
            tool_input: { file: filePath },
            tool_response: `File edited: ${filePath}`,
            cwd: ctx.directory,
          });
          break;
        }

        case 'session.status': {
          // properties: { sessionID: string, status: { type: 'idle' | 'retry' | 'busy' } }
          // Replacement for deprecated session.idle — fires when session becomes idle
          const sessionID = props.sessionID;
          const statusType = props.status?.type;
          if (sessionID && statusType === 'idle' && initializedSessions.has(sessionID)) {
            const contentSessionId = getContentSessionId(sessionID);
            await workerPost(workerPort, '/api/sessions/summarize', {
              contentSessionId,
              last_assistant_message: lastAssistantMessages.get(sessionID) || '',
            });
          }
          break;
        }

        case 'session.idle': {
          // Deprecated — OpenCode fires session.status immediately before this.
          // We handle summarize in session.status to avoid calling it twice.
          break;
        }

        case 'session.deleted': {
          // properties: { info: Session } where Session.id is the session ID
          const sessionID = props.info?.id || 'default';
          if (initializedSessions.has(sessionID)) {
            const contentSessionId = getContentSessionId(sessionID);

            workerPostFireAndForget(workerPort, '/api/sessions/complete', {
              contentSessionId,
            });
          }

          // Clean up session tracking
          sessionIds.delete(sessionID);
          initializedSessions.delete(sessionID);
          lastAssistantMessages.delete(sessionID);
          lastSentAssistantText.delete(sessionID);
          lastUserPrompts.delete(sessionID);
          break;
        }
      }
    },

    // ================================================================
    // Session compaction hook: inject memory context into the compaction prompt
    // OpenCode calls this before generating a compaction summary, allowing plugins
    // to add extra context strings that get appended to the compaction prompt.
    // ================================================================
    'experimental.session.compacting': async (
      input: { sessionID: string },
      output: { context: string[]; prompt?: string },
    ) => {
      console.log('[claude-mem] experimental.session.compacting:', input.sessionID);
      const contextText = await workerGetText(
        workerPort,
        `/api/context/inject?projects=${encodeURIComponent(projectName)}`,
      );
      if (contextText && contextText.trim().length > 0) {
        output.context.push(`## claude-mem Memory Context\n\n${contextText}`);
      }
    },

    // ================================================================
    // Custom tool: memory search
    // ================================================================
    tool: {
      claude_mem_search: tool({
        description:
          'Search claude-mem memory database for past observations, decisions, and patterns. Scoped to current session by default; set session_id to "all" to search across all sessions.',
        args: {
          query: tool.schema.string().describe('Search query for memory lookup'),
          session_id: tool.schema.string().optional().describe('Session ID to scope search. Defaults to current session. Use "all" for cross-session search.'),
        },
        async execute(args) {
          const query = args.query;
          if (!query) return 'Please provide a search query.';

          const params = new URLSearchParams({
            query,
            limit: '10',
            project: projectName,
          });

          // Scope to current session by default (matches Claude Code behavior)
          const requestedSessionId = args.session_id;
          if (requestedSessionId && requestedSessionId !== 'all') {
            params.set('session_id', requestedSessionId);
          } else if (!requestedSessionId) {
            // Default: use the most recent active session
            const activeSessionID = sessionIds.keys().next().value;
            if (activeSessionID) {
              params.set('session_id', getContentSessionId(activeSessionID));
            }
          }
          // session_id === 'all': don't set session_id param, search all sessions

          const result = await workerGetText(
            workerPort,
            `/api/search/observations?${params.toString()}`,
          );

          if (!result) return 'Memory search unavailable. Is the claude-mem worker running?';
          return result;
        },
      }),
    },
  };

  return pluginReturn;
};

// Named export is required by OpenCode plugin loader
// Default export kept for backward compatibility
export default claudeMemPlugin;
