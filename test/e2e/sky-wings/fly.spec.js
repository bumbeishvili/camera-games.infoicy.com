// Sky Wings, with footage of a person going through the real tracker.
import { expect, screenName, shot, test, waitForScreen } from '../helpers.js';
import { armsAre, dropPlanes, flightState, flyWell, footage, holdPlaneInFront, letPlaneGo, openSky, reachFlight, reachLesson, toChoosing } from './helpers.js';

const prompt = (page) => page.locator('#prompt');
const demoName = (page) => page.evaluate(() => window.__game.game.demo.playing?.name ?? null);

test('the lesson shows each thing to do, sees it done with real arms, and then the dogfight starts', async ({ page }) => {
  test.setTimeout(150_000);
  await openSky(page);
  await shot(page, 's1-title');
  await armsAre(page, 'down');
  await toChoosing(page);
  await page.waitForTimeout(800);
  await shot(page, 's2-choose');
  await page.locator('#fly-start').click();
  await waitForScreen(page, 'lesson');

  await expect(page.locator('#coach-text')).toHaveText('Hold your arms out like wings!');
  await expect(page.locator('#coach-demo')).toBeVisible();
  expect(await demoName(page)).toBe('wings');
  await expect(page.locator('#lesson-count')).toHaveText('1 / 5');
  await page.waitForTimeout(800);
  await shot(page, 's3-lesson');

  await armsAre(page, 'level');
  await expect(page.locator('.callout.is-seen').first()).toContainText('Those are wings!', { timeout: 10_000 });
  await expect(page.locator('#coach-text')).toHaveText('Tip your wings to the right!', { timeout: 6000 });
  expect(await page.evaluate(() => window.__game.game.demo.playing.side)).toBe('right');
  await armsAre(page, 'right');
  await page.waitForTimeout(300);
  await shot(page, 's4-lesson-tip');
  await expect(page.locator('#coach-text')).toHaveText('Tip your wings to the left!', { timeout: 8000 });
  expect(await page.evaluate(() => window.__game.game.demo.playing.side)).toBe('left');
  await armsAre(page, 'left');
  await expect(page.locator('#coach-text')).toHaveText('Raise both arms to fly up!', { timeout: 8000 });
  expect(await demoName(page)).toBe('climb');
  await armsAre(page, 'high');
  await expect(page.locator('#coach-text')).toHaveText('Lower both arms to fly down!', { timeout: 8000 });
  expect(await demoName(page)).toBe('dive');
  await page.waitForTimeout(500);
  await shot(page, 's5-lesson-dive');
  await armsAre(page, 'low');
  await waitForScreen(page, 'fly');

  const learned = await page.evaluate(() => window.__game.reader.personal);
  expect(learned.tiltRight).toBeGreaterThan(0.2);
  expect(learned.tiltLeft).toBeGreaterThan(0.2);
  expect(Math.abs(learned.tiltZero)).toBeLessThan(0.1);
});

test('real arms fly the plane in all three directions: turning, climbing and diving', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFlight(page);
  await expect(page.locator('#coach-text')).toHaveText('Sky pirates! Get them inside the ring!');
  expect(await demoName(page)).toBe('tip');
  await page.waitForTimeout(800);
  await shot(page, 's6-flying');
  // Nobody in the way, as the help with aiming would otherwise be part of this.
  await page.evaluate(() => {
    const { flight } = window.__game;
    flight.enemies.length = 0;
    flight.waiting = 0;
  });

  const start = await flightState(page);
  await armsAre(page, 'right');
  await expect.poll(async () => (await flightState(page)).heading, { timeout: 8000 }).toBeGreaterThan(start.heading + 0.5);
  expect((await flightState(page)).roll).toBeGreaterThan(0.2);
  await shot(page, 's7-banking');
  const turned = await flightState(page);
  await armsAre(page, 'left');
  await expect.poll(async () => (await flightState(page)).heading, { timeout: 8000 }).toBeLessThan(turned.heading - 0.5);

  await armsAre(page, 'high');
  await expect.poll(async () => (await flightState(page)).pitch, { timeout: 8000 }).toBeGreaterThan(0.25);
  const climbing = await flightState(page);
  await expect.poll(async () => (await flightState(page)).y, { timeout: 8000 }).toBeGreaterThan(climbing.y + 15);
  await shot(page, 's8-climbing');

  await armsAre(page, 'low');
  await expect.poll(async () => (await flightState(page)).pitch, { timeout: 8000 }).toBeLessThan(-0.2);
  const diving = await flightState(page);
  await expect.poll(async () => (await flightState(page)).y, { timeout: 8000 }).toBeLessThan(diving.y - 10);
  await shot(page, 's9-diving');
  await expect(page.locator('#coach')).toBeHidden({ timeout: 8000 });
});

test('the camera goes with the plane, so that the horizon moves as it climbs and banks', async ({ page }) => {
  await reachFlight(page);
  await page.evaluate(() => {
    const { flight } = window.__game;
    flight.enemies.length = 0;
    flight.waiting = 0;
    flight.pitch = 0.5;
    flight.heading = 1;
  });
  const looking = await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    const { sky, flight } = window.__game;
    const direction = sky.camera.getWorldDirection(sky.camera.position.clone());
    return { x: direction.x, y: direction.y, z: direction.z, forward: flight.forward };
  });
  expect(looking.y).toBeCloseTo(looking.forward.y, 1);
  expect(looking.x).toBeCloseTo(looking.forward.x, 1);
});

test('the little wings on the screen tip with the arms, so a child can see how they\'re being read', async ({ page }) => {
  await reachFlight(page);
  const turned = () => page.locator('#wing-pair').evaluate((node) => node.style.transform);
  await expect(page.locator('#wing-meter')).toBeVisible();
  await armsAre(page, 'right');
  await expect.poll(turned, { timeout: 5000 }).toMatch(/rotate\(\d/);
  await armsAre(page, 'left');
  await expect.poll(turned, { timeout: 5000 }).toMatch(/rotate\(-\d/);
  await expect(page.locator('#wing-meter')).toHaveAttribute('data-out', 'yes');
  await armsAre(page, 'down');
  await expect(page.locator('#wing-meter')).toHaveAttribute('data-out', 'no', { timeout: 5000 });
});

test('the ring is always there, and a plane inside it gets fired at by itself', async ({ page }) => {
  await reachFlight(page);
  const aim = page.locator('#aim');
  await expect(aim).toBeVisible();
  await expect(aim).toHaveAttribute('data-locked', 'no');
  await holdPlaneInFront(page, { ahead: 100, across: 200 });
  await page.waitForTimeout(300);
  expect((await flightState(page)).firing).toBe(false);
  await shot(page, 's10-ring');

  await holdPlaneInFront(page, { ahead: 100 });
  await expect(aim).toHaveAttribute('data-locked', 'yes', { timeout: 5000 });
  await expect.poll(async () => (await flightState(page)).stats.hits, { timeout: 5000 }).toBeGreaterThan(1);
  await shot(page, 's11-firing');
  const { firing, locked, stats } = await flightState(page);
  expect(firing).toBe(true);
  expect(locked).not.toBeNull();
  expect(stats.shots).toBeGreaterThan(1);
  await expect(page.locator('.mark[data-locked="yes"]')).toHaveCount(1);
});

test('what\'s inside the ring on the screen is exactly what the guns fire at', async ({ page }) => {
  await reachFlight(page);
  const measure = () => page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const { flight, sky } = window.__game;
    const [enemy] = flight.flying;
    const seen = sky.project(enemy.x, enemy.y, enemy.z);
    const ring = document.getElementById('aim').getBoundingClientRect();
    const middle = { x: ring.left + ring.width / 2, y: ring.top + ring.height / 2 };
    return {
      fromMiddle: Math.hypot(seen.x - middle.x, seen.y - middle.y),
      radius: sky.aimDiameter(window.__game.game.settings.level) / 2,
      inRing: flight.findTarget() === enemy,
      centred: Math.hypot(middle.x - innerWidth / 2, middle.y - innerHeight / 2),
    };
  });
  await holdPlaneInFront(page, { ahead: 110, across: 110 * Math.tan((10 * Math.PI) / 180) });
  const inside = await measure();
  expect(inside.inRing).toBe(true);
  expect(inside.fromMiddle).toBeLessThan(inside.radius);
  expect(inside.centred).toBeLessThan(2);
  await holdPlaneInFront(page, { ahead: 110, across: 110 * Math.tan((12 * Math.PI) / 180) });
  const outside = await measure();
  expect(outside.inRing).toBe(false);
  expect(outside.fromMiddle).toBeGreaterThan(outside.radius);
  await letPlaneGo(page);
});

test('dropping a plane: it falls away smoking, its pilot parachutes down, and the next one comes', async ({ page }) => {
  await reachFlight(page);
  await holdPlaneInFront(page, { ahead: 90 });
  await expect.poll(async () => (await flightState(page)).dropped, { timeout: 15_000 }).toBe(1);
  await letPlaneGo(page);
  await expect(page.locator('#dropped')).toHaveText('1');
  await expect(page.locator('#planes-left')).toHaveText('5');
  await expect(page.locator('.callout.is-big').first()).toContainText('Got one!');
  expect(await page.evaluate(() => window.__game.sky.chutes.length)).toBe(1);
  await page.waitForTimeout(500);
  await shot(page, 's12-dropped');
  await expect.poll(async () => (await flightState(page)).enemies.filter(({ state }) => state === 'flying').length, { timeout: 4000 }).toBe(3);
  const { enemies } = await flightState(page);
  expect(enemies.some(({ state }) => state === 'falling')).toBe(true);
});

test('a mark shows where each plane is, and an arrow says which way to turn for one that\'s off the screen', async ({ page }) => {
  await reachFlight(page);
  await holdPlaneInFront(page, { ahead: -80 });
  await expect(page.locator('.mark[data-where="off"] .mark-face').first()).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(200);
  await shot(page, 's13-arrow');
  const place = await page.locator('.mark[data-where="off"]').first().evaluate((node) => node.style.transform);
  expect(place).toMatch(/translate/);
  await holdPlaneInFront(page, { ahead: 150, across: 60 });
  await expect(page.locator('.mark[data-where="on"]')).toHaveCount(1, { timeout: 5000 });
  await letPlaneGo(page);
});

test('being hunted: a plane behind turns its mark red, and being hit costs a heart but never the last on Gentle', async ({ page }) => {
  await reachFlight(page);
  await page.evaluate(() => {
    const { flight } = window.__game;
    const [enemy] = flight.flying;
    const { forward } = flight;
    enemy.x = flight.x - forward.x * 90;
    enemy.y = flight.y;
    enemy.z = flight.z - forward.z * 90;
    enemy.heading = flight.heading;
    enemy.mode = 'hunt';
    enemy.modeLeft = 20;
    enemy.fireIn = 0;
  });
  await expect(page.locator('.mark[data-hunting="yes"]')).toHaveCount(1, { timeout: 5000 });
  await page.waitForTimeout(300);
  await shot(page, 's14-hunted');
  await expect.poll(async () => page.evaluate(() => window.__game.flight.shots.some(({ mine }) => !mine)), { timeout: 8000 }).toBe(true);

  await page.evaluate(() => window.__game.flight.hurt());
  await expect(page.locator('#hearts')).toHaveText('♥♥♥♥♡');
  await page.evaluate(() => {
    for (let i = 0; i < 20; i += 1) window.__game.flight.hurt();
  });
  await expect(page.locator('#hearts')).toHaveText('♥♡♡♡♡');
  expect((await flightState(page)).state).toBe('flying');
});

test('the edge of the world turns the plane back, and says so', async ({ page }) => {
  await reachFlight(page);
  await page.evaluate(() => {
    const { flight } = window.__game;
    flight.enemies.length = 0;
    flight.waiting = 0;
    flight.x = 0;
    flight.z = 1000;
    flight.heading = Math.PI;
  });
  await expect(prompt(page)).toContainText('Back to the island!', { timeout: 5000 });
  await page.waitForTimeout(300);
  await shot(page, 's15-edge');
  await expect.poll(async () => {
    const { heading } = await flightState(page);
    return Math.cos(heading);
  }, { timeout: 15_000 }).toBeGreaterThan(0.5);
  const { x, z } = await flightState(page);
  expect(Math.hypot(x, z)).toBeLessThanOrEqual(1050);
});

test('with arms down the plane glides and asks for them, and resting stops all the shooting', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFlight(page);
  await page.waitForTimeout(800);
  const flying = await flightState(page);
  await armsAre(page, 'down');
  await expect(prompt(page)).toContainText('Hold your arms out like wings!', { timeout: 8000 });
  await expect(page.locator('#coach-text')).toHaveText('Hold your arms out like wings!');
  expect(await demoName(page)).toBe('wings');
  await page.waitForTimeout(300);
  await shot(page, 's16-arms-down');
  expect((await flightState(page)).speed).toBeLessThan(flying.speed);

  await expect.poll(async () => (await flightState(page)).resting, { timeout: 15_000 }).toBe(true);
  await shot(page, 's17-resting');
  const resting = await flightState(page);
  await page.evaluate(() => {
    for (const enemy of window.__game.flight.flying) {
      enemy.mode = 'hunt';
      enemy.modeLeft = 100;
    }
  });
  await page.waitForTimeout(3000);
  const later = await flightState(page);
  expect(later.stats.hurts).toBe(resting.stats.hurts);
  expect(later.enemies.every(({ mode }) => mode !== 'hunt')).toBe(true);
  expect(later.firing).toBe(false);

  await armsAre(page, 'level');
  await expect.poll(async () => (await flightState(page)).resting, { timeout: 10_000 }).toBe(false);
});

test('stepping out of the picture pauses everything', async ({ page }) => {
  await reachFlight(page);
  await page.evaluate(() => window.__camera.showNobody());
  await expect(prompt(page)).toContainText('Come back where I can see you', { timeout: 15_000 });
  const stopped = await flightState(page);
  await page.waitForTimeout(2000);
  expect((await flightState(page)).z).toBe(stopped.z);
  await armsAre(page, 'level');
  await expect.poll(async () => (await flightState(page)).z, { timeout: 10_000 }).not.toBe(stopped.z);
});

test('a whole dogfight: every plane dropped, the numbers, the camera going off, and flying again without the lesson', async ({ page }) => {
  test.setTimeout(300_000);
  await reachFlight(page, { planes: 3, pace: 'fast' });
  await flyWell(page);
  await waitForScreen(page, 'finishing');
  await page.waitForTimeout(900);
  await shot(page, 's18-finishing');
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('You dropped them all!');
  await expect(page.locator('#finish-place')).toHaveText('3 / 3');
  await expect(page.locator('#finish-line')).toContainText('dropped 3 of 3 planes');
  await expect(page.locator('.finish-tally .tally-card')).toHaveCount(3);
  await expect(page.locator('#finish-hold')).toContainText('Arms out for');
  await page.waitForTimeout(800);
  await shot(page, 's19-finish');
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(0);

  await armsAre(page, 'level');
  await page.locator('#fly-again').click();
  await waitForScreen(page, 'fly');
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(1);
  expect((await flightState(page)).stats.dropped).toBe(0);
});

test('on a harder level the hearts can run out, and that ends it kindly', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFlight(page, { level: 'medium', planes: 3 });
  await dropPlanes(page, 1);
  await page.evaluate(() => {
    for (let i = 0; i < 5; i += 1) window.__game.flight.hurt();
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('So close! Fly again!');
  await expect(page.locator('#finish-place')).toHaveText('1 / 3');
});

test('another pilot can be chosen after a dogfight', async ({ page }) => {
  test.setTimeout(240_000);
  await reachFlight(page, { planes: 3 });
  await dropPlanes(page, 3);
  await waitForScreen(page, 'finish');
  await page.locator('#other-pilot').click();
  await waitForScreen(page, 'choose');
  await page.locator('.fighter-card[data-fighter="mochi"]').click();
  expect(await page.evaluate(() => window.__game.sky.plane.spec.id)).toBe('mochi');
  expect(await page.evaluate(() => window.__game.sky.flight)).toBe(null);
  await page.waitForTimeout(700);
  await shot(page, 's20-choose-again');
});

test('the sky pirates are other characters, and every character can fly', async ({ page }) => {
  await reachFlight(page);
  const pilots = await page.evaluate(() => window.__game.sky.enemyPlanes.map(({ spec }) => spec.id));
  expect(pilots).toHaveLength(6);
  expect(new Set(pilots).size).toBe(6);
  expect(pilots).not.toContain('joze');
  const ids = await page.evaluate(async () => {
    const { ROSTER } = await import('/core/body/roster.js');
    return ROSTER.map(({ id }) => id);
  });
  for (const id of ids) {
    await page.evaluate(async (which) => {
      const { sky } = window.__game;
      const { byId } = await import('/core/body/roster.js');
      sky.setPilot(byId(which));
      for (let i = 0; i < 5; i += 1) sky.update(0.05);
      sky.render();
    }, id);
  }
});

test('the grown-ups\' panel pauses the dogfight and remembers what it\'s told', async ({ page }) => {
  await reachFlight(page);
  await page.locator('#open-panel').click();
  await expect(page.locator('#panel')).toBeVisible();
  await shot(page, 's21-panel');
  await expect(page.locator('input[name="hands"]').first()).toBeHidden();
  const paused = await flightState(page);
  await page.waitForTimeout(600);
  expect((await flightState(page)).z).toBe(paused.z);
  await page.locator('input[name="pace"][value="fast"]').check();
  await page.locator('input[name="planes"][value="9"]').check();
  await page.locator('input[name="level"][value="tough"]').check();
  await page.locator('input[name="climbing"][value="no"]').check();
  await page.locator('#close-panel').click();
  await expect.poll(async () => (await flightState(page)).z).not.toBe(paused.z);

  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
  await page.locator('#open-panel').click();
  for (const [name, value] of [['pace', 'fast'], ['planes', '9'], ['level', 'tough'], ['climbing', 'no']]) {
    await expect(page.locator(`input[name="${name}"][value="${value}"]`)).toBeChecked();
  }
});

test('with climbing off, there\'s no climbing in the lesson, and the plane follows the others by itself', async ({ page }) => {
  await reachLesson(page, { climbing: 'no' });
  await expect(page.locator('#lesson-count')).toHaveText('1 / 3');
  await page.locator('#lesson-skip').click();
  await waitForScreen(page, 'fly');
  await armsAre(page, 'low');
  await holdPlaneInFront(page, { ahead: 200, up: 80 });
  await expect.poll(async () => (await flightState(page)).pitch, { timeout: 8000 }).toBeGreaterThan(0.1);
  await letPlaneGo(page);
});

test('the view check asks a child to step back until there\'s room for both arms', async ({ page }) => {
  await openSky(page);
  await footage(page, 'wings', { from: 4, playing: false, height: 5, shiftY: 1.1 });
  await toChoosing(page);
  await page.locator('#fly-start').click();
  await waitForScreen(page, 'bodycheck');
  await expect(prompt(page)).toContainText('Step back until I can see all of you', { timeout: 10_000 });
  await page.waitForTimeout(1200);
  expect(await screenName(page)).toBe('bodycheck');
  await armsAre(page, 'level');
  await waitForScreen(page, 'lesson');
});
