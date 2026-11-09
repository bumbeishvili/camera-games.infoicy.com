// How Sky Wings sounds, and what happens when the camera or the computer lets things down.
import { expect, shot, test, waitForScreen } from '../helpers.js';
import { armsAre, flyWell, holdPlaneInFront, letPlaneGo, openSky, reachFlight, toChoosing } from './helpers.js';

for (const language of ['en', 'ka']) {
  test(`every sound and every voice line loads and decodes, in ${language}`, async ({ page }) => {
    await openSky(page, { voice: true, sound: true, language });
    await toChoosing(page);
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
    for (const name of ['propeller', 'guns', 'pop', 'music', 'hit', 'hurt', 'down', 'sparkle', 'bubble', 'whoosh', 'block', 'star']) expect(loaded.sounds[name], name).toBeGreaterThan(0.05);
    expect(loaded.sounds.propeller).toBeGreaterThan(3);
  });
}

test('the propeller and music play in flight and stop at the end, nothing clips, and no line gets cut off', async ({ page }) => {
  test.setTimeout(240_000);
  await reachFlight(page, { voice: true, sound: true, planes: 3, pace: 'fast' });
  await page.evaluate(() => {
    const { sound } = window.__game;
    window.__voicesCutOff = 0;
    const realStop = sound.stopVoice.bind(sound);
    sound.stopVoice = () => {
      if (sound.currentVoice) window.__voicesCutOff += 1;
      realStop();
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
  expect(await page.evaluate(() => [...window.__game.sound.loops.keys()].sort())).toEqual(['guns', 'music', 'propeller']);
  await flyWell(page);
  await waitForScreen(page, 'finishing');
  const peak = await page.evaluate(() => window.__peak);
  expect(peak).toBeGreaterThan(0.05);
  expect(peak).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => window.__voicesCutOff)).toBe(0);
  expect(await page.evaluate(() => window.__game.sound.loops.size)).toBe(0);
});

test('choosing a pilot speaks in that character\'s voice', async ({ page }) => {
  await openSky(page, { voice: true, sound: true });
  await toChoosing(page);
  await page.evaluate(() => window.__game.sound.ready);
  await page.evaluate(() => {
    const { sound } = window.__game;
    window.__said = [];
    const real = sound.say.bind(sound);
    sound.say = (text, options) => {
      window.__said.push(text);
      return real(text, options);
    };
  });
  await page.locator('.fighter-card[data-fighter="kit"]').click();
  expect(await page.evaluate(() => window.__said)).toEqual(['Quick as a shadow!']);
});

test('the guns can be heard only while a plane is in the ring', async ({ page }) => {
  await reachFlight(page, { sound: true });
  const level = () => page.evaluate(() => window.__game.sound.loops.get('guns').gain.gain.value);
  await holdPlaneInFront(page, { ahead: 100, across: 200 });
  await page.waitForTimeout(600);
  expect(await level()).toBeLessThan(0.05);
  await holdPlaneInFront(page, { ahead: 100 });
  await expect.poll(level, { timeout: 5000 }).toBeGreaterThan(0.2);
  await holdPlaneInFront(page, { ahead: 100, across: 200 });
  await expect.poll(level, { timeout: 5000 }).toBeLessThan(0.05);
  await letPlaneGo(page);
});

test('Georgian: what the coach asks for changes language', async ({ page }) => {
  await reachFlight(page, { language: 'ka' });
  await expect(page.locator('#coach-text')).toHaveText('ცის მეკობრეები! რგოლში მოაქციე ისინი!', { timeout: 5000 });
  await page.waitForTimeout(500);
  await shot(page, 's22-georgian');
});

test('the game makes no requests off this computer, and the page refuses to', async ({ page, baseURL, pageErrors }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  // Flying with friends is the only thing that connects anywhere, and only once a grown-up makes or joins one.
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await reachFlight(page);
  await page.waitForTimeout(1000);
  const offsite = requests.filter((url) => !url.startsWith(baseURL) && !url.startsWith('data:') && !url.startsWith('blob:'));
  expect(offsite).toEqual([]);
  expect(sockets).toEqual([]);
  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/upload', { method: 'POST', body: 'picture' });
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  await expect.poll(() => pageErrors.join('\n')).toContain("violates the following Content Security Policy directive: \"connect-src 'self' wss://hemi-race.infoicy.com ws://localhost:*\"");
  pageErrors.length = 0;
});

test('a camera that isn\'t allowed explains itself and can be tried again', async ({ page }) => {
  await openSky(page);
  await armsAre(page, 'level');
  await page.evaluate(() => {
    window.__camera.failWith = 'NotAllowedError';
  });
  await toChoosing(page);
  await page.locator('#fly-start').click();
  await waitForScreen(page, 'problem');
  await expect(page.locator('#problem-title')).toHaveText('Can we use your camera?');
  await page.evaluate(() => {
    window.__camera.failWith = null;
  });
  await page.locator('#problem-retry').click();
  await waitForScreen(page, 'bodycheck');
});

test('a frozen tracker counts as nobody there, rather than leaving the dogfight going', async ({ page }) => {
  await reachFlight(page);
  await page.evaluate(() => {
    window.__game.camera.onResult = () => {};
    window.__game.camera.sendFrame = async () => {};
  });
  await expect(page.locator('#prompt')).toContainText('Come back where I can see you', { timeout: 15_000 });
});

test('nothing flashes: the picture\'s brightness stays steady through firing, drops and clouds', async ({ page }) => {
  await reachFlight(page);
  await holdPlaneInFront(page, { ahead: 70 });
  const brightness = await page.evaluate(async () => {
    const { sky } = window.__game;
    const reading = [];
    const small = document.createElement('canvas');
    small.width = 32;
    small.height = 18;
    const context = small.getContext('2d', { willReadFrequently: true });
    for (let i = 0; i < 60; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      sky.render();
      context.drawImage(sky.canvas, 0, 0, 32, 18);
      const { data } = context.getImageData(0, 0, 32, 18);
      let total = 0;
      for (let j = 0; j < data.length; j += 4) total += (data[j] + data[j + 1] + data[j + 2]) / 3;
      reading.push(total / (32 * 18));
    }
    return reading;
  });
  const biggestStep = Math.max(...brightness.slice(1).map((value, index) => Math.abs(value - brightness[index])));
  console.log('biggest brightness step', biggestStep);
  expect(biggestStep).toBeLessThan(25);
  await letPlaneGo(page);
  expect((await page.evaluate(() => window.__game.flight.stats.hits))).toBeGreaterThan(1);

  // Right through the middle of a cloud, which fades as it's reached.
  const through = await page.evaluate(async () => {
    const { sky, flight } = window.__game;
    const cloud = sky.island.clouds[0];
    flight.enemies.length = 0;
    flight.waiting = 0;
    const reading = [];
    const small = document.createElement('canvas');
    small.width = 32;
    small.height = 18;
    const context = small.getContext('2d', { willReadFrequently: true });
    const { position } = cloud;
    for (let i = 0; i < 40; i += 1) {
      flight.x = position.x;
      flight.y = position.y;
      flight.z = position.z + 200 - i * 10;
      flight.heading = 0;
      flight.pitch = 0;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      sky.render();
      context.drawImage(sky.canvas, 0, 0, 32, 18);
      const { data } = context.getImageData(0, 0, 32, 18);
      let total = 0;
      for (let j = 0; j < data.length; j += 4) total += (data[j] + data[j + 1] + data[j + 2]) / 3;
      reading.push(total / (32 * 18));
    }
    return reading;
  });
  const biggestInCloud = Math.max(...through.slice(1).map((value, index) => Math.abs(value - through[index])));
  console.log('biggest brightness step going through a cloud', biggestInCloud);
  expect(biggestInCloud).toBeLessThan(25);
});

test('with reduced motion the dogfight still works, and the horizon doesn\'t tip', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachFlight(page);
  expect(await page.evaluate(() => window.__game.game.demo.speed)).toBeLessThan(1);
  await flyWell(page);
  await page.evaluate(() => {
    window.__game.flight.roll = 0.6;
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const up = await page.evaluate(() => {
    const { sky, flight } = window.__game;
    const { up: straight } = flight.view;
    const { up: camera } = sky.camera;
    return Math.hypot(camera.x - straight.x, camera.y - straight.y, camera.z - straight.z);
  });
  expect(up).toBeLessThan(0.1);
  await expect.poll(() => page.evaluate(() => window.__game.flight.stats.shots), { timeout: 30_000 }).toBeGreaterThan(0);
});

test('a slow computer gives up sharpness and then some of the trees, and keeps flying', async ({ page }) => {
  await reachFlight(page);
  const level = await page.evaluate(() => {
    const { sky } = window.__game;
    const trees = sky.island.manyOf[0].count;
    sky.quality = 2;
    sky.frames = 0;
    sky.slowFrames = 0;
    for (let i = 0; i < 90; i += 1) sky.watchSpeed(0.05);
    const first = [sky.quality, sky.renderer.getPixelRatio()];
    for (let i = 0; i < 90; i += 1) sky.watchSpeed(0.05);
    return { first, second: sky.quality, fewer: sky.island.manyOf[0].count < trees };
  });
  expect(level).toEqual({ first: [1, 1], second: 0, fewer: true });
  expect(await page.evaluate(() => window.__game.screen)).toBe('fly');
});

test('the choosing screen fits smaller screens, with everything reachable', async ({ page }) => {
  for (const [width, height] of [[1024, 600], [820, 1180], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/games/sky-wings/index.html?debug');
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
    await toChoosing(page);
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, `${width}`).toBeLessThanOrEqual(0);
    for (const target of ['#fly-start', '.fighter-card[data-fighter="tur"]']) {
      await page.locator(target).scrollIntoViewIfNeeded();
      await expect(page.locator(target), `${target} at ${width}`).toBeInViewport();
    }
  }
});
