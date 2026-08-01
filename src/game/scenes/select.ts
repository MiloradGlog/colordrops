// Level select: every level open from the start (GD model), difficulty label
// and personal best on each card, endless mode as the last card.

import type { Scene } from "../../engine/scene";
import type { Input } from "../../engine/input";
import type { SaveData } from "../../engine/save";
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
    private pick: (cfg: RunConfig) => void,
  ) {}

  update(): void {
    if (this.input.pointer.justReleased) {
      const { x, y } = this.input.pointer;
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
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = `600 ${fs}px system-ui, sans-serif`;
      const name = c.cfg.id === "endless" ? "Endless" : c.cfg.name;
      ctx.fillText(name, c.x + 14, c.y + c.h * 0.42, c.w - 28);
      ctx.fillStyle = accent;
      ctx.font = `700 ${fs * 0.72}px system-ui, sans-serif`;
      ctx.fillText(c.cfg.label.toUpperCase(), c.x + 14, c.y + c.h * 0.75);
      const best = this.saveData.progress.bestByLevel[c.cfg.id];
      if (best !== undefined) {
        ctx.textAlign = "right";
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = `500 ${fs * 0.72}px system-ui, sans-serif`;
        ctx.fillText(strings.best(best), c.x + c.w - 10, c.y + c.h * 0.75);
      }
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = `500 ${Math.max(11, h * 0.014)}px system-ui, sans-serif`;
    ctx.fillText(strings.tagline, w / 2, h * 0.965);
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
