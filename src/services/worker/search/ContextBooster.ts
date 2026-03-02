/**
 * ContextBooster - Re-ranks search results based on work context affinity.
 *
 * Computes affinity between each search result's metadata and the current
 * session's work context, then blends with the original ranking to produce
 * a context-aware ordering. Uses Soft Boost: all results are preserved,
 * only the order changes.
 */

import type { WorkContext } from '../../sqlite/work-context/types.js';
import type { ChromaMetadata } from './types.js';
import { inferModules } from '../../sqlite/work-context/module-inference.js';
import { logger } from '../../../utils/logger.js';

/** Default boost weight: 30% context affinity, 70% original ranking */
const DEFAULT_BOOST_WEIGHT = 0.3;

/** Affinity dimension weights (must sum to 1.0) */
const WEIGHTS = {
  files: 0.4,
  modules: 0.3,
  concepts: 0.2,
  sameSession: 0.1,
} as const;

export interface RankedItem {
  id: number;
  meta: ChromaMetadata;
  /** Original position-based score [0, 1], higher = better */
  originalScore: number;
  /** Affinity with work context [0, 1] */
  affinityScore: number;
  /** Blended final score */
  finalScore: number;
}

/**
 * Compute Jaccard similarity between two string arrays.
 * Returns 0 if both arrays are empty.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Parse a comma-separated or JSON string into a string array.
 */
function parseStringList(value: string | undefined): string[] {
  if (!value) return [];
  // Try JSON first
  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch { /* fall through to comma split */ }
  }
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

export class ContextBooster {
  /**
   * Re-rank Chroma search results based on work context affinity.
   *
   * @param items - Items from Chroma (after recency filter), with metadata
   * @param workContext - Current session's accumulated work context
   * @param boostWeight - Balance between original ranking and affinity [0, 1]
   * @returns Re-ranked items (same items, new order)
   */
  boost(
    items: Array<{ id: number; meta: ChromaMetadata }>,
    workContext: WorkContext,
    boostWeight: number = DEFAULT_BOOST_WEIGHT
  ): Array<{ id: number; meta: ChromaMetadata }> {
    if (items.length === 0 || boostWeight <= 0) return items;
    if (boostWeight > 1) boostWeight = 1;

    // If work context has no signals, skip boosting
    if (workContext.files.length === 0 && workContext.concepts.length === 0 && workContext.modules.length === 0) {
      return items;
    }

    const ranked: RankedItem[] = items.map((item, index) => {
      // Original score: position-based, first item gets highest score
      const originalScore = 1 - (index / items.length);
      const affinityScore = this.computeAffinity(item.meta, workContext);
      const finalScore = (1 - boostWeight) * originalScore + boostWeight * affinityScore;

      return { ...item, originalScore, affinityScore, finalScore };
    });

    // Sort by final score descending
    ranked.sort((a, b) => b.finalScore - a.finalScore);

    logger.debug('SEARCH', 'Context boost applied', {
      items: items.length,
      boostWeight,
      topAffinity: ranked[0]?.affinityScore?.toFixed(3) ?? '0',
    });

    // Return in the same shape as input
    return ranked.map(({ id, meta }) => ({ id, meta }));
  }

  /**
   * Re-rank hydrated SQLite results (observations) based on work context affinity.
   * Used for the SQLite-only search path (filter-only queries without Chroma).
   */
  boostObservations<T extends { files_read?: string; files_modified?: string; concepts?: string; memory_session_id?: string }>(
    results: T[],
    workContext: WorkContext,
    boostWeight: number = DEFAULT_BOOST_WEIGHT
  ): T[] {
    if (results.length === 0 || boostWeight <= 0) return results;
    if (workContext.files.length === 0 && workContext.concepts.length === 0 && workContext.modules.length === 0) {
      return results;
    }

    const scored = results.map((result, index) => {
      const originalScore = 1 - (index / results.length);

      // Extract signals from the hydrated result
      const resultFiles = [
        ...safeParseJson(result.files_read),
        ...safeParseJson(result.files_modified),
      ];
      const resultConcepts = safeParseJson(result.concepts);
      const resultModules = inferModules(resultFiles);

      const fileOverlap = jaccardSimilarity(resultFiles, workContext.files);
      const moduleOverlap = jaccardSimilarity(resultModules, workContext.modules);
      const conceptOverlap = jaccardSimilarity(resultConcepts, workContext.concepts);
      const sameSession = result.memory_session_id === workContext.contentSessionId ? 1 : 0;

      const affinityScore =
        WEIGHTS.files * fileOverlap +
        WEIGHTS.modules * moduleOverlap +
        WEIGHTS.concepts * conceptOverlap +
        WEIGHTS.sameSession * sameSession;

      const finalScore = (1 - boostWeight) * originalScore + boostWeight * affinityScore;

      return { result, finalScore };
    });

    scored.sort((a, b) => b.finalScore - a.finalScore);
    return scored.map(s => s.result);
  }

  /**
   * Compute affinity between a Chroma metadata entry and the work context.
   */
  private computeAffinity(meta: ChromaMetadata, ctx: WorkContext): number {
    // Extract file paths from metadata
    const metaFiles = [
      ...parseStringList(meta.files_read),
      ...parseStringList(meta.files_modified),
    ];
    const metaModules = inferModules(metaFiles);
    const metaConcepts = parseStringList(meta.concepts);

    const fileOverlap = jaccardSimilarity(metaFiles, ctx.files);
    const moduleOverlap = jaccardSimilarity(metaModules, ctx.modules);
    const conceptOverlap = jaccardSimilarity(metaConcepts, ctx.concepts);
    const sameSession = meta.memory_session_id === ctx.contentSessionId ? 1 : 0;

    return (
      WEIGHTS.files * fileOverlap +
      WEIGHTS.modules * moduleOverlap +
      WEIGHTS.concepts * conceptOverlap +
      WEIGHTS.sameSession * sameSession
    );
  }
}

function safeParseJson(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}
