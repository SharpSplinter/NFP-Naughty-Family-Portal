export type TornUserLogRecord = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Identify gym-training activity in a Torn User → Log record.
 *
 * Torn log text can evolve, so the classifier uses both the structured
 * category/title and the event's own data/params. It deliberately excludes
 * other gym-related events such as unlocking or changing gyms.
 */
export function isGymTrainingLog(value: unknown): value is TornUserLogRecord {
  if (!isRecord(value)) return false;
  const details = isRecord(value.details) ? value.details : {};
  const title = typeof details.title === "string" ? details.title.toLowerCase() : "";
  const category = typeof details.category === "string" ? details.category.toLowerCase() : "";
  const searchable = [
    title,
    category,
    JSON.stringify(value.data ?? {}),
    JSON.stringify(value.params ?? {}),
  ].join(" ").toLowerCase();

  const explicitGymTraining = /gym[\s_-]*training|training[\s_-]+in[\s_-]+the[\s_-]+gym|trained[\s_-]+in[\s_-]+the[\s_-]+gym/.test(searchable);
  if (explicitGymTraining) return true;

  const gymCategory = /\bgym\b/.test(category);
  const trainingSignal = /\b(train|training|trained|energy spent|energy used)\b/.test(title + " " + searchable);
  return gymCategory && trainingSignal;
}
