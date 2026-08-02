// Universal audio, ColorFall flavor: a tiny procedural WebAudio synth —
// zero asset files, every sfx generated. Context unlocks on first gesture
// (mobile autoplay rules); mute persists via save settings.

export class Audio {
  private ctx: AudioContext | null = null;
  muted = false;

  constructor() {
    const unlock = (): void => {
      if (!this.ctx) this.ctx = new AudioContext();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    delay = 0,
  ): void {
    if (this.muted || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  /** Correct catch — pitch ramps a semitone per consecutive catch. */
  blip(streak: number): void {
    const f = 440 * Math.pow(2, Math.min(streak, 12) / 12);
    this.tone(f, 0.12, "triangle", 0.22);
    this.tone(f * 2, 0.08, "sine", 0.1);
  }

  /** Harmless wrong catch (teaching tier). */
  plop(): void {
    this.tone(220, 0.1, "sine", 0.14);
  }

  /** Shrink-tier wrong catch — something was lost. */
  thud(): void {
    this.tone(110, 0.22, "sawtooth", 0.2);
    this.tone(70, 0.28, "sine", 0.24);
  }

  /** One mechanical click per segment locking into place. */
  click(i: number): void {
    this.tone(700 + i * 90, 0.05, "square", 0.14);
  }

  /** The fuse: a small rising major chord. */
  chord(): void {
    [523.25, 659.25, 784].forEach((f, i) => this.tone(f, 0.5, "triangle", 0.16, i * 0.06));
  }
}
