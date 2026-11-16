# APEX VELOCITY

A 3D twilight-circuit arcade racing game built with **Three.js**, **React**, **TypeScript**, and **Tailwind CSS**, featuring procedural PBR hypercars, arcade sim-cade drifting physics, nitro boost mechanics, AI rival racers, pooled particle effects, and a synthesized Web Audio API sound engine with zero external asset dependencies.

---

## Features

### Game Modes
- **3-Lap Circuit**: Race across *Solaris Grand Circuit* against 3 AI rival cars. Pass sector checkpoints to earn time bonuses (`+10s` per checkpoint, `+14s` per lap) and complete 3 laps before the gate timer expires.
- **Endless Sprint**: Endurance run featuring a 3-segment chassis shield (`SHIELD`). High-speed collisions against barriers or rivals drain shield segments with brief invulnerability frames.

### Vehicle Physics & Mechanics
- **Arcade Sim-Cade Handling**: Speed-sensitive steering dampening, smooth body roll/pitch, and guardrail slide deflection so scrapes redirect cleanly without snagging.
- **Handbrake Drifting (`Space`)**: Reduces lateral grip for controlled slides, accumulates live drift combo scores, recharges nitro, and triggers a clean-exit speed burst on sustained drifts.
- **Nitro Boost (`Shift`) & Track Pickups**: Boosts top speed (`~300+ KM/H`) with an overheat cooldown cycle when depleted. Hit cyan **Boost Pads** (`+150` score + surge speed) and collect golden **Nitro Orbs** (`+250` score + `+25%` nitro).
- **AI Rivals & Collision Feel**: 3 rival hypercars follow the track spline with lane-weaving and fair rubber-banding, complete with elastic side-swipe physics, `42ms` simulation hitstop, hit-flashes, and decaying trauma camera shake.

### 3D Visuals & Procedural Audio
- **100% Procedural Assets**: No external `.glb`, `.png`, or `.mp3` dependencies. Asphalt aggregate, FIA curbs, terrain grids, start/finish gantry banners, boost pads, and contact shadows are generated via HTML5 `<canvas>` textures.
- **Composite Hypercar Model**: Multi-part `THREE.Group` featuring a beveled widebody lower hull, fender flares, tinted cockpit canopy, roof scoop, twin-spar GT wing, dual titanium exhausts with animated boost flames, steering front wheel pivots, spinning 5-spoke rims with calipers, and 4 customizable finishes (*Crimson Carbon*, *Cobalt Apex*, *Solaris Gold*, *Stealth Matte*).
- **PBR Lighting & Performance**: `ACESFilmicToneMapping`, `RoomEnvironment` IBL reflections, warm sunset key light + cool twilight `HemisphereLight`, horizon-matched `FogExp2`, instanced trackside pylons and canyon mesas, zero-GC pooled `InstancedMesh` smoke/sparks/skid marks, and automatic `isSoftwareGl` pacing.
- **Synthesized Web Audio**: Speed- and RPM-reactive dual-oscillator engine hum, filtered noise tire screech during drifts, nitro whoosh, orb chimes, checkpoint/lap fanfares, and collision thuds.

---

## Controls

| Action | Keyboard | Mobile / Touch |
| :--- | :--- | :--- |
| Accelerate / Brake & Reverse | `W` / `S` or `↑` / `↓` | Auto-drive on steer/nitro |
| Steer Left / Right | `A` / `D` or `←` / `→` | `◀` / `▶` buttons |
| Handbrake Drift | `Space` | `DRIFT` button |
| Nitro Boost | `Shift` | `NITRO` button |
| Start Race (Title Screen) | `Enter` or `Space` | Tap `START RACE` |
| Pause / Resume | `Esc` or `P` | Pause icon button |
| Restart Race | `R` | Restart icon button |
| Mute / Unmute Audio | `M` | Audio icon button |

> **Tip**: Append `?autostart=1` to the URL to skip the Title Screen and launch directly into gameplay.

---

## Project Structure

```text
├── index.html                  # HTML entry point & motorsport typography fonts
├── metadata.json               # App metadata
├── package.json                # Dependencies and npm scripts
└── src/
    ├── App.tsx                 # Game shell state machine & isolated WebGL mount
    ├── index.css               # Tailwind CSS & telemetry styling utilities
    ├── components/
    │   ├── TitleOverlay.tsx    # Title lockup, mode/livery selectors, start CTA
    │   ├── HudOverlay.tsx      # Speedometer, gear/RPM, nitro, minimap, touch UI
    │   └── OutcomeModal.tsx    # Pause, Victory, and Run Terminated modals
    └── game/
        ├── types.ts            # Shared state, livery, physics & HUD types
        ├── track.ts            # Closed Catmull-Rom spline, projection & terrain height
        ├── physics.ts          # Car kinematics, drift, nitro, rivals & collisions
        ├── rules.ts            # Gearbox/RPM math, drift scoring, win/loss & storage
        ├── rules.test.ts       # Unit tests (node:test) for track, physics & rules
        ├── textures.ts         # Procedural CanvasTexture generators
        ├── models.ts           # Composite hypercar, roadbed, gantry & canyon meshes
        ├── particles.ts        # Zero-GC pooled InstancedMesh smoke, sparks & skids
        ├── audio.ts            # Procedural Web Audio API synthesizer
        └── engine.ts           # Three.js renderer, camera rig & clamped game loop
```

---

## Getting Started

### Prerequisites
- **Node.js** 20+ (with `npm`)

### Installation
```bash
npm install
```

### Scripts
- **Start Development Server** (runs on port `3000`):
  ```bash
  npm run dev
  ```
- **Run Unit Tests** (pure track, physics, and rules verification):
  ```bash
  npx tsx --test src/game/rules.test.ts
  ```
- **Typecheck**:
  ```bash
  npm run lint
  ```
- **Production Build**:
  ```bash
  npm run build
  ```
