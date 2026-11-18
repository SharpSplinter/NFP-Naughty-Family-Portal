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
  mcsEnabled = false,
}) {
  const naturalEnergy = nonNegative(naturalEnergyPerDay);
  const xanaxEnergy = nonNegative(xanaxPerDay) * 250;
  const fhcEnergy = nonNegative(fhcPerDay) * nonNegative(refillEnergyPerFhc);
  const canEnergy = nonNegative(cansPerDay)
    * nonNegative(energyPerCan)
    * Math.max(0, Number.isFinite(canEnergyMultiplier) ? canEnergyMultiplier : 1);
  const baseEnergyPerDay = naturalEnergy + xanaxEnergy + fhcEnergy + canEnergy;
  const weeklyMcsEnergy = mcsEnabled ? WEEKLY_MCS_STOCK_ENERGY : 0;

  return {
    naturalEnergy,
    xanaxEnergy,
    fhcEnergy,
    canEnergy,
    baseEnergyPerDay,
    weeklyMcsEnergy,
    averageMcsEnergyPerDay: weeklyMcsEnergy / 7,
    averageDailyEnergy: baseEnergyPerDay + weeklyMcsEnergy / 7,
  };
}

/**
 * Add the MCS stock block's single 100E benefit every seven projected days.
 * The daily average is for display only; this function preserves the weekly
 * payout timing in the long-range simulation.
 */
export function getWeeklyStockEnergyBonus(dayIndex, mcsEnabled) {
  if (!mcsEnabled || !Number.isInteger(dayIndex) || dayIndex < 0) return 0;
  return (dayIndex + 1) % 7 === 0 ? WEEKLY_MCS_STOCK_ENERGY : 0;
}

export { WEEKLY_MCS_STOCK_ENERGY };
