// Whether a hand is held up, as for a high five, for Giraffe's Goal: core/upright.js, against what the real tracker
// reported for real photos of hands. Each photo is also squeezed shorter, as a hand tipped towards the camera looks
// (palm-short-70 is the palm at 70% of its height, as it looks tipped 46°), and turned, for fingers that point out
// to the side or hang down (see tools/record_hands.mjs). Each goes through the real hand monitor first, so the points
// are the ones a game is given.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handPosture, TIP_LIMITS, tipFor, UPRIGHT, UprightReader } from '../../core/upright.js';
import { FRAME_ASPECT, feed, rightHand, setup } from './photo-hands.js';

const FRAME_MS = 33;

/** The hand in play's points, as the monitor gives them to a game, for a photo. */
function seen(name) {
  const { monitor, clock } = setup({}, 'right');
  return feed(monitor, clock, 300, [rightHand(name)]).right.image;
}

/** A reader that has watched the hand check with this photo, so flat is how this hand looks. */
function checkedWith(name) {
  const reader = new UprightReader();
  const image = seen(name);
  for (let i = 0; i < 20; i += 1) reader.sample(image, FRAME_ASPECT);
  reader.calibrate();
  reader.clock = { now: 10_000 };
  return reader;
}

/** What it reads once photos have been shown for a while, one after another, each for a frame, over and over. */
function hold(reader, names, limit, ms = 700) {
  const images = [names].flat().map((name) => (name ? seen(name) : null));
  let frame = 0;
  for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) {
    reader.clock.now += FRAME_MS;
    reader.update(images[frame % images.length], FRAME_ASPECT, reader.clock.now, limit);
    frame += 1;
  }
  return { held: reader.held, why: reader.why, tip: reader.tip, up: reader.up };
}

test('hands held flat to the camera point up, and look as wide for their length as real hands do', () => {
  for (const name of ['palm', 'back', 'open', 'left_hands', 'right_hands']) {
    const { up, wide } = handPosture(seen(name), FRAME_ASPECT);
    assert.ok(up > 0.9, `${name} points ${up}`);
    assert.ok(wide >= UPRIGHT.wideLow && wide <= UPRIGHT.wideHigh, `${name} is ${wide} wide`);
  }
});

test('a hand tipped towards the camera looks shorter, and reads as tipped about as far as it is', () => {
  const tipOf = (name, flat) => tipFor(handPosture(seen(name), FRAME_ASPECT).wide, handPosture(seen(flat), FRAME_ASPECT).wide);
  // Each as [photo, how far a hand that looks like it is tipped, in degrees].
  for (const [name, tipped] of [['palm-short-95', 18], ['palm-short-90', 26], ['palm-short-80', 37], ['palm-short-70', 46], ['palm-short-60', 53], ['palm-short-50', 60]]) {
    const read = tipOf(name, 'palm');
    assert.ok(Math.abs(read - tipped) < 5, `${name}, tipped ${tipped}°, reads ${read}°`);
  }
  // Another photo of the same hand, from the back, and of another hand: within 9° of it, and never more than it is.
  for (const [name, flat, tipped] of [['back-short-90', 'back', 26], ['back-short-60', 'back', 53], ['back-short-50', 'back', 60], ['open-short-60', 'open', 53]]) {
    const read = tipOf(name, flat);
    assert.ok(read > tipped - 9 && read < tipped + 3, `${name}, tipped ${tipped}°, reads ${read}°`);
  }
  assert.equal(tipFor(0.5, 0.7), 0, 'a hand that looks narrower, turned side-on, is not tipped');
});

test('a hand held flat is held up whatever the limit, and one tipped further than the limit is not', () => {
  const cases = {
    little: { held: ['palm', 'palm-short-95', 'palm-short-90', 'palm-short-80', 'palm-short-75'], not: ['palm-short-60', 'palm-short-50'] },
    more: { held: ['palm', 'palm-short-95', 'palm-short-90', 'palm-short-80'], not: ['palm-short-70', 'palm-short-60'] },
    upright: { held: ['palm', 'palm-short-95', 'palm-short-90'], not: ['palm-short-80', 'palm-short-70'] },
  };
  for (const [limit, { held, not }] of Object.entries(cases)) {
    for (const name of held) {
      const read = hold(checkedWith('palm'), name, TIP_LIMITS[limit]);
      assert.deepEqual([read.held, read.why], [true, null], `${name} at ${limit}: tipped ${read.tip}°`);
    }
    for (const name of not) {
      const read = hold(checkedWith('palm'), name, TIP_LIMITS[limit]);
      assert.deepEqual([read.held, read.why], [false, 'tipped'], `${name} at ${limit}: tipped ${read.tip}°`);
    }
  }
  // The back of the same hand, and the back of another one.
  assert.equal(hold(checkedWith('back'), 'back-short-90', TIP_LIMITS.upright).held, true);
  assert.equal(hold(checkedWith('back'), 'back-short-60', TIP_LIMITS.more).held, false);
  assert.equal(hold(checkedWith('back'), 'back-short-50', TIP_LIMITS.little).held, false);
  assert.equal(hold(checkedWith('open'), 'open', TIP_LIMITS.upright).held, true);
  assert.equal(hold(checkedWith('open'), 'open-short-60', TIP_LIMITS.more).held, false);
});

test('fingers up or out to the side are held up, and fingers hanging down are not', () => {
  // The palm turned clockwise by so many degrees: up to level either way counts.
  for (const name of ['palm-turn-45', 'palm-turn-315', 'palm-turn-90', 'palm-turn-270']) {
    const read = hold(checkedWith('palm'), name, TIP_LIMITS.upright);
    assert.deepEqual([read.held, read.why], [true, null], `${name} points ${read.up}`);
  }
  for (const name of ['palm-turn-135', 'palm-turn-180']) {
    const read = hold(checkedWith('palm'), name, TIP_LIMITS.little);
    assert.deepEqual([read.held, read.why], [false, 'down'], `${name} points ${read.up}`);
  }
  // A real hand reaching out to the side, its fingers pointing along.
  assert.equal(hold(checkedWith('palm'), 'relaxed', TIP_LIMITS.more).held, true);
});

test('a hand check made with the wrist dropped is not believed, so the hand still has to come up', () => {
  // It looks wider than any flat hand does, so flat is taken to be what the usual hand looks: held as it was in the
  // check, tipped 53° or 60°, it isn't held up even a little.
  for (const name of ['palm-short-60', 'palm-short-50']) {
    const dropped = checkedWith(name);
    assert.deepEqual([dropped.checked, dropped.flat], [false, UPRIGHT.defaultWide]);
    const read = hold(dropped, name, TIP_LIMITS.little);
    assert.equal(read.held, false, `${name} after a check with ${name}: tipped ${read.tip}°`);
    assert.ok(read.tip > TIP_LIMITS.little + UPRIGHT.slack - 4, `${name} reads ${read.tip}°`);
    assert.equal(hold(dropped, 'palm', TIP_LIMITS.upright).held, true);
    assert.equal(hold(dropped, 'palm-short-80', TIP_LIMITS.little).held, true);
  }
  // One made with the hand turned side-on looks narrower than any, and then it's the usual hand's: a hand held flat
  // afterwards isn't read as tipped.
  const sideOn = checkedWith('palm-45');
  assert.deepEqual([sideOn.checked, sideOn.flat], [false, UPRIGHT.defaultWide]);
  assert.equal(hold(sideOn, 'palm', TIP_LIMITS.upright).held, true);
  assert.equal(hold(sideOn, 'right_hands', TIP_LIMITS.upright).held, true);
  // One made with the hand held up is believed, and is that hand's own.
  const flat = checkedWith('palm');
  assert.equal(flat.checked, true);
  assert.ok(Math.abs(flat.flat - handPosture(seen('palm'), FRAME_ASPECT).wide) < 0.01);
  // With no check at all, the usual hand's.
  const unchecked = new UprightReader();
  unchecked.calibrate();
  assert.deepEqual([unchecked.checked, unchecked.flat], [false, UPRIGHT.defaultWide]);
});

test('a real hand wobbles: one that tips to and fro inside the limit stays held up all the while', () => {
  const reader = checkedWith('palm');
  hold(reader, 'palm', TIP_LIMITS.more);
  // From frame to frame it looks tipped 25° and then 43°, which is over the limit of 40° every other frame.
  const images = ['palm-short-90', 'palm-short-75'].map(seen);
  let lost = 0;
  for (let frame = 0; frame < 90; frame += 1) {
    reader.clock.now += FRAME_MS;
    reader.update(images[frame % 2], FRAME_ASPECT, reader.clock.now, TIP_LIMITS.more);
    if (!reader.held) lost += 1;
  }
  assert.equal(lost, 0);
});

test('tipping too far for a moment keeps a held hand, and tipping for longer loses it within half a second', () => {
  const reader = checkedWith('palm');
  assert.equal(hold(reader, 'palm', TIP_LIMITS.little).held, true);
  assert.equal(hold(reader, 'palm-short-50', TIP_LIMITS.little, 130).held, true, 'four frames tipped right over');
  assert.equal(hold(reader, 'palm', TIP_LIMITS.little, 200).held, true);
  assert.equal(hold(reader, 'palm-short-50', TIP_LIMITS.little, 500).held, false);
  // And it's back as soon as the hand is: within a fifth of a second.
  assert.equal(hold(reader, 'palm', TIP_LIMITS.little, 200).held, true);
});

test('the tracker losing the hand for a moment keeps it held up, and a hand gone for longer is not', () => {
  const reader = checkedWith('palm');
  assert.equal(hold(reader, 'palm', TIP_LIMITS.little).held, true);
  assert.equal(hold(reader, null, TIP_LIMITS.little, 200).held, true);
  assert.equal(hold(reader, 'palm', TIP_LIMITS.little, 100).held, true);
  const gone = hold(reader, null, TIP_LIMITS.little, 600);
  assert.deepEqual([gone.held, gone.why], [false, 'missing']);
  // Back again, it's read afresh: held up within a fifth of a second.
  assert.equal(hold(reader, 'palm', TIP_LIMITS.little, 200).held, true);
});

test('the limits go from a little to right up, and all are under where the reading stops rising', () => {
  assert.deepEqual(Object.keys(TIP_LIMITS), ['little', 'more', 'upright']);
  assert.ok(TIP_LIMITS.little > TIP_LIMITS.more && TIP_LIMITS.more > TIP_LIMITS.upright);
  // The palm at 40% of its height, tipped 66°, reads about 62°.
  const most = tipFor(handPosture(seen('palm-short-40'), FRAME_ASPECT).wide, handPosture(seen('palm'), FRAME_ASPECT).wide);
  assert.ok(most > 58 && most < 66, `${most}`);
  assert.ok(TIP_LIMITS.little + UPRIGHT.slack < most - 4);
});
