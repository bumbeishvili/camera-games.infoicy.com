// The rules of the race, with no screen or camera in them, so they can be tested on their own.
//
// The one rule underneath everything: only a hand that's really open counts. `drive` comes from
// core/hands.js and is 0 for a hand that's closed, missing, out of frame or can't be read, so
// nothing here can reward any of those. Nobody can crash or lose, and resting costs nothing.
//
// The levels are at the bottom: see racePlan. Nothing about the car itself changes from level to level,
// and never its top speed, which is tied to how fast things go past.
import { ramp, stepsAt } from '../../core/levels.js';

export const TOP_SPEED = 26; // At this hand's widest. At its target `drive` is 0.8.
// Anything repeating along the road is spaced so that it goes past fewer than three times a second, even at
// the fastest the car can go. In metres.
export const KERB_STRIPE = 6.8; // One colour, so a red and a white together are twice this.
export const CHEVRON_SPACING = 13.6;
// How close cars get before they touch, from the size of the cars themselves.
export const CAR_LENGTH = 4.4;
export const CAR_WIDTH = 2.6;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// Turbo fills up by itself while the hand in play stays open, and once the meter is full it goes by itself
// for a few seconds, with flames and more speed. Then the meter fills again. Closing the hand pauses it:
// turbo stops while the hand is closed, and nothing is taken away. There's nothing else to learn.
export const TURBO = {
  fillSeconds: 4, // Of driving with the hand open.
  seconds: 3, // How long turbo lasts.
  growSeconds: 1.2, // The flames grow over this, and the car gets a little faster.
  bonus: 0.2,
  heldBonus: 0.1,
};

export const SLAP = {
  boostSeconds: 2.2,
  bonus: 0.3,
  kick: 4, // Metres a second added at once, so the slap is felt straight away.
};

const MOST_BONUS = 0.45;
export const FASTEST_SPEED = TOP_SPEED * (1 + MOST_BONUS);

/** The meter on screen: it fills while the hand is open, and when it's full that's turbo. */
export class TurboMeter {
  constructor() {
    this.reset();
  }

  reset() {
    this.level = 0;
    this.active = false;
    this.heldFor = 0;
    this.left = 0; // Seconds of turbo still to come.
    this.everFull = false; // Whether there's been turbo yet this race.
  }

  /** Turbo straight away, for its whole time, as when the car takes off. */
  burst() {
    this.left = TURBO.seconds;
    this.level = 1;
    this.active = true;
    this.heldFor = 0;
    this.everFull = true;
  }

  /** How far into turbo it is, from 0 to 1, for the size of the flames. */
  get grown() {
    return this.active ? clamp(this.heldFor / TURBO.growSeconds, 0, 1) : 0;
  }

  /** open is more than 0 while the hand in play counts as open. */
  update(open, dt) {
    if (!(open > 0)) {
      this.active = false;
      return;
    }
    if (this.left > 0) {
      this.active = true;
      this.heldFor += dt;
      this.left = Math.max(0, this.left - dt);
      this.level = this.left / TURBO.seconds;
      if (this.left === 0) {
        this.active = false;
        this.heldFor = 0;
      }
      return;
    }
    this.level = Math.min(1, this.level + dt / TURBO.fillSeconds);
    if (this.level >= 1) this.burst();
  }

  get bonus() {
    return this.active ? TURBO.bonus + TURBO.heldBonus * this.grown : 0;
  }
}

/**
 * Watches the hand that isn't in play for a fist and then an open hand. update() is true once, as the
 * hand opens after a fist. The fist has to be a real one, in view and readable: a hand cut off by the
 * edge, too far away, touching the other hand or lost doesn't count as one.
 */
export class FistAndOpen {
  constructor() {
    this.reset();
  }

  reset() {
    this.sawFist = false;
  }

  update(hand) {
    if (hand?.status === 'open') {
      const done = this.sawFist;
      this.sawFist = false;
      return done;
    }
    this.sawFist = hand?.status === 'closed' && hand.reason === 'closed';
    return false;
  }
}

/** How fast the car wants to go. A closed hand wants to go nowhere, whatever else is happening. */
export function wantedSpeed(drive, turboBonus = 0, boostLeft = 0) {
  if (!(drive > 0)) return 0;
  const boost = boostLeft > 0 ? SLAP.bonus * Math.min(1, boostLeft / 0.6) : 0;
  return drive * TOP_SPEED * (1 + Math.min(MOST_BONUS, turboBonus + boost));
}

// How far across the road the car has to be for a high five, in metres from the middle. Full lock
// is 10 cm or so of hand movement, and the car's place on the road follows the hand, so "medium"
// takes about half of that. Grown-ups choose under the gear icon.
export const REACH = { small: 1.4, medium: 2.6, big: 4 };
const LEAST_REACH = 0.9;

/**
 * What happens as the car goes past a big hand. side is -1 for a hand on the left of the road and
 * 1 for one on the right, and lateral is the car's place across the road, with right positive.
 */
export function gateOutcome({ handOpen, lateral, side, reach }) {
  if (lateral * side < reach) return 'passed';
  return handOpen === true ? 'slap' : 'closed';
}

/**
 * What counts comes down for a child who's trying. Going past a big hand with the hand open but the
 * car too far away makes that side's reach a little smaller, so a side that's hard to reach doesn't
 * stay out of reach, and a slap takes it gently back up. A closed hand isn't trying, so it's left out.
 */
export class ReachEasing {
  constructor(base = REACH.medium) {
    this.base = base;
    this.ease = { '-1': 1, 1: 1 };
  }

  setBase(base) {
    this.base = base;
    this.ease = { '-1': 1, 1: 1 };
  }

  reachFor(side) {
    return Math.max(LEAST_REACH, this.base * this.ease[side]);
  }

  record(side, outcome, handOpen) {
    if (outcome === 'slap') this.ease[side] = Math.min(1, this.ease[side] + 0.1);
    else if (outcome === 'passed' && handOpen) this.ease[side] = Math.max(0.25, this.ease[side] - 0.18);
  }
}

// How the others race at level 1. Higher levels change these: see racePlan.
export const RIVAL_PACE = {
  gains: 4.5, // The fastest a car catches up with where it wants to be, in metres a second.
  leftBehindBy: 7, // How fast the player pulls away from them during a slap's boost.
  wishAhead: 0, // Metres further ahead than usual that each one likes to be.
  comesBackScale: 1, // How far behind one gets before it comes past again, as a share of usual.
};

// The other cars race at the child's pace, whatever that is, so that there's always someone to see and
// to pass. Each one wants to be a little way ahead, by an amount that changes slowly. A slap's boost leaves
// them behind for as long as it lasts, which is what makes it feel fast and is most of the overtaking. They
// come back afterwards, and one that's fallen right out of sight comes past again, to be passed again.
const FALLS_BACK_AT_MOST = 7;
const COMES_BACK_BY = 8; // How fast one that's out of sight comes past.
const WAITS_WITHIN = 45;
const STOPS_BEHIND = 7;

export function rivalSpeed({ gap, wish, playerSpeed, resting, rushing, comingBack, cruise, pace = RIVAL_PACE }) {
  if (resting) {
    // Everyone waits for a child who's resting. Those in front go on a little way and stop, still in
    // view, and those behind stop before they get there, so resting never costs a place.
    if (gap >= 0) return cruise * clamp(1 - gap / WAITS_WITHIN, 0, 1);
    return clamp((-gap - STOPS_BEHIND) * 1.2, 0, cruise);
  }
  if (comingBack) return playerSpeed + COMES_BACK_BY;
  if (rushing) return Math.max(0, playerSpeed - pace.leftBehindBy);
  return Math.max(0, playerSpeed + clamp((wish - gap) * 0.35, -FALLS_BACK_AT_MOST, pace.gains));
}

/** Whether two cars are touching. Each is { distance, lateral }. */
export function touching(a, b) {
  return Math.abs(a.distance - b.distance) < CAR_LENGTH && Math.abs(a.lateral - b.lateral) < CAR_WIDTH;
}

/* ---------- levels ---------- */

/** The big hands at level 1, on alternating sides: -1 is the left of the road and 1 the right. In metres along a lap. */
export const GATE_SPOTS = [
  [90, 1], [190, -1], [300, 1], [470, -1], [560, 1], [660, -1], [745, 1],
  [860, -1], [960, 1], [1060, -1], [1150, 1], [1250, -1], [1345, 1],
];

/** Ramps down the middle of the road at level 1. Taking one is up to the child, and it's always safe. */
export const RAMP_SPOTS = [610, 910, 1200];
export const SIDE_RAMP = 3.2; // How far over a ramp to one side of the road is, from the middle.

// The start of the lap as a slalom, from level 7: five big hands, left and right, each a little over 60 m
// from the last, through the village. That's as close as two on opposite sides ever get, which leaves at
// least 70% of the time to get across that the closest two at level 1 do (85 m).
const SLALOM = [[55, 1], [117, -1], [180, 1], [243, -1], [305, 1]];

/** Where the big hands are at a level, in order along the lap. */
export function gatesFor(level) {
  let spots = GATE_SPOTS.map(([along, side]) => [along, side]);
  const add = (from, spot) => {
    if (level >= from) spots.push(spot);
  };
  // From level 3, now and then two big hands in a row on the same side, 35 m apart.
  add(3, [995, 1]);
  add(5, [1380, 1]);
  add(6, [825, -1]);
  // From level 7, a slalom at the start of the lap.
  if (level >= 7) spots = [...SLALOM, ...spots.filter(([along]) => along > 320)];
  // From level 9, two on the left after the tunnel, and the farm's hand a little further on to leave room.
  if (level >= 9) {
    spots = spots.map(([along, side]) => [along === 470 ? 465 : along === 560 ? 565 : along, side]);
    spots.push([500, -1]);
  }
  return spots.sort((a, b) => a[0] - b[0]);
}

/** The ramps at a level: { along, lateral }, where lateral is 0 for the middle of the road. */
export function rampsFor(level) {
  const ramps = RAMP_SPOTS.map((along) => ({ along, lateral: 0 }));
  // From level 6, a ramp to one side, on the way over to a big hand: a jump straight into a high five.
  if (level >= 6) ramps.push({ along: 1310, lateral: SIDE_RAMP });
  if (level >= 9) ramps.push({ along: 712, lateral: SIDE_RAMP });
  return ramps.sort((a, b) => a.along - b.along);
}

/** How many times a lap the car has to go from one side of the road to the other, for the big hands. */
export function sideChanges(spots) {
  return spots.filter(([, side], index) => side !== spots[(index + 1) % spots.length][1]).length;
}

/** The closest two big hands on opposite sides get, in metres, going round and round the lap. */
export function closestAcross(spots, lapLength) {
  let closest = Infinity;
  spots.forEach(([along, side], index) => {
    const [nextAlong, nextSide] = spots[(index + 1) % spots.length];
    if (nextSide !== side) closest = Math.min(closest, ((nextAlong - along) % lapLength + lapLength) % lapLength);
  });
  return closest;
}

/**
 * What each level changes, from level 1 (the race as it always was) to 10. The laps, how far to reach, the
 * steering help, the hand and how open it has to be are a grown-up's, and never change. Neither does the
 * car, or the rule that the others ease off at the end so that the child wins.
 */
export function racePlan(level) {
  const keen = ramp(level, 0, 1);
  return {
    // More cars to race: a fourth from level 4, and a fifth from level 8.
    rivals: stepsAt(level, { 1: 3, 4: 4, 8: 5 }),
    // Level by level the others race harder: they like to be further ahead, catch up faster, keep up
    // better with a boost, and come back past sooner. They still ease off on the last stretch.
    rivalPace: {
      gains: RIVAL_PACE.gains + 1.5 * keen,
      leftBehindBy: RIVAL_PACE.leftBehindBy - 2 * keen,
      wishAhead: RIVAL_PACE.wishAhead + 6 * keen,
      comesBackScale: RIVAL_PACE.comesBackScale - 0.25 * keen,
    },
    // From level 5 they use turbo too, one at a time, every this many seconds, and the child passes back.
    rivalTurboEvery: stepsAt(level, { 1: Infinity, 5: 26, 9: 18 }),
    // More big hands, two in a row on one side from level 3, and a slalom from level 7.
    gates: gatesFor(level),
    // A ramp to one side of the road from level 6, and another from level 9.
    ramps: rampsFor(level),
  };
}

export const RIVAL_TURBO = { seconds: 2.4, gain: 6 }; // How long a rival's turbo lasts, and how much faster it goes.
