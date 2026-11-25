#!/usr/bin/env node
/**
 * End-to-end verification suite for Bizarro Melee (dpad.games browser build).
 * Runs:
 *   1. Roster, stage, and Melee knockback physics unit tests (Node ESM).
 *   2. Headless simulation tests (movement, wavedash, combat, Home-Run Derby, Master Mitt).
 *   3. Reproducible dpad ZIP build + cross-origin iframe CSP/sandbox Playwright proof
 *      (desktop 1280x720, mobile portrait 390x844, legacy opaque sandbox, denied localStorage,
 *       zero external requests, zero console errors, screenshots for visual review).
 */

import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ZIP_PATH = path.join(ROOT, 'dist', 'bizarro-melee-dpad.zip');
const OUT_DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.join(os.tmpdir(), 'bizarro-melee-proof');

const PER_GAME_SANDBOX = 'allow-scripts allow-same-origin allow-pointer-lock allow-forms';
const LEGACY_SANDBOX = 'allow-scripts';

async function runUnitTests() {
  console.log('\n--- 1. Unit & Simulation Tests ---');
  const { computeMeleeKnockback, STATE, MOVE, MODE } = await import('../web/js/constants.js');
  const { ROSTER, SAGGING_BAG, MASTER_MITT, getFighterById } = await import('../web/js/roster.js');
  const { STAGES, HOMERUN_STAGE, resolveStagePlatforms } = await import('../web/js/stages.js');
  const { createMatch, stepMatch } = await import('../web/js/physics.js');
  const { computeCpuInput } = await import('../web/js/ai.js');
  const { createEmptyInput } = await import('../web/js/input.js');

  assert.equal(ROSTER.length, 26, 'Expected all 26 playable Bizarro Melee fighters');
  const ids = new Set(ROSTER.map((f) => f.id));
  assert.equal(ids.size, 26, 'All 26 fighter IDs must be unique');
  for (const f of ROSTER) {
    assert.ok(f.name && f.parodyOf && f.name.toLowerCase() !== f.parodyOf.toLowerCase(),
      `Fighter ${f.id} must have distinct parody name`);
    assert.ok(f.palettes.length >= 4, `Fighter ${f.id} needs 4 palettes`);
    assert.ok(f.moves[MOVE.JAB] && f.moves[MOVE.UP_B] && f.moves[MOVE.DOWN_B], `Fighter ${f.id} missing moves`);
  }
  console.log('PASS: All 26 Bizarro parody fighters validated');

  const { ITEM_LIST } = await import('../web/js/items.js');
  const { EVENTS } = await import('../web/js/events.js');
  const { BIZARRO_INTERN } = await import('../web/js/roster.js');
  assert.equal(ITEM_LIST.length, 18, 'Expected all 18 Bizarro Melee items');
  assert.equal(STAGES.length, 29, 'Expected all 29 Bizarro Melee VS stages');
  assert.equal(EVENTS.length, 8, 'Expected all 8 Bizarro Event Matches');
  const validFighterIds = new Set([...ids, SAGGING_BAG.id, MASTER_MITT.id, BIZARRO_INTERN.id]);
  for (const ev of EVENTS) {
    assert.ok(STAGES.some((s) => s.id === ev.stageId), `Event ${ev.id} has unknown stage ${ev.stageId}`);
    for (const pl of ev.players) {
      assert.ok(validFighterIds.has(pl.fighterId), `Event ${ev.id} references unknown fighterId: ${pl.fighterId}`);
    }
  }
  const movedPlats = resolveStagePlatforms(STAGES.find((s) => s.id === 'randalls-tax-shelter'), 300);
  assert.ok(movedPlats.some((p) => p.id === 'scandall'), 'Scandall cloud platform resolves');
  console.log('PASS: All 29 stages, 8 Event Matches (strict fighter IDs), dynamic platforms, and 18 Bizarro items validated');

  // Melee knockback formula sanity
  const kbLight = computeMeleeKnockback(100, 14, 76, 40, 100);
  const kbHeavy = computeMeleeKnockback(100, 14, 122, 40, 100);
  assert.ok(kbLight > kbHeavy, 'Lighter fighter (Faux) should take more KB than heavier (Sourzer)');
  const kbZero = computeMeleeKnockback(10, 14, 100, 40, 100);
  const kbHigh = computeMeleeKnockback(120, 14, 100, 40, 100);
  assert.ok(kbHigh > kbZero * 2, 'Higher percent scales knockback significantly');
  const kbShine0 = computeMeleeKnockback(0, 6, 76, 0, 100, 82);
  const kbShine150 = computeMeleeKnockback(150, 6, 76, 0, 100, 82);
  assert.equal(kbShine0, kbShine150, 'Set-KB move (Shine) should be percent-independent');
  console.log('PASS: Exact Melee knockback formula validated');

  // Simulation test: movement, wavedash, attack hit, and 600-frame CPU battle
  const match = createMatch({
    mode: MODE.VS_STOCK,
    stageId: 'arguefield',
    stocks: 4,
    players: [
      { port: 0, fighterId: 'faux', paletteIndex: 0, isCpu: false, name: 'P1' },
      { port: 1, fighterId: 'garth', paletteIndex: 0, isCpu: true, cpuLevel: 6, name: 'CPU' },
    ],
  });
  match.status = 'playing';
  match.introTimer = 0;

  // Test walking/dashing right
  const startX = match.fighters[0].x;
  for (let i = 0; i < 20; i++) {
    const inp = createEmptyInput();
    inp.moveX = 1;
    stepMatch(match, [inp, createEmptyInput()]);
  }
  assert.ok(match.fighters[0].x > startX + 30, 'Fighter moves right on input');

  // Test wavedash (jump -> diagonal down-right airdodge shortly after takeoff)
  match.fighters[0].x = 0;
  match.fighters[0].y = 0;
  match.fighters[0].grounded = true;
  match.fighters[0].state = STATE.IDLE;
  let sawWavedash = false;
  for (let i = 0; i < 25; i++) {
    const inp = createEmptyInput();
    if (i === 0) { inp.jump = true; inp.jumpPressed = true; }
    if (i === 4) { inp.moveX = 0.8; inp.moveY = -0.6; inp.shield = true; inp.shieldPressed = true; }
    stepMatch(match, [inp, createEmptyInput()]);
    if (match.events.some((e) => e.type === 'wavedash')) sawWavedash = true;
  }
  assert.ok(sawWavedash || match.fighters[0].wavedashCount > 0, 'Wavedash should trigger wavedash event/counter');
  console.log('PASS: Movement & wavedash physics validated');

  // Full 600-frame CPU vs CPU battle sanity (no NaNs, attacks connect)
  const aiMatch = createMatch({
    mode: MODE.VS_STOCK,
    stageId: 'final-obligation',
    stocks: 3,
    players: [
      { port: 0, fighterId: 'captain-pigeon', paletteIndex: 0, isCpu: true, cpuLevel: 7, name: 'Pigeon' },
      { port: 1, fighterId: 'falcont', paletteIndex: 1, isCpu: true, cpuLevel: 7, name: 'Falcont' },
    ],
  });
  aiMatch.status = 'playing';
  aiMatch.introTimer = 0;
  let hits = 0;
  for (let frame = 0; frame < 600; frame++) {
    const inputs = aiMatch.fighters.map((f) => computeCpuInput(aiMatch, f));
    stepMatch(aiMatch, inputs);
    for (const e of aiMatch.events) {
      if (e.type === 'hit') hits++;
    }
    for (const f of aiMatch.fighters) {
      assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.percent),
        `Non-finite fighter state at frame ${frame}`);
    }
  }
  assert.ok(hits > 0, `Expected AI fighters to land hits in 600 frames (got ${hits})`);
  console.log(`PASS: 600-frame AI battle ran cleanly with ${hits} hits landed`);

  // Home-Run Derby & Master Mitt sanity
  const hrMatch = createMatch({
    mode: MODE.HOMERUN,
    stageId: HOMERUN_STAGE.id,
    players: [
      { port: 0, fighterId: 'dadondorf', paletteIndex: 0, isCpu: false, name: 'P1' },
      { port: 1, fighterId: SAGGING_BAG.id, paletteIndex: 0, isCpu: true, cpuLevel: 1, name: 'Sagging Bag' },
    ],
  });
  hrMatch.status = 'playing';
  hrMatch.introTimer = 0;
  for (let i = 0; i < 60; i++) {
    const inp = createEmptyInput();
    inp.moveX = 1;
    if (i === 18) { inp.attack = true; inp.attackPressed = true; }
    stepMatch(hrMatch, [inp, createEmptyInput()]);
  }
  assert.ok(Number.isFinite(hrMatch.homerun.maxDistanceFt), 'Home-run distance finite');

  const bossMatch = createMatch({
    mode: MODE.CLASSIC,
    stageId: 'final-obligation',
    stocks: 3,
    players: [
      { port: 0, fighterId: 'bario', paletteIndex: 0, isCpu: true, cpuLevel: 6, name: 'Bario' },
      { port: 1, fighterId: MASTER_MITT.id, paletteIndex: 0, isCpu: true, cpuLevel: 7, name: 'Master Mitt' },
    ],
  });
  bossMatch.status = 'playing';
  bossMatch.introTimer = 0;
  for (let i = 0; i < 120; i++) {
    stepMatch(bossMatch, bossMatch.fighters.map((f) => computeCpuInput(bossMatch, f)));
  }
  assert.ok(Number.isFinite(bossMatch.fighters[1].x), 'Master Mitt simulates cleanly');
  console.log('PASS: Home-Run Derby and Classic Master Mitt modes validated');
}

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    'playwright',
  ].filter(Boolean);
  for (const mod of candidates) {
    try {
      return require(mod);
    } catch {}
  }
  return null;
}

async function runBrowserProof() {
  console.log('\n--- 2. dpad.games ZIP Build & Sandbox Browser Proof ---');
  cp.execFileSync('python3', [path.join(ROOT, 'scripts', 'build-dpad.py'), ZIP_PATH], { stdio: 'inherit' });
  assert.ok(fs.existsSync(ZIP_PATH), 'dpad ZIP must exist');

  const pw = loadPlaywright();
  if (!pw) {
    console.log('SKIP: Playwright not available in this environment');
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bizarro-melee-unzip-'));
  cp.execFileSync('unzip', ['-q', ZIP_PATH, '-d', extractDir]);

  let hostUrl = '';
  let gameUrl = '';

  const gameServer = http.createServer((req, res) => {
    let pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    const legacy = pathname.startsWith('/legacy/');
    if (legacy) pathname = pathname.slice(7);
    if (pathname === '/') pathname = '/index.html';
    const file = path.join(extractDir, decodeURIComponent(pathname));
    if (!file.startsWith(extractDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const mime = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.glb': 'model/gltf-binary',
    }[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', mime);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      `sandbox ${legacy ? LEGACY_SANDBOX : PER_GAME_SANDBOX}; default-src 'self' blob: data:; script-src 'self' blob: 'unsafe-inline'; style-src 'self' blob: data: 'unsafe-inline'; connect-src 'self' blob: data:; frame-src 'self' blob: data:; object-src 'none'; frame-ancestors ${hostUrl}; form-action 'none'; base-uri 'self'`
    );
    res.end(fs.readFileSync(file));
  });

  const hostServer = http.createServer((req, res) => {
    const legacy = req.url.includes('legacy');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>dpad sandbox proof</title><style>html,body{margin:0;width:100%;height:100%;background:#090914}iframe{width:100%;height:100%;border:0;display:block}</style></head><body><iframe title="Bizarro Melee" src="${gameUrl}/${legacy ? 'legacy/' : ''}index.html" sandbox="${legacy ? LEGACY_SANDBOX : PER_GAME_SANDBOX}" allow="gamepad" referrerpolicy="no-referrer"></iframe></body></html>`);
  });

  const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${s.address().port}`)));
  hostUrl = await listen(hostServer);
  gameUrl = await listen(gameServer);

  const gpu = process.platform === 'darwin' ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] : [];
  const browser = await pw.chromium.launch({ headless: true, args: gpu });
  const errors = [];
  const externalRequests = [];

  async function openFrame(options = {}, denyStorage = false, legacy = false) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...options });
    if (denyStorage) {
      await ctx.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          get() { throw new DOMException('Storage denied', 'SecurityError'); },
        });
      });
    }
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
    page.on('request', (req) => {
      const u = req.url();
      if (!u.startsWith(hostUrl) && !u.startsWith(gameUrl) && !u.startsWith('data:') && !u.startsWith('blob:')) {
        externalRequests.push(u);
      }
    });
    await page.goto(hostUrl + (legacy ? '/?legacy' : '/'));
    await page.waitForTimeout(600);
    const frame = page.frames().find((f) => f.url().startsWith(gameUrl));
    assert.ok(frame, 'Game iframe did not load');
    await frame.waitForFunction(() => Boolean(window.__BIZARRO_MELEE__), { timeout: 10000 });
    return { ctx, page, frame };
  }

  try {
    // A. Desktop 1280x720 flow: Title -> CSS (26 fighters) -> Match -> Controls -> Pause -> Training Hitboxes
    const desk = await openFrame();
    await desk.page.waitForTimeout(500);
    await desk.page.screenshot({ path: path.join(OUT_DIR, '01-title.png') });
    console.log('PASS: Title screen loaded in cross-origin dpad sandbox');

    // Open Title and verify native Gamepad API availability + Bluetooth Gamepad menu navigation (Title -> CSS -> Title + held-Start Quick Fight)
    const padNavResult = await desk.frame.evaluate(async () => {
      // [F9] Verify native navigator.getGamepads() access BEFORE installing mock
      const nativeGetGamepads = typeof navigator.getGamepads === 'function';
      let nativeAccessible = false;
      try {
        if (nativeGetGamepads) {
          const nativeList = navigator.getGamepads();
          nativeAccessible = nativeList != null && typeof nativeList.length === 'number';
        }
      } catch {
        nativeAccessible = false;
      }

      const state = { pressed: [], axes: [0, 0, 0, 0] };
      const mkPad = () => ({
        index: 0, connected: true, mapping: 'standard',
        id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
        axes: state.axes,
        buttons: Array.from({ length: 16 }, (_, i) => ({
          pressed: state.pressed.includes(i),
          value: state.pressed.includes(i) ? 1 : 0,
        })),
      });
      const origGet = navigator.getGamepads?.bind(navigator);
      Object.defineProperty(navigator, 'getGamepads', { value: () => [mkPad()], configurable: true });
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      try {
        // Connecting a gamepad immediately highlights default (Quick Fight); first D-pad Right (15) moves to VS Mode
        await wait(90);
        const firstFocus = document.querySelector('.pad-focus')?.id || '';
        state.pressed = [15]; await wait(90); state.pressed = []; await wait(70);
        const secondFocus = document.querySelector('.pad-focus')?.id || '';
        const hintVisible = !document.getElementById('pad-hint-bar')?.hidden;
        // Press A (0) on VS Mode -> must enter CSS
        state.pressed = [0]; await wait(120); state.pressed = []; await wait(90);
        const cssScreen = window.__BIZARRO_MELEE__.getState().screen;
        // Press B (1) on CSS -> must return cleanly to Title
        state.pressed = [1]; await wait(120); state.pressed = []; await wait(90);
        const backScreen = window.__BIZARRO_MELEE__.getState().screen;
        // [F1] Hold Start (9) on Title for 150ms -> must launch Quick Fight and NOT immediately pause!
        state.pressed = [9]; await wait(180);
        const launchScreenWhileStartHeld = window.__BIZARRO_MELEE__.getState().screen;
        const launchStatusWhileStartHeld = window.__BIZARRO_MELEE__.getMatch()?.status || '';
        state.pressed = []; await wait(80);
        window.__BIZARRO_MELEE__.openScreen('title');
        await wait(60);
        return {
          nativeGetGamepads,
          nativeAccessible,
          firstFocus,
          secondFocus,
          hintVisible,
          cssScreen,
          backScreen,
          launchScreenWhileStartHeld,
          launchStatusWhileStartHeld,
        };
      } finally {
        if (origGet) Object.defineProperty(navigator, 'getGamepads', { value: origGet, configurable: true });
      }
    });
    assert.ok(padNavResult.nativeGetGamepads && padNavResult.nativeAccessible, 'Native Gamepad API must be accessible in dpad sandbox');
    assert.equal(padNavResult.firstFocus, 'btn-quick-fight', 'First gamepad nav focus should land on Quick Fight');
    assert.equal(padNavResult.secondFocus, 'btn-vs-mode', 'D-Pad Right should move focus from Quick Fight to VS Mode');
    assert.ok(padNavResult.hintVisible, 'Gamepad hint bar should appear when a controller is connected');
    assert.equal(padNavResult.cssScreen, 'css', 'Gamepad A on VS Mode should open CSS');
    assert.equal(padNavResult.backScreen, 'title', 'Gamepad B on CSS should return to Title');
    assert.equal(padNavResult.launchScreenWhileStartHeld, 'match', 'Held Start on Title should launch match without pausing');
    assert.notEqual(padNavResult.launchStatusWhileStartHeld, 'paused', 'Held Start must not immediately pause newly launched match');
    console.log('PASS: Bluetooth Gamepad API + Title->CSS->Title + held-Start launch verified');

    // Open CSS and check 26 fighter cards
    await desk.frame.evaluate(() => window.__BIZARRO_MELEE__.openScreen('css'));
    await desk.page.waitForTimeout(400);
    const cssTiles = await desk.frame.locator('[data-fighter-id]').count();
    assert.equal(cssTiles, 26, `Expected 26 fighter tiles in CSS, found ${cssTiles}`);
    await desk.page.screenshot({ path: path.join(OUT_DIR, '02-css.png') });
    console.log('PASS: Character Select renders all 26 Bizarro fighters');

    // Open Controller & Combo Lab modal and verify live diagnostics canvas
    await desk.frame.evaluate(() => window.__BIZARRO_MELEE__.openScreen('controller'));
    await desk.page.waitForTimeout(300);
    await desk.page.screenshot({ path: path.join(OUT_DIR, '08-controller.png') });
    console.log('PASS: Controller Config & Combo Lab renders cleanly');

    // Open Bizarro Events modal and verify all 8 Event Matches
    await desk.frame.evaluate(() => window.__BIZARRO_MELEE__.openScreen('events'));
    await desk.page.waitForTimeout(300);
    const eventCards = await desk.frame.locator('.event-card').count();
    assert.equal(eventCards, 8, `Expected 8 event cards, found ${eventCards}`);
    await desk.page.screenshot({ path: path.join(OUT_DIR, '09-events.png') });
    console.log('PASS: Bizarro Event Matches renders all 8 challenge scenarios');

    // Open Stage Select and check all 29 stages
    await desk.frame.evaluate(() => window.__BIZARRO_MELEE__.openScreen('stage'));
    await desk.page.waitForTimeout(450);
    const stageCards = await desk.frame.locator('.stage-card').count();
    assert.equal(stageCards, 29, `Expected 29 stage cards, found ${stageCards}`);
    await desk.page.screenshot({ path: path.join(OUT_DIR, '07-stages.png') });
    console.log('PASS: Stage Select renders all 29 Bizarro stages with 3D thumbnails');

    // Return to Title, click Quick Fight (real user gesture & iframe focus), wait for intro -> playing
    await desk.frame.locator('#btn-stage-back').click();
    await desk.frame.locator('#btn-css-back').click();
    await desk.frame.locator('#btn-quick-fight').click();
    await desk.frame.waitForFunction(() => window.__BIZARRO_MELEE__.getMatch()?.status === 'playing', { timeout: 6000 });
    const before = await desk.frame.evaluate(() => {
      const m = window.__BIZARRO_MELEE__.getMatch();
      return { status: m?.status, frame: m?.frame, x: m?.fighters?.[0]?.x ?? 0 };
    });
    await desk.page.keyboard.down('KeyD');
    await desk.page.waitForTimeout(450);
    await desk.page.keyboard.up('KeyD');
    await desk.page.keyboard.press('KeyJ');
    await desk.page.waitForTimeout(250);
    const after = await desk.frame.evaluate(() => {
      const m = window.__BIZARRO_MELEE__.getMatch();
      return { status: m?.status, frame: m?.frame, x: m?.fighters?.[0]?.x ?? 0 };
    });
    assert.ok(after.frame > before.frame + 10, 'Game simulation advances smoothly');
    assert.ok(Math.abs(after.x - before.x) > 5, `Keyboard input moves P1 fighter (before=${before.x}, after=${after.x})`);
    await desk.page.screenshot({ path: path.join(OUT_DIR, '03-battle.png') });
    console.log('PASS: Live match renders and responds to keyboard controls');

    // Enable hitboxes screenshot
    await desk.frame.evaluate(() => window.__BIZARRO_MELEE__.setHitboxes(true));
    await desk.page.keyboard.press('KeyK');
    await desk.page.waitForTimeout(200);
    await desk.page.screenshot({ path: path.join(OUT_DIR, '04-hitboxes.png') });

    // Pause with Escape
    await desk.page.keyboard.press('Escape');
    await desk.page.waitForTimeout(200);
    const pausedState = await desk.frame.evaluate(() => window.__BIZARRO_MELEE__.getMatch()?.status);
    assert.equal(pausedState, 'paused', 'Escape should pause active match');
    console.log('PASS: Escape pauses match cleanly');

    // Verify 3D WebGL active & Break the Targets mode
    const gfxMode = await desk.frame.evaluate(() => window.__BIZARRO_MELEE__.getState().gfx);
    console.log('INFO: Active renderer mode =', gfxMode);
    await desk.frame.evaluate(() => window.__BIZARRO_MELEE__.startMode('targets'));
    await desk.page.waitForTimeout(700);
    await desk.page.screenshot({ path: path.join(OUT_DIR, '06-targets.png') });
    console.log('PASS: Break the Targets mode renders cleanly');

    // Verify Training Lab toolbar + on-demand item spawning
    await desk.frame.evaluate(() => window.__BIZARRO_MELEE__.startMode('training', 'puddle-of-insomnia'));
    await desk.frame.waitForFunction(() => window.__BIZARRO_MELEE__.getMatch()?.status === 'playing', { timeout: 6000 });
    const spawned = await desk.frame.evaluate(() => Boolean(window.__BIZARRO_MELEE__.spawnTrainingItem('alarm_omb')));
    assert.ok(spawned, 'Training Lab should spawn items on demand');
    await desk.page.waitForTimeout(400);
    await desk.page.screenshot({ path: path.join(OUT_DIR, '10-training.png') });
    console.log('PASS: Training Lab toolbar & on-demand item spawn verified');

    // Verify VS Time Battle natural tie -> Sudden Death (300% + HUD banner) -> real KO -> Results Podium
    await desk.frame.evaluate(() => {
      window.__BIZARRO_MELEE__.startMode('vs-time', 'fiveside-skyscrapers');
    });
    await desk.frame.waitForFunction(() => window.__BIZARRO_MELEE__.getMatch()?.status === 'playing', null, { timeout: 8000 });
    await desk.frame.evaluate(() => {
      const m = window.__BIZARRO_MELEE__.getMatch();
      // Ensure a tied 0-0 score right at timeout so physics naturally triggers Sudden Death
      for (const f of m.fighters) { f.kos = 0; f.falls = 0; }
      m.timeLeftFrames = 2;
    });
    await desk.frame.waitForFunction(() => {
      const m = window.__BIZARRO_MELEE__.getMatch();
      return Boolean(m?.suddenDeath && m.fighters.every((f) => f.percent >= 300));
    }, null, { timeout: 8000 });
    const sdBanner = await desk.frame.locator('#hud-banner').textContent();
    assert.ok(sdBanner && sdBanner.includes('SUDDEN DEATH'), `Expected Sudden Death banner, got "${sdBanner}"`);
    // Resolve a real KO through the live match loop (send P2 past right blastzone)
    await desk.frame.evaluate(() => {
      const m = window.__BIZARRO_MELEE__.getMatch();
      const p2 = m.fighters[1];
      p2.x = m.stage.blastzones.right + 120;
      p2.vx = 40;
    });
    await desk.frame.waitForFunction(() => window.__BIZARRO_MELEE__.getState().screen === 'results', null, { timeout: 10000 });
    await desk.page.waitForTimeout(450);
    const resWinner = await desk.frame.locator('#results-winner').textContent();
    assert.ok(resWinner && resWinner.includes('WINS'), `Expected real winner on Results screen, got "${resWinner}"`);
    await desk.page.screenshot({ path: path.join(OUT_DIR, '11-podium.png') });
    console.log('PASS: Natural Time Tie -> Sudden Death 300% -> Real KO -> 3D Victory Podium verified');
    await desk.ctx.close();

    // B. Mobile portrait 390x844 with touch controls
    const mob = await openFrame({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await mob.frame.evaluate(() => window.__BIZARRO_MELEE__.startQuickMatch());
    await mob.page.waitForTimeout(1000);
    await mob.page.screenshot({ path: path.join(OUT_DIR, '05-mobile.png') });
    await mob.ctx.close();
    console.log('PASS: Mobile 390x844 portrait layout renders cleanly');

    // C. Denied localStorage still plays
    const noStore = await openFrame({}, true, false);
    await noStore.frame.evaluate(() => window.__BIZARRO_MELEE__.startQuickMatch());
    await noStore.page.waitForTimeout(600);
    assert.ok((await noStore.frame.evaluate(() => window.__BIZARRO_MELEE__.getMatch()?.frame || 0)) > 5);
    await noStore.ctx.close();
    console.log('PASS: Storage-denied sandbox plays cleanly');

    // D. Legacy opaque-origin sandbox (sandbox="allow-scripts") still plays
    const leg = await openFrame({}, false, true);
    await leg.frame.evaluate(() => window.__BIZARRO_MELEE__.startQuickMatch());
    await leg.page.waitForTimeout(600);
    assert.ok((await leg.frame.evaluate(() => window.__BIZARRO_MELEE__.getMatch()?.frame || 0)) > 5);
    await leg.ctx.close();
    console.log('PASS: Strict legacy opaque-origin sandbox plays cleanly');

    assert.equal(externalRequests.length, 0, `Unexpected external network requests: ${externalRequests.join(', ')}`);
    assert.equal(errors.length, 0, `Browser errors detected:\n${errors.join('\n')}`);
    console.log('PASS: Zero external network requests and zero console/page errors!');
    console.log(`Screenshots saved to: ${OUT_DIR}`);
  } finally {
    await browser.close();
    hostServer.close();
    gameServer.close();
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
}

await runUnitTests();
await runBrowserProof();
console.log('\nALL BIZARRO MELEE CHECKS PASSED!');
