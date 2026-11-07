// How Mighty Moves sounds, in the real browser's audio system.
import { expect, shot, test, waitForScreen } from '../helpers.js';
import { doWhatIsAsked, fightState, footage, openMoves, reachFight, stopDoingIt, toChoosing } from './helpers.js';

for (const language of ['en', 'ka']) {
  test(`every sound and every voice line loads and decodes, in ${language}`, async ({ page }) => {
    await openMoves(page, { voice: true, sound: true, language });
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
    for (const name of ['whoosh1', 'whoosh2', 'whoosh3', 'clap', 'hit1', 'hit2', 'hit3', 'thump', 'block', 'boom', 'jump', 'sparkle', 'bell', 'cheer', 'music']) {
      expect(loaded.sounds[name], name).toBeGreaterThan(0.05);
    }
    expect(loaded.sounds.music).toBeGreaterThan(60);
  });
}

test('the music plays during a fight, stays under the voice, and nothing clips or gets cut off', async ({ page }) => {
  await reachFight(page, { voice: true, sound: true });
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
    window.__energy = 0;
    window.__samples = 0;
    const samples = new Float32Array(2048);
    setInterval(() => {
      window.__tap.getFloatTimeDomainData(samples);
      for (const sample of samples) {
        window.__peak = Math.max(window.__peak, Math.abs(sample));
        window.__energy += sample * sample;
        window.__samples += 1;
      }
    }, 20);
  });
  expect(await page.evaluate(() => window.__game.sound.loops.has('music'))).toBe(true);

  // One big move after another sets off everything at once: moves, hits, voices and music.
  await footage(page, 'strikes', { from: 1 });
  await doWhatIsAsked(page);
  await expect.poll(async () => (await fightState(page)).stats.damage, { timeout: 30_000 }).toBeGreaterThan(40);
  await stopDoingIt(page);
  expect(await page.evaluate(() => window.__voicesCutOff)).toBe(0);
  const { peak, rms } = await page.evaluate(() => ({ peak: window.__peak, rms: Math.sqrt(window.__energy / window.__samples) }));
  console.log('fight mix', { peak, rms });
  expect(peak).toBeGreaterThan(0.1);
  expect(peak).toBeLessThanOrEqual(1);
  expect(rms).toBeGreaterThan(0.01);

  const ducked = await page.evaluate(() => {
    const { sound } = window.__game;
    sound.stopVoice();
    sound.say('Fight!');
    return new Promise((resolve) => setTimeout(() => resolve(sound.backgroundBus.gain.value), 200));
  });
  expect(ducked).toBeLessThan(0.6);
});

test('the music stops at the end of a fight', async ({ page }) => {
  test.setTimeout(240_000);
  await reachFight(page, { voice: false, sound: true, rounds: 1 });
  await doWhatIsAsked(page);
  await waitForScreen(page, 'finish');
  await stopDoingIt(page);
  expect(await page.evaluate(() => window.__game.sound.loops.has('music'))).toBe(false);
});

test('the panel silences everything, and closing it brings it back', async ({ page }) => {
  await reachFight(page, { voice: false, sound: true });
  await page.locator('#open-panel').click();
  await expect.poll(() => page.evaluate(() => window.__game.sound.master.gain.value), { timeout: 3000 }).toBeLessThan(0.02);
  await page.locator('#close-panel').click();
  await expect.poll(() => page.evaluate(() => window.__game.sound.master.gain.value), { timeout: 3000 }).toBeGreaterThan(0.8);
});

test('choosing a fighter speaks in that fighter\'s voice', async ({ page }) => {
  await openMoves(page, { voice: true, sound: true });
  await toChoosing(page);
  await page.evaluate(() => window.__game.sound.ready);
  await page.evaluate(() => {
    const { sound } = window.__game;
    const said = [];
    const real = sound.say.bind(sound);
    sound.say = (text, options) => {
      said.push(text);
      return real(text, options);
    };
    window.__said = said;
  });
  await page.locator('.fighter-card[data-fighter="kit"]').click();
  await page.locator('.fighter-card[data-fighter="truffle"]').click();
  expect(await page.evaluate(() => window.__said)).toEqual(['Quick as a shadow!', 'Oink oink! Here I come!']);
  await shot(page, 'm2-choose-after-voice');
});

test('Georgian: the coach and the big words change language', async ({ page }) => {
  await reachFight(page, { language: 'ka' });
  await expect(page.locator('#coach-text')).toHaveText('დაუკარი ტაში!', { timeout: 15_000 });
  await shot(page, 'm20-georgian');
  await footage(page, 'claps', { from: 2.2 });
  await expect(page.locator('.callout.is-seen').first()).toContainText('ტაში დაუკარი!', { timeout: 15_000 });
  await expect(page.locator('.callout.is-big').first()).toHaveText(/ჭექა-ქუხილი/);
  await expect(page.locator('#coach-text')).toHaveText('ჩაცუცქდი!', { timeout: 10_000 });
});
