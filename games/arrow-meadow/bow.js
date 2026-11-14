// Arrow Meadow's bow: what the two hands are asking for.
//
// The hand in play is the string hand, and the other is the bow hand. The bow tilts by how much higher the bow hand
// is than the string hand: level with it, the arrow would fly level, and a palm's length higher tilts the bow up by
// TILT. So it's the same wherever the hands are in the picture, and however far from the camera anyone sits. The bow
// is drawn by how far apart the two hands are, in palm lengths: from DRAW_FROM, a little more than two hands side by
// side, to as far as a grown-up chose for a full draw.
//
// The string hand takes the string by not being open: closed, or just relaxed, as a tight fist is never asked for.
// Opening it lets the arrow go, and that's the hand monitor's own decision of open (core/hands.js), as in every
// other game, so a fist can never do it. That decision comes a moment after the fingers start to open, and a hand
// that's opening can move, so the arrow goes where the bow was pointing just before, and not where the hands had got
// to by the time the opening was sure.
//
// A hand that can't be seen, that's cut off by the edge of the picture, too far away, or touching the other one, does
// nothing: the bow stays as it was for a moment, in case the tracker only dropped a look, and then the string is let
// down, with no shot. Where the hands are goes through the filter Frost Arena's hands do, which holds still when a
// hand does and keeps up when it moves.
//
// No screen or camera in this file: it's given the hand monitor's snapshot, and says what the bow is doing. So it
// runs in the unit tests.
import { OneEuro, readHand } from '../frost-arena/controls.js';
import { ANGLES, MIN_DRAW } from './meadow.js';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// How far apart the hands are for a full draw, in palm lengths, as a grown-up chooses. A palm is about 7 cm on a
// young child and 10 on a grown-up, so the smallest is hands held about as far apart as the shoulders.
export const REACHES = { small: 3, medium: 4.5, large: 6 };
export const REACH_NAMES = Object.keys(REACHES);
export const DRAW_FROM = 1.6; // The hands this far apart, in palm lengths, is a bow not drawn at all.
export const TILT = (24 * Math.PI) / 180; // How far the bow tilts for each palm length the bow hand is above the other.
const TAKE_MS = 120; // The string hand has to be seen not open for this long to take the string.
// And to have been in the picture for this long. A hand that has just come into it reads as not open for the first
// moment, whatever it is, until the monitor has made up its mind: that mustn't take the string and let it go.
const SETTLE_MS = 350;
const KEPT_MS = 600; // With a hand lost for longer than this, the string is let down, with no shot.
const BACK_MS = 300; // An arrow goes where the bow pointed this long before the hand was seen to be open.
const HISTORY_MS = 800;
const PALM_SETTLES_MS = 300; // How quickly the palm's length, which everything is measured in, follows what's seen.

export class Bow {
  /** reach is how far apart the hands have to be for a full draw: see REACHES. */
  constructor({ reach = 'small' } = {}) {
    this.liftFilter = new OneEuro();
    this.apartFilter = new OneEuro();
    this.setReach(reach);
    this.reset();
  }

  setReach(reach) {
    this.reach = REACH_NAMES.includes(reach) ? reach : 'small';
    this.full = REACHES[this.reach];
  }

  /** Nothing left over from before: no hands, and the string not held. */
  reset() {
    this.liftFilter.reset();
    this.apartFilter.reset();
    this.palm = 0;
    this.angle = 0;
    this.draw = 0;
    this.apart = 0;
    this.nocked = false;
    this.nockedAt = null;
    this.closedSince = null;
    this.stringSince = null;
    this.lostSince = null;
    this.seenAt = null;
    this.looked = null;
    this.stringPoints = null;
    this.bowPoints = null;
    this.history = [];
    this.state = { bowSeen: false, stringSeen: false, both: false, nocked: false, angle: 0, draw: 0, apart: 0, loosed: null, slack: false };
  }

  /**
   * One frame. snapshot is the hand monitor's, aspect the camera picture's width for its height, and now the time in
   * milliseconds. Returns what the bow is doing: whether each hand can be seen and trusted, whether the string is
   * held (nocked), how far the bow is tilted, in radians, and drawn, from 0 to 1, and loosed, { angle, draw }, in
   * the frame the string hand lets go of a bow drawn far enough. slack is letting go of one that wasn't.
   */
  read(snapshot, aspect, now) {
    const stringView = snapshot[snapshot.side];
    const string = readHand(stringView, aspect, snapshot.overlap);
    const bow = readHand(snapshot.other, aspect, snapshot.overlap);
    const stringSeen = Boolean(string?.usable);
    const bowSeen = Boolean(bow?.usable);
    const both = stringSeen && bowSeen;
    let loosed = null;
    let slack = false;

    if (both) {
      // Both back after a while away: they're taken as they are, with nothing for the filters to catch up on.
      if (this.seenAt === null || now - this.seenAt > KEPT_MS) {
        this.liftFilter.reset();
        this.apartFilter.reset();
        this.palm = 0;
        this.looked = null;
      }
      this.seenAt = now;
      this.lostSince = null;
      // The tracker looks about 30 times a second and the screen is drawn 60: only a new look says anything new.
      if (string.points !== this.stringPoints || bow.points !== this.bowPoints) {
        const dt = this.looked === null ? 0 : now - this.looked;
        this.looked = now;
        this.stringPoints = string.points;
        this.bowPoints = bow.points;
        const palm = Math.max(string.size, bow.size);
        this.palm = this.palm > 0 ? this.palm + (palm - this.palm) * (1 - Math.exp(-dt / PALM_SETTLES_MS)) : palm;
        const lift = this.liftFilter.feed((string.y - bow.y) / this.palm, now / 1000);
        this.apart = this.apartFilter.feed(Math.hypot(string.x - bow.x, string.y - bow.y) / this.palm, now / 1000);
        this.angle = clamp(lift * TILT, ANGLES.low, ANGLES.high);
        this.draw = clamp((this.apart - DRAW_FROM) / (this.full - DRAW_FROM), 0, 1);
      }
    } else if (this.lostSince === null) {
      this.lostSince = now;
    }

    // A string hand that's in the picture, can be trusted, and isn't open: closed, or only relaxed. It has to have
    // been there a moment, and to look that way at this very look too: the monitor's steadier reading is a little
    // behind, and a hand that has just opened, or just come back open, isn't holding anything.
    this.stringSince = stringSeen ? this.stringSince ?? now : null;
    const settled = stringSeen && now - this.stringSince >= SETTLE_MS;
    const looksOpen = stringSeen && stringView.shape === 'open' && string.openness >= stringView.target;
    const closed = settled && !looksOpen && stringView.status === 'closed' && stringView.reason === 'closed';
    if (this.nocked) {
      if (snapshot.handOpen) {
        // Let go. The arrow goes where the bow was pointing a moment before the hand was seen to be open.
        const before = this.history.filter((sample) => sample.at <= now - BACK_MS).at(-1) ?? this.history[0] ?? { angle: this.angle, draw: this.draw };
        const draw = Math.max(before.draw, this.draw);
        if (draw >= MIN_DRAW) loosed = { angle: before.angle, draw };
        else slack = true;
        this.letDown();
      } else if (!both && now - this.lostSince > KEPT_MS) {
        this.letDown();
      } else if (both) {
        this.history.push({ at: now, angle: this.angle, draw: this.draw });
        while (this.history.length && now - this.history[0].at > HISTORY_MS) this.history.shift();
      }
    } else if (both && closed) {
      this.closedSince ??= now;
      if (now - this.closedSince >= TAKE_MS) {
        this.nocked = true;
        this.nockedAt = now;
        this.history = [{ at: now, angle: this.angle, draw: this.draw }];
      }
    } else {
      this.closedSince = null;
    }

    // With the hands gone for a while, the bow isn't drawn: it rests as it was last tilted.
    if (!both && this.lostSince !== null && now - this.lostSince > KEPT_MS) this.draw = 0;
    this.state = { bowSeen, stringSeen, both, nocked: this.nocked, angle: this.angle, draw: this.draw, apart: this.apart, loosed, slack };
    return this.state;
  }

  /** The string is let go of, or put down. */
  letDown() {
    this.nocked = false;
    this.nockedAt = null;
    this.closedSince = null;
    this.history = [];
  }
}
