export type GlobalStarIncomeBufferInput = { companyTypeId: number; companyType: string; starRating: number | null; weeklyIncome: number | null }
export type GlobalStarIncomeBuffer = { companyTypeId: number; companyType: string; starRating: number; minWeeklyIncome: number; maxWeeklyIncome: number; companyCount: number }
export type StarIncomeProgress = { nextStarRating: number | null; nextStarIncome: number | null; nextStarGap: number | null; previousStarRating: number | null; previousStarIncome: number | null; previousStarGap: number | null }

export function buildGlobalStarIncomeBuffers(rows: readonly GlobalStarIncomeBufferInput[]): GlobalStarIncomeBuffer[] {
  const grouped = new Map<string, GlobalStarIncomeBuffer>()
  for (const row of rows) {
    if (!Number.isFinite(row.companyTypeId) || row.companyTypeId <= 0 || row.starRating === null ||
      !Number.isFinite(row.starRating) || row.starRating < 0 || row.weeklyIncome === null || !Number.isFinite(row.weeklyIncome)) continue
    const key = row.companyTypeId + ":" + row.starRating
    const current = grouped.get(key)
    if (current) {
      current.minWeeklyIncome = Math.min(current.minWeeklyIncome, row.weeklyIncome)
      current.maxWeeklyIncome = Math.max(current.maxWeeklyIncome, row.weeklyIncome)
      current.companyCount += 1
    } else grouped.set(key, { companyTypeId: row.companyTypeId, companyType: row.companyType.trim() || "Unknown", starRating: row.starRating, minWeeklyIncome: row.weeklyIncome, maxWeeklyIncome: row.weeklyIncome, companyCount: 1 })
  }
  return Array.from(grouped.values()).sort((a, b) => a.companyTypeId - b.companyTypeId || a.starRating - b.starRating)
}

export function mergeGlobalStarIncomeBuffers(groups: readonly (readonly GlobalStarIncomeBuffer[])[]): GlobalStarIncomeBuffer[] {
  const merged = new Map<string, GlobalStarIncomeBuffer>()
  for (const group of groups) for (const row of group) {
    if (!Number.isFinite(row.companyTypeId) || row.companyTypeId <= 0 || !Number.isFinite(row.starRating) ||
      !Number.isFinite(row.minWeeklyIncome) || !Number.isFinite(row.maxWeeklyIncome) ||
      !Number.isInteger(row.companyCount) || row.companyCount <= 0 || row.minWeeklyIncome > row.maxWeeklyIncome) continue
    const key = row.companyTypeId + ":" + row.starRating, current = merged.get(key)
    if (current) {
      current.minWeeklyIncome = Math.min(current.minWeeklyIncome, row.minWeeklyIncome)
      current.maxWeeklyIncome = Math.max(current.maxWeeklyIncome, row.maxWeeklyIncome)
      current.companyCount += row.companyCount
    } else merged.set(key, { ...row })
  }
  return Array.from(merged.values()).sort((a, b) => a.companyTypeId - b.companyTypeId || a.starRating - b.starRating)
}

export function resolveStarIncomeProgress(buffers: readonly GlobalStarIncomeBuffer[], companyTypeId: number | string | null | undefined, companyType: string | null | undefined, starRating: number | null | undefined, weeklyIncome: number | null | undefined): StarIncomeProgress {
  const id = companyTypeId == null ? null : Number(companyTypeId)
  const name = (companyType ?? "").trim().toLocaleLowerCase()
  const matching = buffers.filter(row => id !== null && Number.isFinite(id) && id > 0
    ? row.companyTypeId === id
    : name !== "" && row.companyType.trim().toLocaleLowerCase() === name)
  if (starRating == null || !Number.isFinite(starRating)) return { nextStarRating: null, nextStarIncome: null, nextStarGap: null, previousStarRating: null, previousStarIncome: null, previousStarGap: null }
  const next = matching.filter(row => row.starRating > starRating).sort((a, b) => a.starRating - b.starRating)[0] ?? null
  const previous = matching.filter(row => row.starRating < starRating).sort((a, b) => b.starRating - a.starRating)[0] ?? null
  const income = typeof weeklyIncome === "number" && Number.isFinite(weeklyIncome) ? weeklyIncome : null
  return {
    nextStarRating: next?.starRating ?? null, nextStarIncome: next?.minWeeklyIncome ?? null,
    nextStarGap: next && income !== null ? Math.max(0, next.minWeeklyIncome - income) : null,
    previousStarRating: previous?.starRating ?? null, previousStarIncome: previous?.maxWeeklyIncome ?? null,
    previousStarGap: previous && income !== null ? Math.max(0, income - previous.maxWeeklyIncome) : null,
  }
}


/** The weekly global benchmark is valid only for the Monday 00:10 UTC cron. */
export function isExpectedWeeklyStarIncomeSchedule(timestamp: string): boolean {
  const date = new Date(timestamp)
  return Number.isFinite(date.getTime()) && date.getUTCDay() === 1 && date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 10 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0
}
