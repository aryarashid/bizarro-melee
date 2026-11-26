/* Shared combat constants, action states and enums. */

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const WORLD_SCALE = 10;

export const MELEE = {
  METAL_WEIGHT_MULT: 1.65,
  METAL_FALL_MULT: 1.25,
  METAL_DAMAGE_MULT: 1.2,
  METAL_ARMOR_KB: 72,
  BUNNY_GROUND_MULT: 1.42,
  BUNNY_AIR_MULT: 1.3,
  BUNNY_JUMP_MULT: 1.22,
  FREEZE_MASH_BONUS: 6,
  FREEZE_SHATTER_DAMAGE: 12,
  KB_PERCENT_COEFF: 0.1,
  KB_DAMAGE_COEFF: 0.05,
  KB_WEIGHT_SCALE: 200,
  KB_WEIGHT_BASE: 100,
  KB_GLOBAL_MULT: 1.4,
  KB_FLAT_ADD: 18,
  KB_MAX: 2500,
  KB_TO_VEL: 0.03,
  KB_DECAY: 0.051,
  HITSTUN_MULT: 0.4,
  HITLAG_MULT: 0.3333,
  HITLAG_BASE: 3,
  TUMBLE_KB_THRESHOLD: 80,
  DI_MAX_DEGREES: 18,
  CROUCH_CANCEL_MULT: 0.67,
  POWERSHIELD_WINDOW: 4,
  POWERSHIELD_REFLECT_SPEED: 1.5,
  SMASH_CHARGE_MAX_FRAMES: 60,
  SMASH_CHARGE_MAX_MULT: 1.4,
  METEOR_CANCEL_MIN_FRAMES: 8,
  WALL_JUMP_VX: 10.5,
  WALL_JUMP_VY: 15.8,
  SHIELD_MAX: 60,
  LIGHT_SHIELD_RADIUS: 1.22,
  LIGHT_SHIELD_DAMAGE: 0.88,
  SHIELD_REGEN: 0.08,
  SHIELD_DRAIN: 0.28,
  SHIELD_STUN_MULT: 0.445,
  SHIELD_STUN_BASE: 2,
  SHIELD_BREAK_DIZZY_FRAMES: 240,
  LCANCEL_WINDOW: 7,
  TECH_WINDOW: 20,
  TECH_LOCKOUT: 40,
  GROUND_BOUNCE_SPEED: 11.5,
  GROUND_BOUNCE_KB_VY: 5.5,
  GROUND_BOUNCE_RESTITUTION: 0.46,
  LEDGE_INVINCIBILITY: 28,
  LEDGE_REGRAB_COOLDOWN: 35,
  RESPAWN_INVINCIBILITY: 120,
  RESPAWN_PLATFORM_MAX: 180,
  AIRDODGE_FRAMES: 28,
  AIRDODGE_INTANGIBLE_START: 4,
  AIRDODGE_INTANGIBLE_END: 22,
  AIRDODGE_SPEED: 3.1,
  WAVEDASH_LANDING_SPEED: 15.3,
  SPOTDODGE_FRAMES: 22,
  ROLL_FRAMES: 30,
  STALE_QUEUE_LEN: 9,
  STALE_WEIGHTS: [0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01],
  CLANK_DAMAGE_DIFF: 9,
  CLANK_REBOUND_BASE: 5,
  CLANK_REBOUND_MULT: 0.65,
  HIT_TIER_MEDIUM_KB: 52,
  HIT_TIER_HEAVY_KB: 95,
  HIT_TIER_COLOSSAL_KB: 145,
};

/*
 * Calculate launch force after damage, weight, move scaling and charge.
 */
export function computeMeleeKnockback(percent, damage, weight, bkb, kbg, setKb = 0, ratio = 1.0) {
  let inner;
  if (setKb > 0) {
    inner = 10 * MELEE.KB_PERCENT_COEFF + MELEE.KB_DAMAGE_COEFF * (10 * setKb);
  } else {
    inner = percent * MELEE.KB_PERCENT_COEFF + (percent * damage) * MELEE.KB_DAMAGE_COEFF;
  }
  const weightFactor = MELEE.KB_WEIGHT_SCALE / (weight + MELEE.KB_WEIGHT_BASE);
  const scaled = (0.01 * kbg) * ((MELEE.KB_GLOBAL_MULT * (weightFactor * inner)) + MELEE.KB_FLAT_ADD) + bkb;
  return Math.min(MELEE.KB_MAX, Math.max(0, ratio * scaled));
}

export const STATE = Object.freeze({
  IDLE: 'idle',
  WALK: 'walk',
  DASH: 'dash',
  RUN: 'run',
  TURN: 'turn',
  CROUCH: 'crouch',
  JUMPSQUAT: 'jumpsquat',
  AIRBORNE: 'airborne',
  LANDING: 'landing',
  AIRDODGE: 'airdodge',
  FREEFALL: 'freefall',
  SHIELD: 'shield',
  SHIELD_STUN: 'shieldStun',
  SHIELD_BREAK: 'shieldBreak',
  SPOTDODGE: 'spotdodge',
  ROLL_F: 'rollF',
  ROLL_B: 'rollB',
  LEDGE_HANG: 'ledgeHang',
  LEDGE_CLIMB: 'ledgeClimb',
  ATTACK: 'attack',
  SMASH_CHARGE: 'smashCharge',
  GRAB: 'grab',
  GRAB_HOLD: 'grabHold',
  GRABBED: 'grabbed',
  THROW: 'throw',
  HITSTUN: 'hitstun',
  TUMBLE: 'tumble',
  TECH: 'tech',
  KNOCKDOWN: 'knockdown',
  TAUNT: 'taunt',
  RESPAWN: 'respawn',
  DEAD: 'dead',
});

export const MOVE = Object.freeze({
  JAB: 'jab',
  JAB2: 'jab2',
  JAB3: 'jab3',
  FTILT: 'ftilt',
  UTILT: 'utilt',
  DTILT: 'dtilt',
  DASH_ATTACK: 'dashAttack',
  FSMASH: 'fsmash',
  USMASH: 'usmash',
  DSMASH: 'dsmash',
  NAIR: 'nair',
  FAIR: 'fair',
  BAIR: 'bair',
  UAIR: 'uair',
  DAIR: 'dair',
  NEUTRAL_B: 'neutralB',
  SIDE_B: 'sideB',
  UP_B: 'upB',
  DOWN_B: 'downB',
  FTHROW: 'fthrow',
  BTHROW: 'bthrow',
  UTHROW: 'uthrow',
  DTHROW: 'dthrow',
  LEDGE_ATTACK: 'ledgeAttack',
  GETUP_ATTACK: 'getupAttack',
  ZAIR: 'zair',
  ITEM_SWING: 'itemSwing',
  ITEM_THROW: 'itemThrow',
});

export const MODE = Object.freeze({
  VS_STOCK: 'vs-stock',
  VS_TIME: 'vs-time',
  CLASSIC: 'classic',
  HOMERUN: 'homerun',
  TARGETS: 'targets',
  MULTIMAN: 'multiman',
  EVENT: 'event',
  TRAINING: 'training',
  ONLINE: 'online',
});

export const ITEM_FREQUENCY = Object.freeze({
  OFF: 'off',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

export const PLAYER_COLORS = ['#ff4b5c', '#3898ff', '#ffd23f', '#42e695'];
export const PORT_LABELS = ['P1', 'P2', 'P3', 'P4'];

export const GAME_VERSION = '2.0.0';

// ============================================================================
// CROSS-ENGINE DETERMINISTIC MATH (IEEE-754 + - * / AND Math.sqrt ONLY)
// Guarantees bit-identical simulation across V8 (Chrome/Node/Deno), JSC (Safari/Bun),
// and SpiderMonkey (Firefox) without relying on engine-specific libm trig/hypot.
// ============================================================================
const HALF_PI = 1.5707963267948966;
const INV_HALF_PI = 0.6366197723675814;
const SQRT3 = 1.7320508075688772;
const TAN_PI_12 = 0.2679491924311227;
const PI_6 = 0.5235987755982989;
const PI_4 = 0.7853981633974483;

function polySin(r) {
  const r2 = r * r;
  return r * (1 + r2 * (-1 / 6 + r2 * (1 / 120 + r2 * (-1 / 5040 + r2 * (1 / 362880 + r2 * (-1 / 39916800 + r2 / 6227020800))))));
}

function polyCos(r) {
  const r2 = r * r;
  return 1 + r2 * (-0.5 + r2 * (1 / 24 + r2 * (-1 / 720 + r2 * (1 / 40320 + r2 * (-1 / 3628800 + r2 / 479001600)))));
}

export function detSin(x) {
  if (!Number.isFinite(x)) return NaN;
  const k = Math.floor(x * INV_HALF_PI + 0.5);
  const r = x - k * HALF_PI;
  const q = ((k % 4) + 4) % 4;
  if (q === 0) return polySin(r);
  if (q === 1) return polyCos(r);
  if (q === 2) return -polySin(r);
  return -polyCos(r);
}

export function detCos(x) {
  if (!Number.isFinite(x)) return NaN;
  const k = Math.floor(x * INV_HALF_PI + 0.5);
  const r = x - k * HALF_PI;
  const q = ((k % 4) + 4) % 4;
  if (q === 0) return polyCos(r);
  if (q === 1) return -polySin(r);
  if (q === 2) return -polyCos(r);
  return polySin(r);
}

export function detTan(x) {
  return detSin(x) / detCos(x);
}

function polyAtanUnit(z) {
  let offset = 0;
  let t = z;
  if (t > TAN_PI_12) {
    t = (t * SQRT3 - 1) / (SQRT3 + t);
    offset = PI_6;
  }
  const t2 = t * t;
  const p = t * (1 + t2 * (-1 / 3 + t2 * (1 / 5 + t2 * (-1 / 7 + t2 * (1 / 9 + t2 * (-1 / 11 + t2 * (1 / 13 + t2 * (-1 / 15 + t2 / 17))))))));
  return offset + p;
}

export function detAtan2(y, x) {
  if (x === 0) {
    if (y > 0) return HALF_PI;
    if (y < 0) return -HALF_PI;
    return 0;
  }
  const ax = x < 0 ? -x : x;
  const ay = y < 0 ? -y : y;
  let angle;
  if (ay <= ax) {
    angle = polyAtanUnit(ay / ax);
  } else {
    angle = HALF_PI - polyAtanUnit(ax / ay);
  }
  if (x < 0) angle = Math.PI - angle;
  return y < 0 ? -angle : angle;
}

export function detHypot(x, y) {
  return Math.sqrt(x * x + y * y);
}
