/**
 * API endpoint paths
 * Centralized to avoid magic strings scattered throughout the codebase
 */
export const API_ENDPOINTS = {
  OBSERVATIONS: '/api/observations',
  SUMMARIES: '/api/summaries',
  PROMPTS: '/api/prompts',
  SETTINGS: '/api/settings',
  SETTINGS_TEST_CONNECTION: '/api/settings/test-connection',
  SETTINGS_RESET_VECTORS: '/api/settings/reset-vectors',
  SETTINGS_TEST_EMBEDDING: '/api/settings/test-embedding',
  SETTINGS_EMBEDDING_MODELS: '/api/settings/embedding-models',
  HEALTH: '/api/health',
  STATS: '/api/stats',
  PROCESSING_STATUS: '/api/processing-status',
  STREAM: '/stream',
  ADMIN_SHUTDOWN: '/api/admin/shutdown',
  ADMIN_RESTART: '/api/admin/restart',
} as const;
