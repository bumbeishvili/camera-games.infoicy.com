// Joze's Long Walk Home's levels, with real photos going through the real tracker: what each level
// brings that's new, golden fruit, butterflies leaving flowers, green fruit, the basket, the monkey,
// the bridge, frosty fruit, fireflies and the parrot, and still all the way home, with nothing flashing.
import { expect, hands, openGame, show, shot, test, waitForScreen } from '../helpers.js';
import { atLevel, judgeBrightness, moveGloveTo, startPlaying, stopMoving, storyIs, watchBrightness } from './helpers.js';

const GAME = 'joze-walk';
const GLOVE = ['walk', 'gloves', 'right'];
const CANVASES = ['backdrop', 'joze-stage', 'game'];
const tree = (page) => page.evaluate(() => {
  const { walk, journey } = window.__game;
  const share = (thing) => (thing ? { x: thing.x / walk.width, y: thing.y / walk.height } : null);
  return {
    index: journey.index,
    place: journey.stop?.place ?? null,
    count: journey.stop?.count ?? null,
    fed: journey.stats.fed,
    stats: { ...journey.stats },
    gifts: journey.gifts,
    holding: walk.holding?.kind ?? (walk.holding ? 'fruit' : null),
    extra: Boolean(walk.extra),
    basket: walk.basket,
    walking: walk.walking,
    fruit: walk.fruit.map((fruit) => ({
      ...share(fruit),
      homeX: fruit.homeX / walk.width,
      ripe: fruit.ripe,
      golden: fruit.golden,
      frost: fruit.frost,
      warmth: fruit.warmth ?? 0,
      state: fruit.state,
      wiggle: fruit.wiggle,
      pickable: walk.pickable(fruit),
    })),
    items: walk.items.map((item) => ({ kind: item.kind, state: item.state, ...share(item) })),
    gifted: walk.gifts.map((gift) => ({ kind: gift.kind, ...share(gift) })),
    flies: walk.flies.map((fly) => ({ caught: fly.caught, ...share(fly) })),
    butterfly: walk.butterfly ? { at: walk.fruit.indexOf(walk.butterfly.fruit), leaving: walk.butterfly.leaving } : null,
    monkey: walk.monkey ? { state: walk.monkey.state, at: walk.fruit.indexOf(walk.monkey.fruit) } : null,
    parrot: walk.parrot ? walk.parrot.state : null,
    bridge: walk.bridge ? { ...walk.bridge, gap: { x: walk.gap.x / walk.width, y: walk.gap.y / walk.height } } : null,
    mouth: { x: walk.mouth.x / walk.width, y: walk.mouth.y / walk.height },
    labels: walk.labels.map(({ key }) => key),
    introduced: [...walk.introduced],
  };
});

/** The real hand's picture, where it is now, open or closed. */
const handIs = (page, photo) => page.evaluate((which) => {
  window.__move?.stop();
  const { offsetX = 0, offsetY = 0 } = window.__move ?? {};
  window.__camera.show({ left: null, right: which, scale: 0.7, rightOffsetX: offsetX, rightOffsetY: offsetY });
}, photo);

/** Keeps the real open hand on something as it moves, until it's close enough to pick. */
async function reach(page, find, { timeout = 60_000 } = {}) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const state = await tree(page);
    const thing = find(state);
    if (!thing) throw new Error('nothing to reach');
    await moveGloveTo(page, GLOVE, thing.x, thing.y);
    await page.waitForTimeout(500);
    const near = await page.evaluate(({ x, y }) => {
      const { walk } = window.__game;
      const glove = walk.gloves.right;
      return glove.visible && Math.hypot(glove.x - x * walk.width, glove.y - y * walk.height) <= walk.palmSize * 0.9;
    }, find(await tree(page)));
    if (near) return;
  }
  throw new Error('never got there');
}

/** Closes the real hand where it is, carries what it has to a place, and opens it there. */
async function carryTo(page, at, isThere) {
  await moveGloveTo(page, GLOVE, at.x, at.y, { right: 'fist' });
  await expect.poll(() => page.evaluate(isThere), { timeout: 30_000 }).toBe(true);
  await handIs(page, 'open');
}

/** Picks a fruit with the real hand and feeds it to Joze. */
async function feedOne(page, find) {
  await reach(page, find);
  await handIs(page, 'fist');
  await expect.poll(async () => (await tree(page)).holding, { timeout: 15_000 }).not.toBeNull();
  const { mouth } = await tree(page);
  await carryTo(page, mouth, () => window.__game.walk.onMouth);
}

/** Feeds Joze through the rules, and mends any bridge, until he's at a stop. */
async function skipTo(page, index) {
  for (;;) {
    const state = await tree(page);
    if (state.index === index && state.walking === 0) break;
    await page.evaluate((target) => {
      const { journey, walk } = window.__game;
      // Never the stop it's going to, however late this runs.
      if (!journey.stop || journey.index >= target || walk.walking > 0 || !walk.fruit.length) return;
      if (walk.bridge) walk.bridge.fixed = true;
      journey.fixBridge();
      while (journey.wanted) journey.feed();
    }, index);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(600);
}

test('every level from 2 lists what\'s new on the title card, and as coming up', async ({ page }) => {
  const expected = {
    2: '🌟Golden fruit',
    3: '🍃Windy branches🦋Butterflies',
    4: '🍏Green fruit',
    5: '🧺Basket',
    6: '🐒Cheeky monkey',
    7: '🌉Broken bridge',
    8: '❄️Frosty fruit',
    9: '✨Fireflies',
    10: '🦜Parrot helper',
  };
  await startPlaying(page, GAME, atLevel(GAME, 1));
  await expect(page.locator('#chip-gifts-box')).toBeHidden();
  for (const [level, words] of Object.entries(expected)) {
    await page.evaluate((at) => {
      const { session } = window.__game;
      session.levels.choose(at);
      session.levelUi.refresh();
    }, Number(level));
    await expect(page.locator('#level-new')).toHaveText(`New:${words}`);
  }
  // Winning level 6, played at level 6.
  await page.evaluate(() => {
    const { session } = window.__game;
    session.levels.choose(6);
    session.level = 6;
    session.finish();
  });
  await expect(page.locator('#level-next-new')).toHaveText('Coming up:🌉Broken bridge');
});

test('what\'s new shows under the countdown, in Georgian when that\'s the voice', async ({ page }) => {
  await openGame(page, atLevel(GAME, 6, { language: 'ka' }), GAME);
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('ცელქი მაიმუნი');
});

test('level 2: a real hand feeds Joze the golden fruit, and it\'s a gift for his family', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 2));
  await storyIs(page, 'joze');
  await expect(page.locator('#chip-gifts-box')).toBeVisible();
  const { fruit, introduced } = await tree(page);
  expect(fruit.filter(({ golden }) => golden)).toHaveLength(1);
  expect(introduced).toContain('golden');
  await page.waitForTimeout(800);
  await shot(page, 'jw-golden');
  await feedOne(page, (state) => state.fruit.find(({ golden, state: at }) => golden && at === 'hanging'));
  await expect.poll(async () => (await tree(page)).stats.golden, { timeout: 15_000 }).toBe(1);
  await expect(page.locator('#chip-gifts')).toHaveText('🎁 1');
  expect((await tree(page)).fed).toBe(1);
  await stopMoving(page);
});

test('level 3: a butterfly shooed off a fruit by a real open hand leaves a flower', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 3));
  await storyIs(page, 'joze');
  // Somewhere out of the way, so it lands.
  await moveGloveTo(page, GLOVE, 0.5, 0.85);
  await expect.poll(async () => (await tree(page)).butterfly, { timeout: 30_000 }).not.toBeNull();
  const { butterfly, fruit } = await tree(page);
  expect(fruit[butterfly.at].pickable).toBe(false);
  // There's always another ripe one free.
  expect(fruit.filter(({ pickable }) => pickable).length).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(900);
  await shot(page, 'jw-butterfly');
  await moveGloveTo(page, GLOVE, fruit[butterfly.at].homeX, fruit[butterfly.at].y);
  await expect.poll(async () => (await tree(page)).stats.flower, { timeout: 20_000 }).toBe(1);
  await stopMoving(page);
});

test('level 4: a real fist on green fruit only wiggles it until it ripens', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 4));
  await storyIs(page, 'joze');
  const first = await tree(page);
  // Four ripe, one more than he needs, and one green, which may already have ripened by itself on a
  // busy computer.
  expect(first.fruit).toHaveLength(5);
  expect(await page.evaluate(() => window.__game.walk.level.unripe)).toBe(1);
  // Only a green one is left on the tree, so the fist can't pick a ripe one beside it.
  const green = Math.max(0, first.fruit.findIndex(({ ripe }) => !ripe));
  await page.evaluate((at) => {
    const { walk } = window.__game;
    walk.fruit.forEach((fruit, index) => {
      if (index !== at) fruit.state = 'gone';
    });
    Object.assign(walk.fruit[at], { ripe: false, ripening: 0 });
  }, green);
  await moveGloveTo(page, GLOVE, first.fruit[green].homeX, first.fruit[green].y, { right: 'fist' });
  await expect.poll(async () => (await hands(page)).right.status, { timeout: 15_000 }).toBe('closed');
  await expect.poll(() => page.evaluate((at) => {
    const { walk } = window.__game;
    return walk.isNear(walk.fruit[at], walk.gloves.right);
  }, green), { timeout: 20_000 }).toBe(true);
  await stopMoving(page);
  expect((await tree(page)).fruit[green].ripe).toBe(false);
  await expect.poll(async () => (await tree(page)).fruit[green].wiggle, { timeout: 5000 }).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  await shot(page, 'jw-green');
  expect((await tree(page)).holding).toBeNull();
  // It ripens by itself, and then the same fist picks it.
  await expect.poll(async () => (await tree(page)).fruit[green].ripe, { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await tree(page)).holding, { timeout: 15_000 }).not.toBeNull();
});

test('level 5: a real fist takes the basket, and then picks two fruit at once for Joze', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 5));
  await skipTo(page, 1);
  await storyIs(page, 'mochi');
  // No butterflies or green fruit for this one.
  await page.evaluate(() => {
    const { walk } = window.__game;
    walk.level = { ...walk.level, butterflies: false };
    walk.fruit = walk.fruit.filter(({ ripe }) => ripe);
  });
  const { items } = await tree(page);
  expect(items.map(({ kind }) => kind)).toEqual(['basket']);
  await page.waitForTimeout(600);
  await shot(page, 'jw-basket');
  await reach(page, (state) => state.items[0]);
  await handIs(page, 'fist');
  await expect.poll(async () => (await tree(page)).basket, { timeout: 15_000 }).toBe(true);
  await handIs(page, 'open');
  await page.waitForTimeout(600);
  await feedOne(page, (state) => state.fruit.find(({ pickable }) => pickable));
  await expect.poll(async () => (await tree(page)).fed, { timeout: 15_000 }).toBeGreaterThanOrEqual(3 + 2);
  expect((await tree(page)).basket).toBe(false);
  await stopMoving(page);
});

test('level 6: the cheeky monkey takes a fruit, a real fist takes it back, and he throws a coconut', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 6));
  await skipTo(page, 1);
  await moveGloveTo(page, GLOVE, 0.5, 0.85);
  await page.evaluate(() => {
    const { walk } = window.__game;
    walk.level = { ...walk.level, butterflies: false, monkeyStays: 60 };
    walk.monkeyIn = 0;
  });
  await expect.poll(async () => (await tree(page)).monkey?.state, { timeout: 15_000 }).toBe('holding');
  await page.waitForTimeout(1200);
  await shot(page, 'jw-monkey');
  const { monkey } = await tree(page);
  expect((await tree(page)).introduced).toContain('monkey');
  await reach(page, (state) => state.fruit[monkey.at]);
  await handIs(page, 'fist');
  await expect.poll(async () => (await tree(page)).holding, { timeout: 15_000 }).not.toBeNull();
  // The coconut comes down to the hand.
  await expect.poll(async () => (await tree(page)).stats.coconut, { timeout: 15_000 }).toBe(1);
  await shot(page, 'jw-monkey-coconut');
  await stopMoving(page);
});

test('level 7: a real hand carries the plank to the gap and mends the bridge', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 7));
  await skipTo(page, 0);
  // Up to the river, feeding through the rules.
  await page.evaluate(() => {
    window.__skip = setInterval(() => {
      const { journey, walk } = window.__game;
      if (journey.index < 2 && journey.stop && walk.walking === 0 && walk.fruit.length) while (journey.wanted) journey.feed();
    }, 300);
  });
  await expect.poll(async () => (await tree(page)).place, { timeout: 30_000 }).toBe('river');
  await page.evaluate(() => clearInterval(window.__skip));
  await storyIs(page, 'bramble');
  await page.evaluate(() => {
    const { walk } = window.__game;
    walk.level = { ...walk.level, butterflies: false };
    walk.monkey = null;
    walk.monkeyIn = 1000;
  });
  const { items, bridge } = await tree(page);
  expect(items.map(({ kind }) => kind)).toEqual(['plank']);
  expect(bridge.fixed).toBe(false);
  await page.waitForTimeout(800);
  await shot(page, 'jw-bridge');
  await reach(page, (state) => state.items[0]);
  await handIs(page, 'fist');
  await expect.poll(async () => (await tree(page)).holding, { timeout: 15_000 }).toBe('plank');
  await carryTo(page, bridge.gap, () => window.__game.walk.onGap);
  await expect.poll(async () => (await tree(page)).bridge?.fixed, { timeout: 15_000 }).toBe(true);
  expect(await page.evaluate(() => window.__game.journey.bridgeFixed)).toBe(true);
  await shot(page, 'jw-bridge-mended');
  // Fed, and off he goes over it.
  await page.evaluate(() => {
    const { journey } = window.__game;
    while (journey.wanted) journey.feed();
  });
  await expect.poll(async () => (await tree(page)).place, { timeout: 30_000 }).toBe('hill');
  await stopMoving(page);
});

test('level 8: on the snowy hill, a real fist held on frosty fruit warms it, and then picks it', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 8));
  await skipTo(page, 3);
  await storyIs(page, 'tur');
  const { fruit } = await tree(page);
  expect(fruit.filter(({ frost }) => frost)).toHaveLength(2);
  expect(await page.evaluate(() => window.__game.walk.snow.length)).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  await shot(page, 'jw-frost');
  // Only one frosty one left on the tree, so the fist can't pick another.
  const frosty = fruit.findIndex(({ frost }) => frost);
  await page.evaluate((at) => {
    const { walk } = window.__game;
    walk.level = { ...walk.level, butterflies: false };
    walk.monkey = null;
    walk.monkeyIn = 1000;
    walk.fruit.forEach((one, index) => {
      if (index !== at) one.state = 'gone';
    });
  }, frosty);
  await reach(page, (state) => state.fruit[frosty]);
  await handIs(page, 'fist');
  await expect.poll(async () => (await tree(page)).fruit[frosty].warmth, { timeout: 15_000 }).toBeGreaterThan(0.2);
  await shot(page, 'jw-frost-warming');
  await expect.poll(async () => (await tree(page)).fruit[frosty].frost, { timeout: 15_000 }).toBe(false);
  await expect.poll(async () => (await tree(page)).holding, { timeout: 15_000 }).not.toBeNull();
});

test('level 9: in the evening, a real fist catches a firefly as a gift', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 9));
  await skipTo(page, 3);
  await storyIs(page, 'tur');
  await page.evaluate(() => {
    const { walk } = window.__game;
    walk.level = { ...walk.level, butterflies: false };
    walk.monkey = null;
    walk.monkeyIn = 1000;
  });
  const { flies } = await tree(page);
  expect(flies).toHaveLength(2);
  await page.waitForTimeout(800);
  await shot(page, 'jw-fireflies');
  // A fist following it about, as it goes round slowly.
  const until = Date.now() + 40_000;
  while ((await tree(page)).stats.firefly === 0 && Date.now() < until) {
    const fly = (await tree(page)).flies.find(({ caught }) => !caught);
    await moveGloveTo(page, GLOVE, fly.x, fly.y, { right: 'fist' });
    await page.waitForTimeout(500);
  }
  expect((await tree(page)).stats.firefly).toBeGreaterThanOrEqual(1);
  await stopMoving(page);
});

test('level 10: a real fist on the feather brings the parrot, who feeds Joze a fruit by himself', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'joze');
  await page.evaluate(() => {
    const { walk } = window.__game;
    walk.level = { ...walk.level, butterflies: false };
  });
  const { items } = await tree(page);
  expect(items.map(({ kind }) => kind)).toEqual(['feather']);
  await reach(page, (state) => state.items[0]);
  await handIs(page, 'fist');
  await expect.poll(async () => (await tree(page)).parrot, { timeout: 15_000 }).not.toBeNull();
  await handIs(page, 'open');
  await moveGloveTo(page, GLOVE, 0.5, 0.85);
  await expect.poll(async () => (await tree(page)).parrot, { timeout: 15_000 }).toBe('to-mouth');
  await page.waitForTimeout(500);
  await shot(page, 'jw-parrot');
  await expect.poll(async () => (await tree(page)).fed, { timeout: 15_000 }).toBe(1);
  await stopMoving(page);
});

test('level 10: every stop fed still brings Joze home, with the gifts on the finish card', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  const feedThisStop = () => page.evaluate(() => {
    const { journey: rules, walk } = window.__game;
    rules.gift('flower');
    if (walk.bridge) walk.bridge.fixed = true;
    rules.fixBridge();
    while (rules.fed < rules.stop.count) rules.feed();
  });
  for (const [who, index] of [['joze', 0], ['mochi', 1], ['bramble', 2], ['tur', 3], ['joze', 4]]) {
    await expect.poll(async () => (await tree(page)).index, { timeout: 30_000 }).toBe(index);
    await storyIs(page, who);
    await page.waitForTimeout(300);
    if (index === 2) await shot(page, 'jw-l10-river');
    if (index === 4) await shot(page, 'jw-l10-home');
    await feedThisStop();
    if (index === 0) {
      expect(await page.evaluate(() => window.__game.walk.walkLasts)).toBeCloseTo(2.2, 5);
    }
  }
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish')).toContainText('Joze is home!');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  expect((await tree(page)).fed).toBe(19);
  await expect(page.locator('#sum-right-gifts')).toHaveText(String((await tree(page)).gifts));
  await page.waitForTimeout(600);
  await shot(page, 'jw-finish');
});

for (const level of [1, 6, 10]) {
  test(`nothing flashes at level ${level}: fruit, butterflies, the monkey, gifts, feeding and walking on`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPlaying(page, GAME, atLevel(GAME, level));
    await storyIs(page, 'joze');
    // Feeding him a fruit every so often, so he walks on to the next tree in the meantime, with gifts.
    await page.evaluate(() => {
      window.__feeding = setInterval(() => {
        const { journey: rules, walk } = window.__game;
        if (!rules.stop || walk.walking > 0 || !walk.fruit.length || rules.fed >= rules.stop.count) return;
        if (walk.bridge) walk.bridge.fixed = true;
        rules.fixBridge();
        if (rules.level.golden) walk.addGift('flower', walk.width * 0.6, walk.height * 0.4);
        rules.feed();
      }, 700);
    });
    const result = judgeBrightness(await watchBrightness(page, 420, CANVASES));
    const { index } = await tree(page);
    await page.evaluate(() => clearInterval(window.__feeding));
    console.log(`level ${level}`, JSON.stringify(result), 'stop', index);
    expect(index).toBeGreaterThanOrEqual(1);
    expect(result.biggestStep).toBeLessThan(3);
    expect(result.flickeringShare).toBeLessThan(0.02);
  });
}

test('nothing flashes at level 9 on the snowy evening hill, with fireflies and snow', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 9));
  await skipTo(page, 3);
  await page.evaluate(() => {
    const { walk } = window.__game;
    walk.monkeyIn = 0;
    setTimeout(() => walk.addGift('coconut', walk.width * 0.6, walk.height * 0.4), 500);
  });
  const result = judgeBrightness(await watchBrightness(page, 300, CANVASES));
  console.log('hill', JSON.stringify(result));
  expect(result.biggestStep).toBeLessThan(3);
  expect(result.flickeringShare).toBeLessThan(0.02);
});

test('level 10 with reduced motion: the fruit sways half as far, and no snow falls', async ({ page }) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'joze');
  const furthest = await page.evaluate(async () => {
    const { walk } = window.__game;
    let most = 0;
    for (let i = 0; i < 60; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      for (const fruit of walk.fruit) if (fruit.state === 'hanging') most = Math.max(most, Math.abs(fruit.x - fruit.homeX) / walk.width);
    }
    return most;
  });
  expect(furthest).toBeGreaterThan(0.002);
  expect(furthest).toBeLessThanOrEqual(0.0111);
  await skipTo(page, 3);
  expect(await page.evaluate(() => window.__game.walk.snow.length)).toBe(0);
});

test('level 7: a plank dropped away from the gap goes back on the tree, so the bridge can still be mended', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME, atLevel(GAME, 7));
  await skipTo(page, 0);
  await page.evaluate(() => {
    window.__skip = setInterval(() => {
      const { journey, walk } = window.__game;
      if (journey.index < 2 && journey.stop && walk.walking === 0 && walk.fruit.length) while (journey.wanted) journey.feed();
    }, 300);
  });
  await expect.poll(async () => (await tree(page)).place, { timeout: 30_000 }).toBe('river');
  await page.evaluate(() => clearInterval(window.__skip));
  // Dropped the way an opening hand away from the gap drops it.
  await page.evaluate(() => {
    const plank = window.__game.walk.items.find(({ kind }) => kind === 'plank');
    plank.state = 'falling';
    plank.vy = 0;
  });
  const plankState = () => page.evaluate(() => window.__game.walk.items.find(({ kind }) => kind === 'plank')?.state);
  await expect.poll(plankState, { timeout: 15_000 }).toBe('hanging');
});
