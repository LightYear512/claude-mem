/**
 * Default settings values for Claude Memory
 * Shared across UI components and hooks
 */
export const DEFAULT_SETTINGS = {
  CLAUDE_MEM_MODEL: 'claude-sonnet-4-5',
  CLAUDE_MEM_CONTEXT_OBSERVATIONS: '50',
  CLAUDE_MEM_WORKER_PORT: '37777',
  CLAUDE_MEM_WORKER_HOST: '127.0.0.1',

  // AI Provider Configuration
  CLAUDE_MEM_PROVIDER: 'claude',
  CLAUDE_MEM_GEMINI_API_KEY: '',
  CLAUDE_MEM_GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1/models',
  CLAUDE_MEM_GEMINI_MODEL: 'gemini-2.5-flash-lite',
  CLAUDE_MEM_OPENROUTER_API_KEY: '',
  CLAUDE_MEM_OPENROUTER_MODEL: 'xiaomi/mimo-v2-flash:free',
  CLAUDE_MEM_OPENROUTER_SITE_URL: '',
  CLAUDE_MEM_OPENROUTER_APP_NAME: 'claude-mem',
  CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED: 'true',
  CLAUDE_MEM_DASHSCOPE_API_KEY: '',
  CLAUDE_MEM_DASHSCOPE_MODEL: 'qwen-plus',

  // Token Economics (all true for backwards compatibility)
  CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS: 'true',
  CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS: 'true',
  CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT: 'true',
  CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT: 'true',

  // Observation Filtering (all types and concepts)
  CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES: 'bugfix,feature,refactor,discovery,decision,change',
  CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS: 'how-it-works,why-it-exists,what-changed,problem-solution,gotcha,pattern,trade-off',

  // Display Configuration
  CLAUDE_MEM_CONTEXT_FULL_COUNT: '5',
  CLAUDE_MEM_CONTEXT_FULL_FIELD: 'narrative',
  CLAUDE_MEM_CONTEXT_SESSION_COUNT: '10',

  // Feature Toggles
  CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY: 'true',
  CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE: 'false',

  // Mode Configuration
  CLAUDE_MEM_MODE: 'code',

  // Vector Search Configuration
  CLAUDE_MEM_EMBEDDING_FUNCTION: 'default',

  // Budget Tracking Configuration
  CLAUDE_MEM_BUDGET_ENABLED: 'false',
  CLAUDE_MEM_BUDGET_PRESET: 'claude-haiku',
  CLAUDE_MEM_BUDGET_DAILY_LIMIT: '1.00',
  CLAUDE_MEM_BUDGET_MONTHLY_LIMIT: '20.00',
  CLAUDE_MEM_BUDGET_CUSTOM_PRICING: '',

  // Exclusion Settings
  CLAUDE_MEM_EXCLUDED_PROJECTS: '',
  CLAUDE_MEM_FOLDER_MD_EXCLUDE: '[]',
} as const;
