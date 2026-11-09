// Where everything is in Giraffe's valley. The rules need it to know where a tank can drive, and the picture
// builds the valley from it, so there's no screen in this file and it runs in the unit tests. Units are
// the same everywhere, with x to the right, z towards the camera and y up. It's a toy world, so a tank
// is about as long as a cottage.
import { NavGrid } from './nav.js';

// Where a tank can go, and where the hand can point.
export const PLAY = { left: -46, right: 46, far: -28, near: 28 };
// A little more than that, for the road down from the fort.
const NAV_BOUNDS = { left: -52, right: 52, far: -42, near: 32, cell: 1.5 };
export const TANK_RADIUS = 3.1;
export const START = { x: 3, z: 20 };
// Where the robot tanks roll in from: the fort's gate, and two lanes from behind the far woods.
export const SPAWNS = [{ x: 6, z: -31.5 }, { x: -28, z: -36 }, { x: 33, z: -36 }];

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const smooth = (from, to, value) => {
  const share = clamp((value - from) / (to - from), 0, 1);
  return share * share * (3 - 2 * share);
};

/** A random number that's the same every time for the same seed, so the valley never changes. */
export function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function hash(x, y) {
  let mixed = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  mixed = Math.imul(mixed ^ (mixed >>> 13), 1274126177);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, y) {
  const fromX = Math.floor(x);
  const fromY = Math.floor(y);
  const shareX = smooth(0, 1, x - fromX);
  const shareY = smooth(0, 1, y - fromY);
  const top = hash(fromX, fromY) + (hash(fromX + 1, fromY) - hash(fromX, fromY)) * shareX;
  const bottom = hash(fromX, fromY + 1) + (hash(fromX + 1, fromY + 1) - hash(fromX, fromY + 1)) * shareX;
  return top + (bottom - top) * shareY;
}

/** Smooth bumps at a few sizes, from 0 to 1. */
export function bumps(x, y) {
  return valueNoise(x, y) * 0.58 + valueNoise(x * 2.1 + 9, y * 2.1 + 4) * 0.29 + valueNoise(x * 4.3 + 3, y * 4.3 + 8) * 0.13;
}

/** A smooth line through some points. */
export function smoothLine(points, perLeg = 10) {
  const out = [];
  const at = (index) => points[clamp(index, 0, points.length - 1)];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let step = 0; step < perLeg; step += 1) {
      const t = step / perLeg;
      const curve = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
      out.push([curve(a[0], b[0], c[0], d[0]), curve(a[1], b[1], c[1], d[1])]);
    }
  }
  out.push(points.at(-1));
  return out;
}

function distanceToLine(line, x, z) {
  let nearest = Infinity;
  for (let i = 0; i < line.length - 1; i += 1) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const along = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const ox = x - ax - dx * along;
    const oz = z - az - dz * along;
    nearest = Math.min(nearest, ox * ox + oz * oz);
  }
  return Math.sqrt(nearest);
}

/* ---------- the river and its bridges ---------- */

export const RIVER = smoothLine([[-150, -32], [-96, -24], [-62, -12], [-44, -6.5], [-29, -10], [-12, -6], [6, -9], [23, -5], [41, -9.5], [62, -5], [96, -14], [150, -22]], 8);
export const RIVER_WIDTH = 8;
const RIVER_MARGIN = 1.1; // How near the water's edge the middle of a tank can get.

// Each goes across the river along its own line, with `turn` being how far that is from straight up the
// valley, and rises in the middle by `rise`.
export const BRIDGES = [
  { id: 'wooden', kind: 'wood', x: -29, z: -10, turn: 0.1, length: 16.5, width: 8.2, rise: 0.7 },
  { id: 'main', kind: 'stone', x: 6, z: -9, turn: -0.08, length: 17, width: 8.8, rise: 1.5 },
  { id: 'east', kind: 'stone', x: 33, z: -7, turn: 0.22, length: 16.5, width: 8.6, rise: 1.3 },
];

function acrossBridge({ x, z, turn }, px, pz) {
  const dx = px - x;
  const dz = pz - z;
  const sin = Math.sin(turn);
  const cos = Math.cos(turn);
  return { along: dx * sin - dz * cos, side: dx * cos + dz * sin };
}

/** How much a bridge lifts a tank at this place. */
export function bridgeRise(x, z) {
  for (const bridge of BRIDGES) {
    const { along, side } = acrossBridge(bridge, x, z);
    if (Math.abs(along) <= bridge.length / 2 && Math.abs(side) <= bridge.width / 2) {
      return bridge.rise * Math.cos((along / (bridge.length / 2)) * (Math.PI / 2)) ** 2;
    }
  }
  return 0;
}

function onABridge(x, z) {
  return BRIDGES.some((bridge) => {
    const { along, side } = acrossBridge(bridge, x, z);
    return Math.abs(along) <= bridge.length / 2 && Math.abs(side) <= bridge.width / 2 - 2.2;
  });
}

/* ---------- the land ---------- */

const FORT = { x: 6, z: -39 };

/** How high the land is. The valley floor is nearly flat, with hills all round it and the fort on one. */
export function heightAt(x, z) {
  const gentle = (bumps(x / 16 + 7, z / 16 + 3) - 0.5) * 1.1;
  const sides = smooth(48, 92, Math.abs(x)) * (11 + 22 * bumps(x / 26 + 2, z / 26 + 6));
  const farHills = smooth(-40, -100, z) * (9 + 26 * bumps(x / 30 + 11, z / 30));
  const nearSide = smooth(31, 60, z) * -2;
  // The hill the fort's on is flat on top, and the road comes down it.
  const fromFort = Math.hypot((x - FORT.x) / 24, (z - FORT.z) / 7.5);
  const hill = 3.2 * smooth(1.75, 1, fromFort);
  return gentle * (1 - smooth(1.5, 1, fromFort)) + sides + farHills + nearSide + hill;
}

export function groundY(x, z) {
  return heightAt(x, z) + bridgeRise(x, z);
}

export const FORT_AT = { x: FORT.x, z: FORT.z, y: heightAt(FORT.x, FORT.z) };

/* ---------- roads ---------- */

export const ROADS = [
  // The main road, from the fort's gate over the main bridge and down past where the child starts.
  { width: 7, line: smoothLine([[6, -33], [5.4, -27], [4, -21], [6, -9], [3, 2], [2, 14], [4, 26], [3, 44], [6, 70], [2, 112]]) },
  { width: 6, line: smoothLine([[-34, -130], [-30, -60], [-28, -36], [-27, -21], [-29, -10], [-24, 1], [-22.4, 12], [-23.5, 18]]) },
  { width: 6, line: smoothLine([[42, -130], [36, -60], [33, -36], [32, -19], [33, -7], [29, 2]]) },
  { width: 6, line: smoothLine([[-90, 12], [-46, 2], [-24, 1], [-6, 3], [3, 2], [29, 2], [46, 4], [92, 0]]) },
  { width: 5, line: smoothLine([[-92, -30], [-46, -24], [-27, -21], [4, -21], [32, -19], [50, -24], [94, -30]]) },
];

/* ---------- what's in the way ---------- */

// w and d are how much ground each one takes up. The rest of each kind's shape is in valley.js.
export const BUILDINGS = [
  { kind: 'church', x: -40, z: 12, w: 9, d: 16, yaw: 0 },
  { kind: 'cottage', x: -30.6, z: 10.5, w: 7, d: 6, yaw: 0, paint: 0 },
  { kind: 'cottage', x: -13.8, z: 10.5, w: 7, d: 6, yaw: 0, paint: 2 },
  { kind: 'tall', x: -6.8, z: 11, w: 6, d: 6, yaw: 0, paint: 3 },
  { kind: 'long', x: -37.6, z: 26.5, w: 10, d: 6, yaw: Math.PI, paint: 4 },
  { kind: 'cottage', x: -28.2, z: 26.5, w: 7, d: 6, yaw: Math.PI, paint: 1 },
  { kind: 'tall', x: -20.8, z: 26.5, w: 6, d: 6, yaw: Math.PI, paint: 5 },
  { kind: 'long', x: -11, z: 26.5, w: 10, d: 6, yaw: Math.PI, paint: 0 },
  { kind: 'barn', x: 20, z: 11.5, w: 11, d: 7, yaw: 0 },
  { kind: 'mill', x: 20.5, z: -12.6, w: 7, d: 5.4, yaw: 0, paint: 2 },
];

// More of the village's neighbours, up in the woods beyond the valley, where nothing drives.
export const FAR_HOUSES = [
  { kind: 'cottage', x: -33, z: -35, w: 7, d: 6, yaw: 0.2, paint: 1 },
  { kind: 'tall', x: -41, z: -33, w: 6, d: 6, yaw: -0.2, paint: 3 },
  { kind: 'cottage', x: -48, z: -36, w: 7, d: 6, yaw: 0.1, paint: 5 },
  { kind: 'long', x: 44, z: -34, w: 10, d: 6, yaw: -0.15, paint: 4 },
  { kind: 'cottage', x: 54, z: -30, w: 7, d: 6, yaw: 0.3, paint: 0 },
  { kind: 'tall', x: -56, z: -22, w: 6, d: 6, yaw: 0.25, paint: 2 },
  { kind: 'cottage', x: 56, z: -12, w: 7, d: 6, yaw: -0.3, paint: 3 },
  { kind: 'cottage', x: -58, z: 6, w: 7, d: 6, yaw: 0.2, paint: 4 },
];
export const FAR_WINDMILL = { kind: 'windmill', x: 25, z: -36, r: 3 };

export const THINGS = [
  { kind: 'silo', x: 28.2, z: 10.6, r: 2.2 },
  { kind: 'windmill', x: 42, z: 11.5, r: 3 },
  { kind: 'fountain', x: -23.5, z: 18, r: 2.2 },
  { kind: 'haystack', x: 43, z: 26, r: 2 },
];

export const BALES = [[19, 24.5], [29.5, 24.5]].map(([x, z]) => ({ x, z, r: 1.25 }));
export const POND = { x: 44, z: -21, r: 5.5 };
export const ORCHARD = { x: 20, z: -26.5, w: 11, d: 7.4 };
export const MEADOW = { x: -14, z: -23.5, w: 13, d: 7.5 };
export const STALLS = [[-31.5, 16], [-31.5, 20.5]].map(([x, z], index) => ({ x, z, paint: index }));

// Stone walls, in short lengths, so there's always a way round them.
export const WALLS = [
  [[-46, -14.5], [-41, -14.5]],
  [[40, -14.5], [46, -15]],
  [[40, 17.6], [47, 17.8]],
  [[-11, 6.7], [-3.5, 6.9]],
];

// Trees that are in the way, standing about in the play area. There are thousands more outside it.
export const TREES = [
  // The edge of the far woods, with a clearing behind.
  { x: -45, z: -27, kind: 'pine' }, { x: -41, z: -28, kind: 'pine' }, { x: -37, z: -27.5, kind: 'pine' }, { x: -33.5, z: -29, kind: 'pine' },
  { x: -46, z: -22, kind: 'pine' }, { x: -46.5, z: -17.5, kind: 'birch' },
  { x: -36.5, z: -19.5, kind: 'birch' }, { x: -20, z: -15, kind: 'poplar' }, { x: 45, z: -15.5, kind: 'poplar' },
  // Down by the water.
  { x: 43, z: -2.5, kind: 'poplar' }, { x: -44, z: 0, kind: 'round' }, { x: 47, z: 7, kind: 'round' },
  // Round the farm and the village.
  { x: -2, z: 28.5, kind: 'autumn' }, { x: -34, z: 2.5, kind: 'poplar' },
  { x: -47, z: 10, kind: 'birch' }, { x: 46, z: 23, kind: 'poplar' }, { x: 12, z: 29, kind: 'round' },
];

function boxHas({ x, z, w, d, yaw = 0 }, px, pz, pad) {
  const dx = px - x;
  const dz = pz - z;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const along = dx * cos - dz * sin;
  const across = dx * sin + dz * cos;
  return Math.abs(along) <= w / 2 + pad && Math.abs(across) <= d / 2 + pad;
}

/** Whether something solid is within pad of this place. */
export function solidNear(x, z, pad = 0) {
  if (BUILDINGS.some((box) => boxHas(box, x, z, pad))) return true;
  if (boxHas(ORCHARD, x, z, pad) || boxHas(MEADOW, x, z, pad)) return true;
  const near = ({ x: cx, z: cz, r = 1.5 }) => Math.hypot(x - cx, z - cz) <= r + pad;
  if (THINGS.some(near) || BALES.some(near) || TREES.some((tree) => near({ ...tree, r: 1.4 }))) return true;
  if (STALLS.some(({ x: cx, z: cz }) => boxHas({ x: cx, z: cz, w: 4.6, d: 3 }, x, z, pad))) return true;
  if (near(POND)) return true;
  return WALLS.some((wall) => distanceToLine(wall, x, z) <= 0.6 + pad);
}

export function riverNear(x, z, pad = 0) {
  return distanceToLine(RIVER, x, z) <= RIVER_WIDTH / 2 + pad;
}

function blockedForATank(x, z) {
  if (onABridge(x, z)) return false;
  if (riverNear(x, z, RIVER_MARGIN)) return true;
  // Beyond the far edge of the play area, the roads are the only way down.
  if (z < -30 && !ROADS.slice(0, 3).some(({ line, width }) => distanceToLine(line, x, z) <= width / 2 + 0.5)) return true;
  return solidNear(x, z, TANK_RADIUS - 0.4);
}

let nav = null;

/** The grid of where a tank can drive. It only needs working out once. */
export function valleyNav() {
  if (!nav) {
    nav = new NavGrid(NAV_BOUNDS, blockedForATank);
    nav.keepOnlyWhatsReachable(START.x, START.z);
  }
  return nav;
}

/** Somewhere the hand can point: anywhere in the play area. */
export function clampToPlay(x, z) {
  return { x: clamp(x, PLAY.left, PLAY.right), z: clamp(z, PLAY.far, PLAY.near) };
}

/* ---------- what grows ---------- */

// The fields, which can be driven over. crop says how each one is painted.
export const FIELDS = [
  { x: 21, z: 23.5, w: 17, d: 9.5, yaw: 0.03, crop: 'wheat' },
  { x: 37.5, z: 23, w: 14, d: 10, yaw: -0.02, crop: 'lavender' },
  { x: 35, z: 10.5, w: 6, d: 8, yaw: 0.02, crop: 'carrots' },
  { x: -36.5, z: -22, w: 11, d: 9, yaw: 0.04, crop: 'barley' },
];

const onARoad = (x, z, room) => ROADS.some(({ line, width }) => distanceToLine(line, x, z) <= width / 2 + room);

let growing = null;

/**
 * Every tree and rock outside the play area, in woods round the edge of the valley, as well as those
 * inside it. It's the same every time, as the picture and its shadows both need to know.
 */
export function plants() {
  if (growing) return growing;
  const random = seeded(20261107);
  const list = { round: [], pine: [], poplar: [], birch: [], autumn: [], bush: [], rock: [], fruit: [] };
  for (const { x, z, kind } of TREES) list[kind].push({ x, z, y: heightAt(x, z) - 0.2, yaw: random() * 6.3, scale: 0.9 + random() * 0.3 });
  const spread = 124;
  for (let i = 0; i < 9000; i += 1) {
    const x = -spread + random() * spread * 2;
    const z = -112 + random() * 208;
    const inside = x > PLAY.left - 2 && x < PLAY.right + 2 && z > PLAY.far - 2 && z < PLAY.near + 4;
    if (inside) continue;
    const roll = random();
    // Thick round the valley, where it can be seen, and thinning out beyond.
    const out = Math.max(PLAY.left - x, x - PLAY.right, PLAY.far - z, z - PLAY.near, 0);
    const patch = bumps(x / 19 + 21, z / 19 + 3);
    const thick = (patch > 0.4 ? 0.85 : 0.32) * (out < 42 ? 1 : 0.35);
    if (roll > thick) continue;
    if (Math.abs(x - FORT.x) < 23 && z > FORT.z - 11 && z < FORT.z + 10) continue;
    if ([...FAR_HOUSES, FAR_WINDMILL].some(({ x: hx, z: hz }) => Math.hypot(x - hx, z - hz) < 7)) continue;
    if (riverNear(x, z, 1.5) || onARoad(x, z, 2)) continue;
    const y = heightAt(x, z);
    const scale = 0.85 + random() * 0.6;
    const entry = { x, z, y: y - 0.2, yaw: random() * 6.3, scale };
    // Nothing tall along the bottom of the view, as it would stand in front of what's going on.
    if (z > PLAY.near && z < PLAY.near + 9) {
      if (random() < 0.25) list.bush.push({ ...entry, scale: scale * 0.8 });
      continue;
    }
    const pick = random();
    const high = smooth(5, 16, y);
    if (pick < 0.12 + high * 0.6) list.pine.push(entry);
    else if (pick < 0.14 + high * 0.62) list.rock.push({ ...entry, scale: scale * 0.8 });
    else if (pick < 0.62) list.round.push(entry);
    else if (pick < 0.76) list.autumn.push(entry);
    else if (pick < 0.85) list.birch.push(entry);
    else if (pick < 0.9) list.poplar.push(entry);
    else list.bush.push(entry);
  }
  // Bushes dotted along the river and the roads inside the valley, which are too low to be in the way.
  for (let i = 0; i < 900 && list.bush.length < 240; i += 1) {
    const x = PLAY.left + random() * (PLAY.right - PLAY.left);
    const z = PLAY.far + random() * (PLAY.near - PLAY.far);
    const away = distanceToLine(RIVER, x, z);
    if (away < RIVER_WIDTH / 2 + 1.2 || away > RIVER_WIDTH / 2 + 3.5 || onARoad(x, z, 1)) continue;
    if (solidNear(x, z, 1) || BRIDGES.some(({ x: bx, z: bz, length }) => Math.hypot(x - bx, z - bz) < length * 0.6)) continue;
    list.bush.push({ x, z, y: heightAt(x, z) - 0.1, yaw: random() * 6.3, scale: 0.5 + random() * 0.4 });
  }
  // The apple trees in the orchard.
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const x = ORCHARD.x - ORCHARD.w / 2 + 2 + col * ((ORCHARD.w - 4) / 2);
      const z = ORCHARD.z - ORCHARD.d / 2 + 1.8 + row * (ORCHARD.d - 3.6);
      list.fruit.push({ x, z, y: heightAt(x, z), yaw: random() * 6.3, scale: 0.8 + random() * 0.2 });
    }
  }
  growing = list;
  return list;
}
