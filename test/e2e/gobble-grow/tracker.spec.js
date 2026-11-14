// The real face tracker: core/face/face.worker.js, with MediaPipe's face model. There are no photos of faces in
// this folder, and none may be added, so all that's tested of it here is that it loads, runs on the camera's
// frames, falls back to the CPU when the GPU fails, and sees nobody in a room with nobody in it. How it reads a
// real mouth isn't tested here: the other tests give the game a stand-in for it (../fake-face.js).
import { fileURLToPath } from 'node:url';
import { expect, face, test, waitForScreen } from './helpers.js';

const fakeFace = fileURLToPath(new URL('../fake-face.js', import.meta.url));

/** The game with the drawn face for a camera, but the real tracker looking at it. */
async function openWithRealTracker(page, address = '/games/gobble-grow/index.html?debug') {
  await page.addInitScript({ path: fakeFace });
  await page.addInitScript(() => {
    delete window.__faceTracker;
    localStorage.setItem('camera-games-settings', JSON.stringify({ voice: false, sound: false }));
  });
  await page.goto(address);
  await expect(page.locator('#start')).toBeVisible();
}

test('the real face tracker loads and runs in the game, and a room with nobody in it is nobody', async ({ page }) => {
  test.setTimeout(240_000);
  const requests = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await openWithRealTracker(page);
  await page.evaluate(() => window.__face.showNobody());
  await page.locator('#start').click();
  await waitForScreen(page, 'check');
  expect(['GPU', 'CPU']).toContain(await page.evaluate(() => window.__game.camera.delegate));
  expect(requests).toContain('/core/face/face.worker.js');
  expect(requests).toContain('/vendor/mediapipe/face_landmarker.task');
  expect(requests).not.toContain('/test/e2e/fake-face.worker.js');

  // Frames keep being read and answered, and there's no face in any of them.
  const before = await page.evaluate(() => window.__game.camera.lastResultAt);
  await expect.poll(() => page.evaluate(() => window.__game.camera.lastResultAt), { timeout: 30_000 }).toBeGreaterThan(before + 1000);
  const empty = await page.evaluate(() => window.__game.monitor.snapshot);
  expect(empty.status).toBe('missing');
  expect(empty.mouthOpen).toBe(false);
  await expect(page.locator('#prompt-text')).toHaveText('Show me your face!');
  expect(await page.evaluate(() => window.__game.screen)).toBe('check');

  // A drawing of a face, with its mouth wide open, is read without a fuss, whatever the tracker makes of a drawing:
  // nobody, or a face. Either way it's one of the things a face can be, and nothing goes wrong.
  await face(page, { seen: true, size: 0.26, open: 0.4 });
  await page.waitForTimeout(3000);
  const drawn = await page.evaluate(() => {
    const { status, reason, openness, size, yaw, pitch } = window.__game.monitor.snapshot;
    return { status, reason, openness, size, yaw, pitch };
  });
  console.log('what the real tracker makes of the drawn face:', JSON.stringify(drawn));
  expect(['missing', 'closed', 'open']).toContain(drawn.status);
  const later = await page.evaluate(() => window.__game.camera.lastResultAt);
  await expect.poll(() => page.evaluate(() => window.__game.camera.lastResultAt), { timeout: 30_000 }).toBeGreaterThan(later + 500);
});

test('the face tracker falls back to the CPU when the GPU fails', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  await page.goto('/package.json');
  const answer = await page.evaluate(() => new Promise((resolve) => {
    const { origin } = location;
    // The first try fails in the way a real GPU problem would, after the engine has loaded.
    const wrapper = `
      import { FaceLandmarker } from '${origin}/vendor/mediapipe/vision_bundle.mjs';
      const real = FaceLandmarker.createFromOptions.bind(FaceLandmarker);
      FaceLandmarker.createFromOptions = (files, options) => (options.baseOptions.delegate === 'GPU'
        ? real(files, { ...options, baseOptions: { ...options.baseOptions, modelAssetPath: '${origin}/no-such-model.task' } })
        : real(files, options));
      await import('${origin}/core/face/face.worker.js');
      self.postMessage({ type: 'loaded' });`;
    const worker = new Worker(URL.createObjectURL(new Blob([wrapper], { type: 'text/javascript' })), { type: 'module' });
    worker.onerror = (event) => resolve({ type: 'crash', message: event.message });
    worker.onmessage = (message) => {
      if (message.data.type === 'loaded') worker.postMessage({ type: 'init' });
      else resolve(message.data);
    };
  }));
  expect(answer).toEqual({ type: 'ready', delegate: 'CPU' });
  // The first try failing is the point of this test, and it logs why.
  pageErrors.length = 0;
});

test('the tracker answers every frame it\'s sent, with no faces for a picture with none in it', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/package.json');
  const answers = await page.evaluate(async () => {
    const worker = new Worker('/core/face/face.worker.js', { type: 'module' });
    const next = () => new Promise((resolve) => {
      worker.onmessage = ({ data }) => resolve(data);
    });
    worker.postMessage({ type: 'init' });
    const ready = await next();
    const canvas = new OffscreenCanvas(960, 540);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#c9ccd1';
    ctx.fillRect(0, 0, 960, 540);
    const results = [];
    for (let frame = 0; frame < 3; frame += 1) {
      const bitmap = await createImageBitmap(canvas);
      worker.postMessage({ type: 'frame', bitmap, timestamp: performance.now(), width: 960, height: 540 }, [bitmap]);
      const { type, faces, aspect } = await next();
      results.push({ type, faces: faces.length, aspect });
    }
    return { ready: ready.type, results };
  });
  expect(answers.ready).toBe('ready');
  expect(answers.results).toEqual(Array.from({ length: 3 }, () => ({ type: 'result', faces: 0, aspect: 960 / 540 })));
});

test('the stand-in for the tracker is only taken when the page is opened for testing', async ({ page }) => {
  test.setTimeout(240_000);
  const requests = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  // The stand-in is on offer, but the page isn't opened with ?debug: the real tracker is what runs.
  await page.addInitScript({ path: fakeFace });
  await page.addInitScript(() => localStorage.setItem('camera-games-settings', JSON.stringify({ voice: false, sound: false })));
  await page.goto('/games/gobble-grow/index.html');
  await expect(page.locator('#start')).toBeVisible();
  expect(await page.evaluate(() => typeof window.__game)).toBe('undefined');
  await page.locator('#start').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'check', { timeout: 120_000 });
  expect(requests).toContain('/core/face/face.worker.js');
  expect(requests).not.toContain('/test/e2e/fake-face.worker.js');
});
