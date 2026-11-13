// Reading the mouth, and where the face is: core/face/mouth.js, against made-up faces, frame by frame, as the
// tracker would send them. There are no photos of faces to test with, so the faces are made of numbers
// (test/fixtures/made-up-face.js), with the mouth as far open as each test says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACE_OVAL, FACE_POINTS, LIPS_INNER, LIPS_OUTER, lineFor, measureFace, MOUTH_RULES, MOUTH_SAY, MouthCheck, MouthMonitor, mouthPrompt, MouthStats } from '../../core/face/mouth.js';
import { madeUpFace, madeUpFaces } from '../fixtures/made-up-face.js';

const FRAME_MS = 33;
const near = (actual, expected, within, message) => assert.ok(Math.abs(actual - expected) <= within, `${message ?? 'value'}: ${actual} is not within ${within} of ${expected}`);

/**
 * Feeds a monitor one frame after another. Each frame is a face, as madeUpFace takes it, a list of faces, or null
 * for a picture with nobody in it. Returns the snapshot after each.
 */
function feed(monitor, frames, clock = { now: 1000 }) {
  return frames.map((frame) => {
    clock.now += FRAME_MS;
    const faces = frame === null ? [] : madeUpFaces(...(Array.isArray(frame) ? frame : [frame]));
    return { ...monitor.update(faces, clock.now), at: clock.now };
  });
}

const times = (count, frame) => Array.from({ length: count }, (_, index) => (typeof frame === 'function' ? frame(index) : frame));
const last = (snapshots) => snapshots.at(-1);

test('how open a mouth is reads the same near or far, anywhere in the picture, and with the head turned, tipped or tilted', () => {
  for (const open of [0, 0.07, 0.2, 0.4]) {
    for (const face of [
      {},
      { size: 0.1 },
      { size: 0.34 },
      { x: 0.2, y: 0.3 },
      { x: 0.8, y: 0.6 },
      { yaw: 30 },
      { yaw: -30 },
      { pitch: 25 },
      { pitch: -25 },
      { roll: 35 },
      { yaw: 20, pitch: -20, roll: -15 },
      { aspect: 4 / 3 },
    ]) {
      const read = measureFace(madeUpFace({ open, ...face }), face.aspect);
      near(read.openness, open, 0.004, `open ${open} with ${JSON.stringify(face)}`);
    }
  }
});

test('a face is measured for its size, where it is and which way it\'s turned', () => {
  const read = measureFace(madeUpFace({ x: 0.3, y: 0.55, size: 0.22, yaw: 25, pitch: -15, roll: 10 }));
  near(read.size, 0.22, 0.002, 'size');
  near(read.x, 0.3, 0.001, 'x');
  near(read.y, 0.55, 0.001, 'y');
  // Turned, tipped and tilted all at once, each is read roughly. One at a time, each is read closely.
  near(Math.abs(read.yaw), 25, 6, 'yaw');
  near(read.pitch, -15, 6, 'pitch');
  near(Math.abs(read.roll), 10, 6, 'roll');
  for (const degrees of [-40, -20, 20, 40]) {
    near(Math.abs(measureFace(madeUpFace({ yaw: degrees })).yaw), Math.abs(degrees), 0.5, `yaw ${degrees}`);
    near(measureFace(madeUpFace({ pitch: degrees })).pitch, degrees, 0.5, `pitch ${degrees}`);
    near(Math.abs(measureFace(madeUpFace({ roll: degrees })).roll), Math.abs(degrees), 0.5, `roll ${degrees}`);
  }
  // Straight on, it's none of them.
  const straight = measureFace(madeUpFace());
  near(straight.yaw, 0, 0.5, 'yaw');
  near(straight.pitch, 0, 0.5, 'pitch');
  assert.equal(straight.turned, false);
  assert.equal(straight.inFrame, true);
  assert.equal(straight.tooSmall, false);
});

test('anything that isn\'t a whole face is no face', () => {
  assert.equal(measureFace(null), null);
  assert.equal(measureFace(new Float32Array(21 * 3)), null);
  assert.equal(measureFace(new Float32Array(FACE_POINTS * 3)), null, 'every point in one place');
  assert.equal(new MouthMonitor().update([{ points: new Float32Array(12) }], 1000).status, 'missing');
});

test('the lips\' outlines and the edge of the face are the tracker\'s own points, each once', () => {
  for (const [name, list, count] of [['outer lips', LIPS_OUTER, 20], ['inner lips', LIPS_INNER, 20], ['face', FACE_OVAL, 36]]) {
    assert.equal(list.length, count, name);
    assert.equal(new Set(list).size, count, `${name} has no point twice`);
    assert.ok(list.every((index) => Number.isInteger(index) && index >= 0 && index < FACE_POINTS), name);
  }
});

test('a mouth opens once it reaches its line, and stays open until it comes well back down: more to stop than to start', () => {
  const monitor = new MouthMonitor(0.6);
  monitor.applyCheck({ best: 0.4, rest: 0.01, centre: { x: 0.5, y: 0.4 } });
  const { line } = monitor;
  near(line, 0.01 + 0.6 * 0.39, 0.001, 'the line');
  const release = monitor.releaseLine;
  assert.ok(release < line - 0.05, 'a good way below the line');

  const clock = { now: 1000 };
  assert.equal(last(feed(monitor, times(20, { open: line - 0.02 }), clock)).status, 'closed', 'just under the line');
  assert.equal(last(feed(monitor, times(20, { open: line + 0.02 }), clock)).status, 'open');
  // Back under the line, but not by much: still open.
  assert.equal(last(feed(monitor, times(30, { open: line - 0.03 }), clock)).status, 'open');
  assert.equal(last(feed(monitor, times(30, { open: release + 0.01 }), clock)).status, 'open');
  // Well back down: shut.
  assert.equal(last(feed(monitor, times(30, { open: release - 0.02 }), clock)).status, 'closed');
  // And between the two it stays shut, as it was.
  assert.equal(last(feed(monitor, times(30, { open: line - 0.03 }), clock)).status, 'closed');
});

test('a mouth trembling on its line doesn\'t flicker open and shut', () => {
  const monitor = new MouthMonitor(0.6);
  monitor.applyCheck({ best: 0.4, rest: 0.01, centre: null });
  const { line } = monitor;
  // Three seconds of a mouth held right on the line, shaking either side of it from frame to frame.
  const shaky = feed(monitor, times(90, (index) => ({ open: line + (index % 2 ? 0.025 : -0.025) + 0.012 * Math.sin(index * 1.3) })));
  const changes = shaky.filter((snapshot, index) => index > 0 && snapshot.status !== shaky[index - 1].status).length;
  assert.ok(changes <= 1, `changed ${changes} times`);
});

test('one frame of a wide mouth doesn\'t open it, and one lost frame doesn\'t shut it', () => {
  const monitor = new MouthMonitor();
  const clock = { now: 1000 };
  feed(monitor, times(10, { open: 0.01 }), clock);
  // A glitch: wide open for a single frame.
  const glitch = feed(monitor, [{ open: 0.45 }, { open: 0.01 }, { open: 0.01 }, { open: 0.01 }], clock);
  assert.ok(glitch.every((snapshot) => snapshot.status === 'closed'));
  // Really open, and the tracker loses the face for a frame, and then two more.
  assert.equal(last(feed(monitor, times(12, { open: 0.4 }), clock)).status, 'open');
  assert.equal(last(feed(monitor, [null], clock)).status, 'open');
  assert.equal(last(feed(monitor, [{ open: 0.4 }], clock)).status, 'open');
  assert.equal(last(feed(monitor, [null, null, null], clock)).status, 'open', 'a tenth of a second');
});

test('lips a little apart, as for breathing or talking, never count, however low the line is set', () => {
  for (const strictness of [0, 0.3, 0.6, 1]) {
    for (const best of [0.05, 0.15, 0.4]) {
      const monitor = new MouthMonitor(strictness);
      monitor.applyCheck({ best, rest: 0, centre: null });
      assert.ok(monitor.line >= MOUTH_RULES.floor, `line ${monitor.line} with strictness ${strictness} and best ${best}`);
      // 0.07 is what the real tracker measured on lips a little apart.
      const clock = { now: 1000 };
      assert.equal(last(feed(monitor, times(40, { open: 0.07 }), clock)).mouthOpen, false);
      assert.equal(last(feed(monitor, times(40, { open: MOUTH_RULES.floor - 0.015 }), clock)).mouthOpen, false);
    }
  }
  // Before any check has been done, too.
  assert.equal(last(feed(new MouthMonitor(0), times(40, { open: 0.07 }))).mouthOpen, false);
});

test('a face that\'s gone, turned away, too far off or with its mouth out of the picture never counts as open, however wide', () => {
  const wide = { open: 0.45 };
  const cases = [
    ['missing', null],
    ['turned', { ...wide, yaw: 55 }],
    ['turned', { ...wide, yaw: -55 }],
    ['turned', { ...wide, pitch: 55 }],
    ['turned', { ...wide, pitch: -55 }],
    ['small', { ...wide, size: 0.05 }],
    // The mouth below the bottom of the picture, and off each side.
    ['edge', { ...wide, y: 0.84 }],
    ['edge', { ...wide, x: 0.02 }],
    ['edge', { ...wide, x: 0.98 }],
  ];
  for (const [reason, frame] of cases) {
    const monitor = new MouthMonitor();
    const clock = { now: 1000 };
    // Open and counting, to begin with.
    assert.equal(last(feed(monitor, times(15, wide), clock)).mouthOpen, true);
    const after = feed(monitor, times(15, frame), clock);
    assert.equal(last(after).mouthOpen, false, reason);
    assert.equal(last(after).reason, reason);
    assert.equal(last(after).status, reason === 'missing' ? 'missing' : 'closed');
    // A problem with the view shuts it at once, on the very first frame. Only a face that's gone has a moment's grace.
    if (reason !== 'missing') assert.equal(after[0].mouthOpen, false, `${reason} at once`);
    // And it doesn't open again while the problem lasts.
    assert.ok(feed(monitor, times(30, frame), clock).every((snapshot) => !snapshot.mouthOpen), reason);
    // Back in view and straight on, it counts again.
    assert.equal(last(feed(monitor, times(15, wide), clock)).mouthOpen, true, `back after ${reason}`);
  }
});

test('a head turned or tipped a fair way still counts: looking about is fine', () => {
  for (const face of [{ yaw: 30 }, { yaw: -35 }, { pitch: 30 }, { pitch: -30 }, { roll: 40 }, { yaw: 25, pitch: 20 }]) {
    const monitor = new MouthMonitor();
    assert.equal(last(feed(monitor, times(15, { open: 0.4, ...face }))).mouthOpen, true, JSON.stringify(face));
  }
});

test('a tracker that has stopped answering looks like nobody there, never a mouth stuck open', () => {
  const monitor = new MouthMonitor();
  const clock = { now: 1000 };
  assert.equal(last(feed(monitor, times(15, { open: 0.4 }), clock)).mouthOpen, true);
  // What the game does when no result has come for a second: see core/face/session.js.
  clock.now += 1000;
  const stalled = monitor.update([], clock.now);
  assert.equal(stalled.status, 'missing');
  assert.equal(stalled.mouthOpen, false);
  assert.equal(stalled.amount, 0);
  assert.equal(stalled.points, null);
});

test('once the camera is off, a mouth seen before doesn\'t still count', () => {
  const monitor = new MouthMonitor();
  assert.equal(last(feed(monitor, times(15, { open: 0.4 }))).mouthOpen, true);
  monitor.forget();
  assert.equal(monitor.snapshot.status, 'missing');
  assert.equal(monitor.snapshot.mouthOpen, false);
});

test('the check finds the mouth\'s widest, where it rests and where the face is, once it has been open for a moment', () => {
  const monitor = new MouthMonitor(0.6);
  const check = new MouthCheck();
  const clock = { now: 1000 };
  const during = (frames) => feed(monitor, frames, clock).map((snapshot) => check.add(snapshot, FRAME_MS / 1000));
  // Listening to what's asked, with the mouth shut: nothing yet.
  during(times(45, { x: 0.42, y: 0.37, open: 0.012 }));
  assert.equal(check.done, false);
  assert.equal(check.progress, 0);
  // Opening, and holding it wide, with a tremble.
  during(times(8, (index) => ({ x: 0.42, y: 0.37, open: 0.012 + (0.3 * (index + 1)) / 8 })));
  during(times(20, (index) => ({ x: 0.42, y: 0.37, open: 0.31 + 0.01 * Math.sin(index) })));
  assert.equal(check.done, false, 'not until it has been open for a second');
  assert.ok(check.progress > 0.5 && check.progress < 1);
  during(times(12, (index) => ({ x: 0.42, y: 0.37, open: 0.31 + 0.01 * Math.sin(index) })));
  assert.equal(check.done, true);

  const result = check.result();
  near(result.best, 0.31, 0.02, 'widest');
  near(result.rest, 0.012, 0.005, 'at rest');
  near(result.centre.x, 0.42, 0.005, 'where the face is, across');
  near(result.centre.y, 0.37, 0.005, 'and down');

  monitor.applyCheck(result);
  const { line, checked, best, lineAmount } = monitor.snapshot;
  assert.equal(checked, true);
  near(best, 0.31, 0.02);
  near(line, result.rest + 0.6 * (result.best - result.rest), 0.001, '60% of the way from rest to widest');
  near(lineAmount, 0.6, 0.01);
  // 0.2 is over that line, though it wouldn't be over the line there is before a check.
  assert.equal(last(feed(monitor, times(15, { x: 0.42, y: 0.37, open: 0.2 }), clock)).mouthOpen, true);
  assert.ok(lineFor(0.6, MOUTH_RULES.defaultBest, 0) > 0.2);
});

test('the check only counts time with the face properly in view, and gives up waiting after a while', () => {
  const monitor = new MouthMonitor();
  const check = new MouthCheck();
  const clock = { now: 1000 };
  const during = (frames) => feed(monitor, frames, clock).map((snapshot) => check.add(snapshot, FRAME_MS / 1000));
  // Nobody there, then turned away, then too far, then half out of the picture: none of it counts, however open.
  for (const frame of [null, { open: 0.4, yaw: 60 }, { open: 0.4, size: 0.04 }, { open: 0.4, y: 0.9 }]) {
    assert.ok(during(times(40, frame)).every((counted) => counted === false));
  }
  assert.equal(check.seenFor, 0);
  assert.equal(check.progress, 0);
  // In view, with the mouth shut all the time: after 7 seconds it's done anyway, having found nothing to go on.
  during(times(150, { open: 0.01 }));
  assert.equal(check.done, false);
  during(times(70, { open: 0.01 }));
  assert.equal(check.done, true);
  assert.ok(check.result().best < MOUTH_RULES.floor, 'which the game asks for again');
});

test('a mouth that opens only a little can still play, as its line is its own', () => {
  const monitor = new MouthMonitor(0.6);
  monitor.applyCheck({ best: 0.2, rest: 0.02, centre: null });
  near(monitor.line, 0.128, 0.001);
  assert.equal(last(feed(monitor, times(15, { open: 0.15 }))).mouthOpen, true);
  assert.equal(last(feed(new MouthMonitor(0.6), times(15, { open: 0.15 }))).mouthOpen, false, 'which, before the check, it wasn\'t');
  // The whole of it is asked for only when a grown-up says so.
  monitor.setStrictness(1);
  near(monitor.line, 0.2, 0.001);
  // And at the least, it's still above the floor, and a clear step up from where it rests.
  monitor.setStrictness(0);
  near(monitor.line, MOUTH_RULES.floor, 0.001);
  const restsOpen = new MouthMonitor(0);
  restsOpen.applyCheck({ best: 0.4, rest: 0.1, centre: null });
  near(restsOpen.line, 0.1 + MOUTH_RULES.leastAboveRest, 0.001, 'a mouth that rests a little open');
});

test('a mouth held open all through the check still has a line below what it did', () => {
  const monitor = new MouthMonitor(0.6);
  const check = new MouthCheck();
  for (const snapshot of feed(monitor, times(60, { open: 0.36 }))) check.add(snapshot, FRAME_MS / 1000);
  const result = check.result();
  near(result.rest, 0.36, 0.01, 'it never saw the mouth shut');
  monitor.applyCheck(result);
  assert.ok(monitor.line < result.best - 0.05, `line ${monitor.line}, widest ${result.best}`);
  near(monitor.snapshot.rest, result.best * MOUTH_RULES.mostRestShare, 0.001);
});

test('the line goes up with how much of the widest is asked for', () => {
  let before = 0;
  for (const strictness of [0.3, 0.45, 0.6, 0.8, 1]) {
    const line = lineFor(strictness, 0.4, 0.01);
    assert.ok(line > before, `strictness ${strictness}`);
    before = line;
  }
  near(lineFor(1, 0.4, 0.01), 0.4, 0.0001);
});

test('how open a mouth is goes from 0 at rest to 1 at its widest, for a meter or a creature\'s mouth', () => {
  const monitor = new MouthMonitor(0.6);
  monitor.applyCheck({ best: 0.4, rest: 0.02, centre: null });
  const clock = { now: 1000 };
  near(last(feed(monitor, times(20, { open: 0.02 }), clock)).amount, 0, 0.01);
  near(last(feed(monitor, times(20, { open: 0.21 }), clock)).amount, 0.5, 0.01);
  near(last(feed(monitor, times(20, { open: 0.4 }), clock)).amount, 1, 0.01);
  assert.ok(last(feed(monitor, times(20, { open: 0.6 }), clock)).amount <= 1.25, 'and not much past it');
  assert.equal(last(feed(monitor, times(20, null), clock)).amount, 0, 'nothing when the face is gone');
});

test('where the face is, is how it looks in a mirror, measured from where it was in the check', () => {
  const monitor = new MouthMonitor();
  const clock = { now: 1000 };
  feed(monitor, times(20, { x: 0.5, y: 0.4 }), clock);
  monitor.applyCheck({ best: 0.4, rest: 0, centre: { x: 0.5, y: 0.4 } });
  // The camera's picture isn't mirrored: a child moving to their left goes to the right of it.
  const moved = last(feed(monitor, times(30, { x: 0.62, y: 0.33 }), clock));
  near(moved.x, 0.38, 0.005, 'left of the middle of the mirror');
  near(moved.y, 0.33, 0.005);
  near(moved.steer.x, -0.12, 0.005, 'steering left');
  near(moved.steer.y, -0.07, 0.005, 'and up');
  const back = last(feed(monitor, times(30, { x: 0.5, y: 0.4 }), clock));
  near(back.steer.x, 0, 0.005);
  near(back.steer.y, 0, 0.005);
  // Gone from the picture, there's nothing to steer by.
  assert.deepEqual(last(feed(monitor, times(20, null), clock)).steer, { x: 0, y: 0 });
});

test('where the face is, is steadied: a tracker\'s tremble moves it less than the tremble itself', () => {
  const monitor = new MouthMonitor();
  const jitter = 0.006;
  const shaky = feed(monitor, times(120, (index) => ({ x: 0.5 + (index % 2 ? jitter : -jitter), y: 0.4 + jitter * Math.sin(index * 2.1) })));
  const settled = shaky.slice(30).map((snapshot) => snapshot.x);
  const spread = Math.max(...settled) - Math.min(...settled);
  assert.ok(spread < jitter * 0.8, `it moved ${spread} for a tremble of ${jitter * 2}`);
  // And a real move gets there within about a third of a second.
  const monitorTwo = new MouthMonitor();
  const clock = { now: 1000 };
  feed(monitorTwo, times(20, { x: 0.5 }), clock);
  near(last(feed(monitorTwo, times(10, { x: 0.6 }), clock)).x, 0.4, 0.01);
});

test('of two faces it follows the one it has been following, which to begin with is the biggest', () => {
  const monitor = new MouthMonitor();
  const clock = { now: 1000 };
  const child = { x: 0.5, y: 0.45, size: 0.22, open: 0.01 };
  const behind = { x: 0.78, y: 0.3, size: 0.12, open: 0.45 };
  // A grown-up behind, with their mouth wide open, in either order: it's the child's face that's read.
  for (const frames of [[child, behind], [behind, child]]) {
    const seen = last(feed(monitor, times(15, frames), clock));
    assert.equal(seen.mouthOpen, false);
    near(seen.x, 0.5, 0.01);
  }
  // The child leans back, smaller than the grown-up now: still the child.
  const leaning = last(feed(monitor, times(20, [{ ...child, size: 0.1 }, behind]), clock));
  assert.equal(leaning.mouthOpen, false);
  near(leaning.x, 0.5, 0.01);
  // The child opens: that counts.
  assert.equal(last(feed(monitor, times(15, [{ ...child, open: 0.4 }, { ...behind, open: 0 }]), clock)).mouthOpen, true);
});

test('what to say for a face that isn\'t in view as it should be, and nothing once the mouth is open', () => {
  const read = (frame) => mouthPrompt(last(feed(new MouthMonitor(), times(15, frame))));
  assert.equal(read(null).text, MOUTH_SAY.showFace);
  assert.equal(read({ y: 0.9 }).text, MOUTH_SAY.showFace);
  assert.equal(read({ size: 0.04 }).text, MOUTH_SAY.comeCloser);
  assert.equal(read({ yaw: 60 }).text, MOUTH_SAY.lookHere);
  const shut = read({ open: 0.01 });
  assert.equal(shut.text, MOUTH_SAY.open);
  assert.ok(shut.key.startsWith('closed'), 'which games can leave unsaid: a mouth can rest');
  assert.equal(read({ open: 0.4 }), null);
});

test('the numbers for the end of a game: how often it opened, for how long, and how wide', () => {
  const monitor = new MouthMonitor();
  monitor.applyCheck({ best: 0.4, rest: 0, centre: null });
  const stats = new MouthStats();
  const clock = { now: 1000 };
  const play = (frames) => feed(monitor, frames, clock).forEach((snapshot) => stats.update(snapshot, FRAME_MS / 1000));
  play(times(30, { open: 0.01 }));
  play(times(30, { open: 0.36 }));
  play(times(30, { open: 0.01 }));
  play(times(60, { open: 0.3 }));
  play(times(30, null));
  assert.equal(stats.openings, 2);
  near(stats.seconds, 180 * FRAME_MS / 1000, 0.001);
  near(stats.openSeconds, 90 * FRAME_MS / 1000, 0.4);
  near(stats.longestHold, 60 * FRAME_MS / 1000, 0.3);
  near(stats.peak, 0.9, 0.02, 'nine tenths of its widest');
});
