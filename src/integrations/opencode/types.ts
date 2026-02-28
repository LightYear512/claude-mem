/**
 * Minimal type declarations for the OpenCode Plugin SDK.
 * These match the real Plugin API provided by OpenCode at runtime.
 * See: https://opencode.ai/docs/plugins
 *
 * We inline types instead of depending on @opencode-ai/plugin
 * because OpenCode injects the SDK at runtime.
 */

// ============================================================================
// Plugin Input & Context
// ============================================================================

export interface PluginInput {
  /** OpenCode SDK client */
  client: unknown;
  /** Current project info */
  project: { name: string; root: string };
  /** Current working directory */
  directory: string;
  /** Git worktree path */
  worktree: string;
  /** Server URL */
  serverUrl: string;
  /** Bun shell API */
  $: unknown;
}

// ============================================================================
// Tool API
// ============================================================================

export interface ToolDefinition {
  description: string;
  args: Record<string, unknown>;
  execute: (args: Record<string, string>, context: ToolContext) => Promise<string>;
}

export interface ToolContext {
  sessionID: string;
  messageID: string;
  agent: string;
  directory: string;
  worktree: string;
  abort: AbortSignal;
  metadata: Record<string, unknown>;
  ask: (question: string) => Promise<string>;
}

// ============================================================================
// Interceptor Types (mutation hooks)
// ============================================================================

export interface ToolExecuteAfterInput {
  tool: string;
  sessionID: string;
  callID: string;
  args: Record<string, unknown>;
}

export interface ToolExecuteAfterOutput {
  title: string;
  output: string;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Bus Event Types (read-only)
// ============================================================================

export interface BusEvent {
  type: string;
  [key: string]: unknown;
}

export interface SessionCreatedEvent extends BusEvent {
  type: 'session.created';
  sessionID: string;
}

export interface SessionDeletedEvent extends BusEvent {
  type: 'session.deleted';
  sessionID: string;
}

export interface SessionCompactedEvent extends BusEvent {
  type: 'session.compacted';
  sessionID: string;
  messageCount?: number;
}

export interface MessageUpdatedEvent extends BusEvent {
  type: 'message.updated';
  sessionID: string;
  role: string;
  content: string;
}

// ============================================================================
// Plugin Return Type
// ============================================================================

export interface PluginReturn {
  tool?: Record<string, ToolDefinition>;
  event?: (event: BusEvent) => void | Promise<void>;
  'tool.execute.after'?: (
    input: ToolExecuteAfterInput,
    output: ToolExecuteAfterOutput
  ) => void | Promise<void>;
}

export type Plugin = (ctx: PluginInput) => Promise<PluginReturn>;

// ============================================================================
// Plugin Configuration
// ============================================================================

export interface ClaudeMemOpenCodeConfig {
  /** Project name for memory grouping (default: derived from git root) */
  project?: string;
  /** Worker HTTP port (default: 37777) */
  workerPort?: number;
  /** Whether to sync AGENTS.md with memory context (default: true) */
  syncAgentsMd?: boolean;
}
