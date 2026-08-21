// The honey liquid — a port of the designer's metaball goo renderer
// ("Honey Drip.dc.html") mapped onto the game's drop phases. Presentation
// only: reads the Drop, never mutates the sim.
//
// Technique: draw white bands/circles to a mask canvas, threshold them into
// one merged liquid body with blur+contrast, tint with a vertical gradient
// (light crown → base → dark belly), add a blurred specular, then composite
// with a soft glow in the liquid's color. The liquid is the ONE element of
// the Instrument style allowed to glow.

import { TELEGRAPH_S, FORMING_S, stretch, type Drop } from "./drop";

interface Band {
  xl: number;
  xr: number;
  th: number;
  peak: "left" | "right" | "mid";
}

interface Circle {
  x: number;
  y: number;
  r: number;
}

function ease(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

export class Liquid {
  private mask = document.createElement("canvas");
  private comp = document.createElement("canvas");
  private filterOk: boolean;
  private gooFilter = "blur(7px) contrast(26)"; // fallback if the SVG ref fails

  constructor() {
    const ctx = this.mask.getContext("2d");
    this.filterOk = !!ctx && "filter" in ctx;
    if (ctx && this.filterOk) {
      // prefer the designer's SVG goo (alpha-threshold metaballs — crisp
      // edges); canvas contrast() can't threshold alpha, so it's second best
      ctx.filter = "url(#cf-goo)";
      if (ctx.filter === "url(#cf-goo)") this.gooFilter = "url(#cf-goo)";
      ctx.filter = "none";
    }
  }

  /**
   * Build the liquid body for the current drop state.
   * All phases share one metaball group so bar, neck, and bead truly merge.
   */
  private build(d: Drop, w: number): { bands: Band[]; circles: Circle[] } {
    const cx = w / 2;
    const bands: Band[] = [];
    const circles: Circle[] = [];
    const R = d.r;

    if (d.phase === "telegraph") {
      // liquid creeps IN from both edges, leading beads at the fronts
      const e = ease(d.t / TELEGRAPH_S);
      const reach = e * cx;
      const th = 5 + 10 * e;
      if (reach > 1) {
        bands.push({ xl: -10, xr: reach, th, peak: "right" });
        bands.push({ xl: w - reach, xr: w + 10, th, peak: "left" });
        circles.push({ x: reach, y: th * 0.45, r: th * 0.62 });
        circles.push({ x: w - reach, y: th * 0.45, r: th * 0.62 });
      }
    } else if (d.phase === "forming") {
      // gathered band drains toward center while the pendant grows and necks
      const p = ease(d.t / FORMING_S);
      const span = Math.max(2, w * 0.9 * (1 - p));
      const th = Math.max(1, 15 * (1 - p * 0.85));
      if (span > 3) bands.push({ xl: cx - span / 2, xr: cx + span / 2, th, peak: "mid" });
      // pendant: a chain of circles from ceiling to the bead — the bead rides
      // the SIM's own y so pinch-off hands over to falling with no visual jump
      const bead = R * (0.55 + 0.45 * p);
      const sagY = d.y;
      const N = 10;
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const y = -3 + (sagY + 3) * u;
        const base = R * 0.42 + (bead * 0.92 - R * 0.42) * (u * u);
        const pinch = 1 - 0.62 * Math.sin(Math.PI * Math.min(1, u * 1.05)) * p;
        circles.push({ x: cx, y, r: Math.max(1.8, base * pinch) });
      }
      circles.push({ x: cx, y: sagY, r: bead });
    } else if (d.phase === "falling") {
      // remnant bead at the ceiling swallows back up
      const rr = R * Math.max(0, 0.34 - d.t * 1.1);
      if (rr > 1) circles.push({ x: cx, y: 1 + rr * 0.4, r: rr });
      // comet-tail teardrop
      const { sy } = stretch(d);
      const s = 1 / Math.sqrt(Math.max(1, sy));
      const tail = Math.min(30, Math.abs(d.vy) * 0.024);
      circles.push({ x: cx, y: d.y, r: R * s });
      circles.push({ x: cx, y: d.y - tail * 0.5, r: R * 0.8 * s });
      circles.push({ x: cx, y: d.y - tail, r: R * 0.46 * s });
      circles.push({ x: cx, y: d.y - tail * 1.42, r: R * 0.2 });
    } else if (d.phase === "absorbed") {
      // the drop merges INTO the ring: sinks and spreads sideways as a puddle
      const t = d.t / 0.4;
      const sink = d.y + d.r * 0.7 * t;
      const rr = d.r * (1 - t);
      if (rr > 0.5) {
        circles.push({ x: cx, y: sink, r: rr });
        const side = d.r * (0.5 + 1.3 * t);
        const rs = d.r * 0.55 * (1 - t);
        if (rs > 0.5) {
          circles.push({ x: cx - side, y: sink + d.r * 0.2 * t, r: rs });
          circles.push({ x: cx + side, y: sink + d.r * 0.2 * t, r: rs });
        }
      }
    }
    return { bands, circles };
  }

  /** Render the liquid into `target`. `gooH` bounds the effect region. */
  render(
    target: CanvasRenderingContext2D,
    d: Drop,
    color: string,
    w: number,
    gooH: number,
  ): void {
    const { bands, circles } = this.build(d, w);
    if (!bands.length && !circles.length) return;
    if (!this.filterOk) {
      this.renderPlain(target, bands, circles, color, gooH);
      return;
    }
    if (this.mask.width !== w || this.mask.height !== gooH) {
      this.mask.width = w;
      this.mask.height = gooH;
      this.comp.width = w;
      this.comp.height = gooH;
    }
    const m = this.mask.getContext("2d")!;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, w, gooH);
    m.fillStyle = "#fff";
    this.paintShapes(m, bands, circles);

    const p = this.comp.getContext("2d")!;
    p.setTransform(1, 0, 0, 1, 0, 0);
    p.globalCompositeOperation = "source-over";
    p.filter = "none";
    p.clearRect(0, 0, w, gooH);
    p.filter = this.gooFilter;
    p.drawImage(this.mask, 0, 0);
    p.filter = "none";

    // tint: light crown → base → dark belly
    p.globalCompositeOperation = "source-in";
    const grad = p.createLinearGradient(0, 0, 0, gooH);
    grad.addColorStop(0, shade(color, 1.18));
    grad.addColorStop(0.35, color);
    grad.addColorStop(1, shade(color, 0.62));
    p.fillStyle = grad;
    p.fillRect(0, 0, w, gooH);

    // blurred specular sells the wet surface
    p.globalCompositeOperation = "source-atop";
    p.filter = "blur(5px)";
    p.fillStyle = "rgba(255,248,230,0.5)";
    for (const o of circles) {
      if (o.r < 9) continue;
      p.beginPath();
      p.ellipse(o.x - o.r * 0.32, o.y - o.r * 0.34, o.r * 0.3, o.r * 0.22, -0.5, 0, Math.PI * 2);
      p.fill();
    }
    p.fillStyle = "rgba(255,244,214,0.26)";
    for (const b of bands) p.fillRect(b.xl, -30, Math.max(0, b.xr - b.xl), 30 + b.th * 0.45);
    p.filter = "none";
    p.globalCompositeOperation = "source-over";

    target.save();
    target.shadowColor = rgba(color, 0.45);
    target.shadowBlur = 26;
    target.drawImage(this.comp, 0, 0);
    target.restore();
  }

  /** No ctx.filter (older Safari): the chain overlaps enough to read as liquid. */
  private renderPlain(
    target: CanvasRenderingContext2D,
    bands: Band[],
    circles: Circle[],
    color: string,
    gooH: number,
  ): void {
    target.save();
    target.shadowColor = rgba(color, 0.45);
    target.shadowBlur = 26;
    const grad = target.createLinearGradient(0, 0, 0, gooH);
    grad.addColorStop(0, shade(color, 1.18));
    grad.addColorStop(0.35, color);
    grad.addColorStop(1, shade(color, 0.62));
    target.fillStyle = grad;
    this.paintShapes(target, bands, circles);
    target.restore();
  }

  private paintShapes(ctx: CanvasRenderingContext2D, bands: Band[], circles: Circle[]): void {
    for (const b of bands) {
      if (b.th <= 0.4 || b.xr - b.xl <= 1) continue;
      const N = 46;
      ctx.beginPath();
      ctx.moveTo(b.xl, -40);
      ctx.lineTo(b.xr, -40);
      for (let i = N; i >= 0; i--) {
        const u = i / N;
        const x = b.xl + (b.xr - b.xl) * u;
        let s: number;
        if (b.peak === "right") s = Math.pow(u, 0.75);
        else if (b.peak === "left") s = Math.pow(1 - u, 0.75);
        else s = Math.pow(Math.sin(Math.PI * u), 0.55);
        ctx.lineTo(x, b.th * s);
      }
      ctx.closePath();
      ctx.fill();
    }
    for (const o of circles) {
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function parse(hex: string): { r: number; g: number; b: number } {
  let s = hex.replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function shade(hex: string, f: number): string {
  const { r, g, b } = parse(hex);
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${cl(r)},${cl(g)},${cl(b)})`;
}

export function rgba(hex: string, a: number): string {
  const { r, g, b } = parse(hex);
  return `rgba(${r},${g},${b},${a})`;
}
