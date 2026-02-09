import { Database } from 'bun:sqlite';
import { Migration } from './Database.js';

// Re-export MigrationRunner for SessionStore migration extraction
export { MigrationRunner } from './migrations/runner.js';

/**
 * Initial schema migration - creates all core tables
 */
export const migration001: Migration = {
  version: 1,
  up: (db: Database) => {
    // Sessions table - core session tracking
    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        project TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'compress',
        archive_path TEXT,
        archive_bytes INTEGER,
        archive_checksum TEXT,
        archived_at TEXT,
        metadata_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at_epoch DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_project_created ON sessions(project, created_at_epoch DESC);
    `);

    // Memories table - compressed memory chunks
    db.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        text TEXT NOT NULL,
        document_id TEXT UNIQUE,
        keywords TEXT,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        project TEXT NOT NULL,
        archive_basename TEXT,
        origin TEXT NOT NULL DEFAULT 'transcript',
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
      CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
      CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at_epoch DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_project_created ON memories(project, created_at_epoch DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_document_id ON memories(document_id);
      CREATE INDEX IF NOT EXISTS idx_memories_origin ON memories(origin);
    `);

    // Overviews table - session summaries (one per project)
    db.run(`
      CREATE TABLE IF NOT EXISTS overviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        project TEXT NOT NULL,
        origin TEXT NOT NULL DEFAULT 'claude',
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_overviews_session ON overviews(session_id);
      CREATE INDEX IF NOT EXISTS idx_overviews_project ON overviews(project);
      CREATE INDEX IF NOT EXISTS idx_overviews_created_at ON overviews(created_at_epoch DESC);
      CREATE INDEX IF NOT EXISTS idx_overviews_project_created ON overviews(project, created_at_epoch DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_overviews_project_latest ON overviews(project, created_at_epoch DESC);
    `);

    // Diagnostics table - system health and debug info
    db.run(`
      CREATE TABLE IF NOT EXISTS diagnostics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        message TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        project TEXT NOT NULL,
        origin TEXT NOT NULL DEFAULT 'system',
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_diagnostics_session ON diagnostics(session_id);
      CREATE INDEX IF NOT EXISTS idx_diagnostics_project ON diagnostics(project);
      CREATE INDEX IF NOT EXISTS idx_diagnostics_severity ON diagnostics(severity);
      CREATE INDEX IF NOT EXISTS idx_diagnostics_created ON diagnostics(created_at_epoch DESC);
    `);

    // Transcript events table - raw conversation events
    db.run(`
      CREATE TABLE IF NOT EXISTS transcript_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        project TEXT,
        event_index INTEGER NOT NULL,
        event_type TEXT,
        raw_json TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        captured_at_epoch INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
        UNIQUE(session_id, event_index)
      );

      CREATE INDEX IF NOT EXISTS idx_transcript_events_session ON transcript_events(session_id, event_index);
      CREATE INDEX IF NOT EXISTS idx_transcript_events_project ON transcript_events(project);
      CREATE INDEX IF NOT EXISTS idx_transcript_events_type ON transcript_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_transcript_events_captured ON transcript_events(captured_at_epoch DESC);
    `);

    console.log('✅ Created all database tables successfully');
  },

  down: (db: Database) => {
    db.run(`
      DROP TABLE IF EXISTS transcript_events;
      DROP TABLE IF EXISTS diagnostics;
      DROP TABLE IF EXISTS overviews;
      DROP TABLE IF EXISTS memories;
      DROP TABLE IF EXISTS sessions;
    `);
  }
};

/**
 * Migration 002 - Add hierarchical memory fields (v2 format)
 */
export const migration002: Migration = {
  version: 2,
  up: (db: Database) => {
    // Add new columns for hierarchical memory structure
    db.run(`
      ALTER TABLE memories ADD COLUMN title TEXT;
      ALTER TABLE memories ADD COLUMN subtitle TEXT;
      ALTER TABLE memories ADD COLUMN facts TEXT;
      ALTER TABLE memories ADD COLUMN concepts TEXT;
      ALTER TABLE memories ADD COLUMN files_touched TEXT;
    `);

    // Create indexes for the new fields to improve search performance
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_memories_title ON memories(title);
      CREATE INDEX IF NOT EXISTS idx_memories_concepts ON memories(concepts);
    `);

    console.log('✅ Added hierarchical memory fields to memories table');
  },

  down: (_db: Database) => {
    // Note: SQLite doesn't support DROP COLUMN in all versions
    // In production, we'd need to recreate the table without these columns
    // For now, we'll just log a warning
    console.log('⚠️  Warning: SQLite ALTER TABLE DROP COLUMN not fully supported');
    console.log('⚠️  To rollback, manually recreate the memories table');
  }
};

/**
 * Migration 003 - Add streaming_sessions table for real-time session tracking
 */
export const migration003: Migration = {
  version: 3,
  up: (db: Database) => {
    // Streaming sessions table - tracks active SDK compression sessions
    db.run(`
      CREATE TABLE IF NOT EXISTS streaming_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_session_id TEXT UNIQUE NOT NULL,
        memory_session_id TEXT,
        project TEXT NOT NULL,
        title TEXT,
        subtitle TEXT,
        user_prompt TEXT,
        started_at TEXT NOT NULL,
        started_at_epoch INTEGER NOT NULL,
        updated_at TEXT,
        updated_at_epoch INTEGER,
        completed_at TEXT,
        completed_at_epoch INTEGER,
        status TEXT NOT NULL DEFAULT 'active'
      );

      CREATE INDEX IF NOT EXISTS idx_streaming_sessions_claude_id ON streaming_sessions(content_session_id);
      CREATE INDEX IF NOT EXISTS idx_streaming_sessions_sdk_id ON streaming_sessions(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_streaming_sessions_project ON streaming_sessions(project);
      CREATE INDEX IF NOT EXISTS idx_streaming_sessions_status ON streaming_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_streaming_sessions_started ON streaming_sessions(started_at_epoch DESC);
    `);

    console.log('✅ Created streaming_sessions table for real-time session tracking');
  },

  down: (db: Database) => {
    db.run(`
      DROP TABLE IF EXISTS streaming_sessions;
    `);
  }
};

/**
 * Migration 004 - Add SDK agent architecture tables
 * Implements the refactor plan for hook-driven memory with SDK agent synthesis
 */
export const migration004: Migration = {
  version: 4,
  up: (db: Database) => {
    // SDK sessions table - tracks SDK streaming sessions
    db.run(`
      CREATE TABLE IF NOT EXISTS sdk_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_session_id TEXT UNIQUE NOT NULL,
        memory_session_id TEXT UNIQUE,
        project TEXT NOT NULL,
        user_prompt TEXT,
        started_at TEXT NOT NULL,
        started_at_epoch INTEGER NOT NULL,
        completed_at TEXT,
        completed_at_epoch INTEGER,
        status TEXT CHECK(status IN ('active', 'completed', 'failed')) NOT NULL DEFAULT 'active'
      );

      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_claude_id ON sdk_sessions(content_session_id);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_sdk_id ON sdk_sessions(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_project ON sdk_sessions(project);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_status ON sdk_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_started ON sdk_sessions(started_at_epoch DESC);
    `);

    // Observation queue table - tracks pending observations for SDK processing
    db.run(`
      CREATE TABLE IF NOT EXISTS observation_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        tool_input TEXT NOT NULL,
        tool_output TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        processed_at_epoch INTEGER,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_observation_queue_sdk_session ON observation_queue(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_observation_queue_processed ON observation_queue(processed_at_epoch);
      CREATE INDEX IF NOT EXISTS idx_observation_queue_pending ON observation_queue(memory_session_id, processed_at_epoch);
    `);

    // Observations table - stores extracted observations (what SDK decides is important)
    db.run(`
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        text TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_observations_sdk_session ON observations(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project);
      CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type);
      CREATE INDEX IF NOT EXISTS idx_observations_created ON observations(created_at_epoch DESC);
    `);

    // Session summaries table - stores structured session summaries
    db.run(`
      CREATE TABLE IF NOT EXISTS session_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT UNIQUE NOT NULL,
        project TEXT NOT NULL,
        request TEXT,
        investigated TEXT,
        learned TEXT,
        completed TEXT,
        next_steps TEXT,
        files_read TEXT,
        files_edited TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_session_summaries_sdk_session ON session_summaries(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_project ON session_summaries(project);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_created ON session_summaries(created_at_epoch DESC);
    `);

    console.log('✅ Created SDK agent architecture tables');
  },

  down: (db: Database) => {
    db.run(`
      DROP TABLE IF EXISTS session_summaries;
      DROP TABLE IF EXISTS observations;
      DROP TABLE IF EXISTS observation_queue;
      DROP TABLE IF EXISTS sdk_sessions;
    `);
  }
};

/**
 * Migration 005 - Remove orphaned tables
 * Drops streaming_sessions (superseded by sdk_sessions)
 * Drops observation_queue (superseded by Unix socket communication)
 */
export const migration005: Migration = {
  version: 5,
  up: (db: Database) => {
    // Drop streaming_sessions - superseded by sdk_sessions in migration004
    // This table was from v2 architecture and is no longer used
    db.run(`DROP TABLE IF EXISTS streaming_sessions`);

    // Drop observation_queue - superseded by Unix socket communication
    // Worker now uses sockets instead of database polling for observations
    db.run(`DROP TABLE IF EXISTS observation_queue`);

    console.log('✅ Dropped orphaned tables: streaming_sessions, observation_queue');
  },

  down: (db: Database) => {
    // Recreate tables if needed (though they should never be used)
    db.run(`
      CREATE TABLE IF NOT EXISTS streaming_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_session_id TEXT UNIQUE NOT NULL,
        memory_session_id TEXT,
        project TEXT NOT NULL,
        title TEXT,
        subtitle TEXT,
        user_prompt TEXT,
        started_at TEXT NOT NULL,
        started_at_epoch INTEGER NOT NULL,
        updated_at TEXT,
        updated_at_epoch INTEGER,
        completed_at TEXT,
        completed_at_epoch INTEGER,
        status TEXT NOT NULL DEFAULT 'active'
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS observation_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        tool_input TEXT NOT NULL,
        tool_output TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        processed_at_epoch INTEGER,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE
      )
    `);

    console.log('⚠️  Recreated streaming_sessions and observation_queue (for rollback only)');
  }
};

/**
 * Migration 006 - Add FTS5 full-text search tables
 * Creates virtual tables for fast text search on observations and session_summaries
 */
export const migration006: Migration = {
  version: 6,
  up: (db: Database) => {
    // FTS5 virtual table for observations
    // Note: This assumes the hierarchical fields (title, subtitle, etc.) already exist
    // from the inline migrations in SessionStore constructor
    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
        title,
        subtitle,
        narrative,
        text,
        facts,
        concepts,
        content='observations',
        content_rowid='id'
      );
    `);

    // Populate FTS table with existing data
    db.run(`
      INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
      SELECT id, title, subtitle, narrative, text, facts, concepts
      FROM observations;
    `);

    // Triggers to keep observations_fts in sync
    db.run(`
      CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
        INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
        VALUES (new.id, new.title, new.subtitle, new.narrative, new.text, new.facts, new.concepts);
      END;

      CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
        INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, text, facts, concepts)
        VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.text, old.facts, old.concepts);
      END;

      CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
        INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, text, facts, concepts)
        VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.text, old.facts, old.concepts);
        INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
        VALUES (new.id, new.title, new.subtitle, new.narrative, new.text, new.facts, new.concepts);
      END;
    `);

    // FTS5 virtual table for session_summaries
    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS session_summaries_fts USING fts5(
        request,
        investigated,
        learned,
        completed,
        next_steps,
        notes,
        content='session_summaries',
        content_rowid='id'
      );
    `);

    // Populate FTS table with existing data
    db.run(`
      INSERT INTO session_summaries_fts(rowid, request, investigated, learned, completed, next_steps, notes)
      SELECT id, request, investigated, learned, completed, next_steps, notes
      FROM session_summaries;
    `);

    // Triggers to keep session_summaries_fts in sync
    db.run(`
      CREATE TRIGGER IF NOT EXISTS session_summaries_ai AFTER INSERT ON session_summaries BEGIN
        INSERT INTO session_summaries_fts(rowid, request, investigated, learned, completed, next_steps, notes)
        VALUES (new.id, new.request, new.investigated, new.learned, new.completed, new.next_steps, new.notes);
      END;

      CREATE TRIGGER IF NOT EXISTS session_summaries_ad AFTER DELETE ON session_summaries BEGIN
        INSERT INTO session_summaries_fts(session_summaries_fts, rowid, request, investigated, learned, completed, next_steps, notes)
        VALUES('delete', old.id, old.request, old.investigated, old.learned, old.completed, old.next_steps, old.notes);
      END;

      CREATE TRIGGER IF NOT EXISTS session_summaries_au AFTER UPDATE ON session_summaries BEGIN
        INSERT INTO session_summaries_fts(session_summaries_fts, rowid, request, investigated, learned, completed, next_steps, notes)
        VALUES('delete', old.id, old.request, old.investigated, old.learned, old.completed, old.next_steps, old.notes);
        INSERT INTO session_summaries_fts(rowid, request, investigated, learned, completed, next_steps, notes)
        VALUES (new.id, new.request, new.investigated, new.learned, new.completed, new.next_steps, new.notes);
      END;
    `);

    console.log('✅ Created FTS5 virtual tables and triggers for full-text search');
  },

  down: (db: Database) => {
    db.run(`
      DROP TRIGGER IF EXISTS observations_au;
      DROP TRIGGER IF EXISTS observations_ad;
      DROP TRIGGER IF EXISTS observations_ai;
      DROP TABLE IF EXISTS observations_fts;

      DROP TRIGGER IF EXISTS session_summaries_au;
      DROP TRIGGER IF EXISTS session_summaries_ad;
      DROP TRIGGER IF EXISTS session_summaries_ai;
      DROP TABLE IF EXISTS session_summaries_fts;
    `);
  }
};

/**
 * Migration 007 - Add discovery_tokens column for ROI metrics
 * Tracks token cost of discovering/creating each observation and summary
 */
export const migration007: Migration = {
  version: 7,
  up: (db: Database) => {
    // Add discovery_tokens to observations table
    db.run(`ALTER TABLE observations ADD COLUMN discovery_tokens INTEGER DEFAULT 0`);

    // Add discovery_tokens to session_summaries table
    db.run(`ALTER TABLE session_summaries ADD COLUMN discovery_tokens INTEGER DEFAULT 0`);

    console.log('✅ Added discovery_tokens columns for ROI tracking');
  },

  down: (db: Database) => {
    // Note: SQLite doesn't support DROP COLUMN in all versions
    // In production, would need to recreate tables without these columns
    console.log('⚠️  Warning: SQLite ALTER TABLE DROP COLUMN not fully supported');
    console.log('⚠️  To rollback, manually recreate the observations and session_summaries tables');
  }
};


/**
 * Migration 008 - Add ai_analysis table and link to observations
 * Implements AI analysis aggregation for multiple observations
 */
export const migration008: Migration = {
  version: 8,
  up: (db: Database) => {
    // AI analysis table - stores comprehensive analysis of multiple observations
    db.run(`
      CREATE TABLE IF NOT EXISTS ai_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        analysis_text TEXT NOT NULL,
        key_insights TEXT,
        connections TEXT,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        discovery_tokens INTEGER DEFAULT 0,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ai_analysis_session ON ai_analysis(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_ai_analysis_project ON ai_analysis(project);
      CREATE INDEX IF NOT EXISTS idx_ai_analysis_created ON ai_analysis(created_at_epoch DESC);
    `);

    // Add ai_analysis_id foreign key to observations table
    db.run(`ALTER TABLE observations ADD COLUMN ai_analysis_id INTEGER REFERENCES ai_analysis(id) ON DELETE SET NULL`);

    // Create index for the foreign key
    db.run(`CREATE INDEX IF NOT EXISTS idx_observations_ai_analysis ON observations(ai_analysis_id)`);

    // Create FTS5 virtual table for ai_analysis
    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ai_analysis_fts USING fts5(
        analysis_text,
        key_insights,
        connections,
        content='ai_analysis',
        content_rowid='id'
      );
    `);

    // Triggers to keep ai_analysis_fts in sync
    db.run(`
      CREATE TRIGGER IF NOT EXISTS ai_analysis_ai AFTER INSERT ON ai_analysis BEGIN
        INSERT INTO ai_analysis_fts(rowid, analysis_text, key_insights, connections)
        VALUES (new.id, new.analysis_text, new.key_insights, new.connections);
      END;

      CREATE TRIGGER IF NOT EXISTS ai_analysis_ad AFTER DELETE ON ai_analysis BEGIN
        INSERT INTO ai_analysis_fts(ai_analysis_fts, rowid, analysis_text, key_insights, connections)
        VALUES('delete', old.id, old.analysis_text, old.key_insights, old.connections);
      END;

      CREATE TRIGGER IF NOT EXISTS ai_analysis_au AFTER UPDATE ON ai_analysis BEGIN
        INSERT INTO ai_analysis_fts(ai_analysis_fts, rowid, analysis_text, key_insights, connections)
        VALUES('delete', old.id, old.analysis_text, old.key_insights, old.connections);
        INSERT INTO ai_analysis_fts(rowid, analysis_text, key_insights, connections)
        VALUES (new.id, new.analysis_text, new.key_insights, new.connections);
      END;
    `);

    console.log('✅ Created ai_analysis table and linked to observations');
  },

  down: (db: Database) => {
    db.run(`
      DROP TRIGGER IF EXISTS ai_analysis_au;
      DROP TRIGGER IF EXISTS ai_analysis_ad;
      DROP TRIGGER IF EXISTS ai_analysis_ai;
      DROP TABLE IF EXISTS ai_analysis_fts;
      DROP TABLE IF EXISTS ai_analysis;
    `);

    console.log('⚠️  Warning: ai_analysis_id column in observations table cannot be dropped in SQLite');
    console.log('⚠️  To fully rollback, manually recreate the observations table');
  }
};

/**
 * Migration 009 - Add budget tracking tables
 * Implements industrial-grade cost tracking with two-phase commit and optimistic locking
 */
export const migration009: Migration = {
  version: 9,
  up: (db: Database) => {
    // budget_state table - single-row global state with optimistic lock
    // Uses CHECK (id = 1) to enforce single-row constraint
    db.run(`
      CREATE TABLE IF NOT EXISTS budget_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        budget_date TEXT NOT NULL,
        budget_month TEXT NOT NULL,
        spent_today_micros INTEGER NOT NULL DEFAULT 0,
        spent_month_micros INTEGER NOT NULL DEFAULT 0,
        daily_limit_micros INTEGER NOT NULL DEFAULT 1000000,
        monthly_limit_micros INTEGER NOT NULL DEFAULT 20000000,
        version INTEGER NOT NULL DEFAULT 1,
        last_update_epoch INTEGER NOT NULL,
        CONSTRAINT spent_today_not_negative CHECK (spent_today_micros >= 0),
        CONSTRAINT spent_month_not_negative CHECK (spent_month_micros >= 0)
      );
    `);

    // budget_transactions table - two-phase commit tracking
    // Tracks reserved → committed/rolled_back transitions
    db.run(`
      CREATE TABLE IF NOT EXISTS budget_transactions (
        id TEXT PRIMARY KEY,
        phase TEXT NOT NULL CHECK (phase IN ('reserved', 'committed', 'rolled_back')),
        cost_micros INTEGER NOT NULL,
        provider TEXT NOT NULL,
        observation_id INTEGER,
        session_db_id INTEGER,
        created_at_epoch INTEGER NOT NULL,
        committed_at_epoch INTEGER,
        rolled_back_at_epoch INTEGER,
        error_reason TEXT,
        FOREIGN KEY(observation_id) REFERENCES observations(id) ON DELETE SET NULL,
        FOREIGN KEY(session_db_id) REFERENCES sdk_sessions(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_budget_tx_phase ON budget_transactions(phase);
      CREATE INDEX IF NOT EXISTS idx_budget_tx_created ON budget_transactions(created_at_epoch);
      CREATE INDEX IF NOT EXISTS idx_budget_tx_session ON budget_transactions(session_db_id);
    `);

    // budget_records table - historical cost records
    // Stores completed transactions with token details for analytics
    db.run(`
      CREATE TABLE IF NOT EXISTS budget_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date_key TEXT NOT NULL,
        month_key TEXT NOT NULL,
        provider TEXT NOT NULL,
        session_db_id INTEGER,
        observation_id INTEGER,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_creation_tokens INTEGER DEFAULT 0,
        cache_read_tokens INTEGER DEFAULT 0,
        cost_micros INTEGER NOT NULL,
        price_input_per_m REAL,
        price_output_per_m REAL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(session_db_id) REFERENCES sdk_sessions(id) ON DELETE SET NULL,
        FOREIGN KEY(observation_id) REFERENCES observations(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_budget_records_date ON budget_records(date_key);
      CREATE INDEX IF NOT EXISTS idx_budget_records_month ON budget_records(month_key);
      CREATE INDEX IF NOT EXISTS idx_budget_records_provider ON budget_records(provider);
      CREATE INDEX IF NOT EXISTS idx_budget_records_session ON budget_records(session_db_id);
    `);

    // Initialize budget_state with default values (single row)
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const month = today.substring(0, 7);

    db.run(`
      INSERT OR IGNORE INTO budget_state (
        id, budget_date, budget_month,
        spent_today_micros, spent_month_micros,
        daily_limit_micros, monthly_limit_micros,
        version, last_update_epoch
      ) VALUES (
        1, ?, ?,
        0, 0,
        1000000, 20000000,
        1, ?
      )
    `, [today, month, Date.now()]);

    console.log('✅ Created budget tracking tables (budget_state, budget_transactions, budget_records)');
  },

  down: (db: Database) => {
    db.run(`
      DROP TABLE IF EXISTS budget_records;
      DROP TABLE IF EXISTS budget_transactions;
      DROP TABLE IF EXISTS budget_state;
    `);
  }
};

/**
 * All migrations in order
 */
export const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009
];