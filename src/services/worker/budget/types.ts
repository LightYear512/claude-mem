/**
 * Budget Controller Type Definitions
 *
 * Industrial-grade cost tracking and budget enforcement for AI API calls.
 * Supports multiple billing types (token, message, free) and providers.
 */

// ============================================================================
// Billing Types
// ============================================================================

/**
 * Billing type determines how costs are calculated:
 * - token: Per-token pricing (Claude API, Bedrock, OpenRouter)
 * - message: Per-message pricing (Claude Max subscription)
 * - free: No cost tracking (Gemini free tier)
 */
export type BillingType = 'token' | 'message' | 'free';

// ============================================================================
// Time Provider (for testability)
// ============================================================================

/**
 * Injectable time provider for testability.
 * Allows mocking time in tests for date-dependent logic.
 */
export interface TimeProvider {
  /** Get current Date object */
  now(): Date;
  /** Get today's date in YYYY-MM-DD format */
  today(): string;
  /** Get current month in YYYY-MM format */
  month(): string;
}

/**
 * Real time provider using system clock.
 */
export class RealTimeProvider implements TimeProvider {
  now(): Date {
    return new Date();
  }

  today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  month(): string {
    return this.today().substring(0, 7);
  }
}

// ============================================================================
// Database Entities
// ============================================================================

/**
 * Budget state - single-row table for current state.
 * Uses optimistic locking via version field.
 */
export interface BudgetState {
  id: number;
  budget_date: string;
  budget_month: string;
  spent_today_micros: number;
  spent_month_micros: number;
  daily_limit_micros: number;
  monthly_limit_micros: number;
  version: number;
  last_update_epoch: number;
}

/**
 * Budget transaction - two-phase commit tracking.
 */
export interface BudgetTransaction {
  id: string;
  phase: 'reserved' | 'committed' | 'rolled_back';
  cost_micros: number;
  provider: string;
  observation_id?: number;
  session_db_id?: number;
  created_at_epoch: number;
  committed_at_epoch?: number;
  rolled_back_at_epoch?: number;
  error_reason?: string;
}

/**
 * Budget record - historical cost record.
 */
export interface BudgetRecord {
  id: number;
  date_key: string;
  month_key: string;
  provider: string;
  session_db_id?: number;
  observation_id?: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_micros: number;
  price_input_per_m?: number;
  price_output_per_m?: number;
  created_at_epoch: number;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Budget configuration loaded from settings.
 */
export interface BudgetConfig {
  enabled: boolean;
  preset: string;
  billingType: BillingType;
  dailyLimitMicros: number;
  monthlyLimitMicros: number;
}

/**
 * Custom pricing configuration (for preset='custom').
 */
export interface CustomPricing {
  input: number;
  output: number;
  cacheCreation?: number;
  cacheRead?: number;
}

// ============================================================================
// API Results
// ============================================================================

/**
 * Budget status - current state for API/UI.
 */
export interface BudgetStatus {
  enabled: boolean;
  preset: string;
  billingType: BillingType;
  dailyLimit: number;
  monthlyLimit: number;
  todayUsed: number;
  monthUsed: number;
  todayPercent: number;
  monthPercent: number;
  isAtDailyLimit: boolean;
  isAtMonthlyLimit: boolean;
}

/**
 * Budget check result - synchronous check before API call.
 */
export interface BudgetCheckResult {
  allowed: boolean;
  reason?: 'daily_limit' | 'monthly_limit' | 'disabled';
  used: number;
  limit: number;
  remaining: number;
}

/**
 * Reserve result - two-phase commit phase 1.
 */
export interface ReserveResult {
  success: boolean;
  txId: string | null;
  costMicros?: number;
  reason?: 'daily_limit' | 'monthly_limit';
  used?: number;
  limit?: number;
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Optimistic lock conflict error.
 * Thrown when concurrent update detected, triggers retry.
 */
export class OptimisticLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OptimisticLockError';
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Budget validation result.
 */
export interface BudgetValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate budget settings.
 */
export function validateBudgetSettings(
  dailyLimit: number,
  monthlyLimit: number
): BudgetValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Negative check
  if (dailyLimit < 0) errors.push('Daily limit cannot be negative');
  if (monthlyLimit < 0) errors.push('Monthly limit cannot be negative');

  // Zero value check
  if (dailyLimit === 0 && monthlyLimit === 0) {
    errors.push('Both limits are 0 - all analysis will be disabled');
  }

  // Logic check
  if (dailyLimit > monthlyLimit && monthlyLimit > 0) {
    warnings.push('Daily limit exceeds monthly limit');
  }

  // Minimum value check
  if (dailyLimit > 0 && dailyLimit < 0.01) {
    warnings.push('Daily limit below $0.01 may not allow any analysis');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Parse custom pricing JSON.
 * Returns null on invalid input.
 */
export function parseCustomPricing(json: string): CustomPricing | null {
  if (!json?.trim()) return null;

  try {
    const parsed = JSON.parse(json);

    // Type validation
    if (typeof parsed.input !== 'number' || typeof parsed.output !== 'number') {
      throw new Error('input and output must be numbers');
    }

    // Range validation ($0 - $100/M)
    for (const [field, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && (value < 0 || value > 100)) {
        throw new Error(`${field} must be between 0 and 100`);
      }
    }

    return {
      input: parsed.input,
      output: parsed.output,
      cacheCreation: parsed.cacheCreation,
      cacheRead: parsed.cacheRead,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// SSE Events
// ============================================================================

/**
 * Budget SSE event for real-time notifications.
 */
export interface BudgetSSEEvent {
  type: 'budget';
  event: 'warning' | 'exceeded';
  data: {
    billingType: string;
    todayPercent: number;
    monthPercent: number;
    remaining: number;
    limit: number;
  };
}

// ============================================================================
// History API
// ============================================================================

/**
 * Budget history query parameters.
 */
export interface BudgetHistoryQuery {
  limit?: number;
  offset?: number;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Budget history item (aggregated by date).
 */
export interface BudgetHistoryItem {
  date: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  transactionCount: number;
}

/**
 * Budget history response.
 */
export interface BudgetHistoryResponse {
  total: number;
  limit: number;
  offset: number;
  items: BudgetHistoryItem[];
}
