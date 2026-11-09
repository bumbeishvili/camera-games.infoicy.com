// The page for choosing a game, and getting back to it.
import { expect, openGame, shot, test } from './helpers.js';

const GAMES = [
  { name: 'High Five Racers', folder: 'high-five-racers', start: 'Let’s race!' },
  { name: 'Balloon Pop', folder: 'balloon-pop', start: 'Let’s pop!' },
  { name: 'Mighty Moves', folder: 'mighty-moves', start: 'Choose your fighter' },
  { name: 'Leap Trail', folder: 'leap-trail', start: 'Choose your runner' },
  { name: 'Sky Wings', folder: 'sky-wings', start: 'Choose your pilot' },
  { name: 'Robot Rescue', folder: 'robot-rescue', start: 'Ride to the rescue' },
  { name: 'Tank Patrol', folder: 'tank-patrol', start: 'Climb aboard' },
  { name: 'Cannon Bay', folder: 'cannon-bay', start: 'Set sail!' },
  { name: 'Giraffe’s Long Walk Home', folder: 'giraffe-walk', start: 'Help Giraffe' },
  { name: 'Spider Catcher', folder: 'spider-catcher', start: 'Catch the spiders' },
  { name: 'Giraffe’s Smoothie Stand', folder: 'smoothie-stand', start: 'Open the stand' },
  { name: 'The Lighthouse Keeper', folder: 'lighthouse', start: 'Climb the lighthouse' },
  { name: 'Bounce Back', folder: 'bounce-back', start: 'Let’s play!' },
];

test('the hub offers every game, and each one opens and comes back', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Choose a game');
  await expect(page.locator('.game-card')).toHaveCount(GAMES.length);
  await page.waitForTimeout(200);
  await shot(page, 'h1-hub');

  for (const { name, folder, start } of GAMES) {
    await test.step(name, async () => {
      await page.locator('.game-card', { hasText: name }).click();
      await expect(page).toHaveURL(new RegExp(`/games/${folder}/`));
      await expect(page.locator('#start')).toHaveText(start);
      await expect(page.locator('h1')).toHaveText(name);
      await shot(page, `h2-${folder}-title`);

      await page.locator('#screen-welcome .all-games').click();
      await expect(page.locator('h1')).toHaveText('Choose a game');
    });
  }
});

for (const { name, folder } of GAMES) {
  test(`${name}'s settings have a way back to all the games`, async ({ page }) => {
    await openGame(page, {}, folder);
    await page.locator('#open-panel').click();
    const back = page.locator('#panel #panel-all-games');
    await expect(back).toBeVisible();
    await expect(back).toHaveText('All games');
    await shot(page, `h4-${folder}-panel`);
    await back.click();
    await expect(page.locator('h1')).toHaveText('Choose a game');
  });
}

for (const { folder } of GAMES.slice(0, 2)) {
  test(`${folder} shows a film of a hand opening during the hand check`, async ({ page }) => {
    await openGame(page, {}, folder);
    await page.evaluate(() => window.__camera.show({ left: null, right: 'fist' }));
    await page.locator('#start').click();
    await expect.poll(() => page.evaluate(() => window.__game.screen), { timeout: 60_000 }).toBe('check');
    await expect(page.locator('.hand-demo')).toBeVisible();
    expect(await page.locator('.hand-demo-finger').first().evaluate((node) => getComputedStyle(node).animationName)).toBe('hand-opens');
    await page.waitForTimeout(900);
    await shot(page, `h5-${folder}-check`);
  });
}

const filmTime = (page) => page.evaluate(() => document.getElementById('game-demo-film').currentTime);

test('resting the pointer on a game plays a film of it, and says what moves it takes', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  const panel = page.locator('#game-demo');
  await expect(panel).toBeHidden();
  for (const { name, folder } of GAMES) {
    await test.step(name, async () => {
      const card = page.locator('.game-card', { hasText: name });
      await card.scrollIntoViewIfNeeded();
      await card.hover();
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute('data-game', folder);
      await expect(page.locator('#game-demo-moves')).toHaveText(await card.getAttribute('data-moves'));
      await expect.poll(() => filmTime(page), { timeout: 10_000 }).toBeGreaterThan(0.3);
      const box = await panel.boundingBox();
      const { width, height } = page.viewportSize();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      await shot(page, `h6-film-${folder}`);
      await page.mouse.move(2, 2);
      await expect(panel).toBeHidden();
      expect(await page.evaluate(() => document.getElementById('game-demo-film').paused)).toBe(true);
    });
  }
});

test('a game\'s film goes round again when it gets to the end', async ({ page }) => {
  await page.goto('/');
  await page.locator('.game-card', { hasText: 'Balloon Pop' }).hover();
  await expect.poll(() => filmTime(page), { timeout: 10_000 }).toBeGreaterThan(0.3);
  await page.evaluate(() => new Promise((done) => {
    document.getElementById('game-demo-film').addEventListener('ended', done, { once: true });
  }));
  await expect.poll(() => filmTime(page), { timeout: 5000 }).toBeLessThan(3);
  await expect.poll(() => filmTime(page), { timeout: 5000 }).toBeGreaterThan(0.2);
  expect(await page.evaluate(() => document.getElementById('game-demo-film').paused)).toBe(false);
});

test('a pointer passing over the games doesn\'t set off their films, and the keyboard can show them too', async ({ page }) => {
  await page.goto('/');
  const panel = page.locator('#game-demo');
  await page.locator('.game-card').first().hover();
  await page.locator('.game-card').nth(1).hover();
  await page.mouse.move(2, 2);
  await page.waitForTimeout(350);
  await expect(panel).toBeHidden();

  await page.locator('.game-card').first().focus();
  await expect(panel).toBeVisible();
  await page.locator('.game-card').first().blur();
  await expect(panel).toBeHidden();
});

test('the hub fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await shot(page, 'h3-hub-phone');
  await page.locator('.game-card').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.game-card').last()).toBeInViewport();
});

test('settings carry from one game to the other, but each game keeps its own', async ({ page }) => {
  await openGame(page, { hands: 'left', language: 'ka' });
  await page.locator('#open-panel').click();
  await page.locator('input[name="laps"][value="4"]').check();
  await page.locator('#close-panel').click();

  await page.goto('/games/balloon-pop/index.html?debug');
  await expect(page.locator('#start')).toBeVisible();
  const shared = await page.evaluate(() => {
    const { settings } = window.__game.session;
    return { hands: settings.hands, language: settings.language, balloons: settings.balloons };
  });
  expect(shared).toEqual({ hands: 'left', language: 'ka', balloons: 20 });
  await page.locator('#open-panel').click();
  await page.locator('input[name="balloons"][value="60"]').check();
  await page.locator('#close-panel').click();

  await page.goto('/games/high-five-racers/index.html?debug');
  await expect(page.locator('#start')).toBeVisible();
  expect(await page.evaluate(() => window.__game.session.settings.laps)).toBe(4);
});

test('the hub makes no requests off this computer', async ({ page, baseURL }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await page.waitForTimeout(300);
  const offsite = requests.filter((url) => !url.startsWith(baseURL) && !url.startsWith('data:'));
  expect(offsite).toEqual([]);
});
