const HAPPY_CAP = 99_999;
const GYM_GAIN_CONSTANTS = {
  strength: { a: 1600, b: 1700 },
  defense: { a: 2100, b: -600 },
  speed: { a: 1600, b: 2000 },
  dexterity: { a: 1800, b: 1500 },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function effectiveGymStat(stat) {
  const value = Math.max(0, stat);
  if (value <= 50_000_000) return value;
  return 50_000_000 + 0.057406 * Math.pow(value - 50_000_000, 0.928996);
}

export function estimateEnergyEquivalentGain(statKey, stat, happy, energy, dots, modifier) {
  const currentHappy = clamp(happy, 0, HAPPY_CAP);
  const constants = GYM_GAIN_CONSTANTS[statKey];
  if (!constants) return 0;
  const happyLog = Math.round(Math.log(1 + currentHappy / 250) * 10_000) / 10_000;
  const happyMultiplier = Math.round((1 + 0.07 * happyLog) * 10_000) / 10_000;
  const happyAdjustment = (1 - Math.pow(Math.min(currentHappy, 99_999) / 99_999, 2)) * constants.a;
  const expectedPerEnergy = (
    effectiveGymStat(stat) * happyMultiplier
    + 8 * Math.pow(currentHappy, 1.05)
    + happyAdjustment
    + constants.b
  ) / 200_000;
  // dots is already normalized to the gym's displayed 0–10 scale.
  // Do not divide it by ten again: that underestimates every gain tenfold.
  return Math.max(0, expectedPerEnergy * Math.max(0, dots) * Math.max(0, energy) * Math.max(0, modifier));
}
