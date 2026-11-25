export type GlobalStarIncomeBufferInput = { companyTypeId: number; companyType: string; starRating: number | null; weeklyIncome: number | null }
export type GlobalStarIncomeBuffer = {
  companyTypeId: number
  companyType: string
  starRating: number
  minWeeklyIncome: number
  maxWeeklyIncome: number
  thirdLowestWeeklyIncome: number | null
  companyCount: number
}
export type GlobalStarIncomeBufferPage = GlobalStarIncomeBuffer & { lowestWeeklyIncomes: number[] }
export type StarIncomeProgress = {
  nextStarRating: number | null
  nextStarIncome: number | null
  nextStarGap: number | null
  nextStarCompanyCount: number | null
  previousStarRating: number | null
  previousStarIncome: number | null
  previousStarGap: number | null
  previousStarCompanyCount: number | null
}

function updateLowestThree(values: readonly number[], income: number): number[] {
  return [...values, income].sort((a, b) => a - b).slice(0, 3)
}

function thirdLowest(values: readonly number[]): number | null {
  return values.length >= 3 ? values[2] : null
}

/**
 * Build page-local aggregates for weekly global star-income benchmarks.
 * Zero-income companies remain eligible at 0 stars, but are excluded at
 * every higher star level. Keep the three lowest values so page aggregates
 * can be merged without losing the true third-lowest value across pages.
 */
export function buildGlobalStarIncomeBuffers(rows: readonly GlobalStarIncomeBufferInput[]): GlobalStarIncomeBufferPage[] {
  const grouped = new Map<string, GlobalStarIncomeBufferPage>()
  for (const row of rows) {
    if (!Number.isFinite(row.companyTypeId) || row.companyTypeId <= 0 || row.starRating === null ||
      !Number.isFinite(row.starRating) || row.starRating < 0 || row.weeklyIncome === null ||
      !Number.isFinite(row.weeklyIncome)) continue
    if (row.starRating !== 0 && row.weeklyIncome === 0) continue

    const key = row.companyTypeId + ":" + row.starRating
    const current = grouped.get(key)
    if (current) {
      current.minWeeklyIncome = Math.min(current.minWeeklyIncome, row.weeklyIncome)
      current.maxWeeklyIncome = Math.max(current.maxWeeklyIncome, row.weeklyIncome)
      current.companyCount += 1
      current.lowestWeeklyIncomes = updateLowestThree(current.lowestWeeklyIncomes, row.weeklyIncome)
      current.thirdLowestWeeklyIncome = thirdLowest(current.lowestWeeklyIncomes)
    } else {
      const lowestWeeklyIncomes = [row.weeklyIncome]
      grouped.set(key, {
        companyTypeId: row.companyTypeId,
        companyType: row.companyType.trim() || "Unknown",
        starRating: row.starRating,
        minWeeklyIncome: row.weeklyIncome,
        maxWeeklyIncome: row.weeklyIncome,
        thirdLowestWeeklyIncome: null,
        companyCount: 1,
        lowestWeeklyIncomes,
      })
    }
  }
  return Array.from(grouped.values()).sort((a, b) => a.companyTypeId - b.companyTypeId || a.starRating - b.starRating)
}

/** Merge page-local aggregates while retaining the globally lowest three eligible incomes. */
export function mergeGlobalStarIncomeBuffers(groups: readonly (readonly GlobalStarIncomeBufferPage[])[]): GlobalStarIncomeBufferPage[] {
  const merged = new Map<string, GlobalStarIncomeBufferPage>()
  for (const group of groups) for (const row of group) {
    const lowest = row.lowestWeeklyIncomes
    if (!Number.isFinite(row.companyTypeId) || row.companyTypeId <= 0 || !Number.isFinite(row.starRating) ||
      !Number.isFinite(row.minWeeklyIncome) || !Number.isFinite(row.maxWeeklyIncome) ||
      !Number.isInteger(row.companyCount) || row.companyCount <= 0 || row.minWeeklyIncome > row.maxWeeklyIncome ||
      !Array.isArray(lowest) || lowest.length !== Math.min(3, row.companyCount) ||
      lowest.some((value, index) => !Number.isFinite(value) || (index > 0 && value < lowest[index - 1])) ||
      row.thirdLowestWeeklyIncome !== thirdLowest(lowest)) continue

    const key = row.companyTypeId + ":" + row.starRating
    const current = merged.get(key)
    if (current) {
      current.minWeeklyIncome = Math.min(current.minWeeklyIncome, row.minWeeklyIncome)
      current.maxWeeklyIncome = Math.max(current.maxWeeklyIncome, row.maxWeeklyIncome)
      current.companyCount += row.companyCount
      current.lowestWeeklyIncomes = [...current.lowestWeeklyIncomes, ...lowest].sort((a, b) => a - b).slice(0, 3)
      current.thirdLowestWeeklyIncome = thirdLowest(current.lowestWeeklyIncomes)
    } else {
      merged.set(key, { ...row, lowestWeeklyIncomes: [...lowest] })
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.companyTypeId - b.companyTypeId || a.starRating - b.starRating)
}

export function resolveStarIncomeProgress(buffers: readonly GlobalStarIncomeBuffer[], companyTypeId: number | string | null | undefined, companyType: string | null | undefined, starRating: number | null | undefined, weeklyIncome: number | null | undefined): StarIncomeProgress {
  const id = companyTypeId == null ? null : Number(companyTypeId)
  const name = (companyType ?? "").trim().toLocaleLowerCase()
  const matching = buffers.filter(row => id !== null && Number.isFinite(id) && id > 0
    ? row.companyTypeId === id
    : name !== "" && row.companyType.trim().toLocaleLowerCase() === name)
  if (starRating == null || !Number.isFinite(starRating)) return {
    nextStarRating: null, nextStarIncome: null, nextStarGap: null, nextStarCompanyCount: null,
    previousStarRating: null, previousStarIncome: null, previousStarGap: null, previousStarCompanyCount: null,
  }
  const next = matching.filter(row => row.starRating > starRating).sort((a, b) => a.starRating - b.starRating)[0] ?? null
  const previous = matching.filter(row => row.starRating < starRating).sort((a, b) => b.starRating - a.starRating)[0] ?? null
  const income = typeof weeklyIncome === "number" && Number.isFinite(weeklyIncome) ? weeklyIncome : null
  const nextIncome = next?.thirdLowestWeeklyIncome ?? null
  const previousIncome = previous?.thirdLowestWeeklyIncome ?? null
  return {
    nextStarRating: next?.starRating ?? null,
    nextStarIncome: nextIncome,
    nextStarGap: next && income !== null && nextIncome !== null ? Math.max(0, nextIncome - income) : null,
    nextStarCompanyCount: next?.companyCount ?? null,
    previousStarRating: previous?.starRating ?? null,
    previousStarIncome: previousIncome,
    previousStarGap: previous && income !== null && previousIncome !== null ? Math.max(0, income - previousIncome) : null,
    previousStarCompanyCount: previous?.companyCount ?? null,
  }
}


/** The weekly global benchmark is valid only for the Monday 00:10 UTC cron. */
export function isExpectedWeeklyStarIncomeSchedule(timestamp: string): boolean {
  const date = new Date(timestamp)
  return Number.isFinite(date.getTime()) && date.getUTCDay() === 1 && date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 10 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0
}


/** The Monday 00:10 UTC cron was introduced on 2026-11-25; earlier captures belong to the prior Sunday 18:10 UTC schedule. */
export function isBeforeWeeklyStarIncomeScheduleChange(timestamp: string): boolean {
  const date = new Date(timestamp)
  return Number.isFinite(date.getTime()) && date.getTime() < Date.parse("2026-11-25T02:38:34.909074Z")
}
