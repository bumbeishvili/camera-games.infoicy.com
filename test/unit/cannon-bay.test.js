// The rules of Cannon Bay. Its screen is tested in test/e2e/cannon-bay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Battle, HEARTS, HULL, LEVELS, MOST_AT_ONCE, MOST_HEARTS, NEWS, PACES, POWERS, REST_AFTER, SHIP_KINDS, forwardOf, levelPlan, newsAt } from '../../games/cannon-bay/battle.js';
import { BaySound } from '../../games/cannon-bay/bay-sound.js';
import { getChart } from '../../games/cannon-bay/chart.js';
import { WORLD, heightAt } from '../../games/sky-wings/island-map.js';

const STEP = 1 / 30;
const OPEN = { open: true, seen: true, drive: 1, steer: 0 };
const CLOSED = { open: false, seen: true, drive: 0, steer: 0 };
const GONE = { open: false, seen: false, drive: 0, steer: 0 };

function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function start(options = {}) {
  const events = [];
  const battle = new Battle({ random: seeded(), onEvent: (event) => events.push(event), ...options });
  battle.begin();
  return { battle, events, types: () => events.map(({ type }) => type) };
}

const run = (battle, seconds, input = OPEN) => {
  for (let i = 0; i < seconds / STEP; i += 1) battle.update(STEP, typeof input === 'function' ? input() : input);
};

/** Keeps a pirate this far off the bow, so a test is about one thing. Others go far away. */
function hold(battle, off, away = 90) {
  const [pirate, ...others] = battle.afloat;
  const direction = battle.heading + off;
  pirate.x = battle.x + Math.sin(direction) * away;
  pirate.z = battle.z - Math.cos(direction) * away;
  pirate.mode = 'circle';
  pirate.runAt = -1;
  pirate.fireIn = 100;
  pirate.burstLeft = 0;
  for (const other of others) {
    other.x = battle.x - Math.sin(battle.heading) * 600;
    other.z = battle.z + Math.cos(battle.heading) * 600;
    other.fireIn = 100;
    other.burstLeft = 0;
  }
  battle.broadsideIn = 100;
  return pirate;
}

const holding = (battle, seconds, off, input = OPEN, away = 90) => {
  let pirate = null;
  for (let i = 0; i < seconds / STEP; i += 1) {
    pirate = hold(battle, off, away);
    battle.update(STEP, input);
  }
  return pirate;
};

/** A ball that lands this far from the middle of the child's ship, right now. */
function ballAt(battle, x, z) {
  const ball = { from: { x, y: 5, z }, to: { x, z }, t: 0.999, seconds: 2, arc: 40, x, y: 1, z, harmless: false, pirate: null };
  battle.balls.push(ball);
  return ball;
}

const ballOnHull = (battle) => ballAt(battle, battle.x, battle.z);

/* ---------- the wheel and the sails ---------- */

test('moving the hand turns the wheel, and the ship with it', () => {
  const { battle } = start();
  run(battle, 2, OPEN);
  const before = battle.heading;
  run(battle, 1.5, { ...OPEN, steer: 1 });
  assert.ok(battle.wheel > 0.9);
  assert.ok(battle.heading > before + 0.3, `turned right ${battle.heading - before}`);
  const after = battle.heading;
  run(battle, 3, { ...OPEN, steer: -1 });
  assert.ok(battle.wheel < -0.9);
  assert.ok(battle.heading < after - 0.3, `turned left ${battle.heading - after}`);
});

test('with the hand in the middle the ship goes straight, and the wheel comes back', () => {
  const { battle } = start({ ships: 0 });
  run(battle, 1, { ...OPEN, steer: 1 });
  run(battle, 2, { ...OPEN, steer: 0 });
  assert.ok(Math.abs(battle.wheel) < 0.01);
  const before = battle.heading;
  run(battle, 1, OPEN);
  assert.ok(Math.abs(battle.heading - before) < 0.02);
});

test('an open hand raises the sails and the ship moves, and a closed hand lowers them', () => {
  const { battle } = start();
  assert.equal(battle.sails, 0);
  run(battle, 3, OPEN);
  assert.ok(battle.sails > 0.95, `sails ${battle.sails}`);
  assert.ok(battle.speed > PACES.slow.speed * 0.8, `speed ${battle.speed}`);
  const { speed } = battle;
  run(battle, 4, CLOSED);
  assert.ok(battle.sails < 0.01);
  assert.ok(battle.speed < speed * 0.3, `slowed to ${battle.speed}`);
  // It drifts, rather than stopping dead.
  run(battle, 8, CLOSED);
  assert.ok(battle.speed > 0.5);
  const { x, z } = battle;
  run(battle, 1, CLOSED);
  assert.ok(Math.hypot(battle.x - x, battle.z - z) > 0.5);
});

test('the wider the hand is open, the faster the ship goes', () => {
  const speedAt = (drive) => {
    const { battle } = start();
    run(battle, 6, { ...OPEN, drive });
    return battle.speed;
  };
  assert.ok(speedAt(1) > speedAt(0.9) + 2);
  assert.ok(speedAt(0.9) > speedAt(0.8) + 2);
  assert.ok(speedAt(0.8) > 0);
});

test('speed is a setting', () => {
  const speedAt = (pace) => {
    const { battle } = start({ pace });
    run(battle, 6, OPEN);
    return battle.speed;
  };
  assert.ok(speedAt('slow') < speedAt('medium'));
  assert.ok(speedAt('medium') < speedAt('fast'));
});

test('a closed hand can still turn the wheel, but a hand that can\'t be seen turns nothing', () => {
  const { battle } = start();
  run(battle, 1, { ...CLOSED, steer: 1 });
  assert.ok(battle.wheel > 0.9);
  run(battle, 2, GONE);
  assert.ok(Math.abs(battle.wheel) < 0.01);
});

test('numbers that make no sense count as nothing, never as an open hand', () => {
  const { battle } = start();
  run(battle, 2, { open: false, seen: false, drive: Number.NaN, steer: Number.NaN });
  assert.equal(battle.sails, 0);
  assert.equal(battle.wheel, 0);
  assert.ok(Number.isFinite(battle.heading) && Number.isFinite(battle.x));
  // Only true counts: an open hand can't be anything else.
  battle.update(STEP, { open: 'yes', seen: 'yes', drive: 1 });
  assert.equal(battle.canFire, false);
  assert.equal(battle.sails, 0);
});

/* ---------- the firing zones ---------- */

test('a pirate in a firing zone gets fired at with an open hand, and hit, on that side only', () => {
  const { battle, events } = start();
  holding(battle, 2, Math.PI / 2);
  assert.equal(battle.zones.right.firing, true);
  assert.equal(battle.zones.left.firing, false);
  assert.ok(battle.stats.shots >= 4);
  assert.ok(battle.stats.hits >= 3);
  assert.ok(events.filter(({ type }) => type === 'fire').every(({ side }) => side === 'right'));
});

test('the zone on the left fires to the left', () => {
  const { battle, events } = start();
  holding(battle, 1, -Math.PI / 2);
  assert.equal(battle.zones.left.firing, true);
  assert.equal(battle.zones.right.firing, false);
  assert.ok(events.filter(({ type }) => type === 'fire').every(({ side }) => side === 'left'));
  assert.ok(events.some(({ type }) => type === 'fire'));
});

test('a closed hand doesn\'t fire', () => {
  const { battle } = start();
  holding(battle, 2, Math.PI / 2, CLOSED);
  assert.equal(battle.stats.shots, 0);
  assert.equal(battle.zones.right.firing, false);
  // The zone can still see it, which is what asks the child to open their hand.
  assert.equal(battle.zones.right.inside, true);
});

test('a hand out of view doesn\'t fire, even when the cannons are set to fire always', () => {
  for (const cannons of ['open', 'always']) {
    const { battle } = start({ cannons });
    holding(battle, 2, Math.PI / 2, GONE);
    assert.equal(battle.stats.shots, 0, cannons);
  }
});

test('set to always, the cannons fire with a closed hand that\'s in view', () => {
  const { battle } = start({ cannons: 'always' });
  holding(battle, 2, Math.PI / 2, CLOSED);
  assert.ok(battle.stats.shots >= 4);
});

test('closing the hand stops the cannons at once', () => {
  const { battle } = start();
  holding(battle, 1, Math.PI / 2, OPEN);
  const { shots } = battle.stats;
  assert.ok(shots > 0);
  holding(battle, 2, Math.PI / 2, CLOSED);
  assert.equal(battle.stats.shots, shots);
});

test('straight ahead, straight behind or far away is outside the zones', () => {
  const { battle } = start();
  holding(battle, 1, 0.05);
  holding(battle, 1, Math.PI - 0.05);
  holding(battle, 1, Math.PI / 2, OPEN, LEVELS.gentle.zone.reach + 60);
  assert.equal(battle.stats.shots, 0);
});

test('any part of a ship in a zone counts, as what\'s seen there is what gets fired at', () => {
  const { battle } = start();
  const [pirate] = battle.afloat;
  const { from, reach } = LEVELS.gentle.zone;
  // Its middle is just past the far edge, along the line of the zone's front edge, and it's lying
  // with its bow pointing back towards the ship.
  const direction = battle.heading + from + 0.05;
  pirate.x = battle.x + Math.sin(direction) * (reach + 8);
  pirate.z = battle.z - Math.cos(direction) * (reach + 8);
  pirate.heading = Math.atan2(battle.x - pirate.x, -(battle.z - pirate.z));
  assert.equal(battle.zoneOf(pirate), 'right');
  pirate.heading += Math.PI / 2;
  assert.equal(battle.zoneOf(pirate), null);
});

test('the zones are generous on Gentle, and shrink on the harder settings', () => {
  const { gentle, medium, tough } = LEVELS;
  const size = ({ zone }) => (zone.to - zone.from) * zone.reach;
  assert.ok(size(gentle) > size(medium) && size(medium) > size(tough));
  // There's no way of being alongside without being in it.
  assert.ok(gentle.zone.from < Math.PI / 4 && gentle.zone.to > (Math.PI * 2) / 3);
});

test('the ship turns a little by itself to keep a nearby pirate alongside, only with an open hand', () => {
  const turned = (input, off) => {
    const { battle } = start();
    run(battle, 1, OPEN);
    const before = battle.heading;
    holding(battle, 1.5, off, input, 120);
    return battle.heading - before;
  };
  // Nearly ahead on the right: it turns away to the left, to bring it onto the beam.
  assert.ok(turned(OPEN, 0.3) < -0.1);
  // Well behind on the right: it turns right, to bring it forward.
  assert.ok(turned(OPEN, 2.7) > 0.1);
  assert.equal(turned(CLOSED, 0.3), 0);
  assert.equal(turned(GONE, 0.3), 0);
});

test('help with lining up is less on the harder settings', () => {
  const turned = (level) => {
    const { battle } = start({ level });
    run(battle, 1, OPEN);
    const before = battle.heading;
    holding(battle, 1, 0.3, OPEN, 120);
    return Math.abs(battle.heading - before);
  };
  assert.ok(turned('gentle') > turned('medium'));
  assert.ok(turned('medium') > turned('tough'));
});

/* ---------- pirates ---------- */

test('a few pirates at a time, on the water, and another as soon as one is beaten', () => {
  const { battle, types } = start({ ships: 6 });
  assert.equal(battle.afloat.length, MOST_AT_ONCE);
  assert.equal(battle.waiting, 3);
  const chart = getChart();
  for (const { x, z } of battle.afloat) assert.ok(chart.room(x, z) > 40);
  const [first] = battle.afloat;
  while (first.state === 'sailing') battle.hit(first, first);
  assert.equal(battle.beaten, 1);
  assert.ok(types().includes('beaten'));
  run(battle, 1.1, OPEN);
  assert.equal(battle.afloat.length, MOST_AT_ONCE);
  assert.equal(battle.waiting, 2);
});

test('they come up in the sea however close to land the child is', () => {
  const chart = getChart();
  for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
    const battle = new Battle({ random: seeded(11) });
    // Pointing straight at the coast.
    battle.x = Math.cos(angle) * 560;
    battle.z = Math.sin(angle) * 560;
    battle.heading = Math.atan2(-battle.x, battle.z);
    battle.begin();
    for (const { x, z } of battle.afloat) assert.ok(chart.room(x, z) > 40 && Math.hypot(x, z) <= WORLD.limit, `${x}, ${z}`);
  }
});

test('they come to the child, and turn side on to fire slow balls in a high arc', () => {
  const { battle, events } = start();
  run(battle, 40, { ...CLOSED, seen: true });
  const fired = events.filter(({ type }) => type === 'pirate-fire');
  // A closed hand rests after a while, so nothing here is about that: this is a hand that stays open.
  const open = start();
  for (let i = 0; i < 40 / STEP; i += 1) {
    // The ship is kept nearly still, and holds its fire, by nobody being in range of its zones.
    open.battle.zones.left.reload = 100;
    open.battle.zones.right.reload = 100;
    open.battle.update(STEP, { ...OPEN, drive: 0.8 });
  }
  const shots = open.events.filter(({ type }) => type === 'pirate-fire');
  assert.ok(fired.length <= shots.length);
  assert.ok(shots.length >= 2, `${shots.length} balls`);
  for (const { ball } of shots) {
    assert.ok(ball.seconds >= 2, 'slow');
    assert.ok(ball.arc >= 30, 'high');
  }
});

test('a ball that lands away from the ship makes a splash, and costs nothing', () => {
  const { battle, types } = start();
  ballAt(battle, battle.x + 40, battle.z + 40);
  battle.update(STEP, OPEN);
  assert.equal(battle.hearts, HEARTS);
  assert.ok(types().includes('splash'));
  assert.ok(!types().includes('hurt'));
});

test('a ball that lands on the ship costs a heart, and they come back with time', () => {
  const { battle, types } = start();
  ballOnHull(battle);
  battle.update(STEP, OPEN);
  assert.equal(battle.hearts, HEARTS - 1);
  assert.ok(types().includes('hurt'));
  battle.pirates.length = 0;
  battle.waiting = 0;
  run(battle, LEVELS.gentle.healAfter + 0.5, OPEN);
  assert.equal(battle.hearts, HEARTS);
  assert.ok(types().includes('healed'));
});

test('the hull is long and thin: a ball past the bow or beside the bow counts as it should', () => {
  const { battle } = start();
  const forward = forwardOf(battle.heading);
  assert.equal(battle.distanceFromHull(battle.x + forward.x * HULL.half, battle.z + forward.z * HULL.half), 0);
  const past = battle.distanceFromHull(battle.x + forward.x * (HULL.half + 30), battle.z + forward.z * (HULL.half + 30));
  assert.ok(Math.abs(past - 30) < 1e-6);
});

test('on Gentle the child can\'t be sunk: hearts stop at one', () => {
  const { battle, types } = start({ level: 'gentle' });
  for (let i = 0; i < HEARTS * 3; i += 1) {
    ballOnHull(battle);
    battle.update(STEP, OPEN);
    assert.ok(battle.hearts >= 1);
  }
  assert.equal(battle.hearts, 1);
  assert.equal(battle.state, 'sailing');
  assert.ok(!types().includes('lost'));
});

test('on the harder settings running out of hearts ends the battle', () => {
  for (const level of ['medium', 'tough']) {
    const { battle, types } = start({ level });
    for (let i = 0; i < HEARTS; i += 1) {
      ballOnHull(battle);
      battle.update(STEP, OPEN);
    }
    assert.equal(battle.hearts, 0);
    assert.equal(battle.state, 'lost');
    assert.ok(types().includes('lost'));
    // And it stays harmless afterwards.
    ballOnHull(battle);
    battle.update(STEP, OPEN);
    assert.equal(battle.hearts, 0);
  }
});

/* ---------- resting ---------- */

for (const [name, input] of [['closed', CLOSED], ['gone', GONE]]) {
  test(`a hand that's ${name} for a while is a rest: no firing, and the pirates sail in circles`, () => {
    const { battle, events, types } = start();
    run(battle, 12, OPEN);
    const ball = ballOnHull(battle);
    ball.t = 0.5; // It's still in the air when the rest begins.
    run(battle, REST_AFTER + 0.5, input);
    assert.equal(battle.resting, true);
    assert.ok(types().includes('resting'));
    const { hurts } = battle.stats;
    const fired = events.filter(({ type }) => type === 'pirate-fire').length;
    run(battle, 60, input);
    assert.equal(events.filter(({ type }) => type === 'pirate-fire').length, fired);
    assert.equal(battle.stats.hurts, hurts);
    assert.equal(battle.state, 'sailing');
    assert.ok(battle.afloat.every(({ mode }) => mode === 'circle'));
    assert.equal(battle.balls.length, 0);
  });
}

test('a ball already in the air when the rest begins lands harmlessly', () => {
  const { battle } = start();
  const ball = ballOnHull(battle);
  ball.t = 0;
  ball.seconds = 3;
  for (let i = 0; i < (REST_AFTER + 0.2) / STEP; i += 1) {
    ball.t = Math.min(ball.t, 0.5);
    battle.update(STEP, CLOSED);
  }
  assert.equal(battle.resting, true);
  assert.equal(ball.harmless, true);
  run(battle, 3, CLOSED);
  assert.equal(battle.hearts, HEARTS);
});

test('opening the hand ends a rest, with a moment before anyone fires again', () => {
  const { battle, events } = start();
  run(battle, 10, CLOSED);
  assert.equal(battle.resting, true);
  const fired = events.filter(({ type }) => type === 'pirate-fire').length;
  battle.update(STEP, OPEN);
  assert.equal(battle.resting, false);
  run(battle, 1.5, OPEN);
  assert.equal(events.filter(({ type }) => type === 'pirate-fire').length, fired);
  assert.ok(battle.afloat.every(({ mode }) => mode !== 'circle'));
});

test('a short close is not a rest, as closing is never a failure and never a pause either', () => {
  const { battle } = start();
  run(battle, REST_AFTER - 0.5, CLOSED);
  assert.equal(battle.resting, false);
  run(battle, 1, OPEN);
  run(battle, REST_AFTER - 0.5, CLOSED);
  assert.equal(battle.resting, false);
});

/* ---------- the land and the edge of the world ---------- */

/** Steers as badly as possible: straight at the middle of the island, at full speed. */
const straightAtTheMiddle = (battle) => {
  const wanted = Math.atan2(-battle.x, battle.z);
  const off = Math.atan2(Math.sin(wanted - battle.heading), Math.cos(wanted - battle.heading));
  return { ...OPEN, steer: Math.max(-1, Math.min(1, off * 3)) };
};

const LEAST_ROOM = 20;

test('the ship can\'t hit the land, however it\'s steered, from anywhere', () => {
  const chart = getChart();
  for (let angle = 0; angle < Math.PI * 2; angle += 0.25) {
    const { battle } = start({ ships: 0, pace: 'fast' });
    battle.x = Math.cos(angle) * 950;
    battle.z = Math.sin(angle) * 950;
    battle.heading = Math.atan2(-battle.x, battle.z);
    for (let i = 0; i < 60 / STEP; i += 1) {
      battle.update(STEP, straightAtTheMiddle(battle));
      assert.ok(chart.room(battle.x, battle.z) > LEAST_ROOM, `room ${chart.room(battle.x, battle.z)} at ${battle.x}, ${battle.z}`);
      assert.ok(heightAt(battle.x, battle.z) < 0);
    }
  }
});

test('held full over in either direction, it goes round and round without ever hitting anything', () => {
  const chart = getChart();
  for (const steer of [1, -1]) {
    const { battle } = start({ ships: 0, pace: 'fast' });
    battle.x = -450;
    battle.z = 330;
    for (let i = 0; i < 90 / STEP; i += 1) {
      battle.update(STEP, { ...OPEN, steer });
      assert.ok(chart.room(battle.x, battle.z) > LEAST_ROOM);
    }
  }
});

test('near the coast it\'s steered along it rather than stopping, so it gets somewhere', () => {
  const { battle } = start({ ships: 0 });
  const startAt = { x: battle.x, z: battle.z };
  let furthest = 0;
  for (let i = 0; i < 60 / STEP; i += 1) {
    battle.update(STEP, straightAtTheMiddle(battle));
    furthest = Math.max(furthest, Math.hypot(battle.x - startAt.x, battle.z - startAt.z));
  }
  assert.ok(furthest > 500, `only got ${furthest} away`);
  assert.ok(battle.speed > PACES.slow.speed * 0.8, 'it kept its speed');
});

test('the ship can\'t leave the world: it\'s turned back before the edge', () => {
  for (let angle = 0; angle < Math.PI * 2; angle += 0.4) {
    const { battle, types } = start({ ships: 0, pace: 'fast' });
    battle.x = Math.cos(angle) * 900;
    battle.z = Math.sin(angle) * 900;
    // Straight out to sea, with the wheel fighting to keep it going that way.
    battle.heading = Math.atan2(battle.x, -battle.z);
    let most = 0;
    for (let i = 0; i < 40 / STEP; i += 1) {
      const wanted = Math.atan2(battle.x, -battle.z);
      const off = Math.atan2(Math.sin(wanted - battle.heading), Math.cos(wanted - battle.heading));
      battle.update(STEP, { ...OPEN, steer: Math.max(-1, Math.min(1, off * 3)) });
      most = Math.max(most, Math.hypot(battle.x, battle.z));
    }
    assert.ok(most <= WORLD.limit + 0.001, `${most}`);
    assert.ok(types().includes('limit'));
  }
});

test('the pirates and their lifeboats stay on the water too', () => {
  const chart = getChart();
  const { battle } = start({ ships: 9, pace: 'fast', level: 'tough' });
  battle.x = 200;
  battle.z = 600;
  for (let i = 0; i < 120 / STEP; i += 1) {
    battle.update(STEP, { ...OPEN, steer: Math.sin(i / 200) });
    for (const ship of [...battle.afloat, ...battle.boats]) {
      // Squeezed between the child's ship and the shore it can get close, but it's still in deep water.
      assert.ok(chart.room(ship.x, ship.z) > 5, `room ${chart.room(ship.x, ship.z)}`);
      assert.ok(heightAt(ship.x, ship.z) < -3);
      assert.ok(Math.hypot(ship.x, ship.z) <= WORLD.limit + 0.001);
    }
    if (battle.state !== 'sailing') break;
  }
});

test('nobody sails into the place the child watches from', () => {
  const { battle } = start({ ships: 3 });
  const [pirate] = battle.afloat;
  const forward = forwardOf(battle.heading);
  for (let i = 0; i < 300; i += 1) {
    pirate.x = battle.x - forward.x * 72;
    pirate.z = battle.z - forward.z * 72;
    battle.update(STEP, OPEN);
    const mine = forwardOf(battle.heading);
    assert.ok(Math.hypot(pirate.x - (battle.x - mine.x * 72), pirate.z - (battle.z - mine.z * 72)) > 30);
  }
});

test('nothing ever sits on top of anything else: ships slide apart', () => {
  const { battle } = start({ pace: 'slow' });
  for (let i = 0; i < 90 / STEP; i += 1) {
    battle.update(STEP, CLOSED);
    for (const pirate of battle.afloat) assert.ok(Math.hypot(pirate.x - battle.x, pirate.z - battle.z) > 30);
  }
});

/* ---------- from start to finish ---------- */

const nearestOf = (battle) => battle.afloat.slice().sort((a, b) => Math.hypot(a.x - battle.x, a.z - battle.z) - Math.hypot(b.x - battle.x, b.z - battle.z))[0];
const wheelFor = (battle, wanted) => {
  const off = Math.atan2(Math.sin(wanted - battle.heading), Math.cos(wanted - battle.heading));
  return { ...OPEN, steer: Math.max(-1, Math.min(1, off * 2)) };
};

/** A child steering straight for the nearest pirate, as anyone might at first. */
const sailAtThem = (battle) => {
  const nearest = nearestOf(battle);
  if (!nearest) return OPEN;
  return wheelFor(battle, Math.atan2(nearest.x - battle.x, -(nearest.z - battle.z)));
};

/** A child who has got the idea: straight for the nearest until it's near, then alongside it. */
const sailBeside = (battle) => {
  const nearest = nearestOf(battle);
  if (!nearest) return OPEN;
  const to = Math.atan2(nearest.x - battle.x, -(nearest.z - battle.z));
  if (Math.hypot(nearest.x - battle.x, nearest.z - battle.z) > battle.level.zone.reach * 0.8) return wheelFor(battle, to);
  const off = Math.atan2(Math.sin(to - battle.heading), Math.cos(to - battle.heading));
  return wheelFor(battle, to - (off >= 0 ? 1 : -1) * (Math.PI / 2));
};

for (const ships of [4, 6, 9]) {
  for (const [pace, level, steering, most] of [['slow', 'gentle', sailAtThem, 170], ['medium', 'medium', sailAtThem, 300], ['fast', 'tough', sailBeside, 480]]) {
    test(`${ships} ships at ${pace} speed on ${level}: the whole game can be finished, steering as a child might`, () => {
      const { battle, types } = start({ ships, pace, level, random: seeded(ships * 13) });
      let seconds = 0;
      while (battle.state === 'sailing' && seconds < 900) {
        battle.update(STEP, steering(battle));
        // Hearts might run out on the harder settings. That's for another test.
        if (battle.state === 'sailing') battle.hearts = Math.max(battle.hearts, 2);
        seconds += STEP;
      }
      assert.equal(battle.state, 'won');
      assert.equal(battle.beaten, ships);
      assert.equal(battle.left, 0);
      assert.equal(types().filter((type) => type === 'beaten').length, ships);
      assert.ok(types().includes('won'));
      assert.ok(seconds < ships * (most / 6), `took ${Math.round(seconds)} seconds`);
    });
  }
}

test('with the child going round and round, a pirate that hasn\'t been hit slows down to be caught', () => {
  const { battle } = start({ ships: 1, level: 'tough' });
  const [pirate] = battle.afloat;
  run(battle, 2, { ...OPEN, steer: 1 });
  pirate.sinceHit = 17;
  const direction = battle.heading - 2.8;
  pirate.x = battle.x + Math.sin(direction) * 150;
  pirate.z = battle.z - Math.cos(direction) * 150;
  pirate.mode = 'side';
  pirate.modeLeft = 8;
  for (let i = 0; i < 3 / STEP; i += 1) {
    pirate.sinceHit = 17;
    battle.update(STEP, { ...OPEN, steer: 1 });
  }
  assert.ok(pirate.speed < battle.pace.speed * 0.6, `${pirate.speed}`);
});

test('a child who does nothing but hold their hand open still gets there, as the pirates come to them', () => {
  const { battle } = start({ ships: 4 });
  let seconds = 0;
  while (battle.state === 'sailing' && seconds < 300) {
    battle.update(STEP, OPEN);
    seconds += STEP;
  }
  assert.equal(battle.state, 'won');
});

test('every crew gets away in a lifeboat, and a beaten ship slowly sinks with its sails down', () => {
  const { battle, events } = start({ ships: 3 });
  const [pirate] = battle.afloat;
  while (pirate.state === 'sailing') battle.hit(pirate, pirate);
  assert.equal(pirate.state, 'sinking');
  const { boat } = events.find(({ type }) => type === 'beaten');
  assert.ok(boat);
  assert.equal(battle.boats.length, 1);
  const { x, z } = boat;
  run(battle, 2, CLOSED);
  assert.ok(pirate.sails < 0.1, 'sails down');
  assert.ok(pirate.sink > 0.2 && pirate.sink < 0.5, `slowly: ${pirate.sink}`);
  assert.ok(Math.hypot(boat.x - x, boat.z - z) > 5, 'rowing');
  run(battle, 6, CLOSED);
  assert.ok(!battle.pirates.includes(pirate), 'gone');
  assert.equal(battle.boats.length, 1, 'still rowing after the ship has gone');
  run(battle, 8, CLOSED);
  assert.equal(battle.boats.length, 0);
  assert.equal(battle.stats.crewsAway, 1);
});

test('a beaten ship leaves gold on the water, and sailing through it picks it up', () => {
  const chart = getChart();
  const { battle, types } = start({ ships: 3 });
  const [pirate] = battle.afloat;
  pirate.x = battle.x + 100;
  pirate.z = battle.z;
  while (pirate.state === 'sailing') battle.hit(pirate, pirate);
  assert.ok(battle.coins.length >= 4);
  for (const { x, z } of battle.coins) assert.ok(chart.room(x, z) > 5);
  // The line leads towards the child's ship.
  const [first, second] = battle.coins;
  assert.ok(Math.hypot(second.x - battle.x, second.z - battle.z) < Math.hypot(first.x - battle.x, first.z - battle.z));
  const coins = battle.coins.length;
  // On top of the nearest, and it's gone, and counted.
  battle.x = second.x;
  battle.z = second.z;
  battle.update(STEP, CLOSED);
  assert.ok(battle.stats.gold >= 1);
  assert.ok(battle.coins.length < coins);
  assert.ok(types().includes('gold'));
});

test('gold that isn\'t picked up goes in the end, and that costs nothing', () => {
  const { battle } = start({ ships: 3 });
  const [pirate] = battle.afloat;
  pirate.x = battle.x + 300;
  pirate.z = battle.z;
  while (pirate.state === 'sailing') battle.hit(pirate, pirate);
  battle.x -= 200;
  const { hearts } = battle;
  run(battle, 30, CLOSED);
  assert.equal(battle.coins.length, 0);
  assert.equal(battle.hearts, hearts);
});

test('winning takes a moment, so that the last ship can be seen going down', () => {
  const { battle, types } = start({ ships: 1 });
  const [pirate] = battle.afloat;
  while (pirate.state === 'sailing') battle.hit(pirate, pirate);
  assert.equal(battle.state, 'sailing');
  assert.equal(battle.left, 0);
  run(battle, 3, OPEN);
  assert.equal(battle.state, 'won');
  assert.ok(types().includes('won'));
  // It all carries on quietly, with a lap of honour under full sail whatever the hand is doing.
  const { x, z } = battle;
  run(battle, 3, GONE);
  assert.ok(Math.hypot(battle.x - x, battle.z - z) > 1);
  assert.ok(battle.sails > 0.8);
  assert.equal(battle.canFire, false);
});

test('the numbers for the finish: ships beaten, seconds open and times it opened', () => {
  const { battle } = start();
  run(battle, 2, OPEN);
  run(battle, 1, CLOSED);
  run(battle, 3, OPEN);
  run(battle, 1, GONE);
  run(battle, 1, OPEN);
  assert.ok(Math.abs(battle.stats.openSeconds - 6) < 0.1);
  assert.equal(battle.stats.openings, 3);
  assert.ok(Math.abs(battle.stats.seconds - 8) < 0.1);
});

/* ---------- what's said ---------- */

const FOLDER = new URL('../../games/cannon-bay/audio/voice/', import.meta.url);
const MOST_WORDS = 11;

test('it keeps its talking short, and everything it says has a voice in both languages', () => {
  const lines = JSON.parse(readFileSync(new URL('lines.json', FOLDER)));
  const source = readFileSync(new URL('../../games/cannon-bay/main.js', import.meta.url), 'utf8');
  for (const { id, text, ka } of lines) {
    assert.ok(text.split(/\s+/).length <= MOST_WORDS, `too long: ${text}`);
    assert.match(ka, /[Ⴀ-ჿ]/, id);
    for (const language of ['en', 'ka']) assert.ok(existsSync(new URL(`${language}/${id}.ogg`, FOLDER)), `${language}/${id}`);
    assert.ok(source.includes(text), `nothing says: ${text}`);
  }
  assert.ok(lines.length <= 20, `${lines.length} lines`);
});

test('every captain\'s line is in that character\'s own voice', () => {
  const lines = JSON.parse(readFileSync(new URL('lines.json', FOLDER)));
  const shared = JSON.parse(readFileSync(new URL('../../core/body/voice/lines.json', import.meta.url)));
  const voiceOf = Object.fromEntries(shared.filter(({ id }) => id.startsWith('shout-')).map((line) => [line.id.slice('shout-'.length), line]));
  const said = lines.filter(({ id }) => id.startsWith('captain-') || id.startsWith('joze-'));
  assert.ok(said.length >= 10);
  for (const { id, voice, kaVoice, kaPitch } of said) {
    const who = id.split('-')[id.startsWith('captain-') ? 1 : 0];
    assert.equal(voice, voiceOf[who].voice, id);
    assert.equal(kaVoice, voiceOf[who].kaVoice, id);
    assert.equal(kaPitch, voiceOf[who].kaPitch, id);
  }
});

test('the game has no method called then, which await would take for a promise', () => {
  assert.equal(new Battle().then, undefined);
  const source = readFileSync(new URL('../../games/cannon-bay/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s+then\s*\(/m);
});

/* ---------- levels ---------- */

const LEVEL_NUMBERS = Array.from({ length: 10 }, (_, index) => index + 1);
// Which way is harder for each thing a level changes: up, down, or switched on.
const NEW_THINGS = ['gems', 'triple', 'sailors', 'hearts', 'rafts', 'shield', 'bubble', 'keys', 'magnet', 'smoke', 'mist', 'subs', 'bounce', 'snow', 'king', 'sunset'];
const HARDER = { fireEvery: 'down', apart: 'down', chase: 'up', side: 'down', runEvery: 'down', weave: 'on', sloops: 'on', atOnce: 'up', balls: 'up', flagship: 'on', ...Object.fromEntries(NEW_THINGS.map((key) => [key, 'on'])) };

test('level 1 is the game as it always was', () => {
  const plan = levelPlan(1);
  // levelPlan(1) as it was before the levels brought anything new.
  const before = { fireEvery: 1, apart: 1, chase: 1, side: 1, runEvery: 0.33, weave: false, sloops: false, atOnce: 0, balls: 0, flagship: false };
  for (const [key, value] of Object.entries(before)) assert.equal(plan[key], value, key);
  for (const key of NEW_THINGS) assert.equal(plan[key], false, key);
  for (const key of ['fireEvery', 'apart', 'chase', 'side']) assert.equal(plan[key], 1, key);
  assert.equal(plan.runEvery, 0.33);
  assert.deepEqual([plan.weave, plan.sloops, plan.atOnce, plan.balls, plan.flagship], [false, false, 0, 0, false]);
  // Plain ships only, which drop only their line of gold, and the cannons fire as they always did.
  const { battle, types } = start({ ships: 9, levelNumber: 1 });
  assert.ok(battle.roles.every(({ kind, cage, key }) => kind === 'ship' && !cage && !key));
  assert.deepEqual(battle.bonuses, []);
  const [pirate] = battle.afloat;
  while (pirate.state === 'sailing') battle.hit(pirate, pirate);
  assert.ok(battle.coins.length > 0);
  assert.deepEqual(battle.prizes, []);
  assert.equal(battle.fireKind, 'ball');
  assert.ok(!types().includes('drop'));
  for (const level of Object.keys(LEVELS)) {
    const { battle } = start({ level, ships: 9, levelNumber: 1 });
    assert.equal(battle.level, LEVELS[level]);
    assert.equal(battle.mostAtOnce, MOST_AT_ONCE);
    assert.equal(battle.afloat.length, MOST_AT_ONCE);
    for (const pirate of battle.afloat) {
      assert.equal(pirate.kind, 'ship');
      assert.equal(pirate.hitsLeft, LEVELS[level].shipHits);
    }
  }
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
  for (const key of ['weave', 'sloops', 'atOnce', 'balls', 'flagship']) assert.ok(LEVEL_NUMBERS.find((level) => Number(levelPlan(level)[key]) > 0) >= 3, key);
});

test('each level from 2 brings something new, listed for the cards, and nothing at level 1', () => {
  assert.deepEqual(newsAt(1), []);
  for (const level of LEVEL_NUMBERS.slice(1)) {
    const news = newsAt(level);
    assert.ok(news.length >= 1 && news.length <= 2, `level ${level}: ${news.length}`);
    for (const item of news) {
      assert.match(item.mark, /\p{Extended_Pictographic}/u, item.name);
      assert.ok(item.name.split(' ').length <= 3, item.name);
      assert.match(item.nameKa, /[\u10D0-\u10FF]/, item.name);
      // Really switched on from that level, and not before.
      assert.ok(Number(levelPlan(level)[item.key]) > 0, `${item.key} at ${level}`);
      assert.ok(!(Number(levelPlan(level - 1)[item.key]) > 0), `${item.key} before ${level}`);
    }
  }
  // Every new thing in levelPlan is on the cards somewhere.
  for (const key of NEW_THINGS) assert.ok(NEWS.some((item) => item.key === key), key);
});

test('each new kind of ship comes along in its level, even in a battle of only four, and straight away', () => {
  for (const [level, kind] of [[4, 'raft'], [5, 'sloop'], [7, 'smoky'], [8, 'sub'], [9, 'flagship'], [10, 'king']]) {
    for (const ships of [4, 6, 9]) {
      const { battle } = start({ ships, levelNumber: level });
      const kinds = battle.roles.map((role) => role.kind);
      assert.ok(kinds.includes(kind), `${kind} at level ${level} with ${ships}`);
      // The newest is the first one out, unless it's the last, as a flagship or the king is.
      if (!['flagship', 'king'].includes(kind)) assert.equal(battle.afloat[0].kind, kind);
      else assert.equal(kinds.at(-1), kind);
    }
  }
  // A sailor to rescue from level 3, and a key from level 6, in any battle.
  for (const ships of [4, 6, 9]) {
    for (const level of [3, 6, 10]) {
      const { battle } = start({ ships, levelNumber: level });
      assert.ok(battle.roles.some(({ cage }) => cage), `cage at ${level} with ${ships}`);
      assert.equal(battle.roles.some(({ key }) => key), level >= 6, `key at ${level} with ${ships}`);
      assert.ok(!battle.roles.at(-1).cage, 'not on the last');
    }
  }
});

test('a level never changes what a grown-up chose: the zones, the help with lining up, Gentle, the cannons or how many ships', () => {
  for (const level of LEVEL_NUMBERS) {
    const { battle } = start({ levelNumber: level, ships: 4, cannons: 'always' });
    assert.equal(battle.level, LEVELS.gentle);
    assert.equal(battle.cannons, 'always');
    assert.equal(battle.total, 4);
    assert.equal(battle.hearts, HEARTS);
  }
  const { battle, types } = start({ levelNumber: 10 });
  for (let i = 0; i < HEARTS * 3; i += 1) {
    ballOnHull(battle);
    battle.update(STEP, OPEN);
  }
  assert.equal(battle.hearts, 1);
  assert.ok(!types().includes('lost'), 'Gentle still can\'t be lost');
});

/**
 * A child who has got the idea, sailing beside the nearest pirate, as in sailBeside, and closing the hand
 * for a moment now and then. Counts the movements: how far the hand goes from side to side, in full
 * turns of the wheel, and each close and open.
 */
function battleLikeAChild(battle) {
  let seconds = 0;
  let steer = 0;
  let travel = 0;
  while (battle.state === 'sailing' && seconds < 900) {
    const input = sailBeside(battle);
    // A hand moves only so fast.
    const next = steer + Math.max(-STEP * 2.5, Math.min(STEP * 2.5, input.steer - steer));
    travel += Math.abs(next - steer);
    steer = next;
    battle.update(STEP, { ...input, steer });
    seconds += STEP;
  }
  return { seconds, perMinute: (travel / 2 / seconds) * 60, won: battle.state === 'won' };
}

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

test('level 10 asks no more than twice the movements a minute of level 1, and lasts no more than a third longer', () => {
  // On Gentle, so that every game gets to the end and they can be compared.
  for (const [pace, ships] of [['slow', 4], ['medium', 6], ['fast', 9]]) {
    const play = (levelNumber) => [3, 7, 11, 19].map((seed) => battleLikeAChild(start({ pace, ships, levelNumber, random: seeded(seed) }).battle));
    const first = play(1);
    const last = play(10);
    for (const game of [...first, ...last]) assert.ok(game.won, `${pace}: not finished`);
    const longer = average(last.map(({ seconds }) => seconds)) / average(first.map(({ seconds }) => seconds));
    const busier = average(last.map(({ perMinute }) => perMinute)) / average(first.map(({ perMinute }) => perMinute));
    console.log(`cannon bay ${pace}: level 10 is ${longer.toFixed(2)} times as long, with ${busier.toFixed(2)} times the movements a minute`);
    assert.ok(longer <= 1.34, `${pace}: ${longer.toFixed(2)} times as long`);
    assert.ok(busier <= 2, `${pace}: ${busier.toFixed(2)} times the movements`);
  }
});

test('at level 10 there\'s still at least 70% of the time to react: balls fly as slowly, and pirates stay alongside long enough', () => {
  assert.ok(levelPlan(10).side >= 0.7);
  const { battle, events } = start({ levelNumber: 10 });
  run(battle, 60, () => ({ ...OPEN, drive: 0.8 }));
  const balls = events.filter(({ type }) => type === 'pirate-fire');
  assert.ok(balls.length > 0);
  for (const { ball } of balls) assert.ok(ball.seconds >= 2, 'slow');
});

for (const pace of Object.keys(PACES)) {
  for (const level of Object.keys(LEVELS)) {
    test(`level 10 at ${pace} speed on ${level} can be finished, steering as a child might`, () => {
      const { battle, types } = start({ ships: 9, pace, level, levelNumber: 10, random: seeded(17) });
      let seconds = 0;
      while (battle.state === 'sailing' && seconds < 900) {
        battle.update(STEP, sailBeside(battle));
        if (battle.state === 'sailing') battle.hearts = Math.max(battle.hearts, 2);
        seconds += STEP;
      }
      assert.equal(battle.state, 'won');
      assert.equal(types().filter((type) => type === 'beaten').length, 9);
      assert.equal(battle.left, 0);
    });
  }
}

test('at level 10 the new things really happen, in a whole battle played as a child might', () => {
  const { battle, events, types } = start({ ships: 9, levelNumber: 10, random: seeded(4) });
  assert.equal(battle.afloat.length, MOST_AT_ONCE + 1);
  const spawned = () => events.filter(({ type }) => type === 'spawn').map(({ pirate }) => pirate);
  let weaving = false;
  let most = 0;
  let seconds = 0;
  const fired = new Set();
  while (battle.state === 'sailing' && seconds < 900) {
    battle.update(STEP, sailBeside(battle));
    for (const pirate of battle.afloat) if (pirate.mode === 'away' && Math.abs(battle.weaving(pirate)) > 0.5) weaving = true;
    for (const pirate of battle.pirates) most = Math.max(most, pirate.burstLeft);
    fired.add(battle.fireKind);
    seconds += STEP;
  }
  const kinds = spawned().map(({ kind }) => kind);
  assert.equal(battle.state, 'won');
  assert.ok(weaving, 'weaving');
  for (const kind of ['sub', 'smoky', 'sloop', 'raft']) assert.ok(kinds.includes(kind), kind);
  assert.equal(kinds.at(-1), 'king');
  assert.ok(most >= LEVELS.gentle.balls + 1, 'bigger broadsides');
  const king = spawned().at(-1);
  assert.equal(king.maxHits, Math.round(LEVELS.gentle.shipHits * SHIP_KINDS.king.hits));
  for (const type of ['split', 'little-beaten', 'smoke', 'dive', 'surface', 'sail-down', 'drop', 'prize', 'power']) assert.ok(types().includes(type), type);
  const { stats } = battle;
  console.log('level 10 battle', JSON.stringify({ seconds: Math.round(seconds), gems: stats.gems, sailors: stats.sailors, keys: stats.keys, chests: stats.chests, powers: stats.powers, hearts: stats.hearts, fired: [...fired] }));
  assert.ok(stats.gems >= 9, 'gems picked up');
  assert.ok(stats.sailors >= 1, 'a sailor rescued');
  assert.ok(stats.powers >= 3, 'power-ups');
  assert.ok(fired.size >= 3, 'other kinds of fire');
});

test('at level 10, resting still stops the firing, and the pirates sail in circles', () => {
  const { battle, events } = start({ levelNumber: 10 });
  run(battle, 12, OPEN);
  run(battle, REST_AFTER + 0.5, CLOSED);
  assert.equal(battle.resting, true);
  const fired = events.filter(({ type }) => type === 'pirate-fire').length;
  const { hurts } = battle.stats;
  run(battle, 60, CLOSED);
  assert.equal(events.filter(({ type }) => type === 'pirate-fire').length, fired);
  assert.equal(battle.stats.hurts, hurts);
  assert.ok(battle.afloat.every(({ mode }) => mode === 'circle'));
});

/* ---------- what the higher levels bring: prizes, power-ups and new kinds of ship ---------- */

/** Beats the first pirate afloat right beside the child's ship, so whatever it drops is close. */
function beatBeside(battle, pirate = battle.afloat[0], away = 70) {
  pirate.x = battle.x + Math.cos(battle.heading) * away;
  pirate.z = battle.z + Math.sin(battle.heading) * away;
  while (pirate.state === 'sailing') battle.hit(pirate, pirate);
  return pirate;
}

/** A prize of this kind, right here. */
const prizeAt = (battle, kind, x, z, details = {}) => battle.addPrize(kind, x, z, details);

test('from level 2, a beaten ship drops gems, which float over to the ship, are picked up and counted', () => {
  const { battle, types } = start({ levelNumber: 2 });
  beatBeside(battle);
  const gems = battle.prizes.filter(({ kind }) => kind === 'gem');
  assert.equal(gems.length, 3);
  assert.ok(types().includes('drop'));
  // Just sitting there with the sails down, they come over by themselves.
  run(battle, 8, CLOSED);
  assert.equal(battle.stats.gems, 3);
  assert.ok(types().includes('prize'));
  assert.equal(battle.prizes.filter(({ kind }) => kind === 'gem').length, 0);
});

test('a prize too far away to come over goes in the end, and that costs nothing; resting keeps it', () => {
  const { battle } = start({ levelNumber: 2 });
  const gem = prizeAt(battle, 'gem', battle.x + 400, battle.z);
  run(battle, REST_AFTER + 1, CLOSED);
  assert.equal(battle.resting, true);
  const left = gem.left;
  run(battle, 20, CLOSED);
  assert.equal(gem.left, left, 'resting keeps it');
  // Short closes aren't a rest, so the time goes, and the ship stays put.
  for (let i = 0; i < 12; i += 1) {
    run(battle, REST_AFTER - 0.5, CLOSED);
    battle.update(STEP, { ...CLOSED, open: true, drive: 0 });
  }
  assert.ok(!battle.prizes.includes(gem));
  assert.ok(!gem.taken);
  assert.equal(battle.stats.gems, 0);
});

test('the newest power-up of the level is the first one dropped, and then they take turns', () => {
  for (const [level, first] of [[2, 'triple'], [4, 'shield'], [5, 'bubble'], [6, 'magnet'], [8, 'bounce'], [9, 'snow']]) {
    const { battle } = start({ levelNumber: level });
    beatBeside(battle);
    const power = battle.prizes.find(({ kind }) => kind === 'power');
    assert.equal(power?.power, first, `level ${level}`);
  }
  const { battle } = start({ levelNumber: 3, ships: 9 });
  const dropped = [];
  for (let i = 0; i < 4; i += 1) {
    battle.prizes = [];
    beatBeside(battle);
    battle.fill();
    const bonus = battle.prizes.find(({ kind }) => kind === 'power' || kind === 'heart');
    dropped.push(bonus.power ?? bonus.kind);
  }
  assert.deepEqual(dropped, ['heart', 'triple', 'heart', 'triple']);
});

/** Picks up a power-up of this kind, as sailing over it would. */
function powerUp(battle, power) {
  prizeAt(battle, 'power', battle.x, battle.z, { power });
  battle.update(STEP, OPEN);
  assert.equal(battle.power?.kind, power);
}

test('a power-up lasts a few seconds, shows how long is left, waits while the child rests, and is counted', () => {
  const { battle, types } = start({ levelNumber: 10 });
  powerUp(battle, 'triple');
  assert.equal(battle.stats.powers, 1);
  assert.equal(battle.fireKind, 'triple');
  run(battle, 4, OPEN);
  assert.ok(battle.power.left < battle.power.total && battle.power.left > 0);
  run(battle, REST_AFTER + 0.5, CLOSED);
  const left = battle.power.left;
  run(battle, 10, CLOSED);
  assert.equal(battle.power.left, left, 'resting keeps it');
  // Anything else dropped meanwhile is cleared away, so this is about the one.
  run(battle, POWERS.triple.seconds, () => {
    battle.prizes = [];
    for (const pirate of battle.afloat) pirate.hitsLeft = pirate.maxHits;
    return OPEN;
  });
  assert.equal(battle.power, null);
  assert.equal(battle.fireKind, 'ball');
  assert.ok(types().includes('power-end'));
  // A new one takes over from one going.
  powerUp(battle, 'bubble');
  powerUp(battle, 'snow');
  assert.equal(battle.fireKind, 'snow');
});

test('the triple shot fires three balls at once, side by side, and all three hit', () => {
  const { battle } = start({ levelNumber: 2 });
  powerUp(battle, 'triple');
  const pirate = hold(battle, Math.PI / 2);
  const { hitsLeft } = pirate;
  holding(battle, 0.1, Math.PI / 2);
  assert.equal(battle.shots.length, 3);
  assert.ok(battle.shots.every(({ fire }) => fire === 'triple'));
  const alongs = battle.shots.map(({ along }) => along).sort((a, b) => a - b);
  assert.ok(alongs[2] - alongs[0] > 15, 'side by side');
  holding(battle, 1.4, Math.PI / 2);
  assert.ok(hitsLeft - pirate.hitsLeft >= 3);
});

test('the bubble shot traps a ship in a bubble for a moment: it stops, and can\'t fire', () => {
  const { battle, types } = start({ levelNumber: 5 });
  powerUp(battle, 'bubble');
  const pirate = hold(battle, Math.PI / 2);
  holding(battle, 1.5, Math.PI / 2);
  assert.ok(pirate.bubbled > 0);
  assert.ok(types().includes('bubbled'));
  battle.power = null;
  // Let go of it, and it bobs where it is.
  pirate.fireIn = 0;
  battle.broadsideIn = 0;
  const fired = types().filter((type) => type === 'pirate-fire').length;
  run(battle, 1.2, CLOSED);
  assert.ok(pirate.speed < 3, `${pirate.speed}`);
  assert.equal(types().filter((type) => type === 'pirate-fire').length, fired);
  run(battle, 3, CLOSED);
  assert.equal(pirate.bubbled, 0);
  assert.ok(types().includes('unbubbled'));
});

test('the snow shot slows a ship down, and it reloads more slowly', () => {
  const { battle, types } = start({ levelNumber: 9 });
  powerUp(battle, 'snow');
  const pirate = hold(battle, Math.PI / 2);
  holding(battle, 1.5, Math.PI / 2);
  assert.ok(pirate.frosted > 0);
  assert.ok(types().includes('frosted'));
  assert.ok(battle.quicker(pirate) < battle.plan.chase * 0.6);
  pirate.frosted = 0;
  assert.ok(battle.quicker(pirate) >= battle.plan.chase * 0.99);
});

test('the bouncing ball goes on to the next ship near enough, once', () => {
  const { battle, types } = start({ levelNumber: 8 });
  powerUp(battle, 'bounce');
  const [first, second] = battle.afloat;
  const place = () => {
    hold(battle, Math.PI / 2);
    second.x = first.x + Math.sin(battle.heading) * 60;
    second.z = first.z - Math.cos(battle.heading) * 60;
    second.fireIn = 100;
  };
  const before = second.hitsLeft;
  for (let i = 0; i < 2 / STEP; i += 1) {
    place();
    battle.update(STEP, OPEN);
  }
  assert.ok(types().includes('bounce'));
  assert.ok(second.hitsLeft < before, 'the second one was hit too');
  // A bounced ball doesn't bounce again.
  const bounces = types().filter((type) => type === 'bounce').length;
  const fires = types().filter((type) => type === 'fire').length;
  assert.ok(bounces <= fires);
});

test('the shield bubble: a ball landing on the ship bounces off, and costs nothing', () => {
  const { battle, types } = start({ levelNumber: 4, level: 'tough' });
  powerUp(battle, 'shield');
  ballOnHull(battle);
  battle.update(STEP, OPEN);
  assert.equal(battle.hearts, HEARTS);
  assert.equal(battle.stats.blocked, 1);
  assert.ok(types().includes('blocked'));
  battle.power = null;
  ballOnHull(battle);
  battle.update(STEP, OPEN);
  assert.equal(battle.hearts, HEARTS - 1);
});

test('the magnet brings prizes and gold over from far away', () => {
  const { battle } = start({ levelNumber: 6 });
  const far = prizeAt(battle, 'gem', battle.x + 380, battle.z);
  run(battle, 3, CLOSED);
  assert.equal(battle.stats.gems, 0, 'too far without it');
  powerUp(battle, 'magnet');
  battle.coins.push({ x: battle.x - 300, z: battle.z, left: 26, phase: 0 });
  run(battle, 8, CLOSED);
  assert.equal(battle.stats.gems, 1);
  assert.ok(!battle.prizes.includes(far));
  assert.ok(battle.stats.gold >= 1);
});

test('a heart from level 3 adds a heart, up to two more than the usual five', () => {
  const { battle } = start({ levelNumber: 3 });
  for (let i = 0; i < 4; i += 1) {
    prizeAt(battle, 'heart', battle.x, battle.z);
    battle.update(STEP, OPEN);
  }
  assert.equal(battle.hearts, MOST_HEARTS);
  assert.equal(MOST_HEARTS, HEARTS + 2);
  assert.equal(battle.stats.hearts, 4);
});

test('from level 3 a pirate tows a sailor in a cage, who floats free when it\'s beaten, and is rescued by sailing over', () => {
  const { battle, types } = start({ levelNumber: 3, ships: 4 });
  battle.update(STEP, OPEN);
  const towing = battle.afloat.find(({ cage }) => cage) ?? (() => {
    while (!battle.afloat.some(({ cage }) => cage)) {
      beatBeside(battle);
      battle.fill();
    }
    return battle.afloat.find(({ cage }) => cage);
  })();
  beatBeside(battle, towing);
  const cage = battle.prizes.find(({ kind }) => kind === 'cage');
  assert.ok(cage);
  run(battle, 10, CLOSED);
  assert.equal(battle.stats.sailors, 1);
  assert.ok(types().includes('prize'));
});

test('from level 6 a pirate carries a key: picking it up brings a treasure chest, which opens for gems and a power-up', () => {
  const { battle } = start({ levelNumber: 6, ships: 6 });
  let carrier = battle.afloat.find(({ key }) => key);
  while (!carrier) {
    beatBeside(battle);
    battle.fill();
    carrier = battle.afloat.find(({ key }) => key);
  }
  battle.prizes = [];
  beatBeside(battle, carrier);
  assert.ok(battle.prizes.some(({ kind }) => kind === 'key'));
  // Without the magnet, which would bring the chest over too.
  battle.prizes = battle.prizes.filter(({ kind }) => kind !== 'power');
  run(battle, 8, CLOSED);
  assert.equal(battle.stats.keys, 1);
  const chest = battle.prizes.find(({ kind }) => kind === 'chest');
  assert.ok(chest, 'a chest');
  assert.ok(getChart().room(chest.x, chest.z) > 20, 'on open water');
  const away = Math.hypot(chest.x - battle.x, chest.z - battle.z);
  assert.ok(away > 90 && away < 170, `${away}`);
  // It doesn't go away by itself.
  run(battle, 40, CLOSED);
  assert.ok(battle.prizes.includes(chest));
  const { gems, powers } = battle.stats;
  battle.x = chest.x;
  battle.z = chest.z;
  battle.update(STEP, CLOSED);
  assert.equal(battle.stats.chests, 1);
  // It all comes straight over, and some may be picked up at once.
  run(battle, 5, CLOSED);
  assert.ok(battle.stats.gems - gems + battle.prizes.filter(({ kind }) => kind === 'gem').length >= 5);
  assert.equal(battle.stats.powers, powers + 1);
});

test('from level 4 a barrel raft comes apart into two little rafts, which never fire, and both have to be beaten too', () => {
  const { battle, types } = start({ levelNumber: 4, ships: 1 });
  const [raft] = battle.afloat;
  assert.equal(raft.kind, 'raft');
  assert.equal(battle.left, 1);
  beatBeside(battle, raft);
  assert.ok(types().includes('split'));
  const littles = battle.afloat.filter(({ little }) => little);
  assert.equal(littles.length, 2);
  assert.equal(battle.left, 2);
  assert.equal(battle.stats.beaten, 1);
  assert.ok(!types().includes('lifeboat'));
  assert.equal(battle.boats.length, 0, 'nobody was on it');
  // Alongside, loaded and ready, they still never fire. A closed hand doesn't fire at them either.
  for (let i = 0; i < 3 / STEP; i += 1) {
    littles.forEach((little, index) => {
      const direction = battle.heading + (index ? 1 : -1) * Math.PI / 2;
      little.x = battle.x + Math.sin(direction) * 90;
      little.z = battle.z - Math.cos(direction) * 90;
      little.heading = battle.heading;
      little.fireIn = 0;
    });
    battle.broadsideIn = 0;
    battle.update(STEP, CLOSED);
  }
  assert.ok(!types().includes('pirate-fire'), 'little ones never fire');
  assert.notEqual(battle.state, 'won');
  for (const little of littles) beatBeside(battle, little);
  assert.equal(battle.left, 0);
  assert.equal(battle.stats.littles, 2);
  run(battle, 3, OPEN);
  assert.equal(battle.state, 'won');
});

test('from level 7 a smoke ship hides in its own smoke when hit, twice, and can\'t be fired at for a moment', () => {
  const { battle, types } = start({ levelNumber: 7, ships: 4 });
  const smoky = battle.afloat.find(({ kind }) => kind === 'smoky');
  assert.ok(smoky);
  let smokes = 0;
  while (smoky.state === 'sailing' && smokes < 2) {
    battle.hit(smoky, smoky);
    if (smoky.smoke > 0) {
      smokes += 1;
      assert.equal(battle.canTarget(smoky), false);
      assert.ok(!battle.targets.includes(smoky));
      run(battle, 3.2, CLOSED);
      assert.equal(battle.canTarget(smoky), true);
    }
  }
  assert.equal(smokes, 2);
  assert.equal(types().filter((type) => type === 'smoke').length, 2);
});

test('from level 8 a submarine dives and comes up again beside the child, and can\'t be fired at under the water', () => {
  const { battle, types } = start({ levelNumber: 8, ships: 4 });
  const sub = battle.afloat.find(({ kind }) => kind === 'sub');
  assert.ok(sub);
  assert.equal(sub.under, false, 'it starts where it can be seen');
  let dived = false;
  for (let i = 0; i < 12 / STEP; i += 1) {
    battle.update(STEP, OPEN);
    if (sub.under) {
      dived = true;
      assert.equal(battle.canTarget(sub), false);
      assert.equal(sub.burstLeft, 0);
    }
  }
  assert.ok(dived);
  assert.ok(types().includes('dive'));
  run(battle, 6, OPEN);
  assert.ok(types().includes('surface'));
  // Resting brings it up, so it's all there when the child comes back.
  sub.under = true;
  sub.diveIn = 4;
  run(battle, REST_AFTER + 0.5, CLOSED);
  assert.equal(sub.under, false);
});

test('at level 10 the pirate king\'s sails come down one at a time as it\'s hit', () => {
  const { battle, events } = start({ levelNumber: 10, ships: 1 });
  const [king] = battle.afloat;
  assert.equal(king.kind, 'king');
  assert.equal(king.partsLeft, 4);
  const downs = [];
  while (king.state === 'sailing') {
    battle.hit(king, king);
    const last = events.at(-1);
    if (events.some((event) => event.type === 'sail-down' && !downs.includes(event))) downs.push(...events.filter((event) => event.type === 'sail-down' && !downs.includes(event)));
    void last;
  }
  assert.deepEqual(downs.map(({ partsLeft }) => partsLeft), [3, 2, 1, 0]);
});

test('nothing new makes Gentle losable, at any level: hearts still stop at one', () => {
  for (const level of LEVEL_NUMBERS) {
    const { battle, types } = start({ levelNumber: level, ships: 4 });
    for (let i = 0; i < 40; i += 1) {
      ballOnHull(battle);
      battle.update(STEP, OPEN);
    }
    assert.equal(battle.hearts, 1, `level ${level}`);
    assert.ok(!types().includes('lost'));
  }
});

test('at level 10, resting stops the new kinds of ship too: nobody hides or fires, and power-ups wait', () => {
  const { battle, events } = start({ levelNumber: 10, ships: 9, random: seeded(5) });
  run(battle, 8, OPEN);
  powerUp(battle, 'bounce');
  run(battle, REST_AFTER + 0.5, CLOSED);
  const left = battle.power.left;
  const fired = events.filter(({ type }) => type === 'pirate-fire').length;
  run(battle, 40, CLOSED);
  assert.equal(events.filter(({ type }) => type === 'pirate-fire').length, fired);
  assert.ok(battle.afloat.every(({ under }) => !under));
  assert.equal(battle.power.left, left);
});

/* ---------- the end of a battle, and what's still on its way ---------- */

/** Which way is to the right of the child's ship. */
const rightOfShip = (battle) => ({ x: Math.cos(battle.heading), z: Math.sin(battle.heading) });

/** Beats every pirate there is, one after another right beside the ship, and waits for the win. */
function winNow(battle) {
  for (let i = 0; i < 40 && battle.left > 0; i += 1) {
    battle.fill();
    if (battle.afloat[0]) beatBeside(battle, battle.afloat[0]);
  }
  while (battle.state === 'sailing') battle.update(STEP, CLOSED);
}

test('prizes still floating over when a battle is won keep coming and are counted, and nothing new starts', () => {
  const { battle, types } = start({ levelNumber: 6, ships: 4 });
  winNow(battle);
  assert.equal(battle.state, 'won');
  battle.prizes = [];
  battle.power = null;
  const right = rightOfShip(battle);
  const gem = prizeAt(battle, 'gem', battle.x + right.x * 60, battle.z + right.z * 60);
  prizeAt(battle, 'power', battle.x + right.x * 20, battle.z + right.z * 20, { power: 'triple' });
  prizeAt(battle, 'key', battle.x - right.x * 20, battle.z - right.z * 20);
  const before = { ...battle.stats };
  const at = { x: gem.x, z: gem.z };
  run(battle, 0.5, CLOSED);
  assert.ok(Math.hypot(gem.x - at.x, gem.z - at.z) > 5, 'it isn\'t frozen on the water');
  // The finish card comes up 2.2 seconds after the win.
  run(battle, 1.7, CLOSED);
  assert.equal(battle.stats.gems, before.gems + 1);
  assert.equal(battle.stats.powers, before.powers + 1);
  assert.equal(battle.stats.keys, before.keys + 1);
  assert.ok(types().filter((type) => type === 'prize').length >= 3);
  // Nothing new starts once it's over: no power-up, and no chest to sail to.
  assert.equal(battle.power, null);
  assert.ok(!battle.prizes.some(({ kind }) => kind === 'chest'));
});

test('when the finish card comes up, whatever\'s still on its way counts, everything else shrinks away, and the count stays put', () => {
  const { battle } = start({ levelNumber: 3, ships: 4 });
  winNow(battle);
  battle.prizes = [];
  const right = rightOfShip(battle);
  prizeAt(battle, 'gem', battle.x + right.x * 100, battle.z + right.z * 100);
  prizeAt(battle, 'cage', battle.x - right.x * 105, battle.z - right.z * 105);
  const far = prizeAt(battle, 'gem', battle.x + right.x * 500, battle.z + right.z * 500);
  const before = { ...battle.stats };
  battle.collectAll();
  assert.equal(battle.stats.gems, before.gems + 1, 'the one floating over');
  assert.equal(battle.stats.sailors, before.sailors + 1);
  assert.ok(battle.prizes.every(({ fading, left }) => fading && left <= 1.2), 'they all shrink away');
  const counted = { ...battle.stats };
  run(battle, 2, CLOSED);
  assert.equal(battle.prizes.length, 0);
  assert.ok(!far.taken);
  assert.deepEqual(battle.stats, counted, 'nothing changes after the tally');
});

test('once the last heart has gone, no heart comes back, though one picked up still counts', () => {
  const { battle } = start({ levelNumber: 3, level: 'tough' });
  battle.hearts = 1;
  ballOnHull(battle);
  battle.update(STEP, OPEN);
  assert.equal(battle.state, 'lost');
  prizeAt(battle, 'heart', battle.x, battle.z);
  run(battle, 0.5, OPEN);
  assert.equal(battle.hearts, 0);
  assert.equal(battle.stats.hearts, 1);
});

test('a shot still on its way when the battle ends just splashes down, and beats nobody', () => {
  const { battle, types } = start({ level: 'tough' });
  const pirate = holding(battle, 0.1, Math.PI / 2);
  assert.ok(battle.shots.length > 0);
  const { hitsLeft } = pirate;
  battle.hearts = 1;
  ballOnHull(battle);
  battle.update(STEP, CLOSED);
  assert.equal(battle.state, 'lost');
  run(battle, 2, CLOSED);
  assert.equal(pirate.hitsLeft, hitsLeft);
  assert.equal(battle.stats.beaten, 0);
  assert.ok(types().includes('splash'));
});

test('the key is never on the last pirate, or on one that hides, dives or comes apart, so its chest can be sailed to in time', () => {
  for (const level of LEVEL_NUMBERS.filter((at) => levelPlan(at).keys)) {
    for (const ships of [4, 6, 9]) {
      const { roles } = new Battle({ ships, levelNumber: level });
      const carriers = roles.flatMap(({ key }, index) => (key ? [index] : []));
      assert.equal(carriers.length, 1, `level ${level}, ${ships} ships`);
      assert.ok(carriers[0] < ships - 1, `level ${level}, ${ships} ships: the last`);
      assert.ok(['ship', 'sloop'].includes(roles[carriers[0]].kind), `level ${level}, ${ships} ships: a ${roles[carriers[0]].kind}`);
    }
  }
  // Played through by a child who sails over to the chest once it's up, it's nearly always reached.
  const chestFirst = (battle) => {
    const chest = battle.prizes.find(({ kind }) => kind === 'chest');
    return chest ? wheelFor(battle, Math.atan2(chest.x - battle.x, -(chest.z - battle.z))) : sailBeside(battle);
  };
  for (const level of [6, 7]) {
    let opened = 0;
    for (let seed = 1; seed <= 8; seed += 1) {
      const { battle } = start({ levelNumber: level, ships: 4, random: seeded(seed) });
      for (let seconds = 0; battle.state === 'sailing' && seconds < 600; seconds += STEP) {
        battle.update(STEP, chestFirst(battle));
        if (battle.state === 'sailing') battle.hearts = Math.max(battle.hearts, 2);
      }
      opened += battle.stats.chests;
    }
    assert.ok(opened >= 7, `level ${level}: ${opened} of 8`);
  }
});

test('a treasure chest always comes up in water the ship can sail to, well inside the edge of the world', () => {
  const random = seeded(3);
  for (let i = 0; i < 400; i += 1) {
    const { battle } = start({ levelNumber: 6, random });
    // Anywhere on the water the ship can be, heading any way at all.
    do {
      const angle = random() * Math.PI * 2;
      const out = Math.sqrt(random()) * WORLD.limit;
      battle.x = Math.sin(angle) * out;
      battle.z = Math.cos(angle) * out;
    } while (getChart().room(battle.x, battle.z) < 30);
    battle.heading = random() * Math.PI * 2;
    const chest = battle.showChest();
    assert.ok(Math.hypot(chest.x, chest.z) < WORLD.limit - 110, `${Math.round(Math.hypot(chest.x, chest.z))} from the middle`);
    assert.ok(getChart().room(chest.x, chest.z) >= 12, 'on open water');
  }
});

test('a snowball\'s frost and a bubble wait while the child rests, as the power-ups do', () => {
  const { battle } = start({ levelNumber: 9 });
  const pirate = hold(battle, Math.PI / 2, 300);
  run(battle, REST_AFTER + 0.5, CLOSED);
  assert.equal(battle.resting, true);
  pirate.frosted = 5;
  pirate.bubbled = 3;
  run(battle, 10, CLOSED);
  assert.equal(pirate.frosted, 5);
  assert.equal(pirate.bubbled, 3);
  run(battle, 1, OPEN);
  assert.ok(pirate.frosted < 5 && pirate.bubbled < 3);
});

test('a triple shot\'s three balls landing together make one thud, and a raft beaten has nobody heard rowing away', () => {
  const sound = new BaySound();
  const played = [];
  sound.play = (name) => played.push(name);
  for (let i = 0; i < 3; i += 1) sound.hit(40);
  assert.deepEqual(played, ['thud']);
  played.length = 0;
  sound.beaten(40, { rowing: false });
  assert.ok(played.length > 0 && !played.includes('row'));
  played.length = 0;
  sound.beaten(40);
  assert.ok(played.includes('row'));
  // The rules say who's rowing: a raft launches no lifeboat.
  const { battle, events } = start({ levelNumber: 4, ships: 2 });
  const raft = battle.afloat.find(({ kind }) => kind === 'raft');
  beatBeside(battle, raft);
  assert.equal(events.find(({ type, pirate }) => type === 'beaten' && pirate === raft).boat, null);
  const ship = battle.afloat.find(({ kind, little }) => kind === 'ship' && !little);
  beatBeside(battle, ship);
  assert.ok(events.find(({ type, pirate }) => type === 'beaten' && pirate === ship).boat);
});
