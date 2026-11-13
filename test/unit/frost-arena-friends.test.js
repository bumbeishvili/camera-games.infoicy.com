// Frost Arena with friends: the rules of a match together and of one against each other, with two, three or
// four games wired to each other as they would be through the server, each message going through the cleaner
// the server would put it through. Its screen is tested in test/e2e/frost-arena.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASES, HEALTH, LEVELS, OUT_SECONDS, RIFLES, TAGS_TO_WIN, YARD, freeAt, headingTo, stepTowards, turnBetween, wayTo } from '../../games/frost-arena/arena.js';
import { MOST_PLAYERS, OWED_SECONDS, PLAYER_LOOKS, TROOPER_TRACK } from '../../games/frost-arena/squad.js';
import { FIRST_RED, GIRAFFE, TEAM_REDS, TeamMatch, teamReds, teamTags } from '../../games/frost-arena/team.js';
import { RIVAL_STARTS, Rivals } from '../../games/frost-arena/rivals.js';
import { Track } from '../../core/friends.js';
import { MOST_BYTES, cleanFoes, cleanHit, cleanTag, cleanTrooper } from '../../server/race-room.js';

const STEP = 1 / 60;
const SEND_EVERY = 6; // Frames between what each game sends: ten times a second.
const NAMES = ['Ana', 'Ben', 'Cal', 'Dee'];
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

// What the hands are asking for: nothing, the trigger held, and neither hand in the picture.
const HANDS = { moveX: 0, moveY: 0, sprint: false, turn: 0, fire: false, reload: false, hands: 2 };
const FIRE = { ...HANDS, fire: true };
const AWAY = { ...HANDS, hands: 0 };

/**
 * Games at a table: as many as there are players, each with its own match, wired to each other as the server
 * would: where each player is goes to everyone else, what the game running the computer's side says of it goes
 * to the rest, a hit on one of them goes only to that game, and a hit on a friend goes to everyone. Everything is
 * cleaned as the server would, and arrives lag frames later. own(slot) is what's each player's own to choose.
 */
function table(Kind, count, { lag = 0, seed = 3, own = () => ({}), ...options } = {}) {
  const players = Array.from({ length: count }, (_, slot) => ({ slot, name: NAMES[slot] }));
  let frame = 0;
  const seats = [];
  const runner = () => seats.find(({ here }) => here);
  const post = (to, kind, from, message) => to.inbox.push({ due: frame + lag, kind, from, message: JSON.parse(JSON.stringify(message)) });
  const said = (seat, event) => {
    seat.events.push(event);
    if (event.type === 'tag') {
      const to = runner();
      if (to && to !== seat) post(to, 'tag', seat.slot, cleanTag({ k: event.id, n: event.hits }));
    }
    if (event.type === 'zap') {
      for (const other of seats) if (other !== seat && other.here) post(other, 'hit', seat.slot, cleanHit({ r: event.slot + 1, m: 'tag', d: 1, tot: event.hits, sm: event.rifle === 'm4' ? 1 : 0 }));
    }
  };
  for (const { slot } of players) {
    const seat = { slot, here: true, events: [], inbox: [], sent: [] };
    seat.count = (type, when = () => true) => seat.events.filter((event) => event.type === type && when(event)).length;
    seat.match = new Kind({ slot, runs: slot === 0, players, seed, random: seeded(21 + slot), ...options, ...own(slot), onEvent: (event) => said(seat, event) });
    seats.push(seat);
  }
  const hear = (seat, { kind, from, message }) => {
    const { match } = seat;
    if (kind === 'trooper') match.placeFriend(match.playerAt(from), message);
    else if (kind === 'foes') match.follow(message);
    else if (kind === 'tag') match.friendTagged(from, message.k, message.n);
    else if (kind === 'hit' && message.r - 1 === seat.slot) match.hitBy(from, message.sm ? 'm4' : 'ak', message.tot);
  };
  const step = (inputs = HANDS) => {
    frame += 1;
    for (const seat of seats) {
      if (!seat.here) continue;
      const due = seat.inbox.filter((each) => each.due <= frame);
      seat.inbox = seat.inbox.filter((each) => each.due > frame);
      for (const each of due) hear(seat, each);
      const input = typeof inputs === 'function' ? inputs(seat) : Array.isArray(inputs) ? inputs[seat.slot] ?? HANDS : inputs;
      seat.match.update(STEP, input);
    }
    if (frame % SEND_EVERY) return;
    for (const seat of seats) {
      if (!seat.here || !['playing'].includes(seat.match.state)) continue;
      const trooper = cleanTrooper(seat.match.childWire());
      for (const other of seats) if (other !== seat && other.here) post(other, 'trooper', seat.slot, trooper);
      if (!seat.match.wire || !seat.match.runs || seat !== runner()) continue;
      const foes = cleanFoes(seat.match.wire());
      seat.sent.push(foes);
      for (const other of seats) if (other !== seat && other.here) post(other, 'foes', seat.slot, foes);
    }
  };
  const run = (seconds, inputs) => {
    for (let i = 0; i < Math.round(seconds / STEP); i += 1) step(inputs);
  };
  /** Runs until something is so, a frame at a time, for no longer than this. Returns whether it came to be. */
  const until = (so, inputs, most = 6) => {
    for (let i = 0; i < Math.round(most / STEP); i += 1) {
      if (so()) return true;
      step(inputs);
    }
    return so();
  };
  /** Someone closes the page: nothing more comes from them, and the rest are told they've gone. */
  const leave = (slot) => {
    seats[slot].here = false;
    for (const seat of seats) {
      seat.inbox = seat.inbox.filter(({ from }) => from !== slot);
      if (seat.here) seat.match.friendGone(slot);
    }
  };
  for (const seat of seats) seat.match.begin();
  return { seats, step, run, until, leave, matches: seats.map(({ match }) => match) };
}

const reds = (match) => match.troopers.filter(({ bot, team }) => bot && team === 1);
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const only = (slot, input) => (seat) => (seat.slot === slot ? input : HANDS);
/** Everyone the computer plays stands where they are, and does nothing. */
const still = (match) => {
  match.think = () => {};
};
/** Where everyone is, by number, to a tenth, to compare one game with another. */
const places = (match, which = () => true) => Object.fromEntries(match.troopers.filter(which).map((each) => [each.number, `${each.x.toFixed(1)}, ${each.z.toFixed(1)}`]));

/**
 * Together, with the red team standing still: the first of them some paces up the alley down the side of the
 * yard, where there's nothing in the way, in front of the player with this place and facing them, and everyone
 * else well out of it. Returns that one's number.
 */
function alley(game, slot, away = 8) {
  const [host] = game.matches;
  still(host);
  const [first, ...others] = reds(host);
  Object.assign(first, { x: -21, z: 13 - away, heading: Math.PI });
  others.forEach((other, index) => Object.assign(other, { x: 20, z: -13.5 + index * 1.2 }));
  Object.assign(host.byNumber(GIRAFFE), { x: 12, z: 13.5 });
  game.matches.forEach((match, index) => Object.assign(match.child, index === slot ? { x: -21, z: 13, heading: 0 } : { x: 3 + index * 2, z: 13.5, heading: 0 }));
  game.run(0.5);
  return first.number;
}

/** Someone who plays as a player would: turning to whoever they can see and firing when the sights are on them, and otherwise walking about. */
function player(match, seed = 5) {
  const random = seeded(seed);
  const me = match.child;
  let way = null;
  let wayIn = 0;
  let goal = { x: 0, z: -6 };
  return () => {
    const seen = match.foesOf(me).filter((other) => other.safeLeft <= 0 && match.sees(me, other)).sort((a, b) => gap(a, me) - gap(b, me))[0];
    let wanted;
    let moveY = 0;
    if (seen) {
      wanted = headingTo(seen.x - me.x, seen.z - me.z);
    } else {
      wayIn -= STEP;
      if (gap(me, goal) < 2) goal = { x: (random() - 0.5) * 36, z: (random() - 0.5) * 24 };
      if (!way || wayIn <= 0) {
        way = wayTo(goal.x, goal.z);
        wayIn = 0.5;
      }
      const next = stepTowards(way, me.x, me.z);
      wanted = headingTo(next.x - me.x, next.z - me.z);
      moveY = Math.abs(turnBetween(wanted, me.heading)) < 0.9 ? 1 : 0.3;
    }
    const off = turnBetween(wanted, me.heading);
    const on = seen && Math.abs(off) < Math.atan2(0.3, gap(seen, me));
    return { ...HANDS, turn: clamp(off * 0.25, -0.07, 0.07), moveY, fire: Boolean(on) };
  };
}

/** Everyone at the table plays like that until it's over, or for as long as this. Returns how long it took. */
function playOut(game, most = 900) {
  const brains = new Map(game.seats.map((seat) => [seat, player(seat.match, 5 + seat.slot)]));
  let seconds = 0;
  while (seconds < most && game.seats.some(({ here, match }) => here && match.state === 'playing')) {
    game.step((seat) => (seat.match.state === 'playing' ? brains.get(seat)() : HANDS));
    seconds += STEP;
  }
  return seconds;
}

/* ---------- together: who's in it ---------- */

test('together, every friend\'s game has the same players in the same places: the players along the blue end, Giraffe beside them, and one more on the red team than there are players', () => {
  for (const count of [2, 3, 4]) {
    const game = table(TeamMatch, count);
    const [host] = game.matches;
    const [blue] = BASES;
    for (const match of game.matches) {
      assert.deepEqual(match.troopers.map(({ number }) => number), host.troopers.map(({ number }) => number));
      assert.deepEqual(places(match), places(host));
      const players = match.troopers.filter(({ bot }) => !bot);
      assert.deepEqual(players.map(({ number, team, z }) => [number, team, z]), Array.from({ length: count }, (_, slot) => [slot, 0, blue.z]));
      assert.equal(new Set(players.map(({ x }) => x)).size, count, 'each at a place of their own');
      const giraffe = match.byNumber(GIRAFFE);
      assert.deepEqual([giraffe.who, giraffe.bot, giraffe.team], ['giraffe', true, 0]);
      assert.deepEqual(reds(match).map(({ number }) => number), Array.from({ length: count + 1 }, (_, index) => FIRST_RED + index));
      assert.deepEqual(reds(match).map(({ who }) => who), reds(host).map(({ who }) => who));
      for (const { who } of reds(match)) assert.ok(TEAM_REDS.includes(who) && !PLAYER_LOOKS.includes(who), who);
      // Each player is themselves in their own game, and one of the characters, with their name, in their friends'.
      assert.equal(match.child, match.playerAt(match.slot));
      assert.equal(match.child.who, 'child');
      for (const friend of match.friends) assert.deepEqual([friend.who, friend.name], [PLAYER_LOOKS[friend.number], NAMES[friend.number]]);
      assert.equal(match.runs, match.slot === 0);
    }
  }
  assert.deepEqual([1, 2, 3, 4, 9].map(teamReds), [2, 3, 4, 5, 5]);
  // A different seed is a different red team, the same on every screen.
  assert.notDeepEqual(reds(table(TeamMatch, 2, { seed: 4 }).matches[1]).map(({ who }) => who), reds(table(TeamMatch, 2, { seed: 3 }).matches[1]).map(({ who }) => who));
});

test('together it\'s the plain match, as hard as whoever made it chose, to their number of tags for each player, with each player\'s own rifle and help with aiming', () => {
  const game = table(TeamMatch, 3, { tags: 5, level: 'tough', own: (slot) => ({ rifle: slot === 1 ? 'm4' : 'ak', assist: slot !== 2 }) });
  for (const match of game.matches) {
    assert.equal(match.goal, 15);
    assert.equal(match.level, LEVELS.tough);
    assert.equal(match.levelNumber, 1);
    assert.deepEqual(match.crateKinds, []);
    for (const red of reds(match)) assert.deepEqual([red.part, red.most], [null, HEALTH]);
  }
  assert.deepEqual(game.matches.map(({ child }) => child.rifle), ['ak', 'm4', 'ak']);
  assert.deepEqual(game.matches.map(({ assist }) => assist), [true, true, false]);
  assert.deepEqual([teamTags(5, 1), teamTags(10, 2), teamTags(15, 4), teamTags(7, 2), teamTags(5, 9)], [5, 20, 60, TAGS_TO_WIN[0] * 2, 20]);
  // Which rifle a friend has shows in everyone else's game.
  game.run(0.3);
  assert.deepEqual(game.matches[0].playerAt(1).rifle, 'm4');
  assert.deepEqual(game.matches[1].playerAt(0).rifle, 'ak');
});

/* ---------- together: Giraffe and the red team ---------- */

test('Giraffe and the red team go where the host\'s game has them on every screen, and a friend\'s game never moves them by itself', () => {
  const game = table(TeamMatch, 3, { lag: 3 });
  const [host, ...guests] = game.matches;
  for (const guest of guests) {
    guest.think = () => {
      throw new Error('a friend\'s game is thinking for the computer\'s players');
    };
  }
  game.run(8);
  const moved = host.bots.filter((bot) => gap(bot, bot.home) > 2);
  assert.ok(moved.length >= 3, `${moved.length} of them have gone anywhere`);
  for (const guest of guests) {
    for (const bot of host.bots) {
      const shown = guest.byNumber(bot.number);
      assert.ok(gap(shown, bot) < 1.2, `${bot.who} is ${gap(shown, bot).toFixed(2)} from where the host's game has it`);
      assert.equal(shown.state, bot.state);
    }
  }
  // With nothing more from the host's game, they get to where it last had them, and stay there.
  const [guest] = guests;
  for (let i = 0; i < 60; i += 1) guest.update(STEP, HANDS);
  const before = places(guest, ({ bot }) => bot);
  for (let i = 0; i < 180; i += 1) guest.update(STEP, HANDS);
  assert.deepEqual(places(guest, ({ bot }) => bot), before);
});

test('where each player is, the way they look and what they\'re doing shows in their friends\' games', () => {
  const game = table(TeamMatch, 3, { lag: 3 });
  const [host] = game.matches;
  still(host);
  for (const red of reds(host)) Object.assign(red, { x: 20, z: -13.5 });
  // Ben walks off, turning as he goes.
  game.run(2, only(1, { ...HANDS, moveY: 1, turn: 0.004 }));
  const ben = game.matches[1].child;
  assert.ok(gap(ben, ben.home) > 5, 'he has walked off');
  for (const match of [game.matches[0], game.matches[2]]) {
    const shown = match.playerAt(1);
    assert.ok(gap(shown, ben) < 1, `shown ${gap(shown, ben).toFixed(2)} from where he is`);
    assert.ok(Math.abs(turnBetween(shown.heading, ben.heading)) < 0.1);
    assert.ok(shown.speed > 3 && !shown.sprinting && !shown.firing && !shown.resting);
  }
  // He sprints, and it shows.
  game.run(0.6, only(1, { ...HANDS, moveY: 1, sprint: true }));
  assert.equal(game.matches[2].playerAt(1).sprinting, true);
  // He stops, out in the alley down the side, and fires: his friends see him firing, and each shot going the way he faces.
  Object.assign(ben, { x: -21, z: 13, heading: 0, vx: 0, vz: 0 });
  game.run(0.5, only(1, HANDS));
  const seen = game.seats[0].count('shot', ({ by }) => by === host.playerAt(1));
  game.run(0.6, only(1, FIRE));
  assert.equal(host.playerAt(1).firing, true);
  const shots = game.seats[0].events.filter((event) => event.type === 'shot' && event.by === host.playerAt(1));
  assert.ok(shots.length - seen >= 3, `${shots.length - seen} shots shown`);
  const last = shots.at(-1);
  const along = turnBetween(headingTo(last.to.x - host.playerAt(1).x, last.to.z - host.playerAt(1).z), host.playerAt(1).heading);
  assert.ok(Math.abs(along) < 0.02 && gap(last.to, host.playerAt(1)) > 2, `${along}`);
  // With neither of his hands in the picture he stands where he is, and his friends are told.
  game.run(1.6, only(1, AWAY));
  assert.equal(game.matches[0].playerAt(1).resting, true);
  assert.equal(game.matches[2].playerAt(1).firing, false);
  game.run(0.4);
  assert.equal(game.matches[0].playerAt(1).resting, false);
});

/* ---------- together: hits ---------- */

test('a friend\'s shot that hits one of the red team shows at once on their own screen, is counted by the host\'s game, and tags them out for everyone', () => {
  const game = table(TeamMatch, 2, { lag: 4 });
  const number = alley(game, 1);
  const [host, guest] = game.matches;
  const [hostSeat, guestSeat] = game.seats;
  assert.ok(game.until(() => guestSeat.count('hit') >= 1, only(1, FIRE), 1), 'the first shot lands');
  // On the screen of whoever fired, it has landed. The host's game hasn't heard yet.
  assert.equal(guest.byNumber(number).health, HEALTH - RIFLES.ak.hit);
  assert.equal(host.byNumber(number).health, HEALTH);
  assert.equal(guest.aimed, guest.byNumber(number));
  // It carries on until they're out, which is for the host's game to say.
  assert.ok(game.until(() => host.byNumber(number).state === 'out', only(1, FIRE), 3));
  game.run(0.3);
  assert.equal(guest.byNumber(number).state, 'out');
  assert.deepEqual([host.score, guest.score], [[1, 0], [1, 0]]);
  assert.deepEqual([host.playerAt(1).tags, guest.child.tags, guest.stats.tags, host.child.tags], [1, 1, 1, 0]);
  // Everyone is told who tagged whom.
  for (const seat of [hostSeat, guestSeat]) {
    const [tagged] = seat.events.filter(({ type }) => type === 'tagged');
    assert.deepEqual([tagged.trooper.number, tagged.by.number], [number, 1]);
  }
  // And they're back a few seconds later, on every screen.
  game.run(OUT_SECONDS + 0.5);
  assert.deepEqual([host.byNumber(number).state, guest.byNumber(number).state], ['in', 'in']);
  assert.ok(gap(guest.byNumber(number), host.byNumber(number)) < 0.5);
});

test('each hit is counted once however often it\'s told, a burst of them at once is a mistake, and a hit that never got there doesn\'t stay', () => {
  const game = table(TeamMatch, 3);
  const number = alley(game, 1);
  const [host, guest] = game.matches;
  const red = host.byNumber(number);
  Object.assign(red, { most: 1000, health: 1000 });
  host.friendTagged(1, number, 1);
  host.friendTagged(1, number, 1);
  assert.equal(red.health, 1000 - RIFLES.ak.hit);
  // The same number from someone else is theirs.
  host.friendTagged(2, number, 1);
  assert.equal(red.health, 1000 - RIFLES.ak.hit * 2);
  // Fifty at once counts as four.
  host.friendTagged(1, number, 51);
  assert.equal(red.health, 1000 - RIFLES.ak.hit * 6);
  host.friendTagged(1, number, 51);
  assert.equal(red.health, 1000 - RIFLES.ak.hit * 6);
  // Nothing from the host's own place, from nobody, for one of the blue team, or that isn't a number.
  for (const [slot, who, total] of [[0, number, 99], [3, number, 1], [1, GIRAFFE, 1], [1, 999, 1], [1, number, NaN], [1, number, 'lots']]) host.friendTagged(slot, who, total);
  assert.equal(red.health, 1000 - RIFLES.ak.hit * 6);
  assert.equal(host.byNumber(GIRAFFE).health, HEALTH);

  // A hit shows at once in the game that made it. If the host's game never hears of it, it doesn't stay.
  const later = table(TeamMatch, 2);
  const other = alley(later, 1);
  const [, friend] = later.matches;
  friend.hit(friend.byNumber(other), RIFLES.ak.hit, friend.child);
  later.seats[0].inbox = [];
  assert.equal(friend.byNumber(other).health, HEALTH - RIFLES.ak.hit);
  later.run(OWED_SECONDS + 0.4);
  assert.equal(friend.byNumber(other).health, HEALTH);
  assert.equal(guest.byNumber(number).state, 'in');
});

test('a friend\'s hit on one of the red team shows on the other screens as it\'s counted', () => {
  const game = table(TeamMatch, 3, { lag: 3 });
  const number = alley(game, 1);
  const watcher = game.seats[2];
  assert.ok(game.until(() => watcher.count('hit') >= 2, only(1, FIRE), 2));
  const [hit] = watcher.events.filter(({ type }) => type === 'hit');
  assert.deepEqual([hit.trooper.number, hit.by], [number, null]);
  assert.ok(watcher.match.byNumber(number).health < HEALTH);
  assert.equal(watcher.match.stats.hits, 0, 'and it isn\'t theirs');
});

test('what lands on a player is for their own game to say: the red team\'s shots at a friend do nothing in anyone else\'s game, and some of them land in the friend\'s', () => {
  const game = table(TeamMatch, 2, { lag: 3, level: 'tough' });
  const [host, guest] = game.matches;
  // One of the red team in front of Ben, out in the alley, with everyone else out of the way.
  const [first, ...others] = reds(host);
  const think = host.think.bind(host);
  host.think = (bot, dt) => (bot === first ? think(bot, dt) : undefined);
  Object.assign(first, { x: -21, z: 6, heading: Math.PI });
  others.forEach((other, index) => Object.assign(other, { x: 20, z: -13.5 + index * 1.2 }));
  Object.assign(host.byNumber(GIRAFFE), { x: 12, z: 13.5 });
  Object.assign(host.child, { x: 8, z: 13.5 });
  Object.assign(guest.child, { x: -21, z: 13, heading: 0 });
  game.run(5);
  const shotsAtBen = game.seats[0].count('shot', ({ by, at }) => by === first && at === host.playerAt(1));
  assert.ok(shotsAtBen > 5, `${shotsAtBen} shots at him in the host's game`);
  assert.equal(game.seats[0].count('hit', ({ trooper }) => trooper === host.playerAt(1)), 0, 'none of which the host\'s game says has landed');
  const landed = game.seats[1].count('hit', ({ trooper }) => trooper === guest.child);
  const shown = game.seats[1].count('shot', ({ by, at }) => by.number === first.number && at === guest.child);
  assert.ok(shown > 5 && landed >= 1 && landed < shown, `${landed} of ${shown} landed in his own game`);
  assert.ok(guest.child.health < HEALTH || guest.stats.out > 0);
  // And how much he has left is what his own game says, on the host's screen.
  assert.ok(Math.abs(host.playerAt(1).health - guest.child.health) <= LEVELS.tough.hit * 2 || guest.child.state !== 'in');
});

test('the red team only stops and waits when every player\'s hands are out of the picture, and a player whose hands are can be hit like anyone', () => {
  const game = table(TeamMatch, 2, { lag: 2 });
  const [host, guest] = game.matches;
  game.run(2, AWAY);
  assert.deepEqual([host.paused, guest.paused, host.resting, guest.resting], [true, true, true, true]);
  const waiting = places(host, ({ bot }) => bot);
  game.run(2, AWAY);
  assert.deepEqual(places(host, ({ bot }) => bot), waiting);
  // One of them is back: it all carries on, for both.
  game.run(3, only(1, AWAY));
  assert.deepEqual([host.paused, guest.paused], [false, false]);
  assert.notDeepEqual(places(host, ({ bot }) => bot), waiting);
  // Ben's hands are still out of the picture, and one of the red team is in front of him: it fires at him.
  const [first] = reds(host);
  const think = host.think.bind(host);
  host.think = (bot, dt) => (bot === first ? think(bot, dt) : undefined);
  Object.assign(first, { x: -21, z: 6, heading: Math.PI, state: 'in', health: HEALTH });
  Object.assign(guest.child, { x: -21, z: 13, heading: 0 });
  Object.assign(host.child, { x: 8, z: 13.5 });
  const before = game.seats[1].count('shot', ({ at }) => at === guest.child);
  game.run(4, only(1, AWAY));
  assert.equal(guest.resting, true);
  assert.ok(game.seats[1].count('shot', ({ at }) => at === guest.child) > before + 3);
});

/* ---------- together: how it ends ---------- */

test('on Easy nobody is tagged out and it can\'t be lost. On Medium a friend the red team tags out is a tag for them on every screen, and enough of those lose it for everyone at the same moment', () => {
  const easy = table(TeamMatch, 2, { level: 'gentle', tags: 5 });
  const [, easyGuest] = easy.matches;
  alley(easy, 1);
  easyGuest.hit(easyGuest.child, 5000, reds(easyGuest)[0]);
  easy.run(0.4);
  assert.deepEqual([easyGuest.child.state, easyGuest.child.health, easyGuest.childWire().a], ['in', 1, 0]);
  assert.deepEqual(easy.matches.map(({ score }) => score), [[0, 0], [0, 0]]);
  // And whatever a friend's game says of it, there are no tags for the red team on Easy.
  const [easyHost] = easy.matches;
  easyHost.placeFriend(easyHost.playerAt(1), cleanTrooper({ ...easyGuest.childWire(), u: 1, v: 0, a: 1, b: FIRST_RED }));
  assert.deepEqual(easyHost.score, [0, 0]);

  const game = table(TeamMatch, 2, { level: 'medium', tags: 5, lag: 3 });
  const [host, guest] = game.matches;
  const number = alley(game, 1);
  guest.hit(guest.child, 5000, guest.byNumber(number));
  assert.equal(guest.child.state, 'out');
  assert.deepEqual([guest.childWire().u, guest.childWire().a, guest.childWire().b], [1, 1, number]);
  game.run(0.4);
  assert.deepEqual([host.score, guest.score], [[0, 1], [0, 1]]);
  assert.equal(host.playerAt(1).state, 'out');
  const [tagged] = game.seats[0].events.filter(({ type }) => type === 'tagged');
  assert.deepEqual([tagged.trooper, tagged.by], [host.playerAt(1), host.byNumber(number)]);
  assert.equal(host.byNumber(number).tags, 1);
  // Told again and again, it's still one.
  game.run(1);
  assert.deepEqual(host.score, [0, 1]);
  // He's back at his own end a few seconds later, on both screens: at once, wherever his game was last heard
  // to have him, rather than slid there from where he sat.
  const sat = { x: host.playerAt(1).x, z: host.playerAt(1).z };
  assert.ok(game.until(() => host.playerAt(1).state === 'in', HANDS, OUT_SECONDS + 1));
  assert.ok(gap(host.playerAt(1), guest.child.home) < 0.01 && gap(sat, guest.child.home) > 5);
  host.placeFriend(host.playerAt(1), cleanTrooper({ ...guest.childWire(), x: sat.x, z: sat.z }));
  assert.ok(gap(host.playerAt(1), guest.child.home) < 0.01, 'and stays there for a moment, whatever comes');
  game.run(0.5);
  assert.deepEqual([guest.child.state, host.playerAt(1).state], ['in', 'in']);
  assert.ok(gap(host.playerAt(1), guest.child.home) < 0.5);
  // The red team's tenth loses it, for everyone.
  host.score[1] = 9;
  host.hit(host.child, 5000, host.byNumber(number));
  assert.equal(host.ending, 'lost');
  game.run(2.2);
  assert.deepEqual(game.matches.map(({ state }) => state), ['lost', 'lost']);
  assert.deepEqual(game.matches.map(({ score }) => score), [[0, 10], [0, 10]]);
  // A friend's game never says how it ends by itself.
  const alone = table(TeamMatch, 2, { level: 'medium', tags: 5 });
  alone.matches[1].score = [0, 99];
  alone.matches[1].checkEnd();
  assert.equal(alone.matches[1].endIn, null);
});

test('together it\'s won by the tags everyone makes between them, at the same moment on every screen', () => {
  const game = table(TeamMatch, 2, { level: 'gentle', tags: 5, lag: 3 });
  const seconds = playOut(game);
  const [host, guest] = game.matches;
  assert.deepEqual(game.matches.map(({ state }) => state), ['won', 'won'], `after ${seconds.toFixed(0)} s`);
  assert.equal(host.goal, 10);
  assert.ok(host.score[0] >= 10);
  assert.deepEqual(guest.score, host.score);
  const made = host.troopers.filter(({ team }) => team === 0).reduce((sum, each) => sum + each.tags, 0);
  assert.equal(made, host.score[0]);
  assert.equal(guest.stats.tags, host.playerAt(1).tags);
  assert.ok(host.child.tags + host.playerAt(1).tags >= 4, 'most of them the players\' own');
  assert.equal(game.seats[0].count('won'), 1);
  assert.equal(game.seats[1].count('won'), 1);
});

/* ---------- together: a friend going ---------- */

test('a friend who goes leaves the rest to finish, with fewer tags left to make, and is gone from the yard', () => {
  const game = table(TeamMatch, 3, { tags: 5, lag: 2 });
  const [host, guest] = game.matches;
  still(host);
  game.run(0.5);
  host.score[0] = 3;
  assert.equal(host.left, 12);
  game.leave(2);
  // Twelve to go between three is eight between two.
  assert.equal(host.goal, 11);
  game.run(0.3);
  assert.equal(guest.goal, 11);
  for (const match of [host, guest]) {
    const gone = match.playerAt(2);
    assert.equal(gone.state, 'gone');
    assert.ok(!match.here.includes(gone) && match.here.length === 2);
    for (const red of reds(match)) assert.ok(!match.foesOf(red).includes(gone));
  }
  assert.equal(game.seats[0].count('gone'), 1);
  // Told twice, it's still once, and nothing of theirs is listened to after.
  assert.equal(host.friendGone(2), false);
  host.placeFriend(host.playerAt(2), cleanTrooper({ x: 1, z: 1, v: 100 }));
  assert.equal(host.playerAt(2).state, 'gone');
  host.friendTagged(2, FIRST_RED, 3);
  assert.equal(host.byNumber(FIRST_RED).health, HEALTH);
});

test('if whoever made the match goes, the game of the first player still here takes Giraffe and the red team over as they are, and nothing is counted twice', () => {
  const game = table(TeamMatch, 3, { lag: 2 });
  const [, ben, cal] = game.matches;
  const number = alley(game, 2);
  // Cal has hit one of them twice, and the host's game has counted both.
  assert.ok(game.until(() => game.seats[2].count('tag') >= 2, only(2, FIRE), 2));
  game.run(0.4);
  assert.equal(ben.byNumber(number).health, HEALTH - RIFLES.ak.hit * 2);
  const before = places(ben, ({ bot }) => bot);
  game.leave(0);
  assert.deepEqual([ben.runs, cal.runs], [true, false]);
  assert.deepEqual(places(ben, ({ bot }) => bot), before, 'they\'re where they were');
  assert.equal(ben.playerAt(0).state, 'gone');
  // His game runs them now: they think for themselves again, and Cal's game is told where they are by his.
  still(ben);
  game.run(0.5);
  assert.ok(game.seats[1].sent.length > 2);
  // Cal's next hit is one hit, not three.
  const had = ben.byNumber(number).health;
  assert.ok(game.until(() => game.seats[2].count('tag') >= 3, only(2, FIRE), 2));
  game.run(0.3);
  assert.equal(ben.byNumber(number).health, had - RIFLES.ak.hit);
  // And it's Ben's game that says when they're out, for both.
  assert.ok(game.until(() => ben.byNumber(number).state === 'out', only(2, FIRE), 3));
  game.run(0.3);
  assert.deepEqual([cal.byNumber(number).state, ben.score[0], cal.score[0]], ['out', 1, 1]);
});

/* ---------- what passes between them ---------- */

test('what the host\'s game says of Giraffe and the red team is rows of numbers that fit in a message, and anything else a friend\'s game is told is passed over', () => {
  const game = table(TeamMatch, 4);
  game.run(3);
  const [host, guest] = game.matches;
  const wire = cleanFoes(host.wire());
  assert.equal(wire.e.length, 6);
  assert.ok(wire.e.every((row) => row.length === 10 && row.every(Number.isFinite)));
  assert.equal(wire.n.length, 3 + MOST_PLAYERS + 2);
  const text = JSON.stringify({ t: 'foes', from: 'abcdefghijkl', ...wire });
  assert.ok(text.length < MOST_BYTES, `${text.length} characters`);
  const before = JSON.stringify([places(guest), guest.score, guest.goal]);
  for (const junk of [null, undefined, 'hello', 7, {}, { e: 'rows', n: 'numbers' }, { e: [[1, 2]], n: [] }, { e: [[FIRST_RED, 'x', 0, 0, 0, 0, 0, 0, 0, 0]], n: [NaN, 'two'] }, { e: [null, [999, 0, 0, 0, 50, 100, 0, -1, 0, -1]], n: [] }]) {
    assert.doesNotThrow(() => guest.follow(junk));
  }
  assert.equal(JSON.stringify([places(guest), [0, 0], guest.goal]), before.replace(JSON.stringify(guest.score), '[0,0]'));
  // Numbers that are far too big are kept to the yard, and to what can be.
  guest.follow({ e: [[FIRST_RED, 9999, -9999, 99, 5000, 100, 0, -1, 500, -1]], n: [5000, 5000, 5000, 0, 0, 0, 0, 0, 0] });
  for (let i = 0; i < 30; i += 1) guest.update(STEP, HANDS);
  const red = guest.byNumber(FIRST_RED);
  assert.ok(Math.abs(red.x) <= YARD.halfX && Math.abs(red.z) <= YARD.halfZ && red.health <= red.most && red.speed <= 20);
  assert.ok(guest.goal <= TAGS_TO_WIN.at(-1) * MOST_PLAYERS && guest.score.every((tags) => tags <= TAGS_TO_WIN.at(-1) * MOST_PLAYERS * 2));
  // The host's own game doesn't listen to anyone about them.
  const hostBefore = JSON.stringify(places(host));
  host.follow({ e: [[FIRST_RED, 0, 0, 0, 1, 100, 1, -1, 0, -1]], n: [9, 9, 9, 0, 0, 0, 0, 0, 1] });
  assert.equal(JSON.stringify(places(host)), hostBefore);
  assert.equal(host.endIn, null);
});

test('what a friend\'s game says of them is kept to the yard, and anything that isn\'t a number counts as nothing', () => {
  const game = table(TeamMatch, 2);
  const [host] = game.matches;
  still(host);
  game.run(0.3);
  const friend = host.playerAt(1);
  const was = { x: friend.x, z: friend.z };
  host.placeFriend(friend, { x: 'far', z: NaN, h: 'round', s: 'fast', v: 'lots', n: 'many', o: 'everyone', a: 'often', b: 'you' });
  assert.deepEqual([friend.x, friend.z, friend.speed], [was.x, was.z, 0]);
  host.placeFriend(friend, { x: 9999, z: -9999, h: 99, s: 500, v: 9999, u: 0, n: 5 });
  assert.deepEqual([friend.x, friend.z, friend.speed, friend.health], [YARD.halfX, -YARD.halfZ, 20, HEALTH]);
  assert.ok(Math.abs(friend.heading) <= 7);
  // A great many shots at once are shown as a few, and a great many times tagged out as a couple.
  const shots = game.seats[0].count('shot');
  host.placeFriend(friend, { x: 0, z: 10, h: 0, s: 0, v: 100, n: 5000 });
  assert.ok(game.seats[0].count('shot') - shots <= 3);
  host.placeFriend(friend, { x: 0, z: 10, h: 0, s: 0, v: 100, n: 5000, a: 9000, b: FIRST_RED, o: [0, 0, 0, 0] });
  assert.equal(game.seats[0].count('tagged'), 2);
  host.placeFriend(friend, { x: 0, z: 10, h: 0, s: 0, v: 100, n: 5000, a: 9000, b: FIRST_RED, o: [0, 0, 0, 0] });
  assert.equal(game.seats[0].count('tagged'), 2);
  // Nothing at all, or about nobody, or about this game's own player, does nothing.
  assert.doesNotThrow(() => {
    host.placeFriend(friend, null);
    host.placeFriend(null, { x: 1 });
    host.placeFriend(host.child, { x: 1, z: 1, v: 1 });
  });
  assert.notEqual(host.child.x, 1);
});

test('a friend between two messages is shown part of the way, and with nothing new for a moment carries on walking, but never into anything', () => {
  const track = new Track(TROOPER_TRACK);
  const sample = (ms, more) => cleanTrooper({ ms, x: 0, z: 10, h: 0, s: 0, v: 100, ...more });
  track.push(sample(1000, { x: -21, z: 11.6, h: 3, s: 4 }), 5000);
  track.push(sample(1100, { x: -21, z: 12, h: -3, s: 4, f: 1 }), 5100);
  const shown = [];
  for (let now = 5000; now <= 5400; now += 10) shown.push({ now, ...track.at(now) });
  // Somewhere on the way between the two for a while, the short way round for the way they face.
  const between = shown.filter(({ z }) => z < 11.99 && z > 11.61);
  assert.ok(between.length >= 5, `${between.length}`);
  for (const each of between) assert.ok(Math.abs(each.h) >= 3 - 1e-9 && Math.abs(each.h) <= Math.PI + 0.15, `${each.h}`);
  assert.deepEqual([...new Set(between.map(({ f }) => f))].sort(), [0, 1]);
  // After the last of them they carry on the way they were going, for a moment.
  assert.ok(shown.at(-1).z > 12.05 && shown.at(-1).z < 13.7, `${shown.at(-1).z}`);
  // But not into something that's in the way, and not at all when they're sitting out.
  const into = new Track(TROOPER_TRACK);
  // The container in the middle of the yard: someone just this side of it, facing it and walking.
  const wall = { x: 0, z: 0 };
  assert.equal(freeAt(wall.x, wall.z), false, 'there\'s something there');
  let edge = 0;
  while (!freeAt(wall.x, edge)) edge += 0.1;
  assert.ok(edge > 1 && edge < 3, `${edge}`);
  into.push(sample(1000, { x: wall.x, z: edge, h: 0, s: 6 }), 5000);
  into.push(sample(1100, { x: wall.x, z: edge, h: 0, s: 6 }), 5100);
  for (let now = 5100; now <= 5600; now += 20) assert.ok(freeAt(into.at(now).x, into.at(now).z), `at ${now}`);
  const sitting = new Track(TROOPER_TRACK);
  sitting.push(sample(1000, { x: 0, z: 10, h: 0, s: 4, u: 1 }), 5000);
  sitting.push(sample(1100, { x: 0, z: 10, h: 0, s: 4, u: 1 }), 5100);
  assert.equal(sitting.at(5500).z, 10);
});

/* ---------- against each other ---------- */

test('against each other everyone is for themselves, each at a start of their own facing into the yard, with nobody played by the computer', () => {
  for (const count of [2, 3, 4]) {
    const game = table(Rivals, count, { tags: 5 });
    for (const match of game.matches) {
      assert.equal(match.troopers.length, count);
      assert.ok(match.troopers.every(({ bot }) => !bot));
      assert.deepEqual(match.troopers.map(({ number, team }) => [number, team]), Array.from({ length: count }, (_, slot) => [slot, slot]));
      for (const each of match.troopers) {
        const start = RIVAL_STARTS[each.number];
        assert.deepEqual([each.x, each.z, each.heading], [start.x, start.z, start.heading]);
        assert.ok(freeAt(start.x, start.z));
        // Facing into the yard: the middle of it is in front of them.
        assert.ok(Math.abs(turnBetween(headingTo(-start.x, -start.z), start.heading)) < 0.01);
      }
      assert.deepEqual(match.foesOf(match.child), match.friends);
      assert.deepEqual([match.goal, match.left, match.mine, match.runs, match.paused], [5, 5, 0, false, false]);
      // Here a player can always be tagged out, however hard a match alone is set to be.
      match.configure({ level: 'gentle', assist: false });
      assert.deepEqual([match.level.canLose, match.assist], [true, false]);
      assert.equal(match.score.length, MOST_PLAYERS);
    }
  }
});

/** Two of them out in the open, a few paces apart, each facing the other, as each one's own game has them. */
function faceOff(game, shooter = 0, target = 1, away = 6) {
  const [a, b] = [game.matches[shooter].child, game.matches[target].child];
  Object.assign(a, { x: -6.5, z: 3, heading: 0, vx: 0, vz: 0 });
  Object.assign(b, { x: -6.5, z: 3 - away, heading: Math.PI, vx: 0, vz: 0 });
  game.matches.forEach((match, index) => {
    if (index !== shooter && index !== target) Object.assign(match.child, { x: 20, z: 12 });
  });
  game.run(0.5);
}

test('a shot that hits a friend shows at once on the screen of whoever fired, the friend\'s own game counts it, and enough of them tag the friend out for everyone', () => {
  const game = table(Rivals, 3, { tags: 5, lag: 4 });
  faceOff(game);
  const [ana, ben, cal] = game.matches;
  assert.ok(game.until(() => game.seats[0].count('zap') >= 1, only(0, FIRE), 1));
  assert.equal(ana.playerAt(1).health, HEALTH - RIFLES.ak.hit, 'at once, where it was fired');
  assert.equal(ben.child.health, HEALTH, 'and not yet where it landed');
  game.run(0.2);
  assert.equal(ben.child.health, HEALTH - RIFLES.ak.hit);
  assert.equal(game.seats[1].count('hit', ({ trooper, by }) => trooper === ben.child && by === ben.playerAt(0)), 1);
  // Four of them and he's out, which is for his own game to say.
  assert.ok(game.until(() => ben.child.state === 'out', only(0, FIRE), 3));
  assert.deepEqual([ben.childWire().u, ben.childWire().o, ben.childWire().a, ben.childWire().b], [1, [1, 0, 0, 0], 1, 0]);
  game.run(0.3);
  for (const match of [ana, ben, cal]) {
    assert.equal(match.playerAt(1).state, 'out');
    assert.deepEqual(match.score, [1, 0, 0, 0]);
    assert.deepEqual([match.playerAt(0).tags, match.playerAt(1).tags], [1, 0]);
  }
  assert.deepEqual([ana.mine, ana.left, ana.stats.tags, ben.stats.out], [1, 4, 1, 1]);
  for (const seat of game.seats) {
    const [tagged] = seat.events.filter(({ type }) => type === 'tagged');
    assert.deepEqual([tagged.trooper.number, tagged.by.number], [1, 0]);
  }
  // He's back at his own start a few seconds later, and can't be hit for a moment.
  game.run(OUT_SECONDS);
  assert.deepEqual([ben.child.state, ana.playerAt(1).state], ['in', 'in']);
  assert.ok(gap(ana.playerAt(1), RIVAL_STARTS[1]) < 0.5);
});

test('each hit on a player is counted once, with the rifle it came from, and never while they\'re sitting out or only just back', () => {
  const game = table(Rivals, 2, { tags: 5 });
  const [, ben] = game.matches;
  game.run(0.3);
  ben.hitBy(0, 'm4', 1);
  ben.hitBy(0, 'm4', 1);
  assert.equal(ben.child.health, HEALTH - RIFLES.m4.hit);
  ben.hitBy(0, 'ak', 2);
  assert.equal(ben.child.health, HEALTH - RIFLES.m4.hit - RIFLES.ak.hit);
  // Nothing from themselves, from nobody, or that isn't a number, and a rifle nobody has is the usual one.
  for (const [slot, rifle, total] of [[1, 'ak', 99], [3, 'ak', 1], [0, 'ak', NaN], [0, 'ak', 'lots']]) ben.hitBy(slot, rifle, total);
  assert.equal(ben.child.health, HEALTH - RIFLES.m4.hit - RIFLES.ak.hit);
  ben.hitBy(0, 'cannon', 3);
  assert.equal(ben.child.health, HEALTH - RIFLES.m4.hit - RIFLES.ak.hit * 2);
  // Fifty at once counts as four.
  ben.child.health = 1000;
  ben.hitBy(0, 'ak', 53);
  assert.equal(ben.child.health, 1000 - RIFLES.ak.hit * 4);
  // Four are enough to tag him out, and it's one tag.
  ben.child.health = HEALTH;
  ben.hitBy(0, 'ak', 57);
  assert.equal(ben.child.state, 'out');
  assert.deepEqual(ben.child.outBy, [1, 0, 0, 0]);
  // Sitting out, nothing more lands, and nor does it when he's only just back.
  ben.hitBy(0, 'ak', 60);
  assert.deepEqual(ben.child.outBy, [1, 0, 0, 0]);
  game.run(OUT_SECONDS + 0.2);
  assert.ok(ben.child.state === 'in' && ben.child.safeLeft > 0);
  ben.hitBy(0, 'ak', 61);
  assert.equal(ben.child.health, HEALTH);
  // With his hands out of the picture he can be hit like anyone.
  game.run(3, only(1, AWAY));
  assert.equal(ben.resting, true);
  ben.hitBy(0, 'ak', 62);
  assert.equal(ben.child.health, HEALTH - RIFLES.ak.hit);
  // Tagged out like that, he's back at his start a few seconds later all the same: nothing waits for anyone.
  ben.hitBy(0, 'ak', 66);
  assert.equal(ben.child.state, 'out');
  game.run(OUT_SECONDS + 0.3, only(1, AWAY));
  assert.equal(ben.child.state, 'in');
});

test('a hit that never got to the friend\'s game doesn\'t stay on the screen of whoever fired', () => {
  const game = table(Rivals, 2, { tags: 5 });
  faceOff(game);
  const [ana] = game.matches;
  ana.hit(ana.playerAt(1), RIFLES.ak.hit, ana.child);
  game.seats[1].inbox = [];
  assert.equal(ana.playerAt(1).health, HEALTH - RIFLES.ak.hit);
  game.run(OWED_SECONDS + 0.4);
  assert.equal(ana.playerAt(1).health, HEALTH);
  // Nor can anyone fire at someone who's sitting out, only just back, or gone, or for someone else.
  const zaps = game.seats[0].count('zap');
  for (const change of [{ state: 'out' }, { state: 'in', safeLeft: 1 }, { state: 'gone' }]) {
    Object.assign(ana.playerAt(1), { state: 'in', safeLeft: 0, health: HEALTH }, change);
    ana.hit(ana.playerAt(1), RIFLES.ak.hit, ana.child);
  }
  Object.assign(ana.playerAt(1), { state: 'in', safeLeft: 0, health: HEALTH });
  ana.hit(ana.playerAt(1), RIFLES.ak.hit, ana.playerAt(1));
  assert.equal(game.seats[0].count('zap'), zaps);
});

test('the first to the tags ends it for everyone, with the same tags on every screen: won for whoever made them, and over for the rest', () => {
  const game = table(Rivals, 2, { tags: 5, lag: 3 });
  const seconds = playOut(game);
  const [ana, ben] = game.matches;
  const states = game.matches.map(({ state }) => state).sort();
  assert.deepEqual(states, ['over', 'won'], `after ${seconds.toFixed(0)} s`);
  assert.deepEqual(ana.score, ben.score);
  assert.equal(Math.max(...ana.score), 5);
  const winner = ana.state === 'won' ? ana : ben;
  assert.equal(winner.mine, 5);
  assert.deepEqual([ana.stats.tags, ben.stats.tags], [ana.score[0], ana.score[1]]);
  assert.equal(game.seats[winner.slot].count('won'), 1);
  assert.equal(game.seats[1 - winner.slot].count('over'), 1);
  // Once it's decided nothing more lands.
  const loser = winner === ana ? ben : ana;
  const health = loser.child.health;
  loser.hitBy(winner.slot, 'ak', 500);
  assert.equal(loser.child.health, health);
});

test('against each other, a friend who goes leaves the rest to carry on, and with nobody left it\'s over', () => {
  const game = table(Rivals, 3, { tags: 5 });
  const [ana, ben] = game.matches;
  game.run(0.5);
  game.leave(2);
  assert.deepEqual([ana.state, ana.endIn, ben.endIn], ['playing', null, null]);
  assert.equal(ana.playerAt(2).state, 'gone');
  assert.ok(!ana.foesOf(ana.child).includes(ana.playerAt(2)));
  assert.equal(ana.leader, ana.playerAt(1));
  game.run(1);
  game.leave(1);
  assert.equal(ana.ending, 'over');
  game.run(2.2);
  assert.equal(ana.state, 'over');
  assert.equal(game.seats[0].count('over'), 1);
});

test('against each other, how many tags each player has made is what the others say, and nobody can say their own', () => {
  const game = table(Rivals, 3, { tags: 15 });
  const [ana, ben, cal] = game.matches;
  game.run(0.3);
  // Ben says Ana has tagged him out three times, and Cal twice, and that he has tagged himself out nine times.
  const said = cleanTrooper({ ...ben.childWire(), o: [3, 9, 2, 0], a: 5, b: 2 });
  ana.placeFriend(ana.playerAt(1), said);
  cal.placeFriend(cal.playerAt(1), said);
  assert.deepEqual(ana.score, [3, 0, 2, 0]);
  assert.deepEqual(cal.score, [3, 0, 2, 0]);
  assert.deepEqual([ana.mine, cal.mine, ana.leader, cal.leader], [3, 2, ana.playerAt(2), cal.playerAt(0)]);
  // A count never goes down, whatever comes next.
  ana.placeFriend(ana.playerAt(1), cleanTrooper({ ...ben.childWire(), o: [1, 0, 0, 0] }));
  ana.update(STEP, HANDS);
  assert.deepEqual(ana.score, [3, 0, 2, 0]);
  // And what Ana's own game says of her tags is what goes on her screen.
  assert.equal(ana.stats.tags, 3);
});

test('the rules for friends say what they do, have no screen or camera in them, and what\'s told to a friend\'s game holds no more than it should', () => {
  for (const file of ['squad.js', 'team.js', 'rivals.js']) {
    const source = readFileSync(new URL(`../../games/frost-arena/${file}`, import.meta.url), 'utf8');
    assert.ok(source.startsWith('// Frost Arena'), file);
    assert.ok(!/\b(document|window|navigator|localStorage|fetch|WebSocket)\b/.test(source), file);
  }
  const [ana] = table(Rivals, 2).matches;
  assert.deepEqual(Object.keys(ana.childWire()).sort(), Object.keys(cleanTrooper({})).filter((key) => key !== 'ms').sort());
  assert.deepEqual(cleanTrooper(ana.childWire()), { ms: 0, ...ana.childWire() });
  const text = JSON.stringify({ t: 'trooper', from: 'abcdefghijkl', ms: 3_599_999, ...ana.childWire() });
  assert.ok(text.length < 240, `${text.length} characters`);
});
