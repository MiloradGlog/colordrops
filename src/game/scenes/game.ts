// The game scene: orchestrates the relations from spec.md (sequencer→drop,
// drop→segment, segment→siblings, outer↔inner win check) and renders the
// wheel. Update mutates state; render only reads — one frame, one truth.

import type { Scene } from "../../engine/scene";
import type { Input } from "../../engine/input";
import type { SaveData } from "../../engine/save";
import type { Audio } from "../../engine/audio";
import { save } from "../../engine/save";
import { ads } from "../../engine/ads";
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
// OS-level "less motion please": no shake, no hit-stop, no spring overshoot
const REDUCED_MOTION =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

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
  private streak = 0;
  private hitStop = 0;
  private shake = 0;
  private shareVel!: number[];
  private boardsCleared = 0;
  private sessionSpawns = 0; // never reset between boards — drives the ramp
  private trail: { y: number; age: number }[] = [];
  private lockClicks = 0;
  private chordPlayed = false;
  private prevDropPhase: string | null = null;
  private recoilT = 0; // surface-tension recoil in the bar after pinch-off

  constructor(
    private input: Input,
    private canvas: HTMLCanvasElement,
    private saveData: SaveData,
    private audio: Audio,
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
    this.shareVel = new Array(n).fill(0);
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
    this.streak = 0;
    this.hitStop = 0;
    this.shake = 0;
    this.trail = [];
    this.lockClicks = 0;
    this.chordPlayed = false;
  }

  private n(): number {
    return this.targets.length;
  }

  update(dt: number): void {
    const L = this.layout();
    this.wheel.radius = L.outerR;
    this.age += dt;
    // hit-stop: the world freezes for a beat on a correct catch; effects keep moving
    const wdt = this.hitStop > 0 ? 0 : dt;
    this.hitStop = Math.max(0, this.hitStop - dt);
    this.shake = Math.max(0, this.shake - dt * 3.5);

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
      this.updateSpawning(wdt, L);
      // pinch-off moment: satellite droplet + recoil bead in the bar
      if (this.prevDropPhase === "forming" && this.drop?.phase === "falling") {
        this.recoilT = 0.3;
        const d = this.drop;
        this.particles.push({
          x: L.cx + (this.fxRng.next() - 0.5) * 3,
          y: d.y - d.r * 1.1,
          vx: (this.fxRng.next() - 0.5) * 30,
          vy: 60,
          t: 0.25, // shorter life than a splash particle
          colorIdx: d.colorIdx,
        });
      }
      this.prevDropPhase = this.drop ? this.drop.phase : null;
      this.recoilT = Math.max(0, this.recoilT - dt);
      if (this.drop?.phase === "falling") {
        this.trail.push({ y: this.drop.y, age: 0 });
      }
      for (const t of this.trail) t.age += dt;
      this.trail = this.trail.filter((t) => t.age < 0.16);
    } else if (this.phase === "locking") {
      this.lockT += dt;
      const due = Math.min(this.n(), Math.floor(this.lockT / SNAP_PER_SEG));
      while (this.lockClicks < due) this.audio.click(this.lockClicks++);
      if (!this.chordPlayed && this.lockT >= this.n() * SNAP_PER_SEG) {
        this.chordPlayed = true;
        this.audio.chord();
      }
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
      // underdamped spring toward the logical share — the overshoot is the
      // liquid feel (segments slosh into their new size, don't just ease)
      const x = this.displayShares[i]!;
      const v = this.shareVel[i]!;
      const damping = REDUCED_MOTION ? 22 : 12; // overdamped kills the wobble
      const acc = (this.shares[i]! - x) * 90 - v * damping;
      this.shareVel[i] = v + acc * dt;
      this.displayShares[i] = x + this.shareVel[i]! * dt;
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

  /**
   * Endless ramp — the one thing that changes as a session goes on: drops
   * come more and more frequently. Fast early, flattening toward a floor.
   * Handcrafted levels keep their fixed cadence (determinism is sacred).
   */
  private effectiveInterval(): number {
    if (this.cfg.sequence !== null) return this.cfg.intervalS;
    return Math.max(0.9, this.cfg.intervalS - 0.35 * Math.log2(1 + this.sessionSpawns / 4));
  }

  private updateSpawning(dt: number, L: Layout): void {
    if (!this.drop) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.drop = makeDrop(this.nextColor(), Math.max(10, L.outerR * 0.09));
        this.sessionSpawns++;
        this.spawnTimer = this.effectiveInterval();
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
      this.streak++;
      this.audio.blip(this.streak);
      this.spawnRimSplash(d, L);
      if (!REDUCED_MOTION) this.hitStop = 0.05;
    } else if (this.cfg.wrongCatch === "shrinkDrop") {
      this.shares = applyShrink(this.shares, d.colorIdx, this.cfg.growth);
      this.spawnSplash(d, L); // shrink is loud: burst in the shrinking color
      this.streak = 0;
      this.audio.thud();
      if (!REDUCED_MOTION) this.shake = 1;
    } else if (this.cfg.wrongCatch === "shrinkSelf") {
      this.shares = applyShrink(this.shares, idx, this.cfg.growth);
      this.spawnSplash(d, L);
      this.streak = 0;
      this.audio.thud();
      if (!REDUCED_MOTION) this.shake = 1;
    } else {
      // wrongCatch "none": absorbed, counted, no physical effect
      this.streak = 0;
      this.audio.plop();
    }

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
    if (this.cfg.sequence === null) this.boardsCleared++;
    // interstitial slot at a natural break, every 3rd completion (boards too)
    const done = (this.saveData.progress.completions ?? 0) + 1;
    this.saveData.progress.completions = done;
    if (done % 3 === 0) void ads.interstitial();
    save(this.saveData);
  }

  private backChip(L: Layout): { x: number; y: number; r: number } {
    return { x: 30, y: L.h * 0.045, r: 17 };
  }

  /** Correct catch: liquid spreads along the rim — tangent splash, not a burst. */
  private spawnRimSplash(d: Drop, L: Layout): void {
    const y = L.cy - L.outerR - 2;
    for (let i = 0; i < 6; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const sp = 90 + this.fxRng.next() * 130;
      this.particles.push({
        x: L.cx + dir * (2 + this.fxRng.next() * 5),
        y,
        vx: dir * sp,
        vy: -30 - this.fxRng.next() * 60,
        t: 0.15,
        colorIdx: d.colorIdx,
      });
    }
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
    if (this.cfg.wrongCatch === "shrinkSelf") {
      // weaponize: park an overgrown color under the drop — the catcher shrinks
      let over = -1;
      for (let i = 0; i < this.n(); i++) {
        if (i !== c && this.shares[i]! - this.targets[i]! >= g / 2) {
          if (over === -1 || this.shares[i]! - this.targets[i]! > this.shares[over]! - this.targets[over]!) over = i;
        }
      }
      if (over !== -1) {
        this.parkTurn(this.cents[over]!);
        return;
      }
    }
    const gap = this.widestGap();
    if (gap !== null) this.parkTurn(gap);
    else this.parkLeastHarm(c);
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

  /** No gap available: absorb with the color that suffers least from it. */
  private parkLeastHarm(dropColor: number): void {
    if (this.cfg.wrongCatch !== "shrinkSelf") {
      this.parkWrong(dropColor);
      return;
    }
    let best = dropColor === 0 ? 1 : 0;
    for (let i = 0; i < this.n(); i++) {
      if (i === dropColor) continue;
      if (this.shares[i]! - this.targets[i]! > this.shares[best]! - this.targets[best]!) best = i;
    }
    this.parkTurn(this.cents[best]!);
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
      sessionSpawns: this.sessionSpawns,
      effectiveInterval: this.effectiveInterval(),
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
    ctx.save();
    if (this.shake > 0) {
      const m = this.shake * this.shake * 5;
      ctx.translate((this.fxRng.next() - 0.5) * m, (this.fxRng.next() - 0.5) * m);
    }
    this.drawBackground(ctx, L);
    for (const d of this.fallthrough) this.drawDropShape(ctx, L, d, 0.35);
    this.drawWheel(ctx, L);
    this.drawRipples(ctx, L);
    this.drawTrail(ctx, L);
    if (this.drop) this.drawDrop(ctx, L, this.drop);
    this.drawParticles(ctx);
    this.drawHud(ctx, L);
    if (this.phase === "won") this.drawWon(ctx, L);
    ctx.restore();
  }

  private drawTrail(ctx: CanvasRenderingContext2D, L: Layout): void {
    if (!this.drop || this.drop.phase !== "falling") return;
    const color = PALETTE[this.drop.colorIdx % PALETTE.length]!;
    for (const t of this.trail) {
      const a = 1 - t.age / 0.16;
      ctx.beginPath();
      ctx.arc(L.cx, t.y, this.drop.r * 0.55 * a, 0, TAU);
      ctx.fillStyle = hexA(color, a * 0.25);
      ctx.fill();
    }
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
      // colorblind assist: a distinct shape per color, hue-independent
      if (this.symbolsOn() && (e.end - e.start) * TAU * outerR > ringW * 0.9) {
        const mid = th + ((e.start + e.end) / 2) * TAU;
        const gr = (outerR + innerRingR) / 2;
        drawGlyph(ctx, i, cx + Math.cos(mid) * gr, cy + Math.sin(mid) * gr, ringW * 0.24, "rgba(11,11,16,0.65)");
      }
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
    if (this.symbolsOn()) {
      for (let i = 0; i < this.n(); i++) {
        if (this.targets[i]! < 0.05) continue;
        const mid = th + ((this.bounds[i]! + this.bounds[i + 1]!) / 2) * TAU;
        const gr = pieR * 0.62;
        drawGlyph(ctx, i, cx + Math.cos(mid) * gr, cy + Math.sin(mid) * gr, pieR * 0.075, "rgba(11,11,16,0.65)");
      }
    }
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

    // catch point marker — tinted with the incoming drop's color for clarity
    const d = this.drop;
    const active = d && (d.phase === "telegraph" || d.phase === "forming" || d.phase === "falling");
    ctx.save();
    if (active) {
      ctx.shadowColor = PALETTE[d.colorIdx % PALETTE.length]!;
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - outerR - 12);
    ctx.lineTo(cx + 7, cy - outerR - 12);
    ctx.lineTo(cx, cy - outerR - 4);
    ctx.closePath();
    ctx.fillStyle = active
      ? hexA(PALETTE[d.colorIdx % PALETTE.length]!, 0.95)
      : "rgba(255,255,255,0.65)";
    ctx.fill();
    ctx.restore();
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
      this.drawDropBirth(ctx, L, d, color);
      return;
    }
    if (d.phase === "falling") {
      // surface-tension recoil: the bar's remnant bead springs back and fades
      if (this.recoilT > 0) {
        const rt = this.recoilT / 0.3;
        ctx.beginPath();
        ctx.ellipse(L.cx, 2, d.r * 0.5 * rt, d.r * 0.35 * rt, 0, 0, Math.PI, false);
        ctx.fillStyle = hexA(color, 0.6 * rt);
        ctx.fill();
      }
      // clarity: faint dotted guide from the drop to the catch point
      ctx.save();
      ctx.strokeStyle = hexA(color, 0.18);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 8]);
      ctx.beginPath();
      ctx.moveTo(L.cx, d.y + d.r);
      ctx.lineTo(L.cx, L.cy - L.outerR - 6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      this.drawDropShape(ctx, L, d, 1);
    }
    if (d.phase === "absorbed") {
      const t = d.t / 0.4;
      ctx.beginPath();
      ctx.arc(L.cx, L.cy - L.outerR, d.r * (1 - t), 0, TAU);
      ctx.fillStyle = hexA(color, 1 - t);
      ctx.fill();
    }
  }

  /**
   * The birth of a drop, drawn like liquid: the tinted bar drains toward
   * center, its volume flowing into a pendant bead that swells (∛ growth —
   * volume-true), sags, thins into a neck, and pinches off. The bar keeps a
   * shrinking recoil bead for a beat after detach.
   */
  private drawDropBirth(ctx: CanvasRenderingContext2D, L: Layout, d: Drop, color: string): void {
    const tt = d.phase === "telegraph" ? d.t / TELEGRAPH_S : 1;
    const ft = d.phase === "forming" ? easeInOut(d.t / FORMING_S) : 0;
    const barH = Math.max(7, L.h * 0.011);
    const barHalf = (L.w / 2) * (1 - ft * 0.96);

    // ink wash: the border becomes the color (meniscus gradient, soft glow)
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    const grad = ctx.createLinearGradient(0, 0, 0, barH);
    grad.addColorStop(0, hexA(color, 0.35 + 0.55 * tt));
    grad.addColorStop(1, hexA(color, 0.55 + 0.45 * tt));
    ctx.fillStyle = grad;
    ctx.fillRect(L.cx - barHalf, 0, barHalf * 2, barH);
    ctx.restore();
    if (d.phase === "telegraph") return;

    // pendant bead: radius grows with the cube root of drained volume
    const R = d.r;
    const r = R * (0.3 + 0.7 * Math.cbrt(ft));
    const sag = barH + r * 0.4 + R * 1.5 * ft * ft; // sphere center y
    // neck: wide meniscus → thin thread → pinch
    const pinchT = 0.84;
    const neckF =
      ft < pinchT ? 1 - (ft / pinchT) * 0.8 : Math.max(0, 1 - (ft - pinchT) / (1 - pinchT)) * 0.2;
    const neckW = r * 0.6 * neckF;

    ctx.fillStyle = color;
    if (neckW > 0.5) {
      ctx.beginPath();
      ctx.moveTo(L.cx - neckW, barH * 0.4);
      ctx.bezierCurveTo(
        L.cx - neckW * 0.9,
        sag - r * 1.05,
        L.cx - r,
        sag - r * 0.6,
        L.cx - r,
        sag,
      );
      ctx.arc(L.cx, sag, r, Math.PI, 0, true); // bottom half of the bead
      ctx.bezierCurveTo(
        L.cx + r,
        sag - r * 0.6,
        L.cx + neckW * 0.9,
        sag - r * 1.05,
        L.cx + neckW,
        barH * 0.4,
      );
      ctx.closePath();
      ctx.fill();
    } else {
      // thread snapped: free bead, slightly stretched from the release
      ctx.beginPath();
      ctx.ellipse(L.cx, sag, r * 0.94, r * 1.08, 0, 0, TAU);
      ctx.fill();
    }
    // specular highlight sells the liquid
    ctx.beginPath();
    ctx.ellipse(L.cx - r * 0.32, sag - r * 0.35, r * 0.18, r * 0.26, -0.5, 0, TAU);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();
    if (this.symbolsOn() && ft > 0.35) {
      drawGlyph(ctx, d.colorIdx, L.cx, sag, r * 0.4, "rgba(11,11,16,0.65)");
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
    if (this.symbolsOn()) {
      ctx.globalAlpha = alpha;
      drawGlyph(ctx, d.colorIdx, L.cx + wobble, d.y, d.r * 0.42, "rgba(11,11,16,0.65)");
      ctx.globalAlpha = 1;
    }
  }

  private symbolsOn(): boolean {
    return this.saveData.settings.symbols === true;
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
    // center the text block in the space above the wheel — short viewports
    // must not overlap the pie
    const wheelTop = L.cy - L.outerR;
    const base = Math.max(70, wheelTop * 0.36);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${Math.max(28, L.h * 0.05)}px system-ui, sans-serif`;
    ctx.fillText(strings.locked, L.cx, base);
    ctx.font = `500 ${Math.max(16, L.h * 0.024)}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(strings.result(this.caught, this.levelPar), L.cx, base + 36);
    let y = base + 68;
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
    if (this.cfg.sequence === null && this.boardsCleared > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(strings.session(this.boardsCleared), L.cx, y);
      y += 32;
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

function easeInOut(t: number): number {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
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

/** One distinct shape per color index — the colorblind-assist vocabulary. */
export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  idx: number,
  x: number,
  y: number,
  r: number,
  style: string,
): void {
  ctx.fillStyle = style;
  ctx.strokeStyle = style;
  ctx.lineWidth = Math.max(1.5, r * 0.45);
  ctx.beginPath();
  switch (idx % 8) {
    case 0: // filled circle
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      break;
    case 1: // triangle
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.9, y + r * 0.7);
      ctx.lineTo(x - r * 0.9, y + r * 0.7);
      ctx.closePath();
      ctx.fill();
      break;
    case 2: // square
      ctx.fillRect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
      break;
    case 3: // diamond
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill();
      break;
    case 4: // plus
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.stroke();
      break;
    case 5: // ring
      ctx.arc(x, y, r * 0.8, 0, TAU);
      ctx.stroke();
      break;
    case 6: // bar
      ctx.fillRect(x - r, y - r * 0.35, r * 2, r * 0.7);
      break;
    case 7: // four-point star
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.35, y - r * 0.35);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x + r * 0.35, y + r * 0.35);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.35, y + r * 0.35);
      ctx.lineTo(x - r, y);
      ctx.lineTo(x - r * 0.35, y - r * 0.35);
      ctx.closePath();
      ctx.fill();
      break;
  }
}
