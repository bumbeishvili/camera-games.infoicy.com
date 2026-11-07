// Sky Wings without a screen or a camera: reading arms as wings, and the rules of a dogfight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DEMOS } from '../../core/body/demos.js';
import { BodyReader, viewProblem } from '../../core/body/reader.js';
import { CAMERA, Flight, HEARTS, LEVELS, MOST_AT_ONCE, PACES, RANGE, forwardOf } from '../../games/sky-wings/flight.js';
import { PLACES, WORLD, coastAt, floorAt, heightAt } from '../../games/sky-wings/island-map.js';
import { Lesson } from '../../games/sky-wings/lesson.js';

const clips = JSON.parse(readFileSync(new URL('../fixtures/body-moves.json', import.meta.url)));
const toBody = ([, image, world]) => (image
  ? {
      image: image.map((p) => (p ? { x: p[0], y: p[1], z: 0, visibility: p[2] } : { x: 0, y: 0, z: 0, visibility: 0 })),
      world: world.map((p) => (p ? { x: p[0], y: p[1], z: p[2] } : { x: 0, y: 0, z: 0 })),
    }
  : null);

/** Plays the real tracker's numbers for arms as wings, up to a moment, and says how they read. */
function wingsAt(seconds, prepare = () => {}) {
  const reader = new BodyReader({ size: 'small' });
  reader.upperBodyOnly = true;
  prepare(reader);
  for (const frame of clips.wings.frames) {
    if (frame[0] > seconds) break;
    reader.update(toBody(frame), frame[0], clips.wings.aspect);
  }
  return reader.wings;
}

const seeded = (seed = 1) => {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

function flying(options = {}) {
  const events = [];
  const flight = new Flight({ planes: 6, random: seeded(), onEvent: (event) => events.push(event), ...options });
  flight.begin();
  return { flight, events };
}

const fly = (flight, seconds, controls = { out: true }) => {
  for (let t = 0; t < seconds; t += 1 / 30) flight.update(1 / 30, typeof controls === 'function' ? controls() : controls);
};
const named = (events, type) => events.filter((event) => event.type === type);
const turnBetween = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Puts another plane somewhere in front of the child's, and keeps it there. */
function holdInFront(flight, enemy, { ahead = 120, across = 0, up = 0 } = {}) {
  const { forward, view } = flight;
  const right = { x: -forward.z, z: forward.x };
  enemy.x = view.eye.x + forward.x * ahead + right.x * across;
  enemy.y = view.eye.y + forward.y * ahead + up;
  enemy.z = view.eye.z + forward.z * ahead + right.z * across;
  enemy.mode = 'cross';
  enemy.way = { x: enemy.x, y: enemy.y, z: enemy.z };
  enemy.modeLeft = 5;
  enemy.dodgeLeft = 0;
}

/** Everyone else out of the way, a long way behind. */
function clearTheRest(flight, keep) {
  for (const enemy of flight.enemies) {
    if (enemy === keep) continue;
    const { forward } = flight;
    enemy.x = flight.x - forward.x * 900;
    enemy.z = flight.z - forward.z * 900;
    enemy.way = { x: enemy.x, y: enemy.y, z: enemy.z };
    enemy.modeLeft = 5;
  }
}

/** Arms that steer straight for the nearest plane, as a child doing well would. */
const huntingWell = (flight) => () => {
  const nearest = flight.flying.slice().sort((a, b) => Math.hypot(a.x - flight.x, a.z - flight.z) - Math.hypot(b.x - flight.x, b.z - flight.z))[0];
  if (!nearest) return { out: true };
  const off = turnBetween(Math.atan2(nearest.x - flight.x, -(nearest.z - flight.z)), flight.heading);
  const elevation = Math.atan2(nearest.y - flight.y, Math.hypot(nearest.x - flight.x, nearest.z - flight.z));
  return { out: true, bank: Math.max(-1, Math.min(1, off * 2)), climb: Math.max(-1, Math.min(1, elevation * 2)) };
};

test('both arms out, level, are wings going straight on, in what the real tracker reports', () => {
  for (const seconds of [3.5, 4.5, 19.5]) {
    const { seen, out, bank, climb } = wingsAt(seconds);
    assert.equal(seen, true);
    assert.equal(out, true, `${seconds}`);
    assert.ok(Math.abs(bank) < 0.1, `${seconds}: bank ${bank}`);
    assert.equal(climb, 0, `${seconds}`);
  }
});

test('arms hanging down aren\'t wings', () => {
  assert.equal(wingsAt(1).out, false);
  assert.equal(wingsAt(23).out, false);
});

test('tipping to the right is a turn to the right, and to the left a turn to the left', () => {
  const right = wingsAt(7);
  assert.ok(right.out);
  assert.ok(right.bank > 0.5, `right: ${right.bank}`);
  const left = wingsAt(10.5);
  assert.ok(left.out);
  assert.ok(left.bank < -0.5, `left: ${left.bank}`);
});

test('both arms high is climbing, and both low is diving', () => {
  const high = wingsAt(14);
  assert.ok(high.out);
  assert.ok(high.climb > 0.5, `high: ${high.climb}`);
  const low = wingsAt(17);
  assert.ok(low.out);
  assert.ok(low.climb < -0.4, `low: ${low.climb}`);
});

test('arms held unevenly can be this child\'s level, so the plane doesn\'t fly in circles', () => {
  const uneven = wingsAt(7);
  const learned = wingsAt(7, (reader) => {
    reader.personal.tiltZero = uneven.tilt;
    reader.personal.heightZero = uneven.height;
  });
  assert.ok(Math.abs(learned.bank) < 0.05, `now ${learned.bank}`);
});

test('tipping as far as this child can is a full turn, whichever side', () => {
  const full = wingsAt(7, (reader) => {
    reader.personal.tiltRight = 0.2;
  });
  assert.equal(full.bank, 1);
  const otherWay = wingsAt(10.5, (reader) => {
    reader.personal.tiltRight = 0.2;
  });
  assert.ok(otherWay.bank > -1, 'the other side has its own measure');
});

test('flying can be done sitting down, but there has to be room for both arms', () => {
  const body = toBody(clips.wings.frames[100]);
  const { aspect } = clips.wings;
  assert.equal(viewProblem(body, aspect, { upperBodyOnly: true, armsOut: true }), null);
  const closeUp = {
    ...body,
    image: body.image.map((point) => ({ ...point, x: 0.5 + (point.x - 0.5) * 6, y: 0.5 + (point.y - 0.3) * 6 })),
  };
  assert.equal(viewProblem(closeUp, aspect, { upperBodyOnly: true, armsOut: true }), 'step-back');
});

/* ---------- the island ---------- */

test('the island is real land in the sea, with a volcano, and places flat enough to build on', () => {
  assert.ok(heightAt(0, 0) > 0, 'land in the middle');
  assert.ok(heightAt(0, 1000) < 0, 'sea further out');
  const volcano = Math.max(...[-30, -15, 15, 30].map((off) => heightAt(-150 + off * 1.8, -190 + off)));
  assert.ok(volcano > 110, `the volcano is ${volcano} high`);
  for (const [name, { x, z, height }] of Object.entries(PLACES)) assert.ok(Math.abs(heightAt(x, z) - height) < 0.01, name);
  for (let angle = 0; angle < 6.28; angle += 0.4) {
    const { x, z, far } = coastAt(angle);
    assert.ok(far > 300 && far < 800, `the coast is ${far} out at ${angle}`);
    assert.ok(heightAt(x, z) > 0);
  }
});

test('the island is the same every time', () => {
  assert.equal(heightAt(123.4, -56.7), heightAt(123.4, -56.7));
});

/* ---------- flying in all three directions ---------- */

test('tipping the arms banks the plane, and that turns it, whichever way', () => {
  const right = flying().flight;
  fly(right, 1.5, { out: true, bank: 1 });
  assert.ok(right.heading > 0.8, `heading ${right.heading}`);
  assert.ok(right.roll > 0.5, 'it leans into the turn');
  assert.ok(right.x > 10, 'and goes that way');
  const left = flying().flight;
  fly(left, 1.5, { out: true, bank: -1 });
  assert.ok(left.heading < -0.8);
  assert.ok(left.roll < -0.5);
  assert.ok(left.x < -10);
});

test('it isn\'t stuck on one level: raising the arms puts its nose up and it climbs, and lowering them dives', () => {
  const up = flying().flight;
  const fromUp = up.y;
  fly(up, 1.5, { out: true, climb: 1 });
  assert.ok(up.pitch > 0.4, `pitch ${up.pitch}`);
  assert.ok(up.y > fromUp + 15, 'it has really gone up');
  assert.ok(up.forward.y > 0.3, 'it\'s pointing up');
  const down = flying().flight;
  const fromDown = down.y;
  fly(down, 1, { out: true, climb: -1 });
  assert.ok(down.pitch < -0.3);
  assert.ok(down.y < fromDown - 6);
  fly(down, 3, { out: true, climb: 0 });
  assert.ok(Math.abs(down.pitch) < 0.2, 'arms level again is flying level');
});

test('it can turn and climb at once, going anywhere in the sky', () => {
  const { flight } = flying();
  const start = { x: flight.x, y: flight.y, z: flight.z };
  fly(flight, 3, { out: true, bank: 0.7, climb: 0.8 });
  assert.ok(Math.abs(flight.x - start.x) > 20);
  assert.ok(flight.y - start.y > 30);
  assert.ok(Math.abs(flight.z - start.z) > 20);
});

test('how steep and how far over it can go have limits, so nobody ends up upside down', () => {
  const { flight } = flying();
  let steepest = 0;
  let furthestOver = 0;
  fly(flight, 20, () => {
    steepest = Math.max(steepest, Math.abs(flight.pitch));
    furthestOver = Math.max(furthestOver, Math.abs(flight.roll));
    return { out: true, bank: 1, climb: 1 };
  });
  assert.ok(steepest < 0.9 && steepest > 0.3, `pitch ${steepest}`);
  assert.ok(furthestOver < 1.1, `roll ${furthestOver}`);
});

test('a little wobble in the arms doesn\'t steer', () => {
  const { flight } = flying({ planes: 1 });
  clearTheRest(flight);
  flight.enemies.length = 0;
  flight.waiting = 0;
  fly(flight, 2, { out: true, bank: 0.05 });
  assert.equal(flight.heading, 0);
});

test('the sky has a ceiling, and a plane can\'t go through it however long it climbs', () => {
  const { flight } = flying({ planes: 1 });
  flight.enemies.length = 0;
  flight.waiting = 0;
  fly(flight, 40, () => {
    assert.ok(flight.y <= WORLD.ceiling);
    return { out: true, climb: 1, bank: 0.4 };
  });
  assert.ok(flight.y > WORLD.ceiling - 60, `it got to ${flight.y}`);
});

test('nothing can fly into the ground or the sea, even the volcano, however long it dives', () => {
  for (const heading of [0, 0.5, 1, -0.7]) {
    const { flight } = flying({ planes: 1 });
    flight.enemies.length = 0;
    flight.waiting = 0;
    flight.heading = heading;
    fly(flight, 45, () => {
      assert.ok(flight.y >= floorAt(flight.x, flight.z) - 1e-6, `at ${flight.x}, ${flight.z}`);
      return { out: true, climb: -1 };
    });
  }
});

test('there\'s an outer edge, and a plane heading out is turned back towards the island', () => {
  const { flight } = flying({ planes: 1 });
  flight.enemies.length = 0;
  flight.waiting = 0;
  flight.heading = Math.PI; // Straight out to sea.
  let furthest = 0;
  let atLimit = 0;
  fly(flight, 60, () => {
    furthest = Math.max(furthest, Math.hypot(flight.x, flight.z));
    atLimit = Math.max(atLimit, flight.atLimit);
    return { out: true };
  });
  assert.ok(furthest <= WORLD.limit, `it got ${furthest} out`);
  assert.ok(atLimit > 0, 'it noticed');
  assert.ok(Math.hypot(flight.x, flight.z) < furthest, 'and it has come back');
});

/* ---------- the ring and the guns ---------- */

test('the camera is behind and above, looking the way the plane points', () => {
  const { flight } = flying();
  flight.pitch = 0.4;
  flight.heading = 1;
  const { eye, forward, up } = flight.view;
  const f = forwardOf(1, 0.4);
  assert.ok(Math.abs(forward.x - f.x) < 1e-9 && Math.abs(forward.y - f.y) < 1e-9);
  assert.ok(Math.abs(Math.hypot(forward.x, forward.y, forward.z) - 1) < 1e-9);
  assert.ok(Math.abs(forward.x * up.x + forward.y * up.y + forward.z * up.z) < 1e-9, 'up is square to it');
  const away = Math.hypot(eye.x - flight.x, eye.y - flight.y, eye.z - flight.z);
  assert.ok(Math.abs(away - Math.hypot(CAMERA.back, CAMERA.up)) < 1e-9);
});

test('a plane inside the ring gets fired at by itself, with nothing for the child to do', () => {
  const { flight, events } = flying();
  const [enemy] = flight.enemies;
  clearTheRest(flight, enemy);
  holdInFront(flight, enemy);
  flight.update(1 / 30, { out: true });
  assert.equal(flight.locked, enemy);
  assert.equal(flight.firing, true);
  assert.equal(named(events, 'firing').at(-1).on, true);
  fly(flight, 0.5, () => {
    holdInFront(flight, enemy);
    return { out: true };
  });
  assert.ok(flight.stats.shots >= 3);
  assert.ok(flight.stats.hits >= 1);
  assert.ok(enemy.hitsLeft < LEVELS.gentle.enemyHits);
});

test('a plane outside the ring, too far off, or behind, isn\'t fired at', () => {
  const { flight } = flying();
  const [enemy] = flight.enemies;
  clearTheRest(flight, enemy);
  const aim = LEVELS.gentle.aim;
  const check = (where, expected, message) => {
    holdInFront(flight, enemy, where);
    assert.equal(flight.findTarget() === enemy, expected, message);
  };
  check({ ahead: 120, across: Math.tan(aim) * 120 * 0.8 }, true, 'just inside');
  check({ ahead: 120, across: Math.tan(aim) * 120 * 1.2 }, false, 'just outside');
  check({ ahead: 120, up: Math.tan(aim) * 120 * 0.8 }, true, 'just inside, above');
  check({ ahead: 120, up: Math.tan(aim) * 120 * 1.2 }, false, 'just outside, above');
  check({ ahead: RANGE - 5 }, true, 'as far as it reaches');
  check({ ahead: RANGE + 20 }, false, 'too far');
  check({ ahead: -60 }, false, 'behind');
});

test('the ring gets smaller as it gets harder', () => {
  assert.ok(LEVELS.gentle.aim > LEVELS.medium.aim);
  assert.ok(LEVELS.medium.aim > LEVELS.tough.aim);
  assert.ok(LEVELS.gentle.enemyHits < LEVELS.tough.enemyHits);
});

test('the guns stop when the plane leaves the ring', () => {
  const { flight, events } = flying();
  const [enemy] = flight.enemies;
  clearTheRest(flight, enemy);
  holdInFront(flight, enemy);
  fly(flight, 0.2, { out: true });
  assert.equal(flight.firing, true);
  holdInFront(flight, enemy, { ahead: 120, across: 150 });
  flight.update(1 / 30, { out: true });
  assert.equal(flight.firing, false);
  assert.equal(named(events, 'firing').at(-1).on, false);
});

test('a plane being shot at tries to get away, so that it has to be chased', () => {
  const { flight } = flying();
  const [enemy] = flight.enemies;
  clearTheRest(flight, enemy);
  holdInFront(flight, enemy);
  const before = enemy.way;
  flight.hit(enemy);
  assert.notEqual(enemy.way, before);
  assert.ok(enemy.dodgeLeft > 0);
  enemy.mode = 'hunt';
  enemy.dodgeLeft = 0;
  flight.hit(enemy);
  assert.equal(enemy.mode, 'cross', 'and it stops hunting');
});

test('enough hits drop a plane: it falls away and goes, and the next one comes', () => {
  const { flight, events } = flying();
  const [enemy] = flight.enemies;
  const { index } = enemy;
  for (let i = 0; i < LEVELS.gentle.enemyHits; i += 1) flight.hit(enemy);
  assert.equal(enemy.state, 'falling');
  assert.equal(flight.dropped, 1);
  assert.equal(flight.left, 5);
  assert.equal(named(events, 'down').length, 1);
  flight.hit(enemy);
  assert.equal(flight.dropped, 1, 'it can only be dropped once');

  const height = enemy.y;
  fly(flight, 1.5, { out: true });
  assert.ok(enemy.y < height, 'falling');
  assert.equal(flight.flying.length, MOST_AT_ONCE, 'there\'s another one along straight away');
  assert.ok(flight.flying.every((plane) => plane.index !== index));
  fly(flight, 6, { out: true });
  assert.ok(!flight.enemies.includes(enemy), 'and it has gone');
});

test('there are never too many at once, and they all have to be dropped to win', () => {
  const { flight, events } = flying({ planes: 7 });
  assert.equal(flight.flying.length, MOST_AT_ONCE);
  assert.equal(flight.waiting, 4);
  let safety = 0;
  while (flight.state === 'flying' && safety < 2000) {
    safety += 1;
    for (const enemy of flight.flying) {
      for (let i = 0; i < LEVELS.gentle.enemyHits; i += 1) flight.hit(enemy);
    }
    fly(flight, 1.2, { out: true });
    assert.ok(flight.flying.length <= MOST_AT_ONCE);
  }
  assert.equal(flight.state, 'won');
  assert.equal(flight.dropped, 7);
  assert.equal(named(events, 'won').length, 1);
  assert.equal(new Set(named(events, 'spawn').map(({ enemy }) => enemy.index)).size, 7);
  // It carries on flying afterwards, inside the limits, and nothing else happens.
  const { x } = flight;
  fly(flight, 3, { out: true });
  assert.notEqual(flight.x, x);
  assert.equal(named(events, 'won').length, 1);
});

/* ---------- being hunted ---------- */

test('every so often one of them comes after the child, and shoots when it\'s behind them', () => {
  const { flight, events } = flying();
  let hunted = false;
  fly(flight, 40, () => {
    hunted = hunted || flight.flying.some(({ mode }) => mode === 'hunt');
    return { out: true };
  });
  assert.ok(hunted, 'someone hunted');
  assert.ok(named(events, 'enemy-shot').length > 0, 'and shot');
  assert.ok(flight.flying.filter(({ mode }) => mode === 'hunt').length <= 1, 'one at a time');
});

test('being hit costs a heart, and they come back', () => {
  const { flight, events } = flying();
  flight.hurt();
  assert.equal(flight.hearts, HEARTS - 1);
  assert.equal(named(events, 'hurt').length, 1);
  assert.ok(flight.hurtLeft > 0);
  fly(flight, LEVELS.gentle.healAfter + 0.5, () => {
    flight.shots = [];
    for (const enemy of flight.flying) enemy.mode = 'cross';
    flight.huntIn = 100;
    return { out: true };
  });
  assert.equal(flight.hearts, HEARTS);
});

test('on Gentle a child can\'t be shot down, whatever happens', () => {
  const { flight } = flying();
  for (let i = 0; i < 40; i += 1) flight.hurt();
  assert.equal(flight.hearts, 1);
  assert.equal(flight.state, 'flying');
});

test('on the harder levels running out of hearts ends it', () => {
  for (const level of ['medium', 'tough']) {
    const { flight, events } = flying({ level });
    for (let i = 0; i < HEARTS; i += 1) flight.hurt();
    assert.equal(flight.state, 'lost');
    assert.equal(named(events, 'lost').length, 1);
    assert.equal(flight.firing, false);
  }
});

test('a child steering for the planes wins, and one who isn\'t doesn\'t by accident', () => {
  for (const pace of Object.keys(PACES)) {
    const { flight } = flying({ pace });
    fly(flight, 240, huntingWell(flight));
    assert.equal(flight.state, 'won', pace);
    assert.ok(flight.stats.seconds > 20, `${pace}: over in ${flight.stats.seconds}`);
  }
  const { flight } = flying({ random: seeded(5) });
  fly(flight, 120, { out: true });
  assert.notEqual(flight.state, 'won');
});

/* ---------- resting ---------- */

test('with arms down the plane glides, and after a while nobody shoots, however long the rest', () => {
  const { flight, events } = flying();
  const flyingSpeed = flight.speed;
  fly(flight, 2, { out: false });
  assert.ok(flight.speed < flyingSpeed * 0.8, 'gliding');
  assert.equal(flight.resting, false);
  fly(flight, 3, { out: false });
  assert.equal(flight.resting, true);
  assert.equal(named(events, 'resting').at(-1).on, true);

  const { hurts, shots } = flight.stats;
  for (const enemy of flight.flying) {
    enemy.mode = 'hunt';
    enemy.modeLeft = 100;
  }
  fly(flight, 90, () => {
    assert.ok(Math.hypot(flight.x, flight.z) <= WORLD.limit);
    assert.ok(flight.y >= floorAt(flight.x, flight.z) - 1e-6);
    assert.equal(flight.locked, null);
    return { out: false };
  });
  assert.equal(flight.stats.hurts, hurts, 'nobody gets hurt while resting');
  assert.equal(flight.stats.shots, shots, 'and nobody shoots');
  assert.ok(flight.flying.every(({ mode }) => mode !== 'hunt'), 'nobody hunts them');

  fly(flight, 1, { out: true });
  assert.equal(flight.resting, false);
  assert.equal(named(events, 'resting').at(-1).on, false);
});

/* ---------- for a child who can't do it all ---------- */

test('with climbing off, the plane follows the others up and down by itself', () => {
  const { flight } = flying({ climbing: false, planes: 1 });
  const [enemy] = flight.enemies;
  flight.huntIn = 1000;
  holdInFront(flight, enemy, { ahead: 200, up: 90 });
  const from = flight.y;
  fly(flight, 2, () => {
    enemy.way = { x: enemy.x, y: enemy.y, z: enemy.z };
    return { out: true, climb: -1 };
  });
  assert.ok(flight.pitch > 0.1, `pitch ${flight.pitch}`);
  assert.ok(flight.y > from + 5, 'even with the arms held low');
});

test('the plane helps with lining up, when something is near the ring', () => {
  const { flight } = flying({ planes: 1 });
  const [enemy] = flight.enemies;
  flight.huntIn = 1000;
  // Off to one side of the ring, and staying in that direction.
  const { forward } = flight;
  const direction = { x: forward.x * 160 - forward.z * 40, y: 0, z: forward.z * 160 + forward.x * 40 };
  fly(flight, 2, () => {
    const { eye } = flight.view;
    Object.assign(enemy, { x: eye.x + direction.x, y: eye.y, z: eye.z + direction.z, mode: 'cross', dodgeLeft: 1 });
    enemy.way = { x: enemy.x, y: enemy.y, z: enemy.z };
    return { out: true };
  });
  assert.ok(flight.heading > 0.1, `heading ${flight.heading}`);
  assert.ok(flight.stats.shots > 0, 'and it has been in the ring');
});

/** Just enough of a reader for the lesson. */
function fakeReader() {
  return {
    wings: { seen: true, out: false, span: 1.3, tilt: 0, height: 0, bank: 0, climb: 0 },
    personal: {},
    wingsNeeded: 1.9,
  };
}

function lessonWith(steps = ['wings', 'tipRight', 'tipLeft', 'climb', 'dive']) {
  const reader = fakeReader();
  const events = [];
  const lesson = new Lesson({ steps, reader, onEvent: (event) => events.push(event) });
  let now = 0;
  const pass = (seconds, each = () => {}) => {
    for (let t = 0; t < seconds; t += 1 / 30) {
      now += 1 / 30;
      each();
      lesson.update(1 / 30);
    }
  };
  return { reader, lesson, events, pass };
}

test('the lesson goes through each thing in turn, moving on when it\'s been done', () => {
  const { reader, lesson, events, pass } = lessonWith();
  assert.equal(lesson.step, 'wings');
  assert.deepEqual(events[0], { type: 'step', step: 'wings', index: 0, total: 5 });
  pass(3);
  assert.equal(lesson.step, 'wings', 'arms down isn\'t wings');

  reader.wings = { ...reader.wings, out: true, span: 3.5, tilt: 0.1, height: -0.2 };
  pass(0.9);
  assert.ok(events.some(({ type, step }) => type === 'success' && step === 'wings'));
  assert.ok(Math.abs(reader.personal.tiltZero - 0.1) < 1e-9, 'how the arms are held is the middle');
  assert.ok(Math.abs(reader.personal.heightZero + 0.2) < 1e-9);
  pass(1.4);
  assert.equal(lesson.step, 'tipRight');

  reader.wings = { ...reader.wings, tilt: 0.1 + 0.5, bank: 1 };
  pass(0.4);
  assert.ok(Math.abs(reader.personal.tiltRight - 0.45) < 1e-9, 'as far as they tipped is a full turn');
  pass(1.4);
  assert.equal(lesson.step, 'tipLeft');

  reader.wings = { ...reader.wings, tilt: 0.1 - 0.3, bank: -1 };
  pass(0.4);
  assert.ok(Math.abs(reader.personal.tiltLeft - 0.27) < 1e-9, 'with its own measure');
  pass(1.4);
  assert.equal(lesson.step, 'climb');

  reader.wings = { ...reader.wings, tilt: 0.1, climb: 0.7 };
  pass(0.4);
  pass(1.4);
  assert.equal(lesson.step, 'dive');

  pass(1);
  assert.equal(lesson.step, 'dive', 'arms up isn\'t going down');
  reader.wings = { ...reader.wings, climb: -0.7 };
  pass(0.4);
  pass(1.4);
  assert.equal(lesson.finished, true);
  assert.equal(events.at(-1).type, 'finished');
});

test('a small tip counts after a few seconds of trying, for a child who can\'t tip far', () => {
  const { reader, lesson, pass } = lessonWith(['tipRight']);
  reader.wings = { ...reader.wings, out: true, tilt: 0.14 };
  pass(3);
  assert.equal(lesson.pause > 0, false);
  pass(4);
  assert.ok(lesson.pause > 0 || lesson.finished);
  assert.ok(reader.personal.tiltRight < 0.14, `a full turn is ${reader.personal.tiltRight}`);
});

test('what counts as arms out comes down for a child who is trying', () => {
  const { reader, pass } = lessonWith(['wings']);
  reader.personal = {};
  reader.wings = { ...reader.wings, span: 1.9 };
  Object.defineProperty(reader, 'wingsNeeded', { get() { return reader.personal.wings ?? 2.4; } });
  pass(5.2);
  assert.ok(reader.personal.wings > 1.6 && reader.personal.wings < 1.9, `now ${reader.personal.wings}`);
});

test('arms hanging down never bring what counts down that far', () => {
  const { reader, pass } = lessonWith(['wings']);
  reader.wings = { ...reader.wings, span: 1.45 };
  Object.defineProperty(reader, 'wingsNeeded', { get() { return reader.personal.wings ?? 2.4; } });
  pass(30);
  assert.equal(reader.personal.wings, undefined);
});

test('there\'s a film for each thing the lesson asks for', () => {
  for (const name of ['wings', 'tip', 'climb', 'dive']) assert.ok(DEMOS[name], name);
});

test('everything Sky Wings says has a voice file, in English and in Georgian', () => {
  const folder = new URL('../../games/sky-wings/audio/voice/', import.meta.url);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder)));
  const shared = JSON.parse(readFileSync(new URL('../../core/body/voice/lines.json', import.meta.url)));
  const core = JSON.parse(readFileSync(new URL('../../core/audio/voice/lines.json', import.meta.url)));
  const known = new Set([...lines, ...shared, ...core].map(({ text }) => text));
  for (const { id, ka } of lines) {
    assert.match(ka, /[Ⴀ-ჿ]/, id);
    for (const language of ['en', 'ka']) assert.ok(existsSync(new URL(`${language}/${id}.ogg`, folder)), `${language}/${id}.ogg is missing`);
  }
  const source = readFileSync(new URL('../../games/sky-wings/main.js', import.meta.url), 'utf8');
  const asked = new Set();
  for (const block of source.matchAll(/const SAY = \{([\s\S]+?)\n?\};/g)) {
    for (const [, text] of block[1].matchAll(/'([^']+)'/g)) asked.add(text);
  }
  assert.ok(asked.size >= 14, `only found ${asked.size} lines`);
  assert.deepEqual([...asked].filter((text) => !known.has(text)), []);
  assert.deepEqual(lines.map(({ text }) => text).filter((text) => !asked.has(text)), [], 'nothing rendered that can no longer be said');
});
