// Spider Catcher's rules and story, with no screen. Its screen is tested in test/e2e/spider-catcher.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { LAST_LEVEL } from '../../core/levels.js';
import {
  BASKET_HOLDS, BERRY, BUTTERFLY, CATCH_REACH, CHEST_SECONDS, Catching, GRAB_WINDOW, Gathering, PLACES, SLEEP_MOST, SPIDER_SIZE, WAKE_SECONDS,
  gardenAt, newsIsOn, pathFor, placesAt, spiderAt, spiderNewAt, spidersFor, spotFor, visitorsAt, webAt,
} from '../../games/spider-catcher/spiders.js';

const LEVELS = Array.from({ length: LAST_LEVEL }, (_, index) => index + 1);
const eventsOf = () => {
  const events = [];
  return { events, onEvent: (event) => events.push(event), types: () => events.map(({ type }) => type) };
};

/* ---------- catching ---------- */

const hand = (change = {}) => ({ seen: true, open: false, closed: false, near: null, onWeb: false, ...change });

test('a hand that opens by a spider and closes on it catches it, and opening at the web puts it home', () => {
  const catching = new Catching();
  const spider = { id: 1 };
  assert.equal(catching.update(0.1, hand({ open: true, near: spider })), null);
  // A hand has to be closed by it for a moment.
  assert.equal(catching.update(0.05, hand({ closed: true, near: spider })), null);
  assert.equal(catching.update(0.06, hand({ closed: true, near: spider })), 'caught');
  assert.equal(catching.held, spider);
  // Carried across, closed, and nothing happens on the way.
  for (let i = 0; i < 20; i += 1) assert.equal(catching.update(0.1, hand({ closed: true })), null);
  assert.equal(catching.update(0.1, hand({ open: true, onWeb: true })), 'home');
  assert.equal(catching.held, null);
});

test('a fist that was never open, or closed long ago, doesn\'t pick spiders up as they go by', () => {
  const catching = new Catching();
  const spider = { id: 1 };
  for (let i = 0; i < 30; i += 1) assert.equal(catching.update(0.1, hand({ closed: true, near: spider })), null);
  // Open somewhere else, closed, and then held still until a spider comes along.
  catching.update(0.1, hand({ open: true }));
  for (let t = 0; t < GRAB_WINDOW + 0.1; t += 0.1) catching.update(0.1, hand({ closed: true }));
  for (let i = 0; i < 10; i += 1) assert.equal(catching.update(0.1, hand({ closed: true, near: spider })), null);
  assert.equal(catching.held, null);
});

test('a hand closing just after it was open is still forgiven: it can close on the way to a spider', () => {
  const catching = new Catching();
  const spider = { id: 1 };
  catching.update(0.1, hand({ open: true }));
  catching.update(0.5, hand({ closed: true }));
  catching.update(0.3, hand({ closed: true, near: spider }));
  assert.equal(catching.held, spider);
});

test('a hand that can\'t be read is neither open nor closed: it can\'t catch, and it can\'t let go', () => {
  const catching = new Catching();
  const spider = { id: 1 };
  catching.update(0.1, hand({ open: true, near: spider }));
  // At the edge of the picture, too far away or overlapping: seen, but neither.
  for (let i = 0; i < 10; i += 1) assert.equal(catching.update(0.1, hand({ near: spider })), null);
  assert.equal(catching.held, null);
  catching.update(0.1, hand({ open: true, near: spider }));
  catching.update(0.2, hand({ closed: true, near: spider }));
  assert.equal(catching.held, spider);
  for (let i = 0; i < 10; i += 1) assert.equal(catching.update(0.1, hand({ onWeb: true })), null);
  assert.equal(catching.held, spider);
});

test('opening anywhere but the web lets the spider go, and so does the hand leaving the picture', () => {
  const catching = new Catching();
  const spider = { id: 1 };
  const catchIt = () => {
    catching.update(0.1, hand({ open: true, near: spider }));
    catching.update(0.2, hand({ closed: true, near: spider }));
    assert.equal(catching.held, spider);
  };
  catchIt();
  assert.equal(catching.update(0.1, hand({ open: true })), 'let-go');
  catchIt();
  // Gone, even over the web: it's let go, and never home.
  assert.equal(catching.update(0.1, hand({ seen: false, open: true, onWeb: true })), 'let-go');
  assert.equal(catching.held, null);
  // And a hand coming back into the picture already closed has to open first.
  assert.equal(catching.update(0.2, hand({ closed: true, near: spider })), null);
});

/* ---------- the story ---------- */

test('every spider home goes round the garden, and the last place ends it with everyone home', () => {
  const log = eventsOf();
  const gathering = new Gathering({ onEvent: log.onEvent });
  gathering.nextPlace();
  assert.equal(gathering.place.who, 'joze');
  while (!gathering.over) {
    while (gathering.home < gathering.place.count) gathering.spiderHome();
    gathering.nextPlace();
  }
  assert.equal(log.types().at(-1), 'all-home');
  assert.equal(log.types().filter((type) => type === 'place-done').length, PLACES.length);
  assert.equal(gathering.stats.home, 17);
  assert.equal(gathering.progress, 1);
});

test('letting go costs nothing', () => {
  const gathering = new Gathering();
  gathering.nextPlace();
  gathering.spiderHome();
  const before = gathering.progress;
  gathering.letGo();
  assert.equal(gathering.progress, before);
  assert.equal(gathering.stats.letGo, 1);
});

test('Joze comes first and last, and every friend has one short line', () => {
  assert.equal(PLACES[0].who, 'joze');
  assert.equal(PLACES.at(-1).who, 'joze');
  assert.ok(PLACES.at(-1).done);
});

test('with the basket, two can be carried at once: the first goes into the basket, and both go home', () => {
  const catching = new Catching({ holds: BASKET_HOLDS });
  const [one, two] = [{ id: 1 }, { id: 2 }];
  catching.update(0.1, hand({ open: true, near: one }));
  catching.update(0.2, hand({ closed: true, near: one }));
  assert.equal(catching.held, one);
  // Opening away from the web pops it in the basket, rather than letting it go.
  assert.equal(catching.update(0.1, hand({ open: true })), 'stashed');
  assert.deepEqual(catching.carried, [one]);
  assert.equal(catching.update(0.2, hand({ closed: true, near: two })), 'caught');
  assert.deepEqual(catching.carried, [one, two]);
  // With both, opening away lets the one in the hand go, and the basket keeps its one.
  const spare = new Catching({ holds: BASKET_HOLDS });
  spare.stash = [one];
  spare.held = two;
  assert.equal(spare.update(0.1, hand({ open: true })), 'let-go');
  assert.deepEqual(spare.released, [two]);
  assert.deepEqual(spare.carried, [one]);
  // At the web, both go home.
  assert.equal(catching.update(0.1, hand({ open: true, onWeb: true })), 'home');
  assert.deepEqual(catching.released, [one, two]);
  assert.deepEqual(catching.carried, []);
  // A hand that leaves the picture lets go of all of them.
  catching.stash = [one];
  catching.held = two;
  assert.equal(catching.update(0.1, hand({ seen: false })), 'let-go');
  assert.deepEqual(catching.released, [one, two]);
  // Without the basket, it's as it always was.
  const plain = new Catching();
  plain.update(0.1, hand({ open: true, near: one }));
  plain.update(0.2, hand({ closed: true, near: one }));
  assert.equal(plain.update(0.1, hand({ open: true })), 'let-go');
});

/* ---------- moving about ---------- */

test('nowhere on a path is a spider faster than its level allows, and it goes round a smooth loop', () => {
  for (const level of LEVELS) {
    for (const kind of ['scuttle', 'dangle']) {
      const path = pathFor({ kind, centre: spotFor(1), phase: 0.7, level });
      let fastest = 0;
      const step = 0.01;
      let last = spiderAt(path, 0);
      for (let t = step; t < 60; t += step) {
        const at = spiderAt(path, t);
        fastest = Math.max(fastest, Math.hypot(at.x - last.x, at.y - last.y) / step);
        last = at;
      }
      assert.ok(fastest <= gardenAt(level).speed * 1.001, `${kind} at level ${level}: ${fastest}`);
      assert.ok(fastest >= gardenAt(level).speed * 0.6, `${kind} at level ${level} hardly moves`);
      // Back where it started, once round.
      const round = (Math.PI * 2) / path.rate;
      const [start, end] = [spiderAt(path, 0), spiderAt(path, round)];
      assert.ok(Math.hypot(start.x - end.x, start.y - end.y) < 1e-9);
    }
  }
});

test('the web only sways from level 4, slowly, and half as far with reduced motion', () => {
  for (const level of [1, 2, 3]) assert.equal(gardenAt(level).webSway, 0);
  const sway = gardenAt(10).webSway;
  let furthest = 0;
  let furthestCalm = 0;
  for (let t = 0; t < 30; t += 0.05) {
    furthest = Math.max(furthest, Math.abs(webAt(sway, t).x));
    furthestCalm = Math.max(furthestCalm, Math.abs(webAt(sway, t, true).x));
  }
  assert.ok(furthest <= sway + 1e-9 && furthest > sway * 0.9);
  assert.ok(Math.abs(furthestCalm - furthest / 2) < 1e-6);
});

test('who comes out to play: half swing on threads, the shy ones and twins only at the higher levels', () => {
  const one = spidersFor(5, 1, () => 0.5);
  assert.equal(one.length, 5);
  assert.deepEqual(one.map(({ kind }) => kind), ['scuttle', 'dangle', 'scuttle', 'dangle', 'scuttle']);
  assert.ok(one.every(({ shy, pair }) => !shy && pair === null));
  const ten = spidersFor(5, 10, () => 0.5);
  assert.equal(ten.length, 5);
  assert.ok(ten.some(({ shy }) => shy));
  const twins = ten.filter(({ pair }) => pair !== null);
  assert.equal(twins.length % 2, 0);
  assert.ok(twins.length >= 2);
  // The second of a pair follows the first.
  assert.equal(ten[ten.findIndex(({ pair }) => pair !== null) + 1].behind, true);
  // Every place has its count, whatever the level.
  for (const level of LEVELS) for (const { count } of placesAt(level)) assert.equal(spidersFor(count, level).length, count);
});

/* ---------- the ten levels ---------- */

const more = (value) => Number(value);
const less = (value) => -value;

test('level 1 is slow, two at a time, still webs and nothing shy or in pairs, and nothing new', () => {
  const level = gardenAt(1);
  assert.deepEqual(placesAt(1), PLACES);
  assert.equal(level.atOnce, 2);
  assert.equal(level.twist, 1);
  assert.equal(level.webSway, 0);
  assert.equal(level.shy, 0);
  assert.equal(level.pairs, 0);
  assert.equal(level.speed, 0.07);
  assert.equal(level.webs, 1);
  for (const key of ['berries', 'ladybird', 'butterfly', 'basket', 'chest', 'boats', 'golden']) assert.equal(level[key], false, key);
  assert.equal(level.sleepy, 0);
  assert.deepEqual(spiderNewAt(1), []);
  for (const { place } of PLACES) assert.deepEqual(visitorsAt(place, 1), { ladybird: false, butterfly: false, chest: false, basket: false });
  // Level 1's spiders are as they always were.
  const plans = spidersFor(5, 1, () => 0.5);
  assert.ok(plans.every(({ sleepy, golden, kind }) => !sleepy && !golden && (kind === 'scuttle' || kind === 'dangle')));
});

test('every level from 2 brings something new, which really comes in at that level and stays', () => {
  for (const level of LEVELS.slice(1)) {
    const news = spiderNewAt(level);
    assert.ok(news.length > 0 && news.length <= 3, `level ${level} has nothing new`);
    for (const { key, mark, name, nameKa } of news) {
      assert.ok(mark && name && name.split(' ').length <= 3, `level ${level}: ${name}`);
      assert.match(nameKa, /[Ⴀ-ჿ]/, name);
      assert.equal(newsIsOn(key, level - 1), false, `${name} is already on at level ${level - 1}`);
      for (const later of LEVELS.slice(level - 1)) assert.equal(newsIsOn(key, later), true, `${name} is off at level ${later}`);
    }
  }
  const listed = new Set(LEVELS.flatMap((level) => spiderNewAt(level).map(({ key }) => key)));
  for (const thing of ['berries', 'ladybird', 'sleepy', 'butterfly', 'basket', 'chest', 'webs', 'boats', 'golden', 'webSway', 'shy', 'pairs']) {
    assert.ok(listed.has(thing), thing);
  }
});

test('what each new thing does is really in the garden from its level', () => {
  // A ladybird plays at the second and fourth places from level 3, in place of a spider, so there's no
  // more to do. She's never shy, asleep or in a pair.
  for (const level of LEVELS) {
    for (const { place, count } of placesAt(level)) {
      const { ladybird } = visitorsAt(place, level);
      const plans = spidersFor(count, level, () => 0.3, { ladybird });
      assert.equal(plans.length, count);
      const birds = plans.filter(({ kind }) => kind === 'ladybird');
      assert.equal(birds.length, ladybird ? 1 : 0, `${place} at ${level}`);
      for (const bird of birds) assert.ok(!bird.shy && !bird.sleepy && bird.pair === null && bird.web === null);
    }
  }
  assert.ok(placesAt(3).some(({ place }) => visitorsAt(place, 3).ladybird));
  // Sleepy spiders from level 4, never the first one out, so there's always one to catch straight away.
  const sleepy = spidersFor(5, 4, () => 0.3);
  assert.ok(sleepy.some(({ sleepy: asleep }) => asleep));
  assert.equal(sleepy[0].sleepy, false);
  assert.ok(spidersFor(5, 3).every(({ sleepy: asleep }) => !asleep));
  // The butterfly and the chest take turns between the places, and every place has a basket from 6.
  for (const level of LEVELS) {
    for (const { place } of PLACES) {
      const at = visitorsAt(place, level);
      assert.ok(!(at.butterfly && at.chest), place);
      assert.equal(at.basket, level >= 6);
    }
  }
  assert.ok(PLACES.some(({ place }) => visitorsAt(place, 5).butterfly));
  assert.ok(PLACES.some(({ place }) => visitorsAt(place, 7).chest));
  // Two webs from level 8: the spiders take turns between them, and twins share one.
  const two = spidersFor(5, 8, () => 0.3);
  assert.deepEqual(new Set(two.map(({ web }) => web)), new Set([0, 1]));
  for (const plan of two.filter(({ behind }) => behind)) assert.equal(plan.web, two[two.indexOf(plan) - 1].web);
  assert.ok(spidersFor(5, 7, () => 0.3).every(({ web }) => web === 0));
  // A leaf boat at every place from level 9, and a golden spider at every place at 10, whatever else
  // is there. A boat's spider is never shy or asleep.
  for (const level of [9, 10]) {
    for (const { place, count } of placesAt(level)) {
      const plans = spidersFor(count, level, () => 0.3, visitorsAt(place, level));
      assert.ok(plans.some(({ kind }) => kind === 'boat'), `${place} at ${level}`);
      assert.ok(plans.filter(({ kind }) => kind === 'boat').every(({ shy, sleepy: asleep }) => !shy && !asleep));
      if (level === 10) assert.equal(plans.filter(({ golden }) => golden).length, 1, `${place} at ${level}`);
      if (visitorsAt(place, level).ladybird) assert.equal(plans.filter(({ kind }) => kind === 'ladybird').length, 1);
    }
  }
  assert.ok(spidersFor(5, 8, () => 0.3).every(({ kind }) => kind !== 'boat'));
  assert.equal(spidersFor(5, 10, () => 0.3).filter(({ golden }) => golden).length, 1);
  assert.ok(spidersFor(5, 9, () => 0.3).every(({ golden }) => !golden));
  // A boat's path goes along the bottom of the garden, never faster than the level allows.
  const boat = pathFor({ kind: 'boat', centre: spotFor(2), phase: 0, level: 9 });
  let fastest = 0;
  let last = spiderAt(boat, 0);
  for (let t = 0.01; t < 40; t += 0.01) {
    const at = spiderAt(boat, t);
    fastest = Math.max(fastest, Math.hypot(at.x - last.x, at.y - last.y) / 0.01);
    last = at;
  }
  assert.ok(fastest <= gardenAt(9).speed * 1.001);
});

test('helpers and prizes are gentle: generous to pick up, short holds, and nobody stuck', () => {
  assert.ok(BERRY.pickPalms >= 1.3 && BERRY.pullRange >= 0.25);
  assert.ok(WAKE_SECONDS <= 0.8 && CHEST_SECONDS <= 0.8);
  // A sleepy spider wakes by itself, so it can never hold a place up.
  assert.ok(SLEEP_MOST <= 15);
  // The butterfly only ever slows the spiders down, for a few seconds.
  assert.ok(BUTTERFLY.slow > 0 && BUTTERFLY.slow < 1 && BUTTERFLY.seconds <= 10);
  assert.equal(BASKET_HOLDS, 2);
});

test('each level is a little harder than the one before, and nothing is easier', () => {
  const harder = {
    more, atOnce: more, speed: more, wander: more, swing: more, twist: more, webSway: more, shy: more, pairs: more,
    berries: more, ladybird: more, sleepy: more, butterfly: more, basket: more, chest: more, webs: more, boats: more, golden: more,
  };
  for (const level of LEVELS.slice(1)) {
    const [before, now] = [gardenAt(level - 1), gardenAt(level)];
    let harderIn = 0;
    for (const [key, score] of Object.entries(harder)) {
      assert.ok(score(now[key]) >= score(before[key]) - 1e-9, `level ${level} is easier in ${key}`);
      if (score(now[key]) > score(before[key]) + 1e-9) harderIn += 1;
    }
    assert.ok(harderIn > 0, `level ${level} is no harder than ${level - 1}`);
  }
  assert.deepEqual(Object.keys(gardenAt(1)).sort(), Object.keys(harder).sort());
  // New things to deal with from about level 4.
  assert.ok(gardenAt(4).webSway > 0);
  assert.ok(gardenAt(5).shy > 0);
  assert.ok(gardenAt(7).pairs > 0);
  void less;
});

// How long there is to catch a spider going past a hand held still: across the catching circle, at the
// fastest it goes. The palm is about 0.105 of the screen's height.
const reactSeconds = (level) => (2 * (0.105 * CATCH_REACH + SPIDER_SIZE)) / gardenAt(level).speed;

// A spider takes about 5 seconds to catch, carry and let in at level 1. Faster, twistier paths, a web that
// sways and shy spiders each add a little, by these guesses, and more out at once and twins take a
// little off, as there's always one nearer.
function gardenLoad(level) {
  const at = gardenAt(level);
  const first = gardenAt(1);
  const spiderSeconds = 5
    + 1.2 * (at.speed / first.speed - 1)
    + 0.15 * (at.twist - 1)
    + 3 * at.webSway
    + 0.8 * at.shy
    - 0.15 * (at.atOnce - first.atOnce)
    - 0.1 * at.pairs
    // Waking a sleepy spider takes an open hand held by it a moment, and two webs a moment's choosing.
    + 0.8 * at.sleepy
    + 0.3 * (at.webs - 1);
  // Opening a treasure chest, and touching the butterfly, take a moment at the places they're at. The
  // basket saves a trip across and back at each place, which is about half of a spider's 5 seconds.
  const extras = PLACES.reduce((sum, { place }) => {
    const visitors = visitorsAt(place, level);
    return sum + (visitors.chest ? 2 : 0) + (visitors.butterfly ? 1 : 0) - (visitors.basket ? 2.5 : 0);
  }, 0);
  const spiders = placesAt(level).reduce((sum, { count }) => sum + count, 0);
  // About two seconds from one place to the next, and the last thank-you.
  const seconds = spiders * spiderSeconds + (PLACES.length - 1) * 2 + 2.4 + extras;
  return { seconds, perMinute: (spiders / seconds) * 60, reactSeconds: reactSeconds(level) };
}

test('level 10 is still within reach: 70% of the time to react, not twice the moves, at most a third longer', () => {
  const [first, last] = [gardenLoad(1), gardenLoad(10)];
  assert.ok(last.reactSeconds >= first.reactSeconds * 0.7, `${last.reactSeconds} against ${first.reactSeconds}`);
  assert.ok(last.perMinute <= first.perMinute * 2);
  assert.ok(last.seconds <= first.seconds * 1.34, `${last.seconds} against ${first.seconds}`);
  // Nothing at any level is quicker than level 1 by more than that.
  for (const level of LEVELS) assert.ok(gardenAt(level).speed <= gardenAt(1).speed / 0.7);
});

/* ---------- words and files ---------- */

test('the talking is short, and everything said has a voice in both languages', () => {
  const folder = new URL('../../games/spider-catcher/audio/voice/', import.meta.url);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder)));
  assert.ok(lines.length <= 12, 'only a few voice files');
  const source = ['main.js', 'spiders.js'].map((file) => readFileSync(new URL(`../../games/spider-catcher/${file}`, import.meta.url), 'utf8')).join('\n');
  for (const { id, text, ka } of lines) {
    assert.ok(text.split(/\s+/).length <= 10, `too long: ${text}`);
    assert.match(ka, /[Ⴀ-ჿ]/, id);
    for (const language of ['en', 'ka']) assert.ok(existsSync(new URL(`${language}/${id}.ogg`, folder)), `${language}/${id}`);
    assert.ok(source.includes(text), `nothing says: ${text}`);
  }
  // Every place's words have a voice.
  const said = new Set(lines.map(({ text }) => text));
  for (const { hello, done } of PLACES) {
    assert.ok(said.has(hello), hello);
    if (done) assert.ok(said.has(done), done);
  }
});

test('the rules have no screen in them, so they can run here', () => {
  const rules = readFileSync(new URL('../../games/spider-catcher/spiders.js', import.meta.url), 'utf8');
  assert.doesNotMatch(rules, /document|window\.|canvas/);
});
