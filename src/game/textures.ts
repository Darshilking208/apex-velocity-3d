import * as THREE from 'three';

export interface AsphaltTextureSet {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

export function createAsphaltTextures(maxAnisotropy: number): AsphaltTextureSet {
  const width = 512;
  const height = 512;

  // Color / Albedo canvas
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const ctx = colorCanvas.getContext('2d')!;

  // Base dark slate asphalt
  ctx.fillStyle = '#1b202c';
  ctx.fillRect(0, 0, width, height);

  // Aggregate mineral noise + rubber wear tracks
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const u = x / width;
      // Subtle twin racing-groove tire wear darkening around u = 0.35 and u = 0.65
      const grooveL = Math.exp(-Math.pow((u - 0.33) / 0.09, 2)) * 8;
      const grooveR = Math.exp(-Math.pow((u - 0.67) / 0.09, 2)) * 8;
      const grain = (((x * 73856093) ^ (y * 19349663)) & 255) / 255;
      const speckle = (grain - 0.5) * 16;

      data[idx] = Math.max(12, Math.min(255, 28 + speckle - grooveL - grooveR));
      data[idx + 1] = Math.max(14, Math.min(255, 33 + speckle - grooveL - grooveR));
      data[idx + 2] = Math.max(20, Math.min(255, 45 + speckle - grooveL - grooveR));
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Outer rumble curbs (crimson & off-white alternating blocks)
  const curbWidth = 26;
  const segCount = 4;
  const segH = height / segCount;
  for (let i = 0; i < segCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#dc2626' : '#e2e8f0';
    ctx.fillRect(0, i * segH, curbWidth, segH);
    ctx.fillRect(width - curbWidth, i * segH, curbWidth, segH);
  }

  // Crisp glowing cyan/white edge boundary lines inside curbs
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(curbWidth + 4, 0, 6, height);
  ctx.fillRect(width - curbWidth - 10, 0, 6, height);

  // Dashed center lane divider
  ctx.fillStyle = '#f59e0b';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(width / 2 - 4, i * 128 + 20, 8, 72);
  }

  // Subtle quarter-lane dashed guides
  ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(width * 0.27, i * 128 + 24, 3, 56);
    ctx.fillRect(width * 0.73, i * 128 + 24, 3, 56);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  // Grayscale roughness / bump map
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 256;
  roughCanvas.height = 256;
  const rCtx = roughCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const idx = (y * 256 + x) * 4;
      const n = (((x * 374761393) ^ (y * 668265263)) & 255) / 255;
      const val = Math.round(145 + (n - 0.5) * 75);
      rImg.data[idx] = val;
      rImg.data[idx + 1] = val;
      rImg.data[idx + 2] = val;
      rImg.data[idx + 3] = 255;
    }
  }
  rCtx.putImageData(rImg, 0, 0);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(roughCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = maxAnisotropy;

  return { map, roughnessMap, bumpMap };
}

export function createTerrainTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#151927';
  ctx.fillRect(0, 0, size, size);

  // Subtle synth-canyon contour grid & mineral variation
  const img = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const n = (((x * 1597334677) ^ (y * 3812015801)) & 255) / 255;
      const delta = (n - 0.5) * 14;
      img.data[idx] = Math.max(8, Math.min(255, 22 + delta));
      img.data[idx + 1] = Math.max(10, Math.min(255, 25 + delta));
      img.data[idx + 2] = Math.max(16, Math.min(255, 42 + delta));
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
  ctx.lineWidth = 2;
  const step = 64;
  for (let p = 0; p <= size; p += step) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createGantryBannerTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0b1120';
  ctx.fillRect(0, 0, 1024, 256);

  // Checkered flank stripes
  const sq = 32;
  for (let side = 0; side < 2; side++) {
    const startX = side === 0 ? 0 : 1024 - sq * 4;
    for (let y = 0; y < 256; y += sq) {
      for (let x = 0; x < sq * 4; x += sq) {
        const white = ((x / sq + y / sq) & 1) === 0;
        ctx.fillStyle = white ? '#f8fafc' : '#0f172a';
        ctx.fillRect(startX + x, y, sq, sq);
      }
    }
  }

  // Top & bottom neon accent bars
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(128, 12, 768, 10);
  ctx.fillStyle = '#f97316';
  ctx.fillRect(128, 234, 768, 10);

  // Center banner text
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'italic 900 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('APEX VELOCITY', 512, 112);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '700 28px system-ui, sans-serif';
  ctx.fillText('SOLARIS GRAND CIRCUIT', 512, 182);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createBoostPadTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#062033';
  ctx.fillRect(0, 0, 256, 512);

  // Glowing side rails
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(8, 0, 14, 512);
  ctx.fillRect(234, 0, 14, 512);

  // 3 forward chevrons
  ctx.strokeStyle = '#67e8f9';
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const cy = 110 + i * 145;
    ctx.beginPath();
    ctx.moveTo(46, cy + 52);
    ctx.lineTo(128, cy - 32);
    ctx.lineTo(210, cy + 52);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 12, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.35)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.6)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
