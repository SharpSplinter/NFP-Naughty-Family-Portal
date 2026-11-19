-- The current dashboard Worker and summary-only Discord bot no longer expose
-- or write the retired alert poll-health telemetry. Keep account-linking tables.
DROP TABLE IF EXISTS discord_alert_poll_history;
DROP TABLE IF EXISTS discord_alert_poll_health;
