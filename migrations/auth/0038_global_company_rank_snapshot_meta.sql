-- Store the latest completed global-ranking snapshot metadata separately.
-- The one-time backfill scans the existing latest reporting day; API requests
-- subsequently read one indexed singleton row instead of aggregating ~15k rows.
CREATE TABLE IF NOT EXISTS global_company_rank_snapshot_meta (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  reporting_day TEXT NOT NULL,
  source_fetched_at TEXT NOT NULL,
  company_count INTEGER NOT NULL CHECK (company_count >= 0),
  updated_at TEXT NOT NULL
);

INSERT OR REPLACE INTO global_company_rank_snapshot_meta
  (singleton_id, reporting_day, source_fetched_at, company_count, updated_at)
SELECT
  1,
  reporting_day,
  MAX(source_fetched_at),
  COUNT(*),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM global_company_rank_snapshots
WHERE reporting_day = (SELECT MAX(reporting_day) FROM global_company_rank_snapshots)
GROUP BY reporting_day;
