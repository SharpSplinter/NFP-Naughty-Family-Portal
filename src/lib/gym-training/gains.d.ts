export type GymTrainingStatKey = "strength" | "defense" | "speed" | "dexterity";
export function effectiveGymStat(stat: number): number;
export function estimateEnergyEquivalentGain(
  statKey: GymTrainingStatKey,
  stat: number,
  happy: number,
  energy: number,
  dots: number,
  modifier: number,
): number;
