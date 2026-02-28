/**
 * L2: OpenCode AGENTS.md Sync Tests
 *
 * Tests syncAgentsContext logic: skip conditions, file creation,
 * content merging, and error handling. Uses real tmpdir for file IO.
 *
 * Pattern: tests/utils/claude-md-utils.test.ts (tmpdir + fetch mock)
 */
import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { tmpdir } from 'os';

// --- Mock @opencode-ai/plugin BEFORE import ---
mock.module('@opencode-ai/plugin', () => ({
  tool: Object.assign(
    (def: any) => def,
    { schema: { string: () => ({ describe: (d: string) => d }) } },
  ),
}));

// --- Fetch recording ---
const originalFetch = global.fetch;

function installFetchMock(contextResponse: string | null, statusCode = 200) {
  global.fetch = (async (input: any) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.includes('/api/context/inject')) {
      if (contextResponse === null) {
        return new Response('', { status: 500 });
      }
      return new Response(contextResponse, {
        status: statusCode,
        headers: { 'Content-Type': 'text/plain' },
      });
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
  const dir = join(tmpdir(), `oc-agents-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function loadPlugin(directory: string) {
  const mod = await import('../../../src/integrations/opencode/index.js');
  return mod.default({ directory });
}

function readAgentsMd(): string {
  const agentsMdPath = join(tempDir, 'AGENTS.md');
  if (!existsSync(agentsMdPath)) return '';
  return readFileSync(agentsMdPath, 'utf-8');
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
// syncAgentsContext — skip conditions
// ============================================================================

describe('syncAgentsContext - skip conditions', () => {
  it('skips when worker returns error (null)', async () => {
    installFetchMock(null);
    await loadPlugin(tempDir);

    expect(readAgentsMd()).toBe('');
  });

  it('skips when worker returns empty string', async () => {
    installFetchMock('');
    await loadPlugin(tempDir);

    expect(readAgentsMd()).toBe('');
  });

  it('skips when worker returns whitespace only', async () => {
    installFetchMock('   \n  ');
    await loadPlugin(tempDir);

    expect(readAgentsMd()).toBe('');
  });
});

// ============================================================================
// syncAgentsContext — file creation
// ============================================================================

describe('syncAgentsContext - file creation', () => {
  it('creates AGENTS.md with <claude-mem-context> block when not exists', async () => {
    installFetchMock('# Memory Context\nPrevious session...');
    await loadPlugin(tempDir);

    const content = readAgentsMd();
    expect(content).toContain('<claude-mem-context>');
    expect(content).toContain('# Memory Context');
    expect(content).toContain('Previous session...');
    expect(content).toContain('</claude-mem-context>');
  });
});

// ============================================================================
// syncAgentsContext — content merging
// ============================================================================

describe('syncAgentsContext - content merging', () => {
  it('replaces existing <claude-mem-context> block', async () => {
    // Pre-populate AGENTS.md with existing block
    const existing = [
      '# My AGENTS.md',
      '',
      '<claude-mem-context>',
      'Old context data',
      '</claude-mem-context>',
      '',
      '# Other Section',
    ].join('\n');
    writeFileSync(join(tempDir, 'AGENTS.md'), existing, 'utf-8');

    installFetchMock('New context data');
    await loadPlugin(tempDir);

    const content = readAgentsMd();
    expect(content).toContain('# My AGENTS.md');
    expect(content).toContain('New context data');
    expect(content).not.toContain('Old context data');
    expect(content).toContain('# Other Section');
  });

  it('preserves content before and after the block', async () => {
    const existing = [
      'Content before',
      '<claude-mem-context>',
      'Old',
      '</claude-mem-context>',
      'Content after',
    ].join('\n');
    writeFileSync(join(tempDir, 'AGENTS.md'), existing, 'utf-8');

    installFetchMock('Updated');
    await loadPlugin(tempDir);

    const content = readAgentsMd();
    expect(content).toContain('Content before');
    expect(content).toContain('Content after');
    expect(content).toContain('Updated');
  });

  it('appends block when no existing tags', async () => {
    const existing = '# My Custom AGENTS.md\n\nSome instructions here.';
    writeFileSync(join(tempDir, 'AGENTS.md'), existing, 'utf-8');

    installFetchMock('Appended context');
    await loadPlugin(tempDir);

    const content = readAgentsMd();
    expect(content).toContain('# My Custom AGENTS.md');
    expect(content).toContain('Some instructions here.');
    expect(content).toContain('<claude-mem-context>');
    expect(content).toContain('Appended context');
    expect(content).toContain('</claude-mem-context>');
  });
});

// ============================================================================
// syncAgentsContext — error handling
// ============================================================================

describe('syncAgentsContext - error handling', () => {
  it('logs warn on writeFile failure, does not throw', async () => {
    // Use a non-existent deeply nested directory that can't be auto-created
    const badDir = '/nonexistent-root-path/deep/nesting';

    installFetchMock('Some context');

    // Suppress console.warn during this test
    const warnSpy = mock(() => {});
    const origWarn = console.warn;
    console.warn = warnSpy;

    try {
      // Should not throw even though writeFile will fail
      const plugin = await loadPlugin(badDir);
      expect(plugin).toBeDefined();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      console.warn = origWarn;
    }
  });
});

// ============================================================================
// getProjectNameFromDir
// ============================================================================

describe('getProjectNameFromDir (via plugin project name)', () => {
  it('derives parent/basename format from directory', async () => {
    installFetchMock('# Context');

    // Create a nested dir structure to get meaningful project name
    const nestedDir = join(tempDir, 'repos', 'my-project');
    mkdirSync(nestedDir, { recursive: true });

    await loadPlugin(nestedDir);

    // Verify project name is included in the context inject URL
    // The plugin calls /api/context/inject?projects=repos/my-project (or similar)
    // We capture this from the fetch mock
    const contextUrl = await new Promise<string>((resolve) => {
      const origFetch = global.fetch;
      global.fetch = (async (input: any, init?: any) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/api/context/inject')) {
          resolve(url);
        }
        return new Response('# Context', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }) as any;

      // Re-trigger sync via session.created
      loadPlugin(nestedDir).catch(() => {});
    });

    expect(contextUrl).toContain('repos%2Fmy-project');
  });
});
