import React, { useState } from 'react';
import { Observation } from '../types';
import { formatDate } from '../utils/formatters';
import { useLocale } from '../hooks/useLocale';

interface ObservationCardProps {
  observation: Observation;
}

function safeParse<T>(json: string | null | undefined): T[] {
  if (!json) return [];
  try { return JSON.parse(json) as T[]; } catch { return []; }
}

// Helper to compute longest common directory prefix from file path arrays
function longestCommonPrefix(parts: string[][]): string[] {
  if (parts.length === 0) return [];
  let prefix = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const shorter = Math.min(prefix.length, parts[i].length);
    let j = 0;
    while (j < shorter && prefix[j] === parts[i][j]) j++;
    prefix = prefix.slice(0, j);
  }
  return prefix;
}

// Returns a compact file summary string, or null if no files
function getFilesSummary(filesRead: string[], filesModified: string[]): { count: number; prefix: string } | null {
  const allFiles = [...new Set([...filesRead, ...filesModified])];
  if (allFiles.length === 0) return null;
  if (allFiles.length === 1) return { count: 1, prefix: allFiles[0] };
  const parts = allFiles.map(f => f.split('/'));
  const common = longestCommonPrefix(parts);
  // Keep max 3 directory levels for readability
  const prefixStr = common.length > 0 ? common.slice(0, 3).join('/') + '/' : '';
  return { count: allFiles.length, prefix: prefixStr };
}

// Helper to strip project root from file paths
function stripProjectRoot(filePath: string): string {
  // Try to extract relative path by finding common project markers
  const markers = ['/Scripts/', '/src/', '/plugin/', '/docs/'];

  for (const marker of markers) {
    const index = filePath.indexOf(marker);
    if (index !== -1) {
      // Keep the marker and everything after it
      return filePath.substring(index + 1);
    }
  }

  // Fallback: if path contains project name, strip everything before it
  const projectIndex = filePath.indexOf('claude-mem/');
  if (projectIndex !== -1) {
    return filePath.substring(projectIndex + 'claude-mem/'.length);
  }

  // If no markers found, return basename or original path
  const parts = filePath.split('/');
  return parts.length > 3 ? parts.slice(-3).join('/') : filePath;
}

export function ObservationCard({ observation }: ObservationCardProps) {
  const { t } = useLocale();
  const [showFacts, setShowFacts] = useState(false);
  const [showNarrative, setShowNarrative] = useState(false);
  const date = formatDate(observation.created_at_epoch);

  // Parse JSON fields — safeParse returns [] on malformed JSON, preventing render crashes
  const facts = safeParse<string>(observation.facts);
  const concepts = safeParse<string>(observation.concepts);
  const filesRead = safeParse<string>(observation.files_read).map(stripProjectRoot);
  const filesModified = safeParse<string>(observation.files_modified).map(stripProjectRoot);

  // Show facts toggle if there are facts, concepts, or files
  const hasFactsContent = facts.length > 0 || concepts.length > 0 || filesRead.length > 0 || filesModified.length > 0;

  return (
    <div className="card">
      {/* Header with toggle buttons in top right */}
      <div className="card-header">
        <div className="card-header-left">
          <span className={`card-type type-${observation.type}`}>
            {observation.type}
          </span>
          <span className="card-project">{observation.project}</span>
        </div>
        <div className="view-mode-toggles">
          {hasFactsContent && (
            <button
              className={`view-mode-toggle ${showFacts ? 'active' : ''}`}
              onClick={() => {
                setShowFacts(!showFacts);
                if (!showFacts) setShowNarrative(false); // Turn off narrative when turning on facts
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4"></polyline>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
              <span>{t('observation.facts')}</span>
            </button>
          )}
          {observation.narrative && (
            <button
              className={`view-mode-toggle ${showNarrative ? 'active' : ''}`}
              onClick={() => {
                setShowNarrative(!showNarrative);
                if (!showNarrative) setShowFacts(false); // Turn off facts when turning on narrative
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
              <span>{t('observation.narrative')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="card-title">{observation.title || t('observation.untitled')}</div>

      {/* Content based on toggle state */}
      <div className="view-mode-content">
        {!showFacts && !showNarrative && observation.subtitle && (
          <div className="card-subtitle">{observation.subtitle}</div>
        )}
        {showFacts && facts.length > 0 && (
          <ul className="facts-list">
            {facts.map((fact: string, i: number) => (
              <li key={i}>{fact}</li>
            ))}
          </ul>
        )}
        {showNarrative && observation.narrative && (
          <div className="narrative">
            {observation.narrative}
          </div>
        )}
      </div>

      {/* Concepts - always visible when present */}
      {concepts.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
          {concepts.map((concept: string, i: number) => (
            <span key={i} style={{
              padding: '2px 8px',
              background: 'var(--color-type-badge-bg)',
              color: 'var(--color-type-badge-text)',
              borderRadius: '3px',
              fontWeight: '500',
              fontSize: '10px'
            }}>
              {concept}
            </span>
          ))}
        </div>
      )}

      {/* Metadata footer - id, date, file summary, and conditionally files detail when facts toggle is on */}
      <div className="card-meta">
        <span className="meta-date">
          #{observation.id} • {date}
          {(() => {
            const summary = getFilesSummary(filesRead, filesModified);
            if (!summary) return null;
            const label = summary.count === 1
              ? summary.prefix
              : summary.prefix
                ? t('observation.filesIn', { count: summary.count, prefix: summary.prefix })
                : t('observation.files', { count: summary.count });
            return <span style={{ opacity: 0.7 }}> • 📁 {label}</span>;
          })()}
        </span>
        {showFacts && (filesRead.length > 0 || filesModified.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            {filesRead.length > 0 && (
              <span className="meta-files">
                <span className="file-label">{t('observation.read')}</span> {filesRead.join(', ')}
              </span>
            )}
            {filesModified.length > 0 && (
              <span className="meta-files">
                <span className="file-label">{t('observation.modified')}</span> {filesModified.join(', ')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
