// Rooftop Rope with friends: two, three and four games, each with its own rules and its own child, talking to
// each other only through the server's own rules (server/race-room.js), as they do on their own computers. No
// browser here: each child lifts a foot as the test says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBalancer, mostIn, RaceRoom } from '../../server/race-room.js';
import { seededRandom, Track } from '../../core/friends.js';
import { Walk } from '../../games/rooftop-rope/walk.js';
import { Mate, SENT_MOST, finishMessage, mateRopes, scoreRows, teamStars, walkerMessage } from '../../games/rooftop-rope/team.js';
import { STEP, measuredLifter, valueFor } from './rope-walker.js';

const SEND_EVERY = 0.1;

/**
 * A crossing with friends, from making it to "GO!". children says what each child does with their feet: a
 * function of their game and the seconds since "GO!", giving { foot, share } or null for both feet down, in the
 * order they joined. together is the host's choice. The ropes are laid out from seed, so that a test crosses
 * the same ropes every time.
 */
function makeCrossing(children, { together = true, ropes = 4, level = 3, hold = 'short', seed = 7, settings = [] } = {}) {
  const players = [];
  let clock = 1000;
  const rules = new RaceRoom({ players: () => players.map(({ socket }) => socket).filter((socket) => socket.meta) }, () => clock);
  children.forEach((feet, index) => {
    const socket = {
      meta: null,
      heard: [],
      setMeta(meta) {
        this.meta = meta;
      },
      send(message) {
        this.heard.push(message);
      },
    };
    const id = `player${index}aa`;
    players.push({ id, socket, feet, read: 0, sentAt: -Infinity, events: [], results: new Map(), game: null, mates: [], value: 0, lifter: measuredLifter(), finishedAt: null, furthest: 0 });
    clock += 10;
    assert.equal(rules.arrive(socket, id, null, { most: mostIn('rooftop-rope') }), true);
  });
  const say = (player, message) => rules.hear(player.socket, JSON.stringify(message));
  for (const player of players) say(player, { t: 'hi', name: player.id, driver: 'giraffe', level, length: ropes, mode: hold, team: together ? 1 : 0 });
  for (const player of players) say(player, { t: 'ready' });
  const go = players[0].socket.heard.filter(({ t }) => t === 'go').at(-1);
  assert.ok(go, 'the crossing started');
  const team = Boolean(go.team);
  let seconds = 0;
  players.forEach((player, index) => {
    player.mates = players.filter((other) => other !== player).map((other) => new Mate({ id: other.id, spec: { name: other.id } }));
    player.value = player.lifter.zero;
    player.game = new Walk({
      level: go.level,
      ropes: go.length,
      hold: go.mode,
      random: seededRandom(seed ?? go.seed),
      plain: true,
      team,
      lifter: player.lifter,
      // Each child's own legs and their own fall, as a grown-up chose on their computer.
      ...(settings[index] ?? {}),
      onEvent: (event) => {
        player.events.push(event);
        // As the page does: where the walker is one last time, and then the finish, told to everyone.
        if (event.type !== 'finished') return;
        player.finishedAt = seconds;
        say(player, { t: 'balancer', ms: Math.round(seconds * 1000), ...walkerMessage(player.game) });
        say(player, { t: 'done', ms: Math.round(seconds * 1000), ...finishMessage(player.game) });
      },
    });
    player.game.begin();
  });

  const step = () => {
    seconds += STEP;
    clock += STEP * 1000;
    for (const player of players) {
      if (player.left) continue;
      // What has come from the others since last time.
      for (const message of player.socket.heard.slice(player.read)) {
        if (message.t === 'done') player.results.set(message.from, { ms: message.ms, won: message.w !== 0, dropped: message.n });
        else player.mates.find(({ friend }) => friend.id === message.from)?.hear(message, clock);
      }
      player.read = player.socket.heard.length;
      if (player.game.state === 'finished') continue;
      // Feet take a moment to get where they're going, as real ones do.
      const want = player.feet(player.game, seconds);
      const target = want ? valueFor(player.lifter, want.foot, want.share) : player.lifter.zero;
      player.value += (target - player.value) * (1 - Math.exp(-6 * STEP));
      player.lifter.update(player.value, STEP);
      player.game.update(STEP, player.lifter, mateRopes(player.mates));
      player.furthest = Math.max(player.furthest, player.game.index);
      if (seconds - player.sentAt >= SEND_EVERY && player.game.state !== 'finished') {
        player.sentAt = seconds;
        say(player, { t: 'balancer', ms: Math.round(seconds * 1000), ...walkerMessage(player.game) });
      }
    }
  };
  const runFor = (time) => {
    for (let i = 0; i < Math.round(time / STEP); i += 1) step();
  };
  const runUntil = (done, most = 600) => {
    while (!done() && seconds < most) step();
    // And a moment more, for the last thing said to reach everyone.
    for (let i = 0; i < 6; i += 1) step();
  };
  const leave = (player) => {
    player.left = true;
    rules.leave(player.socket);
    for (const other of players) for (const mate of other.mates) if (mate.friend.id === player.id) mate.gone = true;
  };
  return { players, team, go, step, runFor, runUntil, leave, seconds: () => seconds, now: () => clock };
}

/** A child who lifts the foot the rope asks for, after resting so long on every rooftop. */
const keen = (rest = 0.5, share = 1.05) => (game) => {
  if (game.state !== 'roof' && game.state !== 'rope') return null;
  if (game.state === 'roof' && game.idle < rest) return null;
  return { foot: game.asked, share };
};
/** A child who never lifts a foot. */
const resting = () => null;
const allDone = (players) => () => players.every(({ game, left }) => left || game.state === 'finished');

test('what a game tells friends about a walker is only numbers, as the server keeps them', () => {
  const lifter = measuredLifter();
  const game = new Walk({ level: 3, ropes: 4, hold: 'short', random: seededRandom(4), plain: true, lifter });
  game.begin();
  const child = keen(0);
  let value = lifter.zero;
  const seen = [];
  for (let i = 0; i < 600 && game.state !== 'finished'; i += 1) {
    const want = child(game);
    value += ((want ? valueFor(lifter, want.foot, want.share) : lifter.zero) - value) * (1 - Math.exp(-6 * STEP));
    lifter.update(value, STEP);
    game.update(STEP, lifter);
    const message = walkerMessage(game);
    seen.push(message);
    assert.deepEqual(Object.keys(message), ['a', 'u', 'w', 'g', 'f', 'n', 'c', 'd']);
    // Which foot is up: less than nothing for the left, more for the right.
    assert.equal(message.g, { left: -1, right: 1 }[game.foot] ?? 0);
    assert.ok(Object.values(message).every((each) => typeof each === 'number' && Number.isFinite(each)), JSON.stringify(message));
    // The server passes it on just as it came: nothing in it is over what the server allows, or finer.
    const { ms, ...cleaned } = cleanBalancer({ ms: 0, ...message });
    assert.equal(ms, 0);
    assert.deepEqual(cleaned, message);
  }
  assert.equal(game.state, 'finished');
  assert.ok(seen.some(({ g }) => g === -1) && seen.some(({ g }) => g === 1), 'each foot was up at some time');
  assert.ok(seen.some(({ a }) => a > 1 && a < 2), 'on the second rope');
  assert.deepEqual([seen.at(-1).a, seen.at(-1).d, seen.at(-1).c], [4, 1, 4], 'at the end: past the last rope, done, and all four crossed');
  assert.ok(seen.at(-1).n > 0, 'with stars');
  // The most a game sends is the most the server keeps.
  assert.deepEqual(cleanBalancer({ a: 99, u: 99, n: 9999, c: 99 }), { ms: 0, a: SENT_MOST.a, u: SENT_MOST.u, w: 0, g: 0, f: 0, n: SENT_MOST.n, c: SENT_MOST.c, d: 0 });
});

test('with friends everyone crosses the host’s ropes: their level, how many and how long, with the stars and nothing else', () => {
  const { players, go } = makeCrossing([keen(), keen()], { level: 9, ropes: 8, hold: 'long', settings: [{ which: 'turns' }, { which: 'any', wobble: 'never' }] });
  assert.deepEqual([go.level, go.length, go.mode, go.team], [9, 8, 'long', 1]);
  const [ana, ben] = players.map(({ game }) => game);
  assert.equal(ana.plan.ropes.length, 8);
  // The same ropes for both, each as long, with the same stars at the same places.
  assert.deepEqual(ana.plan.ropes.map(({ seconds, things, long, climb }) => ({ seconds, things, long, climb })), ben.plan.ropes.map(({ seconds, things, long, climb }) => ({ seconds, things, long, climb })));
  assert.ok(ana.plan.ropes.every(({ things, long, climb }) => !long && !climb && things.length === 3 && things.every(({ kind }) => kind === 'star')), 'the plain rope with its stars, even at level 9');
  // Each child's own legs: one takes turns, the other lifts whichever foot they like.
  assert.ok(ana.plan.ropes.every(({ leg }) => leg === 'left' || leg === 'right'));
  assert.ok(ben.plan.ropes.every(({ leg }) => leg === 'any'));
});

test('together, whoever is in front waits on each rooftop for the others, everyone gets there, and the stars are added up', () => {
  const { players, runUntil, step, seconds } = makeCrossing([keen(0.3), keen(4, 0.6)], { together: true });
  const [quick, slow] = players;
  let furthestApart = 0;
  let waited = 0;
  while (!allDone(players)() && seconds() < 400) {
    step();
    furthestApart = Math.max(furthestApart, quick.game.index - slow.game.index);
    // On a rooftop with a foot up, and not going: held there for the friend who's behind.
    if (quick.game.state === 'roof' && quick.game.gliding) waited += STEP;
  }
  runUntil(allDone(players));
  assert.ok(players.every(({ game }) => game.state === 'finished'), 'both got to the last rooftop');
  assert.equal(furthestApart, 1, 'never more than a rooftop in front');
  assert.ok(waited > 3, `the quick one waited for the slow one, ${waited.toFixed(1)} seconds in all`);
  assert.ok(slow.finishedAt - quick.finishedAt < 12, `they finished close together: ${quick.finishedAt.toFixed(1)} and ${slow.finishedAt.toFixed(1)} seconds`);
  // Each game adds the stars up the same.
  const stars = quick.game.stats.stars + slow.game.stats.stars;
  assert.equal(stars, 24, 'every star on four ropes, for both');
  assert.equal(teamStars(quick.game, quick.mates), stars);
  assert.equal(teamStars(slow.game, slow.mates), stars);
  // And each hears how the other did.
  assert.deepEqual(quick.results.get(slow.id), { ms: Math.round(slow.finishedAt * 1000), won: true, dropped: slow.game.stats.stars });
  assert.deepEqual(slow.results.get(quick.id), { ms: Math.round(quick.finishedAt * 1000), won: true, dropped: quick.game.stats.stars });
  const rows = scoreRows(quick.game, quick.mates, true);
  assert.deepEqual(rows.map(({ count }) => count), [12, 12]);
  assert.equal(rows[0].you, true, 'level on stars, this child is named first');
});

test('against each other nobody waits: the quicker child is first to the last rooftop, and is placed first on both computers', () => {
  const { players, runUntil, runFor } = makeCrossing([keen(4, 0.6), keen(0.3)], { together: false });
  const [slow, quick] = players;
  assert.equal(players[0].game.team, false);
  runFor(18);
  // Two ropes in front, which crossing together never lets happen.
  assert.ok(quick.game.index > slow.game.index + 1 && quick.game.state !== 'finished', `the quick one is well in front: on rope ${quick.game.index} to ${slow.game.index}`);
  assert.deepEqual(scoreRows(quick.game, quick.mates, false).map(({ name, count }) => [name, count]), [['You', 1], [slow.id, 2]]);
  assert.deepEqual(scoreRows(slow.game, slow.mates, false).map(({ name, count }) => [name, count]), [[quick.id, 1], ['You', 2]]);
  runUntil(allDone(players));
  assert.ok(players.every(({ game }) => game.state === 'finished'), 'everyone walks on to the end');
  assert.ok(quick.finishedAt < slow.finishedAt - 10, `${quick.finishedAt.toFixed(1)} and ${slow.finishedAt.toFixed(1)} seconds`);
  assert.equal(slow.results.get(quick.id).ms, Math.round(quick.finishedAt * 1000));
  assert.equal(quick.results.get(slow.id).ms, Math.round(slow.finishedAt * 1000));
  // Once both are there, the one who got there first is still first.
  assert.equal(scoreRows(quick.game, quick.mates, false)[0].you, true);
});

test('a friend who never lifts a foot holds the others on their rooftop, together, until they leave: then the crossing goes on', () => {
  const { players, runFor, runUntil, leave } = makeCrossing([keen(0.3), resting], { together: true, settings: [{}, { wobble: 'never' }] });
  const [keenOne, restingOne] = players;
  runFor(30);
  // One rope on, and waiting there. Nobody is in a hurry, and nothing is lost.
  assert.equal(keenOne.game.index, 1);
  assert.equal(keenOne.game.state, 'roof');
  assert.equal(keenOne.game.stats.falls, 0);
  assert.equal(restingOne.game.index, 0);
  leave(restingOne);
  runUntil(() => keenOne.game.state === 'finished');
  assert.equal(keenOne.game.state, 'finished', 'with the friend gone, on to the last rooftop');
  assert.equal(teamStars(keenOne.game, keenOne.mates), keenOne.game.stats.stars, 'and a friend who left takes their stars with them');
  assert.deepEqual(scoreRows(keenOne.game, keenOne.mates, true).map(({ name }) => name), ['You']);
});

test('a friend’s walker lifts the foot their child has up, and a friend who leaves takes their stars with them', () => {
  // One child crosses every rope on the left foot, and the other on the right.
  const { players, step, now, leave, seconds } = makeCrossing([keen(0.3), keen(0.3)], { together: false, settings: [{ which: 'lift', side: 'left' }, { which: 'lift', side: 'right' }] });
  const [lefty, righty] = players;
  const drawn = { lefty: new Set(), righty: new Set() };
  while (seconds() < 9) {
    step();
    // Each on the other's screen, a moment behind.
    const hers = righty.mates[0].placeAt(now());
    const his = lefty.mates[0].placeAt(now());
    if (hers?.foot) drawn.lefty.add(hers.foot);
    if (his?.foot) drawn.righty.add(his.foot);
  }
  assert.deepEqual([...drawn.lefty], ['left']);
  assert.deepEqual([...drawn.righty], ['right']);
  // Both have stars by now. Crossing together they'd be added up, until one of them goes.
  assert.ok(lefty.game.stats.stars >= 3 && righty.game.stats.stars >= 3);
  assert.equal(teamStars(lefty.game, lefty.mates), lefty.game.stats.stars + righty.game.stats.stars);
  leave(righty);
  assert.equal(teamStars(lefty.game, lefty.mates), lefty.game.stats.stars);
});

test('three and four cross together, each at their own pace, and all get there', () => {
  for (const count of [3, 4]) {
    const children = [keen(0.3), keen(2, 0.7), keen(1, 1.3), keen(3, 0.5)].slice(0, count);
    const { players, runUntil } = makeCrossing(children, { together: true, ropes: 4 });
    runUntil(allDone(players));
    assert.ok(players.every(({ game }) => game.state === 'finished'), `${count} children all got there`);
    const stars = players.reduce((sum, { game }) => sum + game.stats.stars, 0);
    for (const player of players) assert.equal(teamStars(player.game, player.mates), stars);
    const times = players.map(({ finishedAt }) => finishedAt);
    assert.ok(Math.max(...times) - Math.min(...times) < 14, `finished close together: ${times.map((time) => time.toFixed(1)).join(', ')}`);
  }
  assert.equal(mostIn('rooftop-rope'), 4);
});

test('a friend’s walker is drawn where their game says, a moment behind: along its rope with its foot up, and back at the start at once after a fall', () => {
  const mate = new Mate({ id: 'friend', spec: { name: 'Ben' } });
  assert.equal(mate.placeAt(1000), null, 'nothing to draw before anything has come');
  assert.deepEqual(mateRopes([mate]), [], 'and nobody to wait for');
  const message = (ms, a, more = {}) => ({ t: 'balancer', from: 'friend', ms, a, u: 1, w: 0, g: 1, f: 0, n: 0, c: 0, d: 0, ...more });
  // Half way along the second rope, and gliding on.
  for (let i = 0; i <= 10; i += 1) mate.hear(message(i * 100, 1.3 + i * 0.02, { n: 2, c: 1 }), 5000 + i * 100);
  const shown = mate.placeAt(6000 + 100);
  assert.equal(shown.index, 1);
  assert.ok(shown.progress > 0.3 && shown.progress <= 0.5, `along the rope: ${shown.progress}`);
  assert.deepEqual([shown.foot, shown.lift, shown.falling], ['right', 1, false]);
  assert.deepEqual([mate.stars, mate.crossed, mate.done], [2, 1, false]);
  assert.deepEqual(mateRopes([mate]), [{ index: 1, progress: mate.along % 1, gone: false }]);
  // Something that isn't a walker's message changes nothing.
  assert.equal(mate.hear({ t: 'rider', a: 3 }, 6200), false);
  assert.equal(mate.along, 1.5);
  // Into the net, and back at the start of that rope: it's shown there, not sliding back along the rope.
  mate.hear(message(1100, 1.5, { f: 1, g: 0, u: 0 }), 6100);
  mate.hear(message(4000, 1, { g: 0, u: 0 }), 9000);
  const back = mate.placeAt(9000 + new Track({}).delay + 1);
  assert.deepEqual([back.index, back.progress, back.foot], [1, 0, null]);
  // At the last rooftop they're past every rope, and nobody waits for them.
  mate.hear(message(9000, 4, { d: 1, c: 4, n: 12 }), 14_000);
  assert.equal(mate.done, true);
  assert.deepEqual(mateRopes([mate]), [{ index: Infinity, progress: 0, gone: false }]);
  // A friend who has gone isn't drawn.
  mate.gone = true;
  assert.equal(mate.placeAt(20_000), null);
});

test('what a finish says to friends: that the walker got there, and the stars it has', () => {
  const { players, runUntil } = makeCrossing([keen(0.2), keen(0.2)], { together: false, ropes: 4 });
  runUntil(allDone(players));
  for (const player of players) {
    assert.deepEqual(finishMessage(player.game), { w: 1, n: 12 });
    const done = player.socket.heard.filter(({ t }) => t === 'done');
    assert.equal(done.length, 1, 'one finish from the other child');
    assert.deepEqual([done[0].w, done[0].n], [1, 12]);
  }
  const unfinished = new Walk({ ropes: 4, random: seededRandom(2), plain: true });
  assert.deepEqual(finishMessage(unfinished), { w: 0, n: 0 });
});
