from __future__ import annotations

import re
import sqlite3
from pathlib import Path

migration = Path(__file__).parents[1] / "bot/migrations/0003_retire_legacy_alert_tables.sql"
sql = migration.read_text(encoding="utf-8")
expected_retired = {
    "alert_preferences",
    "alert_deliveries",
    "discord_alert_deliveries",
    "discord_alert_poll_escalations",
    "discord_alert_poll_state",
    "discord_alert_state",
}
actual_retired = set(re.findall(r"DROP\s+TABLE\s+IF\s+EXISTS\s+([a-zA-Z_][a-zA-Z0-9_]*)", sql, re.I))
assert actual_retired == expected_retired, (actual_retired, expected_retired)

connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys = ON")
connection.executescript("""
CREATE TABLE discord_links (
  discord_user_id TEXT PRIMARY KEY,
  dashboard_player_id TEXT NOT NULL,
  encrypted_session_token TEXT NOT NULL,
  token_iv TEXT NOT NULL
);
INSERT INTO discord_links VALUES ('discord-user-1', 'player-1', 'ciphertext', 'iv');

CREATE TABLE discord_daily_summary_deliveries (
  discord_user_id TEXT NOT NULL,
  reporting_day TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(discord_user_id, reporting_day)
);
INSERT INTO discord_daily_summary_deliveries
  VALUES ('discord-user-1', '2026-11-18', 'delivered', 1, '2026-11-18T18:20:00Z');

CREATE TABLE discord_daily_company_summary_state (
  discord_user_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  snapshot_day TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(discord_user_id, company_id)
);
INSERT INTO discord_daily_company_summary_state
  VALUES ('discord-user-1', 'company-1', '2026-11-18', '{}', '2026-11-18T18:20:00Z');

CREATE TABLE discord_daily_company_summary_history (
  discord_user_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  snapshot_day TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(discord_user_id, company_id, snapshot_day)
);
INSERT INTO discord_daily_company_summary_history
  VALUES ('discord-user-1', 'company-1', '2026-11-17', '{}', '2026-11-17T18:20:00Z');

CREATE TABLE alert_deliveries (
  delivery_key TEXT PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  delivered_at TEXT NOT NULL
);
INSERT INTO alert_deliveries VALUES ('delivery-1', 'discord-user-1', '2026-11-01T00:00:00Z');

CREATE TABLE alert_preferences (
  discord_user_id TEXT PRIMARY KEY REFERENCES discord_links(discord_user_id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  severities TEXT NOT NULL DEFAULT '["critical","warning"]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO alert_preferences VALUES ('discord-user-1', 1, '["critical"]', '2026-11-01T00:00:00Z');

CREATE TABLE discord_alert_deliveries (
  discord_user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(discord_user_id, event_id)
);
INSERT INTO discord_alert_deliveries VALUES ('discord-user-1', 'event-1', 'delivered', 1, '2026-11-01T00:00:00Z');

CREATE TABLE discord_alert_poll_escalations (
  discord_user_id TEXT NOT NULL,
  escalation_key TEXT NOT NULL,
  triggered_at TEXT NOT NULL,
  notification_delivered INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(discord_user_id, escalation_key)
);
CREATE TABLE discord_alert_poll_state (
  discord_user_id TEXT PRIMARY KEY,
  last_status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO discord_alert_poll_state VALUES ('discord-user-1', 'ok', '2026-11-01T00:00:00Z');

CREATE TABLE discord_alert_state (
  discord_user_id TEXT PRIMARY KEY,
  linked_at TEXT NOT NULL
);
INSERT INTO discord_alert_state VALUES ('discord-user-1', '2026-11-01T00:00:00Z');
""")

active_tables = {
    "discord_links",
    "discord_daily_summary_deliveries",
    "discord_daily_company_summary_state",
    "discord_daily_company_summary_history",
}
active_counts_before = {}
for table in active_tables:
    active_counts_before[table] = connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]

connection.executescript(sql)
tables_after = {
    row[0]
    for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
}
assert expected_retired.isdisjoint(tables_after), expected_retired.intersection(tables_after)
assert active_tables.issubset(tables_after), active_tables.difference(tables_after)
for table, expected_count in active_counts_before.items():
    actual_count = connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
    assert actual_count == expected_count, (table, expected_count, actual_count)
assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
assert connection.execute("SELECT COUNT(*) FROM discord_links").fetchone()[0] == 1

print("PASS bot D1 cleanup migration: exactly six retired alert tables removed; Discord links and all daily-summary tables/data preserved; foreign keys valid.")
connection.close()
