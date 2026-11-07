// Bringing what counts down to meet a child who's trying. If they've been going at a move for a few
// seconds without reaching what counts, it comes down to just below the best they've done, the way
// the hand games set each hand's own line. No screen in this file, so it runs in the unit tests.

const EASE_EVERY = 5; // Seconds of trying before what counts comes down.
const EASE_SHARE = 0.85; // What counts comes down to this share of the best try.

// How each move reads, what counts for it now, and where that's kept. Below least, a reading could
// just be the tracker wobbling on someone standing still. Those come from what the real model
// reported for real people standing and holding still, where a jump read up to 0.024, sinking
// 0.056, a foot 0.062, and a resting hand -0.77.
const MOVES = {
  jump: { read: (reader) => reader.jumpEffort, needed: (reader) => reader.jumpNeeded, field: 'jump', least: 0.035 },
  squat: { read: (reader) => reader.sink ?? 0, needed: (reader) => reader.squatNeeded, field: 'squat', least: 0.07 },
  lift: { read: (reader) => reader.footHeight, needed: (reader) => reader.legNeeded, field: 'leg', least: 0.08 },
  raise: { read: (reader, side) => reader.handHeight[side], needed: (reader) => reader.handNeeded, field: 'hand', least: -0.55, below: 0.08 },
  wings: { read: (reader) => reader.wings.span, needed: (reader) => reader.wingsNeeded, field: 'wings', least: 1.75 },
};

export class Easing {
  /** move is one of the above, and side is which hand, for raising one. */
  constructor(reader, move, { side = 'right', onEased = () => {} } = {}) {
    this.reader = reader;
    this.move = MOVES[move];
    this.side = side;
    this.onEased = onEased;
    this.seconds = 0;
    this.best = -Infinity;
  }

  update(dt) {
    const { move, reader } = this;
    this.seconds += dt;
    this.best = Math.max(this.best, move.read(reader, this.side));
    if (this.seconds < EASE_EVERY) return;
    if (this.best > move.least) {
      const easier = move.below ? this.best - move.below : this.best * EASE_SHARE;
      const next = Math.max(move.least, easier);
      if (next < move.needed(reader)) {
        reader.personal[move.field] = next;
        this.onEased(next);
      }
    }
    this.seconds = 0;
    this.best = -Infinity;
  }
}
