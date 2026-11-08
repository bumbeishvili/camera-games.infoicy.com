import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  closestAcross,
  FASTEST_SPEED,
  FistAndOpen,
  GATE_SPOTS,
  racePlan,
  RAMP_SPOTS,
  RIVAL_PACE,
  RIVAL_TURBO,
  rivalSpeed,
  SECOND_HAND,
  sideChanges,
  SLAP,
  TOP_SPEED,
  TURBO,
  TurboMeter,
} from '../../games/high-five-racers/rules.js';
import { LANE_LIMIT, LAP_LENGTH, PLACES, START_BEHIND_LINE } from '../../games/high-five-racers/track.js';

const open = { status: 'open', reason: null };
const fist = { status: 'closed', reason: 'closed' };
const cutOff = { status: 'closed', reason: 'edge' };
const touching = { status: 'closed', reason: 'overlap' };
const missing = { status: 'missing', reason: 'missing' };

const run = (watch, hands) => hands.map((hand) => watch.update(hand));

test('the other hand counts once it has been open, made a fist and opened again', () => {
  const watch = new FistAndOpen();
  assert.deepEqual(run(watch, [open, open, fist, fist, open, open]), [false, false, false, false, true, false]);
  assert.deepEqual(run(watch, [fist, open]), [false, true], 'and again, each time');
});

test('a hand that turns up already open, or as a fist, has to do the whole thing first', () => {
  assert.deepEqual(run(new FistAndOpen(), [missing, open]), [false, false]);
  assert.deepEqual(run(new FistAndOpen(), [missing, fist, open]), [false, false, false]);
  assert.deepEqual(run(new FistAndOpen(), [null, fist, open, fist, open]), [false, false, false, false, true]);
});

test('a hand cut off, touching the other hand or lost is not a fist, and starts it again', () => {
  for (const notAFist of [cutOff, touching, missing, null, undefined]) {
    assert.deepEqual(run(new FistAndOpen(), [open, notAFist, open]), [false, false, false], String(notAFist?.reason));
    assert.deepEqual(run(new FistAndOpen(), [open, fist, notAFist, open]), [false, false, false, false], `fist then ${notAFist?.reason}`);
  }
});

test('turbo from the other hand only starts once turbo has run out, and then lasts a set time', () => {
  const meter = new TurboMeter();
  for (let t = 0; t < 2; t += 0.05) meter.update(1, 0.05);
  assert.equal(meter.active, true, 'turbo from the hand held wide');
  assert.equal(meter.burst(), false, 'not while turbo is still going');

  for (let t = 0; t < 3; t += 0.05) meter.update(0.5, 0.05);
  assert.equal(meter.active, false);
  assert.equal(meter.burst(), true, 'once it has run out');
  assert.equal(meter.active, true);
  assert.ok(meter.bonus >= TURBO.bonus);

  // The meter runs down like a timer while the hand in play is open, however open it is.
  let seconds = 0;
  let last = meter.level;
  while (meter.active && seconds < 10) {
    meter.update(0.5, 0.05);
    seconds += 0.05;
    assert.ok(meter.level <= last + 1e-9);
    last = meter.level;
  }
  assert.ok(Math.abs(seconds - SECOND_HAND.turboSeconds) < 0.11, `lasted ${seconds.toFixed(2)} s`);
  assert.equal(meter.level, 0);
  assert.equal(meter.burst(), true, 'and can go again');
});

test('closing the hand in play ends the other hand\'s turbo at once', () => {
  const meter = new TurboMeter();
  meter.burst();
  meter.update(0.5, 0.05);
  meter.update(0, 0.05);
  assert.equal(meter.active, false);
  assert.equal(meter.bonus, 0);
  meter.update(0.5, 0.05);
  assert.equal(meter.active, false, 'it doesn\'t come back when the hand opens');
});

/* ---------- levels ---------- */

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);
const wrap = (value) => ((value % LAP_LENGTH) + LAP_LENGTH) % LAP_LENGTH;
// Things a big hand mustn't stand in or right next to, as [from, to] along the lap.
const NO_HANDS = [
  [PLACES.tunnel[0] - 20, PLACES.tunnel[1] + 12],
  [PLACES.bridge[0] - 8, PLACES.bridge[1] + 12],
  ...[680, 1182, 1290].map((footbridge) => [footbridge - 8, footbridge + 8]),
  [-12, 12], // The start gantry.
];

/** Each thing that can get harder, as a number where bigger is harder. */
function hardness(level) {
  const plan = racePlan(level);
  return {
    rivals: plan.rivals,
    gains: plan.rivalPace.gains,
    keepsUp: -plan.rivalPace.leftBehindBy,
    wishAhead: plan.rivalPace.wishAhead,
    comesBack: -plan.rivalPace.comesBackScale,
    turbo: plan.rivalTurboEvery === Infinity ? 0 : 1 / plan.rivalTurboEvery,
    hands: plan.gates.length,
    sideChanges: sideChanges(plan.gates),
    ramps: plan.ramps.length,
    sideRamps: plan.ramps.filter(({ lateral }) => lateral !== 0).length,
  };
}

test('level 1 is the race as it always was', () => {
  const plan = racePlan(1);
  assert.equal(plan.rivals, 3);
  assert.deepEqual(plan.rivalPace, RIVAL_PACE);
  assert.deepEqual(RIVAL_PACE, { gains: 4.5, leftBehindBy: 7, wishAhead: 0, comesBackScale: 1 });
  assert.equal(plan.rivalTurboEvery, Infinity);
  assert.deepEqual(plan.gates, [
    [90, 1], [190, -1], [300, 1], [470, -1], [560, 1], [660, -1], [745, 1],
    [860, -1], [960, 1], [1060, -1], [1150, 1], [1250, -1], [1345, 1],
  ]);
  assert.deepEqual(GATE_SPOTS, plan.gates);
  assert.deepEqual(plan.ramps, [{ along: 610, lateral: 0 }, { along: 910, lateral: 0 }, { along: 1200, lateral: 0 }]);
  assert.deepEqual(RAMP_SPOTS, [610, 910, 1200]);
  // With level 1's pace, the others race exactly as before.
  const cases = [
    { gap: 5, wish: 20, playerSpeed: 20, resting: false, rushing: false, cruise: 21 },
    { gap: 40, wish: 9, playerSpeed: 20, resting: false, rushing: false, cruise: 21 },
    { gap: -5, wish: 20, playerSpeed: 34, resting: false, rushing: true, cruise: 21 },
  ];
  assert.deepEqual(cases.map((each) => rivalSpeed(each)), [24.5, 13, 27]);
  assert.deepEqual(cases.map((each) => rivalSpeed({ ...each, pace: plan.rivalPace })), [24.5, 13, 27]);
});

test('each level is the same or harder than the one before in every way, and harder in at least one', () => {
  for (const level of LEVELS.slice(1)) {
    const before = hardness(level - 1);
    const now = hardness(level);
    let harder = 0;
    for (const key of Object.keys(now)) {
      assert.ok(now[key] >= before[key] - 1e-9, `level ${level}: ${key} got easier`);
      if (now[key] > before[key] + 1e-9) harder += 1;
    }
    assert.ok(harder > 0, `level ${level} is no harder than level ${level - 1}`);
  }
});

test('new kinds of thing come in from about level 3, and level 10 has them all', () => {
  const sameSideTwice = (spots) => spots.some(([, side], index) => index > 0 && spots[index - 1][1] === side);
  assert.ok(!sameSideTwice(racePlan(2).gates));
  assert.ok(sameSideTwice(racePlan(3).gates), 'two big hands on one side');
  assert.ok(racePlan(4).rivals > 3, 'another car');
  assert.ok(racePlan(5).rivalTurboEvery < Infinity, 'the others use turbo');
  assert.ok(racePlan(6).ramps.some(({ lateral }) => lateral !== 0), 'a ramp to one side');
  assert.ok(sideChanges(racePlan(7).gates) > sideChanges(racePlan(6).gates), 'a slalom');
  const top = hardness(10);
  assert.ok(top.rivals === 5 && top.turbo > 0 && top.sideRamps === 2 && top.hands > 13);
});

test('even level 10 leaves time to get across, and asks for no more than twice as many moves', () => {
  const levelOne = racePlan(1).gates;
  const first = closestAcross(levelOne, LAP_LENGTH);
  assert.equal(first, 85);
  for (const level of LEVELS) {
    const { gates } = racePlan(level);
    // Two big hands on opposite sides are never so close that there's less than 70% of the time to get across.
    assert.ok(closestAcross(gates, LAP_LENGTH) >= 0.7 * first, `level ${level}: ${closestAcross(gates, LAP_LENGTH)} m`);
    // Moving across for a big hand, and high fives, at most twice as often as at level 1.
    assert.ok(sideChanges(gates) <= 2 * sideChanges(levelOne), `level ${level}`);
    assert.ok(gates.length <= 2 * levelOne.length, `level ${level}`);
    // The first big hand of the race comes no sooner than 70% of the way it does at level 1.
    assert.ok(gates[0][0] + START_BEHIND_LINE >= 0.7 * (levelOne[0][0] + START_BEHIND_LINE));
  }
  // The race is as many laps as a grown-up chose, and nothing in a level slows the car, so it's never
  // longer. The fastest the car goes never changes: what goes past at speed is spaced for it.
  assert.equal(FASTEST_SPEED, TOP_SPEED * 1.45);
});

test('big hands and ramps keep clear of the tunnel, the bridges and each other at every level', () => {
  for (const level of LEVELS) {
    const { gates, ramps } = racePlan(level);
    gates.forEach(([along, side], index) => {
      assert.ok(side === 1 || side === -1);
      for (const [from, to] of NO_HANDS) assert.ok(!(wrap(along - from) <= wrap(to - from)), `level ${level}: a big hand at ${along}`);
      if (index > 0) assert.ok(along - gates[index - 1][0] >= 30, `level ${level}: big hands at ${gates[index - 1][0]} and ${along}`);
      // A big hand is never right by a ramp down the middle, where the car would have to be in two places.
      for (const ramp of ramps) {
        if (ramp.lateral === 0) assert.ok(Math.abs(along - ramp.along) >= 40, `level ${level}: big hand at ${along} by a ramp`);
        // A ramp to one side is on the way to the big hand after it, on that same side.
        else if (along > ramp.along && along - ramp.along < 40) assert.equal(Math.sign(ramp.lateral), side);
      }
    });
    for (const ramp of ramps) {
      for (const [from, to] of NO_HANDS) assert.ok(!(wrap(ramp.along - from) <= wrap(to - from)), `level ${level}: a ramp at ${ramp.along}`);
      // A ramp to one side stays on the road.
      assert.ok(Math.abs(ramp.lateral) + 2.9 <= LANE_LIMIT + 1.5);
    }
  }
});

test('the others still ease off at the end, and still wait for a child who is resting, at level 10', () => {
  const pace = racePlan(10).rivalPace;
  const cruise = 21;
  // On the last stretch they want to be behind, and they drop back.
  assert.ok(rivalSpeed({ gap: 10, wish: -10, playerSpeed: 20, resting: false, rushing: false, cruise, pace }) < 20);
  // Resting: those behind stop behind, those in front stop a little way on.
  assert.equal(rivalSpeed({ gap: -5, wish: 30, playerSpeed: 0, resting: true, rushing: false, comingBack: true, cruise, pace }), 0);
  assert.equal(rivalSpeed({ gap: 50, wish: 30, playerSpeed: 0, resting: true, rushing: false, cruise, pace }), 0);
  // A boost still leaves them behind, a little less quickly than at level 1.
  assert.ok(rivalSpeed({ gap: -5, wish: 20, playerSpeed: 34, resting: false, rushing: true, cruise, pace }) < 34);
  assert.ok(RIVAL_TURBO.seconds < 3 && RIVAL_TURBO.gain < SLAP.kick * 2);
});
