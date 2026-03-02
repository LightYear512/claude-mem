/**
 * Supplementary type declarations for the OpenCode Plugin integration.
 *
 * Core types (Plugin, ToolDefinition, ToolContext) are imported from
 * @opencode-ai/plugin at runtime. This file only contains types that
 * the SDK does not export (interceptors, bus events, config).
 */

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
// Plugin Configuration
// ============================================================================

export interface ClaudeMemOpenCodeConfig {
  /** Project name for memory grouping (default: derived from git root) */
  project?: string;
  /** Worker HTTP port (default: 37777) */
  workerPort?: number;
  /** Whether to sync AGENTS.md with memory context (default: true) */
  syncAgentsMd?: boolean;
  /**
   * Tool names to skip when capturing observations.
   * Tools starting with "claude_mem" are always skipped (recursive prevention).
   * Example: ["TodoWrite", "TodoRead"]
   */
  skipTools?: string[];
}
