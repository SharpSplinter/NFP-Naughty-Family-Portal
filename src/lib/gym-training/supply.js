const WEEKLY_MCS_STOCK_ENERGY = 100;

function nonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Calculate a daily energy-supply scenario without depending on current Energy.
 * This keeps forecasts useful when the live Torn Energy bar is at zero.
 */
export function calculateDailyTrainingSupply({
  naturalEnergyPerDay,
  xanaxPerDay,
  fhcPerDay,
  refillEnergyPerFhc,
  cansPerDay,
  energyPerCan,
  canEnergyMultiplier = 1,
  refillsPerDay = 0,
  energyPerRefill = 0,
  mcsBlocks = 0,
}) {
  const naturalEnergy = nonNegative(naturalEnergyPerDay);
  const xanaxEnergy = nonNegative(xanaxPerDay) * 250;
  const fhcEnergy = nonNegative(fhcPerDay) * nonNegative(refillEnergyPerFhc);
  const canEnergy = nonNegative(cansPerDay)
    * nonNegative(energyPerCan)
    * Math.max(0, Number.isFinite(canEnergyMultiplier) ? canEnergyMultiplier : 1);
  const pointRefillEnergy = nonNegative(refillsPerDay) * nonNegative(energyPerRefill);
  const baseEnergyPerDay = naturalEnergy + xanaxEnergy + fhcEnergy + canEnergy + pointRefillEnergy;
  const weeklyMcsEnergy = Math.floor(nonNegative(mcsBlocks)) * WEEKLY_MCS_STOCK_ENERGY;

  return {
    naturalEnergy,
    xanaxEnergy,
    fhcEnergy,
    canEnergy,
    pointRefillEnergy,
    baseEnergyPerDay,
    weeklyMcsEnergy,
    averageMcsEnergyPerDay: weeklyMcsEnergy / 7,
    averageDailyEnergy: baseEnergyPerDay + weeklyMcsEnergy / 7,
  };
}

/**
 * Add every held MCS benefit block's 100E payout every seven projected days.
 * The daily average is for display only; this function preserves payout timing.
 */
export function getWeeklyStockEnergyBonus(dayIndex, mcsBlocks) {
  const blocks = Math.floor(nonNegative(mcsBlocks));
  if (!blocks || !Number.isInteger(dayIndex) || dayIndex < 0) return 0;
  return (dayIndex + 1) % 7 === 0 ? blocks * WEEKLY_MCS_STOCK_ENERGY : 0;
}

export { WEEKLY_MCS_STOCK_ENERGY };
