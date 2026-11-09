// Children's camera pictures, and what happens when the camera or computer lets things down.
import { expect, shot, test, waitForScreen } from '../helpers.js';
import { doWhatIsAsked, footage, openMoves, reachFight, standInView, stopDoingIt, toChoosing } from './helpers.js';

test('the game makes no requests off this computer, and the page refuses to', async ({ page, baseURL, pageErrors }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await reachFight(page);
  await footage(page, 'strikes', { from: 1 });
  await page.waitForTimeout(1500);

  const offsite = requests.filter((url) => !url.startsWith(baseURL) && !url.startsWith('data:') && !url.startsWith('blob:'));
  expect(offsite).toEqual([]);

  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/upload', { method: 'POST', body: 'picture' });
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  await expect.poll(() => pageErrors.join('\n')).toContain("violates the following Content Security Policy directive: \"connect-src 'self' wss://hemi-race.infoicy.com ws://localhost:*\"");
  pageErrors.length = 0;
});

test('a camera that isn\'t allowed explains itself and can be tried again', async ({ page }) => {
  await openMoves(page);
  await standInView(page);
  await page.evaluate(() => {
    window.__camera.failWith = 'NotAllowedError';
  });
  await toChoosing(page);
  await page.locator('#fight-start').click();
  await waitForScreen(page, 'problem');
  await expect(page.locator('#problem-title')).toHaveText('Can we use your camera?');
  await shot(page, 'm18-camera-denied');
  await page.evaluate(() => {
    window.__camera.failWith = null;
  });
  await page.locator('#problem-retry').click();
  await waitForScreen(page, 'bodycheck');
});

test('a frozen tracker counts as nobody there, rather than leaving the fight running', async ({ page }) => {
  await reachFight(page);
  await page.evaluate(() => {
    window.__game.camera.onResult = () => {};
    window.__game.camera.sendFrame = async () => {};
  });
  await expect(page.locator('#prompt')).toContainText('Come back where I can see you', { timeout: 15_000 });
});

test('with reduced motion there is no shaking, and the fight still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachFight(page);
  // The film of what to do is the instruction, so it still plays, only more slowly.
  await expect(page.locator('#coach-demo')).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => window.__game.game.demo.speed)).toBeLessThan(1);
  await doWhatIsAsked(page);
  await expect.poll(() => page.evaluate(() => window.__game.fight.stats.damage), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__game.arena.shake)).toBe(0);
  await stopDoingIt(page);
});

test('nothing flashes: the picture\'s brightness stays steady through a big hit', async ({ page }) => {
  await reachFight(page);
  await doWhatIsAsked(page);
  // The canvas is read back at intervals through a big move, and its overall brightness compared.
  const brightness = await page.evaluate(async () => {
    const { arena } = window.__game;
    const reading = [];
    const small = document.createElement('canvas');
    small.width = 32;
    small.height = 18;
    const context = small.getContext('2d', { willReadFrequently: true });
    for (let i = 0; i < 40; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      arena.render();
      context.drawImage(arena.canvas, 0, 0, 32, 18);
      const { data } = context.getImageData(0, 0, 32, 18);
      let total = 0;
      for (let j = 0; j < data.length; j += 4) total += (data[j] + data[j + 1] + data[j + 2]) / 3;
      reading.push(total / (32 * 18));
    }
    return reading;
  });
  await stopDoingIt(page);
  const biggestStep = Math.max(...brightness.slice(1).map((value, index) => Math.abs(value - brightness[index])));
  console.log('biggest brightness step', biggestStep);
  // The usual measure of a flash starts at about 10% of full brightness, so 25 out of 255.
  expect(biggestStep).toBeLessThan(25);
});

test('a slow computer gives up sharpness and then shadows, and keeps playing', async ({ page }) => {
  await reachFight(page);
  const levels = await page.evaluate(() => {
    const { arena } = window.__game;
    // Starting from a known point, as a busy test computer may already have dropped a level.
    arena.quality = 2;
    arena.renderer.shadowMap.enabled = true;
    arena.frames = 0;
    arena.slowFrames = 0;
    const slowFor = () => {
      for (let i = 0; i < 90; i += 1) arena.watchSpeed(0.05);
    };
    slowFor();
    const first = [arena.quality, arena.renderer.getPixelRatio(), arena.renderer.shadowMap.enabled];
    slowFor();
    return [first, [arena.quality, arena.renderer.getPixelRatio(), arena.renderer.shadowMap.enabled]];
  });
  expect(levels).toEqual([[1, 1, true], [0, 1, false]]);
  await page.waitForTimeout(300);
  await shot(page, 'm19-low-quality');
  expect(await page.evaluate(() => window.__game.screen)).toBe('fight');
});

test('the choosing screen fits smaller screens, with everything reachable', async ({ page }) => {
  for (const [width, height] of [[1024, 600], [820, 1180], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/games/mighty-moves/index.html?debug');
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
    await toChoosing(page);
    await page.waitForTimeout(200);
    await shot(page, `m20-choose-${width}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, `${width}`).toBeLessThanOrEqual(0);
    for (const target of ['#fight-start', '.fighter-card[data-fighter="tur"]', '#next-opponent']) {
      await page.locator(target).scrollIntoViewIfNeeded();
      await expect(page.locator(target), `${target} at ${width}`).toBeInViewport();
    }
  }
});
