// Frost Arena played through the real page, with real photos of two hands going through the real tracker.
import { expect, openGame, shot, test } from '../helpers.js';
import { GAME, biggestStep, brightnessThrough, hands, matchIs, someoneInFront, soon, startMatch, waitForScreen } from './helpers.js';

test('the title card says what each hand does, and the match starts after the hand check, with the numbers along the top', async ({ page }) => {
  await openGame(page, {}, GAME);
  await expect(page.locator('h1')).toHaveText('Frost Arena');
  await expect(page.locator('#tagline')).toHaveText('Tag the red team! Your right hand looks round and fires. Your other hand walks and reloads.');
  await expect(page.locator('#start')).toHaveText('Join the team');
  await shot(page, 'arena-title');
  await hands(page, { rifle: 'open' });
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  const match = await matchIs(page);
  expect([match.state, match.score, match.goal, match.rounds, match.rifle, match.canLose]).toEqual(['playing', [0, 0], 5, 30, 'ak', false]);
  // Giraffe is on the child's team, against two.
  expect(match.sides).toEqual([2, 2]);
  await expect(page.locator('#chip-blue')).toHaveText('0');
  await expect(page.locator('#chip-goal')).toHaveText('of 5');
  await expect(page.locator('#chip-red')).toHaveText('0');
  await expect(page.locator('#chip-rounds')).toHaveText('30');
  await expect(page.locator('#chip-stars-box')).toBeHidden();
  await expect(page.locator('#story-line')).toHaveText('Tag the red team! I’m right beside you!');
  await expect(page.locator('.sight-ring')).toBeVisible();
  // The little film says what each hand does, until the child has done it all.
  expect(match.film).toBe('on');
  await expect(page.locator('.film')).toContainText('Open: fire');
  await expect(page.locator('.film')).toContainText('Other hand open: walk');
  await expect(page.locator('.film')).toContainText('Other hand fist: reload');
});

test('with the rifle hand open it fires by itself at whoever is in the sights, never at nothing, and a tag is a point', async ({ page }) => {
  await startMatch(page);
  // Nobody about: an open rifle hand fires nothing, and no rounds go.
  await someoneInFront(page, null);
  await hands(page, { rifle: 'open' });
  await page.waitForTimeout(1500);
  let match = await matchIs(page);
  expect([match.stats.shots, match.rounds, match.locked]).toEqual([0, 30, null]);
  expect(match.sight).toBe('ready');
  // Someone straight ahead, with the rifle hand closed: the sights are on them, and it holds its fire.
  await hands(page, { rifle: 'fist' });
  await soon(() => page.evaluate(() => window.__game.monitor.snapshot.handOpen)).toBe(false);
  const who = await someoneInFront(page, 9);
  await soon(async () => (await matchIs(page)).locked).toBe(who);
  await page.waitForTimeout(600);
  match = await matchIs(page);
  expect([match.stats.shots, match.sight]).toEqual([0, 'on']);
  // After a moment of that, it's asked for.
  await expect(page.locator('.prompt')).toContainText('Open your hand to fire!', { timeout: 10_000 });
  // Open: it fires, one shot after another, and they're tagged out.
  await hands(page, { rifle: 'open' });
  await soon(async () => (await matchIs(page)).stats.shots).toBeGreaterThan(2);
  expect((await matchIs(page)).sight).toBe('firing');
  await shot(page, 'arena-firing');
  await soon(async () => (await matchIs(page)).score).toEqual([1, 0]);
  match = await matchIs(page);
  expect(match.stats.tags).toBe(1);
  expect(match.rounds).toBe(30 - match.stats.shots);
  await expect(page.locator('#chip-blue')).toHaveText('1');
  await expect(page.locator('#chip-rounds')).toHaveText(String(match.rounds));
});

test('the helper hand walks when it\'s open and stops when it isn\'t, and moving the rifle hand to one side turns to look', async ({ page }) => {
  await startMatch(page);
  await someoneInFront(page, null);
  // What the helper hand is doing is on its own little sign: its words are put there by the stylesheet.
  const sign = () => page.evaluate(() => getComputedStyle(document.querySelector('.helper-does'), '::after').content);
  const before = await matchIs(page);
  expect(before.helper).toBe('none');
  await expect(page.locator('.helper')).toBeVisible();
  expect(await sign()).toContain('No hand');
  // Open: forward, the way they're looking.
  await hands(page, { rifle: 'fist', helper: 'open' });
  await soon(async () => (await matchIs(page)).helper).toBe('open');
  expect(await sign()).toContain('Walk');
  await soon(async () => before.at.z - (await matchIs(page)).at.z).toBeGreaterThan(4);
  await shot(page, 'arena-walking');
  // A fist: they stop.
  await hands(page, { rifle: 'fist', helper: 'fist' });
  await soon(async () => (await matchIs(page)).helper).toBe('fist');
  expect(await sign()).toContain('Reload');
  await soon(async () => (await matchIs(page)).speed).toBe(0);
  const stopped = await matchIs(page);
  await page.waitForTimeout(700);
  expect((await matchIs(page)).at).toEqual(stopped.at);
  // The rifle hand over to the right: they turn to the right, and back in the middle, they stop turning. It's
  // open, as it was for the hand check, which is where the middle was taken from, and there's nobody to fire at.
  await hands(page, { rifle: 'open', helper: null, across: 170 });
  await soon(async () => (await matchIs(page)).heading - stopped.heading).toBeGreaterThan(0.5);
  await hands(page, { rifle: 'open', helper: null, across: 0 });
  await page.waitForTimeout(900);
  const turned = await matchIs(page);
  await page.waitForTimeout(600);
  expect(Math.abs((await matchIs(page)).heading - turned.heading)).toBeLessThan(0.05);
  // And to the left.
  await hands(page, { rifle: 'open', helper: null, across: -170 });
  await soon(async () => turned.heading - (await matchIs(page)).heading).toBeGreaterThan(0.5);
  expect((await matchIs(page)).stats.shots).toBe(0);
});

test('a fist of the helper hand changes the magazine, an empty rifle asks for it, and with no fist it happens by itself after a few seconds', async ({ page }) => {
  await startMatch(page);
  await someoneInFront(page, 9, { health: 10_000 });
  await page.evaluate(() => {
    window.__game.match.troopers.find(({ team }) => team === 1).most = 10_000;
  });
  await hands(page, { rifle: 'open' });
  await soon(async () => (await matchIs(page)).stats.shots).toBeGreaterThan(3);
  // A fist with the other hand: the rifle stops for a moment, and then the magazine is full.
  await hands(page, { rifle: 'open', helper: 'fist' });
  await soon(async () => (await matchIs(page)).changing).toBe(true);
  expect((await matchIs(page)).sight).toBe('changing');
  await expect(page.locator('#chip-rounds')).toHaveText('…');
  await shot(page, 'arena-reloading');
  await soon(async () => (await matchIs(page)).changing).toBe(false);
  let match = await matchIs(page);
  expect([match.stats.reloads, match.stats.byHand]).toEqual([1, 1]);
  expect(match.rounds).toBeGreaterThan(24);
  // The magazine runs out, with the helper hand out of the picture: it says what to do.
  await hands(page, { rifle: 'open', helper: null });
  await page.evaluate(() => {
    window.__game.match.child.rounds = 2;
  });
  await soon(async () => (await matchIs(page)).rounds).toBe(0);
  await expect(page.locator('.prompt')).toContainText('Make a fist with your other hand to reload!');
  expect((await matchIs(page)).sight).toBe('empty');
  await expect(page.locator('#chip-rounds-box')).toHaveAttribute('data-state', 'empty');
  // Nobody is ever stuck: a few seconds later it goes in by itself.
  await soon(async () => (await matchIs(page)).changing, 10_000).toBe(true);
  await soon(async () => (await matchIs(page)).rounds, 10_000).toBeGreaterThan(20);
  match = await matchIs(page);
  expect([match.stats.reloads, match.stats.byHand]).toEqual([2, 1]);
});

test('with both hands down it\'s a rest: everyone waits, nothing happens, and any hand starts it again', async ({ page }) => {
  await startMatch(page, { arenaLevel: 'tough' });
  await hands(page, { rifle: null, helper: null });
  await soon(async () => (await matchIs(page)).resting, 15_000).toBe(true);
  const places = await page.evaluate(() => window.__game.match.troopers.map(({ x, z }) => ({ x, z })));
  const before = await matchIs(page);
  await page.waitForTimeout(4000);
  const after = await matchIs(page);
  expect(after.score).toEqual(before.score);
  expect(after.health).toBeGreaterThanOrEqual(before.health);
  const moved = await page.evaluate((was) => Math.max(...window.__game.match.troopers.map(({ x, z }, index) => Math.hypot(x - was[index].x, z - was[index].z))), places);
  expect(moved).toBeLessThan(0.6);
  await hands(page, { rifle: 'fist', helper: 'open' });
  await soon(async () => (await matchIs(page)).resting).toBe(false);
});

test('the fifth tag wins the match on Gentle, which can\'t be lost, and the finish card says how it went', async ({ page }) => {
  await startMatch(page);
  const who = await someoneInFront(page, 9, { health: 1 });
  // Four tags already, and the last one made by hand.
  await page.evaluate(() => {
    const { match } = window.__game;
    match.score[0] = 4;
    match.stats.tags = 4;
  });
  await hands(page, { rifle: 'open' });
  await waitForScreen(page, 'finish');
  const match = await matchIs(page);
  expect([match.state, match.score, match.stats.tags, match.stats.out]).toEqual(['won', [5, 0], 5, 0]);
  expect(who).toBeTruthy();
  await expect(page.locator('#screen-finish h2')).toHaveText('We won the match!');
  await expect(page.locator('#finish-hero')).toHaveText('5');
  await expect(page.locator('.finish-hero')).toContainText('tags');
  await expect(page.locator('#sum-right-score')).toHaveText('5 : 0');
  await expect(page.locator('#sum-right-magazines')).toHaveText('0');
  await expect(page.locator('#sum-right-prizes')).toBeHidden();
  await shot(page, 'arena-finish');
  // The next level is ready, and says what it brings.
  await expect(page.locator('#screen-finish')).toContainText('Gold stars');
});

test('a grown-up\'s choices are kept: the M4, eight tags, the magazine changing by itself, and the left hand for the rifle', async ({ page }) => {
  await startMatch(page, { arenaRifle: 'm4', arenaTags: 8, arenaReload: 'auto', hands: 'left' }, 'left');
  const match = await matchIs(page);
  expect([match.rifle, match.goal]).toEqual(['m4', 8]);
  await expect(page.locator('#chip-goal')).toHaveText('of 8');
  // The helper is the right hand now, and its sign says so.
  await expect(page.locator('.helper-side')).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.helper-side'), '::after').content)).toContain('Right hand');
  await hands(page, { rifle: 'fist', helper: 'open', side: 'left' });
  await soon(async () => (await matchIs(page)).helper).toBe('open');
  // An empty magazine changes itself at once, with nothing asked for.
  await someoneInFront(page, 9, { health: 10_000 });
  await page.evaluate(() => {
    window.__game.match.child.rounds = 1;
  });
  await hands(page, { rifle: 'open', helper: null, side: 'left' });
  await soon(async () => (await matchIs(page)).changing).toBe(true);
  expect((await matchIs(page)).stats.byHand).toBe(0);
  // Changing a setting in the middle of a match applies at once.
  await page.locator('#open-panel').click();
  await page.locator('input[name="arenaPace"][value="fast"]').check();
  await page.locator('#close-panel').click();
  expect(await page.evaluate(() => window.__game.match.pace.walk)).toBe(5.2);
});

for (const level of [1, 10]) {
  test(`level ${level}: nothing flashes, through firing, tags, a magazine change and walking`, async ({ page }) => {
    test.setTimeout(180_000);
    await startMatch(page, { levels: { [GAME]: level }, arenaTags: 12 });
    await someoneInFront(page, 9);
    await hands(page, { rifle: 'open', helper: null });
    await soon(async () => (await matchIs(page)).stats.shots).toBeGreaterThan(1);
    const firing = await brightnessThrough(page, 240);
    // On through a tag, and then a magazine change and a walk up the yard.
    await page.evaluate(() => {
      window.__game.match.child.rounds = 3;
    });
    await someoneInFront(page, 9);
    await hands(page, { rifle: 'open', helper: 'fist' });
    const changing = await brightnessThrough(page, 120);
    await hands(page, { rifle: 'fist', helper: 'open' });
    const walking = await brightnessThrough(page, 150);
    // Standing still, firing and changing the magazine, the picture's brightness hardly moves. Walking, the view
    // itself comes round from a wall to the open yard, which is the picture changing and not a flash: the same
    // allowance as Cannon Bay has, whose view moves too.
    for (const [name, reading, most] of [['firing', firing, 4], ['changing', changing, 4], ['walking', walking, 6]]) {
      console.log(`level ${level}, ${name}: biggest brightness step`, biggestStep(reading));
      expect(biggestStep(reading), name).toBeLessThan(most);
    }
    expect((await matchIs(page)).snowing).toBe(level === 10);
  });
}

test('the higher levels bring what they say: a shield carrier, three a side, a crate, snow and the champions, each named on the title card', async ({ page }) => {
  await openGame(page, { levels: { [GAME]: 10 } }, GAME);
  await expect(page.locator('#screen-welcome')).toContainText('Champions');
  await expect(page.locator('#screen-welcome')).toContainText('Trophy');
  await hands(page, { rifle: 'open' });
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  const match = await matchIs(page);
  expect(match.sides).toEqual([3, 3]);
  expect(match.parts.slice().sort()).toEqual(['captain', 'runner', 'shield']);
  expect(match.snowing).toBe(true);
  await expect(page.locator('#chip-stars-box')).toBeVisible();
  // Each of the other team has a badge that says what they are.
  const badges = await page.evaluate(() => [...document.querySelectorAll('.arena-mark[data-team="red"] .arena-mark-badge')].map((badge) => badge.textContent).sort());
  expect(badges).toEqual(['🎖️', '💨', '🛡️'].sort());
  // A crate turns up, and walking over it gives what's in it, with a bar that runs down.
  await page.evaluate(() => {
    window.__game.match.crateIn = 0;
  });
  await hands(page, { rifle: 'fist', helper: 'open' });
  await soon(async () => (await matchIs(page)).crate?.kind).toBe('boots');
  await page.evaluate(() => {
    const { match } = window.__game;
    Object.assign(match.child, { x: match.crate.x, z: match.crate.z + 2.5, heading: 0 });
  });
  await soon(async () => (await matchIs(page)).power.bootsLeft).toBeGreaterThan(5);
  await expect(page.locator('#chip-power-box')).toBeVisible();
  await expect(page.locator('#chip-power-name')).toHaveText('Snow boots');
  await shot(page, 'arena-level-10');
  // The captain tagged is two points and two stars, and winning brings the trophy.
  await page.evaluate(() => {
    const { match } = window.__game;
    const captain = match.troopers.find(({ part }) => part === 'captain');
    match.score[0] = 10;
    Object.assign(captain, { health: 1, safeLeft: 0, state: 'in' });
    match.hit(captain, 5, match.child);
  });
  await waitForScreen(page, 'finish');
  const end = await matchIs(page);
  expect([end.state, end.stats.trophy, end.stats.stars]).toEqual(['won', 1, 2]);
  await expect(page.locator('#sum-right-prizes')).toContainText('🏆');
});

test('the match makes no requests off this computer, and the page refuses to', async ({ page, pageErrors }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await startMatch(page);
  await someoneInFront(page, 9);
  await hands(page, { rifle: 'open', helper: 'open' });
  await soon(async () => (await matchIs(page)).stats.shots).toBeGreaterThan(2);
  const away = requests.filter((url) => !url.startsWith(new URL(page.url()).origin) && !url.startsWith('data:') && !url.startsWith('blob:'));
  expect(away).toEqual([]);
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain("default-src 'self'");
  const blocked = await page.evaluate(() => fetch('https://example.com/upload', { method: 'POST', body: 'picture' }).then(() => 'sent', () => 'refused'));
  expect(blocked).toBe('refused');
  await expect.poll(() => pageErrors.join('\n')).toContain("violates the following Content Security Policy directive: \"connect-src 'self'");
  pageErrors.length = 0;
});
