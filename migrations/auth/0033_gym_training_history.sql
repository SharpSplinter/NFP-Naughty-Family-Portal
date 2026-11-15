PRAGMA foreign_keys = ON;

-- Gym training history is personal member data. The existing encrypted primary
-- portal key is reused; this table records only the validated User → Log
-- connection metadata and never stores a second copy of the API credential.
CREATE TABLE IF NOT EXISTS gym_training_historical_keys (
  player_id TEXT PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
  last_four TEXT NOT NULL,
  access_level TEXT NOT NULL,
  last_validated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gym_training_collection_jobs (
  job_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL UNIQUE REFERENCES players(player_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'complete', 'failed', 'cancelled')),
  cursor_url TEXT,
  cursor_direction TEXT,
  pages_collected INTEGER NOT NULL DEFAULT 0,
  logs_scanned INTEGER NOT NULL DEFAULT 0,
  logs_collected INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_gym_training_jobs_player_status
  ON gym_training_collection_jobs(player_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS gym_training_event_logs (
  player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  log_id TEXT NOT NULL,
  event_timestamp INTEGER NOT NULL,
  log_type_id INTEGER,
  category TEXT,
  title TEXT,
  log_json TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  PRIMARY KEY (player_id, log_id)
);

CREATE INDEX IF NOT EXISTS idx_gym_training_logs_player_timestamp
  ON gym_training_event_logs(player_id, event_timestamp DESC, log_id);
