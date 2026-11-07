// The rules of the race, with no screen or camera in them, so they can be tested on their own.
//
// The one rule underneath everything: only a hand that's really open counts. `drive` comes from
// core/hands.js and is 0 for a hand that's closed, missing, out of frame or can't be read, so
// nothing here can reward any of those. Nobody can crash or lose, and resting costs nothing.

export const TOP_SPEED = 26; // At this hand's widest. At its target `drive` is 0.8.
export const KERB_STRIPE = 6.8; // Metres. A red and a white go past fewer than three times a second, at any speed.
export const CAR_LENGTH = 3.9;
export const CAR_WIDTH = 1.95;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// Turbo comes from opening the hand as wide as this hand can, measured against its own best in the
// hand check, so a hand that can't open far gets it too. `width` is how open it is as a share of that
// best, and is 0 for a hand that doesn't count as open. A little less keeps it going once it's started,
// as a real hand doesn't hold perfectly still.
export const TURBO = {
  startsAt: 0.94,
  keepsAt: 0.89,
  fillSeconds: 0.7,
  drainSeconds: 1.2,
  closedDrainSeconds: 0.4,
  growSeconds: 2.5, // Holding it wide makes the flames bigger, and the car a little faster.
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

/** The meter on screen. It fills while the hand is at its widest, then that's turbo. */
export class TurboMeter {
  constructor() {
    this.reset();
  }

  reset() {
    this.level = 0;
    this.active = false;
    this.heldFor = 0;
    this.everFull = false;
  }

  /** How far holding it has got, from 0 to 1, for the size of the flames. */
  get grown() {
    return this.active ? clamp(this.heldFor / TURBO.growSeconds, 0, 1) : 0;
  }

  update(width, dt) {
    // A closed, missing or unreadable hand ends it at once, without waiting for the meter.
    if (!(width > 0)) {
      this.active = false;
      this.heldFor = 0;
      this.level = Math.max(0, this.level - dt / TURBO.closedDrainSeconds);
      return;
    }
    const wide = width >= (this.active ? TURBO.keepsAt : TURBO.startsAt);
    if (wide) {
      this.level = Math.min(1, this.level + dt / TURBO.fillSeconds);
      if (this.level >= 1) {
        this.active = true;
        this.everFull = true;
      }
      if (this.active) this.heldFor += dt;
    } else {
      this.active = false;
      this.heldFor = 0;
      this.level = Math.max(0, this.level - dt / TURBO.drainSeconds);
    }
  }

  get bonus() {
    return this.active ? TURBO.bonus + TURBO.heldBonus * this.grown : 0;
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

// The other cars race at the child's pace, whatever that is, so there are always some close enough
// to see and to pass. Each one wants to be a certain distance from the player, which changes slowly, so
// they keep coming past and being passed. A slap or turbo always leaves them behind for as long as it
// lasts, which is what makes those feel fast, and a car that's fallen far behind catches up out of sight.
const GAINS_AT_MOST = 4.5;
const FALLS_BACK_AT_MOST = 7;
const LEFT_BEHIND_BY = 2.5; // During a slap or turbo, the least the player pulls away by, in metres a second.
const FAR_BEHIND = 45;
const WAITS_WITHIN = 45;
const STOPS_BEHIND = 7;

export function rivalSpeed({ gap, wish, playerSpeed, resting, rushing, cruise }) {
  if (resting) {
    // Everyone waits for a child who's resting. Those in front go on a little way and stop, still in
    // view, and those behind stop before they get there, so resting never costs a place.
    if (gap >= 0) return cruise * clamp(1 - gap / WAITS_WITHIN, 0, 1);
    return clamp((-gap - STOPS_BEHIND) * 1.2, 0, cruise);
  }
  let pull = clamp((wish - gap) * 0.35, -FALLS_BACK_AT_MOST, rushing ? -LEFT_BEHIND_BY : GAINS_AT_MOST);
  if (gap < -FAR_BEHIND) pull = Math.max(pull, Math.min(15, (-FAR_BEHIND - gap) * 0.5));
  return Math.max(0, playerSpeed + pull);
}

/** Whether two cars are touching. Each is { distance, lateral }. */
export function touching(a, b) {
  return Math.abs(a.distance - b.distance) < CAR_LENGTH && Math.abs(a.lateral - b.lateral) < CAR_WIDTH;
}
