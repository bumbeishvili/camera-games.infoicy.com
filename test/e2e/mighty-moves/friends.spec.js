// Fighting a friend: two children, each on their own computer with their own camera, fight each other. Each
// child's moves are watched by their own computer, and their fighter's moves land on the friend's fighter, on
// both screens. Here they're two separate browsers, talking through the race server on this computer
// (tools/race-server.mjs).
import { expect, openGame, test, waitForScreen } from '../helpers.js';
import { doWhatIsAsked, standInView, stopDoingIt } from './helpers.js';

const GAME = 'mighty-moves';

/** Another player, in a browser of their own, with the same checks for errors. */
async function secondPlayer(browser) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`logged: ${message.text()}`);
  });
  return { context, page, errors };
}

async function openFight(page, settings = {}, hash = '') {
  await openGame(page, settings, GAME, hash);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
  await standInView(page);
}

/** A grown-up makes a fight, and gets its code. */
async function makeFight(page, name) {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-name').fill(name);
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{6}$/);
  return page.locator('#friends-code-shown').textContent();
}

/** Chooses a fighter, and presses Fight!, to wait for the other. */
async function getReady(page) {
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#fight-start').click();
}

const fightOf = (page) => page.evaluate(() => {
  const { fight, game } = window.__game;
  if (!fight) return null;
  return {
    state: fight.state,
    friend: fight.friend,
    rounds: fight.totalRounds,
    level: fight.levelNumber,
    player: { hp: fight.player.hp, won: fight.player.roundsWon },
    npc: { hp: fight.npc.hp, won: fight.npc.roundsWon },
    rival: game.rival?.spec.name ?? null,
    ownLevel: game.levels.current,
  };
});

/** Does whatever the coach asks, once, as a tracked body would. */
const doItOnce = (page) => page.evaluate(() => {
  const { coach, game, fight } = window.__game;
  fight.noteActivity(0);
  game.onMoves([{ move: coach.call.exercise.reads[0], side: coach.call.side, hand: 'open' }]);
});

const asking = (page) => page.evaluate(() => window.__game.screen === 'fight' && window.__game.coach?.phase === 'asking');

test('two friends fight from their own computers, each one\'s moves landing on the other\'s fighter, on both screens', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openFight(page, { rounds: 1, levels: { 'mighty-moves': 3 } });
  const code = await makeFight(page, 'Ana');
  expect(page.url()).toContain(`#fight=${code}`);

  // The friend opens the link, with settings of their own, and fights as someone else.
  const ben = await secondPlayer(browser);
  await openFight(ben.page, { rounds: 3, fighter: 'mochi' }, `#fight=${code}`);
  await ben.page.locator('#friends-name').fill('Ben');
  await ben.page.locator('#friends-name').dispatchEvent('change');
  await expect(page.locator('#friends-here')).toContainText('Ben');

  // Each sees the other as their opponent, which can't be changed.
  await ben.page.locator('#start').click();
  await waitForScreen(ben.page, 'choose');
  await expect(ben.page.locator('#opponent-name')).toHaveText('Ana');
  await expect(ben.page.locator('#opponent-change')).toHaveText('Your friend');
  await expect(ben.page.locator('#next-opponent')).toBeDisabled();
  await ben.page.screenshot({ path: 'test-results/screens/fight-friends-choose.png' });
  await ben.page.locator('#fight-start').click();
  await getReady(page);
  await expect(page.locator('#opponent-name')).toHaveText('Ben');

  // Both through the body check, they start together, on Ana's level and number of rounds.
  await waitForScreen(page, 'fight');
  await waitForScreen(ben.page, 'fight');
  const [ana, his] = [await fightOf(page), await fightOf(ben.page)];
  expect([ana.friend, his.friend]).toEqual([true, true]);
  expect([ana.rounds, his.rounds]).toEqual([1, 1]);
  expect([ana.level, his.level]).toEqual([3, 3]);
  expect([ana.rival, his.rival]).toEqual(['Ben', 'Ana']);
  await expect(page.locator('#npc-name')).toHaveText('Ben');
  await expect(ben.page.locator('#npc-name')).toHaveText('Ana');

  // Ana does what her coach asks: her fighter's move lands on Ben's, the same on both screens.
  await expect.poll(() => asking(page), { timeout: 15_000 }).toBe(true);
  await doItOnce(page);
  await expect.poll(async () => (await fightOf(page)).npc.hp, { timeout: 5000 }).toBeLessThan(100);
  const dealt = (await fightOf(page)).npc.hp;
  await expect.poll(async () => (await fightOf(ben.page)).player.hp, { timeout: 5000 }).toBe(dealt);
  await expect(ben.page.locator('.callout.is-friend').first()).toBeVisible();
  await ben.page.screenshot({ path: 'test-results/screens/fight-friends-hit.png' });
  // Ben's coach carries on asking him for his own move, as Ana's fighter's moves don't stop it.
  expect(await asking(ben.page)).toBe(true);

  // And Ben's lands on Ana's.
  await doItOnce(ben.page);
  await expect.poll(async () => (await fightOf(ben.page)).npc.hp, { timeout: 5000 }).toBeLessThan(100);
  const back = (await fightOf(ben.page)).npc.hp;
  await expect.poll(async () => (await fightOf(page)).player.hp, { timeout: 5000 }).toBe(back);

  // Ana keeps going until Ben's fighter is out: the round, and the fight, are hers on both screens.
  await doWhatIsAsked(page);
  await waitForScreen(page, 'finish');
  await stopDoingIt(page);
  await waitForScreen(ben.page, 'finish');
  const [won, lost] = [await fightOf(page), await fightOf(ben.page)];
  expect([won.player.won, won.npc.won]).toEqual([1, 0]);
  expect([lost.player.won, lost.npc.won]).toEqual([0, 1]);
  await expect(page.locator('#finish-title')).toHaveText('You win!');
  await expect(ben.page.locator('#finish-title')).toHaveText('So close! What a fight!');
  await expect(page.locator('.friends-results li').nth(0)).toContainText('1st You won 1 round');
  await expect(page.locator('.friends-results li').nth(1)).toContainText('2nd Ben won 0 rounds');
  await expect(ben.page.locator('.friends-results li').nth(0)).toContainText('1st Ana won 1 round');
  await page.screenshot({ path: 'test-results/screens/fight-friends-finish.png' });

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect(won.ownLevel).toBe(3);
  expect(lost.ownLevel).toBe(1);
  expect(await ben.page.evaluate(() => window.__game.game.settings.rounds)).toBe(3);
  expect(sockets).toEqual([`ws://localhost:${Number(new URL(test.info().project.use.baseURL).port) + 1}/room/mighty-moves/${code}`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a fight holds two, and a friend who goes in the middle leaves the fight to the one still there', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await openFight(page, { rounds: 3 });
  const code = await makeFight(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openFight(ben.page, {}, `#fight=${code}`);
  await expect(page.locator('#friends-here li')).toHaveCount(2);

  // A third is told the fight is full, and can still fight the computer.
  const cat = await secondPlayer(browser);
  await openFight(cat.page, {}, `#fight=${code}`);
  await expect(cat.page.locator('#friends-status')).toHaveText('That fight already has 2 fighters.');
  await expect(cat.page.locator('#friends-out')).toBeVisible();
  expect(cat.errors).toEqual([]);
  await cat.context.close();

  await getReady(page);
  await getReady(ben.page);
  await waitForScreen(page, 'fight');
  await waitForScreen(ben.page, 'fight');

  // Ben goes. A moment later, Ana's fight is over, and it's hers.
  await ben.context.close();
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('You win!');
  await expect(page.locator('#finish-line')).toContainText('Your friend had to go.');
  await expect(page.locator('.friends-results li')).toHaveCount(1);
  await expect(page.locator('.friends-results li').nth(0)).toContainText('1st You');
});

test('on their own, a fight is against the computer, and nothing connects anywhere', async ({ page }) => {
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openFight(page);
  await getReady(page);
  await waitForScreen(page, 'fight');
  const fight = await fightOf(page);
  expect(fight.friend).toBe(false);
  expect(fight.rival).toBe(null);
  await expect(page.locator('#friends-results li')).toHaveCount(0);
  expect(sockets).toEqual([]);
});
