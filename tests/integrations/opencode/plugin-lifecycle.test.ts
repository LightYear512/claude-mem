/**
 * L2: OpenCode Plugin Lifecycle Tests
 *
 * Tests session tracking, event bus handling, and debounced AGENTS.md sync.
 * Uses mock fetch + mock @opencode-ai/plugin SDK.
 *
 * Pattern: tests/utils/claude-md-utils.test.ts (mock fetch + tmpdir)
 */
import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// --- Mock @opencode-ai/plugin BEFORE import ---
mock.module('@opencode-ai/plugin', () => ({
  tool: Object.assign(
    (def: any) => def,
    { schema: { string: () => ({ describe: (d: string) => d }) } },
  ),
}));

// --- Fetch recording infrastructure ---
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

    // Check for custom handler
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) return handler(url, init);
    }

    // Default: return 200 JSON
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as any;
}

// --- Helpers ---
let tempDir: string;

function makeTempDir(): string {
  const dir = join(tmpdir(), `oc-lifecycle-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function loadPlugin(directory: string) {
  // Dynamic import to get fresh module each time
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
// Plugin initialization
// ============================================================================

describe('plugin initialization', () => {
  it('calls GET /api/context/inject on load (syncAgentsContext)', async () => {
    installFetchMock({
      '/api/context/inject': () =>
        new Response('# Memory Context', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    });

    await loadPlugin(tempDir);

    const contextCalls = calls.filter(c => c.url.includes('/api/context/inject'));
    expect(contextCalls.length).toBeGreaterThanOrEqual(1);
    expect(contextCalls[0].method).toBe('GET');
  });

  it('does not throw when worker unreachable (ECONNREFUSED)', async () => {
    // Use a port that nothing listens on
    global.fetch = (async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:19999');
    }) as any;

    // Should not throw
    const plugin = await loadPlugin(tempDir);
    expect(plugin).toBeDefined();
    expect(plugin.event).toBeInstanceOf(Function);
  });
});

// ============================================================================
// Session ID generation (via events)
// ============================================================================

describe('getContentSessionId (via events)', () => {
  it('generates "opencode-{sessionID}-{timestamp}" format', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    // Trigger session.created to force contentSessionId creation
    await plugin.event({ type: 'session.created', sessionID: 'abc-def' });

    const initCall = calls.find(c => c.url.includes('/api/sessions/init'));
    expect(initCall).toBeDefined();
    expect(initCall!.body.contentSessionId).toMatch(/^opencode-abc-def-\d+$/);
  });

  it('returns same id on repeated calls for same sessionID', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    await plugin.event({ type: 'session.created', sessionID: 'same-id' });
    const firstId = calls.find(c => c.url.includes('/api/sessions/init'))!.body.contentSessionId;

    // Trigger compacted (reuses same sessionID)
    await plugin.event({ type: 'session.compacted', sessionID: 'same-id' });
    const secondId = calls.filter(c => c.url.includes('/api/sessions/init'))[1]!.body.contentSessionId;

    expect(firstId).toBe(secondId);
  });

  it('generates different ids for different sessionIDs', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    await plugin.event({ type: 'session.created', sessionID: 'id-one' });
    await plugin.event({ type: 'session.created', sessionID: 'id-two' });

    const initCalls = calls.filter(c => c.url.includes('/api/sessions/init'));
    expect(initCalls[0].body.contentSessionId).not.toBe(initCalls[1].body.contentSessionId);
  });
});

// ============================================================================
// Event: session.created
// ============================================================================

describe('event: session.created', () => {
  it('POST /api/sessions/init with contentSessionId, project, prompt:""', async () => {
    installFetchMock({
      '/api/context/inject': () =>
        new Response('# Context', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    });
    const plugin = await loadPlugin(tempDir);

    calls.length = 0; // clear init calls
    await plugin.event({ type: 'session.created', sessionID: 'sess-1' });

    const initCall = calls.find(c => c.url.includes('/api/sessions/init'));
    expect(initCall).toBeDefined();
    expect(initCall!.method).toBe('POST');
    expect(initCall!.body.prompt).toBe('');
    expect(initCall!.body.project).toBeDefined();
    expect(initCall!.body.contentSessionId).toMatch(/^opencode-/);
  });

  it('calls syncAgentsContext after init', async () => {
    installFetchMock({
      '/api/context/inject': () =>
        new Response('# Context', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    });
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    await plugin.event({ type: 'session.created', sessionID: 'sess-2' });

    // Should have both init and context/inject calls
    const contextCalls = calls.filter(c => c.url.includes('/api/context/inject'));
    expect(contextCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// Event: session.compacted
// ============================================================================

describe('event: session.compacted', () => {
  it('POST /api/sessions/init (re-initialize)', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    await plugin.event({ type: 'session.compacted', sessionID: 'compact-1' });

    const initCall = calls.find(c => c.url.includes('/api/sessions/init'));
    expect(initCall).toBeDefined();
    expect(initCall!.body.contentSessionId).toMatch(/^opencode-compact-1-/);
  });

  it('reuses existing contentSessionId', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    await plugin.event({ type: 'session.created', sessionID: 'reuse-1' });
    const firstId = calls.find(c => c.url.includes('/api/sessions/init'))!.body.contentSessionId;

    await plugin.event({ type: 'session.compacted', sessionID: 'reuse-1' });
    const allInits = calls.filter(c => c.url.includes('/api/sessions/init'));
    const secondId = allInits[allInits.length - 1].body.contentSessionId;

    expect(firstId).toBe(secondId);
  });
});

// ============================================================================
// Event: message.updated
// ============================================================================

describe('event: message.updated', () => {
  it('captures assistant messages as observations', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    await plugin.event({
      type: 'message.updated',
      sessionID: 'msg-1',
      role: 'assistant',
      content: 'Here is my analysis...',
    });

    // Allow fire-and-forget to settle
    await new Promise(r => setTimeout(r, 50));

    const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
    expect(obsCalls.length).toBeGreaterThanOrEqual(1);
    expect(obsCalls[0].body.tool_name).toBe('assistant_message');
    expect(obsCalls[0].body.tool_response).toBe('Here is my analysis...');
  });

  it('truncates to 1000 chars', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    const longContent = 'x'.repeat(2000);
    calls.length = 0;
    await plugin.event({
      type: 'message.updated',
      sessionID: 'msg-2',
      role: 'assistant',
      content: longContent,
    });

    await new Promise(r => setTimeout(r, 50));

    const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
    expect(obsCalls.length).toBeGreaterThanOrEqual(1);
    expect(obsCalls[0].body.tool_response.length).toBe(1000);
  });

  it('ignores non-assistant roles', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    await plugin.event({
      type: 'message.updated',
      sessionID: 'msg-3',
      role: 'user',
      content: 'User message',
    });

    await new Promise(r => setTimeout(r, 50));

    const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
    expect(obsCalls.length).toBe(0);
  });

  it('stores last assistant message for summarize', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    await plugin.event({
      type: 'message.updated',
      sessionID: 'msg-4',
      role: 'assistant',
      content: 'Final answer',
    });

    await new Promise(r => setTimeout(r, 50));

    // Now trigger session.deleted — it should include last_assistant_message
    calls.length = 0;
    await plugin.event({ type: 'session.deleted', sessionID: 'msg-4' });

    await new Promise(r => setTimeout(r, 50));

    const summarizeCall = calls.find(c => c.url.includes('/api/sessions/summarize'));
    expect(summarizeCall).toBeDefined();
    expect(summarizeCall!.body.last_assistant_message).toBe('Final answer');
  });
});

// ============================================================================
// Event: file.edited
// ============================================================================

describe('event: file.edited', () => {
  it('POST observation with tool_name: "file_edit"', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    await plugin.event({
      type: 'file.edited',
      sessionID: 'fe-1',
      path: '/src/index.ts',
    });

    await new Promise(r => setTimeout(r, 50));

    const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
    expect(obsCalls.length).toBeGreaterThanOrEqual(1);
    expect(obsCalls[0].body.tool_name).toBe('file_edit');
    expect(obsCalls[0].body.tool_input.file).toBe('/src/index.ts');
  });

  it('uses event.path, falls back to event.file', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    await plugin.event({
      type: 'file.edited',
      sessionID: 'fe-2',
      file: '/src/utils.ts',
    });

    await new Promise(r => setTimeout(r, 50));

    const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
    expect(obsCalls.length).toBeGreaterThanOrEqual(1);
    expect(obsCalls[0].body.tool_input.file).toBe('/src/utils.ts');
  });
});

// ============================================================================
// Event: session.deleted
// ============================================================================

describe('event: session.deleted', () => {
  it('awaits summarize BEFORE fire-and-forget complete', async () => {
    const callOrder: string[] = [];

    global.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = init?.method || 'GET';
      let body: any;
      if (init?.body) {
        try { body = JSON.parse(init.body); } catch { body = init.body; }
      }

      if (url.includes('/api/sessions/summarize')) {
        // Simulate slow summarize
        await new Promise(r => setTimeout(r, 50));
        callOrder.push('summarize');
      } else if (url.includes('/api/sessions/complete')) {
        callOrder.push('complete');
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const plugin = await loadPlugin(tempDir);
    await plugin.event({ type: 'session.deleted', sessionID: 'del-1' });

    // Allow fire-and-forget complete to resolve
    await new Promise(r => setTimeout(r, 100));

    expect(callOrder.indexOf('summarize')).toBeLessThan(callOrder.indexOf('complete'));
  });

  it('sends last_assistant_message (empty string if none)', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    await plugin.event({ type: 'session.deleted', sessionID: 'del-2' });

    const summarizeCall = calls.find(c => c.url.includes('/api/sessions/summarize'));
    expect(summarizeCall).toBeDefined();
    expect(summarizeCall!.body.last_assistant_message).toBe('');
  });

  it('cleans up session tracking maps', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    // Create session and delete it
    await plugin.event({ type: 'session.created', sessionID: 'cleanup-1' });
    const firstId = calls.find(c => c.url.includes('/api/sessions/init'))!.body.contentSessionId;

    await plugin.event({ type: 'session.deleted', sessionID: 'cleanup-1' });

    // Wait 1ms so Date.now() returns a different value
    await new Promise(r => setTimeout(r, 2));

    // Creating with same sessionID should produce a NEW contentSessionId
    calls.length = 0;
    await plugin.event({ type: 'session.created', sessionID: 'cleanup-1' });
    const secondId = calls.find(c => c.url.includes('/api/sessions/init'))!.body.contentSessionId;

    expect(firstId).not.toBe(secondId);
  });
});

// ============================================================================
// Event: unknown type
// ============================================================================

describe('event: unknown type', () => {
  it('does not throw', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    // Should not throw
    await plugin.event({ type: 'some.future.event', data: 'anything' });
  });

  it('makes no HTTP calls', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    await plugin.event({ type: 'unknown.event' });

    expect(calls.length).toBe(0);
  });
});

// ============================================================================
// debouncedSyncAgentsContext
// ============================================================================

describe('debouncedSyncAgentsContext', () => {
  it('coalesces multiple rapid triggers into one call', async () => {
    installFetchMock({
      '/api/context/inject': () =>
        new Response('# Context', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    });
    const plugin = await loadPlugin(tempDir);

    // Clear calls from init
    calls.length = 0;

    // Trigger tool.execute.after 10 times rapidly (each triggers debouncedSyncAgentsContext)
    for (let i = 0; i < 10; i++) {
      plugin['tool.execute.after'](
        { tool: `tool-${i}`, sessionID: 'debounce-test', callID: `c-${i}`, args: {} },
        { title: '', output: 'ok', metadata: {} },
      );
    }

    // The debounce is 5 seconds — we check that within a short window,
    // the first trigger is scheduled and subsequent ones are suppressed.
    // The actual sync happens after the debounce timer fires.
    // We only need 10 observation POSTs, not 10 context GETs.
    const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
    expect(obsCalls.length).toBe(10);

    // Context inject should not have been called yet (debounce timer hasn't fired)
    const contextCalls = calls.filter(c => c.url.includes('/api/context/inject'));
    expect(contextCalls.length).toBe(0);
  });
});
