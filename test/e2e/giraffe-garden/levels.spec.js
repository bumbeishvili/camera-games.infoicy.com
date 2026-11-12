// Giraffe's Garden's ten levels: what each brings is on the title card and under the countdown, each new thing comes
// along and works in the real game, and nothing flashes, at level 1 or at level 10 with all of it about.
import { openGame, shot } from '../helpers.js';
import { BACK, expect, expectSoon, FIST, GAME, judge, PALM, show, startPlaying, state, stopHand, test, waitForScreen, watchBrightness, waterHand } from './helpers.js';

const NEW_AT = {
  2: ['Bees and honey'],
  3: ['A hungry snail'],
  4: ['The sprinkler'],
  5: ['A sunflower'],
  6: ['A thirsty hedgehog'],
  7: ['A peekaboo bunny'],
  8: ['Hanging baskets'],
  9: ['A rain cloud'],
  10: ['The magic bean'],
};
const atLevel = (level, more = {}) => ({ levels: { [GAME]: level }, plants: 4, ...more });
const labelShown = (page, key) => page.evaluate((wanted) => window.__game.view.introduced.has(wanted), key);

test('the title card says what each level brings, and level 1 is the plain garden', async ({ page }) => {
  await openGame(page, {}, GAME);
  await expect(page.locator('#level-badge')).toHaveText('Level 1 of 10');
  await expect(page.locator('#level-new')).toBeEmpty();
  for (const [level, names] of Object.entries(NEW_AT)) {
    await page.locator('#open-panel').click();
    await page.locator('#level-choice label', { hasText: new RegExp(`^\\s*${level}\\s*$`) }).click();
    await page.locator('#close-panel').click();
    await expect(page.locator('#level-badge')).toHaveText(`Level ${level} of 10`);
    for (const name of names) await expect(page.locator('#level-new')).toContainText(name);
  }
  await shot(page, 'garden-title-level-10');
});

test('under the countdown it says what\'s new, in Georgian too', async ({ page }) => {
  await openGame(page, { language: 'ka', ...atLevel(6) }, GAME);
  await show(page, ...PALM);
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('მწყურვალი ზღარბი');
  await expect(page.locator('#level-now')).toHaveText('დონე 6');
  await waitForScreen(page, 'playing');
  await expect(page.locator('#story-line')).toHaveText(/[Ⴀ-ჿ]/);
});

test('level 2: a bee comes to the first flower, and takes its honey up to the prizes', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(2));
  await expect(page.locator('#chip-prizes-box')).toBeVisible();
  await waterHand(page);
  await expectSoon(async () => (await state(page)).flowers).toBe(1);
  // Resting now, so this flower's bee is the only one.
  await stopHand(page);
  await show(page, ...FIST);
  expect((await state(page)).flowers).toBe(1);
  await expectSoon(() => page.evaluate(() => window.__game.view.bees.length), { timeout: 5000 }).toBe(1);
  await page.waitForTimeout(700);
  await shot(page, 'garden-bee');
  await expect(page.locator('#chip-prizes')).toHaveText('1', { timeout: 8000 });
  expect((await state(page)).prizes.honey).toBe(1);
  expect(await labelShown(page, 'bee')).toBe(true);
});

test('level 3: a snail munching a plant keeps it from growing, until the water sends it sliding off', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(3));
  expect((await state(page)).snails).toHaveLength(1);
  await expectSoon(() => labelShown(page, 'snail'), { timeout: 8000 }).toBe(true);
  await waterHand(page, { target: '(garden) => { const snail = garden.snails.find((each) => !each.off); return snail ? garden.aimFor(snail.plant) : null; }' });
  await expectSoon(async () => (await state(page)).snails[0].off).toBe(true);
  await page.waitForTimeout(500);
  await shot(page, 'garden-snail');
  // And now its plant grows.
  await waterHand(page, { target: '(garden) => { const plant = garden.snails[0].plant; return plant.bloomed ? null : garden.aimFor(plant); }' });
  await expectSoon(() => page.evaluate(() => window.__game.garden.snails[0].plant.bloomed)).toBe(true);
  await stopHand(page);
});

test('level 4: the can touching the sprinkler takes it, and then it waters a wide patch, running down only while it pours', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(4));
  await waterHand(page, { by: 'can', target: '(garden) => garden.sprinkler.taken ? null : { x: garden.sprinkler.x, y: garden.sprinkler.y }' });
  await expectSoon(async () => (await state(page)).sprinkler.taken).toBe(true);
  // Resting with it, it waits.
  await stopHand(page);
  await show(page, ...FIST);
  await page.waitForTimeout(1500);
  expect((await state(page)).sprinkler.left).toBe(8);
  await waterHand(page);
  await expectSoon(async () => (await state(page)).sprinkler.left, { timeout: 30_000 }).toBeLessThan(7);
  expect((await state(page)).splash?.wide ?? 0.09).toBeGreaterThan(0.05);
  await page.waitForTimeout(300);
  await shot(page, 'garden-sprinkler');
  await stopHand(page);
});

test('level 5: a sunflower needs more water, and grows up tall', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(5));
  await waterHand(page, { target: '(garden) => { const sun = garden.plants.find((plant) => plant.look === "sunflower"); return sun.bloomed ? null : garden.aimFor(sun); }' });
  await expectSoon(() => page.evaluate(() => window.__game.garden.plants.find((plant) => plant.look === 'sunflower').bloomed), { timeout: 60_000 }).toBe(true);
  const tall = await page.evaluate(() => {
    const { garden } = window.__game;
    return garden.heightOf(garden.plants.find((plant) => plant.look === 'sunflower'));
  });
  expect(tall).toBeGreaterThan(0.3);
  await page.waitForTimeout(700);
  await shot(page, 'garden-sunflower');
  await stopHand(page);
});

test('level 6: filling the hedgehog\'s bowl, it drinks and leaves an apple', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(6));
  await waterHand(page, { target: '(garden) => garden.hedgehog.drank ? null : { x: garden.hedgehog.x, y: 0.72 }' });
  await expectSoon(async () => (await state(page)).hedgehog.drank).toBe(true);
  expect((await state(page)).prizes.apple).toBe(1);
  await page.waitForTimeout(500);
  await shot(page, 'garden-hedgehog');
  await stopHand(page);
});

test('level 7: the bunny pops up from its hole, and a splash makes it giggle and give a carrot', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(7));
  await page.evaluate(() => {
    window.__game.garden.bunny.timer = 0;
  });
  await expectSoon(async () => (await state(page)).bunny.up, { timeout: 5000 }).toBe(true);
  await page.waitForTimeout(400);
  await shot(page, 'garden-bunny');
  await waterHand(page, { target: '(garden) => garden.bunny.up ? { x: garden.bunny.x, y: 0.7 } : null', gain: 0.2 });
  await expectSoon(async () => (await state(page)).prizes.carrot, { timeout: 20_000 }).toBe(1);
  await stopHand(page);
});

test('level 8: a plant up in a hanging basket is watered from a can reached up above it', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(8));
  const baskets = (await state(page)).plants.filter((plant) => plant.hanging);
  expect(baskets).toHaveLength(2);
  await waterHand(page, { target: '(garden) => { const basket = garden.plants.find((plant) => plant.hanging && !plant.bloomed); return basket ? garden.aimFor(basket) : null; }' });
  await expectSoon(async () => (await state(page)).plants.filter((plant) => plant.hanging && plant.bloomed).length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(500);
  await shot(page, 'garden-baskets');
  await stopHand(page);
});

test('level 9: the can touching the rain cloud sets it raining across the garden, with the hand at rest', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(9));
  await waterHand(page, { by: 'can', target: '(garden) => garden.cloud.state === "waiting" ? { x: garden.cloud.x, y: garden.cloud.y } : null' });
  await expectSoon(async () => (await state(page)).cloud.state).toBe('raining');
  await stopHand(page);
  await show(page, ...FIST);
  const before = (await state(page)).plants.reduce((sum, plant) => sum + plant.water, 0);
  await page.waitForTimeout(1500);
  await shot(page, 'garden-cloud');
  await expectSoon(async () => (await state(page)).plants.reduce((sum, plant) => sum + plant.water, 0), { timeout: 10_000 }).toBeGreaterThan(before + 0.3);
  await expectSoon(async () => (await state(page)).cloud.state, { timeout: 15_000 }).toBe('gone');
});

test('level 10: the magic bean grows up into the sky, with a golden egg at the top', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(10));
  await waterHand(page, { target: '(garden) => { const bean = garden.plants.find((plant) => plant.look === "bean"); return bean.bloomed ? null : garden.aimFor(bean); }' });
  await expectSoon(async () => (await state(page)).prizes.egg, { timeout: 90_000 }).toBe(1);
  await page.waitForTimeout(400);
  await shot(page, 'garden-bean');
  await stopHand(page);
});

for (const level of [1, 10]) {
  test(`nothing flashes at level ${level}: pouring, growing and flowering, the brightness stays steady`, async ({ page }) => {
    test.setTimeout(180_000);
    await startPlaying(page, atLevel(level, { plants: 6 }));
    await waterHand(page);
    await expectSoon(async () => (await state(page)).flow, { timeout: 20_000 }).toBeGreaterThan(0.5);
    const reading = judge(await watchBrightness(page, 360));
    console.log(`level ${level} watering`, JSON.stringify(reading));
    expect(reading.biggestStep).toBeLessThan(4);
    expect(reading.flickeringShare).toBeLessThan(0.01);
    expect((await state(page)).flowers + (await state(page)).plants.filter((plant) => plant.water > 0).length).toBeGreaterThan(0);
    await stopHand(page);
  });
}

test('turned only a little, with a little wanted, it pours, and with right over wanted, it only trickles or doesn\'t', async ({ page }) => {
  test.setTimeout(150_000);
  // Turned part of the way: the palm 80% as wide reads as about 35°, a little.
  await startPlaying(page, { plants: 4, turn: 'little' });
  await expectSoon(async () => (await state(page)).holding, { timeout: 10_000 }).toBe(true);
  await page.evaluate(() => window.__camera.show({ left: null, right: 'palm', scale: 0.62, squeeze: 0.75 }));
  await expectSoon(async () => (await state(page)).flow, { timeout: 10_000 }).toBeGreaterThan(0.5);
  await page.locator('#open-panel').click();
  await page.locator('input[name="turn"][value="over"]').check();
  await page.locator('#close-panel').click();
  await expectSoon(async () => (await state(page)).flow, { timeout: 10_000 }).toBe(0);
  // Right over, it pours again.
  await show(page, ...BACK);
  await expectSoon(async () => (await state(page)).flow, { timeout: 10_000 }).toBe(1);
});
