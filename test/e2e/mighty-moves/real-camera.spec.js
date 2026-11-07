// Everywhere else the camera is replaced by a canvas. This goes through the browser's real
// getUserMedia, with Chrome's built-in test camera, to prove that path works for the body tracker.
import { expect, test, waitForScreen } from '../helpers.js';
import { toChoosing } from './helpers.js';

test.use({
  launchOptions: {
    args: [
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
});

test('the real camera path opens the camera and runs the body tracker', async ({ page }) => {
  await page.goto('/games/mighty-moves/index.html?debug');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
  await toChoosing(page);
  await page.locator('#fight-start').click();
  await waitForScreen(page, 'bodycheck');

  const video = page.locator('#camera');
  await expect.poll(() => video.evaluate((el) => el.videoWidth)).toBeGreaterThan(0);
  expect(await video.evaluate((el) => el.paused)).toBe(false);
  // The test camera shows no person, so the tracker must be answering and finding nobody.
  await expect(page.locator('#prompt')).toContainText('Stand where I can see all of you');
  const answering = await page.evaluate(async () => {
    const { camera } = window.__game;
    const before = camera.lastResultAt;
    await new Promise((resolve) => setTimeout(resolve, 800));
    return camera.lastResultAt > before;
  });
  expect(answering).toBe(true);
});
