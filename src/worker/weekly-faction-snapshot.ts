export type WeeklyFactionDirectoryRefreshResult = {
  complete: boolean
  memberCount: number
  pending: number
  invalidMemberCount: number
  failedMemberCount?: number
}

export async function refreshThenCaptureWeeklyFactionSnapshot<T extends WeeklyFactionDirectoryRefreshResult>(
  refreshDirectory: () => Promise<T>,
  captureCounts: () => Promise<void>,
): Promise<T> {
  const result = await refreshDirectory()
  const failed = Number(result.failedMemberCount ?? 0)
  if (!result.complete || result.memberCount <= 0 || result.pending !== 0 ||
      result.invalidMemberCount !== 0 || failed !== 0) {
    throw new Error(
      `Weekly faction star-count capture skipped: director refresh incomplete (members=${result.memberCount}, pending=${result.pending}, invalid=${result.invalidMemberCount}, failed=${failed}).`,
    )
  }
  await captureCounts()
  return result
}

/** A Monday 00:10 UTC capture belongs to the Sunday TCT reporting week. */
export function weeklyFactionReportingDay(capturedAt: string | number | Date): string {
  const captured = new Date(capturedAt)
  if (!Number.isFinite(captured.getTime())) throw new Error("Weekly faction capture timestamp is invalid.")
  captured.setUTCDate(captured.getUTCDate() - 1)
  return captured.toISOString().slice(0, 10)
}
