export type D1SqlValue = string | number | null

export type D1ReadMeta = {
  rows_read?: unknown
  rows_written?: unknown
  rowsRead?: unknown
  rowsWritten?: unknown
}

export type D1ReadResult<T = Record<string, unknown>> = {
  results?: T[]
  success?: boolean
  meta?: D1ReadMeta & { changes?: number }
}

export type D1PreparedStatement = {
  bind(...values: D1SqlValue[]): D1PreparedStatement
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1ReadResult<T>>
  run(): Promise<D1ReadResult>
  raw?<T = unknown>(): Promise<T[]>
}

export type D1Database = {
  prepare(sql: string): D1PreparedStatement
  batch?(statements: D1PreparedStatement[]): Promise<D1ReadResult[]>
  exec?(sql: string): Promise<unknown>
}

export type D1ReadEvent = {
  eventType: "fetch" | "queue" | "scheduled" | "test"
  requestId?: string
  method?: string
  route?: string
  queue?: string | null
  messageCount?: number
  cron?: string
  durationMs?: number
}

type MethodCounts = {
  first: number
  all: number
  run: number
  batch: number
  raw: number
  exec: number
}

function readMetric(meta: D1ReadMeta | undefined, snake: "rows_read" | "rows_written", camel: "rowsRead" | "rowsWritten"): number | null {
  const value = meta?.[snake] ?? meta?.[camel]
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function stripTrailingSemicolon(sql: string): string {
  return sql.trim().replace(/;\s*$/, "")
}

/**
 * D1PreparedStatement.first() returns only a row, not D1Result.meta. Execute
 * an equivalent outer-LIMIT query through all() so the exact D1 rows_read
 * counter is retained without fetching more than the first result row.
 */
export function buildFirstRowSql(sql: string): string {
  const statement = stripTrailingSemicolon(sql)
  if (!statement) throw new Error("Cannot meter an empty D1 statement.")
  return 'SELECT * FROM (' + statement + ') AS "__ncd_first_row" LIMIT 1'
}

export class D1RequestReadMeter {
  private rowsRead = 0
  private rowsWritten = 0
  private statementCount = 0
  private missingReadMetrics = 0
  private missingWriteMetrics = 0
  private failedStatements = 0
  private unsupportedOperations = 0
  private batchResultMismatches = 0
  private inFlight = 0
  private pendingBackgroundTasks = 0
  private backgroundTasks = 0
  private backgroundTaskFailures = 0
  private finished = false
  private emitted = false
  private event: D1ReadEvent | null = null
  private readonly startedAt = Date.now()
  private readonly methodCounts: MethodCounts = { first: 0, all: 0, run: 0, batch: 0, raw: 0, exec: 0 }
  private readonly rawStatements = new WeakMap<object, D1PreparedStatement>()

  constructor(private readonly logger: (entry: Record<string, unknown>) => void = (entry) => {
    console.info(JSON.stringify(entry))
  }) {}

  wrapDatabase<T extends object>(database: T): T {
    const rawDatabase = database as unknown as D1Database
    const meter = this
    const wrapped = new Proxy(rawDatabase, {
      get(target, property) {
        if (property === "prepare") {
          return (sql: string) => meter.wrapStatement(target, target.prepare(sql), sql, [])
        }
        if (property === "batch") {
          if (typeof target.batch !== "function") return undefined
          return (statements: D1PreparedStatement[]) => meter.executeBatch(target, statements)
        }
        if (property === "exec") {
          if (typeof target.exec !== "function") return undefined
          return (sql: string) => meter.executeExec(target, sql)
        }
        const value = Reflect.get(target as object, property, target)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    return wrapped as unknown as T
  }

  wrapWaitUntil<T extends { waitUntil(promise: Promise<unknown>): void }>(context: T): T {
    if (!context || typeof context.waitUntil !== "function") return context
    const originalWaitUntil = context.waitUntil.bind(context)
    const meter = this
    const wrapped = Object.create(Object.getPrototypeOf(context)) as T
    Object.assign(wrapped, context)
    wrapped.waitUntil = (promise: Promise<unknown>) => {
      meter.pendingBackgroundTasks += 1
      meter.backgroundTasks += 1
      const tracked = Promise.resolve(promise).then(
        (value) => {
          meter.pendingBackgroundTasks = Math.max(0, meter.pendingBackgroundTasks - 1)
          meter.maybeEmit()
          return value
        },
        (error: unknown) => {
          meter.backgroundTaskFailures += 1
          meter.pendingBackgroundTasks = Math.max(0, meter.pendingBackgroundTasks - 1)
          meter.maybeEmit()
          throw error
        },
      )
      try {
        originalWaitUntil(tracked)
      } catch (error) {
        meter.backgroundTaskFailures += 1
        meter.pendingBackgroundTasks = Math.max(0, meter.pendingBackgroundTasks - 1)
        meter.maybeEmit()
        throw error
      }
    }
    return wrapped
  }

  finish(event: D1ReadEvent): void {
    if (this.finished) return
    this.event = event
    this.finished = true
    this.maybeEmit()
  }

  private recordResult(result: D1ReadResult, method: keyof Pick<MethodCounts, "first" | "all" | "run" | "batch">): void {
    this.statementCount += 1
    this.methodCounts[method] += 1
    const read = readMetric(result?.meta, "rows_read", "rowsRead")
    const written = readMetric(result?.meta, "rows_written", "rowsWritten")
    if (read === null) this.missingReadMetrics += 1
    else this.rowsRead += read
    if (written === null) this.missingWriteMetrics += 1
    else this.rowsWritten += written
  }

  private async executeStatement<T>(
    method: "first" | "all" | "run" | "raw",
    operation: () => Promise<T>,
    record: (result: T) => void,
  ): Promise<T> {
    this.inFlight += 1
    this.methodCounts[method] += 0
    try {
      const result = await operation()
      record(result)
      return result
    } catch (error) {
      this.statementCount += 1
      this.methodCounts[method] += 1
      this.failedStatements += 1
      this.missingReadMetrics += 1
      throw error
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1)
      this.maybeEmit()
    }
  }

  private wrapStatement(database: D1Database, raw: D1PreparedStatement, sql: string, bindings: D1SqlValue[]): D1PreparedStatement {
    const meter = this
    const wrapped: D1PreparedStatement = {
      bind(...values: D1SqlValue[]) {
        return meter.wrapStatement(database, raw.bind(...values), sql, values)
      },
      async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
        const result = await meter.executeStatement("first", async () => {
          let statement = database.prepare(buildFirstRowSql(sql))
          if (bindings.length) statement = statement.bind(...bindings)
          return statement.all<T>()
        }, (value) => meter.recordResult(value, "first"))
        const row = result.results?.[0] ?? null
        if (row === null || columnName === undefined) return row as T | null
        if (typeof row !== "object" || !Object.prototype.hasOwnProperty.call(row, columnName)) {
          throw new Error("D1_ERROR: requested first() column was not present in the result.")
        }
        return (row as Record<string, unknown>)[columnName] as T
      },
      async all<T = Record<string, unknown>>(): Promise<D1ReadResult<T>> {
        return meter.executeStatement("all", () => raw.all<T>(), (value) => meter.recordResult(value, "all"))
      },
      async run(): Promise<D1ReadResult> {
        return meter.executeStatement("run", () => raw.run(), (value) => meter.recordResult(value, "run"))
      },
      ...(raw.raw ? {
        async raw<T = unknown>(): Promise<T[]> {
          return meter.executeStatement("raw", () => raw.raw!<T>(), () => {
            meter.statementCount += 1
            meter.methodCounts.raw += 1
            meter.unsupportedOperations += 1
            meter.missingReadMetrics += 1
          })
        },
      } : {}),
    }
    this.rawStatements.set(wrapped as object, raw)
    return wrapped
  }

  private async executeBatch(database: D1Database, statements: D1PreparedStatement[]): Promise<D1ReadResult[]> {
    const rawStatements = statements.map((statement) => this.rawStatements.get(statement as object) ?? statement)
    this.inFlight += 1
    try {
      if (!database.batch) throw new Error("D1 batch is unavailable on this binding.")
      const results = await database.batch(rawStatements)
      if (!Array.isArray(results) || results.length !== rawStatements.length) {
        this.batchResultMismatches += 1
        const observedCount = Array.isArray(results) ? results.length : 0
        const missingCount = Math.abs(rawStatements.length - observedCount)
        this.statementCount += missingCount
        this.missingReadMetrics += missingCount
      }
      if (Array.isArray(results)) {
        for (const result of results) this.recordResult(result, "batch")
      }
      return results
    } catch (error) {
      this.methodCounts.batch += 1
      this.statementCount += rawStatements.length
      this.failedStatements += rawStatements.length
      this.missingReadMetrics += rawStatements.length
      throw error
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1)
      this.maybeEmit()
    }
  }

  private async executeExec(database: D1Database, sql: string): Promise<unknown> {
    this.inFlight += 1
    this.methodCounts.exec += 1
    this.unsupportedOperations += 1
    try {
      if (!database.exec) throw new Error("D1 exec is unavailable on this binding.")
      return await database.exec(sql)
    } catch (error) {
      this.failedStatements += 1
      throw error
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1)
      this.maybeEmit()
    }
  }

  private maybeEmit(): void {
    if (!this.finished || this.emitted || this.inFlight > 0 || this.pendingBackgroundTasks > 0) return
    if (this.statementCount === 0 && this.unsupportedOperations === 0) {
      this.emitted = true
      return
    }
    this.emitted = true
    const event = this.event ?? { eventType: "test" as const }
    this.logger({
      event: "d1_read_accounting",
      version: 1,
      observedAt: new Date().toISOString(),
      ...event,
      accountingStatus: this.missingReadMetrics === 0 && this.unsupportedOperations === 0 && this.batchResultMismatches === 0
        ? "complete"
        : "incomplete",
      rowsRead: this.rowsRead,
      rowsWritten: this.rowsWritten,
      statementCount: this.statementCount,
      methodCounts: this.methodCounts,
      missingReadMetrics: this.missingReadMetrics,
      missingWriteMetrics: this.missingWriteMetrics,
      failedStatements: this.failedStatements,
      unsupportedOperations: this.unsupportedOperations,
      batchResultMismatches: this.batchResultMismatches,
      backgroundTasks: this.backgroundTasks,
      backgroundTaskFailures: this.backgroundTaskFailures,
      durationMs: Math.max(0, Date.now() - this.startedAt),
    })
  }
}
