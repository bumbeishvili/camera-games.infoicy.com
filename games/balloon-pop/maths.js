// The maths challenge in Balloon Pop, which a grown-up can turn on. No screen in this file.

const range = (low, high) => Array.from({ length: high - low + 1 }, (_, index) => low + index);

const adding = (limit) => range(1, 10).flatMap((a) => range(1, 10)
  .filter((b) => a + b <= limit)
  .map((b) => ({ id: `add-${a}-${b}`, a, b, shown: `${a} + ${b}`, answer: a + b })));

const takingAway = () => range(2, 20).flatMap((a) => range(1, Math.min(a - 1, 10))
  .map((b) => ({ id: `take-${a}-${b}`, a, b, shown: `${a} − ${b}`, answer: a - b })));

const timesTables = () => range(2, 10).flatMap((a) => range(2, 10)
  .map((b) => ({ id: `times-${a}-${b}`, a, b, shown: `${a} × ${b}`, answer: a * b })));

// Fewer balloons make it easier, as there are fewer wrong ones to reach past.
export const LEVELS = {
  add: { choices: 3, questions: adding(10) },
  addTake: { choices: 4, questions: [...adding(20), ...takingAway()] },
  times: { choices: 4, questions: timesTables() },
};

const shuffled = (list, random) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** The right answer and some near it, in any order, so it can't be spotted without working it out. */
export function answersFor({ id, a, b, answer }, count, random = Math.random) {
  const near = [answer + 1, answer - 1, answer + 2, answer - 2, answer + 3, answer - 3, answer + 4];
  // The wrong answers times tables really do produce are the neighbouring ones.
  const tables = id.startsWith('times') ? [a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b] : [];
  const wrong = [...new Set([...shuffled(tables, random), ...shuffled(near, random)])]
    .filter((value) => value > 0 && value !== answer)
    .slice(0, count - 1);
  return shuffled([answer, ...wrong], random);
}

/** Questions in a shuffled order, none twice until they've all been asked. */
export class MathsDeck {
  constructor(level, random = Math.random) {
    this.level = LEVELS[level];
    this.random = random;
    this.left = [];
  }

  next() {
    if (!this.left.length) this.left = shuffled(this.level.questions, this.random);
    const question = this.left.pop();
    return { ...question, answers: answersFor(question, this.level.choices, this.random) };
  }
}
