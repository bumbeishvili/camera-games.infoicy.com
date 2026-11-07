// A short practice before a run: the child is asked for each move, sees how the camera reads it,
// and is told as soon as it's been seen. It also learns the size of this child's moves, as what
// counts comes down to meet them if they're trying. No screen here, so it runs in the unit tests.
import { Easing } from '../../core/body/easing.js';

const AFTER_SUCCESS = 1; // Seconds to land and see that it worked, before the next thing.

// Which moves from the body reader count for each step. Raising a hand is checked by the game,
// because the hand has to be seen open as well.
const COUNTS = { jump: ['flying', 'starBurst'], squat: ['stomp'], lift: ['kick', 'knee'], raise: [] };

export class Practice {
  /** steps is the moves to practise, in order: 'jump', 'squat', 'lift' or 'raise'. */
  constructor({ steps, reader, side = 'right', onEvent = () => {} }) {
    this.steps = steps;
    this.reader = reader;
    this.side = side;
    this.onEvent = onEvent;
    this.index = -1;
    this.pause = 0;
    this.finished = false;
    this.startStep(0);
  }

  get step() {
    return this.steps[this.index] ?? null;
  }

  startStep(index) {
    this.index = index;
    const step = this.steps[index];
    this.easing = new Easing(this.reader, step, {
      side: this.side,
      onEased: (needed) => this.onEvent({ type: 'eased', step, needed }),
    });
    this.onEvent({ type: 'step', step: this.step, index, total: this.steps.length });
  }

  onMoves(moves) {
    if (this.pause > 0 || this.finished) return;
    if (moves.some(({ move }) => COUNTS[this.step].includes(move))) this.succeed();
  }

  succeed() {
    if (this.pause > 0 || this.finished) return;
    this.pause = AFTER_SUCCESS;
    this.onEvent({ type: 'success', step: this.step, index: this.index });
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
    this.easing.update(dt);
  }
}
