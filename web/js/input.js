const BUTTONS = ['jump', 'attack', 'special', 'shield', 'grab'];
const EDGE_ONLY = ['taunt', 'pause'];
// Only discrete digital action buttons are blocked by clearHolds(); analog triggers (shield) keep live pressure and suppress only carried-over edges.
const BLOCKABLE_BUTTONS = ['jump', 'attack', 'special', 'grab', 'taunt', 'pause'];
const GAMECUBE = /gamecube|mayflash|0079|1846|wup-028|0337/i;
const NINTENDO = /pro controller|switch|joy-con|nintendo|057e/i;
const SONY_HID = /054c|dualsense|dualshock|wireless controller/i;
const HID_8BITDO = /8bitdo|2dc8/i;
const padSplitRightY = new Map();
const padHatAxis = new Map();
const padRestNegAxes = new Map();

function hasObservedNegRest(pad, idx) {
  const v = pad.axes?.[idx];
  if (!Number.isFinite(v)) return false;
  const key = `${pad.index}:${pad.id}`;
  let set = padRestNegAxes.get(key);
  if (!set) { set = new Set(); padRestNegAxes.set(key, set); }
  if (v <= -0.82) set.add(idx);
  return set.has(idx);
}

function usesSplitRightY(pad, raw) {
  if (raw || pad.mapping === 'standard' || (pad.axes?.length ?? 0) < 6) return false;
  const id = String(pad.id || '');
  if (SONY_HID.test(id)) return true;
  const key = `${pad.index}:${id}`;
  if (padSplitRightY.has(key)) return padSplitRightY.get(key);
  const a3 = pad.axes[3];
  const a5 = pad.axes[5];
  if (HID_8BITDO.test(id)) {
    // 8BitDo BLE HID (2dc8:6012) maps Right Stick Y (Usage 0x35 Rz) to axes[5] while axes[3] is unused (0).
    // Compact 6-axis modes map triggers to axes[4]/axes[5] (resting near -1) and Right Stick Y to axes[3].
    if (Number.isFinite(a5) && a5 <= -0.82 && Number.isFinite(a3) && Math.abs(a3) < 0.35) {
      padSplitRightY.set(key, false);
      return false;
    }
    if (Number.isFinite(a5) && Math.abs(a5) < 0.35) {
      padSplitRightY.set(key, true);
      return true;
    }
    return true;
  }
  if (Number.isFinite(a3) && a3 <= -0.82 && Number.isFinite(a5) && Math.abs(a5) < 0.35) {
    padSplitRightY.set(key, true);
    return true;
  }
  if (Number.isFinite(a3) && Math.abs(a3) < 0.05 && Number.isFinite(a5) && Math.abs(a5) > 0.25 && Math.abs(a5) <= 1.05) {
    padSplitRightY.set(key, true);
    return true;
  }
  return false;
}
const PRO_KEYS = ['KeyF', 'AltLeft', 'KeyH', 'KeyN', 'KeyO', 'Numpad8', 'Numpad4', 'Numpad2', 'Numpad6', 'Numpad7', 'Numpad9'];

// Standard Xbox / PlayStation / X-Input Bluetooth layout (A/Cross=0 bottom, B/Circle=1 right)
const PAD_STANDARD = { attack: [0], special: [1], jump: [2, 3], shield: [6, 7], grab: [4, 5], taunt: [8, 12], pause: [9] };
// DualSense / DualShock raw HID layout (054c when mapping !== 'standard': Cross=1, Circle=2, Square=0, Triangle=3)
const PAD_SONY_HID = { attack: [1], special: [2], jump: [0, 3], grab: [4, 5], shield: [6, 7], taunt: [8, 12], pause: [9] };
// 8BitDo BLE / D-Input raw HID layout (e.g. Ultimate 2 Wireless 2dc8:6012 on macOS Chrome)
const PAD_8BITDO_HID = { attack: [0], special: [1], jump: [3, 4, 2], grab: [6, 7], shield: [8, 9], taunt: [10, 12], pause: [11] };
// Nintendo Switch Pro / Joy-Con / NSO Bluetooth layout (A=1 right, B=0 bottom, Y=2 left, X=3 top)
const PAD_NINTENDO = { attack: [1], special: [0], jump: [2, 3], shield: [6, 7], grab: [4, 5], taunt: [8, 12], pause: [9] };
// Mayflash 4-Port GameCube Adapter (PC HID mode: 0=X, 1=A, 2=B, 3=Y, 4=L, 5=R, 7=Z, 9=Start, 12=D-Up)
const MAYFLASH = { attack: [1], special: [2], jump: [0, 3], grab: [7], shield: [4, 5], taunt: [12], pause: [9] };
const WUP = { attack: [0], special: [1], jump: [2, 3], grab: [6], shield: [4, 5], taunt: [8], pause: [7] };
const COMPACT_GC = { attack: [0], special: [1], jump: [2, 3], grab: [4], shield: [5, 6], taunt: [8], pause: [7] };

const MENU_NAV_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'Enter', 'Escape', 'Backspace',
]);

const P1 = {
  jump: ['KeyW', 'Space', 'KeyI'], attack: ['KeyJ', 'KeyZ'], special: ['KeyK', 'KeyX'],
  shield: ['KeyL', 'ShiftLeft', 'KeyC'], grab: ['KeyU', 'KeyE', 'V'.length ? 'KeyV' : 'KeyV'],
  shortHop: ['KeyO'], lightShield: ['KeyH', 'KeyN'], taunt: ['KeyT', 'KeyQ'], pause: ['Escape', 'Enter'],
};
const P2 = {
  jump: ['ShiftRight', 'Numpad0'], attack: ['Period', 'Numpad1'],
  special: ['Slash', 'Comma', 'Numpad2', 'NumpadDivide'],
  shield: ['Quote', 'Numpad3', 'NumpadDecimal'], grab: ['Semicolon', 'Numpad4', 'NumpadAdd'],
  taunt: ['Numpad5'], pause: ['NumpadEnter'],
};
const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'];
const WASD = ['KeyA', 'KeyD', 'KeyS', 'KeyW'];
const USED_KEYS = new Set([...ARROWS, ...WASD, ...PRO_KEYS, ...Object.values(P1).flat(), ...Object.values(P2).flat()]);
const AXES = ['moveX', 'moveY', 'rawMoveX', 'rawMoveY', 'cStickX', 'cStickY'];
const MENU_DIRS = ['up', 'down', 'left', 'right'];
const MENU_REPEAT_DELAY = 22;
const MENU_REPEAT_RATE = 7;

const unit = (n) => Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
const pressure = (n) => Math.max(0, unit(n));
const triggerNoise = (v) => (v < 0.08 ? 0 : Math.min(1, (v - 0.08) / 0.92));
const copyBinds = (bindings) => Object.fromEntries(Object.entries(bindings).map(([action, codes]) => [action, codes && [...codes]]));

function radialStick(rawX, rawY, deadzone, curve = 1.0) {
  const x = unit(rawX);
  const y = unit(rawY);
  const mag = Math.hypot(x, y);
  if (mag < deadzone) return [0, 0];
  const linear = Math.min(1, (mag - deadzone) / Math.max(0.05, 1 - deadzone));
  const scaled = curve !== 1.0 ? Math.pow(linear, curve) : linear;
  return [(x / mag) * scaled, (y / mag) * scaled];
}

function defaultConfig() {
  const { pause, ...keys } = P1;
  return {
    tapJump: true,
    zJump: false,
    cStickMode: 'smash',
    padProfile: 'auto',
    deadzone: 0.18,
    keyBinds: copyBinds(keys),
    padBinds: Object.fromEntries(Object.keys(PAD_STANDARD).map((action) => [action, null])),
  };
}

export function createEmptyInput() {
  return {
    moveX: 0, moveY: 0, rawMoveX: 0, rawMoveY: 0, jump: false, jumpPressed: false, tapJumpPressed: false, attack: false, attackPressed: false,
    special: false, specialPressed: false, shield: false, shieldPressed: false, grab: false,
    shieldAnalog: 0, lightShield: false, shortHopPressed: false, tiltMod: false, cStickTilt: false,
    grabPressed: false, tauntPressed: false, cStickX: 0, cStickY: 0, pausePressed: false,
  };
}

function readPads() {
  try {
    return Array.from(globalThis.navigator?.getGamepads?.() ?? [])
      .filter((pad) => pad && pad.connected !== false && (pad.buttons?.length || pad.axes?.length));
  } catch {
    return [];
  }
}

function padProfile(pad, config, padSlot = 0) {
  if (padSlot === 0 && config?.padProfile && config.padProfile !== 'auto') return config.padProfile;
  const id = String(pad.id || '');
  if (GAMECUBE.test(id) && pad.mapping !== 'standard') return 'gamecube';
  if (NINTENDO.test(id)) return 'nintendo';
  if (/gamecube/i.test(id)) return 'gamecube';
  return 'standard';
}

function sampleDpad(pad) {
  const btn = (i) => {
    const b = pad.buttons?.[i];
    return !!(b?.pressed || (typeof b === 'number' ? b : b?.value || 0) > 0.45);
  };
  let up = btn(12);
  let down = btn(13);
  let left = btn(14);
  let right = btn(15);

  // 8-way hat axis encoding (-1.0 N, -5/7 NE, -3/7 E, -1/7 SE, +1/7 S, +3/7 SW, +5/7 W, +1.0 NW; >1.1 = neutral).
  // Note: 0.0 is NOT a valid 8-way hat step, preventing dead/empty axes from triggering false DOWN.
  if (!up && !down && !left && !right && pad.mapping !== 'standard' && (pad.axes?.length ?? 0) >= 7) {
    const key = `${pad.index}:${pad.id}`;
    let hatIdx = padHatAxis.get(key);
    if (hatIdx == null) {
      if (pad.axes.length >= 10) {
        hatIdx = 9;
      } else {
        for (let i = pad.axes.length - 1; i >= 6; i--) {
          const v = pad.axes[i];
          if (Number.isFinite(v) && (v > 1.12 || v < -1.12)) {
            hatIdx = i;
            padHatAxis.set(key, i);
            break;
          }
        }
      }
    }
    const hat = hatIdx != null ? pad.axes[hatIdx] : undefined;
    if (Number.isFinite(hat) && hat >= -1.08 && hat <= 1.08) {
      const step = Math.round(((hat + 1) / 2) * 7);
      const expected = -1 + (step * 2) / 7;
      if (Math.abs(hat - expected) <= 0.08) {
        // 0:N, 1:NE, 2:E, 3:SE, 4:S, 5:SW, 6:W, 7:NW
        if (step === 0 || step === 1 || step === 7) up = true;
        if (step === 3 || step === 4 || step === 5) down = true;
        if (step === 5 || step === 6 || step === 7) left = true;
        if (step === 1 || step === 2 || step === 3) right = true;
      }
    }
  }
  return { up, down, left, right };
}

function samplePad(pad, config, padSlot = 0) {
  const profile = padProfile(pad, config, padSlot);
  const id = String(pad.id || '');
  const raw = profile === 'gamecube' && pad.mapping !== 'standard';
  const mayflash = raw && /mayflash|0079|1846/i.test(id) && pad.axes?.length >= 6;
  const wup = raw && /0337|wup-028/i.test(id) && pad.axes?.length === 6;
  const is8BitDoHid = !raw && profile !== 'nintendo' && pad.mapping !== 'standard' && HID_8BITDO.test(id);
  const isSonyHid = !raw && profile !== 'nintendo' && pad.mapping !== 'standard' && SONY_HID.test(id);

  const value = (index) => {
    const b = pad.buttons?.[index];
    if (typeof b === 'number') return pressure(b);
    if (!b) return 0;
    const v = pressure(b.value);
    return v > 0 ? v : Number(!!b.pressed);
  };
  const pressed = (i) => !!pad.buttons?.[i]?.pressed || value(i) > 0.45;
  const triggerAxis = (i) => Number.isFinite(pad.axes?.[i]) ? triggerNoise(pressure((pad.axes[i] + 1) / 2)) : 0;

  const compact = raw && !mayflash && !wup && pad.buttons?.length <= 12;
  const layout = mayflash
    ? MAYFLASH
    : wup
      ? WUP
      : compact
        ? COMPACT_GC
        : is8BitDoHid
          ? PAD_8BITDO_HID
          : isSonyHid
            ? PAD_SONY_HID
            : profile === 'nintendo'
              ? PAD_NINTENDO
              : PAD_STANDARD;

  // Null follows the hardware profile. Custom raw button overrides apply to Pad 1 (slot 0) so mixed P2-P4 controllers auto-detect cleanly.
  const binds = (key) => (padSlot === 0 ? config.padBinds?.[key] : null) ?? layout[key] ?? PAD_STANDARD[key];

  const hidSplitRightY = usesSplitRightY(pad, raw);
  const cXIdx = mayflash ? 5 : wup ? 3 : 2;
  const cYIdx = mayflash ? 2 : wup ? 4 : hidSplitRightY ? 5 : 3;

  const analogAxes = (raw || is8BitDoHid || isSonyHid) && pad.axes?.length >= 6;
  const rawTrigger = (left) => {
    if (!analogAxes) return 0;
    if (mayflash) return triggerAxis(left ? 3 : 4);
    if (wup) return triggerAxis(left ? 2 : 5);
    if (isSonyHid) {
      const idx = left ? 3 : 4;
      if (idx !== cYIdx && hasObservedNegRest(pad, idx)) return triggerAxis(idx);
      return 0;
    }
    if (is8BitDoHid) {
      // Only decode -1..+1 analog trigger axes once observed resting near -1.0 (never treat dead 0.0 axes as half-held shield!).
      const idx7 = left ? 7 : 6;
      if (pad.axes.length >= 8 && hasObservedNegRest(pad, idx7)) return triggerAxis(idx7);
      const idx4 = left ? 4 : 5;
      if (idx4 !== cYIdx && hasObservedNegRest(pad, idx4)) return triggerAxis(idx4);
      return 0;
    }
    return triggerNoise(pressure(pad.axes[left ? 4 : 5]));
  };

  // Diagnostics always report the physical triggers, even when Shield has been rebound.
  const lAnalog = Math.max(triggerNoise(value(layout.shield[0])), rawTrigger(true));
  const rAnalog = Math.max(triggerNoise(value(layout.shield[1])), rawTrigger(false));
  const shields = binds('shield');
  const shieldAnalog = Math.max(0, ...shields.map((i) =>
    i === layout.shield[0] ? lAnalog : i === layout.shield[1] ? rAnalog : triggerNoise(value(i))));

  const rawAxisX = unit(pad.axes?.[0] ?? 0);
  const rawAxisY = unit(-(pad.axes?.[1] ?? 0));
  // Near-linear Melee octagonal-gate response (1.08 curve) for crisp dash-dance, tilts, shield drops & smash flicks.
  const [moveX, rawMoveY] = radialStick(rawAxisX, rawAxisY, config.deadzone, 1.08);
  const [linMoveX, linMoveY] = radialStick(rawAxisX, rawAxisY, config.deadzone, 1.0);
  const cDeadzone = Math.min(config.deadzone, 0.16);
  const [cStickX, cStickY] = radialStick(pad.axes?.[cXIdx] ?? 0, -(pad.axes?.[cYIdx] ?? 0), cDeadzone, 1.0);

  const dpad = sampleDpad(pad);
  const grabs = binds('grab');
  const jumps = binds('jump');
  const z = grabs.at(-1);
  const pauseBinds = binds('pause');

  const values = {
    moveX,
    moveY: rawMoveY,
    rawMoveX: linMoveX,
    rawMoveY: linMoveY,
    cStickX,
    cStickY,
    attack: binds('attack').some(pressed),
    special: binds('special').some(pressed),
    jump: config.zJump ? pressed(z) : jumps.some(pressed),
    grab: config.zJump ? jumps.some(pressed) || grabs.some((i) => i !== z && pressed(i)) : grabs.some(pressed),
    stickJump: config.tapJump && linMoveY >= 0.78,
    shieldAnalog,
    shield: shieldAnalog >= 0.18,
    taunt: binds('taunt').some(pressed),
    pause: pauseBinds.some(pressed),
  };

  // Never include button 9 on 8BitDo raw HID: button 9 is Right Trigger (shield), not Start (button 11).
  const menuStartIndices = layout.pause || PAD_STANDARD.pause;
  const menuButtons = {
    confirm: layout.attack.some(pressed),
    back: layout.special.some(pressed),
    alt: layout.jump.some(pressed),
    start: menuStartIndices.some(pressed),
    lb: raw ? (lAnalog > 0.45 || pressed(layout.shield[0])) : pressed(layout.grab[0] ?? 4),
    rb: raw ? (rAnalog > 0.45 || pressed(layout.shield[1])) : pressed(layout.grab[1] ?? 5),
  };

  return { profile, layout, values, menuButtons, dpad, lAnalog, rAnalog };
}

function merge(into, from) {
  for (const k of AXES) if (Math.abs(from[k] ?? 0) > Math.abs(into[k])) into[k] = from[k];
  into.shieldAnalog = Math.max(into.shieldAnalog, from.shieldAnalog || 0);
  for (const k of [...BUTTONS, ...EDGE_ONLY, 'shortHop', 'stickJump']) into[k] ||= !!from[k];
}

export class InputManager {
  constructor(options = {}) {
    this.options = options;
    this.resetConfig();
    this.setConfig(options.config);
    this.activeMode = 'keyboard';
    this.keys = new Set();
    this.taps = new Set();
    this.touch = createEmptyInput();
    this.touchTaps = new Set();
    this.previous = [];
    this.padPorts = [null, null, null, null];
    this.padBlocked = new Map();
    this.priorPads = new Map();
    this.menuPrevByPad = new Map();
    this.menuHoldByPad = new Map();
    this.menuMode = false;
    this.kbMenuQueue = [];
    this.onPadChange = options.onPadChange || null;
    this.root = null;
    this.onKeyDown = (event) => {
      const { code, target } = event;
      if (event.ctrlKey || event.metaKey || target?.closest?.('input[type="text"], textarea, [contenteditable="true"]')) return;
      if (this.menuMode) {
        if (!MENU_NAV_KEYS.has(code)) return;
        const onNativeControl = Boolean(target?.closest?.('button, a, select, input'));
        if (code === 'Enter' && onNativeControl) return;
        if (target?.tagName === 'SELECT' && (code === 'ArrowUp' || code === 'ArrowDown')) return;
        if (target?.tagName === 'INPUT' && target.type === 'range' && (code === 'ArrowLeft' || code === 'ArrowRight')) return;
        this.activeMode = 'keyboard';
        if (code === 'ArrowUp' || code === 'KeyW') this.kbMenuQueue.push('up');
        else if (code === 'ArrowDown' || code === 'KeyS') this.kbMenuQueue.push('down');
        else if (code === 'ArrowLeft' || code === 'KeyA') this.kbMenuQueue.push('left');
        else if (code === 'ArrowRight' || code === 'KeyD') this.kbMenuQueue.push('right');
        else if (code === 'Enter' && !event.repeat) this.kbMenuQueue.push('confirm');
        else if ((code === 'Escape' || code === 'Backspace') && !event.repeat) this.kbMenuQueue.push('back');
        event.preventDefault();
        return;
      }
      if ((!USED_KEYS.has(code) && !this.boundKeys.has(code)) || (event.altKey && code !== 'AltLeft' && !this.keys.has('AltLeft')) ||
          target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if ((code === 'Space' || code === 'Enter') && target?.closest?.('button, a')) return;
      this.activeMode = 'keyboard';
      if (!this.keys.has(code) && !event.repeat) this.taps.add(code);
      if (!event.repeat || this.keys.has(code)) this.keys.add(code);
      event.preventDefault();
    };
    this.onKeyUp = ({ code }) => this.keys.delete(code);
    this.onBlur = () => this.clearHolds();
    this.onTouch = () => { this.activeMode = 'touch'; };
    this.onGamepadEvent = (event) => {
      const padsList = readPads();
      const padsMap = new Map(padsList.map((pad) => [pad.index, pad]));
      this._syncPadPorts(padsMap);
      if (padsList.length > 0) this.activeMode = 'gamepad';
      const evPad = event?.type === 'gamepadconnected' ? (padsMap.get(event.gamepad?.index) || event.gamepad) : null;
      if (evPad) {
        const slot = Math.max(0, this.padPorts.indexOf(evPad.index));
        if (this.menuMode) {
          this.menuPrevByPad.set(evPad.index, this._sampleSinglePadMenu(evPad, slot));
          this.menuHoldByPad.set(evPad.index, { up: 0, down: 0, left: 0, right: 0 });
        } else {
          const vals = samplePad(evPad, this.config, slot).values;
          const blocked = {};
          for (const k of BLOCKABLE_BUTTONS) blocked[k] = !!vals[k];
          this.padBlocked.set(evPad.index, blocked);
        }
      }
      this.onPadChange?.(this.getControllerDiagnostics());
    };
    this.attach(options.rootEl ?? globalThis.window);
  }

  getConfig() {
    return { ...this.config, keyBinds: copyBinds(this.config.keyBinds), padBinds: copyBinds(this.config.padBinds) };
  }

  setMenuMode(enabled) {
    this.menuMode = Boolean(enabled);
    if (!this.menuMode) this.kbMenuQueue.length = 0;
  }

  getDefaultPadBindings(port = 0) {
    const padsList = readPads();
    const padsMap = new Map(padsList.map((pad) => [pad.index, pad]));
    this._syncPadPorts(padsMap);
    const pad = padsMap.get(this.padPorts[port]) || padsList[0];
    if (pad) {
      const slot = Math.max(0, this.padPorts.indexOf(pad.index));
      return copyBinds(samplePad(pad, this.config, slot).layout);
    }
    if (port === 0 && this.config.padProfile === 'nintendo') return copyBinds(PAD_NINTENDO);
    if (port === 0 && this.config.padProfile === 'gamecube') return copyBinds(MAYFLASH);
    return copyBinds(PAD_STANDARD);
  }

  resetConfig() {
    this.config = defaultConfig();
    this.boundKeys = new Set(Object.values(this.config.keyBinds).flat());
    return this.getConfig();
  }

  setConfig(patch = {}) {
    if (!patch || typeof patch !== 'object') return this.getConfig();
    for (const key of ['tapJump', 'zJump']) if (typeof patch[key] === 'boolean') this.config[key] = patch[key];
    if (['smash', 'tilt'].includes(patch.cStickMode)) this.config.cStickMode = patch.cStickMode;
    if (['auto', 'standard', 'nintendo', 'gamecube'].includes(patch.padProfile)) this.config.padProfile = patch.padProfile;
    if (Number.isFinite(patch.deadzone)) this.config.deadzone = Math.max(0.08, Math.min(0.4, patch.deadzone));
    for (const group of ['keyBinds', 'padBinds']) {
      for (const action of Object.keys(this.config[group])) {
        const binding = patch[group]?.[action];
        if (binding == null) {
          if (binding === null && group === 'padBinds') this.config.padBinds[action] = null;
          continue;
        }
        const codes = Array.isArray(binding) ? binding : [binding];
        const valid = group === 'padBinds' ? (v) => Number.isInteger(v) && v >= 0 && v < 128 :
          (v) => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(v);
        if (codes.every(valid)) this.config[group][action] = [...new Set(codes)];
      }
    }
    this.boundKeys = new Set(Object.values(this.config.keyBinds).flat());
    return this.getConfig();
  }

  getControllerDiagnostics() {
    const padsList = readPads();
    const padsMap = new Map(padsList.map((pad) => [pad.index, pad]));
    this._syncPadPorts(padsMap);
    const connectedPads = padsList.map((pad) => {
      const port = this.padPorts.indexOf(pad.index);
      const padSlot = port >= 0 ? port : 0;
      const { profile, values, lAnalog, rAnalog } = samplePad(pad, this.config, padSlot);
      const { moveX, moveY, cStickX, cStickY } = values;
      const pressedButtons = Array.from(pad.buttons ?? []).flatMap((b, i) =>
        b?.pressed || (b?.value ?? b) > 0.45 ? [i] : []);
      const actions = {
        attack: values.attack,
        special: values.special,
        jump: values.jump,
        shield: values.shield,
        lightShield: values.shieldAnalog >= 0.18 && values.shieldAnalog < 0.78,
        grab: values.grab,
        taunt: values.taunt,
        pause: values.pause,
      };
      const rawAxes = Array.from(pad.axes ?? []).slice(0, 10).map((v) => Math.round(unit(v) * 100) / 100);
      return {
        index: pad.index,
        port,
        id: pad.id,
        mapping: pad.mapping || 'raw',
        profile,
        moveX,
        moveY,
        cStickX,
        cStickY,
        rawAxes,
        lAnalog,
        rAnalog,
        pressedButtons,
        actions,
      };
    });
    connectedPads.sort((a, b) => {
      const pa = a.port >= 0 ? a.port : 99;
      const pb = b.port >= 0 ? b.port : 99;
      return pa - pb || a.index - b.index;
    });
    return { mode: this.activeMode, padPorts: [...this.padPorts], connectedPads };
  }

  attach(rootEl = globalThis.window) {
    if (rootEl === this.root) return;
    this.detach();
    if (!rootEl?.addEventListener) return;
    this.root = rootEl;
    this.keyUpRoot = rootEl.ownerDocument?.defaultView ?? rootEl;
    this.touchRoot = this.options.touchContainer ?? rootEl;
    rootEl.addEventListener('keydown', this.onKeyDown);
    this.keyUpRoot.addEventListener('keyup', this.onKeyUp);
    this.keyUpRoot.addEventListener('blur', this.onBlur);
    this.keyUpRoot.addEventListener('gamepadconnected', this.onGamepadEvent);
    this.keyUpRoot.addEventListener('gamepaddisconnected', this.onGamepadEvent);
    this.touchRoot.addEventListener('touchstart', this.onTouch, { passive: true });
  }

  detach() {
    if (!this.root) return;
    this.root.removeEventListener('keydown', this.onKeyDown);
    this.keyUpRoot.removeEventListener('keyup', this.onKeyUp);
    this.keyUpRoot.removeEventListener('blur', this.onBlur);
    this.keyUpRoot.removeEventListener('gamepadconnected', this.onGamepadEvent);
    this.keyUpRoot.removeEventListener('gamepaddisconnected', this.onGamepadEvent);
    this.touchRoot.removeEventListener('touchstart', this.onTouch);
    this.root = null;
    this.clearHolds();
  }

  setTouchState(patch = {}) {
    this.activeMode = 'touch';
    for (const k of AXES) if (k in patch) this.touch[k] = unit(patch[k]);
    if ('shieldAnalog' in patch || 'lightShield' in patch || 'shield' in patch) {
      this.touch.shieldAnalog = pressure(patch.shieldAnalog ?? (patch.lightShield ? 0.5 : patch.shield ? 1 : 0));
      patch = { ...patch, shield: this.touch.shieldAnalog >= 0.18 };
    }
    for (const k of [...BUTTONS, ...EDGE_ONLY, 'shortHop']) {
      if (k + 'Pressed' in patch && patch[k + 'Pressed']) this.touchTaps.add(k);
      if (!(k in patch)) continue;
      if (patch[k] && !this.touch[k]) this.touchTaps.add(k);
      this.touch[k] = !!patch[k];
    }
  }

  getInputMode() {
    return this.activeMode;
  }

  _syncPadPorts(padsMap) {
    const prevPorts = this.padPorts;
    this.padPorts = Array.from({ length: 4 }, (_, i) => {
      const kept = padsMap.has(prevPorts[i]) ? prevPorts[i] : null;
      if (prevPorts[i] != null && kept == null) this.previous[i] = undefined;
      return kept;
    });
    for (const index of padsMap.keys()) {
      if (this.padPorts.includes(index)) continue;
      const free = this.padPorts.indexOf(null);
      if (free !== -1) this.padPorts[free] = index;
    }
    for (const index of this.padBlocked.keys()) if (!padsMap.has(index)) this.padBlocked.delete(index);
    for (const index of this.menuPrevByPad.keys()) if (!padsMap.has(index)) this.menuPrevByPad.delete(index);
    for (const index of this.menuHoldByPad.keys()) if (!padsMap.has(index)) this.menuHoldByPad.delete(index);
  }

  getPadPorts() {
    const padsMap = new Map(readPads().map((pad) => [pad.index, pad]));
    this._syncPadPorts(padsMap);
    return [...this.padPorts];
  }

  clearHolds() {
    this.keys.clear();
    this.taps.clear();
    this.touch = createEmptyInput();
    this.touchTaps.clear();
    const padsList = readPads();
    const padsMap = new Map(padsList.map((pad) => [pad.index, pad]));
    this._syncPadPorts(padsMap);
    // Seed previous shield/jump state against resolved port assignments so hot-swapped pads don't emit phantom edges.
    this.previous = Array.from({ length: 4 }, (_, port) => {
      const pad = padsMap.get(this.padPorts[port]);
      if (!pad) return undefined;
      const vals = samplePad(pad, this.config, port).values;
      return { shield: !!vals.shield, stickJump: !!vals.stickJump, dedicatedJump: !!vals.jump };
    });
    // Only block held discrete digital buttons (never analog sticks or triggers) until released.
    this.padBlocked = new Map(padsList.map((pad) => {
      const slot = Math.max(0, this.padPorts.indexOf(pad.index));
      const vals = samplePad(pad, this.config, slot).values;
      const blocked = {};
      for (const k of BLOCKABLE_BUTTONS) blocked[k] = !!vals[k];
      return [pad.index, blocked];
    }));
  }

  _sampleSinglePadMenu(pad, padSlot = 0) {
    const s = samplePad(pad, this.config, padSlot);
    // Hardware-profile menu buttons are independent of combat padBinds and Z-jump!
    // Use un-curved stick axes (0.42 threshold) so menu browsing feels immediate on Bluetooth controllers.
    const sx = s.values.rawMoveX || s.values.moveX;
    const sy = s.values.rawMoveY || s.values.moveY;
    const dHoriz = s.dpad.left || s.dpad.right;
    const rawButtons = new Set();
    Array.from(pad.buttons ?? []).forEach((b, i) => {
      if (b?.pressed || (typeof b === 'number' ? b : b?.value || 0) > 0.45) rawButtons.add(i);
    });
    return {
      up: (s.dpad.up && !dHoriz) || sy >= 0.42,
      down: (s.dpad.down && !dHoriz) || sy <= -0.42,
      left: s.dpad.left || sx <= -0.42,
      right: s.dpad.right || sx >= 0.42,
      confirm: s.menuButtons.confirm,
      back: s.menuButtons.back,
      alt: s.menuButtons.alt,
      start: s.menuButtons.start,
      lb: s.menuButtons.lb,
      rb: s.menuButtons.rb,
      select: rawButtons.has(8),
      rawButtons,
    };
  }

  syncMenuButtons() {
    const padsList = readPads();
    const padsMap = new Map(padsList.map((pad) => [pad.index, pad]));
    this._syncPadPorts(padsMap);
    this.menuPrevByPad.clear();
    this.menuHoldByPad.clear();
    for (const pad of padsList) {
      const slot = Math.max(0, this.padPorts.indexOf(pad.index));
      this.menuPrevByPad.set(pad.index, this._sampleSinglePadMenu(pad, slot));
      this.menuHoldByPad.set(pad.index, { up: 0, down: 0, left: 0, right: 0 });
    }
    this.kbMenuQueue.length = 0;
  }

  pollMenu() {
    const padsList = readPads();
    const padsMap = new Map(padsList.map((pad) => [pad.index, pad]));
    this._syncPadPorts(padsMap);
    const pad0 = padsMap.get(this.padPorts[0]) || padsList[0] || null;
    const out = {
      connected: padsList.length > 0,
      keyboardActive: false,
      padCount: padsList.length,
      padPorts: [...this.padPorts],
      padName: pad0?.id ? String(pad0.id).slice(0, 32) : '',
      sourcePort: -1,
      up: false, down: false, left: false, right: false,
      confirm: false, back: false, alt: false, start: false, lb: false, rb: false, select: false,
      rawPressed: [],
      rawPressedByPort: [[], [], [], []],
      perPort: Array.from({ length: 4 }, () => ({
        up: false, down: false, left: false, right: false,
        confirm: false, back: false, alt: false, start: false, lb: false, rb: false, select: false,
      })),
    };
    if (this.kbMenuQueue.length) {
      const queued = this.kbMenuQueue.splice(0, this.kbMenuQueue.length);
      for (const act of queued) {
        if (act in out) out[act] = true;
      }
      out.keyboardActive = true;
    }
    if (!padsList.length) {
      this.menuPrevByPad.clear();
      this.menuHoldByPad.clear();
      return out;
    }

    const rawSeen = new Set();
    for (let port = 0; port < 4; port++) {
      const padIdx = this.padPorts[port];
      if (padIdx == null) continue;
      const pad = padsMap.get(padIdx);
      if (!pad) continue;
      const cur = this._sampleSinglePadMenu(pad, port);
      const prev = this.menuPrevByPad.get(pad.index) || {
        up: false, down: false, left: false, right: false,
        confirm: false, back: false, alt: false, start: false, lb: false, rb: false, select: false,
        rawButtons: new Set(),
      };
      let hold = this.menuHoldByPad.get(pad.index);
      if (!hold) {
        hold = { up: 0, down: 0, left: 0, right: 0 };
        this.menuHoldByPad.set(pad.index, hold);
      }

      let padActed = false;
      for (const dir of MENU_DIRS) {
        if (cur[dir]) {
          hold[dir]++;
          if (hold[dir] === 1 || (hold[dir] >= MENU_REPEAT_DELAY && (hold[dir] - MENU_REPEAT_DELAY) % MENU_REPEAT_RATE === 0)) {
            out[dir] = true;
            out.perPort[port][dir] = true;
            padActed = true;
          }
        } else {
          hold[dir] = 0;
        }
      }

      for (const key of ['confirm', 'back', 'alt', 'start', 'lb', 'rb', 'select']) {
        if (cur[key] && !prev[key]) {
          out[key] = true;
          out.perPort[port][key] = true;
          padActed = true;
        }
      }
      for (const idx of cur.rawButtons) {
        if (!prev.rawButtons.has(idx)) {
          out.rawPressedByPort[port].push(idx);
          if (!rawSeen.has(idx)) {
            rawSeen.add(idx);
            out.rawPressed.push(idx);
          }
          padActed = true;
        }
      }
      if (padActed && out.sourcePort === -1) out.sourcePort = port;
      this.menuPrevByPad.set(pad.index, cur);
    }

    if (out.rawPressed.length || (padsList.length && !out.keyboardActive && (out.up || out.down || out.left || out.right || out.confirm || out.back || out.alt || out.start || out.lb || out.rb))) {
      this.activeMode = 'gamepad';
    }
    return out;
  }

  resolvePadIndexByPort(count, activeHumanPorts = null) {
    const resolved = Array.from({ length: count }, (_, port) => this.padPorts[port] ?? null);
    if (!Array.isArray(activeHumanPorts)) return resolved;
    const humanSet = new Set(activeHumanPorts.filter((p) => Number.isInteger(p) && p >= 0 && p < count));
    const assigned = Array(count).fill(null);
    const usedPadIndices = new Set();
    // Preserve direct port-to-pad binding whenever that port is human.
    for (const port of humanSet) {
      const direct = this.padPorts[port];
      if (direct != null) {
        assigned[port] = direct;
        usedPadIndices.add(direct);
      }
    }
    // Route any remaining unassigned pads to human ports that didn't have a direct pad (e.g. P2 is CPU, P3 is Human).
    for (const port of activeHumanPorts) {
      if (!humanSet.has(port) || assigned[port] != null) continue;
      const spare = this.padPorts.find((idx) => idx != null && !usedPadIndices.has(idx));
      if (spare != null) {
        assigned[port] = spare;
        usedPadIndices.add(spare);
      }
    }
    return assigned;
  }

  poll(portCount = 4, localMultiplayer = this.options.localMultiplayer ?? (portCount > 1), activeHumanPorts = null) {
    const count = Math.max(0, Math.min(4, Math.floor(portCount)));
    const pads = new Map(readPads().map((pad) => [pad.index, pad]));
    this._syncPadPorts(pads);
    const padIndexByPort = this.resolvePadIndexByPort(count, activeHumanPorts);
    const frames = [];
    let padUsed = false;
    const observedPads = new Map();
    for (let port = 0; port < count; port++) {
      const frame = createEmptyInput();
      const taps = new Set();
      const binds = port === 0 ? { ...this.config.keyBinds, pause: P1.pause } : port === 1 && localMultiplayer ? P2 : null;
      if (binds) {
        const down = (...codes) => codes.some((code) => this.keys.has(code));
        const tapped = (codes) => codes.some((code) => this.taps.has(code));
        const [l, r, d, u] = port === 0 ? WASD : ARROWS;
        frame.tiltMod = port === 0 && down('AltLeft', 'KeyF');
        const tapJump = this.config.tapJump && !frame.tiltMod;
        frame.moveX = Number(down(r)) - Number(down(l));
        frame.moveY = Number(down(u)) - Number(down(d));
        const dirJumpKeys = new Set([u]);
        if (port === 0 && !localMultiplayer) dirJumpKeys.add('ArrowUp');
        for (const [k, keys] of Object.entries(binds)) {
          const codes = k === 'shield' && port === 0 && !localMultiplayer && keys.includes('ShiftLeft') ? [...keys, 'ShiftRight'] : keys;
          // Directional Up keys (W / ArrowUp) route through tap-jump (stickJump), keeping dedicated jump keys (Space / I) separate.
          const activeCodes = k === 'jump' ? codes.filter((code) => !dirJumpKeys.has(code)) : codes;
          frame[k] = down(...activeCodes);
          if (tapped(activeCodes)) taps.add(k);
        }
        if (port === 0 && !localMultiplayer) {
          frame.moveX ||= Number(down('ArrowRight')) - Number(down('ArrowLeft'));
          frame.moveY ||= Number(down('ArrowUp')) - Number(down('ArrowDown'));
          const cKey = (code) => Number(down(code) || this.taps.has(code));
          frame.cStickX = cKey('Numpad6') - cKey('Numpad4');
          frame.cStickY = cKey('Numpad8') - cKey('Numpad2');
        } else if (port === 1 && localMultiplayer) {
          const cKey = (code) => Number(down(code) || this.taps.has(code));
          frame.cStickX = cKey('Numpad9') - cKey('Numpad7');
          frame.cStickY = cKey('Numpad8') - cKey('Numpad6');
        }
        if (tapJump) {
          const upHeld = down(u) || (port === 0 && !localMultiplayer && down('ArrowUp'));
          const upTapped = this.taps.has(u) || (port === 0 && !localMultiplayer && this.taps.has('ArrowUp'));
          if (upHeld) frame.stickJump = true;
          if (upTapped) frame.stickJumpTap = true;
        }
        if (frame.tiltMod) {
          frame.moveX *= 0.55;
          frame.moveY *= 0.55;
        }
        frame.rawMoveX = frame.moveX;
        frame.rawMoveY = frame.moveY;
        frame.shieldAnalog = frame.shield || taps.has('shield') ? 1 : frame.lightShield || taps.has('lightShield') ? 0.5 : 0;
        frame.shield ||= frame.lightShield;
        if (taps.has('lightShield')) taps.add('shield');
      }
      if (port === 0) {
        merge(frame, this.touch);
        for (const k of this.touchTaps) taps.add(k);
      }
      const pad = pads.get(padIndexByPort[port]);
      if (pad) {
        const padSlot = Math.max(0, this.padPorts.indexOf(pad.index));
        const values = samplePad(pad, this.config, padSlot).values;
        const blocked = this.padBlocked.get(pad.index);
        if (blocked) {
          for (const k of BLOCKABLE_BUTTONS) {
            if (!values[k]) blocked[k] = false;
            if (blocked[k]) {
              values[k] = false;
              if (k === 'shield') values.shieldAnalog = 0;
            }
          }
        }
        const prevPad = this.priorPads.get(pad.index);
        padUsed ||= Object.entries(values).some(([k, v]) =>
          (typeof v === 'boolean' ? v && !prevPad?.[k] : Math.abs(v - (prevPad?.[k] || 0)) > 0.35 && !!v));
        observedPads.set(pad.index, values);
        merge(frame, values);
      }
      frame.lightShield = frame.shieldAnalog >= 0.18 && frame.shieldAnalog < 0.78;
      frame.cStickTilt = this.config.cStickMode === 'tilt';
      const prior = this.previous[port];
      const dedicatedJumpHeld = !!frame.jump;
      const dedicatedJumpPressed = taps.has('jump') || (!prior?.dedicatedJump && dedicatedJumpHeld);
      const stickJumpEdge = !!(frame.stickJumpTap || (frame.stickJump && !prior?.stickJump));
      frame.tapJumpPressed = stickJumpEdge && !dedicatedJumpPressed;
      if (stickJumpEdge || dedicatedJumpPressed) taps.add('jump');
      frame.jump ||= !!frame.stickJump;
      const held = { stickJump: !!frame.stickJump, dedicatedJump: dedicatedJumpHeld };
      for (const k of [...BUTTONS, ...EDGE_ONLY, 'shortHop']) {
        held[k] = !!frame[k];
        frame[k + 'Pressed'] = taps.has(k) || (!prior?.[k] && held[k]);
      }
      if (Math.hypot(frame.moveX, frame.moveY) > 1) {
        const mag = Math.hypot(frame.moveX, frame.moveY);
        frame.moveX /= mag;
        frame.moveY /= mag;
      }
      delete frame.shortHop;
      delete frame.stickJump;
      delete frame.stickJumpTap;
      delete frame.taunt;
      delete frame.pause;
      this.previous[port] = held;
      frames.push(frame);
    }
    this.previous.length = count;
    if (padUsed) this.activeMode = 'gamepad';
    this.priorPads = observedPads;
    this.taps.clear();
    this.touchTaps.clear();
    return frames;
  }

  rumblePort(port, { weak = 0.35, strong = 0.55, durationMs = 110 } = {}) {
    try {
      const pads = readPads();
      if (!pads.length) return false;
      const padsMap = new Map(pads.map((p) => [p.index, p]));
      this._syncPadPorts(padsMap);
      const padIdx = this.padPorts[port];
      const pad = padIdx != null ? padsMap.get(padIdx) : null;
      const act = pad?.vibrationActuator;
      if (!act || typeof act.playEffect !== 'function') return false;
      const p = act.playEffect(act.type || 'dual-rumble', {
        startDelay: 0,
        duration: Math.max(25, Math.min(600, Math.round(durationMs))),
        weakMagnitude: Math.max(0, Math.min(1, weak)),
        strongMagnitude: Math.max(0, Math.min(1, strong)),
      });
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return true;
    } catch {
      return false;
    }
  }
}
