/**
 * Pricing Presets
 *
 * Predefined pricing configurations for common AI providers.
 * Users select a preset to automatically configure billing type and pricing.
 */

import type { BillingType } from './types.js';

/**
 * Pricing preset definition.
 */
export interface PricingPreset {
  id: string;
  name: string;
  billingType: BillingType;
  // Token pricing (per million tokens, USD)
  input?: number;
  output?: number;
  cacheCreation?: number;
  cacheRead?: number;
  // Message pricing (for subscription plans)
  dailyMessages?: number;
  monthlyMessages?: number;
}

/**
 * All available pricing presets.
 */
export const PRICING_PRESETS: PricingPreset[] = [
  // =========================================================================
  // Claude API (Direct)
  // =========================================================================
  {
    id: 'claude-haiku',
    name: 'Claude Haiku (API)',
    billingType: 'token',
    input: 0.25,
    output: 1.25,
    cacheCreation: 0.30,
    cacheRead: 0.03,
  },
  {
    id: 'claude-sonnet',
    name: 'Claude Sonnet (API)',
    billingType: 'token',
    input: 3.00,
    output: 15.00,
    cacheCreation: 3.75,
    cacheRead: 0.30,
  },
  {
    id: 'claude-opus',
    name: 'Claude Opus (API)',
    billingType: 'token',
    input: 15.00,
    output: 75.00,
    cacheCreation: 18.75,
    cacheRead: 1.50,
  },

  // =========================================================================
  // Claude Max (Subscription)
  // =========================================================================
  {
    id: 'claude-max',
    name: 'Claude Max (Subscription)',
    billingType: 'message',
    dailyMessages: 100,
    monthlyMessages: 3000,
  },

  // =========================================================================
  // AWS Bedrock
  // =========================================================================
  {
    id: 'bedrock-haiku',
    name: 'AWS Bedrock Haiku',
    billingType: 'token',
    input: 0.25,
    output: 1.25,
    // Bedrock doesn't support prompt caching (as of 2024)
  },
  {
    id: 'bedrock-sonnet',
    name: 'AWS Bedrock Sonnet',
    billingType: 'token',
    input: 3.00,
    output: 15.00,
  },
  {
    id: 'bedrock-opus',
    name: 'AWS Bedrock Opus',
    billingType: 'token',
    input: 15.00,
    output: 75.00,
  },

  // =========================================================================
  // Google Gemini
  // =========================================================================
  {
    id: 'gemini-free',
    name: 'Gemini (Free Tier)',
    billingType: 'free',
  },
  {
    id: 'gemini-paid',
    name: 'Gemini (Paid)',
    billingType: 'token',
    input: 0.075,  // Gemini 1.5 Flash pricing
    output: 0.30,
  },

  // =========================================================================
  // OpenRouter
  // =========================================================================
  {
    id: 'openrouter-free',
    name: 'OpenRouter (Free Models)',
    billingType: 'free',
  },
  {
    id: 'openrouter-paid',
    name: 'OpenRouter (Paid)',
    billingType: 'token',
    // Prices vary by model - use custom for specific models
    input: 1.00,
    output: 3.00,
  },

  // =========================================================================
  // DashScope (Alibaba Cloud)
  // =========================================================================
  {
    id: 'dashscope-qwen-turbo',
    name: 'DashScope Qwen Turbo',
    billingType: 'token',
    input: 0.30,
    output: 0.60,
  },
  {
    id: 'dashscope-qwen-plus',
    name: 'DashScope Qwen Plus',
    billingType: 'token',
    input: 0.80,
    output: 2.00,
  },
  {
    id: 'dashscope-qwen-max',
    name: 'DashScope Qwen Max',
    billingType: 'token',
    input: 2.40,
    output: 9.60,
  },

  // =========================================================================
  // Custom
  // =========================================================================
  {
    id: 'custom',
    name: 'Custom Pricing',
    billingType: 'token',
    // User must provide CLAUDE_MEM_BUDGET_CUSTOM_PRICING
  },
];

/**
 * Get preset by ID.
 * Returns undefined if not found.
 */
export function getPresetById(id: string): PricingPreset | undefined {
  return PRICING_PRESETS.find(p => p.id === id);
}

/**
 * Get default preset.
 */
export function getDefaultPreset(): PricingPreset {
  return PRICING_PRESETS.find(p => p.id === 'claude-haiku')!;
}

/**
 * Calculate token cost in USD.
 *
 * @param preset - Pricing preset to use
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @param cacheCreationTokens - Number of cache creation tokens (optional)
 * @param cacheReadTokens - Number of cache read tokens (optional)
 * @returns Cost in USD, or 0 for free tier
 */
export function calculateTokenCost(
  preset: PricingPreset,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number = 0,
  cacheReadTokens: number = 0
): number {
  if (preset.billingType === 'free') {
    return 0;
  }

  if (preset.billingType === 'message') {
    // Message-based billing returns 1 per message
    return 1;
  }

  // Token-based billing
  let cost = 0;

  if (preset.input) {
    cost += (inputTokens / 1_000_000) * preset.input;
  }

  if (preset.output) {
    cost += (outputTokens / 1_000_000) * preset.output;
  }

  if (preset.cacheCreation && cacheCreationTokens > 0) {
    cost += (cacheCreationTokens / 1_000_000) * preset.cacheCreation;
  }

  if (preset.cacheRead && cacheReadTokens > 0) {
    cost += (cacheReadTokens / 1_000_000) * preset.cacheRead;
  }

  return cost;
}

/**
 * Estimate cost before API call (conservative estimate).
 * Uses average output/input ratio for estimation.
 *
 * @param preset - Pricing preset to use
 * @param estimatedInputTokens - Estimated input tokens
 * @param outputRatio - Expected output/input ratio (default 0.5)
 * @returns Estimated cost in USD
 */
export function estimateCost(
  preset: PricingPreset,
  estimatedInputTokens: number,
  outputRatio: number = 0.5
): number {
  if (preset.billingType === 'free') {
    return 0;
  }

  if (preset.billingType === 'message') {
    return 1; // One message
  }

  const estimatedOutputTokens = Math.ceil(estimatedInputTokens * outputRatio);
  return calculateTokenCost(preset, estimatedInputTokens, estimatedOutputTokens);
}

/**
 * Format cost for display.
 *
 * @param costUsd - Cost in USD
 * @param billingType - Billing type
 * @returns Formatted string
 */
export function formatCost(costUsd: number, billingType: BillingType): string {
  if (billingType === 'free') {
    return 'Free';
  }

  if (billingType === 'message') {
    return `${Math.round(costUsd)} messages`;
  }

  if (costUsd < 0.01) {
    return `$${costUsd.toFixed(4)}`;
  }

  return `$${costUsd.toFixed(2)}`;
}
