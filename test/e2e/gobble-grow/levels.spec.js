// Gobble and Grow's ten levels are ten sizes of world, from a bacterium to a galaxy: each new one comes along and
// works in the real game, the pull back from each to the next shows how much the child grew, and nothing flashes,
// at level 1 or level 10, in play or as the view pulls back.
import { atLevel, expect, expectSoon, face, judge, openGobble, passCheck, playChild, SHUT, shot, startPlaying, state, stopChild, test, waitForScreen, watchBrightness } from './helpers.js';

// Each level's world, its picture and what the cards call it, and its three things to eat.
const WORLDS = [
  ['bacterium', '🦠', 'A bacterium under a microscope', ['A speck of sugar', 'A round germ', 'A bud of yeast']],
  ['flea', '🦐', 'A water flea in a drop of water', ['Green algae', 'A slipper animal', 'An amoeba']],
  ['fish', '🐟', 'A fish in a pond', ['A water flea', 'A tadpole', 'A pond snail']],
  ['cat', '🐱', 'A cat in a garden', ['A little fish', 'A piece of cheese', 'A chicken leg']],
  ['elephant', '🐘', 'An elephant on the savanna', ['A peanut', 'A watermelon', 'A haystack']],
  ['whale', '🐋', 'A whale in the ocean', ['A shrimp', 'A shoal of fish', 'A giant squid']],
  ['cloud', '☁️', 'A cloud giant in the sky', ['A kite', 'A hot-air balloon', 'A rainbow']],
  ['planet', '🪐', 'A planet among the moons', ['A space rock', 'A comet', 'A moon']],
  ['sun', '☀️', 'A sun among the planets', ['A moon', 'A small planet', 'A planet with rings']],
  ['galaxy', '🌌', 'A galaxy among the stars', ['A star', 'A cloud of stars', 'A little galaxy']],
];

WORLDS.forEach(([world, mark, name, foods], index) => {
  const level = index + 1;
  test(`level ${level} is ${level > 1 ? 'a new world' : 'the plain game'}: ${name.toLowerCase()}, with its own things to eat, which can be eaten`, async ({ page }) => {
    test.setTimeout(180_000);
    await openGobble(page, { ...atLevel(level), gobbleBites: 8 });
    await expect(page.locator('#level-badge')).toHaveText(`Level ${level} of 10`);
    // Every level but the first says what's new about it, on the title card and under the countdown.
    if (level > 1) await expect(page.locator('#level-new')).toHaveText(`New:${mark}${name}`);
    else await expect(page.locator('#level-new')).toBeHidden();
    await face(page, { open: SHUT });
    await page.locator('#start').click();
    await passCheck(page);
    if (level > 1) await expect(page.locator('#level-new-now')).toContainText(name);
    await waitForScreen(page, 'playing');
    const begun = await state(page);
    expect(begun.level).toBe(level);
    expect(begun.world).toBe(world);
    expect(begun.goal).toBe(8);
    await expect(page.locator('#chip-you')).toContainText(mark);

    await playChild(page);
    await expectSoon(async () => (await state(page)).eaten, { timeout: 90_000 }).toBeGreaterThanOrEqual(3);
    // Its three things are named, in this world's own words, the first time each is well in view.
    await expectSoon(async () => (await state(page)).named, { timeout: 60_000 }).toEqual(expect.arrayContaining(['food-0', 'food-1', 'food-2']));
    expect(await page.evaluate(() => window.__game.view.world.foods.map((food) => food.name))).toEqual(foods);
    await shot(page, `gobble-level-${level}`);
    await stopChild(page);
    // What a grown-up chose is as they chose it, whatever the level.
    expect((await state(page)).goal).toBe(8);
  });
});

test('the last world, won: the view pulls back to the whole sky, with everything the child has been, and all ten levels are done', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page, { ...atLevel(10), gobbleBites: 8 });
  await playChild(page);
  await expectSoon(async () => (await state(page)).won, { timeout: 200_000 }).toBe(true);
  await stopChild(page);
  await expectSoon(async () => (await state(page)).pulling).toBe(true);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You’re as big as the sky!');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await expect(page.locator('#level-pips li.is-done')).toHaveCount(10);
  await expect(page.locator('#play-again')).not.toHaveText('Next level');
  await expect(page.locator('#finish-ladder')).toBeVisible();
  await page.waitForTimeout(700);
  await shot(page, 'gobble-the-sky');
  expect((await state(page)).ownLevel).toBe(10);
});

// Nothing flashes: the whole picture's brightness, frame by frame, with things drifting, a creature eating and
// growing, crumbs and labels, at level 1 and among the stars at level 10.
for (const level of [1, 10]) {
  test(`nothing flashes at level ${level}: the brightness stays steady through eating and growing`, async ({ page }) => {
    test.setTimeout(300_000);
    await startPlaying(page, { ...atLevel(level), gobbleBites: 16 });
    await playChild(page);
    await expectSoon(async () => (await state(page)).eaten, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
    const result = judge(await watchBrightness(page, 420));
    console.log(`level ${level}`, 'playing', JSON.stringify(result));
    const after = await state(page);
    await stopChild(page);
    expect(result.biggestStep).toBeLessThan(4);
    expect(result.flickeringShare).toBeLessThan(0.01);
    // It was really being played while it was watched.
    expect(after.eaten).toBeGreaterThanOrEqual(3);
  });

  test(`nothing flashes at level ${level}: a mouth opening and shutting as fast as it can doesn't flicker the creature`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPlaying(page, atLevel(level));
    // Quicker than any child: open and shut more than twice a second.
    await page.evaluate(() => {
      let open = true;
      window.__flip = setInterval(() => {
        open = !open;
        window.__face.show({ open: open ? 0.4 : 0.01 });
      }, 200);
    });
    const result = judge(await watchBrightness(page, 240));
    console.log(`level ${level}`, 'opening and shutting', JSON.stringify(result));
    await page.evaluate(() => clearInterval(window.__flip));
    expect(result.biggestStep).toBeLessThan(4);
    expect(result.flickeringShare).toBeLessThan(0.02);
  });
}

// The pull back from one world to the next is the biggest change of picture there is: a whole new world comes into
// view. From the microscope to the drop of water, from the bright sky to the dark among the moons, which is the
// greatest change of brightness, and from the last world to the whole sky. ALL_PULLS=1 measures every one of them.
for (const level of process.env.ALL_PULLS ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 7, 10]) {
  test(`nothing flashes as the view pulls back from level ${level}: one slow, steady change`, async ({ page }) => {
    test.setTimeout(300_000);
    await startPlaying(page, { ...atLevel(level), gobbleBites: 8 });
    await playChild(page);
    await expectSoon(async () => (await state(page)).eaten, { timeout: 150_000 }).toBeGreaterThanOrEqual(7);
    // From just before the last bite, through the whole of the pull back, to the finish card.
    const watching = watchBrightness(page, 660);
    await expectSoon(async () => (await state(page)).won, { timeout: 60_000 }).toBe(true);
    await stopChild(page);
    const reading = await watching;
    const result = judge(reading);
    console.log(`level ${level}`, 'pulling back', JSON.stringify(result));
    expect(result.biggestStep).toBeLessThan(4);
    expect(result.flickeringShare).toBeLessThan(0.01);
    // The pull back was all in what was watched.
    expect(await page.evaluate(() => window.__game.view.pull.t)).toBeGreaterThan(6.5);
    await waitForScreen(page, 'finish');
  });
}

test('with reduced motion, the picture of how much the child grew fades in, and nothing moves across the screen', async ({ page }) => {
  test.setTimeout(300_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPlaying(page, { gobbleBites: 8 });
  await playChild(page);
  await expectSoon(async () => (await state(page)).eaten, { timeout: 150_000 }).toBeGreaterThanOrEqual(7);
  const watching = watchBrightness(page, 480);
  await expectSoon(async () => (await state(page)).won, { timeout: 60_000 }).toBe(true);
  await stopChild(page);
  const result = judge(await watching);
  console.log('reduced motion', 'pulling back', JSON.stringify(result));
  expect(result.biggestStep).toBeLessThan(4);
  expect(result.flickeringShare).toBeLessThan(0.01);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-ladder')).toBeVisible();
  await shot(page, 'gobble-reduced-motion-finish');
});
