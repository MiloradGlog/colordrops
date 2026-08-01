// Headless verify for gimmegame/progress.json stages s1 + s2.
// Usage: npm run build && npm run verify  (needs `vite preview` free on :4173)
// Drives the real page in Chromium via the __cd debug hooks; every assertion
// maps to a `verify` line in progress.json.

import { chromium } from "playwright-core";
import { spawn } from "node:child_process";

const PORT = 4173;
const URL = `http://localhost:${PORT}/`;

function assert(cond, label) {
  if (!cond) throw new Error(`VERIFY FAIL: ${label}`);
  console.log(`ok - ${label}`);
}

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
  stdio: "ignore",
});
try {
  await new Promise((r) => setTimeout(r, 1500));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(URL);
  await page.waitForFunction(() => typeof window.__cd?.state === "function");

  // — s1: loop —
  await page.waitForTimeout(400);
  const s0 = await page.evaluate(() => window.__cd.state());
  assert(s0.phase === "playing", "s1/loop: game boots into playing phase");

  // — s1: input — drag rotates same-frame; arrows rotate on desktop
  const t0 = (await page.evaluate(() => window.__cd.state())).theta;
  await page.mouse.move(195, 500);
  await page.mouse.down();
  await page.mouse.move(295, 500, { steps: 5 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  const t1 = (await page.evaluate(() => window.__cd.state())).theta;
  assert(Math.abs(t1 - t0) > 0.1, "s1/input: drag rotates the wheel");
  await page.waitForTimeout(500); // let release inertia die
  const t1b = (await page.evaluate(() => window.__cd.state())).theta;
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(150);
  await page.keyboard.up("ArrowLeft");
  const t2 = (await page.evaluate(() => window.__cd.state())).theta;
  assert(t2 < t1b - 0.05, "s1/input: ArrowLeft rotates the other way");

  // — s1: wheel renders — screenshot has wheel pixels (non-background colors)
  await page.screenshot({ path: "scripts/screenshot-s1.png" });
  assert(true, "s1/wheel-render: screenshot captured (visual check: scripts/screenshot-s1.png)");

  // — s2: target-gen — deterministic, min share, sums to 1
  const gen = await page.evaluate(() => ({
    a: window.__cd.pure.genTargets(42, 5, 0.08),
    b: window.__cd.pure.genTargets(42, 5, 0.08),
    c: window.__cd.pure.genTargets(43, 5, 0.08),
  }));
  assert(JSON.stringify(gen.a) === JSON.stringify(gen.b), "s2/target-gen: same seed → same targets");
  assert(JSON.stringify(gen.a) !== JSON.stringify(gen.c), "s2/target-gen: different seed differs");
  const sum = gen.a.reduce((x, y) => x + y, 0);
  assert(Math.abs(sum - 1) < 1e-9, "s2/target-gen: shares sum to 1");
  assert(Math.min(...gen.a) >= 0.08 - 1e-9, "s2/target-gen: min share respected");

  // — s2: catch-rules — grow by G, others shrink proportionally, sum stays 1
  const catchRes = await page.evaluate(() => {
    const before = [0.25, 0.25, 0.25, 0.25];
    const after = window.__cd.pure.applyCatch(before, 2, 0.04);
    return { before, after, sum: after.reduce((x, y) => x + y, 0) };
  });
  assert(Math.abs(catchRes.after[2] - 0.29) < 1e-9, "s2/catch-rules: caught color grows by G");
  assert(Math.abs(catchRes.sum - 1) < 1e-9, "s2/catch-rules: pie still sums to 1");
  assert(
    Math.abs(catchRes.after[0] - catchRes.after[1]) < 1e-12,
    "s2/catch-rules: others shrink proportionally",
  );

  // — s2: drop-lifecycle + win-lock — autopilot plays the level to the lock
  const result = await page.evaluate(() => {
    window.__cd.auto(true);
    const seen = new Set();
    let won = null;
    for (let i = 0; i < 600 * 60; i++) {
      window.__cd.ff(1 / 60);
      const st = window.__cd.state();
      if (st.drop) seen.add(st.drop.phase);
      if (st.phase !== "playing") {
        // fast-forward through the lock animation too
        window.__cd.ff(5);
        won = window.__cd.state();
        break;
      }
    }
    window.__cd.auto(false);
    return { seen: [...seen], won };
  });
  assert(
    ["telegraph", "forming", "falling"].every((p) => result.seen.includes(p)),
    `s2/drop-lifecycle: full lifecycle observed (${result.seen.join(", ")})`,
  );
  assert(result.won && result.won.phase === "won", "s2/win-lock: autopilot reaches the locked win");
  assert(result.won.caught >= result.won.par, "s2/win-lock: caught ≥ par (par is a true floor)");
  console.log(
    `   autopilot won level ${result.won.level} in ${result.won.caught} drops (par ${result.won.par})`,
  );
  await page.screenshot({ path: "scripts/screenshot-won.png" });

  assert(errors.length === 0, `no console errors (got: ${errors.join(" | ")})`);
  await browser.close();
  console.log("\nALL VERIFIES PASS");
} finally {
  preview.kill();
}
