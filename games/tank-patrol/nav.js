// Finding the way round what's in the way. The valley is laid out as a grid of squares, each free or
// blocked, and a flow field says how far every square is from a goal. A tank just keeps going downhill
// in that field, cutting corners wherever it can see further along, so it can't get lost or caught in
// a dead end. No screen in this file, so it runs in the unit tests.

const ROOT_TWO = Math.SQRT2;
const STEPS_AHEAD = 18; // How far along its way a tank looks for a straight line.

/** A heap of squares by how far they are from the goal, nearest first. */
class Heap {
  constructor(capacity) {
    this.items = new Int32Array(capacity);
    this.costs = new Float32Array(capacity);
    this.size = 0;
  }

  clear() {
    this.size = 0;
  }

  push(item, cost) {
    if (this.size === this.items.length) return;
    let at = this.size;
    this.size += 1;
    const { items, costs } = this;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (costs[parent] <= cost) break;
      items[at] = items[parent];
      costs[at] = costs[parent];
      at = parent;
    }
    items[at] = item;
    costs[at] = cost;
  }

  pop() {
    const { items, costs } = this;
    const top = items[0];
    this.size -= 1;
    const item = items[this.size];
    const cost = costs[this.size];
    let at = 0;
    for (;;) {
      let child = at * 2 + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && costs[child + 1] < costs[child]) child += 1;
      if (costs[child] >= cost) break;
      items[at] = items[child];
      costs[at] = costs[child];
      at = child;
    }
    items[at] = item;
    costs[at] = cost;
    return top;
  }
}

export class NavGrid {
  /** bounds is { left, right, far, near, cell }, and isBlocked(x, z) says what can't be driven on. */
  constructor({ left, right, far, near, cell }, isBlocked) {
    this.left = left;
    this.far = far;
    this.cell = cell;
    this.cols = Math.ceil((right - left) / cell);
    this.rows = Math.ceil((near - far) / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const x = left + (col + 0.5) * cell;
        const z = far + (row + 0.5) * cell;
        this.blocked[row * this.cols + col] = isBlocked(x, z) ? 1 : 0;
      }
    }
    this.heap = new Heap(this.cols * this.rows * 8);
  }

  colOf(x) {
    return Math.floor((x - this.left) / this.cell);
  }

  rowOf(z) {
    return Math.floor((z - this.far) / this.cell);
  }

  /** The square at a place, or -1 outside the grid. */
  indexOf(x, z) {
    const col = this.colOf(x);
    const row = this.rowOf(z);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return -1;
    return row * this.cols + col;
  }

  centreX(index) {
    return this.left + ((index % this.cols) + 0.5) * this.cell;
  }

  centreZ(index) {
    return this.far + (Math.floor(index / this.cols) + 0.5) * this.cell;
  }

  isFree(x, z) {
    const index = this.indexOf(x, z);
    return index >= 0 && !this.blocked[index];
  }

  /** Everything that can't be reached from here becomes blocked, so that no goal is ever cut off. */
  keepOnlyWhatsReachable(x, z) {
    const seen = new Uint8Array(this.blocked.length);
    const start = this.indexOf(x, z);
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop();
      const col = index % this.cols;
      for (const next of [col > 0 ? index - 1 : -1, col < this.cols - 1 ? index + 1 : -1, index - this.cols, index + this.cols]) {
        if (next >= 0 && next < this.blocked.length && !seen[next] && !this.blocked[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    for (let index = 0; index < this.blocked.length; index += 1) {
      if (!seen[index]) this.blocked[index] = 1;
    }
  }

  /** The nearest place to here that can be driven on. */
  nearestFree(x, z) {
    if (this.isFree(x, z)) return { x, z };
    const col = Math.min(this.cols - 1, Math.max(0, this.colOf(x)));
    const row = Math.min(this.rows - 1, Math.max(0, this.rowOf(z)));
    let best = null;
    let bestGap = Infinity;
    const most = Math.max(this.cols, this.rows);
    for (let ring = 1; ring < most; ring += 1) {
      for (let dRow = -ring; dRow <= ring; dRow += 1) {
        for (let dCol = -ring; dCol <= ring; dCol += 1) {
          if (Math.max(Math.abs(dRow), Math.abs(dCol)) !== ring) continue;
          const c = col + dCol;
          const r = row + dRow;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          const index = r * this.cols + c;
          if (this.blocked[index]) continue;
          const gap = Math.hypot(this.centreX(index) - x, this.centreZ(index) - z);
          if (gap < bestGap) {
            bestGap = gap;
            best = index;
          }
        }
      }
      // Anything in a ring further out than this can't be any nearer.
      if (best !== null && bestGap <= ring * this.cell) break;
    }
    return best === null ? { x, z } : { x: this.centreX(best), z: this.centreZ(best) };
  }

  /** How far every square is from a goal, written into out if it's given. */
  flowTo(x, z, out = null) {
    const { cols, rows, blocked, heap } = this;
    const field = out ?? new Float32Array(cols * rows);
    field.fill(Infinity);
    const goal = this.nearestFree(x, z);
    const start = this.indexOf(goal.x, goal.z);
    if (start < 0) return field;
    heap.clear();
    field[start] = 0;
    heap.push(start, 0);
    while (heap.size) {
      const index = heap.pop();
      const here = field[index];
      const col = index % cols;
      const row = (index - col) / cols;
      for (let dRow = -1; dRow <= 1; dRow += 1) {
        const r = row + dRow;
        if (r < 0 || r >= rows) continue;
        for (let dCol = -1; dCol <= 1; dCol += 1) {
          if (dRow === 0 && dCol === 0) continue;
          const c = col + dCol;
          if (c < 0 || c >= cols) continue;
          const next = r * cols + c;
          if (blocked[next]) continue;
          // Not diagonally through a corner.
          if (dRow !== 0 && dCol !== 0 && (blocked[row * cols + c] || blocked[r * cols + col])) continue;
          const cost = here + (dRow !== 0 && dCol !== 0 ? ROOT_TWO : 1);
          if (cost < field[next]) {
            field[next] = cost;
            heap.push(next, cost);
          }
        }
      }
    }
    return field;
  }

  /** Whether a straight line between two places stays on free squares. */
  lineClear(ax, az, bx, bz) {
    const away = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(away / (this.cell * 0.5));
    for (let i = 0; i <= steps; i += 1) {
      const share = steps ? i / steps : 0;
      if (!this.isFree(ax + (bx - ax) * share, az + (bz - az) * share)) return false;
    }
    return true;
  }

  /** The next square downhill from one, or -1 at the bottom. */
  downhill(field, index) {
    const { cols, rows, blocked } = this;
    const col = index % cols;
    const row = (index - col) / cols;
    let best = -1;
    let bestCost = field[index];
    for (let dRow = -1; dRow <= 1; dRow += 1) {
      const r = row + dRow;
      if (r < 0 || r >= rows) continue;
      for (let dCol = -1; dCol <= 1; dCol += 1) {
        const c = col + dCol;
        if ((dRow === 0 && dCol === 0) || c < 0 || c >= cols) continue;
        const next = r * cols + c;
        if (blocked[next]) continue;
        if (dRow !== 0 && dCol !== 0 && (blocked[row * cols + c] || blocked[r * cols + col])) continue;
        if (field[next] < bestCost) {
          best = next;
          bestCost = field[next];
        }
      }
    }
    return best;
  }

  /**
   * Where to head for next on the way to the bottom of the field: the furthest place along the way
   * that can be seen in a straight line. goal, if it can be seen, is where it all ends.
   */
  waypoint(field, x, z, goal = null) {
    if (goal && this.lineClear(x, z, goal.x, goal.z)) return { x: goal.x, z: goal.z };
    let index = this.indexOf(x, z);
    // Somehow on a blocked square, which a push could do: straight off it, to the nearest free one.
    if (index < 0 || this.blocked[index] || field[index] === Infinity) return this.nearestFree(x, z);
    let best = null;
    for (let i = 0; i < STEPS_AHEAD; i += 1) {
      const next = this.downhill(field, index);
      if (next < 0) break;
      index = next;
      const cx = this.centreX(index);
      const cz = this.centreZ(index);
      if (best !== null && !this.lineClear(x, z, cx, cz)) break;
      best = { x: cx, z: cz };
    }
    return best ?? goal ?? { x, z };
  }

  /** The way from here to the bottom of the field, as a few straight legs, for showing on the ground. */
  route(field, x, z, goal = null, mostLegs = 7) {
    const points = [{ x, z }];
    let at = { x, z };
    for (let leg = 0; leg < mostLegs; leg += 1) {
      const next = this.waypoint(field, at.x, at.z, goal);
      if (Math.hypot(next.x - at.x, next.z - at.z) < 0.01) break;
      points.push(next);
      at = next;
      if (goal && next.x === goal.x && next.z === goal.z) break;
    }
    return points;
  }
}
