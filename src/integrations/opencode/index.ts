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
import { join, basename, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { type Plugin, tool } from '@opencode-ai/plugin';
import type { Event } from '@opencode-ai/sdk';
import type {
  ClaudeMemOpenCodeConfig,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_WORKER_PORT = 37777;
const MAX_TOOL_RESPONSE_LENGTH = 1000;

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
    return basename(dirname(directory)) + '/' + basename(directory);
  } catch {
    return basename(directory) || 'opencode';
  }
}

// ============================================================================
// Plugin Entry Point
// ============================================================================

export const claudeMemPlugin: Plugin = async (ctx) => {
  console.log('[claude-mem] Plugin initializing', { directory: ctx.directory });

  // Read config from OpenCode's plugin config system.
  // OpenCode passes config via the ctx object or environment.
  const config: ClaudeMemOpenCodeConfig = {};
  const workerPort = config.workerPort || DEFAULT_WORKER_PORT;
  const projectName = config.project || getProjectNameFromDir(ctx.directory);
  const syncAgentsMd = config.syncAgentsMd !== false;
  console.log('[claude-mem] Config:', { workerPort, projectName, syncAgentsMd });

  // ------------------------------------------------------------------
  // Session tracking
  // ------------------------------------------------------------------
  // Maps OpenCode sessionID → claude-mem contentSessionId
  const sessionIds = new Map<string, string>();
  // Tracks which sessions have been initialized with the worker
  const initializedSessions = new Set<string>();
  const lastAssistantMessages = new Map<string, string>();

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
  async function ensureSessionInitialized(sessionID: string): Promise<string> {
    const contentSessionId = getContentSessionId(sessionID);
    if (!initializedSessions.has(sessionID)) {
      initializedSessions.add(sessionID);
      await workerPost(workerPort, '/api/sessions/init', {
        contentSessionId,
        project: projectName,
        prompt: '',
      });
      // Sync context at session start
      await syncAgentsContext();
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
    // Tool interceptor: capture every tool execution
    // ================================================================
    'tool.execute.after': async (
      input: { tool: string; sessionID: string; callID: string; args: any },
      output: { title: string; output: string; metadata: any },
    ) => {
      console.log('[claude-mem] tool.execute.after:', input.tool, input.sessionID);
      const toolName = input.tool;
      if (!toolName) return;

      // Skip claude-mem tools to prevent recursive observation loops
      if (toolName.startsWith('claude_mem')) return;

      // Lazily initialize session on first tool use
      const contentSessionId = await ensureSessionInitialized(input.sessionID);

      // Truncate long tool output
      let toolResponse = output.output || '';
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
        // OpenCode fires session.updated (NOT session.created) for session lifecycle
        case 'session.updated': {
          // properties: { info: Session } where Session.id is the session ID
          const sessionID = props.info?.id;
          if (sessionID) {
            await ensureSessionInitialized(sessionID);
          }
          break;
        }

        case 'session.compacted': {
          // properties: { sessionID: string }
          const sessionID = props.sessionID || 'default';
          const contentSessionId = getContentSessionId(sessionID);
          // Re-initialize after compaction
          initializedSessions.delete(sessionID);
          await ensureSessionInitialized(sessionID);
          break;
        }

        case 'message.part.updated': {
          // properties: { part: Part, delta?: string }
          // Part has: sessionID, messageID, type, text (for TextPart)
          const part = props.part;
          if (part?.type === 'text' && part.sessionID) {
            const sessionID = part.sessionID;
            const text = part.text || '';
            if (text) {
              lastAssistantMessages.set(sessionID, text);
            }
          }
          break;
        }

        case 'message.updated': {
          // properties: { info: Message } where Message = UserMessage | AssistantMessage
          // Message has sessionID, role, but NOT content (content is in Parts)
          const msgInfo = props.info;
          if (msgInfo?.role === 'assistant' && msgInfo.sessionID) {
            const sessionID = msgInfo.sessionID;
            const contentSessionId = await ensureSessionInitialized(sessionID);
            // Use stored text from message.part.updated events
            const lastText = lastAssistantMessages.get(sessionID) || '';
            if (lastText) {
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
          break;
        }

        case 'file.edited': {
          // properties: { file: string } - no sessionID available
          const filePath = props.file || '';
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

        case 'session.idle': {
          // properties: { sessionID: string }
          // Fired when session finishes processing - good time to summarize
          const sessionID = props.sessionID;
          if (sessionID && initializedSessions.has(sessionID)) {
            const contentSessionId = getContentSessionId(sessionID);
            await workerPost(workerPort, '/api/sessions/summarize', {
              contentSessionId,
              last_assistant_message: lastAssistantMessages.get(sessionID) || '',
            });
          }
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
          break;
        }
      }
    },

    // ================================================================
    // Custom tool: memory search
    // ================================================================
    tool: {
      claude_mem_search: tool({
        description:
          'Search claude-mem memory database for past observations, decisions, and patterns across all sessions.',
        args: {
          query: tool.schema.string().describe('Search query for memory lookup'),
        },
        async execute(args) {
          const query = args.query;
          if (!query) return 'Please provide a search query.';

          const result = await workerGetText(
            workerPort,
            `/api/search/observations?query=${encodeURIComponent(query)}&limit=10&project=${encodeURIComponent(projectName)}`,
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
