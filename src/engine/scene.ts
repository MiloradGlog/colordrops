// Layer 2: scene stack. A scene owns its entities; switching leaks nothing.

export interface Scene {
  enter?(): void;
  exit?(): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D, alpha: number): void;
}

export class SceneStack {
  private stack: Scene[] = [];

  push(scene: Scene): void {
    scene.enter?.();
    this.stack.push(scene);
  }

  pop(): void {
    this.stack.pop()?.exit?.();
  }

  replace(scene: Scene): void {
    while (this.stack.length) this.pop();
    this.push(scene);
  }

  get top(): Scene | undefined {
    return this.stack[this.stack.length - 1];
  }

  update(dt: number): void {
    this.top?.update(dt); // only the top scene simulates (menu pauses game)
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    for (const scene of this.stack) scene.render(ctx, alpha); // all render, bottom-up
  }
}
