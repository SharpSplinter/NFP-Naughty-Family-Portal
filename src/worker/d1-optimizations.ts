export type OptimizedD1Value = string | number | null

export type OptimizedD1Statement = {
  bind(...values: OptimizedD1Value[]): OptimizedD1Statement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>
  run(): Promise<unknown>
}

export type OptimizedD1Database = {
  prepare(sql: string): OptimizedD1Statement
}

export type SessionAccessMetadata = {
  disabled_at?: string | null
  maintenance_mode_json?: string | null
  is_admin?: number
}

/**
 * Keep all request-time session access checks in one indexed D1 lookup.
 * The two joined tables have primary-key indexes on player_id / setting_key.
 */
export const SESSION_ACCESS_SQL = `
  SELECT
    p.player_id,
    p.player_name,
    p.faction_id,
    p.faction_verified_at,
    p.membership_check_attempted_at,
    p.membership_check_status,
    CASE WHEN a.player_id IS NULL THEN 0 ELSE 1 END AS is_admin,
    st.disabled_at AS disabled_at,
    maintenance.value_json AS maintenance_mode_json
  FROM sessions s
  JOIN players p ON p.player_id = s.player_id
  LEFT JOIN administrators a
    ON a.player_id = p.player_id AND a.revoked_at IS NULL
  LEFT JOIN dashboard_member_status st
    ON st.player_id = p.player_id
  LEFT JOIN admin_settings maintenance
    ON maintenance.setting_key = 'maintenanceMode'
  WHERE s.token_hash = ? AND s.expires_at > ?
`.trim()

export async function loadSessionAccess<T extends SessionAccessMetadata>(
  db: OptimizedD1Database,
  tokenHash: string,
  nowSeconds: number,
): Promise<T | null> {
  return db.prepare(SESSION_ACCESS_SQL).bind(tokenHash, nowSeconds).first<T>()
}

export function maintenanceModeIsEnabled(valueJson: unknown): boolean {
  if (typeof valueJson !== "string") return false
  try { return JSON.parse(valueJson) === true } catch { return false }
}

export function sessionAccessIsDenied(session: SessionAccessMetadata | null): boolean {
  if (!session || session.disabled_at) return true
  return maintenanceModeIsEnabled(session.maintenance_mode_json) && Number(session.is_admin ?? 0) !== 1
}

export const DEFAULT_AUTOMATION_PREFERENCES = Object.freeze({
  browserNotificationsEnabled: 0,
  quietHoursEnabled: 0,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  timezone: "UTC",
  minimumSeverity: "info",
  digestMode: "instant",
})

const AUTOMATION_PREFERENCES_SQL = `
  SELECT
    browser_notifications_enabled AS browserNotificationsEnabled,
    quiet_hours_enabled AS quietHoursEnabled,
    quiet_hours_start AS quietHoursStart,
    quiet_hours_end AS quietHoursEnd,
    timezone,
    minimum_severity AS minimumSeverity,
    digest_mode AS digestMode,
    updated_at AS updatedAt
  FROM automation_preferences
  WHERE owner_player_id = ?
`.trim()

/** Preference reads are read-only; defaults are returned without inserting a row. */
export async function readAutomationPreferences(
  db: OptimizedD1Database,
  ownerPlayerId: string,
): Promise<Record<string, unknown>> {
  const saved = await db.prepare(AUTOMATION_PREFERENCES_SQL).bind(ownerPlayerId).first<Record<string, unknown>>()
  return saved ?? { ...DEFAULT_AUTOMATION_PREFERENCES }
}

/**
 * Atomically reserve an 800 ms per-player request slot.
 * The single upsert serializes concurrent requests in D1 and returns the slot
 * assigned to this caller, avoiding a racy read / wait / write sequence.
 */
export const HALLOWEEN_THROTTLE_RESERVATION_SQL = `
  INSERT INTO halloween_api_throttles (player_id, last_request_at)
  VALUES (?, ?)
  ON CONFLICT(player_id) DO UPDATE SET
    last_request_at = MAX(halloween_api_throttles.last_request_at + 800, excluded.last_request_at)
  RETURNING last_request_at
`.trim()

export async function reserveHalloweenRequestSlot(
  db: OptimizedD1Database,
  playerId: string,
  nowMs = Date.now(),
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<{ reservedAt: number; waitMs: number }> {
  const result = await db.prepare(HALLOWEEN_THROTTLE_RESERVATION_SQL)
    .bind(playerId, nowMs)
    .all<{ last_request_at: number }>()
  const reservedAt = Number(result.results?.[0]?.last_request_at)
  if (!Number.isFinite(reservedAt)) throw new Error("D1 did not return the reserved Halloween API throttle slot.")
  const waitMs = Math.max(0, reservedAt - nowMs)
  if (waitMs > 0) await sleep(waitMs)
  return { reservedAt, waitMs }
}

export type GlobalRankingSnapshotMetadata = {
  reportingDay: string
  sourceFetchedAt: string
  companyCount: number
  updatedAt?: string
}

const READ_RANKING_SNAPSHOT_METADATA_SQL = `
  SELECT
    reporting_day AS reportingDay,
    source_fetched_at AS sourceFetchedAt,
    company_count AS companyCount
  FROM global_company_rank_snapshot_meta
  WHERE singleton_id = 1
`.trim()

const WRITE_RANKING_SNAPSHOT_METADATA_SQL = `
  INSERT INTO global_company_rank_snapshot_meta
    (singleton_id, reporting_day, source_fetched_at, company_count, updated_at)
  VALUES (1, ?, ?, ?, ?)
  ON CONFLICT(singleton_id) DO UPDATE SET
    reporting_day = excluded.reporting_day,
    source_fetched_at = excluded.source_fetched_at,
    company_count = excluded.company_count,
    updated_at = excluded.updated_at
`.trim()

export async function readGlobalRankingSnapshotMetadata(
  db: OptimizedD1Database,
): Promise<GlobalRankingSnapshotMetadata | null> {
  return db.prepare(READ_RANKING_SNAPSHOT_METADATA_SQL).first<GlobalRankingSnapshotMetadata>()
}

export async function writeGlobalRankingSnapshotMetadata(
  db: OptimizedD1Database,
  metadata: GlobalRankingSnapshotMetadata,
): Promise<void> {
  await db.prepare(WRITE_RANKING_SNAPSHOT_METADATA_SQL)
    .bind(metadata.reportingDay, metadata.sourceFetchedAt, metadata.companyCount, metadata.updatedAt ?? new Date().toISOString())
    .run()
}
