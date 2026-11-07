// What else is out on the water, so that there's plenty going on, and something to go past: dolphins
// leaping, buoys and barrels bobbing, and the gold that beaten pirates leave behind them. None of it can
// do any harm.
import * as THREE from '../../vendor/three/three.module.js';
import { mergeParts, toon } from '../../core/body/characters.js';

const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const pole = (top, bottom, height, sides = 8) => new THREE.CylinderGeometry(top, bottom, height, sides);
const ball = (x = 1, y = x, z = x) => new THREE.SphereGeometry(1, 12, 9).scale(x, y, z);

const paint = () => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() });

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function instanced(scene, geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

const BUOYS = 30;
const BARRELS = 14;
const SAME_PLACE_ROOM = 44; // How much open water there has to be around one.
const FAR_AWAY = 800; // Not worth moving, this far from the camera.
const PUSHED_ASIDE_WITHIN = 24;

const BUOY = () => mergeParts([
  { geometry: pole(1.1, 1.75, 1.8, 10), colour: '#f4efe2', at: [0, 0.9, 0] },
  { geometry: pole(0.55, 1.1, 1.8, 10), colour: '#e8433f', at: [0, 2.7, 0] },
  { geometry: pole(0.3, 0.55, 1.5, 8), colour: '#f4efe2', at: [0, 4.3, 0] },
  { geometry: ball(0.55), colour: '#ffd23f', at: [0, 5.4, 0] },
  { geometry: pole(1.9, 1.9, 0.8, 12), colour: '#b63a33', at: [0, 0.2, 0] },
]);

const BARREL = () => mergeParts([
  { geometry: ball(1.65, 1.65, 2.5), colour: '#a8783f' },
  { geometry: pole(1.72, 1.72, 0.3, 12), colour: '#3f3a36', at: [0, 0, 1.15], turn: [Math.PI / 2, 0, 0] },
  { geometry: pole(1.72, 1.72, 0.3, 12), colour: '#3f3a36', at: [0, 0, -1.15], turn: [Math.PI / 2, 0, 0] },
  { geometry: pole(1.2, 1.2, 0.2, 12), colour: '#c99458', at: [0, 0, 2.28], turn: [Math.PI / 2, 0, 0] },
]);

/** Things bobbing about all round the island, which get nudged out of the way of a ship. */
export class Floats {
  constructor(scene, chart, waterHeight) {
    this.waterHeight = waterHeight;
    const random = seededRandom(90210);
    const spots = (count) => {
      const found = [];
      for (let tries = 0; found.length < count && tries < 4000; tries += 1) {
        const angle = random() * Math.PI * 2;
        const far = 520 + random() * 500;
        const x = Math.cos(angle) * far;
        const z = Math.sin(angle) * far;
        if (chart.room(x, z) < SAME_PLACE_ROOM) continue;
        found.push({ x, z, phase: random() * 6, turn: random() * 6.3, size: 0.9 + random() * 0.5 });
      }
      return found;
    };
    this.buoys = spots(BUOYS);
    this.barrels = spots(BARRELS);
    const material = paint();
    this.buoyMesh = instanced(scene, BUOY(), material, this.buoys.length);
    this.barrelMesh = instanced(scene, BARREL(), material, this.barrels.length);
    this.matrix = new THREE.Matrix4();
    this.at = new THREE.Vector3();
    this.turn = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.size = new THREE.Vector3();
    this.placeAll(0, 1, [], { x: 0, z: 0 });
  }

  place(mesh, items, lift, tilt, time, calm, ships, camera) {
    const { matrix, at, turn, euler, size } = this;
    items.forEach((item, index) => {
      const away = Math.hypot(item.x - camera.x, item.z - camera.z);
      if (away > FAR_AWAY && this.placed) return;
      for (const ship of ships) {
        const dx = item.x - ship.x;
        const dz = item.z - ship.z;
        const gap = Math.hypot(dx, dz) || 1;
        if (gap < PUSHED_ASIDE_WITHIN) {
          item.x += (dx / gap) * (PUSHED_ASIDE_WITHIN - gap);
          item.z += (dz / gap) * (PUSHED_ASIDE_WITHIN - gap);
        }
      }
      at.set(item.x, this.waterHeight(item.x, item.z) + lift, item.z);
      euler.set(Math.sin(time * 1.1 + item.phase) * tilt * calm, item.turn, Math.cos(time * 0.9 + item.phase) * tilt * calm, 'YXZ');
      turn.setFromEuler(euler);
      size.setScalar(item.size);
      mesh.setMatrixAt(index, matrix.compose(at, turn, size));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  placeAll(time, calm, ships, camera) {
    this.place(this.buoyMesh, this.buoys, -0.5, 0.16, time, calm, ships, camera);
    this.place(this.barrelMesh, this.barrels, 0.1, 0.09, time, calm, ships, camera);
    this.placed = true;
  }

  /** A slow computer doesn't need all of them. */
  showFewer() {
    this.buoyMesh.count = Math.floor(this.buoyMesh.count / 2);
    this.barrelMesh.count = Math.floor(this.barrelMesh.count / 2);
  }
}

const DOLPHIN = () => mergeParts([
  { geometry: ball(1.25, 1.2, 4), colour: '#6f8fae' },
  { geometry: ball(1, 0.8, 3.4), colour: '#dfe9f2', at: [0, -0.5, -0.2] },
  { geometry: ball(0.42, 0.34, 1), colour: '#6f8fae', at: [0, -0.25, 4.1] },
  { geometry: new THREE.ConeGeometry(0.9, 2, 4), colour: '#55718c', at: [0, 1.5, -0.6], turn: [-0.5, 0, 0], size: [0.3, 1, 1] },
  { geometry: ball(1.5, 0.14, 0.55), colour: '#55718c', at: [0, -0.3, -3.9] },
  { geometry: ball(1, 0.14, 0.5), colour: '#55718c', at: [1.2, -0.7, 0.9], turn: [0, 0.5, -0.4] },
  { geometry: ball(1, 0.14, 0.5), colour: '#55718c', at: [-1.2, -0.7, 0.9], turn: [0, -0.5, 0.4] },
  { geometry: ball(0.18), colour: '#1c1630', at: [0.92, 0.28, 2.6] },
  { geometry: ball(0.18), colour: '#1c1630', at: [-0.92, 0.28, 2.6] },
]);

const LEAP_SECONDS = 1.7;
const LEAP_HIGH = 9;
const LEAP_LONG = 18;
const NEXT_LEAP = [1.5, 6];

/** A few dolphins, who leap out of the water somewhere in view every now and then. */
export class Dolphins {
  constructor(scene, chart, waterHeight, onSplash) {
    this.chart = chart;
    this.waterHeight = waterHeight;
    this.onSplash = onSplash;
    this.items = Array.from({ length: 3 }, (_, index) => ({ wait: 2 + index * 2.5, t: -1, x: 0, z: 0, way: 0 }));
    this.mesh = instanced(scene, DOLPHIN(), paint(), this.items.length);
    this.matrix = new THREE.Matrix4();
    this.at = new THREE.Vector3();
    this.turn = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.size = new THREE.Vector3();
    this.hidden = new THREE.Vector3(0, -80, 0);
    this.update(0, { x: 0, z: 0, yaw: 0, calm: 1 });
  }

  /** Somewhere on the water that's in view, and not too near the ship. */
  startLeap(item, x, z, yaw) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const direction = yaw + side * (0.2 + Math.random() * 0.55);
    const far = 150 + Math.random() * 170;
    item.x = x + Math.sin(direction) * far;
    item.z = z - Math.cos(direction) * far;
    if (this.chart.room(item.x, item.z) < 30) {
      item.wait = 1;
      return;
    }
    item.way = yaw + side * (1.2 + Math.random());
    item.t = 0;
    this.onSplash(item.x, item.z, 0.6);
  }

  update(dt, { x, z, yaw, calm }) {
    const { matrix, at, turn, euler, size, hidden } = this;
    this.items.forEach((item, index) => {
      if (item.t < 0) {
        item.wait -= dt;
        if (item.wait <= 0) this.startLeap(item, x, z, yaw);
      }
      if (item.t < 0) {
        turn.identity();
        size.setScalar(0.001);
        this.mesh.setMatrixAt(index, matrix.compose(hidden, turn, size));
        return;
      }
      item.t += dt / (LEAP_SECONDS / Math.max(0.6, calm));
      if (item.t >= 1) {
        const out = LEAP_LONG * calm;
        this.onSplash(item.x + Math.sin(item.way) * out, item.z - Math.cos(item.way) * out, 0.6);
        item.t = -1;
        item.wait = NEXT_LEAP[0] + Math.random() * (NEXT_LEAP[1] - NEXT_LEAP[0]);
        return;
      }
      const along = item.t * LEAP_LONG * calm;
      const high = LEAP_HIGH * calm;
      const px = item.x + Math.sin(item.way) * along;
      const pz = item.z - Math.cos(item.way) * along;
      at.set(px, this.waterHeight(px, pz) - 2.5 + 4 * high * item.t * (1 - item.t), pz);
      // Its nose goes up and over, following the arc.
      const slope = Math.atan2(4 * high * (1 - 2 * item.t), LEAP_LONG * calm);
      euler.set(-slope, Math.PI - item.way, 0, 'YXZ');
      turn.setFromEuler(euler);
      size.setScalar(1.15);
      this.mesh.setMatrixAt(index, matrix.compose(at, turn, size));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const MOST_COINS = 60;

const COIN = () => mergeParts([
  { geometry: pole(2.5, 2.5, 0.5, 18), colour: '#f0ad00', turn: [Math.PI / 2, 0, 0] },
  { geometry: pole(1.95, 1.95, 0.6, 18), colour: '#ffd23f', turn: [Math.PI / 2, 0, 0] },
  { geometry: box(0.5, 2.2, 0.68), colour: '#f0ad00' },
  { geometry: box(2.2, 0.5, 0.68), colour: '#f0ad00' },
]);

/** The gold that a beaten pirate leaves floating behind it, spinning in the air just above the water. */
export class Coins {
  constructor(scene, waterHeight) {
    this.waterHeight = waterHeight;
    this.mesh = instanced(scene, COIN(), new THREE.MeshBasicMaterial({ vertexColors: true }), MOST_COINS);
    this.mesh.count = 0;
    this.matrix = new THREE.Matrix4();
    this.at = new THREE.Vector3();
    this.turn = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.size = new THREE.Vector3();
  }

  update(coins, time, calm) {
    const { matrix, at, turn, up, size } = this;
    const count = Math.min(coins.length, MOST_COINS);
    for (let i = 0; i < count; i += 1) {
      const coin = coins[i];
      at.set(coin.x, this.waterHeight(coin.x, coin.z) + 4.4 + Math.sin(time * 2 + coin.phase) * 0.6 * calm, coin.z);
      turn.setFromAxisAngle(up, time * 2.2 * Math.max(0.5, calm) + coin.phase);
      // It shrinks away at the very end of its time.
      size.setScalar(Math.min(1, coin.left / 1.2));
      this.mesh.setMatrixAt(i, matrix.compose(at, turn, size));
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
