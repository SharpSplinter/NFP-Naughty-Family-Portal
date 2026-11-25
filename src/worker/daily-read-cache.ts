type D1Value = string | number | null
export type DailyCacheStatement = {
  bind(...values: D1Value[]): DailyCacheStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results?: T[]; success?: boolean; meta?: { changes?: number } }>
  run(): Promise<{ success?: boolean; meta?: { changes?: number } }>
}
export type DailyCacheDatabase = {
  prepare(sql: string): DailyCacheStatement
  batch?(statements: DailyCacheStatement[]): Promise<unknown[]>
}
type CacheEntry = { serialized: string; expiresAt: number; bytes: number }
export type DailyReadCacheKV = {
  get(key: string, options?: { cacheTtl?: number }): Promise<string | null>
  put(key: string, value: string, options?: { expiration?: number }): Promise<void>
}

const DAY_MS = 24 * 60 * 60 * 1000
const REPORTING_OFFSET_MS = 18 * 60 * 60 * 1000
const CACHE_VERSION = "ncd-daily-read-v1"
const MAX_LOCAL_CACHE_ENTRIES = 512
const MAX_LOCAL_CACHE_BYTES = 8 * 1024 * 1024
const MAX_LOCAL_CACHE_ENTRY_BYTES = 2 * 1024 * 1024
const CACHEABLE_TABLES = new Set([
  // Faction ranking snapshots receive at most one immutable row set per
  // reporting day and are written only after directory completion.
  "faction_company_rank_snapshots",
])
const localCache = new Map<string, CacheEntry>()
let localCacheBytes = 0
const localReadiness = new Map<string, { ready: boolean; expiresAt: number }>()
const databaseWrappers = new WeakMap<object, Map<string, DailyCacheDatabase>>()
const rawStatements = new WeakMap<object, DailyCacheStatement>()

function reportingDayStartMs(day: string): number {
  return Date.parse(day + "T18:00:00.000Z")
}

/** The portal's reporting date rolls over at 18:00 UTC, not midnight. */
export function dailyReportingDay(timestamp = Date.now()): string {
  return new Date(timestamp - REPORTING_OFFSET_MS).toISOString().slice(0, 10)
}

/** Number of whole seconds remaining before the next 18:00 UTC reporting boundary. */
export function dailyCacheTtlSeconds(timestamp = Date.now()): number {
  const day = dailyReportingDay(timestamp)
  const nextBoundary = reportingDayStartMs(day) + DAY_MS
  return Math.max(0, Math.ceil((nextBoundary - timestamp) / 1000))
}

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ").trim()
}

/**
 * Return the immutable snapshot tables referenced by a SELECT, or null when
 * the statement reads anything dynamic/unknown. This deliberately fails closed.
 */
export function cacheableDailySnapshotTables(sql: string): string[] | null {
  const withoutComments = stripSqlComments(sql)
  if (!/^(?:SELECT|WITH)\b/i.test(withoutComments)) return null
  const singleStatement = withoutComments.replace(/;\s*$/, "")
  if (singleStatement.includes(";")) return null
  // Fail closed on legacy comma-join syntax; every source must pass the table allowlist.
  if (/\bFROM\s+(?:[A-Za-z_][A-Za-z0-9_$]*\s*\.\s*)?(?:[A-Za-z_][A-Za-z0-9_$]*|"[^"]+"|`[^`]+`|\[[^\]]+\])(?:\s+(?:AS\s+)?[A-Za-z_][A-Za-z0-9_$]*)?\s*,\s*(?:[A-Za-z_][A-Za-z0-9_$]*|"[^"]+"|`[^`]+`|\[[^\]]+\])/i.test(singleStatement)) return null

  // DML hidden in a WITH clause and volatile SQL functions are never cached.
  if (/\b(?:DATE|TIME|DATETIME|JULIANDAY|STRFTIME|UNIXEPOCH)\s*\([^)]*['"]now['"]/i.test(singleStatement)) return null
  const scanSql = singleStatement.replace(/'(?:''|[^'])*'/g, "''")
  if (/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|PRAGMA|ATTACH|DETACH|VACUUM)\b/i.test(scanSql)) return null
  if (/\b(?:RANDOM|RANDOMBLOB)\s*\(|\bCURRENT_(?:TIMESTAMP|DATE|TIME)\b/i.test(scanSql)) return null

  const cteNames = new Set<string>()
  for (const match of scanSql.matchAll(/(?:\bWITH\s+(?:RECURSIVE\s+)?|,\s*)([A-Za-z_][A-Za-z0-9_]*)\s+AS\s*\(/gi)) {
    cteNames.add(match[1].toLowerCase())
  }

  const tables = new Set<string>()
  const tablePattern = /\b(?:FROM|JOIN)\s+(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_$]*(?:\s*\.\s*[A-Za-z_][A-Za-z0-9_$]*)?))/gi
  for (const match of scanSql.matchAll(tablePattern)) {
    const rawName = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? "").replace(/\s+/g, "")
    const table = rawName.split(".").at(-1)?.toLowerCase() ?? ""
    if (!table || cteNames.has(table)) continue
    if (!CACHEABLE_TABLES.has(table)) return null
    tables.add(table)
  }
  if (!tables.size) return null



  return [...tables].sort()
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function forget(key: string): void {
  const entry = localCache.get(key)
  if (!entry) return
  localCache.delete(key)
  localCacheBytes = Math.max(0, localCacheBytes - entry.bytes)
}

function remember(key: string, serialized: string, expiresAt: number): void {
  const bytes = new TextEncoder().encode(serialized).byteLength
  if (bytes > MAX_LOCAL_CACHE_ENTRY_BYTES) return
  forget(key)
  localCache.set(key, { serialized, expiresAt, bytes })
  localCacheBytes += bytes
  while (localCache.size > MAX_LOCAL_CACHE_ENTRIES || localCacheBytes > MAX_LOCAL_CACHE_BYTES) {
    const oldest = localCache.keys().next().value
    if (typeof oldest !== "string") break
    forget(oldest)
  }
}

async function isDailyCaptureReady(
  db: DailyCacheDatabase,
  namespace: string,
  reportingDay: string,
  tables: string[],
  now: number,
  kv?: DailyReadCacheKV,
): Promise<boolean> {
  const ttlSeconds = dailyCacheTtlSeconds(now)
  if (ttlSeconds <= 0) return false
  const readinessScope = tables.join("+")
  const memoryKey = namespace + ":" + reportingDay + ":" + readinessScope
  const known = localReadiness.get(memoryKey)
  if (known && known.expiresAt > now) return known.ready
  if (known) localReadiness.delete(memoryKey)

  const readyKey = CACHE_VERSION + "/" + namespace + "/" + reportingDay + "/ready/" + readinessScope
  if (kv && ttlSeconds >= 60) {
    try {
      // KV caches reads at each Cloudflare location for at least 30 seconds.
      // A short cache TTL keeps the one-time readiness marker responsive while
      // avoiding repeated D1 probes from newly scaled Worker isolates.
      if ((await kv.get(readyKey, { cacheTtl: 30 })) === "ready") {
        localReadiness.set(memoryKey, { ready: true, expiresAt: reportingDayStartMs(reportingDay) + DAY_MS })
        return true
      }
    } catch {
      // KV is an optimization, never a dependency for correct D1 reads.
    }
  }

  const start = new Date(reportingDayStartMs(reportingDay)).toISOString()
  const end = new Date(reportingDayStartMs(reportingDay) + DAY_MS).toISOString()
  let ready = true
  try {
    for (const table of tables) {
      if (table === "faction_company_rank_snapshots") {
        // This table is written only after the full faction directory has been
        // validated and ranked. A pending/partial directory has no lock-in row.
        const completed = await db.prepare(
          "SELECT 1 AS ready FROM faction_company_rank_snapshots WHERE reporting_day = ? AND faction_id = '8317' LIMIT 1",
        ).bind(reportingDay).first<{ ready: number }>()
        if (!completed?.ready) { ready = false; break }
      } else {
        ready = false
        break
      }
    }
  } catch {
    // An absent schema or temporarily unavailable D1 must never enable caching.
    ready = false
  }

  if (ready) {
    const expiresAt = reportingDayStartMs(reportingDay) + DAY_MS
    localReadiness.set(memoryKey, { ready: true, expiresAt })
    if (kv && ttlSeconds >= 60) {
      try {
        await kv.put(readyKey, "ready", { expiration: Math.floor(expiresAt / 1000) })
      } catch {
        // The isolate-local readiness marker still provides a safe fallback.
      }
    }
    return true
  }

  // Faction directory validation can take several minutes. Keep
  // this negative result for one minute to avoid probing D1 on every request.
  localReadiness.set(memoryKey, { ready: false, expiresAt: now + 60_000 })
  return false
}

async function readCachedValue<T>(key: string, now: number, kv?: DailyReadCacheKV): Promise<T | undefined> {
  const memoryEntry = localCache.get(key)
  if (memoryEntry && memoryEntry.expiresAt > now) {
    localCache.delete(key)
    localCache.set(key, memoryEntry)
    try { return JSON.parse(memoryEntry.serialized) as T } catch { forget(key) }
  } else if (memoryEntry) {
    forget(key)
  }

  if (!kv) return undefined
  try {
    const serialized = await kv.get(key, { cacheTtl: 30 })
    if (!serialized) return undefined
    const value = JSON.parse(serialized) as T
    remember(key, serialized, now + Math.max(1, dailyCacheTtlSeconds(now)) * 1000)
    return value
  } catch {
    return undefined
  }
}

async function storeCachedValue(key: string, value: unknown, now: number, ttlSeconds: number, kv?: DailyReadCacheKV): Promise<void> {
  let serialized: string | undefined
  try { serialized = JSON.stringify(value) } catch { return }
  if (typeof serialized !== "string" || !serialized || serialized === "undefined") return
  remember(key, serialized, now + ttlSeconds * 1000)
  if (!kv || ttlSeconds < 60) return
  try {
    const expiresAt = Math.floor((now + ttlSeconds * 1000) / 1000)
    await kv.put(key, serialized, { expiration: expiresAt })
  } catch {
    // D1 remains the source of truth; KV write failures are intentionally ignored.
  }
}

/**
 * Add a local + globally distributed Workers KV read-through cache for locked snapshots.
 * Each table is cached only after its own current-reporting-day lock-in is complete.
 */
export function withDailySnapshotReadCache<T extends DailyCacheDatabase>(
  db: T,
  namespaceValue?: string,
  kv?: DailyReadCacheKV,
): T {
  const namespace = namespaceValue?.trim()
  if (!namespace) return db
  const existingByNamespace = databaseWrappers.get(db as object)
  const existing = existingByNamespace?.get(namespace)
  if (existing) return existing as T

  const wrapStatement = (raw: DailyCacheStatement, sql: string, bindings: D1Value[] = []): DailyCacheStatement => {
    const wrapper: DailyCacheStatement = {
      bind(...values: D1Value[]) {
        return wrapStatement(raw.bind(...values), sql, values)
      },
      async first<R = Record<string, unknown>>(): Promise<R | null> {
        const tables = cacheableDailySnapshotTables(sql)
        if (!tables) return raw.first<R>()
        const now = Date.now()
        const reportingDay = dailyReportingDay(now)
        const ttl = dailyCacheTtlSeconds(now)
        if (ttl < 60 || !(await isDailyCaptureReady(db, namespace, reportingDay, tables, now, kv))) return raw.first<R>()
        const fingerprint = await digest(JSON.stringify({ version: CACHE_VERSION, namespace, reportingDay, kind: "first", sql, bindings, tables }) ?? "")
        const key = CACHE_VERSION + "/" + namespace + "/" + reportingDay + "/first/" + fingerprint
        const cached = await readCachedValue<R | null>(key, now, kv)
        if (cached !== undefined && cached !== null) return cached
        const value = await raw.first<R>()
        if (value !== null && ttl >= 60) await storeCachedValue(key, value, now, ttl, kv)
        return value
      },
      async all<R = Record<string, unknown>>(): Promise<{ results?: R[]; success?: boolean; meta?: { changes?: number } }> {
        const tables = cacheableDailySnapshotTables(sql)
        if (!tables) return raw.all<R>()
        const now = Date.now()
        const reportingDay = dailyReportingDay(now)
        const ttl = dailyCacheTtlSeconds(now)
        if (ttl < 60 || !(await isDailyCaptureReady(db, namespace, reportingDay, tables, now, kv))) return raw.all<R>()
        const fingerprint = await digest(JSON.stringify({ version: CACHE_VERSION, namespace, reportingDay, kind: "all", sql, bindings, tables }) ?? "")
        const key = CACHE_VERSION + "/" + namespace + "/" + reportingDay + "/all/" + fingerprint
        const cached = await readCachedValue<{ results?: R[] }>(key, now, kv)
        if (cached && Array.isArray(cached.results) && cached.results.length > 0) {
          // Do not replay the original D1 meta.rows_read/duration on a cache hit.
          return { results: cached.results, success: true }
        }
        const result = await raw.all<R>()
        // Empty result sets are deliberately not cached: late first-time data or
        // a completed retry can make an initially empty report available later.
        if (Array.isArray(result.results) && result.results.length > 0 && ttl >= 60) {
          await storeCachedValue(key, { results: result.results }, now, ttl, kv)
        }
        return result
      },
      run: () => raw.run(),
    }
    rawStatements.set(wrapper, raw)
    return wrapper
  }

  const wrapped: DailyCacheDatabase = {
    prepare(sql: string) {
      return wrapStatement(db.prepare(sql), sql)
    },
    ...(db.batch ? {
      batch(statements: DailyCacheStatement[]) {
        const raw = statements.map((statement) => rawStatements.get(statement as object) ?? statement)
        return db.batch!(raw)
      },
    } : {}),
  }

  const wrappers = existingByNamespace ?? new Map<string, DailyCacheDatabase>()
  wrappers.set(namespace, wrapped)
  databaseWrappers.set(db as object, wrappers)
  return wrapped as T
}
