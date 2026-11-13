// Frost Arena's controls: two hands in the air, used the way two thumbs are on the glass of a phone shooter.
//
// A closed hand is a thumb lifted off the glass: it does nothing. A hand that opens is a thumb put down, where it
// opens, and from there it's dragged, with everything counted from that point. Closing it lifts it again, and
// the next time it opens is a fresh tap, wherever that is. Only a hand that's clearly open drags: one that's
// half closed, or loosely closed, or anything else that isn't open, stops where it is at once, as a closed one
// does, and stays as it was last.
//
// The hand that isn't in play walks: dragged away from where it went down, that way, as fast as it is far out,
// up for forwards, down for back, and to either side for a sidestep. Right out forwards is a sprint. Closed,
// the walking stops.
//
// The hand in play looks round: the view turns as far as the hand is dragged across, and no further. Closed, the
// view stays as it is, and the hand can go back to where it's comfortable and open again, as a thumb does that
// has run out of glass. Only across counts: a hand moving from side to side in the air goes in an arc, a little
// up and down as it goes, and the yard is flat, so the view stays level and nothing a hand does tips it off a
// target.
//
// A thumb held up over a closed hand is something else again: the hand stays down, still dragging, and does
// what the thumb is given to do. On the hand in play that's the trigger, and on the other the magazine, so the
// view turns while firing and the walking carries on while reloading.
//
// A hand in the air trembles, and a camera's idea of where it is trembles more, so where each hand is goes
// through a filter that holds still when the hand does and keeps up when it moves fast (the 1 € filter of Casiez,
// Roussel and Vogel, which also hurries when it has fallen behind), and then has a hair's breadth of play in it,
// less than anyone can move a hand on purpose, so that a hand held still is a view held perfectly still.
// Closing a hand, or curling its fingers under a thumb, moves the middle of it in the picture, so in each look of
// the tracker's in which the fingers have moved, the hand is taken to have gone on as it was going, and not
// wherever the middle of it seems to have gone: letting go doesn't nudge the view, and pulling the trigger
// doesn't pull the aim. What's left out that way is never more than fingers could have shifted it by, and it's
// all back once the fingers are back as they were, so nothing adds up and a hand is never held back. Everything
// is measured in palm lengths, so it's the same however far from the camera anyone sits.
//
// What pulls the trigger, changes the magazine and sprints is for whoever is playing to say: each is given to
// one of the things a hand that's down can be told to be doing with its fingers, on either hand. A thumb up, a
// pinch of the thumb and any one finger, the first finger curled like a trigger, pointing, and two fingers out
// can all be told apart.
//
// No screen or camera in this file: it's given what the hand tracker saw, and says what the hands are asking
// for, and what to draw of them. So it all runs in the unit tests.
import { measureHand } from '../../core/hands.js';
import { SHAPES, SHAPE_LOST, SHAPE_MADE, shapeScore, signOf } from '../../core/shapes.js';

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

const LOST_AFTER_MS = 320; // A hand not seen for this long has gone, and goes down afresh when it's back.
const TRIGGER_KEPT_MS = 140; // What a hand the tracker has lost sight of was doing counts for no longer than this.
const HELD_FOR_MS = 400; // One that's cut off by the edge of the picture, or touching the other, holds what it had this long.
// A hand on its way from open to closed, or back, looks for a moment like one with its thumb up, and a thumb
// going up looks for a moment like a hand closing. So a hand has to have been seen doing something in this many
// looks running before it counts: one look is never enough to fire, or to let go.
const ACTS_AFTER_LOOKS = 2;
// A hand that's neither open nor doing anything it's been given to do stops dragging at that very look. Seen
// closed in two looks running it's lifted. Anything else, a hand half closed or on its way from one thing to
// another, is lifted after this many looks, about a sixth of a second: long enough for a thumb to go up, so
// that the hand is still down where it was when it has.
const LIFTED_AFTER_LOOKS = 5;
// One that's open or doing something again after a single look, as when the tracker gets one look of a fast
// hand wrong, has gone on dragging all the while. After any longer than that it takes hold again where it is
// now: however it got there doesn't count, as it doesn't for a hand that was closed.
const SLIP_LOOKS = 1;

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
// is one no fingers could have made: it counts, a look late, unless the middle of the hand is straight back at
// the next look, as the tracker's first look at a hand that has just changed can be. So a quick turn is never
// swallowed, and the tracker catching up with a hand is never a turn.
const SWEEPING = 2.5;
// The tracker's first look at fingers that have just moved is a little out, and its next look or two put that
// right. So for this long after the fingers of a hand that was still (going slower than STILL_BELOW) have
// stopped, where the middle of it goes is left out too, for no more than SETTLE_MOST of a palm length in all:
// that's the tracker making its mind up, and anything more is a hand setting off.
const FINGERS_SETTLE_MS = 130;
const STILL_BELOW = 0.3;
const SETTLE_MOST = 0.03;
// What's left out is never more than fingers could have shifted the middle of the hand by: SHIFT_PER_FINGERS
// palm lengths for each palm length their tips have moved from how the hand was held when it was first seen,
// which comes to about twice what a hand shifts by in closing, and next to nothing (SHIFT_BASE) for fingers
// that are back as they were then. So closing a hand and opening it again leaves the aim exactly where it was, however many
// times, and a hand moving fast, which is a blurred one whose fingers are anyone's guess from one look to the
// next, is never held back by more than a guess is worth, and not at all once the guessing stops.
const SHIFT_BASE = 0.004;
const SHIFT_PER_FINGERS = 0.25;
// A look that comes later than this after the one before, three or four of the camera's pictures on, says
// nothing about how the hand got there.
const LOOK_MOST_MS = 120;

// Telling what a hand's fingers are doing. A hand is closed with every finger curled below fingersBelow, and has
// to straighten one above fingerAbove to stop being. Closed, its thumb is up if the tip of it is further than
// thumbOut from the tip of every finger, in palm widths, and stops being nearer than thumbIn: nearer than that
// it's a fist. A pinch is the tips of the thumb and a finger this near each other, with the fingers that aren't pinching
// left this straight, which is what tells it from a hand on its way to a fist. A finger is curled, as for a
// trigger, below curled, and straight again above uncurled.
export const TRIGGER = { fingersBelow: 0.4, fingerAbove: 0.55, thumbOut: 0.8, thumbIn: 0.6, pinchedBelow: 0.3, apartAbove: 0.5, straight: 0.45, curled: 0.3, uncurled: 0.5 };
// An open hand: how far out its four fingers are, from 0 to 1, with the one that's least out counting as much
// as all four together, so a single curled finger tells. It's open from down, and stays open until it's below
// lift, so it doesn't flicker. A relaxed open hand is 0.8, one tipped back so that its fingers point at the
// camera 0.55, a hand half closed less than a half, and a closed one, or one that's pointing or has its thumb
// up, next to nothing. The thumb doesn't come into it: that's for other things.
export const OPEN = { down: 0.5, lift: 0.4 };

/** How far out a hand's four fingers are, from 0 to 1: see OPEN. */
export function fingersOut(fingers) {
  const four = FOUR.map((finger) => fingers[finger] ?? 0);
  return 0.5 * (four.reduce((sum, value) => sum + value, 0) / four.length) + 0.5 * Math.min(...four);
}

// What a hand that's down can be told to be doing, by the names every game uses for hand shapes: see SHAPES and
// SIGNS in core/shapes.js, which also have what each is called, how a card says it, and its little picture. link
// is the two points of the hand a pinch joins, for drawing it on the camera's picture. A fist isn't one of them:
// that's a hand lifted, which does nothing.
const linked = (id) => (id.startsWith('pinch-') ? { link: [THUMB_TIP, FINGER_TIPS[id.slice(6)]] } : {});
export const GESTURES = Object.fromEntries(
  ['thumb', 'point', 'two', 'three', 'pinch-index', 'pinch-middle', 'pinch-ring', 'pinch-pinky', 'trigger'].map((id) => [id, { ...signOf(id), ...linked(id) }]),
);
// What a hand can be dragging with: open, unless a grown-up says pointing or a few fingers. Whatever it is, that
// hand is down while it's making it, and lifted when it isn't.
export const DRAGS = ['open', 'point', 'two', 'three'];
// Which of a hand's fingers have to be left straight for a pinch of the thumb against each.
const LEFT_STRAIGHT = { index: ['middle', 'ring', 'pinky'], middle: ['index', 'pinky'], ring: ['index', 'middle'], pinky: ['index', 'middle'] };

// What each thing a player can do is given to, unless they say otherwise: a hand, 'aim' for the one that looks
// round and 'move' for the one that walks, and what it's doing. Sprinting can also be 'stick', the walking hand
// dragged right out forwards, and anything but firing can be 'off'.
export const ACTIONS = ['fire', 'reload', 'sprint'];
export const BINDINGS = { fire: 'aim:thumb', reload: 'move:thumb', sprint: 'stick' };

/**
 * What a binding says: { hand, gesture }, or 'stick' or 'off', or null for one that isn't any of those. It can
 * come as 'aim:thumb', or as the grown-ups' panel keeps it, { hand: 'aim', is: 'thumb' }: see core/mapping.js.
 */
export function readBinding(value) {
  if (value === 'stick' || value === 'off') return value;
  const [hand, gesture] = value && typeof value === 'object' ? [value.hand, value.is] : String(value ?? '').split(':');
  return (hand === 'aim' || hand === 'move') && typeof gesture === 'string' && Object.hasOwn(GESTURES, gesture) ? { hand, gesture } : null;
}

/**
 * What a hand's fingers are doing, from one look of the tracker: whether it's open, whether it's a fist, and
 * for each of GESTURES, whether it's making it. hand is what readHand made of the look, and was what the hand
 * was making at the last one, as each takes a little more to stop than it took to start, so none of them
 * flickers.
 */
export function gesturesOf(hand, was = {}) {
  const { fingers, pinches } = hand;
  const most = Math.max(...FOUR.map((finger) => fingers[finger]));
  const nearest = Math.min(...FOUR.map((finger) => pinches[finger]));
  const on = {};
  on.open = fingersOut(fingers) >= (was.open ? OPEN.lift : OPEN.down);
  // Every finger curled: a fist with the thumb in against them, or with the thumb well clear of them all, a
  // thumb up. With the thumb half way out it's neither yet: a thumb on its way up, or down.
  const closed = was.fist || was.thumb ? most <= TRIGGER.fingerAbove : most < TRIGGER.fingersBelow;
  on.thumb = closed && nearest > (was.thumb ? TRIGGER.thumbIn : TRIGGER.thumbOut);
  on.fist = closed && nearest <= TRIGGER.thumbIn;
  for (const finger of FOUR) {
    const key = `pinch-${finger}`;
    const near = pinches[finger];
    // The thumb against this finger and no other, with the rest of the hand left open. A closed hand isn't a pinch.
    const made = near < TRIGGER.pinchedBelow && near === nearest && Math.min(...LEFT_STRAIGHT[finger].map((other) => fingers[other])) >= TRIGGER.straight;
    on[key] = !closed && (was[key] ? near < TRIGGER.apartAbove : made);
  }
  // The first finger curled with the others left straight, as round a trigger.
  const others = Math.min(fingers.middle, fingers.ring, fingers.pinky);
  on.trigger = !closed && others >= TRIGGER.straight && fingers.index < (was.trigger ? TRIGGER.uncurled : TRIGGER.curled);
  // The shapes the other games know: some fingers straight, and the rest curled.
  for (const shape of ['point', 'two', 'three']) on[shape] = !closed && shapeScore(fingers, SHAPES[shape]) >= (was[shape] ? SHAPE_LOST : SHAPE_MADE);
  return on;
}

// Walking: how far the hand is dragged for full speed, in palm lengths, how much of that does nothing, how many
// times that far it can go before where it went down is dragged along behind it, and how far out and how nearly
// forwards a sprint is.
export const STICK = { reach: 0.4, dead: 0.15, follow: 2, sprintFrom: 0.94, sprintWithin: 0.72 };

// Looking round: how far the view turns for the hand dragged a palm length across, in radians, at each
// sensitivity. reach is only for drawing it: how far the knob goes for a palm length.
export const PAD = { reach: 0.5 };
export const SENSITIVITY = { low: 0.8, medium: 1.2, high: 1.7 };

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

  /** It's put where the hand is, standing still, with nothing left to catch up on. */
  jump(value) {
    if (this.value === null) return;
    Object.assign(this, { value, raw: value, out: value, speed: 0 });
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
    // What this hand drags with, one of DRAGS, and what it has been given to do as well: while it's making
    // the one, or doing any of the rest, it's down.
    this.drag = 'open';
    this.keeps = new Set();
    this.forget();
  }

  forget() {
    this.seenAt = null; // When it was last seen at all.
    this.origin = null; // Where it went down, in frame heights, while it's down.
    this.grip = { x: 0, y: 0 }; // How far it has been dragged from there, in palm lengths, as far as counts: see offset.
    this.held = false; // Whether it's open, or doing something it's been given to do, at the tracker's last look.
    this.away = 0; // And for how many looks running it hasn't been.
    this.retaken = false; // Whether it has just taken hold again, this frame, after more than a slip.
    this.palm = 0; // How long its palm is, in frame heights.
    this.points = null;
    this.target = null; // Where the filter has it, in frame heights, and how fast it's going.
    this.velocity = { x: 0, y: 0 };
    this.sampledAt = null;
    this.shown = null; // Where it's drawn, and counted, this frame.
    this.making = {}; // What its fingers are doing: see gesturesOf.
    this.looks = {}; // For how many looks running they've been doing each.
    this.made = new Set(); // What they've just begun to do, this frame.
    this.usable = false;
    this.unusableSince = null;
    this.raw = null; // Where the tracker last had the middle of it, in frame heights...
    this.place = null; // ...and where that is with what its fingers have shifted it by left out.
    this.left = { x: 0, y: 0 }; // What's left out, in frame heights.
    this.reach = null; // How far each fingertip was from the wrist at the last look, to tell fingers on the move.
    this.rested = null; // And how far each was when the hand was first seen, with nothing left out.
    this.fingersMovedAt = -Infinity;
    this.clean = null; // How fast the hand went in the last look, if its fingers weren't moving in it.
    this.carried = null; // While they are: which way the hand was going when they began, how fast, and when that was.
    this.doubted = null; // A quick step left out at the last look, and what leaving it out came to, until the next says whether it was the hand or the tracker.
    this.steadied = false; // Whether the last look was one of those.
    this.filterX.reset();
    this.filterY.reset();
  }

  /** Whether it's down, as a thumb on the glass: open, or doing something it's been given to do. */
  get down() {
    return this.origin !== null;
  }

  /** Whether its fingers are doing this, and have been for a look or two, as far as a hand that can be trusted goes. */
  is(gesture) {
    return this.usable && (this.looks[gesture] ?? 0) >= ACTS_AFTER_LOOKS;
  }

  /** Whether they've just begun to, this frame. */
  began(gesture) {
    return this.usable && this.made.has(gesture);
  }

  /** It's taken off the glass while still in the picture: it goes down again once it can be trusted, and is open. */
  lift() {
    Object.assign(this, { origin: null, grip: { x: 0, y: 0 }, held: false, away: 0, retaken: false, target: null, shown: null, raw: null, place: null, left: { x: 0, y: 0 }, reach: null, rested: null, fingersMovedAt: -Infinity, clean: null, carried: null, doubted: null, steadied: false, velocity: { x: 0, y: 0 }, making: {}, looks: {} });
    this.filterX.reset();
    this.filterY.reset();
  }

  /**
   * How far it has been dragged from where it went down, in palm lengths: across, and down the picture. Only as
   * far as it was while it was open, or doing something: a hand that's neither stays where it was last, until
   * it's one or the other again, or is lifted.
   */
  get offset() {
    return this.origin ? this.grip : { x: 0, y: 0 };
  }

  /** How far it is from where it went down just now, whatever it's doing. */
  get reached() {
    if (!this.origin || !this.shown || !(this.palm > 0)) return { x: 0, y: 0 };
    return { x: (this.shown.x - this.origin.x) / this.palm, y: (this.shown.y - this.origin.y) / this.palm };
  }

  /**
   * One frame. hand is what readHand made of the tracker's last look, or null, and now is the time in
   * milliseconds. A look is new when its points aren't the ones seen last frame.
   */
  update(hand, now, dt) {
    this.made.clear();
    this.retaken = false;
    if (!hand) {
      // Not seen. For a moment it's as it was, in case the tracker only dropped a look. Then it's gone. What
      // its fingers were doing is let go sooner than that: a hand nobody can see mustn't go on firing.
      if (this.seenAt !== null && now - this.seenAt > TRIGGER_KEPT_MS) Object.assign(this, { making: {}, looks: {}, held: false });
      if (this.seenAt !== null && now - this.seenAt > LOST_AFTER_MS) this.forget();
      else this.glide(now, dt, false);
      return;
    }
    const fresh = hand.points !== this.points;
    this.points = hand.points;
    this.seenAt = now;

    // One that can't be trusted, cut off by the edge of the picture, too far away or touching the other hand,
    // holds what it had for a moment, though it never fires: see is(). After that it's off the glass.
    if (!hand.usable) {
      this.unusableSince ??= now;
      this.usable = false;
      if (now - this.unusableSince > HELD_FOR_MS) this.lift();
      return;
    }
    this.unusableSince = null;
    this.usable = true;

    if (fresh) this.sample(hand, now);
    this.glide(now, dt, true);
    // Closed, for a look or two running, it's lifted, and so is one that has been neither open nor doing
    // anything for longer. One that's open, or doing something, is down: where the tracker has it now, if it
    // wasn't before, with nothing still to catch up on and however it got there forgotten, so that going down
    // never moves anything by itself.
    if ((this.looks.fist ?? 0) >= ACTS_AFTER_LOOKS || this.away >= LIFTED_AFTER_LOOKS) {
      this.origin = null;
      this.grip = { x: 0, y: 0 };
    } else if (!this.origin && this.held && this.place) {
      this.filterX.jump(this.place.x);
      this.filterY.jump(this.place.y);
      this.velocity = { x: 0, y: 0 };
      this.target = { ...this.place };
      this.shown = { ...this.place };
      this.origin = { ...this.place };
      this.grip = { x: 0, y: 0 };
    }
    // Taking hold again after more than a slip, it's where the tracker has it now, with nothing to catch up on.
    if (this.retaken && this.origin && this.place) {
      this.filterX.jump(this.place.x);
      this.filterY.jump(this.place.y);
      this.velocity = { x: 0, y: 0 };
      this.target = { ...this.place };
      this.shown = { ...this.place };
    }
    // It drags while it's open, or doing something. Otherwise what it has dragged stays as it was.
    if (this.origin && this.held) this.grip = this.reached;
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
      this.looks[gesture] = on ? (this.looks[gesture] ?? 0) + 1 : 0;
      // It has begun once it's been seen for as many looks as it takes to count.
      if (this.looks[gesture] === ACTS_AFTER_LOOKS) this.made.add(gesture);
    }
    // Open, or whatever else it drags with, or doing something it's been given to do: it's dragging. Anything
    // else isn't.
    this.held = Boolean(this.making[this.drag]) || [...this.keeps].some((gesture) => this.making[gesture]);
    if (this.held && this.away > SLIP_LOOKS) this.retaken = true;
    this.away = this.held ? 0 : this.away + 1;

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
    // A quick step that was left out at the last look, in case it was the tracker's doing: if the middle of the
    // hand hasn't come straight back, it was the hand going somewhere, and it counts after all, a look late.
    // What's given back is what leaving it out came to, which is less than the step if there was a limit to it.
    if (this.doubted) {
      const { x, y } = this.doubted.step;
      const { added } = this.doubted;
      if (step.x * x + step.y * y >= -0.5 * (x * x + y * y)) left = { x: left.x - added.x, y: left.y - added.y };
      this.doubted = null;
    }
    let doubt = null;
    // Or have only just stopped, on a hand that was still: the tracker is still making its mind up.
    const settling = !moved && looked && Boolean(this.carried?.still) && now - this.fingersMovedAt <= FINGERS_SETTLE_MS;
    if (moved || settling) {
      if (moved) this.fingersMovedAt = now;
      // In this look the hand is taken to have gone on as it was going, though no further than the middle of
      // it went that way, and the rest of how far the middle of it went is left out.
      this.carried ??= this.carriedFrom(now);
      const { way, speed } = this.carried;
      const on = Math.min(speed * Math.exp(-(now - this.carried.since) / CARRIED_ON_MS) * since, Math.max(0, step.x * way.x + step.y * way.y));
      const rest = { x: step.x - way.x * on, y: step.y - way.y * on };
      const far = Math.hypot(rest.x, rest.y) / this.palm;
      const next = { x: left.x + rest.x, y: left.y + rest.y };
      // The middle of the hand coming back towards where it was is never the hand going anywhere.
      const returning = Math.hypot(next.x, next.y) < Math.hypot(left.x, left.y);
      if (moved || returning || this.carried.settled + far <= SETTLE_MOST) {
        if (!moved && !returning) this.carried.settled += far;
        // Further in one look than any fingers could have shifted it is the hand itself going: unless it's
        // straight back at the next look, as the tracker's first look at a hand that has just changed can be.
        // So it's left out for now, and the next look says which it was.
        if (moved && !returning && far / since > SWEEPING) doubt = { step: rest, before: left };
        left = next;
        this.steadied = true;
      }
    }
    if (!this.steadied) {
      // A look in which the hand went where the tracker has it: that's how it's going, if the look says.
      this.carried = null;
      this.clean = looked ? { x: step.x / since, y: step.y / since } : null;
    }
    // No more is ever left out than fingers this far from where they rest could have shifted the hand by.
    const most = (SHIFT_BASE + SHIFT_PER_FINGERS * travel(hand.reach, this.rested)) * this.palm;
    const out = Math.hypot(left.x, left.y);
    this.left = out > most ? { x: (left.x * most) / out, y: (left.y * most) / out } : left;
    if (doubt) this.doubted = { step: doubt.step, added: { x: this.left.x - doubt.before.x, y: this.left.y - doubt.before.y } };

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

  /** Where it went down is dragged along behind it, so it's never further than this many palm lengths away. */
  dragOrigin(most) {
    const { x, y } = this.offset;
    const away = Math.hypot(x, y);
    if (!this.down || away <= most) return;
    const extra = (away - most) / away;
    this.origin = { x: this.origin.x + x * extra * this.palm, y: this.origin.y + y * extra * this.palm };
    this.grip = this.reached;
  }
}

/* ---------- both hands ---------- */

export class Controls {
  /**
   * sensitivity is 'low', 'medium' or 'high': how far the view turns for the hand dragged across. bindings is
   * what each of ACTIONS is given to, as in BINDINGS, and drags what each hand drags with, as setDrags takes it.
   */
  constructor({ sensitivity = 'medium', bindings = {}, drags = {} } = {}) {
    this.move = new TrackedHand();
    this.aim = new TrackedHand();
    this.setSensitivity(sensitivity);
    this.setDrags(drags);
    this.setBindings(bindings);
    this.reset();
  }

  /**
   * What each hand drags with: { aim, move }, each one of DRAGS, and an open hand for anything else. What the
   * hands have been given to do is looked at again, as nothing can be given to what a hand drags with.
   */
  setDrags({ aim = 'open', move = 'open' } = {}) {
    this.aim.drag = DRAGS.includes(aim) ? aim : 'open';
    this.move.drag = DRAGS.includes(move) ? move : 'open';
    if (this.asked) this.setBindings(this.asked);
  }

  setSensitivity(sensitivity) {
    this.gain = SENSITIVITY[sensitivity] ?? SENSITIVITY.medium;
  }

  /**
   * What each thing a player can do is given to. Anything that isn't a hand and something it can be told to be
   * doing is what it is out of the box, and firing can't be switched off.
   */
  setBindings(bindings = {}) {
    this.asked = bindings;
    this.bindings = {};
    for (const action of ACTIONS) {
      const read = readBinding(bindings[action]);
      // Not what that hand drags with: it would be done all the while the hand was down.
      const free = typeof read === 'string' || !read || this[read.hand].drag !== read.gesture;
      const allowed = free && (read === 'stick' ? action === 'sprint' : read === 'off' ? action !== 'fire' : Boolean(read));
      this.bindings[action] = allowed ? read : readBinding(BINDINGS[action]);
    }
    // A hand doing something it's been given to do is down, whatever its fingers are at.
    for (const hand of ['aim', 'move']) {
      this[hand].keeps = new Set(Object.values(this.bindings).filter((binding) => typeof binding !== 'string' && binding.hand === hand).map(({ gesture }) => gesture));
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
    this.dragged = null; // How far across the hand that looks round was at the last frame, while it's down.
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
      // What to draw: each from -1 to 1 across and down from where it went down, with on for a hand that's
      // down and seen for one that's there but closed, and each button lit while what it's given to is being done.
      stick: { on: false, seen: false, x: 0, y: 0 },
      pad: { on: false, seen: false, x: 0, y: 0 },
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
    this.readStick(out);
    this.readPad(out, slow);
    // The trigger is held for as long as what it's given to is, and the magazine is changed once each time what
    // that's given to begins. A sprint is the walking hand right out forwards, or what it's given to, held,
    // while walking forwards at all.
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
      const { link } = GESTURES[binding.gesture];
      if (link && this[binding.hand].is(binding.gesture)) out[binding.hand].push(link);
    }
    return out;
  }

  /** Walking: which way and how fast, from how far the hand is from where it went down. */
  readStick(out) {
    const { move } = this;
    out.stick.seen = move.seenAt !== null;
    if (!move.down) return;
    move.dragOrigin(STICK.reach * STICK.follow);
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

  /** Looking round: the view turns as far as the hand has been dragged across since the last frame. */
  readPad(out, slow) {
    const { aim } = this;
    out.pad.seen = aim.seenAt !== null;
    if (!aim.down) {
      // Lifted: the view stays as it is, and the next drag starts from wherever the hand goes down.
      this.dragged = null;
      return;
    }
    // A hand that stopped being open for more than a look, as one whose thumb is on its way up does, takes hold
    // again where it is: the view stayed as it was meanwhile, and it stays there now.
    const { x, y } = aim.offset;
    if (this.dragged !== null && !aim.retaken) out.turn = (x - this.dragged) * this.gain * slow;
    this.dragged = x;
    Object.assign(out.pad, { on: true, x: clamp(x / PAD.reach, -1, 1), y: clamp(y / PAD.reach, -1, 1) });
  }
}
