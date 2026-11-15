PRAGMA foreign_keys = ON;

-- Data collection is automatic after the current policy/API-key acknowledgement.
-- This setting controls only who may view member-owned private datasets.
ALTER TABLE portal_user_consents
  ADD COLUMN private_data_visibility TEXT NOT NULL DEFAULT 'self'
    CHECK (private_data_visibility IN ('self', 'faction_access', 'faction_members'));

CREATE INDEX IF NOT EXISTS idx_portal_user_consents_private_visibility
  ON portal_user_consents(private_data_visibility, updated_at);

-- Cache the member key's actual /key/info faction permission for a short period.
-- The cache is bound to the encrypted primary-key fingerprint so key replacement
-- invalidates it immediately. A missing/expired/failed check is always denied.
CREATE TABLE IF NOT EXISTS portal_member_key_capabilities (
  player_id TEXT PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
  key_fingerprint TEXT NOT NULL,
  faction_access INTEGER NOT NULL DEFAULT 0
    CHECK (faction_access IN (0, 1)),
  validated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_portal_member_key_capabilities_validated
  ON portal_member_key_capabilities(validated_at);
