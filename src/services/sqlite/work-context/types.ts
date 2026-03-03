/**
 * Work Context types for context-aware memory search
 */

export interface WorkContext {
  contentSessionId: string;
  project: string;
  files: string[];
  concepts: string[];
  modules: string[];
  observationCount: number;
  lastUpdatedEpoch: number;
}

/**
 * Raw row from session_work_context table
 */
export interface WorkContextRow {
  id: number;
  content_session_id: string;
  project: string;
  files: string;      // JSON string
  concepts: string;   // JSON string
  modules: string;    // JSON string
  observation_count: number;
  last_updated_epoch: number;
  created_at_epoch: number;
}
