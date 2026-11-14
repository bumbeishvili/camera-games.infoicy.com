// Playing Arrow Meadow: one hand holds the bow and the other the string. The string hand, closed, takes the string,
// the hands apart draw the bow, the bow hand higher tilts it up, and opening the string hand lets the arrow fly to
// where the dotted line said. A fist never lets go, and a hand that can't be seen does nothing. With real photos of
// two hands through the real tracker.
import { openGame, shot } from '../helpers.js';
import { archer, expect, expectSoon, GAME, hands, show, startPlaying, state, stopArcher, test, TILT, waitForScreen } from './helpers.js';

const promptText = (page) => page.locator('#prompt-text').textContent();
const promptShown = (page) => page.evaluate(() => document.getElementById('prompt').classList.contains('is-visible') && document.getElementById('prompt-text').textContent);

test('a closed hand takes the string, the hands apart draw the bow, and opening the hand lets one arrow fly to where the dotted line said', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { arrowGoal: 6 });
  const start = await state(page);
  expect(start.goal).toBe(6);
  expect(start.targets.map((target) => target.kind)).toEqual(['butt']);
  // With the right hand in play, Giraffe is on the right, and shoots to the left.
  expect(start.flip).toBe(true);
  await expect(page.locator('#story-line')).toHaveText('It’s the meadow fair! Help me hit the targets!');
  await expect(page.locator('#chip-targets')).toHaveText('0 of 6');
  await expect(page.locator('#chip-stars-box')).toBeHidden();
  expect(start.film).toBe('on');
  // Both hands up and open: nothing is held, and nothing flies.
  expect(start.bow.nocked).toBe(false);
  expect(start.stats.shots).toBe(0);

  // The string hand closes, with the hands apart: it has the string, and the bow is drawn right back.
  await hands(page, { apart: 4, lift: 0 });
  await expectSoon(async () => (await state(page)).ready, { timeout: 10_000 }).toBe(true);
  const held = await state(page);
  expect(held.bow.nocked).toBe(true);
  expect(held.bow.draw).toBeGreaterThan(0.95);
  expect(Math.abs(held.bow.angle)).toBeLessThan(4);
  // The archer tilts the bow until the dotted line is on the target, which the meadow says with a ring round it.
  await archer(page, { shoot: false });
  await expectSoon(async () => (await state(page)).aim?.target, { timeout: 20_000 }).toBe('butt');
  await page.waitForTimeout(400);
  await shot(page, 'arrows-aimed');
  expect((await state(page)).stats.shots).toBe(0);

  // The hand opens: one arrow, and it hits the target the line was on.
  await archer(page, { every: 0.4 });
  await expectSoon(async () => (await state(page)).stats.shots, { timeout: 20_000 }).toBe(1);
  await expectSoon(async () => (await state(page)).stats.hits, { timeout: 10_000 }).toBe(1);
  await expect(page.locator('#chip-targets')).toHaveText(/^[1-6] of 6$/);
  // The film of what to do goes once there's a hit.
  await expectSoon(() => page.evaluate(() => document.body.dataset.film), { timeout: 5000 }).toBe('off');
  await shot(page, 'arrows-first-hit');

  // Arrow after arrow, the targets add up, and the finish card comes.
  await waitForScreen(page, 'finish');
  await stopArcher(page);
  const end = await state(page);
  expect(end.stats.hits).toBe(6);
  expect(end.stats.shots).toBeGreaterThanOrEqual(6);
  await expect(page.locator('#screen-finish h2')).toHaveText('We won the contest! What an archer!');
  await expect(page.locator('#finish-hero')).toHaveText('6');
  await expect(page.locator('#sum-right-hits')).toHaveText(`6 of ${end.stats.shots}`);
  await expect(page.locator('#sum-right-run')).toHaveText(String(end.stats.bestRun));
  await expect(page.locator('#level-done-text')).toHaveText('Level 1 done! Next: level 2');
  await page.waitForTimeout(600);
  await shot(page, 'arrows-finish');
});

test('a fist never lets an arrow go, wherever the hands move, and a hand that stays open never had the string', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page);
  // Open all along: no string, no arrow.
  await hands(page, { apart: 5, lift: 1, string: 'open' });
  await page.waitForTimeout(2500);
  expect((await state(page)).bow.nocked).toBe(false);
  // A fist, moved about for a good while.
  for (const [apart, lift] of [[4, 0], [5, 1.5], [3.4, -0.4], [4.5, 2.5], [4, 0.5]]) {
    await hands(page, { apart, lift });
    // The photo jumps from place to place, as no hand does, so the tracker can take a moment to find it again.
    await expectSoon(async () => (await state(page)).bow.nocked, { timeout: 10_000 }).toBe(true);
    await page.waitForTimeout(700);
  }
  const after = await state(page);
  expect(after.stats.shots).toBe(0);
  expect(after.arrows).toEqual([]);
  // Opened at last, it lets one arrow go.
  await hands(page, { apart: 4, lift: 0.5, string: 'open' });
  await expectSoon(async () => (await state(page)).stats.shots, { timeout: 10_000 }).toBe(1);
  await page.waitForTimeout(1500);
  expect((await state(page)).stats.shots).toBe(1);
});

test('the bow tilts by how much higher the bow hand is than the string hand, wherever the two are in the picture', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, { arrowHelp: 'off' });
  const angleAt = async (scene) => {
    await hands(page, scene);
    await page.waitForTimeout(1100);
    return (await state(page)).bow.angle;
  };
  const level = await angleAt({ apart: 4, lift: 0 });
  expect(Math.abs(level)).toBeLessThan(4);
  const one = await angleAt({ apart: 4, lift: 1 });
  expect(one).toBeGreaterThan(TILT - 5);
  expect(one).toBeLessThan(TILT + 5);
  const two = await angleAt({ apart: 4, lift: 2 });
  expect(two).toBeGreaterThan(2 * TILT - 7);
  expect(two).toBeLessThan(2 * TILT + 7);
  // The same hands, both moved down and across the picture: the same tilt.
  const moved = await angleAt({ apart: 4, lift: 1, dx: 0.8, dy: 1 });
  expect(Math.abs(moved - one)).toBeLessThan(4);
  // The bow hand below the string hand points the bow down a little, and no further than it goes.
  const down = await angleAt({ apart: 4, lift: -1.5 });
  expect(down).toBeCloseTo(-12, 0);
  await shot(page, 'arrows-tilted-down');
});

test('how far apart the hands have to be for a full draw is the grown-ups\' choice, and letting go of a bow barely drawn sends nothing', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, { arrowReach: 'large' });
  // Four palms apart is a full draw with a little, and well short of one with a long way.
  await hands(page, { apart: 4 });
  await expectSoon(async () => (await state(page)).bow.nocked, { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(800);
  const far = (await state(page)).bow.draw;
  expect(far).toBeGreaterThan(0.4);
  expect(far).toBeLessThan(0.7);
  // The hands nearer each other: the string is held, but the bow is barely drawn.
  await hands(page, { apart: 2.3 });
  await page.waitForTimeout(1000);
  const weak = await state(page);
  expect(weak.bow.nocked).toBe(true);
  expect(weak.bow.draw).toBeLessThan(0.25);
  expect(weak.ready).toBe(false);
  // Let go like that, nothing flies, and it says what to do.
  await hands(page, { apart: 2.3, string: 'open' });
  await expectSoon(() => promptShown(page), { timeout: 10_000 }).toBe('Pull the string back!');
  expect((await state(page)).stats.shots).toBe(0);
  await shot(page, 'arrows-pull-back');

  // With a little chosen, the same four palms is a full draw.
  await page.locator('#open-panel').click();
  await page.locator('input[name="arrowReach"][value="small"]').check();
  await page.locator('#close-panel').click();
  await hands(page, { apart: 4 });
  await expectSoon(async () => (await state(page)).ready, { timeout: 10_000 }).toBe(true);
  expect((await state(page)).bow.draw).toBeGreaterThan(0.95);
  await hands(page, { apart: 4, string: 'open' });
  await expectSoon(async () => (await state(page)).stats.shots, { timeout: 10_000 }).toBe(1);
});

test('without the bow hand the string hand does nothing, and it asks for the other hand', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page);
  await hands(page, { apart: 4, bow: null });
  await expectSoon(() => promptShown(page), { timeout: 15_000 }).toBe('Hold up your other hand, for the bow!');
  let now = await state(page);
  expect(now.bow).toMatchObject({ nocked: false, bowSeen: false, stringSeen: true });
  await shot(page, 'arrows-other-hand');
  // Opening and closing the string hand by itself sends nothing.
  await hands(page, { apart: 4, bow: null, string: 'open' });
  await page.waitForTimeout(1200);
  await hands(page, { apart: 4, bow: null });
  await page.waitForTimeout(1200);
  now = await state(page);
  expect(now.stats.shots).toBe(0);
  // The two hands right together, one over the other, do nothing either.
  await hands(page, { apart: 1 });
  await page.waitForTimeout(1500);
  expect((await state(page)).bow.nocked).toBe(false);
  await hands(page, { apart: 1, string: 'open' });
  await page.waitForTimeout(1200);
  expect((await state(page)).stats.shots).toBe(0);
  // With the bow hand back, and the hands apart, the same string hand shoots.
  await hands(page, { apart: 4 });
  await expectSoon(async () => (await state(page)).ready, { timeout: 10_000 }).toBe(true);
  await hands(page, { apart: 4, string: 'open' });
  await expectSoon(async () => (await state(page)).stats.shots, { timeout: 10_000 }).toBe(1);
});

test('a child who rests comes back to the meadow as they left it, and is told that resting is fine', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page);
  await archer(page, { every: 0.4 });
  await expectSoon(async () => (await state(page)).stats.hits, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await stopArcher(page);
  // Both hands still up, the string hand closed, and nothing done for a good while.
  await hands(page, { apart: 4, lift: 2.8 });
  await page.waitForTimeout(2500);
  const before = await state(page);
  await expectSoon(() => promptShown(page), { timeout: 40_000, intervals: [250] }).toBe('Resting is OK. Open your hand when you’re ready.');
  const after = await state(page);
  expect(after.stats).toEqual(before.stats);
  expect(after.targets.map((target) => target.id)).toEqual(before.targets.map((target) => target.id));
  expect(after.phase).toBe('play');
  await shot(page, 'arrows-resting');
  // With both hands out of the picture, nothing happens either, for as long as it lasts.
  await show(page, null, null);
  await page.waitForTimeout(6000);
  const away = await state(page);
  expect(away.stats).toEqual(before.stats);
  expect(away.bow).toMatchObject({ nocked: false, both: false });
  expect(away.targets.map((target) => target.id)).toEqual(before.targets.map((target) => target.id));
  // And then they carry on.
  await archer(page, { every: 0.4 });
  await expectSoon(async () => (await state(page)).stats.hits, { timeout: 30_000 }).toBeGreaterThan(before.stats.hits);
  await stopArcher(page);
});

test('holding the string a good while brings the film back, and says how to let go', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page);
  await hands(page, { apart: 4, lift: 2.6 });
  await expectSoon(() => promptShown(page), { timeout: 20_000 }).toBe('Open your hand to let the arrow go!');
  expect((await state(page)).film).toBe('on');
  await expect(page.locator('.arrow-film')).toBeVisible();
  expect(await page.locator('.film-string-hand').evaluate((node) => getComputedStyle(node).animationName)).toBe('film-pull');
  await shot(page, 'arrows-let-go');
  // An open string hand that never closes is asked to close on the string.
  await hands(page, { apart: 4, lift: 2.6, string: 'open' });
  await expectSoon(() => promptShown(page), { timeout: 20_000 }).toBe('Close your hand to hold the string!');
});

test('real hands wobble: shaking, and lost by the tracker now and then, they still win a contest, and the bow stays steady while they aim', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page, { arrowGoal: 6 });
  await archer(page, { wobble: 1, shoot: false });
  await expectSoon(async () => (await state(page)).aim?.target, { timeout: 30_000 }).toBe('butt');
  // Held on the target for four seconds, the bow hardly moves, and nothing is let go.
  const angles = [];
  for (let n = 0; n < 40; n += 1) {
    await page.waitForTimeout(100);
    const now = await state(page);
    if (now.bow.nocked) angles.push(now.aim.angle);
  }
  expect(angles.length).toBeGreaterThan(30);
  const spread = Math.max(...angles) - Math.min(...angles);
  console.log('the bow of a wobbling hand moved', spread.toFixed(2), 'degrees in four seconds');
  expect(spread).toBeLessThan(5);
  expect((await state(page)).stats.shots).toBe(0);
  await archer(page, { wobble: 1, every: 0.6 });
  await waitForScreen(page, 'finish');
  await stopArcher(page);
  const end = await state(page);
  console.log('wobbling hands', JSON.stringify(end.stats));
  expect(end.stats.hits).toBe(6);
  // Nearly every arrow went where it was meant to.
  expect(end.stats.shots).toBeLessThanOrEqual(9);
});

test('with the left hand in play, the left hand is the string hand, and the meadow is turned round with Giraffe on the left', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, { hands: 'left', arrowGoal: 6 }, { side: 'left' });
  expect((await state(page)).flip).toBe(false);
  // The right hand, the bow hand, closing and opening does nothing.
  await hands(page, { apart: 4, side: 'left', string: 'open', bow: 'fist' });
  await page.waitForTimeout(1200);
  await hands(page, { apart: 4, side: 'left', string: 'open', bow: 'open' });
  await page.waitForTimeout(1200);
  expect((await state(page)).stats.shots).toBe(0);
  await archer(page, { side: 'left', every: 0.4 });
  await expectSoon(async () => (await state(page)).stats.hits, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  // The arrows fly to the right on the screen, from Giraffe on the left.
  const where = await page.evaluate(() => {
    const { view, meadow } = window.__game;
    const [target] = meadow.targets;
    return { target: view.at(target.x, target.y).x, bow: view.at(0.17, 0.58).x, wide: view.width };
  });
  expect(where.bow).toBeLessThan(where.wide * 0.2);
  expect(where.target).toBeGreaterThan(where.bow);
  await shot(page, 'arrows-left');
  await stopArcher(page);
});

test('the help with aiming is the grown-ups\' choice: with a lot, an arc that\'s nearly right is pulled onto the target', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, { arrowHelp: 'off' });
  await hands(page, { apart: 4, lift: 0 });
  await expectSoon(async () => (await state(page)).ready, { timeout: 10_000 }).toBe(true);
  // What would hit the target's middle, and a bow held six degrees off it.
  const right = await page.evaluate(() => {
    const { meadow } = window.__game;
    return (meadow.solve(meadow.live[0], 1) * 180) / Math.PI;
  });
  await hands(page, { apart: 4, lift: (right + 6) / TILT });
  await page.waitForTimeout(1300);
  const off = await state(page);
  expect(off.help).toBe('off');
  expect(Math.abs(off.aim.angle - off.bow.angle)).toBeLessThan(0.01);
  await page.locator('#open-panel').click();
  await page.locator('input[name="arrowHelp"][value="lots"]').check();
  await page.locator('#close-panel').click();
  await page.waitForTimeout(600);
  const helped = await state(page);
  expect(helped.help).toBe('lots');
  // The bow is held as it was, and the arc is nearer what would hit.
  expect(Math.abs(helped.bow.angle - off.bow.angle)).toBeLessThan(1.5);
  expect(Math.abs(helped.aim.angle - right)).toBeLessThan(Math.abs(helped.bow.angle - right) - 1);
});

test('the game only talks to this computer', async ({ page, baseURL }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await openGame(page, {}, GAME);
  await hands(page, { string: 'open' });
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await page.waitForTimeout(1500);
  const offsite = requests.filter((url) => !url.startsWith(baseURL) && !url.startsWith('data:') && !url.startsWith('blob:'));
  expect(offsite).toEqual([]);
  expect(await promptText(page)).not.toContain('undefined');
});
