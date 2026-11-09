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

/** A card's film: how far it's got, whether it's paused, and how fast it plays. */
const filmOf = (card) => card.locator('.game-film').evaluate((film) => ({ time: film.currentTime, paused: film.paused, rate: film.playbackRate }));

test('every game\'s card plays a film of it while it\'s on the screen, and pointing at it says what the game is about', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await expect(page.locator('.game-moves')).toHaveCount(0);
  for (const { name, folder } of GAMES) {
    await test.step(name, async () => {
      const card = page.locator('.game-card', { hasText: name });
      await card.scrollIntoViewIfNeeded();
      // Without being pointed at.
      await page.mouse.move(2, 2);
      await expect.poll(async () => (await filmOf(card)).time, { timeout: 10_000 }).toBeGreaterThan(0.3);
      await expect(card).toHaveClass(/is-playing/);
      expect(await card.locator('.game-film').getAttribute('src')).toBe(`demos/${folder}.webm`);
      // Just its film and its name, until it's pointed at.
      const about = card.locator('.game-art .game-about');
      await expect(about).toHaveCount(1);
      await expect(about).toHaveCSS('opacity', '0');
      await card.hover();
      await expect(about).toHaveCSS('opacity', '1');
      await shot(page, `h6-film-${folder}`);
    });
  }
});

test('a film off the screen is paused, and one that gets to its end goes round again', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('.game-card').first();
  const last = page.locator('.game-card').last();
  await expect.poll(async () => (await filmOf(first)).time, { timeout: 10_000 }).toBeGreaterThan(0.3);
  await last.scrollIntoViewIfNeeded();
  await expect.poll(async () => (await filmOf(first)).paused, { timeout: 5000 }).toBe(true);
  await expect.poll(async () => (await filmOf(last)).time, { timeout: 10_000 }).toBeGreaterThan(0.3);
  await last.locator('.game-film').evaluate((film) => new Promise((done) => film.addEventListener('ended', done, { once: true })));
  await expect.poll(async () => (await filmOf(last)).time, { timeout: 5000 }).toBeLessThan(3);
  await expect.poll(async () => (await filmOf(last)).time, { timeout: 5000 }).toBeGreaterThan(0.2);
  expect((await filmOf(last)).paused).toBe(false);
});

test('with reduced motion, a film only plays, a little slower, while its card is pointed at or chosen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const card = page.locator('.game-card').first();
  await page.waitForTimeout(1500);
  expect((await filmOf(card)).time).toBe(0);
  await card.hover();
  await expect.poll(async () => (await filmOf(card)).time, { timeout: 10_000 }).toBeGreaterThan(0.2);
  expect((await filmOf(card)).rate).toBe(0.7);
  await page.mouse.move(2, 2);
  await expect.poll(async () => (await filmOf(card)).paused, { timeout: 5000 }).toBe(true);
  await page.locator('.game-card').nth(1).focus();
  await expect.poll(async () => (await filmOf(page.locator('.game-card').nth(1))).time, { timeout: 10_000 }).toBeGreaterThan(0.2);
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
