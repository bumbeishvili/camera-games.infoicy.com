// The parts of Balloon Pop that can be checked without a screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { toScreen } from '../../games/balloon-pop/balloons.js';
import { LEVELS, MathsDeck, answersFor } from '../../games/balloon-pop/maths.js';

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
