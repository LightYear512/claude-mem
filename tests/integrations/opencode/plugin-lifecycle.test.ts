/**
 * L2: OpenCode Plugin Lifecycle Tests
 *
 * Tests session tracking, event bus handling, and debounced AGENTS.md sync.
 * Uses mock fetch + mock @opencode-ai/plugin SDK.
 *
 * Event format: plugin.event({ event: { type: '...', properties: { ... } } })
 * - session.updated:       properties.info.id        (session ID)
 * - session.compacted:     properties.sessionID
 * - session.idle:          properties.sessionID      (deprecated, still fires)
 * - session.status:        properties.{ sessionID, status.type: 'idle'|'busy'|'retry' }
 * - session.deleted:       properties.info.id
 * - message.part.updated:  properties.part.{ type, sessionID, messageID, text }
 * - message.updated:       properties.info.{ id, sessionID, role }
 * - file.edited:           properties.file (official schema) | properties.path (fallback)
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

// Helper: trigger user message via chat.message hook (mirrors real OpenCode execution)
async function triggerUserMessage(plugin: any, sessionID: string, messageID: string, text: string) {
  await plugin['chat.message'](
    { sessionID, messageID },
    { message: { id: messageID, sessionID, role: 'user' }, parts: [{ type: 'text', text, synthetic: false }] },
  );
}

describe('getContentSessionId (via events)', () => {
  it('generates "opencode-{sessionID}-{timestamp}" format', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    // Session is lazily initialized on first user message
    await triggerUserMessage(plugin, 'abc-def', 'mid-1', 'hello');

    const initCall = calls.find(c => c.url.includes('/api/sessions/init'));
    expect(initCall).toBeDefined();
    expect(initCall!.body.contentSessionId).toMatch(/^opencode-abc-def-\d+$/);
  });

  it('returns same contentSessionId for same sessionID across messages', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    await triggerUserMessage(plugin, 'same-id', 'mid-1', 'first');
    const firstId = calls.filter(c => c.url.includes('/api/sessions/init'))[0]!.body.contentSessionId;

    await triggerUserMessage(plugin, 'same-id', 'mid-2', 'second');
    const secondId = calls.filter(c => c.url.includes('/api/sessions/init'))[1]!.body.contentSessionId;

    expect(firstId).toBe(secondId);
  });

  it('generates different ids for different sessionIDs', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    await triggerUserMessage(plugin, 'id-one', 'mid-1', 'hello');
    await triggerUserMessage(plugin, 'id-two', 'mid-2', 'hello');

    const initCalls = calls.filter(c => c.url.includes('/api/sessions/init'));
    expect(initCalls[0].body.contentSessionId).not.toBe(initCalls[1].body.contentSessionId);
  });
});

// ============================================================================
// Event: session.updated
// Does NOT trigger init — session is lazily initialized on first tool/user message
// ============================================================================

describe('event: session.updated', () => {
  it('does NOT call /api/sessions/init (lazy init strategy)', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    await plugin.event({ event: { type: 'session.updated', properties: { info: { id: 'sess-1' } } } });

    const initCalls = calls.filter(c => c.url.includes('/api/sessions/init'));
    expect(initCalls.length).toBe(0);
  });

  it('does not throw', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    // Should not throw even though no init is made
    await plugin.event({ event: { type: 'session.updated', properties: { info: { id: 'sess-2' } } } });
    expect(true).toBe(true);
  });
});

// ============================================================================
// Event: session.compacted
// ============================================================================

describe('event: session.compacted', () => {
  it('clears initialized flag (next user message will re-init with real prompt)', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    // Initialize via user message first
    await triggerUserMessage(plugin, 'compact-1', 'mid-c1', 'hello');
    const initsBefore = calls.filter(c => c.url.includes('/api/sessions/init')).length;
    expect(initsBefore).toBeGreaterThanOrEqual(1);

    // Compaction clears the flag — no new init yet
    calls.length = 0;
    await plugin.event({ event: { type: 'session.compacted', properties: { sessionID: 'compact-1' } } });
    expect(calls.filter(c => c.url.includes('/api/sessions/init')).length).toBe(0);

    // Next user message triggers re-init with a real prompt
    await triggerUserMessage(plugin, 'compact-1', 'mid-c2', 'new prompt');
    const reinitCall = calls.find(c => c.url.includes('/api/sessions/init'));
    expect(reinitCall).toBeDefined();
    expect(reinitCall!.body.prompt).toBe('new prompt');
  });

  it('reuses existing contentSessionId after compaction', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    // Initialize via user message
    await triggerUserMessage(plugin, 'reuse-1', 'mid-r1', 'hi');
    const firstId = calls.find(c => c.url.includes('/api/sessions/init'))!.body.contentSessionId;

    // After compaction + new message
    await plugin.event({ event: { type: 'session.compacted', properties: { sessionID: 'reuse-1' } } });
    calls.length = 0;
    await triggerUserMessage(plugin, 'reuse-1', 'mid-r2', 'hi again');
    const secondId = calls.find(c => c.url.includes('/api/sessions/init'))!.body.contentSessionId;

    expect(firstId).toBe(secondId);
  });
});

// ============================================================================
// Event: message.updated
// Content arrives via message.part.updated first, then message.updated fires.
// ============================================================================

describe('event: message.updated', () => {
  it('captures assistant messages as observations', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    // Step 1: part update delivers the text content
    await plugin.event({ event: { type: 'message.part.updated', properties: { part: { type: 'text', sessionID: 'msg-1', messageID: 'mid-1', text: 'Here is my analysis...' } } } });
    // Step 2: message.updated indicates role and message completion
    await plugin.event({ event: { type: 'message.updated', properties: { info: { id: 'mid-1', sessionID: 'msg-1', role: 'assistant' } } } });

    // Allow fire-and-forget to settle
    await new Promise(r => setTimeout(r, 50));

    const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
    expect(obsCalls.length).toBeGreaterThanOrEqual(1);
    const assistantObs = obsCalls.find(c => c.body.tool_name === 'assistant_message');
    expect(assistantObs).toBeDefined();
    expect(assistantObs!.body.tool_response).toBe('Here is my analysis...');
  });

  it('truncates to 4000 chars', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    const longContent = 'x'.repeat(6000);
    calls.length = 0;
    await plugin.event({ event: { type: 'message.part.updated', properties: { part: { type: 'text', sessionID: 'msg-2', messageID: 'mid-2', text: longContent } } } });
    await plugin.event({ event: { type: 'message.updated', properties: { info: { id: 'mid-2', sessionID: 'msg-2', role: 'assistant' } } } });

    await new Promise(r => setTimeout(r, 50));

    const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
    expect(obsCalls.length).toBeGreaterThanOrEqual(1);
    const assistantObs = obsCalls.find(c => c.body.tool_name === 'assistant_message');
    expect(assistantObs!.body.tool_response.length).toBe(4000);
  });

  it('chat.message hook captures user messages as session prompts (not observations)', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;

    // chat.message fires once with complete parts — deterministic, no two-phase dance
    await plugin['chat.message'](
      { sessionID: 'msg-3', messageID: 'mid-3' },
      { message: { id: 'mid-3', sessionID: 'msg-3', role: 'user' }, parts: [{ type: 'text', text: 'User message', synthetic: false }] },
    );

    const initCalls = calls.filter(c => c.url.includes('/api/sessions/init'));
    expect(initCalls.length).toBe(1); // exactly one init, with real text
    expect(initCalls[0].body.prompt).toBe('User message');

    // No assistant_message observation for user messages
    await new Promise(r => setTimeout(r, 50));
    const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
    expect(obsCalls.filter(c => c.body.tool_name === 'assistant_message').length).toBe(0);
  });

  it('chat.message on subsequent turns calls init again (prompt counter increments)', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    await plugin['chat.message'](
      { sessionID: 'msg-multi', messageID: 'mid-1' },
      { message: { id: 'mid-1', sessionID: 'msg-multi', role: 'user' }, parts: [{ type: 'text', text: 'first turn', synthetic: false }] },
    );
    await plugin['chat.message'](
      { sessionID: 'msg-multi', messageID: 'mid-2' },
      { message: { id: 'mid-2', sessionID: 'msg-multi', role: 'user' }, parts: [{ type: 'text', text: 'second turn', synthetic: false }] },
    );

    const initCalls = calls.filter(c => c.url.includes('/api/sessions/init'));
    expect(initCalls.length).toBe(2);
    expect(initCalls[0].body.prompt).toBe('first turn');
    expect(initCalls[1].body.prompt).toBe('second turn');
  });

  it('message.updated (user role) is a noop — session already initialized by chat.message', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    // First initialize via chat.message
    await triggerUserMessage(plugin, 'msg-noop', 'mid-n1', 'hello');
    const initsBefore = calls.filter(c => c.url.includes('/api/sessions/init')).length;

    // message.updated with user role should not trigger additional init calls
    calls.length = 0;
    await plugin.event({ event: { type: 'message.updated', properties: { info: { id: 'mid-n1', sessionID: 'msg-noop', role: 'user' } } } });
    expect(calls.filter(c => c.url.includes('/api/sessions/init')).length).toBe(0);
  });

  it('stores last assistant message for summarize (via session.status idle)', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    // Send assistant message
    await plugin.event({ event: { type: 'message.part.updated', properties: { part: { type: 'text', sessionID: 'msg-4', messageID: 'mid-4', text: 'Final answer' } } } });
    await plugin.event({ event: { type: 'message.updated', properties: { info: { id: 'mid-4', sessionID: 'msg-4', role: 'assistant' } } } });

    await new Promise(r => setTimeout(r, 50));

    // Trigger session.status idle — it should read last_assistant_message and summarize
    calls.length = 0;
    await plugin.event({ event: { type: 'session.status', properties: { sessionID: 'msg-4', status: { type: 'idle' } } } });

    const summarizeCall = calls.find(c => c.url.includes('/api/sessions/summarize'));
    expect(summarizeCall).toBeDefined();
    expect(summarizeCall!.body.last_assistant_message).toBe('Final answer');
  });

  it('session.idle (deprecated) does NOT trigger summarize (avoids double call)', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    // Send assistant message and initialize session
    await triggerUserMessage(plugin, 'msg-idle-noop', 'mid-idle', 'hello');
    await plugin.event({ event: { type: 'message.part.updated', properties: { part: { type: 'text', sessionID: 'msg-idle-noop', messageID: 'mid-idle-a', text: 'response' } } } });
    await plugin.event({ event: { type: 'message.updated', properties: { info: { id: 'mid-idle-a', sessionID: 'msg-idle-noop', role: 'assistant' } } } });

    calls.length = 0;
    // session.idle alone should NOT call summarize (only session.status triggers it)
    await plugin.event({ event: { type: 'session.idle', properties: { sessionID: 'msg-idle-noop' } } });

    const summarizeCalls = calls.filter(c => c.url.includes('/api/sessions/summarize'));
    expect(summarizeCalls.length).toBe(0);
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
    await plugin.event({ event: { type: 'file.edited', properties: { path: '/src/index.ts' } } });

    await new Promise(r => setTimeout(r, 50));

    const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
    expect(obsCalls.length).toBeGreaterThanOrEqual(1);
    expect(obsCalls[0].body.tool_name).toBe('file_edit');
    expect(obsCalls[0].body.tool_input.file).toBe('/src/index.ts');
  });

  it('uses properties.path, falls back to properties.file', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    await plugin.event({ event: { type: 'file.edited', properties: { file: '/src/utils.ts' } } });

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
  it('summarize (via session.status idle) happens before complete (via session.deleted)', async () => {
    const callOrder: string[] = [];

    global.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;

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

    // Initialize session via user message (lazy init)
    await triggerUserMessage(plugin, 'del-1', 'mid-d1', 'start');

    // session.status idle awaits summarize before returning
    await plugin.event({ event: { type: 'session.status', properties: { sessionID: 'del-1', status: { type: 'idle' } } } });

    // session.deleted fire-and-forgets complete
    await plugin.event({ event: { type: 'session.deleted', properties: { info: { id: 'del-1' } } } });

    // Allow fire-and-forget complete to resolve
    await new Promise(r => setTimeout(r, 100));

    expect(callOrder.indexOf('summarize')).toBeLessThan(callOrder.indexOf('complete'));
  });

  it('sends last_assistant_message (empty string if none) via session.status idle', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    // Initialize session via user message (lazy init)
    await triggerUserMessage(plugin, 'del-2', 'mid-d2', 'start');

    calls.length = 0;
    await plugin.event({ event: { type: 'session.status', properties: { sessionID: 'del-2', status: { type: 'idle' } } } });

    const summarizeCall = calls.find(c => c.url.includes('/api/sessions/summarize'));
    expect(summarizeCall).toBeDefined();
    expect(summarizeCall!.body.last_assistant_message).toBe('');
  });

  it('cleans up session tracking maps', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    // Create session via user message and delete it
    await triggerUserMessage(plugin, 'cleanup-1', 'mid-cl1', 'hello');
    const firstId = calls.find(c => c.url.includes('/api/sessions/init'))!.body.contentSessionId;

    await plugin.event({ event: { type: 'session.deleted', properties: { info: { id: 'cleanup-1' } } } });

    // Wait 2ms so Date.now() returns a different value
    await new Promise(r => setTimeout(r, 2));

    // Re-creating with same sessionID after deletion should produce a NEW contentSessionId
    calls.length = 0;
    await triggerUserMessage(plugin, 'cleanup-1', 'mid-cl2', 'hello again');
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
    await plugin.event({ event: { type: 'some.future.event', properties: { data: 'anything' } } });
  });

  it('makes no HTTP calls', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    await plugin.event({ event: { type: 'unknown.event', properties: {} } });

    expect(calls.length).toBe(0);
  });
});

// ============================================================================
// debouncedSyncAgentsContext
// ============================================================================

describe('debouncedSyncAgentsContext', () => {
  it('coalesces multiple rapid triggers into one call (session.status idle triggers summary after debounce)', async () => {
    installFetchMock({
      '/api/context/inject': () =>
        new Response('# Context', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    });
    const plugin = await loadPlugin(tempDir);

    // Pre-initialize the session via user message so the first tool call doesn't
    // trigger syncAgentsContext (which happens during first-time session init)
    await triggerUserMessage(plugin, 'debounce-test', 'mid-db', 'start');

    // Clear all calls from plugin init and session init (including context inject)
    calls.length = 0;

    // Trigger tool.execute.after 10 times rapidly (each triggers debouncedSyncAgentsContext)
    const toolPromises = [];
    for (let i = 0; i < 10; i++) {
      toolPromises.push(
        plugin['tool.execute.after'](
          { tool: `tool-${i}`, sessionID: 'debounce-test', callID: `c-${i}`, args: {} },
          { title: '', output: 'ok', metadata: {} },
        ),
      );
    }
    await Promise.all(toolPromises);

    // Wait for fire-and-forget observations to settle
    await new Promise(r => setTimeout(r, 200));

    // All 10 observation POSTs should have been made
    const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations'));
    expect(obsCalls.length).toBe(10);

    // Context inject should not have been called yet (debounce timer hasn't fired)
    const contextCalls = calls.filter(c => c.url.includes('/api/context/inject'));
    expect(contextCalls.length).toBe(0);
  });
});

// ============================================================================
// Event: session.status (replacement for deprecated session.idle)
// ============================================================================

describe('event: session.status', () => {
  it('triggers summarize when status.type === "idle" and session is initialized', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    // Initialize session via user message
    await triggerUserMessage(plugin, 'status-1', 'mid-s1', 'hello');

    // Send assistant message so last_assistant_message is set
    await plugin.event({ event: { type: 'message.part.updated', properties: { part: { type: 'text', sessionID: 'status-1', messageID: 'mid-s1-a', text: 'Done!' } } } });
    await plugin.event({ event: { type: 'message.updated', properties: { info: { id: 'mid-s1-a', sessionID: 'status-1', role: 'assistant' } } } });

    calls.length = 0;
    await plugin.event({ event: { type: 'session.status', properties: { sessionID: 'status-1', status: { type: 'idle' } } } });

    const summarizeCall = calls.find(c => c.url.includes('/api/sessions/summarize'));
    expect(summarizeCall).toBeDefined();
    expect(summarizeCall!.body.last_assistant_message).toBe('Done!');
  });

  it('does NOT trigger summarize when status.type !== "idle"', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    await triggerUserMessage(plugin, 'status-2', 'mid-s2', 'hello');

    calls.length = 0;
    await plugin.event({ event: { type: 'session.status', properties: { sessionID: 'status-2', status: { type: 'busy' } } } });
    await plugin.event({ event: { type: 'session.status', properties: { sessionID: 'status-2', status: { type: 'retry', attempt: 1, message: 'rate limit', next: 2000 } } } });

    const summarizeCalls = calls.filter(c => c.url.includes('/api/sessions/summarize'));
    expect(summarizeCalls.length).toBe(0);
  });

  it('does NOT trigger summarize when session is not initialized', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    // Uninitialized session — should be a no-op
    await plugin.event({ event: { type: 'session.status', properties: { sessionID: 'never-inited', status: { type: 'idle' } } } });

    const summarizeCalls = calls.filter(c => c.url.includes('/api/sessions/summarize'));
    expect(summarizeCalls.length).toBe(0);
  });
});

// ============================================================================
// Hook: experimental.session.compacting
// ============================================================================

describe('experimental.session.compacting hook', () => {
  it('injects memory context into output.context array', async () => {
    installFetchMock({
      '/api/context/inject': () =>
        new Response('## Memory\nPast decisions here', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    });
    const plugin = await loadPlugin(tempDir);

    const output = { context: [] as string[], prompt: undefined as string | undefined };
    await plugin['experimental.session.compacting']({ sessionID: 'compact-ctx-1' }, output);

    expect(output.context.length).toBe(1);
    expect(output.context[0]).toContain('claude-mem Memory Context');
    expect(output.context[0]).toContain('Past decisions here');
    // prompt should remain untouched (we only inject context, not replace the prompt)
    expect(output.prompt).toBeUndefined();
  });

  it('leaves output.context empty when worker returns no content', async () => {
    installFetchMock({
      '/api/context/inject': () =>
        new Response('', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    });
    const plugin = await loadPlugin(tempDir);

    const output = { context: [] as string[], prompt: undefined as string | undefined };
    await plugin['experimental.session.compacting']({ sessionID: 'compact-ctx-2' }, output);

    expect(output.context.length).toBe(0);
  });

  it('leaves output.context empty when worker is unreachable', async () => {
    global.fetch = (async () => { throw new Error('ECONNREFUSED'); }) as any;
    const plugin = await loadPlugin(tempDir);

    const output = { context: [] as string[], prompt: undefined as string | undefined };
    await plugin['experimental.session.compacting']({ sessionID: 'compact-ctx-3' }, output);

    expect(output.context.length).toBe(0);
  });

  it('appends to existing context (does not overwrite)', async () => {
    installFetchMock({
      '/api/context/inject': () =>
        new Response('Memory snippet', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    });
    const plugin = await loadPlugin(tempDir);

    const output = { context: ['existing context from another plugin'] as string[], prompt: undefined as string | undefined };
    await plugin['experimental.session.compacting']({ sessionID: 'compact-ctx-4' }, output);

    expect(output.context.length).toBe(2);
    expect(output.context[0]).toBe('existing context from another plugin');
    expect(output.context[1]).toContain('Memory snippet');
  });
});

// ============================================================================
// Privacy tag edge processing (chat.message hook + message.updated assistant)
// ============================================================================

describe('privacy tag stripping', () => {
  it('chat.message: strips <private> tags from user prompt before sending to worker', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    const rawText = 'public part <private>secret content</private> more public';
    await plugin['chat.message'](
      { sessionID: 'priv-1', messageID: 'm1' },
      { message: { id: 'm1', sessionID: 'priv-1', role: 'user' }, parts: [{ type: 'text', text: rawText, synthetic: false }] },
    );

    const initCalls = calls.filter(c => c.url.includes('/api/sessions/init'));
    expect(initCalls.length).toBe(1);
    expect(initCalls[0].body.prompt).not.toContain('<private>');
    expect(initCalls[0].body.prompt).not.toContain('secret content');
    expect(initCalls[0].body.prompt).toContain('public part');
    expect(initCalls[0].body.prompt).toContain('more public');
  });

  it('chat.message: skips session init when user message is entirely private', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    const rawText = '<private>all secret</private>';
    await plugin['chat.message'](
      { sessionID: 'priv-2', messageID: 'm2' },
      { message: { id: 'm2', sessionID: 'priv-2', role: 'user' }, parts: [{ type: 'text', text: rawText, synthetic: false }] },
    );

    const initCalls = calls.filter(c => c.url.includes('/api/sessions/init'));
    expect(initCalls.length).toBe(0);
  });

  it('chat.message: strips <claude-mem-context> tags from user prompt', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    const rawText = 'user request <claude-mem-context>injected context</claude-mem-context>';
    await plugin['chat.message'](
      { sessionID: 'priv-3', messageID: 'm3' },
      { message: { id: 'm3', sessionID: 'priv-3', role: 'user' }, parts: [{ type: 'text', text: rawText, synthetic: false }] },
    );

    const initCalls = calls.filter(c => c.url.includes('/api/sessions/init'));
    expect(initCalls.length).toBe(1);
    expect(initCalls[0].body.prompt).not.toContain('<claude-mem-context>');
    expect(initCalls[0].body.prompt).not.toContain('injected context');
    expect(initCalls[0].body.prompt).toContain('user request');
  });

  it('chat.message: uses [media prompt] placeholder for file-only messages', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    calls.length = 0;
    await plugin['chat.message'](
      { sessionID: 'priv-media', messageID: 'm-media' },
      { message: { id: 'm-media', sessionID: 'priv-media', role: 'user' }, parts: [{ type: 'file', url: 'data://image', mime: 'image/png' }] },
    );

    const initCalls = calls.filter(c => c.url.includes('/api/sessions/init'));
    expect(initCalls.length).toBe(1);
    expect(initCalls[0].body.prompt).toBe('[media prompt]');
  });

  it('strips <private> tags from assistant message before storing', async () => {
    installFetchMock();
    const plugin = await loadPlugin(tempDir);

    // Initialize session first
    await triggerUserMessage(plugin, 'priv-4', 'mu1', 'hello');
    calls.length = 0;

    const assistantText = 'public answer <private>internal reasoning</private> conclusion';
    await plugin.event({ event: { type: 'message.part.updated', properties: { part: { type: 'text', sessionID: 'priv-4', messageID: 'ma1', text: assistantText } } } });
    await plugin.event({ event: { type: 'message.updated', properties: { info: { id: 'ma1', sessionID: 'priv-4', role: 'assistant' } } } });

    await new Promise(r => setTimeout(r, 50));
    const obsCalls = calls.filter(c => c.url.includes('/api/sessions/observations') && c.body?.tool_name === 'assistant_message');
    expect(obsCalls.length).toBe(1);
    expect(obsCalls[0].body.tool_response).not.toContain('<private>');
    expect(obsCalls[0].body.tool_response).not.toContain('internal reasoning');
    expect(obsCalls[0].body.tool_response).toContain('public answer');
    expect(obsCalls[0].body.tool_response).toContain('conclusion');
  });
});
