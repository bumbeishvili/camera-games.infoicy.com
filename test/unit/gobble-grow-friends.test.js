// Gobble and Grow with friends: two, three and four games, each with its own soup, wired together through the
// room's real rules (server/race-room.js), as games/gobble-grow/main.js wires them: together, each game claims the
// things its creature gobbles, and the room says whose each one is, and against each other, nothing is shared but
// where everyone's creature is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mostIn, RaceRoom } from '../../server/race-room.js';
import { FIELD, radiusAt, Soup, teamGoal } from '../../games/gobble-grow/rules.js';
import { DT, goodPlayer } from './gobble-player.js';

const IDS = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd'];

/**
 * So many children in one game. Each has a soup, and hears what the room passes on, as their game would. together
 * is what whoever made the game chose. The room's messages arrive at once here: delay(ms) holds one child's back.
 */
function makeGame(count, { together = true, bites = 8, level = 3, seed = 4242 } = {}) {
  const players = [];
  let clock = 1000;
  const rules = new RaceRoom({ players: () => players.map((each) => each.seat) }, () => clock);
  const children = IDS.slice(0, count).map((id) => {
    const child = { id, soup: null, heard: [], held: [], late: 0, eaterOf: new Map() };
    child.seat = {
      meta: null,
      setMeta(meta) {
        this.meta = meta;
      },
      send(message) {
        child.heard.push(message);
        if (child.late > 0) child.held.push(message);
        else child.hear(message);
      },
    };
    child.say = (message) => rules.hear(child.seat, JSON.stringify(message));
    child.hear = (message) => {
      if (message.t === 'go') {
        child.go = message;
        child.soup = new Soup({
          level: message.level,
          bites: message.length,
          // The room's seed is by chance, and the same for everyone: these tests lay the things out the same way
          // every time they're run, so that what they find doesn't come and go.
          seed,
          team: message.team ? message.racers.length : 0,
          // As main.js does: together, each thing gobbled is claimed, and the room says whose it is.
          onEvent: (event) => {
            if (event.type === 'gulp' && message.team) child.say({ t: 'claim', k: event.food.id });
            if (event.type === 'won') child.wonAt = clock;
          },
        });
      } else if (message.t === 'claimed' && child.go?.team) {
        const theirs = child.eaterOf.get(message.by);
        child.soup.claimed(message.k, message.by === child.id, theirs ? { x: theirs.x * FIELD.wide, y: theirs.y } : null);
      } else if (message.t === 'eater') {
        child.eaterOf.set(message.from, message);
      }
    };
    /** What was held back from this child arrives. */
    child.catchUp = () => {
      child.late = 0;
      for (const message of child.held.splice(0)) child.hear(message);
    };
    players.push(child);
    clock += 10;
    assert.ok(rules.arrive(child.seat, id, null, { most: mostIn('gobble-grow') }));
    return child;
  });
  children[0].say({ t: 'hi', name: 'Ana', driver: 'giraffe', level, length: bites, team: together ? 1 : 0 });
  for (const child of children) child.say({ t: 'ready' });
  for (const child of children) assert.ok(child.soup, 'everyone\'s game has started');
  let frames = 0;
  /** Everyone plays for so long, each as play(child) says, all going by the same clock since "GO!". */
  const playFor = (seconds, play) => {
    const moves = children.map((child) => play(child));
    for (let t = 0; t < seconds; t += DT) {
      clock += DT * 1000;
      frames += 1;
      // Nobody's game is always the first to be heard: whose frame comes first goes round.
      for (let turn = 0; turn < children.length; turn += 1) {
        const index = (turn + frames) % children.length;
        const child = children[index];
        child.soup.update(DT, { open: false, seen: true, steer: { x: 0, y: 0 }, ...moves[index]() }, (clock - 1000) / 1000);
        const { creature } = child.soup;
        // Where their creature is, about 10 times a second, as their game sends it.
        if (frames % 6 === 0) child.say({ t: 'eater', ms: clock - 1000, x: creature.x / FIELD.wide, y: creature.y, m: 0, n: child.soup.eaten, v: 1 });
      }
    }
  };
  return { children, playFor, rules };
}

const playing = (child) => goodPlayer(child.soup);
// Each keeping to their own part of the soup, as children do, rather than all going for the same thing at once.
const spreadOut = (children) => (child) => goodPlayer(child.soup, { near: { x: (FIELD.wide * (children.indexOf(child) + 1)) / (children.length + 1), y: 0.56 } });
const resting = () => () => ({});

test('together, everyone has the same things to eat, and as much as each would have alone, all added up', () => {
  for (const count of [2, 3, 4]) {
    const { children } = makeGame(count, { bites: 12 });
    for (const child of children) {
      assert.equal(child.soup.together, true);
      assert.equal(child.soup.goal, 12 * count, 'as much as each would have alone, all added up');
      assert.equal(child.soup.goal, teamGoal(12, count));
      assert.ok(Number.isInteger(child.go.seed));
      assert.equal(child.go.seed, children[0].go.seed, 'the room gives everyone the same seed');
      assert.equal(child.soup.level, 3, 'the world of whoever made the game');
    }
  }
});

test('together, two mouths going for the same thing: the room gives it to one, it counts once for both, and the other\'s mouth is empty', () => {
  const { children, playFor } = makeGame(2);
  const [ana, ben] = children;
  // Both sit on the same thing with their mouths shut, as it's the nearest to both.
  playFor(4, playing);
  // Both go for the nearest thing they can eat, which is the same one, as their creatures are in the same place.
  const steady = (child) => {
    const play = goodPlayer(child.soup, { holdFor: 30 });
    return () => ({ ...play(), open: false });
  };
  playFor(3, steady);
  const [mine, theirs] = [ana.soup.target, ben.soup.target];
  assert.ok(mine && theirs, 'each has something in reach');
  assert.equal(mine.id, theirs.id, 'and it\'s the same thing');
  const before = { total: ana.soup.total, ana: ana.soup.eaten, ben: ben.soup.eaten };
  assert.equal(before.total, ben.soup.total);
  // Both open at the same moment, and what the room says takes a moment to reach them: it's in both mouths.
  ana.late = 1;
  ben.late = 1;
  playFor(0.1, () => () => ({ open: true }));
  assert.equal(ana.soup.creature.holding?.id, mine.id);
  assert.equal(ben.soup.creature.holding?.id, mine.id, 'as far as each game knows, its own child has it');
  ana.catchUp();
  ben.catchUp();
  // Whichever game reached the room first, it's that child's, and everyone is told so once.
  const claimed = ana.heard.filter(({ t, k }) => t === 'claimed' && k === mine.id);
  assert.equal(claimed.length, 1);
  assert.deepEqual(ben.heard.filter(({ t, k }) => t === 'claimed' && k === mine.id), claimed);
  const [winner, loser] = claimed[0].by === ana.id ? [ana, ben] : [ben, ana];
  assert.equal(ana.soup.total, before.total + 1);
  assert.equal(ben.soup.total, before.total + 1, 'one more bite for the creature they share, and only one');
  assert.equal(winner.soup.eaten + loser.soup.eaten, before.ana + before.ben + 1);
  assert.equal(winner.soup.creature.holding?.id, mine.id, 'still in the mouth of the one whose it is, until it shuts');
  assert.equal(loser.soup.creature.holding, null, 'and out of the other\'s');
  assert.ok(!loser.soup.foods.some((food) => food.id === mine.id && food.state === 'drift'), 'and gone from their soup');
  assert.equal(ana.soup.creature.r, ben.soup.creature.r);
});

test('together, a slow connection doesn\'t count a bite twice or lose one', () => {
  const { children, playFor } = makeGame(2, { bites: 8 });
  const [ana, ben] = children;
  // What the room tells Ben arrives late: two seconds of it at a time.
  for (let round = 0; round < 40 && !ana.soup.won; round += 1) {
    ben.late = 1;
    playFor(2, playing);
    ben.catchUp();
  }
  ben.catchUp();
  assert.equal(ana.soup.phase, 'won');
  assert.equal(ben.soup.phase, 'won');
  assert.equal(ana.soup.total, ben.soup.total);
  const claims = new Set(ana.heard.filter(({ t }) => t === 'claimed').map(({ k }) => k));
  assert.equal(claims.size, ana.heard.filter(({ t }) => t === 'claimed').length, 'each thing was claimed once');
  assert.ok(ana.soup.eaten + ben.soup.eaten >= ana.soup.goal);
});

for (const count of [2, 3, 4]) {
  test(`together, ${count} children eat from one soup and grow as one, and the world is won for all of them at once`, () => {
    const { children, playFor } = makeGame(count, { bites: 8 });
    const goal = teamGoal(8, count);
    let seconds = 0;
    const play = spreadOut(children);
    const moves = new Map(children.map((child) => [child, play(child)]));
    while (!children.every((child) => child.soup.won) && seconds < 300) {
      playFor(1, (child) => moves.get(child));
      seconds += 1;
      // Everyone's creature is the same size all the way, as it's everyone's bites that grow it.
      const sizes = new Set(children.map((child) => child.soup.creature.r));
      assert.equal(sizes.size, 1, `after ${seconds} s`);
      assert.equal(children[0].soup.creature.r, radiusAt(children[0].soup.total / goal));
    }
    assert.ok(children.every((child) => child.soup.won), `won after ${seconds} s`);
    const eaten = children.map((child) => child.soup.eaten);
    assert.equal(eaten.reduce((sum, each) => sum + each, 0), goal, `their bites add up: ${eaten.join(' + ')}`);
    assert.ok(eaten.every((each) => each >= 1), 'and everyone had some');
    // Won on the same bite, so at the same moment.
    assert.equal(new Set(children.map((child) => child.wonAt)).size, 1);
    assert.ok(children.every((child) => child.soup.total === goal));
  });
}

test('together, a child who rests costs nobody anything: the others eat, and everyone grows', () => {
  const { children, playFor } = makeGame(3, { bites: 8 });
  const [ana, ben, cal] = children;
  for (let second = 0; second < 300 && !ana.soup.won; second += 1) playFor(1, (child) => (child === cal ? resting() : playing(child)));
  assert.ok([ana, ben, cal].every((child) => child.soup.won));
  assert.equal(cal.soup.eaten, 0);
  assert.equal(cal.soup.creature.r, ana.soup.creature.r, 'the one who rested is as big as the others');
  assert.equal(ana.soup.eaten + ben.soup.eaten, teamGoal(8, 3));
});

test('together, a friend who has gone takes their share of what there was to eat with them', () => {
  const { children, playFor } = makeGame(2, { bites: 8 });
  const [ana] = children;
  playFor(4, (child) => (child === ana ? playing(child) : resting()));
  const { total } = ana.soup;
  assert.ok(total >= 1 && total < 8, `${total} eaten`);
  assert.equal(ana.soup.goal, 16);
  // As main.js does when a friend has gone for good.
  ana.soup.teamOf(1);
  assert.equal(ana.soup.goal, 8);
  assert.equal(ana.soup.creature.r, radiusAt(total / 8));
  // Never fewer than have been eaten already: there's always one more bite to win it with.
  const late = makeGame(2, { bites: 8 }).children[0];
  for (let k = 0; k < 12; k += 1) late.soup.claimed(500 + k, true);
  late.soup.teamOf(1);
  assert.equal(late.soup.goal, 13);
  assert.equal(late.soup.phase, 'play');
});

test('against each other, each has the same things in their own soup, nothing is claimed, and each wins in their own time', () => {
  for (const count of [2, 4]) {
    const { children, playFor } = makeGame(count, { together: false, bites: 8 });
    const [ana, ben] = children;
    for (const child of children) {
      assert.equal(child.soup.together, false);
      assert.equal(child.soup.goal, 8, 'as much as whoever made the game chose, each');
      assert.equal(child.go.seed, ana.go.seed);
    }
    // Ana plays, and the rest only watch: what she eats is still there for them.
    playFor(10, (child) => (child === ana ? playing(child) : resting()));
    assert.ok(ana.soup.eaten >= 3);
    assert.equal(ben.soup.eaten, 0);
    assert.equal(ben.soup.total, 0);
    assert.equal(ana.heard.filter(({ t }) => t === 'claimed').length, 0);
    for (const eaten of ana.soup.gone) {
      assert.ok(!ben.soup.gone.has(eaten));
    }
    // Everyone sees where the others are, and how much they've eaten.
    const seen = ben.eaterOf.get('aaaaaaaa');
    assert.equal(seen.n, ana.soup.eaten);
    assert.ok(seen.x > 0 && seen.x < 1 && seen.y > 0 && seen.y < 1);
    for (let second = 0; second < 300 && !children.every((child) => child.soup.won); second += 1) playFor(1, playing);
    assert.ok(children.every((child) => child.soup.won));
    assert.ok(ana.wonAt < ben.wonAt, 'the one who started first is first to grow up');
    assert.ok(children.every((child) => child.soup.eaten === 8));
  }
});
