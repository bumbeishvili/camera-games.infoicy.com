// Arrow Meadow on the page for choosing a game: its card, what finds it in the search, and which filters it's under.
// The hub's own tests (test/e2e/hub.spec.js) check that every card opens its game, comes back and plays its film.
import { expect, shot, test } from '../helpers.js';

const NAME = 'Arrow Meadow';
const showing = (page) => page.locator('.game-card:not([hidden]) h2').allTextContents();
const filterNamed = (page, name) => page.locator('#hub-filters').getByLabel(name, { exact: true });

test('the search finds Arrow Meadow by what it is, and the filters by what it\'s played with', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.game-card[data-game="arrow-meadow"]');
  await expect(card.locator('h2')).toHaveText(NAME);
  await expect(card.locator('.game-friends')).toHaveCount(1);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(page, 'arrows-hub-card');

  const box = page.locator('#hub-search');
  // Its own words find it, and only it.
  for (const typed of ['archery', 'bow', 'arrows', 'ARROW meadow', 'bullseye']) {
    await box.fill(typed);
    await expect.poll(() => showing(page), { timeout: 5000 }).toEqual([NAME]);
  }
  // What it shares with other games finds them too.
  await box.fill('giraffe');
  await expect.poll(async () => (await showing(page)).length, { timeout: 5000 }).toBeGreaterThan(1);
  await box.fill('both hands');
  await expect.poll(() => showing(page), { timeout: 5000 }).toContain(NAME);
  await box.fill('');

  await page.locator('#hub-filters-toggle').click();
  for (const [name, found] of [['Sports', true], ['Stories and missions', true], ['Both hands', true], ['Sitting down', true], ['With friends', true], ['One hand', false], ['Whole body', false], ['Fighting', false]]) {
    await test.step(name, async () => {
      const filter = filterNamed(page, name);
      await filter.check();
      await expect.poll(async () => (await showing(page)).includes(NAME), { timeout: 5000 }).toBe(found);
      await filter.uncheck();
    });
  }
  // Both hands, with friends, sitting down: it's one of the few that are all three.
  for (const name of ['Both hands', 'With friends', 'Sitting down']) await filterNamed(page, name).check();
  await expect.poll(() => showing(page), { timeout: 5000 }).toContain(NAME);
  await page.locator('#hub-filters-done').click();
  await page.waitForTimeout(300);
  await shot(page, 'arrows-hub-filtered');
});

test('the card opens the game, and the game has a way back to all the games', async ({ page }) => {
  await page.goto('/');
  await page.locator('.game-card', { hasText: NAME }).click();
  await expect(page).toHaveURL(/\/games\/arrow-meadow\//);
  await expect(page.locator('h1')).toHaveText(NAME);
  await expect(page.locator('#start')).toHaveText('Pick up the bow');
  await expect(page.locator('#tagline')).toContainText('right hand');
  await page.locator('#screen-welcome .all-games').click();
  await expect(page.locator('h1')).toHaveText('Choose a game');
});
