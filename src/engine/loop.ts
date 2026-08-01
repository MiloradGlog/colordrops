// Layer 1: fixed-timestep update, interpolated render. Everything hangs off this.

export interface Tickable {
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D, alpha: number): void;
}

const STEP = 1 / 60; // seconds per sim tick
const MAX_ACCUM = 0.25; // clamp after tab-switch so we never spiral

export function startLoop(root: Tickable, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  let last = performance.now();
  let accum = 0;
  let running = true;

  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) last = performance.now();
  });

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize(): void {
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  }
  window.addEventListener("resize", resize);
  resize();

  function frame(now: number): void {
    requestAnimationFrame(frame);
    if (!running) return;
    accum = Math.min(accum + (now - last) / 1000, MAX_ACCUM);
    last = now;
    while (accum >= STEP) {
      root.update(STEP);
      accum -= STEP;
    }
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    root.render(ctx!, accum / STEP);
  }
  requestAnimationFrame(frame);
}
