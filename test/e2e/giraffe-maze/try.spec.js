// A first look, while building: not one of the game's tests.
import { expect, openGame, shot, test, waitForScreen } from '../helpers.js';
import { expectSoon, GAME, leadHand, startPlaying, state, stopHand } from './helpers.js';

test('a first look at level 10', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page, { levels: { [GAME]: 10 }, mazeSize: 'medium' });
  await page.waitForTimeout(1200);
  await shot(page, 'maze-try10-start');
  console.log(JSON.stringify((await state(page)).items.map((i) => i.kind)), JSON.stringify((await state(page)).blockers));
  await leadHand(page);
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(5000);
    await shot(page, `maze-try10-${i}`);
    const now = await state(page);
    console.log(i, now.index, now.found, JSON.stringify(now.blockers.map((b) => [b.kind, b.open, b.progress.toFixed(2)])), now.hasKey, now.power?.kind, now.stuck);
  }
  await stopHand(page);
});
