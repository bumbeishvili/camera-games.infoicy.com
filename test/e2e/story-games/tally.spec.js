// What's collected in the games with a mission, treasure, gifts and coins, flies up to its own count at the
// top. The count is still hidden as play begins, so where it is has to be looked up once it's shown.
import { expect, test } from '../helpers.js';
import { atLevel, startPlaying } from './helpers.js';

for (const [game, chip, scene] of [['lighthouse', 'chip-treasure', 'room'], ['giraffe-walk', 'chip-gifts', 'walk'], ['smoothie-stand', 'chip-coins', 'field']]) {
  test(`${game}: what's collected flies to its own count at the top`, async ({ page }) => {
    await startPlaying(page, game, atLevel(game, 2));
    const spot = await page.evaluate(([id, name]) => {
      const box = document.getElementById(id).getBoundingClientRect();
      const at = window.__game[name].tallyAt;
      return { width: box.width, dx: Math.abs(at.x - (box.left + box.width / 2)), dy: Math.abs(at.y - (box.top + box.height / 2)) };
    }, [chip, scene]);
    expect(spot.width).toBeGreaterThan(0);
    expect(spot.dx).toBeLessThan(1);
    expect(spot.dy).toBeLessThan(1);
  });
}
