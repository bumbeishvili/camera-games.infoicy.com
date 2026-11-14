// Moto Mountain, played in the real page. A person filmed standing still is in front of the real tracker, and
// the test camera tips them over to make them lean. Where a test is about the rules and not the tracker, the
// child is played by a script whose lean goes where the tracker's reading does.
import { bending, childHolds, childRides, expect, expectSoon, lean, leansFrom, openMoto, personRides, reachPlay, reachWarmup, shot, standing, state, stopChild, test, toChoosing, waitForScreen, waitingInBend } from './helpers.js';

const short = (settings = {}) => ({ motoBends: 6, ...settings });

test('what to do is asked for and shown: a way back to all the games, a rider to choose, and a film of the lean', async ({ page }) => {
  await openMoto(page);
  await expect(page.locator('h1')).toHaveText('Moto Mountain');
  await expect(page.locator('#screen-welcome .all-games')).toHaveAttribute('href', '../../index.html');
  await expect(page.locator('#start')).toHaveText('Choose your rider');
  // The bike is beside the title card, not behind it.
  expect((await state(page)).view).toBe('title');
  await standing(page);
  await toChoosing(page);
  await expect(page.locator('.fighter-card')).toHaveCount(10);
  await expect(page.locator('#chosen-name')).toHaveText('Giraffe');
  await page.locator('.fighter-card[data-fighter="kit"]').click();
  await expect(page.locator('#chosen-name')).toHaveText('Kit');
  expect(await page.evaluate(() => window.__game.world.rider.spec.id)).toBe('kit');
  await page.locator('#moto-start').click();
  await waitForScreen(page, 'warmup');
  // The warm-up asks for a lean to one side, in words, with the character showing it.
  await expect(page.locator('#coach')).toHaveClass(/is-visible/);
  await expect(page.locator('#coach-text')).toHaveText(/Lean to the (left|right) as far as you can, and hold it!/);
  await expect(page.locator('#lean-meter')).toBeVisible();
  await expect(page.locator('#warm-skip')).toBeVisible();
  await shot(page, 'moto-warmup');
});

test('through the real tracker: a person leaning to each side is read as leaning that way, by about as much as they lean', async ({ page }) => {
  await reachWarmup(page);
  const read = async (degrees) => {
    await lean(page, degrees);
    await page.waitForTimeout(900);
    return (await state(page)).raw;
  };
  const upright = await read(0);
  expect(Math.abs(upright)).toBeLessThan(1.5);
  for (const degrees of [8, 16, -8, -16]) {
    const seen = await read(degrees);
    console.log(`leaning ${degrees} degrees was read as ${seen.toFixed(1)}`);
    expect(Math.abs(seen - degrees)).toBeLessThan(2.5);
  }
  // And the bike on the screen leans the same way as the child does in the mirror.
  await lean(page, 14);
  await expectSoon(async () => (await state(page)).bikeRoll).toBeGreaterThan(0.2);
  const right = await page.locator('#lean-dot').evaluate((dot) => parseFloat(dot.style.left));
  expect(right).toBeGreaterThan(60);
  await lean(page, -14);
  await expectSoon(async () => (await state(page)).bikeRoll).toBeLessThan(-0.2);
  expect(await page.locator('#lean-dot').evaluate((dot) => parseFloat(dot.style.left))).toBeLessThan(40);
});

test('through the real tracker: the warm-up measures how far the child leans to each side, each by itself', async ({ page }) => {
  await reachWarmup(page, { hands: 'left' });
  // The side being worked on comes second: here, right and then left. This child leans less to the left.
  expect((await state(page)).warmSide).toBe('right');
  await lean(page, 17);
  await page.waitForTimeout(1600);
  await lean(page, 0);
  await expectSoon(async () => (await state(page)).warmSide).toBe('left');
  await expect(page.locator('#coach-text')).toHaveText('Lean to the left as far as you can, and hold it!');
  await lean(page, -9);
  await page.waitForTimeout(1600);
  await lean(page, 0);
  await waitForScreen(page, 'countdown');
  const { best, reach } = await state(page);
  console.log('the warm-up measured', JSON.stringify({ best, reach }));
  expect(Math.abs(best.right - 17)).toBeLessThan(2.5);
  expect(Math.abs(best.left - 9)).toBeLessThan(2.5);
  // A whole lean is most of what they managed, and no more than the setting: 14 degrees.
  expect(reach.left).toBeLessThan(9);
  expect(reach.left).toBeGreaterThan(6);
  expect(Math.abs(reach.right - 14)).toBeLessThan(0.01);
});

test('through the real tracker: a person bending at the waist is read the right way, evenly, and the warm-up measures the bend', async ({ page }) => {
  await reachWarmup(page, { hands: 'left' });
  const read = async (degrees) => {
    await bending(page, degrees);
    await page.waitForTimeout(900);
    return (await state(page)).raw;
  };
  const upright = await read(0);
  const [left, right, further] = [await read(-12), await read(12), await read(18)];
  console.log(`bends of -12, 12 and 18 degrees were read as ${left.toFixed(1)}, ${right.toFixed(1)} and ${further.toFixed(1)}`);
  // Upright in this footage is a degree or two from where the person in the other footage stood.
  expect(Math.abs(upright)).toBeLessThan(2.5);
  // About half the bend at the top of the spine, the same each way from upright, and more for a deeper bend.
  expect(left - upright).toBeLessThan(-3.5);
  expect(right - upright).toBeGreaterThan(3.5);
  expect(Math.abs(upright - left - (right - upright))).toBeLessThan(2);
  expect(further).toBeGreaterThan(right + 1.5);
  expect(further - upright).toBeLessThan(18 * 0.6);
  // The footage plays on: a lean to the right held, upright, to the left held, and upright. That's the warm-up done.
  expect((await state(page)).warmSide).toBe('right');
  await leansFrom(page, 13);
  await waitForScreen(page, 'countdown');
  const { best, reach } = await state(page);
  console.log('the warm-up measured the bends as', JSON.stringify(best));
  for (const side of ['left', 'right']) {
    expect(best[side]).toBeGreaterThan(5);
    expect(best[side]).toBeLessThan(9.5);
    expect(reach[side]).toBeCloseTo(best[side] * 0.85, 1);
  }
});

test('a lurch in the warm-up measures nothing, and skipping it leaves a whole lean small', async ({ page }) => {
  await reachWarmup(page, { motoLean: 'small' });
  const { warmSide } = await state(page);
  const sign = warmSide === 'left' ? -1 : 1;
  await lean(page, sign * 18);
  await page.waitForTimeout(350);
  await lean(page, 0);
  await page.waitForTimeout(1500);
  expect((await state(page)).warmSide).toBe(warmSide);
  expect((await state(page)).best[warmSide]).toBe(null);
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'countdown');
  // Nothing is known of how far this child leans, so a whole lean is 8 degrees, though the setting allows 10.
  const { reach } = await state(page);
  expect(Math.abs(reach.left - 8)).toBeLessThan(0.01);
  expect(Math.abs(reach.right - 8)).toBeLessThan(0.01);
});

test('a child who sits a little crooked through the countdown rides straight: that is taken as upright', async ({ page }) => {
  await reachWarmup(page, short());
  // Four degrees over to the right, and staying there.
  await lean(page, 4);
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'playing');
  const start = await state(page);
  console.log(`sitting 4 degrees over, upright was taken as ${start.zero.toFixed(1)}`);
  expect(Math.abs(start.zero - 4)).toBeLessThan(1.5);
  // Along the straight, the bike stays upright and in the middle of the road.
  await page.waitForTimeout(2500);
  const along = await state(page);
  expect(along.share).toBe(0);
  expect(Math.abs(along.x)).toBeLessThan(0.3);
  expect(Math.abs(along.bikeRoll)).toBeLessThan(0.03);
  // And a lean is measured from there: four degrees more is a lean to the right.
  await lean(page, 9);
  await expectSoon(async () => (await state(page)).share).toBeGreaterThan(0.25);
});

test('through the real tracker: a lean swings the bike round little by little, and leaning further turns it more, by less and less', async ({ page }) => {
  await reachPlay(page, { motoBends: 14 });
  await expectSoon(async () => (await state(page)).v).toBeGreaterThan(10);
  // A small lean on the straight: a quarter of a second on, the bike has hardly moved across the road.
  await lean(page, 5);
  await expectSoon(async () => (await state(page)).share).toBeGreaterThan(0.3);
  const early = await state(page);
  expect(Math.abs(early.x)).toBeLessThan(0.6);
  // Its nose swings round to the right, on the screen as in the rules, and the bike follows it across.
  await expectSoon(async () => (await state(page)).bikeYaw).toBeGreaterThan(0.02);
  expect((await state(page)).yaw).toBeGreaterThan(0.02);
  await expectSoon(async () => (await state(page)).x).toBeGreaterThan(1);
  const small = await state(page);
  // Upright: the nose comes back in line with the road.
  await lean(page, 0);
  await expectSoon(async () => Math.abs((await state(page)).bikeYaw)).toBeLessThan(0.01);
  // Three times as far over: the bike tips further and turns more, but not three times as much.
  const turn = (share) => Math.log(1 + 2 * share) / Math.log(3);
  await lean(page, 15);
  await expectSoon(async () => (await state(page)).share).toBeGreaterThan(small.share * 2);
  const big = await state(page);
  await expectSoon(async () => (await state(page)).bikeRoll).toBeGreaterThan(small.bikeRoll * 1.2);
  console.log(`leans of ${small.share.toFixed(2)} and ${big.share.toFixed(2)} of a whole one turn the bike ${turn(small.share).toFixed(2)} and ${turn(big.share).toFixed(2)}`);
  expect(turn(big.share) / turn(small.share)).toBeLessThan((big.share / small.share) * 0.8);
  // The dot on the bar goes by the turn: further for the bigger lean, and not off the end of the bar.
  const dot = await page.locator('#lean-dot').evaluate((el) => parseFloat(el.style.left));
  expect(dot).toBeGreaterThan(75);
  expect(dot).toBeLessThanOrEqual(98);
  await lean(page, 0);
});

test('through the real tracker: a person who leans into each bend rides them on the road', async ({ page }) => {
  await reachPlay(page, short());
  await personRides(page);
  await expectSoon(async () => (await state(page)).stats.clean, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
  const now = await state(page);
  expect(now.stats.vergeSeconds).toBeLessThan(0.5);
  expect(now.stats.leans.left + now.stats.leans.right).toBeGreaterThanOrEqual(2);
  // "On the road" counts them at the top of the screen.
  await expect(page.locator('#bends-clean')).toHaveText(String(now.stats.clean));
  await stopChild(page);
});

test('through the real tracker: a person who stays upright finds the bike waiting in the first bend, and a lean into it gets it going', async ({ page }) => {
  await reachPlay(page, short());
  await expectSoon(() => waitingInBend(page), { timeout: 60_000 }).toBe(true);
  const stopped = await state(page);
  expect(stopped.offRoad).toBe(true);
  expect(stopped.stats.tows).toBe(0);
  const side = stopped.bend.turn < 0 ? 'left' : 'right';
  // It asks for the lean in words, with an arrow, and the character shows it.
  await expect(page.locator('#prompt-text')).toHaveText(`Lean to the ${side}!`);
  await expect(page.locator(`#prompt-arrow-${side}`)).toHaveClass(/is-visible/);
  await expect(page.locator('#coach')).toHaveClass(/is-visible/);
  await expect(page.locator('#bend-arrow')).toHaveAttribute('data-way', side);
  await shot(page, 'moto-waiting');
  // Leaning the wrong way does nothing.
  await lean(page, side === 'left' ? 10 : -10);
  await page.waitForTimeout(1200);
  expect((await state(page)).waiting).toBe('bend');
  // Leaning into the bend gets it going, and back onto the road.
  await lean(page, side === 'left' ? -9 : 9);
  await expectSoon(async () => (await state(page)).waiting).toBe(null);
  await expectSoon(async () => (await state(page)).offRoad, { timeout: 20_000 }).toBe(false);
  expect((await state(page)).stats.tows).toBe(0);
});

test('nobody is left stuck: a bike that has waited ten seconds is helped round the bend, and rides on', async ({ page }) => {
  await reachPlay(page, short());
  await childRides(page, { fixed: 0 });
  await expectSoon(() => waitingInBend(page), { timeout: 60_000 }).toBe(true);
  const from = (await state(page)).s;
  await expectSoon(async () => (await state(page)).towed, { timeout: 20_000 }).toBe(true);
  // Slowly round, and then on up the road by itself.
  await expectSoon(async () => (await state(page)).towed, { timeout: 40_000 }).toBe(false);
  const after = await state(page);
  expect(after.stats.tows).toBe(1);
  expect(after.s).toBeGreaterThan(from + 10);
  expect(after.stats.clean).toBe(0);
  await stopChild(page);
});

test('with nobody in the picture the bike stops and asks them back, and rides on when they come', async ({ page }) => {
  await reachPlay(page, short());
  await expectSoon(async () => (await state(page)).v).toBeGreaterThan(8);
  await page.evaluate(() => window.__camera.showNobody());
  await expectSoon(async () => (await state(page)).waiting, { timeout: 20_000 }).toBe('away');
  await expect(page.locator('#prompt-text')).toHaveText('Come back where I can see you');
  await expectSoon(async () => (await state(page)).v).toBe(0);
  const stoppedAt = (await state(page)).s;
  await page.waitForTimeout(1000);
  expect((await state(page)).s).toBe(stoppedAt);
  await standing(page);
  await expectSoon(async () => (await state(page)).waiting, { timeout: 20_000 }).toBe(null);
  await expectSoon(async () => (await state(page)).v).toBeGreaterThan(5);
});

test('if the tracker stops answering in the middle of a lean, the lean is let go and the bike waits', async ({ page }) => {
  await reachPlay(page, short());
  await expectSoon(async () => (await state(page)).v).toBeGreaterThan(8);
  await lean(page, 9);
  await expectSoon(async () => (await state(page)).share).toBeGreaterThan(0.3);
  // Nothing more comes from the tracker, as when a camera freezes.
  await page.evaluate(() => {
    window.__game.camera.onResult = () => {};
  });
  await expectSoon(async () => (await state(page)).waiting, { timeout: 20_000 }).toBe('away');
  // The bike isn't left leaning the way it last saw the child: it comes upright, and stops.
  await expectSoon(async () => Math.abs((await state(page)).bikeRoll)).toBeLessThan(0.03);
  await expectSoon(async () => (await state(page)).v).toBe(0);
  expect((await state(page)).seen).toBe(false);
  await expect(page.locator('#prompt-text')).toHaveText('Come back where I can see you');
});

test('the bar along the bottom shows the lean and where the road needs it, and the arrow says which way the bend goes', async ({ page }) => {
  await reachPlay(page, short());
  await childRides(page);
  const zone = () => page.locator('#lean-zone').evaluate((el) => parseFloat(el.style.left) + parseFloat(el.style.width) / 2);
  const dot = () => page.locator('#lean-dot').evaluate((el) => parseFloat(el.style.left));
  // On the straight the green stretch is in the middle, and so is the dot.
  expect(Math.abs((await zone()) - 50)).toBeLessThan(1);
  expect(Math.abs((await dot()) - 50)).toBeLessThan(4);
  // The arrow comes up pale before the bend, and bold in it.
  await expectSoon(async () => page.locator('#bend-arrow').getAttribute('data-way')).not.toBe('none');
  await expect(page.locator('#bend-arrow')).toHaveAttribute('data-now', 'false');
  await expectSoon(async () => Math.abs((await state(page)).need), { timeout: 30_000 }).toBeGreaterThan(0.4);
  const inBend = await state(page);
  const way = inBend.bend.turn < 0 ? 'left' : 'right';
  await expect(page.locator('#bend-arrow')).toHaveAttribute('data-way', way);
  await expect(page.locator('#bend-arrow')).toHaveAttribute('data-now', 'true');
  // The green stretch has moved to that side, and the dot is in it.
  const middle = await zone();
  expect((middle - 50) * inBend.bend.turn).toBeGreaterThan(12);
  expect(Math.abs((await dot()) - middle)).toBeLessThan(11);
  await expect(page.locator('#lean-meter')).toHaveAttribute('data-zone', 'in');
  // Upright in the bend, the dot is out of the green.
  await childHolds(page, 0);
  await expectSoon(async () => page.locator('#lean-meter').getAttribute('data-zone')).toBe('out');
  await stopChild(page);
});

test('a wobbly child who is late into every bend still gets up the mountain, and the finish card says how it went', async ({ page }) => {
  test.setTimeout(300_000);
  await reachPlay(page, short({ motoPace: 'quick' }));
  await childRides(page, { late: 0.5, wobble: 4, skill: 0.9 });
  await waitForScreen(page, 'finishing');
  // The bike rolls on past the finish to where its friends are waiting, and the camera moves over to one side.
  expect((await state(page)).view).toBe('finish');
  await waitForScreen(page, 'finish');
  const { stats } = await state(page);
  expect(stats.bends).toBe(6);
  expect(stats.clean).toBeGreaterThanOrEqual(4);
  expect(stats.tows).toBe(0);
  await expect(page.locator('#finish-title')).toHaveText('You made it to the top!');
  await expect(page.locator('#finish-clean')).toHaveText(`${stats.clean} of 6 bends`);
  await expect(page.locator('#finish-line')).toContainText(`Giraffe leaned ${stats.leans.left} time${stats.leans.left === 1 ? '' : 's'} to the left and ${stats.leans.right} time${stats.leans.right === 1 ? '' : 's'} to the right`);
  await expect(page.locator('#finish-tally .tally-card')).toHaveCount(3);
  await expect(page.locator('#screen-finish .all-games')).toHaveAttribute('href', '../../index.html');
  // The camera is off, and the level has moved on.
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(0);
  await expect(page.locator('#level-next-new')).toContainText('Gold stars');
  await expect(page.locator('#ride-again')).toHaveText('Next level');
  await shot(page, 'moto-finish');
  // Ride again goes back through the check to a new ride, without the warm-up.
  await standing(page);
  await page.locator('#ride-again').click();
  await waitForScreen(page, 'countdown');
  expect((await state(page)).level).toBe(2);
});

test('a grown-up’s choices are kept and used: how far a lean is, how many bends, which way they go, how fast and how much help', async ({ page }) => {
  await openMoto(page);
  await page.locator('#open-panel').click();
  for (const [name, value] of [['motoLean', 'big'], ['motoBends', '14'], ['motoWay', 'more'], ['motoPace', 'gentle'], ['motoHelp', 'lots'], ['hands', 'right']]) {
    await page.locator(`input[name="${name}"][value="${value}"]`).check();
  }
  // The setting the other body games share is put away: this game has its own.
  await expect(page.locator('input[name="moveSize"]').first()).toBeHidden();
  await page.locator('#close-panel').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('camera-games-settings')));
  expect(saved).toMatchObject({ motoLean: 'big', motoBends: 14, motoWay: 'more', motoPace: 'gentle', motoHelp: 'lots', hands: 'right' });
  await standing(page);
  await toChoosing(page);
  await page.locator('#moto-start').click();
  await waitForScreen(page, 'warmup');
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'countdown');
  const now = await state(page);
  // The warm-up was skipped, so a whole lean is the small one. For a child who had leaned a long way in it, it
  // would be the setting: a lot, 19 degrees.
  expect(Math.abs(now.reach.left - 8)).toBeLessThan(0.01);
  expect(await page.evaluate(() => {
    const { leaner } = window.__game;
    leaner.measured('left', (40 * Math.PI) / 180);
    return (leaner.reachOf('left') * 180) / Math.PI;
  })).toBeCloseTo(19, 5);
  expect(now.plan.bends.length).toBe(14);
  // Two in every three towards the right.
  const right = now.plan.bends.filter(({ turn }) => turn > 0).length;
  expect(right).toBeGreaterThanOrEqual(9);
  expect(Math.abs(now.cruise - 15 * 0.78)).toBeLessThan(0.01);
  // With lots of help, the bike's nose swings round more slowly for the same lean.
  expect(await page.evaluate(() => window.__game.ride.gain)).toBeCloseTo((4.2 / 0.42) * 0.0427, 5);
  // The panel says what the camera sees, in words a grown-up can use.
  await page.locator('#open-panel').click();
  await expect(page.locator('#live-reading')).toContainText('A whole lean is 19 degrees to the left and 8 degrees to the right');
  await page.locator('#close-panel').click();
});

test('in Georgian, the warm-up, the countdown’s end and what’s asked for are in Georgian', async ({ page }) => {
  await reachWarmup(page, { language: 'ka', hands: 'right' });
  await expect(page.locator('#coach-text')).toHaveText(/^გადაიხარე მარცხნივ.+!$/);
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'playing');
  await expect(page.locator('#count')).toHaveText('წავედით!');
  await expectSoon(async () => (await state(page)).waiting, { timeout: 30_000 }).toBe('bend');
  await expect(page.locator('#prompt-text')).toHaveText(/გადაიხარე (მარცხნივ|მარჯვნივ)!/);
});

test('with reduced motion the picture stays level while the bike leans', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await reachPlay(page, short());
  await childRides(page);
  await expectSoon(async () => Math.abs((await state(page)).roll), { timeout: 30_000 }).toBeGreaterThan(0.15);
  expect((await state(page)).cameraTip).toBe(0);
  await stopChild(page);
  await context.close();
});

test('the picture tips with the bike, but only a little', async ({ page }) => {
  await reachPlay(page, short());
  await childRides(page);
  await expectSoon(async () => Math.abs((await state(page)).roll), { timeout: 30_000 }).toBeGreaterThan(0.18);
  await page.waitForTimeout(600);
  const { roll, cameraTip } = await state(page);
  expect(Math.sign(cameraTip)).toBe(Math.sign(roll));
  expect(Math.abs(cameraTip)).toBeLessThan(Math.abs(roll) * 0.3);
  expect(Math.abs(cameraTip)).toBeGreaterThan(Math.abs(roll) * 0.1);
  await stopChild(page);
});
