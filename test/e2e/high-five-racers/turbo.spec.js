// Opening the hand as wide as it goes is turbo: a meter, flames and a wider view. Only that does it.
import {
  car,
  expect,
  hands,
  openGame,
  reachRace,
  shot,
  show,
  test,
  waitForHand,
  waitUntilStopped,
} from '../helpers.js';

const turbo = (page) => page.evaluate(() => {
  const { race } = window.__game;
  return {
    on: race.turbo.active,
    level: race.turbo.level,
    flames: race.player.flames.some((flame) => flame.visible),
    fov: race.camera.fov,
    state: document.getElementById('turbo').dataset.state,
  };
});

/** The hand check sees a wide open hand, so that is this hand's best. A lower line lets a looser one drive. */
async function raceWithRoomToOpen(page) {
  await openGame(page, { strictness: { right: 0.5 } });
  await show(page, null, 'open');
  await reachRace(page);
  await show(page, null, 'relaxed');
  await waitForHand(page, 'open');
  await expect.poll(async () => (await turbo(page)).level, { timeout: 8000 }).toBe(0);
}

test('a loosely open hand drives but isn\'t turbo, and opening it wide is', async ({ page }) => {
  await raceWithRoomToOpen(page);

  // Open enough to drive, for a while, without ever filling the meter.
  for (let i = 0; i < 12; i += 1) {
    const reading = await turbo(page);
    expect(reading.on).toBe(false);
    expect(reading.flames).toBe(false);
    expect(reading.level).toBe(0);
    await page.waitForTimeout(200);
  }
  const { speed } = await car(page);
  expect(speed).toBeGreaterThan(12);
  expect(speed).toBeLessThan(26);
  const loose = await turbo(page);
  await shot(page, 'r-turbo-loose');

  await show(page, null, 'open');
  await expect.poll(async () => (await turbo(page)).level, { timeout: 8000, intervals: [50] }).toBeGreaterThan(0.2);
  await expect.poll(async () => (await turbo(page)).on, { timeout: 8000, intervals: [50] }).toBe(true);
  await expect.poll(async () => (await car(page)).speed, { timeout: 8000 }).toBeGreaterThan(27);
  const wide = await turbo(page);
  expect(wide.flames).toBe(true);
  expect(wide.state).toBe('on');
  await expect.poll(async () => (await turbo(page)).fov, { timeout: 8000 }).toBeGreaterThan(loose.fov + 4);
  await shot(page, 'r-turbo-on');

  // Back to a looser hand: it's over, without any fuss.
  await show(page, null, 'relaxed');
  await expect.poll(async () => (await turbo(page)).on, { timeout: 8000 }).toBe(false);
  await expect.poll(async () => (await turbo(page)).flames, { timeout: 3000 }).toBe(false);
});

test('a hand that can\'t open far gets turbo too, at its own widest', async ({ page }) => {
  await openGame(page);
  await show(page, null, 'relaxed');
  await reachRace(page);
  const { right } = await hands(page);
  expect(right.best).toBeLessThan(0.9);
  await expect.poll(async () => (await turbo(page)).on, { timeout: 15_000 }).toBe(true);
});

for (const [name, pose] of [['a fist', 'fist'], ['pointing', 'pointing'], ['no hand', null]]) {
  test(`${name} ends turbo at once, and never fills the meter`, async ({ page }) => {
    await openGame(page);
    await show(page, null, 'open');
    await reachRace(page);
    await expect.poll(async () => (await turbo(page)).on, { timeout: 15_000 }).toBe(true);

    await show(page, null, pose);
    await expect.poll(async () => (await hands(page)).handOpen).toBe(false);
    // As soon as the hand no longer counts as open, turbo has stopped.
    const stopped = await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const { race } = window.__game;
        resolve({ on: race.turbo.active, wanted: race.drive });
      }));
    }));
    expect(stopped).toEqual({ on: false, wanted: 0 });
    await waitUntilStopped(page);
    const lowest = await turbo(page);
    expect(lowest.on).toBe(false);
    expect(lowest.flames).toBe(false);
    expect(lowest.level).toBe(0);
    expect(lowest.state).toBe('idle');
  });
}

test('closing the hand reads clearly: brake lights, the nose going down, slowing, and it\'s friendly', async ({ page }) => {
  await openGame(page);
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await expect.poll(async () => (await car(page)).speed, { timeout: 15_000 }).toBeGreaterThan(20);
  const lamps = () => page.evaluate(() => window.__game.race.player.braking);
  expect(await lamps()).toBeLessThan(0.05);

  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await expect.poll(lamps, { timeout: 3000 }).toBeGreaterThan(0.8);
  await shot(page, 'r-braking');
  await waitUntilStopped(page);
  await expect(page.locator('#prompt')).toHaveText(/Open your right hand!/);
  expect((await car(page)).place).toBeGreaterThan(0);

  await show(page, null, 'open');
  await waitForHand(page, 'open');
  await expect.poll(lamps, { timeout: 3000 }).toBeLessThan(0.2);
});

test('someone who hasn\'t found turbo is told about it once, and then left alone', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page, { strictness: { right: 0.5 }, voice: true, sound: true });
  await show(page, null, 'open');
  await reachRace(page);
  await show(page, null, 'relaxed');
  await waitForHand(page, 'open');
  // Well clear of the big hands, which have their own hint, so only this one can show.
  await page.evaluate(() => {
    const { race } = window.__game;
    race.fives = 5;
    race.turbo.everFull = false;
  });
  await expect(page.locator('#prompt')).toHaveText(/Open wide for turbo!/, { timeout: 25_000 });
  await expect(page.locator('#turbo')).toHaveClass(/is-hint/);
  await shot(page, 'r-turbo-hint');
  await expect(page.locator('#prompt')).not.toHaveText(/turbo/, { timeout: 10_000 });
  await expect(page.locator('#turbo')).not.toHaveClass(/is-hint/);
});
