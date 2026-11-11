// Playing Giraffe's Smoothie Stand with friends, each on their own computer: everyone slices from the same fruit,
// for the same customers. One game runs the stand for everyone: the host's, and if the host goes, the next one
// still playing. It throws the fruit, keeps the orders, and sends how each fruit was thrown about 10 times a
// second. A fruit's flight only depends on how it was thrown and the time since "GO!", so every game, that one
// too, works out where it is from those, and it's where it really is on every screen, without waiting for the
// next message or jumping when one comes. No DOM here, so it can be tested on its own.
import { FRUITS } from './orders.js';

// What each fruit is, as a number. It's in each fruit's id too, so whoever's claim it was, every game knows what
// was sliced: see fruitId.
export const FRUIT_KINDS = [...FRUITS, 'rotten'];
const KIND_SLOTS = 8;
// Each game that runs the stand numbers its fruit from its own place in the order everyone has, so that a game
// taking over never gives out the same number again.
const IDS_EACH = 25_000;
// Fruit is thrown this long after it's decided on, still below the screen, so a friend's game always hears of it
// before it can be seen.
export const THROW_AHEAD_MS = 250;
// How long the game running the stand can say nothing, or a game can be out of touch, before everyone counts it as
// gone, as core/friends-ui.js does for a friend who has left.
export const QUIET_MS = 4000;

/** A fruit's id, the nth one thrown by the game in that place, with what it is in it. */
export function fruitId(slot, n, kind) {
  const what = Math.max(0, FRUIT_KINDS.indexOf(kind));
  return ((Math.max(0, slot) * IDS_EACH) + (n % IDS_EACH)) * KIND_SLOTS + what;
}

/** What a fruit is, from its id. */
export const kindOfId = (id) => FRUIT_KINDS[id % KIND_SLOTS] ?? FRUIT_KINDS[0];

/**
 * Where a fruit is at a time, in milliseconds since "GO!", from how it was going at its own time t: x and y as
 * shares of the screen across and down, vx and vy in shares a second, and gravity in screen heights a second
 * squared. A still one, which only the tests make, stays where it is.
 */
export function flightAt({ x, y, vx, vy, t, still = false }, ms, gravity) {
  if (still) return { x, y };
  const seconds = (ms - t) / 1000;
  return { x: x + vx * seconds, y: y + vy * seconds + (gravity * seconds * seconds) / 2 };
}

/** A number rounded as the server will round it, so every game works from exactly the same ones. */
export const rounded = (value, places = 4) => Math.round(value * 10 ** places) / 10 ** places;

/**
 * Who runs the stand: the first in the order everyone has, the host first, who's still here. present(id) says
 * whether someone is. Null if nobody is.
 */
export function runnerOf(racers, present) {
  return racers.find((id) => present(id)) ?? null;
}

/**
 * What a game hears from whoever runs the stand: the newest of what they've sent, and when it came. Only what
 * comes from the one this game counts as running it is kept.
 */
export class StandFollower {
  constructor() {
    this.from = null;
    this.latest = null;
    this.heardAt = null;
    this.since = 0;
  }

  /**
   * From now on, what comes from player from, as from this time. What came last from whoever ran it before stays
   * until they've said something, so the fruit already thrown flies on meanwhile.
   */
  follow(from, now) {
    if (from === this.from) return;
    this.from = from;
    this.heardAt = null;
    this.since = now;
  }

  /** A stand message, from player from, heard at this time. Returns whether it's the newest, and kept. */
  push(from, message, heardAt) {
    if (from !== this.from) return false;
    const first = this.heardAt === null;
    this.heardAt = heardAt;
    if (!first && this.latest && message.ms < this.latest.ms) return false;
    this.latest = message;
    return true;
  }

  /**
   * Whether whoever runs the stand has said nothing for a long while. Before they've said anything at all, it's
   * twice as long, as a slow computer can take a while getting to "GO!".
   */
  quiet(now) {
    return this.heardAt === null ? now - this.since > QUIET_MS * 2 : now - this.heardAt > QUIET_MS;
  }

  /** The fruit in the air, each as { id, kind, x, y, vx, vy, t, still }, or none before anything has come. */
  get fruit() {
    return (this.latest?.f ?? []).map(([id, x, y, vx, vy, t, s]) => ({ id, kind: kindOfId(id), x, y, vx, vy, t, still: s === 1 }));
  }
}

/** The fruit as a stand message sends it: each [id, x, y, vx, vy, t, still]. */
export const wireFruit = (fruit) => fruit.map(({ id, anchor }) => [id, anchor.x, anchor.y, anchor.vx, anchor.vy, anchor.t, anchor.still ? 1 : 0]);
