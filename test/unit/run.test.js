// The rules of a run, without a screen or a camera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Practice } from '../../games/leap-trail/practice.js';
import { LANE_STEP, LaneReader, bodyAcross } from '../../games/leap-trail/lanes.js';
import { GOLD_STARS, LANES, OBSTACLES, PACES, Run, fills, layCourse, paceAt, trailLevel } from '../../games/leap-trail/run.js';

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
  // All four kinds of level 1 still turn up, and only those. Later levels bring more: see below.
  const { course } = layCourse({ obstacles: 200, pace: 'slow', random: seeded(5) });
  assert.deepEqual(new Set(course.map(({ kind }) => kind)), new Set(['log', 'hay', 'rocks', 'stream']));
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

/* ---------- levels ---------- */

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);

test('level 1 keeps the trail\'s pace and obstacles as they always were', () => {
  const rules = trailLevel(1);
  assert.deepEqual(
    { speed: rules.speed, gaps: rules.gaps, early: rules.early, laneMoves: rules.laneMoves, gold: rules.gold, zigzag: rules.zigzag, kinds: rules.kinds },
    { speed: 1, gaps: 1, early: 1, laneMoves: 0.65, gold: 0, zigzag: 0, kinds: ['log', 'hay', 'rocks', 'stream'] },
  );
  // What's new at level 1 is that some obstacles leave a lane free: most still go right across.
  assert.deepEqual([rules.full, rules.single], [0.75, 0]);
  for (const pace of Object.keys(PACES)) assert.deepEqual(paceAt(pace, 1), PACES[pace]);
  // The same obstacles in the same places, to the millimetre, as before there were levels.
  const round = (value) => Math.round(value * 1000) / 1000;
  const expected = {
    slow: { at: [42, 96.502, 142.355, 192.467, 245.143, 296.383, 347.795, 395.244, 447.364, 491.443, 540.738, 595.312], end: 612.044 },
    fast: { at: [72, 136.559, 191.191, 250.662, 313.092, 373.709, 434.666, 490.951, 552.744, 605.32, 663.858, 728.285], end: 759.279 },
  };
  for (const [pace, { at, end }] of Object.entries(expected)) {
    const laid = layCourse({ obstacles: 12, pace, random: seeded(7), levelNumber: 1 });
    assert.equal(laid.course.map(({ kind }) => kind).join(','), 'log,hay,rocks,hay,stream,rocks,stream,hay,rocks,rocks,stream,log');
    assert.deepEqual(laid.course.map((obstacle) => round(obstacle.at)), at);
    assert.equal(round(laid.end), end);
    assert.ok(laid.course.every(({ gold }) => !gold), 'no golden stars');
  }
  const run = new Run({ pace: 'medium', random: seeded() });
  assert.equal(run.levelNumber, 1);
  assert.deepEqual(run.settings, PACES.medium);
});

test('each level is the same as the one before or harder, in every way, and always harder in something', () => {
  for (const level of LEVELS.slice(1)) {
    const before = trailLevel(level - 1);
    const now = trailLevel(level);
    const harder = [now.speed > before.speed, now.gaps < before.gaps, now.early < before.early, now.laneMoves > before.laneMoves, now.gold > before.gold, now.zigzag > before.zigzag, now.kinds.length > before.kinds.length];
    assert.ok(now.speed >= before.speed && now.gaps <= before.gaps && now.early <= before.early, `${level}: pace`);
    assert.ok(now.laneMoves >= before.laneMoves && now.gold >= before.gold && now.zigzag >= before.zigzag, `${level}: stars`);
    assert.ok(now.full <= before.full && now.single >= before.single && now.freeSwitch >= before.freeSwitch && now.freeStars >= before.freeStars, `${level}: lanes to choose between`);
    assert.ok(before.kinds.every((kind) => now.kinds.includes(kind)), `${level}: nothing taken away`);
    assert.ok(harder.some(Boolean), `${level}: something is harder`);
  }
  // New kinds of thing from level 3 on.
  assert.equal(trailLevel(2).gold, 0);
  assert.ok(trailLevel(3).gold > 0, 'golden stars from level 3');
  assert.deepEqual(trailLevel(4).kinds.slice(4), ['fence']);
  assert.ok(trailLevel(5).zigzag > 0, 'lines across a lane from level 5');
  assert.deepEqual(trailLevel(10).kinds, Object.keys(OBSTACLES));
});

test('new obstacles still ask for a jump, aren\'t taller than a good jump, and all turn up at level 10', () => {
  for (const level of LEVELS) {
    const { course } = layCourse({ obstacles: 200, pace: 'slow', random: seeded(level), levelNumber: level });
    assert.ok(course.every(({ needs }) => needs === 'jump'), `${level}`);
    assert.deepEqual(new Set(course.map(({ kind }) => kind)), new Set(trailLevel(level).kinds), `${level}`);
  }
  for (const [name, { height }] of Object.entries(OBSTACLES)) assert.ok(height < 1.3, name);
  assert.equal(typeof new Run({ levelNumber: 10 }).squat, 'undefined', 'and there are still no squats');
});

test('golden stars hang over one lane, one step at most from the stars before, and only from level 3', () => {
  for (const level of LEVELS) {
    const { course, starLines } = layCourse({ obstacles: 100, pace: 'slow', random: seeded(3), levelNumber: level });
    const golden = course.filter(({ gold }) => gold);
    if (level < 3) assert.equal(golden.length, 0);
    else assert.ok(Math.abs(golden.length / course.length - trailLevel(level).gold) < 0.15, `${level}: ${golden.length}`);
    // Following everything never asks for more than a step at a time.
    const path = [...starLines.map(({ at, lane }) => ({ at, lane })), ...golden.map(({ at, length, gold }) => ({ at: at + length / 2, lane: gold.lane }))].sort((a, b) => a.at - b.at);
    path.forEach((point, i) => assert.ok(i === 0 || Math.abs(point.lane - path[i - 1].lane) <= 1, `${level} at ${i}`));
  }
});

test('from level 5 some lines of stars cross into the next lane halfway along', () => {
  const crossing = (level, lanes = true) => {
    const starLines = layCourse({ obstacles: 80, pace: 'slow', lanes, random: seeded(11), levelNumber: level }).starLines.filter(({ beside }) => !beside);
    let count = 0;
    for (let i = 0; i < starLines.length; i += 6) if (starLines[i].lane !== starLines[i + 5].lane) count += 1;
    return count;
  };
  assert.equal(crossing(4), 0);
  assert.ok(crossing(5) > 5);
  // Fewer lines are free to cross at level 10, as more lead into a free lane, but more of those do.
  assert.ok(crossing(10) > 5);
  assert.ok(trailLevel(10).zigzag > trailLevel(5).zigzag);
});

test('a golden star is caught by jumping over in its lane, and missing it costs nothing', () => {
  const golden = (lane) => {
    const events = [];
    const run = new Run({ obstacles: 2, random: seeded(), levelNumber: 10, onEvent: (event) => events.push(event) });
    run.begin();
    run.course[0].gold = { lane: 1, taken: false, missed: false };
    run.setLane(lane);
    untilInReach(run);
    run.jump();
    step(run, 3, () => run.noteActivity());
    return { run, events };
  };
  const caught = golden(1);
  assert.equal(caught.run.course[0].gold.taken, true);
  assert.equal(caught.run.stats.gold, 1);
  assert.equal(caught.run.stats.stars, 3 + GOLD_STARS);
  assert.equal(caught.events.filter(({ type }) => type === 'gold').length, 1);

  const missed = golden(0);
  assert.equal(missed.run.course[0].gold.missed, true);
  assert.equal(missed.run.stats.gold, 0);
  assert.equal(missed.run.stats.stars, 3, 'the jump still counts');
  assert.equal(missed.run.stats.streak, 1, 'and so does the streak');
  assert.equal(missed.run.stats.bumps, 0);
});

test('with the lanes off, every star and golden star is in the middle at every level', () => {
  for (const level of LEVELS) {
    const { course, starLines } = layCourse({ obstacles: 60, pace: 'slow', lanes: false, random: seeded(level), levelNumber: level });
    assert.ok(starLines.every(({ lane }) => lane === 0), `${level}`);
    assert.ok(course.every(({ gold }) => !gold || gold.lane === 0), `${level}`);
  }
  // So staying in the middle catches every golden star.
  const run = new Run({ obstacles: 20, lanes: false, random: seeded(4), levelNumber: 10 });
  run.begin();
  perfectRun(run);
  assert.equal(run.stats.gold, run.course.filter(({ gold }) => gold).length);
  assert.ok(run.stats.gold > 0);
});

/**
 * A child catching everything: always in the lane of the next star or golden star, and jumping
 * delay seconds after a jump starts to count. Says how long it took and how many moves it asked for.
 */
function followEverything({ levelNumber, pace, lanes = true, seed, delay = 0 }) {
  const run = new Run({ obstacles: 20, pace, lanes, random: seeded(seed), levelNumber });
  run.begin();
  let laneChanges = 0;
  let asked = 0;
  while (run.state === 'running') {
    const star = run.starLines[run.nextStar];
    const golden = run.course.find(({ gold, state }) => gold && (state === 'ahead' || state === 'passing'));
    const goldAt = golden ? golden.at + golden.length / 2 : Infinity;
    let wanted = golden && goldAt < (star?.at ?? Infinity) ? golden.gold.lane : star?.lane ?? run.lane;
    // Going round what's coming, when it leaves a lane free: the free lane nearest where it was going.
    const { next } = run;
    if (lanes && next && next.state === 'ahead' && run.gapTo(next) < 30 && fills(next, wanted) && next.lanes.length < 3 && !(golden === next && wanted === next.gold.lane)) {
      wanted = LANES.filter((lane) => !fills(next, lane)).sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted))[0];
    }
    if (wanted !== run.lane) {
      laneChanges += 1;
      run.setLane(wanted);
    }
    if (run.mustJump) {
      asked += 1 / 30;
      if (asked >= delay) run.jump();
    } else asked = 0;
    run.noteActivity();
    run.update(1 / 30);
  }
  const minutes = run.stats.seconds / 60;
  return { seconds: run.stats.seconds, jumps: run.stats.jumps / minutes, moves: (run.stats.jumps + laneChanges) / minutes, gold: run.stats.gold, lined: run.stats.linedStars, all: run.starLines.length, cleared: run.stats.cleared, bumps: run.stats.bumps };
}

test('level 10 is still doable: as much time to move, no more than double the moves, and not much longer', () => {
  for (const pace of Object.keys(PACES)) {
    assert.ok(paceAt(pace, 10).early >= PACES[pace].early * 0.7, `${pace}: time to jump`);
    for (const [lanes, delay] of [[true, 0], [true, 0.9], [false, 0.9]]) {
      const total = (levelNumber) => {
        const runs = [1, 2, 3, 4, 5].map((seed) => followEverything({ levelNumber, pace, lanes, seed, delay }));
        const mean = (field) => runs.reduce((sum, one) => sum + one[field], 0) / runs.length;
        return { seconds: mean('seconds'), jumps: mean('jumps'), moves: mean('moves'), caught: runs.every(({ lined, all }) => lined >= all * 0.9), clean: runs.every(({ cleared, bumps }) => cleared === 20 && bumps === 0) };
      };
      const first = total(1);
      const last = total(10);
      const name = `${pace}, lanes ${lanes ? 'on' : 'off'}, jumping after ${delay}s`;
      assert.ok(first.caught && last.caught, `${name}: nearly every star can be caught`);
      assert.ok(first.clean && last.clean, `${name}: every obstacle cleared, none run into`);
      assert.ok(last.moves <= first.moves * 2, `${name}: ${last.moves} moves a minute against ${first.moves}`);
      assert.ok(last.jumps <= first.jumps * 1.5, `${name}: ${last.jumps} jumps a minute against ${first.jumps}`);
      assert.ok(last.seconds <= first.seconds * 1.33, `${name}: ${last.seconds} seconds against ${first.seconds}`);
    }
  }
});

test('at every level a jump made as soon as it counts goes over, and lands before the next obstacle', () => {
  for (const level of LEVELS) {
    for (const pace of Object.keys(PACES)) {
      const run = new Run({ obstacles: 30, pace, random: seeded(level * 13), levelNumber: level });
      run.begin();
      let lowest = Infinity;
      perfectRun(run);
      for (let i = 1; i < run.course.length; i += 1) lowest = Math.min(lowest, run.course[i].at - (run.course[i - 1].at + run.course[i - 1].length));
      assert.equal(run.stats.cleared, 30, `${level} ${pace}`);
      assert.equal(run.stats.bumps, 0, `${level} ${pace}`);
      assert.ok(lowest > run.reachDistance, `${level} ${pace}: a jump can always land before the next one counts`);
    }
  }
});

/* ---------- obstacles that fill one, two or three lanes ---------- */

/** A run whose first obstacle fills these lanes, with nothing else to get in the way. */
function oneObstacle(lanes, options = {}) {
  const events = [];
  const run = new Run({ obstacles: 2, random: seeded(), onEvent: (event) => events.push(event), ...options });
  run.begin();
  run.course[0].lanes = lanes;
  run.course[1].lanes = [...LANES];
  return { run, events, obstacle: run.course[0] };
}

test('obstacles fill three, two or one lane, more often fewer as the levels go up, and a stream always goes across', () => {
  const share = (level, width) => {
    const { course } = layCourse({ obstacles: 400, pace: 'slow', random: seeded(level + 20), levelNumber: level });
    const kinds = course.filter(({ kind }) => kind !== 'stream');
    assert.ok(course.filter(({ kind }) => kind === 'stream').every(({ lanes }) => lanes.length === 3), `${level}: streams`);
    return kinds.filter(({ lanes }) => lanes.length === width).length / kinds.length;
  };
  assert.ok(Math.abs(share(1, 3) - 0.75) < 0.07, 'level 1: mostly right across');
  assert.ok(Math.abs(share(1, 2) - 0.25) < 0.07, 'and some two-lane ones');
  assert.equal(share(1, 1), 0);
  assert.ok(share(10, 1) > 0.25 && share(10, 2) > 0.25 && share(10, 3) < 0.4, 'level 10: plenty of each');
  // On the higher levels the free lane mostly switches sides, so it's a step each time.
  const switches = (level) => {
    const narrow = layCourse({ obstacles: 400, pace: 'slow', random: seeded(3), levelNumber: level }).course.filter(({ lanes }) => lanes.length < 3);
    // How often one fills a lane the last one left free.
    let filled = 0;
    for (let i = 1; i < narrow.length; i += 1) if (LANES.some((lane) => !fills(narrow[i - 1], lane) && fills(narrow[i], lane))) filled += 1;
    return filled / (narrow.length - 1);
  };
  assert.ok(switches(10) > switches(1) + 0.15, `${switches(1)} then ${switches(10)}`);
});

test('a line of stars leads into the free lane, and stars wait there beside the obstacle', () => {
  const { course, starLines } = layCourse({ obstacles: 200, pace: 'slow', random: seeded(8), levelNumber: 10 });
  const beside = starLines.filter((star) => star.beside);
  assert.ok(beside.length > 50);
  for (const star of beside) {
    const obstacle = course.find(({ at, length }) => star.at >= at - 6 && star.at <= at + length + 5);
    assert.ok(obstacle && !fills(obstacle, star.lane), 'in a free lane');
  }
  // Following every star and golden star is never more than a step at a time.
  const path = [...starLines, ...course.filter(({ gold }) => gold).map(({ at, length, gold }) => ({ at: at + length / 2, lane: gold.lane }))].sort((a, b) => a.at - b.at);
  path.forEach((point, i) => assert.ok(i === 0 || Math.abs(point.lane - path[i - 1].lane) <= 1, `at ${i}`));
});

test('with the lanes off, every obstacle fills the middle lane, at every level, so there are as many jumps as ever', () => {
  for (const level of LEVELS) {
    const { course } = layCourse({ obstacles: 200, pace: 'slow', lanes: false, random: seeded(level), levelNumber: level });
    assert.ok(course.every((obstacle) => fills(obstacle, 0)), `${level}`);
    assert.ok(course.some(({ lanes }) => lanes.length < 3) || level === 1 && course.every(({ lanes }) => lanes.length >= 2), `${level}: still a mix to look at`);
    const run = new Run({ obstacles: 20, lanes: false, random: seeded(level), levelNumber: level });
    run.begin();
    perfectRun(run);
    assert.deepEqual([run.stats.cleared, run.stats.jumps, run.stats.stepped, run.stats.bumps], [20, 20, 0, 0], `${level}`);
  }
});

test('stepping into a free lane goes round an obstacle: it\'s cleared, with its stars, and no jump asked for', () => {
  const { run, events, obstacle } = oneObstacle([-1, 0], { whenMissed: 'stumble' });
  run.setLane(1);
  step(run, 8, () => {
    run.noteActivity();
    if (obstacle.state === 'cleared') run.state = 'finished';
  });
  assert.equal(obstacle.state, 'cleared');
  assert.equal(obstacle.steppedRound, true);
  assert.deepEqual([run.stats.cleared, run.stats.stepped, run.stats.bumps, run.stats.jumps, run.stats.streak], [1, 1, 0, 0, 1]);
  assert.ok(run.stats.stars >= 3);
  assert.equal(events.filter(({ type, obstacle: which }) => type === 'ask' && which === obstacle).length, 0, 'never asked to jump it');
  assert.ok(events.some(({ type }) => type === 'passed-by'));
});

test('in a lane an obstacle fills, it still needs a jump, and a jump clears it from any lane', () => {
  const stood = oneObstacle([0], { whenMissed: 'stumble' });
  untilInReach(stood.run);
  assert.equal(stood.run.mustJump, true);
  assert.equal(stood.events.filter(({ type }) => type === 'ask').length, 1);
  step(stood.run, 4, () => stood.run.noteActivity());
  assert.equal(stood.obstacle.state, 'bumped', 'standing in its lane runs into it');

  const jumped = oneObstacle([0]);
  untilInReach(jumped.run);
  assert.equal(jumped.run.jump(), true);
  step(jumped.run, 3, () => jumped.run.noteActivity());
  assert.equal(jumped.obstacle.state, 'cleared');

  const fromFree = oneObstacle([0]);
  fromFree.run.setLane(1);
  untilInReach(fromFree.run);
  assert.equal(fromFree.run.mustJump, false, 'nothing to jump in a free lane');
  assert.equal(fromFree.run.jump(), true, 'but a jump there still goes over it');
  step(fromFree.run, 3, () => fromFree.run.noteActivity());
  assert.deepEqual([fromFree.obstacle.state, fromFree.run.stats.stepped], ['cleared', 0]);

  const across = oneObstacle([...LANES], { whenMissed: 'stumble' });
  across.run.setLane(1);
  step(across.run, 8, () => across.run.noteActivity());
  assert.equal(across.obstacle.state, 'bumped', 'one right across can\'t be gone round');
});

test('set to wait, the runner only waits at an obstacle in its own lane, and never runs into one stepped in front of', () => {
  const free = oneObstacle([-1], { whenMissed: 'wait' });
  step(free.run, 8, () => {
    free.run.noteActivity();
    if (free.obstacle.state === 'cleared') free.run.state = 'finished';
  });
  assert.equal(free.obstacle.state, 'cleared', 'one in another lane is just gone past');
  assert.equal(free.run.stats.bumps, 0);

  const late = oneObstacle([1], { whenMissed: 'wait' });
  while (late.run.gapTo(late.obstacle) > 0.5) {
    late.run.noteActivity();
    late.run.update(1 / 60);
  }
  late.run.setLane(1);
  step(late.run, 3, () => late.run.noteActivity());
  assert.equal(late.obstacle.state, 'ahead');
  assert.equal(late.run.stats.bumps, 0);
  assert.equal(late.run.speed, 0);
  assert.ok(late.run.gapTo(late.obstacle) >= 0);
});
