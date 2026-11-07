// Where the land is. The flight's rules need it to keep planes off the ground, and the picture builds
// the island from it, so there's no screen in this file and it runs in the unit tests. Everything's in
// the same units as the flight, with x east, z south and y up, and the sea at height 0.

// The limits of the flight. A plane is turned back before it gets to the edge.
export const WORLD = {
  limit: 1050, // How far from the middle of the island a plane can get.
  turnBackFrom: 880, // Where it starts being turned back.
  ceiling: 280,
  clearance: 16, // The least a plane can have between it and the ground or the sea.
};

const ISLAND_RADIUS = 590;
const SEA_FLOOR = -34;

// Places on the main island, which the picture fills in.
export const PLACES = {
  town: { x: 40, z: 250, radius: 112, height: 13 },
  fair: { x: 270, z: -215, radius: 90, height: 15 },
  farm: { x: -275, z: 150, radius: 125, height: 11 },
  castle: { x: 285, z: 75, radius: 42, height: 62 },
};
const VOLCANO = { x: -150, z: -190, height: 190, radius: 165, crater: 34, craterDepth: 66 };
const CASTLE_HILL = { x: 285, z: 75, height: 56, radius: 95 };
export const VOLCANO_TOP = { x: VOLCANO.x, z: VOLCANO.z };

export const ISLETS = [
  { x: -700, z: -260, radius: 100, height: 20 },
  { x: 610, z: -470, radius: 88, height: 17 },
  { x: 720, z: 300, radius: 118, height: 24 },
  { x: -470, z: 650, radius: 82, height: 15 },
  { x: 120, z: -790, radius: 96, height: 18 },
  { x: -810, z: 210, radius: 66, height: 12 },
  { x: 420, z: 730, radius: 70, height: 13 },
];

// A river from the side of the volcano down to the sea on the south coast.
export const RIVER = [
  [-112, -92], [-72, -12], [-92, 70], [-62, 150], [-84, 235], [-70, 330], [-92, 430], [-96, 560], [-100, 680],
];
const RIVER_WIDTH = 26;

const smooth = (from, to, value) => {
  const share = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return share * share * (3 - 2 * share);
};

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

/** Hills and patches: smooth bumps at a few sizes, from 0 to 1. */
export function bumps(x, y) {
  return valueNoise(x, y) * 0.58 + valueNoise(x * 2.1 + 9, y * 2.1 + 4) * 0.29 + valueNoise(x * 4.3 + 3, y * 4.3 + 8) * 0.13;
}

function distanceToRiver(x, z) {
  let nearest = Infinity;
  for (let i = 0; i < RIVER.length - 1; i += 1) {
    const [ax, az] = RIVER[i];
    const [bx, bz] = RIVER[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const along = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    nearest = Math.min(nearest, Math.hypot(x - ax - dx * along, z - az - dz * along));
  }
  return nearest;
}

/** How high the land is here, or how deep the sea floor, with the sea at 0. */
export function heightAt(x, z) {
  const fromMiddle = Math.hypot(x, z);
  const angle = Math.atan2(z, x);
  const edge = ISLAND_RADIUS * (0.78 + 0.46 * bumps(Math.cos(angle) * 1.8 + 11, Math.sin(angle) * 1.8 + 7));
  const inland = smooth(edge, edge * 0.6, fromMiddle);
  let height = SEA_FLOOR + inland * (-SEA_FLOOR + 5 + 36 * bumps(x / 170 + 3, z / 170 + 9));

  for (const islet of ISLETS) {
    const away = Math.hypot(x - islet.x, z - islet.z);
    if (away < islet.radius) {
      const rise = smooth(islet.radius, islet.radius * 0.3, away);
      height = Math.max(height, SEA_FLOOR + rise * (-SEA_FLOOR + islet.height * (0.6 + 0.8 * bumps(x / 40 + 2, z / 40))));
    }
  }

  const fromVolcano = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
  if (fromVolcano < VOLCANO.radius * 2.4) {
    const shoulders = VOLCANO.height * Math.exp(-((fromVolcano / VOLCANO.radius) ** 2));
    const crater = VOLCANO.craterDepth * Math.exp(-((fromVolcano / VOLCANO.crater) ** 2));
    height += (shoulders - crater) * (0.82 + 0.3 * bumps(x / 34, z / 34));
  }
  const fromHill = Math.hypot(x - CASTLE_HILL.x, z - CASTLE_HILL.z);
  if (fromHill < CASTLE_HILL.radius * 2.2) height += CASTLE_HILL.height * Math.exp(-((fromHill / CASTLE_HILL.radius) ** 2));

  // The river's valley, cut down to just above the sea, wherever there's land.
  if (height > 1) {
    const fromRiver = distanceToRiver(x, z);
    if (fromRiver < RIVER_WIDTH * 2.5) height += (1.2 - height) * smooth(RIVER_WIDTH * 2.5, RIVER_WIDTH * 0.55, fromRiver);
  }

  for (const { x: px, z: pz, radius, height: flat } of Object.values(PLACES)) {
    const away = Math.hypot(x - px, z - pz);
    if (away < radius) height += (flat - height) * smooth(radius, radius * 0.62, away);
  }
  return height;
}

/** The lowest a plane can be here: above the land, or above the sea. */
export function floorAt(x, z) {
  return Math.max(0, heightAt(x, z)) + WORLD.clearance;
}

/** Where the coast of the main island is, going out from the middle in this direction. */
export function coastAt(angle) {
  const x = Math.cos(angle);
  const z = Math.sin(angle);
  for (let far = ISLAND_RADIUS * 1.35; far > 50; far -= 5) {
    if (heightAt(x * far, z * far) > 0) return { x: x * far, z: z * far, far };
  }
  return { x: x * 50, z: z * 50, far: 50 };
}
