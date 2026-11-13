// Frost Arena with friends, each on their own computer with their own camera, all in the same yard: what a match
// together (team.js) and a match against each other (rivals.js) share.
//
// Each player's game runs its own player, just as it does alone: where they look and walk, when their rifle
// fires and what it hits, and what lands on them. Ten times a second it tells the friends' games about them
// (childWire), and those show them where it says (placeFriend), a moment in the past, so they move smoothly. A
// shot that hits is decided by the game that fired it, as that's the one whose player is looking down the
// sights, and how much someone has left is decided by their own game, which is told of every hit.
//
// Nothing waits for anyone here: a player with neither hand in the picture stands where they are, and can be hit
// like anyone else.
//
// There's no screen, sound or camera in this file, so it all runs in the unit tests.
import { EYES, HEALTH, Match, OUT_SECONDS, YARD, aimOf, forwardOf, freeAt, shotMeets, shotReach } from './arena.js';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;
/** An angle as the nearest way round to it, from -π to π. */
export const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const whole = (value, low, high) => (Number.isFinite(value) ? clamp(Math.round(value), low, high) : low);

export const MOST_PLAYERS = 4;
// What each player looks like in their friends' yards, by their place in the order they joined. Nobody sees themselves.
export const PLAYER_LOOKS = ['kit', 'mochi', 'widget', 'truffle'];
export const OWED_SECONDS = 1.2; // A hit of this player's that the other game hasn't counted by now never got there.
const SHOTS_AT_ONCE = 3; // More new shots than this in a moment are shown as this many.
const OUTS_AT_ONCE = 2; // And more new times tagged out than this are a mistake.
const BACK_SECONDS = 0.25; // Just back at their home, a friend is put there, rather than slid across the yard.
const SAFE_SHOWN = 0.25; // A friend who's just back, and can't be hit, is shown so for this long after their game last said so.

/**
 * A friend between what their game sends: where they are and how fast they're going, which go smoothly from one
 * message to the next, the way they face, which goes the short way round, and the rest, which change half way.
 * With nothing new for a moment, they carry on the way they were walking, as long as that's open ground.
 * See Track in core/friends.js.
 */
export const TROOPER_TRACK = {
  lerp: ['x', 'z', 's'],
  angles: ['h'],
  steps: ['p', 'f', 'n', 'k', 'v', 'u', 'g', 'r', 'o', 'a', 'b'],
  guess: (last, seconds) => {
    if (last.u || !(last.s > 0)) return {};
    const forward = forwardOf(last.h);
    const x = last.x + forward.x * last.s * seconds;
    const z = last.z + forward.z * last.s * seconds;
    return freeAt(x, z) ? { x, z } : {};
  },
};

/**
 * A match with friends. As a Match, and: slot is this player's place in the order everyone joined, 0 for whoever
 * made the game, and players is everyone playing, this player too, each as { slot, name }.
 */
export class Squad extends Match {
  /** Everyone playing, in the order they joined, which is the same in every friend's game. */
  static seats(players) {
    const seen = new Set();
    return (Array.isArray(players) ? players : [])
      .filter((player) => Number.isInteger(player?.slot) && player.slot >= 0 && player.slot < MOST_PLAYERS && !seen.has(player.slot) && seen.add(player.slot))
      .sort((a, b) => a.slot - b.slot);
  }

  /** A player takes their place: this game's own, or a friend, who looks like one of the characters. */
  seat(player, team, home, rifle) {
    const mine = player.slot === this.slot;
    const trooper = this.join(team, mine ? 'child' : PLAYER_LOOKS[player.slot], mine ? rifle : 'ak', false, { home, number: player.slot, name: mine ? '' : String(player.name ?? '') });
    // How many times they've been tagged out by each of the others, by their place, how many times in all, and
    // who by the last time, as that one's number.
    Object.assign(trooper, { outBy: Array.from({ length: MOST_PLAYERS }, () => 0), outs: 0, outLast: -1 });
    if (mine) this.child = trooper;
    return trooper;
  }

  /** The other players, whether or not they're still here. */
  get friends() {
    return this.troopers.filter((each) => !each.bot && each !== this.child);
  }

  /** The players still here, this one too. */
  get here() {
    return this.troopers.filter((each) => !each.bot && each.state !== 'gone');
  }

  /** The player with this place, or nobody. */
  playerAt(slot) {
    return this.troopers.find((each) => !each.bot && each.number === slot) ?? null;
  }

  /** Whoever has this number, in every friend's game: a player's is their place, and the rest are the computer's. */
  byNumber(number) {
    return this.troopers.find((each) => each.number === number) ?? null;
  }

  /** This game decides for its own player, and for those the computer plays if it's the one running them. */
  decides(trooper) {
    return trooper === this.child || (trooper.bot && Boolean(this.runs));
  }

  /** Who someone is up against: everyone still in who isn't on their team, whatever their hands are doing. */
  foesOf(trooper) {
    return this.troopers.filter((each) => each.team !== trooper.team && each.state === 'in' && each.health > 0);
  }

  /**
   * What lands on this game's own player, which only this game says. Tagged out, who did it is kept, for every
   * friend's game to hear of from this one.
   */
  hitOwn(amount, by) {
    const { child } = this;
    const was = child.state;
    super.hit(child, amount, by);
    if (was !== 'in' || child.state !== 'out') return false;
    child.outs += 1;
    child.outLast = by?.number ?? -1;
    if (by && !by.bot && by.number >= 0 && by.number < MOST_PLAYERS) child.outBy[by.number] += 1;
    return true;
  }

  /**
   * What this player's game tells the friends' games about them: where they are, the way they face, how fast
   * they're going and whether that's a sprint, whether they're firing, how many shots they've fired, which rifle,
   * how much they have left, whether they're sitting out, just back or have their hands out of the picture, how
   * many times each of the others has tagged them out, how many times they've been tagged out in all, and who
   * by the last time.
   */
  childWire() {
    const { child } = this;
    return {
      x: round(child.x, 2),
      z: round(child.z, 2),
      h: round(wrap(child.heading), 3),
      s: round(child.speed, 1),
      p: child.sprinting ? 1 : 0,
      f: child.firing ? 1 : 0,
      n: this.stats.shots,
      k: child.rifle === 'm4' ? 1 : 0,
      v: child.state === 'in' ? Math.max(1, Math.round(child.health)) : 0,
      u: child.state === 'out' ? 1 : 0,
      g: child.safeLeft > 0 ? 1 : 0,
      r: this.resting ? 1 : 0,
      o: [...child.outBy],
      a: child.outs,
      b: child.outLast,
    };
  }

  /**
   * Where a shot from someone ends, fired level the way they face: at whoever of the other side is in the way,
   * or at whatever else is. It's only for showing a friend's shots: what theirs hit is for their game to say.
   */
  shotFrom(trooper) {
    const from = { x: trooper.x, y: EYES, z: trooper.z };
    const way = aimOf(trooper.heading, 0);
    let { far, what } = shotReach(from, way);
    let at = null;
    for (const other of this.troopers) {
      if (other === trooper || other.team === trooper.team || other.state !== 'in') continue;
      const meets = shotMeets(from, way, other);
      if (meets !== null && meets < far) [far, at, what] = [meets, other, 'player'];
    }
    return { at, what, hit: Boolean(at), to: { x: from.x + way.x * far, y: from.y + way.y * far, z: from.z + way.z * far } };
  }

  /**
   * A friend, where their game says they are, a moment ago: at is from their track, or null before anything has
   * come. It comes from another computer, so nothing in it is taken on trust: they're kept to the yard, and
   * anything that isn't a number counts as nothing.
   */
  placeFriend(friend, at) {
    if (!at || !friend || friend.bot || friend === this.child || friend.state === 'gone') return;
    if (!['ready', 'playing'].includes(this.state)) return;
    const number = (value, low, high, otherwise = low) => (Number.isFinite(value) ? clamp(value, low, high) : otherwise);
    const health = whole(at.v, 0, HEALTH);
    const out = Boolean(at.u);
    friend.rifle = at.k ? 'm4' : 'ak';
    friend.most = HEALTH;
    friend.resting = Boolean(at.r);

    // Tagged out, they sit where they were. Back, they're at their home at once.
    if (out && friend.state === 'in') {
      Object.assign(friend, { state: 'out', outLeft: OUT_SECONDS, health: 0, firing: false, speed: 0, sprinting: false });
    } else if (!out && friend.state === 'out') {
      const { home } = friend;
      Object.assign(friend, { state: 'in', x: home.x, z: home.z, heading: home.heading, health, speed: 0, backAt: this.time, tagAt: -Infinity });
      this.emit('back', { trooper: friend });
    }
    if (friend.state === 'in' && this.time - (friend.backAt ?? -Infinity) >= BACK_SECONDS) {
      friend.x = number(at.x, -YARD.halfX, YARD.halfX, friend.x);
      friend.z = number(at.z, -YARD.halfZ, YARD.halfZ, friend.z);
      friend.heading = number(at.h, -7, 7, friend.heading);
      friend.speed = number(at.s, 0, 20, 0);
      friend.sprinting = Boolean(at.p);
    }
    if (friend.state === 'in') {
      // How much they have left is theirs to say, apart from a hit of this player's that their game hasn't counted yet.
      if (health < friend.health || this.time - (friend.tagAt ?? -Infinity) > OWED_SECONDS) friend.health = health;
      friend.safeLeft = at.g ? SAFE_SHOWN : friend.safeLeft;
    }
    friend.firing = friend.state === 'in' && Boolean(at.f);

    // Each shot they've fired since the last look goes from their rifle, the way they face.
    const shots = whole(at.n, 0, 100_000);
    const fresh = friend.shotsSeen === undefined ? 0 : clamp(shots - friend.shotsSeen, 0, SHOTS_AT_ONCE);
    friend.shotsSeen = shots;
    if (friend.state === 'in') for (let i = 0; i < fresh; i += 1) this.emit('shot', { by: friend, ...this.shotFrom(friend) });

    // And each time they say they've been tagged out, whoever did it has a tag.
    const counts = Array.isArray(at.o) ? at.o : [];
    for (let slot = 0; slot < MOST_PLAYERS; slot += 1) friend.outBy[slot] = Math.max(friend.outBy[slot], whole(counts[slot], 0, 1000));
    const outs = whole(at.a, 0, 100_000);
    const more = clamp(outs - friend.outs, 0, OUTS_AT_ONCE);
    friend.outs = Math.max(friend.outs, outs);
    for (let i = 0; i < more; i += 1) this.friendTaggedOut(friend, this.byNumber(whole(at.b, -1, 99)));
  }

  /** A friend's game says they've been tagged out, by whoever has that number. */
  friendTaggedOut(friend, by) {
    this.emit('tagged', { trooper: friend, by, score: [...this.score] });
  }

  /** A friend has gone, in the middle. They're no longer in the yard, and nothing is on them. */
  friendGone(slot) {
    const friend = this.playerAt(slot);
    if (!friend || friend === this.child || friend.state === 'gone') return false;
    Object.assign(friend, { state: 'gone', firing: false, resting: false, speed: 0, health: 0, seen: null });
    if (this.aimed === friend) this.aimed = null;
    for (const each of this.troopers) {
      if (each.seen === friend) each.seen = null;
      if (each.angryAt === friend) Object.assign(each, { angryAt: null, angryLeft: 0 });
    }
    this.emit('gone', { trooper: friend });
    return true;
  }
}
