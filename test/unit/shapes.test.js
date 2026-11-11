// Hand shapes a grown-up can choose for a game's moves, like pointing for the open move: see core/shapes.js.
// Real photos, through the same hand rules as every game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINGER_NAMES, HandCheck, measureHand, promptFor } from '../../core/hands.js';
import { DEFAULT_SHAPES, FINGERS, SHAPES, SHAPE_MADE, fingersShape, isShaped, shapeOf, shapeScore, shapesFor } from '../../core/shapes.js';
import { FIST, OPEN, feed, handAt, photos, rightHand, setup } from './photo-hands.js';

const fingersOf = (name, index = 0) => measureHand(photos[name].hands[index].world).fingers;
const made = (name, id) => shapeScore(fingersOf(name), shapeOf(id, 'open')) >= SHAPE_MADE;
const RELAXED = (options) => rightHand('woman_hands', { index: 1, ...options });

test('the five fingers are the same five everywhere', () => {
  assert.deepEqual(FINGERS, FINGER_NAMES);
});

test('each photo makes its own shape, and none of the others', () => {
  const expected = { pointing_up: 'point', pointing_up_rotated: 'point', victory: 'two', thumb_up: 'thumb' };
  for (const name of ['fist', 'left_hands', 'right_hands', 'woman_hands', ...Object.keys(expected)]) {
    for (const id of ['point', 'two', 'three', 'thumb']) {
      assert.equal(made(name, id), expected[name] === id, `${name} making ${id}`);
    }
  }
});

test('a shape of the grown-up\'s own fingers is made with just those fingers straight', () => {
  const index = fingersShape(['index']);
  assert.ok(shapeScore(fingersOf('pointing_up'), index) >= SHAPE_MADE);
  assert.ok(shapeScore(fingersOf('victory'), index) < SHAPE_MADE);
  const all = fingersShape(FINGERS);
  assert.ok(shapeScore(fingersOf('left_hands'), all) >= SHAPE_MADE);
  assert.ok(shapeScore(fingersOf('fist'), all) < SHAPE_MADE);
  assert.equal(fingersShape(['middle', 'thumb']).name, 'Thumb + Middle');
});

test('what\'s saved for a game becomes its shapes, and anything else is the open and closed hand as always', () => {
  const moves = { open: 'Drive', closed: 'Slow down' };
  assert.deepEqual(shapesFor(undefined, moves), DEFAULT_SHAPES);
  assert.equal(isShaped(DEFAULT_SHAPES), false);
  assert.equal(shapesFor({ open: 'point' }, moves).open.id, 'point');
  assert.equal(shapesFor({ open: 'point' }, moves).closed.id, 'closed');
  assert.deepEqual(shapesFor({ closed: { fingers: ['index', 'nose'] } }, moves).closed.chosen, ['index']);
  // Not a shape, or not one for that move.
  for (const saved of [{ open: 'wave' }, { open: 'closed' }, { closed: 'open' }, { open: { fingers: [] } }, { open: 7 }, null]) {
    assert.deepEqual(shapesFor(saved, moves), DEFAULT_SHAPES, JSON.stringify(saved));
  }
  // The two moves can't be the same shape, and a game with no closed move of its own keeps the closed hand.
  assert.equal(shapesFor({ open: 'two', closed: 'two' }, moves).closed.id, 'closed');
  assert.equal(shapesFor({ open: { fingers: ['index'] }, closed: { fingers: ['index'] } }, moves).closed.id, 'closed');
  assert.equal(shapesFor({ closed: 'point' }, { open: 'Pop', closed: null }).closed.id, 'closed');
});

test('pointing for the open move: pointing counts as open, and an open hand doesn\'t', () => {
  const { monitor, clock } = setup(undefined, 'right');
  monitor.setShapes(shapesFor({ open: 'point' }, { open: 'Drive', closed: 'Slow down' }));
  let snapshot = feed(monitor, clock, 600, [rightHand('pointing_up')]);
  assert.equal(snapshot.right.status, 'open');
  assert.equal(snapshot.handOpen, true);
  assert.ok(snapshot.drive > 0.8, `drive ${snapshot.drive}`);
  assert.equal(snapshot.right.shape, 'point');
  assert.ok(snapshot.right.level >= SHAPE_MADE && snapshot.right.line === SHAPE_MADE);

  // Anything else is the closed hand, as always.
  for (const name of [OPEN, FIST, 'victory']) {
    snapshot = feed(monitor, clock, 600, [rightHand(name)]);
    assert.equal(snapshot.right.status, 'closed', name);
    assert.equal(snapshot.right.reason, 'closed', name);
    assert.equal(snapshot.drive, 0, name);
  }
  // It's asked for in its own words, and it's still the prompt games know as a hand to open.
  const prompt = promptFor(snapshot);
  assert.equal(prompt.text, 'Point with one finger!');
  assert.ok(prompt.key.startsWith('closed'));
  assert.equal(prompt.move, 'open');
});

test('a shape has to be held a moment, so passing through it on the way to another doesn\'t count', () => {
  const { monitor, clock } = setup(undefined, 'right');
  monitor.setShapes(shapesFor({ open: 'two' }, { open: 'Drive', closed: 'Slow down' }));
  feed(monitor, clock, 600, [rightHand(FIST)]);
  assert.equal(feed(monitor, clock, 100, [rightHand('victory')]).right.status, 'closed');
  assert.equal(feed(monitor, clock, 100, [rightHand(FIST)]).right.status, 'closed');
  assert.equal(feed(monitor, clock, 700, [rightHand('victory')]).right.status, 'open');
});

test('pointing for the closed move: it stops, an open hand goes, and a hand making neither keeps on as it was', () => {
  const { monitor, clock } = setup(undefined, 'right');
  monitor.setShapes(shapesFor({ closed: 'point' }, { open: 'Drive', closed: 'Slow down' }));
  // Until it has made one, a hand is neither, which isn't open and isn't the closed move.
  let snapshot = feed(monitor, clock, 600, [rightHand(FIST)]);
  assert.deepEqual([snapshot.right.status, snapshot.right.reason], ['closed', 'shape']);

  snapshot = feed(monitor, clock, 600, [rightHand(OPEN)]);
  assert.equal(snapshot.right.status, 'open');
  // Resting the hand, or a fist, carries on driving.
  for (const hand of [RELAXED(), rightHand(FIST)]) assert.equal(feed(monitor, clock, 600, [hand]).right.status, 'open');

  snapshot = feed(monitor, clock, 600, [rightHand('pointing_up')]);
  assert.deepEqual([snapshot.right.status, snapshot.right.reason], ['closed', 'closed']);
  assert.equal(snapshot.handOpen, false);
  snapshot = feed(monitor, clock, 600, [rightHand(FIST)]);
  assert.deepEqual([snapshot.right.status, snapshot.right.reason], ['closed', 'closed']);
  assert.equal(feed(monitor, clock, 600, [rightHand(OPEN)]).right.status, 'open');
});

test('with shapes, a problem with the view still ends a move at once, and the hand has to make one again', () => {
  const { monitor, clock } = setup(undefined, 'right');
  monitor.setShapes(shapesFor({ open: 'point', closed: 'thumb' }, { open: 'Fire', closed: 'Shield' }));
  assert.equal(feed(monitor, clock, 600, [rightHand('pointing_up')]).right.status, 'open');
  assert.equal(feed(monitor, clock, 600, [rightHand(FIST)]).right.status, 'open', 'neither keeps on firing');

  // Cut off by the edge of the picture.
  let snapshot = feed(monitor, clock, 100, [handAt('pointing_up', 0.98, 0.5, { label: 'Right' })]);
  assert.deepEqual([snapshot.right.status, snapshot.right.reason], ['closed', 'edge']);
  snapshot = feed(monitor, clock, 600, [rightHand(FIST)]);
  assert.deepEqual([snapshot.right.status, snapshot.right.reason], ['closed', 'shape']);

  // Gone altogether.
  feed(monitor, clock, 600, [rightHand('thumb_up')]);
  assert.equal(monitor.snapshot.right.reason, 'closed');
  assert.equal(feed(monitor, clock, 600, []).right.status, 'missing');
  snapshot = feed(monitor, clock, 600, [rightHand(FIST)]);
  assert.deepEqual([snapshot.right.status, snapshot.right.reason], ['closed', 'shape']);
});

test('the other hand is always just open or closed, whatever shapes the hand in play has', () => {
  const { monitor, clock } = setup(undefined, 'right');
  monitor.setShapes(shapesFor({ open: 'point', closed: 'two' }, { open: 'Drive', closed: 'Slow down' }));
  const snapshot = feed(monitor, clock, 600, [rightHand('pointing_up'), handAt(OPEN, 0.25, 0.5, { label: 'Left' })]);
  assert.equal(snapshot.right.status, 'open');
  assert.equal(snapshot.other.status, 'open');
  assert.equal(snapshot.other.shape, 'open');
  monitor.setSide('left');
  assert.equal(monitor.other.shapes.open.id, 'open');
});

test('a hand check of a shape leaves the hand\'s best opening as it was', () => {
  const { monitor, clock } = setup(undefined, 'right');
  const check = new HandCheck({ seconds: 0.3 });
  while (!check.done) check.add(feed(monitor, clock, 33, [rightHand('pointing_up')]), 0.033);
  const before = monitor.right.best;
  monitor.applyCheck({ ...check.result(), best: null });
  assert.equal(monitor.right.best, before);
  assert.equal(monitor.right.checked, true);
});

test('shape prompts all have their words', () => {
  for (const [id, shape] of Object.entries(SHAPES)) {
    if (!shape.fingers) continue;
    const prompt = promptFor({ side: 'left', left: { reason: 'shape', shape: id }, overlap: false });
    assert.equal(prompt.text, shape.prompt);
  }
  assert.equal(promptFor({ side: 'left', left: { reason: 'shape', shape: 'fingers' }, overlap: false }).text, 'Show the fingers in the picture!');
  // With the open hand, a hand that's neither is asked to open, as a closed one is.
  assert.deepEqual(promptFor({ side: 'left', left: { reason: 'shape', shape: 'open' }, overlap: false }), { key: 'closed-left', text: 'Open your left hand!', side: 'left' });
});

test('a glove knows a hand making neither shape, so a game doesn\'t close it on anything', async () => {
  const { Glove } = await import('../../core/glove.js');
  const glove = new Glove('right');
  const field = { aspect: 16 / 9, palmSize: 50, width: 800, height: 450 };
  glove.follow({ status: 'closed', reason: 'shape', image: null }, 0.016, field);
  assert.equal(glove.neither, true);
  glove.follow({ status: 'closed', reason: 'closed', image: null }, 0.016, field);
  assert.equal(glove.neither, false);
  glove.follow({ status: 'closed', reason: 'shape', image: null }, 0.016, field);
  glove.hide();
  assert.equal(glove.neither, false);
});
