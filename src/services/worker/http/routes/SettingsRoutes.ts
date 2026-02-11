/**
 * Settings Routes
 *
 * Handles settings management, MCP toggle, and branch switching.
 * Settings are stored in ~/.claude-mem/settings.json
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, rmSync } from 'fs';
import { execFile } from 'child_process';
import { homedir } from 'os';
import { getPackageRoot } from '../../../../shared/paths.js';
import { logger } from '../../../../utils/logger.js';
import { SettingsManager } from '../../SettingsManager.js';
import { getBranchInfo, switchBranch, pullUpdates } from '../../BranchManager.js';
import { ModeManager } from '../../domain/ModeManager.js';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { SettingsDefaultsManager } from '../../../../shared/SettingsDefaultsManager.js';
import { clearPortCache } from '../../../../shared/worker-utils.js';
import { testGeminiConnection } from '../../GeminiAgent.js';
import { testOpenRouterConnection } from '../../OpenRouterAgent.js';
import { testDashScopeConnection } from '../../DashScopeAgent.js';

const VALID_EMBEDDING_MODELS = [
  'default',
  'sentence-transformers/multilingual-MiniLM-L12-v2',
  'sentence-transformers/paraphrase-multilingual-mpnet-base-v2',
  'shibing624/text2vec-base-chinese',
  'dashscope:text-embedding-v3',
  'dashscope:text-embedding-v4',
];

const EMBEDDING_MODEL_METADATA = [
  {
    id: 'default',
    name: 'all-MiniLM-L6-v2',
    group: 'English',
    description: 'Fast, lightweight, English-optimized',
    dimensions: 384,
    size: '~80 MB',
    languages: 'English',
    cachePaths: [
      path.join(homedir(), '.cache', 'chroma', 'onnx_models', 'all-MiniLM-L6-v2', 'onnx', 'model.onnx'),
    ],
  },
  {
    id: 'sentence-transformers/multilingual-MiniLM-L12-v2',
    name: 'multilingual-MiniLM-L12-v2',
    group: 'Multilingual',
    description: 'Supports 50+ languages including Chinese',
    dimensions: 384,
    size: '~470 MB',
    languages: '50+ languages',
    cachePaths: [
      path.join(homedir(), '.cache', 'huggingface', 'hub', 'models--sentence-transformers--multilingual-MiniLM-L12-v2'),
    ],
  },
  {
    id: 'sentence-transformers/paraphrase-multilingual-mpnet-base-v2',
    name: 'paraphrase-multilingual-mpnet-base-v2',
    group: 'Multilingual',
    description: 'High quality, 50+ languages, slower',
    dimensions: 768,
    size: '~1 GB',
    languages: '50+ languages',
    cachePaths: [
      path.join(homedir(), '.cache', 'huggingface', 'hub', 'models--sentence-transformers--paraphrase-multilingual-mpnet-base-v2'),
    ],
  },
  {
    id: 'shibing624/text2vec-base-chinese',
    name: 'text2vec-base-chinese',
    group: 'Chinese',
    description: 'Best Chinese semantic understanding',
    dimensions: 768,
    size: '~400 MB',
    languages: 'Chinese',
    cachePaths: [
      path.join(homedir(), '.cache', 'huggingface', 'hub', 'models--shibing624--text2vec-base-chinese'),
    ],
  },
  {
    id: 'dashscope:text-embedding-v3',
    name: 'text-embedding-v3',
    group: 'Remote API',
    description: 'DashScope embedding (50+ languages, 1024 dim, remote)',
    dimensions: 1024,
    size: 'Remote API (no download)',
    languages: '50+ languages',
    cachePaths: [],  // No local cache, remote API
  },
  {
    id: 'dashscope:text-embedding-v4',
    name: 'text-embedding-v4',
    group: 'Remote API',
    description: 'DashScope latest embedding (100+ languages, 1024 dim, remote)',
    dimensions: 1024,
    size: 'Remote API (no download)',
    languages: '100+ languages',
    cachePaths: [],  // No local cache, remote API
  },
];

export class SettingsRoutes extends BaseRouteHandler {
  constructor(
    private settingsManager: SettingsManager,
    private onSettingsUpdated?: () => void,
    private onVectorReset?: () => void
  ) {
    super();
  }

  setupRoutes(app: express.Application): void {
    // Settings endpoints
    app.get('/api/settings', this.handleGetSettings.bind(this));
    app.post('/api/settings', this.handleUpdateSettings.bind(this));

    // MCP toggle endpoints
    app.get('/api/mcp/status', this.handleGetMcpStatus.bind(this));
    app.post('/api/mcp/toggle', this.handleToggleMcp.bind(this));

    // Branch switching endpoints
    app.get('/api/branch/status', this.handleGetBranchStatus.bind(this));
    app.post('/api/branch/switch', this.handleSwitchBranch.bind(this));
    app.post('/api/branch/update', this.handleUpdateBranch.bind(this));

    // Connection test endpoint
    app.post('/api/settings/test-connection', this.handleTestConnection.bind(this));

    // Vector database reset endpoint
    app.post('/api/settings/reset-vectors', this.handleResetVectors.bind(this));

    // Embedding model test endpoint
    app.post('/api/settings/test-embedding', this.handleTestEmbedding.bind(this));

    // Embedding model metadata endpoint
    app.get('/api/settings/embedding-models', this.handleGetEmbeddingModels.bind(this));
  }

  /**
   * Get environment settings (from ~/.claude-mem/settings.json)
   */
  private handleGetSettings = this.wrapHandler((req: Request, res: Response): void => {
    const settingsPath = path.join(homedir(), '.claude-mem', 'settings.json');
    this.ensureSettingsFile(settingsPath);
    const settings = SettingsDefaultsManager.loadFromFile(settingsPath);
    res.json(settings);
  });

  /**
   * Update environment settings (in ~/.claude-mem/settings.json) with validation
   */
  private handleUpdateSettings = this.wrapHandler((req: Request, res: Response): void => {
    // Validate all settings
    const validation = this.validateSettings(req.body);
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: validation.error
      });
      return;
    }

    // Read existing settings
    const settingsPath = path.join(homedir(), '.claude-mem', 'settings.json');
    this.ensureSettingsFile(settingsPath);
    let settings: any = {};

    if (existsSync(settingsPath)) {
      const settingsData = readFileSync(settingsPath, 'utf-8');
      try {
        settings = JSON.parse(settingsData);
      } catch (parseError) {
        logger.error('SETTINGS', 'Failed to parse settings file', { settingsPath }, parseError as Error);
        res.status(500).json({
          success: false,
          error: 'Settings file is corrupted. Delete ~/.claude-mem/settings.json to reset.'
        });
        return;
      }
    }

    // Update all settings from request body
    const settingKeys = [
      'CLAUDE_MEM_MODEL',
      'CLAUDE_MEM_CONTEXT_OBSERVATIONS',
      'CLAUDE_MEM_WORKER_PORT',
      'CLAUDE_MEM_WORKER_HOST',
      // AI Provider Configuration
      'CLAUDE_MEM_PROVIDER',
      'CLAUDE_MEM_GEMINI_API_KEY',
      'CLAUDE_MEM_GEMINI_API_URL',
      'CLAUDE_MEM_GEMINI_MODEL',
      'CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED',
      // OpenRouter Configuration
      'CLAUDE_MEM_OPENROUTER_API_KEY',
      'CLAUDE_MEM_OPENROUTER_MODEL',
      'CLAUDE_MEM_OPENROUTER_SITE_URL',
      'CLAUDE_MEM_OPENROUTER_APP_NAME',
      'CLAUDE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES',
      'CLAUDE_MEM_OPENROUTER_MAX_TOKENS',
      // DashScope Configuration
      'CLAUDE_MEM_DASHSCOPE_API_KEY',
      'CLAUDE_MEM_DASHSCOPE_MODEL',
      'CLAUDE_MEM_DASHSCOPE_MAX_CONTEXT_MESSAGES',
      'CLAUDE_MEM_DASHSCOPE_MAX_TOKENS',
      // System Configuration
      'CLAUDE_MEM_DATA_DIR',
      'CLAUDE_MEM_LOG_LEVEL',
      'CLAUDE_MEM_PYTHON_VERSION',
      'CLAUDE_CODE_PATH',
      'CLAUDE_MEM_MODE',
      // Token Economics
      'CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS',
      'CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS',
      'CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT',
      'CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT',
      // Observation Filtering
      'CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES',
      'CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS',
      // Display Configuration
      'CLAUDE_MEM_CONTEXT_FULL_COUNT',
      'CLAUDE_MEM_CONTEXT_FULL_FIELD',
      'CLAUDE_MEM_CONTEXT_SESSION_COUNT',
      // Feature Toggles
      'CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY',
      'CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE',
      // Budget Tracking Configuration
      'CLAUDE_MEM_BUDGET_ENABLED',
      'CLAUDE_MEM_BUDGET_PRESET',
      'CLAUDE_MEM_BUDGET_DAILY_LIMIT',
      'CLAUDE_MEM_BUDGET_MONTHLY_LIMIT',
      'CLAUDE_MEM_BUDGET_CUSTOM_PRICING',
      'CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED',
      // Vector Search Configuration
      'CLAUDE_MEM_EMBEDDING_FUNCTION',
    ];

    for (const key of settingKeys) {
      if (req.body[key] !== undefined) {
        settings[key] = req.body[key];
      }
    }

    // Write back
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

    // Clear port cache to force re-reading from updated settings
    clearPortCache();

    // Notify listeners (e.g., BudgetController) about settings change
    if (this.onSettingsUpdated) {
      try {
        this.onSettingsUpdated();
      } catch (error) {
        logger.warn('SETTINGS', 'onSettingsUpdated callback failed', {}, error as Error);
      }
    }

    logger.info('WORKER', 'Settings updated');
    res.json({ success: true, message: 'Settings updated successfully' });
  });

  /**
   * GET /api/mcp/status - Check if MCP search server is enabled
   */
  private handleGetMcpStatus = this.wrapHandler((req: Request, res: Response): void => {
    const enabled = this.isMcpEnabled();
    res.json({ enabled });
  });

  /**
   * POST /api/mcp/toggle - Toggle MCP search server on/off
   * Body: { enabled: boolean }
   */
  private handleToggleMcp = this.wrapHandler((req: Request, res: Response): void => {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      this.badRequest(res, 'enabled must be a boolean');
      return;
    }

    this.toggleMcp(enabled);
    res.json({ success: true, enabled: this.isMcpEnabled() });
  });

  /**
   * GET /api/branch/status - Get current branch information
   */
  private handleGetBranchStatus = this.wrapHandler((req: Request, res: Response): void => {
    const info = getBranchInfo();
    res.json(info);
  });

  /**
   * POST /api/branch/switch - Switch to a different branch
   * Body: { branch: "main" | "beta/7.0" }
   */
  private handleSwitchBranch = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const { branch } = req.body;

    if (!branch) {
      res.status(400).json({ success: false, error: 'Missing branch parameter' });
      return;
    }

    // Validate branch name
    const allowedBranches = ['main', 'beta/7.0', 'feature/bun-executable'];
    if (!allowedBranches.includes(branch)) {
      res.status(400).json({
        success: false,
        error: `Invalid branch. Allowed: ${allowedBranches.join(', ')}`
      });
      return;
    }

    logger.info('WORKER', 'Branch switch requested', { branch });

    const result = await switchBranch(branch);

    if (result.success) {
      // Schedule worker restart after response is sent
      setTimeout(() => {
        logger.info('WORKER', 'Restarting worker after branch switch');
        process.exit(0); // PM2 will restart the worker
      }, 1000);
    }

    res.json(result);
  });

  /**
   * POST /api/branch/update - Pull latest updates for current branch
   */
  private handleUpdateBranch = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    logger.info('WORKER', 'Branch update requested');

    const result = await pullUpdates();

    if (result.success) {
      // Schedule worker restart after response is sent
      setTimeout(() => {
        logger.info('WORKER', 'Restarting worker after branch update');
        process.exit(0); // PM2 will restart the worker
      }, 1000);
    }

    res.json(result);
  });

  /**
   * Validate all settings from request body (single source of truth)
   */
  private validateSettings(settings: any): { valid: boolean; error?: string } {
    // Validate CLAUDE_MEM_PROVIDER
    if (settings.CLAUDE_MEM_PROVIDER) {
    const validProviders = ['claude', 'gemini', 'openrouter', 'dashscope'];
    if (!validProviders.includes(settings.CLAUDE_MEM_PROVIDER)) {
      return { valid: false, error: 'CLAUDE_MEM_PROVIDER must be "claude", "gemini", "openrouter", or "dashscope"' };
      }
    }

    // Skip CLAUDE_MEM_GEMINI_MODEL validation - model names change frequently
    // and custom API endpoints may support different models.
    // GeminiAgent.ts will log a warning if an unknown model is used with the default API.

    // Validate CLAUDE_MEM_CONTEXT_OBSERVATIONS
    if (settings.CLAUDE_MEM_CONTEXT_OBSERVATIONS) {
      const obsCount = parseInt(settings.CLAUDE_MEM_CONTEXT_OBSERVATIONS, 10);
      if (isNaN(obsCount) || obsCount < 1 || obsCount > 200) {
        return { valid: false, error: 'CLAUDE_MEM_CONTEXT_OBSERVATIONS must be between 1 and 200' };
      }
    }

    // Validate CLAUDE_MEM_WORKER_PORT
    if (settings.CLAUDE_MEM_WORKER_PORT) {
      const port = parseInt(settings.CLAUDE_MEM_WORKER_PORT, 10);
      if (isNaN(port) || port < 1024 || port > 65535) {
        return { valid: false, error: 'CLAUDE_MEM_WORKER_PORT must be between 1024 and 65535' };
      }
    }

    // Validate CLAUDE_MEM_WORKER_HOST (IP address or 0.0.0.0)
    if (settings.CLAUDE_MEM_WORKER_HOST) {
      const host = settings.CLAUDE_MEM_WORKER_HOST;
      // Allow localhost variants and valid IP patterns
      const validHostPattern = /^(127\.0\.0\.1|0\.0\.0\.0|localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;
      if (!validHostPattern.test(host)) {
        return { valid: false, error: 'CLAUDE_MEM_WORKER_HOST must be a valid IP address (e.g., 127.0.0.1, 0.0.0.0)' };
      }
    }

    // Validate CLAUDE_MEM_LOG_LEVEL
    if (settings.CLAUDE_MEM_LOG_LEVEL) {
      const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'SILENT'];
      if (!validLevels.includes(settings.CLAUDE_MEM_LOG_LEVEL.toUpperCase())) {
        return { valid: false, error: 'CLAUDE_MEM_LOG_LEVEL must be one of: DEBUG, INFO, WARN, ERROR, SILENT' };
      }
    }

    // Validate CLAUDE_MEM_PYTHON_VERSION (must be valid Python version format)
    if (settings.CLAUDE_MEM_PYTHON_VERSION) {
      const pythonVersionRegex = /^3\.\d{1,2}$/;
      if (!pythonVersionRegex.test(settings.CLAUDE_MEM_PYTHON_VERSION)) {
        return { valid: false, error: 'CLAUDE_MEM_PYTHON_VERSION must be in format "3.X" or "3.XX" (e.g., "3.13")' };
      }
    }

    // Validate boolean string values
    const booleanSettings = [
      'CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS',
      'CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS',
      'CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT',
      'CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT',
      'CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY',
      'CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE',
    ];

    for (const key of booleanSettings) {
      if (settings[key] && !['true', 'false'].includes(settings[key])) {
        return { valid: false, error: `${key} must be "true" or "false"` };
      }
    }

    // Validate FULL_COUNT (0-20)
    if (settings.CLAUDE_MEM_CONTEXT_FULL_COUNT) {
      const count = parseInt(settings.CLAUDE_MEM_CONTEXT_FULL_COUNT, 10);
      if (isNaN(count) || count < 0 || count > 20) {
        return { valid: false, error: 'CLAUDE_MEM_CONTEXT_FULL_COUNT must be between 0 and 20' };
      }
    }

    // Validate SESSION_COUNT (1-50)
    if (settings.CLAUDE_MEM_CONTEXT_SESSION_COUNT) {
      const count = parseInt(settings.CLAUDE_MEM_CONTEXT_SESSION_COUNT, 10);
      if (isNaN(count) || count < 1 || count > 50) {
        return { valid: false, error: 'CLAUDE_MEM_CONTEXT_SESSION_COUNT must be between 1 and 50' };
      }
    }

    // Validate FULL_FIELD
    if (settings.CLAUDE_MEM_CONTEXT_FULL_FIELD) {
      if (!['narrative', 'facts'].includes(settings.CLAUDE_MEM_CONTEXT_FULL_FIELD)) {
        return { valid: false, error: 'CLAUDE_MEM_CONTEXT_FULL_FIELD must be "narrative" or "facts"' };
      }
    }

    // Validate CLAUDE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES
    if (settings.CLAUDE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES) {
      const count = parseInt(settings.CLAUDE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES, 10);
      if (isNaN(count) || count < 1 || count > 100) {
        return { valid: false, error: 'CLAUDE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES must be between 1 and 100' };
      }
    }

    // Validate CLAUDE_MEM_OPENROUTER_MAX_TOKENS
    if (settings.CLAUDE_MEM_OPENROUTER_MAX_TOKENS) {
      const tokens = parseInt(settings.CLAUDE_MEM_OPENROUTER_MAX_TOKENS, 10);
      if (isNaN(tokens) || tokens < 1000 || tokens > 1000000) {
        return { valid: false, error: 'CLAUDE_MEM_OPENROUTER_MAX_TOKENS must be between 1000 and 1000000' };
      }
    }

    // Validate CLAUDE_MEM_DASHSCOPE_MAX_CONTEXT_MESSAGES
    if (settings.CLAUDE_MEM_DASHSCOPE_MAX_CONTEXT_MESSAGES) {
      const count = parseInt(settings.CLAUDE_MEM_DASHSCOPE_MAX_CONTEXT_MESSAGES, 10);
      if (isNaN(count) || count < 1 || count > 100) {
        return { valid: false, error: 'CLAUDE_MEM_DASHSCOPE_MAX_CONTEXT_MESSAGES must be between 1 and 100' };
      }
    }

    // Validate CLAUDE_MEM_DASHSCOPE_MAX_TOKENS
    if (settings.CLAUDE_MEM_DASHSCOPE_MAX_TOKENS) {
      const tokens = parseInt(settings.CLAUDE_MEM_DASHSCOPE_MAX_TOKENS, 10);
      if (isNaN(tokens) || tokens < 1000 || tokens > 1000000) {
        return { valid: false, error: 'CLAUDE_MEM_DASHSCOPE_MAX_TOKENS must be between 1000 and 1000000' };
      }
    }

    // Validate CLAUDE_MEM_OPENROUTER_SITE_URL if provided
    if (settings.CLAUDE_MEM_OPENROUTER_SITE_URL) {
      try {
        new URL(settings.CLAUDE_MEM_OPENROUTER_SITE_URL);
      } catch (error) {
        // Invalid URL format
        logger.debug('SETTINGS', 'Invalid URL format', { url: settings.CLAUDE_MEM_OPENROUTER_SITE_URL, error: error instanceof Error ? error.message : String(error) });
        return { valid: false, error: 'CLAUDE_MEM_OPENROUTER_SITE_URL must be a valid URL' };
      }
    }

    // Skip observation types validation - any type string is valid since modes define their own types
    // The database accepts any TEXT value, and mode-specific validation happens at parse time

    // Skip observation concepts validation - any concept string is valid since modes define their own concepts
    // The database accepts any TEXT value, and mode-specific validation happens at parse time

    // Validate Budget settings
    if (settings.CLAUDE_MEM_BUDGET_ENABLED) {
      if (!['true', 'false'].includes(settings.CLAUDE_MEM_BUDGET_ENABLED)) {
        return { valid: false, error: 'CLAUDE_MEM_BUDGET_ENABLED must be "true" or "false"' };
      }
    }

    if (settings.CLAUDE_MEM_BUDGET_DAILY_LIMIT) {
      const limit = parseFloat(settings.CLAUDE_MEM_BUDGET_DAILY_LIMIT);
      if (isNaN(limit) || limit < 0 || limit > 1000) {
        return { valid: false, error: 'CLAUDE_MEM_BUDGET_DAILY_LIMIT must be between 0 and 1000' };
      }
    }

    if (settings.CLAUDE_MEM_BUDGET_MONTHLY_LIMIT) {
      const limit = parseFloat(settings.CLAUDE_MEM_BUDGET_MONTHLY_LIMIT);
      if (isNaN(limit) || limit < 0 || limit > 10000) {
        return { valid: false, error: 'CLAUDE_MEM_BUDGET_MONTHLY_LIMIT must be between 0 and 10000' };
      }
    }

    // Validate custom pricing JSON if provided
    if (settings.CLAUDE_MEM_BUDGET_CUSTOM_PRICING) {
      try {
        const pricing = JSON.parse(settings.CLAUDE_MEM_BUDGET_CUSTOM_PRICING);
        if (typeof pricing.input !== 'number' || typeof pricing.output !== 'number') {
          return { valid: false, error: 'CLAUDE_MEM_BUDGET_CUSTOM_PRICING must contain numeric "input" and "output" fields' };
        }
        if (pricing.input < 0 || pricing.input > 100 || pricing.output < 0 || pricing.output > 100) {
          return { valid: false, error: 'Custom pricing values must be between 0 and 100 (USD per million tokens)' };
        }
      } catch (error) {
        return { valid: false, error: 'CLAUDE_MEM_BUDGET_CUSTOM_PRICING must be valid JSON' };
      }
    }

    return { valid: true };
  }

  /**
   * Check if MCP search server is enabled
   */
  private isMcpEnabled(): boolean {
    const packageRoot = getPackageRoot();
    const mcpPath = path.join(packageRoot, 'plugin', '.mcp.json');
    return existsSync(mcpPath);
  }

  /**
   * Toggle MCP search server (rename .mcp.json <-> .mcp.json.disabled)
   */
  private toggleMcp(enabled: boolean): void {
    const packageRoot = getPackageRoot();
    const mcpPath = path.join(packageRoot, 'plugin', '.mcp.json');
    const mcpDisabledPath = path.join(packageRoot, 'plugin', '.mcp.json.disabled');

    if (enabled && existsSync(mcpDisabledPath)) {
      // Enable: rename .mcp.json.disabled -> .mcp.json
      renameSync(mcpDisabledPath, mcpPath);
      logger.info('WORKER', 'MCP search server enabled');
    } else if (!enabled && existsSync(mcpPath)) {
      // Disable: rename .mcp.json -> .mcp.json.disabled
      renameSync(mcpPath, mcpDisabledPath);
      logger.info('WORKER', 'MCP search server disabled');
    } else {
      logger.debug('WORKER', 'MCP toggle no-op (already in desired state)', { enabled });
    }
  }

  /**
   * Ensure settings file exists, creating with defaults if missing
   */
  private ensureSettingsFile(settingsPath: string): void {
    if (!existsSync(settingsPath)) {
      const defaults = SettingsDefaultsManager.getAllDefaults();

      // Ensure directory exists
      const dir = path.dirname(settingsPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(settingsPath, JSON.stringify(defaults, null, 2), 'utf-8');
      logger.info('SETTINGS', 'Created settings file with defaults', { settingsPath });
    }
  }

  /**
   * POST /api/settings/test-connection - Test AI provider connection
   * Body: { provider: 'claude' | 'gemini' | 'openrouter', settings: {...} }
   *
   * Tests the connection with the provided settings (not saved settings).
   * This allows testing before saving.
   */
  private handleTestConnection = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const { provider, settings } = req.body;

    if (!provider) {
      res.status(400).json({ success: false, error: 'Missing provider parameter' });
      return;
    }

    logger.info('SETTINGS', 'Testing connection', { provider });

    try {
      let result: { success: boolean; message: string; model?: string; latencyMs?: number };

      switch (provider) {
        case 'claude':
          // Claude uses Agent SDK which requires OAuth - can't easily test without actual session
          result = {
            success: true,
            message: 'Claude provider uses your Claude account. Connection will be tested when generating observations.'
          };
          break;

        case 'gemini':
          const geminiApiKey = settings?.CLAUDE_MEM_GEMINI_API_KEY || '';
          const geminiApiUrl = settings?.CLAUDE_MEM_GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models';
          const geminiModel = settings?.CLAUDE_MEM_GEMINI_MODEL || 'gemini-2.5-flash-lite';

          if (!geminiApiKey) {
            result = { success: false, message: 'Gemini API key is required' };
          } else {
            result = await testGeminiConnection(geminiApiKey, geminiApiUrl, geminiModel);
          }
          break;

        case 'openrouter':
          const openrouterApiKey = settings?.CLAUDE_MEM_OPENROUTER_API_KEY || '';
          const openrouterModel = settings?.CLAUDE_MEM_OPENROUTER_MODEL || 'xiaomi/mimo-v2-flash:free';

          if (!openrouterApiKey) {
            result = { success: false, message: 'OpenRouter API key is required' };
          } else {
            result = await testOpenRouterConnection(openrouterApiKey, openrouterModel);
          }
          break;

        case 'dashscope':
          const dashscopeApiKey = settings?.CLAUDE_MEM_DASHSCOPE_API_KEY || '';
          const dashscopeModel = settings?.CLAUDE_MEM_DASHSCOPE_MODEL || 'qwen-plus';

          if (!dashscopeApiKey) {
            result = { success: false, message: 'DashScope API key is required' };
          } else {
            result = await testDashScopeConnection(dashscopeApiKey, dashscopeModel);
          }
          break;

        default:
          result = { success: false, message: `Unknown provider: ${provider}` };
      }

      res.json(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('SETTINGS', 'Connection test failed', { provider }, error as Error);
      res.json({
        success: false,
        message: `Connection failed: ${errorMessage}`
      });
    }
  });

  /**
   * POST /api/settings/test-embedding - Test an embedding model by loading it via uvx/sentence-transformers
   * Triggers model download on first use and validates it produces valid embeddings.
   */
  private handleTestEmbedding = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const { model } = req.body;

    if (!model) {
      res.status(400).json({ success: false, error: 'Missing model parameter' });
      return;
    }

    // Strip dimensions suffix for DashScope configs (e.g. "dashscope:text-embedding-v3:512" → "dashscope:text-embedding-v3")
    const baseModel = model.startsWith('dashscope:') ? model.split(':').slice(0, 2).join(':') : model;
    if (!VALID_EMBEDDING_MODELS.includes(baseModel)) {
      res.status(400).json({ success: false, message: `Unknown embedding model: ${model}` });
      return;
    }

    logger.info('SETTINGS', 'Testing embedding model', { model });

    // DashScope remote embedding: test via HTTP API directly
    if (model.startsWith('dashscope:')) {
      const settingsPath = path.join(homedir(), '.claude-mem', 'settings.json');
      const currentSettings = SettingsDefaultsManager.loadFromFile(settingsPath);
      const apiKey = req.body.apiKey || currentSettings.CLAUDE_MEM_DASHSCOPE_API_KEY || '';

      if (!apiKey) {
        res.json({ success: false, message: 'DashScope API key is required to test remote embedding' });
        return;
      }

      const modelParts = model.split(':');
      const embeddingModel = modelParts[1]; // e.g., 'text-embedding-v3'
      const requestedDimensions = modelParts.length >= 3 && /^\d+$/.test(modelParts[2]) ? parseInt(modelParts[2], 10) : undefined;
      const apiUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';

      try {
        const requestBody: Record<string, unknown> = {
          model: embeddingModel,
          input: ['test embedding'],
          encoding_format: 'float',
        };
        if (requestedDimensions) {
          requestBody.dimensions = requestedDimensions;
        }
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          const errorText = await response.text();
          res.json({ success: false, message: `DashScope API error (${response.status}): ${errorText}` });
          return;
        }

        const data = await response.json() as { data?: Array<{ embedding?: number[] }> };
        const dimensions = data?.data?.[0]?.embedding?.length;

        if (dimensions) {
          res.json({ success: true, message: 'Remote embedding model working', dimensions });
        } else {
          res.json({ success: false, message: 'Unexpected API response format' });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.json({ success: false, message: `DashScope embedding test failed: ${errorMessage}` });
      }
      return;
    }

    const settingsPath = path.join(homedir(), '.claude-mem', 'settings.json');
    const settings = SettingsDefaultsManager.loadFromFile(settingsPath);
    const pythonVersion = settings.CLAUDE_MEM_PYTHON_VERSION || '3.13';

    // Build Python test code - use env var to avoid injection
    const pythonCode = model === 'default'
      ? [
          'import os, sys',
          'try:',
          '    from chromadb.utils.embedding_functions import DefaultEmbeddingFunction',
          '    ef = DefaultEmbeddingFunction()',
          '    r = ef(["test embedding"])',
          '    print(f"OK:{len(r[0])}")',
          'except Exception as e:',
          '    print(f"ERROR:{e}", file=sys.stderr)',
          '    sys.exit(1)',
        ].join('\n')
      : [
          'import os, sys',
          'model_name = os.environ["EMBEDDING_MODEL"]',
          'try:',
          '    from sentence_transformers import SentenceTransformer',
          '    m = SentenceTransformer(model_name)',
          '    r = m.encode(["test embedding"])',
          '    print(f"OK:{len(r[0])}")',
          'except Exception as e:',
          '    print(f"ERROR:{e}", file=sys.stderr)',
          '    sys.exit(1)',
        ].join('\n');

    const args = model === 'default'
      ? ['--python', pythonVersion, '--with', 'chromadb', 'python', '-c', pythonCode]
      : ['--python', pythonVersion, '--with', 'sentence-transformers', 'python', '-c', pythonCode];

    const env = { ...process.env, EMBEDDING_MODEL: model };

    try {
      const result = await new Promise<{ success: boolean; message: string; dimensions?: number }>((resolve) => {
        execFile('uvx', args, { env, timeout: 300000 }, (error, stdout, stderr) => {
          if (error) {
            const msg = stderr?.trim() || error.message;
            resolve({ success: false, message: msg.startsWith('ERROR:') ? msg.slice(6) : msg });
            return;
          }

          const output = stdout.trim();
          const match = output.match(/^OK:(\d+)$/);
          if (match) {
            resolve({
              success: true,
              message: `Model loaded successfully`,
              dimensions: parseInt(match[1], 10),
            });
          } else {
            resolve({ success: false, message: `Unexpected output: ${output}` });
          }
        });
      });

      logger.info('SETTINGS', 'Embedding model test result', { model, ...result });
      res.json(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('SETTINGS', 'Embedding model test failed', { model }, error as Error);
      res.json({ success: false, message: `Test failed: ${errorMessage}` });
    }
  });

  /**
   * GET /api/settings/embedding-models - Get embedding model metadata with cache status
   */
  private handleGetEmbeddingModels = this.wrapHandler((req: Request, res: Response): void => {
    const models = EMBEDDING_MODEL_METADATA.map(model => ({
      id: model.id,
      name: model.name,
      group: model.group,
      description: model.description,
      dimensions: model.dimensions,
      size: model.size,
      languages: model.languages,
      cached: model.cachePaths.some(p => existsSync(p)),
    }));
    res.json(models);
  });

  /**
   * POST /api/settings/reset-vectors - Reset vector database and restart worker
   * Deletes the vector-db directory and schedules a worker restart.
   */
  private handleResetVectors = this.wrapHandler((req: Request, res: Response): void => {
    const vectorDbDir = path.join(homedir(), '.claude-mem', 'vector-db');

    try {
      if (existsSync(vectorDbDir)) {
        rmSync(vectorDbDir, { recursive: true, force: true });
        logger.info('WORKER', 'Vector database deleted', { vectorDbDir });
      } else {
        logger.info('WORKER', 'Vector database directory does not exist, nothing to delete', { vectorDbDir });
      }

      // Hot-reload: reset ChromaSync state and trigger backfill (no process restart needed)
      if (this.onVectorReset) {
        this.onVectorReset();
      }

      res.json({ success: true, message: 'Vector database reset. Re-indexing in background.' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('WORKER', 'Failed to reset vector database', { vectorDbDir }, error as Error);
      res.status(500).json({
        success: false,
        error: `Failed to reset vector database: ${errorMessage}`
      });
    }
  });
}
