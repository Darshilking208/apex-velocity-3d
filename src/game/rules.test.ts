import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceTrack, ROAD_HALF_WIDTH } from './track';
import {
  computeDriftScore,
  computeGearAndRpm,
  evaluateRaceOutcome,
  formatRaceTime,
  TOTAL_CIRCUIT_LAPS,
} from './rules';
import {
  CAR_HALF_WIDTH,
  computePlayerPosition,
  createInitialPlayerState,
  createInitialRaceTimers,
  createInitialRivals,
  stepPlayerCar,
} from './physics';
import type { InputState } from './types';

function emptyInput(): InputState {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    drift: false,
    nitro: false,
    touchSteer: 0,
  };
}

test('track spline forms a continuous closed loop with wide road and valid projection', () => {
  const track = new RaceTrack();
  assert.ok(track.totalLength > 800, 'Track should be a full circuit > 800m');

  const start = track.sampleAt(0);
  const nearEnd = track.sampleAt(0.9999);
  const gap = Math.hypot(start.x - nearEnd.x, start.y - nearEnd.y, start.z - nearEnd.z);
  assert.ok(gap < 1.5, `Closed spline gap should be tiny, got ${gap}`);

  // Projecting an offset point recovers exact lateralOffset
  const targetSample = track.sampleAt(0.25);
  const testX = targetSample.x + targetSample.rx * 4.2;
  const testZ = targetSample.z + targetSample.rz * 4.2;
  const proj = track.projectOntoTrack(testX, testZ, 0.24);
  assert.ok(Math.abs(proj.lateralOffset - 4.2) < 0.25);
});

test('car accelerates straight ahead and survives initial idle seconds without crashing', () => {
  const track = new RaceTrack();
  const boostPads = track.createBoostPads();
  const orbs = track.createOrbs();
  const car = createInitialPlayerState(track);
  const timers = createInitialRaceTimers();

  // Simulate 3 seconds with zero input
  for (let i = 0; i < 180; i++) {
    stepPlayerCar(car, emptyInput(), track, boostPads, orbs, 1 / 60, timers, false);
  }
  assert.equal(Math.round(car.speed), 0);
  assert.equal(timers.shield, 3);

  // Now hold forward + nitro for 2 seconds
  const input = { ...emptyInput(), forward: true, nitro: true };
  for (let i = 0; i < 120; i++) {
    stepPlayerCar(car, input, track, boostPads, orbs, 1 / 60, timers, false);
  }
  assert.ok(car.speed > 45, `Expected high speed under nitro, got ${car.speed}`);
  assert.ok(car.nitro < 100, 'Nitro should deplete while boosting');
});

test('drifting builds drift score and awards boost on clean exit', () => {
  const track = new RaceTrack();
  const boostPads = track.createBoostPads();
  const orbs = track.createOrbs();
  const car = createInitialPlayerState(track);
  const timers = createInitialRaceTimers();

  // Accelerate up to drifting speed
  const accelInput = { ...emptyInput(), forward: true };
  for (let i = 0; i < 120; i++) {
    stepPlayerCar(car, accelInput, track, boostPads, orbs, 1 / 60, timers, false);
  }

  // Drift right for 0.55s then counter-steer left for 0.45s (classic S-drift)
  const driftRight = { ...emptyInput(), forward: true, right: true, drift: true };
  for (let i = 0; i < 33; i++) {
    stepPlayerCar(car, driftRight, track, boostPads, orbs, 1 / 60, timers, false);
  }
  const driftLeft = { ...emptyInput(), forward: true, left: true, drift: true };
  for (let i = 0; i < 27; i++) {
    stepPlayerCar(car, driftLeft, track, boostPads, orbs, 1 / 60, timers, false);
  }
  assert.equal(car.isDrifting, true);
  assert.ok(car.driftCharge > 0, 'Active drift should build drift charge');

  // Release drift
  const exitEvents = stepPlayerCar(car, accelInput, track, boostPads, orbs, 1 / 60, timers, false);
  assert.ok(exitEvents.driftBurstScore > 0, 'Releasing drift should bank drift score');
  assert.ok(car.padBoostTimer > 0, 'Long drift should trigger exit boost');
  assert.ok(timers.totalScore >= exitEvents.driftBurstScore);
});

test('guardrail collision keeps car inside track bounds', () => {
  const track = new RaceTrack();
  const boostPads = track.createBoostPads();
  const orbs = track.createOrbs();
  const car = createInitialPlayerState(track);
  const timers = createInitialRaceTimers();

  // Steer hard into the right wall at speed
  const hardRight = { ...emptyInput(), forward: true, right: true };
  for (let i = 0; i < 240; i++) {
    stepPlayerCar(car, hardRight, track, boostPads, orbs, 1 / 60, timers, false);
  }

  assert.ok(
    Math.abs(car.lateralOffset) <= ROAD_HALF_WIDTH - CAR_HALF_WIDTH + 0.05,
    `Car should stay clamped within guardrails, lateralOffset=${car.lateralOffset}`,
  );
});

test('gearbox, scoring, formatting, and victory/defeat evaluation work as expected', () => {
  assert.equal(computeGearAndRpm(0).gear, 1);
  assert.equal(computeGearAndRpm(110).gear, 3);
  assert.equal(computeGearAndRpm(280).gear, 6);
  assert.ok(computeDriftScore(1.5, 35) > 200);
  assert.equal(formatRaceTime(65432), '01:05.43');

  const win = evaluateRaceOutcome({
    mode: 'circuit',
    lap: TOTAL_CIRCUIT_LAPS + 1,
    checkpointTimerSec: 12,
    shield: 3,
    totalTimeMs: 92400,
    bestLapMs: 29800,
    previousBestLapMs: 31000,
    topSpeedKmh: 288,
    totalScore: 4200,
    position: 1,
  });
  assert.ok(win && win.victory && win.isNewBestLap);

  const timeoutLoss = evaluateRaceOutcome({
    mode: 'circuit',
    lap: 2,
    checkpointTimerSec: 0,
    shield: 3,
    totalTimeMs: 45000,
    bestLapMs: 30000,
    previousBestLapMs: null,
    topSpeedKmh: 240,
    totalScore: 1500,
    position: 2,
  });
  assert.ok(timeoutLoss && !timeoutLoss.victory);

  const sprintLoss = evaluateRaceOutcome({
    mode: 'sprint',
    lap: 1,
    checkpointTimerSec: 20,
    shield: 0,
    totalTimeMs: 55000,
    bestLapMs: null,
    previousBestLapMs: null,
    topSpeedKmh: 250,
    totalScore: 1900,
    position: 3,
  });
  assert.ok(sprintLoss && !sprintLoss.victory);
});

test('rivals and position ranking work cleanly', () => {
  const track = new RaceTrack();
  const player = createInitialPlayerState(track, 0.94);
  const rivals = createInitialRivals(track);
  assert.equal(computePlayerPosition(player, rivals), 4);
  player.totalProgress = 1.5;
  assert.equal(computePlayerPosition(player, rivals), 1);
});
