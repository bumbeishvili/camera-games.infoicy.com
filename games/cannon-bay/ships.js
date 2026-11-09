// The ships of Cannon Bay: wooden hulls in bright paint, built from simple shapes with no image files,
// whose sails come up and down. The child's has Joze on the back of it with his long neck above the
// rail, and giraffe spots on its sails. Each pirate ship belongs to one of the other characters, in their
// colours and with their mark on its sails. They're all original designs made for this game.
import * as THREE from '../../vendor/three/three.module.js';
import { Fighter3D, makePose, mergeParts, roundedBox, toon } from '../../core/body/characters.js';
import { SHAPES } from '../../core/body/sparks.js';
import { GUN_HEIGHT, GUN_SPOTS } from './battle.js';

const LENGTH = 38;
const INK = '#2a1a12';
const WOOD = '#c99458';
const WOOD_DARK = '#a8783f';
const MAST = '#7a5230';
const IRON = '#2c3038';

// Along the ship from the bow: its half width, the height of its rail, and the height of its keel.
const STATIONS = [
  [0, 0.3, 11.5, 7],
  [0.05, 1.9, 10.6, 2],
  [0.13, 3.9, 9.8, -0.6],
  [0.25, 5.4, 8.5, -2],
  [0.42, 6.1, 8, -2.6],
  [0.6, 6.2, 8.1, -2.6],
  [0.7, 6, 9.2, -2.4],
  [0.8, 5.8, 12.6, -2.2],
  [0.9, 5.6, 13.8, -2.2],
  [1, 5.3, 14.8, -2.2],
];
const DECK = { main: 5.8, fore: 8.2, back: 10.8, foreEnds: 0.19, backStarts: 0.71 };

/** Each one's paint: its hull, the band above it, its trim, its sails and the mark on them. */
export const LOOKS = {
  joze: { hull: '#b8763a', upper: '#e9c48a', trim: '#6a4bd8', bottom: '#5b3a22', sail: ['#fff0c9', '#fff0c9'], spots: '#c9823f', mark: null, markColour: '#6a4bd8', flag: '#6a4bd8', flagMark: '#ffd23f' },
  truffle: { hull: '#ff6f9f', upper: '#ffd1df', trim: '#2f6fed', bottom: '#8f2f55', sail: ['#ffffff', '#ff9dbb'], mark: 'bubble', markColour: '#2f6fed' },
  kit: { hull: '#f7822b', upper: '#ffc38a', trim: '#2b2f52', bottom: '#8a3f10', sail: ['#ffe9cf', '#ff9f4f'], mark: 'leaf', markColour: '#2b2f52' },
  mochi: { hull: '#c79bff', upper: '#f1e2ff', trim: '#ff5fa2', bottom: '#6a4a9e', sail: ['#ffe16b', '#ffffff'], mark: 'star', markColour: '#ff5fa2' },
  widget: { hull: '#5d8fc9', upper: '#d4dee8', trim: '#ffd23f', bottom: '#2c4a70', sail: ['#e6ecf2', '#ffd23f'], mark: 'gear', markColour: '#14263d' },
  frost: { hull: '#6fb7ff', upper: '#ffffff', trim: '#27406b', bottom: '#2c5a8f', sail: ['#ffffff', '#bfe4ff'], mark: 'snow', markColour: '#27406b' },
  bramble: { hull: '#ffc23f', upper: '#ffe7a6', trim: '#6b3f1f', bottom: '#8f5f14', sail: ['#fff4d6', '#ffcf6b'], mark: 'honey', markColour: '#6b3f1f' },
  nova: { hull: '#7f5be0', upper: '#c9a0ff', trim: '#7ee8ff', bottom: '#3d2a80', sail: ['#4a3796', '#6a4fc0'], mark: 'star', markColour: '#ffe16b' },
  cinder: { hull: '#e8452f', upper: '#ff9a6b', trim: '#ffb703', bottom: '#7a1d10', sail: ['#ffe2c2', '#ff7a4a'], mark: 'flame', markColour: '#d92f14' },
  tur: { hull: '#27b86b', upper: '#b6eec6', trim: '#8c1f2d', bottom: '#14683c', sail: ['#f3e3cc', '#c9a37a'], mark: 'rock', markColour: '#8c1f2d' },
};

const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const pole = (top, bottom, height, sides = 7) => new THREE.CylinderGeometry(top, bottom, height, sides);
// Rounder than a box and much cheaper than the characters' balls, as there are lots of these.
const ball = (x = 1, y = x, z = x) => new THREE.SphereGeometry(1, 12, 9).scale(x, y, z);

/**
 * A dark shell pushed out along the surface and drawn inside out, which reads as an ink line, as on the
 * characters. Each width has its own shader, as the renderer would otherwise use one width for them all,
 * including the characters', and their lines would all be as thick as a ship's.
 */
function inkLine(colour, width) {
  const material = new THREE.MeshBasicMaterial({ color: colour, side: THREE.BackSide });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normal * ${width.toFixed(4)};`);
  };
  material.customProgramCacheKey = () => `cannon-bay-ink-${width.toFixed(4)}`;
  return material;
}

/** Smoothly through a list of values, each at its own place. */
function through(index, share) {
  const last = STATIONS.length - 1;
  let at = 0;
  while (at < last - 1 && STATIONS[at + 1][0] <= share) at += 1;
  const p1 = STATIONS[at];
  const p2 = STATIONS[at + 1];
  const p0 = STATIONS[Math.max(0, at - 1)];
  const p3 = STATIONS[Math.min(last, at + 2)];
  const t = Math.min(1, Math.max(0, (share - p1[0]) / (p2[0] - p1[0])));
  const a = p1[index];
  const b = p2[index];
  const slopeA = ((b - p0[index]) / (p2[0] - p0[0])) * (p2[0] - p1[0]);
  const slopeB = ((p3[index] - a) / (p3[0] - p1[0])) * (p2[0] - p1[0]);
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * slopeA + (-2 * t3 + 3 * t2) * b + (t3 - t2) * slopeB;
}

const halfWidth = (share) => Math.max(0.05, through(1, share));
const railHeight = (share) => through(2, share);
const keelHeight = (share) => through(3, share);
const zAt = (share) => (share - 0.5) * LENGTH;
const shareAt = (z) => z / LENGTH + 0.5;

/** A point on the side of the hull: share is along it, and up goes from the keel to the rail. */
function hullPoint(share, up, side) {
  const angle = (up * Math.PI) / 2;
  const width = halfWidth(share);
  const keel = keelHeight(share);
  const rail = railHeight(share);
  return [side * width * Math.sin(angle) ** 0.72, keel + (rail - keel) * (1 - Math.cos(angle)), zAt(share)];
}

/** One band of paint along one side of the hull. */
function strake(fromUp, toUp, side, steps = 26, rows = 3) {
  const positions = [];
  const index = [];
  for (let i = 0; i <= steps; i += 1) {
    const share = i / steps;
    for (let j = 0; j <= rows; j += 1) positions.push(...hullPoint(share, fromUp + ((toUp - fromUp) * j) / rows, side));
  }
  const stride = rows + 1;
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = a + 1;
      const d = b + 1;
      if (side > 0) index.push(a, c, b, c, d, b);
      else index.push(a, b, c, c, b, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** A flat deck between the sides of the hull, in long planks. */
function deckParts(fromShare, toShare, height, parts) {
  const planks = 7;
  for (let plank = 0; plank < planks; plank += 1) {
    const positions = [];
    const index = [];
    const steps = 10;
    for (let i = 0; i <= steps; i += 1) {
      const share = fromShare + ((toShare - fromShare) * i) / steps;
      const width = halfWidth(share) * 0.99;
      positions.push(width * ((plank / planks) * 2 - 1), height, zAt(share));
      positions.push(width * (((plank + 1) / planks) * 2 - 1), height, zAt(share));
    }
    for (let i = 0; i < steps; i += 1) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    parts.push({ geometry, colour: plank % 2 ? WOOD : WOOD_DARK });
  }
}

/** A thin rope between two points. */
function rope(from, to, thickness = 0.09) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const geometry = new THREE.CylinderGeometry(thickness, thickness, a.distanceTo(b), 4);
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  geometry.applyQuaternion(turn);
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return { geometry, colour: '#4a3626' };
}

/** A little sailor, for the sense of a crew on deck. */
function sailorParts(x, y, z, colour, parts) {
  parts.push(
    { geometry: pole(0.42, 0.52, 1.5, 7), colour, at: [x, y + 0.9, z] },
    { geometry: pole(0.2, 0.22, 0.8, 5), colour: '#2f3550', at: [x - 0.24, y + 0.4, z] },
    { geometry: pole(0.2, 0.22, 0.8, 5), colour: '#2f3550', at: [x + 0.24, y + 0.4, z] },
    { geometry: ball(0.42), colour: '#ffd9b0', at: [x, y + 2.05, z] },
    { geometry: ball(0.46, 0.2, 0.46), colour: '#fff4e0', at: [x, y + 2.38, z] },
  );
}

function hullParts(look) {
  const parts = [];
  const bands = [
    [0, 0.5, look.bottom],
    [0.5, 0.74, look.hull],
    [0.74, 0.79, look.trim],
    [0.79, 0.93, look.upper],
    [0.93, 1, look.trim],
  ];
  for (const side of [1, -1]) {
    for (const [from, to, colour] of bands) parts.push({ geometry: strake(from, to, side), colour });
  }
  deckParts(DECK.foreEnds - 0.01, DECK.backStarts + 0.01, DECK.main, parts);
  deckParts(0.015, DECK.foreEnds, DECK.fore, parts);
  deckParts(DECK.backStarts, 0.995, DECK.back, parts);

  // The walls where the decks step up, with a door in the back one.
  const foreZ = zAt(DECK.foreEnds);
  const backZ = zAt(DECK.backStarts);
  const foreWide = halfWidth(DECK.foreEnds) * 1.98;
  const backWide = halfWidth(DECK.backStarts) * 1.98;
  parts.push(
    { geometry: box(foreWide, DECK.fore - DECK.main, 0.5), colour: look.upper, at: [0, (DECK.fore + DECK.main) / 2, foreZ] },
    { geometry: box(backWide, DECK.back - DECK.main, 0.5), colour: look.upper, at: [0, (DECK.back + DECK.main) / 2, backZ] },
    { geometry: box(backWide + 0.5, 0.5, 0.9), colour: look.trim, at: [0, DECK.back + 0.1, backZ] },
    { geometry: box(2.4, 3.6, 0.3), colour: look.trim, at: [0, DECK.main + 1.8, backZ - 0.3] },
    { geometry: ball(0.22), colour: '#ffd23f', at: [0.7, DECK.main + 1.6, backZ - 0.5] },
    { geometry: box(foreWide + 0.5, 0.5, 0.9), colour: look.trim, at: [0, DECK.fore + 0.1, foreZ] },
  );

  // The back of the ship, which is what's seen most of it: a painted board, windows and lanterns.
  const backW = halfWidth(0.995);
  const backKeel = keelHeight(1);
  const backRail = railHeight(1);
  const board = new THREE.Shape();
  board.moveTo(-backW * 0.7, backKeel);
  board.lineTo(backW * 0.7, backKeel);
  board.quadraticCurveTo(backW * 1.02, backKeel + 3, backW * 1.02, backRail - 7);
  board.lineTo(backW * 1.08, backRail - 0.2);
  board.quadraticCurveTo(0, backRail + 1.6, -backW * 1.08, backRail - 0.2);
  board.lineTo(-backW * 1.02, backRail - 7);
  board.quadraticCurveTo(-backW * 1.02, backKeel + 3, -backW * 0.7, backKeel);
  const stern = LENGTH / 2;
  parts.push({ geometry: new THREE.ExtrudeGeometry(board, { depth: 0.5, bevelEnabled: false }), colour: look.hull, at: [0, 0, stern - 0.35] });
  parts.push(
    { geometry: box(backW * 2.1, 0.55, 0.3), colour: look.trim, at: [0, backRail - 5.2, stern + 0.25] },
    { geometry: box(backW * 2.2, 0.55, 0.3), colour: '#ffd23f', at: [0, backRail - 0.5, stern + 0.25] },
    { geometry: box(backW * 1.9, 0.5, 0.3), colour: look.trim, at: [0, 3.2, stern + 0.25] },
  );
  for (const x of [-backW * 0.62, 0, backW * 0.62]) {
    parts.push(
      { geometry: roundedBox(2.3, 3, 0.25, 0.25), colour: '#ffd23f', at: [x, backRail - 3, stern + 0.2] },
      { geometry: roundedBox(1.7, 2.4, 0.3, 0.2), colour: '#fff3a8', at: [x, backRail - 3, stern + 0.26] },
      { geometry: box(0.14, 2.4, 0.34), colour: INK, at: [x, backRail - 3, stern + 0.28] },
      { geometry: box(1.7, 0.14, 0.34), colour: INK, at: [x, backRail - 3, stern + 0.28] },
    );
  }
  for (const x of [-backW * 1.02, backW * 1.02]) {
    parts.push(
      { geometry: pole(0.09, 0.09, 1.4, 5), colour: IRON, at: [x, backRail + 0.6, stern - 0.2] },
      { geometry: ball(0.6, 0.72, 0.6), colour: '#ffe58a', at: [x, backRail + 1.5, stern - 0.2] },
      { geometry: pole(0.65, 0.2, 0.35, 8), colour: IRON, at: [x, backRail + 2.2, stern - 0.2] },
    );
  }

  // The cannons, along each side, with the lid of each port propped open above it.
  for (const side of [1, -1]) {
    for (const along of GUN_SPOTS) {
      const z = -along;
      const out = hullPoint(shareAt(z), 0.86, side)[0];
      parts.push(
        { geometry: pole(0.48, 0.62, 3, 9), colour: IRON, at: [out + side * 0.8, GUN_HEIGHT, z], turn: [0, 0, (side * Math.PI) / 2] },
        { geometry: box(0.25, 2.1, 2.2), colour: look.bottom, at: [out + side * 0.02, GUN_HEIGHT, z] },
        { geometry: box(0.2, 0.3, 2.5), colour: look.trim, at: [out + side * 0.1, GUN_HEIGHT + 1.25, z] },
      );
    }
  }

  // A pole out over the bow, and something on the front of it.
  parts.push(
    { geometry: pole(0.14, 0.34, 15, 7), colour: MAST, at: [0, 13.6, -LENGTH / 2 - 4.5], turn: [-1.2, 0, 0] },
    { geometry: ball(0.55), colour: look.trim, at: [0, 16.2, -LENGTH / 2 - 11.4] },
  );
  return parts;
}

/* ------------------------------- sails ------------------------------- */

function paintedTexture(look) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = look.sail[0];
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = look.sail[1];
  const stripes = 6;
  for (let i = 1; i < stripes; i += 2) ctx.fillRect((i / stripes) * size, 0, size / stripes, size);
  // Giraffe spots on Joze's.
  if (look.spots) {
    ctx.fillStyle = look.spots;
    for (const [x, y, w, h, tilt] of [[52, 56, 25, 20, 0.3], [128, 44, 30, 22, -0.2], [204, 62, 23, 21, 0.4], [86, 124, 27, 25, -0.4], [168, 118, 29, 23, 0.2], [44, 190, 24, 22, -0.1], [122, 198, 31, 23, 0.3], [208, 186, 24, 26, -0.3]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, tilt, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Seams, and an ink edge, in the style of the characters.
  ctx.strokeStyle = 'rgba(70, 50, 30, 0.16)';
  ctx.lineWidth = 2;
  for (let y = 42; y < size; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  if (look.mark) drawMark(ctx, look.mark, look.markColour, 128, 122, 1.25);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 7;
  ctx.strokeRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** One of the shapes the characters throw, in a colour, onto a picture. */
function drawMark(ctx, mark, colour, x, y, scale) {
  const shape = document.createElement('canvas');
  shape.width = 256;
  shape.height = 256;
  const inner = shape.getContext('2d');
  inner.translate(128, 128);
  inner.scale(2.3, 2.3);
  inner.fillStyle = colour;
  inner.strokeStyle = colour;
  SHAPES[mark](inner);
  const size = 256 * 0.43 * scale;
  ctx.drawImage(shape, x - size / 2, y - size / 2, size, size);
}

/** A sail curved by the wind, hanging from the top down, with its middle pushed forward. */
function sailShape(width, height, curve) {
  const geometry = new THREE.PlaneGeometry(1, 1, 10, 8);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const across = position.getX(i) * 2;
    const down = 0.5 - position.getY(i);
    const narrow = 1 - 0.1 * down;
    position.setXYZ(i, across * 0.5 * width * narrow, -down * height, -curve * Math.sin(Math.PI * Math.min(1, down * 1.02) ** 0.8) * (1 - across * across * 0.82));
  }
  geometry.computeVertexNormals();
  return geometry;
}

class Sail {
  constructor(parent, at, width, height, material, curve = 2.5) {
    this.group = new THREE.Group();
    this.group.position.set(...at);
    this.cloth = new THREE.Mesh(sailShape(width, height, curve), material);
    this.group.add(this.cloth);
    parent.add(this.group);
    this.set(0, 0);
  }

  /** How far down it's let, from 0 to 1, and how full of wind it is. */
  set(share, wind) {
    const down = Math.max(0.04, share);
    this.cloth.scale.set(1, down, 0.35 + 0.65 * wind);
    this.cloth.visible = share > 0.01;
  }
}

/* ------------------------------- a whole ship ------------------------------- */

/** Masts and yards, as parts of the hull's one mesh, with the furled sails. The ropes are kept apart. */
function rigging(look, parts, ropes) {
  const rigs = [
    { z: -9, base: DECK.main, tall: 31, low: 18, high: 27.5, lowWide: 19, highWide: 15 },
    { z: 3.5, base: DECK.main, tall: 35, low: 20.5, high: 31, lowWide: 22, highWide: 17 },
  ];
  for (const { z, base, tall, low, high, lowWide, highWide } of rigs) {
    parts.push({ geometry: pole(0.42, 0.78, tall, 8), colour: MAST, at: [0, base + tall / 2, z] });
    for (const [y, wide] of [[low, lowWide], [high, highWide]]) {
      parts.push(
        { geometry: pole(0.17, 0.26, wide + 2, 6), colour: MAST, at: [0, y, z - 0.45], turn: [0, 0, Math.PI / 2] },
        { geometry: ball(wide * 0.47, 0.42, 0.42), colour: look.sail[0], at: [0, y - 0.22, z - 0.45] },
      );
    }
    // A crow's nest, under the top.
    parts.push(
      { geometry: pole(1.45, 1.05, 1.3, 10), colour: look.trim, at: [0, high - 2.3, z] },
      { geometry: pole(1.5, 1.5, 0.22, 10), colour: '#ffd23f', at: [0, high - 1.6, z] },
    );
    // Ropes from the top down to the rails, and along the middle of the ship.
    const top = base + tall - 1.5;
    for (const side of [1, -1]) {
      const share = shareAt(z + 2.5);
      const foot = hullPoint(share, 1, side);
      ropes.push(rope([0, top, z], foot), rope([0, high - 2, z], hullPoint(shareAt(z - 2.5), 1, side)));
      ropes.push(rope([side * lowWide * 0.48, low, z - 0.45], hullPoint(shareAt(z + 5), 1, side), 0.06));
    }
  }
  ropes.push(
    rope([0, 39.5, -9], [0, 16.2, -LENGTH / 2 - 11.4]),
    rope([0, 36, 3.5], [0, 34, -9]),
  );
  return rigs;
}

/** The two sails on each mast, and the one out over the bow. */
function setSails(ship, rigs, material) {
  ship.sails = [];
  for (const { z, low, high, lowWide, highWide } of rigs) {
    ship.sails.push(
      new Sail(ship.body, [0, low - 0.15, z - 0.5], lowWide, Math.max(9, low - DECK.main - 3.6), material, 3),
      new Sail(ship.body, [0, high - 0.15, z - 0.5], highWide, high - low - 1.1, material, 2.2),
    );
  }
}

function flagTexture(colour, mark, markColour) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 128, 96);
  drawMark(ctx, mark, markColour, 64, 48, 0.68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

class Flag {
  constructor(parent, at, width, height, texture) {
    this.geometry = new THREE.PlaneGeometry(width, height, 8, 1).translate(width / 2, 0, 0);
    this.rest = Float32Array.from(this.geometry.attributes.position.array);
    this.mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    this.mesh.position.set(...at);
    this.width = width;
    parent.add(this.mesh);
    this.time = Math.random() * 6;
  }

  update(dt, wave) {
    this.time += dt;
    const { array } = this.geometry.attributes.position;
    for (let i = 0; i < array.length; i += 3) {
      const out = this.rest[i] / this.width;
      array[i + 2] = Math.sin(out * 5 - this.time * 5) * out * 0.8 * wave;
      array[i + 1] = this.rest[i + 1] - out * out * 0.6;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
}

export class Ship {
  /** look is one of LOOKS. */
  constructor(look) {
    this.look = look;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // What rocks and lists.
    this.root.add(this.body);

    const parts = hullParts(look);
    const ropes = [];
    const rigs = rigging(look, parts, ropes);
    this.extraParts(parts);
    const geometry = mergeParts(parts);
    this.paint = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon(), side: THREE.DoubleSide });
    this.hull = new THREE.Mesh(geometry, this.paint);
    this.outline = new THREE.Mesh(geometry, inkLine(INK, 0.11));
    this.ropes = new THREE.Mesh(mergeParts(ropes), new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.body.add(this.hull, this.outline, this.ropes);

    this.sailPaint = new THREE.MeshToonMaterial({ map: paintedTexture(look), gradientMap: toon(), side: THREE.DoubleSide });
    setSails(this, rigs, this.sailPaint);

    const flag = flagTexture(look.flag ?? '#1c1f2b', look.mark ?? 'star', look.flagMark ?? '#ffffff');
    this.flags = [
      new Flag(this.body, [0, 41, 3.5], 7, 4.6, flag),
      new Flag(this.body, [0, 36.8, -9], 5, 3.4, flag),
    ];
    this.time = Math.random() * 10;
  }

  extraParts() {}

  /** Puts it on the water. heading, and how much it's rolled and pitched, and its sails from 0 to 1. */
  place(x, y, z, { heading = 0, pitch = 0, roll = 0, sails = 1, wind = 1 } = {}) {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = -heading;
    this.body.position.y = y;
    this.body.rotation.set(pitch, 0, roll, 'YXZ');
    for (const sail of this.sails) sail.set(sails, wind);
  }

  updateFlags(dt, wave = 1) {
    for (const flag of this.flags) flag.update(dt, wave);
  }
}

/* ------------------------------- who's on board ------------------------------- */

/** A captain's hat, with its brim turned up, sat on top of a character's head. */
export function captainHat(colour, trim, size = 1) {
  const brim = ball(0.46, 0.05, 0.36);
  const parts = [
    { geometry: brim, colour },
    { geometry: ball(0.27, 0.2, 0.25), colour, at: [0, 0.13, 0] },
    { geometry: ball(0.4, 0.14, 0.05), colour, at: [0, 0.11, 0.26], turn: [-0.5, 0, 0] },
    { geometry: ball(0.3, 0.035, 0.03), colour: trim, at: [0, 0.2, 0.29], turn: [-0.5, 0, 0] },
    { geometry: ball(0.07), colour: trim, at: [0, 0.14, 0.32] },
  ];
  const geometry = mergeParts(parts);
  const hat = new THREE.Group();
  const paint = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() });
  hat.add(new THREE.Mesh(geometry, paint), new THREE.Mesh(geometry, inkLine('#14141c', 0.012)));
  hat.scale.setScalar(size);
  return hat;
}

/** The ship's wheel on the back of the child's ship, which turns just as the one on the screen does. */
function deckWheel() {
  const parts = [{ geometry: new THREE.TorusGeometry(1.5, 0.17, 7, 18), colour: '#8a5a2b' }];
  for (let i = 0; i < 4; i += 1) {
    parts.push({ geometry: box(0.16, 3, 0.12), colour: '#c99458', turn: [0, 0, (i / 4) * Math.PI] });
  }
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    parts.push({ geometry: ball(0.18), colour: '#ffd23f', at: [Math.cos(angle) * 1.68, Math.sin(angle) * 1.68, 0] });
  }
  parts.push({ geometry: ball(0.34), colour: '#ffd23f' });
  const wheel = new THREE.Mesh(mergeParts(parts), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() }));
  return wheel;
}

const JOZE_SIZE = 5.6;
const JOZE_AT = [0, DECK.back - 0.15, 9.2];
const WHEEL_AT = [0, DECK.back + 3.3, 12.6];

/** The child's ship, with Joze as its captain on the back of it. */
export class HeroShip extends Ship {
  constructor(spec) {
    super(LOOKS.joze);
    this.joze = new Fighter3D(spec);
    this.joze.root.scale.setScalar(JOZE_SIZE);
    this.joze.root.position.set(...JOZE_AT);
    this.joze.root.rotation.y = -0.32;
    this.joze.setExpression('happy');
    this.body.add(this.joze.root);
    // A very small hat, with his two little horns coming through it.
    const hat = captainHat('#27305e', '#ffd23f', 0.82);
    hat.position.set(0, 0.34, -0.02);
    hat.rotation.x = -0.1;
    this.joze.head.add(hat);

    this.pose = makePose();
    Object.assign(this.pose, { handLX: 0.1, handLY: -0.42, handLZ: 0.72, handRX: -0.1, handRY: -0.42, handRZ: 0.72 });
    this.wheel = deckWheel();
    this.wheel.position.set(...WHEEL_AT);
    this.body.add(this.wheel);
    const stand = new THREE.Mesh(mergeParts([
      { geometry: box(0.5, 3.1, 0.5), colour: '#8a5a2b', at: [0, -1.7, 0.3] },
      { geometry: box(1.5, 0.3, 1.5), colour: '#6a4524', at: [0, -3.2, 0.3] },
    ]), this.paint);
    stand.position.set(...WHEEL_AT);
    this.body.add(stand);
    this.cheering = 0;
    this.nod = 0;
    // The sailors rescued from the pirates' cages, on the higher levels, on deck with the crew.
    this.rescued = [[-2.2, -7], [2.4, 6.5], [-3.9, -1.2], [3.9, 1.8]].map(([x, z]) => {
      const parts = [];
      sailorParts(x, DECK.main, z, '#2f6fed', parts);
      const sailor = new THREE.Mesh(mergeParts(parts), this.paint);
      sailor.visible = false;
      this.body.add(sailor);
      return sailor;
    });
  }

  /** How many rescued sailors are on board. */
  showRescued(count) {
    this.rescued.forEach((sailor, index) => {
      sailor.visible = index < count;
    });
  }

  extraParts(parts) {
    sailorParts(-3.6, DECK.main, 3, '#e8433f', parts);
    sailorParts(3.6, DECK.main, -3, '#2f6fed', parts);
    sailorParts(0, DECK.fore, -15, '#27c96b', parts);
    // Giraffe spots on the back of the ship, as that's what's seen most of.
    for (const [x, y, w, h] of [[-3.1, 5.3, 0.95, 0.75], [0.1, 6, 1.1, 0.8], [3.2, 5.1, 0.9, 0.8], [-1.6, 1.6, 0.85, 0.7], [1.7, 2, 1, 0.7]]) {
      parts.push({ geometry: ball(w, h, 0.12), colour: '#7f4a1f', at: [x, y, LENGTH / 2 + 0.2] });
    }
  }

  /** How Joze stands from moment to moment, with his long neck swaying as the ship rolls. */
  updateJoze(dt, { wheel = 0, roll = 0, pitch = 0, look = 0, hurt = 0, cheering = false, calm = 1, time = 0 }) {
    this.wheel.rotation.z = -wheel * 2.4;
    const { pose } = this;
    // His head stays on the view from behind, unless there's something to look at.
    pose.headTurn += (look - pose.headTurn) * (1 - Math.exp(-dt * 4));
    pose.roll = -roll * 3 * calm + Math.sin(time * 0.9) * 0.05 * calm;
    pose.pitch = pitch * 2 * calm + Math.sin(time * 0.7) * 0.03 * calm;
    pose.squash = hurt > 0 ? Math.sin(hurt * 14) * 0.08 * hurt * calm : 0;
    const reach = wheel * 0.12;
    if (cheering) {
      const wave = Math.sin(time * 7) * 0.12 * calm;
      Object.assign(pose, { handLX: 0.35 + wave, handLY: 0.75, handLZ: 0.1, handRX: -0.35 + wave, handRY: 0.75, handRZ: 0.1, up: Math.abs(Math.sin(time * 5)) * 0.08 * calm });
    } else {
      Object.assign(pose, { handLX: 0.1 + reach, handLY: -0.42, handLZ: 0.72, handRX: -0.1 + reach, handRY: -0.42, handRZ: 0.72, up: 0 });
    }
    this.joze.setPose(pose);
    this.joze.update(dt);
  }
}

const CAPTAIN_SIZE = 3.9;
const CAPTAIN_AT = [0, DECK.back - 0.15, 12.5];

/** A pirate ship in its captain's colours. It's built once and used again in each battle. */
export class PirateShip extends Ship {
  constructor(spec) {
    super(LOOKS[spec.id]);
    this.spec = spec;
    this.captain = new Fighter3D(spec);
    this.captain.root.scale.setScalar(CAPTAIN_SIZE);
    const hat = captainHat('#1c1f2b', '#ffd23f', 0.8 * spec.build.headWidth);
    hat.position.set(0, 0.42 * spec.build.headHeight, -0.02);
    this.captain.head.add(hat);
    this.pose = makePose();
    this.time = Math.random() * 6;
    this.reset();
    this.root.visible = false;
  }

  extraParts(parts) {
    sailorParts(-3.6, DECK.main, 4, '#1c1f2b', parts);
    sailorParts(3.8, DECK.main, -2, '#f4efe2', parts);
  }

  /** Back on board and ready, for a new battle. */
  reset() {
    const { captain } = this;
    this.body.add(captain.root);
    captain.root.scale.setScalar(CAPTAIN_SIZE);
    captain.root.position.set(...CAPTAIN_AT);
    captain.root.rotation.set(0, 0, 0);
    captain.root.visible = true;
    captain.setExpression('ready');
    this.root.visible = false;
  }

  /** Faces the child's ship, with one arm in the air. direction is the way to them, across the water. */
  updateCaptain(dt, { direction = 0, heading = 0, excited = 0, calm = 1 }) {
    const { captain, pose } = this;
    this.time += dt;
    // Character forward is +z, and the ship's stern is +z too.
    captain.root.rotation.y = Math.PI - direction + heading;
    const wave = Math.sin(this.time * (3 + excited * 4)) * 0.14 * calm;
    Object.assign(pose, { handRX: -0.3 + wave, handRY: 0.78, handRZ: 0.12, handLX: 0.5, handLY: -0.5, handLZ: 0.3, pitch: 0.06, roll: Math.sin(this.time * 1.1) * 0.05 * calm });
    captain.setPose(pose);
    captain.update(dt);
  }
}

/* ------------------------------- the lifeboat ------------------------------- */

function lifeboatGeometry(look) {
  const parts = [
    { geometry: ball(4.4, 1.5, 1.9), colour: look.hull, at: [0, 0.2, 0], size: [1, 0.9, 1] },
    { geometry: ball(4.2, 0.45, 1.65), colour: WOOD, at: [0, 1.2, 0] },
    { geometry: box(0.5, 0.4, 3), colour: WOOD_DARK, at: [1.6, 1.5, 0] },
    { geometry: box(0.5, 0.4, 3), colour: WOOD_DARK, at: [-1.6, 1.5, 0] },
  ];
  return mergeParts(parts);
}

/** The crew's little boat. It's pointed along +x, and the captain stands up in it to wave. */
export class Lifeboat {
  constructor(look) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const geometry = lifeboatGeometry(look);
    const paint = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() });
    this.body.add(new THREE.Mesh(geometry, paint), new THREE.Mesh(geometry, inkLine(INK, 0.07)));
    const crew = [];
    sailorParts(1.7, 1.2, -0.6, '#1c1f2b', crew);
    sailorParts(-2, 1.2, 0.5, '#f4efe2', crew);
    this.body.add(new THREE.Mesh(mergeParts(crew), paint));
    this.oars = [1, -1].map((side) => {
      const oar = new THREE.Group();
      oar.position.set(0.2, 1.6, side * 1.9);
      const blade = new THREE.Mesh(mergeParts([
        { geometry: pole(0.07, 0.07, 3.6, 4), colour: WOOD, at: [0, 0, side * 1.6], turn: [Math.PI / 2, 0, 0] },
        { geometry: box(0.6, 0.1, 1), colour: look.trim, at: [0, 0, side * 3.5] },
      ]), paint);
      oar.add(blade);
      this.body.add(oar);
      return { oar, side };
    });
    this.pose = makePose();
    this.root.visible = false;
    this.time = Math.random() * 6;
    this.captain = null;
  }

  /** Who's in it. */
  board(captain) {
    this.captain = captain;
    captain.root.position.set(0, 1.3, 0);
    captain.root.rotation.set(0, 0, 0);
    captain.root.scale.setScalar(2.3);
    captain.setExpression('happy');
    captain.root.visible = true;
    this.body.add(captain.root);
    this.root.visible = true;
  }

  place(x, y, z, heading) {
    this.root.position.set(x, y, z);
    // Its bow is along +x, so that's a quarter turn from a ship's.
    this.root.rotation.y = -heading + Math.PI / 2;
  }

  update(dt, { size = 1, calm = 1, towards = 0, heading = 0 }) {
    this.time += dt;
    const row = Math.sin(this.time * 3.4) * 0.5 * calm;
    for (const { oar, side } of this.oars) {
      oar.rotation.y = row * side;
      oar.rotation.x = Math.cos(this.time * 3.4) * 0.16 * calm * side;
    }
    this.body.rotation.x = Math.sin(this.time * 1.5) * 0.05 * calm;
    this.body.rotation.z = Math.sin(this.time * 1.1) * 0.04 * calm;
    this.root.scale.setScalar(Math.max(0.001, size));
    const { captain, pose } = this;
    if (!captain) return;
    // Both arms waving goodbye, looking back at the child's ship.
    captain.root.rotation.y = -towards + heading + Math.PI / 2;
    const wave = Math.sin(this.time * 6) * 0.26 * calm;
    Object.assign(pose, { handRX: -0.45 + wave, handRY: 0.72, handRZ: 0.1, handLX: 0.45 + wave, handLY: 0.72, handLZ: 0.1, roll: wave * 0.2 });
    captain.setPose(pose);
    captain.update(dt);
  }
}

/* ------------------------------- the higher levels' other boats ------------------------------- */

/** A gold crown, which sits on top of the pirate king's main mast. */
export function kingsCrown() {
  const parts = [{ geometry: pole(2.6, 2.3, 2.2, 14), colour: '#f2b830' }];
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    parts.push(
      { geometry: new THREE.ConeGeometry(0.75, 2.2, 6), colour: '#f2b830', at: [Math.cos(angle) * 2.2, 2, Math.sin(angle) * 2.2] },
      { geometry: ball(0.5), colour: i % 2 ? '#ff6fae' : '#4cc3ff', at: [Math.cos(angle) * 2.5, 0.2, Math.sin(angle) * 2.5] },
    );
  }
  const geometry = mergeParts(parts);
  const crown = new THREE.Group();
  crown.add(new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() })), new THREE.Mesh(geometry, inkLine(INK, 0.12)));
  return crown;
}

/**
 * A raft of barrels lashed together, with a little square sail in its captain's colours. Nobody's on it.
 * Built along -z, like the ships.
 */
export class Raft {
  constructor(look) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const parts = [];
    for (const x of [-4.8, -1.6, 1.6, 4.8]) {
      parts.push(
        { geometry: pole(1.6, 1.6, 15, 12), colour: '#b8743a', at: [x, 0.6, 0], turn: [Math.PI / 2, 0, 0] },
        { geometry: pole(1.7, 1.7, 0.5, 12), colour: '#5b4636', at: [x, 0.6, -4.5], turn: [Math.PI / 2, 0, 0] },
        { geometry: pole(1.7, 1.7, 0.5, 12), colour: '#5b4636', at: [x, 0.6, 4.5], turn: [Math.PI / 2, 0, 0] },
      );
    }
    for (const z of [-5.5, 0, 5.5]) parts.push({ geometry: box(13, 0.6, 2.2), colour: WOOD, at: [0, 2.4, z] });
    parts.push(
      { geometry: pole(0.3, 0.42, 15, 7), colour: MAST, at: [0, 9.5, 0] },
      { geometry: pole(0.14, 0.16, 11, 5), colour: MAST, at: [0, 15, -0.3], turn: [0, 0, Math.PI / 2] },
      { geometry: box(11, 0.8, 1.6), colour: look.trim, at: [0, 3, -7.2] },
    );
    const geometry = mergeParts(parts);
    const paint = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon(), side: THREE.DoubleSide });
    this.body.add(new THREE.Mesh(geometry, paint), new THREE.Mesh(geometry, inkLine(INK, 0.1)));
    this.sailPaint = new THREE.MeshToonMaterial({ map: paintedTexture(look), gradientMap: toon(), side: THREE.DoubleSide });
    this.sail = new Sail(this.body, [0, 14.8, -0.6], 10, 9.5, this.sailPaint, 1.6);
    this.flags = [new Flag(this.body, [0, 17.3, 0], 3.6, 2.4, flagTexture(look.flag ?? '#1c1f2b', look.mark ?? 'star', look.flagMark ?? '#ffffff'))];
    this.root.visible = false;
  }

  place(x, y, z, { heading = 0, pitch = 0, roll = 0, sails = 1, wind = 1 } = {}) {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = -heading;
    this.body.position.y = y;
    this.body.rotation.set(pitch, 0, roll, 'YXZ');
    this.sail.set(sails, wind);
  }

  updateFlags(dt, wave = 1) {
    for (const flag of this.flags) flag.update(dt, wave);
  }
}

/**
 * A round little submarine in its captain's colours, with a tower, a periscope and portholes. It's drawn
 * lower in the water as it dives, until only the periscope shows.
 */
export class Submarine {
  constructor(look) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const parts = [
      { geometry: ball(5.2, 4.6, 15), colour: look.hull, at: [0, 0, 0] },
      { geometry: ball(5.3, 1.3, 15.1), colour: look.upper, at: [0, 0.5, 0] },
      { geometry: box(5, 5.5, 8), colour: look.hull, at: [0, 5.5, 1] },
      { geometry: box(5.3, 0.9, 8.3), colour: look.trim, at: [0, 8.2, 1] },
      { geometry: pole(0.35, 0.35, 7, 6), colour: IRON, at: [0, 11, -1.5] },
      { geometry: box(0.7, 0.7, 2), colour: IRON, at: [0, 14.3, -2.3] },
      { geometry: ball(0.6, 1.8, 3), colour: look.trim, at: [0, 0, 15.3] },
      { geometry: box(0.4, 3.6, 1.2), colour: look.trim, at: [0, 0, 15.8] },
    ];
    for (const [x, z] of [[5.05, -6], [5.05, -1], [5.05, 4], [-5.05, -6], [-5.05, -1], [-5.05, 4]]) {
      parts.push(
        { geometry: pole(1.25, 1.25, 0.6, 12), colour: look.trim, at: [x, 0.6, z], turn: [0, 0, Math.PI / 2] },
        { geometry: pole(0.9, 0.9, 0.7, 12), colour: '#bfe7fb', at: [x, 0.6, z], turn: [0, 0, Math.PI / 2] },
      );
    }
    const geometry = mergeParts(parts);
    const paint = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() });
    this.body.add(new THREE.Mesh(geometry, paint), new THREE.Mesh(geometry, inkLine(INK, 0.1)));
    this.flags = [new Flag(this.body, [0, 10.6, 3.5], 3.6, 2.4, flagTexture(look.flag ?? '#1c1f2b', look.mark ?? 'star', look.flagMark ?? '#ffffff'))];
    this.root.visible = false;
  }

  place(x, y, z, { heading = 0, pitch = 0, roll = 0 } = {}) {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = -heading;
    this.body.position.y = y;
    this.body.rotation.set(pitch, 0, roll, 'YXZ');
  }

  updateFlags(dt, wave = 1) {
    for (const flag of this.flags) flag.update(dt, wave);
  }
}
