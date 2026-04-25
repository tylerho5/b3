-- Tasks: the unit of work (prompt + worktree + tests)
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  base_repo     TEXT,
  base_commit   TEXT,
  test_command  TEXT,
  time_budget_s INTEGER NOT NULL DEFAULT 600,
  judge_enabled INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- One "▶ run all" click = one matrix_run with N child runs
CREATE TABLE matrix_runs (
  id             TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL REFERENCES tasks(id),
  skill_ids      TEXT NOT NULL DEFAULT '[]',
  concurrency    INTEGER NOT NULL,
  started_at     TEXT NOT NULL,
  completed_at   TEXT,
  status         TEXT NOT NULL
);

-- Snapshot of provider config at run time (for historical readability)
CREATE TABLE providers_cache (
  matrix_run_id TEXT PRIMARY KEY REFERENCES matrix_runs(id),
  config_toml   TEXT NOT NULL
);

-- One cell of the matrix = one (harness, provider, model) run
CREATE TABLE runs (
  id                 TEXT PRIMARY KEY,
  matrix_run_id      TEXT NOT NULL REFERENCES matrix_runs(id),
  harness            TEXT NOT NULL,
  provider_id        TEXT NOT NULL,
  model_id           TEXT NOT NULL,
  worktree_path      TEXT NOT NULL,
  session_id         TEXT,
  status             TEXT NOT NULL,
  started_at         TEXT,
  completed_at       TEXT,
  exit_code          INTEGER,
  tests_passed       INTEGER,
  input_tokens         INTEGER NOT NULL DEFAULT 0,
  output_tokens        INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens    INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens   INTEGER NOT NULL DEFAULT 0,
  cost_usd             REAL    NOT NULL DEFAULT 0,
  turns                INTEGER NOT NULL DEFAULT 0,
  judge_score          INTEGER,
  judge_notes          TEXT
);
CREATE INDEX idx_runs_matrix ON runs(matrix_run_id);

-- Segments: initial run + each followup message (broadcast or per-session)
CREATE TABLE run_segments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        TEXT NOT NULL REFERENCES runs(id),
  seq           INTEGER NOT NULL,
  kind          TEXT NOT NULL,
  message       TEXT,
  started_at    TEXT NOT NULL,
  completed_at  TEXT,
  duration_ms   INTEGER,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost_usd      REAL,
  UNIQUE(run_id, seq)
);

-- Append-only event stream — adapters emit NormalizedEvent objects here
CREATE TABLE events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT NOT NULL REFERENCES runs(id),
  segment_seq  INTEGER NOT NULL,
  ts_ms        INTEGER NOT NULL,
  type         TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX idx_events_run_ts ON events(run_id, ts_ms);

-- Skill bundles (discovered from filesystem on server start; cached for UI)
CREATE TABLE skill_bundles (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  source        TEXT NOT NULL,
  source_label  TEXT NOT NULL,
  path          TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL
);
