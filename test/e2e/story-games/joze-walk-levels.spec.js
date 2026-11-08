// Joze's Long Walk Home at level 10, with real photos going through the real tracker: fruit swaying
// on the branch, green fruit that isn't ripe yet, butterflies, and still all the way home.
import { expect, hands, shot, test, waitForScreen } from '../helpers.js';
import { atLevel, judgeBrightness, moveGloveTo, startPlaying, stopMoving, storyIs, watchBrightness } from './helpers.js';

const GAME = 'joze-walk';
const GLOVE = ['walk', 'gloves', 'right'];
const CANVASES = ['backdrop', 'joze-stage', 'game'];
const tree = (page) => page.evaluate(() => {
  const { walk, journey } = window.__game;
  return {
    index: journey.index,
    count: journey.stop?.count ?? null,
    fed: journey.stats.fed,
    holding: Boolean(walk.holding),
    fruit: walk.fruit.map((fruit) => ({
      x: fruit.x / walk.width,
      y: fruit.y / walk.height,
      homeX: fruit.homeX / walk.width,
      ripe: fruit.ripe,
      state: fruit.state,
      wiggle: fruit.wiggle,
      pickable: walk.pickable(fruit),
    })),
    butterfly: walk.butterfly ? { at: walk.fruit.indexOf(walk.butterfly.fruit), leaving: walk.butterfly.leaving } : null,
  };
});

/** The real hand's picture, where it is now, open or closed. */
const handIs = (page, photo) => page.evaluate((which) => {
  window.__move?.stop();
  const { offsetX = 0, offsetY = 0 } = window.__move ?? {};
  window.__camera.show({ left: null, right: which, scale: 0.7, rightOffsetX: offsetX, rightOffsetY: offsetY });
}, photo);

test('level 10: fruit sways, and a real fist on green fruit only wiggles it until it ripens', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'joze');
  expect(await page.evaluate(() => window.__game.journey.stops.map(({ count }) => count))).toEqual([3, 3, 5, 5, 3]);
  const first = await tree(page);
  // Four ripe, one more than he needs, and two green.
  expect(first.fruit.filter(({ ripe }) => ripe)).toHaveLength(4);
  expect(first.fruit.filter(({ ripe }) => !ripe)).toHaveLength(2);
  await page.waitForTimeout(700);
  const later = await tree(page);
  const swayed = Math.max(...later.fruit.map(({ x }, index) => Math.abs(x - first.fruit[index].x)));
  expect(swayed).toBeGreaterThan(0.004);
  for (const { x, homeX } of later.fruit) expect(Math.abs(x - homeX)).toBeLessThanOrEqual(0.0221);
  await shot(page, 'w10-tree');

  // A real closed hand on a green one doesn't pick it. Only the green one is left on the tree, so the
  // fist can't pick a ripe one beside it, and it's only just started ripening.
  const green = first.fruit.findIndex(({ ripe }) => !ripe);
  await page.evaluate((at) => {
    const { walk } = window.__game;
    walk.fruit.forEach((fruit, index) => {
      if (index !== at) fruit.state = 'gone';
    });
    walk.fruit[at].ripening = 0;
  }, green);
  await moveGloveTo(page, GLOVE, first.fruit[green].homeX, first.fruit[green].y, { right: 'fist' });
  await expect.poll(async () => (await hands(page)).right.status, { timeout: 15_000 }).toBe('closed');
  await expect.poll(() => page.evaluate((at) => {
    const { walk } = window.__game;
    return walk.isNear(walk.fruit[at], walk.gloves.right);
  }, green), { timeout: 20_000 }).toBe(true);
  await stopMoving(page);
  expect((await tree(page)).fruit[green].ripe).toBe(false);
  await expect.poll(async () => (await tree(page)).fruit[green].wiggle, { timeout: 5000 }).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  await shot(page, 'w10-green');
  expect((await tree(page)).holding).toBe(false);
  // It ripens by itself, and then the same fist picks it.
  await expect.poll(async () => (await tree(page)).fruit[green].ripe, { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await tree(page)).holding, { timeout: 15_000 }).toBe(true);
});

test('level 10: a butterfly sits on a fruit, and flies off from a real open hand', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'joze');
  // Somewhere out of the way, so it lands.
  await moveGloveTo(page, GLOVE, 0.5, 0.85);
  await expect.poll(async () => (await tree(page)).butterfly, { timeout: 20_000 }).not.toBeNull();
  const { butterfly, fruit } = await tree(page);
  expect(fruit[butterfly.at].pickable).toBe(false);
  // There's always another ripe one free.
  expect(fruit.filter(({ pickable }) => pickable).length).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(900);
  await shot(page, 'w10-butterfly');
  await moveGloveTo(page, GLOVE, fruit[butterfly.at].homeX, fruit[butterfly.at].y);
  await expect.poll(async () => (await tree(page)).butterfly?.leaving ?? true, { timeout: 20_000 }).toBe(true);
  await stopMoving(page);
});

test('level 10: a real hand still picks a swaying fruit and feeds Joze', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'joze');
  // No butterflies or green fruit for this one, only the sway.
  await page.evaluate(() => {
    const { walk } = window.__game;
    walk.level = { ...walk.level, butterflies: false };
    walk.fruit = walk.fruit.filter(({ ripe }) => ripe);
  });
  const { fruit } = await tree(page);
  await moveGloveTo(page, GLOVE, fruit[0].homeX, fruit[0].y);
  await expect.poll(() => page.evaluate(() => {
    const { walk } = window.__game;
    return walk.fruitNear(walk.gloves.right) !== null;
  }), { timeout: 20_000 }).toBe(true);
  await handIs(page, 'fist');
  await expect.poll(async () => (await tree(page)).holding, { timeout: 15_000 }).toBe(true);
  const mouth = await page.evaluate(() => {
    const { walk } = window.__game;
    return { x: walk.mouth.x / walk.width, y: walk.mouth.y / walk.height };
  });
  await moveGloveTo(page, GLOVE, mouth.x, mouth.y, { right: 'fist' });
  await expect.poll(() => page.evaluate(() => window.__game.walk.onMouth), { timeout: 30_000 }).toBe(true);
  await handIs(page, 'open');
  await expect.poll(async () => (await tree(page)).fed, { timeout: 15_000 }).toBe(1);
});

test('level 10: every stop fed still brings Joze home, a little quicker between trees', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  const feedThisStop = () => page.evaluate(() => {
    const { journey: rules } = window.__game;
    while (rules.fed < rules.stop.count) rules.feed();
  });
  for (const [who, index] of [['joze', 0], ['mochi', 1], ['bramble', 2], ['tur', 3], ['joze', 4]]) {
    await expect.poll(async () => (await tree(page)).index, { timeout: 30_000 }).toBe(index);
    await storyIs(page, who);
    await feedThisStop();
    if (index === 0) {
      expect(await page.evaluate(() => window.__game.walk.walkLasts)).toBeCloseTo(2.2, 5);
      await page.waitForTimeout(1000);
      await shot(page, 'w10-walking');
    }
  }
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish')).toContainText('Joze is home!');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  expect((await tree(page)).fed).toBe(19);
});

for (const level of [1, 10]) {
  test(`nothing flashes at level ${level}: fruit, butterflies, feeding and walking from one place to the next`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPlaying(page, GAME, atLevel(GAME, level));
    await storyIs(page, 'joze');
    // Feeding him a fruit every so often, so he walks on to the next tree in the meantime.
    await page.evaluate(() => {
      window.__feeding = setInterval(() => {
        const { journey: rules, walk } = window.__game;
        if (rules.stop && walk.walking === 0 && walk.fruit.length && rules.fed < rules.stop.count) rules.feed();
      }, 700);
    });
    const result = judgeBrightness(await watchBrightness(page, 420, CANVASES));
    const { index } = await tree(page);
    await page.evaluate(() => clearInterval(window.__feeding));
    console.log(`level ${level}`, JSON.stringify(result), 'stop', index);
    expect(index).toBeGreaterThanOrEqual(1);
    expect(result.biggestStep).toBeLessThan(3);
    expect(result.flickeringShare).toBeLessThan(0.02);
  });
}

test('level 10 with reduced motion: the fruit sways half as far', async ({ page }) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'joze');
  const furthest = await page.evaluate(async () => {
    const { walk } = window.__game;
    let most = 0;
    for (let i = 0; i < 60; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      for (const fruit of walk.fruit) if (fruit.state === 'hanging') most = Math.max(most, Math.abs(fruit.x - fruit.homeX) / walk.width);
    }
    return most;
  });
  expect(furthest).toBeGreaterThan(0.002);
  expect(furthest).toBeLessThanOrEqual(0.0111);
});
