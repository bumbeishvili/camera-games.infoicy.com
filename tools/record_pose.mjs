// Records what the real pose model reports for a video, frame by frame, in the real browser.
// The numbers become test data in test/fixtures/pose/, so the move rules can be checked
// against real bodies without keeping the videos themselves.
//
//   node tools/record_pose.mjs <output folder> <fps> <video> [more videos]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const [outFolder, fps, ...videos] = process.argv.slice(2);
mkdirSync(outFolder, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (error) => console.error('page error', error.message));

await page.route('**/recorder-video/**', (route) => {
  const name = decodeURIComponent(route.request().url().split('/').pop());
  const path = videos.find((video) => basename(video) === name);
  route.fulfill({ body: readFileSync(path), contentType: 'video/webm' });
});
// A plain file, because the games' own pages have a security policy that blocks this recorder.
await page.goto(`http://localhost:${process.env.PORT ?? 8642}/package.json`);

// Runs the same worker the game does, so the numbers are what the game would see.
await page.evaluate(async () => {
  window.tracker = new Worker('/core/body/pose.worker.js', { type: 'module' });
  await new Promise((resolve, reject) => {
    window.tracker.onmessage = ({ data }) => (data.type === 'ready' ? resolve() : reject(new Error(data.message)));
    window.tracker.onerror = (event) => reject(new Error(event.message));
    window.tracker.postMessage({ type: 'init' });
  });
});

for (const video of videos) {
  const name = basename(video).replace(/\.[^.]+$/, '');
  const result = await page.evaluate(async ({ file, fps }) => {
    const round = (value) => Math.round(value * 10000) / 10000;
    const blob = await (await fetch(`/recorder-video/${encodeURIComponent(file)}`)).blob();
    const element = document.createElement('video');
    element.muted = true;
    element.src = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => {
      element.onloadeddata = resolve;
      element.onerror = () => reject(new Error(`cannot load ${file}`));
    });
    const canvas = document.createElement('canvas');
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    // Each video continues the clock, as the tracker needs time to keep moving forward.
    const clock = window.clock ?? 0;
    const frames = [];
    const total = Math.floor(element.duration * fps);
    const stills = [];
    for (let index = 0; index < total; index += 1) {
      const t = index / fps;
      await new Promise((resolve) => {
        element.onseeked = resolve;
        element.currentTime = t;
      });
      context.drawImage(element, 0, 0);
      // Pictures go in at the size the game sends, for any camera.
      const width = Math.min(960, canvas.width);
      const height = Math.round((width * canvas.height) / canvas.width);
      const bitmap = await createImageBitmap(canvas, { resizeWidth: width, resizeHeight: height, resizeQuality: 'medium' });
      const { body } = await new Promise((resolve, reject) => {
        window.tracker.onmessage = ({ data }) => (data.type === 'result' ? resolve(data) : reject(new Error(data.message)));
        window.tracker.postMessage({ type: 'frame', bitmap, timestamp: Math.round(clock + t * 1000), width, height }, [bitmap]);
      });
      const image = body?.image;
      frames.push(image
        ? {
            t: round(t),
            image: image.map(({ x, y, z, visibility }) => [round(x), round(y), round(z), round(visibility)]),
            world: body.world.map(({ x, y, z }) => [round(x), round(y), round(z)]),
          }
        : { t: round(t), image: null, world: null });
      // A picture every so often, with the skeleton on it, to see what the model made of it.
      if (index % Math.max(1, Math.floor(total / 8)) === 0 && stills.length < 8) {
        context.fillStyle = '#35e07a';
        for (const { x, y } of image ?? []) context.fillRect(x * canvas.width - 3, y * canvas.height - 3, 6, 6);
        const small = document.createElement('canvas');
        small.width = 240;
        small.height = Math.round((240 * canvas.height) / canvas.width);
        small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
        stills.push(small.toDataURL('image/jpeg', 0.75));
      }
    }
    window.clock = clock + element.duration * 1000 + 5000;
    URL.revokeObjectURL(element.src);
    return {
      fps,
      width: element.videoWidth,
      height: element.videoHeight,
      frames,
      stills,
    };
  }, { file: basename(video), fps: Number(fps) });

  const { stills, ...data } = result;
  writeFileSync(join(outFolder, `${name}.json`), JSON.stringify(data));
  stills.forEach((still, index) => {
    writeFileSync(join(outFolder, `${name}.${index}.jpg`), Buffer.from(still.split(',')[1], 'base64'));
  });
  const seen = data.frames.filter((frame) => frame.image).length;
  console.log(`${name}: ${data.width}x${data.height}, a body in ${seen} of ${data.frames.length} frames`);
}
await browser.close();
