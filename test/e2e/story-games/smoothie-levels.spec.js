// Joze's Smoothie Stand at level 10, with real photos going through the real tracker: rotten fruit from
// the first customer, fruit thrown across, rotten fruit beside what's wanted, tough fruit, and still
// the Golden Cup at the end, with nothing flashing.
import { expect, shot, test, waitForScreen } from '../helpers.js';
import { atLevel, judgeBrightness, startPlaying, storyIs, watchBrightness } from './helpers.js';

const GAME = 'smoothie-stand';
const stand = (page) => page.evaluate(() => {
  const { stand: rules, field } = window.__game;
  return { index: rules.index, rotten: rules.rotten, stats: { ...rules.stats }, sliced: field.sliced, inTheAir: field.fruit.length };
});

/** The hand going quickly from side to side, as a swipe does. */
const swiping = (page, on = true) => page.evaluate((go) => {
  clearInterval(window.__swipe);
  if (!go) return;
  let t = 0;
  window.__swipe = setInterval(() => {
    t += 0.06;
    window.__camera.show({ left: null, right: 'open', scale: 0.7, rightOffsetX: Math.sin(t * 7) * 220 });
  }, 60);
}, on);

/** Notes every throw from now on. */
const watchThrows = (page) => page.evaluate(() => {
  const { field } = window.__game;
  window.__throws = [];
  const real = field.throwFruit.bind(field);
  field.throwFruit = (kind, how = {}) => {
    window.__throws.push({ kind, ...how });
    return real(kind, how);
  };
});

const finishOrder = (page) => page.evaluate(() => {
  const { stand: rules } = window.__game;
  for (const kind of rules.wantedKinds) while (rules.left[kind] > 0) rules.slice(kind);
});

test('level 10: rotten fruit from the first customer, fruit thrown across, rotten beside wanted, and tough fruit', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'truffle');
  expect((await stand(page)).rotten).toBe(true);
  const pace = await page.evaluate(() => window.__game.field.pace);
  expect(pace.gravity).toBeCloseTo(0.38 * 1.3, 5);
  expect(pace.most).toBe(11);
  await watchThrows(page);
  // Through the first two customers, as everything comes along in its own time.
  await page.waitForTimeout(9000);
  await finishOrder(page);
  await storyIs(page, 'mochi');
  await page.waitForTimeout(9000);
  const throws = await page.evaluate(() => window.__throws);
  const count = (test) => throws.filter(test).length;
  console.log('throws', throws.length, 'rotten', count(({ kind }) => kind === 'rotten'), 'across', count(({ across }) => across), 'pairs', count(({ withRotten }) => withRotten), 'tough', count(({ tough }) => tough));
  expect(count(({ kind }) => kind === 'rotten')).toBeGreaterThan(0);
  expect(count(({ across }) => across)).toBeGreaterThan(0);
  expect(count(({ withRotten }) => withRotten)).toBeGreaterThan(0);
  expect(count(({ tough }) => tough)).toBeGreaterThan(0);
  // A fruit thrown across goes a long way across, and still lands within reach.
  const across = await page.evaluate(() => window.__game.field.fruit.filter(({ across: going }) => going).map(({ vx }) => vx / innerWidth));
  for (const vx of across) expect(Math.abs(vx)).toBeGreaterThan(0.06);
  await shot(page, 'f10-busy');
});

test('level 10: a tough fruit takes two real swipes, the first cracking it', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await page.evaluate(() => {
    const { field } = window.__game;
    field.throwing = false;
    field.fruit = [];
    // How a tough one looks, and a cracked one, out of the hand's way.
    field.throwFruit('pear', { x: innerWidth * 0.45, y: innerHeight * 0.35, tough: true });
    field.throwFruit('apple', { x: innerWidth * 0.6, y: innerHeight * 0.35, tough: true }).cracked = true;
  });
  await page.waitForTimeout(300);
  await shot(page, 'f10-tough');
  await page.evaluate(() => {
    window.__game.field.fruit = [];
  });
  await swiping(page);
  await expect.poll(() => page.evaluate(() => window.__game.field.gloves.right.speed), { timeout: 15_000 }).toBeGreaterThan(0.3);
  // One tough apple at a time, wherever the hand is going.
  await page.evaluate(() => {
    window.__onHand = setInterval(() => {
      const { field } = window.__game;
      const { x, y, speed } = field.gloves.right;
      if (speed > 0.3 && field.fruit.length === 0) window.__tough = field.throwFruit('apple', { x, y, tough: true });
    }, 200);
  });
  await expect.poll(() => page.evaluate(() => window.__tough?.cracked ?? false), { timeout: 15_000 }).toBe(true);
  const cracked = await stand(page);
  expect(cracked.stats.wanted).toBe(0);
  await page.evaluate(() => clearInterval(window.__onHand));
  await page.waitForTimeout(80);
  await shot(page, 'f10-cracked');
  await expect.poll(async () => (await stand(page)).stats.wanted, { timeout: 15_000 }).toBe(1);
  await swiping(page, false);
});

test('level 10: the day still ends with the Golden Cup, and that\'s every level done', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  for (const who of ['truffle', 'mochi', 'frost', 'widget', 'kit', 'bramble']) {
    await storyIs(page, who);
    await page.waitForTimeout(300);
    await finishOrder(page);
  }
  await expect(page.locator('#story-line')).toContainText('Golden Cup');
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish')).toContainText('You won the Golden Cup!');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await page.waitForTimeout(600);
  await shot(page, 'f10-finish');
});

for (const level of [1, 10]) {
  test(`nothing flashes at level ${level}: the fruit flying, at the fastest pace a grown-up can choose`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPlaying(page, GAME, atLevel(GAME, level, { pace: 'fast' }));
    await storyIs(page, 'truffle');
    // The hand out of the picture, so it's only the fruit.
    await page.evaluate(() => window.__camera.show({ left: null, right: null }));
    await page.waitForTimeout(1500);
    const result = judgeBrightness(await watchBrightness(page, 360));
    const { inTheAir } = await stand(page);
    console.log(`level ${level}, fruit`, JSON.stringify(result), 'in the air', inTheAir);
    expect(inTheAir).toBeGreaterThan(4);
    expect(inTheAir).toBeLessThanOrEqual(12);
    expect(result.biggestStep).toBeLessThan(3);
    // What counts here is small fruit going past a place quickly, rather than anything lighting up. The
    // usual measure for a flash is a quarter of the picture, and this keeps well under a twentieth.
    expect(result.flickeringShare).toBeLessThan(0.05);
  });

  test(`nothing flashes at level ${level}: slicing, cracking and sticky gloves`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPlaying(page, GAME, atLevel(GAME, level, { slicing: 'touch' }));
    await storyIs(page, 'truffle');
    await swiping(page);
    const result = judgeBrightness(await watchBrightness(page, 360));
    await swiping(page, false);
    const { sliced, stats } = await stand(page);
    console.log(`level ${level}, slicing`, JSON.stringify(result), JSON.stringify(sliced), JSON.stringify(stats));
    // It really was going on.
    expect(sliced.right).toBeGreaterThan(3);
    expect(result.biggestStep).toBeLessThan(3);
    // Mostly the glove itself, going from side to side faster than a child would, over its own path.
    expect(result.flickeringShare).toBeLessThan(0.06);
  });
}

test('level 10 with reduced motion: fruit barely spins, and the day still goes on', async ({ page }) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'truffle');
  await expect.poll(() => page.evaluate(() => window.__game.field.fruit.length), { timeout: 5000 }).toBeGreaterThan(2);
  const spins = await page.evaluate(() => window.__game.field.fruit.map(({ spin }) => spin));
  for (const spin of spins) expect(spin).toBe(0.3);
  await finishOrder(page);
  await storyIs(page, 'mochi');
});
