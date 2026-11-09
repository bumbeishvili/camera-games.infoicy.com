// Choosing a fighter, and making sure the camera can see all of the child before a fight.
import { expect, screenName, shot, test, waitForScreen } from '../helpers.js';
import { footage, openMoves, standInView, toChoosing } from './helpers.js';

test('there are ten fighters to choose from, and the choice is remembered', async ({ page }) => {
  await openMoves(page);
  await shot(page, 'm1-welcome');
  await toChoosing(page);
  const cards = page.locator('.fighter-card');
  await expect(cards).toHaveCount(10);
  await expect(page.locator('.fighter-card[aria-checked="true"]')).toHaveCount(1);
  await expect(page.locator('#chosen-name')).toHaveText('Giraffe');
  await page.waitForTimeout(700);
  await shot(page, 'm2-choose');

  for (const name of await cards.allInnerTexts()) {
    await page.locator('.fighter-card', { hasText: name }).click();
    await expect(page.locator('#chosen-name')).toHaveText(name);
    expect(await page.evaluate(() => window.__game.arena.player.spec.name)).toBe(name);
    await page.waitForTimeout(350);
    await shot(page, `m2-fighter-${name.toLowerCase()}`);
  }

  await page.locator('.fighter-card[data-fighter="nova"]').click();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
  await toChoosing(page);
  await expect(page.locator('#chosen-name')).toHaveText('Nova');
});

test('every fighter has a real picture on its card', async ({ page }) => {
  await openMoves(page);
  await toChoosing(page);
  const sizes = await page.locator('.fighter-card img').evaluateAll((images) => images.map((image) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, 64, 64);
    const { data } = context.getImageData(0, 0, 64, 64);
    let drawn = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 200) drawn += 1;
    return drawn / (64 * 64);
  }));
  expect(sizes).toHaveLength(10);
  for (const share of sizes) expect(share).toBeGreaterThan(0.2);
  // Ten different pictures, not one picture ten times.
  const sources = await page.locator('.fighter-card img').evaluateAll((images) => images.map((image) => image.src));
  expect(new Set(sources).size).toBe(10);
});

test('the opponent is never your own fighter, and it can be changed', async ({ page }) => {
  await openMoves(page);
  await toChoosing(page);
  const opponents = new Set();
  for (let i = 0; i < 12; i += 1) {
    opponents.add(await page.locator('#opponent-name').textContent());
    await page.locator('#next-opponent').click();
  }
  expect(opponents.size).toBe(9);
  expect(opponents.has('Giraffe')).toBe(false);

  await page.locator('#opponent-name').textContent();
  const current = await page.locator('#opponent-name').textContent();
  await page.locator('.fighter-card', { hasText: current }).click();
  await expect(page.locator('#opponent-name')).not.toHaveText(current);
});

test('on their own, the opponent is the computer\'s fighter, and a friend can be fought from the title card', async ({ page }) => {
  await openMoves(page);
  await expect(page.locator('#friends-toggle')).toHaveText('Fight a friend');
  await toChoosing(page);
  await expect(page.locator('#next-opponent')).toBeEnabled();
  await expect(page.locator('#opponent-change')).toHaveText('Tap to change');
});

test('a fight won\'t start until the camera sees the whole body', async ({ page }) => {
  await openMoves(page);
  await page.evaluate(() => window.__camera.showNobody());
  await toChoosing(page);
  await page.locator('#fight-start').click();
  await waitForScreen(page, 'bodycheck');

  await expect(page.locator('#prompt')).toContainText('Stand where I can see all of you');
  await page.waitForTimeout(1500);
  expect(await screenName(page)).toBe('bodycheck');

  // Too close, so the feet are out of the picture.
  await footage(page, 'strikes', { from: 0.2, playing: false, height: 2.3 });
  await expect(page.locator('#prompt')).toContainText('Step back until I can see all of you');
  await page.waitForTimeout(600);
  await shot(page, 'm4-bodycheck-too-close');
  await page.waitForTimeout(1200);
  expect(await screenName(page)).toBe('bodycheck');

  await standInView(page);
  await page.waitForTimeout(300);
  await shot(page, 'm4-bodycheck');
  await waitForScreen(page, 'intro');
  await page.waitForTimeout(1300);
  await shot(page, 'm5-intro');
  await waitForScreen(page, 'fight');
});

test('Georgian: the words on this screen\'s prompts change with the voice', async ({ page }) => {
  await openMoves(page, { language: 'ka' });
  await page.evaluate(() => window.__camera.showNobody());
  await toChoosing(page);
  await page.locator('#fight-start').click();
  await waitForScreen(page, 'bodycheck');
  await expect(page.locator('#prompt')).toContainText('ისე დადექი, რომ მთლიანად დაგინახო');
});
