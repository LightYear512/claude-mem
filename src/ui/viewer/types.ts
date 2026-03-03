export interface Observation {
  id: number;
  memory_session_id: string;
  content_session_id: string | null;
  project: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  narrative: string | null;
  text: string | null;
  facts: string | null;
  concepts: string | null;
  files_read: string | null;
  files_modified: string | null;
  prompt_number: number | null;
  created_at: string;
  created_at_epoch: number;
}

export interface Summary {
  id: number;
  session_id: string;
  project: string;
  request?: string;
  investigated?: string;
  learned?: string;
  completed?: string;
  next_steps?: string;
  created_at_epoch: number;
}

export interface UserPrompt {
  id: number;
  content_session_id: string;
  project: string;
  prompt_number: number;
  prompt_text: string;
  created_at_epoch: number;
}

export type FeedItem =
  | (Observation & { itemType: 'observation' })
  | (Summary & { itemType: 'summary' })
  | (UserPrompt & { itemType: 'prompt' });

export interface StreamEvent {
  type: 'initial_load' | 'new_observation' | 'new_summary' | 'new_prompt' | 'processing_status';
  observations?: Observation[];
  summaries?: Summary[];
  prompts?: UserPrompt[];
  projects?: string[];
  observation?: Observation;
  summary?: Summary;
  prompt?: UserPrompt;
  isProcessing?: boolean;
}

export interface Settings {
  CLAUDE_MEM_MODEL: string;
  CLAUDE_MEM_CONTEXT_OBSERVATIONS: string;
  CLAUDE_MEM_WORKER_PORT: string;
  CLAUDE_MEM_WORKER_HOST: string;

  // AI Provider Configuration
  CLAUDE_MEM_PROVIDER?: string;  // 'claude' | 'gemini' | 'openrouter' | 'dashscope'
  CLAUDE_MEM_GEMINI_API_KEY?: string;
  CLAUDE_MEM_GEMINI_API_URL?: string;  // Custom API URL for Gemini-compatible endpoints
  CLAUDE_MEM_GEMINI_MODEL?: string;  // 'gemini-2.5-flash-lite' | 'gemini-2.5-flash' | 'gemini-3-flash-preview'
  CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED?: string;  // 'true' | 'false'
  CLAUDE_MEM_OPENROUTER_API_KEY?: string;
  CLAUDE_MEM_OPENROUTER_MODEL?: string;
  CLAUDE_MEM_OPENROUTER_SITE_URL?: string;
  CLAUDE_MEM_OPENROUTER_APP_NAME?: string;
  CLAUDE_MEM_DASHSCOPE_API_KEY?: string;
  CLAUDE_MEM_DASHSCOPE_MODEL?: string;

  // Token Economics Display
  CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS?: string;
  CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS?: string;
  CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT?: string;
  CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT?: string;

  // Observation Filtering
  CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES?: string;
  CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS?: string;

  // Display Configuration
  CLAUDE_MEM_CONTEXT_FULL_COUNT?: string;
  CLAUDE_MEM_CONTEXT_FULL_FIELD?: string;
  CLAUDE_MEM_CONTEXT_SESSION_COUNT?: string;

  // Feature Toggles
  CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY?: string;
  CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE?: string;

  // Mode Configuration
  CLAUDE_MEM_MODE?: string;  // Mode profile for observation language (e.g., 'code', 'code--zh', 'code--ja')

  // Vector Search Configuration
  CLAUDE_MEM_EMBEDDING_FUNCTION?: string;

  // Budget Tracking Configuration
  CLAUDE_MEM_BUDGET_ENABLED?: string;  // 'true' | 'false' - enable budget tracking
  CLAUDE_MEM_BUDGET_PRESET?: string;  // Pricing preset ID (e.g., 'claude-haiku', 'claude-max', 'custom')
  CLAUDE_MEM_BUDGET_DAILY_LIMIT?: string;  // Daily limit (USD for token billing, messages for message billing)
  CLAUDE_MEM_BUDGET_MONTHLY_LIMIT?: string;  // Monthly limit
  CLAUDE_MEM_BUDGET_CUSTOM_PRICING?: string;  // Custom pricing JSON (only for preset='custom')
}

export interface WorkerStats {
  version?: string;
  uptime?: number;
  activeSessions?: number;
  sseClients?: number;
}

export interface DatabaseStats {
  size?: number;
  observations?: number;
  sessions?: number;
  summaries?: number;
}

export interface Stats {
  worker?: WorkerStats;
  database?: DatabaseStats;
}

// Budget Tracking Types
export type BillingType = 'token' | 'message' | 'free';

export interface BudgetStatus {
  enabled: boolean;
  preset: string;
  billingType: BillingType;
  daily: {
    limit: number;
    used: number;
    remaining: number;
    percent: number;
  };
  monthly: {
    limit: number;
    used: number;
    remaining: number;
    percent: number;
  };
}

export interface PricingPreset {
  id: string;
  name: string;
  billingType: BillingType;
  pricing?: {
    input?: number;
    output?: number;
    cacheCreation?: number;
    cacheRead?: number;
  };
  limits?: {
    dailyMessages?: number;
    monthlyMessages?: number;
  };
}

export interface EmbeddingModelInfo {
  id: string;
  name: string;
  group: string;
  description: string;
  dimensions: number;
  size: string;
  languages: string;
  cached: boolean;
}
