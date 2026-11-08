// Balloon Pop's new things, level by level, with real photos going through the real tracker: presents
// that fall to be caught, power-up bubbles, star prizes, gems from pairs, friends in baskets, the magnet,
// rainbow balloons, the bluebird and big balloons, the places, the prize tally, and the "New:" chips.
import { expect, openGame, screenName, shot, show, test, waitForHand, waitForScreen } from '../helpers.js';

const GAME = 'balloon-pop';

async function startAt(page, level, settings = {}, scene = [null, 'open']) {
  await openGame(page, { levels: { [GAME]: level }, reach: 'none', ...settings }, GAME);
  await show(page, ...scene);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

async function gloveReady(page) {
  await waitForHand(page, 'open');
  await expect.poll(() => page.evaluate(() => window.__game.balloons.gloves.right.visible)).toBe(true);
}

const field = (page) => page.evaluate(() => {
  const { balloons } = window.__game;
  return {
    total: balloons.total,
    caught: balloons.prizeTotal,
    kinds: { ...balloons.prizeKinds },
    prizes: balloons.prizes.map(({ kind, x, y }) => ({ kind, x, y })),
    power: balloons.power?.kind ?? null,
    labels: balloons.labels.map(({ key, text }) => ({ key, text })),
    place: balloons.plan.place,
  };
});

/** A balloon of a kind right on the glove, held still there. */
const onGlove = (page, options = {}) => page.evaluate((extra) => {
  const { balloons } = window.__game;
  const glove = balloons.gloves.right;
  const balloon = balloons.addBalloon({ x: glove.x, y: glove.y, still: true, ...extra });
  return balloons.balloons.indexOf(balloon);
}, options);

/** Keeps the sky to what a test puts in it, and starts the counts again from nothing. */
const clearSky = (page) => page.evaluate(() => {
  const { balloons } = window.__game;
  balloons.balloons = [];
  balloons.prizes = [];
  balloons.baskets = [];
  balloons.spawnTimer = 999;
  balloons.resetCounts();
});

test('level 1\'s title card has nothing new on it', async ({ page }) => {
  await openGame(page, { levels: { [GAME]: 1 } }, GAME);
  await expect(page.locator('#level-new')).toBeEmpty();
});

for (const [level, words] of [[2, ['Present balloons', 'Sweets']], [3, ['Bubble glove']], [6, ['Friends in baskets', 'Hearts']], [10, ['Big balloons']]]) {
  test(`level ${level}'s title card and countdown show what's new`, async ({ page }) => {
    await openGame(page, { levels: { [GAME]: level } }, GAME);
    for (const word of words) await expect(page.locator('#level-new')).toContainText(word);
    if (level === 6) await shot(page, 'balloon-pop-new-title-6');
    await show(page, null, 'open');
    await page.locator('#start').click();
    // The countdown is over in a moment, so its chips are read as soon as it has started, or after.
    await expect.poll(() => screenName(page), { timeout: 60_000, intervals: [100] }).toMatch(/countdown|playing/);
    for (const word of words) await expect(page.locator('#level-new-now')).toContainText(word);
    if (level === 6 && (await screenName(page)) === 'countdown') await shot(page, 'balloon-pop-new-countdown-6');
  });
}

test('level 5\'s finish card says what level 6 brings, and the prizes caught', async ({ page }) => {
  await startAt(page, 5);
  await gloveReady(page);
  await clearSky(page);
  await page.evaluate(() => {
    const { balloons } = window.__game;
    balloons.configure({ goal: 2 });
    const glove = balloons.gloves.right;
    // A pair right on the hand: both pop, and a gem comes out.
    const tie = balloons.addPair(glove.x, glove.y);
    for (const member of tie.members) Object.assign(member, { homeX: glove.x, x: glove.x, y: glove.y, still: true, pace: 0, sway: 0, drift: 0 });
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#level-next-new')).toContainText('Friends in baskets');
  await expect(page.locator('#level-next-new')).toContainText('Coming up');
  await page.waitForTimeout(700);
  await shot(page, 'balloon-pop-new-finish-5');
});

test('level 1 has no prizes, power-ups or anything new, and no prize tally', async ({ page }) => {
  await startAt(page, 1);
  await show(page, null, null);
  await expect(page.locator('.chip-prizes')).toBeHidden();
  const seen = await page.evaluate(async () => {
    const { balloons } = window.__game;
    const kinds = new Set();
    const end = performance.now() + 9000;
    while (performance.now() < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      for (const balloon of balloons.balloons) kinds.add(balloon.kind ?? (balloon.star ? 'star' : balloon.tie ? 'pair' : 'plain'));
    }
    return { kinds: [...kinds], baskets: balloons.baskets.length, power: balloons.power };
  });
  expect(seen).toEqual({ kinds: ['plain'], baskets: 0, power: null });
});

test('level 2: a present balloon\'s present falls on a parachute, is caught, and its sweet is counted', async ({ page }) => {
  await startAt(page, 2);
  await show(page, null, null);
  // They come by themselves, and the first one gets its label once it's up on the screen.
  await expect.poll(() => page.evaluate(() => window.__game.balloons.balloons.some(({ kind }) => kind === 'present')), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const { balloons } = window.__game;
    const label = balloons.labels.find(({ key }) => key === 'present');
    return label ? label.target.y < balloons.height : balloons.introduced.has('present') ? 'gone' : false;
  }), { timeout: 30_000 }).toBeTruthy();
  await expect(page.locator('.chip-prizes')).toBeVisible();
  await show(page, null, 'open');
  await gloveReady(page);
  await clearSky(page);
  await onGlove(page, { kind: 'present' });
  await expect.poll(async () => (await field(page)).prizes.length, { timeout: 5000 }).toBe(1);
  await page.waitForTimeout(150);
  await shot(page, 'balloon-pop-new-present-falling');
  await expect.poll(async () => (await field(page)).caught, { timeout: 6000 }).toBe(1);
  const after = await field(page);
  expect(after.kinds.sweet).toBe(1);
  expect(after.total).toBe(1);
  await expect(page.locator('#chip-prizes')).toHaveText('1');
  await page.evaluate(() => window.__game.balloons.configure({ goal: 1 }));
  await onGlove(page);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#sum-right-prizes')).toHaveText('1');
  await expect(page.locator('#finish-prizes')).toHaveText('🍬 1');
  await page.waitForTimeout(700);
  await shot(page, 'balloon-pop-new-finish-prizes');
});

test('a prize nobody catches falls to the hills and fades, and costs nothing', async ({ page }) => {
  await startAt(page, 2);
  await gloveReady(page);
  // The hand goes away, and a present balloon pops.
  await show(page, null, null);
  await waitForHand(page, 'missing');
  await clearSky(page);
  await page.evaluate(() => {
    const { balloons } = window.__game;
    const balloon = balloons.addBalloon({ x: balloons.width * 0.6, y: balloons.height * 0.6, still: true, kind: 'present' });
    balloon.popNow = 'right';
  });
  await expect.poll(async () => (await field(page)).prizes.length, { timeout: 5000 }).toBe(1);
  await expect.poll(async () => (await field(page)).prizes.length, { timeout: 15_000 }).toBe(0);
  expect(await field(page)).toMatchObject({ total: 1, caught: 0 });
});

test('level 3: a power-up bubble comes by itself, and popping it gives the glove a bubble that reaches further, for a while', async ({ page }) => {
  await startAt(page, 3);
  await gloveReady(page);
  await expect.poll(() => page.evaluate(() => window.__game.balloons.balloons.find(({ kind }) => kind === 'power')?.power), { timeout: 20_000 }).toBe('bubble');
  await page.waitForTimeout(600);
  await shot(page, 'balloon-pop-new-bubble-rising');
  await clearSky(page);
  // A balloon just out of the open hand's reach doesn't pop.
  const outOfReach = () => page.evaluate(() => {
    const { balloons } = window.__game;
    const glove = balloons.gloves.right;
    balloons.balloons = balloons.balloons.filter(({ kind }) => kind === 'power');
    // Below the palm, where no fingertip is.
    const balloon = balloons.addBalloon({ x: glove.x, y: glove.y + balloons.palmSize * 1.75, still: true });
    balloon.r = balloons.balloonSize;
    return balloons.total;
  });
  const before = await outOfReach();
  await page.waitForTimeout(700);
  expect((await field(page)).total).toBe(before);
  await page.evaluate(() => {
    window.__game.balloons.balloons = [];
  });
  await onGlove(page, { kind: 'power', power: 'bubble' });
  await expect.poll(async () => (await field(page)).power, { timeout: 5000 }).toBe('bubble');
  // Popping the bubble doesn't count as a balloon.
  expect((await field(page)).total).toBe(before);
  await outOfReach();
  await expect.poll(async () => (await field(page)).total, { timeout: 3000 }).toBe(before + 1);
  await shot(page, 'balloon-pop-new-bubble-glove');
  // It wears off.
  await page.evaluate(() => {
    window.__game.balloons.power.left = 0.3;
  });
  await expect.poll(async () => (await field(page)).power, { timeout: 3000 }).toBe(null);
});

test('level 4: a star balloon drops a gold star, which drifts to the hand and is caught', async ({ page }) => {
  await startAt(page, 4);
  await gloveReady(page);
  await clearSky(page);
  await onGlove(page, { star: true });
  await expect.poll(async () => (await field(page)).kinds.star, { timeout: 8000 }).toBe(1);
  expect((await field(page)).kinds.sweet).toBe(0);
});

test('level 5: popping both of a pair drops a gem, and it\'s by the sea', async ({ page }) => {
  await startAt(page, 5);
  expect((await field(page)).place).toBe('seaside');
  await gloveReady(page);
  await clearSky(page);
  await page.evaluate(() => {
    const { balloons } = window.__game;
    const glove = balloons.gloves.right;
    const tie = balloons.addPair(glove.x - 200, balloons.height * 0.4);
    for (const member of tie.members) Object.assign(member, { still: true, pace: 0, sway: 0, drift: 0 });
    window.__tie = tie;
  });
  await page.waitForTimeout(400);
  await shot(page, 'balloon-pop-new-seaside-pair');
  // One popped: no gem yet.
  await page.evaluate(() => {
    const glove = window.__game.balloons.gloves.right;
    Object.assign(window.__tie.members[0], { homeX: glove.x, x: glove.x, y: glove.y });
  });
  await expect.poll(async () => (await field(page)).total, { timeout: 4000 }).toBe(1);
  expect((await field(page)).prizes).toHaveLength(0);
  await page.evaluate(() => {
    const glove = window.__game.balloons.gloves.right;
    Object.assign(window.__tie.members[0], { homeX: glove.x, x: glove.x, y: glove.y });
  });
  await expect.poll(async () => (await field(page)).kinds.gem, { timeout: 8000 }).toBe(1);
});

test('level 6: a friend floats up in a basket by themselves, Joze first; popping all three brings them down, with a heart', async ({ page }) => {
  await startAt(page, 6);
  // The hand away, so that it doesn't pop any of the basket's balloons.
  await show(page, null, null);
  await expect.poll(() => page.evaluate(() => window.__game.balloons.baskets[0]?.friend), { timeout: 20_000 }).toBe('joze');
  await page.evaluate(() => {
    const [basket] = window.__game.balloons.baskets;
    basket.y = window.__game.balloons.height * 0.75;
  });
  await page.waitForTimeout(500);
  await shot(page, 'balloon-pop-new-basket');
  // Each balloon popped slows it, and the third brings it down.
  const rises = await page.evaluate(async () => {
    const { balloons } = window.__game;
    const [basket] = balloons.baskets;
    const speeds = [];
    for (let left = 3; left >= 1; left -= 1) {
      const before = basket.y;
      await new Promise((resolve) => setTimeout(resolve, 400));
      speeds.push(before - basket.y);
      basket.balloons[0].popNow = 'right';
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    // Its heart is kept up in the sky while the hand comes back, however long that takes.
    const heart = balloons.prizes.find(({ kind }) => kind === 'heart');
    if (heart) heart.y = -balloons.height;
    return { speeds, state: basket.state, total: balloons.total, heart: Boolean(heart) };
  });
  expect(rises.heart).toBe(true);
  expect(rises.speeds[0]).toBeGreaterThan(rises.speeds[2]);
  expect(rises.state).toBe('falling');
  expect(rises.total).toBe(3);
  await page.waitForTimeout(500);
  await shot(page, 'balloon-pop-new-basket-coming-down');
  // Its heart drifts to the hand.
  await show(page, null, 'open');
  await gloveReady(page);
  await page.evaluate(() => {
    const { balloons } = window.__game;
    const heart = balloons.prizes.find(({ kind }) => kind === 'heart');
    const glove = balloons.gloves.right;
    Object.assign(heart, { homeX: glove.x - balloons.height * 0.25, y: glove.y - balloons.height * 0.1, vy: 0 });
  });
  await expect.poll(async () => (await field(page)).kinds.heart, { timeout: 10_000 }).toBe(1);
});

test('level 7: the magnet comes first, and pulls prizes and balloons to the hand', async ({ page }) => {
  await startAt(page, 7);
  await gloveReady(page);
  await expect.poll(() => page.evaluate(() => window.__game.balloons.balloons.find(({ kind }) => kind === 'power')?.power), { timeout: 20_000 }).toBe('magnet');
  await clearSky(page);
  await onGlove(page, { kind: 'power', power: 'magnet' });
  await expect.poll(async () => (await field(page)).power, { timeout: 5000 }).toBe('magnet');
  // A star dropped far from the hand comes to it.
  await page.evaluate(() => {
    const { balloons } = window.__game;
    const glove = balloons.gloves.right;
    balloons.dropPrize('star', glove.x - balloons.height * 0.6, glove.y - balloons.height * 0.2);
  });
  await page.waitForTimeout(500);
  await shot(page, 'balloon-pop-new-magnet');
  await expect.poll(async () => (await field(page)).kinds.star, { timeout: 5000 }).toBe(1);
});

test('level 8: a rainbow balloon\'s pop spreads to the balloons round it, at the fair', async ({ page }) => {
  await startAt(page, 8);
  expect((await field(page)).place).toBe('fair');
  await gloveReady(page);
  await clearSky(page);
  await page.evaluate(() => {
    const { balloons } = window.__game;
    const glove = balloons.gloves.right;
    const size = balloons.balloonSize;
    for (const [dx, dy] of [[-2.2, -0.6], [2.2, -0.4], [0, -2.4], [-1.6, -2.2]]) balloons.addBalloon({ x: glove.x + dx * size, y: glove.y + dy * size, still: true });
    // One far away, which it doesn't reach.
    balloons.addBalloon({ x: balloons.width * 0.1, y: balloons.height * 0.2, still: true });
  });
  await page.waitForTimeout(300);
  await onGlove(page, { kind: 'rainbow' });
  await page.waitForTimeout(250);
  await shot(page, 'balloon-pop-new-rainbow');
  await expect.poll(async () => (await field(page)).total, { timeout: 5000 }).toBe(5);
  expect(await page.evaluate(() => window.__game.balloons.balloons.length)).toBe(1);
});

test('level 9: the bluebird comes first, and pops balloons near the hand by itself', async ({ page }) => {
  await startAt(page, 9);
  await gloveReady(page);
  await expect.poll(() => page.evaluate(() => window.__game.balloons.balloons.find(({ kind }) => kind === 'power')?.power), { timeout: 20_000 }).toBe('bird');
  await clearSky(page);
  await onGlove(page, { kind: 'power', power: 'bird' });
  await expect.poll(async () => (await field(page)).power, { timeout: 5000 }).toBe('bird');
  await page.evaluate(() => {
    const { balloons } = window.__game;
    const glove = balloons.gloves.right;
    for (const dx of [-2.8, 2.8]) balloons.addBalloon({ x: glove.x + dx * balloons.balloonSize, y: glove.y - balloons.balloonSize * 1.5, still: true });
  });
  await page.waitForTimeout(700);
  await shot(page, 'balloon-pop-new-bluebird');
  await expect.poll(async () => (await field(page)).total, { timeout: 6000 }).toBe(2);
});

test('level 10: a big balloon pops into three, and the sky has every kind in it by itself', async ({ page }) => {
  test.setTimeout(120_000);
  await startAt(page, 10);
  await show(page, null, null);
  const seen = await page.evaluate(async () => {
    const { balloons } = window.__game;
    const kinds = new Set();
    const end = performance.now() + 30_000;
    while (performance.now() < end && kinds.size < 7) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      for (const balloon of balloons.balloons) {
        if (balloon.kind) kinds.add(balloon.kind === 'power' ? `power-${balloon.power}` : balloon.kind);
        if (balloon.star) kinds.add('star');
        if (balloon.tie) kinds.add('pair');
      }
      if (balloons.baskets.length) kinds.add('basket');
    }
    return [...kinds].sort();
  });
  console.log('level 10 kinds', seen.join(', '));
  for (const kind of ['basket', 'power-bird', 'present', 'star']) expect(seen).toContain(kind);
  await show(page, null, 'open');
  await gloveReady(page);
  await clearSky(page);
  await page.evaluate(() => {
    window.__game.balloons.baskets = [];
  });
  await onGlove(page, { kind: 'big' });
  await page.waitForTimeout(200);
  await shot(page, 'balloon-pop-new-big');
  await expect.poll(() => page.evaluate(() => window.__game.balloons.total), { timeout: 4000 }).toBeGreaterThanOrEqual(1);
  // The three it popped into are there, floating up, unless the hand popped them straight away.
  const after = await page.evaluate(() => ({ total: window.__game.balloons.total, up: window.__game.balloons.balloons.length }));
  expect(after.total - 1 + after.up).toBe(3);
});

test('with reduced motion, prizes still fall and are caught, and nothing new sways about', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startAt(page, 6);
  await gloveReady(page);
  await clearSky(page);
  await onGlove(page, { kind: 'present' });
  await expect.poll(async () => (await field(page)).caught, { timeout: 8000 }).toBe(1);
});

test('turning the maths challenge on while the bluebird and a rainbow are popping is safe', async ({ page }) => {
  // The page failing with an error fails the test too (see helpers.js).
  await startAt(page, 9);
  await gloveReady(page);
  await clearSky(page);
  const before = await page.evaluate(async () => {
    const { balloons, session } = window.__game;
    const glove = balloons.gloves.right;
    balloons.startPower('bird', glove);
    const size = balloons.balloonSize;
    for (let i = 0; i < 6; i += 1) balloons.addBalloon({ x: glove.x + (i - 2.5) * size * 0.9, y: glove.y - size * 2.2, still: true });
    const rainbow = balloons.addBalloon({ x: glove.x, y: glove.y - size * 2.6, kind: 'rainbow', still: true });
    rainbow.popNow = 'right';
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // A grown-up turns the maths on, with the rainbow's pop still spreading and the bird looking for a balloon.
    session.changeSettings({ maths: 'add' });
    return balloons.total;
  });
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({
    total: window.__game.balloons.total,
    sentAway: window.__game.balloons.balloons.every((balloon) => balloon.leaving || balloon.number !== undefined),
  }));
  expect(after).toEqual({ total: before, sentAway: true });
});
