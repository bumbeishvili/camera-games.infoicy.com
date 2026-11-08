// The road: where it goes, how high it is, and where everything along it belongs.
//
// The car follows the road by itself and steering only moves it across the road, so nobody can
// crash or get stuck. Distances are in metres along the road from the start line.
import * as THREE from '../../vendor/three/three.module.js';
import { clamp, lerp, mod } from './kit.js';

export const LAP_LENGTH = 1400;
export const ROAD_HALF = 6.5;
export const LANE_LIMIT = ROAD_HALF - 1.5;
export const START_BEHIND_LINE = 44;

// Driving order, before scaling to the length of a lap. The first point is the start line.
const TRACK_SHAPE = [
  [-20, 122], [90, 112], [170, 48], [270, 34], [345, -50], [262, -165], [125, -122],
  [10, -185], [-125, -228], [-285, -170], [-350, -55], [-262, 62], [-140, 128],
];

// How high the road is at each distance. Flat for the start, up through the village and the hill,
// down to the lake, over the river, through the forest and back to the grandstands.
const ROAD_HEIGHTS = [
  [0, 0], [60, 0], [120, 0.6], [180, 1.4], [240, 2.2], [300, 5.2], [345, 7.5], [432, 8.5], [470, 10], [500, 9.5], [560, 4.6],
  [620, 1.8], [680, 1.2], [760, 2.8], [812, 2.8], [860, 2], [940, 5.5], [1000, 3.4], [1070, 1], [1180, 1.6], [1270, 0], [1340, 0],
];

// Where things are along the lap.
export const PLACES = {
  grandstand: [-105, 45],
  village: [118, 246],
  tunnel: [340, 434],
  lake: [570, 700],
  bridge: [770, 806],
  forest: [822, 1010],
  fair: [1085, 1205],
};

// The big hands and the ramps at level 1. Where they are at other levels is in rules.js.
export { GATE_SPOTS, RAMP_SPOTS } from './rules.js';

/** A smooth curve through ROAD_HEIGHTS, which carries on round the lap. */
function roadHeight(distance, length) {
  const keys = ROAD_HEIGHTS;
  const span = (from, to) => mod(keys[to][0] - keys[from][0], length);
  const d = mod(distance, length);
  let next = keys.findIndex(([at]) => at > d);
  if (next === -1) next = 0;
  const previous = mod(next - 1, keys.length);
  const before = mod(previous - 1, keys.length);
  const after = (next + 1) % keys.length;
  const size = span(previous, next);
  const slopeFrom = (keys[next][1] - keys[before][1]) / (span(before, previous) + size);
  const slopeTo = (keys[after][1] - keys[previous][1]) / (size + span(next, after));
  const t = mod(d - keys[previous][0], length) / size;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * keys[previous][1] + (t3 - 2 * t2 + t) * size * slopeFrom
    + (3 * t2 - 2 * t3) * keys[next][1] + (t3 - t2) * size * slopeTo;
}

const HASH_CELL = 30;

export class Track {
  constructor() {
    const shape = TRACK_SHAPE.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const rawLength = new THREE.CatmullRomCurve3(shape, true, 'centripetal').getLength();
    const scale = LAP_LENGTH / rawLength;
    const curve = new THREE.CatmullRomCurve3(shape.map((point) => point.clone().multiplyScalar(scale)), true, 'centripetal');
    curve.arcLengthDivisions = 2400;

    this.length = curve.getLength();
    this.count = Math.round(this.length / 2);
    this.step = this.length / this.count;
    this.points = curve.getSpacedPoints(this.count).slice(0, this.count);

    const heights = this.points.map((_, i) => roadHeight(i * this.step, this.length));
    this.points.forEach((point, i) => {
      // A few metres of averaging, so that no two stretches of road meet at a kink.
      let total = 0;
      for (let k = -3; k <= 3; k += 1) total += heights[mod(i + k, this.count)];
      point.y = total / 7;
    });

    this.tangents = this.points.map((_, i) =>
      new THREE.Vector3().subVectors(this.points[(i + 1) % this.count], this.points[mod(i - 1, this.count)]).normalize());
    // Looking along +Z with Y up, the driver's right is -X. The road isn't banked, so right is level.
    this.rights = this.tangents.map((t) => new THREE.Vector3(-t.z, 0, t.x).normalize());
    // Positive when the road bends right.
    this.curvatures = this.points.map((_, i) => {
      const next = this.tangents[(i + 2) % this.count];
      const previous = this.tangents[mod(i - 2, this.count)];
      return new THREE.Vector3().subVectors(next, previous).dot(this.rights[i]) / (4 * this.step);
    });

    this.hash = new Map();
    this.points.forEach((point, i) => {
      const key = this.cellKey(Math.floor(point.x / HASH_CELL), Math.floor(point.z / HASH_CELL));
      if (!this.hash.has(key)) this.hash.set(key, []);
      this.hash.get(key).push(i);
    });
  }

  cellKey(column, row) {
    return column * 4096 + row;
  }

  locate(distance) {
    const u = mod(distance, this.length) / this.step;
    const index = Math.floor(u);
    return { a: index % this.count, b: (index + 1) % this.count, f: u - index };
  }

  pointAt(distance, lateral, out) {
    const { a, b, f } = this.locate(distance);
    out.lerpVectors(this.points[a], this.points[b], f);
    out.x += lerp(this.rights[a].x, this.rights[b].x, f) * lateral;
    out.z += lerp(this.rights[a].z, this.rights[b].z, f) * lateral;
    return out;
  }

  heightAt(distance) {
    const { a, b, f } = this.locate(distance);
    return lerp(this.points[a].y, this.points[b].y, f);
  }

  /** Which way the road is heading: the turn that points a thing's +Z along it. */
  headingAt(distance) {
    const { a, b, f } = this.locate(distance);
    return Math.atan2(lerp(this.tangents[a].x, this.tangents[b].x, f), lerp(this.tangents[a].z, this.tangents[b].z, f));
  }

  /** How steeply the road climbs, in radians. Positive is uphill. */
  pitchAt(distance) {
    const { a, b, f } = this.locate(distance);
    return Math.asin(clamp(lerp(this.tangents[a].y, this.tangents[b].y, f), -1, 1));
  }

  curvatureAt(distance) {
    return this.curvatures[this.locate(distance).a];
  }

  /** The turn that makes a thing at the roadside face the road. side is 1 for the right of the road. */
  facingRoad(distance, side) {
    return this.headingAt(distance) + (side * Math.PI) / 2;
  }

  /** How far a spot is from the road. Slow but complete, for placing things. */
  distanceTo(x, z) {
    let closest = Infinity;
    for (let i = 0; i < this.count; i += 3) {
      const dx = this.points[i].x - x;
      const dz = this.points[i].z - z;
      const squared = dx * dx + dz * dz;
      if (squared < closest) closest = squared;
    }
    return Math.sqrt(closest);
  }

  /** The nearest bit of road within about 60 m, or null. Fast enough to use for the whole terrain. */
  nearest(x, z) {
    const column = Math.floor(x / HASH_CELL);
    const row = Math.floor(z / HASH_CELL);
    let closest = Infinity;
    let index = -1;
    for (let c = column - 2; c <= column + 2; c += 1) {
      for (let r = row - 2; r <= row + 2; r += 1) {
        const cell = this.hash.get(this.cellKey(c, r));
        if (!cell) continue;
        for (const i of cell) {
          const dx = this.points[i].x - x;
          const dz = this.points[i].z - z;
          const squared = dx * dx + dz * dz;
          if (squared < closest) {
            closest = squared;
            index = i;
          }
        }
      }
    }
    return index === -1 ? null : { index, gap: Math.sqrt(closest), along: index * this.step };
  }
}

/** Whether a distance along the lap is inside a stretch that was given as [from, to]. */
export function within(distance, [from, to], length) {
  return mod(distance - from, length) <= mod(to - from, length);
}
