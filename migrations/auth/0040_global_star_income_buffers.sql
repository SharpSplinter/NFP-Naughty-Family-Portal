CREATE TABLE IF NOT EXISTS global_star_income_buffers (
  reporting_day TEXT NOT NULL,
  company_type_id INTEGER NOT NULL,
  company_type TEXT NOT NULL,
  star_rating REAL NOT NULL,
  min_weekly_income REAL NOT NULL,
  max_weekly_income REAL NOT NULL,
  company_count INTEGER NOT NULL CHECK (company_count > 0),
  source_started_at TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  PRIMARY KEY (reporting_day, company_type_id, star_rating)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS global_star_income_buffer_snapshots (
  reporting_day TEXT PRIMARY KEY,
  scheduled_at TEXT NOT NULL,
  source_started_at TEXT NOT NULL,
  source_completed_at TEXT NOT NULL,
  company_count INTEGER NOT NULL,
  benchmark_company_count INTEGER NOT NULL,
  company_type_count INTEGER NOT NULL,
  captured_at TEXT NOT NULL
);
