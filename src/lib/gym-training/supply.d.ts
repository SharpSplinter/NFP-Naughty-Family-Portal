export type DailyTrainingSupplyInput = {
  naturalEnergyPerDay: number;
  xanaxPerDay: number;
  fhcPerDay: number;
  refillEnergyPerFhc: number;
  cansPerDay: number;
  energyPerCan: number;
  canEnergyMultiplier?: number;
  refillsPerDay?: number;
  energyPerRefill?: number;
  mcsBlocks?: number;
};

export type DailyTrainingSupply = {
  naturalEnergy: number;
  xanaxEnergy: number;
  fhcEnergy: number;
  canEnergy: number;
  pointRefillEnergy: number;
  baseEnergyPerDay: number;
  weeklyMcsEnergy: number;
  averageMcsEnergyPerDay: number;
  averageDailyEnergy: number;
};

export function calculateDailyTrainingSupply(input: DailyTrainingSupplyInput): DailyTrainingSupply;
export function getWeeklyStockEnergyBonus(dayIndex: number, mcsBlocks: number): number;
export const WEEKLY_MCS_STOCK_ENERGY: 100;
