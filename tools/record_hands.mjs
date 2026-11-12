// Records what the real hand tracker reports for photos of hands, for the unit tests: test/fixtures/photo-hands.json
// keeps it for each photo, as test/unit/photo-hands.js reads it. A photo can be squeezed across, as a hand turned
// part of the way to side-on looks narrower: palm-60 is the palm photo at 60% of its width. Each photo is shown to
// the tracker the game uses, on its own, for a few frames, as a camera would show it. Run it with the server going:
//
//   npm start                     (in another terminal)
//   node tools/record_hands.mjs palm=test/fixtures/photos/palm.jpg palm-60=test/fixtures/photos/palm.jpg@0.6
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SITE = `http://localhost:${process.env.PORT ?? 8642}`;
const OUT = resolve(ROOT, 'test/fixtures/photo-hands.json');
const wanted = process.argv.slice(2).map((arg) => {
  const [name, rest] = arg.split('=');
  const [file, squeeze = '1'] = rest.split('@');
  return { name, file: resolve(file), squeeze: Number(squeeze) };
});
if (!wanted.length) throw new Error('Name the photos to record, as name=file or name=file@squeeze');

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (error) => console.error('page error', error.message));
const files = new Map(wanted.map(({ file }) => [basename(file), file]));
await page.route('**/recorder-photo/**', (route) => {
  const name = decodeURIComponent(route.request().url().split('/').pop());
  route.fulfill({ body: readFileSync(files.get(name)), contentType: 'image/jpeg' });
});
// A plain file, because the games' own pages have a security policy that blocks this recorder.
await page.goto(`${SITE}/package.json`);
await page.evaluate(async () => {
  window.tracker = new Worker('/core/tracker.worker.js', { type: 'module' });
  await new Promise((resolve, reject) => {
    window.tracker.onmessage = ({ data }) => (data.type === 'ready' ? resolve() : reject(new Error(data.message)));
    window.tracker.postMessage({ type: 'init' });
  });
});

const recorded = await page.evaluate(async (photos) => {
  const round = (value) => Math.round(value * 10000) / 10000;
  const point = ({ x, y, z }) => ({ x: round(x), y: round(y), z: round(z) });
  let clock = 0;
  const show = async (canvas) => {
    const bitmap = await createImageBitmap(canvas);
    clock += 33;
    return new Promise((resolve) => {
      window.tracker.onmessage = ({ data }) => resolve(data);
      window.tracker.postMessage({ type: 'frame', bitmap, timestamp: clock, width: canvas.width, height: canvas.height }, [bitmap]);
    });
  };
  const out = {};
  for (const { name, file, squeeze } of photos) {
    const image = new Image();
    image.src = `/recorder-photo/${encodeURIComponent(file)}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * squeeze);
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    // An empty picture first, so the tracker finds this hand afresh rather than following the last one.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 3; i += 1) await show(canvas);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    let result = null;
    for (let i = 0; i < 6; i += 1) result = await show(canvas);
    out[name] = {
      aspect: round(canvas.width / canvas.height),
      hands: result.hands.map((hand) => ({ score: round(hand.score), label: hand.label, image: hand.image.map(point), world: hand.world.map(point) })),
    };
  }
  return out;
}, wanted.map(({ name, file, squeeze }) => ({ name, file: basename(file), squeeze })));
await browser.close();

const all = JSON.parse(readFileSync(OUT, 'utf8'));
for (const [name, photo] of Object.entries(recorded)) {
  all[name] = photo;
  console.log(`${name}: ${photo.hands.length} hand${photo.hands.length === 1 ? '' : 's'}${photo.hands.map((hand) => `, ${hand.label} ${hand.score}`).join('')}`);
}
writeFileSync(OUT, JSON.stringify(all));
