// What the robots look like and how they move, the cages, and the friends locked up in them. All of it
// is original, made of simple shapes: tin wind-up robots with a key turning on their backs, buzzing
// drones, little ones on springs, and the big one at the end. They're big, bright and silly, and when
// they've had enough they fall apart into bolts and stars. They're never anything but robots.
import * as THREE from '../../vendor/three/three.module.js';
import { Fighter3D, curl, limb, makePose, mergeParts, outlineMaterial, roundedBox, star, toon } from '../../core/body/characters.js';
import { BIG_SPOTS } from './rescue.js';

const INK = '#1d2740';
const EYE_WHITE = '#ffffff';
const PUPIL = '#16203a';
const SHOT_COLOURS = ['#ff7eb6', '#3fb7ff', '#ffd23f', '#7be36a'];
const MOST_SPLATS = 12;

// Paint for tin: each robot gets one of these, so a crowd of them isn't all the same.
const PAINTS = [
  { tin: '#3cc2b4', dark: '#27897f', trim: '#ffc83d', plate: '#fff1d0', glow: '#ff6b57' },
  { tin: '#f58a3c', dark: '#b85f22', trim: '#5fd0e8', plate: '#fff1d0', glow: '#ffe14d' },
  { tin: '#8f74f0', dark: '#624bb5', trim: '#ffd23f', plate: '#f3edff', glow: '#7be36a' },
  { tin: '#ef6a7c', dark: '#b3434f', trim: '#ffe08a', plate: '#fff1e6', glow: '#59d7ff' },
  { tin: '#5aa7ee', dark: '#3a72ae', trim: '#ffb347', plate: '#eef7ff', glow: '#ff7eb6' },
];

// Round things, simpler than the characters' own, as there can be a lot of robots at once.
const ball = (x = 1, y = x, z = x) => new THREE.SphereGeometry(1, 14, 10).scale(x, y, z);
/** A flat round shape, facing up. */
const disc = (radius, height = 0.1, sides = 24) => new THREE.CylinderGeometry(radius, radius, height, sides);
/** The same, facing the front. */
const face = (radius, height = 0.1, sides = 24) => disc(radius, height, sides).rotateX(Math.PI / 2);

const toonWith = (options) => new THREE.MeshToonMaterial({ gradientMap: toon(), ...options });
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));

const sharedPaint = toonWith({ vertexColors: true });
const sharedLine = outlineMaterial(INK, 0.022);
const bigLine = outlineMaterial(INK, 0.05);
const eyeWhite = new THREE.MeshBasicMaterial({ color: EYE_WHITE });
const eyeDark = new THREE.MeshBasicMaterial({ color: PUPIL });

/** Joins shapes into one, with an ink line round it. Returns the geometry, to be shared. */
const joined = (parts) => mergeParts(parts);

/** One movable piece of a robot: the shape and its ink line. */
function piece(geometry, line = sharedLine) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, sharedPaint), new THREE.Mesh(geometry, line));
  return group;
}

const eyeWhites = new THREE.SphereGeometry(1, 14, 10).scale(1, 1.1, 0.5);
const eyePupils = new THREE.SphereGeometry(1, 12, 8).scale(0.5, 0.58, 0.22);
const browShape = new THREE.BoxGeometry(1, 1, 1);

function makeEye(size, parent, x, y, z) {
  const white = new THREE.Mesh(eyeWhites, eyeWhite);
  white.scale.setScalar(size);
  white.position.set(x, y, z);
  const pupil = new THREE.Mesh(eyePupils, eyeDark);
  pupil.scale.setScalar(size);
  pupil.position.set(x, y - size * 0.05, z + size * 0.42);
  parent.add(white, pupil);
  return { white, pupil };
}

function makeBrow(parent, width, height, depth, x, y, z, turn) {
  const brow = new THREE.Mesh(browShape, eyeDark);
  brow.scale.set(width, height, depth);
  brow.position.set(x, y, z);
  brow.rotation.z = turn;
  parent.add(brow);
  return brow;
}

/* ---------- shapes, made once and shared ---------- */

const shapes = new Map();
function shapesFor(kind, paintIndex, make) {
  const key = `${kind} ${paintIndex}`;
  if (!shapes.has(key)) shapes.set(key, make(PAINTS[paintIndex]));
  return shapes.get(key);
}

function walkerShapes(paint) {
  const { tin, dark, trim, plate, glow } = paint;
  const rivets = [];
  for (const [x, y] of [[-0.56, 1.82], [0.56, 1.82], [-0.56, 0.9], [0.56, 0.9], [0, 1.86], [0, 0.86]]) {
    rivets.push({ geometry: ball(0.05), colour: trim, at: [x, y, 0.46] });
  }
  return {
    body: joined([
      { geometry: roundedBox(1.34, 1.14, 0.96, 0.16), colour: tin, at: [0, 1.36, 0] },
      { geometry: roundedBox(1.42, 0.16, 1.02, 0.06), colour: dark, at: [0, 0.9, 0] },
      { geometry: roundedBox(0.92, 0.64, 0.08, 0.03), colour: plate, at: [0, 1.42, 0.47] },
      { geometry: ball(0.17, 0.17, 0.05), colour: '#ffffff', at: [-0.2, 1.48, 0.52] },
      { geometry: roundedBox(0.03, 0.14, 0.03, 0.01), colour: glow, at: [-0.2, 1.53, 0.56], turn: [0, 0, -0.6] },
      { geometry: ball(0.07), colour: glow, at: [0.14, 1.56, 0.51] },
      { geometry: ball(0.07), colour: trim, at: [0.32, 1.56, 0.51] },
      { geometry: roundedBox(0.34, 0.06, 0.04, 0.02), colour: dark, at: [0.23, 1.38, 0.52] },
      { geometry: roundedBox(0.34, 0.06, 0.04, 0.02), colour: dark, at: [0.23, 1.26, 0.52] },
      { geometry: roundedBox(0.72, 0.06, 0.04, 0.02), colour: dark, at: [0, 1.18, 0.52] },
      { geometry: disc(0.24, 0.2, 14), colour: dark, at: [0, 2, 0] },
      ...rivets,
    ]),
    head: joined([
      { geometry: roundedBox(1.08, 0.78, 0.86, 0.2), colour: tin, at: [0, 0.4, 0] },
      { geometry: roundedBox(1.14, 0.12, 0.92, 0.05), colour: dark, at: [0, 0.76, 0] },
      { geometry: limb(0.03, 0.03, 0.34).rotateX(Math.PI), colour: dark, at: [0, 0.8, 0] },
      { geometry: ball(0.11), colour: glow, at: [0, 1.18, 0] },
      { geometry: roundedBox(0.12, 0.3, 0.3, 0.05), colour: trim, at: [0.59, 0.42, 0] },
      { geometry: roundedBox(0.12, 0.3, 0.3, 0.05), colour: trim, at: [-0.59, 0.42, 0] },
      // A wide, silly grin with square teeth.
      { geometry: roundedBox(0.6, 0.18, 0.05, 0.03), colour: '#2a2438', at: [0, 0.14, 0.42] },
      ...[-0.2, -0.067, 0.067, 0.2].map((x) => ({ geometry: new THREE.BoxGeometry(0.11, 0.13, 0.03), colour: '#ffffff', at: [x, 0.14, 0.45] })),
    ]),
    arm: joined([
      { geometry: ball(0.2), colour: trim },
      { geometry: limb(0.11, 0.1, 0.62), colour: dark, at: [0, -0.04, 0] },
      { geometry: ball(0.2, 0.17, 0.2), colour: trim, at: [0, -0.78, 0] },
    ]),
    leg: joined([
      { geometry: limb(0.15, 0.13, 0.48), colour: dark },
      { geometry: roundedBox(0.46, 0.26, 0.72, 0.11), colour: tin, at: [0, -0.62, 0.1] },
      { geometry: roundedBox(0.48, 0.07, 0.74, 0.03), colour: dark, at: [0, -0.74, 0.1] },
    ]),
    key: joined([
      { geometry: limb(0.05, 0.05, 0.26).rotateX(Math.PI / 2), colour: trim },
      { geometry: ball(0.25, 0.14, 0.03), colour: trim, at: [0.2, 0, -0.27] },
      { geometry: ball(0.25, 0.14, 0.03), colour: trim, at: [-0.2, 0, -0.27] },
    ]),
  };
}

function peekerShapes(paint) {
  const { tin, dark, trim, plate, glow } = paint;
  const coil = [];
  const turns = 5;
  for (let i = 0; i <= turns * 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    coil.push([Math.cos(angle) * 0.24, (i / (turns * 10)) * 1, Math.sin(angle) * 0.24]);
  }
  return {
    spring: mergeParts([{ geometry: curl(coil, 0.05, 0.05, { sides: 6, steps: 70 }), colour: '#c2ccd6' }]),
    head: joined([
      { geometry: ball(0.66, 0.6, 0.6), colour: tin, at: [0, 0.5, 0] },
      { geometry: ball(0.68, 0.14, 0.62), colour: dark, at: [0, 0.2, 0] },
      { geometry: roundedBox(0.54, 0.16, 0.05, 0.03), colour: '#2a2438', at: [0, 0.32, 0.56] },
      ...[-0.16, 0, 0.16].map((x) => ({ geometry: new THREE.BoxGeometry(0.12, 0.11, 0.03), colour: plate, at: [x, 0.33, 0.59] })),
      { geometry: limb(0.03, 0.03, 0.34).rotateX(Math.PI), colour: dark, at: [0, 1.04, 0] },
      { geometry: ball(0.11), colour: glow, at: [0, 1.42, 0] },
      { geometry: ball(0.09), colour: trim, at: [0.62, 0.56, 0.18] },
      { geometry: ball(0.09), colour: trim, at: [-0.62, 0.56, 0.18] },
      { geometry: ball(0.16), colour: trim, at: [0.72, 0.26, 0.16] },
      { geometry: ball(0.16), colour: trim, at: [-0.72, 0.26, 0.16] },
    ]),
  };
}

function droneShapes(paint) {
  const { tin, dark, trim, glow } = paint;
  return {
    body: joined([
      { geometry: ball(1.05, 0.36, 1.05), colour: tin },
      { geometry: ball(1.1, 0.1, 1.1), colour: trim, at: [0, -0.02, 0] },
      { geometry: ball(0.62, 0.3, 0.62), colour: dark, at: [0, -0.24, 0] },
      { geometry: limb(0.04, 0.04, 0.42).rotateX(Math.PI), colour: dark, at: [0, 0.4, 0] },
      { geometry: ball(0.08), colour: glow, at: [0.8, 0.14, 0.45] },
      { geometry: ball(0.08), colour: glow, at: [-0.8, 0.14, 0.45] },
      // A bucket of goo hanging underneath.
      { geometry: limb(0.26, 0.2, 0.34), colour: dark, at: [0, -0.5, 0] },
      { geometry: ball(0.22, 0.1, 0.22), colour: '#9bea3f', at: [0, -0.5, 0] },
    ]),
    rotor: joined([
      { geometry: roundedBox(1.9, 0.05, 0.22, 0.02), colour: '#3a4356' },
      { geometry: roundedBox(0.22, 0.05, 1.9, 0.02), colour: '#3a4356' },
      { geometry: ball(0.09), colour: trim, at: [0, 0.03, 0] },
    ]),
  };
}

const WHEEL_RADIUS = 0.78;

/** A little tin dome on one big wheel, with its arms out for balance: it comes on the higher levels. */
function rollerShapes(paint) {
  const { tin, dark, trim, plate, glow } = paint;
  return {
    // The wheel turns, so all of it is close in brightness: spokes that stood out from the hub would
    // flicker as they went round.
    wheel: joined([
      { geometry: new THREE.TorusGeometry(0.62, 0.16, 10, 28), colour: '#3a4356' },
      { geometry: face(0.5, 0.12, 22), colour: dark },
      { geometry: roundedBox(0.1, 0.96, 0.15, 0.04), colour: tin },
      { geometry: roundedBox(0.96, 0.1, 0.15, 0.04), colour: tin },
      { geometry: ball(0.13), colour: dark, at: [0, 0, 0.08] },
      { geometry: ball(0.13), colour: dark, at: [0, 0, -0.08] },
    ]),
    fork: joined([
      { geometry: roundedBox(0.14, 0.86, 0.12, 0.04), colour: dark, at: [0, 0.36, 0.22] },
      { geometry: roundedBox(0.14, 0.86, 0.12, 0.04), colour: dark, at: [0, 0.36, -0.22] },
      { geometry: roundedBox(0.3, 0.12, 0.6, 0.04), colour: trim, at: [0, 0.8, 0] },
    ]),
    body: joined([
      { geometry: ball(0.66, 0.56, 0.6), colour: tin, at: [0, 0.34, 0] },
      { geometry: ball(0.7, 0.12, 0.64), colour: dark, at: [0, 0.04, 0] },
      { geometry: roundedBox(0.5, 0.14, 0.05, 0.03), colour: '#2a2438', at: [0, 0.2, 0.55] },
      ...[-0.13, 0, 0.13].map((x) => ({ geometry: new THREE.BoxGeometry(0.1, 0.1, 0.03), colour: plate, at: [x, 0.21, 0.58] })),
      { geometry: limb(0.03, 0.03, 0.3).rotateX(Math.PI), colour: dark, at: [0, 0.86, 0] },
      { geometry: ball(0.1), colour: glow, at: [0, 1.2, 0] },
      { geometry: ball(0.11), colour: trim, at: [0.64, 0.26, 0.08] },
      { geometry: ball(0.11), colour: trim, at: [-0.64, 0.26, 0.08] },
    ]),
    arm: joined([
      { geometry: ball(0.13), colour: trim },
      { geometry: limb(0.07, 0.06, 0.46), colour: dark, at: [0, -0.02, 0] },
      { geometry: ball(0.14), colour: trim, at: [0, -0.58, 0] },
    ]),
  };
}

function bigShapes() {
  const tin = '#4f8fd8';
  const dark = '#2f5f9e';
  const trim = '#ffc83d';
  const plate = '#e9f0f7';
  const rivets = [];
  for (const x of [-2.75, -1.4, 0, 1.4, 2.75]) {
    for (const y of [2.82, 7.12]) rivets.push({ geometry: ball(0.1), colour: trim, at: [x, y, 1.72] });
  }
  return {
    body: joined([
      { geometry: roundedBox(6.2, 4.7, 3.4, 0.5), colour: tin, at: [0, 4.95, 0] },
      { geometry: roundedBox(6.5, 0.46, 3.7, 0.16), colour: dark, at: [0, 2.72, 0] },
      { geometry: roundedBox(4.8, 3.4, 0.2, 0.1), colour: plate, at: [0, 4.75, 1.66] },
      { geometry: roundedBox(1.9, 1, 1.6, 0.2), colour: dark, at: [0, 7.5, 0] },
      // A chimney on one shoulder, puffing away.
      { geometry: limb(0.42, 0.5, 1.5).rotateX(Math.PI), colour: dark, at: [-2.2, 7.2, -0.9] },
      { geometry: limb(0.54, 0.54, 0.26).rotateX(Math.PI), colour: trim, at: [-2.2, 8.7, -0.9] },
      ...rivets,
    ]),
    head: joined([
      { geometry: roundedBox(3.1, 2.1, 2.5, 0.42), colour: tin, at: [0, 1, 0] },
      { geometry: roundedBox(3.2, 0.3, 2.6, 0.12), colour: dark, at: [0, 2.05, 0] },
      { geometry: roundedBox(2.2, 0.56, 0.1, 0.1), colour: '#2a2438', at: [0, 0.36, 1.24] },
      ...[-0.8, -0.4, 0, 0.4, 0.8].map((x) => ({ geometry: new THREE.BoxGeometry(0.34, 0.4, 0.06), colour: '#ffffff', at: [x, 0.36, 1.3] })),
      { geometry: limb(0.07, 0.06, 0.9).rotateX(Math.PI), colour: dark, at: [0.9, 2.1, 0] },
      { geometry: ball(0.25), colour: '#ff6b57', at: [0.9, 3.05, 0] },
      { geometry: roundedBox(0.3, 0.8, 0.8, 0.1), colour: trim, at: [1.66, 1.1, 0] },
      { geometry: roundedBox(0.3, 0.8, 0.8, 0.1), colour: trim, at: [-1.66, 1.1, 0] },
    ]),
    arm: joined([
      { geometry: ball(1.2), colour: trim },
      { geometry: limb(0.55, 0.5, 2.4), colour: dark, at: [0, -0.5, 0] },
      { geometry: ball(0.82, 0.74, 0.82), colour: tin, at: [0, -3.2, 0] },
      { geometry: roundedBox(0.5, 0.9, 0.9, 0.2), colour: trim, at: [0.4, -3.8, 0] },
      { geometry: roundedBox(0.5, 0.9, 0.9, 0.2), colour: trim, at: [-0.4, -3.8, 0] },
    ]),
    leg: joined([
      { geometry: limb(0.78, 0.7, 1.7), colour: dark },
      { geometry: roundedBox(1.8, 0.8, 2.6, 0.3), colour: tin, at: [0, -2.05, 0.4] },
      { geometry: roundedBox(1.9, 0.2, 2.7, 0.08), colour: dark, at: [0, -2.38, 0.4] },
    ]),
    key: joined([
      { geometry: limb(0.18, 0.18, 1).rotateX(Math.PI / 2), colour: trim },
      { geometry: ball(0.95, 0.5, 0.12), colour: trim, at: [0.78, 0, -1.05] },
      { geometry: ball(0.95, 0.5, 0.12), colour: trim, at: [-0.78, 0, -1.05] },
    ]),
    door: joined([
      { geometry: face(0.8, 0.12), colour: '#8a9bb0', at: [0.8, 0, 0] },
      { geometry: face(0.5, 0.04), colour: '#a9b8ca', at: [0.8, 0, 0.07] },
      { geometry: ball(0.13), colour: trim, at: [1.34, 0, 0.1] },
    ]),
    hole: joined([
      { geometry: face(0.86, 0.08), colour: '#20283a' },
      { geometry: new THREE.TorusGeometry(0.88, 0.09, 8, 28), colour: trim },
    ]),
    star: joined([{ geometry: star(0.7, 0.31, 0.14), colour: '#ffd23f', at: [0, 0, 0.04] }]),
  };
}

/* ---------- a robot on the screen ---------- */

const splatShape = new THREE.SphereGeometry(1, 8, 6);
const splatPaints = SHOT_COLOURS.map((colour) => toonWith({ color: colour }));

class RobotView {
  /** place is the group for where it stands. robot is its record in the rules. */
  constructor(robot, reducedMotion) {
    this.robot = robot;
    this.reducedMotion = reducedMotion;
    this.root = new THREE.Group();
    this.pieces = [];
    this.splats = 0;
    this.time = robot.phase;
    this.yaw = 0;
    this.lastX = robot.x;
    this.lastZ = robot.z;
    this.waving = 0;
    this.shadow = null;
  }

  add(group, x = 0, y = 0, z = 0, parent = this.root) {
    group.position.set(x, y, z);
    parent.add(group);
    this.pieces.push(group);
    return group;
  }

  /** Where shots land and the crosshair goes, in the world. */
  aimPoint(target) {
    return this.root.localToWorld(target.set(0, this.aimHeight, 0));
  }

  /** A spot of paint where a shot has landed. */
  splat(colour) {
    if (this.splats >= MOST_SPLATS || !this.bodyPiece) return;
    this.splats += 1;
    const blob = new THREE.Mesh(splatShape, splatPaints[colour]);
    const [wide, high, low] = this.splatArea;
    const size = (0.09 + Math.random() * 0.1) * this.splatSize;
    blob.scale.set(size, size * (0.7 + Math.random() * 0.5), size * 0.35);
    blob.position.set((Math.random() - 0.5) * wide, low + Math.random() * (high - low), this.splatDepth);
    this.bodyPiece.add(blob);
  }

  /** How the whole robot shakes when it's hit. Off for anyone who prefers reduced motion. */
  shake() {
    const { shakeFor } = this.robot;
    if (shakeFor <= 0 || this.reducedMotion) return 0;
    return Math.sin(this.time * 46) * shakeFor * 0.5;
  }
}

/** The face towards the tram: the place's own z runs towards it. */
const towardsTram = (x, z) => Math.atan2(-x, z);

class WalkerView extends RobotView {
  constructor(robot, reducedMotion) {
    super(robot, reducedMotion);
    const shape = shapesFor('walker', robot.paint % PAINTS.length, walkerShapes);
    this.aimHeight = 1.5;
    this.splatArea = [1.1, 1.7, 1];
    this.splatSize = 1;
    this.splatDepth = 0.5;
    this.lift = new THREE.Group();
    this.root.add(this.lift);
    this.bodyPiece = this.add(piece(shape.body), 0, 0, 0, this.lift);
    this.head = this.add(piece(shape.head), 0, 2.08, 0, this.lift);
    makeEye(0.2, this.head.children[0], 0.25, 0.46, 0.42);
    makeEye(0.2, this.head.children[0], -0.25, 0.46, 0.42);
    this.brows = [1, -1].map((sign) => makeBrow(this.head, 0.3, 0.07, 0.05, sign * 0.25, 0.7, 0.46, sign * -0.45));
    this.armL = this.add(piece(shape.arm), 0.82, 1.72, 0, this.lift);
    this.armR = this.add(piece(shape.arm), -0.82, 1.72, 0, this.lift);
    this.legL = this.add(piece(shape.leg), 0.32, 0.78, 0);
    this.legR = this.add(piece(shape.leg), -0.32, 0.78, 0);
    this.key = this.add(piece(shape.key), 0, 1.4, -0.55, this.lift);
    this.goo = null;
    this.update(0);
  }

  update(dt, { resting = false } = {}) {
    const { robot, reducedMotion } = this;
    this.time += dt;
    const walking = robot.state === 'walking' && !resting;
    const stride = walking ? 1 : 0;
    const step = this.time * 6.2;
    const swing = Math.sin(step) * stride * (reducedMotion ? 0.3 : 0.6);

    this.root.position.set(robot.x, 0, -robot.z);
    // Mostly facing the tram, and turning towards where it's going while it walks.
    const movedX = robot.x - this.lastX;
    const movedZ = robot.z - this.lastZ;
    this.lastX = robot.x;
    this.lastZ = robot.z;
    let wanted = towardsTram(robot.x, robot.z);
    if (walking && Math.hypot(movedX, movedZ) > 0.0001) wanted += clamp(Math.atan2(movedX, -movedZ) - wanted, -0.8, 0.8) * 0.65;
    this.yaw = dt ? damp(this.yaw, wanted, 7, dt) : wanted;
    this.root.rotation.y = this.yaw;

    this.legL.rotation.x = -swing;
    this.legR.rotation.x = swing;
    const shake = this.shake();
    const idle = reducedMotion ? 0 : Math.sin(this.time * 1.9) * 0.035;
    this.lift.position.y = Math.abs(Math.sin(step)) * stride * (reducedMotion ? 0.02 : 0.1);
    this.lift.rotation.z = idle + (walking ? Math.sin(step) * 0.07 : 0) + shake * 0.5;
    this.lift.rotation.x = walking ? 0.08 : shake * 0.4;
    this.head.rotation.y = reducedMotion ? 0 : Math.sin(this.time * 0.8) * 0.16;
    this.key.rotation.z += dt * (walking ? 3.4 : 1.1);

    // The arms: swinging, throwing or waving.
    this.waving = damp(this.waving, resting ? 1 : 0, 5, dt || 1);
    const throwUp = robot.throwing > 0 ? Math.min(1, (0.75 - robot.throwing) * 4) : 0;
    this.throwShare = damp(this.throwShare ?? 0, throwUp, 12, dt || 1);
    const wave = reducedMotion ? 0.2 : Math.sin(this.time * 6.4) * 0.34;
    this.armL.rotation.x = swing * 0.8 * (1 - this.waving);
    this.armR.rotation.x = -swing * 0.8 * (1 - this.waving) - this.throwShare * 2.5 * (1 - this.waving);
    this.armL.rotation.z = this.waving * (2.5 + wave) + 0.08;
    this.armR.rotation.z = this.waving * -(2.5 - wave) - 0.08;
    for (const brow of this.brows) brow.visible = this.waving < 0.5;
  }

  /** Where a goo ball is held, ready to throw. */
  handPoint(target) {
    return this.armR.localToWorld(target.set(0, -0.95, 0));
  }
}

class PeekerView extends RobotView {
  constructor(robot, reducedMotion, coverHeight) {
    super(robot, reducedMotion);
    const shape = shapesFor('peeker', robot.paint % PAINTS.length, peekerShapes);
    this.coverHeight = coverHeight;
    this.aimHeight = 1.45;
    this.splatArea = [0.9, 0.9, 0.2];
    this.splatSize = 0.9;
    this.splatDepth = 0.5;
    this.spring = this.add(piece(shape.spring));
    this.bodyPiece = this.add(piece(shape.head), 0, 1, 0);
    makeEye(0.2, this.bodyPiece.children[0], 0.25, 0.68, 0.48);
    makeEye(0.2, this.bodyPiece.children[0], -0.25, 0.68, 0.48);
    this.update(0);
  }

  update(dt, { resting = false } = {}) {
    const { robot, reducedMotion } = this;
    this.time += dt;
    this.root.visible = robot.rise > 0.01;
    // Overshoots a little on the way up, like a spring.
    const rise = robot.rise;
    const overshoot = reducedMotion ? 0 : Math.sin(rise * Math.PI) * 0.22;
    const sway = reducedMotion ? 0 : Math.sin(this.time * 2.6) * 0.09;
    const down = (1 - rise) * 2.2;
    // On the higher levels it can spring through the air from one cover to another.
    const lift = robot.lift ?? 0;
    this.root.position.set(robot.x, this.coverHeight - 0.72 - down + overshoot + lift, -robot.z);
    this.root.rotation.y = towardsTram(robot.x, robot.z);
    this.spring.scale.y = 0.72 + (robot.state === 'ready' && !reducedMotion ? Math.sin(this.time * 7) * 0.06 : 0) + overshoot * 0.6;
    this.bodyPiece.position.y = this.spring.scale.y;
    this.bodyPiece.rotation.z = sway + this.shake() + (resting && !reducedMotion ? Math.sin(this.time * 6.4) * 0.26 : 0);
    this.bodyPiece.rotation.x = robot.throwing > 0 ? -0.34 : 0;
    this.aimHeight = this.bodyPiece.position.y + 0.5;
  }

  handPoint(target) {
    return this.bodyPiece.localToWorld(target.set(0.72, 0.3, 0.2));
  }
}

/** Turns towards an angle the shortest way round, treating the opposite way as the same, like an axle. */
function turnAxle(from, to, rate, dt) {
  let off = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  if (off > Math.PI / 2) off -= Math.PI;
  if (off < -Math.PI / 2) off += Math.PI;
  return from + off * (1 - Math.exp(-rate * dt));
}

class RollerView extends RobotView {
  constructor(robot, reducedMotion) {
    super(robot, reducedMotion);
    const shape = shapesFor('roller', robot.paint % PAINTS.length, rollerShapes);
    this.aimHeight = 1.85;
    this.splatArea = [0.8, 0.6, 0.15];
    this.splatSize = 0.8;
    this.splatDepth = 0.5;
    this.axle = 0; // Which way the wheel is pointing, in the place's own terms.
    // The wheel and its fork turn with the way it's rolling, and the face always looks at the tram.
    this.holder = this.add(new THREE.Group(), 0, WHEEL_RADIUS, 0);
    this.wheel = piece(shape.wheel);
    this.holder.add(this.wheel, piece(shape.fork));
    this.lift = new THREE.Group();
    this.root.add(this.lift);
    this.bodyPiece = this.add(piece(shape.body), 0, WHEEL_RADIUS + 0.86, 0, this.lift);
    makeEye(0.17, this.bodyPiece.children[0], 0.23, 0.5, 0.46);
    makeEye(0.17, this.bodyPiece.children[0], -0.23, 0.5, 0.46);
    this.armL = this.add(piece(shape.arm), 0.68, WHEEL_RADIUS + 1.18, 0, this.lift);
    this.armR = this.add(piece(shape.arm), -0.68, WHEEL_RADIUS + 1.18, 0, this.lift);
    this.update(0);
  }

  update(dt, { resting = false } = {}) {
    const { robot, reducedMotion } = this;
    this.time += dt;
    this.root.position.set(robot.x, 0, -robot.z);
    const movedX = robot.x - this.lastX;
    const movedZ = robot.z - this.lastZ;
    this.lastX = robot.x;
    this.lastZ = robot.z;
    const moved = Math.hypot(movedX, movedZ);
    if (moved > 0.0001) {
      // The wheel lines up with the way it's going, and rolls forwards or backwards along it.
      this.axle = dt ? turnAxle(this.axle, Math.atan2(movedZ, movedX), 9, dt) : Math.atan2(movedZ, movedX);
      const along = movedX * Math.cos(this.axle) + movedZ * Math.sin(this.axle);
      this.wheel.rotation.z -= along / WHEEL_RADIUS;
    }
    this.holder.rotation.y = this.axle;
    this.lift.rotation.y = towardsTram(robot.x, robot.z);
    const rolling = robot.state === 'walking' && !resting;
    const shake = this.shake();
    this.lift.position.y = reducedMotion ? 0 : Math.sin(this.time * 2.2) * 0.03;
    this.lift.rotation.z = shake * 0.5 + (rolling && !reducedMotion ? Math.sin(this.time * 5) * 0.05 : 0);
    // Arms out for balance while it rolls, and waving while the child rests.
    this.waving = damp(this.waving, resting ? 1 : 0, 5, dt || 1);
    const wave = reducedMotion ? 0.2 : Math.sin(this.time * 6.4) * 0.34;
    const balance = rolling && !reducedMotion ? Math.sin(this.time * 4) * 0.22 : 0;
    this.armL.rotation.z = 1.05 + balance + this.waving * (1.3 + wave);
    this.armR.rotation.z = -1.05 + balance - this.waving * (1.3 - wave);
  }
}

const domeShape = new THREE.SphereGeometry(1, 14, 10).scale(0.66, 0.6, 0.66);
const domeGlass = new THREE.MeshBasicMaterial({ color: '#c7ecff', transparent: true, opacity: 0.3, depthWrite: false });

class DroneView extends RobotView {
  constructor(robot, reducedMotion) {
    super(robot, reducedMotion);
    const shape = shapesFor('drone', robot.paint % PAINTS.length, droneShapes);
    this.aimHeight = 0;
    this.splatArea = [1.5, 0.3, -0.2];
    this.splatSize = 1.1;
    this.splatDepth = 0.9;
    this.bodyPiece = this.add(piece(shape.body));
    this.rotor = this.add(piece(shape.rotor), 0, 0.82, 0);
    // The big single eye, under a glass dome.
    this.eye = makeEye(0.34, this.bodyPiece.children[0], 0, 0.42, 0.42);
    const dome = new THREE.Mesh(domeShape, domeGlass);
    dome.position.y = 0.36;
    this.bodyPiece.add(dome);
    this.update(0);
  }

  update(dt, { resting = false } = {}) {
    const { robot, reducedMotion } = this;
    this.time += dt;
    this.root.position.set(robot.x, robot.y, -robot.z);
    this.root.rotation.y = towardsTram(robot.x, robot.z);
    const tilt = reducedMotion ? 0 : Math.sin(this.time * 0.62 + robot.phase) * 0.14;
    this.root.rotation.z = tilt + this.shake() * 0.6 + (resting && !reducedMotion ? Math.sin(this.time * 5) * 0.25 : 0);
    this.rotor.rotation.y += dt * (reducedMotion ? 6 : 13);
  }

  handPoint(target) {
    return this.root.localToWorld(target.set(0, -0.7, 0));
  }
}

class BigView extends RobotView {
  constructor(robot, reducedMotion) {
    super(robot, reducedMotion);
    const shape = shapesFor('big', 0, bigShapes);
    this.aimHeight = 5;
    this.splatArea = [5.2, 7, 3.2];
    this.splatSize = 2.2;
    this.splatDepth = 1.72;
    this.lift = new THREE.Group();
    this.root.add(this.lift);
    this.bodyPiece = this.add(piece(shape.body, bigLine), 0, 0, 0, this.lift);
    this.head = this.add(piece(shape.head, bigLine), 0, 7.75, 0, this.lift);
    makeEye(0.56, this.head.children[0], 0.72, 1.28, 1.22);
    makeEye(0.56, this.head.children[0], -0.72, 1.28, 1.22);
    this.brows = [1, -1].map((sign) => makeBrow(this.head, 0.9, 0.18, 0.1, sign * 0.72, 2, 1.28, sign * -0.38));
    this.armL = this.add(piece(shape.arm, bigLine), 3.75, 6.35, 0, this.lift);
    this.armR = this.add(piece(shape.arm, bigLine), -3.75, 6.35, 0, this.lift);
    this.legL = this.add(piece(shape.leg, bigLine), 1.7, 2.5, 0);
    this.legR = this.add(piece(shape.leg, bigLine), -1.7, 2.5, 0);
    this.key = this.add(piece(shape.key, bigLine), 0, 5.2, -1.72, this.lift);

    // Each weak spot: a hatch that swings open, with a gold star spinning in it.
    this.hatches = new Map();
    for (const spot of robot.spots) this.addHatch(spot, shape);
    // The ones that this difficulty doesn't use stay as closed hatches, for looks.
    for (const spare of BIG_SPOTS.slice(robot.spots.length)) this.addHatch(spare, shape);
    this.update(0);
  }

  addHatch(spot, shape) {
    const holder = new THREE.Group();
    const [x, y, z] = spot.at;
    holder.position.set(x, y, z);
    const parent = this.bodyPiece;
    parent.add(holder);
    holder.add(piece(shape.hole, bigLine));
    const glowingStar = piece(shape.star);
    glowingStar.visible = false;
    holder.add(glowingStar);
    const door = piece(shape.door, bigLine);
    door.position.set(-0.8, 0, 0.12);
    holder.add(door);
    this.hatches.set(spot.id, { holder, door, star: glowingStar, open: 0 });
    return holder;
  }

  aimPointOf(spot, target) {
    return this.hatches.get(spot.id).holder.localToWorld(target.set(0, 0, 0.2));
  }

  update(dt, { resting = false } = {}) {
    const { robot, reducedMotion } = this;
    this.time += dt;
    this.root.position.set(robot.x, 0, -robot.z);
    this.root.rotation.y = towardsTram(robot.x, robot.z);
    // On the higher levels it steps from side to side, and its legs go with it.
    const stepping = dt ? Math.min(1, Math.abs(robot.x - this.lastX) / dt) : 0;
    this.lastX = robot.x;
    this.stride = (this.stride ?? 0) + stepping * dt * 2.4;
    const legs = Math.sin(this.stride) * Math.min(1, stepping * 1.5) * (reducedMotion ? 0.06 : 0.16);
    this.legL.rotation.z = legs;
    this.legR.rotation.z = legs;
    const sway = reducedMotion ? 0 : Math.sin(this.time * 1.05);
    this.lift.rotation.z = sway * 0.022 + this.shake() * 0.08;
    this.lift.position.y = reducedMotion ? 0 : Math.abs(Math.sin(this.time * 1.05)) * 0.1;
    this.head.rotation.y = reducedMotion ? 0 : Math.sin(this.time * 0.6) * 0.14;
    this.key.rotation.z += dt * 0.8;
    this.waving = damp(this.waving, resting ? 1 : 0, 4, dt || 1);
    const throwUp = robot.throwing > 0 ? 1 : 0;
    this.throwShare = damp(this.throwShare ?? 0, throwUp, 7, dt || 1);
    const wave = reducedMotion ? 0.15 : Math.sin(this.time * 3.6) * 0.2;
    this.armL.rotation.z = 0.12 + this.waving * (2.3 + wave);
    this.armR.rotation.z = -0.12 - this.waving * (2.3 - wave);
    this.armL.rotation.x = reducedMotion ? 0 : sway * 0.05;
    this.armR.rotation.x = -this.throwShare * 2 * (1 - this.waving);
    for (const brow of this.brows) brow.visible = this.waving < 0.5;

    for (const spot of robot.spots) {
      const hatch = this.hatches.get(spot.id);
      hatch.open = damp(hatch.open, spot.open ? 1 : 0, 6, dt || 1);
      hatch.door.rotation.y = -hatch.open * 2.1;
      hatch.star.visible = hatch.open > 0.02;
      hatch.star.rotation.z += dt * (reducedMotion ? 0.8 : 2.2);
      const pulse = reducedMotion ? 1 : 1 + Math.sin(this.time * 3.4) * 0.09;
      hatch.star.scale.setScalar(hatch.open * pulse);
      // A spot that's finished loses its door and star, and it's plain that it's done.
      if (spot.done) {
        hatch.door.visible = false;
        hatch.star.visible = false;
      }
    }
  }

  handPoint(target) {
    return this.armR.localToWorld(target.set(0, -4.2, 0));
  }
}

/** Makes what the rules have just sent out. coverHeight says how tall its cover is, for a peeker. */
export function makeRobotView(robot, reducedMotion, coverHeight = 1.5) {
  if (robot.kind === 'walker') return new WalkerView(robot, reducedMotion);
  if (robot.kind === 'roller') return new RollerView(robot, reducedMotion);
  if (robot.kind === 'drone') return new DroneView(robot, reducedMotion);
  if (robot.kind === 'peeker') return new PeekerView(robot, reducedMotion, coverHeight);
  return new BigView(robot, reducedMotion);
}

/* ---------- when it all falls apart ---------- */

const GRAVITY = 15;
const DEBRIS_SECONDS = 1.5;

/** The bits of a robot flying apart and bouncing away. They shrink away rather than disappearing. */
export class Debris {
  constructor(parent) {
    this.parent = parent;
    this.bits = [];
  }

  /**
   * Takes a robot to pieces where it stands. power is how hard the bits go flying, and floor is what
   * they land on, which is nothing at all over the water.
   */
  burst(view, power = 1, floor = 0.25 * power) {
    const { root, pieces } = view;
    root.updateWorldMatrix(true, true);
    for (const bit of pieces) {
      if (bit.parent !== root && bit.parent !== view.lift) continue;
      this.parent.attach(bit);
      const away = new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 1.2);
      this.bits.push({
        bit,
        life: DEBRIS_SECONDS + Math.random() * 0.5,
        vx: away.x * 4.6 * power,
        vy: (3.6 + Math.random() * 3.6) * Math.sqrt(power),
        vz: away.z * 4.6 * power,
        spinX: (Math.random() - 0.5) * 9,
        spinZ: (Math.random() - 0.5) * 9,
        floor,
      });
    }
    root.removeFromParent();
  }

  update(dt) {
    for (const item of this.bits) {
      const { bit } = item;
      item.life -= dt;
      item.vy -= GRAVITY * dt;
      bit.position.x += item.vx * dt;
      bit.position.y += item.vy * dt;
      bit.position.z += item.vz * dt;
      bit.rotation.x += item.spinX * dt;
      bit.rotation.z += item.spinZ * dt;
      if (bit.position.y < item.floor && item.vy < 0) {
        bit.position.y = item.floor;
        item.vy *= -0.42;
        item.vx *= 0.65;
        item.vz *= 0.65;
        item.spinX *= 0.6;
        item.spinZ *= 0.6;
      }
      if (item.life < 0.4) bit.scale.setScalar(Math.max(0.01, item.life / 0.4));
      if (item.life <= 0) bit.removeFromParent();
    }
    this.bits = this.bits.filter(({ life }) => life > 0);
  }
}

/* ---------- the cages ---------- */

const CAGE_RADIUS = 1.75;
const BARS = 15;

function cageParts(height, base) {
  const iron = '#3a4557';
  const gold = '#ffc83d';
  const parts = [
    { geometry: disc(CAGE_RADIUS + 0.12, 0.2, 28), colour: iron, at: [0, 0.1, 0] },
    { geometry: disc(CAGE_RADIUS + 0.12, 0.14, 28), colour: iron, at: [0, height, 0] },
    { geometry: new THREE.ConeGeometry(CAGE_RADIUS + 0.18, 0.9, 28), colour: gold, at: [0, height + 0.5, 0] },
    { geometry: new THREE.TorusGeometry(0.28, 0.07, 8, 16), colour: iron, at: [0, height + 1.12, 0] },
  ];
  for (let i = 0; i < BARS; i += 1) {
    const angle = (i / BARS) * Math.PI * 2 + Math.PI / BARS;
    // The ones facing the tram are the door, which is made separately.
    if (Math.cos(angle) > 0.72) continue;
    parts.push({ geometry: limb(0.055, 0.055, height - 0.16, 8), colour: iron, at: [Math.sin(angle) * CAGE_RADIUS, height, Math.cos(angle) * CAGE_RADIUS] });
  }
  if (base === 'cart') {
    parts.push({ geometry: roundedBox(4.2, 0.34, 4.2, 0.08), colour: '#a8743f', at: [0, 0.18, 0] });
    for (const [x, z] of [[-1.9, 1.5], [1.9, 1.5], [-1.9, -1.5], [1.9, -1.5]]) {
      parts.push({ geometry: new THREE.TorusGeometry(0.5, 0.09, 8, 18).rotateY(Math.PI / 2), colour: '#7a5230', at: [x, 0.5, z] });
      parts.push({ geometry: ball(0.12), colour: '#ffc83d', at: [x, 0.5, z] });
    }
  } else if (base === 'raft') {
    for (let i = 0; i < 7; i += 1) {
      parts.push({ geometry: new THREE.CylinderGeometry(0.34, 0.34, 5, 10).rotateX(Math.PI / 2), colour: i % 2 ? '#c99a5f' : '#a8743f', at: [-2.4 + i * 0.8, -0.1, 0] });
    }
  } else if (base === 'stone') {
    parts.push({ geometry: disc(2.5, 0.5, 28), colour: '#c9bda6', at: [0, -0.15, 0] });
    parts.push({ geometry: disc(2.9, 0.2, 28), colour: '#a79a84', at: [0, -0.5, 0] });
  } else if (base === 'hay') {
    parts.push({ geometry: roundedBox(5, 0.3, 5, 0.06), colour: '#a8743f', at: [0, 0.1, 0] });
    parts.push({ geometry: disc(2.4, 0.16, 16), colour: '#e6c462', at: [0, 0.3, 0] });
    for (const x of [-2.3, 2.3]) {
      parts.push({ geometry: new THREE.TorusGeometry(0.7, 0.11, 8, 18).rotateY(Math.PI / 2), colour: '#7a5230', at: [x, 0.0, 0] });
    }
  }
  return parts;
}

function cageDoorParts(height) {
  const iron = '#3a4557';
  const gold = '#ffc83d';
  const parts = [];
  for (let i = 0; i < BARS; i += 1) {
    const angle = (i / BARS) * Math.PI * 2 + Math.PI / BARS;
    if (Math.cos(angle) <= 0.72) continue;
    parts.push({ geometry: limb(0.055, 0.055, height - 0.16, 8), colour: iron, at: [Math.sin(angle) * CAGE_RADIUS, height, Math.cos(angle) * CAGE_RADIUS] });
  }
  parts.push({ geometry: roundedBox(2.5, 0.1, 0.1, 0.03), colour: iron, at: [0, height * 0.32, CAGE_RADIUS * 0.9] });
  parts.push({ geometry: roundedBox(2.5, 0.1, 0.1, 0.03), colour: iron, at: [0, height * 0.72, CAGE_RADIUS * 0.9] });
  parts.push({ geometry: roundedBox(0.72, 0.62, 0.22, 0.08), colour: gold, at: [0, height * 0.46, CAGE_RADIUS + 0.03] });
  parts.push({ geometry: new THREE.TorusGeometry(0.24, 0.06, 8, 14), colour: '#c9d3dd', at: [0, height * 0.46 + 0.34, CAGE_RADIUS + 0.03] });
  parts.push({ geometry: ball(0.09, 0.12, 0.03), colour: '#3a4557', at: [0, height * 0.46 + 0.02, CAGE_RADIUS + 0.15] });
  return parts;
}

const FRIEND_SIZE = 1.34;
const HOP_SECONDS = 0.6;

/** A cage with a friend in it, who waves until the last robot here has gone. */
export class Cage {
  /** x and z are in the place's own metres, as in the rules. */
  constructor({ spec, x, z, base = null, y = 0, bob = false, reducedMotion = false }) {
    this.spec = spec;
    this.reducedMotion = reducedMotion;
    this.root = new THREE.Group();
    this.root.position.set(x, y, -z);
    this.root.rotation.y = towardsTram(x, z);
    this.baseY = y;
    this.bob = bob;
    this.freed = false;
    this.freedFor = 0;
    this.time = Math.random() * 6;

    const tall = spec.build.neck > 0.3;
    const height = tall ? 5.1 : 3.9;
    const body = joined(cageParts(height, base));
    this.root.add(piece(body));
    const door = joined(cageDoorParts(height));
    this.door = new THREE.Group();
    this.door.position.set(-CAGE_RADIUS, 0, 0);
    const doorMesh = piece(door);
    doorMesh.position.x = CAGE_RADIUS;
    this.door.add(doorMesh);
    this.root.add(this.door);

    this.friend = new Fighter3D(spec);
    this.friend.root.scale.setScalar(FRIEND_SIZE);
    this.friend.root.position.y = base === 'cart' ? 0.34 : base === 'hay' ? 0.46 : 0.24;
    this.friend.root.traverse((node) => {
      node.castShadow = false;
    });
    this.friend.setExpression('dizzy');
    this.friend.blinkIn = 1 + Math.random() * 2;
    this.pose = makePose();
    this.root.add(this.friend.root);
    this.update(0);
  }

  /** The door swings open and they hop out. Everything else is for the update. */
  free() {
    this.freed = true;
    this.freedFor = 0;
    this.friend.setExpression('happy');
  }

  /** Where the friend's head is, in the world. */
  headPoint(target) {
    return this.friend.head.localToWorld(target.set(0, 0.5, 0));
  }

  update(dt) {
    this.time += dt;
    const { pose, friend, reducedMotion } = this;
    const time = this.time;
    if (this.bob) {
      this.root.position.y = this.baseY + (reducedMotion ? 0 : Math.sin(time * 1.1) * 0.08);
      this.root.rotation.z = reducedMotion ? 0 : Math.sin(time * 0.8) * 0.018;
    }
    if (!this.freed) {
      // Calling for help: one hand on the bars, and the other waving.
      const wave = reducedMotion ? 0 : Math.sin(time * 5.5);
      const turn = Math.floor(time / 3.2) % 2 === 0;
      const up = { X: 0.5 + wave * 0.2, Y: 0.86, Z: 0.3 };
      const bars = { X: 0.5, Y: -0.05, Z: 0.72 };
      const [left, right] = turn ? [up, bars] : [bars, up];
      Object.assign(pose, { handLX: left.X, handLY: left.Y, handLZ: left.Z, handRX: -right.X, handRY: right.Y, handRZ: right.Z, roll: reducedMotion ? 0 : Math.sin(time * 1.4) * 0.05, up: 0 });
    } else {
      this.freedFor += dt;
      const opening = Math.min(1, this.freedFor / 0.45);
      this.door.rotation.y = -opening * opening * (3 - 2 * opening) * 1.9;
      // Out through the door, then hopping for joy.
      if (!this.party) friend.root.position.z = clamp((this.freedFor - 0.15) / 0.7, 0, 1) * (CAGE_RADIUS + 1.2);
      const hop = reducedMotion ? 0.3 : Math.abs(Math.sin((this.freedFor * Math.PI) / HOP_SECONDS));
      const cheer = reducedMotion ? 0 : Math.sin(time * 8) * 0.14;
      Object.assign(pose, { handLX: 0.48 + cheer, handLY: 0.9, handLZ: 0.1, handRX: -0.48 - cheer, handRY: 0.9, handRZ: 0.1, roll: 0, up: hop * 0.42 });
    }
    friend.setPose(pose);
    friend.update(dt);
  }

  /** Hopping about with the others at the end, wherever they're put. */
  celebrateAt(x, z, y = 0) {
    this.root.remove(this.friend.root);
    this.party = { x, z };
    this.friend.root.position.set(x, y, -z);
    this.friend.root.rotation.y = towardsTram(x, z);
    this.freed = true;
    this.friend.setExpression('happy');
    return this.friend.root;
  }

  dispose() {
    this.friend.dispose();
    this.friend.root.removeFromParent();
    this.root.traverse((node) => node.geometry?.dispose());
    this.root.removeFromParent();
  }
}

const shadowShape = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** A round blob of shadow, for what moves: the town's own shadows are only worked out at the start. */
export function blobShadow(paint, size) {
  const shadow = new THREE.Mesh(shadowShape, paint);
  shadow.scale.set(size, 1, size);
  shadow.position.y = 0.03;
  return shadow;
}

export { SHOT_COLOURS };
