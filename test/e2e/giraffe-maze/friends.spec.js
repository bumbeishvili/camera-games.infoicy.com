// Playing Giraffe's Maze with friends: each on their own computer with their own camera, all in the same maze. Every
// game makes the host's mazes from the host's seed, everyone sees everyone else's character walking in it, and each
// fruit and lost friend goes to whoever gets there first, as the server decides. Here they're separate browsers,
// talking through the race server on this computer (tools/race-server.mjs).
import { expect, openGame, shot, test, waitForScreen } from '../helpers.js';
import { allPlaying, expectSoon, GAME, joinGame, leadHand, makeGame, secondPlayer, state, stopHand } from './helpers.js';

/** How it is on one child's screen. */
const view = (page) => page.evaluate(() => {
  const { game, run } = window.__game;
  const friends = [...game.friendWalkers.values()].map((friend) => ({ name: friend.name, who: friend.spec.id, shown: Boolean(friend.shown), x: friend.at?.x ?? null, y: friend.at?.y ?? null }));
  return {
    mode: game.mode,
    seed: run.seed,
    size: run.size,
    level: run.level,
    mazes: run.mazes,
    index: run.index,
    cells: [...run.layout.maze.cells].join(''),
    lost: run.layout.lost.map(({ who, owner }) => ({ who, owner })),
    items: run.layout.items.length,
    blockers: run.layout.blockers.length,
    owners: run.layout.items.filter((item) => item.owner).map(({ k, owner }) => [k, owner]),
    points: Object.fromEntries(game.points),
    you: game.friends.room.you,
    friends,
    ownLevel: window.__game.session.levels.current,
    fruit: run.stats.fruit,
    found: run.stats.found,
  };
});

test('friends play one maze: the host\'s, with each other\'s characters in it, and whoever gets somewhere first has what\'s there', async ({ page, browser }) => {
  test.setTimeout(480_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { mazeReach: 'lots', mazes: 2, mazeSize: 'medium', levels: { [GAME]: 6 } }, GAME);
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#maze=${code}`);

  // The friend has their own size, number of friends to find and character, but plays the host's game.
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { mazes: 5, mazeSize: 'hard', fighter: 'kit' }, 'Ben');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await allPlaying(page, ben.page);

  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.mode, his.mode]).toEqual(['friends', 'friends']);
  expect(his.seed).toBe(ana.seed);
  expect(his.cells).toBe(ana.cells);
  expect([ana.size, his.size]).toEqual(['medium', 'medium']);
  expect([ana.mazes, his.mazes]).toEqual([2, 2]);
  expect([ana.level, his.level]).toEqual([6, 6]);
  // One more lost than there are players, never anyone's own character, and the plain maze with its fruit.
  expect(ana.lost).toHaveLength(3);
  expect(ana.lost.map(({ who }) => who)).toEqual(his.lost.map(({ who }) => who));
  expect(ana.lost.map(({ who }) => who)).not.toContain('giraffe');
  expect(ana.lost.map(({ who }) => who)).not.toContain('kit');
  expect([ana.blockers, his.blockers]).toEqual([0, 0]);
  expect(his.items).toBe(ana.items);
  await expect(page.locator('#maze-scores li')).toHaveCount(2);
  await expect(ben.page.locator('#maze-scores li')).toHaveCount(2);

  // Both lead the way. Each sees the other walking, with their name over them.
  await leadHand(page);
  await leadHand(ben.page);
  await expectSoon(async () => (await view(page)).friends[0]?.shown, { timeout: 30_000 }).toBe(true);
  await expectSoon(async () => (await view(ben.page)).friends[0]?.shown, { timeout: 30_000 }).toBe(true);
  expect((await view(page)).friends[0]).toMatchObject({ name: 'Ben', who: 'kit' });
  expect((await view(ben.page)).friends[0]).toMatchObject({ name: 'Ana', who: 'giraffe' });
  // Where Ben's character is on Ana's screen is where it is on his, a moment ago.
  await page.waitForTimeout(1500);
  const [there, here] = await Promise.all([state(ben.page), view(page)]);
  expect(Math.hypot(there.at.x - here.friends[0].x, there.at.y - here.friends[0].y)).toBeLessThan(1.2);
  await shot(page, 'maze-friends-host');
  await ben.page.screenshot({ path: 'test-results/screens/maze-friends-guest.png' });

  // Each fruit and each friend found is one child's, the same on both screens.
  await expectSoon(async () => (await view(page)).owners.length, { timeout: 60_000 }).toBeGreaterThan(2);
  await expectSoon(async () => (await view(page)).lost.filter(({ owner }) => owner).length, { timeout: 120_000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(800);
  const [a1, b1] = [await view(page), await view(ben.page)];
  const agree = (x, y) => {
    const theirs = new Map(y.owners.map(([k, owner]) => [k, owner]));
    return x.owners.filter(([k, owner]) => theirs.has(k) && theirs.get(k) !== owner).length;
  };
  expect(agree(a1, b1)).toBe(0);
  if (a1.index === b1.index) expect(a1.lost.map(({ owner }) => owner).filter(Boolean)).toEqual(b1.lost.map(({ owner }) => owner).filter(Boolean));
  expect(a1.points).toEqual(b1.points);
  expect(a1.fruit + b1.fruit).toBeLessThanOrEqual(a1.owners.length + 2);

  // On through both mazes together, and both games end.
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) await stopHand(each);
  const [aEnd, bEnd] = [await view(page), await view(ben.page)];
  expect([aEnd.index, bEnd.index]).toEqual([1, 1]);
  expect(aEnd.points).toEqual(bEnd.points);
  const anaPoints = aEnd.points[aEnd.you];
  const benPoints = aEnd.points[bEnd.you];
  await expect(page.locator('.friends-results li')).toHaveCount(2);
  await expect(page.locator('.friends-results li').nth(0)).toContainText(anaPoints >= benPoints ? 'You' : 'Ben');
  await expect(ben.page.locator('.friends-results li').nth(0)).toContainText(benPoints >= anaPoints ? 'You' : 'Ana');
  await expect(page.locator('#screen-finish h2')).toHaveText(anaPoints >= benPoints ? 'You found the most!' : 'Great finding!');
  await page.waitForTimeout(600);
  await shot(page, 'maze-friends-finish');

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect(aEnd.ownLevel).toBe(6);
  expect(bEnd.ownLevel).toBe(1);
  expect(await ben.page.evaluate(() => window.__game.session.settings.mazes)).toBe(5);
  expect(await ben.page.evaluate(() => window.__game.session.settings.mazeSize)).toBe('hard');
  const port = Number(new URL(test.info().project.use.baseURL).port) + 1;
  expect(sockets).toEqual([`ws://localhost:${port}/room/giraffe-maze/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a game holds four: a fifth friend is told it already has four players', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await openGame(page, {}, GAME);
  const code = await makeGame(page, 'Ana');
  const others = [];
  for (const name of ['Ben', 'Cara', 'Dan']) {
    const friend = await secondPlayer(browser);
    await joinGame(friend.page, code, {}, name);
    others.push(friend);
  }
  await expect(page.locator('#friends-here li')).toHaveCount(4);
  const eve = await secondPlayer(browser);
  await openGame(eve.page, {}, GAME);
  await eve.page.locator('#friends-toggle').click();
  await eve.page.locator('#friends-code').fill(code);
  await expect(eve.page.locator('#friends-status')).toHaveText('That game already has 4 players.');
  await expect(page.locator('#friends-here li')).toHaveCount(4);
  await shot(page, 'maze-friends-four');
  for (const each of [...others, eve]) {
    expect(each.errors).toEqual([]);
    await each.context.close();
  }
});

test('a friend who goes in the middle takes their character with them, and the other plays on to the end', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await openGame(page, { mazeReach: 'lots', mazes: 2 }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await allPlaying(page, ben.page);
  await leadHand(ben.page);
  await expectSoon(async () => (await view(page)).friends[0]?.shown, { timeout: 30_000 }).toBe(true);
  await ben.context.close();
  await expectSoon(async () => (await view(page)).friends.length, { timeout: 30_000 }).toBe(0);
  // Nobody runs the maze but the rules, so it carries on without the host or anyone else.
  await leadHand(page);
  await waitForScreen(page, 'finish');
  await stopHand(page);
  const end = await view(page);
  expect(end.found).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.friends-results')).toBeVisible();
  // On their own again: their own maze, and nothing more sent.
  await page.locator('#friends-leave').evaluate((button) => button.click());
  await page.evaluate(() => window.__camera.show({ left: null, right: 'open', scale: 0.62 }));
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  expect((await view(page)).mode).toBe('solo');
});
