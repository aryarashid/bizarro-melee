/** Three.js view adapter. Simulation coordinates are +Y up, the camera is on +Z,
 * and character / Blender weapon forwards are +X. Nothing here mutates a match. */
import { MELEE, MODE, MOVE as M, STATE as S, PLAYER_COLORS, WORLD_SCALE } from './constants.js';
import { getStageForm, getSurfaceY, resolveStagePlatforms, resolveStageSolids } from './stages.js';
import { getSurfaceTextures, getFaceTexture, getOutfitTextures, getSkyTexture, getCloudTexture, getCelestialTexture,
  getDamageSmokeTexture, getImpactPuffTexture, getJumbotronTexture, getPodiumRankTexture, getStageSignTexture,
  addFighterRim, releasePaint, skyStyle, getCombatGlowTexture, getFistSteamTexture } from './textures3d.js';
import { attackLimb, attackVisual, combatPaint, specialVisual, specialEventVisual, legacySpecialEvents, fighterHidden, zipPoints, chargePulse,
  combatReaction, fighterArchetype, fighterTag, victoryOrder, flashesAllowed, mittTell, mittGunAim, drawMittTell } from './fx.js';

const TAU = 2 * Math.PI;
const DEG = Math.PI / 180;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (v) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const phase01 = (x) => x - Math.floor(x);
const blinkAt = (t, port) => {
  const clock = t + (port || 0) * 73 + 81;
  const cycle = Math.floor(clock / 229);
  const phase = clock % 229 - 19 - 66 * phase01(cycle * 0.618 + port * 0.371);
  return (phase >= 0 && phase < 5) || (cycle % 5 === 2 && phase >= 12 && phase < 16);
};
const headWidth = (y, jaw) => 1 - jaw * Math.max(0, -y);
const SHINE = '#8df7ff';
const TRAIL_HISTORY = 8;
const TRAIL_SUBSTEPS = 4;
const TRAIL_ROWS = (TRAIL_HISTORY - 1) * TRAIL_SUBSTEPS + 1;
const catmull = (a, b, c, d, t) => b + .5 * t * (c - a + t * (2*a - 5*b + 4*c - d + t * (3*(b-c) + d-a)));
const hurtStates = new Set([S.HITSTUN, S.TUMBLE, S.SHIELD_BREAK, S.GRABBED, S.KNOCKDOWN]);
const isHurt = (f) => hurtStates.has(f.state) || f.sleepTimer > 0;
const smashes = new Set([M.FSMASH, M.USMASH, M.DSMASH]);
const blades = new Set(['yardstick', 'fireBroom', 'wrench', 'spatula']);
const swings = new Set([M.FTILT, M.UTILT, M.DTILT, M.FAIR, M.BAIR, M.UAIR, M.DAIR, M.NAIR, M.SIDE_B]);
const impactPaint = {
  standard: ['#ff923c', '#fff5dd', '#ffcb76'],
  slash: ['#61cbff', '#f5ffff', '#bbf5ff'],
  sweetSlash: ['#61cbff', '#f5ffff', '#ffc64d'],
  sweet: ['#ff5b38', '#fff2a3', '#ffc64d'],
  electric: ['#38dcff', '#edffff', '#ffde56'],
  meteor: ['#ff4864', '#fff0b8', '#ffae68'],
};
const combatFxPoolLimits = { impactStar: 16, impactSpark: 56, lightning: 24, shockwave: 12, launchPuff: 40, speedStreak: 36, dustPuff: 20 };
const FX_BUDGET = 208;
const STAGE_WARNING_LEAD = 120;
const LAUNCH_PER_KB = MELEE.KB_TO_VEL * WORLD_SCALE;
const RECOIL_POP = [1, .82, .39, -.27, -.12];
// Bodies look along +X locally. A 30° turn toward camera reads as a 60° three-quarter stance.
const STANCE = Math.PI / 6;
const proportions = {
  sword:  { hips: .37, torso: .34, bulk: .91, arm: 1.13, limbs: .89 },
  heavy:  { hips: .27, torso: .43, bulk: 1.25, arm: 1.21, limbs: 1.18 },
  spacie: { hips: .37, torso: .34, bulk: .93, arm: .92, limbs: .86 },
  mascot: { hips: .26, torso: .40, bulk: 1.12, arm: .83, limbs: 1.05 },
  nimble: { hips: .33, torso: .37, bulk: 1.00, arm: 1.00, limbs: 1.00 },
};
const playerColor = (port) => PLAYER_COLORS[(port ?? 0) % PLAYER_COLORS.length] || '#e4e8ff';
const softenedSpace = (id) => id === 'corn-area' || id === 'venom-barge';
const deepDaylight = (id) => id === 'yoshis-tax-island' || id === 'foreclosed-castle';

function attackAccent(f, key, move) {
  if (move?.name === 'Knee of Bread') return 'knee';
  if (move?.meteor || move?.hitboxes?.some((box) => box.meteor)) return 'spike';
  if (smashes.has(key) || key === M.ITEM_SWING || (blades.has(f.def.rig?.prop) && swings.has(key))) return 'power';
  return null;
}

// Four knife-edged rays share a raised center, keeping the cross sharp when it tilts in Z.
function impactStarGeometry(T) {
  const rim = [1, 0, 0, .13, .106, 0, -.04, .62, 0, -.13, .096, 0,
    -.79, -.035, 0, -.12, -.111, 0, .06, -.53, 0, .14, -.093, 0];
  const geometry = new T.BufferGeometry(), indices = [];
  for (let i = 0; i < 8; i++) indices.push(8, i, (i + 1) % 8, 9, (i + 1) % 8, i);
  geometry.setAttribute('position', new T.Float32BufferAttribute([...rim, 0, 0, .075, 0, 0, -.075], 3));
  geometry.setIndex(indices);
  return geometry;
}

function crescentGeometry(T, arc, core = false) {
  const geo = new T.BufferGeometry(), positions = [], indices = [], steps = 32;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = (t - .50) * arc, taper = Math.sin(t * Math.PI) ** .69;
    const center = .64 + .09 * t;
    for (const r of [center + taper * (core ? .065 : .14), center - taper * (core ? .045 : .235)]) {
      positions.push(Math.cos(a) * r, Math.sin(a) * r, .12 * taper + .12 * (t - .5));
    }
    if (i) { const n = i * 2; indices.push(n-2, n-1, n, n, n-1, n+1); }
  }
  geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

function cometGeometry(T) {
  const profile = [[0, -1.28], [.07, -.87], [.16, -.54], [.30, -.28], [.40, -.06], [.43, .13], [.36, .34], [.22, .48], [0, .57]];
  return new T.LatheGeometry(profile.map(([r, x]) => new T.Vector2(r, x)), 28).rotateZ(-Math.PI / 2);
}

function flameTongueGeometry(T) {
  const geo = new T.BufferGeometry(), pos = [], idx = [];
  const curve = [[-.90,.30,0],[-.68,.04,.034],[-.49,-.07,.08],[-.28,-.03,.14],[-.08,.02,.16],[.18,0,.105],[.30,0,0]];
  curve.forEach(([x,y,w], i) => {
    pos.push(x, y-w, w*.7, x, y+w, -w*.2);
    if (i) { const n = i * 2; idx.push(n-2,n-1,n,n,n-1,n+1); }
  });
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

function lightningGeometry(T, variant) {
  const positions = [], colors = [], indices = [];
  const zig = [[-.50, -.09, 0], [-.31, .15, .05], [-.13, -.10, -.08], [.06, .08, .06],
    [.22, -.16, -.05], [.37, .07, .04], [.51, -.03, 0]];
  zig[2][1] -= variant * .035;
  zig[4][1] += variant % 2 ? .28 : -.045;
  const ribbon = (points, width) => {
    const base = positions.length / 3;
    for (let i = 0; i < points.length; i++) {
      const [x, y, z] = points[i], prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
      const a = Math.atan2(next[1] - prev[1], next[0] - prev[0]);
      const w = width * (i === 0 || i === points.length - 1 ? .09 : 1);
      for (const s of [-1, 0, 1]) {
        positions.push(x - Math.sin(a) * w * s, y + Math.cos(a) * w * s, z);
        colors.push(...(s ? [.10, .48, .68] : [1, 1, 1]));
      }
      if (i > 0) for (let j = 0; j < 2; j++) {
        const k = base + (i - 1) * 3 + j;
        indices.push(k, k + 1, k + 3, k + 1, k + 4, k + 3);
      }
    }
  };
  ribbon(zig, .024);
  const fork = zig[variant % 2 ? 4 : 2];
  ribbon([fork, [fork[0] + .115, fork[1] + .25, .08], [fork[0] + .31, fork[1] + .305, -.10]], .017);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}

const HATS = {
  headmirror: 'Hat_HeadMirror', bowler: 'Hat_Bowler', capTall: 'Hat_Cap',
  backCap: 'Hat_Cap', snapback: 'Hat_Cap', grillCap: 'Hat_Cap', birdHelmet: 'Hat_BirdHelmet',
  foxEars: 'Hat_FoxHead', toucanBeak: 'Hat_ToucanHead', visorHelm: 'Hat_SpaceHelm',
  tiara: 'Hat_Crown', mysticCrown: 'Hat_Crown', tiaraHair: 'Hat_Crown', elfCap: 'Hat_ElfCap',
  glasses: 'Hat_Glasses',
};
const WEAPONS = {
  yardstick: ['Weapon_Yardstick', 27, 62], fireBroom: ['Weapon_FireBroom', 24, 57],
  armCannon: ['Weapon_ArmCannon', 15, 22], fryingPan: ['Weapon_FryingPan', 18, 29],
  spatula: ['Weapon_Spatula', 18, 31], shovel: ['Weapon_Shovel', 19, 29], wrench: ['Weapon_Wrench', 17, 26],
  spork: ['Weapon_Spork', 16, 24], judgeHammer: ['Weapon_JudgeHammer', 16, 20],
  crystal: ['Weapon_Crystal', 18, 18], squeegee: ['Weapon_Squeegee', 16, 26],
  bat: ['Weapon_Bat', 16, 26], pill: ['Weapon_Pill', 14, 18],
};
const SUMMONS = {
  laser_duck: 'Summon_LaserDuck', fire_toaster: 'Summon_RagingToaster', tax_piggy: 'Summon_AuditPiggy',
  snore_sloth: 'Summon_SnoreSloth', tornado_pigeon: 'Summon_TornadoPigeon', volt_hamster: 'Summon_VoltHamster',
};
const MATCH_CALLOUTS = {
  suddenDeath: ['SUDDEN DEATH!', 112],
  doubleKo: ['DOUBLE KO!', 76], tripleKo: ['TRIPLE KO!', 90],
  zeroToDeath: ['ZERO-TO-DEATH!', 82], meteorKo: ['METEOR KO!', 72],
};
const STAGE_SURFACES = {
  'arguefield': 'stone', 'final-obligation': 'cosmos', 'randalls-tax-shelter': 'grass',
  'puddle-of-insomnia': 'ice', 'nightmare-suburb': 'grass', 'critter-arena': 'turf',
  'foreclosed-castle': 'stone', 'rainbow-highway': 'metal', 'corporate-kingdom': 'brick',
  'corporate-kingdom-2': 'brick', 'tropic-condo-falls': 'grass', 'jungle-japes-hoa': 'grass',
  'lowrule-temple': 'stone', 'great-bay-marina': 'metal', 'yoshis-tax-island': 'grass',
  'green-greens-suburb': 'grass', 'corn-area': 'metal', 'venom-barge': 'metal',
  'acid-vat-basement': 'metal', 'acid-vat-depths': 'metal', 'onett-strip-mall': 'asphalt',
  'fiveside-skyscrapers': 'metal', 'loud-suburb-highway': 'asphalt', 'big-blue-commute': 'asphalt',
  'critter-floats': 'brick', 'slush-summit': 'ice', 'flat-screen-calc': 'lcd',
  'retro-jungle-64': 'grass', 'retro-tax-island-64': 'grass', 'sandbag-yard': 'turf', 'target-lab': 'cosmos',
};
const FLOAT_PAINT = { 'blimp-main': '#ff519a', 'blimp-l': '#33d5ed', 'blimp-r': '#ffce56',
  'float-top': '#71e6a8', 'float-low': '#fb7962' };
const RACER_PAINT = { 'bus-lead': '#845dff', 'van-left': '#08bacf', 'van-right': '#f14376',
  'hover-top': '#eca936', 'hover-low': '#4277ff', 'car-l': '#2ac9ef', 'car-r': '#ff5666' };

// A pose names only the channels it changes. All angles are local to the bone.
const neutral = { lean: 0, tilt: 0, yaw: 0, head: 0, lift: 0, slide: 0, roll: 0, spin: 0,
  arm: 0.26, elbow: 0.32, off: 0.14, offElbow: 0.34, leg: -0.06, knee: -0.14,
  offLeg: 0.10, offKnee: -0.17, tool: 0.96, spread: 0.12 };
const poseChannels = Object.keys(neutral);
const strikePoses = {
  [M.JAB]: [{ arm: -0.36, elbow: 1.18, yaw: 0.22 }, { arm: 1.45, elbow: 0.08, off: -0.30, lean: -0.17, yaw: -0.27 }],
  [M.JAB2]: [{ off: -0.36, offElbow: 1.14, yaw: -0.22 }, { off: 1.53, offElbow: 0.05, arm: -0.33, lean: -0.20, yaw: 0.36 }],
  [M.JAB3]: [{ arm: -0.73, elbow: 1.35, off: 0.62, tilt: -0.21 }, { arm: 1.81, elbow: 0.10, off: -0.55, lean: -0.29, leg: 0.35, yaw: -0.37 }],
  [M.FTILT]: [{ arm: -0.84, elbow: 0.90, tool: 1.58, yaw: 0.43 }, { arm: 1.55, elbow: 0.15, tool: 0.03, yaw: -0.47, lean: -0.20, leg: 0.32 }],
  [M.UTILT]: [{ arm: 0.4, elbow: 1.1, lift: -0.1 }, { arm: 2.85, elbow: 0.18, tool: -0.7, head: 0.22, lift: 0.05 }],
  [M.DTILT]: [{ lean: -0.25, lift: -0.2, leg: -0.33 }, { arm: 0.98, elbow: 0.05, lean: -0.53, leg: 1.13, knee: -0.10, offKnee: -0.79, lift: -0.23, tool: 0.85 }],
  [M.DASH_ATTACK]: [{ arm: -0.44, off: 0.8, lean: -0.28 }, { arm: 1.52, off: 1.15, elbow: 0.20, lean: -0.69, leg: 0.49, offLeg: -0.6, slide: 0.11 }],
  [M.FSMASH]: [{ arm: -1.2, elbow: 1.28, tool: 2.11, yaw: 0.46, lean: 0.32, lift: -0.10, knee: -0.45 },
    { arm: 1.61, elbow: 0.08, tool: -0.12, yaw: -0.69, lean: -0.38, slide: 0.11, leg: 0.52, offLeg: -0.45 },
    { arm: 2.06, elbow: 0.24, tool: -0.44, yaw: -0.29, lean: -0.25, leg: 0.32 }],
  [M.USMASH]: [{ arm: -0.58, elbow: 1.24, lift: -0.22, knee: -0.6 }, { arm: 3.28, elbow: 0.15, tool: -1.47, off: 2.08, head: 0.27, lift: 0.11 }],
  [M.DSMASH]: [{ arm: -0.64, elbow: 0.98, lift: -0.23, yaw: 0.35 },
    { arm: 1.30, elbow: 0.1, yaw: -0.36, lift: -0.25, lean: -0.41, leg: 0.7, offKnee: -0.88 },
    { arm: 0.65, off: 1.39, yaw: 0.85, lift: -0.2, leg: 0.40, offLeg: -0.54 }],
  [M.NAIR]: [{ arm: 0.63, off: -0.3, leg: 0.66, knee: -1.06, spin: 0 },
    { arm: -0.57, off: 1.82, leg: 1.63, knee: -0.10, offLeg: -0.77, spin: -3.6, lean: 0.38 },
    { spin: -TAU, leg: 0.49, offLeg: 0.33, offKnee: -0.72 }],
  [M.FAIR]: [{ arm: -0.82, elbow: 1.36, leg: 0.56, knee: -1.10, yaw: 0.35 },
    { arm: 1.60, off: -0.62, elbow: 0.12, leg: 1.27, knee: -0.56, offLeg: -0.67, tool: -0.18, lean: -0.28 }],
  [M.BAIR]: [{ arm: 0.58, off: 0.82, offLeg: 0.58, offKnee: -0.56, yaw: -0.4 },
    { arm: 1.96, off: 0.02, offLeg: -1.67, offKnee: -0.05, leg: 0.65, knee: -0.75, lean: -0.59, head: 0.26 }],
  [M.UAIR]: [{ arm: 1.17, leg: 0.28, knee: -1.14, roll: 0.22 },
    { arm: 2.85, elbow: 0.38, leg: 2.72, knee: -0.11, offLeg: -0.24, roll: 0.78, head: 0.4 }],
  [M.DAIR]: [{ lean: 0.38, arm: 2.17, leg: 0.88, knee: -1.43, offLeg: 0.59, offKnee: -1.04 },
    { lean: -0.12, arm: -0.66, off: -0.44, leg: -0.14, knee: -0.12, offLeg: -0.21, offKnee: -0.06 }],
  [M.NEUTRAL_B]: [{ arm: -0.56, elbow: 1.63, off: 1, yaw: 0.22 }, { arm: 1.58, elbow: 0.26, off: 0.97, tool: -0.07, lean: -0.17 }],
  [M.SIDE_B]: [{ arm: -0.65, elbow: 0.8, off: 0.95, lean: 0.28 }, { arm: 1.63, elbow: 0.18, off: -0.71, lean: -0.51, tool: -0.08, leg: 0.43 }],
  [M.UP_B]: [{ arm: 0.51, off: 0.57, lift: -0.17, knee: -0.72 }, { arm: 3.15, elbow: 0.14, off: 2.91, leg: 0.63, knee: -0.95, spin: TAU, tool: -1.28 }],
  [M.DOWN_B]: [{ arm: 0.26, elbow: 1.30, off: 0.28, offElbow: 1.25, lift: -0.10 },
    { arm: 1.25, elbow: 0.9, off: 1.25, offElbow: 0.9, spread: 0.65, lift: -0.2, knee: -0.59, offKnee: -0.79 }],
  [M.ITEM_SWING]: [{ arm: -0.95, elbow: 1.07, tool: 1.85, yaw: 0.29 }, { arm: 1.83, elbow: 0.13, tool: 0.11, lean: -0.36, yaw: -0.48 }],
  [M.ITEM_THROW]: [{ arm: -0.73, elbow: 1.25, lean: 0.26 }, { arm: 1.71, elbow: 0.10, lean: -0.30 }],
  [M.LEDGE_ATTACK]: [{ arm: 2.8, off: 1.9, leg: 0.61, knee: -0.7 }, { arm: 1.22, off: 0.29, lean: -0.45, slide: 0.17, leg: 0.5 }],
  [M.FTHROW]: [{ arm: 0.72, elbow: 1.36, off: 1.22 }, { arm: 1.67, off: 1.62, lean: -0.25 }],
  [M.BTHROW]: [{ arm: 0.72, elbow: 1.36, off: 1.22 }, { arm: 1.80, off: 1.72, spin: Math.PI * 1.2 }],
  [M.UTHROW]: [{ arm: 0.82, elbow: 1.36, off: 0.92 }, { arm: 2.93, off: 2.8, lift: 0.10 }],
  [M.DTHROW]: [{ arm: 1.92, off: 2.05, lean: 0.23 }, { arm: 0.71, off: 0.72, lean: -0.48, lift: -0.18 }],
  [M.GETUP_ATTACK]: [{ roll: -Math.PI * 0.5, lift: -0.22, arm: 0.35, off: 0.2, leg: 0.15, knee: -0.2 },
    { roll: -0.15, lift: -0.06, arm: 1.42, elbow: 0.16, lean: -0.42, slide: 0.24, leg: 0.62, knee: -0.35 }],
};

const pose = (values) => ({ ...neutral, ...values });
const normalPoses = {
  sword: {
    [M.JAB]: [{ arm: .62, elbow: 1.65, tool: .42 }, { arm: 1.27, elbow: .34, tool: .05, leg: .18 }],
    [M.JAB2]: [{ arm: 2.24, elbow: .50, tool: .19 }, { arm: 1.42, elbow: .12, tool: -.15, off: .67 }],
    [M.JAB3]: [{ arm: -.61, elbow: 1.35, tool: 1.29 }, { arm: 1.41, elbow: .16, tool: .05, off: -.42, lean: -.23 }],
    [M.FTILT]: [{ arm: 2.71, elbow: .78, tool: .62, lean: .15 }, { arm: 1.40, elbow: .18, tool: .05, leg: .42 }],
    [M.FAIR]: [{ arm: 2.61, elbow: .80, tool: .72, leg: .36, knee: -.85 }, { arm: 1.23, elbow: .13, tool: .49, yaw: .47, lean: -.02, slide: -.17 },
      { arm: .20, elbow: .33, tool: .43, yaw: .37, off: .86 }],
    [M.BAIR]: [{ arm: 2.71, elbow: .65, tool: 1.68 }, { arm: -1.51, elbow: -.08, tool: Math.PI, yaw: .30, off: 1.37 }],
    [M.DAIR]: [{ arm: 2.56, elbow: 1.04, tool: 1.50, leg: .44, knee: -1.24 },
      { arm: .46, elbow: .05, tool: 1.35, yaw: .41, lean: -.18, leg: .10, knee: -.59 }],
  },
  spacie: {
    [M.JAB]: [{ arm: .41, elbow: 1.43, off: 1.06 }, { arm: 1.56, elbow: .05, off: .71, offElbow: 1.07, leg: .32 }],
    [M.FTILT]: [{ leg: .75, knee: -1.55, arm: .84 }, { leg: 1.72, knee: -.11, offKnee: -.36, arm: -.29, off: 1.03, lift: .04 }],
    [M.FAIR]: [{ leg: 1.40, knee: -1.81, arm: .50, off: 1.01 }, { leg: 1.84, knee: -.08, yaw: .43, lean: -.11, arm: -.65, offLeg: .28, offKnee: -1.08, lift: .07 },
      { leg: .67, knee: -1.10, offLeg: 1.18, offKnee: -.25, arm: .30, off: -.21 }],
    [M.BAIR]: [{ offLeg: .68, offKnee: -1.25, lean: -.15 }, { offLeg: -1.90, offKnee: -.07, leg: .96, knee: -1.47, arm: 2.22, lean: -.49 }],
    [M.DAIR]: [{ leg: .75, knee: -1.49, offLeg: .38, offKnee: -.90 }, { leg: -.49, knee: -.06, offLeg: -.62, offKnee: -.22, arm: 1.81, off: 1.32 },
      { leg: .15, knee: -.77, offLeg: -.34, offKnee: -.04, tilt: .21 }],
  },
  heavy: {
    [M.JAB]: [{ arm: -.87, elbow: 1.48 }, { arm: 1.43, elbow: .32, lean: -.36, off: -.52 }],
    [M.FTILT]: [{ arm: -1.23, elbow: 1.65, yaw: .77 }, { arm: 1.63, elbow: .28, lean: -.42, off: .88 }],
    [M.FAIR]: [{ arm: 2.38, elbow: 1.09, off: 2.31, lean: .25 }, { arm: 1.26, elbow: .16, off: 1.37, offElbow: .22, lean: -.47 }],
    [M.BAIR]: [{ arm: 1.88, elbow: .69, off: 1.31 }, { arm: -1.58, elbow: .07, offLeg: -.89, lean: -.12, yaw: .11 }],
    [M.DAIR]: [{ arm: 2.74, elbow: 1.35, off: 2.56 }, { arm: -.53, elbow: .23, off: -.68, offElbow: .26, lean: -.35, leg: .48 }],
  },
  mascot: {
    [M.JAB]: [{ arm: .24, elbow: .87, off: .68 }, { arm: 1.59, elbow: .04, off: 1.10, lean: -.18 }],
    [M.FTILT]: [{ arm: -.21, elbow: .77, leg: .26 }, { arm: 1.44, elbow: .11, off: 1.14, leg: .68, knee: -.46, lift: -.12 }],
    [M.FAIR]: [{ arm: .45, elbow: 1.40, leg: .51, knee: -1.31 }, { arm: 1.58, elbow: .09, off: 1.48, offElbow: .25, leg: .61, knee: -.77, lean: -.32 }],
    [M.BAIR]: [{ offLeg: .43, offKnee: -.84, arm: .96 }, { offLeg: -1.28, offKnee: -.08, leg: 1.23, arm: 2.07, lean: -.39 }],
    [M.DAIR]: [{ leg: .64, knee: -1.42, offLeg: .63, offKnee: -1.31, arm: .82 }, { leg: .22, knee: -.08, offLeg: -.14, offKnee: -.14, arm: 2.47, off: 2.31 }],
  },
};

const smashCues = {
  [M.FSMASH]: { arm: -1.48, elbow: 1.58, off: .64, tool: 2.36, yaw: .85, lean: .63, lift: -.12, slide: -.27, leg: -.19, knee: -.44 },
  [M.USMASH]: { arm: -.66, elbow: 1.32, off: .27, head: .37, lean: -.31, lift: -.34, slide: -.06, leg: .58, knee: -1.10, offLeg: .48, offKnee: -.94 },
  [M.DSMASH]: { arm: .02, elbow: 1.46, off: 1.02, offElbow: .54, head: -.23, tilt: .38, yaw: .74, lift: -.33, slide: -.12, leg: .79, knee: -1.03, offLeg: -.31, offKnee: -.42 },
};
function blendPose(a, b, t, out = {}) {
  for (const k of poseChannels) out[k] = mix(a[k] ?? neutral[k], b[k] ?? neutral[k], t);
  return out;
}

function attackPose(f, key, m, accent) {
  let [wind, hit, follow] = strikePoses[key] || strikePoses[M.SIDE_B];
  const archetype = fighterArchetype(f), native = normalPoses[archetype]?.[key];
  if (native) [wind, hit, follow] = native;
  if (key === M.DOWN_B) {
    if (m?.kind === 'counter' || m?.kind === 'reflector') {
      wind = { ...wind, lean: 0.26, arm: 0.84, elbow: 1.43, tool: 1.4 };
      hit = { ...hit, lean: 0.15, off: 1.5, arm: 2.05, tool: -0.28 };
    } else if (m?.kind === 'stone' || m?.kind === 'rest') {
      hit = { ...hit, leg: 0.72, knee: -1.45, offLeg: 0.69, offKnee: -1.48, spread: 0, lift: -0.24, lean: 0.18 };
    }
  }
  if (m?.kind === 'teleport') hit = { ...hit, spin: 0, leg: 0.8, knee: -1, arm: 1.2 };
  wind = blendPose(neutral, wind, accent ? 1.28 : 1.19);
  if (accent) {
    if (accent === 'knee') {
      wind = { ...wind, lean: 0.48, leg: 0.38, knee: -1.56, offLeg: -0.53 };
      hit = { ...hit, lean: -0.57, yaw: -0.46, leg: 1.90, knee: -1.19, offLeg: -0.83, slide: 0.10 };
    } else if (accent === 'spike' && key === M.DAIR && !native) {
      wind = { ...wind, lean: 0.48, lift: 0.11, leg: 1.09, knee: -1.63 };
      hit = { ...hit, lean: -0.33, arm: -0.97, off: -0.79, leg: -0.49, knee: -0.04, offLeg: -0.36, lift: -0.13 };
    } else {
      hit = { ...hit, yaw: (hit.yaw || 0) * 1.21, lean: (hit.lean || 0) * 1.15 };
    }
  }
  const rear = key === M.BAIR || key === M.BTHROW, reach = rear ? -1 : 1;
  const up = [M.UTILT, M.USMASH, M.UAIR, M.UP_B, M.UTHROW].includes(key);
  const down = [M.DAIR, M.DTHROW].includes(key) || /kick/i.test(m?.name || '') && m?.kind === 'dashBurst';
  const sweep = [M.NAIR, M.DSMASH].includes(key), jab = [M.JAB, M.JAB2, M.JAB3].includes(key);
  const power = accent || smashes.has(key) || key === M.DASH_ATTACK || key === M.ITEM_SWING;
  const twist = key === M.JAB2 || rear ? -1 : 1;
  wind = { ...wind, slide: -reach * (jab ? .14 : power ? .24 : .19),
    yaw: (wind.yaw || 0) + twist * .42, lean: (wind.lean || 0) + reach * .32, lift: Math.min(-.08, wind.lift || 0) };
  hit = { ...hit, slide: hit.slide ?? reach * (up || down || sweep ? .20 : jab ? .28 : power ? .46 : .38),
    lift: up ? (key === M.UP_B ? .28 : .35) : down ? -.34 : hit.lift || 0,
    yaw: (hit.yaw || 0) - twist * .31, lean: (hit.lean || 0) - (up ? .08 : reach * .18) };
  follow = { ...hit, ...follow, yaw: follow?.yaw ?? hit.yaw * .62, lean: follow?.lean ?? hit.lean * .7,
    arm: follow?.arm ?? (hit.arm ?? neutral.arm) + (jab ? .22 : .38), slide: hit.slide * .58, lift: hit.lift * .55 };
  if (f.def.id === 'sourzer' && (key === M.NAIR || key === M.UP_B)) hit = { ...hit, spin: (hit.spin || 0) + TAU * 1.25 };
  if (m?.kind === 'reflector') wind = { ...wind, lean: 0.48, lift: -0.32, knee: -1.55, offKnee: -1.35, leg: 0.95 };
  if (m?.kind === 'powerPunch') {
    wind = { ...wind, lean: 0.55, arm: -0.95, elbow: 1.45, slide: -0.18 };
    hit = { ...hit, lean: -0.78, slide: 0.62, arm: 1.92, elbow: 0.04, yaw: -0.22 };
  }
  if (smashes.has(key)) wind = pose(smashCues[key]);
  if (f.state === S.SMASH_CHARGE || f.charging) {
    const tremor = Math.sin((f.smashChargeFrames ?? f.stateFrame) * 2.35) * 0.11;
    return pose({ ...wind, head: tremor, lift: (wind.lift || -0.10) + tremor * 0.3, arm: (wind.arm || 0) + tremor });
  }
  const startup = Math.max(1, m?.startup || 1), active = Math.max(1, m?.active || 4), endlag = Math.max(1, m?.endlag || 9);
  const frame = f.moveFrame ?? f.stateFrame ?? 1;
  const finish = startup + active;
  const recovery = follow || hit;
  if (frame < startup) {
    if (smashes.has(key)) {
      // Reserve at least three simulation frames for a readable loading silhouette.
      const set = Math.max(0, startup - 4);
      const preload = ease((frame + 1) / (set + 1));
      const coil = ease(Math.max(0, frame - set) / Math.max(1, startup - set - 1));
      return blendPose(neutral, wind, preload * (.84 + .16 * coil));
    }
    return blendPose(neutral, wind, ease(frame / Math.max(1, startup - 1)));
  }
  if (frame <= finish) {
    const progress = (frame - startup) / active;
    const activePose = blendPose(hit, recovery, ease(progress));
    // A limb snaps in one frame, but full turns still have to travel the long way around.
    if (Math.abs((hit.spin || 0) - wind.spin) > Math.PI) {
      activePose.spin = progress < .66 ? mix(wind.spin, hit.spin, ease(progress / .66))
        : mix(hit.spin, recovery.spin ?? hit.spin, ease((progress - .66) / .34));
    }
    return activePose;
  }
  const settle = { ...neutral };
  if (recovery.spin) settle.spin = Math.round(recovery.spin / TAU) * TAU;
  return blendPose(recovery, settle, ease((frame - finish) / endlag));
}

function locomotion(f, rig, tick, delta, accent, launchSpeed) {
  const t = tick + f.port * 11, sf = f.stateFrame || 0, speed = Math.abs(f.vx || 0);
  const bob = Math.sin(t * 0.112);
  const crouch = { lean: -0.21, lift: -0.17, leg: 0.77, knee: -1.28, offLeg: 0.57, offKnee: -1.17, arm: 0.81, off: 0.68 };
  if (f.animPose === 'victory') return pose({ lift: Math.abs(Math.sin(t * 0.13)) * 0.20, arm: 2.75, off: 2.65, elbow: bob * 0.57, spread: 0.66, head: bob * 0.22, yaw: bob * 0.25, knee: -0.4 });
  if (f.state === S.SMASH_CHARGE || f.state === S.ATTACK || f.state === S.THROW) {
    return attackPose(f, f.moveKey || f.smashChargeKey, f.moveData || f.def.moves?.[f.smashChargeKey], accent);
  }
  if (rig.slideUntil > tick && f.grounded && speed > 1) {
    const p = ease((rig.slideUntil - tick) / 14);
    return blendPose(neutral, { ...crouch, lean: -0.72, lift: -0.28, leg: 0.95, offLeg: 0.15, knee: -1.55, offKnee: -1.22, arm: 0.35, off: -0.25 }, p);
  }
  if ([S.WALK, S.RUN, S.DASH, S.TURN].includes(f.state)) {
    const stride = clamp(speed / (f.def.stats.runSpeed || 10));
    rig.stride += (0.08 + stride * 0.28) * delta;
    const wave = Math.sin(rig.stride), swing = 0.25 + stride * 0.75;
    const push = f.state === S.DASH ? 1 - clamp(sf / 12) : 0;
    return pose({ lift: 0.024 * Math.abs(Math.cos(rig.stride)) - push * 0.06,
      leg: wave * swing + push * 0.27, offLeg: -wave * swing - push * 0.45,
      knee: -0.12 - Math.max(0, -wave) * (0.48 + stride * 0.43), offKnee: -0.12 - Math.max(0, wave) * (0.48 + stride * 0.43),
      arm: 0.19 - wave * swing * 0.63, off: 0.19 + wave * swing * 0.69,
      elbow: 0.27 + stride * 0.44, offElbow: 0.25 + stride * 0.40,
      lean: -stride * (f.state === S.DASH ? 0.62 : 0.33) - push * (f.state === S.DASH ? 0.42 : 0.25), yaw: wave * 0.14, head: stride * 0.14, tool: 1.14 });
  }
  switch (f.state) {
    case S.CROUCH:
      return pose(crouch);
    case S.JUMPSQUAT:
      return pose({ lean: 0.34, lift: -0.30, leg: 1.05, knee: -1.62, offLeg: 0.92, offKnee: -1.48, arm: -0.55, off: -0.35, elbow: 0.55, offElbow: 0.42, head: 0.22 });
    case S.LANDING: {
      const cancel = f.lCancelTimer > 0 ? 0.16 : 0;
      return blendPose(neutral, { ...crouch, lift: crouch.lift - cancel, knee: crouch.knee - cancel }, clamp(1 - sf / 10) * 0.85);
    }
    case S.SHIELD: case S.SHIELD_STUN:
      return pose({ ...crouch, lean: f.state === S.SHIELD_STUN ? 0.23 : -0.2, lift: -0.10, arm: 0.97, off: 1.04, elbow: 1.06, offElbow: 1.19, spread: 0.37, head: -0.13 });
    case S.ROLL_F: case S.ROLL_B: case S.TECH: {
      const dir = f.state === S.ROLL_B ? 1 : -1;
      return pose({ ...crouch, roll: dir * TAU * ease(sf / (f.state === S.TECH ? 21 : MELEE.ROLL_FRAMES)), lift: -0.13, arm: 1.24, off: 1.23, elbow: 1.0, offElbow: 1.0 });
    }
    case S.SPOTDODGE: return pose({ ...crouch, yaw: Math.sin(sf / MELEE.SPOTDODGE_FRAMES * Math.PI) * 0.8, tilt: -0.58, arm: -0.5, off: -0.4 });
    case S.AIRDODGE:
      return pose({ leg: 0.9, knee: -1.4, offLeg: 0.58, offKnee: -1.38, arm: 1.09, off: 1, roll: (f.facing || 1) * (f.vy || 0) * 0.08, spin: TAU * ease(sf / MELEE.AIRDODGE_FRAMES) });
    case S.AIRBORNE: {
      const flip = f.doubleJumping || f.animPose === 'doubleJump';
      const floating = f.floating || f.animPose === 'float';
      if (f.fastFalling && !floating) {
        return pose({ lean: 0.72, arm: 0.48, elbow: 1.35, off: 0.36, offElbow: 1.28,
          leg: 1.15, knee: -1.72, offLeg: 1.05, offKnee: -1.68, head: 0.35, spread: 0.08 });
      }
      const tuck = clamp(Math.max(0, f.vy || 0) / 18);
      const rising = f.animPose === 'jump' || flip || f.vy > 0;
      const somersault = flip ? { arm: 1.2, elbow: 1.35, off: 1.05, offElbow: 1.28, leg: 1.35, knee: -1.7, offLeg: 1.15, offKnee: -1.62,
        roll: -TAU * ease(Math.min(1, sf / 14)), spread: 0.06 } : {};
      return pose({ lift: floating ? 0.04 + bob * 0.03 : 0, arm: rising ? 0.78 + tuck * 0.65 : 0.42 + bob * 0.47,
        off: rising ? -0.53 : 0.94 - bob * 0.39, lean: clamp((f.vx || 0) * (f.facing || 1) / -38, -0.42, 0.42),
        leg: 0.52 + tuck * 0.62, offLeg: -0.16 + tuck * 0.54, knee: -0.45 - tuck * 0.74, offKnee: -0.60 - tuck * 0.58,
        roll: 0, spread: floating ? 0.68 : 0.32, head: 0.19, ...somersault });
    }
    case S.FREEFALL:
      return pose({ lean: 0.19, arm: 2.0 + bob * 0.63, off: 1.94 - bob * 0.74, spread: 0.58,
        leg: 0.33 + bob * 0.55, offLeg: 0.36 - bob * 0.55, knee: -0.69, offKnee: -0.9, head: 0.2 });
    case S.LEDGE_HANG: case S.LEDGE_CLIMB:
      return pose({ lean: 0.55, lift: -0.16, arm: 2.62, off: 2.48, elbow: 0.38, offElbow: 0.42,
        leg: 0.08 + bob * 0.08, offLeg: 0.06, knee: -0.12, offKnee: -0.16, head: 0.42 });
    case S.TUMBLE: {
      const force = clamp(((f.lastKnockback ?? launchSpeed / LAUNCH_PER_KB) - 70) / 110);
      const spinDir = rig.tumbleDir || 1;
      const turn = Math.max(0, sf - 3);
      return pose({ roll: -spinDir * turn * (0.42 + force * 0.24), spin: Math.sin(turn * 0.19) * 0.39 * force,
        lean: 0.32 + Math.sin(turn * 0.34) * 0.14, arm: 1.89, off: 1.44, elbow: 0.55, offElbow: 0.88,
        leg: 0.93, knee: -1.08, offLeg: 0.09, offKnee: -0.84, spread: 0.67 });
    }
    case S.HITSTUN: case S.SHIELD_BREAK: case S.GRABBED:
      return pose({ lean: 0.47, arm: 1.89, off: 1.57, elbow: 0.31, offElbow: 0.52, tilt: 0.26,
        leg: 0.27, offLeg: -0.38, knee: -0.58, offKnee: -0.78, spread: 0.34, head: 0.36 });
    case S.KNOCKDOWN:
      return pose({ roll: -Math.PI * 0.5, lift: -0.22, arm: 1.35, off: 0.22, elbow: 0.15, spread: 0.58,
        leg: 0.42, offLeg: -0.28, knee: -0.18, offKnee: -0.12, head: 0.08 });
    case S.GRAB: case S.GRAB_HOLD:
      return pose({ lean: -0.24, arm: 1.52, off: 1.41, elbow: 0.38, offElbow: 0.44, leg: 0.29, lift: -0.06 });
    case S.TAUNT:
      return pose({ lift: 0.036 + bob * 0.035, arm: 2.34 + bob * 0.53, elbow: 1.18 + bob * 0.40,
        off: 0.39, offElbow: 0.74, lean: 0.17, yaw: Math.sin(t * 0.12) * 0.30, head: 0.31 });
    default:
      if (f.sleepTimer > 0) return pose({ ...crouch, lean: -0.56, arm: 0.25, off: 0.11 });
      return pose({ lift: bob * 0.013, arm: neutral.arm + bob * 0.095, off: neutral.off - bob * 0.06, head: bob * 0.045, yaw: bob * 0.09 });
  }
}

export class GameRenderer3D {
  constructor(canvas3d, overlayCanvas, renderer2d) {
    this.canvas = canvas3d;
    this.overlay = overlayCanvas;
    this.renderer2d = renderer2d;
    this.T = globalThis.THREE;
    this.ready = false;
    this.enabled = true;
    this.contextLost = false;
    this.width = 1280; this.height = 720; this.dpr = 1;
    this.assets = Object.fromEntries(['characters', 'weapons', 'items', 'stage-props'].map((p) => [p, new Map()]));
    this.ownedGeometries = new WeakSet();
    this.ownedMaterials = new WeakSet();
    this.baseGeo = new Map();
    for (const key of ['fighterMeshes', 'itemMeshes', 'projMeshes', 'targetMeshes', 'hazardMeshes', 'summonMeshes',
      'platMeshes', 'solidMeshes']) this[key] = new Map();
    this.fxParticles = [];
    this.combatFxPool = new Map();
    this.dustFrames = new Map();
    this.slideUntil = new Map();
    this.hitFocus = new Map();
    this.chargeSamples = new Map();
    this.comboBanners = [];
    this.matchBanners = [];
    this.calloutFlags = new Set();
    this.arcadeFx = new WeakSet();
    this.warpPulses = new Map();
    this._init();
  }

  _init() {
    const T = this.T;
    if (!T || !this.canvas) return;
    try {
      const params = { alpha: false, antialias: true, powerPreference: 'high-performance' };
      const context = this.canvas.getContext('webgl2', params);
      if (!context) return;
      this.renderer = new T.WebGLRenderer({ canvas: this.canvas, context, ...params });
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      this.scene = new T.Scene();
      this.scene.background = new T.Color(0x111628);
      this.camera = new T.PerspectiveCamera(39, 16 / 9, 12, 12500);
      this.viewPoint = new T.Vector3();
      this.hemi = new T.HemisphereLight(0xe6f0ff, 0x6a516b, 2.0);
      this.sun = new T.DirectionalLight(0xffe6c6, 2.75);
      this.sun.castShadow = true;
      const s = this.sun.shadow;
      s.mapSize.set(2048, 2048);
      Object.assign(s.camera, { left: -880, right: 880, top: 740, bottom: -620, near: 60, far: 2450 });
      s.camera.updateProjectionMatrix();
      s.normalBias = 1.4; s.bias = -0.00014;
      this.rim = new T.DirectionalLight(0x58dfff, 2.4);
      this.rim.position.set(-370, 340, -490);
      this.fill = new T.DirectionalLight(0x92baff, 0.74);
      this.fill.position.set(-450, 105, 660);
      this.impact = new T.PointLight(0xffc89b, 0, 380, 2);
      this.tensionPalette = [0xffa08d, 0x803044, 0xffac69, 0xff5366].map((hex) => new T.Color(hex));
      this.stageGroup = new T.Group();
      this.battleGroup = new T.Group();
      this.fxGroup = new T.Group();
      this.scene.add(this.hemi, this.sun, this.sun.target, this.rim, this.fill, this.impact, this.stageGroup, this.battleGroup, this.fxGroup);
      this._buildComposer();
      this.canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        this.contextLost = true;
        this._graphicsMode();
        this._releaseContextResources();
      });
      this.canvas.addEventListener('webglcontextrestored', () => {
        this.contextLost = false;
        if (!this.ready) return;
        this._buildComposer();
        this._resize3D();
        this._graphicsMode();
      });
      this.ready = true;
      this._resetCamera();
      this._loadBlenderPacks();
      this._graphicsMode();
    } catch (error) {
      this._fallback(error);
    }
  }

  _buildComposer() {
    const T = this.T;
    // The bloom pass downsamples internally. Cap composer DPR to contain fill cost.
    if (T.EffectComposer && T.RenderPass && T.UnrealBloomPass && T.OutputPass &&
        this.renderer.extensions.has('EXT_color_buffer_float')) {
      try {
        const target = new T.WebGLRenderTarget(640, 360, { type: T.HalfFloatType,
          samples: Math.min(2, this.renderer.capabilities.maxSamples || 0) });
        this.composer = new T.EffectComposer(this.renderer, target);
        this.composer.addPass(new T.RenderPass(this.scene, this.camera));
        this.bloom = new T.UnrealBloomPass(new T.Vector2(640, 360), 0.24, 0.36, 0.95);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new T.OutputPass());
      } catch {
        this.composer?.dispose();
        this.composer = null;
      }
    }
  }

  _releaseContextResources() {
    // Remove disposal listeners bound to the old GL objects before Three restores.
    for (const map of [this.fighterMeshes, this.itemMeshes, this.projMeshes, this.targetMeshes, this.hazardMeshes, this.summonMeshes]) this._clear(map);
    this._clearEffects();
    this._remove(this.showcase);
    this.showcase = null;
    this._remove(this.stageGroup);
    this._remove(this.sky);
    this.stageGroup = this.sky = null;
    this.platMeshes.clear();
    this.solidMeshes.clear();
    this.terrainGroup = null;
    this.stageId = null;
    for (const geometry of this.baseGeo.values()) geometry.dispose();
    const geometries = new Set(), materials = new Set();
    for (const pack of Object.values(this.assets)) for (const source of pack.values()) source.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      for (const material of [].concat(node.material || [])) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    releasePaint(this);
    for (const pass of this.composer?.passes || []) pass.dispose?.();
    this.composer?.dispose();
    this.composer = this.bloom = null;
    const shadow = this.sun.shadow;
    shadow.map?.dispose();
    shadow.mapPass?.dispose();
    shadow.map = shadow.mapPass = null;
  }

  _fallback(error) {
    console.warn('3D renderer unavailable, using classic graphics.', error);
    this.ready = false;
    this._graphicsMode();
  }

  _graphicsMode() {
    if (this.canvas) this.canvas.hidden = !this.isActive();
    const body = this.canvas?.ownerDocument?.body;
    if (body?.dataset.gfx) body.dataset.gfx = this.isActive() ? '3d' : '2d';
  }

  _loadBlenderPacks() {
    const T = this.T;
    if (!T.GLTFLoader) return;
    const loader = new T.GLTFLoader();
    const root = new URL('../assets/models/', import.meta.url);
    for (const pack of Object.keys(this.assets)) {
      loader.load(new URL(pack + '.glb', root).href, (gltf) => {
        for (const child of gltf.scene.children) {
          if (child.name) this.assets[pack].set(child.name, child);
        }
        // Invalidate on the next render, never inside a loader callback.
        if (pack === 'stage-props') this.stagePropsDirty = this.hazardsDirty = true;
        else if (pack === 'items') this.itemsDirty = true;
        if (pack !== 'stage-props') this.rigsDirty = true;
      }, undefined, () => { /* Missing pack leaves procedural substitutes active. */ });
    }
  }

  _model(pack, key, tint = null) {
    const source = this.assets[pack]?.get(key);
    if (!source) return null;
    const clone = source.clone(true);
    clone.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.castShadow = mesh.receiveShadow = true;
      if (!tint) return;
      const recolor = (material) => {
        const override = tint[material.name];
        if (!override || !material.color) return material;
        const m = material.clone();
        if (typeof override === 'object' && !override.isColor) m.setValues(override);
        else m.color.set(override);
        this.ownedMaterials.add(m);
        return m;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(recolor) : recolor(mesh.material);
    });
    const wrapper = new this.T.Group();
    wrapper.name = key;
    wrapper.add(clone);
    return wrapper;
  }

  _mat(color, options = {}) {
    const m = new this.T.MeshStandardMaterial({ color, roughness: 0.58, ...options });
    this.ownedMaterials.add(m);
    return m;
  }

  _basic(color, options = {}) {
    const m = new this.T.MeshBasicMaterial({ color, ...options });
    this.ownedMaterials.add(m);
    return m;
  }

  _add(parent, geometry, material, x = 0, y = 0, z = 0, shadow = true, shared = false) {
    const mesh = new this.T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = shadow;
    if (!shared) this.ownedGeometries.add(geometry);
    parent.add(mesh);
    return mesh;
  }

  _unit(key) {
    const T = this.T;
    if (!this.baseGeo.has(key)) {
      const factories = {
        ball: () => new T.SphereGeometry(1, 20, 14), smallBall: () => new T.SphereGeometry(1, 12, 8),
        gem: () => new T.IcosahedronGeometry(1, 0), disk: () => new T.CylinderGeometry(1, 1, 1, 24, 1),
        hex: () => new T.CylinderGeometry(1, 1, 1, 6, 1), cone: () => new T.ConeGeometry(1, 1, 12),
        rod: () => new T.CylinderGeometry(1, 1, 1, 8), plane: () => new T.PlaneGeometry(1, 1),
        ring: () => new T.TorusGeometry(1, 0.047, 6, 32),
        shockwave: () => new T.RingGeometry(.912, 1, 48),
        swingRim: () => crescentGeometry(T, 2.55), swingCore: () => crescentGeometry(T, 2.55, true),
        sweepRim: () => crescentGeometry(T, 5.35), sweepCore: () => crescentGeometry(T, 5.35, true),
        aimFlare: () => crescentGeometry(T, 1.08), comet: () => cometGeometry(T), flameTongue: () => flameTongueGeometry(T),
        impactStar: () => impactStarGeometry(T),
        box: () => new T.BoxGeometry(1, 1, 1),
      };
      this.baseGeo.set(key, key.startsWith('lightning:') ? lightningGeometry(T, Number(key.at(-1))) : factories[key]());
    }
    return this.baseGeo.get(key);
  }

  _shape(parent, key, material, x, y, z, sx, sy, sz, shadow = true) {
    const mesh = this._add(parent, this._unit(key), material, x, y, z, shadow, true);
    mesh.scale.set(sx, sy, sz);
    return mesh;
  }

  _bone(parent, name, x = 0, y = 0, z = 0) {
    const joint = new this.T.Group();
    joint.name = name;
    joint.position.set(x, y, z);
    parent.add(joint);
    return joint;
  }

  _remove(object) {
    const root = object?.root || object;
    if (!root) return;
    root.removeFromParent();
    const materials = new Set(), geometries = new Set();
    root.traverse((mesh) => {
      if (mesh.userData.ownedInstances) mesh.dispose();
      if (mesh.geometry && this.ownedGeometries.has(mesh.geometry)) geometries.add(mesh.geometry);
      const slots = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of slots) if (m && this.ownedMaterials.has(m)) materials.add(m);
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  }

  _clear(map) {
    for (const obj of map.values()) this._remove(obj);
    map.clear();
  }

  resize(w, h, dpr = 1) {
    this.width = Math.max(1, Math.floor(w));
    this.height = Math.max(1, Math.floor(h));
    this.dpr = clamp(dpr, 1, 1.75);
    this.renderer2d?.resize(this.width, this.height, this.dpr);
    if (this.ready && !this.contextLost) this._resize3D();
  }

  _resize3D() {
    try {
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setPixelRatio(this.dpr);
      this.renderer.setSize(this.width, this.height, false);
      if (this.composer) {
        this.composer.setPixelRatio(Math.min(1, this.dpr));
        this.composer.setSize(this.width, this.height);
      }
    } catch (error) {
      this._fallback(error);
    }
  }

  setEnabled(on) {
    this.enabled = !!on;
    this._graphicsMode();
  }

  isActive() { return this.ready && this.enabled && !this.contextLost; }

  _resetCamera(stage) {
    this.camX = stage?.barrierX ? 60 : 0;
    this.camY = 116;
    this.camZ = 940;
    this.lastTick = null;
    if (this.camera) {
      this.camera.position.set(this.camX, this.camY + 103, this.camZ);
      this.camera.lookAt(this.camX, this.camY, 0);
      this.camera.updateMatrixWorld();
    }
  }

  reset(stage) {
    this._resetCamera(stage);
    this.renderer2d?.reset(stage);
    for (const map of [this.fighterMeshes, this.itemMeshes, this.projMeshes, this.targetMeshes, this.hazardMeshes, this.summonMeshes]) this._clear(map);
    this._clearEffects();
    this.slideUntil.clear();
    this.comboBanners.length = 0;
    this.matchBanners.length = 0;
    this.calloutFlags.clear();
    this._remove(this.showcase);
    this.showcase = null;
    this.viewMode = null;
    this.tension = 0;
    if (this.battleGroup) this.battleGroup.visible = this.fxGroup.visible = true;
    if (this.stageGroup) this.stageGroup.visible = true;
    if (this.sky) this.sky.visible = true;
    if (this.stageLighting) this._updateLighting('battle', false, 0);
    this.finish = null;
    this.stagePulse = null;
    this.stageWarning = null;
    this.warpPulses.clear();
    this.stageId = null;
    // Rebuild lazily so stages selected while using classic graphics don't allocate WebGL resources.
  }

  _clearEffects() {
    for (const p of this.fxParticles) this._discardParticle(p);
    this.fxParticles.length = 0;
    for (const pool of this.combatFxPool.values()) for (const p of pool) this._remove(p.mesh);
    this.combatFxPool.clear();
    this.dustFrames.clear();
    this.hitFocus.clear();
    this.chargeSamples.clear();
    this.cameraKick = this.flash = null;
    if (this.impact) this.impact.intensity = 0;
  }

  // The rim follows the exact Y collision plane and exact X spans at Z=0.
  // Texture UVs are in world units, not stretched over a 40,000-unit derby slab.
  _bevel(rings, topMaterial = true, tile = 180, rise = 0) {
    const T = this.T, pos = [], uv = [];
    const geo = new T.BufferGeometry();
    const row = ([x, z, y, corner, dx = 0, dz = 0]) => {
      const c = Math.min(corner, x * 0.46, z * 0.46);
      return [[-x+c,-z],[x-c,-z],[x,-z+c],[x,z-c],[x-c,z],[-x+c,z],[-x,z-c],[-x,-z+c]].map(([xx,zz]) => [xx+dx,y,zz+dz]);
    };
    const layer = rings.map(row);
    const half = rings[0][0];
    const emit = (points, fn) => {
      for (const p of points) {
        pos.push(p[0], p[1] + rise * (p[0] / (2 * half) + 0.5), p[2]);
        uv.push(...fn(p));
      }
    };
    const topUv = ([x, y, z]) => [x / tile, z / tile];
    for (let i = 1; i < 7; i++) emit([layer[0][0], layer[0][i+1], layer[0][i]], topUv);
    const topCount = pos.length / 3;
    for (let j = 0; j < layer.length - 1; j++) for (let i = 0; i < 8; i++) {
      const k = (i + 1) % 8, a = layer[j], b = layer[j + 1];
      const sideUv = ([x, y, z]) => [((i === 2 || i === 6) ? z : x) / tile, y / tile];
      emit([a[i], a[k], b[k], a[i], b[k], b[i]], sideUv);
    }
    const bottom = layer.at(-1);
    for (let i = 1; i < 7; i++) emit([bottom[0], bottom[i], bottom[i+1]], topUv);
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    if (topMaterial) {
      geo.addGroup(0, topCount, 0);
      geo.addGroup(topCount, pos.length / 3 - topCount, 1);
    }
    return geo;
  }

  _materialSurface(kind, tint, strength = 1) {
    const set = getSurfaceTextures(kind, this.T, this);
    const color = new this.T.Color(tint).lerp(new this.T.Color(0xffffff), 0.52);
    return this._mat(color, { ...set, bumpScale: set.bumpScale * strength, roughness: 1,
      metalness: kind === 'metal' ? 0.28 : kind === 'cosmos' || kind === 'ice' ? 0.16 : 0.035 });
  }

  _buildStage(stage) {
    const T = this.T, pal = stage.palette, id = stage.id;
    if (this.sky) this._remove(this.sky);
    this._remove(this.stageGroup);
    this.stageGroup = this._bone(this.scene, id);
    this.stageId = id;
    this.platMeshes.clear();
    this.solidMeshes.clear();
    this.terrainGroup = null;
    this.stageFormIndex = null;
    this.stagePropsDirty = false;
    this.stageAnimations = [];
    this.acidMesh = this.barrierMesh = this.waterMesh = this.warningLane = this.acidSparks = null;
    const style = skyStyle(stage);
    const haze = new T.Color(pal.skyMid);
    if (deepDaylight(id)) haze.lerp(new T.Color('#243963'), 0.29);
    this.scene.fog = new T.Fog(haze, 1150, 3200);
    this.hemi.color.set(style === 'acid' ? 0xffcdb9 : style === 'day' ? 0xcdefff : 0xdce4ff);
    this.hemi.groundColor.set(style === 'day' ? 0xa48473 : 0x644966);
    this.rim.color.set(pal.accent).lerp(new T.Color(0xb3e5ff), 0.27);
    this.sun.color.set(style === 'day' || style === 'sunset' ? 0xffe2b3 : 0xffefd6);
    this.stageLighting = {
      fog: this.scene.fog, previewFog: new T.FogExp2(haze, style === 'lcd' ? 0 : 0.00023),
      hemi: this.hemi.color.clone(), ground: this.hemi.groundColor.clone(),
      sun: this.sun.color.clone(), rim: this.rim.color.clone(),
    };
    this.sky = this._add(this.scene, new T.SphereGeometry(8500, 48, 24),
      this._basic(0xffffff, { map: getSkyTexture(stage, T, this), side: T.BackSide, depthWrite: false, fog: false, toneMapped: false }), 0, 0, 0, false);
    this.sky.renderOrder = -30;
    this.sky.frustumCulled = false;
    this.sky.rotation.y = -0.28;

    const trim = this._mat(pal.deckTrim, { emissive: pal.deckTrim, emissiveIntensity: 0.48, metalness: 0.26, roughness: 0.43 });
    const accent = this._basic(pal.accent, { toneMapped: false });
    this._buildBackdrop(stage, { style, trim, accent });
    this.previewProps = (stage.props || []).filter((prop) => !stage.warpPipes || prop.mesh !== 'Prop_WarpPipe')
      .map((prop) => this._placeProp(prop, pal));
    this.stageLandmarks = this._bone(this.stageGroup, 'Stage landmarks');
    this._buildStageLandmarks(stage);
    this.previewDeck = new T.Box3();
    if (['puddle-of-insomnia', 'great-bay-marina', 'tropic-condo-falls'].includes(id)) {
      this.waterMesh = this._liquid(false, id === 'great-bay-marina' ? -96 : -145,
        id === 'puddle-of-insomnia' ? pal.accent : '#62d6ee');
      if (id !== 'tropic-condo-falls') this._ambientPoints(this.waterMesh.position.y, 'mist', '#aaf8ff', 140);
    }
    if (stage.hazard === 'risingAcid') {
      this.acidMesh = this._liquid(true, -260, '#70ff3d');
      this.acidSparks = this._ambientPoints(-260, 'acid', '#92ff45', 100);
    }
    if (stage.hazard && stage.hazard !== 'risingAcid') {
      const warning = this._basic(stage.hazard === 'starshipLaser' ? '#56eaff' : '#ff8a38',
        { transparent: true, opacity: 0.28, depthWrite: false, blending: T.AdditiveBlending });
      const lane = this._shape(this.stageGroup, 'plane', warning, 0, 0, -45, 2400, 6, 1, false);
      lane.visible = false;
      this.warningLane = lane;
    }
    if (stage.barrierX != null) this._buildDerby(stage, trim);
  }

  _buildTerrain(stage, formIndex, frame) {
    this._remove(this.terrainGroup);
    this.terrainGroup = this._bone(this.stageGroup, 'Playable terrain');
    this.platMeshes.clear();
    this.solidMeshes.clear();
    this.terrainAnimations = [];
    this.stageFormIndex = formIndex;
    const form = stage.transformations?.[formIndex];
    const palette = { ...stage.palette, accent: form?.accent ?? stage.palette.accent };
    const source = form ? { solid: form.solid, platforms: form.platforms } : stage;
    const solids = resolveStageSolids(source, frame);
    const platforms = resolveStagePlatforms(source, frame);
    for (const s of solids) {
      // At joined deck edges the top must reach the seam across the entire playable depth.
      const joined = solids.some((other) => other !== s &&
        (other.x + other.w === s.x || s.x + s.w === other.x));
      this.solidMeshes.set(s.id, this._deck(s, stage, palette, false, joined));
    }
    for (const p of platforms) this.platMeshes.set(p.id, this._deck(p, stage, palette, true));
    this.formAccent = formIndex > 0 && form?.accent ? form.accent : null;
    if (formIndex > 0 && form) this._buildFormBackdrop(form);
  }

  _surfaceSkin(shape, stage, pal, platform) {
    const kind = STAGE_SURFACES[stage.id] || 'stone';
    const paint = {
      skyscraper: ['metal', 'metal', '#7c899d', '#1e283c'],
      starship: [kind, 'metal', pal.deckTop, pal.deckBody],
      castle: ['shingles', 'stone', '#e14f44', '#fff0dd'],
      citadel: [kind, 'stone', pal.deckTop, pal.deckBody],
      cruise: ['timber', 'timber', '#e0a55d', '#925140'],
      street: ['asphalt', 'stone', '#5c6577', '#8b969c'],
      mountain: stage.iceTraction ? ['ice', 'ice', '#ecfaff', '#558eb4'] : ['stone', 'stone', '#e6c391', '#705345'],
      treehouse: ['timber', 'timber', '#e0a267', '#71412a'],
      cavern: ['basalt', 'basalt', '#71687f', '#4a355a'],
      pipe: ['brick', 'brick', '#e87849', '#a2432c'],
      lcd: ['lcd', 'lcd', '#353d2d', '#303929'],
      island: {
        'randalls-tax-shelter': ['grass', 'felt', '#8ed371', '#e2a2b6'],
        'nightmare-suburb': ['turf', 'earth', '#74be66', '#a57b55'],
        'yoshis-tax-island': ['grass', 'felt', '#67d68c', '#c385d4'],
        'green-greens-suburb': ['grass', 'earth', '#5fc981', '#a27538'],
        'retro-tax-island-64': ['grass', 'checker', '#72d659', '#d38b60'],
      }[stage.id] || ['grass', 'earth', stage.transformations ? '#6fbc61' : pal.deckTop, '#af7053'],
    }[shape];
    if (paint) return paint;
    return [kind, ['asphalt', 'turf'].includes(kind) ? 'metal' : kind, platform ? pal.platColor : pal.deckTop, pal.deckBody];
  }

  _deck(s, stage, pal, platform, joined = false) {
    const root = this._bone(this.terrainGroup, s.id, s.x + s.w / 2, s.y);
    root.userData.surface = s;
    const shape = s.shape || (s.cloud ? 'cloud' : stage.id === 'flat-screen-calc' ? 'lcd' :
      s.id.startsWith('log-') ? 'treehouse' : platform ? 'platform' : 'stadium');
    const x = s.w / 2, slope = s.slope || 0;
    const h = s.h ?? (shape === 'balloon' ? 95 : shape === 'vehicle' ? 56 : 18);
    const depth = platform ? (s.cloud || s.shape ? 67 : 57) : shape === 'street' ? 120 : 102;
    const corner = joined || s.walkOff ? 0 : Math.min(platform ? 14 : 23, x * 0.24);
    const [topKind, bodyKind, topColor, bodyColor] = this._surfaceSkin(shape, stage, pal, platform);
    const glow = (color = pal.accent, strength = 1) =>
      this._mat(color, { emissive: color, emissiveIntensity: strength, roughness: 0.42 });
    const metal = (color, roughness = 0.46) => this._mat(color, { metalness: 0.46, roughness });
    const cap = shape === 'balloon' || shape === 'vehicle'
      ? this._mat(FLOAT_PAINT[s.id] || RACER_PAINT[s.id] || pal.deckTrim,
        { metalness: shape === 'balloon' ? 0.04 : 0.38, roughness: 0.28 })
      : shape === 'cloud' ? glow(s.diving ? '#5ca45c' : s.id === 'ufo' ? '#b495ff' : '#fff5f7', 0.16)
        : shape === 'lcd' ? this._basic('#293622', { toneMapped: false })
        : this._materialSurface(topKind, topColor);
    const shell = this._materialSurface(bodyKind, bodyColor);
    const trim = glow(pal.deckTrim, 0.3);
    const rise = (px) => slope * (px / s.w + 0.5);
    const box = (m, px, y, z, w, height, d, shadow = true) =>
      this._shape(root, 'box', m, px, y + rise(px), z, w, height, d, shadow);
    const blob = (key, m, px, y, z, w, height, d, shadow = true) =>
      this._shape(root, key, m, px, y + rise(px), z, w, height, d, shadow);
    const profile = (rings, materials, tile = 170) =>
      this._add(root, this._bevel(rings, Array.isArray(materials), tile, slope), materials);
    const band = (m, y, z, width = s.w - 2 * corner, height = 4, d = 4) => {
      const pitch = slope / s.w;
      const edge = box(m, 0, y, z, width * Math.hypot(1, pitch), height, d, false);
      edge.rotation.z = Math.atan(pitch);
      return edge;
    };
    const skin = (thickness, reach = depth) =>
      profile([[x, reach, 0, corner], [x, reach, -thickness * 0.42, corner],
        [x - Math.min(5, x * 0.08), reach - 3, -thickness, corner]], [cap, shell]);

    if (shape === 'skyscraper') {
      const frame = metal('#30394d'), concrete = metal('#161f31', 0.78);
      profile([[x, depth, 0, 5], [x, depth, -15, 5], [x - 6, depth - 5, -h, 5]], [cap, concrete]);
      const lights = [[], [], []];
      for (let row = 0; row < Math.floor((h - 45) / 34); row++) {
        for (let col = 0; col < 6; col++) {
          const win = (row * 11 + col * 7 + Math.round(s.x / 60)) % 11;
          lights[Math.abs(win) % 3].push([(col - 2.5) * s.w / 7, -52 - row * 34, depth - 1 - row * 0.32, s.w / 9.9, 19]);
        }
        box(frame, 0, -38 - row * 34, depth - 1, s.w - 10, 2.6, 5, false);
      }
      lights.forEach((rects, i) => this._windowInstances(root, rects,
        glow(['#405674', '#69cbf5', '#ffd386'][i], [0.18, 0.64, 0.75][i])));
      for (const px of [-x + 11, 0, x - 11]) box(frame, px, -h / 2, depth + 1, 7, h - 35, 8);
      band(trim, -6, depth + 1, s.w - 5, 5);
      for (const px of [-x + 16, -x * 0.33, x * 0.33, x - 16]) box(frame, px, 14, -depth + 12, 5, 28, 5);
      band(frame, 25, -depth + 12, s.w - 22, 4);
      box(frame, x * 0.35, 12, -depth * 0.56, Math.min(60, x * 0.57), 24, 37);
      for (let i = -2; i <= 2; i++) box(concrete, x * 0.35 + i * 8, 15, -depth * 0.56 + 19, 3, 11, 2, false);
    } else if (shape === 'starship' || shape === 'vehicle') {
      const racer = shape === 'vehicle', d = racer ? depth * 0.86 : depth;
      const armor = metal(racer ? '#283246' : pal.deckBody), gunmetal = metal('#162038');
      const glass = glow(racer ? '#528de7' : '#428fc3', 0.46);
      const jet = glow(racer ? '#7f78ff' : '#29d9ff', 1.7), lamp = glow(racer ? '#fff2b1' : '#ff9b52', 1.1);
      skin(racer ? 9 : 16, d);
      profile([[x - 2, d - 3, -6, corner], [x * 0.92, d * 1.07, -h * 0.40, 15],
        [x * (racer ? 0.78 : 0.64), d * 0.65, -h * 0.92, 16, x * 0.08],
        [x * 0.53, d * 0.52, -h, 12, x * 0.08]], armor);
      band(trim, -h * 0.35, d * 1.06, s.w * 0.72, racer ? 5 : 4);
      for (const z of [-d * 0.67, d * 0.52]) {
        const engine = blob('disk', gunmetal, -x * 0.71, -h * 0.63, z, h * 0.22, x * 0.48, h * 0.22);
        engine.rotation.z = Math.PI / 2;
        blob('disk', jet, -x * 0.95, -h * 0.63, z, h * 0.15, 7, h * 0.15, false).rotation.z = Math.PI / 2;
        const plume = blob('cone', this._energy(racer ? '#ac9aff' : '#70eaff', 0.78), -x - 10, -h * 0.63, z,
          h * 0.12, racer ? 42 : 32, h * 0.12, false);
        plume.rotation.z = Math.PI / 2;
        this.terrainAnimations.push({ type: 'jet', node: plume, length: plume.scale.y, phase: z });
        blob('smallBall', lamp, x * 0.87, -h * 0.32, z, 9, 5, 11, false);
      }
      const canopyX = x * (racer ? 0.48 : 0.37);
      blob('ball', gunmetal, canopyX, -h * 0.30, d * 0.90, x * 0.38, h * 0.21, 16);
      blob('ball', glass, canopyX + 3, -h * 0.29, d * 0.99, x * 0.29, h * 0.15, 12, false);
      if (racer) {
        const white = glow('#eff4ff', 0.22);
        for (const z of [-16, -3]) band(white, 0.6, z, s.w * 0.86, 0.8, 5);
        if (!platform) for (let i = 0; i < Math.min(6, Math.ceil(s.w / 88)); i++) {
          const px = -x * 0.68 + i * s.w * 0.13;
          box(glass, px, -h * 0.28, d * 1.01, Math.min(30, s.w * 0.09), 11, 4, false);
        }
      } else {
        const wing = this._bevel([[x * 0.72, d * 0.68, -h * 0.30, 16, -x * 0.06, d * 0.29],
          [x * 0.53, d * 0.68, -h * 0.46, 13, -x * 0.25, d * 0.53],
          [x * 0.64, d * 0.51, -h * 0.56, 11, -x * 0.17, d * 0.31]], true, 185, slope * 0.72);
        this._add(root, wing, [cap, gunmetal], 0, slope * 0.14);
        for (let i = 0; i < Math.ceil(s.w / 105); i++) {
          const px = -x + (i + 0.5) * s.w / Math.ceil(s.w / 105);
          const rib = box(gunmetal, px, -h * 0.48, d * 0.82, 9, h * 0.62, 27);
          rib.rotation.set(-0.57, 0, -0.24);
          box(jet, px + 10, -h * 0.19, d * 0.99, 15, 3, 3, false);
        }
        if (stage.id === 'corn-area' && h > 200) {
          const fin = blob('gem', armor, x * 0.24, 53, -depth * 0.84, x * 0.48, 113, 16);
          fin.rotation.z = -0.28;
        }
      }
    } else if (shape === 'castle' || shape === 'pipe' || shape === 'street' || shape === 'lcd') {
      const lip = shape === 'castle' ? 14 : shape === 'street' ? 10 : 9;
      skin(lip);
      profile([[x - 2, depth - 4, -lip, corner], [x - 3, depth - 4, -h, corner]], shell, shape === 'pipe' ? 200 : 170);
      if (shape === 'castle') {
        band(trim, -lip + 1, depth, s.w - 4, 5);
        const lead = metal('#8c5429'), glass = glow('#883ba7', 0.66), petal = glow('#55d4f2', 0.67);
        const z = depth - 2.5, yy = -Math.min(62, h * 0.44);
        for (const px of x > 115 ? [-x * 0.46, x * 0.46] : [0]) {
          blob('disk', lead, px, yy, z, 24, 8, 24).rotation.x = Math.PI / 2;
          blob('disk', glass, px, yy, z + 5, 18, 6, 18).rotation.x = Math.PI / 2;
          for (let k = 0; k < 6; k++) {
            const a = k * TAU / 6;
            blob('gem', petal, px + Math.cos(a) * 11, yy + Math.sin(a) * 11, z + 9, 4.5, 4.5, 2, false);
          }
        }
      } else if (shape === 'pipe') {
        const coin = glow('#ffd468', 0.55), face = glow('#fff2a4', 0.88);
        for (let px = -x + 29; px < x - 15; px += 63) {
          box(coin, px, -15, depth - 0.5, 26, 23, 7);
          blob('gem', face, px, -15, depth + 4, 7, 8, 2, false);
        }
      } else if (shape === 'street') {
        const curb = this._mat('#d3c7b2', { roughness: 0.95 });
        band(curb, -2, depth - 6, s.w, 9, 16);
        band(curb, -2, -depth + 6, s.w, 9, 16);
        for (let px = -x + 37; px < x - 25; px += 88) box(trim, px, 0.5, 22, 42, 0.9, 4, false);
      } else {
        const line = this._basic('#91a17b');
        for (let px = -x + 16; px < x - 12; px += 22) box(line, px, -4, depth + 0.8, 15, 2, 1.8, false);
      }
    } else if (shape === 'citadel' || shape === 'cruise' || shape === 'treehouse') {
      const wood = shape !== 'citadel';
      const outline = wood ? this._materialSurface('timber', '#825030') : this._materialSurface('stone', '#a28b76');
      skin(wood ? 15 : 19);
      band(trim, -11, depth + 0.5);
      if (shape === 'treehouse') {
        const rope = this._mat('#e7bd85'), leaves = this._mat('#459455');
        for (let px = -x + 14; px < x - 9; px += 28) {
          blob('rod', outline, px, -11, 0, 11, depth * 2 + 5, 11).rotation.x = Math.PI / 2;
          if (Math.round((px + x) / 28) % 3 === 0) {
            const length = h * (0.74 + 0.20 * Math.cos(px));
            blob('rod', shell, px, -length / 2 - 9, depth * 0.61, 12, length, 12);
            for (let i = 0; i < 2; i++) blob('disk', rope, px, -30 - 5 * i, depth * 0.61, 13, 3, 13);
            for (let i = 0; i < 4; i++) blob('gem', leaves, px + 8 * Math.sin(i + px), -30 - 12 * i, depth * 0.61 + 9, 8, 11, 4, false);
          }
        }
        band(outline, -h * 0.48, depth * 0.61, s.w * 0.87, 12, 15);
      } else if (shape === 'cruise') {
        profile([[x - 3, depth - 3, -12, corner], [x * 0.94, depth - 1, -h * 0.46, 20],
          [x * 0.66, depth * 0.60, -h, 23, x * 0.08]], shell);
        const brass = glow('#ffc869', 0.39), blue = glow('#5be7ff', 0.63);
        band(brass, -25, depth, s.w * 0.89, 5);
        band(brass, 23, -depth + 10, s.w * 0.88, 3);
        for (let px = -x * 0.39; px < x * 0.84; px += 44) {
          box(brass, px, 12, -depth + 10, 4, 24, 4);
          blob('disk', brass, px, -h * 0.38, depth, 10, 5, 10).rotation.x = Math.PI / 2;
          blob('disk', blue, px, -h * 0.38, depth + 3, 6, 3.4, 6, false).rotation.x = Math.PI / 2;
          if (h > 200) box(blue, px, -h * 0.62, depth * 0.92, 21, 20, 4, false);
        }
      } else {
        profile([[x - 4, depth - 5, -16, corner], [x * 0.95, depth * 0.80, -h * 0.65, 14],
          [x * 0.81, depth * 0.59, -h, 15]], shell);
        const clubRoof = stage.id === 'lowrule-temple' && s.w === 410;
        for (let px = -x + 36; px < x - 22; px += clubRoof ? 125 : 119) {
          box(outline, px, -h * 0.34, depth * 0.82, 20, h * 0.44, 15);
          if (!clubRoof) box(trim, px, -28, depth * 0.89, 29, 9, 17);
        }
        if (clubRoof) {
          const flame = glow('#ff913c', 1.45);
          for (let i = -1; i <= 1; i++) this._templeArch(root, outline, i * 128, -h - 142, -depth * 0.65);
          for (const px of [-188, -63, 64, 188]) {
            box(outline, px, -h - 67, -depth * 0.52, 12, 8, 16);
            const torch = blob('gem', flame, px, -h - 48, -depth * 0.48, 8, 16, 7, false);
            this.terrainAnimations.push({ type: 'flame', node: torch, phase: px });
          }
        }
      }
    } else if (shape === 'balloon' || shape === 'cloud') {
      const balloon = shape === 'balloon', turtle = s.diving;
      const puffy = h * (balloon ? 0.88 : s.id === 'ufo' || turtle ? 1.37 : 1.15);
      const white = this._mat('#fff6e8', { roughness: 0.31 }), black = this._mat('#30203c', { roughness: 0.28 });
      // Flatten the upper cushion into a full-width landing surface, not a sphere tangent.
      profile([[x, depth * 0.64, 0, corner], [x, depth * 0.87, -6, corner],
        [x * 0.91, depth, -10, corner], [x * 0.72, depth * 0.75, -puffy * 0.64, corner]], [cap, cap]);
      blob('ball', cap, 0, -puffy * 0.62, 0, x * 0.96, puffy * 0.60, depth);
      if (balloon) {
        const blush = glow(s.id === 'blimp-main' ? '#ffa55c' : '#ff87a7', 0.24);
        for (const side of [-1, 1]) {
          blob('ball', cap, side * x * 0.76, -puffy * 0.67, depth * 0.39, x * 0.24, puffy * 0.44, 32);
          blob('ball', white, side * x * 0.23, -puffy * 0.42, depth * 0.96, 15, 19, 6, false);
          blob('ball', black, side * x * 0.23 + 2, -puffy * 0.44, depth * 1.035, 8, 11, 4, false);
          blob('ball', white, side * x * 0.23 + 4, -puffy * 0.38, depth * 1.08, 2.7, 3.3, 2, false);
          blob('ball', blush, side * x * 0.53, -puffy * 0.78, depth * 0.96, 14, 6.5, 4, false);
        }
        blob('smallBall', black, 0, -puffy * 0.80, depth * 1.01, 11, 7, 3.5, false);
        const tail = this._bone(root, 'Ribbon tail', -x * 0.66, -puffy, depth * 0.29);
        const ribbon = this._mat('#fff0be', { roughness: 0.38, side: this.T.DoubleSide });
        const strip = this._shape(tail, 'plane', ribbon, -12, -20, 0, 11, 49, 1, false);
        strip.rotation.z = -0.56;
        this.terrainAnimations.push({ type: 'ribbon', node: tail, phase: s.id.length });
      } else if (turtle) {
        const green = this._mat('#76a75e'), scute = this._mat('#c9a451', { roughness: 0.78 });
        blob('ball', green, x * 0.94, -25, 8, 36, 25, 32);
        blob('smallBall', black, x + 7, -17, 33, 6, 7, 3, false);
        for (const side of [-1, 1]) {
          blob('gem', green, side * x * 0.62, -37, depth * 0.72, 30, 9, 23);
          blob('hex', scute, side * x * 0.40, -1.5, 3, 23, 2, 24, false);
        }
      } else if (s.id === 'ufo') {
        const ring = blob('ring', glow('#78f9ff', 1.1), 0, -13, 0, x * 0.88, depth * 0.95, 30, false);
        ring.rotation.x = Math.PI / 2;
        blob('ball', glow('#85aaff', 0.40), -x * 0.12, -8, -29, x * 0.42, 17, 37);
      } else {
        for (let i = 0; i < 5; i++) blob('smallBall', cap, (i - 2) * s.w * 0.15, -12 - (i % 2) * 4, 38, s.w * 0.16, 10, 29);
        if (s.vanishing) root.userData.cloud = cap;
      }
    } else {
      const rock = ['mountain', 'cavern', 'island'].includes(shape);
      const thickness = Math.min(rock ? 16 : 14, h * 0.65);
      skin(thickness);
      if (!platform) {
        const big = s.w > 3500;
        const narrow = shape === 'mountain' ? 0.83 : shape === 'cavern' ? 0.89 : 0.94;
        profile([[x - 4, depth - 3, -thickness, corner], [big ? x - 12 : x * narrow, depth - 6, -h * 0.44, corner],
          [big ? x - 22 : x * (rock ? 0.63 : 0.85), depth * 0.52, -h, corner, rock ? x * 0.05 : 0]], shell);
      }
      if (s.w < 3500) band(trim, -thickness * 0.53, depth + 0.7);
      if (rock) {
        const points = Math.ceil(s.w / 84);
        const color = shape === 'cavern' ? (stage.transformations ? pal.accent : '#aeff58')
          : stage.iceTraction ? '#b2f2ff' : shape === 'island' ? '#bec961' : '#d6a25c';
        const crystal = shape === 'cavern' ? glow(color, 0.68) : this._mat(color, { roughness: 0.72 });
        for (let i = 0; i < points; i++) {
          const px = ((i + 0.5) / points - 0.5) * s.w * 0.87;
          const crag = blob('gem', shell, px, -h * 0.59, depth * 0.64, Math.min(62, x * 0.59), h * 0.37, depth * 0.38);
          crag.rotation.set(i * 0.36, 0.3 + i * 0.92, px / x * 0.50);
          const vein = blob('gem', crystal, px, -h * 0.48, depth * 0.92,
            shape === 'cavern' ? 6 : 12, h * 0.22, 12, false);
          vein.rotation.z = -0.7 + (i % 4) * 0.32;
        }
        if (s.breakable) {
          const crack = glow('#dbff80', 0.1);
          root.userData.crack = crack;
          for (let i = 0; i < 8; i++) {
            const px = (i - 3.5) * s.w * 0.12;
            const angle = i % 2 ? 0.8 : -0.6;
            box(crack, px, -8 - (i % 3) * 8, depth + 1, 3, 28, 3, false).rotation.z = angle;
          }
        }
      }
    }
    if (s.ledges && !s.walkOff) for (const side of [-1, 1]) {
      blob('gem', trim, side * (x - 10), -5, depth * 0.72, 5, 4, 6, false);
    }
    return root;
  }

  _templeArch(root, material, x, y, z) {
    const T = this.T, outline = new T.Shape();
    outline.moveTo(-61, 0);
    outline.lineTo(-61, 84);
    outline.absarc(0, 84, 61, Math.PI, 0, true);
    outline.lineTo(61, 0);
    outline.lineTo(43, 0);
    outline.lineTo(43, 84);
    outline.absarc(0, 84, 43, 0, Math.PI, false);
    outline.lineTo(-43, 0);
    outline.closePath();
    this._add(root, new T.ExtrudeGeometry(outline, { depth: 17, bevelEnabled: false, curveSegments: 12 }), material, x, y, z);
  }

  _buildStageLandmarks(stage) {
    const T = this.T, root = this.stageLandmarks;
    const box = (m, x, y, z, w, h, d) => this._shape(root, 'box', m, x, y, z, w, h, d, false);
    const sign = (name, ink, panel, x, y, z, w, h) => this._shape(root, 'plane',
      this._basic('#ffffff', { map: getStageSignTexture(name, ink, panel, T, this), toneMapped: false }),
      x, y, z, w, h, 1, false);
    this.warpPipeMeshes = new Map();
    this.barrelMesh = this.roadMesh = this.riverMesh = null;
    for (const pipe of stage.warpPipes || []) {
      const mount = this._bone(root, pipe.id, pipe.x, pipe.y, -40);
      const jade = this._mat('#23bb63', { metalness: 0.27, roughness: 0.30 });
      const inner = this._mat('#093c31', { roughness: 0.66 });
      const rim = this._mat('#82f27c', { metalness: 0.24, roughness: 0.32, emissive: '#23e873', emissiveIntensity: 0.32 });
      this._shape(mount, 'disk', jade, 0, 12, 0, 33, 32, 33);
      this._shape(mount, 'disk', rim, 0, 27, 0, 39, 11, 39);
      this._shape(mount, 'disk', inner, 0, 33, 0, 29, 1, 29);
      const swirl = this._helix(mount, 27, 47, 1.65, 0, '#83ffbd', 0.8, 5);
      swirl.position.y = 28;
      swirl.visible = false;
      this.warpPipeMeshes.set(pipe.id, swirl);
    }
    if (stage.barrelCannon) {
      const spec = stage.barrelCannon, r = spec.radius * 0.78;
      const mount = this._bone(root, 'Barrel cannon', (spec.minX + spec.maxX) / 2, spec.y);
      const timber = this._materialSurface('timber', '#b56b38');
      const iron = this._mat('#34435b', { metalness: 0.64, roughness: 0.38 });
      const mouth = this._mat('#231c28', { roughness: 0.65, emissive: '#ff8a32', emissiveIntensity: 0.10 });
      const stave = [[r * 0.79, -r], [r, -r * 0.4], [r, r * 0.37], [r * 0.80, r]]
        .map(([rad, y]) => new T.Vector2(rad, y));
      this._add(mount, new T.LatheGeometry(stave, 18), timber);
      for (const y of [-r * 0.75, r * 0.70]) this._shape(mount, 'disk', iron, 0, y, 0, r * 0.95, 7, r * 0.95);
      this._shape(mount, 'disk', iron, 0, r, 0, r * 0.88, 8, r * 0.88);
      this._shape(mount, 'disk', mouth, 0, r + 4.2, 0, r * 0.69, 1, r * 0.69, false);
      const star = new T.Shape();
      for (let i = 0; i < 10; i++) {
        const t = TAU * i / 10 + Math.PI / 2, rad = i % 2 ? r * 0.23 : r * 0.49;
        if (i === 0) star.moveTo(Math.cos(t) * rad, Math.sin(t) * rad);
        else star.lineTo(Math.cos(t) * rad, Math.sin(t) * rad);
      }
      star.closePath();
      const badge = this._mat('#ffda72', { emissive: '#ffb347', emissiveIntensity: 0.28, metalness: 0.42 });
      this._add(mount, new T.ShapeGeometry(star), badge, 0, 0, r + 0.7, false);
      this.barrelMesh = { mount, badge, mouth };
    }
    if (stage.hotFloorY != null) this.roadMesh = this._stageFlowPlane(root, 'road', 0, stage.hotFloorY, -45, 4200, 470);
    if (stage.riverFlow) this.riverMesh = this._stageFlowPlane(root, 'river', 0, stage.riverFlow.y, -95, 2700, 600);
    if (['tropic-condo-falls', 'corporate-kingdom-2'].includes(stage.id)) {
      const tropic = stage.id === 'tropic-condo-falls';
      const falls = this._stageFlowPlane(root, 'falls', 0, -62, -133, tropic ? 242 : 218, 315);
      this.stageAnimations.push({ type: 'flow', node: falls, speed: 1 });
    }
    if (stage.id === 'onett-strip-mall' || stage.id === 'great-bay-marina') {
      const shops = stage.id === 'onett-strip-mall' ? [
        ['DRUGSTORE', -497, 270, 280, '#ad3647', '#f4e8c5'], ['BURGER SHOP', 427, 268, 310, '#14616a', '#ffc56c'],
      ] : [['MARINE LAB', -400, 294, 220, '#3a7890', '#e4e7d3']];
      const window = this._mat('#75bbcf', { emissive: '#508ba9', emissiveIntensity: 0.42, metalness: 0.37, roughness: 0.28 });
      for (const [name, x, h, w, color, facing] of shops) {
        const wall = this._mat(facing, { roughness: 0.79 }), paint = this._mat(color, { roughness: 0.62 });
        box(wall, x, h / 2 - 13, -153, w, h - 16, 102);
        box(paint, x, h - 13, -149, w + 12, 12, 120);
        box(paint, x, 120, -118, w + 17, 13, 115);
        for (let i = -2; i <= 2; i++) {
          box(window, x + i * w * 0.156, 83, -98, w * 0.116, 59, 10);
          if (i % 2) box(window, x + i * w * 0.22, h - 92, -99, w * 0.21, 33, 8);
        }
        for (let i = -4; i <= 4; i += 2) box(wall, x + i * w / 9, 122, -70, w / 9, 9, 24);
        sign(name, '#fff4d5', color, x, h - 48, -94, w * 0.81, 36);
      }
    }
    if (stage.id === 'flat-screen-calc') {
      const body = this._mat('#414a36', { roughness: 0.66 }), lip = this._mat('#6d7d5c');
      const screen = this._basic('#a9b77f', { toneMapped: false });
      box(body, 0, 179, -230, 1168, 644, 90);
      box(lip, 0, 174, -178, 1050, 560, 24);
      box(screen, 0, 177, -163, 995, 505, 12);
      sign('BIZARRO  /  LCD', '#d7dec1', '#333b2e', 0, 462, -168, 304, 37);
      const control = this._mat('#282e22');
      for (const x of [-527, 527]) this._shape(root, 'disk', control, x, -68, -172, 27, 9, 27, false).rotation.x = Math.PI / 2;
    }
    if (stage.id === 'nightmare-suburb' || stage.id === 'green-greens-suburb') {
      const suburb = stage.id === 'nightmare-suburb', name = suburb ? 'HOA  /  KEEP OFF' : 'GREEN GREENS HOA';
      const paint = this._mat(suburb ? '#eae6cd' : '#bf874d');
      const posts = suburb ? [-375, -327, -279, -231, 231, 279, 327, 375] : [-456, -410, -364, 364, 410, 456];
      for (const x of posts) box(paint, x, 25, -102, 13, 64, 12);
      for (const side of [-1, 1]) for (const y of [18, 41]) box(paint, side * (suburb ? 303 : 410), y, -96, suburb ? 157 : 105, 7, 9);
      sign(name, suburb ? '#881e36' : '#ffef9e', suburb ? '#fff1d5' : '#315946', suburb ? -330 : 385,
        79, -106, 167, 40);
    }
  }

  _buildFormBackdrop(form) {
    const T = this.T, root = this._bone(this.terrainGroup, form.name);
    const palette = new T.Color(form.accent);
    const light = new T.PointLight(palette, 165000, 750, 2);
    light.position.set(0, form.id === 'grass' ? 350 : -38, -120);
    root.add(light);
    this.terrainAnimations.push({ type: 'formLight', node: light });
    const scenic = this._mat(palette.clone().multiplyScalar(0.45), { roughness: 0.83, emissive: palette, emissiveIntensity: 0.16 });
    if (form.id === 'fire' || form.id === 'rock') {
      for (let i = 0; i < 9; i++) {
        const px = -481 + i * 120, tall = 37 + (i * 31) % 64;
        const spire = this._shape(root, 'gem', scenic, px, 18 + (i % 3) * 10, -190, 57, tall, 43, false);
        spire.rotation.set(i * 0.21, i * 1.44, i * 0.19);
      }
    } else if (form.id === 'water') {
      const falls = this._stageFlowPlane(root, 'falls', 80, 13, -145, 198, 150);
      this.terrainAnimations.push({ type: 'flow', node: falls, speed: 0.8 });
      const wheel = this._bone(root, 'Water wheel', 236, 75, -155);
      const wood = this._materialSurface('timber', '#bd895e');
      this._shape(wheel, 'ring', wood, 0, 0, 0, 77, 77, 95);
      for (let i = 0; i < 8; i++) {
        const angle = i * TAU / 8;
        this._shape(wheel, 'box', wood, Math.cos(angle) * 38, Math.sin(angle) * 38, 0, 77, 7, 18).rotation.z = angle;
      }
      this.terrainAnimations.push({ type: 'wheel', node: wheel });
    } else if (form.id === 'grass') {
      const bark = this._mat('#5c523e');
      for (let i = 0; i < 6; i++) {
        const x = (i - 2.5) * 168, h = 77 + i % 3 * 35;
        this._shape(root, 'rod', bark, x, h * 0.46, -184, 12, h, 12, false);
        this._shape(root, 'gem', scenic, x, h, -185, 54, 51, 52, false);
      }
      const ray = this._energy('#c5ffa3', 0.19, { map: getCloudTexture(T, this) });
      for (let i = 0; i < 4; i++) this._shape(root, 'plane', ray, -335 + i * 162, 141, -273, 76, 440, 1, false).rotation.z = -0.42;
      for (let i = 0; i < 7; i++) this._shape(root, 'smallBall', scenic, -390 + i * 130, 18, -150, 10, 8, 10, false);
    }
    if (form.id === 'fire') {
      for (let i = 0; i < 5; i++) {
        const flame = this._shape(root, 'cone', this._basic('#ffb25a', { transparent: true, opacity: 0.75, depthWrite: false }),
          -360 + i * 180, 78, -220, 18, 52, 18, false);
        this.terrainAnimations.push({ type: 'torch', node: flame, a: flame.scale.y, i });
      }
    } else if (form.id === 'rock') {
      const block = this._mat('#6b5e54', { roughness: 0.95 });
      for (let i = 0; i < 4; i++) this._shape(root, 'box', block, -320 + i * 210, 22, -240, 78, 40, 52, false);
    }
    this._ambientPoints(form.id === 'grass' ? 12 : -44, form.id === 'fire' ? 'acid' : 'mist',
      form.accent, 90, root, this.terrainAnimations);
  }

  _stageFlowPlane(root, kind, x, y, z, w, h) {
    const T = this.T, road = kind === 'road', falls = kind === 'falls';
    const material = new T.ShaderMaterial({
      uniforms: { clock: { value: 0 }, road: { value: road ? 1 : 0 }, falls: { value: falls ? 1 : 0 },
        foam: { value: getSurfaceTextures('water', T, this).map } },
      vertexShader: `varying vec2 st;
        void main() { st = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 st;
        uniform float clock, road, falls;
        uniform sampler2D foam;
        void main() {
          vec2 q = mix(st, vec2(st.y, st.x), falls);
          float wobble = sin(q.y * 73.0 + q.x * 12.0 - clock * 6.2);
          vec3 color;
          if (road > 0.5) {
            float lane = 1.0 - smoothstep(0.015, 0.037, abs(fract(q.y * 5.0) - 0.5));
            float dash = 1.0 - smoothstep(0.56, 0.63, fract(q.x * 24.0 + clock * 3.6 + wobble * 0.026));
            float shoulder = 1.0 - smoothstep(0.012, 0.031, min(q.y, 1.0 - q.y));
            float heat = 0.33 + 0.26 * sin(q.x * 218.0 + wobble * 1.65 + clock * 10.5);
            color = vec3(0.034, 0.028, 0.077) + vec3(0.13, 0.026, 0.013) * heat;
            color += lane * dash * vec3(1.0, 0.39, 0.095) + shoulder * vec3(0.31, 0.09, 0.89);
          } else {
            vec2 drift = q * vec2(11.0, 3.0) - vec2(clock * mix(1.49, -1.49, falls), wobble * 0.036);
            float grain = texture2D(foam, drift).b;
            float thread = sin(q.y * 95.0 + 3.3 * sin(q.x * 14.0 - clock * 3.6));
            float whitewater = smoothstep(0.29, 0.74, grain + thread * 0.145);
            color = mix(vec3(0.022, 0.29, 0.44), vec3(0.86, 0.99, 1.0), whitewater);
            if (falls > 0.5) color *= 0.63 + 0.37 * sin(st.x * 3.14159);
          }
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.ownedMaterials.add(material);
    const mesh = this._shape(root, 'plane', material, x, y, z, w, h, 1, false);
    mesh.name = kind === 'road' ? 'Hot speedway' : kind === 'river' ? 'Whitewater' : 'Waterfall';
    if (!falls) mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  _buildBackdrop(stage, { style, trim, accent }) {
    const T = this.T, pal = stage.palette, id = stage.id;
    const backdrop = this._bone(this.stageGroup, 'Scenery');
    const night = ['moon', 'space', 'neon', 'acid'].includes(style);
    if (style !== 'lcd') {
      const cloudMat = this._basic(style === 'acid' ? '#f37b6b' : night ? '#acaaf6' : '#fff2df', {
        map: getCloudTexture(T, this), transparent: true, depthWrite: false,
        opacity: night ? 0.22 : deepDaylight(id) ? 0.48 : 0.74, fog: false, toneMapped: false,
      });
      for (let i = 0; i < 10; i++) {
        const x = (i - 4.5) * 580, y = 370 + Math.sin(i * 2.23) * 290;
        const cloud = this._shape(backdrop, 'plane', cloudMat, x, y, -1260 - (i % 3) * 580, 820 + (i % 4) * 140, 260, 1, false);
        this.stageAnimations.push({ node: cloud, x, type: 'cloud', i });
      }
    }
    if (style === 'moon' || style === 'sunset' || style === 'space') {
      const mat = this._basic('#ffffff', { map: getCelestialTexture(style, T, this), transparent: true,
        depthWrite: false, fog: false, toneMapped: false });
      const orb = this._shape(backdrop, 'plane', mat, style === 'sunset' ? -705 : 730, 560, -2100, 555, 555, 1, false);
      orb.renderOrder = -2;
    }
    if (style === 'space') {
      const quiet = softenedSpace(id);
      const gridColor = new T.Color(pal.accent).multiplyScalar(quiet ? 0.32 : 1);
      const grid = new T.GridHelper(7200, quiet ? 52 : 86, gridColor, gridColor.clone().multiplyScalar(0.21));
      grid.position.set(0, quiet ? -488 : -288, quiet ? -2920 : -1800);
      grid.material.transparent = true;
      grid.material.opacity = quiet ? 0.16 : 0.42;
      grid.material.depthWrite = false;
      this.ownedMaterials.add(grid.material); this.ownedGeometries.add(grid.geometry);
      backdrop.add(grid);
      for (const side of [-1, 1]) {
        const planet = this._shape(backdrop, 'ball', this._mat(side < 0 ? '#6058a7' : '#394a87', { roughness: 0.96 }),
          side * 1410, side < 0 ? 75 : 260, -2350, 445, 445, 445, false);
        const ring = this._shape(backdrop, 'ring', this._basic(pal.accent, { transparent: true, opacity: 0.32, depthWrite: false }), planet.position.x, planet.position.y, planet.position.z, 695, 695, 210, false);
        ring.rotation.set(1.05, side * 0.15, side * 0.28);
      }
    } else if (style === 'neon' || id === 'onett-strip-mall') {
      const building = this._mat(style === 'neon' ? '#2b2e54' : '#527da6', { metalness: 0.15, roughness: 0.45 });
      const windows = this._basic(style === 'neon' ? '#fae7af' : '#abc8dc');
      const grids = [];
      for (let i = 0; i < 22; i++) {
        const x = (i - 10.5) * 186, width = 90 + (i % 4) * 25, height = 210 + (Math.sin(i * 4.3) + 1) * 170;
        const z = -1120 - (i % 3) * 125, base = -325;
        this._shape(backdrop, 'box', building, x, base + height / 2, z, width, height, 106, false);
        for (let y = 30; y < height - 15; y += 28) for (let j = 0; j < 4; j++) {
          if ((j * 17 + y * 23 + i * 31) % 11 < 7) grids.push([x + (j - 1.5) * width / 5.1, base + y, z + 54, 10, 8]);
        }
        if (i % 4 === 0) this._shape(backdrop, 'box', trim, x, base + height, z + 21, width * 0.64, 3, 60, false);
      }
      this._windowInstances(backdrop, grids, windows);
    } else if (style === 'day' || style === 'sunset' || style === 'moon' || style === 'acid') {
      const far = new T.Color(pal.skyBottom).lerp(new T.Color(pal.skyTop), 0.62);
      const nearColor = new T.Color(pal.skyTop).lerp(new T.Color(style === 'acid' ? '#452738' : '#19172d'), 0.41);
      if (deepDaylight(id)) { far.multiplyScalar(0.72); nearColor.multiplyScalar(0.79); }
      const rough = style === 'moon' || style === 'acid' || id === 'slush-summit' || id === 'lowrule-temple';
      this._ridge(backdrop, -1800, far, 25, 258, 0.68, rough);
      this._ridge(backdrop, -1260, far.clone().lerp(nearColor, 0.48), -64, 186, 1.3, rough);
      this._ridge(backdrop, -770, nearColor, -166, 159, 3.1, true);
      const near = this._mat(nearColor, { roughness: 0.93 });
      if (id === 'critter-arena' || stage.barrierX != null) {
        for (const side of [-1, 1]) {
          const bank = this._shape(backdrop, 'box', near, side * 460, 12, -430, 740, 92, 130, false);
          bank.rotation.z = side * 0.065;
          for (let i = 0; i < 3; i++) this._shape(backdrop, 'box', i === 2 ? accent : trim,
            side * 450, 3 + i * 29, -354 - i * 10, 720, 3, 6, false);
        }
      }
    } else {
      const bezel = this._mat('#37453e', { roughness: 0.75 });
      const bevel = this._mat('#c3caad', { roughness: 0.59 });
      for (const s of [-1, 1]) {
        this._shape(backdrop, 'box', bezel, s * 986, 146, -310, 90, 985, 28);
        this._shape(backdrop, 'box', bevel, s * 938, 146, -298, 8, 985, 13);
        this._shape(backdrop, 'box', bezel, 0, 146 + s * 475, -310, 1970, 50, 28);
        this._shape(backdrop, 'box', bevel, 0, 146 + s * 450, -298, 1920, 7, 13);
      }
    }
    this._buildDepthScenery(backdrop, stage, style);
  }

  _buildDepthScenery(backdrop, stage, style) {
    const T = this.T, { theme, palette: pal, id } = stage;
    if (['twilight', 'craft', 'suburb'].includes(theme)) {
      const mist = new T.Color(pal.skyMid), top = mist.clone().lerp(new T.Color(pal.deckTop), 0.43);
      const tuft = this._mat(top, { flatShading: true, roughness: 0.9 });
      const rock = this._mat(mist.clone().lerp(new T.Color(pal.deckBody), 0.52), { flatShading: true, roughness: 0.91 });
      const cloud = this._mat(mist.clone().lerp(new T.Color(style === 'moon' ? '#c1c2f5' : '#fff3ee'), 0.70),
        { flatShading: true, roughness: 1 });
      for (let i = 0; i < 6; i++) {
        const side = i % 2 ? -1 : 1;
        const x = side * (512 + Math.floor(i / 2) * 225), y = 132 + (i % 3) * 100;
        const island = this._bone(backdrop, 'Distant floating island', x, y, -850 - i * 143);
        const size = 0.71 + (i % 3) * 0.17;
        const body = this._shape(island, 'gem', rock, 0, -32 * size, 0, 117 * size, 93 * size, 76 * size, false);
        body.rotation.y = i;
        const crown = this._shape(island, 'smallBall', tuft, 0, 0, 0, 121 * size, 24 * size, 81 * size, false);
        crown.rotation.z = side * 0.16;
        this._shape(island, 'gem', tuft, 29, 22 * size, -13, 28 * size, 48 * size, 25 * size, false);
        this.stageAnimations.push({ type: 'island', node: island, x, y, i });
        const sky = this._bone(backdrop, 'Low poly cloud bank', -x * 0.89, y + 241, -1230 - i * 108);
        for (let j = 0; j < 3; j++) {
          const lobe = this._shape(sky, 'smallBall', cloud, (j - 1) * 91, j % 2 ? 19 : 0, 12 * j,
            106 - j * 9, 26 + (j % 2) * 21, 38 + j * 7, false);
          lobe.rotation.y = j * 0.4;
        }
        this.stageAnimations.push({ type: 'cloud', node: sky, x: sky.position.x, i: i + 18 });
      }
    }
    if (theme === 'cosmos') {
      const stone = this._mat(new T.Color(pal.skyMid).lerp(new T.Color('#757996'), 0.31), { roughness: 1, flatShading: true });
      const shard = this._mat(pal.accent, { roughness: 0.41, emissive: pal.accent, emissiveIntensity: 0.22 });
      for (let i = 0; i < 12; i++) {
        const x = (i - 5.5) * 162, y = 290 + Math.sin(i * 2.06) * 186;
        const asteroid = this._bone(backdrop, 'Asteroid', x, y, -760 - (i % 4) * 165);
        const size = 23 + (i % 5) * 7;
        this._shape(asteroid, 'gem', stone, 0, 0, 0, size * 1.5, size, size * 1.22, false);
        if (i % 3 === 0) this._shape(asteroid, 'gem', shard, size * 0.84, size * 0.17, 0, size * 0.75, size * 0.28, size * 0.61, false);
        this.stageAnimations.push({ type: 'asteroid', node: asteroid, x, y, i });
      }
      for (const side of [-1, 1]) {
        const orbit = this._bone(backdrop, 'Holographic orbit', side * 605, side * 43 + 267, -914);
        for (let i = 0; i < 2; i++) {
          const r = 121 + i * 26;
          const ring = this._add(orbit, new T.TorusGeometry(r, i ? 1.1 : 2.1, 4, 52, i ? Math.PI * 1.55 : TAU),
            this._energy(i ? '#a7ddff' : pal.accent, 0.37), 0, 0, 0, false);
          ring.rotation.x = 0.94 + i * 0.16;
        }
        const spark = this._sparkle(orbit, this._energy('#c7efff', 0.66), 10);
        spark.position.set(121, 0, 0);
        this.stageAnimations.push({ type: 'orbit', node: orbit, i: side });
      }
    }
    if (id === 'critter-arena' || id === 'loud-suburb-highway') {
      for (let i = 0; i < 4; i++) {
        const root = this._bone(backdrop, 'Arena spotlight', (i - 1.5) * 490, 460 + (i % 2) * 74, -820);
        const light = this._energy(i % 2 ? '#8acbff' : '#f0deff', 0.10, { side: T.FrontSide });
        const cone = this._shape(root, 'cone', light, 0, -243, 0, 87, 486, 87, false);
        this._shape(root, 'smallBall', this._energy('#c9e8ff', 0.82), 0, 0, 0, 13, 9, 10, false);
        this.stageAnimations.push({ type: 'light', node: root, i, halo: cone });
      }
      this._ambientPoints(id === 'critter-arena' ? 14 : 59, 'crowd', '#bde1ff', 330);
    }
    if (id === 'arguefield') {
      const stone = this._mat('#8d93b4', { roughness: 0.88 });
      for (const side of [-1, 1]) {
        this._shape(backdrop, 'box', stone, side * 1040, 180, -1680, 64, 460, 64, false);
        this._shape(backdrop, 'cone', stone, side * 1040, 460, -1680, 86, 120, 86, false);
      }
      this._ambientPoints(210, 'mist', '#ffb067', 70);
    }
    if (id === 'final-obligation') {
      const ob = this._mat(pal.accent, { emissive: pal.accent, emissiveIntensity: 0.4, roughness: 0.35 });
      for (const side of [-1, 1]) this._shape(backdrop, 'box', ob, side * 280, 390, -1480, 26, 240, 26, false);
    }
    if (id === 'lowrule-temple') {
      const column = this._mat('#f3ead8', { roughness: 0.7 });
      for (let i = 0; i < 7; i++) this._shape(backdrop, 'rod', column, (i - 3) * 210, 150, -1020, 26, 320, 26, false);
    }
    if (id === 'randalls-tax-shelter') this._ambientPoints(160, 'mist', '#ffd0e4', 60);
    if (/highway|commute|skyscrapers/.test(id)) {
      const streak = this._energy(pal.accent, 0.28);
      for (let i = 0; i < 5; i++) {
        const band = this._shape(backdrop, 'plane', streak, 0, 70 + i * 34, -640 - i * 30, 2100, 3.5, 1, false);
        this.stageAnimations.push({ type: 'streak', node: band, i, y: band.position.y });
      }
    }
  }

  _ambientPoints(y, mode, tint, count, parent = this.stageGroup, animations = this.stageAnimations) {
    const T = this.T, geometry = new T.BufferGeometry();
    const coords = [], seeds = [], crowd = mode === 'crowd', acid = mode === 'acid';
    for (let i = 0; i < count; i++) {
      const a = phase01(i * 0.61803399 + 0.17), b = phase01(i * 0.573743 + 0.24);
      const fountain = (i % 2 ? -1 : 1) * (i % 3 ? 443 : 194);
      coords.push(crowd ? (a - 0.5) * 2780 : acid ? (a - 0.5) * 1660 : fountain + (a - 0.5) * 168,
        crowd ? Math.floor(b * 6) * 14 + i % 3 * 2 : 0,
        crowd ? -352 - Math.floor(b * 6) * 21 : -150 - b * (acid ? 460 : 290));
      seeds.push(a, b, phase01(i * 0.763291));
    }
    geometry.setAttribute('position', new T.Float32BufferAttribute(coords, 3));
    geometry.setAttribute('seed', new T.Float32BufferAttribute(seeds, 3));
    const material = new T.ShaderMaterial({
      uniforms: { clock: { value: 0 }, viewport: { value: this.height }, tint: { value: new T.Color(tint) },
        mode: { value: crowd ? 0 : acid ? 1 : 2 } },
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: `
        uniform float clock, viewport, mode;
        attribute vec3 seed;
        varying float brightness, hue;
        void main() {
          vec3 p = position;
          float age = fract(clock*(0.40+seed.y*0.35)+seed.z);
          float size = 2.5 + seed.y*4.0;
          hue = seed.z;
          if (mode == 0.0) {
            brightness = 0.13+0.71*pow(0.5+0.5*sin(clock*3.0+seed.z*71.0),8.0);
          } else {
            p.x += sin(age*5.0+seed.x*19.0)*(mode==1.0 ? 18.0 : 24.0);
            p.y += age*(mode==1.0 ? 123.0+seed.y*97.0 : 105.0+seed.y*147.0);
            size *= mode == 1.0 ? 1.1+age*2.0 : 1.9-age*0.71;
            brightness = sin(age*3.14159)*(0.25+0.51*pow(0.5+0.5*sin(clock*5.0+seed.z*63.0),4.0));
          }
          vec4 view = modelViewMatrix*vec4(p,1.0);
          gl_PointSize = clamp(size*viewport*projectionMatrix[1][1]/max(16.0,-view.z),1.2,18.0);
          gl_Position = projectionMatrix*view;
        }`,
      fragmentShader: `
        uniform vec3 tint;
        uniform float mode;
        varying float brightness, hue;
        void main() {
          vec2 p = gl_PointCoord*2.0-1.0;
          float r = length(p);
          float core = mode == 1.0 ? 1.0-smoothstep(0.02,0.31,abs(r-0.63)) : 1.0-smoothstep(0.05,0.89,r);
          vec3 color = mix(tint, mode == 1.0 ? vec3(0.87,1.0,0.31) : vec3(1.0,0.65,0.77), hue*0.47);
          gl_FragColor = vec4(color, brightness*core);
          #include <colorspace_fragment>
        }`,
    });
    this.ownedMaterials.add(material);
    this.ownedGeometries.add(geometry);
    const particles = new T.Points(geometry, material);
    particles.position.y = y;
    particles.frustumCulled = false;
    parent.add(particles);
    animations.push({ type: 'ambient', node: particles });
    return particles;
  }


  _ridge(parent, z, base, y, height, seed, rough) {
    const T = this.T, positions = [], colors = [], indices = [];
    const count = 78;
    const fogHue = new T.Color('#7c87a9');
    for (let i = 0; i <= count; i++) {
      const x = -3600 + i * 7200 / count, f = i / count * 6.8 + seed;
      const n = 0.50 + Math.sin(f * 3.07) * 0.29 + Math.cos(f * 7.82) * 0.16;
      const peaks = 0.18 * Math.sin(i * 3.71 + seed) + 0.06 * Math.sin(i * 1.61);
      const h = y + (n + peaks * (rough ? 1 : 0.33)) * height;
      positions.push(x, h, z, x, h - 38 - n * 32, z + 9, x, -1350, z + 30);
      const rim = base.clone().lerp(fogHue, 0.18 + n * 0.18);
      const mid = base.clone().lerp(fogHue, 0.08 + n * 0.10);
      const foot = base.clone().multiplyScalar(0.64);
      colors.push(...rim.toArray(), ...mid.toArray(), ...foot.toArray());
      if (i < count) {
        const j = i * 3;
        indices.push(j,j+1,j+3, j+1,j+4,j+3, j+1,j+2,j+4, j+2,j+5,j+4);
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    this._add(parent, geo, this._basic(0xffffff, { vertexColors: true, toneMapped: false }), 0, 0, 0, false);
  }

  _windowInstances(parent, rects, material) {
    const T = this.T;
    if (!rects.length) return;
    const mesh = new T.InstancedMesh(this._unit('plane'), material, rects.length);
    const dummy = new T.Object3D();
    rects.forEach(([x, y, z, w, h], i) => {
      dummy.position.set(x, y, z);
      dummy.scale.set(w, h, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    // Three disposes the per-instance GPU buffer separately from the shared quad.
    mesh.userData.ownedInstances = true;
    parent.add(mesh);
  }

  _placeProp(prop, pal) {
    const T = this.T, type = prop.mesh, scale = prop.s || 80;
    const rise = type === 'Prop_RuinPillar' && prop.y < 0 ? 142 : 0;
    const mount = this._bone(this.stageGroup, type, prop.x + Math.sign(prop.x) * rise * 0.53, prop.y + rise, prop.z ?? -220);
    const paint = type === 'Prop_RuinPillar' ? {
      Stone: { ...getSurfaceTextures('stone', T, this), bumpScale: 0.08, color: '#a7a9c7', roughness: 1 },
    } : type === 'Prop_CosmicCrystal' ? {
      NeonPink: { emissiveIntensity: 0.44, roughness: 0.40 },
      Crystal: { emissiveIntensity: 0.24, roughness: 0.38 },
    } : type === 'Prop_StarshipPod' ? {
      Crystal: { color: new T.Color(pal.accent).multiplyScalar(0.60), emissive: pal.accent, emissiveIntensity: 0.36, roughness: 0.44 },
      Steel: { roughness: 0.50 }, GoldTrim: { roughness: 0.47 },
    } : null;
    const model = this._model('stage-props', type, paint);
    const salt = this._mat(pal.deckBody, { roughness: 0.8 });
    const jewel = this._mat(pal.accent, { emissive: pal.accent, emissiveIntensity: 0.42, metalness: 0.23 });
    if (model) {
      model.scale.setScalar(scale);
      if (type === 'Prop_Jumbotron') model.rotation.y = Math.PI;
      mount.add(model);
      // Keep silhouettes behind the playable plane even where a source model is very deep.
      mount.updateWorldMatrix(true, true);
      const bounds = new T.Box3().setFromObject(mount);
      if (bounds.max.z > -114) mount.position.z -= bounds.max.z + 114;
    } else if (type === 'Prop_Jumbotron') {
      this._shape(mount, 'box', salt, 0, scale * 0.8, 0, scale * 4.2, scale * 2.3, scale * 0.70);
      for (const x of [-1.2, 1.2]) this._shape(mount, 'rod', salt, x * scale, -scale * 0.8, 0, scale * 0.18, scale * 2, scale * 0.18);
    } else if (type === 'Prop_Fountain') {
      this._shape(mount, 'disk', salt, 0, -scale * 0.7, 0, scale * 1.55, scale * 0.56, scale * 1.55);
      this._shape(mount, 'rod', salt, 0, scale * 0.2, 0, scale * 0.41, scale * 1.9, scale * 0.41);
      this._shape(mount, 'disk', jewel, 0, scale * 0.85, 0, scale * 0.95, scale * 0.28, scale * 0.95);
      this._shape(mount, 'cone', jewel, 0, scale * 1.65, 0, scale * 0.45, scale * 1.8, scale * 0.45);
    } else if (type === 'Prop_Tree') {
      this._shape(mount, 'rod', salt, 0, -scale * 0.15, 0, scale * 0.26, scale * 2.8, scale * 0.26);
      const leaves = this._mat('#419a57');
      for (let i = 0; i < 5; i++) this._shape(mount, 'ball', leaves, (i - 2) * scale * 0.55,
        scale * (0.8 + (i % 3) * 0.33), -40, scale, scale * 0.9, scale * 0.62);
    } else {
      this._shape(mount, /IceSpire|Crystal/.test(type) ? 'gem' : 'hex', salt, 0, -scale * 0.38, 0, scale * 0.63, scale * 2.15, scale * 0.63);
      this._shape(mount, 'gem', jewel, 0, scale * 0.68, 0, scale * 0.49, scale * 0.72, scale * 0.49);
    }
    const bounds = new T.Box3().setFromObject(mount);
    if (type === 'Prop_Fountain') {
      this._fountain(mount, scale);
      bounds.max.y = Math.max(bounds.max.y, prop.y + scale * 2.95);
    } else if (type === 'Prop_Jumbotron') {
      this._jumbotron(mount, scale);
    } else if (type === 'Prop_CosmicCrystal') {
      const halo = this._shape(mount, 'ring', jewel, 0, -scale * 0.25, 0, scale * 1.94, scale * 1.94, scale * 0.9, false);
      this.stageAnimations.push({ node: mount, type: 'gyro', i: prop.x > 0 ? 1 : 0, y: prop.y, halo });
    } else if (type === 'Prop_Tree' || type === 'Prop_Balloon') {
      this.stageAnimations.push({ node: mount, type: 'sway', i: prop.x * 0.01, y: prop.y });
    } else if (type === 'Prop_Floodlight') {
      const light = this._basic('#fff1ce', { transparent: true, opacity: 0.47, depthWrite: false, toneMapped: false, map: getCloudTexture(T, this), blending: T.AdditiveBlending });
      this._shape(mount, 'plane', light, 0, scale * 2.05, scale * 0.44, scale * 3.05, scale * 1.38, 1, false);
    } else if (type === 'Prop_Skyscraper') {
      const rects = [];
      for (let y = -1.8; y < 3.65; y += 0.29) for (let i = 0; i < 5; i++) {
        if ((Math.floor((y + 2.1) * 42) + i * 3) % 11 < 7) rects.push([(i - 2) * scale * 0.29, y * scale, scale * 0.94, scale * 0.14, scale * 0.095]);
      }
      this._windowInstances(mount, rects, this._basic('#fff0b5'));
    } else if (type === 'Prop_StarshipPod') {
      const core = this._shape(mount, 'cone', this._basic(pal.accent, { transparent: true, depthWrite: false, opacity: 0.44, blending: T.AdditiveBlending }),
        -scale * 2.05, 0, 0, scale * 0.46, scale * 1.4, scale * 0.46, false);
      core.rotation.z = Math.PI / 2;
      this.stageAnimations.push({ node: core, a: core.scale.y, type: 'thruster', i: prop.x * 0.01 });
    } else if (type === 'Prop_Arwing') {
      this.stageAnimations.push({ node: mount, type: 'patrol', i: prop.x * 0.001, x: prop.x, y: prop.y, z: mount.position.z });
    } else if (type === 'Prop_Torch') {
      const flame = mount.children[0] || mount;
      this.stageAnimations.push({ node: flame, type: 'torch', a: flame.scale.y || 1, i: prop.x * 0.01 });
    } else if (type === 'Prop_RuneRing') {
      const halo = this._bone(mount, 'rune spin');
      this.stageAnimations.push({ node: mount, type: 'gyro', i: prop.x > 0 ? 1 : 0, y: prop.y, halo });
    } else if (type === 'Prop_CraftCloud') {
      this.stageAnimations.push({ node: mount, type: 'sway', i: prop.x * 0.01, y: prop.y });
    }
    return bounds;
  }

  _fountain(mount, scale) {
    const T = this.T;
    const droplets = new T.InstancedMesh(this._unit('gem'), this._energy('#b8faff', 0.82), 32);
    droplets.instanceMatrix.setUsage(T.DynamicDrawUsage);
    droplets.frustumCulled = false;
    droplets.userData.ownedInstances = true;
    mount.add(droplets);
    const rings = Array.from({ length: 2 }, () => {
      const ring = this._shape(mount, 'ring', this._energy('#94faff', 0.3), 0, scale * 1.04, 0, 1, 1, 1, false);
      ring.rotation.x = -Math.PI / 2;
      return ring;
    });
    const mist = this._shape(mount, 'plane', this._energy('#aaf7ff', 0.30, { map: getCloudTexture(T, this) }),
      0, scale * 1.25, scale * 0.6, scale * 2, scale * 0.69, 1, false);
    this.stageAnimations.push({ type: 'fountain', node: droplets, rings, mist, a: scale, dummy: new T.Object3D() });
  }

  _jumbotron(mount, scale) {
    const T = this.T, clock = { value: 0 }, alert = { value: 0 };
    const live = getJumbotronTexture(T, this);
    const m = this._basic(0xffffff, { map: live, toneMapped: false });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.displayClock = clock;
      shader.uniforms.displayAlert = alert;
      shader.fragmentShader = 'uniform float displayClock;\nuniform float displayAlert;\n' + shader.fragmentShader.replace('#include <map_fragment>', `
        #include <map_fragment>
        float band = fract(displayClock * 0.24) * 1.9 - 0.45;
        float d = (vMapUv.x + vMapUv.y * 0.36 - band) * 13.0;
        float sweep = exp(-d * d);
        diffuseColor.rgb = diffuseColor.rgb * mix(0.95 + 0.05 * sin(displayClock * 3.4), 0.94 + 0.12 * sin(displayClock * 12.0), displayAlert)
          + mix(vec3(0.09, 0.22, 0.20), vec3(0.32, 0.09, 0.025), displayAlert) * sweep;
      `);
    };
    this._shape(mount, 'plane', m, 0, scale * 0.8, scale * 0.439, scale * 3.7, scale * 1.80, 1, false);
    this.stageAnimations.push({ type: 'jumbotron', clock, alert, live, material: m });
  }

  _updateJumbotron(entry, match) {
    const t = match.frame, form = this.stageWarning;
    entry.clock.value = t / 60;
    let name;
    if (this.viewMode === 'battle') {
      if (form?.match === match && t >= form.frame && t < form.until) name = form.name;
      // A replay may seek directly into the warning window without delivering the event.
      if (!name) {
        const current = getStageForm(match.stage, t);
        if (current?.changeIn <= STAGE_WARNING_LEAD) name = current.nextForm;
      }
    }
    if (entry.name === name) return;
    entry.name = name;
    entry.alert.value = name ? 1 : 0;
    entry.material.map = name ? getJumbotronTexture(this.T, this, name) : entry.live;
  }

  _liquid(acid, y, color) {
    const T = this.T;
    const material = new T.ShaderMaterial({
      uniforms: { clock: { value: 0 },
        deep: { value: new T.Color(acid ? '#225c18' : '#133968') }, light: { value: new T.Color(color) },
        acid: { value: acid ? 1 : 0 },
        caustics: { value: getSurfaceTextures('water', T, this).map },
      },
      side: T.DoubleSide,
      vertexShader: `
        varying vec2 liquidUv;
        void main() {
          liquidUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float clock;
        uniform vec3 deep;
        uniform vec3 light;
        uniform float acid;
        uniform sampler2D caustics;
        varying vec2 liquidUv;
        void main() {
          vec2 p = liquidUv * vec2(24.0, 9.0);
          float a = sin(p.x*3.8 + p.y*1.9 + clock*1.4 + sin(p.y + clock)*0.9);
          float b = sin(p.y*5.6 - p.x*0.75 - clock*1.8 + cos(p.x*2.2)*0.9);
          float ripples = pow(max(0.0, 1.0-abs(a+b)*0.52), 5.0);
          vec2 id = floor(p);
          vec2 cell = fract(p) - 0.5;
          float seed = fract(sin(dot(id, vec2(81.2, 13.7))) * 7527.52);
          float cycle = fract(clock * 0.64 + seed);
          float bubble = (1.0 - smoothstep(0.0, 0.036, abs(length(cell) - cycle*0.32))) * (1.0-cycle) * acid;
          float grain = texture2D(caustics, liquidUv*vec2(9.0,4.0) + vec2(clock*0.035, -clock*0.028)).b;
          vec3 color = mix(deep, light, 0.09 + ripples*0.35 + bubble*0.80 + grain*0.17);
          color += light * pow(max(0.0, sin(p.y*1.1+clock*0.82)), 5.0) * 0.16;
          float reflection = pow(max(0.0, 1.0-abs(liquidUv.x-0.62+a*0.013-b*0.019)*4.6),4.0);
          float glint = pow(max(0.0, 0.5+0.5*sin(p.y*19.0+clock*2.9+a*0.8)),8.0);
          color += mix(light,vec3(0.64,0.80,1.0),0.37) * reflection*(0.13+glint*0.54)*(1.0-acid);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.ownedMaterials.add(material);
    const mesh = this._shape(this.stageGroup, 'plane', material, 0, y, -310, acid ? 3600 : 5200, acid ? 1700 : 2700, 1, false);
    mesh.rotation.x = -Math.PI * 0.5;
    return mesh;
  }

  _buildDerby(stage, trim) {
    const T = this.T;
    const barrier = this._bone(this.stageGroup, 'Safety glass', stage.barrierX, 0);
    const glass = this._basic('#54e6ff', { transparent: true, opacity: 0.13, depthWrite: false, side: T.DoubleSide });
    this._shape(barrier, 'box', glass, 0, 170, 0, 7, 340, 222, false);
    const beam = this._mat('#80ecff', { emissive: '#38d8fc', emissiveIntensity: 0.67, metalness: 0.25 });
    for (const s of [-1, 1]) this._shape(barrier, 'rod', beam, 0, 170, s * 110, 4, 340, 4, false);
    this._shape(barrier, 'box', beam, 0, 338, 0, 6, 5, 224, false);
    this._shape(barrier, 'box', beam, 0, 2, 0, 6, 4, 224, false);
    this.barrierMesh = barrier;
    const geometry = this._unit('box');
    const postMaterial = trim;
    const marks = new T.InstancedMesh(geometry, postMaterial, 80);
    marks.userData.ownedInstances = true;
    const matrix = new T.Matrix4();
    for (let i = 0; i < marks.count; i++) {
      const x = 110 + 500 * (i + 1), h = i % 5 === 4 ? 78 : 42;
      matrix.makeScale(i % 5 === 4 ? 7 : 3, h, 5);
      matrix.setPosition(x, h / 2, -115);
      marks.setMatrixAt(i, matrix);
    }
    marks.instanceMatrix.needsUpdate = true;
    this.stageGroup.add(marks);
  }

  _updateStage(match) {
    const { stage, frame: t } = match, form = match.stageForm?.index ?? 0;
    if (this.stageFormIndex !== form || !this.terrainGroup) this._buildTerrain(stage, form, t);
    const move = (root, s) => {
      root.position.set(s.x + s.w * 0.5, s.y, 0);
      if (stage.transformations) {
        // Scale and shear the baked deck profile to match the live collision slope during a form change.
        const base = root.userData.surface;
        const sy = s.h && base.h ? s.h / base.h : 1;
        const rise = (s.slope || 0) - (base.slope || 0) * sy;
        root.matrixAutoUpdate = false;
        root.matrix.set(1, 0, 0, root.position.x, rise / s.w, sy, 0, s.y + rise * 0.5, 0, 0, 1, 0, 0, 0, 0, 1);
        root.matrixWorldNeedsUpdate = true;
      }
    };
    for (const surface of match.surfaces ?? resolveStageSolids(stage, t)) {
      const root = this.solidMeshes.get(surface.id);
      if (root) move(root, surface);
    }
    for (const p of match.platforms ?? resolveStagePlatforms(stage, t)) {
      const root = this.platMeshes.get(p.id);
      if (root) move(root, p);
    }
    for (const root of this.solidMeshes.values()) {
      const { crack, surface } = root.userData, state = match.bridgeState;
      if (!surface.breakable || !state || (state.id && state.id !== surface.id)) continue;
      root.visible = !state.broken;
      const damage = 1 - clamp(state.hp / (state.maxHp ?? surface.maxHp ?? 30));
      crack.emissiveIntensity = 0.08 + damage * (1.05 + 0.76 * Math.sin(t * (0.09 + damage * 0.20)));
    }
    for (const [id, root] of this.platMeshes) {
      const cloud = root.userData.cloud;
      if (!cloud) continue;
      const state = match.platformStates?.[id];
      const stress = clamp((state?.standTimer ?? 0) / 75);
      if (state?.vanished) {
        root.userData.vanishAt ??= t;
        const fade = 1 - ease((t - root.userData.vanishAt) / 11);
        root.scale.setScalar(Math.max(0.01, fade));
        root.visible = fade > 0.02;
      } else {
        root.userData.vanishAt = null;
        root.scale.setScalar(1);
        root.visible = true;
        // Wobble in depth, so a cloud that's still solid doesn't slide off its collision edge.
        root.position.z = Math.sin(t * (0.29 + stress * 0.47)) * (2 + stress * 7) * stress;
        cloud.emissiveIntensity = 0.16 + stress * (0.40 + Math.sin(t * 0.72) * 0.33);
      }
    }
    if (this.barrelMesh) {
      const { mount, badge, mouth } = this.barrelMesh, cannon = match.barrelCannon, spec = stage.barrelCannon;
      mount.position.set(cannon?.x ?? (spec.minX + spec.maxX + Math.sin(t * spec.speed) * (spec.maxX - spec.minX)) / 2,
        cannon?.y ?? spec.y, 0);
      mount.rotation.z = -(cannon?.angle ?? 0.65 * Math.sin(t * spec.speed * 1.45));
      const age = this.stagePulse?.stage === stage.id ? t - this.stagePulse.frame : Infinity;
      const flash = 1 - clamp(age / 21), charge = cannon?.occupantPort != null ? 0.46 + Math.sin(t * 0.53) * 0.32 : 0;
      badge.emissiveIntensity = 0.28 + flash * 2 + charge;
      mouth.emissiveIntensity = 0.10 + flash * 4 + charge * 1.25;
    }
    for (const [id, mesh] of this.warpPipeMeshes) {
      const age = t - (this.warpPulses.get(id) ?? -Infinity);
      mesh.visible = age >= 0 && age < 35;
      if (!mesh.visible) continue;
      mesh.rotation.y = age * 0.29;
      mesh.scale.setScalar(0.68 + ease(age / 20) * 0.55);
      mesh.material.opacity = 0.88 * (1 - ease((age - 12) / 23));
    }
    if (this.roadMesh) this.roadMesh.material.uniforms.clock.value = t / 60;
    if (this.riverMesh) this.riverMesh.material.uniforms.clock.value = t * stage.riverFlow.vx / 180;
    for (const { type, node, length, phase } of this.terrainAnimations) {
      if (type === 'jet') node.scale.y = length * (0.90 + Math.sin(t * 0.26 + phase) * 0.19);
      if (type === 'ribbon') node.rotation.set(0.31 * Math.sin(t * 0.19 + phase), 0.52 * Math.cos(t * 0.13 + phase), 0.21 * Math.sin(t * 0.17));
      if (type === 'flame') node.scale.y = 15 + 3.5 * Math.sin(t * 0.22 + phase);
      if (type === 'wheel') node.rotation.z = -t * 0.021;
      if (type === 'formLight') node.intensity = 165000 + 28000 * Math.sin(t * 0.048);
    }
    for (const entry of [...this.stageAnimations, ...this.terrainAnimations]) {
      const { node, type, i, y, x, halo, a } = entry;
      if (type === 'cloud') node.position.x = x + Math.sin(t * 0.0015 + i) * 165;
      if (type === 'island' || type === 'asteroid') {
        const rock = type === 'asteroid';
        node.position.x = x + Math.sin(t * (rock ? 0.009 : 0.003) + i) * (rock ? 128 : 54);
        node.position.y = y + Math.sin(t * 0.014 + i * 1.71) * (rock ? 25 : 14);
        node.rotation.y = rock ? t * (i % 2 ? 0.008 : -0.005) + i : Math.sin(t * 0.004 + i) * 0.32;
        node.rotation.z = Math.cos(t * 0.009 + i) * (rock ? 0.32 : 0.075);
      }
      if (type === 'orbit') {
        node.rotation.set(0.24, t * i * 0.006, 0.24 * i + t * i * 0.012);
        node.scale.setScalar(1 + 0.09 * Math.sin(t * 0.07 + i));
        node.children[0].material.opacity = 0.30 + 0.15 * Math.cos(t * 0.09 + i);
      }
      if (type === 'light') {
        node.rotation.z = Math.sin(t * 0.017 + i * 1.44) * 0.59;
        node.rotation.x = -0.30 + Math.sin(t * 0.012 + i) * 0.18;
        halo.material.opacity = 0.075 + 0.04 * Math.sin(t * 0.044 + i * 2.1);
      }
      if (type === 'ambient') {
        node.material.uniforms.clock.value = t / 60;
        node.material.uniforms.viewport.value = this.height;
      }
      if (type === 'flow') node.material.uniforms.clock.value = t * entry.speed / 60;
      if (type === 'sway') {
        node.rotation.z = Math.sin(t * 0.024 + i) * 0.043;
        node.position.y = y + Math.sin(t * 0.018 + i) * 3.2;
      }
      if (type === 'gyro') {
        node.rotation.y = t * (i ? 0.014 : -0.013);
        node.position.y = y + Math.sin(t * 0.029 + i) * 14;
        halo.rotation.set(t * 0.027 + 0.5, Math.sin(t * 0.019 + i) * 0.65, 0.14);
      }
      if (type === 'thruster') {
        node.scale.y = a * (0.88 + 0.19 * Math.sin(t * 0.19 + i) + 0.09 * Math.cos(t * 0.39));
        node.material.opacity = 0.40 + Math.sin(t * 0.23 + i) * 0.09;
      }
      if (type === 'patrol') {
        const phase = t * 0.01 + i;
        const dir = Math.cos(phase);
        node.position.x = x + Math.sin(phase) * 900;
        node.position.y = y + Math.sin(t * 0.017 + i) * 28;
        node.rotation.y = dir >= 0 ? 0 : Math.PI;
        node.rotation.z = -dir * 0.55;
      }
      if (type === 'torch') node.scale.y = (a || 1) * (0.86 + 0.22 * Math.abs(Math.sin(t * 0.22 + (i || 0))));
      if (type === 'streak') {
        node.position.x = Math.sin(t * 0.02 + i) * 420;
        node.material.opacity = 0.16 + 0.22 * Math.abs(Math.sin(t * 0.05 + i));
      }
      if (type === 'jumbotron') this._updateJumbotron(entry, match);
      if (type === 'fountain') {
        const { dummy, mist, rings } = entry;
        for (let n = 0; n < node.count; n++) {
          const age = phase01(t / 66 + n * 0.618), turn = n * 2.39996 + t * 0.009;
          const r = age * (0.51 + n % 5 * 0.086) * a;
          const size = (1 - age * 0.65) * a * (0.012 + n % 4 * 0.005);
          dummy.position.set(Math.cos(turn) * r, a * (2.27 + 1.9 * age - 3.12 * age * age), Math.sin(turn) * r);
          dummy.scale.set(size, size * (1.4 + age), size);
          dummy.rotation.set(age, n, turn);
          dummy.updateMatrix();
          node.setMatrixAt(n, dummy.matrix);
        }
        node.instanceMatrix.needsUpdate = true;
        rings.forEach((ring, n) => {
          const age = phase01(t / 78 + n / 2);
          ring.scale.set(a * (0.19 + age * 0.67), a * (0.19 + age * 0.67), a * 0.10);
          ring.material.opacity = Math.sin(age * Math.PI) * 0.38;
        });
        mist.material.opacity = 0.34 + 0.09 * Math.sin(t * 0.06);
        mist.position.x = a * 0.09 * Math.sin(t * 0.028);
      }
    }
    if (this.waterMesh) this.waterMesh.material.uniforms.clock.value = t / 60;
    if (this.acidMesh) {
      this.acidMesh.position.y = Number.isFinite(match.acidLevel) && match.acidLevel > -900 ? match.acidLevel : -260;
      this.acidMesh.material.uniforms.clock.value = t / 36;
      this.acidSparks.position.y = this.acidMesh.position.y;
    }
    if (this.barrierMesh) this.barrierMesh.visible = !match.homerun?.barrierBroken;
    if (this.warningLane) {
      const hz = match.hazards?.find((h) => h.warningFrames > 0);
      this.warningLane.visible = !!hz;
      if (hz) {
        this.warningLane.position.set(0, hz.y + hz.h * 0.5, -42);
        this.warningLane.scale.y = hz.kind === 'starshipLaser' ? 5 + 6 * (1 - clamp(hz.warningFrames / 54)) : 3;
        this.warningLane.material.opacity = 0.20 + 0.15 * Math.sin(hz.warningFrames * 0.54);
      }
    }
  }

  _bodyMesh(group, profile, height, rx, rz, material) {
    const T = this.T;
    const points = profile.map(([y, r]) => new T.Vector2(r, y * height));
    // Interpolated profile avoids a cylinder silhouette on sleeves, suits and dress hems.
    const curve = new T.SplineCurve(points);
    const sampled = curve.getPoints(22).map((p) => new T.Vector2(Math.max(0, p.x), p.y));
    const geo = new T.LatheGeometry(sampled, 24);
    const body = this._add(group, geo, material);
    body.scale.set(rx, 1, rz);
    return body;
  }

  _featurePatch(rx, ry, rz, jaw = 0) {
    const T = this.T, geometry = new T.PlaneGeometry(1, 1, 16, 14);
    const p = geometry.attributes.position, uv = geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const theta = (0.5 - uv.getX(i)) * 1.94;
      const latitude = (uv.getY(i) - 0.5) * 2.16 + 0.10;
      const w = Math.cos(latitude) * headWidth(Math.sin(latitude), jaw);
      p.setXYZ(i, (rx + 0.52) * w * Math.cos(theta), (ry + 0.52) * Math.sin(latitude), (rz + 0.52) * w * Math.sin(theta));
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  _sculptHead(parent, material, rx, ry, rz, jaw) {
    const geo = new this.T.SphereGeometry(1, 28, 20);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const width = headWidth(pos.getY(i), jaw);
      pos.setXYZ(i, pos.getX(i) * width, pos.getY(i), pos.getZ(i) * width);
    }
    geo.computeVertexNormals();
    const head = this._add(parent, geo, material);
    head.scale.set(rx, ry, rz);
  }

  _makeCloth(parent, style, height, width, color, inside) {
    const scarf = style.prop === 'scarf', apron = style.cape === 'apron';
    const T = this.T, strips = style.cape === 'labcoat' ? 2 : 1;
    const pieces = Array.from({ length: strips }, (_, i) => {
      const geometry = new T.PlaneGeometry(1, 1, 8, 10);
      const material = this._mat(color, { side: T.DoubleSide, vertexColors: true, roughness: 0.74 });
      const uv = geometry.attributes.uv;
      const dye = new T.Color(), base = new T.Color('#ffffff'), lining = new T.Color(inside).lerp(base, 0.66);
      const colors = new Float32Array(uv.count * 3);
      for (let j = 0; j < uv.count; j++) {
        const u = uv.getX(j), v = uv.getY(j);
        const edge = u < 0.14 || u > 0.86 || v < 0.12;
        dye.copy(edge ? lining : base).multiplyScalar(0.89 + 0.11 * Math.cos(u * TAU * 2) ** 2);
        dye.toArray(colors, j * 3);
      }
      geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
      geometry.attributes.position.setUsage(T.DynamicDrawUsage);
      const mesh = this._add(parent, geometry, material);
      mesh.frustumCulled = false;
      return { mesh, offset: strips === 2 ? (i ? 0.44 : -0.44) : 0, slice: strips === 2 ? 0.47 : 1 };
    });
    return { pieces, scarf, apron, height, width };
  }

  _waveCloth(cloth, tick, air, fall) {
    const { pieces, scarf, apron, height, width } = cloth;
    for (const { mesh, offset, slice } of pieces) {
      const { position, uv } = mesh.geometry.attributes;
      for (let j = 0; j < position.count; j++) {
        const u = uv.getX(j) * 2 - 1, t = 1 - uv.getY(j);
        const wave = Math.sin(tick * 0.15 - t * 4.5 + u * 2.1 + offset);
        const fold = Math.cos(u * 6 + t * 2.3) * (0.8 + t * 1.5);
        const drag = Math.max(-0.24, air * 0.67 + fall * 0.35);
        const x = apron ? 1.7 + Math.sin(t * Math.PI) * 2.7 + fold * t
          : -height * (scarf ? 0.83 + drag * 0.62 : 0.12 + drag) * t - wave * t * (1.4 + Math.abs(air) * 2.8) - fold;
        const y = -height * t * (scarf ? 0.30 - drag * 0.86 : 1 - Math.max(0, drag) * 0.40)
          + t * t * (4 * fall + wave * (scarf ? 4.5 : 2.6) + u * u * 2.5);
        const z = width * (offset + u * slice * (scarf ? 1 - t * 0.44 : 0.78 + 0.35 * t));
        position.setXYZ(j, x, y, z);
      }
      position.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
  }

  _buildFighter(f, parent = this.battleGroup) {
    const T = this.T, def = f.def, pal = f.palette || def.palettes[0], h = def.stats.height, w = def.stats.width;
    const style = def.rig || {}, sil = style.silhouette || 'hero', puff = sil === 'puff';
    const root = this._bone(parent, def.id);
    const impactAxis = this._bone(root, 'launch-axis stretch', 0, h * .49);
    const impactRest = this._bone(impactAxis, 'launch-axis rest');
    const tumble = this._bone(impactRest, 'world tumble');
    const turn = this._bone(tumble, 'facing', 0, -h * 0.49);
    const pelvis = this._bone(turn, 'pelvis');
    const torso = this._bone(pelvis, 'torso');
    const archetype = fighterArchetype(f), build = proportions[archetype];
    const rig = { root, impactAxis, impactRest, tumble, turn, pelvis, torso, pose: { ...neutral }, stride: 0, h, w, pal, archetype,
      yaw: f.facing < 0 ? -Math.PI + STANCE : -STANCE, history: [], trailVectors: [],
      air: 0, fall: 0 };
    const fur = ['fox', 'bird', 'rodent', 'tinyRodent', 'dino', 'tallCat'].includes(sil);
    const armor = sil === 'armor' || style.prop === 'shellSpikes', isFlat = sil === 'flat2d';
    const fabric = getOutfitTextures(def, pal, T, this);
    const body = this._mat(0xffffff, { ...fabric, bumpScale: 1.30, roughness: armor ? 0.42 : 0.69, metalness: armor ? 0.37 : 0.06 });
    const main = this._mat(pal.body, { roughness: armor ? 0.41 : 0.61, metalness: armor ? 0.30 : 0.03 });
    const pants = this._mat(pal.outfit, { bumpMap: fabric.bumpMap, bumpScale: 0.45, roughness: armor ? 0.45 : 0.64, metalness: armor ? 0.28 : 0.04 });
    const skin = this._mat(fur ? pal.body : pal.skin, { roughness: 0.62 });
    const gold = this._mat('#e7aa4c', { roughness: 0.32, metalness: 0.44 });
    const detail = this._mat(pal.accent, { emissive: pal.accent, emissiveIntensity: 0.13, metalness: 0.17, roughness: 0.43 });
    const dark = this._mat('#20192b', { roughness: 0.65 });
    const light = this._mat('#f3e6da', { roughness: 0.68 });
    rig.pelvisHeight = h * (puff ? .23 : build.hips);
    if (sil === 'sandbag' || sil === 'ovenMitt') {
      this._buildSpecialFighter(rig, f, sil, body, pants, gold, dark);
    } else {
      const bulk = puff ? 1 : build.bulk * (sil === 'tallCat' ? .87 : 1);
      const depth = isFlat ? 0.39 : 1;
      const breadth = w * (puff ? 0.49 : 0.39) * bulk * depth;
      const chestSz = h * (puff ? .61 : sil === 'dress' ? .39 : build.torso);
      const chestRx = w * (puff ? 0.51 : 0.33) * bulk;
      const shoulders = puff ? chestSz * 0.66 : chestSz * 0.81;
      const profile = puff ? [[0,0],[0.06,0.48],[0.26,0.89],[0.50,1],[0.75,0.92],[0.93,0.53],[1,0]]
        : sil === 'dress' ? [[-0.64,0],[-0.62,1.40],[-0.48,1.40],[0.02,1.0],[0.32,0.62],[0.76,0.75],[0.96,0.43],[1,0]]
          : [[-0.15,0],[-0.12,0.53],[0.02,0.83],[0.27,sil === 'stout' ? 0.97 : 0.73],[0.53,0.92],[0.73,1.10],[0.89,1.01],[0.99,0.57],[1.06,0]];
      this._bodyMesh(torso, profile, chestSz, chestRx, breadth, body);
      if (!puff && sil !== 'dress') {
        this._shape(pelvis, 'ball', pants, 0, -h * 0.020, 0, chestRx * 0.87, h * 0.104, breadth * 0.94);
        this._shape(torso, 'ball', detail, chestRx * 0.81, chestSz * 0.14, 0, 2.2, h * 0.039, breadth * 0.27);
      }
      const rx = puff ? chestRx : Math.min(h * (fur || sil === 'kid' ? 0.255 : 0.23), w * 0.51);
      const ry = puff ? chestSz * 0.48 : h * (sil === 'stout' ? 0.225 : 0.212);
      const rz = puff ? breadth : rx * (isFlat ? 0.43 : 1.09);
      const jaw = puff || fur || armor ? 0 : sil === 'stout' ? 0.10 : 0.25;
      const neckY = puff ? chestSz * 0.49 : chestSz * (sil === 'dress' ? 0.92 : 0.93);
      const neck = this._bone(torso, 'neck', puff ? 1 : chestRx * 0.09, neckY);
      const head = this._bone(neck, 'head', 0, !puff ? ry * 0.54 : 0);
      rig.neck = neck; rig.head = head;
      if (!puff) {
        const neckBand = this._shape(torso, 'ball', armor || style.prop === 'scarf' ? detail : pants, 0, neckY + 1, 0, rx * 0.66, h * 0.065, rz * 0.70);
        neckBand.rotation.z = 0.17;
        this._sculptHead(head, style.hat === 'visorHelm' ? pants : skin, rx, ry, rz, jaw);
        if (!isFlat && !fur && !armor) for (const s of [-1, 1]) {
          this._shape(head, 'smallBall', skin, -rx * 0.14, -ry * 0.06, s * rz * 0.92, rx * 0.32, ry * 0.39, rz * 0.21);
        }
      }
      const mantle = { main, pants, detail, dark, gold, skin, light };
      this._dressHead(rig, f, style, sil, { rx, ry, rz, jaw, ...mantle });
      if (parent !== this.battleGroup && rig.muzzle && rig.face) {
        const grin = new T.PlaneGeometry(1, 1, 12, 6);
        const { position, uv } = grin.attributes;
        for (let i = 0; i < position.count; i++) {
          const u = uv.getX(i), v = uv.getY(i);
          const theta = (0.5 - u) * 1.79, latitude = mix(-1.04, -0.44, v);
          const width = 1.025 * Math.cos(latitude);
          position.setXYZ(i, width * Math.cos(theta), 1.025 * Math.sin(latitude), width * Math.sin(theta));
          uv.setXY(i, mix(0.25, 0.75, u), mix(0.19, 0.37, v));
        }
        grin.computeVertexNormals();
        rig.muzzleGrin = this._add(rig.muzzle, grin, this._basic('#ffffff', {
          map: getFaceTexture(def, pal, 'victory', T, this), transparent: true, depthWrite: false, alphaTest: 0.03,
        }), 0, 0, 0, false);
        rig.muzzleGrin.visible = false;
      }
      if (style.prop === 'tie') {
        const tie = this._model('characters', 'Part_Tie');
        if (tie) {
          tie.position.set(chestRx * 1.13, chestSz * 0.53, 0);
          tie.scale.set(chestRx * 0.73, chestSz * 0.79, breadth * 0.88);
          tie.rotation.z = -0.18;
          torso.add(tie);
        } else {
          const red = this._mat('#dc2342');
          this._shape(torso, 'gem', red, chestRx * 1.13, chestSz * 0.91, 0, 2.8, 4.0, breadth * 0.17);
          this._shape(torso, 'cone', red, chestRx * 1.13, chestSz * 0.51, 0,
            2.6, chestSz * 0.70, breadth * 0.22).rotation.z = Math.PI - 0.18;
        }
      }
      if (style.prop === 'shellSpikes') {
        const shell = this._model('characters', 'Part_SpikedShell', { CharGreen: pal.outfit });
        if (shell) {
          shell.scale.set(chestRx * 0.78, chestSz * 0.49, breadth * 0.88);
          shell.position.set(-chestRx * 0.82, chestSz * 0.47, 0);
          torso.add(shell);
        } else {
          this._shape(torso, 'ball', pants, -chestRx * 0.81, chestSz * 0.47, 0, chestRx * 0.68, chestSz * 0.63, breadth);
          for (const s of [-1, 0, 1]) {
            const thorn = this._shape(torso, 'cone', light, -chestRx * 1.26, chestSz * 0.50, s * breadth * 0.65, 6, 14, 6);
            thorn.rotation.z = Math.PI / 2;
          }
        }
      }
      if (style.cape || style.prop === 'scarf') {
        const scarf = style.prop === 'scarf', apron = style.cape === 'apron';
        const cape = this._bone(torso, 'cloth', chestRx * (apron ? 1.02 : -0.86),
          scarf ? neckY : apron ? chestSz * 0.59 : shoulders, scarf ? breadth * 0.70 : 0);
        const cloth = style.cape === 'labcoat' ? '#edf2ff' : apron || style.cape === 'nda' ? pal.outfit : pal.accent;
        rig.cloth = this._makeCloth(cape, style, chestSz * (apron ? 0.94 : scarf ? 1.19 : 1.47),
          breadth * (scarf ? 0.32 : 0.91), cloth, pal.outfit);
      }
      if (style.tail) {
        const tail = this._bone(pelvis, 'tail', -chestRx * 0.77, h * 0.09, 0);
        const bush = style.tail === 'bushy', jagged = style.tail === 'jagged';
        const length = h * (bush ? 0.46 : jagged ? 0.37 : 0.58);
        const thick = h * (bush ? 0.119 : jagged ? 0.063 : 0.079);
        this._shape(tail, jagged ? 'box' : 'ball', jagged ? detail : main, -length * 0.32, 0, 0, length * 0.51, thick, thick * 0.91);
        const tip = this._bone(tail, 'tail tip', -length * 0.60, 0, 0);
        this._shape(tip, jagged ? 'box' : 'ball', bush ? light : jagged ? detail : main, -length * 0.26, 0, 0, length * 0.39, thick * 0.79, thick * 0.73);
        rig.tail = tail;
        rig.tailTip = tip;
      }
      this._articulate(rig, f, { puff, depth, breadth, chestRx, shoulders, build, ...mantle });
      this._portraitExtras(rig, f, style, sil, { rx, ry, rz, chestRx, chestSz, breadth });
      if (style.buddy) this._buildBuddy(rig, pants, detail, light, dark);
    }
    const edged = new Map(), zones = new Map();
    rig.flashMaterials = new Map();
    rig.strikeNodes = rig.limbs ? { grip: rig.limbs[0].grip, offGrip: rig.limbs[1].grip,
      foot: rig.limbs[0].foot, offFoot: rig.limbs[1].foot, knee: rig.limbs[0].kneeCap, tool: rig.tool, held: rig.heldSocket }
      : { grip: rig.torso };
    for (const [zone, joint] of Object.entries(rig.strikeNodes)) joint?.traverse((node) => zones.set(node, zone));
    root.traverse((node) => {
      if (!node.isMesh) return;
      const rim = (m) => {
        if (!m.isMeshStandardMaterial || m.transparent) return m;
        const zone = zones.get(node) || 'body';
        let copies = edged.get(m);
        if (!copies) edged.set(m, copies = new Map());
        if (!copies.has(zone)) {
          const owned = !copies.size && this.ownedMaterials.has(m) ? m : m.clone();
          this.ownedMaterials.add(owned);
          copies.set(zone, addFighterRim(owned));
          const slots = rig.flashMaterials.get(zone) || [];
          slots.push(owned.userData.combatFlash);
          rig.flashMaterials.set(zone, slots);
        }
        return copies.get(zone);
      };
      node.material = Array.isArray(node.material) ? node.material.map(rim) : rim(node.material);
    });
    if (style.eyes === 'none') this._flatOutline(rig);
    if (parent === this.battleGroup) this._buildFighterEffects(rig, f);
    return rig;
  }

  _buildSpecialFighter(rig, f, style, body, pants, gold, dark) {
    const T = this.T, h = rig.h;
    rig.pelvisHeight = 0;
    if (style === 'ovenMitt') {
      const quilt = getOutfitTextures(f.def, rig.pal, T, this);
      const mitt = this._model('characters', 'Boss_MasterMitt',
        { CharWhite: { color: rig.pal.body, map: quilt.map, bumpMap: quilt.bumpMap, bumpScale: 0.18, roughness: 0.72 } });
      if (mitt) {
        mitt.scale.setScalar(h * 0.33);
        mitt.position.y = h * 0.51;
        rig.torso.add(mitt);
      } else {
        this._shape(rig.torso, 'ball', body, 0, h * 0.55, 0, h * 0.33, h * 0.49, h * 0.22);
        const thumb = this._shape(rig.torso, 'ball', body, h * 0.30, h * 0.44, 0, h * 0.19, h * 0.27, h * 0.16);
        thumb.rotation.z = -0.57;
        this._shape(rig.torso, 'disk', pants, 0, h * 0.13, 0, h * 0.28, h * 0.14, h * 0.19);
      }
      return;
    }
    const burlap = getOutfitTextures(f.def, rig.pal, T, this);
    const sack = this._model('characters', 'NPC_SaggingBag',
      { Burlap: { color: '#e8d6bb', map: burlap.map, bumpMap: burlap.bumpMap, bumpScale: 0.12, roughness: 0.94 } });
    if (sack) {
      sack.scale.setScalar(h / 2.61);
      sack.position.y = h * 1.05 / 2.61;
      sack.rotation.y = -Math.PI / 2;
      rig.torso.add(sack);
    } else {
      this._shape(rig.torso, 'ball', body, 0, h * 0.48, 0, h * 0.34, h * 0.51, h * 0.28);
      this._shape(rig.torso, 'box', gold, h * 0.32, h * 0.54, 0, 2, 15, 17);
    }
    for (const side of [-1, 1]) this._shape(rig.torso, 'smallBall', dark, h * 0.24, h * 0.68, side * 5, 2.4, 2.8, 2.4);
  }

  _dressHead(rig, f, style, sil, { rx, ry, rz, jaw, main, pants, detail, dark, gold, skin, light }) {
    const T = this.T, head = rig.head, pal = rig.pal, hatKey = HATS[style.hat];
    const helmet = style.hat === 'visorHelm' || style.hat === 'birdHelmet';
    const cap = hatKey === 'Hat_Cap';
    const hat = hatKey && this._model('characters', hatKey,
      { NeutralTint: pal.outfit, CharGreen: pal.body, CharOrange: sil === 'fox' ? pal.body : '#ff982d',
        CharRed: cap || helmet ? pal.outfit : pal.body, CharCyan: pal.accent,
        CharTeal: style.hat === 'glasses' ? '#1aa8b8' : pal.accent });
    if (hat) {
      let x = 0, y = ry * 0.64, sx = rx, sy = ry * 0.71, sz = rz;
      if (cap) {
        sx *= 1.04; sy *= style.hat === 'capTall' ? 1.12 : 0.82; sz *= 1.06;
        if (style.hat === 'backCap' || style.hat === 'snapback') hat.rotation.y = Math.PI;
      }
      if (style.hat === 'bowler') { y = ry * 0.69; sy *= 1.05; }
      if (style.hat === 'headmirror') { y = ry * 0.75; sx *= 0.87; sy *= 0.72; sz *= 0.86; }
      if (style.hat === 'elfCap') { y = ry * 0.94; sx *= 0.81; sy *= 0.93; sz *= 0.91; }
      if (hatKey === 'Hat_Crown') { y = ry * 0.32; sy *= 0.98; }
      if (helmet) { x = -rx * 0.08; y = ry * 0.08; sx *= 1.12; sy = ry * 1.02; sz *= 1.09; }
      if (style.hat === 'foxEars') { x = -rx * 0.05; y = -ry * 0.02; sx = rx * 0.92; sy = ry * 0.95; sz = rz * 0.92; }
      if (style.hat === 'toucanBeak') { x = -rx * 0.02; y = -ry * 0.06; sx = rx * 1.08; sy = ry * 1.02; sz = rz * 1.02; }
      if (style.hat === 'visorHelm') { x = -rx * 0.18; y = ry * 0.02; sx = rx * 1.08; sy = ry * 1.06; sz = rz * 1.08; }
      if (style.hat === 'glasses') { x = rx * 0.12; y = ry * 0.06; sx = rx * 0.92; sy = ry * 0.78; sz = rz * 0.9; }
      hat.position.set(x, y, 0);
      hat.scale.set(sx, sy, sz);
      head.add(hat);
      if (style.hat === 'elfCap') rig.softHat = hat;
    } else if (hatKey) {
      if (style.hat === 'visorHelm') {
        this._shape(head, 'ball', main, -rx * 0.18, ry * 0.06, 0, rx * 0.92, ry * 1.04, rz * 1.12);
        this._shape(head, 'ball', light, -rx * 0.05, ry * 0.88, 0, rx * 0.61, ry * 0.16, rz * 0.25);
        for (const s of [-1, 1]) {
          this._shape(head, 'ball', gold, -rx * 0.12, -ry * 0.07, s * rz * 0.96, rx * 0.30, ry * 0.33, rz * 0.23);
        }
      } else if (helmet) this._shape(head, 'ball', main, -rx * 0.23, ry * 0.15, 0, rx, ry, rz * 1.09);
      else if (style.hat === 'toucanBeak') {
        const beak = this._shape(head, 'cone', gold, rx * 1.15, -ry * 0.35, 0, rz * 0.46, rx * 1.27, ry * 0.33);
        beak.rotation.z = -Math.PI / 2;
      } else if (style.hat === 'elfCap') {
        const cap = this._bone(head, 'cloth cap', -rx * 0.11, ry * 0.78);
        const point = this._shape(cap, 'cone', main, -rx * 0.34, ry * 0.33, 0, rx * 0.77, ry * 1.54, rz * 0.82);
        point.rotation.z = 0.73;
        this._shape(cap, 'ball', gold, 0, -ry * 0.04, 0, rx * 0.82, ry * 0.15, rz * 0.86);
        rig.softHat = cap;
      } else if (style.hat !== 'foxEars') {
        this._shape(head, 'ball', pants, -rx * 0.08, ry * 0.70, 0, rx * 0.98, ry * 0.52, rz * 1.08);
        this._shape(head, 'disk', detail, rx * 0.23, ry * 0.61, 0, rx * 0.91, ry * 0.13, rz * 1.11);
      }
    }
    if (['elfCap', 'tiaraHair', 'tiara', 'headband', 'mysticCrown'].includes(style.hat) && sil !== 'flat2d') {
      const hair = this._mat(sil === 'dress' || style.hat === 'elfCap' ? '#b76d36' : style.hat === 'headband' ? '#b84b46' : '#524387');
      rig.hair = [];
      for (const s of [-1, 1]) {
        const lock = this._bone(head, 'hair lock', -rx * 0.46, ry * 0.43, s * rz * 0.77);
        this._shape(lock, 'ball', hair, -rx * 0.08, -ry * 0.46, 0, rx * 0.46, ry * (sil === 'dress' ? 0.94 : 0.63), rz * 0.23);
        rig.hair.push(lock);
      }
    }
    const horns = style.hat === 'horns' && this._model('characters', 'Part_DragonHorns');
    if (horns) {
      horns.position.set(-rx * 0.16, ry * 0.59, 0);
      horns.scale.set(rx * 0.92, ry * 0.78, rz * 0.85);
      horns.rotation.z = 0.18;
      head.add(horns);
    } else if (['foxEars', 'catEars', 'boltEars', 'horns'].includes(style.hat) && (style.hat !== 'foxEars' || !hat)) {
      rig.ears = [];
      for (const s of [-1, 1]) {
        const ear = this._bone(head, 'ear', -rx * 0.20, ry * 0.77, s * rz * 0.70);
        ear.rotation.x = s * 0.31;
        const tall = ry * (style.hat === 'boltEars' ? 1.42 : style.hat === 'horns' ? 0.99 : 0.83);
        const outer = style.hat === 'horns' ? light : main;
        this._shape(ear, 'cone', outer, 0, tall * 0.34, 0, rx * 0.30, tall, rz * 0.36);
        this._shape(ear, 'cone', style.hat === 'boltEars' ? dark : detail, 0.6, tall * 0.72, s * 0.5, rx * 0.19, tall * 0.35, rz * 0.23);
        rig.ears.push(ear);
      }
    }
    if (style.hat === 'hood' || style.hat === 'ninjaWrap') {
      this._shape(head, 'ball', main, -rx * 0.28, 0, 0, rx * 1.04, ry * 1.18, rz * 1.13);
      if (style.hat === 'hood') {
        const rim = this._shape(head, 'ring', light, rx * 0.43, 0, 0, rz * 1.01, ry * 0.95, 1.95);
        rim.rotation.y = Math.PI / 2;
      } else {
        const band = this._shape(head, 'ball', detail, -rx * 0.01, ry * 0.69, 0, rx * 0.99, ry * 0.18, rz * 0.94);
        band.rotation.z = 0.13;
      }
    }
    const sleepMask = style.hat === 'sleepMask' && this._model('characters', 'Hat_SleepMask',
      { CharCyan: { color: new T.Color(pal.accent).lerp(new T.Color('#f9dfff'), 0.56), roughness: 0.58 } });
    if (sleepMask) {
      sleepMask.position.set(rx * 0.22, ry * 0.35, 0);
      sleepMask.scale.set(rx * 0.88, ry * 0.68, rz * 0.81);
      sleepMask.rotation.z = -0.07;
      head.add(sleepMask);
    } else if (style.hat === 'headband' || style.hat === 'sleepMask') {
      const band = this._shape(head, 'ball', detail, -rx * 0.05, ry * 0.73, 0, rx * 0.84, ry * 0.16, rz * 0.83);
      band.rotation.z = style.hat === 'sleepMask' ? -0.07 : 0.10;
    }
    if (style.hat === 'lcdNose') {
      this._shape(head, 'ball', main, rx * 0.91, -ry * 0.09, 0, rx * 0.46, ry * 0.25, rz * 0.85);
      this._shape(head, 'ball', detail, rx * 0.86, ry * 0.02, rz * 0.36, 2.9, 2.9, 1.3);
    } else if (['dino', 'fox', 'rodent', 'tinyRodent', 'tallCat'].includes(sil) && !(sil === 'fox' && hat)) {
      const muzzle = this._shape(head, 'ball', sil === 'dino' || sil === 'fox' ? light : skin,
        rx * 0.68, -ry * 0.36, 0, rx * 0.52, ry * 0.35, rz * 0.63);
      muzzle.rotation.z = -0.09;
      rig.muzzle = muzzle;
      if (sil === 'fox' || sil === 'tallCat') this._shape(head, 'ball', dark, rx * 1.13, -ry * 0.32, 0, 3.5, 3.0, 4.2);
    }
    if (style.stache) {
      const moustache = this._model('characters', 'Part_Mustache');
      if (moustache) {
        moustache.scale.set(rx * 1.16, ry * 0.72, rz * 0.64);
        moustache.position.set(rx * 0.11, -ry * 0.19, 0);
        head.add(moustache);
      } else for (const s of [-1, 1]) {
        const curl = this._shape(head, 'ball', dark, rx * 0.86, -ry * 0.36, s * rz * 0.24, rx * 0.27, ry * 0.17, rz * 0.43);
        curl.rotation.x = s * 0.24;
      }
      this._shape(head, 'ball', skin, rx * 0.96, -ry * 0.12, 0, rx * 0.28, ry * 0.23, rz * 0.29);
    }
    if (style.eyes !== 'none') {
      const faceRx = style.hat === 'birdHelmet' ? rx * 1.16 : style.hat === 'hood' || style.hat === 'ninjaWrap' ? rx * 1.07 : rx;
      const faceRz = style.hat === 'birdHelmet' ? rz * 1.05 : rz;
      const material = this._mat(0xffffff, { map: getFaceTexture(f.def, pal, 'normal', T, this), transparent: true, depthWrite: false,
        roughness: 0.88, alphaTest: 0.03, emissive: helmet ? pal.accent : 0xffffff, emissiveIntensity: helmet ? 0.24 : 0.02 });
      if (helmet) material.emissiveMap = material.map;
      rig.face = this._add(head, this._featurePatch(faceRx, ry, faceRz, jaw), material, 0, 0, 0, false);
      rig.face.renderOrder = 1;
      if (['visorHelm', 'birdHelmet', 'foxEars', 'toucanBeak', 'glasses'].includes(style.hat)) {
        rig.face.position.x = style.hat === 'visorHelm' || style.hat === 'birdHelmet' ? rx * 0.26 : rx * 0.12;
        rig.face.renderOrder = 5;
      }
      rig.expression = 'normal';
    }
  }

  _pinPart(parent, name, x, y, z, sx, sy, sz, tint) {
    const node = this._model('characters', name, tint);
    if (!node || !parent) return null;
    node.position.set(x, y, z);
    node.scale.set(sx, sy, sz);
    parent.add(node);
    return node;
  }

  _portraitExtras(rig, f, style, sil, { rx, ry, rz, chestRx, chestSz }) {
    const id = f.def.id, head = rig.head;
    if (!head) return;
    const dropEars = () => {
      if (!rig.ears) return;
      for (const ear of rig.ears) ear.removeFromParent();
      rig.ears = null;
    };
    if (id === 'dadondorf') this._pinPart(head, 'Part_Beard', rx * 0.12, -ry * 0.42, 0, rx * 1.05, ry * 0.95, rz * 0.9);
    if (id === 'screech') this._pinPart(head, 'Part_HairBun', -rx * 0.02, ry * 0.72, 0, rx * 0.95, ry * 0.85, rz * 0.9);
    if (id === 'broshee') {
      const snout = this._pinPart(head, 'Part_DinoSnout', rx * 0.2, -ry * 0.12, 0, rx * 1.2, ry * 1.05, rz * 1.05);
      if (snout && rig.muzzle) { rig.muzzle.removeFromParent(); rig.muzzle = null; }
      this._pinPart(rig.torso, 'Part_Spines', -chestRx * 0.15, chestSz * 0.72, 0, chestRx * 0.55, chestSz * 0.4, rz * 0.7);
    }
    if (id === 'wonky-kong' || id === 'mess' || id === 'troy') {
      this._pinPart(head, 'Part_HairCrest', 0, ry * 0.62, 0, rx * 0.9, ry * 0.75, rz * 0.85);
    }
    if (id === 'spitzu') {
      if (this._pinPart(head, 'Part_MouseEars', 0, ry * 0.35, 0, rx * 1.15, ry * 1.05, rz * 1.2)) dropEars();
    }
    if (id === 'chikapu') {
      if (this._pinPart(head, 'Part_BoltEars', 0, ry * 0.42, 0, rx * 1.1, ry * 1.0, rz * 1.05)) dropEars();
      this._pinPart(head, 'Hat_Cap', 0, ry * 0.58, 0, rx * 0.82, ry * 0.52, rz * 0.88, { NeutralTint: '#e23b3b' });
    }
    if (id === 'gigglefluff') {
      this._pinPart(head, 'Part_CatEars', 0, ry * 0.28, 0, rx * 0.85, ry * 0.7, rz * 0.8);
      this._pinPart(head, 'Part_HairSwirl', rx * 0.02, ry * 0.48, 0, rx * 0.65, ry * 0.55, rz * 0.65);
    }
    if (id === 'velda') this._pinPart(head, 'Hat_Hood', -rx * 0.08, ry * 0.05, 0, rx * 1.08, ry * 1.02, rz * 1.05, { NeutralTint: rig.pal.body });
    if (id === 'bario' || style.prop === 'monocle') this._pinPart(head, 'Part_Monocle', rx * 0.08, ry * 0.02, 0, rx * 0.9, ry * 0.82, rz * 0.85);
    if (id === 'zink' || id === 'tiny-zink' || id === 'dadondorf') {
      this._pinPart(head, 'Part_ElfEars', rx * 0.05, -ry * 0.02, 0, rx * 0.85, ry * 0.75, rz * 0.95);
    }
    if (id === 'mewtooth' && rig.turn) {
      const orb = this._shape(rig.turn, 'smallBall', this._mat('#7eefff', { emissive: '#7eefff', emissiveIntensity: 0.8 }),
        rx * 1.55, ry * 0.15, rz * 0.35, 7, 7, 7);
      orb.name = 'xray orb';
    }
  }

  _flatOutline(rig) {
    const T = this.T;
    const mat = this._mat('#f4f8ff', { side: T.BackSide, emissive: '#ffffff', emissiveIntensity: 1.4, roughness: 0.35 });
    const meshes = [];
    rig.turn?.traverse((node) => { if (node.isMesh && !node.material?.transparent) meshes.push(node); });
    for (const node of meshes) {
      const shell = new T.Mesh(node.geometry, mat);
      shell.scale.set(1.045, 1.045, 1.08);
      node.add(shell);
    }
  }

  _articulate(rig, f, { puff, depth, breadth, chestRx, shoulders, build, main, pants, detail, dark, gold, skin, light }) {
    const h = rig.h, w = rig.w, pal = rig.pal, style = f.def.rig || {};
    const u = h * (puff ? .10 : .172 * build.arm), l = h * (puff ? .083 : .15 * build.arm);
    const girth = w * build.limbs;
    const thigh = rig.pelvisHeight * (puff ? 0.43 : 0.46), calf = rig.pelvisHeight * 0.40;
    const gloveSize = Math.max(4, w * (puff ? 0.15 : 0.137));
    rig.limbs = [];
    for (const s of [1, -1]) {
      const label = s === 1 ? 'right' : 'left';
      const shoulder = this._bone(rig.torso, label + ' shoulder', chestRx * 0.01, shoulders, s * breadth * 0.79);
      const arm = this._bone(shoulder, label + ' upperArm');
      const fore = this._bone(arm, label + ' forearm', 0, -u, 0);
      const grip = this._bone(fore, label + ' grip', 0, -l, 0);
      const pauldron = style.silhouette === 'armor';
      this._shape(arm, 'ball', main, 0, -u * 0.44, 0, girth * 0.121, u * 0.67, girth * 0.113 * depth);
      this._shape(arm, 'ball', pauldron ? detail : main, 0, -u * 0.08, s * w * 0.029 * depth,
        girth * (pauldron ? 0.17 : 0.139), w * 0.145, girth * (pauldron ? 0.20 : 0.141) * depth);
      this._shape(fore, 'smallBall', pauldron ? dark : main, 0, 0, 0, w * 0.098, w * 0.093, w * 0.099 * depth);
      this._shape(fore, 'ball', style.stache || style.silhouette === 'parka' ? main : skin, 0, -l * 0.48, 0, girth * 0.106, l * 0.73, girth * 0.093 * depth);
      this._shape(fore, 'disk', style.silhouette === 'armor' ? gold : pants, 0, -l * 0.76, 0, gloveSize * 0.91, l * 0.21, gloveSize * depth);
      const glove = this._model('characters', 'Part_Glove',
        { CharWhite: style.silhouette === 'armor' ? pal.outfit : style.stache ? '#f3f3ff' : style.silhouette === 'parka' ? pal.accent : pal.skin });
      if (glove) {
        glove.scale.set(gloveSize * 2.26, gloveSize * 2.05, gloveSize * 2.0 * depth);
        glove.position.x = -gloveSize * 0.17;
        glove.rotation.z = -0.42;
        grip.add(glove);
      } else this._shape(grip, 'ball', light, 0, 0, 0, gloveSize, gloveSize, gloveSize * depth);
      const hip = this._bone(rig.pelvis, label + ' hip', 0, 0, s * breadth * 0.48);
      const leg = this._bone(hip, label + ' upperLeg');
      const shin = this._bone(leg, label + ' shin', 0, -thigh, 0);
      const kneeCap = this._bone(shin, label + ' knee cap');
      const foot = this._bone(shin, label + ' ankle', 0, -calf, 0);
      this._shape(leg, 'ball', pants, 0, -thigh * 0.40, 0, girth * 0.126, thigh * 0.79, girth * 0.12 * depth);
      this._shape(kneeCap, 'smallBall', pauldron ? detail : pants, w * 0.025, 0, 0, w * 0.103, w * 0.111, w * 0.108 * depth);
      this._shape(shin, 'ball', pants, 0, -calf * 0.42, 0, girth * 0.109, calf * 0.77, girth * 0.102 * depth);
      const flurby = f.def.id === 'flurby';
      const leather = flurby ? '#e23b3b' : style.stache ? new this.T.Color('#704039').lerp(new this.T.Color(pal.outfit), 0.36) : pal.outfit;
      const boot = this._model('characters', 'Part_Boot', { NeutralTint: leather });
      const bootSize = w * (flurby ? 0.52 : puff ? 0.37 : 0.32);
      if (boot) {
        boot.scale.set(bootSize, bootSize * (puff ? 0.61 : 0.79), bootSize * depth);
        boot.position.set(bootSize * 0.04, bootSize * 0.05, 0);
        foot.add(boot);
      } else {
        this._shape(foot, 'ball', pants, bootSize * 0.24, -2, 0, bootSize * 0.58, bootSize * 0.33, bootSize * 0.41 * depth);
      }
      if (style.silhouette === 'armor') {
        const coil = this._model('characters', 'Part_DuctCoil');
        if (coil) {
          coil.scale.set(girth * 0.42, u * 0.85, girth * 0.42);
          coil.position.y = -u * 0.48;
          arm.add(coil);
        }
      }
      rig.limbs.push({ shoulder, arm, fore, grip, hip, leg, shin, kneeCap, foot });
    }
    if (style.silhouette === 'armor') {
      const waist = this._model('characters', 'Part_DuctCoil');
      if (waist) {
        waist.scale.set(w * 0.22, h * 0.08, w * 0.22);
        waist.position.y = h * 0.02;
        rig.pelvis.add(waist);
      }
    }
    const hand = rig.limbs[0].grip;
    rig.tool = this._bone(hand, 'weapon socket');
    rig.heldSocket = this._bone(hand, 'item socket', gloveSize * 0.33, 0.3, gloveSize * 0.26);
    const spec = WEAPONS[style.prop];
    const tip = spec?.[2] || (style.prop === 'pill' ? 13 : 4);
    rig.trailBase = this._bone(rig.tool, 'trail inner', spec ? tip * 0.40 : 1, 0, 0);
    rig.trailTip = this._bone(rig.tool, 'trail outer', tip, 0, 0);
    if (spec) {
      const model = this._model(spec[3] || 'weapons', spec[0]);
      if (model) {
        model.scale.setScalar(spec[1]);
        if (style.prop === 'crystal') model.position.x = -8;
        rig.tool.add(model);
      } else {
        const shaft = this._shape(rig.tool, 'rod', dark, tip * 0.32, 0, 0, 2.2, tip * 0.88, 2.2);
        shaft.rotation.z = Math.PI / 2;
        this._shape(rig.tool, 'ball', detail, tip * 0.66, 0, 0, tip * 0.27, 5, 3.9);
      }
    } else if (style.prop === 'pill' || style.prop === 'tofu') {
      this._shape(rig.tool, style.prop === 'tofu' ? 'gem' : 'ball', detail, 10, 0, 0, 7, 5, 5);
      if (style.prop === 'pill') this._shape(rig.tool, 'ball', light, 7, 0, 0, 5, 5.2, 5.2);
    }
    if (style.shield === 'trashLid') {
      const forearm = rig.limbs[1].fore;
      const lid = this._model('characters', 'Part_TrashLid');
      if (lid) {
        lid.position.set(0, -l * 0.45, -w * 0.15);
        lid.scale.setScalar(w * 0.32);
        lid.rotation.set(0, Math.PI / 2, 0.16);
        forearm.add(lid);
      } else {
        this._shape(forearm, 'disk', pants, 0, -l * 0.45, -w * 0.15,
          w * 0.27, 2.9, w * 0.27).rotation.x = Math.PI / 2;
        this._shape(forearm, 'ring', gold, 0, -l * 0.45, -w * 0.17, w * 0.24, w * 0.24, w * 0.11);
      }
    }
    rig.hasWeapon = Boolean(spec);
  }

  _buildBuddy(rig, pants, detail, light, dark) {
    const h = rig.h;
    const buddy = this._bone(rig.turn, 'Nana-Bot', -29, 0, -22);
    const bot = this._model('characters', 'Buddy_NanaBot');
    if (bot) {
      bot.scale.setScalar(h * 0.42);
      bot.position.y = h * 0.12;
      buddy.add(bot);
      rig.buddy = buddy;
      return;
    }
    this._shape(buddy, 'ball', detail, 0, h * 0.30, 0, 11, h * 0.21, 10);
    this._shape(buddy, 'ball', pants, 0, h * 0.52, 0, 10, 10, 10);
    this._shape(buddy, 'ball', light, 7, h * 0.52, 0, 4, 6.5, 8);
    for (const s of [-1, 1]) {
      this._shape(buddy, 'ball', dark, 10, h * 0.54, s * 3.4, 2, 2.6, 2);
      this._shape(buddy, 'ball', light, 2, h * 0.055, s * 5, 6.5, 4, 4);
    }
    rig.buddy = buddy;
  }

  _fresnel(color, opacity, power, pattern = 0) {
    const T = this.T;
    const mat = new T.ShaderMaterial({
      uniforms: { paint: { value: new T.Color(color) }, alpha: { value: opacity }, power: { value: power }, pattern: { value: pattern }, clock: { value: 0 } },
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: `
        varying vec3 n;
        varying vec3 v;
        varying vec2 tex;
        void main() {
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          n = normalize(normalMatrix * normal);
          v = -view.xyz;
          tex = uv;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `
        uniform vec3 paint;
        uniform float alpha;
        uniform float power;
        uniform float pattern;
        uniform float clock;
        varying vec3 n;
        varying vec3 v;
        varying vec2 tex;
        void main() {
          float rim = pow(1.0 - max(0.0, dot(normalize(n), normalize(v))), power);
          vec2 p = tex * vec2(12.0, 6.92);
          vec2 q = vec2(1.0, 1.732);
          vec2 a = mod(p, q) - q*0.5;
          vec2 b = mod(p - q*0.5, q) - q*0.5;
          vec2 cell = abs(dot(a,a) < dot(b,b) ? a : b);
          float border = max(dot(cell, vec2(0.5,0.866)), cell.x);
          float hex = smoothstep(0.445, 0.49, border) * pattern;
          float pulse = 0.68 + 0.32*sin(tex.y*24.0 - clock*5.0);
          float lightWave = pow(0.5+0.5*cos(tex.y*18.0 + cos(tex.x*6.283-clock)*2.5-clock*2.8), 7.0);
          float amount = 0.055 + rim*0.79 + hex*0.59*pulse + (1.0-pattern)*lightWave*0.18;
          gl_FragColor = vec4(mix(paint, vec3(1.0), rim*0.39), alpha*amount);
          #include <colorspace_fragment>
        }`,
    });
    this.ownedMaterials.add(mat);
    return mat;
  }

  _energy(color, opacity = 0.8, extra = {}) {
    return this._basic(color, { opacity, transparent: true, depthWrite: false,
      fog: false, toneMapped: false, blending: this.T.AdditiveBlending, ...extra });
  }

  _helix(parent, radius, height, turns, phase, color, opacity, width) {
    const T = this.T, geo = new T.BufferGeometry(), points = [], shades = [], indices = [];
    const steps = Math.ceil(turns * 24);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, a = phase + t * turns * TAU, r = radius * (0.48 + 0.52 * t);
      const fade = Math.sin(t * Math.PI) ** 0.55;
      for (let side = 0; side < 2; side++) {
        points.push(Math.cos(a) * r, t * height + side * width * fade, Math.sin(a) * r);
        shades.push(1, 1, 1, fade * (side ? 0.13 : 1));
      }
      if (i < steps) indices.push(i*2, i*2+1, i*2+2, i*2+1, i*2+3, i*2+2);
    }
    geo.setAttribute('position', new T.Float32BufferAttribute(points, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(shades, 4));
    geo.setIndex(indices);
    return this._add(parent, geo, this._energy(color, opacity, { side: T.DoubleSide, vertexColors: true }), 0, 0, 0, false);
  }

  _sparkle(parent, material, size) {
    const T = this.T;
    if (!this.baseGeo.has('sparkle')) {
      const outline = new T.Shape();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4, r = i % 2 ? 0.28 : 1;
        const x = Math.sin(a) * r, y = Math.cos(a) * r;
        if (i === 0) outline.moveTo(x, y); else outline.lineTo(x, y);
      }
      outline.closePath();
      const geo = new T.ExtrudeGeometry(outline, { depth: 0.13, bevelEnabled: false });
      this.baseGeo.set('sparkle', geo);
    }
    return this._shape(parent, 'sparkle', material, 0, 0, 0, size, size, size, false);
  }

  _buildSignatureEffects(rig, f) {
    const T = this.T, { root, h } = rig, id = f.def.id;
    const moves = Object.values(f.def.moves || {});
    const hand = rig.limbs?.[0].grip;
    if (hand && moves.some((m) => m.kind === 'chargeShot')) {
      const shadow = f.def.rig?.prop === 'xrayOrb', color = shadow ? '#bd61ff' : '#4defff';
      rig.orbMount = this._bone(hand, 'Charge socket');
      rig.orbAtMuzzle = !shadow;
      rig.orb = this._bone(rig.orbMount, 'Stored charge', shadow ? 8 : 24, shadow ? 5 : 0, 0);
      this._shape(rig.orb, 'smallBall', this._energy(shadow ? '#e7b5ff' : '#d2ffff', 0.86), 0, 0, 0, 0.52, 0.52, 0.52, false);
      this._shape(rig.orb, 'ball', this._fresnel(color, 0.91, 2.0), 0, 0, 0, 1, 1, 1, false);
      for (let i = 0; i < 2; i++) {
        const curl = this._helix(rig.orb, 1.12, 1.3, 1.25, i * Math.PI, i ? color : '#ffffff', 0.72, 0.22);
        curl.position.y = -0.65;
        curl.rotation.z = i ? -0.77 : 0.77;
      }
      rig.orbLevel = 0;
    }
    if (hand && moves.some((m) => m.kind === 'chargePunch')) {
      rig.fistSteam = this._bone(hand, 'Golden fist steam');
      const map = getFistSteamTexture(T, this);
      rig.fistVents = Array.from({ length: 4 }, () => this._shape(rig.fistSteam, 'plane',
        this._energy('#ffc26a', .8, { map, side: T.DoubleSide }), 0, 0, 0, 1, 1, 1, false));
      rig.fistGleam = this._shape(rig.fistSteam, 'impactStar',
        this._energy('#ffe6a4', .72, { side: T.DoubleSide }), 0, 0, 0, 1, 1, 1, false);
      rig.fistSteam.visible = false;
    }
    if (hand && (id === 'captain-pigeon' || id === 'dadondorf')) {
      const bird = id === 'captain-pigeon', flame = this._bone(hand, bird ? 'Pigeon flame' : 'Warlock flame', 5, 0, 4);
      const hot = this._energy(bird ? '#ffd441' : '#f88cff', 0.78);
      const flare = this._energy(bird ? '#ff6a19' : '#ff4937', 0.69);
      this._shape(flame, 'ball', this._fresnel(bird ? '#ff9132' : '#f53fff', 0.96, 2), 0, 0, 0, 22, 22, 22, false);
      this._shape(flame, 'ball', hot, 1, 0, 0, 12, 10, 10, false);
      if (bird) {
        const beak = this._shape(flame, 'cone', hot, 15, 3, 0, 5, 17, 5, false);
        beak.rotation.z = -Math.PI / 2;
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
          const wing = this._shape(flame, 'cone', i === 0 ? hot : flare, -7 - i * 5, 7 + i * 2, s * (8 + i * 5), 5, 29 - i * 3, 4, false);
          wing.rotation.set(s * (0.98 + i * 0.22), 0, 0.87 + i * 0.24);
        }
      } else {
        this._shape(flame, 'ball', flare, 6, 5, 1, 14, 13, 14, false);
        const black = this._basic('#35132f', { toneMapped: false });
        for (const s of [-1, 1]) this._shape(flame, 'smallBall', black, 14, 7, s * 8, 6, 5, 5, false);
        for (let i = -1; i <= 1; i++) this._shape(flame, 'box', hot, 12, -8, i * 5, 6, 8, 3, false);
      }
      rig.punch = flame;
    }
    if (moves.some((m) => m.kind === 'rest')) {
      rig.rest = this._bone(root, 'Rest bloom', 0, h * 0.48, 7);
      const circle = this._shape(rig.rest, 'ring', this._energy('#ffa6d9'), 0, 0, 0, 35, 35, 16, false);
      circle.rotation.x = -0.36;
      const paints = [this._energy('#f27dcc'), this._energy('#ffe39a')];
      rig.restPetals = Array.from({ length: 9 }, (_, i) => this._shape(rig.rest, i % 3 ? 'smallBall' : 'gem',
        paints[i % 2], 0, 0, 0, 5, 13, 5, false));
    }
    if (moves.some((m) => m.kind === 'spin')) {
      rig.cyclone = this._bone(root, 'Cyclone');
      this._helix(rig.cyclone, 57, h, 2.35, 0, '#c2f5ff', 0.63, 9);
      this._helix(rig.cyclone, 52, h * 0.92, 2.1, Math.PI, '#799dff', 0.55, 13);
    }
    if (id === 'screech') {
      rig.floatHalo = this._bone(root, 'Parasol float', 0, -3, 0);
      const colors = [this._energy('#ff93d7', 0.62), this._energy('#ffe8ad', 0.72)];
      rig.floatWaves = colors.map((m) => {
        const ring = this._shape(rig.floatHalo, 'ring', m, 0, 0, 0, 1, 1, 0.4, false);
        ring.rotation.x = -Math.PI / 2;
        return ring;
      });
      rig.floatStars = Array.from({ length: 5 }, (_, i) => this._sparkle(rig.floatHalo, colors[i % 2], 3));
    }
    rig.star = this._bone(root, 'Invinci-Star');
    const shimmer = this._fresnel('#ffd75e', 0.57, 3.2);
    this._shape(rig.star, 'ball', shimmer, 0, h * 0.51, 0, rig.w * 0.64, h * 0.61, rig.w * 0.57, false);
    rig.starShimmer = shimmer.uniforms.paint.value;
    rig.starSparks = Array.from({ length: 7 }, (_, i) => this._sparkle(rig.star,
      this._energy(0xffffff, 0.87, { side: T.DoubleSide }), i % 3 ? 5 : 8));
    for (const effect of [rig.orb, rig.punch, rig.rest, rig.cyclone, rig.floatHalo, rig.star]) if (effect) effect.visible = false;
  }

  _buildFighterEffects(rig, f) {
    const T = this.T, h = rig.h, root = rig.root;
    const shadow = new T.ShaderMaterial({
      uniforms: { strength: { value: 0.75 }, limits: { value: new T.Vector2(0, 1) } },
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      vertexShader: `
        varying vec2 st;
        void main() { st=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform float strength;
        uniform vec2 limits;
        varying vec2 st;
        void main() {
          if (st.x < limits.x || st.x > limits.y) discard;
          float r=length(st*2.0-1.0);
          gl_FragColor=vec4(0.025,0.016,0.046,strength*(1.0-smoothstep(0.12,0.99,r)));
        }`,
    });
    this.ownedMaterials.add(shadow);
    rig.shadow = this._shape(root, 'plane', shadow, 0, 0, 0, 1, 1, 1, false);
    rig.shadow.rotation.x = -Math.PI / 2;
    rig.shadow.renderOrder = -1;
    rig.shield = this._shape(root, 'ball', this._fresnel(playerColor(f.port), 0.8, 1.7, 1), 0, h * 0.48, 0, 1, 1, 1, false);
    rig.shield.visible = false;
    rig.shieldColor = new T.Color(playerColor(f.port));
    rig.pastelShield = rig.shieldColor.clone().lerp(new T.Color('#edf0ff'), 0.61);
    rig.shieldWarn = new T.Color('#ff4d62');
    rig.shieldInk = new T.Color();
    rig.lightShieldBand = this._shape(rig.shield, 'ring', this._energy(rig.pastelShield, 0.20), 0, 0, 0, 1.01, 1.01, 0.47, false);
    rig.shine = this._bone(root, 'Reflector', 0, h * 0.49, 0);
    const electro = this._energy('#39bfff', 0.28);
    const outline = this._energy(SHINE, 0.85);
    for (const [r, z, thickness] of [[42, 8, 8], [32, 19, 4]]) {
      const pane = this._shape(rig.shine, 'hex', electro, 0, 0, z, r, thickness, r, false);
      pane.rotation.x = Math.PI / 2;
      pane.rotation.y = Math.PI / 2;
      this._add(rig.shine, new T.TorusGeometry(r, 1.65, 5, 6), outline, 0, 0, z + 5, false);
    }
    const sparks = this._bone(rig.shine, 'Electric orbit', 0, 0, 23);
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      const spark = this._sparkle(sparks, outline, 5);
      spark.position.set(46 * Math.cos(a), 46 * Math.sin(a), 0);
      spark.rotation.z = a;
    }
    rig.shineSparks = sparks;
    rig.shine.visible = false;
    rig.charge = this._bone(root, 'Energy rings');
    const aura = this._basic('#ffd876', { transparent: true, opacity: 0.69, depthWrite: false, blending: T.AdditiveBlending });
    rig.chargeRings = Array.from({ length: 3 }, () => {
      const ring = this._shape(rig.charge, 'ring', aura, 0, 0, 0, 1, 1, 1, false);
      ring.rotation.x = Math.PI / 2;
      return ring;
    });
    rig.charge.visible = false;
    const respawn = this._bone(root, 'Respawn pad', 0, -5, 0);
    this._shape(respawn, 'disk', this._mat('#749bba', { emissive: '#54bdd0', emissiveIntensity: 0.52, metalness: 0.6 }),
      0, -1, 0, 36, 7, 22, false);
    const trim = this._shape(respawn, 'ring', outline, 0, 3, 0, 36, 23, 24, false);
    trim.rotation.x = Math.PI / 2;
    respawn.visible = false;
    rig.respawn = respawn;
    this._buildSignatureEffects(rig, f);

    const solidEnergy = (color, opacity) => this._energy(color, opacity, { side: T.DoubleSide, blending: T.NormalBlending });
    rig.swingArc = this._bone(root, 'Active attack crescent');
    rig.swingRim = this._shape(rig.swingArc, 'swingRim', solidEnergy('#748cff', .94), 0, 0, 0, 1, 1, 1, false);
    rig.swingCore = this._shape(rig.swingArc, 'swingCore', solidEnergy('#ffffff', .99), 0, 0, .038, 1, 1, 1, false);
    const glow = (parent, color) => this._shape(parent, 'plane', this._energy(color, .81,
      { map: getCombatGlowTexture(T, this), side: T.DoubleSide }), 0, 0, 0, 1, 1, 1, false);
    rig.strikeGlow = glow(root, '#ffffff');
    rig.strikeGlow.renderOrder = 6;
    rig.specialEnergy = this._bone(root, 'Special energy charge');
    rig.specialGlow = glow(rig.specialEnergy, '#ffffff');
    rig.specialHalo = Array.from({ length: 3 }, () => this._shape(rig.specialEnergy, 'sweepRim', solidEnergy('#ff6e32', .66),
      0, 0, 0, 1, 1, 1, false));
    rig.specialAim = this._shape(rig.specialEnergy, 'aimFlare', solidEnergy('#fff4b0', .95), 0, 0, 0, 1, 1, 1, false);
    rig.specialEmbers = Array.from({ length: 10 }, () => this._shape(rig.specialEnergy, 'gem', solidEnergy('#ffbe4a', .91),
      0, 0, 0, 1, 1, 1, false));
    rig.comet = this._bone(root, 'Special launch comet');
    rig.cometOuter = this._shape(rig.comet, 'comet', solidEnergy('#ff6e32', .79), 0, 0, 0, 1, 1, 1, false);
    rig.cometOuter.material.side = T.FrontSide;
    rig.cometCore = this._shape(rig.comet, 'comet', solidEnergy('#fff8be', .89), 13, 0, 9, 1, 1, 1, false);
    rig.cometCore.material.side = T.FrontSide;
    rig.cometCore.renderOrder = 4;
    rig.cometFlares = Array.from({ length: 3 }, () => this._shape(rig.comet, 'aimFlare', solidEnergy('#ffbe4a', .94),
      0, 0, 0, 1, 1, 1, false));
    for (const effect of [rig.swingArc, rig.strikeGlow, rig.specialEnergy, rig.comet]) effect.visible = false;

    // A connected ribbon from measured world-space grip and teeth/tool-tip samples.
    const geo = new T.BufferGeometry();
    const count = TRAIL_ROWS;
    const coords = new T.BufferAttribute(new Float32Array(count * 2 * 3), 3).setUsage(T.DynamicDrawUsage);
    const colors = new Float32Array(count * 2 * 4);
    const indices = [];
    for (let i = 0; i < count; i++) {
      if (i < count - 1) indices.push(i*2, i*2+1, i*2+2, i*2+1, i*2+3, i*2+2);
    }
    geo.setIndex(indices);
    geo.setAttribute('position', coords);
    geo.setAttribute('color', new T.BufferAttribute(colors, 4).setUsage(T.DynamicDrawUsage));
    const ribbonMat = this._energy('#ffffff', 0.76, { side: T.DoubleSide, vertexColors: true });
    rig.ribbon = this._add(root, geo, ribbonMat, 0, 0, 0, false);
    rig.ribbon.frustumCulled = false;
    rig.ribbon.visible = false;
    for (let i = 0; i < TRAIL_HISTORY; i++) rig.trailVectors.push([new T.Vector3(), new T.Vector3()]);
    rig.trailColor = new T.Color();
    rig.trailEdge = new T.Color();
    if (f.def.id === 'master-mitt') this._buildMittTells(rig);
  }

  _buildMittTells(rig) {
    const T = this.T, { root, h, w } = rig;
    const marker = this._bone(root, 'Countertop Slam target');
    const floorPaint = (color) => this._basic(color, { side: T.DoubleSide, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    const ring = this._add(marker, new T.RingGeometry(0.76, 1, 48), floorPaint('#ff2855'), 0, 0, 0.3, false);
    const disk = this._add(marker, new T.CircleGeometry(0.8, 48), floorPaint('#680f32'), 0, 0, 0, false);
    const inner = this._shape(marker, 'ring', floorPaint('#ffb1ab'), 0, 0, 0.5, 0.52, 0.52, 1, false);
    disk.renderOrder = 2; ring.renderOrder = inner.renderOrder = 3;

    const muzzle = this._bone(root, 'Finger-Gun flash');
    const fire = this._shape(muzzle, 'impactStar', this._energy('#ffc274', 0.95, { side: T.DoubleSide }), 6, 0, 0, 34, 15, 16, false);
    const core = this._shape(muzzle, 'smallBall', this._energy('#fff3cc', 0.94), 4, 0, 0, 12, 5, 5, false);
    const bloom = this._shape(muzzle, 'plane', this._energy('#ff8c3b', 0.7, { map: getCombatGlowTexture(T, this), side: T.DoubleSide }),
      2, 0, 0, 72, 52, 1, false);

    const aura = this._bone(rig.torso, 'Enraged Mitt aura');
    const rim = this._shape(aura, 'ball', this._fresnel('#ffac36', 0.50, 3.2), 0, h * 0.58, 0, w * 0.67, h * 0.62, w * 0.47, false);
    const embers = Array.from({ length: 6 }, (_, i) => this._shape(aura, 'gem',
      this._energy(i % 2 ? '#ffa138' : '#ffdb76', 0.63), 0, 0, 0, 1, 1, 1, false));
    for (const effect of [marker, muzzle, aura]) effect.visible = false;
    rig.mittTells = { marker, disk, inner, ring, muzzle, fire, core, bloom, aura, rim, embers };
  }

  _updateMittTells(rig, f, tick, tell, move, age) {
    const { marker, disk, inner, ring, muzzle, fire, core, bloom, aura, rim, embers } = rig.mittTells;
    const { root, shadow, h, w } = rig, sc = root.scale.x;
    const phase = age / Math.max(1, move?.startup ?? 1) + 1;
    if ((marker.visible = tell === 'slam' && age < 0 && shadow.visible)) {
      const beat = 0.5 + 0.5 * Math.sin(tick * 0.40);
      marker.position.copy(shadow.position);
      marker.position.y += 1.6 / sc;
      marker.rotation.copy(shadow.rotation);
      const r = (move?.radius ?? 64) * mix(1.34, 1, ease(phase)) * (1 + beat * 0.06);
      marker.scale.set(r, r * 0.98, 1);
      ring.material.opacity = 0.70 + 0.28 * beat;
      inner.material.opacity = 0.53 + 0.36 * beat;
      disk.material.opacity = 0.36 + 0.20 * beat;
    }
    const cycle = move?.shotInterval || Infinity;
    const shotAge = age - (Number.isFinite(cycle) ? Math.min(Math.floor(age / cycle), Math.floor(((move?.active || 1) - 1) / cycle)) * cycle : 0);
    if ((muzzle.visible = tell === 'gun' && (age < 0 || shotAge < 5))) {
      const facing = f.facing || 1;
      const aim = mittGunAim(f, move);
      const reach = Math.max(Math.abs(move?.offsetX ?? 30), w * 0.77 * sc);
      muzzle.position.set((f.x + facing * reach - root.position.x) / sc,
        (f.y + (move?.offsetY ?? h * 0.5) - root.position.y) / sc, w * 0.21);
      muzzle.rotation.z = Math.atan2(Math.sin(aim), facing * Math.cos(aim));
      const strength = age < 0 ? mix(0.18, 0.55, ease(phase)) * (0.86 + 0.14 * Math.sin(tick * 0.5)) : 1 - ease(shotAge / 5);
      muzzle.scale.setScalar(mix(0.40, 1.46, strength));
      fire.material.opacity = strength * 0.96;
      core.material.opacity = Math.min(1, strength * 1.4);
      bloom.material.opacity = strength * 0.75;
    }
    if ((aura.visible = f.bossPhase >= 2)) {
      rim.material.uniforms.clock.value = tick / 60;
      rim.material.uniforms.alpha.value = 0.30 + 0.075 * Math.sin(tick * 0.16);
      embers.forEach((ember, i) => {
        const a = tick * 0.045 + i * 2.39996, rise = phase01(tick / 48 + i * 0.382);
        ember.position.set(w * 0.62 * Math.cos(a), h * (0.14 + 1.10 * rise), w * 0.45 * Math.sin(a));
        const size = (2.6 + i % 3) * Math.sin(Math.PI * rise);
        ember.scale.set(size, size * 1.85, size);
        ember.rotation.z = a;
      });
    }
  }

  _updateContact(rig, f, match) {
    const shadow = rig.shadow;
    let surface = null, top = -Infinity;
    for (const surfaces of [match.platforms, match.surfaces || match.stage.solid]) {
      for (const p of surfaces || []) {
        if (f.x < p.x || f.x > p.x + p.w) continue;
        const y = getSurfaceY(p, f.x);
        if (y <= f.y + 0.8 && y > top) { surface = p; top = y; }
      }
    }
    if (!surface || f.state === S.RESPAWN || f.y - top > 450) { shadow.visible = false; return; }
    shadow.visible = true;
    const sc = rig.root.scale.x, gap = Math.max(0, f.y - top);
    const width = Math.max(34, rig.w * 1.32) * (1 + Math.min(gap / 270, 0.56));
    const pitch = (surface.slope || 0) / surface.w;
    shadow.position.set((f.x - rig.root.position.x) / sc, (top + 1.2 - rig.root.position.y) / sc, 0);
    shadow.rotation.set(-Math.PI / 2, 0, Math.atan(pitch), 'ZYX');
    shadow.scale.set(width * Math.hypot(1, pitch), width * 0.76, 1);
    const u = shadow.material.uniforms, half = width * sc * 0.5;
    u.strength.value = 0.85 - 0.67 * ease(gap / 425);
    u.limits.value.set(0.5 + (surface.x - f.x) / (2 * half), 0.5 + (surface.x + surface.w - f.x) / (2 * half));
  }

  _updateSignature(rig, f, tick, delta, attacking, active) {
    const d = f.moveData, frame = f.moveFrame || 0, h = rig.h, startup = d?.startup || 1;
    if (rig.orb) {
      const charge = clamp(Math.max(f.chargeShotLevel || 0, f.charging && d?.kind === 'chargeShot' ? (f.chargeFrames || 0) / 60 : 0));
      rig.orbLevel = charge > 0 ? mix(rig.orbLevel, charge, 1 - Math.exp(-Math.max(delta, 0.2) * 0.31)) : 0;
      rig.orb.visible = charge > 0;
      if (rig.orb.visible) {
        const muzzle = rig.orbAtMuzzle && f.heldItemId == null;
        rig.orbMount.rotation.z = muzzle ? rig.tool.rotation.z : 0;
        rig.orb.position.set(muzzle ? 24 : 8, muzzle ? 0 : 5, f.heldItemId != null ? 8 : 0);
        rig.orb.scale.setScalar((3.1 + 14.5 * Math.sqrt(rig.orbLevel)) * (1 + 0.075 * Math.sin(tick * 0.32)));
        rig.orb.rotation.set(tick * 0.12, tick * 0.20, tick * 0.073);
      }
    }
    if (rig.fistSteam) {
      const stored = clamp(f.chargeShotLevel || 0);
      const punching = attacking && d?.kind === 'chargePunch';
      const power = punching ? Math.max(stored, f.specialCharge || 0, (f.chargeFrames || 0) / 60) : stored;
      rig.fistSteam.visible = Boolean(stored || punching && (f.charging || frame < startup + (d.active || 5)));
      if (rig.fistSteam.visible) {
        const strength = clamp(power, .18, 1);
        const hand = rig.limbs[0];
        rig.fistSteam.rotation.z = -(rig.pose.arm + rig.pose.elbow);
        rig.fistVents.forEach((vent, i) => {
          const drift = this.allowFlash ? phase01(tick / 23 + i / 4) : (i + 1) / 5;
          vent.position.set(-3 + Math.sin(i * 2.40) * (4 + 13*drift), 7 + drift * (15 + strength * 15), (i % 2 ? 1 : -1) * 7);
          vent.rotation.set(0, hand.shoulder.rotation.x * .15 + (i % 2 ? .27 : -.35), (i - 1.5) * .36);
          const size = (8 + 15*drift) * (.65 + .45*strength);
          vent.scale.set(size, size*1.55, 1);
          vent.material.opacity = Math.sin(drift * Math.PI) * strength * (active ? .92 : .61);
        });
        rig.fistGleam.scale.setScalar(6 + 9*strength);
        rig.fistGleam.material.opacity = active ? .88 : .34 + .25*strength;
      }
    }
    if (rig.punch && (rig.punch.visible = attacking && f.moveKey === M.NEUTRAL_B && frame >= startup - 11 && frame < startup + (d?.active || 5) + 3)) {
      const windup = ease((frame - startup + 11) / 11);
      const release = 1 - clamp((frame - startup - (d?.active || 5)) / 3);
      rig.punch.scale.setScalar((0.27 + 0.76 * windup + (active ? 0.14 : 0)) * release * (0.94 + 0.07 * Math.cos(tick * 1.77)));
      rig.punch.rotation.z = -(rig.pose.arm + rig.pose.elbow) + Math.sin(tick * 0.6) * 0.12;
    }
    if (rig.rest && (rig.rest.visible = attacking && d?.kind === 'rest' && frame >= startup && frame < startup + 24)) {
      const age = clamp((frame - startup) / 24), spread = 10 + ease(age) * 92;
      rig.rest.rotation.z = age * 0.78;
      rig.rest.children[0].scale.set(spread, spread, 22);
      rig.rest.children[0].material.opacity = 0.73 * (1 - age);
      rig.restPetals.forEach((petal, i) => {
        const a = i * TAU / rig.restPetals.length;
        petal.position.set(Math.cos(a) * spread, Math.sin(a) * spread, Math.sin(a * 2) * 18 * age);
        petal.rotation.z = a - Math.PI / 2 + age * 0.49;
        petal.scale.set(6 * (1 - age), 14 * (1 - age), 5 * (1 - age));
        petal.material.opacity = 0.87 * (1 - age);
      });
    }
    if (rig.cyclone && (rig.cyclone.visible = active && d?.kind === 'spin')) {
      const age = clamp((frame - startup + 1) / (d.active || 4));
      rig.cyclone.rotation.y = (f.facing || 1) * tick * 0.47;
      rig.cyclone.scale.setScalar(0.64 + 0.45 * Math.sin(age * Math.PI));
    }
    if (rig.floatHalo && (rig.floatHalo.visible = f.floating || f.animPose === 'float')) {
      rig.floatWaves.forEach((ring, i) => {
        const p = phase01(tick / 32 + i * 0.5), r = 22 + 22 * p;
        ring.position.y = -p * 14;
        ring.scale.set(r, r, 0.40 * r);
        ring.material.opacity = 0.66 * Math.sin(p * Math.PI);
      });
      rig.floatStars.forEach((spark, i) => {
        const a = i * TAU / 5 + tick * 0.07;
        spark.position.set(Math.cos(a) * 33, -6 + 8 * Math.sin(a * 2), Math.sin(a) * 27);
        spark.rotation.z = a * 0.7;
      });
    }
    if (rig.star.visible = f.starTimer > 0) {
      const hue = phase01(tick * 0.015 + f.port * 0.18);
      rig.starShimmer.setHSL(hue, 0.92, 0.61);
      rig.starSparks.forEach((spark, i) => {
        const a = i * TAU / rig.starSparks.length + tick * 0.105;
        spark.position.set(Math.cos(a) * rig.w * 0.71, h * (0.52 + 0.48 * Math.sin(a * 2)), Math.sin(a) * rig.w * 0.64);
        spark.rotation.set(0, Math.sin(a) * 0.5, a * 0.57);
        spark.material.color.setHSL(phase01(hue + i * 0.17), 0.94, 0.71);
      });
    }
  }

  _updateFighter(rig, f, match, delta, showcase = null) {
    const tick = showcase?.tick ?? match.frame, h = rig.h, facing = showcase ? 1 : f.facing || 1;
    const state = showcase ? S.IDLE : f.state;
    const ground = showcase || f.grounded;
    const ledge = state === S.LEDGE_HANG;
    const special = !rig.limbs;
    const hurt = !showcase && isHurt(f);
    const sf = f.stateFrame || 0, hitlag = f.hitlag || 0;
    const specialMove = showcase ? null : specialVisual(f);
    rig.root.visible = Boolean(showcase || !fighterHidden(f, specialMove));
    if (!showcase && rig.specialSample?.tick !== tick) {
      legacySpecialEvents(f, specialMove, rig.specialSample, (e) => this._specialEvent(e, match));
      rig.specialSample = { special: specialMove, x: f.x, y: f.y, tick };
    }
    const launchSpeed = Math.hypot(f.kbVx || 0, f.kbVy || 0);
    const focus = hurt ? this.hitFocus.get(f.port) : null;
    const hit = focus && focus.frame <= tick && tick - focus.frame <= focus.hitlag + 5 ? focus : null;
    const kb = hit?.kb ?? f.lastKnockback ?? launchSpeed / LAUNCH_PER_KB;
    const recoil = hurt && (hitlag > 0 || sf <= 4);
    const bearing = hit?.angle ?? (launchSpeed ? Math.atan2(f.kbVy || 0, f.kbVx || 0) : f.launchAngle ?? (facing > 0 ? Math.PI : 0));
    const localX = Math.cos(bearing) * facing;
    if (state !== S.TUMBLE) rig.tumbleDir = 0;
    else if (!rig.tumbleDir || hitlag > 0 || rig.poseState !== state) rig.tumbleDir = Math.abs(localX) > .12 ? Math.sign(localX) : -1;
    const sc = showcase?.scale ?? (f.scale || 1);
    const shiver = this.allowFlash && hurt && hitlag > 0 ? (hitlag % 2 ? 1 : -1) * mix(4, 8.5, clamp((kb + hitlag * 5) / 182)) : 0;
    const rattle = shiver && hit?.electric ? (Math.floor(hitlag / 2) % 2 ? 1 : -1) * Math.abs(shiver) * .27 : 0;
    const x = showcase?.x ?? f.x + shiver, y = showcase?.y ?? f.y + rattle - (ledge ? h * sc * 0.87 : 0);
    rig.root.position.set(x, y, showcase?.z ?? 0);
    rig.slideUntil = this.slideUntil.get(f.port) ?? -Infinity;
    const attacking = state === S.ATTACK || state === S.THROW;
    const d = f.moveData, moveKey = f.moveKey || f.smashChargeKey;
    const activeAge = (f.moveFrame || 0) - (d?.startup || 1);
    const active = Boolean(attacking && d && !f.charging && activeAge >= 0 && activeAge < (d.active || 4));
    const tell = rig.mittTells && !showcase && (f.bossTell || (attacking && (d?.bossTell ||
      (moveKey === M.DOWN_B ? 'slam' : moveKey === M.NEUTRAL_B ? 'gun' : null))));
    // A projectile strike would otherwise inflate and flash the entire non-articulated Mitt rig.
    const strike = showcase || tell === 'gun' ? null : attackVisual(f);
    const accent = attacking || state === S.SMASH_CHARGE ? attackAccent(f, moveKey, d || f.def.moves?.[moveKey]) : null;
    const snap = active && (!rig.wasActive || moveKey !== rig.poseMove || activeAge === 0);
    const flinch = recoil ? hitlag ? 1 : 1 - ease(sf / 5) : 0;
    const launched = specialMove?.flight && ['launch', 'zip1', 'zip2'].includes(specialMove.phase);
    let target = showcase ? showcase.pose : locomotion(f, rig, tick, delta, accent, launchSpeed);
    if (tell === 'gun') {
      const kick = active && activeAge % (d?.shotInterval || Infinity) < 3 ? 0.17 : 0;
      target = { ...target, lean: -0.88 + kick, tilt: 0, yaw: 0.08, slide: -0.08, lift: -0.05 };
    } else if (tell === 'slam' && activeAge >= (d?.active || 1)) {
      const low = 1 - ease((activeAge - (d?.active || 1)) / Math.max(1, (d?.endlag || 15) - 3));
      target = { ...target, lift: -0.27 * low, lean: 0.52 * low, slide: 0 };
    } else if (['slam', 'slap', 'sweep', 'drill', 'clap'].includes(tell)) {
      const windup = ease(1 + activeAge / Math.max(1, d.startup));
      const settle = activeAge < d.active ? 1 : 1 - ease((activeAge - d.active) / Math.max(1, d.endlag));
      const power = activeAge < 0 ? windup : settle;
      const lean = {
        slam: activeAge < 0 ? -.56 : .29, slap: activeAge < 0 ? .57 : -1.21, sweep: activeAge < 0 ? .44 : -.81,
        drill: activeAge < 0 ? 1.55 : Math.PI * .91, clap: activeAge < 0 ? -.34 : .40,
      }[tell];
      target = { ...target, lean: lean * power, yaw: tell === 'sweep' ? .51 * power : 0,
        spin: tell === 'drill' && active && this.allowFlash ? activeAge * .57 : 0,
        lift: (tell === 'slam' ? .41 : tell === 'drill' ? .17 : .02) * (activeAge < 0 ? windup : 0), slide: 0 };
    }
    if (specialMove?.phase === 'charge' && d?.kind !== 'chargePunch') {
      target = pose({ lift: .04 + Math.sin(tick * .54) * .075 + specialMove.charge * .08, lean: .37,
        arm: -.91, elbow: 1.42, off: .66, offElbow: 1.33, leg: 1.08, offLeg: .85, knee: -1.33, offKnee: -1.20, yaw: .48 });
    } else if (launched) {
      target = pose({ arm: 2.93, elbow: .12, off: -.62, offElbow: .19, head: -.12,
        leg: .22, knee: -.36, offLeg: -.33, offKnee: -.22, spread: .16, slide: .07 });
    }
    if (flinch) {
      const arch = Math.abs(localX) > .20 ? -Math.sign(localX) : 1;
      const force = mix(.76, 1, clamp(kb / 145));
      const yank = pose({ lean: arch * .80 * force, tilt: .30, yaw: arch * .33, head: arch * .56,
        slide: localX * .12, lift: -.08, arm: -.57, off: 2.18, elbow: .42, offElbow: .30, spread: 1.05,
        leg: -.44, offLeg: .58, knee: -.87, offKnee: -.50, roll: -localX * .23 });
      blendPose(target, yank, flinch, target);
    }
    const gain = snap ? 1 : 1 - Math.exp(-delta * (recoil ? 2.6 : attacking || hurt ? 1.08 : 0.39));
    // Root resets and GLB upgrades initialize directly at the current simulation pose.
    const a = rig.initialized ? gain : 1;
    rig.initialized = true;
    const directed = tell === 'gun' || strike && !strike.radial && !launched;
    const stanceYaw = directed ? .20 : STANCE;
    const desiredYaw = showcase?.yaw ?? (facing > 0 ? -stanceYaw : -Math.PI + stanceYaw);
    rig.yaw += angleDelta(rig.yaw, desiredYaw) * (!rig.poseState || snap && directed ? 1 : showcase ? a : 1 - Math.exp(-delta * 0.52));
    const p = rig.pose;
    const frozenAttack = hitlag > 0 && attacking && rig.poseState === state && rig.poseMove === moveKey && rig.poseMoveFrame === f.moveFrame;
    if (!frozenAttack) for (const k of poseChannels) {
      if (k === 'spin' || k === 'roll') p[k] += angleDelta(p[k], target[k]) * a;
      else p[k] = mix(p[k], target[k], a);
    }
    rig.poseState = state;
    rig.poseMove = moveKey;
    rig.poseMoveFrame = f.moveFrame;
    rig.wasActive = active;
    rig.tumble.rotation.z = launched && !hurt ? specialMove.angle - Math.PI / 2 : p.roll * facing;
    rig.turn.rotation.y = rig.yaw + p.spin;
    const squash = special && f.def.id === 'sagging-bag' && hurt ? Math.sin(tick * 0.48) * 0.10 : 0;
    const invuln = !showcase && f.invulnFrames > 0 && !f.starTimer;
    rig.turn.position.z = this.allowFlash && invuln && tick % 6 < 3 ? -3 : 0;
    rig.root.scale.setScalar(sc);
    const pulse = recoil ? hitlag ? 1 : RECOIL_POP[clamp(sf, 0, 4)] : 0;
    const stretch = pulse * mix(.28, .44, clamp(kb / 145));
    // Cancel the impact rotation after scaling, so diagonal launches also compress across their axis.
    rig.impactAxis.rotation.z = stretch ? bearing : 0;
    rig.impactRest.rotation.z = -rig.impactAxis.rotation.z;
    rig.impactAxis.scale.set(1 + stretch, 1 - stretch * .68, 1 - stretch * .15);
    const scaleX = mix(showcase ? 1 : f.squashX || 1, 1, flinch);
    const scaleY = mix(showcase ? 1 : f.squashY || 1, 1, flinch);
    rig.turn.scale.set(scaleX * (1 + squash), scaleY * (1 - squash * .68), 1);
    let lift = p.lift * h;
    if (f.def.id === 'master-mitt') lift = Math.sin(tick * 0.10) * 6 + 10 + lift * 0.60;
    if (launched && !hurt) {
      rig.root.position.x += Math.cos(specialMove.angle) * p.slide * h * sc;
      rig.root.position.y += Math.sin(specialMove.angle) * p.slide * h * sc;
    } else if (!showcase) rig.root.position.x += facing * p.slide * h * sc;
    rig.pelvis.position.set(showcase ? p.slide * h : 0, rig.pelvisHeight + lift, 0);
    // Keep both mirrored stances pointing into the hit after the windup twist.
    const torsoYaw = directed ? clamp(p.yaw * .75, -.51, .93) : p.yaw;
    rig.torso.rotation.set(p.tilt, torsoYaw * facing, p.lean);
    if (rig.head) {
      rig.head.rotation.z = p.head;
      rig.head.rotation.y = -torsoYaw * facing * 0.48 - facing * 0.17;
    }
    const drag = 1 - Math.exp(-delta * 0.19);
    rig.air = mix(rig.air, showcase ? Math.sin(tick * 0.13) * 0.12 : clamp((f.vx || 0) * facing / 14, -1, 1), drag);
    rig.fall = mix(rig.fall, showcase ? 0 : clamp(-(f.vy || 0) / 14, -1, 1), drag);
    const flutter = tick + f.port * 13;
    if (rig.cloth && rig.clothTick !== tick) {
      this._waveCloth(rig.cloth, flutter, rig.air, rig.fall);
      rig.clothTick = tick;
    }
    if (rig.tail) {
      rig.tail.rotation.z = -0.28 + Math.sin(flutter * 0.12) * 0.20 + rig.air * 0.46 - rig.fall * 0.36;
      rig.tail.rotation.y = Math.cos(flutter * 0.11) * 0.27 + rig.air * 0.17;
      rig.tailTip.rotation.z = -0.39 + Math.sin(flutter * 0.12 - 1.10) * 0.27 + rig.fall * 0.28;
      rig.tailTip.rotation.y = Math.cos(flutter * 0.11 - 1.4) * 0.34;
    }
    if (rig.ears) rig.ears.forEach((ear, i) => {
      ear.rotation.z = Math.sin(flutter * 0.18 + i) * 0.12 + rig.air * 0.49 - rig.fall * 0.26 - p.lean * 0.25;
    });
    if (rig.softHat) rig.softHat.rotation.z = Math.sin(flutter * 0.15 - 0.6) * 0.065 + rig.air * 0.24 - rig.fall * 0.14;
    if (rig.hair) rig.hair.forEach((lock, i) => {
      lock.rotation.z = -rig.air * 0.52 + rig.fall * 0.22 + Math.sin(flutter * 0.16 - i) * 0.13;
      lock.rotation.x = Math.cos(flutter * 0.15 + i * 1.8) * (0.10 + Math.abs(rig.air) * 0.15);
    });
    if (rig.buddy) {
      rig.buddy.position.y = Math.abs(Math.sin(tick * (Math.abs(f.vx) > 1 ? 0.25 : 0.11))) * 4;
      rig.buddy.rotation.z = p.lean * 0.76 + Math.sin(tick * 0.13) * 0.11;
    }
    const held = !showcase && f.heldItemId != null;
    const strikeZone = strike?.limb === 'grip' && rig.limbs
      ? held && moveKey === M.ITEM_SWING ? 'held' : !held && rig.hasWeapon ? 'tool' : 'grip' : strike?.limb;
    const hitPulse = this.allowFlash && hurt && hitlag > 0 ? (hit?.frame === tick || hitlag % 2 ? .53 : .19) : 0;
    const strikePulse = strike ? 1 - ease(strike.age / Math.min(6, strike.duration)) : 0;
    const [strikeRim, strikeCore, strikeSpark] = combatPaint[strike?.style || 'unarmed'];
    rig.heldFlash = this.allowFlash && strikeZone === 'held' ? .18 + .50 * strikePulse : 0;
    rig.heldFlashColor = strikeSpark;
    for (const [zone, slots] of rig.flashMaterials) for (const { flash, flashColor } of slots) {
      const limbPulse = this.allowFlash && zone === strikeZone && strike ? .18 + .50 * strikePulse : 0;
      flash.value = Math.max(hitPulse, limbPulse);
      if (flash.value) flashColor.value.set(hitPulse ? hit?.electric ? '#b7f8ff' : '#ffffff' : strikeSpark);
    }
    const limbScale = !strike ? 1 : strikeZone === 'tool' ? mix(1, 1.12, strikePulse)
      : mix(1.14, accent || strikeZone === 'held' ? 1.56 : 1.40, strikePulse);
    for (const [zone, node] of Object.entries(rig.strikeNodes)) node.scale.setScalar(zone === strikeZone ? limbScale : 1);
    if (rig.limbs) {
      const [right, left] = rig.limbs;
      right.shoulder.rotation.x = -p.spread;
      left.shoulder.rotation.x = p.spread * 0.92;
      right.arm.rotation.z = p.arm;
      left.arm.rotation.z = p.off;
      right.fore.rotation.z = p.elbow;
      left.fore.rotation.z = p.offElbow;
      right.leg.rotation.z = p.leg;
      left.leg.rotation.z = p.offLeg;
      right.shin.rotation.z = p.knee;
      left.shin.rotation.z = p.offKnee;
      right.foot.rotation.z = -(p.leg + p.knee) * (ground ? 0.67 : 0.26);
      left.foot.rotation.z = -(p.offLeg + p.offKnee) * (ground ? 0.67 : 0.26);
      const tool = p.tool - Math.PI / 2;
      rig.tool.rotation.z = tool;
      rig.heldSocket.rotation.z = tool + 0.16;
      rig.tool.visible = !held;
    }
    const expression = showcase?.expression ?? (recoil ? 'impact' : f.sleepTimer > 0 ? 'blink' : hurt ? 'hurt' : state === S.TAUNT || f.animPose === 'victory' ? 'taunt'
      : attacking || state === S.SMASH_CHARGE ? 'attack' : state === S.IDLE && blinkAt(tick, f.port) ? 'blink' : 'normal');
    if (rig.face && expression !== rig.expression) {
      rig.expression = expression;
      rig.face.material.map = getFaceTexture(f.def, rig.pal, expression, this.T, this);
      if (rig.face.material.emissiveMap) rig.face.material.emissiveMap = rig.face.material.map;
    }
    if (rig.muzzleGrin) rig.muzzleGrin.visible = expression === 'victory';
    if (showcase) return;
    this._updateCombatRig(rig, f, tick, strike, strikeZone, strikePulse, [strikeRim, strikeCore, strikeSpark], specialMove);
    if (rig.shield.visible = state === S.SHIELD || state === S.SHIELD_STUN) {
      const bubble = clamp((f.shieldHp ?? 60) / MELEE.SHIELD_MAX);
      const light = f.lightShielding === true;
      const r = (f.def.stats.shieldRadius || 43) * (0.35 + 0.65 * bubble) * (f.shieldScale ?? (light ? 1.34 : 1));
      const beat = (state === S.SHIELD_STUN ? 1.10 : 1) + Math.sin(tick * 0.27) * 0.027;
      rig.shield.scale.set(r * beat, r * beat * 1.02, r * beat);
      rig.shield.rotation.y = tick * (light ? 0.024 : 0.006);
      const u = rig.shield.material.uniforms;
      u.clock.value = tick / 60;
      const tired = 1 - bubble;
      rig.shieldInk.copy(light ? rig.pastelShield : rig.shieldColor).lerp(rig.shieldWarn, tired * (light ? 0.25 : 0.82));
      u.paint.value.copy(rig.shieldInk);
      u.alpha.value = light ? 0.47 : state === S.SHIELD_STUN ? 1.0 : 0.78 + tired * 0.19;
      u.pattern.value = light ? 0 : 1;
      u.power.value = (light ? 3.2 : 1.8) + tired * 1.6;
      rig.lightShieldBand.visible = light;
      rig.lightShieldBand.rotation.set(0.48 + Math.sin(tick * 0.07) * 0.46, tick * 0.039, 0.26);
    }
    if (rig.shine.visible = Boolean(active && d.kind === 'reflector')) {
      rig.shine.rotation.z = tick * 0.19;
      rig.shine.rotation.y = Math.sin(tick * 0.11) * 0.35;
      rig.shine.scale.setScalar(0.94 + 0.13 * Math.cos(tick * 0.43));
      rig.shineSparks.rotation.z = -tick * 0.31;
    }
    if (rig.charge.visible = state === S.SMASH_CHARGE || (f.charging === true && !rig.orb && !rig.fistSteam)) {
      for (let i = 0; i < 3; i++) {
        const phase = ((tick + i * 8) % 24) / 24;
        const ring = rig.chargeRings[i];
        ring.position.y = h * (0.14 + phase * 0.95);
        ring.scale.setScalar(h * (0.29 + Math.sin(phase * Math.PI) * 0.25));
        ring.rotation.y = Math.sin(tick * 0.094 + i) * 0.26;
      }
    }
    rig.respawn.visible = state === S.RESPAWN;
    this._updateContact(rig, f, match);
    if (rig.mittTells) this._updateMittTells(rig, f, tick, tell, d, activeAge);
    this._updateSignature(rig, f, tick, delta, attacking, active);
    const item = held ? match.items?.find((item) => item.id === f.heldItemId) : null;
    this._updateRibbon(rig, f, tick, strike, item, strikeZone);
    if (!rig.root.visible) return;
    this._updateLaunchEffects(rig, f, tick, hit, launchSpeed, x, y + h * sc * .53);
    if (f.percent >= 100 && state !== S.RESPAWN && match.status !== 'paused') {
      const heavy = f.percent >= 150;
      const period = match.suddenDeath ? 6 : heavy ? 10 : 21;
      rig.nextSmoke ??= tick + f.port * 2;
      if (tick >= rig.nextSmoke) {
        rig.nextSmoke = tick + period;
        rig.torso.getWorldPosition(this.viewPoint);
        const plume = phase01(tick * 0.618 + f.port * 0.371);
        this._particle('damageSmoke', this.viewPoint.x + h * sc * (plume - 0.5) * 0.2,
          this.viewPoint.y + h * sc * 0.20, -h * sc * 0.22, 0xffffff,
          h * sc * (heavy ? 0.35 : 0.25), 31 + plume * 12, -0.17 * (f.vx || 0) + (plume - 0.5) * 1.3,
          match.suddenDeath ? 2.8 : heavy ? 2.2 : 1.55, 0, tick, { swirl: plume, heavy });
      }
    } else if (f.percent < 100) rig.nextSmoke = null;
  }

  _updateCombatRig(rig, f, tick, strike, zone, pulse, paint, special) {
    const { root } = rig, sc = root.scale.x;
    const [rim, core, spark] = paint;
    rig.swingArc.visible = root.visible && Boolean(strike?.melee);
    if (rig.swingArc.visible) {
      const reach = strike.reach * (.97 + .15 * Math.min(1, strike.age / 3));
      const shift = strike.radial ? 0 : reach * .36;
      const phase = strike.age / Math.max(1, strike.duration);
      const kick = rig.archetype === 'spacie' && [M.FAIR, M.FTILT, M.BAIR].includes(f.moveKey);
      rig.swingArc.position.set((strike.x - Math.cos(strike.angle) * shift - root.position.x) / sc,
        (strike.y - Math.sin(strike.angle) * shift - root.position.y) / sc, 26 / sc);
      rig.swingArc.scale.set(reach / sc, reach / sc * (kick ? .34 : 1), reach / sc);
      rig.swingArc.rotation.set(.20, -.23, strike.angle + (strike.radial ? tick * .26 : (phase - .36) * (kick ? .28 : .72)), 'ZYX');
      rig.swingRim.geometry = this._unit(strike.radial ? 'sweepRim' : 'swingRim');
      rig.swingCore.geometry = this._unit(strike.radial ? 'sweepCore' : 'swingCore');
      rig.swingRim.material.color.set(rim);
      rig.swingCore.material.color.set(core);
      rig.swingRim.material.opacity = 1 - phase * .39;
      rig.swingCore.material.opacity = .98 - phase * .51;
    }
    rig.strikeGlow.visible = root.visible && Boolean(strike && rig.strikeNodes[zone]);
    if (rig.strikeGlow.visible) {
      const node = zone === 'tool' ? rig.trailTip : rig.strikeNodes[zone];
      const v = this.viewPoint;
      if (zone === 'held') node.localToWorld(v.set(32, 0, 0));
      else node.getWorldPosition(v);
      rig.strikeGlow.position.copy(root.worldToLocal(v));
      rig.strikeGlow.position.z += 9 / sc;
      rig.strikeGlow.scale.setScalar((19 + pulse * 20) / sc);
      rig.strikeGlow.material.color.set(spark);
      rig.strikeGlow.material.opacity = .34 + pulse * .52;
    }
    rig.specialEnergy.visible = root.visible && special?.phase === 'charge' && f.moveData?.kind !== 'chargePunch';
    rig.comet.visible = root.visible && Boolean(special?.flight && !special.illusion && ['launch', 'zip1', 'zip2'].includes(special.phase));
    if (!rig.specialEnergy.visible && !rig.comet.visible) return;
    const [outer, white, hot] = combatPaint[special.style];
    const cy = (f.y - root.position.y) / sc + rig.h * .53;
    if (rig.specialEnergy.visible) {
      const radius = 57 + special.charge * 41, roll = tick * .29;
      rig.specialEnergy.position.set((f.x - root.position.x) / sc, cy, 0);
      rig.specialGlow.position.z = -rig.w * .53;
      rig.specialGlow.material.color.set(outer);
      rig.specialGlow.scale.setScalar(radius * 1.9 / sc);
      rig.specialGlow.material.opacity = .53 + special.charge * .36;
      rig.specialHalo.forEach((ring, i) => {
        ring.rotation.set(.54 + Math.sin(roll + i) * .41, (i - 1) * .57 + Math.cos(roll) * .19, roll * (i % 2 ? -1.22 : 1) + i * 2.2, 'ZYX');
        ring.position.z = (i - 1) * 10;
        ring.scale.setScalar(radius * (.81 + i * .105) / sc);
        ring.material.color.set(i === 1 ? hot : outer);
        ring.material.opacity = .67 + special.charge * .21;
      });
      rig.specialAim.rotation.z = special.angle;
      rig.specialAim.position.z = 21 / sc;
      rig.specialAim.scale.setScalar((radius + 14) / sc);
      rig.specialAim.material.color.set(white);
      rig.specialEmbers.forEach((mesh, i) => {
        const k = phase01(tick * .09 + i / 10), a = roll + i * 2.399;
        const r = radius * (.57 + .28 * k) / sc;
        mesh.position.set(Math.cos(a) * r, Math.sin(a) * r + k * 15, Math.sin(a * .77) * r * .52);
        if (special.style === 'fire') {
          mesh.geometry = this._unit('flameTongue');
          mesh.scale.setScalar((18 + k * 31) / sc);
          mesh.rotation.set(.24 * Math.sin(i), .31 * Math.cos(roll + i), a + Math.PI * .65);
        } else if (special.style === 'electric') {
          mesh.geometry = this._unit('lightning:' + (i % 3));
          mesh.scale.setScalar((30 + k * 40) / sc);
          mesh.rotation.set(.18 * Math.sin(i), 0, a + Math.PI * .45);
        } else {
          mesh.geometry = this._unit('gem');
          mesh.scale.set(3.2 + k * 3, 6 + k * 8, 3);
          mesh.rotation.set(0, 0, a + Math.PI * .45);
        }
        mesh.material.color.set(i % 3 ? hot : white);
      });
    } else {
      const r = (special.zip || special.phase.startsWith('zip') ? 83 : 110) * (1 + Math.sin(tick * 1.32) * .09) / sc;
      rig.comet.position.set(0, rig.h * .50, -28 / sc);
      rig.comet.rotation.z = special.angle;
      rig.cometOuter.scale.set(r * 1.35, r, r * .51);
      rig.cometCore.scale.set(r * .91, r * .61, r * .37);
      rig.cometOuter.material.color.set(outer);
      rig.cometCore.material.color.set(hot);
      rig.cometFlares.forEach((flare, i) => {
        const fire = special.style === 'fire';
        flare.geometry = this._unit(fire ? 'flameTongue' : special.style === 'electric' ? 'lightning:' + i : 'aimFlare');
        flare.position.set(-r * (.20 + i * .19), (fire ? (i - 1) * r * .24 : 0) + Math.sin(tick * .88 + i * 1.5) * r * .14,
          (17 + i * 4) / sc);
        flare.scale.setScalar(r * (1.09 - i * .16));
        flare.rotation.set(Math.sin(tick * .38 + i) * .43, 0, (i - 1) * (fire ? -.27 : .31));
        flare.material.color.set(i ? hot : white);
      });
      if (rig.cometTick !== tick) {
        rig.cometTick = tick;
        const cx = Math.cos(special.angle), sy = Math.sin(special.angle);
        for (let i = 0; i < 3; i++) {
          const drag = 26 + i * 16, wobble = Math.sin(tick * .88 + i * 2) * 16;
          this._particle('speedStreak', f.x - cx * drag - sy * wobble, f.y + rig.h * sc * .5 - sy * drag + cx * wobble,
            26 + i * 3, i ? hot : white, 68 + i * 20, 10 + i, -cx * (4 + i), -sy * (4 + i), 0, tick, { angle: special.angle });
        }
      }
    }
  }

  _updateLaunchEffects(rig, f, tick, hit, speed, x, cy) {
    const sample = rig.launchSample ??= {};
    if (sample.tick === tick) return;
    const flying = f.state === S.TUMBLE || f.state === S.HITSTUN;
    if (hit) rig.launchElectric = hit.electric;
    else if (!flying) rig.launchElectric = false;
    const vx = f.kbVx || 0, vy = f.kbVy || 0;
    // Wall techs emit an event, but unteched side-wall rebounds only reverse KB in physics.
    if (flying && sample.flying && !f.hitlag && !sample.hitlag && tick - sample.tick <= 3 &&
        (!hit || hit.frame <= sample.tick) && Math.abs(sample.vx) >= 8 && vx * sample.vx < 0 &&
        Math.abs(vx) <= Math.abs(sample.vx) * .5 && Math.abs(f.x - sample.x) <= Math.abs(sample.vx) * (tick - sample.tick) + 2) {
      this._bounceDust(f.port, f.x, cy, tick, Math.sign(vx));
    }
    sample.tick = tick;
    sample.x = f.x;
    sample.vx = vx;
    sample.flying = flying;
    sample.hitlag = f.hitlag;
    if (hit?.electric && f.hitlag > 0 && tick > hit.frame && tick >= (rig.nextArc ?? 0)) {
      rig.nextArc = tick + 2;
      const phase = (tick - hit.frame) * 1.91;
      const reach = rig.h * (f.scale || 1);
      for (let i = 0; i < 2; i++) {
        const a = phase + i * Math.PI;
        this._electricArc(x + Math.cos(a) * reach * .22, cy + Math.sin(a) * reach * .25, tick,
          a + 1.15, reach * (.50 + i * .13), (tick + i) % 3);
      }
    }
    if (f.grounded || f.hitlag || !flying || (f.state === S.TUMBLE ? speed < 4 : speed < 12)) {
      rig.nextLaunchPuff = null;
      return;
    }
    if (tick < (rig.nextLaunchPuff ?? 0)) return;
    rig.nextLaunchPuff = tick + (speed > 23 ? 2 : speed >= 12 ? 3 : 5);
    const a = Math.atan2(vy, vx), nx = vx / speed, ny = vy / speed;
    const wobble = (phase01(tick * .618 + f.port * .37) - .5) * 19;
    const px = x - nx * 22 - ny * wobble, py = cy - ny * 22 + nx * wobble;
    this._particle('launchPuff', px, py, -12, 0xffffff, clamp(speed * .80 + 17, 23, 60), 27,
      -nx * 1.35, .62 - ny * 1.35, 0, tick, { angle: a, swirl: wobble * .10 });
    if (speed >= 12) for (let i = -1; i <= 1; i++) {
      const electric = rig.launchElectric;
      const color = i ? electric ? '#42dfff' : '#ff783a' : electric ? '#eaffff' : '#fff0a9';
      this._particle('speedStreak', px - nx * 24 - i * ny * 11, py - ny * 24 + i * nx * 11, 5 + Math.abs(i) * 9, color,
        clamp(speed * (i ? 2.0 : 2.9), 38, 124), 13, -nx * 2.5, -ny * 2.5, 0, tick, { angle: a + i * .09 });
    }
  }

  _updateRibbon(rig, f, tick, strike, item, zone) {
    const ribbon = rig.ribbon;
    if (rig.ribbonFrame === tick) return;
    rig.ribbonFrame = tick;
    const a = rig.history;
    const prop = f.def.rig?.prop, itemKey = item?.def?.id || item?.itemId;
    const sword = blades.has(prop) || rig.archetype === 'sword', limb = zone || attackLimb(f);
    const active = Boolean(strike?.melee);
    const weapon = zone === 'held' || zone === 'tool' || !strike && (itemKey ? f.moveKey === M.ITEM_SWING : sword && limb === 'grip');
    const startup = f.moveData?.startup || 1;
    const sweeping = rig.root.visible && (active || ((f.state === S.ATTACK || f.state === S.THROW) && !f.charging &&
      f.moveFrame >= Math.max(0, startup - 2) && f.moveFrame < startup));
    const attackId = sweeping ? f.moveKey + ':' + itemKey : null;
    if (sweeping && rig.lastAttack !== attackId) while (a.length) rig.trailVectors.push(a.pop().pair);
    rig.lastAttack = attackId;
    if (sweeping && rig.limbs) {
      rig.root.updateWorldMatrix(true, true);
      const node = weapon ? null : rig.strikeNodes[limb];
      while (a.length >= TRAIL_HISTORY) rig.trailVectors.push(a.pop().pair);
      const pair = rig.trailVectors.pop();
      const [inner, outer] = pair;
      if (node) {
        node.localToWorld(outer.set(rig.w * .37, -4, 4));
        node.localToWorld(inner.set(-rig.w * .24, 8, 3));
      } else if (itemKey && f.moveKey === M.ITEM_SWING) {
        rig.heldSocket.localToWorld(inner.set(itemKey === 'glow_saber' ? 24 : 13, 0, 1));
        rig.heldSocket.localToWorld(outer.set(itemKey === 'glow_saber' ? 58 : itemKey === 'plunger_bat' ? 51 : 38, 0, 1));
      } else {
        rig.trailBase.getWorldPosition(inner);
        rig.trailTip.getWorldPosition(outer);
        if (!rig.hasWeapon) {
          inner.y += 7;
          outer.y -= 6;
        }
      }
      if (weapon) { inner.y += 8; outer.y -= 8; }
      a.unshift({ tick, pair });
      rig.trailStyle = itemKey === 'plunger_bat' || (!itemKey && prop === 'bat') ? 'rainbow' : strike?.style || (sword ? 'blade' : 'unarmed');
    }
    while (a.length && tick - a.at(-1).tick >= TRAIL_HISTORY) rig.trailVectors.push(a.pop().pair);
    ribbon.visible = a.length >= 2;
    if (!ribbon.visible) return;
    const { position, color } = ribbon.geometry.attributes;
    const { x, y, z } = rig.root.position, s = rig.root.scale.x, rows = (a.length - 1) * TRAIL_SUBSTEPS + 1;
    const base = rig.trailColor, edge = rig.trailEdge;
    const [rim, core] = combatPaint[rig.trailStyle] || combatPaint.unarmed;
    base.set(rim); edge.set(core);
    for (let row = 0; row < rows; row++) {
      const i = Math.floor(row / TRAIL_SUBSTEPS), mid = (row % TRAIL_SUBSTEPS) / TRAIL_SUBSTEPS;
      const age = tick - (mid ? mix(a[i].tick, a[i+1].tick, mid) : a[i].tick);
      if (rig.trailStyle === 'rainbow') { base.setHSL(phase01(row * 0.078 + tick * 0.017), 0.95, 0.59); edge.set('#ffe87a'); }
      for (let side = 0; side < 2; side++) {
        const b = a[i].pair[side], j = row * 2 + side;
        if (mid) {
          const prev = a[Math.max(0, i-1)].pair[side], c = a[i+1].pair[side], next = a[Math.min(a.length-1, i+2)].pair[side];
          position.setXYZ(j, (catmull(prev.x,b.x,c.x,next.x,mid)-x)/s, (catmull(prev.y,b.y,c.y,next.y,mid)-y)/s,
            (catmull(prev.z,b.z,c.z,next.z,mid)-z)/s);
        } else position.setXYZ(j, (b.x-x)/s, (b.y-y)/s, (b.z-z)/s);
        const paint = side ? edge : base;
        color.setXYZW(j, paint.r, paint.g, paint.b, clamp(1 - age / TRAIL_HISTORY) ** 1.6 * (side ? 1 : .43));
      }
    }
    position.needsUpdate = true;
    color.needsUpdate = true;
    ribbon.geometry.setDrawRange(0, (rows - 1) * 6);
    ribbon.material.opacity = active ? .97 : .81;
  }

  _syncMap(map, entities, make, update, matches) {
    const seen = new Set();
    for (const entity of entities || []) {
      // Keep stable IDs across snapshot replacement, but never alias two live entities.
      let key = entity.id ?? entity;
      if (seen.has(key)) key = entity;
      if (seen.has(key)) key = Symbol();
      seen.add(key);
      let mesh = map.get(key);
      if (!mesh || (matches && !matches(mesh, entity))) {
        if (mesh) this._remove(mesh);
        mesh = make.call(this, entity);
        map.set(key, mesh);
      }
      update(mesh, entity);
    }
    for (const [key, mesh] of map) if (!seen.has(key)) {
      this._remove(mesh);
      map.delete(key);
    }
  }

  _buildItem(item) {
    const T = this.T, def = item.def || {}, color = def.color || '#a6f6ff', r = def.radius || 13;
    const root = this._bone(this.battleGroup, def.mesh || 'item');
    const tilt = this._bone(root, 'item pose');
    const loaded = this._model('items', def.mesh);
    const long = ['Item_PlungerBat', 'Item_GlowSaber', 'Item_Mallet'].includes(def.mesh);
    let grip = 0;
    if (loaded) {
      const scale = clamp(r * (long ? 0.88 : 1.16), 9, 29);
      loaded.scale.setScalar(scale);
      // Tool meshes stand along +Y. Align the middle of the handle with the
      // grip when rotated into the hand, instead of gripping the blade.
      grip = long ? scale * ({ Item_PlungerBat: -0.79, Item_GlowSaber: -0.80, Item_Mallet: -0.85 }[def.mesh]) : 0;
      tilt.add(loaded);
    } else {
      const casing = this._mat(color, { metalness: 0.19, emissive: color, emissiveIntensity: 0.14 });
      this._shape(tilt, long ? 'rod' : 'gem', casing, 0, 0, 0, r * (long ? 0.32 : 1), r * (long ? 2.2 : 1), r);
      if (long) this._shape(tilt, 'ball', casing, 0, r, 0, r * 0.55, r * 0.52, r * 0.51);
    }
    const haloMat = this._basic(color, { transparent: true, opacity: 0.48, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
    const ring = this._shape(root, 'ring', haloMat, 0, 0, 0, r * 1.46, r * 1.46, r * 0.64, false);
    ring.rotation.x = Math.PI / 2;
    const bomb = def.mesh === 'Item_AlarmOmb' || def.id === 'alarm_omb';
    const fuseSlots = bomb ? new Map() : null;
    if (fuseSlots) tilt.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const own = (material) => {
        if (!material.isMeshStandardMaterial || material.transparent) return material;
        if (!fuseSlots.has(material)) {
          const m = this.ownedMaterials.has(material) ? material : material.clone();
          this.ownedMaterials.add(m);
          fuseSlots.set(material, { m, color: m.emissive.clone(), intensity: m.emissiveIntensity });
        }
        return fuseSlots.get(material).m;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
    });
    return { root, tilt, ring, long, r, grip, fuseSlots, bounds: new T.Box3().setFromObject(tilt), rotatedBounds: new T.Box3() };
  }

  _syncItems(match, rigsByPort) {
    this._syncMap(this.itemMeshes, match.items, this._buildItem, (it, data) => {
      const holder = rigsByPort.get(data.holderPort);
      const socket = holder?.heldSocket;
      it.root.visible = holder?.root.visible !== false;
      if (holder?.heldFlash && !it.flashSlots) {
        it.flashSlots = [];
        const materials = new Map();
        it.tilt.traverse((mesh) => {
          if (!mesh.isMesh) return;
          const flash = (m) => {
            if (!m.isMeshStandardMaterial || m.transparent) return m;
            if (!materials.has(m)) {
              const owned = this.ownedMaterials.has(m) ? m : m.clone();
              this.ownedMaterials.add(owned);
              addFighterRim(owned);
              materials.set(m, owned);
              it.flashSlots.push(owned.userData.combatFlash);
            }
            return materials.get(m);
          };
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(flash) : flash(mesh.material);
        });
      }
      for (const { flash, flashColor } of it.flashSlots || []) {
        flash.value = holder?.heldFlash || 0;
        if (flash.value) flashColor.value.set(holder.heldFlashColor);
      }
      it.ring.visible = data.holderPort == null && !!data.grounded;
      let pulse = 0, urgency = 0;
      if (it.fuseSlots) {
        const flashing = data.fuse > 0 && data.fuse < 120;
        if (flashing) {
          urgency = 1 - data.fuse / 120;
          // Integrate the changing rate rather than multiplying a global clock by it.
          pulse = (0.5 + 0.5 * Math.cos((0.22 + 0.70 * urgency) * (120 - data.fuse))) ** 1.45;
          const heat = (pulse + 0.35) * (0.85 + 2.15 * urgency);
          for (const { m, color, intensity } of it.fuseSlots.values()) {
            m.emissive.setRGB(1, 0.012 + 0.245 * pulse, 0.002).lerp(color, 0.13);
            m.emissiveIntensity = intensity + heat;
          }
        } else if (it.fuseFlashing) {
          for (const { m, color, intensity } of it.fuseSlots.values()) {
            m.emissive.copy(color);
            m.emissiveIntensity = intensity;
          }
        }
        it.fuseFlashing = flashing;
        it.tilt.scale.setScalar(1 + pulse * (0.08 + 0.14 * urgency));
      }
      if (socket) {
        socket.updateWorldMatrix(true, false);
        socket.matrixWorld.decompose(it.root.position, it.root.quaternion, it.root.scale);
        it.tilt.position.set(it.long ? 1 - (it.grip || -10) : 4, 0, 0);
        it.tilt.rotation.set(0, 0, it.long ? -Math.PI * 0.5 : data.def?.mesh === 'Item_RayGun' ? 0.10 : -0.25);
      } else {
        it.root.position.set(data.x, data.y, 9);
        it.root.rotation.set(0, 0, 0);
        it.root.scale.setScalar(1);
        const bob = data.grounded ? 4 + Math.sin(match.frame * 0.12 + data.x) * 3.2 : 0;
        it.tilt.rotation.set(data.grounded ? 0.14 : 0, data.grounded ? match.frame * 0.045 : 0,
          (data.rot || 0) + (it.long ? data.grounded ? 0.53 : -0.42 : 0));
        it.tilt.position.set(0, 0, 0);
        it.tilt.updateMatrix();
        const bottom = it.rotatedBounds.copy(it.bounds).applyMatrix4(it.tilt.matrix).min.y;
        it.tilt.position.y = -bottom + bob;
      }
      it.ring.position.y = 2;
      it.ring.material.opacity = it.fuseFlashing ? 0.36 + pulse * 0.60 : 0.42 + Math.sin(match.frame * 0.14) * 0.13;
    });
  }

  _buildProjectile(p) {
    const T = this.T, root = this._bone(this.battleGroup, p.style || 'Projectile');
    const palette = { laser: '#63f4ff', shadowOrb: '#bb67ff', bolt: '#fff183', needle: '#ffd3ec',
      fireball: '#ff8e31', ice: '#a4edff', pill: '#ff70a7', charge: '#6be7ff', chargeShot: '#6be7ff', chargeOrb: '#6be7ff',
      boomerang: '#fab94b', arrow: '#d3fa86', pancake: '#d69659', egg: '#b0fc9a', missile: '#ffa35c' };
    const col = palette[p.style] || '#fca354', r = p.radius || 9;
    const luminous = this._basic(col, { toneMapped: false });
    const shine = this._basic('#fffbe5', { toneMapped: false });
    const glow = this._basic(col, { transparent: true, opacity: 0.37, depthWrite: false, blending: T.AdditiveBlending });
    const elongated = /laser|needle|missile|arrow|bolt/i.test(p.style || '');
    if (elongated) {
      this._shape(root, 'ball', luminous, 0, 0, 0, r * 2.1, r * 0.49, r * 0.49, false);
      this._shape(root, 'smallBall', shine, r * 0.8, 0, 0, r * 0.86, r * 0.24, r * 0.25, false);
      this._shape(root, 'smallBall', glow, -r * 1.4, 0, 0, r * 2.8, r * 0.72, r * 0.65, false);
    } else if (['boomerang', 'pancake'].includes(p.style)) {
      this._shape(root, 'hex', this._mat(col), 0, 0, 0, r * 1.35, r * 0.35, r * 1.1);
      this._shape(root, 'smallBall', shine, 2, 2, 1, r * 0.61, r * 0.30, r * 0.55, false);
    } else {
      this._shape(root, 'gem', luminous, 0, 0, 0, r * 0.77, r * 0.95, r * 0.77, false);
      this._shape(root, 'smallBall', glow, 0, 0, 0, r * 1.16, r * 1.16, r * 1.16, false);
      const ring = this._shape(root, 'ring', luminous, 0, 0, 0, r * 1.23, r * 1.23, r * 0.75, false);
      ring.rotation.x = 0.65;
    }
    root.userData.elongated = elongated;
    root.userData.projectileStyle = p.style;
    root.userData.projectileRadius = r;
    return root;
  }

  _buildTarget(t) {
    const r = t.r, root = this._bone(this.battleGroup, 'Target');
    const metal = this._mat('#5a3c6c', { metalness: 0.66, roughness: 0.36 });
    const red = this._mat('#f82657', { emissive: '#ff174d', emissiveIntensity: 0.65, roughness: 0.45 });
    const white = this._mat('#fff6e5', { emissive: '#ffdcea', emissiveIntensity: 0.38 });
    const puck = (material, width, z) => {
      const part = this._shape(root, 'disk', material, 0, 0, z, width, 4, width);
      part.rotation.x = Math.PI * 0.5;
      return part;
    };
    puck(metal, r * 1.09, -3);
    puck(red, r * 0.99, 0);
    puck(white, r * 0.75, 1.1);
    puck(red, r * 0.54, 2.3);
    puck(white, r * 0.32, 3.3);
    puck(red, r * 0.16, 4.2);
    this._shape(root, 'ring', this._basic('#ffa6b4'), 0, 0, 2.7, r * 1.056, r * 1.056, r * 0.77, false);
    return root;
  }

  _buildHazard(hz) {
    const T = this.T, root = this._bone(this.battleGroup, hz.kind);
    const van = hz.kind === 'pizzaVan';
    const model = van ? this._model('stage-props', 'Hazard_PizzaVan', {
      GoldTrim: { emissive: '#ffa840', emissiveIntensity: 0.64 },
    }) : hz.kind === 'fineRocket' ? this._model('stage-props', 'Hazard_FineRocket') : null;
    if (model) {
      root.add(model);
      if (van) {
        const sx = (hz.w || 148) / 2.9, sy = (hz.h || 72) / 1.96;
        model.scale.set(sx, sy, sx * 0.84);
        model.position.y = sy * 0.77;
        const wheel = model.children[0].children.find((part) => part.material?.name === 'Steel');
        if (wheel) {
          const opposite = wheel.clone();
          opposite.scale.z *= -1;
          wheel.parent.add(opposite);
        }
        const light = this._mat('#fff0b2', { emissive: '#ffc35b', emissiveIntensity: 2.6, roughness: 0.33 });
        for (const side of [-1, 1]) {
          this._shape(model, 'smallBall', light, 1.45, -0.15, side * 0.52, 0.048, 0.10, 0.13, false);
          this._shape(model, 'ball', this._energy('#ffc563', 0.32), 1.53, -0.15, side * 0.52, 0.22, 0.15, 0.18, false);
        }
        this._shape(model, 'ball', this._energy('#ffac48', 0.23), -0.14, 0.96, 0, 0.64, 0.33, 0.45, false);
      } else {
        const scale = (hz.w || 132) / 4.2;
        model.scale.setScalar(scale);
        model.position.x = -scale * 0.1;
        const exhaust = this._bone(root, 'thruster', -scale * 1.85);
        const jet = this._shape(exhaust, 'cone', this._energy('#ff6824', 0.72), -23, 0, 0, 14, 52, 14, false);
        jet.rotation.z = Math.PI / 2;
        this._shape(exhaust, 'cone', this._energy('#fff0a0', 0.93), -11, 0, 0, 8, 27, 8, false).rotation.z = Math.PI / 2;
        root.userData.exhaust = exhaust;
      }
      return root;
    }
    if (van) {
      const orange = this._mat('#ff754a', { metalness: 0.31, roughness: 0.33 });
      const ivory = this._mat('#ffe2b1', { roughness: 0.52 });
      const rubber = this._mat('#242337', { roughness: 0.92 });
      const chrome = this._mat('#c3becd', { metalness: 0.63, roughness: 0.37 });
      const glass = this._mat('#68a2be', { metalness: 0.35, roughness: 0.23 });
      const lights = this._mat('#fff7b9', { emissive: '#fff295', emissiveIntensity: 2.2 });
      const block = (w, z, h, y, x, mat) => this._add(root,
        this._bevel([[w/2-4,z/2-4,0,7],[w/2,z/2,-4,7],[w/2,z/2,-h+3,5],[w/2-3,z/2-3,-h,5]], false), mat, x, y);
      block(142, 68, 28, 39, 0, orange);
      block(82, 66, 30, 67, -19, ivory);
      block(46, 58, 25, 61, 42, orange);
      this._shape(root, 'box', glass, 43, 51, 29, 36, 13, 2);
      this._shape(root, 'box', glass, 60, 49, 0, 3, 17, 51).rotation.z = -0.12;
      this._shape(root, 'box', orange, -20, 40, 33, 79, 7, 3);
      this._shape(root, 'box', chrome, 73, 16, 0, 6, 6, 67);
      root.userData.wheels = [];
      for (const z of [-32, 32]) for (const x of [-46, 46]) {
        const wheel = this._bone(root, 'wheel', x, 13, z);
        const tyre = this._shape(wheel, 'disk', rubber, 0, 0, 0, 13, 10, 13);
        tyre.rotation.x = Math.PI / 2;
        const hub = this._shape(wheel, 'disk', chrome, 0, 0, Math.sign(z) * 5.2, 6.0, 2, 6.0);
        hub.rotation.x = Math.PI / 2;
        this._shape(wheel, 'smallBall', orange, 3, 0, Math.sign(z) * 6.1, 1.6, 1.9, 1.5);
        root.userData.wheels.push(wheel);
      }
      for (const z of [-21, 21]) this._shape(root, 'ball', lights, 70, 30, z, 5.5, 5.8, 8, false);
      const pizza = this._shape(root, 'cone', this._mat('#f9bc59'), -18, 73, 0, 18, 18, 5);
      pizza.rotation.z = 0.16;
      for (let i = 0; i < 3; i++) this._shape(root, 'smallBall', orange, -27 + i * 8, 72 + (i % 2) * 4, 3.7, 2.6, 2.6, 1.0);
    } else if (hz.kind === 'starshipLaser') {
      const blue = this._basic('#66daff', { transparent: true, opacity: 0.48, blending: T.AdditiveBlending, depthWrite: false });
      const core = this._basic('#ebfcff', { toneMapped: false });
      this._shape(root, 'ball', blue, -23, 0, 0, hz.w * 0.64, hz.h * 0.78, hz.h * 0.59, false);
      this._shape(root, 'ball', core, 0, 0, 0, hz.w * 0.52, hz.h * 0.23, hz.h * 0.29, false);
      const head = this._shape(root, 'ring', this._basic('#8effff'), hz.w * 0.39, 0, 0, 15, 19, 14, false);
      head.rotation.y = Math.PI / 2;
      root.userData.flame = head;
    } else {
      const paint = this._mat('#fb443f', { metalness: 0.34, roughness: 0.36 });
      const white = this._mat('#ffe7c0', { roughness: 0.43 });
      const steel = this._mat('#542d46', { metalness: 0.47 });
      const flare = this._basic('#fd9239', { transparent: true, depthWrite: false, opacity: 0.78, blending: T.AdditiveBlending });
      this._shape(root, 'ball', white, 0, 0, 0, 39, 17, 16);
      const cone = this._shape(root, 'cone', paint, 36, 0, 0, 16, 31, 16);
      cone.rotation.z = -Math.PI / 2;
      const nozzle = this._shape(root, 'hex', steel, -32, 0, 0, 14, 12, 14);
      nozzle.rotation.z = Math.PI / 2;
      const vane = this._bone(root, 'rolling fins');
      for (let i = 0; i < 3; i++) {
        const holder = this._bone(vane, 'fin');
        holder.rotation.x = i * TAU / 3;
        const fin = this._shape(holder, 'cone', paint, -26, 17, 0, 13, 19, 5);
        fin.rotation.z = -0.62;
      }
      root.userData.spin = vane;
      const jet = this._shape(root, 'cone', flare, -54, 0, 0, 14, 44, 14, false);
      jet.rotation.z = Math.PI / 2;
      root.userData.flame = jet;
    }
    return root;
  }

  _buildSummon(s) {
    const T = this.T, col = s.critter?.color || '#a5a8ff';
    const root = this._bone(this.battleGroup, s.critter?.id || 'Critter');
    const actor = this._bone(root, 'Critter pose');
    const asset = this._model('items', s.critter?.mesh || SUMMONS[s.critter?.id]);
    const kind = s.critter?.id;
    let rideHeight = 24;
    if (asset) {
      asset.scale.setScalar(kind === 'laser_duck' ? 25 : 28);
      actor.add(asset);
      rideHeight = 5 - new T.Box3().setFromObject(asset).min.y;
    } else {
      const skin = this._mat(kind === 'snore_sloth' ? '#b480ad' : kind === 'tornado_pigeon' ? '#748ee5' : col,
        { roughness: 0.62, emissive: col, emissiveIntensity: 0.09 });
      const cream = this._mat('#ffe5c6');
      const dark = this._mat('#32203c');
      this._shape(actor, 'ball', skin, -5, -3, 0, kind === 'snore_sloth' ? 28 : 22, 19, 19);
      this._shape(actor, 'ball', skin, 12, 12, 0, 16, 14, 16);
      this._shape(actor, 'ball', cream, 22, 9, 0, 9, 8, 11);
      for (const side of [-1, 1]) {
        if (kind === 'tornado_pigeon') {
          const wing = this._shape(actor, 'ball', skin, -5, 2, side * 20, 25, 5, 12);
          wing.rotation.z = -0.20; wing.rotation.y = side * 0.43;
        } else {
          this._shape(actor, 'ball', cream, 10, 24, side * 12, 7, 6, 4.2);
          this._shape(actor, 'ball', skin, -1, -17, side * 14, 12, 9, 8.2);
        }
        this._shape(actor, 'smallBall', dark, 24, 14, side * 9, 3.2, 4.7, 3.2);
      }
      this._shape(actor, 'ball', dark, 30, 10, 0, 2.5, 2.9, 4);
    }
    const halo = this._shape(root, 'ring', this._basic(col, { transparent: true, opacity: 0.53, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }),
      0, 3, 0, 33, 29, 20, false);
    halo.rotation.x = Math.PI / 2;
    return { root, actor, halo, rideHeight };
  }

  _syncEntities(match, rigsByPort) {
    const t = match.frame;
    this._syncItems(match, rigsByPort);
    this._syncMap(this.projMeshes, match.projectiles, this._buildProjectile, (node, p) => {
      node.position.set(p.x, p.y, 4);
      node.rotation.set(0, node.userData.elongated ? 0 : t * 0.11,
        node.userData.elongated ? Math.atan2(p.vy || 0, p.vx ?? 1) : t * 0.14);
    }, (node, p) => node.userData.projectileStyle === p.style && node.userData.projectileRadius === (p.radius || 9));
    this._syncMap(this.targetMeshes, (match.targets || []).filter((tg) => !tg.broken), this._buildTarget, (node, tg) => {
      node.position.set(tg.x, tg.y, 0);
      node.rotation.set(Math.sin(t * 0.02) * 0.17, Math.sin(t * 0.035) * 0.35, 0);
    });
    this._syncMap(this.hazardMeshes, match.hazards, this._buildHazard, (node, hz) => {
      node.visible = !!hz.active;
      node.position.set(hz.x, hz.y + (hz.kind === 'pizzaVan' ? 0 : hz.h * 0.5), 0);
      node.rotation.y = hz.vx < 0 ? Math.PI : 0;
      if (node.userData.wheels) for (const wheel of node.userData.wheels) wheel.rotation.z = -t * 0.63;
      if (node.userData.spin) node.userData.spin.rotation.x = t * 0.42;
      if (node.userData.flame) node.userData.flame.scale.y = (hz.kind === 'fineRocket' ? 44 : 20) * (0.81 + Math.sin(t * 0.56) * 0.15);
      if (node.userData.exhaust) node.userData.exhaust.scale.set(1 + Math.sin(t * 0.59) * 0.17, 1 + Math.cos(t * 0.47) * 0.10, 1);
    });
    this._syncMap(this.summonMeshes, match.summons, this._buildSummon, (sm, s) => {
      sm.root.position.set(s.x, s.y, 6);
      const fast = Math.abs(s.vx || 0) > 1;
      const phase = t * (fast ? 0.32 : 0.17);
      sm.actor.position.y = sm.rideHeight + (s.critter?.style === 'whirlwind' ? 12 : 4) * Math.sin(phase);
      sm.actor.rotation.y = (s.facing < 0 ? -Math.PI + 0.58 : -0.58) + (s.critter?.style === 'whirlwind' ? t * 0.22 : Math.sin(phase) * 0.20);
      sm.actor.rotation.z = Math.sin(phase) * 0.12;
      sm.halo.scale.setScalar(29 + Math.sin(t * 0.14) * 3.3);
    });
  }

  _particle(kind, x, y, z, color, size, life, vx, vy, vz, frame, opts = {}) {
    const T = this.T;
    if (this.fxParticles.length >= FX_BUDGET) this._retireParticle(this.fxParticles.shift());
    const puff = kind === 'launchPuff' || kind === 'dustPuff';
    const damageSmoke = kind === 'damageSmoke', smoke = kind === 'smoke' || damageSmoke || puff;
    const bolt = kind === 'lightning';
    const blending = smoke || opts.solid ? T.NormalBlending : T.AdditiveBlending;
    const type = damageSmoke || puff ? 'plane' : kind === 'ring' || kind === 'shockwave' || kind === 'impactStar' ? kind
      : kind === 'flame' ? 'flameTongue' : kind === 'slash' ? 'swingRim'
      : bolt ? 'lightning:' + opts.variant : kind === 'beam' ? 'cone' : smoke || kind === 'core' ? 'smallBall' : 'gem';
    let effect = this.combatFxPool.get(kind)?.pop();
    if (effect) {
      this.fxGroup.add(effect.mesh);
      effect.mesh.geometry = this._unit(type);
      effect.mesh.material.color.set(color);
      effect.mesh.material.opacity = 1;
      effect.mesh.material.blending = blending;
      effect.mesh.position.set(x, y, z);
      effect.mesh.rotation.set(0, 0, 0);
      effect.mesh.scale.setScalar(size);
    } else {
      const mat = this._basic(color, { transparent: true, opacity: 1, depthWrite: false,
        toneMapped: false, fog: smoke, blending,
        ...(puff ? { map: getImpactPuffTexture(kind, T, this) } : damageSmoke ? { map: getDamageSmokeTexture(T, this) } : {}),
        ...(bolt ? { vertexColors: true } : {}),
        ...(bolt || kind === 'ring' || kind === 'shockwave' || kind === 'beam' || kind === 'flame' || kind === 'slash' ? { side: T.DoubleSide } : {}) });
      const mesh = this._shape(this.fxGroup, type, mat, x, y, z, size, size, size, false);
      mesh.name = kind;
      effect = { mesh, kind };
    }
    Object.assign(effect, { x, y, z, vx, vy, vz, size, life, born: frame }, opts);
    const { mesh } = effect;
    if (kind === 'spark') mesh.rotation.z = Math.atan2(vy, vx);
    if (kind === 'flame' || kind === 'slash') mesh.rotation.set(opts.tilt || 0, opts.yaw || 0, opts.angle || 0);
    if (kind === 'impactStar' || bolt || kind === 'shockwave') mesh.rotation.set(opts.tilt || 0, opts.yaw || 0, opts.angle, 'ZYX');
    if (kind === 'impactSpark' || kind === 'speedStreak') mesh.rotation.z = opts.angle;
    if (kind === 'ring') mesh.rotation.set(opts.tilt || 0, opts.yaw || 0, opts.roll || 0);
    if (kind === 'beam') {
      mesh.rotation.z = opts.angle;
      const len = opts.length;
      mesh.position.x = x - Math.sin(opts.angle) * len * 0.37;
      mesh.position.y = y + Math.cos(opts.angle) * len * 0.37;
    }
    this.fxParticles.push(effect);
    return effect;
  }

  _retireParticle(p) {
    const limit = combatFxPoolLimits[p.kind];
    if (!limit) return this._discardParticle(p);
    let pool = this.combatFxPool.get(p.kind);
    if (!pool) this.combatFxPool.set(p.kind, pool = []);
    if (pool.length >= limit) this._remove(p.mesh);
    else {
      p.mesh.removeFromParent();
      pool.push(p);
    }
  }

  _discardParticle(p) {
    if (p.kind !== 'ghost') return this._remove(p.mesh);
    // Ghosts borrow the current costume geometry. Never dispose it with the echo.
    p.mesh.removeFromParent();
    p.material.dispose();
  }

  _recordCombatEffect(effect) {
    if (this.fxParticles.length >= FX_BUDGET) this._retireParticle(this.fxParticles.shift());
    this.fxParticles.push(effect);
  }

  _zipBeam(p, tick) {
    if (![p.fromX, p.fromY, p.toX, p.toY].every(Number.isFinite)) return;
    if (Math.hypot(p.toX - p.fromX, p.toY - p.fromY) < .01) return;
    const T = this.T, points = zipPoints(p.fromX, p.fromY, p.toX, p.toY);
    const mesh = this._bone(this.fxGroup, 'Quick-Zip lightning');
    const materials = [];
    for (const [width, color, z, alpha] of [[11, p.rim, 26, .90], [5, p.spark, 30, .99], [2, p.core, 33, 1]]) {
      const geo = new T.BufferGeometry(), vertices = [], indices = [];
      const strip = (path, thickness) => {
        const base = vertices.length / 3;
        path.forEach(([x, y], i) => {
          const prev = path[Math.max(0, i - 1)], next = path[Math.min(path.length - 1, i + 1)];
          const a = Math.atan2(next[1] - prev[1], next[0] - prev[0]);
          const w = i && i < path.length - 1 ? thickness : thickness * .3;
          vertices.push(x - Math.sin(a) * w, y + Math.cos(a) * w, z, x + Math.sin(a) * w, y - Math.cos(a) * w, z);
          if (i) { const j = base + i * 2; indices.push(j-2, j-1, j, j, j-1, j+1); }
        });
      };
      strip(points, width);
      const [x, y] = points[3], a = Math.atan2(p.toY - p.fromY, p.toX - p.fromX);
      strip([[x, y], [x + Math.cos(a + .95) * 22, y + Math.sin(a + .95) * 22],
        [x + Math.cos(a + .56) * 48, y + Math.sin(a + .56) * 48]], width * .58);
      geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      geo.setIndex(indices);
      const material = this._energy(color, alpha, { side: T.DoubleSide, blending: T.NormalBlending });
      this._add(mesh, geo, material, 0, 0, 0, false);
      materials.push({ material, alpha });
    }
    this._recordCombatEffect({ mesh, materials, kind: 'zipBeam', life: 12, born: tick });
    for (const [x, y] of [points[0], points.at(-1)]) this._particle('core', x, y, 32, p.spark, 21, 7, 0, 0, 0, tick);
  }

  _ghost(p, tick) {
    const rig = p.f && this.fighterMeshes.get(`${p.f.port}:${p.f.fighterId}:${p.f.paletteIndex}`);
    const mesh = this._bone(this.fxGroup, 'Special afterimage');
    const material = this._energy(p.spark, .48, { side: this.T.FrontSide });
    if (rig?.initialized) {
      rig.root.updateWorldMatrix(true, true);
      const dx = p.x - rig.root.position.x, dy = p.y - rig.root.position.y;
      rig.turn.traverseVisible((part) => {
        if (!part.isMesh) return;
        const echo = new this.T.Mesh(part.geometry, material);
        echo.matrix.copy(part.matrixWorld);
        echo.matrix.elements[12] += dx; echo.matrix.elements[13] += dy; echo.matrix.elements[14] -= 5;
        echo.matrixAutoUpdate = false;
        mesh.add(echo);
      });
    } else {
      const h = p.h, w = (p.f?.def.stats.width || 45) * (p.f?.scale || 1);
      for (const [x, y, sx, sy] of [[0,.55,.38,.31],[.08,.86,.34,.20],[-.43,.62,.25,.095],[.41,.64,.2,.09],[-.25,.21,.16,.25],[.22,.18,.17,.23]]) {
        this._shape(mesh, 'smallBall', material, p.x + x * w, p.y + y * h, -4, sx * w, sy * h, w * .25, false);
      }
    }
    this._recordCombatEffect({ mesh, material, kind: 'ghost', life: 13, born: tick });
  }

  _specialEvent(e, match) {
    const p = specialEventVisual(e, match);
    if (!p) return false;
    const { x, cy: y, rim, core, spark, angle } = p, t = match.frame;
    if (e.type === 'specialCharge' && !chargePulse(p, t, this.chargeSamples)) return true;
    if (e.type === 'quickZip') this._zipBeam(p, t);
    else if (e.type === 'afterimage') this._ghost(p, t);
    else {
      const warp = e.type === 'teleportFlash', charge = e.type === 'specialCharge';
      const radius = e.misfire ? 147 : warp ? 103 : charge ? 75 : 96;
      const count = e.misfire ? 28 : warp ? 18 : charge ? 8 : 16;
      for (let i = 0; i < (warp ? 3 : 2); i++) {
        const start = p.inwards ? radius * (1 - i * .14) : 13 + i * 9;
        this._particle('ring', x, y, 24 + i * 4, i % 2 ? core : spark, start, 13 + i * 3, 0, 0, 0, t,
          { end: p.inwards ? 4 : radius * (1 - i * .17), tilt: -.54 + i * .39, yaw: .57 - i * .45, roll: angle + i * .49 });
      }
      for (let i = 0; i < count; i++) {
        const a = charge || warp || e.misfire ? i * 2.399 : angle + Math.PI + Math.sin(i * 8.7) * 1.18;
        const speed = p.inwards ? -5.1 : 4 + i % 8;
        const start = p.inwards ? radius * .75 : charge ? 20 : 0;
        this._particle('impactSpark', x + Math.cos(a) * start, y + Math.sin(a) * start, 22 + i % 3 * 7,
          i % 4 ? spark : core, 7 + i % 6, 12 + i % 7, Math.cos(a) * speed, Math.sin(a) * speed, Math.sin(i) * 2, t, { angle: a });
      }
      if (!charge) {
        this._particle('impactStar', x, y, 43, core, radius * (e.misfire ? .96 : .64), 10, 0, 0, 0, t,
          { angle, aspect: .76, tilt: .17, alpha: .92 });
        this._flash(rim, x, y, e.misfire ? 172000 : 89000, t, 12, true);
      }
    }
    return true;
  }

  _electricArc(x, y, frame, angle, size, variant) {
    this._particle('lightning', x, y, 37 + variant * 3, variant === 2 ? '#ffe694' : '#d9ffff', size, 3 + variant % 2,
      0, 0, 0, frame, { angle, variant, yaw: (variant - 1) * .30, tilt: .11 });
  }

  _hitImpact(e, match, x, y) {
    const t = match.frame, kb = Math.max(0, e.kb || 0), damage = Math.max(0, e.damage || 0);
    const victim = match.fighters?.find((f) => f.port === e.victimPort);
    const attacker = match.fighters?.find((f) => f.port === e.attackerPort);
    const key = e.moveKey;
    const move = attacker?.def.moves?.[key];
    const electric = e.electric ?? (e.element === 'electric' || e.element === 'lightning' ||
      move?.kind === 'reflector' || move?.kind === 'chargeShot' || (key === M.FAIR && e.sweetspot && move?.name === 'Knee of Bread'));
    const slash = e.slash ?? (e.element === 'slash' || (blades.has(attacker?.def.rig?.prop) && swings.has(key)));
    const heavy = e.heavy ?? (smashes.has(key) || kb >= 105);
    const vx = victim?.kbVx || 0, vy = victim?.kbVy || 0;
    // Event angles, like move angles, are degrees CCW from +X in the Y-up simulation.
    const angle = Number.isFinite(e.angle) ? e.angle * DEG : vx || vy ? Math.atan2(vy, vx)
      : e.meteor ? -Math.PI / 2 : attacker ? Math.atan2(y - attacker.y - attacker.def.stats.height * (attacker.scale || 1) * .52,
        x - attacker.x || attacker.facing || 1) : (victim?.facing > 0 ? 145 : 35) * DEG;
    const hitlag = Math.max(e.hitlag || 0, victim?.hitlag || 0);
    if (e.victimPort != null) this.hitFocus.set(e.victimPort, { x, y, frame: t, angle, electric, hitlag, kb });
    const style = electric ? 'electric' : e.meteor ? 'meteor' : slash ? (e.sweetspot ? 'sweetSlash' : 'slash') : e.sweetspot ? 'sweet' : 'standard';
    const [rim, core, spark] = impactPaint[style];
    const force = clamp(kb / 175), weight = clamp(damage / 28 * .45 + force * .66);
    const size = mix(52, 135, Math.max(heavy ? .50 : 0, weight));
    const aspect = slash && !electric ? .65 : 1, tilt = slash ? .29 : .18;
    this._particle('impactStar', x, y, 48, rim, size, 9 + Math.round(weight * 4), 0, 0, 0, t,
      { angle, aspect, tilt, yaw: -.15, alpha: .94, solid: true });
    this._particle('impactStar', x, y, 52, core, size * .68, 6 + Math.round(weight * 3), 0, 0, 0, t,
      { angle, aspect: aspect * .70, tilt, yaw: -.15, alpha: 1 });
    const count = 14 + Math.round(weight * 13);
    for (let i = 0; i < count + 5; i++) {
      const back = i >= count;
      const a = angle + (back ? Math.PI : 0) + (Math.random() * 2 - 1) * (back ? 35 : 28) * DEG;
      const speed = (mix(5, 15, force) + Math.random() * mix(5, 12, force)) * (back ? .49 : 1);
      this._particle('impactSpark', x, y, 24 + Math.random() * 19, i % 4 === 0 ? core : i % 3 === 0 ? rim : spark,
        mix(8, 26, weight) * (.67 + Math.random() * .55) * (back ? .56 : 1), 10 + Math.floor(Math.random() * 8),
        Math.cos(a) * speed, Math.sin(a) * speed, (Math.random() - .5) * 2.2, t, { angle: a });
    }
    if (electric) for (let i = 0; i < 3; i++) this._electricArc(x, y, t, angle + i * TAU / 3, size * (1.1 + i * .16), i);
    const fire = !electric && (e.element === 'fire' || move?.element === 'fire' || move?.style === 'fire');
    if (e.meteor) this._particle('shockwave', x, y - 8, 18, '#ff4864', size * 0.22, 16, 0, -2.2, 0, t,
      { end: size * 1.15, angle: -Math.PI / 2, tilt: Math.PI / 2 });
    if (fire) for (let i = 0; i < 5; i++) {
      const a = angle + (i - 2) * 0.32;
      this._particle('flame', x, y, 30, i % 2 ? '#ffd36a' : '#ff6a1a', size * 0.32, 10 + i,
        Math.cos(a) * 1.6, Math.sin(a) * 1.6 + 0.8, 0, t, { angle: a + Math.PI / 2 });
    }
    if (slash && !electric) this._particle('slash', x, y, 42, spark, size * 0.82, 8, 0, 0, 0, t, { angle, tilt: 0.18 });
    if (kb >= 85 && (e.sweetspot || e.meteor || heavy)) {
      this._particle('shockwave', x, y, 24, spark, size * .28, 17, 0, 0, 0, t,
        { end: size * 1.38, angle, tilt: .26, yaw: .46 });
      this._particle('shockwave', x, y, 27, core, size * .18, 11, 0, 0, 0, t,
        { end: size * .99, angle, tilt: -.46, yaw: -.54 });
    }
    this._flash(electric || slash ? '#a4f6ff' : '#ffca81', x, y, mix(38000, 122000, weight), t, weight > .6 ? 10 : 7, true);
    if (kb >= 105 && (e.sweetspot || heavy) && (this.cameraKick?.frame !== t || kb >= this.cameraKick.kb)) {
      const power = clamp((kb - 105) / 120);
      this.cameraKick = { frame: t, kb, x: Math.cos(angle), y: Math.sin(angle), zoom: mix(.042, .058, power), shake: mix(5, 9, power) };
    }
  }

  _bounceDust(port, x, y, frame, wallDir = 0) {
    if (port != null) {
      if (this.dustFrames.get(port) === frame) return;
      this.dustFrames.set(port, frame);
    }
    for (let i = 0; i < 7; i++) {
      const angle = wallDir ? (wallDir < 0 ? Math.PI : 0) + (i - 3) * .29 : .15 + i * (Math.PI - .30) / 6;
      const speed = 2.3 + Math.abs(i - 3) * .73;
      this._particle('dustPuff', x + (wallDir ? 0 : (i - 3) * 3), y + (wallDir ? (i - 3) * 4 : 4), 9 + i * 2,
        0xffffff, 15 + i % 3 * 4, 13 + i % 4 * 2, Math.cos(angle) * speed, Math.sin(angle) * speed, 0, frame,
        { angle, swirl: (i - 3) * .35 });
    }
  }

  ingestEvents(events, match) {
    const before = this.renderer2d?.fx?.callouts?.length ?? 0;
    this.renderer2d?.ingestEvents(events, match);
    if (!this.isActive() || !events?.length) return;
    try {
      for (const e of events) this._ingestEvent(e, match);
      // Keep the classic callouts intact for fallback, but don't draw them twice in 3D.
      for (const c of this.renderer2d?.fx?.callouts?.slice(before) || []) {
        if (events.some((e) => (e.type === 'comboCallout' && c.text === String(e.text || 'COMBO!') && c.x === e.x && c.y === e.y + 92)
          || (e.type === 'dramaticFinish' && c.text === 'FINISH!!')
          || (Object.hasOwn(MATCH_CALLOUTS, e.type) && (c.text === (e.text || MATCH_CALLOUTS[e.type][0]) ||
            (e.type === 'suddenDeath' && c.text === 'SUDDEN DEATH! 300%'))))) this.arcadeFx.add(c);
      }
    } catch (error) {
      this._fallback(error);
    }
  }

  _ingestEvent(e, match) {
    const t = match.frame, x = e.x ?? 0, y = e.y ?? 0;
    if (this._specialEvent(e, match)) return;
    const reaction = combatReaction(e, match);
    if (reaction) {
      this._combatReaction(reaction, t);
      return;
    }
    if (e.type === 'stageTransformWarn') {
      const next = match.stage.transformations?.find((f) => f.id === e.formId);
      const current = match.stageForm ?? getStageForm(match.stage, t);
      const name = e.nextForm || e.name || next?.name || current?.nextForm || 'NEXT FORM';
      this.stageWarning = { name, match, frame: t, until: t + (e.frames ?? current?.changeIn ?? STAGE_WARNING_LEAD) };
      return;
    }
    if (e.type === 'stageTransform') {
      this.stageWarning = null;
      const text = e.name || match.stageForm?.name;
      if (text) {
        this.matchBanners = this.matchBanners.filter(({ kind }) => kind !== 'stageTransform');
        this.matchBanners.push({ kind: 'stageTransform', text: text.endsWith('!') ? text : text + '!', frame: t, life: 104 });
      }
      return;
    }
    if (e.type === 'warpPipe' || e.type === 'barrelLaunch') {
      const warp = e.type === 'warpPipe', color = warp ? '#80ffc0' : '#ffc46b';
      if (warp) {
        const target = match.stage.warpPipes?.find((pipe) => Math.abs(pipe.x - x) < 12);
        if (target) for (const id of [target.id, target.targetId]) this.warpPulses.set(id, t);
      } else {
        this.stagePulse = { stage: match.stage.id, frame: t };
      }
      this._particle('ring', x, y + 33, 12, color, 16, 22, 0, 0, 0, t, { end: 83, tilt: -0.34 });
      for (let i = 0; i < 12; i++) {
        const angle = TAU * i / 12;
        this._particle('shard', x, y + 29, 10, color, 6, 18 + i % 7,
          Math.cos(angle) * 3.5, 2 + Math.sin(angle) * 3.4, Math.sin(angle) * 1.4, t);
      }
      return;
    }
    if (e.type === 'hit') {
      this._hitImpact(e, match, x, y);
      return;
    }
    const burst = ['explosion', 'homerunPing', 'targetBreak', 'shine', 'shieldBreak'];
    if (Object.hasOwn(MATCH_CALLOUTS, e.type)) {
      this._queueMatchBanner(e.type, t);
      if (match[e.type]) this.calloutFlags.add(e.type);
      return;
    }
    if (e.type === 'comboCallout') {
      const text = String(e.text || 'COMBO!');
      this.comboBanners.push({ x, y, text, frame: t });
      if (this.comboBanners.length > 3) this.comboBanners.shift();
      this._particle('ring', x, y + 24, 9, '#ffc96e', 14, 16, 0, 0, 0, t, { end: 76, tilt: 0.20 });
      return;
    }
    if (e.type === 'dramaticFinish') {
      this._startFinish(e, match);
      return;
    }
    if (e.type === 'powershield') {
      const f = match.fighters.find((fighter) => fighter.port === e.port);
      const cy = y + (f?.def.stats.height || 75) * (f?.scale || 1) * 0.48;
      this._particle('ring', x, cy, 28, '#7cfaff', 22, 19, 0, 0, 0, t, { end: 110, yaw: 0.39 });
      this._particle('ring', x, cy, 21, '#efffff', 22, 12, 0, 0, 0, t, { end: 78, tilt: 0.76, yaw: -0.28 });
      this._particle('core', x, cy, 18, '#d9ffff', 28, 6, 0, 0, 0, t);
      for (let i = 0; i < 12; i++) {
        const a = i * TAU / 12;
        this._particle('spark', x + Math.cos(a) * 19, cy + Math.sin(a) * 19, 18 + i % 3 * 7,
          i % 3 ? '#68efff' : '#ffffff', i % 2 ? 4 : 6, 15, Math.cos(a) * 7, Math.sin(a) * 7, 0, t);
      }
      this._flash('#9efcff', x, cy, 125000, t, 12);
      return;
    }
    if (e.type === 'lCancel') {
      this._particle('ring', x, y + 4, 6, '#b6ffd0', 10, 12, 0, 0, 0, t, { end: 54, tilt: Math.PI / 2 });
      this._particle('ring', x, y + 4, 8, '#ffffff', 6, 10, 0, 0, 0, t, { end: 36, tilt: Math.PI / 2 });
      return;
    }
    if (e.type === 'wavedash') {
      this.slideUntil.set(e.port, t + 14);
      for (let i = 0; i < 5; i++) this._particle('smoke', x + i * 4, y + 4, -1, '#c1e7f7', 6 + i, 12 + i,
        -(e.dir || 1) * (2 + i * 0.9), 1.4, 0.1, t);
    }
    if (e.type === 'tech' && e.tech === 'PARRY') {
      const f = match.fighters?.find((fighter) => fighter.port === e.port);
      const cy = y + (f?.def.stats.height || 75) * (f?.scale || 1) * 0.48;
      this._particle('ring', x, cy, 26, '#ffd56a', 18, 14, 0, 0, 0, t, { end: 92, yaw: 0.2 });
      this._particle('ring', x, cy, 22, '#fff6c8', 12, 10, 0, 0, 0, t, { end: 64, tilt: 0.5 });
      this._particle('impactStar', x, cy, 40, '#ffe9a0', 48, 8, 0, 0, 0, t, { angle: 0.4, aspect: 0.7, alpha: 0.95 });
      this._flash('#ffe08a', x, cy, 90000, t, 10);
      return;
    }
    if (e.type === 'tech' && (e.wall || !e.tech)) {
      const f = match.fighters?.find((fighter) => fighter.port === e.port);
      const wallDir = e.wall ? Math.sign(e.dir || f?.vx || 1) : 0;
      this._bounceDust(e.port, x, y + (e.wall ? (f?.def.stats.height || 75) * (f?.scale || 1) * .53 : 0), t, wallDir);
      return;
    }
    if (e.type === 'land') {
      const f = match.fighters?.find((fighter) => fighter.port === e.port);
      const prior = e.fromState ?? e.prevState ?? ((f?.stateFrame ?? Infinity) <= 2 ? f.prevState : null);
      // A ground tech also emits land in the same step. Its tech event owns the puff.
      if (f?.state !== S.TECH && (prior === S.TUMBLE || prior === S.KNOCKDOWN || f?.state === S.KNOCKDOWN)) {
        this._bounceDust(e.port, x, y, t);
        return;
      }
    }
    if ((e.type === 'land' && (e.speed || 0) > 8) || (e.type === 'jump' && e.doubleJump)) {
      this._particle('ring', x, y + 2, 2, '#e4faff', 6, 12, 0, 0, 0, t, { end: 39, tilt: Math.PI / 2 });
    }
    if (burst.includes(e.type)) {
      const explosion = e.type === 'explosion';
      const sweet = e.sweetspot || e.type === 'homerunPing';
      const fire = explosion || e.element === 'fire';
      const col = fire ? '#ff8332' : sweet ? '#ffe16c' : (e.type === 'targetBreak' || e.type === 'shieldBreak' || e.meteor) ? '#ff4f86' : '#63efff';
      const attacker = match.fighters?.find((f) => f.port === e.attackerPort);
      const victim = match.fighters?.find((f) => f.port === e.victimPort);
      const dx = victim?.kbVx || (x - (attacker?.x ?? x));
      const dy = victim?.kbVy || (y - (attacker ? attacker.y + attacker.def.stats.height * 0.5 : y));
      const bearing = Math.atan2(dy, dx || 1);
      const count = explosion ? 18 : sweet ? 15 : 9;
      const cy = e.type === 'shine' ? y + 34 : y;
      for (let i = 0; i < count; i++) {
        const random = Math.random();
        const a = explosion || i % 5 === 0 ? random * TAU : bearing + (random - 0.5) * 2.35;
        const s = 3.6 + (sweet || explosion ? 12 : 8) * Math.random();
        this._particle('spark', x, cy, 14 + 14 * (Math.random() - 0.5), i % 4 === 0 ? '#fff4d9' : col,
          4 + Math.random() * (sweet ? 7 : 4), 11 + Math.floor(Math.random() * 13),
          Math.cos(a) * s, Math.sin(a) * s, (Math.random() - 0.5) * 4.5, t);
      }
      this._particle('core', x, cy, 19, '#fffbe7', sweet || explosion ? 22 : 13, 9, 0, 0, 0, t);
      this._particle('ring', x, cy, 17, col, 8, sweet || explosion ? 21 : 14, 0, 0, 0, t,
        { end: explosion ? (e.radius || 108) : sweet ? 97 : 55, yaw: 0.20, tilt: 0.19 });
      if (sweet || explosion) this._particle('ring', x, cy, 15, '#fff0cb', 16, 13, 0, 0, 0, t,
        { end: explosion ? 82 : 76, tilt: 0.90, yaw: bearing * 0.45 });
      this._flash(col, x, cy, sweet || explosion ? 92000 : 46000, t, sweet ? 16 : 10);
    } else if (e.type === 'ko') {
      const dir = e.dir, col = playerColor(e.port);
      const a = dir === 'left' ? -Math.PI / 2 : dir === 'right' ? Math.PI / 2 : dir === 'top' ? Math.PI : 0;
      for (const [width, height, paint] of [[86, 740, col], [45, 580, '#e5d9ff'], [25, 465, '#fff8d5']]) {
        this._particle('beam', x, y, -12, paint, width, 29, 0, 0, 0, t, { angle: a, length: height });
      }
      this._particle('ring', x, y, 8, col, 24, 26, 0, 0, 0, t, { end: 160, yaw: Math.sin(a) * 0.7 });
      this._flash(col, x, y, 195000, t, 18);
    }
  }

  _combatReaction(p, frame) {
    const { type, x, cy, rim, core, size, life } = p;
    const star = (sx, sy, reach, angle, ink, aspect = .7) => this._particle('impactStar', sx, sy, 48,
      ink, reach, life, 0, 0, 0, frame, { angle, aspect, alpha: .94, solid: true });
    const ring = (z, start, end, tilt, ink) => this._particle('ring', x, cy, z,
      ink, start, life, 0, 0, 0, frame, { end, tilt, yaw: -.28, solid: true });
    if (type === 'reflect') {
      ring(36, size * .40, size * 1.25, -.22, rim);
      ring(44, size * .31, size * .92, .61, core);
    } else if (type === 'counter') {
      star(x, cy, size, .56 * p.face, rim, .51);
      star(x, cy, size * .72, .56 * p.face, core, .40);
    } else if (type === 'chargeStored') {
      star(x, cy, size * (.70 + p.power * .30), Math.PI / 4, rim);
      star(x, cy, size * .55, Math.PI / 4, core);
      ring(39, size * .23, size * .76, .24, rim);
    } else if (type === 'armor') {
      for (let i = 0; i < 7; i++) {
        const a = TAU * (i + .27) / 7, dx = Math.cos(a), dy = Math.sin(a);
        this._particle('impactSpark', x + dx * 11, cy + dy * 11, 40, i % 2 ? rim : core, 7, life,
          dx * 5, dy * 5, 0, frame, { angle: a, solid: true });
      }
    } else {
      for (const i of [-1, 0, 1]) star(x + i * 14, cy + (i ? 8 : 19), size * (i ? .49 : .63), Math.PI / 2 + i * .28, i ? rim : core, .58);
    }
  }

  _startFinish(e, match) {
    const hit = this.hitFocus.get(e.victimPort);
    // A KO event can land at the blast zone, long after the last visible impact.
    const recent = hit && match.frame - hit.frame < 100 ? hit : null;
    const bounds = match.stage.cameraBounds || match.stage.blastzones;
    const hitX = e.impactX ?? recent?.x ?? e.x ?? this.camX;
    const hitY = e.impactY ?? recent?.y ?? e.y ?? this.camY;
    const x = clamp(hitX, Math.max(bounds.left, this.camX - this.camZ * 0.47), Math.min(bounds.right, this.camX + this.camZ * 0.47));
    const y = clamp(hitY, Math.max(bounds.bottom, this.camY - this.camZ * 0.24), Math.min(bounds.top, this.camY + this.camZ * 0.25));
    this.finish = { x, y, frame: match.frame, slow: (match.slowMoFrames || 0) > 0, duration: match.slowMoFrames || 36 };
  }

  _finishAge(match) {
    if (!this.finish) return Infinity;
    return this.finish.slow ? this.finish.duration - (match.slowMoFrames || 0) : match.frame - this.finish.frame;
  }

  _flash(color, x, y, strength, frame, life, atContact = false) {
    if (this.flash && this.flash.frame === frame && this.flash.strength > strength) return;
    this.flash = { color, x, y, strength, frame, life, atContact };
  }

  _updateEffects(t) {
    const a = this.fxParticles;
    for (let i = a.length - 1; i >= 0; i--) {
      const p = a[i], elapsed = Math.max(0, t - p.born), progress = elapsed / p.life, left = 1 - progress;
      if (progress >= 1) {
        this._retireParticle(p);
        a.splice(i, 1);
        continue;
      }
      const { mesh, size } = p;
      if (p.kind === 'ghost') {
        p.material.opacity = .36 * left ** 1.35;
      } else if (p.kind === 'zipBeam') {
        for (const { material, alpha } of p.materials) material.opacity = alpha * left ** 1.24 * (elapsed % 2 ? .77 : 1);
      } else if (p.kind === 'impactStar') {
        const reach = size * mix(.87, 1.16, ease(elapsed / 3)) * mix(.83, 1, left);
        mesh.scale.set(reach, reach * p.aspect * (.68 + .32 * left), reach);
        mesh.material.opacity = p.alpha * left ** 1.05;
      } else if (p.kind === 'lightning') {
        mesh.scale.setScalar(size * (elapsed % 2 ? .91 : 1));
        mesh.material.opacity = left * (elapsed % 2 ? .71 : 1);
      } else if (p.kind === 'beam') {
        mesh.scale.set(size * Math.sqrt(left), p.length * (0.72 + left * 0.28), size * Math.sqrt(left));
        mesh.material.opacity = 0.66 * left;
      } else if (p.kind === 'ring' || p.kind === 'shockwave') {
        mesh.scale.setScalar(mix(size, p.end || size * 5, 1 - left ** 2.1));
        mesh.material.opacity = left ** 1.5 * (p.kind === 'shockwave' ? .98 : .83);
      } else {
        const advance = (1 - 0.94 ** elapsed) / 0.06;
        const gravity = p.kind === 'spark' ? .075 : p.kind === 'impactSpark' ? .030 : 0;
        mesh.position.set(p.x + p.vx * advance, p.y + p.vy * advance - elapsed ** 2 * gravity, p.z + p.vz * advance);
        if (p.kind === 'damageSmoke') {
          const width = size * (0.55 + progress * 1.43);
          mesh.scale.set(width, width * 0.93, 1);
          mesh.quaternion.copy(this.camera.quaternion);
          mesh.rotateZ((p.swirl - 0.5) * (2.4 + progress * 1.5));
          mesh.material.opacity = ease(elapsed / 4) * left ** 1.35 * (p.heavy ? 0.90 : 0.73);
        } else if (p.kind === 'launchPuff' || p.kind === 'dustPuff') {
          const dust = p.kind === 'dustPuff';
          const width = size * mix(.72, dust ? 1.78 : 2.0, 1 - left ** 1.6);
          mesh.scale.set(width * (dust ? 1.16 : .88), width * (dust ? .82 : 1.04), 1);
          mesh.quaternion.copy(this.camera.quaternion);
          mesh.rotateZ(p.angle + p.swirl * (.3 + progress * .7));
          mesh.material.opacity = (dust ? .89 : .91) * left ** 1.4;
        } else if (p.kind === 'flame' || p.kind === 'slash') {
          const reach = size * (p.kind === 'slash' ? mix(0.72, 1.22, ease(Math.min(1, elapsed / 3))) : 0.8 + progress * 0.45);
          mesh.scale.set(reach, reach * (p.kind === 'flame' ? 1.35 : 0.55), reach * 0.35);
          mesh.material.opacity = left ** 1.15;
        } else if (p.kind === 'impactSpark' || p.kind === 'speedStreak') {
          const streak = p.kind === 'speedStreak';
          mesh.scale.set(size * (streak ? .66 : .78) * left ** .5, (streak ? 3.3 : 1.0 + size * .069) * left, 2.0 * left);
          mesh.material.opacity = left ** 1.45 * (streak ? .85 : .96);
          if (!streak) mesh.rotation.z = Math.atan2(p.vy * .94 ** elapsed - elapsed * gravity * 2, p.vx * .94 ** elapsed);
        } else {
          if (p.kind === 'spark') mesh.scale.set(size * (2.1 + left * 2.5), size * (0.25 + left * 0.28), size * 0.44);
          else mesh.scale.setScalar(p.kind === 'smoke' ? size * (0.6 + progress * 0.94) : size * (0.75 + left * 0.64));
          mesh.material.opacity = left ** (p.kind === 'smoke' ? 1.8 : 1.27) * (p.kind === 'smoke' ? 0.42 : 0.88);
        }
      }
    }
    const flash = this.allowFlash && this.flash;
    if (flash && t - flash.frame < flash.life) {
      this.impact.color.set(flash.color);
      this.impact.position.set(flash.x, flash.y + (flash.atContact ? 0 : 11), flash.atContact ? 28 : 35);
      this.impact.intensity = flash.strength * (this.portCount >= 4 ? .55 : .82) * clamp(1 - (t - flash.frame) / flash.life) ** 2.4;
    } else {
      this.impact.intensity = 0;
      this.flash = null;
    }
  }

  _queueMatchBanner(kind, frame) {
    if (this.matchBanners.some((banner) => banner.kind === kind && banner.frame === frame)) return;
    const [text, life] = MATCH_CALLOUTS[kind];
    this.matchBanners.push({ kind, text, life, frame });
    if (this.matchBanners.length > 3) this.matchBanners.shift();
  }

  _syncCalloutFlags(match) {
    for (const kind of Object.keys(MATCH_CALLOUTS)) {
      if (!match[kind]) this.calloutFlags.delete(kind);
      else if (!this.calloutFlags.has(kind)) {
        this.calloutFlags.add(kind);
        this._queueMatchBanner(kind, match.frame);
      }
    }
  }

  _updateLighting(mode, suddenDeath, delta, draw = false) {
    const palette = this.stageLighting;
    const victory = mode === 'victory';
    this.tension = mix(this.tension || 0, mode === 'battle' && suddenDeath ? 1 : 0, 1 - Math.exp(-delta * 0.15));
    const p = mode === 'battle' ? this.tension : 0;
    this.scene.fog = victory ? null : mode === 'preview' ? palette.previewFog : palette.fog;
    if (victory) {
      this.hemi.color.set('#d6e9ff'); this.hemi.groundColor.set(draw ? '#63768c' : '#796145');
      this.sun.color.set(draw ? '#e3f1ff' : '#ffd491'); this.rim.color.set(draw ? '#86b7df' : '#aea2ff');
    } else {
      this.hemi.color.copy(palette.hemi).lerp(this.tensionPalette[0], p * 0.28);
      this.hemi.groundColor.copy(palette.ground).lerp(this.tensionPalette[1], p * 0.39);
      this.sun.color.copy(palette.sun).lerp(this.tensionPalette[2], p * 0.47);
      this.rim.color.copy(palette.rim).lerp(this.tensionPalette[3], p * 0.58);
      if (this.formAccent) {
        this.formTint ??= new this.T.Color();
        this.formTint.set(this.formAccent);
        this.hemi.color.lerp(this.formTint, 0.42);
        this.rim.color.lerp(this.formTint, 0.5);
        this.sun.color.lerp(this.formTint, 0.22);
      }
    }
    this.hemi.intensity = victory ? 1.84 : 2 - p * 0.20;
    this.sun.intensity = victory ? 1.95 : 2.75 + p * 0.18;
    this.rim.intensity = victory ? 2.9 : 2.40 + p * 0.26;
    if (mode !== 'battle') this.impact.intensity = 0;
  }

  _updatePreviewCamera() {
    const T = this.T, box = this.previewDeck.makeEmpty();
    // Frame the live play surfaces and landmark architecture, not background sheets or walk-off runways.
    const bounds = new T.Box3();
    for (const [id, mesh] of [...this.solidMeshes, ...this.platMeshes]) {
      if (!mesh.visible) continue;
      bounds.setFromObject(mesh);
      if (this.stageId === 'sandbag-yard' && id === 'main') bounds.max.x = Math.min(bounds.max.x, 930);
      if (mesh.userData.surface.walkOff) {
        bounds.min.x = Math.max(bounds.min.x, -825);
        bounds.max.x = Math.min(bounds.max.x, 825);
      }
      box.union(bounds);
    }
    for (const prop of this.previewProps) box.union(prop);
    for (const landmark of this.stageLandmarks.children) {
      if (landmark !== this.roadMesh && landmark !== this.riverMesh) box.expandByObject(landmark);
    }
    if (box.isEmpty()) box.setFromCenterAndSize(new T.Vector3(), new T.Vector3(700, 300, 220));
    const target = box.getCenter(new T.Vector3());
    const front = ['critter-floats', 'fiveside-skyscrapers', 'onett-strip-mall', 'flat-screen-calc'].includes(this.stageId);
    const back = new T.Vector3(front ? 0.14 : 0.23, front ? 0.21 : 0.33, 1).normalize();
    const right = new T.Vector3(back.z, 0, -back.x).normalize();
    const up = new T.Vector3().crossVectors(back, right);
    const tanY = Math.tan(this.camera.fov * Math.PI / 360) * 0.86;
    const tanX = tanY * this.camera.aspect;
    const corner = new T.Vector3();
    let distance = 360;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      corner.set(x, y, z).sub(target);
      distance = Math.max(distance, corner.dot(back) + Math.max(Math.abs(corner.dot(right)) / tanX, Math.abs(corner.dot(up)) / tanY));
    }
    this.camera.position.copy(target).addScaledVector(back, distance);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    this.sky.position.copy(this.camera.position);
    this.sun.position.set(target.x + 430, target.y + 820, 520);
    this.sun.target.position.copy(target);
  }

  _isDraw(match) {
    return match.winnerPort == null && match.winningTeam == null;
  }

  _victoryOrder(match) {
    return victoryOrder(match);
  }

  _buildShowcase(fighters, match, now) {
    const T = this.T;
    const draw = this._isDraw(match), team = match.winningTeam;
    const root = this._bone(this.scene, draw ? 'No Contest' : 'Victory Podium');
    const dark = this._mat('#16142d', { metalness: 0.38, roughness: 0.54 });
    const stageMetal = this._mat(draw ? '#485e76' : '#383858', { metalness: 0.42, roughness: 0.38 });
    const back = new T.ShaderMaterial({
      uniforms: { cool: { value: draw ? 1 : 0 } },
      depthWrite: false,
      vertexShader: `varying vec2 st;
        void main() { st = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 st; uniform float cool;
        void main() {
          vec2 off = (st - vec2(0.5, 0.62)) * vec2(1.75, 1.0);
          float glow = exp(-dot(off,off) * 36.0);
          float arc = 0.5 + 0.5 * cos(length(off * vec2(1.0,1.7)) * 96.0);
          gl_FragColor = vec4(mix(vec3(0.012,0.008,0.032), mix(vec3(0.10,0.065,0.15), vec3(0.06,0.12,0.19), cool), glow) + glow * arc * 0.008, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.ownedMaterials.add(back);
    this._shape(root, 'plane', back, 0, 145, -420, 2800, 1600, 1, false).renderOrder = -30;
    this._add(root, this._bevel([[252,98,0,30],[260,104,-7,28],[250,96,-22,28]]), [stageMetal, dark], 0, 0, -2);
    this._shape(root, 'box', this._energy(draw ? '#8fc8ff' : '#aa91fc', 0.65), 0, -7, 100, 435, 2.2, 1.4, false);

    const slots = [[0, 134, 14], [-115, 70, -9], [115, 49, -12], [191, 0, -26]];
    const colors = [['#efb448', '#ab761e', '#fff19a'], ['#bdc9eb', '#47506c', '#e4f4ff'], ['#c7835a', '#562d37', '#ffba82']];
    const buildStep = (rank, x, y, z, half, depth, sign) => {
      const neutralStep = rank == null;
      const [body, recess, highlight] = neutralStep ? ['#5d758b', '#344759', '#b8d5e9'] : colors[rank];
      const cap = this._mat(body, { metalness: 0.43, roughness: 0.33, emissive: body, emissiveIntensity: 0.06 });
      const shell = this._mat(recess, { metalness: rank === 0 ? 0.52 : 0.36, roughness: rank === 0 ? 0.34 : 0.47 });
      const band = this._mat(highlight, { metalness: 0.49, roughness: 0.29, emissive: highlight, emissiveIntensity: 0.12 });
      const plinth = this._bone(root, ['Gold pedestal', 'Silver step', 'Bronze step'][rank] || 'Shared neutral step', x, y, z);
      this._add(plinth, this._bevel([[half-4,depth-4,0,9],[half,depth,-5,10],[half-2,depth-1,-9,10],
        [half-9,depth-6,-13,12],[half-11,depth-7,-y+9,14],[half,depth,-y+6,10],[half,depth,-y,10]]), [cap, shell]);
      this._add(plinth, this._bevel([[half,depth,-4,10],[half,depth,-6,10]], false), band);
      const plaqueY = -y * 0.43, labelH = Math.min(42, y * 0.52), labelW = sign ? Math.min(half * 1.6, labelH * 4) : labelH;
      if (rank === 0) for (const side of [-1, 1]) this._shape(plinth, 'box', band, side * (half - 25), -y * 0.64, depth - 6.4,
        1.6, y * 0.44, 1.6, false);
      const plaque = sign ? getStageSignTexture(sign, '#e8f5ff', '#2b4056', T, this) : getPodiumRankTexture(rank + 1, T, this);
      this._shape(plinth, 'plane', this._basic(0xffffff, { map: plaque, transparent: !sign, depthWrite: !!sign, toneMapped: false }),
        0, plaqueY, depth + 1, labelW, labelH, 1, false);
    };
    const makeActor = (f, x, y, z, winner) => ({ port: f.port, rig: this._buildFighter(f, root), x, y, z, winner });
    let actors;
    if (draw) {
      const n = fighters.length;
      buildStep(null, 0, 65, 0, Math.max(87, n * 48), 52, 'NO CONTEST / DRAW');
      actors = fighters.map((f, i) => makeActor(f, (i - (n - 1) / 2) * 92, 65, 5, false));
      return { root, actors, draw, start: now, last: now };
    }
    if (team != null) {
      const winners = fighters.filter((f) => f.team === team);
      const others = fighters.filter((f) => f.team !== team);
      const placeTeam = (list, winner) => {
        if (!list.length) return [];
        const n = list.length, y = winner ? 134 : 40, z = winner ? -35 : 63;
        buildStep(winner ? 0 : 1, 0, y, z, Math.max(62, n * 50), winner ? 47 : 41);
        return list.map((f, i) => makeActor(f, (i - (n - 1) / 2) * 96, y, z, winner));
      };
      actors = [...placeTeam(winners, true), ...placeTeam(others, false)];
    } else {
      actors = fighters.map((f, i) => {
        const [x, y, z] = slots[i];
        if (i < 3) buildStep(i, x, y, z, i === 0 ? 56 : 45, i === 0 ? 46 : 39);
        return makeActor(f, x, y, z, f.port === match.winnerPort);
      });
    }

    const spot = new T.SpotLight('#ffdc91', 175000, 670, 0.35, 0.79, 2);
    spot.position.set(0, 442, 42);
    spot.target.position.set(0, 112, team == null ? 14 : -35);
    if (team != null) spot.angle = 0.49;
    root.add(spot, spot.target);
    const beam = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: `varying vec2 st; varying vec3 n; varying vec3 v;
        void main() { st = uv; n = normalize(normalMatrix * normal);
          vec4 p = modelViewMatrix * vec4(position,1.0); v = -p.xyz; gl_Position = projectionMatrix * p; }`,
      fragmentShader: `varying vec2 st; varying vec3 n; varying vec3 v;
        void main() {
          float edge = max(0.0, dot(normalize(n),normalize(v)));
          float falloff = smoothstep(0.0,0.21,st.y) * (1.0 - smoothstep(0.82,1.0,st.y));
          gl_FragColor = vec4(vec3(1.0,0.66,0.26), edge*edge * falloff * 0.16);
          #include <colorspace_fragment>
        }`,
    });
    this.ownedMaterials.add(beam);
    const cone = this._add(root, new T.ConeGeometry(team == null ? 128 : 183, 315, 42, 1, true), beam,
      0, 283, team == null ? 24 : -25, false);
    cone.rotation.x = 0.07;

    const ribbon = new T.PlaneGeometry(1, 1, 1, 5);
    const pos = ribbon.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const twist = pos.getY(i) * Math.PI * 1.28;
      pos.setZ(i, pos.getX(i) * Math.sin(twist));
      pos.setX(i, pos.getX(i) * Math.cos(twist));
    }
    this.ownedGeometries.add(ribbon);
    const confetti = new T.InstancedMesh(ribbon, this._basic('#ffffff', { side: T.DoubleSide, toneMapped: false }), 80);
    const sparkles = new T.InstancedMesh(this._unit('gem'), this._energy('#ffdd8d', 0.86), 24);
    for (const inst of [confetti, sparkles]) {
      inst.userData.ownedInstances = true;
      inst.instanceMatrix.setUsage(T.DynamicDrawUsage);
      inst.frustumCulled = false;
      root.add(inst);
    }
    const party = ['#ffc85e', '#fff0ba', '#66e9ff', '#f796b5', '#9aabff', '#ff805e'].map((c) => new T.Color(c));
    for (let i = 0; i < confetti.count; i++) confetti.setColorAt(i, party[i % party.length]);
    return { root, actors, spot, confetti, sparkles, dummy: new T.Object3D(), start: now, last: now, team };
  }

  _updateShowcase(match, fighters, now) {
    const s = this.showcase;
    const tick = (now - s.start) * 0.06, delta = clamp((now - s.last) * 0.06, 0, 4);
    s.last = now;
    s.actors.forEach(({ rig, x, y, z, winner }, i) => {
      const phase = tick * 0.11 + i * 1.1;
      const cheer = Math.cos(phase) * 0.5 + 0.5;
      const bounce = Math.max(0, Math.sin(phase)) ** 2;
      const celebration = winner ? pose({
        lift: -0.022 + bounce * 0.035, lean: Math.sin(phase * 0.5) * 0.14, head: 0.16 + Math.sin(phase) * 0.13,
        arm: 2.27 + 0.38 * Math.sin(phase * 1.9), elbow: 0.36 + cheer * 0.28,
        off: -1.83 - bounce * 0.96, offElbow: 0.39, spread: 0.39,
        leg: -0.19 + bounce * 0.42, offLeg: 0.18 - bounce * 0.50, knee: -0.12 - bounce * 0.32,
        offKnee: -0.16 - bounce * 0.37, tool: 0.90 + Math.sin(phase * 1.9) * 0.39,
      }) : s.draw ? pose({
        head: Math.sin(phase * 0.58) * 0.06, lean: Math.sin(phase * 0.38) * 0.035,
        arm: 0.34 + cheer * 0.15, off: -0.25 - cheer * 0.13,
        elbow: 0.59 + cheer * 0.31, offElbow: -0.58 - cheer * 0.29, spread: 0.07 + 0.09 * (1 - cheer),
      }) : pose({
        lean: -0.21, head: -0.31 + Math.sin(phase * 0.47 + i) * 0.09,
        yaw: -0.12, lift: -0.026, arm: 0.56, elbow: 0.51, off: 0.35, offElbow: 0.58,
        tool: 0.37, spread: 0.085, leg: -0.11, offLeg: 0.12,
      });
      this._updateFighter(rig, fighters[i], match, delta, { tick, pose: celebration, x, y: y + (winner ? bounce * 15 : 0), z,
        scale: clamp((winner ? 105 : s.draw ? 85 : 76) / rig.h, 0.54, 1.65),
        expression: winner ? 'victory' : s.draw ? (blinkAt(tick, fighters[i].port) ? 'blink' : 'normal') : 'sulk',
        yaw: winner ? -1.42 + Math.sin(phase * 0.59) * 0.23 : s.draw ? -Math.PI / 2 + 0.003 * x : x < 0 ? -1.10 : -2.09 });
    });
    for (const node of s.draw ? [] : [s.confetti, s.sparkles]) {
      const sparks = node === s.sparkles, dummy = s.dummy;
      for (let i = 0; i < node.count; i++) {
        const seed = phase01(i * 0.618034 + (sparks ? 0.18 : 0));
        const age = phase01(seed + tick / (146 + 100 * phase01(i * 0.129)));
        const x = (phase01(i * 0.38191 + 0.33) - 0.5) * (sparks ? 570 : 690);
        dummy.position.set(x + 23 * Math.sin(age * 9 + i), 462 - 516 * age, -150 + 255 * phase01(i * 0.7168));
        dummy.rotation.set(tick * (0.025 + seed * 0.07) + i, tick * 0.05 + i * 1.31, Math.sin(tick * 0.049 + i) * 1.6);
        const fade = ease(age * 20) * ease((1 - age) * 12);
        const size = fade * (0.65 + seed * 0.71);
        if (sparks) {
          const glint = size * (0.43 + Math.sin(tick * 0.17 + i) ** 4) * 2.5;
          dummy.scale.set(glint, glint * 1.45, glint);
        } else dummy.scale.set(5.2 * size, 13 * size, 6 * size);
        dummy.updateMatrix(); node.setMatrixAt(i, dummy.matrix);
      }
      node.instanceMatrix.needsUpdate = true;
    }
    const settle = ease(tick / 44);
    const viewport = `${this.width}x${this.height}`;
    if (s.viewport !== viewport) {
      const card = document.querySelector('#screen-results .results-card-podium')?.getBoundingClientRect();
      s.safeBottom = card?.height ? clamp((card.top - 12) / this.height, 0.30, 0.55) : 0.46;
      s.viewport = viewport;
    }
    const safeTop = 0.045, tanY = Math.tan(this.camera.fov * Math.PI / 360);
    // Include the front edge of the dais and enough headroom for raised hands at the top of a cheer.
    const bottom = -22, top = s.draw ? 170 : 282;
    const distance = 108 + Math.max(270 / (tanY * this.camera.aspect * 0.91),
      ((top - bottom) * 0.5 + 10) / (tanY * (s.safeBottom - safeTop))) + 74 * (1 - settle);
    const aimY = (top + bottom) * 0.5 - (1 - safeTop - s.safeBottom) * distance * tanY - 13;
    this.camera.position.set(mix(62, 12, settle), aimY + mix(91, 79, settle), distance);
    this.camera.lookAt(0, aimY, 0);
    this.camera.updateMatrixWorld();
    this.sun.position.set(-250, 660, 480);
    this.sun.target.position.set(0, 92, 0);
    if (s.spot) s.spot.intensity = 175000 + 8500 * Math.sin(tick * 0.036);
  }

  _updateCamera(match, options, delta) {
    const active = match.fighters.filter((f) => f.state !== S.DEAD);
    const finishAge = this._finishAge(match), finishDuration = this.finish?.duration || 36;
    const cinematic = this.allowFlash && options.shakeEnabled !== false;
    const finishActive = cinematic && finishAge < finishDuration;
    const reveal = finishActive ? (0.26 + 0.74 * ease(finishAge / 8)) * (1 - ease((finishAge - finishDuration * 0.56) / (finishDuration * 0.44))) : 0;
    const zones = match.stage.blastzones;
    const bounds = match.stage.cameraBounds || zones;
    const aspect = this.camera.aspect, portrait = aspect < 1;
    const deck = (match.surfaces || match.stage.solid)?.[0];
    const closeDeck = portrait && match.stage.id === 'arguefield' && active.length === 2 && deck &&
      active.every((f) => f.grounded && f.x >= deck.x && f.x <= deck.x + deck.w &&
        Math.abs(f.y - getSurfaceY(deck, f.x)) < 4) &&
      Math.abs(active[0].x - active[1].x) < 260;
    let fighters = active;
    // The derby tracks the bag after its launch. Keeping the batter in frame would
    // zoom past the entire arena while the accumulated yardage is still growing.
    if (match.homerun?.launched && match.stage.barrierX != null) {
      const bag = active.find((f) => f.def.id === 'sagging-bag');
      if (bag && bag.x > 360) fighters = [bag];
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const f of fighters) {
      const x = clamp(f.x, bounds.left, bounds.right);
      const y = clamp(f.y, bounds.bottom, bounds.top);
      const sc = f.scale || 1, box = f.hurtbox;
      const halfWidth = Math.max(closeDeck ? 44 : 65, (box?.w ?? f.def.stats.width * sc) * 0.5 + (closeDeck ? 16 : 24));
      const bodyBottom = f.state === S.LEDGE_HANG ? y - f.def.stats.height * sc * 0.78 : y;
      minX = Math.min(minX, x - halfWidth);
      maxX = Math.max(maxX, x + halfWidth);
      minY = Math.min(minY, bodyBottom - 95);
      maxY = Math.max(maxY, y + f.def.stats.height * sc + 90);
    }
    if (!fighters.length) { minX = -300; maxX = 300; minY = -120; maxY = 260; }
    if (match.targets?.some((tg) => !tg.broken)) {
      for (const tg of match.targets) if (!tg.broken) {
        minX = Math.min(minX, tg.x - 65); maxX = Math.max(maxX, tg.x + 65);
        maxY = Math.max(maxY, tg.y + 62); minY = Math.min(minY, tg.y - 62);
      }
    } else if (!closeDeck && fighters.length > 1 && (match.platforms ?? match.stage.platforms)?.length && match.stage.id !== 'sandbag-yard') {
      const highest = Math.max(...(match.platforms ?? match.stage.platforms).map((p) => p.y));
      const focusY = (minY + maxY) * 0.5;
      if (Number.isFinite(highest) && Math.abs(focusY - highest) < 420) maxY = Math.max(maxY, highest + 45);
    }
    const tx = mix(clamp((minX + maxX) * 0.5, bounds.left, bounds.right), this.finish?.x ?? 0, reveal * 0.90);
    const ty = mix(clamp((minY + maxY) * 0.5, bounds.bottom + 48, bounds.top), this.finish?.y ?? 0, reveal * 0.84);
    const halfFov = Math.tan(this.camera.fov * Math.PI / 360);
    const zForY = Math.max(closeDeck ? 300 : 425, maxY - minY) * 0.55 / halfFov;
    const zForX = Math.max(closeDeck ? 160 : portrait ? 280 : 570, maxX - minX) * 0.55 / (halfFov * aspect);
    const zoom = mix(1, 0.65, reveal);
    const maxZ = portrait ? 5600 : 4100;
    const minZ = closeDeck ? 595 : match.stage.id === 'sandbag-yard' ? 685 : 755;
    const tz = clamp(Math.max(zForX, zForY) * zoom, mix(minZ, 555, reveal), maxZ);
    const step = finishActive && finishAge !== this.lastFinishAge ? Math.max(1, delta) : delta;
    this.lastFinishAge = finishAge;
    this.camX = mix(this.camX, tx, 1 - Math.exp(-step * (finishActive || fighters.length === 1 && match.homerun?.launched ? 0.28 : 0.145)));
    this.camY = mix(this.camY, ty, 1 - Math.exp(-step * (finishActive ? 0.24 : 0.12)));
    this.camZ = mix(this.camZ, tz, 1 - Math.exp(-step * (finishActive ? 0.23 : 0.12)));
    if (portrait && !finishActive) {
      // Let the camera ease inward, but pull out immediately if the smoothed pan would clip a fighter.
      const usableWidth = 1 - Math.min(0.15, 36 / this.width);
      const extent = Math.max(this.camX - minX, maxX - this.camX);
      const safeZ = extent / (halfFov * aspect * usableWidth) + 80; // Front of the 3D rigs/deck.
      this.camZ = Math.max(this.camZ, Math.min(maxZ, safeZ));
    }
    const kickAge = this.cameraKick ? match.frame - this.cameraKick.frame : Infinity;
    if (kickAge >= 13) this.cameraKick = null;
    const kick = cinematic ? this.cameraKick : null;
    const decay = kick ? 1 - ease(kickAge / 13) : 0;
    const impulse = kick ? kick.shake * decay * (.33 + .67 * Math.cos(kickAge * 1.42)) : 0;
    const shake = cinematic ? (match.screenShake || 0) * (1 - decay * .50) : 0;
    const dx = shake * Math.sin(match.frame * 2.71) * .64 + (kick ? kick.x * impulse : 0);
    const dy = shake * Math.cos(match.frame * 3.51) * .47 + (kick ? kick.y * impulse : 0);
    this.camera.position.set(this.camX + dx, this.camY + 103 + dy, this.camZ * (1 - (kick?.zoom ?? 0) * decay));
    this.camera.lookAt(this.camX + (kick ? kick.x * impulse * .82 : 0),
      this.camY + (kick ? kick.y * impulse * .82 : 0), 0);
    this.camera.updateMatrixWorld();
    // Compute depth from the arena plane, not the zoom scale. Wide-stage scenery
    // sits farther behind play than small-stage trim, but the fighters never enter the haze.
    const arenaDepth = Math.hypot(this.camera.position.z, 103);
    const hazeStart = match.stage.category === 'huge' || match.stage.id === 'green-greens-suburb' ? 900 : 580;
    this.scene.fog.near = arenaDepth + hazeStart;
    this.scene.fog.far = this.scene.fog.near + 2350;
    this.sky.position.copy(this.camera.position);
    this.sun.position.set(this.camX + 370, this.camY + 790, 540);
    this.sun.target.position.set(this.camX, this.camY - 45, 0);
  }

  render(match, options = {}) {
    options ??= {};
    this.allowFlash = flashesAllowed(options);
    this.portCount = match?.fighters?.length || 0;
    if (this.renderer2d?.fx) this.renderer2d.fx.match = match;
    if (!this.isActive()) {
      if (this.canvas) this.canvas.hidden = true;
      return this.renderer2d?.render(match, options);
    }
    if (!match?.stage) {
      this.overlay?.getContext('2d')?.clearRect(0, 0, this.overlay.width, this.overlay.height);
      return;
    }
    try {
      const mode = options.stagePreview === true ? 'preview' : options.victoryMode === true ? 'victory' : 'battle';
      const viewChanged = mode !== this.viewMode;
      const rigsDirty = this.rigsDirty;
      this.viewMode = mode;
      const changed = this.stageId !== match.stage.id;
      if (changed || this.stagePropsDirty) this._buildStage(match.stage);
      if (rigsDirty) { this._clear(this.fighterMeshes); this.rigsDirty = false; }
      if (this.itemsDirty) { this._clear(this.itemMeshes); this._clear(this.summonMeshes); this.itemsDirty = false; }
      if (this.hazardsDirty) { this._clear(this.hazardMeshes); this.hazardsDirty = false; }
      const first = this.lastTick == null || changed || viewChanged;
      const delta = first ? 6 : clamp(match.frame - this.lastTick, 0, 6);
      this.lastTick = match.frame;
      this.battleGroup.visible = this.fxGroup.visible = mode === 'battle';
      this.stageGroup.visible = this.sky.visible = mode !== 'victory';
      this._updateLighting(mode, match.suddenDeath === true, delta, this._isDraw(match));
      if (mode === 'victory') {
        const fighters = this._victoryOrder(match), now = performance.now();
        const lineup = JSON.stringify([match.winnerPort, match.winningTeam, fighters.map((f) =>
          [f.port, f.fighterId || f.def.id, f.paletteIndex, f.team])]);
        if (!this.showcase || rigsDirty || lineup !== this.showcase.lineup || this.showcase.match !== match) {
          const start = rigsDirty && this.showcase?.lineup === lineup && this.showcase.match === match ? this.showcase.start : now;
          this._remove(this.showcase);
          this.showcase = this._buildShowcase(fighters, match, start);
          this.showcase.lineup = lineup;
          this.showcase.match = match;
        }
        this._updateShowcase(match, fighters, this.allowFlash ? now : this.showcase.start + 1000);
      } else if (this.showcase) {
        this._remove(this.showcase);
        this.showcase = null;
      }
      if (mode === 'preview') {
        this._updateStage(match);
        if (this.warningLane) this.warningLane.visible = false;
        this._updatePreviewCamera();
      } else if (mode === 'battle') this._renderBattle(match, options, delta);
      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
      this._renderOverlay2D(match, options, delta, mode);
    } catch (error) {
      this._fallback(error);
      this.renderer2d?.render(match, options);
    }
  }

  _renderBattle(match, options, delta) {
    if (!this.finish && match.slowMoFrames > 0) this._startFinish(match.dramaticFinish || {}, match);
    this._updateStage(match);
    this._updateCamera(match, options, delta);
    this._syncCalloutFlags(match);
    const ports = new Map();
    const seen = new Set();
    for (const f of match.fighters) {
      const key = `${f.port}:${f.fighterId}:${f.paletteIndex}`;
      if (f.state === S.DEAD) continue;
      seen.add(key);
      let rig = this.fighterMeshes.get(key);
      if (!rig) { rig = this._buildFighter(f); this.fighterMeshes.set(key, rig); }
      this._updateFighter(rig, f, match, delta);
      ports.set(f.port, rig);
    }
    for (const [key, rig] of this.fighterMeshes) if (!seen.has(key)) {
      this._remove(rig);
      this.fighterMeshes.delete(key);
    }
    this._syncEntities(match, ports);
    this._updateEffects(match.frame);
  }

  projectToScreen(wx, wy, wz = 0) {
    if (!this.isActive() || !this.camera) {
      const c = this.renderer2d?.camera;
      return typeof c?.worldToScreen === 'function' ? c.worldToScreen(wx, wy, this.width, this.height)
        : { sx: this.width / 2 + wx, sy: this.height / 2 - wy };
    }
    const v = this.viewPoint.set(wx, wy, wz).project(this.camera);
    return { sx: (v.x * 0.5 + 0.5) * this.width, sy: (0.5 - v.y * 0.5) * this.height };
  }

  _drawFinishBurst(ctx, match, w, h) {
    const age = this._finishAge(match);
    if (age >= (this.finish?.duration ?? 0)) return;
    const p = this.projectToScreen(this.finish.x, this.finish.y, 10);
    const x = clamp(p.sx, w * 0.12, w * 0.88), y = clamp(p.sy, h * 0.16, h * 0.84);
    const t = clamp(age / this.finish.duration);
    const alpha = (1 - ease((t - 0.19) / 0.81)) * (0.75 + 0.25 * Math.cos(age * 0.23));
    const radius = Math.hypot(w, h);
    ctx.save();
    const vignette = ctx.createRadialGradient(x, y, h * 0.14, x, y, radius * 0.70);
    vignette.addColorStop(0, '#5b052000');
    vignette.addColorStop(0.68, '#a10e3450');
    vignette.addColorStop(1, '#760b36e6');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 38; i++) {
      const a = (i + 0.37 * Math.sin(i * 14.87)) * TAU / 38 + t * 0.07;
      const start = h * (0.18 + 0.26 * phase01(i * 0.618) + t * 0.22);
      const end = radius * (0.57 + 0.26 * phase01(i * 0.729));
      const width = (i % 3 ? 0.005 : 0.017) * (1 - t * 0.6);
      const ca = Math.cos(a), sa = Math.sin(a);
      ctx.globalAlpha = alpha * (i % 3 === 0 ? 0.82 : 0.64);
      ctx.fillStyle = i % 3 === 0 ? '#ffdc79' : i % 4 === 0 ? '#ffcfaa' : '#ff305a';
      ctx.beginPath();
      ctx.moveTo(x + ca * start, y + sa * start);
      ctx.lineTo(x + (ca - sa * width) * end, y + (sa + ca * width) * end);
      ctx.lineTo(x + (ca + sa * width) * end, y + (sa - ca * width) * end);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = alpha * (1 - ease(t * 1.5));
    ctx.lineJoin = 'bevel';
    for (let i = 0; i < 9; i++) {
      const a = i * TAU / 9 + 0.23, reach = h * (0.25 + phase01(i * 0.618) * 0.15);
      ctx.beginPath();
      for (let j = 0; j <= 7; j++) {
        const u = j / 7, spread = j % 2 ? 12 + 8 * Math.sin(i + j * 3) : -9;
        const r = reach * (u + 0.10 + t * 0.15);
        const px = x + Math.cos(a) * r - Math.sin(a) * spread * u;
        const py = y + Math.sin(a) * r + Math.cos(a) * spread * u;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = '#ff2e57'; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = '#ffce6c'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = '#fff3c8'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }

  _drawArcadeBanner(ctx, text, x, y, age, life, finishing, w, h) {
    const size = clamp(w * (finishing ? 0.039 : 0.025), finishing ? 25 : 15, finishing ? 47 : 28);
    const progress = clamp(age / life), pop = 0.70 + 0.41 * ease(age / 5) - 0.11 * ease((age - 5) / 7);
    const hue = finishing ? '#ffe686' : /SHINE|PILLAR/.test(text) ? '#8dffff' : /NAPTIME/.test(text) ? '#ffb4df' : '#ffe580';
    ctx.save();
    ctx.font = `italic 1000 ${size}px system-ui, sans-serif`;
    const measured = ctx.measureText(text).width;
    const wide = Math.min(measured + 33, w - 28), tall = size * 1.40;
    ctx.translate(clamp(x, wide * 0.5 + 8, w - wide * 0.5 - 8), clamp(y - 20 * ease(progress), tall + 10, h - tall - 10));
    ctx.rotate(finishing ? -0.085 : -0.042);
    ctx.scale(pop, pop);
    ctx.globalAlpha = 1 - ease((progress - 0.65) / 0.35);
    const panel = (oy) => {
      ctx.beginPath();
      ctx.moveTo(-wide / 2 + 13, -tall / 2 + oy); ctx.lineTo(wide / 2 + 5, -tall / 2 + oy);
      ctx.lineTo(wide / 2 - 11, tall / 2 + oy); ctx.lineTo(-wide / 2 - 5, tall / 2 + oy);
      ctx.closePath();
    };
    panel(4); ctx.fillStyle = '#130d21'; ctx.fill();
    panel(0);
    const gradient = ctx.createLinearGradient(0, -tall * 0.5, 0, tall * 0.5);
    gradient.addColorStop(0, finishing ? '#9b1a3f' : '#523369');
    gradient.addColorStop(1, '#1c142b');
    ctx.fillStyle = gradient; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = hue; ctx.stroke();
    ctx.fillStyle = hue;
    ctx.fillRect(-wide * 0.5 + 12, tall * 0.5 - 4, wide * 0.39, 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = '#211329';
    ctx.strokeText(text, 0, 0, wide - 24); ctx.fillText(text, 0, 0, wide - 24);
    ctx.restore();
  }

  _renderOverlay2D(match, options, delta, mode) {
    const ctx = this.overlay?.getContext('2d');
    if (!ctx) return;
    const w = this.width, h = this.height;
    const label = (text, x, y, color, size = 12, maxWidth = w) => {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${size}px system-ui, sans-serif`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#141027e8';
      ctx.strokeText(text, x, y, maxWidth);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y, maxWidth);
    };
    ctx.save();
    try {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (mode !== 'battle') return;
      if (this.allowFlash && options.shakeEnabled !== false) {
        this._drawFinishBurst(ctx, match, w, h);
        if (match.screenFlash > 0.01) {
          ctx.fillStyle = `rgba(255,245,225,${clamp(match.screenFlash * (this.portCount >= 4 ? .023 : .035), 0, 0.18)})`;
          ctx.fillRect(0, 0, w, h);
        }
      }
      const tags = [];
      for (const f of match.fighters) {
        if (f.state === S.DEAD || fighterHidden(f, specialVisual(f))) continue;
        const sc = f.scale || 1, body = f.def.stats.height * sc;
        const top = this.projectToScreen(f.x, f.y + (f.state === S.LEDGE_HANG ? 27 : body + 28));
        const eye = this.projectToScreen(f.x, f.y + (f.state === S.LEDGE_HANG ? -body * 0.35 : body * 0.55));
        const col = playerColor(f.port);
        const name = fighterTag(f, this.portCount);
        const tell = mittTell(f);
        if (tell) {
          const p = this.projectToScreen(tell.x, tell.y, 42);
          const edge = this.projectToScreen(tell.x + 20, tell.y, 42);
          const zoom = Math.max(.42, Math.abs(edge.sx - p.sx) / 20) * tell.scale;
          ctx.save(); ctx.translate(p.sx, p.sy); ctx.scale(tell.face * zoom, zoom);
          drawMittTell(ctx, tell, !this.allowFlash); ctx.restore();
        }
        let offscreen = eye.sx < 0 || eye.sx > w || eye.sy < 0 || eye.sy > h;
        if (offscreen && f.hurtbox) {
          const box = f.hurtbox;
          const corners = [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]
            .map(([x, y]) => this.projectToScreen(x, y));
          offscreen = corners.every((p) => p.sx < 0) || corners.every((p) => p.sx > w) ||
            corners.every((p) => p.sy < 0) || corners.every((p) => p.sy > h);
        }
        if (offscreen) {
          const x = clamp(eye.sx, 28, w - 28), y = clamp(eye.sy, 28, h - 28);
          const angle = Math.atan2(eye.sy - y, eye.sx - x);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = col; ctx.fillStyle = '#181126e8';
          ctx.beginPath(); ctx.arc(x, y, 19, 0, TAU); ctx.fill(); ctx.stroke();
          const face = getFaceTexture(f.def, f.palette || f.def.palettes[0], isHurt(f) ? 'hurt' : 'normal', this.T, this).image;
          ctx.save();
          ctx.clip();
          ctx.fillStyle = f.palette?.skin || '#ecd9d4';
          ctx.fillRect(x - 17, y - 21, 34, 30);
          ctx.drawImage(face, x - 19, y - 23, 38, 38);
          ctx.restore();
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(angle) * 25, y + Math.sin(angle) * 25);
          ctx.lineTo(x + Math.cos(angle - 0.23) * 18, y + Math.sin(angle - 0.23) * 18);
          ctx.lineTo(x + Math.cos(angle + 0.23) * 18, y + Math.sin(angle + 0.23) * 18);
          ctx.closePath(); ctx.fill();
          label(f.def.id === 'sagging-bag' ? 'BAG' : `P${f.port + 1}`, x, y + 11, '#ffffff', 8);
        } else {
          ctx.font = '900 12px system-ui, sans-serif';
          const width = Math.max(10, Math.min(w - 10, ctx.measureText(name).width));
          const margin = width * 0.5 + 4;
          tags.push({ name, x: clamp(top.sx, margin, w - margin), y: clamp(top.sy, 13, h - 18), width, col, port: f.port });
        }
        if (!options.showHitboxes) continue;
        if (f.hurtbox) {
          const { x, y, w, h } = f.hurtbox;
          const hull = [[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([a,b]) => this.projectToScreen(a, b));
          ctx.beginPath();
          hull.forEach((p, i) => i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy));
          ctx.closePath();
          ctx.strokeStyle = '#5beaff'; ctx.fillStyle = '#43dfff30'; ctx.lineWidth = 1.8;
          ctx.fill(); ctx.stroke();
        }
        for (const hb of f.activeHitboxes || []) {
          const c = this.projectToScreen(hb.x, hb.y), edge = this.projectToScreen(hb.x + hb.r, hb.y);
          ctx.beginPath(); ctx.arc(c.sx, c.sy, Math.max(3, Math.abs(edge.sx - c.sx)), 0, TAU);
          ctx.fillStyle = hb.sweetspot ? '#ffdb616b' : '#ff427b59';
          ctx.strokeStyle = hb.sweetspot ? '#ffdd70' : '#ff4c89';
          ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
        }
      }
      // Keep the lowest label nearest its fighter, then raise the others above it.
      // A tag pinned to the top can spill downward if there is no room above.
      const placed = [], gap = 28;
      for (const tag of tags.sort((a, b) => b.y - a.y || a.port - b.port)) {
        const neighbors = placed.filter((p) => Math.abs(tag.x - p.x) < (tag.width + p.width) * 0.5 + 8);
        const slots = [tag.y, ...neighbors.flatMap((p) => [p.y - gap, p.y + gap])];
        slots.sort((a, b) => Math.abs(a - tag.y) - Math.abs(b - tag.y) || a - b);
        const y = slots.find((slot) => slot >= 13 && slot <= h - 18 && neighbors.every((p) => Math.abs(slot - p.y) >= gap - 0.01));
        if (y != null) tag.y = y;
        placed.push(tag);
        label(tag.name, tag.x, tag.y, '#ffffff', 12, tag.width);
        ctx.fillStyle = tag.col;
        ctx.beginPath();
        ctx.moveTo(tag.x - 5, tag.y + 9); ctx.lineTo(tag.x + 5, tag.y + 9); ctx.lineTo(tag.x, tag.y + 15);
        ctx.closePath(); ctx.fill();
      }
      for (const sm of match.summons || []) {
        const p = this.projectToScreen(sm.x, sm.y + 62);
        label(sm.critter?.name || 'CRITTER', p.sx, p.sy, sm.critter?.color || '#ffe39a');
      }
      const hazard = match.hazards?.find((h) => h.warningFrames > 0);
      if (hazard) {
        const notice = { pizzaVan: 'PIZZA VAN INCOMING', fineRocket: 'HOA FINE INCOMING', starshipLaser: 'LASER CHARGING' }[hazard.kind] || 'HAZARD INCOMING';
        label(`${hazard.vx > 0 ? '▶ ' : ''}${notice}${hazard.vx < 0 ? ' ◀' : ''}`, w * 0.5, h * 0.14,
          hazard.kind === 'starshipLaser' ? '#8bf3ff' : '#ffab75', 16);
      }
      const fx = this.renderer2d?.fx;
      if (fx) {
        if (match.status !== 'paused') for (let i = 0; i < Math.min(delta, 3); i++) fx.update();
        for (const c of fx.callouts) {
          if (this.arcadeFx.has(c)) continue;
          const p = this.projectToScreen(c.x, c.y);
          ctx.save();
          ctx.globalAlpha = clamp((c.life / c.maxLife) * 2.2);
          ctx.translate(p.sx, p.sy);
          ctx.scale(c.scale || 1, c.scale || 1);
          if (c.bg) {
            ctx.font = '900 16px system-ui, sans-serif';
            const wide = ctx.measureText(c.text).width + 18;
            ctx.fillStyle = c.bg; ctx.strokeStyle = c.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(-wide / 2, -13, wide, 26, 6);
            else ctx.rect(-wide / 2, -13, wide, 26);
            ctx.fill(); ctx.stroke();
          }
          label(c.text, 0, 0, c.color, 16);
          ctx.restore();
        }
      }
      this.comboBanners = this.comboBanners.filter((banner) => match.frame - banner.frame < 58);
      this.comboBanners.forEach((banner, i) => {
        const p = this.projectToScreen(banner.x, banner.y + 83, 22);
        this._drawArcadeBanner(ctx, banner.text, p.sx, p.sy - (this.comboBanners.length - i - 1) * clamp(w * 0.036, 25, 43),
          match.frame - banner.frame, 58, false, w, h);
      });
      this.matchBanners = this.matchBanners.filter((banner) => match.frame - banner.frame < banner.life);
      const hudSuddenDeath = this.overlay.ownerDocument.getElementById('hud-banner');
      const visibleBanners = this.matchBanners.filter(({ kind }) =>
        kind !== 'suddenDeath' || !hudSuddenDeath?.matches('.sudden-death:not([hidden])') || !!hudSuddenDeath.closest('[hidden]'));
      visibleBanners.forEach((banner, i) => {
        this._drawArcadeBanner(ctx, banner.text, w * 0.5, h * 0.20 + i * clamp(w * 0.046, 36, 62),
          match.frame - banner.frame, banner.life, i === 0, w, h);
      });
      const age = this._finishAge(match);
      if (age < (this.finish?.duration ?? 0)) {
        const p = this.projectToScreen(this.finish.x, this.finish.y + 77, 15);
        this._drawArcadeBanner(ctx, 'FINISH!!', p.sx, p.sy, age, this.finish.duration, true, w, h);
      }
    } finally {
      ctx.restore();
    }
  }
}
