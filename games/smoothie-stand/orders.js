// The story and rules of Joze's Smoothie Stand. It's the day of the Harvest Fair, and everyone has
// come to Joze's stand with an order. Whatever they asked for is what's worth slicing. There's no
// screen in this file, so it runs in the unit tests.

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
const WANTED_SHARE = 0.6; // How much of what comes up is wanted. The rest is there to choose from.
const ROTTEN_SHARE = 0.14;
const MOST_WITHOUT_WANTED = 2; // Never more than this in a row that isn't on the order.

export class Stand {
  /** short is a shorter day, with only three customers. */
  constructor({ short = false, random = Math.random, onEvent = () => {} } = {}) {
    this.customers = short ? DAY.filter(({ who }) => SHORT_DAY.includes(who)) : DAY;
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
    const wanted = this.wantedKinds;
    const roll = random();
    if (wanted.length && (roll < WANTED_SHARE || this.sinceWanted >= MOST_WITHOUT_WANTED)) {
      this.sinceWanted = 0;
      return wanted[Math.floor(random() * wanted.length)];
    }
    this.sinceWanted += 1;
    if (customer?.rotten && roll < WANTED_SHARE + ROTTEN_SHARE) return 'rotten';
    const others = FRUITS.filter((kind) => !wanted.includes(kind));
    return others[Math.floor(random() * others.length)];
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
