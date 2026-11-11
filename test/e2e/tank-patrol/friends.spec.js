// Playing Tank Patrol with a friend: two children, each on their own computer with their own camera, and each
// one of the two tanks, with no robot tanks. Each game drives its own tank, the friend's is where their game
// says, and a hit is decided by the game of the tank that fired it, which tells the other. Here they're two
// separate browsers, talking through the race server on this computer (tools/race-server.mjs).
import { expect, shot, show, test, waitForScreen } from '../helpers.js';
import { biggestStep, brightnessThrough, openPatrol, pointAt, startPatrol, stopPointing } from './helpers.js';

const OPEN = [null, 'open', { scale: 0.7 }];

/** Another player, in a browser of their own, with the same checks for errors. */
async function secondPlayer(browser) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`logged: ${message.text()}`);
  });
  return { context, page, errors };
}

/** A grown-up makes a game, and gets its code. */
async function makeGame(page, name) {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  // A name, if they'd like one, once they're in.
  if (name) {
    await page.locator('#friends-name').fill(name);
    await page.locator('#friends-name').dispatchEvent('change');
  }
  return page.locator('#friends-code-shown').textContent();
}

/** Both get through the hand check and wait for each other, and then both play. */
async function bothPlaying(page, other) {
  for (const each of [page, other]) {
    await show(each, ...OPEN);
    await each.locator('#start').click();
  }
  await waitForScreen(page, 'playing');
  await waitForScreen(other, 'playing');
}

/** How the battle is on one child's screen. */
const battleOf = (page) => page.evaluate(() => {
  const { game, patrol, field, session } = window.__game;
  const { tank, friend } = patrol;
  return {
    battle: Boolean(game.battle),
    seconds: game.battle?.seconds ?? null,
    drive: patrol.pace.drive,
    help: patrol.help.radius,
    robots: patrol.enemies.length + patrol.queue.length,
    slot: patrol.slot ?? null,
    mine: patrol.score?.mine ?? null,
    theirs: patrol.score?.theirs ?? null,
    shots: patrol.stats.shots,
    resting: patrol.resting,
    tank: { x: tank.x, z: tank.z, heading: tank.heading, turret: tank.turret },
    friend: friend ? { x: friend.x, z: friend.z, heading: friend.heading, turret: friend.turret, resting: friend.resting } : null,
    friendShown: Boolean(field.friendTank?.visible),
    friendName: field.friendName,
    ownLevel: session.levels.current,
  };
});

const inRange = (page) => page.evaluate(() => {
  const { patrol } = window.__game;
  return patrol.inRange(patrol.friend);
});

const turnOff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const titleFor = (mine, theirs) => (mine > theirs ? 'You won!' : mine === theirs ? 'You both won!' : 'Great game!');

test('two friends battle from their own computers: each tank where it really is on both screens, and each hit counting for whoever made it on both', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openPatrol(page, { tanks: 6, pace: 'fast', levels: { 'tank-patrol': 4 } });
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#tanks=${code}`);

  // The friend has their own number of tanks, speed and reach help, but plays the host's battle.
  const ben = await secondPlayer(browser);
  await openPatrol(ben.page, { tanks: 15, pace: 'slow', reach: 'lots' }, `#tanks=${code}`);
  await ben.page.locator('#friends-name').fill('Ben');
  await ben.page.locator('#friends-name').dispatchEvent('change');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('#friends-here')).toContainText('Ana');
  await bothPlaying(page, ben.page);

  // Ana's battle for both: 2 minutes, from her 6 tanks, at her speed, with no robot tanks, and each their own reach help.
  const [ana, his] = [await battleOf(page), await battleOf(ben.page)];
  expect([ana.battle, his.battle]).toEqual([true, true]);
  expect([ana.seconds, his.seconds]).toEqual([120, 120]);
  expect([ana.drive, his.drive]).toEqual([17, 17]);
  expect([ana.robots, his.robots]).toEqual([0, 0]);
  expect([ana.slot, his.slot]).toEqual([0, 1]);
  expect(his.help).toBeGreaterThan(ana.help);
  expect([ana.friendName, his.friendName]).toEqual(['Ben', 'Ana']);
  expect([ana.friendShown, his.friendShown]).toEqual([true, true]);
  // Each one's tank is where the other's game shows the friend's, and the two start apart.
  for (const [here, there] of [[ana, his], [his, ana]]) expect(Math.hypot(here.friend.x - there.tank.x, here.friend.z - there.tank.z)).toBeLessThan(0.5);
  await expect(page.locator('#battle-name')).toHaveText('Ben');
  await expect(ben.page.locator('#battle-name')).toHaveText('Ana');
  await expect(page.locator('#chip-time')).toHaveText(/^(2:00|1:[0-5]\d)$/);
  await expect(page.locator('#chip-left')).toBeHidden();
  await expect(page.locator('#chip-hearts')).toBeHidden();
  await expect(page.locator('#story-line')).toHaveText('A friendly battle! Hit your friend’s tank!');
  await shot(page, 'tanks-friends-start');

  // Ben drives off with his closed hand. Ana's screen shows his tank where his game has it, turned the way it's going.
  await pointAt(ben.page, { x: 24, z: 4 }, 'fist');
  await expect.poll(async () => (await battleOf(ben.page)).tank.z, { timeout: 30_000 }).toBeLessThan(9);
  await expect.poll(async () => {
    const [here, there] = await Promise.all([battleOf(page), battleOf(ben.page)]);
    return Math.hypot(here.friend.x - there.tank.x, here.friend.z - there.tank.z) < 4 && turnOff(here.friend.heading, there.tank.heading) < 0.6;
  }, { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, 'tanks-friends-driving');

  // Both drive at each other with closed hands, which never fire, and stop within reach of each other's guns.
  await pointAt(page, 'friend', 'fist');
  await pointAt(ben.page, 'friend', 'fist');
  await expect.poll(() => inRange(page), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => inRange(ben.page), { timeout: 30_000 }).toBe(true);
  expect([(await battleOf(page)).shots, (await battleOf(ben.page)).shots]).toEqual([0, 0]);

  // Both open their hands on each other's tanks, and each gun fires by itself. A child who's firing is playing,
  // so neither is resting, as one holding a closed hand still for long would be.
  for (const each of [page, ben.page]) {
    await each.evaluate(() => {
      const { field } = window.__game;
      const shown = field.friendFired.bind(field);
      window.__friendShots = 0;
      field.friendFired = (count) => {
        window.__friendShots += count;
        shown(count);
      };
    });
  }
  await pointAt(page, 'friend', 'open');
  await pointAt(ben.page, 'friend', 'open');
  await expect.poll(async () => (await battleOf(page)).mine, { timeout: 30_000, intervals: [50] }).toBeGreaterThanOrEqual(1);
  // Each hit has a +1 go up beside the tank it hit, for a moment.
  await expect.poll(() => page.evaluate(() => window.__game.field.points.length), { timeout: 15_000, intervals: [20] }).toBeGreaterThan(0);
  await page.waitForTimeout(250);
  await shot(page, 'tanks-friends-ana-hits');
  await expect.poll(async () => (await battleOf(ben.page)).mine, { timeout: 30_000, intervals: [50] }).toBeGreaterThanOrEqual(1);
  await ben.page.screenshot({ path: 'test-results/screens/tanks-friends-ben-hits.png' });
  // Each one's shots come over on the other's screen too, from their tank's gun, no more than they've fired.
  for (const [here, there] of [[page, ben.page], [ben.page, page]]) {
    await expect.poll(() => here.evaluate(() => window.__friendShots), { timeout: 10_000 }).toBeGreaterThan(0);
    const seen = await here.evaluate(() => window.__game.patrol.friend.shots);
    expect(seen).toBeLessThanOrEqual((await battleOf(there)).shots);
  }
  await expect(page.locator('#battle-mine')).not.toHaveText('0');
  await expect(ben.page.locator('#battle-theirs')).not.toHaveText('0');
  // Through it all, nothing flashes on either screen.
  for (const each of [page, ben.page]) {
    const reading = await brightnessThrough(each, 150);
    console.log('biggest brightness step through a battle', biggestStep(reading));
    expect(biggestStep(reading)).toBeLessThan(6);
  }
  // Each one's turret, as the other sees it, points the way it really does.
  await expect.poll(async () => {
    const [here, there] = await Promise.all([battleOf(page), battleOf(ben.page)]);
    return Math.max(turnOff(here.friend.turret, there.tank.turret), turnOff(there.friend.turret, here.tank.turret));
  }, { timeout: 10_000 }).toBeLessThan(0.5);
  await shot(page, 'tanks-friends-both-firing');

  // Both close their hands, and once the last shots have landed, each one's hits are theirs on both screens.
  await pointAt(page, 'friend', 'fist');
  await pointAt(ben.page, 'friend', 'fist');
  await expect.poll(async () => {
    const [here, there] = await Promise.all([battleOf(page), battleOf(ben.page)]);
    return here.mine === there.theirs && here.theirs === there.mine;
  }, { timeout: 10_000 }).toBe(true);
  // Each child's hits were decided by their own game, from their own shots.
  for (const each of [page, ben.page]) {
    const { mine, hits } = await each.evaluate(() => ({ mine: window.__game.patrol.score.mine, hits: window.__game.patrol.stats.hits }));
    expect(hits).toBe(mine);
  }

  // The time runs out for both together, and the finish card says who won, with both scores.
  for (const each of [page, ben.page]) {
    await each.evaluate(() => {
      const { game } = window.__game;
      game.battle.seconds = game.sinceGo / 1000 + 1;
    });
  }
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) await stopPointing(each);
  const [hers, ours] = [await battleOf(page), await battleOf(ben.page)];
  expect([hers.mine, hers.theirs]).toEqual([ours.theirs, ours.mine]);
  await expect(page.locator('#screen-finish h2')).toHaveText(titleFor(hers.mine, hers.theirs));
  await expect(ben.page.locator('#screen-finish h2')).toHaveText(titleFor(ours.mine, ours.theirs));
  await expect(page.locator('#finish-score')).toHaveText(new RegExp(`^You\\s*${hers.mine}\\s*:\\s*${hers.theirs}\\s*Ben$`));
  await expect(ben.page.locator('#finish-score')).toHaveText(new RegExp(`^You\\s*${ours.mine}\\s*:\\s*${ours.theirs}\\s*Ana$`));
  await expect(page.locator('#finish-hero')).toHaveText(String(hers.mine));
  const hits = (count) => `${count} ${count === 1 ? 'hit' : 'hits'}`;
  await expect(page.locator('.friends-results li.is-you')).toContainText(`You ${hits(hers.mine)}`);
  await expect(page.locator('.friends-results li:not(.is-you)')).toContainText(`Ben ${hits(hers.theirs)}`);
  await expect(page.locator('.friends-results li').first()).toContainText('1st');
  await expect(page.locator('#sum-right-hits')).toHaveText(String(hers.mine));
  await expect(page.locator('#sum-right-tanks')).toBeHidden();
  await page.waitForTimeout(500);
  await shot(page, 'tanks-friends-finish');
  await ben.page.screenshot({ path: 'test-results/screens/tanks-friends-finish-ben.png' });

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect((await battleOf(page)).ownLevel).toBe(4);
  expect((await battleOf(ben.page)).ownLevel).toBe(1);
  expect(await ben.page.evaluate(() => [window.__game.session.settings.tanks, window.__game.session.settings.pace])).toEqual([15, 'slow']);
  expect(sockets).toEqual([`ws://localhost:${Number(new URL(test.info().project.use.baseURL).port) + 1}/room/tank-patrol/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a battle is for two: a third friend is told it already has two players', async ({ page, browser }) => {
  await openPatrol(page);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openPatrol(ben.page, {}, `#tanks=${code}`);
  await expect(page.locator('#friends-here li')).toHaveCount(2);
  const cara = await secondPlayer(browser);
  await openPatrol(cara.page, {}, `#tanks=${code}`);
  await expect(cara.page.locator('#friends-status')).toHaveText('That game already has 2 players.');
  await expect(cara.page.locator('#friends-out')).toBeVisible();
  await expect(page.locator('#friends-here li')).toHaveCount(2);
  for (const each of [ben, cara]) {
    expect(each.errors).toEqual([]);
    await each.context.close();
  }
});

test('a friend who goes in the middle ends the battle for the other, who can go back to patrolling on their own', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openPatrol(page);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openPatrol(ben.page, {}, `#tanks=${code}`);
  await bothPlaying(page, ben.page);
  await ben.context.close();
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-score')).toBeVisible();
  expect((await battleOf(page)).friendShown).toBe(false);
  // On their own again: robot tanks, and nothing more sent.
  await page.locator('#friends-leave').evaluate((button) => button.click());
  await show(page, ...OPEN);
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  const solo = await battleOf(page);
  expect([solo.battle, solo.friendShown]).toEqual([false, false]);
  expect(solo.robots).toBeGreaterThan(0);
  await expect(page.locator('#chip-left')).toBeVisible();
  await expect(page.locator('#chip-mine')).toBeHidden();
});

test('on their own, it\'s the patrol with its robot tanks, as ever, and nothing connects anywhere', async ({ page }) => {
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await startPatrol(page);
  const solo = await battleOf(page);
  expect([solo.battle, solo.friend, solo.friendShown]).toEqual([false, null, false]);
  expect(solo.robots).toBeGreaterThan(0);
  for (const chip of ['#chip-left', '#chip-stopped', '#chip-hearts']) await expect(page.locator(chip)).toBeVisible();
  for (const chip of ['#chip-mine', '#chip-theirs', '#chip-time-box']) await expect(page.locator(chip)).toBeHidden();
  await expect(page.locator('#story-line')).toHaveText('Robot tanks in my valley! Let’s stop them!');
  await expect(page.locator('#friends-toggle')).toHaveText('Play with a friend');
  expect(sockets).toEqual([]);
});
