import { MELEE, MODE, MOVE, STATE, detCos, detHypot, detSin } from './constants.js';
import { drawRng, findTetherLedge } from './physics.js';
import { getSurfaceY } from './stages.js';
import { createEmptyInput } from './input.js';

const M = MOVE;
const S = STATE;
const AIR_RECOVERY = new Set(['recovery', 'teleport', 'projectile']);
const HURT = new Set([S.HITSTUN, S.TUMBLE, S.KNOCKDOWN, S.SHIELD_BREAK]);
const BLOCKED = new Set([S.ROLL_F, S.ROLL_B, S.SPOTDODGE, S.TECH, S.FREEFALL, S.AIRDODGE]);
const GROUND_APPROACH = new Set([S.IDLE, S.WALK, S.DASH, S.RUN, S.CROUCH, S.TURN]);
const THINK_FRAMES = [0, 24, 19, 14, 11, 9, 6, 4, 3, 1];
const PAUSE_CHANCE = [0, 0.52, 0.38, 0.27, 0.18, 0.14, 0.08, 0.055, 0.035, 0];
const DIRECT_SIDE = new Set(['wonky-kong', 'flurby', 'shriek']);
const DESIRABLE = new Set(['plunger_bat', 'glow_saber', 'critter_capsule', 'mallet_chaos',
  'paper_fan', 'star_wand', 'freezie_cube', 'mr_saturn_plush']);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sign = (x, fallback = 1) => Math.sign(x) || fallback;
const teammates = (a, b) => a?.team != null && a.team === b?.team;

function tap(input, key, x = 0, y = 0) {
  input[key] = input[key + 'Pressed'] = true;
  input.moveX = x;
  input.moveY = y;
  return input;
}

function nearestOpponent(match, f) {
  let best;
  let weight = Infinity;
  for (const o of match.fighters) {
    if (o === f || o.state === S.DEAD || teammates(f, o)) continue;
    const score = Math.abs(o.x - f.x) + Math.abs(o.y - f.y) * 1.35 +
      (o.invulnFrames > 0 || o.state === S.RESPAWN ? 320 : 0);
    if (score < weight) {
      weight = score;
      best = o;
    }
  }
  return best;
}

function danger(match, f, level) {
  const scale = f.scale ?? 1;
  const height = f.def.stats.height * scale;
  const center = f.y + height * 0.52;
  const reaction = 15 - level;
  let closest = null;
  const consider = (threat) => {
    if (!closest || threat.eta < closest.eta) closest = threat;
  };
  for (const p of match.projectiles) {
    const owner = match.fighters.find((o) => o.port === p.ownerPort);
    if (!owner || owner === f || teammates(owner, f)) continue;
    const delta = f.x - p.x;
    const reach = f.def.stats.shieldRadius * scale + p.r;
    const eta = Math.abs(delta) <= reach ? 0 :
      delta * p.vx > 0 ? (Math.abs(delta) - reach) / Math.abs(p.vx) : Infinity;
    if (eta <= reaction && Math.abs(center - p.y - p.vy * eta) < height * 0.78) {
      consider({ projectile: true, x: p.x, eta });
    }
  }
  for (const o of match.fighters) {
    if (o === f || o.state !== S.ATTACK || !o.moveData || (o.hitTargets?.has(f.port) && !o.moveData.multiHit) || teammates(f, o)) continue;
    const m = o.moveData;
    if (['projectile', 'chargeShot', 'counter', 'commandGrab', 'itemShot', 'itemThrow'].includes(m.kind) ||
        o.moveFrame >= m.startup + m.active || m.startup - o.moveFrame > 2 + level / 2) continue;
    if (o.activeHitboxes.some((box) => Math.abs(box.x - f.x) <= box.r + f.def.stats.width * scale / 2 &&
        Math.abs(box.y - center) <= box.r + height / 2)) {
      consider({ projectile: false, x: o.x, eta: 0 });
      continue;
    }
    const x = o.x + o.facing * (m.offsetX ?? 30) * (o.scale ?? 1);
    const y = o.y + (m.offsetY ?? 36) * (o.scale ?? 1);
    const radius = (m.radius ?? 30) * (o.scale ?? 1);
    if (Math.abs(x - f.x) < radius + f.def.stats.shieldRadius * scale &&
        Math.abs(y - center) < height * 0.55 + radius) {
      consider({ projectile: false, x: o.x, eta: Math.max(0, m.startup - o.moveFrame) });
    }
  }
  return closest;
}

function evadeHazard(input, match, f, deck) {
  const acid = match.stage.hazard === 'risingAcid' && f.y < match.acidLevel + 31;
  let sourceX;
  for (const h of match.hazards) {
    if (!h.active || f.y > h.y + h.h + 15 || f.y + f.def.stats.height * f.scale < h.y ||
        (h.kind === 'pizzaVan' && !f.grounded)) continue;
    const dx = f.x - h.x;
    const lead = h.w / 2 + 37;
    if (Math.abs(dx) < lead || dx * h.vx > 0 && Math.abs(dx) < lead + Math.abs(h.vx) * 12) {
      sourceX = h.x;
      break;
    }
  }
  if (sourceX == null) {
    const item = match.items.find((it) => {
      if (!it.active || it.holderPort === f.port) return false;
      if (match.suddenDeath && it.itemId === 'alarm_omb') {
        return Math.abs(f.x - it.x) < it.def.blastRadius + 65 && Math.abs(f.y - it.y) < 270;
      }
      return (it.state === 'armed' || it.state === 'walking') && Math.abs(f.y - it.y) < 88 &&
        Math.abs(f.x - it.x) < (it.def.triggerRadius ?? it.def.blastRadius) + 46;
    });
    sourceX = item?.x;
  }
  if (!acid && sourceX == null) return false;
  const away = acid ? sign(deck.x + deck.w / 2 - f.x, f.facing) : sign(f.x - sourceX, f.facing);
  const safe = f.x + away * 85 >= deck.x && f.x + away * 85 <= deck.x + deck.w;
  input.moveX = (safe ? away : sign(deck.x + deck.w / 2 - f.x)) * 0.84;
  if (f.grounded || f.vy <= 1 && f.jumpsUsed < f.def.stats.maxJumps) tap(input, 'jump', input.moveX);
  else if (acid && f.vy < -1 && f.jumpsUsed >= f.def.stats.maxJumps) tap(input, 'special', input.moveX * 0.45, 1);
  return true;
}

function useItem(input, match, f, target, deck, level) {
  const held = match.items.find((it) => it.id === f.heldItemId && it.active);
  if (held) {
    const dx = target.x - f.x;
    const dy = target.y - f.y;
    const dir = sign(dx, f.facing);
    const d = Math.abs(dx);
    const cat = held.def.category;
    if (cat === 'hammer') {
      input.moveX = d > 34 ? dir * 0.75 : 0;
      return true;
    }
    if (cat === 'batter') {
      const reach = (held.def.swingReach ?? 110) * f.scale;
      if (d > reach || Math.abs(dy) > 55) return false;
      tap(input, 'attack', dir * 0.55);
      if (f.grounded && level >= 7 && d > reach * 0.65 && target.hitstun > 18) input.cStickX = dir;
      return true;
    }
    if (cat === 'shooter') {
      if (Math.abs(dy) > 48) return false;
      if (held.ammo <= 0 && d < 215) {
        tap(input, 'grab', dir, 0.2);
        return true;
      }
      const range = held.def.id === 'hotsauce_flower' ? 200 : 445;
      if (held.ammo <= 0 || d > range) return false;
      tap(input, 'attack', dir * 0.55);
      return true;
    }
    if (d > 300 || Math.abs(dy) > 135) return false;
    const leadY = level >= 7 ? (target.vy + target.kbVy) * Math.min(9, d / 18) : 0;
    tap(input, 'grab', dir * (d < 85 ? 0.6 : 1), clamp((dy + leadY) / 150 + (d > 110 ? 0.25 : -0.16), -0.94, 0.9));
    return true;
  }
  const handY = f.y + f.def.stats.height * f.scale * 0.41;
  const opponentDist = Math.abs(target.x - f.x) + Math.abs(target.y - f.y);
  const wanted = [];
  for (const it of match.items) {
    if (match.suddenDeath && it.itemId === 'alarm_omb') continue;
    if (!it.active || it.state !== 'ground' || it.holderPort != null || it.itemId === 'tiny_shroom') continue;
    if (!(DESIRABLE.has(it.itemId) || level >= 7 && ['explosive', 'shell', 'mine'].includes(it.def.category) || ['buff', 'shooter'].includes(it.def.category) ||
        it.def.category === 'heal' && f.percent >= 12)) continue;
    if (it.x < deck.x + 12 || it.x > deck.x + deck.w - 12 || it.y < match.acidLevel + 20) continue;
    const dx = it.x - f.x;
    const dy = it.y + it.def.radius * 0.55 - handY;
    const d = detHypot(dx, dy);
    if (d <= it.def.radius + 33 * f.scale) {
      tap(input, 'grab');
      return true;
    }
    if (d < 120 + level * 16 && (opponentDist > 90 || it.def.category === 'heal' && f.percent > 60)) {
      wanted.push({ it, score: d - (it.def.category === 'heal' ? Math.min(f.percent, 70) * 0.5 : 0) });
    }
  }
  const best = wanted.sort((a, b) => a.score - b.score)[0]?.it;
  if (!best) return false;
  if (!navPlatform(input, match, f, best)) {
    const dx = best.x - f.x;
    input.moveX = Math.abs(dx) > 12 ? sign(dx) * (Math.abs(dx) > 78 ? 0.92 : 0.56) : 0;
    if (best.y > handY + 45 && f.grounded) tap(input, 'jump', input.moveX);
  }
  return true;
}

function recover(input, match, f, deck, level) {
  const right = deck.x + deck.w;
  const outside = f.x < deck.x || f.x > right;
  const side = f.x < deck.x + deck.w / 2 ? -1 : 1;
  const edge = side < 0 ? deck.x : right;
  // Below the deck, go around the wall instead of drifting into its underside.
  const top = getSurfaceY(deck, edge);
  const under = deck.h != null && f.y < top - 38;
  const edgeOffset = under ? 19 : -44;
  const target = deck.h == null ? clamp(f.x, deck.x + 16, right - 16) : edge + side * edgeOffset;
  const dx = target - f.x;
  const dist = Math.max(0, outside ? Math.abs(edge - f.x) : 0);
  input.moveX = Math.abs(dx) < 11 ? 0 : sign(dx);
  if (level >= 7 && f.state === S.AIRBORNE && f.heldItemId == null &&
      f.def.moves[M.ZAIR] && findTetherLedge(match, f)) return tap(input, 'grab', input.moveX);
  const recovery = f.def.moves[M.UP_B];
  const rising = f.vy + f.kbVy > 2.5;
  const hasJump = f.jumpsUsed < f.def.stats.maxJumps;
  // Air jumps replace fall speed but retain launch knockback. A zip or warp
  // travels at a fixed speed during its active frames instead of a ballistic arc.
  if (f.y > top && !rising) {
    const lift = hasJump ? f.def.stats.doubleJumpVel : recovery.selfLiftY ?? recovery.recoveryY ?? 0;
    const speed = lift + Math.max(0, f.kbVy);
    const rise = !hasJump && recovery.technique && recovery.speed
      ? recovery.speed * recovery.active : speed * speed / (2 * f.def.stats.gravity);
    if (f.y + rise >= match.stage.blastzones.top - 12) {
      input.moveX = clamp((clamp(f.x, deck.x + 16, right - 16) - f.x) / 12, -1, 1);
      return input;
    }
  }
  const canReachLedge = deck.ledges && !deck.walkOff && Math.abs(edge - f.x) < 43 && f.y > top - 62;
  if (f.state === S.ATTACK || BLOCKED.has(f.state) || f.hitstun > 0) return input;
  if (level <= 2) {
    const late = level === 1 ? 105 : 66;
    if (!rising && !canReachLedge && f.y < top - late) {
      if (hasJump) return tap(input, 'jump', input.moveX);
      if (!f.upBUsed && f.y < top - late - 32) return tap(input, 'special', input.moveX * 0.6, 1);
    }
    return input;
  }
  if (!rising && !canReachLedge &&
      (f.y < top + 32 || dist > (level >= 6 ? 165 : 100) || f.y < match.stage.blastzones.bottom + 230)) {
    if (hasJump && (f.y < top - 28 || dist > 105 || f.vy < -5)) return tap(input, 'jump', input.moveX);
    if (level === 9 && !hasJump && !f.sideBUsed && dist > 110 && f.y >= top - 15 &&
        f.y < top + 42 && f.def.moves[M.SIDE_B].kind === 'dashBurst' && !DIRECT_SIDE.has(f.fighterId)) {
      return tap(input, 'special', -side);
    }
    if (!hasJump && !f.upBUsed && AIR_RECOVERY.has(recovery.kind) &&
        (f.y < top - 20 || dist > 160 || f.vy < -6)) {
      return tap(input, 'special', dist < 25 && under ? 0 : input.moveX * (f.y < top - 115 ? 0.42 : 0.83), 1);
    }
  }
  if (f.state === S.TUMBLE && !f.hitstun && Math.abs(f.prevMoveX) >= 0.65 && match.frame % 4 === 0) input.moveX = 0;
  return input;
}

// The Temple's cave roof joins solid terraces on both sides. The lower
// island on the right is the last foothold before the exposed upper ledge.
function escapeTempleCave(input, match, f, target) {
  if (match.stage.id !== 'lowrule-temple') return false;
  const terrace = match.surfaces.reduce((a, b) => a.x + a.w > b.x + b.w ? a : b);
  const edge = terrace.x + terrace.w;
  const top = getSurfaceY(terrace, edge);
  if (target.y < terrace.y || f.y >= top || f.x > edge + 110) return false;
  const island = match.surfaces.filter((s) => s.y < terrace.y - terrace.h)
    .reduce((a, b) => !a || a.x + a.w < b.x + b.w ? b : a, null);
  if (!island || f.y < island.y - 35) return false;
  const climbing = f.x >= island.x + island.w - 42;
  if ((f.grounded || !climbing) && f.y >= terrace.y - terrace.h) return false;
  if (!climbing && !match.surfaces.some((s) => s.y < terrace.y - terrace.h && f.x >= s.x)) return false;
  const cave = match.surfaces.find((s) => s.y < terrace.y - terrace.h && s.x < island.x && s.x + s.w < island.x && s.w > island.w);
  // Drop outward from the cave lip. A normal getup jumps inland and loops back to the same ledge.
  if (f.state === S.LEDGE_HANG && cave && f.ledgeSide === 1 && Math.abs(f.ledgeX - cave.x - cave.w) < 4) {
    input.moveX = 1;
    return true;
  }
  const floor = match.surfaces.find((s) => s.id === f.onPlatformId);
  const gap = floor && floor.x + floor.w - f.x <= 58 && floor.x + floor.w < island.x;
  const halfW = (f.def.stats.width * (f.scale || 1)) * 0.5;
  const clearX = edge + halfW + 4;
  const underOverhang = f.x < clearX && f.y < terrace.y - terrace.h + 12;
  const belowLedge = f.y < top - 24;
  const aimX = (underOverhang || belowLedge) ? clearX + 8 : edge - 18;
  input.moveX = Math.abs(aimX - f.x) < 8 ? 0 : sign(aimX - f.x);
  if (f.state === S.JUMPSQUAT) input.jump = true;
  else if (f.grounded && (gap || climbing)) tap(input, 'jump', 1);
  else if (!climbing && !f.grounded && cave && f.x >= cave.x + cave.w && f.x < island.x &&
      f.vy < 0 && f.y < cave.y + 35 && f.jumpsUsed < f.def.stats.maxJumps) {
    tap(input, 'jump', 1);
  } else if (climbing && !f.grounded && f.state === S.AIRBORNE) {
    // Wait until past the island tip and clear of the overhang (or dipping below island level) before spending double jump / Up-B.
    const pastIsland = f.x > island.x + island.w + 4;
    const safeToRise = !underOverhang || (pastIsland && f.y < island.y + 5);
    if (safeToRise && f.vy <= 1.5) {
      if (f.jumpsUsed < f.def.stats.maxJumps) tap(input, 'jump', underOverhang ? 1 : input.moveX);
      else if (!f.upBUsed && (!underOverhang || f.y < island.y - 35)) {
        tap(input, 'special', underOverhang ? 0.65 : (belowLedge ? clamp((clearX - f.x) / 45, -0.3, 0.55) : -0.45), 1);
      }
    }
  } else if (climbing && f.state === S.ATTACK && f.def.canFloat) {
    input.moveX = (underOverhang || belowLedge) ? clamp((clearX + 6 - f.x) / 30, -0.4, 1) : -0.8;
    input.moveY = 0;
  }
  return true;
}

function cpuRandom(f, match) {
  f.cpuRng = (Math.imul(f.cpuRng ?? (match.rng ^ Math.imul(f.port + 1, 2654435761)), 1664525) + 1013904223) >>> 0;
  return f.cpuRng / 4294967296;
}

function computeMittInput(match, f, target) {
  const input = createEmptyInput();
  if (!(GROUND_APPROACH.has(f.state) || f.state === S.AIRBORNE) || f.hitlag || f.sleepTimer) return input;
  const dx = target.x - f.x;
  const dir = sign(dx, f.facing);
  const d = Math.abs(dx);
  if (!f.bossPlan) {
    const shielding = target.state === S.SHIELD || target.state === S.SHIELD_STUN;
    const weights = [
      ['gun', d > 280 ? 5 : 1], ['slap', d > 110 ? 4 : 1], ['slam', shielding ? 5 : 2],
      ['sweep', f.grounded && target.grounded ? 3 : 0], ['drill', target.grounded ? 2 : 4],
      ['clap', f.grounded && d < 155 ? shielding ? 8 : 5 : 0],
    ].map(([tell, weight]) => [tell, tell === f.bossLastAttack ? weight * 0.1 : weight]);
    let roll = cpuRandom(f, match) * weights.reduce((sum, [, w]) => sum + w, 0);
    f.bossPlan = weights.find(([, weight]) => (roll -= weight) < 0)[0];
  }
  const next = f.bossPlan;
  const reach = { gun: 620, slap: 265, slam: 140, sweep: 650, drill: 230, clap: 110 }[next];
  if (d > reach) {
    input.moveX = dir;
    input.moveY = clamp((target.y + 15 - f.y) / 40, -1, 1);
    return input;
  }
  if (next === 'drill') {
    input.cStickY = -1;
    if (f.grounded) input.shortHopPressed = true;
    return input;
  }
  if (next === 'sweep' || next === 'clap') {
    if (!f.grounded) return input;
    if (next === 'sweep') input.cStickX = dir;
    else input.cStickY = -1;
    return input;
  }
  if (next === 'slam') return tap(input, 'special', 0, -1);
  return tap(input, 'special', dir * (next === 'gun' ? 0.35 : 0.9));
}

function navPlatform(input, match, f, target) {
  const stats = f.def.stats;
  const current = match.platforms.find((p) => p.id === f.onPlatformId);
  if (current && f.y - target.y > 78) {
    input.moveY = f.prevMoveY < -0.55 ? 0 : -1;
    input.moveX = 0;
    return true;
  }
  if (target.y <= f.y + 50) return false;
  const maxRise = stats.fullHopVel * stats.fullHopVel / (2 * stats.gravity);
  const hopTo = [...match.platforms, ...match.surfaces]
    .map((p) => {
      const x = clamp(target.x, p.x + 24, p.x + p.w - 24);
      return { x, y: getSurfaceY(p, x) };
    })
    .filter((p) => p.y > f.y + 10 && p.y - f.y < maxRise * 0.92 && p.y < target.y + 30 &&
      Math.abs(target.x - p.x) <= Math.abs(target.x - f.x) + 32)
    .sort((a, b) => Math.abs(a.x - target.x) + Math.abs(a.x - f.x) * 0.35 + (target.y - a.y) * 0.6 -
      Math.abs(b.x - target.x) - Math.abs(b.x - f.x) * 0.35 - (target.y - b.y) * 0.6)[0];
  const goalX = hopTo?.x ?? target.x;
  const delta = goalX - f.x;
  input.moveX = Math.abs(delta) < 15 ? 0 : sign(delta) * (Math.abs(delta) > 68 ? 1 : 0.5);
  const walkIn = Math.abs(delta) > Math.max(80, (stats.fullHopVel / stats.gravity) * stats.airSpeed * 0.54);
  if (f.grounded && !walkIn) tap(input, 'jump', input.moveX);
  else if (!f.grounded && f.vy <= 2 && f.jumpsUsed < stats.maxJumps && Math.abs(delta) < 86 &&
      (hopTo?.y ?? target.y) - f.y > 20) tap(input, 'jump', input.moveX);
  return true;
}

function climbSolidShelf(input, match, f, target, terrain) {
  if (f.hitstun || f.hitlag || !(GROUND_APPROACH.has(f.state) ||
      [S.JUMPSQUAT, S.AIRBORNE, S.LANDING].includes(f.state))) return false;
  let route = f.cpuShelfRoute;
  let shelf = route && match.surfaces.find((s) => s.id === route.id);
  const aboveShelf = (s) => target.x >= s.x && target.x <= s.x + s.w &&
    target.y >= getSurfaceY(s, target.x) - 4;
  if (!shelf || !aboveShelf(shelf) || f.onPlatformId === shelf.id || f.y > target.y + 50) {
    f.cpuShelfRoute = null;
    shelf = match.surfaces.find((s) => f.x >= s.x && f.x <= s.x + s.w &&
      f.y <= s.y - s.h && aboveShelf(s));
    if (!shelf) return false;
    const clearance = f.def.stats.width * f.scale / 2 + 14;
    const edges = [shelf.x - clearance, shelf.x + shelf.w + clearance].filter((x) =>
      terrain.some((s) => x >= s.x && x <= s.x + s.w && getSurfaceY(s, x) <= shelf.y - shelf.h) &&
      !match.surfaces.some((s) => x >= s.x && x <= s.x + s.w && s.y - s.h < shelf.y + f.def.stats.height &&
        getSurfaceY(s, x) > Math.max(f.y + 16, shelf.y - shelf.h)));
    if (!edges.length) return false;
    edges.sort((a, b) => Math.abs(f.x - a) - Math.abs(f.x - b));
    route = f.cpuShelfRoute = { id: shelf.id, edges, failed: 0, jumping: false };
  }
  const top = getSurfaceY(shelf, f.x);
  if (f.y >= top && f.x >= shelf.x && f.x <= shelf.x + shelf.w) {
    f.cpuShelfRoute = null;
    return false;
  }
  if (route.jumping && f.grounded && f.state !== S.JUMPSQUAT) {
    route.failed = f.y <= route.takeoffY + 12 ? route.failed + 1 : 0;
    if (route.failed >= 2) {
      route.edges.reverse();
      route.failed = 0;
    }
    route.jumping = false;
  }
  const distance = Math.abs(route.edges[0] - f.x);
  if (route.bestDistance == null || distance < route.bestDistance - 6 || route.jumping) {
    route.bestDistance = distance;
    route.progressFrame = match.frame;
  } else if (match.frame - route.progressFrame > 75 && route.edges.length > 1) {
    route.edges.reverse();
    route.bestDistance = null;
  }
  const waypoint = route.edges[0];
  const clear = waypoint < shelf.x ? f.x < shelf.x - 6 : f.x > shelf.x + shelf.w + 6;
  const goal = f.y >= top ? clamp(target.x, shelf.x + 16, shelf.x + shelf.w - 16) : waypoint;
  input.moveX = clamp((goal - f.x) / 23, -1, 1);
  if (f.state === S.JUMPSQUAT) input.jump = true;
  else if (clear && f.grounded && f.y < top && GROUND_APPROACH.has(f.state)) {
    route.takeoffY = f.y;
    route.jumping = true;
    tap(input, 'jump', input.moveX);
  } else if (clear && f.state === S.AIRBORNE && f.y < top + 8 && f.vy <= 2) {
    if (f.jumpsUsed < f.def.stats.maxJumps) tap(input, 'jump', input.moveX);
    else if (!f.upBUsed && AIR_RECOVERY.has(f.def.moves[M.UP_B].kind)) tap(input, 'special', 0, 1);
  }
  return true;
}

function crossGap(input, match, f, target, floor, level, hazardY) {
  if (f.hitstun || f.hitlag || !f.grounded && f.state !== S.AIRBORNE) {
    f.cpuGapTarget = null;
    return false;
  }
  if (f.grounded && f.state !== S.JUMPSQUAT) {
    f.cpuGapTarget = null;
    if (!GROUND_APPROACH.has(f.state)) return false;
    const goal = match.surfaces.find((s) => s.id === target.onPlatformId);
    if (!goal || goal === floor) return false;
    const dir = sign(target.x - f.x);
    const edge = dir > 0 ? floor.x + floor.w : floor.x;
    const nearEdge = (s) => dir > 0 ? s.x : s.x + s.w;
    const gap = (s) => (nearEdge(s) - edge) * dir;
    const maxGap = Math.min(300, gap(goal));
    if (maxGap <= 1) return false;
    // Cross one gap at a time when there are islands between the fighters.
    const landing = match.surfaces.filter((s) => gap(s) > 1 && gap(s) <= maxGap && getSurfaceY(s, nearEdge(s)) > hazardY)
      .sort((a, b) => gap(a) - gap(b))[0];
    if (!landing) return false;
    input.moveX = dir * (level === 1 ? 0.45 : level === 2 ? 0.6 : 1);
    if ((edge - f.x) * dir <= Math.max(24, Math.abs(f.vx) * (f.def.stats.jumpSquat + 2))) {
      f.cpuGapTarget = landing.id;
      tap(input, 'jump', dir);
    }
    return true;
  }
  // Keep steering toward the chosen landing even while the takeoff ledge is closer.
  const landing = f.cpuGapTarget && match.surfaces.find((s) => s.id === f.cpuGapTarget);
  if (!landing) return false;
  const goalX = clamp(f.x, landing.x + 24, landing.x + landing.w - 24);
  const top = getSurfaceY(landing, goalX);
  input.moveX = clamp((goalX - f.x) / 16, -1, 1);
  input.jump = f.state === S.JUMPSQUAT;
  const overDeck = f.x >= landing.x && f.x <= landing.x + landing.w;
  if (!f.grounded && f.vy <= 0 && (f.y < top || !overDeck && f.y < top + 40) &&
      f.jumpsUsed < f.def.stats.maxJumps) {
    tap(input, 'jump', input.moveX);
  } else if (!f.grounded && f.y < top - 40 && f.vy < 0 && f.jumpsUsed >= f.def.stats.maxJumps) {
    f.cpuGapTarget = null;
    return false;
  }
  return true;
}

export function computeCpuInput(match, f) {
  const lab = match.mode === MODE.TRAINING && f?.isCpu ? match.trainingConfig : null;
  const behavior = lab ? (lab.cpuBehavior ?? match.trainingCpuMode ?? 'stand') : null;
  if (f?.starKoTimer) return createEmptyInput();
  if (f?.freezeFrames > 0 || f?.state === S.GRABBED && f.cpuLevel >= 5 && (!lab || behavior === 'fight')) {
    const mash = createEmptyInput();
    mash.moveX = f.prevMoveX > 0 ? -1 : 1;
    if (match.frame % 2 === 0) tap(mash, 'attack', mash.moveX);
    return mash;
  }
  const input = decideCpuInput(match, f, behavior);
  if (!lab || !(f.hitlag && HURT.has(f.state) || f.hitstun > 0)) return input;
  if (lab.cpuDi === 'random') {
    const angle = drawRng(match) * 2 * Math.PI;
    input.moveX = detCos(angle);
    input.moveY = detSin(angle);
  } else if (lab.cpuDi === 'survival') {
    const deck = match.surfaces[0];
    const inward = sign((deck ? deck.x + deck.w / 2 : 0) - f.x);
    const length = detHypot(f.kbVx, f.kbVy);
    const turn = sign(-f.kbVy * inward, 1);
    input.moveX = length && f.kbVy ? -f.kbVy * turn / length : inward;
    input.moveY = length ? f.kbVx * turn / length : 0;
  } else if (lab.cpuDi === 'combo') {
    input.moveX = -sign(f.kbVx) * 0.55;
    input.moveY = -0.83;
  } else {
    input.moveX = input.moveY = 0;
  }
  return input;
}

function decideCpuInput(match, f, lab) {
  const input = createEmptyInput();
  if (!f || f.state === S.DEAD || f.fighterId === 'sagging-bag' || match.status === 'ended') return input;
  if (lab === 'stand') return input;
  if (lab === 'crouch') { input.moveY = -1; return input; }
  if (lab === 'shield') { input.shield = true; return input; }
  if (lab === 'jump') return f.grounded && match.frame % 45 === 0 ? tap(input, 'jump') : input;
  const hazardY = Math.max(match.stage.hotFloorY ?? -Infinity, match.stage.riverFlow?.y ?? -Infinity);
  const terrain = [...match.surfaces, ...match.platforms].filter((s) => getSurfaceY(s, f.x) > hazardY);
  const deck = terrain.find((s) => f.grounded && f.onPlatformId === s.id) ??
    terrain.reduce((best, s) => !best || deckDistance(s, f) < deckDistance(best, f) ? s : best, null);
  if (!deck) return input;
  const level = lab === 'fight' ? 7 : clamp(Math.trunc(f.cpuLevel) || 5, 1, 9);
  const target = nearestOpponent(match, f);
  if (!target) return input;
  const dy = target.y - f.y;
  const dir = sign(target.x - f.x, f.facing);
  const d = Math.abs(target.x - f.x);
  const phase = (match.frame + 31 * (f.port + 1)) % 97;
  const offstage = !terrain.some((s) => f.x >= s.x - 5 && f.x <= s.x + s.w + 5 && f.y >= getSurfaceY(s, f.x) - 12);
  if (lab === 'evade') {
    if (f.state === S.LEDGE_HANG) return tap(input, 'jump', -f.ledgeSide);
    if (f.state === S.TUMBLE || f.state === S.HITSTUN) {
      if (!f.techLock && f.vy + f.kbVy < -2 && f.y - getSurfaceY(deck, f.x) < 35) return tap(input, 'shield', -dir);
      return input;
    }
    if (!f.grounded && d < 85 && f.jumpsUsed < f.def.stats.maxJumps) return tap(input, 'jump', -dir);
    if (offstage && !f.grounded) return recover(input, match, f, deck, 7);
    if (evadeHazard(input, match, f, deck)) return input;
    const room = f.x - dir * 90 > deck.x && f.x - dir * 90 < deck.x + deck.w;
    if (danger(match, f, 7) || d < 100) {
      if (f.grounded && (!room || phase % 36 < 14)) return tap(input, 'shield');
      return tap(input, 'shield', room ? -dir : dir);
    }
    input.moveX = room && d < 320 ? -dir : 0;
    return input;
  }
  // Recovery, getups and pre-planned ledgedashes still sample position every tick.
  if (level >= 3 && !f.hitlag && !f.hitstun && escapeTempleCave(input, match, f, target)) {
    f.cpuShelfRoute = f.cpuGapTarget = f.cpuHeldInput = null;
    f.cpuThinkTimer = f.cpuPauseTimer = 0;
    return input;
  }
  if (f.state === S.LEDGE_HANG) {
    f.cpuGapTarget = null;
    f.cpuHeldInput = null;
    f.cpuBasicAttack = false;
    f.cpuThinkTimer = f.cpuPauseTimer = 0;
    if (f.stateFrame < (level <= 2 ? 26 : 5)) return input;
    const inland = -f.ledgeSide;
    if (level === 9 && d > 110) {
      const option = (match.frame + f.port) % 3;
      if (option === 0 && !f.def.canFloat) { input.moveY = -1; return input; }
      if (option === 1 || (option === 0 && f.def.canFloat)) return tap(input, 'shield');
    }
    if (d < 83 && Math.abs(dy) < 55 && level >= 5) return tap(input, 'attack');
    if (d < 115 && level >= 3) return tap(input, 'jump', inland);
    input.moveX = inland;
    return input;
  }
  if (f.fighterId === 'master-mitt') {
    if (offstage && !f.grounded) return recover(input, match, f, deck, level);
    return computeMittInput(match, f, target);
  }
  if (level === 9 && f.ledgeDropFrame != null && match.frame - f.ledgeDropFrame < 26 && f.state === S.AIRBORNE) {
    const inland = -f.ledgeSide;
    if (!f.ledgeDoubleJump) return tap(input, 'jump', inland);
    if (f.y >= f.ledgeY + 5) return tap(input, 'shield', inland * 0.95, -0.52);
    input.moveX = inland;
    return input;
  }
  if (level >= 7 && !offstage && !f.hitlag && !f.hitstun && f.state === S.ATTACK) {
    const m = f.moveData;
    if (m?.kind === 'dancingBlade' && (m.bladeStage ?? 1) < 4 && !f.bladeInput &&
        d < 105 && Math.abs(dy) < 70 && f.moveFrame >= m.startup - 3) return tap(input, 'special', dir);
    if (m?.kind === 'needles') {
      input.special = d > 165 && target.grounded && f.needleCount < 6;
      return input;
    }
  }
  if ((!offstage && climbSolidShelf(input, match, f, target, terrain)) ||
      crossGap(input, match, f, target, deck, level, hazardY)) {
    f.cpuHeldInput = null;
    f.cpuBasicAttack = false;
    f.cpuThinkTimer = f.cpuPauseTimer = 0;
    return input;
  }
  if (offstage && !f.grounded || f.state === S.RESPAWN) {
    f.cpuThinkTimer = f.cpuPauseTimer = 0;
    f.cpuHeldInput = null;
    if (offstage && !f.grounded && level <= 2 && f.state !== S.RESPAWN) return recover(input, match, f, deck, level);
  } else if (f.cpuThinkTimer > 0) {
    f.cpuThinkTimer--;
    if (f.cpuPauseTimer > 0) {
      f.cpuPauseTimer--;
      return input;
    }
    return executePlan(f, input, target, match.frame);
  } else {
    f.cpuThinkTimer = THINK_FRAMES[level] - 1;
    if (f.grounded && PAUSE_CHANCE[level]) {
      // Separate deterministic stream, so idle choices never perturb item spawns.
      if (cpuRandom(f, match) < PAUSE_CHANCE[level]) {
        f.cpuBasicAttack = false;
        f.cpuPauseTimer = f.cpuThinkTimer;
        f.cpuHeldInput = null;
        return input;
      }
    }
  }

  f.cpuBasicAttack = false;
  let choice;
  if (level <= 2 && f.state !== S.RESPAWN) {
    choice = input;
    const speed = level === 1 ? 0.45 : 0.60;
    if (f.grounded && d > 30 && target.x >= deck.x && target.x <= deck.x + deck.w) choice.moveX = dir * speed;
    if (f.grounded && d < (level === 1 ? 42 : 58) && Math.abs(dy) < 38 && !f.hitstun && !f.hitlag) {
      if (level === 1) {
        // Commit to the next slow swing while holding this decision.
        choice.moveX = d > 32 || f.facing !== dir ? dir * speed : 0;
        f.cpuBasicAttack = true;
      } else if (phase % 3 !== 0) tap(choice, 'attack', phase % 2 || f.facing !== dir ? dir * speed : 0);
    }
  } else {
    choice = fight(input, match, f, target, { terrain, deck, level, offstage, phase, dy, d, dir });
  }
  // Release a consumed C-stick flick before requesting another one.
  if (f.cStickHeld && !f.inputBuffer.cStick) choice.cStickX = choice.cStickY = 0;
  // Replay sustained controls between decisions. Button edges and C-stick flicks last one tick.
  const held = createEmptyInput();
  for (const key of ['moveX', 'moveY', 'shieldAnalog', 'shield', 'lightShield', 'jump', 'attack', 'special', 'grab']) {
    held[key] = choice[key];
  }
  f.cpuHeldInput = held;
  if (level === 1 && f.cpuBasicAttack) return executePlan(f, choice, target, match.frame);
  return choice;
}

function executePlan(f, input, target, frame) {
  Object.assign(input, f.cpuHeldInput);
  if (f.cpuBasicAttack && f.grounded && (frame + 31 * (f.port + 1)) % 28 === 0) {
    f.cpuBasicAttack = false;
    if (Math.abs(target.x - f.x) < 42 && Math.abs(target.y - f.y) < 38) {
      return tap(input, 'attack', input.moveX);
    }
  }
  return input;
}

function fight(input, match, f, target, { terrain, deck, level, offstage, phase, dy, d, dir }) {
  const stats = f.def.stats;
  if (f.state === S.GRABBED) {
    if (match.frame % Math.max(2, 10 - level) === 0) return tap(input, 'attack');
    return input;
  }
  if (f.state === S.GRAB_HOLD) {
    const victim = match.fighters.find((o) => o.port === f.grabbing) ?? target;
    if (level >= 4 && f.stateFrame === 3) return tap(input, 'attack');
    if (f.pummelTimer > 4) return input;
    if (f.x - deck.x < 140 || deck.x + deck.w - f.x < 140) {
      input.moveX = f.x < deck.x + deck.w / 2 ? -1 : 1;
    } else {
      input.moveY = victim.percent < 55 ? -1 : 1;
    }
    return input;
  }
  if (f.state === S.RESPAWN) {
    if (target.state !== S.RESPAWN) input.moveX = dir;
    return input;
  }
  if (f.hitlag || f.hitstun > 0) {
    if (level < 5) return input;
    input.moveX = -sign(f.kbVx, -dir) * 0.82;
    input.moveY = 0.55;
    const safeToSlide = level === 8 || d > 75 || f.hitlag === 1;
    if (level >= 8 && safeToSlide && f.hitlag && !offstage && f.lastKnockback < 85 &&
        f.y - getSurfaceY(deck, f.x) < 18) {
      // Keep the last hitlag sample grounded so a light hit can be punished.
      const escape = f.x - dir * 75 > deck.x && f.x - dir * 75 < deck.x + deck.w ? -dir : dir;
      if (level === 9 && f.hitlag > 1) {
        input.moveX = f.hitlag % 2 ? escape : 0;
        input.moveY = 0;
      } else {
        input.moveX = (level === 8 ? sign(deck.x + deck.w / 2 - f.x) : escape) * 0.65;
        input.moveY = -1;
      }
    }
    if (!f.hitlag && level >= 6 && f.meteorHitFrame !== -999 && f.kbVy < 0 &&
        match.frame + 1 - f.meteorHitFrame >= MELEE.METEOR_CANCEL_MIN_FRAMES) {
      if (f.jumpsUsed < stats.maxJumps) return tap(input, 'jump', dir * 0.65);
      return tap(input, 'special', dir * 0.45, 1);
    }
    if (level >= 5 && !f.hitlag && f.state === S.TUMBLE && f.y - getSurfaceY(deck, f.x) < 35 &&
        f.kbVy + f.vy < -2 && f.techLock <= 0) {
      const escape = f.x - dir * 95 > deck.x && f.x - dir * 95 < deck.x + deck.w ? -dir : dir;
      return tap(input, 'shield', level >= 7 ? escape : input.moveX, input.moveY);
    }
    return input;
  }
  if (level === 9 && f.grounded && deck.ledges && f.vx &&
      (f.state === S.LANDING || !target.grounded && GROUND_APPROACH.has(f.state))) {
    const room = f.vx > 0 ? deck.x + deck.w - f.x : f.x - deck.x;
    const stoppingDistance = f.vx * f.vx / (2 * stats.traction * (match.stage.iceTraction ?? 1));
    if (room < stoppingDistance + 4) {
      input.moveX = -Math.sign(f.vx);
      return input;
    }
  }
  const chasingFair = level >= 7 && f.fighterId === 'garth' && target.hitstun > 0 &&
    target.receivedCombo?.port === f.port && target.receivedCombo.moves.at(-1) === M.FAIR;
  if (chasingFair && f.y >= getSurfaceY(deck, f.x) - 32 && d < 145) {
    input.moveX = dir;
    if (f.grounded && (f.state === S.IDLE || f.state === S.LANDING && f.stateFrame + 1 >= f.landingLag)) {
      return tap(input, 'jump', dir);
    }
    if (f.state === S.LANDING) return input;
    if (f.state === S.JUMPSQUAT || f.state === S.AIRBORNE && dy > -95 && dy < 36) {
      input.cStickY = -1;
      input.jump = true;
      return input;
    }
  }
  if (offstage && level >= 7 && f.fighterId === 'garth' && f.state === S.AIRBORNE && !f.didAerial &&
      f.jumpsUsed < stats.maxJumps && f.y >= getSurfaceY(deck, f.x) && !target.grounded &&
      d < 48 && dy > 0 && dy < 70 && Math.abs(f.x - clamp(f.x, deck.x, deck.x + deck.w)) < 36) {
    input.cStickX = dir;
    input.moveX = dir;
    return input;
  }
  // Begin the jump before reaching a wall or a gap. Keep holding jump through
  // squat, and use a double jump at the apex if the top is still overhead.
  const wall = match.surfaces.find((s) => {
    const edge = dir > 0 ? s.x : s.x + s.w;
    const ahead = (edge - f.x) * dir;
    return ahead >= -1 && ahead <= Math.min(d + 1, 85) && getSurfaceY(s, edge) > f.y + 8 &&
      s.y - s.h < f.y + stats.height * f.scale;
  });
  const edge = dir > 0 ? deck.x + deck.w : deck.x;
  const gap = f.grounded && (edge - f.x) * dir < 65 && (target.x - edge) * dir > 0 &&
    terrain.some((s) => s !== deck && (dir > 0 ? s.x - edge : edge - s.x - s.w) > 1 &&
      (dir > 0 ? s.x - edge : edge - s.x - s.w) < 300 && Math.abs(getSurfaceY(s, edge) - target.y) < 200);
  const lowCeiling = wall && match.surfaces.some((s) =>
    s !== wall && s.x < wall.x + wall.w && s.x + s.w > wall.x &&
    s.y - s.h >= getSurfaceY(wall, f.x) && s.y - s.h < getSurfaceY(wall, f.x) + stats.height * f.scale);
  // The Temple pillar fits under the roof, but a standing fighter does not.
  // Hit an opponent on its lip from the open face when the jump reaches it.
  if (lowCeiling && !f.grounded && f.state === S.AIRBORNE && d < 65 && dy >= 0 && dy < stats.height * f.scale) {
    return tap(input, 'attack', dir * 0.65, dy > stats.height * 0.8 ? 0.8 : 0);
  }
  if ((wall || gap) && (f.grounded || f.state === S.AIRBORNE || f.state === S.JUMPSQUAT)) {
    input.moveX = dir;
    input.jump = true;
    input.jumpPressed = f.grounded && f.state !== S.JUMPSQUAT ||
      !f.grounded && f.vy <= 2 && f.jumpsUsed < stats.maxJumps;
    return input;
  }
  if (offstage && !f.grounded) return recover(input, match, f, deck, level);
  if (f.state === S.JUMPSQUAT) {
    input.moveX = dir * 0.82;
    input.jump = !f.cpuWavedash && dy > 45;
    if (level >= 7 && f.prevState === S.DASH && !f.cpuWavedash && d <= stats.grabRange + 25 &&
        target.grounded && Math.abs(dy) < 36) return tap(input, 'grab', dir * 0.7);
    if (f.cpuWavedash && f.stateFrame >= Math.max(0, stats.jumpSquat - THINK_FRAMES[level])) {
      return tap(input, 'shield', dir * 0.9, -0.45);
    }
    return input;
  }
  if (f.state !== S.JUMPSQUAT) f.cpuWavedash = false;
  if (f.state === S.SMASH_CHARGE) {
    const m = f.moveData;
    const reach = ((m.offsetX ?? 30) + (m.radius ?? 30)) * f.scale + target.def.stats.width * 0.45;
    const dangerSoon = danger(match, f, level)?.eta <= 4 || evadeHazard(createEmptyInput(), match, f, deck);
    input.attack = !dangerSoon && f.smashChargeFrames < (level >= 8 ? 34 : 20) &&
      (d > reach * 0.8 || target.hitstun > 12);
    return input;
  }
  if (f.state === S.ATTACK) {
    input.moveX = d > 45 ? dir * 0.8 : 0;
    if (f.smashChargeKey) input.attack = true;
    if (level >= 5 && f.jabStep > 0 && f.jabStep < 3 && d < 80 && Math.abs(dy) < 45 &&
        f.moveFrame >= f.moveData.startup + f.moveData.active - 1) return tap(input, 'attack');
    if (f.charging) input.special = d > 150 && !danger(match, f, level);
    if (f.floating) input.jump = level >= 5 && dy > -55;
    if (level >= 6 && f.moveData?.jumpCancel && (f.moveRecorded || f.moveFrame >= 3)) {
      // Only wavedash out of shine when safely spaced; at point-blank, jump straight into aerial follow-up!
      const canWaveshine = level >= 7 && f.grounded && d > 44 && f.x + dir * 75 > deck.x && f.x + dir * 75 < deck.x + deck.w;
      f.cpuWavedash = canWaveshine && (level === 9 ? phase % 3 !== 0 : phase % 2 === 0);
      return tap(input, 'jump', dir * 0.72);
    }
    if (level >= 7 && f.didShortHop && f.didAerial && f.vy < -0.1 && !f.fastFalling) input.moveY = -1;
    if (level >= 5 && !f.grounded && f.moveData?.landingLag != null && f.vy + f.kbVy < 0 && !f.lCancelTimer) {
      const descent = Math.max(Math.abs(f.vy + f.kbVy), input.moveY === -1 ? stats.fastFallSpeed : 1);
      const m = f.moveData;
      const lastCancelable = m.startup + m.active + Math.floor(m.endlag * 0.65);
      const nearby = terrain.some((p) => {
        const height = f.y - getSurfaceY(p, f.x);
        const frames = Math.ceil(height / descent);
        const landingX = f.x + (f.vx + f.kbVx) * frames;
        return frames >= 0 && frames <= 4 && landingX >= p.x && landingX <= p.x + p.w &&
          f.moveFrame + frames <= lastCancelable;
      });
      if (nearby && (level === 9 || phase % 12 < level - 3)) return tap(input, 'shield', input.moveX, input.moveY);
    }
    return input;
  }
  if (BLOCKED.has(f.state)) return input;
  if (HURT.has(f.state) && f.state !== S.TUMBLE) {
    if (f.state === S.KNOCKDOWN) return tap(input, 'jump', dir);
    return input;
  }

  const threat = level >= 3 ? danger(match, f, level) : null;
  if (f.state === S.SHIELD || f.state === S.SHIELD_STUN) {
    if (level >= 7 && f.state === S.SHIELD && dy < -48 && d < 140 && match.platforms.some((p) => p.id === f.onPlatformId)) {
      input.shield = true;
      input.moveY = -0.7;
      return input;
    }
    if (level >= 7 && f.state === S.SHIELD && !threat && d < 52 && dy > 26 && dy < 105) return tap(input, 'special', 0, 1);
    const fastUSmash = (f.def.moves[M.USMASH]?.startup ?? 12) <= 11;
    if (level === 9 && fastUSmash && f.state === S.SHIELD && !threat && d < 55 && dy >= 0 && dy < 85 &&
        target.state !== S.SHIELD && target.invulnFrames <= 0) {
      input.cStickY = 1;
      return input;
    }
    if (f.state === S.SHIELD && d < stats.grabRange + 20 && Math.abs(dy) < 36 && !threat) return tap(input, 'grab');
    if (f.shieldHp > 11 && threat) {
      input.shield = true;
      input.lightShield = level >= 7 && f.lightShielding;
      input.shieldAnalog = input.lightShield ? 0.5 : 1;
    }
    return input;
  }
  if (evadeHazard(input, match, f, deck)) return input;
  if (level >= 8 && f.grounded && target.state === S.GRAB && target.stateFrame < 9 &&
      target.facing === -dir && d < target.def.stats.grabRange + 24 && Math.abs(dy) < 42) {
    return tap(input, 'shield', 0, -1);
  }
  if (threat && f.grounded && f.shieldHp > 14 && (level >= 7 || phase % 5 < level - 2)) {
    const roomBehind = f.x - dir * 85 > deck.x && f.x - dir * 85 < deck.x + deck.w;
    if (level >= 8 && threat.eta <= MELEE.POWERSHIELD_WINDOW) return tap(input, 'shield');
    if (level !== 9 && level >= 7 && !threat.projectile && roomBehind && d > stats.grabRange * 0.8 &&
        (threat.eta > MELEE.POWERSHIELD_WINDOW || phase % 3 === 0)) {
      input.lightShield = true;
      input.shieldAnalog = 0.5;
      return tap(input, 'shield');
    }
    if (level >= 7 && threat.eta <= MELEE.POWERSHIELD_WINDOW) return tap(input, 'shield');
    const reflector = [M.DOWN_B, M.NEUTRAL_B, M.SIDE_B].find((key) =>
      ['reflector', 'cape'].includes(f.def.moves[key]?.kind));
    const counter = [M.DOWN_B, M.NEUTRAL_B].find((key) => f.def.moves[key]?.kind === 'counter');
    if (level >= 7 && threat.projectile && reflector && (level === 9 || phase % 2 === 0)) return tap(input, 'special',
      reflector === M.SIDE_B ? sign(threat.x - f.x) : 0, reflector === M.DOWN_B ? -1 : 0);
    if (level >= 8 && !threat.projectile && counter && d < 90 && phase % 3 === 0) return tap(input, 'special', 0, counter === M.DOWN_B ? -1 : 0);
    if (level < 7 || (level >= 8 && threat.eta <= (level === 9 ? 7 : 5))) return tap(input, 'shield');
    // Wait for the next tick rather than starting a committed attack or shielding too early.
    return input;
  }
  if (match.suddenDeath && f.grounded && d < 71 && Math.abs(dy) < 42 && target.invulnFrames <= 0) {
    if (target.state === S.SHIELD) return tap(input, 'grab', dir * 0.4);
    input.cStickX = dir;
    input.cStickTilt = true;
    return input;
  }
  // Novices telegraph their approach and leave a punish window between swings.
  if (level <= 3 && f.grounded && dy > -60 && phase % 12 >= 10) {
    input.moveX = d > 160 ? dir * 0.54 : 0;
    if (d > 240 && phase === 45 && target.hitstun === 0) input.tauntPressed = true;
    return input;
  }
  if (level <= 3 && f.grounded && d < 220 && Math.abs(dy) < 45 && phase % 31 === 0) {
    return tap(input, 'special', d < 65 ? 0 : dir * 0.4, d < 65 ? -1 : 0);
  }
  if (useItem(input, match, f, target, deck, level)) return input;
  if (target.state === S.RESPAWN) {
    input.moveX = Math.abs(f.x) > 60 ? -sign(f.x) * 0.45 : 0;
    return input;
  }
  if (f.grounded && target.state === S.LEDGE_HANG && d < 120 && level >= 5) {
    if (d < 70) return tap(input, 'attack', dir * 0.38, -0.62);
    input.moveX = dir * 0.48;
    return input;
  }
  // Cover the ledge from stage, then commit to an aerial on a rising recovery.
  const outsideSide = terrain.some((s) => target.x >= s.x && target.x <= s.x + s.w && target.y >= getSurfaceY(s, target.x) - 10)
    ? 0 : target.x < deck.x ? -1 : target.x > deck.x + deck.w ? 1 : 0;
  if (level >= 7 && outsideSide && f.grounded && !target.grounded && dy < 42) {
    const edge = outsideSide < 0 ? deck.x : deck.x + deck.w;
    const step = edge - outsideSide * 28 - f.x;
    if (Math.abs(step) > 20) input.moveX = sign(step) * (Math.abs(step) > 75 ? 1 : 0.53);
    else if (f.fighterId === 'garth' && d < 60 && target.vy > 0 && dy > -62) {
      input.shortHopPressed = true;
      input.moveX = outsideSide;
      return input;
    }
    else if (target.vy > 0 && d < 95 && dy < -10) return tap(input, 'attack', outsideSide * 0.4, -0.62);
    else if (target.vy > 0 && dy >= -10 && d < 100) return tap(input, 'jump', outsideSide * 0.5);
    return input;
  }
  if (level >= 7 && f.grounded && d < 130 && dy < -48 && match.platforms.some((p) => p.id === f.onPlatformId)) {
    input.shieldAnalog = 0.5;
    input.lightShield = true;
    return tap(input, 'shield');
  }
  if (level >= 7 && !f.grounded && f.didShortHop && !f.didAerial && d < 135) {
    input.moveX = d > 25 ? dir * 0.9 : 0;
    if (f.vy <= 3) {
      if (dy < -55) input.cStickY = -1;
      else if (dy > 45) input.cStickY = 1;
      else input.cStickX = dir;
      if (f.vy < -0.1) input.moveY = -1;
    }
    return input;
  }
  if (level === 9 && (f.def.moves[M.USMASH]?.startup ?? 12) <= 11 && f.grounded && !target.grounded &&
      target.invulnFrames <= 0 && !offstage && dy > 28 && dy < 135 && target.vy + target.kbVy <= 1 &&
      Math.abs(target.x - f.x + (target.vx + target.kbVx) * 4) < 46) {
    input.cStickY = 1;
    return input;
  }
  if (level >= 7 && !offstage) {
    const ready = f.grounded && GROUND_APPROACH.has(f.state);
    if (f.fighterId === 'captain-pigeon' && target.jabReset && d < 80 &&
        (f.state === S.JUMPSQUAT || f.state === S.AIRBORNE)) {
      input.cStickX = dir;
      input.moveX = dir;
      return input;
    }
    if (ready && Math.abs(dy) < 35 && d < 65 && f.facing === dir) {
      if (target.state === S.KNOCKDOWN && ![S.RUN, S.DASH].includes(f.state)) return tap(input, 'attack');
      if (target.jabReset && target.hitstun > 3) {
        if (f.fighterId === 'gigglefluff' && d < 30) return tap(input, 'special', 0, -1);
        if (f.fighterId === 'captain-pigeon') return tap(input, 'jump', dir);
        input.cStickX = dir;
        return input;
      }
    }
    if (ready && f.def.moves[M.SIDE_B].kind === 'dancingBlade' && d >= 55 && d < 98 && Math.abs(dy) < 40) {
      return tap(input, 'special', dir);
    }
    if (ready && f.def.moves[M.NEUTRAL_B].kind === 'needles' && Math.abs(dy) < 65 &&
        (f.needleCount === 0 && d > 205 && target.grounded ||
         f.needleCount > 0 && (d > 115 || !target.grounded && d > 70))) {
      return tap(input, 'special', dir * 0.35);
    }
    if (ready && f.def.moves[M.DOWN_B].kind === 'bucket') {
      const incoming = match.projectiles.some((p) => p.ownerPort !== f.port && p.vx &&
        ['fireball', 'greenFire', 'flame', 'bolt', 'laser', 'orb', 'chargeOrb', 'shadowOrb'].includes(p.style) &&
        (p.x - f.x) * f.facing > 0 && (f.x - p.x) / p.vx > 0 &&
        (f.x - p.x) / p.vx < 15 && Math.abs(p.y - f.y - 31) < 45);
      if (f.bucketCount === 3 ? d < 110 && Math.abs(dy) < 45 && f.facing === dir : incoming) {
        return tap(input, 'special', 0, -1);
      }
    }
    if (ready && f.fighterId === 'broshee' && danger(match, f, level)?.eta <= 4) return tap(input, 'shield');
    if (ready && f.percent < 45 && d < 85 && [M.JAB, M.FTILT, M.DTILT].includes(target.moveKey) &&
        danger(match, f, level)?.eta <= 4) {
      input.moveY = -1;
      return input;
    }
    if (f.state === S.AIRBORNE && f.vy < -2 && d > 105 && dy < -35 &&
        match.platforms.some((p) => f.x > p.x + 40 && f.x < p.x + p.w - 40 &&
          f.y - getSurfaceY(p, f.x) > 0 && f.y - getSurfaceY(p, f.x) < 20)) {
      return tap(input, 'shield', dir * 0.65, -0.7);
    }
  }
  if (navPlatform(input, match, f, target)) return input;

  if (!f.grounded) {
    input.moveX = d > 43 ? dir : d < 21 ? -dir * 0.35 : 0;
    if (d < 90 && dy > -74 && dy < 72 && target.invulnFrames < 6) {
      const y = dy > 42 ? 0.88 : dy < -36 ? -0.8 : 0;
      tap(input, 'attack', dir * 0.65, y);
      if (f.def.canFloat && level >= 5) {
        input.jump = true;
        if (!f.floating && f.jumpsUsed < 2 && dy <= 0) input.moveY = -0.8;
      }
      return input;
    }
    if (f.vy < -1 && dy < -60 && level >= 5 && f.prevMoveY >= -0.55 && d < 110) input.moveY = -1;
    return input;
  }

  const predicted = Math.abs(target.x - f.x + (target.vx + target.kbVx - f.vx) * 4);
  const attackRange = Math.max(66, (f.def.moves[M.FTILT].offsetX ?? 42) + 25);
  const neutralB = f.def.moves[M.NEUTRAL_B];
  const sideB = f.def.moves[M.SIDE_B];
  if (target.invulnFrames > 8 && d < 135 && match.mode !== MODE.HOMERUN) {
    input.moveX = f.x > deck.x + 80 && f.x < deck.x + deck.w - 80 ? -dir * 0.64 : 0;
    return input;
  }
  if ((d < attackRange || d < attackRange + 42 && predicted < attackRange) && dy > -48 && dy < 38) {
    if (level >= 8 && (target.state === S.SHIELD || target.state === S.SHIELD_STUN) && d < stats.grabRange + 16) {
      return tap(input, 'grab', dir * 0.4);
    }
    // Use the quicker forward tilt unless the victim is locked down long enough for a smash.
    if (level === 9 && f.fighterId === 'sourzer' && target.invulnFrames <= 0 &&
        target.state !== S.SHIELD && target.state !== S.SHIELD_STUN && target.hitstun < 15) {
      return tap(input, 'attack', dir * 0.58);
    }
    if (level >= 7 && f.state === S.DASH && d < stats.grabRange + 22 && target.grounded &&
        (target.state === S.SHIELD || (level >= 8 && phase % 5 === 0))) return tap(input, 'jump', dir * 0.7);
    const hittable = target.invulnFrames <= 0 && !BLOCKED.has(target.state);
    const committed = target.state === S.LANDING || target.hitstun > 4 ||
      target.state === S.ATTACK && target.moveFrame >= target.moveData.startup + target.moveData.active;
    const edgeDistance = dir > 0 ? deck.x + deck.w - target.x : target.x - deck.x;
    const fastFSmash = (f.def.moves[M.FSMASH]?.startup ?? 14) <= 13;
    if (level >= 8 && hittable && target.state !== S.SHIELD && target.state !== S.SHIELD_STUN &&
        predicted < attackRange && d < attackRange && dy < 30 &&
        (committed ||
         (fastFSmash && level === 9 && (target.percent >= 65 || edgeDistance < 200 && target.percent >= 50)) ||
         (fastFSmash && level === 8 && target.percent >= 78) ||
         (!fastFSmash && target.percent >= 92 && (level === 9 || target.hitstun > 4)))) {
      input.cStickX = dir;
      return input;
    }
    if (level >= 7 && f.def.moves[M.DOWN_B].jumpCancel && d < 46 && Math.abs(dy) < 34 &&
        target.state !== S.SHIELD && (target.hitstun > 0 || (level === 9 ? phase % 4 < 2 : phase % 6 === 0))) {
      return tap(input, 'special', 0, -1);
    }
    if ((target.state === S.SHIELD || target.state === S.SHIELD_STUN || phase % 11 === 0) &&
        level >= 3 && d < stats.grabRange + 18) return tap(input, 'grab', dir * 0.4);
    if (f.def.moves[M.DOWN_B].kind === 'rest' && level >= 7 && d < 30 && phase % 3 === 0) return tap(input, 'special', 0, -1);
    if (target.percent >= 85 || level >= 5 && (fastFSmash || level <= 7) && phase % 7 <= 1) {
      if (match.mode === MODE.HOMERUN && target.percent > 65 || dy <= 22) input.cStickX = dir;
      else input.cStickY = 1;
      if (level === 7 && (target.hitstun > 8 || d > attackRange * 0.65)) input.attack = input.attackPressed = true;
      return input;
    }
    if (target.hitstun > 0 && dy > 14) return tap(input, 'attack', 0, 0.61);
    return tap(input, 'attack', d < 44 && f.facing === dir && (level >= 8 || phase % 5 < 2) ? 0 : dir * 0.58);
  }
  const nimbleWavedash = stats.runSpeed >= 9.0 || stats.traction <= 0.085;
  if (level >= 8 && d > 175 && d < 260 && Math.abs(dy) < 40 && target.state !== S.ATTACK &&
      f.x + dir * 210 > deck.x && f.x + dir * 210 < deck.x + deck.w &&
      (nimbleWavedash ? phase % 29 < (level === 9 ? 5 : 2) : phase % 47 < (level === 9 ? 2 : 1))) {
    f.cpuWavedash = true;
    return tap(input, 'jump', dir);
  }
  if (level >= 5 && d >= 78 && d < 145 && Math.abs(dy) < 50 && phase % 13 < (level >= 7 ? 5 : 2)) {
    input.shortHopPressed = true;
    input.moveX = dir;
    return input;
  }
  if (level >= 5 && d > 135 && d < 230 && phase < 22 && target.grounded &&
      target.state !== S.ATTACK && f.x > deck.x + 135 && f.x < deck.x + deck.w - 135) {
    input.moveX = phase % 12 < 6 ? -dir : dir;
    return input;
  }
  if (level === 9 && neutralB.kind === 'projectile' && neutralB.projStyle && (neutralB.startup ?? 14) <= 14 &&
      d > 200 && d < 480 && Math.abs(dy) < 32 &&
      f.facing === dir && target.invulnFrames <= 0 && target.state !== S.SHIELD && phase % 36 < 12) {
    return tap(input, 'special');
  }
  if (level >= 4 && d > 140 && d < 420 && Math.abs(dy) < 32 &&
      ['projectile', 'chargeShot'].includes(neutralB.kind) && neutralB.projStyle && f.facing === dir && phase % 29 < 3) {
    return tap(input, 'special');
  }
  if (level >= 4 && d >= 90 && d <= 190 && Math.abs(dy) < 35 && sideB.kind === 'dashBurst' && !DIRECT_SIDE.has(f.fighterId) && phase % 19 < 3 &&
      target.x > deck.x + 85 && target.x < deck.x + deck.w - 85) return tap(input, 'special', dir);
  if (level >= 7 && d >= 105 && d < 170 && phase % 23 < 2 && f.x > deck.x + 110 && f.x < deck.x + deck.w - 110) {
    f.cpuWavedash = true;
    return tap(input, 'jump', dir);
  }
  if (level >= 5 && d > 88 && d < 151 && dy > 21 && phase % 6 < 2) return tap(input, 'jump', dir);
  input.moveX = d > 94 ? dir : d > 20 ? dir * 0.58 : 0;
  if (target.x < deck.x - 20 || target.x > deck.x + deck.w + 20) {
    const nextX = f.x + dir * 54;
    if (!terrain.some((s) => nextX >= s.x && nextX <= s.x + s.w && Math.abs(getSurfaceY(s, nextX) - f.y) < 54)) input.moveX = 0;
  }
  return input;
}

function deckDistance(deck, f) {
  const x = clamp(f.x, deck.x, deck.x + deck.w);
  const dy = getSurfaceY(deck, x) - f.y;
  // A one-way landing is reachable from below. A solid overhead needs a detour.
  const detour = deck.h != null && dy > 32 && x === f.x ? Math.min(x - deck.x, deck.x + deck.w - x) : 0;
  return Math.abs(f.x - x) + Math.abs(dy) * (dy > 0 ? 1.3 : 0.65) + detour;
}
