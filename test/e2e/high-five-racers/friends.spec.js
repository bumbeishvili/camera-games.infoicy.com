// Racing friends: two children, each on their own computer with their own camera, race each other. Here
// they're two separate browsers, talking through the race server on this computer (tools/race-server.mjs),
// which has the same rules as the one on Cloudflare.
import { expect, openGame, screenName, show, test, waitForScreen } from '../helpers.js';

const raceOf = (page) => page.evaluate(() => {
  const { race, session } = window.__game;
  return {
    distance: race.distance,
    level: race.level,
    laps: race.laps,
    friends: race.friends?.map((friend) => ({ name: friend.spec.name, distance: friend.distance })) ?? null,
    rivals: race.rivals.length,
    ownLevel: session.levels.current,
  };
});

/** A second player, in a browser of their own, with the same checks for errors as the first. */
async function secondPlayer(browser) {
  const context = await browser.newContext({ baseURL: 'http://localhost:8642' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`logged: ${message.text()}`);
  });
  return { context, page, errors };
}

/** A grown-up makes a race, and gets its code. */
async function makeRace(page, name) {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-name').fill(name);
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{6}$/);
  return page.locator('#friends-code-shown').textContent();
}

test('two friends race each other from their own computers, on the host\'s course, and see each other go', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { laps: 1, fighter: 'kit', levels: { 'high-five-racers': 3 } });
  const code = await makeRace(page, 'Dato');
  expect(page.url()).toContain(`#race=${code}`);
  await expect(page.locator('#friends-here li')).toHaveCount(1);

  // The friend opens the link on their own computer, at a level of their own.
  const friend = await secondPlayer(browser);
  await openGame(friend.page, { laps: 4, fighter: 'joze' }, 'high-five-racers', `#race=${code}`);
  await expect(friend.page.locator('#friends-code-shown')).toHaveText(code);
  for (const each of [page, friend.page]) {
    await expect(each.locator('#friends-here li')).toHaveCount(2);
    await expect(each.locator('#friends-here')).toContainText('Dato');
    await expect(each.locator('#friends-here')).toContainText('Joze');
  }
  await expect(page.locator('#friends-here')).toContainText('Dato (you)');

  // The host is ready first, and waits for the friend.
  await show(page, null, 'open');
  await show(friend.page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'waiting');
  await expect(page.locator('#friends-waiting')).toContainText('Ready');
  await expect(page.locator('#friends-now')).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/racers-friends-waiting.png' });
  await friend.page.locator('#start').click();
  await expect(friend.page.locator('#friends-now')).toBeHidden();

  // Once both are ready, both count down together, on the host's course: level 3, one lap.
  await waitForScreen(page, 'playing');
  await waitForScreen(friend.page, 'playing');
  const host = await raceOf(page);
  const guest = await raceOf(friend.page);
  expect([host.level, host.laps, guest.level, guest.laps]).toEqual([3, 1, 3, 1]);
  expect(host.friends.map(({ name }) => name)).toEqual(['Joze']);
  expect(guest.friends.map(({ name }) => name)).toEqual(['Dato']);

  // Each sees the other's car where it really is, a moment ago.
  await expect.poll(async () => (await raceOf(friend.page)).distance, { timeout: 30_000 }).toBeGreaterThan(60);
  const [seen, own] = await Promise.all([raceOf(page), raceOf(friend.page)]);
  expect(seen.friends[0].distance).toBeGreaterThan(40);
  expect(Math.abs(seen.friends[0].distance - own.distance)).toBeLessThan(15);
  await page.screenshot({ path: 'test-results/screens/racers-friends-racing.png' });

  // The host crosses the line first, and the friend after.
  await page.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 8;
  });
  await friend.page.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 70;
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You won the race!');
  await expect(page.locator('.friends-results li')).toHaveCount(2);
  await expect(page.locator('.friends-results li').nth(1)).toContainText('still racing');
  await waitForScreen(friend.page, 'finish');
  await expect(friend.page.locator('#screen-finish h2')).toHaveText('Great racing!');
  await expect(friend.page.locator('.friends-results li').nth(0)).toContainText('1st Dato');
  await expect(friend.page.locator('.friends-results li').nth(1)).toContainText('2nd You');
  // The host's card fills in as the friend gets there.
  await expect(page.locator('.friends-results li').nth(1)).toContainText('2nd Joze');
  await page.screenshot({ path: 'test-results/screens/racers-friends-finish.png' });

  // Racing friends doesn't move anyone's own level on.
  expect((await raceOf(page)).ownLevel).toBe(3);
  expect((await raceOf(friend.page)).ownLevel).toBe(1);
  // The only connection off the page was to the race server.
  expect(sockets).toEqual([`ws://localhost:8643/room/${code}`]);

  // Racing again waits for both again.
  await page.locator('#play-again').click();
  await waitForScreen(page, 'waiting');
  await friend.page.locator('#play-again').click();
  await waitForScreen(page, 'countdown');
  await waitForScreen(friend.page, 'countdown');

  expect(friend.errors).toEqual([]);
  await friend.context.close();
  // The friend has gone, mid-race, and their car with them.
  await expect.poll(async () => (await raceOf(page)).friends?.length, { timeout: 15_000 }).toBe(0);
});

test('a race with nobody else in it can still be raced alone, against the usual cars', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);
  await makeRace(page, '');
  await show(page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'waiting');
  await expect(page.locator('#friends-wait-status')).toContainText('Nobody else is here yet');
  await page.locator('#friends-alone').click();
  await waitForScreen(page, 'playing');
  const race = await raceOf(page);
  expect(race.friends).toBe(null);
  expect(race.rivals).toBeGreaterThanOrEqual(3);
  expect(await page.evaluate(() => location.hash)).toBe('');
});

test('a wrong code is caught before anything is sent, and the race server can be left', async ({ page }) => {
  await openGame(page);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-code').fill('hello');
  await page.locator('#friends-join button').click();
  await expect(page.locator('#friends-status')).toHaveText('A race code is 6 letters and numbers.');
  expect(sockets).toEqual([]);
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{6}$/);
  await page.locator('#friends-leave').click();
  await expect(page.locator('#friends-out')).toBeVisible();
  expect(await screenName(page)).toBe('welcome');
});
