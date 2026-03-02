/**
 * Work context query functions.
 */

import { Database } from 'bun:sqlite';
import type { WorkContext, WorkContextRow } from './types.js';
import { logger } from '../../../utils/logger.js';

/**
 * Parse a WorkContextRow into a WorkContext object.
 */
function parseRow(row: WorkContextRow): WorkContext {
  return {
    contentSessionId: row.content_session_id,
    project: row.project,
    files: safeParseJsonArray(row.files),
    concepts: safeParseJsonArray(row.concepts),
    modules: safeParseJsonArray(row.modules),
    observationCount: row.observation_count,
    lastUpdatedEpoch: row.last_updated_epoch,
  };
}

function safeParseJsonArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Get the work context for a specific session.
 */
export function getWorkContext(db: Database, contentSessionId: string): WorkContext | null {
  const row = db.prepare(
    'SELECT * FROM session_work_context WHERE content_session_id = ?'
  ).get(contentSessionId) as WorkContextRow | null;

  if (!row) {
    logger.debug('WORK_CONTEXT', 'No work context found for session', { contentSessionId });
    return null;
  }
  return parseRow(row);
}

/**
 * Get work contexts for all active sessions in a project.
 * "Active" means sessions that are not yet completed.
 */
export function getActiveWorkContexts(db: Database, project: string): WorkContext[] {
  const rows = db.prepare(`
    SELECT swc.*
    FROM session_work_context swc
    JOIN sdk_sessions s ON swc.content_session_id = s.content_session_id
    WHERE swc.project = ? AND s.status = 'active'
    ORDER BY swc.last_updated_epoch DESC
  `).all(project) as WorkContextRow[];

  return rows.map(parseRow);
}

/**
 * Get work context by memorySessionId (convenience wrapper).
 * Resolves memorySessionId → contentSessionId first.
 */
export function getWorkContextByMemorySessionId(db: Database, memorySessionId: string): WorkContext | null {
  const row = db.prepare(`
    SELECT swc.*
    FROM session_work_context swc
    JOIN sdk_sessions s ON swc.content_session_id = s.content_session_id
    WHERE s.memory_session_id = ?
  `).get(memorySessionId) as WorkContextRow | null;

  return row ? parseRow(row) : null;
}
