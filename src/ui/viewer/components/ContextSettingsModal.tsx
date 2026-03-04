import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Settings, EmbeddingModelInfo } from '../types';
import { TerminalPreview } from './TerminalPreview';
import { useContextPreview } from '../hooks/useContextPreview';
import { API_ENDPOINTS } from '../constants/api';
import { TIMING } from '../constants/timing';
import { useLocale } from '../hooks/useLocale';

// Parse embedding config string into base model ID and optional dimensions
function parseEmbeddingConfig(config: string): { baseModel: string; dimensions: string } {
  if (config.startsWith('dashscope:')) {
    const parts = config.split(':');
    if (parts.length >= 3 && /^\d+$/.test(parts[2])) {
      return { baseModel: `${parts[0]}:${parts[1]}`, dimensions: parts[2] };
    }
  }
  return { baseModel: config, dimensions: '' };
}

const DASHSCOPE_DIMENSIONS = ['', '2048', '1536', '768', '512', '256', '128', '64'] as const;

interface ContextSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (settings: Settings) => void;
  onApply?: (settings: Settings) => void;
  isSaving: boolean;
  saveStatus: string;
}

// Collapsible section component
function CollapsibleSection({
  title,
  description,
  children,
  defaultOpen = true
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`settings-section-collapsible ${isOpen ? 'open' : ''}`}>
      <button
        className="section-header-btn"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <div className="section-header-content">
          <span className="section-title">{title}</span>
          {description && <span className="section-description">{description}</span>}
        </div>
        <svg
          className={`chevron-icon ${isOpen ? 'rotated' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && <div className="section-content">{children}</div>}
    </div>
  );
}

// Chip group with select all/none
function ChipGroup({
  label,
  options,
  selectedValues,
  onToggle,
  onSelectAll,
  onSelectNone,
  allLabel = 'All',
  noneLabel = 'None'
}: {
  label: string;
  options: string[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  allLabel?: string;
  noneLabel?: string;
}) {
  const allSelected = options.every(opt => selectedValues.includes(opt));
  const noneSelected = options.every(opt => !selectedValues.includes(opt));

  return (
    <div className="chip-group">
      <div className="chip-group-header">
        <span className="chip-group-label">{label}</span>
        <div className="chip-group-actions">
          <button
            type="button"
            className={`chip-action ${allSelected ? 'active' : ''}`}
            onClick={onSelectAll}
          >
            {allLabel}
          </button>
          <button
            type="button"
            className={`chip-action ${noneSelected ? 'active' : ''}`}
            onClick={onSelectNone}
          >
            {noneLabel}
          </button>
        </div>
      </div>
      <div className="chips-container">
        {options.map(option => (
          <button
            key={option}
            type="button"
            className={`chip ${selectedValues.includes(option) ? 'selected' : ''}`}
            onClick={() => onToggle(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

// Form field with optional tooltip
function FormField({
  label,
  tooltip,
  children
}: {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="form-field">
      <label className="form-field-label">
        {label}
        {tooltip && (
          <span className="tooltip-trigger" title={tooltip}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

// Toggle switch component
function ToggleSwitch({
  id,
  label,
  description,
  checked,
  onChange,
  disabled
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="toggle-row">
      <div className="toggle-info">
        <label htmlFor={id} className="toggle-label">{label}</label>
        {description && <span className="toggle-description">{description}</span>}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        className={`toggle-switch ${checked ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}

function getEmbeddingPhaseText(t: (key: string) => string, elapsedSeconds: number, isCached: boolean): string {
  if (elapsedSeconds < 5) return t('settings.embeddingPreparing');
  if (elapsedSeconds < 15) return t('settings.embeddingLoadingModel');
  if (!isCached && elapsedSeconds >= 15) return t('settings.embeddingDownloading');
  return t('settings.embeddingLoadingModel');
}

export function ContextSettingsModal({
  isOpen,
  onClose,
  settings,
  onSave,
  onApply,
  isSaving,
  saveStatus
}: ContextSettingsModalProps) {
  const [formState, setFormState] = useState<Settings>(settings);
  const { t } = useLocale();
  const [connectionTest, setConnectionTest] = useState<{
    testing: boolean;
    result?: { success: boolean; message: string; model?: string; latencyMs?: number };
  }>({ testing: false });
  const [vectorReset, setVectorReset] = useState<{
    resetting: boolean;
    result?: { success: boolean; message: string };
  }>({ resetting: false });
  const [embeddingTest, setEmbeddingTest] = useState<{
    testing: boolean;
    startTime?: number;
    elapsedSeconds: number;
    result?: { success: boolean; message: string; dimensions?: number };
  }>({ testing: false, elapsedSeconds: 0 });
  const [embeddingModels, setEmbeddingModels] = useState<EmbeddingModelInfo[]>([]);
  const embeddingAbortRef = useRef<AbortController | null>(null);
  const [embeddingResetFlow, setEmbeddingResetFlow] = useState<{
    active: boolean;
    step: number; // 0=idle, 1=saving, 2=resetting, 4=done
    error?: string;
  }>({ active: false, step: 0 });
  // Local tracking of saved embedding value (avoids depending on parent prop during combined flow)
  const [savedEmbedding, setSavedEmbedding] = useState(settings.CLAUDE_MEM_EMBEDDING_FUNCTION);

  // Update form state when settings prop changes
  useEffect(() => {
    setFormState(settings);
    setSavedEmbedding(settings.CLAUDE_MEM_EMBEDDING_FUNCTION);
  }, [settings]);

  // Clear connection test result when provider changes
  useEffect(() => {
    setConnectionTest({ testing: false });
  }, [formState.CLAUDE_MEM_PROVIDER]);

  // Load embedding model metadata from backend
  useEffect(() => {
    fetch(API_ENDPOINTS.SETTINGS_EMBEDDING_MODELS)
      .then(res => res.json())
      .then(models => setEmbeddingModels(models as EmbeddingModelInfo[]))
      .catch(() => {}); // Degrade to static options
  }, []);

  // Get context preview based on current form state
  const { preview, isLoading, error, projects, selectedProject, setSelectedProject } = useContextPreview(formState);

  const updateSetting = useCallback((key: keyof Settings, value: string) => {
    const newState = { ...formState, [key]: value };
    setFormState(newState);
  }, [formState]);

  // Track whether embedding model has changed from saved value
  const embeddingChanged = formState.CLAUDE_MEM_EMBEDDING_FUNCTION !== savedEmbedding;
  const { baseModel: currentBaseModel, dimensions: currentDimensions } = parseEmbeddingConfig(formState.CLAUDE_MEM_EMBEDDING_FUNCTION || 'default');
  const currentModelInfo = embeddingModels.find(m => m.id === currentBaseModel);
  // Embedding is verified if: model hasn't changed, OR model is already cached, OR test passed
  const embeddingTestPassed = embeddingTest.result?.success === true;
  const embeddingVerified = !embeddingChanged || (currentModelInfo?.cached ?? false) || embeddingTestPassed;

  const handleSave = useCallback(async () => {
    if (embeddingChanged && embeddingVerified) {
      // Combined Save & Reset Vector DB flow (hot-reload, no worker restart)
      setEmbeddingResetFlow({ active: true, step: 1 });

      // Step 1: Save settings
      try {
        const response = await fetch(API_ENDPOINTS.SETTINGS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formState),
        });
        const result = await response.json() as { success: boolean; error?: string };
        if (!result.success) {
          setEmbeddingResetFlow({ active: true, step: 1, error: result.error || 'Save failed' });
          return;
        }
      } catch {
        setEmbeddingResetFlow({ active: true, step: 1, error: 'Network error during save' });
        return;
      }

      // Step 2: Reset vector database (hot-reload — worker stays alive)
      setEmbeddingResetFlow({ active: true, step: 2 });
      try {
        const response = await fetch(API_ENDPOINTS.SETTINGS_RESET_VECTORS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const result = await response.json() as { success: boolean; error?: string };
        if (!result.success) {
          setEmbeddingResetFlow({ active: true, step: 2, error: result.error || 'Reset failed' });
          return;
        }
      } catch {
        setEmbeddingResetFlow({ active: true, step: 2, error: 'Network error during reset' });
        return;
      }

      // Done — worker stays alive, backfill runs in background
      setEmbeddingResetFlow({ active: true, step: 4 });
      setSavedEmbedding(formState.CLAUDE_MEM_EMBEDDING_FUNCTION);
      // Update parent state without redundant API call (settings already saved in Step 1)
      if (onApply) {
        onApply(formState);
      }
      setTimeout(() => setEmbeddingResetFlow({ active: false, step: 0 }), 3000);
    } else {
      // Normal save (no embedding change)
      onSave(formState);
    }
  }, [formState, onSave, onApply, embeddingChanged, embeddingVerified]);

  const toggleBoolean = useCallback((key: keyof Settings) => {
    const currentValue = formState[key];
    const newValue = currentValue === 'true' ? 'false' : 'true';
    updateSetting(key, newValue);
  }, [formState, updateSetting]);

  const toggleArrayValue = useCallback((key: keyof Settings, value: string) => {
    const currentValue = formState[key] || '';
    const currentArray = currentValue ? currentValue.split(',') : [];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(v => v !== value)
      : [...currentArray, value];
    updateSetting(key, newArray.join(','));
  }, [formState, updateSetting]);

  const getArrayValues = useCallback((key: keyof Settings): string[] => {
    const currentValue = formState[key] || '';
    return currentValue ? currentValue.split(',') : [];
  }, [formState]);

  const setAllArrayValues = useCallback((key: keyof Settings, values: string[]) => {
    updateSetting(key, values.join(','));
  }, [updateSetting]);

  // Test AI provider connection
  const testConnection = useCallback(async () => {
    setConnectionTest({ testing: true });

    try {
      const response = await fetch(API_ENDPOINTS.SETTINGS_TEST_CONNECTION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: formState.CLAUDE_MEM_PROVIDER,
          settings: formState,
        }),
      });

      const result = await response.json() as { success: boolean; message: string; model?: string; latencyMs?: number };
      setConnectionTest({ testing: false, result });
    } catch (error) {
      setConnectionTest({
        testing: false,
        result: {
          success: false,
          message: error instanceof Error ? error.message : 'Connection test failed',
        },
      });
    }
  }, [formState]);

  // Reset vector database and restart worker
  const resetVectors = useCallback(async () => {
    setVectorReset({ resetting: true });

    try {
      const response = await fetch(API_ENDPOINTS.SETTINGS_RESET_VECTORS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json() as { success: boolean; message?: string; error?: string };
      setVectorReset({
        resetting: false,
        result: {
          success: result.success,
          message: result.success ? (result.message || 'Vector database reset successfully') : (result.error || 'Reset failed'),
        },
      });
    } catch {
      setVectorReset({
        resetting: false,
        result: {
          success: false,
          message: 'Network error during reset',
        },
      });
    }
  }, []);

  // Test embedding model via backend with abort support
  const testEmbedding = useCallback(async () => {
    const model = formState.CLAUDE_MEM_EMBEDDING_FUNCTION || 'default';
    const abortController = new AbortController();
    embeddingAbortRef.current = abortController;
    setEmbeddingTest({ testing: true, startTime: Date.now(), elapsedSeconds: 0 });

    try {
      const body: Record<string, string> = { model };
      // Pass unsaved API key for remote DashScope embedding test
      if (model.startsWith('dashscope:') && formState.CLAUDE_MEM_DASHSCOPE_API_KEY) {
        body.apiKey = formState.CLAUDE_MEM_DASHSCOPE_API_KEY;
      }
      const response = await fetch(API_ENDPOINTS.SETTINGS_TEST_EMBEDDING, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });
      const data = await response.json() as { success: boolean; message?: string; error?: string; dimensions?: number };
      const result = { success: data.success, message: data.message || data.error || 'Unknown error', dimensions: data.dimensions };
      setEmbeddingTest(prev => ({ ...prev, testing: false, result }));
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setEmbeddingTest(prev => ({ ...prev, testing: false, result: { success: false, message: 'Test cancelled' } }));
      } else {
        setEmbeddingTest(prev => ({ ...prev, testing: false, result: { success: false, message: error instanceof Error ? error.message : 'Test failed' } }));
      }
    } finally {
      embeddingAbortRef.current = null;
    }
  }, [formState.CLAUDE_MEM_EMBEDDING_FUNCTION, formState.CLAUDE_MEM_DASHSCOPE_API_KEY]);

  // Cancel embedding test
  const cancelEmbeddingTest = useCallback(() => {
    embeddingAbortRef.current?.abort();
  }, []);

  // Abort in-progress test and clear result when model selection changes
  useEffect(() => {
    embeddingAbortRef.current?.abort();
    setEmbeddingTest({ testing: false, elapsedSeconds: 0 });
  }, [formState.CLAUDE_MEM_EMBEDDING_FUNCTION]);

  // Timer: update elapsed seconds during embedding test
  useEffect(() => {
    if (!embeddingTest.testing || !embeddingTest.startTime) return;
    const interval = setInterval(() => {
      setEmbeddingTest(prev => ({
        ...prev,
        elapsedSeconds: Math.floor((Date.now() - (prev.startTime || Date.now())) / 1000),
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [embeddingTest.testing, embeddingTest.startTime]);

  // Auto-timeout after 5 minutes
  useEffect(() => {
    if (!embeddingTest.testing || !embeddingTest.startTime) return;
    const timer = setTimeout(() => {
      embeddingAbortRef.current?.abort();
      setEmbeddingTest(prev => ({
        ...prev, testing: false,
        result: { success: false, message: 'Test timed out after 5 minutes. The model may still be downloading — try again later.' },
      }));
      embeddingAbortRef.current = null;
    }, TIMING.EMBEDDING_TEST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [embeddingTest.testing, embeddingTest.startTime]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => { embeddingAbortRef.current?.abort(); };
  }, []);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const observationTypes = ['bugfix', 'feature', 'refactor', 'discovery', 'decision', 'change'];
  const observationConcepts = ['how-it-works', 'why-it-exists', 'what-changed', 'problem-solution', 'gotcha', 'pattern', 'trade-off'];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="context-settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2>{t('settings.title')}</h2>
          <div className="header-controls">
            <label className="preview-selector">
              {t('settings.previewFor')}
              <select
                value={selectedProject || ''}
                onChange={(e) => setSelectedProject(e.target.value)}
              >
                {projects.map(project => (
                  <option key={project} value={project}>{project}</option>
                ))}
              </select>
            </label>
            <button
              onClick={onClose}
              className="modal-close-btn"
              title={t('settings.close')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body - 2 columns */}
        <div className="modal-body">
          {/* Left column - Terminal Preview */}
          <div className="preview-column">
            <div className="preview-content">
              {error ? (
                <div style={{ color: '#ff6b6b' }}>
                  {t('settings.errorPreview', { error })}
                </div>
              ) : (
                <TerminalPreview content={preview} isLoading={isLoading} />
              )}
            </div>
          </div>

          {/* Right column - Settings Panel */}
          <div className="settings-column">
            {/* Section 1: Loading */}
            <CollapsibleSection
              title={t('settings.loading')}
              description={t('settings.loadingDesc')}
            >
              <FormField
                label={t('settings.observations')}
                tooltip={t('settings.observationsTooltip')}
              >
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={formState.CLAUDE_MEM_CONTEXT_OBSERVATIONS || '50'}
                  onChange={(e) => updateSetting('CLAUDE_MEM_CONTEXT_OBSERVATIONS', e.target.value)}
                />
              </FormField>
              <FormField
                label={t('settings.sessions')}
                tooltip={t('settings.sessionsTooltip')}
              >
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formState.CLAUDE_MEM_CONTEXT_SESSION_COUNT || '10'}
                  onChange={(e) => updateSetting('CLAUDE_MEM_CONTEXT_SESSION_COUNT', e.target.value)}
                />
              </FormField>
            </CollapsibleSection>

            {/* Section 2: Filters */}
            <CollapsibleSection
              title={t('settings.filters')}
              description={t('settings.filtersDesc')}
            >
              <ChipGroup
                label={t('settings.type')}
                options={observationTypes}
                selectedValues={getArrayValues('CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES')}
                onToggle={(value) => toggleArrayValue('CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES', value)}
                onSelectAll={() => setAllArrayValues('CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES', observationTypes)}
                onSelectNone={() => setAllArrayValues('CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES', [])}
                allLabel={t('common.all')}
                noneLabel={t('common.none')}
              />
              <ChipGroup
                label={t('settings.concept')}
                options={observationConcepts}
                selectedValues={getArrayValues('CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS')}
                onToggle={(value) => toggleArrayValue('CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS', value)}
                onSelectAll={() => setAllArrayValues('CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS', observationConcepts)}
                onSelectNone={() => setAllArrayValues('CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS', [])}
                allLabel={t('common.all')}
                noneLabel={t('common.none')}
              />
            </CollapsibleSection>

            {/* Section 3: Display */}
            <CollapsibleSection
              title={t('settings.display')}
              description={t('settings.displayDesc')}
            >
              <div className="display-subsection">
                <span className="subsection-label">{t('settings.fullObservations')}</span>
                <FormField
                  label={t('settings.count')}
                  tooltip={t('settings.countTooltip')}
                >
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={formState.CLAUDE_MEM_CONTEXT_FULL_COUNT || '5'}
                    onChange={(e) => updateSetting('CLAUDE_MEM_CONTEXT_FULL_COUNT', e.target.value)}
                  />
                </FormField>
                <FormField
                  label={t('settings.field')}
                  tooltip={t('settings.fieldTooltip')}
                >
                  <select
                    value={formState.CLAUDE_MEM_CONTEXT_FULL_FIELD || 'narrative'}
                    onChange={(e) => updateSetting('CLAUDE_MEM_CONTEXT_FULL_FIELD', e.target.value)}
                  >
                    <option value="narrative">{t('settings.narrative')}</option>
                    <option value="facts">{t('settings.factsOption')}</option>
                  </select>
                </FormField>
              </div>

              <div className="display-subsection">
                <span className="subsection-label">{t('settings.tokenEconomics')}</span>
                <div className="toggle-group">
                  <ToggleSwitch
                    id="show-read-tokens"
                    label={t('settings.readCost')}
                    description={t('settings.readCostDesc')}
                    checked={formState.CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS === 'true'}
                    onChange={() => toggleBoolean('CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS')}
                  />
                  <ToggleSwitch
                    id="show-work-tokens"
                    label={t('settings.workInvestment')}
                    description={t('settings.workInvestmentDesc')}
                    checked={formState.CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS === 'true'}
                    onChange={() => toggleBoolean('CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS')}
                  />
                  <ToggleSwitch
                    id="show-savings-amount"
                    label={t('settings.savings')}
                    description={t('settings.savingsDesc')}
                    checked={formState.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT === 'true'}
                    onChange={() => toggleBoolean('CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT')}
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Section 4: Advanced */}
            <CollapsibleSection
              title={t('settings.advanced')}
              description={t('settings.advancedDesc')}
              defaultOpen={false}
            >
              <FormField
                label={t('settings.aiProvider')}
                tooltip={t('settings.aiProviderTooltip')}
              >
                <select
                  value={formState.CLAUDE_MEM_PROVIDER || 'dashscope'}
                  onChange={(e) => updateSetting('CLAUDE_MEM_PROVIDER', e.target.value)}
                >
                  <option value="dashscope">{t('settings.dashscopeOption')}</option>
                  <option value="claude">{t('settings.claudeOption')}</option>
                  <option value="gemini">{t('settings.geminiOption')}</option>
                  <option value="openrouter">{t('settings.openrouterOption')}</option>
                </select>
              </FormField>

              {formState.CLAUDE_MEM_PROVIDER === 'claude' && (
                <FormField
                  label={t('settings.claudeModel')}
                  tooltip={t('settings.claudeModelTooltip')}
                >
                  <input
                    type="text"
                    value={formState.CLAUDE_MEM_MODEL || 'claude-sonnet-4-5'}
                    onChange={(e) => updateSetting('CLAUDE_MEM_MODEL', e.target.value)}
                    placeholder="claude-sonnet-4-5"
                  />
                </FormField>
              )}

              {formState.CLAUDE_MEM_PROVIDER === 'gemini' && (
                <>
                  <FormField
                    label={t('settings.geminiApiKey')}
                    tooltip={t('settings.geminiApiKeyTooltip')}
                  >
                    <input
                      type="password"
                      value={formState.CLAUDE_MEM_GEMINI_API_KEY || ''}
                      onChange={(e) => updateSetting('CLAUDE_MEM_GEMINI_API_KEY', e.target.value)}
                      placeholder={t('settings.geminiApiKeyPlaceholder')}
                    />
                  </FormField>
                  <FormField
                    label={t('settings.geminiApiUrl')}
                    tooltip={t('settings.geminiApiUrlTooltip')}
                  >
                    <input
                      type="text"
                      value={formState.CLAUDE_MEM_GEMINI_API_URL || ''}
                      onChange={(e) => updateSetting('CLAUDE_MEM_GEMINI_API_URL', e.target.value)}
                      placeholder="https://generativelanguage.googleapis.com/v1beta/models"
                    />
                  </FormField>
                  <FormField
                    label={t('settings.geminiModel')}
                    tooltip={t('settings.geminiModelTooltip')}
                  >
                    <input
                      type="text"
                      value={formState.CLAUDE_MEM_GEMINI_MODEL || 'gemini-2.5-flash-lite'}
                      onChange={(e) => updateSetting('CLAUDE_MEM_GEMINI_MODEL', e.target.value)}
                      placeholder="gemini-2.5-flash-lite"
                    />
                  </FormField>
                  <div className="toggle-group" style={{ marginTop: '8px' }}>
                    <ToggleSwitch
                      id="gemini-rate-limiting"
                      label={t('settings.geminiRateLimiting')}
                      description={t('settings.geminiRateLimitingDesc')}
                      checked={formState.CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED === 'true'}
                      onChange={(checked) => updateSetting('CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED', checked ? 'true' : 'false')}
                    />
                  </div>
                </>
              )}

              {formState.CLAUDE_MEM_PROVIDER === 'openrouter' && (
                <>
                  <FormField
                    label={t('settings.openrouterApiKey')}
                    tooltip={t('settings.openrouterApiKeyTooltip')}
                  >
                    <input
                      type="password"
                      value={formState.CLAUDE_MEM_OPENROUTER_API_KEY || ''}
                      onChange={(e) => updateSetting('CLAUDE_MEM_OPENROUTER_API_KEY', e.target.value)}
                      placeholder={t('settings.openrouterApiKeyPlaceholder')}
                    />
                  </FormField>
                  <FormField
                    label={t('settings.openrouterModel')}
                    tooltip={t('settings.openrouterModelTooltip')}
                  >
                    <input
                      type="text"
                      value={formState.CLAUDE_MEM_OPENROUTER_MODEL || 'xiaomi/mimo-v2-flash:free'}
                      onChange={(e) => updateSetting('CLAUDE_MEM_OPENROUTER_MODEL', e.target.value)}
                      placeholder="e.g., xiaomi/mimo-v2-flash:free"
                    />
                  </FormField>
                  <FormField
                    label={t('settings.siteUrl')}
                    tooltip={t('settings.siteUrlTooltip')}
                  >
                    <input
                      type="text"
                      value={formState.CLAUDE_MEM_OPENROUTER_SITE_URL || ''}
                      onChange={(e) => updateSetting('CLAUDE_MEM_OPENROUTER_SITE_URL', e.target.value)}
                      placeholder="https://yoursite.com"
                    />
                  </FormField>
                  <FormField
                    label={t('settings.appName')}
                    tooltip={t('settings.appNameTooltip')}
                  >
                    <input
                      type="text"
                      value={formState.CLAUDE_MEM_OPENROUTER_APP_NAME || 'claude-mem'}
                      onChange={(e) => updateSetting('CLAUDE_MEM_OPENROUTER_APP_NAME', e.target.value)}
                      placeholder="claude-mem"
                    />
                  </FormField>
                </>
              )}

              {formState.CLAUDE_MEM_PROVIDER === 'dashscope' && (
                <>
                  <FormField
                    label={t('settings.dashscopeApiKey')}
                    tooltip={t('settings.dashscopeApiKeyTooltip')}
                  >
                    <input
                      type="password"
                      value={formState.CLAUDE_MEM_DASHSCOPE_API_KEY || ''}
                      onChange={(e) => updateSetting('CLAUDE_MEM_DASHSCOPE_API_KEY', e.target.value)}
                      placeholder={t('settings.dashscopeApiKeyPlaceholder')}
                    />
                  </FormField>
                  <FormField
                    label={t('settings.dashscopeModel')}
                    tooltip={t('settings.dashscopeModelTooltip')}
                  >
                    <input
                      type="text"
                      value={formState.CLAUDE_MEM_DASHSCOPE_MODEL || 'qwen-plus'}
                      onChange={(e) => updateSetting('CLAUDE_MEM_DASHSCOPE_MODEL', e.target.value)}
                      placeholder="e.g., qwen-plus"
                    />
                  </FormField>
                </>
              )}

              {/* Test Connection Button - show for all providers */}
              <div className="test-connection-section" style={{ marginTop: '16px', marginBottom: '16px' }}>
                <button
                  type="button"
                  className={`test-connection-btn ${connectionTest.testing ? 'testing' : ''}`}
                  onClick={testConnection}
                  disabled={connectionTest.testing}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #444)',
                    background: 'var(--button-bg, #333)',
                    color: 'var(--text-color, #fff)',
                    cursor: connectionTest.testing ? 'wait' : 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {connectionTest.testing ? (
                    <>
                      <span className="spinner" style={{
                        width: '14px',
                        height: '14px',
                        border: '2px solid transparent',
                        borderTopColor: 'currentColor',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }} />
                      <span>{t('settings.testing')}</span>
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      <span>{t('settings.testConnection')}</span>
                    </>
                  )}
                </button>

                {connectionTest.result && (
                  <div
                    className={`test-result ${connectionTest.result.success ? 'success' : 'error'}`}
                    style={{
                      marginTop: '8px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      background: connectionTest.result.success
                        ? 'rgba(76, 175, 80, 0.1)'
                        : 'rgba(244, 67, 54, 0.1)',
                      border: `1px solid ${connectionTest.result.success ? '#4caf50' : '#f44336'}`,
                      color: connectionTest.result.success ? '#81c784' : '#e57373',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {connectionTest.result.success ? '✓' : '✗'}
                      <span>{connectionTest.result.message}</span>
                    </div>
                    {connectionTest.result.model && (
                      <div style={{ marginTop: '4px', opacity: 0.8, fontSize: '11px' }}>
                        {t('settings.connectionModel', { model: connectionTest.result.model })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <FormField
                label={t('settings.summaryLanguage')}
                tooltip={t('settings.summaryLanguageTooltip')}
              >
                <select
                  value={formState.CLAUDE_MEM_MODE || 'code--zh'}
                  onChange={(e) => updateSetting('CLAUDE_MEM_MODE', e.target.value)}
                >
                  <option value="code--zh">中文 (Chinese) (Default)</option>
                  <option value="code">English</option>
                  <option value="code--ja">日本語 (Japanese)</option>
                  <option value="code--ko">한국어 (Korean)</option>
                  <option value="code--es">Español (Spanish)</option>
                  <option value="code--pt-br">Português (Portuguese)</option>
                  <option value="code--de">Deutsch (German)</option>
                  <option value="code--fr">Français (French)</option>
                  <option value="code--ru">Русский (Russian)</option>
                  <option value="code--ar">العربية (Arabic)</option>
                  <option value="code--it">Italiano (Italian)</option>
                  <option value="code--nl">Nederlands (Dutch)</option>
                  <option value="code--pl">Polski (Polish)</option>
                  <option value="code--tr">Türkçe (Turkish)</option>
                  <option value="code--vi">Tiếng Việt (Vietnamese)</option>
                  <option value="code--th">ไทย (Thai)</option>
                  <option value="code--id">Bahasa Indonesia</option>
                  <option value="code--hi">हिन्दी (Hindi)</option>
                  <option value="code--uk">Українська (Ukrainian)</option>
                  <option value="code--cs">Čeština (Czech)</option>
                  <option value="code--el">Ελληνικά (Greek)</option>
                  <option value="code--he">עברית (Hebrew)</option>
                  <option value="code--hu">Magyar (Hungarian)</option>
                  <option value="code--ro">Română (Romanian)</option>
                  <option value="code--sv">Svenska (Swedish)</option>
                  <option value="code--da">Dansk (Danish)</option>
                  <option value="code--fi">Suomi (Finnish)</option>
                  <option value="code--no">Norsk (Norwegian)</option>
                  <option value="code--bn">বাংলা (Bengali)</option>
                </select>
              </FormField>

              <FormField
                label={t('settings.workerPort')}
                tooltip={t('settings.workerPortTooltip')}
              >
                <input
                  type="number"
                  min="1024"
                  max="65535"
                  value={formState.CLAUDE_MEM_WORKER_PORT || '37777'}
                  onChange={(e) => updateSetting('CLAUDE_MEM_WORKER_PORT', e.target.value)}
                />
              </FormField>

              <FormField
                label={t('settings.embeddingModel')}
                tooltip={t('settings.embeddingModelTooltip')}
              >
                <select
                  value={currentBaseModel}
                  onChange={(e) => updateSetting('CLAUDE_MEM_EMBEDDING_FUNCTION', e.target.value)}
                >
                  {embeddingModels.length > 0 ? (
                    [...new Set(embeddingModels.map(m => m.group))].map(group => (
                      <optgroup key={group} label={group}>
                        {embeddingModels.filter(m => m.group === group).map(m => (
                          <option key={m.id} value={m.id}>
                            {m.id.startsWith('dashscope:') ? m.name : `${m.name} (${m.dimensions}d)${m.cached ? ' \u2713' : ` \u00b7 ${m.size}`}`}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  ) : (
                    <>
                      <optgroup label="English">
                        <option value="default">all-MiniLM-L6-v2 (384d, fast)</option>
                      </optgroup>
                      <optgroup label="Multilingual">
                        <option value="sentence-transformers/multilingual-MiniLM-L12-v2">multilingual-MiniLM-L12-v2 (384d)</option>
                        <option value="sentence-transformers/paraphrase-multilingual-mpnet-base-v2">paraphrase-multilingual-mpnet-base-v2 (768d, high quality)</option>
                      </optgroup>
                      <optgroup label="Chinese">
                        <option value="shibing624/text2vec-base-chinese">text2vec-base-chinese (768d)</option>
                      </optgroup>
                    </>
                  )}
                </select>
              </FormField>

              {/* Show DashScope API key field when remote DashScope embedding is selected but provider is not DashScope */}
              {(formState.CLAUDE_MEM_EMBEDDING_FUNCTION || '').startsWith('dashscope:') &&
               formState.CLAUDE_MEM_PROVIDER !== 'dashscope' && (
                <FormField
                  label={t('settings.dashscopeEmbeddingApiKey')}
                  tooltip={t('settings.dashscopeEmbeddingApiKeyTooltip')}
                >
                  <input
                    type="password"
                    value={formState.CLAUDE_MEM_DASHSCOPE_API_KEY || ''}
                    onChange={(e) => updateSetting('CLAUDE_MEM_DASHSCOPE_API_KEY', e.target.value)}
                    placeholder={t('settings.dashscopeApiKeyPlaceholder')}
                  />
                </FormField>
              )}

              {/* Show dimensions selector when DashScope embedding model is selected */}
              {currentBaseModel.startsWith('dashscope:') && (
                <FormField
                  label={t('settings.embeddingDimensions')}
                  tooltip={t('settings.embeddingDimensionsTooltip')}
                >
                  <select
                    value={currentDimensions}
                    onChange={(e) => {
                      const dim = e.target.value;
                      const newConfig = dim ? `${currentBaseModel}:${dim}` : currentBaseModel;
                      updateSetting('CLAUDE_MEM_EMBEDDING_FUNCTION', newConfig);
                    }}
                  >
                    {DASHSCOPE_DIMENSIONS.map(d => (
                      <option key={d || 'default'} value={d}>
                        {d ? `${d}d` : t('settings.defaultDimensions')}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}

              {embeddingChanged && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  background: embeddingVerified
                    ? 'rgba(33, 150, 243, 0.1)'
                    : 'rgba(255, 152, 0, 0.1)',
                  border: `1px solid ${embeddingVerified ? '#2196f3' : '#ff9800'}`,
                  color: embeddingVerified ? '#64b5f6' : '#ffb74d',
                }}>
                  {embeddingVerified ? (
                    <>
                      <div>{t('settings.embeddingResetSaveNote')}</div>
                      <div style={{ marginTop: '4px', opacity: 0.85 }}>
                        {t('settings.embeddingReindexNote')}
                      </div>
                    </>
                  ) : (
                    <>
                      <div>{t('settings.embeddingTestWarning')}</div>
                      {currentBaseModel.startsWith('dashscope:') ? (
                        <div style={{ marginTop: '4px', opacity: 0.85 }}>
                          {t('settings.embeddingTestApiNote')}
                        </div>
                      ) : (
                        <div style={{ marginTop: '4px', opacity: 0.85 }}>
                          {t('settings.embeddingTestSizeNote', { size: currentModelInfo?.size || 'unknown' })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={testEmbedding}
                  disabled={embeddingTest.testing}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #444)',
                    background: 'var(--button-bg, #333)',
                    color: 'var(--text-color, #fff)',
                    cursor: embeddingTest.testing ? 'wait' : 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {embeddingTest.testing ? (
                    <>
                      <span style={{
                        width: '14px',
                        height: '14px',
                        border: '2px solid transparent',
                        borderTopColor: 'currentColor',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        display: 'inline-block',
                      }} />
                      <span>{getEmbeddingPhaseText(t, embeddingTest.elapsedSeconds, currentModelInfo?.cached ?? false)} ({embeddingTest.elapsedSeconds}s)</span>
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      <span>{t('settings.testEmbedding')}</span>
                    </>
                  )}
                </button>

                {embeddingTest.testing && (
                  <button
                    type="button"
                    onClick={cancelEmbeddingTest}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #444)',
                      background: 'var(--button-bg, #333)',
                      color: '#e57373',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    {t('settings.embeddingCancel')}
                  </button>
                )}

                <button
                  type="button"
                  onClick={resetVectors}
                  disabled={vectorReset.resetting || embeddingChanged || embeddingResetFlow.active}
                  title={embeddingChanged ? t('settings.resetUseSave') : undefined}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #444)',
                    background: 'var(--button-bg, #333)',
                    color: 'var(--text-color, #fff)',
                    cursor: (vectorReset.resetting || embeddingChanged || embeddingResetFlow.active) ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    opacity: (embeddingChanged || embeddingResetFlow.active) ? 0.5 : 1,
                  }}
                >
                  {vectorReset.resetting ? (
                    <>
                      <span style={{
                        width: '14px',
                        height: '14px',
                        border: '2px solid transparent',
                        borderTopColor: 'currentColor',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        display: 'inline-block',
                      }} />
                      <span>{t('settings.resetting')}</span>
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                      </svg>
                      <span>{t('settings.resetVectorDb')}</span>
                    </>
                  )}
                </button>
              </div>

              {embeddingTest.result && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  background: embeddingTest.result.success
                    ? 'rgba(76, 175, 80, 0.1)'
                    : 'rgba(244, 67, 54, 0.1)',
                  border: `1px solid ${embeddingTest.result.success ? '#4caf50' : '#f44336'}`,
                  color: embeddingTest.result.success ? '#81c784' : '#e57373',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {embeddingTest.result.success ? '✓' : '✗'}
                    <span>{embeddingTest.result.message}</span>
                  </div>
                  {embeddingTest.result.dimensions && (
                    <div style={{ marginTop: '4px', opacity: 0.8, fontSize: '11px' }}>
                      {t('settings.embeddingDimensionsLabel', { dimensions: String(embeddingTest.result.dimensions) })}
                    </div>
                  )}
                </div>
              )}

              {vectorReset.result && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  background: vectorReset.result.success
                    ? 'rgba(76, 175, 80, 0.1)'
                    : 'rgba(244, 67, 54, 0.1)',
                  border: `1px solid ${vectorReset.result.success ? '#4caf50' : '#f44336'}`,
                  color: vectorReset.result.success ? '#81c784' : '#e57373',
                }}>
                  {vectorReset.result.success ? '✓' : '✗'} {vectorReset.result.message}
                </div>
              )}

              <div className="toggle-group" style={{ marginTop: '12px' }}>
                <ToggleSwitch
                  id="show-last-summary"
                  label={t('settings.includeSummary')}
                  description={t('settings.includeSummaryDesc')}
                  checked={formState.CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY === 'true'}
                  onChange={() => toggleBoolean('CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY')}
                />
                <ToggleSwitch
                  id="show-last-message"
                  label={t('settings.includeMessage')}
                  description={t('settings.includeMessageDesc')}
                  checked={formState.CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE === 'true'}
                  onChange={() => toggleBoolean('CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE')}
                />
              </div>
            </CollapsibleSection>

            {/* Section 5: Budget */}
            <CollapsibleSection
              title={t('settings.budget')}
              description={t('settings.budgetDesc')}
              defaultOpen={false}
            >
              <div className="toggle-group" style={{ marginBottom: '12px' }}>
                <ToggleSwitch
                  id="budget-enabled"
                  label={t('settings.enableBudget')}
                  description={t('settings.enableBudgetDesc')}
                  checked={formState.CLAUDE_MEM_BUDGET_ENABLED === 'true'}
                  onChange={() => toggleBoolean('CLAUDE_MEM_BUDGET_ENABLED')}
                />
              </div>

              {formState.CLAUDE_MEM_BUDGET_ENABLED === 'true' && (
                <>
                  <FormField
                    label={t('settings.pricingPreset')}
                    tooltip={t('settings.pricingPresetTooltip')}
                  >
                    <select
                      value={formState.CLAUDE_MEM_BUDGET_PRESET || 'claude-haiku'}
                      onChange={(e) => updateSetting('CLAUDE_MEM_BUDGET_PRESET', e.target.value)}
                    >
                      <optgroup label="Claude API">
                        <option value="claude-haiku">Claude Haiku ($0.25/$1.25 per M)</option>
                        <option value="claude-sonnet">Claude Sonnet ($3/$15 per M)</option>
                        <option value="claude-opus">Claude Opus ($15/$75 per M)</option>
                      </optgroup>
                      <optgroup label="Claude Max">
                        <option value="claude-max">Claude Max (message-based)</option>
                      </optgroup>
                      <optgroup label="AWS Bedrock">
                        <option value="bedrock-haiku">Bedrock Haiku ($0.25/$1.25 per M)</option>
                        <option value="bedrock-sonnet">Bedrock Sonnet ($3/$15 per M)</option>
                        <option value="bedrock-opus">Bedrock Opus ($15/$75 per M)</option>
                      </optgroup>
                      <optgroup label="Google">
                        <option value="gemini-free">Gemini Free (no limits)</option>
                        <option value="gemini-paid">Gemini Paid ($0.075/$0.30 per M)</option>
                      </optgroup>
                      <optgroup label="OpenRouter">
                        <option value="openrouter-free">OpenRouter Free (no limits)</option>
                        <option value="openrouter-paid">OpenRouter Paid (custom)</option>
                      </optgroup>
                      <optgroup label="DashScope">
                        <option value="dashscope-qwen-turbo">Qwen Turbo ($0.30/$0.60 per M)</option>
                        <option value="dashscope-qwen-plus">Qwen Plus ($0.80/$2.00 per M)</option>
                        <option value="dashscope-qwen-max">Qwen Max ($2.40/$9.60 per M)</option>
                      </optgroup>
                      <optgroup label="Custom">
                        <option value="custom">Custom Pricing</option>
                      </optgroup>
                    </select>
                  </FormField>

                  {/* Show limits for token and message billing */}
                  {formState.CLAUDE_MEM_BUDGET_PRESET !== 'gemini-free' &&
                   formState.CLAUDE_MEM_BUDGET_PRESET !== 'openrouter-free' && (
                    <>
                      <FormField
                        label={formState.CLAUDE_MEM_BUDGET_PRESET === 'claude-max' ? t('settings.dailyMessageLimit') : t('settings.dailyBudget')}
                        tooltip={formState.CLAUDE_MEM_BUDGET_PRESET === 'claude-max'
                          ? t('settings.dailyMessageLimitTooltip')
                          : t('settings.dailyBudgetTooltip')}
                      >
                        <input
                          type="number"
                          min="0"
                          step={formState.CLAUDE_MEM_BUDGET_PRESET === 'claude-max' ? '1' : '0.01'}
                          value={formState.CLAUDE_MEM_BUDGET_DAILY_LIMIT || '1.00'}
                          onChange={(e) => updateSetting('CLAUDE_MEM_BUDGET_DAILY_LIMIT', e.target.value)}
                        />
                      </FormField>
                      <FormField
                        label={formState.CLAUDE_MEM_BUDGET_PRESET === 'claude-max' ? t('settings.monthlyMessageLimit') : t('settings.monthlyBudget')}
                        tooltip={formState.CLAUDE_MEM_BUDGET_PRESET === 'claude-max'
                          ? t('settings.monthlyMessageLimitTooltip')
                          : t('settings.monthlyBudgetTooltip')}
                      >
                        <input
                          type="number"
                          min="0"
                          step={formState.CLAUDE_MEM_BUDGET_PRESET === 'claude-max' ? '1' : '0.01'}
                          value={formState.CLAUDE_MEM_BUDGET_MONTHLY_LIMIT || '20.00'}
                          onChange={(e) => updateSetting('CLAUDE_MEM_BUDGET_MONTHLY_LIMIT', e.target.value)}
                        />
                      </FormField>
                    </>
                  )}

                  {/* Custom pricing fields */}
                  {formState.CLAUDE_MEM_BUDGET_PRESET === 'custom' && (
                    <FormField
                      label={t('settings.customPricing')}
                      tooltip={t('settings.customPricingTooltip')}
                    >
                      <input
                        type="text"
                        value={formState.CLAUDE_MEM_BUDGET_CUSTOM_PRICING || ''}
                        onChange={(e) => updateSetting('CLAUDE_MEM_BUDGET_CUSTOM_PRICING', e.target.value)}
                        placeholder='{"input": 0.25, "output": 1.25}'
                      />
                    </FormField>
                  )}
                </>
              )}
            </CollapsibleSection>
          </div>
        </div>

        {/* Footer with Save button */}
        <div className="modal-footer">
          {embeddingResetFlow.active ? (
            // Multi-stage progress during combined Save & Reset flow
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                {embeddingResetFlow.error ? (
                  <>
                    <span style={{ color: '#e57373' }}>✗</span>
                    <span style={{ color: '#e57373' }}>{embeddingResetFlow.error}</span>
                  </>
                ) : embeddingResetFlow.step === 4 ? (
                  <>
                    <span style={{ color: '#81c784' }}>✓</span>
                    <span style={{ color: '#81c784' }}>{t('settings.resetDone')}</span>
                  </>
                ) : (
                  <>
                    <span style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid transparent',
                      borderTopColor: 'currentColor',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      display: 'inline-block',
                      flexShrink: 0,
                    }} />
                    <span>
                      {embeddingResetFlow.step === 1 && t('settings.savingSettings')}
                      {embeddingResetFlow.step === 2 && t('settings.resetVectorDatabase')}
                    </span>
                  </>
                )}
              </div>
              {embeddingResetFlow.error && (
                <button
                  className="save-btn"
                  onClick={() => {
                    setEmbeddingResetFlow({ active: false, step: 0 });
                  }}
                  style={{ flexShrink: 0 }}
                >
                  {t('settings.dismiss')}
                </button>
              )}
            </div>
          ) : (
            // Normal footer
            <>
              <div className="save-status">
                {saveStatus && <span className={saveStatus.includes('✓') ? 'success' : saveStatus.includes('✗') ? 'error' : ''}>{saveStatus}</span>}
                {embeddingChanged && !embeddingVerified && !saveStatus && (
                  <span style={{ color: '#ffb74d', fontSize: '12px' }}>{t('settings.testEmbeddingFirst')}</span>
                )}
              </div>
              <button
                className="save-btn"
                onClick={handleSave}
                disabled={isSaving || (embeddingChanged && !embeddingVerified) || embeddingResetFlow.active}
                title={embeddingChanged && !embeddingVerified ? t('settings.testEmbeddingFirstTitle') : undefined}
              >
                {isSaving ? t('settings.saving') : embeddingChanged && embeddingVerified ? t('settings.saveAndReset') : t('settings.save')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
