// Mighty Lift with friends: two children, each on their own computer with their own camera. Together, they lift
// one big weight, each arm adding its share, and against each other, each frees their own friends. Here they're
// two separate browsers, talking through the race server on this computer (tools/race-server.mjs).
import { GAME, armsAre, childLifts, expect, expectSoon, getReady, joinGame, makeGame, openLift, secondPlayer, shot, state, stopChild, test, waitForScreen } from './helpers.js';

const team = (page) => page.evaluate(() => window.__game.game.team);
const mate = (page) => page.evaluate(() => {
  const { world, mates } = window.__game;
  const shown = world.mates[0];
  return { name: mates[0]?.friend.spec.name, gone: mates[0]?.gone, hand: shown?.pose.handLY, visible: shown?.body.root.visible, lift: shown?.lift, roped: shown?.roped };
});
const scores = (page) => page.locator('#lift-scores li').evaluateAll((rows) => rows.map((row) => [row.querySelector('span').textContent, Number(row.querySelector('strong').textContent)]));

test('two friends lift one big weight together from their own computers, and the friend under it is freed on both', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openLift(page, { lifts: 5, liftHold: 'long', levels: { [GAME]: 4 } });
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#lift=${code}`);
  // Together is how it comes, and whoever made the game can change it.
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(page.locator('input[name="friends-team"][value="against"]')).toBeEnabled();
  await expect(page.locator('#friends-how')).toContainText('lift one big weight together');

  // The friend has settings of their own, and plays the host's game with their own arm and line.
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { lifts: 12, liftHold: 'short', liftHeight: 'head', fighter: 'kit' }, 'Ben');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeDisabled();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');

  await getReady(page);
  await waitForScreen(page, 'waiting');
  await getReady(ben.page);
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  const [hers, his] = [await state(page), await state(ben.page)];
  expect([await team(page), await team(ben.page)]).toEqual([true, true]);
  // The host's game on both: five lifts, her level's hold with her long hold, and the plain baskets, the same friends under them.
  expect([hers.planned, his.planned]).toEqual([5, 5]);
  expect(his.hold).toBeCloseTo(hers.hold, 5);
  expect(hers.hold).toBeGreaterThan(2);
  expect(his.kinds).toEqual(['basket', 'basket', 'basket', 'basket', 'basket']);
  expect(his.friends).toEqual(hers.friends);
  // Each keeps their own line: above the head for Ben, the shoulder for Ana.
  expect([hers.right.line, his.right.line]).toEqual([0, 0.7]);

  // Each sees the other's lifter beside their own, with their name over it, and its rope to the same ring.
  await expectSoon(async () => (await mate(page)).visible, { timeout: 15_000 }).toBe(true);
  expect((await mate(page)).name).toBe('Ben');
  expect((await mate(page)).roped).toBe(true);
  await expect(page.locator('.lifter-mark[data-where="on"]')).toHaveCount(1);
  await expect(page.locator('.lifter-mark-name')).toHaveText('Ben');
  await expect(ben.page.locator('.lifter-mark-name')).toHaveText('Ana');

  // Ben's arm goes up, and so does his lifter's on Ana's screen. With Ana's still down, the weight is half way.
  await armsAre(ben.page, 'up');
  await expectSoon(async () => (await mate(page)).hand, { timeout: 15_000 }).toBeGreaterThan(0.3);
  await expectSoon(async () => (await state(page)).height, { timeout: 15_000 }).toBeGreaterThan(0.45);
  const half = await state(page);
  expect(half.height).toBeLessThan(0.7);
  expect(half.lift).toBeLessThan(0.3);
  await expectSoon(async () => (await state(ben.page)).height, { timeout: 15_000 }).toBeGreaterThan(0.45);
  await page.waitForTimeout(400);
  await shot(page, 'lift-friends-half');
  // The friend under it gets out all the same, with one arm of two, on both screens.
  await expectSoon(async () => (await state(page)).out, { timeout: 15_000 }).toBeGreaterThan(0.15);
  // Both arms up: all the way.
  await armsAre(page, 'up');
  await expectSoon(async () => (await state(page)).height, { timeout: 15_000 }).toBeGreaterThan(1);
  await expectSoon(async () => (await state(ben.page)).height, { timeout: 15_000 }).toBeGreaterThan(1);
  await page.waitForTimeout(300);
  await shot(page, 'lift-friends-together');
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 20_000 }).toBe(1);
  await expectSoon(async () => (await state(ben.page)).stats.freed, { timeout: 20_000 }).toBe(1);
  await expect(page.locator('#freed-row li')).toHaveCount(1);
  await expect(ben.page.locator('#freed-row li')).toHaveCount(1);
  // Everyone's lifts show at the top: one each.
  await expectSoon(() => scores(page), { timeout: 10_000 }).toEqual([['You', 1], ['Ben', 1]]);
  await expectSoon(() => scores(ben.page), { timeout: 10_000 }).toEqual([['You', 1], ['Ana', 1]]);

  // And so on to the end, both lifting: every friend freed on both, and it's over for both together.
  await childLifts(page, { high: 1.2 });
  await childLifts(ben.page, { high: 1.2 });
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  await stopChild(page);
  await stopChild(ben.page);
  for (const each of [page, ben.page]) {
    await expect(each.locator('#finish-title')).toHaveText('You lifted it together!');
    await expect(each.locator('#finish-freed')).toHaveText('5 friends');
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('.friends-results')).toHaveClass(/is-team/);
    await expect(each.locator('.friends-results')).toContainText('lifts');
  }
  await page.waitForTimeout(500);
  await shot(page, 'lift-friends-finish');
  // Nobody's own level moves on, and nobody's settings change.
  expect(await page.evaluate(() => window.__game.game.levels.current)).toBe(4);
  expect(await ben.page.evaluate(() => [window.__game.game.levels.current, window.__game.game.settings.lifts, window.__game.game.settings.liftHold])).toEqual([1, 12, 'short']);
  // Only the race server on this computer was talked to.
  expect(sockets.length).toBeGreaterThanOrEqual(1);
  for (const url of sockets) expect(url).toMatch(/^ws:\/\/localhost:\d+\/room\/mighty-lift\//);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('against each other, each child frees their own friends, and it\'s over for both when one has freed them all', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openLift(page, { lifts: 5 });
  const code = await makeGame(page, 'Ana');
  await page.locator('input[name="friends-team"][value="against"]').check();
  await expect(page.locator('#friends-how')).toContainText('see who frees the most friends');
  // The choice is kept with the grown-ups' settings.
  expect(await page.evaluate(() => window.__game.game.settings.liftFriends)).toBe('against');

  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { fighter: 'bramble' }, 'Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeDisabled();
  // Ben's own choice, for the games he makes himself, stays as it was.
  expect(await ben.page.evaluate(() => window.__game.game.settings.liftFriends)).toBe('together');

  await getReady(page);
  await getReady(ben.page);
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  expect([await team(page), await team(ben.page)]).toEqual([false, false]);
  const [hers, his] = [await state(page), await state(ben.page)];
  expect(his.friends).toEqual(hers.friends);
  expect((await mate(page)).roped).toBe(false);

  // Ana lifts, and Ben rests: her arm lifts nothing on his screen, and his friends wait for him.
  await childLifts(ben.page, { lifts: false });
  await childLifts(page, { high: 1.2 });
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  const resting = await state(ben.page);
  expect([resting.stats.freed, resting.index]).toEqual([0, 0]);
  expect(resting.height).toBeLessThan(0.05);
  // He sees her lifter lifting, and her count going up, at the top.
  await expectSoon(async () => (await scores(ben.page))[0], { timeout: 15_000 }).toEqual(['Ana', 1]);
  await ben.page.waitForTimeout(300);
  await shot(ben.page, 'lift-friends-against');

  // She frees all five, and that's the end of it for both of them.
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  await stopChild(page);
  await stopChild(ben.page);
  await expect(page.locator('#finish-title')).toHaveText('You freed the most friends!');
  await expect(ben.page.locator('#finish-title')).toHaveText('Great lifting!');
  const rows = (each) => each.locator('.friends-results li').evaluateAll((list) => list.map((row) => row.textContent.replace(/\s+/g, ' ').trim()));
  expect(await rows(page)).toEqual(['1st You 5 friends freed', '2nd Ben 0 friends freed']);
  expect(await rows(ben.page)).toEqual(['1st Ana 5 friends freed', '2nd You 0 friends freed']);
  await expect(ben.page.locator('#finish-freed')).toHaveText('0 friends');
  await ben.page.waitForTimeout(500);
  await shot(ben.page, 'lift-friends-against-finish');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, a friend who goes in the middle leaves the other to lift on, with all of the weight on their own arm', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openLift(page, { lifts: 5 });
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await getReady(page);
  await getReady(ben.page);
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  await childLifts(ben.page, { lifts: false });
  // With Ben there and resting, Ana's arm alone gets the weight half way.
  await childLifts(page, { high: 1.2 });
  await expectSoon(async () => (await state(page)).height, { timeout: 20_000 }).toBeGreaterThan(0.5);
  expect((await state(page)).height).toBeLessThan(0.75);
  await ben.context.close();
  // He's gone: his lifter goes with him, and her arm is all of it now.
  await expectSoon(async () => (await mate(page)).gone, { timeout: 20_000 }).toBe(true);
  await expect(page.locator('.lifter-mark[data-where="on"]')).toHaveCount(0);
  await expectSoon(async () => (await state(page)).height, { timeout: 20_000 }).toBeGreaterThan(1);
  await expectSoon(() => scores(page), { timeout: 10_000 }).toHaveLength(1);
  await waitForScreen(page, 'finish');
  await stopChild(page);
  await expect(page.locator('#finish-freed')).toHaveText('5 friends');
});
