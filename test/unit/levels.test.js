import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampLevel, gameIdFromPage, LAST_LEVEL, levelWords, Levels, ramp, rampWhole, stepsAt } from '../../core/levels.js';

test('there are ten levels, and anything else comes back between them', () => {
  assert.equal(LAST_LEVEL, 10);
  assert.deepEqual([0, 1, 4.4, 10, 11, -3, NaN, 'x', '7'].map(clampLevel), [1, 1, 4, 10, 10, 1, 1, 1, 7]);
});

test('ramps go evenly from level 1 to level 10, and steps change where they say', () => {
  assert.equal(ramp(1, 2, 20), 2);
  assert.equal(ramp(10, 2, 20), 20);
  assert.equal(ramp(4, 2, 20), 8);
  assert.equal(ramp(99, 2, 20), 20);
  assert.equal(rampWhole(5, 1, 4), 2);
  const weather = { 1: 'calm', 4: 'windy', 8: 'stormy' };
  assert.deepEqual([1, 3, 4, 7, 8, 10].map((level) => stepsAt(level, weather)), ['calm', 'calm', 'windy', 'windy', 'stormy', 'stormy']);
});

test('each game keeps its own level, starting at 1', () => {
  const settings = {};
  const racer = new Levels(settings, 'high-five-racers');
  const ships = new Levels(settings, 'cannon-bay');
  assert.equal(racer.current, 1);
  racer.choose(6);
  assert.equal(racer.current, 6);
  assert.equal(ships.current, 1);
  assert.deepEqual(settings.levels, { 'high-five-racers': 6 });
});

test('winning moves on a level, losing stays, and level 10 is the last', () => {
  const levels = new Levels({}, 'sky-wings');
  assert.deepEqual(levels.complete(), { played: 1, next: 2, won: true, allDone: false });
  assert.deepEqual(levels.complete(false), { played: 2, next: 2, won: false, allDone: false });
  assert.equal(levels.current, 2);
  levels.choose(9);
  levels.complete();
  assert.deepEqual(levels.complete(), { played: 10, next: 10, won: true, allDone: true });
  assert.equal(levels.current, 10);
});

test('a level a grown-up chose during a game is the next one, whatever happened', () => {
  const levels = new Levels({}, 'lighthouse');
  levels.choose(3);
  levels.choose(7);
  assert.deepEqual(levels.complete(true, 3), { played: 3, next: 7, won: true, allDone: false });
  assert.equal(levels.current, 7);
  levels.choose(2);
  assert.deepEqual(levels.complete(false, 9), { played: 9, next: 2, won: false, allDone: false });
  assert.equal(levels.current, 2);
  assert.equal(levelWords({ played: 3, next: 7, won: true, allDone: false }), 'Level 3 done! Next: level 7');
});

test('the finish card says what was done and what comes next', () => {
  assert.equal(levelWords({ played: 3, next: 4, won: true, allDone: false }), 'Level 3 done! Next: level 4');
  assert.equal(levelWords({ played: 3, next: 3, won: false, allDone: false }), 'Let’s try level 3 again!');
  assert.equal(levelWords({ played: 10, next: 10, won: true, allDone: true }), 'All 10 levels done!');
});

test('the game is named by its folder', () => {
  assert.equal(gameIdFromPage('/games/lighthouse/index.html'), 'lighthouse');
  assert.equal(gameIdFromPage('/games/high-five-racers/'), 'high-five-racers');
  assert.equal(gameIdFromPage('/index.html'), 'game');
});
