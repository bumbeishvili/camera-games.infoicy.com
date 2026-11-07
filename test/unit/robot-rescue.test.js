// The rules of Robot Rescue. Its screen is tested in test/e2e/robot-rescue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  AIM_HELP,
  Aim,
  BIG_SPOTS,
  Blaster,
  DRAIN_SECONDS,
  FILLS_ITSELF_AFTER,
  FIRE_RATE,
  LEVELS,
  Mission,
  PACES,
  PLACES,
  REFILL_SECONDS,
  REST_AFTER_SECONDS,
  readHand,
} from '../../games/robot-rescue/rescue.js';
import { RescueSound } from '../../games/robot-rescue/rescue-sound.js';
import { Sound } from '../../core/sound.js';

const DT = 1 / 60;
const FOLDER = new URL('../../games/robot-rescue/', import.meta.url);
const VOICE = new URL('audio/voice/', FOLDER);
const LINES = JSON.parse(readFileSync(new URL('lines.json', VOICE)));

const logged = () => {
  const events = [];
  return { events, onEvent: (event) => events.push(event), types: () => events.map(({ type }) => type), count: (type) => events.filter((event) => event.type === type).length };
};

/** The same "random" numbers each time, so a failure can be repeated. */
function steady(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const makeMission = (options = {}) => {
  const log = logged();
  const mission = new Mission({ random: steady(), onEvent: log.onEvent, ...options });
  mission.start();
  return { mission, log };
};

/** Runs the game for a while, with a hand doing the same thing all the way through. */
function run(mission, seconds, { hand = 'open', aim = () => null } = {}) {
  for (let t = 0; t < seconds; t += DT) {
    if (['won', 'lost'].includes(mission.phase)) return;
    mission.update(DT, { hand, target: aim(mission) });
  }
}

/** Aims at whatever there is to aim at, as the crosshair would. */
const firstTarget = (mission) => mission.targets()[0] ?? null;

/** Gets a robot of this kind out where it can be aimed at. */
function outKind(mission, kind) {
  const robot = mission.robots.find((each) => each.kind === kind) ?? mission.spawn(kind);
  if (kind === 'peeker') {
    robot.rise = 1;
    robot.state = 'ready';
  }
  return robot;
}

/** Plays a whole rescue with a hand that fires, and closes to reload whenever it runs out. */
function playThrough(mission) {
  let closing = 0;
  for (let t = 0; t < 900 && !['won', 'lost'].includes(mission.phase); t += DT) {
    if (mission.blaster.empty) closing = REFILL_SECONDS + 0.1;
    closing -= DT;
    const hand = closing > 0 ? 'closed' : 'open';
    mission.update(DT, { hand, target: hand === 'open' ? firstTarget(mission) : null });
  }
}

/* ---------- the hand ---------- */

const hand = (status, reason, extra = {}) => ({ side: 'right', handOpen: false, overlap: false, right: { status, reason }, left: { status: 'missing', reason: 'missing' }, ...extra });

test('only a hand read as open fires, and only one read as closed raises the shield', () => {
  assert.equal(readHand(hand('open', null, { handOpen: true })), 'open');
  assert.equal(readHand(hand('closed', 'closed')), 'closed');
});

test('anything uncertain does neither: gone, at the edge, too far away, or overlapping', () => {
  assert.equal(readHand(hand('missing', 'missing')), 'none');
  for (const reason of ['edge', 'small', 'overlap']) assert.equal(readHand(hand('closed', reason)), 'unsure', reason);
  assert.equal(readHand(hand('closed', 'closed', { overlap: true })), 'unsure');
});

test('the hand in play is the one that counts', () => {
  const left = { side: 'left', handOpen: true, overlap: false, left: { status: 'open', reason: null }, right: { status: 'closed', reason: 'closed' } };
  assert.equal(readHand(left), 'open');
  const closedLeft = { side: 'left', handOpen: false, overlap: false, left: { status: 'closed', reason: 'closed' }, right: { status: 'open', reason: null } };
  assert.equal(readHand(closedLeft), 'closed');
});

/* ---------- the blaster ---------- */

test('firing all the time empties the blaster in about three or four seconds', () => {
  const blaster = new Blaster();
  let seconds = 0;
  let shots = 0;
  let ranOut = 0;
  while (blaster.charge > 0 && seconds < 20) {
    const result = blaster.update(DT, { hand: 'open', aiming: true });
    shots += result.shots;
    if (result.ranOut) ranOut += 1;
    seconds += DT;
  }
  assert.ok(seconds >= 3 && seconds <= 4, `${seconds}`);
  assert.equal(Math.abs(seconds - DRAIN_SECONDS) < 0.05, true);
  assert.ok(Math.abs(shots - DRAIN_SECONDS * FIRE_RATE) <= 2, `${shots}`);
  assert.equal(ranOut, 1);
  assert.equal(blaster.update(DT, { hand: 'open', aiming: true }).shots, 0);
});

test('with nothing in the crosshair it doesn\'t fire, and doesn\'t lose any charge', () => {
  const blaster = new Blaster();
  for (let i = 0; i < 120; i += 1) assert.equal(blaster.update(DT, { hand: 'open', aiming: false }).shots, 0);
  assert.equal(blaster.charge, 1);
  assert.equal(blaster.firing, false);
});

test('only an open hand fires, whatever is in the crosshair', () => {
  for (const state of ['closed', 'none', 'unsure']) {
    const blaster = new Blaster();
    blaster.charge = 0.5;
    for (let i = 0; i < 120; i += 1) assert.equal(blaster.update(DT, { hand: state, aiming: true }).shots, 0, state);
    assert.equal(blaster.firing, false, state);
  }
});

test('a closed hand fills it well inside a second, and says so', () => {
  const blaster = new Blaster();
  blaster.charge = 0;
  let filled = 0;
  let seconds = 0;
  while (blaster.charge < 1 && seconds < 3) {
    if (blaster.update(DT, { hand: 'closed', aiming: false }).filled) filled += 1;
    seconds += DT;
  }
  assert.ok(seconds < 0.8, `${seconds}`);
  assert.equal(filled, 1);
  // A hand that closes with it nearly full doesn't count as reloading.
  blaster.charge = 0.97;
  blaster.lowest = 0.97;
  assert.equal(blaster.update(0.2, { hand: 'closed', aiming: false }).filled, false);
});

test('a hand out of view or uncertain doesn\'t reload', () => {
  for (const state of ['none', 'unsure', 'open']) {
    const blaster = new Blaster();
    blaster.charge = 0.4;
    blaster.update(1, { hand: state, aiming: false });
    assert.equal(blaster.charge, 0.4, state);
  }
});

test('with reloading off, it never runs out', () => {
  const blaster = new Blaster({ reloading: false });
  let shots = 0;
  for (let i = 0; i < 60 * 30; i += 1) shots += blaster.update(DT, { hand: 'open', aiming: true }).shots;
  assert.equal(blaster.charge, 1);
  assert.ok(shots > 100);
});

test('a child who can\'t close yet isn\'t stuck: after a while it fills up by itself', () => {
  const blaster = new Blaster();
  blaster.charge = 0;
  blaster.update(FILLS_ITSELF_AFTER - 1, { hand: 'open', aiming: true });
  assert.equal(blaster.charge, 0);
  assert.equal(blaster.empty, true);
  for (let t = 0; t < 1.2; t += DT) blaster.update(DT, { hand: 'open', aiming: true });
  assert.equal(blaster.fillingItself, true);
  // It doesn't dribble out while it's filling, as that would look broken.
  const during = blaster.update(DT, { hand: 'open', aiming: true });
  assert.equal(during.shots, 0);
  for (let t = 0; t < 4; t += DT) blaster.update(DT, { hand: 'open', aiming: false });
  assert.equal(blaster.charge, 1);
  assert.equal(blaster.fillingItself, false);
});

/* ---------- aiming ---------- */

const HEIGHT = 720;
const robotAt = (x, y, size = 40) => ({ ref: { x, y }, x, y, size });

test('the crosshair is pulled onto what\'s near it', () => {
  const aim = new Aim();
  const target = robotAt(500, 300);
  let locked = null;
  for (let i = 0; i < 90; i += 1) locked = aim.update(DT, 560, 340, [target], AIM_HELP.little, HEIGHT);
  assert.equal(locked, target.ref);
  assert.ok(Math.hypot(aim.x - 500, aim.y - 300) < 10);
});

test('more reach help reaches further', () => {
  const lockedFrom = (distance, help) => {
    const aim = new Aim();
    const target = robotAt(400, 300);
    let locked = null;
    for (let i = 0; i < 120; i += 1) locked = aim.update(DT, 400 + distance, 300, [target], help, HEIGHT);
    return locked === target.ref;
  };
  assert.equal(lockedFrom(170, AIM_HELP.none), false);
  assert.equal(lockedFrom(170, AIM_HELP.little), true);
  assert.equal(lockedFrom(280, AIM_HELP.little), false);
  assert.equal(lockedFrom(280, AIM_HELP.lots), true);
  // Even the least help gets a hand that's only nearly there the rest of the way.
  assert.equal(lockedFrom(70, AIM_HELP.none), true);
});

test('with nothing in reach it stays with the hand, and isn\'t on anything', () => {
  const aim = new Aim();
  let locked = 'something';
  for (let i = 0; i < 90; i += 1) locked = aim.update(DT, 900, 600, [robotAt(100, 100)], AIM_HELP.little, HEIGHT);
  assert.equal(locked, null);
  assert.ok(Math.hypot(aim.x - 900, aim.y - 600) < 5);
});

test('it goes for the nearest, and doesn\'t flip back and forth between two', () => {
  const aim = new Aim();
  const near = robotAt(520, 300);
  const far = robotAt(700, 300);
  for (let i = 0; i < 60; i += 1) aim.update(DT, 560, 300, [near, far], AIM_HELP.lots, HEIGHT);
  assert.equal(aim.locked, near.ref);
  // The hand drifts to just past half way: it stays with the one it has.
  for (let i = 0; i < 60; i += 1) aim.update(DT, 615, 300, [near, far], AIM_HELP.lots, HEIGHT);
  assert.equal(aim.locked, near.ref);
  // Now clearly nearer the other.
  for (let i = 0; i < 90; i += 1) aim.update(DT, 690, 300, [near, far], AIM_HELP.lots, HEIGHT);
  assert.equal(aim.locked, far.ref);
});

test('a target that\'s gone isn\'t aimed at any more', () => {
  const aim = new Aim();
  const target = robotAt(500, 300);
  for (let i = 0; i < 60; i += 1) aim.update(DT, 500, 300, [target], AIM_HELP.lots, HEIGHT);
  assert.equal(aim.locked, target.ref);
  assert.equal(aim.update(DT, 500, 300, [], AIM_HELP.lots, HEIGHT), null);
});

test('a wobbling hand moves the crosshair much less than the hand moves', () => {
  const aim = new Aim();
  let furthest = 0;
  for (let i = 0; i < 240; i += 1) {
    aim.update(DT, 400 + Math.sin(i * 1.3) * 12, 300 + Math.cos(i * 1.7) * 12, [], AIM_HELP.little, HEIGHT);
    if (i > 60) furthest = Math.max(furthest, Math.hypot(aim.x - 400, aim.y - 300));
  }
  assert.ok(furthest < 6, `${furthest}`);
});

test('a quick move of the hand isn\'t held back by the steadying', () => {
  const aim = new Aim();
  aim.update(DT, 100, 300, [], AIM_HELP.little, HEIGHT);
  let frames = 0;
  while (Math.abs(aim.x - 900) > 30 && frames < 120) {
    aim.update(DT, 900, 300, [], AIM_HELP.little, HEIGHT);
    frames += 1;
  }
  assert.ok(frames < 30, `${frames} frames`);
});

test('a hand that has gone isn\'t aiming at anything', () => {
  const aim = new Aim();
  const target = robotAt(500, 300);
  for (let i = 0; i < 60; i += 1) aim.update(DT, 500, 300, [target], AIM_HELP.lots, HEIGHT);
  aim.lose();
  assert.equal(aim.locked, null);
  assert.equal(aim.seen, false);
});

/* ---------- robots ---------- */

test('the robots are there from the very start, and nobody waits for them', () => {
  for (const pace of Object.keys(PACES)) {
    const { mission } = makeMission({ pace });
    assert.equal(mission.phase, 'fighting');
    assert.ok(mission.robots.length >= 3, pace);
    assert.ok(mission.targets().length >= 1, pace);
  }
});

test('an open hand on a robot fires and drops it', () => {
  const { mission, log } = makeMission();
  const walker = outKind(mission, 'walker');
  const count = mission.stats.robots;
  run(mission, 2, { aim: () => (mission.robots.includes(walker) ? walker : null) });
  assert.ok(log.count('shot') >= walker.maxHp);
  assert.ok(log.count('robot-hit') >= walker.maxHp - 1);
  assert.ok(!mission.robots.includes(walker));
  assert.equal(mission.stats.robots, count + 1);
  assert.ok(log.events.some(({ type, robot }) => type === 'robot-dropped' && robot === walker));
});

test('a closed hand doesn\'t fire, and raises the shield', () => {
  const { mission, log } = makeMission();
  const walker = outKind(mission, 'walker');
  run(mission, 2, { hand: 'closed', aim: () => walker });
  assert.equal(log.count('shot'), 0);
  assert.equal(mission.shield, true);
  assert.equal(walker.hp, walker.maxHp);
});

test('a closed hand refills the blaster in the middle of a fight', () => {
  const { mission, log } = makeMission();
  run(mission, DRAIN_SECONDS + 0.5, { aim: firstTarget });
  assert.ok(log.count('empty') === 1);
  assert.equal(mission.blaster.empty, true);
  run(mission, REFILL_SECONDS + 0.1, { hand: 'closed' });
  assert.equal(mission.blaster.charge, 1);
  assert.equal(log.count('reloaded'), 1);
});

test('a hand out of view does neither', () => {
  for (const state of ['none', 'unsure']) {
    const { mission, log } = makeMission();
    mission.blaster.charge = 0.5;
    const walker = outKind(mission, 'walker');
    run(mission, 1.5, { hand: state, aim: () => walker });
    assert.equal(log.count('shot'), 0, state);
    assert.equal(mission.shield, false, state);
    assert.equal(mission.blaster.charge, 0.5, state);
  }
});

test('peekers can only be aimed at when they\'ve popped up', () => {
  const { mission } = makeMission();
  const peeker = outKind(mission, 'peeker');
  assert.ok(mission.targets().includes(peeker));
  peeker.rise = 0;
  peeker.state = 'hidden';
  assert.ok(!mission.targets().includes(peeker));
});

test('peekers keep popping up, somewhere each time', () => {
  const { mission, log } = makeMission();
  const before = log.count('peek');
  run(mission, 30, { hand: 'open' });
  assert.ok(log.count('peek') > before + 2);
});

test('walkers don\'t stand about for long, and stay where they can be seen', () => {
  const { mission } = makeMission();
  const walker = outKind(mission, 'walker');
  const visited = new Set();
  for (let t = 0; t < 40; t += DT) {
    mission.update(DT, { hand: 'open', target: null });
    if (walker.state === 'ready') visited.add(walker.post);
  }
  assert.ok(visited.size >= 2);
});

test('every place keeps its robots where they can be seen from the tram', () => {
  // The view is about 0.9 of a distance wide to each side, and robots shouldn't be right at its edge.
  const inView = (x, z, name) => assert.ok(Math.abs(x) <= z * 0.8, `${name} at ${x}, ${z}`);
  for (const { id, posts, covers, air, cage, big } of PLACES) {
    for (const [x, z] of posts) inView(x, z, `${id} post`);
    for (const [x, z] of covers) inView(x, z, `${id} cover`);
    for (const [x, , z] of air) inView(x, z, `${id} air`);
    inView(cage[0], cage[1], `${id} cage`);
    if (big) inView(big[0], big[1], `${id} big`);
    assert.ok(posts.length >= 5 && covers.length >= 4 && air.length >= 3, id);
  }
});

test('nobody stands inside anything: not a cover, not a cage, and not the big one', () => {
  const clear = (a, b, gap, name) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= gap, `${name}: ${a} and ${b}`);
  for (const { id, posts, covers, cage, big } of PLACES) {
    for (const post of posts) {
      for (const cover of covers) clear(post, cover, 1.4, `${id} post and cover`);
      clear(post, cage, 2.6, `${id} post and cage`);
      if (big) clear(post, big, 5, `${id} post and big one`);
    }
    for (const cover of covers) clear(cover, cage, 2.6, `${id} cover and cage`);
    for (const [i, cover] of covers.entries()) {
      for (const other of covers.slice(i + 1)) clear(cover, other, 2, `${id} covers`);
    }
  }
});

/* ---------- goo ---------- */

/** Throws one goo at the tram, as a robot would. */
function throwOne(mission) {
  const robot = outKind(mission, 'walker');
  robot.state = 'ready';
  robot.throwing = 0;
  mission.throwGoo(robot);
  return mission.goo.at(-1);
}

test('the shield stops goo, and it costs nothing', () => {
  const { mission, log } = makeMission();
  mission.holdThrows = 999;
  const goo = throwOne(mission);
  const hearts = mission.hearts;
  run(mission, goo.seconds + 0.1, { hand: 'closed' });
  assert.equal(mission.hearts, hearts);
  assert.equal(log.count('goo-blocked'), 1);
  assert.equal(log.count('goo-hit'), 0);
  assert.equal(mission.stats.gooBlocked, 1);
});

test('without the shield, goo costs a heart', () => {
  const { mission, log } = makeMission();
  mission.holdThrows = 999;
  const goo = throwOne(mission);
  const hearts = mission.hearts;
  run(mission, goo.seconds + 0.1, { hand: 'open' });
  assert.equal(mission.hearts, hearts - 1);
  assert.equal(log.count('goo-hit'), 1);
  assert.equal(log.count('goo-blocked'), 0);
});

test('a hand that can\'t be read doesn\'t count as a shield', () => {
  const { mission, log } = makeMission();
  mission.holdThrows = 999;
  const goo = throwOne(mission);
  // Just short of counting as a rest, since a rest would take the goo away.
  mission.restFor = 0;
  run(mission, goo.seconds + 0.1, { hand: 'unsure' });
  assert.equal(log.count('goo-hit'), 1);
});

test('goo can be shot out of the air', () => {
  const { mission, log } = makeMission();
  mission.holdThrows = 999;
  const goo = throwOne(mission);
  assert.ok(mission.targets().includes(goo));
  const hearts = mission.hearts;
  run(mission, 0.5, { aim: () => (mission.goo.includes(goo) ? goo : null) });
  assert.ok(!mission.goo.includes(goo));
  assert.equal(log.count('goo-shot'), 1);
  assert.equal(mission.stats.gooShot, 1);
  run(mission, goo.seconds, { hand: 'open' });
  assert.equal(mission.hearts, hearts);
});

test('goo is slow enough to see coming, even on the hardest setting', () => {
  for (const level of Object.keys(LEVELS)) {
    const { mission } = makeMission({ level });
    assert.ok(throwOne(mission).seconds >= 2, level);
  }
});

test('at the first stop, nothing\'s thrown until a robot has been dropped', () => {
  const { mission, log } = makeMission({ level: 'tough' });
  run(mission, 10, { hand: 'open' });
  assert.equal(log.count('goo'), 0);
  const walker = outKind(mission, 'walker');
  run(mission, 1.5, { aim: () => (mission.robots.includes(walker) ? walker : null) });
  run(mission, 8, { hand: 'open' });
  assert.ok(log.count('goo') > 0);
});

test('robots wind up where they can be seen before they throw', () => {
  const { mission, log } = makeMission();
  mission.holdThrows = 0;
  mission.throwIn = 0;
  run(mission, 20, { hand: 'open' });
  const types = log.types();
  assert.ok(types.indexOf('windup') >= 0 && types.indexOf('windup') < types.indexOf('goo'));
});

test('there\'s never more goo in the air than the difficulty allows', () => {
  for (const [name, level] of Object.entries(LEVELS)) {
    const { mission } = makeMission({ level: name });
    mission.holdThrows = 0;
    for (let t = 0; t < 60; t += DT) {
      mission.update(DT, { hand: 'open', target: null });
      assert.ok(mission.goo.length <= level.gooInAir, name);
    }
  }
});

test('on Gentle a child can\'t lose: hearts stop at one', () => {
  const { mission, log } = makeMission({ level: 'gentle' });
  mission.holdThrows = 0;
  let lowest = mission.hearts;
  for (let i = 0; i < 12; i += 1) {
    const goo = throwOne(mission);
    run(mission, goo.seconds + 0.1, { hand: 'open' });
    lowest = Math.min(lowest, mission.hearts);
  }
  assert.equal(lowest, 1);
  assert.equal(mission.hearts, 1);
  assert.notEqual(mission.phase, 'lost');
  assert.equal(log.count('lost'), 0);
});

test('on the harder settings, running out of hearts ends the game', () => {
  for (const level of ['medium', 'tough']) {
    const { mission, log } = makeMission({ level });
    mission.holdThrows = 999;
    for (let i = 0; i < LEVELS[level].hearts && mission.hearts > 0; i += 1) {
      const goo = throwOne(mission);
      run(mission, goo.seconds + 0.1, { hand: 'open' });
    }
    assert.equal(mission.hearts, 0, level);
    run(mission, 2, { hand: 'open' });
    assert.equal(mission.phase, 'lost', level);
    assert.equal(log.count('lost'), 1, level);
  }
});

test('freeing a friend gives a heart back, up to as many as there were', () => {
  const { mission } = makeMission();
  mission.hearts = 1;
  mission.queue = [];
  mission.robots = [];
  mission.update(DT, { hand: 'open' });
  assert.equal(mission.hearts, 2);
  const again = makeMission().mission;
  again.queue = [];
  again.robots = [];
  again.update(DT, { hand: 'open' });
  assert.equal(again.hearts, LEVELS.gentle.hearts);
});

/* ---------- resting ---------- */

test('a hand gone for a few seconds means resting: no throwing, and nothing bad happens', () => {
  for (const state of ['none', 'closed', 'unsure']) {
    const { mission, log } = makeMission({ level: 'tough' });
    mission.holdThrows = 0;
    mission.throwIn = 0;
    run(mission, REST_AFTER_SECONDS + 0.1, { hand: state });
    assert.equal(mission.resting, true, state);
    assert.equal(log.count('rest'), 1, state);
    const hearts = mission.hearts;
    const thrown = log.count('goo');
    run(mission, 60, { hand: state });
    assert.equal(log.count('goo'), thrown, state);
    assert.equal(mission.hearts, hearts, state);
    assert.equal(mission.goo.length, 0, state);
    assert.notEqual(mission.phase, 'lost', state);
  }
});

test('goo already in the air goes when a rest starts', () => {
  const { mission, log } = makeMission();
  mission.holdThrows = 999;
  run(mission, REST_AFTER_SECONDS - 0.5, { hand: 'none' });
  throwOne(mission);
  const hearts = mission.hearts;
  run(mission, 1, { hand: 'none' });
  assert.equal(mission.goo.length, 0);
  assert.equal(log.count('goo-gone'), 1);
  assert.equal(mission.hearts, hearts);
});

test('walkers stop and stay put while the child rests, and peekers stay up to wave', () => {
  const { mission } = makeMission();
  const walker = outKind(mission, 'walker');
  const peeker = outKind(mission, 'peeker');
  run(mission, REST_AFTER_SECONDS + 0.1, { hand: 'none' });
  const at = [walker.x, walker.z];
  peeker.state = 'ready';
  peeker.rise = 1;
  run(mission, 20, { hand: 'none' });
  assert.deepEqual([walker.x, walker.z], at);
  assert.equal(peeker.state, 'ready');
});

test('opening the hand ends a rest straight away, with a moment before anything is thrown', () => {
  const { mission, log } = makeMission();
  run(mission, REST_AFTER_SECONDS + 1, { hand: 'none' });
  mission.holdThrows = 0;
  mission.throwIn = 0;
  mission.update(DT, { hand: 'open' });
  assert.equal(mission.resting, false);
  assert.equal(log.count('rest-over'), 1);
  assert.ok(mission.throwIn > 1);
});

/* ---------- the story ---------- */

test('dealing with every robot here frees the friend, and the tram moves on', () => {
  const { mission, log } = makeMission();
  assert.equal(mission.place.who, 'truffle');
  run(mission, 120, { aim: firstTarget, hand: 'open' });
  assert.ok(log.count('freed') >= 1);
  const freed = log.events.find(({ type }) => type === 'freed');
  assert.equal(freed.place.who, 'truffle');
  assert.equal(mission.freed >= 1, true);
  assert.ok(log.types().indexOf('moving') > log.types().indexOf('freed'));
});

test('the moves between stops take two to three seconds, and the next robots are already there', () => {
  for (const [pace, { moveSeconds }] of Object.entries(PACES)) {
    assert.ok(moveSeconds >= 2 && moveSeconds <= 3, pace);
    const { mission, log } = makeMission({ pace });
    mission.queue = [];
    for (const robot of [...mission.robots]) mission.drop(robot);
    let seconds = 0;
    while (mission.phase !== 'moving' && seconds < 5) {
      mission.update(DT, { hand: 'open' });
      seconds += DT;
    }
    assert.ok(seconds < 1.5, `${pace}: ${seconds}`);
    assert.equal(mission.phase, 'moving', pace);
    assert.ok(mission.robots.length >= 3, pace);
    let moving = 0;
    while (mission.phase === 'moving' && moving < 5) {
      mission.update(DT, { hand: 'open' });
      moving += DT;
    }
    assert.ok(Math.abs(moving - moveSeconds) < 0.1, `${pace}: ${moving}`);
    assert.equal(log.count('arrived'), 2, pace);
    assert.equal(mission.phase, 'fighting', pace);
  }
});

test('in the short rescue the tram has further to go, and still takes no more than three seconds', () => {
  for (const pace of Object.keys(PACES)) {
    const { mission } = makeMission({ pace, stops: 3 });
    mission.queue = [];
    for (const robot of [...mission.robots]) mission.drop(robot);
    while (mission.phase !== 'moving') mission.update(DT, { hand: 'open' });
    assert.ok(mission.moveSeconds >= 2 && mission.moveSeconds <= 3, pace);
  }
});

test('nothing is thrown while the tram is moving', () => {
  const { mission, log } = makeMission({ level: 'tough' });
  mission.queue = [];
  for (const robot of [...mission.robots]) mission.drop(robot);
  while (mission.phase !== 'moving') mission.update(DT, { hand: 'open' });
  const thrown = log.count('goo');
  while (mission.phase === 'moving') mission.update(DT, { hand: 'open' });
  assert.equal(log.count('goo'), thrown);
});

test('the whole rescue can be finished, and everyone gets freed in turn', () => {
  const { mission, log } = makeMission();
  playThrough(mission);
  assert.equal(mission.phase, 'won');
  assert.equal(log.count('won'), 1);
  assert.deepEqual(log.events.filter(({ type }) => type === 'freed').map(({ place }) => place.who), PLACES.map(({ who }) => who));
  assert.equal(mission.stats.friends, PLACES.length);
  // Any helpers still to come when the big one goes down don't need to be dealt with.
  const total = PLACES.reduce((sum, { robots }) => sum + robots.length, 0);
  const atTheEnd = PLACES.at(-1).robots.length;
  assert.ok(mission.stats.robots <= total && mission.stats.robots > total - atTheEnd, `${mission.stats.robots}`);
});

test('the short rescue has three stops, and still ends with Joze', () => {
  const { mission, log } = makeMission({ stops: 3 });
  assert.equal(mission.stops.length, 3);
  assert.equal(mission.stops.at(-1).who, 'joze');
  playThrough(mission);
  assert.equal(mission.phase, 'won');
  assert.equal(log.events.filter(({ type }) => type === 'freed').at(-1).place.who, 'joze');
});

test('Joze comes last, and each stop has someone different in it', () => {
  assert.equal(PLACES.at(-1).who, 'joze');
  assert.equal(new Set(PLACES.map(({ who }) => who)).size, PLACES.length);
  assert.ok(PLACES.at(-1).robots.includes('big'));
  assert.ok(!PLACES.slice(0, -1).some(({ robots }) => robots.includes('big')));
});

test('every kind of robot turns up along the way', () => {
  const kinds = new Set(PLACES.flatMap(({ robots }) => robots));
  assert.deepEqual([...kinds].sort(), ['big', 'drone', 'peeker', 'walker']);
});

/* ---------- the big one ---------- */

function atTheBigOne(options = {}) {
  const { mission, log } = makeMission(options);
  while (mission.place.id !== 'tower') {
    mission.queue = [];
    for (const robot of [...mission.robots]) mission.drop(robot);
    while (mission.phase !== 'fighting' || mission.leftHere === 0) mission.update(DT, { hand: 'open' });
  }
  return { mission, log, big: mission.robots.find(({ kind }) => kind === 'big') };
}

test('the big one can\'t be hit, except in a weak spot that has opened', () => {
  const { mission, big } = atTheBigOne();
  assert.ok(big);
  assert.ok(!mission.targets().includes(big));
  assert.equal(big.spots.length, LEVELS.gentle.bigSpots);
  assert.ok(big.spots.every(({ open }) => !open));
  run(mission, 1, { hand: 'open' });
  const open = big.spots.filter((spot) => spot.open);
  assert.equal(open.length, 1);
  assert.ok(mission.targets().includes(open[0]));
});

test('its weak spots open up one at a time, with hardly a wait', () => {
  const { mission, big, log } = atTheBigOne();
  for (const [index, spot] of big.spots.entries()) {
    run(mission, 1, { hand: 'open' });
    assert.equal(spot.open, true, `spot ${index}`);
    assert.equal(big.spots.filter(({ open }) => open).length, 1);
    run(mission, 4, { aim: () => (spot.open ? spot : null) });
    assert.equal(spot.done, true, `spot ${index}`);
    mission.blaster.charge = 1;
  }
  assert.equal(log.count('spot-done'), big.spots.length);
});

test('when the big one goes, its helpers all go with it, and Joze is freed', () => {
  const { mission, big, log } = atTheBigOne();
  run(mission, 1, { hand: 'open' });
  assert.ok(mission.robots.length > 1);
  for (const spot of big.spots) {
    run(mission, 1, { hand: 'open' });
    run(mission, 4, { aim: () => (spot.open ? spot : null) });
    mission.blaster.charge = 1;
  }
  assert.ok(!mission.robots.length);
  assert.equal(mission.queue.length, 0);
  assert.ok(log.events.some(({ type, robot }) => type === 'robot-dropped' && robot === big));
  assert.ok(log.events.some(({ type, place }) => type === 'freed' && place.who === 'joze'));
  run(mission, 5, { hand: 'open' });
  assert.equal(mission.phase, 'won');
});

test('harder settings have more weak spots', () => {
  assert.ok(LEVELS.gentle.bigSpots < LEVELS.medium.bigSpots);
  assert.ok(LEVELS.medium.bigSpots <= LEVELS.tough.bigSpots);
  assert.ok(LEVELS.tough.bigSpots <= BIG_SPOTS.length);
});

/* ---------- settings ---------- */

test('settings saved by an older version don\'t break anything', () => {
  const { mission } = makeMission({ pace: 'warp', level: 'impossible' });
  assert.equal(mission.pace, PACES.slow);
  assert.equal(mission.level, LEVELS.gentle);
});

test('speed, difficulty and reloading can change in the middle of a game', () => {
  const { mission } = makeMission();
  mission.blaster.charge = 0.3;
  mission.configure({ pace: 'fast', level: 'tough', reloading: false });
  assert.equal(mission.pace, PACES.fast);
  assert.equal(mission.level, LEVELS.tough);
  assert.equal(mission.blaster.charge, 1);
  assert.equal(mission.blaster.reloading, false);
  assert.ok(mission.hearts <= LEVELS.tough.hearts);
});

test('faster has more robots out at once, and harder throws more often', () => {
  assert.ok(PACES.slow.atOnce < PACES.medium.atOnce && PACES.medium.atOnce < PACES.fast.atOnce);
  assert.ok(LEVELS.gentle.throwEvery > LEVELS.medium.throwEvery && LEVELS.medium.throwEvery > LEVELS.tough.throwEvery);
  assert.ok(LEVELS.gentle.gooSeconds > LEVELS.tough.gooSeconds);
  assert.equal(LEVELS.gentle.canLose, false);
});

test('the game counts what it says it counts', () => {
  const { mission } = makeMission();
  playThrough(mission);
  const { stats } = mission;
  assert.ok(stats.robots > 0 && stats.friends === PLACES.length && stats.shots >= stats.robots);
  assert.ok(stats.reloads > 0);
});

/* ---------- talking ---------- */

const MOST_WORDS = 10; // Children are here to move, and nobody's waiting for anyone to finish talking.

test('robot-rescue keeps its talking short, and everything it says has a voice in both languages', () => {
  assert.ok(LINES.length <= 14);
  for (const { id, text, ka } of LINES) {
    assert.ok(text.split(/\s+/).length <= MOST_WORDS, `too long: ${text}`);
    assert.ok(ka.split(/\s+/).length <= MOST_WORDS, `too long: ${ka}`);
    assert.match(ka, /[Ⴀ-ჿ]/, id);
    for (const language of ['en', 'ka']) assert.ok(existsSync(new URL(`${language}/${id}.ogg`, VOICE)), `${language}/${id}`);
  }
  const source = readFileSync(new URL('main.js', FOLDER), 'utf8');
  const rules = readFileSync(new URL('rescue.js', FOLDER), 'utf8');
  for (const { text } of LINES) assert.ok(source.includes(text) || rules.includes(text), `nothing says: ${text}`);
});

test('there are no voice files left over from lines that have gone', () => {
  const ids = new Set(LINES.map(({ id }) => id));
  for (const language of ['en', 'ka']) {
    for (const file of readdirSync(new URL(`${language}/`, VOICE))) assert.ok(ids.has(file.replace('.ogg', '')), `${language}/${file}`);
  }
});

test('each character speaks in their own voice, the same as everywhere else', () => {
  const shared = JSON.parse(readFileSync(new URL('../../core/body/voice/lines.json', import.meta.url)));
  const own = Object.fromEntries(shared.filter(({ id }) => id.startsWith('shout-')).map((line) => [line.id.replace('shout-', ''), line]));
  const speakers = LINES.filter(({ voice }) => voice);
  assert.ok(speakers.length >= PLACES.length);
  for (const { id, voice, kaVoice, kaPitch } of speakers) {
    const { voice: wanted, kaVoice: wantedKa, kaPitch: wantedPitch } = own[id.split('-')[0]];
    assert.deepEqual({ voice, kaVoice, kaPitch }, { voice: wanted, kaVoice: wantedKa, kaPitch: wantedPitch }, id);
  }
});

test('every friend has one thing to say when freed, and it\'s in the lines', () => {
  const texts = new Set(LINES.map(({ text }) => text));
  for (const { who, thanks } of PLACES) {
    assert.ok(texts.has(thanks), thanks);
    assert.ok(LINES.some(({ id, text }) => id.startsWith(`${who}-`) && text === thanks), who);
  }
});

/* ---------- the rules of the house ---------- */

const CODE = readdirSync(FOLDER).filter((file) => file.endsWith('.js'));

test('the game\'s sounds don\'t take over anything the shared sound code needs', () => {
  // A method here called unlock once replaced the one that starts the audio, and there was no sound.
  const own = Object.getOwnPropertyNames(RescueSound.prototype).filter((name) => name !== 'constructor');
  const shared = new Set([...Object.getOwnPropertyNames(Sound.prototype), ...Object.keys(new Sound())]);
  assert.deepEqual(own.filter((name) => shared.has(name)), ['finish']);
  // The same goes for what it keeps for itself, as the shared code has things of its own to keep.
  const kept = Object.keys(new RescueSound()).filter((name) => !Object.keys(new Sound()).includes(name));
  assert.deepEqual(kept.sort(), ['lastAt', 'lost']);
});

test('things that can happen a lot at once don\'t all make their sound', () => {
  const sound = new RescueSound();
  sound.context = { currentTime: 10 };
  const played = [];
  sound.play = (name) => played.push(name);
  for (let i = 0; i < 6; i += 1) sound.fallApart();
  assert.equal(played.length, 1);
  sound.context.currentTime = 10.5;
  sound.fallApart();
  assert.equal(played.length, 2);
  // When the big one comes down, its helpers don't add to it.
  played.length = 0;
  sound.bigFallsApart();
  for (let i = 0; i < 6; i += 1) sound.fallApart();
  assert.deepEqual(played, ['crash', 'boom']);
  played.length = 0;
  for (let i = 0; i < 6; i += 1) sound.popUp();
  assert.deepEqual(played, ['boing']);
});

test('nothing here makes its own sound: no browser speech, and no generated tones', () => {
  for (const file of CODE) {
    const source = readFileSync(new URL(file, FOLDER), 'utf8');
    for (const word of ['speechSynthesis', 'createOscillator', 'OscillatorNode', 'SpeechSynthesisUtterance']) {
      assert.ok(!source.includes(word), `${file}: ${word}`);
    }
  }
});

test('no game object has a method called then, which would make await hang for ever', () => {
  for (const file of CODE) {
    const source = readFileSync(new URL(file, FOLDER), 'utf8');
    assert.ok(!/^\s*(async\s+)?then\s*\(/m.test(source), file);
    assert.ok(!/\bthen\s*[:=]\s*(\(|function|async)/.test(source), file);
  }
});

test('the rules have no screen in them, so that they can run here', () => {
  const rules = readFileSync(new URL('rescue.js', FOLDER), 'utf8');
  assert.ok(!/\b(document|window|THREE)\b/.test(rules));
  assert.ok(!/^import /m.test(rules));
});

test('everything is on this computer', () => {
  for (const file of [...CODE, 'index.html', 'style.css']) {
    const source = readFileSync(new URL(file, FOLDER), 'utf8');
    assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(source), file);
  }
});

test('the page keeps the same security as the other games, with no styles written into it', () => {
  const page = readFileSync(new URL('index.html', FOLDER), 'utf8');
  const other = readFileSync(new URL('../lighthouse/index.html', FOLDER), 'utf8');
  const policy = (html) => html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.equal(policy(page), policy(other));
  assert.ok(!/ style=/.test(page));
  assert.ok(!/<style/.test(page));
  const main = readFileSync(new URL('main.js', FOLDER), 'utf8');
  assert.ok(!/ style=/.test(main));
});

test('nothing lights up the whole screen: there are no full-screen effects to find', () => {
  for (const file of CODE) {
    const source = readFileSync(new URL(file, FOLDER), 'utf8');
    assert.ok(!/fillRect\(0,\s*0,\s*width,\s*height\)/.test(source), file);
    assert.ok(!/emissive/.test(source), file);
  }
});
