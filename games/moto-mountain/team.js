// Riding with friends, each on their own computer: what a game tells the others about its bike, and what it
// makes of what they tell it. Only numbers go between them: how far along the road the bike is, where across
// it, how far over it's leaning, and how many stars and bends it has. No screen or camera in this file, so it
// runs in the unit tests with the server's own rules (server/race-room.js).
//
// Together, everyone rides up as one convoy on the same road: whoever is far in front eases off and whoever is
// far behind gets a tow (see Ride.convoy), and the stars and bends of all of them count as one. Against each
// other it's a race to the top, and everyone rides on to the finish.
import { Track } from '../../core/friends.js';

// Each friend's bike as their game sends it, 10 times a second, shown a moment behind so that it moves smoothly.
// With nothing new from them for a moment, their bike carries on up the road as fast as it was going.
const BIKE_TRACK = { lerp: ['s', 'x', 'l', 'h', 'v'], steps: ['n', 'c', 'w', 'd'], guess: (last, ahead) => ({ s: last.s + (last.d ? 0 : last.v * ahead) }) };
export const SENT_MOST = { s: 4000, x: 8, l: 1.3, h: 3, v: 40, n: 200, c: 20 };
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;
const within = (value, most) => Math.min(most, Math.max(-most, Number(value) || 0));

/** What a game tells its friends about its bike: only numbers. lean is the bike's lean as a share of a whole one. */
export function riderMessage(ride, lean) {
  const { stats } = ride;
  return {
    s: round(within(ride.s, SENT_MOST.s), 1),
    x: round(within(ride.x, SENT_MOST.x), 2),
    l: round(within(lean, SENT_MOST.l), 2),
    h: round(within(ride.height, SENT_MOST.h), 2),
    v: round(within(ride.v, SENT_MOST.v), 1),
    n: Math.min(SENT_MOST.n, stats.stars + stats.snow),
    c: Math.min(SENT_MOST.c, stats.clean),
    w: ride.resting ? 1 : 0,
    d: ride.state === 'finished' ? 1 : 0,
  };
}

/** One friend, as this game knows them: where their bike is, and how they're doing. */
export class Mate {
  constructor(friend) {
    this.friend = friend;
    this.track = new Track(BIKE_TRACK);
    this.stars = 0;
    this.clean = 0;
    this.s = 0;
    this.done = false;
    this.resting = false;
    this.gone = false;
    this.heard = false;
  }

  /** A message from their game, heard at this moment. Returns whether what's on the scoreboard changed. */
  hear(message, now) {
    if (message.t !== 'rider') return false;
    this.track.push(message, now);
    this.heard = true;
    const changed = this.stars !== message.n || this.clean !== message.c || this.done !== Boolean(message.d);
    this.stars = message.n;
    this.clean = message.c;
    this.s = message.s;
    this.done = Boolean(message.d);
    this.resting = Boolean(message.w);
    return changed;
  }

  /** Where their bike is at this moment, for drawing it, or null before anything has come from them. */
  placeAt(now, leanMost) {
    if (!this.heard || this.gone) return null;
    const at = this.track.at(now);
    if (!at) return null;
    return { s: at.s ?? 0, x: at.x ?? 0, roll: (at.l ?? 0) * leanMost, height: at.h ?? 0, v: at.v ?? 0 };
  }
}

/** How far along the road each friend who's still here is, for the convoy: see Ride.convoy. */
export const mateRoads = (mates, now) => mates.filter(({ gone, heard }) => !gone && heard).map((mate) => ({ s: mate.track.at(now)?.s ?? mate.s }));

/**
 * Everyone's line on the board, with friends. Together it's the stars each has brought, under what they add up
 * to. Against each other it's who's in front, by how far up the road they are. stats is this child's own, and
 * each row is { name, count, you }.
 */
export function scoreRows(ride, mates, team) {
  const here = mates.filter(({ gone }) => !gone);
  if (team) {
    const rows = [
      { name: 'You', count: ride.stats.stars + ride.stats.snow, you: true },
      ...here.map(({ friend, stars }) => ({ name: friend.spec.name, count: stars, you: false })),
    ];
    return rows.sort((a, b) => b.count - a.count || Number(b.you) - Number(a.you));
  }
  const rows = [
    { name: 'You', far: ride.s, you: true },
    ...here.map(({ friend, s, done }) => ({ name: friend.spec.name, far: done ? Infinity : s, you: false })),
  ];
  rows.sort((a, b) => b.far - a.far || Number(b.you) - Number(a.you));
  return rows.map(({ name, you }, index) => ({ name, count: index + 1, you }));
}

/** The stars of everyone in the convoy, together. */
export const teamStars = (ride, mates) => ride.stats.stars + ride.stats.snow + mates.filter(({ gone }) => !gone).reduce((sum, { stars }) => sum + stars, 0);

/** What this child's finish says to friends: w is 1 for a ride to the top, and n the stars they brought. */
export function finishMessage(ride) {
  return { w: ride.state === 'finished' ? 1 : 0, n: Math.min(SENT_MOST.n, ride.stats.stars + ride.stats.snow) };
}
