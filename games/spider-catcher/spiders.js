// The story and rules of Spider Catcher. Joze's little spider friends have run off all over the garden,
// and the child brings them home: a hand that opens near a spider and closes on it picks it up, it's
// carried to its web, and opening the hand over the web lets it in. Each spider home makes its web a
// little fuller. There's no screen in this file, so it runs in the unit tests.
//
// Lengths are in screen heights, times in seconds, so the game is the same on any screen.
import { ramp, stepsAt } from '../../core/levels.js';

// Each place in the garden: how many spiders live in its web, who's there, and what they say.
export const PLACES = [
  { place: 'gate', count: 3, who: 'joze', hello: 'My little spiders ran off! Please bring them home!' },
  { place: 'carrots', count: 3, who: 'mochi', hello: 'Spiders in my carrots! Help them home!' },
  { place: 'honey', count: 4, who: 'bramble', hello: 'One is swinging from my honey tree!' },
  { place: 'pond', count: 4, who: 'frost', hello: 'They’re playing by the pond. Catch them!' },
  {
    place: 'house',
    count: 3,
    who: 'joze',
    hello: 'The last ones! Then everyone is home!',
    done: 'Thank you! All my spiders are home!',
  },
];

// Which places get one more spider as the levels go up, in this order: the long ones in the middle.
const MORE_AT = ['honey', 'pond'];

/**
 * What each level brings, from 1 to 10. Nothing here has a time limit, and nothing can be lost: a
 * spider let go of anywhere but its web just scuttles back to playing, at no cost. How far there is to
 * reach is the grown-ups' choice, under How far to reach, and no level changes it.
 */
export function gardenAt(level) {
  return {
    // Places with one more spider to bring home: none at level 1, then one, then two.
    more: stepsAt(level, { 1: 0, 3: 1, 8: 2 }),
    // How many are out playing at once, while there are that many still to bring home.
    atOnce: stepsAt(level, { 1: 2, 3: 3, 6: 4 }),
    // The fastest a spider ever goes, in screen heights a second. At most 1.35 times level 1's.
    speed: ramp(level, 0.07, 0.094),
    // How far a scuttling spider goes either side of the middle of its path.
    wander: ramp(level, 0.09, 0.13),
    // How far a spider on its thread swings up and down, either side of the middle.
    swing: ramp(level, 0.05, 0.1),
    // How twisty a path is: 1 goes round in a loop, 2 is a figure of eight, 3 a pretzel.
    twist: stepsAt(level, { 1: 1, 3: 2, 8: 3 }),
    // From level 4, the web sways slowly on its branch, this far either way, in screen heights.
    webSway: level >= 4 ? ramp(level, 0.02, 0.06) : 0,
    // From level 5, some spiders are shy: the first time a hand comes near, they scuttle a little way
    // off. After that they can be caught like any other. This is the share of them that are shy.
    shy: stepsAt(level, { 1: 0, 5: 0.34, 8: 0.5 }),
    // From level 7, some spiders come in twos, holding hands, to bring home one after the other.
    pairs: stepsAt(level, { 1: 0, 7: 1, 9: 2 }),
  };
}

/** The places at a level, with how many spiders each needs. */
export function placesAt(level) {
  const more = MORE_AT.slice(0, gardenAt(level).more);
  return PLACES.map((place) => (more.includes(place.place) ? { ...place, count: place.count + 1 } : place));
}

// How far a closed hand can be from a spider and still catch it, in palm lengths, beyond the spider.
export const CATCH_REACH = 1.2;
// How far a spider's body reaches from its middle, as a share of the screen's height.
export const SPIDER_SIZE = 0.05;
// How close to the middle of the web the hand has to be when it opens, as a share of the screen's height.
export const WEB_REACH = 0.2;
// A closed hand catches for this long after it was last seen open, so it has to close on a spider,
// and a fist that's just held still can't collect spiders as they go by.
export const GRAB_WINDOW = 1.2;
// A hand has to be closed by a spider this long to catch it, so one flicker of the tracker can't.
const FALSE_START = 0.1;
// A shy spider's dash: how far, and how long it takes.
export const DASH = { distance: 0.15, seconds: 0.8 };
// How long a web takes to sway each way and back, in seconds.
export const WEB_SWAY_SECONDS = 10;

/**
 * A spider's path: where it goes round, given the middle of it and the level. kind is 'scuttle' for one
 * running about on the leaves, and 'dangle' for one swinging on its thread from the branch above.
 * Paths are smooth loops, and the speed is set so that nowhere on one is faster than the level's speed.
 */
export function pathFor({ kind, centre, phase = 0, level }) {
  const { wander, swing, twist, speed } = gardenAt(level);
  // A dangling spider's thread slides along the branch slowly while it swings up and down.
  const [ax, ay] = kind === 'dangle' ? [wander * 0.45, swing] : [wander, wander * 0.6];
  const k = kind === 'dangle' ? Math.min(twist, 2) : twist;
  // The fastest anywhere on the loop is at most this many times its rate of going round.
  const fastest = Math.hypot(ax, k * ay);
  return { kind, cx: centre.x, cy: centre.y, ax, ay, k, rate: speed / fastest, phase, phaseY: phase * 0.7 + 1.1 };
}

/** Where a spider on a path is after t seconds, relative to the middle of its garden. */
export function spiderAt(path, t) {
  const turn = path.rate * t + path.phase;
  return {
    x: path.cx + path.ax * Math.sin(turn),
    y: path.cy + path.ay * Math.sin(path.k * turn + path.phaseY),
  };
}

/** Where the middle of the web is, relative to where it hangs, after t seconds. */
export function webAt(sway, t, reducedMotion = false) {
  const far = sway * (reducedMotion ? 0.5 : 1);
  const turn = (t / WEB_SWAY_SECONDS) * Math.PI * 2;
  return { x: far * Math.sin(turn), y: far * 0.35 * Math.sin(turn * 1.6 + 0.8) };
}

// Where the middles of spiders' paths are in their part of the garden, so they spread out.
const SPOTS = [[-0.1, 0.1], [0.1, -0.1], [0.12, 0.13], [-0.12, -0.12], [0, 0], [0, -0.15], [0, 0.15]];

/**
 * Who's coming out to play at a place, in order, for a level. Every other one swings on its thread.
 * Each pair is two spiders on one path, one just behind the other.
 */
export function spidersFor(count, level, random = Math.random) {
  const { pairs, shy } = gardenAt(level);
  const spiders = [];
  let pairsLeft = pairs;
  // Starting halfway, so the first shy one comes early on, not only at the end.
  let shyOwed = shy > 0 ? 0.5 : 0;
  for (let index = 0; spiders.length < count; index += 1) {
    const kind = index % 2 ? 'dangle' : 'scuttle';
    const twins = pairsLeft > 0 && count - spiders.length >= 2 && index % 3 === 1;
    if (twins) pairsLeft -= 1;
    // Shy ones are spread out evenly, so a level's share of them always comes round.
    shyOwed += shy;
    const isShy = !twins && shyOwed >= 1 - 1e-9;
    if (isShy) shyOwed -= 1;
    const pair = twins ? index : null;
    spiders.push({ kind, shy: isShy, pair, colour: spiders.length, phase: random() * Math.PI * 2 });
    if (twins) spiders.push({ kind, shy: false, pair, colour: spiders.length, phase: null, behind: true });
  }
  return spiders.slice(0, count);
}

export const spotFor = (index) => {
  const [x, y] = SPOTS[index % SPOTS.length];
  return { x, y };
};

/** The whole game: from one place in the garden to the next, until every spider is home. */
export class Gathering {
  constructor({ level = 1, onEvent = () => {} } = {}) {
    this.onEvent = onEvent;
    this.places = placesAt(level);
    this.level = gardenAt(level);
    this.index = -1;
    this.home = 0;
    this.stats = { home: 0, letGo: 0 };
  }

  get place() {
    return this.places[this.index] ?? null;
  }

  get over() {
    return this.index >= this.places.length;
  }

  get total() {
    return this.places.reduce((sum, { count }) => sum + count, 0);
  }

  /** How many spiders are home, of all of them, from 0 to 1. */
  get progress() {
    return Math.min(1, this.stats.home / this.total);
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  nextPlace() {
    this.index += 1;
    this.home = 0;
    if (this.over) this.emit('all-home');
    else this.emit('place', { place: this.place, index: this.index, total: this.places.length });
  }

  /** A spider went into its web. */
  spiderHome() {
    this.home += 1;
    this.stats.home += 1;
    this.emit('home', { home: this.home, count: this.place.count });
    if (this.home >= this.place.count) this.emit('place-done', { place: this.place });
  }

  /** A spider was let go of somewhere else. It costs nothing, and it goes back to playing. */
  letGo() {
    this.stats.letGo += 1;
    this.emit('let-go');
  }
}

/**
 * What happens to a spider as the hand comes and goes, frame by frame. A hand that has been seen open,
 * and then closes on a spider, catches it. It's carried in the closed hand, and opening the hand lets it
 * go: into its web if that's where the hand is, or back to playing anywhere else.
 *
 * It fails closed. open and closed are only true when the tracker is sure, so a hand at the edge of the
 * picture, too far away or overlapping the other one is neither, and does neither. A hand that has gone
 * from the picture lets go of what it had, as it can't be seen, and never puts a spider in its web.
 */
export class Catching {
  constructor() {
    this.held = null;
    this.sinceOpen = Infinity;
    this.nearFor = 0;
  }

  /** near is the spider the hand is by, if any. Returns 'caught', 'home', 'let-go' or null. */
  update(dt, { seen, open, closed, near, onWeb }) {
    if (!seen) {
      this.sinceOpen = Infinity;
      this.nearFor = 0;
      if (!this.held) return null;
      this.held = null;
      return 'let-go';
    }
    if (this.held) {
      if (!open) return null;
      this.held = null;
      this.sinceOpen = 0;
      return onWeb ? 'home' : 'let-go';
    }
    if (open) {
      this.sinceOpen = 0;
      this.nearFor = 0;
      return null;
    }
    this.sinceOpen += dt;
    if (closed && near && this.sinceOpen <= GRAB_WINDOW) {
      this.nearFor += dt;
      if (this.nearFor >= FALSE_START) {
        this.held = near;
        this.nearFor = 0;
        return 'caught';
      }
    } else {
      this.nearFor = 0;
    }
    return null;
  }

  /** The spider got away, as a shy one does: nothing is held any more. */
  drop() {
    this.held = null;
  }
}
