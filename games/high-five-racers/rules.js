// The rules of the race, with no screen or camera in them, so they can be tested on their own.
//
// The one rule underneath everything: only a hand that's really open counts. `drive` comes from
// core/hands.js and is 0 for a hand that's closed, missing, out of frame or can't be read, so
// nothing here can reward any of those. Nobody can crash or lose, and resting costs nothing.

export const TOP_SPEED = 26; // At this hand's widest. At its target `drive` is 0.8.
// Anything repeating along the road is spaced so that it goes past fewer than three times a second, even at
// the fastest the car can go. In metres.
export const KERB_STRIPE = 6.8; // One colour, so a red and a white together are twice this.
export const CHEVRON_SPACING = 13.6;
// How close cars get before they touch, from the size of the cars themselves.
export const CAR_LENGTH = 4.4;
export const CAR_WIDTH = 2.6;

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

// Once turbo has run out, making a fist with the other hand and opening it again sets turbo off once
// more, and the car takes off and flies for a moment. Turbo like this lasts a set time, shown running
// down on the meter, rather than lasting while the hand is held wide.
export const SECOND_HAND = {
  turboSeconds: 3.5,
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
    this.burstLeft = 0;
  }

  /** Turbo from the other hand. Only once turbo has run out, and it says whether it started. */
  burst() {
    if (this.active) return false;
    this.burstLeft = SECOND_HAND.turboSeconds;
    this.level = 1;
    this.active = true;
    this.heldFor = 0;
    return true;
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
      this.burstLeft = 0;
      this.level = Math.max(0, this.level - dt / TURBO.closedDrainSeconds);
      return;
    }
    if (this.burstLeft > 0) {
      // The meter runs down like a timer, whatever the hand in play is doing, as long as it's open.
      this.burstLeft = Math.max(0, this.burstLeft - dt);
      this.level = this.burstLeft / SECOND_HAND.turboSeconds;
      this.heldFor += dt;
      if (this.burstLeft > 0) return;
      this.active = false;
      this.heldFor = 0;
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

/**
 * Watches the hand that isn't in play for a fist and then an open hand. To be sure the fist was meant,
 * the hand has to be seen open first, then really closed (in view and readable, not just cut off or
 * lost), and then open again. A hand that turns up already open, or as a fist, doesn't count until it
 * has done the whole thing. update() is true once, at the moment the hand opens again.
 */
export class FistAndOpen {
  constructor() {
    this.reset();
  }

  reset() {
    this.stage = 'waiting'; // Then 'open', then 'fist'.
  }

  update(hand) {
    const status = hand?.status;
    if (status === 'open') {
      const done = this.stage === 'fist';
      this.stage = 'open';
      return done;
    }
    if (status === 'closed' && hand.reason === 'closed') {
      if (this.stage === 'open') this.stage = 'fist';
      return false;
    }
    // Missing, cut off, too small or touching the other hand: start again.
    this.stage = 'waiting';
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

// The other cars race at the child's pace, whatever that is, so that there's always someone to see and
// to pass. Each one wants to be a little way ahead, by an amount that changes slowly. A slap's boost leaves
// them behind for as long as it lasts, which is what makes it feel fast and is most of the overtaking. They
// come back afterwards, and one that's fallen right out of sight comes past again, to be passed again.
const GAINS_AT_MOST = 4.5;
const FALLS_BACK_AT_MOST = 7;
const LEFT_BEHIND_BY = 7; // How fast the player pulls away from them during a slap's boost.
const COMES_BACK_BY = 8; // How fast one that's out of sight comes past.
const WAITS_WITHIN = 45;
const STOPS_BEHIND = 7;

export function rivalSpeed({ gap, wish, playerSpeed, resting, rushing, comingBack, cruise }) {
  if (resting) {
    // Everyone waits for a child who's resting. Those in front go on a little way and stop, still in
    // view, and those behind stop before they get there, so resting never costs a place.
    if (gap >= 0) return cruise * clamp(1 - gap / WAITS_WITHIN, 0, 1);
    return clamp((-gap - STOPS_BEHIND) * 1.2, 0, cruise);
  }
  if (comingBack) return playerSpeed + COMES_BACK_BY;
  if (rushing) return Math.max(0, playerSpeed - LEFT_BEHIND_BY);
  return Math.max(0, playerSpeed + clamp((wish - gap) * 0.35, -FALLS_BACK_AT_MOST, GAINS_AT_MOST));
}

/** Whether two cars are touching. Each is { distance, lateral }. */
export function touching(a, b) {
  return Math.abs(a.distance - b.distance) < CAR_LENGTH && Math.abs(a.lateral - b.lateral) < CAR_WIDTH;
}
