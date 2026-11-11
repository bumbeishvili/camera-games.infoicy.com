// Cannon Bay with a friend: ship against ship, each sailed by a child on their own computer, and no pirates.
// No screen, camera or sound in this file, so it all runs in the unit tests.
//
// Each game sails its own ship just as it does alone, with its own child's speed, cannons and how hard, and
// sends where it is about 10 times a second, with how many cannonballs it has fired. The other game shows that
// ship where it really is, a moment ago, and its balls flying over. Each game decides when its own balls hit
// the friend's ship, as it sees it, and says so, and each hit is a point. Nobody sinks, and nothing is lost:
// a duel goes on for the same time on both, from the host's number of ships, and the most hits wins.
import { forwardOf } from './battle.js';

/** How long a duel lasts, from the host's Ships to beat: two minutes for 4, three for 6 and four for 9. */
export const DUEL_SECONDS = { 4: 120, 6: 180, 9: 240 };
export const duelSeconds = (ships) => DUEL_SECONDS[ships] ?? DUEL_SECONDS[6];

// Where the two ships start: side by side, out at sea to the south of the island, both heading for it, and
// close enough to be in each other's firing zones on every How hard. The host's is on the left.
const START = { x: -120, z: 860, apart: 120, heading: 0 };

/** Where the ship in this slot starts, as { x, z, heading }: 0 is the host's, and 1 their friend's. */
export function duelStart(slot) {
  const side = slot === 0 ? -1 : 1;
  return { x: START.x + (side * START.apart) / 2, z: START.z, heading: START.heading };
}

const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;
/** The same way round, from -π to π, however many times the ship has gone round. */
const wrapped = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** What goes to the friend about the child's ship, about 10 times a second: see cleanShip in server/race-room.js. */
export function shipWire(battle) {
  return {
    x: round(battle.x, 2),
    z: round(battle.z, 2),
    h: round(wrapped(battle.heading), 3),
    s: round(battle.speed, 1),
    v: round(battle.sails, 2),
    f: battle.stats.shots,
  };
}

/**
 * A friend's ship between what their game sends, for Track in core/friends.js: where it is and its speed and
 * sails go smoothly from one message to the next, its heading the short way round, and the balls it has fired
 * change half way. With nothing new for a moment, it carries on the way it was going.
 */
export const SHIP_TRACK = {
  lerp: ['x', 'z', 's', 'v'],
  angles: ['h'],
  steps: ['f'],
  guess: (last, seconds) => {
    const forward = forwardOf(last.h);
    return { x: last.x + forward.x * last.s * seconds, z: last.z + forward.z * last.s * seconds };
  },
};

// As many of the friend's balls as are shown at once, after a moment with nothing coming through.
const MOST_FIRED_AT_ONCE = 3;

/** One duel: its clock, and the hits each ship has made. friend is who the child is playing, from friends-ui.js. */
export class Duel {
  constructor({ seconds, slot = 0, friend = null }) {
    this.seconds = seconds;
    this.left = seconds;
    this.slot = slot;
    this.friend = friend;
    this.mine = 0; // Hits the child's ship has made, as this game decided.
    this.theirs = 0; // Hits the friend's has, as their game says.
    this.seenFired = null; // How many balls the friend's ship had fired, as last shown.
  }

  /** The clock runs while they sail, which waits, as everything does, while a grown-up has the panel open. */
  tick(dt) {
    this.left = Math.max(0, this.left - dt);
  }

  get over() {
    return this.left <= 0;
  }

  /** The child's ship hit the friend's: how many it has now. */
  scored() {
    this.mine += 1;
    return this.mine;
  }

  /** The friend's game says how many hits its ship has made so far. Returns how many of those are new. */
  heard(total) {
    const count = Math.max(0, Math.round(total) - this.theirs);
    this.theirs += count;
    return count;
  }

  /** How many balls the friend's ship has fired since it was last shown, from what their game says. */
  newlyFired(fired) {
    if (this.seenFired === null || fired < this.seenFired) this.seenFired = fired;
    const count = Math.min(MOST_FIRED_AT_ONCE, fired - this.seenFired);
    this.seenFired = fired;
    return count;
  }

  /** Who has more, as 'won', 'lost' or 'tied', from the child's side. Equal points share the win. */
  static outcome(mine, theirs) {
    if (mine === theirs) return 'tied';
    return mine > theirs ? 'won' : 'lost';
  }
}
