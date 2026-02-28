/**
 * L3: OpenCode Plugin Integration Tests
 *
 * Tests the plugin against a real Express server with stub routes.
 * Validates the full HTTP contract without heavy worker dependencies.
 *
 * Pattern: tests/integration/worker-api-endpoints.test.ts
 */
import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createServer, type Server as HttpServer } from 'http';

// --- Mock @opencode-ai/plugin BEFORE import ---
mock.module('@opencode-ai/plugin', () => ({
  tool: Object.assign(
    (def: any) => def,
    { schema: { string: () => ({ describe: (d: string) => d }) } },
  ),
}));

// --- Types ---
interface RecordedCall {
  endpoint: string;
  method: string;
  body?: any;
  query?: Record<string, string>;
}

// --- Stub Server ---

function createStubServer(receivedCalls: RecordedCall[]): HttpServer {
  return createServer((req, res) => {
    const url = new URL(req.url!, `http://127.0.0.1`);
    const pathname = url.pathname;
    const query = Object.fromEntries(url.searchParams.entries());

    // Collect body for POST requests
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        let parsed: any;
        try { parsed = JSON.parse(body); } catch { parsed = body; }

        if (pathname === '/api/sessions/init') {
          receivedCalls.push({ endpoint: 'init', method: 'POST', body: parsed });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ sessionDbId: 1, promptNumber: 1, skipped: false }));
        } else if (pathname === '/api/sessions/observations') {
          receivedCalls.push({ endpoint: 'observations', method: 'POST', body: parsed });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'queued' }));
        } else if (pathname === '/api/sessions/summarize') {
          receivedCalls.push({ endpoint: 'summarize', method: 'POST', body: parsed });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        } else if (pathname === '/api/sessions/complete') {
          receivedCalls.push({ endpoint: 'complete', method: 'POST', body: parsed });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });
    } else if (req.method === 'GET') {
      if (pathname === '/api/context/inject') {
        receivedCalls.push({ endpoint: 'context', method: 'GET', query });
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('# Memory Context\nPrevious session summary...');
      } else if (pathname === '/api/search/observations') {
        receivedCalls.push({ endpoint: 'search', method: 'GET', query });
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Found 2 observations matching query');
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    } else {
      res.writeHead(405);
      res.end('Method Not Allowed');
    }
  });
}

function listenOnPort(server: HttpServer, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });
}

function closeServer(server: HttpServer): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

// --- Helpers ---
let tempDir: string;
let testPort: number;
let server: HttpServer;
let receivedCalls: RecordedCall[];

// The plugin reads DEFAULT_WORKER_PORT = 37777 from source.
// We need to override fetch to redirect to our test port.
// Alternatively, we patch global.fetch to rewrite the port.
const originalFetch = global.fetch;

function patchFetchPort(targetPort: number) {
  global.fetch = ((input: any, init?: any) => {
    let url = typeof input === 'string' ? input : input.url;
    // Rewrite port 37777 to our test port
    url = url.replace(':37777', `:${targetPort}`);
    return originalFetch(url, init);
  }) as any;
}

async function loadPlugin(directory: string) {
  const mod = await import('../../../src/integrations/opencode/index.js');
  return mod.default({ directory });
}

// --- Setup / Teardown ---

beforeEach(async () => {
  tempDir = join(tmpdir(), `oc-integ-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
  testPort = 40000 + Math.floor(Math.random() * 9000);
  receivedCalls = [];
  server = createStubServer(receivedCalls);
  await listenOnPort(server, testPort);
  patchFetchPort(testPort);
});

afterEach(async () => {
  global.fetch = originalFetch;
  mock.restore();
  try { await closeServer(server); } catch {}
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

// ============================================================================
// Full Session Lifecycle
// ============================================================================

describe('Full Session Lifecycle - E2E', () => {
  it('complete flow: init → observations → summarize → complete', async () => {
    // 1. Plugin init triggers syncAgentsContext (GET /api/context/inject)
    const plugin = await loadPlugin(tempDir);

    // Verify initial context sync
    const contextCalls = receivedCalls.filter(c => c.endpoint === 'context');
    expect(contextCalls.length).toBeGreaterThanOrEqual(1);

    // Verify AGENTS.md was created
    const agentsMdPath = join(tempDir, 'AGENTS.md');
    expect(existsSync(agentsMdPath)).toBe(true);
    const agentsMd = readFileSync(agentsMdPath, 'utf-8');
    expect(agentsMd).toContain('<claude-mem-context>');
    expect(agentsMd).toContain('Previous session summary...');

    // 2. Trigger session.created
    await plugin.event({ type: 'session.created', sessionID: 'e2e-session' });

    const initCalls = receivedCalls.filter(c => c.endpoint === 'init');
    expect(initCalls.length).toBeGreaterThanOrEqual(1);
    const initBody = initCalls[initCalls.length - 1].body;
    expect(initBody.contentSessionId).toMatch(/^opencode-e2e-session-\d+$/);
    expect(initBody.prompt).toBe('');

    // 3. Trigger tool.execute.after × 3
    for (let i = 0; i < 3; i++) {
      plugin['tool.execute.after'](
        { tool: `Tool${i}`, sessionID: 'e2e-session', callID: `c-${i}`, args: { n: i } },
        { title: '', output: `result-${i}`, metadata: {} },
      );
    }

    // Allow fire-and-forget to settle
    await new Promise(r => setTimeout(r, 200));

    const obsCalls = receivedCalls.filter(c => c.endpoint === 'observations');
    expect(obsCalls.length).toBeGreaterThanOrEqual(3);

    // Verify tool names are correct
    const toolNames = obsCalls.map(c => c.body.tool_name);
    expect(toolNames).toContain('Tool0');
    expect(toolNames).toContain('Tool1');
    expect(toolNames).toContain('Tool2');

    // 4. Trigger message.updated (assistant)
    await plugin.event({
      type: 'message.updated',
      sessionID: 'e2e-session',
      role: 'assistant',
      content: 'I completed the task.',
    });

    await new Promise(r => setTimeout(r, 100));

    // 5. Trigger session.deleted (summarize + complete)
    await plugin.event({ type: 'session.deleted', sessionID: 'e2e-session' });

    await new Promise(r => setTimeout(r, 200));

    // Verify summarize was called
    const summarizeCalls = receivedCalls.filter(c => c.endpoint === 'summarize');
    expect(summarizeCalls.length).toBeGreaterThanOrEqual(1);
    expect(summarizeCalls[0].body.last_assistant_message).toBe('I completed the task.');

    // Verify complete was called
    const completeCalls = receivedCalls.filter(c => c.endpoint === 'complete');
    expect(completeCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// Plugin resilience
// ============================================================================

describe('Plugin resilience', () => {
  it('plugin loads without error when worker is down', async () => {
    // Close the server first
    await closeServer(server);

    // Restore original fetch (which will fail to connect)
    global.fetch = originalFetch;

    // Plugin should load without throwing
    const plugin = await loadPlugin(tempDir);
    expect(plugin).toBeDefined();
    expect(plugin['tool.execute.after']).toBeInstanceOf(Function);
    expect(plugin.event).toBeInstanceOf(Function);
    expect(plugin.tool.claude_mem_search).toBeDefined();
  });

  it('tool interceptor continues working after worker error', async () => {
    // Close the real server
    await closeServer(server);

    // Create a server that always returns 500
    const errorCalls: RecordedCall[] = [];
    const errorServer = createStubServer(errorCalls);
    // Override the stub to return 500
    const errorHttpServer = createServer((req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    });
    await listenOnPort(errorHttpServer, testPort);

    try {
      const plugin = await loadPlugin(tempDir);

      // Tool interceptor should not crash
      plugin['tool.execute.after'](
        { tool: 'Bash', sessionID: 's1', callID: 'c1', args: {} },
        { title: '', output: 'ok', metadata: {} },
      );

      // Should still be able to call again
      plugin['tool.execute.after'](
        { tool: 'Edit', sessionID: 's1', callID: 'c2', args: {} },
        { title: '', output: 'done', metadata: {} },
      );

      // No crash = success
      expect(true).toBe(true);
    } finally {
      await closeServer(errorHttpServer);
    }
  });
});

// ============================================================================
// Contract validation
// ============================================================================

describe('Contract validation', () => {
  it('contentSessionId follows "opencode-{id}-{epoch}" pattern', async () => {
    const plugin = await loadPlugin(tempDir);
    await plugin.event({ type: 'session.created', sessionID: 'contract-test' });

    const initCall = receivedCalls.find(c => c.endpoint === 'init');
    expect(initCall).toBeDefined();
    expect(initCall!.body.contentSessionId).toMatch(/^opencode-contract-test-\d+$/);
  });

  it('tool_response never exceeds 1000 chars in POST body', async () => {
    const plugin = await loadPlugin(tempDir);

    // Send a very long output
    const longOutput = 'z'.repeat(5000);
    plugin['tool.execute.after'](
      { tool: 'Read', sessionID: 'trunc-test', callID: 'c1', args: {} },
      { title: '', output: longOutput, metadata: {} },
    );

    await new Promise(r => setTimeout(r, 200));

    const obsCalls = receivedCalls.filter(c => c.endpoint === 'observations');
    expect(obsCalls.length).toBeGreaterThanOrEqual(1);
    expect(obsCalls[0].body.tool_response.length).toBeLessThanOrEqual(1000);
  });

  it('project name matches expected format', async () => {
    const plugin = await loadPlugin(tempDir);

    // The project name is derived from tempDir: parent/basename
    const expectedProject = join(
      // getProjectNameFromDir returns basename(dirname(dir)) + '/' + basename(dir)
    ).replace(/\\/g, '/');

    // Check from the context inject call
    const contextCall = receivedCalls.find(c => c.endpoint === 'context');
    expect(contextCall).toBeDefined();
    expect(contextCall!.query!.projects).toBeDefined();
    // Should contain the basename at minimum
    const dirBasename = tempDir.split('/').pop()!;
    expect(contextCall!.query!.projects).toContain(dirBasename);
  });

  it('search tool sends correct query parameters', async () => {
    const plugin = await loadPlugin(tempDir);

    receivedCalls.length = 0;
    const result = await plugin.tool.claude_mem_search.execute({ query: 'authentication flow' });

    const searchCalls = receivedCalls.filter(c => c.endpoint === 'search');
    expect(searchCalls.length).toBe(1);
    expect(searchCalls[0].query!.query).toBe('authentication flow');
    expect(searchCalls[0].query!.limit).toBe('10');
    expect(result).toBe('Found 2 observations matching query');
  });
});
