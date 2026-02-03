import React, { useState, useCallback, useEffect } from 'react';
import type { Settings } from '../types';
import { TerminalPreview } from './TerminalPreview';
import { useContextPreview } from '../hooks/useContextPreview';
import { API_ENDPOINTS } from '../constants/api';

interface ContextSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (settings: Settings) => void;
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
  onSelectNone
}: {
  label: string;
  options: string[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
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
            All
          </button>
          <button
            type="button"
            className={`chip-action ${noneSelected ? 'active' : ''}`}
            onClick={onSelectNone}
          >
            None
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

export function ContextSettingsModal({
  isOpen,
  onClose,
  settings,
  onSave,
  isSaving,
  saveStatus
}: ContextSettingsModalProps) {
  const [formState, setFormState] = useState<Settings>(settings);
  const [connectionTest, setConnectionTest] = useState<{
    testing: boolean;
    result?: { success: boolean; message: string; model?: string; latencyMs?: number };
  }>({ testing: false });

  // Update form state when settings prop changes
  useEffect(() => {
    setFormState(settings);
  }, [settings]);

  // Clear connection test result when provider changes
  useEffect(() => {
    setConnectionTest({ testing: false });
  }, [formState.CLAUDE_MEM_PROVIDER]);

  // Get context preview based on current form state
  const { preview, isLoading, error, projects, selectedProject, setSelectedProject } = useContextPreview(formState);

  const updateSetting = useCallback((key: keyof Settings, value: string) => {
    const newState = { ...formState, [key]: value };
    setFormState(newState);
  }, [formState]);

  const handleSave = useCallback(() => {
    onSave(formState);
  }, [formState, onSave]);

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
          <h2>Settings</h2>
          <div className="header-controls">
            <label className="preview-selector">
              Preview for:
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
              title="Close (Esc)"
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
                  Error loading preview: {error}
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
              title="Loading"
              description="How many observations to inject"
            >
              <FormField
                label="Observations"
                tooltip="Number of recent observations to include in context (1-200)"
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
                label="Sessions"
                tooltip="Number of recent sessions to pull observations from (1-50)"
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
              title="Filters"
              description="Which observation types to include"
            >
              <ChipGroup
                label="Type"
                options={observationTypes}
                selectedValues={getArrayValues('CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES')}
                onToggle={(value) => toggleArrayValue('CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES', value)}
                onSelectAll={() => setAllArrayValues('CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES', observationTypes)}
                onSelectNone={() => setAllArrayValues('CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES', [])}
              />
              <ChipGroup
                label="Concept"
                options={observationConcepts}
                selectedValues={getArrayValues('CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS')}
                onToggle={(value) => toggleArrayValue('CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS', value)}
                onSelectAll={() => setAllArrayValues('CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS', observationConcepts)}
                onSelectNone={() => setAllArrayValues('CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS', [])}
              />
            </CollapsibleSection>

            {/* Section 3: Display */}
            <CollapsibleSection
              title="Display"
              description="What to show in context tables"
            >
              <div className="display-subsection">
                <span className="subsection-label">Full Observations</span>
                <FormField
                  label="Count"
                  tooltip="How many observations show expanded details (0-20)"
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
                  label="Field"
                  tooltip="Which field to expand for full observations"
                >
                  <select
                    value={formState.CLAUDE_MEM_CONTEXT_FULL_FIELD || 'narrative'}
                    onChange={(e) => updateSetting('CLAUDE_MEM_CONTEXT_FULL_FIELD', e.target.value)}
                  >
                    <option value="narrative">Narrative</option>
                    <option value="facts">Facts</option>
                  </select>
                </FormField>
              </div>

              <div className="display-subsection">
                <span className="subsection-label">Token Economics</span>
                <div className="toggle-group">
                  <ToggleSwitch
                    id="show-read-tokens"
                    label="Read cost"
                    description="Tokens to read this observation"
                    checked={formState.CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS === 'true'}
                    onChange={() => toggleBoolean('CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS')}
                  />
                  <ToggleSwitch
                    id="show-work-tokens"
                    label="Work investment"
                    description="Tokens spent creating this observation"
                    checked={formState.CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS === 'true'}
                    onChange={() => toggleBoolean('CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS')}
                  />
                  <ToggleSwitch
                    id="show-savings-amount"
                    label="Savings"
                    description="Total tokens saved by reusing context"
                    checked={formState.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT === 'true'}
                    onChange={() => toggleBoolean('CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT')}
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Section 4: Advanced */}
            <CollapsibleSection
              title="Advanced"
              description="AI provider and model selection"
              defaultOpen={false}
            >
              <FormField
                label="AI Provider"
                tooltip="Choose between Claude (via Agent SDK) or Gemini (via REST API)"
              >
                <select
                  value={formState.CLAUDE_MEM_PROVIDER || 'claude'}
                  onChange={(e) => updateSetting('CLAUDE_MEM_PROVIDER', e.target.value)}
                >
                  <option value="claude">Claude (uses your Claude account)</option>
                  <option value="gemini">Gemini (uses API key)</option>
                  <option value="openrouter">OpenRouter (multi-model)</option>
                </select>
              </FormField>

              {formState.CLAUDE_MEM_PROVIDER === 'claude' && (
                <FormField
                  label="Claude Model"
                  tooltip="Model ID for Claude SDK. Examples: claude-sonnet-4-5, claude-haiku-4-5, or AWS Bedrock ARN"
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
                    label="Gemini API Key"
                    tooltip="Your Google AI Studio API key (or set GEMINI_API_KEY env var)"
                  >
                    <input
                      type="password"
                      value={formState.CLAUDE_MEM_GEMINI_API_KEY || ''}
                      onChange={(e) => updateSetting('CLAUDE_MEM_GEMINI_API_KEY', e.target.value)}
                      placeholder="Enter Gemini API key..."
                    />
                  </FormField>
                  <FormField
                    label="Gemini API URL"
                    tooltip="Custom API endpoint URL for Gemini-compatible services (or set GEMINI_API_URL env var)"
                  >
                    <input
                      type="text"
                      value={formState.CLAUDE_MEM_GEMINI_API_URL || ''}
                      onChange={(e) => updateSetting('CLAUDE_MEM_GEMINI_API_URL', e.target.value)}
                      placeholder="https://generativelanguage.googleapis.com/v1beta/models"
                    />
                  </FormField>
                  <FormField
                    label="Gemini Model"
                    tooltip="Model ID for Gemini API. Examples: gemini-2.5-flash-lite, gemini-2.5-flash, gemini-3-flash"
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
                      label="Rate Limiting"
                      description="Enable for free tier (10-30 RPM). Disable if you have billing set up (1000+ RPM)."
                      checked={formState.CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED === 'true'}
                      onChange={(checked) => updateSetting('CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED', checked ? 'true' : 'false')}
                    />
                  </div>
                </>
              )}

              {formState.CLAUDE_MEM_PROVIDER === 'openrouter' && (
                <>
                  <FormField
                    label="OpenRouter API Key"
                    tooltip="Your OpenRouter API key from openrouter.ai (or set OPENROUTER_API_KEY env var)"
                  >
                    <input
                      type="password"
                      value={formState.CLAUDE_MEM_OPENROUTER_API_KEY || ''}
                      onChange={(e) => updateSetting('CLAUDE_MEM_OPENROUTER_API_KEY', e.target.value)}
                      placeholder="Enter OpenRouter API key..."
                    />
                  </FormField>
                  <FormField
                    label="OpenRouter Model"
                    tooltip="Model identifier from OpenRouter (e.g., anthropic/claude-3.5-sonnet, google/gemini-2.0-flash-thinking-exp)"
                  >
                    <input
                      type="text"
                      value={formState.CLAUDE_MEM_OPENROUTER_MODEL || 'xiaomi/mimo-v2-flash:free'}
                      onChange={(e) => updateSetting('CLAUDE_MEM_OPENROUTER_MODEL', e.target.value)}
                      placeholder="e.g., xiaomi/mimo-v2-flash:free"
                    />
                  </FormField>
                  <FormField
                    label="Site URL (Optional)"
                    tooltip="Your site URL for OpenRouter analytics (optional)"
                  >
                    <input
                      type="text"
                      value={formState.CLAUDE_MEM_OPENROUTER_SITE_URL || ''}
                      onChange={(e) => updateSetting('CLAUDE_MEM_OPENROUTER_SITE_URL', e.target.value)}
                      placeholder="https://yoursite.com"
                    />
                  </FormField>
                  <FormField
                    label="App Name (Optional)"
                    tooltip="Your app name for OpenRouter analytics (optional)"
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
                      Testing...
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      Test Connection
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
                        Model: {connectionTest.result.model}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <FormField
                label="Summary Language"
                tooltip="Language for AI-generated observations and summaries. Requires worker restart."
              >
                <select
                  value={formState.CLAUDE_MEM_MODE || 'code'}
                  onChange={(e) => updateSetting('CLAUDE_MEM_MODE', e.target.value)}
                >
                  <option value="code">English (Default)</option>
                  <option value="code--zh">中文 (Chinese)</option>
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
                label="Worker Port"
                tooltip="Port for the background worker service"
              >
                <input
                  type="number"
                  min="1024"
                  max="65535"
                  value={formState.CLAUDE_MEM_WORKER_PORT || '37777'}
                  onChange={(e) => updateSetting('CLAUDE_MEM_WORKER_PORT', e.target.value)}
                />
              </FormField>

              <div className="toggle-group" style={{ marginTop: '12px' }}>
                <ToggleSwitch
                  id="show-last-summary"
                  label="Include last summary"
                  description="Add previous session's summary to context"
                  checked={formState.CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY === 'true'}
                  onChange={() => toggleBoolean('CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY')}
                />
                <ToggleSwitch
                  id="show-last-message"
                  label="Include last message"
                  description="Add previous session's final message"
                  checked={formState.CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE === 'true'}
                  onChange={() => toggleBoolean('CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE')}
                />
              </div>
            </CollapsibleSection>

            {/* Section 5: Budget */}
            <CollapsibleSection
              title="Budget"
              description="Cost tracking and limits"
              defaultOpen={false}
            >
              <div className="toggle-group" style={{ marginBottom: '12px' }}>
                <ToggleSwitch
                  id="budget-enabled"
                  label="Enable Budget Tracking"
                  description="Track AI costs and enforce daily/monthly limits"
                  checked={formState.CLAUDE_MEM_BUDGET_ENABLED === 'true'}
                  onChange={() => toggleBoolean('CLAUDE_MEM_BUDGET_ENABLED')}
                />
              </div>

              {formState.CLAUDE_MEM_BUDGET_ENABLED === 'true' && (
                <>
                  <FormField
                    label="Pricing Preset"
                    tooltip="Select your pricing model. Choose 'Custom' for manual price entry."
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
                        label={formState.CLAUDE_MEM_BUDGET_PRESET === 'claude-max' ? 'Daily Message Limit' : 'Daily Budget ($)'}
                        tooltip={formState.CLAUDE_MEM_BUDGET_PRESET === 'claude-max'
                          ? 'Maximum messages per day (e.g., 100)'
                          : 'Maximum daily spending in USD (e.g., 1.00)'}
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
                        label={formState.CLAUDE_MEM_BUDGET_PRESET === 'claude-max' ? 'Monthly Message Limit' : 'Monthly Budget ($)'}
                        tooltip={formState.CLAUDE_MEM_BUDGET_PRESET === 'claude-max'
                          ? 'Maximum messages per month (e.g., 3000)'
                          : 'Maximum monthly spending in USD (e.g., 20.00)'}
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
                      label="Custom Pricing (JSON)"
                      tooltip='Format: {"input": 0.25, "output": 1.25, "cacheCreation": 0.30, "cacheRead": 0.03}'
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
          <div className="save-status">
            {saveStatus && <span className={saveStatus.includes('✓') ? 'success' : saveStatus.includes('✗') ? 'error' : ''}>{saveStatus}</span>}
          </div>
          <button
            className="save-btn"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
