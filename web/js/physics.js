import { ITEM_FREQUENCY, MELEE, MODE, MOVE, STATE, TICK_RATE, WORLD_SCALE, computeMeleeKnockback } from './constants.js';
import { CRITTER_SUMMONS, ITEM_DEF, pickRandomItemDef } from './items.js';
import { BIZARRO_INTERN, getFighterById, MASTER_MITT, SAGGING_BAG } from './roster.js';
import { getStageById, getStageForm, getSurfaceY, HOMERUN_STAGE, TARGET_STAGE, resolveStagePlatforms, resolveStageSolids } from './stages.js';

const S = STATE;
const M = MOVE;
const AIR_ATTACKS = new Set([M.NAIR, M.FAIR, M.BAIR, M.UAIR, M.DAIR]);
const SMASH_MOVES = new Set([M.FSMASH, M.USMASH, M.DSMASH]);
const JABS = [M.JAB, M.JAB2, M.JAB3];
const GROUND_MOVEMENT = new Set([S.IDLE, S.WALK, S.DASH, S.RUN, S.TURN, S.CROUCH]);
const DODGES = new Set([S.SPOTDODGE, S.ROLL_F, S.ROLL_B]);
const HURT = new Set([S.HITSTUN, S.TUMBLE]);
const DIRECT_NEUTRAL = new Set(['garth', 'troy']);
const DIRECT_SIDE = new Set(['wonky-kong', 'flurby', 'shriek']);
const SPECIAL_MOVES = [M.NEUTRAL_B, M.SIDE_B, M.UP_B, M.DOWN_B];
const ELECTRIC_RODENT_MOVES = new Set([...SPECIAL_MOVES, M.FAIR, M.BAIR, M.DAIR, M.FSMASH]);
const ELECTRIC_MOVES = {
  'captain-pigeon': new Set([M.NEUTRAL_B, M.UP_B]),
  chikapu: ELECTRIC_RODENT_MOVES, spitzu: ELECTRIC_RODENT_MOVES,
  shamus: new Set([M.NEUTRAL_B, M.FSMASH, M.UAIR]),
  dadondorf: new Set([M.DAIR, M.NEUTRAL_B]),
  faux: new Set([M.DOWN_B]), falcont: new Set([M.DOWN_B]),
};
const WEAPON_NORMALS = new Set([...JABS, M.FTILT, M.UTILT, M.DTILT, ...SMASH_MOVES,
  M.DASH_ATTACK, M.LEDGE_ATTACK, M.FAIR, M.UAIR, M.DAIR]);
const RAD = Math.PI / 180;
const SMASH = 0.72;
const C_GROUND = 0.55;
const C_AIR = 0.40;
const DASH_FRAMES = 13;
const MOVE_PACE = 0.76;
const DJC_FIGHTERS = new Set(['mess', 'mewtooth', 'broshee', 'screech']);
const EMPTY = Object.freeze({});
const ITEM_CAP = 6;
const ITEM_INTERVAL = { low: 420, medium: 260, high: 150 };
const INTERN_COUNT = 25;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);
const withinX = (x, surface, margin = 0) => x >= surface.x - margin && x <= surface.x + surface.w + margin;
const byPort = (match, port) => match.fighters.find((f) => f.port === port);
const teammates = (a, b) => a?.team != null && a.team === b?.team;
const rivals = (a, b) => a !== b && b.state !== S.DEAD && !teammates(a, b);
const roundDamage = (n) => Math.round(n * 100) / 100;
const isShield = (f) => f.state === S.SHIELD || f.state === S.SHIELD_STUN;
const INPUT_AXES = ['moveX', 'moveY', 'rawMoveX', 'rawMoveY', 'cStickX', 'cStickY'];
const INPUT_BUTTONS = ['jump', 'attack', 'special', 'shield', 'grab'];

const TECH_EVENTS = { wavedash: 'WAVEDASH', lCancel: 'L-CANCEL', powershield: 'POWER SHIELD', walljump: 'WALL JUMP', meteorCancel: 'METEOR CANCEL' };
const isLightShield = (input) => !!input.lightShield || (input.shieldAnalog >= 0.18 && input.shieldAnalog < 0.78);

function onlineInput(frame) {
  const input = { tauntPressed: frame.tauntPressed === true, shortHopPressed: frame.shortHopPressed === true,
    shieldAnalog: Number.isFinite(frame.shieldAnalog) ? clamp(frame.shieldAnalog, 0, 1) : 0,
    lightShield: frame.lightShield === true, cStickTilt: frame.cStickTilt === true, tiltMod: frame.tiltMod === true };
  for (const key of INPUT_AXES) input[key] = Number.isFinite(frame[key]) ? clamp(frame[key], -1, 1) : 0;
  if (typeof frame.tapJumpPressed === 'boolean') input.tapJumpPressed = frame.tapJumpPressed;
  const magnitude = Math.hypot(input.moveX, input.moveY);
  if (magnitude > 1) {
    input.moveX /= magnitude;
    input.moveY /= magnitude;
  }
  for (const key of INPUT_BUTTONS) {
    input[key] = frame[key] === true;
    input[key + 'Pressed'] = frame[key + 'Pressed'] === true;
  }
  return input;
}

function stickPresses(match, f, input) {
  const y = input.moveY || 0;
  const rawX = Number.isFinite(input.rawMoveX) && (input.rawMoveX !== 0 || !(input.moveX || 0)) ? input.rawMoveX : (input.moveX || 0);
  const rawY = Number.isFinite(input.rawMoveY) && (input.rawMoveY !== 0 || !y) ? input.rawMoveY : y;
  const prevY = f.prevMoveY || 0;
  // Keep the current sample and 3 prior pre-curve ticks so fast 3-4f ramps flick while 8f slow linear ramps stay Walk/Up-Tilt.
  f.stickHist.push({ x: rawX, y: rawY });
  if (f.stickHist.length > 4) f.stickHist.shift();
  // Older input frames combine the stick and jump button into one edge.
  const tapJump = input.tapJumpPressed ?? (input.jumpPressed && !f.isCpu && y >= 0.8 && prevY < 0.8);
  if (tapJump && !input.shortHopPressed) {
    const flick = y >= 0.78 && f.stickHist.some((s) => s.y < 0.35);
    input = { ...input, tapJumpPressed: flick, jumpPressed: flick && !(f.grounded && (input.attackPressed || input.specialPressed)) };
  }

  // A shallow C-stick tap released near center requests nair. Wait for release so a
  // full directional flick can pass through this band without firing prematurely.
  const cMag = Math.hypot(input.cStickX || 0, input.cStickY || 0);
  const canRequestAerial = f.state === S.AIRBORNE || f.state === S.JUMPSQUAT || f.grounded && input.jumpPressed;
  if (!canRequestAerial || Math.max(Math.abs(input.cStickX || 0), Math.abs(input.cStickY || 0)) >= C_AIR) f.softCTap = false;
  else if (cMag <= 0.10) {
    if (f.softCTap && match.frame - f.softCTap <= 7) input = { ...input, neutralCTap: true };
    f.softCTap = false;
  } else if (!f.cStickHeld && cMag >= 0.20 && cMag < 0.35 && (f.lastCMag || 0) < 0.20) {
    f.softCTap = match.frame;
  }
  f.lastCMag = cMag;
  return input;
}

// Store button edges with their stick direction. Held buttons continue to come
// from the current sample so buffering a tap never extends a charge or full hop.
function rememberPresses(match, f, input) {
  const x = input.cStickX || 0, y = input.cStickY || 0;
  const magnitude = Math.max(Math.abs(x), Math.abs(y));
  const disabled = f.state === S.DEAD || f.state === S.RESPAWN || f.state === S.GRABBED;
  const threshold = f.grounded ? C_GROUND : C_AIR;
  if (magnitude < 0.30) f.cStickHeld = false;
  if (magnitude >= threshold && !f.cStickHeld) {
    f.cStickHeld = true;
    if (!disabled) f.inputBuffer.cStick = { frame: match.frame, x, y, tilt: !!input.cStickTilt };
  }
  if (disabled || (f.inputBuffer.cStick && match.frame - f.inputBuffer.cStick.frame > 5)) delete f.inputBuffer.cStick;
  if (disabled) return;
  for (const key of INPUT_BUTTONS) {
    if (input[key + 'Pressed']) {
      f.inputBuffer[key] = { frame: match.frame, moveX: input.moveX || 0, moveY: input.moveY || 0,
        prevX: f.prevMoveX || 0, prevY: f.prevMoveY || 0, tapJumpPressed: key === 'jump' && !!input.tapJumpPressed, shortHopPressed: key === 'jump' && !!input.shortHopPressed };
    } else if (f.inputBuffer[key] && match.frame - f.inputBuffer[key].frame > 5) {
      delete f.inputBuffer[key];
    }
  }
}

function bufferedInput(f, input, keys) {
  const key = keys.find((k) => input[k + 'Pressed']) ?? keys.find((k) => f.inputBuffer[k]);
  if (!key) return input;
  const press = f.inputBuffer[key];
  delete f.inputBuffer[key];
  if (!press || input[key + 'Pressed']) return input;
  return { ...input, moveX: press.moveX, moveY: press.moveY, prevX: press.prevX, prevY: press.prevY, tapJumpPressed: press.tapJumpPressed, shortHopPressed: input.shortHopPressed || press.shortHopPressed, [key + 'Pressed']: true };
}

function clearSpecial(f) {
  f.vanished = false;
  f.specialPhase = f.specialChargeStyle = f.specialLaunchAngle = null;
  f.specialCharge = 0;
  f.zipOrigin = null;
}

function transition(f, state, restart = false) {
  if (f.state === state && !restart) return;
  if (f.state === S.ATTACK) clearSpecial(f);
  if (state !== S.FREEFALL) f.parasolOpen = false;
  if (f.state === S.ROLL_F) f.ledgeRollFrames = 0;
  if (f.state === S.JUMPSQUAT) f.bufferedAerial = null;
  if (state !== S.AIRBORNE && state !== S.AIRDODGE) f.ledgeDropFrame = null;
  if (state !== S.AIRBORNE) f.doubleJumping = false;
  if (state !== S.AIRBORNE && !(state === S.ATTACK && AIR_ATTACKS.has(f.moveKey))) f.floating = false;
  if (state !== S.SHIELD && state !== S.SHIELD_STUN) {
    f.lightShielding = false;
    f.shieldScale = 1;
  }
  if (state !== S.JUMPSQUAT && state !== S.AIRDODGE && state !== S.AIRBORNE) f.shineJump = false;
  f.prevState = f.state;
  f.state = state;
  f.stateFrame = 0;
}

function stopMove(f) {
  clearSpecial(f);
  f.charging = false;
  f.moveKey = null;
  f.moveData = null;
  f.moveFrame = 0;
  f.chargeFrames = 0;
  f.smashChargeKey = null;
  f.smashChargeFrames = f.jabStep = f.jabWindow = 0;
  f.activeHitboxes = [];
}

function voice(f) {
  return { voiceType: f.def.voiceType, voicePitch: f.def.voicePitch };
}

function event(match, type, f, data = {}) {
  match.events.push({ type, x: f.x, y: f.y, port: f.port, ...data });
  if (TECH_EVENTS[type]) event(match, 'tech', f, { tech: TECH_EVENTS[type] });
}

function drawRng(match) {
  // Match-local RNG keeps identical input streams deterministic.
  match.rng = (Math.imul(match.rng, 1664525) + 1013904223) >>> 0;
  return match.rng / 4294967296;
}

function zipCrouch(f) {
  return f.grounded && f.moveData?.technique === 'quickAttack' && f.specialPhase === 'charge';
}

export function getFighterHurtbox(f, state = f.state, x = f.x, y = f.y) {
  const { width, height } = f.def.stats;
  const low = state === S.CROUCH || state === S.KNOCKDOWN || state === S.TECH || state === S.ATTACK && zipCrouch(f);
  const hanging = state === S.LEDGE_HANG;
  const dodging = DODGES.has(state);
  const h = height * (f.scale ?? 1) * (low ? 0.46 : dodging ? 0.68 : 1);
  const w = width * (f.scale ?? 1) * (state === S.KNOCKDOWN ? 1.4 : 1);
  return { x: x - w / 2, y: hanging ? y - h * 0.78 : y, w, h };
}

function makeState(match, player, stocks) {
  const def = getFighterById(player.fighterId);
  const paletteIndex = clamp(Math.trunc(player.paletteIndex) || 0, 0, def.palettes.length - 1);
  const port = player.port;
  const configuredPercent = typeof match.startPercent === 'number' ? match.startPercent : match.startPercent?.[port];
  const startPercent = Number.isFinite(configuredPercent) ? clamp(configuredPercent, 0, 999) : 0;
  const spawn = player.spawn ?? match.stage.spawns[port % match.stage.spawns.length];
  const floor = [...match.platforms, ...match.surfaces]
    .filter((p) => withinX(spawn.x, p) && getSurfaceY(p, spawn.x) <= spawn.y).sort((a, b) => getSurfaceY(b, spawn.x) - getSurfaceY(a, spawn.x))[0];
  const f = {
    port, name: player.name || def.name, fighterId: def.id, def, paletteIndex,
    palette: def.palettes[paletteIndex], isCpu: !!player.isCpu, cpuLevel: player.cpuLevel ?? 5, team: player.team ?? null,
    cpuThinkTimer: 0, cpuHeldInput: null, cpuPauseTimer: 0,
    x: spawn.x, y: floor ? getSurfaceY(floor, spawn.x) : spawn.y, vx: 0, vy: 0, kbVx: 0, kbVy: 0, facing: spawn.facing,
    grounded: !!floor, onPlatformId: floor?.id ?? null,
    state: floor ? S.IDLE : S.AIRBORNE, stateFrame: 0, prevState: null,
    animPose: floor ? 'idle' : 'fall', chargeShotLevel: 0, doubleJumping: false, doubleJumpFrame: 0, bufferedAerial: null,
    floating: false, floatFrames: 0, floatUsed: false, inputBuffer: {}, stickHist: [{ x: 0, y: 0 }],
    startPercent, percent: startPercent, stocks, kos: 0, falls: 0, damageDealt: 0, wavedashCount: 0, lCancelCount: 0,
    sweetspotKo: false, sweetspotKos: 0, meteorKo: false, meteorKos: 0,
    get sweetspotKoScored() { return this.sweetspotKo || this.meteorKo; },
    set sweetspotKoScored(value) { if (value) this.sweetspotKo = true; },
    get hp() { return this.bossHp; },
    set hp(value) { this.bossHp = value; },
    get maxHp() { return this.bossMaxHp; },
    set maxHp(value) { this.bossMaxHp = value; },
    recentKoFrames: [], stockDamageOwner: null, stockStartSequence: match.damageSequence, meteorByPort: null, meteorTimer: 0, warpCooldown: 0,
    permanentGiant: match.giantPorts.includes(port),
    maxCombo: 0, comboCount: 0, comboTimer: 0, jumpsUsed: 0, fastFalling: false,
    hitlag: 0, hitstun: 0, invulnFrames: 0, ledgeCooldown: 0, ledgeId: null, ledgeSide: 0,
    ledgeDropFrame: null, ledgeDoubleJump: false, ledgeRollFrames: 0, upBUsed: false, sideBUsed: false,
    get hitstunFrames() { return this.hitstun; },
    set hitstunFrames(frames) { this.hitstun = frames; },
    get invulnTimer() { return this.invulnFrames; },
    set invulnTimer(frames) { this.invulnFrames = frames; },
    shieldHp: MELEE.SHIELD_MAX, shieldBroken: false, lCancelTimer: 0, techTimer: 0,
    chargeFrames: 0, judgeNum: 0, moveKey: null, moveData: null, moveFrame: 0, hitTargets: new Set(),
    grabbedBy: null, grabbing: null, pummelTimer: 0, staleQueue: [], staleMultipliers: [...MELEE.STALE_WEIGHTS],
    lastHitBy: null, lastHitTimer: 0, animPhase: 0, squashX: 1, squashY: 1, activeHitboxes: [],
    shieldStun: 0, shieldDrop: 0, techLock: 0, dropTimer: 0, dropId: null, landingLag: 0,
    dodgeDir: 0, specialAimX: 0, specialAimY: 0, launchAngle: null, launchSpeed: 0,
    lastSweetspot: false, ledgeX: 0, ledgeY: 0, shortHop: false, sleepTimer: 0, sleepImmuneFrames: 0,
    heldItemId: null, scale: 1, giantTimer: 0, tinyTimer: 0, starTimer: 0, hammerTimer: 0,
    shieldScale: 1, lightShielding: false, didShortHop: false, didAerial: false, didFastFall: false,
    shineJump: false, sdiCount: 0, lastKnockback: 0, trueComboCount: 0, comboMoves: [], receivedCombo: null,
    shieldAge: 0, smashChargeKey: null, smashChargeFrames: 0, jabStep: 0, jabWindow: 0,
    meteorHitFrame: -999, wallJumpCooldown: 0, starHits: new Map(),
  };
  clearSpecial(f);
  f.parasolOpen = false;
  setFighterScale(f);
  if (def === MASTER_MITT) {
    f.bossPhase = 1;
    f.bossAttackCount = 0;
    f.bossTell = null;
    f.bossMaxHp = 380;
    f.bossHp = f.bossMaxHp;
    f.y += 125;
    f.grounded = false;
    f.onPlatformId = null;
    f.state = S.AIRBORNE;
  }
  f.animPose = animationPose(match, f);
  f.hurtbox = getFighterHurtbox(f);
  return f;
}

export function createMatch(config = {}) {
  const mode = config.mode ?? MODE.VS_STOCK;
  const selectedStage = getStageById(config.stageId);
  const stage = mode === MODE.HOMERUN ? HOMERUN_STAGE :
    mode === MODE.TARGETS && !selectedStage.targets ? TARGET_STAGE : selectedStage;
  const introTimer = Math.max(0, Math.trunc(config.introFrames ?? 90));
  const defaultItems = [MODE.VS_STOCK, MODE.VS_TIME, MODE.CLASSIC, MODE.EVENT].includes(mode) ? ITEM_FREQUENCY.MEDIUM : ITEM_FREQUENCY.OFF;
  const itemFrequency = Object.values(ITEM_FREQUENCY).includes(config.itemFrequency) ? config.itemFrequency : defaultItems;
  const timeSeconds = mode === MODE.HOMERUN ? 10 : config.timeSeconds ??
    ([MODE.TARGETS, MODE.MULTIMAN].includes(mode) ? 0 : 300);
  const objective = config.objective || (config.koTarget > 0 ? 'koTarget' : config.timeLimitWin ? 'survive' : 'eliminate');
  const match = {
    mode, stage, frame: 0, status: introTimer ? 'intro' : 'playing', introTimer, endTimer: 0,
    timeLeftFrames: Math.max(0, Math.round(TICK_RATE * timeSeconds)),
    get timeFrames() { return this.timeLeftFrames; },
    set timeFrames(frames) { this.timeLeftFrames = frames; },
    timed: timeSeconds > 0, suddenDeath: false, suddenDeathTimer: 0,
    startPercent: config.startPercent ?? 0, giantPorts: Array.isArray(config.giantPorts) ? [...config.giantPorts] : [],
    itemPool: Array.isArray(config.itemPool) ? config.itemPool.filter((id) => Object.hasOwn(ITEM_DEF, id)) : null,
    eventId: config.eventId ?? null, eventTitle: config.eventTitle ?? null, timeLimitWin: config.timeLimitWin === true,
    objective,
    koTarget: mode === MODE.EVENT && objective === 'koTarget' && Number.isFinite(config.koTarget) ? Math.max(0, Math.ceil(config.koTarget)) : 0,
    trainingCpuMode: config.trainingCpuMode ?? 'stand', timeScale: [0.25, 0.5].includes(config.timeScale) ? config.timeScale : 1,
    damageSequence: 0, lastDamageSequence: [], winner: null, winningTeam: null,
    slowMoFrames: 0, dramaticFinish: null, hitstopFrames: 0, screenShake: 0, screenFlash: 0, platforms: resolveStagePlatforms(stage, 0), surfaces: resolveStageSolids(stage, 0),
    stageForm: getStageForm(stage, 0), platformStates: {}, bridgeState: null, seesawOffset: 0,
    barrelCannon: stage.barrelCannon ? { x: (stage.barrelCannon.minX + stage.barrelCannon.maxX) / 2,
      y: stage.barrelCannon.y, angle: 0, occupantPort: null, fireTimer: 0, cooldown: 0 } : null,
    fighters: [], projectiles: [], events: [], winnerPort: null,
    homerun: { distanceFt: 0, maxDistanceFt: 0, barrierBroken: false, launched: false },
    stats: { totalKOs: 0 }, classicRound: config.classicRound ?? 1, hitboxesVisible: !!config.hitboxesVisible,
    rng: config.seed == null ? 0x4b1ad30f : config.seed >>> 0, derbyFlightFrames: 0,
    itemFrequency, items: [], summons: [], hazards: [], acidLevel: -999,
    targets: mode === MODE.TARGETS ? stage.targets.map((t) => ({
      id: t.id, x: t.x, y: t.y, baseX: t.x, baseY: t.y, r: t.r,
      moveX: t.moveX ?? 0, speed: t.speed ?? 0, broken: false,
    })) : [],
    targetsRemaining: 0, targetTimeFrames: 0, targetsTimed: timeSeconds > 0,
    multimanRemaining: mode === MODE.MULTIMAN ? INTERN_COUNT : 0, multimanKos: 0,
    playFrames: 0, nextEntityId: 1,
  };
  for (const p of match.platforms) {
    if (p.vanishing) match.platformStates[p.id] = { standTimer: 0, respawnTimer: 0, vanished: false };
  }
  const bridge = match.surfaces.find((s) => s.breakable);
  if (bridge) match.bridgeState = { id: bridge.id, hp: bridge.maxHp || 30, maxHp: bridge.maxHp || 30, broken: false, respawnTimer: 0 };
  let players = config.players?.length ? config.players : [
    { port: 0, fighterId: 'bario' },
    { port: 1, fighterId: 'faux', isCpu: true },
  ];
  if (mode === MODE.HOMERUN) {
    const player = players.find((p) => p.fighterId !== SAGGING_BAG.id) ?? { port: 0, fighterId: 'bario' };
    const bag = players.find((p) => p.fighterId === SAGGING_BAG.id);
    players = [{ ...player, port: 0 }, { ...bag, port: 1, fighterId: SAGGING_BAG.id, isCpu: true }];
    spawnItem(match, ITEM_DEF.plunger_bat, -45, 40);
  } else if (mode === MODE.TARGETS || mode === MODE.MULTIMAN || match.koTarget) {
    const player = players.find((p) => p.port === 0) ?? players[0];
    players = [{ ...player, port: 0, ...(mode === MODE.MULTIMAN ? { team: 'player', stocks: 1 } : {}),
      ...(match.koTarget ? { team: 'player' } : {}) }];
  }
  const unique = new Map();
  for (const [i, player] of players.slice(0, 4).entries()) {
    const port = Number.isInteger(player.port) ? player.port : i;
    if (port >= 0 && port < 4 && !unique.has(port)) unique.set(port, { ...player, port });
  }
  const stocks = Math.max(1, Math.trunc(config.stocks ?? 4));
  match.fighters = [...unique.values()].sort((a, b) => a.port - b.port).map((p) =>
    makeState(match, p, p.fighterId === MASTER_MITT.id || p.fighterId === SAGGING_BAG.id ? 1 : Math.max(1, p.stocks ?? stocks)));
  match.targetsRemaining = match.targets.length;
  if (mode === MODE.MULTIMAN || match.koTarget) {
    for (const port of [1, 2, 3]) {
      match.fighters.push(makeIntern(match, port, config.players?.find((p) => p.port === port)));
    }
  }
  if (mode === MODE.TRAINING) {
    match.trainingConfig = { ...config, mode, giantPorts: [], startPercent: 0, introFrames: 0,
      players: [...unique.values()].map((p) => ({ ...p })) };
  }
  return match;
}

export function resetTrainingMatch(match) {
  if (match.mode !== MODE.TRAINING) return match;
  const fresh = createMatch({ ...match.trainingConfig, hitboxesVisible: match.hitboxesVisible,
    timeScale: match.timeScale, trainingCpuMode: match.trainingCpuMode });
  if (match.status === 'paused') fresh.status = 'paused';
  return Object.assign(match, fresh);
}

function makeIntern(match, port, template, respawning = false) {
  const f = makeState(match, { port, fighterId: BIZARRO_INTERN.id, paletteIndex: template?.paletteIndex ?? port % 2,
    name: template?.name, isCpu: true, cpuLevel: template?.cpuLevel ?? 4, team: 'interns' }, 1);
  if (respawning) {
    const deck = match.surfaces[0];
    f.x = clamp(match.stage.respawnPoint.x + (port - 2) * 100, deck.x + 35, deck.x + deck.w - 35);
    f.y = match.stage.blastzones.top - 28;
    f.vy = -4;
    leaveFloor(f);
    transition(f, S.AIRBORNE);
    f.hurtbox = getFighterHurtbox(f);
  }
  return f;
}

function staleMultiplier(f, key) {
  return f.staleQueue.reduce((m, old, i) => m - (old === key ? f.staleMultipliers[i] : 0), 1);
}

function stale(f, key) {
  f.staleQueue.unshift(key);
  f.staleQueue.length = Math.min(f.staleQueue.length, MELEE.STALE_QUEUE_LEN);
}

function faceInput(f, x) {
  if (Math.abs(x ?? 0) > 0.28) f.facing = Math.sign(x);
}

function leaveFloor(f) {
  f.grounded = false;
  f.onPlatformId = null;
}

function jump(match, f, input) {
  if (!f.grounded && f.jumpsUsed >= f.def.stats.maxJumps) return false;
  stopMove(f);
  if (f.grounded) {
    f.shortHop = !!input.shortHopPressed || !input.jump;
    f.queuedAttack = null;
    f.tapJumpSquat = !!input.tapJumpPressed;
    f.bufferedAerial = null;
    if (input.attackPressed || input.neutralCTap || f.inputBuffer.cStick) {
      bufferAerial(f, input);
      delete f.inputBuffer.attack;
    }
    f.queuedDodge = null;
    transition(f, S.JUMPSQUAT);
    return true;
  }
  f.shineJump = f.didShortHop = false;
  // Slot one is the ground jump, including when we leave a ledge without using it.
  f.jumpsUsed = Math.max(1, f.jumpsUsed) + 1;
  const airJumpNum = f.jumpsUsed - 1;
  const puffScale = f.def.stats.maxJumps >= 6 ? Math.max(0.70, 1 - 0.075 * (airJumpNum - 1)) : 1;
  f.vy = f.def.stats.doubleJumpVel * puffScale;
  if (Math.abs(input.moveX ?? 0) > 0.15) f.vx = input.moveX * f.def.stats.airSpeed * MOVE_PACE;
  f.fastFalling = false;
  transition(f, S.AIRBORNE, true);
  f.doubleJumping = true;
  f.doubleJumpFrame = 0;
  f.ledgeDoubleJump = f.ledgeDropFrame != null;
  event(match, 'jump', f, { doubleJump: true, airJumpNum });
  return true;
}

function airdodge(f, input) {
  const x = input.moveX || 0;
  const y = input.moveY || 0;
  const mag = Math.hypot(x, y);
  const speed = MELEE.AIRDODGE_SPEED * WORLD_SCALE;
  f.vx = mag > 0.2 ? speed * x / mag : 0;
  f.vy = mag > 0.2 ? speed * y / mag : 0;
  f.fastFalling = false;
  transition(f, S.AIRDODGE);
}

function aerialMove(f, input) {
  const c = f.inputBuffer.cStick;
  if (c) {
    if (Math.abs(c.y) >= Math.abs(c.x)) return c.y > 0 ? M.UAIR : M.DAIR;
    return c.x * f.facing > 0 ? M.FAIR : M.BAIR;
  }
  if (input.neutralCTap) return M.NAIR;
  const x = input.moveX || 0, y = input.moveY || 0;
  if (y >= 0.45) return M.UAIR;
  if (y <= -0.45) return M.DAIR;
  if (Math.hypot(x, y) < 0.35 || x === 0) return M.NAIR;
  return x * f.facing > 0 ? M.FAIR : M.BAIR;
}

function bufferAerial(f, input) {
  f.bufferedAerial = aerialMove(f, input);
  f.queuedAttack = { ...input, attackPressed: true, queuedCStick: f.inputBuffer.cStick };
  delete f.inputBuffer.cStick;
}

function jumpSquat(match, f, input) {
  if (!input.jump) f.shortHop = true;
  input = bufferedInput(f, input, ['grab', 'shield', 'special', 'attack']);
  if (input.grabPressed) {
    transition(f, S.GRAB);
    event(match, 'tech', f, { tech: 'JC GRAB' });
    return;
  }
  // Stick-up + A can cancel squat. The C-stick explicitly requests a rising aerial.
  if (input.attackPressed && !f.inputBuffer.cStick && f.stateFrame <= 2 &&
      (input.moveY >= SMASH || f.tapJumpSquat && input.moveY >= 0.45)) {
    const key = input.moveY >= SMASH ? M.USMASH : M.UTILT;
    startMove(match, f, key, input);
    if (key === M.USMASH) event(match, 'tech', f, { tech: 'JC UPSMASH' });
    return;
  }
  if (input.shieldPressed) f.queuedDodge = { moveX: input.moveX, moveY: input.moveY };
  if (input.specialPressed) {
    f.queuedAttack = input;
    f.bufferedAerial = null;
  } else if (input.attackPressed || input.neutralCTap || f.inputBuffer.cStick) bufferAerial(f, input);
  if (f.stateFrame < f.def.stats.jumpSquat) return;
  const attack = f.queuedAttack;
  const aerial = f.bufferedAerial;
  f.bufferedAerial = null;
  const dodge = f.queuedDodge;
  f.queuedAttack = f.queuedDodge = null;
  f.jumpsUsed = 1;
  leaveFloor(f);
  f.didShortHop = f.shortHop;
  f.didFastFall = f.didAerial = false;
  f.vy = f.shortHop ? f.def.stats.shortHopVel : f.def.stats.fullHopVel;
  transition(f, S.AIRBORNE);
  event(match, 'jump', f, { doubleJump: false });
  if (dodge) {
    // The first airborne frame starts just above the surface. A horizontal
    // dodge shouldn't land until the fighter actually descends to it.
    f.y += 5;
    airdodge(f, dodge);
  }
  else if (attack && !itemAction(match, f, attack)) {
    if (aerial) startMove(match, f, aerial, attack);
    else selectAttack(match, f, attack);
  }
}

function moveData(f, key) {
  const m = f.def.moves[key];
  if (!m && (key === M.JAB2 || key === M.JAB3)) {
    const jab = f.def.moves[M.JAB];
    const finisher = key === M.JAB3;
    return { ...jab, name: finisher ? 'Jab Finisher' : 'Jab Follow-Up',
      damage: jab.damage * (finisher ? 1.45 : 0.85), offsetX: (jab.offsetX ?? 34) + (finisher ? 9 : 4),
      bkb: finisher ? 41 : 15, kbg: finisher ? 81 : 21, angle: finisher ? 38 : 361,
      endlag: finisher ? jab.endlag + 3 : jab.endlag };
  }
  if ((key === M.NEUTRAL_B && DIRECT_NEUTRAL.has(f.fighterId)) || (key === M.SIDE_B && DIRECT_SIDE.has(f.fighterId))) {
    return { ...m, kind: 'strike' };
  }
  return m;
}

function startMove(match, f, key, input = EMPTY, data = moveData(f, key)) {
  if (!f.grounded && AIR_ATTACKS.has(key)) {
    f.didAerial = true;
    if (f.doubleJumping && f.doubleJumpFrame <= 12 && DJC_FIGHTERS.has(f.fighterId)) {
      f.vy = Math.min(f.vy, 1.5);
      event(match, 'tech', f, { tech: 'DJC' });
    }
  }
  if (key === M.UP_B) {
    if (!f.grounded) f.upBUsed = true;
    clearMeteor(f);
  }
  if (!f.grounded && key === M.SIDE_B && data.kind === 'dashBurst') f.sideBUsed = true;
  if (data.bossTell) {
    f.bossAttackCount++;
    f.bossLastAttack = data.bossTell;
    f.bossPlan = null;
    if (f.bossPhase === 2) data = { ...data, startup: Math.round(data.startup * 0.8), endlag: Math.round(data.endlag * 0.8) };
    const target = match.fighters.filter((v) => rivals(f, v) && v.state !== S.RESPAWN)
      .sort((a, b) => distance(f, a) - distance(f, b))[0];
    const deck = match.surfaces[0];
    const targetX = target?.x ?? f.x;
    f.bossTargetX = data.bossTell === 'gun' ? targetX : clamp(targetX, deck.x + 20, deck.x + deck.w - 20);
    f.bossTargetY = getSurfaceY(deck, f.bossTargetX);
    if (target) faceInput(f, target.x - f.x);
    f.bossSweepEnd = f.facing > 0 ? deck.x + deck.w - 22 : deck.x + 22;
    f.bossAimY = target ? target.y + target.def.stats.height * target.scale * 0.5 - (data.offsetY ?? 38) : f.y;
  }
  f.bReversed = false;
  f.moveKey = key;
  f.moveData = data;
  f.moveFrame = 0;
  f.hitTargets.clear();
  f.moveStale = key === M.ITEM_SWING || key === M.ITEM_THROW ? 1 : staleMultiplier(f, key);
  f.moveRecorded = false;
  f.chargeFrames = 0;
  f.charging = data.kind === 'chargePunch' ? !f.chargeShotLevel :
    data.kind === 'chargeShot' && (!data.storableCharge || !f.chargeShotLevel) && !!input.special;
  if (data.storableCharge && !f.charging) f.chargeFrames = Math.round(f.chargeShotLevel * 60);
  f.smashChargeKey = (SMASH_MOVES.has(key) || data.chargeable && key === M.ITEM_SWING) && input.attack ? key : null;
  f.smashChargeFrames = f.jabWindow = 0;
  f.jabStep = JABS.indexOf(key) + 1;
  f.specialAimX = input.moveX || 0;
  f.specialAimY = input.moveY || 0;
  f.counterTriggered = false;
  transition(f, f.grabbing != null ? S.THROW : S.ATTACK, true);
  if (data.technique || data.kind === 'powerPunch' || data.kind === 'chargePunch') {
    f.specialPhase = 'charge';
    f.specialChargeStyle = data.style;
    f.specialCharge = f.chargeFrames / 60;
    f.fastFalling = false;
  }
  if (data.boostX) f.vx += f.facing * data.boostX;
  if (data.selfDamage) {
    recordDamage(match, f, null, data.selfDamage);
    f.percent = roundDamage(f.percent + data.selfDamage);
  }
  if (data.kind === 'judge') {
    f.judgeNum = 1 + Math.floor(drawRng(match) * 9);
    const roll = data.rolls[f.judgeNum - 1];
    f.moveData = { ...data, ...roll };
    if (roll.selfDamage) {
      recordDamage(match, f, null, roll.selfDamage);
      f.percent = Math.min(999, f.percent + roll.selfDamage);
    }
    event(match, 'judge', f, { num: f.judgeNum });
  }
  if (f.moveData.damage >= 14 || SMASH_MOVES.has(key)) event(match, 'heavyAttack', f, voice(f));
}

function selectAttack(match, f, input) {
  const x = input.moveX ?? 0;
  const y = input.moveY ?? 0;
  const rawCStick = f.inputBuffer.cStick;
  const cStick = rawCStick && (!f.grounded || Math.max(Math.abs(rawCStick.x), Math.abs(rawCStick.y)) >= C_GROUND) ? rawCStick : null;
  const flickX = Math.abs(x) >= SMASH && Math.abs(input.prevX ?? f.prevMoveX ?? 0) < SMASH;
  const flickY = Math.abs(y) >= SMASH && Math.abs(input.prevY ?? f.prevMoveY ?? 0) < SMASH;
  if (input.specialPressed) {
    const vertical = Math.abs(y) > 0.42 && Math.abs(y) >= Math.abs(x) * 0.74;
    const key = vertical ? y > 0 ? M.UP_B : M.DOWN_B : Math.abs(x) > 0.48 ? M.SIDE_B : M.NEUTRAL_B;
    if (key === M.SIDE_B || key === M.UP_B || key === M.NEUTRAL_B) faceInput(f, x);
    startMove(match, f, key, input);
    return true;
  }
  if (!input.attackPressed && !input.neutralCTap && !cStick) return false;
  const ax = cStick ? cStick.x : x;
  const ay = cStick ? cStick.y : y;
  const vertical = Math.abs(ay) > 0.38 && Math.abs(ay) >= Math.abs(ax);
  let key;
  if (!f.grounded) {
    key = aerialMove(f, input);
  } else if (cStick?.tilt) {
    key = vertical ? ay > 0 ? M.UTILT : M.DTILT : M.FTILT;
    if (!vertical) faceInput(f, ax);
  } else if (!cStick && f.state === S.DASH && f.stateFrame <= DASH_FRAMES && input.attackPressed &&
      (x * f.facing < -0.32 || match.frame === f.pivotFrame + 1 && Math.abs(x) > 0.32)) {
    faceInput(f, x);
    key = Math.abs(x) >= SMASH ? M.FSMASH : M.FTILT;
    event(match, 'tech', f, { tech: 'PIVOT' });
  } else if (cStick || (vertical ? flickY : flickX) || (Math.abs(x) >= SMASH && Math.abs(y) >= SMASH)) {
    key = vertical ? ay > 0 ? M.USMASH : M.DSMASH : M.FSMASH;
    if (!vertical) faceInput(f, ax);
  } else if (f.state === S.RUN || f.state === S.DASH) {
    key = M.DASH_ATTACK;
  } else {
    key = vertical ? ay > 0 ? M.UTILT : M.DTILT : Math.abs(ax) > 0.32 ? M.FTILT : M.JAB;
    if (key === M.FTILT) faceInput(f, ax);
  }
  if (cStick && key === M.USMASH && (f.state === S.DASH || f.state === S.RUN)) {
    event(match, 'tech', f, { tech: 'JC UPSMASH' });
  }
  if (cStick) delete f.inputBuffer.cStick;
  startMove(match, f, key, input);
  return true;
}

function beginDodge(f, x, y) {
  const dir = Math.sign(x);
  if (Math.abs(x) > 0.45) {
    f.dodgeDir = dir;
    transition(f, dir === f.facing ? S.ROLL_F : S.ROLL_B);
  } else if (y < -0.45) {
    f.dodgeDir = 0;
    transition(f, S.SPOTDODGE);
  } else return false;
  f.vx = 0;
  return true;
}

function releaseGrab(match, f) {
  const victim = byPort(match, f.grabbing);
  if (victim?.grabbedBy === f.port) {
    victim.grabbedBy = null;
    victim.invulnFrames = Math.max(victim.invulnFrames, 12);
    transition(victim, victim.grounded ? S.IDLE : S.AIRBORNE);
  }
  f.grabbing = null;
}

function grabTarget(match, attacker, victim) {
  recordCombo(match, attacker, victim, 'grab');
  stopMove(victim);
  releaseGrab(match, victim);
  attacker.grabbing = victim.port;
  victim.grabbedBy = attacker.port;
  victim.vx = victim.vy = victim.kbVx = victim.kbVy = 0;
  victim.hitstun = 0;
  victim.launchAngle = null;
  victim.facing = -attacker.facing;
  transition(victim, S.GRABBED);
  transition(attacker, S.GRAB_HOLD, true);
  attacker.pummelTimer = 0;
}

function ledgeAction(match, f, input) {
  if (f.stateFrame < 6) {
    f.inputBuffer = {};
    return;
  }
  input = bufferedInput(f, input, ['special', 'jump', 'shield', 'attack', 'grab']);
  const inland = -f.ledgeSide;
  const toward = (input.moveX || 0) * inland;
  const heavy = f.percent >= 100;
  const drop = input.moveY < -0.52 || toward < -0.52 || f.stateFrame >= 360;
  const hop = input.jumpPressed || input.moveY > 0.55;
  if (!input.specialPressed && !drop && !hop && !input.shieldPressed &&
      !input.attackPressed && !input.grabPressed && toward <= 0.5) return;

  const id = f.ledgeId;
  f.ledgeId = null;
  f.ledgeCooldown = MELEE.LEDGE_REGRAB_COOLDOWN;
  if (input.specialPressed || drop) {
    f.invulnFrames = 8;
    f.vx = (input.moveX || 0) * 2;
    f.vy = -2;
    f.jumpsUsed = 0;
    transition(f, S.AIRBORNE);
    if (input.specialPressed) selectAttack(match, f, input);
    else {
      f.ledgeDropFrame = match.frame;
      f.ledgeDropId = id;
      f.ledgeDoubleJump = false;
    }
    return;
  }
  if (hop) {
    f.invulnFrames = 10;
    f.vx = inland * 4.8;
    f.vy = f.def.stats.fullHopVel * 1.05;
    f.jumpsUsed = 1;
    transition(f, S.AIRBORNE);
    event(match, 'jump', f, { doubleJump: false });
    return;
  }
  const deck = match.surfaces.find((d) => ledgeKey(d, f.ledgeSide) === id);
  f.grounded = true;
  f.onPlatformId = deck.id;
  f.x = f.ledgeX + inland * (input.shieldPressed ? 1 : 22);
  f.y = getSurfaceY(deck, f.x);
  if (input.shieldPressed) {
    f.dodgeDir = inland;
    transition(f, S.ROLL_F);
    f.ledgeRollFrames = heavy ? 32 : 24;
    f.invulnFrames = heavy ? 20 : 18;
  } else if (input.attackPressed || input.grabPressed) {
    const m = moveData(f, M.LEDGE_ATTACK);
    startMove(match, f, M.LEDGE_ATTACK, input, heavy ? { ...m, startup: m.startup + 4, endlag: m.endlag + 6 } : m);
    f.invulnFrames = heavy ? 12 : 16;
  } else {
    f.landingLag = heavy ? 26 : 16;
    f.invulnFrames = heavy ? 14 : 18;
    transition(f, S.LEDGE_CLIMB);
  }
}

function groundMove(match, f, x, y) {
  const s = f.def.stats;
  const traction = s.traction * (match.stage.iceTraction ?? 1);
  const mag = Math.abs(x);
  const dir = Math.sign(x);
  if (f.state === S.TURN && f.stateFrame < 4) {
    f.vx = approach(f.vx, 0, traction * 3);
    return;
  }
  const dashSpeed = s.dashSpeed * MOVE_PACE;
  const flick = f.stickHist.some((sample) => sample.x * dir < 0.35);
  const fromRest = f.state === S.IDLE || f.state === S.CROUCH || f.state === S.TURN;
  if (mag >= 0.78 && (flick || fromRest && mag >= 0.84 || f.state === S.DASH || f.state === S.RUN)) {
    if ((f.state === S.RUN || (f.state === S.DASH && f.stateFrame >= DASH_FRAMES)) && dir !== f.facing) {
      f.facing = dir;
      transition(f, S.TURN);
      f.vx = approach(f.vx, 0, traction * 3);
    } else if ((f.state === S.DASH && dir !== f.facing) || (f.state !== S.DASH && f.state !== S.RUN)) {
      if (f.state === S.DASH) f.pivotFrame = match.frame;
      f.facing = dir;
      f.vx = dir * dashSpeed * 0.78;
      transition(f, S.DASH, true);
      event(match, 'dash', f, { dir });
    } else if (f.state === S.RUN || f.stateFrame >= DASH_FRAMES) {
      transition(f, S.RUN);
      f.vx = approach(f.vx, dir * s.runSpeed * MOVE_PACE, traction * 2.2);
    } else {
      f.vx = approach(f.vx, dir * dashSpeed, Math.max(dashSpeed * 0.22, traction * 2.6));
    }
  } else if (mag >= 0.14) {
    f.facing = dir;
    transition(f, S.WALK);
    f.vx = approach(f.vx, x * s.walkSpeed * MOVE_PACE, traction * 1.8);
  } else {
    transition(f, y < -0.45 ? S.CROUCH : S.IDLE);
    f.vx = approach(f.vx, 0, traction);
  }
}

function dropThrough(f) {
  f.dropTimer = 12;
  f.dropId = f.onPlatformId;
  leaveFloor(f);
  f.jumpsUsed = 1;
  f.vy = -2;
  transition(f, S.AIRBORNE);
}

function shieldPressure(f, input) {
  f.lightShielding = isLightShield(input);
  f.shieldScale = f.lightShielding ? 1.34 : 1;
}

function neutral(match, f, input) {
  const keys = [];
  if (f.grounded || f.jumpsUsed < f.def.stats.maxJumps) keys.push('jump');
  if (f.grounded || f.heldItemId != null) keys.push('grab');
  if (!f.grounded || f.shieldDrop <= 0) keys.push('shield');
  keys.push('special', 'attack');
  input = bufferedInput(f, input, keys);
  const x = input.moveX || 0;
  const y = input.moveY || 0;
  if (f.def === SAGGING_BAG) return;
  if (input.specialPressed && input.tapJumpPressed) {
    delete f.inputBuffer.jump;
    delete f.inputBuffer.special;
  }
  if (input.jumpPressed && !(input.specialPressed && input.tapJumpPressed) && jump(match, f, input)) {
    if (f.doubleJumping && (input.attackPressed || input.neutralCTap || f.inputBuffer.cStick)) {
      delete f.inputBuffer.attack;
      if (!itemAction(match, f, input)) {
        startMove(match, f, aerialMove(f, input), input);
        delete f.inputBuffer.cStick;
      }
    }
    return;
  }
  if (itemAction(match, f, input)) return;
  if (f.grounded && input.grabPressed) {
    faceInput(f, x);
    transition(f, S.GRAB);
    return;
  }
  if (f.grounded && f.shieldDrop <= 0 && (input.shield || input.shieldPressed)) {
    f.vx *= 0.65;
    if (!input.shieldPressed || !beginDodge(f, x, y)) {
      f.shieldAge = 0;
      shieldPressure(f, input);
      transition(f, S.SHIELD);
    }
    return;
  }
  if (!f.grounded && input.grabPressed) {
    delete f.inputBuffer.grab;
    input = { ...input, attackPressed: true };
  }
  if (selectAttack(match, f, input)) return;
  if (f.grounded && input.tauntPressed) {
    transition(f, S.TAUNT);
    event(match, 'taunt', f, { ...voice(f), text: f.def.taunt });
    return;
  }
  if (f.grounded && y < -0.65 && (f.prevMoveY ?? 0) >= -0.55 &&
      match.platforms.some((p) => p.id === f.onPlatformId)) {
    dropThrough(f);
    return;
  }
  if (f.grounded) groundMove(match, f, x, y);
  else if (input.shieldPressed) airdodge(f, input);
  else {
    if (f.def === MASTER_MITT && y) f.vy = approach(f.vy, y * 5, 0.55);
  }
}

function activeMove(f) {
  const m = f.moveData;
  return m && f.moveFrame >= m.startup && f.moveFrame < m.startup + m.active;
}

function spawnProjectile(match, f, m, source = f) {
  const { facing } = source;
  const aim = (m.projAngle ?? ((m.projBounce || m.projSlide) && m.projGravity > 0 ? -6 : 0)) * RAD;
  const ratio = m.kind === 'chargeShot' ? 0.35 + 0.65 * f.chargeFrames / 60 : 1;
  const x = source.x + facing * Math.max(24, Math.abs(m.offsetX ?? 30));
  const y = source.y + (m.offsetY ?? f.def.stats.height * 0.5);
  const style = m.projStyle ?? 'fireball';
  const radius = Math.max(5, Math.round((m.radius ?? 18) * 0.7 * Math.sqrt(ratio)));
  const life = m.projLife ?? 60;
  match.projectiles.push({
    id: match.nextEntityId++, muzzleRootX: source.x, x, y, vx: facing * (m.projSpeed ?? 12) * Math.cos(aim), vy: (m.projSpeed ?? 12) * Math.sin(aim),
    r: radius, radius, ownerPort: f.port, port: f.port, style, life, maxLife: life, facing,
    damage: m.damage * ratio, moveKey: source.moveKey, sourceFighterId: f.fighterId,
    moveData: m.storableCharge && ratio < 1 ? { ...m, sweetspot: false } : m, mult: source.moveStale,
    varied: ratio, hitTargets: new Set(), recorded: false, age: 0, reflections: 0,
  });
  match.events.push({ type: 'projectile', x, y, style, port: f.port });
  if (m.selfLiftY) {
    leaveFloor(f);
    f.vy = Math.max(f.vy, m.selfLiftY);
    f.fastFalling = false;
  }
}

function stickAngle(match, f, input) {
  // The CPU's recovery stick only describes horizontal drift after pressing Up-B.
  // Aim its directional specials at a reachable lip while it is offstage.
  if (f.isCpu && !f.grounded && !match.surfaces.some(s => withinX(f.x, s) && f.y >= getSurfaceY(s, f.x))) {
    let distance = Infinity, angle = null;
    for (const deck of match.surfaces) {
      if (!deck.ledges || deck.walkOff) continue;
      for (const edge of [deck.x, deck.x + deck.w]) {
        const hangX = edge + (edge === deck.x ? -13 : 13);
        const dx = hangX - f.x, dy = getSurfaceY(deck, edge) - 20 - f.y;
        const length = Math.hypot(dx, dy);
        if (length >= distance) continue;
        distance = length;
        angle = Math.atan2(dy, dx);
      }
    }
    if (angle != null) {
      if (f.moveData.technique === 'quickAttack' && f.specialPhase === 'charge' && distance > 164) {
        angle += (Math.cos(angle) >= 0 ? 1 : -1) * 36 * RAD;
      }
      return angle;
    }
  }
  const x = input.moveX || 0, y = input.moveY || 0;
  return Math.hypot(x, y) > 0.18 ? Math.atan2(y, x) : null;
}

function showCharge(match, f, progress, angle) {
  f.specialCharge = clamp(progress, 0, 1);
  f.specialLaunchAngle = angle;
  event(match, 'specialCharge', f, { style: f.specialChargeStyle, progress: f.specialCharge, angle });
}

function specialLaunch(match, f, angle, misfire = false) {
  f.specialPhase = 'launch';
  f.specialLaunchAngle = angle;
  event(match, 'specialLaunch', f, { style: f.specialChargeStyle, angle, misfire });
}

function startFlight(f, angle, speed) {
  const x = Math.cos(angle), y = Math.sin(angle);
  f.specialLaunchAngle = angle;
  if (Math.abs(x) > 0.001) f.facing = Math.sign(x);
  if (y > 0.001 || !f.grounded) leaveFloor(f);
  f.vx = Math.abs(x) < 1e-8 ? 0 : x * speed;
  f.vy = f.grounded || Math.abs(y) < 1e-8 ? 0 : y * speed;
  f.kbVx = f.kbVy = 0;
  f.fastFalling = false;
  if (f.moveKey === M.UP_B) f.upBUsed = true;
}

function beginZip(f, angle, stage) {
  f.specialPhase = stage === 1 ? 'zip1' : 'zip2';
  f.zipOrigin = { fromX: f.x, fromY: f.y, stage };
  f.hitTargets.clear();
  startFlight(f, angle, stage === 1 ? f.moveData.speed : 23);
}

function endFlight(f) {
  f.vx *= f.moveData.technique === 'illusion' ? 0.08 : 0.18;
  f.vy *= 0.18;
  clearSpecial(f);
}

// Frame zero is the first active frame. Stop positional overrides in endlag so
// terrain, drift and gravity take over immediately after the last flight frame.
function tickSpecial(match, f, m, input, frame) {
  const technique = m.technique ?? m.kind;
  const aimed = ['chargeLaunch', 'quickAttack', 'teleport360'].includes(technique);
  const angle = aimed && frame <= 0 ? stickAngle(match, f, input) ?? Math.PI / 2 : f.facing < 0 ? Math.PI : 0;
  if (frame < 0) {
    if (technique !== 'chargePunch') showCharge(match, f, f.moveFrame / m.startup, angle);
    if (m.burnInterval && f.moveFrame % m.burnInterval === 0) f.hitTargets.clear();
    return;
  }
  if (frame === 0) {
    f.hitTargets.clear();
    if (aimed || technique === 'powerPunch' || technique === 'illusion') f.specialCharge = 1;
    if (technique === 'quickAttack') beginZip(f, angle, 1);
    else if (technique === 'teleport360') {
      event(match, 'teleportFlash', f, { phase: 'out', style: m.style });
      f.specialPhase = 'vanish';
      f.vanished = true;
      startFlight(f, angle, m.speed);
    } else if (technique === 'chargeMissile') {
      const misfire = !!m.misfireChance && drawRng(match) < m.misfireChance;
      const power = f.specialCharge;
      f.moveData = { ...m, damage: misfire ? 30 : m.damage * (0.4 + 0.6 * power),
        bkb: misfire ? 80 : m.bkb * (0.55 + 0.45 * power), kbg: misfire ? 125 : m.kbg,
        sweetspot: misfire || power === 1 };
      specialLaunch(match, f, angle, misfire);
      startFlight(f, angle, misfire ? 38 : m.speed * (0.5 + 0.5 * power));
    } else {
      specialLaunch(match, f, angle);
      if (technique === 'chargeLaunch' || technique === 'illusion') startFlight(f, angle, m.speed);
      if (technique === 'chargePunch') f.chargeShotLevel = 0;
    }
  }
  if (technique === 'quickAttack' && frame === 6) {
    const next = stickAngle(match, f, input);
    if (next != null && Math.cos(next - f.specialLaunchAngle) <= Math.cos(35 * RAD) + 1e-9) beginZip(f, next, 2);
    else f.moveFrame = m.startup + m.active;
  }
  if (technique === 'teleport360' && frame === 7) {
    f.vanished = false;
    f.vx = f.vy = 0;
    f.specialPhase = 'launch';
    event(match, 'teleportFlash', f, { phase: 'in', style: m.style });
  }
  if (technique === 'illusion' && frame < m.active && input.specialPressed) {
    delete f.inputBuffer.special;
    if (frame === 0) f.moveData = { ...m, active: 1 };
    else f.moveFrame = m.startup + m.active;
  }
  if (f.moveFrame === m.startup + m.active) {
    if (m.technique) endFlight(f);
    else clearSpecial(f);
  } else if (technique === 'illusion' && frame < m.active && frame % 2 === 0) {
    event(match, 'afterimage', f, { style: m.style, facing: f.facing });
  }
}

function activateSpecial(match, f, m) {
  if (m.bossTell === 'gun') {
    const dx = Math.max(1, (f.bossTargetX - f.x) * f.facing - Math.abs(m.offsetX));
    const angle = clamp(Math.atan2(f.bossAimY - f.y, dx) / RAD, -70, 70);
    for (const offset of f.bossPhase === 2 ? [-13, 0, 13] : [0]) {
      spawnProjectile(match, f, { ...m, projAngle: angle + offset });
    }
  } else if (m.kind === 'projectile' || m.kind === 'chargeShot') {
    spawnProjectile(match, f, m);
    if (m.storableCharge) f.chargeShotLevel = 0;
  }
  if (m.dropItem) spawnItem(match, ITEM_DEF[m.dropItem], f.x + f.facing * 40, f.y + 48, f.facing * 2, 5);
  if (m.kind === 'itemShot') {
    const item = heldItem(match, f);
    if (item?.id === m.itemId && item.ammo > 0) {
      item.ammo--;
      spawnProjectile(match, f, m);
    }
  }
  if (m.kind === 'reflector') event(match, 'shine', f);
  if (m.kind === 'dashBurst') {
    const misfire = m.misfireChance && drawRng(match) < m.misfireChance;
    f.vx = f.facing * (m.burstX ?? 14) * (misfire ? 1.6 : 1);
    if (misfire) f.moveData = { ...m, damage: m.damage * 1.45, sweetspot: true };
    if (!f.grounded || (m.burstY ?? 0) > 0) f.vy = m.burstY ?? 0;
    if (f.vy > 0) {
      leaveFloor(f);
      if (f.moveKey === M.SIDE_B) f.sideBUsed = true;
    }
  }
  if (m.kind === 'spin' && m.liftY) {
    leaveFloor(f);
    f.vy = Math.max(f.vy, m.liftY);
  }
  if (m.kind === 'stone') {
    f.vx *= 0.2;
    if (!f.grounded) f.vy = -27;
  }
  if (m.kind === 'recovery') {
    if (f.moveKey === M.UP_B) f.upBUsed = true;
    const aimX = Math.abs(f.specialAimX) > 0.2 ? f.specialAimX : 0;
    leaveFloor(f);
    f.fastFalling = false;
    f.vx = (m.recoveryX ?? 8) * aimX;
    f.vy = (m.recoveryY ?? 19) * (1 - 0.2 * Math.abs(aimX));
    f.parasolOpen = !!m.parasol;
  }
}

function storeCharge(match, f) {
  stopMove(f);
  transition(f, f.grounded ? S.IDLE : S.AIRBORNE);
  event(match, 'chargeStored', f, { level: f.chargeShotLevel });
}

function tickAttack(match, f, input) {
  const m = f.moveData;
  if (!m) {
    transition(f, f.grounded ? S.IDLE : S.AIRBORNE);
    return;
  }
  if (m.hammer && f.grounded) {
    input = bufferedInput(f, input, ['jump']);
    if (input.jumpPressed && jump(match, f, input)) return;
    const x = input.moveX || 0;
    faceInput(f, x);
    f.vx = approach(f.vx, x * f.def.stats.walkSpeed * 1.5,
      f.def.stats.traction * (match.stage.iceTraction ?? 1) * 2.5);
  }
  const reverseWindow = m.kind === 'powerPunch' ? f.moveFrame >= 5 && f.moveFrame < 18 : f.moveFrame >= 1 && f.moveFrame <= 3;
  if (!f.bReversed && (f.moveKey === M.NEUTRAL_B || f.moveKey === M.DOWN_B) &&
      reverseWindow && input.moveX * f.facing < -0.55 && (f.prevMoveX || 0) * f.facing >= -0.55) {
    f.facing *= -1;
    if (!f.grounded) f.vx *= -1;
    f.bReversed = true;
    event(match, 'tech', f, { tech: 'B-REVERSE' });
  }
  const shine = f.moveKey === M.DOWN_B && m.kind === 'reflector' && ['falcont', 'faux'].includes(f.fighterId);
  const cancelReady = m.jumpCancel && (shine ? f.moveRecorded || f.moveFrame >= 3 : f.moveFrame >= m.startup);
  if (cancelReady) input = bufferedInput(f, input, ['jump']);
  if (cancelReady && input.jumpPressed &&
      (f.grounded || f.jumpsUsed < f.def.stats.maxJumps)) {
    jump(match, f, input);
    f.shineJump = shine && f.grounded;
    return;
  }
  if (f.jabStep > 0 && f.jabStep < JABS.length && f.grounded) {
    const elapsed = f.moveFrame - m.startup - m.active + 1;
    f.jabWindow = elapsed >= 0 ? Math.max(0, m.endlag - elapsed + 1) : 0;
    if (f.jabWindow > 0) input = bufferedInput(f, input, ['attack']);
    if (input.attackPressed && f.jabWindow > 0) {
      startMove(match, f, JABS[f.jabStep], input);
      return;
    }
  }
  if (f.smashChargeKey && f.moveFrame === m.startup - 1) {
    if (input.attack && f.grounded) {
      transition(f, S.SMASH_CHARGE);
      event(match, 'smashCharge', f);
      return;
    }
    f.smashChargeKey = null;
  }
  if (m.technique === 'chargeMissile' && f.specialPhase === 'charge' && input.special) {
    f.chargeFrames++;
    showCharge(match, f, f.chargeFrames / 55, f.facing < 0 ? Math.PI : 0);
    if (f.chargeFrames < 55) return;
  }
  if (f.charging && m.storableCharge && (input.jumpPressed && (f.grounded || f.jumpsUsed < f.def.stats.maxJumps) || input.shieldPressed)) {
    storeCharge(match, f);
    neutral(match, f, input);
    return;
  }
  if (m.kind === 'chargePunch' && f.charging) {
    if (!input.special && f.chargeFrames <= 6) {
      f.charging = false;
      f.chargeFrames = f.chargeShotLevel = 0;
      f.moveFrame = m.startup - 3;
      return;
    }
    if (input.special) f.chargeFrames++;
    f.chargeShotLevel = Math.min(1, f.chargeFrames / 60);
    showCharge(match, f, f.chargeShotLevel, f.facing < 0 ? Math.PI : 0);
    if (input.special && f.chargeFrames < 60) return;
    storeCharge(match, f);
    return;
  }
  if (f.charging && f.moveFrame === m.startup - 1) {
    if (input.special && f.chargeFrames < 60) {
      f.chargeFrames++;
      if (m.storableCharge) f.chargeShotLevel = f.chargeFrames / 60;
      if (!m.storableCharge || f.chargeFrames < 60) return;
    }
    if (m.storableCharge && f.chargeFrames > 0) {
      storeCharge(match, f);
      return;
    }
    f.charging = false;
  }
  f.moveFrame++;
  const activeFrame = f.moveFrame - m.startup;
  if (m.multiHit && activeFrame > 0 && activeFrame < m.active &&
      activeFrame % m.multiHit.interval === 0 && activeFrame / m.multiHit.interval < m.multiHit.hits) {
    f.hitTargets.clear();
  }
  if (m.technique || m.kind === 'powerPunch' || m.kind === 'chargePunch') {
    tickSpecial(match, f, m, input, activeFrame);
  } else if (f.moveFrame === m.startup) {
    if (f.state === S.THROW) {
      const victim = byPort(match, f.grabbing);
      if (victim?.grabbedBy === f.port) {
        victim.grabbedBy = null;
        f.grabbing = null;
        victim.x = f.x + 26 * f.facing;
        victim.y = f.y;
        strike(match, f, victim, m, { key: f.moveKey, mult: f.moveStale, unblockable: true });
        if (!f.moveRecorded) stale(f, f.moveKey);
        f.moveRecorded = true;
      }
    } else activateSpecial(match, f, m);
  }
  if (m.shotInterval && activeFrame > 0 && activeFrame < m.active && activeFrame % m.shotInterval === 0) {
    spawnProjectile(match, f, m);
  }
  if (f.moveFrame >= m.startup + m.active + m.endlag) {
    stopMove(f);
    const helpless = m.kind === 'recovery' || m.kind === 'teleport' || m.technique === 'illusion';
    transition(f, f.grounded ? S.IDLE : helpless ? S.FREEFALL : S.AIRBORNE);
    if (f.inputBuffer.cStick && f.state !== S.FREEFALL) neutral(match, f, input);
  }
}

function tickSmashCharge(match, f, input) {
  if (f.grounded && input.attack) {
    f.smashChargeFrames++;
    if (f.smashChargeFrames < MELEE.SMASH_CHARGE_MAX_FRAMES) return;
  }
  f.smashChargeKey = null;
  transition(f, S.ATTACK);
  tickAttack(match, f, input);
}

function clearMeteor(f) {
  f.meteorHitFrame = -999;
  f.meteorByPort = null;
  f.meteorTimer = 0;
}

function tryMeteorCancel(match, f, input) {
  if (f.grounded || f.kbVy >= 0 || f.meteorHitFrame === -999 ||
      match.frame - f.meteorHitFrame < MELEE.METEOR_CANCEL_MIN_FRAMES) return false;
  const x = input.moveX || 0;
  const y = input.moveY || 0;
  const upB = input.specialPressed && y > 0.42 && y >= Math.abs(x) * 0.74;
  const canJump = input.jumpPressed && f.jumpsUsed < f.def.stats.maxJumps;
  if (!upB && !canJump) return false;
  f.kbVx = f.kbVy = f.vy = f.hitstun = 0;
  f.launchAngle = null;
  clearMeteor(f);
  transition(f, S.AIRBORNE);
  delete f.inputBuffer[canJump ? 'jump' : 'special'];
  if (canJump) jump(match, f, input);
  else selectAttack(match, f, input);
  event(match, 'meteorCancel', f);
  return true;
}

function tickGrabHold(match, f, input) {
  const victim = byPort(match, f.grabbing);
  if (!victim || victim.grabbedBy !== f.port || f.stateFrame >= 50 + Math.min(90, victim.percent * 0.45)) {
    releaseGrab(match, f);
    transition(f, S.IDLE);
    return;
  }
  const c = f.inputBuffer.cStick;
  if (c && Math.max(Math.abs(c.x), Math.abs(c.y)) >= C_GROUND) {
    delete f.inputBuffer.cStick;
    startMove(match, f, throwDirection(f, c.x, c.y));
    return;
  }
  if (!f.pummelTimer) input = bufferedInput(f, input, ['attack', 'grab']);
  if (!f.pummelTimer && (input.attackPressed || input.grabPressed)) {
    const damage = 2.5;
    f.pummelTimer = 13;
    recordDamage(match, victim, f, damage);
    victim.percent = roundDamage(victim.percent + damage);
    f.damageDealt = roundDamage(f.damageDealt + damage);
    recordCombo(match, f, victim, 'pummel');
    markHit(match, f, victim, { damage, moveKey: 'pummel' });
    return;
  }
  const { moveX: x = 0, moveY: y = 0 } = input;
  if (f.stateFrame < 5 || f.pummelTimer > 4 || Math.max(Math.abs(x), Math.abs(y)) < 0.57) return;
  startMove(match, f, throwDirection(f, x, y));
}

function throwDirection(f, x, y) {
  if (Math.abs(y) >= Math.abs(x)) return y > 0 ? M.UTHROW : M.DTHROW;
  return x * f.facing > 0 ? M.FTHROW : M.BTHROW;
}

function wakeFromSleep(match, f) {
  f.sleepTimer = 0;
  f.sleepImmuneFrames = f.def === MASTER_MITT ? 240 : 45;
  if (f.def === MASTER_MITT) {
    f.squashX = 0.78;
    f.squashY = 1.25;
    event(match, 'bossWakeup', f);
  }
}

function updateState(match, f, input) {
  // Training reset replaces the attack directly between simulation ticks.
  if (f.state !== S.ATTACK && f.specialPhase) clearSpecial(f);
  if (f.parasolOpen && f.state !== S.ATTACK && f.state !== S.FREEFALL) f.parasolOpen = false;
  if (f.state === S.DEAD) return false;
  if (isShield(f)) {
    f.shieldAge++;
    if (input.shield) shieldPressure(f, input);
  }
  if (input.shieldPressed || input.grabPressed) {
    f.lCancelTimer = MELEE.LCANCEL_WINDOW + 1;
  }
  if (input.shieldPressed && f.techLock <= 0) {
    f.techTimer = MELEE.TECH_WINDOW + 1;
    f.techLock = 40;
  }
  if (f.sleepImmuneFrames > 0) f.sleepImmuneFrames--;
  if (f.sleepTimer > 0 && --f.sleepTimer === 0) wakeFromSleep(match, f);
  if (f.hitlag > 0) {
    if (HURT.has(f.state)) hitlagDI(match, f, input);
    f.hitlag--;
    if (!f.hitlag && f.launchAngle != null) applyDI(f, input);
    return false;
  }
  if (f.launchAngle != null) applyDI(f, input);

  f.stateFrame++;
  if (f.doubleJumping) f.doubleJumpFrame++;
  for (const timer of ['invulnFrames', 'ledgeCooldown', 'shieldDrop', 'pummelTimer',
    'dropTimer', 'comboTimer', 'lastHitTimer', 'wallJumpCooldown']) {
    if (f[timer] > 0) f[timer]--;
  }
  if (!isShield(f) && !f.shieldBroken) f.shieldHp = Math.min(MELEE.SHIELD_MAX, f.shieldHp + MELEE.SHIELD_REGEN);
  if (f.sleepTimer > 0) return true;
  if (!f.grounded && (f.state === S.AIRBORNE || f.state === S.ATTACK && AIR_ATTACKS.has(f.moveKey)) &&
      input.moveY < -0.65 && (f.prevMoveY || 0) >= -0.55 && f.vy < -0.1) {
    f.fastFalling = f.didFastFall = true;
  }
  switch (f.state) {
    case S.GRABBED:
      if (input.attackPressed || input.specialPressed || input.jumpPressed || input.shieldPressed) {
        const holder = byPort(match, f.grabbedBy);
        if (holder?.state === S.GRAB_HOLD) holder.stateFrame += 4;
      }
      return false;
    case S.RESPAWN:
      if (f.stateFrame >= MELEE.RESPAWN_PLATFORM_MAX || (f.stateFrame >= 26 &&
          (input.jumpPressed || input.attackPressed || Math.abs(input.moveX || 0) > 0.35 || input.moveY < -0.35))) {
        f.invulnFrames = MELEE.RESPAWN_INVINCIBILITY;
        transition(f, S.AIRBORNE);
        f.vy = -2;
      }
      return false;
    case S.HITSTUN:
    case S.TUMBLE:
      if (tryMeteorCancel(match, f, input)) break;
      if (f.hitstun > 0) f.hitstun--;
      if (f.state === S.TUMBLE && !f.hitstun && (f.inputBuffer.cStick || input.jumpPressed || input.specialPressed || input.attackPressed ||
          (Math.abs(input.moveX || 0) > 0.65 && Math.abs(f.prevMoveX || 0) <= 0.65))) {
        transition(f, f.grounded ? S.IDLE : S.AIRBORNE);
        neutral(match, f, input);
      } else if (f.state === S.HITSTUN && !f.hitstun) {
        transition(f, f.grounded ? S.IDLE : S.AIRBORNE);
        neutral(match, f, input);
      }
      break;
    case S.LEDGE_HANG:
      ledgeAction(match, f, input);
      if (f.state === S.ATTACK) tickAttack(match, f, input);
      break;
    case S.LANDING:
    case S.LEDGE_CLIMB:
      if (f.stateFrame >= f.landingLag) {
        transition(f, f.grounded ? S.IDLE : S.AIRBORNE);
        neutral(match, f, input);
      }
      break;
    case S.JUMPSQUAT:
      jumpSquat(match, f, input);
      if (f.state === S.ATTACK) tickAttack(match, f, input);
      break;
    case S.SHIELD_STUN:
      if (--f.shieldStun <= 0) transition(f, S.SHIELD);
      break;
    case S.SHIELD:
      if (f.inputBuffer.cStick?.y >= C_GROUND && !f.inputBuffer.cStick.tilt &&
          f.inputBuffer.cStick.y >= Math.abs(f.inputBuffer.cStick.x)) {
        delete f.inputBuffer.cStick;
        startMove(match, f, M.USMASH, input);
        event(match, 'tech', f, { tech: 'JC UPSMASH' });
        break;
      }
      input = bufferedInput(f, input, ['special', 'jump', 'grab', 'attack']);
      if (input.moveY <= -0.52 && match.platforms.some((p) => p.id === f.onPlatformId) &&
          (input.moveY > -0.92 || f.lightShielding && (f.prevMoveY || 0) > -0.52 || input.jumpPressed)) {
        dropThrough(f);
        event(match, 'tech', f, { tech: 'SHIELD DROP' });
      } else if (input.specialPressed && input.moveY > 0.42) {
        delete f.inputBuffer.jump;
        startMove(match, f, M.UP_B, input);
      } else if (input.jumpPressed) {
        jump(match, f, input);
      } else if (input.grabPressed || input.attackPressed) {
        if (!itemAction(match, f, input)) transition(f, S.GRAB);
      } else if (input.shield && (Math.abs(input.moveX || 0) > 0.54 && Math.abs(f.prevMoveX || 0) <= 0.54 ||
          input.moveY < -0.54 && (f.prevMoveY || 0) >= -0.54) && beginDodge(f, input.moveX || 0, input.moveY || 0)) {
        // A fresh directional input while holding shield starts a dodge.
      } else if (!input.shield) {
        f.shieldDrop = 7;
        f.landingLag = 7;
        transition(f, S.LANDING);
      } else if ((f.shieldHp -= MELEE.SHIELD_DRAIN * (f.lightShielding ? 0.6 : 1)) <= 0) {
        breakShield(match, f);
      }
      break;
    case S.SHIELD_BREAK:
      if (f.grounded) {
        f.dizzyFrames++;
        if (f.dizzyFrames >= MELEE.SHIELD_BREAK_DIZZY_FRAMES) {
          f.shieldBroken = false;
          f.shieldHp = MELEE.SHIELD_MAX / 2;
          transition(f, S.IDLE);
        }
      }
      break;
    case S.ROLL_F:
    case S.ROLL_B:
    case S.SPOTDODGE: {
      const duration = f.ledgeRollFrames || (f.state === S.SPOTDODGE ? MELEE.SPOTDODGE_FRAMES : MELEE.ROLL_FRAMES);
      if (f.stateFrame >= duration) {
        if (f.ledgeRollFrames) f.vx = 0;
        transition(f, f.grounded ? S.IDLE : S.AIRBORNE);
      } else {
        const peak = f.ledgeRollFrames ? 94 * Math.tan(Math.PI / (2 * duration)) : 6.7;
        f.vx = f.dodgeDir * Math.sin(Math.PI * f.stateFrame / duration) * peak;
      }
      break;
    }
    case S.AIRDODGE:
      if (f.stateFrame >= MELEE.AIRDODGE_FRAMES) transition(f, S.FREEFALL);
      break;
    case S.FREEFALL:
      break;
    case S.GRAB:
      if (f.stateFrame >= 24) transition(f, f.grounded ? S.IDLE : S.AIRBORNE);
      break;
    case S.GRAB_HOLD:
      tickGrabHold(match, f, input);
      if (f.state === S.THROW) tickAttack(match, f, input);
      break;
    case S.ATTACK:
    case S.THROW:
      tickAttack(match, f, input);
      break;
    case S.SMASH_CHARGE:
      tickSmashCharge(match, f, input);
      break;
    case S.TECH:
      if (f.grounded && f.dodgeDir) f.vx = f.dodgeDir * 9.5 * Math.sin(Math.PI * f.stateFrame / 26);
      if (f.stateFrame >= (f.grounded && f.dodgeDir ? 26 : 22)) {
        transition(f, f.grounded ? S.IDLE : S.AIRBORNE);
        neutral(match, f, input);
      }
      break;
    case S.KNOCKDOWN:
      if (f.stateFrame >= 45 || f.stateFrame >= 14 &&
          (input.attackPressed || input.shieldPressed || input.jumpPressed || Math.abs(input.moveX || 0) > 0.5)) {
        f.inputBuffer = {};
        f.invulnFrames = Math.max(f.invulnFrames, 9);
        f.landingLag = 11;
        transition(f, S.LANDING);
      }
      break;
    case S.TAUNT:
      if (f.stateFrame >= 45) transition(f, f.grounded ? S.IDLE : S.AIRBORNE);
      break;
    default:
      neutral(match, f, input);
      if (f.state === S.ATTACK) tickAttack(match, f, input);
      break;
  }
  return true;
}

function land(match, f, surface, input, velocity) {
  const prior = f.state;
  const shffl = f.didShortHop && f.didFastFall && f.didAerial;
  f.didShortHop = f.didFastFall = f.didAerial = false;
  const activeAerial = prior === S.ATTACK && AIR_ATTACKS.has(f.moveKey);
  f.grounded = true;
  f.onPlatformId = surface.id;
  f.y = getSurfaceY(surface, f.x);
  f.upBUsed = f.sideBUsed = false;
  f.floatUsed = f.floating = f.doubleJumping = false;
  f.floatFrames = 0;
  f.vy = 0;
  f.kbVy = 0;
  f.fastFalling = false;
  f.jumpsUsed = 0;
  clearMeteor(f);
  event(match, 'land', f, { speed: Math.max(0, -velocity), weight: f.def.stats.weight * f.scale });
  if (prior === S.SHIELD_BREAK || prior === S.GRABBED) return;
  // Touchdown during windup or warp keeps the queued launch / reappearance.
  if (prior === S.ATTACK && (f.specialPhase === 'charge' || f.moveData?.technique === 'teleport360' && f.specialPhase)) {
    if (f.vanished) f.vx = 0;
    return;
  }
  if (prior === S.TUMBLE) {
    if (f.techTimer > 0) {
      f.techTimer = 0;
      f.hitstun = 0;
      f.kbVx = 0;
      f.dodgeDir = Math.abs(input.moveX || 0) > 0.45 ? Math.sign(input.moveX) : 0;
      f.vx = 0;
      delete f.inputBuffer.shield;
      f.invulnFrames = Math.max(f.invulnFrames, 18);
      transition(f, S.TECH);
      event(match, 'tech', f, { dir: f.dodgeDir });
    } else if (velocity < -3 && f.def !== SAGGING_BAG) {
      f.hitstun = 0;
      f.kbVx *= 0.42;
      transition(f, S.KNOCKDOWN);
    } else {
      transition(f, f.hitstun ? S.HITSTUN : S.IDLE);
    }
    return;
  }
  if (prior === S.HITSTUN) return;
  if (prior === S.AIRDODGE) {
    f.landingLag = 10;
    const cap = MELEE.WAVEDASH_LANDING_SPEED * Math.sqrt(80 / f.def.stats.weight);
    f.vx = clamp(f.vx, -cap, cap);
    const dir = Math.sign(f.vx);
    if (dir) {
      f.wavedashCount++;
      event(match, 'wavedash', f, { dir });
      if (f.ledgeDropFrame != null && match.frame - f.ledgeDropFrame <= 26 && f.ledgeDoubleJump &&
          f.ledgeDropId === ledgeKey(surface, f.ledgeSide) && dir === -f.ledgeSide) {
        f.invulnFrames += 10;
        event(match, 'tech', f, { tech: 'LEDGEDASH' });
      }
      if (f.shineJump) event(match, 'tech', f, { tech: 'WAVESHINE' });
    }
  } else if (activeAerial && !f.moveData.bossTell) {
    const m = f.moveData;
    const lag = m.landingLag ?? 12;
    const autoCancel = f.moveFrame < Math.max(2, m.startup - 1) ||
      f.moveFrame > m.startup + m.active + Math.floor((m.endlag || 10) * 0.65);
    f.landingLag = autoCancel ? 4 : lag;
    if (f.lCancelTimer > 0) {
      delete f.inputBuffer.shield;
      delete f.inputBuffer.grab;
      f.lCancelTimer = 0;
      if (!autoCancel) {
        f.landingLag = Math.floor(lag / 2);
        f.lCancelCount++;
        event(match, 'lCancel', f);
        if (shffl) event(match, 'tech', f, { tech: 'SHFFL' });
      }
    }
    stopMove(f);
  } else if (prior === S.ATTACK && f.moveData?.kind === 'stone') {
    if (!f.moveData.bossTell) f.moveFrame = Math.max(f.moveFrame, f.moveData.startup);
    f.vx = 0;
    return;
  } else if (prior === S.ATTACK && !['recovery', 'teleport'].includes(f.moveData?.kind)) {
    return;
  } else {
    if (prior === S.ATTACK) stopMove(f);
    f.landingLag = prior === S.FREEFALL ? 18 : 4;
  }
  transition(f, S.LANDING);
}

const ledgeKey = (deck, side) => deck.id + (side < 0 ? '-left' : '-right');

function crossesLedgeWindow(oldX, oldY, x, y, edge, top) {
  const dx = x - oldX;
  let enter = 0, exit = 1;
  if (dx === 0) {
    if (Math.abs(x - edge) > 58) return false;
  } else {
    const left = (edge - 58 - oldX) / dx;
    const right = (edge + 58 - oldX) / dx;
    enter = Math.max(0, Math.min(left, right));
    exit = Math.min(1, Math.max(left, right));
    if (enter > exit) return false;
  }
  const y1 = oldY + (y - oldY) * enter;
  const y2 = oldY + (y - oldY) * exit;
  return Math.min(y1, y2) <= top + 26 && Math.max(y1, y2) >= top - 92;
}

function tryLedge(match, f, input, oldX, oldY) {
  if (f.grounded || f.ledgeCooldown > 0 || f.hitstun > 0 || f.def === SAGGING_BAG || input.moveY < -0.58) return;
  const recovering = f.state === S.ATTACK && ['recovery', 'teleport', 'dashBurst'].includes(f.moveData?.kind) &&
    (f.moveData.technique ? f.specialPhase !== 'charge' : f.moveFrame >= Math.max(2, Math.min(6, f.moveData.startup || 4)));
  const free = f.state === S.AIRBORNE || f.state === S.FREEFALL || f.state === S.AIRDODGE && f.stateFrame >= 16;
  if (!recovering && (!free || f.vy + f.kbVy > 2)) return;
  for (const deck of match.surfaces) {
    if (!deck.ledges || deck.walkOff) continue;
    for (const side of [-1, 1]) {
      const edge = side < 0 ? deck.x : deck.x + deck.w;
      const edgeY = getSurfaceY(deck, edge);
      if (recovering) {
        if (f.moveData.technique && oldY >= edgeY - 1 && (f.x - oldX) * side > 0) continue;
        if (!crossesLedgeWindow(oldX, oldY, f.x, f.y, edge, edgeY)) continue;
      } else if ((f.x - edge) * side > 56 || Math.abs(f.x - edge) > 58 || f.y > edgeY + 26 || f.y < edgeY - 92) continue;
      const hangX = edge + side * 13;
      const body = getFighterHurtbox(f, S.LEDGE_HANG, hangX, edgeY);
      const covered = match.surfaces.some((other) => {
        if (other === deck || body.y + body.h <= other.y - other.h) return false;
        const left = Math.max(body.x, other.x);
        const right = Math.min(body.x + body.w, other.x + other.w);
        return left < right && body.y < Math.max(getSurfaceY(other, left), getSurfaceY(other, right));
      });
      if (covered) continue;
      const id = ledgeKey(deck, side);
      if (match.fighters.some((other) => other !== f && other.state === S.LEDGE_HANG &&
          other.ledgeId === id && other.ledgeSide === side)) continue;
      if (f.vanished) {
        // Finish the seven invisible frames at the lip before snapping on reappearance.
        f.x = hangX;
        f.y = edgeY - 1;
        f.vx = f.vy = 0;
        return;
      }
      stopMove(f);
      f.ledgeX = edge;
      clearMeteor(f);
      f.ledgeY = edgeY;
      f.x = hangX;
      f.y = edgeY;
      f.facing = -side;
      f.vx = f.vy = f.kbVx = f.kbVy = 0;
      f.jumpsUsed = 0;
      f.fastFalling = false;
      f.upBUsed = f.sideBUsed = f.floatUsed = false;
      f.inputBuffer = {};
      f.floatFrames = 0;
      f.ledgeId = id;
      f.ledgeSide = side;
      f.invulnFrames = Math.max(f.invulnFrames, MELEE.LEDGE_INVINCIBILITY);
      transition(f, S.LEDGE_HANG);
      event(match, 'ledgeGrab', f);
      return;
    }
  }
}

function wallAction(match, f, input, side, touching) {
  if (f.def === SAGGING_BAG) return false;
  if (HURT.has(f.state) && f.hitstun > 0 && f.techTimer > 0 && (touching || input.shieldPressed)) {
    f.techTimer = f.hitstun = f.kbVx = f.kbVy = 0;
    f.dodgeDir = 0;
    delete f.inputBuffer.shield;
    f.vx = side * 5;
    f.vy = 5;
    f.launchAngle = null;
    clearMeteor(f);
    f.invulnFrames = Math.max(f.invulnFrames, 18);
    transition(f, S.TECH);
    event(match, 'tech', f, { wall: true });
    return true;
  }
  const away = (input.moveX ?? 0) * side;
  if ([S.AIRBORNE, S.FREEFALL].includes(f.state) && f.hitstun <= 0 && f.wallJumpCooldown === 0 &&
      away > 0.5 && (f.prevWallInput ?? 0) * side <= 0.5) {
    stopMove(f);
    f.vx = side * MELEE.WALL_JUMP_VX;
    f.vy = MELEE.WALL_JUMP_VY;
    f.kbVx = f.kbVy = 0;
    f.fastFalling = false;
    f.wallJumpCooldown = 25;
    f.facing = side;
    transition(f, S.AIRBORNE, true);
    event(match, 'walljump', f);
    return true;
  }
  return false;
}

function canEdgeCancel(f) {
  if (f.state === S.LANDING) return true;
  if (f.state !== S.ATTACK) return false;
  if (f.moveData?.technique && f.specialPhase) return false;
  return f.moveKey === M.SIDE_B || f.moveKey === M.UP_B ||
    AIR_ATTACKS.has(f.moveKey) && f.moveFrame >= f.moveData.startup + f.moveData.active;
}

function edgeCancel(match, f) {
  stopMove(f);
  f.landingLag = 0;
  transition(f, S.AIRBORNE);
  event(match, 'tech', f, { tech: 'EDGE CANCEL' });
}

// Sweep in the translating surface's local coordinates. Clip the horizontal span
// first so entering a steep slope from the side cannot register as a landing.
function topCrossing(previous, surface, x0, y0, x1, y1) {
  const u0 = x0 - previous.x;
  const du = x1 - surface.x - u0;
  let enter = 0, exit = 1;
  if (du) {
    const a = -u0 / du, b = (surface.w - u0) / du;
    enter = Math.max(0, Math.min(a, b));
    exit = Math.min(1, Math.max(a, b));
    if (enter > exit) return null;
  } else if (u0 < 0 || u0 > surface.w) return null;
  const gap = (t) => {
    const u = u0 + du * t;
    const before = getSurfaceY(previous, previous.x + u);
    const after = getSurfaceY(surface, surface.x + u);
    return y0 + (y1 - y0) * t - (before + (after - before) * t);
  };
  const start = gap(enter), end = gap(exit);
  if (start < -0.01 || end > 0 || end > start) return null;
  return start <= 0 ? enter : enter + (exit - enter) * start / (start - end);
}

function detachFloor(f) {
  leaveFloor(f);
  f.jumpsUsed = Math.max(1, f.jumpsUsed);
  if (GROUND_MOVEMENT.has(f.state) || isShield(f) || f.state === S.LANDING || f.state === S.JUMPSQUAT) {
    transition(f, S.AIRBORNE);
  }
}

function updateTerrain(match) {
  const { stage, frame, fighters, bridgeState, barrelCannon } = match;
  const prior = [...match.surfaces, ...match.platforms];
  const form = getStageForm(stage, frame);
  const transformed = form?.id !== match.stageForm?.id;
  match.stageForm = form;
  if (form?.changeIn === 120) match.events.push({ type: 'stageTransformWarn', nextForm: form.nextForm, x: 0, y: 200, port: 0 });
  if (transformed) match.events.push({ type: 'stageTransform', name: form.name, formId: form.id, x: 0, y: 200, port: 0 });
  const restoredBridge = bridgeState?.broken && --bridgeState.respawnTimer <= 0;
  if (restoredBridge) {
    bridgeState.broken = false;
    bridgeState.hp = bridgeState.maxHp;
  }
  match.surfaces = resolveStageSolids(stage, frame).filter((s) => !(s.breakable && bridgeState?.broken));
  const seesaw = stage.seesaw;
  if (seesaw) {
    let balance = 0;
    for (const f of fighters) {
      if (!f.grounded) continue;
      const weight = f.def.stats.weight * f.scale;
      if (f.onPlatformId === seesaw.leftId) balance += weight;
      if (f.onPlatformId === seesaw.rightId) balance -= weight;
    }
    match.seesawOffset = approach(match.seesawOffset, clamp(balance / 100, -1, 1) * seesaw.maxOffset, 1.5);
  }
  match.platforms = resolveStagePlatforms(stage, frame).filter((p) => {
    if (!p.vanishing) return true;
    const state = match.platformStates[p.id];
    if (state.vanished) {
      if (--state.respawnTimer === 0) {
        state.standTimer = 0;
        state.vanished = false;
      }
    } else if (fighters.some((f) => f.grounded && f.onPlatformId === p.id)) {
      if (++state.standTimer >= 75) {
        state.vanished = true;
        state.respawnTimer = 150;
      }
    }
    return !state.vanished;
  }).map((p) => {
    if (seesaw && p.id === seesaw.leftId) return { ...p, y: seesaw.baseY - match.seesawOffset };
    if (seesaw && p.id === seesaw.rightId) return { ...p, y: seesaw.baseY + match.seesawOffset };
    return p;
  });
  if (barrelCannon) {
    const { minX, maxX, speed } = stage.barrelCannon;
    barrelCannon.x = (minX + maxX + Math.sin(frame * speed) * (maxX - minX)) / 2;
    barrelCannon.angle = 0.65 * Math.sin(frame * speed * 1.45);
    if (barrelCannon.cooldown > 0) barrelCannon.cooldown--;
  }
  const current = [...match.surfaces, ...match.platforms];
  for (const f of fighters) {
    if (f.state === S.DEAD || f.state === S.RESPAWN) continue;
    if (f.state === S.LEDGE_HANG) {
      const deck = transformed ? match.surfaces.find((s) => s.ledges &&
        Math.abs((f.ledgeSide < 0 ? s.x : s.x + s.w) - f.ledgeX) <= 24) :
        match.surfaces.find((s) => ledgeKey(s, f.ledgeSide) === f.ledgeId);
      if (deck) {
        f.ledgeId = ledgeKey(deck, f.ledgeSide);
        f.ledgeX = f.ledgeSide < 0 ? deck.x : deck.x + deck.w;
        f.ledgeY = getSurfaceY(deck, f.ledgeX);
        f.x = f.ledgeX + 13 * f.ledgeSide;
        f.y = f.ledgeY;
      } else {
        f.ledgeId = null;
        transition(f, S.AIRBORNE);
      }
    }
    if (transformed && f.grounded) {
      // At the flat seam retain the action and world X. Platform riders can
      // board the incoming lift, while deck riders stay on the connected deck.
      const wasPlatform = prior.some((p) => p.id === f.onPlatformId && p.h == null);
      const floor = (wasPlatform && match.platforms.find((p) => withinX(f.x, p))) ||
        match.surfaces.find((s) => withinX(f.x, s));
      if (floor) {
        f.onPlatformId = floor.id;
        f.y = getSurfaceY(floor, f.x);
      } else detachFloor(f);
    } else if (f.grounded) {
      const floor = current.find((s) => s.id === f.onPlatformId);
      const old = prior.find((s) => s.id === f.onPlatformId);
      if (old && floor) {
        const oldX = f.x, oldY = f.y;
        const height = f.def.stats.height * f.scale;
        f.x += floor.x - old.x;
        f.y = getSurfaceY(floor, f.x);
        for (const deck of match.surfaces) {
          if (deck === floor) continue;
          const before = prior.find((s) => s.id === deck.id) ?? deck;
          if (withinX(f.x, deck) && getSurfaceY(deck, f.x) > f.y && topCrossing(before, deck, oldX, oldY, f.x, f.y) != null) {
            f.onPlatformId = deck.id;
            f.y = getSurfaceY(deck, f.x);
            continue;
          }
          const topY = getSurfaceY(deck, clamp(f.x, deck.x, deck.x + deck.w));
          const botY = deck.y - deck.h;
          if (withinX(f.x, deck) && f.y < topY - 1 && f.y + height > botY) {
            // Moving platform carried rider into a solid deck's side face or underside: push out & detach cleanly.
            const distL = Math.abs(oldX - deck.x);
            const distR = Math.abs(oldX - (deck.x + deck.w));
            if (oldY + height <= botY + 4) {
              f.y = botY - height - 1;
              f.vy = Math.min(0, f.vy);
            } else {
              f.x = distL <= distR ? deck.x - 1 : deck.x + deck.w + 1;
              f.vx = 0;
              // A passing wall may push us sideways while the original deck still supports us.
              if (withinX(f.x, floor)) {
                f.y = getSurfaceY(floor, f.x);
                continue;
              }
            }
            detachFloor(f);
            break;
          }
        }
      } else detachFloor(f);
    }
    if (restoredBridge) {
      const floor = match.surfaces.filter((s) => s.breakable && withinX(f.x, s) && f.y >= s.y - s.h && f.y <= getSurfaceY(s, f.x))
        .sort((a, b) => getSurfaceY(b, f.x) - getSurfaceY(a, f.x))[0];
      if (floor) land(match, f, floor, EMPTY, f.vy + f.kbVy);
    }
  }
  if (transformed) {
    for (const item of match.items) {
      item.floorId = null;
      item.grounded = false;
    }
  }
  return transformed ? [] : prior;
}

// Handle input before the normal fighter state machine consumes the same press.
function stageTransport(match, f, input) {
  if (f.state === S.DEAD || f.state === S.RESPAWN || f.state === S.GRABBED) return false;
  const { warpPipes, barrelCannon: spec } = match.stage;
  if (warpPipes && f.grounded && !f.warpCooldown && GROUND_MOVEMENT.has(f.state) && (input.moveY <= -0.65 || f.state === S.CROUCH)) {
    const pipe = warpPipes.find((p) => Math.abs(f.x - p.x) <= 40 && Math.abs(f.y - p.y) <= 24);
    const target = pipe && warpPipes.find((p) => p.id === pipe.targetId);
    if (target) {
      releaseGrab(match, f);
      stopMove(f);
      leaveFloor(f);
      f.x = target.x;
      f.y = target.y + 8;
      f.vy = 10;
      f.vx = f.kbVx = f.kbVy = f.hitlag = f.hitstun = 0;
      f.launchAngle = null;
      f.fastFalling = false;
      f.invulnFrames = 20;
      f.warpCooldown = 90;
      transition(f, S.AIRBORNE);
      event(match, 'warpPipe', f, { y: target.y });
      return true;
    }
  }
  const cannon = match.barrelCannon;
  if (!cannon) return false;
  const entering = cannon.occupantPort == null;
  if (entering) {
    if (cannon.cooldown || f.grounded || f.state === S.LEDGE_HANG || Math.hypot(f.x - cannon.x, f.y - cannon.y) > spec.radius) return false;
    cannon.occupantPort = f.port;
    cannon.fireTimer = 24;
    releaseGrab(match, f);
    stopMove(f);
    clearMeteor(f);
    f.inputBuffer = {};
    f.launchAngle = null;
    f.vx = f.vy = f.kbVx = f.kbVy = f.hitlag = f.hitstun = 0;
    f.fastFalling = false;
    transition(f, S.AIRBORNE);
  } else if (cannon.occupantPort !== f.port) return false;
  f.x = cannon.x;
  f.y = cannon.y;
  f.invulnFrames = Math.max(2, f.invulnFrames);
  if ((!entering && --cannon.fireTimer === 0) || input.jumpPressed || input.attackPressed) {
    cannon.occupantPort = null;
    cannon.cooldown = 40;
    cannon.fireTimer = 0;
    f.vy = spec.launchVy;
    f.vx = Math.sin(cannon.angle) * 10;
    f.jumpsUsed = 0;
    f.inputBuffer = {};
    f.barrelRising = true;
    event(match, 'barrelLaunch', f);
  }
  return true;
}

function applyStageHazards(match) {
  const { hotFloorY, riverFlow } = match.stage;
  if (hotFloorY == null && !riverFlow) return;
  for (const f of match.fighters) {
    if (f.state === S.DEAD || f.state === S.RESPAWN) continue;
    if (hotFloorY != null && f.y <= hotFloorY && !intangible(f)) {
      const holder = byPort(match, f.grabbedBy);
      if (holder) releaseGrab(match, holder);
      releaseGrab(match, f);
      stopMove(f);
      leaveFloor(f);
      recordDamage(match, f, null, 12);
      f.percent = Math.min(999, roundDamage(f.percent + 12));
      f.y = hotFloorY + 6;
      f.launchAngle = null;
      f.vx = f.vy = f.hitlag = 0;
      f.fastFalling = false;
      f.kbVy = 22;
      f.kbVx = (f.x > 0 ? -1 : 1) * 5;
      f.hitstun = 26;
      f.invulnFrames = 18;
      transition(f, S.HITSTUN, true);
      const kb = Math.hypot(f.kbVx, f.kbVy) / (MELEE.KB_TO_VEL * WORLD_SCALE);
      impactEvent(match, null, f, { damage: 12, kb, y: hotFloorY, port: f.port,
        moveKey: 'hotFloor', element: 'fire', angle: Math.atan2(f.kbVy, f.kbVx) / RAD });
      event(match, 'explosion', f, { y: hotFloorY, radius: 55 });
    }
    if (riverFlow && f.y < riverFlow.y && !f.grounded && f.state !== S.LEDGE_HANG &&
        !match.surfaces.some((s) => withinX(f.x, s) && f.y >= s.y - s.h && f.y <= getSurfaceY(s, f.x))) {
      const limit = Math.max(f.def.stats.airSpeed, Math.abs(riverFlow.vx) * 3);
      f.vx = clamp(f.vx + riverFlow.vx * 0.14, -limit, limit);
    }
  }
}

function specialMotion(f) {
  const m = f.moveData;
  if (f.state !== S.ATTACK) return false;
  if (m?.bossTell) {
    if (m.bossTell === 'sweep' && activeMove(f)) {
      f.vx = f.facing * (f.bossPhase === 2 ? 23 : 19);
      if ((f.x + f.vx - f.bossSweepEnd) * f.facing > 0) f.vx = f.bossSweepEnd - f.x;
      f.vy = 0;
      return true;
    }
    if (m.bossTell === 'drill' && activeMove(f)) {
      f.vx = f.grounded ? 0 : f.facing * 11;
      f.vy = f.grounded ? 0 : -16;
      return true;
    }
    if (f.moveFrame < m.startup) {
      if (m.bossTell === 'slam' || m.bossTell === 'drill') {
        leaveFloor(f);
        f.vx = m.bossTell === 'slam' ? clamp((f.bossTargetX - f.x) / 5, -10, 10) : 0;
        f.vy = clamp((f.bossTargetY + 115 - f.y) / 8, -4, 6);
        return true;
      }
      f.vx = approach(f.vx, 0, 1.5);
      f.vy = 0;
      return true;
    }
    if (m.bossTell === 'gun' && activeMove(f)) {
      f.vx = f.vy = 0;
      return true;
    }
    if (m.bossTell === 'slap' && !activeMove(f)) f.vx = approach(f.vx, 0, 1.5);
  }
  if (!m?.technique) return false;
  if (f.specialPhase === 'charge') {
    const illusion = m.technique === 'illusion';
    const dragX = illusion ? 0.35 : 0.80, dragY = illusion ? 0.25 : 0.68;
    f.vx *= dragX;
    f.vy *= dragY;
    f.kbVx *= dragX;
    f.kbVy *= dragY;
    if (!f.grounded) f.vy -= m.technique === 'chargeMissile' ? 0.11 : 0.025;
    return true;
  }
  return !!f.specialPhase && (m.technique !== 'teleport360' || f.vanished);
}

function integrate(match, f, input, priorTerrain) {
  if ([S.DEAD, S.GRABBED, S.RESPAWN, S.LEDGE_HANG].includes(f.state)) return;
  const s = f.def.stats;
  const traction = s.traction * (match.stage.iceTraction ?? 1);
  const height = s.height * f.scale;
  const floor = f.grounded && [...match.surfaces, ...match.platforms].find((p) => p.id === f.onPlatformId);
  if (floor) f.y = getSurfaceY(floor, f.x);
  else if (f.grounded) leaveFloor(f);
  const oldX = f.x;
  const oldY = f.y;
  const kind = f.moveData?.kind;
  const zip = f.zipOrigin;
  const lastZipFrame = zip && f.moveFrame - f.moveData.startup === zip.stage * 6 - 1;
  const newDodge = f.state === S.AIRDODGE && f.stateFrame === 0;
  if (specialMotion(f)) {
    // Integrate the locked velocity through the normal wall, floor and ledge sweeps.
  } else if (f.state === S.AIRDODGE) {
    if (!newDodge) {
      f.vx *= 0.90;
      f.vy *= 0.90;
    }
  } else if (f.grounded) {
    if (!GROUND_MOVEMENT.has(f.state) && !DODGES.has(f.state) && !f.moveData?.hammer) {
      f.vx = approach(f.vx, 0, traction * (kind === 'dashBurst' && activeMove(f) ? 0.45 : 1));
    }
  } else {
    const bursting = kind === 'dashBurst' && activeMove(f);
    const recovering = kind === 'recovery' && activeMove(f);
    const stone = kind === 'stone' && activeMove(f);
    const ordinaryFall = !stone && !(recovering && f.moveFrame === f.moveData.startup);
    const maxFall = f.fastFalling ? s.fastFallSpeed : s.fallSpeed;
    const canHover = f.def.canFloat && input.jump && (f.state === S.AIRBORNE ||
      f.state === S.ATTACK && AIR_ATTACKS.has(f.moveKey));
    if (canHover && !f.floatUsed && (input.moveY < -0.5 || f.jumpsUsed >= 2)) {
      f.floatUsed = f.floating = true;
      f.floatFrames = 150;
      // A ground-level float needs clearance from the launch surface.
      if ([...match.surfaces, ...match.platforms].some((p) => withinX(f.x, p) && getSurfaceY(p, f.x) === oldY)) f.y += 1;
    }
    f.floating = !!(f.floating && canHover && f.floatFrames > 0);
    if (f.floating) {
      f.floatFrames--;
      f.vy = 0;
      f.fastFalling = false;
    } else if (ordinaryFall) {
      const windingPunch = kind === 'powerPunch' && f.specialPhase === 'charge';
      f.vy = Math.max(windingPunch ? -maxFall * 0.45 : -maxFall, f.vy - s.gravity * (windingPunch ? 0.38 : 1));
    }
    if (f.fastFalling) f.vy = Math.min(f.vy, -maxFall);
    if (f.parasolOpen && f.vy <= 0) {
      if (input.moveY < -0.55) f.parasolOpen = false;
      else f.vy = Math.max(-2.1, f.vy);
    }
    if (stone) {
      f.vy = -27;
    } else if (!bursting && !recovering && !HURT.has(f.state) && f.state !== S.SHIELD_BREAK) {
      const x = input.moveX || 0;
      const accel = s.airAccel * MOVE_PACE * 0.82 * (Math.abs(x) > 0.12 ? 1 : 0.22);
      f.vx = approach(f.vx, x * s.airSpeed * MOVE_PACE, accel * (f.state === S.FREEFALL ? 0.65 : 1));
      f.vx += match.stage.wind?.(match.frame) ?? 0;
    }
  }
  const deltaY = f.vy + f.kbVy;
  const deltaX = f.vx + f.kbVx;
  if (deltaY <= 0 || f.state !== S.AIRBORNE) f.barrelRising = false;
  f.x += deltaX;
  f.y += deltaY;

  if (floor) {
    // A grounded fighter can hit a vertical face even while supported by another deck.
    for (const deck of match.surfaces) {
      if (deck === floor || !deltaX) continue;
      const edge = deltaX > 0 ? deck.x : deck.x + deck.w;
      if ((oldX - edge) * deltaX > 0 || (f.x - edge) * deltaX <= 0) continue;
      const feet = getSurfaceY(floor, edge);
      if (feet + 1 >= getSurfaceY(deck, edge) || feet + height <= deck.y - deck.h) continue;
      f.x = edge;
      f.vx = 0;
      f.kbVx *= -0.4;
    }
    f.y = getSurfaceY(floor, f.x);
    if (!withinX(f.x, floor)) {
      const edge = deltaX > 0 ? floor.x + floor.w : floor.x;
      const next = match.surfaces.find((s) => withinX(f.x, s) && withinX(edge, s, 1) &&
        Math.abs(getSurfaceY(s, edge) - getSurfaceY(floor, edge)) <= 2);
      if (next) {
        f.onPlatformId = next.id;
        f.y = getSurfaceY(next, f.x);
      } else if ((DODGES.has(f.state) || f.state === S.TECH || f.state === S.SHIELD_BREAK) && !f.kbVx) {
        f.x = clamp(f.x, floor.x + 1, floor.x + floor.w - 1);
        f.y = getSurfaceY(floor, f.x);
        f.vx = 0;
      } else {
        leaveFloor(f);
        f.jumpsUsed = 1;
        if (canEdgeCancel(f)) edgeCancel(match, f);
        else if (GROUND_MOVEMENT.has(f.state) || isShield(f) || f.state === S.JUMPSQUAT) transition(f, S.AIRBORNE);
      }
    }
  }
  if (!f.grounded) {
    for (const deck of match.surfaces) {
      if (f.barrelRising) continue;
      if (f.y >= getSurfaceY(deck, f.x) || f.y + height <= deck.y - deck.h) continue;
      const previous = priorTerrain.find((p) => p.id === deck.id) ?? deck;
      let wall = false;
      for (const side of [-1, 1]) {
        const edge = side < 0 ? deck.x : deck.x + deck.w;
        const oldEdge = side < 0 ? previous.x : previous.x + previous.w;
        const before = (oldX - oldEdge) * side;
        const after = (f.x - edge) * side;
        const crossing = before >= 0 && after < 0 && oldY < getSurfaceY(deck, edge);
        if (crossing) f.x = edge;
        if ((crossing || before >= 0 && Math.min(before, after) <= 9) &&
            wallAction(match, f, input, side, crossing || after <= 0)) {
          wall = true;
          break;
        }
        if (crossing) {
          if (f.kbVx * side < 0) f.kbVx *= -0.4;
          f.vx = 0;
          wall = true;
          break;
        }
      }
      if (wall) continue;
      if (f.y + height > deck.y - deck.h && oldY + height <= deck.y - deck.h &&
          withinX(f.x, deck) && deltaY > 0) {
        f.y = deck.y - deck.h - height;
        f.vy = 0;
        f.kbVy = Math.min(0, -f.kbVy * 0.4);
      }
    }
    let touchdown;
    let first = Infinity;
    let crossedEdge = false;
    if (!f.floating) {
      for (const surface of [...match.surfaces, ...match.platforms]) {
        if (surface === floor || f.dropTimer > 0 && surface.id === f.dropId) continue;
        if (f.state === S.AIRDODGE && input.moveY < -0.8 && surface.h == null && Math.abs(deltaX) < 5) continue;
        const previous = priorTerrain.find((p) => p.id === surface.id) ?? surface;
        const crossing = topCrossing(previous, surface, oldX, oldY, f.x, f.y);
        if (crossing == null) continue;
        if (!withinX(f.x, surface)) {
          crossedEdge = true;
          continue;
        }
        if (crossing < first) {
          first = crossing;
          touchdown = surface;
        }
      }
    }
    if (touchdown) land(match, f, touchdown, input, deltaY);
    else {
      if (crossedEdge && canEdgeCancel(f)) edgeCancel(match, f);
      tryLedge(match, f, input, oldX, oldY);
    }
  }
  if (zip) {
    zip.toX = f.x;
    zip.toY = f.y;
    if (lastZipFrame) f.zipOrigin = null;
  }
  f.prevWallInput = input.moveX || 0;
  const kb = Math.hypot(f.kbVx, f.kbVy);
  if (kb) {
    const decay = f.grounded ? Math.max(s.traction, 0.55) * (match.stage.iceTraction ?? 1) : MELEE.KB_DECAY * WORLD_SCALE;
    const scale = Math.max(0, 1 - decay / kb);
    f.kbVx *= scale;
    f.kbVy *= scale;
  }
  f.animPhase += 0.08 + Math.abs(f.vx) * 0.032;
  f.squashX = approach(f.squashX, 1, 0.045);
  f.squashY = approach(f.squashY, 1, 0.045);
}

function intangible(f) {
  if (f.vanished || f.invulnFrames > 0 || f.state === S.RESPAWN || f.state === S.DEAD) return true;
  if (f.state === S.AIRDODGE) return f.stateFrame >= MELEE.AIRDODGE_INTANGIBLE_START && f.stateFrame <= MELEE.AIRDODGE_INTANGIBLE_END;
  if (DODGES.has(f.state)) return f.stateFrame >= 3 && f.stateFrame <= (f.state === S.SPOTDODGE ? 14 : 18);
  return false;
}

function circleHits(b, rect) {
  const dx = b.x - clamp(b.x, rect.x, rect.x + rect.w);
  const dy = b.y - clamp(b.y, rect.y, rect.y + rect.h);
  return dx * dx + dy * dy <= b.r * b.r;
}

function shieldHits(b, f) {
  if (!isShield(f)) return false;
  const s = f.def.stats;
  const r = s.shieldRadius * f.scale * f.shieldScale * (0.35 + 0.65 * f.shieldHp / MELEE.SHIELD_MAX);
  return Math.hypot(b.x - (f.x + f.facing * 5), b.y - (f.y + s.height * f.scale * 0.48)) <= b.r + r;
}

const powerShield = (f) => f.state === S.SHIELD && !f.lightShielding && f.shieldAge < MELEE.POWERSHIELD_WINDOW;

function breakShield(match, f) {
  releaseGrab(match, f);
  stopMove(f);
  leaveFloor(f);
  f.shieldHp = 0;
  f.shieldBroken = true;
  f.dizzyFrames = 0;
  f.vx = f.kbVx = f.kbVy = 0;
  f.vy = 16.8;
  f.fastFalling = false;
  transition(f, S.SHIELD_BREAK);
  event(match, 'shieldBreak', f);
}

// Hitlag displacement tests the stage crossing even though ordinary integration is frozen.
function shiftHitlag(match, f, x, y, distance) {
  const length = Math.hypot(x, y);
  if (!length) return;
  const oldX = f.x;
  const oldY = f.y;
  f.x += distance * x / length;
  f.y += distance * y / length;
  const floor = [...match.surfaces, ...match.platforms]
    .filter((p) => withinX(f.x, p) && getSurfaceY(p, oldX) <= oldY + 0.01 && getSurfaceY(p, f.x) >= f.y)
    .sort((a, b) => getSurfaceY(b, f.x) - getSurfaceY(a, f.x))[0];
  if (floor) f.y = getSurfaceY(floor, f.x);
  for (const deck of match.surfaces) {
    const height = f.def.stats.height * f.scale;
    if (f.y >= getSurfaceY(deck, f.x) || f.y + height <= deck.y - deck.h) continue;
    if (oldX <= deck.x && f.x > deck.x) f.x = deck.x;
    else if (oldX >= deck.x + deck.w && f.x < deck.x + deck.w) f.x = deck.x + deck.w;
    else if (withinX(f.x, deck) && oldY + height <= deck.y - deck.h) f.y = deck.y - deck.h - height;
  }
  if (f.grounded && (!floor || floor.id !== f.onPlatformId)) leaveFloor(f);
}

function hitlagDI(match, f, input) {
  const x = input.moveX || 0, y = input.moveY || 0;
  const cx = input.cStickX || 0, cy = input.cStickY || 0;
  if (f.sdiCount < 3 && Math.hypot(x, y) > 0.18 &&
      (Math.abs(x - (f.prevMoveX || 0)) > 0.6 || Math.abs(y - (f.prevMoveY || 0)) > 0.6)) {
    shiftHitlag(match, f, x, y, 14);
    f.sdiCount++;
    event(match, 'tech', f, { tech: 'SDI' });
  }
  if (f.hitlag !== 1) return;
  const useC = Math.hypot(cx, cy) >= 0.18;
  if (!useC && Math.hypot(x, y) < 0.18) return;
  shiftHitlag(match, f, useC ? cx : x, useC ? cy : y, 10);
  if ((y <= -0.55 || cy <= -0.55) && f.lastKnockback < 85) {
    const floor = [...match.surfaces, ...match.platforms]
      .filter((p) => withinX(f.x, p) && f.y >= getSurfaceY(p, f.x) && f.y - getSurfaceY(p, f.x) <= 10)
      .sort((a, b) => getSurfaceY(b, f.x) - getSurfaceY(a, f.x))[0];
    if (floor) {
      clearMeteor(f);
      f.y = getSurfaceY(floor, f.x);
      f.grounded = true;
      f.onPlatformId = floor.id;
      f.vy = f.kbVy = f.jumpsUsed = 0;
      f.fastFalling = f.didShortHop = f.didFastFall = f.didAerial = false;
      f.launchAngle = null;
      f.hitstun = Math.ceil(f.hitstun * 0.6);
      transition(f, S.HITSTUN);
      event(match, 'tech', f, { tech: 'ASDI DOWN' });
      return;
    }
  }
  event(match, 'tech', f, { tech: 'ASDI' });
}

function applyDI(f, input) {
  const a = f.launchAngle;
  const cross = Math.cos(a) * (input.moveY || 0) - Math.sin(a) * (input.moveX || 0);
  const horizontalGroundLaunch = f.grounded && Math.abs(f.kbVy) < 0.001;
  const di = horizontalGroundLaunch ? 0 : Math.sign(cross) * Math.min(cross * cross, 1) * MELEE.DI_MAX_DEGREES * RAD;
  f.kbVx = f.launchSpeed * Math.cos(a + di);
  f.kbVy = f.launchSpeed * Math.sin(a + di);
  f.launchAngle = null;
}

function comboLocked(v) {
  return HURT.has(v.state) && v.hitstun > 0 || v.state === S.GRABBED;
}

function comboName(id, last, key, sweet) {
  if (id === 'garth' && last === M.FAIR && key === M.DAIR) return 'KEN COMBO!';
  if (id === 'faux' && last === M.DOWN_B && [M.DOWN_B, M.USMASH, 'grab'].includes(key)) return 'WAVESHINE!';
  if (id === 'falcont' && last === M.DOWN_B && key === M.DAIR) return 'PILLAR COMBO!';
  if (id === 'captain-pigeon' && [M.UAIR, M.DTHROW].includes(last) && key === M.FAIR && sweet) return 'BREAD COMBO!';
  if (['faux', 'captain-pigeon'].includes(id) && last === M.UTHROW && key === M.UAIR) return 'UP-THROW UP-AIR!';
  if (id === 'gigglefluff' && [M.UTHROW, M.UAIR, M.UTILT].includes(last) && key === M.DOWN_B) return 'NAPTIME SETUP!';
}

function recordCombo(match, a, v, key, sweet = false) {
  const previous = comboLocked(v) && v.receivedCombo?.port === a.port ? v.receivedCombo : null;
  const count = (previous?.count ?? 0) + 1;
  const moves = [...(previous?.moves ?? []).slice(-7), key];
  v.receivedCombo = { port: a.port, count, moves };
  a.trueComboVictim = v.port;
  a.comboCount = a.trueComboCount = count;
  a.comboVictim = v.port;
  a.maxCombo = Math.max(a.maxCombo, count);
  a.comboMoves = moves;
  const named = comboName(a.fighterId, previous?.moves.at(-1), key, sweet);
  const announce = (text) => event(match, 'comboCallout', a, { text, x: v.x, y: v.y, count });
  if (named) announce(named);
  if (count >= 4) announce('TRUE COMBO x' + count + '!');
}

function hitMaterial(id, key, m, sweetspot) {
  const electric = m.element === 'electric' || m.element === 'lightning' ||
    m.kind !== 'powerPunch' && !!ELECTRIC_MOVES[id]?.has(key) || (id === 'captain-pigeon' && key === M.FAIR && sweetspot);
  const sword = id === 'garth' || id === 'troy';
  const tool = id === 'zink' || id === 'tiny-zink';
  const slash = !!m.slash || m.element === 'slash' ||
    sword && (WEAPON_NORMALS.has(key) || AIR_ATTACKS.has(key) || SPECIAL_MOVES.includes(key)) ||
    tool && (WEAPON_NORMALS.has(key) || key === M.UP_B);
  return { electric, slash };
}

function impactEvent(match, a, v, hit) {
  const { damage, kb = 0, sweetspot = false, meteor = false, electric = false, slash = false, angle = 0 } = hit;
  const heavy = kb >= 95 || damage >= 14 || sweetspot || meteor;
  match.screenShake = Math.max(match.screenShake, Math.min(18, 2.5 + kb * 0.085 + (sweetspot ? 6 : 0) + (electric ? 3 : 0)));
  if (sweetspot || electric || kb >= 120) match.screenFlash = Math.max(match.screenFlash, heavy ? 4 : 2);
  match.events.push({
    type: 'hit', x: v.x, y: v.y + v.def.stats.height * v.scale * 0.52, ...hit,
    kb, sweetspot, meteor, electric, slash, angle, heavy, hitlag: v.hitlag,
    attackerPort: a?.port ?? null, victimPort: v.port,
  });
}

function markHit(match, a, v, hit) {
  if (a && a !== v) {
    v.lastHitBy = a.port;
    v.lastHitTimer = 360;
    a.comboTimer = Math.max(34, v.hitstun + 12);
  }
  v.lastSweetspot = !!(a && a !== v && hit.sweetspot);
  impactEvent(match, a, v, hit);
}

function doubleJumpArmorActive(f) {
  return f.def.doubleJumpArmor > 0 && f.doubleJumping && f.state === S.AIRBORNE && f.vy > 0;
}

function recordDamage(match, victim, attacker, damage) {
  clearMeteor(victim);
  if (damage <= 0) return;
  if (victim.bossHp != null) victim.bossHp = Math.max(0, roundDamage(victim.bossHp - damage));
  victim.lastSweetspot = false;
  match.lastDamageSequence[victim.port] = ++match.damageSequence;
  const source = attacker && attacker !== victim ? attacker.port : -1;
  if (victim.stockDamageOwner === null) victim.stockDamageOwner = source;
  else if (victim.stockDamageOwner !== source) victim.stockDamageOwner = -1;
}

function strike(match, a, v, m, info) {
  const { mult = 1, key, box, projectile, unblockable, counterResponse, sweetspot = !!m.sweetspot } = info;
  if (m.airMeteor && !v.grounded) m = { ...m, angle: 270, meteor: true };
  const meteor = !!m.meteor && !v.grounded;
  const damage = roundDamage((info.damage ?? m.damage) * mult * (a?.permanentGiant ? 1.48 : 1));
  const direction = info.facing ?? a?.facing ?? 1;
  if (!unblockable && box && shieldHits(box, v)) {
    if (powerShield(v)) {
      event(match, 'powershield', v);
      return false;
    }
    v.shieldHp = Math.max(0, v.shieldHp - (damage * (m.shieldDamageMult ?? 1) + 0.6));
    v.hitlag = Math.max(v.hitlag, Math.floor(damage * 0.2 + 2));
    if (a && !projectile) a.hitlag = Math.max(a.hitlag, v.hitlag);
    v.shieldStun = Math.ceil(damage * MELEE.SHIELD_STUN_MULT + MELEE.SHIELD_STUN_BASE);
    v.vx += (Math.sign(v.x - (projectile ? box.x : a?.x ?? box.x)) || direction) * Math.min(9, 1 + damage * 0.32) * (v.lightShielding ? 1.6 : 1);
    if (!projectile && a?.grounded) a.vx -= direction * Math.min(4, damage * 0.2);
    transition(v, S.SHIELD_STUN, true);
    event(match, 'shieldHit', v, { damage });
    if (v.shieldHp <= 0) breakShield(match, v);
    return false;
  }
  if (a && a !== v && !unblockable && !counterResponse && v.moveData?.kind === 'counter' && activeMove(v) && !v.counterTriggered) {
    v.counterTriggered = true;
    const counter = v.moveData;
    faceInput(v, a.x - v.x);
    event(match, 'counter', v);
    if (!projectile || Math.abs(a.x - v.x) < v.def.stats.width + 65) {
      if (!intangible(a)) {
        const counterDamage = Math.max(counter.damage, damage * 1.25);
        strike(match, v, a, counter, { key: v.moveKey, mult: v.moveStale, damage: counterDamage, counterResponse: true });
        if (!v.moveRecorded) stale(v, v.moveKey);
        v.moveRecorded = true;
      }
    }
    v.moveFrame = counter.startup + counter.active;
    return false;
  }
  if (a?.def === SAGGING_BAG || m.sleep && (v.sleepTimer > 0 || v.sleepImmuneFrames > 0)) return false;
  if (!m.noFlinch && v.grabbedBy != null) {
    const holder = byPort(match, v.grabbedBy);
    if (holder) holder.grabbing = null;
    v.grabbedBy = null;
  }
  if (a && a !== v) recordCombo(match, a, v, key, sweetspot);
  else v.receivedCombo = null;
  const priorPercent = v.percent;
  recordDamage(match, v, a, damage);
  v.percent = Math.min(999, roundDamage(priorPercent + damage));
  if (a && a !== v) a.damageDealt = roundDamage(a.damageDealt + damage);
  const charge = info.charge ?? 1;
  const baseDamage = damage / charge;
  let kb = m.noFlinch ? 0 : computeMeleeKnockback(Math.min(999, priorPercent + baseDamage), baseDamage,
    v.def.stats.weight * (v.permanentGiant ? 1.48 : 1), m.bkb, m.kbg, m.setKb, charge);
  // A fresh stock can contest center stage after an uncharged forward smash, tapering smoothly to full power by 32%.
  if (key === M.FSMASH && priorPercent < 32) {
    const openingForce = (65 + priorPercent * 0.35) * charge;
    const t = Math.max(0, Math.min(1, (32 - priorPercent) / 32));
    const taper = t * t * (3 - 2 * t);
    kb -= Math.max(0, kb - openingForce) * 0.94 * taper;
  }
  if (m.hitstunOnly) kb = Math.min(kb, 17);
  const crouchFactor = v.grounded && v.state === S.CROUCH ? MELEE.CROUCH_CANCEL_MULT : 1;
  kb *= crouchFactor;
  const armored = doubleJumpArmorActive(v) && kb < v.def.doubleJumpArmor && !unblockable;
  const jabReset = v.state === S.KNOCKDOWN && damage <= 7 && kb < MELEE.TUMBLE_KB_THRESHOLD;
  const material = hitMaterial(info.sourceFighterId ?? a?.fighterId, key, m, sweetspot);
  let launchDegrees = 0;
  if (!m.noFlinch && !armored) {
    v.lastKnockback = kb;
    v.sdiCount = 0;
    v.didShortHop = v.didFastFall = v.didAerial = false;
    const onGround = v.grounded;
    releaseGrab(match, v);
    stopMove(v);
    if (v.shieldBroken) v.shieldHp = MELEE.SHIELD_MAX / 2;
    v.shieldBroken = false;
    v.ledgeId = null;
    const attackAngle = m.angle === 361
      ? onGround ? clamp((kb - 32) / 0.1, 0, 1) * 44 : 45
      : (m.angle ?? 45);
    let angle = attackAngle * RAD;
    if (direction < 0) angle = Math.PI - angle;
    const launch = jabReset || m.hitstunOnly || m.sleep ? 0 : kb * MELEE.KB_TO_VEL * WORLD_SCALE;
    v.launchAngle = angle;
    v.launchSpeed = launch;
    v.vx = v.vy = 0;
    v.kbVx = Math.cos(angle) * launch;
    v.kbVy = Math.sin(angle) * launch;
    if (onGround && v.kbVy <= 0.01) {
      if (v.kbVy < -1) {
        v.kbVy *= -0.55;
        v.launchAngle = Math.atan2(v.kbVy, v.kbVx);
        leaveFloor(v);
      } else v.kbVy = 0;
    } else if (v.kbVy > 0.01) {
      leaveFloor(v);
      v.jumpsUsed = Math.max(v.jumpsUsed, 1);
    }
    if (launch > 0) launchDegrees = (Math.atan2(v.kbVy, v.kbVx) / RAD + 360) % 360;
    if (m.link && a && !onGround) {
      // Follow a rising screw attack or falling drill until its next pulse.
      v.vx = a.vx;
      v.vy = a.vy;
    } else if (m.link && a && a.vy > 0) {
      leaveFloor(v);
      v.vy = a.vy;
    }
    v.fastFalling = false;
    if (!onGround && meteor && m.angle >= 230 && m.angle <= 310 && (v.vy + v.kbVy < -1.5 || v.kbVy < -1.5)) {
      v.meteorHitFrame = match.frame;
      if (a && a !== v) {
        v.meteorByPort = a.port;
        v.meteorTimer = 90;
      }
    }
    v.hitstun = m.sleep ? 0 : Math.max(1, Math.floor(m.hitstunOnly ? 7 * crouchFactor : kb * MELEE.HITSTUN_MULT));
    if (jabReset) {
      v.hitstun = 16;
      event(match, 'jabReset', v);
    }
    if (m.freezeFrames) v.hitstun = Math.max(v.hitstun, 18);
    const accent = sweetspot ? 2 : SMASH_MOVES.has(key) && (kb >= 95 || damage >= 14) ? 1 : 0;
    const hitlag = m.link ? 2 : Math.floor(damage * MELEE.HITLAG_MULT + MELEE.HITLAG_BASE) + accent;
    if (a && !projectile) a.hitlag = Math.max(a.hitlag, hitlag);
    const electricFreeze = !m.link && material.electric;
    v.hitlag = Math.max(v.hitlag, m.freezeFrames || 0, electricFreeze ? Math.min(20, Math.floor(hitlag * 1.5)) : hitlag);
    transition(v, kb >= MELEE.TUMBLE_KB_THRESHOLD ? S.TUMBLE : S.HITSTUN, true);
    if (m.sleep) v.sleepTimer = v.def === MASTER_MITT ? 28 : 80;
    if (m.kind === 'cape') {
      v.facing *= -1;
    } else {
      v.facing = Math.sign((a?.x ?? box?.x ?? v.x) - v.x) || -direction;
    }
    v.squashX = 1.16;
    v.squashY = 0.85;
  }
  if (match.mode === MODE.HOMERUN && v.def === SAGGING_BAG && kb > 0) {
    v.derbyKnockback = kb;
    v.derbyHitFrame = match.frame;
  }
  markHit(match, a, v, { damage, kb, sweetspot, meteor, moveKey: key, element: m.element,
    angle: launchDegrees, ...material, ...(box && { x: box.x, y: box.y }) });
  if (sweetspot && kb >= 80) event(match, 'crowdCheer', v, { intensity: Math.min(1, kb / 200) });
  if (armored) event(match, 'armor', v);
  if (m.homerun) match.events.push({ type: 'homerunPing', x: box?.x ?? v.x, y: box?.y ?? v.y });
  return true;
}

function moveHitboxes(f) {
  if (f.state === S.GRAB && f.stateFrame >= 6 && f.stateFrame <= 9) {
    const hand = f.def.stats.grabRange * 0.68;
    return [hand, hand / 3].map((offset) => ({
      x: f.x + f.facing * offset * f.scale, y: f.y + 29 * f.scale,
      r: 20 * f.scale, damage: 0, sweetspot: false, grab: true,
    }));
  }
  const m = f.moveData;
  if (f.state !== S.ATTACK || !m || f.vanished) return [];
  const burn = m.burnInterval && f.moveFrame > 0 && f.moveFrame < m.startup && f.moveFrame % m.burnInterval === 0;
  if (!burn && !activeMove(f)) return [];
  if (['projectile', 'chargeShot', 'counter', 'itemShot', 'itemThrow'].includes(m.kind)) return [];
  const frame = f.moveFrame - m.startup;
  const pulse = m.multiHit;
  const final = pulse && frame >= (pulse.hits - 1) * pulse.interval;
  let contact = m;
  if (burn) {
    contact = { ...m, damage: 1.5, bkb: 6, kbg: 4, angle: 90, element: 'fire', radius: 39, link: true, hitstunOnly: true };
  } else if (m.technique === 'chargeLaunch') {
    const sweetspot = frame < 3;
    contact = { ...m, sweetspot, element: m.style, damage: sweetspot ? m.damage * 1.25 : m.damage };
  } else if (pulse) {
    contact = final
      ? { ...m, damage: pulse.finalDamage ?? m.damage, angle: pulse.finalAngle, bkb: pulse.finalBkb, kbg: pulse.finalKbg }
      : { ...m, damage: pulse.linkDamage ?? Math.max(1, m.damage / pulse.hits), angle: 90, bkb: 8, kbg: 5, meteor: false,
        sweetspot: false, hitstunOnly: true, link: true };
  }
  const charge = 1 + (MELEE.SMASH_CHARGE_MAX_MULT - 1) * f.smashChargeFrames / MELEE.SMASH_CHARGE_MAX_FRAMES;
  const centered = ['spin', 'reflector', 'stone'].includes(m.kind);
  const boxes = [];
  for (const region of m.hitboxes ?? [EMPTY]) {
    if (!burn && (frame < (region.from ?? 0) || frame > (region.through ?? m.active - 1))) continue;
    let data = region === EMPTY ? contact : { ...contact, ...region };
    if (pulse && region !== EMPTY) {
      // Regions scale the current pulse, including the finisher, independently.
      data.damage = contact.damage * ((region.damage ?? m.damage) / m.damage);
      if (!final) {
        data.hitstunOnly = true;
        data.bkb = contact.bkb;
        data.kbg = contact.kbg;
        data.meteor = false;
        data.angle = region.sweetspot ? 90 : 84;
      }
    }
    if (m.kind === 'chargePunch') {
      const power = f.chargeFrames / 60;
      data = { ...data, damage: data.damage * (0.40 + 0.85 * power), bkb: data.bkb * (0.55 + 0.55 * power) };
    }
    const offset = (region.offsetX ?? (centered ? 0 : m.offsetX ?? 32)) * f.scale;
    const height = region.offsetY ?? (centered ? f.def.stats.height * 0.49 : m.offsetY ?? 36);
    const box = { x: f.x + f.facing * offset, y: f.y + height * f.scale,
      r: (data.radius ?? 29) * f.scale, priority: region.priority ?? 0,
      charge, damage: data.damage * charge, sweetspot: !!data.sweetspot, data, grab: m.kind === 'commandGrab' };
    boxes.push(box);
    if (m.bothSides && offset !== 0) boxes.push({ ...box, x: f.x - f.facing * offset, facing: -f.facing });
  }
  boxes.sort((a, b) => b.priority - a.priority);
  return boxes;
}

function meleeCollisions(match, movable) {
  const queue = [];
  for (const a of match.fighters) {
    if (!movable.has(a)) continue;
    const boxes = a.activeHitboxes;
    const hits = a.hitTargets;
    if (!boxes.length) continue;
    if (a.state === S.GRAB && a.stateFrame === 6) hits.clear();
    for (const box of boxes) {
      if (box.grab) continue;
      hitTargets(match, box, box);
      damageBridge(match, box, box, box.damage * a.moveStale, hits);
      for (const item of match.items) {
        if (!damageableCrate(item) || hits.has(item.id) || !circleSweep(box, box, itemPoint(item))) continue;
        hits.add(item.id);
        damageCrate(match, item, box.damage * a.moveStale);
      }
    }
    for (const v of match.fighters) {
      if (!rivals(a, v) || hits.has(v.port) || intangible(v)) continue;
      const b = boxes.find((box) => circleHits(box, v.hurtbox) || (!box.grab && shieldHits(box, v)));
      if (b) queue.push({ a, v, b, hits, key: a.moveKey, mult: a.moveStale, facing: b.facing ?? a.facing });
    }
  }
  // An already-active strike can trade even if its owner is hit on this tick.
  for (const { a, v, b, hits, key, mult, facing } of queue) {
    if (a.state === S.GRABBED || intangible(v) || hits.has(v.port)) continue;
    if (b.grab) {
      if (v.grabbedBy != null || v.state === S.LEDGE_HANG || a.grabbing != null) continue;
      if (!key) {
        if (a.state !== S.GRAB || !a.grounded || (!v.grounded && v.y > a.y + 28 * a.scale)) continue;
        hits.add(v.port);
        grabTarget(match, a, v);
        continue;
      }
      if (a.moveKey !== key) continue;
      // Command grabs beat shield and immediately deliver their throw.
    }
    hits.add(v.port);
    const landed = strike(match, a, v, b.data, { key, mult, facing, box: b, charge: b.charge,
      damage: b.damage, sweetspot: b.sweetspot, unblockable: b.grab });
    if (landed && key !== M.ITEM_SWING && !a.moveRecorded) {
      stale(a, key);
      a.moveRecorded = true;
    }
  }
}

function projectileContact(p, a, b) {
  const dx = p.x - a.x;
  const dy = p.y - a.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / p.r));
  for (let i = 0; i <= steps; i++) {
    const box = { x: a.x + dx * i / steps, y: a.y + dy * i / steps, r: p.r };
    if (circleHits(box, b.hurtbox) || shieldHits(box, b)) return box;
  }
  return null;
}

function reflectProjectile(match, p, f, contact, power = false) {
  if (!power && f.moveData.healOnAbsorb) {
    f.percent = Math.max(0, roundDamage(f.percent - p.damage * 1.25));
    return false;
  }
  if (p.reflections >= 4) return false;
  p.reflections++;
  p.ownerPort = p.port = f.port;
  p.facing = -Math.sign(p.vx) || f.facing;
  p.x = contact.x;
  p.y = contact.y;
  if (power) {
    p.vx *= -MELEE.POWERSHIELD_REFLECT_SPEED;
    p.vy *= -MELEE.POWERSHIELD_REFLECT_SPEED;
    p.age = 0;
  } else {
    p.vx = p.facing * Math.max(4, Math.abs(p.vx) * 1.15);
    p.damage *= 1.2;
  }
  p.hitTargets.clear();
  p.recorded = false;
  p.mult = p.moveKey === M.ITEM_SWING || p.moveKey === M.ITEM_THROW ? 1 : staleMultiplier(f, p.moveKey);
  event(match, power ? 'powershield' : 'reflect', f, { style: p.style });
  return true;
}

function projectileSurvivesContact(match, p, old, a) {
  const m = p.moveData;
  let alive = true;
  let reflectedAway = false;
  for (const f of match.fighters) {
    if (!rivals(a, f) || f.state !== S.ATTACK || !activeMove(f)) continue;
    if (f.moveData?.reflects) {
      for (const box of f.activeHitboxes) {
        const contact = circleContact(old, p, box);
        if (contact) return reflectProjectile(match, p, f, contact);
      }
      continue;
    }
    if (!['reflector', 'cape'].includes(f.moveData.kind)) continue;
    const reflector = { hurtbox: { x: f.x - 5, y: f.y + 14, w: 10, h: f.def.stats.height * 0.57 } };
    const contact = projectileContact({ ...p, r: p.r + f.moveData.radius * 0.68 }, old, reflector);
    if (contact) {
      return reflectProjectile(match, p, f, contact);
    }
  }
  const victims = match.fighters
    .filter((v) => rivals(a, v) && !intangible(v) && !p.hitTargets.has(v.port))
    .map((v) => ({ v, contact: projectileContact(p, old, v) }))
    .filter(({ contact }) => contact)
    .sort((a, b) => distance(old, a.contact) - distance(old, b.contact));
  let travel = p;
  const crates = match.items
    .filter((item) => damageableCrate(item) && !p.hitTargets.has(item.id))
    .map((item) => ({ item, contact: circleContact(old, p, itemPoint(item)) }))
    .filter(({ contact }) => contact)
    .sort((a, b) => distance(old, a.contact) - distance(old, b.contact));
  const hitCrate = ({ item, contact }) => {
    p.hitTargets.add(item.id);
    damageCrate(match, item, p.damage * p.mult);
    travel = contact;
  };
  let nextCrate = 0;
  for (const { v, contact } of victims) {
    while (nextCrate < crates.length && distance(old, crates[nextCrate].contact) < distance(old, contact)) {
      hitCrate(crates[nextCrate++]);
      if (!m.projBoomerang) {
        alive = false;
        break;
      }
    }
    if (!alive) break;
    if (powerShield(v) && shieldHits(contact, v)) {
      const reflected = reflectProjectile(match, p, v, contact, true);
      if (!reflected) event(match, 'powershield', v, { style: p.style });
      reflectedAway = reflected;
      travel = contact;
      alive = false;
      break;
    }
    p.hitTargets.add(v.port);
    const value = p.varied < 1 ? { ...m, bkb: m.bkb * p.varied, kbg: m.kbg * p.varied } : m;
    const landed = strike(match, a, v, value, { key: p.moveKey, mult: p.mult, facing: p.facing, box: contact,
      damage: p.damage, projectile: true, sourceFighterId: p.sourceFighterId, sweetspot: !!m.sweetspot && p.varied >= 0.8 });
    if (landed && p.moveKey !== M.ITEM_SWING && p.moveKey !== M.ITEM_THROW && !p.recorded) {
      p.recorded = true;
      stale(a, p.moveKey);
    }
    if (!m.projBoomerang) {
      travel = contact;
      alive = false;
      break;
    }
  }
  if (alive) {
    while (nextCrate < crates.length) {
      hitCrate(crates[nextCrate++]);
      if (!m.projBoomerang) {
        alive = false;
        break;
      }
    }
  }
  if (alive) travel = p;
  damageBridge(match, old, { ...travel, r: p.r }, p.damage * p.mult, p.hitTargets);
  hitTargets(match, old, travel);
  return alive || reflectedAway;
}

const BOUNCY = new Set(['fireball', 'pill', 'bolt', 'bomb']);

function updateProjectiles(match) {
  const keep = [];
  for (const p of match.projectiles) {
    if (--p.life <= 0) continue;
    p.age++;
    const m = p.moveData;
    const a = byPort(match, p.ownerPort);
    if (!a) continue;
    const old = { x: p.x, y: p.y };
    if (p.muzzleRootX != null) {
      const root = { x: p.muzzleRootX, y: p.y };
      p.muzzleRootX = null;
      if (!projectileSurvivesContact(match, p, root, a)) continue;
      if (p.ownerPort !== a.port) {
        keep.push(p);
        continue;
      }
    }
    if (m.projBoomerang && p.age >= 27) {
      p.vx = approach(p.vx, (Math.sign(a.x - p.x) || 1) * Math.abs(m.projSpeed), 1.8);
      p.vy = approach(p.vy, clamp((a.y + 32 - p.y) * 0.095, -9, 9), 1.15);
      if (p.age > 34 && Math.hypot(a.x - p.x, a.y + 32 - p.y) < 28) continue;
    }
    p.facing = Math.sign(p.vx) || p.facing;
    p.vy -= m.projGravity ?? 0;
    p.x += p.vx;
    p.y += p.vy;
    if (p.vy < 0) {
      const ground = [...match.surfaces, ...match.platforms]
        .filter((s) => withinX(p.x, s) && p.y - p.r <= getSurfaceY(s, p.x) && old.y - p.r >= getSurfaceY(s, old.x))
        .sort((a, b) => getSurfaceY(b, p.x) - getSurfaceY(a, p.x))[0];
      if (ground) {
        if (m.projBounce && BOUNCY.has(p.style)) {
          p.y = getSurfaceY(ground, p.x) + p.r;
          p.vy = Math.max(2.1, -p.vy * 0.74);
          p.vx *= p.style === 'bomb' ? 0.78 : 0.96;
        } else if (m.projSlide) {
          p.y = getSurfaceY(ground, p.x) + p.r;
          p.vy = 0;
          p.vx *= 0.985;
        } else {
          const end = { ...p, y: getSurfaceY(ground, p.x) + p.r };
          damageBridge(match, old, end, p.damage * p.mult, p.hitTargets);
          hitTargets(match, old, end);
          continue;
        }
      }
    }
    if (projectileSurvivesContact(match, p, old, a)) keep.push(p);
  }
  match.projectiles = keep;
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function circleContact(from, to, circle) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const x = from.x - circle.x;
  const y = from.y - circle.y;
  const radius = to.r + circle.r;
  const c = x * x + y * y - radius * radius;
  if (c <= 0) return { x: from.x, y: from.y, r: to.r };
  const length = dx * dx + dy * dy;
  const b = x * dx + y * dy;
  const discriminant = b * b - length * c;
  if (!length || b >= 0 || discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / length;
  return t <= 1 ? { x: from.x + dx * t, y: from.y + dy * t, r: to.r } : null;
}
const circleSweep = (from, to, circle) => circleContact(from, to, circle) !== null;

function hitTargets(match, from, to) {
  for (const target of match.targets) {
    if (target.broken || !circleSweep(from, to, target)) continue;
    target.broken = true;
    match.events.push({ type: 'targetBreak', x: target.x, y: target.y, remaining: --match.targetsRemaining });
  }
}

function spawnItem(match, def, x, y, vx = 0, vy = 0) {
  const item = { id: 'item-' + match.nextEntityId++, itemId: def.id, def, x, y, vx, vy,
    grounded: false, holderPort: null, thrownBy: null, active: true, age: 0, ammo: def.ammo ?? null,
    hp: def.hp ?? 0, rot: 0, fuse: def.fuseFrames ?? 0, state: 'ground',
    restFrames: 0, floorId: null, hitUntil: new Map() };
  match.items.push(item);
  return item;
}

export function spawnItemNow(match, itemId, x = null, y = null) {
  if (!Object.hasOwn(ITEM_DEF, itemId)) return null;
  const origin = byPort(match, 0) ?? match.stage.respawnPoint;
  return spawnItem(match, ITEM_DEF[itemId], x ?? origin.x, y ?? origin.y + 100);
}

function randomItem(match, excludeContainers = false) {
  if (!match.itemPool) return pickRandomItemDef(() => drawRng(match), excludeContainers);
  const pool = excludeContainers ? match.itemPool.filter((id) => ITEM_DEF[id].category !== 'container') : match.itemPool;
  return ITEM_DEF[pool[Math.floor(drawRng(match) * pool.length)]];
}

const itemPoint = (item) => ({ x: item.x, y: item.y + item.def.radius * 0.55, r: item.def.radius });
const pickupable = (item) => item.active && item.holderPort == null && item.state === 'ground';
const damageableCrate = (item) => pickupable(item) && item.def.category === 'container';

function heldItem(match, f) {
  return f.heldItemId == null ? null : match.items.find((i) => i.id === f.heldItemId && i.active && i.holderPort === f.port);
}

function removeItem(match, item) {
  const f = byPort(match, item.holderPort);
  if (f?.heldItemId === item.id) f.heldItemId = null;
  item.active = false;
  item.holderPort = null;
}

function placeHeldItem(item, f) {
  item.x = f.x + f.facing * f.def.stats.width * 0.57 * f.scale;
  item.y = f.y + f.def.stats.height * 0.37 * f.scale;
  item.rot = f.facing * (f.moveKey === M.ITEM_SWING ? -0.75 : 0.3);
}

function setFighterScale(f) {
  f.scale = f.permanentGiant ? 1.48 : f.giantTimer > 0 ? 1.45 : f.tinyTimer > 0 ? 0.65 : 1;
}

function pickupItem(match, f, item) {
  const def = item.def;
  event(match, 'itemPickup', f, { x: item.x, y: item.y, itemId: item.itemId });
  if (def.category === 'heal') {
    healFighter(f, def.healAmount);
    removeItem(match, item);
  } else if (def.category === 'buff') {
    if (def.buffType === 'giant') {
      f.giantTimer = def.buffFrames;
      f.tinyTimer = 0;
    } else if (def.buffType === 'tiny') {
      f.tinyTimer = def.buffFrames;
      f.giantTimer = 0;
    } else {
      f.starTimer = def.buffFrames;
      f.starHits.clear();
      f.invulnFrames = Math.max(f.invulnFrames, 1);
    }
    setFighterScale(f);
    removeItem(match, item);
  } else {
    f.heldItemId = item.id;
    item.holderPort = f.port;
    item.thrownBy = null;
    item.state = 'held';
    item.vx = item.vy = 0;
    item.grounded = false;
    item.floorId = null;
    placeHeldItem(item, f);
    if (def.category === 'hammer') {
      f.hammerTimer = def.durationFrames;
      swingItem(match, f, item, EMPTY);
    }
  }
}

function swingItem(match, f, item, input) {
  const def = item.def;
  const hammer = def.category === 'hammer';
  const homerun = def.id === 'plunger_bat';
  const reach = def.swingReach ?? (hammer ? 98 : 110);
  const chargeable = f.grounded && !hammer && (Math.abs(input.cStickX ?? 0) >= C_GROUND ||
    Math.abs(input.moveX ?? 0) >= SMASH);
  startMove(match, f, M.ITEM_SWING, input, {
    startup: homerun ? 15 : hammer ? 4 : 8, active: hammer ? 8 : 5, endlag: hammer ? 7 : 15,
    damage: def.swingDamage, bkb: def.swingBkb, kbg: def.swingKbg, angle: def.swingAngle,
    offsetX: reach * 0.57, offsetY: 37, radius: reach * 0.43,
    kind: 'strike', chargeable, homerun, hammer, sweetspot: homerun, slash: def.id === 'glow_saber',
  });
}

function throwItem(match, f, item, input) {
  let x = input.moveX || 0;
  let y = input.moveY || 0;
  if (Math.hypot(x, y) < 0.35) {
    x = f.facing;
    y = 0.25;
  }
  const amount = Math.hypot(x, y);
  faceInput(f, x);
  placeHeldItem(item, f);
  item.holderPort = null;
  item.thrownBy = f.port;
  item.state = 'thrown';
  item.age = item.restFrames = 0;
  item.hitUntil.clear();
  item.vx = 19 * x / amount;
  item.vy = 17 * y / amount + 2;
  f.heldItemId = null;
  startMove(match, f, M.ITEM_THROW, input, {
    startup: 1, active: 1, endlag: 9, damage: 0, kind: 'itemThrow',
  });
  event(match, 'itemThrow', f, { x: item.x, y: item.y, itemId: item.itemId });
}

function itemAction(match, f, input) {
  const item = heldItem(match, f);
  const x = input.moveX || 0;
  const c = input.queuedCStick ?? f.inputBuffer.cStick;
  const cx = c?.x || 0;
  const attack = input.attackPressed || c;
  if (item?.def.category === 'hammer') {
    if (input.grabPressed || attack) faceInput(f, Math.abs(cx) > 0.28 ? cx : x);
    delete f.inputBuffer.cStick;
    swingItem(match, f, item, EMPTY);
    return true;
  }
  if (!attack && !input.grabPressed) return false;
  if (!item) {
    if (!input.attackPressed && !input.grabPressed) return false;
    const s = f.def.stats;
    const hand = { x: f.x, y: f.y + s.height * f.scale * 0.41 };
    const nearest = match.items.filter(pickupable)
      .map((it) => ({ it, point: itemPoint(it) }))
      .filter(({ point }) => distance(hand, point) <= point.r + 33 * f.scale)
      .sort((a, b) => distance(hand, a.point) - distance(hand, b.point))[0];
    if (!nearest) return false;
    if (input.grabPressed) delete f.inputBuffer.grab;
    if (input.attackPressed) delete f.inputBuffer.attack;
    pickupItem(match, f, nearest.it);
    return true;
  }
  delete f.inputBuffer.cStick;
  const def = item.def;
  if (input.grabPressed || !['batter', 'shooter'].includes(def.category)) throwItem(match, f, item, input);
  else {
    faceInput(f, Math.abs(cx) > 0.28 ? cx : x);
    if (def.category === 'batter') swingItem(match, f, item, { ...input, cStickX: cx });
    else if (item.ammo > 0) {
      startMove(match, f, M.ITEM_SWING, input, {
        startup: 3, active: 1, endlag: def.id === 'hotsauce_flower' ? 7 : 11,
        damage: def.shotDamage, bkb: def.shotBkb, kbg: def.shotKbg, angle: 32, radius: 15,
        kind: 'itemShot', itemId: item.id, projStyle: def.projStyle, projSpeed: def.shotSpeed,
        projLife: def.id === 'hotsauce_flower' ? 16 : 55,
      });
    } else event(match, 'emptyClick', f, { itemId: def.id });
  }
  return true;
}

function damageCrate(match, crate, damage) {
  crate.hp -= damage;
  if (crate.hp > 0) return;
  removeItem(match, crate);
  for (let i = 0; i < crate.def.dropCount; i++) {
    const def = randomItem(match, true);
    if (!def) break;
    if (match.items.filter((item) => item.active).length >= ITEM_CAP) {
      // Preserve held gear, making room for both drops when the stage is full.
      const oldest = match.items.filter((item) => item.active && item.holderPort == null)
        .sort((a, b) => b.age - a.age)[0];
      if (oldest) removeItem(match, oldest);
    }
    const dir = i % 2 ? 1 : -1;
    spawnItem(match, def, crate.x + dir * 18, crate.y + 12, dir * 4, 7);
  }
}

function healFighter(f, amount) {
  f.percent = Math.max(0, roundDamage(f.percent - amount));
}

function damageBridge(match, from, to, damage, hits) {
  const state = match.bridgeState;
  if (!state || state.broken || hits?.has(state.id) || !(damage > 0)) return;
  const deck = match.surfaces.find((s) => s.id === state.id);
  const rect = { x: deck.x, y: deck.y - deck.h, w: deck.w, h: deck.h };
  if (!projectileContact(to, from, { hurtbox: rect })) return;
  hits?.add(state.id);
  state.hp = Math.max(0, state.hp - damage);
  if (state.hp > 0) return;
  state.broken = true;
  state.respawnTimer = deck.respawnFrames || 480;
  match.surfaces = match.surfaces.filter((s) => s !== deck);
  for (const f of match.fighters) {
    if (f.grounded && f.onPlatformId === deck.id) detachFloor(f);
  }
  match.events.push({ type: 'explosion', x: deck.x + deck.w / 2, y: deck.y, radius: 90, port: 0 });
}

function blast(match, a, point, radius, m, key) {
  const box = { ...point, r: radius };
  damageBridge(match, box, box, m.damage);
  match.events.push({ type: 'explosion', x: point.x, y: point.y, radius });
  hitTargets(match, box, box);
  for (const v of match.fighters) {
    if (teammates(a, v) || intangible(v) ||
        !circleHits(box, v.hurtbox) && !shieldHits(box, v)) continue;
    strike(match, a, v, m, { key, facing: Math.sign(v.x - box.x) || a?.facing || 1, box, projectile: true });
  }
}

function explodeItem(match, item) {
  const def = item.def;
  const owner = byPort(match, item.thrownBy ?? item.holderPort);
  const point = itemPoint(item);
  removeItem(match, item);
  blast(match, owner, point, def.blastRadius, { damage: def.blastDamage, bkb: def.blastBkb,
    kbg: def.blastKbg, angle: 53 }, item.itemId);
}

function summonCritter(match, item, facing) {
  const critter = CRITTER_SUMMONS[Math.floor(drawRng(match) * CRITTER_SUMMONS.length)];
  match.summons.push({ id: 'summon-' + match.nextEntityId++, critter, ownerPort: item.thrownBy,
    x: item.x, y: item.y, vx: 0, vy: 0, life: critter.duration, maxLife: critter.duration, facing });
  match.events.push({ type: 'summon', x: item.x, y: item.y, name: critter.name, color: critter.color });
  removeItem(match, item);
}

function itemFloor(match, item) {
  return match.platforms.find((s) => s.id === item.floorId) ?? match.surfaces.find((s) => s.id === item.floorId);
}

function advanceItem(match, item, priorTerrain, gravity) {
  const old = { x: item.x, y: item.y };
  const current = itemFloor(match, item);
  if (item.grounded && current) {
    const prior = priorTerrain.find((s) => s.id === current.id);
    if (prior) item.x += current.x - prior.x;
    item.y = getSurfaceY(current, item.x);
    const nextX = item.x + item.vx;
    if (item.vx && (item.state === 'sliding' || item.state === 'walking')) {
      const dir = Math.sign(item.vx);
      const wall = match.surfaces
        .filter((s) => s !== current && item.y < getSurfaceY(s, nextX) && item.y + item.def.radius > s.y - s.h)
        .map((s) => dir > 0 ? s.x : s.x + s.w)
        .filter((edge) => (edge - item.x) * dir >= 0 && (nextX - edge) * dir >= 0)
        .sort((a, b) => (a - b) * dir)[0];
      if (wall != null) {
        item.x = wall;
        item.vx *= -1;
        return null;
      }
    }
    if (withinX(nextX, current)) {
      item.x = nextX;
      item.y = getSurfaceY(current, item.x);
      return null;
    }
    if (item.state === 'sliding' || item.state === 'walking') {
      item.x = clamp(nextX, current.x, current.x + current.w);
      item.vx *= -1;
      return null;
    }
  }
  item.grounded = false;
  item.floorId = null;
  item.vy = Math.max(-27, item.vy - gravity);
  const desiredX = item.x + item.vx;
  const desiredY = item.y + item.vy;
  let impact = null;
  let first = Infinity;
  const surfaces = [...match.surfaces, ...match.platforms];
  for (const surface of surfaces) {
    const dx = desiredX - old.x;
    const dy = desiredY - old.y;
    const consider = (t, side) => {
      if (t < 0 || t > 1 || t >= first) return;
      impact = { surface, side };
      first = t;
    };
    const previous = priorTerrain.find((s) => s.id === surface.id) ?? surface;
    const t = topCrossing(previous, surface, old.x, old.y, desiredX, desiredY);
    if (t != null) consider(t, 'top');
    if (surface.h == null) continue;
    if (dy > 0 && old.y <= surface.y - surface.h) {
      const t = (surface.y - surface.h - old.y) / dy;
      if (withinX(old.x + dx * t, surface)) consider(t, 'bottom');
    }
    if (dx) {
      const edge = dx > 0 ? surface.x : surface.x + surface.w;
      const t = (edge - old.x) / dx;
      const y = old.y + dy * t;
      if (y < getSurfaceY(surface, edge) && y > surface.y - surface.h) consider(t, 'wall');
    }
  }
  item.x = impact ? old.x + (desiredX - old.x) * first : desiredX;
  item.y = impact ? old.y + (desiredY - old.y) * first : desiredY;
  if (impact?.side === 'top') {
    item.y = getSurfaceY(impact.surface, item.x);
    item.grounded = true;
    item.floorId = impact.surface.id;
    item.vy = 0;
  } else if (impact?.side === 'wall') {
    item.vx *= -0.55;
  } else if (impact?.side === 'bottom') item.vy = -Math.abs(item.vy) * 0.5;
  return impact;
}

function itemHits(match, item, old) {
  const point = itemPoint(item);
  const def = item.def;
  const owner = byPort(match, item.thrownBy);
  const thrown = item.state === 'thrown';
  const explosive = def.category === 'explosive';
  const deployOnImpact = explosive || ['summon', 'container'].includes(def.category);
  if (item.state !== 'walking') hitTargets(match, old, point);
  const colliders = match.fighters
    .filter((v) => v.state !== S.DEAD && v.state !== S.RESPAWN && v !== owner && !teammates(owner, v) &&
      (explosive || !intangible(v)) && (item.hitUntil.get(v.port) ?? -1) <= match.frame)
    .map((v) => ({ v, box: projectileContact(point, old, v) }))
    .filter(({ box }) => box)
    .sort((a, b) => distance(old, a.box) - distance(old, b.box));
  for (const { v, box } of colliders) {
    const facing = Math.sign(item.vx) || Math.sign(v.x - item.x) || 1;
    if (explosive) {
      item.x = box.x;
      item.y = box.y - def.radius * 0.55;
      explodeItem(match, item);
      return true;
    }
    strike(match, owner, v, {
      damage: def.hitDamage ?? def.throwDamage ?? 6,
      bkb: def.hitBkb ?? def.throwBkb ?? 29, kbg: def.hitKbg ?? def.throwKbg ?? 60,
      angle: item.state === 'bumper' ? 30 : 39,
    }, { box, key: M.ITEM_THROW, facing, projectile: true });
    item.hitUntil.set(v.port, match.frame + 34);
    if (!thrown) continue;
    item.x = box.x;
    item.y = box.y - def.radius * 0.55;
    item.grounded = false;
    item.floorId = null;
    if (deployOnImpact) return true;
    if (def.category === 'mine' || def.category === 'bumper') return true;
    if (def.category === 'shell') {
      item.vx *= -0.8;
      item.vy = 4;
    } else {
      item.state = 'ground';
      item.vx *= -0.25;
      item.vy = 3;
    }
    return true;
  }
  return false;
}

function updateItems(match, priorTerrain) {
  const interval = ITEM_INTERVAL[match.itemFrequency];
  if (match.suddenDeath) {
    const elapsed = match.suddenDeathTimer - 360;
    if (elapsed >= 0 && elapsed % 55 === 0 && match.items.length < 8) {
      const deck = match.surfaces[Math.floor(drawRng(match) * match.surfaces.length)];
      const bomb = spawnItem(match, ITEM_DEF.alarm_omb, deck.x + deck.w * drawRng(match), match.stage.blastzones.top - 24, 0, -10);
      bomb.fuse = 75;
      bomb.shortFuse = true;
    }
  } else if (interval && match.playFrames % interval === 0 && match.items.filter((i) => i.active).length < ITEM_CAP) {
    const rng = () => drawRng(match);
    const deck = match.surfaces[Math.floor(rng() * match.surfaces.length)];
    const x = deck.x + deck.w * (0.12 + 0.76 * rng());
    const def = randomItem(match);
    if (def) spawnItem(match, def, x, getSurfaceY(deck, x) + 135);
  }
  for (const item of [...match.items]) {
    if (!item.active) continue;
    const { def } = item;
    const cat = def.category;
    item.age++;
    if (item.holderPort != null) {
      const f = byPort(match, item.holderPort);
      if (f) placeHeldItem(item, f);
      if (cat === 'hammer' && !f?.hammerTimer) removeItem(match, item);
    }
    if (cat === 'explosive') {
      item.fuse--;
      if (item.fuse <= 0) {
        explodeItem(match, item);
        continue;
      }
      if (item.fuse === (item.shortFuse ? 35 : 90) || item.fuse === (item.shortFuse ? 18 : 45) || item.fuse === 8) {
        match.events.push({ type: 'bombTick', id: item.id, itemId: item.itemId, fuse: item.fuse,
          x: item.x, y: item.y, port: item.holderPort });
      }
    }
    if (item.holderPort != null) continue;
    if (item.age >= def.despawnFrames || item.y < match.stage.blastzones.bottom - 60 ||
        item.x < match.stage.blastzones.left - 60 || item.x > match.stage.blastzones.right + 60 ||
        item.y > match.stage.blastzones.top + 60) {
      removeItem(match, item);
      continue;
    }
    if (item.state === 'armed') {
      if (match.fighters.some((v) => v.state !== S.DEAD && v.state !== S.RESPAWN &&
          circleHits({ ...itemPoint(item), r: def.triggerRadius }, v.hurtbox))) explodeItem(match, item);
      continue;
    }
    if (item.state === 'bumper') {
      itemHits(match, item, itemPoint(item));
      continue;
    }
    if (item.state === 'thrown' && cat === 'mine' && item.stuck) {
      if (++item.restFrames >= def.armFrames) item.state = 'armed';
      continue;
    }
    if (item.grounded && item.state === 'ground') {
      if (cat === 'explosive' && item.age >= def.walkAfterFrames) {
        item.state = 'walking';
        item.vx = (drawRng(match) < 0.5 ? -1 : 1) * 3.4;
      } else item.vx = approach(item.vx, 0, 0.65);
    }
    const old = itemPoint(item);
    const facing = Math.sign(item.vx) || 1;
    const impact = advanceItem(match, item, priorTerrain, 0.62);
    item.rot += item.grounded ? item.vx * 0.035 : item.vx * 0.025;
    const thrown = item.state === 'thrown';
    const hit = (thrown || item.state === 'walking' || item.state === 'sliding') && itemHits(match, item, old);
    if (!item.active || !thrown) continue;
    if (cat === 'bumper' && (impact || hit || item.age >= 14)) {
      item.state = 'bumper';
      item.vx = item.vy = 0;
    } else if (cat === 'mine' && (impact || hit)) {
      item.stuck = true;
      item.vx = item.vy = 0;
    } else if (cat === 'shell' && impact?.side === 'top' && !hit) {
      item.state = 'sliding';
      item.vx = def.slideSpeed * facing;
    } else if (impact || hit) {
      if (cat === 'explosive') explodeItem(match, item);
      else if (cat === 'summon') summonCritter(match, item, facing);
      else if (cat === 'container') damageCrate(match, item, item.hp);
      else if (cat !== 'shell' && impact?.side === 'top') item.state = 'ground';
    }
  }
  match.items = match.items.filter((i) => i.active);
}

function updateBuffs(match, f) {
  if (f.state === S.DEAD) return;
  for (const timer of ['giantTimer', 'tinyTimer', 'starTimer', 'hammerTimer']) {
    if (f[timer] > 0) f[timer]--;
  }
  if (f.starTimer > 0) f.invulnFrames = Math.max(f.invulnFrames, 2);
  setFighterScale(f);
  if (!f.hammerTimer) {
    const item = heldItem(match, f);
    if (item?.def.category === 'hammer') {
      removeItem(match, item);
      if (f.moveKey === M.ITEM_SWING) {
        stopMove(f);
        transition(f, f.grounded ? S.IDLE : S.AIRBORNE);
      }
    }
  }
}

function updateStarContacts(match) {
  for (const a of match.fighters) {
    if (!a.starTimer || a.state === S.DEAD) continue;
    const { x, y, w, h } = a.hurtbox;
    const box = { x: x + w / 2, y: y + h / 2, r: Math.max(h, w) * 0.5 };
    hitTargets(match, box, box);
    for (const v of match.fighters) {
      if (!rivals(a, v) || intangible(v) || (a.starHits.get(v.port) ?? -1) > match.frame ||
          !circleHits(box, v.hurtbox) && !shieldHits(box, v)) continue;
      a.starHits.set(v.port, match.frame + 34);
      strike(match, a, v, { damage: 12, bkb: 74, kbg: 87, angle: 47 },
        { key: 'invinci_star', box, facing: Math.sign(v.x - a.x) || a.facing, projectile: true });
    }
  }
}

const CRITTER_ATTACKS = {
  bodySlam: { radius: 78, period: 55, speed: 6.5, height: 34, angle: 65 },
  flameRing: { radius: 103, period: 42, speed: 0, height: 23, angle: 43 },
  whirlwind: { radius: 88, period: 37, speed: 4, height: 56, angle: 79 },
  shockBurst: { radius: 79, period: 34, speed: 8, height: 24, angle: 50 },
};

function updateSummons(match) {
  for (const sm of match.summons) {
    if (--sm.life <= 0) continue;
    const owner = byPort(match, sm.ownerPort);
    if (!owner || owner.state === S.DEAD) {
      sm.life = 0;
      continue;
    }
    const { critter } = sm;
    const age = sm.maxLife - sm.life;
    if (critter.style === 'healOwner') {
      if (age === 1) healFighter(owner, critter.heal);
      continue;
    }
    const nearby = match.fighters.filter((f) => rivals(owner, f) && !intangible(f))
      .sort((a, b) => distance(sm, a) - distance(sm, b))[0];
    if (nearby) sm.facing = Math.sign(nearby.x - sm.x) || sm.facing;
    if (critter.style === 'laserBarrage') {
      if (age % 28 === 10) {
        spawnProjectile(match, owner, { damage: critter.damage, bkb: critter.bkb, kbg: critter.kbg, angle: 35,
          projStyle: 'laser', projSpeed: 19, projLife: 55, offsetY: 32 },
        { ...sm, moveKey: M.ITEM_THROW, moveStale: 1 });
      }
      continue;
    }
    const attack = CRITTER_ATTACKS[critter.style];
    const deck = match.surfaces.filter((s) => withinX(sm.x, s) && getSurfaceY(s, sm.x) <= sm.y + 25)
      .sort((a, b) => getSurfaceY(b, sm.x) - getSurfaceY(a, sm.x))[0];
    if (nearby && deck) {
      sm.vx = Math.abs(nearby.x - sm.x) > 25 ? attack.speed * sm.facing : 0;
      sm.x = clamp(sm.x + sm.vx, deck.x, deck.x + deck.w);
      sm.y = getSurfaceY(deck, sm.x);
    }
    if (age % attack.period !== 12) continue;
    const box = { x: sm.x, y: sm.y + attack.height, r: attack.radius };
    hitTargets(match, box, box);
    for (const v of match.fighters) {
      if (!rivals(owner, v) || intangible(v) || !circleHits(box, v.hurtbox) && !shieldHits(box, v)) continue;
      strike(match, owner, v, { damage: critter.damage, bkb: critter.bkb, kbg: critter.kbg, angle: attack.angle },
        { key: critter.id, box, facing: Math.sign(v.x - sm.x) || sm.facing, projectile: true });
    }
  }
  match.summons = match.summons.filter((sm) => sm.life > 0);
}

const SWEEPS = {
  pizzaVan: { period: 540, first: 240, warning: 68, speed: 25, y: 0, w: 148, h: 72, damage: 22, bkb: 79, kbg: 95, angle: 48 },
  starshipLaser: { period: 480, first: 200, warning: 54, speed: 29, y: 104, w: 155, h: 28, damage: 16, bkb: 64, kbg: 90, angle: 41 },
  fineRocket: { period: 640, first: 280, warning: 73, speed: 23, y: 46, w: 132, h: 55, damage: 26, bkb: 80, kbg: 118, angle: 58 },
};

function updateHazards(match) {
  const kind = match.stage.hazard;
  if (kind === 'risingAcid') {
    match.acidLevel = -121 - 139 * Math.cos(match.playFrames * 2 * Math.PI / 720);
    for (const f of match.fighters) {
      if (f.y >= match.acidLevel || intangible(f) || (f.acidHitAt ?? -Infinity) + 50 > match.frame) continue;
      f.acidHitAt = match.frame;
      strike(match, null, f, { damage: 14, bkb: 78, kbg: 95, angle: 89 },
        { key: kind, unblockable: true, box: { x: f.x, y: match.acidLevel, r: 1 }, projectile: true });
    }
    return;
  }
  const setup = SWEEPS[kind];
  if (!setup) return;
  const z = match.stage.blastzones;
  const cycle = match.playFrames - setup.first;
  if (cycle >= 0 && cycle % setup.period === 0) {
    const rightward = (cycle / setup.period) % 2 === 0;
    const x = rightward ? z.left - setup.w : z.right + setup.w;
    const life = Math.ceil((z.right - z.left + 2 * setup.w) / setup.speed);
    match.hazards.push({ id: 'hazard-' + match.nextEntityId++, kind, x, y: setup.y,
      vx: (rightward ? 1 : -1) * setup.speed, vy: 0, w: setup.w, h: setup.h,
      active: false, warningFrames: setup.warning, life, hitPorts: new Set() });
  }
  for (const h of match.hazards) {
    if (h.warningFrames > 0) {
      if (--h.warningFrames === 0) h.active = true;
      continue;
    }
    if (!h.active || --h.life < 0) continue;
    const left = Math.min(h.x, h.x + h.vx) - h.w / 2;
    const right = Math.max(h.x, h.x + h.vx) + h.w / 2;
    h.x += h.vx;
    h.y += h.vy;
    for (const f of match.fighters) {
      const b = f.hurtbox;
      if (intangible(f) || h.hitPorts.has(f.port) || kind === 'pizzaVan' && !f.grounded ||
          b.x + b.w < left || b.x > right || b.y > h.y + h.h || b.y + b.h < h.y) continue;
      const point = { x: clamp(f.x, left, right), y: clamp(b.y + b.h / 2, h.y, h.y + h.h), r: h.h / 2 };
      if (kind === 'fineRocket') {
        blast(match, null, point, 126, setup, kind);
        h.active = false;
        h.life = 0;
        break;
      }
      h.hitPorts.add(f.port);
      strike(match, null, f, setup, { key: kind, box: point, facing: Math.sign(h.vx), projectile: true });
    }
  }
  match.hazards = match.hazards.filter((h) => h.warningFrames > 0 || h.active && h.life > 0);
}

function knockout(match, f, dir) {
  const a = f.lastHitTimer > 0 ? byPort(match, f.lastHitBy) : null;
  if (a && a !== f) {
    a.kos++;
    if (f.lastSweetspot) {
      a.sweetspotKo = true;
      a.sweetspotKos++;
    }
    if (dir === 'bottom' && f.meteorByPort === a.port && f.meteorTimer > 0) {
      a.meteorKo = true;
      a.meteorKos++;
      event(match, 'meteorKo', a, { x: f.x, y: f.y, text: 'METEOR KO!' });
    }
    match.stats.totalKOs++;
    a.recentKoFrames.push(match.frame);
    const point = { x: f.x, y: f.y };
    if (a.recentKoFrames.length === 2) event(match, 'doubleKo', a, { ...point, text: 'DOUBLE KO!' });
    if (a.recentKoFrames.length >= 3) event(match, 'tripleKo', a, { ...point, text: 'TRIPLE KO!' });
    if (f.startPercent === 0 && !match.suddenDeath && f.stockDamageOwner === a.port &&
        (match.lastDamageSequence[a.port] ?? 0) <= f.stockStartSequence) {
      event(match, 'zeroToDeath', a, { ...point, text: 'ZERO-TO-DEATH!' });
    }
  }
  for (const victim of match.fighters) {
    if (victim === f || victim.receivedCombo?.port === f.port) victim.receivedCombo = null;
  }
  f.didShortHop = f.didFastFall = f.didAerial = false;
  f.chargeShotLevel = f.floatFrames = 0;
  f.upBUsed = f.sideBUsed = f.floating = f.floatUsed = false;
  f.cpuHeldInput = null;
  f.cpuThinkTimer = f.cpuPauseTimer = 0;
  f.inputBuffer = {};
  f.falls++;
  f.stocks = Math.max(0, f.stocks - 1);
  event(match, 'crowdCheer', f, { intensity: 1 });
  event(match, 'ko', f, { ...voice(f), killerPort: a?.port ?? null, dir, star: dir === 'top', sweetspot: !!(a && f.lastSweetspot) });
  match.screenShake = Math.max(match.screenShake, 12);
  match.screenFlash = Math.max(match.screenFlash, 5);
  releaseGrab(match, f);
  const holder = byPort(match, f.grabbedBy);
  if (holder) holder.grabbing = null;
  f.grabbedBy = null;
  const item = heldItem(match, f);
  if (item) {
    if (item.def.category === 'hammer') removeItem(match, item);
    else {
      item.holderPort = null;
      item.state = 'ground';
      item.age = 0;
      item.vy = 4;
    }
    f.heldItemId = null;
  }
  stopMove(f);
  f.ledgeId = null;
  leaveFloor(f);
  f.vx = f.vy = f.kbVx = f.kbVy = f.hitlag = f.hitstun = 0;
  f.launchAngle = null;
  f.giantTimer = f.tinyTimer = f.starTimer = f.hammerTimer = f.shieldAge = f.wallJumpCooldown = 0;
  clearMeteor(f);
  f.starHits.clear();
  setFighterScale(f);
  if (!match.suddenDeath && f.def !== MASTER_MITT && (f.stocks > 0 || match.mode === MODE.VS_TIME || match.mode === MODE.TRAINING)) {
    const { x, y } = match.stage.respawnPoint;
    f.x = x + (f.port - 1.5) * 34;
    f.y = y;
    f.percent = f.startPercent;
    f.stockDamageOwner = null;
    f.stockStartSequence = match.damageSequence;
    f.invulnFrames = MELEE.RESPAWN_PLATFORM_MAX;
    f.lastHitBy = null;
    f.lastHitTimer = f.jumpsUsed = f.ledgeCooldown = f.sleepTimer = f.sleepImmuneFrames = f.lCancelTimer = f.techTimer = f.techLock = f.shieldDrop = 0;
    f.fastFalling = false;
    f.shieldBroken = false;
    f.shieldHp = MELEE.SHIELD_MAX;
    f.staleQueue.length = 0;
    transition(f, S.RESPAWN);
  } else transition(f, S.DEAD);
}

function finish(match, winner, stockVictory = false) {
  match.winner = winner ?? null;
  match.winningTeam = winner?.team ?? null;
  match.winnerPort = winner?.port ?? null;
  match.status = 'ended';
  match.endTimer = 150;
  const ko = stockVictory && winner && match.events.slice().reverse().find((e) =>
    e.type === 'ko' && !teammates(winner, byPort(match, e.port)));
  if (ko) {
    match.slowMoFrames = 36;
    match.dramaticFinish = { type: 'dramaticFinish', x: ko.x, y: ko.y, killerPort: ko.killerPort, victimPort: ko.port };
    match.events.push(match.dramaticFinish);
  }
  match.events.push({ type: 'game', winnerPort: match.winnerPort });
}

function updateDerby(match, priorPositions) {
  const player = match.fighters.find((f) => f.def !== SAGGING_BAG);
  const bag = match.fighters.find((f) => f.def === SAGGING_BAG);
  const d = match.homerun;
  if (!player || !bag) return;
  const barrier = match.stage.barrierX;
  if (!d.barrierBroken) {
    if (bag.x >= barrier && bag.derbyKnockback >= 110 || match.timeLeftFrames <= 2 * TICK_RATE) {
      d.barrierBroken = true;
      event(match, 'barrierBreak', bag, { x: barrier, y: 65 });
    } else {
      for (const f of [player, bag]) {
        if (f.x >= barrier && priorPositions.get(f)?.x <= barrier) {
          f.x = barrier - 1;
          f.kbVx = -Math.abs(f.kbVx) * 0.5;
          f.vx = -Math.abs(f.vx) * 0.42;
        }
      }
    }
  }
  if (bag.x >= barrier && !d.launched && bag.derbyHitFrame != null && match.frame - bag.derbyHitFrame < 240) d.launched = true;
  if (d.launched) {
    d.distanceFt = Math.max(0, Math.round((bag.x - match.stage.spawns[1].x) / WORLD_SCALE));
    d.maxDistanceFt = Math.max(d.maxDistanceFt, d.distanceFt);
  }
  if (bag.x < match.stage.blastzones.left || bag.y < match.stage.blastzones.bottom) {
    bag.x = match.stage.spawns[1].x;
    bag.y = getSurfaceY(match.surfaces[0], bag.x);
    bag.vx = bag.vy = bag.kbVx = bag.kbVy = bag.hitstun = 0;
    bag.grounded = true;
    bag.onPlatformId = 'main';
    transition(bag, S.IDLE);
  }
  if (match.timeLeftFrames === 0) {
    match.derbyFlightFrames++;
    const inbound = bag.derbyHitFrame != null && match.frame - bag.derbyHitFrame < 90 && (bag.hitlag || bag.kbVx > 4);
    // Finish as soon as the bag is no longer gaining distance, even if it is
    // still high above the yard after an unusually strong launch.
    const gaining = bag.kbVx + bag.vx > 0.8 || bag.hitlag > 0;
    if ((!inbound && (!d.launched || !gaining)) || bag.x >= match.stage.blastzones.right ||
        match.derbyFlightFrames >= 420) finish(match, d.maxDistanceFt > 0 ? player : null);
  }
}

function beginSuddenDeath(match, tied) {
  if (match.barrelCannon) {
    match.barrelCannon.occupantPort = null;
    match.barrelCannon.fireTimer = 0;
  }
  match.suddenDeath = true;
  match.suddenDeathTimer = match.timeLeftFrames = match.introTimer = match.endTimer = match.slowMoFrames = 0;
  match.status = 'playing';
  match.winner = match.winnerPort = match.winningTeam = match.dramaticFinish = null;
  match.items.length = match.hazards.length = match.summons.length = match.projectiles.length = 0;
  match.acidLevel = -999;
  const liveSurfaces = [...match.surfaces, ...match.platforms].filter((s) => s && s.w >= 40);
  const hasFullClearance = (x, y, height, floorId) => !match.surfaces.some((d) => {
    if (d.id === floorId || !withinX(x, d, 10)) return false;
    const topY = getSurfaceY(d, clamp(x, d.x, d.x + d.w));
    const botY = d.y - d.h;
    return y < topY - 1 && y + height + 8 > botY;
  });
  let tiedIdx = 0;
  for (const f of match.fighters) {
    if (!tied.includes(f)) {
      f.stocks = 0;
      f.heldItemId = f.grabbing = f.grabbedBy = null;
      stopMove(f);
      transition(f, S.DEAD);
      continue;
    }
    const fresh = makeState(match, f, 1);
    for (const key of ['kos', 'falls', 'damageDealt', 'maxCombo', 'wavedashCount', 'lCancelCount', 'recentKoFrames', 'sweetspotKo', 'sweetspotKos', 'meteorKo', 'meteorKos']) fresh[key] = f[key];
    // Reset transient inputs, attacks and AI state while retaining fighter references held by callers.
    for (const key of Object.keys(f)) if (!(key in fresh)) delete f[key];
    Object.assign(f, fresh);
    const height = f.def.stats.height * f.scale;
    const spawn = match.stage.spawns[f.port % match.stage.spawns.length];
    // [S17] Ensure Sudden Death spawns over a live surface with full vertical body clearance.
    const supportedAtSpawn = liveSurfaces
      .filter((s) => withinX(spawn.x, s, -12) && getSurfaceY(s, spawn.x) <= spawn.y + 40 &&
        hasFullClearance(spawn.x, getSurfaceY(s, spawn.x), height, s.id))
      .sort((a, b) => getSurfaceY(b, spawn.x) - getSurfaceY(a, spawn.x))[0];
    if (supportedAtSpawn) {
      f.x = spawn.x;
      f.y = getSurfaceY(supportedAtSpawn, f.x);
      f.grounded = true;
      f.onPlatformId = supportedAtSpawn.id;
    } else if (liveSurfaces.length) {
      const clearCandidates = [];
      for (const s of liveSurfaces) {
        const pad = Math.min(48, s.w * 0.25);
        const frac = tied.length <= 1 ? 0.5 : (tiedIdx % tied.length) / Math.max(1, tied.length - 1);
        const cx = clamp(s.x + pad + (s.w - pad * 2) * frac, s.x + 12, s.x + s.w - 12);
        const cy = getSurfaceY(s, cx);
        if (hasFullClearance(cx, cy, height, s.id)) clearCandidates.push({ s, cx, cy });
      }
      const chosen = clearCandidates.length
        ? clearCandidates[tiedIdx % clearCandidates.length]
        : { s: liveSurfaces[tiedIdx % liveSurfaces.length], cx: liveSurfaces[tiedIdx % liveSurfaces.length].x + liveSurfaces[tiedIdx % liveSurfaces.length].w * 0.5, cy: liveSurfaces[tiedIdx % liveSurfaces.length].y };
      f.x = chosen.cx;
      f.y = chosen.cy;
      f.grounded = true;
      f.onPlatformId = chosen.s.id;
    } else {
      if (spawn.y !== f.y) leaveFloor(f);
      f.y = spawn.y;
    }
    tiedIdx++;
    f.vx = f.vy = f.kbVx = f.kbVy = 0;
    f.state = S.IDLE;
    f.percent = 300;
    f.invulnFrames = 45;
    f.hurtbox = getFighterHurtbox(f);
  }
  match.events.push({ type: 'suddenDeath', x: 0, y: 120, port: 0 });
}

export function triggerSuddenDeath(match) {
  if (!match.suddenDeath) {
    const active = match.fighters.filter((f) => f.state !== S.DEAD);
    if (active.length) beginSuddenDeath(match, active);
  }
  return match;
}

function resolveTimeout(match, fighters) {
  const boss = fighters.find((f) => f.bossHp > 0);
  if (match.mode === MODE.CLASSIC && boss) return finish(match, boss);
  const timedScore = match.mode === MODE.VS_TIME;
  const sides = new Map();
  for (const f of fighters) {
    const key = f.team ?? f;
    if (!sides.has(key)) sides.set(key, { members: [], score: 0, percent: 0 });
    const side = sides.get(key);
    side.members.push(f);
    side.score += timedScore ? f.kos - f.falls : f.stocks;
    if (!timedScore) side.percent += f.percent;
  }
  const ranked = [...sides.values()].sort((a, b) => b.score - a.score || a.percent - b.percent);
  const best = ranked[0];
  const tied = ranked.filter((side) => side.score === best.score && side.percent === best.percent);
  if (tied.length > 1 && (timedScore || match.mode === MODE.VS_STOCK)) {
    return beginSuddenDeath(match, tied.flatMap((side) => side.members));
  }
  finish(match, tied.length === 1 ? best.members[0] : null);
}

function recoverBoss(match, f) {
  const holder = byPort(match, f.grabbedBy);
  if (holder) releaseGrab(match, holder);
  releaseGrab(match, f);
  stopMove(f);
  leaveFloor(f);
  clearMeteor(f);
  f.ledgeId = f.launchAngle = null;
  if (f.sleepTimer > 0) wakeFromSleep(match, f);
  f.vx = f.vy = f.kbVx = f.kbVy = f.hitlag = f.hitstun = 0;
  f.jumpsUsed = f.cpuThinkTimer = f.cpuPauseTimer = 0;
  f.fastFalling = f.upBUsed = f.sideBUsed = false;
  f.inputBuffer = {};
  f.cpuHeldInput = null;
  f.cpuShelfRoute = f.cpuGapTarget = null;
  Object.assign(f, match.stage.respawnPoint);
  f.invulnFrames = 18;
  transition(f, S.AIRBORNE, true);
  event(match, 'teleportFlash', f, { phase: 'in', style: 'psychic' });
}

function endConditions(match) {
  if (match.mode === MODE.HOMERUN) return;
  const z = match.stage.blastzones;
  const player = byPort(match, 0);
  const knockedOut = [];
  for (const f of match.fighters) {
    if (f.state === S.DEAD || f.state === S.RESPAWN) continue;
    if (f.bossHp > 0) {
      if (f.bossPhase === 1 && f.bossHp <= f.bossMaxHp / 2) {
        f.bossPhase = 2;
        f.bossAttackCount = 0;
        event(match, 'bossPhase', f, { phase: 2 });
      }
      const margin = 36;
      if (f.x <= z.left + margin || f.x >= z.right - margin ||
          f.y <= z.bottom + margin || f.y >= z.top - margin) recoverBoss(match, f);
      continue;
    }
    const dir = f.bossHp <= 0 ? 'top' : f.x < z.left ? 'left' : f.x > z.right ? 'right' :
      f.y < z.bottom ? 'bottom' : f.y > z.top ? 'top' : null;
    if (dir) {
      knockout(match, f, dir);
      knockedOut.push(f);
      if (match.mode === MODE.MULTIMAN && f.port !== 0) {
        match.multimanKos = player.kos;
        match.multimanRemaining = Math.max(0, INTERN_COUNT - player.kos);
      }
    }
  }
  const alive = match.fighters.filter((f) => f.state !== S.DEAD);
  const lastSide = alive.length <= 1 || alive.every((f) => teammates(alive[0], f));
  if (match.suddenDeath) {
    if (lastSide) finish(match, alive[0], true);
    return;
  }
  if (match.mode === MODE.TRAINING) return;
  if (match.mode === MODE.TARGETS) {
    if (!match.targetsRemaining) return finish(match, player);
    if (player.state === S.DEAD || match.targetsTimed && match.timeLeftFrames <= 0) return finish(match, null);
    return;
  }
  if (match.mode === MODE.EVENT) {
    const rival = alive.find((f) => rivals(player, f) && f.stocks > 0);
    if (player.state === S.DEAD || player.stocks <= 0) return finish(match, rival, !!rival);
    const reachedTarget = match.koTarget > 0 && player.kos >= match.koTarget;
    if (match.objective === 'koTarget' && reachedTarget) return finish(match, player, true);
    if (match.timed && match.timeLeftFrames === 0) {
      const won = match.objective === 'survive' || match.objective === 'eliminate' && !rival;
      return finish(match, won ? player : rival);
    }
    if (match.objective === 'survive') return;
  }
  if (match.mode === MODE.MULTIMAN || match.objective === 'koTarget' && match.mode === MODE.EVENT) {
    if (player.state === S.DEAD) return finish(match, null);
    if (match.mode === MODE.MULTIMAN && !match.multimanRemaining) return finish(match, player);
    let active = match.fighters.filter((f) => f.port !== 0 && f.state !== S.DEAD).length;
    const needed = match.koTarget ? 3 : match.multimanRemaining;
    for (let i = 0; i < match.fighters.length && active < needed; i++) {
      const f = match.fighters[i];
      if (f.port !== 0 && f.state === S.DEAD) {
        match.fighters[i] = makeIntern(match, f.port, f, true);
        active++;
      }
    }
    return;
  }
  if (match.mode === MODE.VS_STOCK && alive.length === 0 && knockedOut.some((f) => !teammates(f, knockedOut[0]) && f !== knockedOut[0])) {
    return beginSuddenDeath(match, knockedOut);
  }
  if (match.fighters.length > 1 && lastSide && (match.mode !== MODE.VS_TIME || alive[0]?.team != null)) {
    return finish(match, alive[0], true);
  }
  if (match.timed && match.timeLeftFrames === 0) resolveTimeout(match, alive);
}

function animationPose(match, f) {
  if (match.status === 'ended' && f.port === match.winnerPort) return 'victory';
  if (f.state === S.ATTACK) {
    if (zipCrouch(f)) return 'crouch';
    if (f.charging || f.specialPhase === 'charge') return 'charge';
    if (AIR_ATTACKS.has(f.moveKey)) return 'aerial';
    if (SMASH_MOVES.has(f.moveKey)) return 'smash';
    if (JABS.includes(f.moveKey)) return 'jab';
    if ([M.FTILT, M.UTILT, M.DTILT, M.DASH_ATTACK, M.LEDGE_ATTACK, M.ITEM_SWING].includes(f.moveKey)) return 'tilt';
    return 'special';
  }
  switch (f.state) {
    case S.AIRBORNE: return f.floating ? 'float' : f.vy <= 0 ? 'fall' : f.doubleJumping ? 'doubleJump' : 'jump';
    case S.FREEFALL: return 'fall';
    case S.AIRDODGE: case S.TECH: case S.ROLL_F: case S.ROLL_B: case S.SPOTDODGE: return 'dodge';
    case S.SHIELD_STUN: return 'shield';
    case S.SHIELD_BREAK: case S.GRABBED: return 'hitstun';
    case S.KNOCKDOWN: case S.DEAD: return 'tumble';
    case S.JUMPSQUAT: case S.LANDING: return 'crouch';
    case S.SMASH_CHARGE: return 'charge';
    case S.LEDGE_CLIMB: case S.LEDGE_HANG: return 'ledge';
    case S.THROW: case S.GRAB_HOLD: return 'grab';
    case S.TURN: return 'dash';
    case S.RESPAWN: return 'idle';
    default: return f.state;
  }
}

function updateOverlay(match) {
  for (const f of match.fighters) {
    if (f.def === MASTER_MITT) {
      f.bossTell = f.state === S.ATTACK && f.moveFrame < f.moveData?.startup ? f.moveData.bossTell ?? null : null;
    }
    f.animPose = animationPose(match, f);
    f.hurtbox = getFighterHurtbox(f);
    f.activeHitboxes = moveHitboxes(f);
  }
}

export function stepMatch(match, inputsByPort = []) {
  match.events = [];
  if (match.status === 'paused') return match;
  if (match.status === 'ended') {
    if (match.slowMoFrames > 0) {
      if (--match.slowMoFrames % 3 !== 0) return match;
      match.frame++;
      match.screenShake *= 0.83;
      match.screenFlash = Math.max(0, match.screenFlash - 1);
      const priorTerrain = updateTerrain(match);
      for (const f of match.fighters) {
        if (f.state !== S.DEAD) integrate(match, f, EMPTY, priorTerrain);
      }
      updateOverlay(match);
    }
    match.endTimer = Math.max(0, match.endTimer - 1);
    return match;
  }
  match.frame++;
  match.screenShake *= 0.83;
  match.screenFlash = Math.max(0, match.screenFlash - 1);
  const priorTerrain = updateTerrain(match);
  for (const t of match.targets) {
    if (!t.broken) t.x = t.baseX + Math.sin(match.frame * t.speed) * t.moveX;
  }
  if (match.status === 'intro') {
    for (const f of match.fighters) if (f.def !== MASTER_MITT) integrate(match, f, EMPTY, priorTerrain);
    updateOverlay(match);
    match.events = [];
    if (--match.introTimer <= 0) {
      match.status = 'playing';
      match.events.push({ type: 'go' });
    }
    return match;
  }
  const derbyExpired = match.mode === MODE.HOMERUN && match.timeLeftFrames === 0;
  match.playFrames++;
  if (match.suddenDeath) match.suddenDeathTimer++;
  if (match.mode === MODE.TARGETS) match.targetTimeFrames++;
  if (match.mode !== MODE.TRAINING && match.mode !== MODE.MULTIMAN && match.timeLeftFrames > 0) match.timeLeftFrames--;
  const movable = new Set();
  const positions = new Map();
  for (const f of match.fighters) {
    while (f.recentKoFrames.length && match.frame - f.recentKoFrames[0] > 240) f.recentKoFrames.shift();
    positions.set(f, { x: f.x, y: f.y });
    const input = inputsByPort[f.port] ?? EMPTY;
    let allowed = derbyExpired && f.def !== SAGGING_BAG ? EMPTY : match.mode === MODE.ONLINE ? onlineInput(input) : input;
    if (allowed.shortHopPressed || !allowed.shield && (isLightShield(allowed) || allowed.shieldAnalog >= 0.78)) {
      allowed = { ...allowed, jumpPressed: !!(allowed.jumpPressed || allowed.shortHopPressed),
        shield: !!(allowed.shield || isLightShield(allowed) || allowed.shieldAnalog >= 0.78) };
    }
    allowed = stickPresses(match, f, allowed);
    rememberPresses(match, f, allowed);
    updateBuffs(match, f);
    if (f.warpCooldown > 0) f.warpCooldown--;
    if (f.meteorTimer > 0 && --f.meteorTimer === 0) f.meteorByPort = null;
    if (!stageTransport(match, f, allowed) && updateState(match, f, allowed)) movable.add(f);
    f.currentInput = allowed;
    f.prevMoveX = allowed.moveX || 0;
    f.prevMoveY = allowed.moveY || 0;
  }
  for (const f of movable) {
    positions.get(f).zip = f.zipOrigin;
    integrate(match, f, f.currentInput, priorTerrain);
  }
  for (const f of match.fighters) {
    const holder = byPort(match, f.grabbedBy);
    if (holder && holder.grabbing === f.port) {
      f.x = holder.x + holder.facing * 30;
      f.y = holder.y;
      f.grounded = holder.grounded;
      f.onPlatformId = holder.onPlatformId;
    }
    f.hurtbox = getFighterHurtbox(f);
    f.activeHitboxes = moveHitboxes(f);
  }
  updateProjectiles(match);
  meleeCollisions(match, movable);
  updateItems(match, priorTerrain);
  updateSummons(match);
  updateStarContacts(match);
  updateHazards(match);
  applyStageHazards(match);
  if (match.mode === MODE.HOMERUN) updateDerby(match, positions);
  endConditions(match);
  // Report actual travel, including a zip cut short by a ledge, landing, hit or KO.
  for (const [f, { zip }] of positions) {
    if (zip && !f.zipOrigin) event(match, 'quickZip', f, zip);
  }
  updateOverlay(match);
  for (const f of match.fighters) {
    if (!comboLocked(f)) f.receivedCombo = null;
    if (f.trueComboCount) {
      const v = byPort(match, f.trueComboVictim);
      if (v?.receivedCombo?.port !== f.port || !comboLocked(v)) {
        f.comboCount = f.trueComboCount = 0;
        f.comboMoves = [];
      }
    }
    if (f.lCancelTimer > 0) f.lCancelTimer--;
    if (f.techTimer > 0) f.techTimer--;
    if (f.techLock > 0) f.techLock--;
  }
  match.hitstopFrames = Math.max(0, ...match.fighters.map((f) => f.hitlag));
  return match;
}
