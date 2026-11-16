import type { GameMode, RaceOutcome } from './types';

export const TOTAL_CIRCUIT_LAPS = 3;
export const INITIAL_CHECKPOINT_TIME_SEC = 28;
export const CHECKPOINT_BONUS_SEC = 10;
export const LAP_BONUS_SEC = 14;
export const MAX_SHIELD = 3;

export const BEST_LAP_STORAGE_KEY = 'apex_velocity_best_lap_ms';
export const MUTE_STORAGE_KEY = 'apex_velocity_muted';

export interface GearReadout {
  gear: number;
  rpmRatio: number;
}

/**
 * Computes arcade 6-speed gearbox readout from forward speed in km/h.
 */
export function computeGearAndRpm(speedKmh: number): GearReadout {
  const absSpeed = Math.max(0, Math.abs(speedKmh));
  const thresholds = [0, 48, 95, 145, 195, 245, 330];

  for (let g = 1; g <= 6; g++) {
    const low = thresholds[g - 1];
    const high = thresholds[g];
    if (absSpeed <= high || g === 6) {
      const span = Math.max(1, high - low);
      const rawRatio = (absSpeed - low) / span;
      return {
        gear: g,
        rpmRatio: Math.max(0.22, Math.min(1, 0.25 + rawRatio * 0.75)),
      };
    }
  }
  return { gear: 6, rpmRatio: 1 };
}

export function computeDriftScore(driftDurationSec: number, speedMps: number): number {
  if (driftDurationSec <= 0 || speedMps < 14) return 0;
  const speedFactor = Math.min(2.5, speedMps / 28);
  const multiplier = 1 + Math.floor(driftDurationSec / 0.8) * 0.5;
  return Math.round(driftDurationSec * 140 * speedFactor * multiplier);
}

export function evaluateRaceOutcome(params: {
  mode: GameMode;
  lap: number;
  checkpointTimerSec: number;
  shield: number;
  totalTimeMs: number;
  bestLapMs: number | null;
  previousBestLapMs: number | null;
  topSpeedKmh: number;
  totalScore: number;
  position: number;
}): RaceOutcome | null {
  if (params.mode === 'circuit') {
    if (params.lap > TOTAL_CIRCUIT_LAPS) {
      const isNewBestLap =
        params.bestLapMs !== null &&
        (params.previousBestLapMs === null || params.bestLapMs < params.previousBestLapMs);
      return {
        victory: true,
        mode: 'circuit',
        reason: `Finished P${params.position} across ${TOTAL_CIRCUIT_LAPS} laps`,
        totalTimeMs: params.totalTimeMs,
        bestLapMs: params.bestLapMs,
        topSpeedKmh: Math.round(params.topSpeedKmh),
        totalScore: Math.round(params.totalScore),
        lapsCompleted: TOTAL_CIRCUIT_LAPS,
        position: params.position,
        isNewBestLap,
      };
    }
    if (params.checkpointTimerSec <= 0) {
      return {
        victory: false,
        mode: 'circuit',
        reason: 'Checkpoint timer expired',
        totalTimeMs: params.totalTimeMs,
        bestLapMs: params.bestLapMs,
        topSpeedKmh: Math.round(params.topSpeedKmh),
        totalScore: Math.round(params.totalScore),
        lapsCompleted: Math.max(0, params.lap - 1),
        position: params.position,
        isNewBestLap: false,
      };
    }
  } else {
    // Endless Sprint mode
    if (params.shield <= 0) {
      const isNewBestLap =
        params.bestLapMs !== null &&
        (params.previousBestLapMs === null || params.bestLapMs < params.previousBestLapMs);
      return {
        victory: false,
        mode: 'sprint',
        reason: 'Chassis shield depleted',
        totalTimeMs: params.totalTimeMs,
        bestLapMs: params.bestLapMs,
        topSpeedKmh: Math.round(params.topSpeedKmh),
        totalScore: Math.round(params.totalScore),
        lapsCompleted: Math.max(0, params.lap - 1),
        position: params.position,
        isNewBestLap,
      };
    }
  }

  return null;
}

export function formatRaceTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const minutes = Math.floor(clamped / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  const hundredths = Math.floor((clamped % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

export function loadSavedBestLap(): number | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(BEST_LAP_STORAGE_KEY);
    if (!raw) return null;
    const val = Number(raw);
    return Number.isFinite(val) && val > 0 ? val : null;
  } catch {
    return null;
  }
}

export function saveBestLap(ms: number): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(BEST_LAP_STORAGE_KEY, String(Math.round(ms)));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSavedMuted(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Ignore storage quota errors
  }
}
