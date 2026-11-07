// The sea chart: how much room a ship has anywhere around the island, so that everyone can be steered
// round the coast without ever hitting it. It's measured once from the island's own map. There's no
// screen in this file, so it runs in the unit tests.
import { coastAt, heightAt } from '../sky-wings/island-map.js';

const CELL = 12;
const REACH = 1320; // From the middle of the island, a little further than any ship can go.
const CELLS = Math.ceil((REACH * 2) / CELL) + 1;
const SHALLOW = -5; // Shallower than this counts as land, as a ship needs water under it.
const DIAGONAL = Math.SQRT2 * CELL;

const at = (column, row) => row * CELLS + column;
const cellOf = (value) => (value + REACH) / CELL;

/** The harbour's piers and boats stand in the water on the south coast, so ships keep out of them. */
function harbour() {
  const south = coastAt(Math.PI / 2 - 0.06);
  return { left: south.x - 56, right: south.x + 56, top: south.z - 20, bottom: south.z + 128 };
}

class Chart {
  constructor() {
    this.heights = new Float32Array(CELLS * CELLS);
    this.rooms = new Float32Array(CELLS * CELLS);
    const pier = harbour();
    for (let row = 0; row < CELLS; row += 1) {
      const z = row * CELL - REACH;
      for (let column = 0; column < CELLS; column += 1) {
        const x = column * CELL - REACH;
        const height = heightAt(x, z);
        const index = at(column, row);
        this.heights[index] = height;
        const land = height > SHALLOW || (x > pier.left && x < pier.right && z > pier.top && z < pier.bottom);
        this.rooms[index] = land ? 0 : Infinity;
      }
    }
    this.measureRoom();
  }

  /** How far each cell is from the nearest land, going over the grid once each way. */
  measureRoom() {
    const { rooms } = this;
    const relax = (index, from, step) => {
      if (rooms[from] + step < rooms[index]) rooms[index] = rooms[from] + step;
    };
    for (let row = 0; row < CELLS; row += 1) {
      for (let column = 0; column < CELLS; column += 1) {
        const index = at(column, row);
        if (column > 0) relax(index, at(column - 1, row), CELL);
        if (row > 0) {
          relax(index, at(column, row - 1), CELL);
          if (column > 0) relax(index, at(column - 1, row - 1), DIAGONAL);
          if (column < CELLS - 1) relax(index, at(column + 1, row - 1), DIAGONAL);
        }
      }
    }
    for (let row = CELLS - 1; row >= 0; row -= 1) {
      for (let column = CELLS - 1; column >= 0; column -= 1) {
        const index = at(column, row);
        if (column < CELLS - 1) relax(index, at(column + 1, row), CELL);
        if (row < CELLS - 1) {
          relax(index, at(column, row + 1), CELL);
          if (column < CELLS - 1) relax(index, at(column + 1, row + 1), DIAGONAL);
          if (column > 0) relax(index, at(column - 1, row + 1), DIAGONAL);
        }
      }
    }
  }

  /** Between the four nearest cells, so that a ship's path along the coast is smooth. */
  sample(values, x, z) {
    const u = Math.min(CELLS - 1.001, Math.max(0, cellOf(x)));
    const v = Math.min(CELLS - 1.001, Math.max(0, cellOf(z)));
    const column = Math.floor(u);
    const row = Math.floor(v);
    const shareX = u - column;
    const shareZ = v - row;
    const top = values[at(column, row)] + (values[at(column + 1, row)] - values[at(column, row)]) * shareX;
    const bottom = values[at(column, row + 1)] + (values[at(column + 1, row + 1)] - values[at(column, row + 1)]) * shareX;
    return top + (bottom - top) * shareZ;
  }

  /** How far it is from here to the nearest land. */
  room(x, z) {
    return this.sample(this.rooms, x, z);
  }

  /** Which way is away from the nearest land, as a direction of length 1. */
  away(x, z) {
    const dx = this.room(x + CELL, z) - this.room(x - CELL, z);
    const dz = this.room(x, z + CELL) - this.room(x, z - CELL);
    const size = Math.hypot(dx, dz);
    // Exactly between two shores: out to sea is as good a way as any.
    if (size < 1e-6) {
      const middle = Math.hypot(x, z) || 1;
      return { x: x / middle, z: z / middle };
    }
    return { x: dx / size, z: dz / size };
  }

  /** The height of the land or the sea floor, with the sea at 0. */
  height(x, z) {
    return this.sample(this.heights, x, z);
  }
}

export const CHART = { cell: CELL, reach: REACH, cells: CELLS };

let chart = null;

/** Measuring takes a moment, so it's done once, the first time anyone needs it. */
export function getChart() {
  chart ??= new Chart();
  return chart;
}
