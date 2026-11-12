// How far a hand is turned over, for Giraffe's Garden: core/turn.js, against what the real tracker reported for real
// photos of one right hand, from the front and from the back, each also squeezed across, as a hand turned part of the
// way to side-on looks narrower (see tools/record_hands.mjs). Each goes through the real hand monitor first, so the
// points are the ones a game is given.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flowFor, handFacing, TURN, TURN_TARGETS, TurnReader } from '../../core/turn.js';
import { FRAME_ASPECT, feed, rightHand, setup } from './photo-hands.js';

/** The hand in play's points, as the monitor gives them to a game, for a photo of the right hand. */
function seen(name) {
  const { monitor, clock } = setup({}, 'right');
  return feed(monitor, clock, 300, [rightHand(name)]).right.image;
}

/** A reader that has watched the hand check with this photo, so turning is measured from it. */
function checkedWith(name) {
  const reader = new TurnReader();
  const image = seen(name);
  for (let i = 0; i < 20; i += 1) reader.sample(image, FRAME_ASPECT);
  reader.calibrate();
  return reader;
}

/** What it reads once a photo has been held for a while, on a clock that goes on from one photo to the next. */
function hold(reader, name, ms = 600, clock = (reader.clock ??= { now: 10_000 })) {
  const image = seen(name);
  let degrees = 0;
  for (let elapsed = 0; elapsed < ms; elapsed += 33) {
    clock.now += 33;
    degrees = reader.update(image, FRAME_ASPECT, clock.now);
  }
  return degrees;
}

test('the palm and the back of the same hand face opposite ways, and look about as wide', () => {
  const palm = handFacing(seen('palm'), FRAME_ASPECT);
  const back = handFacing(seen('back'), FRAME_ASPECT);
  assert.ok(palm.side > TURN.sure && back.side < -TURN.sure, `${palm.side} and ${back.side}`);
  assert.ok(Math.abs(palm.wide - back.wide) < 0.1, `${palm.wide} and ${back.wide}`);
  for (const name of ['palm', 'back', 'left_hands', 'right_hands', 'fist', 'victory', 'thumb_up']) {
    const { wide } = handFacing(seen(name), FRAME_ASPECT);
    assert.ok(wide >= 0.6 && wide <= 0.9, `${name}: ${wide}`);
  }
});

test('turned from the palm: narrower is further round, and the back of the hand is right over', () => {
  const reader = checkedWith('palm');
  assert.deepEqual([reader.start.sign, reader.start.checked], [1, true]);
  const read = (name) => hold(reader, name);
  assert.ok(read('palm') < 10, `the palm as it started: ${read('palm')}`);
  const palm80 = read('palm-80');
  const palm60 = read('palm-60');
  assert.ok(palm80 > 28 && palm80 < 42, `80% as wide: ${palm80}`);
  assert.ok(palm60 > 44 && palm60 < 58, `60% as wide: ${palm60}`);
  assert.ok(palm60 > palm80);
  const back45 = read('back-45');
  const back60 = read('back-60');
  assert.ok(back45 > TURN_TARGETS.over && back45 < 135, `the back, 45% as wide: ${back45}`);
  assert.ok(back60 > back45 && back60 < 150, `60% as wide: ${back60}`);
  assert.ok(read('back') > 170, `the whole back: ${read('back')}`);
  // Each target can be reached: a little by the palm 80% as wide, more by 60%, and right over by the back showing.
  assert.ok(palm80 >= TURN_TARGETS.little - 7 && palm60 >= TURN_TARGETS.more - 6 && back45 >= TURN_TARGETS.over);
});

test('it\'s measured from how the hand starts: started with its back to the camera, the palm is right over', () => {
  const reader = checkedWith('back');
  assert.equal(reader.start.sign, -1);
  assert.ok(hold(reader, 'back') < 10);
  // The palm looks a little narrower than the back did, so it isn't quite all the way.
  const palm = hold(reader, 'palm');
  assert.ok(palm > 150, `${palm}`);
  assert.ok(hold(reader, 'palm-60') > TURN_TARGETS.over);
});

test('a hand nearly side-on, which can look the wrong way round, reads as nearly side-on and not right over', () => {
  // The palm squeezed to 30% of its width came back looking like the back of the hand, though only just.
  assert.ok(handFacing(seen('palm-30'), FRAME_ASPECT).side < 0);
  const reader = checkedWith('palm');
  hold(reader, 'palm-60', 300);
  const nearly = hold(reader, 'palm-30', 1000);
  assert.ok(nearly > 35 && nearly < 90, `${nearly}`);
});

test('a swap of sides only counts once it has lasted a moment, and a hand back after a while is read afresh', () => {
  const reader = checkedWith('palm');
  const clock = { now: 10_000 };
  hold(reader, 'palm', 600, clock);
  // One frame of the back, as a flicker: not over yet.
  clock.now += 33;
  assert.ok(reader.update(seen('back'), FRAME_ASPECT, clock.now) < 90);
  clock.now += 33;
  assert.ok(reader.update(seen('palm'), FRAME_ASPECT, clock.now) < 30);
  // Held, it is.
  assert.ok(hold(reader, 'back', 400, clock) > 170);
  // No reading keeps the last one. Gone a while and back with the palm, it's the palm at once.
  assert.ok(reader.update(null, FRAME_ASPECT, clock.now + 100) > 170);
  clock.now += 1000;
  assert.ok(reader.update(seen('palm'), FRAME_ASPECT, clock.now) < 10);
});

test('without a hand check, or with too little seen in one, it starts from the palm at the usual width', () => {
  const reader = new TurnReader();
  assert.deepEqual(reader.start, { sign: 1, wide: TURN.defaultWide, checked: false });
  reader.sample(seen('back'), FRAME_ASPECT);
  reader.calibrate();
  assert.equal(reader.start.checked, false, 'one look is too little');
  assert.ok(hold(reader, 'back') > 170);
  // A check made side-on can't make a turn impossible: the width it learns is kept to a hand's.
  const narrow = new TurnReader();
  for (let i = 0; i < 20; i += 1) narrow.sample(seen('palm-30'), FRAME_ASPECT);
  narrow.calibrate();
  assert.ok(narrow.start.wide >= TURN.wideLow);
});

test('how much water a turn gives: none at rest, a trickle near the target, and all of it there', () => {
  for (const target of Object.values(TURN_TARGETS)) {
    assert.equal(flowFor(0, target), 0);
    assert.equal(flowFor(target * 0.69, target), 0);
    const near = flowFor(target * 0.85, target);
    assert.ok(near > 0.3 && near < 0.7, `${near}`);
    assert.equal(flowFor(target, target), 1);
    assert.equal(flowFor(180, target), 1);
  }
  // Resting, a hand held as it started never pours, even at the smallest target.
  const reader = checkedWith('palm');
  assert.equal(flowFor(hold(reader, 'palm'), TURN_TARGETS.little), 0);
});
