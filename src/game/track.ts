import * as THREE from 'three';
import type { BoostPadData, OrbData } from './types';

export const ROAD_HALF_WIDTH = 9.5; // 19m wide track
export const CHECKPOINT_COUNT = 4;

export interface TrackSample {
  t: number;
  x: number;
  y: number;
  z: number;
  tx: number; // unit tangent x
  ty: number;
  tz: number; // unit tangent z
  rx: number; // unit right vector x (XZ plane)
  rz: number; // unit right vector z (XZ plane)
  curvature: number;
  arcLength: number;
}

export interface TrackProjection {
  t: number;
  lateralOffset: number;
  sample: TrackSample;
  distSq: number;
}

const CONTROL_POINTS = [
  new THREE.Vector3(0, 0, 80),
  new THREE.Vector3(0, 0, -35),
  new THREE.Vector3(0, 0.8, -145),
  new THREE.Vector3(55, 4.8, -240),
  new THREE.Vector3(165, 8.2, -245),
  new THREE.Vector3(245, 6.8, -165),
  new THREE.Vector3(235, 3.0, -65),
  new THREE.Vector3(150, 1.0, -20),
  new THREE.Vector3(128, 1.6, 68),
  new THREE.Vector3(188, 4.2, 150),
  new THREE.Vector3(135, 3.4, 228),
  new THREE.Vector3(14, 0.4, 222),
  new THREE.Vector3(0, 0, 175),
];

export const TRACK_SAMPLE_COUNT = 600;

export class RaceTrack {
  readonly curve: THREE.CatmullRomCurve3;
  readonly totalLength: number;
  readonly samples: TrackSample[] = [];
  readonly minimapPoints: Array<{ x: number; y: number }> = [];
  readonly minimapSvgPath: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;

  constructor() {
    this.curve = new THREE.CatmullRomCurve3(CONTROL_POINTS, true, 'centripetal', 0.5);
    this.totalLength = this.curve.getLength();

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    const rawPoints: THREE.Vector3[] = [];
    for (let i = 0; i < TRACK_SAMPLE_COUNT; i++) {
      const t = i / TRACK_SAMPLE_COUNT;
      const p = this.curve.getPointAt(t);
      rawPoints.push(p);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    this.minX = minX;
    this.maxX = maxX;
    this.minZ = minZ;
    this.maxZ = maxZ;

    for (let i = 0; i < TRACK_SAMPLE_COUNT; i++) {
      const t = i / TRACK_SAMPLE_COUNT;
      const p = rawPoints[i];
      const prev = rawPoints[(i - 1 + TRACK_SAMPLE_COUNT) % TRACK_SAMPLE_COUNT];
      const next = rawPoints[(i + 1) % TRACK_SAMPLE_COUNT];

      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      const tx = dx / len;
      const ty = dy / len;
      const tz = dz / len;

      // XZ-plane right-hand perpendicular: tangent x up(0,1,0) => (-tz, tx) wait:
      // In Three.js (+X right, +Y up, -Z forward): forward=(0,0,-1), forward x up = (1,0,0) = (-(-1), 0)!
      // Specifically: T x (0,1,0) = (tx, 0, tz) x (0, 1, 0) = (-tz, 0, tx).
      const xzLen = Math.hypot(tx, tz) || 1;
      const rx = -tz / xzLen;
      const rz = tx / xzLen;

      // Estimate signed curvature in XZ plane
      const ax = p.x - prev.x;
      const az = p.z - prev.z;
      const bx = next.x - p.x;
      const bz = next.z - p.z;
      const cross = ax * bz - az * bx;
      const denom = (Math.hypot(ax, az) * Math.hypot(bx, bz)) || 1;
      const curvature = cross / denom;

      this.samples.push({
        t,
        x: p.x,
        y: p.y,
        z: p.z,
        tx,
        ty,
        tz,
        rx,
        rz,
        curvature,
        arcLength: t * this.totalLength,
      });
    }

    // Build normalized 0..100 SVG minimap path
    const pad = 10;
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    const scale = (100 - pad * 2) / Math.max(spanX, spanZ);
    const offsetX = 50 - (spanX * scale) / 2;
    const offsetY = 50 - (spanZ * scale) / 2;

    for (let i = 0; i < TRACK_SAMPLE_COUNT; i += 4) {
      const s = this.samples[i];
      const sx = offsetX + (s.x - minX) * scale;
      const sy = offsetY + (s.z - minZ) * scale;
      this.minimapPoints.push({ x: sx, y: sy });
    }

    this.minimapSvgPath =
      this.minimapPoints
        .map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
        .join(' ') + ' Z';
  }

  worldToMinimap(x: number, z: number): { x: number; y: number } {
    const pad = 10;
    const spanX = Math.max(1, this.maxX - this.minX);
    const spanZ = Math.max(1, this.maxZ - this.minZ);
    const scale = (100 - pad * 2) / Math.max(spanX, spanZ);
    const offsetX = 50 - (spanX * scale) / 2;
    const offsetY = 50 - (spanZ * scale) / 2;
    return {
      x: offsetX + (x - this.minX) * scale,
      y: offsetY + (z - this.minZ) * scale,
    };
  }

  sampleAt(t: number): TrackSample {
    const wrapped = ((t % 1) + 1) % 1;
    const fIdx = wrapped * TRACK_SAMPLE_COUNT;
    const i0 = Math.floor(fIdx) % TRACK_SAMPLE_COUNT;
    const i1 = (i0 + 1) % TRACK_SAMPLE_COUNT;
    const alpha = fIdx - Math.floor(fIdx);

    const a = this.samples[i0];
    const b = this.samples[i1];

    const tx = a.tx + (b.tx - a.tx) * alpha;
    const ty = a.ty + (b.ty - a.ty) * alpha;
    const tz = a.tz + (b.tz - a.tz) * alpha;
    const xzLen = Math.hypot(tx, tz) || 1;

    return {
      t: wrapped,
      x: a.x + (b.x - a.x) * alpha,
      y: a.y + (b.y - a.y) * alpha,
      z: a.z + (b.z - a.z) * alpha,
      tx,
      ty,
      tz,
      rx: -tz / xzLen,
      rz: tx / xzLen,
      curvature: a.curvature + (b.curvature - a.curvature) * alpha,
      arcLength: wrapped * this.totalLength,
    };
  }

  /**
   * Fast projection of a 2D (x, z) point onto the track centerline.
   * Uses a local window around hintT first, falling back to full scan if far away.
   */
  projectOntoTrack(x: number, z: number, hintT?: number): TrackProjection {
    let bestIdx = 0;
    let bestDistSq = Infinity;

    if (hintT !== undefined) {
      const centerIdx = Math.floor((((hintT % 1) + 1) % 1) * TRACK_SAMPLE_COUNT);
      const windowRadius = 35;
      for (let offset = -windowRadius; offset <= windowRadius; offset++) {
        const idx = (centerIdx + offset + TRACK_SAMPLE_COUNT) % TRACK_SAMPLE_COUNT;
        const s = this.samples[idx];
        const dx = x - s.x;
        const dz = z - s.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          bestIdx = idx;
        }
      }
    }

    if (hintT === undefined || bestDistSq > 45 * 45) {
      bestDistSq = Infinity;
      for (let i = 0; i < TRACK_SAMPLE_COUNT; i++) {
        const s = this.samples[i];
        const dx = x - s.x;
        const dz = z - s.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          bestIdx = i;
        }
      }
    }

    // Refine sub-segment t between prev and next sample
    const prevIdx = (bestIdx - 1 + TRACK_SAMPLE_COUNT) % TRACK_SAMPLE_COUNT;
    const nextIdx = (bestIdx + 1) % TRACK_SAMPLE_COUNT;
    const sPrev = this.samples[prevIdx];
    const sNext = this.samples[nextIdx];

    const segX = sNext.x - sPrev.x;
    const segZ = sNext.z - sPrev.z;
    const segLenSq = segX * segX + segZ * segZ || 1;
    const relX = x - sPrev.x;
    const relZ = z - sPrev.z;
    const proj = Math.max(0, Math.min(1, (relX * segX + relZ * segZ) / segLenSq));

    const refinedT = (((prevIdx + proj * 2) / TRACK_SAMPLE_COUNT) % 1 + 1) % 1;
    const sample = this.sampleAt(refinedT);

    const dx = x - sample.x;
    const dz = z - sample.z;
    const lateralOffset = dx * sample.rx + dz * sample.rz;

    return {
      t: refinedT,
      lateralOffset,
      sample,
      distSq: dx * dx + dz * dz,
    };
  }

  /**
   * Computes smooth terrain elevation outside the road so canyon hills rise naturally
   * away from the asphalt while staying flush underneath the roadbed.
   */
  terrainHeightAt(x: number, z: number): number {
    const proj = this.projectOntoTrack(x, z);
    const distFromCenter = Math.sqrt(proj.distSq);
    const roadClearance = ROAD_HALF_WIDTH + 10.5;

    if (distFromCenter <= roadClearance) {
      return proj.sample.y - 1.35;
    }

    const extra = distFromCenter - roadClearance;
    const blend = Math.min(1, extra / 26);
    const hillWave =
      Math.sin(x * 0.022) * Math.cos(z * 0.02) * 5.2 +
      Math.sin(x * 0.05 + z * 0.038) * 1.8;
    const outerRise = Math.max(0, (extra - 10) * 0.24);
    const roadFloor = proj.sample.y - 1.35;
    const targetGround = Math.max(roadFloor, proj.sample.y * (1 - blend * 0.55) + hillWave * blend + outerRise);

    return roadFloor + (targetGround - roadFloor) * blend;
  }

  createBoostPads(): BoostPadData[] {
    const specs: Array<{ t: number; lateral: number }> = [
      { t: 0.09, lateral: -3.2 },
      { t: 0.25, lateral: 3.4 },
      { t: 0.42, lateral: 0.0 },
      { t: 0.58, lateral: -3.5 },
      { t: 0.75, lateral: 3.2 },
      { t: 0.91, lateral: 0.0 },
    ];
    return specs.map((spec, id) => {
      const s = this.sampleAt(spec.t);
      const heading = Math.atan2(s.tx, s.tz);
      return {
        id,
        t: spec.t,
        lateralOffset: spec.lateral,
        x: s.x + s.rx * spec.lateral,
        y: s.y + 0.03,
        z: s.z + s.rz * spec.lateral,
        heading,
      };
    });
  }

  createOrbs(): OrbData[] {
    const specs: Array<{ t: number; lateral: number }> = [
      { t: 0.05, lateral: 3.5 },
      { t: 0.14, lateral: 0 },
      { t: 0.19, lateral: -4.2 },
      { t: 0.31, lateral: 4.5 },
      { t: 0.36, lateral: -3.0 },
      { t: 0.48, lateral: 4.0 },
      { t: 0.53, lateral: 0 },
      { t: 0.65, lateral: -4.5 },
      { t: 0.70, lateral: 3.8 },
      { t: 0.82, lateral: -3.8 },
      { t: 0.87, lateral: 4.0 },
      { t: 0.95, lateral: -3.0 },
    ];
    return specs.map((spec, id) => {
      const s = this.sampleAt(spec.t);
      return {
        id,
        t: spec.t,
        lateralOffset: spec.lateral,
        x: s.x + s.rx * spec.lateral,
        y: s.y + 0.85,
        z: s.z + s.rz * spec.lateral,
        respawnTimer: 0,
        active: true,
      };
    });
  }
}

export const sharedTrack = new RaceTrack();
