export class RaceAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOscA: OscillatorNode | null = null;
  private engineOscB: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private screechSource: AudioBufferSourceNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;

  private muted = false;
  private active = false;
  private initialized = false;

  constructor(initialMuted = false) {
    this.muted = initialMuted;
  }

  private ensureInit(): void {
    if (this.initialized || typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.42;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Engine synth (dual detuned sawtooth + triangle through lowpass filter)
      const engFilter = ctx.createBiquadFilter();
      engFilter.type = 'lowpass';
      engFilter.frequency.value = 260;
      engFilter.Q.value = 3.2;

      const engGain = ctx.createGain();
      engGain.gain.value = 0.0;

      const oscA = ctx.createOscillator();
      oscA.type = 'sawtooth';
      oscA.frequency.value = 52;

      const oscB = ctx.createOscillator();
      oscB.type = 'triangle';
      oscB.frequency.value = 104.5;

      oscA.connect(engFilter);
      oscB.connect(engFilter);
      engFilter.connect(engGain);
      engGain.connect(master);

      oscA.start();
      oscB.start();

      this.engineOscA = oscA;
      this.engineOscB = oscB;
      this.engineFilter = engFilter;
      this.engineGain = engGain;

      // Tire screech (looping filtered white noise)
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      noiseSrc.loop = true;

      const screechFilter = ctx.createBiquadFilter();
      screechFilter.type = 'bandpass';
      screechFilter.frequency.value = 1650;
      screechFilter.Q.value = 5.5;

      const screechGain = ctx.createGain();
      screechGain.gain.value = 0;

      noiseSrc.connect(screechFilter);
      screechFilter.connect(screechGain);
      screechGain.connect(master);
      noiseSrc.start();

      this.screechSource = noiseSrc;
      this.screechFilter = screechFilter;
      this.screechGain = screechGain;
      this.initialized = true;
    } catch {
      // Ignore audio init errors in restricted headless environments
    }
  }

  unlock(): void {
    const userActivation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (userActivation && !userActivation.hasBeenActive) {
      return;
    }
    this.ensureInit();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.active = true;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.42, this.ctx.currentTime, 0.04);
    }
  }

  setLoopPaused(paused: boolean): void {
    this.active = !paused;
    if (!this.ctx || !this.engineGain || !this.screechGain) return;
    if (paused) {
      const now = this.ctx.currentTime;
      this.engineGain.gain.setTargetAtTime(0, now, 0.05);
      this.screechGain.gain.setTargetAtTime(0, now, 0.05);
    }
  }

  updateContinuous(speedKmh: number, rpmRatio: number, isDrifting: boolean, isBoosting: boolean): void {
    if (!this.initialized || !this.ctx || !this.active) return;
    const now = this.ctx.currentTime;

    if (this.engineOscA && this.engineOscB && this.engineFilter && this.engineGain) {
      const baseHz = 46 + rpmRatio * 96 + (isBoosting ? 24 : 0) + Math.min(45, speedKmh * 0.14);
      this.engineOscA.frequency.setTargetAtTime(baseHz, now, 0.05);
      this.engineOscB.frequency.setTargetAtTime(baseHz * 2.01, now, 0.05);
      this.engineFilter.frequency.setTargetAtTime(
        240 + rpmRatio * 680 + (isBoosting ? 420 : 0),
        now,
        0.06,
      );
      this.engineGain.gain.setTargetAtTime(0.11 + rpmRatio * 0.09, now, 0.08);
    }

    if (this.screechGain && this.screechFilter) {
      const targetScreech = isDrifting && speedKmh > 45 ? Math.min(0.14, (speedKmh / 240) * 0.14) : 0;
      this.screechGain.gain.setTargetAtTime(targetScreech, now, 0.04);
      this.screechFilter.frequency.setTargetAtTime(1450 + Math.min(700, speedKmh * 2.5), now, 0.06);
    }
  }

  playNitroBurst(): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.42);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.45);
  }

  playOrbPickup(): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const pitchVar = 0.94 + Math.random() * 0.12;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587 * pitchVar, now);
    osc.frequency.exponentialRampToValueAtTime(880 * pitchVar, now + 0.12);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  playCheckpoint(isLap: boolean): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = isLap ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t0 = now + idx * 0.075;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.18, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    });
  }

  playImpact(intensity: number): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const vol = Math.min(0.32, 0.1 + intensity * 0.22);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.18);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  dispose(): void {
    try {
      this.engineOscA?.stop();
      this.engineOscB?.stop();
      this.screechSource?.stop();
      this.ctx?.close();
    } catch {
      // Ignore cleanup errors
    }
    this.initialized = false;
    this.ctx = null;
  }
}
