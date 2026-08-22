// The game scene: orchestrates the relations from spec.md (sequencer→drop,
// drop→segment, segment→siblings, outer↔inner win check) and renders the
// wheel in the Instrument design language: cool graphite, matte muted inks,
// 1px hairlines, all-mono type, zero glow — except the honey liquid.
// Update mutates state; render only reads — one frame, one truth.

import type { Scene } from "../../engine/scene";
import type { Input } from "../../engine/input";
import type { SaveData } from "../../engine/save";
import type { Audio } from "../../engine/audio";
import { save } from "../../engine/save";
import { ads } from "../../engine/ads";
import { Rng } from "../../engine/rng";
import { PALETTE, UI, par, setType } from "../config";
import { Liquid, rgba } from "../liquid";
import { boundaries, centers, segmentAt, isAligned, mod1, type Extent } from "../wheel";
import { applyCatch, applyShrink } from "../behaviors/catch";
import { rotate, type Rotatable } from "../behaviors/rotate";
import { makeDrop, updateDrop, enter, type Drop } from "../drop";
import { pickColor } from "../scheduler";
import { endlessConfig, type RunConfig } from "../levels";
import { strings } from "../../ui/strings";

const TAU = Math.PI * 2;
const SNAP_PER_SEG = 0.09; // lock sequence: seconds per segment click
const MERGE_S = 0.45;
const INTRO_S = 2.6; // rule-change banner hold time
const SEP = 0.0035; // angular separator inset (turns) between segments
// OS-level "less motion please": no shake, no hit-stop, no spring overshoot
const REDUCED_MOTION =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

const SURF_N = 192; // wave-surface samples around the ring (~5px of arc each)

interface Ping {
  t: number; // sonar ping: 1px hairline ring expanding from the wheel
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
  private pings: Ping[] = [];
  private fxRng = new Rng(0xfeedface); // presentation-only randomness, still seeded
  private tapStart: { x: number; y: number } | null = null;
  private newBest = false;
  private streak = 0;
  private hitStop = 0;
  private shake = 0;
  private shareVel!: number[];
  private boardsCleared = 0;
  private sessionSpawns = 0; // never reset between boards — drives the ramp
  private sessionCaught = 0; // never reset between boards — the session line
  private lockClicks = 0;
  private chordPlayed = false;
  private liquid = new Liquid();
  // the ring's liquid surface: a 1D wave equation over ring angle (wheel
  // space). Impacts inject velocity; waves travel both ways and wrap.
  private surfH = new Float32Array(SURF_N);
  private surfV = new Float32Array(SURF_N);
  private surfActive = false;

  constructor(
    private input: Input,
    private canvas: HTMLCanvasElement,
    private saveData: SaveData,
    private audio: Audio,
    cfg: RunConfig,
    private onExit: () => void,
  ) {
    this.wheel = { theta: 0, omega: 0, speed: 0, width: 390, input, locked: false };
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
    this.pings = [];
    this.streak = 0;
    this.hitStop = 0;
    this.shake = 0;
    this.lockClicks = 0;
    this.chordPlayed = false;
    this.surfH.fill(0);
    this.surfV.fill(0);
    this.surfActive = false;
  }

  /** Advance the ring-surface wave equation. Runs on real dt — waves don't freeze. */
  private stepSurface(dt: number): void {
    if (!this.surfActive) return;
    const C = 520; // propagation — waves stay near the impact
    const K = 30; // restoring pull toward flat
    const dampen = Math.exp(-3.2 * dt);
    const h = this.surfH;
    const v = this.surfV;
    let maxAbs = 0;
    for (let i = 0; i < SURF_N; i++) {
      const lap = h[(i + SURF_N - 1) % SURF_N]! + h[(i + 1) % SURF_N]! - 2 * h[i]!;
      v[i] = (v[i]! + (C * lap - K * h[i]!) * dt) * dampen;
    }
    for (let i = 0; i < SURF_N; i++) {
      h[i] = Math.max(-16, Math.min(14, h[i]! + v[i]! * dt));
      const a = Math.abs(h[i]!);
      if (a > maxAbs) maxAbs = a;
    }
    if (maxAbs < 0.15) {
      this.surfH.fill(0);
      this.surfV.fill(0);
      this.surfActive = false;
    }
  }

  /** A drop hits the surface: drive a localized downward velocity impulse. */
  private splashSurface(turn: number): void {
    const center = turn * SURF_N;
    const strength = REDUCED_MOTION ? 320 : 640;
    for (let o = -4; o <= 4; o++) {
      const i = ((Math.round(center) + o) % SURF_N + SURF_N) % SURF_N;
      const g = Math.exp(-((o / 1.6) ** 2));
      this.surfV[i] = this.surfV[i]! - strength * g;
    }
    this.surfActive = true;
  }

  private n(): number {
    return this.targets.length;
  }

  /**
   * The ring is ALWAYS closed (designer call): segments sit edge-to-edge in
   * color order from the same origin as the inner pie, sized by share. No
   * gaps, no fall-through — every drop lands on some color, and dodging
   * means choosing the least-bad catcher.
   */
  private closedExtents(shares: readonly number[]): Extent[] {
    const total = shares.reduce((a, b) => a + b, 0) || 1;
    const out: Extent[] = [];
    let acc = 0;
    for (const s of shares) {
      const w = s / total;
      out.push({ start: acc, end: acc + w });
      acc += w;
    }
    out[out.length - 1]!.end = 1;
    return out;
  }

  private segCenter(i: number): number {
    const e = this.closedExtents(this.shares)[i]!;
    return (e.start + e.end) / 2;
  }

  update(dt: number): void {
    const L = this.layout();
    this.wheel.width = L.w;
    this.age += dt;
    // hit-stop: the world freezes for a beat on a correct catch; effects keep moving
    const wdt = this.hitStop > 0 ? 0 : dt;
    this.hitStop = Math.max(0, this.hitStop - dt);
    this.shake = Math.max(0, this.shake - dt * 3.5);

    if (this.phase === "playing") {
      // chip taps (clean tap, not a drag): back ‹ exits, ♪ toggles sound
      if (this.input.pointer.justPressed) {
        this.tapStart = { x: this.input.pointer.x, y: this.input.pointer.y };
      }
      if (this.input.pointer.justReleased && this.tapStart) {
        const dx = this.input.pointer.x - this.tapStart.x;
        const dy = this.input.pointer.y - this.tapStart.y;
        if (dx * dx + dy * dy < 100) {
          const back = this.backChip(L);
          const snd = this.soundChip(L);
          if (Math.hypot(this.tapStart.x - back.x, this.tapStart.y - back.y) < back.r + 8) {
            this.onExit();
            return;
          }
          if (Math.hypot(this.tapStart.x - snd.x, this.tapStart.y - snd.y) < snd.r + 8) {
            this.saveData.settings.sound = !this.saveData.settings.sound;
            this.audio.muted = !this.saveData.settings.sound;
            save(this.saveData);
          }
        }
        this.tapStart = null;
      }
      if (this.autopilot) this.autoSteer();
      rotate.tick(this.wheel, dt);
      this.updateSpawning(wdt, L);
    } else if (this.phase === "locking") {
      this.lockT += dt;
      const due = Math.min(this.n(), Math.floor(this.lockT / SNAP_PER_SEG));
      while (this.lockClicks < due) {
        this.audio.click(this.lockClicks++);
        this.pings.push({ t: 0 });
      }
      if (!this.chordPlayed && this.lockT >= this.n() * SNAP_PER_SEG) {
        this.chordPlayed = true;
        this.audio.chord();
        this.pings.push({ t: 0 });
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
    this.stepSurface(dt);
    for (const p of this.pings) p.t += dt;
    this.pings = this.pings.filter((p) => p.t < 0.7);

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
    return Math.max(0.35, this.cfg.intervalS - 0.28 * Math.log2(1 + this.sessionSpawns / 4));
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
    const extents = this.closedExtents(this.shares);
    const idx = segmentAt(extents, topTurn);

    if (idx === -1) {
      // unreachable with a closed ring — float-edge safety only
      d.behind = true;
      enter(d, "missed");
      d.vy = Math.max(d.vy, 100);
      this.fallthrough.push(d);
      this.drop = null;
      return;
    }

    // every absorbed drop counts, correct or wrong (spec.md → scoring)
    this.caught++;
    this.sessionCaught++;
    // the splash IS the ring: the wave surface takes the hit at the exact
    // landing angle, and a ripple ring pinned to the wheel marks the spot
    this.splashSurface(topTurn);
    enter(d, "absorbed");
    d.y = L.cy - L.outerR;

    if (idx === d.colorIdx) {
      this.shares = applyCatch(this.shares, idx, this.cfg.growth);
      this.pulses[idx] = 1;
      this.streak++;
      this.audio.blip(this.streak);
      if (!REDUCED_MOTION) this.hitStop = 0.05;
    } else if (this.cfg.wrongCatch === "shrinkDrop") {
      this.shares = applyShrink(this.shares, d.colorIdx, this.cfg.growth);
      this.streak = 0;
      this.audio.thud();
      if (!REDUCED_MOTION) this.shake = 1;
    } else if (this.cfg.wrongCatch === "shrinkSelf") {
      this.shares = applyShrink(this.shares, idx, this.cfg.growth);
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
    this.lockStart = this.closedExtents(this.shares);
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
    this.saveData.progress.totalDrops = (this.saveData.progress.totalDrops ?? 0) + this.caught;
    this.saveData.progress.totalBoards = (this.saveData.progress.totalBoards ?? 0) + 1;
    // interstitial slot at a natural break, every 3rd completion (boards too)
    const done = (this.saveData.progress.completions ?? 0) + 1;
    this.saveData.progress.completions = done;
    if (done % 3 === 0) void ads.interstitial();
    save(this.saveData);
  }

  private backChip(L: Layout): { x: number; y: number; r: number } {
    return { x: 30, y: L.h * 0.045, r: 17 };
  }

  private soundChip(L: Layout): { x: number; y: number; r: number } {
    return { x: L.w - 30, y: L.h * 0.045, r: 17 };
  }

  /**
   * Debug/verify autopilot. Per drop, in order of preference:
   * catch it if that helps alignment; weaponize a wrong catch when a color
   * is overgrown (shrink tiers); otherwise dodge via the widest gap; last
   * resort, absorb with the color that suffers least.
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
      this.parkTurn(this.segCenter(c));
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
          if (
            over === -1 ||
            this.shares[i]! - this.targets[i]! > this.shares[over]! - this.targets[over]!
          ) {
            over = i;
          }
        }
      }
      if (over !== -1) {
        this.parkTurn(this.segCenter(over));
        return;
      }
    }
    this.parkLeastHarm(c);
  }

  private parkTurn(turn: number): void {
    this.wheel.theta = -Math.PI / 2 - turn * TAU;
  }

  private parkWrong(dropColor: number): void {
    let widest = dropColor === 0 ? 1 : 0;
    for (let i = 0; i < this.n(); i++) {
      if (i !== dropColor && this.shares[i]! > this.shares[widest]!) widest = i;
    }
    this.parkTurn(this.segCenter(widest));
  }

  /** Every drop lands somewhere: absorb with the color that suffers least. */
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
    this.parkTurn(this.segCenter(best));
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
      closed: true, // the ring is always closed — no gaps, no fall-through
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
    const outerR = Math.min(w, h * 0.62) * 0.38;
    return { w, h, cx: w / 2, cy: h * 0.62, outerR, ringW: outerR * 0.29 };
  }

  // ————————————————————————— render —————————————————————————

  render(ctx: CanvasRenderingContext2D): void {
    const L = this.layout();
    ctx.save();
    if (this.shake > 0) {
      const m = this.shake * this.shake * 5;
      ctx.translate((this.fxRng.next() - 0.5) * m, (this.fxRng.next() - 0.5) * m);
    }
    // graphite ground + soft color wash bleeding down from the liquid ceiling
    ctx.fillStyle = UI.bg;
    ctx.fillRect(0, 0, L.w, L.h);
    const d = this.drop;
    if (d && d.phase !== "gone" && d.phase !== "missed") {
      const color = PALETTE[d.colorIdx % PALETTE.length]!;
      const wash = ctx.createLinearGradient(0, 0, 0, 44);
      wash.addColorStop(0, rgba(color, 0.14));
      wash.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, L.w, 44);
    }
    for (const f of this.fallthrough) this.drawFallthrough(ctx, L, f);
    this.drawWheel(ctx, L);
    this.drawPings(ctx, L);
    if (d) {
      this.liquid.render(
        ctx,
        d,
        PALETTE[d.colorIdx % PALETTE.length]!,
        L.w,
        Math.ceil(L.cy - L.outerR + 30),
      );
      // colorblind pairing must survive the liquid: glyph rides the drop
      if (this.symbolsOn() && (d.phase === "falling" || d.phase === "absorbed")) {
        drawGlyph(ctx, d.colorIdx, L.cx, d.y, d.r * 0.42, "rgba(16,18,20,0.7)");
      }
    }
    this.drawHud(ctx, L);
    if (this.phase === "won") this.drawWon(ctx, L);
    ctx.restore();
  }

  private drawFallthrough(ctx: CanvasRenderingContext2D, L: Layout, d: Drop): void {
    ctx.beginPath();
    ctx.arc(L.cx, d.y, d.r * 0.8, 0, TAU);
    ctx.fillStyle = rgba(PALETTE[d.colorIdx % PALETTE.length]!, 0.3);
    ctx.fill();
  }

  private currentExtents(): Extent[] {
    if (this.phase === "playing") {
      return this.closedExtents(this.displayShares);
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
    const { cx, cy, outerR } = L;
    const th = this.wheel.theta;
    const mergeT =
      this.phase === "playing" ? 0 : clamp01((this.lockT - this.n() * SNAP_PER_SEG) / MERGE_S);
    const innerRingR = outerR * 0.71;
    const discR = outerR * 0.6;

    // ring track — the graphite groove the liquid fills
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, TAU);
    ctx.arc(cx, cy, innerRingR, 0, TAU, true);
    ctx.fillStyle = UI.track;
    ctx.fill();

    // the wave surface: sampled heights over ring angle, interpolated
    const dentAt = (turn: number): number => {
      const f = (((turn % 1) + 1) % 1) * SURF_N;
      const i0 = Math.floor(f) % SURF_N;
      const i1 = (i0 + 1) % SURF_N;
      const fr = f - Math.floor(f);
      return this.surfH[i0]! * (1 - fr) + this.surfH[i1]! * fr;
    };
    const wobbling = this.surfActive;

    // outer segments: matte inks, zero glow
    const extents = this.currentExtents();
    for (let i = 0; i < this.n(); i++) {
      const e = extents[i]!;
      const w = e.end - e.start;
      if (w <= 0) continue;
      const pulse = this.pulses[i]! * Math.max(2, outerR * 0.025);
      const a0 = th + e.start * TAU;
      const a1 = th + e.end * TAU;
      ctx.beginPath();
      if (wobbling) {
        const steps = Math.max(3, Math.ceil((a1 - a0) / 0.03));
        for (let s = 0; s <= steps; s++) {
          const a = a0 + ((a1 - a0) * s) / steps;
          const r = outerR + pulse + dentAt((a - th) / TAU);
          const px = cx + Math.cos(a) * r;
          const py = cy + Math.sin(a) * r;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.arc(cx, cy, innerRingR - pulse * 0.4, a1, a0, true);
      } else {
        ctx.arc(cx, cy, outerR + pulse, a0, a1);
        ctx.arc(cx, cy, innerRingR - pulse * 0.4, a1, a0, true);
      }
      ctx.closePath();
      ctx.fillStyle = PALETTE[i % PALETTE.length]!;
      ctx.fill();
      if (this.symbolsOn() && w * TAU * outerR > (outerR - innerRingR) * 0.9) {
        const mid = th + ((e.start + e.end) / 2) * TAU;
        const gr = (outerR + innerRingR) / 2;
        drawGlyph(
          ctx,
          i,
          cx + Math.cos(mid) * gr,
          cy + Math.sin(mid) * gr,
          (outerR - innerRingR) * 0.24,
          "rgba(16,18,20,0.7)",
        );
      }
    }

    // aligned indicator: hairline arcs riding each segment's ACTUAL span —
    // the mark belongs to the segment it certifies, wherever it currently
    // sits. Fades in continuously as the color approaches tolerance.
    if (this.phase === "playing") {
      const eps = this.cfg.epsilon;
      for (let i = 0; i < this.n(); i++) {
        const dev = Math.abs(this.shares[i]! - this.targets[i]!);
        const close = clamp01((2 * eps - dev) / eps); // 0 at 2ε, 1 at ε
        if (close <= 0) continue;
        const e = extents[i]!;
        if (e.end - e.start <= SEP * 4) continue;
        const a0 = th + (e.start + SEP * 2) * TAU;
        const a1 = th + (e.end - SEP * 2) * TAU;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR * 1.05, a0, a1);
        ctx.strokeStyle = UI.hair(0.9 * close);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // inner disc: the target pie, seamless (merges outward at the end)
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
    if (this.symbolsOn()) {
      for (let i = 0; i < this.n(); i++) {
        if (this.targets[i]! < 0.05) continue;
        const mid = th + ((this.bounds[i]! + this.bounds[i + 1]!) / 2) * TAU;
        const gr = pieR * 0.62;
        drawGlyph(
          ctx,
          i,
          cx + Math.cos(mid) * gr,
          cy + Math.sin(mid) * gr,
          pieR * 0.075,
          "rgba(16,18,20,0.7)",
        );
      }
    }
    // hairline disc border
    ctx.beginPath();
    ctx.arc(cx, cy, pieR + 1, 0, TAU);
    ctx.strokeStyle = UI.hair(0.14);
    ctx.lineWidth = 1;
    ctx.stroke();

    // won: the double hairline halo is the only celebration — it breathes
    // gently while idle, the outer ring trailing the inner by a beat
    if (this.phase === "won") {
      const p1 = REDUCED_MOTION ? 0 : Math.sin(this.age * 1.7);
      const p2 = REDUCED_MOTION ? 0 : Math.sin(this.age * 1.7 - 0.9);
      ctx.beginPath();
      ctx.arc(cx, cy, outerR + 7 + p1 * 2, 0, TAU);
      ctx.strokeStyle = UI.hair(0.5 + 0.13 * p1);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, outerR + 13 + p2 * 3.5, 0, TAU);
      ctx.strokeStyle = UI.hair(0.14 + 0.08 * p2);
      ctx.stroke();
    }
  }

  private drawPings(ctx: CanvasRenderingContext2D, L: Layout): void {
    // sonar ping, not bloom: a 1px hairline ring expands and fades per snap
    for (const p of this.pings) {
      const t = p.t / 0.7;
      ctx.beginPath();
      ctx.arc(L.cx, L.cy, L.outerR * (1.02 + t * 0.32), 0, TAU);
      ctx.strokeStyle = UI.hair((1 - t) * 0.6);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }


  private drawChip(
    ctx: CanvasRenderingContext2D,
    chip: { x: number; y: number; r: number },
    glyph: string,
    bright: boolean,
  ): void {
    const s = chip.r * 0.88;
    ctx.beginPath();
    roundRect(ctx, chip.x - s, chip.y - s, s * 2, s * 2, 8);
    ctx.strokeStyle = UI.hair(0.18);
    ctx.lineWidth = 1;
    ctx.stroke();
    setType(ctx, 400, 14);
    ctx.textAlign = "center";
    ctx.fillStyle = bright ? UI.text : UI.muted;
    ctx.fillText(glyph, chip.x, chip.y + 5);
  }

  private drawHud(ctx: CanvasRenderingContext2D, L: Layout): void {
    if (this.phase === "won") return; // the won screen owns the whole frame
    this.drawChip(ctx, this.backChip(L), "‹", true);
    this.drawChip(ctx, this.soundChip(L), "♪", this.saveData.settings.sound);

    // score row: DROPS n / PAR p  ·  ALN k/N
    const y = L.h * 0.045 + 42;
    setType(ctx, 500, 10, 1);
    ctx.textAlign = "left";
    const drops = `${strings.drops(this.caught)} `;
    ctx.fillStyle = UI.text;
    ctx.fillText(drops, 22, y);
    ctx.fillStyle = UI.muted;
    ctx.fillText(`/ ${strings.par(this.levelPar)}`, 22 + ctx.measureText(drops).width, y);
    let alignedCount = 0;
    for (let i = 0; i < this.n(); i++) {
      if (Math.abs(this.shares[i]! - this.targets[i]!) <= this.cfg.epsilon) alignedCount++;
    }
    ctx.textAlign = "right";
    const count = `${alignedCount}/${this.n()}`;
    ctx.fillStyle = UI.text;
    ctx.fillText(count, L.w - 22, y);
    ctx.fillStyle = UI.muted;
    ctx.fillText("ALN ", L.w - 22 - ctx.measureText(count).width, y);

    // bottom line: the control, always quietly present
    if (this.phase === "playing") {
      ctx.textAlign = "center";
      ctx.fillStyle = UI.muted;
      setType(ctx, 400, 9, 2);
      ctx.fillText(this.cfg.hint && this.caught === 0 ? this.cfg.hint.toUpperCase() : strings.tagline, L.cx, L.h - 22);
    }
    // rule-change banner
    if (this.cfg.intro && this.age < INTRO_S && this.phase === "playing") {
      const a = this.age < INTRO_S - 0.5 ? 1 : (INTRO_S - this.age) / 0.5;
      ctx.textAlign = "center";
      ctx.fillStyle = UI.hair(0.95 * a);
      setType(ctx, 600, 13, 3);
      ctx.fillText(this.cfg.intro.toUpperCase(), L.cx, L.h * 0.22);
    }
  }

  private drawWon(ctx: CanvasRenderingContext2D, L: Layout): void {
    const wheelTop = L.cy - L.outerR;
    const base = Math.max(64, wheelTop * 0.3);
    ctx.textAlign = "center";
    ctx.fillStyle = UI.text;
    setType(ctx, 600, 24, 8);
    ctx.fillText(strings.locked, L.cx, base);

    // 7 DROPS / PAR 6  [NEW BEST]
    setType(ctx, 400, 10, 0);
    const a = `${this.caught} DROPS `;
    const b = `/ PAR ${this.levelPar}`;
    const wa = ctx.measureText(a).width;
    const wb = ctx.measureText(b).width;
    const tagText = this.newBest ? strings.newBest : null;
    const wTag = tagText ? ctx.measureText(tagText).width + 26 : 0;
    let x = L.cx - (wa + wb + wTag) / 2;
    ctx.textAlign = "left";
    ctx.fillStyle = UI.text;
    ctx.fillText(a, x, base + 34);
    x += wa;
    ctx.fillStyle = UI.muted;
    ctx.fillText(b, x, base + 34);
    x += wb;
    if (tagText) {
      setType(ctx, 400, 9, 1);
      const tw = ctx.measureText(tagText).width;
      ctx.strokeStyle = UI.good;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 10, base + 34 - 11, tw + 16, 16);
      ctx.fillStyle = UI.good;
      ctx.fillText(tagText, x + 18, base + 34 + 1);
    }

    ctx.textAlign = "center";
    ctx.fillStyle = UI.muted;
    setType(ctx, 400, 9, 1);
    if (this.cfg.sequence === null) {
      ctx.fillText(strings.session(this.sessionCaught, this.boardsCleared), L.cx, base + 62);
    }
    ctx.fillStyle = UI.text;
    setType(ctx, 600, 11, 5);
    ctx.fillText(this.cfg.sequence === null ? strings.tapNextBoard : strings.tapSelect, L.cx, base + 94);
  }

  private symbolsOn(): boolean {
    return this.saveData.settings.symbols === true;
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
