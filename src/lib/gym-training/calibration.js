import { estimateEnergyEquivalentGain } from "./gains.js";

const HAPPY_CAP = 99_999;
const CALIBRATION_MODEL_VERSION = "gym-gain-v1";
const VALID_STATS = new Set(["strength", "defense", "speed", "dexterity"]);

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Replays a logged Torn training session using the same sequential model as the
 * calculator. When Torn supplies happy_used, its observed average loss per
 * train is used to isolate the gain-model residual from random happy loss.
 */
export function estimateLoggedGymGain({
  statKey,
  stat,
  happy,
  trains,
  energyPerTrain,
  dots,
  modifier,
  happyLossPerTrain,
}) {
  if (!VALID_STATS.has(statKey) || !finite(stat) || !finite(happy)
    || !Number.isInteger(trains) || trains < 1 || trains > 20_000
    || !finite(energyPerTrain) || energyPerTrain <= 0
    || !finite(dots) || dots <= 0 || dots > 10
    || !finite(modifier) || modifier <= 0
    || !finite(happyLossPerTrain) || happyLossPerTrain < 0) return null;

  let currentStat = Math.max(0, stat);
  let currentHappy = Math.min(HAPPY_CAP, Math.max(0, happy));
  let totalGain = 0;

  for (let index = 0; index < trains; index += 1) {
    const gain = estimateEnergyEquivalentGain(
      statKey,
      currentStat,
      currentHappy,
      energyPerTrain,
      dots,
      modifier,
    );
    currentStat += gain;
    totalGain += gain;
    currentHappy = Math.max(0, currentHappy - happyLossPerTrain);
  }

  return Number.isFinite(totalGain) && totalGain > 0 ? totalGain : null;
}

/**
 * Creates a player calibration sample only from a complete Torn gym log.
 * The caller must supply the pre-session happiness observed by the player.
 */
export function createGymGainCalibrationSample({
  logId,
  timestamp,
  log,
  startingHappy,
  gymId,
  dots,
  modifier,
  energyPerTrain,
  happyLossRate = 0.5,
}) {
  if (typeof logId !== "string" || !logId.trim()) {
    return { ok: false, error: "The selected record has no Torn log ID." };
  }
  if (!log || typeof log !== "object" || !VALID_STATS.has(log.stat)) {
    return { ok: false, error: "Select a verified Torn gym-training log." };
  }
  if (!finite(timestamp) || !finite(startingHappy)
    || startingHappy < 0 || startingHappy > HAPPY_CAP) {
    return { ok: false, error: "Enter the happiness value from immediately before this training session." };
  }
  if (log.gym === null || log.gym === undefined || String(log.gym) !== String(gymId)) {
    return { ok: false, error: "The log's gym does not match the selected gym." };
  }
  if (!finite(log.energy) || !Number.isInteger(log.trains) || log.trains < 1
    || !finite(log.gain) || log.gain <= 0
    || !finite(log.statBefore) || !finite(log.statAfter)) {
    return { ok: false, error: "The Torn log is missing its energy, train count, gain, or before/after stat values." };
  }
  const expectedEnergy = log.trains * energyPerTrain;
  if (!finite(expectedEnergy) || Math.abs(log.energy - expectedEnergy) > Math.max(0.01, expectedEnergy * 1e-7)) {
    return { ok: false, error: "The log's energy per train does not match the selected gym." };
  }
  const recordedDelta = log.statAfter - log.statBefore;
  if (Math.abs(recordedDelta - log.gain) > Math.max(0.1, Math.abs(log.gain) * 1e-7)) {
    return { ok: false, error: "The Torn log's recorded gain does not reconcile with its before/after stats." };
  }

  const observedHappyLoss = finite(log.happyUsed) && log.happyUsed >= 0
    ? log.happyUsed / log.trains
    : energyPerTrain * Math.min(1, Math.max(0, happyLossRate));
  const expectedGain = estimateLoggedGymGain({
    statKey: log.stat,
    stat: log.statBefore,
    happy: startingHappy,
    trains: log.trains,
    energyPerTrain,
    dots,
    modifier,
    happyLossPerTrain: observedHappyLoss,
  });
  if (!finite(expectedGain) || expectedGain <= 0) {
    return { ok: false, error: "The calculator could not reproduce a valid estimate for this log." };
  }

  const correctionFactor = log.gain / expectedGain;
  if (!finite(correctionFactor) || correctionFactor < 0.9 || correctionFactor > 1.1) {
    return { ok: false, error: "This log differs too much from the current model to use safely as a calibration sample." };
  }

  return {
    ok: true,
    sample: {
      modelVersion: CALIBRATION_MODEL_VERSION,
      logId,
      timestamp,
      stat: log.stat,
      gymId: String(gymId),
      dots,
      modifier,
      startingHappy,
      energyUsed: log.energy,
      trains: log.trains,
      happyUsed: finite(log.happyUsed) ? log.happyUsed : null,
      actualGain: log.gain,
      expectedGain,
      correctionFactor,
    },
  };
}

/**
 * Returns a robust median correction only for samples matching the current
 * gym, dots, and live perk multiplier. Other contexts remain uncalibrated.
 */
export function getGymGainCalibrationSummary(samples, { gymId, dots, modifier }) {
  const matching = (Array.isArray(samples) ? samples : []).filter(sample =>
    sample
    && sample.modelVersion === CALIBRATION_MODEL_VERSION
    && String(sample.gymId) === String(gymId)
    && finite(sample.dots) && Math.abs(sample.dots - dots) <= 0.0001
    && finite(sample.modifier)
    && Math.abs(sample.modifier - modifier) <= Math.max(0.00001, Math.abs(modifier) * 0.00001)
    && finite(sample.correctionFactor)
    && sample.correctionFactor >= 0.9 && sample.correctionFactor <= 1.1
  );

  if (!matching.length) return { factor: 1, sampleCount: 0 };
  const factors = matching.map(sample => sample.correctionFactor).sort((a, b) => a - b);
  const middle = Math.floor(factors.length / 2);
  const factor = factors.length % 2
    ? factors[middle]
    : (factors[middle - 1] + factors[middle]) / 2;
  return { factor, sampleCount: matching.length };
}
