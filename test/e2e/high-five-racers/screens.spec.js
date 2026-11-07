// Layout on other screen sizes, and the fallback for slower computers.
import {
  car,
  expect,
  openGame,
  reachRace,
  shot,
  show,
  test,
  waitForHand,
  waitUntilMoving,
  waitUntilStopped,
} from '../helpers.js';

/** Nothing on screen may stick out past the window. */
async function expectNothingCutOff(page) {
  const cutOff = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };
    return [...document.querySelectorAll('.prompt, .camera-frame, .meter, .wheel, .chip, .gear, .turbo, .race-order, .five-film')]
      .filter(visible)
      .filter((element) => {
        const box = element.getBoundingClientRect();
        // Meters breathe a little when closed, so allow them a few pixels.
        return box.left < -8 || box.top < -8 || box.right > innerWidth + 8 || box.bottom > innerHeight + 8;
      })
      .map((element) => element.className || element.id);
  });
  expect(cutOff).toEqual([]);
}

/** The chips and the camera's picture both have to be seen. */
async function expectChipsClearOfCamera(page) {
  const overlapping = await page.evaluate(() => {
    const frame = document.querySelector('.camera-frame').getBoundingClientRect();
    return [...document.querySelectorAll('.chip')].filter((chip) => {
      const box = chip.getBoundingClientRect();
      return box.left < frame.right && box.right > frame.left && box.top < frame.bottom && box.bottom > frame.top;
    }).length;
  });
  expect(overlapping).toBe(0);
}

const SCREENS = [
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'laptop-large', width: 1920, height: 1080 },
];

for (const { name, width, height } of SCREENS) {
  test(`fits a ${name} screen`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openGame(page);
    await page.waitForTimeout(400);
    await shot(page, `70-${name}-welcome`);

    await show(page, null, 'open');
    await page.locator('#start').click();
    await expect(page.locator('#prompt')).toHaveText(/Open your hand as wide as you can!/, { timeout: 30_000 });
    await expectNothingCutOff(page);
    await shot(page, `71-${name}-check`);

    await expect(page.locator('#chip-place')).toBeVisible({ timeout: 30_000 });
    await waitForHand(page, 'open');
    await waitUntilMoving(page);
    await show(page, null, 'fist');
    await waitForHand(page, 'closed');
    await waitUntilStopped(page);
    await expect(page.locator('#prompt')).toHaveText(/Open your right hand!/);
    await expectNothingCutOff(page);
    await expectChipsClearOfCamera(page);
    await shot(page, `72-${name}-race`);
  });
}

test('with reduced motion the camera stops zooming and there is no confetti', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page, { laps: 1, steering: 'auto' });
  await show(page, null, 'open');
  await reachRace(page);
  await waitUntilMoving(page);
  const fieldOfView = () => page.evaluate(() => window.__game.race.camera.fov);
  const before = await fieldOfView();
  await page.waitForTimeout(1500);
  expect(await fieldOfView()).toBe(before);
  // Animations that only exist to catch the eye are off.
  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  const breathing = await page.locator('#meter-right').evaluate((el) => getComputedStyle(el).animationName);
  expect(breathing).toBe('none');
});

test('a slow computer drops sharpness and then shadows, and keeps playing', async ({ page }) => {
  await openGame(page);
  await show(page, null, 'open');
  await reachRace(page);
  await waitUntilMoving(page);

  const levels = await page.evaluate(() => {
    const { race } = window.__game;
    const slowFor = () => {
      race.quality.frames = 40;
      race.quality.seconds = 4;
      race.watchFrameRate(0);
    };
    slowFor();
    const first = [race.quality.level, race.renderer.getPixelRatio(), race.renderer.shadowMap.enabled];
    slowFor();
    return [first, [race.quality.level, race.renderer.getPixelRatio(), race.renderer.shadowMap.enabled]];
  });
  expect(levels).toEqual([[1, 1, true], [2, 1, false]]);

  const { distance } = await car(page);
  await expect.poll(async () => (await car(page)).distance).toBeGreaterThan(distance + 10);
  await shot(page, '73-low-quality');
});
