// The story of Joze's Long Walk Home. Joze got lost following a butterfly, and his family are at the
// watering hole. It's a long way, and he gets hungry at every stop. Each fruit the child picks and
// feeds him gets him closer to home. There's no screen in this file, so it runs in the unit tests.
import { clampLevel, ramp, stepsAt } from '../../core/levels.js';

// Each stop: the place, what grows there, how many it takes, who's there, and what they say.
export const STOPS = [
  { place: 'baobab', fruit: 'fig', count: 3, who: 'joze', hello: 'I’m lost, and so hungry! Figs, please!' },
  { place: 'grass', fruit: 'mango', count: 3, who: 'mochi', hello: 'Your family went this way! Take some mangoes!' },
  { place: 'river', fruit: 'banana', count: 4, who: 'bramble', hello: 'It’s a long way round. Eat up, little one.' },
  { place: 'hill', fruit: 'apple', count: 4, who: 'tur', hello: 'You can see home from here! Have some apples!' },
  {
    place: 'home',
    fruit: 'orange',
    count: 3,
    who: 'joze',
    hello: 'Mum! Dad! I’m home! Oranges for everyone!',
    done: 'Thank you for bringing me home!',
  },
];

const FALSE_START_SECONDS = 0.15; // A closed hand has to stay closed this long to pick something.

// Which stops get one more fruit to eat as the levels go up, in this order: the long ones in the middle.
const HUNGRIER_AT = ['river', 'hill', 'grass'];

// Gifts Joze takes home to his family, picked up on the way: a golden fruit he's eaten, a flower from a
// butterfly that's been shooed off, a coconut from the monkey, and fireflies caught.
export const GIFTS = ['golden', 'flower', 'coconut', 'firefly'];

/**
 * What each level brings that's new, with a picture and a name in each language. The level each
 * comes in is in NEW_AT, and walkAt switches it on there.
 */
export const NEW_THINGS = {
  golden: { mark: '🌟', name: 'Golden fruit', nameKa: 'ოქროს ხილი' },
  wind: { mark: '🍃', name: 'Windy branches', nameKa: 'ქარიანი ტოტები' },
  butterflies: { mark: '🦋', name: 'Butterflies', nameKa: 'პეპლები' },
  green: { mark: '🍏', name: 'Green fruit', nameKa: 'მწვანე ხილი' },
  basket: { mark: '🧺', name: 'Basket', nameKa: 'კალათა' },
  monkey: { mark: '🐒', name: 'Cheeky monkey', nameKa: 'ცელქი მაიმუნი' },
  bridge: { mark: '🌉', name: 'Broken bridge', nameKa: 'გატეხილი ხიდი' },
  frost: { mark: '❄️', name: 'Frosty fruit', nameKa: 'გაყინული ხილი' },
  fireflies: { mark: '✨', name: 'Fireflies', nameKa: 'ციცინათელები' },
  parrot: { mark: '🦜', name: 'Parrot helper', nameKa: 'თუთიყუში მეგობარი' },
};

export const NEW_AT = {
  2: ['golden'],
  3: ['wind', 'butterflies'],
  4: ['green'],
  5: ['basket'],
  6: ['monkey'],
  7: ['bridge'],
  8: ['frost'],
  9: ['fireflies'],
  10: ['parrot'],
};

/** What's new at a level, as the title card and the countdown show it. Nothing at level 1. */
export function newAt(level) {
  return (NEW_AT[clampLevel(level)] ?? []).map((key) => ({ key, ...NEW_THINGS[key] }));
}

/**
 * What each level of the walk brings, from 1 to 10. Level 1 is the walk as it always was. Nothing here
 * has a time limit, and nothing can be lost: green fruit, frost, butterflies and the monkey only mean
 * choosing another fruit, there's always a ripe one free, and missing a gift costs nothing. How close
 * the tree is stays the grown-ups' choice. Each level brings something new: see NEW_AT.
 */
export function walkAt(level) {
  return {
    // Stops where Joze is hungrier and eats one more: none at level 1, then one, then two.
    hungrier: stepsAt(level, { 1: 0, 2: 1, 6: 2 }),
    // Seconds walking from one tree to the next: a little quicker each level.
    walkSeconds: ramp(level, 2.8, 2.2),
    // From level 2, one fruit on each tree is golden. Feeding it to Joze is a gift for his family too.
    golden: stepsAt(level, { 1: 0, 2: 1 }),
    // From level 3, the fruit sways on its branch in the wind, this far either way, in screen widths.
    sway: level >= 3 ? ramp(level, 0.004, 0.022) : 0,
    // How quickly it sways, as radians a second: about four seconds a sway, down to under three.
    swayRate: ramp(level, 1.6, 2.4),
    // From level 3, a butterfly comes and sits on a ripe fruit now and then. That one can't be picked
    // until it flies off, which it does when an open hand comes near, leaving a flower as a gift, or
    // by itself after a while.
    butterflies: level >= 3,
    butterflyEvery: ramp(level, 8, 5),
    butterflyStays: ramp(level, 3, 4.5),
    // From level 4, green fruit that isn't ripe yet hangs among the ripe ones. It can't be picked
    // until it ripens, which it does by itself after a while, so it's about choosing.
    unripe: stepsAt(level, { 1: 0, 4: 1, 6: 2 }),
    ripenSeconds: ramp(level, 6, 9),
    // From level 5, a basket hangs on the tree at these stops, counted from 0. Closing a hand on it
    // takes it, and then the next fruit picked brings another with it, so two are fed at once.
    baskets: stepsAt(level, { 1: [], 5: [1], 9: [1, 3] }),
    // From level 6, from the second stop on, a cheeky monkey takes a ripe fruit now and then and
    // scampers about the tree with it. Closing a hand on his fruit takes it, and he throws down a
    // coconut as a gift. He gives it back by himself after a while.
    monkey: level >= 6,
    monkeyEvery: ramp(level, 12, 9),
    monkeyStays: ramp(level, 6, 8),
    // From level 7, the bridge at the river has a plank missing. Carrying the plank to the gap and
    // opening the hand there mends it, so Joze can cross.
    bridge: level >= 7,
    // From level 8, the hill is snowy, and some fruit on its tree is frosty. A closed hand held on a
    // frosty fruit warms it, adding up however the hand comes and goes, and then it can be picked.
    frost: stepsAt(level, { 1: 0, 8: 2 }),
    thawSeconds: ramp(level, 0.8, 1.1),
    // From level 9, it's evening from the hill on, and fireflies drift about the tree. Closing a
    // hand on one catches it, as a gift.
    fireflies: stepsAt(level, { 1: 0, 9: 2 }),
    // At level 10, a parrot's feather hangs on the first tree. Closing a hand on it brings the
    // parrot, who carries a fruit to Joze by himself.
    parrot: level >= 10,
  };
}

/** The stops on the way home at a level, with how many each needs. */
export function stopsAt(level) {
  const hungrier = HUNGRIER_AT.slice(0, walkAt(level).hungrier);
  return STOPS.map((stop) => (hungrier.includes(stop.place) ? { ...stop, count: stop.count + 1 } : stop));
}

/** What a stop has at a level, besides its fruit. index counts from 0. */
export function featuresAt(level, index) {
  const at = walkAt(level);
  const { place } = STOPS[index];
  return {
    golden: at.golden,
    basket: at.baskets.includes(index),
    monkey: at.monkey && index >= 1,
    bridge: at.bridge && place === 'river',
    frost: place === 'hill' ? at.frost : 0,
    snowy: place === 'hill' && at.frost > 0,
    fireflies: place === 'hill' || place === 'home' ? at.fireflies : 0,
    evening: (place === 'hill' || place === 'home') && at.fireflies > 0,
    parrot: at.parrot && index === 0,
  };
}

/**
 * A frosty fruit warmed by a closed hand held on it, for dt seconds. The warmth adds up and is never
 * lost. Returns whether it's thawed.
 */
export function warm(fruit, dt, seconds) {
  if (!fruit.frost) return true;
  fruit.warmth = Math.min(seconds, (fruit.warmth ?? 0) + dt);
  if (fruit.warmth >= seconds) fruit.frost = false;
  return !fruit.frost;
}

export class Journey {
  constructor({ level = 1, onEvent = () => {} } = {}) {
    this.onEvent = onEvent;
    this.levelNumber = clampLevel(level);
    this.stops = stopsAt(level);
    this.level = walkAt(level);
    this.index = -1;
    this.fed = 0;
    this.bridgeFixed = true;
    this.gifts = 0;
    this.stats = { fed: 0, dropped: 0, gifts: 0, golden: 0, flower: 0, coconut: 0, firefly: 0, baskets: 0, parrots: 0 };
  }

  get stop() {
    return this.stops[this.index] ?? null;
  }

  get over() {
    return this.index >= this.stops.length;
  }

  /** What this stop has besides its fruit: see featuresAt. */
  get features() {
    return this.stop ? featuresAt(this.levelNumber, this.index) : null;
  }

  /** How far along the whole way home he's come, from 0 to 1. */
  get progress() {
    const stops = Math.max(0, this.index);
    const atThisOne = this.stop ? this.fed / this.stop.count : 0;
    return Math.min(1, (stops + atThisOne) / this.stops.length);
  }

  /** How many more fruit he wants at this stop. */
  get wanted() {
    return this.stop ? Math.max(0, this.stop.count - this.fed) : 0;
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  nextStop() {
    this.index += 1;
    this.fed = 0;
    if (this.over) {
      this.emit('home');
      return;
    }
    this.bridgeFixed = !this.features.bridge;
    this.emit('stop', { stop: this.stop, index: this.index, total: this.stops.length, features: this.features });
  }

  /** Fruit went into Joze's mouth: one, or two from a basket. golden says how many were golden. */
  feed(count = 1, { golden = 0 } = {}) {
    if (!this.stop) return;
    // A golden fruit is a gift for his family whenever it's eaten, even once he's had enough here, as it's
    // shown going up to the count of gifts.
    for (let i = 0; i < golden; i += 1) this.gift('golden');
    if (this.fed >= this.stop.count) return;
    const eaten = Math.min(count, this.wanted);
    this.fed += eaten;
    this.stats.fed += eaten;
    this.emit('fed', { fed: this.fed, count: this.stop.count });
    this.checkDone();
  }

  /** The plank is in the gap, and the bridge is mended. */
  fixBridge() {
    if (this.bridgeFixed) return;
    this.bridgeFixed = true;
    this.emit('bridge-fixed');
    this.checkDone();
  }

  checkDone() {
    if (this.stop && this.fed >= this.stop.count && this.bridgeFixed) this.emit('stop-done', { stop: this.stop });
  }

  /** A gift for Joze's family, picked up on the way. */
  gift(kind) {
    this.gifts += 1;
    this.stats.gifts += 1;
    this.stats[kind] += 1;
    this.emit('gift', { kind, gifts: this.gifts });
  }

  /** A fruit was let go of somewhere else. It costs nothing, and goes back on the tree. */
  dropped() {
    this.stats.dropped += 1;
    this.emit('dropped');
  }
}

/**
 * What happens to a fruit as a hand comes and goes, frame by frame. It's kept apart from the drawing
 * so it can be tested: a closed hand on a fruit picks it, it goes where the hand goes, and opening the
 * hand lets it go, into Joze's mouth if that's where it is.
 */
export class Picking {
  constructor() {
    this.held = null;
    this.closedFor = 0;
  }

  /** near is the fruit the hand is on, if any. Returns 'picked', 'fed', 'dropped' or null. */
  update(dt, { closed, seen, near, onMouth }) {
    if (!seen) {
      // A hand that has gone from the picture has let go of what it had, as it can't be seen.
      this.closedFor = 0;
      if (!this.held) return null;
      this.held = null;
      return 'dropped';
    }
    if (this.held) {
      if (closed) return null;
      this.held = null;
      return onMouth ? 'fed' : 'dropped';
    }
    this.closedFor = closed && near ? this.closedFor + dt : 0;
    if (this.closedFor >= FALSE_START_SECONDS) {
      this.held = near;
      this.closedFor = 0;
      return 'picked';
    }
    return null;
  }
}
