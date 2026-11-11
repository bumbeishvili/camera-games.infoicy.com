// Tank Patrol with a friend: two children, each on their own computer with their own camera, and each of them
// one of the two tanks. There are no robot tanks, just the two of them in the valley. Each game drives its own
// tank exactly as it does on its own, and the friend's tank is wherever their game says it is.
//
// A shot of this child's that reaches the friend's tank is a hit, decided here, as this is the game that fired
// it, and a hit is a point for this child. The friend's game is told, and shows the hit on its own tank. Nothing
// is ever taken away, and no tank is ever stopped: after a hit, the tank that was hit has a bubble round it for
// a moment, which shots bounce off, and a tank whose child is resting can't be fired at at all. The battle lasts
// as long as the host's game says, and whoever made the most hits wins. Equal hits share the win.
//
// There's no screen, sound or camera in this file, so it all runs in the unit tests.
import { Patrol } from './patrol.js';
import { groundY } from './valley-map.js';

/** How long a battle lasts, in seconds, from the host's number of robot tanks to stop: 2, 3 or 4 minutes. */
export const BATTLE_SECONDS = { 6: 120, 10: 180, 15: 240 };
export const battleSeconds = (tanks) => BATTLE_SECONDS[tanks] ?? BATTLE_SECONDS[10];

// Where each tank starts: whoever made the game on the left and their friend on the right, both near the
// camera, facing each other, and out of reach of each other's guns, so the first thing to do is drive.
export const STARTS = [{ x: -14, z: 19, heading: Math.PI / 2 }, { x: 20, z: 19, heading: -Math.PI / 2 }];
export const SAFE_SECONDS = 3; // After a hit, the tank that was hit has a bubble round it for this long.
export const FRIEND_SIZE = 3.8; // How big the friend's tank is to the gun, as a robot tank's size is.
export const CLEAR = 8.6; // How near the middles of the two tanks come, so they never overlap, whichever way they face.
const SHOWN_AT_ONCE = 3; // Shots from the friend's gun shown coming at once, after a moment with nothing new.

/** A direction, kept between -π and π, as it goes to the friend's game. Of a difference, it's the shortest way round. */
export const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

export class Duel extends Patrol {
  /**
   * slot is this child's place in the battle, 0 for whoever made it and 1 for their friend, which says where
   * each tank starts. pace is the host's speed, so both tanks drive alike. help and driving are this child's own.
   */
  constructor({ slot = 0, pace = 'slow', help = 'little', driving = 'closed', random = Math.random, onEvent = () => {} } = {}) {
    // Level 1 and no robot tanks: nothing a level brings, and nothing to lob shells.
    super({ tanks: 0, pace, level: 'gentle', levelNumber: 1, help, driving, random, onEvent });
    this.slot = slot === 1 ? 1 : 0;
    const mine = STARTS[this.slot];
    const theirs = STARTS[1 - this.slot];
    Object.assign(this.tank, { x: mine.x, z: mine.z, y: groundY(mine.x, mine.z), heading: mine.heading, turret: mine.heading });
    Object.assign(this.crosshair, { x: theirs.x, z: theirs.z });
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
      safeUntil: -Infinity,
    };
    this.score = { mine: 0, theirs: 0 };
    this.safeUntil = -Infinity; // This child's own tank, after the friend's last hit.
    Object.assign(this.stats, { hitBy: 0 });
  }

  /** What the gun can fire at: the friend's tank, unless their child is resting. */
  get targets() {
    const { friend } = this;
    return friend.state === 'rolling' && !friend.resting ? [friend] : [];
  }

  /** Whether this child's own tank is in its bubble after being hit. Once it's over, both bubbles go. */
  get safe() {
    return this.state === 'playing' && this.playSeconds < this.safeUntil;
  }

  /** And the friend's, after this child's last hit. */
  get friendSafe() {
    return this.state === 'playing' && this.playSeconds < this.friend.safeUntil;
  }

  /**
   * A shot reaching the friend's tank, as this game sees it: a hit, and a point for this child, unless the
   * tank is in its bubble from the last one, when the shot bounces off.
   */
  hit(target, shot = {}, born = []) {
    if (target.kind !== 'friend') {
      super.hit(target, shot, born);
      return;
    }
    if (target.state !== 'rolling') return;
    if (target.resting || this.friendSafe) {
      this.stats.bonks += 1;
      this.emit('friend-bonk', { friend: target });
      return;
    }
    target.safeUntil = this.playSeconds + SAFE_SECONDS;
    this.score.mine += 1;
    this.stats.hits += 1;
    this.emit('friend-hit', { friend: target, hits: this.score.mine });
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
    // A child who has started resting isn't fired at, so the crosshair lets go.
    if (friend.resting && this.locked === friend) this.locked = null;
    const fired = Math.max(0, Math.round(at.n ?? 0) - friend.shots);
    friend.shots = Math.max(friend.shots, Math.round(at.n ?? 0));
    return Math.min(SHOWN_AT_ONCE, fired);
  }

  /**
   * The friend's game says its shots have hit this tank this many times in all. It's their point, and this tank
   * goes into its bubble for a moment. Nothing is taken away, and it keeps going just as it was.
   */
  hitBy(total) {
    if (!(total > this.score.theirs)) return false;
    this.score.theirs = total;
    if (this.state !== 'playing') return false;
    this.safeUntil = this.playSeconds + SAFE_SECONDS;
    this.stats.hitBy += 1;
    this.emit('hit-by', { hits: total });
    return true;
  }

  /** The friend has gone: their tank goes with them, and nothing more can be fired at it. */
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
    if (gap >= CLEAR || gap < 0.01) return;
    const x = friend.x + ((tank.x - friend.x) / gap) * CLEAR;
    const z = friend.z + ((tank.z - friend.z) / gap) * CLEAR;
    if (!nav.isFree(x, z)) return;
    Object.assign(tank, { x, z, y: groundY(x, z) });
  }

  /** The time is up, or the friend has gone: the battle's over, and a shot still on its way lands on nothing. */
  endBattle() {
    if (this.state !== 'playing') return;
    // Nobody loses: it's over, and each child has the hits they made.
    this.state = 'won';
    this.locked = null;
    this.firing = false;
    this.driving = false;
    this.route = [];
    this.emit('battle-over', { mine: this.score.mine, theirs: this.score.theirs });
  }
}
