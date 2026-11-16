export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type GameMode = 'circuit' | 'sprint';

export type LiveryId = 'crimson' | 'cobalt' | 'amber' | 'obsidian';

export interface LiveryConfig {
  id: LiveryId;
  name: string;
  bodyHex: number;
  cssColor: string;
  accentHex: number;
  caliperHex: number;
}

export const LIVERIES: Record<LiveryId, LiveryConfig> = {
  crimson: {
    id: 'crimson',
    name: 'Crimson Carbon',
    bodyHex: 0xc81d32,
    cssColor: '#c81d32',
    accentHex: 0x22d3ee,
    caliperHex: 0xf59e0b,
  },
  cobalt: {
    id: 'cobalt',
    name: 'Cobalt Apex',
    bodyHex: 0x1d6fe8,
    cssColor: '#1d6fe8',
    accentHex: 0x38bdf8,
    caliperHex: 0xf43f5e,
  },
  amber: {
    id: 'amber',
    name: 'Solaris Gold',
    bodyHex: 0xd97706,
    cssColor: '#d97706',
    accentHex: 0x22d3ee,
    caliperHex: 0xef4444,
  },
  obsidian: {
    id: 'obsidian',
    name: 'Stealth Matte',
    bodyHex: 0x272e3f,
    cssColor: '#374151',
    accentHex: 0xf97316,
    caliperHex: 0x22d3ee,
  },
};

export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  drift: boolean;
  nitro: boolean;
  touchSteer: number; // -1..1 for mobile touch
}

export interface CarPhysicsState {
  x: number;
  y: number;
  z: number;
  heading: number; // radians, 0 = +Z, or standard atan2(dx, dz)
  vx: number;
  vz: number;
  speed: number; // m/s signed or magnitude along forward
  forwardSpeed: number; // m/s along car forward vector
  lateralSpeed: number; // m/s perpendicular
  steerAngle: number; // front wheel visual angle (rad)
  bodyRoll: number;
  bodyPitch: number;
  isDrifting: boolean;
  driftDuration: number;
  driftCharge: number; // accumulated score in active drift
  nitro: number; // 0..100
  nitroOverheated: boolean;
  isBoosting: boolean;
  padBoostTimer: number;
  hitFlashTimer: number;
  invulnTimer: number;
  trackProgress: number; // 0..1 normalized along spline
  lateralOffset: number; // signed meters from track centerline
  lap: number; // 1-based current lap
  nextCheckpoint: number; // 1..checkpointCount
  totalProgress: number; // lap + trackProgress for ranking
}

export interface RivalCarState {
  id: number;
  name: string;
  bodyHex: number;
  trackProgress: number;
  lateralOffset: number;
  targetLateralOffset: number;
  baseSpeed: number; // m/s
  currentSpeed: number;
  lap: number;
  totalProgress: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  steerAngle: number;
  laneTimer: number;
  hitFlashTimer: number;
}

export interface BoostPadData {
  id: number;
  t: number; // 0..1 track progress
  lateralOffset: number;
  x: number;
  y: number;
  z: number;
  heading: number;
}

export interface OrbData {
  id: number;
  t: number;
  lateralOffset: number;
  x: number;
  y: number;
  z: number;
  respawnTimer: number;
  active: boolean;
}

export interface MinimapDot {
  x: number; // normalized 0..100 SVG coords
  y: number;
  isPlayer: boolean;
  color: string;
}

export interface HudSnapshot {
  speedKmh: number;
  gear: number;
  rpmRatio: number; // 0..1
  nitro: number; // 0..100
  nitroOverheated: boolean;
  isBoosting: boolean;
  isDrifting: boolean;
  activeDriftScore: number;
  totalScore: number;
  lap: number;
  totalLaps: number;
  position: number; // 1..4
  totalCars: number;
  lapTimeMs: number;
  totalTimeMs: number;
  bestLapMs: number | null;
  checkpointTimerSec: number; // circuit mode countdown
  shield: number; // sprint mode 0..3
  maxShield: number;
  bannerText: string | null;
  bannerTone: 'cyan' | 'amber' | 'crimson' | 'emerald';
  minimapDots: MinimapDot[];
}

export interface RaceOutcome {
  victory: boolean;
  mode: GameMode;
  reason: string;
  totalTimeMs: number;
  bestLapMs: number | null;
  topSpeedKmh: number;
  totalScore: number;
  lapsCompleted: number;
  position: number;
  isNewBestLap: boolean;
}
