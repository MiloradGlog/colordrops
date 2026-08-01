import { startLoop } from "./engine/loop";
import { SceneStack } from "./engine/scene";
import { Input } from "./engine/input";
import { load, installAutoSave } from "./engine/save";
import { GameScene } from "./game/scenes/game";
import { applyCatch } from "./game/behaviors/catch";
import { genTargets, isAligned } from "./game/wheel";
import { Rng } from "./engine/rng";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const input = new Input(canvas);
const scenes = new SceneStack();
const saveData = load();
installAutoSave(() => saveData);

const game = new GameScene(input, canvas, saveData);
scenes.push(game);

startLoop(
  {
    update: (dt) => scenes.update(dt),
    render: (ctx, alpha) => scenes.render(ctx, alpha),
  },
  canvas,
);

// Debug/verify hooks (tiny, and the ONLY way tests reach the sim):
// __cd.auto(true) turns on the autopilot; __cd.ff(seconds) fast-forwards the
// deterministic fixed-step sim synchronously; __cd.state() inspects it.
declare global {
  interface Window {
    __cd: {
      auto(on: boolean): void;
      ff(seconds: number): void;
      state(): Record<string, unknown>;
      pure: {
        applyCatch(shares: readonly number[], caught: number, growth: number): number[];
        genTargets(seed: number, n: number, minShare: number): number[];
        isAligned(shares: readonly number[], targets: readonly number[], eps: number): boolean;
      };
    };
  }
}

window.__cd = {
  auto(on: boolean) {
    game.autopilot = on;
  },
  ff(seconds: number) {
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i++) game.update(1 / 60);
  },
  state() {
    return game.debugState();
  },
  pure: {
    applyCatch,
    genTargets: (seed, n, minShare) => genTargets(new Rng(seed), n, minShare),
    isAligned,
  },
};
