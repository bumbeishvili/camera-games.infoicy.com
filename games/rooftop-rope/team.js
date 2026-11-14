// Crossing with friends, each on their own computer: what a game tells the others about its walker, and what
// it makes of what they tell it. Only numbers go between them: which rope the walker is on and how far along
// it, which foot is up and how high, how much it's wobbling, and how many stars and ropes it has. No screen or
// camera in this file, so it runs in the unit tests with the server's own rules (server/race-room.js).
//
// Together, everyone crosses the same ropes side by side, and a walker who's in front waits on each rooftop
// for the others (see Walk.update), with the stars of all of them counted as one. Against each other it's a
// race to the last rooftop, and everyone walks on to the end.
import { Track } from '../../core/friends.js';

// Each friend's walker as their game sends it, 10 times a second, shown a moment behind so that it moves smoothly.
const WALKER_TRACK = { lerp: ['a', 'u', 'w'], steps: ['g', 'f', 'n', 'c', 'd'] };
export const SENT_MOST = { a: 9, u: 2.5, n: 200, c: 8 };
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;
const within = (value, low, high) => Math.min(high, Math.max(low, Number(value) || 0));

/** What a game tells its friends about its walker: only numbers. a is the rope's number and how far along it is. */
export function walkerMessage(walk) {
  const { stats } = walk;
  const done = walk.state === 'finished';
  const along = walk.state === 'rope' || walk.state === 'stepping' ? Math.min(0.999, walk.progress) : 0;
  return {
    a: round(within(done ? walk.plan.ropes.length : walk.index + along, 0, SENT_MOST.a), 3),
    u: round(within(walk.lift, 0, SENT_MOST.u), 2),
    w: round(within(walk.wobble, 0, 1), 2),
    g: walk.foot === 'left' ? -1 : walk.foot === 'right' ? 1 : 0,
    f: walk.state === 'falling' ? 1 : 0,
    n: Math.min(SENT_MOST.n, stats.stars),
    c: Math.min(SENT_MOST.c, stats.crossed),
    d: done ? 1 : 0,
  };
}

/** One friend, as this game knows them: where their walker is, and how they're doing. */
export class Mate {
  constructor(friend) {
    this.friend = friend;
    this.track = new Track(WALKER_TRACK);
    this.stars = 0;
    this.crossed = 0;
    this.along = 0;
    this.done = false;
    this.gone = false;
    this.heard = false;
  }

  /** A message from their game, heard at this moment. Returns whether what's on the scoreboard changed. */
  hear(message, now) {
    if (message.t !== 'balancer') return false;
    // A walker put back at the start of a rope has gone backwards: it's shown there at once, not sliding back.
    if (this.heard && message.a < this.along - 0.05) this.track.clear();
    this.track.push(message, now);
    this.heard = true;
    const changed = this.stars !== message.n || this.crossed !== message.c || this.done !== Boolean(message.d);
    this.stars = message.n;
    this.crossed = message.c;
    this.along = message.a;
    this.done = Boolean(message.d);
    return changed;
  }

  /** Where their walker is at this moment, for drawing it, or null before anything has come from them. */
  placeAt(now) {
    if (!this.heard || this.gone) return null;
    const at = this.track.at(now);
    if (!at) return null;
    const index = Math.floor(at.a + 1e-6);
    return { index, progress: at.a - index, foot: at.g < 0 ? 'left' : at.g > 0 ? 'right' : null, lift: at.u ?? 0, wobble: at.w ?? 0, falling: Boolean(at.f) };
  }
}

/** Which rope each friend who's still here is on, for waiting for them on a rooftop: see Walk.update. */
export const mateRopes = (mates) => mates.filter(({ heard }) => heard).map(({ along, gone, done }) => ({ index: done ? Infinity : Math.floor(along + 1e-6), progress: along % 1, gone }));

/**
 * Everyone's line on the board, with friends. Together it's the stars each has, under what they add up to.
 * Against each other it's who's in front, by how far they've got. Each row is { name, count, you }.
 */
export function scoreRows(walk, mates, team) {
  const here = mates.filter(({ gone }) => !gone);
  if (team) {
    const rows = [
      { name: 'You', count: walk.stats.stars, you: true },
      ...here.map(({ friend, stars }) => ({ name: friend.spec.name, count: stars, you: false })),
    ];
    return rows.sort((a, b) => b.count - a.count || Number(b.you) - Number(a.you));
  }
  const mine = walk.state === 'finished' ? Infinity : walk.index + (walk.state === 'rope' || walk.state === 'stepping' ? walk.progress : 0);
  const rows = [
    { name: 'You', far: mine, you: true },
    ...here.map(({ friend, along, done }) => ({ name: friend.spec.name, far: done ? Infinity : along, you: false })),
  ];
  rows.sort((a, b) => b.far - a.far || Number(b.you) - Number(a.you));
  return rows.map(({ name, you }, index) => ({ name, count: index + 1, you }));
}

/** The stars of everyone crossing together. */
export const teamStars = (walk, mates) => walk.stats.stars + mates.filter(({ gone }) => !gone).reduce((sum, { stars }) => sum + stars, 0);

/** What this child's finish says to friends: w is 1 for a walk to the last rooftop, and n the stars they have. */
export function finishMessage(walk) {
  return { w: walk.state === 'finished' ? 1 : 0, n: Math.min(SENT_MOST.n, walk.stats.stars) };
}
