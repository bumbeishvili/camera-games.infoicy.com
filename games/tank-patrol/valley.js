// Giraffe's valley, a toy world that fits on the screen: a river with its bridges, a village and its church,
// a farm with its fields and windmill, an orchard, a pond, woods all round, and an old fort on the hill
// at the far side. Things there are many of share one instanced mesh, and everything flat is painted on
// the floor by ground-paint.js, so it's quick to draw and a slow computer can show fewer of them.
//
// Nothing flashes: seizures are more common in children with hemiplegia. All that moves here does so
// slowly and steadily, and the picture's brightness doesn't change.
import * as THREE from '../../vendor/three/three.module.js';
import { mergeParts } from '../../core/body/characters.js';
import { SHAPES, spriteTexture } from '../../core/body/sparks.js';
import { PAINTED, paintGround } from './ground-paint.js';
import { BALES, BRIDGES, BUILDINGS, FAR_HOUSES, FAR_WINDMILL, FORT_AT, MEADOW, POND, RIVER, RIVER_WIDTH, STALLS, THINGS, WALLS, heightAt, plants, seeded } from './valley-map.js';

const GROUND_PICTURE_WIDTH = 3600; // Pixels across the whole of the painted valley floor.
const SMALL_GROUND_PICTURE_WIDTH = 2048;

const between = (random, low, high) => low + random() * (high - low);

const plain = (options = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...options });
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cone = (radius, height, sides = 6) => new THREE.ConeGeometry(radius, height, sides);
const pole = (top, bottom, height, sides = 6) => new THREE.CylinderGeometry(top, bottom, height, sides);
const lump = (radius, detail = 1) => new THREE.IcosahedronGeometry(radius, detail);

/** A gabled roof: a long wedge with its ridge along x, sitting on y = 0. */
function prism(width, height, depth) {
  const [w, d] = [width / 2, depth / 2];
  const A = [-w, 0, -d];
  const B = [-w, 0, d];
  const C = [-w, height, 0];
  const D = [w, 0, -d];
  const E = [w, 0, d];
  const F = [w, height, 0];
  const faces = [A, B, C, D, F, E, B, E, F, B, F, C, D, A, C, D, C, F];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(faces.flat(), 3));
  geometry.computeVertexNormals();
  return geometry;
}

const GOLD = '#f0cf62';
const STONE = '#c9c3b6';
const STONE_DARK = '#a9a498';
const TIMBER = '#7a5532';
const GLASS = '#79c7ea';

/* ------------------------------- what grows ------------------------------- */

const ROUND_TREE = () => mergeParts([
  { geometry: pole(0.3, 0.46, 2.4, 5), colour: '#8a6239', at: [0, 1.2, 0] },
  { geometry: lump(2.25), colour: '#ffffff', at: [0, 3.8, 0], size: [1, 0.94, 1] },
  { geometry: lump(1.42), colour: '#f0f0f0', at: [1.3, 3, 0.4] },
  { geometry: lump(1.3), colour: '#e4e4e4', at: [-1.25, 3.2, -0.5] },
]);

const PINE = () => mergeParts([
  { geometry: pole(0.24, 0.42, 1.8, 5), colour: '#7a5532', at: [0, 0.9, 0] },
  { geometry: cone(2.2, 3.4, 7), colour: '#ffffff', at: [0, 2.9, 0] },
  { geometry: cone(1.7, 2.9, 7), colour: '#f0f0f0', at: [0, 4.6, 0] },
  { geometry: cone(1.15, 2.4, 7), colour: '#e2e2e2', at: [0, 6.2, 0] },
]);

const POPLAR = () => mergeParts([
  { geometry: pole(0.2, 0.32, 1.6, 5), colour: '#8a6239', at: [0, 0.8, 0] },
  { geometry: lump(1), colour: '#ffffff', at: [0, 4.2, 0], size: [1.2, 3.6, 1.2] },
]);

const BIRCH_TRUNKS = () => mergeParts([
  { geometry: pole(0.14, 0.26, 4, 5), colour: '#f1eee4', at: [0, 2, 0] },
  { geometry: box(0.3, 0.12, 0.3), colour: '#3a3a3a', at: [0, 1.3, 0] },
  { geometry: box(0.28, 0.1, 0.28), colour: '#3a3a3a', at: [0, 2.4, 0] },
]);

const BIRCH_LEAVES = () => mergeParts([
  { geometry: lump(1.45), colour: '#ffffff', at: [0, 4.1, 0], size: [1, 1.15, 1] },
  { geometry: lump(0.9), colour: '#f0f0f0', at: [0.8, 3.4, 0.3] },
  { geometry: lump(0.85), colour: '#e6e6e6', at: [-0.7, 3.2, -0.4] },
]);

const BUSH = () => mergeParts([
  { geometry: lump(0.95), colour: '#ffffff', at: [0, 0.65, 0], size: [1, 0.8, 1] },
  { geometry: lump(0.65), colour: '#ececec', at: [0.7, 0.45, 0.25] },
  { geometry: lump(0.55), colour: '#e2e2e2', at: [-0.65, 0.4, -0.2] },
]);

const ROCK = () => mergeParts([{ geometry: new THREE.DodecahedronGeometry(1.05, 0), colour: '#ffffff', at: [0, 0.4, 0], size: [1.25, 0.72, 1] }]);

function fruitTree(fruit) {
  const parts = [
    { geometry: pole(0.26, 0.38, 2, 5), colour: '#8a6239', at: [0, 1, 0] },
    { geometry: lump(1.9), colour: '#5cb954', at: [0, 3.1, 0], size: [1, 0.86, 1] },
  ];
  const random = seeded(55);
  for (let i = 0; i < 14; i += 1) {
    const up = between(random, -0.2, 1);
    const angle = random() * Math.PI * 2;
    const flat = Math.sqrt(Math.max(0, 1 - up * up));
    parts.push({ geometry: lump(0.2, 0), colour: fruit, at: [Math.cos(angle) * flat * 1.85, 3.1 + up * 1.6, Math.sin(angle) * flat * 1.85] });
  }
  return mergeParts(parts);
}

/** Writes which of a mesh's copies are drawn, and where. */
function placeCopies(mesh, items) {
  const matrix = new THREE.Matrix4();
  const place = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const size = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const paint = new THREE.Color();
  items.forEach(({ x, y, z, scale = 1, sizeX = scale, sizeY = scale, sizeZ = scale, yaw = 0, colour = '#ffffff' }, index) => {
    place.set(x, y, z);
    turn.setFromAxisAngle(up, yaw);
    size.set(sizeX, sizeY, sizeZ);
    mesh.setMatrixAt(index, matrix.compose(place, turn, size));
    mesh.setColorAt(index, paint.set(colour));
  });
  mesh.count = items.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function instanced(scene, geometry, items) {
  const mesh = new THREE.InstancedMesh(geometry, plain(), Math.max(1, items.length));
  placeCopies(mesh, items);
  mesh.userData.items = items;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

/* ------------------------------- houses ------------------------------- */

const HOUSE_SHAPES = {
  cottage: { w: 7, d: 6, h: 3.2, roof: 2.9 },
  long: { w: 10, d: 6, h: 3, roof: 2.8 },
  tall: { w: 6, d: 6, h: 5.2, roof: 2.8 },
};
const WALL_PAINTS = ['#fff1d6', '#ffe0b8', '#f7d3c4', '#e7efd6', '#f4e3b1', '#ffffff'];
const ROOF_PAINTS = ['#d9534f', '#c9683d', '#a8483f', '#4f7fb5', '#b5573a', '#7f5a9e'];

function houseWalls({ w, d, h }) {
  const parts = [{ geometry: box(w, h, d), colour: '#ffffff', at: [0, h / 2, 0] }];
  // Timber at the corners, and along the top.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push({ geometry: box(0.28, h, 0.28), colour: '#8a6239', at: [sx * (w / 2 - 0.05), h / 2, sz * (d / 2 - 0.05)] });
  }
  parts.push({ geometry: box(w + 0.1, 0.22, d + 0.1), colour: '#8a6239', at: [0, h - 0.05, 0] });
  parts.push({ geometry: box(w + 0.12, 0.42, d + 0.12), colour: '#a9a498', at: [0, 0.2, 0] });
  // A door and windows on each long side, and on the ends.
  for (const side of [-1, 1]) {
    parts.push({ geometry: box(1.2, 2, 0.14), colour: side > 0 ? '#7a4b2a' : '#6a4226', at: [0, 1.05, side * (d / 2 + 0.03)] });
    for (const along of w > 8 ? [-3.3, -1.7, 1.7, 3.3] : [-w * 0.3, w * 0.3]) {
      parts.push({ geometry: box(1.05, 1.1, 0.12), colour: GLASS, at: [along, h * 0.6, side * (d / 2 + 0.03)] });
      parts.push({ geometry: box(1.25, 0.16, 0.2), colour: '#ffffff', at: [along, h * 0.6 - 0.62, side * (d / 2 + 0.05)] });
    }
    parts.push({ geometry: box(0.12, 1.1, 1.05), colour: GLASS, at: [side * (w / 2 + 0.03), h * 0.6, 0] });
    if (h > 4) {
      for (const along of [-w * 0.3, w * 0.3]) parts.push({ geometry: box(0.95, 1, 0.12), colour: GLASS, at: [along, h * 0.28 + 0.6, side * (d / 2 + 0.03)] });
    }
  }
  return mergeParts(parts);
}

function houseRoof({ w, d, h, roof }) {
  return mergeParts([
    { geometry: prism(w + 0.7, roof, d + 1), colour: '#ffffff', at: [0, h, 0] },
    { geometry: box(0.9, 1.6, 0.9), colour: '#b1aaa0', at: [w * 0.26, h + roof * 0.8, -d * 0.12] },
    { geometry: box(1.05, 0.18, 1.05), colour: '#8f8a80', at: [w * 0.26, h + roof * 0.8 + 0.84, -d * 0.12] },
  ]);
}

function buildChurch({ x, z }) {
  const walls = '#f6f1e4';
  const roof = '#7f5a7e';
  const parts = [
    // The nave, running up the valley, with its door towards the camera.
    { geometry: box(7.4, 5, 12.6), colour: walls, at: [0, 2.5, 1.6] },
    { geometry: prism(13.2, 3.6, 8.6).rotateY(Math.PI / 2), colour: roof, at: [0, 5, 1.6] },
    { geometry: box(1.9, 3.1, 0.2), colour: '#7a4b2a', at: [0, 1.55, 7.96] },
    { geometry: new THREE.CircleGeometry(0.85, 12), colour: '#7fc4e8', at: [0, 4.2, 7.93] },
    { geometry: box(7.6, 0.45, 12.8), colour: STONE_DARK, at: [0, 0.22, 1.6] },
    // The tower at the far end, tall enough to be seen from everywhere.
    { geometry: box(4.4, 11, 4.4), colour: '#efe8d8', at: [0, 5.5, -5.6] },
    { geometry: cone(3.5, 5.4, 4).rotateY(Math.PI / 4), colour: roof, at: [0, 13.7, -5.6] },
    { geometry: box(4.7, 0.42, 4.7), colour: STONE_DARK, at: [0, 11, -5.6] },
    { geometry: new THREE.CylinderGeometry(1, 1, 0.14, 16).rotateX(Math.PI / 2), colour: '#ffffff', at: [0, 8.2, -3.36] },
    { geometry: box(0.14, 0.75, 0.1), colour: '#26324a', at: [0, 8.45, -3.26] },
    { geometry: box(0.55, 0.12, 0.1), colour: '#26324a', at: [0.22, 8.2, -3.26] },
    { geometry: box(1, 2, 0.12), colour: '#5d6b7c', at: [0, 5.2, -3.36] },
    { geometry: box(0.22, 1.5, 0.22), colour: '#f0cf62', at: [0, 17, -5.6] },
    { geometry: box(0.9, 0.2, 0.2), colour: '#f0cf62', at: [0, 17.2, -5.6] },
  ];
  // Tall windows down each side.
  for (const side of [-1, 1]) {
    for (const along of [-2.6, 1, 4.6]) parts.push({ geometry: box(0.14, 2.6, 1), colour: GLASS, at: [side * 3.73, 2.7, along] });
  }
  const mesh = new THREE.Mesh(mergeParts(parts), plain());
  mesh.position.set(x, heightAt(x, z) - 0.05, z);
  return mesh;
}

function buildBarn({ x, z }) {
  const parts = [
    { geometry: box(11, 4, 7), colour: '#c9463d', at: [0, 2, 0] },
    { geometry: prism(11.7, 3.1, 8), colour: '#5d6b7c', at: [0, 4, 0] },
    { geometry: box(3.2, 3.2, 0.16), colour: '#f4efe2', at: [-2.2, 1.6, 3.58] },
    { geometry: box(2.9, 2.9, 0.16), colour: '#8c2f28', at: [-2.2, 1.6, 3.62] },
    { geometry: box(0.2, 3.2, 0.2), colour: '#f4efe2', at: [-2.2, 1.6, 3.68] },
    { geometry: box(1.3, 1.3, 0.14), colour: GLASS, at: [2.8, 2.5, 3.58] },
    { geometry: box(11.2, 0.3, 7.2), colour: '#f4efe2', at: [0, 4, 0] },
    { geometry: box(11.2, 0.4, 7.2), colour: STONE_DARK, at: [0, 0.2, 0] },
  ];
  const mesh = new THREE.Mesh(mergeParts(parts), plain());
  mesh.position.set(x, heightAt(x, z) - 0.05, z);
  return mesh;
}

function buildSilo({ x, z }) {
  const parts = [
    { geometry: pole(2.1, 2.2, 8.4, 12), colour: '#e7e2d4', at: [0, 4.2, 0] },
    { geometry: new THREE.SphereGeometry(2.14, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), colour: '#c9463d', at: [0, 8.3, 0] },
  ];
  for (const y of [1.6, 3.6, 5.6, 7.6]) parts.push({ geometry: pole(2.22, 2.22, 0.2, 12), colour: '#b9b3a8', at: [0, y, 0] });
  const mesh = new THREE.Mesh(mergeParts(parts), plain());
  mesh.position.set(x, heightAt(x, z), z);
  return mesh;
}

function buildWindmill({ x, z }) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(mergeParts([
    { geometry: pole(2, 3, 9.5, 8), colour: '#f4efe2', at: [0, 4.75, 0] },
    { geometry: pole(3.2, 3.2, 0.6, 8), colour: TIMBER, at: [0, 3.3, 0] },
    { geometry: cone(2.5, 2.8, 8), colour: '#a8483f', at: [0, 10.9, 0] },
    { geometry: box(1.2, 2, 0.2), colour: '#7a4b2a', at: [0, 1, 2.82] },
    { geometry: box(0.9, 0.9, 0.2), colour: GLASS, at: [0, 6.2, 2.25] },
  ]), plain()));
  const sails = new THREE.Group();
  sails.position.set(0, 8.6, 2.5);
  const parts = [{ geometry: pole(0.34, 0.34, 0.9, 8).rotateX(Math.PI / 2), colour: '#6a4a2e', at: [0, 0, -0.1] }];
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2;
    const [sin, cos] = [Math.sin(angle), Math.cos(angle)];
    parts.push({ geometry: box(0.24, 7.6, 0.14), colour: '#7a5532', at: [sin * 3.8, cos * 3.8, 0.1], turn: [0, 0, -angle] });
    // The sail, a little to one side of its arm.
    parts.push({ geometry: box(1.6, 5.8, 0.08), colour: '#fff8e8', at: [sin * 4.6 + cos * 0.86, cos * 4.6 - sin * 0.86, 0.14], turn: [0, 0, -angle] });
  }
  sails.add(new THREE.Mesh(mergeParts(parts), plain()));
  group.add(sails);
  group.position.set(x, heightAt(x, z) - 0.1, z);
  group.rotation.y = -0.34;
  return { group, sails };
}

function buildWaterMill({ x, z }) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(mergeParts([
    { geometry: box(7, 3.4, 5.4), colour: '#d9cfbb', at: [0, 1.7, 0] },
    { geometry: box(7.1, 0.5, 5.5), colour: STONE_DARK, at: [0, 0.25, 0] },
    { geometry: prism(7.7, 2.8, 6.4), colour: '#b5573a', at: [0, 3.4, 0] },
    { geometry: box(1.1, 1.1, 0.12), colour: GLASS, at: [-1.8, 2, 2.75] },
    { geometry: box(1.1, 1.1, 0.12), colour: GLASS, at: [1.2, 2, 2.75] },
    { geometry: box(0.3, 3, 0.3), colour: TIMBER, at: [-2.6, 1.4, 3.5] },
    { geometry: box(0.3, 3, 0.3), colour: TIMBER, at: [1.6, 1.4, 3.5] },
  ]), plain()));
  const wheel = new THREE.Group();
  wheel.position.set(-0.5, 1.9, 4.2);
  const parts = [{ geometry: pole(0.3, 0.3, 1.4, 8).rotateX(Math.PI / 2), colour: '#5c4630', at: [0, 0, 0] }];
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    const [sin, cos] = [Math.sin(angle), Math.cos(angle)];
    parts.push({ geometry: box(0.22, 2.3, 0.22), colour: '#8a6239', at: [sin * 1.15, cos * 1.15, 0], turn: [0, 0, -angle] });
    parts.push({ geometry: box(0.9, 0.2, 1.1), colour: '#7a5532', at: [sin * 2.25, cos * 2.25, 0], turn: [0, 0, -angle] });
  }
  wheel.add(new THREE.Mesh(mergeParts(parts), plain()));
  group.add(wheel);
  group.position.set(x, heightAt(x, z) - 0.05, z);
  return { group, wheel };
}

function buildFountain({ x, z }) {
  const parts = [
    { geometry: pole(2.1, 2.3, 0.8, 14), colour: STONE, at: [0, 0.4, 0] },
    { geometry: pole(1.85, 1.85, 0.1, 14), colour: '#6fcff0', at: [0, 0.8, 0] },
    { geometry: pole(0.3, 0.45, 1.8, 8), colour: STONE_DARK, at: [0, 1.5, 0] },
    { geometry: pole(0.95, 0.6, 0.34, 10), colour: STONE, at: [0, 2.45, 0] },
    { geometry: lump(0.24), colour: '#a7e6fa', at: [0, 2.8, 0] },
  ];
  const mesh = new THREE.Mesh(mergeParts(parts), plain());
  mesh.position.set(x, heightAt(x, z) - 0.05, z);
  return mesh;
}

function buildStall({ x, z, paint }) {
  const stripe = ['#ff7d6e', '#7cc4ff', '#ffd23f'][paint % 3];
  const parts = [
    { geometry: box(4.2, 1.1, 2.1), colour: '#b48a58', at: [0, 0.55, 0] },
    { geometry: box(0.16, 2.6, 0.16), colour: TIMBER, at: [-1.95, 1.3, 1] },
    { geometry: box(0.16, 2.6, 0.16), colour: TIMBER, at: [1.95, 1.3, 1] },
    { geometry: box(0.16, 2.6, 0.16), colour: TIMBER, at: [-1.95, 1.3, -1] },
    { geometry: box(0.16, 2.6, 0.16), colour: TIMBER, at: [1.95, 1.3, -1] },
  ];
  for (let i = 0; i < 5; i += 1) parts.push({ geometry: prism(0.92, 0.8, 2.9), colour: i % 2 ? '#fff8e8' : stripe, at: [-1.84 + i * 0.92, 2.6, 0] });
  // What's for sale.
  const goods = ['#ff5a4f', '#ffd23f', '#ff9a3c', '#7bc86c'];
  for (let i = 0; i < 8; i += 1) parts.push({ geometry: lump(0.24, 0), colour: goods[i % 4], at: [-1.6 + (i % 4) * 1.05, 1.24, i < 4 ? 0.45 : -0.4] });
  const mesh = new THREE.Mesh(mergeParts(parts), plain());
  mesh.position.set(x, heightAt(x, z), z);
  return mesh;
}

/* ------------------------------- walls, fences and bridges ------------------------------- */

function wallStones(random) {
  const stones = [];
  for (const wall of WALLS) {
    for (let leg = 0; leg < wall.length - 1; leg += 1) {
      const [ax, az] = wall[leg];
      const [bx, bz] = wall[leg + 1];
      const length = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(-(bz - az), bx - ax);
      const count = Math.ceil(length / 0.95);
      for (let i = 0; i < count; i += 1) {
        const share = (i + 0.5) / count;
        const x = ax + (bx - ax) * share;
        const z = az + (bz - az) * share;
        const ground = heightAt(x, z);
        for (const [high, size] of [[0.32, 1.05], [0.86, 0.9]]) {
          stones.push({
            x: x + between(random, -0.08, 0.08),
            z: z + between(random, -0.08, 0.08),
            y: ground + high,
            yaw: yaw + between(random, -0.12, 0.12),
            sizeX: length / count * size * 1.08,
            sizeY: between(random, 0.5, 0.66),
            sizeZ: between(random, 0.8, 1) * size,
            colour: ['#c9c3b6', '#b9b3a8', '#d6d0c2', '#a9a498'][Math.floor(random() * 4)],
          });
        }
      }
    }
  }
  return stones;
}

function buildMeadowFence() {
  const { x, z, w, d } = MEADOW;
  const parts = [];
  const rail = (ax, az, bx, bz) => {
    const length = Math.hypot(bx - ax, bz - az);
    const count = Math.ceil(length / 2.4);
    const yaw = Math.atan2(-(bz - az), bx - ax);
    for (let i = 0; i <= count; i += 1) {
      const share = i / count;
      parts.push({ geometry: box(0.24, 1.3, 0.24), colour: TIMBER, at: [ax + (bx - ax) * share, 0.65, az + (bz - az) * share] });
    }
    for (const y of [0.55, 1.05]) parts.push({ geometry: box(length, 0.14, 0.12), colour: '#a07c4f', at: [(ax + bx) / 2, y, (az + bz) / 2], turn: [0, yaw, 0] });
  };
  rail(-w / 2, -d / 2, w / 2, -d / 2);
  rail(w / 2, -d / 2, w / 2, d / 2);
  rail(w / 2, d / 2, -w / 2, d / 2);
  rail(-w / 2, d / 2, -w / 2, -d / 2);
  // A little shelter in the corner.
  parts.push({ geometry: box(2.6, 1.6, 2), colour: '#b48a58', at: [-w / 2 + 2, 0.8, -d / 2 + 1.6] });
  parts.push({ geometry: prism(3.1, 1.1, 2.6), colour: '#8a6239', at: [-w / 2 + 2, 1.6, -d / 2 + 1.6] });
  const mesh = new THREE.Mesh(mergeParts(parts), plain());
  mesh.position.set(x, heightAt(x, z), z);
  return mesh;
}

const SHEEP = () => mergeParts([
  { geometry: lump(0.72), colour: '#fbf6ea', at: [0, 0.82, 0], size: [1.15, 0.9, 0.9] },
  { geometry: lump(0.42), colour: '#fffdf6', at: [0.45, 1.1, 0.1] },
  { geometry: lump(0.4), colour: '#fffdf6', at: [-0.4, 1.12, -0.12] },
  { geometry: lump(0.36), colour: '#3a3236', at: [0.95, 1, 0], size: [1.1, 0.95, 0.85] },
  { geometry: box(0.14, 0.6, 0.14), colour: '#3a3236', at: [0.45, 0.3, 0.32] },
  { geometry: box(0.14, 0.6, 0.14), colour: '#3a3236', at: [0.45, 0.3, -0.32] },
  { geometry: box(0.14, 0.6, 0.14), colour: '#3a3236', at: [-0.45, 0.3, 0.32] },
  { geometry: box(0.14, 0.6, 0.14), colour: '#3a3236', at: [-0.45, 0.3, -0.32] },
]);

const COW = () => mergeParts([
  { geometry: box(2, 1.1, 1), colour: '#fbf6ea', at: [0, 1.05, 0] },
  { geometry: box(0.7, 0.8, 1.04), colour: '#3a3236', at: [-0.3, 1.1, 0] },
  { geometry: box(0.72, 0.72, 0.72), colour: '#fbf6ea', at: [1.2, 1.3, 0] },
  { geometry: box(0.4, 0.34, 0.6), colour: '#f2b6b0', at: [1.56, 1.14, 0] },
  { geometry: box(0.2, 0.7, 0.2), colour: '#3a3236', at: [0.75, 0.35, 0.36] },
  { geometry: box(0.2, 0.7, 0.2), colour: '#3a3236', at: [0.75, 0.35, -0.36] },
  { geometry: box(0.2, 0.7, 0.2), colour: '#3a3236', at: [-0.75, 0.35, 0.36] },
  { geometry: box(0.2, 0.7, 0.2), colour: '#3a3236', at: [-0.75, 0.35, -0.36] },
]);

const BALE = () => mergeParts([
  { geometry: pole(1.25, 1.25, 1.9, 14).rotateX(Math.PI / 2), colour: GOLD, at: [0, 1.25, 0] },
  { geometry: pole(0.8, 0.8, 1.95, 14).rotateX(Math.PI / 2), colour: '#dcb648', at: [0, 1.25, 0] },
  { geometry: pole(0.34, 0.34, 2, 10).rotateX(Math.PI / 2), colour: GOLD, at: [0, 1.25, 0] },
]);

const HAYSTACK = () => mergeParts([
  { geometry: pole(1.2, 2, 1.8, 9), colour: GOLD, at: [0, 0.9, 0] },
  { geometry: cone(1.32, 2.2, 9), colour: '#e4bf52', at: [0, 2.9, 0] },
]);

/** A bridge, across the river along its own line. */
function buildBridge(bridge) {
  const { kind, x, z, turn, length, width, rise } = bridge;
  const steps = 14;
  const half = length / 2;
  const arc = (along) => rise * Math.cos((along / half) * (Math.PI / 2)) ** 2;
  const parts = [];
  const stone = kind === 'stone';
  for (let i = 0; i < steps; i += 1) {
    const along = -half + ((i + 0.5) / steps) * length;
    const next = -half + ((i + 1) / steps) * length;
    const last = -half + (i / steps) * length;
    const y = arc(along);
    const tilt = -Math.atan2(arc(next) - arc(last), length / steps);
    const piece = length / steps + 0.08;
    if (stone) {
      parts.push({ geometry: box(width - 0.2, 0.5, piece), colour: '#d6d0c2', at: [0, y - 0.2, along], turn: [tilt, 0, 0] });
      parts.push({ geometry: box(width * 0.42, 0.06, piece), colour: '#e4d9bd', at: [0, y + 0.06, along], turn: [tilt, 0, 0] });
      for (const side of [-1, 1]) {
        parts.push({ geometry: box(0.7, 0.95, piece), colour: i % 2 ? STONE : '#bdb7aa', at: [side * (width / 2 - 0.15), y + 0.36, along], turn: [tilt, 0, 0] });
        // The side of the arch, going down to the water in the middle.
        const fall = Math.max(0.7, 1.2 + y - 0.5);
        parts.push({ geometry: box(0.5, fall, piece), colour: '#b9b3a8', at: [side * (width / 2 - 0.02), y - fall / 2 - 0.1, along], turn: [tilt, 0, 0] });
      }
    } else {
      parts.push({ geometry: box(width - 0.1, 0.26, piece * 0.84), colour: i % 2 ? '#a9794a' : '#b98a58', at: [0, y, along], turn: [tilt, 0, 0] });
      if (i % 2 === 0) {
        for (const side of [-1, 1]) {
          parts.push({ geometry: box(0.3, 1.5, 0.3), colour: TIMBER, at: [side * (width / 2 - 0.2), y + 0.65, along] });
          parts.push({ geometry: box(0.34, 2.6, 0.34), colour: '#5c4630', at: [side * (width / 2 - 0.9), y - 1.1, along] });
        }
      }
      for (const side of [-1, 1]) parts.push({ geometry: box(0.18, 0.16, piece), colour: '#c49a64', at: [side * (width / 2 - 0.2), y + 1.2, along], turn: [tilt, 0, 0] });
    }
  }
  if (stone) {
    for (const along of [-half, half]) {
      for (const side of [-1, 1]) {
        parts.push({ geometry: box(1.05, 1.9, 1.05), colour: '#d6d0c2', at: [side * (width / 2 - 0.15), 0.8, along] });
        parts.push({ geometry: lump(0.5, 0), colour: GOLD, at: [side * (width / 2 - 0.15), 2, along] });
      }
    }
  }
  const mesh = new THREE.Mesh(mergeParts(parts), plain());
  mesh.position.set(x, Math.max(heightAt(x, z), -0.2), z);
  mesh.rotation.y = -turn;
  return mesh;
}

/** The river's surface, with ripples going slowly along it. */
function buildWater(texture) {
  const positions = [];
  const uvs = [];
  const index = [];
  let along = 0;
  const half = RIVER_WIDTH / 2;
  RIVER.forEach(([x, z], i) => {
    const [px, pz] = RIVER[Math.max(0, i - 1)];
    const [nx, nz] = RIVER[Math.min(RIVER.length - 1, i + 1)];
    const size = Math.hypot(nx - px, nz - pz) || 1;
    const ox = (-(nz - pz) / size) * half;
    const oz = ((nx - px) / size) * half;
    if (i) along += Math.hypot(x - RIVER[i - 1][0], z - RIVER[i - 1][1]);
    positions.push(x + ox, heightAt(x + ox, z + oz) + 0.08, z + oz, x - ox, heightAt(x - ox, z - oz) + 0.08, z - oz);
    uvs.push(along / 16, 0, along / 16, 1);
    if (i) {
      const b = i * 2;
      index.push(b - 2, b - 1, b, b, b - 1, b + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
}

function rippleTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const random = seeded(5);
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i += 1) {
    ctx.strokeStyle = i % 3 ? 'rgb(255 255 255 / 0.28)' : 'rgb(20 110 170 / 0.2)';
    ctx.lineWidth = between(random, 1.5, 3.5);
    const x = random() * size;
    const y = 14 + random() * (size - 28);
    const reach = between(random, 18, 46);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + reach / 2, y - 4, x + reach, y);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/* ------------------------------- the fort on the hill ------------------------------- */

function buildFort() {
  const { x, z, y } = FORT_AT;
  const group = new THREE.Group();
  const parts = [];
  const [W, D] = [15, 5]; // Half its width and depth.
  const wall = (cx, cz, wide, deep, high = 4) => {
    parts.push({ geometry: box(wide, high, deep), colour: STONE_DARK, at: [cx, high / 2, cz] });
    const across = wide > deep;
    const span = across ? wide : deep;
    const count = Math.floor(span / 2);
    for (let i = 0; i < count; i += 1) {
      const at = -span / 2 + (i + 0.5) * (span / count);
      parts.push({ geometry: box(across ? 1.05 : wide + 0.2, 0.8, across ? deep + 0.2 : 1.05), colour: STONE, at: [cx + (across ? at : 0), high + 0.32, cz + (across ? 0 : at)] });
    }
  };
  // The gate's wall comes in two parts, with an arch between them.
  wall(-W / 2 - 2.4, D, W - 4.8, 1.5);
  wall(W / 2 + 2.4, D, W - 4.8, 1.5);
  wall(-W, 0, 1.5, D * 2);
  wall(W, 0, 1.5, D * 2);
  wall(0, -D, W * 2, 1.5, 5.4);
  parts.push({ geometry: box(6.6, 5.8, 2), colour: STONE, at: [0, 2.9, D] });
  parts.push({ geometry: box(4.2, 4, 2.2), colour: '#3a2d28', at: [0, 2, D] });
  parts.push({ geometry: box(7, 0.5, 2.4), colour: STONE_DARK, at: [0, 5.9, D] });
  const tower = (tx, tz, tall, radius, roof = '#7f5a7e') => {
    parts.push({ geometry: pole(radius, radius * 1.12, tall, 10), colour: STONE, at: [tx, tall / 2, tz] });
    parts.push({ geometry: pole(radius * 1.2, radius * 1.05, 0.6, 10), colour: STONE_DARK, at: [tx, tall + 0.2, tz] });
    parts.push({ geometry: cone(radius * 1.3, radius * 1.5, 10), colour: roof, at: [tx, tall + 0.5 + radius * 0.75, tz] });
    parts.push({ geometry: box(0.5, 1.2, 0.14), colour: '#3a2d28', at: [tx, tall * 0.66, tz + radius * 0.98] });
  };
  tower(-W, D, 6, 2.2);
  tower(W, D, 6, 2.2);
  // The keep in the middle, which is as high as there's room for at the top of the view.
  parts.push({ geometry: box(11, 5.4, 4.4), colour: STONE, at: [0, 2.7, -1.6] });
  for (let i = 0; i < 6; i += 1) parts.push({ geometry: box(1.05, 0.8, 1.05), colour: STONE_DARK, at: [-4.6 + i * 1.84, 5.7, 0.2] });
  for (const wx of [-3, 0, 3]) parts.push({ geometry: box(0.9, 1.6, 0.14), colour: '#3a2d28', at: [wx, 3.4, 0.64] });
  tower(0, -2, 6.8, 2.2);
  group.add(new THREE.Mesh(mergeParts(parts), plain()));
  group.position.set(x, y - 0.3, z);

  // Its flags, which are the robots' until they've all been stopped.
  const flagGeometry = new THREE.PlaneGeometry(3.2, 1.8, 6, 1).translate(1.6, 0, 0);
  const flags = [[-W, D, 9.2], [W, D, 9.2], [0, -2, 10]].map(([fx, fz, fy], index) => {
    const staff = new THREE.Mesh(box(0.14, 3.6, 0.14), new THREE.MeshLambertMaterial({ color: '#5c4630' }));
    staff.position.set(fx, fy, fz);
    group.add(staff);
    const flag = new THREE.Mesh(flagGeometry, new THREE.MeshBasicMaterial({ color: '#39334f', side: THREE.DoubleSide }));
    flag.position.set(fx + 0.07, fy + 0.8, fz);
    group.add(flag);
    return { flag, phase: index * 1.3 };
  });
  return { group, flags };
}

/* ------------------------------- what's left ------------------------------- */

function buildBalloon(colours) {
  const stripes = 8;
  const parts = [];
  for (let s = 0; s < stripes; s += 1) {
    const slice = new THREE.SphereGeometry(4.2, 8, 8, (s / stripes) * Math.PI * 2, (Math.PI * 2) / stripes);
    parts.push({ geometry: slice, colour: colours[s % colours.length], at: [0, 6.6, 0], size: [1, 1.15, 1] });
  }
  parts.push({ geometry: box(1.5, 1.1, 1.5), colour: '#a07c4f', at: [0, -0.6, 0] });
  for (const [x, z] of [[-0.65, -0.65], [0.65, -0.65], [-0.65, 0.65], [0.65, 0.65]]) parts.push({ geometry: box(0.06, 3.6, 0.06), colour: '#5c4630', at: [x, 1.4, z] });
  return new THREE.Mesh(mergeParts(parts), plain());
}

function buildBoat() {
  return new THREE.Mesh(mergeParts([
    { geometry: box(1.3, 0.5, 3), colour: '#ff7d6e', at: [0, 0.25, 0] },
    { geometry: cone(0.9, 1.5, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4), colour: '#ff7d6e', at: [0, 0.25, 2.2], size: [1, 0.4, 1] },
    { geometry: box(1, 0.1, 2.4), colour: '#fff4e0', at: [0, 0.52, 0] },
    { geometry: box(0.08, 2.6, 0.08), colour: TIMBER, at: [0, 1.7, 0.2] },
    { geometry: prism(1.8, 1.8, 0.06).rotateZ(-Math.PI / 2), colour: '#ffffff', at: [0.04, 2.8, 0.2] },
  ]), plain());
}

const DUCK = () => mergeParts([
  { geometry: lump(0.28), colour: '#fff8e8', at: [0, 0.12, 0], size: [1.3, 0.8, 1] },
  { geometry: lump(0.17), colour: '#3f8f58', at: [0.3, 0.36, 0] },
  { geometry: cone(0.07, 0.2, 4).rotateZ(-Math.PI / 2), colour: '#ff9a3c', at: [0.5, 0.34, 0] },
]);

/** Pumpkins by the barn, a scarecrow in the wheat, a few bee boxes: small things for looking at. */
function buildFarmBits(random) {
  const parts = [];
  for (let i = 0; i < 16; i += 1) {
    const x = 11 + (i % 4) * 1.7 + between(random, -0.3, 0.3);
    const z = 16.5 + Math.floor(i / 4) * 1.6 + between(random, -0.3, 0.3);
    const size = between(random, 0.34, 0.54);
    parts.push({ geometry: new THREE.SphereGeometry(1, 8, 6), colour: '#ff8f2e', at: [x, heightAt(x, z) + size * 0.7, z], size: [size, size * 0.78, size] });
    parts.push({ geometry: box(0.1, 0.24, 0.1), colour: '#5a9c3d', at: [x, heightAt(x, z) + size * 1.3, z] });
  }
  // The scarecrow.
  const [sx, sz] = [24, 21.6];
  const sy = heightAt(sx, sz);
  parts.push(
    { geometry: box(0.2, 3, 0.2), colour: TIMBER, at: [sx, sy + 1.5, sz] },
    { geometry: box(2.2, 0.16, 0.16), colour: TIMBER, at: [sx, sy + 2.2, sz] },
    { geometry: box(1.1, 1.4, 0.5), colour: '#6f8fce', at: [sx, sy + 1.9, sz] },
    { geometry: lump(0.42), colour: '#f0dca8', at: [sx, sy + 3, sz] },
    { geometry: cone(0.66, 0.8, 8), colour: '#a0763f', at: [sx, sy + 3.5, sz] },
  );
  // Bee boxes on the far bank, by the orchard.
  for (let i = 0; i < 3; i += 1) {
    const x = 27.4 + i * 1.3;
    const z = -29.5;
    parts.push({ geometry: box(0.9, 0.9, 0.9), colour: ['#fff4d6', '#ffe08a', '#bfe6ff'][i], at: [x, heightAt(x, z) + 0.5, z] });
    parts.push({ geometry: box(1.05, 0.14, 1.05), colour: '#8a6239', at: [x, heightAt(x, z) + 1, z] });
  }
  // A signpost where the roads meet.
  const [px, pz] = [-1.5, 6.8];
  const py = heightAt(px, pz);
  parts.push(
    { geometry: box(0.18, 2.6, 0.18), colour: TIMBER, at: [px, py + 1.3, pz] },
    { geometry: box(1.9, 0.42, 0.1), colour: '#e7d4a4', at: [px + 0.5, py + 2.2, pz], turn: [0, 0.3, 0] },
    { geometry: box(1.7, 0.42, 0.1), colour: '#d9c28c', at: [px - 0.4, py + 1.68, pz], turn: [0, -0.4, 0] },
  );
  // Lanterns along the street.
  for (const [lx, lz] of [[-29, 15.5], [-18, 15.2], [-29, 21], [-17, 21]]) {
    const ly = heightAt(lx, lz);
    parts.push(
      { geometry: box(0.14, 2.6, 0.14), colour: '#3f4a5c', at: [lx, ly + 1.3, lz] },
      { geometry: lump(0.26, 0), colour: '#ffe28a', at: [lx, ly + 2.7, lz] },
    );
  }
  return new THREE.Mesh(mergeParts(parts), plain());
}

/* ------------------------------- the whole valley ------------------------------- */

export class Valley {
  constructor(scene) {
    this.scene = scene;
    this.spinning = [];
    this.manyOf = [];
    this.time = 0;
    this.moving = { matrix: new THREE.Matrix4(), turn: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0), place: new THREE.Vector3(), size: new THREE.Vector3(1, 1, 1) };
    this.addFloor();
    const random = seeded(777);
    this.addPlants();
    this.addBuildings(random);
    this.addFarm();
    this.addCreatures(random);
    this.addFort();
    this.addSmoke();
    this.addVisitors();
  }

  addFloor() {
    const { left, right, far, near } = PAINTED;
    const wide = right - left;
    const deep = near - far;
    const canvas = document.createElement('canvas');
    const pixels = (navigator.hardwareConcurrency ?? 8) >= 6 ? GROUND_PICTURE_WIDTH : SMALL_GROUND_PICTURE_WIDTH;
    canvas.width = pixels;
    canvas.height = Math.round((pixels * deep) / wide);
    paintGround(canvas);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;

    const geometry = new THREE.PlaneGeometry(wide, deep, 216, 144).rotateX(-Math.PI / 2).translate((left + right) / 2, 0, (far + near) / 2);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) positions.setY(i, heightAt(positions.getX(i), positions.getZ(i)));
    geometry.computeVertexNormals();
    this.floor = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map }));
    this.scene.add(this.floor);

    this.ripples = rippleTexture();
    this.scene.add(buildWater(this.ripples));
    for (const bridge of BRIDGES) this.scene.add(buildBridge(bridge));
  }

  addPlants() {
    const { scene } = this;
    const list = plants();
    const greens = ['#5cb954', '#4faa4d', '#6cc25e', '#46a04b', '#7ccc62', '#3f9a58'];
    const pineGreens = ['#2f7f4f', '#378a53', '#2a7448', '#3f8f58'];
    const autumn = ['#f0a23c', '#e8743b', '#e4c04a', '#d9553f'];
    const leafy = ['#8fd06a', '#a3d96f', '#7cc463'];
    const paint = (items, colours) => items.map((item, index) => ({ ...item, colour: colours[(index * 7 + 3) % colours.length] }));
    const round = paint(list.round, greens);
    this.manyOf.push(
      instanced(scene, ROUND_TREE(), round),
      instanced(scene, ROUND_TREE(), paint(list.autumn, autumn)),
      instanced(scene, PINE(), paint(list.pine, pineGreens)),
      instanced(scene, POPLAR(), paint(list.poplar, ['#4f9f4f', '#5aab56', '#468f4c'])),
      instanced(scene, BIRCH_LEAVES(), paint(list.birch, leafy)),
      instanced(scene, BIRCH_TRUNKS(), list.birch),
      instanced(scene, BUSH(), paint(list.bush, ['#66b85a', '#57a951', '#79c463', '#e8a0c4', '#f4e27a'])),
      instanced(scene, ROCK(), paint(list.rock, ['#a9a49a', '#8f8a82', '#b7b1a6'])),
    );
    instanced(scene, fruitTree('#e8433f'), list.fruit.filter((_, index) => index % 2 === 0));
    instanced(scene, fruitTree('#ff9a2e'), list.fruit.filter((_, index) => index % 2 === 1));
  }

  addBuildings(random) {
    const { scene } = this;
    for (const [kind, shape] of Object.entries(HOUSE_SHAPES)) {
      const houses = [...BUILDINGS, ...FAR_HOUSES].filter((building) => building.kind === kind).map(({ x, z, yaw, paint }) => ({ x, z, y: heightAt(x, z) - 0.05, yaw, paint }));
      instanced(scene, houseWalls(shape), houses.map((house) => ({ ...house, colour: WALL_PAINTS[house.paint] })));
      instanced(scene, houseRoof(shape), houses.map((house) => ({ ...house, colour: ROOF_PAINTS[house.paint] })));
    }
    for (const building of BUILDINGS) {
      if (building.kind === 'church') scene.add(buildChurch(building));
      if (building.kind === 'barn') scene.add(buildBarn(building));
      if (building.kind === 'mill') {
        const mill = buildWaterMill(building);
        scene.add(mill.group);
        this.spinning.push({ part: mill.wheel, axis: 'z', rate: -0.8 });
      }
    }
    for (const thing of THINGS) {
      if (thing.kind === 'silo') scene.add(buildSilo(thing));
      if (thing.kind === 'fountain') scene.add(buildFountain(thing));
      if (thing.kind === 'windmill') {
        const mill = buildWindmill(thing);
        scene.add(mill.group);
        this.spinning.push({ part: mill.sails, axis: 'z', rate: 0.55 });
      }
    }
    const farMill = buildWindmill(FAR_WINDMILL);
    farMill.group.scale.setScalar(0.85);
    scene.add(farMill.group);
    this.spinning.push({ part: farMill.sails, axis: 'z', rate: 0.42 });
    for (const stall of STALLS) scene.add(buildStall(stall));
    instanced(scene, mergeParts([{ geometry: new THREE.DodecahedronGeometry(0.6, 0), colour: '#ffffff', size: [1, 0.8, 0.8] }]), wallStones(random));
  }

  addFarm() {
    const { scene } = this;
    const random = seeded(31);
    instanced(scene, BALE(), BALES.map(({ x, z }) => ({ x, z, y: heightAt(x, z) - 0.05, yaw: between(random, -0.6, 0.6) })));
    instanced(scene, HAYSTACK(), THINGS.filter(({ kind }) => kind === 'haystack').map(({ x, z }) => ({ x, z, y: heightAt(x, z) - 0.05 })));
    scene.add(buildFarmBits(random));
    scene.add(buildMeadowFence());
  }

  /** A few animals, well out of the way behind fences and on the water. Nobody ever shoots at them. */
  addCreatures(random) {
    const { scene } = this;
    const { x, z, w, d } = MEADOW;
    const sheep = [[3.5, -1.6], [0.2, 1.6], [-1.2, -1.2], [4.8, 1.4], [1.8, -0.2]].map(([dx, dz]) => ({
      x: x + dx * (w / 13),
      z: z + dz * (d / 7.5),
      y: heightAt(x + dx, z + dz),
      yaw: random() * 6.3,
      scale: 0.86,
    }));
    this.sheep = instanced(scene, SHEEP(), sheep);
    this.sheepPlaces = sheep;
    instanced(scene, COW(), [
      { x: x - 3.4, z: z + 1.8, y: heightAt(x - 3.4, z + 1.8), yaw: 0.6, scale: 0.86 },
    ]);
    const ducks = Array.from({ length: 5 }, (_, index) => ({ angle: index * 0.55, far: POND.r * (0.45 + (index % 2) * 0.14), rate: 0.1 }));
    this.ducks = ducks;
    this.duckMesh = instanced(scene, DUCK(), ducks.map(() => ({ x: POND.x, z: POND.z, y: 0 })));
    // Reeds by the pond.
    const reeds = [];
    for (let i = 0; i < 26; i += 1) {
      const angle = between(random, 2.2, 5);
      const far = POND.r + between(random, -0.3, 0.7);
      const rx = POND.x + Math.cos(angle) * far;
      const rz = POND.z + Math.sin(angle) * far;
      reeds.push({ x: rx, z: rz, y: heightAt(rx, rz), yaw: random() * 6, scale: between(random, 0.7, 1.2), colour: '#6f9f4f' });
    }
    instanced(scene, mergeParts([
      { geometry: box(0.07, 1.6, 0.07), colour: '#ffffff', at: [0, 0.8, 0] },
      { geometry: box(0.07, 1.2, 0.07), colour: '#f0f0f0', at: [0.18, 0.6, 0.06] },
      { geometry: box(0.13, 0.42, 0.13), colour: '#a0683c', at: [0, 1.5, 0] },
    ]), reeds);
  }

  addFort() {
    const fort = buildFort();
    this.scene.add(fort.group);
    this.flags = fort.flags;
  }

  /** The fort's flags change hands, once the valley's safe again. */
  setFlags(ours) {
    for (const { flag } of this.flags) flag.material.color.set(ours ? '#ffd23f' : '#39334f');
  }

  /** A little smoke from the chimneys, going up slowly. */
  addSmoke() {
    const map = spriteTexture(SHAPES.puff, 96);
    const chimneys = BUILDINGS.filter(({ kind }) => ['cottage', 'tall', 'long'].includes(kind)).slice(0, 6);
    this.smoke = [];
    chimneys.forEach((building, house) => {
      const shape = HOUSE_SHAPES[building.kind];
      const turn = building.yaw;
      const dx = shape.w * 0.26;
      const dz = -shape.d * 0.12;
      const at = {
        x: building.x + dx * Math.cos(turn) + dz * Math.sin(turn),
        z: building.z - dx * Math.sin(turn) + dz * Math.cos(turn),
        y: heightAt(building.x, building.z) + shape.h + shape.roof * 0.8 + 1,
      };
      for (let i = 0; i < 3; i += 1) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: '#f4f1ea', transparent: true, opacity: 0, depthWrite: false }));
        this.scene.add(sprite);
        this.smoke.push({ sprite, at, share: (i / 3 + house * 0.17) % 1 });
      }
    });
  }

  /** Hot-air balloons over the woods, and a little boat on the river. */
  addVisitors() {
    this.balloons = [
      { mesh: buildBalloon(['#ff5a4f', '#ffffff']), x: -15, z: -29, y: 4.5, phase: 0 },
      { mesh: buildBalloon(['#ffd23f', '#ff8f3f']), x: 40, z: -25, y: 7, phase: 2.2 },
    ];
    for (const { mesh } of this.balloons) {
      mesh.scale.setScalar(0.72);
      this.scene.add(mesh);
    }
    this.boat = buildBoat();
    this.boatAlong = 0.2;
    this.scene.add(this.boat);
  }

  /**
   * Only what the camera can see gets drawn, which is a lot less than there is, as the woods go on past
   * the edges of the window to allow for windows of any shape.
   */
  fitTo(camera) {
    this.camera = camera;
    const at = new THREE.Vector3();
    const inView = ({ x, y, z }) => {
      at.set(x, y + 3, z).project(camera);
      return Math.abs(at.x) < 1.12 && Math.abs(at.y) < 1.16;
    };
    for (const mesh of this.manyOf) {
      const seen = mesh.userData.items.filter(inView);
      // Every other one for a slow computer, leaving those in the valley itself.
      placeCopies(mesh, this.fewer ? seen.filter(({ x, z }, index) => index % 2 === 0 || (Math.abs(x) < 46 && Math.abs(z) < 28)) : seen);
    }
  }

  /** A slow computer shows half the trees and rocks, as there are plenty left. */
  showFewer() {
    this.fewer = true;
    if (this.camera) this.fitTo(this.camera);
    for (const { sprite } of this.smoke) sprite.visible = false;
  }

  update(dt, reducedMotion) {
    this.time += dt;
    const { time } = this;
    const pace = reducedMotion ? 0.35 : 1;
    this.ripples.offset.x = (this.ripples.offset.x - dt * 0.05 * pace) % 1;
    for (const { part, axis, rate } of this.spinning) part.rotation[axis] += rate * dt * pace;
    for (const { flag, phase } of this.flags) {
      if (!reducedMotion) flag.rotation.y = Math.sin(time * 1.6 + phase) * 0.2;
    }
    for (const puff of this.smoke) {
      puff.share = (puff.share + dt * 0.11 * pace) % 1;
      const { share, sprite, at } = puff;
      const size = 0.7 + share * 2.6;
      sprite.scale.set(size, size, 1);
      sprite.position.set(at.x + share * 1.6, at.y + share * 6, at.z - share * 0.8);
      sprite.material.opacity = 0.5 * Math.min(1, share * 6) * (1 - share);
    }
    const { matrix, turn, up, place, size } = this.moving;
    this.ducks.forEach((duck, index) => {
      duck.angle += duck.rate * dt * pace;
      place.set(POND.x + Math.cos(duck.angle) * duck.far, heightAt(POND.x, POND.z) + 0.1, POND.z + Math.sin(duck.angle) * duck.far);
      turn.setFromAxisAngle(up, -duck.angle - Math.PI / 2);
      size.setScalar(1.15);
      this.duckMesh.setMatrixAt(index, matrix.compose(place, turn, size));
    });
    this.duckMesh.instanceMatrix.needsUpdate = true;
    // The sheep nod at the grass, one after another.
    size.setScalar(0.86);
    this.sheepPlaces.forEach(({ x, y, z, yaw }, index) => {
      const nod = reducedMotion ? 0 : Math.max(0, Math.sin(time * 0.8 + index * 1.7)) * 0.05;
      place.set(x, y - nod, z);
      turn.setFromAxisAngle(up, yaw);
      this.sheep.setMatrixAt(index, matrix.compose(place, turn, size));
    });
    this.sheep.instanceMatrix.needsUpdate = true;
    for (const { mesh, x, y, z, phase } of this.balloons) mesh.position.set(x + Math.sin(time * 0.05 + phase) * 9, y + Math.sin(time * 0.2 + phase) * 1.6 * pace, z + Math.cos(time * 0.04 + phase) * 5);
    // The boat goes slowly down the river, and starts again from the top.
    this.boatAlong = (this.boatAlong + dt * 0.0028 * pace) % 1;
    const stops = RIVER.length - 1;
    const at = this.boatAlong * stops;
    const from = Math.floor(at);
    const [ax, az] = RIVER[from];
    const [bx, bz] = RIVER[Math.min(stops, from + 1)];
    const share = at - from;
    this.boat.position.set(ax + (bx - ax) * share, heightAt(ax, az) + 0.1, az + (bz - az) * share + 1);
    this.boat.rotation.y = Math.atan2(bx - ax, bz - az);
  }
}
