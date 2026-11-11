// The Lighthouse Keeper with friends: everyone wipes the same windows, and each patch of mud is whoever's hand
// wiped it first, as the server decides. These are the server's rules for it, and the storm everyone shares.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanWipe, MAX_RACERS, MOST_BYTES, mostIn, RaceRoom, WINDOW_PATCHES } from '../../server/race-room.js';
import { CLEAN_ENOUGH, GRID, Mud, NEW_AT, PATCHES, plainStorm, Storm, stormAt } from '../../games/lighthouse/storm.js';

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
      wiped() {
        return this.heard.filter(({ t }) => t === 'wiped');
      },
    };
    players.push(player);
    clock += 10;
    return rules.arrive(player, id, null, { most: mostIn('lighthouse') }) ? player : null;
  };
  return { rules, join, tick: (ms) => { clock += ms; } };
}

/** Everyone who's in, ready, so the game starts. */
function playing(...ids) {
  const room = makeRoom();
  const players = ids.map(room.join);
  for (const player of players) player.say({ t: 'ready' });
  return { ...room, players };
}

/** Whose each patch is, as one player has heard it: window: { patch: id }. */
function owners(player) {
  const heard = {};
  for (const { w, c, by } of player.wiped()) {
    heard[w] ??= {};
    for (const patch of c) {
      assert.ok(!(patch in heard[w]) || heard[w][patch] === by, `patch ${patch} of window ${w} is only ever one player's`);
      heard[w][patch] = by;
    }
  }
  return heard;
}

test('a game with friends holds four, and the game and the server agree on how many patches a window has', () => {
  assert.equal(mostIn('lighthouse'), MAX_RACERS);
  assert.equal(MAX_RACERS, 4);
  assert.equal(PATCHES, WINDOW_PATCHES);
  assert.equal(new Mud().cells.length, WINDOW_PATCHES);
  assert.deepEqual([new Mud().columns, new Mud().rows], [GRID.columns, GRID.rows]);
  const { join } = makeRoom();
  assert.ok(['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd'].map(join).every(Boolean));
  assert.equal(join('eeeeeeee'), null, 'the fifth is told the game is full');
});

test('each patch goes to the first hand to wipe it, and everyone hears which ones each player got', () => {
  const { players: [ana, ben, cara] } = playing('aaaaaaaa', 'bbbbbbbb', 'cccccccc');
  ana.say({ t: 'wipe', w: 0, c: [10, 11, 12, 13] });
  // Ben's hand went over some of the same at about the same time, but Ana's wipe got there first.
  ben.say({ t: 'wipe', w: 0, c: [12, 13, 14, 15] });
  const anas = { t: 'wiped', w: 0, c: [10, 11, 12, 13], by: 'aaaaaaaa' };
  const bens = { t: 'wiped', w: 0, c: [14, 15], by: 'bbbbbbbb' };
  // Ben got only the two nobody had, and everyone hears so, and he alone hears whose the others are.
  for (const player of [ana, cara]) assert.deepEqual(player.wiped(), [anas, bens]);
  assert.deepEqual(ben.wiped(), [anas, bens, { t: 'wiped', w: 0, c: [12, 13], by: 'aaaaaaaa' }]);
  // The same patch of another window is another patch.
  cara.say({ t: 'wipe', w: 1, c: [12] });
  assert.deepEqual(ana.wiped().at(-1), { t: 'wiped', w: 1, c: [12], by: 'cccccccc' });
  // A patch can't be had twice, even by the one who has it: wiping it again tells only them, again.
  const before = cara.heard.length;
  ana.say({ t: 'wipe', w: 0, c: [10] });
  assert.equal(cara.heard.length, before, 'nothing new for anyone else');
  assert.deepEqual(ana.wiped().at(-1), { t: 'wiped', w: 0, c: [10], by: 'aaaaaaaa' });
  // So every computer has heard the same patches go to the same players, and the shares add up.
  const [a, b, c] = [ana, ben, cara].map(owners);
  assert.deepEqual(a, c);
  assert.deepEqual(b, a);
  const counts = {};
  for (const window of Object.values(a)) for (const by of Object.values(window)) counts[by] = (counts[by] ?? 0) + 1;
  assert.deepEqual(counts, { aaaaaaaa: 4, bbbbbbbb: 2, cccccccc: 1 });
});

test('a wipe whose answer was lost, as when the connection dropped, is answered again when it\'s sent again', () => {
  const { players: [ana, ben] } = playing('aaaaaaaa', 'bbbbbbbb');
  ben.say({ t: 'wipe', w: 2, c: [40, 41] });
  ana.heard.length = 0;
  // Ana's game never heard that, and her hand wiped the same patches, and more: she learns whose they are.
  ana.say({ t: 'wipe', w: 2, c: [40, 41, 42] });
  assert.deepEqual(ana.wiped(), [{ t: 'wiped', w: 2, c: [42], by: 'aaaaaaaa' }, { t: 'wiped', w: 2, c: [40, 41], by: 'bbbbbbbb' }]);
  // Ana's game sends hers again, as it heard nothing back: still hers, and nobody else is told twice.
  const benHeard = ben.heard.length;
  ana.say({ t: 'wipe', w: 2, c: [42] });
  assert.deepEqual(ana.wiped().at(-1), { t: 'wiped', w: 2, c: [42], by: 'aaaaaaaa' });
  assert.equal(ben.heard.length, benHeard);
});

test('a wipe holds only which window and which of its patches, each a whole number, once, and nothing else is passed on', () => {
  assert.deepEqual(cleanWipe({ w: 1.4, c: [3, 3, 2.6, -1, 126, 125, '7', null, true, 1e9, NaN, 0], picture: 'not this' }), { w: 1, c: [3, 125, 0] });
  assert.deepEqual(cleanWipe({ w: 'x', c: 'all of them' }), { w: 0, c: [] });
  assert.deepEqual(cleanWipe({ w: 99, c: [5] }), { w: 9, c: [5] }, 'no more windows than a storm could have, with room to spare');
  assert.deepEqual(cleanWipe({}), { w: 0, c: [] });

  const { players: [ana, ben] } = playing('aaaaaaaa', 'bbbbbbbb');
  ana.say({ t: 'wipe', w: 0, c: [1, 1, 2, 'x', 500], picture: 'not this', by: 'bbbbbbbb' });
  assert.deepEqual(ben.wiped(), [{ t: 'wiped', w: 0, c: [1, 2], by: 'aaaaaaaa' }], 'only the player who sent it can be who has them');
  ana.say({ t: 'wipe', w: 0, c: [] });
  ana.say({ t: 'wipe', w: 0, c: ['nothing', -4] });
  assert.equal(ben.wiped().length, 1, 'a wipe of nothing tells nobody anything');
  // A whole window at once, the most there could be, is still well under the most a message can be, both ways.
  const all = Array.from({ length: WINDOW_PATCHES }, (_, patch) => patch);
  assert.ok(JSON.stringify({ t: 'wipe', w: 9, c: all }).length < MOST_BYTES / 2);
  ben.say({ t: 'wipe', w: 9, c: all });
  const biggest = JSON.stringify(ben.wiped().at(-1));
  assert.ok(biggest.length < MOST_BYTES / 2, `${biggest.length} characters`);
  assert.equal(ben.wiped().at(-1).c.length, WINDOW_PATCHES);
});

test('a wipe before the game has started, or after finishing, counts for nothing, and a new game starts with every patch unclaimed', () => {
  const { join } = makeRoom();
  const ana = join('aaaaaaaa');
  const ben = join('bbbbbbbb');
  ana.say({ t: 'wipe', w: 0, c: [5] });
  assert.equal(ben.wiped().length, 0, 'not before it starts');
  ana.say({ t: 'ready' });
  ben.say({ t: 'ready' });
  ben.say({ t: 'wipe', w: 0, c: [5, 6] });
  assert.deepEqual(ana.wiped(), [{ t: 'wiped', w: 0, c: [5, 6], by: 'bbbbbbbb' }]);
  ben.say({ t: 'done', ms: 60_000, n: 2, w: 1 });
  ben.say({ t: 'wipe', w: 0, c: [7] });
  assert.equal(ana.wiped().length, 1, 'nor once they\'ve finished');
  ana.say({ t: 'done', ms: 60_100, n: 0, w: 1 });
  // The next game: patch 5 is anyone's again.
  ana.say({ t: 'ready' });
  ben.say({ t: 'ready' });
  ana.say({ t: 'wipe', w: 0, c: [5] });
  assert.deepEqual(ben.wiped().at(-1), { t: 'wiped', w: 0, c: [5], by: 'aaaaaaaa' });
});

test('wiping makes many patches a second, so a game sends them a few at a time, well within the flood limit, and a finish still gets through a burst', () => {
  const { players: [ana, ben], tick } = playing('aaaaaaaa', 'bbbbbbbb');
  const points = Array(42).fill(0.5);
  // As a game sends them: its glove 10 times a second, and every patch since the last wipe, 10 times a second.
  let patch = 0;
  for (let second = 0; second < 3; second += 1) {
    for (let tenth = 0; tenth < 10; tenth += 1) {
      ana.say({ t: 'hand', ms: second * 1000 + tenth * 100, x: 0.5, y: 0.5, v: 1, o: 1, p: points });
      ana.say({ t: 'wipe', w: 0, c: [patch, patch + 1, patch + 2] });
      patch += 3;
      tick(100);
    }
  }
  assert.equal(ben.heard.filter(({ t }) => t === 'hand').length, 30, 'every glove');
  assert.equal(ben.wiped().reduce((sum, { c }) => sum + c.length, 0), 90, 'and every patch');
  // A game gone wrong, sending far more than that, is cut off, but its finish isn't.
  tick(1000);
  for (let i = 0; i < 80; i += 1) ana.say({ t: 'wipe', w: 1, c: [i % WINDOW_PATCHES] });
  const heard = ben.wiped().filter(({ w }) => w === 1).length;
  assert.ok(heard <= 40 && heard > 0, `heard ${heard}`);
  ana.say({ t: 'done', ms: 5000, n: 90, w: 1 });
  assert.deepEqual(ben.heard.filter(({ t }) => t === 'done').at(-1), { t: 'done', from: 'aaaaaaaa', ms: 5000, n: 90, w: 1 });
});

test('the storm friends share is the plain one at every level, as its levels\' new things would each need sharing', () => {
  for (let level = 1; level <= 10; level += 1) {
    const plain = plainStorm(level);
    const solo = stormAt(level);
    assert.deepEqual(Object.keys(plain).sort(), Object.keys(solo).sort());
    assert.deepEqual([plain.splats, plain.shells, plain.crabs, plain.lumps, plain.powers, plain.night, plain.chest], [0, 0, 0, [], [], false, false], `level ${level}`);
    assert.equal(plain.swell, solo.swell, 'the host\'s level\'s sea');
  }
  assert.ok(Object.keys(NEW_AT).length === 9);
  // At level 10, nothing comes however much is wiped, and a window is mud and nothing else.
  const events = [];
  const storm = new Storm({ level: 10, ships: 2, shared: true, onEvent: ({ type }) => events.push(type) });
  storm.nextShip();
  for (let x = 0; x <= 1; x += 0.05) for (let y = 0; y <= 1; y += 0.1) storm.wipe(x, y, 0.1, 0.15, 0.5);
  for (let i = 0; i < 100; i += 1) storm.update(0.05, { hand: { x: 0.5, y: 0.5, sizeX: 0.1, sizeY: 0.15 } });
  assert.deepEqual(events, ['ship', 'window-clean']);
  assert.equal(storm.treasure, 0);
});

test('with friends, the patches the hand wipes are kept to claim, once each, and a friend\'s come off the glass and can finish the window', () => {
  const events = [];
  const storm = new Storm({ shared: true, onEvent: ({ type }) => events.push(type) });
  storm.nextShip();
  const added = storm.wipe(0.5, 0.5, 0.1, 0.15);
  const { w, c } = storm.takeWiped();
  assert.equal(w, 0);
  assert.equal(c.length, added);
  assert.ok(added > 0);
  assert.ok(c.every((patch) => storm.mud.cells[patch]), 'each is clean here');
  assert.deepEqual(storm.takeWiped().c, [], 'and only taken once');
  storm.wipe(0.5, 0.5, 0.1, 0.15);
  assert.deepEqual(storm.takeWiped().c, [], 'wiping the same place again wipes nothing new');

  // A friend's patches, some of which this hand wiped already: only the new ones come off, and count.
  const theirs = [c[0], 0, 1, 2];
  const share = storm.mud.share;
  assert.deepEqual(storm.wipePatches(theirs), [0, 1, 2]);
  assert.ok(Math.abs(storm.mud.share - (share + 3 / PATCHES)) < 1e-9);
  assert.deepEqual(storm.takeWiped().c, [], 'a friend\'s patches aren\'t this hand\'s to claim');
  assert.deepEqual(storm.wipePatches([-1, 126, 1.5, 'x']), [], 'nor anything that isn\'t a patch');

  // Friends wiping nearly all the rest: the window is clean here too, once, and nothing more comes off it.
  const rest = Array.from({ length: PATCHES }, (_, patch) => patch).filter((patch) => !storm.mud.cells[patch]);
  storm.wipePatches(rest.slice(0, Math.ceil(PATCHES * CLEAN_ENOUGH) - (PATCHES - rest.length)));
  assert.equal(storm.clean, true);
  assert.deepEqual(events, ['ship', 'window-clean']);
  assert.deepEqual(storm.wipePatches(rest), []);
  // The next window starts with nothing left to claim from the last.
  storm.shipHome();
  storm.nextShip();
  assert.deepEqual(storm.takeWiped(), { w: 1, c: [] });
});

test('on their own, nothing is kept to claim, and the storm is the level\'s, as it always was', () => {
  const storm = new Storm({ level: 4 });
  storm.nextShip();
  storm.wipe(0.5, 0.5, 0.1, 0.15);
  assert.deepEqual(storm.takeWiped().c, []);
  assert.deepEqual(storm.level, stormAt(4));
});

test('the game\'s rooms are known to both servers, and whose each patch is reaches the game', () => {
  for (const file of ['../../server/worker.js', '../../tools/race-server.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /const GAMES = \[[^\]]*'lighthouse'/, file);
  }
  const friends = readFileSync(new URL('../../core/friends.js', import.meta.url), 'utf8');
  assert.match(friends, /\[[^\]]*'wiped'[^\]]*\]\.includes\(message\.t\)/, 'wiped is passed on to the game');
  const page = readFileSync(new URL('../../games/lighthouse/index.html', import.meta.url), 'utf8');
  assert.match(page, /connect-src 'self' wss:\/\/hemi-race\.infoicy\.com ws:\/\/localhost:\*/, 'and the page can reach them');
});
