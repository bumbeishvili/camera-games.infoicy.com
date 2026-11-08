// Which of the trail's three lanes the child is in, from where their body is across the picture. No
// screen or camera here, so it runs in the unit tests.
//
// The middle lane is wherever the child stands when the run starts. Stepping to one side moves the
// runner into the lane on that side, and stepping back moves it back. Everything is in the mirror,
// so a step to the child's left is a step to the left of the screen. Distances are in torso
// lengths, so it's the same near the camera or far from it, for a small child or a big one.
//
// Standing still mustn't drift between lanes, so there's a dead zone in the middle, and a lane is
// only left once the body is well back from it (hysteresis). A move also has to last a moment, so
// one jumpy frame from the tracker, or the body swaying in a lopsided jump, doesn't count. A body
// that can't be seen leaves the runner where it is.

export const LANE_STEP = {
  enter: 0.45, // How far from the middle, in torso lengths, to move into a side lane.
  leave: 0.25, // How far back towards the middle to come out of it again.
  holdSeconds: 0.15,
  // Sitting down, only the shoulders can be seen, and leaning is how to move across. It's smaller.
  upperBodyShare: 0.7,
};

export class LaneReader {
  /** size is the move size from the reader's settings, from MOVE_SIZES: smaller asks for less. */
  constructor({ size = 1, upperBodyOnly = false } = {}) {
    this.size = size;
    this.upperBodyOnly = upperBodyOnly;
    this.centre = null;
    this.lane = 0;
    this.offset = 0;
    this.pending = null;
    this.pendingFor = 0;
  }

  get enter() {
    return LANE_STEP.enter * this.size * (this.upperBodyOnly ? LANE_STEP.upperBodyShare : 1);
  }

  get leave() {
    return LANE_STEP.leave * this.size * (this.upperBodyOnly ? LANE_STEP.upperBodyShare : 1);
  }

  /** The middle lane is wherever the body is now. Called as a run starts. */
  centreOn(x) {
    this.centre = Number.isFinite(x) ? x : null;
    this.lane = 0;
    this.offset = 0;
    this.pending = null;
    this.pendingFor = 0;
  }

  /** The lane the body is asking for right now, before any waiting. */
  wanted(offset) {
    const { enter, leave, lane } = this;
    if (Math.abs(offset) >= enter) return Math.sign(offset);
    if (Math.abs(offset) < leave) return 0;
    // In between: a side lane is kept, unless the body has gone past the middle towards the other one.
    return lane !== 0 && Math.sign(offset) === lane ? lane : 0;
  }

  /**
   * x is where the body is across the picture and torso is its torso length, both in picture
   * heights, or x is null when the body can't be seen. Returns the lane: -1, 0 or 1.
   */
  update(x, torso, dt) {
    if (!Number.isFinite(x) || !(torso > 0)) {
      this.pending = null;
      this.pendingFor = 0;
      return this.lane;
    }
    if (this.centre === null) this.centre = x;
    this.offset = (x - this.centre) / torso;
    const wanted = this.wanted(this.offset);
    if (wanted === this.lane) {
      this.pending = null;
      this.pendingFor = 0;
      return this.lane;
    }
    if (this.pending !== wanted) {
      this.pending = wanted;
      this.pendingFor = 0;
    }
    this.pendingFor += dt;
    if (this.pendingFor >= LANE_STEP.holdSeconds) {
      this.lane = wanted;
      this.pending = null;
      this.pendingFor = 0;
    }
    return this.lane;
  }
}

/**
 * Where a body is across the picture, in picture heights from the left, as seen in the mirror.
 * Half the shoulders and half the hips, so a step to the side moves it fully and a lean helps. With
 * only the top half to go by, it's the shoulders. Returns null when what's needed can't be seen.
 */
export function bodyAcross(body, aspect = 16 / 9, upperBodyOnly = false) {
  const image = body?.image;
  if (!image) return null;
  const seen = (index) => (image[index]?.visibility ?? 1) >= 0.5;
  const across = (a, b) => (1 - (image[a].x + image[b].x) / 2) * aspect;
  if (!seen(11) || !seen(12)) return null;
  const shoulders = across(11, 12);
  if (upperBodyOnly) return shoulders;
  if (!seen(23) || !seen(24)) return null;
  return (shoulders + across(23, 24)) / 2;
}
