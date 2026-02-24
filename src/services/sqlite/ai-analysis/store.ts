/**
 * Store AI Analysis function
 * Handles storing comprehensive AI analysis of multiple observations
 */

import { Database } from 'bun:sqlite';
import { logger } from '../../../utils/logger.js';
import type { AIAnalysisInput, StoreAIAnalysisResult } from './types.js';

/**
 * Store an AI analysis (from SDK aggregation)
 * Returns the ID of the inserted analysis and the observation IDs that were linked
 */
export function storeAIAnalysis(
  db: Database,
  memorySessionId: string,
  project: string,
  analysis: AIAnalysisInput,
  discoveryTokens: number = 0,
  observationIds: number[] = [],
  overrideTimestampEpoch?: number
): StoreAIAnalysisResult {
  // Use override timestamp if provided (for backfill or testing)
  const timestampEpoch = overrideTimestampEpoch ?? Date.now();
  const timestampIso = new Date(timestampEpoch).toISOString();

  const txResult = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO ai_analysis
      (memory_session_id, project, analysis_text, key_insights, connections,
       discovery_tokens, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      memorySessionId,
      project,
      analysis.analysisText,
      analysis.keyInsights ? JSON.stringify(analysis.keyInsights) : null,
      analysis.connections ? JSON.stringify(analysis.connections) : null,
      discoveryTokens,
      timestampIso,
      timestampEpoch
    );

    const analysisId = Number(result.lastInsertRowid);

    // Link observations to this analysis
    if (observationIds.length > 0) {
      const updateStmt = db.prepare(`
        UPDATE observations
        SET ai_analysis_id = ?
        WHERE id = ?
      `);

      for (const obsId of observationIds) {
        updateStmt.run(analysisId, obsId);
      }

      logger.info('AI_ANALYSIS', 'Linked observations to AI analysis', {
        analysisId,
        observationCount: observationIds.length,
        project
      });
    }

    return {
      id: analysisId,
      createdAtEpoch: timestampEpoch
    };
  })();

  return txResult;
}

/**
 * Get observations linked to an AI analysis
 */
export function getObservationsForAnalysis(
  db: Database,
  analysisId: number
): number[] {
  const stmt = db.prepare(`
    SELECT id FROM observations
    WHERE ai_analysis_id = ?
    ORDER BY created_at_epoch ASC
  `);

  const rows = stmt.all(analysisId) as Array<{ id: number }>;
  return rows.map(row => row.id);
}

/**
 * Check if observations already have an AI analysis
 */
export function getExistingAnalysisForObservations(
  db: Database,
  observationIds: number[]
): number | null {
  if (observationIds.length === 0) {
    return null;
  }

  const placeholders = observationIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT DISTINCT ai_analysis_id
    FROM observations
    WHERE id IN (${placeholders})
    AND ai_analysis_id IS NOT NULL
    LIMIT 1
  `);

  const row = stmt.get(...observationIds) as { ai_analysis_id: number } | undefined;
  return row ? row.ai_analysis_id : null;
}
