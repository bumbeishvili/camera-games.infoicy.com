// How Arrow Meadow looks on a big, sharp screen: Giraffe drawn at least as big as he's shown, so he's never blurred,
// holding his bow, and the meadow with what each level brings, turned round for the left hand.
import { shot } from '../helpers.js';
import { archer, expect, expectSoon, hands, startPlaying, state, stopArcher, test } from './helpers.js';

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

test('on a big sharp screen Giraffe is drawn as big as he\'s shown, with his bow tilted and drawn as the hands have it', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page);
  const sizes = await page.evaluate(() => {
    const { view } = window.__game;
    // His body is shown 0.31 of the meadow's height tall (ARCHER in view.js), in the screen's own pixels.
    return { drawn: view.archer.body, shown: view.scale * 0.31 * view.ratio, frames: Object.keys(view.archer.frames) };
  });
  expect(sizes.frames).toEqual(['ready', 'glad']);
  expect(sizes.drawn).toBeGreaterThanOrEqual(sizes.shown * 0.99);
  // The string held, the bow tilted up and drawn right back: the dotted line shows the arc.
  await hands(page, { apart: 4, lift: 1.2 });
  await expectSoon(async () => (await state(page)).ready, { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(700);
  await shot(page, 'arrows-big-screen');
  expect((await state(page)).bow.draw).toBeGreaterThan(0.95);
});

for (const level of [1, 4, 6, 8, 10]) {
  test(`level ${level} on a big screen, being played`, async ({ page }) => {
    test.setTimeout(180_000);
    await startPlaying(page, { levels: { 'arrow-meadow': level }, arrowGoal: 6 });
    await archer(page, { every: 1.6 });
    await expectSoon(async () => (await state(page)).stats.hits, { timeout: 60_000 }).toBeGreaterThan(1);
    await page.waitForTimeout(1500);
    await shot(page, `arrows-level-${level}`);
    await stopArcher(page);
  });
}

test('with the left hand in play the meadow is turned round, with Giraffe on the left', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, { hands: 'left', levels: { 'arrow-meadow': 5 } }, { side: 'left' });
  expect((await state(page)).flip).toBe(false);
  await archer(page, { side: 'left', shoot: false });
  await expectSoon(async () => (await state(page)).ready, { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(1200);
  await shot(page, 'arrows-left-hand');
  await stopArcher(page);
});
