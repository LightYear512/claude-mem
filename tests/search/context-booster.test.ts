/**
 * ContextBooster tests
 * Tests context-aware re-ranking of search results based on work context affinity.
 */

import { describe, it, expect } from 'bun:test';
import { ContextBooster } from '../../src/services/worker/search/ContextBooster.js';
import type { WorkContext } from '../../src/services/sqlite/work-context/types.js';
import type { ChromaMetadata } from '../../src/services/worker/search/types.js';

function makeWorkContext(overrides: Partial<WorkContext> = {}): WorkContext {
  return {
    contentSessionId: 'session-1',
    project: 'test-project',
    files: [],
    concepts: [],
    modules: [],
    observationCount: 5,
    lastUpdatedEpoch: Date.now(),
    ...overrides,
  };
}

function makeItem(id: number, meta: Partial<ChromaMetadata> = {}): { id: number; meta: ChromaMetadata } {
  return {
    id,
    meta: {
      memory_session_id: 'other-session',
      files_read: '[]',
      files_modified: '[]',
      concepts: '[]',
      ...meta,
    } as ChromaMetadata,
  };
}

describe('ContextBooster', () => {
  const booster = new ContextBooster();

  describe('boost() - Chroma results re-ranking', () => {
    it('returns empty array for empty input', () => {
      const ctx = makeWorkContext({ files: ['a.ts'] });
      expect(booster.boost([], ctx)).toEqual([]);
    });

    it('returns items unchanged when boostWeight is 0', () => {
      const items = [makeItem(1), makeItem(2), makeItem(3)];
      const ctx = makeWorkContext({ files: ['a.ts'] });
      const result = booster.boost(items, ctx, 0);
      expect(result.map(r => r.id)).toEqual([1, 2, 3]);
    });

    it('returns items unchanged when work context has no signals', () => {
      const items = [makeItem(1), makeItem(2), makeItem(3)];
      const ctx = makeWorkContext(); // empty files, concepts, modules
      const result = booster.boost(items, ctx);
      expect(result.map(r => r.id)).toEqual([1, 2, 3]);
    });

    it('boosts items with matching files higher', () => {
      const items = [
        makeItem(1, { files_read: '["unrelated.ts"]' }),
        makeItem(2, { files_read: '["src/auth/login.ts"]' }),
        makeItem(3, { files_read: '["other.ts"]' }),
      ];
      const ctx = makeWorkContext({
        files: ['src/auth/login.ts', 'src/auth/register.ts'],
        modules: ['src/auth/'],
      });
      const result = booster.boost(items, ctx, 1.0); // full boost weight
      // Item 2 should be boosted to top due to file match
      expect(result[0].id).toBe(2);
    });

    it('boosts items from same session', () => {
      const items = [
        makeItem(1, { memory_session_id: 'other-session' }),
        makeItem(2, { memory_session_id: 'session-1' }),
      ];
      const ctx = makeWorkContext({
        contentSessionId: 'session-1',
        files: ['a.ts'], // need at least one signal to activate
      });
      const result = booster.boost(items, ctx, 1.0);
      expect(result[0].id).toBe(2);
    });

    it('boosts items with matching concepts', () => {
      const items = [
        makeItem(1, { concepts: '["database"]' }),
        makeItem(2, { concepts: '["authentication", "security"]' }),
        makeItem(3, { concepts: '["logging"]' }),
      ];
      const ctx = makeWorkContext({
        concepts: ['authentication', 'security', 'oauth'],
      });
      const result = booster.boost(items, ctx, 1.0);
      expect(result[0].id).toBe(2);
    });

    it('preserves all items (soft boost, no filtering)', () => {
      const items = [makeItem(1), makeItem(2), makeItem(3), makeItem(4)];
      const ctx = makeWorkContext({ files: ['a.ts'] });
      const result = booster.boost(items, ctx, 0.5);
      expect(result.length).toBe(4);
      // All original IDs present
      const ids = new Set(result.map(r => r.id));
      expect(ids.size).toBe(4);
    });

    it('clamps boostWeight above 1 to 1', () => {
      const items = [
        makeItem(1, { files_read: '["unrelated.ts"]' }),
        makeItem(2, { files_read: '["match.ts"]' }),
      ];
      const ctx = makeWorkContext({ files: ['match.ts'] });
      // Should not throw, weight clamped to 1
      const result = booster.boost(items, ctx, 5.0);
      expect(result.length).toBe(2);
    });

    it('handles comma-separated metadata strings', () => {
      const items = [
        makeItem(1, { files_read: 'src/a.ts,src/b.ts' }),
        makeItem(2, { files_read: '["src/c.ts"]' }),
      ];
      const ctx = makeWorkContext({ files: ['src/a.ts'] });
      const result = booster.boost(items, ctx, 1.0);
      expect(result[0].id).toBe(1);
    });
  });

  describe('boostObservations() - SQLite results re-ranking', () => {
    function makeObs(id: number, overrides: Record<string, any> = {}) {
      return {
        id,
        files_read: '[]',
        files_modified: '[]',
        concepts: '[]',
        memory_session_id: 'other',
        ...overrides,
      };
    }

    it('returns empty array for empty input', () => {
      const ctx = makeWorkContext({ files: ['a.ts'] });
      expect(booster.boostObservations([], ctx)).toEqual([]);
    });

    it('returns items unchanged when boostWeight is 0', () => {
      const items = [makeObs(1), makeObs(2)];
      const ctx = makeWorkContext({ files: ['a.ts'] });
      const result = booster.boostObservations(items, ctx, 0);
      expect(result.map(r => r.id)).toEqual([1, 2]);
    });

    it('returns items unchanged when context has no signals', () => {
      const items = [makeObs(1), makeObs(2)];
      const ctx = makeWorkContext();
      const result = booster.boostObservations(items, ctx);
      expect(result.map(r => r.id)).toEqual([1, 2]);
    });

    it('boosts observations with matching files', () => {
      const items = [
        makeObs(1, { files_read: '["unrelated.ts"]' }),
        makeObs(2, { files_modified: '["src/auth/login.ts"]' }),
      ];
      const ctx = makeWorkContext({
        files: ['src/auth/login.ts'],
        modules: ['src/auth/'],
      });
      const result = booster.boostObservations(items, ctx, 1.0);
      expect(result[0].id).toBe(2);
    });

    it('boosts observations from same session', () => {
      const items = [
        makeObs(1, { memory_session_id: 'other' }),
        makeObs(2, { memory_session_id: 'session-1' }),
      ];
      const ctx = makeWorkContext({
        contentSessionId: 'session-1',
        files: ['a.ts'],
      });
      const result = booster.boostObservations(items, ctx, 1.0);
      expect(result[0].id).toBe(2);
    });
  });
});
