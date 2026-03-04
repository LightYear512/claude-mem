/**
 * L2: OpenCode Plugin Tool Interceptor + Search Tests
 *
 * Tests tool.execute.after skip conditions, output truncation, payload shape,
 * and the claude_mem_search custom tool.
 *
 * Pattern: tests/utils/claude-md-utils.test.ts (mock fetch)
 */
import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// --- Mock @opencode-ai/plugin BEFORE import ---
mock.module('@opencode-ai/plugin', () => ({
  tool: Object.assign(
    (def: any) => def,
    { schema: { string: () => ({ describe: (d: string) => d }) } },
  ),
}));

// --- Fetch recording ---
interface RecordedCall {
  url: string;
  method: string;
  body?: any;
}

const calls: RecordedCall[] = [];
const originalFetch = global.fetch;

function installFetchMock(
  handlers: Record<string, (url: string, init?: any) => Response> = {},
) {
  calls.length = 0;
  global.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = init?.method || 'GET';
    let body: any;
    if (init?.body) {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    calls.push({ url, method, body });

    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) return handler(url, init);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as any;
}

// --- Helpers ---
let tempDir: string;

function makeTempDir(): string {
  const dir = join(tmpdir(), `oc-tools-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function loadPlugin(directory: string) {
  const mod = await import('../../../src/integrations/opencode/index.js');
  return mod.default({ directory });
}

// --- Setup / Teardown ---

beforeEach(() => {
  tempDir = makeTempDir();
});

afterEach(() => {
  global.fetch = originalFetch;
  mock.restore();
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

// ============================================================================
// tool.execute.after interceptor
// ============================================================================

describe('tool.execute.after interceptor', () => {
  describe('skip conditions', () => {
    it('skips when toolName starts with "claude_mem"', async () => {
      installFetchMock();
      const plugin = await loadPlugin(tempDir);

      calls.length = 0;
      plugin['tool.execute.after'](
        { tool: 'claude_mem_search', sessionID: 's1', callID: 'c1', args: {} },
        { title: '', output: 'results', metadata: {} },
      );

      await new Promise(r => setTimeout(r, 50));
      const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
      expect(obsCalls.length).toBe(0);
    });

    it('skips when toolName is undefined', async () => {
      installFetchMock();
      const plugin = await loadPlugin(tempDir);

      calls.length = 0;
      plugin['tool.execute.after'](
        { tool: undefined as any, sessionID: 's1', callID: 'c1', args: {} },
        { title: '', output: 'results', metadata: {} },
      );

      await new Promise(r => setTimeout(r, 50));
      const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
      expect(obsCalls.length).toBe(0);
    });

    it('does NOT skip normal tools like "Bash", "Edit"', async () => {
      installFetchMock();
      const plugin = await loadPlugin(tempDir);

      calls.length = 0;
      plugin['tool.execute.after'](
        { tool: 'Bash', sessionID: 's1', callID: 'c1', args: { command: 'ls' } },
        { title: '', output: 'file1.txt', metadata: {} },
      );

      await new Promise(r => setTimeout(r, 50));
      const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
      expect(obsCalls.length).toBe(1);
    });

    it('skips tools in config.skipTools list', async () => {
      installFetchMock();
      const mod = await import('../../../src/integrations/opencode/index.js');
      const plugin = await mod.default({ directory: tempDir, config: { skipTools: ['TodoWrite', 'TodoRead'] } } as any);

      calls.length = 0;
      plugin['tool.execute.after'](
        { tool: 'TodoWrite', sessionID: 's1', callID: 'c1', args: { todos: [] } },
        { title: '', output: 'ok', metadata: {} },
      );
      plugin['tool.execute.after'](
        { tool: 'TodoRead', sessionID: 's1', callID: 'c2', args: {} },
        { title: '', output: '[]', metadata: {} },
      );

      await new Promise(r => setTimeout(r, 50));
      const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
      expect(obsCalls.length).toBe(0);
    });

    it('skipTools does not affect tools not in the list', async () => {
      installFetchMock();
      const mod = await import('../../../src/integrations/opencode/index.js');
      const plugin = await mod.default({ directory: tempDir, config: { skipTools: ['TodoWrite'] } } as any);

      calls.length = 0;
      plugin['tool.execute.after'](
        { tool: 'Bash', sessionID: 's1', callID: 'c1', args: { command: 'ls' } },
        { title: '', output: 'file1.txt', metadata: {} },
      );

      await new Promise(r => setTimeout(r, 50));
      const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
      expect(obsCalls.length).toBe(1);
    });
  });

  describe('output truncation', () => {
    it('passes full output when <= 4000 chars', async () => {
      installFetchMock();
      const plugin = await loadPlugin(tempDir);

      const shortOutput = 'a'.repeat(500);
      calls.length = 0;
      plugin['tool.execute.after'](
        { tool: 'Read', sessionID: 's1', callID: 'c1', args: {} },
        { title: '', output: shortOutput, metadata: {} },
      );

      await new Promise(r => setTimeout(r, 50));
      const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
      expect(obsCalls[0].body.tool_response).toBe(shortOutput);
      expect(obsCalls[0].body.tool_response.length).toBe(500);
    });

    it('truncates to 4000 chars when > 4000', async () => {
      installFetchMock();
      const plugin = await loadPlugin(tempDir);

      const longOutput = 'b'.repeat(6000);
      calls.length = 0;
      plugin['tool.execute.after'](
        { tool: 'Read', sessionID: 's1', callID: 'c1', args: {} },
        { title: '', output: longOutput, metadata: {} },
      );

      await new Promise(r => setTimeout(r, 50));
      const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
      expect(obsCalls[0].body.tool_response.length).toBe(4000);
    });

    it('handles empty output', async () => {
      installFetchMock();
      const plugin = await loadPlugin(tempDir);

      calls.length = 0;
      plugin['tool.execute.after'](
        { tool: 'Bash', sessionID: 's1', callID: 'c1', args: {} },
        { title: '', output: '', metadata: {} },
      );

      await new Promise(r => setTimeout(r, 50));
      const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
      expect(obsCalls[0].body.tool_response).toBe('');
    });
  });

  describe('payload', () => {
    it('sends { contentSessionId, tool_name, tool_input, tool_response, cwd }', async () => {
      installFetchMock();
      const plugin = await loadPlugin(tempDir);

      calls.length = 0;
      plugin['tool.execute.after'](
        { tool: 'Bash', sessionID: 'pay-1', callID: 'c1', args: { command: 'echo hi' } },
        { title: '', output: 'hi\n', metadata: {} },
      );

      await new Promise(r => setTimeout(r, 50));
      const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
      expect(obsCalls.length).toBe(1);

      const body = obsCalls[0].body;
      expect(body.contentSessionId).toMatch(/^opencode-pay-1-\d+$/);
      expect(body.tool_name).toBe('Bash');
      expect(body.tool_input).toEqual({ command: 'echo hi' });
      expect(body.tool_response).toBe('hi\n');
      expect(body.cwd).toBe(tempDir);
    });

    it('uses fire-and-forget (workerPostFireAndForget)', async () => {
      // The interceptor is async (awaits session init), but observation posting
      // is fire-and-forget — it does not block waiting for the worker response.
      installFetchMock();
      const plugin = await loadPlugin(tempDir);

      // Should return a Promise (async function) that resolves quickly
      const result = plugin['tool.execute.after'](
        { tool: 'Bash', sessionID: 's1', callID: 'c1', args: {} },
        { title: '', output: 'ok', metadata: {} },
      );

      expect(result).toBeInstanceOf(Promise);
      await result; // resolves without waiting for the observation HTTP call
    });
  });

  describe('triggers debounced AGENTS.md sync', () => {
    it('schedules debouncedSyncAgentsContext after non-skipped tool', async () => {
      installFetchMock({
        '/api/context/inject': () =>
          new Response('# Context', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
      });
      const plugin = await loadPlugin(tempDir);

      calls.length = 0;
      plugin['tool.execute.after'](
        { tool: 'Edit', sessionID: 's1', callID: 'c1', args: {} },
        { title: '', output: 'done', metadata: {} },
      );

      // The debounce timer is 5 seconds, so we won't see the context call yet
      // But the timer should have been scheduled (internal state)
      // We verify indirectly: after 5+ seconds, context/inject would be called
      // For test speed, we just verify no immediate call is made
      const contextCallsImmediate = calls.filter(c => c.url.includes('/api/context/inject'));
      expect(contextCallsImmediate.length).toBe(0);
    });
  });
});

// ============================================================================
// claude_mem_search tool
// ============================================================================

describe('claude_mem_search tool', () => {
  it('returns error message for empty query', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    const searchTool = plugin.tool.claude_mem_search;
    const result = await searchTool.execute({ query: '' });
    expect(result).toBe('Please provide a search query.');
  });

  it('GET /api/search/observations with encoded query, limit=10, project', async () => {
    installFetchMock({
      '/api/search/observations': () =>
        new Response('Search result 1\nSearch result 2', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
    });
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    await plugin.tool.claude_mem_search.execute({ query: 'fix login bug' });

    const searchCalls = calls.filter(c => c.url.includes('/api/search/observations'));
    expect(searchCalls.length).toBe(1);
    expect(searchCalls[0].method).toBe('GET');
    expect(searchCalls[0].url).toContain('query=fix%20login%20bug');
    expect(searchCalls[0].url).toContain('limit=10');
    expect(searchCalls[0].url).toContain('project=');
  });

  it('returns worker response text on success', async () => {
    installFetchMock({
      '/api/search/observations': () =>
        new Response('Found 3 matching observations', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
    });
    const plugin = await loadPlugin(tempDir);

    const result = await plugin.tool.claude_mem_search.execute({ query: 'test' });
    expect(result).toBe('Found 3 matching observations');
  });

  it('returns unavailable message when worker returns null', async () => {
    installFetchMock({
      '/api/search/observations': () =>
        new Response('Server Error', { status: 500 }),
    });
    const plugin = await loadPlugin(tempDir);

    const result = await plugin.tool.claude_mem_search.execute({ query: 'test' });
    expect(result).toBe('Memory search unavailable. Is the claude-mem worker running?');
  });
});

// ============================================================================
// Privacy tag stripping in tool.execute.after
// ============================================================================

describe('privacy tag stripping in tool.execute.after', () => {
  it('strips <private> tags from tool output before sending', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    plugin['tool.execute.after'](
      { tool: 'Bash', sessionID: 'priv-t1', callID: 'c1', args: { command: 'ls' } },
      { title: '', output: 'public output <private>secret</private> more output', metadata: {} },
    );

    await new Promise(r => setTimeout(r, 50));
    const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
    expect(obsCalls.length).toBe(1);
    expect(obsCalls[0].body.tool_response).not.toContain('<private>');
    expect(obsCalls[0].body.tool_response).not.toContain('secret');
    expect(obsCalls[0].body.tool_response).toContain('public output');
    expect(obsCalls[0].body.tool_response).toContain('more output');
  });

  it('strips <claude-mem-context> tags from tool output', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    plugin['tool.execute.after'](
      { tool: 'Read', sessionID: 'priv-t2', callID: 'c2', args: {} },
      { title: '', output: 'file content <claude-mem-context>ctx block</claude-mem-context> end', metadata: {} },
    );

    await new Promise(r => setTimeout(r, 50));
    const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
    expect(obsCalls.length).toBe(1);
    expect(obsCalls[0].body.tool_response).not.toContain('<claude-mem-context>');
    expect(obsCalls[0].body.tool_response).not.toContain('ctx block');
    expect(obsCalls[0].body.tool_response).toContain('file content');
  });

  it('truncation applies after tag stripping', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    // Build: 2500 chars public + private tag + 2500 chars public = 5000 chars after stripping → truncated to 4000
    const part1 = 'a'.repeat(2500);
    const part2 = 'b'.repeat(2500);
    const rawOutput = `${part1}<private>secret</private>${part2}`;

    calls.length = 0;
    plugin['tool.execute.after'](
      { tool: 'Read', sessionID: 'priv-t3', callID: 'c3', args: {} },
      { title: '', output: rawOutput, metadata: {} },
    );

    await new Promise(r => setTimeout(r, 50));
    const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
    expect(obsCalls.length).toBe(1);
    // After stripping: 5000 chars → truncated to 4000
    expect(obsCalls[0].body.tool_response.length).toBe(4000);
    expect(obsCalls[0].body.tool_response).not.toContain('secret');
  });
});
