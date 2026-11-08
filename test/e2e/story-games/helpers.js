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

/**
 * Reads how bright each part of the picture is, frame by frame, as the child sees it: each of the
 * game's canvases, one over the other. Runs while the game carries on.
 */
export const watchBrightness = (page, frames, canvases = ['game']) => page.evaluate(async ({ count, ids }) => {
  const [wide, high] = [32, 18];
  const small = document.createElement('canvas');
  small.width = wide;
  small.height = high;
  const context = small.getContext('2d', { willReadFrequently: true });
  const reading = [];
  for (let i = 0; i < count; i += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    context.fillStyle = '#000';
    context.fillRect(0, 0, wide, high);
    for (const id of ids) {
      const canvas = document.getElementById(id);
      // A 3D picture is only there to read straight after it's drawn, so it's drawn again first.
      const three = window.__game.joze;
      if (three?.canvas === canvas && three.playing) three.renderer.render(three.scene, three.camera);
      const box = canvas.getBoundingClientRect();
      context.drawImage(canvas, (box.left / innerWidth) * wide, (box.top / innerHeight) * high, (box.width / innerWidth) * wide, (box.height / innerHeight) * high);
    }
    const { data } = context.getImageData(0, 0, wide, high);
    const cells = new Array(wide * high);
    for (let j = 0; j < cells.length; j += 1) cells[j] = (data[j * 4] + data[j * 4 + 1] + data[j * 4 + 2]) / 3;
    reading.push({ at: performance.now(), cells });
  }
  return reading;
}, { count: frames, ids: canvases });

/** The biggest change of the whole picture between frames, and how much of it is flickering. */
export function judgeBrightness(reading) {
  const averages = reading.map(({ cells }) => cells.reduce((sum, value) => sum + value, 0) / cells.length);
  const biggestStep = Math.max(...averages.slice(1).map((value, index) => Math.abs(value - averages[index])));
  const seconds = (reading.at(-1).at - reading[0].at) / 1000;
  // A flash is a big rise and a big fall in one part of the picture. More than 3 a second, over a big
  // part of the picture, is what can set off a seizure.
  const SWING = 40; // Out of 255.
  const cellCount = reading[0].cells.length;
  let flickering = 0;
  for (let cell = 0; cell < cellCount; cell += 1) {
    let low = reading[0].cells[cell];
    let high = low;
    let going = 0;
    let swings = 0;
    for (const { cells } of reading) {
      const value = cells[cell];
      low = Math.min(low, value);
      high = Math.max(high, value);
      if (going >= 0 && high - value >= SWING) {
        swings += 1;
        going = -1;
        low = value;
        high = value;
      } else if (going <= 0 && value - low >= SWING) {
        swings += 1;
        going = 1;
        low = value;
        high = value;
      }
    }
    if (swings / 2 / seconds > 3) flickering += 1;
  }
  return { biggestStep, flickeringShare: flickering / cellCount, seconds, frames: reading.length };
}

/** Opens a game at a level, which is remembered for each game by its folder's name. */
export const atLevel = (game, level, settings = {}) => ({ ...settings, levels: { [game]: level } });
