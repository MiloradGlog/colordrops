import { startLoop } from "./engine/loop";
import { SceneStack } from "./engine/scene";
import { Input } from "./engine/input";
import { load, installAutoSave } from "./engine/save";
import { Audio } from "./engine/audio";
import { GameScene } from "./game/scenes/game";
import { SelectScene } from "./game/scenes/select";
import { LEVELS, endlessConfig, type RunConfig } from "./game/levels";
import { applyCatch, applyShrink } from "./game/behaviors/catch";
import { genTargets, isAligned } from "./game/wheel";
import { Rng } from "./engine/rng";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const input = new Input(canvas);
const scenes = new SceneStack();
const saveData = load();
installAutoSave(() => saveData);
const audio = new Audio();
audio.muted = !saveData.settings.sound;

let current: GameScene | null = null;
let autopilotWanted = false;

function showSelect(): void {
  current = null;
  scenes.replace(new SelectScene(input, canvas, saveData, audio, startRun));
}

function startRun(cfg: RunConfig): void {
  current = new GameScene(input, canvas, saveData, audio, cfg, showSelect);
  current.autopilot = autopilotWanted;
  scenes.replace(current);
}

showSelect();

startLoop(
  {
    update: (dt) => scenes.update(dt),
    render: (ctx, alpha) => scenes.render(ctx, alpha),
  },
  canvas,
);

// Debug/verify hooks (tiny, and the ONLY way tests reach the sim):
// __cd.goto(id) jumps to a level ("l1".."l10" or "endless"); __cd.auto(true)
// turns on the autopilot; __cd.ff(seconds) fast-forwards the deterministic
// fixed-step sim synchronously; __cd.state() inspects it.
declare global {
  interface Window {
    __cd: {
      goto(id: string): void;
      theta(rad: number): void;
      auto(on: boolean): void;
      ff(seconds: number): void;
      state(): Record<string, unknown>;
      pure: {
        applyCatch(shares: readonly number[], caught: number, growth: number): number[];
        applyShrink(shares: readonly number[], colorIdx: number, amount: number): number[];
        genTargets(seed: number, n: number, minShare: number): number[];
        isAligned(shares: readonly number[], targets: readonly number[], eps: number): boolean;
      };
    };
  }
}

window.__cd = {
  goto(id: string) {
    if (id === "select") {
      showSelect();
      return;
    }
    const cfg = id === "endless" ? endlessConfig(1) : LEVELS.find((l) => l.id === id);
    if (!cfg) throw new Error(`unknown level ${id}`);
    startRun(cfg);
  },
  theta(rad: number) {
    current?.setTheta(rad);
  },
  auto(on: boolean) {
    autopilotWanted = on;
    if (current) current.autopilot = on;
  },
  ff(seconds: number) {
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i++) scenes.update(1 / 60);
  },
  state() {
    return current ? current.debugState() : { screen: "select" };
  },
  pure: {
    applyCatch,
    applyShrink,
    genTargets: (seed, n, minShare) => genTargets(new Rng(seed), n, minShare),
    isAligned,
  },
};
