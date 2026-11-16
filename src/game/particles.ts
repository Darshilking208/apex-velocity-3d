import * as THREE from 'three';

const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _color = new THREE.Color();

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  sizeStart: number;
  sizeEnd: number;
  r: number;
  g: number;
  b: number;
}

export class PooledParticlesAndSkids {
  readonly smokeMesh: THREE.InstancedMesh;
  readonly skidMesh: THREE.InstancedMesh;

  private readonly smokeSlots: ParticleSlot[] = [];
  private smokeCursor = 0;
  private readonly smokeCapacity = 160;

  private skidCursor = 0;
  private readonly skidCapacity = 220;
  private skidActiveCount = 0;

  private readonly smokeGeo: THREE.SphereGeometry;
  private readonly smokeMat: THREE.MeshBasicMaterial;
  private readonly skidGeo: THREE.PlaneGeometry;
  private readonly skidMat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    // 1. Pooled smoke / spark / boost puffs (InstancedMesh)
    this.smokeGeo = new THREE.SphereGeometry(0.32, 7, 6);
    this.smokeMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.smokeMesh = new THREE.InstancedMesh(this.smokeGeo, this.smokeMat, this.smokeCapacity);
    this.smokeMesh.frustumCulled = false;

    for (let i = 0; i < this.smokeCapacity; i++) {
      this.smokeSlots.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        life: 1,
        sizeStart: 0.5,
        sizeEnd: 1.5,
        r: 1,
        g: 1,
        b: 1,
      });
      _pos.set(0, -50, 0);
      _scale.set(0, 0, 0);
      _mat4.compose(_pos, _quat.identity(), _scale);
      this.smokeMesh.setMatrixAt(i, _mat4);
      this.smokeMesh.setColorAt(i, _color.setRGB(1, 1, 1));
    }
    this.smokeMesh.instanceMatrix.needsUpdate = true;
    if (this.smokeMesh.instanceColor) this.smokeMesh.instanceColor.needsUpdate = true;
    scene.add(this.smokeMesh);

    // 2. Pooled asphalt skid mark quads (InstancedMesh ring buffer)
    this.skidGeo = new THREE.PlaneGeometry(0.34, 1.15);
    this.skidGeo.rotateX(-Math.PI / 2);
    this.skidMat = new THREE.MeshBasicMaterial({
      color: 0x07090e,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.skidMesh = new THREE.InstancedMesh(this.skidGeo, this.skidMat, this.skidCapacity);
    this.skidMesh.frustumCulled = false;
    _scale.set(0, 0, 0);
    _mat4.compose(_pos.set(0, -50, 0), _quat.identity(), _scale);
    for (let i = 0; i < this.skidCapacity; i++) {
      this.skidMesh.setMatrixAt(i, _mat4);
    }
    this.skidMesh.instanceMatrix.needsUpdate = true;
    scene.add(this.skidMesh);
  }

  emitParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    sizeStart: number,
    sizeEnd: number,
    r: number,
    g: number,
    b: number,
  ): void {
    const slot = this.smokeSlots[this.smokeCursor];
    this.smokeCursor = (this.smokeCursor + 1) % this.smokeCapacity;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.age = 0;
    slot.life = life;
    slot.sizeStart = sizeStart;
    slot.sizeEnd = sizeEnd;
    slot.r = r;
    slot.g = g;
    slot.b = b;
  }

  emitDriftSmoke(x: number, y: number, z: number, vx: number, vz: number): void {
    this.emitParticle(
      x + (Math.random() - 0.5) * 0.35,
      y + 0.16,
      z + (Math.random() - 0.5) * 0.35,
      vx * 0.12 + (Math.random() - 0.5) * 1.4,
      0.8 + Math.random() * 1.1,
      vz * 0.12 + (Math.random() - 0.5) * 1.4,
      0.48 + Math.random() * 0.25,
      0.65,
      2.2,
      0.78,
      0.83,
      0.91,
    );
  }

  emitSparkBurst(x: number, y: number, z: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.emitParticle(
        x,
        y + 0.35,
        z,
        (Math.random() - 0.5) * 14,
        2.5 + Math.random() * 6,
        (Math.random() - 0.5) * 14,
        0.28 + Math.random() * 0.18,
        0.48,
        0.05,
        1.0,
        0.65 + Math.random() * 0.35,
        0.15,
      );
    }
  }

  emitBoostBurst(x: number, y: number, z: number, backX: number, backZ: number): void {
    this.emitParticle(
      x,
      y + 0.36,
      z,
      backX * 8 + (Math.random() - 0.5) * 2.2,
      0.4 + Math.random() * 0.8,
      backZ * 8 + (Math.random() - 0.5) * 2.2,
      0.24,
      0.6,
      0.08,
      0.22,
      0.82,
      1.0,
    );
  }

  addSkidMark(x: number, y: number, z: number, heading: number): void {
    _pos.set(x, y + 0.024, z);
    _euler.set(0, heading, 0);
    _quat.setFromEuler(_euler);
    _scale.set(1, 1, 1);
    _mat4.compose(_pos, _quat, _scale);
    this.skidMesh.setMatrixAt(this.skidCursor, _mat4);
    this.skidMesh.instanceMatrix.needsUpdate = true;
    this.skidCursor = (this.skidCursor + 1) % this.skidCapacity;
    if (this.skidActiveCount < this.skidCapacity) this.skidActiveCount++;
  }

  clearAll(): void {
    _pos.set(0, -50, 0);
    _scale.set(0, 0, 0);
    _mat4.compose(_pos, _quat.identity(), _scale);
    for (let i = 0; i < this.smokeCapacity; i++) {
      this.smokeSlots[i].active = false;
      this.smokeMesh.setMatrixAt(i, _mat4);
    }
    for (let i = 0; i < this.skidCapacity; i++) {
      this.skidMesh.setMatrixAt(i, _mat4);
    }
    this.smokeMesh.instanceMatrix.needsUpdate = true;
    this.skidMesh.instanceMatrix.needsUpdate = true;
    this.skidCursor = 0;
    this.skidActiveCount = 0;
  }

  update(dt: number): void {
    let anyChanged = false;
    for (let i = 0; i < this.smokeCapacity; i++) {
      const s = this.smokeSlots[i];
      if (!s.active) continue;
      anyChanged = true;
      s.age += dt;
      if (s.age >= s.life) {
        s.active = false;
        _pos.set(0, -50, 0);
        _scale.set(0, 0, 0);
        _mat4.compose(_pos, _quat.identity(), _scale);
        this.smokeMesh.setMatrixAt(i, _mat4);
        continue;
      }

      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.vx *= Math.exp(-2.5 * dt);
      s.vz *= Math.exp(-2.5 * dt);

      const u = s.age / s.life;
      const sz = s.sizeStart + (s.sizeEnd - s.sizeStart) * u;
      const fade = 1 - u * u;
      _pos.set(s.x, s.y, s.z);
      _scale.setScalar(sz * fade);
      _mat4.compose(_pos, _quat.identity(), _scale);
      this.smokeMesh.setMatrixAt(i, _mat4);
      this.smokeMesh.setColorAt(i, _color.setRGB(s.r, s.g, s.b));
    }

    if (anyChanged) {
      this.smokeMesh.instanceMatrix.needsUpdate = true;
      if (this.smokeMesh.instanceColor) this.smokeMesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    this.smokeGeo.dispose();
    this.smokeMat.dispose();
    this.skidGeo.dispose();
    this.skidMat.dispose();
  }
}
