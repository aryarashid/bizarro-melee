/**
 * High-Detail Illustrated Bizarro Character Portrait Atlas Loader.
 * Maps all 28 playable Bizarro fighters + Master Mitt to their illustrated
 * 3x3 sprite sheets in web/assets/portraits/sheet_{1,2,3,4}.jpg, with crisp
 * alt-costume tint shifts and graceful procedural canvas fallback.
 */

import { getFighterById } from './roster.js';

const PORTRAIT_MAP = {
  // Sheet 1 (Row 1: Dr. Bario, Bario, Squeegi | Row 2: Sourzer, Screech, Broshee | Row 3: Wonky Kong, Captain Pigeon, Dadondorf)
  'dr-bario':       { sheet: 1, col: 0, row: 0 },
  'bario':          { sheet: 1, col: 1, row: 0 },
  'squeegi':        { sheet: 1, col: 2, row: 0 },
  'sourzer':        { sheet: 1, col: 0, row: 1 },
  'screech':        { sheet: 1, col: 1, row: 1 },
  'broshee':        { sheet: 1, col: 2, row: 1 },
  'wonky-kong':     { sheet: 1, col: 0, row: 2 },
  'captain-pigeon': { sheet: 1, col: 1, row: 2 },
  'dadondorf':      { sheet: 1, col: 2, row: 2 },

  // Sheet 2 (Row 1: Falcon't, Faux, Mess | Row 2: Slush Shovelers, Flurby, Shamus | Row 3: Velda, Zink, Tiny Zink)
  'falcont':         { sheet: 2, col: 0, row: 0 },
  'faux':            { sheet: 2, col: 1, row: 0 },
  'mess':            { sheet: 2, col: 2, row: 0 },
  'slush-shovelers': { sheet: 2, col: 0, row: 1 },
  'flurby':          { sheet: 2, col: 1, row: 1 },
  'shamus':          { sheet: 2, col: 2, row: 1 },
  'velda':           { sheet: 2, col: 0, row: 2 },
  'zink':            { sheet: 2, col: 1, row: 2 },
  'tiny-zink':       { sheet: 2, col: 2, row: 2 },

  // Sheet 3 (Row 1: Spitzu, Chikapu, Gigglefluff | Row 2: Mewtooth, Mr. Beep & Blob, Garth | Row 3: Troy, Shriek, Master Mitt)
  'spitzu':        { sheet: 3, col: 0, row: 0 },
  'chikapu':       { sheet: 3, col: 1, row: 0 },
  'gigglefluff':   { sheet: 3, col: 2, row: 0 },
  'mewtooth':      { sheet: 3, col: 0, row: 1 },
  'mr-beep-blob':  { sheet: 3, col: 1, row: 1 },
  'garth':         { sheet: 3, col: 2, row: 1 },
  'troy':          { sheet: 3, col: 0, row: 2 },
  'shriek':        { sheet: 3, col: 1, row: 2 },
  'master-mitt':   { sheet: 3, col: 2, row: 2 },

  // Sheet 4 (Row 1: Sadaam Insane, Atticus Khomeini). Rendered from the live 3D rigs.
  'sadaam-insane':    { sheet: 4, col: 0, row: 0 },
  'atticus-khomeini': { sheet: 4, col: 1, row: 0 },
};

const sheets = new Map();
const listeners = new Set();
const costumes = new Map();
const paletteKeys = ['body', 'outfit', 'accent'];

function hue(r, g, b, high, spread) {
  if (high === r) return (g - b) / spread;
  if (high === g) return 2 + (b - r) / spread;
  return 4 + (r - g) / spread;
}

function swatch(hex) {
  const rgb = hex.slice(1).match(/../g).map((pair) => parseInt(pair, 16));
  const high = Math.max(...rgb), low = Math.min(...rgb), spread = high - low;
  return { rgb, light: (high + low) / 2, spread, hue: spread ? hue(...rgb, high, spread) : 0 };
}

function paintCostume(ctx, w, h, def, palette) {
  const keys = paletteKeys.map((key) => ({ from: swatch(def.palettes[0][key]), to: swatch(palette[key]) }))
    .filter(({ from }) => from.spread > 34);
  const image = ctx.getImageData(0, 0, w, h), pixels = image.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const high = Math.max(r, g, b), low = Math.min(r, g, b), spread = high - low;
    const light = (high + low) / 2;
    if (spread < 28 || light < 40) continue; // Keep cream highlights and ink intact.
    const h0 = hue(r, g, b, high, spread);
    let best, distance = 0.66;
    for (const entry of keys) {
      const shift = Math.abs(h0 - entry.from.hue), off = Math.min(shift, 6 - shift);
      if (off < distance) { distance = off; best = entry; }
    }
    if (!best) continue;
    const strength = Math.min(1, (0.66 - distance) / 0.32, (spread - 28) / 27, (light - 40) / 36);
    const shade = light < best.from.light ? light / best.from.light - 1 : (light - best.from.light) / (255 - best.from.light);
    for (let c = 0; c < 3; c++) {
      const base = best.to.rgb[c];
      const lit = base + shade * (shade < 0 ? base : 255 - base);
      pixels[i + c] += (lit - pixels[i + c]) * strength;
    }
  }
  ctx.putImageData(image, 0, 0);

  const wash = ctx.createLinearGradient(0, 0, w, h);
  wash.addColorStop(0, palette.outfit + '25');
  wash.addColorStop(0.54, palette.body + '00');
  wash.addColorStop(1, palette.body + '45');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  const unit = Math.max(1, Math.round(Math.min(w, h) / 30));
  ctx.lineWidth = unit;
  ctx.strokeStyle = palette.body;
  ctx.strokeRect(unit / 2, unit / 2, w - unit, h - unit);
  ctx.fillStyle = palette.accent;
  ctx.fillRect(unit, unit, 5 * unit, unit);
  const x = w - 12 * unit, y = h - 6 * unit;
  ctx.fillStyle = '#141020';
  ctx.fillRect(x, y, 11 * unit, 5 * unit);
  paletteKeys.forEach((key, index) => {
    ctx.fillStyle = palette[key];
    ctx.fillRect(x + unit * (1 + 3 * index), y + unit, 3 * unit, 3 * unit);
  });
}

export function preloadPortraits(onReady) {
  if (typeof onReady === 'function') listeners.add(onReady);
  if (typeof Image === 'undefined') return;
  for (const num of [1, 2, 3, 4]) {
    if (sheets.has(num)) continue;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      for (const fn of listeners) {
        try { fn(); } catch {}
      }
    };
    img.src = `assets/portraits/sheet_${num}.jpg`;
    sheets.set(num, img);
  }
}

/**
 * Draws the illustrated portrait for a fighter onto a canvas.
 * Returns true if the illustrated portrait was drawn; false if caller should fall back to procedural art.
 */
export function drawIllustratedPortrait(canvas, fighterId, paletteIndex = 0) {
  const entry = PORTRAIT_MAP[fighterId];
  if (!entry || !canvas) return false;
  const img = sheets.get(entry.sheet);
  if (!img || !img.complete || img.naturalWidth === 0) return false;

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cellW = img.naturalWidth / 3;
  const cellH = img.naturalHeight / 3;
  // Trim 2.5% border from each grid cell so grid divider lines never show!
  const padX = cellW * 0.025;
  const padY = cellH * 0.025;
  const sx = entry.col * cellW + padX;
  const sy = entry.row * cellH + padY;
  const sw = cellW - padX * 2;
  const sh = cellH - padY * 2;

  const def = paletteIndex > 0 ? getFighterById(fighterId) : null;
  const palette = def?.palettes[paletteIndex];
  ctx.clearRect(0, 0, w, h);
  if (palette && w > 0 && h > 0) {
    const key = `${fighterId}:${paletteIndex}:${w}x${h}`;
    if (!costumes.has(key)) {
      const art = document.createElement('canvas');
      art.width = w; art.height = h;
      const paint = art.getContext('2d', { willReadFrequently: true });
      paint.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      paintCostume(paint, w, h, def, palette);
      costumes.set(key, art);
    }
    ctx.drawImage(costumes.get(key), 0, 0);
  } else {
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  }
  return true;
}
