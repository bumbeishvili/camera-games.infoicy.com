// The other cars: who's driving them, bumps that are only ever friendly, overtaking, and waiting for a
// child who's resting.
import {
  car,
  expect,
  openGame,
  reachRace,
  shot,
  show,
  test,
  waitForHand,
  waitUntilMoving,
  waitUntilStopped,
} from '../helpers.js';

async function raceWithOpenHand(page, settings = {}) {
  await openGame(page, settings);
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
}

test('Joze drives the child\'s car, with three other characters in the others', async ({ page }) => {
  await openGame(page);
  const cast = await page.evaluate(() => {
    const { race } = window.__game;
    return { you: race.player.spec.id, others: race.rivals.map((rival) => rival.spec.id) };
  });
  expect(cast).toEqual({ you: 'joze', others: ['truffle', 'kit', 'mochi'] });
});

test('whoever was chosen in the other games drives here too, and can be changed under the gear', async ({ page }) => {
  await openGame(page, { fighter: 'kit' });
  const cast = () => page.evaluate(() => {
    const { race } = window.__game;
    return { you: race.player.spec.id, others: race.rivals.map((rival) => rival.spec.id) };
  });
  expect(await cast()).toEqual({ you: 'kit', others: ['joze', 'truffle', 'mochi'] });

  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="fighter"][value="kit"]')).toBeChecked();
  await page.locator('input[name="fighter"][value="tur"]').check();
  await page.locator('#close-panel').click();
  expect(await cast()).toEqual({ you: 'tur', others: ['joze', 'truffle', 'kit'] });
  await expect(page.locator('.order-row.is-you')).toHaveAttribute('data-who', 'tur');
});

test('the order of the race shows everyone\'s face, and the child\'s car stands out', async ({ page }) => {
  await raceWithOpenHand(page);
  await expect(page.locator('.order-row')).toHaveCount(4);
  await expect(page.locator('.order-row.is-you')).toHaveAttribute('data-who', 'joze');
  const allHavePictures = await page.locator('.order-row img').evaluateAll((pictures) => pictures.every((picture) => picture.naturalWidth > 0));
  expect(allHavePictures).toBe(true);
});

test('bumping another car makes a few sparks and shoves it aside, and nobody loses anything', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  const result = await page.evaluate(async () => {
    const { race } = window.__game;
    let bumps = 0;
    let sparks = 0;
    const onBump = race.events.onBump;
    race.events.onBump = () => {
      bumps += 1;
      sparks = race.particles.items.filter((item) => item.life > 0).length;
      onBump?.();
    };
    const rival = race.rivals[0];
    rival.distance = race.distance + 9;
    rival.lateral = race.lateral;
    rival.speed = 8;
    const speedBefore = race.speed;
    const end = performance.now() + 5000;
    while (bumps === 0 && performance.now() < end) {
      rival.lateral = race.lateral;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return { bumps, sparks, speedBefore, speedAfter: race.speed, apart: Math.abs(rival.lateral - race.lateral) };
  });
  expect(result.bumps).toBeGreaterThan(0);
  expect(result.sparks).toBeGreaterThan(3);
  expect(result.speedAfter).toBeGreaterThan(result.speedBefore * 0.85);
  await shot(page, 'r-bump');
  // Moments later they've moved apart, and the car hasn't gone through the other one.
  await expect.poll(() => page.evaluate(() => {
    const { race } = window.__game;
    return Math.abs(race.rivals[0].lateral - race.lateral);
  }), { timeout: 4000 }).toBeGreaterThan(1.5);
  expect((await car(page)).speed).toBeGreaterThan(12);
});

test('overtaking is plain to see: who was passed, a wave, and the order changes', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  await page.evaluate(() => {
    const { race } = window.__game;
    race.rivals.forEach((rival, index) => {
      rival.distance = race.distance + 200 + index * 30;
      rival.lateral = -4;
    });
    const rival = race.rivals[0];
    rival.distance = race.distance + 22;
    rival.lateral = -4.5;
    rival.speed = 5;
  });
  await expect.poll(() => page.evaluate(() => window.__game.race.rivals[0].wasAhead), { timeout: 15_000 }).toBe(true);
  await expect(page.locator('#toast')).toHaveText('You passed Truffle!', { timeout: 15_000 });
  await expect(page.locator('#toast')).toHaveClass(/is-showing/);
  await shot(page, 'r-overtake');
  const waving = await page.evaluate(() => window.__game.race.rivals[0].car.wave);
  expect(waving).toBeGreaterThan(0);
});

test('resting costs no places: everyone waits, and the cars behind stay behind', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  await page.evaluate(() => {
    const { race } = window.__game;
    race.rivals[0].distance = race.distance - 60;
    race.rivals[1].distance = race.distance - 30;
    race.rivals[2].distance = race.distance + 25;
  });
  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await waitUntilStopped(page);
  const place = (await car(page)).place;
  expect(place).toBe(2);
  await page.waitForTimeout(6000);
  await shot(page, 'r-resting');
  const waiting = await page.evaluate(() => {
    const { race } = window.__game;
    return {
      place: race.place,
      gaps: race.rivals.map((rival) => rival.distance - race.distance),
      speeds: race.rivals.map((rival) => rival.speed),
    };
  });
  expect(waiting.place).toBe(place);
  expect(waiting.gaps[0]).toBeLessThan(0);
  expect(waiting.gaps[1]).toBeLessThan(0);
  expect(waiting.gaps[2]).toBeGreaterThan(0);
  expect(waiting.gaps[2]).toBeLessThan(60);
  for (const speed of waiting.speeds) expect(speed).toBeLessThan(2);

  // Opening again carries on, as if nothing had happened.
  await show(page, null, 'open');
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
});
