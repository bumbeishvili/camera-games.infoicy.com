import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FistAndOpen, SECOND_HAND, TURBO, TurboMeter } from '../../games/high-five-racers/rules.js';

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
