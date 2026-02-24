/**
 * Get AI Analysis functions
 * Retrieves AI analysis from database with various filters
 */

import { Database } from 'bun:sqlite';
import type { StoredAIAnalysis, AIAnalysisSearchResult } from './types.js';
import { logger } from '../../../utils/logger.js';

/**
 * Get AI analysis by ID
 */
export function getAIAnalysisById(
  db: Database,
  id: number
): StoredAIAnalysis | null {
  const stmt = db.prepare(`
    SELECT * FROM ai_analysis
    WHERE id = ?
  `);

  const row = stmt.get(id) as StoredAIAnalysis | undefined;
  return row || null;
}

/**
 * Get AI analyses by IDs
 */
export function getAIAnalysesByIds(
  db: Database,
  ids: number[],
  options: {
    orderBy?: 'date_asc' | 'date_desc';
    limit?: number;
    project?: string;
  } = {}
): AIAnalysisSearchResult[] {
  if (ids.length === 0) {
    return [];
  }

  const { orderBy = 'date_desc', limit, project } = options;

  let query = `
    SELECT * FROM ai_analysis
    WHERE id IN (${ids.map(() => '?').join(',')})
  `;

  const params: any[] = [...ids];

  if (project) {
    query += ' AND project = ?';
    params.push(project);
  }

  if (orderBy === 'date_desc') {
    query += ' ORDER BY created_at_epoch DESC';
  } else {
    query += ' ORDER BY created_at_epoch ASC';
  }

  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as StoredAIAnalysis[];

  return rows.map(formatAIAnalysisResult);
}

/**
 * Get recent AI analyses for a project
 */
export function getRecentAIAnalyses(
  db: Database,
  project: string,
  limit: number = 10
): AIAnalysisSearchResult[] {
  const stmt = db.prepare(`
    SELECT * FROM ai_analysis
    WHERE project = ?
    ORDER BY created_at_epoch DESC
    LIMIT ?
  `);

  const rows = stmt.all(project, limit) as StoredAIAnalysis[];
  return rows.map(formatAIAnalysisResult);
}

/**
 * Get AI analyses for a session
 */
export function getAIAnalysesForSession(
  db: Database,
  memorySessionId: string
): AIAnalysisSearchResult[] {
  const stmt = db.prepare(`
    SELECT * FROM ai_analysis
    WHERE memory_session_id = ?
    ORDER BY created_at_epoch DESC
  `);

  const rows = stmt.all(memorySessionId) as StoredAIAnalysis[];
  return rows.map(formatAIAnalysisResult);
}

/**
 * Full-text search AI analyses
 */
export function searchAIAnalyses(
  db: Database,
  query: string,
  project: string,
  limit: number = 10
): AIAnalysisSearchResult[] {
  try {
    const stmt = db.prepare(`
      SELECT a.*
      FROM ai_analysis a
      JOIN ai_analysis_fts fts ON a.id = fts.rowid
      WHERE fts MATCH ?
      AND a.project = ?
      ORDER BY a.created_at_epoch DESC
      LIMIT ?
    `);

    const rows = stmt.all(query, project, limit) as StoredAIAnalysis[];
    return rows.map(formatAIAnalysisResult);
  } catch (error) {
    logger.warn('AI_ANALYSIS', 'FTS search failed, returning empty results', {
      query: query.slice(0, 100),
      project
    }, error as Error);
    return [];
  }
}

function safeParseJsonArray(value: string | null, field: string, rowId: number): unknown[] {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    logger.warn('AI_ANALYSIS', `Invalid JSON in ${field}`, { id: rowId });
    return [];
  }
}

/**
 * Format stored AI analysis to search result
 */
function formatAIAnalysisResult(row: StoredAIAnalysis): AIAnalysisSearchResult {
  return {
    id: row.id,
    memorySessionId: row.memory_session_id,
    project: row.project,
    analysisText: row.analysis_text,
    keyInsights: safeParseJsonArray(row.key_insights, 'key_insights', row.id),
    connections: safeParseJsonArray(row.connections, 'connections', row.id),
    createdAt: row.created_at,
    createdAtEpoch: row.created_at_epoch,
    discoveryTokens: row.discovery_tokens
  };
}
