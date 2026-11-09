// What each level of Leap Trail brings that's new: coins, trampolines, a magnet, a bubble shield,
// ducks and autumn, a key and a chest, a friend, a sunset and gems. Each is checked to appear the
// first time with its label, to work, and to be counted, and the top level to be safe to look at.
import { expect, shot, test, waitForScreen } from '../helpers.js';
import { bodyDoes, nextObstacleIs, openTrail, reachPractice, runState, standInView, steppedPicture } from './helpers.js';
import { NEW_THINGS } from '../../../games/leap-trail/run.js';

const at = (level, more = {}) => ({ levels: { 'leap-trail': level }, ...more });

/**
 * To running, with the trail's own trampolines, golden stars, power-ups, keys and chests taken away in
 * the countdown, so each test sees only what it puts down. The level's obstacles and places stay.
 */
async function reachRun(page, settings = {}) {
  await reachPractice(page, settings);
  await page.locator('#practice-skip').click();
  await waitForScreen(page, 'countdown');
  await page.evaluate(() => {
    const { run, world } = window.__game;
    for (const obstacle of run.course) {
      delete obstacle.spring;
      delete obstacle.gold;
      world.retire(obstacle);
    }
    run.pickups.length = 0;
    run.chests.length = 0;
  });
  await waitForScreen(page, 'run');
  await keepMoving(page);
}

/** To running, with the trail just as the level lays it out. */
async function reachFullRun(page, settings = {}) {
  await reachPractice(page, settings);
  await page.locator('#practice-skip').click();
  await waitForScreen(page, 'run');
  await keepMoving(page);
}

/** Clears the trail ahead of power-ups, keys and chests, so a test can put down just its own. */
const clearExtras = (page) => page.evaluate(() => {
  const { run, world } = window.__game;
  for (const pickup of run.pickups.slice(run.nextPickup)) world.dropPickup(pickup);
  run.pickups.length = run.nextPickup;
  for (const chest of run.chests) world.dropChest(chest);
  run.chests.length = 0;
});

/** A power-up or a key this far ahead, in this lane (null for a friend). */
const pickupAhead = (page, kind, gap, lane = 0) => page.evaluate(([what, ahead, where]) => {
  const { run } = window.__game;
  run.pickups.push({ kind: what, at: run.distance + ahead, lane: where, taken: false, missed: false });
  run.pickups.sort((a, b) => a.at - b.at);
}, [kind, gap, lane]);

/** A chest this far ahead, beside the trail. */
const chestAhead = (page, gap, side = 1) => page.evaluate(([ahead, where]) => {
  const { run } = window.__game;
  run.chests.push({ at: run.distance + ahead, side: where, opened: false, missed: false });
}, [gap, side]);

/** The next obstacle is this kind, with a trampoline in this lane. */
async function nextWithSpring(page, kind, gap, lane = 0, lanes = [-1, 0, 1]) {
  await nextObstacleIs(page, kind, gap, lanes);
  await page.evaluate((where) => {
    const { run, world } = window.__game;
    delete run.next.gold;
    run.next.spring = { lane: where, used: false, missed: false, gem: run.levelRules.gems };
    world.retire(run.next); // So it comes back with its trampoline.
  }, lane);
}

/**
 * The child keeps moving about, as a child playing would, so the runner never stops to wait for them
 * to rest, however slowly the test goes.
 */
const keepMoving = (page) => page.evaluate(() => {
  clearInterval(window.__moving);
  window.__moving = setInterval(() => window.__game.run?.noteActivity(), 200);
});

/** The runner goes into whichever lane window.__lane says, in place of the child stepping across. */
const steerByHand = async (page, lane = 0) => {
  await keepMoving(page);
  await page.evaluate((first) => {
    const { world, game } = window.__game;
    window.__lane = first;
    game.readLane = () => {
      world.setLane(window.__lane);
      return window.__lane;
    };
  }, lane);
};

const label = (page) => page.locator('#trail-new');
const untilInReach = (page) => expect.poll(async () => (await runState(page)).next?.inReach, { timeout: 12_000 }).toBe(true);

test('level 1 has nothing new: no coins, trampolines, power-ups or chests, and the cards say nothing new', async ({ page }) => {
  await openTrail(page);
  await expect(page.locator('#level-new')).toBeHidden();
  await standInView(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#run-start').click();
  await waitForScreen(page, 'practice');
  await page.locator('#practice-skip').click();
  await waitForScreen(page, 'run');
  await keepMoving(page);
  const laid = await page.evaluate(() => {
    const { run, world } = window.__game;
    return { pickups: run.pickups.length, chests: run.chests.length, springs: run.course.filter(({ spring }) => spring).length, place: world.place, ducks: run.levelRules.kinds.includes('ducks') };
  });
  expect(laid).toEqual({ pickups: 0, chests: 0, springs: 0, place: 'day', ducks: false });
  await expect(page.locator('.coins-chip')).toBeHidden();
  await expect(page.locator('#power-row')).toBeEmpty();
  await nextObstacleIs(page, 'log', 14);
  await untilInReach(page);
  await bodyDoes(page);
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 8000 }).toBeGreaterThanOrEqual(1);
  expect((await runState(page)).stats.coins).toBe(0);
  await expect(label(page)).not.toHaveClass(/is-showing/);
});

test('the title card says what each level brings, in its own words, and the countdown says it in Georgian', async ({ page }) => {
  // With the game's own settings: lanes, and a runner that stumbles and carries on.
  await openTrail(page, { language: 'ka', onMissed: 'stumble' });
  for (const level of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    await page.locator('#open-panel').click();
    await page.locator('#level-choice label').filter({ has: page.locator(`input[value="${level}"]`) }).click();
    await page.locator('#close-panel').click();
    const expected = NEW_THINGS[level].map(({ mark, name }) => `${mark}${name}`).join('');
    await expect(page.locator('#level-new')).toHaveText(`New:${expected}`);
    const georgian = NEW_THINGS[level].map(({ mark, nameKa }) => `${mark}${nameKa}`).join('');
    await expect(page.locator('#level-new-now')).toHaveText(`ახალი:${georgian}`);
  }
  await shot(page, 'leap-trail-l10-title');
  await page.locator('#open-panel').click();
  await page.locator('#level-choice label').filter({ has: page.locator('input[value="1"]') }).click();
  await page.locator('#close-panel').click();
  await expect(page.locator('#level-new')).toBeHidden();
});

test('level 2: clearing something drops a coin, counted at the top and on the finish card', async ({ page }) => {
  test.setTimeout(150_000);
  await openTrail(page, at(2, { onMissed: 'stumble' }));
  await expect(page.locator('#level-new')).toHaveText('New:🟡Coins');
  await shot(page, 'leap-trail-l2-title');
  await standInView(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#run-start').click();
  await waitForScreen(page, 'practice');
  await page.locator('#practice-skip').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('Coins');
  await waitForScreen(page, 'run');
  await keepMoving(page);
  await expect(page.locator('.coins-chip')).toBeVisible();
  await nextObstacleIs(page, 'hay', 16);
  await untilInReach(page);
  await bodyDoes(page);
  await expect.poll(async () => (await runState(page)).stats.coins, { timeout: 8000 }).toBe(1);
  await expect(page.locator('#coins')).toHaveText('1');
  await expect(label(page)).toHaveClass(/is-showing/);
  await expect(label(page)).toContainText('Coins');
  await page.waitForTimeout(200);
  await shot(page, 'leap-trail-l2-coin');
  // Stepping round one counts as clearing it, so that's a coin too.
  await steerByHand(page, 1);
  await nextObstacleIs(page, 'rocks', 20, [-1, 0]);
  await expect.poll(async () => (await runState(page)).stats.coins, { timeout: 10_000 }).toBe(2);
  await page.evaluate(() => {
    const { run } = window.__game;
    run.distance = run.end - 2;
    run.noteActivity();
  });
  await waitForScreen(page, 'finish');
  // Anything else gone round on the way to the end is a coin too.
  const coins = (await runState(page)).stats.coins;
  expect(coins).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#finish-coins')).toHaveText(String(coins));
  await expect(page.locator('.finish-coins')).toBeVisible();
  await expect(page.locator('#level-next-new')).toHaveText('Coming up:🌟Golden stars');
  await page.waitForTimeout(700);
  await shot(page, 'leap-trail-l2-finish');
});

test('level 3: a golden star is pointed out the first time it comes into view', async ({ page }) => {
  await reachRun(page, at(3));
  await nextObstacleIs(page, 'log', 70);
  await page.evaluate(() => {
    const { run, world } = window.__game;
    run.next.gold = { lane: 0, taken: false, missed: false };
    world.retire(run.next);
  });
  await expect(label(page)).toContainText('Golden stars', { timeout: 10_000 });
  await shot(page, 'leap-trail-l3-gold-new');
  await untilInReach(page);
  await bodyDoes(page);
  await expect.poll(async () => (await runState(page)).stats.gold, { timeout: 8000 }).toBe(1);
});

test('level 4: a trampoline\'s lane is a blue mat, and jumping from it bounces high through an arch of stars', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRun(page, at(4, { language: 'ka' }));
  await expect(page.locator('#level-badge')).toHaveText('Level 4 of 10');
  await steerByHand(page, 0);
  await nextWithSpring(page, 'fence', 75, 0);
  await expect(label(page)).toContainText('ბატუტები', { timeout: 10_000 });
  await expect(label(page)).toContainText('ახალი:');
  await expect.poll(async () => (await runState(page)).next?.gap, { timeout: 10_000, intervals: [50] }).toBeLessThan(32);
  await shot(page, 'leap-trail-l4-trampoline-ahead');
  const shown = await page.evaluate(() => {
    const { run, world } = window.__game;
    const item = world.items.get(run.next);
    const mat = item.zone.children.find((piece) => piece.material?.color?.getHexString() === '3d9cf0');
    return { mat: Boolean(mat), arch: item.arch.sprites.length, highest: Math.max(...item.arch.sprites.map((sprite) => sprite.position.y)) };
  });
  expect(shown.mat).toBe(true);
  expect(shown.arch).toBe(5);
  expect(shown.highest).toBeGreaterThan(2.8);
  const before = (await runState(page)).stats;
  await untilInReach(page);
  const height = await page.evaluate(() => {
    const { run } = window.__game;
    run.jump();
    return run.move.bounce ? run.move.height : 0;
  });
  await page.waitForTimeout(150);
  await shot(page, 'leap-trail-l4-bounce');
  expect(height).toBeGreaterThan(2);
  await expect.poll(async () => (await runState(page)).stats.bounces, { timeout: 8000 }).toBe(1);
  const after = (await runState(page)).stats;
  expect(after.stars - before.stars).toBe(3 + 5);
  expect(after.coins - before.coins).toBe(1);

  // From another lane, it's an ordinary jump: no bounce, and it costs nothing.
  await nextWithSpring(page, 'hay', 40, 1);
  await untilInReach(page);
  await bodyDoes(page);
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 8000 }).toBe(after.cleared + 1);
  const last = (await runState(page)).stats;
  expect([last.bounces, last.bumps, last.streak]).toEqual([1, 0, after.streak + 1]);
});

test('level 5: a magnet pulls in the stars from the other lanes while it lasts', async ({ page }) => {
  await reachRun(page, at(5));
  await steerByHand(page, 0);
  await clearExtras(page);
  await nextObstacleIs(page, 'log', 400);
  await pickupAhead(page, 'magnet', 40, 0);
  await expect(label(page)).toContainText('Magnet', { timeout: 10_000 });
  await page.waitForTimeout(400);
  await shot(page, 'leap-trail-l5-magnet-ahead');
  await expect.poll(async () => (await runState(page)).stats.powers, { timeout: 10_000 }).toBe(1);
  await expect(page.locator('.power-pill[data-kind="magnet"]')).toBeVisible();
  // The next six stars are all in the right-hand lane, and the runner stays in the middle. The magnet
  // starts its six seconds again here, so a slow computer running the test can't use it up first.
  await page.evaluate(async () => {
    const { POWERS } = await import('/games/leap-trail/run.js');
    const { run } = window.__game;
    run.power.magnet = POWERS.magnet.seconds;
    window.__placed = run.starLines.slice(run.nextStar, run.nextStar + 6);
    window.__placed.forEach((star, index) => {
      star.lane = 1;
      star.at = run.distance + 6 + index * 2.6;
    });
    run.starLines.sort((a, b) => a.at - b.at);
  });
  await page.waitForTimeout(500);
  await shot(page, 'leap-trail-l5-magnet-pulling');
  await expect.poll(() => page.evaluate(() => window.__placed.filter(({ taken }) => taken).length), { timeout: 6000 }).toBe(6);
  expect(await page.evaluate(() => window.__placed.every(({ pulled }) => pulled))).toBe(true);
  expect((await runState(page)).lane).toBe(0);
  // It runs out, and then stars in another lane go by again.
  await expect.poll(() => page.evaluate(() => window.__game.run.power.magnet), { timeout: 15_000 }).toBe(0);
  await expect(page.locator('.power-pill[data-kind="magnet"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__game.world.magnetBadge.visible)).toBe(false);
});

test('level 6: a bubble shield floats the runner over what it would run into, keeping the streak', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRun(page, at(6, { onMissed: 'stumble' }));
  await steerByHand(page, 0);
  await clearExtras(page);
  await nextObstacleIs(page, 'bale', 90);
  await pickupAhead(page, 'shield', 30, 0);
  await expect(label(page)).toContainText('Bubble shield', { timeout: 10_000 });
  await expect.poll(async () => (await runState(page)).stats.powers, { timeout: 10_000 }).toBe(1);
  await expect(page.locator('.power-pill[data-kind="shield"]')).toBeVisible();
  expect(await page.evaluate(() => window.__game.world.bubble.visible)).toBe(true);
  await page.waitForTimeout(600);
  await shot(page, 'leap-trail-l6-bubble');
  // Nobody jumps: the bubble takes the runner over, and pops.
  await expect.poll(async () => (await runState(page)).stats.floated, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(150);
  await shot(page, 'leap-trail-l6-float');
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 8000 }).toBe(1);
  const { stats } = await runState(page);
  expect([stats.bumps, stats.streak, stats.jumps]).toEqual([0, 1, 0]);
  expect(await page.evaluate(() => window.__game.world.bubble.visible)).toBe(false);
  // The next one is run into, as there's no bubble now.
  await nextObstacleIs(page, 'log', 30);
  await expect.poll(async () => (await runState(page)).stats.bumps, { timeout: 10_000 }).toBe(1);
});

test('level 7: ducks waddle over into their lane and settle before it counts, in autumn', async ({ page }) => {
  await reachRun(page, at(7));
  expect(await page.evaluate(() => window.__game.world.place)).toBe('autumn');
  await expect(label(page)).toContainText('Autumn', { timeout: 5000 });
  await nextObstacleIs(page, 'ducks', 70, [0]);
  await page.waitForTimeout(400);
  const walking = await page.evaluate(() => {
    const { run, world } = window.__game;
    return world.items.get(run.next).model.userData.walking.position.x;
  });
  expect(Math.abs(walking)).toBeGreaterThan(1);
  await expect(label(page)).toContainText('Ducks', { timeout: 10_000 });
  await shot(page, 'leap-trail-l7-ducks-coming');
  await untilInReach(page);
  const settled = await page.evaluate(() => {
    const { run, world } = window.__game;
    return world.items.get(run.next).model.userData.walking.position.x;
  });
  expect(settled).toBe(0);
  const leaves = await page.evaluate(() => window.__game.world.leaves.filter((leaf) => leaf.visible).length);
  expect(leaves).toBeGreaterThan(10);
  await shot(page, 'leap-trail-l7-ducks-ask');
  await bodyDoes(page);
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 8000 }).toBe(1);
});

test('level 8: a key picked up in its lane opens a chest further on, full of coins', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRun(page, at(8));
  await steerByHand(page, 0);
  await clearExtras(page);
  await nextObstacleIs(page, 'sheep', 400);
  await pickupAhead(page, 'key', 30, 0);
  await chestAhead(page, 90, 1);
  // Where the chest is on the screen at the moment it opens, so a child sees it open.
  await page.evaluate(async () => {
    const THREE = await import('/vendor/three/three.module.js');
    const { game, world } = window.__game;
    const before = game.onRunEvent.bind(game);
    game.onRunEvent = (event) => {
      before(event);
      if (event.type !== 'chest') return;
      const at = new THREE.Vector3();
      world.chestModels.get(event.chest).getWorldPosition(at);
      window.__chestOnScreen = at.project(world.camera).toArray();
    };
  });
  await expect(label(page)).toContainText('Key and chest', { timeout: 10_000 });
  await shot(page, 'leap-trail-l8-key-ahead');
  await expect.poll(async () => (await runState(page)).stats.keys, { timeout: 10_000 }).toBe(1);
  await expect(page.locator('.power-pill[data-kind="key"]')).toBeVisible();
  const coins = (await runState(page)).stats.coins;
  await page.waitForTimeout(1500);
  await shot(page, 'leap-trail-l8-chest-ahead');
  await expect.poll(async () => (await runState(page)).stats.chests, { timeout: 10_000 }).toBe(1);
  await page.waitForTimeout(250);
  await shot(page, 'leap-trail-l8-chest-open');
  expect((await runState(page)).stats.coins - coins).toBe(8);
  const [x, y, depth] = await page.evaluate(() => window.__chestOnScreen);
  expect(Math.abs(x)).toBeLessThan(0.95);
  expect(Math.abs(y)).toBeLessThan(0.95);
  expect(depth).toBeLessThan(1);
  await expect(page.locator('.power-pill[data-kind="key"]')).toHaveCount(0);
  // A key missed in another lane leaves the next chest shut, and that costs nothing.
  await pickupAhead(page, 'key', 20, 1);
  await chestAhead(page, 50, -1);
  await page.waitForTimeout(4500);
  const { stats } = await runState(page);
  expect([stats.keys, stats.chests, stats.bumps]).toEqual([1, 1, 0]);
});

test('level 9: a friend comes running alongside and catches a star for each one caught', async ({ page }) => {
  await reachRun(page, at(9));
  await steerByHand(page, 0);
  await clearExtras(page);
  await nextObstacleIs(page, 'log', 400);
  await pickupAhead(page, 'friend', 8, null);
  await expect.poll(async () => (await runState(page)).stats.powers, { timeout: 10_000 }).toBe(1);
  await expect(label(page)).toContainText('Running friend', { timeout: 5000 });
  await page.evaluate(() => {
    const { run } = window.__game;
    run.starLines.slice(run.nextStar, run.nextStar + 4).forEach((star, index) => {
      star.lane = 0;
      star.at = run.distance + 10 + index * 2.6;
    });
    run.starLines.sort((a, b) => a.at - b.at);
  });
  await page.waitForTimeout(1300);
  await shot(page, 'leap-trail-l9-friend');
  const friend = await page.evaluate(() => {
    const { world } = window.__game;
    return { id: world.friend.spec.id, shown: world.friend.body.root.visible, x: world.friend.body.root.position.x };
  });
  expect(friend.id).toBe('truffle'); // Joze is running, so it's Truffle who comes along.
  expect(friend.shown).toBe(true);
  expect(friend.x).toBeLessThan(-2.5);
  await expect.poll(async () => (await runState(page)).stats.friendStars, { timeout: 8000 }).toBeGreaterThanOrEqual(4);
  // The top of the screen counts the friend's stars too.
  const counted = await page.evaluate(() => {
    const { stats } = window.__game.run;
    return [Number(document.getElementById('stars').textContent), stats.stars + stats.linedStars + stats.friendStars];
  });
  expect(counted[0]).toBe(counted[1]);
});

test('level 10: a sunset, and a gem at the top of a trampoline\'s arch', async ({ page }) => {
  await reachRun(page, at(10));
  expect(await page.evaluate(() => window.__game.world.place)).toBe('sunset');
  await expect(label(page)).toContainText('Sunset', { timeout: 5000 });
  await steerByHand(page, 0);
  await clearExtras(page);
  await nextWithSpring(page, 'ducks', 80, 0);
  await expect(label(page)).toContainText('Gems', { timeout: 12_000 });
  await expect.poll(async () => (await runState(page)).next?.gap, { timeout: 10_000, intervals: [50] }).toBeLessThan(34);
  await shot(page, 'leap-trail-l10-gem-ahead');
  const before = (await runState(page)).stats;
  await untilInReach(page);
  await bodyDoes(page);
  await page.waitForTimeout(400);
  await shot(page, 'leap-trail-l10-gem-bounce');
  await expect.poll(async () => (await runState(page)).stats.gems, { timeout: 8000 }).toBe(1);
  const after = (await runState(page)).stats;
  expect(after.coins - before.coins).toBe(1 + 5);
});

/**
 * Plays a run the way a child catching everything would: in the lane of the next star, trampoline,
 * golden star or power-up, round what leaves a lane free, and jumping when a jump counts.
 */
const followEverything = (page) => page.evaluate(() => {
  const { world, game } = window.__game;
  window.__lane = 0;
  game.readLane = () => {
    world.setLane(window.__lane);
    return window.__lane;
  };
  window.__follow = setInterval(() => {
    const { run } = window.__game;
    if (run?.state !== 'running') return;
    const star = run.starLines[run.nextStar];
    const pickup = run.pickups[run.nextPickup];
    const next = run.next;
    const targets = [];
    if (star) targets.push({ at: star.at, lane: star.lane });
    if (pickup && pickup.lane !== null) targets.push({ at: pickup.at, lane: pickup.lane });
    if (next && next.state === 'ahead') {
      const special = next.spring?.lane ?? next.gold?.lane;
      if (special !== undefined) targets.push({ at: next.at - 3, lane: special });
    }
    targets.sort((a, b) => a.at - b.at);
    let wanted = targets[0]?.lane ?? run.lane;
    if (next && next.state === 'ahead' && run.gapTo(next) < 25 && next.lanes.length < 3 && next.lanes.includes(wanted) && next.spring?.lane !== wanted && next.gold?.lane !== wanted) {
      wanted = [-1, 0, 1].filter((lane) => !next.lanes.includes(lane)).sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted))[0];
    }
    // Once a jump counts, to the trampoline or the golden star first, and then the jump.
    const special = next?.spring?.lane ?? next?.gold?.lane;
    if (next && next.state === 'ahead' && run.inReach(next) && special !== undefined && run.lane !== special) {
      window.__lane = special;
      return;
    }
    window.__lane = wanted;
    if (next && next.state === 'ahead' && run.inReach(next) && run.mustJump) run.jump();
  }, 40);
});

test('level 10 can be finished catching prizes, and the finish card counts them', async ({ page }) => {
  test.setTimeout(240_000);
  await reachFullRun(page, at(10, { obstacles: 20, onMissed: 'stumble' }));
  const laid = await page.evaluate(() => {
    const { run } = window.__game;
    return { springs: run.course.filter(({ spring }) => spring).length, kinds: run.pickups.map(({ kind }) => kind), chests: run.chests.length };
  });
  expect(laid.kinds).toEqual(expect.arrayContaining(['magnet', 'shield', 'friend', 'key']));
  expect(laid.chests).toBeGreaterThan(0);
  await followEverything(page);
  await page.waitForTimeout(9000);
  await shot(page, 'leap-trail-l10-following');
  await waitForScreen(page, 'finish');
  await page.evaluate(() => clearInterval(window.__follow));
  const { stats } = await runState(page);
  console.log('level 10 prizes', JSON.stringify({ laid, stats }));
  expect(stats.cleared).toBe(20);
  expect(stats.bumps).toBe(0);
  expect(stats.coins).toBeGreaterThanOrEqual(20);
  expect(stats.powers).toBeGreaterThanOrEqual(3);
  expect(stats.chests).toBeGreaterThan(0);
  expect(stats.bounces).toBe(laid.springs);
  await expect(page.locator('#finish-coins')).toHaveText(String(stats.coins));
  await expect(page.locator('#finish-prizes')).toContainText('opened');
  await expect(page.locator('#finish-prizes')).toContainText('power-up');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await page.waitForTimeout(800);
  await shot(page, 'leap-trail-l10-finish');
});

/** The picture's overall brightness, frame by frame, jumping whenever a jump counts. */
const brightnessWhileJumping = (page, frames) => page.evaluate(async (count) => {
  const { world } = window.__game;
  const reading = [];
  const small = document.createElement('canvas');
  small.width = 32;
  small.height = 18;
  const context = small.getContext('2d', { willReadFrequently: true });
  for (let i = 0; i < count; i += 1) {
    const { run } = window.__game;
    if (run.next && run.inReach(run.next) && run.next.state === 'ahead') run.jump();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    world.render();
    context.drawImage(world.renderer.domElement, 0, 0, 32, 18);
    const { data } = context.getImageData(0, 0, 32, 18);
    let total = 0;
    for (let j = 0; j < data.length; j += 4) total += (data[j] + data[j + 1] + data[j + 2]) / 3;
    reading.push(total / (32 * 18));
  }
  return reading;
}, frames);

const biggestStep = (reading) => Math.max(...reading.slice(1).map((value, index) => Math.abs(value - reading[index])));

for (const level of [6, 10]) {
  test(`level ${level}: nothing flashes with every new thing on screen, through a bounce, a bubble and a chest`, async ({ page }) => {
    test.setTimeout(150_000);
    await reachRun(page, at(level, { onMissed: 'stumble' }));
    await steerByHand(page, 0);
    await clearExtras(page);
    // Everything this level has, at once: power-ups on the runner, a chest, a trampoline and its arch.
    await page.evaluate(() => {
      const { run } = window.__game;
      for (const kind of run.levelRules.powers) {
        run.power[kind] = 30;
        window.__game.game.onRunEvent({ type: 'power', kind, pickup: { kind, lane: kind === 'friend' ? null : 0 } });
      }
    });
    await nextWithSpring(page, level >= 7 ? 'ducks' : 'bale', 70, 0);
    await chestAhead(page, 60, 1);
    await pickupAhead(page, 'magnet', 25, 1);
    if (level >= 8) await pickupAhead(page, 'key', 20, 0);
    const reading = await brightnessWhileJumping(page, 300);
    await shot(page, `leap-trail-l${level}-everything`);
    const { stats } = await runState(page);
    expect(stats.bounces).toBe(1);
    console.log(`level ${level}: biggest brightness step with everything on screen`, biggestStep(reading));
    expect(biggestStep(reading)).toBeLessThan(25);

    // The bubble popping as it floats the runner over, without a jump. (It may already have floated
    // the runner over something above, as the test puts obstacles closer together than a trail does.)
    const floated = (await runState(page)).stats.floated;
    await page.evaluate(() => {
      const { run } = window.__game;
      run.power.shield = 10;
      window.__game.world.setPower('shield', true);
    });
    await nextObstacleIs(page, 'log', 30);
    const popping = await page.evaluate(async () => {
      const { world } = window.__game;
      const reading = [];
      const small = document.createElement('canvas');
      small.width = 32;
      small.height = 18;
      const context = small.getContext('2d', { willReadFrequently: true });
      for (let i = 0; i < 200; i += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        world.render();
        context.drawImage(world.renderer.domElement, 0, 0, 32, 18);
        const { data } = context.getImageData(0, 0, 32, 18);
        let total = 0;
        for (let j = 0; j < data.length; j += 4) total += (data[j] + data[j + 1] + data[j + 2]) / 3;
        reading.push(total / (32 * 18));
      }
      return reading;
    });
    await expect.poll(async () => (await runState(page)).stats.floated, { timeout: 10_000 }).toBe(floated + 1);
    console.log(`level ${level}: biggest brightness step through a bubble popping`, biggestStep(popping));
    expect(biggestStep(popping)).toBeLessThan(25);
  });
}

test('level 10 with reduced motion: no leaves fall, ducks don\'t waddle, and prizes still work', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachRun(page, at(10));
  await steerByHand(page, 0);
  await clearExtras(page);
  await nextWithSpring(page, 'ducks', 60, 0);
  await page.waitForTimeout(400);
  const still = await page.evaluate(() => {
    const { run, world } = window.__game;
    return { walking: world.items.get(run.next).model.userData.walking.position.x, leaves: world.leaves.filter((leaf) => leaf.visible).length };
  });
  expect(still).toEqual({ walking: 0, leaves: 0 });
  await untilInReach(page);
  // How high the camera goes with the bounce.
  await page.evaluate(() => {
    window.__highest = 0;
    window.__watching = setInterval(() => {
      window.__highest = Math.max(window.__highest, window.__game.world.camera.position.y);
    }, 16);
  });
  const height = await page.evaluate(() => {
    const { run } = window.__game;
    run.jump();
    return run.move.bounce ? run.move.height : 0;
  });
  await expect.poll(async () => (await runState(page)).stats.bounces, { timeout: 8000 }).toBe(1);
  await page.waitForTimeout(1500);
  const highest = await page.evaluate(() => {
    clearInterval(window.__watching);
    return window.__highest;
  });
  console.log('reduced motion: a bounce of', height, 'took the camera up to', highest);
  expect(height).toBeGreaterThan(2);
  // No more than for an ordinary jump: before, a bounce took it up about two metres, from 3.
  expect(highest).toBeLessThan(3 + 0.14 * height + 0.1);
});

test('level 10: the sounds for trampolines, power-ups, chests and the bubble play, all at once without clipping', async ({ page }) => {
  await reachRun(page, at(10, { sound: true, voice: false }));
  const peak = await page.evaluate(async () => {
    const { sound } = window.__game;
    await sound.ready;
    const tap = sound.context.createAnalyser();
    tap.fftSize = 2048;
    sound.output.connect(tap);
    const samples = new Float32Array(2048);
    let loudest = 0;
    const listen = setInterval(() => {
      tap.getFloatTimeDomainData(samples);
      for (const sample of samples) loudest = Math.max(loudest, Math.abs(sample));
    }, 15);
    // Everything at once, twice over, on top of the music.
    for (let i = 0; i < 2; i += 1) {
      sound.bounce();
      sound.pickedUp();
      sound.chest();
      sound.bubblePop();
      sound.coin();
      sound.gold();
      sound.cleared();
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    clearInterval(listen);
    return loudest;
  });
  console.log('level 10: loudest with every new sound at once', peak);
  expect(peak).toBeGreaterThan(0.05);
  expect(peak).toBeLessThanOrEqual(1);
});

test('level 10 keeps up: at least about 30 frames a second with the tracker running and every new thing on screen', async ({ page }) => {
  test.setTimeout(120_000);
  await reachRun(page, at(10, { onMissed: 'stumble' }));
  await steerByHand(page, 0);
  await page.evaluate(() => {
    const { run } = window.__game;
    for (const kind of run.levelRules.powers) {
      run.power[kind] = 60;
      window.__game.game.onRunEvent({ type: 'power', kind, pickup: { kind, lane: kind === 'friend' ? null : 0 } });
    }
  });
  await nextWithSpring(page, 'ducks', 70, 0);
  await chestAhead(page, 50, 1);
  await pickupAhead(page, 'key', 30, 0);
  await pickupAhead(page, 'magnet', 40, 1);
  await page.waitForTimeout(500);
  const measured = await page.evaluate(() => new Promise((done) => {
    const { world } = window.__game;
    const gaps = [];
    let last = performance.now();
    const tick = (now) => {
      gaps.push(now - last);
      last = now;
      const { run } = window.__game;
      if (run.next && run.inReach(run.next) && run.next.state === 'ahead') run.jump();
      if (gaps.length < 240) requestAnimationFrame(tick);
      else {
        const sorted = [...gaps].sort((a, b) => a - b);
        done({
          fps: 1000 / (gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length),
          slowest: sorted[Math.floor(sorted.length * 0.95)],
          quality: world.quality,
          calls: world.renderer.info.render.calls,
          triangles: world.renderer.info.render.triangles,
        });
      }
    };
    requestAnimationFrame(tick);
  }));
  console.log('level 10: frame rate with everything', JSON.stringify(measured));
  await shot(page, 'leap-trail-l10-frame-rate');
  expect(measured.fps).toBeGreaterThan(28);
});

/* ---------- what review found ---------- */

test('level 4: a trampoline, golden star and power-up missed from another lane fade before they reach the camera, so nothing sweeps across the lens', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRun(page, at(4, { onMissed: 'stumble' }));
  await clearExtras(page);
  // In the middle lane, so they pass right where the camera is when the runner is in the left one.
  await nextWithSpring(page, 'hay', 30, 0);
  await page.evaluate(() => {
    const { run, world } = window.__game;
    run.next.gold = { lane: 0, taken: false, missed: false };
    world.retire(run.next);
  });
  await pickupAhead(page, 'magnet', 36, 0);
  const seen = await steppedPicture(page, 200, { lane: -1 });
  const missed = await page.evaluate(() => {
    const { run } = window.__game;
    const hay = run.course.find(({ spring }) => spring);
    return [hay.spring.missed, hay.gold.missed, run.pickups.at(-1).missed];
  });
  expect(missed).toEqual([true, true, true]);
  console.log('level 4: a missed arch going past the camera', JSON.stringify(seen));
  // None of it comes within 2 m of the lens while it shows. Before, the arch's stars went right past it.
  expect(seen.closest).toBeGreaterThanOrEqual(2);
  // And no frame changes more than 30% of the picture: before, the arch alone changed nearly half of it.
  expect(seen.share).toBeLessThan(0.3);
  expect(seen.step).toBeLessThan(25);
});

test('level 7: an autumn leaf on its way to the camera fades before it gets there', async ({ page }) => {
  await reachRun(page, at(7, { onMissed: 'stumble' }));
  await nextObstacleIs(page, 'log', 400);
  await page.evaluate(() => {
    const { world } = window.__game;
    // Every leaf straight at the lens, one after another.
    world.leaves.forEach((leaf, index) => Object.assign(leaf.userData, { x: world.camera.position.x, y: world.camera.position.y + 0.5, z: world.camera.position.z - 8 - index * 1.5, phase: 0 }));
  });
  const seen = await steppedPicture(page, 150, { jump: false, lane: 0 });
  console.log('level 7: leaves going past the camera', JSON.stringify(seen));
  expect(seen.closest).toBeGreaterThanOrEqual(2);
  expect(seen.share).toBeLessThan(0.3);
});

test('level 10: whatever comes along is in its place the first time it\'s drawn, never for a moment at the runner', async ({ page }) => {
  test.setTimeout(150_000);
  await reachFullRun(page, at(10, { onMissed: 'stumble' }));
  const wrong = await page.evaluate(async () => {
    const { run, world } = window.__game;
    const found = [];
    const render = world.render.bind(world);
    // Before each picture, everything for an obstacle well ahead has to be well ahead too.
    world.render = () => {
      for (const [obstacle, item] of world.items) {
        const ahead = obstacle.at - run.distance;
        if (ahead < 25) continue;
        const sprites = [...item.stars.map(({ sprite }) => sprite), ...(item.gold ? [item.gold.sprite] : []), ...(item.arch?.sprites ?? []), ...(item.arch?.gem ? [item.arch.gem] : [])];
        const nearest = Math.max(item.model.position.z, ...sprites.filter(({ visible }) => visible).map(({ position }) => position.z));
        if (nearest > -12) found.push(`${obstacle.kind} ${Math.round(ahead)} m ahead drawn at ${nearest.toFixed(1)}`);
      }
      render();
    };
    // Some go and come back, as they do when a test or a trail lays them again, with their trampolines,
    // golden stars and gems.
    for (let i = 0; i < 40; i += 1) {
      for (const obstacle of run.course.filter(({ state }) => state === 'ahead').slice(0, 4)) world.retire(obstacle);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    world.render = render;
    return found;
  });
  expect(wrong).toEqual([]);
});

test('level 8: something new on the very first obstacle is pointed out once the run starts', async ({ page }) => {
  await reachPractice(page, at(8));
  await page.locator('#practice-skip').click();
  await waitForScreen(page, 'countdown');
  // Sheep first of all, near enough to be seen in the countdown.
  await page.evaluate(async () => {
    const { OBSTACLES } = await import('/games/leap-trail/run.js');
    const { run, world } = window.__game;
    for (const obstacle of run.course.slice(0, 2)) {
      world.retire(obstacle);
      const kind = obstacle.index === 0 ? 'sheep' : 'log';
      Object.assign(obstacle, OBSTACLES[kind], { kind });
    }
    run.course[0].at = 40;
  });
  await page.waitForTimeout(400);
  await waitForScreen(page, 'run');
  await keepMoving(page);
  await expect(label(page)).toContainText('Sheep', { timeout: 5000 });
});

test('the label for something new waits while the grown-ups\' panel is open, rather than running out behind it', async ({ page }) => {
  await reachRun(page, at(7));
  await expect(label(page)).toContainText('Autumn', { timeout: 5000 });
  await page.locator('#open-panel').click();
  await page.waitForTimeout(3500);
  await page.locator('#close-panel').click();
  await expect(label(page)).toHaveClass(/is-showing/);
  await expect(label(page)).toContainText('Autumn');
  // And then it goes as usual, maybe for the next new thing.
  await expect.poll(() => page.evaluate(() => {
    const shown = document.getElementById('trail-new');
    return !shown.classList.contains('is-showing') || !shown.textContent.includes('Autumn');
  }), { timeout: 5000 }).toBe(true);
});

test('the cards only promise what the settings bring: no magnet or lane-changing stars with the lanes off, and no bubble for a runner that waits', async ({ page }) => {
  await openTrail(page, at(5, { trailLanes: 'yes', onMissed: 'stumble' }));
  await expect(page.locator('#level-new')).toHaveText('New:🧲Magnet↔️Stars change lanes');
  const choose = async (name, value) => {
    await page.locator('#open-panel').click();
    await page.locator(`input[name="${name}"][value="${value}"]`).check();
    await page.locator('#close-panel').click();
  };
  await choose('trailLanes', 'no');
  await expect(page.locator('#level-new')).toBeHidden();
  await choose('game-level', '6');
  await expect(page.locator('#level-new')).toHaveText('New:🌾Rolling bales🫧Bubble shield');
  await choose('onMissed', 'wait');
  await expect(page.locator('#level-new')).toHaveText('New:🌾Rolling bales');
  // And the trail itself has no bubble on it, set like that.
  await standInView(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#run-start').click();
  await waitForScreen(page, 'practice');
  await page.locator('#practice-skip').click();
  await waitForScreen(page, 'countdown');
  expect(await page.evaluate(() => window.__game.run.pickups.filter(({ kind }) => kind === 'shield').length)).toBe(0);
});

test('level 7: ducks run into waddle off out of the way, rather than being knocked over', async ({ page }) => {
  await reachRun(page, at(7, { onMissed: 'stumble' }));
  await nextObstacleIs(page, 'ducks', 40, [0]);
  const { bumps, tipped, aside, facing, waddled } = await page.evaluate(async () => {
    const { run, world, game } = window.__game;
    const ducks = run.next;
    let most = 0;
    const turns = new Set();
    const wobble = new Set();
    let aside = 0;
    game.paused = true;
    run.setLane(0);
    world.setLane(0);
    for (let i = 0; i < 240; i += 1) {
      run.noteActivity();
      run.update(1 / 60);
      world.update(1 / 60);
      const item = world.items.get(ducks);
      if (item && ducks.state === 'bumped') {
        most = Math.max(most, Math.abs(item.model.rotation.z));
        aside = Math.max(aside, Math.abs(item.model.position.x));
        for (const duck of item.model.userData.ducks) {
          turns.add(Math.round(duck.rotation.y * 100) / 100);
          wobble.add(Math.round(duck.rotation.z * 100));
        }
      }
    }
    game.paused = false;
    return { bumps: run.stats.bumps, tipped: most, aside, facing: [...turns], waddled: wobble.size };
  });
  expect(bumps).toBe(1);
  expect(tipped).toBe(0);
  expect(aside).toBeGreaterThan(5);
  // All facing the way they go, waddling as they go.
  expect(facing).toHaveLength(1);
  expect(waddled).toBeGreaterThan(3);
});

test('level 9: the friend hops over a chest on its side of the trail, rather than running through it', async ({ page }) => {
  await reachRun(page, at(9));
  await clearExtras(page);
  await nextObstacleIs(page, 'log', 400);
  await page.evaluate(() => {
    const { run } = window.__game;
    run.power.friend = 30;
    window.__game.game.onRunEvent({ type: 'power', kind: 'friend', pickup: { kind: 'friend', lane: null } });
  });
  await page.waitForTimeout(1500);
  await chestAhead(page, 40, -1);
  const highest = await page.evaluate(() => {
    const { run, world, game } = window.__game;
    let over = 0;
    game.paused = true;
    run.setLane(0);
    world.setLane(0);
    for (let i = 0; i < 300; i += 1) {
      run.noteActivity();
      run.update(1 / 60);
      world.update(1 / 60);
      const [chest] = [...world.chestModels.values()];
      if (chest && Math.abs(chest.position.z - world.friend.body.root.position.z) < 0.3) over = Math.max(over, world.friend.pose.up);
    }
    game.paused = false;
    return over;
  });
  // Over the top of the chest, which is about 1.1 m high.
  expect(highest).toBeGreaterThan(1.2);
});

test('level 7: after an autumn run, choosing a runner and practising are on a summer\'s day again, and the trees change colour without being made again', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRun(page, at(7));
  const before = await page.evaluate(() => {
    const { world } = window.__game;
    window.__strips = world.strips;
    return world.place;
  });
  expect(before).toBe('autumn');
  // Quick to change, both ways.
  const took = await page.evaluate(() => {
    const { world } = window.__game;
    const times = [];
    for (const place of ['day', 'autumn']) {
      const start = performance.now();
      world.setPlace(place);
      times.push(performance.now() - start);
    }
    return times;
  });
  console.log('changing the time of year took (ms)', JSON.stringify(took));
  for (const time of took) expect(time).toBeLessThan(80);
  /** How much of the trees on the strips is in autumn colours. */
  const autumnShare = () => page.evaluate(async () => {
    const THREE = await import('/vendor/three/three.module.js');
    const { world } = window.__game;
    const autumn = ['#e8923a', '#d9673b', '#f0b847', '#f2a54a', '#e07b3c'].map((colour) => new THREE.Color(colour));
    const summer = ['#5fb954', '#6cc25e', '#54ad50', '#6ec964', '#62bc58'].map((colour) => new THREE.Color(colour));
    let fall = 0;
    let green = 0;
    for (const strip of world.strips) {
      const values = strip.geometry.attributes.color.array;
      for (let i = 0; i < values.length; i += 3) {
        const is = (colour) => Math.abs(values[i] - colour.r) < 1e-5 && Math.abs(values[i + 1] - colour.g) < 1e-5 && Math.abs(values[i + 2] - colour.b) < 1e-5;
        if (autumn.some(is)) fall += 1;
        else if (summer.some(is)) green += 1;
      }
    }
    return { fall, green, same: world.strips.every((strip, index) => strip === window.__strips[index]) };
  });
  const inAutumn = await autumnShare();
  expect(inAutumn.fall).toBeGreaterThan(1000);
  expect(inAutumn.green).toBe(0);
  expect(inAutumn.same).toBe(true);
  await page.evaluate(() => {
    const { run } = window.__game;
    for (const obstacle of run.course) obstacle.state = 'cleared';
    run.distance = run.end - 2;
  });
  await waitForScreen(page, 'finish');
  await page.locator('#other-runner').click();
  await waitForScreen(page, 'choose');
  expect(await page.evaluate(() => [window.__game.world.place, window.__game.world.scene.fog.color.getHexString()])).toEqual(['day', 'd4f0ff']);
  const inSummer = await autumnShare();
  expect(inSummer.fall).toBe(0);
  expect(inSummer.green).toBe(inAutumn.fall);
  expect(inSummer.same).toBe(true);
  await page.waitForTimeout(800);
  await shot(page, 'leap-trail-l7-choose-again');
});
