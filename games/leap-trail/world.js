// The trail: a 3D path through the countryside, what's on it, and the character running along it.
//
// The runner stays where it is and everything else moves past. Scenery is two long strips that
// take turns, so it never ends. Each obstacle has a painted stretch of path before it, showing
// where a move will count. Nothing flashes or strobes, as seizures are more common in children
// with hemiplegia: clearing something is a burst of small shapes, and the picture itself never
// changes brightness.
import * as THREE from '../../vendor/three/three.module.js';
import {
  Fighter3D,
  ball,
  limb,
  makePose,
  mergeParts,
  mixPose,
  outlineMaterial,
  roundedBox,
  taper,
  toon,
} from '../../core/body/characters.js';
import { SHAPES, Sparks, spriteTexture } from '../../core/body/sparks.js';

const PATH_WIDTH = 3.6;
const STRIP_LENGTH = 90;
const GRASS_BAND = 12;
const PATH_REPEAT = 8;
const SEEN_AHEAD = 110;
const SEEN_BEHIND = 12;
const STARS_SHOWN = 26;
const STARS_SEEN_AHEAD = 75;
const STREAKS = 46; // Lines rushing past, to show the speed.
const STREAK_AREA = { near: 2.4, far: 8, high: 5, ahead: 46, behind: 7 };
const DASH_FOV = 13; // How much wider the view gets in a dash.
const INK = '#3d2a17';

const VIEWS = {
  choose: { at: [0, 1.62, 7.5], look: [0, 0.98, 0], fov: 30 },
  // Low down and close behind, with a wide view, so that everything comes rushing up.
  run: { at: [0.7, 3, 5.9], look: [-0.05, 1.15, -12], fov: 64 },
  // The runner on the right of the screen, with the child's own picture on the left.
  practice: { at: [-2.45, 1.62, 7.5], look: [-2.45, 0.98, 0], fov: 30 },
  win: { at: [1.3, 1.75, 6.5], look: [0, 1.15, 0], fov: 32 },
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
const between = (low, high) => low + Math.random() * (high - low);

/* ------------------------------- things made of shapes ------------------------------- */

const toonWith = (options) => new THREE.MeshToonMaterial({ gradientMap: toon(), ...options });

/** Joins parts into one object with an ink line round it. */
function solid(parts, ink = INK, outline = 0.016) {
  const geometry = mergeParts(parts);
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, toonWith({ vertexColors: true }));
  mesh.castShadow = true;
  group.add(mesh, new THREE.Mesh(geometry, outlineMaterial(ink, outline)));
  return group;
}

const cylinderAcross = (radius, length) => new THREE.CylinderGeometry(radius, radius, length, 18).rotateZ(Math.PI / 2);

const OBSTACLE_BUILDERS = {
  log() {
    const parts = [
      { geometry: cylinderAcross(0.38, 3.9), colour: '#8a5a2b', at: [0, 0.38, -0.45] },
      { geometry: cylinderAcross(0.28, 3.94), colour: '#d9b277', at: [0, 0.38, -0.45] },
      { geometry: taper(0.1, 0.05, 0.34), colour: '#8a5a2b', at: [0.7, 0.68, -0.45], turn: [0, 0, -0.5] },
      { geometry: ball(0.17, 0.09, 0.14), colour: '#6fbf4f', at: [0.98, 1.05, -0.45] },
    ];
    for (const x of [-1.3, -0.5, 0.2, 1.2]) parts.push({ geometry: ball(0.05, 0.3, 0.02), colour: '#6d4520', at: [x, 0.5, -0.1], turn: [0.5, 0, 1.57] });
    return solid(parts);
  },
  hay() {
    const parts = [
      { geometry: roundedBox(3.9, 1.05, 1.2, 0.16), colour: '#eec04f', at: [0, 0.53, -0.6] },
      { geometry: roundedBox(0.09, 1.09, 1.24, 0.04), colour: '#b5482f', at: [-1.1, 0.53, -0.6] },
      { geometry: roundedBox(0.09, 1.09, 1.24, 0.04), colour: '#b5482f', at: [1.1, 0.53, -0.6] },
    ];
    for (let i = 0; i < 9; i += 1) parts.push({ geometry: ball(0.3, 0.012, 0.02), colour: '#d3a43a', at: [-1.6 + i * 0.4, 0.25 + (i % 3) * 0.28, 0.005] });
    return solid(parts);
  },
  rocks() {
    return solid([
      { geometry: ball(0.8, 0.7, 0.72), colour: '#9aa3ab', at: [-0.75, 0.32, -0.7] },
      { geometry: ball(0.62, 0.58, 0.6), colour: '#aab3ba', at: [0.3, 0.27, -0.62] },
      { geometry: ball(0.7, 0.62, 0.66), colour: '#8d969e', at: [1.25, 0.28, -0.76] },
      { geometry: ball(0.46, 0.38, 0.4), colour: '#b8c0c6', at: [-1.7, 0.16, -0.45] },
      { geometry: ball(0.42, 0.33, 0.4), colour: '#a2abb2', at: [1.95, 0.14, -0.4] },
      { geometry: ball(0.22, 0.05, 0.2), colour: '#7fbf63', at: [-0.8, 0.98, -0.65] },
    ], '#39424a');
  },
  stream() {
    const parts = [{ geometry: roundedBox(26, 0.06, 2.4, 0.03), colour: '#58b8ee', at: [0, 0.035, -1.2] }];
    for (const [x, z, size] of [[-1.2, -0.6, 1], [0.6, -1.5, 0.8], [1.7, -0.5, 0.9], [-0.1, -1.05, 0.7], [-2.2, -1.7, 0.9], [2.6, -1.7, 0.8], [3.4, -0.7, 1]]) {
      parts.push({ geometry: ball(0.5 * size, 0.012, 0.09), colour: '#b4e4fb', at: [x, 0.07, z] });
    }
    for (const [x, z] of [[-3.2, -0.15], [3.1, -2.25], [-2.1, -2.3], [2.2, -0.12]]) {
      parts.push({ geometry: ball(0.34, 0.14, 0.26), colour: '#a2abb2', at: [x, 0.09, z] });
    }
    return solid(parts, '#1d5a84', 0.008);
  },
  bough() {
    const parts = [
      { geometry: limb(0.44, 0.34, 3.2).rotateX(Math.PI), colour: '#7c5228', at: [-2.65, 0, -0.55] },
      { geometry: limb(0.44, 0.34, 3.2).rotateX(Math.PI), colour: '#7c5228', at: [2.65, 0, -0.55] },
      { geometry: cylinderAcross(0.25, 5.4), colour: '#8a5a2b', at: [0, 1.82, -0.55] },
    ];
    for (const [x, y, z, size] of [[-2.5, 3.5, -0.55, 1.3], [2.5, 3.5, -0.55, 1.3], [-1.4, 2.5, -0.5, 0.86], [0, 2.4, -0.55, 0.92], [1.4, 2.5, -0.6, 0.86], [-0.8, 3.1, -0.7, 0.8], [0.8, 3.15, -0.55, 0.8]]) {
      parts.push({ geometry: ball(0.82 * size, 0.62 * size, 0.72 * size), colour: y > 3 ? '#4ea44f' : '#5eb85a', at: [x, y, z] });
    }
    for (const [x, length] of [[-1.25, 0.26], [-0.45, 0.2], [0.55, 0.24], [1.3, 0.2]]) {
      parts.push({ geometry: limb(0.06, 0.03, length), colour: '#5eb85a', at: [x, 1.6, -0.5] });
    }
    return solid(parts);
  },
  arch() {
    const flagColours = ['#ff5a4f', '#ffd23f', '#27c96b', '#3b82f6', '#a855f7', '#ff7eb6'];
    const parts = [
      { geometry: roundedBox(0.34, 2.5, 0.34, 0.06), colour: '#c8884a', at: [-2.5, 1.25, -0.65] },
      { geometry: roundedBox(0.34, 2.5, 0.34, 0.06), colour: '#c8884a', at: [2.5, 1.25, -0.65] },
      { geometry: roundedBox(5.6, 0.34, 0.5, 0.06), colour: '#d99a5a', at: [0, 2.05, -0.65] },
      { geometry: ball(0.22), colour: '#ff5a4f', at: [-2.5, 2.62, -0.65] },
      { geometry: ball(0.22), colour: '#ffd23f', at: [2.5, 2.62, -0.65] },
    ];
    const flag = new THREE.ConeGeometry(0.24, 0.42, 4).rotateX(Math.PI).scale(1, 1, 0.2);
    for (let i = 0; i < 9; i += 1) {
      parts.push({ geometry: flag, colour: flagColours[i % flagColours.length], at: [-2 + i * 0.5, 1.68, -0.65] });
    }
    return solid(parts);
  },
};

function buildFinish() {
  const parts = [
    { geometry: roundedBox(0.36, 4.2, 0.36, 0.08), colour: '#f7f2e6', at: [-3, 2.1, 0] },
    { geometry: roundedBox(0.36, 4.2, 0.36, 0.08), colour: '#f7f2e6', at: [3, 2.1, 0] },
    { geometry: ball(0.3), colour: '#ffd23f', at: [-3, 4.35, 0] },
    { geometry: ball(0.3), colour: '#ffd23f', at: [3, 4.35, 0] },
  ];
  for (let column = 0; column < 12; column += 1) {
    for (let row = 0; row < 2; row += 1) {
      parts.push({
        geometry: new THREE.BoxGeometry(0.5, 0.44, 0.1),
        colour: (column + row) % 2 ? '#12304d' : '#ffffff',
        at: [-2.75 + column * 0.5, 3.45 + row * 0.44, 0],
      });
    }
  }
  return solid(parts, '#12304d');
}

function buildStrip() {
  const parts = [];
  const side = () => (Math.random() < 0.5 ? -1 : 1);
  const z = () => -Math.random() * STRIP_LENGTH;

  // Trees, keeping clear of the path.
  for (let i = 0; i < 46; i += 1) {
    const x = side() * between(6.5, 44);
    const where = z();
    const size = between(0.85, 1.5);
    const trunkHeight = 1.5 * size;
    parts.push({ geometry: taper(0.3 * size, 0.2 * size, trunkHeight, 8), colour: '#7c5228', at: [x, 0, where] });
    if (i % 3 === 0) {
      // A pointed one.
      for (const [y, radius] of [[1.1, 1.3], [2.1, 1.02], [3, 0.72]]) {
        parts.push({ geometry: new THREE.ConeGeometry(radius * size, 1.7 * size, 12), colour: i % 2 ? '#3f9a58' : '#4aa862', at: [x, (y + 0.7) * size, where] });
      }
    } else {
      const green = ['#5fb954', '#6cc25e', '#54ad50'][i % 3];
      parts.push({ geometry: ball(1.2 * size, 1.1 * size, 1.2 * size), colour: green, at: [x, trunkHeight + 0.9 * size, where] });
      parts.push({ geometry: ball(0.82 * size), colour: '#6ec964', at: [x + 0.7 * size, trunkHeight + 0.45 * size, where + 0.3] });
      parts.push({ geometry: ball(0.78 * size), colour: '#62bc58', at: [x - 0.72 * size, trunkHeight + 0.5 * size, where - 0.2] });
    }
  }
  // Bushes and stones nearer in.
  for (let i = 0; i < 24; i += 1) {
    const x = side() * between(3.6, 14);
    const where = z();
    const size = between(0.5, 0.95);
    if (i % 3 === 2) parts.push({ geometry: ball(0.5 * size, 0.34 * size, 0.42 * size), colour: '#a9b1b8', at: [x, 0.14 * size, where] });
    else {
      parts.push({ geometry: ball(0.8 * size, 0.62 * size, 0.72 * size), colour: i % 2 ? '#5db152' : '#6bbf5e', at: [x, 0.42 * size, where] });
      parts.push({ geometry: ball(0.5 * size, 0.42 * size, 0.46 * size), colour: '#78cb68', at: [x + 0.5 * size, 0.32 * size, where + 0.2] });
    }
  }
  // Flowers along the path.
  const petals = ['#ff7eb6', '#ffd23f', '#ffffff', '#ff8a5c', '#b58cff'];
  for (let i = 0; i < 90; i += 1) {
    const x = side() * between(PATH_WIDTH / 2 + 0.25, 7.5);
    const where = z();
    parts.push({ geometry: limb(0.018, 0.018, 0.2, 5).rotateX(Math.PI), colour: '#3f9a58', at: [x, 0, where] });
    parts.push({ geometry: ball(0.09, 0.07, 0.09), colour: petals[i % petals.length], at: [x, 0.23, where] });
  }
  // A rail fence on each side, the whole way along.
  for (const fenceSide of [-1, 1]) {
    const x = fenceSide * 3.05;
    for (let post = 0; post < STRIP_LENGTH / 5; post += 1) {
      const where = -post * 5;
      parts.push({ geometry: new THREE.BoxGeometry(0.16, 1, 0.16), colour: '#c49a64', at: [x, 0.5, where] });
      parts.push({ geometry: new THREE.BoxGeometry(0.08, 0.1, 5), colour: '#d9b277', at: [x, 0.76, where - 2.5] });
      parts.push({ geometry: new THREE.BoxGeometry(0.08, 0.1, 5), colour: '#d9b277', at: [x, 0.42, where - 2.5] });
    }
  }
  // A village going by: houses, barns and haystacks further out.
  const walls = ['#fff1d6', '#ffe0b8', '#f7d3c4', '#e7efd6', '#f4e3b1'];
  const roofs = ['#d9534f', '#c9683d', '#a8483f', '#4f7fb5', '#b5573a'];
  for (let i = 0; i < 12; i += 1) {
    const x = side() * between(9, 24);
    const where = z();
    const wide = between(2.6, 4.2);
    const deep = between(2.6, 4.4);
    const high = between(2, 3.2);
    const barn = i % 5 === 4;
    parts.push({ geometry: new THREE.BoxGeometry(wide, high, deep), colour: barn ? '#b5413a' : walls[i % walls.length], at: [x, high / 2, where] });
    parts.push({
      geometry: new THREE.ConeGeometry(Math.hypot(wide, deep) * 0.56, wide * 0.5, 4).rotateY(Math.PI / 4).scale(1, 1, deep / wide),
      colour: barn ? '#5c3a2c' : roofs[i % roofs.length],
      at: [x, high + wide * 0.25, where],
    });
    parts.push({ geometry: new THREE.BoxGeometry(wide * 0.26, high * 0.45, 0.06), colour: '#6a4a2e', at: [x, high * 0.23, where + deep / 2 + 0.02] });
    for (const across of [-0.3, 0.3]) {
      parts.push({ geometry: new THREE.BoxGeometry(wide * 0.18, high * 0.2, 0.06), colour: '#8fd0ee', at: [x + across * wide, high * 0.66, where + deep / 2 + 0.02] });
    }
  }
  for (let i = 0; i < 8; i += 1) {
    const x = side() * between(5, 11);
    const where = z();
    parts.push({ geometry: new THREE.CylinderGeometry(0.75, 0.9, 1.3, 10), colour: '#e2bd5c', at: [x, 0.65, where] });
    parts.push({ geometry: new THREE.ConeGeometry(0.78, 0.65, 10), colour: '#d6ad4c', at: [x, 1.6, where] });
  }
  // Tall poles close by, which go past quickly, and strings of flags high overhead.
  const flags = ['#ff5a4f', '#ffd23f', '#3b82f6', '#27c96b', '#a855f7'];
  for (let i = 0; i < 2; i += 1) {
    const where = -STRIP_LENGTH * (0.25 + i * 0.5);
    for (const poleSide of [-1, 1]) {
      parts.push({ geometry: new THREE.CylinderGeometry(0.08, 0.1, 5.8, 8), colour: '#9a7446', at: [poleSide * 3.7, 2.9, where] });
    }
    for (let flag = 0; flag < 11; flag += 1) {
      const across = (flag / 10 - 0.5) * 7.4;
      const sag = 5.6 - (1 - ((flag / 10 - 0.5) * 2) ** 2) * 0.45;
      parts.push({ geometry: new THREE.ConeGeometry(0.2, 0.46, 3).rotateX(Math.PI), colour: flags[flag % flags.length], at: [across, sag, where] });
    }
  }
  for (let i = 0; i < 9; i += 1) {
    const x = (i % 2 ? 1 : -1) * 4.1;
    const where = -((i + 0.5) / 9) * STRIP_LENGTH;
    parts.push({ geometry: new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6), colour: '#566b7d', at: [x, 1.7, where] });
    parts.push({ geometry: ball(0.2), colour: '#fff3c4', at: [x, 3.5, where] });
  }

  const geometry = mergeParts(parts);
  const mesh = new THREE.Mesh(geometry, toonWith({ vertexColors: true }));
  mesh.castShadow = true;
  return mesh;
}

function canvasTexture(size, draw) {
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

function grassTexture() {
  return canvasTexture(64, (ctx, size) => {
    ctx.fillStyle = '#83d27a';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#7bca72';
    ctx.fillRect(0, 0, size, size / 2);
  });
}

function pathTexture() {
  return canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#e4bf85';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 70; i += 1) {
      ctx.fillStyle = i % 3 ? '#d7ae72' : '#efd0a0';
      ctx.beginPath();
      ctx.ellipse(Math.random() * size, Math.random() * size, between(3, 11), between(2, 7), Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#c99c61';
    ctx.fillRect(0, 0, 12, size);
    ctx.fillRect(size - 12, 0, 12, size);
  });
}

/** Chevrons pointing up the texture. The colour comes from the material using it. */
function zoneTexture() {
  return canvasTexture(128, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(size * 0.2, size * 0.72);
    ctx.lineTo(size * 0.5, size * 0.32);
    ctx.lineTo(size * 0.8, size * 0.72);
    ctx.stroke();
  });
}

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#3f9fe8');
  sky.addColorStop(0.52, '#a8def9');
  sky.addColorStop(0.7, '#e4f6ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function arrowTexture(pointsUp, colour) {
  return spriteTexture((ctx) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(0, 0, 47, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.rotate(pointsUp ? 0 : Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.lineTo(28, 2);
    ctx.lineTo(11, 2);
    ctx.lineTo(11, 30);
    ctx.lineTo(-11, 30);
    ctx.lineTo(-11, 2);
    ctx.lineTo(-28, 2);
    ctx.closePath();
    ctx.fill();
  }, 128);
}

/* ------------------------------- the runner ------------------------------- */

// How quickly the legs go. It doesn't go up as fast as the speed, or they'd be nothing but a blur.
const STRIDE_RATE = 3.5;
const STRIDE_POWER = 0.45;
const HOP_SECONDS = 0.65;
const HOP_HEIGHT = 1.1;

class Runner {
  constructor(spec) {
    this.spec = spec;
    this.body = new Fighter3D(spec);
    this.facing = Math.PI;
    this.presenting = false;
    this.phase = 0;
    this.time = Math.random() * 10;
    this.landing = 0;
    this.stumble = 0;
    this.hopLeft = 0;
    this.live = null; // A pose from the child's body, when there is one.
    this.pose = makePose();
    this.target = makePose();
    this.body.setExpression('happy');
    this.onStep = null;
  }

  /** What the body should be doing, from what the run says. */
  update(dt, { speed = 0, top = 5, height = 0, through = 0, jumping = false, sliding = false, won = false, waiting = false }, reducedMotion) {
    this.time += dt;
    const { target, pose } = this;
    Object.assign(target, makePose());

    const stride = clamp(speed / top, 0, 1);
    const before = Math.sin(this.phase);
    this.phase += dt * speed ** STRIDE_POWER * STRIDE_RATE * Math.PI * 0.5;
    const swing = Math.sin(this.phase);
    const lift = Math.cos(this.phase);
    if (!jumping && !sliding && speed > 1 && Math.sign(before) !== Math.sign(swing)) this.onStep?.();

    if (won) {
      const hop = reducedMotion ? 0 : Math.abs(Math.sin(this.time * 4.6));
      Object.assign(target, {
        up: hop * 0.42,
        squash: hop < 0.14 ? 0.08 : -0.03,
        headPitch: -0.2,
        handLX: 0.36 + Math.sin(this.time * 9) * 0.1,
        handLY: 0.92,
        handLZ: 0.1,
        handRX: -0.36 + Math.sin(this.time * 9) * 0.1,
        handRY: 0.92,
        handRZ: 0.1,
        footLX: 0.22,
        footRX: -0.22,
      });
    } else if (jumping) {
      const rising = through < 0.5;
      Object.assign(target, {
        pitch: rising ? 0.05 : 0.2,
        squash: rising ? -0.08 : -0.03,
        headPitch: rising ? -0.25 : 0.1,
        handLX: 0.34,
        handLY: rising ? 0.85 : 0.35,
        handLZ: rising ? 0.3 : 0.45,
        handRX: -0.34,
        handRY: rising ? 0.85 : 0.35,
        handRZ: rising ? 0.3 : 0.45,
        wristL: -0.5,
        wristR: -0.5,
        footLX: 0.2,
        footLY: 0.28,
        footLZ: 0.2,
        footLPitch: -0.5,
        footRX: -0.2,
        footRY: 0.2,
        footRZ: -0.3,
        footRPitch: 0.5,
      });
    } else if (sliding) {
      Object.assign(target, {
        hipDrop: 0.3,
        pitch: 1.05,
        squash: 0.12,
        headPitch: -0.5,
        handLX: 0.5,
        handLY: -0.62,
        handLZ: -0.45,
        handRX: -0.5,
        handRY: -0.62,
        handRZ: -0.45,
        footLX: 0.3,
        footLZ: 0.5,
        footLPitch: -0.5,
        footRX: -0.3,
        footRZ: -0.34,
      });
    } else if (stride > 0.04) {
      Object.assign(target, {
        pitch: 0.1 + stride * 0.2,
        hipDrop: 0.05,
        up: Math.abs(lift) * 0.07 * stride,
        twist: swing * 0.14 * stride,
        handLX: 0.4,
        handLY: -0.56,
        handLZ: 0.2 - swing * 0.46 * stride,
        handRX: -0.4,
        handRY: -0.56,
        handRZ: 0.2 + swing * 0.46 * stride,
        footLX: 0.16,
        footLY: Math.max(0, lift) * 0.3 * stride,
        footLZ: swing * 0.42 * stride,
        footLPitch: -swing * 0.5 * stride,
        footRX: -0.16,
        footRY: Math.max(0, -lift) * 0.3 * stride,
        footRZ: -swing * 0.42 * stride,
        footRPitch: swing * 0.5 * stride,
      });
    } else {
      // Standing, bouncing a little, ready to go.
      const bob = reducedMotion ? 0 : Math.sin(this.time * (waiting ? 5 : 3.2));
      Object.assign(target, {
        hipDrop: 0.05 + bob * 0.025,
        headPitch: waiting ? -0.1 : 0,
        handLX: 0.42,
        handLY: -0.72 + bob * 0.03,
        handLZ: 0.16,
        handRX: -0.42,
        handRY: -0.72 + bob * 0.03,
        handRZ: 0.16,
      });
    }

    // The runner copies the child, so they can see it's them: fully when standing, and in the
    // sinking and a share of the arms when running. It faces the child as a mirror would.
    const { live } = this;
    if (live && !won && !jumping && !sliding) {
      const share = stride > 0.04 && !this.presenting ? 0.35 : 1;
      const mirrored = this.presenting;
      const copy = (key, value) => {
        target[key] += (value - target[key]) * share;
      };
      copy('handLX', mirrored ? -live.handRX : live.handLX);
      copy('handLY', mirrored ? live.handRY : live.handLY);
      copy('handLZ', mirrored ? live.handRZ : live.handLZ);
      copy('handRX', mirrored ? -live.handLX : live.handRX);
      copy('handRY', mirrored ? live.handLY : live.handRY);
      copy('handRZ', mirrored ? live.handLZ : live.handRZ);
      copy('wristL', mirrored ? live.wristR : live.wristL);
      copy('wristR', mirrored ? live.wristL : live.wristR);
      target.openL = mirrored ? live.openR : live.openL;
      target.openR = mirrored ? live.openL : live.openR;
      target.hipDrop = Math.max(target.hipDrop, live.hipDrop);
      if (share === 1) {
        target.pitch = live.pitch * 0.6;
        target.roll = (mirrored ? -1 : 1) * live.roll * 0.6;
      }
    } else if (this.presenting && !won) {
      // Waving to the child, on the choosing screen.
      target.handRX = -0.46 + (reducedMotion ? 0 : Math.sin(this.time * 7) * 0.22);
      target.handRY = 0.84;
      target.handRZ = 0.2;
      target.wristR = 0.12;
    }

    if (this.stumble > 0) {
      this.stumble = Math.max(0, this.stumble - dt);
      const wobble = Math.sin(this.stumble * 18) * 0.12;
      target.pitch = 0.5 + wobble;
      target.roll = wobble;
      target.handLX = 0.7;
      target.handLY = 0.1;
      target.handRX = -0.7;
      target.handRY = 0.1;
    }

    mixPose(pose, pose, target, 1 - Math.exp(-dt * (jumping || sliding ? 22 : 15)));

    // Height follows the arc exactly, so the fighter really is over what it jumps.
    pose.up = jumping ? height : pose.up;
    if (this.hopLeft > 0) {
      // A hop just to show the move was seen, when not on the trail.
      this.hopLeft = Math.max(0, this.hopLeft - dt);
      const through = 1 - this.hopLeft / HOP_SECONDS;
      pose.up = HOP_HEIGHT * 4 * through * (1 - through);
    }
    if (this.landing > 0) {
      this.landing = Math.max(0, this.landing - dt);
      pose.squash = Math.max(pose.squash, this.landing * 0.75);
    }
    this.body.setPose(pose);
    this.body.update(dt);

    this.facing = damp(this.facing, this.presenting ? 0.14 : Math.PI, 7, dt);
    this.body.faceTowards(this.facing);
  }
}

/* ------------------------------- the world ------------------------------- */

export class World {
  constructor(canvas) {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog('#d4f0ff', 62, SEEN_AHEAD + 12);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#a7c7a0', 1.55));
    const sun = new THREE.DirectionalLight('#fff3dc', 2.3);
    sun.position.set(-7, 16, 7);
    sun.target.position.set(0, 0, -9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 24, bottom: -14, near: 1, far: 50 });
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);

    this.buildPlace();
    this.sparks = new Sparks(this.scene);
    this.zoneMap = zoneTexture();
    this.arrows = {
      jump: arrowTexture(true, '#17a84f'),
      squat: arrowTexture(false, '#1f8fe0'),
    };
    this.cue = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.arrows.jump, transparent: true, depthTest: false }));
    this.cue.scale.setScalar(1.05);
    this.cue.visible = false;
    this.cue.renderOrder = 5;
    this.scene.add(this.cue);
    this.cue.scale.setScalar(1.5);
    this.starMap = spriteTexture(SHAPES.star, 96);
    this.buildStarLines();
    this.buildStreaks();
    this.finishGate = buildFinish();
    this.finishGate.visible = false;
    this.scene.add(this.finishGate);

    this.camera = new THREE.PerspectiveCamera(VIEWS.choose.fov, 1, 0.1, 400);
    this.cameraAt = new THREE.Vector3(...VIEWS.choose.at);
    this.cameraLook = new THREE.Vector3(...VIEWS.choose.look);
    this.view = 'choose';
    this.run = null;
    this.runner = null;
    this.time = 0;
    this.items = new Map(); // What's on the trail, by obstacle.
    this.spare = new Map(); // Obstacles ready to use again, by kind.
    this.onStar = null;
    this.frames = 0;
    this.slowFrames = 0;
    this.quality = 2;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  buildPlace() {
    const { scene } = this;
    this.grass = grassTexture();
    this.grass.repeat.set(1, 400 / (GRASS_BAND * 2));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), toonWith({ map: this.grass }));
    ground.position.set(0, -0.02, -120);
    ground.receiveShadow = true;
    scene.add(ground);

    this.path = pathTexture();
    this.path.repeat.set(1, 300 / PATH_REPEAT);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(PATH_WIDTH, 300).rotateX(-Math.PI / 2), toonWith({ map: this.path }));
    path.position.set(0, 0.005, -120);
    path.receiveShadow = true;
    scene.add(path);

    // Hills on the far horizon, which don't move.
    const greens = ['#7fcf79', '#74c671', '#8ad684', '#6bbd69'];
    for (let i = 0; i < 16; i += 1) {
      const across = (i / 15 - 0.5) * 340;
      const size = 28 + (i % 4) * 11;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(size, 26, 14), new THREE.MeshToonMaterial({ color: greens[i % 4], gradientMap: toon(), fog: false }));
      hill.scale.y = 0.42 + (i % 3) * 0.08;
      hill.position.set(across, 0, -190 - (i % 3) * 22);
      scene.add(hill);
    }

    this.strips = [buildStrip(), buildStrip()];
    for (const strip of this.strips) {
      strip.receiveShadow = false;
      scene.add(strip);
    }

    const cloudMaterial = new THREE.SpriteMaterial({ map: spriteTexture(SHAPES.puff, 128), color: '#ffffff', opacity: 0.94, transparent: true, depthWrite: false, fog: false });
    this.clouds = [];
    for (let i = 0; i < 9; i += 1) {
      const cloud = new THREE.Sprite(cloudMaterial);
      const size = 18 + (i % 3) * 8;
      cloud.scale.set(size * 1.6, size * 0.8, 1);
      cloud.position.set(-150 + i * 38, 42 + (i % 3) * 14, -210);
      scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  /** The stars lying along the path. There's only so many at once, and they're used again. */
  buildStarLines() {
    this.linePaint = new THREE.SpriteMaterial({ map: this.starMap, color: '#ffd23f', transparent: true, fog: false });
    this.lineSprites = Array.from({ length: STARS_SHOWN }, () => {
      const sprite = new THREE.Sprite(this.linePaint);
      sprite.scale.setScalar(0.85);
      sprite.visible = false;
      this.scene.add(sprite);
      return sprite;
    });
  }

  /** Thin lines rushing past on both sides, which get clearer the faster the runner goes. */
  buildStreaks() {
    const paint = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.streakLines = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 0.025, 1), paint, STREAKS);
    this.streakLines.frustumCulled = false;
    this.streakSpots = Array.from({ length: STREAKS }, () => ({
      x: (Math.random() < 0.5 ? -1 : 1) * between(STREAK_AREA.near, STREAK_AREA.far),
      y: between(0.3, STREAK_AREA.high),
      z: between(-STREAK_AREA.ahead, STREAK_AREA.behind),
      length: between(1.2, 3.4),
    }));
    this.streakMatrix = new THREE.Matrix4();
    this.scene.add(this.streakLines);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setView(name, { snap = false } = {}) {
    this.view = name;
    if (snap) {
      this.cameraAt.set(...VIEWS[name].at);
      this.cameraLook.set(...VIEWS[name].look);
      this.camera.fov = VIEWS[name].fov;
      this.camera.updateProjectionMatrix();
    }
  }

  setRunner(spec) {
    if (this.runner) {
      this.scene.remove(this.runner.body.root);
      this.runner.body.dispose();
    }
    const presenting = this.runner?.presenting ?? true;
    this.runner = new Runner(spec);
    this.runner.presenting = presenting;
    this.runner.facing = presenting ? 0.14 : Math.PI;
    this.runner.onStep = () => this.onStep?.();
    this.scene.add(this.runner.body.root);
  }

  /** The child's body for the runner to copy, or null when it isn't in the picture. */
  setLive(pose) {
    this.runner.live = pose;
  }

  /** Shows the move was seen, when there's no trail to do it on. */
  hop() {
    this.runner.hopLeft = HOP_SECONDS;
    this.runner.body.setExpression('happy', 1.2);
    this.burst(new THREE.Vector3(-0.1, 1.2, 0), { shapes: ['star', 'spark'], colours: ['#ffd23f', '#ffffff', '#7ee8ff'], count: 12, speed: 2.4, size: 0.26, life: 0.6, gravity: 2 });
  }

  /** A new run. Whatever was on the trail goes, and the new one's obstacles arrive as they near. */
  setRun(run) {
    for (const obstacle of [...this.items.keys()]) this.retire(obstacle);
    this.run = run;
    this.finishGate.visible = false;
    this.cue.visible = false;
    this.won = false;
  }

  /* ---------- what's on the trail ---------- */

  arrive(obstacle) {
    const pool = this.spare.get(obstacle.kind) ?? [];
    const model = pool.pop() ?? OBSTACLE_BUILDERS[obstacle.kind]();
    model.visible = true;
    model.rotation.set(0, 0, 0);
    model.position.set(0, 0, 0);
    this.scene.add(model);

    const reach = this.run.reachDistance;
    const zone = new THREE.Mesh(
      new THREE.PlaneGeometry(PATH_WIDTH - 0.3, reach).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: obstacle.needs === 'jump' ? '#2fd16f' : '#46b7ff', map: this.zoneMap.clone(), transparent: true, opacity: 0.62, depthWrite: false }),
    );
    zone.material.map.repeat.set(1, Math.max(1, Math.round(reach / 1.6)));
    zone.material.map.needsUpdate = true;
    this.scene.add(zone);

    // Stars to catch, where the child will be if they make the move.
    const stars = [0, 1, 2].map((index) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.starMap, color: '#ffd23f', transparent: true }));
      sprite.scale.setScalar(0.62);
      this.scene.add(sprite);
      return { sprite, index, taken: false, at: obstacle.at + obstacle.length * (index * 0.5), y: obstacle.needs === 'jump' ? obstacle.height + 0.85 + (index === 1 ? 0.28 : 0) : 0.72 };
    });

    this.items.set(obstacle, { model, zone, stars, knocked: 0 });
  }

  retire(obstacle) {
    const item = this.items.get(obstacle);
    if (!item) return;
    this.scene.remove(item.model);
    const pool = this.spare.get(obstacle.kind) ?? [];
    pool.push(item.model);
    this.spare.set(obstacle.kind, pool);
    this.scene.remove(item.zone);
    item.zone.geometry.dispose();
    item.zone.material.map.dispose();
    item.zone.material.dispose();
    for (const { sprite } of item.stars) {
      this.scene.remove(sprite);
      sprite.material.dispose();
    }
    this.items.delete(obstacle);
  }

  /** The move counted, so the stars line up along the way it will go. */
  moveCounted({ kind, obstacle, move }) {
    const item = this.items.get(obstacle);
    if (!item) return;
    item.stars.forEach((star) => {
      const through = 0.32 + star.index * 0.19;
      star.at = move.from + move.travel * through;
      star.y = kind === 'jump' ? move.height * 4 * through * (1 - through) + 1 : 0.72;
    });
    item.zone.visible = false;
  }

  moved(kind, counts) {
    this.dust(new THREE.Vector3(0, 0.15, 0), kind === 'squat' ? 10 : counts ? 8 : 5);
    this.runner.body.setExpression('strike', 0.5);
  }

  landed() {
    this.runner.landing = 0.22;
    this.dust(new THREE.Vector3(0, 0.15, 0), 7);
  }

  cleared(obstacle) {
    const item = this.items.get(obstacle);
    if (item) item.zone.visible = false;
    this.cue.visible = false;
    this.runner.body.setExpression('happy', 1.2);
  }

  bumped(obstacle) {
    const item = this.items.get(obstacle);
    if (item) item.knocked = 0.001;
    item?.stars.forEach((star) => {
      star.taken = true;
      star.sprite.visible = false;
    });
    this.cue.visible = false;
    this.runner.stumble = 1;
    this.runner.body.setExpression('hurt', 1);
    const at = new THREE.Vector3(0, 0.8, -0.8);
    this.sparks.emit({ shape: 'star', colour: '#ffffff', at, velocity: [0, 1, this.run.speed], life: 0.4, size: 0.4, spin: 3 });
    this.burst(at, { shapes: ['puff'], colours: ['#fff8e6', '#ffe9c4'], count: 9, speed: 1.8, size: 0.32, grow: 0.7, life: 0.5, opacity: 0.85 });
  }

  /** A star on the path has been run through. */
  tookStar() {
    this.burst(new THREE.Vector3(0, 1.1, -0.2), { shapes: ['spark'], colours: ['#ffd23f', '#ffffff'], count: 3, speed: 1.6, size: 0.18, life: 0.3 });
  }

  celebrate() {
    this.won = true;
    this.runner.presenting = true;
    this.setView('win');
    this.runner.body.setExpression('happy');
  }

  dust(at, count) {
    this.burst(at, { shapes: ['puff'], colours: ['#fff8e6', '#efdcb6'], count, speed: 1.3, size: 0.28, grow: 0.7, life: 0.5, opacity: 0.85, flat: true });
  }

  burst(at, { shapes = ['star'], colours = ['#ffffff'], count = 8, speed = 2, size = 0.24, life = 0.5, gravity = 0, flat = false, grow = 0, opacity = 1 }) {
    const total = Math.max(2, Math.round(count * (this.reducedMotion ? 0.5 : 1)));
    const drift = this.run?.speed ?? 0;
    for (let i = 0; i < total; i += 1) {
      const angle = (i / total) * Math.PI * 2 + Math.random();
      const push = speed * between(0.55, 1.15);
      this.sparks.emit({
        shape: shapes[i % shapes.length],
        colour: colours[i % colours.length],
        at,
        velocity: [Math.cos(angle) * push, (flat ? between(0.1, 0.4) : between(-0.5, 1)) * push, Math.sin(angle) * push + drift * 0.6],
        life: life * between(0.8, 1.2),
        size: size * between(0.75, 1.25),
        grow,
        gravity,
        spin: between(-5, 5),
        opacity,
        drag: flat ? 2.4 : 0.8,
      });
    }
  }

  /* ---------- every frame ---------- */

  /** A slow computer gives up sharpness and then shadows, so that moves still feel immediate. */
  watchSpeed(dt) {
    this.frames += 1;
    if (dt > 1 / 40) this.slowFrames += 1;
    if (this.frames < 90) return;
    const slow = this.slowFrames > this.frames * 0.5;
    this.frames = 0;
    this.slowFrames = 0;
    if (!slow || this.quality === 0) return;
    this.quality -= 1;
    if (this.quality === 1) {
      this.renderer.setPixelRatio(1);
      this.resize();
    } else {
      this.renderer.shadowMap.enabled = false;
      this.scene.traverse((node) => {
        if (node.material) node.material.needsUpdate = true;
      });
    }
  }

  update(dt) {
    this.time += dt;
    this.watchSpeed(dt);
    const { run } = this;
    const distance = run?.distance ?? 0;

    // Sliding past: a strip covers the trail for its length, and then the next one takes over.
    const shift = distance % STRIP_LENGTH;
    this.strips[0].position.z = shift;
    this.strips[1].position.z = shift - STRIP_LENGTH;
    this.grass.offset.y = (distance / (GRASS_BAND * 2)) % 1;
    this.path.offset.y = (distance / PATH_REPEAT) % 1;

    if (!this.reducedMotion) {
      for (const cloud of this.clouds) {
        cloud.position.x += dt * 0.6;
        if (cloud.position.x > 190) cloud.position.x = -190;
      }
    }

    if (run) this.updateTrail(dt, distance);
    this.updateStarLines(distance);
    this.updateStreaks(dt);
    this.sparks.update(dt);
    if (this.runner) {
      this.runner.update(dt, run
        ? {
            speed: run.speed,
            top: run.settings.speed,
            height: run.air.height,
            through: run.air.through,
            jumping: run.move?.kind === 'jump',
            sliding: run.move?.kind === 'squat',
            waiting: run.waiting,
            won: this.won,
          }
        : {}, this.reducedMotion);
    }
    this.updateCamera(dt);
  }

  updateTrail(dt, distance) {
    const { run } = this;

    for (const obstacle of run.course) {
      const ahead = obstacle.at - distance;
      const item = this.items.get(obstacle);
      if (!item) {
        if (ahead < SEEN_AHEAD && ahead > -SEEN_BEHIND) this.arrive(obstacle);
        continue;
      }
      if (ahead < -SEEN_BEHIND) {
        this.retire(obstacle);
        continue;
      }
      item.model.position.z = -ahead;
      if (item.knocked > 0) {
        // Knocked aside, and out of the way.
        item.knocked = Math.min(1, item.knocked + dt * 2.2);
        const eased = item.knocked * (2 - item.knocked);
        item.model.position.x = eased * 7;
        item.model.rotation.z = -eased * 0.5;
      }
      const reach = run.reachDistance;
      item.zone.position.set(0, 0.03, -ahead + reach / 2);
      if (obstacle.state === 'ahead' && ahead <= reach) item.zone.material.opacity = 0.82;

      for (const star of item.stars) {
        if (star.taken) continue;
        const bob = this.reducedMotion ? 0 : Math.sin(this.time * 3 + star.index) * 0.08;
        star.sprite.position.set(0, star.y + bob, -(star.at - distance));
        star.sprite.material.rotation = this.reducedMotion ? 0 : Math.sin(this.time * 2 + star.index) * 0.3;
        if (distance >= star.at && obstacle.state !== 'ahead') {
          star.taken = true;
          star.sprite.visible = false;
          this.burst(new THREE.Vector3(0, star.y, 0), { shapes: ['spark', 'star'], colours: ['#ffd23f', '#ffffff'], count: 6, speed: 1.6, size: 0.2, life: 0.42 });
          this.onStar?.();
        }
      }
    }

    // The arrow over what's next, once the move would count.
    const next = run.next;
    const asking = next && run.inReach(next) && next.state === 'ahead';
    this.cue.visible = Boolean(asking);
    if (asking) {
      this.cue.material.map = this.arrows[next.needs];
      const bob = this.reducedMotion ? 0 : Math.sin(this.time * 6) * 0.14;
      this.cue.position.set(0, (next.needs === 'jump' ? next.height + 1.9 : 3.2) + bob, -(next.at - distance));
    }

    const gateAhead = run.end - distance;
    this.finishGate.visible = gateAhead < SEEN_AHEAD && gateAhead > -SEEN_BEHIND;
    this.finishGate.position.z = -gateAhead;
  }

  updateStarLines(distance) {
    const { run, lineSprites } = this;
    let used = 0;
    if (run && this.view === 'run') {
      for (let i = run.nextStar; i < run.starLines.length && used < lineSprites.length; i += 1) {
        const ahead = run.starLines[i].at - distance;
        if (ahead > STARS_SEEN_AHEAD) break;
        const bob = this.reducedMotion ? 0 : Math.sin(this.time * 4 + i * 0.7) * 0.1;
        lineSprites[used].position.set(0, 1.25 + bob, -ahead);
        lineSprites[used].visible = true;
        used += 1;
      }
      this.linePaint.rotation = this.reducedMotion ? 0 : Math.sin(this.time * 3) * 0.35;
    }
    for (let i = used; i < lineSprites.length; i += 1) lineSprites[i].visible = false;
  }

  updateStreaks(dt) {
    const { run, streakLines, streakSpots, streakMatrix } = this;
    const speed = this.view === 'run' ? run?.speed ?? 0 : 0;
    const wanted = this.reducedMotion ? 0 : clamp((speed - 6) / 26, 0, 1) * 0.5;
    const paint = streakLines.material;
    paint.opacity = damp(paint.opacity, wanted, 4, dt);
    streakLines.visible = paint.opacity > 0.01;
    if (!streakLines.visible) return;
    streakSpots.forEach((spot, index) => {
      spot.z += speed * 2 * dt;
      if (spot.z > STREAK_AREA.behind) spot.z -= STREAK_AREA.ahead + STREAK_AREA.behind;
      streakMatrix.makeScale(1, 1, spot.length * (0.5 + speed / 16));
      streakMatrix.setPosition(spot.x, spot.y, spot.z);
      streakLines.setMatrixAt(index, streakMatrix);
    });
    streakLines.instanceMatrix.needsUpdate = true;
  }

  /** The view widens as the runner goes faster than its usual speed, in a dash. */
  wantedFov(view) {
    const { run } = this;
    if (this.view !== 'run' || !run || this.reducedMotion) return view.fov;
    const { speed } = run.settings;
    return view.fov + clamp((run.speed - speed) / speed, 0, 1) * DASH_FOV;
  }

  updateCamera(dt) {
    const view = VIEWS[this.view];
    const rate = this.view === 'run' ? 3.2 : 2.2;
    this.cameraAt.x = damp(this.cameraAt.x, view.at[0], rate, dt);
    this.cameraAt.y = damp(this.cameraAt.y, view.at[1] + (this.view === 'run' ? (this.run?.air.height ?? 0) * 0.14 : 0), rate, dt);
    this.cameraAt.z = damp(this.cameraAt.z, view.at[2], rate, dt);
    this.cameraLook.x = damp(this.cameraLook.x, view.look[0], rate, dt);
    this.cameraLook.y = damp(this.cameraLook.y, view.look[1], rate, dt);
    this.cameraLook.z = damp(this.cameraLook.z, view.look[2], rate, dt);
    const fov = damp(this.camera.fov, this.wantedFov(view), rate, dt);
    if (Math.abs(fov - this.camera.fov) > 0.001) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.cameraAt);
    this.camera.lookAt(this.cameraLook);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
