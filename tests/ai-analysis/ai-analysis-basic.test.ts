/**
 * AI Analysis Basic Tests
 * Tests for AI analysis storage, retrieval, and linking with observations
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { SessionStore } from '../../src/services/sqlite/SessionStore.js';

describe('AI Analysis - Basic Operations', () => {
  let store: SessionStore;
  let testProject: string;
  let memorySessionId: string;

  beforeEach(() => {
    // Use in-memory database for tests
    store = new SessionStore(':memory:');
    testProject = 'test-project';
    memorySessionId = `mem-${Date.now()}`;

    // Create a session record to satisfy foreign key constraints
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    store.db.prepare(`
      INSERT INTO sdk_sessions
      (content_session_id, memory_session_id, project, user_prompt, started_at, started_at_epoch, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(`content-${now}`, memorySessionId, testProject, 'Test prompt', nowIso, now);
  });

  test('should create AI analysis table via migration', () => {
    // Check that ai_analysis table exists
    const tables = store.db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='ai_analysis'
    `).all();

    expect(tables.length).toBe(1);
  });

  test('should store AI analysis with key insights and connections', () => {
    const result = store.storeAIAnalysis(
      memorySessionId,
      testProject,
      'This is a comprehensive analysis of the observations',
      ['Insight 1: Pattern detected', 'Insight 2: Potential improvement'],
      ['Connection to previous work', 'Related to feature X'],
      [],
      100
    );

    expect(result.id).toBeGreaterThan(0);
    expect(result.createdAtEpoch).toBeGreaterThan(0);
  });

  test('should retrieve AI analysis by ID', () => {
    const stored = store.storeAIAnalysis(
      memorySessionId,
      testProject,
      'Test analysis',
      ['Insight A'],
      ['Connection B'],
      [],
      50
    );

    const retrieved = store.getAIAnalysisById(stored.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved.analysisText).toBe('Test analysis');
    expect(retrieved.keyInsights).toEqual(['Insight A']);
    expect(retrieved.connections).toEqual(['Connection B']);
    expect(retrieved.discoveryTokens).toBe(50);
  });

  test('should link observations to AI analysis', () => {
    // Create some observations
    const obs1Id = store.storeObservation(
      memorySessionId,
      testProject,
      {
        type: 'discovery',
        title: 'Observation 1',
        subtitle: null,
        facts: ['Fact 1'],
        narrative: 'Narrative 1',
        concepts: ['concept-a'],
        files_read: [],
        files_modified: []
      }
    ).id;

    const obs2Id = store.storeObservation(
      memorySessionId,
      testProject,
      {
        type: 'decision',
        title: 'Observation 2',
        subtitle: null,
        facts: ['Fact 2'],
        narrative: 'Narrative 2',
        concepts: ['concept-b'],
        files_read: [],
        files_modified: []
      }
    ).id;

    // Create AI analysis and link observations
    const analysisResult = store.storeAIAnalysis(
      memorySessionId,
      testProject,
      'Combined analysis of observations',
      ['Key pattern identified'],
      ['Links to architecture'],
      [obs1Id, obs2Id],
      200
    );

    // Verify observations are linked
    const linkedObs = store.getObservationsForAnalysis(analysisResult.id);
    expect(linkedObs).toEqual([obs1Id, obs2Id]);
  });

  test('should detect existing analysis for observations', () => {
    // Create observation
    const obsId = store.storeObservation(
      memorySessionId,
      testProject,
      {
        type: 'bugfix',
        title: 'Bug Fix',
        subtitle: null,
        facts: [],
        narrative: 'Fixed a bug',
        concepts: [],
        files_read: [],
        files_modified: []
      }
    ).id;

    // Create analysis linked to observation
    const analysisResult = store.storeAIAnalysis(
      memorySessionId,
      testProject,
      'Analysis of bug fix',
      [],
      [],
      [obsId],
      50
    );

    // Check if observation has existing analysis
    const existingAnalysisId = store.getExistingAnalysisForObservations([obsId]);
    expect(existingAnalysisId).toBe(analysisResult.id);
  });

  test('should get recent AI analyses for project', () => {
    // Create multiple analyses with explicit timestamps to ensure ordering
    const baseTime = Date.now();
    for (let i = 0; i < 5; i++) {
      store.db.prepare(`
        INSERT INTO ai_analysis
        (memory_session_id, project, analysis_text, key_insights, connections,
         discovery_tokens, created_at, created_at_epoch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        memorySessionId,
        testProject,
        `Analysis ${i}`,
        JSON.stringify([`Insight ${i}`]),
        null,
        10,
        new Date(baseTime + i).toISOString(),
        baseTime + i
      );
    }

    // Get recent analyses
    const recent = store.getRecentAIAnalyses(testProject, 3);
    expect(recent.length).toBe(3);

    // Should be in reverse chronological order
    expect(recent[0].analysisText).toBe('Analysis 4');
    expect(recent[1].analysisText).toBe('Analysis 3');
    expect(recent[2].analysisText).toBe('Analysis 2');
  });

  test('should perform full-text search on AI analyses', () => {
    // Create analyses with searchable content
    store.storeAIAnalysis(
      memorySessionId,
      testProject,
      'Database optimization analysis',
      ['Use indexes', 'Cache frequently accessed data'],
      [],
      [],
      100
    );

    store.storeAIAnalysis(
      memorySessionId,
      testProject,
      'UI redesign proposal',
      ['Improve user experience', 'Modernize interface'],
      [],
      [],
      120
    );

    // Search for "database"
    const results = store.searchAIAnalyses('database', testProject, 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].analysisText).toContain('Database');
  });
});
