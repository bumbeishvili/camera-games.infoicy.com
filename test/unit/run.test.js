// The rules of a run, without a screen or a camera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Practice } from '../../games/leap-trail/practice.js';
import { OBSTACLES, PACES, Run, layCourse } from '../../games/leap-trail/run.js';

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

const moveFor = (run, obstacle) => (obstacle.needs === 'jump' ? run.jump() : run.squat());

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

test('squats are mixed in but never twice running, and never right at the start', () => {
  const { course } = layCourse({ obstacles: 200, pace: 'slow', random: seeded(3) });
  const squats = course.filter(({ needs }) => needs === 'squat').length;
  assert.ok(squats > 30 && squats < 90, `${squats} squats of 200`);
  assert.equal(course[0].needs, 'jump');
  assert.equal(course[1].needs, 'jump');
  for (let i = 1; i < course.length; i += 1) {
    assert.ok(!(course[i].needs === 'squat' && course[i - 1].needs === 'squat'), `at ${i}`);
  }
});

test('with squats turned off, every obstacle is a jump', () => {
  const { course } = layCourse({ obstacles: 100, pace: 'slow', squats: false, random: seeded() });
  assert.ok(course.every(({ needs }) => needs === 'jump'));
});

test('the right move clears an obstacle, wherever in the stretch it was made', () => {
  for (const share of [1, 0.6, 0.25]) {
    const { run, events } = setup({ obstacles: 1, squats: false });
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
      const { run } = setup({ obstacles: 2, squats: false, pace, random: seeded(seed * 97) });
      const obstacle = untilInReach(run);
      run.jump();
      const lowest = lowestOver(run, obstacle);
      assert.ok(lowest > obstacle.height, `${pace}: at ${lowest} over a ${obstacle.kind} ${obstacle.height} tall`);
      assert.equal(obstacle.state, 'cleared');
    }

    // From standing still, right in front of it.
    const waited = setup({ obstacles: 2, squats: false, pace, whenMissed: 'wait' });
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

test('only the move an obstacle asks for clears it', () => {
  const { run } = setup({ obstacles: 1, squats: false });
  const obstacle = untilInReach(run);
  assert.equal(run.squat(), false, 'a squat doesn\'t clear something to jump over');
  assert.equal(obstacle.state, 'ahead');
  assert.equal(run.stats.squats, 1);
  assert.equal(run.jump(), true);
});

test('squat obstacles are cleared by a squat, sliding along under them', () => {
  const { run } = setup({ obstacles: 60, random: seeded(11) });
  let squatObstacle = null;
  while (!squatObstacle) {
    const obstacle = untilInReach(run);
    if (obstacle.needs === 'squat') squatObstacle = obstacle;
    else {
      run.jump();
      run.update(1 / 60);
    }
  }
  assert.equal(run.jump(), false, 'a jump doesn\'t clear something to get under');
  assert.equal(run.squat(), true);
  run.update(1 / 60);
  assert.ok(run.slide > 0);
  assert.equal(run.air.height, 0, 'and stays on the ground');
  step(run, 3, () => run.noteActivity());
  assert.equal(squatObstacle.state, 'cleared');
  assert.equal(run.stats.squats, 1);
});

test('when set to wait, the fighter stops short of an obstacle and waits as long as it takes', () => {
  const { run, events } = setup({ obstacles: 2, whenMissed: 'wait', squats: false });
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
  const { run, events } = setup({ obstacles: 3, whenMissed: 'stumble', squats: false });
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
  assert.equal(stats.jumps + stats.squats, 12);
  assert.ok(stats.seconds > 0);
  assert.equal(events.filter(({ type }) => type === 'finished').length, 1);
});

test('a move asks for itself once, when it would first count', () => {
  const { run, events } = setup({ obstacles: 1, squats: false });
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
  assert.equal(done.squat(), false);
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
    const { run } = setup({ obstacles: 2, squats: false, pace });
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
  const { run } = setup({ obstacles: 2, squats: false });
  const obstacle = untilInReach(run);
  assert.equal(run.jump(), true);
  run.update(1 / 60);
  const { from } = run.move;
  assert.equal(run.jump(), false);
  assert.equal(run.squat(), false);
  assert.equal(run.move.from, from);
  assert.equal(run.stats.jumps, 1, 'a star jump read as two moves only counts once');
  assert.equal(run.stats.squats, 0);
  step(run, 2.5, () => run.noteActivity());
  assert.equal(obstacle.state, 'cleared');
});

test('the wrong move gets noticed, so the child can be asked again', () => {
  const { run, events } = setup({ obstacles: 1, squats: false });
  untilInReach(run);
  assert.equal(run.squat(), false);
  const wrong = events.filter(({ type }) => type === 'wrong-move');
  assert.equal(wrong.length, 1);
  assert.equal(wrong[0].needs, 'jump');

  const early = setup({ obstacles: 1, squats: false });
  early.run.update(1 / 60);
  early.run.squat();
  assert.equal(early.events.some(({ type }) => type === 'wrong-move'), false, 'nothing is being asked for yet');
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
  const { practice, events, seconds } = practising(['jump', 'squat']);
  assert.equal(practice.step, 'jump');
  assert.deepEqual(events[0], { type: 'step', step: 'jump', index: 0, total: 2 });

  practice.onMoves([{ move: 'stomp' }]);
  assert.equal(practice.step, 'jump', 'a squat doesn\'t count when a jump is asked for');
  assert.equal(events.some(({ type }) => type === 'success'), false);

  practice.onMoves([{ move: 'flying' }]);
  assert.ok(events.some(({ type, step }) => type === 'success' && step === 'jump'));
  seconds(2);
  assert.equal(practice.step, 'squat');

  practice.onMoves([{ move: 'stomp' }]);
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
  const { practice, reader, events } = practising(['squat']);
  // Sinking again and again, but not as far as counts.
  for (let t = 0; t < 5.2; t += 1 / 30) {
    reader.sink = 0.1 * Math.abs(Math.sin(t * 2));
    practice.update(1 / 30);
  }
  assert.ok(reader.personal.squat > 0.07 && reader.personal.squat < 0.1, `now ${reader.personal.squat}`);
  assert.ok(reader.squatNeeded < 0.16);
  assert.ok(events.some(({ type }) => type === 'eased'));
});

test('practice never lowers the bar for a child just standing there', () => {
  for (const [step, field] of [['jump', 'jump'], ['squat', 'squat'], ['lift', 'leg'], ['raise', 'hand']]) {
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

test('nothing in the obstacle list is taller than a good jump, or lower than a slide', () => {
  for (const [name, { needs, height }] of Object.entries(OBSTACLES)) {
    if (needs === 'jump') assert.ok(height < 1.3, name);
    else assert.ok(height >= 1.1, `${name} leaves room to slide under`);
  }
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
