-- Narrow repeated admin lookups to the member/date ranges they actually need.
CREATE INDEX IF NOT EXISTS companies_player_fetched_idx
  ON companies(player_id, fetched_at DESC, company_id);

CREATE INDEX IF NOT EXISTS players_updated_idx
  ON players(updated_at DESC);

-- Match the COALESCE expression used by the weekly-boundary cohort query.
CREATE INDEX IF NOT EXISTS faction_membership_boundary_window_idx
  ON faction_membership_intervals(
    faction_id,
    COALESCE(estimated_joined_at, first_seen_at),
    left_observed_at
  );
