/**
 * WorkContextAccumulator - Passively accumulates work context from observations.
 *
 * Called after each observation is stored. Merges new signals (files, concepts, modules)
 * into the session's work context using atomic upsert operations.
 */

import { Database } from 'bun:sqlite';
import { logger } from '../../../utils/logger.js';
import { inferModules } from './module-inference.js';
import type { ObservationInput } from '../observations/types.js';

/**
 * Union two JSON arrays stored as strings, returning a deduplicated JSON string.
 * Operates in JS since SQLite's JSON functions vary across versions.
 */
function jsonArrayUnion(existingJson: string, newItems: string[]): string {
  let existing: string[];
  try {
    existing = JSON.parse(existingJson);
    if (!Array.isArray(existing)) existing = [];
  } catch {
    existing = [];
  }

  const set = new Set(existing);
  for (const item of newItems) {
    if (item && typeof item === 'string') {
      set.add(item);
    }
  }
  return JSON.stringify([...set]);
}

/**
 * Resolve contentSessionId from memorySessionId via sdk_sessions table.
 * Uses a WeakMap-scoped cache so each Database instance gets its own prepared statement.
 * This prevents stale statement references after DB reconnection or in tests.
 */
const resolveStmtCache = new WeakMap<Database, ReturnType<Database['prepare']>>();

function resolveContentSessionId(db: Database, memorySessionId: string): string | null {
  let stmt = resolveStmtCache.get(db);
  if (!stmt) {
    stmt = db.prepare(
      'SELECT content_session_id FROM sdk_sessions WHERE memory_session_id = ? LIMIT 1'
    );
    resolveStmtCache.set(db, stmt);
  }
  const row = stmt.get(memorySessionId) as { content_session_id: string } | null;
  return row?.content_session_id ?? null;
}

export class WorkContextAccumulator {
  /**
   * Update the session's work context after an observation is stored.
   * Non-blocking: failures are logged but do not propagate.
   */
  static updateFromObservation(
    db: Database,
    memorySessionId: string,
    project: string,
    observation: ObservationInput
  ): void {
    try {
      // Resolve contentSessionId
      const contentSessionId = resolveContentSessionId(db, memorySessionId);
      if (!contentSessionId) {
        logger.debug('WORK_CTX', 'Cannot resolve contentSessionId, skipping', { memorySessionId });
        return;
      }

      // Extract signals from observation
      const filesRead = Array.isArray(observation.files_read) ? observation.files_read : [];
      const filesModified = Array.isArray(observation.files_modified) ? observation.files_modified : [];
      const allFiles = [...filesRead, ...filesModified].filter(Boolean);
      const concepts = Array.isArray(observation.concepts) ? observation.concepts.filter(Boolean) : [];
      const modules = inferModules(allFiles);

      if (allFiles.length === 0 && concepts.length === 0) {
        return; // No signals to accumulate
      }

      const now = Date.now();

      // Read existing signals to compute merged values (needed for JS-side array union)
      const existing = db.prepare(
        'SELECT files, concepts, modules FROM session_work_context WHERE content_session_id = ?'
      ).get(contentSessionId) as { files: string; concepts: string; modules: string } | null;

      const mergedFiles = existing ? jsonArrayUnion(existing.files, allFiles) : JSON.stringify(allFiles);
      const mergedConcepts = existing ? jsonArrayUnion(existing.concepts, concepts) : JSON.stringify(concepts);
      const mergedModules = existing ? jsonArrayUnion(existing.modules, modules) : JSON.stringify(modules);

      // Atomic upsert: eliminates the TOCTOU race between SELECT and INSERT/UPDATE.
      // ON CONFLICT handles concurrent inserts for the same content_session_id safely.
      db.prepare(`
        INSERT INTO session_work_context
          (content_session_id, project, files, concepts, modules,
           observation_count, last_updated_epoch, created_at_epoch)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(content_session_id) DO UPDATE SET
          files = excluded.files,
          concepts = excluded.concepts,
          modules = excluded.modules,
          observation_count = observation_count + 1,
          last_updated_epoch = excluded.last_updated_epoch
      `).run(
        contentSessionId, project,
        mergedFiles, mergedConcepts, mergedModules,
        now, now
      );

      logger.debug('WORK_CTX', 'Updated work context', {
        contentSessionId,
        newFiles: allFiles.length,
        newConcepts: concepts.length,
        newModules: modules.length
      });
    } catch (error) {
      // Non-blocking: log and continue
      logger.debug('WORK_CTX', 'Failed to update work context', {}, error as Error);
    }
  }

  /**
   * No-op: kept for backward compatibility with existing tests.
   * The WeakMap-based cache is automatically invalidated when the Database
   * instance is replaced, so explicit cache reset is no longer necessary.
   */
  static resetCache(): void {
    // WeakMap entries are scoped to the Database instance — no manual reset needed.
  }
}
