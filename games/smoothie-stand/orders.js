// The story and rules of Joze's Smoothie Stand. It's the day of the Harvest Fair, and everyone has
// come to Joze's stand with an order. Whatever they asked for is what's worth slicing. There's no
// screen in this file, so it runs in the unit tests.
import { ramp, rampWhole, stepsAt } from '../../core/levels.js';

export const FRUITS = ['apple', 'orange', 'banana', 'pear', 'plum', 'peach'];

// Who comes, in order, and what they want. rotten is from when someone has hidden bad fruit in the
// baskets. The words are spoken by each character: see audio/voice/lines.json.
export const DAY = [
  { who: 'truffle', order: { apple: 4 }, hello: 'Four apples, please!' },
  { who: 'mochi', order: { orange: 5 }, hello: 'Five oranges, please!' },
  { who: 'frost', order: { pear: 4, orange: 3 }, hello: 'Four pears and three oranges, please!' },
  { who: 'widget', order: { banana: 6 }, hello: 'Six bananas, please! Beep!' },
  { who: 'kit', order: { peach: 5 }, rotten: true, hello: 'Five peaches! Watch out for rotten fruit!' },
  {
    who: 'bramble',
    order: { apple: 4, banana: 4, plum: 4 },
    rotten: true,
    hello: 'Four apples, four bananas and four plums, please!',
    thanks: 'The Golden Cup goes to Joze’s stand!',
  },
];

const SHORT_DAY = ['truffle', 'kit', 'bramble'];
const MOST_WITHOUT_WANTED = 2; // Never more than this in a row that isn't on the order, at any level.

/**
 * What each level of the fair brings, from 1 to 10. Level 1 is the fair as it always was. The orders
 * are what the customers say, so they stay the same, and so do the grown-ups' choices: how fast the
 * fruit flies, how to slice, and how many customers. A level only goes on top of those.
 */
export function fairAt(level) {
  return {
    // Fruit falls back a little quicker: gravity times this. At level 10 it's still in the air 88% as long.
    gravity: ramp(level, 1, 1.3),
    // Throws come a little more often: the time between them, times this.
    every: ramp(level, 1, 0.8),
    // More in a throw, from level 3: one more at most.
    volley: stepsAt(level, { 1: 0, 3: 1 }),
    // And more up at once.
    most: rampWhole(level, 0, 3),
    // How much of what comes up is on the order. Less at higher levels, but with more coming up, at least
    // as much that's wanted comes up every second, at any pace, so nobody waits longer for it.
    wantedShare: ramp(level, 0.6, 0.5),
    // Rotten fruit, for how many of the last customers: the last two at level 1, then earlier.
    rottenLast: stepsAt(level, { 1: 2, 3: 3, 5: 4, 8: 6 }),
    rottenShare: ramp(level, 0.14, 0.2),
    // From level 4, some fruit is thrown across, from one side to the other, rather than straight up.
    across: stepsAt(level, { 1: 0, 4: 0.2, 6: 0.3, 9: 0.4 }),
    // From level 6, a rotten one sometimes comes up right beside something on the order.
    pairs: stepsAt(level, { 1: 0, 6: 0.15, 9: 0.25 }),
    // From level 8, some fruit on the order is tough: the first swipe cracks it, and the second slices it.
    tough: stepsAt(level, { 1: 0, 8: 0.15, 10: 0.2 }),
  };
}

export class Stand {
  /** short is a shorter day, with only three customers. */
  constructor({ short = false, level = 1, random = Math.random, onEvent = () => {} } = {}) {
    this.customers = short ? DAY.filter(({ who }) => SHORT_DAY.includes(who)) : DAY;
    this.level = fairAt(level);
    this.random = random;
    this.onEvent = onEvent;
    this.index = -1;
    this.left = {};
    this.sinceWanted = 0;
    this.stats = { smoothies: 0, wanted: 0, extra: 0, rotten: 0 };
  }

  get customer() {
    return this.customers[this.index] ?? null;
  }

  get over() {
    return this.index >= this.customers.length;
  }

  /** Whether this customer's baskets have rotten fruit in them. */
  get rotten() {
    return this.index >= this.customers.length - this.level.rottenLast;
  }

  get wantedKinds() {
    return Object.keys(this.left).filter((kind) => this.left[kind] > 0);
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  nextCustomer() {
    this.index += 1;
    this.sinceWanted = 0;
    if (this.over) {
      this.left = {};
      this.emit('day-over');
      return;
    }
    this.left = { ...this.customer.order };
    this.emit('customer', { customer: this.customer, index: this.index, total: this.customers.length });
  }

  /** What to throw up next. There's always something on the order coming before long. */
  nextFruit() {
    const { customer, random } = this;
    const { wantedShare, rottenShare } = this.level;
    const wanted = this.wantedKinds;
    const roll = random();
    if (wanted.length && (roll < wantedShare || this.sinceWanted >= MOST_WITHOUT_WANTED)) {
      this.sinceWanted = 0;
      return wanted[Math.floor(random() * wanted.length)];
    }
    this.sinceWanted += 1;
    if (customer && this.rotten && roll < wantedShare + rottenShare) return 'rotten';
    const others = FRUITS.filter((kind) => !wanted.includes(kind));
    return others[Math.floor(random() * others.length)];
  }

  /**
   * The next throw: what's in it, and how, from the higher levels. across is thrown from one side to
   * the other, tough takes two swipes, and withRotten has a rotten one right beside it. At level 1
   * this is only ever nextFruit().
   */
  nextThrow() {
    const kind = this.nextFruit();
    const { random, level } = this;
    const throwing = { kind, across: false, tough: false, withRotten: false };
    const wanted = this.left[kind] > 0;
    if (level.across) throwing.across = random() < level.across;
    if (level.tough && wanted) throwing.tough = random() < level.tough;
    if (level.pairs && wanted && this.rotten) throwing.withRotten = random() < level.pairs;
    return throwing;
  }

  /** A fruit has been sliced. Returns 'wanted', 'extra' or 'rotten'. */
  slice(kind) {
    if (kind === 'rotten') {
      this.stats.rotten += 1;
      this.emit('rotten');
      return 'rotten';
    }
    if (!(this.left[kind] > 0)) {
      this.stats.extra += 1;
      this.emit('extra', { kind });
      return 'extra';
    }
    this.left[kind] -= 1;
    this.stats.wanted += 1;
    this.emit('wanted', { kind, left: this.left[kind] });
    if (!this.wantedKinds.length) {
      this.stats.smoothies += 1;
      this.emit('order-done', { customer: this.customer });
    }
    return 'wanted';
  }
}

/** The nearest a moving hand came to a point, between where it was and where it is. */
export function nearestOnPath(fromX, fromY, toX, toY, x, y) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(x - toX, y - toY);
  const along = Math.max(0, Math.min(1, ((x - fromX) * dx + (y - fromY) * dy) / lengthSquared));
  return Math.hypot(x - (fromX + dx * along), y - (fromY + dy * along));
}
