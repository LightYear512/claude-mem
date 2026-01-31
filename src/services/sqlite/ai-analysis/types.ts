/**
 * AI Analysis Types
 * Type definitions for AI analysis aggregation system
 */

/**
 * AI Analysis input structure (parsed from SDK)
 */
export interface AIAnalysisInput {
  analysisText: string;
  keyInsights?: string[];
  connections?: string[];
}

/**
 * AI Analysis stored in database
 */
export interface StoredAIAnalysis {
  id: number;
  memory_session_id: string;
  project: string;
  analysis_text: string;
  key_insights: string | null; // JSON array
  connections: string | null; // JSON array
  created_at: string;
  created_at_epoch: number;
  discovery_tokens: number;
}

/**
 * Result of storing an AI analysis
 */
export interface StoreAIAnalysisResult {
  id: number;
  createdAtEpoch: number;
}

/**
 * AI Analysis search result
 */
export interface AIAnalysisSearchResult {
  id: number;
  memorySessionId: string;
  project: string;
  analysisText: string;
  keyInsights: string[];
  connections: string[];
  createdAt: string;
  createdAtEpoch: number;
  discoveryTokens: number;
}
