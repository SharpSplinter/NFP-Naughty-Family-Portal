export type GymHistoryStatKey = "strength" | "defense" | "speed" | "dexterity";
export type GymHistoryDetails = {
  title: string;
  stat: GymHistoryStatKey | null;
  energy: number | null;
  gain: number | null;
  statBefore: number | null;
  statAfter: number | null;
  happyUsed: number | null;
  gym: number | null;
  trains: number | null;
};
export function parseGymHistoryLog(log: {
  title: string;
  record?: Record<string, unknown> | null;
}): GymHistoryDetails;
