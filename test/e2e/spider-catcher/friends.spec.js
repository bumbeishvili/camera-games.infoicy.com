// Playing Spider Catcher with friends: each on their own computer with their own camera, all in the same garden,
// catching from the same spiders. Every game makes the same spiders from the seed it's given, and they go round by the
// same clock. Whoever's hand closes on a spider first has it, as the server decides, and it rides in their glove on
// every screen until they take it home. Here they're separate browsers, talking through the race server on this
// computer (tools/race-server.mjs).
import { expect, openGame, show, shot, test, waitForScreen } from '../helpers.js';
import { judgeBrightness, watchBrightness } from '../story-games/helpers.js';
import { GAME } from './helpers.js';

/* ---------- getting into a game together ---------- */

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

async function giveName(page, name) {
  if (!name) return;
  await page.locator('#friends-name').fill(name);
  await page.locator('#friends-name').dispatchEvent('change');
}

/** A grown-up makes a game, and gets its code. */
async function makeGame(page, name) {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  await giveName(page, name);
  return page.locator('#friends-code-shown').textContent();
}

/** A friend opens the game with their own settings, and types the code, which joins as soon as it's typed. */
async function joinGame(page, code, settings = {}, name = '') {
  await openGame(page, settings, GAME);
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-code').fill(code);
  await expect(page.locator('#friends-code-shown')).toHaveText(code);
  await giveName(page, name);
}

/** The hand each page plays with, open in the picture, as anyone's would be. */
const openHand = (page, side = 'right') => show(page, side === 'left' ? 'open' : null, side === 'right' ? 'open' : null, { scale: 0.7 });

/** Everyone gets through the hand check and waits for each other, and then they all play. */
async function allPlaying(...players) {
  for (const { page, side } of players) {
    await openHand(page, side);
    await page.locator('#start').click();
  }
  for (const { page } of players) await waitForScreen(page, 'playing');
}

/* ---------- what's in the garden ---------- */

/** How it is on one child's screen, with where things are in the garden friends share. */
const view = (page) => page.evaluate(() => {
  const { garden, gathering, game, session } = window.__game;
  const common = ({ x, y }) => garden.toCommon(x, y);
  const mine = garden.gloves[garden.side];
  const { web } = garden;
  return {
    screen: session.screen,
    you: game.friends.room.you,
    hosting: game.friends.room.hosting,
    shared: Boolean(garden.shared),
    level: garden.levelNumber,
    ownLevel: session.levels.current,
    place: gathering.index,
    home: gathering.stats.home,
    total: gathering.total,
    counts: gathering.places.map(({ count }) => count),
    mine: garden.mine,
    clock: garden.playTime,
    web: common(web),
    webOnScreen: web.x / garden.width,
    glove: mine.visible ? common(mine) : null,
    holding: garden.holding ? garden.holding.index : null,
    out: garden.spiders.filter(({ state }) => state !== 'home' && state !== 'landing').length,
    spiders: garden.spiders.map((spider) => ({
      index: spider.index,
      kind: spider.kind,
      colour: spider.colour,
      slot: spider.slot,
      phase: spider.path.phase,
      state: spider.state,
      holder: spider.holder,
      catchable: garden.catchable(spider),
      at: common(spider),
      screen: { x: spider.x / garden.width, y: spider.y / garden.height },
    })),
    friends: game.friendsGloves.map(({ id, name, n, glove }) => ({
      id,
      name,
      n,
      seen: glove.visible,
      at: glove.visible ? common(glove) : null,
      atWeb: glove.visible && Math.hypot(glove.x - web.x, glove.y - web.y) <= web.reach,
    })),
  };
});

const spiderIn = (seen, index) => seen.spiders.find((spider) => spider.index === index);

/**
 * Keeps the real hand's picture moving, in the page, so the glove goes to what's wanted: a spider at this place by where
 * it comes in the line, 'web', or a point, in shares of the screen. The photo, open or fist, is changed with photoIs.
 * Runs until stopHand.
 */
const aimHand = (page, at, { side = 'right', photo = 'open' } = {}) => page.evaluate(({ aim, hand, picture }) => {
  window.__aim?.stop();
  let x = window.__aim?.x ?? 0;
  let y = window.__aim?.y ?? 0;
  const timer = setInterval(() => {
    const { garden } = window.__game;
    const glove = garden.gloves[hand];
    let wanted = null;
    if (aim === 'web') wanted = garden.web;
    else if (typeof aim === 'number') wanted = garden.spiders.find((spider) => spider.index === aim) ?? null;
    else wanted = { x: aim.x * innerWidth, y: aim.y * innerHeight };
    if (glove.visible && wanted) {
      x += ((wanted.x - glove.x) / innerWidth) * 1280 * 0.15;
      y += ((wanted.y - glove.y) / innerHeight) * 720 * 0.15;
    }
    const shown = window.__aim.photo;
    window.__camera.show({ left: hand === 'left' ? shown : null, right: hand === 'right' ? shown : null, scale: 0.7, [`${hand}OffsetX`]: x, [`${hand}OffsetY`]: y });
    window.__aim.x = x;
    window.__aim.y = y;
  }, 33);
  window.__aim = { x, y, photo: window.__aim?.photo ?? picture, stop: () => clearInterval(timer) };
  window.__aim.photo = picture;
}, { aim: at, hand: side, picture: photo });

const photoIs = (page, photo) => page.evaluate((picture) => {
  window.__aim.photo = picture;
}, photo);

const stopHand = (page) => page.evaluate(() => window.__aim?.stop());

/** Keeps the spiders where they are, on every screen alike, so a hand can be put on one with a still photo. */
const holdStill = (page) => page.evaluate(() => {
  for (const spider of window.__game.garden.spiders) spider.path.rate = 0;
});

const near = (a, b, within) => Math.hypot(a.x - b.x, a.y - b.y) < within;

/** Waits until the glove is by a spider, the nearest one it could catch, or at the web. */
const gloveBy = (page, target) => expect.poll(() => page.evaluate((aim) => {
  const { garden } = window.__game;
  const glove = garden.gloves[garden.side];
  if (!glove.visible) return false;
  if (aim === 'web') return garden.atHome(garden.web);
  const spider = garden.spiders.find((each) => each.index === aim);
  return Boolean(spider) && garden.spiderNear(glove) === spider;
}, target), { timeout: 30_000, intervals: [100] }).toBe(true);

/** Waits until the tracker sees the hand in play as open or closed. */
const handSeen = (page, status) => expect.poll(() => page.evaluate(() => {
  const { garden, monitor } = window.__game;
  return monitor.snapshot[garden.side].status;
}), { timeout: 20_000 }).toBe(status);

/** A real hand opens by a spider and closes on it, until it's caught. Returns the one it caught. */
async function catchWith(page, index, side = 'right') {
  await aimHand(page, index, { side });
  await gloveBy(page, index);
  await handSeen(page, 'open');
  await photoIs(page, 'fist');
  await expect.poll(async () => (await view(page)).holding, { timeout: 15_000 }).not.toBe(null);
  return (await view(page)).holding;
}

/**
 * A spider that can be caught on every one of these screens, held still on all of them: the one furthest from any
 * other, so a hand closing on it closes on that one, not one beside it.
 */
async function stillSpider(...pages) {
  await Promise.all(pages.map(holdStill));
  let found = null;
  await expect.poll(async () => {
    const seen = await Promise.all(pages.map(view));
    const catchable = seen[0].spiders.filter(({ index, catchable: free }) => free && seen.every((each) => spiderIn(each, index)?.catchable));
    // How far it is from the nearest other spider out, in screen heights, in the garden they all share.
    const apart = (spider) => Math.min(...seen[0].spiders.filter((other) => other !== spider && other.state !== 'home')
      .map((other) => Math.hypot((other.at.x - spider.at.x) * (16 / 9), other.at.y - spider.at.y)), Infinity);
    found = catchable.sort((a, b) => apart(b) - apart(a))[0]?.index ?? null;
    return found;
  }, { timeout: 15_000 }).not.toBe(null);
  await Promise.all(pages.map(holdStill));
  return found;
}

/**
 * Brings the rest of the spiders home, one at a time, each on the screen of whoever has brought fewer home, as if their
 * hand had, waiting each time for every screen to agree, until the game ends. So they end up equal, or one apart.
 */
async function shareTheRest(...pages) {
  for (let turn = 0; turn < 400; turn += 1) {
    const seen = await Promise.all(pages.map(view));
    if (seen.every(({ screen }) => screen === 'finish')) return;
    const agreed = seen.every((each) => each.screen === 'playing' && each.place === seen[0].place && each.home === seen[0].home && each.out > 0);
    if (agreed) {
      const fewest = seen.reduce((best, each, at) => (each.mine < seen[best].mine ? at : best), 0);
      await pages[fewest].evaluate(() => {
        const { garden } = window.__game;
        const spider = garden.spiders.find(({ state }) => state === 'playing' || state === 'returning');
        if (spider) garden.bringHome(spider);
      });
    }
    await pages[0].waitForTimeout(120);
  }
  throw new Error('The game never ended');
}

test('friends catch from the same spiders: the first hand on one has it, it rides in their glove on both screens, and taking it home is their point', async ({ page, browser }) => {
  test.setTimeout(480_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { reach: 'little', levels: { [GAME]: 6 } }, GAME);
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#spiders=${code}`);

  // Ben plays with his left hand, with more reach help, and is on level 1 himself, but plays Ana's game.
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { hands: 'left', reach: 'lots' }, 'Ben');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await allPlaying({ page, side: 'right' }, { page: ben.page, side: 'left' });
  await expect.poll(async () => (await view(page)).spiders.length, { timeout: 10_000 }).toBeGreaterThan(1);
  await expect.poll(async () => (await view(ben.page)).spiders.length, { timeout: 10_000 }).toBe((await view(page)).spiders.length);

  // The same spiders on both screens, at Ana's level, where they really are. Ben's garden is the other way round, for
  // his left hand, with the spiders nearer the web, for his reach help, but in the garden they share they're in the
  // same places.
  const plan = ({ index, kind, colour, slot, phase }) => ({ index, kind, colour, slot, phase });
  const [ana, his] = await Promise.all([view(page), view(ben.page)]);
  expect([ana.shared, his.shared]).toEqual([true, true]);
  expect([ana.level, his.level]).toEqual([6, 6]);
  expect(his.counts).toEqual(ana.counts);
  expect(his.spiders.map(plan)).toEqual(ana.spiders.map(plan));
  expect(Math.abs(ana.clock - his.clock)).toBeLessThan(0.3);
  for (const spider of ana.spiders) expect(near(spider.at, spiderIn(his, spider.index).at, 0.03), `spider ${spider.index}`).toBe(true);
  for (const spider of ana.spiders) expect(spider.screen.x).toBeGreaterThan(ana.webOnScreen);
  for (const spider of his.spiders) expect(spider.screen.x).toBeLessThan(his.webOnScreen);
  // The plain garden, with nothing the levels bring, and everyone's score.
  expect(ana.spiders.every(({ kind }) => kind === 'scuttle' || kind === 'dangle')).toBe(true);
  await expect(page.locator('.chip-berries')).toBeHidden();
  await expect(page.locator('#spider-scores li')).toHaveCount(2);
  await expect(ben.page.locator('#spider-scores li')).toHaveCount(2);

  // Each sees the other's glove, with their name, where it really is in the garden.
  await expect.poll(async () => (await view(page)).friends[0]?.seen, { timeout: 20_000 }).toBe(true);
  await expect.poll(async () => (await view(ben.page)).friends[0]?.seen, { timeout: 20_000 }).toBe(true);
  const [a1, b1] = await Promise.all([view(page), view(ben.page)]);
  expect(a1.friends[0]).toMatchObject({ id: b1.you, name: 'Ben' });
  expect(b1.friends[0]).toMatchObject({ id: a1.you, name: 'Ana' });
  expect(near(a1.friends[0].at, b1.glove, 0.03)).toBe(true);
  expect(near(b1.friends[0].at, a1.glove, 0.03)).toBe(true);
  await shot(page, 'spider-friends-1-host');
  await ben.page.screenshot({ path: 'test-results/screens/spider-friends-1-guest.png' });

  // Ana's hand closes on a spider: it's hers, and on Ben's screen it rides in her glove, all the way to the web.
  const target = await catchWith(page, await stillSpider(page, ben.page));
  await expect.poll(async () => spiderIn(await view(ben.page), target)?.holder, { timeout: 10_000 }).toBe(a1.you);
  await aimHand(page, 'web', { photo: 'fist' });
  await gloveBy(page, 'web');
  await expect.poll(async () => (await view(ben.page)).friends[0]?.atWeb, { timeout: 10_000 }).toBe(true);
  const [a2, b2] = await Promise.all([view(page), view(ben.page)]);
  expect(a2.holding).toBe(target);
  expect(spiderIn(b2, target)).toMatchObject({ holder: a2.you, state: 'held' });
  expect(near(spiderIn(b2, target).at, b2.friends[0].at, 0.04)).toBe(true);
  await shot(page, 'spider-friends-2-host-carrying');
  await ben.page.screenshot({ path: 'test-results/screens/spider-friends-2-guest-sees-it-carried.png' });

  // She opens her hand at the web: it's home on both screens, and a point for her on both.
  await photoIs(page, 'open');
  await expect.poll(async () => (await view(page)).mine, { timeout: 15_000 }).toBe(1);
  await expect.poll(async () => (await view(ben.page)).home, { timeout: 10_000 }).toBe(1);
  expect(spiderIn(await view(ben.page), target).state).toMatch(/landing|home/);
  await expect(page.locator('#spider-scores li.is-you')).toContainText(/You\s*1/);
  await expect(ben.page.locator('#spider-scores li').nth(0)).toContainText(/Ana\s*1/);
  await expect(ben.page.locator('#spider-scores li.is-you')).toContainText(/You\s*0/);
  await page.waitForTimeout(600);
  await ben.page.screenshot({ path: 'test-results/screens/spider-friends-3-guest-sees-it-home.png' });

  // Both hands close on the same spider at once: only one of them has it, the same one on both screens.
  const contest = await stillSpider(page, ben.page);
  await Promise.all([aimHand(page, contest), aimHand(ben.page, contest, { side: 'left' })]);
  await Promise.all([gloveBy(page, contest), gloveBy(ben.page, contest)]);
  await Promise.all([handSeen(page, 'open'), handSeen(ben.page, 'open')]);
  await Promise.all([photoIs(page, 'fist'), photoIs(ben.page, 'fist')]);
  await expect.poll(async () => spiderIn(await view(page), contest)?.holder ?? null, { timeout: 15_000 }).not.toBe(null);
  await page.waitForTimeout(1500);
  const [a3, b3] = await Promise.all([view(page), view(ben.page)]);
  const winner = spiderIn(a3, contest).holder;
  expect([a3.you, b3.you]).toContain(winner);
  expect(spiderIn(b3, contest).holder).toBe(winner);
  const [first, second] = winner === a3.you ? [a3, b3] : [b3, a3];
  expect(first.holding).toBe(contest);
  expect(second.holding).not.toBe(contest);

  // Whoever has it takes it home, and it's their point.
  const [firstPage, firstSide, secondPage, secondSide] = winner === a3.you ? [page, 'right', ben.page, 'left'] : [ben.page, 'left', page, 'right'];
  await stopHand(secondPage);
  await openHand(secondPage, secondSide);
  await aimHand(firstPage, 'web', { side: firstSide, photo: 'fist' });
  await gloveBy(firstPage, 'web');
  await photoIs(firstPage, 'open');
  await expect.poll(async () => (await view(page)).home, { timeout: 15_000 }).toBe(2);
  await expect.poll(async () => (await view(ben.page)).home, { timeout: 15_000 }).toBe(2);
  await expect.poll(async () => (await view(firstPage)).mine, { timeout: 5000 }).toBe(winner === a3.you ? 2 : 1);

  // The rest come home, through every place, and both games end together, with everyone's points on both finish
  // cards. Equal points share a place.
  for (const each of [page, ben.page]) {
    await stopHand(each);
    await show(each, null, null);
  }
  await shareTheRest(page, ben.page);
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  const [aEnd, bEnd] = await Promise.all([view(page), view(ben.page)]);
  expect(aEnd.home).toBe(aEnd.total);
  expect(aEnd.mine + bEnd.mine).toBe(aEnd.total);
  expect(aEnd.mine).toBe(bEnd.mine);
  const spiders = (n) => `${n} ${n === 1 ? 'spider' : 'spiders'}`;
  await expect(page.locator('.friends-results li')).toHaveCount(2);
  await expect(page.locator('.friends-results li').nth(0)).toContainText(`1st You ${spiders(aEnd.mine)}`);
  await expect(page.locator('.friends-results li').nth(1)).toContainText(`1st Ben ${spiders(bEnd.mine)}`);
  await expect(ben.page.locator('.friends-results li').nth(0)).toContainText(`1st You ${spiders(bEnd.mine)}`);
  await expect(ben.page.locator('.friends-results li').nth(1)).toContainText(`1st Ana ${spiders(aEnd.mine)}`);
  await expect(page.locator('#screen-finish h2')).toHaveText('You brought the most home!');
  await expect(page.locator('#finish-hero')).toHaveText(String(aEnd.mine));
  await page.waitForTimeout(600);
  await shot(page, 'spider-friends-4-finish');

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect(aEnd.ownLevel).toBe(6);
  expect(bEnd.ownLevel).toBe(1);
  expect(await ben.page.evaluate(() => window.__game.session.settings)).toMatchObject({ hands: 'left', reach: 'lots' });
  const port = Number(new URL(test.info().project.use.baseURL).port) + 1;
  expect(sockets).toEqual([`ws://localhost:${port}/room/spider-catcher/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a friend who goes takes their glove with them, a spider in it goes back to playing, and the other plays on to the end', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await openGame(page, {}, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await allPlaying({ page, side: 'right' }, { page: ben.page, side: 'right' });
  const target = await catchWith(ben.page, await stillSpider(page, ben.page));
  const { you: benId } = await view(ben.page);
  await expect.poll(async () => spiderIn(await view(page), target)?.holder, { timeout: 10_000 }).toBe(benId);
  expect(ben.errors).toEqual([]);
  await ben.context.close();

  // His glove goes from Ana's screen, and the spider in it runs free again, to be caught.
  await expect.poll(async () => (await view(page)).friends.length, { timeout: 30_000 }).toBe(0);
  await expect.poll(async () => spiderIn(await view(page), target)?.holder ?? null, { timeout: 5000 }).toBe(null);
  await expect.poll(async () => spiderIn(await view(page), target)?.catchable, { timeout: 5000 }).toBe(true);
  await expect(page.locator('#spider-scores li')).toHaveCount(1);
  await shot(page, 'spider-friends-5-friend-gone');

  // Ana plays on, and catches it herself.
  await catchWith(page, target);
  await aimHand(page, 'web', { photo: 'fist' });
  await gloveBy(page, 'web');
  await photoIs(page, 'open');
  await expect.poll(async () => (await view(page)).mine, { timeout: 15_000 }).toBe(1);
  await stopHand(page);
  await shareTheRest(page);
  await waitForScreen(page, 'finish');
  const { total } = await view(page);
  await expect(page.locator('.friends-results li')).toHaveCount(1);
  await expect(page.locator('.friends-results li').nth(0)).toContainText(`1st You ${total} spiders`);

  // On her own again after leaving the game: her own garden, the usual one.
  await page.locator('#friends-leave').evaluate((button) => button.click());
  await openHand(page);
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  expect((await view(page)).shared).toBe(false);
  await expect(page.locator('#spider-scores')).toBeHidden();
});

test('the host can go too: the game carries on for everyone else, and a spider in the host\'s glove goes back to playing', async ({ page, browser }) => {
  test.setTimeout(360_000);
  const ana = await secondPlayer(browser);
  await openGame(ana.page, {}, GAME);
  const code = await makeGame(ana.page, 'Ana');
  await joinGame(page, code, {}, 'Ben');
  await allPlaying({ page: ana.page, side: 'right' }, { page, side: 'right' });
  expect((await view(ana.page)).hosting).toBe(true);
  const target = await catchWith(ana.page, await stillSpider(ana.page, page));
  const { you: anaId } = await view(ana.page);
  await expect.poll(async () => spiderIn(await view(page), target)?.holder, { timeout: 10_000 }).toBe(anaId);
  expect(ana.errors).toEqual([]);
  await ana.context.close();

  // Ben's game carries on: Ana's glove goes, the spider she had runs free again, and Ben is the one hosting now.
  await expect.poll(async () => (await view(page)).friends.length, { timeout: 30_000 }).toBe(0);
  await expect.poll(async () => spiderIn(await view(page), target)?.holder ?? null, { timeout: 5000 }).toBe(null);
  expect((await view(page)).hosting).toBe(true);
  expect((await view(page)).screen).toBe('playing');
  await shareTheRest(page);
  await waitForScreen(page, 'finish');
  await expect(page.locator('.friends-results li')).toHaveCount(1);
  await expect(page.locator('.friends-results li').nth(0)).toContainText('1st You');
});

test('nothing flashes with friends: a friend\'s glove coming and going, carrying a spider to the web, and the places going by', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { levels: { [GAME]: 10 } }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await allPlaying({ page, side: 'right' }, { page: ben.page, side: 'right' });
  await catchWith(ben.page, await stillSpider(page, ben.page));
  // Measured on Ana's screen, as Ben carries his spider across to the web and lets it in, his hand goes from the
  // picture and comes back, and spiders come home on his screen every so often, so the places go by.
  const watching = watchBrightness(page, 420, ['backdrop', 'giraffe-stage', 'game']);
  await aimHand(ben.page, 'web', { photo: 'fist' });
  await gloveBy(ben.page, 'web');
  await photoIs(ben.page, 'open');
  await ben.page.evaluate(() => {
    window.__bringing = setInterval(() => {
      const { garden } = window.__game;
      const spider = garden.moving === 0 && garden.spiders.find((one) => garden.catchable(one));
      if (spider) garden.bringHome(spider);
    }, 700);
  });
  await ben.page.waitForTimeout(1000);
  await stopHand(ben.page);
  await show(ben.page, null, null);
  await ben.page.waitForTimeout(1000);
  await openHand(ben.page);
  const result = judgeBrightness(await watching);
  await ben.page.evaluate(() => clearInterval(window.__bringing));
  const { place, home } = await view(page);
  console.log('with friends', JSON.stringify(result), 'place', place, 'home', home);
  expect(place).toBeGreaterThanOrEqual(1);
  expect(result.biggestStep).toBeLessThan(3);
  expect(result.flickeringShare).toBeLessThan(0.02);
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
  for (const each of [...others, eve]) {
    expect(each.errors).toEqual([]);
    await each.context.close();
  }
});

test('on their own, it\'s the garden as always, and nothing connects anywhere', async ({ page }) => {
  test.setTimeout(150_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, {}, GAME);
  await openHand(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await expect.poll(async () => (await view(page)).spiders.length, { timeout: 5000 }).toBeGreaterThan(0);
  expect(await view(page)).toMatchObject({ shared: false, friends: [] });
  await expect(page.locator('#spider-scores')).toBeHidden();
  // A real hand still catches one and brings it home.
  await catchWith(page, await stillSpider(page));
  await aimHand(page, 'web', { photo: 'fist' });
  await gloveBy(page, 'web');
  await photoIs(page, 'open');
  await expect.poll(async () => (await view(page)).mine, { timeout: 15_000 }).toBe(1);
  await stopHand(page);
  // Straight on to the end.
  await page.evaluate(() => {
    const { gathering } = window.__game;
    gathering.index = gathering.places.length - 1;
    gathering.nextPlace();
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('.friends-results')).toBeHidden();
  await expect(page.locator('#screen-finish h2')).toHaveText('Every spider is home!');
  expect(sockets).toEqual([]);
});

