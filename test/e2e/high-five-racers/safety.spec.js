// Seizures are more common in children with hemiplegia, so nothing may flash or flicker, whatever's
// going on. These read the picture itself, frame by frame, the same way as Sky Wings' test does.
import { expect, openGame, reachRace, shot, show, test, waitForHand, waitUntilMoving } from '../helpers.js';

async function raceWithOpenHand(page, settings = {}) {
  await openGame(page, settings);
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
}

/** Reads how bright the whole picture is, and each part of it, for a number of frames. */
function watchPicture(page, frames, during = null) {
  return page.evaluate(async ([count, code]) => {
    const { race } = window.__game;
    const small = document.createElement('canvas');
    const across = 16;
    const down = 9;
    small.width = across;
    small.height = down;
    const context = small.getContext('2d', { willReadFrequently: true });
    const whole = [];
    const parts = Array.from({ length: across * down }, () => []);
    const distance = [];
    const started = performance.now();
    const step = code ? new Function('race', 'frame', code) : null;
    for (let frame = 0; frame < count; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (step?.(race, frame)) break;
      race.render();
      context.drawImage(race.renderer.domElement, 0, 0, across, down);
      const { data } = context.getImageData(0, 0, across, down);
      let total = 0;
      for (let cell = 0; cell < across * down; cell += 1) {
        const value = (data[cell * 4] + data[cell * 4 + 1] + data[cell * 4 + 2]) / 3;
        total += value;
        parts[cell].push(value);
      }
      whole.push(total / (across * down));
      distance.push(race.distance % race.track.length);
    }
    return { whole, parts, distance, seconds: (performance.now() - started) / 1000 };
  }, [frames, during]);
}

const biggestStep = (values) => Math.max(...values.slice(1).map((value, index) => Math.abs(value - values[index])));

/**
 * The way flashes are usually counted: a quarter or more of the picture getting brighter or darker by
 * a tenth of the range, all together, and then the opposite. Returns the most in any one second.
 */
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

test('the picture\'s brightness stays steady through high fives and turbo', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'auto' });
  // Right up to a big hand, with the hand wide open, so that a slap and turbo both happen.
  await page.evaluate(() => {
    const { race } = window.__game;
    const { gate } = race.gates.next(race.distance + 40);
    const lap = race.track.length * Math.max(0, race.lapIndex);
    race.distance = gate.along + lap - 45;
    race.lateral = gate.side * 4;
    race.snapCamera = true;
  });
  const fivesBefore = await page.evaluate(() => window.__game.race.fives);
  const { whole } = await watchPicture(page, 120);
  const step = biggestStep(whole);
  console.log('biggest brightness step through a slap', step.toFixed(2));
  expect(step).toBeLessThan(15);
  expect(await page.evaluate(() => window.__game.race.fives)).toBeGreaterThan(fivesBefore);
  expect(await page.evaluate(() => window.__game.race.turbo.active)).toBe(true);
});

test('going through the tunnel doesn\'t change how bright the picture is', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  await page.evaluate(() => {
    const { race } = window.__game;
    const lap = race.track.length * Math.max(0, race.lapIndex);
    race.distance = 340 + lap - 50;
    race.snapCamera = true;
    for (const rival of race.rivals) rival.distance = race.distance - 200;
  });
  await page.waitForTimeout(150);
  // Long enough to go in and be well inside, at the speed the car's going.
  const { whole, parts, distance, seconds } = await watchPicture(page, 600, 'if (race.distance % race.track.length > 432) return true;');
  await shot(page, 'r-tunnel-inside');
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  // The camera is about 12 metres behind the car.
  const outside = mean(whole.filter((_, frame) => distance[frame] < 335));
  const inside = mean(whole.filter((_, frame) => distance[frame] > 362 && distance[frame] < 430));
  const step = biggestStep(whole);
  const flashes = mostFlashesInASecond(parts, seconds);
  console.log('tunnel: outside', outside.toFixed(1), 'inside', inside.toFixed(1), 'biggest step', step.toFixed(2), 'most flashes in a second', flashes);
  expect(inside).toBeGreaterThan(0);
  expect(Math.abs(inside - outside)).toBeLessThan(15);
  expect(step).toBeLessThan(15);
  expect(flashes).toBeLessThanOrEqual(1);
});

test('flying from the other hand\'s turbo doesn\'t change how bright the picture is', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  await page.evaluate(() => {
    window.__highest = 0;
  });
  const { whole, parts, seconds } = await watchPicture(page, 300, `
    if (frame === 5) { race.turbo.burst(); race.takeOff(); }
    window.__highest = Math.max(window.__highest, race.lift);
  `);
  const highest = await page.evaluate(() => window.__highest);
  const step = biggestStep(whole);
  const flashes = mostFlashesInASecond(parts, seconds);
  console.log('flight: highest', highest.toFixed(1), 'biggest step', step.toFixed(2), 'most flashes in a second', flashes);
  expect(highest).toBeGreaterThan(4);
  expect(step).toBeLessThan(15);
  expect(flashes).toBeLessThanOrEqual(1);
});

test('a whole lap at full speed never flashes more than once in a second', async ({ page }) => {
  test.setTimeout(180_000);
  await raceWithOpenHand(page, { steering: 'auto', laps: 2 });
  const { whole, parts, seconds } = await watchPicture(page, 1500);
  const step = biggestStep(whole);
  const flashes = mostFlashesInASecond(parts, seconds);
  console.log('lap: seconds', seconds.toFixed(1), 'biggest step', step.toFixed(2), 'most flashes in a second', flashes);
  expect(step).toBeLessThan(15);
  expect(flashes).toBeLessThanOrEqual(1);
});

test('closing the hand doesn\'t change the brightness either', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  const reading = watchPicture(page, 90);
  await show(page, null, 'fist');
  const { whole } = await reading;
  const step = biggestStep(whole);
  console.log('braking step', step.toFixed(2));
  expect(step).toBeLessThan(15);
});

test('with reduced motion there are no speed lines or moving flames, and it still all works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await raceWithOpenHand(page, { steering: 'auto' });
  await expect.poll(() => page.evaluate(() => window.__game.race.fives), { timeout: 40_000 }).toBeGreaterThan(0);
  const state = await page.evaluate(() => {
    const { race } = window.__game;
    return {
      lines: race.speedLines.mesh.visible,
      time: race.world.time.value,
      animation: getComputedStyle(document.querySelector('#turbo .turbo-flame')).animationName,
      fov: race.camera.fov,
    };
  });
  expect(state.lines).toBe(false);
  expect(state.time).toBe(0);
  expect(state.animation).toBe('none');
  expect(state.fov).toBe(60);
  await shot(page, 'r-reduced-motion');
});

test('a slow computer drops the small things last of all, and keeps playing', async ({ page }) => {
  await raceWithOpenHand(page);
  const levels = await page.evaluate(() => {
    const { race } = window.__game;
    const slowFor = () => {
      race.quality.frames = 40;
      race.quality.seconds = 4;
      race.watchFrameRate(0);
    };
    const read = () => ({
      level: race.quality.level,
      sharp: race.renderer.getPixelRatio(),
      shadows: race.renderer.shadowMap.enabled,
      small: race.world.small.visible,
      medium: race.world.medium.visible,
      ink: race.player.inkLines.visible,
    });
    const seen = [];
    for (let i = 0; i < 6; i += 1) {
      slowFor();
      seen.push(read());
    }
    return seen;
  });
  expect(levels[0]).toMatchObject({ level: 1, sharp: 1, shadows: true, small: true, medium: true, ink: true });
  expect(levels[1]).toMatchObject({ level: 2, shadows: false, small: true, medium: true, ink: true });
  expect(levels[2]).toMatchObject({ level: 3, small: false, medium: true, ink: false });
  expect(levels[3]).toMatchObject({ level: 4, small: false, medium: false });
  // It stops there, and the race goes on.
  expect(levels[5].level).toBe(4);
  const { distance, speed } = await page.evaluate(() => ({ distance: window.__game.race.distance, speed: window.__game.race.speed }));
  expect(speed).toBeGreaterThan(5);
  await expect.poll(() => page.evaluate(() => window.__game.race.distance)).toBeGreaterThan(distance + 10);
  await shot(page, 'r-lowest-quality');
});

test('a word from the last race doesn\'t come back at the start of the next', async ({ page }) => {
  await raceWithOpenHand(page, { laps: 1, steering: 'auto' });
  await page.evaluate(() => window.__game.game.toast('High five!'));
  await expect(page.locator('#toast')).toHaveClass(/is-showing/);
  // Turbo and passing a rival bring up words of their own, so it's this word that has to go.
  await expect.poll(() => page.evaluate(() => {
    const box = document.querySelector('#toast');
    return box.classList.contains('is-showing') && box.textContent.includes('High five!');
  }), { timeout: 4000 }).toBe(false);
});

test('a good computer doesn\'t lose anything, and the first moments don\'t count against it', async ({ page }) => {
  await openGame(page);
  const before = await page.evaluate(() => {
    const { race } = window.__game;
    // A slow title screen doesn't count. Only a race does.
    race.quality.frames = 10;
    race.quality.seconds = 4;
    race.watchFrameRate(0);
    return race.quality.level;
  });
  expect(before).toBe(0);
});
