PRAGMA foreign_keys = ON;

-- Existing event windows are historical definitions whose per-member start
-- times must remain explicitly confirmed. Newly synced future windows can
-- opt out of that confirmation when Torn supplies their live calendar data.
ALTER TABLE halloween_event_windows
  ADD COLUMN fixed_start_time INTEGER NOT NULL DEFAULT 0
  CHECK (fixed_start_time IN (0, 1));

ALTER TABLE halloween_event_windows
  ADD COLUMN requires_time_confirmation INTEGER NOT NULL DEFAULT 1
  CHECK (requires_time_confirmation IN (0, 1));

ALTER TABLE halloween_event_windows
  ADD COLUMN calendar_source TEXT NOT NULL DEFAULT 'historical_known'
  CHECK (calendar_source IN ('historical_known', 'torn_calendar', 'historical_fallback'));

-- Rows that already exist here were saved through the user's explicit
-- historical-time confirmation flow. New future rows can be marked torn_api.
ALTER TABLE halloween_member_event_slots
  ADD COLUMN source TEXT NOT NULL DEFAULT 'user_confirmed'
  CHECK (source IN ('user_confirmed', 'torn_api'));

-- Cache the authenticated player's view of Torn's current-year event calendar.
-- The user calendar time is player-specific, so it is deliberately keyed by
-- player_id rather than stored on the shared event definition.
CREATE TABLE IF NOT EXISTS torn_event_calendar_cache (
  player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  event_year INTEGER NOT NULL,
  title TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  earliest_start_at TEXT NOT NULL,
  latest_end_at TEXT NOT NULL,
  fixed_start_time INTEGER NOT NULL CHECK (fixed_start_time IN (0, 1)),
  personal_start_minute_of_day INTEGER,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (player_id, event_key, event_year)
);

CREATE INDEX IF NOT EXISTS torn_event_calendar_cache_fetched_idx
  ON torn_event_calendar_cache(fetched_at);
