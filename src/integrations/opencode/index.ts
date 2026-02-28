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
import type {
  Plugin,
  PluginInput,
  PluginReturn,
  ToolExecuteAfterInput,
  ToolExecuteAfterOutput,
  BusEvent,
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

const claudeMemPlugin: Plugin = async (ctx: PluginInput) => {
  // Read config from OpenCode's plugin config system.
  // OpenCode passes config via the ctx object or environment.
  const config: ClaudeMemOpenCodeConfig = {};
  const workerPort = config.workerPort || DEFAULT_WORKER_PORT;
  const projectName = config.project || getProjectNameFromDir(ctx.directory);
  const syncAgentsMd = config.syncAgentsMd !== false;

  // ------------------------------------------------------------------
  // Session tracking
  // ------------------------------------------------------------------
  const sessionIds = new Map<string, string>();
  const lastAssistantMessages = new Map<string, string>();

  function getContentSessionId(sessionID: string): string {
    if (!sessionIds.has(sessionID)) {
      sessionIds.set(sessionID, `opencode-${sessionID}-${Date.now()}`);
    }
    return sessionIds.get(sessionID)!;
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
  const pluginReturn: PluginReturn = {
    // ================================================================
    // Tool interceptor: capture every tool execution
    // ================================================================
    'tool.execute.after': (
      input: ToolExecuteAfterInput,
      output: ToolExecuteAfterOutput,
    ) => {
      const toolName = input.tool;
      if (!toolName) return;

      // Skip claude-mem tools to prevent recursive observation loops
      if (toolName.startsWith('claude_mem')) return;

      const contentSessionId = getContentSessionId(input.sessionID);

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
    event: async (event: BusEvent) => {
      switch (event.type) {
        case 'session.created': {
          const sessionID = (event as any).sessionID || 'default';
          const contentSessionId = getContentSessionId(sessionID);
          await workerPost(workerPort, '/api/sessions/init', {
            contentSessionId,
            project: projectName,
            prompt: '',
          });
          // Sync context at session start
          await syncAgentsContext();
          break;
        }

        case 'session.compacted': {
          const sessionID = (event as any).sessionID || 'default';
          const contentSessionId = getContentSessionId(sessionID);
          // Re-initialize after compaction
          await workerPost(workerPort, '/api/sessions/init', {
            contentSessionId,
            project: projectName,
            prompt: '',
          });
          break;
        }

        case 'message.updated': {
          const sessionID = (event as any).sessionID || 'default';
          const role = (event as any).role;
          const content = (event as any).content;
          if (role === 'assistant' && typeof content === 'string') {
            lastAssistantMessages.set(sessionID, content);

            // Capture assistant messages as observations per upstream plan
            const contentSessionId = getContentSessionId(sessionID);
            workerPostFireAndForget(workerPort, '/api/sessions/observations', {
              contentSessionId,
              tool_name: 'assistant_message',
              tool_input: {},
              tool_response: content.length > MAX_TOOL_RESPONSE_LENGTH
                ? content.slice(0, MAX_TOOL_RESPONSE_LENGTH)
                : content,
              cwd: ctx.directory,
            });
          }
          break;
        }

        case 'file.edited': {
          const sessionID = (event as any).sessionID || 'default';
          const contentSessionId = getContentSessionId(sessionID);
          const filePath = (event as any).path || (event as any).file || '';

          workerPostFireAndForget(workerPort, '/api/sessions/observations', {
            contentSessionId,
            tool_name: 'file_edit',
            tool_input: { file: filePath },
            tool_response: `File edited: ${filePath}`,
            cwd: ctx.directory,
          });
          break;
        }

        case 'session.deleted': {
          const sessionID = (event as any).sessionID || 'default';
          const contentSessionId = getContentSessionId(sessionID);

          // Summarize then complete (await summarize so worker processes it first)
          await workerPost(workerPort, '/api/sessions/summarize', {
            contentSessionId,
            last_assistant_message: lastAssistantMessages.get(sessionID) || '',
          });

          workerPostFireAndForget(workerPort, '/api/sessions/complete', {
            contentSessionId,
          });

          // Clean up session tracking
          sessionIds.delete(sessionID);
          lastAssistantMessages.delete(sessionID);
          break;
        }
      }
    },

    // ================================================================
    // Custom tool: memory search
    // ================================================================
    tool: {
      claude_mem_search: {
        description:
          'Search claude-mem memory database for past observations, decisions, and patterns across all sessions.',
        args: {
          query: { type: 'string', description: 'Search query for memory lookup' },
        },
        async execute(args: Record<string, string>) {
          const query = args.query;
          if (!query) return 'Please provide a search query.';

          const result = await workerGetText(
            workerPort,
            `/api/search/observations?query=${encodeURIComponent(query)}&limit=10&project=${encodeURIComponent(projectName)}`,
          );

          if (!result) return 'Memory search unavailable. Is the claude-mem worker running?';
          return result;
        },
      },
    },
  };

  return pluginReturn;
};

export default claudeMemPlugin;
