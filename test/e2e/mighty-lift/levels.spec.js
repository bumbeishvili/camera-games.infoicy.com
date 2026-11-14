// Mighty Lift's ten levels, in the real page: what each one brings is named on the title card and under the
// countdown, comes along and works in the real game, and nothing flashes, at level 1 or at level 10 with all of it
// about. The child is played by a script, whose arm goes up when there's something to lift and is never quite still.
import { childLifts, expect, expectSoon, judge, labelShown, openLift, reachPlay, shot, state, stopChild, test, waitForScreen, watchBrightness } from './helpers.js';

const atLevel = (level, settings = {}) => ({ levels: { 'mighty-lift': level }, ...settings });

const NEW = {
  2: 'Gold stars',
  3: 'Heavy crates',
  4: 'Ducklings',
  5: 'A big rock: two lifts',
  6: 'A sleepy owl',
  7: 'A beehive',
  8: 'Balloons',
  9: 'A helper friend',
  10: 'The champion’s chest',
};

test('the title card says what each level brings that\'s new, and level 1 has nothing new to say', async ({ page }) => {
  await openLift(page);
  await expect(page.locator('#level-badge')).toHaveText('Level 1 of 10');
  await expect(page.locator('#level-new')).toBeHidden();
  for (const [level, name] of Object.entries(NEW)) {
    await page.locator('#open-panel').click();
    await page.locator(`#level-choice input[value="${level}"]`).check();
    await page.locator('#close-panel').click();
    await expect(page.locator('#level-badge')).toHaveText(`Level ${level} of 10`);
    await expect(page.locator('#level-new .level-new-chip')).toHaveCount(1);
    await expect(page.locator('#level-new')).toContainText(name);
  }
  await shot(page, 'lift-l10-title');
});

test('level 1 is the plain game: baskets, no prizes and nothing to point out', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(1));
  const start = await state(page);
  expect(new Set(start.kinds)).toEqual(new Set(['basket']));
  await expect(page.locator('#prizes-chip')).toBeHidden();
  await childLifts(page, { high: 1.3 });
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await stopChild(page);
  expect(await page.evaluate(() => window.__game.game.newShown.size)).toBe(0);
  await expect(page.locator('#lift-new')).not.toHaveClass(/is-showing/);
  expect(await page.evaluate(() => window.__game.world.star.visible)).toBe(false);
});

test('level 2: a gold star hangs above the line, and lifting a little higher than the line gets it', async ({ page }) => {
  test.setTimeout(180_000);
  await reachPlay(page, atLevel(2));
  await expect(page.locator('#prizes-chip')).toBeVisible();
  await expectSoon(() => page.evaluate(() => window.__game.world.star.visible), { timeout: 10_000 }).toBe(true);
  expect(await labelShown(page, 'star')).toBe(true);
  await expect(page.locator('#lift-new')).toContainText('Gold stars');
  await page.waitForTimeout(500);
  await shot(page, 'lift-l2-star');
  // Up to the line and no higher: the friend is free, and the star still hangs.
  await childLifts(page, { high: 1.04 });
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 30_000 }).toBe(1);
  expect((await state(page)).stats.stars).toBe(0);
  // A little higher, with the next friend, and it's had.
  await childLifts(page, { high: 1.3 });
  await expectSoon(async () => (await state(page)).stats.stars, { timeout: 30_000 }).toBe(1);
  await expect(page.locator('#prizes')).toContainText('⭐ 1');
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 30_000 }).toBe(2);
  expect((await state(page)).stats.starsHung).toBe(2);
  await stopChild(page);
});

test('level 3: a heavy crate comes up slowly, so the arm stays up for longer, and then the friend is free', async ({ page }) => {
  test.setTimeout(180_000);
  await reachPlay(page, atLevel(3));
  const start = await state(page);
  expect([start.kind, start.thing]).toEqual(['crate', 'crate']);
  expect(await labelShown(page, 'crate')).toBe(true);
  await childLifts(page, { high: 1.2 });
  // The arm is over its line while the crate is still on its way up.
  await expectSoon(async () => {
    const now = await state(page);
    return now.lift >= 1 && now.height > 0.15 && now.height < 0.75;
  }, { timeout: 20_000 }).toBe(true);
  await shot(page, 'lift-l3-crate-rising');
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 30_000 }).toBe(1);
  // The basket that comes next is up as soon as the arm is.
  await expectSoon(async () => (await state(page)).kind, { timeout: 20_000 }).toBe('basket');
  await expectSoon(async () => (await state(page)).up, { timeout: 20_000 }).toBe(true);
  await stopChild(page);
});

test('level 4: three ducklings waddle out to their mother one at a time, each one kept', async ({ page }) => {
  test.setTimeout(180_000);
  await reachPlay(page, atLevel(4));
  const start = await state(page);
  expect([start.kind, start.rescue.friend, start.rescue.parts]).toEqual(['tub', 'ducks', 3]);
  expect(await labelShown(page, 'tub')).toBe(true);
  const ducklingsOut = () => page.evaluate(() => window.__game.world.ducks?.little.filter((one) => one.visible).length ?? -1);
  expect(await ducklingsOut()).toBe(0);
  await childLifts(page, { high: 1.2 });
  await expectSoon(async () => (await state(page)).parts, { timeout: 20_000 }).toBe(1);
  await expectSoon(ducklingsOut, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  await shot(page, 'lift-l4-ducklings');
  // The arm comes down, and the duckling that's out stays out.
  await childLifts(page, { lifts: false });
  // Down, give or take the little a resting arm is never quite still by.
  await expectSoon(async () => (await state(page)).height, { timeout: 15_000 }).toBeLessThan(0.15);
  expect((await state(page)).parts).toBeGreaterThanOrEqual(1);
  const kept = (await state(page)).parts;
  await page.waitForTimeout(1500);
  expect((await state(page)).parts).toBe(kept);
  await childLifts(page, { high: 1.2 });
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 30_000 }).toBe(1);
  expect((await state(page)).stats.ducklings).toBe(3);
  await expect(page.locator('#freed-row li')).toHaveText('🦆');
  await stopChild(page);
});

test('level 5: a big rock takes two lifts, and stays up on its jack between them', async ({ page }) => {
  test.setTimeout(180_000);
  await reachPlay(page, atLevel(5));
  const start = await state(page);
  expect([start.kind, start.rescue.lifts]).toEqual(['rock', 2]);
  expect(await labelShown(page, 'rock')).toBe(true);
  expect(await page.evaluate(() => window.__game.world.jack.visible)).toBe(true);
  await childLifts(page, { high: 1.2 });
  await expectSoon(async () => (await state(page)).pulls, { timeout: 20_000 }).toBe(1);
  // Half way up, on its jack, while the arm comes down for the next lift.
  await expectSoon(async () => (await state(page)).mustLower, { timeout: 15_000 }).toBe(false);
  const between = await state(page);
  expect(between.stats.freed).toBe(0);
  expect(between.thingHeight).toBeGreaterThanOrEqual(0.5);
  expect(between.thingY).toBeGreaterThan(0.5);
  await shot(page, 'lift-l5-rock-notch');
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 30_000 }).toBe(1);
  expect((await state(page)).stats.lifts).toBe(2);
  await expect(page.locator('#lifts-done')).toHaveText('2');
  await stopChild(page);
});

test('level 6: an owl asleep on the basket stays asleep when it\'s put down with care, and leaves a feather', async ({ page }) => {
  test.setTimeout(180_000);
  await reachPlay(page, atLevel(6));
  expect((await state(page)).rescue.owl).toBe(true);
  expect(await labelShown(page, 'owl')).toBe(true);
  expect(await page.evaluate(() => window.__game.world.owl.visible)).toBe(true);
  await page.waitForTimeout(500);
  await shot(page, 'lift-l6-owl');
  await childLifts(page, { high: 1.2 });
  await expectSoon(async () => (await state(page)).stats.feathers, { timeout: 40_000 }).toBe(1);
  await expect(page.locator('#prizes')).toContainText('🪶 1');
  expect(await page.evaluate(() => window.__game.lifting.owlAwake)).toBe(false);
  await stopChild(page);
});

test('level 6: a basket that\'s let drop wakes the owl, which flies off, and the game goes on', async ({ page }) => {
  test.setTimeout(180_000);
  await reachPlay(page, atLevel(6));
  await childLifts(page, { high: 1.2, drop: true });
  await expectSoon(() => page.evaluate(() => window.__game.lifting.owlAwake || window.__game.lifting.index > 0), { timeout: 40_000 }).toBe(true);
  await expectSoon(async () => (await state(page)).index, { timeout: 20_000 }).toBe(1);
  const after = await state(page);
  expect([after.stats.freed, after.stats.feathers, after.stats.owls]).toEqual([1, 0, 1]);
  await stopChild(page);
});

test('level 7: a beehive on the basket, and honey for a steady hold but not for one that shakes', async ({ page }) => {
  test.setTimeout(180_000);
  await reachPlay(page, atLevel(7));
  expect((await state(page)).rescue.hive).toBe(true);
  expect(await labelShown(page, 'hive')).toBe(true);
  expect(await page.evaluate(() => window.__game.world.bees.filter((bee) => bee.visible).length)).toBe(5);
  await childLifts(page, { high: 1.2 });
  await expectSoon(async () => (await state(page)).stats.honey, { timeout: 40_000 }).toBe(1);
  await expect(page.locator('#prizes')).toContainText('🍯 1');
  await shot(page, 'lift-l7-honey');
  await stopChild(page);
});

test('level 7: an arm that shakes frees the friend all the same, with no honey', async ({ page }) => {
  test.setTimeout(180_000);
  await reachPlay(page, atLevel(7));
  // Shaking by a fifth of a torso length, three times a second, well over the line.
  await childLifts(page, { high: 1.35, shake: 0.2 });
  await expectSoon(async () => (await state(page)).index, { timeout: 40_000 }).toBe(1);
  const after = await state(page);
  expect([after.stats.freed, after.stats.honey, after.stats.hives]).toEqual([1, 0, 1]);
  await stopChild(page);
});

test('level 8: the first friend gives balloons, and the heavy crate that comes next rises as fast as a basket', async ({ page }) => {
  test.setTimeout(180_000);
  await reachPlay(page, atLevel(8));
  const start = await state(page);
  expect([start.rescue.gives, start.kinds[1]]).toEqual(['balloons', 'crate']);
  await childLifts(page, { high: 1.2 });
  await expectSoon(async () => (await state(page)).balloons, { timeout: 40_000 }).toBe(2);
  expect(await labelShown(page, 'balloons')).toBe(true);
  await expectSoon(() => page.evaluate(() => window.__game.world.balloons.visible), { timeout: 10_000 }).toBe(true);
  await expectSoon(async () => (await state(page)).kind, { timeout: 20_000 }).toBe('crate');
  expect(await page.evaluate(() => window.__game.lifting.slow)).toBe(false);
  await page.waitForTimeout(600);
  await shot(page, 'lift-l8-balloons');
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 30_000 }).toBe(2);
  expect((await state(page)).balloons).toBe(1);
  await stopChild(page);
});

test('level 9: the first friend freed stays to help, and pulls on the rope for the next one', async ({ page }) => {
  test.setTimeout(180_000);
  await reachPlay(page, atLevel(9));
  const start = await state(page);
  expect(start.rescue.gives).toBe('helper');
  await childLifts(page, { high: 1.2 });
  await expectSoon(async () => (await state(page)).helping, { timeout: 40_000 }).toBe(true);
  expect(await labelShown(page, 'helper')).toBe(true);
  expect(await page.evaluate(() => window.__game.world.helper?.body.spec.id)).toBe(start.friends[0]);
  await page.waitForTimeout(800);
  await shot(page, 'lift-l9-helper');
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 30_000 }).toBe(2);
  expect((await state(page)).helping).toBe(false);
  // They wave goodbye, and go.
  await expectSoon(() => page.evaluate(() => window.__game.world.helper === null), { timeout: 10_000 }).toBe(true);
  await stopChild(page);
});

test('level 10: the champion\'s chest is the last thing, takes three lifts, and has the trophy in it', async ({ page }) => {
  test.setTimeout(300_000);
  await reachPlay(page, atLevel(10, { lifts: 5 }));
  const start = await state(page);
  expect(start.kinds.at(-1)).toBe('chest');
  expect(start.planned).toBe(5);
  await childLifts(page, { high: 1.2 });
  await expectSoon(async () => (await state(page)).kind, { timeout: 90_000 }).toBe('chest');
  expect(await labelShown(page, 'chest')).toBe(true);
  await expectSoon(async () => (await state(page)).pulls, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await shot(page, 'lift-l10-chest');
  await expectSoon(async () => (await state(page)).stats.trophy, { timeout: 60_000 }).toBe(true);
  expect(await page.evaluate(() => window.__game.world.trophy.visible)).toBe(true);
  await page.waitForTimeout(500);
  await shot(page, 'lift-l10-trophy');
  await waitForScreen(page, 'finish');
  await stopChild(page);
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await expect(page.locator('#finish-prizes')).toContainText('won the trophy');
  await expect(page.locator('#finish-lifts')).toHaveText('5 lifts');
  await page.waitForTimeout(600);
  await shot(page, 'lift-l10-finish');
});

for (const level of [1, 10]) {
  test(`nothing flashes at level ${level}: lifting, friends getting out and prizes, the brightness stays steady`, async ({ page }) => {
    test.setTimeout(240_000);
    await reachPlay(page, atLevel(level));
    await childLifts(page, { high: 1.25 });
    await expectSoon(async () => (await state(page)).up, { timeout: 20_000 }).toBe(true);
    // Nine seconds or more of it: a weight going up, a friend out, the weight down, and the next one coming in.
    const reading = judge(await watchBrightness(page, 540));
    console.log(`level ${level} in the yard`, JSON.stringify(reading));
    expect(reading.biggestStep).toBeLessThan(4);
    expect(reading.flickeringShare).toBeLessThan(0.01);
    expect((await state(page)).stats.freed).toBeGreaterThanOrEqual(1);
    await stopChild(page);
  });
}

test('nothing flashes as the last friend is freed and the lifter jumps for joy', async ({ page }) => {
  test.setTimeout(240_000);
  await reachPlay(page, atLevel(10, { lifts: 5 }));
  await childLifts(page, { high: 1.25 });
  await expectSoon(async () => (await state(page)).kind, { timeout: 90_000 }).toBe('chest');
  await expectSoon(async () => (await state(page)).pulls, { timeout: 30_000 }).toBe(2);
  // Through the last lift, the trophy coming out, and the party, to just before the finish card.
  const reading = judge(await watchBrightness(page, 420));
  console.log('the trophy and the party', JSON.stringify(reading));
  expect(reading.biggestStep).toBeLessThan(4);
  expect(reading.flickeringShare).toBeLessThan(0.01);
  await waitForScreen(page, 'finish');
  await stopChild(page);
});
