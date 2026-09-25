#!/usr/bin/env node
// Render frames of a riso scene headlessly.
//
//   node scripts/render.mjs scenes/train-journey.html                 # poster frame → out/<name>/poster.png
//   node scripts/render.mjs scenes/train-journey.html --frames 0,240,600
//   node scripts/render.mjs scenes/train-journey.html --poster 300 --jpg      # smaller files
//   node scripts/render.mjs scenes/train-journey.html --seconds 48    # full sequence of PNGs
//   node scripts/render.mjs scenes/train-journey.html --seconds 48 --mp4  (needs ffmpeg on PATH)
//
// Frames are deterministic: the page is loaded with ?frame=N and riso.js renders exactly that frame.
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && a.endsWith('.html'));
if (!file) {
  console.error('usage: node scripts/render.mjs <scene.html> [--frames 0,24,48] [--seconds N] [--fps 24] [--scale 1] [--poster N] [--jpg] [--mp4] [--out dir]');
  process.exit(1);
}
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i === -1 ? def : args[i + 1] === undefined || args[i + 1].startsWith('--') ? true : args[i + 1];
};

const fps = +opt('fps', 24);
const scale = +opt('scale', 1);
const jpg = opt('jpg', false);
const ext = jpg ? 'jpg' : 'png';
const name = basename(file, '.html');
const outDir = resolve(opt('out', join('out', name)));
mkdirSync(outDir, { recursive: true });

let frames;
if (opt('seconds', null)) frames = [...Array(Math.round(+opt('seconds') * fps)).keys()];
else if (opt('frames', null)) frames = String(opt('frames')).split(',').map(Number);
else frames = [+opt('poster', 72)];
const sequence = frames.length > 1 && opt('seconds', null);

const launch = {};
if (existsSync('/opt/pw-browsers/chromium')) launch.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launch).catch(() => chromium.launch());
const page = await browser.newPage({ deviceScaleFactor: scale, viewport: { width: 2400, height: 2400 } });
page.on('pageerror', (e) => console.error('[page error]', e.message));

const url = pathToFileURL(resolve(file)).href;
for (const [n, f] of frames.entries()) {
  await page.goto(`${url}?frame=${f}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  const out = join(outDir, sequence ? `frame-${String(n).padStart(5, '0')}.${ext}` : frames.length > 1 ? `frame-${f}.${ext}` : `poster.${ext}`);
  await page.locator('canvas').screenshot({ path: out, ...(jpg ? { type: 'jpeg', quality: 88 } : {}) });
  if (!sequence || n % fps === 0) process.stdout.write(`\r${out}${sequence ? `  (${n + 1}/${frames.length})` : '\n'}`);
}
await browser.close();
if (sequence) process.stdout.write('\n');

if (opt('mp4', false)) {
  const mp4 = join(outDir, `${name}.mp4`);
  const r = spawnSync('ffmpeg', ['-y', '-framerate', String(fps), '-i', join(outDir, `frame-%05d.${ext}`),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', mp4], { stdio: 'inherit' });
  if (r.error) console.error('ffmpeg not found — PNG frames are in', outDir);
  else console.log('wrote', mp4);
}
