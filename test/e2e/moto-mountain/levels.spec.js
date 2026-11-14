// Moto Mountain's ten levels, in the real page: what each one brings is named on the title card and under the
// countdown, comes along and works in the real game, and nothing flashes, at level 1 or at level 10 with all of it
// about. The child is played by a script, whose lean goes where the road needs it and is never quite still.
import { childHolds, childRides, expect, expectSoon, judge, labelShown, openMoto, putBefore, reachPlay, reachWarmup, shot, state, stopChild, test, waitForScreen, watchBrightness } from './helpers.js';

// How far a child has to lean, as a share of a whole lean, to hold the bike a couple of metres to one side of
// the road: the bike is put down in line with a thing, and this keeps it there.
const TO_ONE_SIDE = 0.09;

const atLevel = (level, settings = {}) => ({ levels: { 'moto-mountain': level }, ...settings });

const NEW = {
  2: 'Gold stars',
  3: 'Puddles',
  4: 'Speed arrows',
  5: 'Sheep on the road',
  6: 'A narrow bridge',
  7: 'A jump',
  8: 'The big bend',
  9: 'A friend to pass',
  10: 'Snow at the top, and the cup',
};

/** What the page has heard happen in this ride, by name, in order. */
const listen = (page) => page.evaluate(() => {
  const { ride } = window.__game;
  window.__heard = [];
  const tell = ride.onEvent;
  ride.onEvent = (event) => {
    window.__heard.push(event.type);
    tell(event);
  };
});
const heard = (page) => page.evaluate(() => window.__heard);

test('the title card says what each level brings that\'s new, and level 1 has nothing new to say', async ({ page }) => {
  await openMoto(page);
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
});

test('what a level brings is named under the countdown, in Georgian too, and the mountain changes as the levels go up', async ({ page }) => {
  await reachWarmup(page, atLevel(5, { language: 'ka' }));
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('ცხვრები გზაზე');
  await expect(page.locator('#level-new-now')).toContainText('ახალი:');
  // Pine woods at level 5: a meadow at the bottom of the mountain, and bare rock higher up.
  const pines = (level) => page.evaluate((at) => import('./land.js').then(({ themeAt }) => themeAt(at).pines), level);
  expect(await pines(5)).toBeGreaterThan(await pines(1));
  expect(await pines(5)).toBeGreaterThan(await pines(8));
});

test('level 1 is the plain road: bends, and nothing on it', async ({ page }) => {
  await reachPlay(page, atLevel(1));
  const { plan, level } = await state(page);
  expect(level).toBe(1);
  expect(plan.kinds).toEqual([]);
  expect(plan.bends.length).toBe(10);
  await expect(page.locator('#prizes-chip')).toBeHidden();
});

test('level 2: gold stars, caught by riding over them and counted at the top', async ({ page }) => {
  await reachPlay(page, atLevel(2));
  await listen(page);
  await childRides(page, { goFor: true });
  expect(await putBefore(page, 'star')).not.toBe(null);
  await expectSoon(async () => (await state(page)).stats.stars, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  expect(await labelShown(page, 'star')).toBe(true);
  await expect(page.locator('#prizes-chip')).toBeVisible();
  await expect(page.locator('#prizes')).toContainText('⭐');
  expect(await heard(page)).toContain('star');
  // A star that's been caught is gone from the road.
  expect(await page.evaluate(() => window.__game.world.items.filter(({ thing, object }) => thing.taken && thing.kind === 'star' && !object.visible).length)).toBeGreaterThanOrEqual(1);
  await shot(page, 'moto-level-2');
  await stopChild(page);
});

test('level 3: a puddle splashes and slows the bike for a moment', async ({ page }) => {
  await reachPlay(page, atLevel(3));
  await listen(page);
  await childRides(page, { fixed: 0 });
  const at = await putBefore(page, 'puddle', { before: 30, lane: true });
  const puddle = await page.evaluate((where) => window.__game.ride.things.find((thing) => thing.kind === 'puddle' && thing.at === where).x, at);
  // Held over on its side of the road, the bike rides through it.
  await childHolds(page, puddle > 0 ? TO_ONE_SIDE : -TO_ONE_SIDE);
  await expectSoon(async () => (await state(page)).stats.splashes, { timeout: 20_000 }).toBe(1);
  // Slower for a moment,
  await expectSoon(async () => {
    const now = await state(page);
    return now.v / now.cruise;
  }).toBeLessThan(0.93);
  expect(await labelShown(page, 'puddle')).toBe(true);
  // and then back up to speed.
  await childHolds(page, 0);
  await expectSoon(async () => {
    const now = await state(page);
    return now.v / now.cruise;
  }).toBeGreaterThan(0.98);
  await stopChild(page);
});

test('level 4: a speed arrow makes the bike faster for a couple of seconds', async ({ page }) => {
  await reachPlay(page, atLevel(4));
  await childRides(page, { fixed: 0 });
  const at = await putBefore(page, 'boost', { before: 30, lane: true });
  const arrow = await page.evaluate((where) => window.__game.ride.things.find((thing) => thing.kind === 'boost' && thing.at === where).x, at);
  await childHolds(page, arrow > 0 ? TO_ONE_SIDE : -TO_ONE_SIDE);
  await expectSoon(async () => (await state(page)).stats.boosts, { timeout: 20_000 }).toBe(1);
  await expectSoon(async () => {
    const now = await state(page);
    return now.v / now.cruise;
  }).toBeGreaterThan(1.1);
  expect(await labelShown(page, 'boost')).toBe(true);
  await stopChild(page);
});

test('level 5: the bike stops for a sheep in its way, rings, and the sheep trots off', async ({ page }) => {
  await reachPlay(page, atLevel(5));
  await listen(page);
  await childRides(page, { fixed: 0 });
  const at = await putBefore(page, 'sheep', { before: 40 });
  const sheep = await page.evaluate((where) => window.__game.ride.things.find((thing) => thing.kind === 'sheep' && thing.at === where).x, at);
  // Straight at it.
  await childHolds(page, sheep > 0 ? 0.1 : -0.1);
  await expectSoon(async () => (await heard(page)).includes('sheep-goes'), { timeout: 30_000 }).toBe(true);
  const stopped = await state(page);
  expect(stopped.v).toBeLessThan(1);
  expect(stopped.s).toBeLessThan(at - 2.5);
  expect(await labelShown(page, 'sheep')).toBe(true);
  await shot(page, 'moto-level-5');
  // Once it's off the road, the bike rides on by itself.
  await expectSoon(async () => (await state(page)).s, { timeout: 20_000 }).toBeGreaterThan(at + 5);
  expect((await state(page)).stats.stops).toBe(1);
  await stopChild(page);
});

test('level 5: leaning round the sheep passes it without stopping', async ({ page }) => {
  await reachPlay(page, atLevel(5));
  await childRides(page, { fixed: 0 });
  const at = await putBefore(page, 'sheep', { before: 50 });
  const sheep = await page.evaluate((where) => window.__game.ride.things.find((thing) => thing.kind === 'sheep' && thing.at === where).x, at);
  await childHolds(page, sheep > 0 ? -0.15 : 0.15);
  await expectSoon(async () => (await state(page)).s, { timeout: 20_000 }).toBeGreaterThan(at + 3);
  const after = await state(page);
  expect(after.stats.passed).toBe(1);
  expect(after.stats.stops).toBe(0);
  expect(after.v).toBeGreaterThan(after.cruise * 0.9);
  await stopChild(page);
});

test('level 6: a narrow wooden bridge, which can be ridden across and never fallen off', async ({ page }) => {
  await reachPlay(page, atLevel(6));
  await listen(page);
  await childRides(page, { fixed: 0 });
  const from = await putBefore(page, 'bridge', { before: 30 });
  await expectSoon(async () => (await state(page)).onBridge, { timeout: 20_000 }).toBe(true);
  expect(await labelShown(page, 'bridge')).toBe(true);
  await shot(page, 'moto-level-6');
  // Held hard over to one side, the bike is on the edge of the planks, slowed, and no further.
  await childHolds(page, 1);
  await expectSoon(async () => (await state(page)).offRoad).toBe(true);
  const edge = await state(page);
  expect(Math.abs(edge.x)).toBeLessThanOrEqual(2.8 + 0.5 + 0.001);
  expect(from).toBeGreaterThan(0);
  await childHolds(page, 0);
  await expectSoon(async () => (await heard(page)).includes('bridge-end'), { timeout: 30_000 }).toBe(true);
  await stopChild(page);
});

test('level 7: riding over the ramp is a jump, up and down again', async ({ page }) => {
  await reachPlay(page, atLevel(7));
  await listen(page);
  await childRides(page, { fixed: 0 });
  const at = await putBefore(page, 'ramp', { before: 34, lane: true });
  const ramp = await page.evaluate((where) => window.__game.ride.things.find((thing) => thing.kind === 'ramp' && thing.at === where).x, at);
  await childHolds(page, ramp > 0 ? TO_ONE_SIDE : -TO_ONE_SIDE);
  await expectSoon(async () => (await state(page)).height, { timeout: 20_000 }).toBeGreaterThan(1.2);
  await shot(page, 'moto-level-7');
  await expectSoon(async () => (await state(page)).stats.jumps, { timeout: 20_000 }).toBe(1);
  expect((await state(page)).height).toBe(0);
  expect(await heard(page)).toEqual(expect.arrayContaining(['jump', 'land']));
  expect(await labelShown(page, 'ramp')).toBe(true);
  await stopChild(page);
});

test('level 8: the big bend goes most of the way round, and ridden all on the road it wins the medal', async ({ page }) => {
  await reachPlay(page, atLevel(8));
  await childRides(page);
  const from = await putBefore(page, 'big', { before: 60 });
  const big = (await state(page)).plan.bends.find((bend) => bend.big);
  expect(big.to - big.from).toBeGreaterThan(120);
  await expectSoon(async () => (await state(page)).bend?.big ?? false, { timeout: 30_000 }).toBe(true);
  await expect(page.locator('#bend-arrow')).toHaveAttribute('data-big', 'true');
  expect(await labelShown(page, 'big')).toBe(true);
  await expectSoon(async () => (await state(page)).s, { timeout: 30_000 }).toBeGreaterThan(from + 60);
  await shot(page, 'moto-level-8');
  await expectSoon(async () => (await state(page)).stats.medal, { timeout: 40_000 }).toBe(true);
  await expect(page.locator('#prizes')).toContainText('🏅');
  expect((await state(page)).stats.longest).toBeGreaterThan(5);
  await stopChild(page);
});

test('level 9: a friend on a scooter is followed, never hit, and pulls over with a wave', async ({ page }) => {
  await reachPlay(page, atLevel(9));
  await listen(page);
  await childRides(page, { fixed: 0 });
  const from = await putBefore(page, 'scooter', { before: 50 });
  const scooter = () => page.evaluate((where) => {
    const thing = window.__game.ride.things.find((one) => one.kind === 'scooter' && one.from === where);
    return { x: thing.x, pos: thing.pos, moving: Boolean(thing.moving), aside: Boolean(thing.aside), done: thing.done };
  }, from);
  const { x } = await scooter();
  await childHolds(page, x > 0 ? 0.1 : -0.1);
  await expectSoon(async () => (await scooter()).moving, { timeout: 20_000 }).toBe(true);
  expect(await labelShown(page, 'scooter')).toBe(true);
  // Never nearer than a couple of metres, until it's out of the way.
  let nearest = Infinity;
  await expectSoon(async () => {
    const [bike, friend] = [await state(page), await scooter()];
    if (!friend.aside && !friend.done) nearest = Math.min(nearest, friend.pos - bike.s);
    return friend.aside;
  }, { timeout: 40_000 }).toBe(true);
  expect(nearest).toBeGreaterThan(2);
  await shot(page, 'moto-level-9');
  await expectSoon(async () => (await scooter()).done, { timeout: 20_000 }).toBe(true);
  expect(await heard(page)).toEqual(expect.arrayContaining(['scooter', 'scooter-aside']));
  await stopChild(page);
});

test('level 9: leaning over to the other side passes the scooter', async ({ page }) => {
  await reachPlay(page, atLevel(9));
  await childRides(page, { fixed: 0 });
  const from = await putBefore(page, 'scooter', { before: 50 });
  const x = await page.evaluate((where) => window.__game.ride.things.find((one) => one.kind === 'scooter' && one.from === where).x, from);
  await childHolds(page, x > 0 ? -0.12 : 0.12);
  await expectSoon(async () => (await state(page)).stats.passed, { timeout: 30_000 }).toBe(1);
  expect((await state(page)).stats.stops).toBe(0);
  await stopChild(page);
});

test('level 10: snow at the top, heaps of it to burst through, and the cup at the finish', async ({ page }) => {
  test.setTimeout(300_000);
  await reachPlay(page, atLevel(10));
  await listen(page);
  await childRides(page, { goFor: true });
  const { plan } = await state(page);
  expect(plan.snowFrom).toBeGreaterThan(plan.length * 0.5);
  expect(plan.snows).toBeGreaterThanOrEqual(6);
  expect(await putBefore(page, 'snow')).not.toBe(null);
  await expectSoon(async () => (await state(page)).stats.snow, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  expect(await labelShown(page, 'snow')).toBe(true);
  // Snow is falling up here.
  expect(await page.evaluate(() => window.__game.world.snowfall.visible && window.__game.world.snowfall.material.opacity > 0.5)).toBe(true);
  await shot(page, 'moto-level-10');
  await putBefore(page, 'top', { before: 60 });
  await waitForScreen(page, 'finishing');
  expect(await heard(page)).toEqual(expect.arrayContaining(['snow', 'cup', 'finished']));
  await waitForScreen(page, 'finish');
  expect((await state(page)).stats.cup).toBe(true);
  await expect(page.locator('#finish-prizes')).toContainText('won the cup');
  // The last level: there's nothing more to come.
  await expect(page.locator('#level-next-new')).toBeEmpty();
});

for (const level of [1, 10]) {
  test(`nothing flashes at level ${level}: riding through the bends and whatever is on the road, the brightness stays steady`, async ({ page }) => {
    test.setTimeout(300_000);
    await reachPlay(page, atLevel(level));
    await childRides(page, { goFor: true });
    // From the start line: setting off, and under the banner over the road.
    const start = judge(await watchBrightness(page, 300));
    console.log(`level ${level} setting off`, JSON.stringify(start));
    expect(start.biggestStep).toBeLessThan(4);
    expect(start.flickeringShare).toBeLessThan(0.01);
    await expectSoon(async () => Math.abs((await state(page)).roll), { timeout: 30_000 }).toBeGreaterThan(0.15);
    // Fifteen seconds or more of it: into a bend, through it, out, and along the straight to the next.
    const reading = judge(await watchBrightness(page, 900));
    console.log(`level ${level} on the road`, JSON.stringify(reading));
    expect(reading.biggestStep).toBeLessThan(4);
    expect(reading.flickeringShare).toBeLessThan(0.01);
    expect((await state(page)).stats.clean).toBeGreaterThanOrEqual(1);
    await stopChild(page);
  });
}

test('nothing flashes on the grass, in a jump, in the snow, or as the bike gets to the top', async ({ page }) => {
  test.setTimeout(300_000);
  await reachPlay(page, atLevel(10));
  // On the grass, with the dust coming up, and stopping to wait.
  await childRides(page, { fixed: 0 });
  await expectSoon(async () => (await state(page)).offRoad, { timeout: 30_000 }).toBe(true);
  const grass = judge(await watchBrightness(page, 300));
  console.log('on the grass', JSON.stringify(grass));
  expect(grass.biggestStep).toBeLessThan(4);
  expect(grass.flickeringShare).toBeLessThan(0.01);
  // Through the snow at the top, the finish, and the bike rolling up to its friends.
  await stopChild(page);
  await childRides(page, { goFor: true });
  await putBefore(page, 'top', { before: 170 });
  await page.waitForTimeout(400);
  const top = judge(await watchBrightness(page, 780));
  console.log('the snow and the top', JSON.stringify(top));
  expect(top.biggestStep).toBeLessThan(4);
  expect(top.flickeringShare).toBeLessThan(0.01);
  expect(['finishing', 'finish']).toContain((await state(page)).screen);
  await stopChild(page);
});

test('the bends at level 10 come on over a longer stretch than at level 1, so there is as long to lean into them', async ({ page }) => {
  await openMoto(page);
  const onset = (level) => page.evaluate((at) => import('./ride.js').then(({ layOut }) => {
    const plan = layOut({ level: at });
    const tightest = plan.bends.filter(({ big }) => !big).reduce((most, bend) => (bend.need > most.need ? bend : most));
    // Seconds from the start of the bend to its whole lean being needed, at the fastest the bike goes there.
    return { seconds: tightest.ramp / (plan.rules.cruise * 1.16), perSecond: tightest.need / (tightest.ramp / (plan.rules.cruise * 1.16)) };
  }), level);
  const [first, last] = [await onset(1), await onset(10)];
  expect(last.seconds).toBeGreaterThanOrEqual(first.seconds * 0.99);
  expect(last.perSecond).toBeLessThanOrEqual(first.perSecond * 1.05);
});
