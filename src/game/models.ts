import * as THREE from 'three';
import { ROAD_HALF_WIDTH, RaceTrack, TRACK_SAMPLE_COUNT } from './track';
import type { AsphaltTextureSet } from './textures';
import type { BoostPadData, LiveryConfig, OrbData } from './types';

export interface HypercarHandle {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  bodyPaintMat: THREE.MeshPhysicalMaterial;
  brakeLightMat: THREE.MeshStandardMaterial;
  flPivot: THREE.Group;
  frPivot: THREE.Group;
  wheelMeshes: THREE.Group[];
  flames: THREE.Mesh[];
  headlightSpot?: THREE.SpotLight;
  dispose: () => void;
}

export function createHypercarModel(options: {
  livery: LiveryConfig;
  contactShadowTex: THREE.Texture;
  isSoftwareGl: boolean;
  isPlayer: boolean;
}): HypercarHandle {
  const { livery, contactShadowTex, isSoftwareGl, isPlayer } = options;
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];

  // Shared materials with >= 0.25 roughness separation between adjacent parts
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x161a24,
    roughness: 0.72,
    metalness: 0.25,
  });
  const bodyPaintMat = new THREE.MeshPhysicalMaterial({
    color: livery.bodyHex,
    roughness: 0.2,
    metalness: 0.85,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b1628,
    roughness: 0.06,
    metalness: 0.1,
    clearcoat: 1.0,
    transmission: isSoftwareGl ? 0 : 0.45,
    transparent: true,
    opacity: isSoftwareGl ? 0.65 : 0.92,
    ior: 1.5,
  });
  const titaniumMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.2,
    metalness: 0.92,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x14171f,
    roughness: 0.88,
    metalness: 0.05,
  });
  const caliperMat = new THREE.MeshStandardMaterial({
    color: livery.caliperHex,
    roughness: 0.35,
    metalness: 0.6,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: livery.accentHex,
    emissiveIntensity: 2.6,
    roughness: 0.1,
  });
  const brakeLightMat = new THREE.MeshStandardMaterial({
    color: 0x7f1d1d,
    emissive: 0xef4444,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  disposableMats.push(
    carbonMat,
    bodyPaintMat,
    glassMat,
    titaniumMat,
    tireMat,
    caliperMat,
    headlightMat,
    brakeLightMat,
    flameMat,
  );

  // 1. Soft radial contact shadow directly beneath chassis (y = 0.015)
  const shadowGeo = new THREE.PlaneGeometry(3.2, 5.4);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.015;
  root.add(shadowMesh);
  disposableGeos.push(shadowGeo);
  disposableMats.push(shadowMat);

  // 2. Lower carbon-fiber aero floorpan, front splitter & side skirts
  const floorGeo = new THREE.BoxGeometry(2.04, 0.14, 4.58);
  const floorMesh = new THREE.Mesh(floorGeo, carbonMat);
  floorMesh.position.set(0, 0.26, 0);
  floorMesh.castShadow = !isSoftwareGl;
  bodyGroup.add(floorMesh);
  disposableGeos.push(floorGeo);

  const splitterGeo = new THREE.BoxGeometry(2.14, 0.07, 0.55);
  const splitterMesh = new THREE.Mesh(splitterGeo, carbonMat);
  splitterMesh.position.set(0, 0.21, 2.15);
  bodyGroup.add(splitterMesh);
  disposableGeos.push(splitterGeo);

  // 3. Sculpted widebody lower chassis (Beveled ExtrudeGeometry up to beltline so tinted greenhouse stands proud)
  const sideProfile = new THREE.Shape();
  sideProfile.moveTo(-2.18, 0.28); // rear lower diffuser
  sideProfile.lineTo(2.22, 0.24); // front splitter nose
  sideProfile.lineTo(2.26, 0.44); // front bumper tip
  sideProfile.lineTo(1.52, 0.68); // sloped aero hood
  sideProfile.lineTo(0.62, 0.75); // windshield cowl
  sideProfile.lineTo(-1.05, 0.78); // mid-engine shoulder line
  sideProfile.lineTo(-2.02, 0.78); // rear haunch
  sideProfile.lineTo(-2.24, 0.70); // rear tail lip
  sideProfile.lineTo(-2.24, 0.34); // rear diffuser top
  sideProfile.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(sideProfile, {
    depth: 1.72,
    bevelEnabled: true,
    bevelThickness: 0.14,
    bevelSize: 0.06,
    bevelSegments: 3,
    curveSegments: 8,
  });
  // Extrude is along +Z in shape space (x=length, y=height). Rotate so length lies along +Z and width along X
  bodyGeo.rotateY(-Math.PI / 2);
  bodyGeo.translate(0.86, 0, 0);
  bodyGeo.computeVertexNormals();

  const mainHull = new THREE.Mesh(bodyGeo, bodyPaintMat);
  mainHull.castShadow = !isSoftwareGl;
  mainHull.receiveShadow = true;
  bodyGroup.add(mainHull);
  disposableGeos.push(bodyGeo);

  // 4. Widebody fender flares (4 sculpted wheel-arch haunches)
  const fenderGeo = new THREE.BoxGeometry(0.24, 0.34, 1.12);
  const fenderPositions: Array<[number, number, number]> = [
    [-0.96, 0.45, 1.38],
    [0.96, 0.45, 1.38],
    [-1.0, 0.48, -1.36],
    [1.0, 0.48, -1.36],
  ];
  for (const [fx, fy, fz] of fenderPositions) {
    const fMesh = new THREE.Mesh(fenderGeo, bodyPaintMat);
    fMesh.position.set(fx, fy, fz);
    fMesh.castShadow = !isSoftwareGl;
    bodyGroup.add(fMesh);
  }
  disposableGeos.push(fenderGeo);

  // 5. Sleek teardrop tinted cockpit canopy + painted roof spine & intake scoop
  const canopyShape = new THREE.Shape();
  canopyShape.moveTo(-1.18, 0.72);
  canopyShape.lineTo(0.68, 0.72);
  canopyShape.lineTo(0.10, 1.08);
  canopyShape.lineTo(-0.72, 1.07);
  canopyShape.closePath();
  const canopyGeo = new THREE.ExtrudeGeometry(canopyShape, {
    depth: 1.18,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.05,
    bevelSegments: 3,
  });
  canopyGeo.rotateY(-Math.PI / 2);
  canopyGeo.translate(0.59, 0, 0);
  const canopyMesh = new THREE.Mesh(canopyGeo, glassMat);
  bodyGroup.add(canopyMesh);
  disposableGeos.push(canopyGeo);

  const roofCapGeo = new THREE.BoxGeometry(0.92, 0.06, 0.76);
  const roofCap = new THREE.Mesh(roofCapGeo, bodyPaintMat);
  roofCap.position.set(0, 1.12, -0.32);
  bodyGroup.add(roofCap);
  disposableGeos.push(roofCapGeo);

  const scoopGeo = new THREE.BoxGeometry(0.36, 0.09, 0.64);
  const scoopMesh = new THREE.Mesh(scoopGeo, carbonMat);
  scoopMesh.position.set(0, 1.17, -0.52);
  bodyGroup.add(scoopMesh);
  disposableGeos.push(scoopGeo);

  // 6. Rear twin-spar GT wing spoiler
  const wingGeo = new THREE.BoxGeometry(2.12, 0.06, 0.38);
  const wingMesh = new THREE.Mesh(wingGeo, carbonMat);
  wingMesh.position.set(0, 1.14, -2.06);
  wingMesh.rotation.x = 0.14;
  wingMesh.castShadow = !isSoftwareGl;
  bodyGroup.add(wingMesh);
  disposableGeos.push(wingGeo);

  const wingEndGeo = new THREE.BoxGeometry(0.05, 0.22, 0.44);
  for (const sx of [-1.06, 1.06]) {
    const endPlate = new THREE.Mesh(wingEndGeo, bodyPaintMat);
    endPlate.position.set(sx, 1.12, -2.06);
    bodyGroup.add(endPlate);
  }
  disposableGeos.push(wingEndGeo);

  const strutGeo = new THREE.BoxGeometry(0.06, 0.42, 0.16);
  for (const sx of [-0.52, 0.52]) {
    const strut = new THREE.Mesh(strutGeo, titaniumMat);
    strut.position.set(sx, 0.92, -2.02);
    strut.rotation.x = -0.18;
    bodyGroup.add(strut);
  }
  disposableGeos.push(strutGeo);

  // 7. Rear diffuser fins & dual titanium exhaust pipes + flame cones
  const exhaustGeo = new THREE.CylinderGeometry(0.09, 0.105, 0.28, 12);
  exhaustGeo.rotateX(Math.PI / 2);
  const flameGeo = new THREE.ConeGeometry(0.11, 0.95, 10);
  flameGeo.rotateX(-Math.PI / 2);
  flameGeo.translate(0, 0, -0.48);

  const flames: THREE.Mesh[] = [];
  for (const ex of [-0.34, 0.34]) {
    const pipe = new THREE.Mesh(exhaustGeo, titaniumMat);
    pipe.position.set(ex, 0.36, -2.26);
    bodyGroup.add(pipe);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(ex, 0.36, -2.35);
    flame.visible = false;
    bodyGroup.add(flame);
    flames.push(flame);
  }
  disposableGeos.push(exhaustGeo, flameGeo);

  // 8. Cyan LED blade headlights & crimson full-width taillight bar
  const headGeo = new THREE.BoxGeometry(0.42, 0.06, 0.12);
  for (const hx of [-0.66, 0.66]) {
    const hl = new THREE.Mesh(headGeo, headlightMat);
    hl.position.set(hx, 0.50, 2.22);
    hl.rotation.y = hx > 0 ? -0.18 : 0.18;
    bodyGroup.add(hl);
  }
  disposableGeos.push(headGeo);

  const tailGeo = new THREE.BoxGeometry(1.76, 0.075, 0.08);
  const tailBar = new THREE.Mesh(tailGeo, brakeLightMat);
  tailBar.position.set(0, 0.66, -2.25);
  bodyGroup.add(tailBar);
  disposableGeos.push(tailGeo);

  // Hero car headlight SpotLight illuminating asphalt ahead (skipped on software WebGL for FPS budget)
  let headlightSpot: THREE.SpotLight | undefined;
  if (isPlayer && !isSoftwareGl) {
    headlightSpot = new THREE.SpotLight(0xbae6fd, 16, 55, Math.PI / 5, 0.55, 1.4);
    headlightSpot.position.set(0, 0.75, 2.1);
    headlightSpot.target.position.set(0, 0.0, 24);
    bodyGroup.add(headlightSpot);
    bodyGroup.add(headlightSpot.target);
  }

  // 9. Four independent wheel assemblies (tire + 5-spoke rim + brake caliper)
  const tireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.32, 20);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.33, 14);
  rimGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.34, 0.05, 0.42);
  const calGeo = new THREE.BoxGeometry(0.14, 0.18, 0.2);
  disposableGeos.push(tireGeo, rimGeo, spokeGeo, calGeo);

  const flPivot = new THREE.Group();
  const frPivot = new THREE.Group();
  flPivot.position.set(0.95, 0.36, 1.38);
  frPivot.position.set(-0.95, 0.36, 1.38);
  root.add(flPivot, frPivot);

  const rlMount = new THREE.Group();
  const rrMount = new THREE.Group();
  rlMount.position.set(0.98, 0.37, -1.36);
  rrMount.position.set(-0.98, 0.37, -1.36);
  root.add(rlMount, rrMount);

  const wheelMeshes: THREE.Group[] = [];
  const mounts = [
    { parent: flPivot, isRear: false, side: 1 },
    { parent: frPivot, isRear: false, side: -1 },
    { parent: rlMount, isRear: true, side: 1 },
    { parent: rrMount, isRear: true, side: -1 },
  ];

  for (const m of mounts) {
    const spinGroup = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    const rim = new THREE.Mesh(rimGeo, titaniumMat);
    const spokeA = new THREE.Mesh(spokeGeo, carbonMat);
    const spokeB = new THREE.Mesh(spokeGeo, carbonMat);
    spokeB.rotation.x = Math.PI / 2;

    if (m.isRear) {
      spinGroup.scale.set(1.12, 1.03, 1.03);
    }

    spinGroup.add(tire, rim, spokeA, spokeB);
    m.parent.add(spinGroup);
    wheelMeshes.push(spinGroup);

    // Non-spinning brake caliper attached to hub pivot
    const caliper = new THREE.Mesh(calGeo, caliperMat);
    caliper.position.set(m.side * 0.08, 0.04, -0.1);
    m.parent.add(caliper);
  }

  return {
    root,
    bodyGroup,
    bodyPaintMat,
    brakeLightMat,
    flPivot,
    frPivot,
    wheelMeshes,
    flames,
    headlightSpot,
    dispose: () => {
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
    },
  };
}

export function createTrackRoadMesh(
  track: RaceTrack,
  asphalt: AsphaltTextureSet,
  isSoftwareGl: boolean,
): { group: THREE.Group; dispose: () => void } {
  const group = new THREE.Group();
  const N = TRACK_SAMPLE_COUNT;

  // Road surface ribbon
  const positions = new Float32Array((N + 1) * 2 * 3);
  const uvs = new Float32Array((N + 1) * 2 * 2);
  const indices: number[] = [];

  // Barrier rail ribbons + sloped road embankment shoulders
  const railPositions = new Float32Array((N + 1) * 4 * 3);
  const railIndices: number[] = [];
  const skirtPositions = new Float32Array((N + 1) * 4 * 3);
  const skirtIndices: number[] = [];

  for (let i = 0; i <= N; i++) {
    const s = track.samples[i % N];
    const vCoord = (i / N) * (track.totalLength / 18);

    const lx = s.x - s.rx * ROAD_HALF_WIDTH;
    const lz = s.z - s.rz * ROAD_HALF_WIDTH;
    const rx = s.x + s.rx * ROAD_HALF_WIDTH;
    const rz = s.z + s.rz * ROAD_HALF_WIDTH;

    const pBase = i * 6;
    positions[pBase] = lx;
    positions[pBase + 1] = s.y;
    positions[pBase + 2] = lz;
    positions[pBase + 3] = rx;
    positions[pBase + 4] = s.y;
    positions[pBase + 5] = rz;

    const uBase = i * 4;
    uvs[uBase] = 0;
    uvs[uBase + 1] = vCoord;
    uvs[uBase + 2] = 1;
    uvs[uBase + 3] = vCoord;

    // Barrier inner-top/outer edges
    const wallOut = ROAD_HALF_WIDTH + 0.45;
    const wlX = s.x - s.rx * wallOut;
    const wlZ = s.z - s.rz * wallOut;
    const wrX = s.x + s.rx * wallOut;
    const wrZ = s.z + s.rz * wallOut;
    const rBase = i * 12;
    railPositions[rBase] = wlX;
    railPositions[rBase + 1] = s.y - 0.1;
    railPositions[rBase + 2] = wlZ;
    railPositions[rBase + 3] = wlX;
    railPositions[rBase + 4] = s.y + 0.72;
    railPositions[rBase + 5] = wlZ;

    railPositions[rBase + 6] = wrX;
    railPositions[rBase + 7] = s.y - 0.1;
    railPositions[rBase + 8] = wrZ;
    railPositions[rBase + 9] = wrX;
    railPositions[rBase + 10] = s.y + 0.72;
    railPositions[rBase + 11] = wrZ;

    // Sloped road shoulders down to terrain corridor
    const skirtOut = ROAD_HALF_WIDTH + 5.2;
    const slX = s.x - s.rx * skirtOut;
    const slZ = s.z - s.rz * skirtOut;
    const srX = s.x + s.rx * skirtOut;
    const srZ = s.z + s.rz * skirtOut;
    skirtPositions[rBase] = wlX;
    skirtPositions[rBase + 1] = s.y - 0.06;
    skirtPositions[rBase + 2] = wlZ;
    skirtPositions[rBase + 3] = slX;
    skirtPositions[rBase + 4] = s.y - 1.55;
    skirtPositions[rBase + 5] = slZ;

    skirtPositions[rBase + 6] = wrX;
    skirtPositions[rBase + 7] = s.y - 0.06;
    skirtPositions[rBase + 8] = wrZ;
    skirtPositions[rBase + 9] = srX;
    skirtPositions[rBase + 10] = s.y - 1.55;
    skirtPositions[rBase + 11] = srZ;

    if (i < N) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);

      const ra = i * 4;
      railIndices.push(ra, ra + 1, ra + 4, ra + 1, ra + 5, ra + 4);
      railIndices.push(ra + 2, ra + 6, ra + 3, ra + 3, ra + 6, ra + 7);

      skirtIndices.push(ra, ra + 4, ra + 1, ra + 1, ra + 4, ra + 5);
      skirtIndices.push(ra + 2, ra + 3, ra + 6, ra + 3, ra + 7, ra + 6);
    }
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  roadGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  roadGeo.setIndex(indices);
  roadGeo.computeVertexNormals();

  const roadMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: asphalt.map,
    roughnessMap: asphalt.roughnessMap,
    bumpMap: asphalt.bumpMap,
    bumpScale: 0.04,
    roughness: 0.78,
    metalness: 0.08,
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = !isSoftwareGl;
  group.add(roadMesh);

  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute('position', new THREE.BufferAttribute(skirtPositions, 3));
  skirtGeo.setIndex(skirtIndices);
  skirtGeo.computeVertexNormals();
  const skirtMat = new THREE.MeshStandardMaterial({
    color: 0x161b28,
    roughness: 0.92,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
  group.add(skirtMesh);

  const railGeo = new THREE.BufferGeometry();
  railGeo.setAttribute('position', new THREE.BufferAttribute(railPositions, 3));
  railGeo.setIndex(railIndices);
  railGeo.computeVertexNormals();
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.18,
    roughness: 0.5,
    metalness: 0.55,
    side: THREE.DoubleSide,
  });
  const railMesh = new THREE.Mesh(railGeo, railMat);
  group.add(railMesh);

  // Glowing top trim line on barriers using TubeGeometry or Line? Let's use crisp InstancedMesh posts!
  const postGeo = new THREE.BoxGeometry(0.24, 0.88, 0.24);
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.5,
    roughness: 0.3,
    metalness: 0.7,
  });
  const postStep = 10;
  const postCount = Math.floor(N / postStep) * 2;
  const postInst = new THREE.InstancedMesh(postGeo, postMat, postCount);
  const dummy = new THREE.Object3D();
  let pIdx = 0;
  for (let i = 0; i < N && pIdx + 1 < postCount; i += postStep) {
    const s = track.samples[i];
    const heading = Math.atan2(s.tx, s.tz);
    for (const side of [-1, 1]) {
      dummy.position.set(
        s.x + s.rx * side * (ROAD_HALF_WIDTH + 0.5),
        s.y + 0.42,
        s.z + s.rz * side * (ROAD_HALF_WIDTH + 0.5),
      );
      dummy.rotation.set(0, heading, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postInst.setMatrixAt(pIdx++, dummy.matrix);
    }
  }
  postInst.instanceMatrix.needsUpdate = true;
  postInst.computeBoundingSphere();
  group.add(postInst);

  return {
    group,
    dispose: () => {
      roadGeo.dispose();
      roadMat.dispose();
      skirtGeo.dispose();
      skirtMat.dispose();
      railGeo.dispose();
      railMat.dispose();
      postGeo.dispose();
      postMat.dispose();
    },
  };
}

export function createTerrainAndLandmarks(params: {
  track: RaceTrack;
  terrainTex: THREE.Texture;
  gantryBannerTex: THREE.Texture;
  boostPadTex: THREE.Texture;
  boostPads: BoostPadData[];
  orbs: OrbData[];
  isSoftwareGl: boolean;
}): {
  group: THREE.Group;
  orbMeshes: THREE.Group[];
  padMeshes: THREE.Mesh[];
  dispose: () => void;
} {
  const { track, terrainTex, gantryBannerTex, boostPadTex, boostPads, orbs, isSoftwareGl } = params;
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];

  // 1. Displaced coastal canyon terrain extending far beyond track into horizon fog
  const terrainGeo = new THREE.PlaneGeometry(920, 920, 120, 120);
  terrainGeo.rotateX(-Math.PI / 2);
  terrainGeo.translate(115, 0, -10);
  const posAttr = terrainGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    posAttr.setY(i, track.terrainHeightAt(x, z));
  }
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: terrainTex,
    roughness: 0.92,
    metalness: 0.04,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = !isSoftwareGl;
  group.add(terrainMesh);
  geos.push(terrainGeo);
  mats.push(terrainMat);

  // 2. Iconic Start/Finish Truss Gantry (t = 0.0) — visible directly ahead on Title Screen & Launch!
  const sfSample = track.sampleAt(0);
  const sfHeading = Math.atan2(sfSample.tx, sfSample.tz);
  const gantry = new THREE.Group();
  gantry.position.set(sfSample.x, sfSample.y, sfSample.z);
  gantry.rotation.y = sfHeading;

  const trussMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.8 });
  const bannerMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: gantryBannerTex,
    emissive: 0x38bdf8,
    emissiveMap: gantryBannerTex,
    emissiveIntensity: 0.55,
    roughness: 0.3,
  });
  const neonStripMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x22d3ee,
    emissiveIntensity: 2.2,
    roughness: 0.15,
  });
  mats.push(trussMat, bannerMat, neonStripMat);

  const pillarGeo = new THREE.BoxGeometry(0.9, 8.6, 1.1);
  const beamGeo = new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 + 2.4, 2.3, 0.9);
  const bannerGeo = new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2 - 1.2, 2.1);
  const startStripGeo = new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2 - 1.6, 1.1);
  startStripGeo.rotateX(-Math.PI / 2);
  geos.push(pillarGeo, beamGeo, bannerGeo, startStripGeo);

  for (const sx of [-ROAD_HALF_WIDTH - 0.8, ROAD_HALF_WIDTH + 0.8]) {
    const pillar = new THREE.Mesh(pillarGeo, trussMat);
    pillar.position.set(sx, 4.3, 0);
    pillar.castShadow = !isSoftwareGl;
    gantry.add(pillar);

    const accent = new THREE.Mesh(new THREE.BoxGeometry(0.18, 7.6, 0.22), neonStripMat);
    accent.position.set(sx - Math.sign(sx) * 0.45, 4.0, 0);
    gantry.add(accent);
    geos.push(accent.geometry);
  }

  const overheadBeam = new THREE.Mesh(beamGeo, trussMat);
  overheadBeam.position.set(0, 7.8, 0);
  gantry.add(overheadBeam);

  // Banner facing oncoming cars (-Z in gantry space since cars approach from -Z? Wait: cars drive toward +Z in gantry local space!)
  const frontBanner = new THREE.Mesh(bannerGeo, bannerMat);
  frontBanner.position.set(0, 7.8, -0.47);
  frontBanner.rotation.y = Math.PI;
  const backBanner = new THREE.Mesh(bannerGeo, bannerMat);
  backBanner.position.set(0, 7.8, 0.47);
  gantry.add(frontBanner, backBanner);

  // Checkered start line strip on asphalt (y = 0.025 + polygonOffset)
  const startLineMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: gantryBannerTex,
    roughness: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  mats.push(startLineMat);
  const startStrip = new THREE.Mesh(startStripGeo, startLineMat);
  startStrip.position.set(0, 0.025, 0);
  gantry.add(startStrip);
  group.add(gantry);

  // 3. Tall Stadium Grandstand & Telemetry Tower beside main straight (landmark silhouette)
  const stadiumGroup = new THREE.Group();
  stadiumGroup.position.set(-22, 0, 12);
  const standBaseGeo = new THREE.BoxGeometry(9, 6.5, 48);
  const standRoofGeo = new THREE.BoxGeometry(11.5, 0.7, 50);
  const towerGeo = new THREE.CylinderGeometry(2.2, 2.8, 22, 8);
  const towerRingGeo = new THREE.TorusGeometry(2.6, 0.25, 8, 16);
  towerRingGeo.rotateX(Math.PI / 2);
  geos.push(standBaseGeo, standRoofGeo, towerGeo, towerRingGeo);

  const standMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65, metalness: 0.3 });
  const warmAccentMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xf97316,
    emissiveIntensity: 1.5,
    roughness: 0.25,
  });
  mats.push(standMat, warmAccentMat);

  const standBase = new THREE.Mesh(standBaseGeo, standMat);
  standBase.position.set(0, 3.25, 0);
  const standRoof = new THREE.Mesh(standRoofGeo, trussMat);
  standRoof.position.set(1.2, 7.2, 0);
  standRoof.rotation.z = -0.12;
  const tower = new THREE.Mesh(towerGeo, trussMat);
  tower.position.set(-4, 11, -28);
  const towerBeacon = new THREE.Mesh(towerRingGeo, warmAccentMat);
  towerBeacon.position.set(-4, 20.5, -28);
  stadiumGroup.add(standBase, standRoof, tower, towerBeacon);
  group.add(stadiumGroup);

  // 4. Instanced trackside highway light pylons (44 pylons around circuit)
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.22, 7.5, 6);
  const lampGeo = new THREE.BoxGeometry(1.6, 0.22, 0.45);
  geos.push(poleGeo, lampGeo);

  const pylonCount = 44;
  const poleInst = new THREE.InstancedMesh(poleGeo, trussMat, pylonCount);
  const lampInst = new THREE.InstancedMesh(lampGeo, neonStripMat, pylonCount);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < pylonCount; i++) {
    const t = (i / pylonCount + 0.025) % 1;
    const s = track.sampleAt(t);
    const side = i % 2 === 0 ? 1 : -1;
    const heading = Math.atan2(s.tx, s.tz);
    const px = s.x + s.rx * side * (ROAD_HALF_WIDTH + 1.8);
    const pz = s.z + s.rz * side * (ROAD_HALF_WIDTH + 1.8);

    dummy.position.set(px, s.y + 3.75, pz);
    dummy.rotation.set(0, heading, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(
      px - s.rx * side * 0.75,
      s.y + 7.4,
      pz - s.rz * side * 0.75,
    );
    dummy.updateMatrix();
    lampInst.setMatrixAt(i, dummy.matrix);
  }
  poleInst.instanceMatrix.needsUpdate = true;
  lampInst.instanceMatrix.needsUpdate = true;
  poleInst.computeBoundingSphere();
  lampInst.computeBoundingSphere();
  group.add(poleInst, lampInst);

  // 5. Instanced canyon flat-topped rock mesas around outer perimeter (muted twilight palette)
  const rockGeo = new THREE.CylinderGeometry(5.5, 11.5, 22, 6);
  rockGeo.translate(0, 11, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0.04,
    flatShading: true,
  });
  geos.push(rockGeo);
  mats.push(rockMat);

  const rockCount = 52;
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  const rockColor = new THREE.Color();
  let placed = 0;
  for (let i = 0; i < 180 && placed < rockCount; i++) {
    const angle = (i / 180) * Math.PI * 2;
    const radius = 195 + ((i * 53) % 180);
    const rx = 115 + Math.cos(angle) * radius;
    const rz = -10 + Math.sin(angle) * radius;
    const proj = track.projectOntoTrack(rx, rz);
    if (Math.sqrt(proj.distSq) < ROAD_HALF_WIDTH + 34) continue;

    const gy = track.terrainHeightAt(rx, rz);
    const sScale = 0.8 + ((i * 37) % 100) / 85;
    dummy.position.set(rx, gy - 0.6, rz);
    dummy.rotation.set(0, (i * 1.1) % (Math.PI * 2), 0);
    dummy.scale.set(sScale * 1.25, sScale * (0.75 + ((i * 19) % 35) / 100), sScale);
    dummy.updateMatrix();
    rockInst.setMatrixAt(placed, dummy.matrix);

    const tint = 0.11 + ((i * 17) % 8) / 100;
    rockColor.setRGB(tint * 1.15, tint * 0.95, tint * 1.35);
    rockInst.setColorAt(placed, rockColor);
    placed++;
  }
  rockInst.count = placed;
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  group.add(rockInst);

  // 6. Glowing Boost Pads embedded on track
  const padGeo = new THREE.PlaneGeometry(3.2, 5.6);
  padGeo.rotateX(-Math.PI / 2);
  const padMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: boostPadTex,
    emissive: 0x22d3ee,
    emissiveMap: boostPadTex,
    emissiveIntensity: 1.6,
    roughness: 0.2,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  geos.push(padGeo);
  mats.push(padMat);

  const padMeshes: THREE.Mesh[] = [];
  for (const pad of boostPads) {
    const m = new THREE.Mesh(padGeo, padMat);
    m.position.set(pad.x, pad.y, pad.z);
    m.rotation.y = pad.heading;
    group.add(m);
    padMeshes.push(m);
  }

  // 7. Rotating Golden Nitro/Score Orbs
  const orbCoreGeo = new THREE.OctahedronGeometry(0.62, 0);
  const orbRingGeo = new THREE.TorusGeometry(0.88, 0.08, 8, 20);
  const orbCoreMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 2.1,
    roughness: 0.15,
    metalness: 0.8,
  });
  const orbRingMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x22d3ee,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  geos.push(orbCoreGeo, orbRingGeo);
  mats.push(orbCoreMat, orbRingMat);

  const orbMeshes: THREE.Group[] = [];
  for (const orb of orbs) {
    const og = new THREE.Group();
    const core = new THREE.Mesh(orbCoreGeo, orbCoreMat);
    const ring = new THREE.Mesh(orbRingGeo, orbRingMat);
    og.add(core, ring);
    og.position.set(orb.x, orb.y, orb.z);
    group.add(og);
    orbMeshes.push(og);
  }

  return {
    group,
    orbMeshes,
    padMeshes,
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}
