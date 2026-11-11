// Playing Cannon Bay with a friend: two children, each on their own computer with their own camera, battle each
// other, ship against ship, with no pirates. Each game sails its own ship, decides its own hits and sends them,
// and shows the friend's ship where it really is. Here they're two separate browsers, talking through the race
// server on this computer (tools/race-server.mjs).
import { expect, openGame, show, shot, test, waitForScreen } from '../helpers.js';
import { expectSoon, HAND_SCALE } from './helpers.js';

const GAME = 'cannon-bay';
const OPEN = [null, 'open', { scale: HAND_SCALE }];
const FIST = [null, 'fist', { scale: HAND_SCALE }];
const NO_HAND = [null, null, { scale: HAND_SCALE }];

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
  if (name) await nameIs(page, name);
  return page.locator('#friends-code-shown').textContent();
}

async function nameIs(page, name) {
  await page.locator('#friends-name').fill(name);
  await page.locator('#friends-name').dispatchEvent('change');
}

const screenOf = (page) => page.evaluate(() => window.__game.screen);

/**
 * Both get through the hand check and wait for each other, and then both play. after is what each camera shows
 * once its hand check is done, from waiting for the other onwards.
 */
async function bothPlaying(page, other, after = [OPEN, OPEN]) {
  for (const each of [page, other]) {
    await show(each, ...OPEN);
    await each.locator('#start').click();
  }
  for (const [index, each] of [page, other].entries()) {
    await expect.poll(() => screenOf(each), { timeout: 60_000, intervals: [50] }).toMatch(/^(waiting|countdown|playing)$/);
    await show(each, ...after[index]);
  }
  await waitForScreen(page, 'playing');
  await waitForScreen(other, 'playing');
}

/** How it is on one child's screen. */
const view = (page) => page.evaluate(() => {
  const { battle, duel, bay } = window.__game;
  const { friend } = battle;
  const ship = friend ? bay.shipFor(friend) : null;
  return {
    duel: duel ? { seconds: duel.seconds, left: duel.left, mine: duel.mine, theirs: duel.theirs, slot: duel.slot } : null,
    me: { x: battle.x, z: battle.z, sails: battle.sails },
    friend: friend ? { x: friend.x, z: friend.z, sails: friend.sails, state: friend.state, captain: ship?.spec.id ?? null, seen: Boolean(ship?.root.visible), hull: ship?.look.hull } : null,
    hull: bay.hero.look.hull,
    pirates: battle.afloat.filter((each) => !each.friend).length,
    level: battle.levelNumber,
    pace: battle.pace.speed,
    reach: battle.level.zone.reach,
    prizes: battle.plan.gems,
    hearts: battle.hearts,
    hits: battle.stats.hits,
    shots: battle.stats.shots,
    struck: battle.stats.struck,
    theirBalls: battle.balls.filter(({ homing }) => homing).length,
    state: battle.state,
    ownLevel: window.__game.session.levels.current,
  };
});

/**
 * Keeps this child's ship beside their friend's, as it's seen here: this far round from the friend's bow and this
 * far away, going the same way, as if the child had sailed there. Their game sees it there too, a moment later.
 * Runs until it's let go.
 */
const holdBeside = (page, { off = Math.PI / 2, away = 100 } = {}) => page.evaluate(([bearing, distance]) => {
  clearInterval(window.__beside);
  window.__beside = setInterval(() => {
    const { battle } = window.__game;
    const { friend } = battle;
    if (!friend || battle.state !== 'sailing') return;
    const direction = friend.heading + bearing;
    battle.x = friend.x + Math.sin(direction) * distance;
    battle.z = friend.z - Math.cos(direction) * distance;
    battle.heading = friend.heading;
  }, 16);
}, [off, away]);

const letGo = (page) => page.evaluate(() => clearInterval(window.__beside));

/** How bright the whole picture is, frame by frame, as in sound-and-safety.spec.js. */
const brightnessOverFrames = (page, frames) => page.evaluate(async (count) => {
  const { bay } = window.__game;
  const reading = [];
  const small = document.createElement('canvas');
  small.width = 32;
  small.height = 18;
  const context = small.getContext('2d', { willReadFrequently: true });
  for (let i = 0; i < count; i += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    bay.render();
    context.drawImage(bay.canvas, 0, 0, 32, 18);
    const { data } = context.getImageData(0, 0, 32, 18);
    let total = 0;
    for (let j = 0; j < data.length; j += 4) total += (data[j] + data[j + 1] + data[j + 2]) / 3;
    reading.push(total / (32 * 18));
  }
  return reading;
}, frames);

const biggestStep = (reading) => Math.max(...reading.slice(1).map((value, index) => Math.abs(value - reading[index])));

/** The time runs out, for both. */
async function timeUp(page, other) {
  for (const each of [page, other]) {
    await each.evaluate(() => {
      window.__game.duel.left = 0.5;
    });
  }
  await waitForScreen(page, 'finish');
  await waitForScreen(other, 'finish');
  // Both finish cards fill in, once each has heard how the other did.
  for (const each of [page, other]) await expect(each.locator('.friends-results li')).toHaveCount(2);
  for (const each of [page, other]) await expect(each.locator('.friends-results li.is-racing')).toHaveCount(0);
}

test('two friends battle ship against ship: each one\'s ship where it really is on both screens, and each one\'s hits counting for them on both', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { bayShips: 4, bayPace: 'slow', bayLevel: 'gentle', sound: true, levels: { [GAME]: 3 } }, GAME);
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#bay=${code}`);

  // The friend has their own speed, how hard and ships to beat, and is someone else in the other games.
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { bayShips: 9, bayPace: 'fast', bayLevel: 'tough', fighter: 'kit' }, GAME, `#bay=${code}`);
  await nameIs(ben.page, 'Ben');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('#friends-here')).toContainText('Ana');
  // Ben's hand closes once his hand check is done, so for now only Ana's cannons fire.
  await bothPlaying(page, ben.page, [OPEN, FIST]);

  const [ana, his] = [await view(page), await view(ben.page)];
  // Two minutes, from the host's 4 ships, and the plain game for both, with no pirates and nothing from the levels.
  expect([ana.duel.seconds, his.duel.seconds]).toEqual([120, 120]);
  expect([ana.duel.slot, his.duel.slot]).toEqual([0, 1]);
  expect([ana.pirates, his.pirates]).toEqual([0, 0]);
  expect([ana.level, his.level]).toEqual([1, 1]);
  expect([ana.prizes, his.prizes]).toEqual([false, false]);
  // Each sails at their own speed, with their own firing zones.
  expect([ana.pace, his.pace]).toEqual([24, 42]);
  expect([ana.reach, his.reach]).toEqual([172, 135]);
  // Ana sees Kit's ship, Ben's character in the other games, and Ben sees Giraffe's, as Ana has nobody else,
  // painted so that it can't be taken for his own.
  expect([ana.friend.captain, his.friend.captain]).toEqual(['kit', 'giraffe']);
  expect(his.friend.hull).not.toBe(his.hull);
  await expect(page.locator('#duel-their-name')).toHaveText('Ben');
  await expect(ben.page.locator('#duel-their-name')).toHaveText('Ana');
  await expect(page.locator('#duel-time')).toHaveText(/^[12]:\d\d$/);
  await expect(page.locator('#bay-left')).toBeHidden();
  await expect(page.locator('#hearts')).toBeHidden();

  // Ben's ship beside Ana's: her cannons fire, and his don't, with his hand closed.
  await holdBeside(ben.page);
  await expectSoon(async () => (await view(ben.page)).me.sails, 15_000).toBeLessThan(0.1);
  await ben.page.waitForTimeout(1500);
  const benBefore = (await view(ben.page)).hits;
  await expectSoon(async () => (await view(page)).hits, 30_000).toBeGreaterThanOrEqual(5);
  // Each of Ana's hits counts for her on both screens, and shows on Ben's ship as her balls come over.
  const anaNow = await view(page);
  const anaHits = anaNow.duel.mine;
  expect(anaHits).toBe(anaNow.hits);
  await expectSoon(async () => (await view(ben.page)).duel.theirs, 10_000).toBeGreaterThanOrEqual(anaHits);
  await expectSoon(async () => (await view(ben.page)).struck, 10_000).toBeGreaterThan(0);
  await expectSoon(async () => (await view(ben.page)).theirBalls, 10_000).toBeGreaterThan(0);
  expect((await view(ben.page)).hits).toBe(benBefore);
  expect((await view(page)).duel.theirs).toBe(benBefore);
  // Nothing is lost by being hit: there are no hearts to lose, and the ship's still there.
  expect((await view(ben.page)).hearts).toBe(5);
  expect((await view(page)).friend.state).toBe('sailing');
  await expect(page.locator('#duel-mine')).not.toHaveText('0');
  // Each ship where it really is on the other screen, a moment ago, with its sails as they are.
  await expectSoon(async () => {
    const [here, there] = await Promise.all([view(page), view(ben.page)]);
    return Math.max(Math.hypot(here.me.x - there.friend.x, here.me.z - there.friend.z), Math.hypot(there.me.x - here.friend.x, there.me.z - here.friend.z));
  }, 15_000).toBeLessThan(30);
  expect((await view(page)).friend.sails).toBeLessThan(0.15);
  expect((await view(ben.page)).friend.sails).toBeGreaterThan(0.5);
  // With Ben's name over his ship, and the ship to be seen.
  await expect(page.locator('.mark[data-friend="yes"][data-where="on"] .mark-name')).toHaveText('Ben', { timeout: 15_000 });
  expect((await view(page)).friend.seen).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, 'cannon-bay-friends-host');
  await ben.page.screenshot({ path: 'test-results/screens/cannon-bay-friends-guest.png' });

  // Now the other way round: Ana's hand closes, Ben's opens, and Ana's ship is beside his.
  await letGo(ben.page);
  await show(page, ...FIST);
  await show(ben.page, ...OPEN);
  await holdBeside(page);
  await page.waitForTimeout(1500);
  const anaBefore = (await view(page)).hits;
  await expectSoon(async () => (await view(ben.page)).hits, 30_000).toBeGreaterThanOrEqual(benBefore + 4);
  const benHits = (await view(ben.page)).duel.mine;
  await expectSoon(async () => (await view(page)).duel.theirs, 10_000).toBeGreaterThanOrEqual(benHits);
  await expectSoon(async () => (await view(page)).struck, 10_000).toBeGreaterThan(0);
  expect((await view(page)).hits).toBe(anaBefore);
  expect((await view(page)).hearts).toBe(5);
  await expect(ben.page.locator('.mark[data-friend="yes"] .mark-name')).toHaveText('Ana');
  await ben.page.screenshot({ path: 'test-results/screens/cannon-bay-friends-guest-firing.png' });

  // Both firing at each other side by side, with all their balls and hits: nothing flashes on either screen.
  await page.evaluate(() => {
    const { sound } = window.__game;
    window.__tap = sound.context.createAnalyser();
    window.__tap.fftSize = 2048;
    sound.output.connect(window.__tap);
    window.__peak = 0;
    const samples = new Float32Array(2048);
    window.__listening = setInterval(() => {
      window.__tap.getFloatTimeDomainData(samples);
      for (const sample of samples) window.__peak = Math.max(window.__peak, Math.abs(sample));
    }, 20);
  });
  await show(page, ...OPEN);
  await expectSoon(async () => (await view(page)).hits, 20_000).toBeGreaterThan(anaBefore + 2);
  const [hostSteps, guestSteps] = [biggestStep(await brightnessOverFrames(page, 120)), biggestStep(await brightnessOverFrames(ben.page, 120))];
  console.log('biggest brightness step with both firing: host', hostSteps, 'guest', guestSteps);
  expect(hostSteps).toBeLessThan(6);
  expect(guestSteps).toBeLessThan(6);
  const peak = await page.evaluate(() => window.__peak);
  console.log('loudest moment with both firing', peak);
  expect(peak).toBeGreaterThan(0.02);
  expect(peak).toBeLessThanOrEqual(1);
  await letGo(page);

  // The time is up: both finish cards say who won, with both scores.
  await timeUp(page, ben.page);
  const [anaFinal, benFinal] = [(await view(page)).duel.mine, (await view(ben.page)).duel.mine];
  console.log('final hits', anaFinal, benFinal);
  const titleFor = (mine, theirs, name) => (mine === theirs ? 'You both won!' : mine > theirs ? 'You won!' : `${name} won!`);
  await expect(page.locator('#screen-finish h2')).toHaveText(titleFor(anaFinal, benFinal, 'Ben'));
  await expect(ben.page.locator('#screen-finish h2')).toHaveText(titleFor(benFinal, anaFinal, 'Ana'));
  await expect(page.locator('.friends-results')).toContainText(new RegExp(`You\\s+${anaFinal} hits`));
  await expect(page.locator('.friends-results')).toContainText(new RegExp(`Ben\\s+${benFinal} hits`));
  await expect(ben.page.locator('.friends-results')).toContainText(new RegExp(`Ana\\s+${anaFinal} hits`));
  await expect(ben.page.locator('.friends-results')).toContainText(new RegExp(`You\\s+${benFinal} hits`));
  await expect(page.locator('#finish-hero')).toHaveText(String(anaFinal));
  await expect(page.locator('.finish-hero')).toContainText('hits');
  await page.waitForTimeout(600);
  await shot(page, 'cannon-bay-friends-finish');
  await ben.page.screenshot({ path: 'test-results/screens/cannon-bay-friends-finish-guest.png' });

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect((await view(page)).ownLevel).toBe(3);
  expect((await view(ben.page)).ownLevel).toBe(1);
  const benSettings = await ben.page.evaluate(() => window.__game.session.settings);
  expect([benSettings.bayShips, benSettings.bayPace, benSettings.bayLevel]).toEqual([9, 'fast', 'tough']);
  expect(sockets).toEqual([`ws://localhost:${Number(new URL(test.info().project.use.baseURL).port) + 1}/room/cannon-bay/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a game is for two: a third friend is told it already has two players', async ({ page, browser }) => {
  await openGame(page, {}, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, {}, GAME, `#bay=${code}`);
  await expect(page.locator('#friends-here li')).toHaveCount(2);
  const cara = await secondPlayer(browser);
  await openGame(cara.page, {}, GAME, `#bay=${code}`);
  await expect(cara.page.locator('#friends-status')).toHaveText('That game already has 2 players.');
  await expect(page.locator('#friends-here li')).toHaveCount(2);
  for (const each of [ben, cara]) {
    expect(each.errors).toEqual([]);
    await each.context.close();
  }
});

test('resting is never punished: with both hands resting nobody fires, nothing is lost, and equal points share the win', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { bayShips: 6 }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, {}, GAME, `#bay=${code}`);
  await nameIs(ben.page, 'Ben');
  // Each hand goes out of view once its hand check is done, and stays out.
  await bothPlaying(page, ben.page, [NO_HAND, NO_HAND]);
  expect((await view(page)).duel.seconds).toBe(180);
  await page.waitForTimeout(6000);
  const [ana, his] = [await view(page), await view(ben.page)];
  // A hand that can't be seen never fires, the sails stay down, and both ships are still there.
  expect([ana.shots, his.shots]).toEqual([0, 0]);
  expect([ana.duel.mine, ana.duel.theirs, his.duel.mine, his.duel.theirs]).toEqual([0, 0, 0, 0]);
  expect(ana.me.sails).toBeLessThan(0.05);
  expect([ana.friend.state, his.friend.state]).toEqual(['sailing', 'sailing']);
  expect([ana.state, his.state]).toEqual(['sailing', 'sailing']);
  await timeUp(page, ben.page);
  await expect(page.locator('#screen-finish h2')).toHaveText('You both won!');
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('You both won!');
  await expect(page.locator('.friends-results li').nth(0)).toContainText(/1st\s+You\s+0 hits/);
  await expect(page.locator('.friends-results li').nth(1)).toContainText(/1st\s+Ben\s+0 hits/);
  await expect(ben.page.locator('.friends-results li').nth(1)).toContainText(/1st\s+Ana\s+0 hits/);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a friend who goes in the middle ends the battle for the other, who can play on their own again', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, {}, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, {}, GAME, `#bay=${code}`);
  await bothPlaying(page, ben.page);
  await ben.context.close();
  await waitForScreen(page, 'finish');
  await expect(page.locator('.friends-results')).toBeVisible();
  await expect(page.locator('#screen-finish h2')).toHaveText('You won!');
  expect((await view(page)).friend).toBe(null);
  // On their own again: pirates, and nothing more sent.
  await page.locator('#friends-leave').evaluate((button) => button.click());
  await show(page, ...OPEN);
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  const alone = await view(page);
  expect(alone.duel).toBe(null);
  expect(alone.pirates).toBeGreaterThan(0);
  await expect(page.locator('#bay-left')).toBeVisible();
  await expect(page.locator('#duel-mine-chip')).toBeHidden();
});

test('on their own, it\'s the battle with the pirates as always, and nothing connects anywhere', async ({ page }) => {
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { bayShips: 4 }, GAME);
  await expect(page.locator('#friends-toggle')).toHaveText('Play with a friend');
  await show(page, ...OPEN);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  const alone = await view(page);
  expect(alone.duel).toBe(null);
  expect(alone.friend).toBe(null);
  expect(alone.pirates).toBeGreaterThan(0);
  await expect(page.locator('#bay-left')).toBeVisible();
  await expect(page.locator('#hearts')).toBeVisible();
  for (const chip of ['#duel-mine-chip', '#duel-theirs-chip', '#duel-time']) await expect(page.locator(chip)).toBeHidden();
  await expect(page.locator('#story-line')).toContainText('Pirates want our treasure');
  expect(sockets).toEqual([]);
});
