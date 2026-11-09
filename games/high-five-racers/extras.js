// What the later levels add to the race: coins that spill out to be picked up, power-ups on the trails of
// stars, a tractor, a balloon that lowers a gem, a treasure chest and a giant high ten at the finish. Which
// of these a race has, and where, is in racePlan in rules.js. None of it is in the way: going past any of it
// costs nothing, and the tractor keeps to the shoulder, off the road.
//
// Nothing here flashes: colours stay steady, things fade or swing rather than blink, and coins along the
// road are spaced like everything else that goes past.
import * as THREE from '../../vendor/three/three.module.js';
import { HAND_COLOURS, handGeometry, palmTexture } from './gates.js';
import { canvasTexture, clamp, damp, handPath, lerp, Mesher, mod, TAU } from './kit.js';
import { COINS, picksUp, POWER, POWER_KINDS, POWER_REACH, spillSpots } from './rules.js';
import { ROAD_HALF } from './track.js';

const ROOM_FOR_COINS = 48;
const COIN_HEIGHT = 1.35;
const COIN_FLY_SECONDS = 0.7;
const TOKEN_HEIGHT = 1.9;

/** The shortest way from b to a around the lap, which can be less than nothing. */
const between = (a, b, length) => mod(a - b + length / 2, length) - length / 2;
const towards = (value, target, most) => value + clamp(target - value, -most, most);

/* ---------- pictures of the power-ups ---------- */

/** The power-up's own picture, drawn on a canvas, size across. Used in the race and on the screen. */
export function drawPowerIcon(ctx, kind, size) {
  ctx.save();
  ctx.scale(size / 128, size / 128);
  ctx.translate(64, 64);
  ctx.lineJoin = 'round';
  if (kind === 'magnet') {
    const horseshoe = () => {
      ctx.beginPath();
      ctx.moveTo(-30, -40);
      ctx.lineTo(-30, 2);
      ctx.arc(0, 2, 30, Math.PI, 0, true);
      ctx.lineTo(30, -40);
    };
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#27384b';
    ctx.lineWidth = 34;
    horseshoe();
    ctx.stroke();
    ctx.strokeStyle = '#e8453c';
    ctx.lineWidth = 24;
    horseshoe();
    ctx.stroke();
    ctx.strokeStyle = '#eef2f6';
    for (const x of [-30, 30]) {
      ctx.beginPath();
      ctx.moveTo(x, -39);
      ctx.lineTo(x, -20);
      ctx.stroke();
    }
  } else if (kind === 'bubble') {
    const glass = ctx.createRadialGradient(-12, -14, 6, 0, 0, 50);
    glass.addColorStop(0, '#ffffff');
    glass.addColorStop(0.5, '#bfe9ff');
    glass.addColorStop(1, '#5cc4f5');
    ctx.fillStyle = glass;
    ctx.strokeStyle = '#27384b';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(-18, -22, 13, 7, -0.6, 0, TAU);
    ctx.fill();
  } else if (kind === 'wide') {
    // Two open hands, with arrows saying they come in closer.
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * 30, -2);
      ctx.scale(side, 1);
      ctx.fillStyle = '#27384b';
      handPath(ctx, 0, 0, 66);
      ctx.fillStyle = '#3ddc84';
      handPath(ctx, 0, 1, 56);
      ctx.restore();
    }
    ctx.strokeStyle = '#27384b';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 54, 46);
      ctx.lineTo(side * 16, 46);
      ctx.moveTo(side * 26, 36);
      ctx.lineTo(side * 16, 46);
      ctx.lineTo(side * 26, 56);
      ctx.stroke();
    }
  } else if (kind === 'rainbow') {
    const bands = ['#ff5a4f', '#ff9f45', '#ffd23f', '#3ddc84', '#5ccfff', '#a855f7'];
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#27384b';
    ctx.lineWidth = 52;
    ctx.beginPath();
    ctx.arc(0, 26, 34, Math.PI, 0);
    ctx.stroke();
    bands.forEach((colour, index) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 26, 54 - index * 8, Math.PI, 0);
      ctx.stroke();
    });
  }
  ctx.restore();
}

const iconTextures = new Map();
function iconTexture(kind) {
  if (!iconTextures.has(kind)) iconTextures.set(kind, canvasTexture(128, 128, (ctx) => drawPowerIcon(ctx, kind, 128), { anisotropy: 1 }));
  return iconTextures.get(kind);
}

const TOKEN_TINT = { magnet: '#ffc2bc', bubble: '#c9ecff', wide: '#cdf5c7', rainbow: '#fff0bf' };

/* ---------- coins ---------- */

function coinGeometry() {
  return new THREE.CylinderGeometry(0.62, 0.62, 0.16, 24).rotateX(Math.PI / 2);
}

function coinMaterial(environment) {
  return new THREE.MeshStandardMaterial({ color: '#ffc93c', emissive: '#b37400', emissiveIntensity: 0.45, metalness: 0.55, roughness: 0.3, envMap: environment });
}

/**
 * Coins that spill out onto the road ahead of the car, from a big hand that's slapped or a car that's
 * passed. Each flies out in an arc, lands where the car is going, and drifts over towards it.
 */
export class CoinField {
  constructor(scene, track, { environment, reducedMotion }) {
    this.track = track;
    this.reducedMotion = reducedMotion;
    this.mesh = new THREE.InstancedMesh(coinGeometry(), coinMaterial(environment), ROOM_FOR_COINS);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.target = new THREE.Vector3();
    this.items = [];
  }

  reset() {
    this.items = [];
    this.mesh.count = 0;
  }

  /**
   * count coins out of a spot in the world, landing ahead of a car at distance and lateral, and past any coins
   * already on the road, so that however many spill out at once they're still picked up one at a time.
   */
  spill(from, distance, lateral, count) {
    const furthest = this.items.reduce((most, item) => Math.max(most, item.distance), -Infinity);
    for (const spot of spillSpots(distance, lateral, count, furthest)) {
      this.items.push({ ...spot, from: from.clone(), fly: 0, spin: Math.random() * TAU, position: from.clone() });
    }
    if (this.items.length > ROOM_FOR_COINS) this.items.splice(0, this.items.length - ROOM_FOR_COINS);
  }

  /** car is { distance, lateral, magnet, collect }. onTake(coin) for each one picked up, while collect is true. */
  update(dt, time, car, onTake) {
    const drift = (car.magnet ? 14 : COINS.drift) * dt;
    const reach = car.magnet ? POWER.magnet.ahead : 60;
    this.items = this.items.filter((item) => {
      item.fly = Math.min(1, item.fly + dt / COIN_FLY_SECONDS);
      const ahead = item.distance - car.distance;
      if (ahead < reach) item.lateral = towards(item.lateral, car.lateral, drift);
      if (car.collect !== false && picksUp(item, car, car.magnet)) {
        onTake(item);
        return false;
      }
      return ahead > -6;
    });
    this.items.forEach((item, index) => {
      this.track.pointAt(item.distance, item.lateral, this.target);
      this.target.y += COIN_HEIGHT + (this.reducedMotion ? 0 : Math.sin(time * 3 + item.spin) * 0.12);
      const t = item.fly * item.fly * (3 - 2 * item.fly);
      item.position.lerpVectors(item.from, this.target, t);
      item.position.y += Math.sin(t * Math.PI) * 3;
      this.dummy.position.copy(item.position);
      this.dummy.rotation.set(0, this.track.headingAt(item.distance) + time * (this.reducedMotion ? 1 : 3) + item.spin, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix);
    });
    this.mesh.count = this.items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ---------- power-ups ---------- */

/** Power-ups waiting on the trails of stars: a see-through ball with a picture in it. Each comes back every lap. */
export class PowerUpField {
  constructor(scene, track, { environment, reducedMotion }) {
    this.scene = scene;
    this.track = track;
    this.reducedMotion = reducedMotion;
    this.shell = new THREE.SphereGeometry(1.15, 28, 18);
    this.shellMaterials = Object.fromEntries(POWER_KINDS.map((kind) => [kind, new THREE.MeshStandardMaterial({
      color: TOKEN_TINT[kind], transparent: true, opacity: 0.42, roughness: 0.12, metalness: 0.1, envMap: environment, depthWrite: false,
    })]));
    this.pool = [];
    this.tokens = [];
  }

  make() {
    const group = new THREE.Group();
    const shell = new THREE.Mesh(this.shell);
    shell.renderOrder = 3;
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    icon.scale.setScalar(1.55);
    icon.renderOrder = 2;
    group.add(icon, shell);
    this.scene.add(group);
    return { group, shell, icon };
  }

  /** list is [{ along, lateral, kind }]. */
  setLayout(list) {
    while (this.pool.length < list.length) this.pool.push(this.make());
    this.tokens = list.map(({ along, lateral, kind }, index) => {
      const token = this.pool[index];
      token.shell.material = this.shellMaterials[kind];
      token.icon.material.map = iconTexture(kind);
      token.icon.material.needsUpdate = true;
      this.track.pointAt(along, lateral, token.group.position);
      token.base = token.group.position.y + TOKEN_HEIGHT;
      return Object.assign(token, { along: mod(along, this.track.length), lateral, kind, takenOnLap: -2, phase: along * 0.1 });
    });
    for (const token of this.pool.slice(list.length)) token.group.visible = false;
  }

  reset() {
    for (const token of this.tokens) token.takenOnLap = -2;
  }

  /** position is where the car is on the lap. onTake(token) for one driven through. */
  collect(position, lateral, lap, onTake) {
    for (const token of this.tokens) {
      if (token.takenOnLap === lap) continue;
      if (Math.abs(between(token.along, position, this.track.length)) < POWER_REACH.along && Math.abs(token.lateral - lateral) < POWER_REACH.across) {
        token.takenOnLap = lap;
        onTake(token);
      }
    }
  }

  /** The nearest one still to come of a kind, and how far ahead it is. */
  next(position, lap, kind) {
    let best = null;
    let nearest = Infinity;
    for (const token of this.tokens) {
      if (token.kind !== kind || token.takenOnLap === lap) continue;
      const ahead = mod(token.along - position, this.track.length);
      if (ahead < nearest) {
        nearest = ahead;
        best = token;
      }
    }
    return { token: best, ahead: nearest };
  }

  update(time, lap, visible) {
    for (const token of this.tokens) {
      token.group.visible = visible && token.takenOnLap !== lap;
      token.group.position.y = token.base + (this.reducedMotion ? 0 : Math.sin(time * 2 + token.phase) * 0.18);
    }
  }
}

/* ---------- the tractor ---------- */

function wheelMesh(radius, width, hub) {
  const m = new Mesher();
  m.add('cylinder', '#2b3340', 0, 0, 0, radius * 2, width, radius * 2, { rz: Math.PI / 2 });
  m.add('cylinder', hub, 0, 0, 0, radius * 1.05, width + 0.04, radius * 1.05, { rz: Math.PI / 2 });
  // Chunky treads, far enough apart that they don't flicker as it turns.
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * TAU;
    m.box('#3b4552', 0, Math.cos(angle) * radius, Math.sin(angle) * radius, width + 0.06, 0.16, 0.34, { rx: angle });
  }
  return new THREE.Mesh(m.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
}

// The farmer's arm hangs down by his side, and goes up to wave. It turns about the way the tractor is going,
// and his arm is on the tractor's left, so these lean it a little out from him.
const ARM_DOWN = -2.9;
const ARM_UP = -0.5;

/**
 * A little red tractor from the farm, with a trailer of hay and a farmer who waves. It trundles along
 * slowly on the shoulder, away from the next big hand, and stops for a child who's resting.
 */
export class Tractor {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    const m = new Mesher();
    // +Z is forward.
    m.box('#e5483b', 0, 0.95, 0.3, 1.5, 0.6, 3.2, { shade: 0.8 });
    m.box('#e5483b', 0, 1.45, 1.05, 1.25, 0.95, 1.6, { shade: 0.85 });
    m.box('#2b3340', 0, 1.4, 1.87, 1.0, 0.7, 0.06);
    m.box('#ffd23f', 0.42, 1.55, 1.9, 0.22, 0.22, 0.04);
    m.box('#ffd23f', -0.42, 1.55, 1.9, 0.22, 0.22, 0.04);
    m.add('post', '#9aa5b1', 0.45, 2.3, 1.3, 0.14, 1.3, 0.14);
    m.add('post', '#5b6673', 0.45, 3.0, 1.3, 0.2, 0.14, 0.2);
    // The cab: a seat, white posts and a yellow roof.
    m.box('#2b3340', 0, 1.5, -0.65, 0.9, 0.3, 0.8);
    for (const [x, z] of [[-0.85, -1.35], [0.85, -1.35], [-0.85, 0.15], [0.85, 0.15]]) m.add('post', '#f7fafc', x, 2.35, z, 0.1, 2, 0.1);
    m.box('#ffd23f', 0, 3.38, -0.6, 2, 0.16, 1.8);
    // The farmer: blue overalls, a straw hat.
    m.box('#3b6fd6', 0, 2.05, -0.65, 0.62, 0.8, 0.5, { shade: 0.85 });
    m.add('ball', '#f5cfa8', 0, 2.72, -0.6, 0.56);
    m.add('disc', '#f2d27a', 0, 3.0, -0.6, 0.95, 1, 0.95);
    m.add('cylinder', '#f2d27a', 0, 3.1, -0.6, 0.48, 0.24, 0.48);
    m.add('ball', '#27384b', 0.12, 2.76, -0.34, 0.07);
    m.add('ball', '#27384b', -0.12, 2.76, -0.34, 0.07);
    // The trailer, full of hay, with a little gold on top.
    m.box('#8a5a3c', 0, 0.5, -1.9, 0.18, 0.18, 1.2);
    m.box('#b07a4a', 0, 1.0, -3.35, 2.1, 0.3, 2.6, { shade: 0.8 });
    for (const side of [-1, 1]) m.box('#c48a54', side * 1.0, 1.35, -3.35, 0.1, 0.5, 2.6);
    m.box('#c48a54', 0, 1.35, -4.6, 2.1, 0.5, 0.1);
    for (const [x, z] of [[-0.48, -2.7], [0.48, -2.7], [-0.48, -3.9], [0.48, -3.9], [0, -3.3]]) {
      m.box('#f2c94c', x, z === -3.3 ? 2.15 : 1.55, z, 0.9, 0.62, 1.1, { shade: 0.82 });
    }
    for (const [x, z] of [[-0.2, -3.2], [0.25, -3.45], [0.05, -3.0]]) m.add('disc', '#ffc93c', x, 2.5, z, 0.42, 1, 0.42);
    this.body = new THREE.Mesh(m.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.body.castShadow = true;
    this.group.add(this.body);
    // Its wheels go round on their own.
    this.wheels = [
      { mesh: wheelMesh(0.95, 0.55, '#ffd23f'), x: 1.08, z: -0.6, radius: 0.95 },
      { mesh: wheelMesh(0.95, 0.55, '#ffd23f'), x: -1.08, z: -0.6, radius: 0.95 },
      { mesh: wheelMesh(0.55, 0.36, '#ffd23f'), x: 0.82, z: 1.35, radius: 0.55 },
      { mesh: wheelMesh(0.55, 0.36, '#ffd23f'), x: -0.82, z: 1.35, radius: 0.55 },
      { mesh: wheelMesh(0.5, 0.3, '#e5483b'), x: 1.12, z: -3.35, radius: 0.5 },
      { mesh: wheelMesh(0.5, 0.3, '#e5483b'), x: -1.12, z: -3.35, radius: 0.5 },
    ];
    for (const wheel of this.wheels) {
      wheel.mesh.position.set(wheel.x, wheel.radius, wheel.z);
      wheel.mesh.castShadow = true;
      this.group.add(wheel.mesh);
    }
    // The farmer's arm, which waves as the car goes past.
    const arm = new Mesher().add('post', '#f5cfa8', 0, 0.32, 0, 0.14, 0.64, 0.14).add('ball', '#f5cfa8', 0, 0.68, 0, 0.2);
    this.arm = new THREE.Mesh(arm.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.arm.position.set(0.36, 2.3, -0.6);
    this.arm.rotation.z = ARM_DOWN;
    this.group.add(this.arm);
    this.group.visible = false;
    scene.add(this.group);
    this.wave = 0;
    this.time = 0;
  }

  place(track, distance, lateral, speed, dt, reducedMotion) {
    this.time += dt;
    track.pointAt(distance, lateral, this.group.position);
    this.group.rotation.y = track.headingAt(distance);
    this.group.rotation.x = -track.pitchAt(distance);
    // A gentle chug, slow enough to see as a rumble rather than a shake.
    this.body.position.y = speed > 0.5 && !reducedMotion ? Math.sin(this.time * 9) * 0.03 : 0;
    for (const wheel of this.wheels) wheel.mesh.rotation.x += (speed / wheel.radius) * dt;
    this.wave = Math.max(0, this.wave - dt);
    const wanted = this.wave > 0 ? ARM_UP + (reducedMotion ? 0 : Math.sin(this.time * 8) * 0.4) : ARM_DOWN;
    this.arm.rotation.z = damp(this.arm.rotation.z, wanted, 10, dt);
  }
}

/* ---------- the balloon with a gem ---------- */

const GEM_HIGH = 11;
const GEM_LOW = 1.9;
const BALLOON_HEIGHT = 15; // Above the road: low enough to be seen under the camera's picture, high over the cars.
const GEM_LOWERS_WITHIN = 85; // Metres ahead of the car that the balloon starts letting its gem down.

function balloonGeometry() {
  const m = new Mesher();
  m.add('ball', '#ff7eb6', 0, 4.6, 0, 6.6, 7.4, 6.6, { shade: 0.8 });
  m.add('ball', '#ffd23f', 0, 4.6, 0, 2.2, 7.5, 6.7, { shade: 0.8 });
  m.add('ball', '#5ccfff', 0, 4.6, 0, 6.7, 7.5, 2.2, { shade: 0.8 });
  m.add('taper', '#ff7eb6', 0, 0.7, 0, 2, 1.4, 2, { rx: Math.PI });
  for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) m.add('post', '#8a5a3c', x, -0.2, z, 0.06, 1.4, 0.06);
  m.box('#a8703c', 0, -1.2, 0, 1.5, 1, 1.5, { shade: 0.8 });
  return m.geometry();
}

/**
 * A hot-air balloon over the road, which lets a gem down on a ribbon as the car comes, right where the trail
 * of stars goes. Driving through it, or flying, picks it up.
 */
export class GemBalloons {
  constructor(scene, track, { environment, reducedMotion }) {
    this.scene = scene;
    this.track = track;
    this.reducedMotion = reducedMotion;
    this.shape = balloonGeometry();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.gemShape = new THREE.OctahedronGeometry(0.8, 0).scale(1, 1.25, 1);
    this.gemMaterial = new THREE.MeshStandardMaterial({ color: '#53e0ff', emissive: '#1690b8', emissiveIntensity: 0.55, roughness: 0.18, metalness: 0.2, envMap: environment, flatShading: true });
    this.ribbonShape = new THREE.CylinderGeometry(0.05, 0.05, 1, 6).translate(0, -0.5, 0);
    this.ribbonMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    this.pool = [];
    this.balloons = [];
  }

  make() {
    const group = new THREE.Group();
    const balloon = new THREE.Mesh(this.shape, this.material);
    balloon.castShadow = false;
    const ribbon = new THREE.Mesh(this.ribbonShape, this.ribbonMaterial);
    const gem = new THREE.Mesh(this.gemShape, this.gemMaterial);
    gem.castShadow = true;
    group.add(balloon, ribbon, gem);
    this.scene.add(group);
    return { group, balloon, ribbon, gem };
  }

  /** list is [{ along, lateral }]. */
  setLayout(list) {
    while (this.pool.length < list.length) this.pool.push(this.make());
    this.balloons = list.map(({ along, lateral }, index) => {
      const item = this.pool[index];
      this.track.pointAt(along, lateral, item.group.position);
      item.balloon.position.set(0, BALLOON_HEIGHT, 0);
      return Object.assign(item, { along: mod(along, this.track.length), lateral, takenOnLap: -2, drop: 0, gemHeight: GEM_HIGH });
    });
    for (const item of this.pool.slice(list.length)) item.group.visible = false;
  }

  reset() {
    for (const item of this.balloons) {
      item.takenOnLap = -2;
      item.drop = 0;
    }
  }

  /**
   * car is { position (on the lap), lateral, lift }. onTake(balloon) when the gem is picked up, which is only
   * while collect is true, so nothing is taken during a hand check.
   */
  update(dt, time, { position, lap, lateral, lift, visible, collect = visible }, onTake) {
    for (const item of this.balloons) {
      item.group.visible = visible;
      const taken = item.takenOnLap === lap;
      const ahead = mod(item.along - position, this.track.length);
      item.drop = damp(item.drop, !taken && ahead < GEM_LOWERS_WITHIN ? 1 : 0, taken ? 3 : 1.6, dt);
      item.gemHeight = lerp(GEM_HIGH, GEM_LOW, item.drop);
      const sway = this.reducedMotion ? 0 : Math.sin(time * 0.5 + item.along) * 0.35;
      item.balloon.position.x = sway;
      item.gem.visible = !taken;
      item.gem.position.set(sway, item.gemHeight, 0);
      item.gem.rotation.y = time * (this.reducedMotion ? 0.4 : 1.4);
      const top = BALLOON_HEIGHT - 1.7;
      item.ribbon.position.set(sway, top, 0);
      item.ribbon.scale.y = Math.max(0.1, top - (taken ? Math.max(item.gemHeight, top - 2) : item.gemHeight) - 0.9);
      if (!visible || !collect || taken) continue;
      const near = Math.abs(between(item.along, position, this.track.length)) < POWER_REACH.along && Math.abs(item.lateral - lateral) < POWER_REACH.across;
      if (near && item.gemHeight < 4.5 + lift) {
        item.takenOnLap = lap;
        onTake(item);
      }
    }
  }

  gemPosition(item, out) {
    return item.gem.getWorldPosition(out);
  }
}

/* ---------- the treasure chest ---------- */

/** A treasure chest at the roadside. Reaching over to it, like a big hand, opens it, and out come coins. */
export class Chests {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    const box = new Mesher();
    box.box('#7a8b4a', 0, 0.12, 0, 2.6, 0.24, 2.0, { shade: 0.85 });
    box.box('#a0612f', 0, 0.75, 0, 1.9, 1.05, 1.25, { shade: 0.78 });
    for (const x of [-0.62, 0.62]) box.box('#ffc93c', x, 0.75, 0, 0.16, 1.08, 1.29);
    box.box('#ffc93c', 0, 0.85, 0.64, 0.34, 0.42, 0.06);
    box.add('ball', '#ffd968', 0, 1.25, 0, 1.5, 0.5, 0.9);
    const lid = new Mesher();
    lid.add('cylinder', '#a0612f', 0, 0, 0.62, 1.25, 1.9, 1.25, { rz: Math.PI / 2, shade: 0.85 });
    for (const x of [-0.62, 0.62]) lid.add('cylinder', '#ffc93c', x, 0, 0.62, 1.3, 0.16, 1.3, { rz: Math.PI / 2 });
    this.boxShape = box.geometry();
    this.lidShape = lid.geometry();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.pool = [];
    this.chests = [];
  }

  make() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.boxShape, this.material);
    body.castShadow = true;
    const hinge = new THREE.Group();
    hinge.position.set(0, 1.28, -0.62);
    const lid = new THREE.Mesh(this.lidShape, this.material);
    lid.castShadow = true;
    // The half of the cylinder below the hinge is hidden inside the box.
    hinge.add(lid);
    group.add(body, hinge);
    group.scale.setScalar(1.25);
    this.scene.add(group);
    return { group, hinge };
  }

  /** list is [{ along, side }]. */
  setLayout(list) {
    while (this.pool.length < list.length) this.pool.push(this.make());
    this.chests = list.map(({ along, side }, index) => {
      const chest = this.pool[index];
      this.track.pointAt(along, side * (ROAD_HALF + 1.3), chest.group.position);
      // Facing the car coming up the road, turned a little towards the road. Facing back down the road, the
      // chest's +X is the driver's right, so one on the right turns its front towards -X.
      chest.group.rotation.y = this.track.headingAt(along) + Math.PI - side * 0.5;
      return Object.assign(chest, { along: mod(along, this.track.length), side, openedOnLap: -2, open: 0 });
    });
    for (const chest of this.pool.slice(list.length)) chest.group.visible = false;
  }

  reset() {
    for (const chest of this.chests) chest.openedOnLap = -2;
  }

  update(dt, lap, visible) {
    for (const chest of this.chests) {
      chest.group.visible = visible;
      chest.open = damp(chest.open, chest.openedOnLap === lap ? 1 : 0, chest.openedOnLap === lap ? 6 : 2, dt);
      chest.hinge.rotation.x = -1.9 * chest.open;
    }
  }
}

/* ---------- the high ten ---------- */

const GIANT = 3.3;
const GIANT_WRIST = 3.4; // High enough for any car to go under the gloves.
// The posts stand on the shoulder, like everything else beside the road, and an arm from each holds its glove
// out over the edge of the road, where the car goes by it.
export const HIGH_TEN_POST = ROAD_HALF + 1.3;
export const HIGH_TEN_WRIST = ROAD_HALF - 0.4;
const HIGH_TEN_LEAN = 0.18; // In over the road, palm to the car.
const HIGH_TEN_FADES_IN = 1.2; // Seconds.

/**
 * Two giant hands either side of the road just before the finish, on the last lap, for a high ten. They only
 * ever come into view far ahead of the car, fading in, so they never appear all at once near the camera.
 */
export class HighTen {
  constructor(scene, track, { reducedMotion }) {
    this.track = track;
    this.reducedMotion = reducedMotion;
    this.root = new THREE.Group();
    // All of it fades in together. Each glove still hides what's behind it while it does.
    const faded = (material) => Object.assign(material, { transparent: true, opacity: 0 });
    const paints = [HAND_COLOURS[2], HAND_COLOURS[1]].map((colour) => faded(new THREE.MeshLambertMaterial({ color: colour })));
    const palm = faded(new THREE.MeshBasicMaterial({ map: palmTexture('10') }));
    const post = faded(new THREE.MeshLambertMaterial({ color: '#f7fafc' }));
    this.materials = [...paints, palm, post];
    const reach = HIGH_TEN_POST - HIGH_TEN_WRIST;
    this.hands = [-1, 1].map((side, index) => {
      const pivot = new THREE.Group();
      const hand = new THREE.Group();
      hand.scale.setScalar(GIANT);
      const glove = new THREE.Mesh(handGeometry(-side), paints[index]);
      glove.castShadow = true;
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.46, 28), palm);
      face.position.set(0, 0.68, 0.272);
      hand.add(glove, face);
      pivot.add(hand);
      pivot.position.set(side * HIGH_TEN_WRIST, GIANT_WRIST, 0);
      // Facing back down the road, +X is the driver's right, so turning about Z by side leans the glove inwards.
      pivot.rotation.z = side * HIGH_TEN_LEAN;
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, GIANT_WRIST + 0.3, 10), post);
      stand.position.set(side * HIGH_TEN_POST, (GIANT_WRIST + 0.3) / 2, 0);
      stand.castShadow = true;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, reach + 0.4, 10).rotateZ(Math.PI / 2), post);
      arm.position.set(side * (HIGH_TEN_POST - reach / 2), GIANT_WRIST + 0.15, 0);
      arm.castShadow = true;
      this.root.add(pivot, stand, arm);
      return { side, pivot, hand, stand, swing: 0, swingSpeed: 0 };
    });
    this.root.visible = false;
    scene.add(this.root);
    this.along = 0;
    this.shown = 0; // How far it has faded in, from 0 to 1.
  }

  setPlace(along) {
    this.along = mod(along, this.track.length);
    this.track.pointAt(along, 0, this.root.position);
    this.root.rotation.y = this.track.headingAt(along) + Math.PI;
    for (const hand of this.hands) {
      hand.swing = 0;
      hand.swingSpeed = 0;
    }
  }

  /** Both hands swing back, for a high ten, or only wobble for a closed hand. */
  slap(hard = true) {
    for (const hand of this.hands) hand.swingSpeed = (this.reducedMotion ? 0.4 : 1) * (hard ? 9 : 3);
  }

  palmAt(index, out) {
    return this.hands[index].hand.localToWorld(out.set(0, 0.68, 0.272));
  }

  /**
   * on is whether it's wanted. It fades in at a set pace, and out the same way, except when the view cuts away
   * from it, as at the finish, when cut is true and it goes with everything else.
   */
  update(dt, on, cut = false) {
    if (on) this.shown = Math.min(1, this.shown + dt / HIGH_TEN_FADES_IN);
    else this.shown = cut ? 0 : Math.max(0, this.shown - dt / HIGH_TEN_FADES_IN);
    this.root.visible = this.shown > 0;
    for (const material of this.materials) material.opacity = this.shown;
    for (const hand of this.hands) {
      hand.swingSpeed += (-hand.swing * 30 - hand.swingSpeed * 3.4) * dt;
      hand.swing += hand.swingSpeed * dt;
      hand.pivot.rotation.x = -hand.swing;
    }
  }
}

/* ---------- on the car ---------- */

const RAINBOW_COLOURS = ['#ff5a4f', '#ff9f45', '#ffd23f', '#3ddc84', '#5ccfff', '#a855f7'];
// The rainbow trail: a little rainbow left behind the car this often, in seconds, which goes along nearly as fast
// as the car and is gone before it gets anywhere near the camera.
const TRAIL = { every: 0.4, life: 0.9, keepsUp: 0.8 };

/**
 * What a power-up looks like on the car: a see-through bubble round it, a magnet over it, and a trail of
 * rainbow colours behind. They fade in and out, and none of them changes how bright the picture is.
 */
export class CarPowers {
  constructor(car, { reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 20),
      new THREE.MeshLambertMaterial({ color: '#bfe8ff', emissive: '#4aa8d8', emissiveIntensity: 0.25, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.bubble.scale.set(2.2, 1.9, 3.1);
    this.bubble.position.set(0, 1.25, 0);
    this.bubble.renderOrder = 3;
    this.bubble.visible = false;
    this.magnet = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture('magnet'), transparent: true, depthWrite: false, opacity: 0 }));
    this.magnet.scale.setScalar(1.3);
    this.magnet.position.set(0, 3.7, -0.6);
    this.magnet.visible = false;
    car.group.add(this.bubble, this.magnet);
    this.shown = { bubble: 0, magnet: 0 };
    this.rainbowWait = 0;
  }

  update(dt, powers, time) {
    for (const kind of ['bubble', 'magnet']) {
      this.shown[kind] = damp(this.shown[kind], powers.has(kind) ? 1 : 0, 5, dt);
    }
    this.bubble.visible = this.shown.bubble > 0.01;
    this.bubble.material.opacity = 0.24 * this.shown.bubble;
    this.magnet.visible = this.shown.magnet > 0.01;
    this.magnet.material.opacity = this.shown.magnet;
    this.magnet.position.y = 3.7 + (this.reducedMotion ? 0 : Math.sin(time * 2.4) * 0.1);
  }

  /**
   * Now and then a little rainbow, a dot of each colour side by side, left just behind the car as it goes. They
   * go along nearly as fast as the car and fade a few metres behind it, so nothing streams past the bottom of
   * the picture, and fewer than three come a second. A slow computer has fewer, and with reduced motion there
   * are none. The race only calls this while the car is going with the hand open.
   */
  trail(dt, particles, car, speed) {
    if (this.reducedMotion || particles.budget < 0.5) return;
    this.rainbowWait -= dt;
    if (this.rainbowWait > 0) return;
    this.rainbowWait = TRAIL.every / particles.budget;
    const at = car.group.position;
    const heading = car.group.rotation.y;
    const along = speed * TRAIL.keepsUp;
    RAINBOW_COLOURS.forEach((colour, index) => {
      const across = (index - 2.5) * 0.24;
      particles.emit({
        shape: 'dot',
        colour,
        x: at.x - Math.sin(heading) * 2.4 + Math.cos(heading) * across,
        y: at.y + 0.5,
        z: at.z - Math.cos(heading) * 2.4 - Math.sin(heading) * across,
        vx: Math.sin(heading) * along,
        vy: 0.2,
        vz: Math.cos(heading) * along,
        life: TRAIL.life,
        size: 0.4,
        grow: 0.2,
        opacity: 0.85,
      });
    });
  }
}

