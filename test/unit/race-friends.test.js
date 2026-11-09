// Racing friends in High Five Racers: the room's rules, which run on the server, and how a friend's car
// is moved smoothly from what their game sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCar, cleanName, idFor, makeCode, MAX_RACERS, RaceRoom, validCode } from '../../server/race-room.js';
import { CarTrack, codeInLink } from '../../games/high-five-racers/friends.js';

/** A room with players who keep what they're sent, as the server's sockets would pass it on. */
function makeRoom() {
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
    const inside = rules.arrive(player, id);
    return inside ? player : null;
  };
  const leave = (player) => {
    players.splice(players.indexOf(player), 1);
    rules.leave(player);
  };
  return { rules, join, leave, tick: (ms) => { clock += ms; } };
}

test('race codes are 6 letters and numbers that can\'t be mistaken for each other', () => {
  const code = makeCode((below) => Math.floor(Math.random() * below));
  assert.equal(code.length, 6);
  assert.ok(validCode(code));
  assert.ok(!validCode('ABC10O'), 'no 0, O, 1 or I');
  assert.ok(!validCode('abcdef'));
  assert.ok(!validCode('ABCDE'));
  assert.equal(codeInLink('#race=abcdef'), 'ABCDEF', 'typed in small letters');
  assert.equal(codeInLink('#race=zz'), null);
  assert.equal(codeInLink(''), null);
});

test('the first in hosts, everyone hears who\'s here, and the host\'s course is raced once all are ready', () => {
  const { join } = makeRoom();
  const host = join('aaaaaaaa');
  host.say({ t: 'hi', name: 'Dato', driver: 'kit', level: 7, laps: 1 });
  const friend = join('bbbbbbbb');
  friend.say({ t: 'hi', name: 'Nino', driver: 'joze', level: 2, laps: 4 });
  const room = friend.last('room');
  assert.equal(room.you, 'bbbbbbbb');
  assert.deepEqual(room.members.map(({ name, driver, host: hosting }) => [name, driver, hosting]), [['Dato', 'kit', true], ['Nino', 'joze', false]]);

  host.say({ t: 'ready' });
  assert.equal(friend.last('go'), undefined, 'not until everyone is ready');
  friend.say({ t: 'ready' });
  for (const player of [host, friend]) {
    assert.deepEqual(player.last('go'), { t: 'go', level: 7, laps: 1, racers: ['aaaaaaaa', 'bbbbbbbb'] });
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
  assert.deepEqual(one.last('done'), { t: 'done', from: 'bbbbbbbb', ms: 61234 });
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
  assert.deepEqual(host.last('done'), { t: 'done', from: 'bbbbbbbb', ms: 65000 }, 'and their finish counts');
  // Saying so on the grid, waiting for a race, doesn't make anyone a racer.
  friend.say({ t: 'ready' });
  friend.say({ t: 'hi', name: 'Nino', racing: true });
  assert.equal(host.last('room').members.find(({ id }) => id === 'bbbbbbbb').racing, false);
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
  one.say({ t: 'car', ms: 1, d: 1, x: 0, s: 0, l: 0, f: 0, b: 0, extra: 'x'.repeat(700) });
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
