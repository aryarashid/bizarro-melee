/**
 * Bizarro Melee 2D Canvas Renderer.
 * Composes DynamicCamera & FxSystem from ./fx.js with bespoke procedural Bizarro art
 * for all 26 playable fighters (+ Sagging Bag & Master Mitt) and all 6 stages + Sandbag Yard.
 */

import { MELEE, MODE, STATE, PLAYER_COLORS, WORLD_SCALE } from './constants.js';
import { DynamicCamera, FxSystem, fighterTag, victoryOrder, flashesAllowed, fighterHidden, specialVisual } from './fx.js';
import { drawIllustratedPortrait } from './portraits.js';

const HAZARD_WARNINGS = {
  pizzaVan: { label: 'PIZZA VAN INCOMING!', color: '#ffab75' },
  starshipLaser: { label: 'LASER LOCK!', color: '#8bf3ff' },
  fineRocket: { label: 'FINE ROCKET!', color: '#ff8e89' },
};

const itemIcons = {
  barcode_raygun: 'raygun', leafblower_scope: 'super_scope', hotsauce_flower: 'fire_flower',
  invinci_star: 'star_badge', first_aid: 'heart_box', speed_bump: 'bumper', tupperware_shell: 'green_shell',
};

// All silhouettes are drawn around the pickup center on the same 40-unit grid.
function drawItemIcon(ctx, item) {
  const id = item.def?.id, key = itemIcons[id] || id;
  const box = (x, y, w, h, r, ink, edge = true) => {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); fill(ink, edge);
  };
  const ellipse = (x, y, rx, ry, ink, edge = true) => {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); fill(ink, edge);
  };
  const poly = (points, ink, edge = true) => {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath(); fill(ink, edge);
  };
  const fill = (ink, edge = true) => {
    ctx.fillStyle = ink; ctx.fill();
    if (edge) { ctx.strokeStyle = '#1a152c'; ctx.stroke(); }
  };
  const gray = '#515672', ivory = '#fff2d4', gold = '#ffcb59', red = '#ff4f6d';
  ctx.save();
  ctx.scale((item.def?.radius || 20) / 20, (item.def?.radius || 20) / 20);
  ctx.lineWidth = 2.3; ctx.lineJoin = ctx.lineCap = 'round';
  switch (key) {
    case 'plunger_bat':
      ctx.rotate(-.66);
      box(-22, -3, 42, 6, 3, '#d5a171'); box(-22, -3, 10, 6, 2, gray);
      poly([[8,-4],[14,-5],[18,-13],[23,-13],[23,13],[18,13],[14,5],[8,4]], red);
      ellipse(24, 0, 3.2, 13, '#b72852');
      break;
    case 'alarm_omb':
      box(-13, 9, 10, 10, 3, gold); box(3, 9, 10, 10, 3, gold);
      ellipse(0, 0, 14, 14, '#34405d');
      box(-4, -19, 8, 6, 2, '#b3cee5'); ellipse(9, -19, 5, 3, red);
      ellipse(0, 0, 8, 8, ivory); poly([[0,-5],[1,-1],[5,1],[0,1]], '#4b3654', false);
      break;
    case 'raygun':
      poly([[-12,0],[1,0],[-5,15],[-14,15]], gray);
      box(-17, -12, 28, 15, 5, '#89f1ff'); box(8, -9, 13, 9, 2, '#f7f6ff');
      for (let i = 0; i < 3; i++) box(-11+i*5, -9, 2, 7, 0, '#22677d', false);
      ellipse(20, -5, 3, 5, '#ffda68');
      break;
    case 'super_scope':
      ctx.rotate(-.2);
      poly([[-8,1],[3,1],[-2,14],[-9,14]], gray);
      box(-24, -9, 48, 14, 5, '#929aba'); box(7, -12, 12, 20, 3, gray);
      ellipse(23, -2, 4, 8, '#ffb43c'); box(-16, -14, 12, 6, 2, '#b4f5df');
      break;
    case 'fire_flower':
      box(-2, -3, 4, 21, 2, '#4cd981');
      poly([[0,14],[-13,15],[-15,8],[-7,7],[0,13],[6,6],[15,8],[14,12]], '#51dc80');
      ellipse(0, -6, 15, 12, red); ellipse(0, -6, 10, 8, gold); ellipse(0, -6, 5, 4, ivory, false);
      break;
    case 'bigly_shroom': case 'tiny_shroom': {
      const tiny = key === 'tiny_shroom';
      box(-8, -1, 16, 17, 5, ivory);
      ctx.beginPath(); ctx.moveTo(-17, 2); ctx.bezierCurveTo(-19,-23,19,-23,17,2);
      ctx.quadraticCurveTo(0,10,-17,2); fill(tiny ? '#ad70ee' : red);
      ellipse(0, -8, tiny ? 4 : 6.5, tiny ? 4 : 7, tiny ? '#77f5db' : '#fff3ed', false);
      ellipse(-3, 10, 1.4, 2.7, '#3c304c', false); ellipse(3, 10, 1.4, 2.7, '#3c304c', false);
      break;
    }
    case 'star_badge':
      poly(Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 9 : 19;
        return [Math.cos(a) * r, Math.sin(a) * r];
      }), gold);
      ellipse(-3, 0, 1.5, 3.3, '#483144', false); ellipse(3, 0, 1.5, 3.3, '#483144', false);
      break;
    case 'heart_box':
      ctx.beginPath(); ctx.moveTo(0, 17); ctx.bezierCurveTo(-38, -7, -12, -24, 0, -10);
      ctx.bezierCurveTo(12, -24, 38, -7, 0, 17); fill('#ff77ab');
      box(-2, -7, 4, 13, 1, '#fff4f0', false); box(-6.5, -2.5, 13, 4, 1, '#fff4f0', false);
      break;
    case 'glow_saber':
      ctx.rotate(-.64);
      box(-22, -3.5, 15, 7, 2, gray); box(-9, -9, 5, 18, 2, '#f2eeff');
      ctx.shadowColor = '#64efff'; ctx.shadowBlur = 6;
      box(-4, -4, 28, 8, 4, '#57efff', false); box(0, -1.8, 23, 3.6, 2, '#edffff', false);
      break;
    case 'bumper':
      ellipse(0, 4, 20, 11, '#9e254e'); ellipse(0, 0, 20, 11, red);
      ellipse(0, 0, 12, 5.5, gold); ellipse(0, -1, 5, 2, ivory, false);
      break;
    case 'green_shell':
      ctx.beginPath(); ctx.moveTo(-18, 6); ctx.bezierCurveTo(-17,-20,17,-20,18,6); ctx.closePath(); fill('#40c778');
      poly([[-9,-4],[0,-13],[9,-4],[5,6],[-5,6]], '#93ee87');
      box(-19, 3, 38, 8, 4, ivory);
      break;
    case 'critter_capsule':
      ellipse(0, 0, 17, 17, '#fff4ee');
      ctx.beginPath(); ctx.arc(0, 0, 17, Math.PI, 2*Math.PI); ctx.closePath(); fill('#a973f6');
      box(-16, -2.5, 32, 5, 2, '#372452', false); ellipse(0, 0, 5.5, 5.5, gold);
      break;
    case 'mallet_chaos':
      ctx.rotate(-.34);
      box(-3, -5, 6, 28, 2, '#d59d66'); box(-19, -19, 38, 19, 5, gray);
      box(-19, -19, 8, 19, 3, gold); box(11, -19, 8, 19, 3, gold);
      poly([[1,-16],[-5,-9],[-.5,-9],[-2,-3],[6,-11],[1,-11]], gold, false);
      break;
    default: ctx.restore(); return false;
  }
  ctx.restore();
  return true;
}

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 1280;
    this.height = 720;
    this.dpr = 1;
    this.camera = new DynamicCamera();
    this.fx = new FxSystem();
    this.fx.attachClassic(this);
    this.lastStageId = null;
  }

  resize(width, height, dpr = 1) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.dpr = Math.min(2, Math.max(1, dpr));
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
  }

  reset(stage) {
    this.fx.clear();
    this.camera.reset(stage);
    this.lastStageId = stage?.id || null;
  }

  ingestEvents(events, match) {
    if (!events || !events.length) return;
    if (match?.stage && this.lastStageId !== match.stage.id) this.reset(match.stage);
    this.fx.ingestEvents(events, match);
  }

  render(match, options = {}) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    if (!match || !match.stage) {
      ctx.fillStyle = '#0b081b';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      return;
    }

    if (this.lastStageId !== match.stage.id) {
      this.reset(match.stage);
    }

    const flash = flashesAllowed(options);
    this.fx.allowFlash = flash;
    this.fx.match = match;
    if (options.victoryMode) {
      this._drawVictory(ctx, match, w, h, flash);
      ctx.restore();
      return;
    }
    this.victoryMatch = null;
    const shake = !flash || options.shakeEnabled === false ? 0 : (match.screenShake || 0);
    // Like the 3D view, frame the batter and bag together until the launch clears the plate.
    const derbyBag = match.mode === MODE.HOMERUN ? match.fighters.find((f) =>
      f.def.id === 'sagging-bag' && f.state !== STATE.DEAD &&
      (f.x > 600 || (match.homerun?.launched && f.x > 360))) : null;
    const targets = match.mode === MODE.TARGETS ? match.targets : null;
    this.camera.update(match.fighters, match.stage, w, h, shake, derbyBag, targets);

    // Spawn knockback smoke trails for fighters flying in tumble/hitstun
    for (const f of match.fighters) {
      if ((f.state === STATE.TUMBLE || f.state === STATE.HITSTUN) && (match.frame % 2 === 0)) {
        const speed = Math.hypot((f.kbVx || 0) + (f.vx || 0), (f.kbVy || 0) + (f.vy || 0));
        if (speed > 7) {
          this.fx.spawnTrail(f.x, f.y + f.def.stats.height * (f.scale || 1) * .5, f.palette?.accent || '#ffffff', Math.min(18, 6 + speed * 0.4));
        }
      }
    }
    if (match.status !== 'paused') {
      this.fx.update();
    }

    // 1. Sky & Parallax Backdrop (screen space)
    this._drawBackground(ctx, match, w, h);

    // 2. World-space rendering (Y-up -> draw at (x, -y))
    ctx.save();
    this.camera.applyTransform(ctx, w, h);

    this.fx.drawBack(ctx);
    this._drawStage(ctx, match);
    this._drawExtras2D(ctx, match);
    this._drawProjectiles(ctx, match);

    for (const f of match.fighters) {
      if (f.state === STATE.DEAD) continue;
      this._drawFighter(ctx, f, match, options);
    }

    if (options.showHitboxes) {
      this._drawHitboxes(ctx, match);
    }

    this.fx.drawFront(ctx);
    ctx.restore();

    if (flash && options.shakeEnabled !== false && match.screenFlash > 0.01) {
      const intensity = match.fighters.length >= 4 ? .023 : .035;
      ctx.fillStyle = `rgba(255,245,225,${Math.min(.18, match.screenFlash * intensity)})`;
      ctx.fillRect(0, 0, w, h);
    }

    // 3. Screen-space warnings, port tags and off-screen fighter indicators.
    ctx.save();
    this.camera.applyTransform(ctx, w, h);
    for (const f of match.fighters) {
      if (f.state !== STATE.DEAD && !fighterHidden(f, specialVisual(f))) this._drawTag(ctx, f, match.fighters.length);
    }
    ctx.restore();
    const warning = match.hazards?.find((hz) => hz.warningFrames > 0 && HAZARD_WARNINGS[hz.kind]);
    if (warning) this._drawHazardWarningBanner(ctx, warning, w, h);
    this._drawOffscreenIndicators(ctx, match, w, h, derbyBag);

    ctx.restore();
  }

  _drawBackground(ctx, match, w, h) {
    const stage = match.stage;
    const pal = stage.palette;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, pal.skyTop);
    grad.addColorStop(0.58, pal.skyMid);
    grad.addColorStop(1, pal.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const t = match.frame * 0.016;
    const px = -(this.camera.x || 0) * 0.08;
    const py = (this.camera.y || 0) * 0.05;

    ctx.save();
    if (stage.theme === 'cosmos') {
      // Cosmic spreadsheet grid + stars + neon rings
      ctx.strokeStyle = 'rgba(255, 102, 204, 0.14)';
      ctx.lineWidth = 1;
      const step = 48;
      const offX = ((px + t * 18) % step + step) % step;
      for (let x = offX - step; x < w + step; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      const offY = ((py + t * 12) % step + step) % step;
      for (let y = offY - step; y < h + step; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // Glowing nebula orb
      const rg = ctx.createRadialGradient(w * 0.5 + px, h * 0.42 + py, 20, w * 0.5 + px, h * 0.42 + py, Math.max(w, h) * 0.42);
      rg.addColorStop(0, 'rgba(255, 92, 194, 0.35)');
      rg.addColorStop(0.5, 'rgba(56, 245, 255, 0.12)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    } else if (stage.theme === 'twilight') {
      // Arguefield: floating twilight ruins + stars + big moon
      ctx.fillStyle = 'rgba(255, 245, 210, 0.9)';
      ctx.beginPath();
      ctx.arc(w * 0.78 + px * 0.5, h * 0.22 + py * 0.5, 44, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(26, 24, 58, 0.55)';
      for (let i = 0; i < 6; i++) {
        const bx = ((i * 260 + px * 1.3) % (w + 260)) - 100;
        const bh = 120 + (i % 3) * 55;
        ctx.fillRect(bx, h - bh, 56, bh);
        ctx.fillRect(bx - 10, h - bh, 76, 14);
      }
    } else if (stage.theme === 'craft') {
      // Scandall's Tax Shelter: cardboard clouds & pastel hills
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      for (let i = 0; i < 6; i++) {
        const cx = ((i * 260 + t * 14 + px) % (w + 240)) - 120;
        const cy = 70 + (i % 3) * 58;
        ctx.beginPath();
        ctx.arc(cx, cy, 30, 0, Math.PI * 2);
        ctx.arc(cx + 26, cy - 8, 24, 0, Math.PI * 2);
        ctx.arc(cx + 52, cy, 26, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(116, 198, 92, 0.55)';
      ctx.beginPath();
      ctx.ellipse(w * 0.25 + px, h + 20, w * 0.45, 190, 0, 0, Math.PI * 2);
      ctx.ellipse(w * 0.78 + px, h + 40, w * 0.48, 210, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (stage.theme === 'fountain') {
      // Puddle of Insomnia: twinkling stars + crescent moon + shimmer
      ctx.fillStyle = 'rgba(210, 248, 255, 0.75)';
      for (let i = 0; i < 42; i++) {
        const sx = (i * 197.3) % w;
        const sy = (i * 89.7) % (h * 0.7);
        const r = 1 + ((i + Math.floor(t * 2)) % 3 === 0 ? 1.4 : 0.4);
        ctx.fillRect(sx, sy, r * 2, r * 2);
      }
    } else if (stage.theme === 'suburb') {
      // Nightmare Suburb: fluffy clouds + suburban silhouette + wind lines
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      for (let i = 0; i < 5; i++) {
        const cx = ((i * 310 + t * 22 + px) % (w + 260)) - 130;
        const cy = 90 + (i % 2) * 65;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 62, 24, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const wind = typeof stage.wind === 'function' ? stage.wind(match.frame) : 0;
      if (Math.abs(wind) > 0.05) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 14; i++) {
          const wy = (i * 63 + 25) % h;
          const wx = (((t * 480 * Math.sign(wind)) + i * 173) % (w + 200) + (w + 200)) % (w + 200) - 100;
          ctx.beginPath();
          ctx.moveTo(wx, wy);
          ctx.lineTo(wx + 80 * Math.sign(wind), wy);
          ctx.stroke();
        }
      }
    } else if (stage.theme === 'stadium') {
      // Critter Arena / Sandbag Yard: stadium floodlights & jumbotron
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(w * 0.15, 0); ctx.lineTo(w * 0.45, h); ctx.lineTo(w * 0.05, h); ctx.closePath();
      ctx.moveTo(w * 0.85, 0); ctx.lineTo(w * 0.95, h); ctx.lineTo(w * 0.55, h); ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  _drawVictory(ctx, match, w, h, motion) {
    if (this.victoryMatch !== match) {
      this.victoryMatch = match;
      this.victoryStart = performance.now();
    }
    const draw = match.winnerPort == null && match.winningTeam == null;
    const elapsed = motion ? (performance.now() - this.victoryStart) / 1000 : .84;
    const fighters = victoryOrder(match);
    const won = (f) => match.winningTeam == null ? f.port === match.winnerPort : f.team === match.winningTeam;
    const unit = Math.min(w / (fighters.length > 3 ? 440 : 350), h / 420, 2.4);
    const baseY = h * (w < h ? .48 : .55);
    const back = ctx.createLinearGradient(0, 0, 0, h);
    back.addColorStop(0, '#17112b'); back.addColorStop(.49, '#332354'); back.addColorStop(1, '#0c0b21');
    ctx.fillStyle = back; ctx.fillRect(0, 0, w, h);
    const halo = ctx.createRadialGradient(w/2, baseY - 89*unit, 8, w/2, baseY - 73*unit, 162*unit);
    halo.addColorStop(0, draw ? '#78cbea47' : '#ffd18b48'); halo.addColorStop(1, '#fff6d100');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w/2, baseY);
    ctx.scale(unit, unit);
    ctx.fillStyle = '#d5bde8';
    ctx.globalAlpha = .20;
    ctx.beginPath(); ctx.moveTo(-23, -270); ctx.lineTo(23, -270); ctx.lineTo(123, 2); ctx.lineTo(-123, 2); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#16122a';
    ctx.beginPath(); ctx.ellipse(0, 12, 204, 23, 0, 0, Math.PI * 2); ctx.fill();
    const spread = fighters.length === 2 ? [-43, 47] : fighters.length === 4 ? [-45, 45, -130, 130] : [0, -89, 89];
    const podium = fighters.map((f, i) => {
      const first = !draw && won(f), x = fighters.length === 1 ? 0 : spread[i];
      return { f, i, x, first, top: draw ? -22 : first ? -57 : -33 + Math.max(0, i - 1) * 8 };
    });
    for (const { x, i, top, first, f } of podium) {
      const face = ctx.createLinearGradient(0, top, 0, 6);
      face.addColorStop(0, first ? '#ad7435' : '#4b4471'); face.addColorStop(1, first ? '#51304b' : '#231d44');
      ctx.fillStyle = face; ctx.strokeStyle = '#181329'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x - 38, top, 76, 6 - top, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = first ? '#ffdc81' : '#a799ca'; ctx.fillRect(x - 35, top + 2, 70, 4);
      ctx.fillStyle = PLAYER_COLORS[f.port % PLAYER_COLORS.length];
      ctx.fillRect(x - 22, 0, 44, 3);
      ctx.fillStyle = '#fff4e1'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 17px system-ui';
      const rank = first ? 1 : match.winningTeam != null ? 2 : i + 1;
      ctx.fillText(draw ? '–' : String(rank), x, top * .45 + 4);
    }
    if (!draw) for (let i = 0; i < 36; i++) {
      const t = ((i * .618 + elapsed * (.12 + (i % 3) * .025)) % 1);
      const px = (i * 103 % 383) - 191 + Math.sin(i + t * 7) * 15;
      ctx.save(); ctx.translate(px, -218 + t*204); ctx.rotate(i + t*9);
      ctx.globalAlpha = .80 * Math.sin(t*Math.PI);
      ctx.fillStyle = ['#ffd369', '#b8aaff', '#69caff', '#ff799b'][i % 4];
      ctx.fillRect(-2, -3, 4, 6); ctx.restore();
    }
    for (const { f, x, top, first, i } of podium) {
      const sc = (first ? 92 : 74) / f.def.stats.height;
      const phase = elapsed * (first ? 6 : 8) + i;
      const bounce = first ? Math.abs(Math.sin(phase)) * 9 : 0;
      ctx.fillStyle = '#160e2460';
      ctx.beginPath(); ctx.ellipse(x, top - 1, first ? 22 : 18, 4, 0, 0, Math.PI * 2); ctx.fill();
      const actor = { ...f, state: STATE.IDLE, grounded: false, hitlag: 0, scale: sc, squashX: 1, squashY: 1,
        facing: x < 0 ? 1 : -1, podiumPose: first ? 'cheer' : draw ? null : 'clap', podiumPhase: phase };
      this._drawFighterBody(ctx, actor, f.def, f.def.stats, f.palette || f.def.palettes[0], f.def.rig || {},
        x, top - bounce, { frame: elapsed * 60 });
    }
    ctx.restore();
  }

  _drawStage(ctx, match) {
    const stage = match.stage;
    const pal = stage.palette;

    // Hot racing asphalt floor (Mute City / Big Blue)
    if (Number.isFinite(stage.hotFloorY)) {
      const hy = -stage.hotFloorY;
      ctx.save();
      ctx.fillStyle = '#1f1635';
      ctx.fillRect(-1600, hy, 3200, 120);
      ctx.fillStyle = '#ff5722';
      ctx.fillRect(-1600, hy, 3200, 8);
      ctx.fillStyle = '#ffdd33';
      const offset = (match.frame * 24) % 120;
      for (let rx = -1500 - offset; rx < 1500; rx += 120) {
        ctx.fillRect(rx, hy + 26, 62, 6);
      }
      ctx.restore();
    }

    // Rushing rapid river (Jungle Japes)
    if (stage.riverFlow) {
      const ry = -stage.riverFlow.y;
      ctx.save();
      ctx.fillStyle = 'rgba(26, 175, 224, 0.55)';
      ctx.fillRect(-1600, ry, 3200, 500);
      ctx.fillStyle = 'rgba(220, 250, 255, 0.75)';
      const offset = (match.frame * 14) % 90;
      for (let rx = -1500 + offset; rx < 1500; rx += 90) {
        ctx.fillRect(rx, ry + 6, 44, 5);
      }
      ctx.restore();
    }

    // Solid ground decks (supports live dynamic surfaces, transformations, slopes & breakable bridges)
    const solids = match.surfaces || stage.solid || [];
    for (const s of solids) {
      const topL = -s.y;
      const topR = -(s.y + (s.slope || 0));
      const botY = Math.max(topL, topR) + s.h;
      const inset = s.walkOff ? 0 : Math.min(36, s.w * 0.14);
      ctx.fillStyle = s.shape === 'balloon' ? '#ec4899' : pal.deckBody;
      ctx.beginPath();
      ctx.moveTo(s.x, topL);
      ctx.lineTo(s.x + s.w, topR);
      ctx.lineTo(s.x + s.w - inset, botY);
      ctx.lineTo(s.x + inset, botY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Sloped top deck surface
      ctx.fillStyle = s.shape === 'balloon' ? '#f472b6' : pal.deckTop;
      ctx.beginPath();
      ctx.moveTo(s.x, topL);
      ctx.lineTo(s.x + s.w, topR);
      ctx.lineTo(s.x + s.w, topR + 20);
      ctx.lineTo(s.x, topL + 20);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = pal.deckTrim;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(s.x, topL + 20);
      ctx.lineTo(s.x + s.w, topR + 20);
      ctx.stroke();

      // Highlighted ledges
      if (s.ledges && !s.walkOff) {
        ctx.fillStyle = pal.accent;
        ctx.fillRect(s.x - 4, topL - 2, 22, 12);
        ctx.fillRect(s.x + s.w - 18, topR - 2, 22, 12);
      }
    }

    // Interactive Warp Pipes (Corporate Kingdom)
    for (const pipe of stage.warpPipes || []) {
      const px = pipe.x, py = -pipe.y;
      ctx.save();
      ctx.fillStyle = '#16a34a';
      ctx.strokeStyle = '#052e16';
      ctx.lineWidth = 3;
      ctx.fillRect(px - 24, py - 38, 48, 38);
      ctx.strokeRect(px - 24, py - 38, 48, 38);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(px - 30, py - 48, 60, 14);
      ctx.strokeRect(px - 30, py - 48, 60, 14);
      ctx.restore();
    }

    // Oscillating Barrel Cannon (Kongo Jungle / 64)
    if (match.barrelCannon || stage.barrelCannon) {
      const bc = match.barrelCannon || { x: 0, y: stage.barrelCannon.y, angle: 0 };
      ctx.save();
      ctx.translate(bc.x, -bc.y);
      ctx.rotate(bc.angle || 0);
      ctx.fillStyle = '#92400e';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(-26, -32, 52, 64, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffdf4d';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', 0, 7);
      ctx.restore();
    }

    // Home-Run Derby glass barrier & distance markers
    if (stage.barrierX) {
      if (!match.homerun?.barrierBroken) {
        ctx.save();
        ctx.fillStyle = 'rgba(124, 232, 255, 0.25)';
        ctx.strokeStyle = '#7ce8ff';
        ctx.lineWidth = 4;
        ctx.fillRect(stage.barrierX - 6, -340, 12, 340);
        ctx.strokeRect(stage.barrierX - 6, -340, 12, 340);
        ctx.restore();
      }
      // Keep the ruler's horizontal positions tied to the runway, even when it drops out of view.
      const { zoom } = this.camera;
      const groundY = this.camera.worldToScreen(0, 0, this.width, this.height).sy;
      const rulerY = Math.min(0, (this.height * 0.72 - groundY) / zoom);
      const halfView = (this.width * 0.5 + 60 + Math.abs(this.camera.shakeX)) / zoom;
      const rulerStart = stage.spawns[1].x;
      ctx.save();
      ctx.font = `bold ${Math.max(20, 12 / zoom)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(12, 10, 28, 0.86)';
      ctx.lineWidth = 2 / zoom;
      if (rulerY < 0) {
        ctx.fillStyle = 'rgba(255, 247, 206, 0.36)';
        ctx.fillRect(rulerStart, rulerY, 5000 * WORLD_SCALE, 1 / zoom);
      }
      for (let ft = 50; ft <= 5000; ft += 50) {
        const mx = rulerStart + ft * WORLD_SCALE;
        if (Math.abs(mx - this.camera.x) > halfView) continue;
        const major = ft % 250 === 0;
        const tickHeight = major ? 32 : 20;
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(mx - 2, rulerY - tickHeight, 4, tickHeight);
        ctx.fillStyle = major ? '#fff08a' : '#fff7ce';
        ctx.strokeText(`${ft} ft`, mx, rulerY - tickHeight - 8);
        ctx.fillText(`${ft} ft`, mx, rulerY - tickHeight - 8);
      }
      ctx.restore();
    }

    // Soft pass-through platforms (supports slopes & vanishing cloud shimmer)
    const plats = match.platforms || stage.platforms || [];
    for (const p of plats) {
      const st = match.platformStates?.[p.id];
      if (st?.vanished) continue;
      const pyL = -p.y;
      const pyR = -(p.y + (p.slope || 0));
      if (p.cloud) {
        ctx.save();
        if (st?.standTimer > 0) ctx.globalAlpha = Math.max(0.35, 1 - st.standTimer / 85);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#4a78a8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(p.x, pyL, p.w, 24, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#111827';
        ctx.fillRect(p.x + p.w * 0.5 - 16, pyL + 6, 13, 8);
        ctx.fillRect(p.x + p.w * 0.5 + 3, pyL + 6, 13, 8);
        ctx.fillRect(p.x + p.w * 0.5 - 3, pyL + 8, 6, 2);
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = pal.platColor;
        ctx.beginPath();
        ctx.moveTo(p.x, pyL);
        ctx.lineTo(p.x + p.w, pyR);
        ctx.lineTo(p.x + p.w, pyR + 12);
        ctx.lineTo(p.x, pyL + 12);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(p.x + 8, pyL + 10);
        ctx.lineTo(p.x + p.w - 8, pyR + 10);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  _drawExtras2D(ctx, match) {
    // Rising acid (Acid Vat Basement)
    if (match.stage?.hazard === 'risingAcid' && Number.isFinite(match.acidLevel) && match.acidLevel > -500) {
      ctx.save();
      ctx.fillStyle = 'rgba(112, 255, 51, 0.55)';
      ctx.fillRect(-1600, -match.acidLevel, 3200, 900);
      ctx.fillStyle = '#ccff66';
      ctx.fillRect(-1600, -match.acidLevel, 3200, 8);
      ctx.restore();
    }
    // Stage Hazards
    for (const hz of match.hazards || []) {
      const warning = HAZARD_WARNINGS[hz.kind];
      if (hz.warningFrames > 0 && warning) {
        this._drawHazardWarningLane(ctx, hz, match.stage.blastzones, warning.color);
        continue;
      }
      if (!hz.active) continue;
      ctx.save();
      ctx.fillStyle = hz.kind === 'pizzaVan' ? '#f97316' : (hz.kind === 'fineRocket' ? '#ef4444' : '#38f5ff');
      ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
      const hw = hz.w || 110, hh = hz.h || 56;
      ctx.fillRect(hz.x - hw * 0.5, -hz.y - hh, hw, hh);
      ctx.strokeRect(hz.x - hw * 0.5, -hz.y - hh, hw, hh);
      ctx.restore();
    }
    // Targets (Break the Targets)
    for (const tg of match.targets || []) {
      if (tg.broken) continue;
      ctx.save();
      ctx.translate(tg.x, -tg.y);
      ctx.fillStyle = '#ff2e4c'; ctx.beginPath(); ctx.arc(0, 0, tg.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, tg.r * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff2e4c'; ctx.beginPath(); ctx.arc(0, 0, tg.r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Items
    for (const it of match.items || []) {
      ctx.save();
      ctx.translate(it.x, -it.y - 10);
      ctx.rotate(it.rot || 0);
      if (drawItemIcon(ctx, it)) { ctx.restore(); continue; }
      const r = it.def?.radius || 18;
      ctx.fillStyle = it.def?.color || '#ffdf4d';
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2.5;
      if (it.def?.category === 'container') {
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.strokeRect(-r, -r, r * 2, r * 2);
      } else {
        ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    // Critter Summons
    for (const sm of match.summons || []) {
      ctx.save();
      ctx.translate(sm.x, -sm.y - 30);
      ctx.fillStyle = sm.critter?.color || '#a855f7';
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  _drawHazardWarningLane(ctx, hz, zones, color) {
    const top = -hz.y - hz.h;
    const width = zones.right - zones.left;
    const pulse = 0.5 + 0.5 * Math.cos(hz.warningFrames * 0.54);
    ctx.save();
    ctx.globalAlpha = 0.16 + 0.26 * pulse;
    ctx.fillStyle = color;
    ctx.fillRect(zones.left, top, width, hz.h);

    ctx.globalAlpha = 0.60 + 0.35 * pulse;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(zones.left, top, width, hz.h);

    const dir = Math.sign(hz.vx);
    const spacing = 92;
    const shift = (spacing - dir * (hz.warningFrames * 3 % spacing)) % spacing;
    const mid = top + hz.h * 0.5;
    const half = Math.min(14, hz.h * 0.3);
    ctx.beginPath();
    for (let x = zones.left + 22 + shift; x < zones.right - 22; x += spacing) {
      ctx.moveTo(x - dir * 16, mid - half);
      ctx.lineTo(x + dir * 6, mid);
      ctx.lineTo(x - dir * 16, mid + half);
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#150e21';
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  _drawHazardWarningBanner(ctx, hz, w, h) {
    const { label, color } = HAZARD_WARNINGS[hz.kind];
    const notice = hz.vx < 0 ? `${label} ◀` : `▶ ${label}`;
    const y = Math.max(62, h * 0.14);
    ctx.save();
    ctx.font = '900 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = Math.min(ctx.measureText(notice).width + 32, w * 0.94);
    ctx.fillStyle = '#150e21';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect((w - width) * 0.5, y - 15, width, 30, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(notice, w * 0.5, y, width * 0.90);
    ctx.restore();
  }

  _drawProjectiles(ctx, match) {
    if (!match.projectiles) return;
    for (const pr of match.projectiles) {
      const px = pr.x;
      const py = -pr.y;
      const r = pr.radius || 14;
      ctx.save();
      ctx.translate(px, py);

      switch (pr.style) {
        case 'laser':
          ctx.fillStyle = pr.color || '#38f5ff';
          ctx.shadowColor = pr.color || '#38f5ff';
          ctx.shadowBlur = 12;
          ctx.fillRect(-20, -4, 40, 8);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-16, -2, 32, 4);
          break;
        case 'pill':
          ctx.rotate((match.frame * 0.25) % (Math.PI * 2));
          ctx.fillStyle = '#ff4b72';
          ctx.beginPath(); ctx.roundRect(-14, -7, 14, 14, [7, 0, 0, 7]); ctx.fill();
          ctx.fillStyle = '#ffe14d';
          ctx.beginPath(); ctx.roundRect(0, -7, 14, 14, [0, 7, 7, 0]); ctx.fill();
          ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.roundRect(-14, -7, 28, 14, 7); ctx.stroke();
          break;
        case 'turnip':
          ctx.fillStyle = '#fff5e4';
          ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(-5, -18, 10, 8);
          // Grumpy face
          ctx.fillStyle = '#111';
          ctx.fillRect(-5, -3, 3, 3); ctx.fillRect(2, -3, 3, 3);
          ctx.fillRect(-4, 4, 8, 2);
          break;
        case 'boomerang':
          ctx.rotate((match.frame * 0.35) % (Math.PI * 2));
          ctx.fillStyle = '#38bdf8';
          ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
          ctx.fillRect(-14, -5, 28, 10);
          ctx.strokeRect(-14, -5, 28, 10);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(-6, -12, 12, 6);
          break;
        case 'bolt':
          ctx.fillStyle = '#ffef5a';
          ctx.shadowColor = '#38f5ff'; ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(-10, -8); ctx.lineTo(2, -2); ctx.lineTo(-4, 2); ctx.lineTo(12, 10);
          ctx.lineTo(0, 4); ctx.lineTo(6, -1); ctx.closePath();
          ctx.fill();
          break;
        case 'egg':
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.ellipse(0, 0, 10, 13, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#4ade80';
          ctx.beginPath(); ctx.arc(-3, -3, 3.5, 0, Math.PI * 2); ctx.arc(4, 3, 3, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(0, 0, 10, 13, 0, 0, Math.PI * 2); ctx.stroke();
          break;
        case 'bomb':
          ctx.fillStyle = '#1f2937';
          ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ef4444';
          ctx.beginPath(); ctx.arc(0, -13, 4, 0, Math.PI * 2); ctx.fill();
          break;
        case 'chargeOrb':
        case 'shadowOrb':
        case 'orb':
          ctx.fillStyle = pr.style === 'shadowOrb' ? '#a855f7' : '#38f5ff';
          ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();
          break;
        case 'pancake':
          ctx.rotate(match.frame * 0.25);
          ctx.fillStyle = '#111827';
          ctx.fillRect(-10, -6, 20, 12);
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
          ctx.strokeRect(-10, -6, 20, 12);
          break;
        case 'ice':
          ctx.fillStyle = '#bae6fd';
          ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 2;
          ctx.fillRect(-13, -10, 26, 20);
          ctx.strokeRect(-13, -10, 26, 20);
          break;
        default:
          ctx.fillStyle = '#ff7b24';
          ctx.shadowColor = '#ffdd33'; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff4b8';
          ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  _drawFighter(ctx, f, match, options) {
    const def = f.def;
    const stats = def.stats;
    const pal = f.palette || def.palettes[0];
    const rig = def.rig || {};
    const px = f.x;
    const py = -f.y; // feet position in canvas space (Y down)

    // Invincibility blink
    if (this.fx.allowFlash && f.invulnFrames > 0 && Math.floor(match.frame / 3) % 2 === 0) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      this._drawFighterBody(ctx, f, def, stats, pal, rig, px, py, match);
      ctx.restore();
    } else {
      this._drawFighterBody(ctx, f, def, stats, pal, rig, px, py, match);
    }

    // Shield bubble
    if (f.state === STATE.SHIELD || f.state === STATE.SHIELD_STUN) {
      const scale = f.scale || 1, shield = f.shieldScale ?? 1;
      const ratio = Math.max(0, Math.min(1, (f.shieldHp ?? MELEE.SHIELD_MAX) / MELEE.SHIELD_MAX));
      const sr = (stats.shieldRadius || 42) * scale * shield * (0.35 + 0.65 * ratio);
      const pColor = PLAYER_COLORS[f.port % PLAYER_COLORS.length];
      ctx.save();
      ctx.beginPath();
      ctx.arc(px + (f.facing || 1) * 5, py - stats.height * scale * .48, sr, 0, Math.PI * 2);
      ctx.fillStyle = pColor + (shield > 1 ? '24' : '44');
      ctx.fill();
      ctx.lineWidth = shield > 1 ? 2 : 3;
      ctx.strokeStyle = pColor;
      ctx.stroke();
      if (shield > 1) {
        ctx.beginPath(); ctx.arc(px + (f.facing || 1) * 5, py - stats.height * scale * .48, sr - 2,
          Math.PI * 1.08, Math.PI * 1.73);
        ctx.strokeStyle = '#f2fbff9c'; ctx.lineCap = 'round'; ctx.stroke();
      }
      ctx.restore();
    }

    // Shield break dizzy stars
    if (f.state === STATE.SHIELD_BREAK) {
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const a = match.frame * 0.14 + i * (Math.PI * 2 / 3);
        const sx = px + Math.cos(a) * 26;
        const sy = py - stats.height * (f.scale || 1) - 16 + Math.sin(a) * 8;
        ctx.fillStyle = '#ffdf4d';
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Respawn halo platform
    if (f.state === STATE.RESPAWN) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.beginPath();
      ctx.roundRect(px - 34, py, 68, 10, 5);
      ctx.fill();
      ctx.restore();
    }

  }

  _drawTag(ctx, f, count) {
    ctx.save();
    const px = f.x;
    const tagColor = PLAYER_COLORS[f.port % PLAYER_COLORS.length];
    const tagY = -f.y - f.def.stats.height * (f.scale || 1) - 26;
    ctx.fillStyle = tagColor;
    ctx.beginPath();
    ctx.moveTo(px - 7, tagY + 4);
    ctx.lineTo(px + 7, tagY + 4);
    ctx.lineTo(px, tagY + 13);
    ctx.closePath();
    ctx.fill();
    ctx.font = '900 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 3;
    const label = fighterTag(f, count);
    ctx.strokeText(label, px, tagY);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, px, tagY);
    ctx.restore();
  }

  _drawFighterBody(ctx, f, def, stats, pal, rig, px, py, match) {
    const h = stats.height;
    const w = stats.width;
    const t = match.frame * 0.16;
    const scale = f.scale || 1;

    // Ground shadow
    if (f.grounded) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath();
      ctx.ellipse(px, py + 2 * scale, w * .55 * scale, 6 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(scale, scale);

    // Squash/stretch + tumble rotation + crouch
    let sx = f.squashX || 1;
    let sy = f.squashY || 1;
    let rot = 0;
    if (f.state === STATE.CROUCH || f.state === STATE.JUMPSQUAT) {
      sx *= 1.16; sy *= 0.8;
    } else if (f.state === STATE.DASH || f.state === STATE.RUN) {
      rot = f.facing * 0.14;
    } else if (f.state === STATE.TUMBLE) {
      rot = (match.frame * 0.28) * (f.facing || 1);
    } else if (f.state === STATE.HITSTUN) {
      rot = -f.facing * 0.32;
    } else if (f.state === STATE.AIRDODGE) {
      ctx.globalAlpha = 0.72;
    }

    ctx.translate(0, -h * 0.5);
    ctx.rotate(rot);
    ctx.scale((f.facing || 1) * sx, sy);
    ctx.translate(0, h * 0.5);

    // Attack lunge & smear arc
    const attacking = f.state === STATE.ATTACK && f.moveData;
    const activeSwing = attacking && f.moveFrame >= f.moveData.startup && f.moveFrame <= f.moveData.startup + f.moveData.active + 2;

    // Special buddy for Slush Shovelers (Nana-Bot cardboard cutout bouncing behind Pops!)
    if (rig.buddy) {
      const bob = Math.sin(t * 1.4) * 4;
      ctx.save();
      ctx.translate(-34, bob);
      ctx.scale(0.84, 0.84);
      this._drawCharacterArtwork(ctx, { ...pal, body: pal.outfit, outfit: pal.body }, { ...rig, buddy: false }, w, h, f, t, activeSwing);
      ctx.restore();
    }

    this._drawCharacterArtwork(ctx, pal, rig, w, h, f, t, activeSwing);

    // Weapon / Attack Smear Arc
    if (activeSwing) {
      const md = f.moveData;
      const ox = (md.offsetX || 36);
      const oy = -(md.offsetY || 36);
      const rad = md.radius || 28;
      ctx.save();
      ctx.strokeStyle = md.sweetspot ? '#ffdf4d' : (pal.accent || '#38f5ff');
      ctx.lineWidth = md.sweetspot ? 10 : 6;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.82;
      ctx.beginPath();
      ctx.arc(ox * 0.45, oy, rad * 1.05, -0.95, 0.85);
      ctx.stroke();
      ctx.restore();
    }

    // Active Shine hexagon on reflector moves
    if (attacking && f.moveData.kind === 'reflector') {
      ctx.save();
      ctx.strokeStyle = '#38f5ff';
      ctx.fillStyle = 'rgba(56, 245, 255, 0.28)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const rx = Math.cos(a) * 42;
        const ry = -h * 0.5 + Math.sin(a) * 42;
        if (i === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  _drawCharacterArtwork(ctx, pal, rig, w, h, f, t, activeSwing) {
    const sil = rig.silhouette || 'hero';
    const walking = f && (f.state === STATE.WALK || f.state === STATE.RUN || f.state === STATE.DASH);
    const legSwing = walking ? Math.sin(t * 2.2) * 11 : 0;
    const armSwing = activeSwing ? 22 : (walking ? -legSwing * 0.8 : Math.sin(t * 0.6) * 2);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const outline = sil === 'flat2d' ? '#ffffff' : '#111122';

    // Special silhouettes: Sandbag & Master Mitt
    if (sil === 'sandbag') {
      ctx.fillStyle = pal.body;
      ctx.strokeStyle = '#3b2f2f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-20, -h, 40, h, 14);
      ctx.fill();
      ctx.stroke();
      // Sticky note
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-10, -h * 0.72, 22, 22);
      ctx.fillStyle = '#111';
      ctx.fillRect(-5, -h * 0.64, 3, 3);
      ctx.fillRect(4, -h * 0.64, 3, 3);
      ctx.beginPath();
      ctx.arc(1, -h * 0.54, 5, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      return;
    }

    if (sil === 'ovenMitt') {
      ctx.fillStyle = pal.body;
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 4;
      // Giant quilted oven mitt
      ctx.beginPath();
      ctx.roundRect(-36, -h, 72, h * 0.84, 30);
      ctx.fill();
      ctx.stroke();
      // Thumb sticking out
      ctx.beginPath();
      ctx.roundRect(22, -h * 0.55, 28, 26, 12);
      ctx.fill();
      ctx.stroke();
      // Red quilted cuff
      ctx.fillStyle = pal.outfit;
      ctx.fillRect(-34, -22, 68, 22);
      ctx.strokeRect(-34, -22, 68, 22);
      // Quilt diamond lines
      ctx.strokeStyle = 'rgba(239,68,68,0.35)';
      ctx.lineWidth = 2;
      for (let gx = -24; gx <= 24; gx += 16) {
        ctx.beginPath(); ctx.moveTo(gx, -h + 10); ctx.lineTo(gx + 16, -24); ctx.stroke();
      }
      return;
    }

    // Tail behind body
    if (rig.tail === 'bushy') {
      ctx.fillStyle = pal.body;
      ctx.strokeStyle = outline; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(-22, -26, 16, 9, -0.4, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else if (rig.tail === 'jagged') {
      ctx.fillStyle = pal.body;
      ctx.strokeStyle = outline; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-10, -18); ctx.lineTo(-24, -26); ctx.lineTo(-18, -32); ctx.lineTo(-32, -44);
      ctx.lineTo(-20, -46); ctx.lineTo(-10, -24); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (rig.tail === 'hugeTail') {
      ctx.strokeStyle = pal.outfit; ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(-8, -22); ctx.quadraticCurveTo(-44, -14, -46, -48);
      ctx.stroke();
    }

    // Cape behind body
    if (rig.cape) {
      ctx.fillStyle = rig.cape === 'labcoat' ? '#ffffff' : (rig.cape === 'nda' ? '#e2e8f0' : pal.accent);
      ctx.strokeStyle = outline; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-6, -h * 0.72);
      ctx.lineTo(-26 - Math.sin(t) * 5, -14);
      ctx.lineTo(-2, -16);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    // Puff silhouettes (Flurby / Gigglefluff)
    if (sil === 'puff') {
      // Little feet
      ctx.fillStyle = pal.outfit;
      ctx.strokeStyle = outline; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(-9 + legSwing * 0.5, -5, 11, 6, 0, 0, Math.PI * 2);
      ctx.ellipse(10 - legSwing * 0.5, -5, 11, 6, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Round body
      ctx.fillStyle = pal.body;
      ctx.beginPath();
      ctx.arc(0, -h * 0.55, h * 0.48, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Arms
      ctx.beginPath();
      ctx.ellipse(18 + armSwing * 0.4, -h * 0.52, 9, 6, 0.2, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      this._drawHatAndFace(ctx, pal, rig, 0, -h * 0.58, h * 0.44, outline, f);
      if (f?.podiumPose) this._drawPodiumArms(ctx, f, pal, -h * .52, w * .70, outline);
      return;
    }

    // Standard articulated limbs + torso + head
    const bodyW = sil.includes('brute') ? w * 0.78 : (sil === 'stout' || sil === 'parka' ? w * 0.68 : w * 0.56);
    const bodyH = h * 0.44;
    const headR = sil.includes('tiny') ? 13 : (sil === 'kid' || sil === 'rodent' ? 15 : 17);
    const hipY = -h * 0.28;
    const shoulderY = hipY - bodyH;
    const headY = shoulderY - headR + 3;

    // Legs
    ctx.strokeStyle = outline; ctx.lineWidth = 3;
    ctx.fillStyle = pal.outfit;
    ctx.beginPath();
    ctx.roundRect(-bodyW * 0.35 + legSwing * 0.5 - 5, hipY, 11, -hipY - 1, 5);
    ctx.roundRect(bodyW * 0.15 - legSwing * 0.5 - 5, hipY, 11, -hipY - 1, 5);
    ctx.fill(); ctx.stroke();

    // Torso / Dress
    ctx.fillStyle = pal.body;
    ctx.beginPath();
    if (sil === 'dress') {
      ctx.moveTo(-bodyW * 0.4, shoulderY);
      ctx.lineTo(bodyW * 0.4, shoulderY);
      ctx.lineTo(bodyW * 0.78, -6);
      ctx.lineTo(-bodyW * 0.78, -6);
      ctx.closePath();
    } else {
      ctx.roundRect(-bodyW * 0.5, shoulderY, bodyW, bodyH + 4, 10);
    }
    ctx.fill(); ctx.stroke();

    // Outfit stripe / tie / overalls / shell spikes
    if (rig.prop === 'tie') {
      ctx.fillStyle = pal.outfit;
      ctx.beginPath();
      ctx.moveTo(4, shoulderY + 6); ctx.lineTo(9, shoulderY + 26); ctx.lineTo(4, shoulderY + 32); ctx.lineTo(-1, shoulderY + 26);
      ctx.closePath(); ctx.fill();
    } else if (rig.prop === 'shellSpikes') {
      ctx.fillStyle = pal.outfit;
      ctx.beginPath();
      ctx.arc(-bodyW * 0.48, shoulderY + bodyH * 0.5, 15, Math.PI * 0.5, Math.PI * 1.5);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.moveTo(-bodyW * 0.75, shoulderY + 10); ctx.lineTo(-bodyW * 0.52, shoulderY + 4); ctx.lineTo(-bodyW * 0.52, shoulderY + 18); ctx.fill();
    } else {
      ctx.fillStyle = pal.outfit;
      ctx.fillRect(-bodyW * 0.42, shoulderY + bodyH * 0.42, bodyW * 0.84, bodyH * 0.46);
    }

    // Head
    ctx.fillStyle = (sil === 'flat2d' || sil === 'rodent' || sil === 'tinyRodent' || sil === 'fox' || sil === 'bird' || sil === 'dino' || sil === 'armor' || sil === 'tallCat')
      ? pal.body : pal.skin;
    ctx.beginPath();
    ctx.arc(0, headY, headR, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Hat, face & signature Bizarro props
    this._drawHatAndFace(ctx, pal, rig, 0, headY, headR, outline, f);

    if (f?.podiumPose) {
      this._drawPodiumArms(ctx, f, pal, shoulderY + 8, bodyW, outline);
      return;
    }
    // Front Arm + Prop/Weapon
    ctx.save();
    ctx.translate(bodyW * 0.35, shoulderY + 8);
    ctx.rotate(activeSwing ? -0.55 : (armSwing * 0.03));
    ctx.fillStyle = pal.body;
    ctx.strokeStyle = outline; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-4, -5, 22, 10, 5);
    ctx.fill(); ctx.stroke();
    this._drawProp(ctx, rig.prop, pal, activeSwing);
    ctx.restore();
  }

  _drawPodiumArms(ctx, f, pal, y, w, outline) {
    const wave = Math.sin(f.podiumPhase), cheer = f.podiumPose === 'cheer';
    const close = (1 + Math.cos(f.podiumPhase * 1.5)) * .5;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const x = side * w * .38;
      const reach = cheer ? side * (w * .62 + 3.5 * wave * side) : 8 + side * (2 + 8 * close);
      const end = cheer ? y - 20 - side * 4 * wave : y + 8 + close * 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + side*8, y + (cheer ? 5 : 14), reach, end);
      ctx.lineWidth = 11; ctx.strokeStyle = outline; ctx.stroke();
      ctx.lineWidth = 7; ctx.strokeStyle = pal.body; ctx.stroke();
      ctx.beginPath(); ctx.arc(reach, end, 4.5, 0, Math.PI * 2); ctx.fillStyle = pal.skin; ctx.fill();
    }
  }

  _drawHatAndFace(ctx, pal, rig, hx, hy, r, outline, f) {
    ctx.save();
    ctx.translate(hx, hy);

    // Hats / Ears
    ctx.strokeStyle = outline; ctx.lineWidth = 2.5;
    switch (rig.hat) {
      case 'bowler':
        ctx.fillStyle = pal.outfit;
        ctx.beginPath(); ctx.arc(0, -r * 0.65, r * 0.85, Math.PI, 0); ctx.fill(); ctx.stroke();
        ctx.fillRect(-r * 1.1, -r * 0.68, r * 2.2, 5);
        break;
      case 'headmirror':
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(-r, -r * 0.72, r * 2, 5);
        ctx.beginPath(); ctx.arc(r * 0.4, -r * 0.75, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        break;
      case 'capTall':
      case 'backCap':
      case 'snapback':
      case 'grillCap':
        ctx.fillStyle = pal.outfit;
        ctx.beginPath(); ctx.arc(0, -r * 0.5, r * 0.92, Math.PI, 0); ctx.fill(); ctx.stroke();
        ctx.fillRect(rig.hat === 'backCap' || rig.hat === 'snapback' ? -r * 1.35 : -2, -r * 0.55, r * 1.4, 5);
        break;
      case 'elfCap':
        ctx.fillStyle = pal.body;
        ctx.beginPath();
        ctx.moveTo(-r * 0.8, -r * 0.4); ctx.lineTo(-r * 1.7, -r * 0.9); ctx.lineTo(r * 0.8, -r * 0.5);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      case 'foxEars':
      case 'catEars':
      case 'boltEars':
        ctx.fillStyle = pal.body;
        ctx.beginPath();
        ctx.moveTo(-r * 0.65, -r * 0.6); ctx.lineTo(-r * 0.95, -r * 1.65); ctx.lineTo(-r * 0.1, -r * 0.85);
        ctx.moveTo(r * 0.15, -r * 0.85); ctx.lineTo(r * 0.85, -r * 1.65); ctx.lineTo(r * 0.7, -r * 0.55);
        ctx.fill(); ctx.stroke();
        break;
      case 'toucanBeak':
        ctx.fillStyle = '#ff922b';
        ctx.beginPath();
        ctx.moveTo(r * 0.5, -4); ctx.lineTo(r * 1.95, 2); ctx.lineTo(r * 0.5, 9);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      case 'birdHelmet':
        ctx.fillStyle = pal.outfit;
        ctx.beginPath(); ctx.arc(0, -2, r + 2, Math.PI * 0.85, Math.PI * 2.15); ctx.fill(); ctx.stroke();
        ctx.fillStyle = pal.accent;
        ctx.beginPath(); ctx.moveTo(-6, -r - 2); ctx.lineTo(-16, -r - 12); ctx.lineTo(4, -r - 4); ctx.fill();
        break;
      case 'horns':
        ctx.fillStyle = '#fff5cc';
        ctx.beginPath();
        ctx.moveTo(-8, -r + 2); ctx.lineTo(-16, -r - 12); ctx.lineTo(-2, -r + 2);
        ctx.moveTo(8, -r + 2); ctx.lineTo(16, -r - 12); ctx.lineTo(2, -r + 2);
        ctx.fill(); ctx.stroke();
        break;
      case 'tiara':
      case 'mysticCrown':
      case 'tiaraHair':
        ctx.fillStyle = '#ffdf4d';
        ctx.beginPath();
        ctx.moveTo(-10, -r + 2); ctx.lineTo(-6, -r - 9); ctx.lineTo(0, -r - 2); ctx.lineTo(6, -r - 10); ctx.lineTo(10, -r + 2);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      case 'headband':
      case 'ninjaWrap':
        ctx.fillStyle = pal.accent;
        ctx.fillRect(-r, -r * 0.55, r * 2, 6);
        break;
      case 'sleepMask':
        ctx.fillStyle = pal.outfit;
        ctx.beginPath(); ctx.roundRect(-r * 0.7, -r * 0.9, r * 1.4, 10, 5); ctx.fill(); ctx.stroke();
        break;
      case 'lcdNose':
        ctx.fillStyle = pal.body;
        ctx.fillRect(r * 0.7, -3, 10, 6);
        break;
    }

    // Eyes / Expression
    const hurt = f && (f.state === STATE.HITSTUN || f.state === STATE.TUMBLE);
    if (rig.eyes !== 'none') {
      if (rig.eyes === 'shades' || rig.eyes === 'visor') {
        ctx.fillStyle = rig.eyes === 'visor' ? '#38f5ff' : '#0f172a';
        ctx.fillRect(-1, -5, 16, 7);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(10, -4, 4, 2);
      } else if (rig.eyes === 'monocle') {
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(2, -2, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffdf4d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(9, -2, 5.5, 0, Math.PI * 2); ctx.stroke();
      } else if (rig.eyes === 'glasses') {
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(2, -2, 5, 0, Math.PI * 2); ctx.arc(11, -2, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#111'; ctx.fillRect(2, -3, 2, 2); ctx.fillRect(11, -3, 2, 2);
      } else if (rig.eyes === 'unimpressed') {
        ctx.fillStyle = '#111';
        ctx.fillRect(1, -2, 4, 6); ctx.fillRect(9, -2, 4, 6);
        ctx.fillStyle = pal.body;
        ctx.fillRect(0, -4, 15, 4); // flat unimpressed eyelids
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(7, -2, hurt ? 5.5 : 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111122';
        ctx.beginPath(); ctx.arc(8.5, -2, 2.2, 0, Math.PI * 2); ctx.fill();
        if (rig.eyes === 'angry' || rig.eyes === 'intense') {
          ctx.strokeStyle = '#111'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(2, -8); ctx.lineTo(13, -5); ctx.stroke();
        }
      }
    }

    // Mustache
    if (rig.stache) {
      ctx.fillStyle = '#2d1c14';
      ctx.beginPath();
      ctx.ellipse(7, 5, 9, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawProp(ctx, prop, pal, activeSwing) {
    ctx.save();
    ctx.translate(18, 0);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    switch (prop) {
      case 'yardstick':
        ctx.fillStyle = '#facc15';
        ctx.fillRect(0, -4, activeSwing ? 62 : 48, 7);
        ctx.strokeRect(0, -4, activeSwing ? 62 : 48, 7);
        // Glowing tipper
        ctx.fillStyle = '#38f5ff';
        ctx.fillRect(activeSwing ? 50 : 38, -4, 12, 7);
        break;
      case 'fireBroom':
        ctx.fillStyle = '#a8643a';
        ctx.fillRect(0, -3, 38, 6);
        ctx.fillStyle = '#ff6b35';
        ctx.beginPath(); ctx.arc(40, 0, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe14d';
        ctx.beginPath(); ctx.arc(40, 0, 6, 0, Math.PI * 2); ctx.fill();
        break;
      case 'wrench':
      case 'spork':
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(0, -4, prop === 'wrench' ? 34 : 24, 7);
        ctx.strokeRect(0, -4, prop === 'wrench' ? 34 : 24, 7);
        ctx.beginPath(); ctx.arc(prop === 'wrench' ? 36 : 26, 0, 8, 0.5, Math.PI * 1.85); ctx.fill(); ctx.stroke();
        break;
      case 'spatula':
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(0, -3, 26, 5);
        ctx.fillRect(24, -10, 16, 20);
        ctx.strokeRect(24, -10, 16, 20);
        break;
      case 'armCannon':
        ctx.fillStyle = pal.accent;
        ctx.beginPath(); ctx.roundRect(-6, -9, 26, 18, 6); ctx.fill(); ctx.stroke();
        break;
      case 'judgeHammer':
        ctx.fillStyle = '#111';
        ctx.fillRect(0, -2, 22, 4);
        ctx.fillStyle = pal.accent;
        ctx.fillRect(16, -12, 12, 24);
        break;
      case 'fryingPan':
      case 'bat':
      case 'shovel':
      case 'squeegee':
        ctx.fillStyle = pal.accent;
        ctx.fillRect(0, -3, 26, 6);
        ctx.strokeRect(0, -3, 26, 6);
        break;
    }
    ctx.restore();
  }

  _drawHitboxes(ctx, match) {
    ctx.save();
    for (const f of match.fighters) {
      if (f.state === STATE.DEAD) continue;
      if (f.hurtbox) {
        ctx.strokeStyle = '#38f5ff';
        ctx.fillStyle = 'rgba(56, 245, 255, 0.16)';
        ctx.lineWidth = 2;
        ctx.fillRect(f.hurtbox.x, -f.hurtbox.y - f.hurtbox.h, f.hurtbox.w, f.hurtbox.h);
        ctx.strokeRect(f.hurtbox.x, -f.hurtbox.y - f.hurtbox.h, f.hurtbox.w, f.hurtbox.h);
      }
      if (f.activeHitboxes) {
        for (const hb of f.activeHitboxes) {
          ctx.beginPath();
          ctx.arc(hb.x, -hb.y, hb.r, 0, Math.PI * 2);
          ctx.fillStyle = hb.sweetspot ? 'rgba(255, 223, 77, 0.42)' : 'rgba(255, 59, 92, 0.38)';
          ctx.strokeStyle = hb.sweetspot ? '#ffdf4d' : '#ff3b5c';
          ctx.lineWidth = 2.5;
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  _drawOffscreenIndicators(ctx, match, w, h, derbyBag) {
    for (const f of match.fighters) {
      if (f.state === STATE.DEAD) continue;
      const pt = this.camera.worldToScreen(f.x, f.y + f.def.stats.height * (f.scale || 1) * .5, w, h);
      if (pt.sx >= 12 && pt.sx <= w - 12 && pt.sy >= 12 && pt.sy <= h - 12) continue;
      const cx = Math.max(30, Math.min(w - 30, pt.sx));
      const leftBatter = derbyBag && f !== derbyBag && pt.sx < 12;
      const cy = Math.max(30, Math.min(leftBatter ? h * 0.65 : h - 30, pt.sy));
      const pColor = PLAYER_COLORS[f.port % PLAYER_COLORS.length];
      ctx.save();
      if (leftBatter) {
        ctx.fillStyle = '#150e21';
        ctx.strokeStyle = pColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(8, cy - 11, 43, 22, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = pColor;
        ctx.beginPath();
        ctx.moveTo(14, cy);
        ctx.lineTo(23, cy - 5);
        ctx.lineTo(23, cy + 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '900 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`P${f.port + 1}`, 36, cy + 4);
        ctx.restore();
        continue;
      }
      ctx.fillStyle = 'rgba(12, 10, 28, 0.86)';
      ctx.strokeStyle = pColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '900 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.def.name.slice(0, 5).toUpperCase(), cx, cy + 4);
      ctx.restore();
    }
  }

  /**
   * Draws the high-detail illustrated Bizarro portrait (falling back to procedural vector bust while loading or for special NPCs).
   */
  drawPortrait(canvas, fighterDef, paletteIndex = 0) {
    if (!canvas || !fighterDef) return;
    if (drawIllustratedPortrait(canvas, fighterDef.id, paletteIndex)) {
      return;
    }
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const pal = fighterDef.palettes[paletteIndex % fighterDef.palettes.length] || fighterDef.palettes[0];
    const rig = fighterDef.rig || {};

    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, pal.outfit + '44');
    bg.addColorStop(1, '#100d24');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w * 0.5, h * 0.88);
    const scale = Math.min(w, h) / 96;
    ctx.scale(scale, scale);
    this._drawCharacterArtwork(ctx, pal, rig, fighterDef.stats.width, fighterDef.stats.height, null, 0, false);
    ctx.restore();
  }
}
