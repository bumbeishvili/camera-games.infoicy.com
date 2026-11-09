// What each Sky Wings level brings that's new: prizes, gift boxes with new kinds of fire, new kinds of
// pirate and new skies. Each is checked to appear and to work, and is photographed for a look by eye.
import { expect, shot, test, waitForScreen } from '../helpers.js';
import { dropPlanes, flightState, holdPlaneInFront, letPlaneGo, measureBlocks, openSky, reachFlight } from './helpers.js';

const at = (level, settings = {}) => ({ levels: { 'sky-wings': level }, ...settings });

/** A gift box with this power, right in front of the plane, so it's flown through. */
const giftAhead = (page, kind) => page.evaluate((power) => {
  const { flight } = window.__game;
  flight.gift = null;
  flight.placeGift(power);
  const { forward } = flight;
  Object.assign(flight.gift, { x: flight.x + forward.x * 110, y: flight.y + forward.y * 110, z: flight.z + forward.z * 110 });
}, kind);

const powerNow = (page) => page.evaluate(() => window.__game.flight.power?.kind ?? null);
const prizesNow = (page) => page.evaluate(() => ({ ...window.__game.flight.stats.prizes }));
const shotKinds = (page) => page.evaluate(() => window.__game.flight.shots.filter(({ mine }) => mine).map(({ kind }) => kind ?? 'plain'));

/** Drops the first flying pirate of a kind, without waiting for the guns. */
const dropKind = (page, kind) => page.evaluate((wanted) => {
  const { flight } = window.__game;
  const enemy = flight.flying.find((one) => one.kind === wanted);
  while (enemy?.state === 'flying') flight.hit(enemy);
  return Boolean(enemy);
}, kind);

/** Waits until a kind of pirate is in the air, dropping whatever comes before it. */
async function waitForKind(page, kind) {
  await expect.poll(async () => {
    const kinds = await page.evaluate(() => window.__game.flight.flying.map((enemy) => enemy.kind));
    if (kinds.includes(kind)) return true;
    await dropPlanes(page, 1);
    return false;
  }, { timeout: 30_000, intervals: [1300] }).toBe(true);
}

/** Drops everything left, until the flight is over. */
async function dropAll(page) {
  await expect.poll(async () => {
    await dropPlanes(page, 4);
    return page.evaluate(() => window.__game.screen);
  }, { timeout: 60_000, intervals: [1300] }).toMatch(/finishing|finish/);
}

const chips = (page, where = '#level-new') => page.locator(`${where} .level-new-chip`).allTextContents();

test('every level from 2 says what it brings, on the title card and as coming up next', async ({ page }) => {
  await openSky(page);
  const each = await page.evaluate(() => {
    const { game } = window.__game;
    const found = {};
    for (let level = 1; level <= 10; level += 1) {
      game.levels.choose(level);
      game.levelUi.refresh();
      found[level] = [...document.querySelectorAll('#level-new .level-new-chip')].map((chip) => chip.textContent);
    }
    game.levels.choose(1);
    game.levelUi.refresh();
    return found;
  });
  expect(each).toEqual({
    1: [],
    2: ['🟡Gold coins'],
    3: ['〰️Weaving pirates', '🎁Triple shot'],
    4: ['🛩️Scout pirates', '💎Gems'],
    5: ['⛰️Higher and lower', '🫧Bubble shot'],
    6: ['🎈Balloon pirates', '🌅Sunset'],
    7: ['❄️Snowflake shot', '🛡️Shield bubble'],
    8: ['👑Pirate captain', '👥Pirate pairs'],
    // Flying as Giraffe, the friend who helps is someone else, who isn't one of the pirates.
    9: ['4️⃣Four at once', '🤝Nova helps', '🌨️Light snow'],
    10: ['💰Treasure airship', '📄Paper planes'],
  });

  // Flying as someone else, it's Giraffe who comes to help.
  await page.locator('#start').click();
  await page.locator('.fighter-card[data-fighter="kit"]').click();
  await page.evaluate(() => {
    window.__game.game.levels.choose(9);
    window.__game.game.levelUi.refresh();
  });
  expect(await chips(page)).toContain('🦒Giraffe helps');
});

test('level 1 has no prizes, gift boxes or new pirates', async ({ page }) => {
  await reachFlight(page, { planes: 3 });
  await expect(page.locator('#treasure-chip')).toBeHidden();
  await page.waitForTimeout(6500);
  const now = await page.evaluate(() => {
    const { flight } = window.__game;
    return { gift: flight.gift, kinds: flight.plan, sky: window.__game.sky.weather };
  });
  expect(now).toEqual({ gift: null, kinds: ['pirate', 'pirate', 'pirate'], sky: 'day' });
  await dropPlanes(page, 3);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-treasure')).toBeHidden();
  await expect(page.locator('#level-next-new')).toHaveText('Coming up:🟡Gold coins');
});

test('level 2: every pirate dropped leaves a gold coin, which flies to the plane and is counted', async ({ page }) => {
  await reachFlight(page, at(2, { planes: 3 }));
  await expect(page.locator('#level-now')).toBeHidden();
  await expect(page.locator('#treasure-chip')).toBeVisible();
  await expect(page.locator('#treasure')).toHaveText('0');
  await holdPlaneInFront(page, { ahead: 60, across: 10 });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    // Watch for the coin, which waits a moment where the pirate was dropped and then flies to the plane.
    window.__coins = [];
    const { flight } = window.__game;
    const real = flight.onEvent;
    flight.onEvent = (event) => {
      if (event.type === 'prize-dropped') window.__coins.push(event.prize.kind);
      real(event);
    };
  });
  await dropPlanes(page, 1);
  expect(await page.evaluate(() => window.__coins)).toEqual(['coin']);
  await page.waitForTimeout(150);
  await shot(page, 'sky-wings-l2-coin');
  await expect.poll(() => prizesNow(page), { timeout: 5000 }).toMatchObject({ coin: 1 });
  await expect(page.locator('#treasure')).toHaveText('1');
  await letPlaneGo(page);
  await dropAll(page);
  await waitForScreen(page, 'finish');
  // Every coin is counted, even one still on its way at the end.
  await expect(page.locator('#finish-treasure')).toContainText('3 gold coins');
  await expect(page.locator('#level-next-new')).toHaveText('Coming up:〰️Weaving pirates🎁Triple shot');
  await page.waitForTimeout(700);
  await shot(page, 'sky-wings-l2-finish');
});

test('level 3: a gift box floats out in front, and flying through it gives the triple shot', async ({ page }) => {
  await reachFlight(page, at(3, { planes: 6 }));
  // The first gift box comes by itself, after a few seconds, with its power's name on it.
  await expect.poll(() => page.evaluate(() => window.__game.flight.gift?.kind ?? null), { timeout: 10_000 }).toBe('triple');
  await expect(page.locator('#gift-mark .gift-name')).toHaveText('Triple shot');
  await page.waitForTimeout(400);
  await shot(page, 'sky-wings-l3-gift');
  // Flying straight on, it's caught.
  await expect.poll(() => powerNow(page), { timeout: 10_000 }).toBe('triple');
  await expect(page.locator('#power')).toBeVisible();
  await expect(page.locator('#power-name')).toHaveText('Triple shot');
  expect(await page.evaluate(() => window.__game.flight.stats.gifts)).toBe(1);
  await holdPlaneInFront(page, { ahead: 110, across: 6 });
  await expect.poll(async () => (await shotKinds(page)).filter((kind) => kind === 'triple').length, { timeout: 5000 }).toBeGreaterThanOrEqual(3);
  await page.waitForTimeout(200);
  await shot(page, 'sky-wings-l3-triple');
  // Three at a time, while it lasts: every shot of the child's in the air is part of a fan.
  const kinds = await shotKinds(page);
  expect(kinds.filter((kind) => kind === 'triple').length % 3).toBe(0);
  await letPlaneGo(page);
  // It lasts a few seconds, then the guns are as they were.
  await expect.poll(() => powerNow(page), { timeout: 12_000 }).toBe(null);
  await expect(page.locator('#power')).toBeHidden();
});

test('level 4: scout pirates are small and quick, are named the first time, and leave a gem', async ({ page }) => {
  await reachFlight(page, at(4, { planes: 3 }));
  const scout = await page.evaluate(() => {
    const { flight, sky } = window.__game;
    const enemy = flight.flying.find(({ kind }) => kind === 'scout');
    const ordinary = flight.flying.find(({ kind }) => kind === 'pirate');
    return { hits: enemy.hitsTotal, usual: ordinary.hitsTotal, size: sky.planeFor(enemy).root.scale.x, usualSize: sky.planeFor(ordinary).root.scale.x };
  });
  expect(scout.hits).toBeLessThan(scout.usual);
  expect(scout.size).toBeLessThan(scout.usualSize);
  await holdPlaneInFront(page, { kind: 'scout', ahead: 80, across: 10 });
  await expect(page.locator('.mark[data-kind="scout"][data-named="yes"] .mark-name')).toHaveText('Scout');
  await page.waitForTimeout(300);
  await shot(page, 'sky-wings-l4-scout');
  await letPlaneGo(page);
  await dropKind(page, 'scout');
  // Every scout dropped leaves a gem. That's usually just the one dropped here, but on a slow computer
  // the guns can drop the scout held in the ring first, as scouts take fewer hits, and then the next.
  const dropped = await page.evaluate(() => window.__game.flight.enemies.filter(({ kind, state }) => kind === 'scout' && state !== 'flying').length);
  expect(dropped).toBeGreaterThanOrEqual(1);
  await expect.poll(() => prizesNow(page), { timeout: 5000 }).toMatchObject({ gem: dropped });
  await expect(page.locator('#treasure .treasure-item[data-kind="gem"]')).toHaveText(`💎${dropped}`);
});

test('level 5: the bubble shot wraps a pirate up, and it floats gently down', async ({ page }) => {
  await reachFlight(page, at(5, { planes: 3 }));
  await giftAhead(page, 'bubble');
  await expect.poll(() => powerNow(page), { timeout: 8000 }).toBe('bubble');
  // Long enough to see, however slow the computer is.
  await page.evaluate(() => {
    window.__game.flight.power.left = 30;
  });
  // Far enough off that the bubbles are in the air for a moment before they get there.
  await holdPlaneInFront(page, { kind: 'pirate', ahead: 190, across: 8 });
  const bubbled = () => page.evaluate(() => window.__game.flight.enemies.some(({ bubbled: is }) => is));
  await expect.poll(async () => (await shotKinds(page)).includes('bubble') || bubbled(), { timeout: 10_000 }).toBe(true);
  await shot(page, 'sky-wings-l5-bubbles');
  await expect.poll(() => page.evaluate(() => window.__game.flight.enemies.some(({ bubbled }) => bubbled)), { timeout: 6000 }).toBe(true);
  await letPlaneGo(page);
  await shot(page, 'sky-wings-l5-bubbled');
  const sinking = await page.evaluate(async () => {
    const { flight, sky } = window.__game;
    const enemy = flight.enemies.find(({ bubbled }) => bubbled);
    const from = enemy.y;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { state: enemy.state, fell: from - enemy.y, bubble: sky.planeFor(enemy).bubble.visible };
  });
  expect(sinking.state).toBe('falling');
  expect(sinking.bubble).toBe(true);
  expect(sinking.fell).toBeGreaterThan(0.5);
  expect(sinking.fell).toBeLessThan(8);
});

test('level 6: balloon pirates drift high up and never hunt, under a sunset', async ({ page }) => {
  await reachFlight(page, at(6, { planes: 3 }));
  expect(await page.evaluate(() => [window.__game.sky.weather, window.__game.sky.island.skyName])).toEqual(['sunset', 'sunset']);
  const balloon = await page.evaluate(() => {
    const { flight, sky } = window.__game;
    const enemy = flight.flying.find(({ kind }) => kind === 'balloon');
    return { above: enemy.y - flight.y, craft: sky.planeFor(enemy).constructor.name };
  });
  expect(balloon.above).toBeGreaterThan(10);
  expect(balloon.craft).toBe('BalloonCraft');
  await holdPlaneInFront(page, { kind: 'balloon', ahead: 95, across: -14, up: 10 });
  await expect(page.locator('.mark[data-kind="balloon"] .mark-name')).toHaveText('Balloon pirate');
  await page.waitForTimeout(300);
  await shot(page, 'sky-wings-l6-balloon');
  // However often the pirates turn to hunt, a balloon never does.
  await letPlaneGo(page);
  const hunted = await page.evaluate(async () => {
    const { flight } = window.__game;
    const kinds = new Set();
    for (let i = 0; i < 30; i += 1) {
      flight.huntIn = 0;
      for (const enemy of flight.flying) if (enemy.mode === 'hunt') kinds.add(enemy.kind);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    return [...kinds];
  });
  expect(hunted).not.toContain('balloon');
});

test('level 7: the snowflake shot slows a pirate down, and the shield bubble stops their shots', async ({ page }) => {
  await reachFlight(page, at(7, { planes: 3, level: 'medium' }));
  await giftAhead(page, 'snow');
  await expect.poll(() => powerNow(page), { timeout: 8000 }).toBe('snow');
  await holdPlaneInFront(page, { kind: 'pirate', ahead: 100, across: 10 });
  await expect.poll(() => page.evaluate(() => window.__game.flight.flying.some(({ slowLeft }) => slowLeft > 0)), { timeout: 6000 }).toBe(true);
  await expect(page.locator('.mark[data-slow="yes"]')).toHaveCount(1);
  await page.waitForTimeout(400);
  await shot(page, 'sky-wings-l7-snowflake');
  await letPlaneGo(page);

  await giftAhead(page, 'shield');
  await expect.poll(() => powerNow(page), { timeout: 8000 }).toBe('shield');
  await expect(page.locator('#power-name')).toHaveText('Shield bubble');
  const after = await page.evaluate(async () => {
    const { flight } = window.__game;
    const hearts = flight.hearts;
    const hurts = flight.stats.hurts;
    // A pirate's shot that would hit, arriving now.
    const [enemy] = flight.flying;
    for (let i = 0; i < 3; i += 1) {
      flight.shots.push({ mine: false, x: enemy.x, y: enemy.y, z: enemy.z, dx: 0, dy: 0, dz: 1, left: 0.02, hit: true });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    return { hearts: flight.hearts, was: hearts, blocked: flight.stats.blocked, hurts: flight.stats.hurts - hurts, shield: window.__game.sky.shield.visible };
  });
  expect(after.hearts).toBe(after.was);
  expect(after.blocked).toBe(3);
  expect(after.hurts).toBe(0);
  expect(after.shield).toBe(true);
  await shot(page, 'sky-wings-l7-shield');
});

test('level 8: pirates in pairs fly side by side, and the captain leaves a medal', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFlight(page, at(8, { planes: 6 }));
  expect(await page.evaluate(() => window.__game.flight.plan)).toEqual(['scout', 'lead', 'wing', 'balloon', 'pirate', 'captain']);
  // The pair in front, just outside the ring so it isn't dropped, named the first time it's seen, with
  // the wingman beside its leader.
  await page.evaluate(() => {
    for (const enemy of window.__game.flight.flying) enemy.hitsLeft = 1000;
  });
  await holdPlaneInFront(page, { kind: 'lead', ahead: 130, across: 45, others: false });
  await page.evaluate(() => {
    const { flight } = window.__game;
    window.__wing = setInterval(() => {
      const lead = flight.flying.find(({ kind }) => kind === 'lead');
      const wing = flight.flying.find(({ kind }) => kind === 'wing');
      if (lead && wing) Object.assign(wing, flight.wingSpot(lead), { heading: lead.heading });
      for (const other of flight.flying) {
        if (other === lead || other === wing) continue;
        other.x = flight.x - flight.forward.x * 700;
        other.z = flight.z - flight.forward.z * 700;
      }
    }, 16);
  });
  await expect(page.locator('.mark[data-named="yes"] .mark-name', { hasText: 'Pirate pair' })).toHaveCount(1);
  await page.waitForTimeout(400);
  await shot(page, 'sky-wings-l8-pair');
  await page.evaluate(() => clearInterval(window.__wing));
  await letPlaneGo(page);
  // Left to fly by themselves for a few seconds, the wingman stays beside its leader.
  await page.waitForTimeout(3500);
  const apart = await page.evaluate(() => {
    const { flight } = window.__game;
    const lead = flight.flying.find(({ kind }) => kind === 'lead');
    const wing = flight.flying.find(({ kind }) => kind === 'wing');
    return lead && wing ? Math.hypot(lead.x - wing.x, lead.z - wing.z) : null;
  });
  expect(apart).not.toBeNull();
  expect(apart).toBeLessThan(60);

  await waitForKind(page, 'captain');
  await holdPlaneInFront(page, { kind: 'captain', ahead: 120, across: 10 });
  await expect(page.locator('.mark[data-kind="captain"] .mark-name')).toHaveText('Captain');
  await page.waitForTimeout(400);
  await shot(page, 'sky-wings-l8-captain');
  await letPlaneGo(page);
  await dropAll(page);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-treasure .finish-treasure-item[data-kind="medal"]')).toHaveText('🏅1 medal');
});

test('level 9: a friend flies alongside and helps, in light snow', async ({ page }) => {
  await reachFlight(page, at(9, { planes: 6, fighter: 'kit' }));
  expect(await page.evaluate(() => [window.__game.sky.weather, window.__game.sky.snow.visible])).toEqual(['snow', true]);
  expect((await flightState(page)).enemies.filter(({ state }) => state === 'flying')).toHaveLength(4);
  await giftAhead(page, 'helper');
  await expect.poll(() => powerNow(page), { timeout: 8000 }).toBe('helper');
  await expect(page.locator('#power-name')).toHaveText('Giraffe helps!');
  await holdPlaneInFront(page, { ahead: 120, across: 8 });
  await expect.poll(async () => (await shotKinds(page)).includes('helper'), { timeout: 6000 }).toBe(true);
  const helper = await page.evaluate(() => {
    const { flight, sky } = window.__game;
    const pirates = window.__game.game.pirates.map(({ id }) => id);
    return { shown: sky.helperPlane.root.visible, who: sky.helperPlane.spec.id, beside: Math.hypot(flight.helper.x - flight.x, flight.helper.z - flight.z), pirates };
  });
  expect(helper).toMatchObject({ shown: true, who: 'giraffe' });
  expect(helper.beside).toBeLessThan(30);
  // Giraffe is helping, so he isn't one of the pirates, as he would be at level 1 flying as someone else.
  expect(helper.pirates).toHaveLength(6);
  expect(helper.pirates).not.toContain('giraffe');
  expect(helper.pirates).not.toContain('kit');
  await page.waitForTimeout(1200);
  await shot(page, 'sky-wings-l9-helper');
  await letPlaneGo(page);
});

test('level 10: the treasure airship, paper planes, and every prize on the finish card', async ({ page }) => {
  test.setTimeout(180_000);
  await reachFlight(page, at(10, { planes: 6 }));
  expect(await page.evaluate(() => window.__game.flight.plan)).toEqual(['scout', 'lead', 'wing', 'balloon', 'airship', 'captain']);
  await giftAhead(page, 'paper');
  await expect.poll(() => powerNow(page), { timeout: 8000 }).toBe('paper');
  await holdPlaneInFront(page, { ahead: 150, across: 20 });
  // Photographed just after one sets off, when it's near.
  await expect.poll(() => page.evaluate(() => {
    const { flight } = window.__game;
    return flight.shots.some(({ kind, x, z }) => kind === 'paper' && Math.hypot(x - flight.x, z - flight.z) > 20 && Math.hypot(x - flight.x, z - flight.z) < 45);
  }), { timeout: 6000, intervals: [30] }).toBe(true);
  await shot(page, 'sky-wings-l10-paper');
  await letPlaneGo(page);

  await waitForKind(page, 'airship');
  const airship = await page.evaluate(() => {
    const { flight, sky } = window.__game;
    const enemy = flight.flying.find(({ kind }) => kind === 'airship');
    return { hits: enemy.hitsTotal, usual: flight.enemyHits, craft: sky.planeFor(enemy).constructor.name };
  });
  expect(airship.hits).toBeGreaterThan(airship.usual);
  expect(airship.craft).toBe('AirshipCraft');
  await holdPlaneInFront(page, { kind: 'airship', ahead: 150, across: 15 });
  await expect(page.locator('.mark[data-kind="airship"] .mark-name')).toHaveText('Treasure airship');
  await page.waitForTimeout(400);
  await shot(page, 'sky-wings-l10-airship');
  await letPlaneGo(page);
  await dropKind(page, 'airship');
  await dropAll(page);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  const treasure = page.locator('#finish-treasure');
  for (const words of ['gold coins', '1 gem', '1 treasure chest', '1 medal', 'gift box']) await expect(treasure).toContainText(words);
  await page.waitForTimeout(800);
  await shot(page, 'sky-wings-l10-finish');
});

test('resting at level 10 is still never punished: the helper and paper planes hold fire too', async ({ page }) => {
  await reachFlight(page, at(10, { planes: 6, level: 'tough' }));
  await page.evaluate(() => window.__game.flight.startPower('helper'));
  const rest = await page.evaluate(async () => {
    const { flight, reader } = window.__game;
    reader.readWings = () => {
      reader.wings = { seen: true, out: false, span: 1, tilt: 0, height: 0, bank: 0, climb: 0 };
    };
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const before = { resting: flight.resting, shots: flight.stats.shots, hurts: flight.stats.hurts, left: flight.power?.left };
    flight.startPower('paper');
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return { before, shots: flight.stats.shots, hurts: flight.stats.hurts, mine: flight.shots.filter(({ mine }) => mine).length, left: flight.power?.left };
  });
  expect(rest.before.resting).toBe(true);
  expect(rest.hurts).toBe(rest.before.hurts);
  expect(rest.mine).toBe(0);
  // A power isn't used up while resting.
  expect(rest.left).toBeCloseTo(6, 0);
});

/** The picture's overall brightness, frame by frame. */
const brightness = (page, frames) => page.evaluate(async (count) => {
  const { sky } = window.__game;
  const reading = [];
  const small = document.createElement('canvas');
  small.width = 32;
  small.height = 18;
  const context = small.getContext('2d', { willReadFrequently: true });
  for (let i = 0; i < count; i += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    sky.render();
    context.drawImage(sky.canvas, 0, 0, 32, 18);
    const { data } = context.getImageData(0, 0, 32, 18);
    let total = 0;
    for (let j = 0; j < data.length; j += 4) total += (data[j] + data[j + 1] + data[j + 2]) / 3;
    reading.push(total / (32 * 18));
  }
  return reading;
}, frames);

const biggestStep = (reading) => Math.max(...reading.slice(1).map((value, index) => Math.abs(value - reading[index])));

for (const level of [6, 10]) {
  test(`level ${level}: nothing flashes, through every power, prize and gift box it has`, async ({ page }) => {
    test.setTimeout(180_000);
    await reachFlight(page, at(level, { planes: 9 }));
    // One pirate held in front the whole time, as the captain, which nothing can drop and a bubble
    // can't wrap, so that the test never makes a pirate jump into view: in play they fly in.
    await page.evaluate(() => {
      const [enemy] = window.__game.flight.flying;
      Object.assign(enemy, { kind: 'captain', captain: true, hitsLeft: 100_000, hitsTotal: 100_000 });
    });
    await holdPlaneInFront(page, { kind: 'captain', ahead: 70, across: 6 });
    const powers = await page.evaluate(() => window.__game.flight.levelRules.gifts);
    const steps = {};
    for (const power of powers) {
      await page.evaluate((kind) => {
        const { flight } = window.__game;
        // Well clear of the ground, so the plane isn't pulling up while it's measured.
        flight.y = Math.max(flight.y, 170);
        flight.startPower(kind);
        // A gift box in view as well, and a prize on its way.
        flight.gift = null;
        flight.placeGift('triple');
        flight.giftIn = 100;
      }, power);
      // One that isn't being held, so that nothing jumps into view: its prize flies in from behind.
      await page.evaluate(() => {
        const { flight } = window.__game;
        const enemy = flight.flying.find(({ captain }) => !captain);
        while (enemy?.state === 'flying') flight.hit(enemy);
      });
      steps[power] = biggestStep(await brightness(page, 45));
    }
    await shot(page, `sky-wings-l${level}-safety`);
    await letPlaneGo(page);
    console.log(`level ${level}: biggest brightness step by power`, JSON.stringify(steps));
    for (const [power, step] of Object.entries(steps)) expect(step, power).toBeLessThan(25);
    // Prizes were on their way, or caught, the whole time.
    expect(await page.evaluate(() => {
      const { flight } = window.__game;
      return flight.prizes.length + Object.values(flight.stats.prizes).reduce((sum, count) => sum + count, 0);
    })).toBeGreaterThanOrEqual(2);
  });
}

/* ---------- what review found ---------- */

/**
 * The game's own loop waits, and the flight and the sky are stepped at exactly 60 frames a second, high
 * over the island with the pirates far behind, so what's measured is only what a test does.
 */
const stillSky = (page) => page.evaluate(() => {
  const { flight, game } = window.__game;
  game.paused = true;
  for (const enemy of flight.enemies) {
    enemy.x = flight.x - flight.forward.x * 900;
    enemy.z = flight.z - flight.forward.z * 900;
  }
  flight.y = 200;
  flight.huntIn = 1000;
  flight.giftIn = 1000;
});

for (const reduced of [false, true]) {
  test(`level 7: a shot stopped by the shield bubble is a few small sparkles, and the brightness stays steady${reduced ? ', with reduced motion' : ''}`, async ({ page }) => {
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    await reachFlight(page, at(7, { planes: 3, level: 'medium' }));
    await measureBlocks(page);
    await stillSky(page);
    const seen = await page.evaluate(() => {
      const { flight, sky, game } = window.__game;
      flight.startPower('shield');
      flight.power.left = 100;
      let last = null;
      let step = 0;
      let changed = 0;
      for (let i = 0; i < 150; i += 1) {
        // A pirate's shot that would have hit, every so often.
        if (i > 30 && i % 25 === 0) {
          const [enemy] = flight.flying;
          flight.shots.push({ mine: false, x: enemy.x, y: enemy.y, z: enemy.z, dx: 0, dy: 0, dz: 1, left: 0.01, hit: true });
        }
        flight.update(1 / 60, { out: true, bank: 0, climb: 0 });
        sky.update(1 / 60);
        sky.render();
        const blocks = window.__blocks(sky.canvas);
        const mean = blocks.reduce((sum, value) => sum + value, 0) / blocks.length;
        if (last) {
          step = Math.max(step, Math.abs(mean - last.mean));
          changed = Math.max(changed, blocks.filter((value, index) => Math.abs(value - last.blocks[index]) > 20).length);
        }
        last = { blocks, mean };
      }
      game.paused = false;
      return { blocked: flight.stats.blocked, hearts: flight.hearts, step, changed };
    });
    console.log(`level 7: shots stopped by the shield${reduced ? ', reduced motion' : ''}`, JSON.stringify(seen));
    expect(seen.blocked).toBe(4);
    expect(seen.hearts).toBe(5);
    // Before, each stopped shot was a big ring the camera flew into: the brightness went up by 15 and
    // down again in a frame, with a third of the picture changing at once.
    expect(seen.step).toBeLessThan(5);
    expect(seen.changed).toBeLessThan(58);
  });
}

test('level 9: flying through the snow, a flake is never more than a dot: the snow never changes any part of the picture\'s brightness by much', async ({ page }) => {
  await reachFlight(page, at(9, { planes: 3 }));
  await measureBlocks(page);
  await stillSky(page);
  const seen = await page.evaluate(() => {
    const { flight, sky, game } = window.__game;
    // Some flakes right where the camera is going, as it does fly through some.
    sky.update(1 / 60);
    const positions = sky.snow.geometry.attributes.position;
    const { eye, forward } = flight.view;
    for (let i = 0; i < 40; i += 1) {
      const ahead = 6 + i * 4;
      positions.setXYZ(i, eye.x + forward.x * ahead + ((i % 3) - 1) * 0.8, eye.y + forward.y * ahead + ((i % 2) - 0.5) * 0.8, eye.z + forward.z * ahead);
    }
    positions.needsUpdate = true;
    let most = 0;
    let step = 0;
    let last = null;
    for (let i = 0; i < 90; i += 1) {
      flight.update(1 / 60, { out: true, bank: 0, climb: 0 });
      sky.update(1 / 60);
      sky.render();
      const snowing = window.__blocks(sky.canvas);
      sky.snow.visible = false;
      sky.render();
      const clear = window.__blocks(sky.canvas);
      sky.snow.visible = true;
      most = Math.max(most, ...snowing.map((value, index) => Math.abs(value - clear[index])));
      const mean = snowing.reduce((sum, value) => sum + value, 0) / snowing.length;
      if (last !== null) step = Math.max(step, Math.abs(mean - last));
      last = mean;
    }
    game.paused = false;
    return { most, step };
  });
  console.log('level 9: flying through snow', JSON.stringify(seen));
  // Before, a flake near the camera was a white square well over a hundred pixels across.
  expect(seen.most).toBeLessThan(6);
  expect(seen.step).toBeLessThan(5);
  await shot(page, 'sky-wings-l9-snow');
});

test('the cards only promise what the planes to drop bring: with three, a pair and a captain, but never four at once', async ({ page }) => {
  await openSky(page, at(9, { planes: 3 }));
  const chipsNow = () => chips(page);
  expect(await chipsNow()).not.toContain('4️⃣Four at once');
  expect(await chipsNow()).toContain('🌨️Light snow');
  await page.locator('#open-panel').click();
  await page.locator('input[name="planes"][value="6"]').check();
  await page.locator('#close-panel').click();
  expect(await chipsNow()).toContain('4️⃣Four at once');
  await page.locator('#open-panel').click();
  await page.locator('input[name="planes"][value="3"]').check();
  await page.locator('#level-choice input[value="8"]').check();
  await page.locator('#close-panel').click();
  expect(await chipsNow()).toEqual(['👑Pirate captain', '👥Pirate pairs']);
  // And they really come, with three planes to drop.
  await armsAndFly(page);
  expect(await page.evaluate(() => window.__game.flight.plan)).toEqual(['lead', 'wing', 'captain']);
});

/** From the title, with the settings already chosen, to flying. */
async function armsAndFly(page) {
  await page.evaluate(() => window.__camera.showFootage('wings', { from: 4, playing: false }));
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#fly-start').click();
  await waitForScreen(page, 'lesson');
  await page.locator('#lesson-skip').click();
  await waitForScreen(page, 'fly');
}

test('level 9 in Georgian: the friend who helps is named in Georgian', async ({ page }) => {
  await reachFlight(page, at(9, { planes: 6, fighter: 'kit', language: 'ka' }));
  await page.evaluate(() => window.__game.flight.startPower('helper'));
  await expect(page.locator('#power-name')).toHaveText('ჟირაფი გეხმარება!');
});

test('level 10: the treasure airship goes down gently with its pilot aboard: no smoke and no parachute', async ({ page }) => {
  await reachFlight(page, at(10, { planes: 3 }));
  const seen = await page.evaluate(() => {
    const { flight, sky } = window.__game;
    const airship = flight.flying.find(({ kind }) => kind === 'airship');
    const chutes = sky.chutes.length;
    const puffs = sky.sparks.items.filter(({ life }) => life > 0).length;
    while (airship.state === 'flying') flight.hit(airship);
    return { chutes: sky.chutes.length - chutes, puffs: sky.sparks.items.filter(({ life, sprite }) => life > 0 && sprite.material.color.getHexString() === '6b6560').length, before: puffs };
  });
  expect(seen.chutes).toBe(0);
  expect(seen.puffs).toBe(0);
});

test('parachutes that have come down go with their pilots, and what they were made of is let go', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFlight(page, at(1, { planes: 6 }));
  await page.evaluate(() => {
    const { flight } = window.__game;
    flight.flying.slice(0, 3).forEach((enemy) => {
      while (enemy.state === 'flying') flight.hit(enemy);
    });
  });
  await expect.poll(() => page.evaluate(() => window.__game.sky.chutes.length)).toBe(3);
  // Listens for each canopy, and each pilot's body, being let go.
  const parts = await page.evaluate(() => {
    window.__letGo = new Set();
    const geometries = new Set();
    for (const chute of window.__game.sky.chutes) {
      geometries.add(chute.canopy.geometry);
      chute.pilot.root.traverse((node) => {
        if (node.geometry) geometries.add(node.geometry);
      });
    }
    for (const geometry of geometries) geometry.addEventListener('dispose', () => window.__letGo.add(geometry.uuid));
    return geometries.size;
  });
  await expect.poll(() => page.evaluate(() => window.__game.sky.chutes.length), { timeout: 15_000 }).toBe(0);
  expect(await page.evaluate(() => window.__letGo.size)).toBe(parts);
});

test('losing tidies up as winning does: the friend stops helping, the gift box goes, and prizes on their way are counted', async ({ page }) => {
  await reachFlight(page, at(9, { planes: 6, level: 'medium' }));
  await page.evaluate(() => {
    const { flight } = window.__game;
    flight.startPower('helper');
    flight.gift = null;
    flight.placeGift('triple');
    const [enemy] = flight.flying;
    while (enemy.state === 'flying') flight.hit(enemy);
    flight.hearts = 1;
    flight.shots.push({ mine: false, x: flight.x, y: flight.y, z: flight.z, dx: 0, dy: 0, dz: 1, left: 0.01, hit: true });
  });
  await waitForScreen(page, 'finishing');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => {
    const { flight, sky } = window.__game;
    return {
      helper: sky.helperPlane.root.visible,
      gift: Object.values(sky.gifts).some(({ visible }) => visible),
      firing: flight.shots.filter(({ kind }) => kind === 'helper').length,
      prizes: Object.values(flight.stats.prizes).reduce((sum, count) => sum + count, 0),
    };
  });
  expect(after).toEqual({ helper: false, gift: false, firing: 0, prizes: 1 });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-treasure')).toContainText('1 gem');
});
