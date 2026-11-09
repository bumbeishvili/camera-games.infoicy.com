// The picture of Cannon Bay: the island from sea level, rolling waves around the camera, the child's
// ship with Joze on it, the pirate ships, the firing zones on the water, and the cannonballs between them.
// The camera sits behind and a little above the child's ship, and follows it round.
//
// Nothing flashes or strobes, as seizures are more common in children with hemiplegia. There are no
// muzzle flashes or explosions. Cannons make soft white smoke, a hit is a few small shapes where it
// happened, a beaten ship sinks in soft grey smoke, and the picture itself never changes brightness.
import * as THREE from '../../vendor/three/three.module.js';
import { Sparks } from '../../core/body/sparks.js';
import { Island } from '../sky-wings/island.js';
import { SHIP_KINDS, forwardOf, rightOf } from './battle.js';
import { CHART, getChart } from './chart.js';
import { POWER_LOOKS, PrizeDrawing } from './prizes.js';
import { Coins, Dolphins, Floats } from './sea-life.js';
import { HeroShip, Lifeboat, PirateShip, LOOKS, Raft, Submarine, kingsCrown } from './ships.js';

const SLOW_FRAME_SECONDS = 1 / 40;
const SLOW_CHECK_FRAMES = 90;
const FOV = 54;
const VIEW = { back: 78, up: 37, ahead: 78, lookUp: 8 };
const TITLE_VIEW = { back: 92, up: 21, ahead: 22, lookUp: 17, aside: -54, yaw: -0.72 };
const MOST_BALLS = 48;
const MOST_RINGS = 10;
const SEA = { cells: 150, cell: 7, cellsLow: 90, cellLow: 11 };
// Further away than this, a captain can't be made out anyway, and a slow computer can do without them
// sooner than that.
const NEAR_CAPTAIN = [200, 340, 340];
const WATCH_SECONDS = 4.5;
// The weather on the higher levels: a light mist from level 7, and the sun going down at level 10, which
// only change the colours and how far can be seen, and never how bright the picture is from moment to moment.
const CLEAR = { fog: '#dff4ff', near: 700, far: 2300, sky: '#ffffff', ground: '#9fbf9a', light: 1.9, sun: '#fff3dc', sunLight: 2.1, tint: '#bfe7fb', dome: '#ffffff' };
const MIST = { fog: '#e3ecef', near: 240, far: 1250, dome: '#edf3f5' };
const SUNSET = { fog: '#ffd6b3', sky: '#ffeeda', ground: '#b49a7c', light: 1.85, sun: '#ffc085', sunLight: 2.2, tint: '#ffcfa3', dome: '#ffcfa6' };
const ODD_KINDS = new Set(['raft', 'little', 'sub']);
// The order the pirate king's sails come down in: the tops first.
const KING_SAILS = [1, 3, 0, 2];
const FROST_SAILS = new THREE.Color('#cfe6ff');
const WHITE = new THREE.Color('#ffffff');

// A soap bubble: nearly clear in the middle and paler towards its edge, with a little shine on it, which
// is what makes it read as a bubble. Its opacity only ever changes slowly.
const BUBBLE_VERTEX = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 moved = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-moved.xyz);
  gl_Position = projectionMatrix * moved;
}`;
const BUBBLE_FRAGMENT = `
uniform vec3 uColour;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec3 normal = normalize(vNormal);
  float rim = 1.0 - abs(dot(normal, normalize(vView)));
  float shine = smoothstep(0.93, 0.98, dot(normal, normalize(vec3(-0.45, 0.6, 0.66))));
  float alpha = (0.12 + 0.55 * pow(rim, 2.2) + 0.45 * shine) * uOpacity;
  vec3 colour = mix(uColour, vec3(1.0), clamp(pow(rim, 3.0) * 0.5 + shine, 0.0, 1.0));
  gl_FragColor = vec4(colour, alpha);
}`;

function bubbleMaterial(colour) {
  return new THREE.ShaderMaterial({
    uniforms: { uColour: { value: new THREE.Color(colour) }, uOpacity: { value: 0 } },
    vertexShader: BUBBLE_VERTEX,
    fragmentShader: BUBBLE_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
const between = (low, high) => low + Math.random() * (high - low);
const turnBetween = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/* ------------------------------- the waves ------------------------------- */

// The sea's swell: several long waves going different ways. The picture and the ships use the same
// numbers, so that a ship really rides the waves that can be seen around it.
const SWELLS = [
  { x: 0.021, z: 0.034, rate: 0.85, size: 0.5, phase: 0 },
  { x: -0.043, z: 0.028, rate: 1.15, size: 0.32, phase: 1.3 },
  { x: 0.081, z: -0.063, rate: 1.7, size: 0.2, phase: 4.1 },
  { x: -0.13, z: -0.16, rate: 2.4, size: 0.08, phase: 2.2 },
];
const SWELL_HEIGHT = 2.3;

export function swellAt(x, z, time) {
  let height = 0;
  for (const { x: kx, z: kz, rate, size, phase } of SWELLS) height += size * Math.sin(kx * x + kz * z + rate * time + phase);
  return height;
}

const SWELL_CODE = `
  uniform float uTime;
  uniform float uSize;
  uniform sampler2D uChart;
  uniform float uChartCells;
  uniform float uChartCell;
  uniform float uChartReach;
  float swell(vec2 p) {
    float height = 0.0;
    ${SWELLS.map(({ x, z, rate, size, phase }) => `height += ${size.toFixed(3)} * sin(dot(p, vec2(${x.toFixed(4)}, ${z.toFixed(4)})) + ${rate.toFixed(3)} * uTime + ${phase.toFixed(3)});`).join('\n    ')}
    return height;
  }
  float landAt(vec2 p) {
    vec2 at = ((p + uChartReach) / uChartCell + 0.5) / uChartCells;
    return texture2D(uChart, at).r * 40.0 - 36.0;
  }
  float seaHeight(vec2 p, float land) {
    return swell(p) * uSize * (1.0 - 0.8 * smoothstep(-18.0, -3.0, land));
  }`;

const SEA_VERTEX = `
  ${SWELL_CODE}
  varying vec3 vAt;
  varying float vSwell;
  varying float vLand;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vLand = landAt(world.xz);
    vSwell = swell(world.xz);
    world.y = seaHeight(world.xz, vLand);
    vAt = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

const SEA_FRAGMENT = `
  uniform float uTime;
  uniform sampler2D uRipple;
  uniform vec2 uRippleAt;
  uniform vec3 uSun;
  uniform vec3 uSkyTint;
  uniform vec3 uShallow;
  uniform vec3 uFog;
  uniform vec2 uFogRange;
  uniform vec2 uMiddle;
  uniform float uReach;
  varying vec3 vAt;
  varying float vSwell;
  varying float vLand;
  void main() {
    vec3 normal = normalize(cross(dFdx(vAt), dFdy(vAt)));
    if (normal.y < 0.0) normal = -normal;
    vec3 toEye = normalize(cameraPosition - vAt);
    vec3 ripple = texture2D(uRipple, vec2(vAt.x, -vAt.z) / 148.57 + uRippleAt).rgb;
    float up = clamp(vSwell * 0.5 + 0.5, 0.0, 1.0);

    // Darker in the troughs and lighter on the crests, with each facet of a wave catching the sun its
    // own way. The waves are low, so their slopes are made more of here to show them up.
    vec3 slope = normalize(vec3(normal.x * 4.0, normal.y, normal.z * 4.0));
    float sunOn = clamp(dot(slope, uSun), 0.0, 1.0);
    vec3 water = ripple * mix(0.62, 1.16, up * up);
    water *= 0.72 + 0.62 * sunOn;

    // The sky on the water, the flatter it's seen the more.
    float flatness = pow(1.0 - clamp(dot(normal, toEye), 0.0, 1.0), 3.0);
    water = mix(water, uSkyTint, flatness * 0.5);

    // Little white tops on the highest waves, wherever the ripples say.
    float marks = smoothstep(0.035, 0.11, ripple.r);
    float tops = smoothstep(0.56, 0.86, up) * marks;
    water = mix(water, vec3(0.96, 0.98, 1.0), tops * 0.72);

    // Pale water over the sand, and foam coming and going along the shore.
    float shallow = smoothstep(-16.0, -2.5, vLand);
    water = mix(water, uShallow, shallow * 0.72);
    float shore = smoothstep(-4.5, -2.0, vLand) * (0.45 + 0.55 * sin(vLand * 3.4 + uTime * 1.1 + ripple.r * 5.0));
    water = mix(water, vec3(1.0), clamp(shore, 0.0, 1.0) * 0.7);

    float depth = length(cameraPosition - vAt);
    water = mix(water, uFog, smoothstep(uFogRange.x, uFogRange.y, depth));
    float fade = 1.0 - smoothstep(uReach * 0.6, uReach * 0.97, distance(vAt.xz, uMiddle));
    gl_FragColor = vec4(water, fade * mix(0.97, 0.62, shallow));
    #include <colorspace_fragment>
  }`;

// What floats on the water: it goes up and down with the waves.
const ON_WATER_VERTEX = `
  ${SWELL_CODE}
  attribute vec4 aShape;
  uniform float uLift;
  varying vec4 vShape;
  varying vec3 vAt;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    world.y = seaHeight(world.xz, landAt(world.xz)) + uLift;
    vShape = aShape;
    vAt = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

const ZONE_FRAGMENT = `
  uniform float uTime;
  uniform vec3 uColour;
  uniform float uStrength;
  uniform float uFiring;
  uniform float uFlow;
  varying vec4 vShape;
  void main() {
    float edge = min(min(vShape.x, vShape.y), vShape.z);
    float along = vShape.w;
    // A dashed edge while it's waiting, and a solid one while its cannons fire.
    float dashes = mix(step(0.0, sin((along + vShape.x + vShape.y) * 0.34)), 1.0, uFiring);
    float border = (1.0 - smoothstep(1.2, 2.6, edge)) * dashes;
    float glow = 1.0 - smoothstep(0.0, 30.0, edge);
    // Slow bands going out across it, that show the way the cannons fire.
    float bands = smoothstep(-0.2, 0.7, sin(along * 0.17 - uTime * uFlow));
    float fill = 0.1 + uFiring * 0.16 + glow * 0.17 + bands * (0.05 + uFiring * 0.13);
    float nearShip = smoothstep(14.0, 36.0, along);
    gl_FragColor = vec4(uColour, uStrength * nearShip * clamp(border * 0.9 + fill, 0.0, 1.0));
    #include <colorspace_fragment>
  }`;

const WAKE_FRAGMENT = `
  uniform sampler2D uRipple;
  uniform float uWay;
  varying vec4 vShape;
  varying vec3 vAt;
  void main() {
    float age = vShape.x;
    float across = abs(vShape.y);
    float marks = texture2D(uRipple, vec2(vAt.x, -vAt.z) / 37.0).r;
    // Two lines going out from the bow, which stay thin as they spread, and churned water in between.
    float lineFrom = mix(0.6, 0.93, age);
    float sides = smoothstep(lineFrom, 0.965, across) * (1.0 - smoothstep(0.965, 1.0, across));
    float middle = (1.0 - smoothstep(0.0, 0.5, across)) * (1.0 - age) * (1.0 - age) * (1.0 - age);
    float foam = sides * 0.8 * pow(1.0 - age, 1.8) + middle * 0.85;
    gl_FragColor = vec4(0.97, 0.99, 1.0, clamp(foam * uWay * (0.4 + marks * 1.5), 0.0, 0.9));
    #include <colorspace_fragment>
  }`;

function chartTexture() {
  const chart = getChart();
  const data = new Uint8Array(CHART.cells * CHART.cells);
  for (let i = 0; i < data.length; i += 1) data[i] = clamp(((chart.heights[i] + 36) / 40) * 255, 0, 255);
  const texture = new THREE.DataTexture(data, CHART.cells, CHART.cells, THREE.RedFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/* ------------------------------- what floats ------------------------------- */

/** A firing zone on the water, on one side of the child's ship. It shows exactly where the cannons fire. */
class FiringZone {
  constructor(parent, side, shared) {
    this.side = side === 'right' ? 1 : -1;
    this.colour = new THREE.Color('#fff7c2');
    this.uniforms = {
      ...shared,
      uLift: { value: 0.55 },
      uColour: { value: this.colour },
      uStrength: { value: 0.7 },
      uFiring: { value: 0 },
      uFlow: { value: 1 },
    };
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: ON_WATER_VERTEX,
      fragmentShader: ZONE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    parent.add(this.mesh);
  }

  /** It covers exactly what the rules say. */
  setShape({ from, to, reach }) {
    const rows = 12;
    const columns = 26;
    const positions = [];
    const shape = [];
    const index = [];
    for (let row = 0; row <= rows; row += 1) {
      const away = (row / rows) * reach;
      for (let column = 0; column <= columns; column += 1) {
        const angle = from + ((to - from) * column) / columns;
        positions.push(this.side * Math.sin(angle) * away, 0, -Math.cos(angle) * away);
        shape.push(away * Math.sin(angle - from), away * Math.sin(to - angle), reach - away, away);
      }
    }
    const stride = columns + 1;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const a = row * stride + column;
        index.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
      }
    }
    const { geometry } = this.mesh;
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aShape', new THREE.Float32BufferAttribute(shape, 4));
    geometry.setIndex(index);
  }

  /** Pale when there's nothing in it, faint with the sails down, and green while its cannons fire. */
  update(dt, { firing, inside, ready, calm }) {
    const wanted = firing ? ZONE_FIRING : inside ? ZONE_WAITING : ZONE_IDLE;
    this.colour.lerp(wanted, 1 - Math.exp(-dt * 7));
    this.uniforms.uStrength.value = damp(this.uniforms.uStrength.value, firing ? 1 : ready ? 0.72 : 0.42, 5, dt);
    this.uniforms.uFiring.value = damp(this.uniforms.uFiring.value, firing ? 1 : 0, 5, dt);
    this.uniforms.uFlow.value = firing ? 2.4 * calm : 0.9 * calm;
  }
}

const ZONE_IDLE = new THREE.Color('#fff7c2');
const ZONE_WAITING = new THREE.Color('#ffc53d');
const ZONE_FIRING = new THREE.Color('#3dff86');

/** The white trail on the water behind a ship, which widens as it fades. */
class Wake {
  constructor(scene, shared, ripple) {
    this.points = 46;
    this.step = 6;
    this.trail = [];
    this.positions = new Float32Array(this.points * 2 * 3);
    this.shape = new Float32Array(this.points * 2 * 4);
    const index = [];
    for (let i = 0; i < this.points - 1; i += 1) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aShape', new THREE.BufferAttribute(this.shape, 4));
    geometry.setIndex(index);
    this.uniforms = { ...shared, uLift: { value: 0.32 }, uRipple: ripple, uWay: { value: 0 } };
    this.mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: ON_WATER_VERTEX,
      fragmentShader: WAKE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.mesh.visible = false;
  }

  clear() {
    this.trail.length = 0;
    this.mesh.visible = false;
  }

  /** The ship is at x, z, going this way, with way from 0 (still) to 1 (full speed). */
  update(x, z, heading, way, dt) {
    const { trail, positions, shape, points, step } = this;
    const forward = forwardOf(heading);
    const right = rightOf(heading);
    const bowX = x + forward.x * 15;
    const bowZ = z + forward.z * 15;
    const newest = trail[0];
    if (!newest || Math.hypot(bowX - newest.x, bowZ - newest.z) >= step) {
      trail.unshift({ x: bowX, z: bowZ, rx: right.x, rz: right.z, born: this.time ?? 0 });
      if (trail.length > points - 1) trail.pop();
    }
    this.time = (this.time ?? 0) + dt;
    this.uniforms.uWay.value = damp(this.uniforms.uWay.value, clamp(way * 1.3, 0, 1), 2, dt);
    this.mesh.visible = trail.length > 1 && this.uniforms.uWay.value > 0.01;
    const write = (i, point, along, age) => {
      const width = 3.4 + along * 0.17;
      const left = i * 2;
      positions[left * 3] = point.x - point.rx * width;
      positions[left * 3 + 1] = 0;
      positions[left * 3 + 2] = point.z - point.rz * width;
      positions[(left + 1) * 3] = point.x + point.rx * width;
      positions[(left + 1) * 3 + 1] = 0;
      positions[(left + 1) * 3 + 2] = point.z + point.rz * width;
      shape[left * 4] = age;
      shape[left * 4 + 1] = -1;
      shape[(left + 1) * 4] = age;
      shape[(left + 1) * 4 + 1] = 1;
    };
    write(0, { x: bowX, z: bowZ, rx: right.x, rz: right.z }, 0, 0);
    for (let i = 1; i < points; i += 1) {
      const point = trail[Math.min(i - 1, trail.length - 1)];
      write(i, point, i * step, Math.min(1, i / (Math.min(trail.length, points - 1) || 1)));
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aShape.needsUpdate = true;
  }
}

/** Gulls going round overhead. */
function buildGulls(scene) {
  const wing = (side) => {
    const shape = new THREE.BufferGeometry();
    shape.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.5, 0, 0, -0.5, side * 2.1, 0.75, -0.2], 3));
    shape.computeVertexNormals();
    return shape;
  };
  const merged = new THREE.BufferGeometry();
  const a = wing(1).attributes.position.array;
  const b = wing(-1).attributes.position.array;
  merged.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b], 3));
  merged.computeVertexNormals();
  const gulls = new THREE.InstancedMesh(merged, new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }), 12);
  gulls.frustumCulled = false;
  scene.add(gulls);
  return gulls;
}

/* ------------------------------- the whole picture ------------------------------- */

export class Bay {
  /** joze is his character, and pirates are the ones who can be captains of the pirate ships. */
  constructor(canvas, joze, pirates) {
    this.canvas = canvas;
    this.chart = getChart();
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.calm = this.reducedMotion ? 0.35 : 1;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#dff4ff', 700, 2300);
    this.skyLight = new THREE.HemisphereLight('#ffffff', '#9fbf9a', 1.9);
    this.scene.add(this.skyLight);
    const sun = new THREE.DirectionalLight('#fff3dc', 2.1);
    sun.position.set(-0.5, 1, 0.45);
    this.scene.add(sun);
    this.sun = sun;
    this.sunDirection = sun.position.clone().normalize();

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1.5, 6000);
    this.cameraYaw = 0;
    this.lookAside = 0;
    this.viewShare = 0; // From 0 at the title to 1 sailing.
    this.wantedView = 0;
    this.orbit = 0;
    this.time = 0;
    this.seaTime = 0;
    this.frames = 0;
    this.slowFrames = 0;
    this.quality = 2;

    this.island = new Island(this.scene);
    // The island's own ships go round at sea, and they aren't pirates. They'd only confuse things here.
    for (const each of this.island.ships ?? []) each.ship.visible = false;
    this.endRiverAtTheSea();
    this.cleanCloudEdges();
    this.sparks = new Sparks(this.scene);
    this.buildSea();

    this.hero = new HeroShip(joze);
    this.scene.add(this.hero.root);
    this.heroRock = { pitch: 0, roll: 0, y: 0 };

    this.zoneHolder = new THREE.Group();
    this.scene.add(this.zoneHolder);
    this.zones = { left: new FiringZone(this.zoneHolder, 'left', this.water), right: new FiringZone(this.zoneHolder, 'right', this.water) };

    this.fleet = new Map();
    for (const spec of pirates) {
      const ship = new PirateShip(spec);
      ship.lifeboat = new Lifeboat(LOOKS[spec.id]);
      ship.rock = { pitch: 0, roll: 0, y: 0 };
      this.scene.add(ship.root, ship.lifeboat.root);
      this.fleet.set(spec.id, ship);
    }
    this.wakes = { hero: new Wake(this.scene, this.water, this.rippleMap), pirates: [] };
    for (let i = 0; i < 4; i += 1) this.wakes.pirates.push(new Wake(this.scene, this.water, this.rippleMap));

    this.buildBalls();
    const waterHeight = (x, z) => this.waterHeight(x, z);
    this.floats = new Floats(this.scene, this.chart, waterHeight);
    this.dolphins = new Dolphins(this.scene, this.chart, waterHeight, (x, z, size) => this.smallSplash(x, z, size));
    this.coins = new Coins(this.scene, waterHeight);
    this.prizeDrawing = new PrizeDrawing(this.scene, waterHeight, this.reducedMotion);
    this.buildOddBoats();
    this.gulls = buildGulls(this.scene);
    this.gullMatrix = new THREE.Matrix4();
    this.gullAt = new THREE.Vector3();
    this.gullTurn = new THREE.Quaternion();
    this.gullSize = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);

    this.battle = null;
    this.order = [];
    this.smokeIn = new Map();
    this.bowFoamIn = 0;
    this.trailIn = 0;
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
  }

  /** The island's river carries on some way out over the sea, which only shows from sea level. */
  endRiverAtTheSea() {
    const river = new THREE.Color('#46b3e8');
    this.scene.traverse((node) => {
      const colours = node.geometry?.attributes?.color;
      if (!node.isMesh || node.isInstancedMesh || !colours || node.geometry.index) return;
      if (Math.abs(colours.getX(0) - river.r) + Math.abs(colours.getY(0) - river.g) + Math.abs(colours.getZ(0) - river.b) > 0.01) return;
      const position = node.geometry.attributes.position;
      const chart = getChart();
      // Each triangle out over the water closes up to nothing.
      for (let i = 0; i < position.count; i += 3) {
        let onLand = false;
        for (let j = 0; j < 3; j += 1) onLand ||= chart.height(position.getX(i + j), position.getZ(i + j)) > -1.5;
        if (!onLand) for (let j = 0; j < 3; j += 1) position.setXYZ(i + j, 0, -50, 0);
      }
      position.needsUpdate = true;
    });
  }

  /**
   * The clouds' pictures are white on nothing, and nothing is black to a graphics card, so a big close
   * cloud gets a dotted grey edge. From the sea they're much bigger than from a plane, so here they get
   * white all the way across, and only their see-through part changes.
   */
  cleanCloudEdges() {
    const cleaned = new Map();
    this.scene.traverse((node) => {
      const map = node.isSprite ? node.material.map : null;
      if (!map?.image?.getContext) return;
      if (!cleaned.has(map)) {
        const { width, height } = map.image;
        const { data } = map.image.getContext('2d').getImageData(0, 0, width, height);
        for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = 255;
        const texture = new THREE.DataTexture(new Uint8Array(data.buffer), width, height);
        texture.flipY = true;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        cleaned.set(map, texture);
      }
      node.material.map = cleaned.get(map);
    });
  }

  buildSea() {
    const { scene, island } = this;
    // The island's sea stays underneath, out to the horizon, just below the lowest of the waves here,
    // which are drawn over it.
    scene.traverse((node) => {
      if (node.isMesh && node.material?.map === island.water) {
        node.position.y = -SWELL_HEIGHT - 0.4;
        node.renderOrder = -2;
      }
    });
    this.rippleMap = { value: island.water };
    this.water = {
      uTime: { value: 0 },
      uSize: { value: SWELL_HEIGHT * (this.reducedMotion ? 0.5 : 1) },
      uChart: { value: chartTexture() },
      uChartCells: { value: CHART.cells },
      uChartCell: { value: CHART.cell },
      uChartReach: { value: CHART.reach },
    };
    this.seaUniforms = {
      ...this.water,
      uRipple: this.rippleMap,
      uRippleAt: { value: new THREE.Vector2() },
      uSun: { value: new THREE.Vector3(-0.5, 1, 0.45).normalize() },
      uSkyTint: { value: new THREE.Color('#bfe7fb') },
      uShallow: { value: new THREE.Color('#7fdcd2') },
      uFog: { value: new THREE.Color('#dff4ff') },
      uFogRange: { value: new THREE.Vector2(700, 2300) },
      uMiddle: { value: new THREE.Vector2() },
      uReach: { value: 500 },
    };
    this.seaMaterial = new THREE.ShaderMaterial({
      uniforms: this.seaUniforms,
      vertexShader: SEA_VERTEX,
      fragmentShader: SEA_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.setSeaSize(SEA.cells, SEA.cell);
  }

  setSeaSize(cells, cell) {
    if (this.sea) {
      this.scene.remove(this.sea);
      this.sea.geometry.dispose();
    }
    this.seaCell = cell;
    const size = cells * cell;
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(size, size, cells, cells).rotateX(-Math.PI / 2), this.seaMaterial);
    this.sea.frustumCulled = false;
    this.sea.renderOrder = -1;
    this.seaUniforms.uReach.value = size / 2;
    this.scene.add(this.sea);
  }

  buildBalls() {
    const shape = new THREE.SphereGeometry(1, 12, 9);
    const dark = new THREE.MeshLambertMaterial({ color: '#23252e' });
    const gold = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
    this.theirBalls = new THREE.InstancedMesh(shape, dark, MOST_BALLS);
    this.myBalls = new THREE.InstancedMesh(shape, gold, MOST_BALLS);
    // The power-ups' balls: a big orange bouncing one, a see-through bubble and a snowball.
    this.powerBalls = {
      bounce: { mesh: new THREE.InstancedMesh(shape, new THREE.MeshLambertMaterial({ color: '#ff9f43' }), MOST_BALLS), size: 2.5 },
      bubble: { mesh: new THREE.InstancedMesh(shape, new THREE.MeshBasicMaterial({ color: '#a8e2ff', transparent: true, opacity: 0.6, depthWrite: false }), MOST_BALLS), size: 2.7 },
      snow: { mesh: new THREE.InstancedMesh(shape, new THREE.MeshLambertMaterial({ color: '#eef6ff' }), MOST_BALLS), size: 1.9 },
    };
    for (const mesh of [this.theirBalls, this.myBalls, ...Object.values(this.powerBalls).map((each) => each.mesh)]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.scene.add(mesh);
    }
    this.ballMatrix = new THREE.Matrix4();
    this.ballAt = new THREE.Vector3();
    this.ballTurn = new THREE.Quaternion();
    this.ballSize = new THREE.Vector3();

    // A ring on the water where each of their balls is coming down, closing in as it lands.
    const ring = new THREE.RingGeometry(0.82, 1, 28).rotateX(-Math.PI / 2);
    this.targets = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: '#ff6a3c', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }), MOST_BALLS);
    this.targets.frustumCulled = false;
    this.targets.count = 0;
    this.targets.renderOrder = 1;
    this.scene.add(this.targets);

    // Rings going out from a splash.
    this.rings = Array.from({ length: MOST_RINGS }, () => {
      const mesh = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      return { mesh, left: 0, total: 1, size: 1 };
    });
    this.nextRing = 0;
  }

  /** How high the water is here right now, just as it's drawn, with smaller waves over the shallows. */
  waterHeight(x, z) {
    const land = this.chart.height(x, z);
    const shallow = clamp((land + 18) / 15, 0, 1);
    return swellAt(x, z, this.seaTime) * this.water.uSize.value * (1 - 0.8 * shallow * shallow * (3 - 2 * shallow));
  }

  /** A new battle, or null for none. order says who's the captain of each pirate ship in turn. */
  setBattle(battle, order = []) {
    this.battle = battle;
    this.order = order;
    this.smokeIn.clear();
    for (const ship of this.fleet.values()) {
      ship.reset();
      ship.root.scale.setScalar(1);
      ship.lifeboat.root.visible = false;
      ship.lifeboat.captain = null;
      ship.wake = null;
    }
    for (const wake of this.wakes.pirates) wake.clear();
    this.wakes.hero.clear();
    for (const boat of this.oddBoats.values()) boat.root.visible = false;
    this.oddFor = new Map();
    for (const bubble of this.bubbles) bubble.visible = false;
    this.shapeZones();
    this.setWeather(battle?.plan ?? {});
    this.hero.joze.setExpression('happy');
    this.cheering = false;
    if (battle) this.cameraYaw = battle.heading;
  }

  /** The rafts and submarines of the higher levels, and the bubbles that trap ships, and the child's shield. */
  buildOddBoats() {
    this.oddBoats = new Map(); // By what it is and whose it is, as 'raft:kit'.
    this.oddFor = new Map(); // Which of them each pirate is.
    const bubbleShape = new THREE.SphereGeometry(1, 24, 16);
    this.bubbles = Array.from({ length: 8 }, () => {
      const mesh = new THREE.Mesh(bubbleShape, bubbleMaterial('#9fdcff'));
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      return mesh;
    });
    this.shield = new THREE.Mesh(bubbleShape, bubbleMaterial('#7cc8ff'));
    this.shield.visible = false;
    this.shield.renderOrder = 2;
    this.scene.add(this.shield);
    this.shieldShare = 0;
    this.bubbleShares = new WeakMap();
  }

  /** A raft or a submarine in a captain's colours, made the first time it's needed and kept. */
  oddBoatFor(pirate) {
    const kind = pirate.kind === 'little' ? 'raft' : pirate.kind;
    if (!this.oddFor.has(pirate)) {
      const captain = this.order[pirate.index % this.order.length];
      // Each little raft needs its own, and there are two of them.
      const used = new Set(this.oddFor.values());
      let number = 0;
      let key = `${kind}:${captain}:${number}`;
      while (used.has(this.oddBoats.get(key))) {
        number += 1;
        key = `${kind}:${captain}:${number}`;
      }
      if (!this.oddBoats.has(key)) {
        const look = LOOKS[captain] ?? LOOKS.kit;
        const boat = kind === 'sub' ? new Submarine(look) : new Raft(look);
        boat.rock = { pitch: 0, roll: 0, y: 0 };
        boat.dive = 0;
        this.scene.add(boat.root);
        this.oddBoats.set(key, boat);
      }
      this.oddFor.set(pirate, this.oddBoats.get(key));
    }
    return this.oddFor.get(pirate);
  }

  /** The weather the level brings. It's set once for a battle, so the brightness never changes during one. */
  setWeather({ mist = false, sunset = false } = {}) {
    const weather = { ...CLEAR, ...(mist ? MIST : {}), ...(sunset ? SUNSET : {}) };
    if (mist && sunset) weather.dome = SUNSET.dome;
    this.weather = mist ? (sunset ? 'sunset' : 'mist') : sunset ? 'sunset' : 'clear';
    this.scene.fog.color.set(weather.fog);
    this.scene.fog.near = weather.near;
    this.scene.fog.far = weather.far;
    this.seaUniforms.uFog.value.set(weather.fog);
    this.seaUniforms.uFogRange.value.set(weather.near, weather.far);
    this.seaUniforms.uSkyTint.value.set(weather.tint);
    this.skyLight.color.set(weather.sky);
    this.skyLight.groundColor.set(weather.ground);
    this.skyLight.intensity = weather.light;
    this.sun.color.set(weather.sun);
    this.sun.intensity = weather.sunLight;
    if (this.island.dome?.material) this.island.dome.material.color.set(weather.dome);
  }

  shapeZones() {
    const { battle, zones } = this;
    if (!battle) return;
    zones.left.setShape(battle.level.zone);
    zones.right.setShape(battle.level.zone);
  }

  shipFor(pirate) {
    return this.fleet.get(this.order[pirate.index % this.order.length]) ?? null;
  }

  /** Where something in the world is on the screen, in pixels, and whether it's behind the camera. */
  project(x, y, z) {
    const at = this.projecting.set(x, y, z);
    at.project(this.camera);
    return { x: ((at.x + 1) / 2) * this.width, y: ((1 - at.y) / 2) * this.height, behind: at.z > 1 };
  }

  /** Which way something on the water is from the way the camera is looking: right is positive. */
  offCamera(x, z) {
    const { position } = this.camera;
    return turnBetween(Math.atan2(x - position.x, -(z - position.z)), this.cameraYaw);
  }

  /* ---------- effects: small shapes and soft smoke, where something happened ---------- */

  puffs(at, { count = 4, colours = ['#ece8e0'], size = 3, speed = 5, up = 0.6, life = 0.9, grow = 3, opacity = 0.7, velocity = [0, 0, 0], gravity = 0, shape = 'puff' }) {
    const total = Math.max(1, Math.round(count * (this.reducedMotion ? 0.5 : 1)));
    for (let i = 0; i < total; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const push = speed * between(0.4, 1.1);
      this.sparks.emit({
        shape,
        colour: colours[i % colours.length],
        at,
        velocity: [velocity[0] + Math.cos(angle) * push, velocity[1] + up * push, velocity[2] + Math.sin(angle) * push],
        life: life * between(0.8, 1.2),
        size: size * between(0.8, 1.2),
        grow,
        spin: between(-1.5, 1.5),
        opacity,
        drag: 1.2,
        gravity,
      });
    }
  }

  ringAt(x, z, size, seconds = 1.1) {
    const ring = this.rings[this.nextRing];
    this.nextRing = (this.nextRing + 1) % this.rings.length;
    ring.left = seconds;
    ring.total = seconds;
    ring.size = size;
    ring.mesh.visible = true;
    ring.mesh.position.set(x, 1.1, z);
    ring.mesh.scale.setScalar(size * 0.4);
  }

  /** A gun's soft white smoke, out from the side of the ship. */
  gunSmoke(x, y, z, outX, outZ) {
    this.puffs({ x, y, z }, { count: 3, colours: ['#fbf9f4', '#ece8e0'], size: 3.2, speed: 3, up: 0.3, life: 1, grow: 5.5, opacity: 0.62, velocity: [outX * 11, 1.6, outZ * 11] });
  }

  splash(x, z, size = 1) {
    const at = { x, y: 1.5, z };
    if (getChart().height(x, z) > 0) {
      this.puffs(at, { count: 3, colours: ['#d9c9a0'], size: 2.4 * size, speed: 3.5, life: 0.7, grow: 2.2, opacity: 0.6 });
      return;
    }
    this.puffs(at, { count: 7, colours: ['#ffffff', '#e7f6ff'], size: 2.4 * size, speed: 5.5 * size, up: 2.1, life: 0.95, grow: 1.5, opacity: 0.92, gravity: 15 });
    this.ringAt(x, z, 9 * size);
  }

  /** A little one, for a dolphin going in. */
  smallSplash(x, z, size) {
    this.puffs({ x, y: 1, z }, { count: 3, colours: ['#ffffff'], size: 1.8 * size, speed: 4, up: 1.6, life: 0.7, grow: 1.4, opacity: 0.85, gravity: 13 });
    this.ringAt(x, z, 7 * size, 0.8);
  }

  /** Some gold picked up: a few gold shapes where it was. */
  onGold({ x, z }) {
    for (let i = 0; i < (this.reducedMotion ? 2 : 4); i += 1) {
      const angle = (i / 4) * Math.PI * 2 + Math.random();
      this.sparks.emit({ shape: i % 2 ? 'star' : 'spark', colour: '#ffd23f', at: { x, y: 5, z }, velocity: [Math.cos(angle) * 7, between(6, 11), Math.sin(angle) * 7], life: 0.55, size: 2.2, spin: 4, gravity: 10 });
    }
  }

  /** What's happening in the battle: main.js passes everything on. */
  onEvent(event) {
    const handlers = {
      fire: () => {
        const { from, side } = event;
        const across = rightOf(this.battle.heading);
        const sign = side === 'right' ? 1 : -1;
        this.gunSmoke(from.x + across.x * sign * 3, from.y + this.heroRock.y, from.z + across.z * sign * 3, across.x * sign, across.z * sign);
      },
      'pirate-fire': () => {
        const { ball, pirate } = event;
        const across = rightOf(pirate.heading);
        const sign = pirate.burstSide;
        this.gunSmoke(ball.from.x, ball.from.y, ball.from.z, across.x * sign, across.z * sign);
      },
      hit: () => this.onHit(event),
      beaten: () => this.onBeaten(event),
      splash: () => this.splash(event.x, event.z, event.size),
      hurt: () => this.onHurt(event),
      gold: () => this.onGold(event),
      won: () => this.onWon(),
      prize: () => this.onPrize(event),
      'little-beaten': () => this.onLittleBeaten(event),
      split: () => this.pieces(event.pirate, ['#b8743a', '#c99458'], 6),
      'sail-down': () => this.onSailDown(event),
      smoke: () => this.puffs({ x: event.pirate.x, y: 10, z: event.pirate.z }, { count: 6, colours: ['#b9b4ad', '#cdc8c1'], size: 9, speed: 4, up: 0.5, life: 1.8, grow: 5, opacity: 0.5 }),
      dive: () => this.smallSplash(event.pirate.x, event.pirate.z, 1.3),
      surface: () => this.smallSplash(event.pirate.x, event.pirate.z, 1.3),
      bubbled: () => this.puffs({ x: event.pirate.x, y: 8, z: event.pirate.z }, { count: 4, shape: 'bubble', colours: ['#ffffff', '#cdeeff'], size: 2.6, speed: 5, up: 1.2, life: 0.9, grow: 1.3, opacity: 0.8 }),
      frosted: () => this.puffs({ x: event.pirate.x, y: 14, z: event.pirate.z }, { count: 4, shape: 'snow', colours: ['#ffffff', '#e6f4ff'], size: 2.4, speed: 5, up: 1, life: 1, grow: 1, opacity: 0.9, gravity: 4 }),
      blocked: () => {
        this.ringAt(event.x, event.z, 10, 0.9);
        this.puffs({ x: event.x, y: 6, z: event.z }, { count: 3, shape: 'bubble', colours: ['#cdeeff'], size: 2.4, speed: 5, up: 1.2, life: 0.8, grow: 1.2, opacity: 0.75 });
      },
      power: () => this.onPower(event),
    };
    handlers[event.type]?.();
  }

  /** Something picked up: a few small shapes in its own colour, where it was. */
  onPrize({ prize }) {
    const colours = { gem: ['#4cc3ff', '#ff6fae', '#62e38a'], heart: ['#f0506e'], key: ['#f2b830'], chest: ['#f2b830', '#4cc3ff'], cage: ['#ffd23f', '#2f6fed'], power: [POWER_LOOKS[prize.power]?.colour ?? '#ffd23f'] }[prize.kind] ?? ['#ffd23f'];
    const count = prize.kind === 'chest' || prize.kind === 'cage' ? 6 : 3;
    for (let i = 0; i < (this.reducedMotion ? Math.ceil(count / 2) : count); i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random();
      this.sparks.emit({ shape: prize.kind === 'heart' ? 'star' : i % 2 ? 'star' : 'spark', colour: colours[i % colours.length], at: { x: prize.x, y: 6, z: prize.z }, velocity: [Math.cos(angle) * 6, between(6, 10), Math.sin(angle) * 6], life: 0.6, size: 2.2, spin: 4, gravity: 10 });
    }
    if (prize.kind === 'cage') {
      this.hero.joze.setExpression('happy');
      this.cheerLeft = 1.4;
    }
  }

  /** Planks and barrels from a raft coming apart: small brown shapes, and a little smoke. */
  pieces(pirate, colours, count) {
    for (let i = 0; i < (this.reducedMotion ? Math.ceil(count / 2) : count); i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random();
      this.sparks.emit({ shape: 'rock', colour: colours[i % colours.length], at: { x: pirate.x, y: 4, z: pirate.z }, velocity: [Math.cos(angle) * 8, between(5, 9), Math.sin(angle) * 8], life: 0.7, size: 2, spin: 4, gravity: 14 });
    }
    this.puffs({ x: pirate.x, y: 5, z: pirate.z }, { count: 3, colours: ['#a59e95', '#bdb7ae'], size: 5, speed: 3, life: 1.2, grow: 4, opacity: 0.5 });
  }

  onLittleBeaten({ pirate }) {
    this.pieces(pirate, ['#b8743a', '#c99458'], 4);
    this.hero.joze.setExpression('happy');
  }

  /** One of the pirate king's sails coming down, in a soft puff of its own colour. */
  onSailDown({ pirate }) {
    const look = LOOKS[this.order[pirate.index % this.order.length]];
    this.puffs({ x: pirate.x, y: 26, z: pirate.z }, { count: 4, colours: [look?.sail[1] ?? '#ffffff', '#ece8e0'], size: 5, speed: 4, up: 0.2, life: 1.2, grow: 3, opacity: 0.6, gravity: 3 });
  }

  /** A power-up picked up: a few shapes in its colour round the child's ship. */
  onPower({ kind }) {
    const { battle } = this;
    const colour = POWER_LOOKS[kind]?.colour ?? '#ffd23f';
    for (let i = 0; i < (this.reducedMotion ? 3 : 6); i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      this.sparks.emit({ shape: 'star', colour, at: { x: battle.x + Math.cos(angle) * 10, y: 12, z: battle.z + Math.sin(angle) * 10 }, velocity: [Math.cos(angle) * 4, between(5, 8), Math.sin(angle) * 4], life: 0.8, size: 2.4, spin: 3, gravity: 8 });
    }
  }

  onHit({ pirate, x, y, z }) {
    const ship = this.shipFor(pirate);
    ship?.captain.setExpression('hurt', 0.45);
    const at = { x, y: y + 1, z };
    const count = this.reducedMotion ? 2 : 4;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random();
      this.sparks.emit({
        shape: i % 2 ? 'star' : 'rock',
        colour: i % 2 ? '#ffd23f' : ['#a8783f', '#c99458'][i % 4 === 0 ? 0 : 1],
        at,
        velocity: [Math.cos(angle) * 9, between(5, 11), Math.sin(angle) * 9],
        life: 0.55,
        size: 2.1,
        spin: 4,
        drag: 0.6,
        gravity: 14,
      });
    }
    this.puffs(at, { count: 1, colours: ['#bdb7ae'], size: 3, speed: 2, life: 0.7, grow: 3, opacity: 0.55 });
  }

  /** It doesn't blow up. Soft grey smoke rises, and its crew are off in the lifeboat. */
  onBeaten({ pirate, boat }) {
    const ship = this.shipFor(pirate);
    if (!ship) return;
    this.watching = pirate;
    this.watchLeft = WATCH_SECONDS;
    // A raft has nobody on it: it comes apart into two little ones.
    if (!boat) {
      this.pieces(pirate, ['#b8743a', '#c99458'], 6);
      this.hero.joze.setExpression('happy');
      this.cheerLeft = 1.8;
      return;
    }
    ship.lifeboat.board(ship.captain);
    ship.lifeboat.place(boat.x, 0.1, boat.z, boat.heading);
    this.puffs({ x: pirate.x, y: 9, z: pirate.z }, { count: 8, colours: ['#a59e95', '#8a837b', '#bdb7ae'], size: 7, speed: 5, up: 1.2, life: 1.8, grow: 5, opacity: 0.55 });
    this.hero.joze.setExpression('happy');
    this.cheerLeft = 1.8;
  }

  onHurt({ x, z }) {
    this.puffs({ x, y: 8, z }, { count: 3, colours: ['#bdb7ae', '#d8d3cc'], size: 3.4, speed: 4, life: 0.8, grow: 3, opacity: 0.6 });
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + Math.random();
      this.sparks.emit({ shape: 'rock', colour: '#c99458', at: { x, y: 9, z }, velocity: [Math.cos(angle) * 8, between(6, 12), Math.sin(angle) * 8], life: 0.6, size: 1.8, spin: 5, gravity: 16 });
    }
    this.hero.joze.setExpression('hurt', 0.7);
  }

  onWon() {
    this.cheering = true;
    this.hero.joze.setExpression('happy');
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
      this.floats.showFewer();
      this.setSeaSize(SEA.cellsLow, SEA.cellLow);
      this.gulls.visible = false;
      this.dolphins.mesh.visible = false;
      for (const ship of [this.hero, ...this.fleet.values()]) ship.ropes.visible = false;
    }
  }

  /** How a ship rides the waves where it is, which is smoothed, as a ship is too big to follow every one. */
  rideWaves(rock, x, z, heading, dt, { rollMore = 0, pitchMore = 0 } = {}) {
    const { calm } = this;
    const forward = forwardOf(heading);
    const right = rightOf(heading);
    const height = (ahead, across) => this.waterHeight(x + forward.x * ahead + right.x * across, z + forward.z * ahead + right.z * across);
    const bow = height(15, 0);
    const stern = height(-15, 0);
    const port = height(0, -6);
    const starboard = height(0, 6);
    const pitch = Math.atan2(bow - stern, 30) * 1.1 + Math.sin(this.time * 0.62) * 0.016 * calm + pitchMore;
    const roll = Math.atan2(starboard - port, 12) * 0.55 + Math.sin(this.time * 0.85) * 0.035 * calm + rollMore;
    const y = (bow + stern + port + starboard) / 4;
    rock.pitch = damp(rock.pitch, pitch, 3, dt);
    rock.roll = damp(rock.roll, roll, 3, dt);
    rock.y = damp(rock.y, y, 4, dt);
    return rock;
  }

  placeHero(dt) {
    const { battle, hero, heroRock, calm } = this;
    const x = battle?.x ?? 0;
    const z = battle?.z ?? 0;
    const heading = battle?.heading ?? 0;
    const wobble = battle?.hurtLeft > 0 ? Math.sin(this.time * 13) * 0.05 * Math.min(1, battle.hurtLeft) * calm : 0;
    this.rideWaves(heroRock, x, z, heading, dt, { rollMore: (battle?.turning ?? 0) * 0.075 * calm + wobble });
    const way = battle ? battle.speed / battle.pace.speed : 0;
    hero.place(x, heroRock.y - 0.1, z, {
      heading,
      pitch: heroRock.pitch,
      roll: heroRock.roll,
      sails: battle?.sails ?? 0,
      wind: 0.45 + way * 0.55,
    });
    hero.updateFlags(dt, 0.4 + 0.6 * calm);
    hero.showRescued(battle?.stats.sailors ?? 0);

    // Joze keeps an eye on whoever's being fired at, and otherwise looks about and back at the child.
    const target = battle?.zones.right.target ?? battle?.zones.left.target ?? null;
    let look = 0.32 + Math.sin(this.time * 0.37) * 0.4 * calm;
    if (target) {
      const off = turnBetween(Math.atan2(target.x - x, -(target.z - z)), heading);
      look = clamp(off + 0.32, -1.5, 1.5);
    }
    this.cheerLeft = Math.max(0, (this.cheerLeft ?? 0) - dt);
    hero.updateJoze(dt, {
      wheel: battle?.wheel ?? 0,
      roll: heroRock.roll,
      pitch: heroRock.pitch,
      look,
      hurt: battle?.hurtLeft ?? 0,
      cheering: this.cheering || this.cheerLeft > 0,
      calm,
      time: this.time,
    });

    this.wakes.hero.update(x, z, heading, way, dt);
    this.zoneHolder.position.set(x, 0, z);
    this.zoneHolder.rotation.y = -heading;
    if (battle) {
      const ready = battle.canFire;
      for (const side of ['left', 'right']) {
        const { firing, inside } = battle.zones[side];
        this.zones[side].update(dt, { firing, inside, ready, calm });
      }
    }
    this.zoneHolder.visible = Boolean(battle) && battle.state === 'sailing';

    // Spray coming off the bow as it goes along.
    this.bowFoamIn -= dt;
    if (way > 0.3 && this.bowFoamIn <= 0 && this.quality > 0) {
      this.bowFoamIn = 0.13 / way;
      const forward = forwardOf(heading);
      const right = rightOf(heading);
      const side = Math.random() < 0.5 ? -1 : 1;
      this.puffs({ x: x + forward.x * 19 + right.x * side * 2, y: 1.2 + heroRock.y, z: z + forward.z * 19 + right.z * side * 2 }, {
        count: 1,
        colours: ['#ffffff'],
        size: 2.2,
        speed: 0,
        life: 0.7,
        grow: 2,
        opacity: 0.72,
        velocity: [right.x * side * 5 + forward.x * this.battle.speed * 0.5, 3.4, right.z * side * 5 + forward.z * this.battle.speed * 0.5],
        gravity: 9,
      });
    }
  }

  /** Before anything has begun, a pirate ship out on the other side of the title card, coming this way. */
  placeTitlePirate(dt) {
    const { battle, calm } = this;
    const [ship] = this.fleet.values();
    ship.root.visible = this.wantedView === 0 && this.viewShare < 0.5;
    if (!ship.root.visible) return;
    const yaw = battle.heading + TITLE_VIEW.yaw;
    const forward = forwardOf(yaw);
    const right = rightOf(yaw);
    const x = battle.x + forward.x * 170 + right.x * -205;
    const z = battle.z + forward.z * 170 + right.z * -205;
    const heading = yaw + 1.9;
    this.rideWaves(ship.rock, x, z, heading, dt);
    ship.place(x, ship.rock.y - 0.1, z, { heading, pitch: ship.rock.pitch, roll: ship.rock.roll, sails: 1, wind: 1 });
    ship.updateFlags(dt, 0.4 + 0.6 * calm);
    ship.updateCaptain(dt, { direction: Math.atan2(battle.x - x, -(battle.z - z)), heading, calm });
  }

  placePirates(dt) {
    const { battle, camera, calm } = this;
    if (!battle) return;
    if (battle.state === 'ready') {
      this.placeTitlePirate(dt);
      return;
    }
    const seen = new Set();
    let wake = 0;
    let bubble = 0;
    for (const pirate of battle.pirates) {
      // A bubble grows and fades gently, however often the bubble shot tops it up.
      const shown = damp(this.bubbleShares.get(pirate) ?? 0, pirate.bubbled > 0.35 && pirate.state === 'sailing' ? 1 : 0, 3, dt);
      this.bubbleShares.set(pirate, shown);
      if (shown > 0.01 && bubble < this.bubbles.length) this.placeBubble(this.bubbles[bubble++], pirate, shown);
      if (pirate.smoke > 0) this.smokeScreen(pirate, dt);
      if (ODD_KINDS.has(pirate.kind)) {
        const boat = this.oddBoatFor(pirate);
        seen.add(boat);
        this.placeOddBoat(pirate, boat, dt);
        if (pirate.state === 'sailing' && !pirate.under && wake < this.wakes.pirates.length) {
          this.wakes.pirates[wake].update(pirate.x, pirate.z, pirate.heading, pirate.speed / battle.pace.speed, dt);
          wake += 1;
        }
        continue;
      }
      const ship = this.shipFor(pirate);
      if (!ship) continue;
      seen.add(ship);
      ship.root.visible = true;
      const sink = pirate.sink;
      const lean = pirate.way ?? 1;
      const wobble = pirate.hitLeft > 0 ? Math.sin(this.time * 12) * 0.05 * (pirate.hitLeft / 0.35) * calm : 0;
      this.rideWaves(ship.rock, pirate.x, pirate.z, pirate.heading, dt, { rollMore: (pirate.turning ?? 0) * 0.07 * calm + wobble + sink * lean * 0.62, pitchMore: sink * 0.28 });
      const going = pirate.speed / battle.pace.speed;
      ship.place(pirate.x, ship.rock.y - 0.1 - sink * 5 - sink * sink * sink * 40, pirate.z, {
        heading: pirate.heading,
        pitch: ship.rock.pitch,
        roll: ship.rock.roll,
        sails: pirate.state === 'sinking' ? pirate.sails : 1,
        wind: 0.5 + clamp(going, 0, 1) * 0.5,
      });
      // A quick little sloop or a big flagship, on the higher levels.
      ship.root.scale.setScalar(SHIP_KINDS[pirate.kind]?.size ?? 1);
      this.dressShip(ship, pirate, dt);

      const away = Math.hypot(pirate.x - camera.position.x, pirate.z - camera.position.z);
      const near = away < NEAR_CAPTAIN[this.quality];
      ship.updateFlags(dt, near ? 0.4 + 0.6 * calm : 0);
      if (pirate.state === 'sailing') {
        ship.captain.root.visible = near;
        if (near) {
          ship.updateCaptain(dt, {
            direction: Math.atan2(battle.x - pirate.x, -(battle.z - pirate.z)),
            heading: pirate.heading,
            excited: pirate.mode === 'side' ? 1 : 0,
            calm,
          });
        }
        if (wake < this.wakes.pirates.length) {
          this.wakes.pirates[wake].update(pirate.x, pirate.z, pirate.heading, going, dt);
          wake += 1;
        }
      } else {
        this.smokeFrom(pirate, ship, dt);
      }
    }
    for (let i = wake; i < this.wakes.pirates.length; i += 1) this.wakes.pirates[i].clear();
    for (let i = bubble; i < this.bubbles.length; i += 1) this.bubbles[i].visible = false;
    for (const [id, ship] of this.fleet) {
      if (!seen.has(ship) && ship.root.visible) {
        ship.root.visible = false;
        this.smokeIn.delete(id);
      }
    }
    for (const [pirate, boat] of this.oddFor) {
      if (!seen.has(boat)) {
        boat.root.visible = false;
        this.oddFor.delete(pirate);
      }
    }
    for (const ship of this.fleet.values()) ship.rowing = false;
    for (const boat of battle.boats) this.placeBoat(boat, dt);
    for (const ship of this.fleet.values()) {
      if (!ship.rowing) ship.lifeboat.root.visible = false;
    }
  }

  /**
   * What the higher levels add to a pirate ship: the king's crown and the sails knocked down one at a
   * time, and pale sails while it's slowed by snow.
   */
  dressShip(ship, pirate, dt) {
    const king = pirate.kind === 'king';
    if (king && !ship.crown) {
      ship.crown = kingsCrown();
      ship.crown.position.set(0, 44.5, 3.5);
      ship.body.add(ship.crown);
    }
    if (ship.crown) ship.crown.visible = king;
    if (king) {
      ship.sailShares ??= [1, 1, 1, 1];
      const going = pirate.state === 'sinking' ? pirate.sails : 1;
      KING_SAILS.forEach((sail, order) => {
        const wanted = order < 4 - pirate.partsLeft ? 0 : going;
        ship.sailShares[sail] = damp(ship.sailShares[sail], wanted, 2.2, dt);
        ship.sails[sail]?.set(ship.sailShares[sail], 0.8);
      });
    } else {
      ship.sailShares = null;
    }
    ship.sailPaint.color.lerp(pirate.frosted > 0 ? FROST_SAILS : WHITE, 1 - Math.exp(-dt * 3));
    if (pirate.frosted > 0 && Math.random() < dt * (this.reducedMotion ? 2 : 4)) {
      this.sparks.emit({ shape: 'snow', colour: '#ffffff', at: { x: pirate.x + between(-8, 8), y: between(14, 30), z: pirate.z + between(-8, 8) }, velocity: [0, -3, 0], life: 1.2, size: 1.6, spin: 1, opacity: 0.9 });
    }
  }

  /** A raft, a little raft or a submarine, on the water or under it. */
  placeOddBoat(pirate, boat, dt) {
    const { calm, battle } = this;
    boat.root.visible = true;
    const sink = pirate.sink;
    const wobble = pirate.hitLeft > 0 ? Math.sin(this.time * 12) * 0.05 * (pirate.hitLeft / 0.35) * calm : 0;
    this.rideWaves(boat.rock, pirate.x, pirate.z, pirate.heading, dt, { rollMore: (pirate.turning ?? 0) * 0.06 * calm + wobble + sink * 0.3, pitchMore: sink * 0.2 });
    boat.dive = damp(boat.dive, pirate.under ? 1 : 0, 1.6, dt);
    const going = clamp(pirate.speed / battle.pace.speed, 0, 1);
    const y = boat.rock.y - 0.6 - boat.dive * 11.5 - sink * 4 - sink * sink * sink * 26;
    boat.place(pirate.x, y, pirate.z, { heading: pirate.heading, pitch: boat.rock.pitch, roll: boat.rock.roll, sails: pirate.state === 'sinking' ? pirate.sails : 1, wind: 0.5 + going * 0.5 });
    boat.root.scale.setScalar(SHIP_KINDS[pirate.kind]?.size ?? 1);
    boat.updateFlags(dt, 0.4 + 0.6 * calm);
    if (boat.sailPaint) boat.sailPaint.color.lerp(pirate.frosted > 0 ? FROST_SAILS : WHITE, 1 - Math.exp(-dt * 3));
    // Bubbles come up from a submarine under the water, so it can be followed.
    if (pirate.under && pirate.state === 'sailing') {
      boat.bubbleIn = (boat.bubbleIn ?? 0) - dt;
      if (boat.bubbleIn <= 0) {
        boat.bubbleIn = this.reducedMotion ? 0.5 : 0.25;
        this.sparks.emit({ shape: 'bubble', colour: '#ffffff', at: { x: pirate.x + between(-4, 4), y: 1.2, z: pirate.z + between(-4, 4) }, velocity: [0, 2.5, 0], life: 0.9, size: 1.8, grow: 1.2, opacity: 0.8 });
      }
    }
    if (pirate.state === 'sinking') this.smokeFrom(pirate, boat, dt);
  }

  /** A see-through bubble round a ship that's been caught in one, which grows and shrinks gently. */
  placeBubble(mesh, pirate, share) {
    const size = SHIP_KINDS[pirate.kind]?.size ?? 1;
    mesh.visible = true;
    const bob = Math.sin(this.time * 2) * 0.6 * this.calm;
    mesh.position.set(pirate.x, 9 * size + bob, pirate.z);
    mesh.rotation.set(0, -pirate.heading, 0);
    mesh.scale.set(15 * size * (0.85 + 0.15 * share), 20 * size * (0.85 + 0.15 * share), 25 * size * (0.85 + 0.15 * share));
    mesh.material.uniforms.uOpacity.value = share;
  }

  /** A smoke ship's smoke, soft and grey, all round it for a moment. */
  smokeScreen(pirate, dt) {
    pirate.smokeIn = (pirate.smokeIn ?? 0) - dt;
    if (pirate.smokeIn > 0) return;
    pirate.smokeIn = this.reducedMotion ? 0.2 : 0.1;
    const size = SHIP_KINDS[pirate.kind]?.size ?? 1;
    this.puffs({ x: pirate.x + between(-14, 14) * size, y: between(4, 16), z: pirate.z + between(-16, 16) * size }, { count: 1, colours: ['#b9b4ad', '#cdc8c1', '#a8a39c'], size: 9, speed: 1.4, up: 0.6, life: 2, grow: 4, opacity: 0.5 });
  }

  /** The child's shield bubble, while it lasts. */
  placeShield(dt) {
    const { battle, hero } = this;
    const on = battle?.power?.kind === 'shield' && battle.state === 'sailing';
    this.shieldShare = damp(this.shieldShare, on ? 1 : 0, 3, dt);
    this.shield.visible = this.shieldShare > 0.01;
    if (!this.shield.visible) return;
    this.shield.position.set(hero.root.position.x, 9 + this.heroRock.y, hero.root.position.z);
    this.shield.rotation.set(0, -battle.heading, 0);
    this.shield.scale.set(15, 17, 27);
    this.shield.material.uniforms.uOpacity.value = 0.85 * this.shieldShare;
  }

  /** Soft grey smoke going up from a ship that's going down. */
  smokeFrom(pirate, ship, dt) {
    const wait = (this.smokeIn.get(ship) ?? 0) - dt;
    this.smokeIn.set(ship, wait);
    if (wait > 0 || pirate.sink > 0.88) return;
    this.smokeIn.set(ship, this.reducedMotion ? 0.34 : 0.17);
    this.puffs({ x: pirate.x + between(-8, 8), y: 9 - pirate.sink * 7, z: pirate.z + between(-8, 8) }, { count: 1, colours: ['#8a837b', '#a59e95', '#bdb7ae'], size: 6, speed: 1.2, up: 3, life: 2.4, grow: 5.5, opacity: 0.46 });
  }

  placeBoat(boat, dt) {
    const { battle, calm } = this;
    const ship = this.fleet.get(this.order[boat.index % this.order.length]);
    if (!ship) return;
    ship.rowing = true;
    const { lifeboat } = ship;
    lifeboat.root.visible = true;
    const y = this.waterHeight(boat.x, boat.z) * 0.9;
    lifeboat.place(boat.x, y, boat.z, boat.heading);
    lifeboat.update(dt, {
      size: clamp(boat.left / 1.4, 0, 1) * 1.5,
      calm,
      towards: Math.atan2(battle.x - boat.x, -(battle.z - boat.z)),
      heading: boat.heading,
    });
  }

  drawBalls(dt) {
    const { battle, ballMatrix, ballAt, ballTurn, ballSize, theirBalls, myBalls, targets } = this;
    const balls = battle?.balls ?? [];
    const shots = battle?.shots ?? [];
    const theirs = Math.min(balls.length, MOST_BALLS);
    for (let i = 0; i < theirs; i += 1) {
      const ball = balls[i];
      ballAt.set(ball.x, ball.y, ball.z);
      ballSize.setScalar(1.75);
      theirBalls.setMatrixAt(i, ballMatrix.compose(ballAt, ballTurn, ballSize));
      // It closes in on where the ball will land.
      ballAt.set(ball.to.x, 1.2, ball.to.z);
      ballSize.setScalar(4 + (1 - ball.t) * 11);
      targets.setMatrixAt(i, ballMatrix.compose(ballAt, ballTurn, ballSize));
    }
    theirBalls.count = theirs;
    targets.count = theirs;
    theirBalls.instanceMatrix.needsUpdate = true;
    targets.instanceMatrix.needsUpdate = true;
    const counts = { ball: 0, bounce: 0, bubble: 0, snow: 0 };
    for (const shot of shots) {
      const kind = this.powerBalls[shot.fire] ? shot.fire : 'ball';
      const index = counts[kind];
      if (index >= MOST_BALLS) continue;
      counts[kind] += 1;
      ballAt.set(shot.x, shot.y, shot.z);
      ballSize.setScalar(kind === 'ball' ? 1.45 : this.powerBalls[kind].size);
      (kind === 'ball' ? myBalls : this.powerBalls[kind].mesh).setMatrixAt(index, ballMatrix.compose(ballAt, ballTurn, ballSize));
    }
    myBalls.count = counts.ball;
    myBalls.instanceMatrix.needsUpdate = true;
    for (const [kind, { mesh }] of Object.entries(this.powerBalls)) {
      mesh.count = counts[kind];
      mesh.instanceMatrix.needsUpdate = true;
    }

    // A little smoke trail, so that their slow high arcs can be followed.
    this.trailIn -= dt;
    if (this.trailIn <= 0 && theirs) {
      this.trailIn = this.reducedMotion ? 0.24 : 0.12;
      for (let i = 0; i < theirs; i += 1) {
        const ball = balls[i];
        this.sparks.emit({ shape: 'puff', colour: '#e4dfd6', at: { x: ball.x, y: ball.y, z: ball.z }, life: 0.6, size: 1.5, grow: 1.6, opacity: 0.42 });
      }
    }

    for (const ring of this.rings) {
      if (ring.left <= 0) continue;
      ring.left -= dt;
      if (ring.left <= 0) {
        ring.mesh.visible = false;
        continue;
      }
      const share = 1 - ring.left / ring.total;
      ring.mesh.scale.setScalar(ring.size * (0.4 + share));
      ring.mesh.material.opacity = 0.75 * (1 - share);
    }
  }

  drawGulls(dt) {
    if (!this.gulls.visible) return;
    const { gulls, gullMatrix, gullAt, gullTurn, gullSize, camera, up } = this;
    const speed = this.reducedMotion ? 0.05 : 0.1;
    this.gullTime = (this.gullTime ?? 0) + dt * speed;
    for (let i = 0; i < gulls.count; i += 1) {
      const angle = this.gullTime * (i % 2 ? 1 : -1) * (1 + i * 0.06) + i * 1.9;
      const round = 90 + (i % 5) * 34;
      gullAt.set(camera.position.x + Math.cos(angle) * round + Math.sin(i * 2.3) * 60 - forwardOf(this.cameraYaw).x * -120, 50 + (i % 4) * 13 + Math.sin(this.time * 0.5 + i) * 3, camera.position.z + Math.sin(angle) * round - forwardOf(this.cameraYaw).z * -120);
      gullTurn.setFromAxisAngle(up, -angle + (i % 2 ? 0 : Math.PI));
      const flap = this.reducedMotion ? 1 : 0.4 + 0.75 * Math.sin(this.time * 5.2 + i * 1.3);
      gullSize.set(1.15, flap, 1.15);
      gulls.setMatrixAt(i, gullMatrix.compose(gullAt, gullTurn, gullSize));
    }
    gulls.instanceMatrix.needsUpdate = true;
  }

  /** Which way the camera wants to look: along the ship, turned part of the way to whoever's being fired on. */
  aimCamera(dt) {
    const { battle } = this;
    const heading = battle?.heading ?? 0;
    let aside = 0;
    let target = battle?.state === 'sailing' ? (battle.zones.right.firing ? battle.zones.right.target : battle.zones.left.firing ? battle.zones.left.target : null) : null;
    // A ship just beaten is worth seeing, with its crew rowing away.
    this.watchLeft = Math.max(0, (this.watchLeft ?? 0) - dt);
    if (this.watchLeft > 0 && this.watching?.state === 'sinking') target = this.watching;
    if (target) {
      const off = turnBetween(Math.atan2(target.x - battle.x, -(target.z - battle.z)), heading);
      aside = clamp(off * 0.42, -0.62, 0.62) * (this.reducedMotion ? 0.6 : 1);
    }
    this.lookAside = damp(this.lookAside, aside, 1, dt);
    this.cameraYaw += turnBetween(heading + this.lookAside, this.cameraYaw) * (1 - Math.exp(-dt * 2.4));
  }

  placeCamera(dt) {
    const { battle, camera, calm } = this;
    this.viewShare = damp(this.viewShare, this.wantedView, 1.5, dt);
    const share = this.viewShare;
    const x = battle?.x ?? 0;
    const z = battle?.z ?? 0;
    const heading = battle?.heading ?? 0;
    this.aimCamera(dt);
    // At the title, and after it's all over, it goes slowly round the ship.
    this.orbit += dt * 0.09 * calm;
    const titleYaw = heading + TITLE_VIEW.yaw + Math.sin(this.orbit) * 0.12;
    const yaw = this.cameraYaw + turnBetween(titleYaw, this.cameraYaw) * (1 - share);
    const mix = (from, to) => from + (to - from) * share;
    const back = mix(TITLE_VIEW.back, VIEW.back);
    const up = mix(TITLE_VIEW.up, VIEW.up);
    const ahead = mix(TITLE_VIEW.ahead, VIEW.ahead);
    const lookUp = mix(TITLE_VIEW.lookUp, VIEW.lookUp);
    const forward = forwardOf(yaw);
    const right = rightOf(yaw);
    // The ship stands to one side of the title card.
    const aside = TITLE_VIEW.aside * (1 - share);
    const sway = Math.sin(this.time * 0.6) * 0.5 * calm;
    camera.position.set(x - forward.x * back + right.x * aside, up + sway, z - forward.z * back + right.z * aside);
    camera.up.set(0, 1, 0);
    camera.lookAt(x + forward.x * ahead + right.x * aside, lookUp, z + forward.z * ahead + right.z * aside);
    camera.updateMatrixWorld();
  }

  /** The sailing view, as play begins. */
  setSailing(on, { snap = false } = {}) {
    this.wantedView = on ? 1 : 0;
    if (snap) this.viewShare = this.wantedView;
  }

  update(dt) {
    this.time += dt;
    this.seaTime += dt * (this.reducedMotion ? 0.6 : 1);
    this.watchSpeed(dt);
    this.water.uTime.value = this.seaTime;
    this.placeCamera(dt);

    // The waves are fixed to the sea, and only their edge moves with the camera.
    const { camera, sea, seaCell, seaUniforms, island } = this;
    const forward = forwardOf(this.cameraYaw);
    const middleX = camera.position.x + forward.x * this.seaUniforms.uReach.value * 0.55;
    const middleZ = camera.position.z + forward.z * this.seaUniforms.uReach.value * 0.55;
    sea.position.set(Math.round(middleX / seaCell) * seaCell, 0, Math.round(middleZ / seaCell) * seaCell);
    seaUniforms.uMiddle.value.set(middleX, middleZ);
    seaUniforms.uRippleAt.value.copy(island.water.offset);

    this.placeHero(dt);
    this.placePirates(dt);
    this.drawBalls(dt);
    this.drawGulls(dt);
    const heroAt = this.hero.root.position;
    const near = [heroAt, ...(this.battle?.afloat ?? [])];
    this.floats.placeAll(this.time, this.calm, near, camera.position);
    if (this.dolphins.mesh.visible && this.wantedView === 1) this.dolphins.update(dt, { x: heroAt.x, z: heroAt.z, yaw: this.cameraYaw, calm: this.calm });
    this.coins.update(this.battle?.coins ?? [], this.time, this.calm);
    const towed = [];
    for (const pirate of this.battle?.afloat ?? []) {
      if (!pirate.cage) continue;
      const back = forwardOf(pirate.heading);
      towed.push({ x: pirate.x - back.x * 30, z: pirate.z - back.z * 30, phase: pirate.heading });
    }
    this.prizeDrawing.update(this.battle?.prizes ?? [], towed, this.time);
    this.placeShield(dt);
    this.sparks.update(dt);
    island.update(dt, camera, this.reducedMotion);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
