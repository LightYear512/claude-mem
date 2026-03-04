/**
 * BudgetController
 *
 * Industrial-grade cost tracking and budget enforcement for AI API calls.
 * Features:
 * - Two-phase commit (reserve → commit/rollback) for API failure recovery
 * - Optimistic locking with retry for concurrent safety
 * - Daily/monthly budget tracking with automatic reset
 * - Support for token, message, and free billing types
 */

import { Database } from 'bun:sqlite';
import { logger } from '../../../utils/logger.js';
import { SettingsDefaultsManager } from '../../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../../shared/paths.js';
import { getPresetById, getDefaultPreset, calculateTokenCost, type PricingPreset } from './pricing-presets.js';
import {
  type TimeProvider,
  type BudgetState,
  type BudgetTransaction,
  type BudgetConfig,
  type BudgetStatus,
  type ReserveResult,
  type BudgetHistoryQuery,
  type BudgetHistoryResponse,
  RealTimeProvider,
  OptimisticLockError,
  parseCustomPricing,
} from './types.js';

/**
 * BudgetController - manages cost tracking with two-phase commit and optimistic locking.
 */
export class BudgetController {
  private warningTriggered = false;
  private exceededTriggered = false;
  private configCache: BudgetConfig | null = null;
  private configCacheTime = 0;
  private static readonly CONFIG_CACHE_TTL_MS = 30_000; // 30 seconds

  constructor(
    private db: Database,
    private timeProvider: TimeProvider = new RealTimeProvider()
  ) {}

  /**
   * Initialize budget controller (call on Worker startup).
   * - Ensures budget_state has initial row
   * - Syncs config from settings
   * - Checks for date reset
   * - Recovers abandoned transactions
   */
  initialize(): void {
    // 1. Ensure budget_state has initial row
    const existing = this.db.prepare(`SELECT id FROM budget_state WHERE id = 1`).get();
    if (!existing) {
      const config = this.getConfig();
      this.db.prepare(`
        INSERT INTO budget_state (
          id, budget_date, budget_month,
          spent_today_micros, spent_month_micros,
          daily_limit_micros, monthly_limit_micros,
          version, last_update_epoch
        ) VALUES (1, ?, ?, 0, 0, ?, ?, 1, ?)
      `).run(
        this.timeProvider.today(),
        this.timeProvider.month(),
        config.dailyLimitMicros,
        config.monthlyLimitMicros,
        Date.now()
      );
      logger.info('BUDGET', 'Initialized budget_state');
    }

    // 2. Sync config from settings
    this.syncConfigToState();

    // 3. Check for date reset
    this.ensureDateReset();

    // 4. Recover abandoned transactions
    const recovered = this.recoverAbandonedTransactions();
    if (recovered > 0) {
      logger.info('BUDGET', `Recovered ${recovered} abandoned transactions`);
    }

    logger.info('BUDGET', 'BudgetController initialized');
  }

  /**
   * Phase 1: Reserve cost before API call.
   * Returns transaction ID for commit/rollback.
   * Uses optimistic locking with retry on conflict.
   *
   * @param estimatedCostUsd - Estimated cost in USD
   * @param provider - Provider name (e.g., 'claude', 'gemini')
   * @param sessionDbId - Optional session database ID
   * @param maxRetries - Maximum retry attempts on lock conflict
   * @returns ReserveResult with txId if successful
   */
  async reserve(
    estimatedCostUsd: number,
    provider: string,
    sessionDbId?: number,
    maxRetries: number = 3
  ): Promise<ReserveResult> {
    const config = this.getConfig();

    // Skip if budget tracking disabled
    if (!config.enabled) {
      return { success: true, txId: null };
    }

    // Free tier: no cost tracking
    if (config.billingType === 'free') {
      return { success: true, txId: null };
    }

    const txId = crypto.randomUUID();
    const costMicros = Math.round(estimatedCostUsd * 1_000_000);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = this.db.transaction(() => {
          // 0. Check and reset date if needed
          this.ensureDateReset();

          // 1. Read current state with version
          const state = this.db.prepare(`
            SELECT spent_today_micros, spent_month_micros,
                   daily_limit_micros, monthly_limit_micros, version
            FROM budget_state WHERE id = 1
          `).get() as BudgetState;

          // 2. Check daily limit
          if (state.spent_today_micros + costMicros > state.daily_limit_micros) {
            return {
              success: false,
              txId: null,
              reason: 'daily_limit' as const,
              used: state.spent_today_micros / 1_000_000,
              limit: state.daily_limit_micros / 1_000_000,
            };
          }

          // 3. Check monthly limit
          if (state.spent_month_micros + costMicros > state.monthly_limit_micros) {
            return {
              success: false,
              txId: null,
              reason: 'monthly_limit' as const,
              used: state.spent_month_micros / 1_000_000,
              limit: state.monthly_limit_micros / 1_000_000,
            };
          }

          // 4. Optimistic lock update (pre-deduct cost)
          const updateResult = this.db.prepare(`
            UPDATE budget_state
            SET spent_today_micros = spent_today_micros + ?,
                spent_month_micros = spent_month_micros + ?,
                version = version + 1,
                last_update_epoch = ?
            WHERE id = 1 AND version = ?
          `).run(costMicros, costMicros, Date.now(), state.version);

          if (updateResult.changes === 0) {
            throw new OptimisticLockError('Concurrent update detected');
          }

          // 5. Record transaction (reserved state)
          this.db.prepare(`
            INSERT INTO budget_transactions (id, phase, cost_micros, provider, session_db_id, created_at_epoch)
            VALUES (?, 'reserved', ?, ?, ?, ?)
          `).run(txId, costMicros, provider, sessionDbId ?? null, Date.now());

          // 6. Check warning threshold (80%)
          const newTodayMicros = state.spent_today_micros + costMicros;
          const dailyPercent = newTodayMicros / state.daily_limit_micros;
          if (dailyPercent >= 0.8 && !this.warningTriggered) {
            this.warningTriggered = true;
            logger.warn('BUDGET', 'Daily budget warning: 80% used', {
              used: newTodayMicros / 1_000_000,
              limit: state.daily_limit_micros / 1_000_000,
              percent: Math.round(dailyPercent * 100),
            });
          }

          return { success: true, txId, costMicros };
        })();

        return result;
      } catch (e) {
        if (e instanceof OptimisticLockError && attempt < maxRetries - 1) {
          // Exponential backoff: 1ms, 2ms, 4ms
          const delayMs = Math.pow(2, attempt);
          logger.debug('BUDGET', `Optimistic lock conflict, retry ${attempt + 1}/${maxRetries}`, { delayMs });

          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        throw e;
      }
    }

    throw new Error('Max retries exceeded for budget reservation');
  }

  /**
   * Phase 2a: Commit cost after successful API call.
   *
   * @param txId - Transaction ID from reserve()
   * @param observationId - Observation ID to link
   * @param actualCostUsd - Actual cost (if different from estimate)
   * @param tokenDetails - Optional token breakdown for analytics
   */
  commit(
    txId: string,
    observationId: number,
    actualCostUsd?: number,
    tokenDetails?: {
      inputTokens?: number;
      outputTokens?: number;
      cacheCreationTokens?: number;
      cacheReadTokens?: number;
      priceInputPerM?: number;
      priceOutputPerM?: number;
    }
  ): void {
    this.db.transaction(() => {
      const tx = this.db.prepare(`
        SELECT * FROM budget_transactions WHERE id = ? AND phase = 'reserved'
      `).get(txId) as BudgetTransaction | undefined;

      if (!tx) {
        logger.warn('BUDGET', `Commit: transaction ${txId} not found or not reserved`);
        return;
      }

      // Adjust cost if actual differs from estimate
      if (actualCostUsd !== undefined) {
        const actualMicros = Math.round(actualCostUsd * 1_000_000);
        const diff = actualMicros - tx.cost_micros;

        if (diff !== 0) {
          // Date alignment check: only adjust periods where the transaction's date
          // matches the current budget period. After a date/month reset, the reserved
          // amount from a previous period is no longer reflected in spent_*_micros.
          const state = this.db.prepare(`
            SELECT budget_date, budget_month FROM budget_state WHERE id = 1
          `).get() as { budget_date: string; budget_month: string };

          const txDate = new Date(tx.created_at_epoch);
          const txDateStr = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;
          const txMonthStr = txDateStr.substring(0, 7);

          const todayDiff = txDateStr === state.budget_date ? diff : 0;
          const monthDiff = txMonthStr === state.budget_month ? diff : 0;

          if (todayDiff !== 0 || monthDiff !== 0) {
            this.db.prepare(`
              UPDATE budget_state
              SET spent_today_micros = MAX(0, spent_today_micros + ?),
                  spent_month_micros = MAX(0, spent_month_micros + ?),
                  version = version + 1,
                  last_update_epoch = ?
              WHERE id = 1
            `).run(todayDiff, monthDiff, Date.now());
          }
        }
      }

      // Update transaction state
      this.db.prepare(`
        UPDATE budget_transactions
        SET phase = 'committed', observation_id = ?, committed_at_epoch = ?
        WHERE id = ?
      `).run(observationId, Date.now(), txId);

      // Write history record
      const finalCostMicros = actualCostUsd !== undefined
        ? Math.round(actualCostUsd * 1_000_000)
        : tx.cost_micros;

      this.db.prepare(`
        INSERT INTO budget_records (
          date_key, month_key, provider, observation_id, session_db_id,
          input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
          cost_micros, price_input_per_m, price_output_per_m, created_at_epoch
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        this.timeProvider.today(),
        this.timeProvider.month(),
        tx.provider,
        observationId,
        tx.session_db_id ?? null,
        tokenDetails?.inputTokens ?? 0,
        tokenDetails?.outputTokens ?? 0,
        tokenDetails?.cacheCreationTokens ?? 0,
        tokenDetails?.cacheReadTokens ?? 0,
        finalCostMicros,
        tokenDetails?.priceInputPerM ?? null,
        tokenDetails?.priceOutputPerM ?? null,
        Date.now()
      );

      logger.debug('BUDGET', 'Cost committed', {
        txId,
        observationId,
        costUsd: finalCostMicros / 1_000_000,
      });
    })();
  }

  /**
   * Phase 2b: Rollback cost after API failure.
   *
   * @param txId - Transaction ID from reserve()
   * @param reason - Reason for rollback
   */
  rollback(txId: string, reason: string): void {
    this.db.transaction(() => {
      const tx = this.db.prepare(`
        SELECT * FROM budget_transactions WHERE id = ? AND phase = 'reserved'
      `).get(txId) as BudgetTransaction | undefined;

      if (!tx) {
        logger.warn('BUDGET', `Rollback: transaction ${txId} not found or not reserved`);
        return;
      }

      // Determine if budget adjustment is needed based on date alignment.
      // After a date reset, spent_today_micros is zeroed so the reserved amount
      // from a previous day is no longer reflected — subtracting would go negative.
      // Same logic applies to month resets for spent_month_micros.
      const state = this.db.prepare(`
        SELECT budget_date, budget_month FROM budget_state WHERE id = 1
      `).get() as { budget_date: string; budget_month: string };

      const txDate = new Date(tx.created_at_epoch);
      const txDateStr = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;
      const txMonthStr = txDateStr.substring(0, 7);

      const todayAdjust = txDateStr === state.budget_date ? tx.cost_micros : 0;
      const monthAdjust = txMonthStr === state.budget_month ? tx.cost_micros : 0;

      if (todayAdjust > 0 || monthAdjust > 0) {
        this.db.prepare(`
          UPDATE budget_state
          SET spent_today_micros = MAX(0, spent_today_micros - ?),
              spent_month_micros = MAX(0, spent_month_micros - ?)
          WHERE id = 1
        `).run(todayAdjust, monthAdjust);
      }

      // Update transaction state
      this.db.prepare(`
        UPDATE budget_transactions
        SET phase = 'rolled_back', rolled_back_at_epoch = ?, error_reason = ?
        WHERE id = ?
      `).run(Date.now(), reason, txId);

      logger.info('BUDGET', 'Cost rolled back', {
        txId,
        reason,
        costUsd: tx.cost_micros / 1_000_000,
        adjustedToday: todayAdjust > 0,
        adjustedMonth: monthAdjust > 0,
      });
    })();
  }

  /**
   * Check and reset budget on date change.
   * Called internally before each reserve.
   */
  private ensureDateReset(): void {
    const today = this.timeProvider.today();
    const month = this.timeProvider.month();

    const state = this.db.prepare(`
      SELECT budget_date, budget_month FROM budget_state WHERE id = 1
    `).get() as { budget_date: string; budget_month: string } | undefined;

    if (!state) return;

    // Cross-day reset
    if (state.budget_date !== today) {
      logger.info('BUDGET', 'Daily budget reset', {
        oldDate: state.budget_date,
        newDate: today,
      });

      // Check for cross-month
      const isNewMonth = state.budget_month !== month;

      this.db.prepare(`
        UPDATE budget_state
        SET budget_date = ?,
            budget_month = ?,
            spent_today_micros = 0,
            spent_month_micros = CASE WHEN ? THEN 0 ELSE spent_month_micros END
        WHERE id = 1
      `).run(today, month, isNewMonth ? 1 : 0);

      // Reset warning flags
      this.warningTriggered = false;
      this.exceededTriggered = false;

      if (isNewMonth) {
        logger.info('BUDGET', 'Monthly budget reset', {
          oldMonth: state.budget_month,
          newMonth: month,
        });
      }
    }
  }

  /**
   * Recover abandoned transactions (reserved but not committed/rolled_back).
   * Call on startup to clean up from crashes.
   *
   * @param timeoutMs - Timeout for considering transaction abandoned (default 1 hour)
   * @returns Number of recovered transactions
   */
  recoverAbandonedTransactions(timeoutMs: number = 3600000): number {
    const cutoff = Date.now() - timeoutMs;

    const abandoned = this.db.prepare(`
      SELECT id FROM budget_transactions
      WHERE phase = 'reserved' AND created_at_epoch < ?
    `).all(cutoff) as Array<{ id: string }>;

    for (const tx of abandoned) {
      this.rollback(tx.id, 'Abandoned transaction (timeout)');
    }

    return abandoned.length;
  }

  /**
   * Get current budget status.
   */
  getStatus(): BudgetStatus {
    const config = this.getConfig();
    const state = this.db.prepare(`
      SELECT * FROM budget_state WHERE id = 1
    `).get() as BudgetState | undefined;

    if (!state) {
      // Return default status if not initialized
      return {
        enabled: config.enabled,
        preset: config.preset,
        billingType: config.billingType,
        dailyLimit: config.dailyLimitMicros / 1_000_000,
        monthlyLimit: config.monthlyLimitMicros / 1_000_000,
        todayUsed: 0,
        monthUsed: 0,
        todayPercent: 0,
        monthPercent: 0,
        isAtDailyLimit: false,
        isAtMonthlyLimit: false,
      };
    }

    const todayPercent = state.daily_limit_micros > 0
      ? state.spent_today_micros / state.daily_limit_micros
      : 0;
    const monthPercent = state.monthly_limit_micros > 0
      ? state.spent_month_micros / state.monthly_limit_micros
      : 0;

    return {
      enabled: config.enabled,
      preset: config.preset,
      billingType: config.billingType,
      dailyLimit: state.daily_limit_micros / 1_000_000,
      monthlyLimit: state.monthly_limit_micros / 1_000_000,
      todayUsed: state.spent_today_micros / 1_000_000,
      monthUsed: state.spent_month_micros / 1_000_000,
      todayPercent,
      monthPercent,
      isAtDailyLimit: todayPercent >= 1,
      isAtMonthlyLimit: monthPercent >= 1,
    };
  }

  /**
   * Get budget history with pagination.
   */
  getHistory(query: BudgetHistoryQuery = {}): BudgetHistoryResponse {
    const limit = Math.min(query.limit ?? 50, 500);
    const offset = query.offset ?? 0;

    let whereClause = '';
    const params: (string | number)[] = [];

    if (query.dateFrom) {
      whereClause += ' AND date_key >= ?';
      params.push(query.dateFrom);
    }
    if (query.dateTo) {
      whereClause += ' AND date_key <= ?';
      params.push(query.dateTo);
    }

    // Get total count
    const countRow = this.db.prepare(`
      SELECT COUNT(DISTINCT date_key) as total
      FROM budget_records
      WHERE 1=1 ${whereClause}
    `).get(...params) as { total: number };

    // Get aggregated data by date
    const rows = this.db.prepare(`
      SELECT
        date_key as date,
        SUM(cost_micros) as cost_micros,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        COUNT(*) as transaction_count
      FROM budget_records
      WHERE 1=1 ${whereClause}
      GROUP BY date_key
      ORDER BY date_key DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Array<{
      date: string;
      cost_micros: number;
      input_tokens: number;
      output_tokens: number;
      transaction_count: number;
    }>;

    return {
      total: countRow.total,
      limit,
      offset,
      items: rows.map(row => ({
        date: row.date,
        costUsd: row.cost_micros / 1_000_000,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        transactionCount: row.transaction_count,
      })),
    };
  }

  /**
   * Get configuration from settings file.
   */
  getConfig(): BudgetConfig {
    const now = Date.now();
    if (this.configCache && (now - this.configCacheTime) < BudgetController.CONFIG_CACHE_TTL_MS) {
      return this.configCache;
    }

    const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
    const presetId = settings.CLAUDE_MEM_BUDGET_PRESET || 'claude-haiku';
    const preset = getPresetById(presetId) ?? getDefaultPreset();

    const config: BudgetConfig = {
      enabled: settings.CLAUDE_MEM_BUDGET_ENABLED === 'true',
      preset: presetId,
      billingType: preset.billingType,
      dailyLimitMicros: Math.round((parseFloat(settings.CLAUDE_MEM_BUDGET_DAILY_LIMIT || '1.00') || 1.00) * 1_000_000),
      monthlyLimitMicros: Math.round((parseFloat(settings.CLAUDE_MEM_BUDGET_MONTHLY_LIMIT || '20.00') || 20.00) * 1_000_000),
    };

    this.configCache = config;
    this.configCacheTime = now;
    return config;
  }

  /**
   * Sync settings to database state.
   * Call when settings change.
   */
  syncConfigToState(): void {
    // Invalidate cache so we read fresh settings
    this.configCache = null;
    const config = this.getConfig();

    this.db.prepare(`
      UPDATE budget_state
      SET daily_limit_micros = ?,
          monthly_limit_micros = ?
      WHERE id = 1
    `).run(config.dailyLimitMicros, config.monthlyLimitMicros);

    logger.info('BUDGET', 'Config synced to state', {
      dailyLimit: config.dailyLimitMicros / 1_000_000,
      monthlyLimit: config.monthlyLimitMicros / 1_000_000,
    });
  }

  /**
   * Check if an API call can be afforded (without reserving).
   * Useful for UI display.
   */
  canAfford(estimatedCostUsd: number): boolean {
    const config = this.getConfig();
    if (!config.enabled || config.billingType === 'free') {
      return true;
    }

    const costMicros = Math.round(estimatedCostUsd * 1_000_000);
    const state = this.db.prepare(`
      SELECT spent_today_micros, spent_month_micros,
             daily_limit_micros, monthly_limit_micros
      FROM budget_state WHERE id = 1
    `).get() as BudgetState | undefined;

    if (!state) return true;

    return (
      state.spent_today_micros + costMicros <= state.daily_limit_micros &&
      state.spent_month_micros + costMicros <= state.monthly_limit_micros
    );
  }

  /**
   * Get pricing preset for current configuration.
   * For 'custom' preset, overrides pricing with user-configured values.
   */
  getCurrentPreset(): PricingPreset {
    const config = this.getConfig();
    const preset = getPresetById(config.preset) ?? getDefaultPreset();

    if (config.preset === 'custom') {
      const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
      const customPricing = parseCustomPricing(settings.CLAUDE_MEM_BUDGET_CUSTOM_PRICING);
      if (customPricing) {
        return {
          ...preset,
          input: customPricing.input,
          output: customPricing.output,
          cacheCreation: customPricing.cacheCreation,
          cacheRead: customPricing.cacheRead,
        };
      }
    }

    return preset;
  }

  /**
   * Calculate cost using current preset configuration.
   * Returns 0 if budget tracking is disabled or billing type is free.
   *
   * @param inputTokens - Number of input tokens
   * @param outputTokens - Number of output tokens
   * @param cacheCreationTokens - Cache creation tokens (optional)
   * @param cacheReadTokens - Cache read tokens (optional)
   * @returns Cost in USD
   */
  calculateCost(
    inputTokens: number,
    outputTokens: number,
    cacheCreationTokens: number = 0,
    cacheReadTokens: number = 0
  ): number {
    const config = this.getConfig();

    // No cost tracking if disabled or free tier
    if (!config.enabled || config.billingType === 'free') {
      return 0;
    }

    const preset = this.getCurrentPreset();
    return calculateTokenCost(preset, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens);
  }

  /**
   * Estimate cost before API call (for budget reservation).
   * Uses conservative output estimate.
   *
   * @param estimatedInputTokens - Estimated input tokens
   * @param outputRatio - Expected output/input ratio (default 0.5)
   * @returns Estimated cost in USD
   */
  estimateCost(estimatedInputTokens: number, outputRatio: number = 0.5): number {
    const config = this.getConfig();

    // No cost tracking if disabled or free tier
    if (!config.enabled || config.billingType === 'free') {
      return 0;
    }

    const estimatedOutputTokens = Math.ceil(estimatedInputTokens * outputRatio);
    return this.calculateCost(estimatedInputTokens, estimatedOutputTokens);
  }

  /**
   * Check if budget tracking is enabled and not free tier.
   * Useful for agents to skip budget operations entirely.
   */
  isTrackingEnabled(): boolean {
    const config = this.getConfig();
    return config.enabled && config.billingType !== 'free';
  }
}
