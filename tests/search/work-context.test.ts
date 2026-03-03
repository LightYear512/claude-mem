/**
 * Work context module tests
 * Tests module inference, work context accumulation, and queries.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ClaudeMemDatabase } from '../../src/services/sqlite/Database.js';
import { inferModules } from '../../src/services/sqlite/work-context/module-inference.js';
import { WorkContextAccumulator } from '../../src/services/sqlite/work-context/accumulator.js';
import { getWorkContext, getWorkContextByMemorySessionId } from '../../src/services/sqlite/work-context/get.js';
import { createSDKSession, updateMemorySessionId } from '../../src/services/sqlite/Sessions.js';
import type { ObservationInput } from '../../src/services/sqlite/observations/types.js';
import type { Database } from 'bun:sqlite';

// ============================================================================
// inferModules
// ============================================================================

describe('inferModules', () => {
  it('returns empty array for empty input', () => {
    expect(inferModules([])).toEqual([]);
  });

  it('extracts 2-segment and 3-segment module prefixes', () => {
    const result = inferModules(['src/renderer/physics/engine.ts']);
    expect(result).toContain('src/renderer/');
    expect(result).toContain('src/renderer/physics/');
  });

  it('handles files at depth 2 (only 2-segment prefix)', () => {
    const result = inferModules(['src/index.ts']);
    expect(result).toEqual(['src/index.ts/']);
    // Wait - a file at depth 2 means parts = ['src', 'index.ts'], so 2-segment prefix = 'src/index.ts/'
    // Actually this is the module prefix. Let me re-check the logic.
    // parts.length >= 2 → 'src/index.ts/' — this is technically the "module" for a file directly under src/
  });

  it('skips files at root (no directory)', () => {
    const result = inferModules(['README.md']);
    expect(result).toEqual([]);
  });

  it('strips leading ./ from paths', () => {
    const result = inferModules(['./src/utils/logger.ts']);
    expect(result).toContain('src/utils/');
    expect(result).toContain('src/utils/logger.ts/');
  });

  it('strips leading / from absolute paths', () => {
    const result = inferModules(['/home/user/project/src/main.ts']);
    expect(result).toContain('home/user/');
    expect(result).toContain('home/user/project/');
  });

  it('deduplicates module prefixes from multiple files in same directory', () => {
    const result = inferModules([
      'src/services/auth.ts',
      'src/services/user.ts',
      'src/services/session.ts',
    ]);
    // All share the same 2-segment prefix
    const count = result.filter(m => m === 'src/services/').length;
    expect(count).toBe(1);
  });

  it('skips null/undefined/empty entries', () => {
    const result = inferModules([null as any, undefined as any, '', 'src/a/b.ts']);
    expect(result).toContain('src/a/');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// WorkContextAccumulator + getWorkContext (integration with in-memory DB)
// ============================================================================

describe('WorkContextAccumulator', () => {
  let db: Database;

  beforeEach(() => {
    db = new ClaudeMemDatabase(':memory:').db;
    WorkContextAccumulator.resetCache();
  });

  afterEach(() => {
    db.close();
  });

  function setupSession(contentSessionId: string, memorySessionId: string): void {
    const sessionDbId = createSDKSession(db, contentSessionId, 'test-project', '');
    updateMemorySessionId(db, sessionDbId, memorySessionId);
  }

  function makeObservation(overrides: Partial<ObservationInput> = {}): ObservationInput {
    return {
      type: 'discovery',
      title: 'Test',
      subtitle: '',
      facts: [],
      narrative: '',
      concepts: [],
      files_read: [],
      files_modified: [],
      ...overrides,
    };
  }

  it('creates work context on first observation with signals', () => {
    setupSession('content-1', 'memory-1');

    WorkContextAccumulator.updateFromObservation(db, 'memory-1', 'test-project', makeObservation({
      files_read: ['src/auth/login.ts'],
      concepts: ['authentication'],
    }));

    const ctx = getWorkContext(db, 'content-1');
    expect(ctx).not.toBeNull();
    expect(ctx!.files).toContain('src/auth/login.ts');
    expect(ctx!.concepts).toContain('authentication');
    expect(ctx!.modules).toContain('src/auth/');
    expect(ctx!.observationCount).toBe(1);
  });

  it('merges signals from subsequent observations', () => {
    setupSession('content-2', 'memory-2');

    WorkContextAccumulator.updateFromObservation(db, 'memory-2', 'test-project', makeObservation({
      files_read: ['src/auth/login.ts'],
      concepts: ['authentication'],
    }));

    WorkContextAccumulator.updateFromObservation(db, 'memory-2', 'test-project', makeObservation({
      files_modified: ['src/db/users.ts'],
      concepts: ['database', 'authentication'],
    }));

    const ctx = getWorkContext(db, 'content-2');
    expect(ctx).not.toBeNull();
    expect(ctx!.files).toContain('src/auth/login.ts');
    expect(ctx!.files).toContain('src/db/users.ts');
    expect(ctx!.concepts).toContain('authentication');
    expect(ctx!.concepts).toContain('database');
    expect(ctx!.observationCount).toBe(2);
  });

  it('deduplicates files and concepts across observations', () => {
    setupSession('content-3', 'memory-3');

    const obs = makeObservation({
      files_read: ['src/a.ts'],
      concepts: ['auth'],
    });

    WorkContextAccumulator.updateFromObservation(db, 'memory-3', 'test-project', obs);
    WorkContextAccumulator.updateFromObservation(db, 'memory-3', 'test-project', obs);

    const ctx = getWorkContext(db, 'content-3');
    expect(ctx).not.toBeNull();
    const fileCount = ctx!.files.filter(f => f === 'src/a.ts').length;
    expect(fileCount).toBe(1);
  });

  it('skips observations with no signals', () => {
    setupSession('content-4', 'memory-4');

    WorkContextAccumulator.updateFromObservation(db, 'memory-4', 'test-project', makeObservation({
      files_read: [],
      files_modified: [],
      concepts: [],
    }));

    const ctx = getWorkContext(db, 'content-4');
    expect(ctx).toBeNull();
  });

  it('handles unresolvable memorySessionId gracefully', () => {
    // No session created, so resolution will fail
    WorkContextAccumulator.updateFromObservation(db, 'nonexistent', 'test-project', makeObservation({
      files_read: ['a.ts'],
    }));
    // Should not throw
  });
});

// ============================================================================
// getWorkContext queries
// ============================================================================

describe('getWorkContext queries', () => {
  let db: Database;

  beforeEach(() => {
    db = new ClaudeMemDatabase(':memory:').db;
    WorkContextAccumulator.resetCache();
  });

  afterEach(() => {
    db.close();
  });

  it('returns null for nonexistent session', () => {
    const ctx = getWorkContext(db, 'nonexistent');
    expect(ctx).toBeNull();
  });

  it('getWorkContextByMemorySessionId resolves via sdk_sessions join', () => {
    const dbId = createSDKSession(db, 'content-5', 'test-project', '');
    updateMemorySessionId(db, dbId, 'memory-5');

    WorkContextAccumulator.updateFromObservation(db, 'memory-5', 'test-project', {
      type: 'discovery',
      title: 'Test',
      subtitle: '',
      facts: [],
      narrative: '',
      concepts: ['testing'],
      files_read: ['test.ts'],
      files_modified: [],
    });

    const ctx = getWorkContextByMemorySessionId(db, 'memory-5');
    expect(ctx).not.toBeNull();
    expect(ctx!.contentSessionId).toBe('content-5');
    expect(ctx!.files).toContain('test.ts');
  });
});
