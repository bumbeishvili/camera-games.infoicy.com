// The tanks: the child's own, with Joze's long neck sticking up out of the hatch, and the robot tanks and
// their little crews. They're all toys, in bright colours with a dark outline, so they stand out from the
// valley behind them. Nobody gets hurt: when a robot tank stops, its crew climbs out and waves.
import * as THREE from '../../vendor/three/three.module.js';
import { ball, Fighter3D, makePose, mergeParts, outlineMaterial, roundedBox, star, toon } from '../../core/body/characters.js';
import { byId } from '../../core/body/roster.js';
import { groundY } from './valley-map.js';

const INK = '#1d2740';
const OUTLINE = 0.055;
const JOZE_SIZE = 2.7;
const EXTRA_NECK = 0.46; // He's riding with his neck stuck up out of the hatch, so it's even longer than usual.
const PADS_PER_SIDE = 26;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
const easeOut = (share) => 1 - (1 - share) ** 3;
const cylinder = (top, bottom, height, sides = 16) => new THREE.CylinderGeometry(top, bottom, height, sides);
/** A cylinder lying along z, as a gun barrel does. */
const barrel = (top, bottom, length, sides = 16) => cylinder(top, bottom, length, sides).rotateX(Math.PI / 2);
const paintOf = () => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() });

/** The parts of something, painted and with an ink line round them. */
function inked(parent, parts, { width = OUTLINE, ink = INK, materials = null } = {}) {
  const geometry = mergeParts(parts);
  const paint = paintOf();
  const line = outlineMaterial(ink, width);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, paint), new THREE.Mesh(geometry, line));
  parent.add(group);
  materials?.push(paint, line);
  return group;
}

/** A soft dark patch on the ground under something. */
function softShadow(texture, wide, deep) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(wide, deep).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: texture, color: '#102a22', transparent: true, opacity: 0.5, depthWrite: false }),
  );
  mesh.renderOrder = 1;
  return mesh;
}

export function shadowTexture() {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const glow = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size / 2);
  glow.addColorStop(0, 'rgb(255 255 255 / 1)');
  glow.addColorStop(0.6, 'rgb(255 255 255 / 0.7)');
  glow.addColorStop(1, 'rgb(255 255 255 / 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The links of a tread, going round and round as the tank drives. */
class Treads {
  constructor(parent, { length, high, wide, apart, colour }) {
    this.radius = high / 2;
    this.straight = length - high;
    this.apart = apart;
    this.centre = high / 2;
    this.around = this.straight * 2 + Math.PI * high;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(wide, 0.17, (this.around / PADS_PER_SIDE) * 0.62), new THREE.MeshToonMaterial({ color: colour, gradientMap: toon() }), PADS_PER_SIDE * 2);
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    this.matrix = new THREE.Matrix4();
    this.turn = new THREE.Quaternion();
    this.place = new THREE.Vector3();
    this.size = new THREE.Vector3(1, 1, 1);
    this.axis = new THREE.Vector3(1, 0, 0);
    this.left = 0;
    this.right = 0;
    this.write();
  }

  /** Where a link is, a distance round the track from the back of the top. */
  link(at, side, index) {
    const { straight, radius, centre, around, apart } = this;
    const d = ((at % around) + around) % around;
    let y;
    let z;
    let tilt;
    if (d < straight) {
      y = centre + radius;
      z = straight / 2 - d;
      tilt = 0;
    } else if (d < straight + Math.PI * radius) {
      const angle = (d - straight) / radius;
      y = centre + Math.cos(angle) * radius;
      z = -straight / 2 - Math.sin(angle) * radius;
      tilt = angle;
    } else if (d < straight * 2 + Math.PI * radius) {
      y = centre - radius;
      z = -straight / 2 + (d - straight - Math.PI * radius);
      tilt = Math.PI;
    } else {
      const angle = (d - straight * 2 - Math.PI * radius) / radius;
      y = centre - Math.cos(angle) * radius;
      z = straight / 2 + Math.sin(angle) * radius;
      tilt = Math.PI + angle;
    }
    this.place.set(side * apart, y, z);
    this.turn.setFromAxisAngle(this.axis, tilt);
    this.mesh.setMatrixAt(index, this.matrix.compose(this.place, this.turn, this.size));
  }

  write() {
    const each = this.around / PADS_PER_SIDE;
    for (let i = 0; i < PADS_PER_SIDE; i += 1) {
      this.link(this.left + i * each, -1, i);
      this.link(this.right + i * each, 1, i + PADS_PER_SIDE);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** How far each side has gone round. A tank turning on the spot has them going opposite ways. */
  roll(leftStep, rightStep) {
    if (leftStep === 0 && rightStep === 0) return;
    this.left += leftStep;
    this.right += rightStep;
    this.write();
  }
}

/** What all tanks do: follow the ground, lean as they go, and turn their turrets. */
class TankBody {
  constructor(length, wide) {
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.length = length;
    this.wide = wide;
    this.pitch = 0;
    this.roll = 0;
    this.kick = 0;
  }

  /** Puts it on the ground, tipped to match the slope. */
  place(tank, dt, { snap = false } = {}) {
    const { x, y, z, heading } = tank;
    const ahead = this.length * 0.45;
    const side = this.wide * 0.45;
    const fx = Math.sin(heading);
    const fz = -Math.cos(heading);
    const front = groundY(x + fx * ahead, z + fz * ahead);
    const back = groundY(x - fx * ahead, z - fz * ahead);
    const left = groundY(x + fz * side, z - fx * side);
    const right = groundY(x - fz * side, z + fx * side);
    const pitch = Math.atan2(front - back, ahead * 2);
    const roll = Math.atan2(right - left, side * 2);
    const rate = snap ? 1000 : 8;
    this.pitch = damp(this.pitch, pitch, rate, dt);
    this.roll = damp(this.roll, roll, rate, dt);
    this.root.position.set(x, (front + back) / 2 > y ? (front + back) / 2 : y, z);
    // A little nod with speeding up and slowing down.
    this.root.rotation.set(this.pitch + this.kick * 0.03, -heading, this.roll);
    if (this.shadow) {
      // A little to one side, the way the shadows on the ground fall.
      this.shadow.position.set(x + 0.7, y + 0.12, z + 0.45);
      this.shadow.rotation.y = -heading;
    }
  }
}

/* ------------------------------- the child's tank ------------------------------- */

/** Joze, with some more neck, to stick up out of the hatch and sway about. */
function longNeckedJoze() {
  const joze = byId('joze');
  return {
    ...joze,
    build: { ...joze.build, neck: joze.build.neck + EXTRA_NECK },
    dress(kit) {
      joze.dress(kit);
      const { add, ball: blob, taper, curl, colours } = kit;
      add('torso', taper(0.14, 0.122, 0.72), colours.body, [0, 1.06, 0]);
      add('torso', curl([[0, 1.14, -0.145], [0, 1.4, -0.13], [0, 1.7, -0.125]], 0.04, 0.026), '#8a4f1d');
      for (const [turn, y, size] of [[0.4, 1.24, 1], [-0.9, 1.34, 0.9], [1.5, 1.42, 1], [-1.7, 1.2, 1], [0, 1.54, 0.85], [-0.6, 1.64, 0.8], [1, 1.66, 0.75], [2.7, 1.34, 0.85], [-2.6, 1.52, 0.8]]) {
        const radius = 0.13;
        add('torso', blob(0.05 * size, 0.062 * size, 0.014), '#b4682c', [Math.sin(turn) * radius, y, Math.cos(turn) * radius], undefined, [0, turn, 0]);
      }
    },
  };
}

export class ChildTank extends TankBody {
  constructor(scene, shadow, reducedMotion) {
    super(7.8, 5.4);
    this.reducedMotion = reducedMotion;
    const main = '#2f6fed';
    const light = '#6fa4ff';
    const trim = '#ffd23f';
    const steel = '#3a4a68';

    this.treads = new Treads(this.root, { length: 7.8, high: 1.55, wide: 1.2, apart: 2.1, colour: '#26303f' });
    const wheels = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i += 1) {
        const z = -2.6 + i * 1.3;
        wheels.push({ geometry: cylinder(0.52, 0.52, 0.2, 14).rotateZ(Math.PI / 2), colour: '#3a4557', at: [side * 2.72, 0.78, z] });
        wheels.push({ geometry: cylinder(0.26, 0.26, 0.26, 10).rotateZ(Math.PI / 2), colour: trim, at: [side * 2.76, 0.78, z] });
      }
    }
    inked(this.root, [
      ...wheels,
      { geometry: roundedBox(1.15, 1.25, 7.1, 0.5), colour: '#333e52', at: [-2.1, 0.78, 0] },
      { geometry: roundedBox(1.15, 1.25, 7.1, 0.5), colour: '#333e52', at: [2.1, 0.78, 0] },
      // The hull.
      { geometry: roundedBox(3.5, 1.1, 7.3, 0.3), colour: main, at: [0, 1.15, 0.05] },
      { geometry: roundedBox(5.5, 0.34, 8, 0.15), colour: light, at: [0, 1.78, 0] },
      { geometry: roundedBox(4.7, 0.62, 6.6, 0.22), colour: main, at: [0, 2.12, 0.15] },
      { geometry: roundedBox(4.74, 0.14, 6.64, 0.05), colour: trim, at: [0, 1.96, 0.15] },
      // Its round lamps, its nose and what's at the back.
      { geometry: ball(0.38), colour: '#fff3b0', at: [-1.7, 2.1, -3.2] },
      { geometry: ball(0.38), colour: '#fff3b0', at: [1.7, 2.1, -3.2] },
      { geometry: roundedBox(2, 0.5, 0.5, 0.15), colour: trim, at: [0, 1.5, -3.85] },
      { geometry: roundedBox(1.5, 0.6, 0.8, 0.12), colour: '#26508f', at: [-1.35, 2.6, 2.9] },
      { geometry: cylinder(0.24, 0.3, 1, 10), colour: steel, at: [1.7, 2.7, 3] },
      { geometry: cylinder(0.32, 0.26, 0.2, 10), colour: '#1d2740', at: [1.7, 3.2, 3] },
    ]);

    // The turret, which turns, with the hatch Joze rides in.
    this.turret = new THREE.Group();
    this.turret.position.set(0, 2.42, 0.25);
    this.root.add(this.turret);
    inked(this.turret, [
      { geometry: cylinder(2.25, 2.45, 0.34, 24), colour: steel, at: [0, 0, 0] },
      { geometry: ball(2.2, 1.02, 2.3), colour: main, at: [0, 0.34, 0] },
      { geometry: cylinder(1.12, 1.2, 0.34, 20), colour: trim, at: [0, 1.18, 0.34] },
      { geometry: star(0.62, 0.28, 0.14).rotateY(Math.PI / 2), colour: '#ffffff', at: [2.16, 0.45, 0.2] },
      { geometry: star(0.62, 0.28, 0.14).rotateY(-Math.PI / 2), colour: '#ffffff', at: [-2.16, 0.45, 0.2] },
      // The lid of the hatch, standing open behind him.
      { geometry: roundedBox(1.9, 0.2, 1.3, 0.08), colour: light, at: [0, 1.85, 1.7], turn: [1.05, 0, 0] },
    ]);
    this.gun = new THREE.Group();
    this.gun.position.set(0, 0.42, -1.5);
    this.turret.add(this.gun);
    inked(this.gun, [
      { geometry: barrel(0.4, 0.48, 3.6), colour: steel, at: [0, 0, -1.7] },
      { geometry: barrel(0.56, 0.56, 0.62), colour: trim, at: [0, 0, -3.5] },
      { geometry: barrel(0.56, 0.62, 0.5), colour: main, at: [0, 0, 0] },
    ]);

    // A pennant on a little mast.
    this.mast = new THREE.Group();
    this.mast.position.set(-1.35, 0.6, 1.2);
    this.turret.add(this.mast);
    inked(this.mast, [{ geometry: cylinder(0.05, 0.07, 2.8, 6), colour: '#26303f', at: [0, 1.4, 0] }], { width: 0.02 });
    this.flag = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 3).rotateZ(-Math.PI / 2).translate(0.75, 0, 0).scale(1, 1, 0.12), new THREE.MeshToonMaterial({ color: trim, gradientMap: toon() }));
    this.flag.position.set(0, 2.55, 0);
    this.mast.add(this.flag);

    // Joze, who's very pleased to be here.
    this.joze = new Fighter3D(longNeckedJoze());
    this.joze.root.scale.setScalar(JOZE_SIZE);
    this.joze.root.position.set(0, -1.42, 0.34);
    this.turret.add(this.joze.root);
    this.pose = makePose();
    this.pose.footLX = 0.12;
    this.pose.footRX = -0.12;
    this.joze.setExpression('happy');
    this.hands = 0; // From down on the rim to up in the air.
    this.fingers = 0;
    this.leanX = 0;
    this.leanZ = 0;
    this.leanSpeedX = 0;
    this.leanSpeedZ = 0;
    this.lastVX = 0;
    this.lastVZ = 0;
    this.lookYaw = 0;
    this.recoil = 0;
    this.time = 0;
    this.rattle = 0;

    this.shadow = softShadow(shadow, 9.4, 11);
    scene.add(this.shadow);
    scene.add(this.root);
  }

  /** The gun kicks back, and the neck goes with it. */
  fired() {
    this.recoil = 1;
    this.leanSpeedZ += this.reducedMotion ? 0.3 : 0.9;
  }

  hit() {
    this.joze.setExpression('hurt', 0.9);
    this.rattle = 1;
    this.leanSpeedX += (Math.random() < 0.5 ? -1 : 1) * (this.reducedMotion ? 0.5 : 2.2);
  }

  /** He cheers, for as long as it says. */
  cheer(seconds = 2) {
    this.joze.setExpression('happy', seconds);
    this.cheerLeft = seconds;
  }

  muzzle(out) {
    this.gun.updateWorldMatrix(true, false);
    return this.gun.localToWorld(out.set(0, 0, -4));
  }

  /** dt, and what the rules say. handOpen is his hands copying the child's. lookAt is where to look. */
  update(dt, { tank, hand, lookAt, speedShare, celebrating = false }) {
    this.time += dt;
    const { x, z, heading, speed, turnRate } = tank;
    this.place(tank, dt);
    this.turret.rotation.y = -(tank.turret - heading);

    // The treads go with the speed, and in opposite ways for turning on the spot.
    const forward = speed * dt;
    const spin = turnRate * 2.1 * dt;
    this.treads.roll(forward + spin, forward - spin);

    // The gun comes back from each shot.
    this.recoil = Math.max(0, this.recoil - dt * 4.5);
    this.gun.position.z = -1.5 + this.recoil * this.recoil * 0.7;

    // His neck is on a spring, so it sways as the tank starts, stops and turns.
    const vx = Math.sin(heading) * speed;
    const vz = -Math.cos(heading) * speed;
    const ax = dt > 0 ? clamp((vx - this.lastVX) / dt, -30, 30) : 0;
    const az = dt > 0 ? clamp((vz - this.lastVZ) / dt, -30, 30) : 0;
    this.lastVX = vx;
    this.lastVZ = vz;
    const stiff = 34;
    const loose = 4.2;
    const push = this.reducedMotion ? 0.012 : 0.06;
    this.leanSpeedX += (-stiff * this.leanX - loose * this.leanSpeedX - ax * push * stiff * 0.1) * dt;
    this.leanSpeedZ += (-stiff * this.leanZ - loose * this.leanSpeedZ - az * push * stiff * 0.1) * dt;
    this.leanX = clamp(this.leanX + this.leanSpeedX * dt, -0.34, 0.34);
    this.leanZ = clamp(this.leanZ + this.leanSpeedZ * dt, -0.34, 0.34);

    // He faces the child, mostly, with a look towards where the action is.
    const idly = this.reducedMotion ? 0 : Math.sin(this.time * 0.6) * 0.25;
    const wantLook = lookAt ? clamp((lookAt.x - x) / 26, -1, 1) * 0.75 : idly;
    this.lookYaw = damp(this.lookYaw, wantLook, 5, dt);
    this.joze.root.rotation.y = tank.turret + this.lookYaw * 0.45;

    // His arms go up when the child's hand is open, and rest on the rim when it's closed.
    this.cheerLeft = Math.max(0, (this.cheerLeft ?? 0) - dt);
    const cheering = celebrating || this.cheerLeft > 0;
    const wantHands = cheering ? 1.2 : hand === 'open' ? 1 : 0;
    this.hands = damp(this.hands, wantHands, 8, dt);
    this.fingers = damp(this.fingers, hand === 'closed' ? 0 : 1, 12, dt);
    const { pose } = this;
    const up = this.hands;
    const wave = cheering && !this.reducedMotion ? Math.sin(this.time * 9) * 0.14 : 0;
    Object.assign(pose, {
      pitch: this.leanZ,
      roll: -this.leanX,
      headTurn: this.lookYaw * 0.55,
      headPitch: Math.sin(this.time * 1.7) * (this.reducedMotion ? 0 : 0.03) + this.leanZ * 0.6,
      handLX: 0.68 + up * 0.12 + wave,
      handLY: -0.22 + up * 0.86,
      handLZ: 0.36 - up * 0.26,
      handRX: -0.68 - up * 0.12 + wave,
      handRY: -0.22 + up * 0.86,
      handRZ: 0.36 - up * 0.26,
      openL: this.fingers,
      openR: this.fingers,
      wristL: -0.3,
      wristR: -0.3,
    });
    this.joze.setPose(pose);
    this.joze.update(dt);

    // Being hit gives the whole tank a shake, which dies away.
    this.rattle = Math.max(0, this.rattle - dt * 1.6);
    const shake = this.reducedMotion ? 0 : this.rattle * this.rattle * 0.1;
    this.root.position.x += Math.sin(this.time * 46) * shake;
    this.root.rotation.z += Math.sin(this.time * 38) * shake * 0.28;
    // A little trembling from the engine, and the pennant blowing about.
    if (!this.reducedMotion) this.root.position.y += Math.sin(this.time * 52) * 0.012 * (0.5 + speedShare);
    this.flag.rotation.y = Math.PI * 0.5 * clamp(speedShare, 0, 1) * -1 + Math.sin(this.time * 7) * (this.reducedMotion ? 0 : 0.22);
    this.kick = damp(this.kick, Math.hypot(ax, az) > 2 ? -Math.sign(ax * vx + az * vz) : 0, 6, dt);
  }
}

/* ------------------------------- robot tanks ------------------------------- */

// What each kind looks like. Bright, plain colours that are nothing like the grass, the water or the child's tank.
const LOOKS = {
  scout: { main: '#ff8a2b', dark: '#d9631a', light: '#ffc04d', length: 6.2, wide: 4.8, eyes: 1 },
  basher: { main: '#ff4f7b', dark: '#d42f5a', light: '#ffa1b8', length: 7.2, wide: 5.4, eyes: 2 },
  heavy: { main: '#9a5cff', dark: '#6f3bd0', light: '#c9a6ff', length: 9.2, wide: 6.8, eyes: 2 },
};

function hullParts(kind) {
  const { main, dark, light } = LOOKS[kind];
  const { length, wide } = LOOKS[kind];
  const treadAt = wide / 2 - 0.62;
  const parts = [
    { geometry: roundedBox(1.05, 1.1, length - 0.7, 0.45), colour: '#3a3448', at: [-treadAt, 0.7, 0] },
    { geometry: roundedBox(1.05, 1.1, length - 0.7, 0.45), colour: '#3a3448', at: [treadAt, 0.7, 0] },
    { geometry: roundedBox(wide - 2.2, 1, length - 0.6, 0.28), colour: dark, at: [0, 1.05, 0] },
    { geometry: roundedBox(wide + 0.1, 0.3, length + 0.2, 0.14), colour: light, at: [0, 1.6, 0] },
    { geometry: roundedBox(wide - 1, 0.62, length - 1.3, 0.24), colour: main, at: [0, 1.94, 0.1] },
  ];
  const wheelsPerSide = kind === 'heavy' ? 6 : kind === 'basher' ? 5 : 4;
  for (const side of [-1, 1]) {
    for (let i = 0; i < wheelsPerSide; i += 1) {
      const z = (i - (wheelsPerSide - 1) / 2) * ((length - 2) / Math.max(1, wheelsPerSide - 1));
      parts.push({ geometry: cylinder(0.46, 0.46, 0.2, 12).rotateZ(Math.PI / 2), colour: '#4b4560', at: [side * (treadAt + 0.56), 0.72, z] });
      parts.push({ geometry: cylinder(0.2, 0.2, 0.26, 8).rotateZ(Math.PI / 2), colour: light, at: [side * (treadAt + 0.6), 0.72, z] });
    }
  }
  if (kind === 'scout') {
    parts.push({ geometry: roundedBox(1.6, 0.4, 0.4, 0.12), colour: light, at: [0, 1.5, -length / 2 - 0.1] });
  } else if (kind === 'basher') {
    // A big friendly bumper with teeth painted on it.
    parts.push({ geometry: roundedBox(wide - 1.4, 0.8, 0.5, 0.15), colour: light, at: [0, 1.2, -length / 2 - 0.15] });
    for (let i = 0; i < 5; i += 1) parts.push({ geometry: roundedBox(0.34, 0.46, 0.14, 0.04), colour: '#ffffff', at: [-1.1 + i * 0.55, 1.2, -length / 2 - 0.4] });
  } else {
    parts.push({ geometry: roundedBox(1.2, 0.8, length - 3, 0.2), colour: light, at: [-wide / 2 + 1.05, 2.5, 0.2] });
    parts.push({ geometry: roundedBox(1.2, 0.8, length - 3, 0.2), colour: light, at: [wide / 2 - 1.05, 2.5, 0.2] });
    parts.push({ geometry: roundedBox(wide - 1.6, 0.7, 0.6, 0.15), colour: dark, at: [0, 1.25, -length / 2 - 0.1] });
  }
  return parts;
}

function turretParts(kind) {
  const { main, dark, light } = LOOKS[kind];
  if (kind === 'scout') {
    return [
      { geometry: cylinder(1.7, 1.9, 0.3, 20), colour: dark, at: [0, 0, 0] },
      { geometry: ball(1.65, 1.2, 1.65), colour: main, at: [0, 0.42, 0] },
      { geometry: cylinder(0.05, 0.07, 1.5, 6), colour: '#3a3448', at: [0, 2.1, 0.9] },
      { geometry: ball(0.22), colour: light, at: [0, 2.9, 0.9] },
    ];
  }
  if (kind === 'basher') {
    return [
      { geometry: cylinder(2, 2.2, 0.3, 20), colour: dark, at: [0, 0, 0] },
      { geometry: roundedBox(3.2, 1.7, 3, 0.5), colour: main, at: [0, 0.9, 0] },
      { geometry: roundedBox(3.3, 0.22, 3.1, 0.08), colour: light, at: [0, 0.34, 0] },
      { geometry: cylinder(0.06, 0.08, 1.2, 6), colour: '#3a3448', at: [0.9, 2.2, 0.8] },
      { geometry: ball(0.2), colour: '#ffe14d', at: [0.9, 2.85, 0.8] },
    ];
  }
  return [
    { geometry: cylinder(2.7, 2.95, 0.34, 22), colour: dark, at: [0, 0, 0] },
    { geometry: roundedBox(4.5, 2, 4.1, 0.6), colour: main, at: [0, 1.05, 0] },
    { geometry: roundedBox(4.6, 0.26, 4.2, 0.1), colour: light, at: [0, 0.4, 0] },
    { geometry: cylinder(0.5, 0.7, 0.5, 8), colour: '#ffe14d', at: [0, 2.26, 1.2] },
    { geometry: cylinder(0.16, 0.16, 0.54, 8), colour: dark, at: [0, 2.28, 1.2] },
  ];
}

function gunParts(kind) {
  const { dark, light } = LOOKS[kind];
  if (kind === 'scout') return [{ geometry: barrel(0.28, 0.34, 2.2), colour: '#3a3448', at: [0, 0, -1.1] }, { geometry: barrel(0.42, 0.42, 0.4), colour: light, at: [0, 0, -2.2] }];
  if (kind === 'basher') return [{ geometry: barrel(0.34, 0.42, 2.8), colour: '#3a3448', at: [0, 0, -1.4] }, { geometry: barrel(0.52, 0.52, 0.5), colour: light, at: [0, 0, -2.8] }];
  return [
    { geometry: barrel(0.3, 0.38, 3.2), colour: '#3a3448', at: [-0.72, 0, -1.6] },
    { geometry: barrel(0.3, 0.38, 3.2), colour: '#3a3448', at: [0.72, 0, -1.6] },
    { geometry: barrel(0.44, 0.44, 0.44), colour: light, at: [-0.72, 0, -3.2] },
    { geometry: barrel(0.44, 0.44, 0.44), colour: light, at: [0.72, 0, -3.2] },
    { geometry: roundedBox(2.2, 0.5, 0.6, 0.12), colour: dark, at: [0, 0, 0] },
  ];
}

const whiteEye = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const darkEye = new THREE.MeshBasicMaterial({ color: '#1c1630' });

/**
 * A robot tank's eyes, on top of its turret. Wherever the turret's pointing they face the camera, so they
 * can always be seen, and the pupils look across at the child's tank.
 */
function addEyes(turret, kind, materials) {
  const count = LOOKS[kind].eyes;
  const size = { scout: 0.98, basher: 0.74, heavy: 0.86 }[kind];
  const y = { scout: 1.72, basher: 1.98, heavy: 2.3 }[kind];
  const apart = { scout: 0, basher: 0.84, heavy: 1.04 }[kind];
  const rig = new THREE.Group();
  rig.position.set(0, y, 0);
  rig.userData.size = size;
  rig.userData.eyes = [];
  rig.userData.pupils = [];
  const line = outlineMaterial(INK, 0.05);
  materials.push(line);
  for (let i = 0; i < count; i += 1) {
    const eye = new THREE.Group();
    eye.position.set(count === 1 ? 0 : (i ? 1 : -1) * apart, 0, 0);
    // Tipped back, as the camera is looking down from above.
    eye.rotation.x = 0.72;
    const shape = ball(size, size * 1.1, size * 0.45);
    const white = new THREE.Mesh(shape, whiteEye);
    const edge = new THREE.Mesh(shape, line);
    const pupil = new THREE.Group();
    pupil.position.set(0, -size * 0.05, -size * 0.3);
    const dark = new THREE.Mesh(ball(size * 0.52, size * 0.58, size * 0.26), darkEye);
    const glint = new THREE.Mesh(ball(size * 0.14), whiteEye);
    glint.position.set(size * 0.16, size * 0.22, -size * 0.2);
    pupil.add(dark, glint);
    eye.add(white, edge, pupil);
    rig.add(eye);
    rig.userData.eyes.push(eye);
    rig.userData.pupils.push(pupil);
  }
  turret.add(rig);
  return rig;
}

/** The little robot who drives each one. It climbs out and waves when its tank stops. */
function buildCrew(kind, materials) {
  const { main, light } = LOOKS[kind];
  const group = new THREE.Group();
  inked(group, [
    { geometry: roundedBox(0.95, 1, 0.72, 0.22), colour: light, at: [0, 0.98, 0] },
    { geometry: roundedBox(0.5, 0.36, 0.1, 0.04), colour: main, at: [0, 1, 0.38] },
    { geometry: ball(0.62, 0.54, 0.56), colour: '#e9eef5', at: [0, 1.92, 0] },
    { geometry: cylinder(0.04, 0.05, 0.42, 6), colour: '#3a3448', at: [0, 2.6, 0] },
    { geometry: ball(0.13), colour: main, at: [0, 2.86, 0] },
    { geometry: roundedBox(0.3, 0.52, 0.34, 0.1), colour: '#5d6880', at: [-0.27, 0.27, 0] },
    { geometry: roundedBox(0.3, 0.52, 0.34, 0.1), colour: '#5d6880', at: [0.27, 0.27, 0] },
    { geometry: roundedBox(0.2, 0.74, 0.2, 0.08), colour: '#5d6880', at: [-0.66, 1.02, 0], turn: [0, 0, -0.18] },
    { geometry: ball(0.12), colour: '#1c1630', at: [-0.22, 1.98, 0.5] },
    { geometry: ball(0.12), colour: '#1c1630', at: [0.22, 1.98, 0.5] },
    { geometry: new THREE.TorusGeometry(0.15, 0.03, 6, 10, Math.PI).rotateZ(Math.PI), colour: '#1c1630', at: [0, 1.78, 0.52] },
  ], { width: 0.035, materials });
  const arm = new THREE.Group();
  arm.position.set(0.56, 1.34, 0);
  group.add(arm);
  inked(arm, [
    { geometry: roundedBox(0.2, 0.8, 0.2, 0.08), colour: '#5d6880', at: [0, 0.38, 0] },
    { geometry: ball(0.17), colour: light, at: [0, 0.84, 0] },
  ], { width: 0.03, materials });
  group.userData.arm = arm;
  group.scale.setScalar(1.25);
  return group;
}

export class RobotTank extends TankBody {
  constructor(enemy, scene, shadow, reducedMotion) {
    const look = LOOKS[enemy.kind];
    super(look.length, look.wide);
    this.enemy = enemy;
    this.reducedMotion = reducedMotion;
    this.materials = [];
    this.time = Math.random() * 10;
    this.blinkIn = 1 + Math.random() * 3;
    this.grown = 0;
    this.faded = 1;

    this.treads = new Treads(this.root, { length: look.length, high: 1.35, wide: 1, apart: look.wide / 2 - 0.62, colour: '#2a2536' });
    this.treads.mesh.material.transparent = true;
    this.materials.push(this.treads.mesh.material);
    this.hull = inked(this.root, hullParts(enemy.kind), { materials: this.materials });
    this.turret = new THREE.Group();
    this.turret.position.set(0, 2.25, 0.15);
    this.root.add(this.turret);
    inked(this.turret, turretParts(enemy.kind), { materials: this.materials });
    this.gun = new THREE.Group();
    // Low down on the turret, so as not to hide the eyes, and pointing up, for lobbing.
    this.gun.position.set(0, { scout: 0.15, basher: 0.3, heavy: 0.42 }[enemy.kind], enemy.kind === 'heavy' ? -2.05 : -1.5);
    this.gun.rotation.x = 0.24;
    this.turret.add(this.gun);
    inked(this.gun, gunParts(enemy.kind), { materials: this.materials });
    this.eyeRig = addEyes(this.turret, enemy.kind, this.materials);
    this.eyes = this.eyeRig.userData.eyes;

    this.crew = buildCrew(enemy.kind, this.materials);
    this.crew.visible = false;
    scene.add(this.crew);
    this.crewStand = null;

    this.shadow = softShadow(shadow, look.wide * 1.7, look.length * 1.4);
    scene.add(this.shadow);
    this.scene = scene;
    scene.add(this.root);
    this.recoil = 0;
    this.wobble = 0;
    this.droop = 0;
  }

  /** A lob: the gun kicks and points back up. */
  lobbed() {
    this.recoil = 1;
  }

  hit() {
    this.wobble = 1;
  }

  /** Where the crew stands, beside the tank on the side towards the camera. */
  findCrewStand() {
    const { enemy } = this;
    const side = this.wide / 2 + 1.1;
    const x = enemy.x + (enemy.x > 0 ? -side * 0.5 : side * 0.5);
    const z = enemy.z + this.length * 0.4 + 0.6;
    return { x, z, y: groundY(x, z) };
  }

  update(dt, { resting, childAt }) {
    const { enemy, reducedMotion } = this;
    this.time += dt;
    this.grown = Math.min(1, this.grown + dt * 2.6);
    this.root.scale.setScalar(0.6 + 0.4 * easeOut(this.grown));
    this.place(enemy, dt);
    this.turret.rotation.y = -(enemy.turret - enemy.heading);
    const step = enemy.speed * dt;
    const spin = enemy.turnRate * this.wide * 0.4 * dt;
    this.treads.roll(step + spin, step - spin);

    this.recoil = Math.max(0, this.recoil - dt * 3);
    this.gun.rotation.x = 0.24 + this.recoil * 0.3;
    this.wobble = Math.max(0, this.wobble - dt * 3.6);

    // Stopped or resting, the turret droops and the eyes go sleepy.
    const stopped = enemy.state !== 'rolling';
    const wantDroop = stopped ? 1 : resting ? 0.6 : 0;
    this.droop = damp(this.droop, wantDroop, 4, dt);
    this.gun.rotation.x -= this.droop * 0.42;

    this.blinkIn -= dt;
    let open = 1;
    if (this.blinkIn < 0) {
      open = 0.1;
      if (this.blinkIn < -0.13) this.blinkIn = 1.5 + Math.random() * 3.5;
    }
    open = Math.min(open, 1 - this.droop * 0.72);
    for (const eye of this.eyes) eye.scale.y = damp(eye.scale.y, open, 24, dt);
    // Facing the camera whichever way the turret's pointing, and looking at the child's tank.
    this.eyeRig.rotation.y = Math.PI + enemy.turret;
    const size = this.eyeRig.userData.size;
    const lookX = clamp((childAt.x - enemy.x) / 26, -1, 1) * size * 0.26;
    const lookY = clamp((childAt.z - enemy.z) / 26, -1, 1) * size * 0.28;
    for (const pupil of this.eyeRig.userData.pupils) {
      pupil.position.x = damp(pupil.position.x, -lookX, 6, dt);
      pupil.position.y = damp(pupil.position.y, -size * 0.05 - lookY, 6, dt);
    }

    // Being hit gives it a shake, and stopping makes it rattle.
    const rattling = enemy.state === 'rattling' ? clamp(enemy.stateLeft / 1.3, 0, 1) : 0;
    const shake = reducedMotion ? 0 : this.wobble * this.wobble * 0.12 + rattling * 0.13;
    this.root.position.x += Math.sin(this.time * 41) * shake;
    this.root.rotation.z += Math.sin(this.time * 33) * shake * 0.3;
    this.turret.rotation.z = Math.sin(this.time * 27) * shake * 0.4;
    if (!reducedMotion && !stopped) this.root.position.y += Math.sin(this.time * 44) * 0.01;

    this.showCrew(dt);
    this.showFade();
  }

  /** Up out of the hatch, down onto the ground, and a big wave. */
  showCrew(dt) {
    const { enemy, crew, reducedMotion } = this;
    if (enemy.state !== 'waving' && enemy.state !== 'fading') return;
    if (!this.crewStand) {
      this.crewStand = this.findCrewStand();
      this.crewFrom = { x: enemy.x, y: enemy.y + 2.8, z: enemy.z };
      this.crewAge = 0;
      crew.visible = true;
    }
    this.crewAge += dt;
    const climb = clamp(this.crewAge / 0.5, 0, 1);
    const hop = clamp((this.crewAge - 0.65) / 0.55, 0, 1);
    const { crewFrom: from, crewStand: to } = this;
    const up = easeOut(climb) * 1.4;
    crew.position.set(
      from.x + (to.x - from.x) * hop,
      from.y - 1.2 + up + (to.y - from.y + 1.2 - 1.4) * hop + Math.sin(hop * Math.PI) * 2.2,
      from.z + (to.z - from.z) * hop,
    );
    // It faces the camera.
    crew.rotation.y = 0;
    const { arm } = crew.userData;
    const waving = reducedMotion ? 0.3 : Math.sin(this.time * 9) * 0.55;
    arm.rotation.z = -0.5 + waving;
    if (hop >= 1 && !reducedMotion) crew.position.y += Math.abs(Math.sin(this.time * 4.5)) * 0.32;
  }

  showFade() {
    const { enemy } = this;
    const faded = enemy.state === 'fading' ? clamp(enemy.stateLeft / 1.3, 0, 1) : 1;
    if (faded === this.faded) return;
    this.faded = faded;
    for (const material of this.materials) {
      material.transparent = true;
      material.opacity = faded;
    }
    for (const eye of this.eyes) eye.visible = faded > 0.4;
    this.shadow.material.opacity = 0.5 * faded;
  }

  dispose() {
    this.root.removeFromParent();
    this.shadow.removeFromParent();
    this.crew.removeFromParent();
    const seen = new Set();
    for (const part of [this.root, this.shadow, this.crew]) {
      part.traverse((node) => {
        if (node.geometry && !seen.has(node.geometry)) {
          seen.add(node.geometry);
          node.geometry.dispose();
        }
      });
    }
    this.treads.mesh.dispose();
    for (const material of this.materials) material.dispose();
    this.shadow.material.dispose();
  }
}
