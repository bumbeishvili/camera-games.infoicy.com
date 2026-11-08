// Spider Catcher's new things, level by level, with real photos going through the real tracker: berries
// left where a spider was caught, the ladybird and her flower, sleepy spiders, the butterfly, the basket
// for two, treasure chests, two webs, leaf boats and the golden spider, the berry tally and the "New:" chips.
import { expect, openGame, screenName, shot, show, test, waitForScreen } from '../helpers.js';
import { atLevel, moveGloveTo, startPlaying, stopMoving, storyIs } from '../story-games/helpers.js';
import { GAME, GLOVE, garden, handIs, holdStill } from './helpers.js';

const extras = (page) => page.evaluate(() => {
  const { garden: place } = window.__game;
  const { basket, chest, butterfly } = place.helpers;
  return {
    berries: place.berries.length,
    picked: place.berryTotal,
    ladybirds: place.ladybirds.left + place.ladybirds.right,
    basket: basket?.state ?? null,
    chest: chest?.state ?? null,
    butterfly: butterfly?.state ?? null,
    slow: place.slow,
    holds: place.catching.holds,
    carried: place.catching.carried.length,
    webs: place.webs.length,
    glow: place.webGlow?.index ?? null,
    labels: place.labels.map(({ key }) => key),
  };
});

/** On to the place at this index, by bringing everyone home at the places before it. */
async function goToPlace(page, index) {
  for (let at = 0; at < index; at += 1) {
    await expect.poll(async () => (await garden(page)).index, { timeout: 30_000 }).toBe(at);
    await page.evaluate(() => {
      const { gathering } = window.__game;
      while (gathering.home < gathering.place.count) gathering.spiderHome();
    });
  }
  await expect.poll(async () => (await garden(page)).index, { timeout: 30_000 }).toBe(index);
  await expect.poll(() => page.evaluate(() => window.__game.garden.moving), { timeout: 10_000 }).toBe(0);
}

/**
 * Where the spider a test wants is, by name, as the page's security policy doesn't let a test hand it
 * code to run: 'playing' is any out playing, 'single' one that isn't a twin, and the others by kind.
 */
const spiderAtNamed = (page, which) => page.evaluate((name) => {
  const { garden: place } = window.__game;
  const tests = {
    playing: (spider) => spider.state === 'playing' && !spider.sleepy,
    single: (spider) => spider.state === 'playing' && spider.pair === null,
    asleep: (spider) => spider.state === 'asleep',
    ladybird: (spider) => spider.kind === 'ladybird' && spider.state === 'playing',
    boat: (spider) => spider.kind === 'boat' && spider.state === 'playing',
    golden: (spider) => spider.golden && spider.state === 'playing',
  };
  const index = place.spiders.findIndex(tests[name]);
  if (index < 0) return null;
  const spider = place.spiders[index];
  const glove = place.gloves.right;
  return { index, x: spider.x, y: spider.y, width: place.width, height: place.height, gap: glove.visible ? Math.hypot(spider.x - glove.x, spider.y - glove.y) / place.catchReach : Infinity };
}, which);

/**
 * An open real hand onto the spider a test wants, held still. Nobody is shy, as that's tested elsewhere.
 * When it has to be that one, any others close by are moved a little way to the side, so it's the nearest.
 */
async function openOn(page, which) {
  await expect.poll(() => spiderAtNamed(page, which), { timeout: 15_000 }).not.toBeNull();
  await holdStill(page);
  // Held still, they jump to a new spot on the next frame, so that's where to go.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const exact = !['playing', 'single'].includes(which);
  // It may have just been caught, gone home or be landing, so it's asked for until there's one to go to.
  let found = null;
  await expect.poll(async () => {
    found = await spiderAtNamed(page, which);
    return found;
  }, { timeout: 15_000 }).not.toBeNull();
  const { index, x, y, width, height } = found;
  await page.evaluate(({ at, aside }) => {
    const { garden: place } = window.__game;
    const target = place.spiders[at];
    for (const spider of place.spiders) {
      spider.shy = false;
      if (!aside || spider === target || ['held', 'home', 'landing'].includes(spider.state)) continue;
      if (Math.hypot(spider.x - target.x, spider.y - target.y) < place.catchReach * 2.2) {
        spider.shift.x += (spider.x < target.x ? -0.14 : 0.14) * place.way;
      }
    }
  }, { at: index, aside: exact });
  await moveGloveTo(page, GLOVE, x / width, y / height);
  await expect.poll(() => page.evaluate(({ at, exact }) => {
    const { garden: place } = window.__game;
    const spider = place.spiders[at];
    const glove = place.gloves.right;
    return glove.visible && window.__game.monitor.snapshot.right.status === 'open'
      && Math.hypot(spider.x - glove.x, spider.y - glove.y) < place.catchReach * 0.8
      && (!exact || spider.state !== 'playing' || place.spiderNear(glove) === spider);
  }, { at: index, exact }), { timeout: 20_000 }).toBe(true);
}

/** Closes the real hand where it is, and waits for whatever's there to be caught into the hand. */
async function closeAndCatch(page) {
  await handIs(page, 'fist');
  await expect.poll(() => page.evaluate(() => Boolean(window.__game.garden.catching.held)), { timeout: 15_000 }).toBe(true);
}

/**
 * Carries what's held, in a closed real hand, to where it goes: 'home' is its own web or the ladybird's
 * flower, and 'other' the other of two webs. The hand keeps following it, as a web can sway, and opens
 * once it's there.
 */
async function carryTo(page, where, { open = true } = {}) {
  await page.evaluate((target) => {
    window.__move?.stop();
    window.__steadySince = null;
    window.__spot = null;
    let x = window.__move?.offsetX ?? 0;
    let y = window.__move?.offsetY ?? 0;
    const timer = setInterval(() => {
      const { garden: place } = window.__game;
      const glove = place.gloves.right;
      const carried = place.holding;
      if (glove.visible && carried) {
        const own = carried.kind === 'ladybird' ? place.flower : place.webOf(carried);
        const spot = target === 'other' ? place.webs.find((web) => web.index !== own.index) : own;
        // Gently, so it doesn't swing past.
        x += ((spot.x - glove.x) / innerWidth) * 1280 * 0.05;
        y += ((spot.y - glove.y) / innerHeight) * 720 * 0.05;
        window.__spot = spot;
        const there = Math.hypot(glove.x - spot.x, glove.y - spot.y) < spot.reach * 0.5;
        window.__steadySince = there ? (window.__steadySince ?? performance.now()) : null;
      }
      window.__move = { offsetX: x, offsetY: y, stop: () => clearInterval(timer) };
      window.__camera.show({ left: null, right: 'fist', scale: 0.7, rightOffsetX: x, rightOffsetY: y });
    }, 33);
    window.__move = { offsetX: x, offsetY: y, stop: () => clearInterval(timer) };
  }, where);
  // There, and staying there for a moment, as a hand that's still on its way would open past it.
  await expect.poll(() => page.evaluate(() => Boolean(window.__game.garden.holding && window.__steadySince
    && performance.now() - window.__steadySince > 700)), { timeout: 40_000 }).toBe(true);
  if (open) await handIs(page, 'open');
}

/* ---------- the chips ---------- */

test('level 1\'s title card has nothing new on it', async ({ page }) => {
  await openGame(page, atLevel(GAME, 1), GAME);
  await expect(page.locator('#level-new')).toBeEmpty();
});

for (const [level, words] of [[2, ['Berries']], [5, ['Butterfly', 'Shy spiders']], [8, ['Two webs']], [10, ['Golden spider']]]) {
  test(`level ${level}'s title card and countdown show what's new`, async ({ page }) => {
    await openGame(page, atLevel(GAME, level), GAME);
    for (const word of words) await expect(page.locator('#level-new')).toContainText(word);
    if (level === 5) await shot(page, 'spider-new-title-5');
    await show(page, null, 'open', { scale: 0.7 });
    await page.locator('#start').click();
    // The countdown is over in a moment, so its chips are read as soon as it has started, or after.
    await expect.poll(() => screenName(page), { timeout: 60_000, intervals: [100] }).toMatch(/countdown|playing/);
    for (const word of words) await expect(page.locator('#level-new-now')).toContainText(word);
  });
}

/* ---------- level by level ---------- */

test('level 2: a spider caught leaves a berry, picked up when the hand comes back by it, and counted', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 2));
  await storyIs(page, 'joze');
  await expect(page.locator('.chip-berries')).toBeVisible();
  await openOn(page, 'playing');
  await closeAndCatch(page);
  await expect.poll(async () => (await extras(page)).berries, { timeout: 5000 }).toBe(1);
  // Not picked up by the hand that's still there.
  await page.waitForTimeout(800);
  expect((await extras(page)).picked).toBe(0);
  await page.waitForTimeout(400);
  await shot(page, 'spider-new-berry');
  const berry = await page.evaluate(() => ({ x: window.__game.garden.berries[0].x, y: window.__game.garden.berries[0].y }));
  // Off to the web with the spider, and back by the berry.
  await carryTo(page, 'home');
  await expect.poll(async () => (await garden(page)).home, { timeout: 15_000 }).toBe(1);
  const { width, height } = await garden(page);
  await moveGloveTo(page, GLOVE, berry.x / width, berry.y / height);
  await expect.poll(async () => (await extras(page)).picked, { timeout: 30_000 }).toBe(1);
  await stopMoving(page);
  await expect(page.locator('#chip-berries')).toHaveText('1');
  await page.evaluate(() => {
    const { gathering } = window.__game;
    while (!gathering.over) {
      while (gathering.home < gathering.place.count) gathering.spiderHome();
      gathering.nextPlace();
    }
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#sum-right-berries')).toHaveText('1');
  await expect(page.locator('#finish-prizes')).toContainText('🍓 1');
  await expect(page.locator('#level-next-new')).toContainText('Ladybird');
  await page.waitForTimeout(700);
  await shot(page, 'spider-new-finish');
});

test('level 3: a ladybird plays at the carrots, and goes home to her flower, not the web', async ({ page }) => {
  test.setTimeout(200_000);
  await startPlaying(page, GAME, atLevel(GAME, 3));
  await goToPlace(page, 1);
  await storyIs(page, 'mochi');
  await expect.poll(() => page.evaluate(() => window.__game.garden.spiders.some(({ kind }) => kind === 'ladybird')), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(500);
  await shot(page, 'spider-new-ladybird');
  await openOn(page, 'ladybird');
  await closeAndCatch(page);
  expect(await page.evaluate(() => window.__game.garden.holding.kind)).toBe('ladybird');
  // Opened at the web, she just goes back to playing.
  const web = await page.evaluate(() => window.__game.garden.web);
  const size = await garden(page);
  await moveGloveTo(page, GLOVE, web.x / size.width, web.y / size.height, { right: 'fist' });
  await expect.poll(() => page.evaluate(() => {
    const { garden: place } = window.__game;
    return place.atHome(place.web);
  }), { timeout: 30_000 }).toBe(true);
  await handIs(page, 'open');
  await expect.poll(async () => (await garden(page)).letGo, { timeout: 15_000 }).toBe(1);
  expect((await extras(page)).ladybirds).toBe(0);
  // Caught again, and opened at her flower, she's home.
  await openOn(page, 'ladybird');
  await closeAndCatch(page);
  await carryTo(page, 'home', { open: false });
  await shot(page, 'spider-new-ladybird-flower');
  await handIs(page, 'open');
  await expect.poll(async () => (await extras(page)).ladybirds, { timeout: 15_000 }).toBe(1);
  expect((await garden(page)).home).toBeGreaterThanOrEqual(4);
});

test('level 4: a sleepy spider can\'t be caught until an open hand held by it wakes it', async ({ page }) => {
  test.setTimeout(200_000);
  await startPlaying(page, GAME, atLevel(GAME, 4));
  await storyIs(page, 'joze');
  // The hand down out of the way, and the second one out asleep, the way the level brings them.
  await moveGloveTo(page, GLOVE, 0.3, 0.9);
  await expect.poll(() => page.evaluate(() => {
    const { garden: place } = window.__game;
    return place.gloves.right.visible && place.gloves.right.y > place.height * 0.8 && place.spiders.length > 1;
  }), { timeout: 20_000 }).toBe(true);
  await page.evaluate(() => {
    const { garden: place } = window.__game;
    place.spiders.forEach((spider, index) => Object.assign(spider, index === 1
      ? { state: 'asleep', asleepFor: -60, waking: 0, sleepy: true, shy: false }
      : { state: spider.state === 'asleep' ? 'playing' : spider.state, sleepy: false }));
  });
  await page.waitForTimeout(600);
  await shot(page, 'spider-new-sleepy');
  expect(await page.evaluate(() => window.__game.garden.catchable(window.__game.garden.spiders[1]))).toBe(false);
  await openOn(page, 'asleep');
  // Woken, it plays on from where it is, so the hand that woke it can close on it straight away.
  await expect.poll(() => page.evaluate(() => window.__game.garden.spiders[1].state), { timeout: 10_000 }).toBe('playing');
  await closeAndCatch(page);
  expect(await page.evaluate(() => window.__game.garden.spiders.indexOf(window.__game.garden.catching.held))).toBe(1);
  // And one left alone wakes by itself.
  await page.evaluate(() => {
    const spider = window.__game.garden.spiders[0];
    Object.assign(spider, { state: 'asleep', asleepFor: 11.5, waking: 0 });
  });
  await expect.poll(() => page.evaluate(() => window.__game.garden.spiders[0].state), { timeout: 5000 }).not.toBe('asleep');
});

test('level 5: the butterfly comes, and touched, the spiders slow right down to watch it for a while', async ({ page }) => {
  test.setTimeout(200_000);
  await startPlaying(page, GAME, atLevel(GAME, 5));
  await storyIs(page, 'joze');
  await moveGloveTo(page, GLOVE, 0.5, 0.3);
  await expect.poll(async () => (await extras(page)).butterfly, { timeout: 15_000 }).toBe('resting');
  await stopMoving(page);
  await page.waitForTimeout(300);
  await shot(page, 'spider-new-butterfly-resting');
  const spot = await page.evaluate(() => {
    const { garden: place } = window.__game;
    return { x: place.helpers.butterfly.x / place.width, y: place.helpers.butterfly.y / place.height };
  });
  await moveGloveTo(page, GLOVE, spot.x, spot.y);
  await expect.poll(async () => (await extras(page)).butterfly, { timeout: 30_000 }).toBe('helping');
  await stopMoving(page);
  const rate = await page.evaluate(async () => {
    const { garden: place } = window.__game;
    const [time, play] = [place.time, place.playTime];
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return (place.playTime - play) / (place.time - time);
  });
  expect(rate).toBeCloseTo(0.45, 2);
  await page.waitForTimeout(800);
  await shot(page, 'spider-new-butterfly-helping');
  // It flies off after a while, and the spiders go back to their speed.
  await page.evaluate(() => {
    const { butterfly } = window.__game.garden.helpers;
    if (butterfly?.state === 'helping') butterfly.left = 0.2;
  });
  await expect.poll(async () => (await extras(page)).slow, { timeout: 15_000 }).toBe(1);
});

test('level 6: the basket carries two at once, and both go into the web together', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 6));
  await storyIs(page, 'joze');
  await expect.poll(async () => (await extras(page)).basket, { timeout: 10_000 }).toBe('waiting');
  await page.waitForTimeout(300);
  await shot(page, 'spider-new-basket');
  const at = await page.evaluate(() => {
    const { garden: place } = window.__game;
    return { x: place.helpers.basket.x / place.width, y: place.helpers.basket.y / place.height };
  });
  await moveGloveTo(page, GLOVE, at.x, at.y);
  await expect.poll(async () => (await extras(page)).basket, { timeout: 30_000 }).toBe('carried');
  expect((await extras(page)).holds).toBe(2);
  await openOn(page, 'playing');
  await closeAndCatch(page);
  // Opened away from the web, it goes in the basket.
  await handIs(page, 'open');
  await expect.poll(async () => (await extras(page)).carried, { timeout: 10_000 }).toBe(1);
  expect((await garden(page)).letGo).toBe(0);
  await openOn(page, 'playing');
  await closeAndCatch(page);
  expect((await extras(page)).carried).toBe(2);
  await shot(page, 'spider-new-basket-two');
  await carryTo(page, 'home');
  await expect.poll(async () => (await garden(page)).home, { timeout: 15_000 }).toBe(2);
  expect((await garden(page)).letGo).toBe(0);
});

test('level 7: a treasure chest at the carrots opens under an open hand held on it, and its berries are picked up', async ({ page }) => {
  test.setTimeout(200_000);
  await startPlaying(page, GAME, atLevel(GAME, 7));
  await goToPlace(page, 1);
  await expect.poll(async () => (await extras(page)).chest, { timeout: 10_000 }).toBe('waiting');
  await page.waitForTimeout(400);
  await shot(page, 'spider-new-chest');
  const at = await page.evaluate(() => {
    const { garden: place } = window.__game;
    return { x: place.helpers.chest.x / place.width, y: place.helpers.chest.y / place.height };
  });
  await moveGloveTo(page, GLOVE, at.x, at.y - 0.03);
  await expect.poll(async () => (await extras(page)).chest, { timeout: 30_000 }).toBe('open');
  await page.waitForTimeout(250);
  await shot(page, 'spider-new-chest-open');
  await expect.poll(async () => (await extras(page)).picked, { timeout: 15_000 }).toBe(4);
});

test('level 8: two webs, and each spider goes to the web of its colour; the wrong one just lets it go', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 8));
  await storyIs(page, 'joze');
  expect((await extras(page)).webs).toBe(2);
  await page.waitForTimeout(500);
  await shot(page, 'spider-new-two-webs');
  await openOn(page, 'single');
  await closeAndCatch(page);
  const right = await page.evaluate(() => window.__game.garden.webOf(window.__game.garden.holding));
  await carryTo(page, 'other');
  // The hand is moved there a little at a time, which a busy computer slows down.
  await expect.poll(async () => (await garden(page)).letGo, { timeout: 30_000 }).toBe(1);
  expect((await extras(page)).glow).toBe(right.index);
  await shot(page, 'spider-new-wrong-web');
  expect((await garden(page)).home).toBe(0);
  await openOn(page, 'single');
  await closeAndCatch(page);
  await carryTo(page, 'home');
  await expect.poll(async () => (await garden(page)).home, { timeout: 15_000 }).toBe(1);
});

test('level 9: a spider sails about on a leaf boat, and can be caught off it', async ({ page }) => {
  test.setTimeout(200_000);
  await startPlaying(page, GAME, atLevel(GAME, 9));
  await storyIs(page, 'joze');
  await expect.poll(() => page.evaluate(() => window.__game.garden.spiders.some(({ kind }) => kind === 'boat')), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(600);
  await shot(page, 'spider-new-boat');
  await page.evaluate(() => {
    for (const spider of window.__game.garden.spiders) spider.shy = false;
  });
  await openOn(page, 'boat');
  await closeAndCatch(page);
  expect(await page.evaluate(() => window.__game.garden.holding.kind)).toBe('boat');
});

test('level 10: the golden spider brings a shower of berries home, which are picked up at the web', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'joze');
  await expect.poll(() => page.evaluate(() => window.__game.garden.spiders.some(({ golden }) => golden)), { timeout: 15_000 }).toBe(true);
  await page.evaluate(() => {
    for (const spider of window.__game.garden.spiders) Object.assign(spider, { shy: false });
    const golden = window.__game.garden.spiders.find(({ golden: gold }) => gold);
    if (golden.state === 'asleep') golden.state = 'playing';
  });
  await page.waitForTimeout(500);
  await shot(page, 'spider-new-golden');
  await openOn(page, 'golden');
  await closeAndCatch(page);
  await carryTo(page, 'home');
  await expect.poll(async () => (await garden(page)).home, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(250);
  await shot(page, 'spider-new-golden-home');
  // Its berries, and the one the catch left behind if the hand passes it.
  await expect.poll(async () => (await extras(page)).picked, { timeout: 15_000 }).toBeGreaterThanOrEqual(5);
});

test('berries nobody picks up fade when Joze moves on, and cost nothing', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, atLevel(GAME, 2));
  await storyIs(page, 'joze');
  await show(page, null, null);
  await page.evaluate(() => {
    const { garden: place } = window.__game;
    place.dropBerry(place.width * 0.7, place.height * 0.6, { armed: true });
  });
  await page.evaluate(() => {
    const { gathering } = window.__game;
    while (gathering.home < gathering.place.count) gathering.spiderHome();
  });
  await expect.poll(async () => (await extras(page)).berries, { timeout: 10_000 }).toBe(0);
  expect((await extras(page)).picked).toBe(0);
  expect((await garden(page)).home).toBe(3);
});
