// Giraffe's Maze's ten levels: what each brings is on the title card and under the countdown, each new thing comes
// along and works in the real game, and nothing flashes, at level 1 or at level 10 with all of it about.
import { expect, openGame, show, shot, test, waitForScreen } from '../helpers.js';
import { expectSoon, GAME, judge, leadHand, OPEN, startPlaying, state, stopHand, watchBrightness } from './helpers.js';

const NEW_AT = {
  2: ['Butterflies to catch'],
  3: ['A gate and its key'],
  4: ['Running shoes'],
  5: ['A sleepy sheep'],
  6: ['Gems in the corners'],
  7: ['The bluebird shows the way'],
  8: ['Bushes to rub away'],
  9: ['The magnet'],
  10: ['Treasure chests'],
};
const atLevel = (level, more = {}) => ({ levels: { [GAME]: level }, ...more });
// Leads the way, holds the hand on a sheep, and rubs a bush, as a child would.
const HELPFUL = `(game) => {
  const { run } = game;
  const blocker = run.waitingAt;
  if (blocker?.kind === 'sheep') return { x: blocker.x, y: blocker.y };
  if (blocker?.kind === 'bush') return { x: blocker.x + Math.sin(performance.now() / 110) * 0.32, y: blocker.y };
  return run.phase === 'walking' ? run.wayAhead(run.nextCell(), 1.3) : null;
}`;
const item = (page, kind) => page.evaluate((wanted) => {
  const found = window.__game.run.layout.items.find((each) => each.kind === wanted);
  return found ? { x: found.x, y: found.y, gone: Boolean(found.gone), opened: Boolean(found.opened), cell: found.cell } : null;
}, kind);
const blocker = (page, kind) => page.evaluate((wanted) => {
  const found = window.__game.run.layout.blockers.find((each) => each.kind === wanted);
  return found ? { x: found.x, y: found.y, open: found.open, progress: found.progress, a: found.a, b: found.b } : null;
}, kind);

test('the title card says what each level brings, and level 1 is the plain game', async ({ page }) => {
  await openGame(page, {}, GAME);
  await expect(page.locator('#level-badge')).toHaveText('Level 1 of 10');
  await expect(page.locator('#level-new')).toBeEmpty();
  for (const [level, names] of Object.entries(NEW_AT)) {
    await page.locator('#open-panel').click();
    await page.locator('#level-choice label', { hasText: new RegExp(`^\\s*${level}\\s*$`) }).click();
    await page.locator('#close-panel').click();
    await expect(page.locator('#level-badge')).toHaveText(`Level ${level} of 10`);
    for (const name of names) await expect(page.locator('#level-new')).toContainText(name);
  }
  await shot(page, 'maze-title-level-10');
});

test('under the countdown it says what\'s new, in Georgian too', async ({ page }) => {
  await openGame(page, { language: 'ka', ...atLevel(5) }, GAME);
  await show(page, ...OPEN);
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('მძინარე ცხვარი');
  await expect(page.locator('#level-now')).toHaveText('დონე 5');
  await waitForScreen(page, 'playing');
  await expect(page.locator('#story-line')).toHaveText(/[Ⴀ-ჿ]/);
});

test('level 2: a butterfly flutters over the maze, and the glove catches it just by coming near, even closed', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(2));
  await page.evaluate(() => {
    window.__game.run.butterflyIn = 0;
  });
  await expectSoon(async () => (await state(page)).butterflies).toBe(1);
  await leadHand(page, { photo: 'fist', target: '(game) => { const [fly] = game.run.butterflies; return fly ? { x: fly.x, y: fly.y } : null; }', gain: 0.2 });
  await expectSoon(async () => (await state(page)).prizes.butterfly).toBe(1);
  await expect(page.locator('#chip-prizes')).toHaveText('1', { timeout: 5000 });
  await shot(page, 'maze-butterfly');
  await stopHand(page);
});

test('level 3: a gate across the way stays shut until the key is fetched, and then opens for it', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(3, { mazes: 2 }));
  const gate = await blocker(page, 'gate');
  expect(gate).not.toBeNull();
  expect(await item(page, 'key')).not.toBeNull();
  // Led straight to the gate first, without the key: it stays shut, and says to find the key.
  await leadHand(page, { target: `(game) => { const { run } = game; const gate = run.layout.blockers.find((each) => each.kind === 'gate'); return run.phase === 'walking' ? run.wayAhead(gate.b, 1.3) : null; }` });
  await expectSoon(() => page.evaluate(() => window.__game.run.waitingAt?.kind ?? null), { timeout: 60_000 }).toBe('gate');
  await expect(page.locator('#prompt-text')).toHaveText('Find the key!');
  expect((await blocker(page, 'gate')).open).toBe(false);
  await shot(page, 'maze-gate-locked');
  // Then the way, which goes to the key first.
  await leadHand(page);
  await expectSoon(async () => (await state(page)).hasKey, { timeout: 60_000 }).toBe(true);
  await shot(page, 'maze-key');
  await expectSoon(async () => (await blocker(page, 'gate'))?.open ?? true, { timeout: 60_000 }).toBe(true);
  await expectSoon(async () => (await state(page)).found, { timeout: 60_000 }).toBe(1);
  await stopHand(page);
});

test('level 4: running shoes early on the way make the character quicker for a while', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(4));
  expect(await item(page, 'shoes')).not.toBeNull();
  await leadHand(page, { target: HELPFUL, gain: 0.2 });
  await expectSoon(async () => (await state(page)).power?.kind, { timeout: 90_000 }).toBe('shoes');
  const from = await state(page);
  await page.waitForTimeout(1000);
  const to = await state(page);
  expect(to.walked - from.walked).toBeGreaterThan(2.5);
  await shot(page, 'maze-shoes');
  await stopHand(page);
});

test('level 5: a sleepy sheep in the way wakes for an open hand held on it, and hops off', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(5));
  expect(await blocker(page, 'sheep')).not.toBeNull();
  await leadHand(page);
  await expectSoon(() => page.evaluate(() => window.__game.run.waitingAt?.kind ?? null), { timeout: 60_000 }).toBe('sheep');
  await expect(page.locator('#prompt-text')).toHaveText('Hold your open hand on the sheep!', { timeout: 10_000 });
  await shot(page, 'maze-sheep');
  await leadHand(page, { target: HELPFUL, gain: 0.2 });
  await expectSoon(async () => (await blocker(page, 'sheep')).progress, { timeout: 30_000 }).toBeGreaterThan(0.3);
  await expectSoon(async () => (await blocker(page, 'sheep')).open, { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, 'maze-sheep-wakes');
  await expectSoon(async () => (await state(page)).found, { timeout: 60_000 }).toBe(1);
  await stopHand(page);
});

test('level 6: a gem waits in a dead end, and is the child\'s for walking there', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(6));
  const gem = await item(page, 'gem');
  expect(gem).not.toBeNull();
  // The gem's dead end can be behind the gate, so the key comes first, and a sheep in the way is woken.
  await leadHand(page, {
    target: `(game) => {
      const { run } = game;
      if (run.waitingAt?.kind === 'sheep') return { x: run.waitingAt.x, y: run.waitingAt.y };
      const gem = run.layout.items.find((each) => each.kind === 'gem' && !each.gone);
      const key = run.layout.items.find((each) => each.kind === 'key' && !each.gone);
      if (!gem || run.phase !== 'walking') return null;
      return run.wayAhead(key && !run.hasKey ? key.cell : gem.cell, 1.3);
    }`,
    gain: 0.2,
  });
  await expectSoon(async () => (await state(page)).prizes.gem, { timeout: 120_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#chip-prizes')).not.toHaveText('0', { timeout: 5000 });
  await shot(page, 'maze-gem');
  await stopHand(page);
});

test('level 7: the bluebird flies off along the way to the friend, and leaves a trail to follow', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(7));
  expect(await item(page, 'bird')).not.toBeNull();
  await leadHand(page);
  await expectSoon(() => page.evaluate(() => Boolean(window.__game.run.bird)), { timeout: 60_000 }).toBe(true);
  await page.waitForTimeout(900);
  const trail = await page.evaluate(() => {
    const { run } = window.__game;
    return { last: run.bird.cells.at(-1), friend: run.layout.lost[0].cell, length: run.bird.cells.length };
  });
  expect(trail.last).toBe(trail.friend);
  expect(trail.length).toBeGreaterThan(2);
  await shot(page, 'maze-bluebird');
  await stopHand(page);
});

test('level 8: a bush in the way goes for an open hand rubbing it, and not for one held still', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(8));
  expect(await blocker(page, 'bush')).not.toBeNull();
  await leadHand(page);
  await expectSoon(() => page.evaluate(() => window.__game.run.waitingAt?.kind ?? null), { timeout: 60_000 }).toBe('bush');
  await expect(page.locator('#prompt-text')).toHaveText('Rub the bush with your open hand!', { timeout: 10_000 });
  // Held still on it, open: nothing more.
  await leadHand(page, { target: '(game) => { const bush = game.run.layout.blockers.find((each) => each.kind === \'bush\'); return { x: bush.x, y: bush.y }; }', gain: 0.25 });
  await page.waitForTimeout(2500);
  const still = (await blocker(page, 'bush')).progress;
  await page.waitForTimeout(2000);
  expect((await blocker(page, 'bush')).progress - still).toBeLessThan(0.15);
  // Rubbed, it goes.
  await leadHand(page, { target: HELPFUL, gain: 0.3 });
  await expectSoon(async () => (await blocker(page, 'bush')).open, { timeout: 30_000 }).toBe(true);
  await shot(page, 'maze-bush');
  await stopHand(page);
});

test('level 9: the magnet draws fruit in from round about, over the hedges', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(9));
  expect(await item(page, 'magnet')).not.toBeNull();
  await leadHand(page, { target: HELPFUL, gain: 0.2 });
  await expectSoon(async () => (await state(page)).power?.kind, { timeout: 90_000 }).toBe('magnet');
  // The hand held open by the character: whatever fruit is near comes to it.
  await leadHand(page, { target: '(game) => game.run.position', gain: 0.2 });
  const near = await page.evaluate(() => {
    const { run } = window.__game;
    const at = run.position;
    return run.layout.items.filter((each) => ['fruit', 'gem'].includes(each.kind) && !each.gone && Math.hypot(each.x - at.x, each.y - at.y) < 2.4).length;
  });
  const before = (await state(page)).fruit + (await state(page)).prizes.gem;
  await page.waitForTimeout(400);
  await shot(page, 'maze-magnet');
  if (near > 0) await expectSoon(async () => (await state(page)).fruit + (await state(page)).prizes.gem, { timeout: 10_000 }).toBeGreaterThan(before);
  await stopHand(page);
});

test('level 10: a treasure chest in a dead end opens for the character, with a crown in it', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(10));
  const chest = await item(page, 'chest');
  expect(chest).not.toBeNull();
  // Just along the path from it, then led into it.
  await page.evaluate((cell) => {
    const { run } = window.__game;
    const { maze } = run.layout;
    const next = [0, 1, 2, 3].find((d) => maze.isOpen(cell, d));
    run.walker = { a: maze.next(cell, next), d: -1, t: 0, facing: 1 };
  }, chest.cell);
  await leadHand(page, { target: `(game) => { const chest = game.run.layout.items.find((each) => each.kind === 'chest'); return { x: chest.x, y: chest.y }; }` });
  await expectSoon(async () => (await item(page, 'chest')).opened, { timeout: 60_000 }).toBe(true);
  await expectSoon(async () => (await state(page)).prizes.crown).toBe(1);
  await page.waitForTimeout(300);
  await shot(page, 'maze-chest');
  await stopHand(page);
});

test('a resting child keeps a power-up: its time only runs while the hand is open', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(4));
  await leadHand(page, { target: HELPFUL, gain: 0.2 });
  await expectSoon(async () => (await state(page)).power?.kind, { timeout: 90_000 }).toBe('shoes');
  await stopHand(page);
  await show(page, null, 'fist', { scale: 0.62 });
  await page.waitForTimeout(800);
  const left = (await state(page)).power.left;
  await page.waitForTimeout(3000);
  expect((await state(page)).power.left).toBe(left);
});

// Nothing flashes: the whole picture's brightness, frame by frame, through walking and eating, and at level 10 with
// butterflies, the bluebird, a power-up and what's in the way about, and then a friend found and the next maze
// coming in.
for (const level of [1, 10]) {
  test(`nothing flashes at level ${level}: the brightness stays steady, walking, and through a friend found and the next maze coming in`, async ({ page }) => {
    test.setTimeout(300_000);
    await startPlaying(page, atLevel(level, { mazes: 2 }));
    await leadHand(page, { target: HELPFUL, gain: 0.2 });
    if (level === 10) {
      await page.evaluate(() => {
        window.__game.run.butterflyIn = 0;
      });
    }
    await expectSoon(async () => (await state(page)).walked, { timeout: 30_000 }).toBeGreaterThan(2);
    const walking = judge(await watchBrightness(page, 300));
    console.log(`level ${level}`, 'walking', JSON.stringify(walking));
    expect(walking.biggestStep).toBeLessThan(4);
    // What changes quickly here is the characters, the friends following them and the glove copying the hand going
    // past a place, rather than anything lighting up. The usual measure for a flash is a quarter of the picture.
    expect(walking.flickeringShare).toBeLessThan(0.02);
    expect(walking.brightness).toBeGreaterThan(120);
    // Then the hand rests, the friend is found, and the next maze comes in, which is all the game's own doing:
    // measured from just before.
    await stopHand(page);
    await show(page, null, 'fist', { scale: 0.62 });
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const { run } = window.__game;
      const [lost] = run.layout.lost;
      run.found(lost, run.me);
    });
    const changing = judge(await watchBrightness(page, 240));
    console.log(`level ${level}`, 'next maze', JSON.stringify(changing));
    expect(changing.biggestStep).toBeLessThan(4);
    expect(changing.flickeringShare).toBeLessThan(0.01);
    expect((await state(page)).index).toBe(1);
  });

  test(`nothing flashes at level ${level}: a hand opening and closing as fast as it can doesn't flicker anything`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPlaying(page, atLevel(level));
    await page.evaluate(() => {
      let open = true;
      window.__flip = setInterval(() => {
        open = !open;
        window.__camera.show({ left: null, right: open ? 'open' : 'fist', scale: 0.62 });
      }, 220);
    });
    const result = judge(await watchBrightness(page, 240));
    console.log(`level ${level}`, 'opening and closing', JSON.stringify(result));
    await page.evaluate(() => clearInterval(window.__flip));
    expect(result.biggestStep).toBeLessThan(4);
    expect(result.flickeringShare).toBeLessThan(0.04);
  });
}
