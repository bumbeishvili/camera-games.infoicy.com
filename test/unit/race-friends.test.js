// Racing friends in High Five Racers: the room's rules, which run on the server, and how a friend's car
// is moved smoothly from what their game sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBall, cleanCar, cleanHand, cleanName, cleanRacket, cleanShot, idFor, makeCode, MAX_RACERS, mostIn, POSE_NUMBERS, RaceRoom, takeOver, validCode } from '../../server/race-room.js';
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
    const inside = rules.arrive(player, id, null, most);
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
    return { player, inside: rules.arrive(player, id, null, MAX_RACERS, true) };
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
  assert.equal(empty.rules.arrive(third, 'ffffffff', null, MAX_RACERS, true), false);
  assert.deepEqual(third.heard, [{ t: 'taken' }]);
  empty.tick(20_000);
  assert.equal(empty.rules.arrive(third, 'ffffffff', null, MAX_RACERS, true), true);
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
    assert.deepEqual(player.last('go'), { t: 'go', level: 7, length: 1, laps: 1, mode: '', racers: ['aaaaaaaa', 'bbbbbbbb'] });
  }
  const after = host.last('room').members;
  assert.ok(after.every(({ ready, racing }) => !ready && racing), 'everyone is racing, and has to be ready again for the next');
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
  assert.deepEqual(back.meta, { ...kept, id: 'aaaaaaaa' });
  assert.equal(back.meta.racing, true);
  assert.equal(back.meta.name, 'Ana');
  assert.equal(takeOver(players, 'cccccccc'), null, 'nobody to take over');
  assert.equal(takeOver(players, 'not valid!'), null);
});

test('back within moments of a connection that did close, a player carries on as before, still hosting', () => {
  const { rules, join, leave, tick } = makeRoom();
  const host = join('aaaaaaaa');
  host.say({ t: 'hi', name: 'Ana' });
  const friend = join('bbbbbbbb');
  host.say({ t: 'ready' });
  friend.say({ t: 'ready' });
  const joined = host.meta.joined;
  leave(host);
  assert.equal(friend.last('room').members.find(({ host: hosting }) => hosting).id, 'bbbbbbbb', 'meanwhile the friend hosts');
  tick(2000);
  const kept = rules.cameBack('aaaaaaaa');
  assert.equal(kept.joined, joined);
  assert.equal(kept.racing, true);
  assert.equal(rules.cameBack('aaaaaaaa'), null, 'only once');
  // Too long gone, and they start again.
  leave(friend);
  tick(16_000);
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
  assert.deepEqual(friend.last('go'), { t: 'go', level: 3, length: 60, laps: 60, mode: 'times', racers: ['aaaaaaaa', 'bbbbbbbb'] });
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
