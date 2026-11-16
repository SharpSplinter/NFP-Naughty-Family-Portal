function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!/^-?\\d+(?:\\.\\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Read the measurements directly from a stored Torn User → Log record.
 * Torn uses stat-specific keys (for example dexterity_before) inside data.
 *
 * @param {{ title: string, record?: Record<string, unknown> | null }} log
 * @returns {{ title: string, stat: "strength" | "defense" | "speed" | "dexterity" | null, energy: number | null, gain: number | null, statBefore: number | null, statAfter: number | null, happyUsed: number | null, gym: number | null, trains: number | null }}
 */
export function parseGymHistoryLog(log) {
  const record = isRecord(log.record) ? log.record : {};
  const fields = new Map();
  const collectFields = (value, depth = 0) => {
    if (!isRecord(value) || depth > 4) return;
    for (const [key, nested] of Object.entries(value)) {
      const normalized = normalizeKey(key);
      const values = fields.get(normalized) || [];
      values.push(nested);
      fields.set(normalized, values);
      if (isRecord(nested)) collectFields(nested, depth + 1);
    }
  };
  collectFields(record);

  const readNumber = (...keys) => {
    for (const key of keys) {
      for (const value of fields.get(normalizeKey(key)) || []) {
        const parsed = parseNumber(value);
        if (parsed !== null) return parsed;
      }
    }
    return null;
  };
  const readString = (...keys) => {
    for (const key of keys) {
      for (const value of fields.get(normalizeKey(key)) || []) {
        if (typeof value === "string" && value.trim()) return value.trim();
      }
    }
    return null;
  };
  const statFromValue = value => {
    if (!value) return null;
    const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
    if (["strength", "str"].includes(normalized)) return "strength";
    if (["defense", "def"].includes(normalized)) return "defense";
    if (["speed", "spd"].includes(normalized)) return "speed";
    if (["dexterity", "dex"].includes(normalized)) return "dexterity";
    return null;
  };

  const title = readString("title") || log.title || "Gym training";
  const textParts = [
    readString("description"), readString("text"), readString("message"),
    readString("result"), title, log.title,
  ].filter(value => typeof value === "string" && value.trim());
  const resultText = textParts.join(" ");
  const trainingText = resultText.match(/(?:gym\\s+)?train(?:ing)?\\s+(?:your\\s+)?(strength|defense|speed|dexterity)/i);
  const shortText = resultText.match(/you\\s+(?:have\\s+)?gained\\s+([\\d,]+(?:\\.\\d+)?)\\s+(strength|defense|speed|dexterity)/i);
  const fullText = resultText.match(/(?:increasing|increased)\\s+it\\s+by\\s+([\\d,]+(?:\\.\\d+)?)\\s+to\\s+([\\d,]+(?:\\.\\d+)?)/i);

  const statKeys = ["strength", "defense", "speed", "dexterity"];
  const keyedStat = statKeys.find(key =>
    fields.has(key + "before") || fields.has(key + "after") || fields.has(key + "increased")
  );
  const stat = statFromValue(readString("stat", "statName", "battleStat", "targetStat", "trainedStat", "attribute"))
    || statFromValue(trainingText?.[1] || shortText?.[2] || null)
    || keyedStat
    || null;

  let gain = readNumber(
    ...(stat ? [stat + "Increased", stat + "Increase", stat + "Gain"] : []),
    "gain", "statGain", "gained", "increase", "increasedBy", "amountGained",
    "statIncrease", "increaseAmount", "gainAmount", "delta", "statDelta"
  ) ?? parseNumber(fullText?.[1]) ?? parseNumber(shortText?.[1]);
  let statAfter = readNumber(
    ...(stat ? [stat + "After"] : []),
    "statAfter", "afterStat", "newStat", "resultingStat", "totalAfter",
    "newValue", "currentValue", "resultValue", "finalStat"
  ) ?? parseNumber(fullText?.[2]);
  let statBefore = readNumber(
    ...(stat ? [stat + "Before"] : []),
    "statBefore", "beforeStat", "previousStat", "oldStat", "priorStat",
    "startingStat", "initialStat"
  );

  if (statAfter !== null && gain !== null && statBefore === null) statBefore = statAfter - gain;
  if (statBefore !== null && gain !== null && statAfter === null) statAfter = statBefore + gain;
  if (statBefore !== null && statAfter !== null && gain === null) gain = statAfter - statBefore;

  return {
    title,
    stat,
    energy: readNumber("energyUsed", "energySpent", "energy", "amountEnergy", "amount"),
    gain,
    statBefore,
    statAfter,
    happyUsed: readNumber("happyUsed", "happinessUsed"),
    gym: readNumber("gym", "gymId"),
    trains: readNumber("trains", "trainCount"),
  };
}
