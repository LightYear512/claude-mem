/**
 * L1: OpenCode Adapter Unit Tests
 *
 * Tests opencodeAdapter.normalizeInput / formatOutput and
 * getPlatformAdapter('opencode') routing.
 *
 * Pattern: tests/hook-lifecycle.test.ts (adapter tests)
 */
import { describe, it, expect } from 'bun:test';

import { opencodeAdapter } from '../../../src/cli/adapters/opencode.js';
import { getPlatformAdapter, rawAdapter } from '../../../src/cli/adapters/index.js';

// ============================================================================
// normalizeInput
// ============================================================================

describe('opencodeAdapter - normalizeInput', () => {
  it('maps sessionID (camelCase) to sessionId', () => {
    const input = opencodeAdapter.normalizeInput({ sessionID: 'oc-123' });
    expect(input.sessionId).toBe('oc-123');
  });

  it('falls back to session_id when sessionID absent', () => {
    const input = opencodeAdapter.normalizeInput({ session_id: 'snake-456' });
    expect(input.sessionId).toBe('snake-456');
  });

  it('falls back to id when both absent', () => {
    const input = opencodeAdapter.normalizeInput({ id: 'bare-789' });
    expect(input.sessionId).toBe('bare-789');
  });

  it('returns undefined when no id field', () => {
    const input = opencodeAdapter.normalizeInput({ cwd: '/tmp' });
    expect(input.sessionId).toBeUndefined();
  });

  it('maps directory to cwd', () => {
    const input = opencodeAdapter.normalizeInput({ directory: '/home/user/project' });
    expect(input.cwd).toBe('/home/user/project');
  });

  it('falls back to cwd field', () => {
    const input = opencodeAdapter.normalizeInput({ cwd: '/var/app' });
    expect(input.cwd).toBe('/var/app');
  });

  it('falls back to process.cwd()', () => {
    const input = opencodeAdapter.normalizeInput({});
    expect(input.cwd).toBe(process.cwd());
  });

  it('maps tool → toolName, args → toolInput, output → toolResponse', () => {
    const input = opencodeAdapter.normalizeInput({
      tool: 'Bash',
      args: { command: 'ls' },
      output: 'file1.txt\nfile2.txt',
    });
    expect(input.toolName).toBe('Bash');
    expect(input.toolInput).toEqual({ command: 'ls' });
    expect(input.toolResponse).toBe('file1.txt\nfile2.txt');
  });

  it('handles undefined input gracefully', () => {
    const input = opencodeAdapter.normalizeInput(undefined);
    expect(input.sessionId).toBeUndefined();
    expect(input.cwd).toBe(process.cwd());
  });

  it('handles null input gracefully', () => {
    const input = opencodeAdapter.normalizeInput(null);
    expect(input.sessionId).toBeUndefined();
    expect(input.cwd).toBe(process.cwd());
  });
});

// ============================================================================
// formatOutput
// ============================================================================

describe('opencodeAdapter - formatOutput', () => {
  it('returns { continue: true }', () => {
    const output = opencodeAdapter.formatOutput({ continue: true, exitCode: 0 });
    expect(output).toEqual({ continue: true });
  });

  it('defaults continue to true when not set', () => {
    const output = opencodeAdapter.formatOutput({ exitCode: 0 } as any);
    expect(output.continue).toBe(true);
  });
});

// ============================================================================
// getPlatformAdapter routing
// ============================================================================

describe('getPlatformAdapter("opencode")', () => {
  it('returns opencodeAdapter (not rawAdapter)', () => {
    const adapter = getPlatformAdapter('opencode');
    expect(adapter).toBe(opencodeAdapter);
    expect(adapter).not.toBe(rawAdapter);
  });
});
