// Playing Balloon Pop with friends: two children, each on their own computer with their own camera, play for
// the same time, and whoever pops the most, or gets the most sums right, comes first. Here they're two
// separate browsers, talking through the race server on this computer (tools/race-server.mjs).
import { expect, openGame, show, test, waitForScreen } from '../helpers.js';

const GAME = 'balloon-pop';

const popOf = (page) => page.evaluate(() => {
  const { game, balloons, deck } = window.__game;
  return {
    timed: game.timed ? { ...game.timed } : null,
    level: balloons.level ?? null,
    total: balloons.total,
    maths: deck ? deck.kind ?? 'on' : 'off',
    ownLevel: window.__game.session.levels.current,
    scores: [...document.querySelectorAll('#pop-scores li')].map((row) => row.textContent.replace(/\s+/g, ' ').trim()),
  };
});

/** Another player, in a browser of their own, with the same checks for errors. */
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

/**
 * Puts a balloon that doesn't move right where the hand's glove is, and waits for it to pop. The hand is out
 * of view the rest of the time, so that balloons drifting into it don't pop too, and each score is exact.
 */
async function popOne(page) {
  const before = (await popOf(page)).total;
  await show(page, null, 'open');
  await expect.poll(() => page.evaluate(() => window.__game.balloons.gloves.right.visible)).toBe(true);
  await page.evaluate(() => {
    const { balloons } = window.__game;
    const glove = balloons.gloves.right;
    balloons.spawnAt(glove.x, glove.y, { still: true });
  });
  // Reach help draws balloons near an open hand to it, so more than one can pop.
  await expect.poll(async () => (await popOf(page)).total, { timeout: 15_000 }).toBeGreaterThan(before);
  await show(page, null, null);
  await expect.poll(() => page.evaluate(() => window.__game.balloons.gloves.right.visible)).toBe(false);
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
    await show(each, null, 'open');
    await each.locator('#start').click();
  }
  await waitForScreen(page, 'playing');
  await waitForScreen(other, 'playing');
  // Hands out of view, and anything a balloon drifting into a hand popped before then not counted.
  for (const each of [page, other]) {
    await show(each, null, null);
    await expect.poll(() => each.evaluate(() => window.__game.balloons.gloves.right.visible)).toBe(false);
    await each.evaluate(() => {
      const { popped } = window.__game.balloons;
      popped.left = 0;
      popped.right = 0;
    });
  }
}

/** The time runs out, for both. */
async function timeUp(page, other) {
  for (const each of [page, other]) {
    await each.evaluate(() => {
      window.__game.game.timed.left = 0.5;
    });
  }
  await waitForScreen(page, 'finish');
  await waitForScreen(other, 'finish');
}

test('two friends pop balloons for the same time, see each other\'s scores, and whoever pops the most comes first', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { balloons: 20, maths: 'off', levels: { 'balloon-pop': 2 } }, GAME);
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#pop=${code}`);
  await expect(page.locator('#friends-toggle')).toHaveText('Play with a friend');

  // The friend has 60 balloons and times tables of their own, but plays the host's game.
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { balloons: 60, maths: 'times' }, GAME, `#pop=${code}`);
  // Typed straight away, as the link is opened, even before the connection is up.
  await ben.page.locator('#friends-name').fill('Ben');
  await ben.page.locator('#friends-name').dispatchEvent('change');
  for (const each of [page, ben.page]) await expect(each.locator('#friends-here li')).toHaveCount(2);
  await expect(page.locator('#friends-here')).toContainText('Ben');

  await bothPlaying(page, ben.page);
  const ana = await popOf(page);
  const his = await popOf(ben.page);
  expect([ana.timed.seconds, his.timed.seconds]).toEqual([60, 60]);
  expect([ana.maths, his.maths]).toEqual(['off', 'off']);
  await expect(page.locator('#chip-time-box')).toBeVisible();
  await expect(page.locator('#chip-popped')).toHaveText('0');

  // Each pops some for real, and the other sees it straight away.
  await popOne(page);
  await popOne(ben.page);
  const anaReal = (await popOf(page)).total;
  const benReal = (await popOf(ben.page)).total;
  await expect(ben.page.locator('#pop-scores')).toContainText(new RegExp(`Ana\\s*${anaReal}`));
  await expect(page.locator('#pop-scores')).toContainText(new RegExp(`Ben\\s*${benReal}`));
  // Then exactly 5 for Ana and 2 for Ben, as drifting balloons can make real pops uneven.
  for (const [each, right] of [[page, 5], [ben.page, 2]]) {
    await each.evaluate((count) => {
      const { popped } = window.__game.balloons;
      popped.left = 0;
      popped.right = count;
    }, right);
  }
  const [anaPopped, benPopped] = [5, 2];
  await expect(ben.page.locator('#pop-scores li').nth(0)).toHaveText(new RegExp(`Ana\\s*${anaPopped}$`));
  await expect(ben.page.locator('#pop-scores li').nth(1)).toHaveText(new RegExp(`You\\s*${benPopped}$`));
  await expect(page.locator('#pop-scores li').nth(1)).toHaveText(new RegExp(`Ben\\s*${benPopped}$`));
  await page.screenshot({ path: 'test-results/screens/pop-friends-playing.png' });

  await timeUp(page, ben.page);
  await expect(page.locator('#screen-finish h2')).toHaveText('You popped the most!');
  await expect(page.locator('.friends-results li').nth(0)).toContainText(`1st You ${anaPopped} popped`);
  await expect(page.locator('.friends-results li').nth(1)).toContainText(`2nd Ben ${benPopped} popped`);
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('Great popping!');
  await page.screenshot({ path: 'test-results/screens/pop-friends-finish.png' });

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect((await popOf(page)).ownLevel).toBe(2);
  expect(await ben.page.evaluate(() => window.__game.session.settings.maths)).toBe('times');
  expect(sockets).toEqual([`ws://localhost:8643/room/balloon-pop/${code}`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('with the host\'s maths challenge on, everyone does the same kind of sums, and the same score shares a place', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { balloons: 40, maths: 'add' }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { maths: 'off' }, GAME, `#pop=${code}`);
  await bothPlaying(page, ben.page);
  const [ana, his] = [await popOf(page), await popOf(ben.page)];
  expect([ana.timed.seconds, his.timed.seconds]).toEqual([120, 120]);
  expect(his.maths).not.toBe('off');
  await expect(ben.page.locator('#chip-popped-label')).toHaveText('Right answers');

  // Two right each.
  for (const each of [page, ben.page]) {
    await each.evaluate(() => {
      window.__game.balloons.popped.right = 2;
    });
  }
  await expect(page.locator('#pop-scores li')).toHaveCount(2);
  await timeUp(page, ben.page);
  await expect(page.locator('#screen-finish h2')).toHaveText('You got the most right!');
  await expect(page.locator('.friends-results li').nth(0)).toContainText('1st');
  await expect(page.locator('.friends-results li').nth(1)).toContainText('1st');
  await expect(page.locator('.friends-results')).toContainText('2 right');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('on their own, a game goes to its usual goal, and nothing connects anywhere', async ({ page }) => {
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { balloons: 20 }, GAME);
  await show(page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  expect((await popOf(page)).timed).toBe(null);
  await expect(page.locator('#chip-popped')).toHaveText('0 of 20');
  await expect(page.locator('#chip-time-box')).toBeHidden();
  await expect(page.locator('#pop-scores')).toBeHidden();
  expect(sockets).toEqual([]);
});
