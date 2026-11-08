// Cannon Bay's levels, with real photos going through the real tracker. What a level changes is in
// levelPlan in battle.js, and its numbers are checked in test/unit/cannon-bay.test.js.
import { expect, screenName, shot, show, test, waitForScreen } from '../helpers.js';
import { battleState, sailTowardsPirates, startPlaying, stopSailing } from './helpers.js';

const atLevel = (level, settings = {}) => ({ levels: { 'cannon-bay': level }, ...settings });

test('level 10: four pirates at once, quick sloops, bigger broadsides and a flagship last, and it can still be finished', async ({ page }) => {
  test.setTimeout(480_000);
  await startPlaying(page, atLevel(10, { bayShips: 4, bayPace: 'fast' }));
  await expect(page.locator('#level-badge')).toHaveText('Level 10 of 10');
  const start = await page.evaluate(() => {
    const { battle } = window.__game;
    return { level: battle.levelNumber, afloat: battle.afloat.map(({ kind }) => kind) };
  });
  expect(start.level).toBe(10);
  expect(start.afloat).toEqual(['ship', 'sloop', 'ship', 'flagship']);
  await page.evaluate(() => {
    window.__most = 0;
    window.__weaving = false;
    window.__watch = setInterval(() => {
      const { battle } = window.__game;
      for (const pirate of battle.pirates) window.__most = Math.max(window.__most, pirate.burstLeft);
      if (battle.afloat.some((pirate) => pirate.mode === 'away' && Math.abs(battle.weaving(pirate)) > 0.5)) window.__weaving = true;
    }, 30);
  });
  await page.waitForTimeout(1500);
  await shot(page, 'cannon-bay-level10-start');
  // Seen from the side: the sloop smaller, and the flagship bigger.
  const sizes = await page.evaluate(() => {
    const { battle, bay } = window.__game;
    return battle.afloat.map((pirate) => [pirate.kind, bay.shipFor(pirate).root.scale.x]);
  });
  expect(sizes.find(([kind]) => kind === 'sloop')[1]).toBeLessThan(1);
  expect(sizes.find(([kind]) => kind === 'flagship')[1]).toBeGreaterThan(1);
  await sailTowardsPirates(page);
  let shownFour = false;
  await expect.poll(async () => {
    const marks = await page.locator('.mark[data-where="on"]').count();
    if (marks >= 3 && !shownFour) {
      shownFour = true;
      await shot(page, 'cannon-bay-level10-busy');
    }
    return screenName(page);
  }, { timeout: 420_000, intervals: [250] }).toBe('finish');
  await stopSailing(page);
  const seen = await page.evaluate(() => ({ most: window.__most, weaving: window.__weaving }));
  console.log('at level 10', JSON.stringify(seen));
  expect(seen.most).toBeGreaterThanOrEqual(3);
  await expect(page.locator('#screen-finish h2')).toHaveText('You drove them all off! The treasure is safe!');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await page.waitForTimeout(700);
  await shot(page, 'cannon-bay-level10-finish');
});

test('level 10: there\'s a mark for each of the four pirates, with their own health', async ({ page }) => {
  await startPlaying(page, atLevel(10, { bayShips: 6 }));
  await expect(page.locator('.mark')).toHaveCount(4);
  await expect.poll(() => page.locator('.mark:not([data-where="none"])').count(), { timeout: 10_000 }).toBe(4);
  await page.evaluate(() => {
    const { battle } = window.__game;
    const sloop = battle.afloat.find(({ kind }) => kind === 'sloop');
    battle.hit(sloop, sloop);
  });
  const fills = await page.locator('.mark-fill').evaluateAll((nodes) => nodes.map((node) => node.style.width));
  expect(fills.filter((width) => width !== '100%').length).toBe(1);
});

test('the cannons set to always still fire at level 10, with a closed hand', async ({ page }) => {
  await startPlaying(page, atLevel(10, { bayShips: 4, bayCannons: 'always' }), [null, 'fist', { scale: 0.7 }]);
  await page.evaluate(() => {
    window.__holding = setInterval(() => {
      const { battle } = window.__game;
      const [first] = battle.afloat;
      if (!first) return;
      const direction = battle.heading + Math.PI * 0.4;
      first.x = battle.x + Math.sin(direction) * 95;
      first.z = battle.z - Math.cos(direction) * 95;
      first.heading = battle.heading;
      first.mode = 'away';
      first.spot = { x: first.x, z: first.z };
      first.modeLeft = 5;
    }, 16);
  });
  await expect.poll(async () => (await battleState(page)).stats.shots, { timeout: 20_000 }).toBeGreaterThan(2);
  await page.evaluate(() => clearInterval(window.__holding));
});

test('being sunk on Medium tries the same level again', async ({ page }) => {
  await startPlaying(page, atLevel(5, { bayShips: 4, bayLevel: 'medium' }));
  await page.evaluate(() => {
    const { battle } = window.__game;
    for (let i = 0; i < 5; i += 1) battle.hurt({ to: { x: battle.x, z: battle.z } });
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 5 again!');
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  expect(await page.evaluate(() => window.__game.battle.levelNumber)).toBe(5);
});
