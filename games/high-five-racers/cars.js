// The cars and who drives them. Each is a chunky toy with its own shape, driven by one of the
// characters from the other games, so that the race is full of faces the child knows.
//
// The character's arm on the side of the hand being played with is replaced by a big glove, which
// copies the child's hand finger by finger. That's how the child sees what the camera sees.
import * as THREE from '../../vendor/three/three.module.js';
import { ball, Fighter3D, makePose, mergeParts, outlineMaterial, roundedBox } from '../../core/body/characters.js';
import { canvasTexture, clamp, damp, lerp, TAU } from './kit.js';

const GLOVE_COLOURS = { open: '#3ddc84', closed: '#ffc21a', missing: '#c2ccd6' };
const WHEEL_SPIN_LIMIT = 40; // Radians a second. Faster than this would only look like flicker.
const DARK = '#2b3340';
const METAL = '#c7ced6';
const WHITE = '#f7fafc';

function tyreShape(radius, width) {
  const edge = width * 0.28;
  const half = width / 2;
  const points = [
    new THREE.Vector2(radius * 0.55, -half),
    new THREE.Vector2(radius - edge, -half),
    new THREE.Vector2(radius - edge * 0.25, -half + edge * 0.35),
    new THREE.Vector2(radius, -half + edge),
    new THREE.Vector2(radius, half - edge),
    new THREE.Vector2(radius - edge * 0.25, half - edge * 0.35),
    new THREE.Vector2(radius - edge, half),
    new THREE.Vector2(radius * 0.55, half),
  ];
  return new THREE.LatheGeometry(points, 22).rotateZ(Math.PI / 2);
}

/** A wheel with five spokes, so that it can be seen going round. */
function wheelGeometry(radius, width, hubColour) {
  const parts = [{ geometry: tyreShape(radius, width), colour: DARK }];
  const hub = ball(radius * 0.2, radius * 0.2, radius * 0.2);
  for (const face of [-1, 1]) {
    parts.push({ geometry: hub, colour: hubColour, at: [(face * width) / 2, 0, 0], size: [0.5, 1, 1] });
    for (let spoke = 0; spoke < 5; spoke += 1) {
      const angle = (spoke / 5) * TAU;
      parts.push({
        geometry: roundedBox(0.03, radius * 0.62, radius * 0.2, 0.012),
        colour: hubColour,
        at: [(face * width) / 2, Math.sin(angle) * radius * 0.36, Math.cos(angle) * radius * 0.36],
        turn: [-angle + Math.PI / 2, 0, 0],
      });
    }
    parts.push({
      geometry: new THREE.TorusGeometry(radius * 0.66, radius * 0.07, 6, 22).rotateY(Math.PI / 2),
      colour: hubColour,
      at: [(face * width) / 2, 0, 0],
    });
  }
  return mergeParts(parts);
}

const box = (w, h, d, r = Math.min(w, h, d) * 0.3) => roundedBox(w, h, d, r);

/** Four different shapes of car. Each says what it's made of, and where the wheels and seat go. */
const CAR_STYLES = {
  // Long and low, with a wing: the child's own car.
  roadster: ({ paint, trim }) => ({
    wheels: [
      { x: 1.02, z: 1.34, radius: 0.47, width: 0.42, front: true },
      { x: -1.02, z: 1.34, radius: 0.47, width: 0.42, front: true },
      { x: 1.04, z: -1.28, radius: 0.52, width: 0.5 },
      { x: -1.04, z: -1.28, radius: 0.52, width: 0.5 },
    ],
    seat: { y: 0.72, z: -0.12 },
    exhausts: [[0.46, 0.46, -2.34], [-0.46, 0.46, -2.34]],
    lamps: [[0.56, 0.86, -2.24], [-0.56, 0.86, -2.24]],
    body: [
      { geometry: box(1.74, 0.6, 3.9, 0.26), colour: paint, at: [0, 0.64, 0] },
      { geometry: ball(0.84, 0.34, 0.95), colour: paint, at: [0, 0.62, 1.6] },
      { geometry: ball(0.64, 0.3, 1.05), colour: paint, at: [0, 0.92, 1.04] },
      { geometry: ball(0.84, 0.36, 0.72), colour: paint, at: [0, 0.72, -1.64] },
      { geometry: ball(0.74, 0.34, 0.74), colour: paint, at: [0, 0.98, -1.24] },
      { geometry: ball(0.44, 0.47, 0.86), colour: paint, at: [0.85, 0.68, 1.3] },
      { geometry: ball(0.44, 0.47, 0.86), colour: paint, at: [-0.85, 0.68, 1.3] },
      { geometry: ball(0.48, 0.52, 0.94), colour: paint, at: [0.85, 0.7, -1.22] },
      { geometry: ball(0.48, 0.52, 0.94), colour: paint, at: [-0.85, 0.7, -1.22] },
      // Stripes over the bonnet and the back.
      { geometry: ball(0.13, 0.306, 1.052), colour: WHITE, at: [0.22, 0.92, 1.04] },
      { geometry: ball(0.13, 0.306, 1.052), colour: WHITE, at: [-0.22, 0.92, 1.04] },
      { geometry: ball(0.13, 0.346, 0.746), colour: WHITE, at: [0.22, 0.98, -1.24] },
      { geometry: ball(0.13, 0.346, 0.746), colour: WHITE, at: [-0.22, 0.98, -1.24] },
      // The wing at the back.
      { geometry: box(2.04, 0.1, 0.56, 0.04), colour: trim, at: [0, 1.72, -1.96] },
      { geometry: box(0.08, 0.52, 0.62, 0.03), colour: paint, at: [1.04, 1.62, -1.96] },
      { geometry: box(0.08, 0.52, 0.62, 0.03), colour: paint, at: [-1.04, 1.62, -1.96] },
      { geometry: box(0.1, 0.5, 0.18, 0.03), colour: DARK, at: [0.55, 1.42, -1.9] },
      { geometry: box(0.1, 0.5, 0.18, 0.03), colour: DARK, at: [-0.55, 1.42, -1.9] },
    ],
    trim: [
      { geometry: ball(0.66, 0.1, 0.72), colour: DARK, at: [0, 1.12, -0.12] },
      { geometry: box(1, 0.5, 0.22, 0.1), colour: DARK, at: [0, 1.26, -0.72] },
      { geometry: box(1.5, 0.36, 0.08, 0.03), colour: DARK, at: [0, 0.86, -2.22] },
      { geometry: box(1.36, 0.22, 0.2, 0.05), colour: DARK, at: [0, 0.42, -2.2] },
      { geometry: box(1.2, 0.24, 0.12, 0.05), colour: DARK, at: [0, 0.54, 2.4] },
      { geometry: ball(0.19, 0.17, 0.08), colour: '#fff4c2', at: [0.54, 0.78, 2.24] },
      { geometry: ball(0.19, 0.17, 0.08), colour: '#fff4c2', at: [-0.54, 0.78, 2.24] },
    ],
  }),

  // Round as a beetle.
  bug: ({ paint, trim }) => ({
    wheels: [
      { x: 0.98, z: 1.22, radius: 0.46, width: 0.38, front: true },
      { x: -0.98, z: 1.22, radius: 0.46, width: 0.38, front: true },
      { x: 0.98, z: -1.18, radius: 0.46, width: 0.38 },
      { x: -0.98, z: -1.18, radius: 0.46, width: 0.38 },
    ],
    seat: { y: 0.92, z: -0.2 },
    exhausts: [[0, 0.42, -2.1]],
    lamps: [[0.52, 0.92, -2.02], [-0.52, 0.92, -2.02]],
    body: [
      { geometry: ball(0.94, 0.72, 2.08), colour: paint, at: [0, 0.86, 0] },
      { geometry: ball(0.42, 0.42, 0.72), colour: paint, at: [0.84, 0.62, 1.22] },
      { geometry: ball(0.42, 0.42, 0.72), colour: paint, at: [-0.84, 0.62, 1.22] },
      { geometry: ball(0.42, 0.42, 0.72), colour: paint, at: [0.84, 0.62, -1.18] },
      { geometry: ball(0.42, 0.42, 0.72), colour: paint, at: [-0.84, 0.62, -1.18] },
      { geometry: ball(0.32, 0.32, 0.32), colour: trim, at: [0, 1.28, 0.95], size: [0.8, 0.4, 1] },
      { geometry: ball(0.3, 0.3, 0.1), colour: trim, at: [0.72, 1.12, -0.6], size: [0.2, 1, 3] },
      { geometry: ball(0.3, 0.3, 0.1), colour: trim, at: [-0.72, 1.12, -0.6], size: [0.2, 1, 3] },
    ],
    trim: [
      { geometry: ball(0.62, 0.12, 0.7), colour: DARK, at: [0, 1.5, -0.2] },
      { geometry: box(1.1, 0.16, 0.14, 0.05), colour: METAL, at: [0, 0.46, 2.02] },
      { geometry: box(1.1, 0.16, 0.14, 0.05), colour: METAL, at: [0, 0.46, -2.02] },
      { geometry: ball(0.17, 0.17, 0.08), colour: '#fff4c2', at: [0.46, 0.86, 1.95] },
      { geometry: ball(0.17, 0.17, 0.08), colour: '#fff4c2', at: [-0.46, 0.86, 1.95] },
    ],
  }),

  // A big engine out in the open, and big wheels at the back.
  hotrod: ({ paint, trim }) => ({
    wheels: [
      { x: 0.98, z: 1.62, radius: 0.4, width: 0.3, front: true },
      { x: -0.98, z: 1.62, radius: 0.4, width: 0.3, front: true },
      { x: 1.1, z: -1.2, radius: 0.66, width: 0.56 },
      { x: -1.1, z: -1.2, radius: 0.66, width: 0.56 },
    ],
    seat: { y: 0.78, z: -0.5 },
    exhausts: [[0.82, 0.58, -2], [-0.82, 0.58, -2]],
    lamps: [[0.42, 0.98, -2], [-0.42, 0.98, -2]],
    body: [
      { geometry: box(1.3, 0.5, 2.5, 0.2), colour: paint, at: [0, 0.72, 0.8] },
      { geometry: box(1.5, 0.84, 2.2, 0.32), colour: paint, at: [0, 0.82, -0.9] },
      { geometry: box(0.5, 0.05, 1.6, 0.02), colour: trim, at: [0, 1.25, -1.12] },
      { geometry: box(0.3, 0.05, 2.4, 0.02), colour: trim, at: [0, 0.98, 0.8] },
      { geometry: box(0.92, 0.26, 1.5, 0.08), colour: trim, at: [0, 1.12, 0.92] },
    ],
    trim: [
      { geometry: ball(0.56, 0.1, 0.66), colour: DARK, at: [0, 1.24, -0.5] },
      { geometry: box(0.9, 0.7, 0.2, 0.08), colour: DARK, at: [0, 1.5, -1.05] },
      { geometry: box(0.7, 0.42, 1, 0.1), colour: METAL, at: [0, 1.42, 0.9] },
      { geometry: box(0.5, 0.2, 0.6, 0.06), colour: DARK, at: [0, 1.72, 0.9] },
      { geometry: box(1.1, 0.5, 0.1, 0.04), colour: METAL, at: [0, 0.78, 2.1] },
      { geometry: ball(0.18), colour: '#fff4c2', at: [0.62, 1.12, 2.06] },
      { geometry: ball(0.18), colour: '#fff4c2', at: [-0.62, 1.12, 2.06] },
      { geometry: box(1.5, 0.18, 0.1, 0.04), colour: DARK, at: [0, 0.96, -2.02] },
    ],
  }),

  // Big soft tyres and a frame to hold on to.
  buggy: ({ paint, trim }) => ({
    wheels: [
      { x: 1.16, z: 1.34, radius: 0.58, width: 0.56, front: true },
      { x: -1.16, z: 1.34, radius: 0.58, width: 0.56, front: true },
      { x: 1.16, z: -1.26, radius: 0.62, width: 0.6 },
      { x: -1.16, z: -1.26, radius: 0.62, width: 0.6 },
    ],
    seat: { y: 0.86, z: -0.1 },
    exhausts: [[0.3, 0.86, -1.9], [-0.3, 0.86, -1.9]],
    lamps: [[0.5, 1, -1.82], [-0.5, 1, -1.82]],
    body: [
      { geometry: box(1.4, 0.5, 3.4, 0.2), colour: paint, at: [0, 0.82, 0] },
      { geometry: ball(0.72, 0.28, 0.76), colour: paint, at: [0, 0.84, 1.54] },
      { geometry: box(0.1, 1.3, 0.1, 0.03), colour: trim, at: [0.62, 1.68, 0.6], turn: [-0.45, 0, 0] },
      { geometry: box(0.1, 1.3, 0.1, 0.03), colour: trim, at: [-0.62, 1.68, 0.6], turn: [-0.45, 0, 0] },
      { geometry: box(0.1, 1.5, 0.1, 0.03), colour: trim, at: [0.62, 1.68, -0.92], turn: [0.3, 0, 0] },
      { geometry: box(0.1, 1.5, 0.1, 0.03), colour: trim, at: [-0.62, 1.68, -0.92], turn: [0.3, 0, 0] },
      { geometry: box(1.34, 0.1, 0.1, 0.03), colour: trim, at: [0, 2.36, 0.3] },
      { geometry: box(1.34, 0.1, 0.1, 0.03), colour: trim, at: [0, 2.36, -0.68] },
      { geometry: box(0.1, 0.1, 1.08, 0.03), colour: trim, at: [0.66, 2.36, -0.19] },
      { geometry: box(0.1, 0.1, 1.08, 0.03), colour: trim, at: [-0.66, 2.36, -0.19] },
    ],
    trim: [
      { geometry: ball(0.56, 0.1, 0.6), colour: DARK, at: [0, 1.08, -0.1] },
      { geometry: box(0.9, 0.7, 0.18, 0.08), colour: DARK, at: [0, 1.4, -0.66] },
      { geometry: box(1.2, 0.3, 0.14, 0.05), colour: METAL, at: [0, 0.68, 2.2] },
      { geometry: ball(0.16), colour: '#fff4c2', at: [0.42, 1.08, 1.86] },
      { geometry: ball(0.16), colour: '#fff4c2', at: [-0.42, 1.08, 1.86] },
      { geometry: box(1.2, 0.3, 0.08, 0.04), colour: DARK, at: [0, 0.96, -1.72] },
    ],
  }),
};

export const RIVAL_STYLES = ['bug', 'hotrod', 'buggy'];

/** A big cartoon glove on the car that copies one of the child's hands, finger by finger. */
const DIGITS = {
  index: { x: 0.31, length: 0.62, fan: 0.16 },
  middle: { x: 0.1, length: 0.7, fan: 0.04 },
  ring: { x: -0.11, length: 0.62, fan: -0.08 },
  pinky: { x: -0.31, length: 0.48, fan: -0.22 },
};

function makeGlove(side) {
  // Seen from behind the car the screen's left is +X, and thumbs point inwards.
  const inward = side === 'left' ? -1 : 1;
  const material = new THREE.MeshStandardMaterial({ color: GLOVE_COLOURS.missing, roughness: 0.55 });
  const root = new THREE.Group();

  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.47, 20, 14), material);
  palm.scale.set(1.06, 1.08, 0.52);
  palm.castShadow = true;
  root.add(palm);

  const digits = {};
  const capsule = (length, radius) => {
    const geometry = new THREE.CapsuleGeometry(radius, length, 5, 12);
    geometry.translate(0, length / 2 + radius * 0.4, 0);
    return geometry;
  };
  for (const [name, { x, length, fan }] of Object.entries(DIGITS)) {
    const pivot = new THREE.Group();
    pivot.position.set(x * inward, 0.36, 0);
    const finger = new THREE.Mesh(capsule(length, 0.125), material);
    finger.castShadow = true;
    pivot.add(finger);
    root.add(pivot);
    digits[name] = { pivot, fan, extension: 1 };
  }
  const thumbPivot = new THREE.Group();
  thumbPivot.position.set(0.38 * inward, -0.1, 0.04);
  const thumb = new THREE.Mesh(capsule(0.46, 0.135), material);
  thumb.castShadow = true;
  thumbPivot.add(thumb);
  root.add(thumbPivot);
  digits.thumb = { pivot: thumbPivot, fan: 0, extension: 1 };

  const targetColour = new THREE.Color(GLOVE_COLOURS.missing);

  function setPose(fingers, status, dt) {
    for (const [name, digit] of Object.entries(digits)) {
      digit.extension = damp(digit.extension, fingers[name], 14, dt);
      const e = digit.extension;
      if (name === 'thumb') {
        digit.pivot.rotation.z = -inward * lerp(0.2, 1.02, e);
        digit.pivot.rotation.x = (1 - e) * 1.2;
      } else {
        digit.pivot.rotation.x = (1 - e) * 2.15;
        digit.pivot.rotation.z = -inward * digit.fan * e;
        digit.pivot.scale.y = 0.62 + 0.38 * e;
      }
    }
    targetColour.set(GLOVE_COLOURS[status]);
    material.color.lerp(targetColour, 1 - Math.exp(-dt * 12));
  }

  return { root, setPose };
}

const SHOULDER_HEIGHT = 1.4;
const GLOVE_REST = new THREE.Vector3(1.28, 3.05, -0.1);
const GLOVE_SLAP = new THREE.Vector3(3.4, 3.1, 1.2);

/** The child's glove and the arm that holds it up, which stretches for a high five. */
export function makeDriver() {
  const group = new THREE.Group();
  const sleeveMaterial = new THREE.MeshStandardMaterial({ color: '#f7fafc', roughness: 0.6 });
  const sleeveShape = new THREE.CapsuleGeometry(0.13, 1, 4, 10);
  const left = makeGlove('left');
  const right = makeGlove('right');
  const sleeves = {};
  const shoulders = {};
  for (const [glove, sign, side] of [[left, 1, 'left'], [right, -1, 'right']]) {
    group.add(glove.root);
    const sleeve = new THREE.Mesh(sleeveShape, sleeveMaterial);
    sleeve.castShadow = true;
    group.add(sleeve);
    sleeves[side] = sleeve;
    shoulders[side] = new THREE.Vector3(sign * 0.34, SHOULDER_HEIGHT, -0.12);
    glove.root.position.set(sign * GLOVE_REST.x, GLOVE_REST.y, GLOVE_REST.z);
    glove.root.rotation.z = -sign * 0.14;
  }

  const upward = new THREE.Vector3(0, 1, 0);
  const between = new THREE.Vector3();
  const target = new THREE.Vector3();

  /** reach is 0 at rest and 1 at full stretch, towards towards = -1 (screen left, +X) or 1 (screen right). */
  function reachOut(side, reach, towards) {
    const sign = side === 'left' ? 1 : -1;
    const glove = side === 'left' ? left : right;
    target.set(sign * GLOVE_REST.x, GLOVE_REST.y, GLOVE_REST.z);
    if (reach > 0) {
      target.x = lerp(target.x, -towards * GLOVE_SLAP.x, reach);
      target.y = lerp(target.y, GLOVE_SLAP.y, reach);
      target.z = lerp(target.z, GLOVE_SLAP.z, reach);
    }
    glove.root.position.copy(target);
    glove.root.rotation.z = lerp(-sign * 0.14, towards * 0.5, reach);
    const shoulder = shoulders[side];
    between.subVectors(target, shoulder);
    const length = between.length();
    const sleeve = sleeves[side];
    sleeve.position.copy(shoulder).addScaledVector(between, 0.5);
    sleeve.quaternion.setFromUnitVectors(upward, between.normalize());
    sleeve.scale.y = length / 1.26;
  }

  function setSleeveColour(colour) {
    sleeveMaterial.color.set(colour);
  }

  reachOut('left', 0, -1);
  reachOut('right', 0, 1);
  return { group, left, right, sleeves, reachOut, setSleeveColour };
}

function nameTag(spec, colour) {
  const texture = canvasTexture(256, 72, (ctx, w, h) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 28);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 42px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.name, w / 2, h / 2 + 2);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0, fog: false }));
  sprite.scale.set(2.4, 0.68, 1);
  return sprite;
}

/** The light a brake lamp gives off, small and soft. It fades up, so it can't flash. */
function lampGlow(texture) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    color: '#ff3a24',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
  }));
  sprite.scale.setScalar(1.35);
  return sprite;
}

/** A flame like a teardrop, yellow at the pipe and going orange towards the tip. It points along -Z. */
function flameGeometry() {
  const points = [];
  const steps = 10;
  for (let i = 0; i <= steps; i += 1) {
    const along = i / steps;
    const width = Math.sin(Math.min(1, along * 3.2) * Math.PI * 0.5) * (1 - along) ** 0.8 * 0.24;
    points.push(new THREE.Vector2(Math.max(0.001, width), along));
  }
  const geometry = new THREE.LatheGeometry(points, 12);
  const position = geometry.attributes.position;
  const colours = new Float32Array(position.count * 3);
  const near = new THREE.Color('#fff2b0');
  const middle = new THREE.Color('#ffb52e');
  const tip = new THREE.Color('#ff5a1f');
  const colour = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    const along = position.getY(i);
    if (along < 0.35) colour.lerpColors(near, middle, along / 0.35);
    else colour.lerpColors(middle, tip, (along - 0.35) / 0.65);
    colours.set([colour.r, colour.g, colour.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geometry.rotateX(-Math.PI / 2);
}

export class RaceCar {
  /** styleName picks a shape from CAR_STYLES, and spec is who's driving. */
  constructor({ styleName, paint, trim, spec, environment, glowTexture, isPlayer = false }) {
    this.isPlayer = isPlayer;
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.time = Math.random() * 10;
    const style = CAR_STYLES[styleName]({ paint, trim });
    this.style = style;

    const bodyGeometry = mergeParts(style.body);
    this.paintMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.12, envMap: environment, envMapIntensity: 0.9 });
    const body = new THREE.Mesh(bodyGeometry, this.paintMaterial);
    body.castShadow = true;
    const trimGeometry = mergeParts(style.trim);
    const trimMesh = new THREE.Mesh(trimGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2, envMap: environment, envMapIntensity: 0.6 }));
    this.group.add(body, trimMesh);
    this.inkLines = new THREE.Mesh(bodyGeometry, outlineMaterial('#27384b', 0.022));
    this.group.add(this.inkLines);

    this.wheels = style.wheels.map(({ x, z, radius, width, front = false }) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, radius, z);
      const spinner = new THREE.Group();
      const wheel = new THREE.Mesh(wheelGeometry(radius, width, trim), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
      wheel.castShadow = true;
      spinner.add(wheel);
      pivot.add(spinner);
      this.group.add(pivot);
      return { pivot, spinner, front, radius };
    });

    // The lamps at the back, which are what says the car is slowing down.
    this.brakeMaterial = new THREE.MeshStandardMaterial({ color: '#c92a20', emissive: '#ff2414', emissiveIntensity: 0.15 });
    const lampShape = ball(0.2, 0.14, 0.07);
    this.brakeGlows = style.lamps.map(([x, y, z]) => {
      const lamp = new THREE.Mesh(lampShape, this.brakeMaterial);
      lamp.position.set(x, y, z);
      const glow = lampGlow(glowTexture);
      glow.position.set(x, y, z - 0.12);
      this.group.add(lamp, glow);
      return glow;
    });
    this.braking = 0;

    // Exhaust pipes, with flames for turbo. Their size changes, but never how bright they are.
    const pipeShape = new THREE.CylinderGeometry(0.11, 0.09, 0.42, 10).rotateX(Math.PI / 2);
    const pipeMaterial = new THREE.MeshStandardMaterial({ color: METAL, roughness: 0.3, metalness: 0.7, envMap: environment });
    const flameShape = flameGeometry();
    const flameMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    this.flames = style.exhausts.map(([x, y, z]) => {
      const pipe = new THREE.Mesh(pipeShape, pipeMaterial);
      pipe.position.set(x, y, z + 0.14);
      const flame = new THREE.Mesh(flameShape, flameMaterial);
      flame.position.set(x, y, z - 0.06);
      flame.visible = false;
      this.group.add(pipe, flame);
      return flame;
    });
    this.exhausts = style.exhausts.map(([x, y, z]) => new THREE.Vector3(x, y, z - 0.1));
    this.flameLevel = 0;
    this.flaming = false;

    // The little wheel that the driver holds, which turns with the road.
    this.steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 6, 16), new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.6 }));
    this.steeringWheel.position.set(0, style.seat.y + 0.56, style.seat.z + 0.72);
    this.steeringWheel.rotation.x = -0.5;
    this.group.add(this.steeringWheel);

    this.tag = null;
    this.tagColour = paint;
    this.pose = makePose();
    this.look = 0;
    this.wave = 0;
    this.lean = 0;
    this.tilt = 0;
    this.fighter = null;
    this.setCharacter(spec);
  }

  setCharacter(spec) {
    if (this.fighter) {
      this.group.remove(this.fighter.root);
      this.fighter.dispose();
    }
    this.spec = spec;
    this.fighter = new Fighter3D(spec);
    const { fighter, style: { seat } } = this;
    const size = 0.92;
    fighter.root.scale.setScalar(size);
    fighter.root.position.set(0, seat.y - 0.62 * size, seat.z);
    fighter.setExpression('happy');
    // Nobody sees legs in a car, so there's no need to draw them.
    fighter.thighL.visible = false;
    fighter.thighR.visible = false;
    fighter.hips.children.filter((child) => child.isMesh).forEach((mesh) => {
      mesh.visible = false;
    });
    if (!this.isPlayer) {
      fighter.root.traverse((node) => {
        if (node.isMesh) node.castShadow = false;
      });
    }
    Object.assign(this.pose, { handLX: -0.32, handLY: -0.3, handLZ: 0.82, handRX: 0.32, handRY: -0.3, handRZ: 0.82 });
    fighter.setPose(this.pose);
    this.group.add(fighter.root);

    if (!this.isPlayer) {
      if (this.tag) this.group.remove(this.tag);
      this.tag = nameTag(spec, this.tagColour);
      this.tag.position.set(0, seat.y + 2.6 + spec.build.neck, seat.z);
      this.group.add(this.tag);
    }
  }

  /** Which of the character's arms is the child's glove. null shows both of the character's. */
  setFreeArm(side) {
    this.gloveSide = side;
    this.fighter.upperL.visible = side !== 'left';
    this.fighter.upperR.visible = side !== 'right';
  }

  place(track, distance, lateral, speed, yaw, dt, { lift = 0, pitch = 0, roll = 0, bob = 0 } = {}) {
    track.pointAt(distance, lateral, this.group.position);
    this.group.position.y += lift + (speed > 1 ? Math.sin(this.time * 19 + distance) * 0.012 : 0) + bob;
    this.group.rotation.y = track.headingAt(distance) + yaw;
    this.group.rotation.x = -track.pitchAt(distance) + pitch;
    this.group.rotation.z = roll;
    const spin = Math.min(WHEEL_SPIN_LIMIT, speed / 0.47);
    for (const wheel of this.wheels) {
      wheel.spinner.rotation.x += spin * dt * (0.47 / wheel.radius);
      if (wheel.front) wheel.pivot.rotation.y = yaw * 3 - track.curvatureAt(distance) * 2.4;
    }
    this.steeringWheel.rotation.z = (yaw * 4 + track.curvatureAt(distance) * 5) * 1.4;
  }

  /** braking is how hard the car is slowing, from 0 to 1. */
  setBraking(amount, dt) {
    this.braking = damp(this.braking, amount, 14, dt);
    this.brakeMaterial.emissiveIntensity = 0.15 + this.braking * 0.75;
    for (const glow of this.brakeGlows) glow.material.opacity = this.braking * 0.62;
  }

  /** level is 0 for none and 1 for the biggest flames. */
  setFlames(level, dt, steady = false) {
    this.flameLevel = damp(this.flameLevel, level, 12, dt);
    const showing = this.flameLevel > 0.02;
    this.flames.forEach((flame, index) => {
      flame.visible = showing;
      if (!showing) return;
      // The size wanders slowly. The colour stays the same, so nothing flickers.
      const wander = steady ? 1 : 1 + 0.12 * Math.sin(this.time * 15 + index * 2) + 0.08 * Math.sin(this.time * 7.3 + index);
      const length = (0.5 + this.flameLevel * 1.2) * wander;
      const width = 0.8 + this.flameLevel * 0.5;
      flame.scale.set(width, width, length);
    });
  }

  /** Drives the character: looking, leaning, waving, and hands on the wheel. */
  updateDriver(dt, { steer = 0, excited = 0 } = {}) {
    this.time += dt;
    const { pose } = this;
    pose.headTurn = damp(pose.headTurn, this.look, 6, dt);
    pose.roll = damp(pose.roll, -steer * 0.16, 6, dt);
    pose.pitch = damp(pose.pitch, -excited * 0.2, 5, dt);
    this.wave = Math.max(0, this.wave - dt);

    const waving = this.wave > 0;
    const armLeft = this.isPlayer && this.gloveSide === 'left';
    // The free hand waves. For a rival that's the one nearest the camera's middle: its right.
    const swing = Math.sin(this.time * 9) * 0.16;
    pose.handRX = damp(pose.handRX, waving && !armLeft ? -0.62 + swing : 0.32, 12, dt);
    pose.handRY = damp(pose.handRY, waving && !armLeft ? 0.7 : -0.3, 12, dt);
    pose.handRZ = damp(pose.handRZ, waving && !armLeft ? 0.1 : 0.82, 12, dt);
    pose.handLX = damp(pose.handLX, waving && armLeft ? 0.62 + swing : -0.32, 12, dt);
    pose.handLY = damp(pose.handLY, waving && armLeft ? 0.7 : -0.3, 12, dt);
    pose.handLZ = damp(pose.handLZ, waving && armLeft ? 0.1 : 0.82, 12, dt);
    this.fighter.setPose(pose);
    this.fighter.update(dt);
    // A character goes back to looking fierce after anything, which is for fights. Here everyone's enjoying it.
    if (this.fighter.expression === 'ready') this.fighter.setExpression('happy');
  }

  /** Where an exhaust pipe is in the world. */
  exhaustAt(index, out) {
    return out.copy(this.exhausts[index % this.exhausts.length]).applyEuler(this.group.rotation).add(this.group.position);
  }

  /** Only near cars need a name over them. */
  showTag(amount) {
    if (this.tag) this.tag.material.opacity = clamp(amount, 0, 1) * 0.95;
  }

  /** For a slow computer: the ink lines on the characters and cars are the first things to go. */
  setDetail(full) {
    this.inkLines.visible = full;
    this.fighter.root.traverse((node) => {
      if (node.isMesh && node.material.side === THREE.BackSide) node.visible = full;
    });
  }

  dispose() {
    this.fighter?.dispose();
  }
}

