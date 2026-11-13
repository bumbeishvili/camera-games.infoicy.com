// Decides whether a mouth counts as open, and says where the face is, from the points the face tracker finds
// (face.worker.js). Opening the mouth wide and closing it again is what's being practised.
//
// No DOM and no camera in this file, so everything here runs against made-up faces in test/unit/mouth.test.js.
// The rule throughout is "fail closed", as it is for hands: a face that's missing, turned away, too far away, or
// whose mouth is out of the picture never counts as open, however open it looks. A mouth that's covered, as by a
// hand, reads as shut, because the tracker fills in a shut mouth where it can't see one.
//
// How open a mouth is, is how far apart the insides of the lips are, measured against the distance between the
// outer corners of the eyes, in 3D, so that it reads the same near or far, and with the head turned or tipped.
// On paintings shown to the real model, a shut mouth measured 0.01, lips a little apart 0.07, and a wide yawn
// 0.37 to 0.46.

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const clamp01 = (value) => clamp(value, 0, 1);
const smoothing = (dtMs, timeConstantMs) => 1 - Math.exp(-dtMs / timeConstantMs);
const degrees = (radians) => (radians * 180) / Math.PI;

/** How many points the tracker gives for a face. */
export const FACE_POINTS = 478;

// The tracker's numbers for the points used here. A and B are the two sides of the face.
const POINT = {
  lipUpper: 13, // The inside edge of the upper lip, in the middle.
  lipLower: 14, // And of the lower lip.
  lipTop: 0,
  lipBottom: 17,
  cornerA: 61,
  cornerB: 291,
  eyeA: 33, // The outer corner of each eye.
  eyeB: 263,
  cheekA: 234, // The edge of the face by each ear.
  cheekB: 454,
  brow: 10, // The top of the forehead.
  chin: 152,
  bridge: 168, // Between the eyes: where the face is said to be.
};
const LIP_POINTS = [POINT.lipUpper, POINT.lipLower, POINT.lipTop, POINT.lipBottom, POINT.cornerA, POINT.cornerB];

// The lips' outlines and the edge of the face, in order round each, for drawing them on the mirror.
export const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
export const LIPS_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

export const MOUTH_RULES = {
  // The lowest line any mouth can have, whatever the settings say: lips a little apart, as for breathing or
  // talking quietly, measured 0.07 on the real model, and must never pass.
  floor: 0.12,
  // A mouth has to get this share of the way from where it rests to its own widest, found in the check.
  defaultStrictness: 0.6,
  // And never less than this far above where it rests, so a mouth that hardly moved in the check isn't always open.
  leastAboveRest: 0.07,
  // Used until the first check has run: about what a wide open mouth measures.
  defaultBest: 0.38,
  // Where a mouth rests can't be taken as more than this share of its widest, as for a child whose mouth was open
  // all through the check: the line then is still below what they did.
  mostRestShare: 0.5,
};

// Once open, a mouth has to come this share of the way back down from its line to where it rests before it's
// shut again: a little more to stop than to start, so it can't flicker on the line.
const RELEASE = 0.3;
const SMOOTH_MS = 80;
const OPEN_HOLD_MS = 90;
const CLOSE_HOLD_MS = 80;
const LOST_GRACE_MS = 250; // Rides out single dropped detections.
const PLACE_SMOOTH_MS = 110;
// The distance between the outer corners of the eyes, as a share of the picture's height. Smaller than this is
// too far away to trust: the tracker only finds a new face at about 0.13, and can follow it a little further.
const MIN_FACE_SIZE = 0.075;
const FRAME_MARGIN = 0.005;
// How far the head can be turned to the side, or tipped up or down, in degrees, as these points measure it. A
// face straight on to the camera measures a few degrees tipped down, as the forehead slopes back.
const MOST_TURN = 45;
const MOST_TIP = 45;
const TIP_AT_REST = 5;
// Of two faces, the one being followed is kept unless it has gone further than this, in picture heights.
const SAME_FACE_WITHIN = 0.35;

/** One of a face's points, in picture heights across, down and towards the camera, so that distances are true. */
function pointOf(points, index, aspect) {
  return { x: points[index * 3] * aspect, y: points[index * 3 + 1], z: points[index * 3 + 2] * aspect };
}

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Measures one face from the tracker's points: how open its mouth is, how big and where it is in the picture, and
 * which way it's turned. Returns null for anything that isn't a whole face.
 */
export function measureFace(points, aspect = 16 / 9) {
  if (!points || points.length < FACE_POINTS * 3) return null;
  const at = (index) => pointOf(points, index, aspect);
  const [eyeA, eyeB, cheekA, cheekB] = [at(POINT.eyeA), at(POINT.eyeB), at(POINT.cheekA), at(POINT.cheekB)];
  const size = gap(eyeA, eyeB);
  if (!(size > 0)) return null;
  const openness = gap(at(POINT.lipUpper), at(POINT.lipLower)) / size;
  // Turned to the side, the line between the eyes, and between the cheeks, leans away from the camera: how far it
  // goes towards or away from it, against how long it looks in the picture, whichever way up the head is.
  const leanOf = (a, b) => degrees(Math.atan2(b.z - a.z, Math.hypot(b.x - a.x, b.y - a.y)));
  const yaw = (leanOf(eyeA, eyeB) + leanOf(cheekA, cheekB)) / 2;
  // Tipped up or down, the line from the forehead to the chin does.
  const pitch = leanOf(at(POINT.brow), at(POINT.chin)) - TIP_AT_REST;
  const roll = degrees(Math.atan2(eyeB.y - eyeA.y, eyeB.x - eyeA.x));
  const inFrame = LIP_POINTS.every((index) => {
    const x = points[index * 3];
    const y = points[index * 3 + 1];
    return x > FRAME_MARGIN && x < 1 - FRAME_MARGIN && y > FRAME_MARGIN && y < 1 - FRAME_MARGIN;
  });
  return {
    points,
    openness,
    size,
    // Where the face is: between the eyes, from 0 to 1 across and down the picture as the camera sends it.
    x: points[POINT.bridge * 3],
    y: points[POINT.bridge * 3 + 1],
    yaw,
    pitch,
    roll,
    inFrame,
    tooSmall: size < MIN_FACE_SIZE,
    turned: Math.abs(yaw) > MOST_TURN || Math.abs(pitch) > MOST_TIP,
  };
}

/**
 * The line a mouth has to reach, from where it rests and its widest: strictness of the way from one to the other,
 * and never below the floor, or too close to where it rests.
 */
export function lineFor(strictness, best, rest) {
  const from = Math.min(rest, best * MOUTH_RULES.mostRestShare);
  return Math.max(MOUTH_RULES.floor, from + MOUTH_RULES.leastAboveRest, from + strictness * (best - from));
}

export class MouthMonitor {
  /** strictness is how far towards its own widest a mouth has to open, from 0 to 1. */
  constructor(strictness = MOUTH_RULES.defaultStrictness) {
    this.strictness = strictness;
    this.best = MOUTH_RULES.defaultBest;
    this.rest = 0;
    this.checked = false;
    this.neutral = null; // Where the face was in the check: the middle, for steering.
    this.forget();
  }

  setStrictness(value) {
    this.strictness = value;
    this.snapshot = this.view();
  }

  /** The camera is off. A mouth seen before that must not still count as open later. */
  forget() {
    this.status = 'missing';
    this.reason = 'missing';
    this.openness = 0;
    this.raw = 0;
    this.face = null;
    this.place = null;
    this.unsure = false;
    this.lastSeen = -Infinity;
    this.lastUpdate = null;
    this.pendingSince = null;
    this.snapshot = this.view();
  }

  /** What the check found: the mouth's widest, where it rests, and where the face was. */
  applyCheck({ best, rest, centre }) {
    this.best = best;
    this.rest = rest;
    this.checked = true;
    if (centre) this.neutral = centre;
    this.snapshot = this.view();
  }

  /** The line this mouth has to reach, and the one it has to drop below again. */
  get line() {
    return lineFor(this.strictness, this.best, this.rest);
  }

  get restingAt() {
    return Math.min(this.rest, this.best * MOUTH_RULES.mostRestShare);
  }

  get releaseLine() {
    return this.line - RELEASE * (this.line - this.restingAt);
  }

  /** Of the faces in the picture, the one being followed, or to begin with the biggest: the child, not someone behind. */
  pick(faces) {
    if (!faces.length) return null;
    const { place } = this;
    if (place) {
      const near = faces
        .map((face) => ({ face, far: Math.hypot((face.x - place.x) * place.aspect, face.y - place.y) }))
        .sort((a, b) => a.far - b.far)[0];
      if (near.far < SAME_FACE_WITHIN) return near.face;
    }
    return faces.reduce((biggest, face) => (face.size > biggest.size ? face : biggest));
  }

  /** Feed one tracker result. faces is what face.worker.js sends: each { points }. */
  update(faces, now, aspect = 16 / 9) {
    const dt = this.lastUpdate === null ? 0 : Math.max(0, now - this.lastUpdate);
    this.lastUpdate = now;
    const face = this.pick((faces ?? []).map((each) => measureFace(each.points, aspect)).filter(Boolean));

    if (!face) {
      // Ride out a dropped frame or two, and then it's gone: nothing about it counts any more.
      if (now - this.lastSeen > LOST_GRACE_MS) {
        this.status = 'missing';
        this.reason = 'missing';
        this.openness = 0;
        this.raw = 0;
        this.face = null;
        this.place = null;
        this.pendingSince = null;
      }
      this.snapshot = this.view();
      return this.snapshot;
    }

    // What was read while the face was gone, or couldn't be trusted, isn't carried into what's read now.
    const fresh = this.face === null || this.unsure;
    this.lastSeen = now;
    this.face = face;
    this.raw = face.openness;
    this.openness = fresh ? face.openness : this.openness + (face.openness - this.openness) * smoothing(dt, SMOOTH_MS);
    const blend = this.place ? smoothing(dt, PLACE_SMOOTH_MS) : 1;
    const before = this.place ?? { x: face.x, y: face.y };
    this.place = { x: before.x + (face.x - before.x) * blend, y: before.y + (face.y - before.y) * blend, aspect };
    if (!this.neutral) this.neutral = { x: this.place.x, y: this.place.y };

    // Problems with the view shut the mouth at once, without waiting out a hold time.
    const problem = !face.inFrame ? 'edge' : face.tooSmall ? 'small' : face.turned ? 'turned' : null;
    this.unsure = Boolean(problem);
    if (problem) {
      this.status = 'closed';
      this.reason = problem;
      this.pendingSince = null;
      this.snapshot = this.view();
      return this.snapshot;
    }

    // A face in view is never "missing". Its mouth starts as shut until it has proved it's open.
    if (this.status === 'missing') this.status = 'closed';
    let wanted = this.status;
    if (this.openness >= this.line) wanted = 'open';
    else if (this.openness < this.releaseLine) wanted = 'closed';

    if (wanted === this.status) {
      this.pendingSince = null;
    } else {
      if (this.pendingSince === null) this.pendingSince = now;
      if (now - this.pendingSince >= (wanted === 'open' ? OPEN_HOLD_MS : CLOSE_HOLD_MS)) {
        this.status = wanted;
        this.pendingSince = null;
      }
    }
    this.reason = this.status === 'open' ? null : 'closed';
    this.snapshot = this.view();
    return this.snapshot;
  }

  view() {
    const { face, place, neutral, line } = this;
    const from = this.restingAt;
    const range = Math.max(0.01, this.best - from);
    const seen = this.status !== 'missing';
    return {
      status: this.status, // 'missing', 'closed' or 'open'.
      reason: this.reason, // Why it isn't open: 'missing', 'edge', 'small', 'turned' or 'closed'.
      seen,
      mouthOpen: this.status === 'open',
      // How far apart the lips are, steadied, and as it was read this moment.
      openness: this.openness,
      raw: this.raw,
      line,
      best: this.best,
      rest: from,
      checked: this.checked,
      strictness: this.strictness,
      // The same, from 0 where the mouth rests to 1 at its own widest: for meters, and for a creature's mouth.
      amount: seen ? clamp((this.openness - from) / range, 0, 1.25) : 0,
      lineAmount: clamp01((line - from) / range),
      // Where the face is in the mirror, from 0 to 1 across and down: moving left goes left.
      x: place ? 1 - place.x : 0.5,
      y: place ? place.y : 0.5,
      // And how far that is from where it was in the check, in picture widths and heights.
      steer: place && neutral && seen ? { x: neutral.x - place.x, y: place.y - neutral.y } : { x: 0, y: 0 },
      size: face?.size ?? 0,
      yaw: face?.yaw ?? 0,
      pitch: face?.pitch ?? 0,
      roll: face?.roll ?? 0,
      // The face's points as the camera sent them, for drawing on the mirror, or null.
      points: seen && face ? face.points : null,
    };
  }
}

const percentile = (values, share) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
};

/**
 * The check before a game: "open wide!". It measures the mouth's widest opening and where it rests, and where the
 * face is, which is the middle for steering. It's done once the mouth has been open for a moment, and it gives up
 * waiting after a while, so that it can ask again.
 */
export class MouthCheck {
  constructor({ openSeconds = 1, mostSeconds = 7 } = {}) {
    this.openSeconds = openSeconds;
    this.mostSeconds = mostSeconds;
    this.openFor = 0;
    this.seenFor = 0;
    this.samples = [];
    this.xs = [];
    this.ys = [];
  }

  /** Only time with the face properly in view counts. Returns whether it counted. */
  add(snapshot, dtSeconds) {
    const usable = snapshot.seen && snapshot.reason !== 'edge' && snapshot.reason !== 'small' && snapshot.reason !== 'turned';
    if (!usable) return false;
    this.seenFor += dtSeconds;
    if (snapshot.openness >= MOUTH_RULES.floor) this.openFor += dtSeconds;
    this.samples.push(snapshot.openness);
    this.xs.push(1 - snapshot.x);
    this.ys.push(snapshot.y);
    return true;
  }

  get progress() {
    return clamp01(this.openFor / this.openSeconds);
  }

  get done() {
    return this.openFor >= this.openSeconds || this.seenFor >= this.mostSeconds;
  }

  result() {
    const open = this.samples.filter((value) => value >= MOUTH_RULES.floor);
    return {
      // Near the top of what it did while open, rather than the peak, so one lucky frame can't set the bar.
      best: open.length ? percentile(open, 0.8) : percentile(this.samples, 0.95),
      rest: percentile(this.samples, 0.1),
      centre: this.xs.length ? { x: percentile(this.xs, 0.5), y: percentile(this.ys, 0.5) } : null,
    };
  }
}

// Each of these has a rendered voice file: see voice/lines.json.
export const MOUTH_SAY = {
  showFace: 'Show me your face!',
  comeCloser: 'Come a little closer',
  lookHere: 'Look at the screen!',
  openWide: 'Open your mouth as wide as you can!',
  openWideAgain: 'One more try. Open your mouth as wide as you can!',
  open: 'Open your mouth wide!',
  resting: 'Resting is OK. Open your mouth when you’re ready.',
};

/**
 * What to tell the child right now, or null when the mouth is open. A face that's in view with its mouth shut is
 * asked to open it, with a key starting 'closed', which is how games know that one: a mouth can rest whenever it
 * likes, so games mostly leave it unsaid.
 */
export function mouthPrompt(snapshot) {
  const text = {
    missing: MOUTH_SAY.showFace,
    edge: MOUTH_SAY.showFace,
    small: MOUTH_SAY.comeCloser,
    turned: MOUTH_SAY.lookHere,
    closed: MOUTH_SAY.open,
  }[snapshot.reason];
  return text ? { key: `${snapshot.reason}-mouth`, text, side: null } : null;
}

/** The numbers for the summary at the end of a game. Kept in memory only. */
export class MouthStats {
  constructor() {
    this.seconds = 0;
    this.openSeconds = 0;
    this.openings = 0;
    this.longestHold = 0;
    this.peak = 0;
    this.currentHold = 0;
    this.wasOpen = false;
  }

  update(snapshot, dtSeconds) {
    this.seconds += dtSeconds;
    if (snapshot.mouthOpen) {
      if (!this.wasOpen) this.openings += 1;
      this.openSeconds += dtSeconds;
      this.currentHold += dtSeconds;
      this.longestHold = Math.max(this.longestHold, this.currentHold);
    } else {
      this.currentHold = 0;
    }
    this.wasOpen = snapshot.mouthOpen;
    if (snapshot.seen) this.peak = Math.max(this.peak, snapshot.amount);
  }
}
