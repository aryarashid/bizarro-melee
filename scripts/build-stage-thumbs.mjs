/**
 * Captures studio-lit 3D WebGL preview thumbnails of all 29 VS stages using our
 * live Three.js renderer (`stagePreview: true`) and stitches them into a single
 * compact 6x5 JPEG atlas at web/assets/stages/stage_thumbs.jpg.
 *
 * Set PLAYWRIGHT_MODULE to a local playwright module path if not installed in node_modules.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean);
  for (const mod of candidates) {
    try {
      return require(mod);
    } catch {}
  }
  throw new Error('Playwright not found. Install `playwright` or set PLAYWRIGHT_MODULE=/path/to/playwright');
}

const { chromium } = loadPlaywright();

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WEB_DIR = fs.realpathSync(path.join(ROOT, 'web'));
const OUT_DIR = path.join(WEB_DIR, 'assets', 'stages');
const OUT_FILE = path.join(OUT_DIR, 'stage_thumbs.jpg');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0];
      const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
      const candidate = path.resolve(WEB_DIR, rel);
      if (candidate !== WEB_DIR && !candidate.startsWith(WEB_DIR + path.sep)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
        res.writeHead(404); res.end('Not found'); return;
      }
      const real = fs.realpathSync(candidate);
      if (!real.startsWith(WEB_DIR + path.sep)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      const ext = path.extname(real);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(real).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { server, port } = await startServer();
  const gpuArgs = process.platform === 'darwin'
    ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ headless: true, args: gpuArgs });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 180 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__BIZARRO_MELEE__), { timeout: 15000 });
    await page.waitForTimeout(700);

    await page.evaluate(() => {
      const ui = document.getElementById('ui-layer');
      if (ui) ui.style.display = 'none';
      const c2 = document.getElementById('game-canvas');
      if (c2) c2.style.display = 'none';
    });

    const stageIds = await page.evaluate(async () => {
      const mod = await import('./js/stages.js');
      return mod.STAGES.map((s) => s.id);
    });

    const dataUrls = [];
    for (const id of stageIds) {
      await page.evaluate((stageId) => {
        window.__BIZARRO_MELEE__.renderStagePreview(stageId);
      }, id);
      await page.waitForTimeout(35);
      const buf = await page.screenshot({ type: 'jpeg', quality: 88, animations: 'allow' });
      dataUrls.push(`data:image/jpeg;base64,${buf.toString('base64')}`);
    }

    const atlasBase64 = await page.evaluate(async (urls) => {
      const cols = 6, rows = 5, cw = 240, ch = 120;
      const canvas = document.createElement('canvas');
      canvas.width = cols * cw;
      canvas.height = rows * ch;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#090b1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < urls.length; i++) {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = urls[i]; });
        const col = i % cols;
        const row = Math.floor(i / cols);
        const srcAspect = img.width / img.height;
        const dstAspect = cw / ch;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (srcAspect > dstAspect) {
          sw = img.height * dstAspect;
          sx = (img.width - sw) * 0.5;
        } else {
          sh = img.width / dstAspect;
          sy = (img.height - sh) * 0.5;
        }
        ctx.drawImage(img, sx, sy, sw, sh, col * cw, row * ch, cw, ch);
      }
      return canvas.toDataURL('image/jpeg', 0.86).split(',')[1];
    }, dataUrls);

    fs.writeFileSync(OUT_FILE, Buffer.from(atlasBase64, 'base64'));
    const kb = Math.round(fs.statSync(OUT_FILE).size / 1024);
    console.log(`Generated 6x5 3D stage thumbnail atlas (${stageIds.length} stages, ${kb} KB): ${OUT_FILE}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
