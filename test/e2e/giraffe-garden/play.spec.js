// Playing Giraffe's Garden: the open hand holds the watering can, turning the hand over pours, and the plant under the
// water grows and flowers. With real photos of one right hand, its palm and its back, through the real tracker.
import { shot } from '../helpers.js';
import { BACK, expect, expectSoon, FIST, NO_HAND, PALM, show, startPlaying, state, stopHand, test, waitForScreen, waterHand } from './helpers.js';

test('the open palm holds the can, turning the hand over pours, the plant under it flowers, and every one in flower ends the garden', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { plants: 4 });
  const start = await state(page);
  // The hand check saw the palm, so that's where turning starts from.
  expect(start.start).toMatchObject({ sign: 1, checked: true });
  expect(start.plants).toHaveLength(4);
  expect(start.flowers).toBe(0);
  await expectSoon(async () => (await state(page)).holding, { timeout: 10_000 }).toBe(true);
  const held = await state(page);
  expect(held.flow).toBe(0);
  expect(held.degrees).toBeLessThan(20);
  await expect(page.locator('#story-line')).toHaveText('My garden is so thirsty! Can you water it?');
  await expect(page.locator('#chip-flowers')).toHaveText('0 of 4');
  await page.waitForTimeout(500);
  await shot(page, 'garden-start');

  // Turned right over, the back of the hand to the camera: the can tips, and the water pours.
  await show(page, ...BACK);
  await expectSoon(async () => (await state(page)).flow, { timeout: 10_000 }).toBe(1);
  await expectSoon(async () => (await state(page)).degrees, { timeout: 5000 }).toBeGreaterThan(150);
  await expectSoon(async () => (await state(page)).tip, { timeout: 5000 }).toBeGreaterThan(0.9);
  await page.waitForTimeout(400);
  await shot(page, 'garden-pouring');

  // Led to each plant in turn and turned over there, the garden flowers, and the finish card comes.
  await waterHand(page);
  await expectSoon(async () => (await state(page)).flowers, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(300);
  await shot(page, 'garden-first-flower');
  await waitForScreen(page, 'finish');
  await stopHand(page);
  const end = await state(page);
  expect(end.flowers).toBe(4);
  expect(end.pours).toBeGreaterThanOrEqual(4);
  await expect(page.locator('#screen-finish h2')).toHaveText('The garden is in bloom!');
  await expect(page.locator('#finish-hero')).toHaveText('4');
  await expect(page.locator('#sum-right-flowers')).toHaveText('4');
  await page.waitForTimeout(600);
  await shot(page, 'garden-finish');
});

for (const [name, scene] of [['closed', FIST], ['missing', NO_HAND]]) {
  test(`a ${name} hand never pours, and the can waits, for as long as it takes`, async ({ page }) => {
    await startPlaying(page, { plants: 4 });
    await show(page, ...scene);
    await page.waitForTimeout(3000);
    const resting = await state(page);
    expect(resting.flow).toBe(0);
    expect(resting.plants.every((plant) => plant.water === 0)).toBe(true);
    // Back again, palm and then turned over, and it pours.
    await show(page, ...PALM);
    await expectSoon(async () => (await state(page)).holding, { timeout: 10_000 }).toBe(true);
    await show(page, ...BACK);
    await expectSoon(async () => (await state(page)).flow, { timeout: 10_000 }).toBe(1);
  });
}
