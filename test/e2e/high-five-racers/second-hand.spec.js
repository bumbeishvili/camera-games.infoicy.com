// Once turbo has run out, a fist and then an open hand with the other hand sets turbo off again and the
// car flies. The hand in play still has to be open for the car to go. Real photos, real tracker.
import { car, expect, openGame, reachRace, shot, show, test, waitForHand } from '../helpers.js';

const state = (page) => page.evaluate(() => {
  const { race, monitor } = window.__game;
  return {
    other: monitor.snapshot.other.status,
    turboOn: race.turbo.active,
    level: race.turbo.level,
    flying: race.soaring,
    lift: race.lift,
    flames: race.player.flames.some((flame) => flame.visible),
  };
});

/** Driving with the right hand loosely open, so that turbo never starts by itself, and the left hand open. */
async function raceWithBothHands(page) {
  await openGame(page, { strictness: { right: 0.5 } });
  await show(page, null, 'open');
  await reachRace(page);
  await show(page, 'open', 'relaxed');
  await waitForHand(page, 'open');
  await expect.poll(async () => (await state(page)).other, { timeout: 15_000 }).toBe('open');
  await expect.poll(async () => (await car(page)).speed, { timeout: 15_000 }).toBeGreaterThan(12);
  expect((await state(page)).turboOn).toBe(false);
}

async function fistThenOpen(page) {
  await show(page, 'fist', 'relaxed');
  await expect.poll(async () => (await state(page)).other, { timeout: 15_000 }).toBe('closed');
  await show(page, 'open', 'relaxed');
}

test('a fist and then an open hand with the other hand sets turbo off, and the car flies', async ({ page }) => {
  await raceWithBothHands(page);
  await fistThenOpen(page);

  await expect.poll(async () => (await state(page)).flying, { timeout: 10_000, intervals: [50] }).toBe(true);
  await expect(page.locator('#toast')).toHaveText('Fly!', { timeout: 5000 });
  const up = await state(page);
  expect(up.turboOn).toBe(true);
  expect(up.flames).toBe(true);
  await expect.poll(async () => (await state(page)).lift, { timeout: 5000, intervals: [50] }).toBeGreaterThan(4);
  await shot(page, 'r-second-hand-flying');
  await expect.poll(async () => (await car(page)).speed, { timeout: 5000 }).toBeGreaterThan(22);

  // It lands, and the turbo runs down like a timer and then stops.
  await expect.poll(async () => (await state(page)).flying, { timeout: 10_000 }).toBe(false);
  await expect.poll(async () => (await state(page)).turboOn, { timeout: 10_000 }).toBe(false);
  expect((await state(page)).lift).toBeLessThan(0.5);

  // Turbo has run out, so it works again.
  await fistThenOpen(page);
  await expect.poll(async () => (await state(page)).flying, { timeout: 10_000, intervals: [50] }).toBe(true);
});

test('it does nothing while turbo is still going, or while the hand in play is closed', async ({ page }) => {
  await raceWithBothHands(page);

  // Turbo from the hand in play held wide.
  await show(page, 'open', 'open');
  await expect.poll(async () => (await state(page)).turboOn, { timeout: 10_000, intervals: [50] }).toBe(true);
  await show(page, 'fist', 'open');
  await expect.poll(async () => (await state(page)).other, { timeout: 15_000 }).toBe('closed');
  await show(page, 'open', 'open');
  await expect.poll(async () => (await state(page)).other, { timeout: 15_000 }).toBe('open');
  await page.waitForTimeout(800);
  expect((await state(page)).flying).toBe(false);

  // The car stopped, with the hand in play closed: no turbo and no flight.
  await show(page, 'open', 'fist');
  await waitForHand(page, 'closed');
  await expect.poll(async () => (await state(page)).turboOn, { timeout: 10_000 }).toBe(false);
  await show(page, 'fist', 'fist');
  await expect.poll(async () => (await state(page)).other, { timeout: 15_000 }).toBe('closed');
  await show(page, 'open', 'fist');
  await expect.poll(async () => (await state(page)).other, { timeout: 15_000 }).toBe('open');
  await page.waitForTimeout(800);
  const after = await state(page);
  expect(after.flying).toBe(false);
  expect(after.turboOn).toBe(false);
});
