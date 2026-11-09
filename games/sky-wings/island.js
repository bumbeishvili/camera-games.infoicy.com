// The island the planes fly over: its land and sea, and a lot to look at. Volcano, castle, town,
// harbour, fair, farms, lighthouse, ships, balloons and thousands of trees. Things there are many of
// share one instanced mesh, so it stays quick to draw, and a slow computer can show fewer of them.
//
// Nothing flashes: seizures are more common in children with hemiplegia. Clouds fade away as a plane
// gets near them, so that flying through one can't suddenly fill the picture with white.
import * as THREE from '../../vendor/three/three.module.js';
import { Fighter3D, makePose, mergeParts } from '../../core/body/characters.js';
import { byId } from '../../core/body/roster.js';
import { SHAPES, spriteTexture } from '../../core/body/sparks.js';
import { ISLETS, PLACES, RIVER, VOLCANO_TOP, WORLD, bumps, coastAt, heightAt } from './island-map.js';

const LAND_SIZE = 2500;
const LAND_CELLS = 250;
const CLOUDS = 70;
const CLOUD_WALL = 44;
const CLOUD_FADE = { from: 70, to: 190 };

const between = (random, low, high) => low + random() * (high - low);
const blend = (from, to, share) => new THREE.Color(from).lerp(new THREE.Color(to), Math.min(1, Math.max(0, share)));

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const plain = (options = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...options });
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cone = (radius, height, sides = 6) => new THREE.ConeGeometry(radius, height, sides);
const pole = (top, bottom, height, sides = 6) => new THREE.CylinderGeometry(top, bottom, height, sides);
const lump = (radius, detail = 1) => new THREE.IcosahedronGeometry(radius, detail);

/* ------------------------------- the land and the sea ------------------------------- */

function groundColour(x, z, height) {
  const patch = bumps(x / 55 + 40, z / 55 + 12);
  if (height < -12) return blend('#1b7fb6', '#2aa6cf', (height + 34) / 22);
  if (height < -0.5) return blend('#2aa6cf', '#a6e8d8', (height + 12) / 11.5);
  if (height < 2.6) return new THREE.Color('#f4e5b5').lerp(new THREE.Color('#ead59b'), patch);
  if (height < 5) return blend('#e6dca0', '#9ddc70', (height - 2.6) / 2.4);
  if (height < 34) return blend(patch > 0.5 ? '#74c65a' : '#9bdd6f', '#5cb24f', (height - 5) / 40 + (patch - 0.5));
  if (height < 80) return blend('#58a84e', '#7b9560', (height - 34) / 46);
  if (height < 128) return blend('#7b9560', '#7e7268', (height - 80) / 48);
  return blend('#7e7268', '#4a3f3c', (height - 128) / 40);
}

function buildLand() {
  const geometry = new THREE.PlaneGeometry(LAND_SIZE, LAND_SIZE, LAND_CELLS, LAND_CELLS).rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colours = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const height = heightAt(x, z);
    positions.setY(i, height);
    const colour = groundColour(x, z, height);
    colours[i * 3] = colour.r;
    colours[i * 3 + 1] = colour.g;
    colours[i * 3 + 2] = colour.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, plain());
}

function rippleTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1f9bd8';
  ctx.fillRect(0, 0, size, size);
  const random = seededRandom(5);
  ctx.lineCap = 'round';
  for (let i = 0; i < 90; i += 1) {
    ctx.strokeStyle = i % 3 ? 'rgba(255,255,255,0.14)' : 'rgba(10,90,150,0.2)';
    ctx.lineWidth = between(random, 1.5, 3.5);
    const x = random() * size;
    const y = random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 12, y - 5, x + between(random, 18, 40), y);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(70, 70);
  texture.anisotropy = 4;
  return texture;
}

// The sky's colours, from the top down, for each time of day the levels bring. They're no darker than
// the day's overall, and the sky only ever changes between flights, never during one.
export const SKIES = {
  day: { top: '#2f86dc', middle: '#8fd0f7', horizon: '#dff4ff' },
  sunset: { top: '#5c7fd6', middle: '#ffb38a', horizon: '#ffe3b5' },
  snow: { top: '#7ea9d6', middle: '#c3dbef', horizon: '#eef4fa' },
};

function paintDome(geometry, { top, middle, horizon }) {
  const positions = geometry.attributes.position;
  const colours = geometry.attributes.color?.array ?? new Float32Array(positions.count * 3);
  const high = new THREE.Color(top);
  const mid = new THREE.Color(middle);
  const low = new THREE.Color(horizon);
  const colour = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const up = positions.getY(i) / 2700;
    if (up < 0.04) colour.copy(low);
    else if (up < 0.32) colour.copy(low).lerp(mid, (up - 0.04) / 0.28);
    else colour.copy(mid).lerp(high, Math.min(1, (up - 0.32) / 0.5));
    colours[i * 3] = colour.r;
    colours[i * 3 + 1] = colour.g;
    colours[i * 3 + 2] = colour.b;
  }
  if (geometry.attributes.color) geometry.attributes.color.needsUpdate = true;
  else geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
}

/** The sky all round, which goes with the camera, so that it tilts as the plane does. */
function buildSkyDome() {
  const geometry = new THREE.SphereGeometry(2700, 32, 18);
  paintDome(geometry, SKIES.day);
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

/* ------------------------------- things there are many of ------------------------------- */

const PALM = () => {
  const parts = [
    { geometry: pole(0.34, 0.55, 8, 5), colour: '#a07c4f', at: [0, 4, 0], turn: [0, 0, 0.08] },
    { geometry: pole(0.24, 0.36, 6, 5), colour: '#94724a', at: [-0.4, 10.2, 0], turn: [0, 0, 0.18] },
  ];
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    parts.push({
      geometry: cone(1.1, 6.4, 4),
      colour: i % 2 ? '#3fa94f' : '#57bb56',
      at: [-1 + Math.cos(angle) * 2.5, 12.2, Math.sin(angle) * 2.5],
      turn: [Math.sin(angle) * 1.75, 0, -Math.cos(angle) * 1.75],
      size: [1, 1, 0.3],
    });
  }
  return mergeParts(parts);
};

const ROUND_TREE = () => mergeParts([
  { geometry: pole(0.55, 0.9, 5, 5), colour: '#8a6239', at: [0, 2.5, 0] },
  { geometry: lump(4.4), colour: '#ffffff', at: [0, 8, 0], size: [1, 0.92, 1] },
  { geometry: lump(2.8), colour: '#f2f2f2', at: [2.6, 6.3, 0.9] },
  { geometry: lump(2.6), colour: '#e8e8e8', at: [-2.5, 6.6, -1] },
]);

const PINE = () => mergeParts([
  { geometry: pole(0.45, 0.8, 4, 5), colour: '#7a5532', at: [0, 2, 0] },
  { geometry: cone(4.4, 7, 7), colour: '#ffffff', at: [0, 6.2, 0] },
  { geometry: cone(3.4, 6, 7), colour: '#f0f0f0', at: [0, 9.8, 0] },
  { geometry: cone(2.3, 5, 7), colour: '#e4e4e4', at: [0, 13, 0] },
]);

const ROCK = () => mergeParts([{ geometry: new THREE.DodecahedronGeometry(3, 0), colour: '#ffffff', size: [1.2, 0.7, 1] }]);

const WALLS = () => mergeParts([
  { geometry: box(9, 7, 8), colour: '#ffffff', at: [0, 3.5, 0] },
  { geometry: box(2, 3.8, 0.3), colour: '#6a4a2e', at: [0, 1.9, 4.05] },
  { geometry: box(1.8, 1.8, 0.3), colour: '#74c6ea', at: [-3, 4.4, 4.05] },
  { geometry: box(1.8, 1.8, 0.3), colour: '#74c6ea', at: [3, 4.4, 4.05] },
  { geometry: box(0.3, 1.8, 1.8), colour: '#74c6ea', at: [4.55, 4.4, 0] },
  { geometry: box(0.3, 1.8, 1.8), colour: '#74c6ea', at: [-4.55, 4.4, 0] },
]);

const ROOF = () => {
  const geometry = new THREE.ConeGeometry(7.4, 4.6, 4).rotateY(Math.PI / 4);
  return mergeParts([
    { geometry, colour: '#ffffff', at: [0, 9.3, 0], size: [1, 1, 0.9] },
    { geometry: box(1.2, 3, 1.2), colour: '#b1aaa0', at: [2.6, 10.4, 0.6] },
  ]);
};

const STALL = () => mergeParts([
  { geometry: box(6, 2.6, 4), colour: '#c49a64', at: [0, 1.3, 0] },
  { geometry: cone(5.2, 3, 4).rotateY(Math.PI / 4), colour: '#ffffff', at: [0, 4.1, 0], size: [1, 1, 0.75] },
]);

const BOAT = () => mergeParts([
  { geometry: box(3.6, 1.8, 11), colour: '#ffffff', at: [0, 0.9, 0] },
  { geometry: cone(2.2, 4, 4).rotateX(-Math.PI / 2).rotateY(Math.PI / 4), colour: '#ffffff', at: [0, 0.9, -6.6], size: [1.15, 0.6, 1] },
  { geometry: box(0.3, 9, 0.3), colour: '#6a4a2e', at: [0, 6, 0] },
  { geometry: cone(2.9, 7.2, 3).rotateY(Math.PI / 6), colour: '#fff6e0', at: [0.5, 6.6, 0.4], size: [0.3, 1, 1] },
]);

const FIELD = () => mergeParts([{ geometry: box(1, 0.5, 1), colour: '#ffffff' }]);

function instanced(scene, geometry, items, { lessOf = false } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, plain(), items.length);
  const matrix = new THREE.Matrix4();
  const place = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const size = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  items.forEach(({ x, y, z, scale = 1, sizeX = scale, sizeY = scale, sizeZ = scale, yaw = 0, colour = '#ffffff' }, index) => {
    place.set(x, y, z);
    turn.setFromAxisAngle(up, yaw);
    size.set(sizeX, sizeY, sizeZ);
    mesh.setMatrixAt(index, matrix.compose(place, turn, size));
    mesh.setColorAt(index, new THREE.Color(colour));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.lessOf = lessOf;
  scene.add(mesh);
  return mesh;
}

/* ------------------------------- things there's only one of ------------------------------- */

function buildCastle() {
  const { x, z, height } = PLACES.castle;
  const stone = '#b9b3a8';
  const dark = '#9c958a';
  const parts = [];
  const tower = (tx, tz, tall, radius = 5.5) => {
    parts.push({ geometry: pole(radius, radius * 1.1, tall, 9), colour: stone, at: [tx, tall / 2, tz] });
    parts.push({ geometry: cone(radius * 1.35, radius * 1.6, 9), colour: '#c6463f', at: [tx, tall + radius * 0.8, tz] });
    parts.push({ geometry: pole(0.25, 0.25, 7, 4), colour: '#6a4a2e', at: [tx, tall + radius * 1.6 + 3, tz] });
    parts.push({ geometry: box(4.4, 2.4, 0.3), colour: '#ffd23f', at: [tx + 2.2, tall + radius * 1.6 + 5, tz] });
  };
  for (const [wx, wz, wide, deep] of [[0, -26, 52, 4], [0, 26, 52, 4], [-26, 0, 4, 52], [26, 0, 4, 52]]) {
    parts.push({ geometry: box(wide, 11, deep), colour: dark, at: [wx, 5.5, wz] });
    for (let i = -2; i <= 2; i += 1) {
      const along = i * 10;
      parts.push({ geometry: box(wide > deep ? 4 : 4.6, 2.4, wide > deep ? 4.6 : 4), colour: stone, at: [wx + (wide > deep ? along : 0), 12, wz + (wide > deep ? 0 : along)] });
    }
  }
  for (const [tx, tz] of [[-26, -26], [26, -26], [-26, 26], [26, 26]]) tower(tx, tz, 20);
  parts.push({ geometry: box(24, 22, 22), colour: stone, at: [0, 11, 0] });
  tower(0, 0, 36, 7);
  tower(-10, 9, 28, 4);
  parts.push({ geometry: box(8, 8, 1), colour: '#5c3a22', at: [0, 4, 26.5] });
  const mesh = new THREE.Mesh(mergeParts(parts), plain());
  mesh.position.set(x, height - 0.5, z);
  mesh.rotation.y = 0.5;
  return mesh;
}

function buildLighthouse(at) {
  const parts = [];
  const bands = 6;
  for (let i = 0; i < bands; i += 1) {
    const low = 7.4 - (i / bands) * 3;
    const high = 7.4 - ((i + 1) / bands) * 3;
    parts.push({ geometry: pole(high, low, 8, 12), colour: i % 2 ? '#ffffff' : '#d9443c', at: [0, 4 + i * 8, 0] });
  }
  parts.push({ geometry: pole(5.8, 5.8, 1.2, 12), colour: '#2f3b47', at: [0, 48.6, 0] });
  parts.push({ geometry: pole(3.2, 3.2, 5, 12), colour: '#ffe58a', at: [0, 51.7, 0] });
  parts.push({ geometry: cone(4.2, 4, 12), colour: '#d9443c', at: [0, 56.2, 0] });
  const mesh = new THREE.Mesh(mergeParts(parts), plain());
  mesh.position.set(at.x, Math.max(heightAt(at.x, at.z), 1) - 0.5, at.z);
  return mesh;
}

function buildWindmill(x, z) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(mergeParts([
    { geometry: pole(3.2, 5, 16, 8), colour: '#f4efe2', at: [0, 8, 0] },
    { geometry: cone(3.9, 4, 8), colour: '#a8483f', at: [0, 18, 0] },
  ]), plain());
  group.add(body);
  const blades = new THREE.Group();
  blades.position.set(0, 15, 4.2);
  const bladePaint = mergeParts([0, 1, 2, 3].map((i) => {
    const angle = (i / 4) * Math.PI * 2;
    return { geometry: box(2.4, 12, 0.3), colour: '#fff8e8', at: [Math.sin(angle) * 6.5, Math.cos(angle) * 6.5, 0], turn: [0, 0, -angle] };
  }));
  blades.add(new THREE.Mesh(bladePaint, plain()));
  group.add(blades);
  group.position.set(x, heightAt(x, z) - 0.4, z);
  group.rotation.y = Math.atan2(-x, 240 - z);
  return { group, blades };
}

/** A big wheel at the fair, which goes slowly round. */
function buildBigWheel(x, z) {
  const group = new THREE.Group();
  const stand = new THREE.Mesh(mergeParts([
    { geometry: box(1.6, 36, 1.6), colour: '#d9443c', at: [0, 17.5, 5], turn: [-0.28, 0, 0] },
    { geometry: box(1.6, 36, 1.6), colour: '#d9443c', at: [0, 17.5, -5], turn: [0.28, 0, 0] },
  ]), plain());
  group.add(stand);
  const wheel = new THREE.Group();
  wheel.position.y = 34;
  const parts = [];
  const seats = ['#ff5a4f', '#ffd23f', '#3b82f6', '#27c96b', '#a855f7', '#ff8f3f'];
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    parts.push({ geometry: box(0.5, 24, 0.5), colour: '#f4f1e8', at: [Math.sin(angle) * 12, Math.cos(angle) * 12, 0], turn: [0, 0, -angle] });
    parts.push({ geometry: box(3.2, 3.2, 3.2), colour: seats[i % seats.length], at: [Math.sin(angle) * 24, Math.cos(angle) * 24, 0] });
    const next = ((i + 0.5) / 12) * Math.PI * 2;
    parts.push({ geometry: box(0.7, 12.4, 0.7), colour: '#ffd23f', at: [Math.sin(next) * 23.5, Math.cos(next) * 23.5, 0], turn: [0, 0, -next + Math.PI / 2] });
  }
  wheel.add(new THREE.Mesh(mergeParts(parts), plain()));
  group.add(wheel);
  group.position.set(x, heightAt(x, z), z);
  group.rotation.y = 0.8;
  return { group, wheel };
}

function buildChurch(x, z) {
  const mesh = new THREE.Mesh(mergeParts([
    { geometry: box(14, 12, 24), colour: '#f4efe2', at: [0, 6, 0] },
    { geometry: new THREE.ConeGeometry(11, 7, 4).rotateY(Math.PI / 4), colour: '#a8483f', at: [0, 15.5, 0], size: [0.9, 1, 1.55] },
    { geometry: box(8, 26, 8), colour: '#efe8d8', at: [0, 13, 14] },
    { geometry: cone(6.2, 12, 4).rotateY(Math.PI / 4), colour: '#7f3f38', at: [0, 32, 14] },
  ]), plain());
  mesh.position.set(x, heightAt(x, z) - 0.3, z);
  mesh.rotation.y = 0.2;
  return mesh;
}

function buildTents(random, centre) {
  const parts = [];
  const colours = ['#ff5a4f', '#ffd23f', '#3b82f6', '#a855f7', '#27c96b'];
  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2 + 0.4;
    const far = between(random, 30, 62);
    const x = Math.cos(angle) * far;
    const z = Math.sin(angle) * far;
    const wide = between(random, 7, 11);
    const stripes = 8;
    parts.push({ geometry: pole(wide, wide, 5, 16), colour: '#fff8e8', at: [x, 2.5, z] });
    for (let s = 0; s < stripes; s += 1) {
      const slice = new THREE.ConeGeometry(wide * 1.12, wide * 0.9, 3, 1, false, (s / stripes) * Math.PI * 2, (Math.PI * 2) / stripes);
      parts.push({ geometry: slice, colour: s % 2 ? colours[i % colours.length] : '#ffffff', at: [x, 5 + wide * 0.45, z] });
    }
  }
  const mesh = new THREE.Mesh(mergeParts(parts), plain({ side: THREE.DoubleSide }));
  mesh.position.set(centre.x, heightAt(centre.x, centre.z), centre.z);
  return mesh;
}

/** A pier going out from the coast, and a harbour wall. */
function buildPier(from, angle) {
  const parts = [];
  const along = [Math.cos(angle), Math.sin(angle)];
  const across = [-along[1], along[0]];
  for (const [offset, length] of [[-30, 80], [0, 110], [30, 70]]) {
    for (let i = 0; i <= length / 10; i += 1) {
      const x = from.x + across[0] * offset + along[0] * (i * 10 - 6);
      const z = from.z + across[1] * offset + along[1] * (i * 10 - 6);
      parts.push({ geometry: box(7, 1.2, 11), colour: '#b48a58', at: [x, 3, z], turn: [0, -angle + Math.PI / 2, 0] });
      if (i % 2 === 0) parts.push({ geometry: pole(0.5, 0.5, 8, 5), colour: '#7a5532', at: [x + across[0] * 3, 1, z + across[1] * 3] });
    }
  }
  parts.push({ geometry: box(6, 7, 8), colour: '#f4e3b1', at: [from.x + along[0] * 20, 7, from.z + along[1] * 20] });
  return new THREE.Mesh(mergeParts(parts), plain());
}

function buildRibbon(points, width, colour, lift, { followLand = true } = {}) {
  const smoothed = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z))).getPoints(points.length * 14);
  const positions = [];
  const paint = new THREE.Color(colour);
  const colours = [];
  const edgeAt = (index) => {
    const at = smoothed[index];
    const before = smoothed[Math.max(0, index - 1)];
    const after = smoothed[Math.min(smoothed.length - 1, index + 1)];
    const dx = after.x - before.x;
    const dz = after.z - before.z;
    const size = Math.hypot(dx, dz) || 1;
    const ox = (-dz / size) * width * 0.5;
    const oz = (dx / size) * width * 0.5;
    const heightOf = (x, z) => (followLand ? Math.max(heightAt(x, z), 0.2) : 0) + lift;
    return [
      [at.x + ox, heightOf(at.x + ox, at.z + oz), at.z + oz],
      [at.x - ox, heightOf(at.x - ox, at.z - oz), at.z - oz],
    ];
  };
  for (let i = 0; i < smoothed.length - 1; i += 1) {
    const [a, b] = edgeAt(i);
    const [c, d] = edgeAt(i + 1);
    positions.push(...a, ...b, ...c, ...b, ...d, ...c);
    for (let v = 0; v < 6; v += 1) colours.push(paint.r, paint.g, paint.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, plain({ side: THREE.DoubleSide }));
}

function buildBalloon(colours) {
  const group = new THREE.Group();
  const stripes = 8;
  const parts = [];
  for (let s = 0; s < stripes; s += 1) {
    const slice = new THREE.SphereGeometry(9, 8, 8, (s / stripes) * Math.PI * 2, (Math.PI * 2) / stripes);
    parts.push({ geometry: slice, colour: colours[s % colours.length], at: [0, 12, 0], size: [1, 1.15, 1] });
  }
  parts.push({ geometry: box(4, 3, 4), colour: '#a07c4f', at: [0, -1.5, 0] });
  for (const [x, z] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) {
    parts.push({ geometry: box(0.15, 8, 0.15), colour: '#5c4630', at: [x, 3, z] });
  }
  group.add(new THREE.Mesh(mergeParts(parts), plain()));
  return group;
}

function buildShip(random) {
  const group = new THREE.Group();
  const hull = ['#7a3b2e', '#2f4b6e', '#3f6b4f', '#8a5a2b'][Math.floor(random() * 4)];
  const parts = [
    { geometry: box(9, 5, 34), colour: hull, at: [0, 2, 0] },
    { geometry: cone(6.4, 10, 4).rotateX(-Math.PI / 2).rotateY(Math.PI / 4), colour: hull, at: [0, 2, -21], size: [1, 0.55, 1] },
    { geometry: box(8, 3, 12), colour: '#b48a58', at: [0, 6, 10] },
  ];
  for (const [z, tall] of [[-8, 26], [6, 22]]) {
    parts.push({ geometry: pole(0.4, 0.5, tall, 5), colour: '#6a4a2e', at: [0, 4 + tall / 2, z] });
    parts.push({ geometry: box(12, tall * 0.55, 0.4), colour: '#fff6e0', at: [0, 4 + tall * 0.6, z] });
  }
  group.add(new THREE.Mesh(mergeParts(parts), plain()));
  return group;
}

/* ------------------------------- the whole island ------------------------------- */

export class Island {
  constructor(scene) {
    this.scene = scene;
    this.manyOf = [];
    this.spinning = [];
    this.time = 0;
    const random = seededRandom(20261107);

    scene.add(buildLand());
    this.water = rippleTexture();
    const sea = new THREE.Mesh(new THREE.CircleGeometry(5200, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: this.water, transparent: true, opacity: 0.74 }));
    sea.position.y = 0;
    scene.add(sea);
    const deep = new THREE.Mesh(new THREE.CircleGeometry(5200, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1a78b2' }));
    deep.position.y = -36;
    scene.add(deep);
    this.dome = buildSkyDome();
    this.skyName = 'day';
    scene.add(this.dome);

    scene.add(buildRibbon(RIVER, 15, '#46b3e8', 0.7));
    this.addPlaces(random);
    this.addTrees(random);
    this.addShips(random);
    this.addBalloons(random);
    this.addClouds(random);
    this.addSmoke();
  }

  /* ---------- places ---------- */

  addPlaces(random) {
    const { scene, spinning } = this;
    scene.add(buildCastle());

    // The town, on a grid round a square, with a giant Joze in the middle of it.
    const { town, fair, farm } = PLACES;
    const walls = ['#fff1d6', '#ffe0b8', '#f7d3c4', '#e7efd6', '#f4e3b1', '#ffffff'];
    const roofs = ['#d9534f', '#c9683d', '#a8483f', '#4f7fb5', '#b5573a', '#7f5a9e'];
    const houses = [];
    for (let row = -5; row <= 5; row += 1) {
      for (let column = -6; column <= 6; column += 1) {
        const x = town.x + column * 15 + (row % 2 ? 6 : 0) + between(random, -1.5, 1.5);
        const z = town.z + row * 15 + between(random, -1.5, 1.5);
        const fromSquare = Math.hypot(x - town.x, z - town.z);
        if (fromSquare < 30 || fromSquare > town.radius * 0.86 || random() < 0.16) continue;
        if (Math.abs(row) === 2 && random() < 0.5) continue;
        houses.push({ x, z, y: heightAt(x, z) - 0.2, yaw: between(random, -0.15, 0.15) + (column % 2 ? 0 : Math.PI), scale: between(random, 0.82, 1.2) });
      }
    }
    // Houses dotted about the rest of the island.
    for (let i = 0; i < 70; i += 1) {
      const angle = random() * Math.PI * 2;
      const far = between(random, 90, 460);
      const x = Math.cos(angle) * far;
      const z = Math.sin(angle) * far;
      const height = heightAt(x, z);
      if (height < 5 || height > 42) continue;
      houses.push({ x, z, y: height - 0.3, yaw: random() * Math.PI, scale: between(random, 0.75, 1.1) });
    }
    instanced(scene, WALLS(), houses.map((house, index) => ({ ...house, colour: walls[index % walls.length] })));
    instanced(scene, ROOF(), houses.map((house, index) => ({ ...house, colour: roofs[(index * 7) % roofs.length] })));
    scene.add(buildChurch(town.x - 46, town.z - 40));

    this.statue = new Fighter3D(byId('joze'));
    this.statue.setPose(makePose());
    this.statue.update(0.5);
    this.statue.root.scale.setScalar(13);
    this.statue.root.position.set(town.x, town.height - 0.2, town.z);
    this.statue.faceTowards(0.2);
    scene.add(this.statue.root);

    const stalls = [];
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      const x = town.x + Math.cos(angle) * 24;
      const z = town.z + Math.sin(angle) * 24;
      stalls.push({ x, z, y: heightAt(x, z), yaw: -angle, colour: ['#ff7d6e', '#7cc4ff', '#ffd23f', '#8fd98a'][i % 4] });
    }
    instanced(scene, STALL(), stalls);

    // The fair.
    scene.add(buildTents(random, fair));
    const bigWheel = buildBigWheel(fair.x, fair.z);
    scene.add(bigWheel.group);
    spinning.push({ part: bigWheel.wheel, axis: 'z', rate: 0.14 });

    // The farms: a patchwork of fields, with windmills.
    const fields = [];
    const crops = ['#e8cf5a', '#d9b84a', '#a8d65f', '#7fc65a', '#c49a5c', '#f0dc7a', '#93cf62'];
    for (let row = -3; row <= 3; row += 1) {
      for (let column = -3; column <= 3; column += 1) {
        const x = farm.x + column * 30 + between(random, -3, 3);
        const z = farm.z + row * 30 + between(random, -3, 3);
        if (Math.hypot(x - farm.x, z - farm.z) > farm.radius * 0.8) continue;
        fields.push({ x, z, y: heightAt(x, z) + 0.5, sizeX: between(random, 22, 29), sizeZ: between(random, 22, 29), sizeY: 1, yaw: 0.12, colour: crops[Math.floor(random() * crops.length)] });
      }
    }
    instanced(scene, FIELD(), fields);
    for (const [x, z] of [[farm.x - 60, farm.z - 72], [farm.x + 72, farm.z - 62], [farm.x + 10, farm.z + 92]]) {
      const windmill = buildWindmill(x, z);
      scene.add(windmill.group);
      spinning.push({ part: windmill.blades, axis: 'z', rate: 0.7 });
    }

    // Roads between them all.
    const south = coastAt(Math.PI / 2 - 0.06);
    const roads = [
      [[town.x, town.z], [160, 210], [PLACES.castle.x - 30, PLACES.castle.z + 60], [300, -40], [fair.x, fair.z + 40]],
      [[town.x - 30, town.z], [-60, 215], [-180, 190], [farm.x + 60, farm.z]],
      [[town.x + 10, town.z + 40], [south.x, south.z - 14]],
      [[fair.x - 50, fair.z], [80, -160], [-30, -30], [town.x, town.z - 40]],
    ];
    for (const road of roads) scene.add(buildRibbon(road, 7.5, '#dcc79c', 1));
    // A stone bridge where the road crosses the river.
    const bridge = new THREE.Mesh(mergeParts([{ geometry: box(30, 2.4, 11), colour: '#b9b3a8' }]), plain());
    bridge.position.set(-74, 4, 212);
    bridge.rotation.y = 0.06;
    scene.add(bridge);

    // The harbour.
    scene.add(buildPier(south, Math.PI / 2));
    const boats = [];
    const boatPaints = ['#ff7d6e', '#ffffff', '#7cc4ff', '#ffd23f', '#8fd98a', '#ff8f3f'];
    for (let i = 0; i < 18; i += 1) {
      const row = i % 3;
      boats.push({
        x: south.x + (row - 1) * 30 + (i % 2 ? 9 : -9),
        z: south.z + 22 + i * 4.6,
        y: 0.1,
        yaw: between(random, -0.4, 0.4) + Math.PI / 2,
        scale: between(random, 0.75, 1.1),
        colour: boatPaints[i % boatPaints.length],
      });
    }
    instanced(scene, BOAT(), boats);

    // A lighthouse on a point, and another out on an islet.
    scene.add(buildLighthouse(coastAt(0.75)));
    const [{ x: isletX, z: isletZ }] = ISLETS;
    scene.add(buildLighthouse({ x: isletX, z: isletZ }));
  }

  /* ---------- trees and rocks ---------- */

  addTrees(random) {
    const { scene } = this;
    const roadsAndPlaces = Object.values(PLACES);
    const inAPlace = (x, z, room = 0) => roadsAndPlaces.some(({ x: px, z: pz, radius }) => Math.hypot(x - px, z - pz) < radius * 0.92 + room);
    const palms = [];
    const round = [];
    const pines = [];
    const rocks = [];
    const span = LAND_SIZE * 0.49;
    const greens = ['#5cb954', '#4faa4d', '#6cc25e', '#46a04b', '#7ccc62', '#3f9a58'];
    const pineGreens = ['#2f7f4f', '#378a53', '#2a7448', '#3f8f58'];

    for (let i = 0; i < 26000; i += 1) {
      const x = between(random, -span, span);
      const z = between(random, -span, span);
      const height = heightAt(x, z);
      if (height < 1 || inAPlace(x, z)) continue;
      const patch = bumps(x / 95 + 21, z / 95 + 3);
      if (height < 7) {
        if (palms.length < 420 && random() < 0.13) palms.push({ x, z, y: height - 0.3, yaw: random() * 6.3, scale: between(random, 0.85, 1.35) });
      } else if (height < 52) {
        if (patch > 0.46 && round.length < 1500 && random() < 0.34) {
          round.push({ x, z, y: height - 0.4, yaw: random() * 6.3, scale: between(random, 0.8, 1.5), colour: greens[Math.floor(random() * greens.length)] });
        } else if (patch > 0.58 && pines.length < 800 && random() < 0.16) {
          pines.push({ x, z, y: height - 0.4, yaw: random() * 6.3, scale: between(random, 0.8, 1.35), colour: pineGreens[Math.floor(random() * pineGreens.length)] });
        }
      } else if (height < 105) {
        if (pines.length < 800 && random() < 0.2) {
          pines.push({ x, z, y: height - 0.4, yaw: random() * 6.3, scale: between(random, 0.7, 1.15), colour: pineGreens[Math.floor(random() * pineGreens.length)] });
        }
      }
      if (rocks.length < 320 && random() < (height > 80 ? 0.05 : 0.008)) {
        rocks.push({ x, z, y: height, yaw: random() * 6.3, scale: between(random, 0.7, 2.2), colour: ['#a9a49a', '#8f8a82', '#b7b1a6'][i % 3] });
      }
    }
    this.manyOf.push(
      instanced(scene, PALM(), palms),
      instanced(scene, ROUND_TREE(), round),
      instanced(scene, PINE(), pines),
      instanced(scene, ROCK(), rocks),
    );
  }

  /* ---------- what moves ---------- */

  addShips(random) {
    this.ships = [];
    for (let i = 0; i < 9; i += 1) {
      const ship = buildShip(random);
      const far = between(random, 700, 960);
      this.scene.add(ship);
      this.ships.push({ ship, far, angle: random() * 6.3, rate: (i % 2 ? 1 : -1) * between(random, 0.006, 0.012) });
    }
  }

  addBalloons(random) {
    const sets = [['#ff5a4f', '#ffffff'], ['#ffd23f', '#ff8f3f'], ['#3b82f6', '#ffffff'], ['#a855f7', '#ffd23f'], ['#27c96b', '#ffffff'], ['#ff7eb6', '#7ee8ff'], ['#ff8f3f', '#3b82f6']];
    this.balloons = sets.map((colours, index) => {
      const balloon = buildBalloon(colours);
      const angle = (index / sets.length) * Math.PI * 2 + 0.4;
      const far = between(random, 180, 620);
      const home = { x: Math.cos(angle) * far, z: Math.sin(angle) * far, y: between(random, 90, 200) };
      balloon.position.set(home.x, home.y, home.z);
      this.scene.add(balloon);
      return { balloon, home, phase: random() * 6 };
    });
  }

  addClouds(random) {
    const map = spriteTexture(SHAPES.puff, 256);
    this.clouds = [];
    for (let i = 0; i < CLOUDS; i += 1) {
      const paint = new THREE.SpriteMaterial({ map, color: '#ffffff', opacity: 0.9, transparent: true, depthWrite: false, fog: false });
      const sprite = new THREE.Sprite(paint);
      const size = between(random, 45, 120);
      sprite.scale.set(size * 1.7, size, 1);
      const angle = random() * Math.PI * 2;
      const far = Math.sqrt(random()) * WORLD.limit;
      sprite.position.set(Math.cos(angle) * far, between(random, 130, 300), Math.sin(angle) * far);
      this.scene.add(sprite);
      this.clouds.push(sprite);
    }
    // A wall of cloud all the way round, past the place where planes are turned back.
    const wallMap = spriteTexture(SHAPES.puff, 256);
    const wallPaint = new THREE.SpriteMaterial({ map: wallMap, color: '#eef7ff', opacity: 0.95, transparent: true, depthWrite: false, fog: false });
    for (let i = 0; i < CLOUD_WALL; i += 1) {
      const angle = (i / CLOUD_WALL) * Math.PI * 2;
      for (const [high, size] of [[50, 340], [190, 400]]) {
        const sprite = new THREE.Sprite(wallPaint);
        sprite.scale.set(size * 1.2, size, 1);
        sprite.position.set(Math.cos(angle) * (WORLD.limit + 190), high, Math.sin(angle) * (WORLD.limit + 190));
        this.scene.add(sprite);
      }
    }
  }

  /** A little smoke from the top of the volcano, and its lava, which is steady and doesn't flicker. */
  addSmoke() {
    const { x, z } = VOLCANO_TOP;
    const lava = new THREE.Mesh(new THREE.CircleGeometry(30, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff7a2e' }));
    lava.position.set(x, heightAt(x, z) + 3, z);
    this.scene.add(lava);
    const map = spriteTexture(SHAPES.puff, 128);
    const paint = new THREE.SpriteMaterial({ map, color: '#c9c4bd', opacity: 0.55, transparent: true, depthWrite: false });
    this.smoke = Array.from({ length: 12 }, (_, index) => {
      const sprite = new THREE.Sprite(paint);
      this.scene.add(sprite);
      return { sprite, share: index / 12, base: heightAt(x, z) + 8 };
    });
  }

  /** The sky for a time of day: see SKIES. */
  paintSky(name) {
    if (this.skyName === name) return;
    this.skyName = name;
    paintDome(this.dome.geometry, SKIES[name] ?? SKIES.day);
  }

  /** A slow computer shows half the trees and rocks, as there are plenty left. */
  showFewer() {
    for (const mesh of this.manyOf) mesh.count = Math.floor(mesh.count / 2);
  }

  update(dt, camera, reducedMotion) {
    this.time += dt;
    const { time } = this;
    this.dome.position.copy(camera.position);
    this.water.offset.set((time * 0.006) % 1, (time * 0.004) % 1);
    for (const { part, axis, rate } of this.spinning) part.rotation[axis] += rate * dt * (reducedMotion ? 0.4 : 1);

    for (const each of this.ships) {
      each.angle += each.rate * dt;
      each.ship.position.set(Math.cos(each.angle) * each.far, 0.2, Math.sin(each.angle) * each.far);
      each.ship.rotation.y = -each.angle + (each.rate > 0 ? Math.PI : 0);
    }
    for (const { balloon, home, phase } of this.balloons) {
      balloon.position.set(home.x + Math.sin(time * 0.05 + phase) * 45, home.y + Math.sin(time * 0.17 + phase) * 9, home.z + Math.cos(time * 0.04 + phase) * 45);
    }
    // Clouds fade as a plane nears them, rather than suddenly filling the view.
    for (const cloud of this.clouds) {
      const away = cloud.position.distanceTo(camera.position);
      cloud.material.opacity = 0.9 * Math.min(1, Math.max(0, (away - CLOUD_FADE.from) / (CLOUD_FADE.to - CLOUD_FADE.from)));
    }
    const { x, z } = VOLCANO_TOP;
    for (const puff of this.smoke) {
      puff.share = (puff.share + dt * 0.035) % 1;
      const size = 26 + puff.share * 110;
      puff.sprite.scale.set(size, size, 1);
      puff.sprite.position.set(x + puff.share * 70, puff.base + puff.share * 170, z - puff.share * 30);
    }
  }
}
