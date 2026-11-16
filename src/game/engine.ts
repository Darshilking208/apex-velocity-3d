import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RaceAudioEngine } from './audio';
import {
  HypercarHandle,
  createHypercarModel,
  createTerrainAndLandmarks,
  createTrackRoadMesh,
} from './models';
import { PooledParticlesAndSkids } from './particles';
import {
  computePlayerPosition,
  createInitialPlayerState,
  createInitialRaceTimers,
  createInitialRivals,
  resolvePlayerRivalCollisions,
  stepPlayerCar,
  stepRivalCars,
} from './physics';
import {
  TOTAL_CIRCUIT_LAPS,
  computeGearAndRpm,
  evaluateRaceOutcome,
  formatRaceTime,
  loadSavedBestLap,
  saveBestLap,
} from './rules';
import {
  createAsphaltTextures,
  createBoostPadTexture,
  createContactShadowTexture,
  createGantryBannerTexture,
  createTerrainTexture,
} from './textures';
import { sharedTrack } from './track';
import {
  GameMode,
  GameState,
  HudSnapshot,
  InputState,
  LIVERIES,
  LiveryId,
  RaceOutcome,
} from './types';

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _camTargetPos = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onOutcome: (outcome: RaceOutcome) => void;
  onPauseToggle: () => void;
  onRestartShortcut: () => void;
  onMuteShortcut: () => void;
}

export class ApexRaceEngine {
  private readonly mountEl: HTMLElement;
  private readonly callbacks: EngineCallbacks;
  private readonly isSoftwareGl: boolean;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly audio: RaceAudioEngine;
  private readonly particles: PooledParticlesAndSkids;

  private readonly playerCarHandle: HypercarHandle;
  private readonly rivalHandles: HypercarHandle[] = [];
  private readonly orbMeshes: THREE.Group[] = [];
  private readonly envDisposables: Array<() => void> = [];

  private gameState: GameState = 'title';
  private mode: GameMode = 'circuit';
  private liveryId: LiveryId = 'crimson';

  private player = createInitialPlayerState(sharedTrack);
  private rivals = createInitialRivals(sharedTrack);
  private boostPads = sharedTrack.createBoostPads();
  private orbs = sharedTrack.createOrbs();
  private timers = createInitialRaceTimers();

  private totalTimeMs = 0;
  private bestLapMs: number | null = loadSavedBestLap();
  private runBestLapMs: number | null = null;
  private previousBestLapMs: number | null = this.bestLapMs;
  private topSpeedKmh = 0;

  private hitstopTimer = 0;
  private cameraTrauma = 0;
  private bannerText: string | null = null;
  private bannerTone: 'cyan' | 'amber' | 'crimson' | 'emerald' = 'cyan';
  private bannerTimer = 0;

  private hudAccum = 0;
  private titleOrbitAngle = -0.62;
  private skidCooldown = 0;
  private smokeCooldown = 0;

  private frameId = 0;
  private isTimeoutFrame = false;
  private disposed = false;
  private lastTimeMs = performance.now();

  private readonly input: InputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    drift: false,
    nitro: false,
    touchSteer: 0,
  };

  private readonly touchInput = {
    forward: false,
    backward: false,
    drift: false,
    nitro: false,
    touchSteer: 0,
  };

  private readonly resizeObserver: ResizeObserver;

  constructor(
    mountEl: HTMLElement,
    initialMuted: boolean,
    callbacks: EngineCallbacks,
  ) {
    this.mountEl = mountEl;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.audio = new RaceAudioEngine(initialMuted);

    // 1. Renderer setup with ACESFilmic & software-WebGL guard
    const renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !this.isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(1, mountEl.clientWidth || window.innerWidth);
    const height = Math.max(1, mountEl.clientHeight || window.innerHeight);
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mountEl.appendChild(renderer.domElement);
    this.renderer = renderer;

    // 2. Scene, horizon-matched twilight fog, and Studio RoomEnvironment reflections
    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x0c1324);
    scene.background = skyColor;
    scene.fog = new THREE.FogExp2(0x0c1324, 0.0026);
    this.scene = scene;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();
    this.envDisposables.push(() => envTex.dispose());

    // 3. Camera
    const camera = new THREE.PerspectiveCamera(64, width / height, 0.3, 900);
    this.camera = camera;

    // 4. Warm/cool studio twilight 3-point lighting rig (1 shadow caster)
    const hemi = new THREE.HemisphereLight(0x60a5fa, 0x1e1b4b, 1.05);
    scene.add(hemi);

    const sunKey = new THREE.DirectionalLight(0xffb36b, 2.35);
    sunKey.position.set(-70, 95, -60);
    if (!this.isSoftwareGl) {
      sunKey.castShadow = true;
      sunKey.shadow.mapSize.set(1024, 1024);
      sunKey.shadow.camera.near = 10;
      sunKey.shadow.camera.far = 260;
      const d = 95;
      sunKey.shadow.camera.left = -d;
      sunKey.shadow.camera.right = d;
      sunKey.shadow.camera.top = d;
      sunKey.shadow.camera.bottom = -d;
      sunKey.shadow.bias = -0.0005;
      sunKey.shadow.normalBias = 0.02;
    }
    scene.add(sunKey);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.95);
    rimLight.position.set(140, 55, 160);
    scene.add(rimLight);

    // 5. Procedural textures, road, canyon terrain, landmarks, pads, orbs
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const asphalt = createAsphaltTextures(maxAniso);
    const terrainTex = createTerrainTexture(maxAniso);
    const gantryBannerTex = createGantryBannerTexture(maxAniso);
    const boostPadTex = createBoostPadTexture();
    const contactShadowTex = createContactShadowTexture();
    this.envDisposables.push(() => {
      asphalt.map.dispose();
      asphalt.roughnessMap.dispose();
      asphalt.bumpMap.dispose();
      terrainTex.dispose();
      gantryBannerTex.dispose();
      boostPadTex.dispose();
      contactShadowTex.dispose();
    });

    const road = createTrackRoadMesh(sharedTrack, asphalt, this.isSoftwareGl);
    scene.add(road.group);
    this.envDisposables.push(road.dispose);

    const env = createTerrainAndLandmarks({
      track: sharedTrack,
      terrainTex,
      gantryBannerTex,
      boostPadTex,
      boostPads: this.boostPads,
      orbs: this.orbs,
      isSoftwareGl: this.isSoftwareGl,
    });
    scene.add(env.group);
    this.orbMeshes = env.orbMeshes;
    this.envDisposables.push(env.dispose);

    // 6. Player hypercar & 3 AI rival hypercars
    this.playerCarHandle = createHypercarModel({
      livery: LIVERIES[this.liveryId],
      contactShadowTex,
      isSoftwareGl: this.isSoftwareGl,
      isPlayer: true,
    });
    scene.add(this.playerCarHandle.root);

    for (const r of this.rivals) {
      const rLivery = {
        ...LIVERIES.cobalt,
        bodyHex: r.bodyHex,
        accentHex: 0x38bdf8,
        caliperHex: 0xf97316,
      };
      const rh = createHypercarModel({
        livery: rLivery,
        contactShadowTex,
        isSoftwareGl: this.isSoftwareGl,
        isPlayer: false,
      });
      scene.add(rh.root);
      this.rivalHandles.push(rh);
    }

    // 7. Pooled zero-GC particle & skid system
    this.particles = new PooledParticlesAndSkids(scene);

    // Pre-warm shaders on GPU devices
    if (!this.isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Initial transform sync
    this.syncCarMeshes(0.016);
    this.positionTitleCamera(0);

    // 8. Listeners & ResizeObserver
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.clearHeldInputs);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(mountEl);

    // Start render loop
    this.lastTimeMs = performance.now();
    this.scheduleNextFrame();
  }

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.mountEl.clientWidth || window.innerWidth);
    const height = Math.max(1, this.mountEl.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.clearHeldInputs();
    }
  };

  private clearHeldInputs = (): void => {
    this.input.forward = false;
    this.input.backward = false;
    this.input.left = false;
    this.input.right = false;
    this.input.drift = false;
    this.input.nitro = false;
    this.input.touchSteer = 0;
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;

    if (this.gameState === 'playing') {
      this.audio.unlock();
      if (code === 'Escape' || code === 'KeyP') {
        e.preventDefault();
        this.callbacks.onPauseToggle();
        return;
      }
      if (code === 'KeyR') {
        e.preventDefault();
        this.callbacks.onRestartShortcut();
        return;
      }
      if (code === 'KeyM') {
        e.preventDefault();
        this.callbacks.onMuteShortcut();
        return;
      }
    } else if (this.gameState === 'paused') {
      if (code === 'Escape' || code === 'KeyP') {
        e.preventDefault();
        this.callbacks.onPauseToggle();
        return;
      }
      if (code === 'KeyM') {
        e.preventDefault();
        this.callbacks.onMuteShortcut();
        return;
      }
    }

    if (code === 'KeyW' || code === 'ArrowUp') {
      this.input.forward = true;
      if (this.gameState === 'playing') e.preventDefault();
    } else if (code === 'KeyS' || code === 'ArrowDown') {
      this.input.backward = true;
      if (this.gameState === 'playing') e.preventDefault();
    } else if (code === 'KeyA' || code === 'ArrowLeft') {
      this.input.left = true;
      if (this.gameState === 'playing') e.preventDefault();
    } else if (code === 'KeyD' || code === 'ArrowRight') {
      this.input.right = true;
      if (this.gameState === 'playing') e.preventDefault();
    } else if (code === 'Space') {
      this.input.drift = true;
      if (this.gameState === 'playing') e.preventDefault();
    } else if (code === 'ShiftLeft' || code === 'ShiftRight') {
      this.input.nitro = true;
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    const code = e.code;
    if (code === 'KeyW' || code === 'ArrowUp') this.input.forward = false;
    else if (code === 'KeyS' || code === 'ArrowDown') this.input.backward = false;
    else if (code === 'KeyA' || code === 'ArrowLeft') this.input.left = false;
    else if (code === 'KeyD' || code === 'ArrowRight') this.input.right = false;
    else if (code === 'Space') this.input.drift = false;
    else if (code === 'ShiftLeft' || code === 'ShiftRight') this.input.nitro = false;
  };

  setTouchInput(partial: Partial<typeof this.touchInput>): void {
    Object.assign(this.touchInput, partial);
  }

  setLivery(liveryId: LiveryId): void {
    this.liveryId = liveryId;
    const cfg = LIVERIES[liveryId];
    this.playerCarHandle.bodyPaintMat.color.setHex(cfg.bodyHex);
  }

  setMode(mode: GameMode): void {
    this.mode = mode;
  }

  setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  setGameState(state: GameState): void {
    this.gameState = state;
    if (state === 'playing') {
      this.clearHeldInputs();
      this.audio.unlock();
      this.audio.setLoopPaused(false);
    } else {
      this.audio.setLoopPaused(true);
    }
  }

  startNewRun(mode?: GameMode): void {
    if (mode) this.mode = mode;
    this.player = createInitialPlayerState(sharedTrack);
    this.rivals = createInitialRivals(sharedTrack);
    this.orbs = sharedTrack.createOrbs();
    this.timers = createInitialRaceTimers();
    this.totalTimeMs = 0;
    this.runBestLapMs = null;
    this.previousBestLapMs = this.bestLapMs;
    this.topSpeedKmh = 0;
    this.hitstopTimer = 0;
    this.cameraTrauma = 0;
    this.bannerText = this.mode === 'circuit' ? '3 LAPS · GO!' : 'ENDLESS SPRINT · GO!';
    this.bannerTone = 'cyan';
    this.bannerTimer = 1.6;
    this.particles.clearAll();
    this.clearHeldInputs();

    // Snap camera directly behind car at start so there's zero dizzying whip from title orbit
    const fwdX = Math.sin(this.player.heading);
    const fwdZ = Math.cos(this.player.heading);
    this.camera.position.set(this.player.x - fwdX * 8.2, this.player.y + 3.2, this.player.z - fwdZ * 8.2);
    this.camera.lookAt(this.player.x + fwdX * 14, this.player.y + 1.1, this.player.z + fwdZ * 14);
    this.camera.fov = 64;
    this.camera.updateProjectionMatrix();

    this.gameState = 'playing';
    this.audio.unlock();
    this.audio.setLoopPaused(false);
    this.emitHudSnapshot();
  }

  private showBanner(text: string, tone: 'cyan' | 'amber' | 'crimson' | 'emerald', duration = 1.5): void {
    this.bannerText = text;
    this.bannerTone = tone;
    this.bannerTimer = duration;
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.isTimeoutFrame = false;
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync !== 'function') {
      this.isTimeoutFrame = true;
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.isTimeoutFrame = true;
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.isTimeoutFrame = true;
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.isTimeoutFrame = true;
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick(): void {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTimeMs) / 1000;
    this.lastTimeMs = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    if (this.gameState === 'title') {
      this.titleOrbitAngle = -0.64 + Math.sin(performance.now() * 0.00035) * 0.18;
      this.animateOrbs(dt);
      this.syncCarMeshes(dt);
      this.positionTitleCamera(dt);
    } else if (this.gameState === 'playing') {
      this.stepPlaying(dt);
    }

    this.renderer.render(this.scene, this.camera);
    this.scheduleNextFrame();
  }

  private positionTitleCamera(dt: number): void {
    const cx = this.player.x;
    const cy = this.player.y;
    const cz = this.player.z;
    const radius = 7.6;
    const angle = this.titleOrbitAngle;
    const targetX = cx + Math.sin(angle) * radius;
    const targetZ = cz + Math.cos(angle) * radius;
    const targetY = cy + 2.35 + Math.sin(angle * 0.8) * 0.25;

    if (dt === 0) {
      this.camera.position.set(targetX, targetY, targetZ);
    } else {
      const k = 1 - Math.exp(-4.5 * dt);
      this.camera.position.x += (targetX - this.camera.position.x) * k;
      this.camera.position.y += (targetY - this.camera.position.y) * k;
      this.camera.position.z += (targetZ - this.camera.position.z) * k;
    }
    // Look slightly left of car so hero hypercar sits in the right 55-60% of the viewport
    this.camera.lookAt(cx - 1.6, cy + 0.9, cz - 3.2);
  }

  private stepPlaying(dt: number): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerText = null;
    }

    // Hitstop pauses physics briefly on heavy car/wall smash while camera shake & particles keep ticking
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
    } else {
      const combinedInput: InputState = {
        forward: this.input.forward || this.touchInput.forward,
        backward: this.input.backward || this.touchInput.backward,
        left: this.input.left,
        right: this.input.right,
        drift: this.input.drift || this.touchInput.drift,
        nitro: this.input.nitro || this.touchInput.nitro,
        touchSteer: this.touchInput.touchSteer,
      };

      this.totalTimeMs += dt * 1000;
      this.timers.lapTimeMs += dt * 1000;
      if (this.mode === 'circuit') {
        this.timers.checkpointTimerSec = Math.max(0, this.timers.checkpointTimerSec - dt);
      }

      const events = stepPlayerCar(
        this.player,
        combinedInput,
        sharedTrack,
        this.boostPads,
        this.orbs,
        dt,
        this.timers,
        this.mode === 'sprint',
      );

      stepRivalCars(this.rivals, this.player, sharedTrack, dt, this.totalTimeMs / 1000);
      const carImpact = resolvePlayerRivalCollisions(
        this.player,
        this.rivals,
        this.timers,
        this.mode === 'sprint',
      );

      const speedKmh = this.player.speed * 3.6;
      if (speedKmh > this.topSpeedKmh) this.topSpeedKmh = speedKmh;

      // Audio & FX feedback
      const gearInfo = computeGearAndRpm(speedKmh);
      this.audio.updateContinuous(speedKmh, gearInfo.rpmRatio, this.player.isDrifting, this.player.isBoosting);

      if (events.nitroStarted || events.padBoostTriggered) {
        this.audio.playNitroBurst();
        this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.28);
        if (events.padBoostTriggered) {
          this.showBanner('BOOST PAD +150', 'cyan', 1.1);
        }
      }

      if (events.orbCollected) {
        this.audio.playOrbPickup();
        this.showBanner('NITRO ORB +250', 'amber', 1.0);
      }

      if (events.driftBurstScore > 0) {
        this.showBanner(`DRIFT +${events.driftBurstScore}`, 'emerald', 1.25);
      }

      if (events.checkpointReached) {
        this.audio.playCheckpoint(false);
        this.showBanner('CHECKPOINT +10s', 'cyan', 1.3);
      }

      if (events.lapCompletedMs !== null) {
        this.audio.playCheckpoint(true);
        if (this.runBestLapMs === null || events.lapCompletedMs < this.runBestLapMs) {
          this.runBestLapMs = events.lapCompletedMs;
        }
        if (this.bestLapMs === null || events.lapCompletedMs < this.bestLapMs) {
          this.bestLapMs = events.lapCompletedMs;
          saveBestLap(this.bestLapMs);
        }
        this.showBanner(`LAP ${this.player.lap - 1} · ${formatRaceTime(events.lapCompletedMs)}`, 'emerald', 1.8);
      }

      const maxImpact = Math.max(events.barrierHitIntensity, carImpact);
      if (maxImpact > 0.15) {
        this.audio.playImpact(maxImpact);
        this.cameraTrauma = Math.min(1, this.cameraTrauma + maxImpact * 0.65);
        this.particles.emitSparkBurst(this.player.x, this.player.y, this.player.z, Math.round(6 + maxImpact * 14));
        if (maxImpact > 0.45) {
          this.hitstopTimer = 0.042;
        }
      }

      // Emit tire smoke, skid marks, and nitro exhaust flames
      this.emitVehicleParticles(dt);

      // Evaluate Victory / Defeat
      const pos = computePlayerPosition(this.player, this.rivals);
      const outcome = evaluateRaceOutcome({
        mode: this.mode,
        lap: this.player.lap,
        checkpointTimerSec: this.timers.checkpointTimerSec,
        shield: this.timers.shield,
        totalTimeMs: this.totalTimeMs,
        bestLapMs: this.runBestLapMs ?? this.bestLapMs,
        previousBestLapMs: this.previousBestLapMs,
        topSpeedKmh: this.topSpeedKmh,
        totalScore: this.timers.totalScore,
        position: pos,
      });

      if (outcome) {
        this.gameState = 'gameover';
        this.audio.setLoopPaused(true);
        this.emitHudSnapshot();
        this.callbacks.onOutcome(outcome);
        return;
      }
    }

    this.animateOrbs(dt);
    this.particles.update(dt);
    this.syncCarMeshes(dt);
    this.updateChaseCamera(dt);

    // Throttle React HUD updates (~12Hz)
    this.hudAccum += dt;
    if (this.hudAccum >= 0.08) {
      this.hudAccum = 0;
      this.emitHudSnapshot();
    }
  }

  private emitVehicleParticles(dt: number): void {
    const fwdX = Math.sin(this.player.heading);
    const fwdZ = Math.cos(this.player.heading);
    const rightX = -Math.cos(this.player.heading);
    const rightZ = Math.sin(this.player.heading);

    if (this.player.isDrifting && this.player.speed > 14) {
      this.skidCooldown -= dt;
      this.smokeCooldown -= dt;
      if (this.skidCooldown <= 0) {
        this.skidCooldown = 0.025;
        const rearX = this.player.x - fwdX * 1.35;
        const rearZ = this.player.z - fwdZ * 1.35;
        this.particles.addSkidMark(rearX + rightX * 0.88, this.player.y, rearZ + rightZ * 0.88, this.player.heading);
        this.particles.addSkidMark(rearX - rightX * 0.88, this.player.y, rearZ - rightZ * 0.88, this.player.heading);
      }
      if (this.smokeCooldown <= 0) {
        this.smokeCooldown = 0.04;
        const rearX = this.player.x - fwdX * 1.45;
        const rearZ = this.player.z - fwdZ * 1.45;
        this.particles.emitDriftSmoke(rearX + rightX * 0.88, this.player.y, rearZ + rightZ * 0.88, this.player.vx, this.player.vz);
        this.particles.emitDriftSmoke(rearX - rightX * 0.88, this.player.y, rearZ - rightZ * 0.88, this.player.vx, this.player.vz);
      }
    }

    if (this.player.isBoosting || this.player.padBoostTimer > 0) {
      const exX = this.player.x - fwdX * 2.35;
      const exZ = this.player.z - fwdZ * 2.35;
      this.particles.emitBoostBurst(exX, this.player.y, exZ, -fwdX, -fwdZ);
    }
  }

  private animateOrbs(dt: number): void {
    for (let i = 0; i < this.orbs.length; i++) {
      const orb = this.orbs[i];
      const mesh = this.orbMeshes[i];
      if (!mesh) continue;
      mesh.visible = orb.active;
      if (orb.active) {
        mesh.rotation.y += dt * 2.4;
        mesh.position.y = orb.y + Math.sin(performance.now() * 0.004 + i) * 0.18;
      }
    }
  }

  private syncCarMeshes(dt: number): void {
    // Player car
    const ph = this.playerCarHandle;
    ph.root.position.set(this.player.x, this.player.y, this.player.z);
    ph.root.rotation.y = this.player.heading;
    ph.bodyGroup.rotation.z = this.player.bodyRoll;
    ph.bodyGroup.rotation.x = this.player.bodyPitch;

    ph.flPivot.rotation.y = this.player.steerAngle;
    ph.frPivot.rotation.y = this.player.steerAngle;
    const wheelSpin = (this.player.forwardSpeed * dt) / 0.36;
    for (const w of ph.wheelMeshes) {
      w.rotation.x += wheelSpin;
    }

    // Brake light & hit-flash visual feedback
    const isBraking = this.input.backward || this.touchInput.backward || this.player.isDrifting;
    ph.brakeLightMat.emissiveIntensity = isBraking ? 4.0 : 1.3;
    if (this.player.hitFlashTimer > 0) {
      ph.bodyPaintMat.emissive.setHex(0xffffff);
      ph.bodyPaintMat.emissiveIntensity = 0.85;
    } else if (this.player.invulnTimer > 0 && Math.floor(this.player.invulnTimer * 12) % 2 === 0) {
      ph.bodyPaintMat.emissive.setHex(0x38bdf8);
      ph.bodyPaintMat.emissiveIntensity = 0.35;
    } else {
      ph.bodyPaintMat.emissive.setHex(0x000000);
      ph.bodyPaintMat.emissiveIntensity = 0;
    }

    // Exhaust flames
    const boosting = this.player.isBoosting || this.player.padBoostTimer > 0;
    for (const f of ph.flames) {
      f.visible = boosting;
      if (boosting) {
        const flicker = 0.85 + Math.random() * 0.45;
        f.scale.set(1, 1, flicker * (this.player.padBoostTimer > 0 ? 1.35 : 1.0));
      }
    }

    // Rival cars
    for (let i = 0; i < this.rivals.length; i++) {
      const r = this.rivals[i];
      const rh = this.rivalHandles[i];
      if (!rh) continue;
      rh.root.position.set(r.x, r.y, r.z);
      rh.root.rotation.y = r.heading;
      rh.flPivot.rotation.y = r.steerAngle;
      rh.frPivot.rotation.y = r.steerAngle;
      const rSpin = (r.currentSpeed * dt) / 0.36;
      for (const w of rh.wheelMeshes) {
        w.rotation.x += rSpin;
      }
      if (r.hitFlashTimer > 0) {
        rh.bodyPaintMat.emissive.setHex(0xffffff);
        rh.bodyPaintMat.emissiveIntensity = 0.75;
      } else {
        rh.bodyPaintMat.emissive.setHex(0x000000);
        rh.bodyPaintMat.emissiveIntensity = 0;
      }
    }
  }

  private updateChaseCamera(dt: number): void {
    const fwdX = Math.sin(this.player.heading);
    const fwdZ = Math.cos(this.player.heading);
    const rightX = -Math.cos(this.player.heading);
    const rightZ = Math.sin(this.player.heading);

    const speedRatio = Math.min(1, this.player.speed / 82);
    const dist = 7.4 + speedRatio * 1.4;
    const height = 2.85 + speedRatio * 0.35;
    const lateralSwing = -this.player.steerAngle * 2.2;

    _camTargetPos.set(
      this.player.x - fwdX * dist + rightX * lateralSwing,
      this.player.y + height,
      this.player.z - fwdZ * dist + rightZ * lateralSwing,
    );

    const posAlpha = 1 - Math.exp(-9.5 * dt);
    this.camera.position.lerp(_camTargetPos, posAlpha);

    // Dynamic speed-scaled FOV
    const boostFovAdd = this.player.isBoosting || this.player.padBoostTimer > 0 ? 6.5 : 0;
    const targetFov = 62 + speedRatio * 15 + boostFovAdd;
    this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-6.5 * dt));
    this.camera.updateProjectionMatrix();

    // Look ahead along car heading
    _camLookTarget.set(
      this.player.x + fwdX * 13,
      this.player.y + 1.05,
      this.player.z + fwdZ * 13,
    );
    this.camera.lookAt(_camLookTarget);

    // Decaying trauma * trauma shake
    if (this.cameraTrauma > 0) {
      const shake = this.cameraTrauma * this.cameraTrauma;
      this.camera.rotation.z += (Math.random() - 0.5) * 0.055 * shake;
      this.camera.rotation.x += (Math.random() - 0.5) * 0.035 * shake;
      this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 1.65);
    }
  }

  private emitHudSnapshot(): void {
    const speedKmh = Math.round(this.player.speed * 3.6);
    const gearInfo = computeGearAndRpm(speedKmh);
    const position = computePlayerPosition(this.player, this.rivals);

    const minimapDots = [
      ...this.rivals.map((r) => {
        const pt = sharedTrack.worldToMinimap(r.x, r.z);
        return { x: pt.x, y: pt.y, isPlayer: false, color: '#94a3b8' };
      }),
      (() => {
        const pt = sharedTrack.worldToMinimap(this.player.x, this.player.z);
        return { x: pt.x, y: pt.y, isPlayer: true, color: '#22d3ee' };
      })(),
    ];

    this.callbacks.onHudUpdate({
      speedKmh,
      gear: gearInfo.gear,
      rpmRatio: gearInfo.rpmRatio,
      nitro: Math.round(this.player.nitro),
      nitroOverheated: this.player.nitroOverheated,
      isBoosting: this.player.isBoosting || this.player.padBoostTimer > 0,
      isDrifting: this.player.isDrifting,
      activeDriftScore: this.player.driftCharge,
      totalScore: Math.round(this.timers.totalScore),
      lap: Math.min(this.player.lap, TOTAL_CIRCUIT_LAPS),
      totalLaps: TOTAL_CIRCUIT_LAPS,
      position,
      totalCars: this.rivals.length + 1,
      lapTimeMs: this.timers.lapTimeMs,
      totalTimeMs: this.totalTimeMs,
      bestLapMs: this.bestLapMs,
      checkpointTimerSec: Math.ceil(this.timers.checkpointTimerSec),
      shield: this.timers.shield,
      maxShield: 3,
      bannerText: this.bannerText,
      bannerTone: this.bannerTone,
      minimapDots,
    });
  }

  dispose(): void {
    this.disposed = true;
    if (this.isTimeoutFrame) clearTimeout(this.frameId);
    else cancelAnimationFrame(this.frameId);

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.clearHeldInputs);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.resizeObserver.disconnect();

    this.audio.dispose();
    this.particles.dispose();
    this.playerCarHandle.dispose();
    this.rivalHandles.forEach((r) => r.dispose());
    this.envDisposables.forEach((fn) => fn());

    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
