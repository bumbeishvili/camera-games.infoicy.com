// The story of Joze's Long Walk Home. Joze got lost following a butterfly, and his family are at the
// watering hole. It's a long way, and he gets hungry at every stop. Each fruit the child picks and
// feeds him gets him closer to home. There's no screen in this file, so it runs in the unit tests.

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

export class Journey {
  constructor({ onEvent = () => {} } = {}) {
    this.onEvent = onEvent;
    this.index = -1;
    this.fed = 0;
    this.stats = { fed: 0, dropped: 0 };
  }

  get stop() {
    return STOPS[this.index] ?? null;
  }

  get over() {
    return this.index >= STOPS.length;
  }

  /** How far along the whole way home he's come, from 0 to 1. */
  get progress() {
    const stops = Math.max(0, this.index);
    const atThisOne = this.stop ? this.fed / this.stop.count : 0;
    return Math.min(1, (stops + atThisOne) / STOPS.length);
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  nextStop() {
    this.index += 1;
    this.fed = 0;
    if (this.over) this.emit('home');
    else this.emit('stop', { stop: this.stop, index: this.index, total: STOPS.length });
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
