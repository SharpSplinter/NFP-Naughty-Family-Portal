/**
 * Convert Torn gym API modifier values into the displayed dot scale.
 *
 * Current API v2 returns a fractional multiplier (for example 0.729).
 * The calculator's gain formula expects displayed dots (7.29) and divides
 * by ten when applying the gym multiplier. Older payloads may use values
 * already expressed as dots or legacy dot-times-ten integers.
 */
export function normalizeTornGymDotValue(raw) {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  if (raw <= 1) return raw * 10;
  if (raw > 10) return raw / 10;
  return raw;
}
