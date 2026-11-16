import {
  CHECKPOINT_BONUS_SEC,
  INITIAL_CHECKPOINT_TIME_SEC,
  LAP_BONUS_SEC,
  MAX_SHIELD,
  computeDriftScore,
} from './rules';
import { CHECKPOINT_COUNT, ROAD_HALF_WIDTH, RaceTrack } from './track';
import type { BoostPadData, CarPhysicsState, InputState, OrbData, RivalCarState } from './types';

export interface StepEvents {
  barrierHitIntensity: number; // 0..1
  carBumpIntensity: number; // 0..1
  padBoostTriggered: boolean;
  orbCollected: boolean;
  checkpointReached: boolean;
  lapCompletedMs: number | null;
  driftBurstScore: number;
  nitroStarted: boolean;
}

export const CAR_HALF_WIDTH = 1.05;
export const CAR_HALF_LENGTH = 2.25;

// Top speeds in m/s (1 m/s = 3.6 km/h)
const BASE_MAX_SPEED = 64; // ~230 km/h
const NITRO_MAX_SPEED = 84; // ~302 km/h
const PAD_MAX_SPEED = 92; // ~331 km/h
const REVERSE_MAX_SPEED = -22; // ~79 km/h

export function createInitialPlayerState(track: RaceTrack, startT = 0.975): CarPhysicsState {
  const s = track.sampleAt(startT);
  const lateralOffset = -2.6;
  const heading = Math.atan2(s.tx, s.tz);
  return {
    x: s.x + s.rx * lateralOffset,
    y: s.y,
    z: s.z + s.rz * lateralOffset,
    heading,
    vx: 0,
    vz: 0,
    speed: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    steerAngle: 0,
    bodyRoll: 0,
    bodyPitch: 0,
    isDrifting: false,
    driftDuration: 0,
    driftCharge: 0,
    nitro: 100,
    nitroOverheated: false,
    isBoosting: false,
    padBoostTimer: 0,
    hitFlashTimer: 0,
    invulnTimer: 0,
    trackProgress: startT,
    lateralOffset,
    lap: 1,
    nextCheckpoint: 1,
    totalProgress: startT - 1, // behind start line until crossing t=0
  };
}

export function createInitialRivals(track: RaceTrack): RivalCarState[] {
  const configs = [
    { id: 1, name: 'V. Kurosawa', bodyHex: 0x0284c7, startT: 0.982, lateral: 2.6, baseSpeed: 55.5 },
    { id: 2, name: 'M. Vance', bodyHex: 0xeab308, startT: 0.988, lateral: -2.6, baseSpeed: 58.0 },
    { id: 3, name: 'S. Moreau', bodyHex: 0xa855f7, startT: 0.994, lateral: 2.6, baseSpeed: 60.5 },
  ];

  return configs.map((c) => {
    const s = track.sampleAt(c.startT);
    return {
      id: c.id,
      name: c.name,
      bodyHex: c.bodyHex,
      trackProgress: c.startT,
      lateralOffset: c.lateral,
      targetLateralOffset: c.lateral,
      baseSpeed: c.baseSpeed,
      currentSpeed: 0,
      lap: 1,
      totalProgress: c.startT - 1,
      x: s.x + s.rx * c.lateral,
      y: s.y,
      z: s.z + s.rz * c.lateral,
      heading: Math.atan2(s.tx, s.tz),
      steerAngle: 0,
      laneTimer: 1.5 + c.id * 0.7,
      hitFlashTimer: 0,
    };
  });
}

export function stepPlayerCar(
  car: CarPhysicsState,
  input: InputState,
  track: RaceTrack,
  boostPads: BoostPadData[],
  orbs: OrbData[],
  dt: number,
  stateTimers: {
    checkpointTimerSec: number;
    lapTimeMs: number;
    totalScore: number;
    shield: number;
  },
  isSprintMode: boolean,
): StepEvents {
  const events: StepEvents = {
    barrierHitIntensity: 0,
    carBumpIntensity: 0,
    padBoostTriggered: false,
    orbCollected: false,
    checkpointReached: false,
    lapCompletedMs: null,
    driftBurstScore: 0,
    nitroStarted: false,
  };

  if (car.hitFlashTimer > 0) car.hitFlashTimer = Math.max(0, car.hitFlashTimer - dt);
  if (car.invulnTimer > 0) car.invulnTimer = Math.max(0, car.invulnTimer - dt);
  if (car.padBoostTimer > 0) car.padBoostTimer = Math.max(0, car.padBoostTimer - dt);

  // Decompose current velocity into car-local forward and lateral components
  const fwdX = Math.sin(car.heading);
  const fwdZ = Math.cos(car.heading);
  const rightX = -Math.cos(car.heading);
  const rightZ = Math.sin(car.heading);

  let forwardSpeed = car.vx * fwdX + car.vz * fwdZ;
  let lateralSpeed = car.vx * rightX + car.vz * rightZ;

  // Nitro boost logic with overheat cooldown
  const wasBoosting = car.isBoosting;
  if (car.nitroOverheated && car.nitro >= 25) {
    car.nitroOverheated = false;
  }
  const wantsNitro = input.nitro && (input.forward || forwardSpeed > 10) && !car.nitroOverheated && car.nitro > 1;
  car.isBoosting = wantsNitro;
  if (car.isBoosting && !wasBoosting) {
    events.nitroStarted = true;
  }

  if (car.isBoosting) {
    car.nitro = Math.max(0, car.nitro - 28 * dt);
    if (car.nitro <= 0.5) {
      car.nitro = 0;
      car.nitroOverheated = true;
      car.isBoosting = false;
    }
  } else {
    car.nitro = Math.min(100, car.nitro + 6.5 * dt);
  }

  // Pad boost pushes car faster than normal nitro
  const hasPadBoost = car.padBoostTimer > 0;
  const maxAllowedSpeed = hasPadBoost
    ? PAD_MAX_SPEED
    : car.isBoosting
      ? NITRO_MAX_SPEED
      : BASE_MAX_SPEED;

  // Steering input (+1 = left, -1 = right)
  let rawSteer = 0;
  if (input.left) rawSteer += 1;
  if (input.right) rawSteer -= 1;
  if (Math.abs(input.touchSteer) > 0.05) {
    rawSteer = -input.touchSteer; // touchSteer +1 = right -> negative heading delta
  }

  // Smooth visual wheel steer angle
  const targetWheelSteer = rawSteer * 0.44;
  car.steerAngle += (targetWheelSteer - car.steerAngle) * (1 - Math.exp(-14 * dt));

  // Handbrake drift state
  const canDrift = Math.abs(forwardSpeed) > 15 && (Math.abs(rawSteer) > 0.1 || Math.abs(lateralSpeed) > 5);
  const wasDrifting = car.isDrifting;
  car.isDrifting = input.drift && canDrift;

  if (car.isDrifting) {
    car.driftDuration += dt;
    car.driftCharge = computeDriftScore(car.driftDuration, Math.abs(forwardSpeed));
    car.nitro = Math.min(100, car.nitro + 12 * dt);
  } else if (wasDrifting) {
    if (car.driftDuration >= 0.45 && car.driftCharge > 0) {
      events.driftBurstScore = car.driftCharge;
      stateTimers.totalScore += car.driftCharge;
      if (car.driftDuration >= 0.9) {
        car.padBoostTimer = Math.max(car.padBoostTimer, 0.75);
      }
    }
    car.driftDuration = 0;
    car.driftCharge = 0;
  }

  // Speed-sensitive steering dampening
  const absFwd = Math.abs(forwardSpeed);
  const speedSteerFactor = Math.min(1, absFwd / 7.5) * (1 - Math.min(0.45, (absFwd / NITRO_MAX_SPEED) * 0.42));
  const driftTurnMult = car.isDrifting ? 1.48 : 1.0;
  const reverseSign = forwardSpeed < -1 ? -1 : 1;
  const yawRate = rawSteer * 2.15 * speedSteerFactor * driftTurnMult * reverseSign;
  car.heading += yawRate * dt;

  // Recompute forward/right vectors after heading update
  const nFwdX = Math.sin(car.heading);
  const nFwdZ = Math.cos(car.heading);
  const nRightX = -Math.cos(car.heading);
  const nRightZ = Math.sin(car.heading);

  // Longitudinal acceleration & braking
  let targetPitch = 0;
  if (input.forward) {
    const accel = car.isBoosting ? 58 : hasPadBoost ? 72 : 34;
    forwardSpeed += accel * dt;
    targetPitch = car.isBoosting ? -0.045 : -0.025;
  } else if (input.backward) {
    if (forwardSpeed > 2) {
      forwardSpeed -= 52 * dt; // braking
      targetPitch = 0.04;
    } else {
      forwardSpeed -= 22 * dt; // reverse
      targetPitch = 0.02;
    }
  } else {
    // Engine braking / rolling friction
    forwardSpeed *= Math.exp(-0.95 * dt);
  }

  // Aerodynamic drag & speed cap
  if (forwardSpeed > maxAllowedSpeed) {
    forwardSpeed += (maxAllowedSpeed - forwardSpeed) * (1 - Math.exp(-4.5 * dt));
  }
  if (forwardSpeed < REVERSE_MAX_SPEED) {
    forwardSpeed = REVERSE_MAX_SPEED;
  }

  // Lateral grip: normal driving kills lateral slip quickly; drifting preserves slip for wide slides
  const lateralGrip = car.isDrifting ? 2.4 : 9.2;
  lateralSpeed *= Math.exp(-lateralGrip * dt);

  // Slight drift forward speed conservation
  if (car.isDrifting && input.forward) {
    forwardSpeed *= Math.exp(-0.22 * dt);
  }

  // Convert local speeds back to world velocity
  car.vx = nFwdX * forwardSpeed + nRightX * lateralSpeed;
  car.vz = nFwdZ * forwardSpeed + nRightZ * lateralSpeed;
  car.forwardSpeed = forwardSpeed;
  car.lateralSpeed = lateralSpeed;
  car.speed = Math.hypot(car.vx, car.vz);

  // Visual body roll & pitch damping
  const targetRoll = -rawSteer * Math.min(1, absFwd / 30) * (car.isDrifting ? 0.075 : 0.042);
  car.bodyRoll += (targetRoll - car.bodyRoll) * (1 - Math.exp(-10 * dt));
  car.bodyPitch += (targetPitch - car.bodyPitch) * (1 - Math.exp(-10 * dt));

  // Integrate position
  car.x += car.vx * dt;
  car.z += car.vz * dt;

  // Project onto track & enforce soft/solid track boundary guardrails
  const prevT = car.trackProgress;
  const proj = track.projectOntoTrack(car.x, car.z, prevT);
  car.trackProgress = proj.t;
  car.lateralOffset = proj.lateralOffset;
  car.y = proj.sample.y;

  const maxLateral = ROAD_HALF_WIDTH - CAR_HALF_WIDTH;
  if (Math.abs(car.lateralOffset) > maxLateral) {
    const sign = Math.sign(car.lateralOffset);
    // Snap inside barrier
    const clampedLat = sign * maxLateral;
    car.x = proj.sample.x + proj.sample.rx * clampedLat;
    car.z = proj.sample.z + proj.sample.rz * clampedLat;
    car.lateralOffset = clampedLat;

    // Velocity component pointing outward into the guardrail
    const outVel = car.vx * proj.sample.rx + car.vz * proj.sample.rz;
    if (outVel * sign > 0) {
      const impact = Math.abs(outVel);
      // Slide cleanly along track tangent with frame-rate independent friction scrub
      const scrub = Math.exp(-1.5 * dt) * (impact > 10 ? 0.94 : 1.0);
      const tangentVel = (car.vx * proj.sample.tx + car.vz * proj.sample.tz) * scrub;
      const bounce = -sign * Math.min(8, impact * 0.3);
      car.vx = proj.sample.tx * tangentVel + proj.sample.rx * bounce;
      car.vz = proj.sample.tz * tangentVel + proj.sample.rz * bounce;

      // Gently align heading toward track direction so player never gets wedged sideways
      const trackHeading = Math.atan2(proj.sample.tx, proj.sample.tz);
      const headingDiff = Math.atan2(Math.sin(trackHeading - car.heading), Math.cos(trackHeading - car.heading));
      car.heading += headingDiff * Math.min(1, 14 * dt);

      if (impact > 4.5) {
        events.barrierHitIntensity = Math.min(1, impact / 26);
        car.hitFlashTimer = 0.08;
        if (isSprintMode && car.invulnTimer <= 0 && impact > 9) {
          stateTimers.shield = Math.max(0, stateTimers.shield - 1);
          car.invulnTimer = 1.25;
        }
      }
    }
  }

  // Check boost pads
  for (const pad of boostPads) {
    const dx = car.x - pad.x;
    const dz = car.z - pad.z;
    if (dx * dx + dz * dz < 3.4 * 3.4) {
      if (car.padBoostTimer < 0.8) {
        events.padBoostTriggered = true;
      }
      car.padBoostTimer = 1.25;
      car.nitro = Math.min(100, car.nitro + 18);
      car.nitroOverheated = false;
      stateTimers.totalScore += 150;
    }
  }

  // Check orbs
  for (const orb of orbs) {
    if (!orb.active) {
      orb.respawnTimer -= dt;
      if (orb.respawnTimer <= 0) orb.active = true;
      continue;
    }
    const dx = car.x - orb.x;
    const dz = car.z - orb.z;
    if (dx * dx + dz * dz < 2.6 * 2.6) {
      orb.active = false;
      orb.respawnTimer = 10;
      car.nitro = Math.min(100, car.nitro + 25);
      car.nitroOverheated = false;
      stateTimers.totalScore += 250;
      events.orbCollected = true;
    }
  }

  // Checkpoints & Lap progression
  // Sector gates at t = 0.25, 0.50, 0.75, and Start/Finish at t = 0.0 (wraps from >0.85 to <0.15)
  const t = car.trackProgress;
  if (car.nextCheckpoint < CHECKPOINT_COUNT) {
    const gateT = car.nextCheckpoint / CHECKPOINT_COUNT;
    if (t >= gateT && t < gateT + 0.12 && prevT < gateT + 0.12) {
      car.nextCheckpoint += 1;
      events.checkpointReached = true;
      stateTimers.checkpointTimerSec = Math.min(45, stateTimers.checkpointTimerSec + CHECKPOINT_BONUS_SEC);
      stateTimers.totalScore += 300;
    }
  } else {
    // Ready to cross start/finish line (wrap from high t > 0.85 to low t < 0.15)
    if (prevT > 0.85 && t < 0.15) {
      const completedTime = stateTimers.lapTimeMs;
      // Ignore initial crossing right after grid launch on lap 1 if car started behind line (t=0.94 -> 0)
      if (car.totalProgress < 0) {
        // Crossed start line at launch!
        car.nextCheckpoint = 1;
        car.totalProgress = t;
      } else {
        events.lapCompletedMs = completedTime;
        car.lap += 1;
        car.nextCheckpoint = 1;
        stateTimers.lapTimeMs = 0;
        stateTimers.checkpointTimerSec = Math.min(48, stateTimers.checkpointTimerSec + LAP_BONUS_SEC);
        stateTimers.totalScore += 1000;
      }
    }
  }

  // Monotonic totalProgress for race position ranking
  if (car.lap === 1 && car.totalProgress < 0 && t > 0.8) {
    car.totalProgress = t - 1;
  } else {
    car.totalProgress = (car.lap - 1) + t;
  }

  return events;
}

export function stepRivalCars(
  rivals: RivalCarState[],
  player: CarPhysicsState,
  track: RaceTrack,
  dt: number,
  elapsedRaceSec: number,
): void {
  const maxLane = ROAD_HALF_WIDTH - 2.2;

  for (const rival of rivals) {
    if (rival.hitFlashTimer > 0) rival.hitFlashTimer = Math.max(0, rival.hitFlashTimer - dt);

    rival.laneTimer -= dt;
    if (rival.laneTimer <= 0) {
      rival.laneTimer = 2.2 + ((rival.id * 1.37) % 2.4);
      // Pick clean lane offset away from edges
      const phase = Math.sin(elapsedRaceSec * 0.7 + rival.id * 2.1);
      rival.targetLateralOffset = phase * (maxLane * 0.65);
    }

    // Gentle rubber-banding so races stay engaging and close without cheating wildly
    const progressGap = player.totalProgress - rival.totalProgress;
    const rubberBand = Math.max(-6, Math.min(8.5, progressGap * 32));
    const sample = track.sampleAt(rival.trackProgress);
    const cornerSlowdown = Math.min(0.22, Math.abs(sample.curvature) * 1.4);
    const desiredSpeed = Math.max(36, (rival.baseSpeed + rubberBand) * (1 - cornerSlowdown));

    rival.currentSpeed += (desiredSpeed - rival.currentSpeed) * (1 - Math.exp(-2.8 * dt));
    rival.lateralOffset += (rival.targetLateralOffset - rival.lateralOffset) * (1 - Math.exp(-2.2 * dt));
    rival.lateralOffset = Math.max(-maxLane, Math.min(maxLane, rival.lateralOffset));

    const prevT = rival.trackProgress;
    const deltaT = (rival.currentSpeed * dt) / track.totalLength;
    rival.trackProgress = (rival.trackProgress + deltaT) % 1;

    if (prevT > 0.85 && rival.trackProgress < 0.15) {
      if (rival.totalProgress < 0) {
        rival.totalProgress = rival.trackProgress;
      } else {
        rival.lap += 1;
      }
    }

    if (rival.lap === 1 && rival.totalProgress < 0 && rival.trackProgress > 0.8) {
      rival.totalProgress = rival.trackProgress - 1;
    } else {
      rival.totalProgress = (rival.lap - 1) + rival.trackProgress;
    }

    const nextSample = track.sampleAt(rival.trackProgress);
    rival.x = nextSample.x + nextSample.rx * rival.lateralOffset;
    rival.y = nextSample.y;
    rival.z = nextSample.z + nextSample.rz * rival.lateralOffset;
    const targetHeading = Math.atan2(nextSample.tx, nextSample.tz);
    const hDiff = Math.atan2(Math.sin(targetHeading - rival.heading), Math.cos(targetHeading - rival.heading));
    rival.heading += hDiff * (1 - Math.exp(-10 * dt));
    rival.steerAngle = Math.max(-0.35, Math.min(0.35, hDiff * 2.5));
  }
}

export function resolvePlayerRivalCollisions(
  player: CarPhysicsState,
  rivals: RivalCarState[],
  stateTimers: { shield: number },
  isSprintMode: boolean,
): number {
  let maxImpact = 0;
  const minDist = 2.65;

  for (const rival of rivals) {
    const dx = player.x - rival.x;
    const dz = player.z - rival.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist && distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = minDist - dist;

      // Push player apart
      player.x += nx * overlap * 0.72;
      player.z += nz * overlap * 0.72;
      rival.x -= nx * overlap * 0.28;
      rival.z -= nz * overlap * 0.28;

      const rFwdX = Math.sin(rival.heading);
      const rFwdZ = Math.cos(rival.heading);
      const relVx = player.vx - rFwdX * rival.currentSpeed;
      const relVz = player.vz - rFwdZ * rival.currentSpeed;
      const closing = relVx * nx + relVz * nz;

      if (closing < 0) {
        const impulse = -closing * 1.15 + 4.0;
        player.vx += nx * impulse * 0.65;
        player.vz += nz * impulse * 0.65;
        rival.currentSpeed = Math.max(24, rival.currentSpeed - Math.abs(closing) * 0.25);

        const intensity = Math.min(1, Math.abs(closing) / 22);
        if (intensity > maxImpact) maxImpact = intensity;

        player.hitFlashTimer = 0.08;
        rival.hitFlashTimer = 0.08;

        if (isSprintMode && player.invulnTimer <= 0 && intensity > 0.35) {
          stateTimers.shield = Math.max(0, stateTimers.shield - 1);
          player.invulnTimer = 1.25;
        }
      }
    }
  }

  return maxImpact;
}

export function computePlayerPosition(player: CarPhysicsState, rivals: RivalCarState[]): number {
  let pos = 1;
  for (const r of rivals) {
    if (r.totalProgress > player.totalProgress) pos += 1;
  }
  return pos;
}

export function createInitialRaceTimers() {
  return {
    checkpointTimerSec: INITIAL_CHECKPOINT_TIME_SEC,
    lapTimeMs: 0,
    totalScore: 0,
    shield: MAX_SHIELD,
  };
}
