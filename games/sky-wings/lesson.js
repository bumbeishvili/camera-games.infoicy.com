// A short lesson before the race: the child's character shows each thing, and it also learns what
// this child's arms can do. The arms held out are the middle of the steering, whatever height each
// one is at, so an arm that can't come up as far doesn't make the plane fly in circles. Tipping as
// far as they can is a full turn, however far that is. No screen here, so it runs in the unit tests.
import { Easing } from '../../core/body/easing.js';

const HOLD = { wings: 0.8, tip: 0.25, up: 0.25 };
const AFTER_SUCCESS = 0.6;
const TIP = { counts: 0.22, least: 0.12, comesDownAfter: 6 }; // Radians the arms have to tip.
const FULL_TURN_SHARE = 0.9; // Tipping this share of their best is a full turn.
const CLIMB_COUNTS = 0.4;

export class Lesson {
  /** steps are 'wings', 'tipRight', 'tipLeft', 'climb' and 'dive', in the order to do them. */
  constructor({ steps, reader, onEvent = () => {} }) {
    this.steps = steps;
    this.reader = reader;
    this.onEvent = onEvent;
    this.pause = 0;
    this.finished = false;
    this.startStep(0);
  }

  get step() {
    return this.steps[this.index] ?? null;
  }

  startStep(index) {
    this.index = index;
    this.held = 0;
    this.seconds = 0;
    this.best = 0;
    this.tilts = [];
    this.heights = [];
    this.easing = this.step === 'wings' ? new Easing(this.reader, 'wings') : null;
    this.onEvent({ type: 'step', step: this.step, index, total: this.steps.length });
  }

  succeed() {
    this.pause = AFTER_SUCCESS;
    this.onEvent({ type: 'success', step: this.step });
  }

  /** How much this step is being done, right now, from nothing to all of it. */
  get effort() {
    const { wings } = this.reader;
    switch (this.step) {
      case 'wings': return Math.min(1, wings.span / this.reader.wingsNeeded);
      case 'tipRight': return Math.max(0, Math.min(1, wings.bank));
      case 'tipLeft': return Math.max(0, Math.min(1, -wings.bank));
      case 'climb': return Math.max(0, Math.min(1, wings.climb / CLIMB_COUNTS));
      default: return Math.max(0, Math.min(1, -wings.climb / CLIMB_COUNTS));
    }
  }

  /** The level the arms are held at becomes the middle of the steering. */
  learnWings() {
    const { reader, tilts, heights } = this;
    const middle = (list) => list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length);
    reader.personal.tiltZero = middle(tilts);
    reader.personal.heightZero = middle(heights);
  }

  updateWings(dt) {
    const { reader } = this;
    const { wings } = reader;
    this.easing.update(dt);
    if (!wings.out) {
      this.held = 0;
      this.tilts = [];
      this.heights = [];
      return;
    }
    this.held += dt;
    this.tilts.push(wings.tilt);
    this.heights.push(wings.height);
    if (this.held >= HOLD.wings) {
      this.learnWings();
      this.succeed();
    }
  }

  updateTip(dt, direction) {
    const { reader } = this;
    const { wings } = reader;
    const zero = reader.personal.tiltZero ?? 0;
    const tipped = wings.out ? (wings.tilt - zero) * direction : 0;
    this.best = Math.max(this.best, tipped);
    const counts = this.seconds > TIP.comesDownAfter ? TIP.least : TIP.counts;
    this.held = tipped >= counts ? this.held + dt : 0;
    if (this.held >= HOLD.tip) {
      reader.personal[direction > 0 ? 'tiltRight' : 'tiltLeft'] = this.best * FULL_TURN_SHARE;
      this.succeed();
    }
  }

  update(dt) {
    if (this.finished) return;
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause > 0) return;
      if (this.index + 1 < this.steps.length) {
        this.startStep(this.index + 1);
      } else {
        this.finished = true;
        this.onEvent({ type: 'finished' });
      }
      return;
    }
    this.seconds += dt;
    const { wings } = this.reader;
    switch (this.step) {
      case 'wings':
        this.updateWings(dt);
        break;
      case 'tipRight':
        this.updateTip(dt, 1);
        break;
      case 'tipLeft':
        this.updateTip(dt, -1);
        break;
      case 'climb':
        this.held = wings.out && wings.climb >= CLIMB_COUNTS ? this.held + dt : 0;
        if (this.held >= HOLD.up) this.succeed();
        break;
      default:
        this.held = wings.out && wings.climb <= -CLIMB_COUNTS ? this.held + dt : 0;
        if (this.held >= HOLD.up) this.succeed();
    }
  }
}
