// Moto Mountain with friends: two, three and four games, each with its own rules and its own child, talking to
// each other only through the server's own rules (server/race-room.js), as they do on their own computers. No
// browser here: each child leans as the test says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRider, mostIn, RaceRoom } from '../../server/race-room.js';
import { seededRandom } from '../../core/friends.js';
import { BIKE, Leaner, Ride } from '../../games/moto-mountain/ride.js';
import { Mate, SENT_MOST, finishMessage, mateRoads, riderMessage, scoreRows, teamStars } from '../../games/moto-mountain/team.js';
import { STEP, angleFor } from './moto-rider.js';

const SEND_EVERY = 0.1;

/**
 * A ride with friends, from making it to "GO!". children says how each child leans: a function of their game
 * and the seconds since "GO!", giving the share of a whole lean they're trying for, in the order they joined.
 * together is the host's choice. The road is laid out from seed, so that a test rides the same road every time,
 * or with seed null from the number the server gives everyone, as the page does.
 */
function makeRide(children, { together = true, bends = 6, level = 4, pace = 'usual', seed = Number(process.env.MOTO_SEED ?? 7) } = {}) {
  const players = [];
  let clock = 1000;
  const rules = new RaceRoom({ players: () => players.map(({ socket }) => socket).filter((socket) => socket.meta) }, () => clock);
  children.forEach((lean, index) => {
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
    players.push({ id, socket, lean, read: 0, sentAt: -Infinity, events: [], results: new Map(), game: null, mates: [], body: 0, leaner: new Leaner(), finishedAt: null });
    clock += 10;
    assert.equal(rules.arrive(socket, id, null, { most: mostIn('moto-mountain') }), true);
  });
  const say = (player, message) => rules.hear(player.socket, JSON.stringify(message));
  for (const player of players) say(player, { t: 'hi', name: player.id, driver: 'giraffe', level, length: bends, mode: pace, team: together ? 1 : 0 });
  for (const player of players) say(player, { t: 'ready' });
  const go = players[0].socket.heard.filter(({ t }) => t === 'go').at(-1);
  assert.ok(go, 'the ride started');
  const team = Boolean(go.team);
  let seconds = 0;
  for (const player of players) {
    player.mates = players.filter((other) => other !== player).map((other) => new Mate({ id: other.id, spec: { name: other.id } }));
    player.game = new Ride({
      level: go.level,
      bends: go.length,
      pace: go.mode,
      random: seededRandom(seed ?? go.seed),
      plain: true,
      team,
      leaner: player.leaner,
      onEvent: (event) => {
        player.events.push(event);
        // As the page does: where the bike is one last time, and then the finish, told to everyone.
        if (event.type !== 'finished') return;
        player.finishedAt = seconds;
        say(player, { t: 'rider', ms: Math.round(seconds * 1000), ...riderMessage(player.game, 0) });
        say(player, { t: 'done', ms: Math.round(seconds * 1000), ...finishMessage(player.game) });
      },
    });
    player.game.begin();
  }

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
      if (player.game.state !== 'riding') continue;
      // A body takes a moment to get where it's going, as a real one does.
      const wanted = angleFor(player.leaner, Math.max(-1, Math.min(1, player.lean(player.game, seconds))));
      player.body += (wanted - player.body) * (1 - Math.exp(-5 * STEP));
      player.leaner.update(player.body, STEP);
      player.game.update(STEP, player.leaner, mateRoads(player.mates, clock));
      if (seconds - player.sentAt >= SEND_EVERY && player.game.state === 'riding') {
        player.sentAt = seconds;
        say(player, { t: 'rider', ms: Math.round(seconds * 1000), ...riderMessage(player.game, player.game.roll / BIKE.leanMost) });
      }
    }
  };
  const runFor = (time) => {
    for (let i = 0; i < Math.round(time / STEP); i += 1) step();
  };
  const runUntil = (done, most = 900) => {
    while (!done() && seconds < most) step();
    // And a moment more, for the last thing said to reach everyone.
    for (let i = 0; i < 6; i += 1) step();
  };
  const leave = (player) => {
    player.left = true;
    rules.leave(player.socket);
    for (const other of players) for (const mate of other.mates) if (mate.friend.id === player.id) mate.gone = true;
  };
  return { players, team, go, step, runFor, runUntil, leave, seconds: () => seconds };
}

/** A child who leans as the road asks, so many times as far. */
const keen = (skill = 1) => (game) => game.needAt(game.s + game.v * 0.25) * skill;
/** A child who never leans: their bike waits in every bend until it's helped round. */
const resting = () => 0;

test('what a game tells friends about a bike is only numbers, as the server keeps them', () => {
  const game = new Ride({ level: 3, bends: 6, random: seededRandom(4), plain: true });
  game.begin();
  const leaner = new Leaner();
  for (let i = 0; i < 300; i += 1) {
    leaner.update(angleFor(leaner, 0.4), STEP);
    game.update(STEP, leaner);
  }
  const message = riderMessage(game, game.roll / BIKE.leanMost);
  assert.deepEqual(Object.keys(message), ['s', 'x', 'l', 'h', 'v', 'n', 'c', 'w', 'd']);
  assert.ok(Object.values(message).every((value) => typeof value === 'number' && Number.isFinite(value)));
  // The server passes on exactly what was said, so nothing is lost on the way.
  const { ms, ...kept } = cleanRider({ ms: 1234, ...message });
  assert.equal(ms, 1234);
  assert.deepEqual(kept, message);
  assert.ok(message.s > 50 && message.l > 0.2 && message.v > 3, 'and it says where the bike is and how it leans');
  // A bike that's finished says so, and one that's waiting says that.
  game.finish();
  assert.equal(riderMessage(game, 0).d, 1);
  assert.ok(SENT_MOST.s >= 2500, 'the longest road fits in what can be said');
});

test('a friend’s bike is drawn where their game says, a moment behind, and carries on up the road if nothing comes', () => {
  const mate = new Mate({ id: 'a', spec: { name: 'Ana' } });
  assert.equal(mate.placeAt(1000, BIKE.leanMost), null, 'nothing before they have said anything');
  assert.equal(mate.hear({ t: 'rider', ms: 0, s: 10, x: 1, l: 0.5, h: 0, v: 15, n: 2, c: 1, w: 0, d: 0 }, 1000), true);
  assert.equal(mate.hear({ t: 'rider', ms: 100, s: 11.5, x: 1.2, l: 0.5, h: 0, v: 15, n: 2, c: 1, w: 0, d: 0 }, 1100), false, 'nothing on the board changed');
  const between = mate.placeAt(1170, BIKE.leanMost);
  assert.ok(between.s > 10 && between.s < 11.5, `between the two: ${between.s}`);
  assert.ok(Math.abs(between.roll - 0.5 * BIKE.leanMost) < 1e-9);
  const later = mate.placeAt(1520, BIKE.leanMost);
  assert.ok(later.s > 11.5 && later.s < 11.5 + 15 * 0.5 + 0.01, `carried on: ${later.s}`);
  assert.equal(mate.hear({ t: 'pose', ms: 200 }, 1200), false, 'anything else is not theirs to hear');
  mate.gone = true;
  assert.equal(mate.placeAt(1200, BIKE.leanMost), null);
});

test('together: two friends ride up as one convoy, and get to the top within a few seconds of each other', () => {
  const ride = makeRide([keen(), keen(0.75)]);
  assert.equal(ride.team, true);
  const [ana, ben] = ride.players;
  let furthest = 0;
  ride.runUntil(() => {
    if (ana.game.state === 'riding' && ben.game.state === 'riding') furthest = Math.max(furthest, Math.abs(ana.game.s - ben.game.s));
    return ride.players.every(({ game }) => game.state === 'finished');
  });
  assert.ok(ride.players.every(({ game }) => game.state === 'finished'), 'everyone got to the top');
  assert.ok(furthest < 60, `never more than ${furthest} metres apart`);
  assert.ok(Math.abs(ana.finishedAt - ben.finishedAt) < 6, `finished ${Math.abs(ana.finishedAt - ben.finishedAt)} seconds apart`);
  // Each knows how the other did, and the stars are added up.
  assert.equal(ana.results.get(ben.id).dropped, ben.game.stats.stars);
  assert.equal(ben.results.get(ana.id).won, true);
  assert.equal(teamStars(ana.game, ana.mates), ana.game.stats.stars + ben.game.stats.stars);
  assert.ok(teamStars(ana.game, ana.mates) > 4, 'and there were stars to catch');
});

test('together: a child far in front eases off for one who’s waiting, and is never stopped', () => {
  const ride = makeRide([keen(), resting]);
  const [ana, ben] = ride.players;
  ride.runFor(14);
  assert.equal(ben.game.waiting, 'bend', 'the second child is waiting in the first bend');
  const gap = ana.game.s - ben.game.s;
  assert.ok(gap > 45, `the first child is ${gap} metres in front`);
  let slowest = Infinity;
  let fastest = 0;
  for (let i = 0; i < 90; i += 1) {
    ride.step();
    if (!ana.game.offRoad && !ana.game.waiting) {
      slowest = Math.min(slowest, ana.game.v);
      fastest = Math.max(fastest, ana.game.v);
    }
  }
  assert.ok(fastest < ana.game.cruise * 0.8, `eased off: ${fastest} of ${ana.game.cruise}`);
  assert.ok(slowest > ana.game.cruise * 0.4, `and still going: ${slowest}`);
  // Both get to the top in the end: the one who never leans is helped round the bends, or carried round a
  // short one on the grass by the convoy's tow, and rides none of them on the road.
  ride.runUntil(() => ride.players.every(({ game }) => game.state === 'finished'));
  assert.ok(ride.players.every(({ game }) => game.state === 'finished'));
  assert.ok(ben.game.stats.tows >= 1);
  assert.equal(ben.game.stats.clean, 0);
});

test('together: a child a long way behind gets a tow, and catches up', () => {
  // The second child waits out the first bend, and then rides as well as the first.
  let woke = null;
  const late = (game, t) => {
    if (woke === null && game.stats.tows >= 1 && !game.towed) woke = t;
    return woke === null ? 0 : keen()(game);
  };
  const ride = makeRide([keen(), late], { bends: 10 });
  const [ana, ben] = ride.players;
  ride.runUntil(() => woke !== null);
  const behind = ana.game.s - ben.game.s;
  assert.ok(behind > 40, `${behind} metres behind`);
  ride.runFor(20);
  assert.ok(ana.game.s - ben.game.s < behind - 15, `closing: now ${ana.game.s - ben.game.s} metres behind`);
});

test('together: when a friend goes in the middle, nobody is held back for them any more', () => {
  const ride = makeRide([keen(), resting]);
  const [ana, ben] = ride.players;
  ride.runFor(14);
  ride.leave(ben);
  ride.runFor(8);
  assert.ok(ana.game.v > ana.game.cruise * 0.95, `back to speed: ${ana.game.v}`);
  ride.runUntil(() => ana.game.state === 'finished');
  assert.equal(ana.game.state, 'finished');
  assert.deepEqual(scoreRows(ana.game, ana.mates, true).map(({ name }) => name), ['You']);
});

test('together: the stars of a friend who has gone are no longer counted', () => {
  const ride = makeRide([keen(), keen()], { bends: 10 });
  const [ana, ben] = ride.players;
  ride.runUntil(() => ben.game.stats.stars >= 3 && ana.game.stats.stars >= 3);
  const [hers, his] = [ana.game.stats.stars, ana.mates[0].stars];
  assert.ok(his >= 3, `she has heard of ${his} of his stars`);
  assert.equal(teamStars(ana.game, ana.mates), hers + his);
  ride.leave(ben);
  assert.equal(teamStars(ana.game, ana.mates), ana.game.stats.stars);
});

test('against each other: it’s a race, nobody is held back, and everyone rides on to the top', () => {
  const ride = makeRide([keen(), keen(0.75), resting], { together: false });
  assert.equal(ride.team, false);
  const [ana, ben, cat] = ride.players;
  ride.runFor(30);
  assert.ok(ana.game.v > ana.game.cruise * 0.95, 'the one in front is at full speed, however far back the last is');
  assert.ok(ana.game.s - cat.game.s > 150);
  // Who's in front, on each child's own board.
  assert.deepEqual(scoreRows(ana.game, ana.mates, false).map(({ name, count }) => [name, count])[0], ['You', 1]);
  assert.equal(scoreRows(cat.game, cat.mates, false).find(({ you }) => you).count, 3);
  ride.runUntil(() => ride.players.every(({ game }) => game.state === 'finished'));
  assert.ok(ride.players.every(({ game }) => game.state === 'finished'), 'everyone finishes, even the one who never leaned');
  assert.ok(ana.finishedAt <= ben.finishedAt && ben.finishedAt < cat.finishedAt, 'in the order they rode');
  // The times everyone is told are the ones they're placed by.
  assert.ok(cat.results.get(ana.id).ms < cat.results.get(ben.id).ms + 1);
  assert.equal(ana.results.get(cat.id).won, true, 'the last one home still rode to the top');
});

test('four friends ride the same road, laid out from the same seed on every computer', () => {
  const ride = makeRide([keen(), keen(), keen(0.8), keen(0.9)], { bends: 6, level: 7, seed: null });
  const [first, ...others] = ride.players;
  for (const other of others) assert.deepEqual(other.game.plan, first.game.plan);
  // With friends it's the plain road, whatever the level: bends, stars and speed arrows.
  assert.ok(first.game.plan.things.every(({ kind }) => ['star', 'boost'].includes(kind)));
  ride.runUntil(() => ride.players.every(({ game }) => game.state === 'finished'));
  assert.ok(ride.players.every(({ game }) => game.state === 'finished'));
  const rows = scoreRows(first.game, first.mates, true);
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row, index) => index === 0 || row.count <= rows[index - 1].count), 'the most stars first');
});
