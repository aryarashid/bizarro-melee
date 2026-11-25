/**
 * Dynamic Melee Camera & 2D Canvas Particle/FX System.
 * Simulation coordinates are Y-up (y=0 deck, y>0 up); canvas draws at (wx, -wy).
 */

import { MOVE as M, STATE, PLAYER_COLORS } from './constants.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const upStrikes = new Set([M.UTILT, M.USMASH, M.UAIR, M.UP_B, M.UTHROW]);
const downStrikes = new Set([M.DAIR, M.DTHROW]);
const rearStrikes = new Set([M.BAIR, M.BTHROW]);
const wideStrikes = new Set([M.FSMASH, M.USMASH, M.DSMASH, M.FAIR, M.BAIR, M.DAIR, M.UAIR, M.NAIR, M.ITEM_SWING]);
const nonMelee = new Set(['projectile', 'chargeShot', 'itemShot', 'itemThrow']);
const hurt = new Set([STATE.HITSTUN, STATE.TUMBLE, STATE.KNOCKDOWN, STATE.GRABBED, STATE.SHIELD_BREAK]);
export const victimFlashes = (f) => f.hitlag > 0 && (hurt.has(f.state) || f.sleepTimer > 0);

// Shared palette, attack aim and special-event projection keep both views in sync.
export const combatPaint = {
  fire: ['#ff531f', '#fff4b0', '#ffab32'], electric: ['#00bcff', '#efffff', '#67f5ff'],
  psychic: ['#ac50ff', '#fff0ff', '#f499ff'], dark: ['#973fda', '#fbe5ff', '#e17bff'],
  kinetic: ['#e99236', '#fffef4', '#ffe4a3'], blade: ['#329dff', '#f7ffff', '#a7e4ff'],
  unarmed: ['#748cff', '#ffffff', '#dce6ff'],
};

function moveStyle(f) {
  const d = f.moveData, name = `${f.fighterId || f.def?.id || ''} ${d?.name || ''}`;
  const element = f.activeHitboxes?.[0]?.data?.element || d?.element;
  if (['electric', 'lightning'].includes(element) || /knee of bread|peak-a-chew|chikapu|spitzu|quick-zip|double-zip/i.test(name) || d?.style === 'electric' || d?.kind === 'reflector') return 'electric';
  if (element === 'fire' || d?.style === 'fire' || f.def?.rig?.prop === 'fireBroom' || /fire|pigeon|spite|propane|charcoal|blazer/i.test(name)) return 'fire';
  if (Object.hasOwn(combatPaint, d?.style)) return d.style;
  if (d?.kind === 'teleport' || /PK-Rocket/i.test(name)) return 'psychic';
  if (f.moveKey === M.ITEM_SWING || ['yardstick', 'wrench', 'spatula'].includes(f.def?.rig?.prop)) return 'blade';
  return 'unarmed';
}

export function attackVisual(f) {
  const d = f.moveData, key = f.moveKey;
  if (!(f.state === STATE.ATTACK || f.state === STATE.THROW) || !d || f.charging || f.vanished ||
      f.specialPhase === 'charge' || f.specialPhase === 'vanish') return null;
  const age = (f.moveFrame || 0) - (d.startup || 1), duration = d.active || 4;
  if (age < 0 || age >= duration) return null;
  const face = f.facing || 1, side = rearStrikes.has(key) ? -face : face;
  const spike = downStrikes.has(key) || d.meteor && key === M.DOWN_B;
  const angle = upStrikes.has(key) ? Math.PI / 2 - face * .21 : spike ? -Math.PI / 2 + face * .19
    : side > 0 ? (key === M.DTILT || key === M.DSMASH ? -.31 : .12) : Math.PI + (key === M.DTILT || key === M.DSMASH ? .31 : -.12);
  const radial = key === M.NAIR || key === M.DSMASH || d.bothSides || ['spin', 'reflector', 'stone', 'rest'].includes(d.kind);
  const height = (f.def?.stats?.height || 70) * (f.scale || 1);
  const box = f.activeHitboxes?.[0], weight = wideStrikes.has(key) || f.state === STATE.THROW;
  const reach = Math.min(95, Math.max(48, (box?.r || d.radius || 23) * .72 + (weight ? 57 : 38)));
  const x = radial ? f.x : box?.x ?? f.x + Math.cos(angle) * height * .55;
  const y = radial ? f.y + height * .52 : box?.y ?? f.y + height * .53 + Math.sin(angle) * height * .39;
  return { x, y, angle, radial, reach, age, duration, melee: !nonMelee.has(d.kind), style: moveStyle(f),
    limb: key === M.JAB2 ? 'offGrip' : key === M.BAIR ? 'offFoot' : d.name === 'Knee of Bread' ? 'knee'
      : [M.NAIR, M.UAIR, M.DAIR, M.DTILT].includes(key) || /kick/i.test(d.name || '') ? 'foot' : 'grip' };
}

export function specialVisual(f) {
  const d = f.moveData, name = d?.name || '';
  const explicit = f.specialPhase != null || f.specialChargeStyle != null || f.specialCharge > 0 || Number.isFinite(f.specialLaunchAngle) || f.vanished === true;
  // The field/event contract wins. Older matches only carry recovery/dash move data.
  const illusion = d?.technique === 'illusion' || /illusion|phantasm/i.test(name);
  const zip = d?.technique === 'quickAttack' || /quick-zip|double-zip/i.test(name);
  const warp = d?.kind === 'teleport' || d?.technique === 'teleport360';
  const rocket = ['chargeLaunch', 'chargeMissile'].includes(d?.technique) || /fire[- ](?:faux|toucan)|PK-Rocket|misfire|hamster rocket/i.test(name);
  const age = (f.moveFrame || 0) - (d?.startup || 1);
  const legacy = !explicit && f.state === STATE.ATTACK && (illusion || zip || warp || rocket);
  const phase = f.specialPhase ?? (explicit ? (f.vanished ? 'vanish' : f.specialCharge > 0 ? 'charge' : null)
    : legacy && age < (d.active || 4) ? age < 0 ? 'charge' : warp ? (age < 3 ? 'vanish' : null) : zip ? 'zip1' : 'launch' : null);
  if (!phase) return null;
  const style = Object.hasOwn(combatPaint, f.specialChargeStyle) ? f.specialChargeStyle : zip ? 'electric' : warp ? 'psychic'
    : illusion ? 'blade' : /PK-Rocket/i.test(name) ? 'psychic' : rocket ? 'fire' : 'kinetic';
  const aimX = f.specialAimX || 0, side = f.facing || 1;
  const vertical = f.moveKey === M.UP_B;
  const angle = Number.isFinite(f.specialLaunchAngle) ? f.specialLaunchAngle : phase === 'charge'
    ? Math.atan2(f.specialAimY ?? (vertical ? 1 : 0), vertical ? aimX : side)
    : Math.hypot(f.vx || 0, f.vy || 0) > .3 ? Math.atan2(f.vy || 0, f.vx || 0) : vertical ? Math.PI / 2 : side < 0 ? Math.PI : 0;
  const flight = !warp && !['powerPunch', 'chargePunch'].includes(d?.kind);
  return { phase, style, angle, age, legacy, illusion, zip, warp, rocket, flight,
    charge: clamp01(f.specialCharge ?? ((f.moveFrame || 0) / (d?.startup || 1))) };
}

export const fighterHidden = (f, special) => f.vanished ?? (special?.legacy && special.phase === 'vanish');

export function specialEventVisual(e, match) {
  if (!['specialCharge', 'specialLaunch', 'afterimage', 'quickZip', 'teleportFlash'].includes(e.type)) return null;
  const f = match?.fighters?.find((f) => f.port === (e.port ?? e.fighterPort ?? e.attackerPort));
  const special = f && specialVisual(f), h = (f?.def?.stats?.height || 70) * (f?.scale || 1);
  const style = e.style ?? e.element ?? e.specialChargeStyle ?? special?.style ??
    (e.type === 'quickZip' ? 'electric' : e.type === 'teleportFlash' ? 'psychic' : e.type === 'afterimage' ? 'blade' : 'fire');
  const [rim, core, spark] = Object.hasOwn(combatPaint, style) ? combatPaint[style] : combatPaint.kinetic;
  const y = e.y ?? f?.y ?? 0;
  return { ...e, f, rim, core, spark, h, x: e.x ?? f?.x ?? 0, y, cy: y + h * .5,
    angle: e.launchAngle ?? e.angle ?? special?.angle ?? (f?.facing < 0 ? Math.PI : 0),
    inwards: e.phase === 'vanish' || e.phase === 'out' || e.vanished === true || e.reappear === false };
}

export function chargePulse(e, tick, samples) {
  if (!e.f || !Number.isFinite(e.progress)) return true;
  const prior = samples.get(e.f.port);
  samples.set(e.f.port, { tick, progress: e.progress });
  return !prior || tick - prior.tick > 2 || [0.45, 0.86].some((mark) => prior.progress < mark && e.progress >= mark);
}

export function legacySpecialEvents(f, special, previous, emit) {
  if (!special?.legacy && !previous?.special?.legacy) return;
  const phase = special?.phase, prior = previous?.special?.phase;
  const p = { port: f.port, x: f.x, y: f.y, style: special?.style ?? previous?.special?.style, angle: special?.angle };
  if (special?.warp && phase === 'vanish' && prior !== phase) emit({ ...p, type: 'teleportFlash', phase: 'vanish' });
  if (prior === 'vanish' && phase !== prior) emit({ ...p, type: 'teleportFlash', phase: 'reappear' });
  if (special?.illusion && phase === 'launch') emit({ ...p, type: 'afterimage', x: previous?.x ?? f.x, y: previous?.y ?? f.y });
  if (special?.zip && phase === 'zip1' && previous && (prior !== phase || special.age === 3)) {
    emit({ ...p, type: 'quickZip', fromX: previous.x, fromY: previous.y + f.def.stats.height * .5,
      toX: f.x, toY: f.y + f.def.stats.height * .5 });
  }
  if (special?.rocket && phase === 'launch' && prior !== phase) {
    emit({ ...p, type: 'specialLaunch', misfire: Boolean(f.moveData?.misfireChance && f.moveData !== f.def.moves?.[f.moveKey] && f.moveData?.sweetspot) });
  }
}

export function zipPoints(fromX, fromY, toX, toY) {
  const dx = toX - fromX, dy = toY - fromY, len = Math.hypot(dx, dy) || 1;
  return [0, .14, .30, .44, .59, .73, .89, 1].map((t, i) => {
    const s = [0, .85, -.66, 1, -.92, .68, -.42, 0][i] * Math.min(32, len * .21);
    return [fromX + dx * t - dy / len * s, fromY + dy * t + dx / len * s];
  });
}

export class DynamicCamera {
  constructor() {
    this.x = 0;
    this.y = 110;
    this.zoom = 0.85;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  reset(stage) {
    this.x = 0;
    this.y = 110;
    this.zoom = 0.82;
    this.shakeX = 0;
    this.shakeY = 0;
    if (stage?.id === 'sandbag-yard') {
      this.x = 80;
      this.y = 90;
    }
  }

  update(fighters, stage, viewportW, viewportH, screenShake = 0, derbyBag = null, targets = null) {
    if (derbyBag) {
      const targetY = derbyBag.y + derbyBag.def.stats.height * 0.5;
      const targetZoom = Math.min(1.22, viewportW / 1100, viewportH / 480);
      this.zoom += (targetZoom - this.zoom) * 0.12;
      // Keep the flight in frame even on a narrow viewport or after a skipped draw.
      // The normal camera bounds end before the derby's runway does.
      const maxLagX = viewportW * 0.22 / this.zoom;
      const maxLagY = viewportH * 0.20 / this.zoom;
      this.x = derbyBag.x + Math.max(-maxLagX, Math.min(maxLagX, (this.x - derbyBag.x) * 0.72));
      this.y = targetY + Math.max(-maxLagY, Math.min(maxLagY, (this.y - targetY) * 0.76));
    } else {
      this._frameFighters(fighters, stage, viewportW, viewportH, targets);
    }

    if (screenShake > 0.2) {
      this.shakeX = (Math.random() - 0.5) * screenShake * 2.2;
      this.shakeY = (Math.random() - 0.5) * screenShake * 2.2;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  _frameFighters(fighters, stage, viewportW, viewportH, targets = null) {
    const active = (fighters || []).filter((f) => f.state !== STATE.DEAD);
    let minX = -320;
    let maxX = 320;
    let minY = -20;
    let maxY = 260;

    if (active.length > 0) {
      minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
      for (const f of active) {
        const halfW = (f.def?.stats?.width || 44) * 0.8 + 140;
        const h = (f.def?.stats?.height || 72) + 120;
        if (f.x - halfW < minX) minX = f.x - halfW;
        if (f.x + halfW > maxX) maxX = f.x + halfW;
        if (f.y - 70 < minY) minY = f.y - 70;
        if (f.y + h > maxY) maxY = f.y + h;
      }
      if (Array.isArray(targets)) {
        for (const t of targets) {
          if (t.broken) continue;
          const pad = (t.r || 28) + 56;
          if (t.x - pad < minX) minX = t.x - pad;
          if (t.x + pad > maxX) maxX = t.x + pad;
          if (t.y - pad < minY) minY = t.y - pad;
          if (t.y + pad > maxY) maxY = t.y + pad;
        }
      }
    }

    const bounds = stage?.cameraBounds || { left: -900, right: 900, top: 680, bottom: -380 };
    const cx = Math.max(bounds.left, Math.min(bounds.right, (minX + maxX) * 0.5));
    const cy = Math.max(bounds.bottom + 120, Math.min(bounds.top - 80, (minY + maxY) * 0.5));

    const spanX = Math.max(540, maxX - minX);
    const spanY = Math.max(360, maxY - minY);
    const zx = (viewportW * 0.86) / spanX;
    const zy = (viewportH * 0.78) / spanY;
    const targetZoom = Math.max(0.36, Math.min(1.22, Math.min(zx, zy)));

    this.x += (cx - this.x) * 0.14;
    this.y += (cy - this.y) * 0.14;
    this.zoom += (targetZoom - this.zoom) * 0.12;
  }

  worldToScreen(wx, wy, viewportW, viewportH) {
    const sx = viewportW * 0.5 + (wx - this.x) * this.zoom + this.shakeX;
    const sy = viewportH * 0.56 + (-wy + this.y) * this.zoom + this.shakeY;
    return { sx, sy };
  }

  applyTransform(ctx, viewportW, viewportH) {
    ctx.translate(viewportW * 0.5 + this.shakeX, viewportH * 0.56 + this.shakeY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, this.y);
  }
}

export class FxSystem {
  constructor() {
    this.particles = [];
    this.rings = [];
    this.beams = [];
    this.callouts = [];
    this.starKOs = [];
    this.combat = [];
    this.specialSamples = new Map();
    this.hitColors = new Map();
    this.chargeSamples = new Map();
  }

  clear() {
    this.particles.length = 0;
    this.rings.length = 0;
    this.beams.length = 0;
    this.callouts.length = 0;
    this.starKOs.length = 0;
    this.combat.length = 0;
    this.specialSamples.clear();
    this.hitColors.clear();
    this.chargeSamples.clear();
    this.sampleFrame = null;
  }

  attachClassic(renderer) {
    if (this.classic || !renderer?._drawFighter) return;
    this.classic = renderer;
    const drawFighter = renderer._drawFighter;
    const drawBody = renderer._drawFighterBody;
    renderer._drawFighter = (ctx, f, match, options) => {
      if (!fighterHidden(f, specialVisual(f))) drawFighter.call(renderer, ctx, f, match, options);
    };
    renderer._drawFighterBody = (ctx, f, ...args) => {
      if (!victimFlashes(f)) return drawBody.call(renderer, ctx, f, ...args);
      ctx.save();
      try {
        const electric = this.hitColors.get(f.port) === true;
        ctx.translate((f.hitlag % 2 ? 1 : -1) * (electric ? 11 : 8), 0);
        ctx.filter = f.hitlag % 2 ? `brightness(0) invert(1)${electric ? ' sepia(1) saturate(4) hue-rotate(136deg)' : ''}`
          : 'brightness(2.1) saturate(.55)';
        drawBody.call(renderer, ctx, f, ...args);
      } finally { ctx.restore(); }
    };
  }

  _cue(p, life) {
    if (this.combat.length >= 80) this.combat.shift();
    this.combat.push({ ...p, life, maxLife: life });
  }

  _specialEvent(e, match) {
    const p = specialEventVisual(e, match);
    if (!p) return false;
    if (e.type === 'quickZip') {
      if ([e.fromX, e.fromY, e.toX, e.toY].every(Number.isFinite)) {
        this._cue({ ...p, points: zipPoints(e.fromX, e.fromY, e.toX, e.toY) }, 12);
      }
    } else if (e.type === 'afterimage') this._cue(p, 14);
    else if (e.type === 'specialCharge') {
      if (chargePulse(p, match?.frame ?? 0, this.chargeSamples)) this._cue(p, 13);
    }
    else {
      const warp = e.type === 'teleportFlash', blast = e.misfire ? 149 : warp ? 96 : 89;
      this._cue(p, warp ? 19 : 14);
      if (!p.inwards) this.rings.push({ x: p.x, y: p.cy, r: 14, maxR: blast, life: 19, maxLife: 19, color: p.spark, lineWidth: 8 });
      for (let i = 0; i < (e.misfire ? 25 : 14); i++) {
        const a = i * 2.399, v = 3 + i % 8;
        this.particles.push({ x: p.x + (p.inwards ? Math.cos(a) * 55 : 0), y: p.cy + (p.inwards ? Math.sin(a) * 55 : 0),
          vx: Math.cos(a) * (p.inwards ? -3.6 : v), vy: Math.sin(a) * (p.inwards ? -3.6 : v), size: 4 + i % 4,
          life: 14, maxLife: 14, color: i % 3 ? p.spark : p.core });
      }
    }
    return true;
  }

  spawnTrail(x, y, color = '#ffffff', size = 10) {
    if (this.particles.length > 260) return;
    this.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 1.4,
      vy: (Math.random() - 0.5) * 1.4,
      life: 16, maxLife: 16,
      size, color, back: true,
    });
  }

  ingestEvents(events, match) {
    this.match = match;
    for (const e of events) {
      if (this._specialEvent(e, match)) continue;
      switch (e.type) {
        case 'hit': {
          const heavy = e.heavy || e.sweetspot || e.meteor || (e.kb || 0) >= 95;
          const count = heavy ? 32 : 17;
          const color = e.electric ? '#38f5ff' : (e.sweetspot ? '#ffdf4d' : (e.meteor ? '#ff4b72' : (e.slash ? '#bae6fd' : '#ffab52')));
          const victim = match?.fighters?.find((f) => f.port === e.victimPort);
          const baseAngle = Number.isFinite(e.angle) ? e.angle * Math.PI / 180 : Math.atan2(victim?.kbVy || 0, victim?.kbVx || 1);
          if (e.victimPort != null) this.hitColors.set(e.victimPort, Boolean(e.electric));
          this._cue({ type: 'impact', x: e.x, cy: e.y, angle: baseAngle, rim: color, core: '#ffffff',
            reach: 52 + 83 * clamp01((e.kb || 0) / 175) }, heavy ? 13 : 9);
          for (let i = 0; i < count; i++) {
            const a = (baseAngle != null && i < count * 0.72)
              ? baseAngle + (Math.random() - 0.5) * 0.9
              : Math.random() * Math.PI * 2;
            const sp = (heavy ? 7.5 : 4.2) + Math.random() * (heavy ? 12 : 8);
            this.particles.push({
              x: e.x, y: e.y,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 14 + Math.floor(Math.random() * 12),
              maxLife: 26,
              size: (heavy ? 7.5 : 4.5) + Math.random() * 4,
              color: i % 3 === 0 ? '#ffffff' : (e.electric && i % 2 === 0 ? '#ffdf4d' : color),
              back: false,
            });
          }
          this.rings.push({
            x: e.x, y: e.y, r: heavy ? 26 : 13, maxR: heavy ? 154 : 81,
            life: heavy ? 18 : 12, maxLife: heavy ? 18 : 12, color, lineWidth: heavy ? 9 : 5,
          });
          if (e.sweetspot || e.meteor || (e.electric && heavy)) {
            this.callouts.push({
              x: e.x, y: e.y + 44,
              text: e.meteor ? 'METEOR!' : (e.electric ? 'ZAP CRUNCH!' : 'CRUNCH!'),
              color: e.meteor ? '#ff4b72' : (e.electric ? '#38f5ff' : '#ffdf4d'),
              life: 32, maxLife: 32, scale: 1.3,
            });
          }
          break;
        }
        case 'shieldHit':
          this.rings.push({
            x: e.x, y: e.y, r: 16, maxR: 58,
            life: 10, maxLife: 10, color: '#7ce8ff', lineWidth: 3,
          });
          break;
        case 'shieldBreak':
          this.rings.push({
            x: e.x, y: e.y, r: 10, maxR: 120,
            life: 20, maxLife: 20, color: '#ff4b72', lineWidth: 6,
          });
          this.callouts.push({
            x: e.x, y: e.y + 60, text: 'SHIELD BREAK!', color: '#ff4b72', life: 45, maxLife: 45, scale: 1.3,
          });
          break;
        case 'wavedash':
          for (let i = 0; i < 7; i++) {
            this.particles.push({
              x: e.x, y: e.y + 4,
              vx: -(e.dir || 1) * (3 + Math.random() * 5),
              vy: 1 + Math.random() * 2.5,
              life: 16, maxLife: 16, size: 6 + Math.random() * 4,
              color: 'rgba(220, 245, 255, 0.85)', back: true,
            });
          }
          break;
        case 'lCancel':
          this.rings.push({
            x: e.x, y: e.y + 18, r: 10, maxR: 46,
            life: 10, maxLife: 10, color: '#ffffff', lineWidth: 3,
          });
          break;
        case 'jump':
          this.rings.push({
            x: e.x, y: e.y, r: 8, maxR: e.doubleJump ? 42 : 28,
            life: 10, maxLife: 10, color: e.doubleJump ? '#7ce8ff' : '#ffffff', lineWidth: 2.5,
          });
          break;
        case 'land':
          for (let i = -1; i <= 1; i += 2) {
            this.particles.push({
              x: e.x + i * 10, y: e.y + 3,
              vx: i * 3.2, vy: 1.5,
              life: 12, maxLife: 12, size: 6, color: 'rgba(255,255,255,0.7)', back: true,
            });
          }
          break;
        case 'ledgeGrab':
          this.rings.push({
            x: e.x, y: e.y, r: 6, maxR: 34,
            life: 10, maxLife: 10, color: '#ffdf4d', lineWidth: 3,
          });
          break;
        case 'shine':
          this.rings.push({
            x: e.x, y: e.y + 34, r: 16, maxR: 62,
            life: 10, maxLife: 10, color: '#38f5ff', lineWidth: 5, hex: true,
          });
          break;
        case 'taunt':
          this.callouts.push({
            x: e.x, y: e.y + 92,
            text: String(e.text || 'HEY!'),
            color: '#ffffff',
            bg: 'rgba(16, 14, 38, 0.9)',
            life: 64, maxLife: 64, scale: 0.95,
          });
          break;
        case 'judge':
          this.callouts.push({
            x: e.x, y: e.y + 84,
            text: e.num === 9 ? 'JUDGE 9!!' : `JUDGE ${e.num}`,
            color: e.num === 9 ? '#ffdf4d' : '#ffffff',
            bg: e.num === 9 ? '#ff2e4c' : '#111827',
            life: 45, maxLife: 45, scale: e.num === 9 ? 1.5 : 1.05,
          });
          break;
        case 'homerunPing':
          this.rings.push({ x: e.x, y: e.y, r: 12, maxR: 150, life: 20, maxLife: 20, color: '#ffdf4d', lineWidth: 7 });
          this.callouts.push({ x: e.x, y: e.y + 64, text: 'PING!! HOME RUN!', color: '#ffdf4d', bg: '#7a1800', life: 48, maxLife: 48, scale: 1.4 });
          break;
        case 'powershield':
          this.rings.push({ x: e.x, y: e.y + 34, r: 18, maxR: 85, life: 14, maxLife: 14, color: '#38f5ff', lineWidth: 5 });
          this.callouts.push({ x: e.x, y: e.y + 82, text: 'POWER SHIELD!', color: '#38f5ff', bg: 'rgba(10,18,40,0.9)', life: 34, maxLife: 34, scale: 1.05 });
          break;
        case 'explosion':
          this.rings.push({ x: e.x, y: e.y, r: 14, maxR: e.radius || 140, life: 22, maxLife: 22, color: '#ff7b24', lineWidth: 8 });
          for (let i = 0; i < 22; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 5 + Math.random() * 12;
            this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 22, maxLife: 22, size: 10, color: i % 2 ? '#ffdf4d' : '#ff4b5c', back: false });
          }
          break;
        case 'summon':
          this.callouts.push({ x: e.x, y: e.y + 76, text: `${e.name || 'CRITTER'}!`, color: '#ffdf4d', bg: 'rgba(60,16,96,0.92)', life: 52, maxLife: 52, scale: 1.15 });
          break;
        case 'targetBreak':
          this.rings.push({ x: e.x, y: e.y, r: 8, maxR: 68, life: 14, maxLife: 14, color: '#ff4b72', lineWidth: 5 });
          this.callouts.push({ x: e.x, y: e.y + 42, text: e.remaining === 0 ? 'COMPLETE!' : `${e.remaining} LEFT!`, color: '#ffdf4d', life: 34, maxLife: 34, scale: 1.1 });
          break;
        case 'walljump':
          this.rings.push({ x: e.x, y: e.y + 30, r: 6, maxR: 38, life: 10, maxLife: 10, color: '#7ce8ff', lineWidth: 3 });
          break;
        case 'comboCallout':
          this.rings.push({ x: e.x, y: e.y + 30, r: 16, maxR: 115, life: 18, maxLife: 18, color: '#ffdf4d', lineWidth: 5 });
          this.callouts.push({
            x: e.x, y: e.y + 92,
            text: String(e.text || 'COMBO!'),
            color: '#ffdf4d',
            bg: 'rgba(180, 22, 66, 0.94)',
            life: 58, maxLife: 58, scale: 1.35,
          });
          break;
        case 'tech':
          if (e.tech === 'SHIELD DROP' || e.tech === 'EDGE CANCEL' || e.tech === 'SHFFL' || e.tech === 'JC GRAB' || e.tech === 'JC UPSMASH' || e.tech === 'B-REVERSE') {
            this.rings.push({ x: e.x, y: e.y + 24, r: 8, maxR: 48, life: 12, maxLife: 12, color: '#38f5ff', lineWidth: 3.5 });
          }
          break;
        case 'dramaticFinish':
          this.rings.push({ x: e.x, y: e.y, r: 20, maxR: 260, life: 36, maxLife: 36, color: '#ff2e4c', lineWidth: 10 });
          this.callouts.push({
            x: e.x, y: e.y + 70,
            text: 'FINISH!!',
            color: '#ffdf4d',
            bg: '#991122',
            life: 52, maxLife: 52, scale: 1.65,
          });
          break;
        case 'stageTransform':
          this.rings.push({ x: 0, y: 120, r: 30, maxR: 340, life: 36, maxLife: 36, color: '#38f5ff', lineWidth: 8 });
          this.callouts.push({
            x: 0, y: 210,
            text: `${String(e.name || 'STAGE')}!`,
            color: '#ffdf4d',
            bg: 'rgba(18, 28, 72, 0.94)',
            life: 72, maxLife: 72, scale: 1.45,
          });
          break;
        case 'warpPipe':
          this.rings.push({ x: e.x || 0, y: (e.y || 0) + 24, r: 10, maxR: 72, life: 16, maxLife: 16, color: '#42e695', lineWidth: 5 });
          break;
        case 'barrelLaunch':
          this.rings.push({ x: e.x || 0, y: e.y || -120, r: 16, maxR: 120, life: 20, maxLife: 20, color: '#ffdf4d', lineWidth: 7 });
          this.callouts.push({ x: e.x || 0, y: (e.y || -120) + 56, text: 'BLAST OFF!', color: '#ffdf4d', bg: 'rgba(120, 48, 10, 0.92)', life: 36, maxLife: 36, scale: 1.15 });
          break;
        case 'suddenDeath':
          this.rings.push({ x: 0, y: 120, r: 24, maxR: 320, life: 40, maxLife: 40, color: '#ff2e4c', lineWidth: 12 });
          this.callouts.push({
            x: 0, y: 190,
            text: 'SUDDEN DEATH! 300%',
            color: '#ffdf4d',
            bg: 'rgba(170, 14, 34, 0.96)',
            life: 78, maxLife: 78, scale: 1.65,
          });
          break;
        case 'doubleKo':
        case 'tripleKo':
        case 'zeroToDeath':
        case 'meteorKo': {
          const label = e.text || (e.type === 'tripleKo' ? 'TRIPLE KO!' : e.type === 'doubleKo' ? 'DOUBLE KO!' : e.type === 'zeroToDeath' ? 'ZERO-TO-DEATH!' : 'METEOR KO!');
          const bg = e.type === 'zeroToDeath' ? 'rgba(130, 18, 170, 0.95)' : (e.type === 'meteorKo' ? 'rgba(180, 24, 52, 0.95)' : 'rgba(18, 36, 98, 0.95)');
          this.rings.push({ x: e.x || 0, y: (e.y || 80), r: 18, maxR: 170, life: 24, maxLife: 24, color: '#ffdf4d', lineWidth: 7 });
          this.callouts.push({
            x: Math.max(-360, Math.min(360, e.x || 0)),
            y: Math.max(-40, Math.min(280, (e.y || 80) + 60)),
            text: label,
            color: '#ffdf4d',
            bg,
            life: 64, maxLife: 64, scale: 1.45,
          });
          break;
        }
        case 'ko': {
          const col = PLAYER_COLORS[(e.port || 0) % PLAYER_COLORS.length];
          this.beams.push({
            x: e.x, y: e.y, dir: e.dir || 'right', color: col, life: 28, maxLife: 28,
          });
          for (let i = 0; i < 28; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 5 + Math.random() * 14;
            this.particles.push({
              x: e.x, y: e.y,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 24 + Math.floor(Math.random() * 14), maxLife: 38,
              size: 7 + Math.random() * 6,
              color: i % 2 === 0 ? '#ffffff' : col, back: false,
            });
          }
          if (e.star) {
            this.starKOs.push({ x: e.x, y: e.y, life: 42, maxLife: 42, color: col });
          }
          break;
        }
      }
    }
    if (this.particles.length > 320) {
      this.particles.splice(0, this.particles.length - 320);
    }
  }

  update() {
    for (let i = this.combat.length - 1; i >= 0; i--) if (--this.combat[i].life <= 0) this.combat.splice(i, 1);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life--;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life--;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].life--;
      if (this.beams[i].life <= 0) this.beams.splice(i, 1);
    }
    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const c = this.callouts[i];
      c.y += 0.6;
      c.life--;
      if (c.life <= 0) this.callouts.splice(i, 1);
    }
    for (let i = this.starKOs.length - 1; i >= 0; i--) {
      this.starKOs[i].life--;
      if (this.starKOs[i].life <= 0) this.starKOs.splice(i, 1);
    }
  }

  drawBack(ctx) {
    const match = this.match;
    if (match && this.sampleFrame !== match.frame) {
      this.sampleFrame = match.frame;
      for (const f of match.fighters || []) {
        if (f.state === STATE.DEAD) { this.specialSamples.delete(f.port); continue; }
        const special = specialVisual(f);
        legacySpecialEvents(f, special, this.specialSamples.get(f.port), (e) => this._specialEvent(e, match));
        this.specialSamples.set(f.port, { special, x: f.x, y: f.y });
        const speed = Math.hypot(f.kbVx || 0, f.kbVy || 0);
        if (speed >= 14 && !f.grounded && !f.hitlag && hurt.has(f.state) && match.frame % 2 === 0) {
          const angle = Math.atan2(f.kbVy || 0, f.kbVx || 0);
          const x = f.x - Math.cos(angle) * 32, cy = f.y + f.def.stats.height * (f.scale || 1) * .52 - Math.sin(angle) * 32;
          this._cue({ type: 'launchTrail', x, cy, angle, reach: Math.min(112, speed * 2.8),
            rim: this.hitColors.get(f.port) ? '#58e8ff' : '#ffae59' }, 11);
          this.spawnTrail(x, cy, '#f2e5e2', Math.min(46, 22 + speed * .42));
        }
      }
    }
    // KO blast beams
    for (const b of this.beams) {
      const alpha = b.life / b.maxLife;
      ctx.save();
      ctx.translate(b.x, -b.y);
      let angle = 0;
      if (b.dir === 'left') angle = 0;
      else if (b.dir === 'right') angle = Math.PI;
      else if (b.dir === 'top') angle = Math.PI * 0.5;
      else if (b.dir === 'bottom') angle = -Math.PI * 0.5;
      ctx.rotate(angle);
      const w = 130 * alpha;
      const grad = ctx.createLinearGradient(0, 0, 560, 0);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, b.color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = Math.min(1, alpha * 1.2);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, -w * 0.25);
      ctx.lineTo(560, -w);
      ctx.lineTo(560, w);
      ctx.lineTo(0, w * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Back particles (smoke & dust)
    for (const p of this.particles) {
      if (!p.back) continue;
      const alpha = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha * 0.75;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, -p.y, Math.max(1, p.size * alpha), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _drawCrescent(ctx, x, y, angle, reach, paint, arc, alpha) {
    const [rim, core, spark] = paint;
    ctx.save();
    ctx.translate(x, -y);
    ctx.rotate(-angle);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = rim;
    ctx.shadowBlur = 9;
    const path = (outer, inner) => {
      ctx.beginPath();
      for (let side = 0; side < 2; side++) for (let i = 0; i <= 24; i++) {
        const u = (side ? 24 - i : i) / 24, a = (u - .5) * arc;
        const edge = Math.sin(Math.PI * u) ** .70;
        const r = reach * (.65 + .10 * u + edge * (side ? inner : outer));
        if (side || i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
    };
    path(.12, -.23); ctx.fillStyle = rim; ctx.fill();
    path(.04, -.09); ctx.fillStyle = spark; ctx.fill();
    path(.035, -.012); ctx.fillStyle = core; ctx.fill();
    ctx.restore();
  }

  _drawComet(ctx, x, y, angle, paint, reach, alpha) {
    const [rim, core, spark] = paint;
    ctx.save();
    ctx.translate(x, -y);
    ctx.rotate(-angle);
    ctx.globalAlpha = alpha;
    const gradient = ctx.createLinearGradient(-reach, 0, reach * .4, 0);
    gradient.addColorStop(0, rim + '00'); gradient.addColorStop(.45, rim);
    gradient.addColorStop(.76, spark); gradient.addColorStop(1, core);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-reach, -2); ctx.quadraticCurveTo(-reach * .36, -reach * .17, -reach * .15, -reach * .30);
    ctx.bezierCurveTo(reach * .33, -reach * .56, reach * .58, -reach * .06, reach * .54, 0);
    ctx.bezierCurveTo(reach * .5, reach * .37, reach * .15, reach * .40, -reach * .16, reach * .27);
    ctx.quadraticCurveTo(-reach * .55, reach * .11, -reach, -2); ctx.fill();
    ctx.restore();
  }

  _drawCombat(ctx) {
    const match = this.match;
    for (const p of this.combat) {
      const left = p.life / p.maxLife, t = 1 - left;
      const paint = [p.rim, p.core, p.spark];
      ctx.save();
      ctx.globalAlpha = left;
      if (p.type === 'impact') {
        ctx.translate(p.x, -p.cy); ctx.rotate(-p.angle);
        for (const [scale, ink] of [[1, p.rim], [.69, p.core]]) {
          const r = p.reach * (.86 + .26 * Math.sin(t * Math.PI)) * scale;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = i * TAU / 8, radius = i % 2 ? r * .14 : r;
            if (i) ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius * .58);
            else ctx.moveTo(radius, 0);
          }
          ctx.closePath(); ctx.fillStyle = ink; ctx.fill();
        }
      } else if (p.type === 'quickZip') {
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); p.points.forEach(([x, y], i) => i ? ctx.lineTo(x, -y) : ctx.moveTo(x, -y));
        for (const [w, ink] of [[20, p.rim], [8, p.spark], [3, p.core]]) {
          ctx.strokeStyle = ink; ctx.lineWidth = w * (.4 + .6 * left); ctx.stroke();
        }
      } else if (p.type === 'afterimage' && p.f && this.classic) {
        const f = p.f, def = f.def;
        ctx.globalAlpha = left * .51;
        ctx.filter = 'brightness(0) invert(1) sepia(1) saturate(4) hue-rotate(145deg)';
        this.classic._drawFighterBody(ctx, { ...f, grounded: false, hitlag: 0 }, def, def.stats, f.palette || def.palettes[0],
          def.rig || {}, p.x, -p.y, match);
      } else if (p.type === 'teleportFlash') {
        const r = p.inwards ? 86 * left + 4 : 16 + 91 * t;
        ctx.translate(p.x, -p.cy); ctx.rotate(t * 1.2);
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.ellipse(0, 0, r, r * .44, i * Math.PI / 3, 0, TAU);
          ctx.strokeStyle = i ? p.spark : p.core; ctx.lineWidth = (i ? 5 : 8) * left; ctx.stroke();
        }
      } else if (p.type === 'launchTrail') {
        this._drawComet(ctx, p.x, p.cy, p.angle, [p.rim, '#ffffff', p.rim], p.reach * .63, left * .75);
      } else if (p.type === 'specialLaunch') {
        this._drawComet(ctx, p.x, p.cy, p.angle, paint, p.misfire ? 146 : 94, left * .86);
      } else if (p.type === 'specialCharge') {
        this._drawCrescent(ctx, p.x, p.cy, p.angle, 50 + t * 40, paint, 4.9, left * .8);
      }
      ctx.restore();
    }
    for (const f of match?.fighters || []) {
      const special = specialVisual(f), a = attackVisual(f);
      if (f.state === STATE.DEAD || fighterHidden(f, special)) continue;
      if (a?.melee) {
        const reach = a.reach * (.92 + .16 * Math.min(1, a.age / 3));
        const shift = a.radial ? 0 : reach * .34;
        this._drawCrescent(ctx, a.x - Math.cos(a.angle) * shift, a.y - Math.sin(a.angle) * shift,
          a.angle + (a.radial ? match.frame * .22 : (a.age / a.duration - .5) * .68), reach, combatPaint[a.style],
          a.radial ? 5.5 : 2.55, 1 - .34 * a.age / a.duration);
      }
      if (!special) continue;
      const cy = f.y + f.def.stats.height * (f.scale || 1) * .5, paint = combatPaint[special.style];
      if (special.phase === 'charge') {
        const radius = 49 + special.charge * 41;
        this._drawCrescent(ctx, f.x, cy, match.frame * .25, radius, paint, 4.7, .78);
        this._drawCrescent(ctx, f.x, cy, special.angle, radius + 13, paint, 1.20, .96);
      } else if (special.flight && ['launch', 'zip1', 'zip2'].includes(special.phase) && !special.illusion) {
        this._drawComet(ctx, f.x, cy, special.angle, paint, special.zip ? 88 : 123, .84);
      }
    }
  }

  drawFront(ctx) {
    this._drawCombat(ctx);
    // Foreground hitsparks
    for (const p of this.particles) {
      if (p.back) continue;
      const alpha = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, -p.y, Math.max(1.5, p.size * alpha), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Impact rings & Shine hexagons
    for (const r of this.rings) {
      const t = 1 - r.life / r.maxLife;
      const rad = r.r + (r.maxR - r.r) * t;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.lineWidth * (1 - t * 0.6);
      ctx.beginPath();
      if (r.hex) {
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          const hx = r.x + Math.cos(a) * rad;
          const hy = -r.y + Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
      } else {
        ctx.arc(r.x, -r.y, rad, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Star KO twinkling ding!
    for (const s of this.starKOs) {
      const t = 1 - s.life / s.maxLife;
      const rad = Math.sin(t * Math.PI) * 34;
      ctx.save();
      ctx.translate(s.x, -s.y + 80);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -rad); ctx.lineTo(rad * 0.25, -rad * 0.25);
      ctx.lineTo(rad, 0); ctx.lineTo(rad * 0.25, rad * 0.25);
      ctx.lineTo(0, rad); ctx.lineTo(-rad * 0.25, rad * 0.25);
      ctx.lineTo(-rad, 0); ctx.lineTo(-rad * 0.25, -rad * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Comic speech bubbles & callouts (always upright plain text!)
    for (const c of this.callouts) {
      const alpha = Math.min(1, (c.life / c.maxLife) * 2.2);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(c.x, -c.y);
      ctx.scale(c.scale || 1, c.scale || 1);
      ctx.font = '900 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (c.bg) {
        const w = ctx.measureText(c.text).width + 20;
        ctx.fillStyle = c.bg;
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-w * 0.5, -15, w, 30, 8);
        ctx.fill();
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.lineWidth = 4;
      ctx.strokeText(c.text, 0, 0);
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, 0, 0);
      ctx.restore();
    }
  }
}
