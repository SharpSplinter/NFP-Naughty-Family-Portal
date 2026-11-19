-- The current private daily-summary bot does not read or write these legacy
-- alert/poll tables. Account links and daily-summary state/history are retained.
DROP TABLE IF EXISTS alert_preferences;
DROP TABLE IF EXISTS alert_deliveries;
DROP TABLE IF EXISTS discord_alert_deliveries;
DROP TABLE IF EXISTS discord_alert_poll_escalations;
DROP TABLE IF EXISTS discord_alert_poll_state;
DROP TABLE IF EXISTS discord_alert_state;
