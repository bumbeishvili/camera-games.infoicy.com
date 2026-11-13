// Two children's tanks in one valley, each child on their own computer with their own camera: what a battle
// against each other (duel.js) and a patrol together (team.js) share. Each game drives its own tank exactly as
// it does on its own, the friend's tank is wherever their game says it is, and the two never go through each other.
//
// There's no screen, sound or camera in this file, so it all runs in the unit tests.
import { Patrol } from './patrol.js';
import { groundY } from './valley-map.js';

export const FRIEND_SIZE = 3.8; // How big the friend's tank is to the gun, as a robot tank's size is.
export const CLEAR = 8.6; // How near the middles of the two tanks come, so they never overlap, whichever way they face.
const SHOWN_AT_ONCE = 3; // Shots from the friend's gun shown coming at once, after a moment with nothing new.

/** A direction, kept between -π and π, as it goes to the friend's game. Of a difference, it's the shortest way round. */
export const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

export class Pair extends Patrol {
  /**
   * slot is this child's place, 0 for whoever made the game and 1 for their friend, and starts is where each of
   * the two tanks starts, as { x, z, heading }. The rest is a patrol's: see Patrol.
   */
  constructor({ slot = 0, starts, ...patrol } = {}) {
    super(patrol);
    this.slot = slot === 1 ? 1 : 0;
    this.clear = CLEAR; // How near the middles of the two tanks come.
    const mine = starts[this.slot];
    const theirs = starts[1 - this.slot];
    Object.assign(this.tank, { x: mine.x, z: mine.z, y: groundY(mine.x, mine.z), heading: mine.heading, turret: mine.heading });
    this.friend = {
      kind: 'friend',
      x: theirs.x,
      z: theirs.z,
      y: groundY(theirs.x, theirs.z),
      heading: theirs.heading,
      turret: theirs.heading,
      speed: 0,
      turnRate: 0,
      size: FRIEND_SIZE,
      state: 'rolling',
      resting: false,
      open: false,
      shots: 0,
    };
  }

  /**
   * Where the friend's tank is, from what their game sends, a moment ago: { x, z, h, a, s, r, o, n }, its place,
   * which way it faces and its turret points, its speed, whether their child is resting and their hand open, and
   * how many shots it has fired. Returns how many it has fired since the last time, to show them coming.
   */
  placeFriend(at, dt = 0) {
    const { friend } = this;
    if (!at || friend.state !== 'rolling') return 0;
    friend.turnRate = dt > 0 ? wrap(at.h - friend.heading) / dt : 0;
    Object.assign(friend, { x: at.x, z: at.z, y: groundY(at.x, at.z), heading: at.h, turret: at.a, speed: at.s, resting: Boolean(at.r), open: Boolean(at.o) });
    const fired = Math.max(0, Math.round(at.n ?? 0) - friend.shots);
    friend.shots = Math.max(friend.shots, Math.round(at.n ?? 0));
    return Math.min(SHOWN_AT_ONCE, fired);
  }

  /** The friend has gone: their tank goes with them. */
  friendGone() {
    this.friend.state = 'gone';
    if (this.locked === this.friend) this.locked = null;
  }

  update(dt, input) {
    super.update(dt, input);
    if (this.state === 'playing') this.keepClear();
  }

  /** The two tanks never go through each other: this one keeps out of the friend's way, as theirs does of this one. */
  keepClear() {
    const { tank, friend, nav } = this;
    if (friend.state !== 'rolling') return;
    const gap = Math.hypot(tank.x - friend.x, tank.z - friend.z);
    if (gap >= this.clear || gap < 0.01) return;
    const x = friend.x + ((tank.x - friend.x) / gap) * this.clear;
    const z = friend.z + ((tank.z - friend.z) / gap) * this.clear;
    if (!nav.isFree(x, z)) return;
    Object.assign(tank, { x, z, y: groundY(x, z) });
  }
}
