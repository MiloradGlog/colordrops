// Universal audio: WebAudio mixer, decode-on-first-gesture (mobile autoplay
// rules), sfx pool + optional music channel. Same API in every game.

export class Audio {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, string>(); // name → url, until unlocked
  muted = false;

  constructor() {
    const unlock = () => {
      if (this.ctx) return;
      this.ctx = new AudioContext();
      for (const [name, url] of this.pending) void this.decode(name, url);
      this.pending.clear();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
  }

  register(name: string, url: string): void {
    if (this.ctx) void this.decode(name, url);
    else this.pending.set(name, url);
  }

  play(name: string, opts: { pitchVar?: number; gain?: number } = {}): void {
    if (this.muted || !this.ctx) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    // slight pitch variance stops repeated sfx from grating
    const v = opts.pitchVar ?? 0.06;
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * v; // presentation only — not sim state
    const gain = this.ctx.createGain();
    gain.gain.value = opts.gain ?? 1;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }

  private async decode(name: string, url: string): Promise<void> {
    try {
      const res = await fetch(url);
      const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(name, buf);
    } catch {
      // a missing sfx should never take the game down
    }
  }
}
