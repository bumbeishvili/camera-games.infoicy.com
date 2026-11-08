// The parts of Balloon Pop that can be checked without a screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { toScreen } from '../../games/balloon-pop/balloons.js';
import { LEVELS, MathsDeck, answersFor } from '../../games/balloon-pop/maths.js';
import { balloonLevel, balloonsPerMinute, MOST_ANSWERS, PACES, secondsOnScreen, STAR_HOLD_SECONDS, WANDERER_CHANCE } from '../../games/balloon-pop/rules.js';

test('the middle of the picture lands near the middle of the screen', () => {
  const { x, y } = toScreen(0.5, 0.49, 1000, 500);
  assert.ok(Math.abs(x - 500) < 1);
  assert.ok(Math.abs(y - 250) < 1);
});

test('the screen\'s edges can be reached without the hand leaving the picture', () => {
  assert.ok(toScreen(0.1, 0.5, 1000, 500).x <= 0);
  assert.ok(toScreen(0.9, 0.5, 1000, 500).x >= 1000);
  assert.ok(toScreen(0.5, 0.1, 1000, 500).y <= 0);
  assert.ok(toScreen(0.5, 0.88, 1000, 500).y >= 500);
});

test('every question is right, and stays within what its level says', () => {
  for (const { a, b, answer } of LEVELS.add.questions) {
    assert.equal(answer, a + b);
    assert.ok(answer <= 10 && a >= 1 && b >= 1);
  }
  assert.equal(LEVELS.add.questions.length, 45);
  for (const { id, a, b, answer } of LEVELS.addTake.questions) {
    assert.equal(answer, id.startsWith('add') ? a + b : a - b);
    assert.ok(answer >= 1 && answer <= 20 && a <= 20, id);
  }
  assert.ok(LEVELS.addTake.questions.some(({ id }) => id.startsWith('take')));
  for (const { a, b, answer } of LEVELS.times.questions) assert.equal(answer, a * b);
  assert.equal(LEVELS.times.questions.length, 81);
});

test('the right answer is always there, among other sensible ones, and it moves around', () => {
  for (const { choices, questions } of Object.values(LEVELS)) {
    for (const question of questions) {
      const answers = answersFor(question, choices);
      assert.equal(answers.length, choices, question.id);
      assert.equal(new Set(answers).size, choices, `${question.id}: ${answers}`);
      assert.equal(answers.filter((value) => value === question.answer).length, 1, question.id);
      assert.ok(answers.every((value) => Number.isInteger(value) && value > 0), `${question.id}: ${answers}`);
    }
  }
  const [question] = LEVELS.add.questions;
  const places = new Set(Array.from({ length: 60 }, () => answersFor(question, 3).indexOf(question.answer)));
  assert.equal(places.size, 3);
});

test('no question comes round again until they\'ve all been asked', () => {
  const deck = new MathsDeck('add');
  const asked = Array.from({ length: LEVELS.add.questions.length }, () => deck.next().id);
  assert.equal(new Set(asked).size, asked.length);
  const next = deck.next();
  assert.ok(next.answers.includes(next.answer));
  assert.equal(next.answers.length, LEVELS.add.choices);
});

test('what Balloon Pop says about answers has a voice file, in both languages', () => {
  const lines = JSON.parse(readFileSync(new URL('../../core/audio/voice/lines.json', import.meta.url)));
  const known = new Map(lines.map(({ text, id, ka }) => [text, { id, ka }]));
  const source = readFileSync(new URL('../../games/balloon-pop/main.js', import.meta.url), 'utf8');
  for (const constant of ['MATHS_HINT', 'TOO_HOT', 'COOL_IT']) {
    const [, text] = source.match(new RegExp(`const ${constant} = '([^']+)'`));
    const line = known.get(text);
    assert.ok(line, text);
    assert.match(line.ka, /[Ⴀ-ჿ]/, text);
    for (const language of ['en', 'ka']) {
      assert.ok(existsSync(new URL(`../../core/audio/voice/${language}/${line.id}.ogg`, import.meta.url)), `${language}/${line.id}.ogg`);
    }
  }
});

/* ---------- levels ---------- */

const LEVEL_NUMBERS = Array.from({ length: 10 }, (_, index) => index + 1);
// For each thing a level changes, which way is harder.
const HARDER = { rise: 1, every: -1, most: 1, wanderers: 1, stars: 1, pairs: 1, breeze: 1, answers: 1 };

test('level 1 is Balloon Pop as it always was', () => {
  assert.deepEqual(PACES, {
    slow: { rise: 0.085, every: 1.05, most: 7 },
    medium: { rise: 0.115, every: 0.8, most: 9 },
    fast: { rise: 0.16, every: 0.6, most: 11 },
  });
  assert.equal(WANDERER_CHANCE, 0.25);
  assert.deepEqual(balloonLevel(1), { rise: 1, every: 1, most: 0, wanderers: 0.25, stars: 0, pairs: 0, breeze: 0, answers: 0 });
  for (const kind of Object.keys(LEVELS)) assert.equal(new MathsDeck(kind, Math.random, { extra: balloonLevel(1).answers }).choices, LEVELS[kind].choices);
});

test('each level is the same or harder than the one before in every way, and harder in at least one', () => {
  assert.deepEqual(Object.keys(balloonLevel(1)).sort(), Object.keys(HARDER).sort());
  for (const level of LEVEL_NUMBERS.slice(1)) {
    const before = balloonLevel(level - 1);
    const now = balloonLevel(level);
    let harder = 0;
    for (const [key, way] of Object.entries(HARDER)) {
      assert.ok((now[key] - before[key]) * way >= 0, `level ${level}: ${key} got easier`);
      if ((now[key] - before[key]) * way > 0) harder += 1;
    }
    assert.ok(harder > 0, `level ${level} is no harder than ${level - 1}`);
  }
});

test('new kinds of balloon come along from about level 4, and level 10 has them all', () => {
  assert.equal(balloonLevel(3).stars + balloonLevel(3).pairs + balloonLevel(3).breeze, 0);
  assert.ok(balloonLevel(4).stars > 0);
  assert.ok(balloonLevel(5).pairs > 0);
  assert.ok(balloonLevel(7).breeze > 0);
  const top = balloonLevel(10);
  assert.ok(top.stars > 0 && top.pairs > 0 && top.breeze > 0 && top.answers > 0);
});

test('even level 10 stays doable: time to reach, balloons a minute, and the length of a game', () => {
  for (const pace of Object.keys(PACES)) {
    // Each balloon is on the screen for at least 70% of the time it was at level 1.
    assert.ok(secondsOnScreen(pace, 10) >= 0.7 * secondsOnScreen(pace, 1), pace);
    // No more than twice as many balloons a minute to reach for.
    assert.ok(balloonsPerMinute(pace, 10) <= 2 * balloonsPerMinute(pace, 1), pace);
  }
  // How many to pop is the grown-up's, so a game only gets longer by the moments star balloons are held,
  // which is a few seconds over a game, well under a third of it.
  const balloonsToPop = 20;
  const levelOneSeconds = balloonsToPop * (60 / balloonsPerMinute('fast', 1));
  const extraSeconds = balloonsToPop * balloonLevel(10).stars * STAR_HOLD_SECONDS;
  assert.ok(extraSeconds < levelOneSeconds / 3);
  // A breeze can't carry a balloon far: less than a twentieth of the screen each way.
  assert.ok(balloonLevel(10).breeze <= 0.05);
});

test('the maths challenge has a few more answers to choose from at higher levels, never more than fit', () => {
  for (const [kind, { choices, questions }] of Object.entries(LEVELS)) {
    const counts = LEVEL_NUMBERS.map((level) => new MathsDeck(kind, Math.random, { extra: balloonLevel(level).answers, most: MOST_ANSWERS }).choices);
    assert.equal(counts[0], choices);
    assert.ok(counts.every((count, index) => index === 0 || count >= counts[index - 1]));
    assert.ok(counts[9] > choices && counts[9] <= MOST_ANSWERS, `${kind}: ${counts}`);
    // Every question still has that many different answers, with the right one among them.
    for (const question of questions) {
      const answers = answersFor(question, counts[9]);
      assert.equal(new Set(answers).size, counts[9], question.id);
      assert.ok(answers.includes(question.answer) && answers.every((value) => value > 0), question.id);
    }
  }
});
