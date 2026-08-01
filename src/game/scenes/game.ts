// The game scene: orchestrates the relations from spec.md (sequencer→drop,
// drop→segment, segment→siblings, outer↔inner win check) and renders the
// wheel. Update mutates state; render only reads — one frame, one truth.

import type { Scene } from "../../engine/scene";
import type { Input } from "../../engine/input";
import type { SaveData } from "../../engine/save";
import { save } from "../../engine/save";
import { Rng } from "../../engine/rng";
import { PALETTE, par } from "../config";
import {
  boundaries,
  centers,
  idealExtents,
  drawnExtents,
  segmentAt,
  isAligned,
  mod1,
  type Extent,
} from "../wheel";
import { applyCatch, applyShrink } from "../behaviors/catch";
import { rotate, type Rotatable } from "../behaviors/rotate";
import {
  makeDrop,
  updateDrop,
  enter,
  stretch,
  TELEGRAPH_S,
  FORMING_S,
  type Drop,
} from "../drop";
import { pickColor } from "../scheduler";
import { endlessConfig, type RunConfig } from "../levels";
import { strings } from "../../ui/strings";

const TAU = Math.PI * 2;
const SNAP_PER_SEG = 0.09; // lock sequence: seconds per segment click
const MERGE_S = 0.45;
const INTRO_S = 2.6; // rule-change banner hold time

interface Ripple {
  t: number;
  colorIdx: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  colorIdx: number;
}

type Phase = "playing" | "locking" | "won";

export class GameScene implements Scene {
  autopilot = false;

  private cfg!: RunConfig;
  private targets!: number[];
  private shares!: number[];
  private displayShares!: number[];
  private cents!: number[];
  private bounds!: number[];
  private rng!: Rng;
  private seqIdx = 0;
  private endlessBoard = 1;
  private wheel: Rotatable;
  private phase: Phase = "playing";
  private drop: Drop | null = null;
  private fallthrough: Drop[] = [];
  private spawnTimer = 0;
  private caught = 0;
  private levelPar = 0;
  private age = 0;
  private lockT = 0;
  private lockStart: Extent[] = [];
  private pulses!: number[];
  private ripples: Ripple[] = [];
  private particles: Particle[] = [];
  private fxRng = new Rng(0xfeedface); // presentation-only randomness, still seeded
  private tapStart: { x: number; y: number } | null = null;
  private newBest = false;

  constructor(
    private input: Input,
    private canvas: HTMLCanvasElement,
    private saveData: SaveData,
    cfg: RunConfig,
    private onExit: () => void,
  ) {
    this.wheel = { theta: 0, omega: 0, radius: 100, input, locked: false };
    this.reset(cfg);
  }

  reset(cfg: RunConfig): void {
    this.cfg = cfg;
    const n = cfg.targets.length;
    this.targets = [...cfg.targets];
    this.shares = new Array(n).fill(1 / n);
    this.displayShares = [...this.shares];
    this.cents = centers(this.targets);
    this.bounds = boundaries(this.targets);
    this.rng = new Rng((cfg.seed ^ 0x9e3779b9) >>> 0);
    this.seqIdx = 0;
    this.levelPar = par(this.targets, 1 / n, cfg.growth);
    this.phase = "playing";
    this.wheel.theta = 0;
    this.wheel.omega = 0;
    this.wheel.locked = false;
    this.drop = null;
    this.fallthrough = [];
    this.spawnTimer = cfg.intervalS * 0.6; // first drop comes quickly
    this.caught = 0;
    this.age = 0;
    this.lockT = 0;
    this.pulses = new Array(n).fill(0);
    this.ripples = [];
    this.particles = [];
  }

  private n(): number {
    return this.targets.length;
  }

  update(dt: number): void {
    const L = this.layout();
    this.wheel.radius = L.outerR;
    this.age += dt;

    if (this.phase === "playing") {
      // back chip: a clean tap (not a drag) on the top-left chip exits
      if (this.input.pointer.justPressed) {
        this.tapStart = { x: this.input.pointer.x, y: this.input.pointer.y };
      }
      if (this.input.pointer.justReleased && this.tapStart) {
        const dx = this.input.pointer.x - this.tapStart.x;
        const dy = this.input.pointer.y - this.tapStart.y;
        const chip = this.backChip(L);
        if (dx * dx + dy * dy < 100 && Math.hypot(this.tapStart.x - chip.x, this.tapStart.y - chip.y) < chip.r + 8) {
          this.onExit();
          return;
        }
        this.tapStart = null;
      }
      if (this.autopilot) this.autoSteer();
      rotate.tick(this.wheel, dt);
      this.updateSpawning(dt, L);
    } else if (this.phase === "locking") {
      this.lockT += dt;
      if (this.lockT >= this.n() * SNAP_PER_SEG + MERGE_S) this.enterWon();
    } else if (this.phase === "won") {
      if (this.input.pointer.justPressed) {
        if (this.cfg.sequence === null) {
          this.endlessBoard++;
          this.reset(endlessConfig(this.endlessBoard));
        } else {
          this.onExit();
        }
      }
    }

    for (let i = 0; i < this.n(); i++) {
      const s = this.displayShares[i]!;
      this.displayShares[i] = s + (this.shares[i]! - s) * Math.min(1, dt * 10);
      this.pulses[i] = Math.max(0, this.pulses[i]! - dt * 3);
    }
    for (const d of this.fallthrough) updateDrop(d, dt, this.gravity(L), Infinity);
    this.fallthrough = this.fallthrough.filter((d) => d.y < L.h + 40);
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < 0.6);
    for (const p of this.particles) {
      p.t += dt;
      p.vy += 1800 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.t < 0.6);

    this.input.endTick();
  }

  /** Deterministic choreography for levels; seeded weighted RNG for endless. */
  private nextColor(): number {
    const seq = this.cfg.sequence;
    if (seq) return seq[this.seqIdx++ % seq.length]!;
    return pickColor(this.rng, this.targets, this.shares, this.cfg.epsilon);
  }

  private updateSpawning(dt: number, L: Layout): void {
    if (!this.drop) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.drop = makeDrop(this.nextColor(), Math.max(10, L.outerR * 0.09));
        this.spawnTimer = this.cfg.intervalS;
      }
      return;
    }
    const d = this.drop;
    const hitContact = updateDrop(d, dt, this.gravity(L), L.cy - L.outerR);
    if (hitContact) this.resolveContact(d, L);
    if (d.phase === "gone") this.drop = null;
  }

  private resolveContact(d: Drop, L: Layout): void {
    const topTurn = mod1((-Math.PI / 2 - this.wheel.theta) / TAU);
    const extents = drawnExtents(idealExtents(this.cents, this.shares));
    const idx = segmentAt(extents, topTurn);

    if (idx === -1) {
      // dark gap: the free dodge — slips through, touches nothing, costs nothing
      d.behind = true;
      enter(d, "missed");
      d.vy = Math.max(d.vy, 100);
      this.fallthrough.push(d);
      this.drop = null;
      return;
    }

    // every absorbed drop counts, correct or wrong (spec.md → scoring)
    this.caught++;
    this.ripples.push({ t: 0, colorIdx: d.colorIdx });
    enter(d, "absorbed");

    if (idx === d.colorIdx) {
      this.shares = applyCatch(this.shares, idx, this.cfg.growth);
      this.pulses[idx] = 1;
    } else if (this.cfg.wrongCatch === "shrinkDrop") {
      this.shares = applyShrink(this.shares, d.colorIdx, this.cfg.growth);
      this.spawnSplash(d, L); // shrink is loud: burst in the shrinking color
    } else if (this.cfg.wrongCatch === "shrinkSelf") {
      this.shares = applyShrink(this.shares, idx, this.cfg.growth);
      this.spawnSplash(d, L);
    }
    // wrongCatch "none": absorbed, counted, no physical effect

    if (isAligned(this.shares, this.targets, this.cfg.epsilon)) this.beginLock();
  }

  private beginLock(): void {
    this.phase = "locking";
    this.lockT = 0;
    this.wheel.locked = true;
    this.wheel.omega = 0;
    this.lockStart = drawnExtents(idealExtents(this.cents, this.shares));
    this.drop = null;
  }

  private enterWon(): void {
    this.phase = "won";
    const key = this.cfg.id;
    const prev = this.saveData.progress.bestByLevel[key];
    this.newBest = prev !== undefined && this.caught < prev;
    if (prev === undefined || this.caught < prev) {
      this.saveData.progress.bestByLevel[key] = this.caught;
    }
    save(this.saveData);
  }

  private backChip(L: Layout): { x: number; y: number; r: number } {
    return { x: 30, y: L.h * 0.045, r: 17 };
  }

  private spawnSplash(d: Drop, L: Layout): void {
    const y = L.cy - L.outerR - d.r * 0.4;
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (this.fxRng.next() - 0.5) * 2.2;
      const sp = 220 + this.fxRng.next() * 260;
      this.particles.push({
        x: L.cx + Math.cos(a) * 4,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        t: 0,
        colorIdx: d.colorIdx,
      });
    }
  }

  /**
   * Debug/verify autopilot. Per drop, in order of preference:
   * catch it if that helps alignment; weaponize a wrong catch when the
   * drop's color is overgrown (shrink tiers); otherwise dodge via the
   * widest gap; last resort, eat a harmless wrong catch.
   */
  private autoSteer(): void {
    const d = this.drop;
    if (!d || (d.phase !== "forming" && d.phase !== "falling")) return;
    const c = d.colorIdx;
    const maxDev = (s: readonly number[]): number =>
      Math.max(...s.map((v, i) => Math.abs(v - this.targets[i]!)));
    const g = this.cfg.growth;
    const improves = maxDev(applyCatch(this.shares, c, g)) < maxDev(this.shares);
    const stillNeeded = this.targets[c]! - this.shares[c]! >= g / 2;
    if (improves || stillNeeded) {
      this.parkTurn(this.cents[c]!);
      return;
    }
    if (this.cfg.wrongCatch === "shrinkDrop" && this.shares[c]! - this.targets[c]! >= g / 2) {
      this.parkWrong(c); // deliberate wrong catch shrinks the overgrown color
      return;
    }
    const gap = this.widestGap();
    if (gap !== null) this.parkTurn(gap);
    else this.parkWrong(c);
  }

  private parkTurn(turn: number): void {
    this.wheel.theta = -Math.PI / 2 - turn * TAU;
  }

  private parkWrong(dropColor: number): void {
    let widest = dropColor === 0 ? 1 : 0;
    for (let i = 0; i < this.n(); i++) {
      if (i !== dropColor && this.shares[i]! > this.shares[widest]!) widest = i;
    }
    this.parkTurn(this.cents[widest]!);
  }

  /** Center of the widest dark-gap arc in the outer ring, or null if none. */
  private widestGap(): number | null {
    const ext = drawnExtents(idealExtents(this.cents, this.shares));
    const edges = ext
      .filter((e) => e.end > e.start)
      .map((e) => ({ start: mod1(e.start), width: e.end - e.start }))
      .sort((a, b) => a.start - b.start);
    if (edges.length === 0) return null;
    let best: { center: number; width: number } | null = null;
    for (let i = 0; i < edges.length; i++) {
      const cur = edges[i]!;
      const next = edges[(i + 1) % edges.length]!;
      const curEnd = cur.start + cur.width;
      const nextStart = i + 1 < edges.length ? next.start : next.start + 1;
      const gapW = nextStart - curEnd;
      if (gapW > 0.015 && (best === null || gapW > best.width)) {
        best = { center: mod1(curEnd + gapW / 2), width: gapW };
      }
    }
    return best ? best.center : null;
  }

  /** Debug/verify only. */
  setTheta(rad: number): void {
    this.wheel.theta = rad;
  }

  debugState(): Record<string, unknown> {
    return {
      screen: "game",
      id: this.cfg.id,
      name: this.cfg.name,
      wrongCatch: this.cfg.wrongCatch,
      phase: this.phase,
      targets: [...this.targets],
      shares: [...this.shares],
      centers: [...this.cents],
      widestGap: this.widestGap(),
      theta: this.wheel.theta,
      caught: this.caught,
      par: this.levelPar,
      drop: this.drop ? { color: this.drop.colorIdx, phase: this.drop.phase } : null,
    };
  }

  private gravity(L: Layout): number {
    return this.cfg.gravity * (L.h / 800);
  }

  private layout(): Layout {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const outerR = Math.min(w, h * 0.62) * 0.4;
    return { w, h, cx: w / 2, cy: h * 0.62, outerR, ringW: outerR * 0.24 };
  }

  // ————————————————————————— render —————————————————————————

  render(ctx: CanvasRenderingContext2D): void {
    const L = this.layout();
    this.drawBackground(ctx, L);
    for (const d of this.fallthrough) this.drawDropShape(ctx, L, d, 0.35);
    this.drawWheel(ctx, L);
    this.drawRipples(ctx, L);
    if (this.drop) this.drawDrop(ctx, L, this.drop);
    this.drawParticles(ctx);
    this.drawHud(ctx, L);
    if (this.phase === "won") this.drawWon(ctx, L);
  }

  private drawBackground(ctx: CanvasRenderingContext2D, L: Layout): void {
    ctx.fillStyle = "#0b0b10";
    ctx.fillRect(0, 0, L.w, L.h);
    const g = ctx.createRadialGradient(L.cx, L.cy, L.outerR * 0.2, L.cx, L.cy, L.h * 0.9);
    g.addColorStop(0, "rgba(60,60,90,0.18)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L.w, L.h);
  }

  private currentExtents(): Extent[] {
    if (this.phase === "playing") {
      return drawnExtents(idealExtents(this.cents, this.displayShares));
    }
    // locking/won: segments click into their exact target extents one by one
    const out: Extent[] = [];
    for (let i = 0; i < this.n(); i++) {
      const from = this.lockStart[i] ?? { start: this.bounds[i]!, end: this.bounds[i + 1]! };
      const to = { start: this.bounds[i]!, end: this.bounds[i + 1]! };
      const t = clamp01((this.lockT - i * SNAP_PER_SEG) / SNAP_PER_SEG);
      const e = easeOutBack(t);
      out.push({
        start: from.start + (to.start - from.start) * e,
        end: from.end + (to.end - from.end) * e,
      });
    }
    return out;
  }

  private drawWheel(ctx: CanvasRenderingContext2D, L: Layout): void {
    const { cx, cy, outerR, ringW } = L;
    const th = this.wheel.theta;
    const mergeT =
      this.phase === "playing" ? 0 : clamp01((this.lockT - this.n() * SNAP_PER_SEG) / MERGE_S);
    const discR = outerR - ringW - Math.max(2, outerR * 0.035) * (1 - mergeT);
    const innerRingR = outerR - ringW;

    // ring background track
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, TAU);
    ctx.arc(cx, cy, innerRingR, 0, TAU, true);
    ctx.fillStyle = "#17171f";
    ctx.fill();

    // outer segments (current shares, center-anchored)
    const extents = this.currentExtents();
    for (let i = 0; i < this.n(); i++) {
      const e = extents[i]!;
      if (e.end - e.start <= 0) continue;
      const pulse = this.pulses[i]! * Math.max(2, outerR * 0.03);
      const a0 = th + e.start * TAU;
      const a1 = th + e.end * TAU;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR + pulse, a0, a1);
      ctx.arc(cx, cy, innerRingR - pulse * 0.4, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i % PALETTE.length]!;
      ctx.fill();
      // within-tolerance feedback: a bright rim on segments already aligned
      if (
        this.phase === "playing" &&
        Math.abs(this.shares[i]! - this.targets[i]!) <= this.cfg.epsilon
      ) {
        ctx.beginPath();
        ctx.arc(cx, cy, outerR + pulse + 2.5, a0 + 0.02, a1 - 0.02);
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.lineCap = "butt";
      }
    }

    // lock flash per just-snapped segment
    if (this.phase !== "playing") {
      for (let i = 0; i < this.n(); i++) {
        const since = this.lockT - (i + 1) * SNAP_PER_SEG;
        if (since > 0 && since < 0.15) {
          const a0 = th + this.bounds[i]! * TAU;
          const a1 = th + this.bounds[i + 1]! * TAU;
          ctx.beginPath();
          ctx.arc(cx, cy, outerR + 3, a0, a1);
          ctx.strokeStyle = `rgba(255,255,255,${(1 - since / 0.15) * 0.9})`;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
    }

    // inner disc: the target pie (merges outward at the end)
    const pieR = discR + (outerR - discR) * mergeT;
    for (let i = 0; i < this.n(); i++) {
      const a0 = th + this.bounds[i]! * TAU;
      const a1 = th + this.bounds[i + 1]! * TAU;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, pieR, a0, a1);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i % PALETTE.length]!;
      ctx.fill();
    }
    // subtle separation so target boundaries stay readable
    ctx.beginPath();
    ctx.arc(cx, cy, pieR, 0, TAU);
    ctx.strokeStyle = "rgba(11,11,16,0.9)";
    ctx.lineWidth = Math.max(1.5, outerR * 0.015);
    ctx.stroke();
    // hairline spokes between target slices — boundaries are the goal posts
    ctx.strokeStyle = "rgba(11,11,16,0.8)";
    ctx.lineWidth = Math.max(1.2, outerR * 0.012);
    for (let i = 0; i < this.n(); i++) {
      const a = th + this.bounds[i]! * TAU;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * pieR, cy + Math.sin(a) * pieR);
      ctx.stroke();
    }

    // catch point marker
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - outerR - 12);
    ctx.lineTo(cx + 7, cy - outerR - 12);
    ctx.lineTo(cx, cy - outerR - 4);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fill();
  }

  private drawRipples(ctx: CanvasRenderingContext2D, L: Layout): void {
    for (const r of this.ripples) {
      const t = r.t / 0.6;
      ctx.beginPath();
      ctx.arc(L.cx, L.cy - L.outerR, 8 + t * 46, 0, TAU);
      ctx.strokeStyle = hexA(PALETTE[r.colorIdx % PALETTE.length]!, (1 - t) * 0.8);
      ctx.lineWidth = 2.5 * (1 - t) + 0.5;
      ctx.stroke();
    }
  }

  private drawDrop(ctx: CanvasRenderingContext2D, L: Layout, d: Drop): void {
    const color = PALETTE[d.colorIdx % PALETTE.length]!;
    if (d.phase === "telegraph" || d.phase === "forming") {
      // top border becomes the next color, then gathers to center into a droplet
      const tt = d.phase === "telegraph" ? d.t / TELEGRAPH_S : 1;
      const ft = d.phase === "forming" ? d.t / FORMING_S : 0;
      const barHalf = (L.w / 2) * (1 - ft);
      const barH = Math.max(7, L.h * 0.011);
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = hexA(color, 0.35 + 0.55 * tt);
      ctx.fillRect(L.cx - barHalf, 0, barHalf * 2, barH);
      ctx.restore();
      if (d.phase === "forming") {
        // droplet swells and sags from the top edge — surface tension pose
        const r = d.r * (0.25 + 0.75 * ft);
        const sag = r * (0.5 + 0.9 * ft * ft);
        ctx.beginPath();
        ctx.ellipse(L.cx, sag + r * 0.2, r * (1 - 0.18 * ft), r * (1 + 0.22 * ft), 0, 0, TAU);
        ctx.fillStyle = color;
        ctx.fill();
      }
      return;
    }
    if (d.phase === "falling") this.drawDropShape(ctx, L, d, 1);
    if (d.phase === "absorbed") {
      const t = d.t / 0.4;
      ctx.beginPath();
      ctx.arc(L.cx, L.cy - L.outerR, d.r * (1 - t), 0, TAU);
      ctx.fillStyle = hexA(color, 1 - t);
      ctx.fill();
    }
  }

  private drawDropShape(ctx: CanvasRenderingContext2D, L: Layout, d: Drop, alpha: number): void {
    const color = PALETTE[d.colorIdx % PALETTE.length]!;
    const { sx, sy } = stretch(d);
    const wobble = Math.sin(d.t * 21) * d.r * 0.06;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.ellipse(L.cx + wobble, d.y, d.r * sx, d.r * sy, 0, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const t = p.t / 0.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * (1 - t) + 0.5, 0, TAU);
      ctx.fillStyle = hexA(PALETTE[p.colorIdx % PALETTE.length]!, 1 - t);
      ctx.fill();
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, L: Layout): void {
    const fs = Math.max(13, L.h * 0.019);
    // back chip
    const chip = this.backChip(L);
    ctx.beginPath();
    ctx.arc(chip.x, chip.y, chip.r, 0, TAU);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = `600 ${fs * 1.2}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("‹", chip.x - 1, chip.y + fs * 0.42);

    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(this.cfg.name, chip.x + chip.r + 12, L.h * 0.05);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText(this.cfg.label.toUpperCase(), chip.x + chip.r + 12, L.h * 0.05 + fs * 1.3);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.textAlign = "right";
    ctx.fillText(`${strings.drops(this.caught)} · ${strings.par(this.levelPar)}`, L.w - 16, L.h * 0.05);
    let alignedCount = 0;
    for (let i = 0; i < this.n(); i++) {
      if (Math.abs(this.shares[i]! - this.targets[i]!) <= this.cfg.epsilon) alignedCount++;
    }
    ctx.fillStyle = alignedCount === this.n() ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.45)";
    ctx.fillText(strings.aligned(alignedCount, this.n()), L.w - 16, L.h * 0.05 + fs * 1.3);
    // teaching hint until the first catch
    if (this.cfg.hint && this.caught === 0 && this.phase === "playing") {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = `500 ${Math.max(12, L.h * 0.016)}px system-ui, sans-serif`;
      ctx.fillText(this.cfg.hint, L.cx, L.h * 0.93);
    }
    // rule-change banner
    if (this.cfg.intro && this.age < INTRO_S && this.phase === "playing") {
      const a = this.age < INTRO_S - 0.5 ? 1 : (INTRO_S - this.age) / 0.5;
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(255,255,255,${0.95 * a})`;
      ctx.font = `800 ${Math.max(20, L.h * 0.03)}px system-ui, sans-serif`;
      ctx.fillText(this.cfg.intro, L.cx, L.h * 0.22);
    }
  }

  private drawWon(ctx: CanvasRenderingContext2D, L: Layout): void {
    ctx.fillStyle = "rgba(11,11,16,0.55)";
    ctx.fillRect(0, 0, L.w, L.h);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${Math.max(28, L.h * 0.05)}px system-ui, sans-serif`;
    ctx.fillText(strings.locked, L.cx, L.h * 0.3);
    ctx.font = `500 ${Math.max(16, L.h * 0.024)}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(strings.result(this.caught, this.levelPar), L.cx, L.h * 0.3 + 36);
    let y = L.h * 0.3 + 68;
    if (this.newBest) {
      const wob = 1 + Math.sin(this.age * 6) * 0.06;
      ctx.save();
      ctx.translate(L.cx, y);
      ctx.scale(wob, wob);
      ctx.fillStyle = "#ffe14d";
      ctx.font = `800 ${Math.max(18, L.h * 0.028)}px system-ui, sans-serif`;
      ctx.fillText(strings.newBest, 0, 0);
      ctx.restore();
      y += 36;
    } else {
      const best = this.saveData.progress.bestByLevel[this.cfg.id];
      if (best !== undefined) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillText(strings.best(best), L.cx, y);
        y += 32;
      }
    }
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(this.cfg.sequence === null ? strings.tapNextBoard : strings.tapSelect, L.cx, y);
  }
}

interface Layout {
  w: number;
  h: number;
  cx: number;
  cy: number;
  outerR: number;
  ringW: number;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function easeOutBack(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c = 1.70158;
  const u = t - 1;
  return 1 + u * u * ((c + 1) * u + c);
}

function hexA(hex: string, alpha: number): string {
  const a = Math.round(clamp01(alpha) * 255)
    .toString(16)
    .padStart(2, "0");
  return hex + a;
}
