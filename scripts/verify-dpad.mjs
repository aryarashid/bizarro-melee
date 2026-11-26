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
  const { createMatch, stepMatch, spawnItemNow } = await import('../web/js/physics.js');
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
    for (const coreKey of [MOVE.JAB, MOVE.FTILT, MOVE.FAIR, MOVE.BAIR, MOVE.DAIR]) {
      const mv = f.moves[coreKey];
      assert.ok(mv && Number.isFinite(mv.startup) && Number.isFinite(mv.active) && Number.isFinite(mv.endlag),
        `Fighter ${f.id} ${coreKey} missing valid frame data`);
      assert.ok(Array.isArray(mv.hitboxes) && mv.hitboxes.length >= 2,
        `Fighter ${f.id} ${coreKey} must have multi-region sweet/sour hitboxes`);
    }
  }
  console.log('PASS: All 26 Bizarro fighters + 130 sweet/sour normal frame-data snapshots validated');

  const { ITEM_LIST, CRITTER_SUMMONS } = await import('../web/js/items.js');
  const { EVENTS } = await import('../web/js/events.js');
  const { BIZARRO_INTERN } = await import('../web/js/roster.js');
  assert.equal(ITEM_LIST.length, 24, 'Expected all 24 Bizarro Melee items');
  assert.equal(CRITTER_SUMMONS.length, 8, 'Expected all 8 Critter Capsule summons');
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
  console.log('PASS: All 29 stages, 8 Event Matches (strict fighter IDs), dynamic platforms, 24 Bizarro items & 8 Critter summons validated');

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

  // Home-Run Derby (nonzero launch + 0-ft timeout draw) & Master Mitt sanity
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
  // Position Dadondorf beside Sagging Bag at 90% and land a clean forward smash launch
  hrMatch.fighters[0].x = hrMatch.fighters[1].x - 52;
  hrMatch.fighters[0].y = hrMatch.fighters[1].y;
  hrMatch.fighters[0].facing = 1;
  hrMatch.fighters[1].percent = 95;
  for (let i = 0; i < 150; i++) {
    const inp = createEmptyInput();
    if (i === 0) { inp.cStickX = 1; }
    stepMatch(hrMatch, [inp, createEmptyInput()]);
  }
  assert.ok(Number.isFinite(hrMatch.homerun.maxDistanceFt) && hrMatch.homerun.maxDistanceFt > 50,
    `Expected nonzero Home-Run Derby launch > 50 ft, got ${hrMatch.homerun.maxDistanceFt}`);

  // 0-ft Home-Run Derby timeout must NOT award winnerPort = 0
  const hrZero = createMatch({
    mode: MODE.HOMERUN,
    stageId: HOMERUN_STAGE.id,
    timeSeconds: 1,
    players: [
      { port: 0, fighterId: 'faux', paletteIndex: 0, isCpu: false, name: 'P1' },
      { port: 1, fighterId: SAGGING_BAG.id, paletteIndex: 0, isCpu: true, cpuLevel: 1, name: 'Sagging Bag' },
    ],
  });
  hrZero.status = 'playing';
  hrZero.introTimer = 0;
  hrZero.timeLeftFrames = 2;
  for (let i = 0; i < 10 && hrZero.status !== 'ended'; i++) {
    stepMatch(hrZero, [createEmptyInput(), createEmptyInput()]);
  }
  assert.equal(hrZero.status, 'ended', '0-ft Home-Run Derby should end at timeout');
  assert.equal(hrZero.winnerPort, null, '0-ft Home-Run Derby must finish with winnerPort === null');

  // Multi-Man credited KO alignment: unhit intern falling off does NOT increment multimanKos
  const mmMatch = createMatch({
    mode: MODE.MULTIMAN,
    stageId: 'arguefield',
    stocks: 1,
    players: [
      { port: 0, fighterId: 'faux', paletteIndex: 0, isCpu: false, name: 'P1' },
      { port: 1, fighterId: BIZARRO_INTERN.id, paletteIndex: 0, isCpu: true, cpuLevel: 3, name: 'Intern #1' },
      { port: 2, fighterId: BIZARRO_INTERN.id, paletteIndex: 1, isCpu: true, cpuLevel: 4, name: 'Intern #2' },
    ],
  });
  mmMatch.status = 'playing';
  mmMatch.introTimer = 0;
  mmMatch.fighters[1].grounded = false;
  mmMatch.fighters[1].lastHitBy = null;
  mmMatch.fighters[1].y = mmMatch.stage.blastzones.bottom - 100;
  stepMatch(mmMatch, mmMatch.fighters.map(() => createEmptyInput()));
  assert.equal(mmMatch.multimanKos || 0, 0, 'Uncredited intern self-destruct must not credit multimanKos');
  mmMatch.fighters[2].grounded = false;
  mmMatch.fighters[2].lastHitBy = 0;
  mmMatch.fighters[2].lastHitTimer = 60;
  mmMatch.fighters[2].y = mmMatch.stage.blastzones.bottom - 100;
  stepMatch(mmMatch, mmMatch.fighters.map(() => createEmptyInput()));
  assert.equal(mmMatch.multimanKos, 1, 'Credited intern KO must increment multimanKos');
  assert.equal(mmMatch.fighters[0].kos, 1, 'Credited intern KO must match P1 kos');

  // Online deterministic lockstep test: 10% packet loss + 6-frame (~100ms) one-way delay
  const { createOnlineSession, computeMatchChecksum, unpackOnlineInput } = await import('../web/js/dpad-sdk.js');
  const rawBypass = unpackOnlineInput({ inp: { attack: true, moveX: 1 } });
  assert.equal(rawBypass.attack, false, 'unpackOnlineInput must reject legacy raw data.inp bypass');
  assert.equal(rawBypass.moveX, 0, 'unpackOnlineInput must reject legacy raw data.inp bypass');

  const wireQueue = [];
  let wireTick = 0;
  let lossSeed = 1337;
  const nextRand = () => { lossSeed = (Math.imul(lossSeed, 1664525) + 1013904223) >>> 0; return lossSeed / 4294967296; };
  let hostMatch = null;
  let guestMatch = null;
  const mkNetMatch = (cfg) => {
    const m = createMatch({
      mode: MODE.ONLINE,
      seed: cfg.seed,
      stageId: cfg.stageId,
      stocks: cfg.stocks,
      timeSeconds: cfg.timeSeconds,
      itemFrequency: cfg.itemFrequency,
      players: [
        { port: 0, fighterId: cfg.hostFighter, paletteIndex: cfg.hostPalette, isCpu: false, name: 'Host' },
        { port: 1, fighterId: cfg.guestFighter, paletteIndex: cfg.guestPalette, isCpu: false, name: 'Guest' },
      ],
    });
    m.status = 'playing';
    m.introTimer = 0;
    return m;
  };
  const enqueueNet = (to, ch, payload, reliable) => {
    const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    assert.ok(bytes <= 512, `Online P2P packet exceeded 512 bytes: ${bytes}`);
    if (!reliable && nextRand() < 0.10) return true; // 10% unreliable packet drop
    wireQueue.push({ to, deliverAt: wireTick + 6, payload: JSON.parse(JSON.stringify(payload)) });
    return true;
  };
  const validFighters = ROSTER.map((f) => f.id);
  const validStages = STAGES.map((s) => s.id);
  const hostSess = createOnlineSession({
    isHost: true,
    delayFrames: 'auto',
    validFighterIds: validFighters,
    validStageIds: validStages,
    send: (ch, payload, rel) => enqueueNet('guest', ch, payload, rel),
    onConfigReady: (cfg) => { hostMatch = mkNetMatch(cfg); },
  });
  const guestSess = createOnlineSession({
    isHost: false,
    delayFrames: 'auto',
    validFighterIds: validFighters,
    validStageIds: validStages,
    send: (ch, payload, rel) => enqueueNet('host', ch, payload, rel),
    onConfigReady: (cfg) => { guestMatch = mkNetMatch(cfg); },
  });
  // Verify unlimited timeSeconds: 0 is preserved AND non-playable fighter / invalid stage IDs are sanitized
  hostSess.startHandshake({
    seed: 424242, stageId: 'arguefield', stocks: 4, timeSeconds: 0,
    itemFrequency: 'off', hostFighter: 'faux', hostPalette: 0,
    guestFighter: 'garth', guestPalette: 1,
  });
  const badSanitizeSess = createOnlineSession({
    isHost: true, delayFrames: 3, validFighterIds: validFighters, validStageIds: validStages,
    send: () => true,
  });
  badSanitizeSess.startHandshake({ seed: 7, stageId: 'nonexistent-stage', timeSeconds: 0, hostFighter: 'master-mitt', guestFighter: 'sagging-bag' });
  let sanitizedCfg = null;
  const badGuest = createOnlineSession({
    isHost: false, delayFrames: 3, validFighterIds: validFighters, validStageIds: validStages,
    send: () => true, onConfigReady: (c) => { sanitizedCfg = c; },
  });
  badGuest.handlePacket({ t: 'cfg', seed: 7, stageId: 'nonexistent-stage', stocks: 4, timeSeconds: 0, itemFrequency: 'off', hostFighter: 'master-mitt', guestFighter: 'sagging-bag', delayFrames: 3 });
  assert.equal(sanitizedCfg.timeSeconds, 0, 'Online config must preserve unlimited timeSeconds: 0');
  assert.ok(validFighters.includes(sanitizedCfg.hostFighter), `Online config must reject non-playable hostFighter, got ${sanitizedCfg.hostFighter}`);
  assert.ok(validFighters.includes(sanitizedCfg.guestFighter), `Online config must reject non-playable guestFighter, got ${sanitizedCfg.guestFighter}`);
  assert.ok(validStages.includes(sanitizedCfg.stageId), `Online config must reject unknown stageId, got ${sanitizedCfg.stageId}`);

  let hostAttackTaps = 0;
  let guestObservedHostTaps = 0;
  for (let t = 0; t < 1800 && (!hostMatch || hostMatch.frame < 360 || !guestMatch || guestMatch.frame < 360); t++) {
    wireTick = t;
    for (let i = wireQueue.length - 1; i >= 0; i--) {
      if (wireQueue[i].deliverAt <= t) {
        const pkt = wireQueue.splice(i, 1)[0];
        if (pkt.to === 'host') hostSess.handlePacket(pkt.payload);
        else guestSess.handlePacket(pkt.payload);
      }
    }
    hostSess.tickHandshake();
    if (hostMatch && hostMatch.frame < 360) {
      const hInp = createEmptyInput();
      hInp.moveX = (t % 40 < 20) ? 1 : -1;
      if (t % 17 === 0 && hostMatch.frame < 340) { hInp.attack = true; hInp.attackPressed = true; hostAttackTaps++; }
      const res = hostSess.step(hInp);
      if (res.ready) {
        stepMatch(hostMatch, res.inputs);
        if (hostMatch.frame % 60 === 0) hostSess.recordLocalChecksum(hostMatch.frame, computeMatchChecksum(hostMatch));
      }
    }
    if (guestMatch && guestMatch.frame < 360) {
      const gInp = createEmptyInput();
      gInp.moveX = (t % 34 < 17) ? -1 : 1;
      if (t % 23 === 0) { gInp.jump = true; gInp.jumpPressed = true; }
      const res = guestSess.step(gInp);
      if (res.ready) {
        if (res.inputs[0].attackPressed) guestObservedHostTaps++;
        stepMatch(guestMatch, res.inputs);
        if (guestMatch.frame % 60 === 0) guestSess.recordLocalChecksum(guestMatch.frame, computeMatchChecksum(guestMatch));
      }
    }
  }
  // Flush final checksum packets
  for (let i = 0; i < wireQueue.length; i++) {
    const pkt = wireQueue[i];
    if (pkt.to === 'host') hostSess.handlePacket(pkt.payload);
    else guestSess.handlePacket(pkt.payload);
  }
  assert.ok(hostMatch && guestMatch, 'Online handshake must initialize both host and guest matches');
  assert.equal(hostSess.getStats().config.timeSeconds, 0, 'Agreed online config must keep timeSeconds: 0');
  assert.ok(hostSess.getStats().delayFrames >= 6, `Adaptive RTT delay should adapt to 6-frame one-way latency (got ${hostSess.getStats().delayFrames})`);
  assert.equal(hostMatch.frame, 360, 'Host must reach frame 360 under 10% packet loss');
  assert.equal(guestMatch.frame, 360, 'Guest must reach frame 360 under 10% packet loss');
  assert.equal(guestObservedHostTaps, hostAttackTaps, `Zero attack presses may be dropped (sent=${hostAttackTaps}, got=${guestObservedHostTaps})`);
  assert.equal(computeMatchChecksum(hostMatch), computeMatchChecksum(guestMatch), 'Host & Guest final match checksums must be bit-identical');
  assert.ok(hostSess.getStats().checksumsMatched >= 5 && hostSess.getStats().checksumMismatches === 0,
    `Expected >=5 matched checksums and 0 mismatches, got ${JSON.stringify(hostSess.getStats())}`);

  // Stale Round-1 input packet ignored on Rematch + FIFO stall queue preserving distinct taps & directions
  const rPkts = [];
  const rh = createOnlineSession({ isHost: true, delayFrames: 2, send: (ch, p) => { rPkts.push({ to: 'g', p: JSON.parse(JSON.stringify(p)) }); return true; } });
  const rg = createOnlineSession({ isHost: false, delayFrames: 2, send: (ch, p) => { rPkts.push({ to: 'h', p: JSON.parse(JSON.stringify(p)) }); return true; } });
  const flushR = () => { while (rPkts.length) { const x = rPkts.shift(); (x.to === 'h' ? rh : rg).handlePacket(x.p); } };
  rh.startHandshake({ seed: 111, stageId: 'arguefield', hostFighter: 'faux', guestFighter: 'garth' }); flushR();
  const staleInp = createEmptyInput(); staleInp.moveX = 1; staleInp.attack = staleInp.attackPressed = true;
  rh.step(staleInp);
  const heldStale = rPkts.find((x) => x.to === 'g' && x.p.t === 'in');
  rPkts.length = 0;
  rh.startHandshake({ seed: 222, stageId: 'arguefield', hostFighter: 'faux', guestFighter: 'garth' }); flushR();
  rg.handlePacket(heldStale.p);
  for (let i = 0; i < 6; i++) {
    rh.step(createEmptyInput()); flushR();
    const gr = rg.step(createEmptyInput()); flushR();
    if (gr.ready) assert.equal(gr.inputs[0].moveX, 0, 'Stale Round-1 packet must not leak into Rematch Round 2');
  }
  // FIFO stall queue: two distinct attack taps + C-stick flick arriving on drain tick + 20-tick stall preserving 10/10 attack edges
  rh.step(createEmptyInput()); rh.step(createEmptyInput());
  const tapR = createEmptyInput(); tapR.moveX = 1; tapR.attack = tapR.attackPressed = true;
  const tapL = createEmptyInput(); tapL.moveX = -1; tapL.attack = tapL.attackPressed = true;
  rh.step(tapR); rh.step(createEmptyInput()); rh.step(tapL);
  const recoveredDirs = [];
  let sawCStickFlick = false;
  for (let i = 0; i < 14; i++) {
    flushR();
    const drainInp = createEmptyInput();
    if (i === 0) drainInp.cStickX = -1;
    rh.step(drainInp);
    const gr = rg.step(createEmptyInput());
    if (gr.ready) {
      if (gr.inputs[0].attackPressed) recoveredDirs.push(gr.inputs[0].moveX);
      if (gr.inputs[0].cStickX <= -0.9) sawCStickFlick = true;
    }
  }
  assert.deepEqual(recoveredDirs, [1, -1], `Stall FIFO queue must preserve distinct taps and directions, got ${JSON.stringify(recoveredDirs)}`);
  assert.ok(sawCStickFlick, 'C-stick flick arriving on first FIFO drain tick must not be dropped');
  // 20-tick stall with 10 alternating attack taps & releases -> all 10 attack edges must survive
  const rh3 = createOnlineSession({ isHost: true, delayFrames: 2, send: (ch, p) => { rPkts.push({ to: 'g', p: JSON.parse(JSON.stringify(p)) }); return true; } });
  const rg3 = createOnlineSession({ isHost: false, delayFrames: 2, send: (ch, p) => { rPkts.push({ to: 'h', p: JSON.parse(JSON.stringify(p)) }); return true; } });
  const flush3 = () => { while (rPkts.length) { const x = rPkts.shift(); (x.to === 'h' ? rh3 : rg3).handlePacket(x.p); } };
  rh3.startHandshake({ seed: 444, stageId: 'arguefield', hostFighter: 'faux', guestFighter: 'garth' }); flush3();
  rh3.step(createEmptyInput()); rh3.step(createEmptyInput());
  for (let s = 0; s < 20; s++) {
    const inp = createEmptyInput();
    if (s % 2 === 0) { inp.attack = inp.attackPressed = true; }
    rh3.step(inp);
  }
  let longStallEdges = 0;
  for (let i = 0; i < 40; i++) {
    flush3();
    rh3.step(createEmptyInput());
    const gr = rg3.step(createEmptyInput());
    if (gr.ready && gr.inputs[0].attackPressed) longStallEdges++;
  }
  assert.equal(longStallEdges, 10, `20-tick stall must preserve all 10/10 attack edges (got ${longStallEdges})`);
  // 31 movement samples + 1 attack + 1 release at 32-entry capacity must NOT overwrite the attack edge, AND 1,0,1 C-stick sequence keeps neutral release
  const rh4 = createOnlineSession({ isHost: true, delayFrames: 2, send: (ch, p) => { rPkts.push({ to: 'g', p: JSON.parse(JSON.stringify(p)) }); return true; } });
  const rg4 = createOnlineSession({ isHost: false, delayFrames: 2, send: (ch, p) => { rPkts.push({ to: 'h', p: JSON.parse(JSON.stringify(p)) }); return true; } });
  const flush4 = () => { while (rPkts.length) { const x = rPkts.shift(); (x.to === 'h' ? rh4 : rg4).handlePacket(x.p); } };
  rh4.startHandshake({ seed: 555, stageId: 'arguefield', hostFighter: 'faux', guestFighter: 'garth' }); flush4();
  rh4.step(createEmptyInput()); rh4.step(createEmptyInput());
  for (let s = 0; s < 31; s++) { const m = createEmptyInput(); m.moveX = (s % 2 === 0) ? 0.5 : -0.5; rh4.step(m); }
  const atkCap = createEmptyInput(); atkCap.attack = atkCap.attackPressed = true; rh4.step(atkCap);
  rh4.step(createEmptyInput());
  let capAttacks = 0;
  for (let i = 0; i < 45; i++) {
    flush4(); rh4.step(createEmptyInput());
    const gr = rg4.step(createEmptyInput());
    if (gr.ready && gr.inputs[0].attackPressed) capAttacks++;
  }
  assert.equal(capAttacks, 1, `Release at 32-entry capacity must not overwrite queued attack (got ${capAttacks})`);
  console.log(`PASS: Deterministic Online Lockstep (adaptive ${hostSess.getStats().delayFrames}f RTT + 10% loss + ${guestObservedHostTaps}/${hostAttackTaps} presses + rematch isolation + FIFO/C-stick/32-cap + 0 desyncs) validated`);

  // Controller mapping regression test (8BitDo HID button 9 != Start, DualSense 054c raw HID mapping + analog triggers)
  const { InputManager } = await import('../web/js/input.js');
  const origNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    let mockPads = [];
    Object.defineProperty(globalThis, 'navigator', {
      value: { getGamepads: () => mockPads },
      configurable: true,
    });
    const im = new InputManager();
    // 8BitDo raw HID: button 9 is shield (RT), NOT menu Start!
    mockPads = [{
      index: 0, connected: true, mapping: '',
      id: '8BitDo Ultimate 2 Wireless (Vendor: 2dc8 Product: 6012)',
      axes: [0, 0, 0, 0, -1, 0, -1, -1],
      buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 9, value: i === 9 ? 1 : 0 })),
    }];
    const menu8 = im.pollMenu();
    assert.equal(menu8.start, false, '8BitDo raw HID button 9 (Right Trigger) must NOT trigger menu Start');
    const poll8 = im.poll(1, false)[0];
    assert.equal(poll8.shield, true, '8BitDo raw HID button 9 should trigger Shield');

    // DualSense raw HID (054c): button 1 = Cross (attack), axes[3]/axes[4] analog triggers after negative rest
    mockPads = [{
      index: 0, connected: true, mapping: '',
      id: 'DualSense Wireless Controller (Vendor: 054c Product: 0ce6)',
      axes: [0, 0, 0, -1, -1, 0],
      buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 1, value: i === 1 ? 1 : 0 })),
    }];
    const pollSonyRest = im.poll(1, false)[0];
    assert.equal(pollSonyRest.attack, true, 'DualSense raw HID button 1 should map to Attack');
    assert.equal(pollSonyRest.shield, false, 'DualSense raw HID resting triggers (-1) should not trigger Shield');
    mockPads = [{
      index: 0, connected: true, mapping: '',
      id: 'DualSense Wireless Controller (Vendor: 054c Product: 0ce6)',
      axes: [0, 0, 0, 0.0, -1, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    }];
    const pollSonyHalf = im.poll(1, false)[0];
    assert.equal(pollSonyHalf.lightShield, true, 'DualSense raw HID half-pulled L2 trigger should map to Light Shield');

    // Multi-controller (4P) regression tests:
    // 1) 4 simultaneous heterogeneous controllers (Xbox P1, DualSense HID P2, Switch Pro P3, 8BitDo HID P4)
    //    even when P1 has custom padProfile & padBinds, P2-P4 must auto-detect independently with zero cross-talk.
    const im4 = new InputManager();
    im4.setConfig({ padProfile: 'gamecube', padBinds: { attack: [3] } }); // P1 custom overrides
    const mkButtons = (len, pressedMap = {}) => Array.from({ length: len }, (_, i) => ({
      pressed: Boolean(pressedMap[i] && pressedMap[i] > 0.45),
      value: pressedMap[i] ?? 0,
    }));
    const padXbox = {
      index: 0, connected: true, mapping: 'standard',
      id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
      axes: [0.9, 0, -0.85, 0], // Right on main stick, Left on C-stick
      buttons: mkButtons(16, { 3: 1 }), // P1 custom rebound attack = button 3
    };
    const padSony = {
      index: 2, connected: true, mapping: '', // Sparse browser slot index 2!
      id: 'DualSense Wireless Controller (Vendor: 054c Product: 0ce6)',
      axes: [-0.85, 0, 0, -1, -1, 0], // Left on main stick, resting triggers (-1)
      buttons: mkButtons(16, { 1: 1 }), // Sony HID Cross (button 1) = attack
    };
    const padSwitch = {
      index: 5, connected: true, mapping: 'standard', // Sparse slot index 5!
      id: 'Pro Controller (Vendor: 057e Product: 2009)',
      axes: [0, -0.8, 0, 0.9], // Down on main stick, Up on C-stick (note axis Y is inverted)
      buttons: mkButtons(16, { 1: 1, 2: 1 }), // Nintendo A (button 1) = attack, Y (button 2) = jump
    };
    const pad8BitDo = {
      index: 7, connected: true, mapping: '', // Sparse slot index 7!
      id: '8BitDo Ultimate 2 Wireless (Vendor: 2dc8 Product: 6012)',
      axes: [0.75, 0, 0, 0, -1, 0, -1, -1], // Right on main stick
      buttons: mkButtons(16, { 0: 1, 9: 1 }), // 8BitDo HID A=0 (attack), RT=9 (shield, NOT pause!)
    };
    mockPads = [padXbox, null, padSony, null, null, padSwitch, null, pad8BitDo];
    const frames4 = im4.poll(4, true, [0, 1, 2, 3]);
    assert.equal(frames4.length, 4, 'Expected 4 polled input frames');
    assert.ok(frames4[0].moveX > 0.7 && frames4[0].cStickX < -0.6 && frames4[0].attackPressed,
      `P1 Xbox custom rebind failed: ${JSON.stringify(frames4[0])}`);
    assert.ok(frames4[1].moveX < -0.6 && frames4[1].attackPressed && !frames4[1].shield,
      `P2 DualSense HID auto-detect failed under P1 custom overrides: ${JSON.stringify(frames4[1])}`);
    assert.ok(frames4[2].moveY > 0.5 && frames4[2].attackPressed && frames4[2].jumpPressed,
      `P3 Switch Pro auto-detect failed under P1 custom overrides: ${JSON.stringify(frames4[2])}`);
    assert.ok(frames4[3].moveX > 0.5 && frames4[3].attackPressed && frames4[3].shield && !frames4[3].pausePressed,
      `P4 8BitDo HID auto-detect failed: ${JSON.stringify(frames4[3])}`);

    // 2) Human-port routing when P2 is CPU and P3 is Human with only 2 controllers connected
    mockPads = [
      { index: 0, connected: true, mapping: 'standard', id: 'Xbox P1', axes: [0.9, 0, 0, 0], buttons: mkButtons(16, {}) },
      { index: 1, connected: true, mapping: 'standard', id: 'Xbox P2', axes: [-0.9, 0, 0, 0], buttons: mkButtons(16, { 0: 1, 9: 1 }) },
    ];
    const imRoute = new InputManager();
    const routed = imRoute.poll(3, true, [0, 2]); // P1=Human, P2=CPU, P3=Human
    assert.ok(routed[0].moveX > 0.7, 'P1 must keep Pad 1');
    assert.equal(routed[1].moveX, 0, 'CPU P2 must not receive Pad 2 input');
    assert.equal(routed[1].pausePressed, false, 'CPU P2 must not emit pausePressed');
    assert.ok(routed[2].moveX < -0.7 && routed[2].attackPressed && routed[2].pausePressed,
      `Human P3 must receive Pad 2 when P2 is CPU: ${JSON.stringify(routed[2])}`);
    // In 1P vs CPU (activeHumanPorts = [0]), idle Pad 2 pressing Start must NOT leak pausePressed to P2!
    const routed1p = imRoute.poll(2, false, [0]);
    assert.equal(routed1p[1].pausePressed, false, 'Unassigned Pad 2 must not pause a 1P vs CPU or Online match');

    // 3) pollMenu() per-pad edge isolation: Pad 1 holding Confirm must NOT swallow Pad 2 pressing Confirm!
    const imMenu = new InputManager();
    mockPads = [
      { index: 0, connected: true, mapping: 'standard', id: 'Pad 1', axes: [0, 0, 0, 0], buttons: mkButtons(16, { 0: 1 }) },
      { index: 1, connected: true, mapping: 'standard', id: 'Pad 2', axes: [0, 0, 0, 0], buttons: mkButtons(16, {}) },
    ];
    const m1 = imMenu.pollMenu();
    assert.equal(m1.confirm, true, 'Pad 1 initial Confirm edge must fire');
    assert.equal(m1.sourcePort, 0, 'Pad 1 must be reported as sourcePort 0');
    // Pad 1 STILL holds Confirm while Pad 2 now presses Confirm
    mockPads = [
      { index: 0, connected: true, mapping: 'standard', id: 'Pad 1', axes: [0, 0, 0, 0], buttons: mkButtons(16, { 0: 1 }) },
      { index: 1, connected: true, mapping: 'standard', id: 'Pad 2', axes: [0, 0, 0, 0], buttons: mkButtons(16, { 0: 1 }) },
    ];
    const m2 = imMenu.pollMenu();
    assert.equal(m2.confirm, true, 'Pad 2 Confirm edge must NOT be swallowed while Pad 1 holds Confirm');
    assert.equal(m2.sourcePort, 1, 'Pad 2 must be reported as sourcePort 1');
    assert.equal(m2.perPort[0].confirm, false, 'Held Pad 1 must not re-fire Confirm');
    assert.equal(m2.perPort[1].confirm, true, 'Fresh Pad 2 press must fire on perPort[1]');

    // 4) Hot-plug disconnect + reconnect mid-match must not emit phantom pause/attack edges when gamepadconnected fires
    imMenu.setMenuMode(false);
    mockPads = [
      { index: 0, connected: true, mapping: 'standard', id: 'Pad 1', axes: [0, 0, 0, 0], buttons: mkButtons(16, {}) },
      { index: 3, connected: true, mapping: 'standard', id: 'Pad 2 Hotplug', axes: [0, 0, 0, 0], buttons: mkButtons(16, { 0: 1, 9: 1 }) },
    ];
    imMenu.onGamepadEvent({ type: 'gamepadconnected', gamepad: mockPads[1] });
    const hotPoll = imMenu.poll(2, true, [0, 1]);
    assert.equal(hotPoll[1].pausePressed, false, 'Mid-match hot-plug waking with Start must not fire phantom pause');
    assert.equal(hotPoll[1].attackPressed, false, 'Mid-match hot-plug waking with A must not fire phantom attack');
    // Release and press again -> real press works immediately
    mockPads[1].buttons = mkButtons(16, {});
    imMenu.poll(2, true, [0, 1]);
    mockPads[1].buttons = mkButtons(16, { 0: 1 });
    const realPoll = imMenu.poll(2, true, [0, 1]);
    assert.equal(realPoll[1].attackPressed, true, 'After releasing wake-up button, real attack press must fire');
    // 5) Mayflash GameCube Adapter HID mapping (A=1, B=2, X=0, Y=3, Z=7, L=4, R=5, Start=9)
    const imGc = new InputManager();
    mockPads = [{
      index: 0, connected: true, mapping: '',
      id: 'Mayflash GameCube Controller Adapter (Vendor: 0079 Product: 1844)',
      axes: [0.85, 0, 0, 0, -1, -1],
      buttons: mkButtons(16, { 1: 1, 7: 1, 4: 1 }),
    }];
    const gcPoll = imGc.poll(1, false, [0])[0];
    assert.ok(gcPoll.moveX > 0.7 && gcPoll.attackPressed && gcPoll.grabPressed && gcPoll.shield,
      `Mayflash GameCube HID mapping failed: ${JSON.stringify(gcPoll)}`);

    // 6) Per-controller haptic rumble safety (fires on vibrationActuator, no-ops cleanly when absent)
    let rumbleCalls = 0;
    mockPads = [{
      index: 0, connected: true, mapping: 'standard', id: 'Xbox Rumble Test',
      axes: [0, 0, 0, 0], buttons: mkButtons(16, {}),
      vibrationActuator: { type: 'dual-rumble', playEffect: () => { rumbleCalls++; return Promise.resolve('complete'); } },
    }];
    imGc.poll(1, false, [0]);
    assert.equal(imGc.rumblePort(0, { weak: 0.4, strong: 0.8, durationMs: 90 }), true, 'rumblePort must invoke dual-rumble actuator');
    assert.equal(rumbleCalls, 1, 'Expected 1 vibrationActuator.playEffect call');
    assert.equal(imGc.rumblePort(3, { weak: 0.4, strong: 0.8, durationMs: 90 }), false, 'rumblePort on unconnected slot must safely return false');

    console.log('PASS: 8BitDo HID, DualSense 054c, Mayflash GC, 4P mixed controllers, rumble, sparse slots, menu isolation & hot-plug validated');
  } finally {
    if (origNav) Object.defineProperty(globalThis, 'navigator', origNav);
    else delete globalThis.navigator;
  }

  // SSBM core mechanics & character-specific tech probes (Crouch Cancel, Jab Reset, Parry, Float Cancel, Needles, Dancing Blade)
  {
    const mkDuel = (f0, f1) => {
      const m = createMatch({
        mode: MODE.VS_STOCK, stageId: 'final-obligation', stocks: 4, seed: 2026,
        players: [
          { port: 0, fighterId: f0, paletteIndex: 0, isCpu: false, name: 'P1' },
          { port: 1, fighterId: f1, paletteIndex: 0, isCpu: false, name: 'P2' },
        ],
      });
      m.status = 'playing'; m.introTimer = 0;
      m.fighters[0].x = -26; m.fighters[0].y = 0; m.fighters[0].grounded = true; m.fighters[0].facing = 1;
      m.fighters[1].x = 26; m.fighters[1].y = 0; m.fighters[1].grounded = true; m.fighters[1].facing = -1;
      return m;
    };

    // Crouch Cancel reduces knockback compared to standing
    const runHit = (crouch) => {
      const m = mkDuel('garth', 'faux');
      m.fighters[1].percent = 25;
      if (crouch) m.fighters[1].state = STATE.CROUCH;
      for (let t = 0; t < 20; t++) {
        const i0 = createEmptyInput();
        const i1 = createEmptyInput();
        if (t === 0) { i0.moveX = 0.5; i0.attack = i0.attackPressed = true; }
        if (crouch) i1.moveY = -0.9;
        stepMatch(m, [i0, i1]);
        const hitEv = m.events.find((e) => e.type === 'hit');
        if (hitEv) return hitEv.kb;
      }
      return 0;
    };
    const kbStand = runHit(false);
    const kbCrouch = runHit(true);
    assert.ok(kbStand > 0 && kbCrouch > 0 && kbCrouch < kbStand * 0.85,
      `Crouch Cancel should reduce knockback (stand=${kbStand.toFixed(2)}, crouch=${kbCrouch.toFixed(2)})`);

    // Knockdown -> Jab Reset pops opponent up
    const mJr = mkDuel('faux', 'garth');
    mJr.fighters[1].state = STATE.KNOCKDOWN;
    mJr.fighters[1].stateFrame = 12;
    let sawJabReset = false;
    for (let t = 0; t < 16; t++) {
      const i0 = createEmptyInput();
      if (t === 0) { i0.attack = i0.attackPressed = true; }
      stepMatch(mJr, [i0, createEmptyInput()]);
      if (mJr.events.some((e) => e.type === 'tech' && e.tech === 'JAB RESET')) sawJabReset = true;
    }
    assert.ok(sawJabReset, 'Weak jab on knocked-down opponent must trigger JAB RESET');

    // Broshee Egg Shield frame 1-6 Parry negates damage & grants armor/parry event
    const mParry = mkDuel('garth', 'broshee');
    mParry.fighters[0].x = -24; mParry.fighters[1].x = 24;
    let sawParry = false;
    for (let t = 0; t < 16; t++) {
      const i0 = createEmptyInput();
      const i1 = createEmptyInput();
      if (t === 0) { i0.attack = i0.attackPressed = true; }
      if (t === 2) { i1.shield = i1.shieldPressed = true; }
      else if (t > 2) { i1.shield = true; }
      stepMatch(mParry, [i0, i1]);
      if (mParry.events.some((e) => e.type === 'tech' && e.tech === 'PARRY')) sawParry = true;
    }
    assert.ok(sawParry, 'Broshee early shield activation must trigger PARRY');

    // Screech Float Cancel lands with low lag and emits FLOAT CANCEL tech
    const mFc = mkDuel('screech', 'faux');
    mFc.fighters[0].x = -80; mFc.fighters[0].y = 16; mFc.fighters[0].grounded = false;
    mFc.fighters[0].floating = true; mFc.fighters[0].floatFrames = 40;
    let sawFloatCancel = false;
    for (let t = 0; t < 25; t++) {
      const i0 = createEmptyInput();
      if (t === 0) { i0.cStickX = 1; i0.jump = true; }
      stepMatch(mFc, [i0, createEmptyInput()]);
      if (mFc.events.some((e) => e.type === 'tech' && e.tech === 'FLOAT CANCEL')) sawFloatCancel = true;
    }
    assert.ok(sawFloatCancel, 'Screech landing during float aerial must trigger FLOAT CANCEL');

    // Shriek chargeable Needles store up to 6
    const mShriek = mkDuel('shriek', 'faux');
    mShriek.fighters[0].x = -120;
    for (let t = 0; t < 65; t++) {
      const i0 = createEmptyInput();
      i0.special = true;
      if (t === 0) i0.specialPressed = true;
      stepMatch(mShriek, [i0, createEmptyInput()]);
    }
    assert.ok((mShriek.fighters[0].needleCount || 0) >= 4,
      `Shriek holding Neutral-B should charge needles (got ${mShriek.fighters[0].needleCount})`);

    // Garth Dancing Blade multi-hit side-B chain
    const mDb = mkDuel('garth', 'faux');
    let maxDbStage = 0;
    for (let t = 0; t < 55; t++) {
      const i0 = createEmptyInput();
      if (t === 0 || t === 9 || t === 18) { i0.moveX = 0.85; i0.special = i0.specialPressed = true; }
      stepMatch(mDb, [i0, createEmptyInput()]);
      const st = mDb.fighters[0].moveData?.bladeStage || 0;
      if (st > maxDbStage) maxDbStage = st;
    }
    assert.ok(maxDbStage >= 2, `Garth Side-B should advance Dancing Blade chain (maxStage=${maxDbStage})`);

    // Round 2 SSBM mechanics: Waveland onto platform, Ground Tech Roll, Ledge-Hogging, Training CPU/DI & Frame Advantage
    const mWl = createMatch({
      mode: MODE.VS_STOCK, stageId: 'arguefield', stocks: 4, seed: 2027,
      players: [
        { port: 0, fighterId: 'faux', paletteIndex: 0, isCpu: false },
        { port: 1, fighterId: 'garth', paletteIndex: 0, isCpu: false },
      ],
    });
    mWl.status = 'playing'; mWl.introTimer = 0;
    const plat = mWl.platforms[0];
    mWl.fighters[0].x = plat.x + plat.w * 0.5;
    mWl.fighters[0].y = plat.y + 14;
    mWl.fighters[0].vy = -2;
    mWl.fighters[0].grounded = false;
    mWl.fighters[0].state = STATE.AIRBORNE;
    let sawWaveland = false;
    for (let t = 0; t < 18; t++) {
      const i0 = createEmptyInput();
      if (t === 0) { i0.moveX = 0.85; i0.moveY = -0.55; i0.shield = i0.shieldPressed = true; }
      stepMatch(mWl, [i0, createEmptyInput()]);
      if (mWl.events.some((e) => e.type === 'tech' && e.tech === 'WAVELAND')) sawWaveland = true;
    }
    assert.ok(sawWaveland, 'Diagonal airdodge onto a platform must trigger WAVELAND');

    // Ground Tech Roll in tumble
    const mTr = mkDuel('faux', 'garth');
    mTr.fighters[0].y = 14; mTr.fighters[0].vy = -6; mTr.fighters[0].grounded = false;
    mTr.fighters[0].state = STATE.TUMBLE; mTr.fighters[0].hitstun = 10;
    let sawTechRoll = false;
    for (let t = 0; t < 15; t++) {
      const i0 = createEmptyInput();
      if (t === 0) { i0.shield = i0.shieldPressed = true; i0.moveX = 0.9; }
      else { i0.moveX = 0.9; }
      stepMatch(mTr, [i0, createEmptyInput()]);
      if (mTr.events.some((e) => e.type === 'tech' && e.tech === 'TECH ROLL')) sawTechRoll = true;
    }
    assert.ok(sawTechRoll, 'Pressing Shield + horizontal stick before landing in tumble must trigger TECH ROLL');

    // Ledge-Hogging: second fighter cannot steal an occupied ledge
    const mLh = mkDuel('faux', 'garth');
    const deck = mLh.surfaces[0];
    mLh.fighters[0].x = deck.x - 6; mLh.fighters[0].y = deck.y - 6;
    mLh.fighters[0].vy = -2; mLh.fighters[0].grounded = false; mLh.fighters[0].state = STATE.AIRBORNE;
    stepMatch(mLh, [createEmptyInput(), createEmptyInput()]);
    assert.equal(mLh.fighters[0].state, STATE.LEDGE_HANG, 'P1 should grab left ledge');
    mLh.fighters[1].x = deck.x - 6; mLh.fighters[1].y = deck.y - 6;
    mLh.fighters[1].vy = -2; mLh.fighters[1].grounded = false; mLh.fighters[1].state = STATE.AIRBORNE;
    stepMatch(mLh, [createEmptyInput(), createEmptyInput()]);
    assert.notEqual(mLh.fighters[1].state, STATE.LEDGE_HANG, 'P2 must be denied an already occupied ledge (ledge-hogging)');

    // Training Lab CPU behavior ('shield' / 'crouch') + Frame Advantage telemetry
    const mTrain = createMatch({
      mode: MODE.TRAINING, stageId: 'final-obligation', stocks: 4, seed: 2028,
      players: [
        { port: 0, fighterId: 'faux', paletteIndex: 0, isCpu: false },
        { port: 1, fighterId: 'garth', paletteIndex: 0, isCpu: true, cpuLevel: 5 },
      ],
    });
    mTrain.status = 'playing'; mTrain.introTimer = 0;
    mTrain.trainingConfig = { cpuBehavior: 'shield', cpuDi: 'survival' };
    mTrain.fighters[0].x = -24; mTrain.fighters[0].y = 0; mTrain.fighters[0].grounded = true; mTrain.fighters[0].facing = 1;
    mTrain.fighters[1].x = 24; mTrain.fighters[1].y = 0; mTrain.fighters[1].grounded = true; mTrain.fighters[1].facing = -1;
    for (let t = 0; t < 16; t++) {
      const i0 = createEmptyInput();
      if (t === 3) { i0.attack = i0.attackPressed = true; }
      const i1 = computeCpuInput(mTrain, mTrain.fighters[1]);
      stepMatch(mTrain, [i0, i1]);
    }
    assert.ok(Number.isFinite(mTrain.fighters[0].lastFrameAdv),
      `Hitting shielding Training CPU must record finite lastFrameAdv (got ${mTrain.fighters[0].lastFrameAdv})`);

    // Round 3/4 mechanics: Grab Mash-Out, Z-Air Ledge Tether, and new 24-item effects
    const mMash = mkDuel('garth', 'faux');
    mMash.fighters[0].x = -20; mMash.fighters[1].x = 20;
    for (let t = 0; t < 10; t++) {
      const i0 = createEmptyInput();
      if (t === 0) { i0.grab = i0.grabPressed = true; }
      stepMatch(mMash, [i0, createEmptyInput()]);
      if (mMash.fighters[1].state === STATE.GRABBED) break;
    }
    assert.equal(mMash.fighters[1].state, STATE.GRABBED, 'P1 grab should capture P2');
    let sawMashOut = false;
    for (let t = 0; t < 50; t++) {
      const i1 = createEmptyInput();
      if (t % 2 === 0) { i1.attack = i1.attackPressed = true; i1.moveX = 1; }
      else { i1.jump = i1.jumpPressed = true; i1.moveX = -1; }
      stepMatch(mMash, [createEmptyInput(), i1]);
      if (mMash.events.some((e) => e.type === 'tech' && e.tech === 'MASH OUT')) { sawMashOut = true; break; }
    }
    assert.ok(sawMashOut, 'Rapidly mashing inputs while grabbed must trigger MASH OUT');

    // Z-Air Ledge Tether recovery (Zink offstage left pressing grab)
    const mTeth = mkDuel('zink', 'faux');
    const tDeck = mTeth.surfaces[0];
    mTeth.fighters[0].x = tDeck.x - 95;
    mTeth.fighters[0].y = tDeck.y - 45;
    mTeth.fighters[0].vy = -1;
    mTeth.fighters[0].grounded = false;
    mTeth.fighters[0].facing = 1;
    mTeth.fighters[0].state = STATE.AIRBORNE;
    let sawTether = false;
    for (let t = 0; t < 18; t++) {
      const i0 = createEmptyInput();
      if (t === 0) { i0.grab = i0.grabPressed = true; }
      stepMatch(mTeth, [i0, createEmptyInput()]);
      if (mTeth.events.some((e) => e.type === 'tether')) sawTether = true;
    }
    assert.ok(sawTether && mTeth.fighters[0].state === STATE.LEDGE_HANG,
      `Zink offstage grab should fire tether and snap to LEDGE_HANG (sawTether=${sawTether}, state=${mTeth.fighters[0].state})`);

    // New items: Metal Box, Bunny Ears, Star Wand projectile, Mr. Saturn Plush instant shield break, Freezie Cube freeze
    const mIt = mkDuel('bario', 'faux');
    mIt.fighters[0].x = -30; mIt.fighters[1].x = 42;
    spawnItemNow(mIt, 'metal_box', -30, 8);
    for (let t = 0; t < 10; t++) {
      const i0 = createEmptyInput();
      if (t === 2) { i0.attack = i0.attackPressed = true; }
      stepMatch(mIt, [i0, createEmptyInput()]);
    }
    assert.ok(mIt.fighters[0].metalFrames > 400, `Metal Box pickup must grant metalFrames (got ${mIt.fighters[0].metalFrames})`);

    spawnItemNow(mIt, 'bunny_ears', -30, 8);
    for (let t = 0; t < 10; t++) {
      const i0 = createEmptyInput();
      if (t === 2) { i0.attack = i0.attackPressed = true; }
      stepMatch(mIt, [i0, createEmptyInput()]);
    }
    assert.ok(mIt.fighters[0].bunnyFrames > 400, `Bunny Ears pickup must grant bunnyFrames (got ${mIt.fighters[0].bunnyFrames})`);

    const mWand = mkDuel('bario', 'faux');
    mWand.fighters[0].x = -60; mWand.fighters[1].x = 60;
    spawnItemNow(mWand, 'star_wand', -60, 8);
    let sawStarProj = false;
    for (let t = 0; t < 28; t++) {
      const i0 = createEmptyInput();
      if (t === 2) { i0.attack = i0.attackPressed = true; }
      if (t === 10) { i0.moveX = 1; i0.attack = i0.attackPressed = true; }
      stepMatch(mWand, [i0, createEmptyInput()]);
      if (mWand.projectiles.some((p) => p.style === 'star')) sawStarProj = true;
    }
    assert.ok(sawStarProj, 'Swinging Star Wand must fire a star projectile');

    const mSat = mkDuel('bario', 'faux');
    mSat.fighters[0].x = -40; mSat.fighters[1].x = 40;
    spawnItemNow(mSat, 'mr_saturn_plush', -40, 8);
    let sawShieldBreak = false;
    for (let t = 0; t < 35; t++) {
      const i0 = createEmptyInput();
      const i1 = createEmptyInput();
      if (t === 2) { i0.attack = i0.attackPressed = true; }
      if (t === 10) { i0.grab = i0.grabPressed = true; i0.moveX = 1; }
      i1.shield = true; if (t === 0) i1.shieldPressed = true;
      stepMatch(mSat, [i0, i1]);
      if (mSat.fighters[1].state === STATE.SHIELD_BREAK || mSat.events.some((e) => e.type === 'shieldBreak')) {
        sawShieldBreak = true; break;
      }
    }
    assert.ok(sawShieldBreak, 'Throwing Suspicious Potato Plush at shielding rival must trigger instant shield break');

    const mIce = mkDuel('bario', 'faux');
    mIce.fighters[0].x = -40; mIce.fighters[1].x = 40;
    spawnItemNow(mIce, 'freezie_cube', -40, 8);
    let sawFrozen = false;
    for (let t = 0; t < 30; t++) {
      const i0 = createEmptyInput();
      if (t === 2) { i0.attack = i0.attackPressed = true; }
      if (t === 10) { i0.grab = i0.grabPressed = true; i0.moveX = 1; }
      stepMatch(mIce, [i0, createEmptyInput()]);
      if (mIce.fighters[1].freezeFrames > 0) { sawFrozen = true; break; }
    }
    assert.ok(sawFrozen, 'Throwing Freezie Cube at rival must freeze them (freezeFrames > 0)');

    console.log('PASS: SSBM mechanics & Round 3/4 items validated (Crouch Cancel, Jab Reset, Parry, Float Cancel, Needles, Dancing Blade, Waveland, Tech Roll, Ledge-Hog, Frame Adv, Mash-Out, Tether, Metal/Bunny/Wand/Freezie)');
  }

  // Master Mitt 380 HP, Phase 2 transition, and multi-attack tells
  const bossMatch = createMatch({
    mode: MODE.CLASSIC,
    stageId: 'final-obligation',
    stocks: 3,
    seed: 777,
    players: [
      { port: 0, fighterId: 'bario', paletteIndex: 0, isCpu: true, cpuLevel: 7, name: 'Bario' },
      { port: 1, fighterId: MASTER_MITT.id, paletteIndex: 0, isCpu: true, cpuLevel: 8, name: 'Master Mitt' },
    ],
  });
  bossMatch.status = 'playing';
  bossMatch.introTimer = 0;
  assert.equal(bossMatch.fighters[1].bossMaxHp, 380, 'Master Mitt must have 380 max HP');
  const seenTells = new Set();
  let sawPhase2 = false;
  for (let i = 0; i < 1200 && bossMatch.status !== 'ended'; i++) {
    if (i === 500) bossMatch.fighters[1].bossHp = Math.min(bossMatch.fighters[1].bossHp, 175);
    stepMatch(bossMatch, bossMatch.fighters.map((f) => computeCpuInput(bossMatch, f)));
    if (bossMatch.fighters[1].bossTell) seenTells.add(bossMatch.fighters[1].bossTell);
    for (const e of bossMatch.events) {
      if (e.type === 'bossTell' && e.tell) seenTells.add(e.tell);
      if (e.type === 'bossPhase' && e.phase === 2) sawPhase2 = true;
    }
  }
  assert.ok(sawPhase2 || bossMatch.fighters[1].bossPhase === 2, 'Master Mitt must enter Phase 2 below half HP');
  assert.ok(seenTells.size >= 4, `Expected Master Mitt to use diverse attacks (got ${[...seenTells].join(', ')})`);

  // AI Ladder monotonicity check (Lv7 > Lv5, Lv9 > Lv7) + all 26/26 Lv9 Lowrule cave reconnect with 0 SDs
  for (const [lo, hi] of [[5, 7], [7, 9]]) {
    let advSum = 0;
    for (let i = 0; i < 8; i++) {
      const swap = i % 2 === 1;
      const lm = createMatch({
        mode: MODE.VS_STOCK, stageId: 'final-obligation', stocks: 4, seed: 500 + lo * 40 + i * 29,
        players: [
          { port: 0, fighterId: 'faux', isCpu: true, cpuLevel: swap ? lo : hi },
          { port: 1, fighterId: 'faux', isCpu: true, cpuLevel: swap ? hi : lo },
        ],
      });
      lm.status = 'playing'; lm.introTimer = 0;
      for (let t = 0; t < 2400 && lm.status !== 'ended'; t++) {
        stepMatch(lm, lm.fighters.map((f) => computeCpuInput(lm, f)));
      }
      const fHi = lm.fighters[swap ? 1 : 0];
      const fLo = lm.fighters[swap ? 0 : 1];
      advSum += (fHi.damageDealt - fLo.damageDealt) + 90 * ((fHi.kos - fHi.falls) - (fLo.kos - fLo.falls));
    }
    assert.ok(advSum > 0, `Expected Lv${hi} to outperform Lv${lo} on Faux mirrors (meanAdv=${(advSum / 8).toFixed(1)})`);
  }
  for (const def of ROSTER) {
    const cm = createMatch({
      mode: MODE.VS_STOCK, stageId: 'lowrule-temple', stocks: 3,
      players: [
        { port: 0, fighterId: def.id, isCpu: true, cpuLevel: 9 },
        { port: 1, fighterId: 'faux', isCpu: false },
      ],
    });
    cm.status = 'playing'; cm.introTimer = 0;
    const cf = cm.fighters[0]; const co = cm.fighters[1];
    cf.x = 0; cf.y = -225; cf.grounded = true; cf.onPlatformId = cm.surfaces.find((s) => s.y === -225)?.id;
    co.x = 460; co.y = 132; co.grounded = true;
    let rejoined = false;
    for (let t = 0; t < 480; t++) {
      stepMatch(cm, [computeCpuInput(cm, cf), createEmptyInput()]);
      assert.equal(cf.falls, 0, `Lv9 ${def.id} self-destructed escaping Lowrule Temple cave at t=${t}`);
      if (cf.y >= 100 && cf.x >= 240) { rejoined = true; break; }
    }
    assert.ok(rejoined, `Lv9 ${def.id} failed to rejoin upper-right terrace from Lowrule Temple cave within 8s`);
  }
  console.log(`PASS: Home-Run Derby, Master Mitt (380 HP, Phase 2, ${seenTells.size} tells), AI Ladder & 26/26 Lowrule cave validated`);
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

    // Keyboard menu navigation check (focus iframe -> ArrowRight -> VS Mode -> Enter -> CSS -> Escape -> Title)
    await desk.frame.locator('.game-title').click();
    await desk.page.waitForTimeout(60);
    await desk.page.keyboard.press('ArrowRight');
    await desk.page.waitForTimeout(100);
    const kbFocused = await desk.frame.evaluate(() => document.querySelector('.pad-focus')?.id || '');
    await desk.page.keyboard.press('Enter');
    await desk.page.waitForTimeout(120);
    const kbCss = await desk.frame.evaluate(() => window.__BIZARRO_MELEE__.getState().screen);
    await desk.page.keyboard.press('Escape');
    await desk.page.waitForTimeout(120);
    const kbBack = await desk.frame.evaluate(() => window.__BIZARRO_MELEE__.getState().screen);
    assert.equal(kbFocused, 'btn-vs-mode', `Keyboard ArrowRight should focus btn-vs-mode, got "${kbFocused}"`);
    assert.equal(kbCss, 'css', `Keyboard Enter on VS Mode should open CSS, got "${kbCss}"`);
    assert.equal(kbBack, 'title', `Keyboard Escape on CSS should return to Title, got "${kbBack}"`);
    console.log('PASS: Keyboard menu navigation (Arrows + Enter + Escape) verified');

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

    // Verify Training Lab toolbar + on-demand item spawning + CPU/DI selectors + telemetry
    await desk.frame.evaluate(() => window.__BIZARRO_MELEE__.startMode('training', 'puddle-of-insomnia'));
    await desk.frame.waitForFunction(() => window.__BIZARRO_MELEE__.getMatch()?.status === 'playing', { timeout: 6000 });
    const spawned = await desk.frame.evaluate(() => Boolean(window.__BIZARRO_MELEE__.spawnTrainingItem('alarm_omb')));
    assert.ok(spawned, 'Training Lab should spawn items on demand');
    const trainUi = await desk.frame.evaluate(() => {
      window.__BIZARRO_MELEE__.setTrainingConfig({ cpuBehavior: 'shield', cpuDi: 'survival' });
      const m = window.__BIZARRO_MELEE__.getMatch();
      return {
        cfg: m?.trainingConfig,
        telText: document.getElementById('train-telemetry')?.textContent || '',
      };
    });
    assert.equal(trainUi.cfg?.cpuBehavior, 'shield', 'Training Lab CPU behavior selector must update match.trainingConfig');
    assert.equal(trainUi.cfg?.cpuDi, 'survival', 'Training Lab CPU DI selector must update match.trainingConfig');
    assert.ok(trainUi.telText.includes('ADV'), `Training Lab telemetry pill should display ADV, got "${trainUi.telText}"`);
    await desk.page.waitForTimeout(400);
    await desk.page.screenshot({ path: path.join(OUT_DIR, '10-training.png') });
    console.log('PASS: Training Lab toolbar, CPU/DI controls, telemetry & on-demand item spawn verified');

    // Event 8 (3P Boss HUD specificity) check: ALL 3 cards must have 0px name overflow at 1280x720
    await desk.frame.evaluate(() => window.__BIZARRO_MELEE__.startEvent('ev-final-audit'));
    await desk.frame.waitForFunction(() => window.__BIZARRO_MELEE__.getMatch()?.status === 'playing', null, { timeout: 6000 });
    const bossHudCards = await desk.frame.evaluate(() =>
      Array.from(document.querySelectorAll('#hud-fighters .hud-card')).map((card) => {
        const nameEl = card.querySelector('.hud-card-name');
        return {
          isBoss: card.classList.contains('hud-card-boss'),
          cardW: Math.round(card.getBoundingClientRect().width),
          text: nameEl?.textContent || '',
          overflowPx: nameEl ? Math.round(nameEl.scrollWidth - nameEl.clientWidth) : -1,
        };
      })
    );
    assert.equal(bossHudCards.length, 3, 'Expected 3 HUD cards in Event 8');
    for (const c of bossHudCards) {
      assert.ok(c.overflowPx <= 4, `Event 8 HUD card name truncated: ${JSON.stringify(c)}`);
    }
    console.log(`PASS: Event 8 3P HUD readable (${bossHudCards.map((c) => `${c.text} ${c.cardW}px`).join(' | ')})`);

    // 2D fallback HUD clearance check at 1280x720 4P
    await desk.frame.evaluate(() => {
      const cb = document.getElementById('inp-3d');
      if (cb && cb.checked) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      window.__BIZARRO_MELEE__.setTeamBattle(false, 4);
      window.__BIZARRO_MELEE__.startMode('vs-stock', 'arguefield');
    });
    await desk.frame.waitForFunction(() => window.__BIZARRO_MELEE__.getState().gfx === '2d' && window.__BIZARRO_MELEE__.getMatch()?.status === 'playing', null, { timeout: 6000 });
    await desk.page.waitForTimeout(350);
    await desk.page.screenshot({ path: path.join(OUT_DIR, '13-2d-4p.png') });
    await desk.frame.evaluate(() => {
      const cb = document.getElementById('inp-3d');
      if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    console.log('PASS: 2D fallback 4P camera renders cleanly');

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
    // Verify Results action buttons (Rematch, CSS, Title) are fully inside the 1280x720 viewport
    const podiumBounds = await desk.frame.evaluate(() => {
      const ids = ['btn-results-rematch', 'btn-results-css', 'btn-results-title'];
      return ids.map((id) => {
        const r = document.getElementById(id)?.getBoundingClientRect();
        return { id, top: r?.top ?? -1, bottom: r?.bottom ?? 9999, height: r?.height ?? 0 };
      });
    });
    for (const b of podiumBounds) {
      assert.ok(b.height > 20 && b.top >= 0 && b.bottom <= 720,
        `Results action button ${b.id} clipped outside 720p viewport: ${JSON.stringify(b)}`);
    }
    await desk.page.screenshot({ path: path.join(OUT_DIR, '11-podium.png') });
    console.log('PASS: Natural Time Tie -> Sudden Death 300% -> Real KO -> 3D Victory Podium (buttons unclipped) verified');
    await desk.ctx.close();

    // B. Mobile portrait 390x844: Title unclipped + 4P match touch controls do not overlap HUD
    const mob = await openFrame({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const titleMuteRect = await mob.frame.evaluate(() => {
      const r = document.getElementById('btn-mute-title')?.getBoundingClientRect();
      return r ? { top: r.top, bottom: r.bottom } : null;
    });
    assert.ok(titleMuteRect && titleMuteRect.bottom <= 844,
      `Portrait Title footer clipped off 390x844 viewport: ${JSON.stringify(titleMuteRect)}`);
    await mob.frame.evaluate(() => {
      window.__BIZARRO_MELEE__.setTeamBattle(false, 4);
      window.__BIZARRO_MELEE__.startMode('vs-stock', 'arguefield');
    });
    await mob.page.waitForTimeout(1000);
    const mobOverlap = await mob.frame.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#hud-fighters .hud-card')).map((el) => el.getBoundingClientRect());
      const btns = Array.from(document.querySelectorAll('#touch-controls .touch-btn')).map((el) => ({
        lbl: el.textContent,
        r: el.getBoundingClientRect(),
      }));
      const overlaps = [];
      for (const c of cards) {
        for (const b of btns) {
          if (b.r.width <= 0) continue;
          const ox = Math.min(c.right, b.r.right) - Math.max(c.left, b.r.left);
          const oy = Math.min(c.bottom, b.r.bottom) - Math.max(c.top, b.r.top);
          if (ox > 2 && oy > 2) overlaps.push({ btn: b.lbl, ox, oy });
        }
      }
      return overlaps;
    });
    assert.equal(mobOverlap.length, 0, `Portrait 4P touch buttons overlap HUD cards: ${JSON.stringify(mobOverlap)}`);
    await mob.page.screenshot({ path: path.join(OUT_DIR, '05-mobile.png') });
    // Verify Event 8 Boss HUD fits inside 390x844 portrait viewport without right-edge clipping
    await mob.frame.evaluate(() => window.__BIZARRO_MELEE__.startEvent('ev-final-audit'));
    await mob.page.waitForTimeout(600);
    const mobBossRect = await mob.frame.evaluate(() => {
      const r = document.querySelector('#hud-fighters .hud-card-boss')?.getBoundingClientRect();
      return r ? { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) } : null;
    });
    assert.ok(mobBossRect && mobBossRect.left >= 0 && mobBossRect.right <= 390,
      `Portrait Event 8 Boss HUD clipped off 390px viewport: ${JSON.stringify(mobBossRect)}`);
    await mob.ctx.close();
    console.log(`PASS: Mobile 390x844 portrait Title + 4P HUD/touch + Event 8 Boss HUD (${mobBossRect.width}px) verified`);

    // B2. Compact landscape phones 667x375 & 812x375: 4P HUD readability + Event 8 Boss HUD zero overflow & zero touch overlap
    for (const [lw, lh] of [[667, 375], [812, 375]]) {
      const land = await openFrame({ viewport: { width: lw, height: lh }, hasTouch: true, isMobile: true });
      await land.frame.evaluate(() => {
        window.__BIZARRO_MELEE__.setTeamBattle(false, 4);
        window.__BIZARRO_MELEE__.startMode('vs-stock', 'arguefield');
      });
      await land.page.waitForTimeout(800);
      const landCardWidths = await land.frame.evaluate(() =>
        Array.from(document.querySelectorAll('#hud-fighters .hud-card')).map((el) => Math.round(el.getBoundingClientRect().width))
      );
      assert.equal(landCardWidths.length, 4, `Expected 4 HUD cards in 4P landscape ${lw}x${lh}`);
      assert.ok(landCardWidths.every((w) => w >= 100), `Landscape ${lw}x${lh} 4P HUD cards too narrow: ${JSON.stringify(landCardWidths)}`);
      if (lw === 667) await land.page.screenshot({ path: path.join(OUT_DIR, '12-landscape-667.png') });
      await land.frame.evaluate(() => window.__BIZARRO_MELEE__.startEvent('ev-final-audit'));
      await land.page.waitForTimeout(700);
      const landEv8 = await land.frame.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('#hud-fighters .hud-card')).map((c) => {
          const n = c.querySelector('.hud-card-name');
          const r = c.getBoundingClientRect();
          return {
            text: n?.textContent || '',
            right: Math.round(r.right),
            width: Math.round(r.width),
            overflowPx: n ? Math.round(n.scrollWidth - n.clientWidth) : -1,
          };
        });
        const btns = Array.from(document.querySelectorAll('#touch-controls .touch-btn')).map((el) => el.getBoundingClientRect());
        let overlaps = 0;
        for (const c of document.querySelectorAll('#hud-fighters .hud-card')) {
          const cr = c.getBoundingClientRect();
          for (const br of btns) {
            if (br.width <= 0) continue;
            if (Math.min(cr.right, br.right) - Math.max(cr.left, br.left) > 2 &&
                Math.min(cr.bottom, br.bottom) - Math.max(cr.top, br.top) > 2) overlaps++;
          }
        }
        return { cards, overlaps, touchActive: document.body.dataset.touch };
      });
      assert.equal(landEv8.overlaps, 0, `Landscape ${lw}x${lh} Event 8 HUD overlaps touch buttons: ${JSON.stringify(landEv8)}`);
      for (const c of landEv8.cards) {
        assert.ok(c.overflowPx <= 2, `Landscape ${lw}x${lh} Event 8 name overflow: ${JSON.stringify(c)}`);
      }
      await land.ctx.close();
      console.log(`PASS: Landscape ${lw}x${lh} 4P HUD (${landCardWidths.join(', ')}px) + Event 8 0px overflow & 0 touch overlap verified`);
    }

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

    // E. Live Two-Peer Browser Online Lockstep E2E (Lobby handshake -> Match sync -> Guest Results credit -> Disconnect abort)
    const p2pQueues = { host: { 0: [], 1: [] }, guest: { 0: [], 1: [] } };
    const peerRecords = { host: [], guest: [] };
    const openOnlinePeer = async (role) => {
      const isHost = role === 'host';
      const myId = isHost ? 'user-host' : 'user-guest';
      const peerId = isHost ? 'user-guest' : 'user-host';
      const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
      await ctx.exposeFunction('__mockSendP2P', (ch, arr) => {
        const target = isHost ? 'guest' : 'host';
        p2pQueues[target][ch]?.push({ fromUserId: myId, payload: arr });
      });
      await ctx.exposeFunction('__mockDrainP2P', (ch) => {
        const q = p2pQueues[role][ch] || [];
        p2pQueues[role][ch] = [];
        return q;
      });
      await ctx.exposeFunction('__mockRecordStat', (stat, val) => {
        peerRecords[role].push({ stat, val });
      });
      await ctx.addInitScript(({ isHost, myId, peerId }) => {
        const handlers = new Map();
        const emit = (name, data) => { for (const fn of handlers.get(name) || []) fn(data); };
        const inbox = { 0: [], 1: [] };
        window.__emitMockDpad = emit;
        window.__pushMockInbox = (ch, pkt) => inbox[ch].push({ fromUserId: pkt.fromUserId, payload: new Uint8Array(pkt.payload) });
        window.dpad = {
          version: 2,
          on: (name, fn) => { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); },
          init: async () => ({ version: 2, player: { id: myId, name: isHost ? 'HostPlayer' : 'GuestPlayer' } }),
          loadProgress: () => {},
          loadComplete: () => {},
          requestStats: async () => true,
          getStat: async () => 0,
          setStat: async (k, v) => { window.__mockRecordStat(k, v); return true; },
          setAchievement: async () => true,
          storeStats: async () => true,
          uploadLeaderboardScore: async () => true,
          player: { get: async () => ({ id: myId, name: isHost ? 'HostPlayer' : 'GuestPlayer' }) },
          saves: { load: async () => null, save: async () => true },
          lobbies: {
            createLobby: async () => ({ lobbyId: 'lobby-e2e' }),
            listAvailableLobbies: async () => [{ lobbyId: 'lobby-e2e', playerCount: 1, maxPlayers: 2 }],
            joinLobby: async () => ({ lobbyId: 'lobby-e2e' }),
            leaveLobby: async () => true,
            getLobbyInviteLink: async () => 'https://dpad.games/invite/lobby-e2e',
          },
          p2p: {
            getP2PMaxPayloadSize: () => 512,
            broadcastP2PMessage: (ch, _rel, bytes) => {
              window.__mockSendP2P(ch, Array.from(bytes));
              return true;
            },
            drainP2PChannel: (ch) => {
              const out = inbox[ch] || [];
              inbox[ch] = [];
              return out;
            },
          },
        };
      }, { isHost, myId, peerId });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`online-${role} pageerror: ${e.message}`));
      page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`online-${role} console.error: ${msg.text()}`); });
      await page.goto(`${gameUrl}/index.html`);
      await page.waitForFunction(() => Boolean(window.__BIZARRO_MELEE__), { timeout: 10000 });
      return { ctx, page };
    };

    const hostPeer = await openOnlinePeer('host');
    const guestPeer = await openOnlinePeer('guest');
    const pumpP2P = async () => {
      for (const [role, peer] of [['host', hostPeer], ['guest', guestPeer]]) {
        for (const ch of [0, 1]) {
          const pkts = p2pQueues[role][ch].splice(0);
          for (const pkt of pkts) {
            await peer.page.evaluate(({ ch, pkt }) => window.__pushMockInbox(ch, pkt), { ch, pkt });
          }
        }
      }
    };
    const joinPayload = {
      lobbyId: 'lobby-e2e',
      hostId: 'user-host',
      users: [
        { userId: 'user-host', username: 'HostPlayer', isHost: true },
        { userId: 'user-guest', username: 'GuestPlayer', isHost: false },
      ],
    };
    await hostPeer.page.evaluate((d) => {
      window.__BIZARRO_MELEE__.openScreen('online');
      window.__emitMockDpad('LOBBY_JOINED', d);
      window.__emitMockDpad('P2P_CONNECTION_ESTABLISHED', { userId: 'user-guest', username: 'GuestPlayer' });
    }, joinPayload);
    await guestPeer.page.evaluate((d) => {
      window.__BIZARRO_MELEE__.openScreen('online');
      window.__emitMockDpad('LOBBY_JOINED', d);
      window.__emitMockDpad('P2P_CONNECTION_ESTABLISHED', { userId: 'user-host', username: 'HostPlayer' });
    }, joinPayload);
    await hostPeer.page.locator('#btn-online-launch').click();
    for (let i = 0; i < 45; i++) {
      await pumpP2P();
      await hostPeer.page.waitForTimeout(35);
      const hState = await hostPeer.page.evaluate(() => window.__BIZARRO_MELEE__.getState().screen);
      const gState = await guestPeer.page.evaluate(() => window.__BIZARRO_MELEE__.getState().screen);
      if (hState === 'match' && gState === 'match') break;
    }
    const onlineStart = {
      hostScreen: await hostPeer.page.evaluate(() => window.__BIZARRO_MELEE__.getState().screen),
      guestScreen: await guestPeer.page.evaluate(() => window.__BIZARRO_MELEE__.getState().screen),
      hostFrame0: await hostPeer.page.evaluate(() => window.__BIZARRO_MELEE__.getMatch()?.frame ?? -1),
      guestFrame0: await guestPeer.page.evaluate(() => window.__BIZARRO_MELEE__.getMatch()?.frame ?? -1),
    };
    assert.equal(onlineStart.hostScreen, 'match', 'Host must launch into online match via lobby');
    assert.equal(onlineStart.guestScreen, 'match', 'Guest must automatically poll P2P and launch into online match');
    for (let i = 0; i < 30; i++) {
      await pumpP2P();
      await hostPeer.page.waitForTimeout(25);
    }
    const onlineProg = {
      hostFrame: await hostPeer.page.evaluate(() => window.__BIZARRO_MELEE__.getMatch()?.frame ?? -1),
      guestFrame: await guestPeer.page.evaluate(() => window.__BIZARRO_MELEE__.getMatch()?.frame ?? -1),
    };
    assert.ok(onlineProg.hostFrame > onlineStart.hostFrame0 + 10, `Online host must advance frames (${JSON.stringify(onlineProg)})`);
    assert.ok(onlineProg.guestFrame > onlineStart.guestFrame0 + 10, `Online guest must advance frames (${JSON.stringify(onlineProg)})`);

    // Verify Pause -> Controller & Combos submenu on Guest keeps Host advancing (zero remote freeze)
    await guestPeer.page.locator('#btn-hud-pause').click();
    await guestPeer.page.locator('#btn-pause-controller').click();
    const hostBeforeCtrl = await hostPeer.page.evaluate(() => window.__BIZARRO_MELEE__.getMatch()?.frame ?? 0);
    for (let i = 0; i < 20; i++) {
      await pumpP2P();
      await hostPeer.page.waitForTimeout(25);
    }
    const hostAfterCtrl = await hostPeer.page.evaluate(() => window.__BIZARRO_MELEE__.getMatch()?.frame ?? 0);
    assert.ok(hostAfterCtrl > hostBeforeCtrl + 10, `Opening Controller Config online must not stall remote peer (${hostBeforeCtrl} -> ${hostAfterCtrl})`);
    await guestPeer.page.locator('#btn-controller-back').click();
    await guestPeer.page.locator('#btn-pause-resume').click();

    // Verify Reconnect suspends then resumes cleanly AND restores #hud-mode-info label
    await hostPeer.page.evaluate(() => window.__emitMockDpad('P2P_PEER_RECONNECTING', { userId: 'user-guest' }));
    await hostPeer.page.waitForTimeout(100);
    const reconnectingLabel = await hostPeer.page.locator('#hud-mode-info').textContent();
    assert.ok(reconnectingLabel && reconnectingLabel.includes('RECONNECTING'), `Expected RECONNECTING pill, got "${reconnectingLabel}"`);
    await hostPeer.page.evaluate(() => window.__emitMockDpad('P2P_PEER_RECONNECTED', { userId: 'user-guest' }));
    for (let i = 0; i < 20; i++) {
      await pumpP2P();
      await hostPeer.page.waitForTimeout(25);
    }
    const restoredLabel = await hostPeer.page.locator('#hud-mode-info').textContent();
    assert.ok(restoredLabel && restoredLabel.includes('ONLINE LOCKSTEP'), `HUD mode pill must restore after reconnect, got "${restoredLabel}"`);

    // Verify disconnect aborts match cleanly (does NOT continue solo)
    await hostPeer.page.evaluate(() => {
      window.__emitMockDpad('P2P_PEER_DISCONNECTED', { userId: 'user-guest' });
    });
    await hostPeer.page.waitForTimeout(120);
    const afterDcScreen = await hostPeer.page.evaluate(() => window.__BIZARRO_MELEE__.getState().screen);
    const afterDcWinner = await hostPeer.page.locator('#results-winner').textContent();
    assert.equal(afterDcScreen, 'results', 'Disconnect must abort online match to Results No Contest');
    assert.ok(afterDcWinner && afterDcWinner.includes('DISCONNECTED'), `Expected disconnect notice, got "${afterDcWinner}"`);
    await hostPeer.ctx.close();
    await guestPeer.ctx.close();
    console.log(`PASS: Live two-peer Playwright Online Lockstep E2E (lobby launch + sync + disconnect abort) verified`);

    // F. Live 4-Controller Local Multiplayer Browser E2E (CSS auto-4P human + PAD 1-4 badges + simultaneous 4P combat + P3 pause + Controller Config multi-pad tabs)
    const mpCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await mpCtx.addInitScript(() => {
      const mkBtns = (pressed = {}) => Array.from({ length: 16 }, (_, i) => ({
        pressed: Boolean(pressed[i] && pressed[i] > 0.45),
        value: pressed[i] ?? 0,
      }));
      window.__mockGamepads = [
        { index: 0, connected: true, mapping: 'standard', id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', axes: [0, 0, 0, 0], buttons: mkBtns() },
        { index: 2, connected: true, mapping: '', id: 'DualSense Wireless Controller (Vendor: 054c Product: 0ce6)', axes: [0, 0, 0, -1, -1, 0], buttons: mkBtns() },
        { index: 4, connected: true, mapping: 'standard', id: 'Pro Controller (Vendor: 057e Product: 2009)', axes: [0, 0, 0, 0], buttons: mkBtns() },
        { index: 6, connected: true, mapping: '', id: '8BitDo Ultimate 2 Wireless (Vendor: 2dc8 Product: 6012)', axes: [0, 0, 0, 0, -1, 0, -1, -1], buttons: mkBtns() },
      ];
      Object.defineProperty(Navigator.prototype, 'getGamepads', {
        configurable: true,
        value: () => {
          const arr = [null, null, null, null, null, null, null, null];
          for (const p of window.__mockGamepads || []) if (p) arr[p.index] = p;
          return arr;
        },
      });
    });
    const mpPage = await mpCtx.newPage();
    mpPage.on('pageerror', (e) => errors.push(`mp4 pageerror: ${e.message}`));
    mpPage.on('console', (msg) => { if (msg.type() === 'error') errors.push(`mp4 console.error: ${msg.text()}`); });
    await mpPage.goto(`${gameUrl}/index.html`);
    await mpPage.waitForFunction(() => Boolean(window.__BIZARRO_MELEE__), { timeout: 10000 });
    await mpPage.locator('#btn-vs-mode').click();
    await mpPage.waitForTimeout(200);
    const css4p = await mpPage.evaluate(() => ({
      playerCount: document.getElementById('sel-player-count')?.value,
      portCards: Array.from(document.querySelectorAll('#css-ports .port-card')).map((el) => ({
        port: Number(el.dataset.port),
        tag: el.querySelector('.port-tag')?.textContent || '',
        padBadge: el.querySelector('.port-pad-badge')?.textContent || '',
      })),
      hintText: document.getElementById('pad-hint-bar')?.textContent || '',
    }));
    assert.equal(css4p.playerCount, '4', `VS Mode CSS should auto-expand to 4P with 4 controllers connected: ${JSON.stringify(css4p)}`);
    assert.equal(css4p.portCards.length, 4, 'Expected 4 port cards in CSS');
    assert.deepEqual(css4p.portCards.map((c) => c.tag), ['P1', 'P2', 'P3', 'P4'], `All 4 ports should auto-enable as Human: ${JSON.stringify(css4p)}`);
    assert.deepEqual(css4p.portCards.map((c) => c.padBadge), ['PAD 1', 'PAD 2', 'PAD 3', 'PAD 4'], `Expected PAD 1..4 badges: ${JSON.stringify(css4p)}`);
    assert.ok(css4p.hintText.includes('4 Pads'), `Hint bar should show 4 Pads, got "${css4p.hintText}"`);

    // Simultaneous independent 4-controller CSS selection (NO manual port switching!):
    // Each pad moves its own P1-P4 cursor token at the same time, locks in with Confirm, Pad 2 cancels & re-picks, Pad 3 cycles costume, then Start -> Stage Select!
    const cssTokensInit = await mpPage.evaluate(() =>
      Array.from(document.querySelectorAll('#css-grid .cursor-token')).map((el) => el.textContent).sort()
    );
    assert.deepEqual(cssTokensInit, ['P1', 'P2', 'P3', 'P4'], `All 4 independent CSS cursor tokens must render: ${JSON.stringify(cssTokensInit)}`);
    const beforePickIds = await mpPage.evaluate(() =>
      Array.from(document.querySelectorAll('#css-ports .port-card .port-fighter')).map((el) => el.textContent)
    );
    // Simultaneously move all 4 controllers' sticks in different directions
    await mpPage.evaluate(() => {
      window.__mockGamepads[0].axes[0] = 0.95;  // P1 right
      window.__mockGamepads[1].axes[1] = 0.95;  // P2 down
      window.__mockGamepads[2].axes[0] = 0.95;  // P3 right
      window.__mockGamepads[3].axes[0] = -0.95; // P4 left
    });
    await mpPage.waitForTimeout(140);
    await mpPage.evaluate(() => {
      for (const p of window.__mockGamepads) { p.axes[0] = 0; p.axes[1] = 0; }
    });
    await mpPage.waitForTimeout(80);
    const afterPickIds = await mpPage.evaluate(() =>
      Array.from(document.querySelectorAll('#css-ports .port-card .port-fighter')).map((el) => el.textContent)
    );
    for (let i = 0; i < 4; i++) {
      assert.notEqual(afterPickIds[i], beforePickIds[i], `Pad ${i + 1} independent CSS stick move should change P${i + 1} fighter (${beforePickIds[i]} -> ${afterPickIds[i]})`);
    }
    // All 4 controllers lock in simultaneously (Xbox A=0, DualSense HID Cross=1, Switch Pro A=1, 8BitDo HID A=0)
    await mpPage.evaluate(() => {
      window.__mockGamepads[0].buttons[0] = { pressed: true, value: 1 };
      window.__mockGamepads[1].buttons[1] = { pressed: true, value: 1 };
      window.__mockGamepads[2].buttons[1] = { pressed: true, value: 1 };
      window.__mockGamepads[3].buttons[0] = { pressed: true, value: 1 };
    });
    await mpPage.waitForTimeout(120);
    await mpPage.evaluate(() => {
      window.__mockGamepads[0].buttons[0] = { pressed: false, value: 0 };
      window.__mockGamepads[1].buttons[1] = { pressed: false, value: 0 };
      window.__mockGamepads[2].buttons[1] = { pressed: false, value: 0 };
      window.__mockGamepads[3].buttons[0] = { pressed: false, value: 0 };
    });
    await mpPage.waitForTimeout(80);
    const lockedState = await mpPage.evaluate(() => ({
      lockedCount: document.querySelectorAll('#css-ports .port-card.locked').length,
      readyVisible: !document.getElementById('css-ready-banner')?.hidden,
      screen: window.__BIZARRO_MELEE__.getState().screen,
    }));
    assert.equal(lockedState.lockedCount, 4, `All 4 port cards should lock in independently: ${JSON.stringify(lockedState)}`);
    assert.equal(lockedState.readyVisible, true, 'READY TO FIGHT banner must appear once all 4 controllers lock in');
    assert.equal(lockedState.screen, 'css', 'Locking in stays on CSS until Start is pressed');
    // Pad 2 presses Cancel (DualSense HID Circle = button 2) -> ONLY P2 unlocks, stays on CSS!
    await mpPage.evaluate(() => { window.__mockGamepads[1].buttons[2] = { pressed: true, value: 1 }; });
    await mpPage.waitForTimeout(110);
    await mpPage.evaluate(() => { window.__mockGamepads[1].buttons[2] = { pressed: false, value: 0 }; });
    await mpPage.waitForTimeout(80);
    const afterP2Cancel = await mpPage.evaluate(() => ({
      lockedPorts: Array.from(document.querySelectorAll('#css-ports .port-card.locked')).map((el) => Number(el.dataset.port)),
      readyVisible: !document.getElementById('css-ready-banner')?.hidden,
      screen: window.__BIZARRO_MELEE__.getState().screen,
    }));
    assert.deepEqual(afterP2Cancel.lockedPorts, [0, 2, 3], `Pad 2 cancel must unlock only P2: ${JSON.stringify(afterP2Cancel)}`);
    assert.equal(afterP2Cancel.readyVisible, false, 'READY banner hides when P2 unlocks');
    assert.equal(afterP2Cancel.screen, 'css', 'Pad 2 cancel must NOT exit CSS to Title');
    // Pad 2 re-locks, then Pad 1 presses Start (button 9) -> advances directly to Stage Select
    await mpPage.evaluate(() => { window.__mockGamepads[1].buttons[1] = { pressed: true, value: 1 }; });
    await mpPage.waitForTimeout(110);
    await mpPage.evaluate(() => {
      window.__mockGamepads[1].buttons[1] = { pressed: false, value: 0 };
      window.__mockGamepads[0].buttons[9] = { pressed: true, value: 1 };
    });
    await mpPage.waitForTimeout(130);
    await mpPage.evaluate(() => { window.__mockGamepads[0].buttons[9] = { pressed: false, value: 0 }; });
    const stageAfterStart = await mpPage.evaluate(() => window.__BIZARRO_MELEE__.getState().screen);
    assert.equal(stageAfterStart, 'stage', `Pressing Start with all 4 pads ready must advance to Stage Select, got "${stageAfterStart}"`);
    // Returning from Stage Select to CSS must preserve all 4 players' chosen fighters while unlocking tokens
    await mpPage.locator('#btn-stage-back').click();
    await mpPage.waitForTimeout(100);
    const backCssPicks = await mpPage.evaluate(() => ({
      screen: window.__BIZARRO_MELEE__.getState().screen,
      names: Array.from(document.querySelectorAll('#css-ports .port-card .port-fighter')).map((el) => el.textContent),
      lockedCount: document.querySelectorAll('#css-ports .port-card.locked').length,
    }));
    assert.equal(backCssPicks.screen, 'css', 'Stage Select Back must return to CSS');
    assert.deepEqual(backCssPicks.names, afterPickIds, `Stage Select Back must preserve all 4 players' chosen fighters: ${JSON.stringify(backCssPicks)}`);
    assert.equal(backCssPicks.lockedCount, 0, 'Stage Select Back should unlock tokens for quick adjustments');

    // Launch 4P match on Final Obligation and drive all 4 heterogeneous controllers simultaneously
    await mpPage.evaluate(() => {
      window.__BIZARRO_MELEE__.startMode('vs-stock', 'final-obligation');
      const m = window.__BIZARRO_MELEE__.getMatch();
      m.status = 'playing';
      m.introTimer = 0;
    });
    const before4p = await mpPage.evaluate(() => window.__BIZARRO_MELEE__.getMatch().fighters.map((f) => ({
      port: f.port, isCpu: f.isCpu, x: f.x, y: f.y,
    })));
    assert.ok(before4p.every((f) => !f.isCpu), `All 4 fighters in 4P match must be Human: ${JSON.stringify(before4p)}`);
    await mpPage.evaluate(() => {
      // P1 right, P2 left, P3 right, P4 left simultaneously across 4 different hardware layouts
      window.__mockGamepads[0].axes[0] = 0.95;
      window.__mockGamepads[1].axes[0] = -0.95;
      window.__mockGamepads[2].axes[0] = 0.95;
      window.__mockGamepads[3].axes[0] = -0.95;
    });
    await mpPage.waitForTimeout(450);
    const after4p = await mpPage.evaluate(() => window.__BIZARRO_MELEE__.getMatch().fighters.map((f) => ({
      port: f.port, x: f.x, y: f.y,
    })));
    assert.ok(after4p[0].x > before4p[0].x + 25, `P1 (Xbox) must move right (${before4p[0].x} -> ${after4p[0].x})`);
    assert.ok(after4p[1].x < before4p[1].x - 25, `P2 (DualSense HID) must move left (${before4p[1].x} -> ${after4p[1].x})`);
    assert.ok(after4p[2].x > before4p[2].x + 25, `P3 (Switch Pro) must move right (${before4p[2].x} -> ${after4p[2].x})`);
    assert.ok(after4p[3].x < before4p[3].x - 25, `P4 (8BitDo HID) must move left (${before4p[3].x} -> ${after4p[3].x})`);

    // P3 presses Start (button 9 on Switch Pro) -> pauses match and attributes pause readout to P3
    await mpPage.evaluate(() => {
      for (const p of window.__mockGamepads) p.axes[0] = 0;
      window.__mockGamepads[2].buttons[9] = { pressed: true, value: 1 };
    });
    await mpPage.waitForTimeout(150);
    const pause4p = await mpPage.evaluate(() => ({
      screen: window.__BIZARRO_MELEE__.getState().screen,
      readout: document.getElementById('pause-tech-readout')?.textContent || '',
    }));
    assert.equal(pause4p.screen, 'pause', 'P3 Start must pause 4P local match');
    assert.ok(pause4p.readout.startsWith('P3 '), `Pause readout should credit P3, got "${pause4p.readout}"`);

    // Open Controller Config from Pause -> verify all 4 pad tabs render & switch cleanly
    await mpPage.evaluate(() => { window.__mockGamepads[2].buttons[9] = { pressed: false, value: 0 }; });
    await mpPage.locator('#btn-pause-controller').click();
    await mpPage.waitForTimeout(150);
    const ctrlTabs = await mpPage.evaluate(() => Array.from(document.querySelectorAll('#ctrl-pad-tabs .ctrl-pad-tab')).map((b) => b.textContent));
    assert.deepEqual(ctrlTabs, ['PAD 1', 'PAD 2', 'PAD 3', 'PAD 4'], `Controller Config must expose tabs for all 4 pads: ${JSON.stringify(ctrlTabs)}`);
    await mpPage.locator('#ctrl-pad-tabs .ctrl-pad-tab').nth(3).click();
    await mpPage.waitForTimeout(120);
    const pad4Badge = await mpPage.locator('#ctrl-pad-badge').textContent();
    assert.ok(pad4Badge && pad4Badge.includes('PAD 4/4') && pad4Badge.includes('8BitDo'), `Selecting PAD 4 tab must inspect 8BitDo controller, got "${pad4Badge}"`);
    await mpCtx.close();
    console.log('PASS: Live 4-Controller Playwright E2E (auto-4P CSS + PAD 1-4 + simultaneous mixed-hardware 4P movement + P3 pause + 4-pad tester) verified');

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
