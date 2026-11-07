// Leap Trail, with real footage going through the real tracker.
import { expect, screenName, shot, test, waitForScreen } from '../helpers.js';
import { bodyDoes, footage, nextObstacleIs, openTrail, reachRun, runState, standInView, toChoosing } from './helpers.js';

const prompt = (page) => page.locator('#prompt');

test('a look at every obstacle, each one cleared', async ({ page }) => {
  await openTrail(page);
  await shot(page, 't1-welcome');
  await toChoosing(page);
  await page.waitForTimeout(700);
  await shot(page, 't2-choose');
  await standInView(page);
  await page.locator('#run-start').click();
  await waitForScreen(page, 'bodycheck');
  await waitForScreen(page, 'practice');
  await page.locator('#practice-skip').click();
  await waitForScreen(page, 'countdown');
  await page.waitForTimeout(1200);
  await shot(page, 't3-countdown');
  await waitForScreen(page, 'run');
  await page.waitForTimeout(1800);
  await shot(page, 't4-running');

  let cleared = 0;
  for (const kind of ['log', 'hay', 'rocks', 'stream', 'arch', 'bough']) {
    const move = kind === 'arch' || kind === 'bough' ? 'squat' : 'jump';
    await nextObstacleIs(page, kind, 14);
    await expect.poll(async () => (await runState(page)).next?.inReach, { timeout: 8000 }).toBe(true);
    await page.waitForTimeout(150);
    await shot(page, `t5-${kind}-ask`);
    await bodyDoes(page, move);
    await page.waitForTimeout(kind === 'arch' || kind === 'bough' ? 800 : 500);
    await shot(page, `t6-${kind}-move`);
    cleared += 1;
    await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 8000 }).toBe(cleared);
    await page.waitForTimeout(700);
  }
  expect(await screenName(page)).toBe('run');
});

test('there are no keyboard controls: only the body moves the runner', async ({ page }) => {
  await reachRun(page);
  await nextObstacleIs(page, 'log', 9);
  await expect.poll(async () => (await runState(page)).next?.inReach, { timeout: 10_000 }).toBe(true);
  for (const key of ['Space', 'ArrowUp', 'ArrowDown', 'Enter', 'KeyW', 'KeyS']) await page.keyboard.press(key);
  await page.waitForTimeout(400);
  const { stats } = await runState(page);
  expect([stats.jumps, stats.squats, stats.cleared]).toEqual([0, 0, 0]);
});

test('a real jump in front of the camera clears what\'s coming', async ({ page }) => {
  await reachRun(page);
  await nextObstacleIs(page, 'log', 9);
  await expect.poll(async () => (await runState(page)).next?.inReach, { timeout: 10_000 }).toBe(true);
  await expect(page.locator('#coach-text')).toHaveText('Jump!');
  await expect(page.locator('#coach-demo')).toBeVisible();
  expect(await page.evaluate(() => window.__game.game.demo.playing.name)).toBe('jump');

  // Three burpees in this footage, each ending in a real jump.
  await footage(page, 'jumps');
  await expect.poll(async () => (await runState(page)).stats.jumps, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.callout.is-seen').first()).toContainText('You jumped!');
  await page.waitForTimeout(150);
  await shot(page, 't7-real-jump');
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 8000 }).toBe(1);
  const { stats } = await runState(page);
  expect(stats.bumps).toBe(0);
  expect(stats.stars).toBe(3);
  await expect(page.locator('#coach')).toBeHidden();
});

test('a real squat in front of the camera slides under what\'s low', async ({ page }) => {
  await reachRun(page);
  await nextObstacleIs(page, 'arch', 9);
  await expect.poll(async () => (await runState(page)).next?.inReach, { timeout: 10_000 }).toBe(true);
  await expect(page.locator('#coach-text')).toHaveText('Squat down!');

  await footage(page, 'squat');
  await expect.poll(async () => (await runState(page)).stats.squats, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.callout.is-seen').first()).toContainText('You squatted!');
  await page.waitForTimeout(200);
  await shot(page, 't8-real-squat');
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 8000 }).toBe(1);
  expect(await page.evaluate(() => window.__game.world.runner.pose.up)).toBeLessThan(0.3);
});

test('set to wait, the runner stops at an obstacle and waits, however long it takes', async ({ page }) => {
  test.setTimeout(120_000);
  await reachRun(page);
  await nextObstacleIs(page, 'hay', 8);
  await expect.poll(async () => (await runState(page)).waiting, { timeout: 15_000 }).toBe(true);
  await expect(prompt(page)).toContainText('Jump when you’re ready!');
  await shot(page, 't9-waiting');

  const stopped = await runState(page);
  expect(stopped.speed).toBe(0);
  expect(stopped.stats.bumps).toBe(0);
  await page.waitForTimeout(4000);
  const later = await runState(page);
  expect(later.distance).toBe(stopped.distance);
  expect(later.next.kind).toBe('hay');

  await footage(page, 'jumps');
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 20_000 }).toBe(1);
  await expect.poll(async () => (await runState(page)).speed).toBeGreaterThan(1);
});

test('set to stumble, a missed obstacle is knocked aside and the run goes on', async ({ page }) => {
  await reachRun(page, { onMissed: 'stumble' });
  await footage(page, 'strikes', { from: 1 });
  await nextObstacleIs(page, 'log', 6);
  await expect.poll(async () => (await runState(page)).stats.bumps, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(200);
  await shot(page, 't10-stumble');
  const { stats } = await runState(page);
  expect(stats.streak).toBe(0);
  expect(stats.cleared).toBe(0);
  await expect.poll(async () => (await runState(page)).speed, { timeout: 8000 }).toBeGreaterThan(3);
  expect(await screenName(page)).toBe('run');
});

test('a whole trail: finish, numbers, the camera going off, and running again', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRun(page, { obstacles: 10, pace: 'fast' });
  await expect(page.locator('#obstacles-left')).toHaveText('10');

  // Doing whatever's asked, at the moment it counts.
  await page.evaluate(() => {
    const { run } = window.__game;
    window.__perfect = setInterval(() => {
      const next = run.next;
      if (run.state !== 'running' || !next || !run.inReach(next) || next.state !== 'ahead') return;
      if (next.needs === 'jump') run.jump();
      else run.squat();
    }, 50);
  });
  await waitForScreen(page, 'finishing');
  await page.waitForTimeout(900);
  await shot(page, 't11-finishing');
  await waitForScreen(page, 'finish');
  await page.evaluate(() => clearInterval(window.__perfect));

  // Three for each obstacle cleared, and the lines of stars on the path.
  await expect(page.locator('#finish-stars')).toHaveText('90');
  await expect(page.locator('#finish-line')).toContainText('cleared 10 of 10');
  await expect(page.locator('.finish-tally .tally-card')).toHaveCount(3);
  await expect(page.locator('.tally-card[data-exercise="streak"] strong')).toHaveText('10');
  await page.waitForTimeout(800);
  await shot(page, 't12-finish');
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(0);

  await standInView(page);
  await page.locator('#run-again').click();
  await waitForScreen(page, 'bodycheck');
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(1);
  await waitForScreen(page, 'run');
  expect(await page.evaluate(() => window.__game.game.practised)).toBe(true);
  expect((await runState(page)).stats.cleared).toBe(0);
  await expect(page.locator('#stars')).toHaveText('0');
});

test('another runner can be chosen after a run', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRun(page, { obstacles: 10, pace: 'fast', onMissed: 'stumble' });
  await page.evaluate(() => {
    const { run } = window.__game;
    run.distance = run.end - 5;
    run.noteActivity();
  });
  await waitForScreen(page, 'finish');
  await page.locator('#other-runner').click();
  await waitForScreen(page, 'choose');
  await page.locator('.fighter-card[data-fighter="tur"]').click();
  expect(await page.evaluate(() => window.__game.world.runner.spec.id)).toBe('tur');
  await page.waitForTimeout(700);
  await shot(page, 't13-choose-again');
});

test('every character can run, jump and slide', async ({ page }) => {
  await reachRun(page);
  const ids = await page.evaluate(async () => {
    const { ROSTER } = await import('/core/body/roster.js');
    return ROSTER.map(({ id }) => id);
  });
  expect(ids).toHaveLength(10);
  for (const id of ids) {
    const posed = await page.evaluate(async (which) => {
      const { byId } = await import('/core/body/roster.js');
      const { world, run } = window.__game;
      world.setRunner(byId(which));
      const samples = [];
      for (const kind of ['jump', 'squat']) {
        run.startMove(kind);
        for (let i = 0; i < 20; i += 1) world.update(0.03);
        samples.push(world.runner.body.root.position.x, world.runner.pose.up, world.runner.pose.hipDrop);
      }
      return samples;
    }, id);
    expect(posed.every(Number.isFinite), id).toBe(true);
  }
});

test('out of the box it\'s fast and never stops: stars to run through, and a missed move is only a stumble', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.clear());
  await reachRun(page, { onMissed: 'stumble' });
  expect(await page.evaluate(() => window.__game.game.settings.pace)).toBe('slow');
  await expect.poll(async () => (await runState(page)).speed, { timeout: 8000 }).toBeGreaterThan(12);
  await expect.poll(() => page.evaluate(() => window.__game.run.stats.linedStars), { timeout: 4000 }).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await shot(page, 't30-fast');
  await expect(page.locator('#stars')).not.toHaveText('0');
  const paint = await page.evaluate(() => window.__game.world.streakLines.material.opacity);
  expect(paint).toBeGreaterThan(0.05);
  // Nobody moves, and it keeps on going through what's in the way.
  await expect.poll(() => page.evaluate(() => window.__game.run.stats.bumps), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (await runState(page)).speed, { timeout: 4000 }).toBeGreaterThan(10);
  await shot(page, 't31-carried-on');
});
