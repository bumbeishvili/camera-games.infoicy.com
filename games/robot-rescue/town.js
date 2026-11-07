// The town the tram rides through: a market square, a canal with a bridge, the harbour, a windmill
// farm and the clock tower square. Everything is made of simple shapes in code, and it's all one long
// street, so that each place can be seen from the one before it, and the tower from the very start.
//
// Most of the town doesn't move, so it's joined into one big mesh for each place, which keeps drawing
// cheap, and its shadows are worked out once at the start. Nothing here flashes, and the light stays
// the same all day.
import * as THREE from '../../vendor/three/three.module.js';
import { outlineMaterial, toon } from '../../core/body/characters.js';
import { PLACES } from './rescue.js';

const INK = '#2a2a3a';
const STOREY = 3.3;
const STONE = '#c9bda6';
const STONE_DARK = '#a79a84';
const CREAM = '#fff7e6';
const WOOD = '#a8743f';
const WOOD_DARK = '#7a5230';
const WOOD_LIGHT = '#c99a5f';
const IRON = '#47525e';
const GLASS = '#79c3e0';
export const WATER_LEVEL = -1.1;

const WALLS = ['#f6d9a8', '#f4b98c', '#efa07c', '#f7e6c4', '#a9d8c9', '#9fc9e8', '#f2c6d0', '#e9d48a', '#d7c6ef', '#f5ecd9'];
const ROOFS = ['#d9583f', '#c9683d', '#b84e3a', '#e07a45', '#a8483f'];
const SHUTTERS = ['#3f8f8a', '#3f6fb0', '#c2504a', '#5b8a3c', '#8a5fb5', '#d98a2b'];
const AWNINGS = [['#e8574c', '#fff4e0'], ['#3f86d9', '#fff4e0'], ['#f0b429', '#fff4e0'], ['#35a88a', '#fff4e0'], ['#b45fd0', '#fff4e0']];
const FLOWERS = ['#ff6f91', '#ffd23f', '#ffffff', '#ff8a5c', '#c58cff'];
const FLAGS = ['#ff5a4f', '#ffd23f', '#3b82f6', '#27c96b', '#a855f7', '#ff7eb6'];
const FRUIT = ['#e8433f', '#ff9f2e', '#ffd23f', '#7ac74f', '#b05cc9'];

/** The same numbers every time, so that the town doesn't change from one game to the next. */
function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const pickFrom = (rand, list) => list[Math.floor(rand() * list.length)];
const shade = (colour, by) => `#${new THREE.Color(colour).multiplyScalar(by).getHexString()}`;

/* ---------- where each place is on the map ---------- */

// at is where the tram stops, as x and z on the map. yaw turns it to the left.
export const STOP_SPOTS = {
  market: { at: [0, 0], yaw: 0 },
  canal: { at: [0, -32], yaw: 0 },
  harbour: { at: [-5, -70], yaw: 0.22 },
  farm: { at: [-9, -106], yaw: -0.18 },
  tower: { at: [-2, -146], yaw: 0 },
};

const FORWARD = (yaw) => new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));

/** The way the tram goes, one curve from each stop to the next, arriving straight ahead. */
export class Route {
  constructor() {
    this.legs = PLACES.slice(1).map((place, index) => {
      const from = STOP_SPOTS[PLACES[index].id];
      const to = STOP_SPOTS[place.id];
      const start = new THREE.Vector3(from.at[0], 0, from.at[1]);
      const end = new THREE.Vector3(to.at[0], 0, to.at[1]);
      const handle = start.distanceTo(end) * 0.42;
      const curve = new THREE.CubicBezierCurve3(
        start,
        start.clone().addScaledVector(FORWARD(from.yaw), handle),
        end.clone().addScaledVector(FORWARD(to.yaw), -handle),
        end,
      );
      curve.arcLengthDivisions = 60;
      return curve;
    });
    this.lengths = this.legs.map((leg) => leg.getLength());
  }

  /** Where the tram is and which way it's going, between two places in PLACES, some share of the way. */
  along(fromIndex, toIndex, share, position, tangent) {
    const total = this.lengths.slice(fromIndex, toIndex).reduce((sum, length) => sum + length, 0);
    let left = share * total;
    let leg = fromIndex;
    while (leg < toIndex - 1 && left > this.lengths[leg]) {
      left -= this.lengths[leg];
      leg += 1;
    }
    const part = Math.min(1, left / this.lengths[leg]);
    this.legs[leg].getPointAt(part, position);
    this.legs[leg].getTangentAt(part, tangent);
  }
}

/* ---------- a box of simple shapes ---------- */

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const UP = new THREE.Vector3(0, 1, 0);
const roundShapes = new Map();
const cylinders = new Map();
const cones = new Map();

function roundShape(detail) {
  if (!roundShapes.has(detail)) {
    const shape = new THREE.IcosahedronGeometry(1, detail);
    // Smooth, even at the coarsest.
    const { position, normal } = shape.attributes;
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) {
      point.fromBufferAttribute(position, i).normalize();
      normal.setXYZ(i, point.x, point.y, point.z);
    }
    roundShapes.set(detail, shape);
  }
  return roundShapes.get(detail);
}

function cached(store, key, make) {
  if (!store.has(key)) store.set(key, make());
  return store.get(key);
}

/** A triangular roof, with its ridge running from front to back, and its front at z = 0. */
function gableRoof(width, rise, depth) {
  const x = width / 2;
  const points = [
    [-x, 0, 0], [0, rise, -depth], [0, rise, 0], [-x, 0, 0], [-x, 0, -depth], [0, rise, -depth],
    [x, 0, 0], [0, rise, 0], [0, rise, -depth], [x, 0, 0], [0, rise, -depth], [x, 0, -depth],
    [-x, 0, 0], [x, 0, 0], [0, rise, 0],
    [x, 0, -depth], [-x, 0, -depth], [0, rise, -depth],
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Collects shapes, each with its own colour, and joins them into one mesh. */
export class Kit {
  constructor() {
    this.position = [];
    this.normal = [];
    this.colour = [];
    this.matrix = new THREE.Matrix4();
    this.tint = new THREE.Color();
  }

  /** Draws in a space moved here and turned by yaw. +z is its front, and -z its back. */
  at(x, y, z, yaw, draw) {
    const saved = this.matrix.clone();
    const quaternion = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    this.matrix.multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(1, 1, 1)));
    draw(this);
    this.matrix.copy(saved);
    return this;
  }

  place(geometry, colour, position, quaternion, scale) {
    const whole = geometry.index ? geometry.toNonIndexed() : geometry;
    const matrix = new THREE.Matrix4().compose(position, quaternion, scale).premultiply(this.matrix);
    const normals = new THREE.Matrix3().getNormalMatrix(matrix);
    this.tint.set(colour);
    const { position: from, normal } = whole.attributes;
    const point = new THREE.Vector3();
    for (let i = 0; i < from.count; i += 1) {
      point.fromBufferAttribute(from, i).applyMatrix4(matrix);
      this.position.push(point.x, point.y, point.z);
      point.fromBufferAttribute(normal, i).applyMatrix3(normals).normalize();
      this.normal.push(point.x, point.y, point.z);
      this.colour.push(this.tint.r, this.tint.g, this.tint.b);
    }
    return this;
  }

  add(geometry, colour, x = 0, y = 0, z = 0, { turn = [0, 0, 0], size = [1, 1, 1] } = {}) {
    return this.place(geometry, colour, new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(...turn)), new THREE.Vector3(...size));
  }

  /** A box, with x and z in the middle of it and y at its bottom. */
  box(width, height, depth, colour, x = 0, y = 0, z = 0, turn = [0, 0, 0]) {
    return this.add(UNIT_BOX, colour, x, y + height / 2, z, { size: [width, height, depth], turn });
  }

  /** An upright round thing, with y at its bottom. */
  post(top, bottom, height, colour, x = 0, y = 0, z = 0, sides = 8) {
    const shape = cached(cylinders, `${top} ${bottom} ${height} ${sides}`, () => new THREE.CylinderGeometry(top, bottom, height, sides).toNonIndexed());
    return this.add(shape, colour, x, y + height / 2, z);
  }

  /** A round thing lying down, along x, with its middle at this point. */
  roller(radius, length, colour, x = 0, y = 0, z = 0, sides = 14) {
    const shape = cached(cylinders, `${radius} ${radius} ${length} ${sides}`, () => new THREE.CylinderGeometry(radius, radius, length, sides).toNonIndexed());
    return this.add(shape, colour, x, y, z, { turn: [0, 0, Math.PI / 2] });
  }

  orb(rx, ry, rz, colour, x = 0, y = 0, z = 0, detail = 1) {
    return this.add(roundShape(detail), colour, x, y, z, { size: [rx, ry, rz] });
  }

  cone(radius, height, colour, x = 0, y = 0, z = 0, sides = 8) {
    const shape = cached(cones, `${radius} ${height} ${sides}`, () => new THREE.ConeGeometry(radius, height, sides).toNonIndexed());
    return this.add(shape, colour, x, y + height / 2, z);
  }

  /** A beam between two points. */
  beam(thick, colour, from, to) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const way = end.clone().sub(start);
    const length = way.length();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, way.normalize());
    return this.place(UNIT_BOX, colour, start.add(end).multiplyScalar(0.5), quaternion, new THREE.Vector3(thick, length, thick));
  }

  /** A flat strip along a line of points, for the bed of the tram line. */
  strip(points, width, colour, y) {
    this.tint.set(colour);
    const { r, g, b } = this.tint;
    const push = (x, z) => {
      this.position.push(x, y, z);
      this.normal.push(0, 1, 0);
      this.colour.push(r, g, b);
    };
    for (let i = 0; i < points.length - 1; i += 1) {
      const [a, b2] = [points[i], points[i + 1]];
      const way = b2.clone().sub(a).normalize();
      const sideX = -way.z * (width / 2);
      const sideZ = way.x * (width / 2);
      push(a.x - sideX, a.z - sideZ);
      push(a.x + sideX, a.z + sideZ);
      push(b2.x + sideX, b2.z + sideZ);
      push(a.x - sideX, a.z - sideZ);
      push(b2.x + sideX, b2.z + sideZ);
      push(b2.x - sideX, b2.z - sideZ);
    }
    return this;
  }

  build(material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colour, 3));
    return new THREE.Mesh(geometry, material);
  }
}

/* ---------- buildings ---------- */

function windowAt(kit, x, y, { shutter, flowers, rand }) {
  kit.box(1.36, 1.92, 0.08, CREAM, x, y - 0.96, 0.03);
  kit.box(1.08, 1.62, 0.08, GLASS, x, y - 0.81, 0.07);
  kit.box(0.07, 1.62, 0.1, CREAM, x, y - 0.81, 0.09);
  kit.box(1.08, 0.07, 0.1, CREAM, x, y - 0.1, 0.09);
  if (shutter) {
    kit.box(0.46, 1.8, 0.07, shutter, x - 0.92, y - 0.9, 0.05);
    kit.box(0.46, 1.8, 0.07, shutter, x + 0.92, y - 0.9, 0.05);
  }
  kit.box(1.56, 0.1, 0.24, STONE, x, y - 1.02, 0.12);
  if (flowers) {
    kit.box(1.3, 0.24, 0.3, WOOD, x, y - 1.24, 0.2);
    for (let i = 0; i < 5; i += 1) {
      kit.orb(0.17, 0.16, 0.17, i % 2 ? '#4f9f47' : pickFrom(rand, FLOWERS), x - 0.5 + i * 0.25, y - 0.94, 0.2, 0);
    }
  }
}

/** A carved wooden balcony, as old towns have, most of the way across a floor. */
function balcony(kit, width, y, colour) {
  kit.box(width, 0.16, 1.2, WOOD_DARK, 0, y, 0.6);
  const posts = Math.round(width / 0.32);
  for (let i = 0; i <= posts; i += 1) kit.box(0.07, 0.86, 0.07, colour, -width / 2 + (i / posts) * width, y + 0.16, 1.14);
  kit.box(width + 0.1, 0.1, 0.14, colour, 0, y + 1, 1.14);
  kit.box(width + 0.1, 0.08, 0.1, colour, 0, y + 0.4, 1.14);
  // Slim posts up to a little roof, with a fringe along it.
  for (const share of [-0.5, -0.17, 0.17, 0.5]) kit.box(0.1, 2.4, 0.1, colour, share * width, y + 0.16, 1.14);
  kit.box(width + 0.3, 0.1, 1.5, colour, 0, y + 2.52, 0.68);
  for (let i = 0; i <= posts; i += 1) kit.box(0.14, 0.2, 0.05, i % 2 ? colour : '#fff4e0', -width / 2 + (i / posts) * width, y + 2.34, 1.42);
}

function awning(kit, width, depth, y, colours, sag = 0.7) {
  const stripes = Math.max(4, Math.round(width / 0.55));
  const slope = Math.atan2(sag, depth);
  const wide = width / stripes;
  for (let i = 0; i < stripes; i += 1) {
    const x = -width / 2 + (i + 0.5) * wide;
    const colour = colours[i % 2];
    kit.box(wide, 0.06, Math.hypot(depth, sag), colour, x, y - sag / 2, depth / 2, [slope, 0, 0]);
    // A scalloped edge along the front.
    kit.orb(wide / 2, 0.16, 0.04, colour, x, y - sag - 0.02, depth + 0.01, 0);
  }
}

function roofTiles(kit, width, rise, depth, y, roof, front) {
  const span = width / 2;
  const slope = Math.atan2(rise, span);
  const along = front - depth / 2;
  for (let row = 0; row < 5; row += 1) {
    const share = (row + 0.5) / 5;
    const colour = shade(roof, row % 2 ? 0.86 : 1.08);
    for (const side of [-1, 1]) {
      kit.box(Math.hypot(span, rise) / 5, 0.05, depth, colour, side * span * (1 - share), y + rise * share, along, [0, 0, side * -slope]);
    }
  }
}

function house(kit, { w = 9, d = 8, floors = 3, wall, roof, shutter, gable = true, door = null, shop = null, balconyOn = 0, balconyColour = '#3f8f8a', flowers = true, chimney = true, rand }) {
  const h = floors * STOREY + 0.5;
  kit.box(w, h, d, wall, 0, 0, -d / 2);
  kit.box(w + 0.14, 1, d + 0.14, STONE, 0, 0, -d / 2);
  for (let floor = 1; floor < floors; floor += 1) kit.box(w + 0.1, 0.13, d + 0.1, CREAM, 0, floor * STOREY + 0.3, -d / 2);
  kit.box(w + 0.28, 0.2, d + 0.28, CREAM, 0, h - 0.05, -d / 2);

  const columns = Math.max(2, Math.floor(w / 2.7));
  const spacing = w / columns;
  for (let floor = 1; floor < floors; floor += 1) {
    for (let column = 0; column < columns; column += 1) {
      windowAt(kit, -w / 2 + (column + 0.5) * spacing, floor * STOREY + 2.55, { shutter, flowers: flowers && rand() < 0.55, rand });
    }
  }
  if (balconyOn && balconyOn < floors) balcony(kit, w * 0.86, balconyOn * STOREY + 0.32, balconyColour);

  // The ground floor: a shop front, or a plain door and a window.
  if (shop) {
    kit.box(w * 0.7, 2.1, 0.08, GLASS, 0, 0.7, 0.05);
    for (let i = 0; i <= 3; i += 1) kit.box(0.1, 2.1, 0.12, CREAM, -w * 0.35 + (i / 3) * w * 0.7, 0.7, 0.07);
    kit.box(w * 0.74, 0.5, 0.12, shop[0], 0, 2.82, 0.08);
    awning(kit, w * 0.8, 1.7, 2.8, shop);
  } else {
    const doorX = columns % 2 ? 0 : -spacing / 2;
    kit.box(1.5, 2.5, 0.1, door ?? shutter, doorX, 0, 0.05);
    kit.box(1.8, 0.16, 0.2, CREAM, doorX, 2.5, 0.08);
    kit.box(1.9, 0.14, 0.7, STONE, doorX, 0, 0.35);
    kit.orb(0.08, 0.08, 0.05, '#ffd23f', doorX + 0.5, 1.2, 0.14, 0);
    windowAt(kit, doorX + spacing, 2.7, { shutter, flowers: false, rand });
  }

  const overhang = 0.5;
  const rise = Math.min(4.2, w * 0.42);
  if (gable) {
    const span = w + overhang * 2;
    const long = d + overhang * 2;
    kit.add(gableRoof(span, rise, long), roof, 0, h + 0.1, overhang);
    roofTiles(kit, span, rise, long, h + 0.13, roof, overhang);
  } else {
    // The ridge running along the street, with a slope facing it.
    const span = d + overhang * 2;
    const long = w + overhang * 2;
    kit.at(0, h + 0.1, -d / 2, Math.PI / 2, () => {
      kit.add(gableRoof(span, Math.min(rise, 3.2), long), roof, 0, 0, long / 2);
      roofTiles(kit, span, Math.min(rise, 3.2), long, 0.03, roof, long / 2);
    });
  }
  if (chimney) {
    const x = (rand() < 0.5 ? -1 : 1) * w * 0.26;
    kit.box(0.8, 2.4, 0.8, '#b5654a', x, h + rise * 0.3, -d * 0.45);
    kit.box(1, 0.2, 1, STONE, x, h + rise * 0.3 + 2.4, -d * 0.45);
  }
}

/**
 * A row of houses, each next to the last along its own x, starting from here. Houses face +z turned
 * by yaw, so with yaw of a quarter turn they run away from the tram, facing the street on its left.
 */
function row(kit, rand, { x, z, yaw, widths, floors = [3, 4], shops = 0.3, balconies = 0.5, gables = 0.65, flowers = true }) {
  let along = 0;
  for (const w of widths) {
    const howHigh = Math.round(floors[0] + rand() * (floors[1] - floors[0]));
    const spot = along + w / 2;
    kit.at(x + Math.cos(yaw) * spot, 0, z - Math.sin(yaw) * spot, yaw, () => {
      house(kit, {
        w,
        d: 7 + rand() * 3,
        floors: howHigh,
        wall: pickFrom(rand, WALLS),
        roof: pickFrom(rand, ROOFS),
        shutter: pickFrom(rand, SHUTTERS),
        gable: rand() < gables,
        shop: rand() < shops ? pickFrom(rand, AWNINGS) : null,
        balconyOn: rand() < balconies ? 1 + Math.floor(rand() * (howHigh - 1)) : 0,
        balconyColour: pickFrom(rand, SHUTTERS),
        flowers,
        rand,
      });
    });
    along += w + 0.08;
  }
}

/* ---------- things in the street ---------- */

function crate(kit, size, x, y, z, turn = 0) {
  kit.at(x, y, z, turn, () => {
    kit.box(size, size, size, WOOD_LIGHT, 0, 0, 0);
    for (const edge of [0.02, size - 0.13]) kit.box(size + 0.04, 0.11, size + 0.04, WOOD, 0, edge, 0);
    kit.box(0.11, size, size + 0.04, WOOD, -size / 2 + 0.03, 0, 0);
    kit.box(0.11, size, size + 0.04, WOOD, size / 2 - 0.03, 0, 0);
  });
}

function barrel(kit, x, y, z, height = 1.4, radius = 0.55) {
  kit.post(radius, radius * 0.86, height / 2, WOOD, x, y + height / 2, z, 12);
  kit.post(radius * 0.86, radius, height / 2, WOOD, x, y, z, 12);
  kit.post(radius * 1.03, radius * 1.03, 0.09, IRON, x, y + height * 0.72, z, 12);
  kit.post(radius * 1.03, radius * 1.03, 0.09, IRON, x, y + height * 0.2, z, 12);
  kit.post(radius * 0.84, radius * 0.84, 0.03, WOOD_DARK, x, y + height, z, 12);
}

function fruitCrate(kit, rand, x, y, z, colour) {
  kit.box(1.1, 0.42, 0.8, WOOD_LIGHT, x, y, z);
  kit.box(1.16, 0.08, 0.86, WOOD, x, y + 0.4, z);
  for (let i = 0; i < 9; i += 1) {
    kit.orb(0.16, 0.16, 0.16, colour, x - 0.38 + (i % 3) * 0.38, y + 0.54 + rand() * 0.06, z - 0.24 + Math.floor(i / 3) * 0.24, 0);
  }
}

function stall(kit, rand, colours, x, z, yaw) {
  kit.at(x, 0, z, yaw, () => {
    const w = 4.4;
    const d = 2.2;
    for (const [px, pz] of [[-w / 2, 0.9], [w / 2, 0.9], [-w / 2, -d], [w / 2, -d]]) kit.box(0.14, 3, 0.14, WOOD_DARK, px, 0, pz);
    kit.box(w, 0.9, 1.4, WOOD, 0, 0, 0);
    kit.box(w + 0.2, 0.09, 1.5, WOOD_LIGHT, 0, 0.9, 0);
    for (let i = 0; i < 3; i += 1) fruitCrate(kit, rand, -1.4 + i * 1.4, 1, 0.05, pickFrom(rand, FRUIT));
    kit.at(0, 0, -d, 0, () => awning(kit, w + 0.5, d + 1.5, 3.5, colours, 0.65));
    kit.box(1.5, 0.34, 0.06, colours[0], 0, 3.1, 0.92);
  });
}

function lamp(kit, x, z) {
  kit.post(0.08, 0.13, 4.2, IRON, x, 0, z, 8);
  kit.post(0.26, 0.26, 0.2, IRON, x, 0, z, 8);
  kit.box(0.9, 0.07, 0.07, IRON, x, 4.1, z);
  for (const side of [-1, 1]) {
    kit.orb(0.2, 0.26, 0.2, '#fff0b3', x + side * 0.42, 3.82, z, 1);
    kit.post(0.03, 0.2, 0.1, IRON, x + side * 0.42, 4.02, z, 6);
  }
}

function roundTree(kit, x, z, size = 1, green = '#5fb954') {
  const trunk = 1.7 * size;
  kit.post(0.17 * size, 0.28 * size, trunk + 0.7 * size, WOOD_DARK, x, 0, z, 7);
  kit.orb(1.5 * size, 1.3 * size, 1.5 * size, green, x, trunk + 1.4 * size, z, 1);
  kit.orb(1 * size, 0.9 * size, 1 * size, shade(green, 1.12), x + 0.9 * size, trunk + 0.8 * size, z + 0.4 * size, 1);
  kit.orb(1 * size, 0.9 * size, 1 * size, shade(green, 0.9), x - 0.9 * size, trunk + 0.9 * size, z - 0.3 * size, 1);
}

function fruitTree(kit, rand, x, z, fruit, size = 1) {
  roundTree(kit, x, z, size, '#55ad4f');
  for (let i = 0; i < 12; i += 1) {
    const angle = rand() * Math.PI * 2;
    const up = 1 + rand() * 2;
    kit.orb(0.17, 0.17, 0.17, fruit, x + Math.cos(angle) * 1.45 * size, (1.2 + up) * size + 0.2, z + Math.sin(angle) * 1.45 * size, 0);
  }
}

function cypress(kit, x, z, size = 1) {
  kit.post(0.1 * size, 0.16 * size, 0.8 * size, WOOD_DARK, x, 0, z, 6);
  kit.orb(0.75 * size, 3 * size, 0.75 * size, '#3b8a5c', x, 3.3 * size, z, 1);
}

function planter(kit, rand, x, z) {
  kit.post(0.75, 0.55, 0.8, '#d9855f', x, 0, z, 10);
  kit.post(0.8, 0.8, 0.12, '#e8a07a', x, 0.76, z, 10);
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2;
    kit.orb(0.26, 0.24, 0.26, i % 2 ? '#4f9f47' : pickFrom(rand, FLOWERS), x + Math.cos(angle) * 0.44, 1, z + Math.sin(angle) * 0.44, 0);
  }
  kit.orb(0.46, 0.36, 0.46, '#5fb954', x, 1.16, z, 1);
}

/** A string of little flags between two points, sagging in the middle. */
function bunting(kit, from, to, count = 22, sag = 1.1) {
  const flag = new THREE.ConeGeometry(0.34, 0.68, 3).rotateX(Math.PI).scale(1, 1, 0.12).toNonIndexed();
  let last = from;
  for (let i = 1; i <= count; i += 1) {
    const share = i / count;
    const point = [
      from[0] + (to[0] - from[0]) * share,
      from[1] + (to[1] - from[1]) * share - Math.sin(share * Math.PI) * sag,
      from[2] + (to[2] - from[2]) * share,
    ];
    kit.beam(0.035, '#6b5a4a', last, point);
    kit.add(flag, FLAGS[i % FLAGS.length], point[0], point[1] - 0.36, point[2]);
    last = point;
  }
}

function bench(kit, x, z, yaw) {
  kit.at(x, 0, z, yaw, () => {
    kit.box(2, 0.1, 0.55, WOOD_LIGHT, 0, 0.5, 0);
    kit.box(2, 0.45, 0.08, WOOD_LIGHT, 0, 0.6, -0.26);
    for (const side of [-0.85, 0.85]) kit.box(0.1, 0.5, 0.5, IRON, side, 0, 0);
  });
}

function washingLine(kit, from, to) {
  const clothes = ['#ff7eb6', '#ffffff', '#7cc4ff', '#ffd23f', '#a5e887', '#ff9f6b', '#ffffff'];
  const count = 7;
  let last = from;
  for (let i = 1; i <= count; i += 1) {
    const share = i / count;
    const point = [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share - Math.sin(share * Math.PI) * 0.5, from[2] + (to[2] - from[2]) * share];
    kit.beam(0.03, '#7c7468', last, point);
    if (i < count) kit.box(0.7, 0.95, 0.04, clothes[i % clothes.length], point[0], point[1] - 0.95, point[2]);
    last = point;
  }
}

function fountain(kit, x, z) {
  kit.post(3.5, 3.7, 0.7, STONE, x, 0, z, 20);
  kit.post(3.15, 3.15, 0.08, '#6fc4e8', x, 0.64, z, 20);
  kit.post(0.5, 0.7, 2, '#e4dac4', x, 0.6, z, 12);
  kit.post(1.6, 0.5, 0.45, STONE, x, 2.5, z, 16);
  kit.post(1.4, 1.4, 0.06, '#6fc4e8', x, 2.92, z, 16);
  kit.post(0.22, 0.34, 1.1, '#e4dac4', x, 2.9, z, 10);
  kit.orb(0.42, 0.42, 0.42, '#ffd23f', x, 4.3, z, 1);
  // Streams of water falling from the top bowl into the bottom one.
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    kit.beam(0.1, '#bfe8fa', [x + cos * 1.5, 2.95, z + sin * 1.5], [x + cos * 1.95, 2.2, z + sin * 1.95]);
    kit.beam(0.1, '#bfe8fa', [x + cos * 1.95, 2.2, z + sin * 1.95], [x + cos * 2.2, 0.7, z + sin * 2.2]);
  }
}

function bollard(kit, x, z) {
  kit.post(0.2, 0.26, 0.7, IRON, x, 0, z, 10);
  kit.post(0.28, 0.28, 0.1, shade(IRON, 1.3), x, 0.7, z, 10);
}

function ropeCoil(kit, x, z) {
  for (let i = 0; i < 3; i += 1) kit.post(0.48 - i * 0.05, 0.48 - i * 0.05, 0.13, '#d9b77e', x, i * 0.13, z, 10);
  kit.post(0.2, 0.2, 0.02, WOOD_DARK, x, 0.4, z, 8);
}

function netPoles(kit, x, z, yaw) {
  kit.at(x, 0, z, yaw, () => {
    for (const side of [-2, 2]) kit.post(0.07, 0.09, 3, WOOD_DARK, side, 0, 0, 6);
    for (let i = 0; i <= 8; i += 1) {
      const across = -2 + i * 0.5;
      kit.beam(0.025, '#6e8fa6', [across, 2.8, 0], [across + 0.1, 1 - Math.sin((i / 8) * Math.PI) * 0.4, 0]);
    }
    for (let i = 0; i < 6; i += 1) {
      const y = 2.8 - i * 0.32;
      kit.beam(0.025, '#6e8fa6', [-2, y, 0], [2, y, 0]);
    }
    for (const [ax, ay, colour] of [[-1.2, 1.7, '#ff7a59'], [0.3, 1.5, '#ffd23f'], [1.3, 2.05, '#ff7a59']]) kit.orb(0.18, 0.18, 0.18, colour, ax, ay, 0, 0);
  });
}

function fence(kit, fromX, fromZ, toX, toZ) {
  const length = Math.hypot(toX - fromX, toZ - fromZ);
  const posts = Math.max(1, Math.round(length / 2.6));
  for (let i = 0; i <= posts; i += 1) {
    const share = i / posts;
    kit.box(0.16, 1.15, 0.16, WOOD_LIGHT, fromX + (toX - fromX) * share, 0, fromZ + (toZ - fromZ) * share);
  }
  for (const y of [0.45, 0.88]) kit.beam(0.08, WOOD, [fromX, y, fromZ], [toX, y, toZ]);
}

function sunflower(kit, x, z, height = 2) {
  kit.post(0.04, 0.05, height, '#4f9f47', x, 0, z, 5);
  kit.box(0.5, 0.03, 0.2, '#4f9f47', x + 0.2, height * 0.5, z, [0, 0, 0.5]);
  kit.at(x, height, z + 0.05, 0, () => {
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2;
      kit.orb(0.14, 0.14, 0.03, '#ffd23f', Math.cos(angle) * 0.24, Math.sin(angle) * 0.24, 0, 0);
    }
    kit.orb(0.17, 0.17, 0.05, '#6b4316', 0, 0, 0.02, 0);
  });
}

function pumpkin(kit, x, z, size = 0.5) {
  kit.orb(size, size * 0.74, size, '#f28a2e', x, size * 0.72, z, 1);
  kit.orb(size * 0.72, size * 0.8, size * 1.04, '#fa9e45', x, size * 0.72, z, 1);
  kit.post(0.05, 0.07, size * 0.4, '#5b8a3c', x, size * 1.3, z, 5);
}

/**
 * What a robot pops up from behind. Each style has a height, in COVER_HEIGHT below, and the top of it
 * is what the robot peeks over.
 */
function coverAt(kit, rand, style, x, z) {
  if (style === 'crates') {
    crate(kit, 1.15, x - 0.5, 0, z, 0.2);
    crate(kit, 1, x + 0.64, 0, z + 0.1, -0.3);
    crate(kit, 0.62, x + 0.6, 1, z + 0.1, 0.15);
  } else if (style === 'barrels') {
    barrel(kit, x - 0.52, 0, z, 1.25, 0.5);
    barrel(kit, x + 0.52, 0, z + 0.1, 1.25, 0.5);
    barrel(kit, x, 0, z - 0.6, 1.25, 0.5);
  } else if (style === 'hay') {
    kit.roller(0.8, 2.4, '#e6c462', x, 0.8, z, 18);
    kit.roller(0.66, 2.44, '#d6ad4c', x, 0.8, z, 18);
    for (let i = 0; i < 3; i += 1) kit.roller(0.82, 0.06, '#b98f35', x - 0.6 + i * 0.6, 0.8, z, 18);
  } else if (style === 'planters') {
    kit.box(2.3, 0.95, 0.95, '#d9855f', x, 0, z);
    kit.box(2.4, 0.12, 1.05, '#e8a07a', x, 0.92, z);
    kit.orb(1, 0.34, 0.42, '#5fb954', x, 1.08, z, 1);
    for (let i = 0; i < 9; i += 1) {
      kit.orb(0.2, 0.2, 0.2, pickFrom(rand, FLOWERS), x - 0.88 + i * 0.22, 1.2 + rand() * 0.1, z + (i % 2) * 0.24 - 0.12, 0);
    }
  } else if (style === 'stall') {
    crate(kit, 1.1, x - 0.56, 0, z, 0.15);
    barrel(kit, x + 0.6, 0, z, 1.15, 0.46);
    fruitCrate(kit, rand, x - 0.56, 1.1, z, pickFrom(rand, FRUIT));
  }
}

export const COVER_HEIGHT = { crates: 1.15, barrels: 1.25, hay: 1.6, planters: 1.3, stall: 1.5, boat: -0.2 };

function ground(group, material, left, right, near, far, repeat) {
  const width = right - left;
  const depth = near - far;
  const geometry = new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (uv.getX(i) * width) / repeat, (uv.getY(i) * depth) / repeat);
  const mesh = new THREE.Mesh(geometry, material);
  // left, right, near and far are on the map: near is the higher number, as the town runs towards -z.
  mesh.position.set((left + right) / 2, 0, (near + far) / 2);
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/* ---------- things that float ---------- */

function boatShape(kit, colour, { sail = false, length = 3.2, trim = '#fff4e0' } = {}) {
  const hull = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).toNonIndexed();
  kit.add(hull, colour, 0, 0.42, 0, { size: [length * 0.34, 0.9, length * 0.62] });
  const disc = new THREE.CylinderGeometry(1, 1, 0.12, 16).toNonIndexed();
  kit.add(disc, trim, 0, 0.44, 0, { size: [length * 0.35, 1, length * 0.63] });
  kit.add(disc, '#6a4a2e', 0, 0.46, 0, { size: [length * 0.28, 1, length * 0.55] });
  kit.box(length * 0.5, 0.08, 0.4, WOOD_LIGHT, 0, 0.5, length * 0.12);
  kit.box(length * 0.5, 0.08, 0.4, WOOD_LIGHT, 0, 0.5, -length * 0.15);
  if (sail) {
    kit.post(0.05, 0.08, length * 1.25, WOOD_DARK, 0, 0.4, 0, 6);
    const canvas = new THREE.Shape();
    canvas.moveTo(0, 0);
    canvas.lineTo(0, length * 1.05);
    canvas.lineTo(length * 0.55, 0.05);
    canvas.closePath();
    const cloth = new THREE.ExtrudeGeometry(canvas, { depth: 0.04, bevelEnabled: false }).rotateY(Math.PI / 2);
    kit.add(cloth, '#fff4e0', 0, 0.68, 0.08);
    const stripe = new THREE.Shape();
    stripe.moveTo(0, 0.3);
    stripe.lineTo(0, 0.72);
    stripe.lineTo(length * 0.33, 0.3);
    stripe.closePath();
    const band = new THREE.ExtrudeGeometry(stripe, { depth: 0.06, bevelEnabled: false }).rotateY(Math.PI / 2);
    kit.add(band, colour, 0.012, 0.68, 0.08);
  }
}

/* ---------- textures ---------- */

function tileTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function cobbles(gap, stones) {
  return tileTexture(512, (ctx, size) => {
    const rand = seeded(77);
    ctx.fillStyle = gap;
    ctx.fillRect(0, 0, size, size);
    const rows = 12;
    const cell = size / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column <= rows; column += 1) {
        const x = column * cell + (row % 2) * cell * 0.5;
        const y = row * cell;
        ctx.fillStyle = pickFrom(rand, stones);
        for (const shift of [0, -size]) {
          ctx.beginPath();
          ctx.roundRect(x + shift - cell * 0.46, y + cell * 0.05, cell * 0.92, cell * 0.9, cell * 0.28);
          ctx.fill();
        }
      }
    }
  });
}

function grassTexture() {
  return tileTexture(256, (ctx, size) => {
    const rand = seeded(11);
    ctx.fillStyle = '#7fcf66';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 400; i += 1) {
      ctx.fillStyle = ['#74c65d', '#8ad670', '#6fbd58', '#94dc78'][i % 4];
      const x = rand() * size;
      const y = rand() * size;
      const [rx, ry, turn] = [3 + rand() * 7, 2 + rand() * 4, rand() * 3];
      for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, rx, ry, turn, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

function waterTexture() {
  return tileTexture(256, (ctx, size) => {
    const rand = seeded(23);
    ctx.fillStyle = '#4fb4e0';
    ctx.fillRect(0, 0, size, size);
    ctx.lineCap = 'round';
    for (let i = 0; i < 90; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const length = 8 + rand() * 22;
      ctx.strokeStyle = i % 3 ? 'rgb(255 255 255 / 0.32)' : 'rgb(30 110 170 / 0.3)';
      ctx.lineWidth = 2 + rand() * 2;
      for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
        ctx.beginPath();
        ctx.moveTo(x + ox - length, y + oy);
        ctx.quadraticCurveTo(x + ox, y + oy - 3, x + ox + length, y + oy);
        ctx.stroke();
      }
    }
  });
}

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#4aa6ec');
  sky.addColorStop(0.45, '#8fd2fa');
  sky.addColorStop(0.62, '#e6f6ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ---------- the town ---------- */

export class Town {
  constructor(scene, puffTexture) {
    this.scene = scene;
    this.time = 0;
    this.route = new Route();
    this.spinners = []; // Things that turn: windmill sails, clock hands, and so on.
    this.bobbers = []; // Things that float.
    this.gulls = [];
    this.flags = [];
    this.balloons = [];
    this.paint = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() });
    this.line = outlineMaterial(INK, 0.022);
    this.waterMap = waterTexture();
    this.places = {};
    this.lod = {};
    this.focus = null;
    this.focusLeaving = null;

    this.buildSky(puffTexture);
    this.buildWater();
    for (const place of PLACES) {
      const { at, yaw } = STOP_SPOTS[place.id];
      const group = new THREE.Group();
      group.name = place.id;
      group.position.set(at[0], 0, at[1]);
      group.rotation.y = yaw;
      scene.add(group);
      this.places[place.id] = group;
      this.lod[place.id] = { group, detail: [] };
    }
    this.buildGround();
    this.buildMarket();
    this.buildCanal();
    this.buildHarbour();
    this.buildFarm();
    this.buildTowerSquare();
    this.buildTrack();
    this.buildFar();
  }

  /**
   * Joins a kit's shapes into one mesh, with an ink line round them if they're close enough to need
   * one. What's marked detail is only drawn near the tram: see focusOn.
   */
  finish(group, kit, { outlined = true, detail = false } = {}) {
    const mesh = kit.build(this.paint);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const lists = this.lod[group.name];
    if (detail && lists) lists.detail.push(mesh);
    if (outlined) {
      const line = new THREE.Mesh(mesh.geometry, this.line);
      group.add(line);
      if (lists) lists.detail.push(line);
    }
    return mesh;
  }

  /**
   * There's a long way to see from each stop, and all of it takes drawing. Small things and ink lines
   * are only drawn at the place the tram is at, the next, and the one it's leaving. Places that have
   * been left behind aren't drawn at all.
   */
  focusOn(index, leaving = null) {
    if (index === this.focus && leaving === this.focusLeaving) return;
    this.focus = index;
    this.focusLeaving = leaving;
    PLACES.forEach(({ id }, at) => {
      const close = at === index || at === index + 1 || at === leaving;
      const { group, detail } = this.lod[id];
      group.visible = at >= index || at === leaving || at === index - 1;
      for (const mesh of detail) mesh.visible = close;
    });
  }

  buildSky(puffTexture) {
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog('#dcf1fb', 70, 420);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b9c7a0', 1.75));
    const sun = new THREE.DirectionalLight('#fff3dc', 2.3);
    sun.position.set(-70, 120, 10);
    sun.target.position.set(0, 0, -75);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const reach = 135;
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 380 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.06;
    this.scene.add(sun, sun.target);
    this.sun = sun;

    const paint = new THREE.SpriteMaterial({ map: puffTexture, color: '#ffffff', opacity: 0.92, transparent: true, depthWrite: false, fog: false });
    const rand = seeded(5);
    this.clouds = Array.from({ length: 26 }, () => {
      const sprite = new THREE.Sprite(paint);
      const size = 26 + rand() * 40;
      sprite.scale.set(size * 1.8, size, 1);
      sprite.position.set(-260 + rand() * 520, 46 + rand() * 60, -300 - rand() * 200);
      this.scene.add(sprite);
      return { sprite, drift: 0.6 + rand() * 0.8 };
    });
  }

  buildWater() {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.waterMap }));
    this.waterMap.repeat.set(190, 190);
    water.position.set(0, WATER_LEVEL, -150);
    this.scene.add(water);
  }

  /** The ground is laid out on the map, not place by place, so that one piece never covers another. */
  buildGround() {
    const stones = ['#d3bf9c', '#cdb892', '#dccbaa', '#c7b28c', '#d8c5a2'];
    const material = (map) => new THREE.MeshToonMaterial({ map, gradientMap: toon() });
    const market = material(cobbles('#b5a07c', stones));
    const quay = material(cobbles('#a2a8b0', ['#c3c8cf', '#b5bbc4', '#ccd1d7', '#adb4bd', '#bec4cc']));
    const lawn = material(grassTexture());
    const paving = material(cobbles('#c7b896', ['#e8dcc4', '#ded0b4', '#efe5d0', '#d8c9ab', '#e4d7bc']));
    const { scene } = this;
    ground(scene, market, -80, 80, 24, -26, 4.2);
    ground(scene, quay, -80, 80, -26, -42, 4.2);
    // Past the canal, the land stops on the left, and the sea comes in.
    const shore = -18;
    ground(scene, quay, shore, 80, -56, -92, 4.2);
    ground(scene, lawn, -90, 110, -92, -128, 7);
    ground(scene, paving, -90, 90, -128, -215, 5);

    // Stone walls where the land stops at the water.
    const kit = new Kit();
    const wall = (width, depth, x, z) => kit.box(width, 1.4, depth, STONE_DARK, x, WATER_LEVEL - 0.3, z);
    wall(160, 0.5, 0, -41.75);
    wall(98, 0.5, shore + 49, -56.25);
    wall(0.5, 36, shore - 0.25, -74);
    wall(72, 0.5, shore - 36, -92.25);
    this.finish(scene, kit, { outlined: false });
  }

  buildMarket() {
    const group = this.places.market;
    const rand = seeded(101);
    const kit = new Kit();
    const near = new Kit();
    const side = Math.PI / 2;

    // Houses down both sides of the square, with a gap for each alley.
    row(kit, rand, { x: -21, z: 16, yaw: side, widths: [10, 9, 8], shops: 0.6 });
    row(kit, rand, { x: -21, z: -15.5, yaw: side, widths: [10.5], shops: 1, floors: [3, 3] });
    row(kit, rand, { x: 21, z: -26, yaw: -side, widths: [10.5], shops: 1, floors: [3, 3] });
    row(kit, rand, { x: 21, z: -10, yaw: -side, widths: [8.5, 9.5, 11], shops: 0.6 });
    // Across the far end, on each side of the street the tram goes down.
    row(kit, rand, { x: -30, z: -25, yaw: 0, widths: [8, 8, 8.5], floors: [4, 4], shops: 0.34, balconies: 1, gables: 1 });
    row(kit, rand, { x: 6.5, z: -25, yaw: 0, widths: [8.5, 8, 8], floors: [4, 4], shops: 0.34, balconies: 1, gables: 1 });
    washingLine(kit, [-20.5, 7.5, -12], [-20.5, 7.5, -16]);
    washingLine(kit, [20.5, 7, -11], [20.5, 7, -15.5]);

    // The market itself.
    const pick = () => pickFrom(rand, AWNINGS);
    stall(near, rand, pick(), -10.6, -9, 0.65);
    stall(near, rand, pick(), 10.8, -8.6, -0.65);
    stall(near, rand, pick(), -13.4, -15.8, 0.85);
    stall(near, rand, pick(), 13.8, -14.8, -0.85);
    stall(near, rand, pick(), -11.5, -21.5, 0.2);
    stall(near, rand, pick(), 14, -21.3, -0.3);
    fountain(near, -6.8, -19.5);
    bench(near, -11, -24, 0.3);
    bench(near, 3.4, -23.6, -0.2);
    lamp(near, -3.6, -23);
    lamp(near, 4, -21);
    lamp(near, -16, -6);
    lamp(near, 16, -5);
    planter(near, rand, -16, -22);
    planter(near, rand, 17, -22);
    planter(near, rand, -5.5, -24);
    planter(near, rand, 5.5, -24);
    roundTree(near, -17.5, -11, 1.25);
    roundTree(near, 17.5, -12.6, 1.3, '#6cc25e');
    cypress(kit, -8, -28);
    cypress(kit, 8, -28);
    bunting(near, [-20.6, 8, -8], [20.6, 8.4, -8], 30, 1.6);
    bunting(near, [-20.6, 8.2, -15], [20.6, 8, -15], 30, 1.8);
    bunting(near, [-13.5, 9.5, -24], [13.5, 9.5, -24], 22, 1.5);
    for (const [x, z, style] of PLACES[0].covers) coverAt(near, rand, style, x, -z);
    this.finish(group, kit, { outlined: false });
    this.finish(group, near, { detail: true });
  }

  buildCanal() {
    const group = this.places.canal;
    const rand = seeded(202);
    const kit = new Kit();
    const near = new Kit();

    // The bridge: arches of stone under a flat deck, with low walls along it.
    const deck = () => {
      const shape = new THREE.Shape();
      shape.moveTo(-8, 0);
      shape.lineTo(8, 0);
      shape.lineTo(8, -2.2);
      shape.lineTo(5.6, -2.2);
      shape.absarc(2.8, -2.2, 2.3, 0, Math.PI, false);
      shape.lineTo(0.5, -2.2);
      shape.lineTo(-0.5, -2.2);
      shape.absarc(-2.8, -2.2, 2.3, 0, Math.PI, false);
      shape.lineTo(-5.6, -2.2);
      shape.lineTo(-8, -2.2);
      shape.closePath();
      return new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false, curveSegments: 10 }).rotateY(Math.PI / 2);
    };
    const span = deck();
    for (const x of [-4.85, 4.35]) near.add(span, STONE, x, 0, -17);
    near.box(9.2, 0.3, 15, '#c3c8cf', 0, -0.29, -17);
    for (const x of [-4.6, 4.6]) {
      near.box(0.42, 1, 15, STONE, x, 0, -17);
      near.box(0.56, 0.12, 15.1, '#e4dac4', x, 1, -17);
      for (const z of [-10, -13.5, -17, -20.5, -24]) {
        near.box(0.7, 1.35, 0.7, '#e4dac4', x, 0, z);
        near.post(0.2, 0.2, 0.08, IRON, x, 1.35, z, 8);
        near.orb(0.24, 0.32, 0.24, '#fff0b3', x, 1.72, z, 1);
      }
    }
    bunting(near, [-4.6, 3.6, -10], [-4.6, 3.6, -24], 14, 0.6);
    bunting(near, [4.6, 3.6, -10], [4.6, 3.6, -24], 14, 0.6);
    for (const x of [-4.6, 4.6]) for (const z of [-10, -24]) near.post(0.05, 0.07, 3.7, IRON, x, 0, z, 6);

    // The far side: houses right down to the water, with the street between them.
    row(kit, rand, { x: -17.5, z: -25.2, yaw: 0, widths: [6.5, 6], floors: [3, 4], shops: 0.25, balconies: 1 });
    row(kit, rand, { x: 7.5, z: -25.2, yaw: 0, widths: [8.5, 9, 8, 10, 9], floors: [3, 4], shops: 0.25, balconies: 1 });

    // This side: what you'd find along a towpath.
    for (const x of [-20, -14.5, -9, 9, 14.5, 20]) bollard(near, x, -9.4);
    ropeCoil(near, -11.5, -8.6);
    ropeCoil(near, 12.5, -8.4);
    lamp(near, -7.4, -8.5);
    lamp(near, 7.4, -8.5);
    bench(near, 17, -7, 3.14);
    netPoles(near, -17, -5.8, 0.2);
    for (const [x, z, style] of PLACES[1].covers) coverAt(near, rand, style, x, -z);
    this.finish(group, kit, { outlined: false });
    this.finish(group, near, { detail: true });

    // Boats on the canal, each moving by itself.
    const boats = [
      { x: 7, z: -14.6, colour: '#3f86d9', yaw: 0.1, length: 4.2 },
      { x: -13.4, z: -13, colour: '#e8574c', yaw: 1.2, sail: true, length: 3.6 },
      { x: 12.5, z: -20, colour: '#f0b429', yaw: -1, length: 3.4 },
      { x: -11.5, z: -21, colour: '#35a88a', yaw: 0.5, length: 3.2 },
      { x: 18, z: -12.5, colour: '#b45fd0', yaw: 1.4, sail: true, length: 3.8 },
      { x: -21, z: -19, colour: '#ff9f6b', yaw: -0.6, length: 3.4 },
      { x: 25, z: -17, colour: '#3fb4a8', yaw: 0.4, length: 3.2 },
    ];
    for (const boat of boats) this.addBoat(group, boat);
    this.addGull(group, [0, 13, -18], 16, 0.42);
    this.addGull(group, [-8, 16, -26], 22, -0.33);
  }

  addBoat(group, { x, z, colour, yaw = 0, sail = false, length = 3.2, trim }) {
    const kit = new Kit();
    boatShape(kit, colour, { sail, length, trim });
    const mesh = this.finish(new THREE.Group(), kit);
    const holder = new THREE.Group();
    holder.position.set(x, WATER_LEVEL, z);
    holder.rotation.y = yaw;
    const outline = new THREE.Mesh(mesh.geometry, this.line);
    mesh.castShadow = false;
    holder.add(mesh, outline);
    group.add(holder);
    this.bobbers.push({ node: holder, y: WATER_LEVEL, phase: x * 1.7 + z, rate: 0.9 + (Math.abs(x) % 1) * 0.4, size: 0.07 });
    return holder;
  }

  addGull(group, centre, radius, rate) {
    const kit = new Kit();
    for (const side of [-1, 1]) {
      const wing = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0.2), new THREE.Vector3(side * 1.3, 0.35, 0), new THREE.Vector3(0, 0, -0.2),
      ]);
      wing.computeVertexNormals();
      kit.add(wing, '#ffffff');
    }
    const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon(), side: THREE.DoubleSide });
    const mesh = kit.build(material);
    group.add(mesh);
    this.gulls.push({ node: mesh, centre, radius, rate, phase: radius });
  }

  buildHarbour() {
    const group = this.places.harbour;
    const rand = seeded(303);
    const kit = new Kit();
    const near = new Kit();
    const side = Math.PI / 2;

    // Big sheds along the right of the quay, with wide doors for robots to come out of.
    const shed = (z, w, colour, roof) => {
      kit.at(15, 0, z, -side, () => {
        kit.box(w, 6, 12, colour, 0, 0, -6);
        kit.add(gableRoof(w + 0.8, 3, 12.8), roof, 0, 6, 0.4);
        roofTiles(kit, w + 0.8, 3, 12.8, 6.03, roof, 0.4);
        kit.box(w * 0.55, 4.4, 0.1, shade(colour, 0.72), 0, 0, 0.05);
        for (let i = 1; i < 5; i += 1) kit.box(w * 0.55, 0.06, 0.13, shade(colour, 0.55), 0, i * 0.88, 0.05);
        kit.box(w * 0.7, 0.8, 0.1, CREAM, 0, 4.7, 0.05);
        for (let i = 0; i < 5; i += 1) kit.orb(0.22, 0.22, 0.04, FLAGS[i], -w * 0.25 + (i * w) / 8, 5.1, 0.12, 0);
      });
    };
    shed(-8, 13, '#e89a6b', '#8a4a3a');
    shed(-21.5, 12, '#8fb7cf', '#5a6a7a');

    // A crane on the quay, with a hook over the water.
    near.at(-7, 0, -22, 0, () => {
      near.box(2.6, 0.5, 2.6, STONE, 0, 0, 0);
      near.post(0.3, 0.42, 8.6, '#d9583f', 0, 0.5, 0, 10);
      near.box(1.3, 1.5, 1.3, '#e8c94f', 0, 8.2, 0);
      near.beam(0.26, '#d9583f', [-0.4, 9.2, 0], [5.6, 7, 0]);
      near.beam(0.26, '#d9583f', [-0.4, 9.2, 0], [-2.4, 7.8, 0]);
      near.box(0.9, 0.9, 0.9, IRON, -2.5, 7, 0);
    });
    netPoles(near, 9.8, -5.5, -0.9);
    for (const [x, z] of [[-11.5, -6], [-11, -13], [-7.6, -28]]) bollard(near, x, z);
    ropeCoil(near, -8.5, -11);
    ropeCoil(near, -6.2, -24.5);
    lamp(near, 11.6, -13.5);
    lamp(near, 10, -28);
    lamp(near, -6, -33);
    crate(near, 1.2, 12, 0, -26);
    crate(near, 1.2, 12.9, 0, -24.8, 0.5);
    barrel(near, 11.5, 0, -22.2);
    barrel(near, 12.7, 0, -21);
    // A fishmonger's table.
    near.at(-3, 0, -29.5, 0, () => {
      near.box(3.4, 0.9, 1.2, '#7fb0c9', 0, 0, 0);
      near.box(3.5, 0.1, 1.3, CREAM, 0, 0.9, 0);
      for (let i = 0; i < 7; i += 1) {
        near.orb(0.28, 0.1, 0.1, ['#a9c9dc', '#ffb07c', '#d7e4ea'][i % 3], -1.4 + i * 0.46, 1.06, -0.2 + (i % 2) * 0.32, 0);
      }
    });
    for (const [x, z, style] of PLACES[2].covers) coverAt(near, rand, style, x, -z);
    this.finish(group, kit, { outlined: false });
    this.finish(group, near, { detail: true });

    // The lighthouse from that other game, out at sea, and the boats.
    const far = new Kit();
    far.at(-62, 0, -70, 0, () => {
      far.orb(14, 5, 12, '#7c8088', 0, WATER_LEVEL, 0, 1);
      far.post(2.1, 3, 17, '#f4f1e8', 0, 2, 0, 16);
      far.post(2.5, 2.8, 3, '#e8433f', 0, 8, 0, 16);
      far.post(2.05, 2.25, 3, '#e8433f', 0, 14, 0, 16);
      far.post(2.5, 2.5, 0.4, IRON, 0, 19, 0, 16);
      far.post(1.5, 1.5, 2.4, '#ffd23f', 0, 19.4, 0, 12);
      far.cone(2, 2, '#e8433f', 0, 21.8, 0, 12);
    });
    this.finish(group, far, { outlined: false });
    const boats = [
      { x: -17, z: -12, colour: '#3f86d9', yaw: 0.3, sail: true, length: 6 },
      { x: -24, z: -24, colour: '#e8574c', yaw: 1.1, sail: true, length: 7 },
      { x: -16, z: -32, colour: '#f0b429', yaw: -0.5, length: 5 },
      { x: -36, z: -16, colour: '#35a88a', yaw: 2, sail: true, length: 8 },
      { x: -48, z: -40, colour: '#ff9f6b', yaw: 0.7, sail: true, length: 9 },
      { x: -30, z: -48, colour: '#b45fd0', yaw: -1, sail: true, length: 7 },
    ];
    for (const boat of boats) this.addBoat(group, boat);
    this.addGull(group, [-18, 12, -20], 18, 0.38);
    this.addGull(group, [-30, 16, -36], 24, -0.27);
    this.addGull(group, [-8, 18, -30], 14, 0.46);
  }

  buildFarm() {
    const group = this.places.farm;
    const rand = seeded(404);
    const kit = new Kit();
    const near = new Kit();

    // The red barn on the left.
    kit.at(-17, 0, -12, 0.5, () => {
      kit.box(13, 6.2, 10, '#c9463a', 0, 0, -5);
      kit.add(gableRoof(14, 4.4, 11), '#6a4a3a', 0, 6.2, 0.5);
      kit.box(4.4, 4.2, 0.1, '#a63a30', 0, 0, 0.05);
      for (const [a, b] of [[[-2.2, 0, 0.12], [2.2, 4.2, 0.12]], [[2.2, 0, 0.12], [-2.2, 4.2, 0.12]]]) kit.beam(0.14, CREAM, a, b);
      kit.box(4.6, 0.14, 0.16, CREAM, 0, 4.2, 0.08);
      kit.box(1.8, 1.4, 0.1, '#7a2a24', 0, 7, 0.08);
      kit.box(2, 0.12, 0.14, CREAM, 0, 8.4, 0.1);
    });
    // A silo beside it.
    kit.post(2.3, 2.3, 10, '#d7dee3', -27, 0, -12, 16);
    kit.orb(2.34, 1.5, 2.34, '#e0572f', -27, 10, -12, 1);
    for (let i = 1; i < 5; i += 1) kit.post(2.36, 2.36, 0.09, '#a9b4bb', -27, i * 2, -12, 16);

    // Fruit trees in rows on both sides.
    for (const [x, z] of [[-13, -4], [-19, -3], [-25, -4], [-31, -6], [-8.6, -19.5], [-13.5, -20.5], [-20, -21]]) {
      fruitTree(near, rand, x, z, z < -10 ? '#ff9f2e' : '#e8433f', 1.05 + rand() * 0.25);
    }
    for (let column = 0; column < 3; column += 1) {
      for (let line = 0; line < 3; line += 1) {
        fruitTree(near, rand, 16 + column * 5.4 + (line % 2), -3 - line * 5.6, column % 2 ? '#ffd23f' : '#e8433f', 1 + rand() * 0.3);
      }
    }
    fence(near, -10.5, 3, -10.5, -22);
    fence(near, 11, 3, 11, -22);

    // Sunflowers and pumpkins along the way.
    for (let i = 0; i < 18; i += 1) sunflower(near, -9.5 + (i % 2) * 0.6, -4 - i * 1.15, 1.8 + rand() * 0.8);
    for (let i = 0; i < 9; i += 1) sunflower(near, 9.6 + (i % 2) * 0.6, -3 - i * 1.3, 1.8 + rand() * 0.8);
    for (let i = 0; i < 12; i += 1) pumpkin(near, 3.4 + rand() * 6.4, -18 - rand() * 3.4, 0.42 + rand() * 0.3);

    // The windmill, up on the right, which can be seen from a long way off.
    kit.at(15, 0, -19, -0.3, () => {
      kit.post(3, 4.4, 11, '#f5ecd9', 0, 0, 0, 14);
      kit.post(4.6, 4.8, 0.7, STONE, 0, 0, 0, 14);
      kit.post(3.2, 3.2, 0.3, WOOD, 0, 5.4, 0, 14);
      kit.add(new THREE.SphereGeometry(3.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed(), '#c9583f', 0, 11, 0, { size: [1, 0.8, 1] });
      kit.box(1.6, 2.8, 0.2, WOOD_DARK, 0, 0, 4.15);
      kit.box(1, 1.3, 0.2, GLASS, 0, 6.6, 3.2);
      kit.box(0.9, 1.2, 0.2, GLASS, 1.8, 3.2, 3.3);
    });
    const sails = new THREE.Group();
    const sailKit = new Kit();
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2;
      sailKit.at(0, 0, 0, 0, () => {
        const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
        sailKit.beam(0.24, WOOD_DARK, [0, 0, 0], [cos * 9, sin * 9, 0]);
        // A lattice with cloth on it.
        const across = [-sin * 1.5, cos * 1.5];
        for (let step = 0; step < 7; step += 1) {
          const along = 2.2 + step * 1.1;
          sailKit.beam(0.08, CREAM, [cos * along, sin * along, 0], [cos * along + across[0], sin * along + across[1], 0]);
        }
        sailKit.add(UNIT_BOX, '#fff4e0', cos * 5.5 + across[0] * 0.5, sin * 5.5 + across[1] * 0.5, -0.05, { size: [7, 1.5, 0.04], turn: [0, 0, angle] });
      });
    }
    const sailMesh = sailKit.build(this.paint);
    sails.add(sailMesh, new THREE.Mesh(sailMesh.geometry, this.line));
    const hub = new THREE.Group();
    hub.position.set(15 + Math.sin(-0.3) * 4.4, 10.4, -19 + Math.cos(-0.3) * 4.4);
    hub.rotation.y = -0.3;
    hub.add(sails);
    group.add(hub);
    this.spinners.push({ node: sails, rate: -0.5 });

    for (const [x, z, style] of PLACES[3].covers) coverAt(near, rand, style, x, -z);
    this.finish(group, kit, { outlined: false });
    this.finish(group, near, { detail: true });
  }

  buildTowerSquare() {
    const group = this.places.tower;
    const rand = seeded(505);
    const kit = new Kit();
    const near = new Kit();
    const side = Math.PI / 2;

    // A gate in the old town wall, which the tram goes through to get here.
    kit.at(0, 0, 18, 0, () => {
      const gate = new THREE.Shape();
      gate.moveTo(-16, 0);
      gate.lineTo(-4.4, 0);
      gate.lineTo(-4.4, 5.6);
      gate.absarc(0, 5.6, 4.4, Math.PI, 0, true);
      gate.lineTo(4.4, 0);
      gate.lineTo(16, 0);
      gate.lineTo(16, 12);
      gate.lineTo(-16, 12);
      gate.closePath();
      kit.add(new THREE.ExtrudeGeometry(gate, { depth: 2.4, bevelEnabled: false, curveSegments: 14 }), '#d8c9ab', 0, 0, -1.2);
      for (let i = 0; i < 11; i += 1) kit.box(1.5, 1.1, 2.6, '#e4d7bc', -15 + i * 3, 12, 0);
      for (const x of [-16.5, 16.5]) {
        kit.post(3, 3.4, 16, '#d8c9ab', x, 0, 0, 12);
        kit.cone(3.6, 4.6, '#d9583f', x, 16, 0, 12);
        // The old wall, going away over the fields on each side.
        kit.box(90, 9, 2, '#d8c9ab', x + Math.sign(x) * 47, 0, 0);
      }
      kit.box(2.2, 3, 0.1, FLAGS[0], -7, 7, 1.26);
      kit.box(2.2, 3, 0.1, FLAGS[2], 7, 7, 1.26);
    });

    // Fine old houses round the square, with the big one standing in front of them.
    row(kit, rand, { x: -27, z: 14, yaw: side, widths: [10, 9, 9, 10, 11], floors: [4, 4], shops: 0.6, balconies: 0.8 });
    row(kit, rand, { x: 27, z: -35, yaw: -side, widths: [11, 10, 9, 9, 10], floors: [4, 4], shops: 0.6, balconies: 0.8 });
    row(kit, rand, { x: -40, z: -34, yaw: 0, widths: [10, 10, 10, 11, 10], floors: [4, 5], balconies: 0.6, gables: 1 });
    row(kit, rand, { x: 21, z: -34, yaw: 0, widths: [11, 10], floors: [4, 5], balconies: 0.6, gables: 1 });

    // The clock tower, as tall as can be, off to one side so that it can be seen past the big one.
    const TOWER_X = 16;
    const TOWER_Z = -40;
    kit.at(TOWER_X, 0, TOWER_Z, 0, () => {
      kit.box(11, 1, 11, '#c9bda6', 0, 0, 0);
      kit.box(8.6, 26, 8.6, '#e8dcc4', 0, 1, 0);
      for (let band = 1; band < 5; band += 1) kit.box(9, 0.36, 9, '#cdbf9f', 0, band * 5.2, 0);
      for (const [x, z] of [[-4.3, 4.3], [4.3, 4.3], [-4.3, -4.3], [4.3, -4.3]]) kit.box(0.9, 27, 0.9, '#d8c9ab', x, 0.5, z);
      // Arched windows up the front.
      for (const y of [6.5, 11.7, 16.9]) {
        kit.box(1.8, 3, 0.14, '#3f6b8f', 0, y, 4.32);
        kit.post(0.9, 0.9, 0.14, '#3f6b8f', 0, y + 3, 4.32, 12);
        kit.box(2.1, 0.14, 0.3, CREAM, 0, y - 0.1, 4.38);
      }
      kit.box(2.6, 4, 0.3, WOOD_DARK, 0, 1, 4.32);
      // The roof, and the face of the clock.
      kit.box(10, 0.5, 10, '#cdbf9f', 0, 27, 0);
      kit.add(new THREE.CylinderGeometry(3.7, 3.7, 0.3, 28).rotateX(Math.PI / 2).toNonIndexed(), '#2a4a6a', 0, 22.4, 4.42);
      kit.at(0, 22.4, 4.6, 0, () => {
        kit.add(new THREE.CylinderGeometry(3.3, 3.3, 0.12, 32).rotateX(Math.PI / 2).toNonIndexed(), '#fff7e6', 0, 0, 0);
        for (let hour = 0; hour < 12; hour += 1) {
          const angle = (hour / 12) * Math.PI * 2;
          kit.box(0.26, 0.56, 0.08, '#2a4a6a', Math.sin(angle) * 2.8, Math.cos(angle) * 2.8 - 0.28, 0.08, [0, 0, -angle]);
        }
      });
      kit.add(new THREE.ConeGeometry(7.2, 8, 4).rotateY(Math.PI / 4).toNonIndexed(), '#d9583f', 0, 31.5, 0);
      kit.post(0.08, 0.1, 4.5, IRON, 0, 35.5, 0, 6);
    });
    const clock = new THREE.Group();
    clock.position.set(TOWER_X, 22.4, TOWER_Z + 4.8);
    group.add(clock);
    const hand = (length, width, rate) => {
      const handKit = new Kit();
      handKit.box(width, length, 0.1, '#2a4a6a', 0, -0.3, 0);
      handKit.orb(0.3, 0.3, 0.1, '#2a4a6a', 0, 0, 0, 1);
      const mesh = handKit.build(this.paint);
      clock.add(mesh);
      this.spinners.push({ node: mesh, rate });
      return mesh;
    };
    hand(2.9, 0.26, -0.42);
    hand(2, 0.34, -0.035).rotation.z = -1.4;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(3, 1.7, 0.04), new THREE.MeshToonMaterial({ color: '#ffd23f', gradientMap: toon() }));
    flag.geometry.translate(1.5, 0, 0);
    flag.position.set(TOWER_X, 39.2, TOWER_Z);
    group.add(flag);
    this.flags.push({ node: flag, phase: 0 });

    // The square: planters, lamps, flags and a wide circle of paving.
    for (const [x, z, style] of PLACES[4].covers) coverAt(near, rand, style, x, -z);
    for (const x of [-20, -14, 14, 20]) {
      lamp(near, x, -14);
      lamp(near, x, -28);
    }
    for (const [x, z] of [[-22, -5], [22, -5], [-22, -33], [22, -33]]) roundTree(near, x, z, 1.25, '#5db152');
    for (const x of [-16, -10, -4, 2]) cypress(near, x, -31, 1.1);
    bunting(near, [-26.5, 11, -7], [26.5, 11, -7], 34, 2);
    bunting(near, [-26.5, 11.5, -20], [26.5, 11.5, -20], 34, 2.4);
    for (const [x, z, colour] of [[-15, -2, FLAGS[0]], [15, -2, FLAGS[2]], [-18, -22, FLAGS[3]], [18, -22, FLAGS[4]]]) {
      near.post(0.07, 0.1, 8, IRON, x, 0, z, 6);
      near.box(2, 1.2, 0.05, colour, x + 1, 6.7, z);
    }
    this.finish(group, kit, { outlined: false });
    this.finish(group, near, { detail: true });
  }

  /** How many triangles each place takes to draw, for checking on how much there is. */
  get triangles() {
    const count = {};
    for (const [id, group] of Object.entries(this.places)) {
      let triangles = 0;
      group.traverse((node) => {
        if (node.geometry?.attributes.position) triangles += node.geometry.attributes.position.count / 3;
      });
      count[id] = Math.round(triangles);
    }
    return count;
  }

  /** The rails, on a bed of darker stones, the whole way along. */
  buildTrack() {
    const kit = new Kit();
    const points = [];
    for (const leg of this.route.legs) {
      const count = Math.ceil(leg.getLength() / 1.1);
      for (let i = 0; i < count; i += 1) points.push(leg.getPointAt(i / count));
    }
    points.push(this.route.legs.at(-1).getPointAt(1));
    // On past the last stop, and back behind the first, as a tram line wouldn't start from nowhere.
    const before = [new THREE.Vector3(0, 0, 14), new THREE.Vector3(0, 0, 7)];
    const after = [new THREE.Vector3(-2, 0, -156), new THREE.Vector3(-2, 0, -170)];
    const line = [...before, ...points, ...after];
    const bedColour = (point) => (point.z < -92 && point.z > -128 ? '#cfa86e' : '#a69680');
    for (let i = 0; i < line.length - 1; i += 1) kit.strip([line[i], line[i + 1]], 2.6, bedColour(line[i]), 0.018);
    for (let i = 0; i < line.length - 1; i += 1) {
      const [a, b] = [line[i], line[i + 1]];
      const way = b.clone().sub(a).normalize();
      for (const lateral of [-0.78, 0.78]) {
        const [sideX, sideZ] = [-way.z * lateral, way.x * lateral];
        kit.beam(0.11, '#6d747c', [a.x + sideX, 0.05, a.z + sideZ], [b.x + sideX, 0.05, b.z + sideZ]);
        kit.beam(0.05, '#d7dde2', [a.x + sideX, 0.1, a.z + sideZ], [b.x + sideX, 0.1, b.z + sideZ]);
      }
    }
    const mesh = kit.build(this.paint);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  /** Hills and a far-off town on the map, past everything else. */
  buildFar() {
    const kit = new Kit();
    const rand = seeded(606);
    for (let i = 0; i < 22; i += 1) {
      const x = -420 + i * 40 + rand() * 20;
      const size = 44 + rand() * 66;
      kit.orb(size * 1.25, size * 0.62, size * 0.8, ['#8fd39b', '#7fcb8f', '#9bdaa6', '#86c9a5'][i % 4], x, -6, -360 - rand() * 60, 1);
    }
    for (let i = 0; i < 9; i += 1) {
      const x = 90 + rand() * 80;
      const z = -40 - i * 30;
      const size = 26 + rand() * 30;
      kit.orb(size, size * 0.62, size, ['#8fd39b', '#9bdaa6', '#7fcb8f'][i % 3], x, -4, z, 1);
    }
    // A little hill-town on the right.
    for (let i = 0; i < 26; i += 1) {
      const x = 62 + rand() * 34;
      const z = -10 - rand() * 170;
      const high = 4 + rand() * 6;
      kit.box(5, high, 5, pickFrom(rand, WALLS), x, 0, z);
      kit.add(new THREE.ConeGeometry(3.9, 3, 4).rotateY(Math.PI / 4).toNonIndexed(), pickFrom(rand, ROOFS), x, high + 1.5, z);
    }
    const mesh = kit.build(this.paint);
    this.scene.add(mesh);
    this.addBalloon(-58, 34, -96, ['#ff5a4f', '#ffd23f'], 1.1);
    this.addBalloon(44, 42, -130, ['#3b82f6', '#fff4e0'], 1.4);
    this.addBalloon(-20, 50, -210, ['#a855f7', '#ffd23f'], 1.7);
  }

  /** A hot-air balloon, high up and a long way off, in stripes. It's only there to be looked at. */
  addBalloon(x, y, z, [one, two], size) {
    const kit = new Kit();
    const stripes = 8;
    for (let i = 0; i < stripes; i += 1) {
      const gore = new THREE.SphereGeometry(4 * size, 6, 10, (i / stripes) * Math.PI * 2, (Math.PI * 2) / stripes, 0, Math.PI * 0.72).toNonIndexed();
      kit.add(gore, i % 2 ? one : two);
    }
    kit.post(0.6 * size, 1.5 * size, 1.6 * size, shade(one, 0.8), 0, -4.4 * size, 0, 10);
    kit.box(1.5 * size, 1.1 * size, 1.5 * size, WOOD, 0, -6.2 * size, 0);
    const mesh = kit.build(this.paint);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.balloons.push({ node: mesh, x, y, phase: x });
  }

  /** Water, boats, gulls, sails and clouds, once a frame. */
  update(dt, calm = false) {
    this.time += dt;
    const { time } = this;
    const flow = calm ? 0.4 : 1;
    this.waterMap.offset.set((time * 0.004 * flow) % 1, (time * 0.007 * flow) % 1);
    for (const { node, rate, axis = 'z' } of this.spinners) node.rotation[axis] += rate * dt * flow;
    for (const bobber of this.bobbers) {
      const wave = time * bobber.rate * flow + bobber.phase;
      bobber.node.position.y = bobber.y + Math.sin(wave) * bobber.size;
      bobber.node.rotation.z = Math.sin(wave * 0.8) * 0.03;
      bobber.node.rotation.x = Math.cos(wave * 0.6) * 0.022;
    }
    for (const gull of this.gulls) {
      const turn = time * gull.rate * flow + gull.phase;
      gull.node.position.set(gull.centre[0] + Math.cos(turn) * gull.radius, gull.centre[1] + Math.sin(turn * 2) * 0.8, gull.centre[2] + Math.sin(turn) * gull.radius);
      gull.node.rotation.set(0, -turn - (gull.rate > 0 ? 0 : Math.PI), Math.sin(time * 2.1 + gull.phase) * 0.22 * flow);
    }
    for (const flag of this.flags) flag.node.rotation.y = Math.sin(time * 1.4 + flag.phase) * 0.24 * flow;
    for (const balloon of this.balloons) {
      balloon.node.position.y = balloon.y + Math.sin(time * 0.3 * flow + balloon.phase) * 1.4;
      balloon.node.position.x = balloon.x + Math.sin(time * 0.07 * flow + balloon.phase) * 7;
    }
    for (const cloud of this.clouds) {
      cloud.sprite.position.x += cloud.drift * dt * flow;
      if (cloud.sprite.position.x > 300) cloud.sprite.position.x = -300;
    }
  }
}
