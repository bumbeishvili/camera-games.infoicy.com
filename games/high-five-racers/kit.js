// The small tools the 3D world is built with. Everything is drawn from simple shapes joined
// together, so there are no model files, and a whole village or forest costs one draw call.
import * as THREE from '../../vendor/three/three.module.js';

export const { clamp, damp, lerp } = THREE.MathUtils;
export const TAU = Math.PI * 2;
export const mod = (value, size) => ((value % size) + size) % size;

export function smoothstep(value, low, high) {
  const t = clamp((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
}

export function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Each triangle gets its own corners, so faces stay flat and the low-poly look stays crisp. */
export function faceted(geometry) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.computeVertexNormals();
  return flat;
}

function ownCorners(geometry) {
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

/** Roof shape: a wedge one unit wide, long and high, sitting on y = 0 with its ridge along X. */
function prismGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0, 1);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  geometry.translate(0, 0, -0.5);
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

/** The shapes everything is built from. Each is about one unit across, centred on the origin. */
export const SHAPES = {
  box: ownCorners(new THREE.BoxGeometry(1, 1, 1)),
  cylinder: ownCorners(new THREE.CylinderGeometry(0.5, 0.5, 1, 10)),
  post: ownCorners(new THREE.CylinderGeometry(0.5, 0.5, 1, 6)),
  taper: ownCorners(new THREE.CylinderGeometry(0.3, 0.5, 1, 7)),
  cone: faceted(new THREE.ConeGeometry(0.5, 1, 8)),
  spire: faceted(new THREE.ConeGeometry(0.5, 1, 6)),
  rock: faceted(new THREE.DodecahedronGeometry(0.5, 0)),
  blob: faceted(new THREE.IcosahedronGeometry(0.5, 1)),
  ball: ownCorners(new THREE.SphereGeometry(0.5, 12, 8)),
  roof: faceted(prismGeometry()),
  ring: ownCorners(new THREE.TorusGeometry(0.5, 0.08, 6, 20)),
  disc: ownCorners(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16)),
};

const scratchColour = new THREE.Color();
const paints = new Map();

/** A colour in the renderer's working space, cached as there are only a few dozen in use. */
function paintOf(colour) {
  let paint = paints.get(colour);
  if (!paint) {
    scratchColour.set(colour);
    paint = [scratchColour.r, scratchColour.g, scratchColour.b];
    paints.set(colour, paint);
  }
  return paint;
}

const scratch = {
  matrix: new THREE.Matrix4(),
  normal: new THREE.Matrix3(),
  position: new THREE.Vector3(),
  size: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  euler: new THREE.Euler(0, 0, 0, 'YXZ'),
  point: new THREE.Vector3(),
};

/**
 * Collects coloured shapes and joins them into one geometry.
 *
 *   mesher.at(x, y, z, turn, (m) => m.box('#fff', 0, 2, 0, 6, 4, 5));
 *
 * Positions inside `at` are relative to that spot. `shade` darkens the bottom of a shape, which
 * makes flat-coloured low-poly things look much more solid for no cost at all.
 */
export class Mesher {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colours = [];
    this.parent = new THREE.Matrix4();
  }

  get isEmpty() {
    return this.positions.length === 0;
  }

  at(x, y, z, turn, draw) {
    const saved = this.parent.clone();
    scratch.euler.set(0, turn, 0);
    scratch.quaternion.setFromEuler(scratch.euler);
    scratch.position.set(x, y, z);
    scratch.size.set(1, 1, 1);
    this.parent.multiply(scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.size));
    draw(this);
    this.parent.copy(saved);
    return this;
  }

  add(shape, colour, x, y, z, sx = 1, sy = sx, sz = sx, { rx = 0, ry = 0, rz = 0, shade = 1 } = {}) {
    const geometry = typeof shape === 'string' ? SHAPES[shape] : shape;
    scratch.euler.set(rx, ry, rz);
    scratch.quaternion.setFromEuler(scratch.euler);
    scratch.position.set(x, y, z);
    scratch.size.set(sx, sy, sz);
    const matrix = scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.size).premultiply(this.parent);
    scratch.normal.getNormalMatrix(matrix);

    const paint = paintOf(colour);
    const p = geometry.attributes.position;
    const n = geometry.attributes.normal;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const low = geometry.boundingBox.min.y;
    const high = geometry.boundingBox.max.y;
    const span = Math.max(1e-6, high - low);
    const point = scratch.point;
    const count = geometry.index ? geometry.index.count : p.count;
    for (let corner = 0; corner < count; corner += 1) {
      const i = geometry.index ? geometry.index.getX(corner) : corner;
      const up = shade === 1 ? 1 : lerp(shade, 1, (p.getY(i) - low) / span);
      this.colours.push(paint[0] * up, paint[1] * up, paint[2] * up);
      point.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(matrix);
      this.positions.push(point.x, point.y, point.z);
      point.set(n.getX(i), n.getY(i), n.getZ(i)).applyMatrix3(scratch.normal).normalize();
      this.normals.push(point.x, point.y, point.z);
    }
    return this;
  }

  box(colour, x, y, z, sx, sy = sx, sz = sx, options) {
    return this.add('box', colour, x, y, z, sx, sy, sz, options);
  }

  /** A flat triangle with its own colour, for pennants and banners. */
  triangle(colour, a, b, c) {
    const paint = paintOf(colour);
    const corners = [a, b, c].map(([x, y, z]) => new THREE.Vector3(x, y, z).applyMatrix4(this.parent));
    const normal = new THREE.Vector3().subVectors(corners[1], corners[0]).cross(new THREE.Vector3().subVectors(corners[2], corners[0])).normalize();
    for (const corner of corners) {
      this.positions.push(corner.x, corner.y, corner.z);
      this.normals.push(normal.x, normal.y, normal.z);
      this.colours.push(paint[0], paint[1], paint[2]);
    }
    return this;
  }

  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colours, 3));
    return geometry;
  }
}

/** Draws on a canvas and returns it as a texture ready for colour. */
export function canvasTexture(width, height, draw, { repeat = false, anisotropy = 8 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  return texture;
}

export function softCircleTexture(inner, outer, size = 128) {
  return canvasTexture(size, size, (ctx) => {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(0.45, inner);
    gradient.addColorStop(1, outer);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });
}

/** The five-pointed star the game uses everywhere, as a path on a canvas. */
export function starPath(ctx, x, y, outer, inner = outer * 0.46, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 ? inner : outer;
    const angle = (i / points) * Math.PI - Math.PI / 2;
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
}

/** An open cartoon hand on a canvas, fingers up. size is its height. */
export function handPath(ctx, x, y, size) {
  const unit = size / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(unit, unit);
  ctx.lineCap = 'round';
  ctx.lineWidth = 13;
  const strokeWas = ctx.strokeStyle;
  ctx.strokeStyle = ctx.fillStyle;
  for (const [fromX, toX, toY] of [[-18, -27, -30], [-6, -9, -46], [7, 8, -48], [19, 25, -36]]) {
    ctx.beginPath();
    ctx.moveTo(fromX, 8);
    ctx.lineTo(toX, toY);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(22, 20);
  ctx.lineTo(44, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-27, 0, 54, 44, 18);
  ctx.fill();
  ctx.strokeStyle = strokeWas;
  ctx.restore();
}
