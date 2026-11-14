// Arrow Meadow with friends: each on their own computer with their own camera. Together, everyone has the same
// targets, sees the others' bows and arrows, and a target is whoever's arrow hit it first, as the server says.
// Against each other, everyone has the same targets in a lane of their own, and the first to enough wins. Here
// they're separate browsers, talking through the race server on this computer (tools/race-server.mjs).
import { openGame, shot } from '../helpers.js';
import { allPlaying, archer, expect, expectSoon, GAME, joinGame, makeGame, secondPlayer, state, stopArcher, test, waitForScreen } from './helpers.js';

/** How it is on one child's screen. */
const view = (page) => page.evaluate(() => {
  const { game, meadow, session } = window.__game;
  return {
    mode: game.mode,
    level: meadow.level,
    goal: meadow.goal,
    total: meadow.total,
    hits: meadow.stats.hits,
    plain: !meadow.specials.length && !meadow.plan.wind && !meadow.plan.bird && !meadow.plan.castle,
    targets: meadow.targets.filter((target) => target.state === 'up').map(({ k, kind, x, y }) => ({ k, kind, x, y })),
    you: game.friends.room.you,
    tally: Object.fromEntries(meadow.tally),
    owners: Object.fromEntries(meadow.owners),
    others: game.others.map(({ name, fade, hits, shots }) => ({ name, fade, hits, shots })),
    ghosts: meadow.arrows.filter((arrow) => arrow.ghost).length,
    ownLevel: session.levels.current,
    done: meadow.done,
  };
});

test('friends shoot together: the same targets for everyone, each sees the other\'s bow and arrows, and the team\'s targets win it for both', async ({ page, browser }) => {
  test.setTimeout(480_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { arrowGoal: 6, levels: { [GAME]: 5 } }, GAME);
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#arrows=${code}`);
  // Together is how it comes, and the friend, who would have chosen otherwise, is shown what the host chose.
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { arrowGoal: 14, arrowFriends: 'against', arrowReach: 'medium' }, 'Ben');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeDisabled();
  await shot(page, 'arrows-friends-box');
  await allPlaying(page, ben.page);

  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.mode, his.mode]).toEqual(['team', 'team']);
  // The host's level and number of targets, for each of them, in the plain meadow.
  expect([ana.level, his.level]).toEqual([5, 5]);
  expect([ana.goal, his.goal]).toEqual([12, 12]);
  expect([ana.plain, his.plain]).toEqual([true, true]);
  // The same targets, in the same places, on both screens.
  expect(his.targets).toEqual(ana.targets);
  expect(ana.targets).toHaveLength(3);
  await expect(page.locator('#arrow-scores li')).toHaveCount(2);
  await expect(page.locator('#chip-targets')).toHaveText('0 of 12');

  // Ana shoots, and Ben sees her bow, and her arrows flying, on his screen. What she hits counts on both.
  await archer(page, { every: 1 });
  await expectSoon(async () => (await view(ben.page)).others[0]?.fade ?? 0, { timeout: 30_000 }).toBeGreaterThan(0.5);
  await expectSoon(async () => (await view(ben.page)).ghosts, { timeout: 40_000, intervals: [50] }).toBeGreaterThan(0);
  await expectSoon(async () => (await view(ben.page)).total, { timeout: 40_000 }).toBeGreaterThanOrEqual(1);
  await ben.page.screenshot({ path: 'test-results/screens/arrows-friends-guest.png' });
  expect((await view(ben.page)).hits).toBe(0);
  // Ben shoots too.
  await archer(ben.page, { every: 1 });
  await expectSoon(async () => (await view(page)).tally[his.you] ?? 0, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(400);
  await shot(page, 'arrows-friends-host');
  const [a, b] = [await view(page), await view(ben.page)];
  for (const [k, by] of Object.entries(a.owners)) if (k in b.owners) expect(b.owners[k]).toBe(by);

  // Enough between them, and both games end together, with each one's targets on the finish card.
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) await stopArcher(each);
  const [aEnd, bEnd] = [await view(page), await view(ben.page)];
  expect(aEnd.tally).toEqual(bEnd.tally);
  expect(aEnd.total).toBe(12);
  expect((aEnd.tally[aEnd.you] ?? 0) + (aEnd.tally[bEnd.you] ?? 0)).toBe(12);
  expect(aEnd.tally[aEnd.you]).toBe(aEnd.hits);
  expect(aEnd.tally[bEnd.you]).toBe(bEnd.hits);
  for (const each of [page, ben.page]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('You did it together!');
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('.friends-results li').first()).toContainText(/\d+ targets?/);
    // Nobody is placed first or second.
    await expect(each.locator('.friends-results .friends-place').first()).toHaveText('');
  }
  await page.waitForTimeout(600);
  await shot(page, 'arrows-friends-finish');

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect(aEnd.ownLevel).toBe(5);
  expect(bEnd.ownLevel).toBe(1);
  expect(await ben.page.evaluate(() => {
    const { settings } = window.__game.session;
    return [settings.arrowGoal, settings.arrowFriends, settings.arrowReach];
  })).toEqual([14, 'against', 'medium']);
  const port = Number(new URL(test.info().project.use.baseURL).port) + 1;
  expect(sockets).toEqual([`ws://localhost:${port}/room/arrow-meadow/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('friends shoot against each other: the same targets in a lane each, and the first to enough wins it', async ({ page, browser }) => {
  test.setTimeout(480_000);
  await openGame(page, { arrowGoal: 6, levels: { [GAME]: 2 } }, GAME);
  const code = await makeGame(page, 'Ana');
  // Whoever made the game chooses, and the friend is shown.
  await page.locator('input[name="friends-team"][value="against"]').check();
  expect(await page.evaluate(() => window.__game.session.settings.arrowFriends)).toBe('against');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');
  await allPlaying(page, ben.page);

  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.mode, his.mode]).toEqual(['race', 'race']);
  expect([ana.goal, his.goal]).toEqual([6, 6]);
  // One target at a time, the same one for each to begin with.
  expect(ana.targets).toHaveLength(1);
  expect(his.targets).toEqual(ana.targets);
  await expect(page.locator('#chip-targets')).toHaveText('0 of 6');

  // Ana is quick and Ben takes his time: her targets don't change his lane, and his scoreboard has her score.
  await archer(page, { every: 0.4 });
  await archer(ben.page, { every: 4 });
  await expectSoon(async () => (await view(page)).hits, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
  await expectSoon(async () => (await view(ben.page)).others[0]?.hits ?? 0, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  const lane = await view(ben.page);
  expect(lane.hits).toBeLessThan(2);
  expect(lane.targets[0]?.k ?? lane.hits).toBe(lane.hits);
  await expect(ben.page.locator('#arrow-scores li').first()).toContainText('Ana');
  await ben.page.screenshot({ path: 'test-results/screens/arrows-rivals-guest.png' });

  // Ana gets to six: she has won, and it's over for Ben too, who is told he shot well.
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) await stopArcher(each);
  const [aEnd, bEnd] = [await view(page), await view(ben.page)];
  expect(aEnd.hits).toBe(6);
  expect(bEnd.hits).toBeLessThan(6);
  await expect(page.locator('#screen-finish h2')).toHaveText('You won the contest!');
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('Great shooting!');
  await expect(page.locator('.friends-results li')).toHaveCount(2);
  await expect(page.locator('.friends-results li').first()).toContainText('You');
  await expect(page.locator('.friends-results li').first()).toContainText('1st');
  await expect(page.locator('.friends-results li').first()).toContainText('6 targets');
  await expect(ben.page.locator('.friends-results li').first()).toContainText('Ana');
  await expect(ben.page.locator('.friends-results li').nth(1)).toContainText('2nd');
  await page.waitForTimeout(600);
  await shot(page, 'arrows-rivals-finish');
  await ben.page.screenshot({ path: 'test-results/screens/arrows-rivals-finish-guest.png' });
  // A game with friends doesn't move anyone's own level on.
  expect([aEnd.ownLevel, bEnd.ownLevel]).toEqual([2, 1]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a game is for up to four: a fifth friend is told it already has four players', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await openGame(page, {}, GAME);
  const code = await makeGame(page, 'Ana');
  const friends = [];
  for (const name of ['Ben', 'Cal', 'Dee']) {
    const friend = await secondPlayer(browser);
    await joinGame(friend.page, code, {}, name);
    friends.push(friend);
  }
  await expect(page.locator('#friends-here li')).toHaveCount(4);
  const fifth = await secondPlayer(browser);
  await openGame(fifth.page, {}, GAME);
  await fifth.page.locator('#friends-toggle').click();
  await fifth.page.locator('#friends-code').fill(code);
  await expect(fifth.page.locator('#friends-status')).toHaveText('That game already has 4 players.');
  await expect(page.locator('#friends-here li')).toHaveCount(4);
  for (const each of [...friends, fifth]) await each.context.close();
});

test('together, a friend who goes in the middle takes their bow with them, and the other finishes with fewer targets to hit', async ({ page, browser }) => {
  test.setTimeout(420_000);
  await openGame(page, { arrowGoal: 6 }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await allPlaying(page, ben.page);
  expect((await view(page)).goal).toBe(12);
  await archer(ben.page, { every: 1.2 });
  await expectSoon(async () => (await view(page)).others[0]?.fade ?? 0, { timeout: 30_000 }).toBeGreaterThan(0.5);
  await expectSoon(async () => (await view(page)).total, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
  const before = await view(page);
  await ben.context.close();
  await expectSoon(async () => (await view(page)).others.length, { timeout: 30_000 }).toBe(0);
  // What Ben hit stays hit, and Ana has half of what was left to do.
  const after = await view(page);
  expect(after.total).toBeGreaterThanOrEqual(before.total);
  expect(after.goal).toBeLessThan(12);
  expect(after.goal).toBeGreaterThan(after.total);
  await expect(page.locator('#arrow-scores li')).toHaveCount(1);
  await archer(page, { every: 0.4 });
  await waitForScreen(page, 'finish');
  await stopArcher(page);
  const end = await state(page);
  expect(end.total).toBe(after.goal);
  await expect(page.locator('.friends-results')).toBeVisible();
});
