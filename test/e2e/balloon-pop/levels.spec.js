// Balloon Pop's levels: at level 10 there are more balloons, a little faster, star balloons that need the
// open hand held on them for a moment, pairs tied together, a breeze, and more answers in the maths
// challenge. It can still be finished, and nothing flashes. Level 1 is checked by play.spec.js.
import { expect, openGame, shot, show, test, waitForHand, waitForScreen } from '../helpers.js';

const GAME = 'balloon-pop';
const AT_10 = { levels: { [GAME]: 10 } };

async function startPlaying(page, settings = {}, scene = [null, 'open']) {
  await openGame(page, { ...AT_10, ...settings }, GAME);
  await show(page, ...scene);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

async function gloveReady(page) {
  await waitForHand(page, 'open');
  await expect.poll(() => page.evaluate(() => window.__game.balloons.gloves.right.visible)).toBe(true);
}

const popped = (page) => page.evaluate(() => window.__game.balloons.total);

test('level 10 has more balloons, a little faster, with star balloons, pairs and a breeze', async ({ page }) => {
  await startPlaying(page, { reach: 'none' });
  await show(page, null, null);
  const plan = await page.evaluate(() => {
    const { balloons, session } = window.__game;
    return { level: session.level, plan: balloons.plan, pace: balloons.pace };
  });
  expect(plan.level).toBe(10);
  expect(plan.plan.stars).toBeGreaterThan(0);
  expect(plan.pace.most).toBe(10);
  expect(plan.pace.rise).toBeCloseTo(0.085 * 1.35, 4);

  // Lets the sky fill by itself, with the hand away, and keeps a note of what came up.
  const seen = await page.evaluate(async () => {
    const { balloons } = window.__game;
    const kinds = { stars: 0, pairs: 0, plain: 0 };
    const counted = new Set();
    let most = 0;
    let breezeLeast = Infinity;
    let breezeMost = -Infinity;
    const end = performance.now() + 14_000;
    while (performance.now() < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      most = Math.max(most, balloons.balloons.length);
      breezeLeast = Math.min(breezeLeast, balloons.breezeAt);
      breezeMost = Math.max(breezeMost, balloons.breezeAt);
      for (const balloon of balloons.balloons) {
        if (counted.has(balloon)) continue;
        counted.add(balloon);
        if (balloon.star) kinds.stars += 1;
        else if (balloon.tie) kinds.pairs += 1;
        else kinds.plain += 1;
      }
    }
    return { kinds, most, breeze: (breezeMost - breezeLeast) / balloons.width };
  });
  console.log('level 10 sky', JSON.stringify(seen));
  expect(seen.kinds.stars).toBeGreaterThan(0);
  expect(seen.kinds.pairs).toBeGreaterThan(0);
  expect(seen.most).toBeGreaterThan(7);
  expect(seen.most).toBeLessThanOrEqual(10);
  expect(seen.breeze).toBeGreaterThan(0.02);
  // Make sure the picture shows a pair and a star balloon, in the hand's reach.
  await page.evaluate(() => {
    const { balloons } = window.__game;
    balloons.addPair(balloons.width * 0.5, balloons.height * 0.62);
    const star = balloons.addBalloon({ x: balloons.width * 0.78, y: balloons.height * 0.45, star: true });
    star.choosing = 0.2;
  });
  await page.waitForTimeout(400);
  await shot(page, 'balloon-pop-level10-sky');
});

test('a star balloon only pops once the open hand has stayed on it a moment', async ({ page }) => {
  await startPlaying(page, { reach: 'none' });
  await gloveReady(page);
  await page.evaluate(() => {
    const { balloons } = window.__game;
    balloons.balloons = [];
    const glove = balloons.gloves.right;
    window.__star = balloons.addBalloon({ x: glove.x, y: glove.y, still: true, star: true });
  });
  await page.waitForTimeout(120);
  const early = await page.evaluate(() => ({ total: window.__game.balloons.total, choosing: window.__star.choosing }));
  expect(early.total).toBe(0);
  expect(early.choosing).toBeGreaterThan(0);
  await shot(page, 'balloon-pop-level10-star-held');
  await expect.poll(() => popped(page), { timeout: 3000 }).toBe(1);

  // A fist on one only bumps it, and the ring goes back down.
  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await page.evaluate(() => {
    const { balloons } = window.__game;
    const glove = balloons.gloves.right;
    window.__star = balloons.addBalloon({ x: glove.x, y: glove.y, still: true, star: true });
  });
  await page.waitForTimeout(900);
  expect(await popped(page)).toBe(1);
  expect(await page.evaluate(() => window.__star.choosing)).toBe(0);
});

test('a pair goes up together, and the other one floats on when one pops', async ({ page }) => {
  await startPlaying(page, { reach: 'none' });
  await gloveReady(page);
  const result = await page.evaluate(async () => {
    const { balloons } = window.__game;
    balloons.balloons = [];
    const glove = balloons.gloves.right;
    const tie = balloons.addPair(glove.x, balloons.height + 200);
    const [first, second] = tie.members;
    const together = first.pace === second.pace && first.sway === second.sway;
    // The first one comes to the hand.
    Object.assign(first, { homeX: glove.x, x: glove.x, y: glove.y, still: true, pace: 0, sway: 0 });
    const end = performance.now() + 3000;
    while (balloons.total === 0 && performance.now() < end) await new Promise((resolve) => requestAnimationFrame(resolve));
    return { together, total: balloons.total, left: tie.members.length, stillUp: balloons.balloons.includes(second) };
  });
  expect(result).toEqual({ together: true, total: 1, left: 1, stillUp: true });
});

test('with reduced motion the breeze is gentler, and the balloons still go up', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPlaying(page, { reach: 'none' });
  await show(page, null, null);
  const most = await page.evaluate(async () => {
    const { balloons } = window.__game;
    let biggest = 0;
    const end = performance.now() + 6000;
    while (performance.now() < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      biggest = Math.max(biggest, Math.abs(balloons.breezeAt) / balloons.width);
    }
    return biggest;
  });
  expect(most).toBeLessThanOrEqual(0.045 * 0.4 + 1e-6);
  expect(await page.evaluate(() => window.__game.balloons.balloons.length)).toBeGreaterThan(0);
});

test('level 10 can be finished, and says all ten levels are done', async ({ page }) => {
  await startPlaying(page, { reach: 'none' });
  await gloveReady(page);
  await page.evaluate(() => window.__game.balloons.configure({ goal: 3 }));
  for (let i = 1; i <= 3; i += 1) {
    await page.evaluate(() => {
      const { balloons } = window.__game;
      const glove = balloons.gloves.right;
      balloons.addBalloon({ x: glove.x, y: glove.y, still: true, star: true });
    });
    if (i < 3) await expect.poll(() => popped(page), { timeout: 4000 }).toBe(i);
  }
  await waitForScreen(page, 'finish');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await page.waitForTimeout(700);
  await shot(page, 'balloon-pop-level10-finish');
});

test('the maths challenge at level 10 has more answers to choose from, and the right one still pops', async ({ page }) => {
  await startPlaying(page, { maths: 'add', reach: 'none' });
  // The hand out of the picture while they come up, so that none of them starts out under it.
  await show(page, null, null);
  const waiting = () => page.evaluate(() => {
    const { balloons, question } = window.__game;
    const numbered = balloons.balloons.filter(({ number, leaving }) => number !== undefined && !leaving);
    return Boolean(question) && numbered.length > 0 && numbered.every(({ arrived, ready }) => arrived && ready) ? numbered.length : 0;
  });
  await expect.poll(waiting, { timeout: 30_000 }).toBe(5);
  // No two of them overlap.
  const closest = await page.evaluate(() => {
    const numbered = window.__game.balloons.balloons.filter(({ number, leaving }) => number !== undefined && !leaving);
    let least = Infinity;
    for (const a of numbered) for (const b of numbered) if (a !== b) least = Math.min(least, Math.hypot(a.x - b.x, a.hoverY - b.hoverY) / (a.r + b.r));
    return least;
  });
  expect(closest).toBeGreaterThan(1);
  await shot(page, 'balloon-pop-level10-maths');
  await show(page, null, 'open', { rightOffsetX: -300, rightOffsetY: 150 });
  await gloveReady(page);
  await page.evaluate(() => {
    const { balloons, question } = window.__game;
    const glove = balloons.gloves.right;
    for (const balloon of balloons.balloons) {
      if (balloon.number === undefined || balloon.leaving) continue;
      const right = balloon.number === question.answer;
      const spot = right ? { x: glove.x, y: glove.y } : { x: balloons.width * 0.5, y: balloons.height * 0.15 };
      Object.assign(balloon, { homeX: spot.x, x: spot.x, hoverY: spot.y, y: spot.y, push: 0, pushSpeed: 0 });
    }
  });
  await expect.poll(() => popped(page), { timeout: 5000 }).toBe(1);
});

/* ---------- nothing flashes, at level 1 or level 10 ---------- */

/** Reads how bright the picture is, overall and in each part, while balloons come up and get popped. */
function watchPicture(page, seconds) {
  return page.evaluate(async (length) => {
    const { balloons } = window.__game;
    const small = document.createElement('canvas');
    const across = 16;
    const down = 9;
    small.width = across;
    small.height = down;
    const context = small.getContext('2d', { willReadFrequently: true });
    const whole = [];
    const parts = Array.from({ length: across * down }, () => []);
    const started = performance.now();
    let frame = 0;
    let pops = 0;
    const before = balloons.total;
    while (performance.now() - started < length * 1000) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      frame += 1;
      // A balloon on the hand every so often, a star one now and then, so pops keep happening.
      if (frame % 12 === 0) {
        const glove = balloons.gloves.right;
        balloons.addBalloon({ x: glove.x, y: glove.y, still: true, star: frame % 36 === 0 });
      }
      context.drawImage(balloons.canvas, 0, 0, across, down);
      const { data } = context.getImageData(0, 0, across, down);
      let total = 0;
      for (let cell = 0; cell < across * down; cell += 1) {
        const value = (data[cell * 4] + data[cell * 4 + 1] + data[cell * 4 + 2]) / 3;
        total += value;
        parts[cell].push(value);
      }
      whole.push(total / (across * down));
    }
    pops = balloons.total - before;
    return { whole, parts, seconds: (performance.now() - started) / 1000, pops };
  }, seconds);
}

const biggestStep = (values) => Math.max(...values.slice(1).map((value, index) => Math.abs(value - values[index])));

/** A quarter or more of the picture getting brighter or darker by a tenth, and back: the most in a second. */
function mostFlashesInASecond(parts, seconds) {
  const frames = parts[0].length;
  const perSecond = frames / seconds;
  const span = Math.max(2, Math.round(perSecond * 0.1));
  const turns = [];
  let direction = 0;
  for (let frame = span; frame < frames; frame += 1) {
    let brighter = 0;
    let darker = 0;
    for (const values of parts) {
      const change = values[frame] - values[frame - span];
      if (change >= 25.5) brighter += 1;
      else if (change <= -25.5) darker += 1;
    }
    const now = brighter >= parts.length / 4 ? 1 : darker >= parts.length / 4 ? -1 : 0;
    if (now && now !== direction) {
      direction = now;
      turns.push(frame);
    }
  }
  let most = 0;
  turns.forEach((from, index) => {
    const within = turns.slice(index).filter((frame) => frame - from < perSecond).length;
    most = Math.max(most, Math.floor(within / 2));
  });
  return most;
}

for (const level of [1, 10]) {
  test(`at level ${level}, the picture's brightness stays steady through lots of pops`, async ({ page }) => {
    await openGame(page, { levels: { [GAME]: level }, reach: 'little', balloons: 60 }, GAME);
    await show(page, null, 'open');
    await page.locator('#start').click();
    await waitForScreen(page, 'playing');
    await gloveReady(page);
    const { whole, parts, seconds, pops } = await watchPicture(page, 8);
    const step = biggestStep(whole);
    const flashes = mostFlashesInASecond(parts, seconds);
    console.log(`level ${level}: pops ${pops}, biggest brightness step ${step.toFixed(2)}, most flashes in a second ${flashes}`);
    expect(pops).toBeGreaterThan(10);
    expect(step).toBeLessThan(5);
    expect(flashes).toBe(0);
  });
}
