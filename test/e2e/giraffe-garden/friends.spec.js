// Watering Giraffe's Garden with friends: each on their own computer with their own camera, all watering the same
// garden. Every game has the host's plain garden, each sees the others' cans over the same plants, and each plant
// grows by everyone's sips of water, which the server says are whose. Here they're separate browsers, talking
// through the race server on this computer (tools/race-server.mjs).
import { openGame, shot } from '../helpers.js';
import { allPlaying, expect, expectSoon, GAME, joinGame, makeGame, secondPlayer, state, stopHand, test, waitForScreen, waterHand } from './helpers.js';

/** How it is on one child's screen. */
const view = (page) => page.evaluate(() => {
  const { game, garden } = window.__game;
  return {
    mode: game.mode,
    level: garden.level,
    plants: garden.plants.map(({ look, hanging, water, bloomed, sips }) => ({ look, hanging, water, bloomed, sips: [...sips.entries()] })),
    plain: !garden.sprinkler && !garden.snails.length && !garden.plan.bees,
    you: game.friends.room.you,
    tally: Object.fromEntries(garden.tally),
    friends: game.friendCans.map(({ name, fade, x, y }) => ({ name, fade, x, y })),
    ownLevel: window.__game.session.levels.current,
    done: garden.done,
  };
});

test('friends water the same garden: each sees the others\' cans over the same plants, the plants grow by everyone\'s water, and it flowers on every screen together', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { plants: 4, spread: 'middle', levels: { [GAME]: 4 } }, GAME);
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#garden=${code}`);
  // The friend has their own number of plants and how far apart, but waters the host's garden, with their own spread.
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { plants: 8, spread: 'wide' }, 'Ben');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await allPlaying(page, ben.page);

  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.mode, his.mode]).toEqual(['friends', 'friends']);
  expect([ana.plants.length, his.plants.length]).toEqual([4, 4]);
  expect([ana.level, his.level]).toEqual([4, 4]);
  // The plain garden: none of what the levels bring.
  expect([ana.plain, his.plain]).toEqual([true, true]);
  await expect(page.locator('#garden-scores li')).toHaveCount(2);

  // Ana waters, and Ben sees her can over the same plant on his screen, though his plants are further apart.
  await waterHand(page);
  await expectSoon(async () => (await view(ben.page)).friends[0]?.fade ?? 0, { timeout: 30_000 }).toBeGreaterThan(0.5);
  await expectSoon(async () => (await state(page)).flow, { timeout: 30_000 }).toBeGreaterThan(0.5);
  await page.waitForTimeout(1200);
  const along = await Promise.all([page, ben.page].map((each) => each.evaluate(() => {
    const { game, view } = window.__game;
    const glove = game.gloves.right;
    return { mine: game.alongRow(glove.x / view.width), friend: game.friendCans[0] ? game.alongRow(game.friendCans[0].x / view.width) : null };
  })));
  expect(Math.abs(along[0].mine - along[1].friend)).toBeLessThan(0.15);
  await shot(page, 'garden-friends-host');
  await ben.page.screenshot({ path: 'test-results/screens/garden-friends-guest.png' });

  // Ben waters too. Both see the same water on each plant, from the same sips.
  await waterHand(ben.page);
  await expectSoon(async () => (await view(ben.page)).tally[his.you] ?? 0, { timeout: 60_000 }).toBeGreaterThan(2);
  await page.waitForTimeout(500);
  const [a, b] = [await view(page), await view(ben.page)];
  for (let i = 0; i < 4; i += 1) {
    const theirs = new Map(b.plants[i].sips);
    for (const [sip, by] of a.plants[i].sips) if (theirs.has(sip)) expect(theirs.get(sip)).toBe(by);
  }

  // It flowers on both screens, and both games end, with everyone's share on the finish card.
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) await stopHand(each);
  const [aEnd, bEnd] = [await view(page), await view(ben.page)];
  expect(aEnd.tally).toEqual(bEnd.tally);
  expect(aEnd.plants.every((plant) => plant.bloomed) && bEnd.plants.every((plant) => plant.bloomed)).toBe(true);
  const anaShare = aEnd.tally[aEnd.you] ?? 0;
  const benShare = aEnd.tally[bEnd.you] ?? 0;
  expect(anaShare).toBeGreaterThan(0);
  expect(benShare).toBeGreaterThan(0);
  await expect(page.locator('.friends-results li')).toHaveCount(2);
  await expect(page.locator('.friends-results li').first()).toContainText('% of the water');
  await expect(page.locator('#screen-finish h2')).toHaveText(anaShare >= benShare ? 'You watered the most!' : 'Great watering!');
  await page.waitForTimeout(600);
  await shot(page, 'garden-friends-finish');

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect(aEnd.ownLevel).toBe(4);
  expect(bEnd.ownLevel).toBe(1);
  expect(await ben.page.evaluate(() => [window.__game.session.settings.plants, window.__game.session.settings.spread])).toEqual([8, 'wide']);
  const port = Number(new URL(test.info().project.use.baseURL).port) + 1;
  expect(sockets).toEqual([`ws://localhost:${port}/room/giraffe-garden/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a friend who goes in the middle takes their can with them, and the other waters on to the end', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { plants: 4 }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await allPlaying(page, ben.page);
  await waterHand(ben.page);
  await expectSoon(async () => (await view(page)).friends[0]?.fade ?? 0, { timeout: 30_000 }).toBeGreaterThan(0.5);
  await ben.context.close();
  await expectSoon(async () => (await view(page)).friends.length, { timeout: 30_000 }).toBe(0);
  await waterHand(page);
  await waitForScreen(page, 'finish');
  await stopHand(page);
  expect((await view(page)).plants.every((plant) => plant.bloomed)).toBe(true);
  await expect(page.locator('.friends-results')).toBeVisible();
});
