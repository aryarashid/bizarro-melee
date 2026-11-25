/**
 * Shared physics constants, Melee decomp-derived formulas, action states, and enums.
 * Knockback math mirrors `KNOCKBACK` / `ftColl_80079AB0` in src/melee/ft/ftcoll.c.
 */

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const WORLD_SCALE = 10;

export const MELEE = {
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
  SHIELD_REGEN: 0.08,
  SHIELD_DRAIN: 0.28,
  SHIELD_STUN_MULT: 0.445,
  SHIELD_STUN_BASE: 2,
  SHIELD_BREAK_DIZZY_FRAMES: 240,
  LCANCEL_WINDOW: 7,
  TECH_WINDOW: 20,
  LEDGE_INVINCIBILITY: 30,
  LEDGE_REGRAB_COOLDOWN: 35,
  RESPAWN_INVINCIBILITY: 120,
  RESPAWN_PLATFORM_MAX: 180,
  AIRDODGE_FRAMES: 28,
  AIRDODGE_INTANGIBLE_START: 4,
  AIRDODGE_INTANGIBLE_END: 22,
  AIRDODGE_SPEED: 3.1,
  WAVEDASH_FRICTION_MULT: 1.0,
  SPOTDODGE_FRAMES: 22,
  ROLL_FRAMES: 30,
  STALE_QUEUE_LEN: 9,
  STALE_WEIGHTS: [0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01],
};

/**
 * Exact Melee knockback formula from src/melee/ft/ftcoll.c (`KNOCKBACK` macro).
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
