// Layer 3: raw pointer/touch/keys → named game actions, mapped in ONE place.
// ColorFall has one verb — turn the wheel — so the actions are a rotation
// axis (arrow keys, desktop dev) and a drag delta (the real mobile control).
// Gameplay never reads events; it reads axis() and consumeDragDX().

export type ActionName = "left" | "right";

export interface Pointer {
  x: number;
  y: number;
  down: boolean;
  justPressed: boolean;
  justReleased: boolean;
}

export class Input {
  readonly pointer: Pointer = { x: 0, y: 0, down: false, justPressed: false, justReleased: false };
  private held = new Set<ActionName>();
  private pressed = new Set<ActionName>();
  private dragDX = 0;

  constructor(canvas: HTMLCanvasElement) {
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.setPointer(e, true);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (this.pointer.down) this.dragDX += e.clientX - this.pointer.x;
      this.setPointer(e);
    });
    const up = (e: PointerEvent): void => this.setPointer(e, false);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    window.addEventListener("keydown", (e) => {
      const a = this.mapKey(e.code);
      if (a && !e.repeat) {
        this.held.add(a);
        this.pressed.add(a);
      }
    });
    window.addEventListener("keyup", (e) => {
      const a = this.mapKey(e.code);
      if (a) this.held.delete(a);
    });
  }

  // — the per-game mapping lives here and only here —
  private mapKey(code: string): ActionName | null {
    if (code === "ArrowLeft" || code === "KeyA") return "left";
    if (code === "ArrowRight" || code === "KeyD") return "right";
    return null;
  }

  /** Keyboard rotation axis in [-1, 1]. */
  axis(): number {
    return (this.held.has("right") ? 1 : 0) - (this.held.has("left") ? 1 : 0);
  }

  /** Horizontal drag pixels accumulated since last tick. Consumed once per tick. */
  consumeDragDX(): number {
    const dx = this.dragDX;
    this.dragDX = 0;
    return dx;
  }

  isHeld(a: ActionName): boolean {
    return this.held.has(a);
  }

  justPressed(a: ActionName): boolean {
    return this.pressed.has(a);
  }

  /** Call once per sim tick, after gameplay has read input. */
  endTick(): void {
    this.pressed.clear();
    this.pointer.justPressed = false;
    this.pointer.justReleased = false;
  }

  private setPointer(e: PointerEvent, down?: boolean): void {
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    if (down === true) {
      this.pointer.down = true;
      this.pointer.justPressed = true;
    } else if (down === false) {
      this.pointer.down = false;
      this.pointer.justReleased = true;
    }
  }
}
