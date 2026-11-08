// The story of Joze's Long Walk Home. Joze got lost following a butterfly, and his family are at the
// watering hole. It's a long way, and he gets hungry at every stop. Each fruit the child picks and
// feeds him gets him closer to home. There's no screen in this file, so it runs in the unit tests.
import { ramp, stepsAt } from '../../core/levels.js';

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

/**
 * What each level of the walk brings, from 1 to 10. Level 1 is the walk as it always was. Nothing here
 * has a time limit, and nothing can be lost: green fruit and butterflies only mean choosing another
 * fruit, and there's always a ripe one free. How close the tree is stays the grown-ups' choice.
 */
export function walkAt(level) {
  return {
    // Stops where Joze is hungrier and eats one more: none at level 1, then one, then two.
    hungrier: stepsAt(level, { 1: 0, 2: 1, 6: 2 }),
    // Seconds walking from one tree to the next: a little quicker each level.
    walkSeconds: ramp(level, 2.8, 2.2),
    // From level 3, the fruit sways on its branch in the wind, this far either way, in screen widths.
    sway: level >= 3 ? ramp(level, 0.004, 0.022) : 0,
    // How quickly it sways, as radians a second: about four seconds a sway, down to under three.
    swayRate: ramp(level, 1.6, 2.4),
    // From level 4, green fruit that isn't ripe yet hangs among the ripe ones. It can't be picked
    // until it ripens, which it does by itself after a while, so it's about choosing.
    unripe: stepsAt(level, { 1: 0, 4: 1, 6: 2 }),
    ripenSeconds: ramp(level, 6, 9),
    // From level 7, a butterfly comes and sits on a ripe fruit now and then. That one can't be picked
    // until it flies off, which it does when an open hand comes near, or by itself after a while.
    butterflies: level >= 7,
    butterflyEvery: ramp(level, 8, 5),
    butterflyStays: ramp(level, 3, 4.5),
  };
}

/** The stops on the way home at a level, with how many each needs. */
export function stopsAt(level) {
  const hungrier = HUNGRIER_AT.slice(0, walkAt(level).hungrier);
  return STOPS.map((stop) => (hungrier.includes(stop.place) ? { ...stop, count: stop.count + 1 } : stop));
}

export class Journey {
  constructor({ level = 1, onEvent = () => {} } = {}) {
    this.onEvent = onEvent;
    this.stops = stopsAt(level);
    this.level = walkAt(level);
    this.index = -1;
    this.fed = 0;
    this.stats = { fed: 0, dropped: 0 };
  }

  get stop() {
    return this.stops[this.index] ?? null;
  }

  get over() {
    return this.index >= this.stops.length;
  }

  /** How far along the whole way home he's come, from 0 to 1. */
  get progress() {
    const stops = Math.max(0, this.index);
    const atThisOne = this.stop ? this.fed / this.stop.count : 0;
    return Math.min(1, (stops + atThisOne) / this.stops.length);
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  nextStop() {
    this.index += 1;
    this.fed = 0;
    if (this.over) this.emit('home');
    else this.emit('stop', { stop: this.stop, index: this.index, total: this.stops.length });
  }

  /** A fruit went into Joze's mouth. */
  feed() {
    this.fed += 1;
    this.stats.fed += 1;
    this.emit('fed', { fed: this.fed, count: this.stop.count });
    if (this.fed >= this.stop.count) this.emit('stop-done', { stop: this.stop });
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
