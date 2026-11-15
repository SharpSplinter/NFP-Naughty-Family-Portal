ALTER TABLE portal_user_consents
  ADD COLUMN api_key_usage_accepted INTEGER NOT NULL DEFAULT 0
    CHECK (api_key_usage_accepted IN (0, 1));

ALTER TABLE portal_user_consents
  ADD COLUMN api_key_consent_acknowledged_at TEXT;

-- SHA-256 of the exact member-owned primary Torn key that was authorized.
-- A key replacement invalidates the prior authorization and requires re-consent.
ALTER TABLE portal_user_consents
  ADD COLUMN api_key_consent_fingerprint TEXT;
