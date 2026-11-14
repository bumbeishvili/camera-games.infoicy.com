// Playing Gobble and Grow with friends: children on their own computers, each with their own camera. Whoever makes
// the game chooses whether it's played together, all eating from one soup to grow as one, or against each other,
// each in their own soup with the same things in it, to see who grows up first. Here they're separate browsers,
// talking through the race server on this computer (tools/race-server.mjs), each with the drawn face for a camera.
import { atLevel, expect, expectSoon, face, openGobble, passCheck, playChild, SHUT, shot, state, stopChild, test, waitForScreen } from './helpers.js';

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
  await page.locator('#friends-name').fill(name);
  await page.locator('#friends-name').dispatchEvent('change');
  return page.locator('#friends-code-shown').textContent();
}

async function joinGame(browser, code, name, settings = {}) {
  const friend = await secondPlayer(browser);
  await openGobble(friend.page, settings, `#gobble=${code}`);
  await friend.page.locator('#friends-name').fill(name);
  await friend.page.locator('#friends-name').dispatchEvent('change');
  return friend;
}

/** Everyone gets through the mouth check, waits for the others, and then they all play. */
async function allPlaying(pages) {
  for (const each of pages) {
    await face(each, { open: SHUT });
    await each.locator('#start').click();
  }
  for (const each of pages) await passCheck(each);
  for (const each of pages) await waitForScreen(each, 'playing');
}

/** The friends' creatures on a child's screen, as their games said a moment ago. */
const friendsOn = (page) => page.evaluate(() => window.__game.game.friendsShown().map(({ name, x, y, r, mouth }) => ({ name, x, y, r, mouth })));

test('two friends eat from one soup and grow as one: either one\'s bite counts for both, and the world is won together', async ({ page, browser, baseURL }) => {
  test.setTimeout(480_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  // Together is how it comes, without anyone choosing.
  await openGobble(page, { gobbleBites: 8, ...atLevel(3) });
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#gobble=${code}`);
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeEnabled();
  await expect(page.locator('#friends-how')).toContainText('eat from the same soup');

  // The friend has their own level, how much to eat and choice of how to play, but plays the host's game.
  const ben = await joinGame(browser, code, 'Ben', { gobbleBites: 16, gobbleFriends: 'against', fighter: 'kit', ...atLevel(7) });
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeDisabled();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');
  await shot(page, 'gobble-friends-box');
  await allPlaying([page, ben.page]);

  const [hers, his] = [await state(page), await state(ben.page)];
  expect([hers.together, his.together]).toEqual([true, true]);
  // As much as each would have on the host's game, added up, in the host's world.
  expect([hers.goal, his.goal]).toEqual([16, 16]);
  expect([hers.level, his.level]).toEqual([3, 3]);
  expect([hers.world, his.world]).toEqual(['fish', 'fish']);
  expect(hers.seed).toBe(his.seed);
  await expect(page.locator('#chip-team')).toHaveText('0 of 16');
  await expect(ben.page.locator('#chip-team')).toBeVisible();

  // The same things in the same places on both screens, give or take a moment.
  const [here, there] = await Promise.all([state(page), state(ben.page)]);
  const shared = here.foods.filter((food) => there.foods.some((other) => other.id === food.id));
  expect(shared.length).toBeGreaterThanOrEqual(3);
  for (const food of shared) {
    const other = there.foods.find((each) => each.id === food.id);
    expect(Math.hypot(food.x - other.x, food.y - other.y)).toBeLessThan(0.08);
  }

  // Ana eats, and Ben only watches: his creature grows with hers, and what she eats is gone from his soup.
  await playChild(page);
  await expectSoon(async () => (await state(ben.page)).total, { timeout: 90_000 }).toBeGreaterThanOrEqual(3);
  const watching = await state(ben.page);
  expect(watching.eaten).toBe(0);
  expect(watching.creature.r).toBeGreaterThan(his.creature.r);
  await expect(ben.page.locator('#chip-bites')).toHaveText('0');
  await expectSoon(async () => (await state(page)).total).toBeGreaterThanOrEqual(watching.total);
  const ana = await state(page);
  expect(Math.abs(ana.creature.r - (await state(ben.page)).creature.r)).toBeLessThan(0.02);
  // Each sees the other's creature, with their name over it, where it really is.
  await expectSoon(async () => (await friendsOn(ben.page)).map((friend) => friend.name)).toEqual(['Ana']);
  await expectSoon(async () => (await friendsOn(page)).map((friend) => friend.name)).toEqual(['Ben']);
  const [seen] = await friendsOn(ben.page);
  const really = (await state(page)).creature;
  expect(Math.hypot(seen.x - really.x, seen.y - really.y)).toBeLessThan(0.3);
  await shot(page, 'gobble-friends-together-host');
  await shot(ben.page, 'gobble-friends-together-friend');

  // Ben joins in, and between them they eat it all: the world is won for both at once.
  await playChild(ben.page);
  await expectSoon(async () => (await state(page)).won, { timeout: 240_000 }).toBe(true);
  await expectSoon(async () => (await state(ben.page)).won, { timeout: 20_000 }).toBe(true);
  await stopChild(page);
  await stopChild(ben.page);
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  const [hersEnd, hisEnd] = [await state(page), await state(ben.page)];
  expect(hersEnd.total).toBe(16);
  expect(hisEnd.total).toBe(16);
  expect(hersEnd.eaten + hisEnd.eaten).toBe(16);
  expect(hisEnd.eaten).toBeGreaterThanOrEqual(1);

  // Nobody is placed: everyone is on the same side, and each one's bites are said.
  for (const each of [page, ben.page]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('You grew together!');
    await expect(each.locator('.friends-results')).toHaveClass(/is-team/);
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('#finish-ladder')).toBeHidden();
  }
  await expect(page.locator('.friends-results li.is-you .friends-time')).toHaveText(`${hersEnd.eaten} ${hersEnd.eaten === 1 ? 'bite' : 'bites'}`);
  await expect(page.locator('.friends-results')).toContainText('Ben');
  await page.waitForTimeout(600);
  await shot(page, 'gobble-friends-together-finish');
  // A game with friends doesn't move anyone's own level on.
  expect([hersEnd.ownLevel, hisEnd.ownLevel]).toEqual([3, 7]);
  // Only the friends server on this computer was spoken to.
  const port = Number(new URL(baseURL).port) + 1;
  expect(sockets.length).toBeGreaterThanOrEqual(1);
  expect(sockets.every((url) => url.startsWith(`ws://localhost:${port}/room/gobble-grow/${code}`))).toBe(true);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('against each other, each has the same things in their own soup, and the first to eat it all has grown up first', async ({ page, browser }) => {
  test.setTimeout(480_000);
  await openGobble(page, { gobbleBites: 8, ...atLevel(2) });
  const code = await makeGame(page, 'Ana');
  // Whoever made the game chooses against each other, there in the box: it's kept with the grown-ups' settings.
  await page.locator('input[name="friends-team"][value="against"]').check();
  expect(await page.evaluate(() => window.__game.session.settings.gobbleFriends)).toBe('against');
  await expect(page.locator('input[name="gobbleFriends"][value="against"]')).toBeChecked();
  await expect(page.locator('#friends-how')).toContainText('see who grows up first');

  const ben = await joinGame(browser, code, 'Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeDisabled();
  // His own choice, for the games he makes himself, is as it was.
  expect(await ben.page.evaluate(() => window.__game.session.settings.gobbleFriends)).toBe('together');
  await allPlaying([page, ben.page]);

  const [hers, his] = [await state(page), await state(ben.page)];
  expect([hers.together, his.together]).toEqual([false, false]);
  expect([hers.goal, his.goal]).toEqual([8, 8]);
  expect([hers.level, his.level]).toEqual([2, 2]);
  expect(hers.seed).toBe(his.seed);
  await expect(page.locator('#chip-team')).toBeHidden();
  await expect(page.locator('#chip-bites')).toHaveText('0 of 8');

  // Ana eats, and Ben rests: nothing is taken from his soup, and he sees how she's doing.
  await playChild(page);
  await expectSoon(async () => (await state(page)).eaten, { timeout: 90_000 }).toBeGreaterThanOrEqual(3);
  const resting = await state(ben.page);
  expect(resting.eaten).toBe(0);
  expect(resting.total).toBe(0);
  expect(resting.creature.r).toBe(his.creature.r);
  await expectSoon(async () => (await friendsOn(ben.page))[0]?.name ?? '').toMatch(/^Ana [3-8]$/);
  const [seen] = await friendsOn(ben.page);
  expect(seen.r).toBeGreaterThan(resting.creature.r);
  await shot(ben.page, 'gobble-friends-against-friend');

  // She eats it all, and has grown up first. With friends there's no next world to pull back to.
  await expectSoon(async () => (await state(page)).won, { timeout: 200_000 }).toBe(true);
  await stopChild(page);
  await waitForScreen(page, 'finish');
  expect((await state(page)).pulling).toBe(false);
  await expect(page.locator('#screen-finish h2')).toHaveText('You grew up first!');
  await expect(page.locator('.friends-results li.is-you .friends-place')).toHaveText('1st');
  await expect(page.locator('.friends-results li.is-racing')).toContainText('still eating');

  // Ben gets going, and finishes in his own time: nobody loses.
  await playChild(ben.page);
  await expectSoon(async () => (await state(ben.page)).won, { timeout: 240_000 }).toBe(true);
  await stopChild(ben.page);
  await waitForScreen(ben.page, 'finish');
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('All grown up!');
  await expect(ben.page.locator('.friends-results li.is-you .friends-place')).toHaveText('2nd');
  await expect(page.locator('.friends-results li')).toHaveCount(2);
  await expect(page.locator('.friends-results')).toContainText('Ben');
  await expect(page.locator('.friends-results li.is-racing')).toHaveCount(0);
  await page.waitForTimeout(600);
  await shot(page, 'gobble-friends-against-finish');
  expect([(await state(page)).ownLevel, (await state(ben.page)).ownLevel]).toEqual([2, 1]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, a friend who goes takes their share of what there was to eat with them', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGobble(page, { gobbleBites: 8 });
  const code = await makeGame(page, 'Ana');
  const ben = await joinGame(browser, code, 'Ben');
  await allPlaying([page, ben.page]);
  expect((await state(page)).goal).toBe(16);
  await expect(page.locator('#chip-team')).toHaveText('0 of 16');
  // Ben's computer goes: after a moment, what's left to eat is what one would have.
  await ben.context.close();
  await expectSoon(async () => (await state(page)).goal, { timeout: 30_000 }).toBe(8);
  await expect(page.locator('#chip-team')).toHaveText('0 of 8');
  expect(await friendsOn(page)).toEqual([]);
  // And Ana can still win it, on her own.
  await playChild(page);
  await expectSoon(async () => (await state(page)).won, { timeout: 200_000 }).toBe(true);
  await stopChild(page);
  await waitForScreen(page, 'finish');
});

test('a fifth friend is told the game already has four players', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await openGobble(page);
  const code = await makeGame(page, 'Ana');
  const others = [];
  for (const name of ['Ben', 'Cal', 'Dee']) others.push(await joinGame(browser, code, name));
  await expect(page.locator('#friends-here li')).toHaveCount(4);
  const fifth = await secondPlayer(browser);
  await openGobble(fifth.page, {}, `#gobble=${code}`);
  await expect(fifth.page.locator('#friends-status')).toHaveText('That game already has 4 players.');
  for (const each of [...others, fifth]) await each.context.close();
});
