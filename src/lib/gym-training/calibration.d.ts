export type GymCalibrationStat = "strength" | "defense" | "speed" | "dexterity";

export type GymCalibrationLog = {
  stat: GymCalibrationStat | null;
  energy: number | null;
  gain: number | null;
  statBefore: number | null;
  statAfter: number | null;
  happyUsed: number | null;
  gym: number | null;
  trains: number | null;
};

export type GymGainCalibrationSample = {
  modelVersion: string;
  logId: string;
  timestamp: number;
  stat: GymCalibrationStat;
  gymId: string;
  dots: number;
  modifier: number;
  startingHappy: number;
  energyUsed: number;
  trains: number;
  happyUsed: number | null;
  actualGain: number;
  expectedGain: number;
  correctionFactor: number;
};

export function estimateLoggedGymGain(args: {
  statKey: GymCalibrationStat;
  stat: number;
  happy: number;
  trains: number;
  energyPerTrain: number;
  dots: number;
  modifier: number;
  happyLossPerTrain: number;
}): number | null;

export function createGymGainCalibrationSample(args: {
  logId: string;
  timestamp: number;
  log: GymCalibrationLog;
  startingHappy: number;
  gymId: string | number;
  dots: number;
  modifier: number;
  energyPerTrain: number;
  happyLossRate?: number;
}): { ok: true; sample: GymGainCalibrationSample } | { ok: false; error: string };

export function getGymGainCalibrationSummary(
  samples: GymGainCalibrationSample[],
  context: { gymId: string | number; dots: number; modifier: number },
): { factor: number; sampleCount: number };
