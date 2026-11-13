// Giraffe's Goal's ten levels: what each brings is on the title card and under the countdown, each new thing comes
// along and works in the real game, and nothing flashes, at level 1 or at level 10 with all of it about.
import { openGame, shot } from '../helpers.js';
import { expect, expectSoon, GAME, judge, keeperHand, PALM, show, startPlaying, state, stopHand, test, waitForScreen, watchBrightness } from './helpers.js';

const NEW_AT = {
  2: ['A star for every save'],
  3: ['The curling shot'],
  4: ['The heavy ball'],
  5: ['The double shot'],
  6: ['The golden ball'],
  7: ['The bouncing ball'],
  8: ['The bubble ball'],
  9: ['The trick shot'],
  10: ['The cup'],
};
const atLevel = (level, more = {}) => ({ levels: { [GAME]: level }, ...more });
const labelShown = (page, key) => page.evaluate((wanted) => window.__game.view.introduced.has(wanted), key);
/** The first ball of the level, once it's on its way: the level's new kind comes first. */
async function firstShot(page, kind) {
  await expectSoon(async () => (await state(page)).stats.shots, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  const [first] = (await state(page)).shots;
  expect(first.kind).toBe(kind);
  return first;
}

test('the title card says what each level brings, and level 1 is the plain match', async ({ page }) => {
  await openGame(page, {}, GAME);
  await expect(page.locator('#level-badge')).toHaveText('Level 1 of 10');
  await expect(page.locator('#level-new')).toBeEmpty();
  for (const [level, names] of Object.entries(NEW_AT)) {
    await page.locator('#open-panel').click();
    await page.locator('#level-choice label', { hasText: new RegExp(`^\\s*${level}\\s*$`) }).click();
    await page.locator('#close-panel').click();
    await expect(page.locator('#level-badge')).toHaveText(`Level ${level} of 10`);
    for (const name of names) await expect(page.locator('#level-new')).toContainText(name);
  }
  await shot(page, 'goal-title-level-10');
});

test('under the countdown it says what\'s new, in Georgian too', async ({ page }) => {
  await openGame(page, { language: 'ka', ...atLevel(6) }, GAME);
  await show(page, ...PALM);
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('ოქროს ბურთი');
  await expect(page.locator('#level-now')).toHaveText('დონე 6');
  await waitForScreen(page, 'playing');
  await expect(page.locator('#story-line')).toHaveText(/[Ⴀ-ჿ]/);
});

test('level 2: a save knocks a star out of the ball, and the glove going to it takes it up to the tally', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(2));
  await expect(page.locator('#chip-stars-box')).toBeVisible();
  await expect(page.locator('#chip-stars')).toHaveText('0');
  // Only the balls are gone to, so the star waits where it came to rest.
  await keeperHand(page, { target: '(goal) => { const wanted = goal.wants(); return wanted?.what === "ball" ? wanted : null; }' });
  await expectSoon(async () => (await state(page)).stars).toBe(1);
  expect((await state(page)).stats.stars).toBe(0);
  await expectSoon(() => labelShown(page, 'stars'), { timeout: 8000 }).toBe(true);
  await page.waitForTimeout(500);
  await shot(page, 'goal-star');
  await keeperHand(page);
  await expect(page.locator('#chip-stars')).toHaveText('1', { timeout: 15_000 });
  expect((await state(page)).stats.stars).toBeGreaterThanOrEqual(1);
  await stopHand(page);
});

test('level 3: the fox\'s curling shot comes first, bends on its way, and is saved at its ring', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(3));
  expect((await state(page)).kickers).toEqual([{ who: 'kit', state: expect.any(String) }]);
  await keeperHand(page);
  await firstShot(page, 'curl');
  await expectSoon(() => labelShown(page, 'curl'), { timeout: 8000 }).toBe(true);
  await page.waitForTimeout(900);
  await shot(page, 'goal-curl');
  await expectSoon(async () => (await state(page)).stats.saves, { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  expect((await state(page)).stats.goals).toBe(0);
  await stopHand(page);
});

test('level 4: the bear\'s heavy ball waits at the line until the glove has held it back for long enough', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(4));
  await keeperHand(page);
  await firstShot(page, 'heavy');
  await expectSoon(async () => (await state(page)).shots[0]?.state, { timeout: 20_000 }).toBe('pushing');
  expect((await state(page)).stats.saves).toBe(0);
  await expectSoon(async () => (await state(page)).shots[0]?.pushed ?? 0, { timeout: 10_000 }).toBeGreaterThan(0.3);
  await shot(page, 'goal-heavy');
  expect(await labelShown(page, 'heavy')).toBe(true);
  await expectSoon(async () => (await state(page)).stats.saves, { timeout: 15_000 }).toBe(1);
  await stopHand(page);
});

test('level 5: two kickers shoot one after the other, to different sides, and a hand that goes across saves both', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(5));
  expect((await state(page)).kickers.map(({ who }) => who)).toEqual(['frost', 'widget']);
  await keeperHand(page);
  await firstShot(page, 'double');
  await expectSoon(async () => (await state(page)).live, { timeout: 15_000 }).toBe(2);
  await page.waitForTimeout(300);
  await shot(page, 'goal-double');
  const [first, second] = (await state(page)).shots;
  expect((first.to.x - 0.5) * (second.to.x - 0.5)).toBeLessThan(0);
  await expectSoon(async () => (await state(page)).stats.saves, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  expect((await state(page)).stats.goals).toBe(0);
  expect(await labelShown(page, 'double')).toBe(true);
  await stopHand(page);
});

test('level 6: the golden ball goes to the top corner furthest across, and saving it gives three stars at once', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(6));
  await keeperHand(page);
  const golden = await firstShot(page, 'golden');
  // The right hand's furthest corner is up on the left.
  expect(golden.to.x).toBeLessThan(0.3);
  expect(golden.to.y).toBeLessThan(0.35);
  await page.waitForTimeout(1200);
  await shot(page, 'goal-golden');
  await expectSoon(async () => (await state(page)).stats.saves, { timeout: 20_000 }).toBe(1);
  const saved = await state(page);
  expect(saved.stats.stars).toBe(3);
  expect(saved.stats.across).toBe(1);
  expect(saved.stats.high).toBe(1);
  await expect(page.locator('#chip-stars')).toHaveText('3', { timeout: 8000 });
  expect(await labelShown(page, 'golden')).toBe(true);
  await stopHand(page);
});

test('level 7: the bunny\'s bouncing ball comes down again once it\'s saved, and the second save counts too', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(7));
  await keeperHand(page);
  await firstShot(page, 'bounce');
  await expectSoon(async () => (await state(page)).stats.saves, { timeout: 20_000 }).toBe(1);
  // The same ball, on its way again.
  const bounced = await state(page);
  expect(bounced.stats.shots).toBe(1);
  expect(bounced.shots[0]).toMatchObject({ kind: 'bounce', state: 'flying', bounces: 0 });
  await page.waitForTimeout(700);
  await shot(page, 'goal-bounce');
  await expectSoon(async () => (await state(page)).stats.saves, { timeout: 20_000 }).toBe(2);
  expect((await state(page)).stats.goals).toBe(0);
  expect(await labelShown(page, 'bounce')).toBe(true);
  await stopHand(page);
});

test('level 8: the dragon\'s bubble ball bursts into bubbles, and each one the glove pops is a star', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(8));
  // Only the balls are gone to at first, so the bubbles wait where they drifted to.
  await keeperHand(page, { target: '(goal) => { const wanted = goal.wants(); return wanted?.what === "ball" ? wanted : null; }' });
  await firstShot(page, 'bubbles');
  await expectSoon(async () => (await state(page)).bubbles, { timeout: 20_000 }).toBe(3);
  expect((await state(page)).stats.stars).toBe(0);
  await page.waitForTimeout(900);
  await shot(page, 'goal-bubbles');
  expect((await state(page)).bubbles).toBe(3);
  await keeperHand(page);
  await expectSoon(async () => (await state(page)).stats.stars, { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
  expect(await labelShown(page, 'bubbles')).toBe(true);
  await stopHand(page);
});

test('level 9: the goat\'s trick shot\'s ring hops to the other side, and the hand that follows it saves', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(9));
  await keeperHand(page);
  const first = await firstShot(page, 'trick');
  await expectSoon(async () => (await state(page)).shots[0]?.hopped, { timeout: 15_000 }).toBe(true);
  const hopped = (await state(page)).shots[0];
  expect((hopped.to.x - 0.5) * (first.to.x - 0.5)).toBeLessThan(0);
  await page.waitForTimeout(600);
  await shot(page, 'goal-trick');
  await expectSoon(async () => (await state(page)).stats.saves, { timeout: 20_000 }).toBe(1);
  expect((await state(page)).stats.goals).toBe(0);
  expect(await labelShown(page, 'trick')).toBe(true);
  await stopHand(page);
});

test('level 10: once the match is won the cup floats down, the glove catches it, and all ten levels are done', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(10, { goalSaves: 6 }));
  // Only the balls are gone to, so the cup comes down and waits.
  await keeperHand(page, { target: '(goal) => { const wanted = goal.wants(); return wanted?.what === "ball" ? wanted : null; }' });
  await expectSoon(async () => (await state(page)).phase, { timeout: 120_000 }).toBe('cup');
  await expectSoon(async () => (await state(page)).cup?.state, { timeout: 10_000 }).toBe('waiting');
  expect(await labelShown(page, 'cup')).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, 'goal-cup');
  expect((await state(page)).phase).toBe('cup');
  await keeperHand(page);
  await expectSoon(async () => (await state(page)).cup?.state, { timeout: 15_000 }).toBe('caught');
  expect((await state(page)).cup.byHand).toBe(true);
  await page.waitForTimeout(500);
  await shot(page, 'goal-party');
  await waitForScreen(page, 'finish');
  await stopHand(page);
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await expect(page.locator('#finish-hero')).toHaveText('6');
});

test('nothing flashes as the cup is caught and the match is won: the party is small stars, here and there', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(10, { goalSaves: 6 }));
  await keeperHand(page);
  await expectSoon(async () => (await state(page)).phase, { timeout: 120_000 }).toBe('cup');
  // From the cup coming down, through its being caught, to just before the finish card.
  const reading = judge(await watchBrightness(page, 170));
  console.log('the cup and the party', JSON.stringify(reading));
  expect(['cup', 'won']).toContain((await state(page)).phase);
  expect(reading.biggestStep).toBeLessThan(4);
  expect(reading.flickeringShare).toBeLessThan(0.01);
  await waitForScreen(page, 'finish');
  await stopHand(page);
});

for (const level of [1, 10]) {
  test(`nothing flashes at level ${level}: balls coming, saves and stars, the brightness stays steady`, async ({ page }) => {
    test.setTimeout(180_000);
    await startPlaying(page, atLevel(level));
    await keeperHand(page);
    await expectSoon(async () => (await state(page)).stats.shots, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    const reading = judge(await watchBrightness(page, 540));
    console.log(`level ${level} in goal`, JSON.stringify(reading));
    expect(reading.biggestStep).toBeLessThan(4);
    expect(reading.flickeringShare).toBeLessThan(0.01);
    expect((await state(page)).stats.saves).toBeGreaterThanOrEqual(1);
    await stopHand(page);
  });
}
