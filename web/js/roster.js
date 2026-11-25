/**
 * Complete 26-character Bizarro Parody Roster (+ Sagging Bag & Master Mitt boss),
 * mapping every single playable fighter in src/melee/ft/kinds/ to an original,
 * hilarious Bizarro parody with Melee-faithful physics profiles, frame data,
 * special moves, alt palettes, and procedural rig metadata.
 */

import { MOVE } from './constants.js';

/**
 * Helper to build a complete, responsive Melee moveset from an archetype + character overrides.
 * Every move specifies:
 *   startup, active, endlag (frames at 60Hz)
 *   landingLag (for aerials; halved on L-cancel!)
 *   damage, bkb, kbg, angle (degrees, 0=fwd, 90=up, 270=meteor, 361=Sakurai angle)
 *   reach, radius, offsetX, offsetY (relative to fighter center/facing)
 *   setKb (optional fixed KB, e.g., Fox/Falco Shine)
 *   kind (optional special behavior: 'projectile', 'reflector', 'counter', 'recovery',
 *         'dashBurst', 'rest', 'chargeShot', 'stone', 'cape', 'judge', 'teleport', 'commandGrab', 'multiHit', 'selfDmg')
 */
function baseMoveset(scale = {}) {
  const dmg = scale.dmg || 1;
  const reach = scale.reach || 1;
  const spd = scale.spd || 1; // >1 faster startup/endlag
  const f = (n) => Math.max(1, Math.round(n / spd));
  const d = (n) => Math.max(1, Math.round(n * dmg));
  const r = (n) => Math.round(n * reach);

  return {
    [MOVE.JAB]: {
      name: 'Jab', startup: f(3), active: 3, endlag: f(9),
      damage: d(4), bkb: 20, kbg: 25, angle: 361, offsetX: r(34), offsetY: 36, radius: r(22),
    },
    [MOVE.FTILT]: {
      name: 'Forward Tilt', startup: f(6), active: 4, endlag: f(13),
      damage: d(9), bkb: 32, kbg: 78, angle: 35, offsetX: r(42), offsetY: 34, radius: r(26),
    },
    [MOVE.UTILT]: {
      name: 'Up Tilt', startup: f(5), active: 5, endlag: f(13),
      damage: d(8), bkb: 42, kbg: 92, angle: 86, offsetX: r(18), offsetY: 68, radius: r(28),
    },
    [MOVE.DTILT]: {
      name: 'Down Tilt', startup: f(6), active: 4, endlag: f(12),
      damage: d(7), bkb: 36, kbg: 68, angle: 72, offsetX: r(40), offsetY: 14, radius: r(24),
    },
    [MOVE.DASH_ATTACK]: {
      name: 'Dash Attack', startup: f(6), active: 7, endlag: f(16),
      damage: d(9), bkb: 42, kbg: 82, angle: 50, offsetX: r(38), offsetY: 32, radius: r(28),
      boostX: 4.5,
    },
    [MOVE.FSMASH]: {
      name: 'Forward Smash', startup: f(13), active: 4, endlag: f(22),
      damage: d(16), bkb: 44, kbg: 108, angle: 38, offsetX: r(50), offsetY: 36, radius: r(32),
      chargeable: true, sweetspot: true,
    },
    [MOVE.USMASH]: {
      name: 'Up Smash', startup: f(9), active: 5, endlag: f(21),
      damage: d(15), bkb: 46, kbg: 112, angle: 85, offsetX: r(14), offsetY: 74, radius: r(32),
      chargeable: true, sweetspot: true,
    },
    [MOVE.DSMASH]: {
      name: 'Down Smash', startup: f(8), active: 5, endlag: f(20),
      damage: d(13), bkb: 42, kbg: 96, angle: 28, offsetX: r(34), offsetY: 14, radius: r(32),
      bothSides: true, chargeable: true,
    },
    [MOVE.NAIR]: {
      name: 'Neutral Air', startup: f(4), active: 10, endlag: f(12), landingLag: f(12),
      damage: d(9), bkb: 30, kbg: 82, angle: 42, offsetX: r(20), offsetY: 34, radius: r(30),
    },
    [MOVE.FAIR]: {
      name: 'Forward Air', startup: f(7), active: 5, endlag: f(16), landingLag: f(15),
      damage: d(12), bkb: 34, kbg: 94, angle: 36, offsetX: r(44), offsetY: 36, radius: r(28),
    },
    [MOVE.BAIR]: {
      name: 'Back Air', startup: f(6), active: 6, endlag: f(15), landingLag: f(14),
      damage: d(13), bkb: 36, kbg: 100, angle: 144, offsetX: -r(42), offsetY: 34, radius: r(28),
    },
    [MOVE.UAIR]: {
      name: 'Up Air', startup: f(6), active: 6, endlag: f(14), landingLag: f(14),
      damage: d(11), bkb: 38, kbg: 96, angle: 85, offsetX: r(8), offsetY: 72, radius: r(30),
    },
    [MOVE.DAIR]: {
      name: 'Down Air', startup: f(9), active: 5, endlag: f(18), landingLag: f(18),
      damage: d(12), bkb: 32, kbg: 92, angle: 270, offsetX: r(12), offsetY: -6, radius: r(28),
      meteor: true,
    },
    [MOVE.NEUTRAL_B]: {
      name: 'Neutral Special', startup: f(11), active: 4, endlag: f(16),
      damage: d(7), bkb: 24, kbg: 48, angle: 45, offsetX: 38, offsetY: 38, radius: 18,
      kind: 'projectile', projSpeed: 12, projLife: 55, projGravity: 0.28, projBounce: true,
    },
    [MOVE.SIDE_B]: {
      name: 'Side Special', startup: f(10), active: 10, endlag: f(18),
      damage: d(10), bkb: 40, kbg: 80, angle: 42, offsetX: 36, offsetY: 34, radius: 28,
      kind: 'dashBurst', burstX: 14, burstY: 1,
    },
    [MOVE.UP_B]: {
      name: 'Up Special', startup: f(6), active: 14, endlag: f(16),
      damage: d(10), bkb: 46, kbg: 88, angle: 76, offsetX: 16, offsetY: 48, radius: 30,
      kind: 'recovery', recoveryX: 8.5, recoveryY: 18.5,
    },
    [MOVE.DOWN_B]: {
      name: 'Down Special', startup: f(5), active: 10, endlag: f(14),
      damage: d(9), bkb: 38, kbg: 76, angle: 65, offsetX: 12, offsetY: 34, radius: 34,
      kind: 'spin',
    },
    [MOVE.FTHROW]: {
      name: 'Forward Throw', startup: 8, active: 2, endlag: 14,
      damage: d(9), bkb: 48, kbg: 72, angle: 45,
    },
    [MOVE.BTHROW]: {
      name: 'Back Throw', startup: 9, active: 2, endlag: 15,
      damage: d(10), bkb: 52, kbg: 84, angle: 138,
    },
    [MOVE.UTHROW]: {
      name: 'Up Throw', startup: 8, active: 2, endlag: 14,
      damage: d(8), bkb: 54, kbg: 76, angle: 88,
    },
    [MOVE.DTHROW]: {
      name: 'Down Throw', startup: 9, active: 2, endlag: 14,
      damage: d(7), bkb: 44, kbg: 56, angle: 78,
    },
    [MOVE.LEDGE_ATTACK]: {
      name: 'Ledge Attack', startup: 8, active: 5, endlag: 14,
      damage: d(8), bkb: 46, kbg: 70, angle: 40, offsetX: 38, offsetY: 28, radius: 28,
    },
  };
}

// Hitbox frame ranges are zero-based offsets from the first active frame.
function sweetAndSour(sweet, sour) {
  return [
    { ...sweet, priority: 1, sweetspot: true },
    { ...sour, priority: 0, sweetspot: false, meteor: false },
  ];
}

function flurry(hits, interval, linkDamage, finalDamage, finalAngle, finalBkb, finalKbg) {
  return { active: (hits - 1) * interval + 2,
    multiHit: { hits, interval, linkDamage, finalDamage, finalAngle, finalBkb, finalKbg } };
}

const judgeRolls = [
  { damage: 2, bkb: 2, kbg: 12, angle: 12, selfDamage: 12 },
  { damage: 4, bkb: 16, kbg: 40, angle: 30 },
  { damage: 6, bkb: 26, kbg: 52, angle: 22, shieldDamageMult: 3 },
  { damage: 8, bkb: 36, kbg: 78, angle: 38, element: 'slash' },
  { damage: 3, element: 'electric', ...flurry(3, 3, 2, 4, 86, 40, 80) },
  { damage: 14, bkb: 48, kbg: 105, angle: 42, element: 'fire' },
  { damage: 14, bkb: 40, kbg: 75, angle: 82, dropItem: 'cold_pizza' },
  { damage: 10, bkb: 20, kbg: 40, angle: 80, freezeFrames: 40, element: 'ice' },
  { damage: 32, bkb: 145, kbg: 185, angle: 38, sweetspot: true, element: 'lightning' },
];

// Keep the broad kind for CPU move selection. The technique defines its frame-by-frame behavior.
function rocketRecovery(style, startup, active, speed, damage) {
  return { kind: 'recovery', technique: 'chargeLaunch', style, startup, active, endlag: 14,
    speed, damage, offsetX: 0, offsetY: 31, radius: 34 };
}

function quickAttack(damage) {
  return { kind: 'recovery', technique: 'quickAttack', style: 'electric', startup: 8,
    active: 12, endlag: 12, speed: 24, damage, offsetX: 0, offsetY: 27, radius: 25 };
}

function warp(style, startup, speed, damage) {
  return { kind: 'teleport', technique: 'teleport360', style, startup, active: 10,
    endlag: 14, speed, damage, offsetX: 0, offsetY: 32, radius: 52 };
}

function makeFighter(cfg) {
  const moves = baseMoveset(cfg.moveScale || {});
  if (cfg.moves) {
    for (const [k, patch] of Object.entries(cfg.moves)) {
      moves[k] = { ...moves[k], ...patch };
      if (patch.projGravity === 0 && patch.projBounce == null) moves[k].projBounce = false;
    }
  }
  return {
    id: cfg.id,
    meleeKind: cfg.meleeKind,
    voiceType: cfg.voiceType, voicePitch: cfg.voicePitch,
    canFloat: !!cfg.canFloat, doubleJumpArmor: cfg.doubleJumpArmor ?? 0,
    name: cfg.name,
    parodyOf: cfg.parodyOf,
    epithet: cfg.epithet,
    bio: cfg.bio,
    taunt: cfg.taunt,
    tierMeme: cfg.tierMeme || 'BIZARRO TIER',
    // Melee-scaled physical attributes (world units/frame)
    stats: {
      weight: cfg.stats.weight ?? 100,
      gravity: cfg.stats.gravity ?? 0.62,
      fallSpeed: cfg.stats.fallSpeed ?? 12.2,
      fastFallSpeed: cfg.stats.fastFallSpeed ?? 17.5,
      walkSpeed: cfg.stats.walkSpeed ?? 5.5,
      dashSpeed: cfg.stats.dashSpeed ?? 11.2,
      runSpeed: cfg.stats.runSpeed ?? 10.4,
      traction: cfg.stats.traction ?? 0.72,
      airAccel: cfg.stats.airAccel ?? 0.56,
      airSpeed: cfg.stats.airSpeed ?? 7.8,
      jumpSquat: cfg.stats.jumpSquat ?? 4,
      shortHopVel: cfg.stats.shortHopVel ?? 11.4,
      fullHopVel: cfg.stats.fullHopVel ?? 16.6,
      doubleJumpVel: cfg.stats.doubleJumpVel ?? 15.2,
      maxJumps: cfg.stats.maxJumps ?? 2,
      width: cfg.stats.width ?? 44,
      height: cfg.stats.height ?? 72,
      grabRange: cfg.stats.grabRange ?? 54,
      shieldRadius: cfg.stats.shieldRadius ?? 42,
      floaty: !!cfg.stats.floaty,
    },
    // 4 alt costumes (primary, secondary, accent, skin/trim)
    palettes: cfg.palettes,
    // Procedural rig descriptor for render.js
    rig: cfg.rig,
    moves,
  };
}

/**
 * ALL 26 PLAYABLE BIZARRO MELEE FIGHTERS
 * Ordered in authentic Melee CSS layout!
 */
export const ROSTER = [
  // Row 1: Dr. Bario, Bario, Squeegi, Sourzer, Screech, Broshee, Wonky Kong, Captain Pigeon, Dadondorf
  makeFighter({
    id: 'dr-bario', meleeKind: 'ftDrMario', name: 'Dr. Bario', parodyOf: 'Dr. Mario',
    voiceType: 'snarky', voicePitch: 0.91,
    epithet: 'Unlicensed Megavitamin Dealer',
    bio: 'Lost his plumbing license and immediately opened an alley clinic. Prescribes suspiciously bouncy giant capsules.',
    taunt: '"Take two & call my lawyer!"',
    stats: { weight: 100, gravity: 0.65, fallSpeed: 12.4, fastFallSpeed: 17.8, runSpeed: 10.2, dashSpeed: 11.0, traction: 0.78, jumpSquat: 4, fullHopVel: 16.4, doubleJumpVel: 15.0 },
    moveScale: { dmg: 1.12, spd: 1.02 },
    palettes: [
      { body: '#f0f4ff', outfit: '#1cc8d8', accent: '#ffdd44', skin: '#ffd4b2' },
      { body: '#242938', outfit: '#ff5277', accent: '#62ffe2', skin: '#ffd4b2' },
      { body: '#d8ffd8', outfit: '#2b7a4b', accent: '#ff9a3c', skin: '#ffd4b2' },
      { body: '#ffe0f5', outfit: '#8c3bf5', accent: '#ffee66', skin: '#ffd4b2' },
    ],
    rig: { silhouette: 'stout', hat: 'headmirror', stache: 'wide', prop: 'pill', cape: 'labcoat', eyes: 'shades' },
    moves: {
      [MOVE.FAIR]: { name: 'Malpractice Punch', damage: 16, bkb: 44, kbg: 112, angle: 34, startup: 12, sweetspot: true,
        hitboxes: sweetAndSour({ offsetX: 56, radius: 16, through: 2 },
          { offsetX: 33, radius: 29, damage: 9, bkb: 28, kbg: 76 }) },
      [MOVE.NEUTRAL_B]: { name: 'Suspect Pill', kind: 'projectile', damage: 9, projSpeed: 11.5, projLife: 62, projGravity: 0.34, projBounce: true, projStyle: 'pill' },
      [MOVE.SIDE_B]: { name: 'Clip-Board Flip', kind: 'cape', startup: 8, active: 8, endlag: 14, damage: 8, bkb: 24, kbg: 32, angle: 110 },
      [MOVE.UP_B]: { name: 'Co-Pay Uppercut', kind: 'recovery', damage: 13, recoveryX: 7.5, recoveryY: 18.8 },
      [MOVE.DOWN_B]: { name: 'Tornado Diagnosis', kind: 'spin', damage: 11, liftY: 4.8,
        ...flurry(4, 4, 2, 6, 55, 46, 94) },
      [MOVE.BTHROW]: { name: 'Malpractice YEET', damage: 12, bkb: 64, kbg: 104, angle: 142 },
    },
  }),

  makeFighter({
    id: 'bario', meleeKind: 'ftMario', name: 'Bario', parodyOf: 'Mario',
    voiceType: 'hero', voicePitch: 1.14,
    epithet: 'Overqualified Corporate Plumber',
    bio: 'Wears inverted cyan overalls and a yellow bowler hat. Never fixes pipes—only invoices them.',
    taunt: '"Per my last email!"',
    stats: { weight: 100, gravity: 0.64, fallSpeed: 12.2, fastFallSpeed: 17.6, runSpeed: 10.6, dashSpeed: 11.4, traction: 0.72, jumpSquat: 4, fullHopVel: 16.8, doubleJumpVel: 15.2 },
    palettes: [
      { body: '#1cd4e8', outfit: '#ffcf33', accent: '#ff3b7f', skin: '#ffd4b2' },
      { body: '#3b3266', outfit: '#65ff9a', accent: '#ff7043', skin: '#ffd4b2' },
      { body: '#ff6644', outfit: '#ffffff', accent: '#23304d', skin: '#ffd4b2' },
      { body: '#1f2430', outfit: '#ff4b5c', accent: '#ffd23f', skin: '#ffd4b2' },
    ],
    rig: { silhouette: 'stout', hat: 'bowler', stache: 'curl', prop: 'monocle', cape: 'nda', eyes: 'monocle' },
    moves: {
      [MOVE.DTHROW]: { startup: 10, endlag: 11, bkb: 38, angle: 72 },
      [MOVE.FAIR]: { name: 'Dunk Memo', damage: 14, bkb: 32, kbg: 96, angle: 280, startup: 13, meteor: true,
        hitboxes: sweetAndSour({ offsetX: 49, offsetY: 24, radius: 17, through: 2 },
          { offsetX: 34, radius: 30, damage: 8, angle: 42, kbg: 72 }) },
      [MOVE.NEUTRAL_B]: { name: 'Lukewarm Espresso', kind: 'projectile', damage: 7, projSpeed: 11.2, projLife: 65, projGravity: 0.3, projBounce: true, projStyle: 'fireball' },
      [MOVE.SIDE_B]: { name: 'Laminated NDA', kind: 'cape', startup: 8, active: 9, endlag: 13, damage: 7, bkb: 20, kbg: 30, angle: 100 },
      [MOVE.UP_B]: { name: 'Invoice Shoryuken', kind: 'recovery', damage: 12, recoveryX: 8.2, recoveryY: 19.2 },
      [MOVE.DOWN_B]: { name: 'Bario Cyclone', kind: 'spin', damage: 10, liftY: 5.2,
        ...flurry(5, 3, 1.5, 5, 72, 42, 86) },
    },
  }),

  makeFighter({
    id: 'squeegi', meleeKind: 'ftLuigi', name: 'Squeegi', parodyOf: 'Luigi',
    voiceType: 'cute', voicePitch: 1.23,
    epithet: 'Frictionless Window-Washer',
    bio: 'Wears industrial soap shoes with near-zero traction. One wavedash crosses the entire zip code.',
    taunt: '"Wavedash?! I slipped!"',
    stats: { weight: 100, gravity: 0.49, fallSpeed: 10.6, fastFallSpeed: 15.4, runSpeed: 9.8, dashSpeed: 10.8, traction: 0.22, airSpeed: 6.9, jumpSquat: 4, fullHopVel: 17.4, doubleJumpVel: 16.0 },
    moveScale: { spd: 1.08 },
    palettes: [
      { body: '#9b4dff', outfit: '#44f57a', accent: '#fff066', skin: '#ffe0c4' },
      { body: '#ff70a6', outfit: '#38d9ff', accent: '#ffffff', skin: '#ffe0c4' },
      { body: '#2a2e45', outfit: '#ff9f1c', accent: '#6effb8', skin: '#ffe0c4' },
      { body: '#e0f7ff', outfit: '#3b82f6', accent: '#ff5277', skin: '#ffe0c4' },
    ],
    rig: { silhouette: 'tall', hat: 'capTall', stache: 'pointy', prop: 'squeegee', eyes: 'wide' },
    moves: {
      [MOVE.NEUTRAL_B]: { name: 'Soap Bubble Blast', kind: 'projectile', damage: 7, projSpeed: 10.5, projLife: 60, projGravity: 0, projAngle: 0, projStyle: 'greenFire' },
      [MOVE.SIDE_B]: { name: 'Squeegee Misfire', kind: 'dashBurst', technique: 'chargeMissile', style: 'fire', startup: 1, active: 14, endlag: 20, damage: 18, bkb: 52, kbg: 106, angle: 34, speed: 22, misfireChance: 1 / 6 },
      [MOVE.UP_B]: { name: 'Sweetspot Shoryu-Slip', kind: 'recovery', startup: 5, active: 12, endlag: 20, damage: 22, bkb: 64, kbg: 118, angle: 84, recoveryX: 6.5, recoveryY: 20.5, sweetspot: true },
      [MOVE.DOWN_B]: { name: 'Suds Cyclone', kind: 'spin', damage: 11, liftY: 6.8,
        ...flurry(6, 2, 1, 6, 88, 50, 96) },
    },
  }),

  makeFighter({
    id: 'sourzer', meleeKind: 'ftKoopa', name: 'Sourzer', parodyOf: 'Bowser',
    voiceType: 'heavy', voicePitch: 0.61,
    epithet: 'Grumpy HOA Dragon-Turtle',
    bio: 'Enormous, heavy, and furious about your lawn height. Spiked lawnmower shell and nuclear dropkicks.',
    taunt: '"Your grass is 1/8 inch tall!"',
    stats: { weight: 122, gravity: 0.72, fallSpeed: 13.4, fastFallSpeed: 18.6, runSpeed: 9.0, dashSpeed: 10.0, traction: 0.85, airSpeed: 6.8, jumpSquat: 6, fullHopVel: 16.4, doubleJumpVel: 15.0, width: 60, height: 86, shieldRadius: 52 },
    moveScale: { dmg: 1.38, reach: 1.25, spd: 0.82 },
    palettes: [
      { body: '#ff6b35', outfit: '#38b000', accent: '#ffe14d', skin: '#ffd08a' },
      { body: '#4a1c6b', outfit: '#ff2e88', accent: '#62f5ff', skin: '#d8b4fe' },
      { body: '#1f2937', outfit: '#ef4444', accent: '#facc15', skin: '#fca5a5' },
      { body: '#0ea5e9', outfit: '#f8fafc', accent: '#f97316', skin: '#bae6fd' },
    ],
    rig: { silhouette: 'brute', hat: 'horns', prop: 'shellSpikes', eyes: 'angry' },
    moves: {
      [MOVE.BTHROW]: { startup: 14, endlag: 24, bkb: 65 },
      [MOVE.FSMASH]: { name: 'HOA Violation Dropkick', damage: 23, bkb: 56, kbg: 118, angle: 34, startup: 18, sweetspot: true,
        hitboxes: sweetAndSour({ offsetX: 74, radius: 14 },
          { offsetX: 37, radius: 27, damage: 14, bkb: 30, kbg: 73 }) },
      [MOVE.NEUTRAL_B]: { name: 'Complaint Breath', kind: 'projectile', damage: 9, projSpeed: 10.5, projLife: 32, projGravity: 0, projAngle: 0, projStyle: 'flame' },
      [MOVE.SIDE_B]: { name: 'Eviction Claw', kind: 'commandGrab', startup: 10, active: 6, endlag: 18, damage: 15, bkb: 52, kbg: 92, angle: 44 },
      [MOVE.UP_B]: { name: 'Lawnmower Fortress', kind: 'recovery', startup: 5, active: 18, endlag: 18, damage: 13, recoveryX: 11.0, recoveryY: 16.5 },
      [MOVE.DOWN_B]: { name: 'Zoning Bomb', kind: 'stone', startup: 14, active: 18, endlag: 22, damage: 20, bkb: 58, kbg: 102, angle: 70 },
    },
  }),

  makeFighter({
    id: 'screech', meleeKind: 'ftPeach', name: 'Screech', parodyOf: 'Peach',
    voiceType: 'snarky', voicePitch: 1.4, canFloat: true,
    epithet: 'Passive-Aggressive Aristocrat',
    bio: 'Levitates through sheer entitlement. Yanks horrifically grumpy turnip-potatoes straight out of thin air.',
    taunt: '"Oh, bless your neutral game."',
    stats: { weight: 90, gravity: 0.48, fallSpeed: 10.2, fastFallSpeed: 14.8, runSpeed: 9.4, dashSpeed: 10.2, traction: 0.85, airSpeed: 7.9, jumpSquat: 5, fullHopVel: 15.8, doubleJumpVel: 15.0, floaty: true },
    moveScale: { dmg: 1.08, reach: 1.04 },
    palettes: [
      { body: '#ff77c8', outfit: '#ffe866', accent: '#62f5ff', skin: '#ffe4cf' },
      { body: '#b04cff', outfit: '#ffdb4d', accent: '#ffffff', skin: '#ffe4cf' },
      { body: '#2ad6a3', outfit: '#fff1a8', accent: '#ff5277', skin: '#ffe4cf' },
      { body: '#f4f7ff', outfit: '#ff4265', accent: '#3898ff', skin: '#ffe4cf' },
    ],
    rig: { silhouette: 'dress', hat: 'tiara', prop: 'fryingPan', eyes: 'smug' },
    moves: {
      [MOVE.DSMASH]: { name: 'Blender Skirt', damage: 18, bkb: 44, kbg: 102, angle: 30, startup: 6, bothSides: true,
        ...flurry(6, 3, 3, 6, 30, 48, 104) },
      [MOVE.FAIR]: { name: 'Crown Slap', damage: 15, bkb: 44, kbg: 110, angle: 38, startup: 12, sweetspot: true },
      [MOVE.NEUTRAL_B]: { name: 'Butler Counter', kind: 'counter', startup: 5, active: 18, endlag: 16, damage: 14, bkb: 48, kbg: 96, angle: 45 },
      [MOVE.SIDE_B]: { name: 'Hip-Check Audit', kind: 'dashBurst', damage: 14, bkb: 48, kbg: 98, angle: 40, burstX: 15.5, burstY: 2.5 },
      [MOVE.UP_B]: { name: 'Parasol Float', kind: 'recovery', parasol: true, damage: 11, recoveryX: 9.0, recoveryY: 19.6 },
      [MOVE.DOWN_B]: { name: 'Ugly Turnip Toss', kind: 'projectile', damage: 11, projSpeed: 12.5, projLife: 70, projGravity: 0.36, projStyle: 'turnip' },
    },
  }),

  makeFighter({
    id: 'broshee', meleeKind: 'ftYoshi', name: 'Broshee', parodyOf: 'Yoshi',
    voiceType: 'cute', voicePitch: 1.32, doubleJumpArmor: 120,
    epithet: 'Tax-Evading Dino Bro',
    bio: 'Backwards snapback, neon shades, armored double-jump, and an inexplicable trail of offshore eggs.',
    taunt: '"Deductions, bro!"',
    stats: { weight: 108, gravity: 0.60, fallSpeed: 12.2, fastFallSpeed: 17.6, runSpeed: 11.2, dashSpeed: 11.8, traction: 0.68, airSpeed: 9.2, jumpSquat: 5, fullHopVel: 16.5, doubleJumpVel: 18.2 },
    moveScale: { dmg: 1.08 },
    palettes: [
      { body: '#52e84a', outfit: '#ff5277', accent: '#ffe14d', skin: '#f5fff0' },
      { body: '#38bdf8', outfit: '#f97316', accent: '#ffffff', skin: '#e0f7ff' },
      { body: '#facc15', outfit: '#8b5cf6', accent: '#34d399', skin: '#fefce8' },
      { body: '#ff5c93', outfit: '#14b8a6', accent: '#fde047', skin: '#fff1f5' },
    ],
    rig: { silhouette: 'dino', hat: 'snapback', prop: 'shades', eyes: 'shades' },
    moves: {
      [MOVE.DAIR]: { name: 'Flutter Tax Stomp', damage: 16, bkb: 38, kbg: 88, angle: 76, startup: 10, meteor: false,
        ...flurry(5, 3, 3, 4, 76, 38, 88) },
      [MOVE.NEUTRAL_B]: { name: 'Shell-Company Gulp', kind: 'commandGrab', damage: 10, bkb: 42, kbg: 72, angle: 65 },
      [MOVE.SIDE_B]: { name: 'Egg Rollout', kind: 'dashBurst', damage: 11, burstX: 15, burstY: 1 },
      [MOVE.UP_B]: { name: 'Offshore Egg Lob', kind: 'projectile', damage: 9, projSpeed: 12.5, projLife: 70, projGravity: 0.35, projAngle: 52, projStyle: 'egg', selfLiftY: 7 },
      [MOVE.DOWN_B]: { name: 'Dino Ground Pound', kind: 'stone', damage: 16, bkb: 52, kbg: 96, angle: 68 },
    },
  }),

  makeFighter({
    id: 'wonky-kong', meleeKind: 'ftDonkey', name: 'Wonky Kong', parodyOf: 'Donkey Kong',
    voiceType: 'heavy', voicePitch: 0.76,
    epithet: 'Anxious Accountant Ape',
    bio: 'Overworked CPA gorilla with oversized reading glasses and a tiny red tie. Charges an apocalyptic binder punch.',
    taunt: '"Q4 closes IN FIVE MINUTES!"',
    stats: { weight: 115, gravity: 0.68, fallSpeed: 13.6, fastFallSpeed: 18.8, runSpeed: 11.4, dashSpeed: 12.0, traction: 0.76, airSpeed: 8.1, jumpSquat: 5, fullHopVel: 16.8, doubleJumpVel: 15.6, width: 58, height: 84, grabRange: 66 },
    moveScale: { dmg: 1.28, reach: 1.22, spd: 0.9 },
    palettes: [
      { body: '#9c5628', outfit: '#ff3b5c', accent: '#ffe14d', skin: '#f2c18d' },
      { body: '#242938', outfit: '#44f5ff', accent: '#ffdd44', skin: '#d8b490' },
      { body: '#6b3fa0', outfit: '#52ff9a', accent: '#ffffff', skin: '#e8c4b0' },
      { body: '#d97706', outfit: '#2563eb', accent: '#fef08a', skin: '#fde68a' },
    ],
    rig: { silhouette: 'brute', hat: 'glasses', prop: 'tie', eyes: 'glasses' },
    moves: {
      [MOVE.BAIR]: { name: 'Spreadsheet Back-Kick', damage: 14, bkb: 38, kbg: 102, angle: 146, startup: 7 },
      [MOVE.DAIR]: { name: 'Audit Meteor', damage: 16, bkb: 34, kbg: 102, angle: 270, startup: 12, meteor: true },
      [MOVE.NEUTRAL_B]: { name: 'Giant Binder Punch', kind: 'chargePunch', style: 'kinetic', storableCharge: true, startup: 12, active: 5, endlag: 22, damage: 24, bkb: 64, kbg: 122, angle: 36, offsetX: 54, offsetY: 38, radius: 36, sweetspot: true,
        hitboxes: sweetAndSour({ offsetX: 71, radius: 14 },
          { offsetX: 36, radius: 27, damage: 16, bkb: 30, kbg: 73 }) },
      [MOVE.SIDE_B]: { name: 'Desk Headbutt', damage: 14, bkb: 44, kbg: 88, angle: 80, startup: 12 },
      [MOVE.UP_B]: { name: 'Spinning Ledger', kind: 'recovery', damage: 13, recoveryX: 12.5, recoveryY: 14.5 },
      [MOVE.DOWN_B]: { name: 'Tax-Season Hand Slap', kind: 'spin', damage: 12, bkb: 48, kbg: 76, angle: 82, radius: 52 },
    },
  }),

  makeFighter({
    id: 'captain-pigeon', meleeKind: 'ftCaptain', name: 'Captain Pigeon', parodyOf: 'Captain Falcon',
    voiceType: 'hero', voicePitch: 0.93,
    epithet: 'Unlicensed Bread-Racer',
    bio: 'Mach-2 street-racer wearing a feathered golden helmet. Screams about breadcrumbs while landing frame-perfect Knees.',
    taunt: '"SHOW ME YOUR CRUMBS!"',
    stats: { weight: 104, gravity: 0.78, fallSpeed: 15.2, fastFallSpeed: 20.4, runSpeed: 14.4, dashSpeed: 14.8, traction: 0.72, airSpeed: 9.4, jumpSquat: 4, fullHopVel: 17.6, doubleJumpVel: 16.0, width: 46, height: 78 },
    moveScale: { dmg: 1.18, reach: 1.1, spd: 1.06 },
    palettes: [
      { body: '#3b6bff', outfit: '#ffdd33', accent: '#ff3b5c', skin: '#f5cfa8' },
      { body: '#ff4265', outfit: '#ffffff', accent: '#38f5ff', skin: '#f5cfa8' },
      { body: '#1f2937', outfit: '#f472b6', accent: '#facc15', skin: '#f5cfa8' },
      { body: '#16a34a', outfit: '#fde047', accent: '#f97316', skin: '#f5cfa8' },
    ],
    rig: { silhouette: 'hero', hat: 'birdHelmet', prop: 'scarf', eyes: 'visor' },
    moves: {
      [MOVE.FAIR]: { name: 'Knee of Bread', startup: 11, active: 11, endlag: 18, landingLag: 16, damage: 19, bkb: 52, kbg: 124, angle: 32, offsetX: 46, offsetY: 34, radius: 28, sweetspot: true,
        hitboxes: sweetAndSour({ offsetX: 51, radius: 20, through: 1, element: 'electric' },
          { offsetX: 43, radius: 25, damage: 6, bkb: 22, kbg: 68 }) },
      [MOVE.DAIR]: { name: 'Pigeon Stomp', startup: 12, active: 5, endlag: 16, landingLag: 16, damage: 15, bkb: 38, kbg: 104, angle: 270, meteor: true, sweetspot: true },
      [MOVE.NEUTRAL_B]: { name: 'Bread Punch', kind: 'powerPunch', style: 'fire', element: 'fire', startup: 36, active: 5, endlag: 24, damage: 27, bkb: 70, kbg: 128, angle: 36, offsetX: 54, offsetY: 38, radius: 38, sweetspot: true },
      [MOVE.SIDE_B]: { name: 'Raptor Swoop', kind: 'dashBurst', damage: 13, bkb: 52, kbg: 88, angle: 78, burstX: 16, burstY: 1 },
      [MOVE.UP_B]: { name: 'Bread Dive', kind: 'recovery', damage: 14, recoveryX: 9.5, recoveryY: 19.2 },
      [MOVE.DOWN_B]: { name: 'Pigeon Kick', kind: 'dashBurst', damage: 13, bkb: 44, kbg: 96, angle: 36, burstX: 18, burstY: -2 },
    },
  }),

  makeFighter({
    id: 'dadondorf', meleeKind: 'ftGanon', name: 'Dadondorf', parodyOf: 'Ganondorf',
    voiceType: 'heavy', voicePitch: 0.67,
    epithet: 'Grill-Master Warlock',
    bio: 'Socks, sandals, cargo shorts, and a cursed stainless-steel spatula. Every single hit feels like a cinderblock.',
    taunt: '"Who touched the thermostat?!"',
    stats: { weight: 112, gravity: 0.72, fallSpeed: 13.6, fastFallSpeed: 18.8, runSpeed: 9.6, dashSpeed: 10.6, traction: 0.76, airSpeed: 7.4, jumpSquat: 6, fullHopVel: 16.0, doubleJumpVel: 15.0, width: 52, height: 86 },
    moveScale: { dmg: 1.44, reach: 1.18, spd: 0.8 },
    palettes: [
      { body: '#4c2c69', outfit: '#e85d04', accent: '#ffd166', skin: '#789e78' },
      { body: '#1e293b', outfit: '#ef4444', accent: '#38bdf8', skin: '#86efac' },
      { body: '#7c2d12', outfit: '#facc15', accent: '#ffffff', skin: '#a3b18a' },
      { body: '#0f766e', outfit: '#f472b6', accent: '#fde047', skin: '#94a3b8' },
    ],
    rig: { silhouette: 'tallBrute', hat: 'grillCap', prop: 'spatula', cape: 'apron', eyes: 'angry' },
    moves: {
      [MOVE.FTHROW]: { startup: 13, endlag: 23, bkb: 60 },
      [MOVE.FAIR]: { name: 'Spatula Flip of Doom', startup: 12, active: 5, endlag: 20, damage: 19, bkb: 52, kbg: 118, angle: 34, sweetspot: true },
      [MOVE.DAIR]: { name: 'Sandal Stomp', startup: 13, active: 5, endlag: 18, damage: 20, bkb: 46, kbg: 116, angle: 270, meteor: true,
        hitboxes: sweetAndSour({ offsetX: 10, offsetY: -15, radius: 21, through: 2 },
          { offsetX: 10, offsetY: 6, damage: 12, angle: 65, kbg: 84 }) },
      [MOVE.NEUTRAL_B]: { name: 'Grill Punch', kind: 'powerPunch', style: 'dark', startup: 42, active: 5, endlag: 26, damage: 30, bkb: 76, kbg: 134, angle: 34, offsetX: 54, offsetY: 40, radius: 40, sweetspot: true },
      [MOVE.SIDE_B]: { name: 'Gerudo Grill-Choke', kind: 'dashBurst', damage: 16, bkb: 56, kbg: 96, angle: 76, burstX: 15, burstY: 1 },
      [MOVE.UP_B]: { name: 'Propane Dive', kind: 'recovery', damage: 16, recoveryX: 8.5, recoveryY: 18.2 },
      [MOVE.DOWN_B]: { name: 'Charcoal Kick', kind: 'dashBurst', damage: 16, bkb: 48, kbg: 102, angle: 38, burstX: 17, burstY: -3 },
    },
  }),

  // Row 2: Falcon't, Faux, Mess, Slush Shovelers, Flurby, Shamus, Velda, Zink, Tiny Zink
  makeFighter({
    id: 'falcont', meleeKind: 'ftFalco', name: "Falcon't", parodyOf: 'Falco',
    voiceType: 'snarky', voicePitch: 1.08,
    epithet: 'Snarky Lounge-Lizard Toucan',
    bio: 'Obnoxiously huge beak, sky-high jump, stun-lasers, vertical Shine, and an illegal Frame-5 spike.',
    taunt: '"Hands off my sourdough!"',
    stats: { weight: 80, gravity: 0.88, fallSpeed: 16.4, fastFallSpeed: 21.8, runSpeed: 11.4, dashSpeed: 12.6, traction: 0.72, airSpeed: 8.0, jumpSquat: 5, fullHopVel: 19.6, doubleJumpVel: 18.0 },
    moveScale: { dmg: 1.05, spd: 1.15 },
    palettes: [
      { body: '#2563eb', outfit: '#f97316', accent: '#fde047', skin: '#ff922b' },
      { body: '#dc2626', outfit: '#f8fafc', accent: '#38bdf8', skin: '#fbbf24' },
      { body: '#16a34a', outfit: '#1e293b', accent: '#a3e635', skin: '#f97316' },
      { body: '#7c3aed', outfit: '#f472b6', accent: '#67e8f9', skin: '#facc15' },
    ],
    rig: { silhouette: 'bird', hat: 'toucanBeak', prop: 'shades', eyes: 'shades' },
    moves: {
      [MOVE.DAIR]: { name: 'Toucan Guillotine', startup: 5, active: 8, endlag: 14, landingLag: 12, damage: 13, bkb: 34, kbg: 100, angle: 270, meteor: true,
        hitboxes: sweetAndSour({ through: 3 }, { from: 4, damage: 8, angle: 56, kbg: 72 }) },
      [MOVE.BAIR]: { name: 'Beak Back-Kick', startup: 4, active: 6, endlag: 13, landingLag: 11, damage: 14, bkb: 40, kbg: 106, angle: 144 },
      [MOVE.NEUTRAL_B]: { name: 'Snark Stun-Laser', kind: 'projectile', startup: 8, active: 2, endlag: 12, damage: 4, bkb: 16, kbg: 10, angle: 40, projSpeed: 21, projLife: 46, projGravity: 0, projAngle: 0, projStyle: 'laser', hitstunOnly: true },
      [MOVE.SIDE_B]: { name: 'Toucan Phantasm', kind: 'dashBurst', technique: 'illusion', style: 'electric', startup: 10, active: 7, endlag: 16, speed: 25, damage: 9, bkb: 30, kbg: 72, angle: 72, airMeteor: true },
      [MOVE.UP_B]: { name: 'Fire-Toucan', ...rocketRecovery('fire', 32, 18, 23, 13) },
      [MOVE.DOWN_B]: { name: 'Vertical Bread Shine', kind: 'reflector', startup: 1, active: 5, endlag: 9, damage: 8, bkb: 64, kbg: 54, angle: 86, setKb: 0, radius: 42, jumpCancel: true },
    },
  }),

  makeFighter({
    id: 'faux', meleeKind: 'ftFox', name: 'Faux', parodyOf: 'Fox',
    voiceType: 'hero', voicePitch: 1.31,
    epithet: '20XX Caffeine Coyote',
    bio: 'Vibrating at 600 BPM on quad-shot espresso. Frame-1 Shine, blinding dash-dance, and a terrifying Up-Smash.',
    taunt: '"BLIP BLIP COME ON!"',
    stats: { weight: 76, gravity: 0.90, fallSpeed: 16.0, fastFallSpeed: 21.4, runSpeed: 13.8, dashSpeed: 14.4, traction: 0.72, airSpeed: 8.2, jumpSquat: 3, fullHopVel: 18.0, doubleJumpVel: 16.6 },
    moveScale: { dmg: 1.04, spd: 1.24 },
    palettes: [
      { body: '#ff8c38', outfit: '#e2e8f0', accent: '#38f5ff', skin: '#fff1d6' },
      { body: '#ef4444', outfit: '#1e293b', accent: '#facc15', skin: '#ffe4c4' },
      { body: '#22c55e', outfit: '#f8fafc', accent: '#f472b6', skin: '#ffe4c4' },
      { body: '#3b82f6', outfit: '#0f172a', accent: '#67e8f9', skin: '#dbeafe' },
    ],
    rig: { silhouette: 'fox', hat: 'foxEars', prop: 'aviators', tail: 'bushy', eyes: 'shades' },
    moves: {
      [MOVE.UTHROW]: { startup: 5, endlag: 8 },
      [MOVE.DAIR]: { name: 'Espresso Drill', startup: 5, meteor: false, ...flurry(6, 3, 2, 4, 275, 24, 66) },
      [MOVE.USMASH]: { name: '20XX Up-Smash', startup: 7, active: 5, endlag: 18, damage: 18, bkb: 52, kbg: 122, angle: 82, sweetspot: true, chargeable: true },
      [MOVE.BAIR]: { name: 'Coyote Back-Air', startup: 4, active: 7, endlag: 12, landingLag: 10, damage: 14, bkb: 40, kbg: 106, angle: 144 },
      [MOVE.UAIR]: { name: 'Double-Espresso Up-Air', startup: 6, active: 6, endlag: 12, landingLag: 11, damage: 15, bkb: 46, kbg: 112, angle: 86, sweetspot: true },
      [MOVE.NEUTRAL_B]: { name: 'Espresso Pew', kind: 'projectile', startup: 5, active: 2, endlag: 8, damage: 3, bkb: 0, kbg: 0, angle: 45, projSpeed: 24, projLife: 42, projGravity: 0, projAngle: 0, projStyle: 'laser', noFlinch: true },
      [MOVE.SIDE_B]: { name: 'Faux Illusion', kind: 'dashBurst', technique: 'illusion', style: 'kinetic', startup: 11, active: 8, endlag: 15, speed: 26, damage: 8, bkb: 38, kbg: 68, angle: 72 },
      [MOVE.UP_B]: { name: 'Fire-Faux', ...rocketRecovery('fire', 34, 20, 25, 14), burnInterval: 4 },
      [MOVE.DOWN_B]: { name: 'HYPE SHINE', kind: 'reflector', startup: 1, active: 5, endlag: 8, damage: 6, bkb: 0, kbg: 100, setKb: 82, angle: 18, radius: 42, jumpCancel: true },
    },
  }),

  makeFighter({
    id: 'mess', meleeKind: 'ftNess', name: 'Mess', parodyOf: 'Ness',
    voiceType: 'mystic', voicePitch: 1.36,
    epithet: 'Psychic Laundry Kid',
    bio: 'Wears an oversized hoodie and fights with tangled earbuds, a broomstick, and unstable appliance telekinesis.',
    taunt: '"OKAY... I GUESS."',
    stats: { weight: 94, gravity: 0.56, fallSpeed: 11.4, fastFallSpeed: 16.4, runSpeed: 10.2, dashSpeed: 10.8, traction: 0.68, airSpeed: 8.6, jumpSquat: 4, fullHopVel: 16.2, doubleJumpVel: 17.0, width: 40, height: 64 },
    moveScale: { dmg: 1.06 },
    palettes: [
      { body: '#ff4d6d', outfit: '#3b82f6', accent: '#ffe14d', skin: '#ffe0c8' },
      { body: '#22c55e', outfit: '#1e293b', accent: '#f97316', skin: '#ffe0c8' },
      { body: '#a855f7', outfit: '#facc15', accent: '#38bdf8', skin: '#ffe0c8' },
      { body: '#0ea5e9', outfit: '#f43f5e', accent: '#ffffff', skin: '#ffe0c8' },
    ],
    rig: { silhouette: 'kid', hat: 'backCap', prop: 'bat', eyes: 'dot' },
    moves: {
      [MOVE.FSMASH]: { name: 'Broomstick Home-Run', damage: 19, bkb: 54, kbg: 116, angle: 36, startup: 14, sweetspot: true, reflects: true,
        hitboxes: sweetAndSour({ offsetX: 71, radius: 14 },
          { offsetX: 36, radius: 27, damage: 11, bkb: 30, kbg: 73 }) },
      [MOVE.BTHROW]: { name: 'Telekinetic Yeet', damage: 13, bkb: 72, kbg: 122, angle: 138 },
      [MOVE.NEUTRAL_B]: { name: 'PK-WiFi Pulse', kind: 'projectile', damage: 15, bkb: 52, kbg: 102, projSpeed: 9.5, projLife: 65, projGravity: 0.14, projStyle: 'orb' },
      [MOVE.SIDE_B]: { name: 'PK-Microwave', kind: 'projectile', damage: 10, bkb: 24, kbg: 40, projSpeed: 13.0, projLife: 45, projGravity: 0.08, projStyle: 'fireball' },
      [MOVE.UP_B]: { name: 'PK-Rocket Self-Launch', ...rocketRecovery('psychic', 26, 22, 26, 23), bkb: 68, kbg: 120 },
      [MOVE.DOWN_B]: { name: 'Laundry Magnet', kind: 'reflector', startup: 4, active: 14, endlag: 10, damage: 5, bkb: 28, kbg: 40, radius: 44, healOnAbsorb: true },
    },
  }),

  makeFighter({
    id: 'slush-shovelers', meleeKind: 'ftPopo', name: 'Slush Shovelers', parodyOf: 'Ice Climbers',
    voiceType: 'cute', voicePitch: 1.48,
    epithet: 'Suburban Snow-Clearer Duo',
    bio: 'Pops and his chaotic cardboard sidekick Nana-Bot swing twin plastic snow shovels and fling frozen driveway slush.',
    taunt: '"Watch the driveway!"',
    stats: { weight: 88, gravity: 0.56, fallSpeed: 11.2, fastFallSpeed: 16.4, runSpeed: 10.0, dashSpeed: 10.6, traction: 0.36, airSpeed: 7.4, jumpSquat: 3, fullHopVel: 16.6, doubleJumpVel: 15.6, width: 44, height: 66 },
    moveScale: { dmg: 1.12, reach: 1.06 },
    palettes: [
      { body: '#38bdf8', outfit: '#f472b6', accent: '#ffffff', skin: '#ffe0c4' },
      { body: '#22c55e', outfit: '#facc15', accent: '#ffffff', skin: '#ffe0c4' },
      { body: '#f97316', outfit: '#6366f1', accent: '#ffffff', skin: '#ffe0c4' },
      { body: '#ef4444', outfit: '#14b8a6', accent: '#ffffff', skin: '#ffe0c4' },
    ],
    rig: { silhouette: 'parka', hat: 'hood', prop: 'shovel', buddy: true, eyes: 'dot' },
    moves: {
      [MOVE.FSMASH]: { name: 'Twin Shovel Bonk', damage: 19, bkb: 48, kbg: 112, angle: 36, startup: 12, sweetspot: true,
        ...flurry(2, 4, 7, 13, 36, 48, 112) },
      [MOVE.NEUTRAL_B]: { name: 'Slush Block', kind: 'projectile', damage: 8, projSpeed: 9.8, projLife: 72, projGravity: 0.4, projSlide: true, projStyle: 'ice' },
      [MOVE.SIDE_B]: { name: 'Snowblower Spin', kind: 'dashBurst', damage: 12, burstX: 12, burstY: 4.5 },
      [MOVE.UP_B]: { name: 'Bungee Belay', kind: 'recovery', damage: 11, recoveryX: 9.0, recoveryY: 20.5 },
      [MOVE.DOWN_B]: { name: 'Driveway Blizzard', kind: 'spin', damage: 11, bkb: 38, kbg: 84, radius: 52 },
    },
  }),

  makeFighter({
    id: 'flurby', meleeKind: 'ftKirby', name: 'Flurby', parodyOf: 'Kirby',
    voiceType: 'cute', voicePitch: 1.73,
    epithet: 'Existential Lint Ball',
    bio: 'Perpetually unimpressed pink dust-bunny with 6 jumps. Turns into an expired block of extra-firm tofu on command.',
    taunt: '"...meh."',
    stats: { weight: 72, gravity: 0.47, fallSpeed: 10.0, fastFallSpeed: 15.0, runSpeed: 9.8, dashSpeed: 10.4, traction: 0.80, airSpeed: 7.4, jumpSquat: 3, fullHopVel: 15.0, doubleJumpVel: 13.6, maxJumps: 6, width: 42, height: 46 },
    moveScale: { dmg: 1.0, spd: 1.08 },
    palettes: [
      { body: '#ff8ac8', outfit: '#e11d48', accent: '#fff066', skin: '#ff8ac8' },
      { body: '#fde047', outfit: '#f97316', accent: '#38bdf8', skin: '#fde047' },
      { body: '#60a5fa', outfit: '#1d4ed8', accent: '#f472b6', skin: '#60a5fa' },
      { body: '#a7f3d0', outfit: '#059669', accent: '#facc15', skin: '#a7f3d0' },
    ],
    rig: { silhouette: 'puff', hat: 'unimpressed', prop: 'tofu', eyes: 'unimpressed' },
    moves: {
      [MOVE.JAB]: { name: 'Lint Tap', damage: 3, hitstunOnly: true },
      [MOVE.JAB3]: { name: 'Lint Barrage', startup: 2, endlag: 11, offsetX: 34, offsetY: 30, radius: 26, damage: 4, angle: 38, bkb: 38, kbg: 72, ...flurry(6, 2, 1, 4, 38, 38, 72) },
      [MOVE.UTILT]: { name: 'Lint Kick', damage: 9, bkb: 44, kbg: 86, angle: 88, startup: 4 },
      [MOVE.NEUTRAL_B]: { name: 'Vacuum Sigh', kind: 'commandGrab', damage: 11, bkb: 44, kbg: 76, angle: 50 },
      [MOVE.SIDE_B]: { name: 'Mallet of Apathy', startup: 16, active: 5, endlag: 20, damage: 21, bkb: 56, kbg: 112, angle: 36, sweetspot: true },
      [MOVE.UP_B]: { name: 'Final Paper-Cutter', kind: 'recovery', damage: 13, recoveryX: 7.0, recoveryY: 19.6,
        ...flurry(4, 3, 2, 7, 78, 46, 88) },
      [MOVE.DOWN_B]: { name: 'Expired Tofu Drop', kind: 'stone', startup: 12, active: 22, endlag: 18, damage: 18, bkb: 54, kbg: 104, angle: 64 },
    },
  }),

  makeFighter({
    id: 'shamus', meleeKind: 'ftSamus', name: 'Shamus', parodyOf: 'Samus',
    voiceType: 'robot', voicePitch: 0.84,
    epithet: 'Discount Space HVAC Tech',
    bio: 'Armor cobbled together from dryer ducts and chrome tape. Charges massive lukewarm air-blasts and drops Roombas.',
    taunt: '"Filter change is $400!"',
    stats: { weight: 110, gravity: 0.45, fallSpeed: 10.2, fastFallSpeed: 15.6, runSpeed: 9.8, dashSpeed: 10.6, traction: 0.62, airSpeed: 7.6, jumpSquat: 3, fullHopVel: 16.4, doubleJumpVel: 15.4, width: 48, height: 82, grabRange: 96 },
    moveScale: { dmg: 1.1, reach: 1.12 },
    palettes: [
      { body: '#ff7b24', outfit: '#e11d48', accent: '#34f5a8', skin: '#fbbf24' },
      { body: '#a855f7', outfit: '#312e81', accent: '#67e8f9', skin: '#e9d5ff' },
      { body: '#ec4899', outfit: '#f8fafc', accent: '#4ade80', skin: '#fbcfe8' },
      { body: '#1e293b', outfit: '#475569', accent: '#facc15', skin: '#94a3b8' },
    ],
    rig: { silhouette: 'armor', hat: 'visorHelm', prop: 'armCannon', eyes: 'visor' },
    moves: {
      [MOVE.NEUTRAL_B]: { name: 'HVAC Charge Blast', kind: 'chargeShot', storableCharge: true, projBounce: false, startup: 9, active: 4, endlag: 16, damage: 21, bkb: 54, kbg: 106, projSpeed: 17.5, projLife: 62, projGravity: 0, projAngle: 0, projStyle: 'chargeOrb', sweetspot: true },
      [MOVE.SIDE_B]: { name: 'Duct Missile', kind: 'projectile', startup: 12, active: 3, endlag: 18, damage: 11, bkb: 38, kbg: 76, projSpeed: 14.0, projLife: 65, projGravity: 0, projAngle: 0, projStyle: 'missile' },
      [MOVE.UP_B]: { name: 'Duct-Tape Screw Attack', kind: 'recovery', startup: 4, endlag: 16, damage: 13, recoveryX: 7.5, recoveryY: 19.2,
        ...flurry(5, 3, 2, 5, 80, 52, 98) },
      [MOVE.DOWN_B]: { name: 'Roomba Bomb', kind: 'projectile', startup: 8, active: 4, endlag: 14, damage: 9, bkb: 38, kbg: 66, projSpeed: 2.0, projLife: 55, projGravity: 0.3, projBounce: true, projStyle: 'bomb', selfLiftY: 7.5 },
    },
  }),

  makeFighter({
    id: 'velda', meleeKind: 'ftZelda', name: 'Velda', parodyOf: 'Zelda',
    voiceType: 'mystic', voicePitch: 1.17,
    epithet: 'Dramatic Astrologer',
    bio: 'Blames every missed tech on Mercury retrograde. Delivers absurdly lethal Lightning-Heel kicks.',
    taunt: '"That is SO Aquarius of you."',
    stats: { weight: 90, gravity: 0.49, fallSpeed: 10.4, fastFallSpeed: 15.0, runSpeed: 9.2, dashSpeed: 9.8, traction: 0.85, airSpeed: 7.6, jumpSquat: 5, fullHopVel: 16.0, doubleJumpVel: 15.2 },
    moveScale: { dmg: 1.12 },
    palettes: [
      { body: '#c084fc', outfit: '#f43f5e', accent: '#fde047', skin: '#ffe4cf' },
      { body: '#38bdf8', outfit: '#1d4ed8', accent: '#ffffff', skin: '#ffe4cf' },
      { body: '#1f2937', outfit: '#a855f7', accent: '#34d399', skin: '#ffe4cf' },
      { body: '#fb7185', outfit: '#fbbf24', accent: '#ffffff', skin: '#ffe4cf' },
    ],
    rig: { silhouette: 'dress', hat: 'mysticCrown', prop: 'crystal', eyes: 'starry' },
    moves: {
      [MOVE.FAIR]: { name: 'Mercury Kick', startup: 8, active: 4, endlag: 16, damage: 20, bkb: 54, kbg: 122, angle: 34, sweetspot: true,
        hitboxes: sweetAndSour({ offsetX: 59, radius: 14 },
          { offsetX: 30, radius: 27, damage: 5, bkb: 30, kbg: 73 }) },
      [MOVE.BAIR]: { name: 'Retrograde Back-Kick', startup: 6, active: 4, endlag: 16, damage: 20, bkb: 54, kbg: 122, angle: 146, sweetspot: true,
        hitboxes: sweetAndSour({ offsetX: -59, radius: 14 },
          { offsetX: -30, radius: 27, damage: 5, bkb: 30, kbg: 73 }) },
      [MOVE.NEUTRAL_B]: { name: "Crystal Aura", kind: 'reflector', startup: 4, active: 14, endlag: 14, damage: 10, bkb: 42, kbg: 76, radius: 46 },
      [MOVE.SIDE_B]: { name: 'Horoscope Flare', kind: 'projectile', damage: 14, bkb: 46, kbg: 96, projSpeed: 13.5, projLife: 56, projGravity: 0, projAngle: 0, projStyle: 'orb' },
      [MOVE.UP_B]: { name: 'Astral Teleport', ...warp('psychic', 12, 32, 13) },
      [MOVE.DOWN_B]: { name: 'Tag-In Smoke', kind: 'spin', damage: 9, bkb: 42, kbg: 82, radius: 46 },
    },
  }),

  makeFighter({
    id: 'zink', meleeKind: 'ftLink', name: 'Zink', parodyOf: 'Link',
    voiceType: 'hero', voicePitch: 0.99,
    epithet: 'Hardware Store Hero',
    bio: 'Left-handed legend armed with a galvanized pipe wrench, trash-can lid shield, and paint-roller boomerangs.',
    taunt: '"Aisle 7! HYAAAH!"',
    stats: { weight: 104, gravity: 0.70, fallSpeed: 14.0, fastFallSpeed: 19.2, runSpeed: 9.8, dashSpeed: 10.6, traction: 0.80, airSpeed: 7.6, jumpSquat: 6, fullHopVel: 16.0, doubleJumpVel: 14.8, grabRange: 92 },
    moveScale: { dmg: 1.15, reach: 1.24, spd: 0.94 },
    palettes: [
      { body: '#22c55e', outfit: '#facc15', accent: '#38bdf8', skin: '#ffe0c4' },
      { body: '#ef4444', outfit: '#fef08a', accent: '#f97316', skin: '#ffe0c4' },
      { body: '#3b82f6', outfit: '#e2e8f0', accent: '#67e8f9', skin: '#ffe0c4' },
      { body: '#1f2937', outfit: '#f43f5e', accent: '#a855f7', skin: '#cbd5e1' },
    ],
    rig: { silhouette: 'hero', hat: 'elfCap', prop: 'wrench', shield: 'trashLid', eyes: 'intense' },
    moves: {
      [MOVE.NAIR]: { name: 'Boot of Hardware', startup: 4, active: 14, endlag: 10, landingLag: 11, damage: 11, bkb: 34, kbg: 88, angle: 42,
        hitboxes: sweetAndSour({ through: 3 }, { from: 4, damage: 6, kbg: 62 }) },
      [MOVE.DAIR]: { name: 'Wrench Pogo', startup: 10, active: 14, endlag: 18, damage: 17, bkb: 48, kbg: 106, angle: 82, sweetspot: true },
      [MOVE.NEUTRAL_B]: { name: 'Nail-Gun Arrow', kind: 'projectile', damage: 11, projSpeed: 17, projLife: 58, projGravity: 0.14, projStyle: 'arrow' },
      [MOVE.SIDE_B]: { name: 'Paint-Roller Rang', kind: 'projectile', damage: 9, projSpeed: 13.5, projLife: 68, projGravity: 0, projBoomerang: true, projStyle: 'boomerang' },
      [MOVE.UP_B]: { name: 'Socket-Wrench Spin', kind: 'recovery', damage: 15, bkb: 54, kbg: 104, recoveryX: 8.5, recoveryY: 17.5, radius: 46 },
      [MOVE.DOWN_B]: { name: 'Smoke-Detector Bomb', kind: 'projectile', damage: 11, projSpeed: 11.5, projLife: 65, projGravity: 0.34, projBounce: true, projStyle: 'bomb' },
    },
  }),

  makeFighter({
    id: 'tiny-zink', meleeKind: 'ftCLink', name: 'Tiny Zink', parodyOf: 'Young Link',
    voiceType: 'hero', voicePitch: 1.56,
    epithet: 'Hyperactive Hardware Intern',
    bio: 'Faster, smaller, and armed with a plastic spork-sword, flaming marshmallows, and endless lukewarm milk.',
    taunt: '*aggressively chugs milk*',
    stats: { weight: 85, gravity: 0.70, fallSpeed: 13.6, fastFallSpeed: 18.8, runSpeed: 11.4, dashSpeed: 12.2, traction: 0.76, airSpeed: 8.4, jumpSquat: 4, fullHopVel: 16.8, doubleJumpVel: 15.6, width: 38, height: 60, grabRange: 84 },
    moveScale: { dmg: 0.96, reach: 1.06, spd: 1.14 },
    palettes: [
      { body: '#4ade80', outfit: '#fde047', accent: '#fb923c', skin: '#ffe0c4' },
      { body: '#fb7185', outfit: '#ffffff', accent: '#38bdf8', skin: '#ffe0c4' },
      { body: '#38bdf8', outfit: '#fef08a', accent: '#f43f5e', skin: '#ffe0c4' },
      { body: '#334155', outfit: '#c084fc', accent: '#4ade80', skin: '#e2e8f0' },
    ],
    rig: { silhouette: 'kid', hat: 'elfCap', prop: 'spork', shield: 'trashLid', eyes: 'wide' },
    moves: {
      [MOVE.NEUTRAL_B]: { name: 'Flaming Marshmallow', kind: 'projectile', damage: 8, projSpeed: 15.5, projLife: 60, projGravity: 0.16, projStyle: 'fireball' },
      [MOVE.SIDE_B]: { name: 'Mini Paint-Rang', kind: 'projectile', damage: 8, projSpeed: 14.5, projLife: 70, projGravity: 0, projBoomerang: true, projStyle: 'boomerang' },
      [MOVE.UP_B]: { name: 'Intern Whirlwind', kind: 'recovery', damage: 12, recoveryX: 9.2, recoveryY: 18.4, radius: 40,
        ...flurry(3, 4, 3, 6, 75, 40, 84) },
      [MOVE.DOWN_B]: { name: 'Party Popper Bomb', kind: 'projectile', damage: 9, projSpeed: 12.5, projLife: 62, projGravity: 0.34, projBounce: true, projStyle: 'bomb' },
    },
  }),

  // Row 3: Spitzu, Chikapu, Gigglefluff, Mewtooth, Mr. Beep & Blob, Garth, Troy, Shriek
  makeFighter({
    id: 'spitzu', meleeKind: 'ftPichu', name: 'Spitzu', parodyOf: 'Pichu',
    voiceType: 'cute', voicePitch: 1.8,
    epithet: 'Overclocked Battery Gremlin',
    bio: 'Teeny-tiny hurtbox, blistering speed, and zero insulation—literally zaps himself on every special move.',
    taunt: '"ZAP! ow. ZAP! ow."',
    stats: { weight: 56, gravity: 0.64, fallSpeed: 12.2, fastFallSpeed: 17.6, runSpeed: 12.2, dashSpeed: 12.8, traction: 0.70, airSpeed: 8.5, jumpSquat: 3, fullHopVel: 16.8, doubleJumpVel: 16.0, width: 32, height: 46 },
    moveScale: { dmg: 0.94, reach: 0.86, spd: 1.24 },
    palettes: [
      { body: '#fff066', outfit: '#1f2937', accent: '#ff5277', skin: '#fff066' },
      { body: '#fde047', outfit: '#ef4444', accent: '#38bdf8', skin: '#fde047' },
      { body: '#fef08a', outfit: '#3b82f6', accent: '#4ade80', skin: '#fef08a' },
      { body: '#fef9c3', outfit: '#22c55e', accent: '#f472b6', skin: '#fef9c3' },
    ],
    rig: { silhouette: 'tinyRodent', hat: 'boltEars', tail: 'jagged', prop: 'goggles', eyes: 'wide' },
    moves: {
      [MOVE.NAIR]: { name: 'Static Spin', startup: 3, active: 10, endlag: 9, landingLag: 9, damage: 9 },
      [MOVE.NEUTRAL_B]: { name: '9-Volt Jolt', kind: 'projectile', damage: 7, selfDamage: 1, projSpeed: 13.5, projLife: 56, projGravity: 0.22, projBounce: true, projStyle: 'bolt' },
      [MOVE.SIDE_B]: { name: 'AAA Torpedo', kind: 'dashBurst', technique: 'chargeMissile', style: 'electric', startup: 1, active: 13, endlag: 18, damage: 20, selfDamage: 2, speed: 23 },
      [MOVE.UP_B]: { name: 'Double-Zip', ...quickAttack(6), selfDamage: 2 },
      [MOVE.DOWN_B]: { name: 'Overclocked Thunder', kind: 'spin', damage: 17, selfDamage: 3, bkb: 54, kbg: 108, angle: 76, radius: 52, sweetspot: true,
        ...flurry(3, 3, 3, 12, 76, 54, 108) },
    },
  }),

  makeFighter({
    id: 'chikapu', meleeKind: 'ftPikachu', name: 'Chikapu', parodyOf: 'Pikachu',
    voiceType: 'cute', voicePitch: 1.61,
    epithet: 'Static-Cling Hamster',
    bio: 'Bootleg dryer-sheet rodent with a cardboard zigzag tail, lightning-fast Up-Smash, and ridiculous edgeguards.',
    taunt: '"CHIKA-CHIKA-TAX!"',
    stats: { weight: 80, gravity: 0.65, fallSpeed: 12.6, fastFallSpeed: 18.0, runSpeed: 12.6, dashSpeed: 13.2, traction: 0.72, airSpeed: 8.6, jumpSquat: 3, fullHopVel: 17.0, doubleJumpVel: 16.0, width: 38, height: 52 },
    moveScale: { dmg: 1.04, reach: 0.94, spd: 1.2 },
    palettes: [
      { body: '#ffdd29', outfit: '#ef4444', accent: '#38bdf8', skin: '#ffdd29' },
      { body: '#fbbf24', outfit: '#3b82f6', accent: '#f43f5e', skin: '#fbbf24' },
      { body: '#fde047', outfit: '#22c55e', accent: '#a855f7', skin: '#fde047' },
      { body: '#facc15', outfit: '#1f2937', accent: '#67e8f9', skin: '#facc15' },
    ],
    rig: { silhouette: 'rodent', hat: 'boltEars', tail: 'jagged', prop: 'redCap', eyes: 'bright' },
    moves: {
      [MOVE.USMASH]: { name: 'Static Flip', startup: 8, active: 5, endlag: 18, damage: 18, bkb: 52, kbg: 122, angle: 86, sweetspot: true, chargeable: true },
      [MOVE.UAIR]: { name: 'Tail Swipe', startup: 4, active: 6, endlag: 11, landingLag: 10, damage: 9, bkb: 38, kbg: 88, angle: 44 },
      [MOVE.NEUTRAL_B]: { name: 'Dryer-Sheet Jolt', kind: 'projectile', damage: 7, projSpeed: 13.0, projLife: 60, projGravity: 0.24, projBounce: true, projStyle: 'bolt' },
      [MOVE.SIDE_B]: { name: 'Hamster Rocket', kind: 'dashBurst', technique: 'chargeMissile', style: 'electric', startup: 1, active: 14, endlag: 18, damage: 19, speed: 24 },
      [MOVE.UP_B]: { name: 'Quick-Zip', ...quickAttack(8) },
      [MOVE.DOWN_B]: { name: 'Static Storm', kind: 'spin', damage: 17, bkb: 54, kbg: 110, angle: 78, radius: 54, sweetspot: true,
        ...flurry(4, 3, 2, 11, 78, 54, 110) },
    },
  }),

  makeFighter({
    id: 'gigglefluff', meleeKind: 'ftPurin', name: 'Gigglefluff', parodyOf: 'Jigglypuff',
    voiceType: 'cute', voicePitch: 1.68,
    epithet: 'Insomnia Marshmallow',
    bio: '6 midair jumps, outrageous aerial drift, Wall-of-Pain Back Air, and a Frame-1 "NAPTIME" instant KO nuke.',
    taunt: '"Zzz... wait, you died?"',
    stats: { weight: 60, gravity: 0.40, fallSpeed: 8.6, fastFallSpeed: 12.8, runSpeed: 8.8, dashSpeed: 9.6, traction: 0.78, airAccel: 0.95, airSpeed: 11.4, jumpSquat: 5, fullHopVel: 14.0, doubleJumpVel: 13.0, maxJumps: 6, width: 42, height: 46, floaty: true },
    moveScale: { dmg: 1.02, spd: 1.08 },
    palettes: [
      { body: '#ffb5dc', outfit: '#38f5ff', accent: '#ff4265', skin: '#ffb5dc' },
      { body: '#ffe4f2', outfit: '#22c55e', accent: '#fde047', skin: '#ffe4f2' },
      { body: '#fbcfe8', outfit: '#fbbf24', accent: '#a855f7', skin: '#fbcfe8' },
      { body: '#f9a8d4', outfit: '#3b82f6', accent: '#ffffff', skin: '#f9a8d4' },
    ],
    rig: { silhouette: 'puff', hat: 'sleepMask', prop: 'curl', eyes: 'giant' },
    moves: {
      [MOVE.BAIR]: { name: 'Wall of Pain Slap', startup: 7, active: 5, endlag: 13, landingLag: 12, damage: 13, bkb: 42, kbg: 102, angle: 148, offsetX: -54, radius: 34 },
      [MOVE.NEUTRAL_B]: { name: 'Marshmallow Rollout', kind: 'dashBurst', damage: 15, bkb: 50, kbg: 98, burstX: 20, burstY: 0 },
      [MOVE.SIDE_B]: { name: 'Insomnia Slap', kind: 'dashBurst', damage: 11, bkb: 38, kbg: 76, angle: 76, burstX: 10, burstY: 3.5 },
      [MOVE.UP_B]: { name: 'Boring Podcast (Sing)', kind: 'spin', startup: 12, active: 16, endlag: 16, damage: 4, bkb: 18, kbg: 20, radius: 56, sleep: true },
      [MOVE.DOWN_B]: { name: 'NAPTIME (REST)', kind: 'rest', startup: 1, active: 3, endlag: 72, damage: 28, bkb: 95, kbg: 150, angle: 78, offsetX: 0, offsetY: 26, radius: 26, sweetspot: true,
        hitboxes: [{ offsetX: 0, radius: 8, priority: 1 }] },
    },
  }),

  makeFighter({
    id: 'mewtooth', meleeKind: 'ftMewtwo', name: 'Mewtooth', parodyOf: 'Mewtwo',
    voiceType: 'mystic', voicePitch: 0.71,
    epithet: 'Grumpy Floating Dentist Cat',
    bio: 'Levitation, a comically huge tail hurtbox, glowing Dental X-Ray Orbs, and ruthless teleport mindgames.',
    taunt: '"Have you been flossing?"',
    stats: { weight: 85, gravity: 0.48, fallSpeed: 10.6, fastFallSpeed: 15.6, runSpeed: 10.6, dashSpeed: 11.4, traction: 0.64, airSpeed: 9.0, jumpSquat: 5, fullHopVel: 16.4, doubleJumpVel: 17.8, width: 46, height: 84, floaty: true },
    moveScale: { dmg: 1.12, reach: 1.22 },
    palettes: [
      { body: '#e9d5ff', outfit: '#9333ea', accent: '#38f5ff', skin: '#f3e8ff' },
      { body: '#fef08a', outfit: '#d97706', accent: '#f43f5e', skin: '#fef9c3' },
      { body: '#bae6fd', outfit: '#0284c7', accent: '#4ade80', skin: '#e0f2fe' },
      { body: '#bbf7d0', outfit: '#15803d', accent: '#facc15', skin: '#dcfce7' },
    ],
    rig: { silhouette: 'tallCat', hat: 'catEars', tail: 'hugeTail', prop: 'xrayOrb', eyes: 'intense' },
    moves: {
      [MOVE.BAIR]: { name: 'Gargantuan Tail Whip', startup: 8, active: 5, endlag: 15, damage: 13, bkb: 42, kbg: 96, angle: 146, offsetX: -62, radius: 34,
        hitboxes: sweetAndSour({ offsetX: -78, radius: 14 },
          { offsetX: -39, radius: 27, damage: 8, bkb: 30, kbg: 73 }) },
      [MOVE.NEUTRAL_B]: { name: 'Dental X-Ray Orb', kind: 'chargeShot', storableCharge: true, projBounce: false, startup: 10, active: 4, endlag: 16, damage: 22, bkb: 56, kbg: 110, projSpeed: 14.5, projLife: 68, projGravity: 0, projAngle: 0, projStyle: 'shadowOrb', sweetspot: true },
      [MOVE.SIDE_B]: { name: 'Laughing Gas Flip', kind: 'cape', damage: 9, bkb: 34, kbg: 48, angle: 95 },
      [MOVE.UP_B]: { name: 'Root-Canal Teleport', ...warp('psychic', 10, 35, 8) },
      [MOVE.DOWN_B]: { name: 'Bright Lamp Stun', kind: 'spin', damage: 8, bkb: 24, kbg: 24, radius: 48, sleep: true },
    },
  }),

  makeFighter({
    id: 'mr-beep-blob', meleeKind: 'ftGameWatch', name: 'Mr. Beep & Blob', parodyOf: 'Mr. Game & Watch',
    voiceType: 'robot', voicePitch: 1.51,
    epithet: 'Flat 2D Calculator Gremlin',
    bio: 'Strictly two-dimensional LCD silhouette. Flips pixelated pancakes, hoards projectiles, and gambles for Judge 9.',
    taunt: '*LOUD MICROWAVE BEEP*',
    stats: { weight: 64, gravity: 0.56, fallSpeed: 11.4, fastFallSpeed: 16.8, runSpeed: 10.8, dashSpeed: 11.6, traction: 0.72, airSpeed: 8.6, jumpSquat: 4, fullHopVel: 16.0, doubleJumpVel: 15.6, width: 38, height: 64 },
    moveScale: { dmg: 1.12, spd: 1.1 },
    palettes: [
      { body: '#111827', outfit: '#f8fafc', accent: '#38f5ff', skin: '#111827' },
      { body: '#7f1d1d', outfit: '#fef08a', accent: '#fb7185', skin: '#7f1d1d' },
      { body: '#14532d', outfit: '#bbf7d0', accent: '#4ade80', skin: '#14532d' },
      { body: '#1e3a8a', outfit: '#bfdbfe', accent: '#60a5fa', skin: '#1e3a8a' },
    ],
    rig: { silhouette: 'flat2d', hat: 'lcdNose', prop: 'judgeHammer', eyes: 'none' },
    moves: {
      [MOVE.FAIR]: { name: 'Credit-Card Box', damage: 14, bkb: 44, kbg: 104, angle: 38, startup: 9 },
      [MOVE.NEUTRAL_B]: { name: 'Pixel Pancake Flip', kind: 'projectile', damage: 8, projSpeed: 9.5, projLife: 62, projGravity: 0.38, projAngle: 56, projStyle: 'pancake' },
      [MOVE.SIDE_B]: { name: 'JUDGE 1-9 GAMBLE', kind: 'judge', rolls: judgeRolls, startup: 10, active: 5, endlag: 18, damage: 14, bkb: 48, kbg: 104, angle: 40, offsetX: 46, offsetY: 36, radius: 34 },
      [MOVE.UP_B]: { name: 'Trampoline Launch', kind: 'recovery', damage: 9, recoveryX: 8.5, recoveryY: 21.5 },
      [MOVE.DOWN_B]: { name: 'Grease Bucket', kind: 'reflector', startup: 4, active: 14, endlag: 10, damage: 18, bkb: 56, kbg: 112, radius: 46, healOnAbsorb: true },
    },
  }),

  makeFighter({
    id: 'garth', meleeKind: 'ftMars', name: 'Garth', parodyOf: 'Marth',
    voiceType: 'snarky', voicePitch: 1.01,
    epithet: 'Unreasonably Long-Armed Fencer',
    bio: 'Wields an absurdly long brass yardstick-rapier with a glowing tipper sweetspot and an illegal 10-foot grab.',
    taunt: '"Look at that spacing!"',
    stats: { weight: 87, gravity: 0.54, fallSpeed: 11.8, fastFallSpeed: 17.2, runSpeed: 12.2, dashSpeed: 13.0, traction: 0.68, airSpeed: 8.2, jumpSquat: 4, fullHopVel: 16.8, doubleJumpVel: 15.8, grabRange: 92 },
    moveScale: { dmg: 1.08, reach: 1.44, spd: 1.1 },
    palettes: [
      { body: '#2563eb', outfit: '#e2e8f0', accent: '#facc15', skin: '#ffe4cf' },
      { body: '#dc2626', outfit: '#fef08a', accent: '#ffffff', skin: '#ffe4cf' },
      { body: '#16a34a', outfit: '#f8fafc', accent: '#fde047', skin: '#ffe4cf' },
      { body: '#111827', outfit: '#c084fc', accent: '#67e8f9', skin: '#ffe4cf' },
    ],
    rig: { silhouette: 'tallHero', hat: 'tiaraHair', prop: 'yardstick', cape: 'noble', eyes: 'smug' },
    moves: {
      [MOVE.FTHROW]: { startup: 7, endlag: 11, bkb: 48, angle: 31 },
      [MOVE.FSMASH]: { name: 'Tipper Yardstick', startup: 10, active: 4, endlag: 20, damage: 20, bkb: 56, kbg: 124, angle: 36, offsetX: 68, offsetY: 38, radius: 36, sweetspot: true, chargeable: true,
        hitboxes: sweetAndSour({ offsetX: 94, radius: 14 },
          { offsetX: 48, radius: 34, damage: 12, bkb: 30, kbg: 78 }) },
      [MOVE.FAIR]: { name: 'Graceful Arc', startup: 4, active: 5, endlag: 13, landingLag: 12, damage: 12, bkb: 38, kbg: 96, angle: 42, offsetX: 58, offsetY: 38, radius: 36,
        hitboxes: sweetAndSour({ offsetX: 81, radius: 14 },
          { offsetX: 40, radius: 27, damage: 8, bkb: 30, kbg: 73 }) },
      [MOVE.DAIR]: { name: 'Ken-Combo Spike', startup: 6, active: 5, endlag: 18, landingLag: 16, damage: 14, bkb: 40, kbg: 108, angle: 270, offsetX: 24, offsetY: -6, radius: 36, meteor: true, sweetspot: true },
      [MOVE.NEUTRAL_B]: { name: 'Shield-Breaker Poke', startup: 14, active: 4, endlag: 18, damage: 16, bkb: 48, kbg: 102, angle: 38, offsetX: 70, radius: 32, shieldDamageMult: 2.5 },
      [MOVE.SIDE_B]: { name: 'Dancing Yardstick', kind: 'dashBurst', damage: 11, bkb: 40, kbg: 82, burstX: 11, burstY: 2.5 },
      [MOVE.UP_B]: { name: 'Dolphin Uppercut', kind: 'recovery', startup: 5, active: 10, endlag: 18, damage: 14, bkb: 52, kbg: 100, recoveryX: 7.5, recoveryY: 20.5, sweetspot: true },
      [MOVE.DOWN_B]: { name: 'Smug Counter', kind: 'counter', startup: 5, active: 20, endlag: 18, damage: 15, bkb: 50, kbg: 102, angle: 42 },
    },
  }),

  makeFighter({
    id: 'troy', meleeKind: 'ftEmblem', name: 'Troy', parodyOf: 'Roy',
    voiceType: 'hero', voicePitch: 1.06,
    epithet: 'Flaming-Broom Pyromaniac',
    bio: 'Garth\'s chaotic cousin who set a broomstick on fire. Hits like a wet noodle at the tip, but nukes point-blank.',
    taunt: '"TROY\'S OUR BOY! OW HOT!"',
    stats: { weight: 85, gravity: 0.72, fallSpeed: 14.6, fastFallSpeed: 19.6, runSpeed: 11.6, dashSpeed: 12.2, traction: 0.70, airSpeed: 7.9, jumpSquat: 5, fullHopVel: 16.2, doubleJumpVel: 15.2 },
    moveScale: { dmg: 1.16, reach: 1.32, spd: 1.02 },
    palettes: [
      { body: '#ef4444', outfit: '#2563eb', accent: '#facc15', skin: '#ffe4cf' },
      { body: '#f97316', outfit: '#16a34a', accent: '#fef08a', skin: '#ffe4cf' },
      { body: '#a855f7', outfit: '#f8fafc', accent: '#38bdf8', skin: '#ffe4cf' },
      { body: '#1f2937', outfit: '#fbbf24', accent: '#ef4444', skin: '#ffe4cf' },
    ],
    rig: { silhouette: 'tallHero', hat: 'headband', prop: 'fireBroom', cape: 'noble', eyes: 'intense' },
    moves: {
      [MOVE.FSMASH]: { name: 'Hilt Inferno', startup: 11, active: 4, endlag: 21, damage: 22, bkb: 58, kbg: 126, angle: 34, offsetX: 46, offsetY: 36, radius: 34, sweetspot: true, chargeable: true,
        hitboxes: sweetAndSour({ offsetX: 23, radius: 18, element: 'fire' },
          { offsetX: 67, radius: 28, damage: 9, bkb: 24, kbg: 68 }) },
      [MOVE.NEUTRAL_B]: { name: 'Flare Broom Nuke', startup: 20, active: 5, endlag: 24, damage: 26, bkb: 72, kbg: 132, angle: 38, offsetX: 52, radius: 42, sweetspot: true },
      [MOVE.SIDE_B]: { name: 'Double-Edge Sweep', kind: 'dashBurst', damage: 13, burstX: 12, burstY: 2 },
      [MOVE.UP_B]: { name: 'Blazer Broom', kind: 'recovery', damage: 15, recoveryX: 9.0, recoveryY: 18.0 },
      [MOVE.DOWN_B]: { name: 'Fiery Counter', kind: 'counter', startup: 6, active: 20, endlag: 18, damage: 18, bkb: 56, kbg: 112, angle: 38 },
    },
  }),

  makeFighter({
    id: 'shriek', meleeKind: 'ftSeak', name: 'Shriek', parodyOf: 'Sheik',
    voiceType: 'snarky', voicePitch: 1.21,
    epithet: 'Over-Caffeinated Mall Ninja',
    bio: 'Wrapped in duct tape and sports-wrap. Combos effortlessly with frame-3 slaps, thumbtack needles, and lethal F-Air.',
    taunt: '*throws 6 plastic shurikens*',
    stats: { weight: 90, gravity: 0.68, fallSpeed: 13.4, fastFallSpeed: 18.8, runSpeed: 12.6, dashSpeed: 13.4, traction: 0.78, airSpeed: 8.6, jumpSquat: 3, fullHopVel: 17.4, doubleJumpVel: 16.0 },
    moveScale: { dmg: 1.02, reach: 1.04, spd: 1.24 },
    palettes: [
      { body: '#4f46e5', outfit: '#e2e8f0', accent: '#f43f5e', skin: '#ffe4cf' },
      { body: '#dc2626', outfit: '#1f2937', accent: '#facc15', skin: '#ffe4cf' },
      { body: '#0d9488', outfit: '#f8fafc', accent: '#67e8f9', skin: '#ffe4cf' },
      { body: '#111827', outfit: '#a855f7', accent: '#4ade80', skin: '#ffe4cf' },
    ],
    rig: { silhouette: 'ninja', hat: 'ninjaWrap', prop: 'scarf', eyes: 'intense' },
    moves: {
      [MOVE.FAIR]: { name: 'Mall-Ninja Slap', startup: 5, active: 4, endlag: 13, landingLag: 11, damage: 14, bkb: 44, kbg: 112, angle: 34, sweetspot: true,
        hitboxes: sweetAndSour({ offsetX: 48, radius: 14 },
          { offsetX: 24, radius: 27, damage: 9, bkb: 30, kbg: 73 }) },
      [MOVE.FTILT]: { name: 'Combo Kick', startup: 5, active: 4, endlag: 11, damage: 8, bkb: 46, kbg: 72, angle: 78 },
      [MOVE.DTHROW]: { name: 'Tech-Chase Throw', startup: 6, endlag: 8, damage: 8, bkb: 52, kbg: 50, angle: 80 },
      [MOVE.NEUTRAL_B]: { name: 'Thumbtack Needles', kind: 'projectile', startup: 6, active: 3, endlag: 10, damage: 6, bkb: 18, kbg: 30, projSpeed: 22, projLife: 45, projGravity: 0, projAngle: 0, projStyle: 'needle' },
      [MOVE.SIDE_B]: { name: 'Duct-Tape Whip', startup: 10, active: 6, endlag: 16, damage: 10, offsetX: 74, radius: 26 },
      [MOVE.UP_B]: { name: 'Smoke-Bomb Vanish', ...warp('dark', 10, 32, 14), sweetspot: true },
      [MOVE.DOWN_B]: { name: 'Shadow Dropkick', kind: 'dashBurst', damage: 11, burstX: 15, burstY: -2 },
    },
  }),
];

/** Special NPC fighter for Home-Run Derby */
export const SAGGING_BAG = makeFighter({
  id: 'sagging-bag', meleeKind: 'ftSandbag', name: 'Sagging Bag', parodyOf: 'Sandbag',
  voiceType: 'heavy', voicePitch: 0.83,
  epithet: 'Existential Punching Sack',
  bio: 'Wears a sticky note that says "KICK ME (GENTLY)". Only appears in Home-Run Derby.',
  taunt: '"..."',
  stats: { weight: 105, gravity: 0.62, fallSpeed: 13.0, fastFallSpeed: 13.0, runSpeed: 0, dashSpeed: 0, traction: 0.45, airSpeed: 0, jumpSquat: 6, fullHopVel: 0, doubleJumpVel: 0, maxJumps: 0, width: 42, height: 64 },
  palettes: [{ body: '#e5d3b3', outfit: '#facc15', accent: '#ef4444', skin: '#e5d3b3' }],
  rig: { silhouette: 'sandbag', hat: 'stickyNote', eyes: 'sad' },
});

/** Special Classic Mode Final Boss */
export const MASTER_MITT = makeFighter({
  id: 'master-mitt', meleeKind: 'ftMasterHand', name: 'Master Mitt', parodyOf: 'Master Hand',
  voiceType: 'heavy', voicePitch: 0.6,
  epithet: 'Giant Sentient Oven Mitt',
  bio: 'The supreme quilted kitchen glove ruling the Bizarro Melee universe.',
  taunt: '"TIME TO GET BAKED!"',
  stats: { weight: 165, gravity: 0.16, fallSpeed: 6.5, fastFallSpeed: 9.0, runSpeed: 11.0, dashSpeed: 12.0, traction: 0.4, airSpeed: 10.5, jumpSquat: 4, fullHopVel: 14.0, doubleJumpVel: 14.0, maxJumps: 99, width: 88, height: 104, floaty: true },
  moveScale: { dmg: 1.35, reach: 1.4, spd: 0.85 },
  palettes: [{ body: '#f8fafc', outfit: '#ef4444', accent: '#facc15', skin: '#f8fafc' }],
  rig: { silhouette: 'ovenMitt', hat: 'quilted', eyes: 'none' },
  moves: {
    [MOVE.NEUTRAL_B]: { name: 'Finger-Gun Peppers', bossTell: 'gun', startup: 23, active: 15, endlag: 23, shotInterval: 7, kind: 'projectile', damage: 5, projSpeed: 16, projLife: 62, projGravity: 0, projAngle: 0, projStyle: 'laser' },
    [MOVE.SIDE_B]: { name: 'Rocket Mitt Slap', bossTell: 'slap', startup: 19, active: 10, endlag: 26, kind: 'dashBurst', damage: 17, bkb: 56, kbg: 102, burstX: 20, burstY: 0, sweetspot: true },
    [MOVE.DOWN_B]: { name: 'Countertop Slam', bossTell: 'slam', startup: 23, active: 12, endlag: 32, kind: 'stone', damage: 20, bkb: 60, kbg: 110, radius: 64, sweetspot: true },
  },
});

/** Lightweight Wireframe Minion for Multi-Man Bizarro Brawl */
export const BIZARRO_INTERN = makeFighter({
  id: 'bizarro-intern', meleeKind: 'ftZakoBoy', name: 'Unpaid Intern', parodyOf: 'Fighting Wireframe',
  voiceType: 'robot', voicePitch: 1.19,
  epithet: 'Polygon Temp Worker',
  bio: 'Low-poly wireframe intern hired exclusively to get launched off Arguefield in bulk.',
  taunt: '"Is this paid?!"',
  stats: { weight: 52, gravity: 0.58, fallSpeed: 11.4, fastFallSpeed: 16.0, runSpeed: 10.2, dashSpeed: 11.0, traction: 0.72, airSpeed: 7.4, jumpSquat: 4, fullHopVel: 15.6, doubleJumpVel: 14.5, width: 40, height: 68 },
  moveScale: { dmg: 0.65, spd: 0.92 },
  palettes: [
    { body: '#8b5cf6', outfit: '#38f5ff', accent: '#ff52b8', skin: '#c4b5fd' },
    { body: '#14b8a6', outfit: '#facc15', accent: '#38f5ff', skin: '#99f6e4' },
  ],
  rig: { silhouette: 'flat2d', hat: 'headband', eyes: 'visor' },
});

export function getFighterById(id) {
  if (id === SAGGING_BAG.id) return SAGGING_BAG;
  if (id === MASTER_MITT.id) return MASTER_MITT;
  if (id === BIZARRO_INTERN.id) return BIZARRO_INTERN;
  return ROSTER.find((f) => f.id === id) || ROSTER[0];
}
