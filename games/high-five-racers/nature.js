// What grows and stands around the road: trees of many kinds, bushes, flowers, rocks, mountains and
// the sky. Each kind is an InstancedMesh, split into squares of land so that what's behind the camera
// isn't drawn at all, and the smallest things are what a slow computer drops first.
import * as THREE from '../../vendor/three/three.module.js';
import { faceted, Mesher, seededRandom, smoothstep, softCircleTexture, TAU } from './kit.js';
import { HILL, WATER_LEVEL, lakeMeasure } from './terrain.js';
import { PLACES, ROAD_HALF, within } from './track.js';

const CHUNK = 150;
const STEM = faceted(new THREE.CylinderGeometry(0.5, 0.5, 1, 3));
const PETALS = faceted(new THREE.IcosahedronGeometry(0.5, 0));
const SKY_TOP = '#58b7ff';
export const SKY_HORIZON = '#d6f0ff';

/** A kind of thing, placed many times. finish() turns what was placed into InstancedMeshes. */
export class Scatter {
  constructor(geometry, material, { castShadow = false } = {}) {
    this.geometry = geometry;
    this.material = material;
    this.castShadow = castShadow;
    this.cells = new Map();
  }

  put(x, y, z, spin = 0, size = 1, tint = null, stretch = 1) {
    const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key).push({ x, y, z, spin, size, tint, stretch });
  }

  /** parent is where it goes, which is what lets a slow computer drop it. */
  finish(parent) {
    const dummy = new THREE.Object3D();
    const colour = new THREE.Color();
    for (const items of this.cells.values()) {
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, items.length);
      items.forEach((item, index) => {
        dummy.position.set(item.x, item.y, item.z);
        dummy.rotation.y = item.spin;
        dummy.scale.set(item.size, item.size * item.stretch, item.size);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        if (item.tint) mesh.setColorAt(index, colour.set(item.tint));
      });
      mesh.castShadow = this.castShadow;
      mesh.computeBoundingSphere();
      parent.add(mesh);
    }
  }
}

/** Plain paint, with leaves that move a little in the wind unless motion should be kept down. */
export function leafMaterial(time) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float sway = sin(uTime * 1.2 + instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17) * 0.012 * position.y * position.y;
        transformed.x += sway;
        transformed.z += sway * 0.6;
      #endif`,
    );
  };
  return material;
}

function treeShapes() {
  const trunk = '#8a5a3c';
  const shade = 0.68;
  const white = '#ffffff';
  const shapes = {};
  shapes.pine = new Mesher()
    .add('taper', trunk, 0, 1.2, 0, 0.85, 2.4, 0.85)
    .add('cone', white, 0, 3.7, 0, 4.8, 3.8, 4.8, { shade })
    .add('cone', white, 0, 5.4, 0, 3.8, 3.2, 3.8, { shade })
    .add('cone', white, 0, 7, 0, 2.6, 2.6, 2.6, { shade }).geometry();
  shapes.fir = new Mesher()
    .add('taper', trunk, 0, 1.2, 0, 0.7, 2.4, 0.7)
    .add('spire', white, 0, 4.3, 0, 3.6, 5.6, 3.6, { shade })
    .add('spire', white, 0, 7, 0, 2.7, 4.6, 2.7, { shade })
    .add('spire', white, 0, 9.4, 0, 1.8, 3.6, 1.8, { shade }).geometry();
  shapes.round = new Mesher()
    .add('taper', trunk, 0, 1.4, 0, 0.9, 2.8, 0.9)
    .add('blob', white, 0, 4.5, 0, 4.8, 4.4, 4.8, { shade })
    .add('blob', white, 1.5, 3.7, 0.6, 3.1, 2.9, 3.1, { shade })
    .add('blob', white, -1.3, 3.8, -0.7, 3, 2.8, 3, { shade }).geometry();
  shapes.birch = new Mesher()
    .add('taper', '#eef0ea', 0, 2.4, 0, 0.5, 4.8, 0.5)
    .box('#4a4a48', 0.21, 1.6, 0, 0.1, 0.16, 0.3)
    .box('#4a4a48', -0.19, 2.6, 0.05, 0.1, 0.14, 0.26)
    .box('#4a4a48', 0.14, 3.6, -0.1, 0.1, 0.14, 0.24)
    .add('blob', '#d9ee7a', 0, 5.6, 0, 3, 3.6, 3, { shade: 0.74 })
    .add('blob', '#c7e56a', 0.9, 4.6, 0.3, 2.1, 2.2, 2.1, { shade: 0.74 })
    .add('blob', '#e4f28c', -0.8, 4.8, -0.5, 1.9, 2.1, 1.9, { shade: 0.74 }).geometry();
  shapes.poplar = new Mesher()
    .add('taper', trunk, 0, 0.9, 0, 0.6, 1.8, 0.6)
    .add('blob', white, 0, 6.2, 0, 2.5, 10.6, 2.5, { shade: 0.62 }).geometry();
  const apple = new Mesher()
    .add('taper', trunk, 0, 1, 0, 0.7, 2, 0.7)
    .add('blob', '#69c95a', 0, 3.2, 0, 4, 3.3, 4, { shade: 0.7 });
  for (const [x, y, z] of [[1.6, 3.4, 0.6], [-1.2, 3.8, 1.1], [0.3, 4.5, 1], [-1.5, 2.9, -0.5], [1, 2.7, -1.3], [-0.2, 4.3, -1.2], [0.2, 2.5, 1.7], [1.5, 3.6, -0.8]]) {
    apple.add('ball', '#f0473f', x, y, z, 0.42);
  }
  shapes.apple = apple.geometry();
  shapes.acacia = new Mesher()
    .add('post', '#7a5233', 0, 2, 0, 0.5, 4, 0.5)
    .add('post', '#7a5233', 1, 4.3, 0, 0.26, 2.6, 0.26, { rz: -0.8 })
    .add('post', '#7a5233', -1, 4.4, 0.3, 0.26, 2.6, 0.26, { rz: 0.8 })
    .add('blob', '#7fb24a', 0, 5.8, 0, 9, 1.5, 7.6, { shade: 0.66 })
    .add('blob', '#8fc053', 2.2, 5.3, 1.2, 4.8, 1, 4, { shade: 0.7 })
    .add('blob', '#73a945', -2.4, 5.4, -1, 4.6, 1, 4, { shade: 0.7 }).geometry();
  shapes.bush = new Mesher().add('blob', white, 0, 0, 0, 2, 1.8, 2, { shade: 0.7 }).geometry();
  shapes.rock = new Mesher().add('rock', white, 0, 0, 0, 2.4, 1.6, 2, { shade: 0.74 }).geometry();
  shapes.flower = new Mesher()
    .add(STEM, '#54a84e', 0, 0.2, 0, 0.05, 0.4, 0.05)
    .add(PETALS, white, 0, 0.44, 0, 0.3, 0.15, 0.3).geometry();
  shapes.grass = new Mesher()
    .add('spire', '#ffffff', 0, 0.3, 0, 0.2, 0.7, 0.2, { rz: 0.15, shade: 0.7 })
    .add('spire', '#ffffff', 0.12, 0.26, 0.04, 0.17, 0.6, 0.17, { rz: -0.3, shade: 0.7 })
    .add('spire', '#ffffff', -0.12, 0.26, -0.05, 0.17, 0.6, 0.17, { rz: 0.4, shade: 0.7 }).geometry();
  shapes.reed = new Mesher()
    .add('post', '#74a64f', 0, 0.9, 0, 0.09, 1.8, 0.09)
    .add('post', '#7fb158', 0.25, 0.7, 0.1, 0.08, 1.4, 0.08)
    .add('ball', '#7a4c2a', 0, 1.9, 0, 0.17, 0.5, 0.17)
    .add('ball', '#7a4c2a', 0.25, 1.5, 0.1, 0.15, 0.44, 0.15).geometry();
  shapes.mushroom = new Mesher()
    .add('post', '#f6efdf', 0, 0.2, 0, 0.16, 0.4, 0.16)
    .add('ball', '#e6483f', 0, 0.42, 0, 0.5, 0.3, 0.5)
    .add('ball', '#ffffff', 0.13, 0.54, 0.08, 0.1, 0.05, 0.1)
    .add('ball', '#ffffff', -0.12, 0.53, -0.1, 0.09, 0.05, 0.09).geometry();
  shapes.stump = new Mesher()
    .add('post', '#8a5a3c', 0, 0.3, 0, 0.9, 0.6, 0.9)
    .add('disc', '#d8b984', 0, 0.61, 0, 0.82).geometry();
  return shapes;
}

const TINTS = {
  pine: ['#2f9e62', '#37ab6b', '#278a57', '#46b873'],
  fir: ['#23795a', '#2a8a62', '#1f6e55', '#318f66'],
  round: ['#5cc95a', '#7bd65b', '#49b866', '#66cf58', '#8bd862'],
  autumn: ['#f4b63f', '#ef8f5a', '#e96f4a', '#f7c94a', '#d9832f'],
  poplar: ['#4fb35e', '#58bd63', '#47a757'],
  bush: ['#4cb763', '#5fc56a', '#3fa85a', '#6dcc6c'],
  rock: ['#b7c0c9', '#a4aeb8', '#c8cfd6'],
  flower: ['#ffffff', '#ffe066', '#ff8fa3', '#c9a7ff', '#ff9f5a', '#ff6f7d'],
  grass: ['#6fc95f', '#84d566', '#5cbf5b', '#a2dc6c'],
};

/** Round spots of land kept free, because something's built there. */
export const CLEARINGS = [
  { x: 165, z: -172, r: 46 }, // The farmyard.
  { x: -196, z: -18, r: 58 }, // The Harvest Fair.
  { x: 40, z: 56, r: 30 }, // The camping meadow.
  { x: -325, z: -55, r: 22 }, // Where the giraffes stand.
];

export function buildNature(world) {
  const { track, terrain, time } = world;
  const random = seededRandom(20261106);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const shapes = treeShapes();
  const leaves = leafMaterial(time);
  const still = new THREE.MeshLambertMaterial({ vertexColors: true });

  const blocked = (x, z) => {
    if (CLEARINGS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) return true;
    const near = track.nearest(x, z);
    if (!near) return false;
    if (within(near.along, PLACES.village, track.length) && near.gap < 38) return true;
    if (within(near.along, PLACES.grandstand, track.length) && near.gap < 44) return true;
    if (within(near.along, PLACES.bridge, track.length) && near.gap < 30) return true;
    return false;
  };

  const place = (count, { minGap, maxRadius, keep = () => 1, make }) => {
    let placed = 0;
    let tries = 0;
    while (placed < count && tries < count * 50) {
      tries += 1;
      const angle = random() * TAU;
      const radius = Math.sqrt(random()) * maxRadius;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (blocked(x, z)) continue;
      const gap = track.distanceTo(x, z);
      if (gap < minGap || random() > keep(x, z, gap)) continue;
      const y = terrain.heightAt(x, z);
      if (y < WATER_LEVEL + 0.6) continue;
      make(x, y, z, gap);
      placed += 1;
    }
  };

  const nearRoad = (gap) => 0.3 + 0.7 * (1 - smoothstep(gap, 20, 180));
  const inForest = (x, z) => 1 - smoothstep(Math.hypot(x + 215, z + 215), 110, 205);
  const onHill = (x, z) => 1 - smoothstep(Math.hypot(x - HILL.x, z - HILL.z), 70, HILL.radius);
  const onFarm = (x, z) => 1 - smoothstep(Math.hypot(x - 165, z + 195), 70, 150);
  const inDryLand = (x, z) => 1 - smoothstep(Math.hypot(x + 340, z + 40), 40, 105);
  const byLake = (x, z) => 1 - smoothstep(lakeMeasure(x, z), 1.08, 1.6);

  const pines = new Scatter(shapes.pine, leaves, { castShadow: true });
  const firs = new Scatter(shapes.fir, leaves, { castShadow: true });
  const rounds = new Scatter(shapes.round, leaves, { castShadow: true });
  const birches = new Scatter(shapes.birch, leaves, { castShadow: true });
  const poplars = new Scatter(shapes.poplar, leaves, { castShadow: true });
  const apples = new Scatter(shapes.apple, still, { castShadow: true });
  const acacias = new Scatter(shapes.acacia, leaves, { castShadow: true });
  const bushes = new Scatter(shapes.bush, still);
  const rocks = new Scatter(shapes.rock, still);
  const flowers = new Scatter(shapes.flower, still);
  const grass = new Scatter(shapes.grass, still);
  const reeds = new Scatter(shapes.reed, still);
  const mushrooms = new Scatter(shapes.mushroom, still);
  const stumps = new Scatter(shapes.stump, still);

  const TREE_GAP = ROAD_HALF + 9;
  place(620, {
    minGap: TREE_GAP,
    maxRadius: 760,
    keep: (x, z, gap) => Math.max(nearRoad(gap) * 0.45 * (1 - onFarm(x, z)) * (1 - byLake(x, z) * 0.8), inForest(x, z), onHill(x, z)),
    make: (x, y, z) => pines.put(x, y - 0.1, z, random() * TAU, 0.95 + random() * 0.85, pick(TINTS.pine)),
  });
  place(320, {
    minGap: TREE_GAP,
    maxRadius: 620,
    keep: (x, z) => Math.max(inForest(x, z) * 0.95, onHill(x, z) * 0.75, 0.05),
    make: (x, y, z) => firs.put(x, y - 0.1, z, random() * TAU, 0.95 + random() * 0.8, pick(TINTS.fir)),
  });
  place(430, {
    minGap: TREE_GAP,
    maxRadius: 620,
    keep: (x, z, gap) => nearRoad(gap) * (1 - onFarm(x, z) * 0.8) * (1 - inDryLand(x, z)) * (1 - byLake(x, z) * 0.5),
    make: (x, y, z) => {
      const autumn = Math.hypot(x + 175, z + 150) < 100 || random() < 0.13;
      rounds.put(x, y - 0.1, z, random() * TAU, 0.95 + random() * 0.75, pick(autumn ? TINTS.autumn : TINTS.round));
    },
  });
  place(120, {
    minGap: ROAD_HALF + 7,
    maxRadius: 240,
    keep: (x, z) => byLake(x, z),
    make: (x, y, z) => birches.put(x, y - 0.1, z, random() * TAU, 0.95 + random() * 0.6),
  });
  place(26, {
    minGap: TREE_GAP,
    maxRadius: 460,
    keep: inDryLand,
    make: (x, y, z) => acacias.put(x, y - 0.1, z, random() * TAU, 0.95 + random() * 0.5),
  });

  // Rows look planted, which says something about the place: poplars along the road, apple orchards.
  const row = (fromX, fromZ, toX, toZ, count, draw) => {
    for (let i = 0; i < count; i += 1) {
      const x = fromX + ((toX - fromX) * i) / (count - 1);
      const z = fromZ + ((toZ - fromZ) * i) / (count - 1);
      if (blocked(x, z) || track.distanceTo(x, z) < ROAD_HALF + 5) continue;
      draw(x, terrain.heightAt(x, z) - 0.1, z);
    }
  };
  for (const [fromX, fromZ, toX, toZ, count] of [
    [30, -225, 120, -252, 11], [34, -240, 124, -267, 11], [38, -255, 128, -282, 11], [24, -210, 112, -237, 11],
  ]) {
    row(fromX, fromZ, toX, toZ, count, (x, y, z) => apples.put(x, y, z, random() * TAU, 0.95 + random() * 0.2));
  }
  for (const [fromX, fromZ, toX, toZ, count] of [
    [-130, 150, -30, 148, 9], [-60, 165, 60, 150, 9], [-235, 108, -165, 150, 7], [235, 60, 305, 25, 7],
    [120, 118, 220, 80, 9],
  ]) {
    row(fromX, fromZ, toX, toZ, count, (x, y, z) => poplars.put(x, y, z, random() * TAU, 1 + random() * 0.35, pick(TINTS.poplar)));
  }

  place(420, {
    minGap: ROAD_HALF + 5,
    maxRadius: 520,
    keep: nearRoad,
    make: (x, y, z) => bushes.put(x, y + 0.3, z, random() * TAU, 0.6 + random() * 1.1, pick(TINTS.bush)),
  });
  place(170, {
    minGap: ROAD_HALF + 5,
    maxRadius: 560,
    keep: (x, z) => Math.max(0.35, onHill(x, z)),
    make: (x, y, z) => rocks.put(x, y + 0.1, z, random() * TAU, 0.5 + random() * 1.3, pick(TINTS.rock)),
  });
  place(1300, {
    minGap: ROAD_HALF + 5.4,
    maxRadius: 360,
    keep: (x, z, gap) => (1 - smoothstep(gap, 9, 50)) * (1 - inForest(x, z) * 0.7),
    make: (x, y, z) => flowers.put(x, y, z, random() * TAU, 0.9 + random() * 0.9, pick(TINTS.flower)),
  });
  place(2200, {
    minGap: ROAD_HALF + 5.2,
    maxRadius: 340,
    keep: (x, z, gap) => 1 - smoothstep(gap, 9, 34),
    make: (x, y, z) => grass.put(x, y, z, random() * TAU, 0.8 + random() * 1.1, pick(TINTS.grass)),
  });
  place(110, {
    minGap: ROAD_HALF + 6,
    maxRadius: 330,
    keep: inForest,
    make: (x, y, z) => mushrooms.put(x, y, z, random() * TAU, 1 + random() * 1.5),
  });
  place(36, {
    minGap: ROAD_HALF + 7,
    maxRadius: 330,
    keep: inForest,
    make: (x, y, z) => stumps.put(x, y, z, random() * TAU, 0.9 + random() * 0.6),
  });
  // Reeds stand in the shallow water around the lake's edge.
  for (let i = 0; i < 260; i += 1) {
    const angle = random() * TAU;
    const reach = 0.95 + random() * 0.3;
    const x = 45 + Math.cos(angle) * 100 * reach;
    const z = -42 + Math.sin(angle) * 54 * reach;
    const y = terrain.heightAt(x, z);
    if (y < WATER_LEVEL - 0.9 || y > WATER_LEVEL + 0.8 || track.distanceTo(x, z) < ROAD_HALF + 4) continue;
    reeds.put(x, Math.max(y, WATER_LEVEL - 0.2), z, random() * TAU, 1 + random() * 0.7);
  }

  for (const scatter of [pines, firs, rounds, birches, poplars, apples, acacias]) scatter.finish(world.trees);
  for (const scatter of [bushes, rocks, stumps]) scatter.finish(world.medium);
  for (const scatter of [flowers, grass, reeds, mushrooms]) scatter.finish(world.small);
}

const HAZE = new THREE.Color(SKY_HORIZON);
const SUN_DIRECTION = new THREE.Vector3(0.55, 0.62, -0.56).normalize();

/** One rough peak. Its faces are coloured by hand, as they're too far away to need any lighting. */
function addPeak(m, random, x, z, height, width, snowLine, rockHex, haze) {
  const geometry = new THREE.ConeGeometry(0.5, 1, 9, 4, true).toNonIndexed();
  const p = geometry.attributes.position;
  const seed = random() * 100;
  // Moves each corner by a little, the same way wherever that corner turns up in a face.
  const wobble = (a, b) => Math.sin(a * 12.9 + seed) * Math.cos(b * 7.3 + seed) * 0.5;
  for (let i = 0; i < p.count; i += 1) {
    const px = p.getX(i);
    const py = p.getY(i);
    const pz = p.getZ(i);
    p.setXYZ(i, px * (1 + wobble(px, py) * 0.5), py + wobble(pz, px) * 0.1 * (0.5 - py), pz * (1 + wobble(pz, py) * 0.5));
  }
  const rock = new THREE.Color(rockHex);
  const snow = new THREE.Color('#ffffff');
  const colour = new THREE.Color();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.set(p.getX(i), p.getY(i), p.getZ(i));
    b.set(p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1));
    c.set(p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
    normal.subVectors(b, a).cross(c.clone().sub(a)).normalize();
    const facing = 0.72 + 0.34 * Math.max(0, normal.dot(SUN_DIRECTION));
    const top = Math.max(a.y, b.y, c.y) + 0.5;
    const white = top + Math.sin(i * 1.7 + seed) * 0.05 > snowLine;
    colour.copy(white ? snow : rock).multiplyScalar(white ? 0.82 + 0.18 * facing : facing);
    // The further down, the more of the haze it's seen through.
    for (const corner of [a, b, c]) {
      const shade = colour.clone().lerp(HAZE, haze * (1 - (corner.y + 0.5) * 0.75));
      m.positions.push(corner.x * width + x, (corner.y + 0.5) * height, corner.z * width + z);
      m.normals.push(0, 1, 0);
      m.colours.push(shade.r, shade.g, shade.b);
    }
  }
}

function buildMountains(scene) {
  const random = seededRandom(1921);
  const m = new Mesher();
  for (let i = 0; i < 36; i += 1) {
    const angle = (i / 36) * TAU + random() * 0.08;
    const radius = 1480 + random() * 240;
    const height = 200 + random() * 170 + (Math.sin(angle * 2.3) > 0.4 ? 70 : 0);
    addPeak(m, random, Math.cos(angle) * radius, Math.sin(angle) * radius, height, height * (1.7 + random() * 0.5), 0.56 + random() * 0.1, '#8fa8c2', 0.62);
  }
  for (let i = 0; i < 28; i += 1) {
    const angle = (i / 28) * TAU + 0.11 + random() * 0.08;
    const radius = 1270 + random() * 110;
    const height = 130 + random() * 90;
    addPeak(m, random, Math.cos(angle) * radius, Math.sin(angle) * radius, height, height * (1.9 + random() * 0.6), 0.74 + random() * 0.1, '#86aabb', 0.5);
  }
  const mesh = new THREE.Mesh(m.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  scene.add(mesh);
}

export function buildSky(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, SKY_TOP);
  gradient.addColorStop(0.62, SKY_HORIZON);
  gradient.addColorStop(1, SKY_HORIZON);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 256);
  const sky = new THREE.CanvasTexture(canvas);
  sky.colorSpace = THREE.SRGBColorSpace;
  scene.background = sky;
  scene.fog = new THREE.Fog(SKY_HORIZON, 210, 1250);

  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softCircleTexture('rgba(255,244,190,1)', 'rgba(255,244,190,0)'),
    fog: false,
    depthWrite: false,
    transparent: true,
  }));
  sun.position.set(900, 620, -800);
  sun.scale.setScalar(320);
  scene.add(sun);

  buildMountains(scene);

  const random = seededRandom(7);
  const m = new Mesher();
  for (let cloud = 0; cloud < 34; cloud += 1) {
    const angle = random() * TAU;
    const radius = 260 + random() * 760;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const cy = 110 + random() * 110;
    const parts = 4 + Math.floor(random() * 5);
    for (let i = 0; i < parts; i += 1) {
      const size = 20 + random() * 26;
      m.add('blob', '#ffffff', cx + (i - parts / 2) * 15 + random() * 6, cy + random() * 6, cz + random() * 14, size, size * 0.62, size, { shade: 0.86 });
    }
  }
  const clouds = new THREE.Mesh(m.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  clouds.frustumCulled = false;
  scene.add(clouds);
  return clouds;
}

/** A few birds wheeling over the lake and the forest. */
export function buildBirds(world) {
  const wing = (m, x, z) => {
    m.triangle('#f6f4ee', [0, 0, 0.5], [0, 0, -0.5], [x, 0.5, z]);
  };
  const m = new Mesher();
  wing(m, 2, 0.1);
  wing(m, -2, 0.1);
  const shape = m.geometry();
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const random = seededRandom(52);
  for (const [cx, cz, height, wide] of [[45, -42, 34, 70], [-215, -215, 44, 90], [165, -190, 38, 60]]) {
    const flock = new THREE.Group();
    flock.position.set(cx, height, cz);
    const birds = 9;
    const mesh = new THREE.InstancedMesh(shape, material, birds);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < birds; i += 1) {
      dummy.position.set(wide + random() * 16, random() * 10, (random() - 0.5) * 20);
      dummy.scale.setScalar(0.6 + random() * 0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.frustumCulled = false;
    flock.add(mesh);
    world.distant.add(flock);
    world.animate((dt) => {
      flock.rotation.y += dt * (world.reducedMotion ? 0.02 : 0.11);
    });
  }
}

export function buildBalloons(scene) {
  const random = seededRandom(99);
  const balloons = [];
  const paints = [['#ff5a4f', '#ffffff'], ['#ffd23f', '#ff8a2b'], ['#a855f7', '#ffd23f'], ['#3b82f6', '#ffffff'], ['#ff8fa3', '#ffffff'], ['#27c96b', '#ffd23f']];
  for (const [main, stripe] of paints) {
    const m = new Mesher()
      .add('ball', main, 0, 8, 0, 12, 13.6, 12, { shade: 0.8 })
      .add('ball', stripe, 0, 8, 0, 6, 13.7, 12.1, { shade: 0.8 })
      .add('taper', main, 0, 1.6, 0, 3, 2.4, 3, { rx: Math.PI })
      .add('box', '#8a5a3c', 0, -0.9, 0, 2.2, 1.5, 2.2);
    const mesh = new THREE.Mesh(m.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    const angle = random() * TAU;
    const radius = 120 + random() * 300;
    mesh.position.set(Math.cos(angle) * radius, 48 + random() * 50, Math.sin(angle) * radius);
    scene.add(mesh);
    balloons.push({ mesh, baseY: mesh.position.y, phase: random() * TAU });
  }
  return balloons;
}
