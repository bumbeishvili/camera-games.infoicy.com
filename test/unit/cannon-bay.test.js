// The rules of Cannon Bay. Its screen is tested in test/e2e/cannon-bay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Battle, HEARTS, HULL, LEVELS, MOST_AT_ONCE, PACES, REST_AFTER, SHIP_KINDS, forwardOf, levelPlan } from '../../games/cannon-bay/battle.js';
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
const HARDER = { fireEvery: 'down', apart: 'down', chase: 'up', side: 'down', runEvery: 'down', weave: 'on', sloops: 'on', atOnce: 'up', balls: 'up', flagship: 'on' };

test('level 1 is the game as it always was', () => {
  const plan = levelPlan(1);
  for (const key of ['fireEvery', 'apart', 'chase', 'side']) assert.equal(plan[key], 1, key);
  assert.equal(plan.runEvery, 0.33);
  assert.deepEqual([plan.weave, plan.sloops, plan.atOnce, plan.balls, plan.flagship], [false, false, 0, 0, false]);
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

for (const [pace, level] of [['slow', 'gentle'], ['medium', 'medium'], ['fast', 'tough']]) {
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
  });
}

test('at level 10 the new things really happen: weaving, sloops, four at once, bigger broadsides and a flagship last', () => {
  const { battle, events } = start({ ships: 9, levelNumber: 10, random: seeded(4) });
  assert.equal(battle.afloat.length, MOST_AT_ONCE + 1);
  const spawned = () => events.filter(({ type }) => type === 'spawn').map(({ pirate }) => pirate);
  const kinds = [...battle.afloat.map(({ kind }) => kind)];
  let weaving = false;
  let most = 0;
  let seconds = 0;
  while (battle.state === 'sailing' && seconds < 900) {
    battle.update(STEP, sailBeside(battle));
    for (const pirate of battle.afloat) if (pirate.mode === 'away' && Math.abs(battle.weaving(pirate)) > 0.5) weaving = true;
    for (const pirate of battle.pirates) most = Math.max(most, pirate.burstLeft);
    seconds += STEP;
  }
  kinds.push(...spawned().map(({ kind }) => kind));
  assert.equal(battle.state, 'won');
  assert.ok(weaving, 'weaving');
  assert.ok(kinds.includes('sloop'), 'sloops');
  assert.equal(kinds.at(-1), 'flagship');
  assert.ok(most >= LEVELS.gentle.balls + 1, 'bigger broadsides');
  const flagship = spawned().at(-1);
  assert.equal(flagship.maxHits, Math.round(LEVELS.gentle.shipHits * SHIP_KINDS.flagship.hits));
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
