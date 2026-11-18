ALTER TABLE portal_user_consents
  ADD COLUMN api_key_access_type TEXT
    CHECK (api_key_access_type IN ('custom', 'full'));
