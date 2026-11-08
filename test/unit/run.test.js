// The rules of a run, without a screen or a camera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Practice } from '../../games/leap-trail/practice.js';
import { LANE_STEP, LaneReader, bodyAcross } from '../../games/leap-trail/lanes.js';
import { LANES, OBSTACLES, PACES, Run, layCourse } from '../../games/leap-trail/run.js';

function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function setup(options = {}) {
  const events = [];
  const run = new Run({ random: seeded(), onEvent: (event) => events.push(event), ...options });
  run.begin();
  return { run, events };
}

const step = (run, seconds, each = () => {}) => {
  for (let t = 0; t < seconds; t += 1 / 60) {
    each(t);
    run.update(1 / 60);
    if (run.state === 'finished') return;
  }
};

/** Runs until the next obstacle is in reach, or the run ends. */
function untilInReach(run) {
  for (let i = 0; i < 60 * 60; i += 1) {
    if (run.state !== 'running' || (run.next && run.inReach(run.next))) return run.next;
    run.noteActivity();
    run.update(1 / 60);
  }
  throw new Error('never came into reach');
}

const moveFor = (run) => run.jump();

/** Keeps the fighter going, doing what's asked at the moment it first counts. */
function perfectRun(run) {
  while (run.state === 'running') {
    const obstacle = untilInReach(run);
    if (!obstacle) break;
    moveFor(run, obstacle);
    run.noteActivity();
    run.update(1 / 60);
    if (!run.next) step(run, 8, () => run.noteActivity());
  }
}

test('a trail has the number of obstacles asked for, well spaced and in order', () => {
  for (const pace of Object.keys(PACES)) {
    const { course, end } = layCourse({ obstacles: 30, pace, random: seeded() });
    assert.equal(course.length, 30);
    const { speed, every } = PACES[pace];
    for (let i = 1; i < course.length; i += 1) {
      const gap = course[i].at - (course[i - 1].at + course[i - 1].length);
      assert.ok(gap >= speed * every[0] - 1e-9, `${pace}: gap of ${gap}`);
    }
    assert.ok(course[0].at >= speed * 2.5, 'there\'s time to get going first');
    assert.ok(end > course.at(-1).at, 'the finish is after the last obstacle');
  }
});

test('every obstacle is a jump: nothing asks for a squat, and there\'s no way to do one', () => {
  for (const seed of [1, 3, 7, 11]) {
    const { course } = layCourse({ obstacles: 200, pace: 'slow', random: seeded(seed) });
    assert.ok(course.every(({ needs }) => needs === 'jump'));
  }
  assert.ok(Object.values(OBSTACLES).every(({ needs }) => needs === 'jump'));
  assert.equal(typeof new Run().squat, 'undefined');
  // All four kinds still turn up.
  const { course } = layCourse({ obstacles: 200, pace: 'slow', random: seeded(5) });
  assert.deepEqual(new Set(course.map(({ kind }) => kind)), new Set(Object.keys(OBSTACLES)));
});

test('lines of stars move between the three lanes, one lane at a time, starting in the middle', () => {
  const { starLines } = layCourse({ obstacles: 60, pace: 'slow', random: seeded(4) });
  assert.equal(starLines[0].lane, 0);
  const lanes = new Set(starLines.map(({ lane }) => lane));
  assert.deepEqual([...lanes].sort(), [...LANES].sort());
  for (let i = 1; i < starLines.length; i += 1) {
    assert.ok(Math.abs(starLines[i].lane - starLines[i - 1].lane) <= 1, `at ${i}`);
  }
  const moves = starLines.filter((line, i) => i > 0 && line.lane !== starLines[i - 1].lane).length;
  assert.ok(moves >= 25, `only ${moves} changes of lane`);

  const still = layCourse({ obstacles: 60, pace: 'slow', lanes: false, random: seeded(4) });
  assert.ok(still.starLines.every(({ lane }) => lane === 0), 'with lanes off, they all stay in the middle');
});

test('stars are picked up only in the runner\'s lane, and missing them costs nothing', () => {
  const { run, events } = setup({ obstacles: 6, random: seeded(4) });
  perfectRun(run);
  const all = run.starLines.length;
  const middle = run.starLines.filter(({ lane }) => lane === 0).length;
  assert.ok(middle < all, 'some lines are out to the sides');
  assert.equal(run.stats.linedStars, middle, 'staying in the middle picks up only the middle ones');
  assert.equal(run.stats.bumps, 0);
  assert.equal(events.filter(({ type }) => type === 'star-line').length, middle);

  // Following the stars across picks up every one.
  const { run: follower } = setup({ obstacles: 6, random: seeded(4) });
  while (follower.state === 'running') {
    const coming = follower.starLines[follower.nextStar];
    if (coming) follower.setLane(coming.lane);
    if (follower.next && follower.inReach(follower.next)) follower.jump();
    follower.noteActivity();
    follower.update(1 / 60);
  }
  assert.equal(follower.stats.linedStars, all);
  assert.ok(follower.stats.laneMoves > 0);
});

test('moving across is allowed at any time, even in the air, and is told once per move', () => {
  const { run, events } = setup({ obstacles: 2 });
  untilInReach(run);
  run.jump();
  run.update(1 / 60);
  run.setLane(1);
  run.setLane(1);
  assert.equal(run.lane, 1);
  run.setLane(-1);
  run.setLane(5); // Not a lane.
  assert.equal(run.lane, -1);
  assert.deepEqual(events.filter(({ type }) => type === 'lane').map(({ lane, from }) => [from, lane]), [[0, 1], [1, -1]]);
  assert.equal(run.stats.laneMoves, 2);
  assert.ok(run.move?.obstacle, 'the jump carries on');
});

/** A body for the lane reader, standing at x across the picture, with a torso of 0.3. */
const TORSO = 0.3;
const readLanes = (reader, positions, seconds = 0.5) => {
  let lane = reader.lane;
  for (const x of positions) for (let t = 0; t < seconds; t += 1 / 30) lane = reader.update(x, TORSO, 1 / 30);
  return lane;
};

test('stepping to the side moves into that lane, and stepping back comes back', () => {
  const lanes = new LaneReader();
  lanes.centreOn(1);
  assert.equal(readLanes(lanes, [1]), 0);
  // A step of about a torso's width to the child's right, which is the right of the mirror.
  assert.equal(readLanes(lanes, [1 + TORSO]), 1);
  assert.equal(readLanes(lanes, [1]), 0);
  assert.equal(readLanes(lanes, [1 - TORSO]), -1);
  // Straight across from one side to the other.
  assert.equal(readLanes(lanes, [1 + TORSO]), 1);
});

test('standing still, or swaying, never drifts between lanes', () => {
  const lanes = new LaneReader();
  lanes.centreOn(1);
  // Swaying by a bit less than what counts, back and forth, for a long time.
  const sway = Array.from({ length: 200 }, (_, i) => 1 + Math.sin(i) * TORSO * (LANE_STEP.enter - 0.05));
  assert.equal(readLanes(lanes, sway, 1 / 30), 0);
  // One frame far out, from a tracker hiccup, isn't a step.
  lanes.update(1 + TORSO * 2, TORSO, 1 / 30);
  assert.equal(readLanes(lanes, [1], 0.2), 0);
});

test('a side lane is only left once the body is well back towards the middle', () => {
  const lanes = new LaneReader();
  lanes.centreOn(1);
  assert.equal(readLanes(lanes, [1 + TORSO * 0.6]), 1);
  // Drifting back a little, but not as far as the dead zone, stays in the lane.
  assert.equal(readLanes(lanes, [1 + TORSO * (LANE_STEP.leave + 0.05)]), 1);
  assert.equal(readLanes(lanes, [1 + TORSO * (LANE_STEP.leave - 0.05)]), 0);
});

test('a body that can\'t be seen leaves the runner in its lane', () => {
  const lanes = new LaneReader();
  lanes.centreOn(1);
  assert.equal(readLanes(lanes, [1 + TORSO]), 1);
  assert.equal(readLanes(lanes, [null, NaN]), 1);
  assert.equal(lanes.update(1, 0, 1), 1, 'nor does a torso of no size');
});

test('a smaller move size, or leaning when sitting down, asks for less', () => {
  const small = new LaneReader({ size: 0.6 });
  small.centreOn(1);
  assert.equal(readLanes(small, [1 + TORSO * 0.3]), 1);
  const sitting = new LaneReader({ upperBodyOnly: true });
  sitting.centreOn(1);
  assert.equal(readLanes(sitting, [1 + TORSO * 0.33]), 1);
  const standing = new LaneReader();
  standing.centreOn(1);
  assert.equal(readLanes(standing, [1 + TORSO * 0.33]), 0);
});

test('where a body is across the picture is read in the mirror, from shoulders and hips', () => {
  const point = (x) => ({ x, y: 0.5, visibility: 0.9 });
  const image = Array.from({ length: 33 }, () => point(0.5));
  // In the tracker's picture, which isn't mirrored, the body is on the left.
  for (const index of [11, 12, 23, 24]) image[index] = point(0.3);
  const aspect = 16 / 9;
  assert.ok(Math.abs(bodyAcross({ image }, aspect) - 0.7 * aspect) < 1e-9, 'so on the right in the mirror');
  image[23] = { ...point(0.3), visibility: 0.1 };
  assert.equal(bodyAcross({ image }, aspect), null, 'hips that can\'t be seen');
  assert.ok(bodyAcross({ image }, aspect, true) !== null, 'but sitting down, the shoulders are enough');
  assert.equal(bodyAcross(null), null);
});

test('the right move clears an obstacle, wherever in the stretch it was made', () => {
  for (const share of [1, 0.6, 0.25]) {
    const { run, events } = setup({ obstacles: 1 });
    const obstacle = run.next;
    while (run.gapTo(obstacle) > run.reachDistance * share) {
      run.noteActivity();
      run.update(1 / 60);
    }
    assert.equal(run.jump(), true, `made at ${share} of the stretch`);
    step(run, 3, () => run.noteActivity());
    assert.equal(obstacle.state, 'cleared', `made at ${share}`);
    assert.equal(run.stats.bumps, 0);
    assert.ok(events.some(({ type }) => type === 'cleared'));
  }
});

test('the fighter stays above what it jumps over, however it took off', () => {
  const lowestOver = (run, obstacle) => {
    let lowest = Infinity;
    while (run.move) {
      run.noteActivity();
      run.update(1 / 60);
      const over = run.distance >= obstacle.at && run.distance <= obstacle.at + obstacle.length;
      if (over) lowest = Math.min(lowest, run.air.height);
    }
    return lowest;
  };
  for (const pace of Object.keys(PACES)) {
    // Every kind of obstacle, as early as a jump counts.
    for (let seed = 1; seed < 12; seed += 1) {
      const { run } = setup({ obstacles: 2, pace, random: seeded(seed * 97) });
      const obstacle = untilInReach(run);
      run.jump();
      const lowest = lowestOver(run, obstacle);
      assert.ok(lowest > obstacle.height, `${pace}: at ${lowest} over a ${obstacle.kind} ${obstacle.height} tall`);
      assert.equal(obstacle.state, 'cleared');
    }

    // From standing still, right in front of it.
    const waited = setup({ obstacles: 2, pace, whenMissed: 'wait' });
    const obstacle = waited.run.next;
    step(waited.run, 25, () => waited.run.noteActivity());
    assert.equal(waited.run.speed, 0);
    waited.run.jump();
    const lowest = lowestOver(waited.run, obstacle);
    assert.ok(lowest > obstacle.height, `${pace}: from standing, at ${lowest} over ${obstacle.height}`);
  }
});

test('a jump too early does nothing bad: it\'s just a jump, and still counts as exercise', () => {
  const { run } = setup({ obstacles: 1 });
  run.noteActivity();
  run.update(1 / 60);
  assert.equal(run.jump(), false);
  assert.equal(run.stats.jumps, 1);
  assert.equal(run.stats.bumps, 0);
  assert.equal(run.next.state, 'ahead');
});

test('when set to wait, the fighter stops short of an obstacle and waits as long as it takes', () => {
  const { run, events } = setup({ obstacles: 2, whenMissed: 'wait' });
  const obstacle = run.next;
  step(run, 30, () => run.noteActivity());
  assert.equal(run.speed, 0);
  assert.equal(obstacle.state, 'ahead');
  assert.ok(run.gapTo(obstacle) > 0, 'it hasn\'t run into it');
  assert.ok(run.gapTo(obstacle) < 2.5, 'and it\'s right up against it');
  assert.equal(run.stats.bumps, 0);
  assert.ok(events.some(({ type }) => type === 'waiting'));

  assert.equal(run.jump(), true, 'a jump from standing still clears it');
  assert.equal(run.waiting, false);
  step(run, 2.5, () => run.noteActivity());
  assert.equal(obstacle.state, 'cleared');
  assert.ok(run.speed > 0, 'and it runs on');
});

test('when set to stumble, missing costs a stumble and the streak, but the run goes on', () => {
  const { run, events } = setup({ obstacles: 3, whenMissed: 'stumble' });
  const first = untilInReach(run);
  run.jump();
  step(run, 3, () => run.noteActivity());
  assert.equal(run.stats.streak, 1);

  const second = run.next;
  const before = run.speed;
  while (second.state === 'ahead') {
    run.noteActivity();
    run.update(1 / 60);
  }
  assert.equal(first.state, 'cleared');
  assert.equal(second.state, 'bumped');
  assert.equal(run.stats.bumps, 1);
  assert.equal(run.stats.streak, 0);
  assert.ok(events.some(({ type }) => type === 'bump'));
  step(run, 0.6, () => run.noteActivity());
  assert.ok(run.speed < before * 0.7, 'slowed by the stumble');
  step(run, 2.5, () => run.noteActivity());
  assert.ok(run.speed > before * 0.9, 'and then back up to speed');
  assert.equal(run.stats.bestStreak, 1, 'the best streak stays');
});

test('a child who stops moving is waited for, whichever setting it\'s on', () => {
  const { run } = setup({ obstacles: 5, whenMissed: 'stumble' });
  step(run, 11);
  assert.ok(run.resting);
  const bumps = run.stats.bumps;
  const { distance } = run;
  step(run, 3);
  assert.equal(run.speed, 0);
  const stopped = run.distance;
  step(run, 60);
  assert.equal(run.distance, stopped, 'it stays where it stopped');
  assert.ok(stopped - distance < 8, 'after slowing down');
  assert.equal(run.stats.bumps, bumps, 'and nothing happens to a child who\'s resting');
  run.noteActivity();
  step(run, 1.5, () => run.noteActivity());
  assert.ok(run.speed > 0, 'and moving again gets going again');
});

test('a run ends at the finish, with the numbers, and a perfect run has no bumps', () => {
  const { run, events } = setup({ obstacles: 12 });
  perfectRun(run);
  assert.equal(run.state, 'finished');
  const { stats } = run;
  assert.equal(stats.cleared, 12);
  assert.equal(stats.bumps, 0);
  assert.equal(stats.stars, 36);
  assert.equal(stats.bestStreak, 12);
  assert.equal(stats.jumps, 12);
  assert.ok(stats.seconds > 0);
  assert.equal(events.filter(({ type }) => type === 'finished').length, 1);
});

test('a move asks for itself once, when it would first count', () => {
  const { run, events } = setup({ obstacles: 1 });
  step(run, 12, () => run.noteActivity());
  const asks = events.filter(({ type }) => type === 'ask');
  assert.equal(asks.length, 1);
  assert.equal(asks[0].needs, 'jump');
});

test('nothing happens before the start or after the finish', () => {
  const run = new Run({ obstacles: 1, random: seeded() });
  assert.equal(run.jump(), false);
  run.update(1);
  assert.equal(run.distance, 0);

  const { run: done, events } = setup({ obstacles: 1 });
  perfectRun(done);
  const count = events.length;
  assert.equal(done.jump(), false);
  for (let i = 0; i < 180; i += 1) done.update(1 / 60);
  assert.equal(events.length, count);
  assert.equal(done.speed, 0, 'and it slows to a stop');
});

test('a raised open hand counts as a jump and is noted as an open hand', () => {
  const { run } = setup({ obstacles: 1 });
  run.jump({ hand: 'open' });
  run.jump();
  assert.equal(run.stats.jumps, 2);
  assert.equal(run.stats.hands.open, 1);
});

test('a move made as soon as it\'s asked for sends the runner straight over, quickly', () => {
  for (const pace of Object.keys(PACES)) {
    const { run } = setup({ obstacles: 2, pace });
    const obstacle = untilInReach(run);
    const startedAt = run.time;
    run.jump();
    while (run.move) {
      run.noteActivity();
      run.update(1 / 60);
    }
    assert.ok(run.time - startedAt <= 1.45, `${pace}: took ${run.time - startedAt}`);
    assert.equal(obstacle.state, 'cleared');
    assert.ok(run.distance < run.next.at, 'and lands before the next one');
  }
});

test('a move can\'t be interrupted by another once it\'s going over something', () => {
  const { run } = setup({ obstacles: 2 });
  const obstacle = untilInReach(run);
  assert.equal(run.jump(), true);
  run.update(1 / 60);
  const { from } = run.move;
  assert.equal(run.jump(), false);
  assert.equal(run.move.from, from);
  assert.equal(run.stats.jumps, 1, 'a star jump read as two moves only counts once');
  step(run, 2.5, () => run.noteActivity());
  assert.equal(obstacle.state, 'cleared');
});

/** Just enough of a body reader for practising with. */
const fakeReader = () => ({
  jumpEffort: 0,
  sink: 0,
  footHeight: 0,
  handHeight: { left: -0.9, right: -0.9 },
  personal: { jump: null, squat: null, leg: null, hand: null },
  get jumpNeeded() {
    return this.personal.jump ?? 0.06;
  },
  get squatNeeded() {
    return this.personal.squat ?? 0.16;
  },
  get legNeeded() {
    return this.personal.leg ?? 0.16;
  },
  get handNeeded() {
    return this.personal.hand ?? 0.27;
  },
});

function practising(steps) {
  const reader = fakeReader();
  const events = [];
  const practice = new Practice({ steps, reader, onEvent: (event) => events.push(event) });
  const seconds = (count) => {
    for (let t = 0; t < count; t += 1 / 30) practice.update(1 / 30);
  };
  return { reader, events, practice, seconds };
}

test('practice asks for each move in turn, moves on when it\'s seen, and then finishes', () => {
  const { practice, events, seconds } = practising(['jump', 'side']);
  assert.equal(practice.step, 'jump');
  assert.deepEqual(events[0], { type: 'step', step: 'jump', index: 0, total: 2 });

  practice.onMoves([{ move: 'stomp' }]);
  assert.equal(practice.step, 'jump', 'going down doesn\'t count when a jump is asked for');
  assert.equal(events.some(({ type }) => type === 'success'), false);

  practice.onMoves([{ move: 'flying' }]);
  assert.ok(events.some(({ type, step }) => type === 'success' && step === 'jump'));
  seconds(2);
  assert.equal(practice.step, 'side');

  // Moving across is seen by the game, from the lanes, and no body move counts for it by itself.
  practice.onMoves([{ move: 'flying' }, { move: 'stomp' }]);
  seconds(0.5);
  assert.equal(practice.step, 'side');
  practice.succeed();
  seconds(2);
  assert.equal(practice.finished, true);
  assert.equal(events.at(-1).type, 'finished');
});

test('a star jump counts for the jump, and a kick or a knee for lifting a leg', () => {
  const star = practising(['jump']);
  star.practice.onMoves([{ move: 'starBurst' }]);
  assert.ok(star.events.some(({ type }) => type === 'success'));
  const knee = practising(['lift']);
  knee.practice.onMoves([{ move: 'knee' }]);
  assert.ok(knee.events.some(({ type }) => type === 'success'));
});

test('practice brings what counts down to meet a child who is trying', () => {
  const { practice, reader, events } = practising(['jump']);
  // Bobbing up again and again, but not as high as counts.
  for (let t = 0; t < 5.2; t += 1 / 30) {
    reader.jumpEffort = 0.05 * Math.abs(Math.sin(t * 2));
    practice.update(1 / 30);
  }
  assert.ok(reader.personal.jump > 0.035 && reader.personal.jump < 0.05, `now ${reader.personal.jump}`);
  assert.ok(reader.jumpNeeded < 0.06);
  assert.ok(events.some(({ type }) => type === 'eased'));
});

test('practice never lowers the bar for a child just standing there', () => {
  for (const [step, field] of [['jump', 'jump'], ['lift', 'leg'], ['raise', 'hand']]) {
    const { practice, reader, seconds } = practising([step]);
    // The most the tracker was seen to wobble, on real people standing still.
    Object.assign(reader, { jumpEffort: 0.024, sink: 0.056, footHeight: 0.062 });
    reader.handHeight.right = -0.77;
    seconds(30);
    assert.equal(reader.personal[field], null, step);
    assert.equal(practice.finished, false);
  }
});

test('however small the try, what counts stays above tracker wobble', () => {
  const { reader, practice } = practising(['jump']);
  for (let t = 0; t < 40; t += 1 / 30) {
    reader.jumpEffort = 0.04;
    practice.update(1 / 30);
  }
  assert.ok(reader.personal.jump >= 0.035, `now ${reader.personal.jump}`);
});

test('an arm that can\'t go high can still count, from wherever it gets to', () => {
  const { reader, practice } = practising(['raise']);
  for (let t = 0; t < 5.2; t += 1 / 30) {
    // Lifted to about chest height, well below the shoulder, as an affected arm may be.
    reader.handHeight.right = -0.35;
    practice.update(1 / 30);
  }
  assert.ok(reader.handNeeded <= -0.35, `now ${reader.handNeeded}`);
  assert.ok(reader.handNeeded >= -0.55, 'and never as low as a hand just hanging');
});

test('nothing in the obstacle list is taller than a good jump', () => {
  for (const [name, { height }] of Object.entries(OBSTACLES)) assert.ok(height < 1.3, name);
});

test('everything Leap Trail says has a voice file, in English and in Georgian', () => {
  const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
  const lines = read('../../games/leap-trail/audio/voice/lines.json');
  const shared = read('../../core/body/voice/lines.json');
  const core = read('../../core/audio/voice/lines.json');
  const known = new Set([...lines, ...shared, ...core].map(({ text }) => text));
  for (const { id, ka } of lines) {
    assert.match(ka, /[Ⴀ-ჿ]/, `${id} has no Georgian`);
    for (const language of ['en', 'ka']) {
      assert.ok(existsSync(new URL(`../../games/leap-trail/audio/voice/${language}/${id}.ogg`, import.meta.url)), `${language}/${id}.ogg is missing`);
    }
  }

  const source = readFileSync(new URL('../../games/leap-trail/main.js', import.meta.url), 'utf8');
  const asked = new Set();
  for (const block of source.matchAll(/const (?:SAY|STREAKS) = [{[]([\s\S]+?)\n?[}\]];/g)) {
    for (const [, text] of block[1].matchAll(/'([^']+)'/g)) asked.add(text);
  }
  assert.ok(asked.size >= 12, `only found ${asked.size} lines`);
  assert.deepEqual([...asked].filter((text) => !known.has(text)), []);
  assert.deepEqual(lines.map(({ text }) => text).filter((text) => !asked.has(text)), [], 'nothing rendered that can no longer be said');
});
