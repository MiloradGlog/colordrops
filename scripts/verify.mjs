// Headless verify for gimmegame/progress.json (v2 handcrafted-levels).
// Usage: npm run build && npm run verify  (needs :4173 free)
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
  const debugLogs = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    // resource fetch failures (e.g. Google Fonts offline in the sandbox) are
    // environmental, not game bugs — the font stack falls back gracefully
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
    if (m.type() === "debug") debugLogs.push(m.text());
  });
  await page.goto(URL);
  await page.waitForFunction(() => typeof window.__cd?.state === "function");

  // — boot: title screen (endless-first) —
  await page.waitForTimeout(300);
  assert(
    (await page.evaluate(() => window.__cd.state())).screen === "title",
    "s7/endless-first: game boots into the title screen",
  );
  await page.screenshot({ path: "scripts/screenshot-title.png" });

  // — one tap anywhere starts endless —
  await page.mouse.click(195, 500);
  await page.waitForTimeout(120);
  const afterTap = await page.evaluate(() => window.__cd.state());
  assert(
    afterTap.screen === "game" && afterTap.id === "endless",
    "s7/endless-first: tap-to-play starts an endless board",
  );

  // — s1 input: drag rotates; arrows rotate the other way —
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
  await page.screenshot({ path: "scripts/screenshot-l1.png" });

  // — s3 rules: pure catch economy —
  const rules = await page.evaluate(() => {
    const grow = window.__cd.pure.applyCatch([0.25, 0.25, 0.25, 0.25], 2, 0.04);
    const shrink = window.__cd.pure.applyShrink([0.25, 0.25, 0.25, 0.25], 2, 0.04);
    return { grow, shrink, gSum: grow.reduce((a, b) => a + b, 0), sSum: shrink.reduce((a, b) => a + b, 0) };
  });
  assert(Math.abs(rules.grow[2] - 0.29) < 1e-9, "s2/catch-grow: caught color grows by G");
  assert(Math.abs(rules.gSum - 1) < 1e-9, "s2/catch-grow: pie sums to 1");
  assert(Math.abs(rules.shrink[2] - 0.21) < 1e-9, "s3/wrong-catch: applyShrink shrinks by G");
  assert(
    Math.abs(rules.sSum - 1) < 1e-9 && Math.abs(rules.shrink[0] - rules.shrink[1]) < 1e-12,
    "s3/wrong-catch: others grow proportionally, sum stays 1",
  );

  // — s3 rules: wrong catch COUNTS but has no effect on a teaching level —
  const wrongOnL1 = await page.evaluate(() => {
    window.__cd.goto("l1"); // fresh l1; first drop color is 0 (fixed sequence)
    const st0 = window.__cd.state();
    // park color 1's center under the drop → guaranteed wrong catch
    window.__cd.theta(-Math.PI / 2 - st0.centers[1] * Math.PI * 2);
    let st = st0;
    for (let i = 0; i < 60 * 20 && st.caught === st0.caught && st.phase === "playing"; i++) {
      window.__cd.ff(1 / 60);
      st = window.__cd.state();
      window.__cd.theta(-Math.PI / 2 - st.centers[1] * Math.PI * 2); // keep parked
    }
    return { before: st0.shares, after: st.shares, caught: st.caught };
  });
  assert(wrongOnL1.caught === 1, "s3/all-catch-score: wrong catch increments the counter");
  assert(
    JSON.stringify(wrongOnL1.before) === JSON.stringify(wrongOnL1.after),
    "s3/wrong-catch: 'none' tier leaves shares untouched",
  );

  // — s3 rules: gap fall-through is free —
  const gapRun = await page.evaluate(() => {
    window.__cd.goto("l4"); // shrink tier; gaps exist while misaligned
    let st = window.__cd.state();
    const parkGap = () => {
      st = window.__cd.state();
      if (st.widestGap !== null) window.__cd.theta(-Math.PI / 2 - st.widestGap * Math.PI * 2);
    };
    parkGap();
    for (let i = 0; i < 60 * 12; i++) {
      window.__cd.ff(1 / 60);
      parkGap();
    }
    return window.__cd.state();
  });
  assert(gapRun.caught === 0, "s3/all-catch-score: gap fall-through does not count");
  await page.screenshot({ path: "scripts/screenshot-l4.png" });

  // — s4: determinism — same level, same drop sequence, every attempt —
  const seq = await page.evaluate(() => {
    const collect = () => {
      window.__cd.goto("l3");
      const seen = [];
      let prevPhase = null;
      for (let i = 0; i < 60 * 30 && seen.length < 6; i++) {
        window.__cd.ff(1 / 60);
        const d = window.__cd.state().drop;
        if (d && d.phase === "telegraph" && prevPhase !== "telegraph") seen.push(d.color);
        prevPhase = d ? d.phase : null;
      }
      return seen;
    };
    return { a: collect(), b: collect() };
  });
  assert(
    seq.a.length >= 5 && JSON.stringify(seq.a) === JSON.stringify(seq.b),
    `s4/level-data: replay produces the identical drop sequence (${seq.a.join(",")})`,
  );

  // — s4: ALL 10 levels winnable by autopilot —
  for (let i = 1; i <= 10; i++) {
    const res = await page.evaluate((id) => {
      window.__cd.goto(id);
      window.__cd.auto(true);
      let st = window.__cd.state();
      for (let s = 0; s < 900 && st.phase === "playing"; s++) {
        window.__cd.ff(1);
        st = window.__cd.state();
      }
      window.__cd.ff(5); // lock animation
      window.__cd.auto(false);
      return window.__cd.state();
    }, `l${i}`);
    assert(res.phase === "won", `s4/level-data: autopilot clears l${i} (${res.caught} drops, par ${res.par})`);
  }

  // — s4: won → tap → back to select; best persisted —
  const backOut = await page.evaluate(() => {
    window.__cd.goto("l1");
    window.__cd.auto(true);
    let st = window.__cd.state();
    for (let s = 0; s < 300 && st.phase === "playing"; s++) {
      window.__cd.ff(1);
      st = window.__cd.state();
    }
    window.__cd.ff(5);
    window.__cd.auto(false);
    return window.__cd.state().phase;
  });
  assert(backOut === "won", "s4/select-flow: l1 rewon for navigation test");
  await page.mouse.click(195, 500);
  await page.waitForFunction(() => window.__cd.state().screen === "title", null, { timeout: 4000 });
  assert(true, "s7/endless-first: tap on a finished level returns to title");
  await page.reload();
  await page.waitForFunction(() => typeof window.__cd?.state === "function");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("colorfall-save")));
  assert(
    typeof saved?.progress?.bestByLevel?.l1 === "number",
    `s4/select-flow: best persists across reload (l1 best ${saved?.progress?.bestByLevel?.l1})`,
  );

  // — s5: endless — autopilot wins a random board, tap starts a new one —
  const endless = await page.evaluate(() => {
    window.__cd.goto("endless");
    window.__cd.auto(true);
    let st = window.__cd.state();
    for (let s = 0; s < 900 && st.phase === "playing"; s++) {
      window.__cd.ff(1);
      st = window.__cd.state();
    }
    window.__cd.ff(5);
    window.__cd.auto(false);
    return window.__cd.state();
  });
  assert(endless.phase === "won", `s5/endless: autopilot wins a random board (${endless.caught} drops)`);
  await page.mouse.click(195, 500);
  await page.waitForFunction(() => window.__cd.state().phase === "playing", null, { timeout: 4000 });
  const nextBoard = await page.evaluate(() => window.__cd.state());
  assert(
    nextBoard.caught === 0 && /board 2/.test(nextBoard.name),
    "s5/endless: tap after win starts a fresh board",
  );

  // — s7: the ramp — drop cadence tightens as the session goes on —
  const ramp = await page.evaluate(() => {
    const before = window.__cd.state();
    window.__cd.auto(true);
    for (let s = 0; s < 40; s++) {
      window.__cd.ff(1);
      const st = window.__cd.state();
      if (st.phase === "won") window.__cd.ff(2); // ride through wins; tap not needed for ramp
    }
    window.__cd.auto(false);
    const after = window.__cd.state();
    return { before, after };
  });
  assert(
    ramp.after.sessionSpawns > ramp.before.sessionSpawns &&
      ramp.after.effectiveInterval < ramp.before.effectiveInterval - 0.02,
    `s7/ramp: interval tightened ${ramp.before.effectiveInterval.toFixed(2)}s → ${ramp.after.effectiveInterval.toFixed(2)}s over ${ramp.after.sessionSpawns - ramp.before.sessionSpawns} drops`,
  );

  // — s6: ads stub fires on every 3rd completion (levels AND boards) —
  const adLogs = debugLogs.filter((t) => t.includes("[ads] interstitial"));
  const savedForAds = await page.evaluate(() => JSON.parse(localStorage.getItem("colorfall-save")));
  const expectedAds = Math.floor((savedForAds?.progress?.completions ?? 0) / 3);
  assert(
    adLogs.length === expectedAds && expectedAds >= 3,
    `s6/ads: interstitial fired ${adLogs.length}x for ${savedForAds?.progress?.completions} completions (expected ${expectedAds})`,
  );

  // — s6: mute toggle persists —
  await page.evaluate(() => window.__cd.goto("title"));
  await page.waitForTimeout(150);
  await page.mouse.click(100, 820); // title bottom-left strip = sound toggle
  await page.waitForTimeout(150);
  const soundOff = await page.evaluate(
    () => JSON.parse(localStorage.getItem("colorfall-save")).settings.sound,
  );
  assert(soundOff === false, "s6/audio: sound chip toggles and persists mute");
  await page.reload();
  await page.waitForFunction(() => typeof window.__cd?.state === "function");
  const soundStill = await page.evaluate(
    () => JSON.parse(localStorage.getItem("colorfall-save")).settings.sound,
  );
  assert(soundStill === false, "s6/audio: mute survives reload");

  // — accessibility: symbols toggle persists —
  await page.mouse.click(290, 820); // title bottom-right strip = symbols toggle
  await page.waitForTimeout(150);
  const symbolsOn = await page.evaluate(
    () => JSON.parse(localStorage.getItem("colorfall-save")).settings.symbols,
  );
  assert(symbolsOn === true, "a11y: symbols mode toggles and persists");
  await page.evaluate(() => window.__cd.goto("l1"));
  await page.waitForTimeout(400);
  await page.screenshot({ path: "scripts/screenshot-symbols.png" });

  assert(errors.length === 0, `no console errors (got: ${errors.join(" | ")})`);
  await browser.close();
  console.log("\nALL VERIFIES PASS");
} finally {
  preview.kill();
}
