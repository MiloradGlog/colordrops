// Level select: every level open from the start (GD model), difficulty label
// and personal best on each card, endless mode as the last card.

import type { Scene } from "../../engine/scene";
import type { Input } from "../../engine/input";
import type { SaveData } from "../../engine/save";
import type { Audio } from "../../engine/audio";
import { save } from "../../engine/save";
import { PALETTE } from "../config";
import { LEVELS, endlessConfig, type RunConfig } from "../levels";
import { strings } from "../../ui/strings";

const LABEL_COLOR: Record<string, string> = {
  Easy: "#2ecc71",
  Normal: "#29a8ff",
  Hard: "#ffb400",
  Harder: "#ff7a3d",
  Insane: "#ff5a5f",
  Endless: "#a66bff",
};

interface Card {
  x: number;
  y: number;
  w: number;
  h: number;
  cfg: RunConfig;
}

export class SelectScene implements Scene {
  constructor(
    private input: Input,
    private canvas: HTMLCanvasElement,
    private saveData: SaveData,
    private audio: Audio,
    private pick: (cfg: RunConfig) => void,
  ) {}

  private soundChip(): { x: number; y: number; r: number } {
    return { x: this.canvas.clientWidth - 34, y: 34, r: 18 };
  }

  private symbolsChip(): { x: number; y: number; r: number } {
    return { x: this.canvas.clientWidth - 80, y: 34, r: 18 };
  }

  update(): void {
    if (this.input.pointer.justReleased) {
      const { x, y } = this.input.pointer;
      const s = this.soundChip();
      if (Math.hypot(x - s.x, y - s.y) < s.r + 8) {
        this.saveData.settings.sound = !this.saveData.settings.sound;
        this.audio.muted = !this.saveData.settings.sound;
        save(this.saveData);
        this.input.endTick();
        return;
      }
      const sy = this.symbolsChip();
      if (Math.hypot(x - sy.x, y - sy.y) < sy.r + 8) {
        this.saveData.settings.symbols = this.saveData.settings.symbols !== true;
        save(this.saveData);
        this.input.endTick();
        return;
      }
      for (const c of this.cards()) {
        if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
          this.pick(c.cfg);
          break;
        }
      }
    }
    this.input.endTick();
  }

  private cards(): Card[] {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const pad = Math.max(12, w * 0.04);
    const top = h * 0.16;
    const cols = 2;
    const gap = pad * 0.6;
    const cw = (w - pad * 2 - gap) / cols;
    const rows = Math.ceil(LEVELS.length / cols);
    const ch = Math.min(74, (h * 0.66 - gap * (rows - 1)) / rows);
    const out: Card[] = [];
    LEVELS.forEach((cfg, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      out.push({ x: pad + col * (cw + gap), y: top + row * (ch + gap), w: cw, h: ch, cfg });
    });
    const ey = top + rows * (ch + gap) + gap * 0.5;
    out.push({ x: pad, y: ey, w: w - pad * 2, h: ch, cfg: endlessConfig(1) });
    return out;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.fillStyle = "#0b0b10";
    ctx.fillRect(0, 0, w, h);

    // wordmark: the game's own colors as a tiny pie dot over the title
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${Math.max(26, h * 0.042)}px system-ui, sans-serif`;
    ctx.fillText(strings.title, w / 2, h * 0.09);
    const r = Math.max(5, h * 0.009);
    const cx = w / 2;
    const cy = h * 0.115;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, (i / 4) * Math.PI * 2, ((i + 1) / 4) * Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i]!;
      ctx.fill();
    }

    const fs = Math.max(13, h * 0.018);
    for (const c of this.cards()) {
      ctx.fillStyle = "#17171f";
      roundRect(ctx, c.x, c.y, c.w, c.h, 10);
      ctx.fill();
      const accent = LABEL_COLOR[c.cfg.label] ?? "#888";
      ctx.fillStyle = accent;
      roundRect(ctx, c.x, c.y, 4, c.h, 2);
      ctx.fill();
      const pieR = Math.min(c.h * 0.32, 20);
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = `600 ${fs}px system-ui, sans-serif`;
      const name = c.cfg.id === "endless" ? "Endless" : c.cfg.name;
      ctx.fillText(name, c.x + 14, c.y + c.h * 0.42, c.w - pieR * 2 - 34);
      ctx.fillStyle = accent;
      ctx.font = `700 ${fs * 0.72}px system-ui, sans-serif`;
      ctx.fillText(c.cfg.label.toUpperCase(), c.x + 14, c.y + c.h * 0.75);
      // honest puzzle preview: levels are deterministic, so the target pie
      // on the card IS the level
      const pr = pieR;
      const px = c.x + c.w - pr - 12;
      const py = c.y + c.h / 2;
      if (c.cfg.id === "endless") {
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = `700 ${pr}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("?", px, py + pr * 0.36);
      } else {
        let acc = 0;
        c.cfg.targets.forEach((t, ti) => {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.arc(px, py, pr, acc * Math.PI * 2, (acc + t) * Math.PI * 2);
          ctx.closePath();
          ctx.fillStyle = PALETTE[ti % PALETTE.length]!;
          ctx.fill();
          acc += t;
        });
      }
      const best = this.saveData.progress.bestByLevel[c.cfg.id];
      if (best !== undefined) {
        ctx.textAlign = "right";
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = `500 ${fs * 0.72}px system-ui, sans-serif`;
        ctx.fillText(strings.best(best), px - pr - 10, c.y + c.h * 0.75);
      }
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = `500 ${Math.max(11, h * 0.014)}px system-ui, sans-serif`;
    ctx.fillText(strings.tagline, w / 2, h * 0.965);

    // sound toggle
    const s = this.soundChip();
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = `${s.r}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(this.saveData.settings.sound ? "🔊" : "🔇", s.x, s.y + s.r * 0.36);

    // colorblind-assist symbols toggle
    const sy = this.symbolsChip();
    const on = this.saveData.settings.symbols === true;
    ctx.beginPath();
    ctx.arc(sy.x, sy.y, sy.r, 0, Math.PI * 2);
    ctx.fillStyle = on ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.strokeStyle = on ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = `${sy.r * 0.9}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("◆", sy.x, sy.y + sy.r * 0.32);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
