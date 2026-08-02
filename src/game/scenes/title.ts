// v3 endless-first: the boot screen. One tap from here to playing — no
// level grid (the handcrafted levels stay in the codebase for a later
// update). Wordmark, animated logo wheel, best score, sound/symbols chips.

import type { Scene } from "../../engine/scene";
import type { Input } from "../../engine/input";
import type { SaveData } from "../../engine/save";
import type { Audio } from "../../engine/audio";
import { save } from "../../engine/save";
import { PALETTE } from "../config";
import { strings } from "../../ui/strings";

const TAU = Math.PI * 2;

export class TitleScene implements Scene {
  private t = 0;

  constructor(
    private input: Input,
    private canvas: HTMLCanvasElement,
    private saveData: SaveData,
    private audio: Audio,
    private onPlay: () => void,
  ) {}

  private soundChip(): { x: number; y: number; r: number } {
    return { x: this.canvas.clientWidth - 34, y: 34, r: 18 };
  }

  private symbolsChip(): { x: number; y: number; r: number } {
    return { x: this.canvas.clientWidth - 80, y: 34, r: 18 };
  }

  update(dt: number): void {
    this.t += dt;
    if (this.input.pointer.justReleased) {
      const { x, y } = this.input.pointer;
      const s = this.soundChip();
      const sy = this.symbolsChip();
      if (Math.hypot(x - s.x, y - s.y) < s.r + 8) {
        this.saveData.settings.sound = !this.saveData.settings.sound;
        this.audio.muted = !this.saveData.settings.sound;
        save(this.saveData);
      } else if (Math.hypot(x - sy.x, y - sy.y) < sy.r + 8) {
        this.saveData.settings.symbols = this.saveData.settings.symbols !== true;
        save(this.saveData);
      } else {
        this.onPlay();
      }
    }
    this.input.endTick();
  }

  render(ctx: CanvasRenderingContext2D): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.fillStyle = "#0b0b10";
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h * 0.45, 20, w / 2, h * 0.45, h * 0.8);
    g.addColorStop(0, "rgba(60,60,90,0.18)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // logo: slowly turning pie, droplet bobbing above it
    const cx = w / 2;
    const cy = h * 0.42;
    const r = Math.min(w, h) * 0.16;
    const th = this.t * 0.25;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, th + (i / 5) * TAU, th + ((i + 1) / 5) * TAU);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i]!;
      ctx.fill();
    }
    const bob = Math.sin(this.t * 2.2) * r * 0.08;
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 1.45 + bob, r * 0.16, r * 0.2, 0, 0, TAU);
    ctx.fillStyle = PALETTE[0]!;
    ctx.shadowColor = PALETTE[0]!;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${Math.max(30, h * 0.05)}px system-ui, sans-serif`;
    ctx.fillText(strings.title, cx, h * 0.2);

    const pulse = 0.55 + 0.35 * (0.5 + Math.sin(this.t * 3) / 2);
    ctx.fillStyle = `rgba(255,255,255,${pulse})`;
    ctx.font = `600 ${Math.max(17, h * 0.026)}px system-ui, sans-serif`;
    ctx.fillText(strings.tapPlay, cx, h * 0.68);

    const best = this.saveData.progress.bestByLevel["endless"];
    if (best !== undefined) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `500 ${Math.max(14, h * 0.02)}px system-ui, sans-serif`;
      ctx.fillText(strings.bestBoard(best), cx, h * 0.74);
    }

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = `500 ${Math.max(11, h * 0.014)}px system-ui, sans-serif`;
    ctx.fillText(strings.tagline, cx, h * 0.965);

    // chips (sound + symbols)
    const s = this.soundChip();
    const sy = this.symbolsChip();
    for (const [chip, on, glyph] of [
      [s, this.saveData.settings.sound, this.saveData.settings.sound ? "🔊" : "🔇"],
      [sy, this.saveData.settings.symbols === true, "◆"],
    ] as const) {
      ctx.beginPath();
      ctx.arc(chip.x, chip.y, chip.r, 0, TAU);
      ctx.fillStyle = on ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)";
      ctx.fill();
      ctx.strokeStyle = on ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = `${chip.r * 0.9}px system-ui, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(glyph, chip.x, chip.y + chip.r * 0.32);
    }
  }
}
