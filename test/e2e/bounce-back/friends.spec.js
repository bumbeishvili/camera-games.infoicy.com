// Playing Bounce Back with a friend: two children, each on their own computer with their own camera, on one
// court. The host's game runs the ball, and each game decides its own hits and sends them, so hitting feels
// immediate for both. Each child sees themselves on their own side. Here they're two separate browsers, talking
// through the race server on this computer (tools/race-server.mjs).
import { expect, openGame, show, shot, test, waitForScreen } from '../helpers.js';
import { expectSoon, GAME, OPEN, steerHand, stopHand } from './helpers.js';

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
  await page.locator('#friends-name').fill(name);
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{6}$/);
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

/** How it is on one child's screen. */
const view = (page) => page.evaluate(() => {
  const { game, court } = window.__game;
  const other = game.mine === 'A' ? 'B' : 'A';
  const ball = game.mode === 'guest' ? game.guestBall : game.rally.ball;
  return {
    mode: game.mode,
    mine: game.mine,
    flip: court.flip,
    mineOnRight: court.at(game.mine === 'A' ? -0.5 : 0.5, 0).x > court.cx,
    goal: game.goal,
    hard: game.hard,
    level: game.playLevel,
    scores: game.scores(),
    hits: game.stats.hits,
    friendSeen: court.players[other].racket.visible,
    friendName: court.players[other].name,
    friendCharacter: court.players[other].spec.id,
    ball: ball ? { u: ball.u, h: ball.h, state: ball.state, stroke: ball.stroke } : null,
    ownLevel: window.__game.session.levels.current,
    flags: court.flags.count,
  };
});

test('two friends play one game: the host\'s ball, each on their own side, and either one\'s hit counts for both', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { bouncePoints: 5, bounceLevel: 'gentle', levels: { [GAME]: 4 } }, GAME);
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#bounce=${code}`);

  // The friend has their own points, how hard and character, but plays the host's game.
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { bouncePoints: 11, bounceLevel: 'tough', fighter: 'kit' }, GAME, `#bounce=${code}`);
  await ben.page.locator('#friends-name').fill('Ben');
  await ben.page.locator('#friends-name').dispatchEvent('change');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await bothPlaying(page, ben.page);

  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.mode, his.mode]).toEqual(['host', 'guest']);
  expect([ana.goal, his.goal]).toEqual([5, 5]);
  expect([ana.hard, his.hard]).toEqual(['gentle', 'gentle']);
  expect([ana.level, his.level]).toEqual([4, 4]);
  // The plain game with a friend: no flags, though it's the host's level 4.
  expect([ana.flags, his.flags]).toEqual([0, 0]);
  // Both play with the right hand, so each is on the right of their own screen, which is turned round for the friend.
  expect([ana.mineOnRight, his.mineOnRight]).toEqual([true, true]);
  expect(ana.flip).toBe(-his.flip);
  expect([ana.friendName, his.friendName]).toEqual(['Ben', 'Ana']);
  expect([ana.friendCharacter, his.friendCharacter]).toEqual(['kit', 'giraffe']);
  await expect(page.locator('#score-goal')).toHaveText('First to 5');
  await expect(ben.page.locator('.score-player:not(.is-mine) .score-name')).toHaveText('Ana');

  // Both after the ball. The host serves first, then Ben hits it back, on his own game, and it counts on Ana's.
  await steerHand(page);
  await steerHand(ben.page);
  await expectSoon(async () => (await view(ben.page)).hits, { timeout: 90_000 }).toBeGreaterThanOrEqual(1);
  await expectSoon(() => page.evaluate(() => window.__game.rally.stats.hits.B), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  // Each sees the other's racket where it is, and the same ball in the same place, give or take a moment.
  await expectSoon(async () => (await view(page)).friendSeen).toBe(true);
  await expectSoon(async () => (await view(ben.page)).friendSeen).toBe(true);
  const [here, there] = await Promise.all([view(page), view(ben.page)]);
  expect(Math.abs(here.ball.u - there.ball.u)).toBeLessThan(0.3);
  expect(Math.abs(here.ball.h - there.ball.h)).toBeLessThan(0.3);
  await shot(page, 'bounce-friends-host');
  await ben.page.screenshot({ path: 'test-results/screens/bounce-friends-guest.png' });

  // Near the end, Ben tries and misses: the point is Ana's, and the game is over for both.
  await page.evaluate(() => {
    window.__game.rally.scores.A = 4;
  });
  await steerHand(ben.page, { target: 'dodge' });
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) await stopHand(each);
  await expect(page.locator('#screen-finish h2')).toHaveText('You won!');
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('Great game!');
  await expect(page.locator('.friends-results li').nth(0)).toContainText(/1st\s+You\s+5 points/);
  await expect(ben.page.locator('.friends-results li').nth(0)).toContainText(/1st\s+Ana\s+5 points/);
  await expect(ben.page.locator('#finish-score')).toContainText(':');
  await page.waitForTimeout(600);
  await shot(page, 'bounce-friends-finish');

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect((await view(page)).ownLevel).toBe(4);
  expect((await view(ben.page)).ownLevel).toBe(1);
  expect(await ben.page.evaluate(() => window.__game.session.settings.bouncePoints)).toBe(11);
  expect(await ben.page.evaluate(() => window.__game.session.settings.bounceLevel)).toBe('tough');
  expect(sockets).toEqual([`ws://localhost:${Number(new URL(test.info().project.use.baseURL).port) + 1}/room/bounce-back/${code}`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a game is for two: a third friend is told it already has two players', async ({ page, browser }) => {
  await openGame(page, {}, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, {}, GAME, `#bounce=${code}`);
  await expect(page.locator('#friends-here li')).toHaveCount(2);
  const cara = await secondPlayer(browser);
  await openGame(cara.page, {}, GAME, `#bounce=${code}`);
  await expect(cara.page.locator('#friends-status')).toHaveText('That game already has 2 players.');
  await expect(page.locator('#friends-here li')).toHaveCount(2);
  for (const each of [ben, cara]) {
    expect(each.errors).toEqual([]);
    await each.context.close();
  }
});

test('a friend who goes in the middle ends the game for the other, who can play on their own again', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, {}, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, {}, GAME, `#bounce=${code}`);
  await bothPlaying(page, ben.page);
  await ben.context.close();
  await waitForScreen(page, 'finish');
  await expect(page.locator('.friends-results')).toBeVisible();
  // On their own again: the computer, and nothing more sent.
  await page.locator('#friends-leave').evaluate((button) => button.click());
  await show(page, ...OPEN);
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  expect((await view(page)).mode).toBe('solo');
});
