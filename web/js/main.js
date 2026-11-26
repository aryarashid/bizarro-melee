/**
 * Bizarro Melee v2 — Main Application Shell, 3D WebGL + 2D Fallback Renderer,
 * 26 Fighters, 29 Stages, 18 Items, 4P FFA/Teams, Break the Targets, Multi-Man Brawl,
 * Home-Run Derby, Classic Arcade, Training Lab, and dpad.games SDK Integration.
 */

import { DT, ITEM_FREQUENCY, MODE, PLAYER_COLORS, STATE } from './constants.js';
import { ROSTER, SAGGING_BAG, MASTER_MITT, BIZARRO_INTERN, getFighterById } from './roster.js';
import { STAGES, HOMERUN_STAGE, TARGET_STAGE, getStageById } from './stages.js';
import * as Physics from './physics.js';
import { ITEM_DEF } from './items.js';
import { EVENTS, getEventById } from './events.js';
import { computeCpuInput } from './ai.js';
import { InputManager, createEmptyInput } from './input.js';
import { GameRenderer } from './render.js';
import { GameRenderer3D } from './render3d.js';
import { SoundEngine } from './audio.js';
import { createDpadBridge, computeMatchChecksum, createOnlineSession } from './dpad-sdk.js';
import { preloadPortraits } from './portraits.js';
import { preloadStageArt, drawStageThumb } from './stage-art.js';

const { createMatch, stepMatch } = Physics;
const TEAM_ORDER = ['red', 'blue', 'green'];
const TEAM_COLORS = { red: '#ff4b5c', blue: '#3898ff', green: '#42e695' };
const EVENT_MODE = () => MODE.EVENT || 'event';

const reducedMotionMq = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
const isReducedMotion = () => Boolean(reducedMotionMq?.matches);

function buildClassicGauntlet(excludeFighterId = null) {
  const pool = ROSTER.filter((f) => f.id !== excludeFighterId);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const pick = (i) => shuffled[i % shuffled.length]?.id || ROSTER[i % ROSTER.length].id;
  const tourneyStages = STAGES.filter((s) => s.category === 'tourney' && s.id !== 'final-obligation');
  const generalStages = STAGES.filter((s) => s.id !== 'final-obligation');
  const pickStage = (list) => list[Math.floor(Math.random() * list.length)]?.id || STAGES[0].id;
  return [
    { fighterId: pick(0), stageId: pickStage(generalStages), label: '1V1 DUEL', cpuLevel: 4, itemFrequency: ITEM_FREQUENCY.LOW },
    { fighterId: pick(1), stageId: pickStage(generalStages), label: 'GIANT RIVAL', cpuLevel: 5, itemFrequency: ITEM_FREQUENCY.LOW, giantPorts: [1] },
    { fighterId: pick(2), stageId: pickStage(generalStages), label: 'ITEM CHAOS', cpuLevel: 6, itemFrequency: ITEM_FREQUENCY.HIGH },
    { fighterId: pick(3), stageId: pickStage(tourneyStages.length ? tourneyStages : generalStages), label: 'RIVAL DUEL', cpuLevel: 7, itemFrequency: ITEM_FREQUENCY.OFF },
    { fighterId: MASTER_MITT.id, stageId: 'final-obligation', label: 'FINAL BOSS', cpuLevel: 8, itemFrequency: ITEM_FREQUENCY.LOW },
  ];
}
const $ = (id) => document.getElementById(id);

const canvas3d = $('game-canvas-3d');
const canvas2d = $('game-canvas');
const renderer2d = new GameRenderer(canvas2d);
const renderer3d = new GameRenderer3D(canvas3d, canvas2d, renderer2d);
const sound = new SoundEngine();
const input = new InputManager();
const dpad = createDpadBridge();

const app = {
  screen: 'title',
  prevScreen: 'title',
  selectedMode: MODE.VS_STOCK,
  selectedStageId: STAGES[0].id,
  activeCssPort: 0,
  playerCount: 2,
  teamBattle: false,
  selectedEventId: EVENTS[0].id,
  stageFilterCat: 'all',
  trainingSpeed: 1,
  trainingCpuMode: 'stand',
  trainingDi: 'none',
  suddenDeathBannerFrames: 0,
  lastMusicIntensity: 0,
  matchClanks: [0, 0, 0, 0],
  stocks: 4,
  timeSeconds: 300,
  itemFrequency: ITEM_FREQUENCY.MEDIUM,
  classicStep: 0,
  classicScore: 0,
  classicRoundBaseScore: 0,
  classicRunCleared: false,
  classicGauntlet: buildClassicGauntlet('faux'),
  hitboxesVisible: false,
  shakeEnabled: true,
  flashEnabled: true,
  rumbleEnabled: true,
  techFeedEnabled: true,
  rebindAction: null,
  testerPadPort: 0,
  lastTesterTabsKey: '',
  lastObservedPadKey: '',
  manualPlayerCount: false,
  cssPortManualByP1: false,
  cssCursors: [
    { index: 0, locked: false },
    { index: 1, locked: false },
    { index: 2, locked: false },
    { index: 3, locked: false },
  ],
  use3D: renderer3d.ready,
  ports: [
    { port: 0, fighterId: 'faux', paletteIndex: 0, isCpu: false, manualCpu: false, cpuLevel: 5, name: 'P1', team: 'red' },
    { port: 1, fighterId: 'captain-pigeon', paletteIndex: 0, isCpu: true, manualCpu: false, cpuLevel: 5, name: 'CPU', team: 'blue' },
    { port: 2, fighterId: 'garth', paletteIndex: 0, isCpu: true, manualCpu: false, cpuLevel: 5, name: 'CPU 3', team: 'red' },
    { port: 3, fighterId: 'bario', paletteIndex: 0, isCpu: true, manualCpu: false, cpuLevel: 5, name: 'CPU 4', team: 'blue' },
  ],
  records: {
    matchesWon: 0,
    kosScored: 0,
    wavedashes: 0,
    classicClears: 0,
    homerunBest: 0,
    classicBest: 0,
    targetsBestMs: 0,
    multimanBest: 0,
    clearedEvents: [],
  },
  match: null,
  attractMatch: null,
  hudRefs: [],
  onlineSession: null,
  onlineGuestPick: null,
  onlineMatchActive: false,
  onlineReconnecting: false,
  onlineReconnectFrames: 0,
  onlineMenuOpen: false,
  onlineStatusDirty: false,
  seenPhysicalKey: false,
  padFocusEl: null,
  lastTickMs: 0,
  accumulator: 0,
};

const SCREEN_EL_MAP = {
  title: 'screen-title',
  css: 'screen-css',
  stage: 'screen-stage',
  events: 'screen-events',
  online: 'screen-online',
  records: 'screen-records',
  controller: 'screen-controller',
  settings: 'screen-settings',
  match: 'screen-hud',
  pause: 'screen-pause',
  results: 'screen-results',
};

const SCREEN_DEFAULT_FOCUS = {
  title: '#btn-quick-fight',
  css: '.css-tile',
  stage: '.stage-card',
  events: '.event-card',
  online: '#btn-lobby-public',
  records: '[data-board]',
  controller: '#sel-pad-profile',
  settings: '#inp-sfx-vol',
  pause: '#btn-pause-resume',
  results: '#btn-results-rematch',
};

const SCREEN_BACK_BTN = {
  css: '#btn-css-back',
  stage: '#btn-stage-back',
  events: '#btn-events-back',
  online: '#btn-online-back',
  records: '#btn-records-back',
  controller: '#btn-controller-back',
  settings: '#btn-settings-back',
};

function syncGraphicsMode() {
  const active3D = Boolean(app.use3D && renderer3d.ready);
  renderer3d.setEnabled(active3D);
  document.body.dataset.gfx = active3D ? '3d' : '2d';
  if ($('inp-3d')) $('inp-3d').checked = active3D;
  if ($('btn-pause-3d')) $('btn-pause-3d').textContent = `Graphics: ${active3D ? '3D WebGL' : '2D Classic'}`;
}

function setLayoutAttr() {
  const portrait = window.innerHeight > window.innerWidth;
  document.body.dataset.layout = portrait ? 'portrait' : 'landscape';
  renderer3d.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
}

function showScreen(name) {
  app.prevScreen = app.screen;
  app.screen = name;
  document.body.dataset.screen = name;

  for (const [k, elId] of Object.entries(SCREEN_EL_MAP)) {
    const el = $(elId);
    if (!el) continue;
    if (k === 'match' && name === 'pause') {
      el.hidden = false;
    } else {
      el.hidden = k !== name;
    }
  }

  clearPadFocus();
  input.setMenuMode?.(name !== 'match');
  input.syncMenuButtons?.();
  sound.setPaused?.(name === 'pause');
  if (name !== 'match' && name !== 'pause') {
    delete document.body.dataset.mode;
    if (app.lastMusicIntensity !== 0) {
      app.lastMusicIntensity = 0;
      sound.setIntensity?.(0);
    }
  }
  $('css-bio-panel')?.classList.remove('bio-open');
  updateTouchVisibility();

  if (name === 'title' || name === 'css' || name === 'stage' || name === 'events' || name === 'online' || name === 'records' || name === 'controller') {
    sound.setMusic('menu');
    if (name === 'title' && !app.attractMatch) startAttractMatch();
    if (name === 'controller') syncControllerScreen();
    if (name === 'events') buildEventsGrid();
  }
  if (name !== 'match' && input.getInputMode?.() === 'gamepad') {
    focusDefaultForScreen(name);
  }
}

function updateTouchVisibility() {
  const tc = $('touch-controls');
  if (!tc) return;
  const inPlay = app.screen === 'match' && app.match && (app.match.status === 'playing' || app.match.status === 'intro');
  const mode = input.getInputMode ? input.getInputMode() : 'keyboard';
  const isTouchCapable = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const showTouch = mode === 'touch' || (isTouchCapable && !app.seenPhysicalKey && mode !== 'gamepad');
  const visible = Boolean(inPlay && showTouch);
  tc.hidden = !visible;
  document.body.dataset.touch = visible ? '1' : '0';
}

function startAttractMatch() {
  const f1 = ROSTER[Math.floor(Math.random() * ROSTER.length)];
  let f2 = ROSTER[Math.floor(Math.random() * ROSTER.length)];
  if (f2.id === f1.id) f2 = ROSTER[(ROSTER.indexOf(f1) + 5) % ROSTER.length];
  const st = STAGES[Math.floor(Math.random() * STAGES.length)];
  app.attractMatch = createMatch({
    mode: MODE.VS_STOCK,
    stageId: st.id,
    stocks: 99,
    timeSeconds: 0,
    itemFrequency: ITEM_FREQUENCY.MEDIUM,
    players: [
      { port: 0, fighterId: f1.id, paletteIndex: 0, isCpu: true, cpuLevel: 7, name: f1.name },
      { port: 1, fighterId: f2.id, paletteIndex: 1, isCpu: true, cpuLevel: 7, name: f2.name },
    ],
  });
  app.attractMatch.status = 'playing';
  app.attractMatch.introTimer = 0;
  renderer3d.reset(app.attractMatch.stage);
}

// ============================================================================
// CHARACTER SELECT SCREEN (ALL 26 BIZARRO FIGHTERS + UP TO 4P!)
// ============================================================================
function buildCssGrid() {
  const grid = $('css-grid');
  grid.textContent = '';

  for (let tileIdx = 0; tileIdx < ROSTER.length; tileIdx++) {
    const def = ROSTER[tileIdx];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'css-tile';
    btn.dataset.fighterId = def.id;
    btn.dataset.tileIdx = String(tileIdx);

    const cursors = document.createElement('div');
    cursors.className = 'tile-cursors';
    btn.appendChild(cursors);

    const badges = document.createElement('div');
    badges.className = 'tile-badges';
    btn.appendChild(badges);

    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    renderer2d.drawPortrait(c, def, 0);
    btn.appendChild(c);

    const nameEl = document.createElement('div');
    nameEl.className = 'css-tile-name';
    nameEl.textContent = def.name;
    btn.appendChild(nameEl);

    const subEl = document.createElement('div');
    subEl.className = 'css-tile-sub';
    subEl.textContent = def.epithet || 'Bizarro Fighter';
    btn.appendChild(subEl);

    btn.addEventListener('mouseenter', () => renderBioPanel(def, 0));
    btn.addEventListener('focus', () => renderBioPanel(def, 0));
    btn.addEventListener('click', () => {
      sound.unlock();
      sound.playUi('select');
      const port = app.ports[app.activeCssPort];
      port.fighterId = def.id;
      port.paletteIndex = 0;
      if (app.cssCursors[app.activeCssPort]) {
        app.cssCursors[app.activeCssPort].index = tileIdx;
        app.cssCursors[app.activeCssPort].locked = true;
      }
      if (app.activeCssPort === 0 && app.onlineSession && !app.onlineSession.getStats().isHost) {
        app.onlineSession.sendGuestPick(port.fighterId, port.paletteIndex);
      }
      renderBioPanel(def, 0);
      syncCssSelection();
    });

    grid.appendChild(btn);
  }
  syncCssSelection();
  renderBioPanel(getFighterById(app.ports[0].fighterId), app.ports[0].paletteIndex);
}

function getFighterArchetypePills(def) {
  const s = def?.stats || {};
  const weight = Math.round(s.weight || 95);
  const pills = [];
  if (weight >= 112) pills.push({ label: `Super Heavy · ${weight}`, cls: 'pill-heavy' });
  else if (weight >= 104) pills.push({ label: `Heavy · ${weight}`, cls: 'pill-heavy' });
  else if (weight >= 85) pills.push({ label: `Midweight · ${weight}`, cls: 'pill-mid' });
  else if (weight >= 70) pills.push({ label: `Lightweight · ${weight}`, cls: 'pill-light' });
  else pills.push({ label: `Feather · ${weight}`, cls: 'pill-light' });

  if ((s.fallSpeed || 0) >= 14.5 || (s.gravity || 0) >= 0.76) {
    pills.push({ label: 'Fast-Faller', cls: 'pill-fast' });
  } else if (s.floaty || (s.fallSpeed || 12) <= 10.6 || (s.gravity || 0.6) <= 0.50) {
    pills.push({ label: 'Floaty', cls: 'pill-floaty' });
  } else if ((s.fallSpeed || 0) >= 13.0) {
    pills.push({ label: 'Semi-Fast', cls: 'pill-fast' });
  } else {
    pills.push({ label: 'All-Rounder', cls: 'pill-mid' });
  }

  if ((s.maxJumps || 2) >= 5) pills.push({ label: `${s.maxJumps} Jumps`, cls: 'pill-trait' });
  else if (def?.canFloat) pills.push({ label: 'Float Cancel', cls: 'pill-trait' });
  else if (def?.doubleJumpArmor) pills.push({ label: 'DJ Armor', cls: 'pill-trait' });
  else if ((s.traction || 0.7) <= 0.38) pills.push({ label: 'Long Wavedash', cls: 'pill-trait' });
  else if ((s.jumpSquat || 4) <= 3) pills.push({ label: '3f Jump', cls: 'pill-trait' });
  else if ((def?.moveScale?.reach || 1) >= 1.24) pills.push({ label: 'Disjoint', cls: 'pill-trait' });
  else if ((s.runSpeed || 0) >= 12.2) pills.push({ label: 'Rushdown', cls: 'pill-trait' });
  return pills;
}

function renderBioPanel(def, paletteIndex = 0) {
  if (!def) return;
  renderer2d.drawPortrait($('bio-portrait'), def, paletteIndex);
  $('bio-parody').textContent = `${String(def.rig?.silhouette || 'bizarro').toUpperCase()} FIGHTER`;
  $('bio-name').textContent = def.name;
  $('bio-epithet').textContent = def.epithet;
  const pillsEl = $('bio-pills');
  if (pillsEl) {
    pillsEl.textContent = '';
    for (const pill of getFighterArchetypePills(def)) {
      const span = document.createElement('span');
      span.className = `bio-pill ${pill.cls}`;
      span.textContent = pill.label;
      pillsEl.appendChild(span);
    }
  }
  $('bio-desc').textContent = def.bio;
  $('bio-taunt').textContent = `Taunt: ${def.taunt}`;

  const statsEl = $('bio-stats');
  statsEl.textContent = '';
  const rows = [
    ['Speed', Math.min(100, Math.round((def.stats.runSpeed / 14.5) * 100))],
    ['Weight', Math.min(100, Math.round(((def.stats.weight - 50) / 75) * 100))],
    ['Gravity', Math.min(100, Math.round((def.stats.gravity / 0.92) * 100))],
    ['Air Drift', Math.min(100, Math.round((def.stats.airSpeed / 11.5) * 100))],
  ];
  for (const [label, pct] of rows) {
    const row = document.createElement('div');
    row.className = 'stat-row';
    const lbl = document.createElement('span'); lbl.textContent = label;
    const bar = document.createElement('span'); bar.className = 'stat-bar';
    const fill = document.createElement('i'); fill.style.width = `${Math.max(12, pct)}%`;
    bar.appendChild(fill);
    row.append(lbl, bar);
    statsEl.appendChild(row);
  }

  const sp = $('bio-specials');
  sp.textContent = '';
  for (const [k, nm] of [['B', def.moves.neutralB?.name], ['Side-B', def.moves.sideB?.name], ['Up-B', def.moves.upB?.name], ['Down-B', def.moves.downB?.name]]) {
    const line = document.createElement('div');
    const st = document.createElement('strong');
    st.textContent = `${k}: `;
    line.append(st, document.createTextNode(nm || 'Special'));
    sp.appendChild(line);
  }
}

function visibleCssPortCount() {
  if (app.selectedMode === MODE.CLASSIC || app.selectedMode === MODE.HOMERUN || app.selectedMode === MODE.TARGETS || app.selectedMode === MODE.MULTIMAN) {
    return 1;
  }
  if (app.selectedMode === MODE.TRAINING || app.selectedMode === MODE.ONLINE) return 2;
  return app.playerCount;
}

function syncConnectedControllersToCss(autoExpand = true) {
  const isVs = app.selectedMode === MODE.VS_STOCK || app.selectedMode === MODE.VS_TIME;
  if (!isVs) return;
  const padPorts = input.getPadPorts ? input.getPadPorts() : [null, null, null, null];
  const connectedCount = padPorts.filter((idx) => idx != null).length;
  if (connectedCount < 2) return;
  const targetCount = Math.min(4, connectedCount);
  if (autoExpand && !app.manualPlayerCount && app.playerCount < targetCount) {
    app.playerCount = targetCount;
    if ($('sel-player-count')) $('sel-player-count').value = String(app.playerCount);
  }
  for (let i = 1; i < targetCount; i++) {
    const p = app.ports[i];
    if (p && !p.manualCpu) {
      p.isCpu = false;
      p.name = `P${i + 1}`;
    }
  }
}

function resetCssCursors() {
  for (let i = 0; i < 4; i++) {
    const idx = Math.max(0, ROSTER.findIndex((f) => f.id === app.ports[i]?.fighterId));
    app.cssCursors[i] = { index: idx, locked: false };
  }
}

function getCssGridColumns() {
  const tiles = $('css-grid')?.querySelectorAll('.css-tile');
  if (!tiles || !tiles.length) return 6;
  const firstTop = tiles[0].offsetTop;
  let cols = 0;
  for (const t of tiles) {
    if (Math.abs(t.offsetTop - firstTop) <= 4) cols++;
    else break;
  }
  return Math.max(1, cols || 6);
}

function syncCssSelection() {
  const count = visibleCssPortCount();
  if (app.activeCssPort >= count) app.activeCssPort = 0;

  for (let i = 0; i < 4; i++) {
    const tab = $(`btn-active-port-${i}`);
    if (!tab) continue;
    tab.hidden = i >= count;
    tab.classList.toggle('active', app.activeCssPort === i);
  }

  const tiles = $('css-grid').querySelectorAll('.css-tile');
  const activePorts = app.ports.slice(0, count);
  const padPorts = input.getPadPorts ? input.getPadPorts() : [null, null, null, null];
  const connectedPadCount = padPorts.filter((idx) => idx != null).length;
  const humanPorts = activePorts.filter((p) => !p.isCpu).map((p) => p.port);
  const resolvedPads = input.resolvePadIndexByPort ? input.resolvePadIndexByPort(count, humanPorts) : padPorts;
  const isVs = app.selectedMode === MODE.VS_STOCK || app.selectedMode === MODE.VS_TIME;

  const pickLabel = $('css-pick-label');
  if (pickLabel) {
    pickLabel.textContent = (isVs && connectedPadCount >= 2)
      ? 'Each pad picks its own fighter • Manual:'
      : 'Picking for:';
  }

  const activeCursorPorts = [];
  for (const p of activePorts) {
    const hasPad = !p.isCpu && resolvedPads[p.port] != null;
    if (hasPad || (connectedPadCount === 1 && p.port === app.activeCssPort)) {
      activeCursorPorts.push(p.port);
    }
  }

  for (let tileIdx = 0; tileIdx < tiles.length; tileIdx++) {
    const tile = tiles[tileIdx];
    const id = tile.dataset.fighterId;
    const matched = activePorts.filter((p) => p.fighterId === id);
    tile.classList.toggle('sel-p0', matched.length === 1 && matched[0].port === 0);
    tile.classList.toggle('sel-p1', matched.length === 1 && matched[0].port === 1);
    tile.classList.toggle('sel-p2', matched.length === 1 && matched[0].port === 2);
    tile.classList.toggle('sel-p3', matched.length === 1 && matched[0].port === 3);
    tile.classList.toggle('sel-both', matched.length > 1);
    const badges = tile.querySelector('.tile-badges');
    badges.textContent = '';
    for (const mp of matched) {
      const b = document.createElement('span');
      b.className = 'tile-badge';
      b.style.background = PLAYER_COLORS[mp.port];
      b.textContent = mp.isCpu ? `C${mp.port + 1}` : `P${mp.port + 1}`;
      badges.appendChild(b);
    }

    const cursorsEl = tile.querySelector('.tile-cursors');
    const here = activeCursorPorts.filter((port) => app.cssCursors[port]?.index === tileIdx);
    tile.classList.toggle('has-cursor-p0', here.length === 1 && here[0] === 0);
    tile.classList.toggle('has-cursor-p1', here.length === 1 && here[0] === 1);
    tile.classList.toggle('has-cursor-p2', here.length === 1 && here[0] === 2);
    tile.classList.toggle('has-cursor-p3', here.length === 1 && here[0] === 3);
    tile.classList.toggle('has-cursor-multi', here.length > 1);
    if (cursorsEl) {
      cursorsEl.textContent = '';
      for (const port of here) {
        const tok = document.createElement('span');
        const locked = Boolean(app.cssCursors[port]?.locked);
        tok.className = locked ? 'cursor-token locked' : 'cursor-token hovering';
        tok.style.background = PLAYER_COLORS[port];
        tok.dataset.cursorPort = String(port);
        tok.textContent = `P${port + 1}`;
        cursorsEl.appendChild(tok);
      }
    }
  }

  const focusedPortCard = app.padFocusEl?.closest?.('.port-card');
  const focusedPortIdx = focusedPortCard ? Number(focusedPortCard.dataset.port) : -1;
  const focusedCtrlIdx = focusedPortCard
    ? Array.from(focusedPortCard.querySelectorAll('button, select')).indexOf(app.padFocusEl)
    : -1;
  const activeDomEl = document.activeElement;
  const nativePortCard = activeDomEl?.closest?.('#css-ports .port-card');
  const nativePortIdx = nativePortCard ? Number(nativePortCard.dataset.port) : -1;
  const nativeCtrlIdx = nativePortCard
    ? Array.from(nativePortCard.querySelectorAll('button, select')).indexOf(activeDomEl)
    : -1;

  const portsEl = $('css-ports');
  portsEl.textContent = '';
  for (const p of activePorts) {
    const def = getFighterById(p.fighterId);
    const card = document.createElement('div');
    const isLocked = Boolean(!p.isCpu && app.cssCursors[p.port]?.locked);
    card.className = isLocked ? 'port-card locked' : 'port-card';
    card.dataset.port = String(p.port);

    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    renderer2d.drawPortrait(c, def, p.paletteIndex);

    const info = document.createElement('div');
    info.className = 'port-info';

    const top = document.createElement('div');
    top.className = 'port-top';
    const tag = document.createElement('span');
    tag.className = 'port-tag';
    tag.style.background = PLAYER_COLORS[p.port];
    tag.textContent = p.isCpu ? `CPU Lv.${p.cpuLevel}` : `P${p.port + 1}`;
    const fname = document.createElement('span');
    fname.className = 'port-fighter';
    fname.textContent = def.name;
    top.append(tag, fname);
    if (!p.isCpu) {
      if (isLocked) {
        const readyBadge = document.createElement('span');
        readyBadge.className = 'port-ready-badge';
        readyBadge.textContent = 'READY';
        top.appendChild(readyBadge);
      }
      const padIdx = resolvedPads[p.port];
      const padSlotNum = padIdx != null ? (padPorts.indexOf(padIdx) + 1) : 0;
      const padBadge = document.createElement('span');
      if (padSlotNum > 0) {
        padBadge.className = 'port-pad-badge';
        padBadge.textContent = `PAD ${padSlotNum}`;
      } else if (p.port <= 1) {
        padBadge.className = 'port-pad-badge kb';
        padBadge.textContent = 'KB';
      } else {
        padBadge.className = 'port-pad-badge missing';
        padBadge.textContent = 'NO PAD';
      }
      top.appendChild(padBadge);
    }

    const controls = document.createElement('div');
    controls.className = 'port-controls';

    const altBtn = document.createElement('button');
    altBtn.type = 'button';
    altBtn.textContent = `Alt ${p.paletteIndex + 1}/4`;
    altBtn.addEventListener('click', () => {
      sound.playUi('move');
      p.paletteIndex = (p.paletteIndex + 1) % def.palettes.length;
      if (p.port === 0 && app.onlineSession && !app.onlineSession.getStats().isHost) {
        app.onlineSession.sendGuestPick(p.fighterId, p.paletteIndex);
      }
      renderBioPanel(def, p.paletteIndex);
      syncCssSelection();
    });
    controls.appendChild(altBtn);

    if (app.teamBattle && (app.selectedMode === MODE.VS_STOCK || app.selectedMode === MODE.VS_TIME)) {
      const team = p.team || (p.port % 2 === 0 ? 'red' : 'blue');
      p.team = team;
      card.style.borderColor = TEAM_COLORS[team] || PLAYER_COLORS[p.port];
      const teamBtn = document.createElement('button');
      teamBtn.type = 'button';
      teamBtn.className = `team-btn team-${team}`;
      teamBtn.textContent = `${team.toUpperCase()} TEAM`;
      teamBtn.addEventListener('click', () => {
        sound.playUi('move');
        p.team = TEAM_ORDER[(TEAM_ORDER.indexOf(p.team || 'red') + 1) % TEAM_ORDER.length];
        syncCssSelection();
      });
      controls.appendChild(teamBtn);
    }

    if (p.port > 0) {
      const cpuBtn = document.createElement('button');
      cpuBtn.type = 'button';
      cpuBtn.textContent = p.isCpu ? `Human P${p.port + 1}` : 'CPU';
      cpuBtn.addEventListener('click', () => {
        sound.playUi('move');
        p.isCpu = !p.isCpu;
        p.manualCpu = p.isCpu;
        p.name = p.isCpu ? `CPU ${p.port + 1}` : `P${p.port + 1}`;
        if (p.isCpu && app.cssCursors[p.port]) app.cssCursors[p.port].locked = false;
        syncCssSelection();
      });
      controls.appendChild(cpuBtn);

      if (p.isCpu) {
        const lvlSel = document.createElement('select');
        for (let lv = 1; lv <= 9; lv++) {
          const opt = document.createElement('option');
          opt.value = String(lv);
          opt.textContent = `Lv.${lv}`;
          if (lv === p.cpuLevel) opt.selected = true;
          lvlSel.appendChild(opt);
        }
        lvlSel.addEventListener('change', () => { p.cpuLevel = Number(lvlSel.value); syncCssSelection(); });
        controls.appendChild(lvlSel);
      }
    }

    info.append(top, controls);
    card.append(c, info);
    card.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
      app.activeCssPort = p.port;
      app.cssPortManualByP1 = true;
      renderBioPanel(def, p.paletteIndex);
      syncCssSelection();
    });
    portsEl.appendChild(card);
    if (focusedPortIdx === p.port && focusedCtrlIdx >= 0) {
      const rebuilt = card.querySelectorAll('button, select')[focusedCtrlIdx];
      if (rebuilt) setPadFocus(rebuilt);
    }
    if (nativePortIdx === p.port && nativeCtrlIdx >= 0) {
      const rebuiltNative = card.querySelectorAll('button, select')[nativeCtrlIdx];
      if (rebuiltNative && typeof rebuiltNative.focus === 'function') rebuiltNative.focus();
    }
  }

  // [S3] In Team Battle, require at least 2 distinct teams before allowing Stage Select
  const startBtn = $('btn-css-start');
  if (startBtn) {
    if (isVs && app.teamBattle) {
      const distinctTeams = new Set(activePorts.map((p) => p.team || (p.port % 2 === 0 ? 'red' : 'blue')));
      const valid = distinctTeams.size >= 2;
      startBtn.disabled = !valid;
      startBtn.textContent = valid ? 'Stage Select →' : 'Need 2+ Teams';
    } else {
      startBtn.disabled = false;
      if (isVs) startBtn.textContent = 'Stage Select →';
    }
  }

  const readyBanner = $('css-ready-banner');
  if (readyBanner) {
    const padHumanPorts = activePorts.filter((p) => !p.isCpu && resolvedPads[p.port] != null);
    const allReady = padHumanPorts.length >= 1
      && padHumanPorts.every((p) => app.cssCursors[p.port]?.locked)
      && !(startBtn && startBtn.disabled);
    readyBanner.hidden = !allReady;
  }
}

// ============================================================================
// STAGE SELECT SCREEN (ALL 29 BIZARRO ARENAS WITH 3D THUMBNAILS & FILTERS)
// ============================================================================
function buildStageGrid(filterCat = 'all') {
  app.stageFilterCat = filterCat;
  const grid = $('stage-grid');
  grid.textContent = '';
  const list = filterCat === 'all' ? STAGES : STAGES.filter((s) => s.category === filterCat);
  for (const b of document.querySelectorAll('[data-stage-cat]')) {
    b.classList.toggle('btn-accent', b.dataset.stageCat === filterCat);
    b.classList.toggle('btn-ghost', b.dataset.stageCat !== filterCat);
  }
  for (const st of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stage-card';

    const sw = document.createElement('div');
    sw.className = 'stage-swatch';
    const thumb = document.createElement('canvas');
    thumb.width = 240;
    thumb.height = 120;
    drawStageThumb(thumb, st);
    sw.appendChild(thumb);

    const h3 = document.createElement('h3'); h3.textContent = st.name;
    const par = document.createElement('div'); par.className = 'stage-parody';
    par.textContent = `${String(st.category || 'arena').toUpperCase()} ARENA${st.hazard ? ' • HAZARD' : ''}`;
    const p = document.createElement('p'); p.textContent = st.tagline;

    btn.append(sw, h3, par, p);
    btn.addEventListener('click', () => {
      sound.unlock(); sound.playUi('start');
      app.selectedStageId = st.id;
      launchConfiguredMatch();
    });
    grid.appendChild(btn);
  }
}

// ============================================================================
// BIZARRO EVENT MATCHES (8 HANDCRAFTED CHALLENGES)
// ============================================================================
function buildEventsGrid() {
  const grid = $('events-grid');
  if (!grid) return;
  grid.textContent = '';
  const clearedSet = new Set(Array.isArray(app.records.clearedEvents) ? app.records.clearedEvents : []);
  if ($('events-progress-pill')) {
    $('events-progress-pill').textContent = `${clearedSet.size} / ${EVENTS.length} Cleared`;
  }
  for (const ev of EVENTS) {
    const isCleared = clearedSet.has(ev.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = isCleared ? 'event-card cleared' : 'event-card';
    btn.dataset.eventId = ev.id;

    const head = document.createElement('div');
    head.className = 'event-card-head';
    const num = document.createElement('span');
    num.className = 'event-num';
    num.textContent = `EVENT #${ev.num}`;
    const diff = document.createElement('span');
    diff.className = isCleared ? 'event-diff cleared-pill' : 'event-diff';
    diff.textContent = isCleared ? 'CLEARED' : ev.difficulty;
    head.append(num, diff);

    const h3 = document.createElement('h3');
    h3.textContent = ev.title;
    const p = document.createElement('p');
    p.textContent = ev.subtitle;
    const meta = document.createElement('div');
    meta.className = 'event-meta';
    const st = getStageById(ev.stageId);
    const p1Def = ev.useCurrentP1 ? getFighterById(app.ports[0].fighterId) : getFighterById(ev.players[0].fighterId);
    meta.textContent = `${p1Def?.name || 'P1'} • ${st.name}`;

    btn.append(head, h3, p, meta);
    btn.addEventListener('click', () => {
      sound.unlock();
      sound.playUi('start');
      launchEventMatch(ev.id);
    });
    grid.appendChild(btn);
  }
}

function launchEventMatch(eventId) {
  const ev = getEventById(eventId);
  app.selectedMode = EVENT_MODE();
  app.selectedEventId = ev.id;
  app.selectedStageId = ev.stageId;
  launchConfiguredMatch();
}

// ============================================================================
// MATCH LAUNCH & HUD
// ============================================================================
function launchConfiguredMatch(onlineCfg = null) {
  const dpadPlayer = dpad.getPlayer();
  const p1Name = dpadPlayer?.name ? dpadPlayer.name.slice(0, 14) : 'P1';

  let stageId = app.selectedStageId;
  let players = [];
  let stocks = app.stocks;
  let timeSeconds = app.timeSeconds;
  let itemFrequency = app.itemFrequency;
  let extraConfig = {};

  if (app.selectedMode === EVENT_MODE()) {
    const ev = getEventById(app.selectedEventId);
    stageId = ev.stageId;
    stocks = ev.stocks;
    timeSeconds = ev.timeSeconds;
    itemFrequency = ev.itemFrequency;
    players = ev.players.map((pl, idx) => {
      if (idx === 0) {
        return {
          ...pl,
          fighterId: ev.useCurrentP1 ? app.ports[0].fighterId : pl.fighterId,
          paletteIndex: ev.useCurrentP1 ? app.ports[0].paletteIndex : (pl.paletteIndex || 0),
          port: 0,
          isCpu: false,
          name: p1Name,
        };
      }
      return { ...pl, port: idx };
    });
    extraConfig = {
      eventId: ev.id,
      eventTitle: ev.title,
      objective: ev.objective,
      startPercent: ev.startPercent,
      giantPorts: ev.giantPorts,
      itemPool: ev.itemPool,
      timeLimitWin: ev.timeLimitWin,
      koTarget: ev.koTarget,
    };
  } else if (app.selectedMode === MODE.HOMERUN) {
    stageId = HOMERUN_STAGE.id;
    stocks = 99; timeSeconds = 10; itemFrequency = ITEM_FREQUENCY.OFF;
    players = [
      { ...app.ports[0], port: 0, isCpu: false, name: p1Name, team: null },
      { port: 1, fighterId: SAGGING_BAG.id, paletteIndex: 0, isCpu: true, cpuLevel: 1, name: SAGGING_BAG.name, team: null },
    ];
  } else if (app.selectedMode === MODE.TARGETS) {
    stageId = TARGET_STAGE.id;
    stocks = 1; timeSeconds = 0; itemFrequency = ITEM_FREQUENCY.OFF;
    players = [{ ...app.ports[0], port: 0, isCpu: false, name: p1Name, team: null }];
  } else if (app.selectedMode === MODE.MULTIMAN) {
    stageId = 'arguefield';
    stocks = 1; timeSeconds = 0; itemFrequency = ITEM_FREQUENCY.LOW;
    players = [
      { ...app.ports[0], port: 0, isCpu: false, name: p1Name, team: null },
      { port: 1, fighterId: BIZARRO_INTERN.id, paletteIndex: 0, isCpu: true, cpuLevel: 3, name: 'Intern #1', team: null },
      { port: 2, fighterId: BIZARRO_INTERN.id, paletteIndex: 1, isCpu: true, cpuLevel: 4, name: 'Intern #2', team: null },
      { port: 3, fighterId: BIZARRO_INTERN.id, paletteIndex: 0, isCpu: true, cpuLevel: 4, name: 'Intern #3', team: null },
    ];
  } else if (app.selectedMode === MODE.CLASSIC) {
    if (!app.classicGauntlet || !app.classicGauntlet.length) {
      app.classicGauntlet = buildClassicGauntlet(app.ports[0].fighterId);
    }
    const round = app.classicGauntlet[app.classicStep % app.classicGauntlet.length];
    const oppDef = getFighterById(round.fighterId);
    stageId = round.stageId;
    stocks = 3; timeSeconds = 180; itemFrequency = round.itemFrequency || ITEM_FREQUENCY.LOW;
    players = [
      { ...app.ports[0], port: 0, isCpu: false, name: p1Name, team: null },
      { port: 1, fighterId: round.fighterId, paletteIndex: 0, isCpu: true, cpuLevel: round.cpuLevel || Math.min(9, 4 + app.classicStep), name: oppDef.name, team: null },
    ];
    if (round.giantPorts) extraConfig.giantPorts = round.giantPorts;
  } else if (app.selectedMode === MODE.TRAINING) {
    stocks = 99; timeSeconds = 0; itemFrequency = ITEM_FREQUENCY.OFF;
    players = [
      { ...app.ports[0], port: 0, isCpu: false, name: p1Name, team: null },
      { ...app.ports[1], port: 1, isCpu: true, cpuLevel: 5, name: 'Training Bot', team: null },
    ];
  } else if (app.selectedMode === MODE.ONLINE) {
    const online = dpad.getOnlineState();
    const peerName = online.peers?.[0]?.username || 'Online Rival';
    if (onlineCfg) {
      stageId = onlineCfg.stageId;
      stocks = onlineCfg.stocks;
      timeSeconds = onlineCfg.timeSeconds;
      itemFrequency = onlineCfg.itemFrequency;
      extraConfig.seed = onlineCfg.seed;
      const hostName = online.isHost ? p1Name : peerName;
      const guestName = online.isHost ? peerName : p1Name;
      players = [
        { port: 0, fighterId: onlineCfg.hostFighter, paletteIndex: onlineCfg.hostPalette, isCpu: false, name: hostName, team: null },
        { port: 1, fighterId: onlineCfg.guestFighter, paletteIndex: onlineCfg.guestPalette, isCpu: false, name: guestName, team: null },
      ];
    } else {
      players = [
        { ...app.ports[0], port: 0, isCpu: false, name: p1Name, team: null },
        { ...app.ports[1], port: 1, isCpu: !online.connected, cpuLevel: 6, name: peerName, team: null },
      ];
    }
  } else {
    players = app.ports.slice(0, app.playerCount).map((p, idx) => ({
      ...p,
      port: idx,
      team: app.teamBattle ? (p.team || (idx % 2 === 0 ? 'red' : 'blue')) : null,
      name: idx === 0 ? p1Name : (p.isCpu ? `CPU Lv.${p.cpuLevel}` : `P${idx + 1}`),
    }));
  }

  app.suddenDeathBannerFrames = 0;
  app.matchClanks = [0, 0, 0, 0];
  app.lastMusicIntensity = 0;
  sound.setIntensity?.(0);
  app.onlineMatchActive = Boolean(app.selectedMode === MODE.ONLINE && onlineCfg && app.onlineSession?.getStats().active);
  app.onlineMenuOpen = false;
  app.onlineReconnecting = false;
  app.onlineReconnectFrames = 0;
  app.match = createMatch({
    mode: app.selectedMode,
    stageId,
    stocks,
    timeSeconds,
    itemFrequency,
    players,
    hitboxesVisible: app.hitboxesVisible,
    classicRound: app.classicStep + 1,
    ...extraConfig,
  });
  if (app.selectedMode === MODE.TRAINING) {
    app.match.timeScale = app.trainingSpeed;
    app.match.trainingCpuMode = app.trainingCpuMode;
    app.match.trainingConfig = { cpuBehavior: app.trainingCpuMode, cpuDi: app.trainingDi };
  }

  renderer3d.reset(app.match.stage);
  buildMatchHud(app.match);
  input.clearHolds();
  showScreen('match');
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
  sound.setMusic(players.some((p) => p.fighterId === MASTER_MITT.id) ? 'boss' : 'battle', app.match.stage.id);
  sound.playUi('ready');
}

function buildMatchHud(match) {
  document.body.dataset.mode = match.mode;
  const classicRound = app.classicGauntlet?.[app.classicStep % (app.classicGauntlet?.length || 1)];
  const modeLabel = {
    [MODE.VS_STOCK]: `${match.stage.name} • ${app.teamBattle ? 'TEAMS • ' : ''}${app.stocks} STOCK • ITEMS ${app.itemFrequency.toUpperCase()}`,
    [MODE.VS_TIME]: `${match.stage.name} • ${app.teamBattle ? 'TEAMS • ' : ''}TIME`,
    [EVENT_MODE()]: `EVENT: ${(match.eventTitle || 'BIZARRO EVENT').toUpperCase()} • ${match.stage.name}`,
    [MODE.CLASSIC]: `CLASSIC ${app.classicStep + 1}/${app.classicGauntlet?.length || 5} • ${classicRound?.label || 'DUEL'} • ${match.stage.name}`,
    [MODE.HOMERUN]: 'HOME-RUN DERBY • GRAB THE PLUNGER!',
    [MODE.TARGETS]: 'BREAK THE TARGETS • SMASH ALL 10!',
    [MODE.MULTIMAN]: 'MULTI-MAN BIZARRO BRAWL • 25 INTERNS',
    [MODE.TRAINING]: `TRAINING LAB • ${match.stage.name}`,
    [MODE.ONLINE]: `ONLINE LOCKSTEP (${app.onlineSession?.getStats().delayFrames || 3}F) • ${match.stage.name}`,
  }[match.mode] || match.stage.name;
  $('hud-mode-info').textContent = modeLabel;

  const isTraining = match.mode === MODE.TRAINING;
  $('btn-hud-hitboxes').hidden = !isTraining;
  $('btn-hud-reset').hidden = !isTraining;
  if ($('hud-training-bar')) $('hud-training-bar').hidden = !isTraining;
  if (isTraining) {
    if ($('sel-train-speed')) $('sel-train-speed').value = String(app.trainingSpeed);
    if ($('sel-train-cpu')) $('sel-train-cpu').value = app.trainingCpuMode;
    if ($('sel-train-di')) $('sel-train-di').value = app.trainingDi;
    if ($('train-telemetry')) {
      $('train-telemetry').textContent = 'ADV -- • 0 HIT';
      $('train-telemetry').className = 'train-telemetry';
    }
  }
  $('btn-hud-hitboxes').textContent = `Hitboxes: ${app.hitboxesVisible ? 'On' : 'Off'}`;

  const isKoTargetEvent = match.mode === EVENT_MODE() && (match.koTarget || 0) > 0;
  const showSpecialMeter = match.mode === MODE.HOMERUN || match.mode === MODE.TARGETS || match.mode === MODE.MULTIMAN || isKoTargetEvent;
  $('hud-homerun').hidden = !showSpecialMeter;
  if (match.mode === MODE.HOMERUN) $('hr-label').textContent = 'DISTANCE';
  else if (match.mode === MODE.TARGETS) $('hr-label').textContent = 'TARGETS LEFT';
  else if (match.mode === MODE.MULTIMAN) $('hr-label').textContent = 'INTERNS LEFT';
  else if (isKoTargetEvent) $('hr-label').textContent = 'KO TARGET';

  const feedEl = $('hud-tech-feed');
  if (feedEl) feedEl.textContent = '';

  const container = $('hud-fighters');
  container.textContent = '';
  container.dataset.count = String(match.fighters.length);
  app.hudRefs = [];

  for (const f of match.fighters) {
    const card = document.createElement('div');
    card.className = 'hud-card';
    const borderCol = f.team ? (TEAM_COLORS[f.team] || PLAYER_COLORS[f.port % PLAYER_COLORS.length]) : PLAYER_COLORS[f.port % PLAYER_COLORS.length];
    card.style.borderColor = borderCol;

    const c = document.createElement('canvas');
    c.width = 60; c.height = 60;
    renderer2d.drawPortrait(c, f.def, f.paletteIndex);

    const meta = document.createElement('div');
    meta.className = 'hud-card-meta';
    const nameEl = document.createElement('div');
    nameEl.className = 'hud-card-name';
    const isBoss = f.def.id === MASTER_MITT.id || (f.bossMaxHp || 0) > 0;
    if (isBoss) card.classList.add('hud-card-boss');
    const isIntern = f.def.id === BIZARRO_INTERN.id;
    const sameName = String(f.name || '').trim().toUpperCase() === String(f.def.name || '').trim().toUpperCase();
    const showTeamTag = f.team && f.team !== 'player' && f.team !== 'interns';
    const teamTag = showTeamTag ? (match.fighters.length >= 3 ? `[${f.team[0].toUpperCase()}] ` : `[${f.team.toUpperCase()}] `) : '';
    nameEl.textContent = isIntern
      ? (f.name || f.def.name)
      : showTeamTag
        ? `${teamTag}${f.def.name}`
        : (sameName || !f.name ? f.def.name : `${f.def.name} (${f.name})`);

    const stocksEl = document.createElement('div');
    stocksEl.className = 'hud-stocks';
    let bossBar = null;
    let bossFill = null;
    let scorePill = null;
    const stockPips = [];
    if (isBoss) {
      bossBar = document.createElement('div');
      bossBar.className = 'boss-hp-bar';
      bossFill = document.createElement('div');
      bossFill.className = 'boss-hp-fill';
      bossFill.style.width = '100%';
      bossBar.appendChild(bossFill);
      stocksEl.appendChild(bossBar);
    } else if (match.mode === MODE.VS_TIME) {
      scorePill = document.createElement('span');
      scorePill.className = 'time-score-pill';
      scorePill.textContent = f.team ? 'TEAM 0' : 'SCORE 0';
      stocksEl.appendChild(scorePill);
    } else if (match.mode !== MODE.TRAINING && match.mode !== MODE.HOMERUN) {
      for (let i = 0; i < 6; i++) {
        const pip = document.createElement('span');
        pip.className = 'stock-pip';
        pip.style.background = borderCol;
        pip.hidden = i >= Math.min(6, Math.max(0, f.stocks));
        stocksEl.appendChild(pip);
        stockPips.push(pip);
      }
    }
    const buffsEl = document.createElement('div');
    buffsEl.className = 'hud-buffs';
    buffsEl.hidden = true;
    const resEl = document.createElement('div');
    resEl.className = 'hud-resource';
    resEl.hidden = true;
    const comboEl = document.createElement('div');
    comboEl.className = 'hud-combo';
    meta.append(nameEl, stocksEl, buffsEl, resEl, comboEl);

    const pctEl = document.createElement('div');
    pctEl.className = isBoss ? 'hud-pct hud-boss-hp' : 'hud-pct';
    pctEl.textContent = isBoss
      ? `${Math.max(0, Math.ceil(f.bossHp ?? ((f.bossMaxHp || 300) - (f.percent || 0))))} HP`
      : `${Math.floor(f.percent || 0)}%`;

    card.append(c, meta, pctEl);
    container.appendChild(card);

    app.hudRefs.push({
      port: f.port, card, canvas: c, stocksEl, buffsEl, pctEl, resEl, comboEl,
      bossBar, bossFill, scorePill, stockPips,
      lastPct: Math.floor(f.percent || 0), lastHp: -1, lastStocks: Math.min(6, Math.max(0, f.stocks)),
      lostPipIdx: -1, lostPipFrames: 0, stockFlashFrames: 0,
      lastScore: null, lastCombo: '', lastComboCount: 0, comboPopFrames: 0,
      lastRes: '', lastBuffKey: '', isDanger: false,
      shake: 0, pipColor: borderCol, isBoss,
    });
  }
}

function setStableText(el, next) {
  if (!el) return;
  const str = String(next);
  if (el.firstChild?.nodeType === 3 && el.childNodes.length === 1) {
    if (el.firstChild.nodeValue !== str) el.firstChild.nodeValue = str;
    return;
  }
  el.textContent = str;
}

function updateMatchHud(match) {
  if (!match) return;

  const timerEl = $('hud-timer');
  const feetEl = $('hr-feet');
  if (match.suddenDeath) {
    setStableText(timerEl, '300% SD!');
  } else if (match.mode === MODE.TARGETS) {
    setStableText(timerEl, `${((match.targetTimeFrames || 0) / 60).toFixed(2)}s`);
    setStableText(feetEl, `${match.targetsRemaining ?? 0} / 10`);
  } else if (match.mode === MODE.MULTIMAN) {
    setStableText(timerEl, `${match.multimanKos || 0} KOs`);
    setStableText(feetEl, `${match.multimanRemaining ?? 0}`);
  } else if (match.timed || match.timeLeftFrames > 0 || match.mode === MODE.HOMERUN) {
    const secs = Math.max(0, Math.ceil((match.timeLeftFrames || 0) / 60));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    setStableText(timerEl, match.mode === MODE.HOMERUN
      ? `${(Math.max(0, match.timeLeftFrames || 0) / 60).toFixed(1)}s`
      : `${m}:${String(s).padStart(2, '0')}`);
    if (match.mode === MODE.HOMERUN && match.homerun) {
      setStableText(feetEl, `${match.homerun.maxDistanceFt.toFixed(1)} ft`);
    } else if (match.mode === EVENT_MODE() && (match.koTarget || 0) > 0) {
      setStableText(feetEl, `${match.fighters[0]?.kos || 0} / ${match.koTarget}`);
    }
  } else {
    setStableText(timerEl, '∞');
  }

  const banner = $('hud-banner');
  const vsSplash = $('hud-vs-splash');
  const showSd = app.suddenDeathBannerFrames > 0;
  if (banner.classList.contains('sudden-death') !== showSd) banner.classList.toggle('sudden-death', showSd);
  if (showSd) {
    app.suddenDeathBannerFrames--;
    if (vsSplash) vsSplash.hidden = true;
    banner.hidden = false;
    setStableText(banner, 'SUDDEN DEATH! 300%');
  } else if (match.status === 'intro') {
    const showVs = match.introTimer > 45 && match.fighters.length >= 2 && match.mode !== MODE.TARGETS;
    if (vsSplash) {
      vsSplash.hidden = !showVs;
      if (showVs) {
        const splashKey = `${match.stage.id}:${match.fighters.map((ft) => `${ft.fighterId}@${ft.paletteIndex}@${Math.round(ft.startPercent || 0)}`).join('|')}`;
        if (vsSplash.dataset.matchFrame !== splashKey) {
          vsSplash.dataset.matchFrame = splashKey;
          const p1 = match.fighters[0];
          const rivals = match.fighters.slice(1);
          renderer2d.drawPortrait($('vs-p1-canvas'), p1.def, p1.paletteIndex);
          const p1Pct = Math.round(p1.startPercent || 0);
          setStableText($('vs-p1-name'), p1Pct > 0 ? `${p1.def.name.toUpperCase()} (${p1Pct}%)` : p1.def.name.toUpperCase());

          const rightSide = vsSplash.querySelector('.vs-right');
          const p2Canvas = $('vs-p2-canvas');
          const p2Name = $('vs-p2-name');
          const oldExtra = rightSide?.querySelector('.vs-rivals-row');
          if (oldExtra) oldExtra.remove();
          if (rivals.length === 1) {
            p2Canvas.hidden = false;
            renderer2d.drawPortrait(p2Canvas, rivals[0].def, rivals[0].paletteIndex);
            const rPct = Math.round(rivals[0].startPercent || 0);
            setStableText(p2Name, rPct > 0 ? `${rivals[0].def.name.toUpperCase()} (${rPct}%)` : rivals[0].def.name.toUpperCase());
          } else if (rightSide) {
            p2Canvas.hidden = true;
            const row = document.createElement('div');
            row.className = 'vs-rivals-row';
            for (const rv of rivals) {
              const rc = document.createElement('canvas');
              rc.width = 96; rc.height = 96;
              rc.className = 'vs-mini-canvas';
              renderer2d.drawPortrait(rc, rv.def, rv.paletteIndex);
              row.appendChild(rc);
            }
            rightSide.insertBefore(row, p2Name);
            const labels = rivals.map((rv) => {
              const rPct = Math.round(rv.startPercent || 0);
              return rPct > 0 ? `${rv.def.name.toUpperCase()} (${rPct}%)` : rv.def.name.toUpperCase();
            });
            const unique = [...new Set(labels)];
            setStableText(p2Name, unique.length === 1 && rivals.length > 1
              ? `${rivals.length}× ${unique[0]}`
              : labels.join(' + '));
          }
        }
      }
    }
    banner.hidden = showVs;
    setStableText(banner, match.introTimer > 20 ? 'READY' : 'GO!');
  } else if (match.status === 'ended') {
    if (vsSplash) vsSplash.hidden = true;
    banner.hidden = false;
    const p1Won = match.winningTeam ? (match.fighters[0]?.team === match.winningTeam) : (match.winnerPort === 0);
    if (match.mode === MODE.TARGETS) {
      setStableText(banner, p1Won ? 'COMPLETE!' : 'FAILURE!');
    } else if (match.mode === EVENT_MODE()) {
      setStableText(banner, p1Won ? 'CLEAR!' : 'FAILURE!');
    } else if (match.mode === MODE.HOMERUN) {
      setStableText(banner, 'TIME!');
    } else {
      setStableText(banner, 'GAME!');
    }
  } else {
    if (vsSplash) vsSplash.hidden = true;
    banner.hidden = true;
  }

  // Dynamic clutch music intensity: Final Stock, Sudden Death, final 30s of timed match, or low-HP Boss
  let clutch = false;
  if (match.status === 'playing') {
    if (match.suddenDeath) {
      clutch = true;
    } else if ((match.timed || match.mode === MODE.VS_TIME) && match.mode !== MODE.HOMERUN && (match.timeLeftFrames || 0) > 0 && (match.timeLeftFrames || 0) <= 30 * 60) {
      clutch = true;
    } else if (match.mode === MODE.MULTIMAN && (match.multimanRemaining || 0) > 0 && (match.multimanRemaining || 0) <= 5) {
      clutch = true;
    } else if (match.mode === MODE.VS_STOCK || match.mode === MODE.CLASSIC || match.mode === MODE.ONLINE || match.mode === EVENT_MODE()) {
      const boss = match.fighters.find((ft) => ft.def.id === MASTER_MITT.id || (ft.bossMaxHp || 0) > 0);
      if (boss) {
        const maxHp = boss.bossMaxHp || 300;
        const curHp = Math.max(0, Math.ceil(boss.bossHp ?? (maxHp - (boss.percent || 0))));
        const p1 = match.fighters[0];
        if (curHp / maxHp <= 0.25 || (p1 && (p1.stocks || 0) === 1)) clutch = true;
      } else {
        const alive = match.fighters.filter((ft) => (ft.stocks || 0) > 0);
        const hasTeams = alive.some((ft) => ft.team);
        if (hasTeams) {
          const teams = new Set(alive.map((ft) => ft.team || `p${ft.port}`));
          if (teams.size === 2 && alive.every((ft) => ft.stocks === 1)) clutch = true;
        } else if (alive.length === 2 && alive[0].stocks === 1 && alive[1].stocks === 1) {
          clutch = true;
        }
      }
    }
  }
  const nextIntensity = clutch ? 1 : 0;
  if (nextIntensity !== app.lastMusicIntensity) {
    app.lastMusicIntensity = nextIntensity;
    sound.setIntensity?.(nextIntensity);
  }

  const reducedMotion = isReducedMotion();
  for (const ref of app.hudRefs) {
    const f = match.fighters.find((ft) => ft.port === ref.port);
    if (!f) continue;

    const isBoss = ref.isBoss || f.def.id === MASTER_MITT.id || (f.bossMaxHp || 0) > 0;
    const pct = Math.floor(f.percent);
    const dmgDelta = pct - ref.lastPct;
    if (dmgDelta > 0) {
      ref.shake = (app.shakeEnabled && !reducedMotion)
        ? Math.min(22, Math.max(6, Math.round(5 + dmgDelta * 0.85)))
        : 0;
      ref.pctFlash = 4;
    }
    ref.lastPct = pct;

    if (ref.shake > 0 && app.shakeEnabled && !reducedMotion) {
      ref.shake--;
      const pop = 1 + Math.min(0.34, ref.shake * 0.017);
      ref.card.style.transform = `translate(${(Math.random() - 0.5) * ref.shake * 1.6}px, ${(Math.random() - 0.5) * ref.shake * 1.6}px)`;
      ref.pctEl.style.transform = `scale(${pop.toFixed(2)})`;
    } else {
      ref.shake = 0;
      if (ref.card.style.transform) ref.card.style.transform = '';
      if (ref.pctEl.style.transform) ref.pctEl.style.transform = '';
    }

    if (isBoss) {
      const maxHp = f.bossMaxHp || 300;
      const curHp = Math.max(0, Math.ceil(f.bossHp ?? (maxHp - f.percent)));
      if (curHp !== ref.lastHp) {
        ref.lastHp = curHp;
        const ratio = Math.max(0, Math.min(1, curHp / maxHp));
        ref.pctEl.style.color = ratio <= 0.25 ? '#ff3b5c' : (ratio <= 0.55 ? '#ff9f43' : '#ffe15a');
        ref.pctEl.textContent = `${curHp} HP`;
        if (ref.bossFill) ref.bossFill.style.width = `${Math.round(ratio * 100)}%`;
      }
    } else {
      const pctText = `${pct}%`;
      const flashNow = (ref.pctFlash || 0) > 0;
      if (flashNow) ref.pctFlash--;
      if (ref.pctEl.textContent !== pctText || flashNow || ref.pctFlash === 0) {
        let col = '#ffffff';
        if (!flashNow) {
          if (pct >= 140) col = '#ff1f44';
          else if (pct >= 100) col = '#ff4d36';
          else if (pct >= 65) col = '#ff9636';
          else if (pct >= 35) col = '#ffe15a';
        }
        ref.pctEl.style.color = col;
        ref.pctEl.textContent = pctText;
        if (ref.pctFlash === 0) ref.pctFlash = -1;
      }

      const danger = pct >= 120;
      if (danger !== ref.isDanger) {
        ref.isDanger = danger;
        ref.pctEl.classList.toggle('danger', danger);
        ref.card.classList.toggle('hud-card-danger', danger);
      }

      if (match.mode === MODE.VS_TIME && ref.scorePill) {
        const teamScore = f.team
          ? match.fighters.filter((ft) => ft.team === f.team).reduce((acc, ft) => acc + ((ft.kos || 0) - (ft.falls || 0)), 0)
          : ((f.kos || 0) - (f.falls || 0));
        if (teamScore !== ref.lastScore) {
          ref.lastScore = teamScore;
          ref.scorePill.className = teamScore > 0 ? 'time-score-pill pos' : (teamScore < 0 ? 'time-score-pill neg' : 'time-score-pill');
          const signed = teamScore > 0 ? `+${teamScore}` : String(teamScore);
          ref.scorePill.textContent = f.team ? `TEAM ${signed}` : `SCORE ${signed}`;
        }
      } else if (ref.stockPips.length) {
        const showCount = Math.min(6, Math.max(0, f.stocks));
        if (showCount !== ref.lastStocks) {
          if (ref.lastStocks >= 0 && showCount < ref.lastStocks && !reducedMotion) {
            ref.lostPipIdx = showCount;
            ref.lostPipFrames = 24;
            ref.stockFlashFrames = 22;
            ref.card.classList.remove('stock-loss-flash');
            void ref.card.offsetWidth;
            ref.card.classList.add('stock-loss-flash');
          }
          ref.lastStocks = showCount;
          for (let i = 0; i < ref.stockPips.length; i++) {
            const isLostAnim = ref.lostPipFrames > 0 && i === ref.lostPipIdx;
            ref.stockPips[i].hidden = i >= showCount && !isLostAnim;
            ref.stockPips[i].classList.toggle('stock-lost', isLostAnim);
          }
        }
        if (ref.lostPipFrames > 0) {
          ref.lostPipFrames--;
          if (ref.lostPipFrames === 0 && ref.lostPipIdx >= 0) {
            const lostPip = ref.stockPips[ref.lostPipIdx];
            if (lostPip) {
              lostPip.classList.remove('stock-lost');
              lostPip.hidden = ref.lostPipIdx >= ref.lastStocks;
            }
            ref.lostPipIdx = -1;
          }
        }
      }
      if (ref.stockFlashFrames > 0) {
        ref.stockFlashFrames--;
        if (ref.stockFlashFrames === 0) ref.card.classList.remove('stock-loss-flash');
      }
    }

    // Active status buff mini-pills (METAL, BUNNY, STAR, GIANT, TINY, FROZEN)
    const buffs = [];
    if ((f.metalFrames || 0) > 0) buffs.push(['METAL', 'buff-metal', f.metalFrames < 90]);
    if ((f.bunnyFrames || 0) > 0) buffs.push(['BUNNY', 'buff-bunny', f.bunnyFrames < 90]);
    if ((f.starTimer || 0) > 0) buffs.push(['STAR', 'buff-star', f.starTimer < 90]);
    if ((f.giantTimer || 0) > 0 || f.permanentGiant) buffs.push(['GIANT', 'buff-giant', !f.permanentGiant && f.giantTimer < 90]);
    if ((f.tinyTimer || 0) > 0) buffs.push(['TINY', 'buff-tiny', f.tinyTimer < 90]);
    if ((f.freezeFrames || 0) > 0) buffs.push(['FROZEN', 'buff-frozen', f.freezeFrames < 30]);
    const buffKey = buffs.map(([lbl, , exp]) => (exp ? `${lbl}!` : lbl)).join('|');
    if (ref.buffsEl && buffKey !== ref.lastBuffKey) {
      ref.lastBuffKey = buffKey;
      ref.buffsEl.hidden = buffs.length === 0;
      ref.buffsEl.textContent = '';
      for (const [lbl, cls, exp] of buffs) {
        const pill = document.createElement('span');
        pill.className = exp ? `hud-buff-pill ${cls} expiring` : `hud-buff-pill ${cls}`;
        pill.textContent = lbl;
        ref.buffsEl.appendChild(pill);
      }
    }

    // Character-specific resource meter (Shriek needles, Mr. Beep Oil Panic, Charge Shot, Nana-Bot)
    let resText = '';
    let resReady = false;
    if (f.fighterId === 'shriek' && (f.needleCount || 0) > 0) {
      resText = f.needleCount >= 6 ? 'NEEDLES 6/6 MAX' : `NEEDLES ${f.needleCount}/6`;
      resReady = f.needleCount >= 6;
    } else if (f.fighterId === 'mr-beep-blob' && (f.bucketCount || 0) > 0) {
      resText = f.bucketCount >= 3 ? 'OIL 3/3 READY!' : `OIL ${f.bucketCount}/3`;
      resReady = f.bucketCount >= 3;
    } else if ((f.chargeShotLevel || 0) > 0.08 && f.fighterId !== 'shriek') {
      const pctCharge = Math.round(Math.min(1, f.chargeShotLevel) * 100);
      resText = pctCharge >= 98 ? 'CHARGE MAX!' : `CHARGE ${pctCharge}%`;
      resReady = pctCharge >= 98;
    } else if (f.fighterId === 'slush-shovelers') {
      resText = f.partnerKo ? 'NANA-BOT KO' : 'NANA-BOT ON';
      resReady = !f.partnerKo;
    }
    const resKey = `${resText}|${resReady ? 1 : 0}`;
    if (ref.resEl && resKey !== ref.lastRes) {
      ref.lastRes = resKey;
      ref.resEl.hidden = !resText;
      if (resText) {
        ref.resEl.textContent = resText;
        ref.resEl.className = resReady ? 'hud-resource ready' : 'hud-resource';
      }
    }

    const heldItem = f.heldItemId != null ? match.items?.find((it) => it.id === f.heldItemId) : null;
    const heldText = heldItem?.def?.name
      ? (heldItem.ammo != null
          ? `HOLD: ${heldItem.def.name} (${heldItem.ammo > 0 ? heldItem.ammo : 'EMPTY'})`
          : `HOLD: ${heldItem.def.name}`)
      : null;
    const comboHits = f.trueComboCount || f.comboCount || 0;
    const comboDmg = Math.round(f.comboDamage || 0);
    const activeCombo = comboHits >= 2;
    const comboText = activeCombo
      ? (comboDmg > 0 ? `${comboHits} HITS · ${comboDmg}%` : `${comboHits} HITS`)
      : (heldText || '');
    if (activeCombo && comboHits > (ref.lastComboCount || 0) && !reducedMotion) {
      ref.comboPopFrames = 14;
      ref.comboEl.classList.remove('combo-pop');
      void ref.comboEl.offsetWidth;
      ref.comboEl.classList.add('combo-pop');
    }
    ref.lastComboCount = activeCombo ? comboHits : 0;
    if (ref.comboPopFrames > 0) {
      ref.comboPopFrames--;
      if (ref.comboPopFrames === 0) ref.comboEl.classList.remove('combo-pop');
    }
    const comboStateKey = `${comboText}|${activeCombo ? (comboHits >= 5 ? 3 : comboHits >= 3 ? 2 : 1) : (heldText ? -1 : 0)}`;
    if (comboStateKey !== ref.lastCombo) {
      ref.lastCombo = comboStateKey;
      ref.comboEl.textContent = comboText;
      const popCls = ref.comboPopFrames > 0 ? ' combo-pop' : '';
      if (activeCombo) {
        ref.comboEl.className = comboHits >= 5
          ? `hud-combo active blazing${popCls}`
          : (comboHits >= 3 ? `hud-combo active hot${popCls}` : `hud-combo active${popCls}`);
      } else if (heldText) {
        ref.comboEl.className = 'hud-combo held';
      } else {
        ref.comboEl.className = 'hud-combo';
      }
    }
  }

  if (match.mode === MODE.TRAINING) {
    const tel = $('train-telemetry');
    const p1 = match.fighters[0];
    if (tel && p1) {
      const adv = Number.isFinite(p1.lastFrameAdv) ? Math.round(p1.lastFrameAdv) : null;
      const advStr = adv == null ? 'ADV --' : `ADV ${adv > 0 ? '+' : ''}${adv}f`;
      const hits = p1.comboCount || 0;
      const dmg = Math.round(p1.comboDamage || 0);
      const nextText = hits >= 2 ? `${advStr} • ${hits} HIT (${dmg}%)` : `${advStr} • ${hits} HIT`;
      setStableText(tel, nextText);
      const nextCls = adv == null ? 'train-telemetry' : (adv >= 0 ? 'train-telemetry pos' : 'train-telemetry neg');
      if (tel.className !== nextCls) tel.className = nextCls;
    }
  }
}

function openResults(match, abortReason = null) {
  const localPort = (match.mode === MODE.ONLINE && app.onlineSession)
    ? app.onlineSession.getStats().localPort
    : 0;
  const me = match.fighters.find((f) => f.port === localPort) || match.fighters[0];
  const isAborted = Boolean(abortReason);
  const isDraw = isAborted || (match.winnerPort == null && !match.winningTeam);
  const winner = isDraw ? null : (match.fighters.find((f) => f.port === match.winnerPort) || me);

  let kicker = isAborted ? 'ONLINE MATCH ENDED' : (isDraw ? 'NO CONTEST' : 'MATCH COMPLETE');
  let title = isAborted
    ? abortReason
    : isDraw
      ? 'DRAW!'
      : (match.winningTeam ? `${match.winningTeam.toUpperCase()} TEAM WINS!` : `${winner.def.name.toUpperCase()} WINS!`);
  let sub = isAborted
    ? 'No contest recorded. Return to the Online Lobby to reconnect.'
    : (isDraw ? `Simultaneous KO on ${match.stage.name}!` : `Stage: ${match.stage.name}`);
  let won = isDraw ? false : (match.winningTeam ? (me.team === match.winningTeam) : (match.winnerPort === localPort));
  if (match.mode === MODE.HOMERUN) won = Math.round(match.homerun?.maxDistanceFt || 0) > 0;
  app.lastMusicIntensity = 0;
  sound.setIntensity?.(0);
  sound.setMusic(won ? 'victory' : (isDraw ? 'draw' : 'defeat'));
  app.onlineMatchActive = false;
  app.onlineMenuOpen = false;
  let classicCleared = false;
  let nextBtnVisible = false;
  let nextBtnLabel = 'Next Classic Stage';
  let targetsTimeMs = 0;
  let multimanKos = 0;

  if (match.mode === EVENT_MODE()) {
    const ev = getEventById(match.eventId || app.selectedEventId);
    const evIdx = EVENTS.findIndex((e) => e.id === ev.id);
    kicker = won ? `EVENT #${ev.num} CLEARED!` : `EVENT #${ev.num} FAILED`;
    title = ev.title.toUpperCase();
    sub = won ? 'Bizarro Event complete!' : ev.subtitle;
    if (won) {
      if (!Array.isArray(app.records.clearedEvents)) app.records.clearedEvents = [];
      if (!app.records.clearedEvents.includes(ev.id)) app.records.clearedEvents.push(ev.id);
      if (evIdx >= 0 && evIdx < EVENTS.length - 1) {
        nextBtnVisible = true;
        nextBtnLabel = `Next Event (#${EVENTS[evIdx + 1].num})`;
      }
    }
  } else if (match.mode === MODE.HOMERUN) {
    const feet = Math.round(match.homerun?.maxDistanceFt || 0);
    kicker = 'HOME-RUN DERBY';
    title = `${feet.toLocaleString()} FT!`;
    sub = feet >= 1000 ? 'Sagging Bag just entered a new tax bracket!' : 'Grab the Home-Run Plunger & swing after racking up percent!';
    won = feet > 0;
    if (feet > app.records.homerunBest) app.records.homerunBest = feet;
  } else if (match.mode === MODE.TARGETS) {
    targetsTimeMs = Math.round(((match.targetTimeFrames || 0) / 60) * 1000);
    kicker = won ? 'TARGETS CLEARED!' : 'FAILED';
    title = won ? `${(targetsTimeMs / 1000).toFixed(2)} SECONDS!` : 'FELL OFF STAGE!';
    sub = won ? 'All 10 Bizarro targets obliterated.' : 'Try again and watch the lower moving target!';
    if (won && (!app.records.targetsBestMs || targetsTimeMs < app.records.targetsBestMs)) {
      app.records.targetsBestMs = targetsTimeMs;
    }
  } else if (match.mode === MODE.MULTIMAN) {
    multimanKos = match.multimanKos || me.kos || 0;
    kicker = won ? '25-INTERN BRAWL CLEARED!' : 'INTERN OVERLOAD';
    title = `${multimanKos} INTERNS KO'D!`;
    sub = won ? 'Human Resources has been notified.' : 'You were swarmed by low-poly unpaid interns.';
    if (multimanKos > app.records.multimanBest) app.records.multimanBest = multimanKos;
  } else if (match.mode === MODE.CLASSIC) {
    if (won) {
      const roundGain = 10000 + me.stocks * 2500 + me.kos * 1500;
      app.classicScore = app.classicRoundBaseScore + roundGain;
      const totalRounds = app.classicGauntlet?.length || 5;
      if (app.classicStep < totalRounds - 1) {
        kicker = `STAGE ${app.classicStep + 1} CLEARED`;
        nextBtnVisible = true;
        const nextRound = app.classicGauntlet[app.classicStep + 1];
        sub = `Score: ${app.classicScore.toLocaleString()} — Next up: ${getFighterById(nextRound.fighterId).name} (${nextRound.label})`;
      } else {
        kicker = 'CLASSIC ARCADE CHAMPION!';
        title = 'MASTER MITT DE-QUILTED!';
        if (!app.classicRunCleared) {
          classicCleared = true;
          app.classicRunCleared = true;
          app.records.classicClears++;
        }
        if (app.classicScore > app.records.classicBest) app.records.classicBest = app.classicScore;
        sub = `Final Score: ${app.classicScore.toLocaleString()}`;
      }
    } else {
      app.classicScore = app.classicRoundBaseScore;
      kicker = 'DEFEATED';
      sub = `Final Classic Score: ${app.classicScore.toLocaleString()}`;
    }
  }

  $('results-kicker').textContent = kicker;
  $('results-winner').textContent = title;
  $('results-sub').textContent = sub;
  $('btn-results-next').hidden = !nextBtnVisible;
  $('btn-results-next').textContent = nextBtnLabel;

  const cards = $('results-cards');
  cards.textContent = '';
  for (const f of match.fighters) {
    const isCardWinner = !isDraw && (match.winningTeam ? (f.team === match.winningTeam) : (f.port === match.winnerPort));
    const card = document.createElement('div');
    card.className = isCardWinner ? 'result-stat-card result-winner' : 'result-stat-card';
    card.style.borderColor = f.team ? (TEAM_COLORS[f.team] || PLAYER_COLORS[f.port % PLAYER_COLORS.length]) : PLAYER_COLORS[f.port % PLAYER_COLORS.length];
    const head = document.createElement('div');
    head.className = 'result-card-head';
    const pc = document.createElement('canvas');
    pc.width = 96; pc.height = 96;
    renderer2d.drawPortrait(pc, f.def, f.paletteIndex);
    const titleWrap = document.createElement('div');
    titleWrap.className = 'result-card-title';
    const h3 = document.createElement('h3');
    const sameName = String(f.name || '').trim().toUpperCase() === String(f.def.name || '').trim().toUpperCase();
    h3.textContent = (sameName || !f.name) ? f.def.name : `${f.def.name} (${f.name})`;
    titleWrap.appendChild(h3);
    if (isCardWinner) {
      const crown = document.createElement('span');
      crown.className = 'result-crown';
      crown.textContent = 'WINNER';
      titleWrap.appendChild(crown);
    }
    head.append(pc, titleWrap);
    const clanks = f.clankCount ?? f.clanks ?? app.matchClanks?.[f.port] ?? 0;
    const dl = document.createElement('dl');
    for (const [k, v] of [
      ['KOs', String(f.kos || 0)],
      ['Falls', String(f.falls || 0)],
      ['Damage', `${Math.round(f.damageDealt || 0)}%`],
      ['Max Combo', String(f.maxCombo || 0)],
      ['Wavedashes', String(f.wavedashCount || 0)],
      ['L-Cancels', String(f.lCancelCount || 0)],
      ['Clanks', String(clanks)],
    ]) {
      const pair = document.createElement('div');
      pair.className = 'result-stat-pair';
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      pair.append(dt, dd);
      dl.appendChild(pair);
    }
    card.append(head, dl);
    cards.appendChild(card);
  }

  if (!isAborted) {
    if (won) app.records.matchesWon++;
    app.records.kosScored += (me.kos || 0);
    app.records.wavedashes += (me.wavedashCount || 0);
    Promise.resolve(dpad.saveData(app.records, 'records')).then((res) => {
      if (match.mode === EVENT_MODE() && won && app.screen === 'results') {
        const durable = res && typeof res === 'object' ? Boolean(res.durable) : Boolean(res);
        $('results-sub').textContent = durable
          ? 'Bizarro Event complete! Progress saved.'
          : 'Bizarro Event complete! Cleared for this session (storage restricted).';
      }
    }).catch(() => {});
  }
  if ($('btn-results-rematch')) {
    const isOnline = match.mode === MODE.ONLINE && app.onlineSession;
    const onlineSt = dpad.getOnlineState();
    $('btn-results-rematch').hidden = Boolean(isAborted || (isOnline && (!onlineSt.connected || !onlineSt.isHost)));
    $('btn-results-rematch').textContent = isOnline ? 'Online Rematch' : 'Rematch';
  }
  if ($('btn-results-css')) {
    $('btn-results-css').textContent = match.mode === MODE.ONLINE
      ? 'Online Lobby'
      : (match.mode === EVENT_MODE() ? 'Event List' : 'Character Select');
  }
  if (!isAborted) {
    dpad.recordMatchResult({
      won,
      kos: me.kos || 0,
      wavedashes: me.wavedashCount || 0,
      sweetspotKo: !!(me.sweetspotKo || me.sweetspotKos || me.meteorKo || me.meteorKos || me.sweetspotKoScored),
      classicCleared,
      classicScore: match.mode === MODE.CLASSIC ? app.classicScore : 0,
      homerunFeet: match.mode === MODE.HOMERUN ? Math.round(match.homerun?.maxDistanceFt || 0) : 0,
      targetsTimeMs: won ? targetsTimeMs : 0,
      multimanKos,
    });
  }

  showScreen('results');
}

// ============================================================================
// 20XX TECH & COMBO FEED + LIVE CONTROLLER CONFIG & DIAGNOSTIC TESTER
// ============================================================================
function pushTechFeed(events) {
  if (!events || !events.length) return;
  for (const e of events) {
    if (e.type === 'suddenDeath') {
      app.suddenDeathBannerFrames = 110;
    }
  }
  if (!app.techFeedEnabled) return;
  const feed = $('hud-tech-feed');
  if (!feed) return;
  const seen = new Set();
  for (const e of events) {
    let label = null;
    let isCombo = false;
    if (e.type === 'comboCallout' && e.text) {
      label = `P${(e.port ?? 0) + 1} ${e.text}`;
      isCombo = true;
    } else if (e.type === 'doubleKo' || e.type === 'tripleKo' || e.type === 'zeroToDeath' || e.type === 'meteorKo') {
      label = `P${(e.port ?? 0) + 1} ${e.text || e.type.toUpperCase()}`;
      isCombo = true;
    } else if (e.type === 'suddenDeath') {
      label = 'SUDDEN DEATH! 300%';
      isCombo = true;
    } else if (e.type === 'stageTransform' && e.name) {
      label = `STAGE: ${e.name}`;
      isCombo = true;
    } else if (e.type === 'tech' && e.tech) {
      label = `P${(e.port ?? 0) + 1} ${e.tech}`;
    }
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const pill = document.createElement('div');
    pill.className = isCombo ? 'tech-pill combo' : 'tech-pill';
    pill.style.borderLeftColor = isCombo ? '#ffdf4d' : PLAYER_COLORS[(e.port ?? 0) % PLAYER_COLORS.length];
    pill.textContent = label;
    feed.prepend(pill);
    while (feed.children.length > 5) feed.lastElementChild.remove();
    setTimeout(() => pill.remove(), isCombo ? 2200 : 1400);
  }
}

const REBIND_ACTIONS = [
  ['attack', 'Attack (A)'],
  ['special', 'Special (B)'],
  ['jump', 'Jump (X/Y)'],
  ['shortHop', 'Short Hop'],
  ['shield', 'Hard Shield (L/R)'],
  ['lightShield', 'Light Shield'],
  ['grab', 'Grab (Z)'],
  ['taunt', 'Taunt'],
];

const PAD_REBINDABLE = new Set(['attack', 'special', 'jump', 'shield', 'grab', 'taunt']);

function syncControllerScreen() {
  app.lastTesterTabsKey = '';
  renderControllerPadTabs(input.getControllerDiagnostics?.().connectedPads || []);
  const cfg = input.getConfig ? input.getConfig() : { tapJump: true, zJump: false, cStickMode: 'smash', padProfile: 'auto', deadzone: 0.18, keyBinds: {}, padBinds: {} };
  if ($('sel-pad-profile')) $('sel-pad-profile').value = cfg.padProfile || 'auto';
  if ($('inp-tap-jump')) $('inp-tap-jump').checked = cfg.tapJump !== false;
  if ($('inp-z-jump')) $('inp-z-jump').checked = Boolean(cfg.zJump);
  if ($('sel-cstick-mode')) $('sel-cstick-mode').value = cfg.cStickMode || 'smash';
  if ($('inp-deadzone')) $('inp-deadzone').value = String(cfg.deadzone ?? 0.18);
  if ($('lbl-deadzone')) $('lbl-deadzone').textContent = Number(cfg.deadzone ?? 0.18).toFixed(2);
  if ($('inp-tech-feed')) $('inp-tech-feed').checked = app.techFeedEnabled;

  const list = $('ctrl-rebind-list');
  if (!list) return;
  list.textContent = '';
  const defaultPad = input.getDefaultPadBindings ? input.getDefaultPadBindings() : {};
  for (const [act, title] of REBIND_ACTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = app.rebindAction === act ? 'rebind-btn listening' : 'rebind-btn';
    const left = document.createElement('span'); left.textContent = title;
    const right = document.createElement('kbd');
    const keys = cfg.keyBinds?.[act];
    const displayKey = String(Array.isArray(keys) ? keys[0] : (keys || 'Default')).replace('Key', '');
    const pBind = cfg.padBinds?.[act];
    const effectivePad = (Array.isArray(pBind) && pBind.length) ? pBind : (PAD_REBINDABLE.has(act) ? defaultPad[act] : null);
    const padTag = Array.isArray(effectivePad) && effectivePad.length ? ` / B${effectivePad[0]}` : '';
    if (app.rebindAction === act) {
      right.textContent = PAD_REBINDABLE.has(act) ? 'Press key or btn...' : 'Press key...';
    } else {
      right.textContent = `${displayKey}${padTag}`;
    }
    btn.append(left, right);
    btn.addEventListener('click', () => {
      app.rebindAction = app.rebindAction === act ? null : act;
      input.syncMenuButtons?.();
      syncControllerScreen();
    });
    list.appendChild(btn);
  }
}

function renderControllerPadTabs(connectedPads) {
  const tabsEl = $('ctrl-pad-tabs');
  if (!tabsEl) return;
  const pads = Array.isArray(connectedPads) ? connectedPads : [];
  const activeIdx = pads.findIndex((p, idx) => (p.port >= 0 ? p.port : idx) === app.testerPadPort);
  if (pads.length && activeIdx === -1) {
    app.testerPadPort = pads[0].port >= 0 ? pads[0].port : 0;
  }
  const key = `${app.testerPadPort}|${pads.map((p, idx) => `${p.port >= 0 ? p.port : idx}:${p.index}`).join(',')}`;
  if (key === app.lastTesterTabsKey) return;
  app.lastTesterTabsKey = key;
  tabsEl.hidden = pads.length <= 1;
  tabsEl.textContent = '';
  if (pads.length <= 1) return;
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    const slot = p.port >= 0 ? p.port : i;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = slot === app.testerPadPort ? 'ctrl-pad-tab active' : 'ctrl-pad-tab';
    btn.dataset.padPort = String(slot);
    btn.textContent = `PAD ${slot + 1}`;
    btn.addEventListener('click', () => {
      sound.playUi('move');
      app.testerPadPort = slot;
      app.lastTesterTabsKey = '';
      renderControllerPadTabs(pads);
      drawControllerTester();
    });
    tabsEl.appendChild(btn);
  }
}

function drawControllerTester() {
  if (app.screen !== 'controller') return;
  const c = $('ctrl-tester');
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  ctx.clearRect(0, 0, w, h);

  const diag = input.getControllerDiagnostics ? input.getControllerDiagnostics() : { mode: 'keyboard', connectedPads: [] };
  const pads = diag.connectedPads || [];
  renderControllerPadTabs(pads);
  const pad = pads.find((p, idx) => (p.port >= 0 ? p.port : idx) === app.testerPadPort) || pads[0] || null;
  const badge = $('ctrl-pad-badge');
  if (badge) {
    const profLabel = pad?.profile === 'gamecube'
      ? 'GameCube'
      : pad?.profile === 'nintendo'
        ? 'Nintendo / Switch'
        : 'Standard (Xbox/PS)';
    const slotNum = pad ? ((pad.port >= 0 ? pad.port : 0) + 1) : 1;
    const multiPrefix = pads.length > 1 ? `PAD ${slotNum}/${pads.length} ` : 'Connected ';
    const autoNote = pads.length > 1 && slotNum > 1 ? ' • Auto-Detect' : '';
    badge.textContent = pad
      ? `${multiPrefix}[${profLabel}${autoNote}]: ${(pad.id || 'Controller').slice(0, 44)}`
      : 'No gamepad detected yet — press any button on your Bluetooth/USB controller to wake it!';
  }

  const liveEl = $('ctrl-live-actions');
  if (liveEl) {
    liveEl.textContent = '';
    const acts = pad?.actions || {};
    for (const [lbl, on] of [
      ['ATK', acts.attack], ['SPC', acts.special], ['JMP', acts.jump],
      ['SHLD', acts.shield && !acts.lightShield], ['L-SHLD', acts.lightShield],
      ['GRAB', acts.grab], ['TAUNT', acts.taunt], ['START', acts.pause],
    ]) {
      const pill = document.createElement('span');
      pill.className = on ? 'ctrl-act-pill active' : 'ctrl-act-pill';
      pill.textContent = lbl;
      liveEl.appendChild(pill);
    }
    const rawPill = document.createElement('span');
    rawPill.className = 'ctrl-act-pill raw';
    rawPill.textContent = pad?.pressedButtons?.length ? `BTN: [${pad.pressedButtons.join(',')}]` : 'BTN: --';
    liveEl.appendChild(rawPill);
    if (pad?.rawAxes?.length) {
      const axesPill = document.createElement('span');
      axesPill.className = 'ctrl-act-pill raw';
      axesPill.textContent = `C-STICK: (${(pad.cStickX || 0).toFixed(2)}, ${(pad.cStickY || 0).toFixed(2)})`;
      liveEl.appendChild(axesPill);
      const rawAxesPill = document.createElement('span');
      rawAxesPill.className = 'ctrl-act-pill raw';
      rawAxesPill.textContent = `AXES: [${pad.rawAxes.slice(0, 6).map((v) => v.toFixed(1)).join(',')}]`;
      liveEl.appendChild(rawAxesPill);
    }
  }

  const drawStick = (cx, cy, r, x, y, label, col) => {
    ctx.strokeStyle = 'rgba(124,232,255,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx + x * (r - 7), cy - y * (r - 7), 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a8b3d6'; ctx.font = '800 10px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + r + 15);
  };

  drawStick(68, 66, 44, pad?.moveX || 0, pad?.moveY || 0, 'MAIN STICK', '#38f5ff');
  drawStick(176, 66, 44, pad?.cStickX || 0, pad?.cStickY || 0, 'C-STICK', '#ffdf4d');

  // Analog L & R Light-Shield vs Hard-Shield trigger bars
  const drawTrig = (x, val, lbl) => {
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x, 22, 22, 88);
    const fillH = Math.round(Math.max(0, Math.min(1, val || 0)) * 88);
    ctx.fillStyle = val >= 0.78 ? '#ff4b72' : (val >= 0.18 ? '#38f5ff' : '#64748b');
    ctx.fillRect(x, 110 - fillH, 22, fillH);
    ctx.strokeStyle = '#ffdf4d'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - 2, 110 - 88 * 0.78); ctx.lineTo(x + 24, 110 - 88 * 0.78); ctx.stroke();
    ctx.fillStyle = '#a8b3d6'; ctx.font = '800 10px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(lbl, x + 11, 125);
  };
  drawTrig(246, pad?.lAnalog || 0, 'L');
  drawTrig(280, pad?.rAnalog || 0, 'R');
}

// ============================================================================
// CONSOLE-GRADE GAMEPAD MENU NAVIGATION (ALL SCREENS)
// ============================================================================
function getActiveScreenEl() {
  const id = SCREEN_EL_MAP[app.screen];
  return id ? $(id) : null;
}

function getFocusableInActiveScreen() {
  const root = getActiveScreenEl();
  if (!root || root.hidden) return [];
  const all = root.querySelectorAll('button, select, input[type="checkbox"], input[type="range"]');
  return Array.from(all).filter((el) => {
    if (el.disabled || el.hidden) return false;
    if (el.offsetParent === null) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 4 && rect.height > 4;
  });
}

function clearPadFocus() {
  if (app.padFocusEl) {
    app.padFocusEl.classList.remove('pad-focus');
    app.padFocusEl = null;
  }
}

function setPadFocus(el) {
  if (!el) return;
  if (app.padFocusEl && app.padFocusEl !== el) {
    app.padFocusEl.classList.remove('pad-focus');
  }
  app.padFocusEl = el;
  el.classList.add('pad-focus');
  try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch {}
  if (el.classList.contains('css-tile') && el.dataset.fighterId) {
    renderBioPanel(getFighterById(el.dataset.fighterId), 0);
  }
}

function focusDefaultForScreen(screenName = app.screen) {
  const root = getActiveScreenEl();
  if (!root) return null;
  const sel = SCREEN_DEFAULT_FOCUS[screenName];
  const candidate = sel ? root.querySelector(sel) : null;
  const list = getFocusableInActiveScreen();
  const target = (candidate && list.includes(candidate)) ? candidate : list[0];
  if (target) setPadFocus(target);
  return target || null;
}

function movePadFocus(dir) {
  const list = getFocusableInActiveScreen();
  if (!list.length) return;
  if (!app.padFocusEl || !list.includes(app.padFocusEl)) {
    focusDefaultForScreen();
    sound.playUi('move');
    return;
  }
  const cur = app.padFocusEl;
  const cr = cur.getBoundingClientRect();
  const cx = cr.left + cr.width * 0.5;
  const cy = cr.top + cr.height * 0.5;

  let best = null;
  let bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect();
    const dx = (r.left + r.width * 0.5) - cx;
    const dy = (r.top + r.height * 0.5) - cy;
    let primary = 0;
    let perp = 0;
    if (dir === 'right') { if (dx <= 6) continue; primary = dx; perp = Math.abs(dy); }
    else if (dir === 'left') { if (dx >= -6) continue; primary = -dx; perp = Math.abs(dy); }
    else if (dir === 'down') { if (dy <= 6) continue; primary = dy; perp = Math.abs(dx); }
    else if (dir === 'up') { if (dy >= -6) continue; primary = -dy; perp = Math.abs(dx); }
    const score = primary + perp * 2.4;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (!best) {
    const idx = list.indexOf(cur);
    const step = (dir === 'right' || dir === 'down') ? 1 : -1;
    best = list[(idx + step + list.length) % list.length];
  }
  if (best && best !== cur) {
    setPadFocus(best);
    sound.playUi('move');
  }
}

function cycleSelectOption(sel, delta) {
  const opts = Array.from(sel.options).filter((o) => !o.disabled);
  if (!opts.length) return;
  const curIdx = Math.max(0, opts.findIndex((o) => o.value === sel.value));
  const next = opts[(curIdx + delta + opts.length) % opts.length];
  sel.value = next.value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  sound.playUi('move');
}

function nudgeRangeInput(inp, delta) {
  const step = Number(inp.step) || 0.05;
  const min = Number(inp.min);
  const max = Number(inp.max);
  const cur = Number(inp.value) || 0;
  const next = Math.max(min, Math.min(max, Math.round((cur + delta * step) * 1000) / 1000));
  if (next !== cur) {
    inp.value = String(next);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    sound.playUi('move');
  }
}

function updatePadHintBar(connected, padName = '', padCount = 0) {
  const bar = $('pad-hint-bar');
  if (!bar) return;
  const show = connected && app.screen !== 'match';
  bar.hidden = !show;
  if (!show) return;
  const hints = {
    title: 'Stick / D-Pad: Move  •  A: Select  •  Start: Quick Fight',
    css: padCount > 1
      ? 'Each Pad Picks Own Fighter!  •  Stick: Move  •  A: Lock  •  B: Cancel  •  X/Y: Alt  •  Sel: Random  •  Start: Fight'
      : 'Stick: Move Token  •  A: Lock In  •  B: Back  •  X/Y: Alt  •  Sel: Random  •  LB/RB: Port  •  Start: Stage',
    stage: 'Stick / D-Pad: Browse  •  A: Fight  •  B: Fighters  •  X/Y: Random  •  LB/RB: Filter',
    events: 'Stick / D-Pad: Browse  •  A: Launch Event  •  B: Title',
    controller: padCount > 1
      ? 'Stick / D-Pad: Navigate  •  LB/RB: Switch Pad  •  A: Toggle / Rebind  •  B: Back'
      : 'Stick / D-Pad: Navigate  •  A: Toggle / Rebind  •  Left/Right: Adjust  •  B: Back',
    pause: 'Stick / D-Pad: Move  •  A: Select  •  B / Start: Resume',
    results: 'Stick / D-Pad: Move  •  A: Select  •  Start: Rematch  •  B: Title',
  };
  const label = padCount > 1
    ? `${padCount} Pads  •  `
    : (padName ? `${padName.split('(')[0].trim()}  •  ` : '');
  bar.textContent = `${label}${hints[app.screen] || 'Stick / D-Pad: Move  •  A: Select  •  B: Back'}`;
}

function handleGamepadMenus() {
  if (app.screen === 'match') {
    updatePadHintBar(false);
    return;
  }
  const nav = input.pollMenu ? input.pollMenu() : { connected: false, keyboardActive: false };
  const padKey = Array.isArray(nav.padPorts) ? nav.padPorts.join(',') : '';
  if (padKey !== app.lastObservedPadKey) {
    app.lastObservedPadKey = padKey;
    if (app.screen === 'css') {
      syncConnectedControllersToCss(true);
      syncCssSelection();
    } else if (app.screen === 'controller') {
      app.lastTesterTabsKey = '';
      syncControllerScreen();
    }
  }
  updatePadHintBar(Boolean(nav.connected), nav.padName || '', nav.padCount || 0);
  if (!nav.connected && !nav.keyboardActive) return;
  if (!app.padFocusEl || !getFocusableInActiveScreen().includes(app.padFocusEl)) {
    focusDefaultForScreen();
  }

  // 1-click Gamepad Button Rebinding inside Controller Config
  if (app.screen === 'controller' && app.rebindAction && nav.rawPressed?.length) {
    const act = app.rebindAction;
    if (PAD_REBINDABLE.has(act)) {
      const cfg = input.getConfig?.() || {};
      const pressedBtn = nav.rawPressedByPort?.[app.testerPadPort]?.[0] ?? nav.rawPressedByPort?.[0]?.[0] ?? nav.rawPressed[0];
      const nextPadBinds = { ...(cfg.padBinds || {}), [act]: [pressedBtn] };
      input.setConfig?.({ padBinds: nextPadBinds });
      dpad.saveData(input.getConfig(), 'controller');
      sound.playUi('select');
    }
    app.rebindAction = null;
    input.syncMenuButtons?.();
    syncControllerScreen();
    return;
  }

  if (app.screen === 'controller' && (nav.lb || nav.rb) && (nav.padCount || 0) > 1) {
    const diag = input.getControllerDiagnostics?.();
    const pads = diag?.connectedPads || [];
    if (pads.length > 1) {
      const slots = pads.map((p, idx) => (p.port >= 0 ? p.port : idx));
      const curIdx = Math.max(0, slots.indexOf(app.testerPadPort));
      app.testerPadPort = slots[(curIdx + (nav.rb ? 1 : slots.length - 1)) % slots.length];
      app.lastTesterTabsKey = '';
      sound.playUi('move');
      renderControllerPadTabs(pads);
      drawControllerTester();
      return;
    }
  }

  if (app.screen === 'css' && nav.connected && Array.isArray(nav.perPort)) {
    const isVs = app.selectedMode === MODE.VS_STOCK || app.selectedMode === MODE.VS_TIME;
    const cols = getCssGridColumns();
    const totalTiles = ROSTER.length;
    const multiPad = (nav.padCount || 0) >= 2 && isVs;
    let changed = false;
    let lastBioDef = null;
    let lastBioPal = 0;

    // Map each physical pad slot (0..3) directly to its corresponding CSS player port (P1..P4).
    for (let padSlot = 0; padSlot < 4; padSlot++) {
      const act = nav.perPort[padSlot];
      if (!act) continue;
      const anyAct = act.up || act.down || act.left || act.right || act.confirm || act.back || act.alt || act.start || act.lb || act.rb || act.select;
      if (!anyAct) continue;

      sound.unlock();
      if (act.start) {
        const btn = $('btn-css-start');
        if (btn && !btn.disabled) btn.click();
        return;
      }

      // In non-VS 1P modes or Online, only Pad 1 controls CSS.
      if (!isVs && padSlot > 0) continue;

      // In VS Mode, pressing any action on Pad 2/3/4 auto-joins that port as Human without manual switching!
      if (isVs && padSlot > 0) {
        if (app.playerCount <= padSlot) {
          app.playerCount = padSlot + 1;
          app.manualPlayerCount = false;
          if ($('sel-player-count')) $('sel-player-count').value = String(app.playerCount);
          changed = true;
        }
        if (app.ports[padSlot]?.isCpu) {
          app.ports[padSlot].isCpu = false;
          app.ports[padSlot].manualCpu = false;
          app.ports[padSlot].name = `P${padSlot + 1}`;
          changed = true;
        }
      }

      const count = visibleCssPortCount();
      // Solo 1-pad user can still use LB/RB to pick for CPU ports; multi-pad users each control their own port 0..3!
      const targetPort = multiPad ? padSlot : (padSlot === 0 ? app.activeCssPort : padSlot);
      if (targetPort >= count) continue;

      const p = app.ports[targetPort];
      const cur = app.cssCursors[targetPort] || (app.cssCursors[targetPort] = { index: 0, locked: false });

      if (act.lb || act.rb) {
        if (isVs && app.teamBattle) {
          p.team = TEAM_ORDER[(TEAM_ORDER.indexOf(p.team || 'red') + (act.rb ? 1 : TEAM_ORDER.length - 1)) % TEAM_ORDER.length];
          sound.playUi('move');
          changed = true;
        } else if (!multiPad && padSlot === 0) {
          app.activeCssPort = (app.activeCssPort + (act.rb ? 1 : count - 1)) % count;
          app.cssPortManualByP1 = true;
          const nextPort = app.ports[app.activeCssPort];
          if (nextPort) {
            lastBioDef = getFighterById(nextPort.fighterId);
            lastBioPal = nextPort.paletteIndex || 0;
          }
          sound.playUi('move');
          changed = true;
        }
        continue;
      }

      if (act.alt) {
        const def = getFighterById(p.fighterId);
        if (def?.palettes?.length) {
          p.paletteIndex = (p.paletteIndex + 1) % def.palettes.length;
          if (targetPort === 0 && app.onlineSession && !app.onlineSession.getStats().isHost) {
            app.onlineSession.sendGuestPick(p.fighterId, p.paletteIndex);
          }
          sound.playUi('move');
          lastBioDef = def;
          lastBioPal = p.paletteIndex;
          changed = true;
        }
        continue;
      }

      if (act.back) {
        if (cur.locked) {
          cur.locked = false;
          sound.playUi('back');
          changed = true;
        } else if (padSlot === 0) {
          $('btn-css-back')?.click();
          return;
        }
        continue;
      }

      if (act.select && !cur.locked) {
        let randIdx = Math.floor(Math.random() * totalTiles);
        if (totalTiles > 1 && randIdx === cur.index) randIdx = (randIdx + 1) % totalTiles;
        cur.index = randIdx;
        const def = ROSTER[randIdx];
        if (def) {
          p.fighterId = def.id;
          p.paletteIndex = Math.floor(Math.random() * (def.palettes?.length || 4));
          if (targetPort === 0 && app.onlineSession && !app.onlineSession.getStats().isHost) {
            app.onlineSession.sendGuestPick(p.fighterId, p.paletteIndex);
          }
          lastBioDef = def;
          lastBioPal = p.paletteIndex;
        }
        sound.playUi('move');
        if (app.rumbleEnabled) input.rumblePort?.(padSlot, { weak: 0.2, strong: 0.1, durationMs: 45 });
        changed = true;
        const tileEl = $('css-grid')?.children?.[randIdx];
        try { tileEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch {}
        continue;
      }

      if (act.confirm) {
        if (!cur.locked) {
          const def = ROSTER[cur.index % totalTiles];
          if (def) {
            p.fighterId = def.id;
            if (targetPort === 0 && app.onlineSession && !app.onlineSession.getStats().isHost) {
              app.onlineSession.sendGuestPick(p.fighterId, p.paletteIndex);
            }
            lastBioDef = def;
            lastBioPal = p.paletteIndex;
          }
          cur.locked = true;
          sound.playUi('select');
          if (app.rumbleEnabled) input.rumblePort?.(padSlot, { weak: 0.3, strong: 0.25, durationMs: 65 });
          changed = true;
        }
        continue;
      }

      if (!cur.locked && (act.up || act.down || act.left || act.right)) {
        let next = cur.index;
        if (act.left) next = (cur.index - 1 + totalTiles) % totalTiles;
        else if (act.right) next = (cur.index + 1) % totalTiles;
        else if (act.up) next = (cur.index - cols + totalTiles) % totalTiles;
        else if (act.down) next = (cur.index + cols) % totalTiles;
        cur.index = next;
        const def = ROSTER[next];
        if (def) {
          p.fighterId = def.id;
          p.paletteIndex = p.paletteIndex % (def.palettes?.length || 4);
          if (targetPort === 0 && app.onlineSession && !app.onlineSession.getStats().isHost) {
            app.onlineSession.sendGuestPick(p.fighterId, p.paletteIndex);
          }
          lastBioDef = def;
          lastBioPal = p.paletteIndex;
        }
        sound.playUi('move');
        changed = true;
        const tileEl = $('css-grid')?.children?.[next];
        try { tileEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch {}
      }
    }

    if (lastBioDef) renderBioPanel(lastBioDef, lastBioPal);
    if (changed) syncCssSelection();
    if (!nav.keyboardActive) return;
  }

  // Context-sensitive shoulder / shortcut buttons
  if (nav.back) {
    sound.unlock();
    if (app.screen === 'pause') { togglePause(false); return; }
    if (app.screen === 'results') { $('btn-results-title')?.click(); return; }
    const backSel = SCREEN_BACK_BTN[app.screen];
    if (backSel) { $(backSel.slice(1))?.click(); return; }
  }

  if (nav.start) {
    sound.unlock();
    if (app.screen === 'pause') { togglePause(false); return; }
    if (app.screen === 'css') {
      const btn = $('btn-css-start');
      if (btn && !btn.disabled) btn.click();
      return;
    }
    if (app.screen === 'results') { $('btn-results-rematch')?.click(); return; }
    if (app.screen === 'title') {
      (app.padFocusEl && app.padFocusEl.tagName === 'BUTTON' ? app.padFocusEl : $('btn-quick-fight'))?.click();
      return;
    }
  }

  if (app.screen === 'css' && (nav.lb || nav.rb)) {
    const count = visibleCssPortCount();
    app.activeCssPort = (app.activeCssPort + (nav.rb ? 1 : count - 1)) % count;
    app.cssPortManualByP1 = true;
    sound.playUi('move');
    syncCssSelection();
    return;
  }
  if (app.screen === 'css' && Number.isInteger(nav.sourcePort) && nav.sourcePort >= 0) {
    const count = visibleCssPortCount();
    if (nav.sourcePort > 0 && nav.sourcePort < count && !app.ports[nav.sourcePort]?.isCpu) {
      if (app.activeCssPort !== nav.sourcePort) {
        app.activeCssPort = nav.sourcePort;
        app.cssPortManualByP1 = false;
        syncCssSelection();
      }
    } else if (nav.sourcePort === 0 && !app.cssPortManualByP1 && app.activeCssPort !== 0) {
      app.activeCssPort = 0;
      syncCssSelection();
    }
  }
  if (app.screen === 'css' && nav.alt) {
    const p = app.ports[app.activeCssPort];
    const def = getFighterById(p.fighterId);
    if (def?.palettes?.length) {
      p.paletteIndex = (p.paletteIndex + 1) % def.palettes.length;
      if (app.activeCssPort === 0 && app.onlineSession && !app.onlineSession.getStats().isHost) {
        app.onlineSession.sendGuestPick(p.fighterId, p.paletteIndex);
      }
      sound.playUi('move');
      renderBioPanel(def, p.paletteIndex);
      syncCssSelection();
    }
    return;
  }
  if (app.screen === 'stage' && (nav.lb || nav.rb)) {
    const tabs = Array.from(document.querySelectorAll('[data-stage-cat]'));
    const curIdx = Math.max(0, tabs.findIndex((b) => b.dataset.stageCat === app.stageFilterCat));
    const next = tabs[(curIdx + (nav.rb ? 1 : tabs.length - 1)) % tabs.length];
    if (next) { next.click(); focusDefaultForScreen('stage'); }
    return;
  }
  if (app.screen === 'stage' && nav.alt) {
    $('btn-stage-random')?.click();
    return;
  }
  if (app.screen === 'records' && (nav.lb || nav.rb)) {
    const tabs = Array.from(document.querySelectorAll('[data-board]'));
    const curIdx = Math.max(0, tabs.findIndex((b) => b.classList.contains('btn-accent')));
    const next = tabs[(curIdx + (nav.rb ? 1 : tabs.length - 1)) % tabs.length];
    if (next) next.click();
    return;
  }

  // Handle left/right directly on focused <select> or <input type="range">
  const cur = app.padFocusEl;
  if (cur && getFocusableInActiveScreen().includes(cur)) {
    if (cur.tagName === 'SELECT' && (nav.left || nav.right)) {
      cycleSelectOption(cur, nav.right ? 1 : -1);
      return;
    }
    if (cur.tagName === 'INPUT' && cur.type === 'range' && (nav.left || nav.right)) {
      nudgeRangeInput(cur, nav.right ? 1 : -1);
      return;
    }
  }

  if (nav.up) movePadFocus('up');
  else if (nav.down) movePadFocus('down');
  else if (nav.left) movePadFocus('left');
  else if (nav.right) movePadFocus('right');

  if (nav.confirm) {
    sound.unlock();
    const target = (app.padFocusEl && getFocusableInActiveScreen().includes(app.padFocusEl))
      ? app.padFocusEl
      : focusDefaultForScreen();
    if (!target) return;
    if (target.tagName === 'SELECT') {
      cycleSelectOption(target, 1);
    } else if (target.tagName === 'INPUT' && target.type === 'checkbox') {
      target.checked = !target.checked;
      target.dispatchEvent(new Event('change', { bubbles: true }));
      sound.playUi('select');
    } else {
      target.click();
    }
  }
}

// ============================================================================
// ONLINE & RECORDS UI
// ============================================================================
const VALID_ONLINE_FIGHTERS = ROSTER.map((f) => f.id);
const VALID_ONLINE_STAGES = STAGES.map((s) => s.id);

function abortOnlineMatch(reason = 'OPPONENT DISCONNECTED') {
  if (!app.match || app.match.mode !== MODE.ONLINE) return;
  app.onlineMatchActive = false;
  app.onlineReconnecting = false;
  app.onlineReconnectFrames = 0;
  app.onlineMenuOpen = false;
  app.onlineSession?.stop();
  app.match.status = 'ended';
  app.match.winnerPort = null;
  app.match.winningTeam = null;
  openResults(app.match, reason);
  refreshOnlineUi();
}

function ensureOnlineSession() {
  const st = dpad.getOnlineState();
  if (!st.inLobby) {
    app.onlineSession?.stop();
    app.onlineSession = null;
    app.onlineReconnecting = false;
    return null;
  }
  if (!st.connected) {
    // Keep the session alive during brief P2P_PEER_RECONNECTING windows so matches can resume cleanly.
    if (app.onlineReconnecting && app.onlineSession) return app.onlineSession;
    app.onlineSession?.stop();
    app.onlineSession = null;
    return null;
  }
  if (app.onlineSession && app.onlineSession.getStats().isHost === Boolean(st.isHost)) {
    return app.onlineSession;
  }
  app.onlineSession?.stop();
  app.onlineSession = createOnlineSession({
    isHost: Boolean(st.isHost),
    delayFrames: 'auto',
    validFighterIds: VALID_ONLINE_FIGHTERS,
    validStageIds: VALID_ONLINE_STAGES,
    send: (ch, payload, reliable) => dpad.sendP2P(ch, payload, reliable),
    onPeerPick: (pick) => {
      app.onlineGuestPick = pick;
    },
    onPeerLeave: () => {
      if (app.match?.mode === MODE.ONLINE && app.onlineMatchActive) {
        abortOnlineMatch('OPPONENT LEFT MATCH');
      }
    },
    onConfigReady: (cfg) => {
      app.selectedMode = MODE.ONLINE;
      app.selectedStageId = cfg.stageId;
      launchConfiguredMatch(cfg);
      refreshOnlineUi();
    },
    onDesync: ({ frame }) => {
      if (app.match?.mode === MODE.ONLINE && app.onlineMatchActive) {
        abortOnlineMatch(`SYNC ERROR @ F${frame}`);
      }
    },
  });
  if (!st.isHost) {
    app.onlineSession.sendGuestPick(app.ports[0].fighterId, app.ports[0].paletteIndex);
  }
  return app.onlineSession;
}

function refreshOnlineUi() {
  const st = dpad.getOnlineState();
  const sess = ensureOnlineSession();
  const net = sess?.getStats();
  $('online-status').textContent = net?.handshaking
    ? 'Syncing match seed & rules with opponent...'
    : st.statusText;
  $('btn-lobby-leave').hidden = !st.inLobby;
  $('online-invite-wrap').hidden = !st.inviteLink;
  if (st.inviteLink) $('online-invite-link').value = st.inviteLink;

  const metaEl = $('online-net-meta');
  if (metaEl) {
    metaEl.hidden = !st.inLobby;
    if (st.inLobby) {
      const role = st.isHost ? 'HOST (P1)' : 'GUEST (P2)';
      const syncLbl = net ? `${net.delayFrames}f Delay • ${net.syncState.toUpperCase()}` : 'Waiting for P2P';
      metaEl.textContent = `${role} • Lockstep ${syncLbl}`;
    }
  }

  const peersEl = $('online-peers');
  peersEl.textContent = '';
  for (const peer of st.peers || []) {
    const row = document.createElement('div');
    row.className = 'lb-row';
    const n = document.createElement('span'); n.textContent = peer.username || 'Player';
    const r = document.createElement('span'); r.textContent = peer.isHost ? 'HOST' : 'READY';
    row.append(n, r);
    peersEl.appendChild(row);
  }
  const canLaunch = Boolean(st.inLobby && st.connected && (st.peers?.length || 0) >= 1 && st.isHost);
  $('btn-online-launch').hidden = !canLaunch;
}

async function openRecordsBoard(boardId = 'homerun-distance') {
  const sum = $('records-summary');
  sum.textContent = '';
  for (const [lbl, val] of [
    ['Matches Won', app.records.matchesWon],
    ['Career KOs', app.records.kosScored],
    ['Wavedashes', app.records.wavedashes],
    ['Best Targets', app.records.targetsBestMs ? `${(app.records.targetsBestMs / 1000).toFixed(2)}s` : '--'],
    ['Best Multi-Man', `${app.records.multimanBest} KOs`],
    ['Best Home-Run', `${app.records.homerunBest} ft`],
  ]) {
    const box = document.createElement('div'); box.className = 'rec-box';
    const v = document.createElement('div'); v.className = 'rec-val'; v.textContent = String(val);
    const l = document.createElement('div'); l.className = 'rec-lbl'; l.textContent = lbl;
    box.append(v, l);
    sum.appendChild(box);
  }

  for (const b of document.querySelectorAll('[data-board]')) {
    b.classList.toggle('btn-accent', b.dataset.board === boardId);
    b.classList.toggle('btn-ghost', b.dataset.board !== boardId);
  }

  const list = $('leaderboard-list');
  list.textContent = 'Loading rankings...';
  const entries = await dpad.getLeaderboard(boardId, 10);
  list.textContent = '';
  if (!entries || !entries.length) {
    const empty = document.createElement('div');
    empty.className = 'note-box';
    empty.textContent = 'No scores posted yet. Play a match or sign in on dpad.games to rank!';
    list.appendChild(empty);
    return;
  }
  for (const e of entries) {
    const row = document.createElement('div'); row.className = 'lb-row';
    const left = document.createElement('span'); left.textContent = `#${e.rank} ${e.name}`;
    const right = document.createElement('strong'); right.textContent = String(e.score);
    row.append(left, right);
    list.appendChild(row);
  }
}

// ============================================================================
// MULTI-TOUCH CONTROLS WIRING
// ============================================================================
function wireTouchControls() {
  const zone = $('touch-stick-zone');
  const knob = $('touch-stick-knob');
  let stickId = null, originX = 0, originY = 0;
  const maxDist = 42;

  let touchStickX = 0, touchStickY = 0;

  function resetStick() {
    stickId = null;
    touchStickX = 0;
    touchStickY = 0;
    knob.style.transform = 'translate(0px, 0px)';
    input.setTouchState({ moveX: 0, moveY: 0 });
  }
  function updateStick(cx, cy) {
    let dx = cx - originX, dy = cy - originY;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    touchStickX = dx / maxDist;
    touchStickY = -dy / maxDist;
    input.setTouchState({ moveX: touchStickX, moveY: touchStickY });
  }

  zone.addEventListener('pointerdown', (e) => {
    sound.unlock();
    zone.setPointerCapture(e.pointerId);
    stickId = e.pointerId;
    const rect = zone.getBoundingClientRect();
    originX = rect.left + rect.width / 2;
    originY = rect.top + rect.height / 2;
    updateStick(e.clientX, e.clientY);
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) updateStick(e.clientX, e.clientY); });
  zone.addEventListener('pointerup', (e) => { if (e.pointerId === stickId) resetStick(); });
  zone.addEventListener('pointercancel', (e) => { if (e.pointerId === stickId) resetStick(); });

  for (const btn of document.querySelectorAll('.touch-btn')) {
    const key = btn.dataset.touch;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sound.unlock();
      btn.setPointerCapture(e.pointerId);
      btn.classList.add('pressed');
      if (key === 'smash') {
        const mag = Math.hypot(touchStickX, touchStickY);
        if (mag >= 0.25) {
          input.setTouchState({ cStickX: touchStickX / mag, cStickY: touchStickY / mag });
        } else {
          const facing = app.match?.fighters?.[0]?.facing || 1;
          input.setTouchState({ cStickX: facing, cStickY: 0 });
        }
      } else {
        input.setTouchState({ [key]: true });
      }
    });
    const release = () => {
      btn.classList.remove('pressed');
      if (key === 'smash') {
        input.setTouchState({ cStickX: 0, cStickY: 0 });
      } else {
        input.setTouchState({ [key]: false });
      }
    };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
  }
}

// ============================================================================
// UI EVENT LISTENERS
// ============================================================================
function wireUi() {
  const unlockOnce = () => sound.unlock();
  window.addEventListener('pointerdown', (e) => {
    unlockOnce();
    clearPadFocus();
    if (e.pointerType === 'touch') { app.seenPhysicalKey = false; updateTouchVisibility(); }
  }, { passive: true });
  window.addEventListener('keydown', () => {
    unlockOnce();
    app.seenPhysicalKey = true;
    updateTouchVisibility();
  }, { passive: true });

  $('btn-quick-fight').addEventListener('click', () => {
    sound.unlock(); sound.playUi('start');
    app.selectedMode = MODE.VS_STOCK;
    app.teamBattle = false;
    app.playerCount = 2;
    app.manualPlayerCount = false;
    app.stocks = 4;
    app.itemFrequency = ITEM_FREQUENCY.MEDIUM;
    if ($('sel-vs-rule')) $('sel-vs-rule').value = MODE.VS_STOCK;
    if ($('sel-battle-type')) $('sel-battle-type').value = 'ffa';
    if ($('sel-player-count')) $('sel-player-count').value = '2';
    if ($('sel-stocks')) $('sel-stocks').value = '4';
    if ($('sel-items')) $('sel-items').value = ITEM_FREQUENCY.MEDIUM;
    app.ports[1].isCpu = true;
    app.selectedStageId = STAGES[0].id;
    launchConfiguredMatch();
  });

  const openCssFor = (mode, badge, rulesVisible, startLabel) => {
    sound.unlock(); sound.playUi('select');
    app.selectedMode = mode;
    app.activeCssPort = 0;
    app.cssPortManualByP1 = false;
    $('css-mode-badge').textContent = badge;
    $('css-rules-bar').hidden = !rulesVisible;
    $('btn-css-start').textContent = startLabel;
    syncConnectedControllersToCss(true);
    resetCssCursors();
    syncCssSelection();
    showScreen('css');
  };

  const syncVsRulesUi = () => {
    const isTime = app.selectedMode === MODE.VS_TIME;
    if ($('sel-vs-rule')) $('sel-vs-rule').value = isTime ? MODE.VS_TIME : MODE.VS_STOCK;
    if ($('chip-stocks')) $('chip-stocks').hidden = isTime;
    if ($('css-mode-badge') && (app.selectedMode === MODE.VS_STOCK || app.selectedMode === MODE.VS_TIME)) {
      $('css-mode-badge').textContent = isTime ? 'VS TIME' : 'VS STOCK';
    }
    const infOpt = $('sel-time')?.querySelector('option[value="0"]');
    if (infOpt) infOpt.disabled = isTime;
    if (isTime && app.timeSeconds <= 0) {
      app.timeSeconds = 180;
      if ($('sel-time')) $('sel-time').value = '180';
    }
  };

  $('btn-vs-mode').addEventListener('click', () => {
    const vsMode = $('sel-vs-rule')?.value === MODE.VS_TIME ? MODE.VS_TIME : MODE.VS_STOCK;
    openCssFor(vsMode, vsMode === MODE.VS_TIME ? 'VS TIME' : 'VS STOCK', true, 'Stage Select →');
    syncVsRulesUi();
  });
  $('sel-vs-rule')?.addEventListener('change', (e) => {
    app.selectedMode = e.target.value === MODE.VS_TIME ? MODE.VS_TIME : MODE.VS_STOCK;
    syncVsRulesUi();
    syncCssSelection();
  });
  $('btn-events')?.addEventListener('click', () => { sound.unlock(); sound.playUi('select'); buildEventsGrid(); showScreen('events'); });
  $('btn-events-back')?.addEventListener('click', () => { sound.playUi('back'); showScreen('title'); });
  $('btn-classic').addEventListener('click', () => {
    app.classicStep = 0;
    app.classicScore = 0;
    app.classicRoundBaseScore = 0;
    app.classicRunCleared = false;
    app.classicGauntlet = buildClassicGauntlet(app.ports[0].fighterId);
    openCssFor(MODE.CLASSIC, 'CLASSIC ARCADE', false, 'Start Classic →');
  });
  $('btn-targets').addEventListener('click', () => openCssFor(MODE.TARGETS, 'BREAK THE TARGETS', false, 'Start Targets →'));
  $('btn-homerun').addEventListener('click', () => openCssFor(MODE.HOMERUN, 'HOME-RUN DERBY', false, 'Launch Derby →'));
  $('btn-multiman').addEventListener('click', () => openCssFor(MODE.MULTIMAN, 'MULTI-MAN BRAWL', false, 'Fight 25 Interns →'));
  $('btn-training').addEventListener('click', () => { app.hitboxesVisible = true; $('inp-hitboxes').checked = true; openCssFor(MODE.TRAINING, 'TRAINING LAB', false, 'Stage Select →'); });

  $('btn-online').addEventListener('click', () => { sound.unlock(); sound.playUi('select'); refreshOnlineUi(); showScreen('online'); });
  $('btn-leaderboards').addEventListener('click', () => { sound.unlock(); sound.playUi('select'); showScreen('records'); openRecordsBoard('homerun-distance'); });
  $('btn-controller-open').addEventListener('click', () => { sound.unlock(); sound.playUi('select'); showScreen('controller'); });
  $('btn-pause-controller').addEventListener('click', () => { sound.playUi('select'); showScreen('controller'); });
  $('btn-settings-open').addEventListener('click', () => { sound.playUi('select'); showScreen('settings'); });

  // Controller Config & Remapper bindings
  const persistCtrl = () => {
    if (!input.getConfig) return;
    dpad.saveData(input.getConfig(), 'controller');
  };
  $('btn-controller-back').addEventListener('click', () => {
    app.rebindAction = null;
    sound.playUi('back');
    showScreen(app.onlineMenuOpen || app.prevScreen === 'pause' ? 'pause' : 'title');
  });
  $('btn-controller-reset').addEventListener('click', () => {
    app.rebindAction = null;
    input.resetConfig?.();
    syncControllerScreen();
    persistCtrl();
  });
  $('sel-pad-profile')?.addEventListener('change', (e) => {
    input.setConfig?.({ padProfile: e.target.value });
    persistCtrl();
  });
  $('inp-tap-jump').addEventListener('change', (e) => { input.setConfig?.({ tapJump: e.target.checked }); persistCtrl(); });
  $('inp-z-jump').addEventListener('change', (e) => { input.setConfig?.({ zJump: e.target.checked }); persistCtrl(); });
  $('sel-cstick-mode').addEventListener('change', (e) => { input.setConfig?.({ cStickMode: e.target.value }); persistCtrl(); });
  $('inp-deadzone').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    $('lbl-deadzone').textContent = v.toFixed(2);
    input.setConfig?.({ deadzone: v });
    persistCtrl();
  });
  $('inp-tech-feed').addEventListener('change', (e) => { app.techFeedEnabled = e.target.checked; });
  window.addEventListener('keydown', (e) => {
    if (app.screen === 'controller' && app.rebindAction) {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') {
        const cfg = input.getConfig?.() || {};
        const nextBinds = { ...(cfg.keyBinds || {}), [app.rebindAction]: [e.code] };
        input.setConfig?.({ keyBinds: nextBinds });
        persistCtrl();
      }
      app.rebindAction = null;
      syncControllerScreen();
    }
  }, true);

  const persistSettings = () => {
    dpad.saveData({
      muted: sound.isMuted(),
      sfx: Number($('inp-sfx-vol')?.value ?? 0.8),
      music: Number($('inp-music-vol')?.value ?? 0.55),
      use3D: app.use3D,
      hitboxes: app.hitboxesVisible,
      shake: app.shakeEnabled,
      flash: app.flashEnabled,
      rumble: app.rumbleEnabled,
    }, 'settings');
  };

  const syncMuteUi = (muted) => {
    if ($('inp-mute')) $('inp-mute').checked = muted;
    if ($('btn-mute-title')) $('btn-mute-title').textContent = `Sound: ${muted ? 'Off' : 'On'}`;
    if ($('btn-pause-mute')) $('btn-pause-mute').textContent = `Sound: ${muted ? 'Off' : 'On'}`;
  };

  const toggleMute = () => {
    sound.unlock();
    const next = !sound.isMuted();
    sound.setMuted(next);
    syncMuteUi(next);
    persistSettings();
  };
  $('btn-mute-title').addEventListener('click', toggleMute);
  $('btn-pause-mute').addEventListener('click', toggleMute);
  $('btn-css-bio-toggle')?.addEventListener('click', () => {
    sound.playUi('move');
    $('css-bio-panel')?.classList.toggle('bio-open');
  });

  const toggle3D = () => {
    app.use3D = !app.use3D;
    syncGraphicsMode();
    persistSettings();
  };
  $('inp-3d').addEventListener('change', (e) => { app.use3D = e.target.checked; syncGraphicsMode(); persistSettings(); });
  $('btn-pause-3d').addEventListener('click', toggle3D);

  // CSS controls
  $('btn-css-back').addEventListener('click', () => { sound.playUi('back'); showScreen('title'); });
  for (let i = 0; i < 4; i++) {
    $(`btn-active-port-${i}`).addEventListener('click', () => {
      app.activeCssPort = i;
      app.cssPortManualByP1 = true;
      const p = app.ports[i];
      if (p) renderBioPanel(getFighterById(p.fighterId), p.paletteIndex || 0);
      syncCssSelection();
    });
  }
  $('sel-stocks').addEventListener('change', (e) => { app.stocks = Number(e.target.value); });
  $('sel-time').addEventListener('change', (e) => { app.timeSeconds = Number(e.target.value); });
  $('sel-items').addEventListener('change', (e) => { app.itemFrequency = e.target.value; });
  $('sel-player-count').addEventListener('change', (e) => {
    app.manualPlayerCount = true;
    app.playerCount = Number(e.target.value);
    syncCssSelection();
  });
  $('sel-battle-type')?.addEventListener('change', (e) => {
    app.teamBattle = e.target.value === 'teams';
    if (app.teamBattle && app.playerCount < 4) {
      app.playerCount = 4;
      $('sel-player-count').value = '4';
    }
    syncCssSelection();
  });

  // Populate Training Lab spawn-any-item selectors (HUD toolbar + Pause menu)
  for (const selId of ['sel-train-item', 'sel-pause-train-item']) {
    const itemSel = $(selId);
    if (!itemSel) continue;
    itemSel.textContent = '';
    for (const def of Object.values(ITEM_DEF)) {
      const opt = document.createElement('option');
      opt.value = def.id;
      opt.textContent = def.name;
      itemSel.appendChild(opt);
    }
  }
  const returnFocusToArena = () => {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  };
  const setTrainingSpeed = (val) => {
    app.trainingSpeed = Number(val) || 1;
    if (app.match) app.match.timeScale = app.trainingSpeed;
    if ($('sel-train-speed')) $('sel-train-speed').value = String(app.trainingSpeed);
    if ($('sel-pause-train-speed')) $('sel-pause-train-speed').value = String(app.trainingSpeed);
  };
  const setTrainingCpu = (val) => {
    app.trainingCpuMode = val || 'stand';
    if (app.match) {
      app.match.trainingCpuMode = app.trainingCpuMode;
      app.match.trainingConfig = { ...(app.match.trainingConfig || {}), cpuBehavior: app.trainingCpuMode, cpuDi: app.trainingDi };
    }
    if ($('sel-train-cpu')) $('sel-train-cpu').value = app.trainingCpuMode;
    if ($('sel-pause-train-cpu')) $('sel-pause-train-cpu').value = app.trainingCpuMode;
  };
  const setTrainingDi = (val) => {
    app.trainingDi = val || 'none';
    if (app.match) {
      app.match.trainingConfig = { ...(app.match.trainingConfig || {}), cpuBehavior: app.trainingCpuMode, cpuDi: app.trainingDi };
    }
    if ($('sel-train-di')) $('sel-train-di').value = app.trainingDi;
    if ($('sel-pause-train-di')) $('sel-pause-train-di').value = app.trainingDi;
  };
  const spawnTrainingSelectedItem = (fromPause = false) => {
    if (!app.match || app.match.mode !== MODE.TRAINING) return;
    const itemId = $(fromPause ? 'sel-pause-train-item' : 'sel-train-item')?.value || 'plunger_bat';
    Physics.spawnItemNow?.(app.match, itemId);
    sound.playUi('select');
    if (!fromPause) returnFocusToArena();
  };
  const resetTrainingPositions = () => {
    if (!app.match) return;
    if (typeof Physics.resetTrainingMatch === 'function') {
      Physics.resetTrainingMatch(app.match);
    } else {
      for (let i = 0; i < app.match.fighters.length; i++) {
        const f = app.match.fighters[i];
        const sp = app.match.stage.spawns[i % app.match.stage.spawns.length];
        f.x = sp.x; f.y = sp.y; f.vx = 0; f.vy = 0; f.kbVx = 0; f.kbVy = 0;
        f.percent = 0; f.state = STATE.AIRBORNE; f.stateFrame = 0;
        f.hitlag = 0; f.hitstun = 0; f.shieldStun = 0; f.invulnFrames = 0;
        f.moveKey = null; f.moveData = null; f.moveFrame = 0;
        f.grabbing = null; f.grabbedBy = null; f.launchAngle = null;
        f.squashX = 1; f.squashY = 1; f.comboCount = 0; f.comboTimer = 0;
        f.fastFalling = false; f.grounded = false;
        f.heldItemId = null; f.chargeStored = 0; f.sleepFrames = 0; f.sleepImmunity = 0;
        if (f.inputBuffer) f.inputBuffer = {};
      }
      if (Array.isArray(app.match.projectiles)) app.match.projectiles.length = 0;
      if (Array.isArray(app.match.items)) app.match.items.length = 0;
      app.match.screenShake = 0;
      app.match.screenFlash = 0;
      app.match.hitstopFrames = 0;
      app.match.slowMoFrames = 0;
      app.match.impactSlowMoFrames = 0;
      app.match.dramaticFinish = null;
      app.match.events = [];
    }
    app.matchClanks = [0, 0, 0, 0];
    for (const ref of app.hudRefs) {
      ref.lastPct = 0;
      ref.shake = 0;
      ref.pctFlash = 0;
      ref.comboPopFrames = 0;
      ref.lastComboCount = 0;
      ref.lastCombo = '';
      ref.lastBuffKey = '';
      ref.isDanger = false;
      ref.card.style.transform = '';
      ref.pctEl.style.transform = '';
      ref.pctEl.classList.remove('danger');
      ref.card.classList.remove('hud-card-danger', 'stock-loss-flash');
    }
    renderer3d.reset(app.match.stage);
    updateMatchHud(app.match);
  };
  $('sel-train-speed')?.addEventListener('change', (e) => { setTrainingSpeed(e.target.value); returnFocusToArena(); });
  $('sel-pause-train-speed')?.addEventListener('change', (e) => setTrainingSpeed(e.target.value));
  $('sel-train-cpu')?.addEventListener('change', (e) => { setTrainingCpu(e.target.value); returnFocusToArena(); });
  $('sel-pause-train-cpu')?.addEventListener('change', (e) => setTrainingCpu(e.target.value));
  $('sel-train-di')?.addEventListener('change', (e) => { setTrainingDi(e.target.value); returnFocusToArena(); });
  $('sel-pause-train-di')?.addEventListener('change', (e) => setTrainingDi(e.target.value));
  $('sel-train-item')?.addEventListener('change', (e) => {
    if ($('sel-pause-train-item')) $('sel-pause-train-item').value = e.target.value;
    returnFocusToArena();
  });
  $('sel-pause-train-item')?.addEventListener('change', (e) => {
    if ($('sel-train-item')) $('sel-train-item').value = e.target.value;
  });
  $('btn-train-spawn')?.addEventListener('click', () => spawnTrainingSelectedItem(false));
  $('btn-pause-train-spawn')?.addEventListener('click', () => spawnTrainingSelectedItem(true));
  $('btn-pause-train-reset')?.addEventListener('click', () => { resetTrainingPositions(); sound.playUi('select'); });
  $('btn-train-focus')?.addEventListener('click', () => returnFocusToArena());

  $('btn-random-all').addEventListener('click', () => {
    sound.playUi('move');
    for (const p of app.ports) {
      const randIdx = Math.floor(Math.random() * ROSTER.length);
      const def = ROSTER[randIdx];
      p.fighterId = def.id;
      p.paletteIndex = Math.floor(Math.random() * (def.palettes?.length || 4));
      if (app.cssCursors[p.port]) app.cssCursors[p.port].index = randIdx;
      if (p.port === 0 && app.onlineSession && !app.onlineSession.getStats().isHost) {
        app.onlineSession.sendGuestPick(p.fighterId, p.paletteIndex);
      }
    }
    renderBioPanel(getFighterById(app.ports[app.activeCssPort].fighterId), app.ports[app.activeCssPort].paletteIndex);
    syncCssSelection();
  });

  $('btn-css-start').addEventListener('click', () => {
    sound.playUi('start');
    if (app.selectedMode === MODE.CLASSIC || app.selectedMode === MODE.HOMERUN || app.selectedMode === MODE.TARGETS || app.selectedMode === MODE.MULTIMAN) {
      launchConfiguredMatch();
    } else {
      showScreen('stage');
    }
  });
  $('css-ready-banner')?.addEventListener('click', () => {
    const btn = $('btn-css-start');
    if (btn && !btn.disabled) btn.click();
  });

  // Stage Select (returning to CSS preserves all players' fighter picks and unlocks tokens for quick edits)
  $('btn-stage-back').addEventListener('click', () => {
    sound.playUi('back');
    for (const c of app.cssCursors) if (c) c.locked = false;
    syncCssSelection();
    showScreen('css');
  });
  for (const b of document.querySelectorAll('[data-stage-cat]')) {
    b.addEventListener('click', () => { sound.playUi('move'); buildStageGrid(b.dataset.stageCat); });
  }
  $('btn-stage-random').addEventListener('click', () => {
    sound.playUi('start');
    app.selectedStageId = STAGES[Math.floor(Math.random() * STAGES.length)].id;
    launchConfiguredMatch();
  });

  // Online
  $('btn-online-back').addEventListener('click', () => { sound.playUi('back'); showScreen('title'); });
  $('btn-lobby-public').addEventListener('click', async () => { await dpad.findPublicLobby(); refreshOnlineUi(); });
  $('btn-lobby-private').addEventListener('click', async () => { await dpad.createOnlineLobby(true); refreshOnlineUi(); });
  $('btn-lobby-leave').addEventListener('click', async () => { await dpad.leaveOnlineLobby(); refreshOnlineUi(); });
  $('btn-copy-invite').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('online-invite-link').value); } catch {}
    $('btn-copy-invite').textContent = 'Copied!';
    setTimeout(() => { $('btn-copy-invite').textContent = 'Copy'; }, 1500);
  });
  $('btn-online-launch').addEventListener('click', () => {
    app.selectedMode = MODE.ONLINE;
    const st = dpad.getOnlineState();
    const sess = ensureOnlineSession();
    if (st.connected && sess && st.isHost) {
      sess.startHandshake({
        seed: (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0,
        stageId: app.selectedStageId || STAGES[0].id,
        stocks: app.stocks,
        timeSeconds: app.timeSeconds,
        itemFrequency: app.itemFrequency,
        hostFighter: app.ports[0].fighterId,
        hostPalette: app.ports[0].paletteIndex,
        guestFighter: app.onlineGuestPick?.fighterId || app.ports[1].fighterId,
        guestPalette: app.onlineGuestPick?.paletteIndex ?? app.ports[1].paletteIndex,
      });
      refreshOnlineUi();
    } else {
      launchConfiguredMatch();
    }
  });

  // Records & Settings
  $('btn-records-back').addEventListener('click', () => { sound.playUi('back'); showScreen('title'); });
  for (const b of document.querySelectorAll('[data-board]')) {
    b.addEventListener('click', () => openRecordsBoard(b.dataset.board));
  }
  $('btn-settings-back').addEventListener('click', () => { sound.playUi('back'); showScreen(app.prevScreen === 'pause' ? 'pause' : 'title'); });
  $('inp-sfx-vol').addEventListener('input', (e) => { sound.setSfxVolume(Number(e.target.value)); persistSettings(); });
  $('inp-music-vol').addEventListener('input', (e) => { sound.setMusicVolume(Number(e.target.value)); persistSettings(); });
  $('inp-mute').addEventListener('change', (e) => { sound.setMuted(e.target.checked); syncMuteUi(e.target.checked); persistSettings(); });
  $('inp-hitboxes').addEventListener('change', (e) => { app.hitboxesVisible = e.target.checked; persistSettings(); });
  $('inp-shake').addEventListener('change', (e) => { app.shakeEnabled = e.target.checked; persistSettings(); });
  $('inp-flash')?.addEventListener('change', (e) => { app.flashEnabled = e.target.checked; persistSettings(); });
  $('inp-rumble')?.addEventListener('change', (e) => { app.rumbleEnabled = e.target.checked; persistSettings(); });

  // HUD / Pause / Results
  $('btn-hud-pause').addEventListener('click', () => togglePause(true));
  const syncHitboxLabels = () => {
    const label = `Hitboxes: ${app.hitboxesVisible ? 'On' : 'Off'}`;
    if ($('btn-hud-hitboxes')) $('btn-hud-hitboxes').textContent = label;
    if ($('btn-pause-hitboxes')) $('btn-pause-hitboxes').textContent = label;
  };
  $('btn-hud-hitboxes').addEventListener('click', () => {
    app.hitboxesVisible = !app.hitboxesVisible;
    $('inp-hitboxes').checked = app.hitboxesVisible;
    syncHitboxLabels();
    persistSettings();
  });
  $('btn-hud-reset').addEventListener('click', resetTrainingPositions);

  $('btn-pause-resume').addEventListener('click', () => togglePause(false));
  $('btn-pause-restart').addEventListener('click', () => {
    if (app.match?.mode === MODE.ONLINE && app.onlineMatchActive) return;
    sound.playUi('start');
    if (app.selectedMode === MODE.CLASSIC) app.classicScore = app.classicRoundBaseScore;
    launchConfiguredMatch();
  });
  $('btn-pause-hitboxes').addEventListener('click', () => {
    app.hitboxesVisible = !app.hitboxesVisible;
    $('inp-hitboxes').checked = app.hitboxesVisible;
    syncHitboxLabels();
    persistSettings();
  });
  const exitMatchToSelect = () => {
    const wasOnline = app.match?.mode === MODE.ONLINE || app.selectedMode === MODE.ONLINE;
    const wasEvent = app.match?.mode === EVENT_MODE() || app.selectedMode === EVENT_MODE();
    if (wasOnline && app.onlineMatchActive) {
      app.onlineSession?.sendLeave();
      app.onlineSession?.stop();
    }
    app.onlineMatchActive = false;
    app.onlineMenuOpen = false;
    app.match = null;
    if (wasOnline) {
      refreshOnlineUi();
      showScreen('online');
    } else if (wasEvent) {
      buildEventsGrid();
      showScreen('events');
    } else {
      resetCssCursors();
      syncCssSelection();
      showScreen('css');
    }
  };
  $('btn-pause-css').addEventListener('click', exitMatchToSelect);
  $('btn-pause-title').addEventListener('click', () => {
    if (app.onlineMatchActive) {
      app.onlineSession?.sendLeave();
      app.onlineSession?.stop();
    }
    app.onlineMatchActive = false;
    app.onlineMenuOpen = false;
    app.match = null;
    showScreen('title');
  });

  $('btn-results-rematch').addEventListener('click', () => {
    sound.playUi('start');
    if (app.selectedMode === MODE.ONLINE) {
      const st = dpad.getOnlineState();
      const sess = ensureOnlineSession();
      if (st.connected && sess && st.isHost) {
        sess.startHandshake({
          seed: (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0,
          stageId: app.selectedStageId || STAGES[0].id,
          stocks: app.stocks,
          timeSeconds: app.timeSeconds,
          itemFrequency: app.itemFrequency,
          hostFighter: app.ports[0].fighterId,
          hostPalette: app.ports[0].paletteIndex,
          guestFighter: app.onlineGuestPick?.fighterId || app.ports[1].fighterId,
          guestPalette: app.onlineGuestPick?.paletteIndex ?? app.ports[1].paletteIndex,
        });
        $('results-sub').textContent = 'Syncing online rematch with opponent...';
        return;
      }
      refreshOnlineUi();
      showScreen('online');
      return;
    }
    if (app.selectedMode === MODE.CLASSIC) app.classicScore = app.classicRoundBaseScore;
    launchConfiguredMatch();
  });
  $('btn-results-next').addEventListener('click', () => {
    sound.playUi('start');
    if (app.selectedMode === EVENT_MODE()) {
      const idx = EVENTS.findIndex((e) => e.id === app.selectedEventId);
      if (idx >= 0 && idx < EVENTS.length - 1) {
        launchEventMatch(EVENTS[idx + 1].id);
        return;
      }
    }
    app.classicRoundBaseScore = app.classicScore;
    app.classicStep++;
    launchConfiguredMatch();
  });
  $('btn-results-css').addEventListener('click', exitMatchToSelect);
  $('btn-results-title').addEventListener('click', () => { app.match = null; showScreen('title'); });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && (app.screen === 'match' || app.screen === 'pause')) {
      e.preventDefault();
      togglePause(app.screen === 'match');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && app.screen === 'match' && !app.onlineMatchActive) togglePause(true);
  });
  window.addEventListener('resize', () => {
    const prevLayout = document.body.dataset.layout;
    setLayoutAttr();
    if (prevLayout && prevLayout !== document.body.dataset.layout && app.screen === 'match' && !app.onlineMatchActive) {
      togglePause(true);
    }
  });
}

function togglePause(pause, pauserPort = null) {
  if (!app.match || app.match.status === 'ended') return;
  const isOnlineLive = Boolean(app.match.mode === MODE.ONLINE && app.onlineMatchActive);
  if (pause) {
    if (!isOnlineLive) {
      if (app.match.status !== 'paused') app.match._prePauseStatus = app.match.status;
      app.match.status = 'paused';
    } else {
      app.onlineMenuOpen = true;
    }
    input.clearHolds();
    const localPort = (isOnlineLive && app.onlineSession)
      ? app.onlineSession.getStats().localPort
      : (Number.isInteger(pauserPort) ? pauserPort : 0);
    const me = app.match.fighters.find((f) => f.port === localPort) || app.match.fighters[0];
    $('pause-tech-readout').textContent = `P${localPort + 1} Wavedashes: ${me.wavedashCount || 0} • L-Cancels: ${me.lCancelCount || 0} • Max Combo: ${me.maxCombo || 0}`;
    if ($('btn-pause-restart')) $('btn-pause-restart').hidden = isOnlineLive;
    if ($('btn-pause-css')) {
      $('btn-pause-css').textContent = isOnlineLive
        ? 'Leave Online Match'
        : (app.match.mode === EVENT_MODE() ? 'Event List' : 'Character Select');
    }
    if ($('btn-pause-mute')) {
      $('btn-pause-mute').textContent = `Sound: ${sound.isMuted() ? 'Off' : 'On'}`;
    }
    if ($('btn-pause-hitboxes')) {
      $('btn-pause-hitboxes').textContent = `Hitboxes: ${app.hitboxesVisible ? 'On' : 'Off'}`;
    }
    const isTraining = app.match.mode === MODE.TRAINING;
    if ($('pause-training-controls')) $('pause-training-controls').hidden = !isTraining;
    if (isTraining) {
      if ($('sel-pause-train-speed')) $('sel-pause-train-speed').value = String(app.trainingSpeed);
      if ($('sel-pause-train-cpu')) $('sel-pause-train-cpu').value = app.trainingCpuMode;
      if ($('sel-pause-train-di')) $('sel-pause-train-di').value = app.trainingDi;
      if ($('sel-pause-train-item') && $('sel-train-item')) $('sel-pause-train-item').value = $('sel-train-item').value;
    }
    showScreen('pause');
    if (isOnlineLive) sound.setPaused?.(false);
  } else {
    app.onlineMenuOpen = false;
    if (!isOnlineLive) {
      app.match.status = app.match._prePauseStatus || (app.match.introTimer > 0 ? 'intro' : 'playing');
    }
    input.clearHolds();
    showScreen('match');
    sound.setMusic(app.match.fighters.some((p) => p.fighterId === MASTER_MITT.id) ? 'boss' : 'battle', app.match.stage.id);
  }
}

// ============================================================================
// MAIN 60HZ FIXED-TIMESTEP LOOP
// ============================================================================
function triggerMatchRumble(events, match) {
  if (!app.rumbleEnabled || !events?.length || !match) return;
  const isOnline = match.mode === MODE.ONLINE && app.onlineMatchActive;
  const localPort = isOnline ? (app.onlineSession?.getStats().localPort ?? 0) : -1;
  const humanPorts = isOnline
    ? [localPort]
    : match.fighters.filter((f) => !f.isCpu).map((f) => f.port);
  if (!humanPorts.length) return;
  const canRumble = (port) => (isOnline ? port === localPort : humanPorts.includes(port));
  const rumbleSlot = (port, cfg) => {
    const slot = isOnline ? 0 : port;
    if (canRumble(port)) input.rumblePort?.(slot, cfg);
  };
  for (const e of events) {
    if (e.type === 'hit') {
      const kb = Number.isFinite(e.kb) ? e.kb : 0;
      const tier = e.weightTier || (kb >= 145 ? 'colossal' : kb >= 95 ? 'heavy' : kb >= 52 ? 'medium' : 'light');
      const strong = tier === 'colossal' ? 1.0 : tier === 'heavy' ? Math.min(0.95, 0.55 + kb / 240) : tier === 'medium' ? Math.min(0.55, 0.25 + kb / 220) : 0.12;
      const weak = tier === 'colossal' ? 0.92 : tier === 'heavy' ? 0.65 : tier === 'medium' ? 0.38 : 0.22;
      const dur = tier === 'colossal' ? 190 : tier === 'heavy' ? 135 : tier === 'medium' ? 75 : 42;
      if (e.victimPort != null) rumbleSlot(e.victimPort, { weak, strong, durationMs: dur });
      if (e.attackerPort != null) rumbleSlot(e.attackerPort, { weak: weak * 0.58, strong: strong * 0.52, durationMs: Math.round(dur * 0.72) });
    } else if (e.type === 'clank') {
      for (const p of e.ports || humanPorts) rumbleSlot(p, { weak: 0.65, strong: 0.45, durationMs: 70 });
    } else if (e.type === 'ko' || e.type === 'dramaticFinish') {
      if (e.port != null) rumbleSlot(e.port, { weak: 0.75, strong: 1.0, durationMs: 260 });
      else for (const p of humanPorts) rumbleSlot(p, { weak: 0.5, strong: 0.8, durationMs: 200 });
    } else if (e.type === 'shieldBreak' || e.type === 'explosion') {
      for (const p of humanPorts) rumbleSlot(p, { weak: 0.65, strong: 0.9, durationMs: 180 });
    } else if (e.type === 'powershield' || e.type === 'counter' || (e.type === 'tech' && e.tech === 'PARRY')) {
      if (e.port != null) rumbleSlot(e.port, { weak: 0.55, strong: 0.35, durationMs: 85 });
    }
  }
}

function tickSimulation() {
  const onlineSt = dpad.getOnlineState();
  if (onlineSt.connected || app.onlineSession) {
    ensureOnlineSession();
    dpad.pollP2P([0, 1]);
    app.onlineSession?.tickHandshake();
  }

  const runningOnlineOverlay = Boolean(
    (app.screen === 'pause' || app.screen === 'controller' || app.screen === 'settings') &&
    app.onlineMatchActive &&
    app.onlineMenuOpen
  );
  if ((app.screen === 'match' || runningOnlineOverlay) && app.match) {
    if (app.match.status === 'paused' && !runningOnlineOverlay) return;

    const isOnlineLive = Boolean(app.match.mode === MODE.ONLINE && app.onlineMatchActive);
    const activeHumanPorts = isOnlineLive
      ? [0]
      : app.match.fighters.filter((f) => !f.isCpu).map((f) => f.port);
    const localMultiplayer = !isOnlineLive && activeHumanPorts.length > 1;
    const polled = runningOnlineOverlay
      ? app.match.fighters.map(() => createEmptyInput())
      : input.poll(app.match.fighters.length, localMultiplayer, activeHumanPorts);
    updateTouchVisibility();

    const pauserPort = !runningOnlineOverlay
      ? activeHumanPorts.find((p) => polled[p]?.pausePressed)
      : undefined;
    if (pauserPort !== undefined) {
      togglePause(true, pauserPort);
      return;
    }

    let inputsByPort;
    if (app.match.mode === MODE.ONLINE && app.onlineMatchActive) {
      if (app.onlineReconnecting || !onlineSt.connected) {
        app.onlineReconnectFrames++;
        app.onlineStatusDirty = true;
        if ($('hud-mode-info')) {
          setStableText($('hud-mode-info'), `OPPONENT RECONNECTING... • ${app.match.stage.name}`);
        }
        if (app.onlineReconnectFrames > 600) {
          abortOnlineMatch('OPPONENT DISCONNECTED');
        }
        return;
      }
      if (!app.onlineSession?.getStats().active) {
        abortOnlineMatch('OPPONENT DISCONNECTED');
        return;
      }
      const stepRes = app.onlineSession.step(polled[0]);
      if (!stepRes.ready) {
        if (stepRes.stallFrames > 15 && $('hud-mode-info')) {
          app.onlineStatusDirty = true;
          setStableText($('hud-mode-info'), `ONLINE SYNCING... • ${app.match.stage.name}`);
        }
        if (stepRes.stallFrames > 600) {
          abortOnlineMatch('OPPONENT TIMED OUT');
        }
        return;
      }
      if (app.onlineStatusDirty) {
        app.onlineStatusDirty = false;
        if ($('hud-mode-info')) {
          const delayF = app.onlineSession.getStats().delayFrames || 3;
          setStableText($('hud-mode-info'), `ONLINE LOCKSTEP (${delayF}F) • ${app.match.stage.name}`);
        }
      }
      inputsByPort = stepRes.inputs;
    } else {
      inputsByPort = app.match.fighters.map((f) => {
        if (f.isCpu) return computeCpuInput(app.match, f);
        return polled[f.port] || createEmptyInput();
      });
    }

    stepMatch(app.match, inputsByPort);
    if (app.match.mode === MODE.ONLINE && app.onlineMatchActive && app.onlineSession?.getStats().active && app.match.frame > 0 && app.match.frame % 60 === 0) {
      app.onlineSession.recordLocalChecksum(app.match.frame, computeMatchChecksum(app.match));
    }
    if (app.match.events?.length) {
      for (const e of app.match.events) {
        if (e.type === 'clank' && Array.isArray(e.ports)) {
          for (const p of e.ports) {
            if (p >= 0 && p < 4) app.matchClanks[p] = (app.matchClanks[p] || 0) + 1;
          }
        }
      }
    }
    renderer3d.ingestEvents(app.match.events, app.match);
    sound.playEvents(app.match.events);
    triggerMatchRumble(app.match.events, app.match);
    pushTechFeed(app.match.events);
    updateMatchHud(app.match);

    if (app.match.status === 'ended' && app.match.endTimer <= 0) {
      openResults(app.match);
    }
  } else if (app.attractMatch && app.screen !== 'match' && app.screen !== 'pause' && app.screen !== 'results') {
    const inputs = app.attractMatch.fighters.map((f) => computeCpuInput(app.attractMatch, f));
    stepMatch(app.attractMatch, inputs);
    renderer3d.ingestEvents(app.attractMatch.events, app.attractMatch);
    if (app.attractMatch.frame > 1800) startAttractMatch();
  }
}

function frameLoop(now) {
  if (!app.lastTickMs) app.lastTickMs = now;
  const elapsed = Math.min(0.1, (now - app.lastTickMs) / 1000);
  app.lastTickMs = now;
  const simScale = (app.screen === 'match' && app.match && app.match.mode === MODE.TRAINING)
    ? Math.max(0.25, Math.min(1, app.match.timeScale || app.trainingSpeed || 1))
    : 1;
  app.accumulator += elapsed * simScale;

  while (app.accumulator >= DT) {
    tickSimulation();
    handleGamepadMenus();
    app.accumulator -= DT;
  }

  const activeMatch = app.stagePreviewMatch
    || ((app.screen === 'match' || app.screen === 'pause' || app.screen === 'results')
      ? app.match
      : app.attractMatch);
  const reduced = isReducedMotion();
  renderer3d.render(activeMatch, {
    showHitboxes: !app.stagePreviewMatch && app.hitboxesVisible && (app.screen === 'match' || app.screen === 'pause'),
    shakeEnabled: !app.stagePreviewMatch && app.shakeEnabled && !reduced,
    flashEnabled: !app.stagePreviewMatch && app.flashEnabled && !reduced,
    reducedMotion: reduced,
    victoryMode: !app.stagePreviewMatch && app.screen === 'results',
    stagePreview: Boolean(app.stagePreviewMatch),
  });
  if (app.screen === 'controller') drawControllerTester();

  requestAnimationFrame(frameLoop);
}

// ============================================================================
// BOOTSTRAP
// ============================================================================
async function boot() {
  setLayoutAttr();
  syncGraphicsMode();
  input.onPadChange = () => {
    app.lastObservedPadKey = (input.getPadPorts ? input.getPadPorts() : []).join(',');
    if (app.screen === 'css') {
      syncConnectedControllersToCss(true);
      syncCssSelection();
    } else if (app.screen === 'controller') {
      app.lastTesterTabsKey = '';
      syncControllerScreen();
    }
  };
  input.attach(window);
  wireUi();
  wireTouchControls();
  preloadPortraits(() => {
    buildCssGrid();
    renderBioPanel(getFighterById(app.ports[app.activeCssPort].fighterId), app.ports[app.activeCssPort].paletteIndex);
    if (app.match) {
      for (const ref of app.hudRefs) {
        const f = app.match.fighters.find((ft) => ft.port === ref.port);
        if (f && ref.canvas) renderer2d.drawPortrait(ref.canvas, f.def, f.paletteIndex);
      }
    }
  });
  preloadStageArt(() => {
    buildStageGrid(app.stageFilterCat);
  });
  buildCssGrid();
  buildStageGrid();
  buildEventsGrid();
  startAttractMatch();
  showScreen('title');

  window.__BIZARRO_MELEE__ = {
    getState: () => ({
      screen: app.screen,
      mode: app.selectedMode,
      rosterCount: ROSTER.length,
      stageCount: STAGES.length,
      eventCount: EVENTS.length,
      teamBattle: app.teamBattle,
      hitboxesVisible: app.hitboxesVisible,
      gfx: renderer3d.isActive() ? '3d' : '2d',
    }),
    getMatch: () => app.match,
    openScreen: (s) => showScreen(s),
    startQuickMatch: () => {
      app.selectedMode = MODE.VS_STOCK;
      app.teamBattle = false;
      app.playerCount = 2;
      app.stocks = 4;
      app.itemFrequency = ITEM_FREQUENCY.HIGH;
      app.ports[1].isCpu = true;
      app.selectedStageId = STAGES[0].id;
      launchConfiguredMatch();
    },
    startEvent: (eventId) => launchEventMatch(eventId || EVENTS[0].id),
    setTeamBattle: (on, count = 4) => {
      app.teamBattle = Boolean(on);
      app.playerCount = count;
      if ($('sel-battle-type')) $('sel-battle-type').value = app.teamBattle ? 'teams' : 'ffa';
      if ($('sel-player-count')) $('sel-player-count').value = String(count);
      syncCssSelection();
    },
    spawnTrainingItem: (itemId) => app.match ? Physics.spawnItemNow?.(app.match, itemId) : null,
    triggerSuddenDeath: () => app.match ? Physics.triggerSuddenDeath?.(app.match) : null,
    showResults: () => app.match ? openResults(app.match) : null,
    renderStagePreview: (stageId) => {
      if (!stageId) {
        app.stagePreviewMatch = null;
        if (app.attractMatch) renderer3d.reset(app.attractMatch.stage);
        return true;
      }
      const m = createMatch({
        mode: MODE.VS_STOCK,
        stageId,
        stocks: 1,
        timeSeconds: 0,
        itemFrequency: ITEM_FREQUENCY.OFF,
        players: [{ port: 0, fighterId: 'faux', paletteIndex: 0, isCpu: true, cpuLevel: 1, name: 'P1' }],
      });
      m.status = 'playing';
      m.introTimer = 0;
      app.stagePreviewMatch = m;
      renderer3d.reset(m.stage);
      renderer3d.render(m, { stagePreview: true, showHitboxes: false, shakeEnabled: false });
      return true;
    },
    startMode: (mode, stageId) => {
      app.selectedMode = mode;
      if (stageId) app.selectedStageId = stageId;
      launchConfiguredMatch();
    },
    setHitboxes: (on) => {
      app.hitboxesVisible = Boolean(on);
      $('inp-hitboxes').checked = app.hitboxesVisible;
    },
    setTrainingConfig: ({ cpuBehavior, cpuDi } = {}) => {
      if (cpuBehavior) {
        app.trainingCpuMode = cpuBehavior;
        if ($('sel-train-cpu')) $('sel-train-cpu').value = cpuBehavior;
        if ($('sel-pause-train-cpu')) $('sel-pause-train-cpu').value = cpuBehavior;
      }
      if (cpuDi) {
        app.trainingDi = cpuDi;
        if ($('sel-train-di')) $('sel-train-di').value = cpuDi;
        if ($('sel-pause-train-di')) $('sel-pause-train-di').value = cpuDi;
      }
      if (app.match) {
        app.match.trainingCpuMode = app.trainingCpuMode;
        app.match.trainingConfig = { cpuBehavior: app.trainingCpuMode, cpuDi: app.trainingDi };
      }
    },
  };

  const sdk = await dpad.init((ev) => {
    if (ev.type === 'lobby') {
      if (ev.name === 'P2P_PEER_RECONNECTING') {
        app.onlineReconnecting = true;
        app.onlineReconnectFrames = 0;
      } else if (ev.name === 'P2P_PEER_RECONNECTED' || ev.name === 'P2P_CONNECTION_ESTABLISHED') {
        app.onlineReconnecting = false;
        app.onlineReconnectFrames = 0;
      } else if (
        ev.name === 'P2P_PEER_DISCONNECTED' ||
        ev.name === 'P2P_CONNECTION_FAILED' ||
        ev.name === 'LOBBY_KICKED' ||
        (ev.name === 'LOBBY_USERS_UPDATED' && (ev.data?.changeType === 'LEFT' || ev.data?.changeType === 'KICKED'))
      ) {
        app.onlineReconnecting = false;
        if (app.match?.mode === MODE.ONLINE && app.onlineMatchActive) {
          abortOnlineMatch('OPPONENT DISCONNECTED');
        }
      }
      refreshOnlineUi();
    }
    if (ev.type === 'p2p' && ev.data && typeof ev.data === 'object') {
      ensureOnlineSession()?.handlePacket(ev.data);
    }
  });

  if (sdk?.player?.name) {
    const pill = $('dpad-player-pill');
    pill.textContent = `Signed in on dpad as ${sdk.player.name}`;
    pill.hidden = false;
  }

  const savedRec = await dpad.loadSave('records');
  if (savedRec && typeof savedRec === 'object') Object.assign(app.records, savedRec);
  const savedSet = await dpad.loadSave('settings');
  if (savedSet && typeof savedSet === 'object') {
    if (typeof savedSet.muted === 'boolean') {
      sound.setMuted(savedSet.muted);
      $('inp-mute').checked = savedSet.muted;
      $('btn-mute-title').textContent = `Sound: ${savedSet.muted ? 'Off' : 'On'}`;
      if ($('btn-pause-mute')) $('btn-pause-mute').textContent = `Sound: ${savedSet.muted ? 'Off' : 'On'}`;
    }
    if (typeof savedSet.sfx === 'number') { sound.setSfxVolume(savedSet.sfx); $('inp-sfx-vol').value = String(savedSet.sfx); }
    if (typeof savedSet.music === 'number') { sound.setMusicVolume(savedSet.music); $('inp-music-vol').value = String(savedSet.music); }
    if (typeof savedSet.use3D === 'boolean') { app.use3D = savedSet.use3D; syncGraphicsMode(); }
    if (typeof savedSet.hitboxes === 'boolean') {
      app.hitboxesVisible = savedSet.hitboxes;
      if ($('inp-hitboxes')) $('inp-hitboxes').checked = savedSet.hitboxes;
    }
    if (typeof savedSet.shake === 'boolean') {
      app.shakeEnabled = savedSet.shake;
      if ($('inp-shake')) $('inp-shake').checked = savedSet.shake;
    }
    if (typeof savedSet.flash === 'boolean') {
      app.flashEnabled = savedSet.flash;
      if ($('inp-flash')) $('inp-flash').checked = savedSet.flash;
    }
    if (typeof savedSet.rumble === 'boolean') {
      app.rumbleEnabled = savedSet.rumble;
      if ($('inp-rumble')) $('inp-rumble').checked = savedSet.rumble;
    }
  }

  const savedCtrl = await dpad.loadSave('controller');
  if (savedCtrl && typeof savedCtrl === 'object') {
    input.setConfig?.(savedCtrl);
  }

  requestAnimationFrame(frameLoop);
}

boot();
