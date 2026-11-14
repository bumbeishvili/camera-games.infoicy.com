// Arrow Meadow's ten levels: what each brings is on the title card and under the countdown, each new thing comes
// along and works in the real game, and nothing flashes, at level 1 or at level 10 with all of it about.
import { openGame, shot } from '../helpers.js';
import { archer, expect, expectSoon, GAME, hands, judge, startPlaying, state, stopArcher, test, waitForScreen, watchBrightness } from './helpers.js';

const NEW_AT = {
  2: ['Balloons'],
  3: ['The far target'],
  4: ['A target on wheels'],
  5: ['Wind'],
  6: ['The hay wall'],
  7: ['The bell'],
  8: ['The windmill'],
  9: ['A bird with a gift'],
  10: ['The castle'],
};
const atLevel = (level, more = {}) => ({ levels: { [GAME]: level }, ...more });
const special = async (page) => (await state(page)).targets.find((target) => target.slot === 'special') ?? null;
/** The level's own kind of target, once it has come: what's new comes first. */
async function firstSpecial(page, kind) {
  await expectSoon(async () => (await special(page))?.kind, { timeout: 15_000 }).toBe(kind);
  return special(page);
}
/** What an archer aims at who only wants one kind of target, as a function for the page. */
const only = (kind) => `(meadow) => {
  const target = meadow.live.find((each) => each.kind === '${kind}');
  if (!target) return null;
  for (const draw of [1, 0.85, 0.7]) {
    const angle = meadow.solve(target, draw) ?? meadow.solve(target, draw, { lob: true });
    if (angle !== null) return { angle, draw, target };
  }
  return null;
}`;

test('the title card says what each level brings, and level 1 is the plain meadow', async ({ page }) => {
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
  await shot(page, 'arrows-title-level-10');
});

test('under the countdown it says what\'s new, in Georgian too', async ({ page }) => {
  await openGame(page, { language: 'ka', ...atLevel(7) }, GAME);
  await hands(page, { string: 'open' });
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('ზარი');
  await expect(page.locator('#level-now')).toHaveText('დონე 7');
  await waitForScreen(page, 'playing');
  await expect(page.locator('#story-line')).toHaveText(/[Ⴀ-ჿ]/);
  // What's new has its label in Georgian the first time it comes.
  await firstSpecial(page, 'bell');
  await expectSoon(() => page.evaluate(() => window.__game.view.labels[0]?.text ?? ''), { timeout: 15_000 }).toMatch(/[Ⴀ-ჿ]/);
  await shot(page, 'arrows-georgian');
});

test('level 2: a balloon bobs up in the air, an arrow pops it, and its star goes up to the tally', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(2));
  await expect(page.locator('#chip-stars-box')).toBeVisible();
  await expect(page.locator('#chip-stars')).toHaveText('0');
  const balloon = await firstSpecial(page, 'balloon');
  expect(balloon.y).toBeLessThan(0.45);
  // A plain target is up as well, as at every level.
  expect((await state(page)).targets.filter((target) => target.slot === 'plain')).toHaveLength(1);
  await expectSoon(async () => (await state(page)).labels, { timeout: 10_000 }).toContain('balloon');
  await page.waitForTimeout(500);
  await shot(page, 'arrows-level-2-balloon');
  await archer(page, { target: only('balloon'), every: 0.4 });
  await expectSoon(async () => (await state(page)).stats.stars, { timeout: 40_000 }).toBe(1);
  await expect(page.locator('#chip-stars')).toHaveText('1', { timeout: 10_000 });
  const after = await state(page);
  expect(after.stats.hits).toBe(1);
  // The arrow went on through the balloon, which is no miss.
  expect(after.stats.misses).toBe(0);
  await stopArcher(page);
});

test('level 3: the far target stands at the far end, and a bow drawn right back reaches it', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(3));
  const far = await firstSpecial(page, 'far');
  expect(far.x).toBeGreaterThan(1.3);
  await archer(page, { target: only('far'), every: 0.4 });
  await expectSoon(async () => (await state(page)).aim?.target, { timeout: 30_000 }).toBe('far');
  await page.waitForTimeout(300);
  await shot(page, 'arrows-level-3-far');
  await expectSoon(async () => (await state(page)).stats.stars, { timeout: 40_000 }).toBe(1);
  expect((await state(page)).labels).toContain('far');
  await stopArcher(page);
});

test('level 4: a target on wheels rolls slowly to and fro, and an arrow let go at it hits it', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(4));
  const first = await firstSpecial(page, 'roller');
  await page.waitForTimeout(2500);
  const later = await special(page);
  expect(later.id).toBe(first.id);
  expect(Math.abs(later.x - first.x)).toBeGreaterThan(0.03);
  await archer(page, { target: only('roller'), every: 0.4 });
  await expectSoon(async () => (await state(page)).stats.stars, { timeout: 40_000 }).toBe(1);
  expect((await state(page)).labels).toContain('roller');
  await shot(page, 'arrows-level-4-roller');
  await stopArcher(page);
});

test('level 5: the wind blows, its flag says which way, the dotted line bends with it, and it changes with each plain target', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(5, { arrowHelp: 'off' }));
  const start = await state(page);
  expect(start.wind).toBeGreaterThan(0);
  await expectSoon(async () => (await state(page)).labels, { timeout: 10_000 }).toContain('wind');
  // The same bow, held the same: the dotted line ends further off with the wind behind the arrow than against it.
  await hands(page, { apart: 4, lift: 1.6 });
  await expectSoon(async () => (await state(page)).ready, { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(800);
  const ends = await page.evaluate(() => {
    const { meadow, game } = window.__game;
    const kept = meadow.targets;
    meadow.targets = [];
    const lands = (wind) => {
      meadow.wind = wind;
      return meadow.aimFor(game.hands.angle, game.hands.draw).end.x;
    };
    const real = meadow.wind;
    const result = { along: lands(0.2), still: lands(0), against: lands(-0.15) };
    meadow.wind = real;
    meadow.targets = kept;
    return result;
  });
  expect(ends.along).toBeGreaterThan(ends.still + 0.04);
  expect(ends.still).toBeGreaterThan(ends.against + 0.03);
  await shot(page, 'arrows-level-5-wind');
  // A plain target hit, and the wind is another wind.
  await archer(page, { target: only('butt'), every: 0.4 });
  await expectSoon(async () => (await state(page)).wind, { timeout: 40_000 }).not.toBe(start.wind);
  expect((await state(page)).stats.hits).toBeGreaterThanOrEqual(1);
  expect((await state(page)).happened.wind).toBeGreaterThanOrEqual(1);
  await stopArcher(page);
});

test('level 6: a low arrow bonks off the hay wall, and a high arc goes over it to the target behind', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(6, { arrowHelp: 'off' }));
  await firstSpecial(page, 'wall');
  // With the plain target out of the line of fire, for this.
  await page.evaluate(() => {
    const { meadow } = window.__game;
    meadow.targets = meadow.targets.filter((target) => target.slot !== 'plain');
    meadow.waits.plain = Infinity;
  });
  // Straight at the target, which is behind the wall.
  await archer(page, { target: '(meadow) => (meadow.live.some((each) => each.kind === "wall") ? { angle: 0.12, draw: 1 } : null)', every: 0.4, within: 3 });
  await expectSoon(async () => (await state(page)).happened['bonk-wall'] ?? 0, { timeout: 40_000 }).toBeGreaterThanOrEqual(1);
  let now = await state(page);
  expect(now.stats.hits).toBe(0);
  expect(now.stats.stars).toBe(0);
  expect((await special(page)).state).toBe('up');
  // Up and over.
  await archer(page, { target: only('wall'), every: 0.4 });
  await expectSoon(async () => (await state(page)).aim?.target, { timeout: 30_000 }).toBe('wall');
  expect((await state(page)).aim.angle).toBeGreaterThan(45);
  await page.waitForTimeout(250);
  await shot(page, 'arrows-level-6-wall');
  await expectSoon(async () => (await state(page)).stats.stars, { timeout: 40_000 }).toBe(1);
  now = await state(page);
  expect(now.labels).toContain('wall');
  await stopArcher(page);
});

test('level 7: an arrow rings the bell up on its post, for two stars', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(7));
  const bell = await firstSpecial(page, 'bell');
  expect(bell.y).toBeLessThan(0.4);
  await archer(page, { target: only('bell'), every: 0.4 });
  await expectSoon(async () => (await state(page)).stats.stars, { timeout: 40_000 }).toBe(2);
  await expect(page.locator('#chip-stars')).toHaveText('2', { timeout: 10_000 });
  expect((await state(page)).labels).toContain('bell');
  await shot(page, 'arrows-level-7-bell');
  await stopArcher(page);
});

test('level 8: the windmill\'s sails turn round its target, and an arrow let go when the line gets through hits it', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(8));
  await firstSpecial(page, 'mill');
  const turning = () => page.evaluate(() => {
    const { meadow } = window.__game;
    const { mill } = meadow.targets.find((target) => target.kind === 'mill');
    return mill.phase + mill.rate * meadow.time;
  });
  const before = await turning();
  await page.waitForTimeout(1500);
  expect(await turning()).toBeGreaterThan(before + 0.4);
  await archer(page, { target: only('mill'), every: 0.4 });
  await expectSoon(async () => (await state(page)).aim?.target, { timeout: 40_000 }).toBe('mill');
  await shot(page, 'arrows-level-8-mill');
  await expectSoon(async () => (await state(page)).stats.stars, { timeout: 60_000 }).toBe(2);
  expect((await state(page)).labels).toContain('mill');
  await stopArcher(page);
});

test('level 9: a bird carries a gift across, and an arrow that hits the gift wins three stars', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(9));
  await expectSoon(async () => (await state(page)).bird !== null, { timeout: 30_000 }).toBe(true);
  expect((await state(page)).targets.some((target) => target.kind === 'gift')).toBe(true);
  // The archer waits for it to come near enough, and lets go at where the gift will be.
  await archer(page, { target: only('gift'), every: 0.4, within: 3 });
  await expectSoon(async () => (await state(page)).stats.stars, { timeout: 120_000 }).toBeGreaterThanOrEqual(3);
  const after = await state(page);
  expect(after.labels).toContain('bird');
  // The bird flies on, with nothing to carry.
  expect(after.bird?.given ?? true).toBe(true);
  await shot(page, 'arrows-level-9-bird');
  await stopArcher(page);
});

test('level 10: once the contest is won the castle\'s golden target comes up, hitting it wins the trophy, and all ten levels are done', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page, atLevel(10, { arrowGoal: 6 }));
  expect(await page.evaluate(() => window.__game.view.castle)).toBe(true);
  await archer(page, { every: 0.4 });
  await expectSoon(async () => (await state(page)).phase, { timeout: 150_000 }).toBe('castle');
  await expectSoon(async () => (await state(page)).targets.map((target) => target.kind), { timeout: 10_000 }).toEqual(['castle']);
  await expectSoon(async () => (await state(page)).labels, { timeout: 10_000 }).toContain('castle');
  await shot(page, 'arrows-level-10-castle');
  await expectSoon(async () => (await state(page)).phase, { timeout: 60_000 }).toBe('won');
  expect((await state(page)).stats.trophy).toBe(true);
  await page.waitForTimeout(500);
  await shot(page, 'arrows-party');
  await waitForScreen(page, 'finish');
  await stopArcher(page);
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await expect(page.locator('#finish-hero')).toHaveText('6');
  await expect(page.locator('#sum-right-stars')).toContainText('🏆');
});

test('nothing flashes as the golden target is hit and the contest is won: the party is small stars, here and there', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page, atLevel(10, { arrowGoal: 6 }));
  await archer(page, { every: 0.4 });
  await expectSoon(async () => (await state(page)).phase, { timeout: 150_000 }).toBe('castle');
  // From the golden target coming up, through its being hit, to just before the finish card.
  const reading = judge(await watchBrightness(page, 200));
  console.log('the golden target and the party', JSON.stringify(reading));
  expect(reading.biggestStep).toBeLessThan(4);
  expect(reading.flickeringShare).toBeLessThan(0.01);
  await waitForScreen(page, 'finish');
  await stopArcher(page);
});

for (const level of [1, 10]) {
  test(`nothing flashes at level ${level}: arrows flying, targets hit and stars, the brightness stays steady`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPlaying(page, atLevel(level, { arrowGoal: 14 }));
    await archer(page, { every: 0.4 });
    await expectSoon(async () => (await state(page)).stats.shots, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
    const reading = judge(await watchBrightness(page, 540));
    console.log(`level ${level} in the meadow`, JSON.stringify(reading));
    expect(reading.biggestStep).toBeLessThan(4);
    expect(reading.flickeringShare).toBeLessThan(0.01);
    const end = await state(page);
    expect(end.stats.hits).toBeGreaterThanOrEqual(2);
    console.log(`level ${level}: what happened while it was watched`, JSON.stringify(end.happened));
    await stopArcher(page);
  });
}

test('with a hand opening and closing as quickly as it can, nothing flashes either', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(10));
  // Four times a second, quicker than any child, with the bow drawn right back and pointing up.
  await page.evaluate(() => {
    let n = 0;
    window.__flap = setInterval(() => {
      n += 1;
      window.__camera.show({ left: 'open', right: n % 2 ? 'fist' : 'open', scale: 0.62, sameHand: true, leftOnTop: true, leftOffsetX: 100, rightOffsetX: -100, leftOffsetY: -70, rightOffsetY: 70 });
    }, 125);
  });
  await page.waitForTimeout(1500);
  const reading = judge(await watchBrightness(page, 360));
  console.log('a hand opening and closing four times a second', JSON.stringify(reading));
  expect(reading.biggestStep).toBeLessThan(4);
  expect(reading.flickeringShare).toBeLessThan(0.03);
  await page.evaluate(() => clearInterval(window.__flap));
});
