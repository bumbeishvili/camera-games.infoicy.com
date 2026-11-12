// How Giraffe's Garden looks on a big, sharp screen: Giraffe drawn at least as big as he's shown, so he's never
// blurred, looking over his bush by the fence, and the can held and then tipped right over.
import { shot } from '../helpers.js';
import { BACK, expect, expectSoon, show, startPlaying, state, test } from './helpers.js';

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

test('on a big sharp screen Giraffe is drawn as big as he\'s shown, so he\'s sharp, and he looks over his bush', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, { plants: 6 });
  const sizes = await page.evaluate(() => {
    const { view } = window.__game;
    // His body is shown 0.29 of the screen's height tall (GIRAFFE in view.js), in the screen's own pixels.
    return { drawn: view.giraffe.tall, shown: view.height * 0.29 * view.ratio, frames: Object.keys(view.giraffe.frames) };
  });
  expect(sizes.frames).toEqual(['stand', 'cheer', 'wave']);
  expect(sizes.drawn).toBeGreaterThanOrEqual(sizes.shown * 0.99);
  await expectSoon(async () => (await state(page)).holding, { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(800);
  await shot(page, 'garden-big-screen');
  await show(page, ...BACK);
  await expectSoon(async () => (await state(page)).tip, { timeout: 10_000 }).toBeGreaterThan(0.95);
  await page.waitForTimeout(500);
  await shot(page, 'garden-big-screen-over');
});
