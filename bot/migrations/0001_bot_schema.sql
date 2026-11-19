-- Idempotent schema for the private daily-summary Discord bot.
-- Older production databases may retain legacy alert tables from earlier bot versions;
-- the current Worker neither reads nor writes those tables, and this file never drops data.
CREATE TABLE IF NOT EXISTS discord_links (
  discord_user_id TEXT PRIMARY KEY,
  dashboard_player_id TEXT NOT NULL,
  encrypted_session_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discord_daily_summary_deliveries (
  discord_user_id TEXT NOT NULL,
  reporting_day TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(discord_user_id,reporting_day)
);

CREATE TABLE IF NOT EXISTS discord_daily_company_summary_state (
  discord_user_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  snapshot_day TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(discord_user_id,company_id)
);
