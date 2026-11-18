export type DailyTrainingSupplyInput = {
  naturalEnergyPerDay: number;
  xanaxPerDay: number;
  fhcPerDay: number;
  refillEnergyPerFhc: number;
  cansPerDay: number;
  energyPerCan: number;
  canEnergyMultiplier?: number;
  mcsEnabled?: boolean;
};

export type DailyTrainingSupply = {
  naturalEnergy: number;
  xanaxEnergy: number;
  fhcEnergy: number;
  canEnergy: number;
  baseEnergyPerDay: number;
  weeklyMcsEnergy: number;
  averageMcsEnergyPerDay: number;
  averageDailyEnergy: number;
};

export function calculateDailyTrainingSupply(input: DailyTrainingSupplyInput): DailyTrainingSupply;
export function getWeeklyStockEnergyBonus(dayIndex: number, mcsEnabled: boolean): number;
export const WEEKLY_MCS_STOCK_ENERGY: 100;
