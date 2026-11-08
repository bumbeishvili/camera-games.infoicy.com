// The Lighthouse Keeper at level 10, with real photos going through the real tracker: mud thrown back
// on, seaweed and starfish to rub off, and still every ship home, with nothing flashing.
import { expect, shot, test, waitForScreen } from '../helpers.js';
import { atLevel, judgeBrightness, moveGloveTo, startPlaying, stopMoving, storyIs, watchBrightness } from './helpers.js';

const GAME = 'lighthouse';
const GLOVE = ['room', 'gloves', 'right'];
const storm = (page) => page.evaluate(() => {
  const { storm: rules, room } = window.__game;
  return {
    index: rules.index,
    home: rules.home,
    share: rules.mud?.share ?? 0,
    clean: rules.clean,
    stats: { ...rules.stats },
    lumps: rules.lumps.map(({ kind, x, y, rubbed, needs }) => ({ kind, x, y, rubbed, needs })),
    drawn: room.lumps.length,
    falling: room.falling.length,
  };
});

/**
 * Wipes the window row by row, through the room as a hand does, so the mud on the screen goes too.
 * The hand counts as still each time it touches: it wipes mud, but rubs nothing off.
 */
const wipeMud = (page) => page.evaluate(() => {
  const { storm: rules, room } = window.__game;
  const { window: glass } = room;
  const stillWipe = (x, y, sizeX, sizeY) => rules.wipe(x, y, sizeX, sizeY, 0);
  for (let pass = 0; pass < 3 && room.mud; pass += 1) {
    for (let y = 0.04; y <= 1; y += 0.12) {
      room.last = null;
      for (let x = 0; x <= 1 && room.mud; x += 0.04) room.wipeAt({ x: glass.x + x * glass.width, y: glass.y + y * glass.height }, stillWipe);
    }
  }
  room.last = null;
});

/** Wipes and rubs every window clean, a little at a time, as long as it's running. */
const keepWiping = (page) => page.evaluate(() => {
  let x = 0;
  let y = 0.05;
  window.__wiping = setInterval(() => {
    const { storm: rules } = window.__game;
    for (let i = 0; i < 6; i += 1) {
      rules.wipe(x, y, 0.08, 0.1, 0.4);
      x += 0.04;
      if (x > 1) {
        x = 0;
        y = y > 0.95 ? 0.05 : y + 0.08;
      }
    }
  }, 50);
});
const stopWiping = (page) => page.evaluate(() => clearInterval(window.__wiping));

test('level 10: mud lands back on wiped glass, and a real open hand has to rub the seaweed off', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10, { reach: 'none' }));
  expect(await page.evaluate(() => window.__game.session.level)).toBe(10);
  await storyIs(page, 'frost');
  await expect(page.locator('#level-now')).toBeHidden();
  await wipeMud(page);
  const wiped = await storm(page);
  expect(wiped.stats.splats).toBe(2);
  expect(wiped.lumps.map(({ kind }) => kind)).toEqual(['weed']);
  expect(wiped.drawn).toBe(1);
  // Clean enough, but not clean while the seaweed is on it.
  expect(wiped.share).toBeGreaterThanOrEqual(0.88);
  expect(wiped.clean).toBe(false);
  await page.waitForTimeout(1200);
  await shot(page, 'l10-seaweed');

  // The real hand, open, going back and forth over it.
  const target = await page.evaluate(() => {
    const { storm: rules, room } = window.__game;
    const [lump] = rules.lumps;
    const { window: glass, width, height } = room;
    return { x: (glass.x + lump.x * glass.width) / width, y: (glass.y + lump.y * glass.height) / height };
  });
  for (let i = 0; i < 8 && !(await storm(page)).clean; i += 1) {
    await moveGloveTo(page, GLOVE, target.x + (i % 2 ? 0.12 : -0.12), target.y);
    await page.waitForTimeout(1300);
    if (i === 0) await shot(page, 'l10-rubbing');
  }
  await stopMoving(page);
  await expect.poll(async () => (await storm(page)).clean, { timeout: 15_000 }).toBe(true);
  await expect(page.locator('#story-line')).toContainText('Safe');
  expect((await storm(page)).stats.lumps).toBe(1);
});

test('level 10: the second window has a starfish, which creeps, and every ship still comes home', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'frost');
  await keepWiping(page);
  await expect.poll(async () => (await storm(page)).home, { timeout: 30_000 }).toBe(1);
  await stopWiping(page);
  await storyIs(page, 'kit');
  await wipeMud(page);
  const before = await storm(page);
  expect(before.lumps.map(({ kind }) => kind)).toEqual(['star']);
  await page.waitForTimeout(2500);
  await shot(page, 'l10-starfish');
  const after = await storm(page);
  expect(Math.hypot(after.lumps[0].x - before.lumps[0].x, after.lumps[0].y - before.lumps[0].y)).toBeGreaterThan(0.02);

  await keepWiping(page);
  await expect.poll(async () => (await storm(page)).falling, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(250);
  await shot(page, 'l10-starfish-off');
  await waitForScreen(page, 'finish');
  await stopWiping(page);
  await expect(page.locator('#screen-finish')).toContainText('You saved every ship!');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  const done = await storm(page);
  expect(done.home).toBe(4);
  expect(done.stats.splats).toBe(8);
  expect(done.stats.lumps).toBe(4);
});

for (const level of [1, 10]) {
  test(`nothing flashes at level ${level}: splats, seaweed, starfish, the beam and the ships sailing home`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPlaying(page, GAME, atLevel(GAME, level, { ships: 2 }));
    await storyIs(page, 'frost');
    await keepWiping(page);
    const result = judgeBrightness(await watchBrightness(page, 360));
    const { stats, home } = await storm(page);
    await stopWiping(page);
    console.log(`level ${level}`, JSON.stringify(result), JSON.stringify(stats), home);
    // It really was going on: a ship came home in that time, and at level 10, the storm threw things.
    expect(home).toBeGreaterThanOrEqual(1);
    if (level === 10) expect(stats.splats + stats.lumps).toBeGreaterThanOrEqual(3);
    expect(result.biggestStep).toBeLessThan(4);
    expect(result.flickeringShare).toBeLessThan(0.02);
  });
}

test('level 10 with reduced motion: the starfish keeps still, and there are no drips', async ({ page }) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'frost');
  const still = await page.evaluate(async () => {
    const { storm: rules, room } = window.__game;
    rules.addLump('star');
    rules.splat();
    const [star] = rules.lumps;
    const from = { x: star.x, y: star.y };
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return { moved: Math.hypot(star.x - from.x, star.y - from.y), drops: room.drops.length, reduced: room.reducedMotion };
  });
  expect(still).toEqual({ moved: 0, drops: 0, reduced: true });
});
