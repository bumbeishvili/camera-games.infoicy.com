// The rules of Tank Patrol, and the valley they're played in. Its screen is tested in test/e2e/tank-patrol.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { AIM_HELP, GUN, LEVELS, PACES, Patrol, STANDOFF, levelPlan, readHand, shellPoint, tanksFor } from '../../games/tank-patrol/patrol.js';
import { BRIDGES, PLAY, SPAWNS, START, TANK_RADIUS, groundY, heightAt, riverNear, seeded, solidNear, valleyNav } from '../../games/tank-patrol/valley-map.js';

const STEP = 1 / 60;
const quiet = (settings = {}) => new Patrol({ random: seeded(7), ...settings });

function run(patrol, seconds, input) {
  for (let t = 0; t < seconds; t += STEP) patrol.update(STEP, typeof input === 'function' ? input(t) : input);
}

const eventsOf = (patrol) => {
  const events = [];
  patrol.onEvent = (event) => events.push(event);
  return { events, types: () => events.map(({ type }) => type), count: (type) => events.filter((event) => event.type === type).length };
};

const started = (settings) => {
  const patrol = quiet(settings);
  patrol.begin();
  return patrol;
};

/** Puts a tank somewhere, and tells it to stay put. */
function hold(patrol, enemy, x, z) {
  Object.assign(enemy, { x, z, y: groundY(x, z), goal: { x, z }, holdFor: 999 });
  enemy.flow = patrol.nav.flowTo(x, z, enemy.flow);
}

/** One robot tank a set distance straight up the valley from the child's, and no others about. */
function oneTankAt(patrol, away) {
  const [enemy] = patrol.enemies;
  patrol.enemies = [enemy];
  patrol.queue = [];
  patrol.total = 1;
  const { tank } = patrol;
  hold(patrol, enemy, tank.x, tank.z - away);
  return enemy;
}

/* ---------- the valley ---------- */

test('a tank can get from the start to everywhere that\'s free, including over every bridge', () => {
  const nav = valleyNav();
  const field = nav.flowTo(START.x, START.z);
  let free = 0;
  for (let index = 0; index < field.length; index += 1) {
    if (!nav.blocked[index]) {
      free += 1;
      assert.ok(Number.isFinite(field[index]), `cut off at ${nav.centreX(index)}, ${nav.centreZ(index)}`);
    }
  }
  assert.ok(free > 900, `only ${free} free squares`);
  for (const spot of SPAWNS) assert.ok(nav.isFree(spot.x, spot.z), `can't start at ${spot.x}, ${spot.z}`);
  // The far bank can only be reached over a bridge, and there's more than one.
  for (const bridge of BRIDGES) assert.ok(nav.isFree(bridge.x, bridge.z), `can't cross at ${bridge.id}`);
  assert.ok(BRIDGES.length >= 3);
});

test('no free square is in the river or on top of a building', () => {
  const nav = valleyNav();
  for (let index = 0; index < nav.blocked.length; index += 1) {
    if (nav.blocked[index]) continue;
    const x = nav.centreX(index);
    const z = nav.centreZ(index);
    const onBridge = BRIDGES.some((bridge) => Math.hypot(x - bridge.x, z - bridge.z) < bridge.length * 0.6);
    if (!onBridge) assert.ok(!riverNear(x, z), `in the river at ${x}, ${z}`);
    if (!onBridge) assert.ok(!solidNear(x, z, TANK_RADIUS * 0.5), `in something at ${x}, ${z}`);
  }
});

test('a bridge lifts a tank up over the water, and the valley floor is nearly flat', () => {
  const main = BRIDGES.find(({ id }) => id === 'main');
  assert.ok(groundY(main.x, main.z) > heightAt(main.x, main.z) + 1);
  for (let x = PLAY.left; x <= PLAY.right; x += 8) {
    for (let z = -26; z <= PLAY.near; z += 8) assert.ok(Math.abs(heightAt(x, z)) < 2.5, `steep at ${x}, ${z}`);
  }
});

test('the flow field leads round what\'s in the way, and over the bridge to the far bank', () => {
  const nav = valleyNav();
  const goal = nav.nearestFree(-38, -21); // In the clearing beyond the river.
  const field = nav.flowTo(goal.x, goal.z);
  const route = nav.route(field, START.x, START.z, goal, 12);
  assert.deepEqual(route.at(-1), goal);
  assert.ok(route.length >= 3, 'it can\'t just go straight there');
  for (let i = 1; i < route.length - 1; i += 1) assert.ok(nav.lineClear(route[i].x, route[i].z, route[i + 1].x, route[i + 1].z), `leg ${i} goes through something`);
});

test('pointing at a house or the river means the nearest place beside it', () => {
  const nav = valleyNav();
  for (const [x, z] of [[-30.6, 10.5], [20, 11.5], [-12, -6], [44, -21]]) {
    assert.ok(!nav.isFree(x, z));
    const spot = nav.nearestFree(x, z);
    assert.ok(nav.isFree(spot.x, spot.z));
    assert.ok(Math.hypot(spot.x - x, spot.z - z) < 14, `${x},${z} is ${Math.hypot(spot.x - x, spot.z - z)} away`);
  }
});

/* ---------- the hand ---------- */

const snapshotOf = (status, reason, extra = {}) => ({ side: 'right', handOpen: status === 'open' && !extra.overlap, overlap: false, ...extra, right: { status, reason } });

test('only a hand read as open is open, and only one read as closed is closed', () => {
  assert.equal(readHand(snapshotOf('open', null)), 'open');
  assert.equal(readHand(snapshotOf('closed', 'closed')), 'closed');
  assert.equal(readHand(snapshotOf('missing', 'missing')), 'none');
  for (const reason of ['edge', 'small', 'overlap']) assert.equal(readHand(snapshotOf('closed', reason)), 'unsure', reason);
  assert.equal(readHand(snapshotOf('closed', 'closed', { overlap: true })), 'unsure');
  assert.equal(readHand(snapshotOf('open', null, { overlap: true })), 'unsure');
});

/* ---------- driving ---------- */

const closedAt = (x, z) => ({ hand: 'closed', pointer: { x, z } });
const openAt = (x, z) => ({ hand: 'open', pointer: { x, z } });

test('a closed hand drives the tank to where it points, and stops there', () => {
  const patrol = started();
  run(patrol, 6, closedAt(8, 6));
  const { tank } = patrol;
  assert.ok(Math.hypot(tank.x - 8, tank.z - 6) < 1.6, `at ${tank.x}, ${tank.z}`);
  assert.ok(tank.speed < 1);
  assert.ok(patrol.stats.driven > 10);
});

test('an open hand, a hand out of view and a hand that can\'t be read don\'t drive', () => {
  for (const input of [openAt(-6, 6), { hand: 'none', pointer: null }, { hand: 'unsure', pointer: { x: -6, z: 6 } }]) {
    const patrol = started();
    run(patrol, 2, input);
    assert.deepEqual([patrol.tank.x, patrol.tank.z], [START.x, START.z], input.hand);
  }
});

test('a hand only just closed, or just coming into view, doesn\'t set the tank off', () => {
  const patrol = started();
  run(patrol, 0.15, closedAt(START.x, START.z - 12));
  assert.equal(patrol.tank.speed, 0);
  assert.notEqual(patrol.look, 'go');
  run(patrol, 0.3, openAt(START.x, START.z - 12));
  run(patrol, 0.15, closedAt(START.x, START.z - 12));
  assert.equal(patrol.tank.speed, 0, 'starting again from nothing each time it opens');
  run(patrol, 0.3, closedAt(START.x, START.z - 12));
  assert.ok(patrol.tank.speed > 0);
  assert.equal(patrol.look, 'go');
});

test('opening the hand stops the tank nearly at once', () => {
  const patrol = started();
  run(patrol, 1, closedAt(3, -2));
  const { tank } = patrol;
  assert.ok(tank.speed > 5);
  run(patrol, 0.35, openAt(3, -2));
  assert.equal(tank.speed, 0);
});

test('whatever it\'s told, the tank never gets stuck, and ends up beside where it was sent', () => {
  const random = seeded(99);
  const patrol = started({ random });
  const nav = valleyNav();
  // No shells or other tanks needed for this.
  patrol.enemies = [];
  patrol.queue = [];
  patrol.lobIn = 1e9;
  const trips = 120;
  for (let i = 0; i < trips; i += 1) {
    const x = PLAY.left + random() * (PLAY.right - PLAY.left);
    const z = PLAY.far + random() * (PLAY.near - PLAY.far);
    const want = nav.nearestFree(x, z);
    let seconds = 0;
    while (Math.hypot(patrol.tank.x - want.x, patrol.tank.z - want.z) > 1.6 && seconds < 40) {
      patrol.update(STEP, closedAt(x, z));
      seconds += STEP;
    }
    assert.ok(seconds < 40, `trip ${i} to ${x.toFixed(1)}, ${z.toFixed(1)} from ${patrol.tank.x.toFixed(1)}, ${patrol.tank.z.toFixed(1)} didn't arrive`);
    assert.ok(nav.isFree(patrol.tank.x, patrol.tank.z) || patrol.tank.slipFor > 0, 'it ended up somewhere it can\'t be');
  }
});

test('a robot tank in the way never holds the child\'s tank up', () => {
  const patrol = started();
  const enemy = oneTankAt(patrol, 12);
  hold(patrol, enemy, START.x + 2, START.z - 12);
  enemy.stun = 100;
  run(patrol, 5, closedAt(START.x, START.z - 22));
  assert.ok(patrol.tank.z < START.z - 20, `only got to ${patrol.tank.z}`);
  assert.ok(Math.hypot(enemy.x - patrol.tank.x, enemy.z - patrol.tank.z) >= 6.5, 'it should have been pushed out of the way');
});

test('a tank starts at the bottom of the valley, and every speed is quicker than the robots', () => {
  assert.ok(START.z > 10);
  for (const { drive, enemy } of Object.values(PACES)) assert.ok(drive > enemy * 2);
});

/* ---------- firing ---------- */

test('an open hand on a tank in range fires by itself, and stops it', () => {
  const patrol = started();
  const log = eventsOf(patrol);
  const enemy = oneTankAt(patrol, GUN.range - 4);
  run(patrol, 6, () => openAt(enemy.x, enemy.z));
  assert.equal(enemy.hp, 0);
  assert.notEqual(enemy.state, 'rolling');
  assert.equal(patrol.stats.stopped, 1);
  assert.ok(log.count('shot') >= enemy.maxHp);
  assert.equal(log.count('hit'), enemy.maxHp);
  assert.equal(log.count('stopped'), 1);
});

test('out of range it doesn\'t fire, and the crosshair says so', () => {
  const patrol = started();
  const log = eventsOf(patrol);
  const enemy = oneTankAt(patrol, GUN.range + 12);
  run(patrol, 2, () => openAt(enemy.x, enemy.z));
  assert.equal(log.count('shot'), 0);
  assert.equal(patrol.locked?.id, enemy.id);
  assert.equal(patrol.look, 'far');
  assert.equal(patrol.firing, false);
});

test('a closed hand on a tank doesn\'t fire, and neither does a hand out of view or one that can\'t be read', () => {
  for (const hand of ['closed', 'none', 'unsure']) {
    const patrol = started();
    const log = eventsOf(patrol);
    const enemy = oneTankAt(patrol, 20);
    run(patrol, 2, () => ({ hand, pointer: hand === 'none' ? null : { x: enemy.x, z: enemy.z } }));
    assert.equal(log.count('shot'), 0, hand);
    assert.equal(enemy.hp, enemy.maxHp, hand);
  }
});

test('driving at a robot tank stops well short of it, within reach of the gun', () => {
  const patrol = started();
  const enemy = oneTankAt(patrol, GUN.range + 12);
  run(patrol, 4, () => closedAt(enemy.x, enemy.z));
  assert.ok(patrol.inRange(enemy));
  assert.ok(patrol.tank.speed < 1);
  assert.ok(Math.hypot(enemy.x - patrol.tank.x, enemy.z - patrol.tank.z) > GUN.range * 0.6);
});

test('open, drive nearer, and open again: that\'s how a tank out of range gets stopped', () => {
  const patrol = started();
  const enemy = oneTankAt(patrol, GUN.range + 10);
  run(patrol, 1, () => openAt(enemy.x, enemy.z));
  assert.equal(enemy.hp, enemy.maxHp);
  run(patrol, 2, () => closedAt(enemy.x, enemy.z));
  assert.ok(patrol.inRange(enemy));
  run(patrol, 5, () => openAt(enemy.x, enemy.z));
  assert.notEqual(enemy.state, 'rolling');
});

test('the turret swings to the crosshair with an open hand, and it fires only once it\'s on target', () => {
  const patrol = started();
  const log = eventsOf(patrol);
  const enemy = oneTankAt(patrol, 18);
  hold(patrol, enemy, patrol.tank.x, patrol.tank.z + 18);
  patrol.tank.turret = 0; // Facing the other way.
  patrol.update(STEP, openAt(enemy.x, enemy.z));
  assert.equal(log.count('shot'), 0);
  run(patrol, 0.8, () => openAt(enemy.x, enemy.z));
  assert.ok(log.count('shot') > 0);
  assert.ok(Math.abs(Math.cos(patrol.tank.turret) + 1) < 0.1);
});

test('the crosshair is pulled onto a tank near it, by as much as Reach help says', () => {
  const place = (help) => {
    const patrol = started({ help });
    const enemy = oneTankAt(patrol, 18);
    const gap = enemy.size + AIM_HELP.little.radius * 0.8;
    run(patrol, 1, () => openAt(enemy.x + gap, enemy.z));
    return { locked: patrol.locked === enemy, off: Math.hypot(patrol.crosshair.x - enemy.x, patrol.crosshair.z - enemy.z) };
  };
  const [none, little, lots] = ['none', 'little', 'lots'].map(place);
  assert.equal(none.locked, false);
  assert.equal(little.locked, true);
  assert.equal(lots.locked, true);
  assert.ok(lots.off < little.off);
  assert.ok(little.off < none.off);
});

test('a hand that wanders a little stays on its target, rather than flicking between two', () => {
  const patrol = started({ tanks: 2 });
  const [a, b] = [patrol.enemies[0], patrol.enemies[1]];
  patrol.queue = [];
  patrol.total = 2;
  hold(patrol, a, START.x - 8, START.z - 14);
  hold(patrol, b, START.x + 8, START.z - 14);
  run(patrol, 0.5, () => openAt(START.x - 4, START.z - 14));
  assert.equal(patrol.locked?.id, a.id);
  run(patrol, 0.5, () => openAt(START.x, START.z - 14));
  assert.equal(patrol.locked?.id, a.id);
  run(patrol, 0.5, () => openAt(START.x + 8, START.z - 14));
  assert.equal(patrol.locked?.id, b.id);
});

/* ---------- the Driving setting ---------- */

test('driving by itself: an open hand on a tank out of range drives nearer, and then fires', () => {
  const patrol = started({ driving: 'auto' });
  const log = eventsOf(patrol);
  const enemy = oneTankAt(patrol, GUN.range + 14);
  run(patrol, 0.5, () => openAt(enemy.x, enemy.z));
  assert.ok(patrol.tank.speed > 1, 'it should have set off');
  assert.equal(log.count('shot'), 0);
  run(patrol, 8, () => openAt(enemy.x, enemy.z));
  assert.ok(log.count('shot') > 0);
  assert.notEqual(enemy.state, 'rolling');
});

test('driving by itself still needs a hand: it does nothing with none, one it can\'t read, or nothing to go to', () => {
  for (const input of [{ hand: 'none', pointer: null }, { hand: 'unsure', pointer: { x: START.x, z: -20 } }]) {
    const patrol = started({ driving: 'auto' });
    oneTankAt(patrol, GUN.range + 14);
    run(patrol, 1, input);
    assert.deepEqual([patrol.tank.x, patrol.tank.z], [START.x, START.z], input.hand);
  }
  const patrol = started({ driving: 'auto' });
  oneTankAt(patrol, GUN.range + 14);
  run(patrol, 1, openAt(START.x + 20, START.z + 2));
  assert.deepEqual([patrol.tank.x, patrol.tank.z], [START.x, START.z], 'open, with no tank there');
});

test('driving by itself: a closed hand drives it too, and it gets out from under a shell by itself', () => {
  const patrol = started({ driving: 'auto' });
  run(patrol, 2, closedAt(START.x - 10, START.z));
  assert.ok(patrol.tank.x < START.x - 7);
  const moved = started({ driving: 'auto' });
  const log = eventsOf(moved);
  oneTankAt(moved, GUN.range + 14);
  moved.lobIn = 0;
  moved.update(STEP, openAt(START.x + 20, START.z));
  assert.equal(moved.shells.length, 1);
  const startAt = { x: moved.tank.x, z: moved.tank.z };
  moved.level = { ...moved.level, lobEvery: [999, 999] };
  run(moved, 5, () => openAt(START.x + 20, START.z));
  assert.ok(Math.hypot(moved.tank.x - startAt.x, moved.tank.z - startAt.z) > moved.level.blast);
  assert.equal(moved.stats.hurts, 0);
  assert.equal(log.count('land'), 1);
});

/* ---------- shells ---------- */

function shellOverhead(patrol) {
  patrol.lobIn = 0;
  patrol.level = { ...patrol.level, firstLob: 0 };
  const stayOpen = { hand: 'open', pointer: { x: patrol.tank.x + 25, z: patrol.tank.z + 3 } };
  patrol.update(STEP, stayOpen);
  assert.equal(patrol.shells.length, 1);
  patrol.level = { ...patrol.level, lobEvery: [999, 999] };
  return patrol.shells[0];
}

test('a shell lands where the tank was when it was lobbed, slowly enough to be seen', () => {
  const patrol = started();
  oneTankAt(patrol, 30);
  const shell = shellOverhead(patrol);
  assert.ok(shell.seconds >= 3);
  assert.ok(Math.hypot(shell.to.x - patrol.tank.x, shell.to.z - patrol.tank.z) < 2);
  assert.equal(patrol.underShell, true);
  shell.share = 0.5;
  assert.ok(shellPoint(shell).y > 10, 'it goes over in a high arc');
});

test('a shell costs a heart if the tank is still there, and nothing if it has been driven away', () => {
  const stay = started();
  oneTankAt(stay, 30);
  const log = eventsOf(stay);
  shellOverhead(stay);
  run(stay, 4, (t) => ({ hand: t % 1 < 0.5 ? 'open' : 'closed', pointer: { x: stay.tank.x, z: stay.tank.z } }));
  assert.equal(stay.stats.hurts, 1);
  assert.equal(log.count('hurt'), 1);
  assert.equal(stay.hearts, LEVELS.gentle.hearts - 1);

  const away = started();
  oneTankAt(away, 30);
  const logAway = eventsOf(away);
  shellOverhead(away);
  run(away, 2, closedAt(START.x + 16, START.z));
  assert.equal(away.shells.length, 1);
  assert.equal(away.underShell, false, 'it\'s out from under it by now');
  run(away, 2, closedAt(START.x + 16, START.z));
  assert.equal(away.stats.hurts, 0);
  assert.equal(away.hearts, LEVELS.gentle.hearts);
  assert.equal(away.stats.dodged, 1);
  assert.equal(logAway.events.find(({ type }) => type === 'land').hit, false);
});

test('there\'s no shell until the child has had a while to get going, and not too many at once', () => {
  for (const [name, level] of Object.entries(LEVELS)) {
    const patrol = started({ level: name, tanks: 15 });
    const log = eventsOf(patrol);
    let most = 0;
    let seconds = 0;
    while (seconds < 30) {
      // Keeps moving, so it's never a rest.
      const t = seconds;
      patrol.update(STEP, closedAt(START.x + Math.sin(t) * 12, START.z - 3));
      most = Math.max(most, patrol.shells.length);
      if (t < level.firstLob - 0.05) assert.equal(log.count('lob'), 0, name);
      seconds += STEP;
    }
    assert.ok(log.count('lob') > 0, name);
    assert.ok(most <= level.inAir, name);
  }
});

/* ---------- hearts ---------- */

function lotsOfHits(patrol, times) {
  for (let i = 0; i < times; i += 1) {
    patrol.shells.push({ share: 0.999, seconds: 3, blast: 5, from: { x: 0, y: 0, z: 0 }, to: { x: patrol.tank.x, y: 0, z: patrol.tank.z } });
    patrol.update(STEP, closedAt(patrol.tank.x, patrol.tank.z));
  }
}

test('on Gentle a child can\'t lose: hearts stop at one', () => {
  const patrol = started({ level: 'gentle' });
  oneTankAt(patrol, 30);
  const log = eventsOf(patrol);
  lotsOfHits(patrol, 20);
  run(patrol, 2, closedAt(patrol.tank.x, patrol.tank.z));
  assert.equal(patrol.hearts >= 1, true);
  assert.equal(patrol.state, 'playing');
  assert.equal(log.count('lost'), 0);
});

test('on harder settings, running out ends the game, a moment later', () => {
  for (const level of ['medium', 'tough']) {
    const patrol = started({ level });
    oneTankAt(patrol, 30);
    const log = eventsOf(patrol);
    lotsOfHits(patrol, LEVELS[level].hearts);
    assert.equal(patrol.hearts, 0);
    assert.equal(patrol.state, 'playing');
    run(patrol, 1.2, closedAt(patrol.tank.x, patrol.tank.z));
    assert.equal(patrol.state, 'lost');
    assert.equal(log.count('lost'), 1);
  }
});

test('hearts come back with time', () => {
  const patrol = started();
  oneTankAt(patrol, 30);
  const log = eventsOf(patrol);
  lotsOfHits(patrol, 2);
  const after = patrol.hearts;
  patrol.level = { ...patrol.level, lobEvery: [999, 999] };
  run(patrol, LEVELS.gentle.healAfter + 0.5, (t) => closedAt(START.x + Math.sin(t) * 8, START.z - 3));
  assert.equal(patrol.hearts, after + 1);
  assert.equal(log.count('healed'), 1);
});

/* ---------- resting ---------- */

test('with the hand gone, the robots stop, the shells fizzle out, and nothing bad happens', () => {
  const patrol = started({ tanks: 6 });
  const enemy = oneTankAt(patrol, 30);
  const log = eventsOf(patrol);
  shellOverhead(patrol);
  patrol.lobIn = 0.1;
  const before = patrol.hearts;
  run(patrol, 3.2, { hand: 'none', pointer: null });
  assert.equal(patrol.resting, true);
  assert.equal(patrol.shells.length, 0);
  assert.equal(log.count('fizzle'), 1);
  const placed = { x: enemy.x, z: enemy.z };
  enemy.goal = null;
  run(patrol, 30, { hand: 'none', pointer: null });
  assert.equal(log.count('lob'), 1, 'only the one that was already on its way');
  assert.equal(patrol.hearts, before);
  assert.ok(Math.hypot(enemy.x - placed.x, enemy.z - placed.z) < 0.3, 'it should wait where it is');
});

test('a hand that stays the same for a few seconds is a rest too', () => {
  const patrol = started();
  oneTankAt(patrol, 30);
  run(patrol, 4.9, closedAt(patrol.tank.x, patrol.tank.z));
  assert.equal(patrol.resting, false);
  run(patrol, 0.4, closedAt(patrol.tank.x, patrol.tank.z));
  assert.equal(patrol.resting, true);
});

test('a hand held still while it fires isn\'t resting, and neither is one that\'s driving', () => {
  const patrol = started();
  const enemy = oneTankAt(patrol, 18);
  enemy.hp = enemy.maxHp = 100;
  run(patrol, 9, () => openAt(enemy.x, enemy.z));
  assert.equal(patrol.resting, false);
  assert.ok(patrol.firing);
});

test('a rest ends when the hand moves, and there\'s a moment before any more shells', () => {
  const patrol = started();
  oneTankAt(patrol, 30);
  const log = eventsOf(patrol);
  run(patrol, 4, { hand: 'none', pointer: null });
  assert.equal(patrol.resting, true);
  patrol.lobIn = 0;
  patrol.update(STEP, closedAt(START.x - 6, START.z));
  assert.equal(patrol.resting, false);
  assert.ok(patrol.lobIn > 2);
  assert.equal(log.count('lob'), 0);
});

/* ---------- a whole patrol ---------- */

test('tanks come a few at a time, more as others are stopped, and small ones first with a big one last', () => {
  for (const total of [6, 10, 15]) {
    const line = tanksFor(total);
    assert.equal(line.length, total);
    assert.equal(line[0], 'scout');
    assert.equal(line.at(-1), 'heavy');
  }
  const patrol = started({ tanks: 10, pace: 'fast' });
  const [first, most] = PACES.fast.out;
  // There are only so many ways in, so a few of them come in just after the rest.
  run(patrol, 6, (t) => closedAt(START.x + Math.sin(t * 3) * 6, START.z));
  assert.equal(patrol.rolling.length, first);
  let peak = 0;
  for (let i = 0; i < 10; i += 1) {
    const enemy = patrol.rolling[0];
    assert.ok(enemy, `tank ${i} is missing`);
    enemy.hp = 1;
    patrol.hit(enemy);
    // A second or two later the next is on its way.
    run(patrol, 2, (t) => closedAt(START.x + Math.sin(t * 3) * 6, START.z));
    peak = Math.max(peak, patrol.rolling.length);
    assert.ok(patrol.rolling.length <= most);
  }
  assert.equal(peak, most);
  assert.equal(patrol.stopped, 10);
});

test('a stopped tank doesn\'t explode: it rattles to a halt, its crew climbs out and waves, and it fades', () => {
  const patrol = started();
  const enemy = oneTankAt(patrol, 18);
  const log = eventsOf(patrol);
  enemy.hp = 1;
  patrol.hit(enemy);
  assert.equal(enemy.state, 'rattling');
  const seen = [enemy.state];
  for (let t = 0; t < 8; t += STEP) {
    patrol.update(STEP, closedAt(patrol.tank.x, patrol.tank.z));
    if (seen.at(-1) !== enemy.state) seen.push(enemy.state);
  }
  assert.deepEqual(seen, ['rattling', 'waving', 'fading', 'gone']);
  assert.ok(log.types().includes('crew'));
  assert.ok(!patrol.enemies.includes(enemy));
});

test('stopping them all wins, once the last crew has had time to climb out', () => {
  const patrol = started({ tanks: 6 });
  const log = eventsOf(patrol);
  // A child who drives up to each tank in turn and holds an open hand on it.
  let seconds = 0;
  let phase = 'closed';
  while (patrol.state === 'playing' && seconds < 300) {
    const [target] = patrol.rolling;
    if (target) phase = patrol.inRange(target) && patrol.tank.speed < 2 ? 'open' : patrol.inRange(target) ? phase : 'closed';
    const at = target ?? patrol.tank;
    patrol.update(STEP, { hand: phase, pointer: { x: at.x, z: at.z } });
    seconds += STEP;
    if (target && phase === 'closed' && Math.hypot(target.x - patrol.tank.x, target.z - patrol.tank.z) < GUN.range - 3) phase = 'open';
  }
  assert.equal(patrol.state, 'won', `after ${seconds} seconds, ${patrol.stopped} stopped`);
  assert.equal(patrol.stopped, 6);
  assert.equal(log.count('won'), 1);
  assert.ok(seconds < 240, `took ${seconds} seconds`);
});

test('every speed and every level can be played right through without anything going wrong', () => {
  for (const pace of Object.keys(PACES)) {
    for (const level of Object.keys(LEVELS)) {
      const patrol = started({ tanks: 10, pace, level, random: seeded(pace.length * 13 + level.length) });
      let seconds = 0;
      let closed = true;
      while (patrol.state === 'playing' && seconds < 500) {
        const [target] = patrol.rolling;
        const at = target ?? patrol.tank;
        if (target) closed = !patrol.inRange(target);
        patrol.update(STEP, { hand: closed ? 'closed' : 'open', pointer: { x: at.x, z: at.z } });
        seconds += STEP;
      }
      assert.ok(patrol.state === 'won' || (patrol.state === 'lost' && LEVELS[level].canLose), `${pace} ${level}: ${patrol.state} after ${seconds} seconds`);
      if (patrol.state === 'won') assert.equal(patrol.stopped, 10);
      assert.ok(Number.isFinite(patrol.tank.x + patrol.tank.z + patrol.tank.heading + patrol.tank.turret));
    }
  }
});

test('robot tanks never get stuck, and go on moving about, keeping off the child\'s tank and each other', () => {
  const patrol = started({ tanks: 15, pace: 'medium', random: seeded(1234) });
  const nav = valleyNav();
  patrol.level = { ...patrol.level, lobEvery: [999, 999] };
  patrol.lobIn = 999;
  const moved = new Map();
  const last = new Map();
  for (let t = 0; t < 180; t += STEP) {
    patrol.update(STEP, closedAt(START.x + Math.sin(t * 0.3) * 30, 4 + Math.cos(t * 0.21) * 16));
    for (const enemy of patrol.rolling) {
      const before = last.get(enemy);
      if (before) moved.set(enemy, (moved.get(enemy) ?? 0) + Math.hypot(enemy.x - before.x, enemy.z - before.z));
      last.set(enemy, { x: enemy.x, z: enemy.z });
      assert.ok(nav.isFree(enemy.x, enemy.z) || enemy.slipFor > 0, `${enemy.kind} at ${enemy.x}, ${enemy.z} is somewhere it can't be`);
    }
  }
  assert.ok(moved.size >= 2);
  for (const [enemy, distance] of moved) assert.ok(distance > 60, `${enemy.kind} only went ${distance}`);
});

test('nothing here looks like a promise to GameSession', () => {
  assert.equal(typeof new Patrol().then, 'undefined');
});

/* ---------- what's said ---------- */

const MOST_WORDS = 10;

test('Tank Patrol keeps its talking short, and everything it says has a voice in both languages', () => {
  const folder = new URL('../../games/tank-patrol/audio/voice/', import.meta.url);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder)));
  assert.ok(lines.length <= 12, `${lines.length} lines is a lot`);
  const ids = new Set(lines.map(({ id }) => id));
  assert.equal(ids.size, lines.length);
  for (const { id, text, ka, voice, kaVoice, kaPitch } of lines) {
    assert.ok(text.split(/\s+/).length <= MOST_WORDS, `too long: ${text}`);
    assert.match(ka, /[Ⴀ-ჿ]/, id);
    for (const language of ['en', 'ka']) assert.ok(existsSync(new URL(`${language}/${id}.ogg`, folder)), `${language}/${id}`);
    if (voice) assert.deepEqual([voice, kaVoice, kaPitch], ['am_michael', 'ka-GE-GiorgiNeural', 0], `${id} is Joze`);
  }
  const source = readFileSync(new URL('../../games/tank-patrol/main.js', import.meta.url), 'utf8');
  for (const { text } of lines) assert.ok(source.includes(text), `nothing says: ${text}`);
});

/* ---------- levels ---------- */

const LEVEL_NUMBERS = Array.from({ length: 10 }, (_, index) => index + 1);
// Which way is harder for each thing a level changes: up, down, or switched on.
const HARDER = { enemy: 'up', hold: 'down', standoff: 'up', lobEvery: 'down', shellSeconds: 'down', moreFirst: 'up', moreMost: 'up', inAir: 'up', dash: 'on', pairs: 'on', lead: 'up', retreat: 'on', doubleShell: 'on' };

test('level 1 is the game as it always was, with every speed and difficulty', () => {
  for (const pace of Object.keys(PACES)) {
    for (const level of Object.keys(LEVELS)) {
      const patrol = started({ pace, level, levelNumber: 1 });
      assert.equal(patrol.pace, PACES[pace]);
      assert.equal(patrol.level, LEVELS[level]);
      assert.equal(patrol.enemySpeed, PACES[pace].enemy);
      assert.equal(patrol.shellSeconds, LEVELS[level].shellSeconds);
      assert.equal(patrol.inAir, LEVELS[level].inAir);
      assert.equal(patrol.lead, LEVELS[level].lead);
      assert.equal(patrol.mostOut, PACES[pace].out[0]);
    }
  }
  const plan = levelPlan(1);
  assert.deepEqual([plan.standoff, plan.moreFirst, plan.moreMost, plan.dash, plan.pairs, plan.retreat, plan.doubleShell], [0, 0, 0, false, false, false, 0]);
  for (const key of ['enemy', 'hold', 'lobEvery', 'shellSeconds']) assert.equal(plan[key], 1, key);
});

test('each level is the same or harder than the one before in every way, and harder in at least one', () => {
  assert.deepEqual(Object.keys(levelPlan(1)).sort(), Object.keys(HARDER).sort());
  for (const level of LEVEL_NUMBERS.slice(1)) {
    const before = levelPlan(level - 1);
    const now = levelPlan(level);
    let harder = 0;
    for (const [key, way] of Object.entries(HARDER)) {
      const [a, b] = way === 'down' ? [now[key], before[key]] : [Number(before[key]), Number(now[key])];
      assert.ok(a <= b, `level ${level}: ${key} got easier`);
      if (a < b) harder += 1;
    }
    assert.ok(harder >= 1, `level ${level} is no harder than ${level - 1}`);
  }
  for (const key of ['dash', 'pairs', 'retreat', 'doubleShell']) assert.ok(LEVEL_NUMBERS.find((level) => levelPlan(level)[key]) >= 3, key);
});

test('a level never changes what a grown-up chose: hearts, Gentle, how many tanks, reach help or driving', () => {
  for (const level of LEVEL_NUMBERS) {
    const patrol = started({ levelNumber: level, tanks: 10, help: 'lots', driving: 'auto' });
    assert.equal(patrol.total, 10);
    assert.equal(patrol.hearts, LEVELS.gentle.hearts);
    assert.equal(patrol.level, LEVELS.gentle);
    assert.equal(patrol.help, AIM_HELP.lots);
    assert.equal(patrol.autoDrive, true);
    assert.equal(patrol.queue.length + patrol.enemies.length, 10);
  }
  const patrol = started({ levelNumber: 10 });
  oneTankAt(patrol, 30);
  lotsOfHits(patrol, 20);
  run(patrol, 2, closedAt(patrol.tank.x, patrol.tank.z));
  assert.equal(patrol.state, 'playing', 'Gentle still can\'t be lost');
  assert.equal(patrol.hearts, 1);
});

/**
 * A child playing: driving at the nearest robot tank with a closed hand until it's in range, then
 * opening to fire, and driving away from a shell that's coming down on them. Changing from one to the
 * other takes a moment. Counts the movements asked for: each open or close, and each new tank to aim at.
 */
function patrolLikeAChild(patrol, { switchSeconds = 0.45, dodge = true, auto = false } = {}) {
  let hand = 'closed';
  let waitFor = 0;
  let target = null;
  let movements = 0;
  let seconds = 0;
  while (patrol.state === 'playing' && seconds < 900) {
    const { tank } = patrol;
    const nearest = patrol.rolling.slice().sort((a, b) => Math.hypot(a.x - tank.x, a.z - tank.z) - Math.hypot(b.x - tank.x, b.z - tank.z))[0];
    if (nearest && nearest !== target) {
      target = nearest;
      movements += 1;
    }
    const shell = dodge && !auto && patrol.shells.find(({ to, blast, share }) => share > 0.25 && Math.hypot(tank.x - to.x, tank.z - to.z) <= blast + 1);
    let wanted = 'closed';
    let pointer = target ? { x: target.x, z: target.z } : { x: tank.x, z: tank.z };
    if (shell) {
      const dx = tank.x - shell.to.x;
      const dz = tank.z - shell.to.z;
      const gap = Math.hypot(dx, dz) || 1;
      pointer = { x: tank.x + (dx / gap) * 12, z: tank.z + (dz / gap) * 12 };
    } else if (auto || (target && patrol.inRange(target))) {
      wanted = 'open';
    }
    if (wanted !== hand) {
      waitFor += STEP;
      if (waitFor >= switchSeconds) {
        hand = wanted;
        waitFor = 0;
        movements += 1;
      }
    } else {
      waitFor = 0;
    }
    patrol.update(STEP, { hand, pointer });
    seconds += STEP;
  }
  return { seconds, perMinute: (movements / seconds) * 60, won: patrol.state === 'won' };
}

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

test('level 10 asks no more than twice the movements a minute of level 1, and lasts no more than a third longer', () => {
  // On Gentle, so that every game gets to the end and they can be compared.
  for (const [pace, tanks] of [['slow', 6], ['medium', 10], ['fast', 15]]) {
    const play = (levelNumber) => [3, 7, 11, 19].map((seed) => patrolLikeAChild(started({ pace, tanks, levelNumber, random: seeded(seed) })));
    const first = play(1);
    const last = play(10);
    for (const game of [...first, ...last]) assert.ok(game.won, `${pace}: not finished`);
    const longer = average(last.map(({ seconds }) => seconds)) / average(first.map(({ seconds }) => seconds));
    const busier = average(last.map(({ perMinute }) => perMinute)) / average(first.map(({ perMinute }) => perMinute));
    console.log(`tank patrol ${pace}: level 10 is ${longer.toFixed(2)} times as long, with ${busier.toFixed(2)} times the movements a minute`);
    assert.ok(longer <= 1.34, `${pace}: ${longer.toFixed(2)} times as long`);
    assert.ok(busier <= 2, `${pace}: ${busier.toFixed(2)} times the movements`);
  }
});

test('at level 10 there\'s still at least 70% of the time to get out from under a shell', () => {
  for (const level of Object.keys(LEVELS)) {
    const first = started({ level, levelNumber: 1 });
    const last = started({ level, levelNumber: 10 });
    assert.ok(last.shellSeconds >= first.shellSeconds * 0.7, level);
  }
  assert.ok(started({ levelNumber: 10 }).shellSeconds >= 3, 'on Gentle, still three seconds or more');
});

test('every speed, difficulty and way of driving can be played right through at level 10', () => {
  for (const pace of Object.keys(PACES)) {
    for (const level of Object.keys(LEVELS)) {
      for (const driving of ['closed', 'auto']) {
        const patrol = started({ tanks: 10, pace, level, driving, levelNumber: 10, random: seeded(pace.length * 13 + level.length) });
        const { won } = patrolLikeAChild(patrol, { auto: driving === 'auto' });
        assert.ok(won || (patrol.state === 'lost' && LEVELS[level].canLose), `${pace} ${level} ${driving}: ${patrol.state}`);
        if (won) assert.equal(patrol.stopped, 10);
        assert.ok(Number.isFinite(patrol.tank.x + patrol.tank.z + patrol.tank.heading + patrol.tank.turret));
      }
    }
  }
});

test('at level 10 the new things really happen: dashing scouts, pairs, shells aimed ahead, running off and two shells at once', () => {
  const events = [];
  const patrol = started({ tanks: 15, levelNumber: 10, random: seeded(5), onEvent: (event) => events.push({ ...event, paired: Boolean(event.enemy?.leader) }) });
  const count = (type) => events.filter((event) => event.type === type).length;
  const log = { events, count };
  const result = patrolLikeAChild(patrol);
  assert.ok(result.won);
  assert.ok(log.count('dash') > 0, 'dashes');
  assert.ok(log.count('run-off') > 0, 'runs off');
  assert.ok(log.events.some(({ type, second }) => type === 'lob' && second), 'two shells at once');
  assert.ok(log.events.some(({ type, paired }) => type === 'spawn' && paired), 'pairs');
  assert.equal(patrol.mostOut, PACES.slow.out[1] + 2);
});

test('a pair keeps together, and a tank running off can still be chased down and stopped', () => {
  const patrol = started({ tanks: 6, levelNumber: 10, random: seeded(8) });
  const follower = patrol.enemies.find(({ leader }) => leader);
  assert.ok(follower);
  let closest = Infinity;
  for (let t = 0; t < 30; t += STEP) {
    patrol.update(STEP, closedAt(START.x + Math.sin(t) * 3, START.z));
    if (t > 8 && follower.leader?.state === 'rolling') closest = Math.min(closest, Math.hypot(follower.x - follower.leader.x, follower.z - follower.leader.z));
  }
  assert.ok(closest < 20, `${closest} apart`);

  const chase = started({ levelNumber: 10 });
  const log = eventsOf(chase);
  const enemy = oneTankAt(chase, GUN.range - 4);
  enemy.hp = 12;
  enemy.maxHp = 12;
  let gotAway = false;
  for (let t = 0; t < 6; t += STEP) {
    chase.update(STEP, openAt(enemy.x, enemy.z));
    if (log.count('run-off') && !chase.inRange(enemy)) gotAway = true;
  }
  assert.equal(log.count('run-off'), 1);
  assert.ok(gotAway, 'it got out of range');
  assert.equal(enemy.state, 'rolling');
  // Driving after it and opening again stops it.
  let seconds = 0;
  while (enemy.state === 'rolling' && seconds < 60) {
    chase.update(STEP, chase.inRange(enemy) ? openAt(enemy.x, enemy.z) : closedAt(enemy.x, enemy.z));
    seconds += STEP;
  }
  assert.notEqual(enemy.state, 'rolling');
  assert.ok(Math.max(...STANDOFF) > GUN.range);
});

test('driving by itself gets out from under two shells at once', () => {
  const patrol = started({ driving: 'auto', levelNumber: 10 });
  oneTankAt(patrol, GUN.range + 14);
  const { tank } = patrol;
  for (const dx of [0, 9]) patrol.shells.push({ share: 0.3, seconds: 3, blast: patrol.level.blast, from: { x: 0, y: 0, z: 0 }, to: { x: tank.x + dx, y: 0, z: tank.z } });
  patrol.lobIn = 999;
  run(patrol, 3, () => openAt(START.x + 20, START.z));
  assert.equal(patrol.stats.hurts, 0);
});

test('at level 10, resting still stops it all, and nothing bad happens', () => {
  const patrol = started({ levelNumber: 10, tanks: 15 });
  const log = eventsOf(patrol);
  run(patrol, 6, (t) => closedAt(START.x + Math.sin(t) * 8, START.z - 3));
  run(patrol, 3.2, { hand: 'none', pointer: null });
  assert.equal(patrol.resting, true);
  run(patrol, 2, { hand: 'none', pointer: null }); // Coming to a stop.
  const where = patrol.rolling.map(({ x, z }) => [x, z]);
  const before = { lob: log.count('lob'), hearts: patrol.hearts, dash: log.count('dash') };
  run(patrol, 30, { hand: 'none', pointer: null });
  assert.deepEqual([log.count('lob'), patrol.hearts, log.count('dash')], [before.lob, before.hearts, before.dash]);
  patrol.rolling.forEach(({ x, z }, index) => assert.ok(Math.hypot(x - where[index][0], z - where[index][1]) < 0.5));
});
