// The characters: chunky toy-like figures built from simple shapes, with no image files. They
// fight in Mighty Moves and run in Leap Trail.
//
// All ten share one skeleton, so any move works on any of them and the same body can copy
// the child's. A pose says where the hands and feet should be, and the limbs bend to reach
// them. Hands are drawn open: the fighters strike with open palms, because opening the hand
// is what these games practise.
import * as THREE from '../../vendor/three/three.module.js';

const OUTLINE_WIDTH = 0.014;

// Character's left is +X, up is +Y and forward is +Z.
const UPPER_ARM = 0.3;
const FOREARM = 0.28;
const THIGH = 0.27;
const SHIN = 0.25;
const ANKLE_HEIGHT = 0.1;
export const ARM_REACH = UPPER_ARM + FOREARM;
export const HIP_HEIGHT = THIGH + SHIN + ANKLE_HEIGHT;
const SHOULDER = { x: 0.33, y: 0.45 };
const HIP_WIDTH = 0.17;
const HEAD_Y = 0.86;

/* ------------------------------- shapes ------------------------------- */

export const toon = (() => {
  let map = null;
  return () => {
    if (!map) {
      map = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat);
      map.minFilter = THREE.NearestFilter;
      map.magFilter = THREE.NearestFilter;
      map.needsUpdate = true;
    }
    return map;
  };
})();

export const ball = (x = 1, y = x, z = x) => new THREE.SphereGeometry(1, 28, 20).scale(x, y, z);

/** A rounded cone along +Y, from wide at the origin to narrow at the far end. */
export function taper(base, tip, length, sides = 16) {
  const points = [];
  const steps = 5;
  // Lathe needs its outline from bottom to top for the faces to point outwards.
  for (let i = steps; i >= 0; i -= 1) {
    const angle = (i / steps) * (Math.PI / 2);
    points.push(new THREE.Vector2(Math.cos(angle) * base, -Math.sin(angle) * base));
  }
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * (Math.PI / 2);
    points.push(new THREE.Vector2(Math.max(0.0001, Math.cos(angle) * tip), length + Math.sin(angle) * tip));
  }
  return new THREE.LatheGeometry(points, sides);
}

/** The same, hanging down from the origin along -Y, as limbs do. */
export const limb = (top, bottom, length, sides) => taper(top, bottom, length, sides).rotateX(Math.PI);

/** A box with rounded corners and smooth shading. */
export function roundedBox(width, height, depth, radius) {
  const geometry = new THREE.BoxGeometry(width, height, depth, 8, 8, 8);
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const halves = [width / 2 - radius, height / 2 - radius, depth / 2 - radius];
  const point = new THREE.Vector3();
  const inner = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    point.fromBufferAttribute(position, i);
    inner.set(
      THREE.MathUtils.clamp(point.x, -halves[0], halves[0]),
      THREE.MathUtils.clamp(point.y, -halves[1], halves[1]),
      THREE.MathUtils.clamp(point.z, -halves[2], halves[2]),
    );
    point.sub(inner).normalize();
    normal.setXYZ(i, point.x, point.y, point.z);
    point.multiplyScalar(radius).add(inner);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  return geometry;
}

/** A tube along a curve that narrows from start to end, for horns, tails and ribbons. */
export function curl(points, start, end, { sides = 12, steps = 22 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(steps, false);
  const position = [];
  const index = [];
  for (let i = 0; i <= steps; i += 1) {
    const along = i / steps;
    const centre = curve.getPointAt(along);
    const radius = start + (end - start) * along;
    for (let j = 0; j < sides; j += 1) {
      const angle = (j / sides) * Math.PI * 2;
      const p = centre.clone()
        .addScaledVector(frames.normals[i], Math.cos(angle) * radius)
        .addScaledVector(frames.binormals[i], Math.sin(angle) * radius);
      position.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < sides; j += 1) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      const c = a + sides;
      const d = b + sides;
      index.push(a, b, c, b, d, c);
    }
  }
  // Closes the narrow end.
  const tip = curve.getPointAt(1);
  const tipIndex = position.length / 3;
  position.push(tip.x, tip.y, tip.z);
  for (let j = 0; j < sides; j += 1) index.push(steps * sides + j, steps * sides + ((j + 1) % sides), tipIndex);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

export function star(outer = 1, inner = 0.46, depth = 0.25) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 ? inner : outer;
    const angle = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
}

/** A flat outline with some thickness, from a list of [x, y] points through which it curves. */
function flat(points, depth = 0.03) {
  const shape = new THREE.Shape();
  shape.setFromPoints(new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(48));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 }).translate(0, 0, -depth / 2);
}

/** Joins a bone's parts into one mesh with one colour per part, which keeps drawing cheap. */
export function mergeParts(parts) {
  const positions = [];
  const normals = [];
  const colours = [];
  const tint = new THREE.Color();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  for (const { geometry, colour, at = [0, 0, 0], turn = [0, 0, 0], size = [1, 1, 1] } of parts) {
    const piece = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    quaternion.setFromEuler(euler.set(...turn));
    matrix.compose(new THREE.Vector3(...at), quaternion, new THREE.Vector3(...size));
    piece.applyMatrix4(matrix);
    tint.set(colour);
    const p = piece.attributes.position;
    const n = piece.attributes.normal;
    for (let i = 0; i < p.count; i += 1) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colours.push(tint.r, tint.g, tint.b);
    }
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return merged;
}

/** A dark shell pushed out along the surface and drawn inside out, which reads as an ink line. */
export function outlineMaterial(colour, width = OUTLINE_WIDTH) {
  const material = new THREE.MeshBasicMaterial({ color: colour, side: THREE.BackSide });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vec3 transformed = position + normal * ${width.toFixed(4)};`,
    );
  };
  return material;
}

/* ------------------------------- limbs ------------------------------- */

const scratch = {
  d: new THREE.Vector3(),
  b: new THREE.Vector3(),
  u: new THREE.Vector3(),
  v: new THREE.Vector3(),
  inside: new THREE.Vector3(),
  x: new THREE.Vector3(),
  y: new THREE.Vector3(),
  m: new THREE.Matrix4(),
};

/**
 * Bends a two-part limb to reach a point. target is relative to the top of the limb, in its
 * parent's space, and pole is the direction the middle joint should point. The lower part
 * hinges about its own X axis, so a forearm or shin never bends the wrong way.
 */
function reach(upper, lower, target, pole, lengthA, lengthB) {
  const { d, b, u, v, inside, x, y, m } = scratch;
  const longest = (lengthA + lengthB) * 0.999;
  const shortest = Math.abs(lengthA - lengthB) + 0.02;
  const distance = THREE.MathUtils.clamp(target.length(), shortest, longest);
  d.copy(target);
  if (d.lengthSq() < 1e-8) d.set(0, -1, 0);
  d.normalize();

  b.copy(pole).addScaledVector(d, -pole.dot(d));
  if (b.lengthSq() < 1e-6) b.set(0, 0, -1).addScaledVector(d, d.z);
  if (b.lengthSq() < 1e-6) b.set(1, 0, 0);
  b.normalize();

  const cosine = THREE.MathUtils.clamp((lengthA * lengthA + distance * distance - lengthB * lengthB) / (2 * lengthA * distance), -1, 1);
  const sine = Math.sqrt(1 - cosine * cosine);
  u.copy(d).multiplyScalar(cosine).addScaledVector(b, sine);
  v.copy(d).multiplyScalar(distance).addScaledVector(u, -lengthA).normalize();

  inside.copy(b).multiplyScalar(-1).addScaledVector(u, b.dot(u));
  if (inside.lengthSq() < 1e-6) inside.set(0, 0, 1);
  inside.normalize();

  y.copy(u).negate();
  x.crossVectors(y, inside);
  m.makeBasis(x, y, inside);
  upper.quaternion.setFromRotationMatrix(m);
  lower.rotation.set(-Math.acos(THREE.MathUtils.clamp(u.dot(v), -1, 1)), 0, 0);
}

/* ------------------------------- poses ------------------------------- */

/**
 * Hands are relative to their shoulder, in arm lengths. Feet are relative to the ground under
 * the fighter. Everything is a plain number, so poses can be blended by simply mixing them.
 */
export function makePose() {
  return {
    forward: 0, // Whole-body movement along the way the fighter faces.
    up: 0,
    side: 0,
    hipX: 0,
    hipDrop: 0, // How far the hips have sunk.
    hipZ: 0,
    pitch: 0, // Torso leaning forward.
    roll: 0, // Torso leaning to the fighter's left.
    twist: 0, // Torso turning towards the fighter's left.
    headPitch: 0,
    headTurn: 0,
    squash: 0, // Positive is squashed, negative is stretched.
    handLX: 0.42, handLY: -0.82, handLZ: 0.12,
    handRX: -0.42, handRY: -0.82, handRZ: 0.12,
    footLX: HIP_WIDTH, footLY: 0, footLZ: 0,
    footRX: -HIP_WIDTH, footRY: 0, footRZ: 0,
    footLPitch: 0,
    footRPitch: 0,
    wristL: 0, // 0 is straight and -1.5 is bent right back, for a palm pushing forward.
    wristR: 0,
    openL: 1,
    openR: 1,
  };
}

export function mixPose(out, a, b, amount) {
  for (const key of Object.keys(out)) out[key] = a[key] + (b[key] - a[key]) * amount;
  return out;
}

/** Swaps left and right, so a move written for one side works for the other. */
export function mirrorPose(source) {
  const out = { ...source };
  const swap = (a, b, flip = false) => {
    out[a] = flip ? -source[b] : source[b];
    out[b] = flip ? -source[a] : source[a];
  };
  swap('handLX', 'handRX', true);
  swap('handLY', 'handRY');
  swap('handLZ', 'handRZ');
  swap('footLX', 'footRX', true);
  swap('footLY', 'footRY');
  swap('footLZ', 'footRZ');
  swap('footLPitch', 'footRPitch');
  swap('wristL', 'wristR');
  swap('openL', 'openR');
  out.twist = -source.twist;
  out.roll = -source.roll;
  out.side = -source.side;
  out.hipX = -source.hipX;
  out.headTurn = -source.headTurn;
  return out;
}

const ease = (t) => t * t * (3 - 2 * t);

/**
 * Reads a sequence of poses at a moment into out, and returns it. clip has frames as { t, pose },
 * and linear says to move steadily through them rather than settling at each.
 */
export function sampleClip(clip, t, out) {
  const { frames, linear = false } = clip;
  if (t <= frames[0].t) return Object.assign(out, frames[0].pose);
  for (let i = 1; i < frames.length; i += 1) {
    if (t <= frames[i].t) {
      const before = frames[i - 1];
      const after = frames[i];
      const share = (t - before.t) / (after.t - before.t);
      return mixPose(out, before.pose, after.pose, linear ? share : ease(share));
    }
  }
  return Object.assign(out, frames.at(-1).pose);
}

/* ------------------------------- the fighter ------------------------------- */

const PART_GROUPS = ['hips', 'torso', 'head', 'upperL', 'upperR', 'foreL', 'foreR', 'palmL', 'palmR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'];

const EXPRESSIONS = {
  // Brow angle, how open the eyes are, and which mouth.
  ready: { brow: -0.28, browY: 0, eye: 1, mouth: 'smile' },
  happy: { brow: 0.22, browY: 0.02, eye: 1, mouth: 'open' },
  strike: { brow: -0.5, browY: -0.01, eye: 1, mouth: 'open' },
  hurt: { brow: 0.42, browY: 0.02, eye: 0.16, mouth: 'wobble' },
  dizzy: { brow: 0.3, browY: 0.03, eye: 0.7, mouth: 'wobble' },
};

export class Fighter3D {
  constructor(spec) {
    this.spec = spec;
    this.root = new THREE.Group();
    this.root.name = spec.id;
    this.time = Math.random() * 10;
    this.blinkIn = 1 + Math.random() * 3;
    this.expression = 'ready';
    this.expressionUntil = Infinity;
    this.eyeOpen = 1;
    this.browAngle = EXPRESSIONS.ready.brow;

    this.material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() });
    this.outline = outlineMaterial(spec.colours.ink);
    this.parts = Object.fromEntries(PART_GROUPS.map((name) => [name, []]));

    this.buildBones();
    this.buildBody();
    spec.dress(this.dressKit());
    this.buildFace();
    this.buildHands();
    this.finishMeshes();
    this.pose = makePose();
    this.setPose(this.pose);
  }

  buildBones() {
    const group = (parent, x = 0, y = 0, z = 0) => {
      const bone = new THREE.Group();
      bone.position.set(x, y, z);
      parent.add(bone);
      return bone;
    };
    const { build } = this.spec;
    this.lift = group(this.root); // Squash and stretch happen here.
    this.hips = group(this.lift, 0, HIP_HEIGHT, 0);
    this.torso = group(this.hips);
    this.head = group(this.torso, 0, HEAD_Y + build.neck, 0);
    const shoulderX = SHOULDER.x * build.width;
    this.upperL = group(this.torso, shoulderX, SHOULDER.y, 0);
    this.upperR = group(this.torso, -shoulderX, SHOULDER.y, 0);
    this.foreL = group(this.upperL, 0, -UPPER_ARM, 0);
    this.foreR = group(this.upperR, 0, -UPPER_ARM, 0);
    this.palmL = group(this.foreL, 0, -FOREARM, 0);
    this.palmR = group(this.foreR, 0, -FOREARM, 0);
    this.thighL = group(this.hips, HIP_WIDTH, 0, 0);
    this.thighR = group(this.hips, -HIP_WIDTH, 0, 0);
    this.shinL = group(this.thighL, 0, -THIGH, 0);
    this.shinR = group(this.thighR, 0, -THIGH, 0);
    this.footL = group(this.shinL, 0, -SHIN, 0);
    this.footR = group(this.shinR, 0, -SHIN, 0);
  }

  add(group, geometry, colour, at, size, turn) {
    this.parts[group].push({ geometry, colour, at, size, turn });
  }

  /** What each character's dress function draws with. */
  dressKit() {
    const { colours, build } = this.spec;
    return {
      add: (group, geometry, colour, at, size, turn) => this.add(group, geometry, colour, at, size, turn),
      both: (group, geometry, colour, [x, y, z], size, turn) => {
        // Adds a part and its mirror image, one to each side.
        this.add(`${group}L`, geometry, colour, [x, y, z], size, turn);
        const mirrored = turn ? [turn[0], -turn[1], -turn[2]] : undefined;
        this.add(`${group}R`, geometry, colour, [x === 0 ? 0 : -x, y, z], size, mirrored);
      },
      side: (group, geometry, colour, [x, y, z], size, turn) => {
        // A pair on one bone: the same part left and right of the middle.
        this.add(group, geometry, colour, [x, y, z], size, turn);
        const mirrored = turn ? [turn[0], -turn[1], -turn[2]] : undefined;
        this.add(group, geometry, colour, [-x, y, z], size, mirrored);
      },
      colours,
      build,
      ball,
      taper,
      limb,
      curl,
      star,
      flat,
      roundedBox,
    };
  }

  buildBody() {
    const { colours: c, build } = this.spec;
    const skin = c.body;
    const armRadius = 0.085 * build.arms;
    const legRadius = 0.105 * build.legs;
    if (!build.boxy) {
      // Chest and belly, sitting on the hips.
      this.add('torso', ball(0.37 * build.width, 0.47 * build.height, 0.31 * build.depth), c.chest ?? skin, [0, 0.27, 0]);
      if (c.belly) this.add('torso', ball(0.28 * build.width, 0.36 * build.height, 0.16 * build.depth), c.belly, [0, 0.23, 0.2 * build.depth]);
      this.add('hips', ball(0.33 * build.width, 0.24, 0.28 * build.depth), c.pants ?? skin, [0, 0.03, 0]);
      this.add('head', ball(0.52 * build.headWidth, 0.47 * build.headHeight, 0.46 * build.headDepth), c.head ?? skin);
    }
    for (const side of ['L', 'R']) {
      this.add(`upper${side}`, limb(armRadius * 1.15, armRadius, UPPER_ARM), c.arm ?? skin);
      this.add(`fore${side}`, limb(armRadius, armRadius * 0.92, FOREARM), c.forearm ?? c.arm ?? skin);
      this.add(`thigh${side}`, limb(legRadius * 1.2, legRadius * 1.02, THIGH), c.leg ?? skin);
      this.add(`shin${side}`, limb(legRadius * 1.02, legRadius * 0.92, SHIN), c.shin ?? c.leg ?? skin);
      if (!build.customFeet) {
        const length = 0.17 * build.feet;
        this.add(`foot${side}`, ball(0.115 * build.feet, 0.1, length), c.foot ?? skin, [0, -ANKLE_HEIGHT + 0.09, 0.07], [1, 0.95, 1]);
      }
    }
  }

  buildFace() {
    const { face, colours: c } = this.spec;
    const eyeWhite = new THREE.MeshBasicMaterial({ color: face.white ?? '#ffffff' });
    const eyeDark = new THREE.MeshBasicMaterial({ color: face.pupil ?? '#1c1630' });
    const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const ink = new THREE.MeshBasicMaterial({ color: c.ink });
    const eyeLine = outlineMaterial(c.ink, 0.01);

    this.eyes = [];
    this.brows = [];
    const { eyeX, eyeY, eyeZ, eyeSize } = face;
    for (const sign of [1, -1]) {
      const eye = new THREE.Group();
      eye.position.set(sign * eyeX, eyeY, eyeZ);
      eye.rotation.y = sign * 0.3;
      const white = ball(eyeSize, eyeSize * 1.18, eyeSize * 0.5);
      eye.add(new THREE.Mesh(white, eyeWhite), new THREE.Mesh(white, eyeLine));
      if (!face.visor) {
        const pupil = new THREE.Mesh(ball(eyeSize * 0.62, eyeSize * 0.74, eyeSize * 0.3), eyeDark);
        pupil.position.set(-sign * eyeSize * 0.12, -eyeSize * 0.06, eyeSize * 0.34);
        const glint = new THREE.Mesh(ball(eyeSize * 0.22), shine);
        glint.position.set(-sign * eyeSize * 0.12 + eyeSize * 0.2, eyeSize * 0.28, eyeSize * 0.56);
        eye.add(pupil, glint);
        eye.userData.pupil = pupil;
      }
      this.head.add(eye);
      this.eyes.push(eye);

      const brow = new THREE.Mesh(limb(0.027, 0.019, eyeSize * 1.5, 8).rotateZ(sign * Math.PI / 2), new THREE.MeshBasicMaterial({ color: face.brow ?? c.ink }));
      brow.position.set(sign * (eyeX + eyeSize * 0.75), eyeY + eyeSize * 1.42, eyeZ + eyeSize * 0.42);
      brow.userData.sign = sign;
      brow.userData.y = brow.position.y;
      this.head.add(brow);
      this.brows.push(brow);
    }

    // Three mouths, one shown at a time.
    const { mouthY, mouthZ, mouthSize = 1 } = face;
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.075 * mouthSize, 0.018, 8, 18, Math.PI * 0.86).rotateZ(Math.PI + Math.PI * 0.07), ink);
    const open = new THREE.Group();
    const cavity = new THREE.Mesh(ball(0.085 * mouthSize, 0.09 * mouthSize, 0.03), new THREE.MeshBasicMaterial({ color: '#7d2436' }));
    const tongue = new THREE.Mesh(ball(0.052 * mouthSize, 0.036 * mouthSize, 0.02), new THREE.MeshBasicMaterial({ color: '#ff8fa0' }));
    tongue.position.set(0, -0.045 * mouthSize, 0.022);
    open.add(cavity, tongue);
    const wobble = new THREE.Mesh(new THREE.TorusGeometry(0.06 * mouthSize, 0.016, 8, 14, Math.PI * 0.8).rotateZ(Math.PI * 0.1), ink);
    this.mouths = { smile, open, wobble };
    for (const mouth of Object.values(this.mouths)) {
      mouth.position.set(0, mouthY, mouthZ);
      mouth.rotation.x = face.mouthTilt ?? -0.12;
      mouth.visible = false;
      this.head.add(mouth);
    }
    smile.visible = true;
    this.applyMouth('smile');
  }

  /** Each digit can curl on its own, so a hand can close when the child's does. */
  buildHands() {
    const { colours: c, build } = this.spec;
    const skin = c.hand ?? c.arm ?? c.body;
    const size = build.hands;
    const material = new THREE.MeshToonMaterial({ color: skin, gradientMap: toon() });
    this.digits = { L: [], R: [] };
    for (const [side, sign] of [['L', -1], ['R', 1]]) {
      this.add(`palm${side}`, ball(0.09 * size, 0.1 * size, 0.05 * size), skin, [0, -0.07 * size, 0]);
      const palm = side === 'L' ? this.palmL : this.palmR;
      const count = build.digits;
      for (let i = 0; i < count; i += 1) {
        const across = count === 1 ? 0 : (i / (count - 1) - 0.5) * 0.14 * size;
        const length = (0.1 - Math.abs(i - (count - 1) / 2) * 0.008) * size;
        const digit = new THREE.Group();
        digit.position.set(across, -0.15 * size, 0);
        const shape = limb(0.027 * size, 0.022 * size, length, 8);
        digit.add(new THREE.Mesh(shape, material), new THREE.Mesh(shape, this.outline));
        palm.add(digit);
        this.digits[side].push(digit);
      }
      // The thumb sits towards the body when the palm pushes forward.
      const thumb = new THREE.Group();
      thumb.position.set(sign * 0.08 * size, -0.07 * size, -0.01);
      thumb.rotation.z = sign * 0.85;
      const shape = limb(0.03 * size, 0.024 * size, 0.08 * size, 8);
      thumb.add(new THREE.Mesh(shape, material), new THREE.Mesh(shape, this.outline));
      palm.add(thumb);
      this.digits[side].thumb = thumb;
    }
  }

  finishMeshes() {
    const bones = {
      hips: this.hips,
      torso: this.torso,
      head: this.head,
      upperL: this.upperL,
      upperR: this.upperR,
      foreL: this.foreL,
      foreR: this.foreR,
      palmL: this.palmL,
      palmR: this.palmR,
      thighL: this.thighL,
      thighR: this.thighR,
      shinL: this.shinL,
      shinR: this.shinR,
      footL: this.footL,
      footR: this.footR,
    };
    for (const [name, parts] of Object.entries(this.parts)) {
      if (!parts.length) continue;
      const geometry = mergeParts(parts);
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.castShadow = true;
      bones[name].add(mesh, new THREE.Mesh(geometry, this.outline));
    }
    this.parts = null;
  }

  applyMouth(name) {
    for (const [key, mouth] of Object.entries(this.mouths)) mouth.visible = key === name;
  }

  /** Puts the whole body into a pose. */
  setPose(pose) {
    const { build } = this.spec;
    const squash = pose.squash;
    this.lift.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
    this.lift.position.set(pose.side, pose.up, pose.forward);

    this.hips.position.set(pose.hipX, HIP_HEIGHT - pose.hipDrop, pose.hipZ);
    this.torso.rotation.set(pose.pitch, pose.twist, -pose.roll, 'YXZ');
    this.head.rotation.set(pose.headPitch - pose.pitch * 0.55, pose.headTurn - pose.twist * 0.5, pose.roll * 0.5, 'YXZ');

    // The hand targets are at the wrist, in arm lengths from the shoulder.
    this.reachHand(this.upperL, this.foreL, pose.handLX, pose.handLY, pose.handLZ, 1);
    this.reachHand(this.upperR, this.foreR, pose.handRX, pose.handRY, pose.handRZ, -1);
    this.palmL.rotation.x = pose.wristL;
    this.palmR.rotation.x = pose.wristR;
    this.curlHand('L', pose.openL);
    this.curlHand('R', pose.openR);

    this.reachFoot(this.thighL, this.shinL, this.footL, pose.footLX, pose.footLY, pose.footLZ, pose.footLPitch, 1);
    this.reachFoot(this.thighR, this.shinR, this.footR, pose.footRX, pose.footRY, pose.footRZ, pose.footRPitch, -1);
  }

  reachHand(upper, lower, x, y, z, sign) {
    const target = (this.target ??= new THREE.Vector3()).set(x, y, z).multiplyScalar(ARM_REACH);
    const pole = (this.pole ??= new THREE.Vector3()).set(sign * 0.75, -0.45, -0.55);
    reach(upper, lower, target, pole, UPPER_ARM, FOREARM);
  }

  reachFoot(upper, lower, foot, x, y, z, footPitch, sign) {
    // From the ground under the fighter to the top of this leg.
    const target = (this.target ??= new THREE.Vector3()).set(
      x - sign * HIP_WIDTH - this.hips.position.x,
      y + ANKLE_HEIGHT - this.hips.position.y,
      z - this.hips.position.z,
    );
    const pole = (this.pole ??= new THREE.Vector3()).set(sign * 0.28, 0, 1);
    reach(upper, lower, target, pole, THIGH, SHIN);
    // The foot stays flat, however the leg is bent, unless the pose tips it.
    const flatten = (this.flatten ??= new THREE.Quaternion());
    flatten.copy(upper.quaternion).multiply(lower.quaternion).invert();
    foot.quaternion.copy(flatten);
    foot.rotateX(footPitch);
  }

  curlHand(side, open) {
    const curl = (1 - THREE.MathUtils.clamp(open, 0, 1)) * 1.9;
    for (const digit of this.digits[side]) digit.rotation.x = curl;
    // Closes across the palm.
    this.digits[side].thumb.rotation.x = curl * 0.7;
  }

  faceTowards(radians) {
    this.root.rotation.y = radians;
  }

  setExpression(name, seconds = Infinity) {
    this.expression = name;
    this.expressionUntil = seconds === Infinity ? Infinity : this.time + seconds;
    this.applyMouth(EXPRESSIONS[name].mouth);
  }

  /** The small things that make a character look alive: blinking and easing expressions. */
  update(dt) {
    this.time += dt;
    if (this.time > this.expressionUntil) this.setExpression('ready');
    const look = EXPRESSIONS[this.expression];

    this.blinkIn -= dt;
    let eye = look.eye;
    if (this.blinkIn < 0) {
      eye = Math.min(eye, 0.1);
      if (this.blinkIn < -0.11) this.blinkIn = 1.5 + Math.random() * 3.5;
    }
    this.eyeOpen += (eye - this.eyeOpen) * Math.min(1, dt * 26);
    this.browAngle += (look.brow - this.browAngle) * Math.min(1, dt * 14);
    for (const item of this.eyes) item.scale.y = this.eyeOpen;
    for (const brow of this.brows) {
      brow.rotation.z = brow.userData.sign * this.browAngle;
      brow.position.y = brow.userData.y + look.browY;
    }
  }

  dispose() {
    this.root.traverse((node) => {
      node.geometry?.dispose();
      node.material?.dispose?.();
    });
  }
}
