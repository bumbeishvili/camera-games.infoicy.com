// The rules and stories of the games with a mission. Each one's screen is tested in test/e2e.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Journey, Picking, STOPS, stopsAt, walkAt } from '../../games/joze-walk/journey.js';
import { DAY, FRUITS, Stand, fairAt, nearestOnPath } from '../../games/smoothie-stand/orders.js';
import { CLEAN_ENOUGH, Mud, SHIPS, Storm, stormAt } from '../../games/lighthouse/storm.js';

const eventsOf = () => {
  const events = [];
  return { events, onEvent: (event) => events.push(event), types: () => events.map(({ type }) => type) };
};

/* ---------- Joze's Smoothie Stand ---------- */

test('slicing what\'s on the order finishes it, and what isn\'t on it doesn\'t count', () => {
  const log = eventsOf();
  const stand = new Stand({ onEvent: log.onEvent });
  stand.nextCustomer();
  assert.deepEqual(stand.customer.order, { apple: 4 });
  assert.equal(stand.slice('orange'), 'extra');
  assert.equal(stand.left.apple, 4);
  for (let i = 0; i < 4; i += 1) assert.equal(stand.slice('apple'), 'wanted');
  assert.equal(stand.stats.smoothies, 1);
  assert.ok(log.types().includes('order-done'));
});

test('going through every customer ends the day, and each gets their smoothie', () => {
  const log = eventsOf();
  const stand = new Stand({ onEvent: log.onEvent });
  for (const { order } of DAY) {
    stand.nextCustomer();
    for (const [kind, count] of Object.entries(order)) {
      for (let i = 0; i < count; i += 1) stand.slice(kind);
    }
  }
  stand.nextCustomer();
  assert.ok(stand.over);
  assert.equal(stand.stats.smoothies, DAY.length);
  assert.equal(log.types().at(-1), 'day-over');
});

test('the short day has three customers, and still ends with the judge', () => {
  const stand = new Stand({ short: true });
  assert.equal(stand.customers.length, 3);
  assert.equal(stand.customers.at(-1).who, 'bramble');
});

test('something on the order is never far away, and only some customers bring rotten fruit', () => {
  let roll = 0;
  const random = () => {
    roll = (roll * 16807 + 11) % 2147483647 || 1;
    return (roll % 1000) / 1000;
  };
  const stand = new Stand({ random });
  for (const { order, rotten } of DAY) {
    stand.nextCustomer();
    let sinceWanted = 0;
    let sawRotten = false;
    for (let i = 0; i < 400; i += 1) {
      const kind = stand.nextFruit();
      if (kind === 'rotten') sawRotten = true;
      if (kind in order) sinceWanted = 0;
      else sinceWanted += 1;
      assert.ok(sinceWanted <= 2, 'too long without anything on the order');
      assert.ok(kind === 'rotten' || FRUITS.includes(kind));
    }
    assert.equal(sawRotten, Boolean(rotten));
    for (const [kind, count] of Object.entries(order)) {
      for (let i = 0; i < count; i += 1) stand.slice(kind);
    }
  }
});

test('a fast swipe counts along the whole of its path, not only where it ended', () => {
  assert.equal(nearestOnPath(0, 0, 100, 0, 50, 10), 10);
  assert.equal(nearestOnPath(0, 0, 100, 0, 150, 0), 50);
  assert.equal(nearestOnPath(5, 5, 5, 5, 5, 15), 10);
});

/* ---------- Joze's Long Walk Home ---------- */

test('feeding Joze at every stop brings him home', () => {
  const log = eventsOf();
  const journey = new Journey({ onEvent: log.onEvent });
  journey.nextStop();
  for (const { count } of STOPS) {
    assert.equal(journey.fed, 0);
    for (let i = 0; i < count; i += 1) journey.feed();
    assert.equal(log.types().at(-1), 'stop-done');
    journey.nextStop();
  }
  assert.ok(journey.over);
  assert.equal(log.types().at(-1), 'home');
  assert.equal(journey.progress, 1);
});

test('the way home only goes forward, and dropping fruit costs nothing', () => {
  const journey = new Journey();
  journey.nextStop();
  journey.feed();
  const before = journey.progress;
  journey.dropped();
  assert.equal(journey.progress, before);
  assert.equal(journey.stats.dropped, 1);
  assert.ok(journey.progress > 0);
});

test('a closed hand picks a fruit up, and an open hand lets it go', () => {
  const picking = new Picking();
  const fruit = { id: 1 };
  const step = (change) => picking.update(0.1, { closed: false, seen: true, near: null, onMouth: false, ...change });
  // An open hand can't pick, and a hand has to stay closed for a moment.
  assert.equal(step({ near: fruit }), null);
  assert.equal(step({ closed: true, near: fruit }), null);
  assert.equal(step({ closed: true, near: fruit }), 'picked');
  assert.equal(picking.held, fruit);
  assert.equal(step({ closed: true }), null);
  assert.equal(step({ onMouth: true }), 'fed');
  assert.equal(picking.held, null);
});

test('letting go somewhere else drops it, and so does the hand leaving the picture', () => {
  const picking = new Picking();
  const fruit = { id: 1 };
  const holdIt = () => {
    picking.update(0.2, { closed: true, seen: true, near: fruit, onMouth: false });
    assert.equal(picking.held, fruit);
  };
  holdIt();
  assert.equal(picking.update(0.1, { closed: false, seen: true, near: null, onMouth: false }), 'dropped');
  holdIt();
  assert.equal(picking.update(0.1, { closed: false, seen: false, near: null, onMouth: false }), 'dropped');
  assert.equal(picking.held, null);
});

/* ---------- The Lighthouse Keeper ---------- */

test('wiping the same place twice cleans nothing new', () => {
  const mud = new Mud();
  const first = mud.wipe(0.5, 0.5, 0.2, 0.3);
  assert.ok(first > 0);
  assert.equal(mud.wipe(0.5, 0.5, 0.2, 0.3), 0);
  assert.equal(mud.share, first / mud.cells.length);
});

test('a window has to be wiped nearly all over before its ship can come in', () => {
  const log = eventsOf();
  const storm = new Storm({ onEvent: log.onEvent });
  storm.nextShip();
  // Only the left half of the window, however many times.
  for (let i = 0; i < 40; i += 1) storm.wipe((i % 10) / 20, (i % 7) / 7, 0.05, 0.15);
  assert.ok(storm.mud.share < CLEAN_ENOUGH);
  assert.ok(!log.types().includes('window-clean'));
  for (let x = 0; x <= 1; x += 0.05) {
    for (let y = 0; y <= 1; y += 0.1) storm.wipe(x, y, 0.1, 0.15);
  }
  assert.equal(log.types().filter((type) => type === 'window-clean').length, 1);
});

test('every ship coming home calms the storm, and the last one ends it', () => {
  const log = eventsOf();
  const storm = new Storm({ onEvent: log.onEvent });
  storm.nextShip();
  for (let index = 0; index < SHIPS.length; index += 1) {
    assert.equal(storm.calm, index / SHIPS.length);
    storm.shipHome();
    storm.nextShip();
  }
  assert.ok(storm.over);
  assert.equal(storm.calm, 1);
  assert.equal(log.types().at(-1), 'all-home');
});

test('a shorter storm still has Bramble and the honey in it, last of all', () => {
  const storm = new Storm({ ships: 2 });
  assert.deepEqual(storm.ships.map(({ who }) => who), ['frost', 'bramble']);
});

/* ---------- all of them ---------- */

const MOST_WORDS = 11; // Children are here to move, and nobody's waiting for anyone to finish talking.

for (const game of ['smoothie-stand', 'joze-walk', 'lighthouse', 'robot-rescue']) {
  test(`${game} keeps its talking short, and everything it says has a voice in both languages`, () => {
    const folder = new URL(`../../games/${game}/audio/voice/`, import.meta.url);
    const lines = JSON.parse(readFileSync(new URL('lines.json', folder)));
    for (const { id, text, ka } of lines) {
      assert.ok(text.split(/\s+/).length <= MOST_WORDS, `too long: ${text}`);
      assert.match(ka, /[Ⴀ-ჿ]/, id);
      for (const language of ['en', 'ka']) assert.ok(existsSync(new URL(`${language}/${id}.ogg`, folder)), `${language}/${id}`);
    }
    const source = readFileSync(new URL(`../../games/${game}/main.js`, import.meta.url), 'utf8');
    const rules = readFileSync(new URL(`../../games/${game}/${{ 'smoothie-stand': 'orders', 'joze-walk': 'journey', lighthouse: 'storm', 'robot-rescue': 'rescue' }[game]}.js`, import.meta.url), 'utf8');
    for (const { text } of lines) assert.ok(source.includes(text) || rules.includes(text), `nothing says: ${text}`);
  });
}

test('nobody has anything to say between one fruit and the next, or one stop and the next', () => {
  // Only the last customer and the last stop have words to finish on.
  assert.deepEqual(DAY.filter(({ thanks }) => thanks).map(({ who }) => who), ['bramble']);
  assert.deepEqual(STOPS.filter(({ done }) => done).map(({ place }) => place), ['home']);
});

/* ---------- levels ---------- */

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);

/** A seeded random, so that a test goes the same way every time. */
const seeded = (seed = 7) => {
  let roll = seed;
  return () => {
    roll = (roll * 16807) % 2147483647;
    return (roll - 1) / 2147483646;
  };
};

/**
 * Each level is the same or harder than the one before in every way, and harder in at least one.
 * harder gives each thing a number that's bigger when it's harder.
 */
function climbsEveryLevel(at, harder) {
  for (const level of LEVELS.slice(1)) {
    const [before, now] = [at(level - 1), at(level)];
    let harderIn = 0;
    for (const [key, score] of Object.entries(harder)) {
      const [a, b] = [score(before[key]), score(now[key])];
      assert.ok(b >= a - 1e-9, `level ${level} is easier in ${key}`);
      if (b > a + 1e-9) harderIn += 1;
    }
    assert.ok(harderIn > 0, `level ${level} is no harder than ${level - 1}`);
  }
  // Nothing about a level is left out of that.
  assert.deepEqual(Object.keys(at(1)).sort(), Object.keys(harder).sort());
}
const more = (value) => Number(value);
const less = (value) => -value;

/* The Lighthouse Keeper */

test('lighthouse: level 1 is the storm as it always was', () => {
  const level = stormAt(1);
  assert.equal(level.splats, 0);
  assert.equal(level.lump, null);
  assert.equal(level.swell, 1);
  const storm = new Storm({ level: 1 });
  storm.nextShip();
  assert.deepEqual(storm.coming, []);
  for (let x = 0; x <= 1; x += 0.05) for (let y = 0; y <= 1; y += 0.1) storm.wipe(x, y, 0.1, 0.15, 0.5);
  assert.equal(storm.stats.splats + storm.stats.lumps, 0);
  assert.ok(storm.clean);
});

test('lighthouse: each level is a little harder than the one before', () => {
  const lumps = { null: 0, weed: 1, mixed: 2 };
  climbsEveryLevel(stormAt, {
    splats: more,
    splatFrom: less,
    splatSize: more,
    lump: (kind) => lumps[kind],
    weedRub: more,
    starRub: more,
    creep: more,
    swell: more,
  });
});

/** Wipes the whole window, row by row, the way a child sweeps across it. */
const sweep = (storm, moved = 0.3) => {
  for (let y = 0.05; y <= 1; y += 0.1) for (let x = 0; x <= 1; x += 0.03) storm.wipe(x, y, 0.1, 0.15, moved);
};

test('lighthouse: at level 10, mud lands back on clean glass, and seaweed and starfish take a rub', () => {
  const log = eventsOf();
  const storm = new Storm({ level: 10, random: seeded(), onEvent: log.onEvent });
  storm.nextShip();
  // Wiping with a hand that's still each time it touches: it wipes mud, but rubs nothing off.
  for (let i = 0; i < 3; i += 1) sweep(storm, 0);
  const splats = log.events.filter(({ type }) => type === 'splat');
  assert.equal(splats.length, 2);
  // Each landed on glass that had been wiped, so there was mud to wipe again.
  for (const { covered } of splats) assert.ok(covered > 0);
  assert.equal(storm.lumps.length, 1);
  assert.ok(storm.mud.share >= CLEAN_ENOUGH);
  assert.ok(!storm.clean, 'the seaweed is still on it');
  // Rubbing it takes it off, and only then is the window clean.
  sweep(storm);
  assert.ok(storm.clean);
  assert.equal(log.types().filter((type) => type === 'window-clean').length, 1);
  assert.deepEqual(log.types().slice(-2), ['lump-off', 'window-clean']);
});

test('lighthouse: from level 7, every other window has a starfish, which creeps but never leaves the middle', () => {
  const storm = new Storm({ level: 7, random: seeded(3) });
  storm.nextShip();
  assert.deepEqual(storm.coming.map(({ what }) => what).filter((what) => what !== 'splat'), ['weed']);
  storm.shipHome();
  storm.nextShip();
  assert.deepEqual(storm.coming.map(({ what }) => what).filter((what) => what !== 'splat'), ['star']);
  storm.addLump('star');
  const [star] = storm.lumps;
  const from = { x: star.x, y: star.y };
  for (let i = 0; i < 600; i += 1) storm.update(1 / 30);
  assert.ok(Math.hypot(star.x - from.x, star.y - from.y) > 0.01);
  assert.ok(star.x >= 0.14 && star.x <= 0.86 && star.y >= 0.18 && star.y <= 0.82);
  // It stays until it's rubbed off, however long that takes: nothing on the glass has a time limit.
  assert.equal(storm.lumps.length, 1);
  const still = { x: star.x, y: star.y };
  storm.update(5, { still: true });
  assert.deepEqual({ x: star.x, y: star.y }, still);
});

test('lighthouse: nothing new comes while resting, as it all comes from wiping', () => {
  const log = eventsOf();
  const storm = new Storm({ level: 10, onEvent: log.onEvent });
  storm.nextShip();
  for (let i = 0; i < 1000; i += 1) storm.update(0.1);
  assert.deepEqual(log.types(), ['ship']);
});

// What a window takes, roughly, to check the limits on a level. These are guesses about a child, and
// only the comparison between levels matters: wiping a whole window takes about 18 seconds in about 11
// sweeps, a splat takes one more sweep of about 1.5 seconds, and rubbing goes at about two lengths of
// a wipe a second, after about a second to reach it.
const WINDOW = { seconds: 18, sweeps: 11, between: 2.4 + 0.4, end: 1.6 };
function lighthouseLoad(level, ships = 4) {
  const at = stormAt(level);
  let seconds = 0;
  let sweeps = 0;
  for (let index = 0; index < ships; index += 1) {
    const kinds = new Storm({ level, ships }).plan(index).map(({ what }) => what);
    seconds += WINDOW.seconds + WINDOW.between;
    sweeps += WINDOW.sweeps;
    for (const what of kinds) {
      const rub = { splat: 0, weed: at.weedRub, star: at.starRub }[what];
      seconds += what === 'splat' ? 1.5 : 1 + rub / 2;
      sweeps += what === 'splat' ? 1 : rub / 2;
    }
  }
  seconds += WINDOW.end;
  return { seconds, perMinute: (sweeps / seconds) * 60, reactSeconds: Infinity };
}

test('lighthouse: level 10 is still within reach: at most a third longer, and not twice the moves', () => {
  for (const ships of [2, 4]) {
    const [first, last] = [lighthouseLoad(1, ships), lighthouseLoad(10, ships)];
    assert.ok(last.seconds <= first.seconds * 1.34, `${ships} ships: ${last.seconds} against ${first.seconds}`);
    assert.ok(last.perMinute <= first.perMinute * 2);
    assert.ok(last.reactSeconds >= first.reactSeconds * 0.7);
  }
});

/* Joze's Long Walk Home */

test('joze walk: level 1 is the walk as it always was', () => {
  assert.deepEqual(stopsAt(1), STOPS);
  const level = walkAt(1);
  assert.equal(level.walkSeconds, 2.8);
  assert.equal(level.sway, 0);
  assert.equal(level.unripe, 0);
  assert.equal(level.butterflies, false);
  assert.deepEqual(new Journey({ level: 1 }).stops, STOPS);
});

test('joze walk: each level is a little harder than the one before', () => {
  climbsEveryLevel(walkAt, {
    hungrier: more,
    walkSeconds: less,
    sway: more,
    swayRate: more,
    unripe: more,
    ripenSeconds: more,
    butterflies: more,
    butterflyEvery: less,
    butterflyStays: more,
  });
});

test('joze walk: at level 10, Joze is hungrier at two stops, and it still ends at home', () => {
  const stops = stopsAt(10);
  assert.deepEqual(stops.map(({ count }) => count), [3, 3, 5, 5, 3]);
  const log = eventsOf();
  const journey = new Journey({ level: 10, onEvent: log.onEvent });
  journey.nextStop();
  while (!journey.over) {
    while (journey.fed < journey.stop.count) journey.feed();
    journey.nextStop();
  }
  assert.equal(log.types().at(-1), 'home');
  assert.equal(journey.stats.fed, 19);
});

// A fruit takes about 4 seconds to pick, carry and give him. Fruit swaying, green fruit to pass over
// and butterflies to wait for or go round each add a little, by these guesses.
function walkLoad(level) {
  const at = walkAt(level);
  const fruitSeconds = 4 + 0.3 * (at.sway / 0.022) + 0.15 * at.unripe + (at.butterflies ? 0.2 : 0);
  const fruit = stopsAt(level).reduce((sum, { count }) => sum + count, 0);
  const seconds = fruit * fruitSeconds + (STOPS.length - 1) * at.walkSeconds + 2.4;
  return { seconds, perMinute: (fruit / seconds) * 60, reactSeconds: Infinity };
}

test('joze walk: level 10 is still within reach: at most a third longer, and not twice the moves', () => {
  const [first, last] = [walkLoad(1), walkLoad(10)];
  assert.ok(last.seconds <= first.seconds * 1.34, `${last.seconds} against ${first.seconds}`);
  assert.ok(last.perMinute <= first.perMinute * 2);
  // Nothing in the walk has a time limit: green fruit ripens and butterflies fly off by themselves.
  assert.ok(walkAt(10).butterflyStays <= 5);
  assert.ok(walkAt(10).ripenSeconds <= 10);
});

/* Joze's Smoothie Stand */

test('smoothie stand: level 1 is the fair as it always was', () => {
  const level = fairAt(1);
  assert.deepEqual([level.gravity, level.every, level.volley, level.most, level.wantedShare, level.rottenShare], [1, 1, 0, 0, 0.6, 0.14]);
  assert.deepEqual([level.across, level.pairs, level.tough], [0, 0, 0]);
  // Rotten fruit only with the customers who always had it, on the long day and the short.
  for (const short of [false, true]) {
    const stand = new Stand({ short });
    const withRotten = [];
    for (let i = 0; i < stand.customers.length; i += 1) {
      stand.nextCustomer();
      if (stand.rotten) withRotten.push(stand.customer.who);
    }
    assert.deepEqual(withRotten, stand.customers.filter(({ rotten }) => rotten).map(({ who }) => who));
  }
  const stand = new Stand({ random: seeded() });
  stand.nextCustomer();
  for (let i = 0; i < 100; i += 1) {
    const { across, tough, withRotten } = stand.nextThrow();
    assert.ok(!across && !tough && !withRotten);
  }
});

test('smoothie stand: each level is a little harder than the one before', () => {
  climbsEveryLevel(fairAt, {
    gravity: more,
    every: less,
    volley: more,
    most: more,
    wantedShare: less,
    rottenLast: more,
    rottenShare: more,
    across: more,
    pairs: more,
    tough: more,
  });
});

test('smoothie stand: at level 10 there\'s rotten fruit from the first customer, thrown across, beside wanted fruit, and tough fruit', () => {
  const stand = new Stand({ level: 10, random: seeded(11) });
  stand.nextCustomer();
  assert.ok(stand.rotten);
  const seen = { rotten: 0, across: 0, tough: 0, withRotten: 0 };
  let sinceWanted = 0;
  for (let i = 0; i < 600; i += 1) {
    const { kind, across, tough, withRotten } = stand.nextThrow();
    if (kind === 'rotten') seen.rotten += 1;
    seen.across += across;
    seen.tough += tough;
    seen.withRotten += withRotten;
    // Tough fruit and pairs are only ever what's on the order.
    if (tough || withRotten) assert.ok(stand.left[kind] > 0);
    sinceWanted = kind in stand.customer.order ? 0 : sinceWanted + 1;
    assert.ok(sinceWanted <= 2, 'too long without anything on the order');
  }
  for (const [what, count] of Object.entries(seen)) assert.ok(count > 10, what);
});

// How the fair goes, roughly, at a grown-up's pace: how much on the order comes up a second, how long
// a fruit is up to be sliced, and how long a day takes for a child who swipes about every 2 seconds
// and catches a rotten one about a third of the time it's up beside what they want.
const PACES = {
  slow: { gravity: 0.38, every: 0.85, volley: [1, 2], most: 8 },
  medium: { gravity: 0.5, every: 0.7, volley: [1, 3], most: 10 },
  fast: { gravity: 0.68, every: 0.55, volley: [2, 3], most: 12 },
};
function fairLoad(level, paceName) {
  const at = fairAt(level);
  const pace = PACES[paceName];
  const gravity = pace.gravity * at.gravity;
  const upSeconds = 2 * Math.sqrt((2 * 0.52) / gravity); // A throw up to halfway, and back down.
  // As in field.js: a level adds no more than the fastest pace has, at once or in a throw.
  const volley = Math.max(pace.volley[1], Math.min(3, pace.volley[1] + at.volley));
  const most = Math.max(pace.most, Math.min(12, pace.most + at.most));
  const thrown = Math.min((pace.volley[0] + volley) / 2 / (pace.every * at.every), most / upSeconds);
  const wantedPerSecond = thrown * at.wantedShare;
  const wanted = DAY.reduce((sum, { order }) => sum + Object.values(order).reduce((a, b) => a + b, 0), 0);
  const withRotten = DAY.slice(DAY.length - at.rottenLast).reduce((sum, { order }) => sum + Object.values(order).reduce((a, b) => a + b, 0), 0);
  const swipes = wanted * (1 + at.tough);
  const rottenHit = withRotten * ((at.rottenShare / at.wantedShare) + at.pairs) * 0.3;
  const seconds = swipes * 2 + rottenHit * 1.2 + (DAY.length - 1) + 2.8;
  return { seconds, perMinute: wantedPerSecond * 60 * (1 + at.tough), wantedPerSecond, reactSeconds: upSeconds };
}

test('smoothie stand: level 10 is still within reach, at every pace a grown-up can choose', () => {
  for (const pace of Object.keys(PACES)) {
    const [first, last] = [fairLoad(1, pace), fairLoad(10, pace)];
    assert.ok(last.reactSeconds >= first.reactSeconds * 0.7, `${pace}: fruit is up too short a time`);
    assert.ok(last.perMinute <= first.perMinute * 2, `${pace}: too many moves`);
    assert.ok(last.seconds <= first.seconds * 1.34, `${pace}: ${last.seconds} against ${first.seconds}`);
    // What's on the order comes up at least as often, so nobody waits longer for it.
    assert.ok(last.wantedPerSecond >= first.wantedPerSecond * 0.99, `${pace}: ${last.wantedPerSecond} against ${first.wantedPerSecond}`);
  }
});
