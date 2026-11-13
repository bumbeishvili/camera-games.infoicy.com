// What a game gives to its hands, apart from the screen: see core/mapping.js. The picker that shows it, in
// core/mapping-ui.js, is tried in the browser tests of the games that use it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { givenFor, readValue, taken } from '../../core/mapping.js';
import { CHOICES, SHAPES, SIGNS, choiceOf, fingersShape, fingersUp, shapeOf, shapesFor, signOf } from '../../core/shapes.js';

// A game played with both hands, as Frost Arena is: each hand drags with a shape, and three more things can be
// given to either hand, or to something that isn't a hand shape.
const HANDS = [{ id: 'aim', name: 'The hand that looks round' }, { id: 'move', name: 'The hand that walks' }];
const DRAGS = ['open', 'point', 'two', 'three'];
const SIGNS_ON_OFFER = ['thumb', 'point', 'two', 'pinch-index'];
const MAPPING = {
  open: { options: DRAGS, hand: 'aim' },
  rows: [
    { id: 'walk', name: 'Walk', hand: 'move', options: DRAGS, fallback: 'open' },
    { id: 'fire', name: 'Fire', hands: HANDS, options: SIGNS_ON_OFFER, fallback: { hand: 'aim', is: 'thumb' } },
    { id: 'reload', name: 'Reload', hands: HANDS, options: [{ id: 'off', name: 'Nothing', icon: 'none' }, ...SIGNS_ON_OFFER], fallback: { hand: 'move', is: 'thumb' } },
    { id: 'sprint', name: 'Sprint', hands: HANDS, options: [{ id: 'stick', name: 'Pushed right out', icon: 'push' }, { id: 'off', name: 'Nothing', icon: 'none' }, ...SIGNS_ON_OFFER], fallback: 'stick' },
  ],
};
const ROWS = [{ id: 'open', name: 'Look round', ...MAPPING.open }, ...MAPPING.rows];
const OUT_OF_THE_BOX = { walk: 'open', fire: { hand: 'aim', is: 'thumb' }, reload: { hand: 'move', is: 'thumb' }, sprint: 'stick' };

test('what\'s chosen for a row is read the same however it was kept: a shape, a choice of fingers, or either on one hand', () => {
  assert.deepEqual(readValue('point'), { hand: null, id: 'point', fingers: null });
  assert.deepEqual(readValue({ fingers: ['index', 'thumb'] }), { hand: null, id: 'fingers', fingers: ['thumb', 'index'] });
  assert.deepEqual(readValue({ hand: 'move', is: 'thumb' }), { hand: 'move', id: 'thumb', fingers: null });
  assert.deepEqual(readValue({ hand: 'aim', is: { fingers: ['pinky', 'wave'] } }), { hand: 'aim', id: 'fingers', fingers: ['pinky'] });
  // Nothing kept is nothing chosen, and doesn't break anything.
  for (const nothing of [undefined, null, '']) assert.deepEqual(readValue(nothing), { hand: null, id: '', fingers: null });
});

test('a game\'s rows are what was kept for them, and what a row doesn\'t offer any more is what it is out of the box', () => {
  assert.deepEqual(givenFor(MAPPING, undefined), OUT_OF_THE_BOX);
  assert.deepEqual(givenFor(MAPPING, {}), OUT_OF_THE_BOX);
  assert.deepEqual(givenFor(null, { fire: 'thumb' }), {});
  const kept = { open: 'point', walk: 'three', fire: { hand: 'move', is: 'two' }, reload: 'off', sprint: { hand: 'aim', is: 'pinch-index' } };
  assert.deepEqual(givenFor(MAPPING, kept, 'point'), { walk: 'three', fire: { hand: 'move', is: 'two' }, reload: 'off', sprint: { hand: 'aim', is: 'pinch-index' } });
  // A shape the row doesn't offer, a hand there isn't, a hand where none belongs, and none where one does.
  assert.deepEqual(givenFor(MAPPING, { walk: 'thumb' }).walk, 'open');
  assert.deepEqual(givenFor(MAPPING, { fire: { hand: 'aim', is: 'wave' } }).fire, OUT_OF_THE_BOX.fire);
  assert.deepEqual(givenFor(MAPPING, { fire: { hand: 'foot', is: 'two' } }).fire, OUT_OF_THE_BOX.fire);
  assert.deepEqual(givenFor(MAPPING, { fire: 'two' }).fire, OUT_OF_THE_BOX.fire);
  assert.deepEqual(givenFor(MAPPING, { walk: { hand: 'aim', is: 'two' } }).walk, 'open');
  assert.deepEqual(givenFor(MAPPING, { sprint: { hand: 'aim', is: 'off' } }).sprint, 'stick');
  // Firing can't be given to nothing: its row doesn't offer it.
  assert.deepEqual(givenFor(MAPPING, { fire: 'off' }).fire, OUT_OF_THE_BOX.fire);
  // Something from an older version, kept as words: it isn't taken for a choice.
  assert.deepEqual(givenFor(MAPPING, { fire: 'aim:two', reload: 'move:fist' }), OUT_OF_THE_BOX);
});

test('two things on the same hand can\'t be given to the same shape: the one that has it is named, and the other hand is free', () => {
  const values = { open: 'open', ...OUT_OF_THE_BOX };
  const busy = taken(ROWS, values);
  // Out of the box: the thumb of the hand that looks round fires, and the other hand's changes the magazine.
  assert.deepEqual(busy.fire, { open: 'Look round' });
  assert.deepEqual(busy.reload, { open: 'Walk' });
  assert.deepEqual(busy.open, { thumb: 'Fire' });
  assert.deepEqual(busy.walk, { thumb: 'Reload' });
  // Sprinting isn't given to a hand shape, so it's on neither hand, and takes nothing from anyone.
  assert.deepEqual(busy.sprint, {});
  // Looking round by pointing: nothing else on that hand can be pointing, and the other hand still can.
  const pointing = taken(ROWS, { ...values, open: 'point', sprint: { hand: 'aim', is: 'two' } });
  assert.deepEqual(pointing.fire, { point: 'Look round', two: 'Sprint' });
  assert.deepEqual(pointing.reload, { open: 'Walk' });
  assert.deepEqual(pointing.sprint, { point: 'Look round', thumb: 'Fire' });
  // What a row would find taken on the other hand, before it's moved there.
  assert.deepEqual(taken(ROWS, values, { fire: 'move' }).fire, { open: 'Walk', thumb: 'Reload' });
  // A row with something chosen that isn't a hand shape is asked about the hand it was last on.
  assert.deepEqual(taken(ROWS, values, { sprint: 'aim' }).sprint, { open: 'Look round', thumb: 'Fire' });
  // A game with one move, and no hands to tell apart, never has anything taken.
  assert.deepEqual(taken([{ id: 'open', name: 'Drive', options: CHOICES }], { open: 'point' }), { open: {} });
});

test('two things kept for the same shape on the same hand, as an older version could: the later one is as it is out of the box', () => {
  // Firing and the magazine both on the thumb of the hand that looks round.
  const both = givenFor(MAPPING, { fire: { hand: 'aim', is: 'thumb' }, reload: { hand: 'aim', is: 'thumb' } });
  assert.deepEqual([both.fire, both.reload], [{ hand: 'aim', is: 'thumb' }, { hand: 'move', is: 'thumb' }]);
  // Firing by pointing, on a hand that looks round by pointing: the open move's shape comes first.
  assert.deepEqual(givenFor(MAPPING, { fire: { hand: 'aim', is: 'point' } }, 'point').fire, OUT_OF_THE_BOX.fire);
  assert.deepEqual(givenFor(MAPPING, { fire: { hand: 'aim', is: 'point' } }, 'open').fire, { hand: 'aim', is: 'point' });
  // And on the other hand it's fine.
  assert.deepEqual(givenFor(MAPPING, { fire: { hand: 'move', is: 'point' } }, 'point').fire, { hand: 'move', is: 'point' });
  // It's the later of the two that gives way, and the earlier keeps what it was given.
  const later = givenFor(MAPPING, { fire: { hand: 'move', is: 'two' }, reload: { hand: 'move', is: 'two' } });
  assert.deepEqual([later.fire, later.reload], [{ hand: 'move', is: 'two' }, { hand: 'move', is: 'thumb' }]);
  // Two things on one hand can both be given to nothing, though: that isn't a shape a hand makes.
  const quiet = { rows: [
    { id: 'wave', name: 'Wave', hand: 'move', options: [{ id: 'off', name: 'Nothing', icon: 'none' }, 'open'], fallback: 'open' },
    { id: 'clap', name: 'Clap', hand: 'move', options: [{ id: 'off', name: 'Nothing', icon: 'none' }, 'point'], fallback: 'point' },
  ] };
  assert.deepEqual(givenFor(quiet, { wave: 'off', clap: 'off' }), { wave: 'off', clap: 'off' });
  assert.deepEqual(taken(quiet.rows, { wave: 'off', clap: 'off' }), { wave: {}, clap: {} });
});

test('every hand shape has a name, words for a card and a little picture, whichever game offers it', () => {
  for (const id of [...Object.keys(SHAPES), ...Object.keys(SIGNS)]) {
    const sign = signOf(id);
    assert.equal(sign.id, id);
    assert.ok(sign.name && sign.words && sign.mark, id);
  }
  assert.equal(signOf('wave'), null);
  assert.equal(signOf('toString'), null);
  // How each is drawn: which fingers are straight. A pinch has all but the two that touch, and a curled finger
  // all but that one and the thumb.
  assert.deepEqual(fingersUp(signOf('open')), ['thumb', 'index', 'middle', 'ring', 'pinky']);
  assert.deepEqual(fingersUp(signOf('thumb')), ['thumb']);
  assert.deepEqual(fingersUp(signOf('three')), ['index', 'middle', 'ring']);
  assert.deepEqual(fingersUp(signOf('pinch-middle')), ['index', 'ring', 'pinky']);
  assert.deepEqual(fingersUp(signOf('trigger')), ['middle', 'ring', 'pinky']);
});

test('a game can offer fewer shapes for its open move: one it doesn\'t offer is an open hand', () => {
  assert.equal(shapeOf('thumb').id, 'thumb');
  assert.equal(shapeOf('thumb', DRAGS).id, 'open');
  assert.equal(shapeOf('three', DRAGS).id, 'three');
  assert.equal(shapeOf({ fingers: ['thumb', 'index'] }).id, 'fingers');
  assert.equal(shapeOf({ fingers: ['thumb', 'index'] }, DRAGS).id, 'open');
  assert.equal(shapesFor({ open: 'thumb' }, DRAGS).open.id, 'open');
  assert.equal(shapesFor({ open: 'point', fire: { hand: 'aim', is: 'thumb' } }, DRAGS).open.id, 'point');
  // A shape as it's kept, and shown as chosen.
  assert.equal(choiceOf(shapeOf('two')), 'two');
  assert.deepEqual(choiceOf(fingersShape(['index', 'thumb'])), { fingers: ['thumb', 'index'] });
});
