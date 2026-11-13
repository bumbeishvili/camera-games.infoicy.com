// Playing Frost Arena with a friend: two players, each on their own computer with their own camera, in the same
// yard. Together, both are on the blue team with Giraffe against the computer's red team, which the game of
// whoever made the match runs for both. Against each other it's everyone for themselves, with nobody played by
// the computer. Either way each game runs its own player, the friend is where their game says, and a hit is
// decided by the game that fired it, which tells the other. Here they're two separate browsers, talking through
// the race server on this computer (tools/race-server.mjs).
import { expect, openGame, shot, test, waitForScreen } from '../helpers.js';
import { GAME, RING, hands, soon } from './helpers.js';

const FIST = { photo: 'fist' };

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

/** Someone makes a match, and gets its code. */
async function makeMatch(page, name) {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  await page.locator('#friends-name').fill(name);
  await page.locator('#friends-name').dispatchEvent('change');
  return page.locator('#friends-code-shown').textContent();
}

/** Both get through the hand check and wait for each other, and then both play, with their hands at rest. */
async function bothPlaying(page, other) {
  for (const each of [page, other]) {
    await hands(each);
    await each.locator('#start').click();
  }
  for (const each of [page, other]) {
    await waitForScreen(each, 'playing');
    await soon(() => each.evaluate(() => window.__game.controls.out.stick.on && window.__game.controls.out.pad.on)).toBe(true);
  }
}

/** How the match is on one player's screen. */
const matchOf = (page) => page.evaluate(() => {
  const { game, match, session } = window.__game;
  const { child } = match;
  const brief = (each) => ({ number: each.number, who: each.who, name: each.name, team: each.team, bot: each.bot, state: each.state, x: each.x, z: each.z, heading: each.heading, health: each.health, firing: each.firing, resting: each.resting, rifle: each.rifle, tags: each.tags });
  return {
    mode: game.mode,
    state: match.state,
    slot: match.slot ?? null,
    runs: match.runs ?? null,
    goal: match.goal,
    score: [...match.score],
    canLose: match.level.canLose,
    level: match.levelNumber,
    mine: match.stats.tags,
    out: match.stats.out,
    shots: match.stats.shots,
    hits: match.stats.hits,
    child: brief(child),
    others: match.troopers.filter((each) => each !== child).map(brief),
    names: [...document.querySelectorAll('.arena-mark-name')].map((name) => name.textContent).filter(Boolean),
    // How each of the other players looks in the yard: whether they're there, the colour of the ring under them, and their rifle.
    shown: Object.fromEntries(match.troopers.filter((each) => each !== child && !each.bot).map((each) => {
      const model = window.__game.yard.players.get(each);
      return [each.number, { visible: model.root.visible, ring: `#${model.ring.material.color.getHexString()}`, rifle: model.rifleKind }];
    })),
    ownLevel: session.levels.current,
    line: document.querySelector('#story-line')?.textContent ?? '',
  };
});

const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const byNumber = (match, number) => [match.child, ...match.others].find((each) => each.number === number);

test('two friends play together from their own computers: the same red team on both screens, each player where they really are, and each one\'s tags counting for the team', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { arenaHard: 'gentle', arenaWin: 5, levels: { [GAME]: 4 } }, GAME);
  const code = await makeMatch(page, 'Ana');
  expect(page.url()).toContain(`#arena=${code}`);
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();

  // The friend has their own rifle, and would have it Tough to fifteen tags, but plays the host's match.
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { arenaHard: 'tough', arenaWin: 15, arenaRifle: 'm4' }, GAME, `#arena=${code}`);
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await ben.page.locator('#friends-name').fill('Ben');
  await ben.page.locator('#friends-name').dispatchEvent('change');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('#friends-here')).toContainText('Ana');
  await bothPlaying(page, ben.page);
  // From here everyone the computer plays stands where they are, so that what happens next is only what the
  // two of them do, however long it takes.
  await page.evaluate(() => {
    window.__game.match.think = () => {};
  });

  // Ana's match for both: Easy, five tags for each of them, the plain match, with one more on the red team
  // than there are players, and Giraffe on theirs.
  let [ana, his] = [await matchOf(page), await matchOf(ben.page)];
  expect([ana.mode, his.mode]).toEqual(['team', 'team']);
  expect([ana.slot, his.slot, ana.runs, his.runs]).toEqual([0, 1, true, false]);
  expect([ana.goal, his.goal, ana.canLose, his.canLose, ana.level, his.level]).toEqual([10, 10, false, false, 1, 1]);
  for (const each of [ana, his]) {
    expect(each.others.filter(({ team, bot }) => team === 1 && bot).map(({ number }) => number)).toEqual([20, 21, 22]);
    expect(each.others.filter(({ team, bot }) => team === 0 && bot).map(({ who }) => who)).toEqual(['giraffe']);
  }
  expect(his.others.filter(({ team }) => team === 1).map(({ who }) => who)).toEqual(ana.others.filter(({ team }) => team === 1).map(({ who }) => who));
  expect([ana.child.rifle, his.child.rifle]).toEqual(['ak', 'm4']);
  expect([ana.names, his.names]).toEqual([['Ben'], ['Ana']]);
  // Each is on the other's side, with a blue ring under them.
  expect([ana.shown[1].ring, his.shown[0].ring]).toEqual(['#2f6fed', '#2f6fed']);
  await expect(page.locator('#chip-blue-label')).toHaveText('Blue');
  await expect(page.locator('#chip-goal')).toHaveText('of 10');
  await expect(page.locator('#chip-mine-box')).toBeVisible();
  await expect(ben.page.locator('#story-line')).toHaveText('Tag the red team! I’m right beside you!');
  // Everything passes through the race server on this computer, and nowhere else.
  expect(sockets.length).toBeGreaterThan(0);
  for (const url of sockets) expect(url).toMatch(/^ws:\/\/(localhost|127\.0\.0\.1):\d+\//);

  // Giraffe and the red team are where Ana's game has them on Ben's screen, and each player is where the other's has them.
  await soon(async () => {
    [ana, his] = [await matchOf(page), await matchOf(ben.page)];
    const bots = ana.others.filter(({ bot }) => bot).every((bot) => gap(bot, byNumber(his, bot.number)) < 1.5);
    // Ben has the other rifle, and it's the one he's holding on Ana's screen.
    return bots && gap(byNumber(ana, 1), his.child) < 0.6 && gap(byNumber(his, 0), ana.child) < 0.6 && byNumber(ana, 1).rifle === 'm4' && ana.shown[1].rifle === 'm4';
  }).toBe(true);

  // Ben walks off up the yard, and Ana's screen shows him going.
  const from = his.child;
  await hands(ben.page, { move: { y: -0.55 } });
  await soon(async () => gap((await matchOf(ben.page)).child, from)).toBeGreaterThan(4);
  await soon(async () => {
    [ana, his] = [await matchOf(page), await matchOf(ben.page)];
    return gap(byNumber(ana, 1), his.child) < 1.5;
  }).toBe(true);
  await hands(ben.page);
  await shot(page, 'arena-friends-together');

  // One of the red team in front of Ben, in the alley down the side, as Ana's game has it: everyone it plays
  // stands still, and the rest of them are out of the way.
  await page.evaluate(() => {
    const { match } = window.__game;
    // Whatever happened while they were finding their feet, it starts from nothing here, with everyone in.
    for (const each of match.troopers) Object.assign(each, { state: 'in', health: each.most, safeLeft: 0, speed: 0, firing: false, tags: 0 });
    match.score = [0, 0];
    const reds = match.troopers.filter(({ bot, team }) => bot && team === 1);
    Object.assign(reds[0], { x: -21, z: 5, heading: Math.PI });
    reds.slice(1).forEach((red, index) => Object.assign(red, { x: 20, z: -13.5 + index * 1.2 }));
    Object.assign(match.byNumber(10), { x: 12, z: 13.5 });
    Object.assign(match.child, { x: 6, z: 13.5 });
  });
  await ben.page.evaluate(() => Object.assign(window.__game.match.child, { state: 'in', health: 100, safeLeft: 0, rounds: 30, reloadLeft: 0, x: -21, z: 13, heading: 0, vx: 0, vz: 0 }));
  // Ben's screen has every one of them where Ana's game has put them.
  await soon(async () => {
    [ana, his] = [await matchOf(page), await matchOf(ben.page)];
    return Math.max(...ana.others.filter(({ bot }) => bot).map((bot) => gap(bot, byNumber(his, bot.number))));
  }).toBeLessThan(0.3);
  expect(gap(byNumber(his, 20), { x: -21, z: 5 })).toBeLessThan(0.3);
  // He closes his hand: his shots land on his own screen at once, Ana's game counts them, and it's a tag for the team.
  await hands(ben.page, { aim: FIST });
  await soon(async () => (await matchOf(ben.page)).hits).toBeGreaterThanOrEqual(1);
  await soon(async () => byNumber(await matchOf(page), 20).state, 30_000).toBe('out');
  await hands(ben.page);
  await soon(async () => {
    [ana, his] = [await matchOf(page), await matchOf(ben.page)];
    return JSON.stringify([ana.score, his.score, his.mine, byNumber(ana, 1).tags, byNumber(his, 20).state]);
  }).toBe(JSON.stringify([[1, 0], [1, 0], 1, 1, 'out']));
  await expect(ben.page.locator('#chip-blue')).toHaveText('1');
  await expect(ben.page.locator('#chip-mine')).toHaveText('1');
  await expect(page.locator('#chip-blue')).toHaveText('1');
  await expect(page.locator('#chip-mine')).toHaveText('0');
  // Who tagged whom is said on both screens, with Ben by his name on Ana's.
  await expect(page.locator('#feed li').last()).toContainText('Ben');
  await expect(ben.page.locator('#feed li').last()).toContainText('You');

  // Ben takes his hands out of the picture: he stands where he is, Ana's screen says so, and nothing waits for him.
  await hands(ben.page, { aim: null, move: null });
  await soon(async () => byNumber(await matchOf(page), 1).resting).toBe(true);
  expect((await matchOf(page)).state).toBe('playing');
  await expect(ben.page.locator('#prompt-text')).toHaveText('Show your hands to play!');
  await hands(ben.page);
  await soon(async () => byNumber(await matchOf(page), 1).resting).toBe(false);

  // The tenth tag wins it, on both screens at once, and neither one's own level moves on.
  await page.evaluate(() => {
    const { match } = window.__game;
    match.score[0] = 9;
    const red = match.byNumber(21);
    Object.assign(red, { safeLeft: 0 });
    match.hit(red, 1000, match.child);
  });
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('We won the match!');
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('We won the match!');
  [ana, his] = [await matchOf(page), await matchOf(ben.page)];
  expect([ana.state, his.state, ana.score[0], his.score[0]]).toEqual(['won', 'won', 10, 10]);
  expect([ana.ownLevel, his.ownLevel]).toEqual([4, 1]);
  // Each one's tags are on the other's finish card, by their name.
  await expect(page.locator('.friends-results')).toContainText('Ben');
  await expect(page.locator('.friends-results')).toContainText('1 tag');
  await expect(ben.page.locator('.friends-results')).toContainText('Ana');
  await shot(ben.page, 'arena-friends-won');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('two friends play against each other: each at their own start with nobody played by the computer, a hit counted by the game of whoever it lands on, and the first to the tags ends it for both', async ({ page, browser }) => {
  test.setTimeout(420_000);
  await openGame(page, { arenaHard: 'gentle', arenaWin: 5 }, GAME);
  const code = await makeMatch(page, 'Ana');
  // She chooses against each other in the friends box, and it's kept with her settings.
  await page.locator('input[name="friends-team"][value="against"]').check();
  await soon(() => page.evaluate(() => JSON.parse(localStorage.getItem('camera-games-settings')).arenaFriends)).toBe('against');

  const ben = await secondPlayer(browser);
  await openGame(ben.page, { arenaWin: 15 }, GAME, `#arena=${code}`);
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await ben.page.locator('#friends-name').fill('Ben');
  await ben.page.locator('#friends-name').dispatchEvent('change');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await bothPlaying(page, ben.page);

  // Everyone for themselves: one at each end, facing into the yard, to Ana's five tags, and anyone can be tagged out.
  let [ana, his] = [await matchOf(page), await matchOf(ben.page)];
  expect([ana.mode, his.mode, ana.goal, his.goal, ana.canLose, his.canLose]).toEqual(['rivals', 'rivals', 5, 5, true, true]);
  for (const each of [ana, his]) expect(each.others.filter(({ bot }) => bot)).toEqual([]);
  expect([[ana.child.x, ana.child.z], [his.child.x, his.child.z]]).toEqual([[0, 13], [0, -13]]);
  expect([ana.names, his.names]).toEqual([['Ben'], ['Ana']]);
  // On each screen the player is blue, and the other is red.
  expect([ana.shown[1].ring, his.shown[0].ring]).toEqual(['#e0533a', '#e0533a']);
  await expect(page.locator('#chip-blue-label')).toHaveText('You');
  await expect(page.locator('#chip-red-label')).toHaveText('Ben');
  await expect(ben.page.locator('#chip-red-label')).toHaveText('Ana');
  await expect(page.locator('#chip-mine-box')).toBeHidden();
  // Nobody's picture goes up: there's no Giraffe in this one.
  await expect(page.locator('#story-line')).not.toHaveText('Tag the red team! I’m right beside you!');

  // The two of them out in the open, a few paces apart, each facing the other, as each one's own game has them.
  await page.evaluate(() => Object.assign(window.__game.match.child, { x: -6.5, z: 3, heading: 0, vx: 0, vz: 0 }));
  await ben.page.evaluate(() => Object.assign(window.__game.match.child, { x: -6.5, z: -3, heading: Math.PI, vx: 0, vz: 0 }));
  await soon(async () => {
    [ana, his] = [await matchOf(page), await matchOf(ben.page)];
    return gap(byNumber(ana, 1), his.child) < 0.3 && gap(byNumber(his, 0), ana.child) < 0.3;
  }).toBe(true);
  // Ben is in front of her, with his name under his face, and it's his own tags that are beside hers along the top.
  await expect(page.locator('.arena-mark[data-where="on"] .arena-mark-name')).toHaveText('Ben');
  await page.waitForTimeout(1200);
  await shot(page, 'arena-friends-against');

  // Ana closes her hand. Her shots land on her screen at once, and it's Ben's game that counts them, and says
  // when he's out: a tag for her, on both screens.
  await hands(page, { aim: FIST });
  await soon(async () => (await matchOf(page)).hits).toBeGreaterThanOrEqual(1);
  await soon(async () => (await matchOf(ben.page)).child.health).toBeLessThan(100);
  await soon(async () => (await matchOf(ben.page)).child.state, 30_000).toBe('out');
  await hands(page);
  await soon(async () => {
    [ana, his] = [await matchOf(page), await matchOf(ben.page)];
    return JSON.stringify([ana.score.slice(0, 2), his.score.slice(0, 2), ana.mine, his.out, byNumber(ana, 1).state]);
  }).toBe(JSON.stringify([[1, 0], [1, 0], 1, 1, 'out']));
  await expect(page.locator('#chip-blue')).toHaveText('1');
  await expect(page.locator('#chip-red')).toHaveText('0');
  await expect(ben.page.locator('#chip-red')).toHaveText('1');
  await expect(ben.page.locator('#chip-blue')).toHaveText('0');
  // Ben is back at his own start a few seconds later, on both screens.
  await soon(async () => (await matchOf(ben.page)).child.state, 15_000).toBe('in');
  await soon(async () => gap(byNumber(await matchOf(page), 1), { x: 0, z: -13 })).toBeLessThan(0.5);

  // Ana's fifth tag ends it for both: she has won, and Ben is told it was a great game, with both their tags on each card.
  await ben.page.evaluate(() => {
    const { match } = window.__game;
    match.child.outBy[0] = 4;
    match.child.outs = 4;
    Object.assign(match.child, { safeLeft: 0 });
    match.hit(match.child, 1000, match.playerAt(0));
  });
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You won the match!');
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('Great game!');
  [ana, his] = [await matchOf(page), await matchOf(ben.page)];
  expect([ana.state, his.state, ana.score[0], his.score[0]]).toEqual(['won', 'over', 5, 5]);
  await expect(page.locator('.friends-results')).toContainText('Ben');
  await expect(ben.page.locator('.friends-results')).toContainText('5 tags');
  // There are no teams here, and the card doesn't speak of any.
  await expect(ben.page.locator('#sum-left-score').locator('xpath=..').locator('th')).toHaveText('You : the best of the others');
  await shot(ben.page, 'arena-friends-over');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a friend who closes the page in the middle is gone from the yard, and the other carries on with fewer tags to make', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { arenaHard: 'gentle', arenaWin: 5 }, GAME);
  const code = await makeMatch(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, {}, GAME, `#arena=${code}`);
  await soon(() => page.evaluate(() => window.__game.friends.room.members.length)).toBe(2);
  await bothPlaying(page, ben.page);
  expect((await matchOf(page)).goal).toBe(10);
  await ben.context.close();
  await soon(async () => byNumber(await matchOf(page), 1).state, 40_000).toBe('gone');
  const after = await matchOf(page);
  expect([after.state, after.goal]).toEqual(['playing', 5]);
  // Nobody's name is over anyone any more: only Giraffe and the red team are left to mark.
  expect(after.names).toEqual([]);
  await expect(page.locator('.arena-mark')).toHaveCount(4);
  expect(after.shown[1].visible).toBe(false);
  // And she can still play: the view follows her hand.
  const before = after.child.heading;
  await hands(page, { aim: { x: RING * 0.4 } });
  await soon(async () => (await matchOf(page)).child.heading - before).toBeGreaterThan(0.1);
});
