/**
 * Stage Select 3D Thumbnail Atlas Loader & Architectural Preview Fallback.
 * Loads assets/stages/stage_thumbs.jpg (6 cols x 5 rows, 29 VS stages in STAGES order).
 */

import { STAGES } from './stages.js';

const COLS = 6;
const ROWS = 5;
const STAGE_INDEX = new Map(STAGES.map((st, idx) => [st.id, idx]));

let atlasImg = null;
let atlasLoaded = false;

export function preloadStageArt(onReady) {
  if (atlasImg) {
    if (atlasLoaded && onReady) onReady();
    return;
  }
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    atlasLoaded = true;
    if (onReady) onReady();
  };
  img.onerror = () => {
    atlasLoaded = false;
  };
  img.src = 'assets/stages/stage_thumbs.jpg';
  atlasImg = img;
}

export function drawStageThumb(canvas, stage) {
  if (!canvas || !stage) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const idx = STAGE_INDEX.get(stage.id);
  if (atlasLoaded && atlasImg && idx != null) {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const cellW = atlasImg.naturalWidth / COLS;
    const cellH = atlasImg.naturalHeight / ROWS;
    const padX = cellW * 0.01;
    const padY = cellH * 0.01;
    ctx.drawImage(
      atlasImg,
      col * cellW + padX,
      row * cellH + padY,
      cellW - padX * 2,
      cellH - padY * 2,
      0,
      0,
      w,
      h
    );
    return;
  }

  // Stylized architectural fallback preview using real stage geometry & palette
  const pal = stage.palette || {};
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, pal.skyTop || '#101630');
  grad.addColorStop(0.55, pal.skyMid || pal.skyTop || '#24305e');
  grad.addColorStop(1, pal.skyBottom || '#4a3568');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle horizon glow
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.65, 6, w * 0.5, h * 0.65, w * 0.55);
  glow.addColorStop(0, `${pal.accent || '#7ce8ff'}44`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Map stage coordinates into thumbnail box
  const scale = Math.min(w / 1400, h / 760);
  const cx = w * 0.5;
  const baseY = h * 0.7;

  // Solid decks
  for (const s of stage.solid || []) {
    const sx = cx + s.x * scale;
    const sy = baseY - s.y * scale;
    const sw = Math.max(8, s.w * scale);
    const sh = Math.max(8, Math.min(h - sy, s.h * scale));
    ctx.fillStyle = pal.deckBody || '#334155';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.fillStyle = pal.deckTop || '#cbd5e1';
    ctx.fillRect(sx, sy, sw, Math.max(3, sh * 0.24));
    ctx.fillStyle = pal.deckTrim || '#38f5ff';
    ctx.fillRect(sx, sy + Math.max(3, sh * 0.24), sw, 2);
  }

  // Soft platforms
  ctx.fillStyle = pal.platColor || '#ffffff';
  for (const p of stage.platforms || []) {
    const px = cx + p.x * scale;
    const py = baseY - p.y * scale;
    const pw = Math.max(10, p.w * scale);
    ctx.fillRect(px, py, pw, 4);
  }
}
