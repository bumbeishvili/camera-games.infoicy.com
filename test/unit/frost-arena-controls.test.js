// Frost Arena's controls: two hands in the air as a stick and a look pad. These run the real hand monitor on what
// the real model made of photos of hands (test/fixtures/photo-hands.json), moved about as a player would move
// them, at the speed a camera sends pictures and the speed a screen draws them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HandMonitor } from '../../core/hands.js';
import { ACTIONS, BINDINGS, Controls, FILTER, FINGER_TIPS, GESTURES, OneEuro, PAD, SENSITIVITY, STICK, TRIGGER, gesturesOf, readBinding, readHand } from '../../games/frost-arena/controls.js';
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
 * A player in front of a camera. Each hand is { photo, x, y }: which photo it looks like, and how far it is from
 * where it rests, in palm lengths, across and down the picture, or null for a hand that's out of it. closed, from
 * 0 to 1, has it that much of the way from the photo to a fist. The hand in play looks round and fires, and the
 * other walks and reloads.
 */
function player({ side = 'right', palm = PALM, sensitivity = 'medium', shake = 0, seed = 3, bindings = {} } = {}) {
  const monitor = new HandMonitor({}, side);
  const controls = new Controls({ sensitivity, bindings });
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
    if (hand.closed) made = between(made, handAt(FIST, ...at, options), hand.closed);
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
      if (rig.sinceCamera >= CAMERA_MS) {
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

const OPEN_HAND = { photo: OPEN, x: 0, y: 0 };
const BOTH = { aim: OPEN_HAND, move: OPEN_HAND };
const hand = (x = 0, y = 0, photo = OPEN) => ({ photo, x, y });

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

test('a stick and a ring appear where each hand comes to rest, and nothing happens until it has', () => {
  const rig = player();
  // No hands: nothing.
  rig.run(0.5, { aim: null, move: null });
  assert.deepEqual([rig.out.hands, rig.out.stick.on, rig.out.pad.on, rig.out.stick.seen], [0, false, false, false]);
  // Both come up into the picture from below, quickly, and stop.
  const rising = (t) => ({ aim: hand(0.4, Math.max(0, 2.5 - t * 10)), move: hand(-0.3, Math.max(0, 2.5 - t * 10)) });
  const up = rig.run(0.25, rising);
  assert.ok(up.every((out) => !out.stick.on && !out.pad.on), 'still on their way');
  assert.ok(up.every((out) => out.turn === 0 && out.moveX === 0 && out.moveY === 0 && !out.fire));
  assert.equal(rig.out.hands, 2);
  assert.equal(rig.out.stick.seen, true);
  const landed = rig.run(0.6, rising);
  assert.deepEqual([rig.out.stick.on, rig.out.pad.on], [true, true]);
  // Where they stopped is the middle of each: no walking, and no turning, from having landed.
  assert.ok(Math.abs(rig.out.stick.x) < 0.1 && Math.abs(rig.out.stick.y) < 0.1, `${rig.out.stick.x}, ${rig.out.stick.y}`);
  assert.ok(Math.abs(rig.out.pad.x) < 0.1 && Math.abs(rig.out.pad.y) < 0.1);
  assert.deepEqual([rig.out.moveX, rig.out.moveY], [0, 0]);
  assert.ok(Math.abs(degrees(landed.reduce((sum, out) => sum + out.turn, 0))) < 1.5, 'landing doesn\'t turn the view');
});

test('a hand that leaves and comes back lands afresh, wherever it comes back', () => {
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.6, { aim: OPEN_HAND, move: hand(0, -0.5) });
  assert.ok(rig.out.moveY > 0.5);
  // The walking hand goes out of the picture: the stick is let go, and the walking stops.
  rig.run(0.6, { aim: OPEN_HAND, move: null });
  assert.deepEqual([rig.out.stick.on, rig.out.stick.seen, rig.out.moveY, rig.out.hands], [false, false, 0, 1]);
  // It comes back higher up than it was: that's the middle now.
  rig.run(0.8, { aim: OPEN_HAND, move: hand(0.2, -0.5) });
  assert.equal(rig.out.stick.on, true);
  assert.deepEqual([rig.out.moveX, rig.out.moveY], [0, 0]);
  rig.run(0.5, { aim: OPEN_HAND, move: hand(0.2, -1) });
  assert.ok(rig.out.moveY > 0.5);
  // The same for the hand that looks round: the view stays where it was left, and the hand starts from the middle
  // of its ring wherever it comes back.
  rig.run(0.6, { aim: hand(PAD.reach * 0.5, 0), move: hand(0.2, -0.5) });
  const turned = rig.yaw;
  assert.ok(degrees(turned) > 10);
  rig.run(0.6, { aim: null, move: hand(0.2, -0.5) });
  assert.deepEqual([rig.out.pad.on, rig.out.pad.seen, rig.out.turn], [false, false, 0]);
  rig.run(0.8, { aim: hand(-0.3, 0.2), move: hand(0.2, -0.5) });
  assert.equal(rig.out.pad.on, true);
  assert.ok(Math.abs(degrees(rig.yaw - turned)) < 0.6, `the view moved ${degrees(rig.yaw - turned).toFixed(2)} degrees when the hand came back`);
  assert.ok(Math.abs(rig.out.pad.x) < 0.1);
});

/* ---------- the stick ---------- */

test('the stick walks the way the hand goes from where it rests: up is forwards, down is back, and either side is a sidestep', () => {
  const far = STICK.reach * 0.8;
  for (const [x, y, wantX, wantY, about] of [[0, -far, 0, 1, 'up'], [0, far, 0, -1, 'down'], [far, 0, 1, 0, 'right'], [-far, 0, -1, 0, 'left'], [far * 0.7, -far * 0.7, 1, 1, 'up and right']]) {
    const rig = player();
    rig.run(1, BOTH);
    rig.run(0.6, { aim: OPEN_HAND, move: hand(x, y) });
    const { moveX, moveY, stick, sprint } = rig.out;
    assert.equal(Math.sign(Math.round(moveX * 4)) || 0, wantX, `${about}: across ${moveX.toFixed(2)}`);
    assert.equal(Math.sign(Math.round(moveY * 4)) || 0, wantY, `${about}: forwards ${moveY.toFixed(2)}`);
    assert.ok(Math.hypot(moveX, moveY) > 0.55 && Math.hypot(moveX, moveY) < 0.95, `${about}: ${Math.hypot(moveX, moveY).toFixed(2)}`);
    // What's drawn is where the hand is on its stick: across as the hand is, and down as it is.
    assert.equal(Math.sign(Math.round(stick.x * 4)) || 0, Math.sign(x), about);
    assert.equal(Math.sign(Math.round(stick.y * 4)) || 0, Math.sign(y), about);
    assert.equal(sprint, false, about);
    // The view has nothing to do with it.
    assert.ok(Math.abs(degrees(rig.yaw)) < 1.5, `${about}: the view turned ${degrees(rig.yaw).toFixed(2)}`);
  }
});

test('the further out the hand, the faster the walk: nothing near the middle, all of it at the edge, and a sprint pushed right out forwards', () => {
  const speedAt = (x, y) => {
    const rig = player();
    rig.run(1, BOTH);
    rig.run(0.7, { aim: OPEN_HAND, move: hand(x, y) });
    return rig.out;
  };
  // Near the middle, nothing: a hand that isn't quite still doesn't creep.
  assert.deepEqual([speedAt(0, -STICK.reach * STICK.dead * 0.7).moveY, speedAt(STICK.reach * STICK.dead * 0.7, 0).moveX], [0, 0]);
  const speeds = [0.3, 0.5, 0.7, 0.9].map((share) => speedAt(0, -STICK.reach * share).moveY);
  for (let i = 1; i < speeds.length; i += 1) assert.ok(speeds[i] > speeds[i - 1] + 0.1, `${speeds}`);
  assert.ok(speeds[0] > 0.05 && speeds[0] < 0.25, `${speeds[0]}`);
  // Right out, it's all of it, and no more however far the hand goes.
  const out = speedAt(0, -STICK.reach * 1.1);
  assert.ok(out.moveY > 0.97 && out.moveY <= 1, `${out.moveY}`);
  assert.ok(Math.abs(speedAt(0, STICK.reach * 2.2).moveY + 1) < 1e-6);
  // And that, forwards, is a sprint. To the side or backwards it isn't, and nor is anything short of right out.
  assert.equal(out.sprint, true);
  assert.equal(out.buttons.sprint, true);
  assert.equal(speedAt(0, -STICK.reach * 0.8).sprint, false);
  assert.equal(speedAt(STICK.reach * 1.2, 0).sprint, false);
  assert.equal(speedAt(0, STICK.reach * 1.2).sprint, false);
  assert.equal(speedAt(STICK.reach * 0.5, -STICK.reach * 1.1).sprint, true, 'forwards and a little to one side still is');
});

test('a stick pushed a long way is dragged along, so stopping is never further than a short way back', () => {
  const rig = player();
  rig.run(1, BOTH);
  // A long way to one side: three times the stick's reach.
  rig.run(0.8, { aim: OPEN_HAND, move: hand(STICK.reach * 3, 0) });
  assert.ok(rig.out.moveX > 0.97);
  // Coming back by less than twice its reach is enough to be going the other way.
  rig.run(0.6, { aim: OPEN_HAND, move: hand(STICK.reach * 3 - STICK.reach * (STICK.follow + 0.6), 0) });
  assert.ok(rig.out.moveX < -0.3, `${rig.out.moveX}`);
  // Left where it was, the hand would still have been well out on that side.
  assert.ok(STICK.reach * 3 - STICK.reach * (STICK.follow + 0.6) > STICK.reach);
});

test('it\'s the same however far from the camera anyone sits: everything is measured in the hand\'s own size', () => {
  const walked = [0.12, 0.2, 0.28].map((palm) => {
    const rig = player({ palm });
    rig.run(1, BOTH);
    rig.run(0.7, { aim: hand(0.4, 0), move: hand(0, -0.4) });
    return [rig.out.moveY, degrees(rig.yaw)];
  });
  for (const [speed, turned] of walked) {
    assert.ok(Math.abs(speed - walked[1][0]) < 0.08, `${walked.map(([each]) => each.toFixed(2))}`);
    assert.ok(Math.abs(turned - walked[1][1]) < 1.5, `${walked.map(([, each]) => each.toFixed(1))}`);
  }
});

/* ---------- looking ---------- */

test('inside its ring the view follows the hand: as far as it goes, back when it comes back, and still when it\'s still', () => {
  const rig = player();
  rig.run(1, BOTH);
  const half = PAD.reach * 0.5;
  rig.run(0.6, { aim: hand(half, 0), move: OPEN_HAND });
  const there = degrees(rig.yaw);
  // Half way across the ring is half of what the whole ring turns.
  assert.ok(Math.abs(there - degrees(SENSITIVITY.medium) * 0.5) < 1.2, `${there.toFixed(2)} degrees`);
  assert.ok(Math.abs(rig.out.pad.x - 0.5) < 0.06);
  assert.equal(rig.out.pad.edge, 0);
  // Held there, the view holds: it doesn't creep.
  const held = rig.run(2, { aim: hand(half, 0), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(rig.yaw) - there) < 0.15, `crept ${(degrees(rig.yaw) - there).toFixed(3)}`);
  assert.ok(held.every((out) => Math.abs(degrees(out.turn)) < 0.05));
  // To the other side, it's as far the other way. Back in the middle, it's back where it began.
  rig.run(0.7, { aim: hand(-half, 0), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(rig.yaw) + degrees(SENSITIVITY.medium) * 0.5) < 1.2, `${degrees(rig.yaw).toFixed(2)}`);
  rig.run(0.7, BOTH);
  assert.ok(Math.abs(degrees(rig.yaw)) < 0.6, `${degrees(rig.yaw).toFixed(2)}`);
  // Walking has nothing to do with it.
  assert.deepEqual([rig.out.moveX, rig.out.moveY], [0, 0]);
});

test('pushed past its ring the view keeps turning that way, faster the further out, and stops as soon as the hand is back inside', () => {
  const rateAt = (across) => {
    const rig = player();
    rig.run(1, BOTH);
    rig.run(0.6, { aim: hand(across, 0), move: OPEN_HAND });
    const from = rig.yaw;
    rig.run(1, { aim: hand(across, 0), move: OPEN_HAND });
    return { rate: degrees(rig.yaw - from), out: rig.out, rig };
  };
  assert.ok(Math.abs(rateAt(PAD.reach * 0.95).rate) < 0.3, 'not inside it');
  const rates = [1.15, 1.3, 1.45, 1.6].map((share) => rateAt(PAD.reach * share).rate);
  for (let i = 1; i < rates.length; i += 1) assert.ok(rates[i] > rates[i - 1] * 1.3, `${rates.map((rate) => rate.toFixed(0))} degrees a second`);
  // A little past it is a slow turn, for the last few degrees. A long way past is a quick turn right round.
  assert.ok(rates[0] > 3 && rates[0] < 45, `${rates[0].toFixed(1)}`);
  const most = rateAt(PAD.reach * 2.4);
  assert.ok(Math.abs(most.rate - degrees(PAD.turnMost)) < 4, `${most.rate.toFixed(0)} degrees a second`);
  assert.ok(most.rate > 150, 'right round in a couple of seconds');
  assert.deepEqual([most.out.pad.x, most.out.pad.edge], [1, 1]);
  // The same the other way.
  assert.ok(Math.abs(rateAt(-PAD.reach * 1.45).rate + rates[2]) < 2);
  // Back inside the ring, it stops: only as far back as the hand has come inside it. Coming in from far out
  // doesn't swing the view back by how far out it was.
  const { rig } = most;
  const out = rig.yaw;
  rig.run(0.5, { aim: hand(PAD.reach * 0.9, 0), move: OPEN_HAND });
  assert.ok(degrees(rig.yaw - out) > -5, `coming back in swung the view ${degrees(rig.yaw - out).toFixed(1)} degrees`);
  const from = rig.yaw;
  rig.run(1, { aim: hand(PAD.reach * 0.9, 0), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(rig.yaw - from)) < 0.2);
});

test('a ring comes to rest under a hand that rests, without the view moving, so stopping a turn is just stopping', () => {
  const rig = player();
  rig.run(1, BOTH);
  // A big turn: past the ring, and back just inside it.
  rig.run(1.2, { aim: hand(PAD.reach * 1.8, 0), move: OPEN_HAND });
  rig.run(0.25, { aim: hand(PAD.reach * 0.95, 0), move: OPEN_HAND });
  const turned = rig.yaw;
  assert.ok(degrees(turned) > 60, `${degrees(turned)}`);
  assert.ok(rig.out.pad.x > 0.8, 'at the edge of its ring');
  // Held there, the ring comes under it: the knob goes back to the middle, and the view doesn't move.
  const settling = rig.run(1.5, { aim: hand(PAD.reach * 0.95, 0), move: OPEN_HAND });
  assert.ok(Math.abs(rig.out.pad.x) < 0.08, `the knob is at ${rig.out.pad.x}`);
  assert.ok(Math.abs(degrees(rig.yaw - turned)) < 0.4, `the view moved ${degrees(rig.yaw - turned).toFixed(2)} degrees`);
  assert.ok(settling.every((out) => Math.abs(degrees(out.turn)) < 0.2));
  // From there, there's the whole ring either way again: most of a ring further on is a turn by the hand, with
  // no keeping on turning.
  rig.run(0.6, { aim: hand(PAD.reach * 1.75, 0), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(rig.yaw - turned) - degrees(SENSITIVITY.medium) * 0.8) < 1.5, `${degrees(rig.yaw - turned).toFixed(2)}`);
  assert.equal(rig.out.pad.edge, 0);
  // And bringing the hand back turns the view back, as moving a hand always does.
  rig.run(0.35, { aim: hand(PAD.reach * 0.95, 0), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(rig.yaw - turned)) < 1.5, `${degrees(rig.yaw - turned).toFixed(2)}`);
});

test('a hand held still past its ring is turning the view, and its ring stays where it is for as long as it\'s held', () => {
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.6, { aim: hand(-PAD.reach * 1.3, 0), move: OPEN_HAND });
  const from = rig.yaw;
  const held = rig.run(4, { aim: hand(-PAD.reach * 1.3, 0), move: OPEN_HAND });
  const each = held.map((out) => degrees(out.turn));
  assert.ok(degrees(rig.yaw - from) < -40, `${degrees(rig.yaw - from)}`);
  // As fast at the end as at the start: the ring hasn't crept out under the hand.
  assert.ok(Math.abs(each.at(-1) - each[30]) < 0.01, `${each[30]} and ${each.at(-1)}`);
  assert.deepEqual([rig.out.pad.x, rig.out.pad.edge < -0.4], [-1, true]);
});

test('a ring follows a hand no further than a couple of rings from where it landed', () => {
  // A small hand in the picture, so there's room for it to go a long way across.
  const rig = player({ palm: 0.11 });
  rig.run(1, BOTH);
  // Further and further across, resting each time: the ring follows, and then follows no more.
  const knobs = [];
  for (let step = 1; step <= 4; step += 1) {
    rig.run(1.3, { aim: hand(PAD.reach * 0.8 * step, 0), move: OPEN_HAND });
    knobs.push(rig.out.pad.x);
  }
  assert.ok(Math.abs(knobs[0]) < 0.1 && Math.abs(knobs[1]) < 0.1, `${knobs}`);
  // 3.2 rings from where it landed, with the ring 2 away at most: the knob is past the edge of it, and it's turning.
  assert.ok(knobs[3] === 1 && rig.out.pad.edge > 0.3, `${knobs}, ${rig.out.pad.edge}`);
  assert.equal(PAD.wander, 2);
});

test('a hand that drifts as it rests on the stick never sets anyone walking, and a hand held out on it goes on walking', () => {
  const rig = player();
  rig.run(1, BOTH);
  // Drifting a long way, slowly: far enough to be walking, had the stick stayed where it was.
  const far = { x: STICK.reach * 0.7, y: STICK.reach * 0.4 };
  const drifting = rig.run(20, (t) => ({ aim: OPEN_HAND, move: hand((far.x * t) / 20, (far.y * t) / 20) }));
  assert.ok(Math.hypot(far.x, far.y) / STICK.reach > STICK.dead * 2);
  assert.ok(drifting.every((out) => out.moveX === 0 && out.moveY === 0), 'never a step');
  assert.ok(Math.abs(rig.out.stick.x) < 0.15 && Math.abs(rig.out.stick.y) < 0.15, 'the stick is under the hand');
  // From where it's drifted to, a push is a push, and it lasts as long as it's held.
  rig.run(0.6, { aim: OPEN_HAND, move: hand(far.x, far.y - STICK.reach * 0.7) });
  const walking = rig.out.moveY;
  assert.ok(walking > 0.5, `${walking}`);
  const held = rig.run(8, { aim: OPEN_HAND, move: hand(far.x, far.y - STICK.reach * 0.7) });
  assert.ok(held.every((out) => Math.abs(out.moveY - walking) < 0.04), `from ${Math.min(...held.map((out) => out.moveY))} to ${Math.max(...held.map((out) => out.moveY))}`);
});

test('how far the view turns for the hand is the grown-up\'s choice of sensitivity', () => {
  const turned = Object.keys(SENSITIVITY).map((sensitivity) => {
    const rig = player({ sensitivity });
    rig.run(1, BOTH);
    rig.run(0.7, { aim: hand(PAD.reach * 0.6, 0), move: OPEN_HAND });
    return degrees(rig.yaw);
  });
  assert.ok(turned[0] < turned[1] - 2 && turned[1] < turned[2] - 2, `${turned.map((each) => each.toFixed(1))}`);
  assert.deepEqual(Object.keys(SENSITIVITY), ['low', 'medium', 'high']);
  // Across the whole ring is about what's on the screen: someone at its edge is at the edge of the ring.
  assert.ok(degrees(SENSITIVITY.medium) > 22 && degrees(SENSITIVITY.medium) < 34);
  // Changing it in the middle of a match takes effect.
  const rig = player({ sensitivity: 'low' });
  rig.run(1, BOTH);
  rig.controls.setSensitivity('high');
  rig.run(0.7, { aim: hand(PAD.reach * 0.6, 0), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(rig.yaw) - turned[2]) < 1);
});

test('only across counts: a hand that goes up and down as it moves, as hands in the air do, never tips the view or turns it', () => {
  const rig = player();
  rig.run(1, BOTH);
  // Straight up and straight down, a good way: nothing turns, and nothing is asked for but what the knob shows.
  for (const down of [-PAD.reach * 0.9, PAD.reach * 0.9]) {
    const outs = rig.run(0.7, { aim: hand(0, down), move: OPEN_HAND });
    assert.ok(Math.abs(degrees(rig.yaw)) < 0.3, `${down}: turned ${degrees(rig.yaw)}`);
    assert.ok(outs.every((out) => !('pitch' in out)), 'there\'s no looking up or down to ask for');
    rig.run(0.7, BOTH);
  }
  // Across in an arc, up as it goes and down again: the same turn as straight across.
  const straight = player();
  straight.run(1, BOTH);
  straight.run(0.5, (t) => ({ aim: hand(Math.min(1, t / 0.3) * PAD.reach * 0.6, 0), move: OPEN_HAND }));
  const arc = player();
  arc.run(1, BOTH);
  arc.run(0.5, (t) => ({ aim: hand(Math.min(1, t / 0.3) * PAD.reach * 0.6, -Math.sin(Math.min(1, t / 0.3) * Math.PI) * 0.3), move: OPEN_HAND }));
  assert.ok(Math.abs(degrees(arc.yaw - straight.yaw)) < 0.6, `${degrees(arc.yaw)} against ${degrees(straight.yaw)}`);
});

test('with the help with aiming, the view turns less for the hand while the sights are on someone', () => {
  const turnedWith = (slow) => {
    const rig = player();
    rig.run(1, BOTH);
    rig.slow = slow;
    rig.run(0.7, { aim: hand(PAD.reach * 0.5, 0), move: OPEN_HAND });
    return degrees(rig.yaw);
  };
  assert.ok(Math.abs(turnedWith(0.5) - turnedWith(1) * 0.5) < 0.8, `${turnedWith(0.5)} and ${turnedWith(1)}`);
});

/* ---------- a steady hand ---------- */

test('a hand held still that trembles, as every hand does, leaves the view all but still and never sets anyone walking', () => {
  // A millimetre or so either way at the hand, which is about what a hand held up and a camera's idea of it come to.
  const rig = player({ shake: 0.0025 });
  rig.run(1.5, BOTH);
  const from = rig.yaw;
  const outs = rig.run(6, BOTH);
  const yaws = outs.map((out) => degrees(out.yaw - from));
  const spread = Math.max(...yaws) - Math.min(...yaws);
  assert.ok(spread < 0.5, `the view wanders over ${spread.toFixed(2)} degrees`);
  const steps = outs.map((out) => Math.abs(degrees(out.turn)));
  assert.ok(Math.max(...steps) < 0.06, `it moves ${Math.max(...steps).toFixed(3)} degrees in a frame at most`);
  assert.ok(outs.every((out) => out.moveX === 0 && out.moveY === 0 && !out.fire && !out.reload));
  // Without the filter the same tremble is several times as much: it's the filter that holds it.
  const unsteady = Math.max(...Array.from({ length: 200 }, () => 0.0025 / PALM / PAD.reach)) * degrees(SENSITIVITY.medium) * 2;
  assert.ok(spread < unsteady * 0.5, `${spread.toFixed(2)} of ${unsteady.toFixed(2)}`);
});

test('the view keeps up with a hand that moves: a quick turn is there within about a tenth of a second', () => {
  const rig = player();
  rig.run(1, BOTH);
  // The hand jumps half way across the ring, as fast as a hand can.
  const outs = rig.run(0.5, { aim: hand(PAD.reach * 0.5, 0), move: OPEN_HAND });
  const whole = degrees(outs.at(-1).yaw);
  const after = (ms) => degrees(outs.find((out) => out.at - outs[0].at >= ms - SCREEN_MS).yaw) / whole;
  assert.ok(after(130) > 0.8, `${Math.round(after(130) * 100)}% of the way after 130 ms`);
  assert.ok(after(250) > 0.95, `${Math.round(after(250) * 100)}% of the way after 250 ms`);
  // And it doesn't go past where the hand went by more than a little.
  const most = Math.max(...outs.map((out) => degrees(out.yaw)));
  assert.ok(most < whole * 1.08, `${(most / whole).toFixed(2)} times as far`);
  // Following a hand that moves steadily, it's smooth from frame to frame: no steps at the camera's speed.
  const smooth = player();
  smooth.run(1, BOTH);
  const sweep = smooth.run(0.6, (t) => ({ aim: hand(t * 1.2, 0), move: OPEN_HAND })).slice(9, 30);
  const turns = sweep.map((out) => degrees(out.turn));
  assert.ok(Math.min(...turns) > 0, 'always the same way');
  assert.ok(Math.max(...turns) < Math.min(...turns) * 2.6, `from ${Math.min(...turns).toFixed(2)} to ${Math.max(...turns).toFixed(2)} degrees a frame`);
});

/* ---------- the trigger, and the magazine ---------- */

test('closing the hand in play pulls the trigger within a couple of looks of the camera, and opening it lets go as quickly', () => {
  const rig = player();
  rig.run(1, BOTH);
  assert.equal(rig.out.fire, false);
  const closing = rig.run(0.4, { aim: hand(0, 0, FIST), move: OPEN_HAND });
  const pulled = closing.find((out) => out.fire);
  assert.ok(pulled && pulled.at - closing[0].at <= CAMERA_MS * 2 + SCREEN_MS, `${Math.round(pulled.at - closing[0].at)} ms`);
  assert.equal(rig.out.fire, true);
  assert.deepEqual(rig.out.buttons, { fire: true, reload: false, sprint: false });
  assert.equal(rig.out.reload, false, 'that hand doesn\'t change the magazine');
  // Held, it stays pulled.
  assert.ok(rig.run(2, { aim: hand(0, 0, FIST), move: OPEN_HAND }).every((out) => out.fire));
  const opening = rig.run(0.4, BOTH);
  const let_go = opening.find((out) => !out.fire);
  assert.ok(let_go.at - opening[0].at <= CAMERA_MS * 2 + SCREEN_MS, `${Math.round(let_go.at - opening[0].at)} ms`);
  assert.equal(rig.out.fire, false);
});

test('a pinch of thumb and first finger pulls the trigger too, and no other hand does: open, relaxed or with the fingers spread', () => {
  // The same open hand, with the tips of its thumb and first finger brought together.
  const pinched = (made) => {
    const tip = made.image[8];
    return { ...made, image: made.image.map((point, index) => (index === 4 ? { ...point, x: tip.x + 0.004, y: tip.y + 0.004 } : point)) };
  };
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.3, { aim: { ...OPEN_HAND, change: pinched }, move: OPEN_HAND });
  assert.equal(rig.out.fire, true);
  rig.run(0.3, BOTH);
  assert.equal(rig.out.fire, false);
  for (const photo of [OPEN, 'right_hands', 'woman_hands', 'palm']) {
    const other = player();
    other.run(1, { aim: hand(0, 0, photo), move: OPEN_HAND });
    assert.ok(other.run(1, { aim: hand(0, 0, photo), move: OPEN_HAND }).every((out) => !out.fire), photo);
  }
  assert.ok(TRIGGER.closedBelow < TRIGGER.openAbove && TRIGGER.pinchedBelow < TRIGGER.apartAbove);
});

// A hand closing where it is, over a tenth of a second: open, half open, closed. As it closes, the tracker finds
// the middle of it further and further across, by an eighth of a palm length in all, though it hasn't moved.
const SHIFT = 0.125;
const closingAt = (at, t, from = 0) => {
  const looks = Math.floor((t - from) * 30);
  const [photo, share] = looks < 0 ? [OPEN, 0] : looks < 1 ? ['relaxed', 1 / 3] : looks < 2 ? ['thumb_up', 2 / 3] : [FIST, 1];
  return hand(at + SHIFT * share, 0, photo);
};
// Left alone, that shift would be this much of a turn.
const UNSTEADIED = (SHIFT / PAD.reach) * degrees(SENSITIVITY.medium);

test('pulling the trigger doesn\'t pull the aim: the middle of a hand shifts in the picture as it closes, and the view stays where it was', () => {
  const at = PAD.reach * 0.3;
  const closing = (t) => ({ aim: closingAt(at, t), move: OPEN_HAND });
  const opening = (t) => {
    const looks = Math.floor(t * 30);
    const [photo, share] = looks < 1 ? ['thumb_up', 2 / 3] : looks < 2 ? ['relaxed', 1 / 3] : [OPEN, 0];
    return { aim: hand(at + SHIFT * share, 0, photo), move: OPEN_HAND };
  };
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.6, { aim: hand(at, 0), move: OPEN_HAND });
  const aimed = rig.yaw;
  const through = rig.run(1, closing);
  assert.equal(rig.out.fire, true);
  const worst = Math.max(...through.map((out) => Math.abs(degrees(out.yaw - aimed))));
  assert.ok(UNSTEADIED > 4, `${UNSTEADIED.toFixed(2)}`);
  assert.ok(worst < 0.5, `the view moved ${worst.toFixed(2)} of a possible ${UNSTEADIED.toFixed(2)} degrees`);
  assert.ok(Math.abs(degrees(rig.yaw - aimed)) < 0.3, `and ended ${degrees(rig.yaw - aimed).toFixed(2)} away`);
  // Letting go is the same the other way, and leaves the aim where it was.
  const back = rig.run(1, opening);
  assert.equal(rig.out.fire, false);
  assert.ok(Math.max(...back.map((out) => Math.abs(degrees(out.yaw - aimed)))) < 0.5, `${Math.max(...back.map((out) => Math.abs(degrees(out.yaw - aimed)))).toFixed(2)}`);
  // Again and again, it never adds up to anything.
  for (let i = 0; i < 8; i += 1) {
    rig.run(0.5, closing);
    rig.run(0.5, opening);
  }
  assert.ok(Math.abs(degrees(rig.yaw - aimed)) < 0.3, `after eight more: ${degrees(rig.yaw - aimed).toFixed(2)}`);
  // Nor does closing and opening straight away, as for a single shot, however quickly one follows the other.
  for (const gap of [0.2, 0.26, 0.3, 0.34, 0.4]) {
    const quick = player();
    quick.run(1, BOTH);
    quick.run(0.6, { aim: hand(at, 0), move: OPEN_HAND });
    const from = quick.yaw;
    const outs = [...quick.run(gap, closing), ...quick.run(gap, opening), ...quick.run(gap, closing), ...quick.run(0.6, opening)];
    const most = Math.max(...outs.map((out) => Math.abs(degrees(out.yaw - from))));
    assert.ok(most < 0.5, `${gap} seconds apart: the view moved ${most.toFixed(2)} degrees`);
  }
  // However long the fingers take over it: a hand a little more of the way to a fist at each look, shifting as it goes.
  for (const looks of [2, 3, 5, 9]) {
    const slow = player();
    slow.run(1, BOTH);
    slow.run(0.6, { aim: hand(at, 0), move: OPEN_HAND });
    const from = slow.yaw;
    const by = (t) => Math.min(1, (Math.floor(t * 30) + 1) / looks);
    const outs = slow.run(1, (t) => ({ aim: { x: at + SHIFT * by(t), y: 0, closed: by(t) }, move: OPEN_HAND }));
    const most = Math.max(...outs.map((out) => Math.abs(degrees(out.yaw - from))));
    assert.ok(most < 0.6, `closing over ${looks} looks: the view moved ${most.toFixed(2)} degrees`);
    assert.equal(slow.out.fire, true, `closing over ${looks} looks`);
  }
  // The tracker's first look at a hand that has just closed is a little out, and its next two put that right:
  // the aim stays where it was through all three.
  const settling = player();
  settling.run(1, BOTH);
  settling.run(0.6, { aim: hand(at, 0), move: OPEN_HAND });
  const settled = settling.yaw;
  const looked = settling.run(1, (t) => ({ aim: hand(at - ([0.03, 0.012][Math.floor(t * 30)] ?? 0.006), 0, FIST), move: OPEN_HAND }));
  const out = Math.max(...looked.map((each) => Math.abs(degrees(each.yaw - settled))));
  assert.ok(out < 0.25, `the tracker settling moved the view ${out.toFixed(2)} degrees`);
  // That's only for a moment after the fingers stop. Half a second on, a hand that sets off slowly has the view
  // go with it from the start.
  const later = player();
  later.run(1, BOTH);
  later.run(0.5, { aim: hand(0, 0, FIST), move: OPEN_HAND });
  later.run(0.8, (t) => ({ aim: hand(Math.min(0.3, t * 0.5), 0, FIST), move: OPEN_HAND }));
  const far = (0.3 / PAD.reach) * degrees(SENSITIVITY.medium);
  assert.ok(Math.abs(degrees(later.yaw) - far) < 0.7, `setting off later: turned ${degrees(later.yaw).toFixed(2)} of ${far.toFixed(2)} degrees`);
  // That's the tracker making its mind up, and not a hand setting off: one that's off across as soon as it has
  // fired, at a walking target's pace, has the view go with it.
  const off = player();
  off.run(1, BOTH);
  off.run(0.6, (t) => ({ aim: hand(Math.min(0.3, Math.max(0, t - 1 / 30) * 1.5), 0, FIST), move: OPEN_HAND }));
  const gone = (0.3 / PAD.reach) * degrees(SENSITIVITY.medium);
  assert.ok(Math.abs(degrees(off.yaw) - gone) < 1.8, `setting off: turned ${degrees(off.yaw).toFixed(2)} of ${gone.toFixed(2)} degrees`);
  // Nor one that sets off slowly: it's never more than a thirtieth of a palm length that's left out that way.
  const slowly = player();
  slowly.run(1, BOTH);
  slowly.run(1, (t) => ({ aim: hand(Math.min(0.3, Math.max(0, t - 1 / 30) * 0.6), 0, FIST), move: OPEN_HAND }));
  assert.ok(Math.abs(degrees(slowly.yaw) - gone) < 1.8, `setting off slowly: turned ${degrees(slowly.yaw).toFixed(2)} of ${gone.toFixed(2)} degrees`);
  // And the aim still follows the hand while the trigger is held: a closed hand that moves turns the view.
  rig.run(0.5, closing);
  const firing = rig.yaw;
  rig.run(0.6, { aim: hand(at + SHIFT + PAD.reach * 0.3, 0, FIST), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(rig.yaw - firing) - degrees(SENSITIVITY.medium) * 0.3) < 1.5, `${degrees(rig.yaw - firing).toFixed(2)}`);
  assert.equal(rig.out.fire, true);
});

test('a hand may rest however it likes: once its fingers are back as they were nothing is left out, and the aim is where it was', () => {
  // A hand that rests with two fingers up closes, and opens again. The tracker has its fingers back at once, and
  // is two looks late in putting the middle of it back where it was.
  const at = PAD.reach * 0.3;
  const rig = player();
  rig.run(1, BOTH);
  rig.run(1.2, { aim: hand(at, 0, 'victory'), move: OPEN_HAND });
  const rested = rig.yaw;
  rig.run(0.6, (t) => ({ aim: Math.floor(t * 30) < 1 ? hand(at + SHIFT / 2, 0, 'thumb_up') : hand(at + SHIFT, 0, FIST), move: OPEN_HAND }));
  assert.ok(Math.abs(degrees(rig.yaw - rested)) < 0.5, `closing moved the view ${degrees(rig.yaw - rested).toFixed(2)} degrees`);
  rig.run(0.8, (t) => ({ aim: hand(at + SHIFT * (Math.floor(t * 30) < 1 ? 1 : Math.floor(t * 30) < 2 ? 0.5 : 0), 0, 'victory'), move: OPEN_HAND }));
  assert.ok(Math.abs(degrees(rig.yaw - rested)) < 0.6, `and after opening it's ${degrees(rig.yaw - rested).toFixed(2)} degrees from where it was`);
});

test('pulled while the hand is on its way, the aim goes on as the hand was going: following someone, arriving on them, or only just stopped', () => {
  /**
   * How far the view ends from where the same hand has it with its fingers still. path is where it is, in palm
   * lengths, and its fingers begin to close at fingersFrom seconds: over three looks, or over as many as looks
   * says. Either way it has fired a shot already, as anyone has.
   */
  const off = (path, fingersFrom, looks = 0) => {
    const closing = (t) => {
      if (!looks) return closingAt(path(t), t, fingersFrom);
      const by = Math.min(1, Math.max(0, Math.floor((t - fingersFrom) * 30) + 1) / looks);
      return { x: path(t) + SHIFT * by, y: 0, closed: by };
    };
    const ends = [true, false].map((fingers) => {
      const rig = player();
      rig.run(1, BOTH);
      rig.run(0.4, { aim: hand(SHIFT, 0, FIST), move: OPEN_HAND });
      rig.run(0.6, BOTH);
      const from = rig.yaw;
      rig.run(1.2, (t) => ({ aim: fingers ? closing(t) : hand(path(t), 0), move: OPEN_HAND }));
      if (fingers) assert.equal(rig.out.fire, true);
      return degrees(rig.yaw - from);
    });
    return ends[0] - ends[1];
  };
  // Following someone across, half a palm length a second, and carrying on: the aim carries on with it.
  const following = off((t) => Math.min(0.4, t * 0.5), 0.5);
  assert.ok(Math.abs(following) < 1.5, `following: ${following.toFixed(2)} degrees off`);
  // Twice as fast, with the fingers closing in two looks: that's more across in a look than a hand held still
  // could seem to go, and it's still its fingers, once how the hand itself was going is taken off.
  const quick = off((t) => Math.min(0.5, t), 0.3, 2);
  assert.ok(Math.abs(quick) < 2, `following quickly: ${quick.toFixed(2)} degrees off`);
  // Arriving on someone with a quick reach, the fingers beginning a twentieth of a second before the hand stops.
  const reach = (t) => {
    const s = Math.min(1, Math.max(0, t / 0.25));
    return 0.33 * (10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5);
  };
  const arriving = off(reach, 0.2);
  assert.ok(Math.abs(arriving) < 2.8 && Math.abs(arriving) < UNSTEADIED * 0.6, `arriving: ${arriving.toFixed(2)} degrees off, for a shift of ${UNSTEADIED.toFixed(2)}`);
  // Following someone and stopping as the trigger is pulled: how it was going fades from what it's taken to be doing.
  const stopping = off((t) => Math.min(0.5, t) * 1, 0.5);
  assert.ok(Math.abs(stopping) < 3.2, `stopping: ${stopping.toFixed(2)} degrees off`);
  // Going fast and stopping dead as the trigger is pulled: it isn't taken to be going on that fast.
  const dead = off((t) => Math.min(0.25, t) * 2.2, 0.25);
  assert.ok(Math.abs(dead) < 4.2, `stopping dead: ${dead.toFixed(2)} degrees off`);
  // A hand that has only just stopped, two looks ago, isn't taken to be going on at all: the filter is slow to
  // hear that a hand has stopped, and what the hand really did in the last look is what counts.
  const stopped = off((t) => Math.min(0.2, t) * 2.4, 0.2 + 2 / 30);
  assert.ok(Math.abs(stopped) < 1, `just stopped: ${stopped.toFixed(2)} degrees off`);
  // Nor is a hand ever taken to have gone on past where it stopped: one that's across a third of its ring in a
  // single look and stops there, with the tracker changing its mind about its fingers in each of the next
  // three, never has the view go past where it ends up.
  const rig = player();
  rig.run(1, BOTH);
  const after = rig.run(1.2, (t) => ({ aim: hand(PAD.reach / 3, 0, [OPEN, 'relaxed', 'thumb_up', 'relaxed'][Math.floor(t * 30)] ?? OPEN), move: OPEN_HAND }));
  const past = Math.max(...after.map((each) => degrees(each.yaw - rig.yaw)));
  assert.ok(past < 0.4, `the view went ${past.toFixed(2)} degrees past where the hand stopped`);
});

test('a hand sweeping fast, blurred so that how open it is is anyone\'s guess, still turns the view as far as it goes', () => {
  // A quick turn of most of the ring, there in a fifth of a second and stopping dead.
  const sweep = (t) => Math.min(1, t / 0.2) * PAD.reach * 0.85;
  const turned = (photoAt) => {
    const rig = player();
    rig.run(1, BOTH);
    rig.run(0.8, (t) => ({ aim: hand(sweep(t), 0, photoAt(t)), move: OPEN_HAND }));
    return degrees(rig.yaw);
  };
  const clean = turned(() => OPEN);
  // The same, with the tracker making it an open hand in one look and a half-open one in the next while it moves.
  const blurred = turned((t) => (t < 0.3 && Math.floor(t * 30) % 2 ? 'relaxed' : OPEN));
  assert.ok(Math.abs(clean - degrees(SENSITIVITY.medium) * 0.85) < 1.2, `${clean}`);
  assert.ok(Math.abs(blurred - clean) < 1, `${blurred.toFixed(2)} against ${clean.toFixed(2)} degrees`);
  // Nor is a quick turn straight after pulling the trigger: the hand closes, and at the very next look it's off.
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.5, (t) => ({ aim: hand(t < 1 / 30 ? 0 : Math.min(1, (t - 1 / 30) / 0.15) * PAD.reach * 0.6, 0, FIST), move: OPEN_HAND }));
  assert.equal(rig.out.fire, true);
  assert.ok(Math.abs(degrees(rig.yaw) - degrees(SENSITIVITY.medium) * 0.6) < 2, `${degrees(rig.yaw).toFixed(2)} of ${(degrees(SENSITIVITY.medium) * 0.6).toFixed(2)} degrees`);
  // Nor one made as the hand closes: all the way to a fist in one look, and a third of the ring across in the same one.
  const both = player();
  both.run(1, BOTH);
  both.run(0.5, { aim: hand(PAD.reach / 3, 0, FIST), move: OPEN_HAND });
  assert.ok(Math.abs(degrees(both.yaw) - degrees(SENSITIVITY.medium) / 3) < 1, `${degrees(both.yaw).toFixed(2)} of ${(degrees(SENSITIVITY.medium) / 3).toFixed(2)} degrees`);
  // A hand the camera loses for a moment and finds again somewhere else, closed: nobody knows how it got there,
  // so nothing is left out, and the view goes with it.
  const lost = player();
  lost.run(1, BOTH);
  lost.run(0.15, { aim: null, move: OPEN_HAND });
  lost.run(0.6, { aim: hand(0.3, 0, FIST), move: OPEN_HAND });
  const meant = (0.3 / PAD.reach) * degrees(SENSITIVITY.medium);
  assert.ok(Math.abs(degrees(lost.yaw) - meant) < 1.2, `${degrees(lost.yaw).toFixed(2)} of ${meant.toFixed(2)} degrees`);
});

test('a hand the tracker can\'t make its mind up about is never held back: the view goes with it', () => {
  // Half open in one look and open in the next, or two fingers and then five, on and on, a look or two at a time,
  // while the hand moves half way across its ring: slowly, and quickly.
  const meant = degrees(SENSITIVITY.medium) * 0.5;
  const guesses = {
    'half open every other look': (t) => (Math.floor(t * 30) % 2 ? 'relaxed' : OPEN),
    'half open two looks in four': (t) => (Math.floor(t * 15) % 2 ? 'relaxed' : OPEN),
    'two fingers every other look': (t) => (Math.floor(t * 30) % 2 ? 'victory' : OPEN),
    'two fingers two looks in three': (t) => (Math.floor(t * 30) % 3 ? 'victory' : OPEN),
  };
  for (const [name, guess] of Object.entries(guesses)) {
    for (const seconds of [2, 0.9, 0.4]) {
      const path = (t) => Math.min(1, t / seconds) * PAD.reach * 0.5;
      const sure = player();
      sure.run(1, BOTH);
      const steady = sure.run(seconds + 1, (t) => ({ aim: hand(path(t), 0), move: OPEN_HAND }));
      const rig = player();
      rig.run(1, BOTH);
      const outs = rig.run(seconds + 1, (t) => ({ aim: hand(path(t), 0, guess(t)), move: OPEN_HAND }));
      const apart = Math.max(...outs.map((out, index) => Math.abs(degrees(out.yaw - steady[index].yaw))));
      assert.ok(apart < 3, `${name}, across in ${seconds} s: ${apart.toFixed(2)} degrees from where a hand it was sure of would have it`);
      assert.ok(Math.abs(degrees(rig.yaw) - meant) < 1, `${name}, across in ${seconds} s: turned ${degrees(rig.yaw).toFixed(2)} of ${meant.toFixed(2)} degrees`);
      // And held still, guessing all the while, the view is still.
      const from = rig.yaw;
      rig.run(3, (t) => ({ aim: hand(PAD.reach * 0.5, 0, guess(t)), move: OPEN_HAND }));
      assert.ok(Math.abs(degrees(rig.yaw - from)) < 0.6, `${name}, held still: ${degrees(rig.yaw - from).toFixed(2)}`);
    }
  }
});

test('closing the other hand changes the magazine, once each time it closes, and it goes on walking meanwhile', () => {
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.6, { aim: OPEN_HAND, move: hand(0, -0.45) });
  const walking = rig.out.moveY;
  assert.ok(walking > 0.5);
  const closing = rig.run(1.5, { aim: OPEN_HAND, move: hand(0, -0.45, FIST) });
  assert.equal(closing.filter((out) => out.reload).length, 1, 'once, however long it\'s held');
  assert.ok(closing.findIndex((out) => out.reload) <= 6, 'and at once');
  assert.ok(closing.every((out) => !out.fire), 'that hand doesn\'t fire');
  assert.equal(rig.out.buttons.reload, true, 'its button is lit for as long as it\'s held');
  assert.ok(closing.every((out) => Math.abs(out.moveY - walking) < 0.25), `walking went from ${walking.toFixed(2)} to between ${Math.min(...closing.map((out) => out.moveY)).toFixed(2)} and ${Math.max(...closing.map((out) => out.moveY)).toFixed(2)}`);
  // Open and closed again is another.
  rig.run(0.4, { aim: OPEN_HAND, move: hand(0, -0.45) });
  const again = rig.run(0.5, { aim: OPEN_HAND, move: hand(0, -0.45, FIST) });
  assert.equal(again.filter((out) => out.reload).length, 1);
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
const making = (hand, was) => Object.entries(gesturesOf(hand, was)).filter(([, on]) => on).map(([name]) => name).sort();

test('a fist, pointing, two fingers and an open hand are each told for what they are, from real hands', () => {
  assert.deepEqual(making(looked(FIST)), ['close', 'fist']);
  assert.deepEqual(making(looked('pointing_up')), ['point']);
  assert.deepEqual(making(looked('victory')), ['two']);
  for (const photo of [OPEN, 'right_hands', 'woman_hands', 'palm']) assert.deepEqual(making(looked(photo)), [], photo);
  // A thumb held up over a closed hand is still a closed hand.
  assert.deepEqual(making(looked('thumb_up')), ['close', 'fist']);
  assert.ok(Object.keys(photos).includes('victory'));
});

test('a pinch of the thumb against each finger is told from the others, and from a hand on its way to a fist', () => {
  for (const finger of Object.keys(FINGER_TIPS)) {
    const made = making(looked(OPEN, finger));
    assert.deepEqual(made, finger === 'index' ? ['close', 'pinch-index'] : [`pinch-${finger}`], finger);
  }
  // The thumb near the first finger with the rest of the hand curling up is a hand closing, not a pinch.
  const open = looked(OPEN, 'index');
  const closing = { ...open, openness: 0.33, fingers: { thumb: 0.2, index: 0.4, middle: 0.3, ring: 0.3, pinky: 0.3 } };
  assert.deepEqual(making(closing), []);
  // And closed, it's a fist, whatever the thumb is against.
  assert.deepEqual(making({ ...closing, openness: 0.05, fingers: { thumb: 0, index: 0.05, middle: 0, ring: 0, pinky: 0.1 } }), ['close', 'fist']);
  // Between two fingers, it's the nearer one's.
  const between = { ...looked(OPEN), pinches: { index: 0.22, middle: 0.18, ring: 0.9, pinky: 1.2 } };
  assert.deepEqual(making(between), ['pinch-middle']);
});

test('each takes a little more to stop than it took to start, so none of them flickers', () => {
  const hand = looked(OPEN);
  const with_ = (change) => ({ ...hand, ...change, fingers: { ...hand.fingers, ...change.fingers }, pinches: { ...hand.pinches, ...change.pinches } });
  // A pinch: made below one distance, and kept until the tips are well apart.
  const nearly = with_({ pinches: { index: (TRIGGER.pinchedBelow + TRIGGER.apartAbove) / 2 } });
  assert.deepEqual(making(nearly), []);
  assert.deepEqual(making(nearly, { 'pinch-index': true }), ['close', 'pinch-index']);
  assert.deepEqual(making(with_({ pinches: { index: TRIGGER.apartAbove + 0.05 } }), { 'pinch-index': true }), []);
  // A fist: made closed, and kept until it's well open, or a finger is well out.
  const half = with_({ openness: 0.33, fingers: { index: 0.3, middle: 0.3, ring: 0.3, pinky: 0.3 }, pinches: { index: 1, middle: 1, ring: 1, pinky: 1 } });
  assert.deepEqual(making(half), []);
  assert.deepEqual(making(half, { fist: true }), ['close', 'fist']);
  // With one finger well out it's no longer a fist: it's pointing.
  assert.deepEqual(making(with_({ openness: 0.33, fingers: { index: 0.7, middle: 0.3, ring: 0.3, pinky: 0.3 }, pinches: { index: 1, middle: 1, ring: 1, pinky: 1 } }), { fist: true }), ['point']);
  assert.deepEqual(making(with_({ openness: 0.5, fingers: { index: 0.45, middle: 0.45, ring: 0.45, pinky: 0.45 }, pinches: { index: 1, middle: 1, ring: 1, pinky: 1 } }), { fist: true }), [], 'and well open, it\'s nothing');
  // The first finger curled like a trigger, with the others left straight.
  const curled = with_({ fingers: { index: 0.1 }, pinches: { index: 1 } });
  assert.deepEqual(making(curled), ['trigger']);
  const easing = with_({ fingers: { index: 0.4 }, pinches: { index: 1 } });
  assert.deepEqual(making(easing), []);
  assert.deepEqual(making(easing, { trigger: true }), ['trigger']);
  assert.deepEqual(making(with_({ fingers: { index: 0.1, middle: 0.2, ring: 0.2 }, pinches: { index: 1 } })), [], 'with the others curled too it\'s not that');
});

test('what fires, reloads and sprints is whatever each is given to: any of them, on either hand', () => {
  assert.deepEqual(ACTIONS, ['fire', 'reload', 'sprint']);
  assert.deepEqual(BINDINGS, { fire: 'aim:close', reload: 'move:fist', sprint: 'stick' });
  assert.deepEqual(readBinding('move:pinch-ring'), { hand: 'move', gesture: 'pinch-ring' });
  assert.deepEqual([readBinding('stick'), readBinding('off'), readBinding('foot:fist'), readBinding('aim:wave'), readBinding(null)], ['stick', 'off', null, null, null]);
  for (const gesture of Object.values(GESTURES)) assert.ok(gesture.name && gesture.words && gesture.mark);

  // Two fingers out on the stick's hand changes the magazine, and a fist there no longer does.
  const two = player({ bindings: { reload: 'move:two' } });
  two.run(1, BOTH);
  assert.equal(two.run(0.6, { aim: OPEN_HAND, move: hand(0, 0, 'victory') }).filter((out) => out.reload).length, 1);
  assert.equal(two.out.buttons.reload, true);
  two.run(0.5, BOTH);
  assert.equal(two.run(0.6, { aim: OPEN_HAND, move: hand(0, 0, FIST) }).filter((out) => out.reload).length, 0);
  // And firing is still the other hand closing.
  two.run(0.4, { aim: hand(0, 0, FIST), move: OPEN_HAND });
  assert.equal(two.out.fire, true);

  // The trigger given to the stick's hand: its fist fires, held, and the other hand's does nothing.
  const swapped = player({ bindings: { fire: 'move:fist', reload: 'aim:fist' } });
  swapped.run(1, BOTH);
  const firing = swapped.run(1, { aim: OPEN_HAND, move: hand(0, 0, FIST) });
  assert.ok(firing.slice(8).every((out) => out.fire && !out.reload));
  swapped.run(0.5, BOTH);
  const other = swapped.run(1, { aim: hand(0, 0, FIST), move: OPEN_HAND });
  assert.ok(other.every((out) => !out.fire));
  assert.equal(other.filter((out) => out.reload).length, 1);

  // A pinch of the thumb and middle finger for the trigger: a pinch with the first finger isn't it, and nor is a fist.
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
  middle.run(0.4, { aim: hand(0, 0, FIST), move: OPEN_HAND });
  assert.equal(middle.out.fire, false);

  // A sprint given to a pinch: only while it's held, with the stick pushed forwards, and the stick right out is no longer one.
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
  const out = none.run(0.8, { aim: OPEN_HAND, move: hand(0, -STICK.reach * 1.1, FIST) });
  assert.ok(out.every((each) => !each.sprint && !each.reload));

  // Firing can't be switched off, sprinting is the only one the stick can do, and anything that isn't a
  // gesture is what it was out of the box.
  const odd = new Controls({ bindings: { fire: 'off', reload: 'stick', sprint: 'aim:wave' } });
  assert.deepEqual(odd.bindings, { fire: { hand: 'aim', gesture: 'close' }, reload: { hand: 'move', gesture: 'fist' }, sprint: 'stick' });
  // Changed in the middle of a match, it's what it's changed to.
  two.controls.setBindings({ reload: 'move:fist' });
  two.run(0.5, BOTH);
  assert.equal(two.run(0.6, { aim: OPEN_HAND, move: hand(0, 0, FIST) }).filter((each) => each.reload).length, 1);
});

/* ---------- when a hand can't be trusted ---------- */

test('a hand the camera loses stops firing at once, and one that\'s gone for longer lets go of everything', () => {
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.5, { aim: hand(PAD.reach * 1.6, 0), move: hand(0, -0.5) });
  rig.run(0.5, { aim: hand(PAD.reach * 1.6, 0, FIST), move: hand(0, -0.5) });
  assert.deepEqual([rig.out.fire, rig.out.moveY > 0.5, rig.out.pad.edge > 0.5], [true, true, true]);
  const gone = rig.run(1, { aim: null, move: null });
  const stopped = gone.find((out) => !out.fire);
  assert.ok(stopped.at - gone[0].at < 220, `fired on for ${Math.round(stopped.at - gone[0].at)} ms`);
  const still = gone.find((out) => out.moveY === 0 && out.turn === 0);
  assert.ok(still.at - gone[0].at < 450, `walked on for ${Math.round(still.at - gone[0].at)} ms`);
  assert.deepEqual([rig.out.hands, rig.out.stick.on, rig.out.pad.on, rig.out.turn, rig.out.fire], [0, false, false, 0, false]);
  // A single look the tracker drops, as it does now and then, changes nothing.
  const steady = player();
  steady.run(1, BOTH);
  steady.run(0.5, { aim: hand(0.2, 0, FIST), move: hand(0, -0.5) });
  const dropped = steady.run(CAMERA_MS / 1000 + 0.001, { aim: null, move: null });
  assert.ok(dropped.every((out) => out.fire && out.moveY > 0.5));
  steady.run(0.3, { aim: hand(0.2, 0, FIST), move: hand(0, -0.5) });
  assert.deepEqual([steady.out.fire, steady.out.moveY > 0.5, steady.out.stick.on], [true, true, true]);
});

test('a hand cut off by the edge of the picture, or touching the other one, never fires', () => {
  // Off the side of the picture: the tracker still sees most of it, and says it's closed.
  const rig = player();
  rig.run(1, BOTH);
  rig.run(0.5, { aim: hand(0, 0, FIST), move: OPEN_HAND });
  assert.equal(rig.out.fire, true);
  const edge = rig.run(1, { aim: hand(2.25, 0, FIST), move: OPEN_HAND });
  assert.equal(rig.monitor.snapshot.right.reason, 'edge');
  assert.ok(edge.slice(4).every((out) => !out.fire));
  // The two hands together: neither can be told from the other, so neither does anything.
  const both = player();
  both.run(1, BOTH);
  const together = both.run(1.2, { aim: hand(-1.5, 0, FIST), move: hand(1.5, 0, FIST) });
  assert.equal(both.monitor.snapshot.overlap, true);
  assert.ok(together.slice(4).every((out) => !out.fire && !out.reload));
  assert.deepEqual([both.out.moveX, both.out.moveY, both.out.turn], [0, 0, 0]);
});

test('which hand does which follows the hand in play, and nothing that isn\'t a hand does anything', () => {
  const rig = player({ side: 'left' });
  rig.run(1, BOTH);
  // The left hand is the one in play here: it looks round and fires, and the right one walks.
  rig.run(0.6, { aim: hand(PAD.reach * 0.5, 0), move: hand(0, -0.5) });
  rig.run(0.4, { aim: hand(PAD.reach * 0.5, 0, FIST), move: hand(0, -0.5) });
  assert.ok(degrees(rig.yaw) > 5 && rig.out.fire && rig.out.moveY > 0.5, `${degrees(rig.yaw)}, ${rig.out.fire}, ${rig.out.moveY}`);
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
  assert.ok(STICK.dead > 0.1 && STICK.dead < 0.3 && PAD.wander >= 1);
});
