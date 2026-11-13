// Frost Arena's controls: two hands in the air as two thumbs on the glass of a phone. A closed hand is lifted, an
// open one is down and dragged, and a thumb up fires or reloads. These run the real hand monitor on what the real
// model made of photos of hands (test/fixtures/photo-hands.json), moved about as a player would move them, at
// the speed a camera sends pictures and the speed a screen draws them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HandMonitor } from '../../core/hands.js';
import { ACTIONS, BINDINGS, Controls, DRAGS, FILTER, FINGER_TIPS, GESTURES, OPEN as OPEN_RULE, OneEuro, PAD, SENSITIVITY, STICK, TRIGGER, fingersOut, gesturesOf, readBinding, readHand } from '../../games/frost-arena/controls.js';
import { FIST, FRAME_ASPECT, OPEN, handAt, photos } from './photo-hands.js';

const CAMERA_MS = 1000 / 30;
const SCREEN_MS = 1000 / 60;
const PALM = 0.2; // How long the palm is in the picture, in frame heights: about half a metre from a laptop.
const HOMES = { left: { x: 0.27, y: 0.55 }, right: { x: 0.73, y: 0.55 } };
const degrees = (radians) => (radians * 180) / Math.PI;

function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** A hand part of the way from one photo's to another's: what the tracker makes of fingers on their way. */
function between(from, to, share) {
  const mix = (a, b) => ({ x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share, z: a.z + (b.z - a.z) * share });
  return { ...from, image: from.image.map((point, index) => mix(point, to.image[index])), world: from.world.map((point, index) => mix(point, to.world[index])) };
}

/**
 * A player in front of a camera. Each hand is { photo, x, y }: which photo it looks like, and where it is, in palm
 * lengths across and down the picture from where it's first seen, or null for a hand that's out of it. toward and
 * by have it that much of the way, from 0 to 1, from that photo to another. The hand in play looks round and
 * fires, and the other walks and reloads.
 */
function player({ side = 'right', palm = PALM, sensitivity = 'medium', shake = 0, seed = 3, bindings = {}, drags = {} } = {}) {
  const monitor = new HandMonitor({}, side);
  const controls = new Controls({ sensitivity, bindings, drags });
  const random = seeded(seed);
  const other = side === 'right' ? 'left' : 'right';
  const rig = { monitor, controls, now: 1000, sinceCamera: Infinity, yaw: 0, outs: [], out: controls.out, hands: { aim: null, move: null }, slow: 1 };
  const raw = (which, hand) => {
    if (!hand) return null;
    const home = HOMES[which];
    const wobble = () => (random() - 0.5) * 2 * shake;
    const at = [home.x + ((hand.x ?? 0) * palm) / FRAME_ASPECT + wobble() / FRAME_ASPECT, home.y + (hand.y ?? 0) * palm + wobble()];
    const options = { palm, label: which === 'left' ? 'Left' : 'Right' };
    let made = handAt(hand.photo ?? OPEN, ...at, options);
    if (hand.toward && hand.by) made = between(made, handAt(hand.toward, ...at, options), hand.by);
    return hand.change ? hand.change(made) : made;
  };
  /** Time passes, with the hands as they are, or as a function of the seconds gone by says they are. */
  rig.run = (seconds, hands = rig.hands) => {
    const start = rig.now;
    const first = rig.outs.length;
    while (rig.now - start < seconds * 1000 - 0.001) {
      rig.now += SCREEN_MS;
      rig.sinceCamera += SCREEN_MS;
      rig.hands = typeof hands === 'function' ? hands((rig.now - start) / 1000) : hands;
      if (rig.sinceCamera >= CAMERA_MS && !rig.stalled) {
        rig.sinceCamera = 0;
        monitor.update([raw(side, rig.hands.aim), raw(other, rig.hands.move)].filter(Boolean), rig.now, FRAME_ASPECT);
      }
      rig.out = controls.update(monitor.snapshot, FRAME_ASPECT, rig.now, SCREEN_MS / 1000, { slow: rig.slow });
      rig.yaw += rig.out.turn;
      rig.outs.push({ ...rig.out, at: rig.now, yaw: rig.yaw });
    }
    return rig.outs.slice(first);
  };
  return rig;
}

const THUMB = 'thumb_up';
const OPEN_HAND = { photo: OPEN, x: 0, y: 0 };
const BOTH = { aim: OPEN_HAND, move: OPEN_HAND };
const hand = (x = 0, y = 0, photo = OPEN) => ({ photo, x, y });
const CLOSED = { aim: hand(0, 0, FIST), move: hand(0, 0, FIST) };
// How far the view turns for a hand dragged a palm length across, at the usual sensitivity.
const PER_PALM = degrees(SENSITIVITY.medium);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
// Nothing anyone could see: the filter never quite stops arriving where the hand is, so a turn is never quite nothing.
const still = (out) => Math.abs(degrees(out.turn)) < 0.01 && out.moveX === 0 && out.moveY === 0;

/* ---------- the filter ---------- */

test('the filter holds a trembling hand nearly still, and keeps up with one that moves', () => {
  const random = seeded(11);
  const still = new OneEuro();
  const outs = [];
  for (let i = 0; i < 300; i += 1) outs.push(still.feed((random() - 0.5) * 0.02, i / 30));
  // A tremble of a hundredth of a palm length either way, about a millimetre: once it has settled, what comes
  // out all but stops moving, and never moves by more than a tenth of the tremble.
  const settled = outs.slice(120);
  const range = Math.max(...settled) - Math.min(...settled);
  assert.ok(range < 0.002, `it comes out moving over ${range.toFixed(4)}`);
  assert.ok(settled.filter((out, index) => index && out !== settled[index - 1]).length < 6, 'and hardly ever');
  assert.ok(Math.abs(settled[0]) < 0.012);
  // Moving steadily at 3 palm lengths a second, it's no more than a twentieth of a second behind.
  const moving = new OneEuro();
  let behind = 0;
  for (let i = 0; i < 90; i += 1) {
    const at = i / 30;
    behind = 3 * at - moving.feed(3 * at, at);
  }
  assert.ok(behind / 3 < 0.05, `${Math.round((behind / 3) * 1000)} ms behind`);
  // One that jumps and stops is there in a fraction of a second, with no long creep up to it afterwards.
  const jump = new OneEuro();
  jump.feed(0, 0);
  const after = (seconds) => {
    let out = 0;
    for (let i = 1; i <= Math.round(seconds * 30); i += 1) out = jump.feed(1, i / 30);
    return out;
  };
  assert.ok(after(0.2) > 0.97, `${after(0.2)}`);
  // The play in it is a hair's breadth: a move bigger than that comes through, less the hair.
  const fine = new OneEuro();
  fine.feed(0, 0);
  let out = 0;
  for (let i = 1; i <= 60; i += 1) out = fine.feed(0.05, i / 30);
  assert.ok(Math.abs(out - (0.05 - FILTER.play)) < 0.002, `${out}`);
  // The first value is taken as it is, and one with no time passed changes nothing.
  const fresh = new OneEuro();
  assert.equal(fresh.feed(5, 1), 5);
  assert.equal(fresh.feed(9, 1), 5);
  assert.ok(FILTER.minCutoff > 0 && FILTER.beta > 0);
});

/* ---------- landing ---------- */

/* ---------- a hand down, and a hand lifted ---------- */

test('a closed hand is a thumb lifted off the glass: it does nothing, wherever it goes', () => {
  const rig = player();
  const outs = [...rig.run(1, CLOSED), ...rig.run(0.6, { aim: hand(0.6, 0.2, FIST), move: hand(-0.4, -0.5, FIST) }), ...rig.run(0.6, { aim: hand(-0.5, 0, FIST), move: hand(0.3, 0.4, FIST) })];
  assert.ok(outs.every((out) => out.turn === 0 && out.moveX === 0 && out.moveY === 0 && !out.fire && !out.reload && !out.sprint));
  // Not down for a moment, either, from the first look of it.
  assert.ok(outs.every((out) => !out.stick.on && !out.pad.on));
  assert.deepEqual([rig.out.hands, rig.out.stick, rig.out.pad], [2, { on: false, seen: true, x: 0, y: 0 }, { on: false, seen: true, x: 0, y: 0 }]);
  assert.equal(rig.yaw, 0);
});

test('a hand that opens goes down where it opens, and is dragged from there: opening it moves nothing', () => {
  const rig = player();
  rig.run(1, CLOSED);
  // Each opens somewhere else from where it was first seen: that's where it goes down.
  rig.run(0.5, { aim: hand(0.5, 0.2, FIST), move: hand(-0.3, 0.4, FIST) });
  const before = rig.yaw;
  const opened = rig.run(0.6, { aim: hand(0.5, 0.2), move: hand(-0.3, 0.4) });
  assert.ok(opened.every(still) && Math.abs(degrees(rig.yaw - before)) < 0.05, `${degrees(rig.yaw - before)}`);
  const down = opened.find((out) => out.stick.on && out.pad.on);
  assert.ok(down.at - opened[0].at < 80, `down ${Math.round(down.at - opened[0].at)} ms after opening`);
  assert.ok(Math.hypot(rig.out.stick.x, rig.out.stick.y) < 0.02 && Math.hypot(rig.out.pad.x, rig.out.pad.y) < 0.02);
  // From there, it's how far it's dragged that counts, and not where it is in the picture.
  rig.run(0.5, { aim: hand(0.7, 0.2), move: hand(-0.3, 0.1) });
  assert.ok(Math.abs(degrees(rig.yaw - before) - 0.2 * PER_PALM) < 1, `${degrees(rig.yaw - before)}`);
  assert.ok(rig.out.moveY > 0.5 && Math.abs(rig.out.moveX) < 0.05, `${rig.out.moveX}, ${rig.out.moveY}`);
  // A hand that's open when it's first seen is down where it's first seen.
  const open = player();
  const first = open.run(0.4, { aim: hand(0.3, 0), move: hand(0.2, 0.2) });
  assert.ok(first.every(still));
  assert.deepEqual([open.out.stick.on, open.out.pad.on], [true, true]);
});

/* ---------- only an open hand drags ---------- */

// A hand closed loosely, as hands often are: two of its fingers not quite curled, so it isn't a fist to look at,
// and it isn't open either.
const loosely = (x = 0, y = 0) => ({ photo: OPEN, toward: FIST, by: 0.5, x, y });

/** What the controls make of a hand part of the way from one photo's to another's. */
function partWay(from, to, share) {
  const [a, b] = [from, to].map((photo) => handAt(photo, 0.5, 0.5, { palm: PALM, label: 'Right' }));
  const made = between(a, b, share);
  return readHand({ status: 'open', reason: null, image: made.image.map(({ x, y, z }) => ({ x: 1 - x, y, z })), world: made.world, openness: 1 }, FRAME_ASPECT);
}

test('an open hand is told by its four fingers from one that\'s closed, loosely closed, pointing or anything else', () => {
  // Real open hands: flat, relaxed, a woman's, seen from the back, and tipped back so the fingers point at the camera.
  for (const photo of [OPEN, 'relaxed', 'woman_hands', 'right_hands', 'palm', 'back', 'back-short-50']) assert.equal(gesturesOf(looked(photo)).open, true, photo);
  for (const photo of [FIST, THUMB, 'pointing_up', 'victory']) assert.equal(gesturesOf(looked(photo)).open, false, photo);
  // Closed loosely, it's not open, and it's nothing else either: not a fist to look at, as two of its fingers
  // aren't curled enough, and not a thumb up.
  const loose = partWay(OPEN, FIST, 0.5);
  assert.deepEqual([gesturesOf(loose).open, gesturesOf(loose).fist, gesturesOf(loose).thumb, gesturesOf(loose, { open: true }).open], [false, false, false, false]);
  assert.ok(Math.max(loose.fingers.ring, loose.fingers.pinky) > TRIGGER.fingersBelow && fingersOut(loose.fingers) < OPEN_RULE.lift, `${JSON.stringify(loose.fingers)}`);
  // How far out the four fingers are: all of them, and the one that's least out as much again.
  const fingers = (index, middle = index, ring = index, pinky = index) => ({ thumb: 1, index, middle, ring, pinky });
  assert.deepEqual([fingersOut(fingers(1)), fingersOut(fingers(0)), fingersOut(fingers(0, 1, 1, 1))], [1, 0, 0.375]);
  const open = looked(OPEN);
  // One finger curled is enough for it not to be open, whatever the thumb is doing.
  assert.equal(gesturesOf({ ...open, fingers: fingers(0, 1, 1, 1) }).open, false);
  assert.equal(gesturesOf({ ...open, fingers: { ...fingers(1), thumb: 0 } }).open, true);
  // It takes a little more to stop being open than it took to be, so it doesn't flicker.
  const between_ = (OPEN_RULE.down + OPEN_RULE.lift) / 2;
  assert.ok(OPEN_RULE.down > OPEN_RULE.lift);
  assert.equal(gesturesOf({ ...open, fingers: fingers(between_) }).open, false);
  assert.equal(gesturesOf({ ...open, fingers: fingers(between_) }, { open: true }).open, true);
  assert.equal(gesturesOf({ ...open, fingers: fingers(OPEN_RULE.lift - 0.02) }, { open: true }).open, false);
  assert.equal(gesturesOf({ ...open, fingers: fingers(OPEN_RULE.down + 0.02) }).open, true);
});

test('only an open hand drags: one that closes loosely stops the view at that very look, and it stays as it was last wherever the hand goes', () => {
  const rig = player();
  rig.run(1, BOTH);
  // Dragged steadily across, a palm length a second. Then it closes, loosely, and goes on across as fast.
  rig.run(0.3, (t) => ({ aim: hand(t, 0), move: OPEN_HAND }));
  const closing = rig.run(0.4, (t) => ({ aim: loosely(0.3 + t), move: OPEN_HAND }));
  // From the tracker's first look at it closed, a thirtieth of a second on at most, nothing turns.
  const after = closing.filter((out) => out.at - closing[0].at > CAMERA_MS + SCREEN_MS);
  assert.ok(after.every((out) => out.turn === 0), `turned ${degrees(Math.max(...after.map((out) => Math.abs(out.turn))))} degrees in a frame`);
  assert.ok(degrees(rig.yaw) < (0.3 + 1 / 30) * PER_PALM + 1.5, `${degrees(rig.yaw)} degrees, with the hand ${(0.7 * PER_PALM).toFixed(1)} across`);
  // And it's lifted within a fifth of a second, though it never looked like a fist.
  const lifted = closing.find((out) => !out.pad.on);
  assert.ok(lifted && lifted.at - closing[0].at < 200, `still down after ${lifted ? Math.round(lifted.at - closing[0].at) : 400} ms`);
  assert.equal(rig.out.pad.seen, true);
  // Brought back like that, and held there, and then opened: the view is as it was last, all the while.
  const turned = rig.yaw;
  const back = [...rig.run(0.5, (t) => ({ aim: loosely(0.7 - Math.min(0.7, t * 2)), move: OPEN_HAND })), ...rig.run(0.5, { aim: loosely(), move: OPEN_HAND }), ...rig.run(0.5, BOTH)];
  assert.ok(back.every((out) => out.turn === 0), `${degrees(rig.yaw - turned)}`);
  assert.equal(rig.out.pad.on, true);
  // Dragged from there, it turns on from where the view was.
  rig.run(0.5, { aim: hand(0.2, 0), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(rig.yaw - turned) - 0.2 * PER_PALM) < 1, `${degrees(rig.yaw - turned)}`);

  // Closed like that and brought straight back, quicker than it takes to be sure the hand is closed, and opened:
  // the view never comes back with it.
  const quick = player();
  quick.run(1, BOTH);
  quick.run(0.4, { aim: hand(0.3, 0), move: OPEN_HAND });
  const there = quick.yaw;
  const clutch = [...quick.run(0.13, (t) => ({ aim: loosely(0.3 - Math.min(0.3, t * 3)), move: OPEN_HAND })), ...quick.run(0.5, BOTH)];
  const most = Math.max(...clutch.map((out) => Math.abs(degrees(out.yaw - there))));
  assert.ok(most < 0.6, `the view came ${most.toFixed(2)} degrees back with a hand that was brought back ${(0.3 * PER_PALM).toFixed(1)}`);
  assert.equal(quick.out.pad.on, true);
});

test('the walking hand closed loosely stops the walk too, within a fifth of a second, and it stays stopped wherever the hand goes', () => {
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.5, { aim: OPEN_HAND, move: hand(0, -0.3) });
  const walking = rig.out.moveY;
  assert.ok(walking > 0.6);
  // It closes, loosely, and goes on up, and out to one side.
  const closing = rig.run(0.5, (t) => ({ aim: OPEN_HAND, move: loosely(Math.min(0.3, t), -0.3 - Math.min(0.3, t)) }));
  // Until it's lifted the walk is as it was, never more, and never off to the side the hand went.
  assert.ok(closing.every((out) => out.moveY <= walking + 0.02 && Math.abs(out.moveX) < 0.05), `${Math.max(...closing.map((out) => out.moveY))}, ${Math.max(...closing.map((out) => Math.abs(out.moveX)))}`);
  const stopped = closing.find((out) => out.moveY === 0);
  assert.ok(stopped && stopped.at - closing[0].at < 200, `walked on for ${stopped ? Math.round(stopped.at - closing[0].at) : 500} ms`);
  assert.deepEqual(rig.out.stick, { on: false, seen: true, x: 0, y: 0 });
  // Moved about like that, nobody goes anywhere.
  assert.ok([...rig.run(0.5, { aim: OPEN_HAND, move: loosely(-0.4, 0.3) }), ...rig.run(0.5, { aim: OPEN_HAND, move: loosely(0.2, -0.5) })].every(still));
});

test('a hand that\'s pointing, or showing two fingers, isn\'t open: with nothing given to that, it doesn\'t drag at all', () => {
  for (const photo of ['pointing_up', 'victory']) {
    const rig = player();
    const outs = rig.run(1.2, (t) => ({ aim: hand(t * 0.5, 0, photo), move: hand(0, -t * 0.4, photo) }));
    assert.ok(outs.every(still), photo);
    assert.ok(outs.every((out) => !out.pad.on && !out.stick.on && out.pad.seen && out.stick.seen), photo);
  }
  // An open hand that goes to that while it's dragging stops as soon, and is lifted.
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.3, (t) => ({ aim: hand(t, 0), move: OPEN_HAND }));
  const pointing = rig.run(0.5, (t) => ({ aim: hand(0.3 + t, 0, 'pointing_up'), move: OPEN_HAND }));
  assert.ok(pointing.filter((out) => out.at - pointing[0].at > CAMERA_MS + SCREEN_MS).every((out) => out.turn === 0));
  assert.equal(rig.out.pad.on, false);
  // With two fingers given to the walking hand, for the magazine, that hand showing them is down, and walks on.
  // The other hand showing them still isn't: it's what each hand has been given that keeps it down.
  const given = player({ bindings: { reload: 'move:two' } });
  given.run(1, BOTH);
  given.run(0.5, { aim: OPEN_HAND, move: hand(0, -0.3) });
  const walking = given.out.moveY;
  const two = given.run(0.8, (t) => ({ aim: hand(Math.min(0.3, t), 0, 'victory'), move: hand(0, -0.3, 'victory') }));
  assert.equal(two.filter((out) => out.reload).length, 1);
  assert.ok(two.every((out) => Math.abs(out.moveY - walking) < 0.1), `${Math.min(...two.map((out) => out.moveY))}`);
  assert.deepEqual([given.out.stick.on, given.out.pad.on], [true, false]);
  assert.ok(Math.abs(degrees(given.yaw)) < 0.6, `${degrees(given.yaw)}`);
});

test('a thumb that takes its time going up leaves the hand down where it was: the view waits, and the walk carries on', () => {
  // Over nine looks of the tracker's, a third of a second: for some of them the hand is neither open nor
  // anything else yet.
  const slowly = (x, y, t) => {
    const by = clamp((Math.floor(t * 30) + 1) / 9, 0, 1);
    return { photo: OPEN, x, y, toward: THUMB, by };
  };
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.5, { aim: hand(0.2, 0), move: hand(0, -0.3) });
  const [aimed, walking] = [rig.yaw, rig.out.moveY];
  const going = rig.run(0.8, (t) => ({ aim: slowly(0.2, 0, t), move: slowly(0, -0.3, t) }));
  assert.deepEqual([rig.out.fire, rig.out.buttons.reload], [true, true]);
  assert.equal(going.filter((out) => out.reload).length, 1);
  // Neither was lifted on the way, so the walk is from where that hand first went down, as it was.
  assert.ok(going.every((out) => out.pad.on && out.stick.on));
  assert.ok(going.every((out) => Math.abs(out.moveY - walking) < 0.12 && Math.abs(out.moveX) < 0.08), `${Math.min(...going.map((out) => out.moveY))} to ${Math.max(...going.map((out) => out.moveY))}, across ${Math.max(...going.map((out) => Math.abs(out.moveX)))}`);
  assert.ok(Math.max(...going.map((out) => Math.abs(degrees(out.yaw - aimed)))) < 1, `${Math.max(...going.map((out) => Math.abs(degrees(out.yaw - aimed))))}`);
  // And dragged on with the thumb up, the view goes with it from there.
  rig.run(0.5, { aim: hand(0.4, 0, THUMB), move: hand(0, -0.3, THUMB) });
  assert.ok(Math.abs(degrees(rig.yaw - aimed) - 0.2 * PER_PALM) < 1.5, `${degrees(rig.yaw - aimed)}`);
});

test('what each hand drags with can be pointing or a few fingers instead: then that shape is down, and an open hand isn\'t', () => {
  assert.deepEqual(DRAGS, ['open', 'point', 'two', 'three']);
  const rig = player({ drags: { aim: 'point', move: 'two' } });
  // Open hands, moved about: nothing, as they aren't what these hands drag with.
  const open = rig.run(1, (t) => ({ aim: hand(t * 0.3, 0), move: hand(0, -t * 0.3) }));
  assert.ok(open.every(still));
  assert.ok(open.every((out) => !out.pad.on && !out.stick.on));
  // Pointing goes down where it is, and drags the view. Two fingers go down, and drag the walk.
  const down = rig.run(0.5, { aim: hand(0.3, 0, 'pointing_up'), move: hand(0, -0.3, 'victory') });
  assert.ok(down.every(still));
  assert.deepEqual([rig.out.pad.on, rig.out.stick.on], [true, true]);
  const aimed = rig.yaw;
  rig.run(0.5, { aim: hand(0.5, 0, 'pointing_up'), move: hand(0, -0.6, 'victory') });
  assert.ok(Math.abs(degrees(rig.yaw - aimed) - 0.2 * PER_PALM) < 1.2, `${degrees(rig.yaw - aimed)}`);
  assert.ok(rig.out.moveY > 0.5 && Math.abs(rig.out.moveX) < 0.05, `${rig.out.moveX}, ${rig.out.moveY}`);
  // A thumb up still fires, with the hand still down, and opening the hand lets go.
  rig.run(0.5, { aim: hand(0.5, 0, THUMB), move: hand(0, -0.6, 'victory') });
  assert.deepEqual([rig.out.fire, rig.out.pad.on], [true, true]);
  rig.run(0.5, { aim: hand(0.5, 0), move: hand(0, -0.6) });
  assert.deepEqual([rig.out.fire, rig.out.pad.on, rig.out.stick.on, rig.out.moveY], [false, false, false, 0]);

  // Nothing can be given to what its hand drags with, or it would be done all the while the hand was down: it's
  // as it is out of the box, and the other hand's are as they were asked for, however they were kept.
  const clash = new Controls({ drags: { aim: 'point' }, bindings: { fire: 'aim:point', reload: { hand: 'move', is: 'two' } } });
  assert.deepEqual([clash.aim.drag, clash.move.drag], ['point', 'open']);
  assert.deepEqual(clash.bindings, { fire: { hand: 'aim', gesture: 'thumb' }, reload: { hand: 'move', gesture: 'two' }, sprint: 'stick' });
  assert.deepEqual([[...clash.aim.keeps], [...clash.move.keeps]], [['thumb'], ['two']]);
  // Changing what a hand drags with looks at what it's been given again.
  clash.setDrags({ aim: 'open' });
  assert.deepEqual(clash.bindings.fire, { hand: 'aim', gesture: 'point' });
  assert.deepEqual([...clash.aim.keeps], ['point']);
  // And anything a hand can't drag with is an open hand.
  clash.setDrags({ aim: 'thumb', move: 'wave' });
  assert.deepEqual([clash.aim.drag, clash.move.drag], ['open', 'open']);
});

/* ---------- walking ---------- */

test('the walking hand walks the way it\'s dragged from where it went down: up is forwards, down is back, and either side is a sidestep', () => {
  const through = (0.7 - STICK.dead) / (1 - STICK.dead);
  for (const [x, y, wantX, wantY] of [[0, -1, 0, 1], [0, 1, 0, -1], [1, 0, 1, 0], [-1, 0, -1, 0]]) {
    const rig = player();
    rig.run(1, BOTH);
    rig.run(0.6, { aim: OPEN_HAND, move: hand(x * STICK.reach * 0.7, y * STICK.reach * 0.7) });
    const { moveX, moveY, stick } = rig.out;
    assert.ok(Math.abs(moveX - wantX * through) < 0.06 && Math.abs(moveY - wantY * through) < 0.06, `${x}, ${y}: ${moveX}, ${moveY}`);
    // The knob is as far from the middle of its pad as the hand has been dragged, and the view hasn't turned.
    assert.ok(Math.abs(stick.x - x * 0.7) < 0.05 && Math.abs(stick.y - y * 0.7) < 0.05, `${stick.x}, ${stick.y}`);
    assert.equal(rig.yaw, 0);
  }
  // On a slant it's both at once.
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.6, { aim: OPEN_HAND, move: hand(STICK.reach * 0.5, -STICK.reach * 0.5) });
  assert.ok(rig.out.moveX > 0.3 && rig.out.moveY > 0.3 && Math.abs(rig.out.moveX - rig.out.moveY) < 0.05);
});

test('the further it\'s dragged, the faster the walk: nothing near where it went down, all of it at full reach, and a sprint right out forwards', () => {
  const walking = (x, y) => {
    const rig = player();
    rig.run(1, BOTH);
    rig.run(0.6, { aim: OPEN_HAND, move: hand(x * STICK.reach, y * STICK.reach) });
    return rig.out;
  };
  assert.deepEqual([walking(0, -STICK.dead * 0.8).moveY, walking(STICK.dead * 0.8, 0).moveX], [0, 0]);
  const [slow, half, full, beyond] = [0.3, 0.6, 1, 1.6].map((far) => walking(0, -far));
  assert.ok(slow.moveY > 0.1 && slow.moveY < half.moveY && half.moveY < full.moveY, `${slow.moveY}, ${half.moveY}, ${full.moveY}`);
  assert.ok(Math.abs(half.moveY - (0.6 - STICK.dead) / (1 - STICK.dead)) < 0.05);
  assert.deepEqual([full.moveY > 0.97, beyond.moveY], [true, 1]);
  // A sprint is right out, and forwards: not short of it, not to one side, and not backwards.
  assert.deepEqual([full.sprint, beyond.sprint, walking(0, -0.85).sprint, walking(1.1, 0).sprint, walking(0, 1.1).sprint, walking(0.9, -0.6).sprint], [true, true, false, false, false, false]);
  assert.equal(walking(0.3, -1.05).sprint, true, 'a little to one side is still forwards');
  assert.equal(full.buttons.sprint, true);
});

test('closing the walking hand stops the walk within a couple of looks, and opening it again is a fresh tap wherever it is', () => {
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.5, { aim: OPEN_HAND, move: hand(0, -0.3) });
  assert.ok(rig.out.moveY > 0.6);
  const closing = rig.run(0.5, { aim: OPEN_HAND, move: hand(0, -0.3, FIST) });
  const stopped = closing.find((out) => out.moveY === 0);
  assert.ok(stopped.at - closing[0].at < 90, `walked on for ${Math.round(stopped.at - closing[0].at)} ms`);
  assert.deepEqual(rig.out.stick, { on: false, seen: true, x: 0, y: 0 });
  // Opened where it is now, a long way from where it first went down: nothing moves.
  const opened = rig.run(0.5, { aim: OPEN_HAND, move: hand(0, -0.3) });
  assert.ok(opened.every(still));
  assert.equal(rig.out.stick.on, true);
  // And from there, back down to where it began is backwards.
  rig.run(0.5, { aim: OPEN_HAND, move: OPEN_HAND });
  assert.ok(rig.out.moveY < -0.6, `${rig.out.moveY}`);
});

test('a hand dragged a long way has where it went down dragged along behind it, so turning back is never far', () => {
  const rig = player();
  rig.run(1, BOTH);
  // Three times as far as it takes, forwards: where it went down is never more than twice that behind.
  rig.run(0.8, { aim: OPEN_HAND, move: hand(0, -STICK.reach * 3) });
  assert.deepEqual([rig.out.moveY, rig.out.sprint], [1, true]);
  // Coming back a little more than twice as far as it takes is already backwards, not three times.
  rig.run(0.6, { aim: OPEN_HAND, move: hand(0, -STICK.reach * 3 + STICK.reach * 2.5) });
  assert.ok(rig.out.moveY < -0.2, `${rig.out.moveY}`);
  assert.ok(STICK.follow > 1.5);
});

/* ---------- looking round ---------- */

test('the view turns as far as the hand is dragged across: back when it comes back, and still when it\'s still', () => {
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.6, { aim: hand(0.4, 0), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(rig.yaw) - 0.4 * PER_PALM) < 1, `${degrees(rig.yaw)}`);
  assert.ok(Math.abs(rig.out.pad.x - 0.4 / PAD.reach) < 0.05, 'and the knob is as far across its pad');
  const held = rig.yaw;
  const waited = rig.run(1, { aim: hand(0.4, 0), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(rig.yaw - held)) < 0.3);
  assert.ok(waited.slice(30).every(still), 'not a twitch');
  rig.run(0.6, BOTH);
  assert.ok(Math.abs(degrees(rig.yaw)) < 1, `${degrees(rig.yaw)}`);
  rig.run(0.6, { aim: hand(-0.3, 0), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(rig.yaw) + 0.3 * PER_PALM) < 1, `${degrees(rig.yaw)}`);
  // However far: there's no edge to it, and nothing that goes on turning by itself.
  rig.run(0.8, { aim: hand(0.9, 0), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(rig.yaw) - 0.9 * PER_PALM) < 2, `${degrees(rig.yaw)}`);
  const after = rig.run(1, { aim: hand(0.9, 0), move: OPEN_HAND });
  assert.ok(after.slice(30).every(still));
  assert.equal(rig.out.pad.x, 1);
});

test('closing the hand that looks round leaves the view as it is: brought back and opened, it drags on from there, so a turn right round is a few drags', () => {
  const rig = player();
  rig.run(1, BOTH);
  for (let drag = 0; drag < 4; drag += 1) {
    rig.run(0.4, { aim: hand(0.7, 0), move: OPEN_HAND });
    const turned = rig.yaw;
    // Closed where it is, brought back closed, and opened there: none of it turns anything.
    const lifted = [...rig.run(0.3, { aim: hand(0.7, 0, FIST), move: OPEN_HAND }), ...rig.run(0.4, { aim: hand(0, 0, FIST), move: OPEN_HAND }), ...rig.run(0.3, BOTH)];
    assert.ok(Math.max(...lifted.map((out) => Math.abs(degrees(out.yaw - turned)))) < 0.3, `drag ${drag}: ${Math.max(...lifted.map((out) => Math.abs(degrees(out.yaw - turned))))}`);
    assert.equal(rig.out.pad.on, true);
  }
  // Each drag is all but the hair's breadth of play, and the last of what the filter was still arriving at.
  assert.ok(Math.abs(degrees(rig.yaw) - 4 * 0.7 * PER_PALM) < 7, `${degrees(rig.yaw)} degrees in four drags`);
  assert.ok(degrees(rig.yaw) > 180);
  // A hand that's off as it closes: what it turned in the look or two it took to be sure it was closing is taken back.
  const quick = player();
  quick.run(1, BOTH);
  quick.run(0.4, { aim: hand(0.3, 0), move: OPEN_HAND });
  const before = quick.yaw;
  quick.run(0.5, (t) => ({ aim: hand(0.3 - Math.min(0.3, t * 2), 0, FIST), move: OPEN_HAND }));
  assert.ok(Math.abs(degrees(quick.yaw - before)) < 0.3, `${degrees(quick.yaw - before)}`);
  // And one that's being dragged steadily across, and closes as it goes: the view is left where it was when the
  // hand began to close, not where the hand had got to by the time anyone could be sure.
  const going = player();
  going.run(1, BOTH);
  going.run(0.3, (t) => ({ aim: hand(t, 0), move: OPEN_HAND }));
  const closedAt = going.yaw;
  going.run(0.4, (t) => ({ aim: hand(0.3 + Math.min(0.2, t), 0, FIST), move: OPEN_HAND }));
  // (It still had a little to catch up on from before the hand began to close, and that it does.)
  assert.ok(Math.abs(degrees(going.yaw - closedAt)) < 2, `${degrees(going.yaw - closedAt)}`);
  // Brought back fast, closed, and opened the moment it's there: where the filter still had to get to is no drag.
  const fast = player();
  fast.run(1, BOTH);
  fast.run(0.4, { aim: hand(0.6, 0), move: OPEN_HAND });
  fast.run(0.3, { aim: hand(0.6, 0, FIST), move: OPEN_HAND });
  const held = fast.yaw;
  fast.run(0.2, (t) => ({ aim: hand(0.6 - Math.min(0.6, t * 3.2), 0, FIST), move: OPEN_HAND }));
  const reopened = fast.run(0.5, BOTH);
  assert.ok(Math.max(...reopened.map((out) => Math.abs(degrees(out.yaw - held)))) < 0.3, `${Math.max(...reopened.map((out) => Math.abs(degrees(out.yaw - held))))}`);
});

test('how far the view turns for a drag is the sensitivity chosen', () => {
  const turned = Object.fromEntries(Object.keys(SENSITIVITY).map((sensitivity) => {
    const rig = player({ sensitivity });
    rig.run(1, BOTH);
    rig.run(0.6, { aim: hand(0.5, 0), move: OPEN_HAND });
    return [sensitivity, degrees(rig.yaw)];
  }));
  for (const [key, value] of Object.entries(turned)) assert.ok(Math.abs(value - 0.5 * degrees(SENSITIVITY[key])) < 1, `${key}: ${value}`);
  assert.ok(turned.low < turned.medium && turned.medium < turned.high);
  // Changed in the middle, it's what it's changed to, and one that isn't any of them is the usual one.
  const rig = player({ sensitivity: 'low' });
  rig.run(1, BOTH);
  rig.controls.setSensitivity('high');
  rig.run(0.6, { aim: hand(0.5, 0), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(rig.yaw) - turned.high) < 0.5);
  rig.controls.setSensitivity('wild');
  assert.equal(rig.controls.gain, SENSITIVITY.medium);
});

test('only across counts: a hand that goes up and down as it moves, as hands in the air do, never tips the view or turns it', () => {
  const rig = player();
  rig.run(1, BOTH);
  // Straight up and straight down, a good way: nothing turns, and nothing is asked for but what the knob shows.
  for (const down of [-0.6, 0.6]) {
    const outs = rig.run(0.7, { aim: hand(0, down), move: OPEN_HAND });
    assert.ok(Math.abs(degrees(rig.yaw)) < 0.3, `${down}: turned ${degrees(rig.yaw)}`);
    assert.ok(outs.every((out) => !('pitch' in out)), 'there\'s no looking up or down to ask for');
    assert.ok(Math.abs(rig.out.pad.y - clamp(down / PAD.reach, -1, 1)) < 0.05);
    rig.run(0.7, BOTH);
  }
  // Across in an arc, up as it goes and down again: the same turn as straight across.
  const straight = player();
  straight.run(1, BOTH);
  straight.run(0.5, (t) => ({ aim: hand(Math.min(1, t / 0.3) * 0.4, 0), move: OPEN_HAND }));
  const arc = player();
  arc.run(1, BOTH);
  arc.run(0.5, (t) => ({ aim: hand(Math.min(1, t / 0.3) * 0.4, -Math.sin(Math.min(1, t / 0.3) * Math.PI) * 0.3), move: OPEN_HAND }));
  assert.ok(Math.abs(degrees(arc.yaw - straight.yaw)) < 0.6, `${degrees(arc.yaw)} against ${degrees(straight.yaw)}`);
});

test('it\'s the same however far from the camera anyone sits: everything is measured in the hand\'s own size', () => {
  const played = [0.12, 0.2, 0.3].map((palm) => {
    const rig = player({ palm });
    rig.run(1, BOTH);
    rig.run(0.6, { aim: hand(0.4, 0), move: hand(0, -STICK.reach * 0.6) });
    return { yaw: degrees(rig.yaw), moveY: rig.out.moveY };
  });
  for (const each of played) {
    assert.ok(Math.abs(each.yaw - played[1].yaw) < 0.8, `${each.yaw} against ${played[1].yaw}`);
    assert.ok(Math.abs(each.moveY - played[1].moveY) < 0.05, `${each.moveY} against ${played[1].moveY}`);
  }
});

test('with the help with aiming, the view turns less for the hand while the sights are on someone', () => {
  const turnedWith = (slow) => {
    const rig = player();
    rig.run(1, BOTH);
    rig.slow = slow;
    rig.run(0.7, { aim: hand(0.3, 0), move: OPEN_HAND });
    return degrees(rig.yaw);
  };
  assert.ok(Math.abs(turnedWith(0.5) - turnedWith(1) * 0.5) < 0.8, `${turnedWith(0.5)} and ${turnedWith(1)}`);
});

test('a hand held still that trembles, as every hand does, leaves the view all but still and never sets anyone walking', () => {
  // A millimetre or so either way at the hand, which is about what a hand held up and a camera's idea of it come to.
  const rig = player({ shake: 0.0025 });
  rig.run(1.5, BOTH);
  const from = rig.yaw;
  const outs = rig.run(6, BOTH);
  const yaws = outs.map((out) => degrees(out.yaw - from));
  const spread = Math.max(...yaws) - Math.min(...yaws);
  // Left alone, that tremble would be this much of a turn. What's left of it is a small part.
  const unsteady = (0.0025 / PALM) * 2 * PER_PALM;
  assert.ok(spread < unsteady * 0.45 && spread < 0.8, `the view wanders over ${spread.toFixed(2)} of a possible ${unsteady.toFixed(2)} degrees`);
  const steps = outs.map((out) => Math.abs(degrees(out.turn)));
  assert.ok(Math.max(...steps) < 0.1, `it moves ${Math.max(...steps).toFixed(3)} degrees in a frame at most`);
  assert.ok(outs.every((out) => out.moveX === 0 && out.moveY === 0 && !out.fire && !out.reload));
});

test('the view keeps up with a hand that moves: a quick drag is there within about a tenth of a second', () => {
  const rig = player();
  rig.run(1, BOTH);
  // The hand jumps a third of a palm length across, as fast as a hand can.
  const outs = rig.run(0.5, { aim: hand(0.35, 0), move: OPEN_HAND });
  const whole = degrees(outs.at(-1).yaw);
  const after = (ms) => degrees(outs.find((out) => out.at - outs[0].at >= ms - SCREEN_MS).yaw) / whole;
  assert.ok(after(130) > 0.8, `${Math.round(after(130) * 100)}% of the way after 130 ms`);
  assert.ok(after(250) > 0.95, `${Math.round(after(250) * 100)}% of the way after 250 ms`);
  // And it doesn't go past where the hand went by more than a little.
  const most = Math.max(...outs.map((out) => degrees(out.yaw)));
  assert.ok(most < whole * 1.08, `${(most / whole).toFixed(2)} times as far`);
  // If the camera stalls with the hand on the move, the view carries on for a moment and no more: it doesn't
  // run on by itself.
  const stalled = player();
  stalled.run(1, BOTH);
  stalled.run(0.4, (t) => ({ aim: hand(t, 0), move: OPEN_HAND }));
  const stalledAt = stalled.yaw;
  stalled.stalled = true;
  stalled.run(0.25, { aim: hand(0.4, 0), move: OPEN_HAND });
  assert.ok(degrees(stalled.yaw - stalledAt) < 0.06 * PER_PALM, `ran on ${degrees(stalled.yaw - stalledAt).toFixed(2)} degrees with nothing new from the camera`);
  stalled.stalled = false;
  // Following a hand that moves steadily, it's smooth from frame to frame: no steps at the camera's speed.
  const smooth = player();
  smooth.run(1, BOTH);
  const sweep = smooth.run(0.6, (t) => ({ aim: hand(t * 1.2, 0), move: OPEN_HAND })).slice(9, 30);
  const turns = sweep.map((out) => degrees(out.turn));
  assert.ok(Math.min(...turns) > 0, 'always the same way');
  assert.ok(Math.max(...turns) < Math.min(...turns) * 2.6, `from ${Math.min(...turns).toFixed(2)} to ${Math.max(...turns).toFixed(2)} degrees a frame`);
});

/* ---------- the thumb ---------- */

test('a thumb up on the hand that looks round pulls the trigger within a few looks, and letting it down lets go as quickly', () => {
  const rig = player();
  rig.run(1, BOTH);
  const up = rig.run(0.5, { aim: hand(0, 0, THUMB), move: OPEN_HAND });
  const fired = up.find((out) => out.fire);
  assert.ok(fired && fired.at - up[0].at <= CAMERA_MS * 3, `fired after ${Math.round(fired.at - up[0].at)} ms`);
  assert.deepEqual([rig.out.fire, rig.out.buttons.fire, rig.out.pad.on], [true, true, true]);
  const down = rig.run(0.5, BOTH);
  const released = down.find((out) => !out.fire);
  assert.ok(released.at - down[0].at <= CAMERA_MS * 2, `let go after ${Math.round(released.at - down[0].at)} ms`);
  // Nothing else on that hand fires: open, half open, closed, pointing or two fingers. Nor does the other hand's thumb.
  for (const photo of [OPEN, 'relaxed', FIST, 'pointing_up', 'victory']) {
    rig.run(0.3, BOTH);
    assert.ok(rig.run(0.6, { aim: hand(0, 0, photo), move: OPEN_HAND }).every((out) => !out.fire), photo);
  }
  rig.run(0.3, BOTH);
  assert.ok(rig.run(0.6, { aim: OPEN_HAND, move: hand(0, 0, THUMB) }).every((out) => !out.fire));
  assert.ok(TRIGGER.thumbIn < TRIGGER.thumbOut && TRIGGER.fingersBelow < TRIGGER.fingerAbove);
});

test('a thumb up on the walking hand changes the magazine, once each time it goes up', () => {
  const rig = player();
  rig.run(1, BOTH);
  let changed = 0;
  for (let i = 0; i < 3; i += 1) {
    const up = rig.run(0.6, { aim: OPEN_HAND, move: hand(0, 0, THUMB) });
    changed += up.filter((out) => out.reload).length;
    assert.equal(rig.out.buttons.reload, true, 'its button is lit for as long as the thumb is up');
    assert.ok(up.every((out) => !out.fire));
    rig.run(0.4, BOTH);
    assert.equal(rig.out.buttons.reload, false);
  }
  assert.equal(changed, 3);
  const first = rig.run(0.5, { aim: OPEN_HAND, move: hand(0, 0, THUMB) }).find((out) => out.reload);
  assert.ok(first, 'and it\'s asked for within a few looks');
  // The other hand's thumb is the trigger, and changes nothing.
  rig.run(0.4, BOTH);
  assert.ok(rig.run(0.6, { aim: hand(0, 0, THUMB), move: OPEN_HAND }).every((out) => !out.reload));
});

test('the view turns while the trigger is held, and the walking carries on while the magazine is changed, each from where its hand went down', () => {
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.5, { aim: hand(0.2, 0), move: hand(0, -0.3) });
  const [turned, walking] = [rig.yaw, rig.out.moveY];
  assert.ok(walking > 0.6);
  // Both thumbs up, where the hands are: firing, the magazine changed once, walking as fast, and the view where it was.
  const up = rig.run(0.5, { aim: hand(0.2, 0, THUMB), move: hand(0, -0.3, THUMB) });
  assert.equal(rig.out.fire, true);
  assert.equal(up.filter((out) => out.reload).length, 1);
  assert.ok(up.every((out) => Math.abs(out.moveY - walking) < 0.06 && Math.abs(degrees(out.yaw - turned)) < 0.4), `${Math.min(...up.map((out) => out.moveY))}`);
  // Dragged on with the thumbs up: the view turns as far as the hand goes, and the walk turns into a sidestep.
  rig.run(0.5, { aim: hand(0.5, 0, THUMB), move: hand(0.3, 0, THUMB) });
  assert.ok(Math.abs(degrees(rig.yaw - turned) - 0.3 * PER_PALM) < 1, `${degrees(rig.yaw - turned)}`);
  assert.deepEqual([rig.out.fire, rig.out.moveX > 0.6, Math.abs(rig.out.moveY) < 0.06], [true, true, true]);
  // Thumbs down again: both are still down where they first went down.
  rig.run(0.5, { aim: hand(0.5, 0), move: hand(0.3, 0) });
  assert.deepEqual([rig.out.fire, rig.out.moveX > 0.6, rig.out.stick.on, rig.out.pad.on], [false, true, true, true]);
  rig.run(0.5, BOTH);
  assert.ok(Math.abs(degrees(rig.yaw)) < 1 && rig.out.moveX === 0 && rig.out.moveY === 0, `${degrees(rig.yaw)}, ${rig.out.moveX}`);
  // A closed hand with its thumb going straight up, without opening first, goes down where it is and does it.
  const closed = player();
  closed.run(1, CLOSED);
  const straight = closed.run(0.5, { aim: hand(0, 0, THUMB), move: hand(0, 0, THUMB) });
  assert.deepEqual([closed.out.fire, straight.filter((out) => out.reload).length, closed.out.pad.on, closed.out.stick.on], [true, 1, true, true]);
  closed.run(0.5, { aim: hand(0.2, 0, THUMB), move: hand(0, -0.3, THUMB) });
  assert.ok(Math.abs(degrees(closed.yaw) - 0.2 * PER_PALM) < 1 && closed.out.moveY > 0.6);
});

test('a hand on its way to closing, or to opening, never fires or changes the magazine, and one look of a closed hand lets go of nothing', () => {
  // The fingers are in before the thumb, and out after it: for one look the hand looks like a thumb up.
  const rig = player();
  rig.run(1, BOTH);
  const closing = rig.run(0.6, (t) => {
    const photo = [OPEN, OPEN, OPEN, THUMB][Math.floor(t * 30)] ?? FIST;
    return { aim: hand(0, 0, photo), move: hand(0, 0, photo) };
  });
  const opening = rig.run(0.6, (t) => {
    const photo = [FIST, FIST, FIST, THUMB][Math.floor(t * 30)] ?? OPEN;
    return { aim: hand(0, 0, photo), move: hand(0, 0, photo) };
  });
  assert.ok([...closing, ...opening].every((out) => !out.fire && !out.reload), 'one look of a thumb is nobody\'s thumb');
  // And a thumb going up can look like a closed hand for a look: walking carries on from where the hand went
  // down, and the view goes on turning, as if it hadn't.
  const walking = player();
  walking.run(1, BOTH);
  // Walking forwards, with the other hand being dragged steadily across, half a palm length a second.
  walking.run(0.4, (t) => ({ aim: hand(t * 0.5, 0), move: hand(0, -0.3) }));
  const speed = walking.out.moveY;
  const through = walking.run(0.9, (t) => {
    const photo = [OPEN, OPEN, FIST][Math.floor(t * 30)] ?? THUMB;
    return { aim: hand(0.2 + Math.min(0.2, t * 0.5), 0, photo), move: hand(0, -0.3, photo) };
  });
  assert.ok(through.every((out) => Math.abs(out.moveY - speed) < 0.06), `${Math.min(...through.map((out) => out.moveY))}`);
  assert.equal(through.filter((out) => out.reload).length, 1);
  assert.ok(Math.abs(degrees(walking.yaw) - 0.4 * PER_PALM) < 2.5, `${degrees(walking.yaw)} of ${0.4 * PER_PALM}`);
  assert.equal(walking.out.fire, true);
});

/* ---------- fingers moving the middle of the hand ---------- */

// A thumb going up where the hand is, over a tenth of a second: the fingers curl under it, and as they do the
// tracker finds the middle of the hand further and further across, by an eighth of a palm length in all, though it
// hasn't moved. to is what the hand ends as, and looks how many of the tracker's looks it takes.
const SHIFT = 0.125;
const curlingAt = (at, t, { from = 0, looks = 3, to = THUMB } = {}) => {
  const by = clamp((Math.floor((t - from) * 30) + 1) / looks, 0, 1);
  return { photo: OPEN, x: at + SHIFT * by, y: 0, toward: to, by };
};
const uncurlingAt = (at, t, { looks = 3, to = THUMB } = {}) => {
  const by = clamp(1 - (Math.floor(t * 30) + 1) / looks, 0, 1);
  return { photo: OPEN, x: at + SHIFT * by, y: 0, toward: to, by };
};
// Left alone, that shift would be this much of a turn.
const UNSTEADIED = SHIFT * PER_PALM;

test('pulling the trigger doesn\'t pull the aim: the middle of a hand shifts in the picture as its fingers curl, and the view stays where it was', () => {
  const at = 0.2;
  const up = (t) => ({ aim: curlingAt(at, t), move: OPEN_HAND });
  const down = (t) => ({ aim: uncurlingAt(at, t), move: OPEN_HAND });
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.6, { aim: hand(at, 0), move: OPEN_HAND });
  const aimed = rig.yaw;
  const through = rig.run(1, up);
  assert.equal(rig.out.fire, true);
  const worst = Math.max(...through.map((out) => Math.abs(degrees(out.yaw - aimed))));
  assert.ok(UNSTEADIED > 8, `${UNSTEADIED.toFixed(2)}`);
  assert.ok(worst < 0.8, `the view moved ${worst.toFixed(2)} of a possible ${UNSTEADIED.toFixed(2)} degrees`);
  assert.ok(Math.abs(degrees(rig.yaw - aimed)) < 0.5, `and ended ${degrees(rig.yaw - aimed).toFixed(2)} away`);
  // Letting go is the same the other way, and leaves the aim where it was.
  const back = rig.run(1, down);
  assert.equal(rig.out.fire, false);
  assert.ok(Math.max(...back.map((out) => Math.abs(degrees(out.yaw - aimed)))) < 0.8, `${Math.max(...back.map((out) => Math.abs(degrees(out.yaw - aimed)))).toFixed(2)}`);
  // Again and again, it never adds up to anything.
  for (let i = 0; i < 8; i += 1) {
    rig.run(0.5, up);
    rig.run(0.5, down);
  }
  assert.ok(Math.abs(degrees(rig.yaw - aimed)) < 0.5, `after eight more: ${degrees(rig.yaw - aimed).toFixed(2)}`);
  // Nor does a single shot, up and straight down again, however quickly one follows the other.
  for (const gap of [0.2, 0.26, 0.3, 0.34, 0.4]) {
    const quick = player();
    quick.run(1, BOTH);
    quick.run(0.6, { aim: hand(at, 0), move: OPEN_HAND });
    const from = quick.yaw;
    const outs = [...quick.run(gap, up), ...quick.run(gap, down), ...quick.run(gap, up), ...quick.run(0.6, down)];
    const most = Math.max(...outs.map((out) => Math.abs(degrees(out.yaw - from))));
    assert.ok(most < 1.3, `${gap} seconds apart: the view moved ${most.toFixed(2)} degrees`);
  }
  // However long the fingers take over it.
  for (const looks of [2, 3, 5, 9]) {
    const slow = player();
    slow.run(1, BOTH);
    slow.run(0.6, { aim: hand(at, 0), move: OPEN_HAND });
    const from = slow.yaw;
    const outs = slow.run(1, (t) => ({ aim: curlingAt(at, t, { looks }), move: OPEN_HAND }));
    const most = Math.max(...outs.map((out) => Math.abs(degrees(out.yaw - from))));
    assert.ok(most < UNSTEADIED * 0.16, `curling over ${looks} looks: the view moved ${most.toFixed(2)} of a possible ${UNSTEADIED.toFixed(2)} degrees`);
    assert.equal(slow.out.fire, true, `curling over ${looks} looks`);
  }
  // The tracker's first look at a hand that has just changed is a little out, and its next two put that right:
  // the aim stays where it was through all three.
  const settling = player();
  settling.run(1, BOTH);
  settling.run(0.6, { aim: hand(at, 0), move: OPEN_HAND });
  const settled = settling.yaw;
  const looked = settling.run(1, (t) => ({ aim: hand(at - ([0.03, 0.012][Math.floor(t * 30)] ?? 0.006), 0, THUMB), move: OPEN_HAND }));
  const out = Math.max(...looked.map((each) => Math.abs(degrees(each.yaw - settled))));
  assert.ok(out < 0.4, `the tracker settling moved the view ${out.toFixed(2)} degrees`);
  // That's only for a moment after the fingers stop. Half a second on, a hand that's dragged slowly has the view
  // go with it from the start.
  const later = player();
  later.run(1, BOTH);
  later.run(0.5, { aim: hand(0, 0, THUMB), move: OPEN_HAND });
  later.run(0.8, (t) => ({ aim: hand(Math.min(0.3, t * 0.5), 0, THUMB), move: OPEN_HAND }));
  assert.ok(Math.abs(degrees(later.yaw) - 0.3 * PER_PALM) < 1.2, `dragged later: turned ${degrees(later.yaw).toFixed(2)} of ${(0.3 * PER_PALM).toFixed(2)} degrees`);
  // And one that's off across as soon as the thumb is up, at a walking target's pace or slower, has it too:
  // it's never more than a thirtieth of a palm length that's left out that way.
  for (const speed of [1.5, 0.6]) {
    const off = player();
    off.run(1, BOTH);
    off.run(1, (t) => ({ aim: hand(Math.min(0.3, Math.max(0, t - 1 / 30) * speed), 0, THUMB), move: OPEN_HAND }));
    assert.ok(Math.abs(degrees(off.yaw) - 0.3 * PER_PALM) < 3.2, `off at ${speed}: turned ${degrees(off.yaw).toFixed(2)} of ${(0.3 * PER_PALM).toFixed(2)} degrees`);
  }
  // And the aim still follows the hand while the trigger is held.
  rig.run(0.5, up);
  const firing = rig.yaw;
  rig.run(0.6, { aim: hand(at + SHIFT + 0.2, 0, THUMB), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(rig.yaw - firing) - 0.2 * PER_PALM) < 1.5, `${degrees(rig.yaw - firing).toFixed(2)}`);
  assert.equal(rig.out.fire, true);
});

test('letting go doesn\'t nudge the view either: the middle of a hand shifts as it closes and as it opens, and the view stays where it was', () => {
  const at = 0.2;
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.6, { aim: hand(at, 0), move: hand(0, -0.3) });
  const [aimed, walking] = [rig.yaw, rig.out.moveY];
  // Both hands close where they are, over a tenth of a second.
  const closing = rig.run(0.6, (t) => ({ aim: curlingAt(at, t, { to: FIST }), move: { ...curlingAt(0, t, { to: FIST }), y: -0.3 } }));
  const nudged = Math.max(...closing.map((out) => Math.abs(degrees(out.yaw - aimed))));
  assert.ok(nudged < 0.8, `closing turned the view ${nudged.toFixed(2)} of a possible ${UNSTEADIED.toFixed(2)} degrees`);
  assert.ok(Math.abs(degrees(rig.yaw - aimed)) < 0.3, `and left it ${degrees(rig.yaw - aimed).toFixed(2)} away`);
  assert.deepEqual([rig.out.pad.on, rig.out.stick.on, rig.out.moveY], [false, false, 0]);
  // Walking didn't veer off to one side on the way to stopping.
  assert.ok(closing.every((out) => Math.abs(out.moveX) < 0.25 && out.moveY <= walking + 0.05), `${Math.max(...closing.map((out) => Math.abs(out.moveX)))}`);
  // They open again, the same way back: nothing turns, and nobody sets off.
  const opening = rig.run(0.8, (t) => ({ aim: uncurlingAt(at, t, { to: FIST }), move: { ...uncurlingAt(0, t, { to: FIST }), y: -0.3 } }));
  assert.ok(Math.max(...opening.map((out) => Math.abs(degrees(out.yaw - aimed)))) < 0.8, `${Math.max(...opening.map((out) => Math.abs(degrees(out.yaw - aimed))))}`);
  assert.ok(Math.abs(degrees(rig.yaw - aimed)) < 0.5);
  assert.ok(opening.every((out) => Math.hypot(out.moveX, out.moveY) < 0.2), `${Math.max(...opening.map((out) => Math.hypot(out.moveX, out.moveY)))}`);
  assert.deepEqual([rig.out.pad.on, rig.out.stick.on], [true, true]);
  // Ten times over, it still hasn't gone anywhere.
  for (let i = 0; i < 10; i += 1) {
    rig.run(0.4, (t) => ({ aim: curlingAt(at, t, { to: FIST }), move: OPEN_HAND }));
    rig.run(0.4, (t) => ({ aim: uncurlingAt(at, t, { to: FIST }), move: OPEN_HAND }));
  }
  assert.ok(Math.abs(degrees(rig.yaw - aimed)) < 1, `after ten more: ${degrees(rig.yaw - aimed).toFixed(2)}`);
});

test('the tracker catching up with a hand that has just changed is never a turn: its first look is a long way out, and the next is back', () => {
  // As the real tracker does when a hand goes from one thing to another in a single picture: the middle of it
  // getting on for a tenth of a palm length out at the first look, and back, or nearly, at the next. Whichever of
  // the two is the quicker, and whether or not either is more than fingers could do.
  const at = 0.2;
  for (const [out, back] of [[0.07, 0.09], [0.09, 0.07], [0.1, 0.1], [0.06, 0.06], [0.12, 0.1]]) {
    const jumping = (photo) => (t) => ({ aim: hand(at - out + (Math.floor(t * 30) < 1 ? 0 : back), 0, photo), move: OPEN_HAND });
    // A thumb going up on a hand that's down.
    const rig = player();
    rig.run(1, BOTH);
    rig.run(0.5, { aim: hand(at, 0), move: OPEN_HAND });
    const aimed = rig.yaw;
    const outs = rig.run(0.8, jumping(THUMB));
    assert.equal(rig.out.fire, true);
    const most = Math.max(...outs.map((each) => Math.abs(degrees(each.yaw - aimed))));
    assert.ok(most < 1.2, `out ${out} and back ${back}, thumb up: the view moved ${most.toFixed(2)} of a possible ${(Math.max(out, back) * PER_PALM).toFixed(2)} degrees`);
    // With the tracker a look or two late about the fingers as well, as it was with a real picture of a hand:
    // three quarters of the way to a thumb up at its first look, nearly there at the next, and there at the
    // third. So the fingers are still on the move in the look the middle of the hand comes back in.
    const late = player();
    late.run(1, BOTH);
    late.run(0.5, { aim: hand(at, 0), move: OPEN_HAND });
    const from = late.yaw;
    const lateOuts = late.run(0.8, (t) => ({ aim: { ...jumping(OPEN)(t).aim, toward: THUMB, by: [0.75, 0.92][Math.floor(t * 30)] ?? 1 }, move: OPEN_HAND }));
    assert.equal(late.out.fire, true);
    const lateMost = Math.max(...lateOuts.map((each) => Math.abs(degrees(each.yaw - from))));
    assert.ok(lateMost < 1.2, `out ${out} and back ${back}, thumb up with its fingers late: the view moved ${lateMost.toFixed(2)} of a possible ${(Math.max(out, back) * PER_PALM).toFixed(2)} degrees`);
    // The same on its way down again. The tracker's first looks at the fingers are a little out too, as they
    // were when it did this with a real picture of a hand: a quarter of the way back up, and then a twelfth.
    const down = rig.run(0.8, (t) => ({ aim: { ...jumping(OPEN)(t).aim, toward: THUMB, by: [0.25, 0.08][Math.floor(t * 30)] ?? 0 }, move: OPEN_HAND }));
    assert.ok(Math.max(...down.map((each) => Math.abs(degrees(each.yaw - aimed)))) < 2.2, `out ${out} and back ${back}, thumb down: ${Math.max(...down.map((each) => Math.abs(degrees(each.yaw - aimed)))).toFixed(2)}`);
    // And a closed hand, lifted, whose thumb goes straight up: it goes down where it is, and nothing turns.
    const closed = player();
    closed.run(1, BOTH);
    closed.run(0.5, { aim: hand(at, 0, FIST), move: OPEN_HAND });
    const lifted = closed.yaw;
    const up = closed.run(0.8, jumping(THUMB));
    assert.equal(closed.out.fire, true);
    assert.ok(Math.max(...up.map((each) => Math.abs(degrees(each.yaw - lifted)))) < 1.2, `out ${out} and back ${back}, from closed: ${Math.max(...up.map((each) => Math.abs(degrees(each.yaw - lifted)))).toFixed(2)}`);
  }
  // A hand that really does go that far in a look as its thumb goes up, and stays there, has the view go with it.
  const went = player();
  went.run(1, BOTH);
  const outs = went.run(0.6, { aim: hand(0.15, 0, THUMB), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(went.yaw) - 0.15 * PER_PALM) < 1.2, `${degrees(went.yaw)}`);
  // A look late, and no later.
  const there = outs.find((each) => degrees(each.yaw) > 0.15 * PER_PALM * 0.8);
  assert.ok(there.at - outs[0].at < 160, `there after ${Math.round(there.at - outs[0].at)} ms`);
});

test('a hand may rest however it likes: once its fingers are back as they were nothing is left out, and the aim is where it was', () => {
  // A hand that rests with two fingers up puts its thumb up, and down again. The tracker has its fingers back at
  // once, and is two looks late in putting the middle of it back where it was.
  const at = 0.2;
  const rig = player();
  rig.run(1, BOTH);
  rig.run(1.2, { aim: hand(at, 0, 'victory'), move: OPEN_HAND });
  const rested = rig.yaw;
  rig.run(0.6, (t) => ({ aim: Math.floor(t * 30) < 1 ? { ...hand(at + SHIFT / 2, 0, 'victory'), toward: THUMB, by: 0.5 } : hand(at + SHIFT, 0, THUMB), move: OPEN_HAND }));
  assert.ok(Math.abs(degrees(rig.yaw - rested)) < 0.8, `the thumb going up moved the view ${degrees(rig.yaw - rested).toFixed(2)} degrees`);
  rig.run(0.8, (t) => ({ aim: hand(at + SHIFT * (Math.floor(t * 30) < 1 ? 1 : Math.floor(t * 30) < 2 ? 0.5 : 0), 0, 'victory'), move: OPEN_HAND }));
  assert.ok(Math.abs(degrees(rig.yaw - rested)) < 1, `and after it's down it's ${degrees(rig.yaw - rested).toFixed(2)} degrees from where it was`);
});

test('pulled while the hand is on its way, the aim goes on as the hand was going: following someone, arriving on them, or only just stopped', () => {
  /**
   * How far the view ends from where the same hand has it with its fingers still. path is where it is, in palm
   * lengths, and its thumb begins to go up at fingersFrom seconds: over three looks, or over as many as looks
   * says. Either way it has fired a shot already, as anyone has.
   */
  const off = (path, fingersFrom, looks = 3) => {
    const ends = [true, false].map((fingers) => {
      const rig = player();
      rig.run(1, BOTH);
      rig.run(0.4, { aim: hand(SHIFT, 0, THUMB), move: OPEN_HAND });
      rig.run(0.6, BOTH);
      const from = rig.yaw;
      rig.run(1.2, (t) => ({ aim: fingers ? curlingAt(path(t), t, { from: fingersFrom, looks }) : hand(path(t), 0), move: OPEN_HAND }));
      if (fingers) assert.equal(rig.out.fire, true);
      return degrees(rig.yaw - from);
    });
    return ends[0] - ends[1];
  };
  // Following someone across, half a palm length a second, and carrying on: the aim carries on with it.
  const following = off((t) => Math.min(0.4, t * 0.5), 0.5);
  assert.ok(Math.abs(following) < 2.6, `following: ${following.toFixed(2)} degrees off`);
  // Twice as fast, with the fingers curling in two looks: that's more across in a look than a hand held still
  // could seem to go, and it's still its fingers, once how the hand itself was going is taken off.
  const quick = off((t) => Math.min(0.5, t), 0.3, 2);
  assert.ok(Math.abs(quick) < 3.5, `following quickly: ${quick.toFixed(2)} degrees off`);
  // Arriving on someone with a quick reach, the fingers beginning a twentieth of a second before the hand stops.
  const reach = (t) => {
    const s = Math.min(1, Math.max(0, t / 0.25));
    return 0.33 * (10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5);
  };
  const arriving = off(reach, 0.2);
  assert.ok(Math.abs(arriving) < UNSTEADIED * 0.6, `arriving: ${arriving.toFixed(2)} degrees off, for a shift of ${UNSTEADIED.toFixed(2)}`);
  // Pulled in the middle of that reach, with the hand at its fastest, it's the hand going and nothing is left
  // out for long: the aim is never further off than the shift would have put it left alone.
  const flick = off(reach, 0.1);
  assert.ok(Math.abs(flick) < UNSTEADIED * 1.08, `in the middle of a reach: ${flick.toFixed(2)} degrees off, for a shift of ${UNSTEADIED.toFixed(2)}`);
  // Following someone and stopping as the trigger is pulled: how it was going fades from what it's taken to be doing.
  const stopping = off((t) => Math.min(0.5, t) * 1, 0.5);
  assert.ok(Math.abs(stopping) < 5.6, `stopping: ${stopping.toFixed(2)} degrees off`);
  // Going fast and stopping dead as the trigger is pulled: it isn't taken to be going on that fast.
  const dead = off((t) => Math.min(0.25, t) * 2.2, 0.25);
  assert.ok(Math.abs(dead) < 7.4, `stopping dead: ${dead.toFixed(2)} degrees off`);
  // A hand that has only just stopped, two looks ago, isn't taken to be going on at all: the filter is slow to
  // hear that a hand has stopped, and what the hand really did in the last look is what counts.
  const stopped = off((t) => Math.min(0.2, t) * 2.4, 0.2 + 2 / 30);
  assert.ok(Math.abs(stopped) < 1.8, `just stopped: ${stopped.toFixed(2)} degrees off`);
  // Nor is a hand ever taken to have gone on past where it stopped: one that's a third of a palm length across in
  // a single look and stops there, with the tracker changing its mind about its fingers in each of the next
  // three, never has the view go past where it ends up.
  const rig = player();
  rig.run(1, BOTH);
  const after = rig.run(1.2, (t) => ({ aim: hand(0.33, 0, [OPEN, 'relaxed', 'victory', 'relaxed'][Math.floor(t * 30)] ?? OPEN), move: OPEN_HAND }));
  const past = Math.max(...after.map((each) => degrees(each.yaw - rig.yaw)));
  assert.ok(past < 0.7, `the view went ${past.toFixed(2)} degrees past where the hand stopped`);
});

test('a hand sweeping fast, blurred so that how open it is is anyone\'s guess, still turns the view as far as it goes', () => {
  // A quick drag of more than half a palm length, there in a fifth of a second and stopping dead.
  const sweep = (t) => Math.min(1, t / 0.2) * 0.6;
  const turned = (photoAt) => {
    const rig = player();
    rig.run(1, BOTH);
    rig.run(0.8, (t) => ({ aim: hand(sweep(t), 0, photoAt(t)), move: OPEN_HAND }));
    return degrees(rig.yaw);
  };
  const clean = turned(() => OPEN);
  // The same, with the tracker making it an open hand in one look and a half-open one in the next while it moves.
  const blurred = turned((t) => (t < 0.3 && Math.floor(t * 30) % 2 ? 'relaxed' : OPEN));
  assert.ok(Math.abs(clean - 0.6 * PER_PALM) < 1.5, `${clean}`);
  assert.ok(Math.abs(blurred - clean) < 1.5, `${blurred.toFixed(2)} against ${clean.toFixed(2)} degrees`);
  // Or even a closed one, for a single look in the middle of it: one look of a closed hand lets go of nothing.
  const closedOnce = turned((t) => (Math.floor(t * 30) === 3 ? FIST : OPEN));
  assert.ok(Math.abs(closedOnce - clean) < 1.5, `${closedOnce.toFixed(2)} against ${clean.toFixed(2)} degrees`);
  // Nor is a quick drag straight after the thumb goes up swallowed: it's up, and at the very next look the hand is off.
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.5, (t) => ({ aim: hand(t < 1 / 30 ? 0 : Math.min(1, (t - 1 / 30) / 0.15) * 0.4, 0, THUMB), move: OPEN_HAND }));
  assert.equal(rig.out.fire, true);
  assert.ok(Math.abs(degrees(rig.yaw) - 0.4 * PER_PALM) < 3, `${degrees(rig.yaw).toFixed(2)} of ${(0.4 * PER_PALM).toFixed(2)} degrees`);
  // Nor one made as the thumb goes up: all the way up in one look, and a quarter of a palm length across in the same one.
  const both = player();
  both.run(1, BOTH);
  both.run(0.5, { aim: hand(0.25, 0, THUMB), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(both.yaw) - 0.25 * PER_PALM) < 1.5, `${degrees(both.yaw).toFixed(2)} of ${(0.25 * PER_PALM).toFixed(2)} degrees`);
  // A hand the camera loses for a moment and finds again somewhere else, thumb up: nobody knows how it got there,
  // so nothing is left out, and the view goes with it.
  const lost = player();
  lost.run(1, BOTH);
  lost.run(0.15, { aim: null, move: OPEN_HAND });
  lost.run(0.6, { aim: hand(0.3, 0, THUMB), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(lost.yaw) - 0.3 * PER_PALM) < 1.5, `${degrees(lost.yaw).toFixed(2)} of ${(0.3 * PER_PALM).toFixed(2)} degrees`);
});

test('a hand the tracker can\'t make its mind up about is never held back: the view goes with it', () => {
  // Half open in one look and open in the next, or two fingers for a look and then five, on and on, while the
  // hand is dragged a third of a palm length across: slowly, and quickly. A single look of something else is
  // the tracker's slip, and the hand has gone on dragging all the while.
  const meant = 0.35 * PER_PALM;
  const guesses = {
    'half open every other look': (t) => (Math.floor(t * 30) % 2 ? 'relaxed' : OPEN),
    'half open two looks in four': (t) => (Math.floor(t * 15) % 2 ? 'relaxed' : OPEN),
    'two fingers every other look': (t) => (Math.floor(t * 30) % 2 ? 'victory' : OPEN),
    'two fingers one look in three': (t) => (Math.floor(t * 30) % 3 === 1 ? 'victory' : OPEN),
  };
  for (const [name, guess] of Object.entries(guesses)) {
    for (const seconds of [2, 0.9, 0.4]) {
      const path = (t) => Math.min(1, t / seconds) * 0.35;
      const sure = player();
      sure.run(1, BOTH);
      const steady = sure.run(seconds + 1, (t) => ({ aim: hand(path(t), 0), move: OPEN_HAND }));
      const rig = player();
      rig.run(1, BOTH);
      const outs = rig.run(seconds + 1, (t) => ({ aim: hand(path(t), 0, guess(t)), move: OPEN_HAND }));
      const apart = Math.max(...outs.map((out, index) => Math.abs(degrees(out.yaw - steady[index].yaw))));
      assert.ok(apart < 5.2, `${name}, across in ${seconds} s: ${apart.toFixed(2)} degrees from where a hand it was sure of would have it`);
      assert.ok(Math.abs(degrees(rig.yaw) - meant) < 1.8, `${name}, across in ${seconds} s: turned ${degrees(rig.yaw).toFixed(2)} of ${meant.toFixed(2)} degrees`);
      // And held still, guessing all the while, the view is still.
      const from = rig.yaw;
      rig.run(3, (t) => ({ aim: hand(0.35, 0, guess(t)), move: OPEN_HAND }));
      assert.ok(Math.abs(degrees(rig.yaw - from)) < 1, `${name}, held still: ${degrees(rig.yaw - from).toFixed(2)}`);
    }
  }
});

/* ---------- what the fingers are doing, and what it's given to ---------- */

/** What the tracker made of a photo, as readHand would have it, with the tip of the thumb put against a finger's if asked. */
function looked(photo, pinching = null) {
  const made = handAt(photo, 0.5, 0.5, { palm: PALM, label: 'Right' });
  const tip = pinching ? made.image[FINGER_TIPS[pinching]] : null;
  const image = made.image.map((point, index) => (tip && index === 4 ? { ...point, x: tip.x + 0.003, y: tip.y + 0.003 } : point));
  const mirrored = image.map(({ x, y, z }) => ({ x: 1 - x, y, z }));
  return readHand({ status: 'open', reason: null, image: mirrored, world: made.world, openness: 1 }, FRAME_ASPECT);
}
// What it's making, apart from being open, which has a test of its own.
const making = (hand, was) => Object.entries(gesturesOf(hand, was)).filter(([name, on]) => on && name !== 'open').map(([name]) => name).sort();

test('a fist, a thumb up, pointing, two fingers and an open hand are each told for what they are, from real hands', () => {
  assert.deepEqual(making(looked(FIST)), ['fist']);
  assert.deepEqual(making(looked(THUMB)), ['thumb']);
  assert.deepEqual(making(looked('pointing_up')), ['point']);
  assert.deepEqual(making(looked('victory')), ['two']);
  for (const photo of [OPEN, 'right_hands', 'woman_hands', 'palm', 'relaxed']) assert.deepEqual(making(looked(photo)), [], photo);
  assert.ok(Object.keys(photos).includes(THUMB));
});

test('a pinch of the thumb against each finger is told from the others, and from a hand on its way to a fist', () => {
  for (const finger of Object.keys(FINGER_TIPS)) assert.deepEqual(making(looked(OPEN, finger)), [`pinch-${finger}`], finger);
  // The thumb near the first finger with the rest of the hand curling up is a hand closing, not a pinch.
  const open = looked(OPEN, 'index');
  const closing = { ...open, openness: 0.33, fingers: { thumb: 0.2, index: 0.42, middle: 0.3, ring: 0.3, pinky: 0.3 } };
  assert.deepEqual(making(closing), []);
  // And closed, it's a fist, whatever the thumb is against.
  assert.deepEqual(making({ ...closing, openness: 0.05, fingers: { thumb: 0, index: 0.05, middle: 0, ring: 0, pinky: 0.1 } }), ['fist']);
  // Between two fingers, it's the nearer one's.
  const between = { ...looked(OPEN), pinches: { index: 0.22, middle: 0.18, ring: 0.9, pinky: 1.2 } };
  assert.deepEqual(making(between), ['pinch-middle']);
});

test('each takes a little more to stop than it took to start, so none of them flickers', () => {
  const open = looked(OPEN);
  const with_ = (change) => ({ ...open, ...change, fingers: { ...open.fingers, ...change.fingers }, pinches: { ...open.pinches, ...change.pinches } });
  const apart = { index: 2, middle: 2, ring: 2, pinky: 2 };
  // A pinch: made below one distance, and kept until the tips are well apart.
  const nearly = with_({ pinches: { index: (TRIGGER.pinchedBelow + TRIGGER.apartAbove) / 2 } });
  assert.deepEqual(making(nearly), []);
  assert.deepEqual(making(nearly, { 'pinch-index': true }), ['pinch-index']);
  assert.deepEqual(making(with_({ pinches: { index: TRIGGER.apartAbove + 0.05 } }), { 'pinch-index': true }), []);
  // A closed hand: closed with every finger well curled, and kept until one is well out.
  const fingers = (curl) => ({ index: curl, middle: curl, ring: curl, pinky: curl });
  const between = (TRIGGER.fingersBelow + TRIGGER.fingerAbove) / 2;
  // The thumb against the side of the fingers: near them, and not pinching any.
  const tucked = { index: 0.4, middle: 0.5, ring: 0.7, pinky: 0.9 };
  assert.deepEqual(making(with_({ fingers: fingers(between), pinches: tucked })), []);
  assert.deepEqual(making(with_({ fingers: fingers(between), pinches: tucked }), { fist: true }), ['fist']);
  // And while it's closed, the thumb against a finger isn't a pinch as well.
  assert.deepEqual(making(with_({ fingers: fingers(between), pinches: { ...tucked, index: 0.2 } }), { fist: true }), ['fist']);
  assert.deepEqual(making(with_({ fingers: fingers(TRIGGER.fingerAbove + 0.05), pinches: tucked }), { fist: true }), []);
  // With the first finger well out it's no longer a fist: it's pointing. And with three out, it's three fingers.
  assert.deepEqual(making(with_({ fingers: { ...fingers(0.2), index: 0.9 }, pinches: apart }), { fist: true }), ['point']);
  assert.deepEqual(making(with_({ fingers: { thumb: 0, index: 1, middle: 1, ring: 0.9, pinky: 0.1 }, pinches: apart })), ['three']);
  assert.deepEqual(making(with_({ fingers: { thumb: 0, index: 1, middle: 1, ring: 0.1, pinky: 0.1 }, pinches: apart })), ['two']);
  // A thumb up: up with the tip of it well clear of every finger, and kept until it's nearly back against one.
  // Half way out it's neither yet: not a thumb up, and not a fist.
  const half = { ...apart, index: (TRIGGER.thumbIn + TRIGGER.thumbOut) / 2 };
  assert.deepEqual(making(with_({ fingers: fingers(0.1), pinches: half })), []);
  assert.deepEqual(making(with_({ fingers: fingers(0.1), pinches: half }), { fist: true }), []);
  assert.deepEqual(making(with_({ fingers: fingers(0.1), pinches: half }), { thumb: true }), ['thumb']);
  assert.deepEqual(making(with_({ fingers: fingers(0.1), pinches: { ...apart, index: TRIGGER.thumbIn - 0.05 } }), { thumb: true }), ['fist']);
  assert.deepEqual(making(with_({ fingers: fingers(0.1), pinches: { ...apart, index: TRIGGER.thumbOut + 0.05 } })), ['thumb']);
  // The first finger curled like a trigger, with the rest left straight.
  const curled = with_({ fingers: { index: TRIGGER.curled - 0.05 }, pinches: apart });
  assert.deepEqual(making(curled), ['trigger']);
  const easing = with_({ fingers: { index: (TRIGGER.curled + TRIGGER.uncurled) / 2 }, pinches: apart });
  assert.deepEqual(making(easing), []);
  assert.deepEqual(making(easing, { trigger: true }), ['trigger']);
});

test('what fires, reloads and sprints is whatever each is given to: anything a hand that\'s down can do, on either hand', () => {
  assert.deepEqual(ACTIONS, ['fire', 'reload', 'sprint']);
  assert.deepEqual(BINDINGS, { fire: 'aim:thumb', reload: 'move:thumb', sprint: 'stick' });
  assert.deepEqual(readBinding('move:pinch-ring'), { hand: 'move', gesture: 'pinch-ring' });
  // As the grown-ups' panel keeps it: a hand, and what it's doing.
  assert.deepEqual(readBinding({ hand: 'aim', is: 'three' }), { hand: 'aim', gesture: 'three' });
  assert.deepEqual([readBinding({ hand: 'aim', is: 'fist' }), readBinding({ hand: 'foot', is: 'two' }), readBinding({ hand: 'aim', is: { fingers: ['index'] } }), readBinding({})], [null, null, null, null]);
  assert.deepEqual(Object.keys(GESTURES), ['thumb', 'point', 'two', 'three', 'pinch-index', 'pinch-middle', 'pinch-ring', 'pinch-pinky', 'trigger']);
  // A closed hand is a hand lifted: nothing can be given to it.
  assert.deepEqual([readBinding('stick'), readBinding('off'), readBinding('foot:thumb'), readBinding('aim:wave'), readBinding('aim:fist'), readBinding('move:close'), readBinding(null)], ['stick', 'off', null, null, null, null, null]);
  assert.ok(!('fist' in GESTURES));
  for (const gesture of Object.values(GESTURES)) assert.ok(gesture.name && gesture.words && gesture.mark);

  // Two fingers out on the walking hand changes the magazine, and a thumb up there no longer does.
  const two = player({ bindings: { reload: 'move:two' } });
  two.run(1, BOTH);
  assert.equal(two.run(0.6, { aim: OPEN_HAND, move: hand(0, 0, 'victory') }).filter((out) => out.reload).length, 1);
  assert.equal(two.out.buttons.reload, true);
  two.run(0.5, BOTH);
  assert.equal(two.run(0.6, { aim: OPEN_HAND, move: hand(0, 0, THUMB) }).filter((out) => out.reload).length, 0);
  // And firing is still the other hand's thumb.
  two.run(0.4, { aim: hand(0, 0, THUMB), move: OPEN_HAND });
  assert.equal(two.out.fire, true);

  // The trigger given to the walking hand: its thumb fires, held, and the other hand's changes the magazine.
  const swapped = player({ bindings: { fire: 'move:thumb', reload: 'aim:thumb' } });
  swapped.run(1, BOTH);
  const firing = swapped.run(1, { aim: OPEN_HAND, move: hand(0, 0, THUMB) });
  assert.ok(firing.slice(8).every((out) => out.fire && !out.reload));
  swapped.run(0.5, BOTH);
  const other = swapped.run(1, { aim: hand(0, 0, THUMB), move: OPEN_HAND });
  assert.ok(other.every((out) => !out.fire));
  assert.equal(other.filter((out) => out.reload).length, 1);

  // A pinch of the thumb and middle finger for the trigger: a pinch with the first finger isn't it, and nor is a thumb up.
  const pinchOn = (finger) => (made) => {
    const tip = made.image[FINGER_TIPS[finger]];
    return { ...made, image: made.image.map((point, index) => (index === 4 ? { ...point, x: tip.x + 0.003, y: tip.y + 0.003 } : point)) };
  };
  const middle = player({ bindings: { fire: 'aim:pinch-middle' } });
  middle.run(1, BOTH);
  middle.run(0.4, { aim: { ...OPEN_HAND, change: pinchOn('middle') }, move: OPEN_HAND });
  assert.equal(middle.out.fire, true);
  assert.deepEqual(middle.controls.links(), { aim: [[4, FINGER_TIPS.middle]], move: [] });
  middle.run(0.4, { aim: { ...OPEN_HAND, change: pinchOn('index') }, move: OPEN_HAND });
  assert.equal(middle.out.fire, false);
  assert.deepEqual(middle.controls.links(), { aim: [], move: [] });
  middle.run(0.4, { aim: hand(0, 0, THUMB), move: OPEN_HAND });
  assert.equal(middle.out.fire, false);
  // And the hand is still down while it pinches: the view goes on turning.
  middle.run(0.4, BOTH);
  const before = middle.yaw;
  middle.run(0.5, { aim: { ...hand(0.3, 0), change: pinchOn('middle') }, move: OPEN_HAND });
  assert.ok(middle.out.fire && Math.abs(degrees(middle.yaw - before) - 0.3 * PER_PALM) < 1.5, `${degrees(middle.yaw - before)}`);

  // A sprint given to a pinch: only while it's held, walking forwards, and dragging right out is no longer one.
  const pinched = player({ bindings: { sprint: 'move:pinch-index' } });
  pinched.run(1, BOTH);
  pinched.run(0.6, { aim: OPEN_HAND, move: hand(0, -STICK.reach * 1.1) });
  assert.deepEqual([pinched.out.sprint, pinched.out.moveY > 0.9], [false, true]);
  pinched.run(0.6, { aim: OPEN_HAND, move: { ...hand(0, -STICK.reach * 0.6), change: pinchOn('index') } });
  assert.deepEqual([pinched.out.sprint, pinched.out.buttons.sprint], [true, true]);
  pinched.run(0.6, { aim: OPEN_HAND, move: { ...hand(0, STICK.reach * 0.6), change: pinchOn('index') } });
  assert.equal(pinched.out.sprint, false, 'not backwards');
  // Switched off, there's no sprinting at all, and a magazine only changes when it's empty.
  const none = player({ bindings: { sprint: 'off', reload: 'off' } });
  none.run(1, BOTH);
  const out = none.run(0.8, { aim: OPEN_HAND, move: hand(0, -STICK.reach * 1.1, THUMB) });
  assert.ok(out.every((each) => !each.sprint && !each.reload));

  // Firing can't be switched off, sprinting is the only one dragging can do, and anything that isn't something a
  // hand that's down can do is what it was out of the box.
  const odd = new Controls({ bindings: { fire: 'off', reload: 'stick', sprint: 'aim:fist' } });
  assert.deepEqual(odd.bindings, { fire: { hand: 'aim', gesture: 'thumb' }, reload: { hand: 'move', gesture: 'thumb' }, sprint: 'stick' });
  // Changed in the middle of a match, it's what it's changed to.
  two.controls.setBindings({ reload: 'move:thumb' });
  two.run(0.5, BOTH);
  assert.equal(two.run(0.6, { aim: OPEN_HAND, move: hand(0, 0, THUMB) }).filter((each) => each.reload).length, 1);
});

/* ---------- when a hand can't be trusted ---------- */

test('a hand the camera loses stops firing at once, and one that\'s gone for longer lets go of everything', () => {
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.5, { aim: hand(0.3, 0), move: hand(0, -0.3) });
  rig.run(0.5, { aim: hand(0.3, 0, THUMB), move: hand(0, -0.3) });
  assert.deepEqual([rig.out.fire, rig.out.moveY > 0.5, rig.out.pad.on], [true, true, true]);
  const gone = rig.run(1, { aim: null, move: null });
  const stopped = gone.find((out) => !out.fire);
  assert.ok(stopped.at - gone[0].at < 220, `fired on for ${Math.round(stopped.at - gone[0].at)} ms`);
  const halted = gone.find((out) => out.moveY === 0 && out.turn === 0);
  assert.ok(halted.at - gone[0].at < 450, `walked on for ${Math.round(halted.at - gone[0].at)} ms`);
  assert.deepEqual([rig.out.hands, rig.out.stick.on, rig.out.pad.on, rig.out.turn, rig.out.fire], [0, false, false, 0, false]);
  // Back, open, they go down afresh, wherever they are: nothing moves for it.
  const back = rig.run(0.5, { aim: hand(-0.4, 0), move: hand(0.3, 0.3) });
  assert.ok(back.every(still));
  assert.deepEqual([rig.out.stick.on, rig.out.pad.on], [true, true]);
  // A single look the tracker drops, as it does now and then, changes nothing.
  const steady = player();
  steady.run(1, BOTH);
  steady.run(0.5, { aim: hand(0.2, 0, THUMB), move: hand(0, -0.3) });
  const dropped = steady.run(CAMERA_MS / 1000 + 0.001, { aim: null, move: null });
  assert.ok(dropped.every((out) => out.fire && out.moveY > 0.5));
  steady.run(0.3, { aim: hand(0.2, 0, THUMB), move: hand(0, -0.3) });
  assert.deepEqual([steady.out.fire, steady.out.moveY > 0.5, steady.out.stick.on], [true, true, true]);
});

test('a hand cut off by the edge of the picture, or touching the other one, never fires', () => {
  // Off the side of the picture: the tracker still sees most of it, and says its thumb is up.
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.5, { aim: hand(0, 0, THUMB), move: OPEN_HAND });
  assert.equal(rig.out.fire, true);
  const edge = rig.run(1, { aim: hand(2.25, 0, THUMB), move: OPEN_HAND });
  assert.equal(rig.monitor.snapshot.right.reason, 'edge');
  assert.ok(edge.slice(4).every((out) => !out.fire));
  // The two hands together: neither can be told from the other, so neither does anything.
  const both = player();
  both.run(1, BOTH);
  const together = both.run(1.2, { aim: hand(-1.5, 0, THUMB), move: hand(1.5, 0, THUMB) });
  assert.equal(both.monitor.snapshot.overlap, true);
  assert.ok(together.slice(4).every((out) => !out.fire && !out.reload));
  assert.deepEqual([both.out.moveX, both.out.moveY, both.out.turn, both.out.stick.on, both.out.pad.on], [0, 0, 0, false, false]);
});

test('which hand does which follows the hand in play, and nothing that isn\'t a hand does anything', () => {
  const rig = player({ side: 'left' });
  rig.run(1, BOTH);
  // The left hand is the one in play here: it looks round and fires, and the right one walks.
  rig.run(0.6, { aim: hand(0.3, 0), move: hand(0, -0.3) });
  rig.run(0.4, { aim: hand(0.3, 0, THUMB), move: hand(0, -0.3) });
  assert.ok(degrees(rig.yaw) > 15 && rig.out.fire && rig.out.moveY > 0.5, `${degrees(rig.yaw)}, ${rig.out.fire}, ${rig.out.moveY}`);
  assert.equal(readHand(rig.monitor.snapshot.left, FRAME_ASPECT).x < 0.9, true, 'and it\'s on the left of the picture');
  // Nothing at all, or something that isn't a hand: nothing happens, and nothing breaks.
  const controls = new Controls();
  for (const bad of [null, undefined, {}, { side: 'right' }, { side: 'right', right: { status: 'open', image: [] }, other: { status: 'open', image: 'x' } }]) {
    const out = controls.update(bad ?? {}, FRAME_ASPECT, 1000, 1 / 60);
    assert.deepEqual([out.moveX, out.moveY, out.turn, out.fire, out.reload, out.hands], [0, 0, 0, false, false, 0]);
  }
  const points = Array.from({ length: 21 }, () => ({ x: NaN, y: NaN, z: 0 }));
  assert.equal(readHand({ status: 'open', image: points, openness: 1 }, FRAME_ASPECT), null);
  assert.equal(readHand({ status: 'missing', image: null }, FRAME_ASPECT), null);
});

test('the controls have no screen or camera in them, and say what they do', () => {
  const text = readFileSync(new URL('../../games/frost-arena/controls.js', import.meta.url), 'utf8');
  assert.ok(!/document|window|navigator|performance\.now|requestAnimationFrame/.test(text));
  assert.ok(STICK.dead > 0.1 && STICK.dead < 0.3 && STICK.reach < 0.6);
  assert.ok(text.startsWith('// Frost Arena\'s controls'));
});
