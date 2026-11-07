// Getting into the games with a mission, with real photos going through the real tracker.
import { expect, openGame, show, waitForScreen } from '../helpers.js';

export async function startPlaying(page, game, settings = {}, scene = [null, 'open', { scale: 0.7 }]) {
  await openGame(page, settings, game);
  await show(page, ...scene);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

/** Moves the hand's picture until the glove on screen is at a place, given in shares of the screen. */
export async function moveGloveTo(page, gloveOf, shareX, shareY, scene = {}) {
  await page.evaluate(({ glovePath, x, y, extra }) => {
    window.__move?.stop();
    const glove = () => glovePath.reduce((at, key) => at[key], window.__game);
    let offsetX = window.__move?.offsetX ?? 0;
    let offsetY = window.__move?.offsetY ?? 0;
    const timer = setInterval(() => {
      const on = glove();
      if (on.visible) {
        // The camera's picture is 1280 wide, and the glove's screen is what the mirror shows.
        offsetX += ((x * innerWidth - on.x) / innerWidth) * 200;
        offsetY += ((y * innerHeight - on.y) / innerHeight) * 150;
      }
      window.__camera.show({ left: null, right: 'open', scale: 0.7, ...extra, rightOffsetX: offsetX, rightOffsetY: offsetY });
      window.__move.offsetX = offsetX;
      window.__move.offsetY = offsetY;
    }, 60);
    window.__move = { offsetX, offsetY, stop: () => clearInterval(timer) };
  }, { glovePath: gloveOf, x: shareX, y: shareY, extra: scene });
}

export const stopMoving = (page) => page.evaluate(() => window.__move?.stop());

export async function storyIs(page, who) {
  await expect(page.locator('#story')).toHaveAttribute('data-who', who, { timeout: 30_000 });
}
