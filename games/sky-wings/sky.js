// The picture of a dogfight: the island below, the child's plane, the sky pirates, and the shots
// between them. The camera sits behind the plane and looks the way it points, so climbing, diving and
// banking all move the whole world, and the middle of the picture is where the guns are aimed.
//
// Nothing flashes or strobes: seizures are more common in children with hemiplegia. A hit is a few
// small shapes where it happened, a plane that's dropped falls away in soft grey smoke, and the picture
// itself never changes brightness.
import * as THREE from '../../vendor/three/three.module.js';
import { ball, Fighter3D, makePose, mergeParts, outlineMaterial, roundedBox, toon } from '../../core/body/characters.js';
import { Sparks } from '../../core/body/sparks.js';
import { LEVELS } from './flight.js';
import { Island } from './island.js';
import { floorAt, heightAt } from './island-map.js';

const SLOW_FRAME_SECONDS = 1 / 40;
const SLOW_CHECK_FRAMES = 90;
const PILOT_SIZE = 0.8;
const ENEMY_SIZE = 1.8; // Bigger than life, so that they can be seen from further away.
const CAPTAIN_SIZE = 1.4; // The pirate captain's plane, on the higher levels, as a share of that.
const TRACERS = 70;
const TRACER_LENGTH = 10;
const FLY_FOV = 62;
const CAMERA_ROLL = 0.5; // How much of the plane's bank the camera shares, so the horizon tips.
const SMOKE_EVERY = { damaged: 0.2, falling: 0.07 };
const CHUTE_SECONDS = 7;
const CHUTE_FALL = 9;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
const between = (low, high) => low + Math.random() * (high - low);

// Where the plane waits while choosing a pilot and learning to fly, with the island behind it.
const SHOWCASE = { x: 30, y: 150, z: 700 };
// The camera, away from the plane, and where it looks, also from the plane.
const VIEWS = {
  choose: { at: [0, 2.6, 17], look: [0, 0.1, 0], fov: 30 },
  lesson: { at: [-7.2, 3.4, 22], look: [-7.2, 0.8, 0], fov: 34 },
  fly: { fov: FLY_FOV },
  win: { at: [9, 3.5, 13], look: [0, 0.5, 0], fov: 40 },
};

/** A toy plane with the character sitting in it, whose arms can copy the child's. */
class Plane {
  constructor(spec) {
    this.spec = spec;
    this.root = new THREE.Group();
    const { colours, burstColours } = spec;
    const main = colours.pants ?? colours.body;
    const wing = burstColours[0];
    const trim = burstColours[1] ?? wing;

    const body = mergeParts([
      { geometry: ball(0.74, 0.72, 2.3), colour: main },
      { geometry: ball(0.42, 0.42, 0.5), colour: '#f7f2e6', at: [0, 0, -2.15] },
      { geometry: roundedBox(7.4, 0.2, 1.55, 0.09), colour: wing, at: [0, -0.15, -0.3] },
      { geometry: roundedBox(0.7, 0.24, 1.6, 0.09), colour: trim, at: [3.4, -0.15, -0.3] },
      { geometry: roundedBox(0.7, 0.24, 1.6, 0.09), colour: trim, at: [-3.4, -0.15, -0.3] },
      { geometry: roundedBox(2.7, 0.15, 0.85, 0.06), colour: wing, at: [0, 0.12, 2.05] },
      { geometry: roundedBox(0.17, 1.15, 0.95, 0.07), colour: trim, at: [0, 0.72, 2.05] },
    ]);
    const paint = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() });
    const outline = outlineMaterial(colours.ink, 0.03);
    this.root.add(new THREE.Mesh(body, paint), new THREE.Mesh(body, outline));

    const bladeShape = roundedBox(2.5, 0.2, 0.06, 0.02);
    const blades = new THREE.MeshToonMaterial({ color: '#3a3a44', gradientMap: toon() });
    this.propeller = new THREE.Group();
    this.propeller.position.set(0, 0, -2.66);
    this.propeller.add(new THREE.Mesh(bladeShape, blades));
    const second = new THREE.Mesh(bladeShape, blades);
    second.rotation.z = Math.PI / 2;
    this.propeller.add(second);
    this.root.add(this.propeller);

    // The pirate captain's flag, on the tail, only shown on the captain's plane.
    this.flag = new THREE.Group();
    const flagPaint = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon(), side: THREE.DoubleSide });
    this.flag.add(new THREE.Mesh(mergeParts([
      { geometry: new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), colour: '#5a4632', at: [0, 0.75, 0] },
      { geometry: new THREE.BoxGeometry(0.04, 0.7, 1.05), colour: '#26283a', at: [0, 1.15, 0.55] },
      { geometry: ball(0.2, 0.2, 0.05).rotateY(Math.PI / 2), colour: '#ffd23f', at: [0.03, 1.15, 0.55] },
    ]), flagPaint));
    this.flag.position.set(0, 1.25, 2.1);
    this.flag.visible = false;
    this.root.add(this.flag);

    this.pilot = new Fighter3D(spec);
    this.pilot.faceTowards(Math.PI);
    this.pilot.root.scale.setScalar(PILOT_SIZE);
    this.pilot.root.position.set(0, -0.02, -0.25);
    this.pilot.setExpression('happy');
    this.root.add(this.pilot.root);
    this.pose = makePose();
    Object.assign(this.pose, { handLX: 0.72, handLY: -0.45, handLZ: 0.25, handRX: -0.72, handRY: -0.45, handRZ: 0.25 });
    this.pilot.setPose(this.pose);

    this.roll = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.wobble = 0;
    this.time = Math.random() * 6;
  }

  /** dt, how fast the propeller goes, and which way the plane points. arms is the child's pose. */
  update(dt, { spin = 1, heading = 0, pitch = 0, roll = 0, arms = null }) {
    this.time += dt;
    this.propeller.rotation.z += dt * 30 * spin;
    const wobble = this.wobble > 0 ? Math.sin(this.time * 11) * 0.5 * clamp(this.wobble, 0, 1) : 0;
    this.root.rotation.set(pitch, -heading, -roll + wobble, 'YXZ');
    if (arms) {
      for (const key of ['handLX', 'handLY', 'handLZ', 'handRX', 'handRY', 'handRZ', 'wristL', 'wristR', 'openL', 'openR']) {
        this.pose[key] = damp(this.pose[key], arms[key], 14, dt);
      }
    }
    this.pilot.setPose(this.pose);
    this.pilot.update(dt);
  }

  dispose() {
    this.root.traverse((node) => {
      node.geometry?.dispose();
      node.material?.dispose?.();
    });
  }
}

function buildParachute(colours) {
  const parts = [];
  const stripes = 10;
  for (let s = 0; s < stripes; s += 1) {
    const slice = new THREE.SphereGeometry(4.6, 8, 6, (s / stripes) * Math.PI * 2, (Math.PI * 2) / stripes, 0, Math.PI / 2);
    parts.push({ geometry: slice, colour: colours[s % colours.length], at: [0, 5.6, 0] });
  }
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const x = Math.cos(angle) * 2.3;
    const z = Math.sin(angle) * 2.3;
    const tilt = Math.atan2(2.3, 5);
    parts.push({ geometry: new THREE.BoxGeometry(0.06, 5.6, 0.06), colour: '#f4f1e8', at: [x, 2.9, z], turn: [Math.sin(angle) * tilt, 0, -Math.cos(angle) * tilt] });
  }
  return new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

export class Sky {
  constructor(canvas) {
    this.canvas = canvas;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#dff4ff', 700, 2300);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#9fbf9a', 1.9));
    const sun = new THREE.DirectionalLight('#fff3dc', 2.1);
    sun.position.set(-0.5, 1, 0.45);
    this.scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(VIEWS.choose.fov, 1, 1.5, 6000);
    this.cameraAt = new THREE.Vector3(...VIEWS.choose.at);
    this.cameraLook = new THREE.Vector3(...VIEWS.choose.look);
    this.view = 'choose';
    this.time = 0;
    this.frames = 0;
    this.slowFrames = 0;
    this.quality = 2;

    this.island = new Island(this.scene);
    this.sparks = new Sparks(this.scene);
    this.plane = null;
    this.enemyPlanes = [];
    this.flight = null;
    this.chutes = [];
    this.live = null;
    this.lessonBank = 0;
    this.smokeIn = new Map();

    this.tracers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.34, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }), TRACERS);
    this.tracers.frustumCulled = false;
    this.tracers.count = 0;
    this.scene.add(this.tracers);
    this.tracerAt = new THREE.Vector3();
    this.tracerTurn = new THREE.Quaternion();
    this.tracerSize = new THREE.Vector3(1, 1, TRACER_LENGTH);
    this.tracerMatrix = new THREE.Matrix4();
    this.tracerDirection = new THREE.Vector3();
    this.forwardAxis = new THREE.Vector3(0, 0, 1);
    this.mineColour = new THREE.Color('#ffe14d');
    this.theirColour = new THREE.Color('#ff8a3c');

    // A soft shadow on the ground, which shows how high the plane is.
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#12304d', transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.scene.add(this.shadow);

    this.projecting = new THREE.Vector3();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.onSizeChanged?.();
  }

  /** How wide the ring on the screen is, so that what's inside it is what the guns fire at. */
  aimDiameter(level = 'gentle') {
    const half = Math.tan(LEVELS[level].aim) / Math.tan((FLY_FOV * Math.PI) / 360);
    return half * this.height;
  }

  setView(name, { snap = false } = {}) {
    if (this.view === 'fly' && name !== 'fly' && this.plane) {
      // Off from where the camera is now, rather than jumping.
      this.cameraAt.copy(this.camera.position).sub(this.plane.root.position);
      this.cameraLook.set(0, 0, 0);
    }
    this.view = name;
    if (name === 'fly') {
      this.camera.fov = FLY_FOV;
      this.camera.updateProjectionMatrix();
    } else if (snap) {
      this.cameraAt.set(...VIEWS[name].at);
      this.cameraLook.set(...VIEWS[name].look);
      this.camera.fov = VIEWS[name].fov;
      this.camera.updateProjectionMatrix();
    }
  }

  setPilot(spec) {
    if (this.plane) {
      this.scene.remove(this.plane.root);
      this.plane.dispose();
    }
    this.plane = new Plane(spec);
    this.scene.add(this.plane.root);
  }

  /** What the child's arms are doing, for the pilot to copy, or null. */
  setLive(pose) {
    this.live = pose;
  }

  /** A dogfight with these characters as the sky pirates, or null for none. */
  setFlight(flight, enemySpecs = []) {
    for (const plane of this.enemyPlanes) {
      this.scene.remove(plane.root);
      plane.dispose();
    }
    for (const chute of this.chutes) this.scene.remove(chute.group);
    this.chutes = [];
    this.smokeIn.clear();
    this.flight = flight;
    this.enemyPlanes = enemySpecs.map((spec) => {
      const plane = new Plane(spec);
      plane.root.scale.setScalar(ENEMY_SIZE);
      plane.root.visible = false;
      plane.pilot.setExpression('ready');
      this.scene.add(plane.root);
      return plane;
    });
  }

  /** How the plane tips when there's no dogfight going on, in the lesson. */
  setBank(bank) {
    this.lessonBank = bank;
  }

  planeFor(enemy) {
    return this.enemyPlanes[enemy.index % this.enemyPlanes.length] ?? null;
  }

  /** Where something in the world is on the screen, in pixels, and whether it's behind the camera. */
  project(x, y, z) {
    const at = this.projecting.set(x, y, z);
    const { camera } = this;
    at.project(camera);
    const behind = at.z > 1;
    return { x: ((at.x + 1) / 2) * this.width, y: ((1 - at.y) / 2) * this.height, behind };
  }

  /* ---------- what happens in the sky ---------- */

  puffs(at, { count = 4, colours = ['#d8d3cc'], size = 3, speed = 5, life = 0.9, grow = 1.4, opacity = 0.75 }) {
    const total = Math.max(1, Math.round(count * (this.reducedMotion ? 0.5 : 1)));
    for (let i = 0; i < total; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const push = speed * between(0.4, 1.1);
      this.sparks.emit({
        shape: 'puff',
        colour: colours[i % colours.length],
        at,
        velocity: [Math.cos(angle) * push, between(-0.2, 0.7) * push, Math.sin(angle) * push],
        life: life * between(0.8, 1.2),
        size: size * between(0.8, 1.2),
        grow,
        spin: between(-2, 2),
        opacity,
        drag: 1.4,
      });
    }
  }

  hitEnemy(enemy) {
    const plane = this.planeFor(enemy);
    if (!plane) return;
    plane.pilot.setExpression('hurt', 0.4);
    const count = this.reducedMotion ? 2 : 4;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random();
      this.sparks.emit({
        shape: i % 2 ? 'star' : 'spark',
        colour: ['#ffd23f', '#ff8f3f'][i % 2],
        at: plane.root.position,
        velocity: [Math.cos(angle) * 14, Math.sin(angle) * 14, between(-8, 8)],
        life: 0.35,
        size: 2,
        spin: 4,
        drag: 1,
      });
    }
  }

  /** A plane that's been dropped falls away by itself, and its pilot comes down by parachute. */
  enemyDown(enemy) {
    const plane = this.planeFor(enemy);
    if (!plane) return;
    const { position } = plane.root;
    this.puffs(position, { count: 12, colours: ['#6b6560', '#8a837b', '#a59e95', '#ff9c4a'], size: 5, speed: 12, life: 1.3, grow: 1.6 });
    const { pilot } = plane;
    plane.root.remove(pilot.root);
    const colours = plane.spec.burstColours.length > 1 ? plane.spec.burstColours : [plane.spec.burstColours[0], '#ffffff'];
    const group = new THREE.Group();
    group.add(buildParachute(colours));
    pilot.root.position.set(0, -2.3, 0);
    pilot.root.scale.setScalar(1.4);
    pilot.setExpression('happy');
    group.add(pilot.root);
    group.scale.setScalar(1.6);
    group.position.set(position.x, position.y + 6, position.z);
    this.scene.add(group);
    this.chutes.push({ group, pilot, left: CHUTE_SECONDS, phase: Math.random() * 6 });
  }

  childHit() {
    if (!this.plane) return;
    const at = this.plane.root.position;
    this.puffs(at, { count: 3, colours: ['#bdb7ae', '#ffb25c'], size: 2, speed: 8, life: 0.5, grow: 1 });
    this.plane.pilot.setExpression('hurt', 0.5);
  }

  celebrate() {
    this.plane?.pilot.setExpression('happy');
    this.setView('win');
  }

  /* ---------- every frame ---------- */

  watchSpeed(dt) {
    this.frames += 1;
    if (dt > SLOW_FRAME_SECONDS) this.slowFrames += 1;
    if (this.frames < SLOW_CHECK_FRAMES) return;
    const slow = this.slowFrames > this.frames * 0.5;
    this.frames = 0;
    this.slowFrames = 0;
    if (!slow || this.quality === 0) return;
    this.quality -= 1;
    if (this.quality === 1) {
      this.renderer.setPixelRatio(1);
      this.resize();
    } else {
      this.island.showFewer();
    }
  }

  placeChild(dt) {
    const { flight, plane } = this;
    if (!plane) return;
    if (flight && this.view !== 'choose' && this.view !== 'lesson') {
      plane.root.position.set(flight.x, flight.y, flight.z);
      plane.wobble = flight.hurtLeft;
      plane.update(dt, {
        spin: 0.5 + (flight.speed / flight.pace.speed) * 0.5,
        heading: flight.heading,
        pitch: flight.pitch,
        roll: flight.roll,
        arms: this.live,
      });
      const ground = Math.max(0, heightAt(flight.x, flight.z));
      this.shadow.visible = true;
      this.shadow.position.set(flight.x, ground + 1.2, flight.z);
      this.shadow.scale.setScalar(clamp(9 - (flight.y - ground) * 0.02, 4, 9));
      return;
    }
    this.shadow.visible = false;
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 1.1) * 0.5;
    plane.root.position.set(SHOWCASE.x, SHOWCASE.y + bob, SHOWCASE.z);
    if (this.view === 'choose') plane.update(dt, { spin: 0.4, heading: -Math.PI - 0.7 });
    else plane.update(dt, { spin: 0.6, heading: this.lessonBank * 0.3, roll: this.lessonBank * 0.85, arms: this.live });
  }

  placeEnemies(dt) {
    const { flight } = this;
    if (!flight) return;
    const seen = new Set();
    for (const enemy of flight.enemies) {
      const plane = this.planeFor(enemy);
      if (!plane) continue;
      seen.add(plane);
      plane.root.visible = true;
      plane.root.position.set(enemy.x, enemy.y, enemy.z);
      plane.root.scale.setScalar(ENEMY_SIZE * (enemy.captain ? CAPTAIN_SIZE : 1));
      plane.flag.visible = Boolean(enemy.captain);
      plane.wobble = enemy.hitLeft * 2;
      plane.update(dt, { spin: 1, heading: enemy.heading, pitch: enemy.pitch, roll: enemy.roll });

      const falling = enemy.state === 'falling';
      const damaged = enemy.hitsLeft <= enemy.hitsTotal / 2;
      if (falling || damaged) {
        const wait = (this.smokeIn.get(enemy) ?? 0) - dt;
        this.smokeIn.set(enemy, wait);
        if (wait <= 0) {
          this.smokeIn.set(enemy, falling ? SMOKE_EVERY.falling : SMOKE_EVERY.damaged);
          this.puffs(plane.root.position, {
            count: 1,
            colours: falling ? ['#6b6560', '#7d766e'] : ['#b5b0a8'],
            size: falling ? 4.5 : 2.6,
            speed: 2,
            life: falling ? 1.6 : 0.9,
            grow: 1.6,
            opacity: 0.7,
          });
        }
      }
    }
    for (const plane of this.enemyPlanes) {
      if (!seen.has(plane)) plane.root.visible = false;
    }
  }

  moveChutes(dt) {
    for (const chute of this.chutes) {
      chute.left -= dt;
      chute.group.position.y -= CHUTE_FALL * dt;
      chute.group.position.y = Math.max(chute.group.position.y, floorAt(chute.group.position.x, chute.group.position.z) - 10);
      chute.group.rotation.z = this.reducedMotion ? 0 : Math.sin(this.time * 1.3 + chute.phase) * 0.12;
      chute.pilot.update(dt);
      if (chute.left <= 0) this.scene.remove(chute.group);
    }
    this.chutes = this.chutes.filter(({ left }) => left > 0);
  }

  drawTracers() {
    const { flight, tracers } = this;
    const shots = flight?.shots ?? [];
    const count = Math.min(shots.length, TRACERS);
    for (let i = 0; i < count; i += 1) {
      const shot = shots[i];
      this.tracerAt.set(shot.x, shot.y, shot.z);
      this.tracerDirection.set(shot.dx, shot.dy, shot.dz);
      this.tracerTurn.setFromUnitVectors(this.forwardAxis, this.tracerDirection);
      tracers.setMatrixAt(i, this.tracerMatrix.compose(this.tracerAt, this.tracerTurn, this.tracerSize));
      tracers.setColorAt(i, shot.mine ? this.mineColour : this.theirColour);
    }
    tracers.count = count;
    tracers.instanceMatrix.needsUpdate = true;
    if (tracers.instanceColor) tracers.instanceColor.needsUpdate = true;
  }

  update(dt) {
    this.time += dt;
    this.watchSpeed(dt);
    this.placeChild(dt);
    this.placeEnemies(dt);
    this.moveChutes(dt);
    this.drawTracers();
    this.sparks.update(dt);
    this.updateCamera(dt);
    this.island.update(dt, this.camera, this.reducedMotion);
  }

  updateCamera(dt) {
    const { flight, camera, plane } = this;
    if (this.view === 'fly' && flight) {
      const { eye, forward, up } = flight.view;
      const axis = this.tracerDirection.set(forward.x, forward.y, forward.z);
      camera.position.set(eye.x, eye.y, eye.z);
      camera.up.set(up.x, up.y, up.z);
      if (!this.reducedMotion) camera.up.applyAxisAngle(axis, flight.roll * CAMERA_ROLL);
      camera.lookAt(eye.x + forward.x * 100, eye.y + forward.y * 100, eye.z + forward.z * 100);
      camera.updateMatrixWorld();
      return;
    }
    const view = VIEWS[this.view === 'fly' ? 'lesson' : this.view];
    const rate = 2.4;
    this.cameraAt.x = damp(this.cameraAt.x, view.at[0], rate, dt);
    this.cameraAt.y = damp(this.cameraAt.y, view.at[1], rate, dt);
    this.cameraAt.z = damp(this.cameraAt.z, view.at[2], rate, dt);
    this.cameraLook.x = damp(this.cameraLook.x, view.look[0], rate, dt);
    this.cameraLook.y = damp(this.cameraLook.y, view.look[1], rate, dt);
    this.cameraLook.z = damp(this.cameraLook.z, view.look[2], rate, dt);
    const fov = damp(camera.fov, view.fov, rate, dt);
    if (Math.abs(fov - camera.fov) > 0.001) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    const at = plane?.root.position ?? new THREE.Vector3(SHOWCASE.x, SHOWCASE.y, SHOWCASE.z);
    camera.up.set(0, 1, 0);
    camera.position.set(at.x + this.cameraAt.x, at.y + this.cameraAt.y, at.z + this.cameraAt.z);
    camera.lookAt(at.x + this.cameraLook.x, at.y + this.cameraLook.y, at.z + this.cameraLook.z);
    camera.updateMatrixWorld();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
