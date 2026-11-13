// The rules of Frost Arena. Its screen is tested in test/e2e/frost-arena.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { AIM_HELP, BASES, BLOCKS, BODY, CRATE_SPOTS, HEALTH, LEVELS, MAGAZINE, Match, NEWS, PACES, POWERS, REST_AFTER, RIFLES, TAGS_TO_WIN, YARD, clearLine, forwardOf, freeAt, headingTo, levelPlan, newsAt, readHelper, reachAlong, stepTowards, turnBetween, wayTo } from '../../games/frost-arena/arena.js';

const STEP = 1 / 60;

function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** A match that has begun, with what happens in it written down. */
function start(options = {}) {
  const events = [];
  const match = new Match({ random: seeded(options.seed ?? 7), onEvent: (event) => events.push(event), ...options });
  match.begin();
  return { match, events, count: (type, when = () => true) => events.filter((event) => event.type === type && when(event)).length };
}

const HANDS_DOWN = { steer: 0, fire: false, walk: false, fist: false };
const FIRE = { ...HANDS_DOWN, fire: true };
const WALK = { ...HANDS_DOWN, walk: true };

const run = (match, seconds, input = HANDS_DOWN) => {
  for (let i = 0; i < Math.round(seconds / STEP); i += 1) match.update(STEP, typeof input === 'function' ? input() : input);
};

const reds = (match) => match.troopers.filter(({ team }) => team === 1);

/**
 * One of the other team stands this far in front of the child, this far round to the right of straight ahead,
 * and stays there. The rest are out of the way. The child is at the near end of the alley down one side of the
 * yard, looking up it, where there's nothing in the way.
 */
function standInFront(match, away = 10, off = 0) {
  const { child } = match;
  Object.assign(child, { x: -21, z: 13, heading: 0 });
  const [first, ...others] = reds(match);
  const way = forwardOf(child.heading + off);
  Object.assign(first, { x: child.x + way.x * away, z: child.z + way.z * away, bot: false, safeLeft: 0, shield: 0 });
  for (const other of others) Object.assign(other, { x: 20, z: -13.5, bot: false });
  for (const mate of match.troopers.filter(({ team, bot }) => team === 0 && bot)) Object.assign(mate, { x: -20, z: 13.5, bot: false });
  return first;
}

/* ---------- the yard ---------- */

test('the yard is the same from both ends, with each team\'s places on free ground facing the other', () => {
  for (const block of BLOCKS) {
    assert.ok(BLOCKS.some((other) => Math.abs(other.x + block.x) < 1e-9 && Math.abs(other.z + block.z) < 1e-9 && other.w === block.w && other.d === block.d && other.h === block.h), `${block.kind} at ${block.x}, ${block.z} has its other half`);
    assert.ok(Math.abs(block.x) + block.w / 2 < YARD.halfX && Math.abs(block.z) + block.d / 2 < YARD.halfZ, 'inside the fence');
  }
  for (const [team, base] of BASES.entries()) {
    for (const x of base.spots) assert.ok(freeAt(x, base.z), `team ${team} at ${x}`);
    assert.equal(Math.sign(base.z), team === 0 ? 1 : -1);
    // Facing up the yard, towards the other end.
    assert.ok(forwardOf(base.heading).z * base.z < 0);
  }
  assert.deepEqual([BASES[0].z, BASES[0].spots], [-BASES[1].z, BASES[1].spots.map((x) => (x === 0 ? 0 : -x))]);
});

test('everywhere a player can stand can be walked to from both ends, and there\'s room to get round everything', () => {
  for (const base of BASES) {
    const way = wayTo(base.spots[0], base.z);
    for (let x = -YARD.halfX + 0.5; x < YARD.halfX; x += 1) {
      for (let z = -YARD.halfZ + 0.5; z < YARD.halfZ; z += 1) {
        if (!freeAt(x, z, BODY + 0.15)) continue;
        const next = stepTowards(way, x, z);
        assert.ok(freeAt(next.x, next.z), `from ${x}, ${z}`);
      }
    }
    assert.ok(way.far.filter((far) => far >= 0).length > 44 * 30 * 0.6, 'most of the yard is open');
  }
  // Following the way from one end gets to the other, round whatever's in between.
  const way = wayTo(BASES[1].spots[0], BASES[1].z);
  let at = { x: BASES[0].spots[0], z: BASES[0].z };
  for (let i = 0; i < 200 && Math.hypot(at.x - way.goal.x, at.z - way.goal.z) > 0.1; i += 1) at = stepTowards(way, at.x, at.z);
  assert.ok(Math.hypot(at.x - way.goal.x, at.z - way.goal.z) <= 0.1);
});

test('what\'s in the way can\'t be seen or fired through, and a shot goes as far as the first thing it meets', () => {
  // The long container in the middle is between the two ends.
  assert.equal(clearLine({ x: 0, z: 8 }, { x: 0, z: -8 }), false);
  assert.equal(clearLine({ x: 0, z: 8 }, { x: 0, z: 2 }), true);
  // Down the open alley on one side, from end to end.
  assert.equal(clearLine({ x: -21, z: 13 }, { x: -21, z: -13 }), true);
  // The same either way round.
  assert.equal(clearLine({ x: 0, z: -8 }, { x: 0, z: 8 }), false);
  // Straight up the middle from the near end, a shot meets the container's near side.
  const container = BLOCKS[0];
  assert.ok(Math.abs(reachAlong({ x: 0, z: 8 }, 0) - (8 - container.d / 2)) < 0.3);
  // And with nothing in the way, the fence.
  assert.ok(Math.abs(reachAlong({ x: -21, z: 13 }, 0) - (13 + YARD.halfZ)) < 0.01);
  assert.ok(Math.abs(reachAlong({ x: -21, z: 13 }, Math.PI / 2) - reachAlong({ x: -21, z: 13 }, Math.PI / 2, 60)) < 1e-9);
});

/* ---------- the rifle hand ---------- */

test('moving the rifle hand to one side turns to look that way, and holding it in the middle looks straight on', () => {
  const { match } = start();
  standInFront(match, 30, Math.PI);
  const { child } = match;
  run(match, 1, { ...HANDS_DOWN, steer: 1 });
  assert.ok(Math.abs(child.heading - PACES.slow.turn) < 0.05, 'to the right at full lock');
  const full = child.heading;
  run(match, 1, { ...HANDS_DOWN, steer: -0.5 });
  assert.ok(child.heading < full - PACES.slow.turn * 0.3 && child.heading > full - PACES.slow.turn * 0.55, 'and more slowly back, with the hand less far over');
  // A hand held nearly in the middle holds the view still.
  const held = child.heading;
  run(match, 1, { ...HANDS_DOWN, steer: 0.12 });
  run(match, 1, { ...HANDS_DOWN, steer: -0.1 });
  assert.equal(child.heading, held);
  const before = child.heading;
  run(match, 1, HANDS_DOWN);
  assert.equal(child.heading, before);
  run(match, 0.5, { ...HANDS_DOWN, steer: NaN });
  assert.equal(child.heading, before, 'a hand that can\'t be read turns nothing');
});

test('with the rifle hand open it fires by itself at whoever is in the sights, and never at nothing', () => {
  const { match, count } = start();
  const other = standInFront(match, 10);
  const { child } = match;
  // Open, with someone straight ahead: one shot after another, each landing.
  run(match, 1, FIRE);
  const shots = match.stats.shots;
  assert.ok(shots >= 4 && shots <= 6, `${shots} shots in a second from the Kalashnikov`);
  assert.deepEqual([child.rounds, match.stats.hits, count('shot')], [MAGAZINE - shots, shots, shots]);
  assert.equal(other.health, HEALTH - shots * RIFLES.ak.hit);
  assert.equal(match.locked, other);
  assert.equal(child.firing, true);
  // Closed, it holds its fire, though it's still on them.
  run(match, 1, HANDS_DOWN);
  assert.deepEqual([match.stats.shots, child.firing, match.locked], [shots, false, other]);
  // Open with nobody in the sights, it doesn't fire, so no rounds go on nothing.
  Object.assign(other, { x: child.x + 9, z: child.z });
  match.help = { ...match.help, pull: 0 };
  run(match, 1, FIRE);
  assert.deepEqual([match.stats.shots, match.locked, child.firing], [shots, null, false]);
});

test('someone behind a crate, too far off to one side, or only just back isn\'t fired at', () => {
  const { match } = start();
  const other = standInFront(match, 10);
  const { child } = match;
  match.help = { ...match.help, pull: 0 };
  // Round from the middle of the sights by more than the help allows.
  Object.assign(other, { x: child.x + 5, z: child.z - 3 });
  assert.equal(match.sees(child, other), true);
  run(match, 0.5, FIRE);
  assert.equal(match.stats.shots, 0);
  // Straight ahead, but behind the wall half way up the yard.
  Object.assign(child, { x: -17, z: 2 });
  Object.assign(other, { x: -17, z: -10 });
  assert.equal(match.sees(child, other), false);
  run(match, 0.5, FIRE);
  assert.equal(match.stats.shots, 0);
  // In plain sight, but only just back at their end.
  Object.assign(child, { x: -21, z: 13 });
  Object.assign(other, { x: -21, z: 3, safeLeft: 1 });
  run(match, 0.5, FIRE);
  assert.equal(match.stats.shots, 0);
  run(match, 1, FIRE);
  assert.ok(match.stats.shots > 0, 'and once that moment is over, it is');
});

test('the help with aiming says how far off the middle still counts, and draws the view onto someone near it without taking over', () => {
  const offFor = (help) => {
    const { match } = start({ help });
    const other = standInFront(match, 12, AIM_HELP.little.cone * 1.3);
    match.help = { ...match.help, pull: 0 };
    run(match, 0.5, FIRE);
    return { shots: match.stats.shots, other };
  };
  assert.equal(offFor('none').shots, 0);
  assert.equal(offFor('little').shots, 0);
  assert.ok(offFor('lots').shots > 0);
  assert.ok(AIM_HELP.none.cone < AIM_HELP.little.cone && AIM_HELP.little.cone < AIM_HELP.lots.cone);
  // With the hand still, the view comes round onto someone a little way off the middle.
  const { match } = start({ help: 'little' });
  const other = standInFront(match, 12, AIM_HELP.little.cone * 1.6);
  const { child } = match;
  const off = () => Math.abs(turnBetween(headingTo(other.x - child.x, other.z - child.z), child.heading));
  const before = off();
  run(match, 1.5, HANDS_DOWN);
  assert.ok(off() < before * 0.4, `${off()} from ${before}`);
  // A child turning hard the other way gets their way.
  const away = start({ help: 'lots' });
  const them = standInFront(away.match, 12, AIM_HELP.lots.cone);
  run(away.match, 1.5, { ...HANDS_DOWN, steer: -1 });
  assert.ok(Math.abs(turnBetween(headingTo(them.x - away.match.child.x, them.z - away.match.child.z), away.match.child.heading)) > 1);
});

/* ---------- the helper hand ---------- */

test('with the helper hand open the child walks the way they\'re looking, and stops when it closes or goes', () => {
  const { match } = start();
  standInFront(match, 30, Math.PI);
  const { child } = match;
  const from = { x: child.x, z: child.z };
  run(match, 2, WALK);
  assert.ok(from.z - child.z > PACES.slow.walk * 1.5, 'up the yard');
  assert.ok(Math.abs(child.x - from.x) < 0.01);
  assert.ok(match.stats.walked > 5);
  run(match, 0.6, HANDS_DOWN);
  const stopped = { x: child.x, z: child.z };
  run(match, 1, { ...HANDS_DOWN, fist: true });
  assert.deepEqual({ x: child.x, z: child.z }, stopped);
  assert.equal(child.speed, 0);
});

test('walking into something slides along it, and wherever the hands send them, a player is never stuck or inside anything', () => {
  // Straight at the container in the middle, a little to one side of its middle: along it, and round the end.
  const { match } = start();
  standInFront(match, 30, Math.PI);
  const { child } = match;
  Object.assign(child, { x: 2.5, z: 6, heading: -0.35 });
  run(match, 6, WALK);
  assert.ok(freeAt(child.x, child.z));
  assert.ok(child.z < 0, `got to ${child.x}, ${child.z}`);
  // Dead square on to the middle of it, with the rifle hand still: they go along it, and come round to look
  // the way they're going, rather than walking sideways with their nose to it.
  Object.assign(child, { x: 0, z: 6, heading: 0, speed: 0, round: 0 });
  run(match, 5, WALK);
  assert.ok(Math.hypot(child.x, child.z - 6) > 8, `square on, got to ${child.x}, ${child.z}`);
  assert.ok(Math.abs(turnBetween(child.heading, 0)) > 1, `looking ${child.heading}`);
  assert.ok(freeAt(child.x, child.z));
  // A child who's turning the other way goes round it that way instead, and keeps looking where they choose.
  Object.assign(child, { x: 0, z: 6, heading: 0, speed: 0, round: 1 });
  run(match, 1.2, { ...WALK, steer: -0.3 });
  assert.ok(child.x < 0, `turning left, got to ${child.x}, ${child.z}`);
  // Every which way for a long time, at every speed.
  for (const pace of Object.keys(PACES)) {
    const wander = start({ pace, seed: 11 });
    standInFront(wander.match, 30, Math.PI);
    const random = seeded(3);
    let steer = 0;
    let walked = 0;
    for (let i = 0; i < 60 * 90; i += 1) {
      if (i % 45 === 0) steer = random() * 2 - 1;
      const before = { x: wander.match.child.x, z: wander.match.child.z };
      wander.match.update(STEP, { steer, fire: false, walk: true, fist: false });
      walked += Math.hypot(wander.match.child.x - before.x, wander.match.child.z - before.z);
      assert.ok(freeAt(wander.match.child.x, wander.match.child.z, BODY - 0.01), `${pace}: at ${wander.match.child.x}, ${wander.match.child.z}`);
    }
    assert.ok(walked > PACES[pace].walk * 90 * 0.5, `${pace}: walked ${walked}`);
  }
});

/* ---------- changing the magazine ---------- */

test('a fist of the helper hand puts a new magazine in: it takes a moment, the rifle can\'t fire meanwhile, and then it\'s full', () => {
  const { match, count } = start();
  standInFront(match, 10);
  const { child } = match;
  run(match, 1, FIRE);
  const used = MAGAZINE - child.rounds;
  assert.ok(used > 0);
  run(match, STEP, { ...FIRE, fist: true });
  assert.ok(child.reloadLeft > RIFLES.ak.reload - 0.1);
  assert.deepEqual([match.stats.reloads, match.stats.byHand, count('reload')], [1, 1, 1]);
  const shots = match.stats.shots;
  run(match, RIFLES.ak.reload - 0.2, { ...FIRE, fist: true });
  assert.deepEqual([match.stats.shots, child.rounds, child.firing], [shots, MAGAZINE - used, false], 'no shots while it\'s being changed');
  run(match, 0.4, { ...HANDS_DOWN, fist: true });
  assert.deepEqual([child.rounds, child.reloadLeft, count('loaded')], [MAGAZINE, 0, 1]);
  // Holding the fist doesn't do it again, and nor does a fist with a full magazine.
  run(match, 2, { ...HANDS_DOWN, fist: true });
  run(match, 0.2, HANDS_DOWN);
  run(match, 0.5, { ...HANDS_DOWN, fist: true });
  assert.equal(match.stats.reloads, 1);
  // A fist that's still held while the rifle fires doesn't change the magazine again: it's once for each time
  // the hand closes, so a hand that rests closed doesn't keep the rifle from firing.
  const before = match.stats.shots;
  run(match, 1, { ...FIRE, fist: true });
  assert.ok(match.stats.shots >= before + 3, 'it fires with the fist held');
  assert.ok(child.rounds < MAGAZINE);
  assert.deepEqual([match.stats.reloads, child.reloadLeft, count('reload')], [1, 0, 1]);
  // Opening that hand and closing it again does.
  run(match, 0.2, FIRE);
  run(match, STEP, { ...FIRE, fist: true });
  assert.deepEqual([match.stats.reloads, match.stats.byHand, count('reload')], [2, 2, 2]);
  assert.ok(child.reloadLeft > 0);
});

test('a magazine holds thirty, an empty rifle doesn\'t fire, and with no fist made a new one goes in by itself after a few seconds', () => {
  const { match, count } = start();
  const other = standInFront(match, 10);
  const { child } = match;
  other.health = other.most = 10_000;
  run(match, MAGAZINE * RIFLES.ak.every + 1, FIRE);
  assert.deepEqual([child.rounds, match.stats.shots, count('empty')], [0, MAGAZINE, 1]);
  run(match, 2, FIRE);
  assert.deepEqual([match.stats.shots, child.reloadLeft], [MAGAZINE, 0], 'it waits for the fist');
  run(match, 2.2, FIRE);
  assert.ok(child.reloadLeft > 0, 'and then does it by itself');
  assert.deepEqual([match.stats.reloads, match.stats.byHand], [1, 0]);
  run(match, RIFLES.ak.reload + 0.5, FIRE);
  assert.ok(match.stats.shots > MAGAZINE, 'and carries on');
  // For a child who can't make a fist with that hand, a grown-up can have it go in at once.
  const easy = start({ reload: 'auto' });
  const them = standInFront(easy.match, 10);
  them.health = them.most = 10_000;
  run(easy.match, MAGAZINE * RIFLES.ak.every + 0.2, FIRE);
  assert.ok(easy.match.child.reloadLeft > 0);
  run(easy.match, 1, { ...FIRE, fist: true });
  assert.deepEqual([easy.match.stats.reloads, easy.match.stats.byHand], [1, 0], 'and a fist does nothing more');
});

test('the two rifles are different, and either takes about two and a half seconds to tag someone, with a magazine good for two or three', () => {
  assert.ok(RIFLES.ak.every > RIFLES.m4.every && RIFLES.ak.hit > RIFLES.m4.hit && RIFLES.ak.kick > RIFLES.m4.kick && RIFLES.ak.reload > RIFLES.m4.reload);
  for (const [rifle, { every, hit }] of Object.entries(RIFLES)) {
    const shots = Math.ceil(HEALTH / hit);
    assert.ok(shots * every > 2 && shots * every < 3, `${rifle}: ${shots * every} seconds`);
    assert.ok(MAGAZINE / shots >= 1.8 && MAGAZINE / shots < 3.5, `${rifle}: ${MAGAZINE / shots} to a magazine`);
    const { match } = start({ rifle });
    standInFront(match, 10);
    run(match, 1, FIRE);
    assert.ok(Math.abs(match.stats.shots - 1 / every) <= 1, `${rifle}: ${match.stats.shots} shots in a second`);
  }
  assert.equal(start({ rifle: 'bazooka' }).match.child.rifle, 'ak');
});

/* ---------- tags ---------- */

test('someone hit enough is tagged out, which is a point, and they\'re back at their own end a few seconds later, where nothing can hit them for a moment', () => {
  const { match, events, count } = start();
  const other = standInFront(match, 10);
  run(match, 3.2, FIRE);
  assert.deepEqual([other.state, match.score, match.stats.tags, count('tagged')], ['out', [1, 0], 1, 1]);
  assert.equal(events.find(({ type }) => type === 'tagged').by, match.child);
  assert.equal(match.locked, null);
  const shots = match.stats.shots;
  run(match, 1, FIRE);
  assert.equal(match.stats.shots, shots, 'nothing to fire at');
  run(match, 2.2, HANDS_DOWN);
  assert.deepEqual([other.state, other.health, other.z, count('back')], ['in', HEALTH, BASES[1].z, 1]);
  assert.ok(other.safeLeft > 0);
  match.hit(other, 50, match.child);
  assert.equal(other.health, HEALTH);
});

test('on Gentle the child can\'t be tagged out and the other team can\'t win. On Medium and Tough they can', () => {
  const gentle = start({ level: 'gentle', tags: 5 });
  const [red] = reds(gentle.match);
  for (let i = 0; i < 40; i += 1) gentle.match.hit(gentle.match.child, 30, red);
  assert.deepEqual([gentle.match.child.state, gentle.match.child.health, gentle.match.score, gentle.match.stats.out], ['in', 1, [0, 0], 0]);
  // The other team's tags only count when it's the child they tag: Giraffe being tagged, over and over, on any
  // difficulty, is no point to them, so it's never Giraffe who loses it.
  for (const level of ['gentle', 'tough']) {
    const { match, count } = start({ level, tags: 5 });
    const [other] = reds(match);
    const mate = match.troopers.find(({ team, bot }) => team === 0 && bot);
    for (let i = 0; i < 8; i += 1) {
      Object.assign(mate, { state: 'in', health: 1, safeLeft: 0 });
      match.hit(mate, 30, other);
    }
    run(match, 3, HANDS_DOWN);
    assert.deepEqual([match.score, match.state, count('tagged')], [[0, 0], 'playing', 8], level);
  }

  for (const level of ['medium', 'tough']) {
    const hard = start({ level, tags: 5 });
    const [other] = reds(hard.match);
    const { child } = hard.match;
    for (let i = 0; i < 5; i += 1) {
      Object.assign(child, { state: 'in', health: 5, safeLeft: 0 });
      hard.match.hit(child, 30, other);
    }
    assert.deepEqual([hard.match.score, hard.match.stats.out], [[0, 5], 5], level);
    run(hard.match, 2, HANDS_DOWN);
    assert.equal(hard.match.state, 'lost', level);
    assert.equal(hard.count('lost'), 1, level);
  }
  assert.deepEqual([LEVELS.gentle.canLose, LEVELS.medium.canLose, LEVELS.tough.canLose], [false, true, true]);
  assert.deepEqual(TAGS_TO_WIN, [5, 8, 12]);

  // And even with the other team's number at the tags, however it got there, a Gentle match isn't lost: it
  // carries on until the child's team gets theirs.
  const kind = start({ level: 'gentle', tags: 5 });
  kind.match.score[1] = 5;
  kind.match.checkEnd();
  run(kind.match, 3, HANDS_DOWN);
  assert.deepEqual([kind.match.state, kind.count('lost')], ['playing', 0]);
  const them = standInFront(kind.match, 10);
  for (let i = 0; i < 5; i += 1) {
    Object.assign(them, { state: 'in', health: 1, safeLeft: 0 });
    kind.match.hit(them, 5, kind.match.child);
  }
  run(kind.match, 2, HANDS_DOWN);
  assert.deepEqual([kind.match.state, kind.count('won'), kind.count('lost')], ['won', 1, 0]);
  // The same number on Medium is the end of it.
  const fair = start({ level: 'medium', tags: 5 });
  fair.match.score[1] = 5;
  fair.match.checkEnd();
  run(fair.match, 2, HANDS_DOWN);
  assert.equal(fair.match.state, 'lost');
});

test('the first team to the tags wins, a moment later, and after that nothing moves or fires', () => {
  const { match, count } = start({ tags: 5 });
  const other = standInFront(match, 10);
  for (let i = 0; i < 5; i += 1) {
    Object.assign(other, { state: 'in', health: 1, safeLeft: 0 });
    match.hit(other, 5, match.child);
  }
  assert.deepEqual([match.score, match.state, match.left], [[5, 0], 'playing', 0]);
  run(match, 2, FIRE);
  assert.deepEqual([match.state, count('won')], ['won', 1]);
  const { child } = match;
  const at = { x: child.x, z: child.z, heading: child.heading, shots: match.stats.shots };
  run(match, 3, { steer: 1, fire: true, walk: true, fist: true });
  assert.deepEqual({ x: child.x, z: child.z, heading: child.heading, shots: match.stats.shots }, at);
  assert.equal(count('won'), 1);
});

/* ---------- resting ---------- */

test('with neither hand doing anything for a few seconds it\'s a rest: everyone the computer plays stops and waits, and nothing can happen', () => {
  const { match, count } = start({ level: 'tough', seed: 5 });
  const { child } = match;
  run(match, REST_AFTER - 0.5, HANDS_DOWN);
  assert.equal(match.resting, false);
  run(match, 1, HANDS_DOWN);
  assert.deepEqual([match.resting, count('resting')], [true, 1]);
  const places = match.troopers.map(({ x, z }) => ({ x, z }));
  const health = child.health;
  const shots = count('shot');
  run(match, 30, HANDS_DOWN);
  assert.equal(count('shot'), shots, 'nobody fires');
  assert.ok(match.troopers.every(({ x, z }, index) => Math.hypot(x - places[index].x, z - places[index].z) < 0.6), 'nobody goes anywhere');
  assert.ok(child.health >= health);
  assert.deepEqual(match.score, [0, 0]);
  // Any hand doing anything ends it.
  run(match, 0.2, WALK);
  assert.equal(match.resting, false);
  run(match, REST_AFTER + 0.5, HANDS_DOWN);
  run(match, 0.2, FIRE);
  assert.equal(match.resting, false);
  run(match, REST_AFTER + 0.5, HANDS_DOWN);
  run(match, 0.2, { ...HANDS_DOWN, steer: 0.6 });
  assert.equal(match.resting, false);
});

/* ---------- the players the computer plays ---------- */

test('the players the computer plays find their way about the yard without ever getting stuck or going through anything', () => {
  for (const pace of Object.keys(PACES)) {
    const { match } = start({ pace, seed: 13, levelNumber: 10 });
    // All on one side for now, with nobody to stop for, and the child out of it.
    const bots = match.troopers.filter(({ bot }) => bot);
    for (const bot of bots) bot.team = 0;
    const travelled = new Map(bots.map((bot) => [bot, 0]));
    for (let i = 0; i < 60 * 60; i += 1) {
      const before = bots.map(({ x, z }) => ({ x, z }));
      match.update(STEP, { steer: 0.3, fire: false, walk: false, fist: false });
      bots.forEach((bot, index) => {
        assert.ok(freeAt(bot.x, bot.z, BODY - 0.01), `${pace}: ${bot.who} at ${bot.x}, ${bot.z}`);
        const moved = Math.hypot(bot.x - before[index].x, bot.z - before[index].z);
        // Nobody jumps: no more in a frame than the quickest of them, the runner, could go.
        assert.ok(moved <= PACES[pace].walk * STEP * 1.2, `${pace}: ${bot.who} went ${moved} in a frame`);
        travelled.set(bot, travelled.get(bot) + moved);
      });
    }
    // At least half of the time, each was walking somewhere.
    for (const [bot, far] of travelled) assert.ok(far > PACES[pace].walk * 0.8 * 60 * 0.5, `${pace}: ${bot.who} went ${far}`);
  }
});

test('a player the computer plays takes a moment to start firing, fires a few at a time, and the other team\'s shots at the child mostly miss', () => {
  for (const [level, most] of [['gentle', 0.25], ['medium', 0.35], ['tough', 0.5]]) {
    const { match, events } = start({ level, seed: 3 });
    const [other] = reds(match);
    const { child } = match;
    for (const each of match.troopers) if (each !== other && each !== child) Object.assign(each, { x: 20, z: 13.5 * (each.team === 0 ? 1 : -1), bot: false });
    Object.assign(child, { x: 0, z: 8 });
    Object.assign(other, { x: 0, z: 3, heading: Math.PI, haunt: null });
    let first = null;
    for (let t = 0; t < 40; t += STEP) {
      Object.assign(child, { health: HEALTH, sinceHit: 0 });
      match.update(STEP, { steer: 0.3 * Math.sin(t), fire: false, walk: false, fist: false });
      if (first === null && events.some(({ type, by }) => type === 'shot' && by === other)) first = t;
    }
    assert.ok(first >= LEVELS[level].react - 0.1, `${level}: first shot after ${first}`);
    const shots = events.filter(({ type, by }) => type === 'shot' && by === other);
    const landed = shots.filter(({ hit }) => hit).length / shots.length;
    assert.ok(shots.length > 20, `${level}: ${shots.length} shots`);
    assert.ok(landed > LEVELS[level].aim * 0.4 && landed < most, `${level}: ${landed} landed`);
  }
});

/* ---------- whole matches ---------- */

/** A child who has the idea, but is slow and wobbly: for whoever they can see, and otherwise about the yard. */
function playLikeAChild(match, { seed = 5, most = 900 } = {}) {
  const random = seeded(seed);
  const { child } = match;
  let t = 0;
  let way = null;
  let wayIn = 0;
  let steer = 0;
  let fire = false;
  let fireWait = 0;
  let fist = false;
  let fistWait = 0;
  let goal = { x: 0, z: -6 };
  while (match.state === 'playing' && t < most) {
    const seen = match.inPlay(1).filter((other) => match.sees(child, other)).sort((a, b) => Math.hypot(a.x - child.x, a.z - child.z) - Math.hypot(b.x - child.x, b.z - child.z))[0];
    let wanted;
    let walk = false;
    if (seen) {
      wanted = headingTo(seen.x - child.x, seen.z - child.z);
    } else {
      wayIn -= STEP;
      if (Math.hypot(child.x - goal.x, child.z - goal.z) < 2) goal = { x: (random() - 0.5) * 36, z: (random() - 0.5) * 20 - 3 };
      // A crate is worth walking over to.
      const to = match.crate ?? goal;
      if (!way || wayIn <= 0) {
        way = wayTo(to.x, to.z);
        wayIn = 0.5;
      }
      const next = stepTowards(way, child.x, child.z);
      wanted = headingTo(next.x - child.x, next.z - child.z);
      walk = Math.abs(turnBetween(wanted, child.heading)) < 0.9;
    }
    const target = Math.max(-1, Math.min(1, turnBetween(wanted, child.heading) * 1.6)) + Math.sin(t * 2.3) * 0.12;
    steer += Math.max(-STEP * 2.5, Math.min(STEP * 2.5, target - steer));
    const wantFire = Boolean(seen);
    if (wantFire !== fire) {
      fireWait += STEP;
      if (fireWait > 0.45) {
        fire = wantFire;
        fireWait = 0;
      }
    } else {
      fireWait = 0;
    }
    const wantFist = child.rounds === 0;
    if (wantFist !== fist) {
      fistWait += STEP;
      if (fistWait > 0.6) {
        fist = wantFist;
        fistWait = 0;
      }
    } else {
      fistWait = 0;
    }
    match.update(STEP, { steer, fire, walk: walk && !fist, fist });
    t += STEP;
  }
  return t;
}

test('every speed, difficulty, rifle and number of tags can be played right through, and Gentle is always won', () => {
  for (const pace of Object.keys(PACES)) {
    for (const level of Object.keys(LEVELS)) {
      for (const [tags, rifle] of [[5, 'ak'], [8, 'm4'], [12, 'ak']]) {
        const { match, count } = start({ pace, level, tags, rifle, seed: tags + pace.length });
        const seconds = playLikeAChild(match);
        const about = `${pace}, ${level}, ${tags} tags with the ${rifle}`;
        assert.ok(['won', 'lost'].includes(match.state), `${about}: ${match.state} after ${seconds}`);
        if (level === 'gentle') assert.deepEqual([match.state, match.stats.out], ['won', 0], about);
        assert.equal(Math.max(...match.score) >= tags, true, about);
        assert.equal(count('tagged', ({ by }) => by.team === 0), match.score[0], about);
        assert.ok(match.stats.tags > 0 && match.stats.tags <= match.score[0], `${about}: ${match.stats.tags} of ${match.score[0]}`);
        // It's the child who wins it, with their friends helping.
        if (match.state === 'won') assert.ok(match.stats.tags >= match.score[0] * 0.5, `${about}: ${match.stats.tags} of ${match.score[0]} were the child's`);
        assert.ok(match.stats.reloads >= 1, `${about}: ${match.stats.reloads} magazines`);
        assert.ok(seconds < 600, `${about}: ${seconds} seconds`);
        for (const trooper of match.troopers) assert.ok(freeAt(trooper.x, trooper.z, BODY - 0.01), `${about}: ${trooper.who}`);
      }
    }
  }
});

test('level 1 is the plain match: Giraffe with the child against two, and nothing new', () => {
  const { match } = start();
  assert.deepEqual(match.troopers.map(({ team, who, bot }) => [team, bot ? who : 'child']).slice(0, 2), [[0, 'child'], [0, 'giraffe']]);
  assert.deepEqual([match.troopers.filter(({ team }) => team === 0).length, reds(match).length], [2, 2]);
  assert.ok(reds(match).every(({ who, most }) => who !== 'giraffe' && most === HEALTH));
  const plan = levelPlan(1);
  assert.deepEqual([plan.aim, plan.react, plan.health], [1, 1, 1]);
});

/* ---------- the helper hand ---------- */

test('only a helper hand read as open walks, and only one read as a fist reloads: anything else does nothing', () => {
  const other = (status, reason, overlap = false) => ({ overlap, other: { status, reason } });
  assert.equal(readHelper(other('open', null)), 'open');
  assert.equal(readHelper(other('closed', 'closed')), 'fist');
  // Missing, cut off by the edge, too far away, or touching the other hand: nothing.
  assert.equal(readHelper(other('missing', 'missing')), 'none');
  assert.equal(readHelper(other('closed', 'edge')), 'none');
  assert.equal(readHelper(other('closed', 'small')), 'none');
  assert.equal(readHelper(other('open', null, true)), 'none');
  assert.equal(readHelper(other('closed', 'closed', true)), 'none');
  assert.equal(readHelper({ overlap: false }), 'none');
});

/* ---------- what the levels bring ---------- */

const LEVEL_NUMBERS = Array.from({ length: 10 }, (_, index) => index + 1);
const NEW_THINGS = ['stars', 'shield', 'three', 'runner', 'power', 'snow', 'captain', 'boots', 'champions', 'trophy'];

test('level 1 has nothing new, every other level has something new that it really switches on, and nothing is ever taken away', () => {
  assert.deepEqual(newsAt(1), []);
  assert.equal(NEW_THINGS.some((key) => levelPlan(1)[key]), false);
  const seen = new Set();
  for (const level of LEVEL_NUMBERS.slice(1)) {
    const news = newsAt(level);
    assert.ok(news.length >= 1, `level ${level} brings something`);
    for (const { key, mark, name, nameKa } of news) {
      assert.ok(mark && name && nameKa, `${key} has a mark and a name in both languages`);
      assert.equal(seen.has(key), false, `${key} is only new once`);
      seen.add(key);
      assert.equal(levelPlan(level)[key], true, `${key} is on at level ${level}`);
      assert.equal(Boolean(levelPlan(level - 1)[key]), false, `${key} isn't on before level ${level}`);
    }
    for (const key of NEW_THINGS) if (levelPlan(level - 1)[key]) assert.equal(levelPlan(level)[key], true, `${key} stays on at level ${level}`);
  }
  assert.deepEqual([...seen].sort(), [...NEW_THINGS].sort());
  assert.deepEqual(Object.keys(NEWS).map(Number), LEVEL_NUMBERS.slice(1));
});

test('each level is the same or harder than the one before, and a level never changes what a grown-up chose', () => {
  for (const level of LEVEL_NUMBERS.slice(1)) {
    const [before, now] = [levelPlan(level - 1), levelPlan(level)];
    assert.ok(now.aim >= before.aim && now.react <= before.react && now.health >= before.health && now.reds >= before.reds, `level ${level}`);
  }
  for (const level of LEVEL_NUMBERS) {
    const { match } = start({ levelNumber: level, tags: 8, pace: 'medium', level: 'gentle', help: 'lots', rifle: 'm4', reload: 'auto' });
    assert.deepEqual([match.goal, match.pace, match.level.canLose, match.help, match.child.rifle, match.autoReload], [8, PACES.medium, false, AIM_HELP.lots, 'm4', true], `level ${level}`);
    assert.equal(match.child.most, HEALTH, 'the child takes as many hits as ever');
  }
});

test('from level 2 each of the child\'s tags is a gold star, and before that there are none', () => {
  for (const [level, stars] of [[1, 0], [2, 1]]) {
    const { match, count } = start({ levelNumber: level });
    standInFront(match, 10);
    run(match, 3.4, FIRE);
    assert.deepEqual([match.stats.tags, match.stats.stars, count('star')], [1, stars, stars], `level ${level}`);
  }
  // A tag of Giraffe's is a point for the team, but the stars are for the child's own.
  const { match } = start({ levelNumber: 2 });
  const [other] = reds(match);
  const mate = match.troopers.find(({ team, bot }) => team === 0 && bot);
  Object.assign(other, { health: 1, safeLeft: 0 });
  match.hit(other, 5, mate);
  assert.deepEqual([match.score, match.stats.stars], [[1, 0], 0]);
});

test('from level 3 one of the other team carries a shield: the first shots bounce off it, then it\'s down, and it\'s up again when they come back', () => {
  const { match, count } = start({ levelNumber: 3 });
  const carrier = reds(match).find(({ part }) => part === 'shield');
  assert.ok(carrier, 'someone carries it');
  assert.equal(reds(match).filter(({ part }) => part === 'shield').length, 1);
  assert.equal(reds(start({ levelNumber: 2 }).match).some(({ part }) => part), false);
  const { child } = match;
  Object.assign(child, { x: -21, z: 13, heading: 0 });
  for (const each of match.troopers) if (each !== child) Object.assign(each, { bot: false, x: 20, z: each.team ? -13.5 : 13.5 });
  Object.assign(carrier, { x: -21, z: 3, safeLeft: 0 });
  const shield = carrier.shield;
  assert.ok(shield >= 4);
  run(match, (shield - 1) * RIFLES.ak.every + 0.1, FIRE);
  assert.deepEqual([carrier.health, carrier.shield, count('bonk')], [carrier.most, 0, shield], 'they bounce off, and nothing else happens');
  assert.equal(count('bonk', ({ down }) => down), 1);
  run(match, 3.4, FIRE);
  assert.equal(carrier.state, 'out');
  run(match, 3.2, HANDS_DOWN);
  assert.deepEqual([carrier.state, carrier.shield], ['in', shield]);
});

test('from level 4 it\'s three a side, with a second friend on the child\'s team', () => {
  const sides = (level) => {
    const { match } = start({ levelNumber: level });
    return [match.troopers.filter(({ team }) => team === 0).map(({ who, bot }) => (bot ? who : 'child')), reds(match).length];
  };
  assert.deepEqual(sides(3), [['child', 'giraffe'], 2]);
  assert.deepEqual(sides(4), [['child', 'giraffe', 'mochi'], 3]);
  const { match } = start({ levelNumber: 4 });
  const places = match.troopers.map(({ x, z }) => `${x},${z}`);
  assert.equal(new Set(places).size, places.length, 'each in a place of their own');
});

test('from level 5 one of the other team is a runner: quicker, never still while firing, and tagged out sooner', () => {
  const { match } = start({ levelNumber: 5, seed: 3 });
  const runner = reds(match).find(({ part }) => part === 'runner');
  assert.ok(runner);
  assert.ok(runner.most < reds(match).find(({ part }) => part === 'shield').most);
  const { child } = match;
  for (const each of match.troopers) if (each !== child && each !== runner) Object.assign(each, { bot: false, x: 20, z: each.team ? -13.5 : 13.5 });
  Object.assign(child, { x: -21, z: 13 });
  Object.assign(runner, { x: -18, z: 3, heading: Math.PI, haunt: null });
  let moved = 0;
  let fired = 0;
  match.onEvent = (event) => {
    if (event.type === 'shot' && event.by === runner) fired += 1;
  };
  for (let t = 0; t < 8; t += STEP) {
    const before = { x: runner.x, z: runner.z };
    Object.assign(child, { health: HEALTH, sinceHit: 0 });
    match.update(STEP, { steer: 0.3 * Math.sin(t), fire: false, walk: false, fist: false });
    if (runner.seen === child) moved += Math.hypot(runner.x - before.x, runner.z - before.z);
    assert.ok(freeAt(runner.x, runner.z, BODY - 0.01));
  }
  assert.ok(fired > 3, `${fired} shots`);
  assert.ok(moved > 6, `it kept moving while it fired: ${moved}`);
});

test('from level 6 a crate of double shots turns up: walking over it makes each shot count twice for a while, and missing it costs nothing', () => {
  assert.deepEqual(start({ levelNumber: 5 }).match.crateKinds, []);
  const { match, count } = start({ levelNumber: 6 });
  assert.deepEqual(match.crateKinds, ['double']);
  for (const spot of CRATE_SPOTS) assert.ok(freeAt(spot.x, spot.z), `${spot.x}, ${spot.z}`);
  const other = standInFront(match, 10);
  other.most = other.health = 10_000;
  const busy = { ...HANDS_DOWN, steer: 0.3 };
  match.help = { ...match.help, pull: 0 };
  run(match, 9, busy);
  assert.ok(match.crate, 'one has turned up');
  assert.equal(count('crate'), 1);
  assert.ok(Math.hypot(match.crate.x - match.child.x, match.crate.z - match.child.z) > 10, 'a walk away');
  // Left alone, it goes after a while, and another comes, and nothing is lost.
  run(match, 41, busy);
  assert.equal(count('crate-gone'), 1);
  run(match, 19, busy);
  assert.equal(count('crate'), 2);
  // The child walks over this one.
  Object.assign(match.child, { x: match.crate.x, z: match.crate.z + 0.5, heading: 0 });
  Object.assign(other, { x: match.child.x, z: match.child.z - 8 });
  if (!match.sees(match.child, other)) Object.assign(other, { x: match.child.x - 0.01, z: match.child.z - 3 });
  run(match, STEP * 2, busy);
  assert.deepEqual([match.crate, count('crate-got'), match.stats.crates], [null, 1, 1]);
  assert.ok(match.power.doubleLeft > POWERS.double.seconds - 0.1);
  const before = other.health;
  run(match, RIFLES.ak.every * 3 + 0.05, FIRE);
  const shots = match.stats.shots;
  assert.equal(before - other.health, shots * RIFLES.ak.hit * 2, 'each counts twice');
  run(match, POWERS.double.seconds, busy);
  assert.deepEqual([match.power.doubleLeft, count('power-off')], [0, 1]);
  // It all waits while the child rests.
  run(match, REST_AFTER + 0.5, HANDS_DOWN);
  const waiting = match.crate ? match.crate.left : match.crateIn;
  run(match, 20, HANDS_DOWN);
  assert.equal(match.crate ? match.crate.left : match.crateIn, waiting);
});

test('from level 7 it snows, and nobody can see as far', () => {
  const clear = start({ levelNumber: 6 }).match;
  const snowy = start({ levelNumber: 7 }).match;
  assert.ok(snowy.sight < clear.sight && snowy.sight > 15);
  for (const match of [clear, snowy]) {
    const other = standInFront(match, 26);
    match.help = { ...match.help, pull: 0 };
    run(match, 1, FIRE);
    assert.equal(match.stats.shots > 0, match === clear, 'someone 26 paces off');
    Object.assign(other, { z: match.child.z - 18 });
    run(match, 1, FIRE);
    assert.ok(match.stats.shots > 0, 'and nearer, they can be seen');
  }
});

test('from level 8 the other team has a captain, who takes twice the hits and is worth two tags', () => {
  const { match, count } = start({ levelNumber: 8 });
  const captain = reds(match).find(({ part }) => part === 'captain');
  const plain = reds(match).find(({ part }) => part === null);
  assert.ok(captain);
  assert.equal(reds(match).filter(({ part }) => part === 'captain').length, 1);
  assert.ok(captain.most > (plain?.most ?? HEALTH) * 1.9);
  Object.assign(captain, { health: 1, safeLeft: 0 });
  match.hit(captain, 5, match.child);
  assert.deepEqual([match.score, match.stats.tags, match.stats.stars], [[2, 0], 1, 2]);
  assert.equal(count('star', ({ worth }) => worth === 2), 1);
});

test('from level 9 a crate of snow boots turns up too, and walking is quicker for a while', () => {
  const { match } = start({ levelNumber: 9 });
  assert.deepEqual(match.crateKinds, ['double', 'boots']);
  standInFront(match, 30, Math.PI);
  const busy = { ...HANDS_DOWN, steer: 0.3 };
  run(match, 9, busy);
  assert.equal(match.crate.kind, 'boots', 'the newest kind first');
  const walkFor = (seconds) => {
    Object.assign(match.child, { x: -21, z: 13, heading: 0, speed: 0 });
    const from = match.child.z;
    run(match, seconds, WALK);
    return from - match.child.z;
  };
  const usual = walkFor(2);
  match.power.bootsLeft = POWERS.boots.seconds;
  const quicker = walkFor(2);
  assert.ok(quicker > usual * 1.25, `${quicker} against ${usual}`);
  // And the next crate is the other kind.
  match.crate = null;
  match.crateIn = 0;
  run(match, STEP * 2, busy);
  assert.equal(match.crate.kind, 'double');
});

test('at level 10 the other team are the champions, who all take more hits, and beating them wins the trophy', () => {
  const champions = start({ levelNumber: 10 });
  const before = start({ levelNumber: 9 });
  assert.ok(reds(champions.match).every(({ champion }) => champion));
  assert.ok(reds(before.match).every(({ champion }) => !champion));
  const mostOf = ({ match }, part) => reds(match).find((each) => each.part === part).most;
  for (const part of ['captain', 'shield', 'runner']) assert.ok(mostOf(champions, part) > mostOf(before, part), part);
  for (const [played, trophy] of [[champions, 1], [before, 0]]) {
    const [other] = reds(played.match);
    for (let i = 0; i < 5; i += 1) {
      Object.assign(other, { state: 'in', health: 1, safeLeft: 0, shield: 0, part: null });
      played.match.hit(other, 5, played.match.child);
    }
    run(played.match, 2, HANDS_DOWN);
    assert.deepEqual([played.match.state, played.match.stats.trophy], ['won', trophy]);
  }
});

test('every level can be played right through at every speed, Gentle is still always won, and the new things really happen', () => {
  const happened = new Set();
  for (const level of LEVEL_NUMBERS) {
    for (const [pace, difficulty] of [['slow', 'gentle'], ['medium', 'medium'], ['fast', 'tough']]) {
      const { match, events } = start({ levelNumber: level, pace, level: difficulty, tags: 8, seed: level + 20 });
      const seconds = playLikeAChild(match, { seed: level });
      const about = `level ${level}, ${pace}, ${difficulty}`;
      assert.ok(['won', 'lost'].includes(match.state), `${about}: ${match.state} after ${seconds}`);
      if (difficulty === 'gentle') assert.deepEqual([match.state, match.stats.out], ['won', 0], about);
      assert.ok(seconds < 700, `${about}: ${seconds} seconds`);
      for (const { type } of events) happened.add(type);
      for (const trooper of match.troopers) assert.ok(freeAt(trooper.x, trooper.z, BODY - 0.01), `${about}: ${trooper.who}`);
      if (level >= 2 && match.state === 'won') assert.ok(match.stats.stars >= match.stats.tags, about);
      if (level === 10 && match.state === 'won') assert.equal(match.stats.trophy, 1, about);
    }
  }
  for (const type of ['star', 'bonk', 'crate', 'crate-got', 'reload', 'loaded', 'tagged', 'back']) assert.ok(happened.has(type), `${type} happened somewhere`);
});

test('even at level 10 a match asks for no more than twice what level 1 does, and lasts no more than twice as long', () => {
  const play = (level) => [3, 7, 11].map((seed) => {
    const { match } = start({ levelNumber: level, tags: 8, seed });
    const seconds = playLikeAChild(match, { seed });
    return { seconds, perMinute: ((match.stats.reloads + match.stats.tags) / seconds) * 60 };
  });
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const [first, last] = [play(1), play(10)];
  assert.ok(average(last.map(({ seconds }) => seconds)) < average(first.map(({ seconds }) => seconds)) * 2.2, `${average(last.map(({ seconds }) => seconds))} against ${average(first.map(({ seconds }) => seconds))}`);
});

/* ---------- what's said ---------- */

const FOLDER = new URL('../../games/frost-arena/audio/voice/', import.meta.url);
const MOST_WORDS = 10;

test('Frost Arena keeps its talking short, and everything it says has a voice in both languages', () => {
  const lines = JSON.parse(readFileSync(new URL('lines.json', FOLDER), 'utf8'));
  const main = readFileSync(new URL('../../games/frost-arena/main.js', import.meta.url), 'utf8');
  assert.ok(lines.length >= 8);
  for (const { id, text, ka } of lines) {
    assert.ok(text.split(/\s+/).length <= MOST_WORDS, `"${text}" is short`);
    assert.ok(ka && ka.length > 2, `${id} has Georgian`);
    for (const language of ['en', 'ka']) assert.ok(existsSync(new URL(`${language}/${id}.ogg`, FOLDER)), `${language}/${id}.ogg`);
    assert.ok(main.includes(`'${text}'`), `"${text}" is used`);
  }
  // Everything the game can say out loud is in the list.
  const spoken = [...main.matchAll(/^const [A-Z_]+ = '([^']+[!.])';$/gm)].map(([, text]) => text);
  assert.ok(spoken.length >= 8);
  for (const text of spoken) assert.ok(lines.some((line) => line.text === text), `"${text}" has a voice`);
  // Nothing about the game says its hero's own name: he's Giraffe.
  for (const file of ['main.js', 'arena.js', 'yard.js', 'arena-sound.js', 'style.css', 'index.html']) {
    assert.equal(/joze/i.test(readFileSync(new URL(`../../games/frost-arena/${file}`, import.meta.url), 'utf8')), false, file);
  }
});
