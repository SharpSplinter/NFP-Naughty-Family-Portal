PRAGMA foreign_keys = ON;

-- A single acknowledgement and preference record gates member access to the
-- portal after login. Feature-specific connection rows continue to hold
-- encrypted credentials and collection progress, but consent is centralized.
CREATE TABLE IF NOT EXISTS portal_user_consents (
  player_id TEXT PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
  consent_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  policy_acknowledged_at TEXT NOT NULL,
  historical_collection_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (historical_collection_enabled IN (0, 1)),
  share_private_live INTEGER NOT NULL DEFAULT 0
    CHECK (share_private_live IN (0, 1)),
  share_networth INTEGER NOT NULL DEFAULT 0
    CHECK (share_networth IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_portal_user_consents_history
  ON portal_user_consents(historical_collection_enabled, updated_at);
