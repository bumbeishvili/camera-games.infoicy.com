// The rules and stories of the games with a mission. Each one's screen is tested in test/e2e.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Journey, Picking, STOPS } from '../../games/joze-walk/journey.js';
import { DAY, FRUITS, Stand, nearestOnPath } from '../../games/smoothie-stand/orders.js';
import { CLEAN_ENOUGH, Mud, SHIPS, Storm } from '../../games/lighthouse/storm.js';

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
