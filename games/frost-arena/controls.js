// Frost Arena's controls: two hands in the air, used the way two thumbs are on a phone shooter.
//
// The hand that isn't in play is on a stick. It appears wherever that hand comes to rest, and moving the hand away
// from there walks that way: up is forwards, down is back, and to either side is a sidestep, as fast as the hand
// is far out. Pushed right out forwards is a sprint. Closing that hand changes the magazine.
//
// The hand in play looks round. Inside its ring the view follows the hand directly, as it follows a thumb dragged
// across a screen, so aiming is a matter of moving the hand to where the target is. Pushed past the ring, the view
// keeps turning that way, faster the further out it is, which is how to turn right round without running out of
// arm. Only across counts: a hand moving from side to side in the air goes in an arc, a little up and down as it
// goes, and the yard is flat, so the view stays level and nothing a hand does tips it off a target. Closing that
// hand, or pinching thumb and first finger together, pulls the trigger.
//
// A thumb can be lifted and put down again somewhere else, and a hand in the air can't. So wherever a hand comes
// to rest for a moment, its ring comes to rest under it, without the view moving: there's always as much room to
// aim either way, the edge of the ring is always the same push away, and stopping a turn is just stopping. The
// stick does the same for a hand resting near its middle, so a hand that drifts never sets anyone walking.
//
// A hand in the air trembles, and a camera's idea of where it is trembles more, so where each hand is goes
// through a filter that holds still when the hand does and keeps up when it moves fast (the 1 € filter of Casiez,
// Roussel and Vogel, which also hurries when it has fallen behind), and then has a hair's breadth of play in it,
// less than anyone can move a hand on purpose, so that a hand held still is a view held perfectly still.
// Closing a hand moves the middle of it in the picture, so in each look of the tracker's in which the fingers
// have moved, the hand is taken to have gone on as it was going, and not wherever the middle of it seems to
// have gone: pulling the trigger doesn't pull the aim. What's left out that way is never more than fingers
// could have shifted it by, and it's all back once the fingers are back as they were, so nothing adds up and
// a hand is never held back. Everything is measured in palm lengths, so it's the same however far from the
// camera anyone sits.
//
// What pulls the trigger, changes the magazine and sprints is for whoever is playing to say: each is given to
// one of the things a hand can be told to be doing with its fingers, on either hand. A fist, a pinch of the thumb
// and any one finger, the first finger curled like a trigger, pointing, and two fingers out can all be told
// apart, each from a single look of the tracker.
//
// No screen or camera in this file: it's given what the hand tracker saw, and says what the hands are asking
// for, and what to draw of them. So it all runs in the unit tests.
import { measureHand } from '../../core/hands.js';
import { SHAPES, SHAPE_LOST, SHAPE_MADE, shapeScore } from '../../core/shapes.js';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const PALM_POINTS = [0, 5, 9, 13, 17]; // The wrist and the four knuckles, which move least as the fingers do.
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_KNUCKLE = 5;
const MIDDLE_KNUCKLE = 9;
const PINKY_KNUCKLE = 17;
// The tip of each finger a thumb can pinch against.
export const FINGER_TIPS = { index: 8, middle: 12, ring: 16, pinky: 20 };
const FOUR = Object.keys(FINGER_TIPS);

/* ---------- what can be tuned ---------- */

// The filter. minCutoff is how low its cutoff goes for a hand held still, in hertz, and beta how quickly that
// rises with speed, in palm lengths a second: still, the tremble of a hand and of the tracker is mostly gone, and
// at the speed of a quick turn there's a few hundredths of a second between the hand and the view. catchUp is
// how much the cutoff rises for each palm length the filter has fallen behind by, beyond slack, so that it's
// never left creeping up on a hand that has stopped. play is how far the hand has to move before what comes out
// moves at all, in palm lengths: about a millimetre.
export const FILTER = { minCutoff: 1, beta: 1.8, speedCutoff: 2, catchUp: 90, slack: 0.012, play: 0.01 };
const SHOW_MS = 20; // Between one look from the tracker and the next, what's drawn glides to it this quickly.
const AHEAD_MOST_MS = 35; // And it carries on the way the hand was going for as long as this with nothing new...
const AHEAD_FROM = [0.4, 1.2]; // ...if it's going at all: not below the first of these speeds, in palm lengths a second, and fully from the second.

// A hand has landed once it's been nearly still for a moment, with the filter caught up with it, or after this
// long whatever it's doing.
const SETTLED_SPEED = 1; // Palm lengths a second.
const SETTLED_WITHIN = 0.03; // Palm lengths between where the hand is and where the filter has it.
const SETTLED_MS = 130;
const LANDED_WITHIN_MS = 700;
const LOST_AFTER_MS = 320; // A hand not seen for this long has gone, and lands afresh when it's back.
const TRIGGER_KEPT_MS = 140; // A closed hand the tracker has lost sight of counts as closed for no longer than this.
const HELD_FOR_MS = 400; // One that's cut off by the edge of the picture, or touching the other, holds what it had this long.

// A hand is resting once it's been going slower than this, in palm lengths a second, for this long. Its ring, or its
// stick, then comes to rest under it, most of the way in about this long.
const RESTING_SPEED = 0.3;
const RESTING_MS = 420;
const SETTLING_MS = 160;

// Fingers on the move: between one look of the tracker's and the next, the tip of some finger has come this much
// nearer the wrist or gone this much further from it, in palm lengths. The middle of a hand shifts in the
// picture as its fingers close, by a tenth of a palm length or so, and that isn't the hand moving. So in a look
// like that the hand is taken to have gone on as it was going just before, and not wherever the middle of it
// seems to have gone.
const FINGERS_MOVED = 0.06;
// How it was going is what the filter made of it, and no more than it really went in the last look before its
// fingers moved, as the filter is slow to hear that a hand has stopped, and no more than CARRIED_MOST, in palm
// lengths a second, as a hand going faster than that is about to slow down more often than not. It fades from
// what the hand is taken to be doing this quickly: someone pulling a trigger has usually just stopped, or is
// about to. And it's never taken to have gone further that way than the middle of it did in that look, so a
// hand that has stopped is never carried on past where it stopped.
const CARRIED_ON_MS = 70;
const CARRIED_MOST = 1.2;
// A look in which the middle of the hand has gone this much faster than that, or more, in palm lengths a second,
// is one no fingers could have made: all of it counts, so a quick turn is never swallowed.
const SWEEPING = 2.5;
// The tracker's first look at fingers that have just moved is a little out, and its next look or two put that
// right. So for this long after the fingers of a hand that was still (going slower than STILL_BELOW) have
// stopped, where the middle of it goes is left out too, for no more than SETTLE_MOST of a palm length in all:
// that's the tracker making its mind up, and anything more is a hand setting off.
const FINGERS_SETTLE_MS = 130;
const STILL_BELOW = 0.3;
const SETTLE_MOST = 0.03;
// What's left out is never more than fingers could have shifted the middle of the hand by: SHIFT_PER_FINGERS
// palm lengths for each palm length their tips have moved from how the hand is held when it's at rest, which
// comes to about twice what a hand shifts by in closing, and next to nothing (SHIFT_BASE) for fingers that are
// back as they were. So closing a hand and opening it again leaves the aim exactly where it was, however many
// times, and a hand moving fast, which is a blurred one whose fingers are anyone's guess from one look to the
// next, is never held back by more than a guess is worth, and not at all once the guessing stops.
const SHIFT_BASE = 0.01;
const SHIFT_PER_FINGERS = 0.25;
// How the hand is held at rest follows how it's held, this much of the way each look, while its fingers are still
// with nothing left out.
const RESTED_SHARE = 0.25;
// A look that comes later than this after the one before, three or four of the camera's pictures on, says
// nothing about how the hand got there.
const LOOK_MOST_MS = 120;

// Telling what a hand's fingers are doing. A fist is a hand closed this far, with every finger curled this far,
// and it has to open, or straighten a finger, this far to stop being one. A pinch is the tips of the thumb and a
// finger this near each other, in palm widths, with the fingers that aren't pinching left this straight, which
// is what tells it from a hand on its way to a fist. A finger is curled, as for a trigger, below curled, and
// straight again above uncurled.
export const TRIGGER = { closedBelow: 0.26, openAbove: 0.4, fingersBelow: 0.4, fingerAbove: 0.55, pinchedBelow: 0.3, apartAbove: 0.5, straight: 0.45, curled: 0.3, uncurled: 0.5 };

// What a hand can be told to be doing. name is for the panel, words for the card that says what each hand
// does, and mark the little picture of it. link is the two points of the hand it joins, for drawing it on the
// camera's picture.
export const GESTURES = {
  close: { name: 'Closed hand: a fist, or a pinch of thumb and first finger', words: 'close it, or pinch', mark: '✊' },
  fist: { name: 'Fist', words: 'make a fist', mark: '✊' },
  'pinch-index': { name: 'Pinch: thumb and first finger', words: 'pinch thumb and first finger', mark: '🤏', link: [THUMB_TIP, FINGER_TIPS.index] },
  'pinch-middle': { name: 'Pinch: thumb and middle finger', words: 'pinch thumb and middle finger', mark: '🤏', link: [THUMB_TIP, FINGER_TIPS.middle] },
  'pinch-ring': { name: 'Pinch: thumb and ring finger', words: 'pinch thumb and ring finger', mark: '🤏', link: [THUMB_TIP, FINGER_TIPS.ring] },
  'pinch-pinky': { name: 'Pinch: thumb and little finger', words: 'pinch thumb and little finger', mark: '🤏', link: [THUMB_TIP, FINGER_TIPS.pinky] },
  trigger: { name: 'First finger curled, like a trigger', words: 'curl your first finger', mark: '☝️' },
  point: { name: 'Pointing: first finger out, the rest closed', words: 'point with one finger', mark: '☝️' },
  two: { name: 'Two fingers out, the rest closed', words: 'show two fingers', mark: '✌️' },
};
// The fingers that have to be left straight for a pinch of the thumb and each finger to count.
const LEFT_STRAIGHT = { index: ['middle', 'ring', 'pinky'], middle: ['index', 'pinky'], ring: ['index', 'middle'], pinky: ['index', 'middle'] };

// What each thing a player can do is given to, unless they say otherwise: a hand, 'aim' for the one that looks
// round and 'move' for the one on the stick, and what it's doing. Sprinting can also be 'stick', the stick pushed
// right out forwards, and anything but firing can be 'off'.
export const ACTIONS = ['fire', 'reload', 'sprint'];
export const BINDINGS = { fire: 'aim:close', reload: 'move:fist', sprint: 'stick' };

/** What a binding says: { hand, gesture }, or 'stick' or 'off', or null for one that isn't any of those. */
export function readBinding(value) {
  if (value === 'stick' || value === 'off') return value;
  const [hand, gesture] = String(value ?? '').split(':');
  return (hand === 'aim' || hand === 'move') && Object.hasOwn(GESTURES, gesture) ? { hand, gesture } : null;
}

/**
 * What a hand's fingers are doing, from one look of the tracker: for each of GESTURES, whether it's making it.
 * hand is what readHand made of the look, and was what the hand was making at the last one, as each takes a
 * little more to stop than it took to start, so none of them flickers.
 */
export function gesturesOf(hand, was = {}) {
  const { openness, fingers, pinches } = hand;
  const most = Math.max(...FOUR.map((finger) => fingers[finger]));
  const on = {};
  on.fist = was.fist ? !(openness > TRIGGER.openAbove || most > TRIGGER.fingerAbove) : openness < TRIGGER.closedBelow && most < TRIGGER.fingersBelow;
  const nearest = Math.min(...FOUR.map((finger) => pinches[finger]));
  for (const finger of FOUR) {
    const key = `pinch-${finger}`;
    const near = pinches[finger];
    // The thumb against this finger and no other, with the rest of the hand left open. A fist isn't a pinch.
    const made = near < TRIGGER.pinchedBelow && near === nearest && Math.min(...LEFT_STRAIGHT[finger].map((other) => fingers[other])) >= TRIGGER.straight;
    on[key] = !on.fist && (was[key] ? near < TRIGGER.apartAbove : made);
  }
  // The first finger curled with the others left straight, as round a trigger.
  const others = Math.min(fingers.middle, fingers.ring, fingers.pinky);
  on.trigger = !on.fist && others >= TRIGGER.straight && fingers.index < (was.trigger ? TRIGGER.uncurled : TRIGGER.curled);
  // The shapes the other games know: some fingers straight, and the rest curled.
  for (const shape of ['point', 'two']) on[shape] = shapeScore(fingers, SHAPES[shape]) >= (was[shape] ? SHAPE_LOST : SHAPE_MADE);
  on.close = on.fist || on['pinch-index'];
  return on;
}

// The stick: how far the hand goes for full speed, in palm lengths, how much of that does nothing, how far past it
// the stick is dragged along rather than left behind, and how far out and how nearly forwards a sprint is.
export const STICK = { reach: 0.62, dead: 0.2, follow: 1.25, sprintFrom: 0.94, sprintWithin: 0.72 };

// The look pad. reach is the ring, in palm lengths. direct is how far the view turns for the hand going from the
// middle of the ring to its edge, at each sensitivity. Past the ring, the view turns at up to turnMost radians a
// second, reached edge further out, rising gently at first so a little past it is a slow, fine turn.
// wander is how far from where the hand landed its ring will follow it, in rings: a hand that has gone further than
// that has to come back, or be taken out of the picture and put back, which lands it afresh.
export const PAD = { reach: 0.7, edge: 0.55, turnMost: 3.6, curve: 1.5, wander: 2 };
export const SENSITIVITY = { low: 0.36, medium: 0.48, high: 0.62 };

/* ---------- the filter ---------- */

const alphaFor = (cutoff, dt) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

/**
 * The filter, for one number that changes with time. Time is in seconds. unit is what speeds and distances are
 * measured in for it: the length of the palm, so it behaves the same however big the hand is in the picture.
 */
export class OneEuro {
  constructor({ minCutoff = FILTER.minCutoff, beta = FILTER.beta, speedCutoff = FILTER.speedCutoff, catchUp = FILTER.catchUp, slack = FILTER.slack, play = FILTER.play } = {}) {
    Object.assign(this, { minCutoff, beta, speedCutoff, catchUp, slack, play });
    this.reset();
  }

  reset() {
    this.value = null; // Filtered.
    this.out = null; // And with the play taken up: what's used.
    this.speed = 0;
    this.at = null;
  }

  /** The next value, as it came, and when. Returns it steadied. */
  feed(value, at, unit = 1) {
    if (this.value === null) {
      // The first one is taken as it is.
      Object.assign(this, { value, raw: value, out: value, at });
      return value;
    }
    // One that came with no time passed changes nothing.
    if (!(at > this.at)) return this.out;
    const dt = at - this.at;
    this.at = at;
    // How fast it's going, from one unfiltered value to the next, itself steadied a little.
    this.speed += ((value - this.raw) / dt - this.speed) * alphaFor(this.speedCutoff, dt);
    this.raw = value;
    const behind = Math.max(0, Math.abs(value - this.value) / unit - this.slack);
    const cutoff = this.minCutoff + (this.beta * Math.abs(this.speed)) / unit + this.catchUp * behind;
    this.value += (value - this.value) * alphaFor(cutoff, dt);
    // The play: what comes out only moves once the filtered value has moved this far from it.
    const play = this.play * unit;
    if (this.value > this.out + play) this.out = this.value - play;
    else if (this.value < this.out - play) this.out = this.value + play;
    return this.out;
  }
}

/* ---------- one hand ---------- */

/** How far the fingers have moved between two looks: the most any fingertip's distance from the wrist differs by. */
const travel = (reach, from) => Math.max(...reach.map((value, index) => Math.abs(value - from[index])));

/**
 * What the tracker saw of one hand, from its view in the hand monitor's snapshot (see core/hands.js): where the
 * middle of the palm is, in frame heights, how long the palm is, how open the hand is and how straight each
 * finger, how near the tip of the thumb is to the tip of each finger, and whether it can be trusted: not cut off,
 * not too far away, and not touching the other hand. Null for no hand.
 */
export function readHand(view, aspect, overlap = false) {
  const points = view?.image;
  if (!points || view.status === 'missing' || points.length < 21) return null;
  let x = 0;
  let y = 0;
  for (const index of PALM_POINTS) {
    x += (points[index].x * aspect) / PALM_POINTS.length;
    y += points[index].y / PALM_POINTS.length;
  }
  const between = (a, b) => Math.hypot((points[a].x - points[b].x) * aspect, points[a].y - points[b].y);
  const size = between(WRIST, MIDDLE_KNUCKLE);
  const width = between(INDEX_KNUCKLE, PINKY_KNUCKLE);
  if (!(size > 0) || !(width > 0) || !Number.isFinite(x + y)) return null;
  // How open it is, and how straight each finger, straight from this look, rather than the monitor's smoothed
  // numbers, which are slower.
  const world = view.world?.length >= 21 ? view.world : null;
  const measured = world ? measureHand(world) : null;
  const openness = Number.isFinite(measured?.openness) ? measured.openness : view.openness;
  const fingers = measured?.fingers ?? view.fingers ?? {};
  // How far the tip of each finger is from the wrist, in palm lengths: it changes as the fingers move, and not
  // as the hand goes from place to place. In the round, as the tracker has the hand, or failing that as it is
  // in the picture.
  const solid = world ?? points.map((point) => ({ x: point.x * aspect, y: point.y, z: 0 }));
  const apart = (a, b) => Math.hypot(solid[a].x - solid[b].x, solid[a].y - solid[b].y, solid[a].z - solid[b].z);
  const length = apart(WRIST, MIDDLE_KNUCKLE) || 1;
  return {
    points,
    x,
    y,
    size,
    openness,
    reach: [THUMB_TIP, ...Object.values(FINGER_TIPS)].map((tip) => apart(tip, WRIST) / length),
    fingers: Object.fromEntries(['thumb', ...FOUR].map((finger) => [finger, Number.isFinite(fingers[finger]) ? fingers[finger] : openness])),
    // How near the tip of the thumb is to the tip of each finger, in palm widths.
    pinches: Object.fromEntries(FOUR.map((finger) => [finger, between(THUMB_TIP, FINGER_TIPS[finger]) / width])),
    usable: !overlap && view.reason !== 'edge' && view.reason !== 'small' && view.reason !== 'overlap',
  };
}

/**
 * One hand, followed from one look of the tracker's to the next: where it's come to rest, how far it is from
 * there in palm lengths, steadied, and what its fingers are doing.
 */
export class TrackedHand {
  constructor(filter = FILTER) {
    this.filterX = new OneEuro(filter);
    this.filterY = new OneEuro(filter);
    this.forget();
  }

  forget() {
    this.seenAt = null; // When it was last seen at all.
    this.cameAt = null; // When it came into the picture.
    this.stillSince = null;
    this.home = null; // Where its stick or ring is, in frame heights, once it has landed.
    this.landedAt = null; // Where it landed.
    this.restingSince = null;
    this.palm = 0; // How long its palm is, in frame heights.
    this.points = null;
    this.target = null; // Where the filter has it, in frame heights, and how fast it's going.
    this.velocity = { x: 0, y: 0 };
    this.sampledAt = null;
    this.shown = null; // Where it's drawn, and counted, this frame.
    this.making = {}; // What its fingers are doing: see gesturesOf.
    this.made = new Set(); // What they've just begun to do, this frame.
    this.usable = false;
    this.unusableSince = null;
    this.raw = null; // Where the tracker last had the middle of it, in frame heights...
    this.place = null; // ...and where that is with what its fingers have shifted it by left out.
    this.left = { x: 0, y: 0 }; // What's left out, in frame heights.
    this.reach = null; // How far each fingertip was from the wrist at the last look, to tell fingers on the move.
    this.rested = null; // And how far each is with the hand held as it is at rest, with nothing left out.
    this.fingersMovedAt = -Infinity;
    this.clean = null; // How fast the hand went in the last look, if its fingers weren't moving in it.
    this.carried = null; // While they are: which way the hand was going when they began, how fast, and when that was.
    this.steadied = false; // Whether the last look was one of those.
    this.filterX.reset();
    this.filterY.reset();
  }

  get landed() {
    return this.home !== null;
  }

  /** Whether its fingers are doing this, as far as a hand that can be trusted goes. */
  is(gesture) {
    return this.usable && Boolean(this.making[gesture]);
  }

  /** Whether they've just begun to, this frame. */
  began(gesture) {
    return this.usable && this.made.has(gesture);
  }

  /** It's taken off its stick, or its ring, while still in the picture: it lands again once it can be trusted. */
  lift(now) {
    Object.assign(this, { home: null, landedAt: null, restingSince: null, target: null, shown: null, stillSince: null, cameAt: now, raw: null, place: null, left: { x: 0, y: 0 }, reach: null, rested: null, fingersMovedAt: -Infinity, clean: null, carried: null, steadied: false, velocity: { x: 0, y: 0 } });
    this.filterX.reset();
    this.filterY.reset();
  }

  /** How far it is from where it came to rest, in palm lengths: across, and down the picture. */
  get offset() {
    if (!this.home || !this.shown || !(this.palm > 0)) return { x: 0, y: 0 };
    return { x: (this.shown.x - this.home.x) / this.palm, y: (this.shown.y - this.home.y) / this.palm };
  }

  /**
   * One frame. hand is what readHand made of the tracker's last look, or null, and now is the time in
   * milliseconds. A look is new when its points aren't the ones seen last frame.
   */
  update(hand, now, dt) {
    this.made.clear();
    if (!hand) {
      // Not seen. For a moment it's as it was, in case the tracker only dropped a look. Then it's gone. What
      // its fingers were doing is let go sooner than that: a hand nobody can see mustn't go on firing.
      if (this.seenAt !== null && now - this.seenAt > TRIGGER_KEPT_MS) this.making = {};
      if (this.seenAt !== null && now - this.seenAt > LOST_AFTER_MS) this.forget();
      else this.glide(now, dt, false);
      return;
    }
    const fresh = hand.points !== this.points;
    this.points = hand.points;
    if (this.seenAt === null) this.cameAt = now;
    this.seenAt = now;

    // One that can't be trusted, cut off by the edge of the picture, too far away or touching the other hand,
    // holds what it had for a moment, though it never fires: see readPad. After that it has to land again.
    if (!hand.usable) {
      this.unusableSince ??= now;
      this.usable = false;
      if (now - this.unusableSince > HELD_FOR_MS) this.lift(now);
      return;
    }
    this.unusableSince = null;
    this.usable = true;

    if (fresh) this.sample(hand, now);
    this.glide(now, dt, true);
    if (!this.landed) this.land(now);
  }

  /** A new look from the tracker. */
  sample(hand, now) {
    // The palm's length changes slowly, as someone leans in or back: it's followed slowly, so that a look in
    // which the hand is a little turned doesn't change what everything else is measured in.
    this.palm = this.palm > 0 ? this.palm + (hand.size - this.palm) * 0.08 : hand.size;

    // What its fingers are doing: at once, from this look.
    const was = this.making;
    this.making = gesturesOf(hand, was);
    for (const [gesture, on] of Object.entries(this.making)) {
      if (on && !was[gesture]) this.made.add(gesture);
    }

    // How far the middle of the hand has gone since the last look, as the tracker has it, and how fast.
    const since = this.sampledAt === null ? 0 : (now - this.sampledAt) / 1000;
    const looked = Boolean(this.raw) && since > 0 && since * 1000 <= LOOK_MOST_MS;
    const step = looked ? { x: hand.x - this.raw.x, y: hand.y - this.raw.y } : { x: 0, y: 0 };

    // Whether its fingers have moved since then: the middle of the hand shifts in the picture as they do, and
    // that isn't the hand moving.
    const moved = looked && travel(hand.reach, this.reach ?? hand.reach) > FINGERS_MOVED;
    this.reach = hand.reach;
    this.rested ??= hand.reach;
    this.steadied = false;
    let { left } = this;
    // Or have only just stopped, on a hand that was still: the tracker is still making its mind up.
    const settling = !moved && looked && Boolean(this.carried?.still) && now - this.fingersMovedAt <= FINGERS_SETTLE_MS;
    if (moved || settling) {
      if (moved) this.fingersMovedAt = now;
      // In this look the hand is taken to have gone on as it was going, though no further than the middle of
      // it went that way, and the rest of how far the middle of it went is left out: unless that's further
      // than any fingers could have shifted it.
      this.carried ??= this.carriedFrom(now);
      const { way, speed } = this.carried;
      const on = Math.min(speed * Math.exp(-(now - this.carried.since) / CARRIED_ON_MS) * since, Math.max(0, step.x * way.x + step.y * way.y));
      const rest = { x: step.x - way.x * on, y: step.y - way.y * on };
      const far = Math.hypot(rest.x, rest.y) / this.palm;
      if (moved ? far / since <= SWEEPING : this.carried.settled + far <= SETTLE_MOST) {
        if (!moved) this.carried.settled += far;
        left = { x: left.x + rest.x, y: left.y + rest.y };
        this.steadied = true;
      }
    }
    if (!this.steadied) {
      // A look in which the hand went where the tracker has it: that's how it's going, if the look says.
      this.carried = null;
      this.clean = looked ? { x: step.x / since, y: step.y / since } : null;
      // And how the hand is held at rest, while its fingers are still with nothing left out.
      if (!moved && Math.hypot(left.x, left.y) <= SHIFT_BASE * this.palm) {
        this.rested = this.rested.map((value, index) => value + (hand.reach[index] - value) * RESTED_SHARE);
      }
    }
    // No more is ever left out than fingers this far from where they rest could have shifted the hand by.
    const most = (SHIFT_BASE + SHIFT_PER_FINGERS * travel(hand.reach, this.rested)) * this.palm;
    const out = Math.hypot(left.x, left.y);
    this.left = out > most ? { x: (left.x * most) / out, y: (left.y * most) / out } : left;

    this.raw = { x: hand.x, y: hand.y };
    this.place = { x: hand.x - this.left.x, y: hand.y - this.left.y };
    const seconds = now / 1000;
    const x = this.filterX.feed(this.place.x, seconds, this.palm);
    const y = this.filterY.feed(this.place.y, seconds, this.palm);
    this.velocity = { x: this.filterX.speed, y: this.filterY.speed };
    this.target = { x, y };
    this.sampledAt = now;
  }

  /**
   * Its fingers have begun to move. How the hand was going just before they did: which way, as the filter has
   * it, and how fast, in frame heights a second: what the filter made of it, and no more than it really went
   * that way in the last look. still says it was hardly going at all, and settled is how far the tracker's
   * settling has been left out since.
   */
  carriedFrom(now) {
    const { x, y } = this.velocity;
    const going = Math.hypot(x, y);
    const way = going > 0 ? { x: x / going, y: y / going } : { x: 0, y: 0 };
    const really = this.clean ? Math.max(0, this.clean.x * way.x + this.clean.y * way.y) : 0;
    const speed = Math.min(going, really, CARRIED_MOST * this.palm);
    return { way, speed, still: speed < STILL_BELOW * this.palm, since: now, settled: 0 };
  }

  /** Between looks, what's drawn goes smoothly to where the filter has the hand, a little way ahead of it. */
  glide(now, dt, seen) {
    if (!this.target) return;
    // A hand on the move is drawn a little ahead of the tracker's last look at it, by as long ago as that was.
    // A hand that's still isn't: how fast it's going is only a guess, and a guess mustn't make it shake.
    const speed = this.palm > 0 ? Math.hypot(this.velocity.x, this.velocity.y) / this.palm : 0;
    const going = clamp((speed - AHEAD_FROM[0]) / (AHEAD_FROM[1] - AHEAD_FROM[0]), 0, 1);
    const ahead = seen ? (clamp(now - this.sampledAt, 0, AHEAD_MOST_MS) / 1000) * going : 0;
    const to = { x: this.target.x + this.velocity.x * ahead, y: this.target.y + this.velocity.y * ahead };
    if (!this.shown) {
      this.shown = to;
      return;
    }
    const share = 1 - Math.exp(-(dt * 1000) / SHOW_MS);
    this.shown = { x: this.shown.x + (to.x - this.shown.x) * share, y: this.shown.y + (to.y - this.shown.y) * share };
  }

  /** It has come to rest once it's been nearly still for a moment. That's where its stick, or its ring, is. */
  land(now) {
    if (!this.target || !this.place || !(this.palm > 0)) return;
    const speed = Math.hypot(this.velocity.x, this.velocity.y) / this.palm;
    const behind = Math.hypot(this.place.x - this.target.x, this.place.y - this.target.y) / this.palm;
    this.stillSince = speed < SETTLED_SPEED && behind < SETTLED_WITHIN ? this.stillSince ?? now : null;
    const settled = this.stillSince !== null && now - this.stillSince >= SETTLED_MS;
    if (!settled && now - this.cameAt < LANDED_WITHIN_MS) return;
    this.home = { ...this.target };
    this.landedAt = { ...this.target };
    this.shown = { ...this.target };
  }

  /**
   * A hand that's resting, nearly still for a moment and no further out than within palm lengths across, has
   * its stick or ring come to rest under it. wander, if given, is how far from where the hand landed that can
   * take it, in palm lengths. Returns whether it moved.
   */
  rest(now, dt, { within, wander = Infinity }) {
    if (!this.landed || !this.shown || !this.usable) {
      this.restingSince = null;
      return false;
    }
    const speed = Math.hypot(this.velocity.x, this.velocity.y) / this.palm;
    const { x, y } = this.offset;
    if (speed > RESTING_SPEED || !within(x, y)) {
      this.restingSince = null;
      return false;
    }
    this.restingSince ??= now;
    if (now - this.restingSince < RESTING_MS) return false;
    const share = 1 - Math.exp(-(dt * 1000) / SETTLING_MS);
    const most = wander * this.palm;
    const to = {
      x: clamp(this.home.x + (this.shown.x - this.home.x) * share, this.landedAt.x - most, this.landedAt.x + most),
      y: clamp(this.home.y + (this.shown.y - this.home.y) * share, this.landedAt.y - most, this.landedAt.y + most),
    };
    const moved = to.x !== this.home.x || to.y !== this.home.y;
    this.home = to;
    return moved;
  }

  /** Its resting place is dragged along behind it, so it's never further than this many palm lengths away. */
  dragHome(most) {
    const { x, y } = this.offset;
    const away = Math.hypot(x, y);
    if (!this.landed || away <= most) return;
    const extra = (away - most) / away;
    this.home = { x: this.home.x + x * extra * this.palm, y: this.home.y + y * extra * this.palm };
  }
}

/* ---------- both hands ---------- */

export class Controls {
  /**
   * sensitivity is 'low', 'medium' or 'high': how far the view turns for the hand crossing its ring. bindings is
   * what each of ACTIONS is given to, as in BINDINGS.
   */
  constructor({ sensitivity = 'medium', bindings = {} } = {}) {
    this.move = new TrackedHand();
    this.aim = new TrackedHand();
    this.setSensitivity(sensitivity);
    this.setBindings(bindings);
    this.directYaw = 0; // How far the hand in the ring has the view turned from where it would be at its middle.
    this.reset();
  }

  setSensitivity(sensitivity) {
    this.direct = SENSITIVITY[sensitivity] ?? SENSITIVITY.medium;
  }

  /**
   * What each thing a player can do is given to. Anything that isn't a hand and something it can be told to be
   * doing is what it is out of the box, and firing can't be switched off.
   */
  setBindings(bindings = {}) {
    this.bindings = {};
    for (const action of ACTIONS) {
      const read = readBinding(bindings[action]);
      const allowed = read === 'stick' ? action === 'sprint' : read === 'off' ? action !== 'fire' : Boolean(read);
      this.bindings[action] = allowed ? read : readBinding(BINDINGS[action]);
    }
  }

  /** Whether what an action is given to is being done, held, or has just begun, by the hand it's given to. */
  doing(action, began = false) {
    const binding = this.bindings[action];
    if (typeof binding === 'string') return false;
    const hand = this[binding.hand];
    return began ? hand.began(binding.gesture) : hand.is(binding.gesture);
  }

  /** Both hands are let go of, as when a match starts or the camera stops. */
  reset() {
    this.move.forget();
    this.aim.forget();
    this.directYaw = 0;
    this.out = this.nothing();
  }

  nothing() {
    return {
      moveX: 0, // To the right, from -1 to 1.
      moveY: 0, // Forwards, from -1 to 1.
      sprint: false,
      turn: 0, // How far the view turns this frame, in radians, to the right.
      fire: false,
      reload: false, // The magazine is to be changed: true for the one frame what it's given to began in.
      hands: 0, // How many hands can be seen.
      // What to draw: each from -1 to 1 across and down its ring, with on for a hand that has landed, and each
      // button lit while what it's given to is being done.
      stick: { on: false, seen: false, x: 0, y: 0 },
      pad: { on: false, seen: false, x: 0, y: 0, edge: 0 },
      buttons: { fire: false, reload: false, sprint: false },
    };
  }

  /**
   * One frame. snapshot is the hand monitor's, aspect the camera picture's width over its height, now the time
   * in milliseconds, and dt the frame's length in seconds. slow, from 0 to 1, slows the view while the sights are
   * on someone, for the help with aiming. Returns what the hands are asking for: see nothing() above.
   */
  update(snapshot, aspect, now, dt, { slow = 1 } = {}) {
    const overlap = Boolean(snapshot?.overlap);
    const aimHand = readHand(snapshot?.[snapshot.side], aspect, overlap);
    const moveHand = readHand(snapshot?.other, aspect, overlap);
    this.aim.update(aimHand, now, dt);
    this.move.update(moveHand, now, dt);
    const out = this.nothing();
    out.hands = Number(Boolean(aimHand)) + Number(Boolean(moveHand));
    this.readStick(out, now, dt);
    this.readPad(out, now, dt, slow);
    // The trigger is held for as long as what it's given to is, and the magazine is changed once each time what
    // that's given to begins. A sprint is the stick right out forwards, or what it's given to, held, with the
    // stick pushed forwards at all.
    out.fire = this.doing('fire');
    out.reload = this.doing('reload', true);
    if (this.bindings.sprint !== 'stick') out.sprint = this.doing('sprint') && out.moveY > 0;
    out.buttons = { fire: out.fire, reload: this.doing('reload'), sprint: out.sprint };
    this.out = out;
    return out;
  }

  /**
   * What to draw on the camera's picture of each hand, as pairs of its points to join: the thumb and the finger
   * it's pinched against, for whichever pinches something is given to.
   */
  links() {
    const out = { aim: [], move: [] };
    for (const binding of Object.values(this.bindings)) {
      if (typeof binding === 'string') continue;
      const names = binding.gesture === 'close' ? ['pinch-index'] : [binding.gesture];
      for (const name of names) {
        const { link } = GESTURES[name];
        if (link && this[binding.hand].is(name)) out[binding.hand].push(link);
      }
    }
    return out;
  }

  /** The stick: which way and how fast to walk. */
  readStick(out, now, dt) {
    const { move } = this;
    out.stick.seen = move.seenAt !== null;
    if (!move.landed) return;
    // A hand resting near the middle of the stick has the stick come to rest under it, so drifting never
    // becomes walking. A hand held out on it is walking, and stays where it is.
    move.rest(now, dt, { within: (x, y) => Math.hypot(x, y) <= STICK.reach * STICK.dead });
    move.dragHome(STICK.reach * STICK.follow);
    const { x, y } = move.offset;
    const away = Math.hypot(x, y) / STICK.reach;
    const far = Math.min(1, away);
    const [across, down] = away > 0 ? [x / STICK.reach / away, y / STICK.reach / away] : [0, 0];
    Object.assign(out.stick, { on: true, x: across * far, y: down * far });
    if (far <= STICK.dead) return;
    const push = (far - STICK.dead) / (1 - STICK.dead);
    out.moveX = across * push;
    out.moveY = -down * push;
    out.sprint = far >= STICK.sprintFrom && -down >= STICK.sprintWithin;
  }

  /** The look pad: how far to turn this frame. */
  readPad(out, now, dt, slow) {
    const { aim } = this;
    out.pad.seen = aim.seenAt !== null;
    if (!aim.landed) {
      // No hand on the pad: the view stays where it is, and the next one to land starts from its middle.
      this.directYaw = 0;
      return;
    }
    const { x, y } = aim.offset;
    const across = x / PAD.reach;
    const down = y / PAD.reach;
    // Inside the ring, the view is turned as far as the hand is across it.
    const direct = clamp(across, -1, 1) * this.direct;
    out.turn = (direct - this.directYaw) * slow;
    this.directYaw = direct;
    // Past it, the view keeps turning: gently just outside, and quickly further out.
    const past = clamp((Math.abs(across) - 1) / PAD.edge, 0, 1);
    out.turn += Math.sign(across) * PAD.turnMost * past ** PAD.curve * dt * slow;
    Object.assign(out.pad, { on: true, x: clamp(across, -1, 1), y: clamp(down, -1, 1), edge: Math.sign(across) * past });
    // A hand resting inside the ring has the ring come to rest under it. The view doesn't move for that: what
    // the hand has it turned by is counted from the ring's new middle. Past the ring the hand is turning the view,
    // however still it's held, and the ring stays where it is.
    if (aim.rest(now, dt, { within: (x) => Math.abs(x) <= PAD.reach, wander: PAD.reach * PAD.wander })) {
      this.directYaw = clamp(aim.offset.x / PAD.reach, -1, 1) * this.direct;
    }
  }
}
