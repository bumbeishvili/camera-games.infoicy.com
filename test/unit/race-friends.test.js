// Racing friends in High Five Racers: the room's rules, which run on the server, and how a friend's car
// is moved smoothly from what their game sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBall, cleanCar, cleanFoes, cleanHand, cleanName, cleanRacket, cleanShip, cleanShot, cleanTag, cleanTank, cleanTrooper, COMES_BACK_WITHIN_MS, idFor, makeCode, MAX_RACERS, MOST_BYTES, MOST_FOES, mostIn, POSE_NUMBERS, RaceRoom, takeOver, validCode } from '../../server/race-room.js';
import { BODY_KEYS } from '../../games/mighty-moves/clips.js';
import { Track } from '../../core/friends.js';
import { CarTrack, codeInLink } from '../../games/high-five-racers/friends.js';

/** A room with players who keep what they're sent, as the server's sockets would pass it on. most is how many it holds. */
function makeRoom(most = MAX_RACERS) {
  const players = [];
  let clock = 1000;
  const rules = new RaceRoom({ players: () => players }, () => clock);
  const join = (id) => {
    const player = {
      meta: null,
      heard: [],
      setMeta(meta) {
        this.meta = meta;
      },
      send(message) {
        this.heard.push(message);
      },
      say(message) {
        rules.hear(this, JSON.stringify(message));
      },
      last(type) {
        return this.heard.filter(({ t }) => t === type).at(-1);
      },
    };
    players.push(player);
    clock += 10;
    const inside = rules.arrive(player, id, null, { most });
    return inside ? player : null;
  };
  const leave = (player) => {
    players.splice(players.indexOf(player), 1);
    rules.leave(player);
  };
  return { rules, join, leave, tick: (ms) => { clock += ms; } };
}

test('codes are 3 letters and numbers that can\'t be mistaken for each other, and old 6-long links still work', () => {
  const code = makeCode((below) => Math.floor(Math.random() * below));
  assert.equal(code.length, 3);
  assert.ok(validCode(code));
  assert.ok(!validCode('A0O') && !validCode('B1I') && !validCode('CLM'), 'no 0, O, 1, I or L');
  assert.ok(!validCode('abc'));
  assert.ok(!validCode('AB') && !validCode('ABCD'));
  assert.ok(validCode('ABCDEF'), 'a link from before codes were short');
  assert.equal(codeInLink('#race=abc'), 'ABC', 'typed in small letters');
  assert.equal(codeInLink('#race=abcdef'), 'ABCDEF');
  assert.equal(codeInLink('#race=zz'), null);
  assert.equal(codeInLink(''), null);
});

test('a new game never takes a code in use, even by someone who has only just lost the connection', () => {
  const { rules, join } = makeRoom();
  const making = (id) => {
    const player = { meta: null, heard: [], setMeta(meta) { this.meta = meta; }, send(message) { this.heard.push(message); } };
    return { player, inside: rules.arrive(player, id, null, { making: true }) };
  };
  // Nobody here: it's theirs.
  const first = making('aaaaaaaa');
  assert.equal(first.inside, true);
  // Someone else making a game with the same code is told it's taken, and is not let in.
  join('bbbbbbbb');
  const second = making('cccccccc');
  assert.equal(second.inside, false);
  assert.deepEqual(second.player.heard, [{ t: 'taken' }]);
  // Joining it with the code, rather than making it, is how a friend gets in.
  assert.ok(join('dddddddd'));
  // Just after everyone has gone, the code is still theirs for a moment, for anyone coming back.
  const empty = makeRoom();
  const was = empty.join('eeeeeeee');
  empty.leave(was);
  const third = { meta: null, heard: [], setMeta(meta) { this.meta = meta; }, send(message) { this.heard.push(message); } };
  assert.equal(empty.rules.arrive(third, 'ffffffff', null, { making: true }), false);
  assert.deepEqual(third.heard, [{ t: 'taken' }]);
  empty.tick(COMES_BACK_WITHIN_MS + 1000);
  assert.equal(empty.rules.arrive(third, 'ffffffff', null, { making: true }), true);
});

test('the first in hosts, everyone hears who\'s here, and the host\'s course is raced once all are ready', () => {
  const { join } = makeRoom();
  const host = join('aaaaaaaa');
  host.say({ t: 'hi', name: 'Dato', driver: 'kit', level: 7, laps: 1 });
  const friend = join('bbbbbbbb');
  friend.say({ t: 'hi', name: 'Nino', driver: 'giraffe', level: 2, laps: 4 });
  const room = friend.last('room');
  assert.equal(room.you, 'bbbbbbbb');
  assert.deepEqual(room.members.map(({ name, driver, host: hosting }) => [name, driver, hosting]), [['Dato', 'kit', true], ['Nino', 'giraffe', false]]);

  host.say({ t: 'ready' });
  assert.equal(friend.last('go'), undefined, 'not until everyone is ready');
  friend.say({ t: 'ready' });
  for (const player of [host, friend]) {
    const { seed, ...go } = player.last('go');
    assert.deepEqual(go, { t: 'go', level: 7, length: 1, laps: 1, mode: '', team: 0, racers: ['aaaaaaaa', 'bbbbbbbb'] });
    assert.ok(Number.isInteger(seed), 'a seed, for a game laid out by chance');
  }
  const after = host.last('room').members;
  assert.ok(after.every(({ ready, racing }) => !ready && racing), 'everyone is racing, and has to be ready again for the next');
});

test('whether it\'s played together or against each other is the host\'s choice, which everyone is told, before it starts and as it does', () => {
  const { join, leave } = makeRoom(2);
  const host = join('aaaaaaaa');
  host.say({ t: 'hi', name: 'Ana', team: 1 });
  assert.equal(host.last('room').team, 1);
  const friend = join('bbbbbbbb');
  // The friend's own choice is against, and it's the host's that counts.
  friend.say({ t: 'hi', name: 'Ben', team: 0 });
  assert.equal(friend.last('room').team, 1);
  // The host changes their mind, and both hear.
  host.say({ t: 'hi', name: 'Ana', team: 0 });
  assert.deepEqual([host.last('room').team, friend.last('room').team], [0, 0]);
  host.say({ t: 'hi', name: 'Ana', team: 'yes please' });
  assert.deepEqual([host.last('room').team, friend.last('room').team], [1, 1], 'anything that isn\'t nothing is together, and only 1 is passed on');
  host.say({ t: 'ready' });
  friend.say({ t: 'ready' });
  assert.deepEqual([host.last('go').team, friend.last('go').team], [1, 1]);
  // The host goes, and the friend, who chose against, hosts: now it's theirs that counts.
  leave(host);
  assert.equal(friend.last('room').team, 0);
  // Someone who never says is against, as every game was before there was a choice.
  const { join: joinOther } = makeRoom();
  const quiet = joinOther('cccccccc');
  quiet.say({ t: 'hi', name: 'Cy' });
  assert.equal(quiet.last('room').team, 0);
});

test('only the host can start before everyone is ready, and only once they\'re ready themselves', () => {
  const { join } = makeRoom();
  const host = join('aaaaaaaa');
  const friend = join('bbbbbbbb');
  const late = join('cccccccc');
  friend.say({ t: 'ready' });
  friend.say({ t: 'go' });
  assert.equal(host.last('go'), undefined, 'a friend can\'t start it');
  host.say({ t: 'go' });
  assert.equal(host.last('go'), undefined, 'the host has to be on the grid too');
  host.say({ t: 'ready' });
  host.say({ t: 'go' });
  assert.deepEqual(late.last('go').racers, ['aaaaaaaa', 'bbbbbbbb'], 'whoever isn\'t ready waits for the next race');
});

test('cars and finishes go to the others, with only what a car message should hold', () => {
  const { join } = makeRoom();
  const one = join('aaaaaaaa');
  const two = join('bbbbbbbb');
  const three = join('cccccccc');
  for (const player of [one, two, three]) player.say({ t: 'ready' });
  one.say({ t: 'car', ms: 1500.4, d: 12.3456, x: 99, s: 20.04, l: 0, f: true, b: 0, picture: 'not this' });
  assert.equal(one.last('car'), undefined, 'nobody hears their own');
  for (const other of [two, three]) {
    assert.deepEqual(other.last('car'), { t: 'car', from: 'aaaaaaaa', ms: 1500, d: 12.35, x: 20, s: 20, l: 0, f: 1, b: 0 });
  }
  two.say({ t: 'done', ms: 61234 });
  assert.deepEqual(one.last('done'), { t: 'done', from: 'bbbbbbbb', ms: 61234, n: 0, w: 1 }, 'a race is always won by finishing');
  assert.equal(three.last('room').members.find(({ id }) => id === 'bbbbbbbb').racing, false);
  two.say({ t: 'done', ms: 1 });
  assert.equal(one.heard.filter(({ t }) => t === 'done').length, 1, 'a finish counts once');
});

test('a room holds 4 cars, a host who leaves hands over, and leaving can start the race for the rest', () => {
  const { join, leave } = makeRoom();
  const players = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd'].map(join);
  assert.equal(MAX_RACERS, 4);
  assert.ok(players.every(Boolean));
  assert.equal(join('eeeeeeee'), null, 'the fifth is told the room is full');

  leave(players[0]);
  assert.equal(players[1].last('room').members.find(({ host }) => host).id, 'bbbbbbbb');
  players[1].say({ t: 'ready' });
  players[2].say({ t: 'ready' });
  assert.equal(players[1].last('go'), undefined);
  leave(players[3]);
  assert.deepEqual(players[1].last('go').racers, ['bbbbbbbb', 'cccccccc'], 'everyone left was ready');
});

test('someone who loses the connection mid-race comes back as themselves, still racing', () => {
  const fresh = () => 'newnewnew';
  const others = [{ meta: { id: 'aaaaaaaa' } }, { meta: null }];
  assert.equal(idFor(others, 'bbbbbbbb', fresh), 'bbbbbbbb', 'their old id, which nobody has now');
  assert.equal(idFor(others, 'aaaaaaaa', fresh), 'newnewnew', 'never someone else\'s');
  assert.equal(idFor(others, 'bad id!', fresh), 'newnewnew');
  assert.equal(idFor(others, null, fresh), 'newnewnew');

  const { join, leave } = makeRoom();
  const host = join('aaaaaaaa');
  let friend = join('bbbbbbbb');
  host.say({ t: 'ready' });
  friend.say({ t: 'ready' });
  leave(friend);
  friend = join('bbbbbbbb');
  friend.say({ t: 'hi', name: 'Nino', racing: true });
  const back = host.last('room').members.find(({ id }) => id === 'bbbbbbbb');
  assert.equal(back.racing, true);
  friend.say({ t: 'done', ms: 65000 });
  assert.deepEqual(host.last('done'), { t: 'done', from: 'bbbbbbbb', ms: 65000, n: 0, w: 1 }, 'and their finish counts');
  // Saying so on the grid, waiting for a race, doesn't make anyone a racer.
  friend.say({ t: 'ready' });
  friend.say({ t: 'hi', name: 'Nino', racing: true });
  assert.equal(host.last('room').members.find(({ id }) => id === 'bbbbbbbb').racing, false);
});

test('coming back while the old connection is still there, as when the wifi drops, takes it over and keeps hosting', () => {
  const { rules, join } = makeRoom();
  const host = join('aaaaaaaa');
  host.say({ t: 'hi', name: 'Ana', level: 6 });
  const friend = join('bbbbbbbb');
  host.say({ t: 'ready' });
  friend.say({ t: 'ready' });
  let closed = 0;
  host.close = () => {
    closed += 1;
  };
  // The new connection is in the room before it's given anyone's id.
  const back = { meta: null, heard: [], setMeta(meta) { this.meta = meta; }, send(message) { this.heard.push(message); } };
  const players = [host, friend, back];
  const kept = takeOver(players, 'aaaaaaaa');
  assert.equal(closed, 1, 'the old connection goes');
  assert.equal(host.meta, null);
  assert.ok(rules.arrive(back, 'aaaaaaaa', kept));
  assert.deepEqual(back.meta, { ...kept, id: 'aaaaaaaa', seen: back.meta.seen });
  assert.equal(typeof back.meta.seen, 'number');
  assert.equal(back.meta.racing, true);
  assert.equal(back.meta.name, 'Ana');
  assert.equal(takeOver(players, 'cccccccc'), null, 'nobody to take over');
  assert.equal(takeOver(players, 'not valid!'), null);
});

test('back within two minutes of a connection that did close, as when a laptop sleeps, a player carries on as before, still hosting', () => {
  const { rules, join, leave, tick } = makeRoom();
  const host = join('aaaaaaaa');
  host.say({ t: 'hi', name: 'Ana' });
  const friend = join('bbbbbbbb');
  host.say({ t: 'ready' });
  friend.say({ t: 'ready' });
  const joined = host.meta.joined;
  leave(host);
  assert.equal(friend.last('room').members.find(({ host: hosting }) => hosting).id, 'bbbbbbbb', 'meanwhile the friend hosts');
  tick(90_000);
  const kept = rules.cameBack('aaaaaaaa');
  assert.equal(kept.joined, joined);
  assert.equal(kept.racing, true);
  assert.equal(rules.cameBack('aaaaaaaa'), null, 'only once');
  // Too long gone, and they start again.
  leave(friend);
  tick(COMES_BACK_WITHIN_MS + 1000);
  assert.equal(rules.cameBack('bbbbbbbb'), null);
});

test('names are cleaned, and a flood of messages is cut off', () => {
  assert.equal(cleanName('  <b>Dato</b>  the   great racer!!  '), 'bDatob the great');
  assert.equal(cleanName('ნინო'), 'ნინო');
  assert.deepEqual(cleanCar({ ms: -5, d: 'x', x: -30, s: 500, l: 3.333, f: 0, b: 'yes' }), { ms: 0, d: 0, x: -20, s: 100, l: 3.33, f: 0, b: 1 });

  const { join, tick } = makeRoom();
  const one = join('aaaaaaaa');
  const two = join('bbbbbbbb');
  for (let i = 0; i < 100; i += 1) one.say({ t: 'car', ms: i, d: i, x: 0, s: 0, l: 0, f: 0, b: 0 });
  const heard = two.heard.filter(({ t }) => t === 'car').length;
  assert.ok(heard <= 40 && heard > 0, `heard ${heard}`);
  tick(1000);
  one.say({ t: 'car', ms: 1, d: 1, x: 0, s: 0, l: 0, f: 0, b: 0, extra: 'x'.repeat(2000) });
  assert.equal(two.heard.filter(({ t }) => t === 'car').length, heard, 'too big is ignored');
});

test('a friend\'s car moves smoothly between messages, even when some arrive late and bunched up', () => {
  const track = new CarTrack();
  assert.equal(track.at(0), null);
  // Sent every 100 ms at 20 m/s. The first three arrive on time, 50 ms after they're sent, and the next three
  // late, all together.
  const sample = (ms) => ({ ms, d: ms * 0.02, x: 1, s: 20, l: 0, f: 0, b: 0 });
  track.push(sample(0), 5050);
  track.push(sample(100), 5150);
  track.push(sample(200), 5250);
  // Shown 120 ms behind the best delivery: at 5300, the car is where it was 130 ms after "GO!".
  const seen = [5300, 5350, 5400, 5450, 5500].map((now) => track.at(now).d);
  track.push(sample(300), 5550);
  track.push(sample(400), 5551);
  track.push(sample(500), 5552);
  seen.push(track.at(5550).d, track.at(5600).d);
  assert.ok(Math.abs(seen[0] - 2.6) < 0.01, `${seen}`);
  // 50 ms apart at 20 m/s is a metre each time, waiting for the late ones or not.
  for (let i = 1; i < seen.length; i += 1) assert.ok(Math.abs(seen[i] - seen[i - 1] - 1) < 0.1, `steady: ${seen}`);
  // With nothing new, it carries on for half a second at the speed it was going, then waits there.
  assert.ok(Math.abs(track.at(6172).d - 20) < 0.01, `${track.at(6172).d}`);
  assert.equal(track.at(9000).d, track.at(7000).d);
  track.clear();
  assert.equal(track.at(9000), null);
});

test('in Sky Wings, a friend\'s plane fires at a pirate ahead of it, and never while the child rests', async () => {
  const { Flight } = await import('../../games/sky-wings/flight.js');
  const flight = new Flight({ planes: 3, levelNumber: 1, random: () => 0.5 });
  flight.begin();
  const enemy = flight.flying[0];
  // A friend 80 m behind the pirate, pointing straight at it.
  const mate = { x: enemy.x, y: enemy.y, z: enemy.z + 80, heading: 0, pitch: 0, roll: 0, live: true };
  flight.mates = [mate];
  const keepStill = () => Object.assign(enemy, { x: mate.x, y: mate.y, z: mate.z - 80, mode: 'cross', way: { x: mate.x, y: mate.y, z: mate.z - 80 }, modeLeft: 5 });
  const before = enemy.hitsLeft;
  for (let i = 0; i < 60; i += 1) {
    keepStill();
    flight.update(1 / 60, { out: true });
  }
  assert.ok(enemy.hitsLeft < before || enemy.state !== 'flying', 'the friend hit the pirate');

  // Resting, nothing fires at all: not the child's guns, not a friend's.
  const shots = () => flight.shots.filter(({ kind }) => kind === 'helper').length;
  for (let i = 0; i < 400; i += 1) flight.update(1 / 60, { out: false });
  assert.equal(flight.resting, true);
  const resting = shots();
  for (let i = 0; i < 60; i += 1) flight.update(1 / 60, { out: false });
  assert.ok(shots() <= resting, 'no new shots while resting');
  // A friend who has gone doesn't fire either.
  mate.live = false;
  assert.equal(flight.mateFires(mate, 1), undefined);
});

test('the server passes on where a plane is, and how a flight went, with only what they should hold', () => {
  const { join } = makeRoom();
  const one = join('aaaaaaaa');
  const two = join('bbbbbbbb');
  one.say({ t: 'ready' });
  two.say({ t: 'ready' });
  one.say({ t: 'plane', ms: 2000, x: 12.345, y: 99999, z: -40, h: 3.14159, p: 0.2, r: -0.3, s: 55.55, f: 1, picture: 'not this' });
  assert.deepEqual(two.last('plane'), { t: 'plane', from: 'aaaaaaaa', ms: 2000, x: 12.35, y: 2000, z: -40, h: 3.142, p: 0.2, r: -0.3, s: 55.6, f: 1 });
  one.say({ t: 'done', ms: 90000, n: 4, w: 0 });
  assert.deepEqual(two.last('done'), { t: 'done', from: 'aaaaaaaa', ms: 90000, n: 4, w: 0 }, 'shot down, with 4 dropped');
});

test('in Balloon Pop, scores go to the others, and the host\'s number of balloons and maths are what everyone plays', () => {
  const { join } = makeRoom();
  const host = join('aaaaaaaa');
  host.say({ t: 'hi', name: 'Ana', level: 3, length: 60, mode: 'times' });
  const friend = join('bbbbbbbb');
  friend.say({ t: 'hi', name: 'Ben', level: 1, length: 20, mode: 'add<script>' });
  host.say({ t: 'ready' });
  friend.say({ t: 'ready' });
  const { seed, ...go } = friend.last('go');
  assert.deepEqual(go, { t: 'go', level: 3, length: 60, laps: 60, mode: 'times', team: 0, racers: ['aaaaaaaa', 'bbbbbbbb'] });
  assert.equal(seed, host.last('go').seed, 'the same seed for everyone');
  host.say({ t: 'score', ms: 4000, n: 7, extra: 'not this' });
  assert.deepEqual(friend.last('score'), { t: 'score', from: 'aaaaaaaa', ms: 4000, n: 7 });
  friend.say({ t: 'done', ms: 60000, n: 12, w: 1 });
  assert.deepEqual(host.last('done'), { t: 'done', from: 'bbbbbbbb', ms: 60000, n: 12, w: 1 });
});

test('a friend\'s glove in Balloon Pop: only its place, whether it\'s open, and its 21 points, rounded', () => {
  const points = Array.from({ length: 42 }, (_, index) => (index % 2 ? 0.123456 : -9));
  const hand = cleanHand({ ms: 900, x: 0.51234, y: 2, v: 1, o: 1, p: points, picture: 'not this' });
  assert.deepEqual(Object.keys(hand), ['ms', 'x', 'y', 'v', 'o', 'p']);
  assert.equal(hand.x, 0.512);
  assert.equal(hand.y, 1.5, 'no further off the screen than half of it');
  assert.equal(hand.p.length, 42);
  assert.deepEqual(hand.p.slice(0, 2), [-4, 0.12]);
  // Anything but 21 points is none, and with none it can't be seen.
  assert.deepEqual(cleanHand({ v: 1, p: [1, 2, 3] }).p, []);
  assert.equal(cleanHand({ v: 1, p: [1, 2, 3] }).v, 0);
  assert.ok(JSON.stringify({ t: 'hand', from: 'abcdefghijkl', ...cleanHand({ ms: 3_599_999, x: -0.5, y: -0.5, v: 1, o: 1, p: Array(42).fill(-3.99) }) }).length < 600, 'well under the most a message can be');
});

test('a list of points moves smoothly from one message to the next', () => {
  const track = new Track({ lerp: ['x'], lists: ['p'], steps: ['v'] });
  track.push({ ms: 0, x: 0, p: [0, 0], v: 1 }, 1000);
  track.push({ ms: 100, x: 1, p: [1, -1], v: 1 }, 1100);
  const half = track.at(1000 + 50 + 120);
  assert.ok(Math.abs(half.x - 0.5) < 1e-9);
  assert.deepEqual(half.p.map((value) => Math.round(value * 10) / 10), [0.5, -0.5]);
  // A hand that's gone has no points, and that's a step rather than a blend.
  track.push({ ms: 200, x: 1, p: [], v: 0 }, 1200);
  assert.deepEqual(track.at(1000 + 175 + 120).p, []);
});

test('in Balloon Pop, only the host\'s balloons go to everyone, and each balloon goes to the first hand that claims it', () => {
  const { join } = makeRoom();
  const host = join('aaaaaaaa');
  const friend = join('bbbbbbbb');
  host.say({ t: 'ready' });
  friend.say({ t: 'ready' });
  host.say({ t: 'world', ms: 500, b: [[3, 0.51234, 0.8, 0.078, 2, -1, 0], [4, 0.2, 0.5, 0.1, 1, 7, 5], 'junk'], q: '3 + 4 = ?<b>', qa: 0 });
  assert.deepEqual(friend.last('world'), { t: 'world', from: 'aaaaaaaa', ms: 500, b: [[3, 0.512, 0.8, 0.078, 2, -1, 0], [4, 0.2, 0.5, 0.1, 1, 7, 5]], q: '3 + 4 = ?', qa: 0 });
  friend.say({ t: 'world', ms: 600, b: [[9, 0, 0, 0, 0, -1, 0]], q: '', qa: 0 });
  assert.equal(host.last('world'), undefined, 'a friend\'s balloons go nowhere');
  // Both claim balloon 3: the first has it, and everyone hears so, once.
  friend.say({ t: 'claim', k: 3 });
  host.say({ t: 'claim', k: 3 });
  for (const player of [host, friend]) {
    assert.deepEqual(player.heard.filter(({ t }) => t === 'claimed'), [{ t: 'claimed', k: 3, by: 'bbbbbbbb' }]);
  }
  host.say({ t: 'claim', k: 4 });
  assert.deepEqual(friend.last('claimed'), { t: 'claimed', k: 4, by: 'aaaaaaaa' });
  // A new game starts with every balloon unclaimed.
  host.say({ t: 'done', ms: 1 });
  friend.say({ t: 'done', ms: 1 });
  host.say({ t: 'ready' });
  friend.say({ t: 'ready' });
  friend.say({ t: 'claim', k: 3 });
  assert.deepEqual(host.last('claimed'), { t: 'claimed', k: 3, by: 'bbbbbbbb' });
});

test('in Mighty Moves, a fight holds two, and each fighter\'s moves go to the other, with only what a move should hold', () => {
  assert.equal(mostIn('mighty-moves'), 2);
  assert.equal(mostIn('sky-wings'), MAX_RACERS);
  assert.equal(mostIn(''), MAX_RACERS);
  const { join } = makeRoom(mostIn('mighty-moves'));
  const ana = join('aaaaaaaa');
  const ben = join('bbbbbbbb');
  assert.equal(join('cccccccc'), null, 'a third is told the fight is full');
  ana.say({ t: 'hit', r: 1, m: 'stomp', d: 14, tot: 14 });
  assert.equal(ben.last('hit'), undefined, 'nothing goes before the fight has started');

  ana.say({ t: 'ready' });
  ben.say({ t: 'ready' });
  ana.say({ t: 'hit', ms: 1500.4, r: 1, m: 'stomp', d: 16.8049, tot: 30.8049, sm: 0, sg: true, sd: 'r', picture: 'not this' });
  assert.deepEqual(ben.last('hit'), { t: 'hit', from: 'aaaaaaaa', ms: 1500, r: 1, m: 'stomp', d: 16.8, tot: 30.8, sm: 0, sg: 1, sd: 'r' });
  assert.equal(ana.last('hit'), undefined, 'nobody hears their own');
  ben.say({ t: 'hit', r: 12, m: '<b>stomp</b>', d: 999, tot: -5, sd: 'up' });
  assert.deepEqual(ana.last('hit'), { t: 'hit', from: 'bbbbbbbb', ms: 0, r: 9, m: '', d: 200, tot: 0, sm: 0, sg: 0, sd: '' });

  // Both knock the other out at once: the round is whoever's claim got there first, and both are told, once.
  ben.say({ t: 'claim', k: 1 });
  ana.say({ t: 'claim', k: 1 });
  for (const player of [ana, ben]) {
    assert.deepEqual(player.heard.filter(({ t }) => t === 'claimed'), [{ t: 'claimed', k: 1, by: 'bbbbbbbb' }]);
  }
  ana.say({ t: 'claim', k: 2 });
  assert.deepEqual(ben.last('claimed'), { t: 'claimed', k: 2, by: 'aaaaaaaa' });
});

test('in Mighty Moves, each fighter\'s body goes to the other, as only its numbers, rounded, or none at all', () => {
  assert.equal(BODY_KEYS.length, POSE_NUMBERS, 'the game sends what the server passes on');
  const { join } = makeRoom(mostIn('mighty-moves'));
  const ana = join('aaaaaaaa');
  const ben = join('bbbbbbbb');
  ana.say({ t: 'ready' });
  ben.say({ t: 'ready' });
  const body = BODY_KEYS.map((key, index) => (index === 3 ? 99 : 0.123456));
  ana.say({ t: 'pose', ms: 2000.6, p: body, picture: 'not this' });
  assert.deepEqual(ben.last('pose'), { t: 'pose', from: 'aaaaaaaa', ms: 2001, p: BODY_KEYS.map((key, index) => (index === 3 ? 3 : 0.12)) });
  ana.say({ t: 'pose', ms: 2100, p: [1, 2, 3] });
  assert.deepEqual(ben.last('pose').p, [], 'a body that isn\'t one is passed on as none');
  ana.say({ t: 'pose', ms: 2200, p: [] });
  assert.deepEqual(ben.last('pose').p, [], 'and none, when the camera can\'t see them, is none');
});

test('a Bounce Back game has room for two, one on each side of the net, and the other games\' still have room for four', () => {
  assert.equal(mostIn('bounce-back'), 2);
  for (const game of ['', 'sky-wings', 'balloon-pop']) assert.equal(mostIn(game), MAX_RACERS);
  const { join, leave } = makeRoom(mostIn('bounce-back'));
  const host = join('aaaaaaaa');
  const friend = join('bbbbbbbb');
  assert.ok(host && friend);
  assert.equal(join('cccccccc'), null, 'a third is told the game is full');
  assert.equal(host.last('room').members.length, 2);
  // Someone going makes room again.
  leave(friend);
  assert.ok(join('dddddddd'));
  host.say({ t: 'ready' });
  host.last('room').members.forEach(({ id }) => assert.notEqual(id, 'cccccccc'));
});

test('in Bounce Back, each racket goes to the other player, only the host\'s ball does, and a shot goes only to the host', () => {
  const { join } = makeRoom(mostIn('bounce-back'));
  const host = join('aaaaaaaa');
  const friend = join('bbbbbbbb');
  // A shot before the game has started counts for nothing.
  friend.say({ t: 'shot', ms: 10, k: 1, x: 0.5, y: 0.5, vx: -0.5, vy: 0.3 });
  assert.equal(host.last('shot'), undefined);
  host.say({ t: 'ready' });
  friend.say({ t: 'ready' });
  const points = Array.from({ length: 42 }, (_, index) => (index % 2 ? 0.123456 : -9));
  friend.say({ t: 'racket', ms: 1500.4, x: 0.61234, y: 9, v: 1, o: 1, r: 0.2099, g: 0.704, p: points, picture: 'not this' });
  const racket = host.last('racket');
  assert.deepEqual(Object.keys(racket), ['t', 'from', 'ms', 'x', 'y', 'v', 'o', 'r', 'g', 'p']);
  assert.equal(racket.from, 'bbbbbbbb');
  assert.equal(racket.ms, 1500);
  assert.equal(racket.x, 0.612);
  assert.equal(racket.y, 3, 'no further off the court than it can be');
  assert.equal(racket.r, 0.21);
  assert.deepEqual(racket.p.slice(0, 2), [-4, 0.12]);
  assert.equal(friend.last('racket'), undefined, 'nobody hears their own');

  host.say({ t: 'ball', ms: 2000, x: -0.4, y: 0.55, vx: 0.71234, vy: -0.2, s: 1, k: 7, a: 2, b: 1, n: 3, f: 0, l: 1, sv: 1, g: 0, r: 0, w: 0, extra: 'not this' });
  assert.deepEqual(friend.last('ball'), { t: 'ball', from: 'aaaaaaaa', ms: 2000, x: -0.4, y: 0.55, vx: 0.712, vy: -0.2, s: 1, k: 7, a: 2, b: 1, n: 3, f: 0, l: 1, sv: 1, g: 0, r: 0, w: 0 });
  friend.say({ t: 'ball', ms: 2100, x: 0, y: 0, vx: 0, vy: 0, s: 3, k: 99, a: 0, b: 5, n: 0, f: 0, l: 0, sv: 0, g: 2, r: 0, w: 1 });
  assert.equal(host.last('ball'), undefined, 'a friend\'s ball goes nowhere');

  friend.say({ t: 'shot', ms: 2200, k: 7, x: 0.5, y: 0.512345, vx: -0.6, vy: 0.31, picture: 'not this' });
  assert.deepEqual(host.last('shot'), { t: 'shot', from: 'bbbbbbbb', ms: 2200, k: 7, x: 0.5, y: 0.512, vx: -0.6, vy: 0.31 });
  host.say({ t: 'shot', ms: 2300, k: 8, x: -0.5, y: 0.5, vx: 0.6, vy: 0.3 });
  assert.equal(friend.last('shot'), undefined, 'the host\'s own game runs the ball, so its shots go nowhere');
});

test('the Bounce Back messages hold only what they should, rounded, and well under the most a message can be', () => {
  assert.deepEqual(cleanRacket({ ms: -5, x: 'x', y: -9, v: 0, o: 1, r: 9, g: -1, p: [1, 2] }), { ms: 0, x: 0, y: -0.5, v: 0, o: 0, r: 0.6, g: 0, p: [] });
  assert.equal(cleanRacket({ v: 1, o: 1 }).o, 1, 'open without its points, which are only for drawing it');
  assert.deepEqual(Object.keys(cleanBall({})), ['ms', 'x', 'y', 'vx', 'vy', 's', 'k', 'a', 'b', 'n', 'f', 'l', 'sv', 'g', 'r', 'w']);
  const ball = cleanBall({ s: 9, a: 500, f: 99, l: -3, sv: 7, g: 1.6, vx: 100, r: 'yes', w: 0 });
  assert.deepEqual([ball.s, ball.a, ball.f, ball.l, ball.sv, ball.g, ball.vx, ball.r, ball.w], [3, 99, 7, 0, 2, 2, 6, 1, 0]);
  assert.deepEqual(cleanShot({ k: -2, x: 3, y: 0.1234, vx: -99, vy: 'up' }), { ms: 0, k: 0, x: 2, y: 0.123, vx: -6, vy: 0 });
  const biggest = JSON.stringify({ t: 'racket', from: 'abcdefghijkl', ...cleanRacket({ ms: 3_599_999, x: -1.999, y: 2.999, v: 1, o: 1, r: 0.599, g: 1.99, p: Array(42).fill(-3.99) }) });
  assert.ok(biggest.length < 700, `${biggest.length}`);
  assert.ok(JSON.stringify({ t: 'ball', from: 'abcdefghijkl', ...cleanBall({ ms: 3_599_999, x: -1.999, y: 2.999, vx: -5.999, vy: -5.999, s: 3, k: 999_999, a: 99, b: 99, n: 999, f: 7, l: 2, sv: 2, g: 2, r: 1, w: 1 }) }).length < 300);
});

test('joining by a code with no game is told so, and a friend coming back still finds theirs', () => {
  const { rules, join, leave, tick } = makeRoom();
  const joiner = () => ({ meta: null, heard: [], setMeta(meta) { this.meta = meta; }, send(message) { this.heard.push(message); } });
  const early = joiner();
  assert.equal(rules.arrive(early, 'aaaaaaaa', null, { fresh: true }), false);
  assert.deepEqual(early.heard, [{ t: 'nobody' }]);
  // Once someone's made it, a friend joins with the code.
  const host = join('bbbbbbbb');
  const friend = joiner();
  assert.equal(rules.arrive(friend, 'cccccccc', null, { fresh: true }), true);
  // The host's connection drops: for two minutes the game is still there for a friend to join.
  leave(host);
  tick(60_000);
  assert.equal(rules.arrive(joiner(), 'dddddddd', null, { fresh: true }), true);
});

test('a connection that has said nothing for a long while gives up its place, so a friend coming back can join', () => {
  const { rules, join, tick } = makeRoom(2);
  const host = join('aaaaaaaa');
  const friend = join('bbbbbbbb');
  let heardAt = 1000;
  Object.defineProperty(friend, 'heardAt', { get: () => heardAt });
  friend.close = () => {
    friend.closed = true;
  };
  const back = () => ({ meta: null, heard: [], setMeta(meta) { this.meta = meta; }, send(message) { this.heard.push(message); } });
  // Heard from a minute ago: still there, and the room is full.
  tick(60_000);
  heardAt = 30_000;
  const third = back();
  assert.equal(rules.arrive(third, 'cccccccc', null, { most: 2 }), false);
  assert.deepEqual(third.heard, [{ t: 'full' }]);
  // Silent for over a minute and a half: that connection has died, and gives up its place.
  tick(60_000);
  const fourth = back();
  assert.equal(rules.arrive(fourth, 'dddddddd', null, { most: 2 }), true);
  assert.equal(friend.closed, true);
  assert.equal(friend.meta, null);
  // And they can still come back as themselves.
  assert.equal(rules.cameBack('bbbbbbbb').id, 'bbbbbbbb');
  assert.ok(host.meta);
});

test('in Leap Trail, each runner goes to the others, with only what a runner message should hold, and everyone starts from the same seed', () => {
  const { join } = makeRoom();
  const ana = join('aaaaaaaa');
  const ben = join('bbbbbbbb');
  ana.say({ t: 'ready' });
  ben.say({ t: 'ready' });
  assert.equal(ana.last('go').seed, ben.last('go').seed);
  ana.say({ t: 'runner', ms: 1200.6, d: 123.4567, x: -1.756, y: 2.3456, s: 14.04, j: true, w: 0, b: 2.4, picture: 'not this' });
  assert.deepEqual(ben.last('runner'), { t: 'runner', from: 'aaaaaaaa', ms: 1201, d: 123.46, x: -1.76, y: 2.35, s: 14, j: 1, w: 0, b: 2 });
  ana.say({ t: 'runner', d: 'far', x: 99, y: -3, s: 500 });
  assert.deepEqual(ben.last('runner'), { t: 'runner', from: 'aaaaaaaa', ms: 0, d: 0, x: 5, y: 0, s: 60, j: 0, w: 0, b: 0 });
  assert.equal(ana.last('runner'), undefined, 'nobody hears their own');
});

test('a Tank Patrol battle holds two tanks, and a third is told it\'s full, while the other games still hold four', () => {
  assert.equal(mostIn('tank-patrol'), 2);
  for (const game of ['', 'balloon-pop', 'leap-trail', 'giraffe-maze']) assert.equal(mostIn(game), MAX_RACERS);
  const { join, leave } = makeRoom(mostIn('tank-patrol'));
  const ana = join('aaaaaaaa');
  const ben = join('bbbbbbbb');
  assert.ok(ana && ben);
  assert.equal(join('cccccccc'), null, 'a third is told the game is full');
  assert.equal(ana.last('room').members.length, 2);
  leave(ben);
  assert.ok(join('dddddddd'), 'someone going makes room again');
});

test('in Tank Patrol, each tank goes to the other player with only what a tank should hold, and its hits count only once the battle has started', () => {
  const { join } = makeRoom(mostIn('tank-patrol'));
  const ana = join('aaaaaaaa');
  ana.say({ t: 'hi', name: 'Ana', driver: 'giraffe', level: 4, length: 6, mode: 'fast' });
  const ben = join('bbbbbbbb');
  ben.say({ t: 'hi', name: 'Ben', driver: 'giraffe', level: 1, length: 15, mode: 'slow' });
  // A hit before the battle has started counts for nothing.
  ana.say({ t: 'hit', ms: 10, r: 1, m: 'ball', d: 1, tot: 1, sm: 0, sg: 0, sd: '' });
  assert.equal(ben.last('hit'), undefined);
  ana.say({ t: 'ready' });
  ben.say({ t: 'ready' });
  // Both play the host's battle: how long it lasts, from her 6 tanks, and her speed.
  for (const player of [ana, ben]) {
    const { length, mode, racers } = player.last('go');
    assert.deepEqual([length, mode, racers], [6, 'fast', ['aaaaaaaa', 'bbbbbbbb']]);
  }
  ana.say({ t: 'tank', ms: 1500.4, x: -13.987, z: 19.123, h: 1.5708, a: -3.14159, s: 9.96, n: 12, r: 0, o: 1, picture: 'not this' });
  assert.deepEqual(ben.last('tank'), { t: 'tank', from: 'aaaaaaaa', ms: 1500, x: -13.99, z: 19.12, h: 1.571, a: -3.142, s: 10, n: 12, r: 0, o: 1 });
  assert.equal(ana.last('tank'), undefined, 'nobody hears their own');
  // Ana's shot has hit Ben's tank, as her game decides: her third hit.
  ana.say({ t: 'hit', ms: 2000, r: 1, m: 'ball', d: 1, tot: 3, sm: 0, sg: 0, sd: '' });
  assert.deepEqual(ben.last('hit'), { t: 'hit', from: 'aaaaaaaa', ms: 2000, r: 1, m: 'ball', d: 1, tot: 3, sm: 0, sg: 0, sd: '' });
  assert.equal(ana.last('hit'), undefined);
  // And each says how many hits they made at the end.
  ben.say({ t: 'done', ms: 120000, n: 2, w: 1 });
  assert.deepEqual(ana.last('done'), { t: 'done', from: 'bbbbbbbb', ms: 120000, n: 2, w: 1 });
});

test('a tank message holds only what it should, rounded and kept to the valley, and well under the most a message can be', () => {
  assert.deepEqual(Object.keys(cleanTank({})), ['ms', 'x', 'z', 'h', 'a', 's', 'n', 'r', 'o']);
  assert.deepEqual(cleanTank({ ms: -1, x: 'far', z: 999, h: 9, a: -9, s: 99, n: -3, r: 'yes', o: 0, picture: 'not this' }), { ms: 0, x: 0, z: 40, h: 4, a: -4, s: 30, n: 0, r: 1, o: 0 });
  const biggest = JSON.stringify({ t: 'tank', from: 'abcdefghijkl', ...cleanTank({ ms: 3_599_999, x: -59.99, z: -49.99, h: -3.142, a: -3.142, s: 29.9, n: 99_999, r: 1, o: 1 }) });
  assert.ok(biggest.length < 200, `${biggest.length} characters`);
});

test('playing together against the computer\'s, only the host\'s game tells of them, and a hit on one goes only to the host\'s game', () => {
  const { join } = makeRoom(mostIn('tank-patrol'));
  const ana = join('aaaaaaaa');
  ana.say({ t: 'hi', name: 'Ana', driver: 'giraffe', level: 4, length: 6, mode: 'fast', team: 1 });
  const ben = join('bbbbbbbb');
  ben.say({ t: 'hi', name: 'Ben', driver: 'giraffe', level: 1, length: 15, mode: 'slow', team: 0 });
  // A hit before it has started counts for nothing.
  ben.say({ t: 'tag', k: 7, n: 1 });
  assert.equal(ana.last('tag'), undefined);
  ana.say({ t: 'ready' });
  ben.say({ t: 'ready' });
  assert.equal(ben.last('go').team, 1, 'the host\'s choice');
  // Ana's game runs the robot tanks, and tells Ben's where they and their shells are, as rows of numbers.
  const foes = { e: [[7, 0, -12.345, -20.5, 3.1416, -1.5, 4, 4, 3.25], [8, 2, 30, -18, 0, 0, 9, 9, 0]], s: [[12, 30, -18, 12, 20, 0.2504, 3.8, 1, 8]], n: [3, 12, 2, 1, 0, 0] };
  ana.say({ t: 'foes', ms: 1500.4, ...foes, picture: 'not this' });
  assert.deepEqual(ben.last('foes'), { t: 'foes', from: 'aaaaaaaa', ms: 1500, e: [[7, 0, -12.345, -20.5, 3.142, -1.5, 4, 4, 3.25], [8, 2, 30, -18, 0, 0, 9, 9, 0]], s: [[12, 30, -18, 12, 20, 0.25, 3.8, 1, 8]], n: [3, 12, 2, 1, 0, 0] });
  assert.equal(ana.last('foes'), undefined, 'nobody hears their own');
  // Ben's game doesn't run them, so nothing it says of them is passed on.
  ben.say({ t: 'foes', ms: 1600, ...foes });
  assert.equal(ana.last('foes'), undefined);
  // Ben's shot has hit robot tank 7 twice so far, as his game decides: only Ana's game, which runs it, hears.
  ben.say({ t: 'tag', k: 7.2, n: 2, also: 'not this' });
  assert.deepEqual(ana.last('tag'), { t: 'tag', from: 'bbbbbbbb', k: 7, n: 2 });
  assert.equal(ben.last('tag'), undefined);
  // The host's own hits are its own game's business, and go nowhere.
  ana.say({ t: 'tag', k: 7, n: 1 });
  assert.equal(ben.last('tag'), undefined);
});

test('what\'s told of the computer\'s side is only numbers, in rows, no more of them than there could be, and a hit only which one and how many', () => {
  assert.deepEqual(cleanFoes({}), { ms: 0, e: [], s: [], n: [] });
  assert.deepEqual(cleanFoes({ ms: 5, e: 'all of them', s: [1, 'two', null], n: { a: 1 } }), { ms: 5, e: [], s: [], n: [] });
  // Anything that isn't a number is none, and each is kept within bounds and rounded: only numbers come out.
  const [row] = cleanFoes({ e: [[1, 'x', null, 1e9, -1e9, 0.12345, {}, ['y'], NaN, '<b>']] }).e;
  assert.deepEqual(row, [1, 0, 0, 1_000_000, -1_000_000, 0.123, 0, 0, 0, 0]);
  assert.ok(row.every((value) => typeof value === 'number' && Number.isFinite(value)));
  const many = cleanFoes({ e: Array.from({ length: 60 }, (_, index) => Array.from({ length: 30 }, () => index)), n: Array.from({ length: 40 }, () => 1) });
  assert.equal(many.e.length, MOST_FOES);
  assert.ok(many.e.every((row) => row.length === 12));
  assert.equal(many.n.length, 12);
  assert.deepEqual(cleanTag({ k: -4, n: 'lots', picture: 'not this' }), { k: 0, n: 0 });
  assert.deepEqual(cleanTag({ k: 2_000_000, n: 5000 }), { k: 1_000_000, n: 1000 });
  assert.ok(MOST_BYTES >= 1800);
});

test('in Frost Arena up to four are in the yard, and each one\'s game tells the others where they are and who has tagged them', () => {
  assert.equal(mostIn('frost-arena'), 4);
  const { join } = makeRoom(mostIn('frost-arena'));
  const [ana, ben, cal, dee] = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd'].map((id) => join(id));
  assert.equal(join('eeeeeeee'), null, 'a fifth is told it\'s full');
  for (const each of [ana, ben, cal, dee]) each.say({ t: 'ready' });
  assert.deepEqual(dee.last('go').racers, ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd']);
  ben.say({ t: 'trooper', ms: 1500.4, x: -13.987, z: 12.004, h: 1.5708, s: 3.24, p: 1, f: 1, n: 12, k: 1, v: 63.4, u: 0, g: 0, r: 0, o: [2, 0, 1, 0], a: 4.2, b: 21, picture: 'not this' });
  const heard = { t: 'trooper', from: 'bbbbbbbb', ms: 1500, x: -13.99, z: 12, h: 1.571, s: 3.2, p: 1, f: 1, n: 12, k: 1, v: 63, u: 0, g: 0, r: 0, o: [2, 0, 1, 0], a: 4, b: 21 };
  for (const each of [ana, cal, dee]) assert.deepEqual(each.last('trooper'), heard);
  assert.equal(ben.last('trooper'), undefined, 'nobody hears their own');
  // Against each other, a hit on another player is decided by the game that fired, and everyone else hears: r is
  // which player, sm the lighter rifle, and tot how many so far.
  ana.say({ t: 'hit', ms: 2000, r: 3, m: 'tag', d: 1, tot: 7, sm: 1, sg: 0, sd: '' });
  assert.deepEqual(cal.last('hit'), { t: 'hit', from: 'aaaaaaaa', ms: 2000, r: 3, m: 'tag', d: 1, tot: 7, sm: 1, sg: 0, sd: '' });
  assert.equal(ana.last('hit'), undefined);
});

test('a trooper message holds only what it should, rounded and kept to the yard, always with four counts, and well under the most a message can be', () => {
  assert.deepEqual(Object.keys(cleanTrooper({})), ['ms', 'x', 'z', 'h', 's', 'p', 'f', 'n', 'k', 'v', 'u', 'g', 'r', 'o', 'a', 'b']);
  assert.deepEqual(cleanTrooper({}), { ms: 0, x: 0, z: 0, h: 0, s: 0, p: 0, f: 0, n: 0, k: 0, v: 0, u: 0, g: 0, r: 0, o: [0, 0, 0, 0], a: 0, b: -1 });
  assert.deepEqual(
    cleanTrooper({ ms: -1, x: 'far', z: 999, h: 9, s: 99, p: 'yes', f: 'yes', n: -3, k: 2, v: 5000, u: 1, g: 'no', r: 0, o: [1.4, 'two', -3, 5000, 9, 9], a: 'lots', b: 'you', picture: 'not this' }),
    { ms: 0, x: 0, z: 20, h: 7, s: 20, p: 1, f: 1, n: 0, k: 1, v: 1000, u: 1, g: 1, r: 0, o: [1, 0, 0, 1000], a: 0, b: -1 },
  );
  assert.deepEqual(cleanTrooper({ b: 500, a: 1e9, o: 'everyone' }), { ...cleanTrooper({}), b: 99, a: 100_000 });
  assert.deepEqual(cleanTrooper({ b: -7, o: 'everyone' }), { ...cleanTrooper({}), b: -1 });
  const biggest = JSON.stringify({ t: 'trooper', from: 'abcdefghijkl', ...cleanTrooper({ ms: 3_599_999, x: -24.99, z: -19.99, h: -3.142, s: 19.9, p: 1, f: 1, n: 99_999, k: 1, v: 999, u: 1, g: 1, r: 1, o: [999, 999, 999, 999], a: 99_999, b: 99 }) });
  assert.ok(biggest.length < 220, `${biggest.length} characters`);
});

test('if whoever was running the computer\'s side goes, or is here without playing, the first of those playing runs it for the rest', () => {
  const foes = { e: [[20, 1, -2, 3.1, 80, 100, 2, 1, 2.6, -1]], s: [], n: [3, 0, 15, 1, 2, 0, 0, 0, 0] };
  const { join, leave } = makeRoom(mostIn('frost-arena'));
  const [ana, ben, cal] = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc'].map((id) => join(id));
  for (const each of [ana, ben, cal]) each.say({ t: 'ready' });
  // Ana made the match, so hers runs Giraffe and the red team.
  ben.say({ t: 'foes', ms: 100, ...foes });
  assert.equal(cal.last('foes'), undefined);
  cal.say({ t: 'tag', k: 20, n: 1 });
  assert.equal(ana.last('tag').from, 'cccccccc');
  assert.equal(ben.last('tag'), undefined);
  // She goes in the middle. Ben was next in, so his takes them over: what it says of them is passed on, and
  // Cal's hits go to it.
  leave(ana);
  ben.say({ t: 'foes', ms: 200, ...foes });
  assert.deepEqual(cal.last('foes'), { t: 'foes', from: 'bbbbbbbb', ms: 200, ...foes });
  cal.say({ t: 'foes', ms: 250, ...foes });
  assert.equal(ben.last('foes'), undefined, 'and only his');
  cal.say({ t: 'tag', k: 20, n: 2 });
  assert.deepEqual(ben.last('tag'), { t: 'tag', from: 'cccccccc', k: 20, n: 2 });

  // Someone who came first but isn't in this match doesn't get in the way of it either.
  const other = makeRoom(mostIn('frost-arena'));
  const [dee, eli, fay] = ['dddddddd', 'eeeeeeee', 'ffffffff'].map((id) => other.join(id));
  eli.say({ t: 'ready' });
  fay.say({ t: 'ready' });
  dee.say({ t: 'ready' });
  // All three play, Dee finishes first, and the other two carry on.
  dee.say({ t: 'done', ms: 5000, n: 1, w: 1 });
  eli.say({ t: 'foes', ms: 5100, ...foes });
  assert.deepEqual(fay.last('foes'), { t: 'foes', from: 'eeeeeeee', ms: 5100, ...foes });
  fay.say({ t: 'tag', k: 21, n: 4 });
  assert.deepEqual(eli.last('tag'), { t: 'tag', from: 'ffffffff', k: 21, n: 4 });
  assert.equal(dee.last('tag'), undefined);
});

test('a finish always gets through, even straight after more messages than a second allows', () => {
  const { join } = makeRoom();
  const ana = join('aaaaaaaa');
  const ben = join('bbbbbbbb');
  ana.say({ t: 'ready' });
  ben.say({ t: 'ready' });
  // A burst, as when a runner passes a lot of stars at once: the last of them are dropped.
  for (let k = 0; k < 60; k += 1) ana.say({ t: 'claim', k });
  assert.ok(ben.heard.filter(({ t }) => t === 'claimed').length < 60);
  ana.say({ t: 'done', ms: 5000, n: 12, w: 1 });
  assert.deepEqual(ben.last('done'), { t: 'done', from: 'aaaaaaaa', ms: 5000, n: 12, w: 1 });
});

test('a Cannon Bay game is ship against ship: room for two, and a third is told it already has two players', () => {
  assert.equal(mostIn('cannon-bay'), 2);
  const { join, leave } = makeRoom(mostIn('cannon-bay'));
  const host = join('aaaaaaaa');
  const friend = join('bbbbbbbb');
  assert.ok(host && friend);
  assert.equal(join('cccccccc'), null, 'a third is told the game is full');
  assert.equal(host.last('room').members.length, 2);
  leave(friend);
  assert.ok(join('dddddddd'), 'someone going makes room again');
});

test('in Cannon Bay, each ship goes to the other with only what a ship should hold, and a hit goes across as its game decided it', () => {
  const { join } = makeRoom(mostIn('cannon-bay'));
  const ana = join('aaaaaaaa');
  const ben = join('bbbbbbbb');
  // A hit before the battle has started counts for nothing.
  ana.say({ t: 'hit', ms: 10, r: 1, m: 'ball', d: 1, tot: 1 });
  assert.equal(ben.last('hit'), undefined);
  ana.say({ t: 'ready' });
  ben.say({ t: 'ready' });

  ana.say({ t: 'ship', ms: 1500.4, x: -180.12345, z: 860.456, h: 0.123456, s: 23.456, v: 0.8765, f: 12, r: 'yes', picture: 'not this', name: 'Ana' });
  assert.deepEqual(ben.last('ship'), { t: 'ship', from: 'aaaaaaaa', ms: 1500, x: -180.12, z: 860.46, h: 0.123, s: 23.5, v: 0.88, f: 12, r: 1 });
  assert.equal(ana.last('ship'), undefined, 'nobody hears their own');
  // Anything that isn't a ship's is kept within what a ship could be.
  ben.say({ t: 'ship', x: 'far', z: 99_999, h: -50, s: -3, v: 7, f: 2.6 });
  assert.deepEqual(ana.last('ship'), { t: 'ship', from: 'bbbbbbbb', ms: 0, x: 0, z: 2000, h: -7, s: 0, v: 1, f: 3, r: 0 });
  assert.deepEqual(cleanShip({}), { ms: 0, x: 0, z: 0, h: 0, s: 0, v: 0, f: 0, r: 0 });

  // The game of the ship that fired says it hit, with how many it has, so one lost is made up by the next.
  ana.say({ t: 'hit', ms: 2000.2, r: 1, m: 'ball', d: 1, tot: 3, picture: 'not this' });
  assert.deepEqual(ben.last('hit'), { t: 'hit', from: 'aaaaaaaa', ms: 2000, r: 1, m: 'ball', d: 1, tot: 3, sm: 0, sg: 0, sd: '' });
  assert.equal(ana.last('hit'), undefined);
  ana.say({ t: 'done', ms: 180_000, n: 42, w: 1 });
  assert.deepEqual(ben.last('done'), { t: 'done', from: 'aaaaaaaa', ms: 180_000, n: 42, w: 1 });
  const biggest = JSON.stringify({ t: 'ship', from: 'abcdefghijkl', ...cleanShip({ ms: 3_599_999, x: -1999.99, z: -1999.99, h: -6.999, s: 99.9, v: 0.99, f: 999_999, r: 1 }) });
  assert.ok(biggest.length < 160, `${biggest.length} long`);
});

/* ---------- Arrow Meadow ---------- */

import { cleanArcher } from '../../server/race-room.js';
import { Meadow } from '../../games/arrow-meadow/meadow.js';

test('in Arrow Meadow up to four share a meadow: each one\'s bow goes to the others, with only what a bow should hold', () => {
  assert.equal(mostIn('arrow-meadow'), 4);
  const { join } = makeRoom(mostIn('arrow-meadow'));
  const [ana, ben, cal, dee] = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd'].map((id) => join(id));
  assert.equal(join('eeeeeeee'), null, 'a fifth is told it\'s full');
  // Together or against each other is the host's choice, and everyone is told.
  ana.say({ t: 'hi', name: 'Ana', driver: 'giraffe', level: 3, length: 14, team: 1 });
  ben.say({ t: 'hi', name: 'Ben', driver: 'giraffe', level: 7, length: 6, team: 0 });
  assert.equal(dee.last('room').team, 1);
  for (const each of [ana, ben, cal, dee]) each.say({ t: 'ready' });
  const go = dee.last('go');
  assert.deepEqual(go.racers, ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd']);
  // The host's level and number of targets, and one seed for everyone's meadow.
  assert.deepEqual([go.level, go.length, go.team], [3, 14, 1]);
  assert.ok(Number.isInteger(go.seed) && go.seed >= 0);
  assert.equal(ana.last('go').seed, go.seed);

  ben.say({ t: 'archer', ms: 1500.4, a: 0.41888, d: 0.876, h: 1, v: 1, n: 3, sa: 0.52361, sp: 0.954, k: 2, picture: 'not this', name: 'Ben' });
  const heard = { t: 'archer', from: 'bbbbbbbb', ms: 1500, a: 0.419, d: 0.88, h: 1, v: 1, n: 3, sa: 0.524, sp: 0.95, k: 2 };
  for (const each of [ana, cal, dee]) assert.deepEqual(each.last('archer'), heard);
  assert.equal(ben.last('archer'), undefined, 'nobody hears their own');
});

test('a bow message holds only numbers, kept to what a bow could be, and well under the most a message can be', () => {
  assert.deepEqual(Object.keys(cleanArcher({})), ['ms', 'a', 'd', 'h', 'v', 'n', 'sa', 'sp', 'k']);
  assert.deepEqual(cleanArcher({}), { ms: 0, a: 0, d: 0, h: 0, v: 0, n: 0, sa: 0, sp: 0, k: 0 });
  assert.deepEqual(
    cleanArcher({ ms: -1, a: 'up', d: 7, h: 'yes', v: 'yes', n: -3, sa: 99, sp: -2, k: 1e9, picture: 'not this', p: [1, 2, 3] }),
    { ms: 0, a: 0, d: 1, h: 1, v: 1, n: 0, sa: 1.6, sp: 0, k: 1000 },
  );
  assert.deepEqual(cleanArcher({ a: -9, sa: -9, n: 2.6, k: 3.4 }), { ...cleanArcher({}), a: -1.6, sa: -1.6, n: 3, k: 3 });
  for (const value of Object.values(cleanArcher({ ms: '1', a: {}, d: [], h: null, v: undefined, n: NaN, sa: Infinity, sp: '0.5', k: true }))) assert.equal(typeof value, 'number');
  const biggest = JSON.stringify({ t: 'archer', from: 'abcdefghijkl', ...cleanArcher({ ms: 3_599_999, a: -1.599, d: 0.99, h: 1, v: 1, n: 99_999, sa: -1.599, sp: 0.99, k: 999 }) });
  assert.ok(biggest.length < 140, `${biggest.length} characters`);
});

test('together in Arrow Meadow, a target goes to the first to claim it, everyone is told, and every game counts the same', () => {
  const { join } = makeRoom(mostIn('arrow-meadow'));
  const players = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc'].map((id) => join(id));
  const [ana, ben, cal] = players;
  ana.say({ t: 'hi', name: 'Ana', driver: 'giraffe', level: 2, length: 6, team: 1 });
  // A claim before the game has started counts for nothing.
  ben.say({ t: 'claim', k: 0 });
  assert.equal(ana.last('claimed'), undefined);
  for (const each of players) each.say({ t: 'ready' });
  const { seed, level, length, racers } = cal.last('go');
  // Each one's game, laid out from the same seed, claiming through the server what its own arrows hit.
  const games = players.map((player) => new Meadow({ level, goal: length * racers.length, me: player.meta.id, help: 'off', team: { seed, players: racers.length, claim: (k) => player.say({ t: 'claim', k }) } }));
  const hear = () => players.forEach((player, index) => {
    for (const message of player.heard.splice(0)) if (message.t === 'claimed') games[index].claimed(message.k, message.by);
  });
  hear();
  const frame = () => {
    for (const game of games) game.update(1 / 60);
    hear();
  };
  // Ben and Cal both let an arrow go along the same arc, Ben's a little sooner: what it comes to first is Ben's, on
  // every computer. The seed is the server's, so a nearer target may be in the way of the one aimed at.
  const angle = games[1].solve(games[1].live[1], 1);
  const { k } = games[1].trace(angle, 1).end.target;
  games[1].loose(angle, 1);
  for (let n = 0; n < 6; n += 1) frame();
  games[2].loose(angle, 1);
  for (let n = 0; n < 240; n += 1) frame();
  for (const game of games) {
    assert.equal(game.owners.get(k), 'bbbbbbbb');
    assert.deepEqual([...game.owners.entries()].sort(), [...games[0].owners.entries()].sort());
    assert.ok(game.total >= 1 && game.total <= 2);
  }
  // Played on, turn about, until the team has enough: every game ends together, with the same share for each.
  let turn = 0;
  for (let guard = 0; guard < 400 && !games[0].done; guard += 1) {
    const game = games[turn % games.length];
    turn += 1;
    const wanted = game.wants();
    if (wanted) game.loose(wanted.angle, wanted.draw);
    for (let n = 0; n < 70; n += 1) frame();
  }
  for (const game of games) {
    assert.equal(game.done, true);
    assert.equal(game.total, 18);
    assert.deepEqual([...game.tally.entries()].sort(), [...games[0].tally.entries()].sort());
  }
  assert.equal([...games[0].tally.values()].reduce((sum, hits) => sum + hits, 0), 18);
});

/* ---------- Giraffe's Puzzles: its cleaner is brought in here, so its tests are a block of their own ---------- */
import { cleanJigsaw } from '../../server/race-room.js';

test('in Giraffe\'s Puzzles up to four share a puzzle: each one\'s glove and pieces go to the others, and a piece goes to the first hand that claims it', () => {
  assert.equal(mostIn('giraffe-puzzles'), MAX_RACERS);
  const { join } = makeRoom(mostIn('giraffe-puzzles'));
  const [ana, ben, cat, dan] = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd'].map(join);
  assert.ok(ana && ben && cat && dan);
  assert.equal(join('eeeeeeee'), null, 'a fifth is told the game is full');
  // Whoever made the game says how it's played, and how many pieces, and everyone gets the same seed to lay it out from.
  ana.say({ t: 'hi', name: 'Ana', level: 6, length: 16, mode: 'more', team: 1 });
  ben.say({ t: 'hi', name: 'Ben', level: 2, length: 12, mode: 'fewer', team: 0 });
  // A claim before the game has started is nobody's.
  ana.say({ t: 'claim', k: 3000 });
  assert.equal(ana.last('claimed'), undefined);
  for (const player of [ana, ben, cat, dan]) player.say({ t: 'ready' });
  const go = ben.last('go');
  assert.deepEqual([go.level, go.length, go.mode, go.team], [6, 16, 'more', 1]);
  assert.equal(dan.last('go').seed, go.seed);

  const points = Array.from({ length: 42 }, (_, i) => (i % 2 ? 0.123456 : -9));
  ana.say({ t: 'jigsaw', ms: 1500.4, x: 0.33333, y: 9, v: 1, o: 1, p: points, h: 3000, n: 2.4, d: [[1000, 1.23456, 0.5, 0, 1], [2001, 0.4, 0.90001, 90.4, 0]], picture: 'not this', name: 'Ana' });
  for (const other of [ben, cat, dan]) {
    const heard = other.last('jigsaw');
    assert.deepEqual(Object.keys(heard), ['t', 'from', 'ms', 'x', 'y', 'v', 'o', 'p', 'h', 'n', 'd']);
    assert.deepEqual([heard.t, heard.from, heard.ms, heard.x, heard.y, heard.v, heard.o, heard.h, heard.n], ['jigsaw', 'aaaaaaaa', 1500, 0.333, 1.5, 1, 1, 3000, 2]);
    assert.deepEqual(heard.p.slice(0, 2), [-4, 0.12]);
    assert.deepEqual(heard.d, [[1000, 1.235, 0.5, 0, 1], [2001, 0.4, 0.9, 90, 0]]);
  }
  assert.equal(ana.last('jigsaw'), undefined, 'nobody hears their own');

  // Two hands come to the same piece: the first to claim that grab of it has it, and everyone hears whose it is.
  ben.say({ t: 'claim', k: 5000 });
  cat.say({ t: 'claim', k: 5000 });
  for (const player of [ana, ben, cat, dan]) assert.deepEqual(player.heard.filter(({ t }) => t === 'claimed'), [{ t: 'claimed', k: 5000, by: 'bbbbbbbb' }]);
  // Put down and picked up again, it's a new grab, which anyone can have.
  cat.say({ t: 'claim', k: 5001 });
  assert.deepEqual(ana.last('claimed'), { t: 'claimed', k: 5001, by: 'cccccccc' });
  // Each one's finish goes to the others, as in the other games.
  ana.say({ t: 'done', ms: 61_234, n: 7, w: 1 });
  assert.deepEqual(ben.last('done'), { t: 'done', from: 'aaaaaaaa', ms: 61_234, n: 7, w: 1 });
});

test('a puzzle message holds only what it should, rounded and kept to the table, and well under the most a message can be', () => {
  assert.deepEqual(cleanJigsaw({}), { ms: 0, x: 0, y: 0, v: 0, o: 0, p: [], h: -1, n: 0, d: [] });
  // A glove that can't be seen has no points, and isn't open. A piece in the hand that isn't a number is none.
  const points = Array(42).fill(-3.99);
  assert.deepEqual(cleanJigsaw({ v: 0, o: 1, p: points, h: 'the lot' }), { ms: 0, x: 0, y: 0, v: 0, o: 0, p: [], h: -1, n: 0, d: [] });
  assert.equal(cleanJigsaw({ v: 1, o: 1, p: [1, 2, 3] }).v, 0, 'without its 21 points it isn\'t seen');
  // Anything that isn't a piece is left out, and what's left is kept to the table and to whole claims.
  const { d } = cleanJigsaw({ d: [[1000, 99, -4, 720, 'yes'], 'a piece', [1, 2, 3], [2000.4, 'x', null, undefined, 0], { k: 1 }] });
  assert.deepEqual(d, [[1000, 2, 0, 180, 1], [2000, 0, 0, 0, 0]]);
  assert.equal(cleanJigsaw({ d: Array.from({ length: 500 }, (_, k) => [k, 1, 1, 0, 0]) }).d.length, 40, 'no more pieces than a game could have');
  assert.equal(cleanJigsaw({ h: 99_999_999 }).h, 1_000_000);
  assert.equal(cleanJigsaw({ h: -50 }).h, -1);
  // The most a game could send: every piece of the biggest puzzle, each with its place, and the glove.
  const most = { ms: 3_599_999, x: 1.499, y: 1.499, v: 1, o: 1, p: points, h: 999_999, n: 999, d: Array.from({ length: 24 }, (_, k) => [k * 1000 + 999, 1.999, 0.999, -180, 1]) };
  const biggest = JSON.stringify({ t: 'jigsaw', from: 'abcdefghijkl', ...cleanJigsaw(most) });
  assert.ok(biggest.length < 1100, `${biggest.length} characters at most`);
  assert.ok(JSON.stringify({ t: 'jigsaw', ...most }).length < MOST_BYTES, 'and as it\'s sent, it\'s short enough to be heard');
});
