import type { PlatformAdapter, NormalizedHookInput, HookResult } from '../types.js';

// Maps OpenCode plugin input format to NormalizedHookInput.
// OpenCode uses: sessionID (camelCase), directory, tool, args, output
export const opencodeAdapter: PlatformAdapter = {
  normalizeInput(raw) {
    const r = (raw ?? {}) as any;
    return {
      sessionId: r.sessionID || r.session_id || r.id,
      cwd: r.directory || r.cwd || process.cwd(),
      prompt: r.prompt,
      toolName: r.tool || r.tool_name,
      toolInput: r.args || r.tool_input,
      toolResponse: r.output || r.tool_response,
      transcriptPath: undefined,
    };
  },
  formatOutput(result) {
    return { continue: result.continue ?? true };
  }
};
