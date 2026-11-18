export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private masterVolume = 0.45;

  // Continuous string tension nodes
  private tensionActive = false;
  private tensionOsc: OscillatorNode | null = null;
  private tensionNoise: AudioBufferSourceNode | null = null;
  private tensionFilter: BiquadFilterNode | null = null;
  private tensionGain: GainNode | null = null;

  // Continuous whoosh nodes during arrow flight
  private whooshActive = false;
  private whooshNoise: AudioBufferSourceNode | null = null;
  private whooshFilter: BiquadFilterNode | null = null;
  private whooshGain: GainNode | null = null;

  get isMuted(): boolean {
    return this.muted;
  }

  unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.masterVolume,
        this.ctx.currentTime,
        0.02
      );
    }
    if (this.muted) {
      this.stopTension();
      this.stopWhoosh();
    }
    return this.muted;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  updateTension(active: boolean, power: number): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) {
      if (this.tensionActive) this.stopTension();
      return;
    }

    if (!active) {
      if (this.tensionActive) this.stopTension();
      return;
    }

    const now = this.ctx.currentTime;
    const clamped = Math.max(0, Math.min(1, power));

    if (!this.tensionActive) {
      this.tensionActive = true;
      this.tensionGain = this.ctx.createGain();
      this.tensionGain.gain.setValueAtTime(0.001, now);
      this.tensionGain.connect(this.masterGain);

      this.tensionOsc = this.ctx.createOscillator();
      this.tensionOsc.type = 'triangle';
      this.tensionOsc.frequency.setValueAtTime(85, now);

      const oscGain = this.ctx.createGain();
      oscGain.gain.value = 0.25;
      this.tensionOsc.connect(oscGain);
      oscGain.connect(this.tensionGain);

      this.tensionNoise = this.ctx.createBufferSource();
      this.tensionNoise.buffer = this.noiseBuffer;
      this.tensionNoise.loop = true;

      this.tensionFilter = this.ctx.createBiquadFilter();
      this.tensionFilter.type = 'bandpass';
      this.tensionFilter.Q.value = 3.5;
      this.tensionFilter.frequency.setValueAtTime(300, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.value = 0.45;
      this.tensionNoise.connect(this.tensionFilter);
      this.tensionFilter.connect(noiseGain);
      noiseGain.connect(this.tensionGain);

      this.tensionOsc.start(now);
      this.tensionNoise.start(now);
    }

    if (this.tensionOsc && this.tensionFilter && this.tensionGain) {
      this.tensionOsc.frequency.setTargetAtTime(85 + clamped * 115, now, 0.03);
      this.tensionFilter.frequency.setTargetAtTime(280 + clamped * 950, now, 0.03);
      this.tensionGain.gain.setTargetAtTime(0.03 + clamped * 0.16, now, 0.03);
    }
  }

  stopTension(): void {
    if (!this.tensionActive) return;
    this.tensionActive = false;
    const now = this.ctx?.currentTime ?? 0;
    try {
      this.tensionGain?.gain.setTargetAtTime(0.0001, now, 0.02);
      this.tensionOsc?.stop(now + 0.06);
      this.tensionNoise?.stop(now + 0.06);
    } catch {
      // Ignore already stopped nodes
    }
    this.tensionOsc = null;
    this.tensionNoise = null;
    this.tensionFilter = null;
    this.tensionGain = null;
  }

  playRelease(power: number): void {
    this.stopTension();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    const startFreq = 190 + power * 140;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.18);

    gain.gain.setValueAtTime(0.32 + power * 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.23);
  }

  updateWhoosh(active: boolean, speed: number): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) {
      if (this.whooshActive) this.stopWhoosh();
      return;
    }

    if (!active) {
      if (this.whooshActive) this.stopWhoosh();
      return;
    }

    const now = this.ctx.currentTime;
    const normSpeed = Math.max(0, Math.min(1, speed / 40));

    if (!this.whooshActive) {
      this.whooshActive = true;
      this.whooshNoise = this.ctx.createBufferSource();
      this.whooshNoise.buffer = this.noiseBuffer;
      this.whooshNoise.loop = true;

      this.whooshFilter = this.ctx.createBiquadFilter();
      this.whooshFilter.type = 'bandpass';
      this.whooshFilter.Q.value = 1.8;

      this.whooshGain = this.ctx.createGain();
      this.whooshGain.gain.setValueAtTime(0.001, now);

      this.whooshNoise.connect(this.whooshFilter);
      this.whooshFilter.connect(this.whooshGain);
      this.whooshGain.connect(this.masterGain);
      this.whooshNoise.start(now);
    }

    if (this.whooshFilter && this.whooshGain) {
      this.whooshFilter.frequency.setTargetAtTime(420 + normSpeed * 1400, now, 0.04);
      this.whooshGain.gain.setTargetAtTime(0.04 + normSpeed * 0.2, now, 0.04);
    }
  }

  stopWhoosh(): void {
    if (!this.whooshActive) return;
    this.whooshActive = false;
    const now = this.ctx?.currentTime ?? 0;
    try {
      this.whooshGain?.gain.setTargetAtTime(0.0001, now, 0.02);
      this.whooshNoise?.stop(now + 0.06);
    } catch {
      // Ignore
    }
    this.whooshNoise = null;
    this.whooshFilter = null;
    this.whooshGain = null;
  }

  playGroundImpact(): void {
    this.stopWhoosh();
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    // Short low thump
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);
    oscGain.gain.setValueAtTime(0.38, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.16);

    // Dirt burst
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(650, now);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.22, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.11);
  }

  playBodyImpact(isHeadshot: boolean): void {
    this.stopWhoosh();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    // Muffled flesh thump
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.16);
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);

    if (isHeadshot) {
      // Sharp high critical accent
      const accent = this.ctx.createOscillator();
      const accentGain = this.ctx.createGain();
      accent.type = 'sine';
      accent.frequency.setValueAtTime(880, now);
      accent.frequency.exponentialRampToValueAtTime(1320, now + 0.06);
      accentGain.gain.setValueAtTime(0.32, now);
      accentGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      accent.connect(accentGain);
      accentGain.connect(this.masterGain);
      accent.start(now);
      accent.stop(now + 0.29);
    }
  }
}
