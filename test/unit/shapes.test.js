// Hand shapes a grown-up can choose for a game's active move, like pointing to drive: see core/shapes.js.
// Real photos, through the same hand rules as every game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINGER_NAMES, HandCheck, measureHand, promptFor } from '../../core/hands.js';
import { DEFAULT_SHAPES, FINGERS, SHAPES, SHAPE_MADE, fingersShape, isShaped, shapeOf, shapeScore, shapesFor } from '../../core/shapes.js';
import { FIST, OPEN, feed, handAt, photos, rightHand, setup } from './photo-hands.js';

const fingersOf = (name, index = 0) => measureHand(photos[name].hands[index].world).fingers;
const made = (name, id) => shapeScore(fingersOf(name), shapeOf(id)) >= SHAPE_MADE;

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

test('what\'s saved for a game becomes its open move\'s shape, and the closed move is always the closed hand', () => {
  assert.deepEqual(shapesFor(undefined), DEFAULT_SHAPES);
  assert.equal(isShaped(DEFAULT_SHAPES), false);
  assert.equal(shapesFor({ open: 'point' }).open.id, 'point');
  assert.equal(isShaped(shapesFor({ open: 'point' })), true);
  assert.deepEqual(shapesFor({ open: { fingers: ['index', 'nose'] } }).open.chosen, ['index']);
  // A closed move saved by an earlier version is the closed hand now, as it always is.
  assert.equal(shapesFor({ open: 'two', closed: 'point' }).closed.id, 'closed');
  // Not a shape, or not one for the open move.
  for (const saved of [{ open: 'wave' }, { open: 'closed' }, { open: { fingers: [] } }, { open: 7 }, null]) {
    assert.deepEqual(shapesFor(saved), DEFAULT_SHAPES, JSON.stringify(saved));
  }
});

test('pointing for the open move: pointing counts as open, and an open hand doesn\'t', () => {
  const { monitor, clock } = setup(undefined, 'right');
  monitor.setShapes(shapesFor({ open: 'point' }));
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
  monitor.setShapes(shapesFor({ open: 'two' }));
  feed(monitor, clock, 600, [rightHand(FIST)]);
  assert.equal(feed(monitor, clock, 100, [rightHand('victory')]).right.status, 'closed');
  assert.equal(feed(monitor, clock, 100, [rightHand(FIST)]).right.status, 'closed');
  assert.equal(feed(monitor, clock, 700, [rightHand('victory')]).right.status, 'open');
});

test('with a shape, a problem with the view still closes the hand at once, and the shape has to be made again', () => {
  const { monitor, clock } = setup(undefined, 'right');
  monitor.setShapes(shapesFor({ open: 'point' }));
  assert.equal(feed(monitor, clock, 600, [rightHand('pointing_up')]).right.status, 'open');
  // Cut off by the edge of the picture.
  let snapshot = feed(monitor, clock, 100, [handAt('pointing_up', 0.98, 0.5, { label: 'Right' })]);
  assert.deepEqual([snapshot.right.status, snapshot.right.reason], ['closed', 'edge']);
  snapshot = feed(monitor, clock, 100, [rightHand('pointing_up')]);
  assert.deepEqual([snapshot.right.status, snapshot.right.reason], ['closed', 'closed']);
  assert.equal(feed(monitor, clock, 600, [rightHand('pointing_up')]).right.status, 'open');
  // Gone altogether.
  assert.equal(feed(monitor, clock, 600, []).right.status, 'missing');
  assert.deepEqual([feed(monitor, clock, 600, [rightHand(FIST)]).right.reason], ['closed']);
});

test('the other hand is always just open or closed, whatever shapes the hand in play has', () => {
  const { monitor, clock } = setup(undefined, 'right');
  monitor.setShapes(shapesFor({ open: 'point' }));
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
    const prompt = promptFor({ side: 'left', left: { reason: 'closed', shape: id }, overlap: false });
    assert.equal(prompt.text, shape.prompt);
  }
  assert.equal(promptFor({ side: 'left', left: { reason: 'closed', shape: 'fingers' }, overlap: false }).text, 'Show the fingers in the picture!');
  // With the open hand, as always.
  assert.deepEqual(promptFor({ side: 'left', left: { reason: 'closed', shape: 'open' }, overlap: false }), { key: 'closed-left', text: 'Open your left hand!', side: 'left' });
});
