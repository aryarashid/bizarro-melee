/**
 * Offline paint library. Color maps are sRGB, relief/roughness data stay linear.
 * A cache belongs to its renderer so context recovery cannot affect another canvas.
 */

const cacheByOwner = new WeakMap();
const TAU = Math.PI * 2;
const SIZE = 256;
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (a, n) => (a % n + n) % n;
const fract = (a) => a - Math.floor(a);
const clamp = (a) => Math.max(0, Math.min(1, a));

function hash(value) {
  let s = 2166136261;
  for (const c of String(value)) s = Math.imul(s ^ c.charCodeAt(0), 16777619);
  return s >>> 0;
}

function rng(key) {
  let s = hash(key);
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function cached(owner, key, make) {
  let entries = cacheByOwner.get(owner);
  if (!entries) cacheByOwner.set(owner, entries = new Map());
  if (!entries.has(key)) {
    if (key.startsWith('sky:')) {
      const skies = [...entries.keys()].filter((id) => id.startsWith('sky:'));
      if (skies.length >= 6) {
        entries.get(skies[0]).dispose();
        entries.delete(skies[0]);
      }
    }
    entries.set(key, make());
  }
  return entries.get(key);
}

// Called while the old GL context is still lost, before Three replaces its GPU caches.
export function releasePaint(owner) {
  for (const entry of cacheByOwner.get(owner)?.values() || []) {
    if (entry.isTexture) entry.dispose();
    else for (const map of Object.values(entry)) if (map?.isTexture) map.dispose();
  }
}

function canvas(w, h = w) {
  const surface = document.createElement('canvas');
  surface.width = w;
  surface.height = h;
  return surface.getContext('2d');
}

function texture(T, ctx, { repeat = false, color = true, pixel = false } = {}) {
  const map = new T.CanvasTexture(ctx.canvas);
  if (repeat) map.wrapS = map.wrapT = T.RepeatWrapping;
  if (color) map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = pixel ? 1 : 4;
  if (pixel) {
    map.magFilter = T.NearestFilter;
    map.minFilter = T.NearestMipmapLinearFilter;
  }
  return map;
}

function ellipse(c, x, y, rx, ry, fill, tilt = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, tilt, 0, TAU);
  c.fillStyle = fill;
  c.fill();
}

function stroke(c, path, col, width) {
  c.beginPath();
  path(c);
  c.strokeStyle = col;
  c.lineWidth = width;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.stroke();
}

function glow(c, x, y, r, center, edge) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, center);
  g.addColorStop(1, edge);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, 2 * r, 2 * r);
}

// Periodic value noise, including derivatives at tile boundaries.
function noise(key, cellsX, cellsY = cellsX) {
  const random = rng(key);
  const grid = Array.from({ length: cellsX * cellsY }, random);
  return (u, v) => {
    const x = u * cellsX, y = v * cellsY;
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const t = fx * fx * (3 - 2 * fx), s = fy * fy * (3 - 2 * fy);
    const a = mod(ix, cellsX), b = mod(ix + 1, cellsX);
    const c = mod(iy, cellsY) * cellsX, d = mod(iy + 1, cellsY) * cellsX;
    return lerp(lerp(grid[c + a], grid[c + b], t), lerp(grid[d + a], grid[d + b], t), s);
  };
}

const recipes = {
  stone: [[70, 76, 91], [197, 199, 200], 0.86, 2.45],
  cosmos: [[28, 17, 55], [132, 91, 177], 0.46, 1.25],
  grass: [[27, 76, 37], [149, 211, 84], 0.88, 2.8],
  earth: [[54, 34, 33], [173, 125, 90], 0.92, 6],
  metal: [[66, 77, 96], [206, 215, 226], 0.55, 2.3],
  asphalt: [[30, 38, 54], [105, 121, 142], 0.95, 2.1],
  water: [[19, 54, 105], [101, 189, 215], 0.29, 3.2],
  ice: [[61, 129, 177], [218, 249, 255], 0.34, 3.2],
  brick: [[99, 53, 47], [231, 172, 140], 0.86, 3.4],
  lcd: [[77, 89, 66], [191, 207, 153], 0.68, 0.9],
  turf: [[25, 91, 59], [118, 189, 105], 0.86, 1.5],
  timber: [[81, 39, 21], [219, 160, 102], 0.86, 3.4],
  shingles: [[91, 22, 31], [229, 87, 68], 0.81, 3.6],
  basalt: [[36, 25, 46], [117, 104, 133], 0.97, 6],
  felt: [[116, 72, 122], [239, 182, 205], 0.93, 2.5],
  checker: [[145, 63, 54], [244, 185, 116], 0.93, 2.7],
};

export function getSurfaceTextures(kind, T = globalThis.THREE, owner = T) {
  if (!Object.hasOwn(recipes, kind)) kind = 'stone';
  return cached(owner, 'surface:' + kind, () => {
    const [low, high, baseRoughness, bumpScale] = recipes[kind];
    const albedo = canvas(SIZE), bump = canvas(SIZE), rough = canvas(SIZE);
    const maps = [albedo, bump, rough].map((c) => c.createImageData(SIZE, SIZE));
    const broad = noise(kind, 7), detail = noise(kind + '/detail', 24);
    const brushed = noise(kind + '/brushed', 8, 96);
    const random = rng(kind + '/grain');
    const colors = new Map();
    const paint = (x, y, rgb, value = 1, height = 0.5, gloss = 0) => {
      const i = (y * SIZE + x) * 4;
      for (let c = 0; c < 3; c++) {
        maps[0].data[i + c] = rgb[c] * value;
        maps[1].data[i + c] = height * 255;
        maps[2].data[i + c] = clamp(baseRoughness + (height - 0.5) * 0.23 - gloss) * 255;
      }
      for (const map of maps) map.data[i + 3] = 255;
    };
    const blend = (a, b, t) => {
      const k = Math.round(clamp(t) * 100);
      if (!colors.has(k)) colors.set(k, a.map((x, i) => lerp(x, b[i], k / 100)));
      return colors.get(k);
    };
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE, v = y / SIZE;
      const n = broad(u, v), d = detail(u, v), grit = random() - 0.5;
      let q = 0.43 + n * 0.27 + d * 0.20 + grit * 0.105;
      let ht = 0.48 + (n - 0.5) * 0.16 + (d - 0.5) * 0.17 + grit * 0.07;
      let rgb, gloss = 0;
      if (kind === 'timber') {
        const board = fract(v * 6);
        const grain = Math.sin(TAU * (v * 42 + n * 0.42 + d * 0.08));
        q += grain * 0.12 + Math.sin(Math.floor(v * 6) * 5) * 0.13;
        ht += grain * 0.12;
        if (board < 0.045) { q *= 0.30; ht *= 0.38; }
        else if (board > 0.94) { q += 0.16; ht -= 0.1; }
      } else if (kind === 'shingles') {
        const row = Math.floor(u * 8), tile = fract(v * 5 + row * 0.5);
        const lip = fract(u * 8);
        q += Math.sin((row + Math.floor(v * 5 + row * 0.5) * 7) * 12) * 0.12 + lip * 0.20;
        if (tile < 0.035 || lip < 0.09) { q *= 0.28; ht *= 0.32; }
      } else if (kind === 'basalt') {
        const strata = Math.sin(TAU * (v * 6 + n * 0.9));
        q += 0.19 * strata + Math.floor(d * 5) * 0.06;
        ht += 0.18 * strata;
      } else if (kind === 'felt' || kind === 'checker') {
        const uTile = u * 4, vTile = v * 4;
        const stripe = (Math.floor(uTile) + Math.floor(vTile)) % 2;
        if (kind === 'checker') {
          q = 0.15 + stripe * 0.68 + grit * 0.06;
          ht = 0.45 + stripe * 0.19;
        } else {
          const cross = (Math.sin(u * TAU * 100) + Math.sin(v * TAU * 92)) * 0.10;
          const edge = Math.min(fract(uTile), fract(vTile));
          q += stripe * 0.19 + cross;
          if (edge < 0.035) { ht -= 0.18; q -= 0.28; }
          else if (edge > 0.07 && edge < 0.106 && fract((u + v) * 64) < 0.62) { ht += 0.2; q += 0.40; }
        }
      } else if (kind === 'stone' || kind === 'brick' || kind === 'metal') {
        const cells = kind === 'metal' ? 2 : 4;
        const row = Math.floor(v * cells);
        const xx = fract(u * 4 + (row % 2) * 0.5);
        const yy = fract(v * cells);
        const seam = Math.min(xx, 1 - xx, yy, 1 - yy);
        const tile = Math.sin((mod(Math.floor(u * 4 + row % 2 * 0.5), 4) + row * 7) * 9.2) * 0.14;
        const joint = kind === 'metal' ? 0.022 : 0.035 + d * 0.013;
        q += tile;
        if (seam < joint) {
          ht *= 0.35;
          q *= 0.35;
          if (kind === 'stone' && n > 0.45) rgb = [64 + n * 27, 81 + n * 33, 64];
          if (kind === 'brick') rgb = [123, 96, 80];
        } else if (seam < joint + 0.034) {
          q += yy < 0.5 ? 0.22 : -0.15;
          ht *= 0.75;
        }
        if (kind === 'metal') {
          q += (brushed(u, v) - 0.5) * 0.28;
          const rivet = Math.hypot(Math.min(Math.abs(xx - 0.11), Math.abs(xx - 0.89)), Math.abs(yy - 0.11) * 2);
          if (rivet < 0.047) { q = rivet < 0.025 ? 1 : 0.24; ht = 0.76; gloss = 0.22; }
          if (row === 1 && yy > 0.79 && yy < 0.90) {
            rgb = (Math.floor((u * 16 + yy * 1.3)) % 2 === 0) ? [230, 173, 55] : [50, 56, 64];
          }
        }
      } else if (kind === 'earth') {
        const stratum = Math.sin(TAU * (v * 5 + n * 0.4) + Math.sin(u * TAU * 2) * 0.55);
        q += stratum * 0.17;
        ht += stratum * 0.19;
      } else if (kind === 'grass' || kind === 'turf') {
        const stripe = Math.sin(u * TAU * 2);
        q += stripe * (kind === 'turf' ? 0.19 : 0.04);
        if (kind === 'turf' && (v < 0.013 || Math.abs(u - 0.5) < 0.009)) rgb = [209, 224, 192];
      } else if (kind === 'cosmos') {
        q = 0.12 + n * n * 0.82 + d * 0.14;
        const line = Math.min(fract(u * 8), fract(v * 8));
        if (line < 0.038) {
          rgb = (x < 128) ? [106, 201, 228] : [228, 118, 214];
          ht -= 0.15; gloss = 0.23;
        }
      } else if (kind === 'asphalt') {
        q = 0.38 + d * 0.18 + grit * 0.22;
        const shoulder = v < 0.04 || v > 0.96;
        const dash = Math.abs(v - 0.5) < 0.026 && fract(u * 2) < 0.6;
        if (shoulder || dash) { rgb = shoulder ? [74, 201, 235] : [249, 201, 97]; ht += 0.16; }
      } else if (kind === 'water' || kind === 'ice') {
        const a = Math.sin(TAU * (u * 3 + v * 7 + n * 0.76));
        const b = Math.sin(TAU * (u * 5 - v * 4 + d * 0.39));
        const ripple = 1 - Math.abs(a + b) * 0.5;
        q = 0.14 + n * 0.29 + ripple ** 6 * 0.57;
        ht = 0.49 + a * 0.16 + b * 0.11;
        if (kind === 'ice') {
          const ridge = Math.min(fract((u + v) * 4), fract((u - v) * 5));
          q += Math.floor(d * 4) * 0.105;
          if (ridge < 0.025) { ht -= 0.19; q += 0.21; gloss = 0.15; }
        }
      } else if (kind === 'lcd') {
        const xx = (x % 8 - 3.5) / 3.5, yy = (y % 8 - 3.5) / 3.5;
        const pixel = xx ** 4 + yy ** 4 < 0.79;
        q = pixel ? 0.48 + n * 0.27 : 0.20;
        ht = pixel ? 0.63 : 0.40;
      }
      paint(x, y, rgb || blend(low, high, q), 0.88 + d * 0.24 + grit * 0.07, ht, gloss);
    }
    [albedo, bump, rough].forEach((c, i) => c.putImageData(maps[i], 0, 0));
    // Wrap brushstrokes themselves as well as the underlying noise and masonry.
    const brush = rng(kind + '/marks');
    const wrapped = (x, y, pad, cb) => {
      for (const dx of x < pad ? [0, SIZE] : x > SIZE - pad ? [0, -SIZE] : [0]) {
        for (const dy of y < pad ? [0, SIZE] : y > SIZE - pad ? [0, -SIZE] : [0]) cb(x + dx, y + dy);
      }
    };
    if (kind === 'grass' || kind === 'turf') {
      for (let i = 0; i < (kind === 'grass' ? 340 : 480); i++) {
        const x = brush() * SIZE, y = brush() * SIZE, len = 2 + brush() * 9, dir = brush() * 9 - 4.5;
        wrapped(x, y, 13, (px, py) => {
          const path = (c) => { c.moveTo(px, py); c.quadraticCurveTo(px + dir * 0.2, py - len * 0.7, px + dir, py - len); };
          stroke(albedo, path, i % 3 ? '#badd774d' : '#1c452e85', 0.8);
          stroke(bump, path, '#d0d0d057', 1.1);
          stroke(rough, path, '#e8e8e84f', 1.1);
          if (kind === 'grass' && i % 41 === 0) {
            for (let a = 0; a < 3; a++) ellipse(albedo, px + Math.cos(a * TAU / 3) * 2, py + Math.sin(a * TAU / 3) * 2, 2.5, 1.7, '#d4ed9bba', a * TAU / 3);
          }
        });
      }
    } else if (kind === 'stone') {
      for (let tile = 0; tile < 8; tile++) {
        const x = tile * 32 + 16;
        const path = (c) => {
          c.moveTo(x - 5, 15); c.lineTo(x, 8); c.lineTo(x + 5, 15); c.lineTo(x, 22); c.closePath();
          c.moveTo(x - 9, 15); c.lineTo(x + 9, 15);
        };
        stroke(albedo, path, '#c1e8e385', 1.3);
        stroke(bump, path, '#555555', 1.7);
        stroke(rough, path, '#aaaaaa', 1.7);
      }
    } else if (kind === 'cosmos' || kind === 'ice') {
      for (let i = 0; i < 130; i++) {
        const x = brush() * SIZE, y = brush() * SIZE, radius = 0.4 + (i % 9 === 0 ? 1.1 : 0.3);
        wrapped(x, y, 3, (px, py) => ellipse(albedo, px, py, radius, radius, '#edfbffc0'));
      }
    }
    return {
      map: texture(T, albedo, { repeat: true, pixel: kind === 'lcd' }),
      bumpMap: texture(T, bump, { repeat: true, color: false }),
      roughnessMap: texture(T, rough, { repeat: true, color: false }),
      bumpScale,
    };
  });
}

export function getFaceTexture(def, palette, expression = 'normal', T = globalThis.THREE, owner = T) {
  const rig = def.rig || {};
  const key = ['face', def.id, palette.body, palette.skin, palette.accent, expression].join(':');
  return cached(owner, key, () => {
    const c = canvas(256);
    const impact = expression === 'impact', hurt = expression === 'hurt', attack = expression === 'attack', taunt = expression === 'taunt';
    const victory = expression === 'victory', sulk = expression === 'sulk';
    const blink = expression === 'blink';
    const eye = rig.eyes;
    const ink = '#211628', ivory = '#fff6e6';
    const plush = rig.silhouette === 'puff';
    const tech = eye === 'visor' || def.id === 'bizarro-intern';
    const aviators = eye === 'shades' || rig.prop === 'aviators';
    const squint = eye === 'unimpressed' || eye === 'smug';
    const intense = !victory && !sulk && !impact && (eye === 'intense' || eye === 'angry' || attack);
    const big = ['giant', 'wide', 'starry', 'bright'].includes(eye);
    const ey = 99, spacing = 46;
    if (eye === 'none') {
      c.fillStyle = '#f7fbff';
      c.beginPath(); c.moveTo(128, 58); c.lineTo(176, 148); c.lineTo(80, 148); c.closePath(); c.fill();
      stroke(c, (p) => { p.moveTo(72, 176); p.quadraticCurveTo(128, 214, 184, 176); }, '#f4f7ff', 8);
      return texture(T, c);
    }
    if (tech) {
      const glass = c.createLinearGradient(64, 62, 165, 143);
      glass.addColorStop(0, '#294760');
      glass.addColorStop(0.52, '#14283f');
      glass.addColorStop(1, '#251c38');
      c.beginPath();
      c.moveTo(53, 57); c.lineTo(203, 57); c.quadraticCurveTo(229, 57, 229, 83);
      c.lineTo(229, 113); c.quadraticCurveTo(229, 139, 203, 139); c.lineTo(53, 139);
      c.quadraticCurveTo(27, 139, 27, 113); c.lineTo(27, 83); c.quadraticCurveTo(27, 57, 53, 57); c.closePath();
      c.fillStyle = glass;
      c.fill();
      c.strokeStyle = '#172135';
      c.lineWidth = 7;
      c.stroke();
      stroke(c, (p) => { p.moveTo(46, 74); p.quadraticCurveTo(65, 61, 175, 64); }, palette.accent, 4);
    }
    for (const side of [-1, 1]) {
      const x = 128 + side * spacing;
      const ry = impact ? 34 : squint && !taunt && !victory ? 20 : big ? 34 : 27;
      const rx = big ? 38 : 35;
      const tilt = intense ? side * -0.24 : side * 0.10;
      if (!tech) {
        ellipse(c, x + side * 13, 143, plush ? 29 : 23, plush ? 13 : 10, plush ? '#f06b89a6' : '#ef6c7259', side * 0.13);
        for (let n = 0; n < 3; n++) ellipse(c, x + side * (7 + n * 8), 143 + (n % 2) * 3, 1.9, 1.7, '#85384f9c');
        stroke(c, (p) => {
          const inner = impact || sulk ? -17 : intense ? 7 : taunt && side < 0 ? -17 : -5;
          p.moveTo(x + side * 26, ey - ry - 12);
          p.quadraticCurveTo(x, ey - ry - 19, x - side * 26, ey - ry + inner);
        }, ink, intense ? 10 : 7);
      }
      if (impact) {
        if (!tech) ellipse(c, x, ey, rx + 2, ry + 2, ink, side * .14);
        ellipse(c, x, ey, tech ? 18 : rx - 2, tech ? 22 : ry - 2, tech ? '#acfcff' : ivory, side * .14);
        ellipse(c, x - side * 5, ey + 3, tech ? 5 : 8, tech ? 9 : 12, tech ? '#144376' : ink);
        if (!tech) ellipse(c, x - side * 5 - 2, ey - 1, 2.8, 3.6, '#ffffff');
        continue;
      }
      if (hurt) {
        if (!tech) {
          ellipse(c, x, ey, rx + 2, 29, ink);
          ellipse(c, x, ey, rx - 2, 25, ivory);
        }
        const line = tech ? '#b6fbff' : ink;
        if (side < 0) stroke(c, (p) => {
          p.moveTo(x - 13, ey - 13); p.lineTo(x + 13, ey + 13);
          p.moveTo(x + 13, ey - 13); p.lineTo(x - 13, ey + 13);
        }, line, 7);
        else {
          c.beginPath(); c.ellipse(x, ey, 12, 15, 0, 0, TAU);
          c.lineWidth = 7; c.strokeStyle = line; c.stroke();
        }
        continue;
      }
      if (blink || victory || sulk) {
        stroke(c, (p) => {
          p.moveTo(x - rx + 4, ey + (victory ? 7 : 0));
          p.quadraticCurveTo(x, ey + (victory ? -28 : sulk ? 8 : 15), x + rx - 4, ey + (victory ? 7 : 1));
        }, tech ? '#9af8ff' : ink, 8);
        continue;
      }
      if (tech) {
        stroke(c, (p) => {
          p.moveTo(x - side * 21, ey + (attack ? 6 : 0));
          p.quadraticCurveTo(x, ey - 14, x + side * 24, ey - (attack ? 9 : 0));
        }, '#9ef8ff', attack ? 8 : 6);
        ellipse(c, x + 4, ey + 3, 5, 9, palette.accent);
        continue;
      }
      ellipse(c, x, ey, rx + 3, ry + 3, ink, tilt);
      ellipse(c, x, ey, rx, ry, ivory, tilt);
      const iris = ({ garth:'#4594ba', troy:'#318b9f', screech:'#6297b6', velda:'#9650d1', mewtooth:'#36bcdb',
        zink:'#398967', 'tiny-zink':'#64463a', shriek:'#a2eaff' })[def.id] || (intense ? '#b96136' : '#347293');
      ellipse(c, x + 5, ey + 4, big ? 18 : 15, ry * 0.84, iris, tilt);
      ellipse(c, x + 6, ey + 5, 10, ry * 0.67, '#16162b');
      ellipse(c, x, ey - 5, 6.1, 6.1, '#ffffff');
      ellipse(c, x + 14, ey + 11, 2.8, 2.8, '#dcf6ff');
      if (eye === 'starry') stroke(c, (p) => {
        p.moveTo(x, ey - 19); p.lineTo(x, ey + 8); p.moveTo(x - 12, ey - 5); p.lineTo(x + 12, ey - 5);
      }, '#fff3d6', 3);
    }
    if (aviators || eye === 'glasses' || eye === 'monocle') {
      const frame = aviators || eye === 'monocle' ? '#e3aa5b' : '#2e2437';
      if (eye !== 'monocle') stroke(c, (p) => { p.moveTo(115, 94); p.quadraticCurveTo(128, 84, 141, 94); }, frame, 5);
      for (const side of eye === 'monocle' ? [1] : [-1, 1]) {
        const x = 128 + side * spacing;
        if (aviators && !hurt && !impact) {
          const glass = c.createLinearGradient(x - 30, 71, x + 8, 127);
          glass.addColorStop(0, '#72b6d0d9'); glass.addColorStop(0.50, '#283457d6'); glass.addColorStop(1, '#120c2ada');
          ellipse(c, x, ey + 1, 34, 25, glass, side * 0.15);
          stroke(c, (p) => { p.moveTo(x - 19, ey); p.lineTo(x - 6, ey - 15); }, '#e5ffffb0', 3);
        }
        c.beginPath(); c.ellipse(x, ey + 1, 37, aviators ? 26 : 34, aviators ? side * 0.15 : 0, 0, TAU);
        c.lineWidth = 5; c.strokeStyle = frame; c.stroke();
      }
      if (eye === 'monocle') stroke(c, (p) => { p.moveTo(209, 113); p.quadraticCurveTo(233, 149, 205, 187); }, frame, 3);
    }
    if (!tech || rig.hat !== 'visorHelm') {
      if (!tech && !rig.stache) {
        ellipse(c, 130, 137, 12, 9, '#703c466b');
        ellipse(c, 127, 133, 10, 7, '#fff3d287');
      }
      const x = taunt ? 138 : 128, y = rig.stache ? 188 : 174;
      if (victory) {
        c.beginPath();
        c.moveTo(x - 43, y - 9); c.quadraticCurveTo(x, y + 7, x + 43, y - 9);
        c.bezierCurveTo(x + 34, y + 39, x - 34, y + 39, x - 43, y - 9);
        c.closePath(); c.fillStyle = ink; c.fill();
        c.save(); c.clip();
        ellipse(c, x, y - 4, 42, 14, ivory);
        ellipse(c, x + 3, y + 25, 22, 8, '#f17e96');
        c.restore();
      } else if (sulk) {
        stroke(c, (p) => { p.moveTo(x - 22, y + 5); p.quadraticCurveTo(x, y - 12, x + 21, y + 2); }, ink, 7);
      } else if (impact) {
        ellipse(c, x, y, 24, 25, ink, -.11);
        ellipse(c, x, y - 11, 15, 5, ivory, -.11);
        ellipse(c, x + 3, y + 13, 12, 5, '#ee6b82');
      } else if (hurt || attack) {
        ellipse(c, x, y, hurt ? 17 : 32, hurt ? 21 : 17, ink);
        ellipse(c, x + 2, y + 8, hurt ? 9 : 18, 5, '#ee6b82');
        if (attack) ellipse(c, x, y - 9, 22, 4, ivory);
      } else if (taunt) {
        c.beginPath();
        c.moveTo(x - 40, y + 3); c.quadraticCurveTo(x + 3, y + 10, x + 31, y - 12);
        c.quadraticCurveTo(x + 16, y + 29, x - 40, y + 3);
        c.fillStyle = ink; c.fill();
        stroke(c, (p) => { p.moveTo(x - 16, y + 6); p.quadraticCurveTo(x + 6, y + 9, x + 22, y - 4); }, ivory, 4);
      } else {
        stroke(c, (p) => { p.moveTo(96, y - 2); p.quadraticCurveTo(128, y + (squint ? 4 : 22), 164, y - (squint ? 6 : 0)); }, ink, 8);
      }
    }
    if (rig.hat === 'ninjaWrap') {
      const scarf = c.createLinearGradient(0, 150, 0, 236);
      scarf.addColorStop(0, '#1a1e3300');
      scarf.addColorStop(0.18, '#1c2144');
      scarf.addColorStop(1, '#10142a');
      c.fillStyle = scarf;
      c.beginPath(); c.moveTo(0, 172); c.quadraticCurveTo(128, 156, 256, 172); c.lineTo(256, 240); c.lineTo(0, 240); c.closePath(); c.fill();
      for (let t = 0; t < 2; t++) stroke(c, (p) => { p.moveTo(16, 188 + t * 18); p.quadraticCurveTo(128, 198 + t * 10, 240, 182 + t * 16); }, '#3a4270', 2);
    }
    const id = def.id;
    if (id === 'screech' && !blink && !hurt) {
      for (const side of [-1, 1]) {
        const x = 128 + side * spacing;
        stroke(c, (p) => { p.moveTo(x - 16, ey - 30); p.quadraticCurveTo(x - 4, ey - 42, x + 14, ey - 28); }, ink, 3);
      }
    }
    if (id === 'broshee' && !hurt && !blink && !impact) {
      c.fillStyle = '#fffaf2';
      for (let i = -2; i <= 2; i++) c.fillRect(116 + i * 9, 166, 5, 11);
    }
    if (id === 'wonky-kong') {
      ellipse(c, 128, 154, 30, 18, '#8d95aa');
      ellipse(c, 116, 150, 5, 4, '#2c3348');
      ellipse(c, 142, 150, 5, 4, '#2c3348');
      ellipse(c, 90, 118, 5, 11, '#7ee7f2');
      ellipse(c, 170, 122, 5, 11, '#7ee7f2');
    }
    if (id === 'shriek' && !hurt && !blink && !impact) {
      for (const side of [-1, 1]) {
        const x = 128 + side * spacing;
        ellipse(c, x + 4, ey + 2, 12, 9, '#9af6ff');
        ellipse(c, x + 6, ey + 1, 4, 4, '#ffffff');
      }
    }
    if (id === 'sourzer') {
      stroke(c, (p) => { p.moveTo(58, 58); p.lineTo(114, 86); p.moveTo(198, 58); p.lineTo(142, 86); }, '#3a2416', 9);
    }
    if (id === 'dadondorf') {
      stroke(c, (p) => { p.moveTo(68, 58); p.lineTo(116, 78); p.moveTo(188, 58); p.lineTo(140, 78); }, ink, 8);
    }
    if (id === 'flurby') {
      c.fillStyle = '#ff9ec4cc';
      c.fillRect(68, 76, 52, 16);
      c.fillRect(136, 76, 52, 16);
    }
    if (id === 'velda') {
      for (const side of [-1, 1]) {
        const x = 128 + side * spacing;
        stroke(c, (p) => { p.moveTo(x, ey - 18); p.lineTo(x, ey + 8); p.moveTo(x - 10, ey - 4); p.lineTo(x + 10, ey - 4); }, '#ffe36a', 3);
      }
    }
    if (id === 'gigglefluff') {
      for (const side of [-1, 1]) {
        const x = 128 + side * spacing;
        ellipse(c, x + 4, ey + 2, 22, 20, '#7a3dffcc');
        ellipse(c, x - 2, ey - 8, 5, 5, '#ffffff');
        ellipse(c, x + 12, ey + 8, 3, 3, '#ffe9ff');
      }
    }
    if (id === 'mewtooth' && !hurt && !blink) {
      for (const side of [-1, 1]) {
        const x = 128 + side * spacing;
        ellipse(c, x + 5, ey + 3, 14, 7, '#7eefff');
        c.fillStyle = '#1a2438cc';
        c.fillRect(x - 20, ey - 8, 40, 7);
      }
    }
    if (id === 'spitzu' && !hurt && !blink) {
      ellipse(c, 68, 138, 18, 12, '#ff4d6a');
      ellipse(c, 188, 138, 18, 12, '#ff4d6a');
      c.fillStyle = '#fffaf2';
      for (let i = -3; i <= 3; i++) c.fillRect(108 + i * 8, 164, 4, 10);
    }
    if (id === 'chikapu') {
      ellipse(c, 76, 142, 16, 11, '#ff8aa8aa');
      ellipse(c, 182, 142, 16, 11, '#ff8aa8aa');
    }
    if (id === 'bario') stroke(c, (p) => { p.moveTo(198, 118); p.quadraticCurveTo(236, 164, 196, 206); }, '#e3aa5b', 4);
    return texture(T, c);
  });
}

export function getOutfitTextures(def, pal, T = globalThis.THREE, owner = T) {
  const rig = def.rig || {};
  const key = ['fabric', def.id, pal.body, pal.outfit, pal.accent].join(':');
  return cached(owner, key, () => {
    const c = canvas(256), b = canvas(256);
    const id = def.id;
    const armoured = rig.silhouette === 'armor' || rig.prop === 'shellSpikes';
    const quilt = ['parka', 'ovenMitt', 'sandbag'].includes(rig.silhouette);
    const doctor = id === 'dr-bario', plumber = id === 'squeegi';
    const overalls = !!rig.stache && !doctor && !plumber;
    const random = rng(key);
    c.fillStyle = id === 'wonky-kong' ? '#eeeee8' : id === 'shriek' ? '#1c2344' : id === 'velda' ? '#4c1d95' : pal.body;
    const flight = id === 'faux' || id === 'falcont';
    if (flight && pal.body === def.palettes[0].body) c.fillStyle = id === 'faux' ? '#785740' : '#304461';
    c.fillRect(0, 0, 256, 256);
    b.fillStyle = '#858585';
    b.fillRect(0, 0, 256, 256);
    for (let i = -256; i < 512; i += quilt ? 20 : 4) {
      const weave = (p) => { p.moveTo(i, 0); p.lineTo(i + 256, 256); };
      stroke(c, weave, quilt ? '#1814244f' : '#ffffff13', quilt ? 2.0 : 1);
      stroke(b, weave, quilt ? '#434343' : '#a2a2a2', quilt ? 2.5 : 0.8);
      if (quilt) {
        const cross = (p) => { p.moveTo(i, 0); p.lineTo(i - 256, 256); };
        stroke(c, cross, '#1814244f', 2.0); stroke(b, cross, '#434343', 2.5);
      }
    }
    if (quilt) for (let x = 0; x < 256; x += 5) for (let y = 0; y < 256; y += 5) {
      c.fillStyle = random() > 0.5 ? '#fff4ca25' : '#27203722';
      c.fillRect(x, y, 3, 2);
    }
    if (rig.silhouette === 'kid' || rig.silhouette === 'puff') {
      for (let y = 7; y < 255; y += 24) {
        if (rig.silhouette === 'kid') {
          c.fillStyle = '#ffeaba42'; c.fillRect(0, y, 256, 5);
        } else for (let x = 9; x < 253; x += 23) ellipse(c, x, y, 2.9, 3.5, '#fff8ffe0', 0.15);
      }
    }
    // Lathed torso front has u=.25 (+X), back has u=.75. Mirrored motifs read at either camera angle.
    const panels = (p, front, fill, line) => {
      p.fillStyle = fill;
      p.beginPath();
      p.moveTo(front - 30, 21); p.lineTo(front - 18, 42); p.lineTo(front + 18, 42); p.lineTo(front + 30, 21);
      p.lineTo(front + 41, 94); p.lineTo(front + 24, 167); p.lineTo(front, 185);
      p.lineTo(front - 24, 167); p.lineTo(front - 41, 94); p.closePath(); p.fill();
      p.strokeStyle = line; p.lineWidth = 3; p.stroke();
    };
    for (const x of [64, 192]) {
      if (id === 'wonky-kong') {
        for (const side of [-1, 1]) {
          c.beginPath();
          c.moveTo(x + side * 4, 22); c.lineTo(x + side * 38, 40); c.lineTo(x + side * 12, 82); c.closePath();
          c.fillStyle = '#f4f1ea'; c.fill();
        }
        c.fillStyle = '#3a4258';
        c.fillRect(x - 20, 96, 40, 70);
      } else if (id === 'dr-bario') {
        c.fillStyle = '#f7f8ff';
        c.fillRect(x - 48, 16, 96, 210);
        c.fillStyle = pal.body;
        c.beginPath();
        c.moveTo(x - 8, 20); c.lineTo(x + 8, 20); c.lineTo(x + 5, 68); c.lineTo(x - 5, 68); c.closePath(); c.fill();
        for (const side of [-1, 1]) {
          c.beginPath();
          c.moveTo(x + side * 6, 24); c.lineTo(x + side * 36, 28); c.lineTo(x + side * 14, 96); c.closePath();
          c.fillStyle = '#e7ebf8'; c.fill();
          c.strokeStyle = '#c5cce0'; c.lineWidth = 2; c.stroke();
        }
        c.strokeStyle = '#9aa3b8'; c.lineWidth = 4;
        c.beginPath(); c.arc(x, 78, 16, 0.2, Math.PI - 0.2); c.stroke();
        c.fillStyle = '#d7deea';
        c.beginPath(); c.arc(x - 14, 92, 5, 0, Math.PI * 2); c.arc(x + 14, 92, 5, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#c9a24a';
        c.beginPath(); c.arc(x, 118, 4, 0, Math.PI * 2); c.fill();
      } else if (flight) {
        c.fillStyle = '#f1dfb8';
        c.beginPath(); c.moveTo(x-38,18);c.lineTo(x+36,18);c.lineTo(x+18,62);c.lineTo(x+3,50);
        c.lineTo(x-12,68);c.closePath();c.fill();
        c.fillStyle='#d69c53';c.fillRect(x-2,53,3,172);
        stroke(c,p=>{p.moveTo(x+13,97);p.lineTo(x+33,93);},'#f0b36b',3);
      } else if (id === 'squeegi') {
        c.fillStyle = pal.body;
        c.fillRect(x - 46, 14, 92, 108);
        for (const side of [-1, 1]) {
          c.beginPath();
          c.moveTo(x + side * 4, 18); c.lineTo(x + side * 30, 24); c.lineTo(x + side * 10, 78); c.closePath();
          c.fillStyle = '#c4b5fd'; c.fill();
        }
        c.fillStyle = pal.outfit;
        c.fillRect(x - 40, 112, 80, 130);
        ellipse(c, x, 118, 6, 7, '#f6e27a');
      } else if (id === 'dadondorf') {
        c.fillStyle = '#f6f1e8';
        c.fillRect(x - 18, 28, 8, 48);
        c.fillRect(x + 10, 28, 8, 48);
        c.fillStyle = pal.outfit;
        c.beginPath();
        c.moveTo(x - 22, 62); c.lineTo(x + 22, 62); c.lineTo(x + 26, 168); c.lineTo(x - 26, 168); c.closePath(); c.fill();
      } else if (armoured) {
        panels(c, x, pal.outfit, '#202438'); panels(b, x, '#b4b4b4', '#484848');
        stroke(c, (p) => { p.moveTo(x - 23, 86); p.lineTo(x, 97); p.lineTo(x + 23, 86); }, pal.accent, 4);
      } else if (overalls) {
        c.fillStyle = pal.outfit; c.fillRect(x - 27, 104, 54, 152);
        for (const side of [-1, 1]) {
          stroke(c, (p) => { p.moveTo(x + side * 27, 15); p.lineTo(x + side * 19, 118); }, pal.outfit, 14);
          ellipse(c, x + side * 18, 114, 5, 6, '#442c25');
          ellipse(c, x + side * 18 - 1, 112, 4, 5, '#ffd36e');
          ellipse(b, x + side * 18, 113, 5, 6, '#dedede');
        }
        stroke(c, (p) => { p.moveTo(x - 13, 132); p.lineTo(x - 12, 157); p.lineTo(x + 12, 157); p.lineTo(x + 13, 132); p.closePath(); }, '#f5e4b9aa', 1.8);
      } else if (rig.prop === 'tie' || rig.cape === 'labcoat' || rig.cape === 'apron' || rig.cape === 'nda') {
        panels(c, x, pal.outfit, '#19182945');
        for (const side of [-1, 1]) {
          c.beginPath();
          c.moveTo(x + side * 10, 29); c.lineTo(x + side * 34, 43); c.lineTo(x + side * 17, 83); c.closePath();
          c.fillStyle = '#f9f1dc9c'; c.fill();
        }
        if (rig.prop === 'tie' || def.id === 'dr-bario') {
          c.beginPath(); c.moveTo(x - 7, 57); c.lineTo(x + 7, 57); c.lineTo(x + 11, 121);
          c.lineTo(x, 136); c.lineTo(x - 11, 121); c.closePath();
          c.fillStyle = def.id === 'dr-bario' ? '#6d28d9' : pal.accent; c.fill();
          ellipse(c, x, 51, 9, 7, def.id === 'dr-bario' ? '#6d28d9' : pal.accent);
          stroke(c, (p) => { p.moveTo(x - 4, 65); p.lineTo(x - 6, 117); }, '#ffffff64', 2);
        }
        if (def.id === 'dadondorf') {
          c.fillStyle = '#ff7a1a';
          c.beginPath(); c.moveTo(x - 20, 96); c.lineTo(x - 8, 58); c.lineTo(x + 4, 88); c.lineTo(x + 18, 48); c.lineTo(x + 22, 108); c.closePath(); c.fill();
        }
      } else {
        if (def.id === 'squeegi') {
          c.fillStyle = '#7c3aed';
          c.fillRect(x - 52, 34, 24, 30);
          c.fillRect(x + 28, 34, 24, 30);
        }
        if (id === 'broshee') {
          ellipse(c, x, 108, 28, 38, '#ffe56a');
          ellipse(c, x, 108, 16, 22, '#fff4c4');
        }
        if (id === 'chikapu') ellipse(c, x, 128, 20, 28, '#fffaf2');
        if (id === 'shriek') {
          for (let band = 30; band < 180; band += 22) {
            c.fillStyle = band % 44 ? '#14182e' : '#2a3158';
            c.fillRect(x - 34, band, 68, 7);
          }
        }
        if (id === 'mess') {
          for (let band = 22; band < 188; band += 16) {
            c.fillStyle = (Math.floor(band / 16) % 2) ? pal.body : pal.outfit;
            c.fillRect(x - 42, band, 84, 8);
          }
        }
        if (id === 'zink' || id === 'tiny-zink') {
          c.fillStyle = '#6b3e22';
          c.fillRect(x - 38, 148, 76, 14);
          ellipse(c, x, 155, 6, 7, '#e6c36a');
        }
        if (id === 'garth') {
          c.fillStyle = '#facc15';
          c.fillRect(x - 44, 26, 24, 12);
          c.fillRect(x + 20, 26, 24, 12);
        }
        if (id === 'troy') {
          c.fillStyle = '#facc15';
          c.fillRect(x - 20, 34, 40, 10);
        }
        stroke(c, (p) => { p.moveTo(x - 22, 21); p.lineTo(x - 15, 68); p.lineTo(x + 15, 68); p.lineTo(x + 22, 21); }, '#17152975', 3);
        ellipse(c, x, 103, 9, 13, pal.outfit);
        ellipse(c, x, 102, 4, 7, pal.accent);
      }
    }
    if (id === 'screech') {
      c.fillStyle = '#ffd0ea';
      c.fillRect(0, 148, 256, 16);
      c.fillStyle = '#ff4fa3';
      c.fillRect(0, 172, 256, 14);
    }
    stroke(c, (p) => { p.moveTo(0, 207); p.lineTo(256, 207); }, '#120d2660', 6);
    stroke(b, (p) => { p.moveTo(0, 207); p.lineTo(256, 207); }, '#575757', 3);
    return { map: texture(T, c, { repeat: true }), bumpMap: texture(T, b, { repeat: true, color: false }) };
  });
}

export function skyStyle(stage) {
  const id = stage.id;
  if (stage.theme === 'lcd') return 'lcd';
  if (stage.theme === 'acid') return 'acid';
  if (stage.theme === 'cosmos') return 'space';
  if (/highway|commute|skyscrapers/.test(id) && id !== 'rainbow-highway') return 'neon';
  if (['puddle-of-insomnia', 'arguefield'].includes(id)) return 'moon';
  if (['sandbag-yard', 'critter-arena', 'critter-floats', 'rainbow-highway'].includes(id)) return 'sunset';
  return 'day';
}

export function getSkyTexture(stage, T = globalThis.THREE, owner = T) {
  const pal = stage.palette || {};
  return cached(owner, ['sky', stage.id, pal.skyTop, pal.skyMid, pal.skyBottom, pal.accent].join(':'), () => {
    const w = 1024, h = 512, c = canvas(w * 2, h * 2);
    c.scale(2, 2);
    const style = skyStyle(stage);
    const random = rng(stage.id + '/sky');
    const gradient = c.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, pal.skyTop || '#102143');
    gradient.addColorStop(0.33, pal.skyTop || '#102143');
    gradient.addColorStop(0.49, pal.skyMid || '#474c86');
    gradient.addColorStop(0.59, pal.skyBottom || '#a17783');
    gradient.addColorStop(0.83, pal.skyTop || '#102143');
    gradient.addColorStop(1, '#0c091a');
    c.fillStyle = gradient;
    c.fillRect(0, 0, w, h);
    const deepDaylight = stage.id === 'yoshis-tax-island' || stage.id === 'foreclosed-castle';
    if (deepDaylight) {
      const dusk = c.createLinearGradient(0, 160, 0, 365);
      dusk.addColorStop(0, '#15284700');
      dusk.addColorStop(0.56, '#15284755');
      dusk.addColorStop(1, '#15284700');
      c.fillStyle = dusk;
      c.fillRect(0, 160, w, 205);
    }
    const night = ['space', 'moon', 'neon'].includes(style);
    if (night || style === 'acid' || style === 'sunset') {
      c.globalCompositeOperation = 'screen';
      for (let i = 0; i < 28; i++) {
        const x = i * w / 28, y = 248 + Math.sin(i * 0.41) * 29 + random() * 29;
        const radius = 25 + random() * 93;
        const color = style === 'acid' ? '#ff792537' : style === 'sunset' ? '#ff875445' : i % 2 ? '#b559d74a' : '#39a6e443';
        for (const dx of [-w, 0, w]) glow(c, x + dx, y, radius, color, '#00000000');
      }
      c.globalCompositeOperation = 'source-over';
      if (night) for (let i = 0; i < 1100; i++) {
        const x = random() * w, y = 25 + random() * 305, r = random() ** 5 * 1.12 + 0.15;
        ellipse(c, x, y, r, r * 0.68, i % 7 ? '#d7e8ffc0' : '#ffd9a9');
        if (r > 1.15) {
          stroke(c, (p) => { p.moveTo(x - 2.4, y); p.lineTo(x + 2.4, y); p.moveTo(x, y - 2.4); p.lineTo(x, y + 2.4); }, '#dff4ffa7', 0.55);
        }
      }
      if (night && style !== 'neon') {
        for (let layer = 0; layer < 6; layer++) {
          stroke(c, (p) => {
            for (let x = 0; x <= w; x += 8) {
              const t = x / w * TAU;
              const y = 235 + Math.sin(t * 2 + layer * 0.09) * 17 + Math.cos(t * 3.0) * 12 + layer * 2;
              if (x === 0) p.moveTo(x, y); else p.lineTo(x, y);
            }
          }, layer % 2 ? '#7ef8ee0b' : '#a68bfb14', 2 + layer * 1.8);
        }
      }
    }
    if (style === 'day' || style === 'sunset') {
      for (let i = 0; i < 86; i++) {
        const x = random() * w, y = 216 + random() * 91, rx = 10 + random() * 49;
        const ry = 3 + random() * 12;
        const col = style === 'sunset' ? '#ffd0be37' : deepDaylight ? '#cfe8ff26' : '#f6faff43';
        for (const dx of [-w, 0, w]) ellipse(c, x + dx, y, rx, ry, col);
      }
    }
    if (style === 'lcd') {
      for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
        c.fillStyle = '#36445942'; c.fillRect(x, y, 3, 3);
      }
      c.fillStyle = '#26352eab'; c.fillRect(0, 166, w, 8); c.fillRect(0, 329, w, 8);
      c.fillStyle = '#e9f2d84d'; c.fillRect(0, 174, w, 2); c.fillRect(0, 327, w, 2);
    }
    const map = texture(T, c);
    map.wrapS = T.RepeatWrapping;
    return map;
  });
}

export function getCloudTexture(T = globalThis.THREE, owner = T) {
  return cached(owner, 'cloud', () => {
    const c = canvas(256, 128);
    const random = rng('wisps');
    for (let i = 0; i < 35; i++) {
      const x = 33 + random() * 190, y = 53 + random() * 29, r = 13 + random() * 23;
      glow(c, x, y, r, '#ffffff43', '#ffffff00');
    }
    return texture(T, c);
  });
}

export function getDamageSmokeTexture(T, owner) {
  return cached(owner, 'damage-smoke', () => {
    const c = canvas(128);
    for (const [x, y, r, ink] of [[64,69,53,'#272439'], [39,62,26,'#373044'], [82,46,32,'#30293d'],
      [63,41,26,'#494054'], [88,72,25,'#231f31'], [52,73,26,'#31293d']]) {
      const shade = c.createRadialGradient(x - r * 0.18, y - r * 0.22, 0, x, y, r);
      shade.addColorStop(0, ink);
      shade.addColorStop(0.69, ink + 'dd');
      shade.addColorStop(1, ink + '00');
      c.fillStyle = shade; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return texture(T, c);
  });
}

// Painted silhouettes rather than opaque sphere clusters. Both maps are local and shared per renderer.
export function getImpactPuffTexture(kind, T, owner) {
  return cached(owner, 'impact-puff:' + kind, () => {
    const c = canvas(128), dust = kind === 'dustPuff';
    const edge = (radius, amplitude) => {
      for (let i = 0; i < 96; i++) {
        const a = i * TAU / 96;
        const r = radius + Math.cos(a * 7 + .9) * amplitude + Math.sin(a * 3 + .7) * 2.1;
        const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.closePath();
    };
    glow(c, 64, 65, 61, dust ? '#ffe5ba44' : '#fff1cf26', '#ffe5ba00');
    const paint = c.createLinearGradient(44, 24, 82, 109);
    paint.addColorStop(0, '#fffffff5');
    paint.addColorStop(.48, dust ? '#fff3d4ef' : '#fff8e5f0');
    paint.addColorStop(1, dust ? '#dba36ed6' : '#ffc06fb8');
    c.beginPath();
    edge(dust ? 45 : 47, dust ? 7 : 5);
    if (!dust) edge(28, 4.2);
    c.fillStyle = paint;
    c.fill('evenodd');
    c.strokeStyle = dust ? '#ffe4b273' : '#fff4d876';
    c.lineWidth = 2.5;
    c.stroke();
    stroke(c, (p) => { p.moveTo(27, 54); p.quadraticCurveTo(34, 30, 61, 28); }, '#ffffffa8', 4);
    if (dust) stroke(c, (p) => {
      p.moveTo(51, 73); p.quadraticCurveTo(66, 54, 85, 61); p.quadraticCurveTo(98, 64, 96, 75);
    }, '#fffefa85', 3);
    return texture(T, c);
  });
}

export function getFistSteamTexture(T, owner) {
  return cached(owner, 'gold-fist-steam', () => {
    const c = canvas(96);
    const ink = c.createLinearGradient(35, 88, 58, 7);
    ink.addColorStop(0, '#fff4ccb0');
    ink.addColorStop(.39, '#ffe0a1db');
    ink.addColorStop(.78, '#ffcb705a');
    ink.addColorStop(1, '#ffcb7000');
    c.beginPath();
    c.moveTo(42, 91);
    c.bezierCurveTo(18, 73, 27, 60, 49, 47);
    c.bezierCurveTo(72, 32, 67, 18, 46, 5);
    c.bezierCurveTo(80, 15, 82, 38, 62, 55);
    c.bezierCurveTo(42, 70, 34, 77, 49, 91);
    c.closePath();
    c.fillStyle = ink;
    c.fill();
    stroke(c, (p) => { p.moveTo(42, 82); p.bezierCurveTo(31, 64, 65, 55, 68, 31); }, '#ffefc68f', 2.6);
    return texture(T, c);
  });
}

export function getJumbotronTexture(T, owner, nextForm) {
  return cached(owner, nextForm ? `jumbotron-warning:${nextForm}` : 'jumbotron-live', () => {
    const c = canvas(512, 256);
    const field = c.createLinearGradient(0, 0, 512, 256);
    if (nextForm) {
      field.addColorStop(0, '#2c1023'); field.addColorStop(1, '#701e24');
      c.fillStyle = field; c.fillRect(0, 0, 512, 256);
      c.strokeStyle = '#ff9f45'; c.lineWidth = 7; c.strokeRect(11, 11, 490, 234);
      c.fillStyle = '#ffb449'; c.fillRect(23, 55, 466, 42);
      c.fillStyle = '#211021'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '1000 30px system-ui'; c.fillText('!  TERRAIN SHIFT  !', 256, 77, 433);
      c.fillStyle = '#ffcb75'; c.font = 'bold 24px monospace'; c.fillText('NEXT FORM', 256, 118);
      c.fillStyle = '#fff4d5'; c.font = '1000 italic 65px system-ui';
      c.fillText(nextForm.toUpperCase(), 256, 171, 450);
      c.save();
      c.beginPath(); c.rect(23, 208, 466, 19); c.clip();
      c.fillStyle = '#211021'; c.fillRect(23, 208, 466, 19);
      c.fillStyle = '#ffb449';
      for (let x = 8; x < 500; x += 36) {
        c.beginPath(); c.moveTo(x, 227); c.lineTo(x + 15, 208); c.lineTo(x + 32, 208); c.lineTo(x + 17, 227); c.fill();
      }
      c.restore();
      return texture(T, c);
    }
    field.addColorStop(0, '#10254a'); field.addColorStop(1, '#093c3a');
    c.fillStyle = field; c.fillRect(0, 0, 512, 256);
    c.strokeStyle = '#6ef8bc'; c.lineWidth = 4; c.strokeRect(11, 11, 490, 234);
    c.fillStyle = '#163e58'; c.fillRect(22, 22, 468, 44);
    c.fillStyle = '#ff7a92'; c.fillRect(38, 37, 13, 13);
    c.fillStyle = '#f6faff'; c.font = 'bold 23px monospace'; c.fillText('LIVE', 63, 53);
    c.textAlign = 'right'; c.fillText('MAIN EVENT', 473, 53);
    c.textAlign = 'center'; c.font = '900 italic 66px system-ui'; c.fillStyle = '#e1fff5';
    c.fillText('CRITTER', 256, 137);
    c.font = '900 italic 46px system-ui'; c.fillStyle = '#80ffba'; c.fillText('A R E N A', 256, 196);
    c.fillStyle = '#051a2a40';
    for (let y = 0; y < 256; y += 4) c.fillRect(0, y, 512, 1);
    return texture(T, c);
  });
}

export function getPodiumRankTexture(rank, T, owner) {
  return cached(owner, 'podium:' + rank, () => {
    const c = canvas(96);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '1000 69px system-ui';
    c.lineWidth = 7; c.strokeStyle = '#422b32'; c.strokeText(String(rank), 48, 48);
    c.fillStyle = '#ffefbb'; c.fillText(String(rank), 48, 48);
    return texture(T, c);
  });
}

export function getLcdTexture(T, owner) {
  return cached(owner, 'calculator-display', () => {
    const c = canvas(512,256);
    c.fillStyle = '#aaba89'; c.fillRect(0,0,512,256);
    c.fillStyle = '#92a277';
    for (let x=0;x<512;x+=4) c.fillRect(x,0,1,256);
    for (let y=0;y<256;y+=4) c.fillRect(0,y,512,1);
    // Six identical seven-segment cells, with angled ends and a dark LCD shadow.
    for (let d=0;d<6;d++) {
      const left = 235+d*39;
      for (const [dx,dy,angle] of [[4,0,0],[4,28,0],[4,56,0],[0,3,1],[32,3,1],[0,31,1],[32,31,1]]) {
        c.save(); c.translate(left+dx,22+dy); c.rotate(angle*Math.PI/2);
        c.fillStyle = '#4f6143';
        c.beginPath(); c.moveTo(0,0); c.lineTo(3,-2); c.lineTo(22,-2); c.lineTo(25,0);
        c.lineTo(22,2); c.lineTo(3,2); c.closePath(); c.fill(); c.restore();
      }
    }
    return texture(T,c,{pixel:true});
  });
}

export function getStageSignTexture(text, ink, paper, T, owner) {
  return cached(owner, `stage-sign:${text}:${ink}:${paper}`, () => {
    const c = canvas(512, 128);
    c.fillStyle = paper;
    c.fillRect(0, 0, 512, 128);
    c.strokeStyle = ink;
    c.lineWidth = 3;
    c.strokeRect(9, 9, 494, 110);
    c.fillStyle = ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 70px system-ui, sans-serif';
    c.fillText(text, 256, 66, 458);
    return texture(T, c);
  });
}

// A narrow warm/cool edge response on the opaque fighter itself. No duplicate
// silhouette geometry and no reliance on the color of the stage behind it.
export function addFighterRim(material) {
  const flash = { value: 0 };
  const flashColor = { value: material.color.clone().set('#ffffff') };
  const metal = { value: 0 };
  material.userData.combatFlash = { flash, flashColor, metal };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.metalCoat = metal;
    shader.uniforms.combatFlash = flash;
    shader.uniforms.combatFlashColor = flashColor;
    shader.fragmentShader = `uniform float metalCoat;
      uniform float combatFlash;
      uniform vec3 combatFlashColor;
       ${shader.fragmentShader}`.replace('#include <metalnessmap_fragment>', `
      #include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, 0.92, metalCoat);
      roughnessFactor = mix(roughnessFactor, 0.14, metalCoat);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.716,.791,.913), metalCoat);
    `).replace('#include <opaque_fragment>', `
      float faceOn = clamp(dot(normalize(geometryViewDir), normal), 0.0, 1.0);
      float edge = (1.0 - smoothstep(0.06, 0.47, faceOn)) * smoothstep(0.06, 0.95, normal.y * 0.5 + 0.5);
      vec3 rimInk = mix(vec3(0.25, 0.64, 0.86), vec3(1.0, 0.64, 0.30), smoothstep(-0.8, 0.8, normal.x));
      outgoingLight += rimInk * edge * .22 * (1.0-metalCoat);
      float reflectionBand = smoothstep(.38,.53,reflect(-normalize(geometryViewDir),normal).y);
      outgoingLight += metalCoat * mix(vec3(.10,.14,.20),vec3(.68,.79,.95),reflectionBand);
      outgoingLight = mix(outgoingLight, combatFlashColor * 3.7, combatFlash);
      #include <opaque_fragment>
    `);
  };
  return material;
}

// White energy stamp, tinted by the rig. Thin spokes read even when the core
// projects to a few pixels, and the transparent corners don't wash out terrain.
export function getCombatGlowTexture(T, owner) {
  return cached(owner, 'combat-glow', () => {
    const c = canvas(128);
    glow(c, 64, 64, 63, '#ffffffe0', '#ffffff00');
    glow(c, 64, 64, 27, '#ffffff', '#ffffff00');
    c.translate(64, 64);
    c.rotate(Math.PI / 4);
    for (let i = 0; i < 4; i++) {
      c.rotate(Math.PI / 2);
      const g = c.createLinearGradient(0, 0, 56, 0);
      g.addColorStop(0, '#ffffffda'); g.addColorStop(1, '#ffffff00');
      c.beginPath(); c.moveTo(0, -6); c.lineTo(56, 0); c.lineTo(0, 6); c.closePath();
      c.fillStyle = g; c.fill();
    }
    return texture(T, c);
  });
}


export function getCelestialTexture(style, T = globalThis.THREE, owner = T) {
  return cached(owner, 'celestial:' + style, () => {
    const c = canvas(256), x = 128, y = 128;
    const sun = style === 'sunset', space = style === 'space';
    const tint = sun ? '#ff967863' : space ? '#d1a5ff5f' : '#a9ceff65';
    glow(c, x, y, 124, tint, '#00000000');
    glow(c, x, y, 90, sun ? '#ffb66c6b' : '#b9dfff5a', '#00000000');
    const r = 67;
    c.save();
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.clip();
    const surface = c.createLinearGradient(x - r, y - r, x + r, y + r);
    surface.addColorStop(0, sun ? '#fff2b9' : '#fffcea');
    surface.addColorStop(0.5, sun ? '#ffc58e' : space ? '#dfaff2' : '#d9e4ff');
    surface.addColorStop(1, sun ? '#ff7669' : space ? '#8668aa' : '#748cbd');
    c.fillStyle = surface;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    const random = rng(style + '/orb');
    if (!sun) for (let i = 0; i < 29; i++) {
      const px = x - r + random() * r * 2, py = y - r + random() * r * 2;
      const size = 3 + random() * 18;
      glow(c, px, py, size, space ? '#643e8249' : '#526d9c55', '#00000000');
    }
    if (sun) for (let i = 0; i < 6; i++) {
      c.fillStyle = '#fd79533a';
      c.fillRect(x - r, y + 7 + i * 8, r * 2, 2 + i * 0.5);
    }
    c.restore();
    return texture(T, c);
  });
}
