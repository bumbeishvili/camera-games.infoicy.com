// Flap, Little Chick!: reading the wrists. Each hand is one of the chick's wings. A hand that hangs forwards from
// the wrist, tipped over towards the camera, is a wing that's down, and bending the wrist back brings the hand up,
// like a high five, and the wing with it. Each time a hand comes up, that wing flaps, and while it stays up the
// chick glides.
//
// What can be seen of this is what core/upright.js measures, from the tracker's points in the picture: which way
// the fingers point, and how wide the knuckles look for the length of the palm, as a hand tipped towards the camera
// looks shorter and just as wide. The two together are how far up the hand is, from 1, held flat to the camera with
// its fingers up, through about 0.5, tipped right over, to less than nothing, hanging down. That reading stops
// falling at about 0.47 for a hand whose fingers still point up, so nothing here asks for less than that.
//
// A flap is a rise, and not a place: the hand has to come up by so much from the lowest it has been, as a grown-up
// chooses, and end with its fingers pointing up. So it's each hand's own: a wrist that only comes part of the way up
// flaps from wherever it hangs to wherever it gets to, and a hand that starts held up has to drop before it can flap.
// Then it has to come part of the way down again before the next one.
//
// What this can't tell: the tracker sees the hand and not the forearm, so it can't measure the wrist itself. A
// forearm that swings up from the elbow, with the wrist held still, brings the hand up just the same, and so does an
// arm lifted into the picture. A grown-up watching will see which it is. With the forearms resting, leaning towards
// the camera, it's the wrists that do it.
//
// No DOM and no camera here, so it runs against real hands from photos in test/unit/chick-flap.test.js.
import { handPosture, UPRIGHT } from '../../core/upright.js';

export const WINGS = {
  // How far a hand has to come up to flap, as a grown-up chooses, in the measure above: a little is about a sixth
  // of the way from end-on to flat, and a lot is most of the way a hand that can be seen has to go.
  rises: { little: 0.16, more: 0.26, lots: 0.36 },
  // And how much of that it has to come down again before it can flap again.
  rearm: 0.5,
  // A flap ends with the hand at least this far up: its fingers pointing up, and not out to the side or down.
  floor: 0.45,
  // Fingers within about 50° of straight up are pointing up, and from there down to just under level they count
  // for less and less. Under that, they're hanging.
  pointsUp: 0.6,
  level: -0.2,
  smoothMs: 70,
  // A hand the tracker loses for a moment is where it was. One that's gone for longer has dropped out of sight: it
  // counts as down, as low as a hand that can be seen reads, so coming back up is a flap.
  lostMs: 300,
  droppedTo: 0.5,
  // Back in the picture, it has to be seen this many times running before it can flap, so one wrong look can't.
  looks: 2,
  // The wing is drawn from right down to right up as the hand goes from here to there.
  shownFrom: 0.45,
  shownTo: 1,
  // How quickly the wing that's drawn follows the hand, and folds when the hand has gone.
  followMs: 60,
  foldMs: 260,
};
export const RISE_NAMES = Object.keys(WINGS.rises);

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * How far up a hand is, from its points in the mirror picture (as the hand monitor gives them), the picture's
 * aspect, and how wide this hand looks for its length held flat to the camera: 1 held up flat, about 0.5 tipped
 * right over towards the camera, 0 pointing out to the side, and below that hanging down.
 */
export function riseOf(image, aspect, flat = UPRIGHT.defaultWide) {
  const { up, wide } = handPosture(image, aspect);
  if (!(wide > 0)) return 0;
  const pointing = up >= WINGS.pointsUp ? 1 : (up - WINGS.level) / (WINGS.pointsUp - WINGS.level);
  return pointing * Math.min(1, flat / wide);
}

/**
 * The points of a hand that can be trusted, or null: one that's missing, cut off by the edge of the picture, too
 * far away or touching the other hand is no wing. view is a hand from the monitor's snapshot.
 */
export function trusted(view, overlap = false) {
  if (!view?.image || overlap || view.status === 'missing') return null;
  return ['edge', 'small', 'overlap'].includes(view.reason) ? null : view.image;
}

/** One hand, read as a wing. */
export class Wing {
  constructor() {
    this.flat = UPRIGHT.defaultWide;
    this.checked = false;
    this.samples = [];
    this.reset();
  }

  /** A new game: nothing is known of where the hand is. What the hand check found is kept. */
  reset() {
    this.rise = null; // How far up the hand is, smoothed, or null while it can't be seen.
    this.lift = 0; // How far up the wing is drawn, from 0 to 1.
    this.up = false; // Whether the wing is up: from a flap until the hand has come down again.
    this.trough = null; // The lowest the hand has been since it was last up.
    this.peak = null; // And the highest since it flapped.
    this.seen = false;
    this.looks = 0;
    this.lastAt = null;
    this.lastSeenAt = null;
  }

  /** In the hand check: how this hand looks, held up to the camera with its fingers up. */
  sample(image, aspect) {
    if (!image) return;
    const { up, wide } = handPosture(image, aspect);
    if (wide > 0 && up >= WINGS.pointsUp) this.samples.push(wide);
  }

  /**
   * After the hand check: how wide this hand looks held flat is the middle of what was seen, if that's a hand's.
   * A check made with the wrist dropped looks wider than any flat hand, so then it's the usual hand's.
   */
  calibrate() {
    const { samples } = this;
    if (samples.length >= 5) {
      const sorted = [...samples].sort((a, b) => a - b);
      const middle = sorted[Math.floor(sorted.length / 2)];
      const believed = middle >= UPRIGHT.wideLow && middle <= UPRIGHT.wideHigh;
      this.flat = believed ? middle : UPRIGHT.defaultWide;
      this.checked = believed;
    }
    this.samples = [];
    this.reset();
  }

  /**
   * One look from the tracker: the hand's points, or null when it can't be trusted, the picture's aspect, the time
   * now in milliseconds, and how far it has to come up to flap (see WINGS.rises). Returns whether it flapped.
   */
  update(image, aspect, now, need = WINGS.rises.little) {
    const dt = this.lastAt === null ? 0 : Math.max(0, now - this.lastAt);
    this.lastAt = now;
    if (!image) {
      const gone = this.lastSeenAt === null ? Infinity : now - this.lastSeenAt;
      if (gone > WINGS.lostMs) {
        // Out of sight: it has dropped, and what's drawn folds.
        this.seen = false;
        this.looks = 0;
        this.rise = null;
        this.up = false;
        this.peak = null;
        this.trough = Math.min(this.trough ?? WINGS.droppedTo, WINGS.droppedTo);
        this.lift -= this.lift * (1 - Math.exp(-dt / WINGS.foldMs));
        if (this.lift < 0.005) this.lift = 0;
      }
      return false;
    }
    const raw = riseOf(image, aspect, this.flat);
    const since = this.lastSeenAt === null ? Infinity : now - this.lastSeenAt;
    this.lastSeenAt = now;
    this.seen = true;
    this.looks += 1;
    this.rise = this.rise === null ? raw : this.rise + (raw - this.rise) * (1 - Math.exp(-since / WINGS.smoothMs));
    const shown = clamp((this.rise - WINGS.shownFrom) / (WINGS.shownTo - WINGS.shownFrom), 0, 1);
    this.lift += (shown - this.lift) * (dt > 0 ? 1 - Math.exp(-dt / WINGS.followMs) : 1);

    // The first it's ever seen, wherever it is, is where it starts from.
    if (this.trough === null) this.trough = this.rise;
    if (this.up) {
      this.peak = Math.max(this.peak, this.rise);
      if (this.peak - this.rise >= need * WINGS.rearm) {
        this.up = false;
        this.trough = this.rise;
      }
      return false;
    }
    this.trough = Math.min(this.trough, this.rise);
    if (this.looks < WINGS.looks || this.rise < WINGS.floor || this.rise - this.trough < need) return false;
    this.up = true;
    this.peak = this.rise;
    return true;
  }

  /** How far towards a flap the hand has come, from 0 to 1: for the little gauge by each wing. */
  progress(need = WINGS.rises.little) {
    if (this.up) return 1;
    if (this.rise === null || this.trough === null) return 0;
    return clamp((this.rise - this.trough) / need, 0, 1);
  }
}

/** Both hands, each a wing. */
export class Wings {
  constructor() {
    this.left = new Wing();
    this.right = new Wing();
  }

  reset() {
    this.left.reset();
    this.right.reset();
  }

  sample(images, aspect) {
    this.left.sample(images.left, aspect);
    this.right.sample(images.right, aspect);
  }

  calibrate() {
    this.left.calibrate();
    this.right.calibrate();
  }

  /**
   * One look at both hands: images is { left, right }, each a hand's points or null. only names the one hand that
   * works both wings, when a grown-up has chosen that: the other hand is then left alone, and both wings go as
   * that one does. Returns { flaps, wings }: which hands flapped just now, as a list of 'left' and 'right', and how
   * each wing is, as { lift, up, seen }.
   */
  update(images, aspect, now, { need = WINGS.rises.little, only = null } = {}) {
    const flaps = [];
    const view = (wing) => ({ lift: wing.lift, up: wing.up, seen: wing.seen });
    if (only) {
      if (this[only].update(images[only], aspect, now, need)) flaps.push(only);
      return { flaps, wings: { left: view(this[only]), right: view(this[only]) } };
    }
    for (const side of ['left', 'right']) if (this[side].update(images[side], aspect, now, need)) flaps.push(side);
    return { flaps, wings: { left: view(this.left), right: view(this.right) } };
  }
}
