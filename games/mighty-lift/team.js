// Lifting with friends, each on their own computer: what a game tells the others about its child, and what it
// makes of what they tell it. Only numbers go between them: how far up an arm is, as a share of the way to that
// child's own line, and how their lifter stands. No screen or camera in this file, so it runs in the unit tests
// with the server's own rules (server/race-room.js).
//
// Together, everyone lifts one big weight: it goes as high as all their arms between them, and the friend under
// it gets out as fast as the share of arms that are up, so a child on their own still frees them. A rescue is
// over on every computer once it is on one: each game claims it from the server as it's done there. Against each
// other, each child frees their own friends, and the game is over for everyone when one of them has freed all of
// theirs: the most freed is first, and equal counts share a place.
import { Track } from '../../core/friends.js';

// Each friend's arm as their game sends it, 10 times a second, shown a moment behind so that it moves smoothly.
const ARM_TRACK = { lerp: ['u'], steps: ['a', 'n', 'f', 'r'] };
const BODY_TRACK = { lists: ['p'] };
const MOST_SENT = 2; // An arm's lift is sent as no more than this.

/** What a game tells its friends about its child's arm: only numbers. lift is how far up it is. */
export function armMessage(lifting, lift) {
  return {
    u: Math.round(Math.min(MOST_SENT, Math.max(0, lift || 0)) * 100) / 100,
    a: lifting.armUp ? 1 : 0,
    n: lifting.stats.lifts,
    f: lifting.stats.freed,
    r: lifting.resting ? 1 : 0,
  };
}

/** One friend, as this game knows them: their arm, their body, and how they're doing. */
export class Mate {
  constructor(friend) {
    this.friend = friend;
    this.arm = new Track(ARM_TRACK);
    this.body = new Track(BODY_TRACK);
    this.freed = 0;
    this.lifts = 0;
    this.resting = false;
    this.gone = false;
  }

  /** A message from their game, heard at this moment. Returns whether what's on the scoreboard changed. */
  hear(message, now) {
    if (message.t === 'pose') {
      this.body.push(message, now);
      return false;
    }
    if (message.t !== 'lifter') return false;
    this.arm.push(message, now);
    const changed = this.freed !== message.f || this.lifts !== message.n;
    this.freed = message.f;
    this.lifts = message.n;
    this.resting = Boolean(message.r);
    return changed;
  }

  /** How far up their arm is at this moment, and whether it's at its own line, for the weight everyone lifts. */
  armAt(now) {
    const at = this.arm.at(now);
    return { lift: at?.u ?? 0, up: Boolean(at?.a) };
  }

  /** The numbers their lifter copies, at this moment, or none if their camera can't see them. */
  bodyAt(now) {
    return this.body.at(now)?.p ?? [];
  }
}

/** The arms of the friends who are still here, for the rules: see Lifting.update. */
export const mateArms = (mates, now) => mates.filter(({ gone }) => !gone).map((mate) => mate.armAt(now));

/**
 * Everyone's count, the most first: lifts, on one weight together, or friends freed, against each other. stats is
 * this child's own, and each row is { name, count, you }.
 */
export function scoreRows(stats, mates, team) {
  const count = (freed, lifts) => (team ? lifts : freed);
  const rows = [
    { name: 'You', count: count(stats.freed, stats.lifts), you: true },
    ...mates.filter(({ gone }) => !gone).map(({ friend, freed, lifts }) => ({ name: friend.spec.name, count: count(freed, lifts), you: false })),
  ];
  // On a tie, the child sees themselves first.
  return rows.sort((a, b) => b.count - a.count || Number(b.you) - Number(a.you));
}

/** Against each other: whether the game is over because someone has freed all of theirs. results is each one's finish. */
export const someoneFreedAll = (results) => [...results.values()].some(({ won }) => won);

/** What this child's finish says to friends: w is 1 for a game played to its end, and n what they're counted by. */
export function finishMessage(lifting, team) {
  const all = lifting.stats.freed >= lifting.rescues.length;
  return { w: team || all ? 1 : 0, n: team ? lifting.stats.lifts : lifting.stats.freed };
}
