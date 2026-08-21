// The boot screen, Instrument language (designer mock 4a): mono wordmark,
// a calm full pie, lifetime stats with hairline dividers, TAP TO PLAY,
// text-row toggles at the bottom. One tap from here to playing.

import type { Scene } from "../../engine/scene";
import type { Input } from "../../engine/input";
import type { SaveData } from "../../engine/save";
import type { Audio } from "../../engine/audio";
import { save } from "../../engine/save";
import { PALETTE, UI, setType } from "../config";
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

  update(dt: number): void {
    this.t += dt;
    if (this.input.pointer.justReleased) {
      const { x, y } = this.input.pointer;
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      if (y > h - 52) {
        // bottom strip: left half toggles sound, right half toggles symbols
        if (x < w / 2) {
          this.saveData.settings.sound = !this.saveData.settings.sound;
          this.audio.muted = !this.saveData.settings.sound;
        } else {
          this.saveData.settings.symbols = this.saveData.settings.symbols !== true;
        }
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
    ctx.fillStyle = UI.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";

    ctx.fillStyle = UI.text;
    setType(ctx, 600, 22, 6);
    ctx.fillText(strings.title, w / 2, h * 0.18);
    ctx.fillStyle = UI.muted;
    setType(ctx, 400, 9, 2);
    ctx.fillText(strings.subtitle, w / 2, h * 0.18 + 24);

    // the pie, breathing slowly — five muted inks, hairline border
    const cx = w / 2;
    const cy = h * 0.42;
    const r = Math.min(w, h) * 0.23;
    const th = this.t * 0.06;
    for (let i = 0; i < 5; i++) {
      const a0 = th + (i / 5) * TAU;
      const a1 = th + ((i + 1) / 5) * TAU;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i]!;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, TAU);
    ctx.strokeStyle = UI.hair(0.2);
    ctx.lineWidth = 1;
    ctx.stroke();

    // lifetime stats: BEST / BOARD / DROPS with hairline dividers
    const best = this.saveData.progress.bestByLevel["endless"];
    const stats: [string, string][] = [
      ["BEST", best === undefined ? "—" : String(best)],
      ["BOARD", String(this.saveData.progress.totalBoards ?? 0)],
      ["DROPS", String(this.saveData.progress.totalDrops ?? 0)],
    ];
    const sy = h * 0.61;
    const colW = 78;
    const x0 = cx - colW;
    stats.forEach(([label, value], i) => {
      const x = x0 + i * colW;
      ctx.fillStyle = UI.muted;
      setType(ctx, 400, 9, 1);
      ctx.fillText(label, x, sy);
      ctx.fillStyle = UI.text;
      setType(ctx, 600, 14, 0);
      ctx.fillText(value, x, sy + 20);
      if (i > 0) {
        ctx.beginPath();
        ctx.moveTo(x - colW / 2, sy - 10);
        ctx.lineTo(x - colW / 2, sy + 20);
        ctx.strokeStyle = UI.hair(0.12);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });

    const pulse = 0.6 + 0.4 * (0.5 + Math.sin(this.t * 2.4) / 2);
    ctx.fillStyle = UI.hair(pulse);
    setType(ctx, 600, 11, 5);
    ctx.fillText(strings.tapPlay, cx, h * 0.75);

    // bottom toggles (tap targets: left/right halves of the strip)
    ctx.fillStyle = UI.muted;
    setType(ctx, 400, 9, 1);
    const soundOn = this.saveData.settings.sound;
    const symOn = this.saveData.settings.symbols === true;
    ctx.fillText(`♪ SOUND ${soundOn ? "ON" : "OFF"}`, w * 0.28, h - 26);
    ctx.fillText(`◆ SYMBOLS ${symOn ? "ON" : "OFF"}`, w * 0.71, h - 26);
  }
}
