// The view from the tram: the town going by, the robots, the goo, the blaster at the front, and the
// shots going from one to the other. The rules are in rescue.js, and this only shows what they say.
//
// Nothing flashes or strobes, as seizures are more common in children with hemiplegia. There's no
// muzzle flash and nothing lights up. A hit is small shapes flying off where it happened, and the
// picture itself never changes brightness.
import * as THREE from '../../vendor/three/three.module.js';
import { ball, limb, mergeParts, outlineMaterial, roundedBox, toon } from '../../core/body/characters.js';
import { byId as characterById } from '../../core/body/roster.js';
import { SHAPES, Sparks, spriteTexture } from '../../core/body/sparks.js';
import { Glove } from '../../core/glove.js';
import { Cage, Debris, SHOT_COLOURS, blobShadow, makeRobotView } from './robots.js';
import { AIM_HELP, Aim, EYE_HEIGHT, PLACES } from './rescue.js';
import { Sights } from './sights.js';
import { COVER_HEIGHT, STOP_SPOTS, Town, WATER_LEVEL } from './town.js';

const FOV = 55;
const PITCH = 0.07; // Looking up a little, as the sky and the rooftops are half the fun.
const SLOW_FRAME_SECONDS = 1 / 40;
const SLOW_CHECK_FRAMES = 90;
const PALM_SHARE = 0.045; // The little copy of the hand under the crosshair.
const CROSSHAIR_SHARE = 0.075;
const SHIELD_UP_SECONDS = 0.16;
const SHIELD_DOWN_SECONDS = 0.22;
const HAZE_SECONDS = 0.7; // How long the haze takes to come and go at the edges of the view, while moving.
const SHOTS_AT_ONCE = 8;
const CAGE_BASE = { market: 'cart', canal: 'raft', harbour: 'stone', farm: 'hay', tower: 'stone' };
// How much of each kind of thing the aim can land on, in metres.
const AIM_SIZE = { walker: 1, roller: 0.95, drone: 1, peeker: 0.72, spot: 0.82, goo: 0.5 };
const BAR_ABOVE = { walker: 3.4, roller: 3.1, peeker: 2, drone: 1.3, big: 11.3 };
const BLASTER_SIZE = 0.5;
// How far down the view the blaster sits and the dash's top edge is, whatever shape the screen is.
const BLASTER_DOWN = 0.855;
const DASH_DOWN = 0.804;
const DASH_TOP = { y: -0.72, z: 1.72 };
const BLASTER_AT = { x: 0, z: -1.26 };
const SHOT_LOOKS = 0.03; // How big a shot looks, as a share of how far away it is.

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
// Speeding up gently, going along steadily and slowing down gently, so that it's never going faster
// than it has to. Walls going by quickly make the edges of the picture flicker.
const RAMP = 0.28;
const ride = (share) => {
  const top = 1 / (1 - RAMP);
  if (share < RAMP) return (top * share * share) / (2 * RAMP);
  if (share > 1 - RAMP) return 1 - (top * (1 - share) * (1 - share)) / (2 * RAMP);
  return top * (share - RAMP / 2);
};
const between = (low, high) => low + Math.random() * (high - low);

// Bolts and nuts, for robots falling apart, alongside the shapes everything else uses.
SHAPES.bolt = (ctx) => {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(angle) * 44, Math.sin(angle) * 44);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
};
SHAPES.ball = (ctx) => {
  ctx.beginPath();
  ctx.arc(0, 0, 44, 0, Math.PI * 2);
  ctx.fill();
};

const softBlob = () => spriteTexture((ctx) => {
  const gradient = ctx.createRadialGradient(0, 0, 4, 0, 0, 48);
  gradient.addColorStop(0, 'rgb(255 255 255 / 1)');
  gradient.addColorStop(0.6, 'rgb(255 255 255 / 0.6)');
  gradient.addColorStop(1, 'rgb(255 255 255 / 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, 48, 0, Math.PI * 2);
  ctx.fill();
}, 64);

/** The toy blaster on the front of the tram. Its tank shows how full it is. */
function buildBlaster() {
  const root = new THREE.Group();
  const shape = mergeParts([
    { geometry: roundedBox(0.3, 0.26, 0.74, 0.08), colour: '#ff8a3c', at: [0, 0, 0.1] },
    { geometry: roundedBox(0.34, 0.08, 0.78, 0.03), colour: '#ffc83d', at: [0, -0.11, 0.1] },
    { geometry: limb(0.09, 0.075, 0.54).rotateX(-Math.PI / 2), colour: '#3f86d9', at: [0, 0.03, 0.42] },
    { geometry: new THREE.CylinderGeometry(0.125, 0.125, 0.13, 16).rotateX(Math.PI / 2), colour: '#ffc83d', at: [0, 0.03, 0.96] },
    { geometry: roundedBox(0.09, 0.09, 0.09, 0.02), colour: '#3f4a5c', at: [0, 0.15, 0.06] },
    { geometry: roundedBox(0.09, 0.09, 0.09, 0.02), colour: '#3f4a5c', at: [0, 0.15, 0.42] },
  ]);
  const paint = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() });
  const line = outlineMaterial('#1d2740', 0.012);
  root.add(new THREE.Mesh(shape, paint), new THREE.Mesh(shape, line));

  // The tank of paint, lying along the top, so that it doesn't get in the way of the view.
  const tank = new THREE.Group();
  tank.position.set(0, 0.22, 0);
  const along = (radius, length) => new THREE.CylinderGeometry(radius, radius, length, 16).rotateX(Math.PI / 2).translate(0, 0, length / 2);
  const fluid = new THREE.Mesh(along(0.075, 0.5), new THREE.MeshToonMaterial({ color: '#7fe7ff', gradientMap: toon() }));
  const glass = new THREE.Mesh(along(0.09, 0.52), new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, opacity: 0.3, depthWrite: false }));
  const capPaint = new THREE.MeshToonMaterial({ color: '#3f86d9', gradientMap: toon() });
  const backCap = new THREE.Mesh(along(0.1, 0.03), capPaint);
  backCap.position.z = -0.03;
  const frontCap = new THREE.Mesh(along(0.1, 0.03), capPaint);
  frontCap.position.z = 0.52;
  tank.add(fluid, glass, backCap, frontCap);
  root.add(tank);
  root.userData.fluid = fluid;
  return root;
}

/** The front of the tram, along the bottom of the view: not much, as the view is what matters. */
function buildDash() {
  const brass = '#e0b040';
  const shape = mergeParts([
    { geometry: new THREE.BoxGeometry(4.4, 0.5, 1.3), colour: '#d9483f', at: [0, -0.985, -1.1] },
    { geometry: new THREE.BoxGeometry(4.4, 0.03, 0.09), colour: '#fff4e0', at: [0, -0.72, -1.72] },
    { geometry: new THREE.BoxGeometry(4.4, 0.02, 0.04), colour: brass, at: [0, -0.725, -1.5] },
    { geometry: new THREE.CylinderGeometry(0.1, 0.13, 0.09, 12), colour: '#7a2f28', at: [0, -0.71, -1.24] },
    { geometry: new THREE.CylinderGeometry(0.035, 0.05, 0.14, 10), colour: brass, at: [0, -0.64, -1.24] },
  ]);
  const paint = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(shape, paint), new THREE.Mesh(shape, outlineMaterial('#1d2740', 0.008)));
  return group;
}

export class Stage {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;

    this.scene = new THREE.Scene();
    this.sparks = new Sparks(this.scene);
    this.town = new Town(this.scene, this.sparks.textures.puff);
    this.debris = new Debris(this.scene);

    this.rig = new THREE.Group();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1100);
    this.camera.position.y = EYE_HEIGHT;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.x = PITCH;
    this.rig.add(this.camera);
    this.scene.add(this.rig);
    this.dash = buildDash();
    this.camera.add(this.dash);
    this.blaster = buildBlaster();
    this.blaster.scale.setScalar(BLASTER_SIZE);
    this.blasterY = -0.56;
    this.camera.add(this.blaster);
    this.muzzle = new THREE.Vector3();
    this.recoil = 0;

    this.sights = new Sights(overlay);
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    this.aim = new Aim();
    this.side = 'right';
    this.help = AIM_HELP.little;
    this.aspect = 16 / 9;

    this.mission = null;
    this.views = new Map();
    this.gooViews = new Map();
    this.held = new Map();
    this.cages = new Map();
    this.leg = null;
    this.time = 0;
    this.panX = 0;
    this.panY = 0;
    this.shieldLevel = 0;
    this.haze = 0;
    this.frames = 0;
    this.slowFrames = 0;
    this.quality = 1;
    this.handState = 'none';
    this.showSights = false;
    this.chimneyIn = 0;
    this.trailIn = 0;

    // A ball of paint with a dark edge, so it stands out against anything behind it.
    const shotShape = spriteTexture((ctx) => {
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, Math.PI * 2);
      ctx.fillStyle = '#26324d';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 36, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    });
    const shotPaints = SHOT_COLOURS.map((colour) => new THREE.SpriteMaterial({ map: shotShape, color: colour, transparent: true, depthWrite: false, depthTest: false }));
    this.shotSprites = Array.from({ length: SHOTS_AT_ONCE }, () => {
      const sprite = new THREE.Sprite(shotPaints[0]);
      sprite.visible = false;
      sprite.scale.setScalar(0.34);
      this.scene.add(sprite);
      return sprite;
    });
    this.shotPaints = shotPaints;

    this.shadowPaint = new THREE.MeshBasicMaterial({ map: softBlob(), color: '#1a2233', transparent: true, opacity: 0.32, depthWrite: false });
    this.gooShape = ball(0.42);
    this.gooShineShape = ball(0.1, 0.07, 0.05);
    this.gooPaint = new THREE.MeshToonMaterial({ color: '#8fe03a', gradientMap: toon() });
    this.gooLine = outlineMaterial('#3d7a15', 0.03);
    this.gooShine = new THREE.MeshBasicMaterial({ color: '#efffc9' });

    this.scratch = new THREE.Vector3();
    this.scratch2 = new THREE.Vector3();
    this.tangent = new THREE.Vector3();
    this.setRig(PLACES[0]);

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
    // Once now, with everything in the town showing, which is when its shadows are worked out.
    this.renderer.render(this.scene, this.camera);
  }

  configure({ side = this.side, reach }) {
    this.side = side;
    if (reach !== undefined) this.help = AIM_HELP[reach] ?? AIM_HELP.little;
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    // A tall narrow screen sees the same width of the town, and more of the sky.
    this.camera.fov = this.camera.aspect < 1.2 ? Math.min(80, FOV * (1.2 / this.camera.aspect) * 0.86) : FOV;
    this.camera.updateProjectionMatrix();
    const halfView = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.dash.position.y = -DASH_DOWN * halfView * DASH_TOP.z - DASH_TOP.y;
    this.blasterY = -BLASTER_DOWN * halfView * -BLASTER_AT.z;
    this.palmSize = Math.max(22, this.height * PALM_SHARE);
    this.sights.resize();
  }

  setRig(place) {
    const { at, yaw } = STOP_SPOTS[place.id];
    this.rig.position.set(at[0], 0, at[1]);
    this.rig.rotation.y = yaw;
  }

  /* ---------- a new game ---------- */

  reset(mission) {
    for (const view of this.views.values()) view.root.removeFromParent();
    this.views.clear();
    for (const mesh of this.gooViews.values()) mesh.removeFromParent();
    this.gooViews.clear();
    for (const mesh of this.held.values()) mesh.removeFromParent();
    this.held.clear();
    for (const cage of this.cages.values()) cage.dispose();
    this.cages.clear();
    this.mission = mission;
    this.leg = null;
    this.aim.lose();
    this.sights.reset();
    this.shieldLevel = 0;
    for (const place of mission.stops) this.buildCage(place);
    this.setRig(mission.stops[0]);
  }

  buildCage(place) {
    const [x, z] = place.cage;
    const base = CAGE_BASE[place.id];
    const cage = new Cage({
      spec: characterById(place.who),
      x,
      z,
      base,
      y: place.id === 'canal' ? WATER_LEVEL + 0.42 : place.id === 'tower' || place.id === 'harbour' ? 0.6 : 0,
      bob: place.id === 'canal',
      reducedMotion: this.reducedMotion,
    });
    this.town.places[place.id].add(cage.root);
    this.cages.set(place.id, cage);
  }

  get group() {
    return this.town.places[this.mission.place.id];
  }

  /* ---------- what the rules say has happened ---------- */

  onEvent(event) {
    const handlers = {
      robot: () => this.addRobot(event.robot),
      'robot-hit': () => this.onRobotHit(event),
      'robot-dropped': () => this.onRobotDropped(event.robot),
      'spot-hit': () => this.onSpotHit(event.spot, event.robot),
      'spot-open': () => this.onSpotOpen(event.spot, event.robot),
      'spot-done': () => this.onSpotDone(event.spot, event.robot),
      windup: () => this.onWindup(event.robot),
      goo: () => this.addGoo(event.goo, event.robot),
      'goo-shot': () => this.onGooShot(event.goo),
      'goo-blocked': () => this.onGooBlocked(event.goo),
      'goo-hit': () => this.onGooHit(event.goo),
      'goo-gone': () => this.removeGoo(event.goo, true),
      freed: () => this.onFreed(event.place, event.last),
      shot: () => this.onShot(),
      moving: () => this.onMoving(event),
    };
    handlers[event.type]?.();
  }

  addRobot(robot) {
    const { place } = this.mission;
    const style = place.covers[robot.cover ?? 0][2];
    const view = makeRobotView(robot, this.reducedMotion, COVER_HEIGHT[style]);
    view.place = place;
    if (robot.kind === 'walker' || robot.kind === 'roller' || robot.kind === 'big') {
      const shadow = blobShadow(this.shadowPaint, { big: 11, roller: 2 }[robot.kind] ?? 2.6);
      view.root.add(shadow);
    }
    this.town.places[place.id].add(view.root);
    this.views.set(robot, view);
  }

  burst({ at, colours, count, speed = 5, shapes = ['star'], size = 0.34, life = 0.55, gravity = 8, drag = 0.6 }) {
    const many = this.reducedMotion ? Math.ceil(count / 2) : count;
    for (let i = 0; i < many; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const up = between(0.1, 1);
      this.sparks.emit({
        shape: shapes[i % shapes.length],
        colour: colours[i % colours.length],
        at,
        velocity: [Math.cos(angle) * speed * between(0.4, 1), up * speed, Math.sin(angle) * speed * between(0.4, 1)],
        life: life * between(0.75, 1.2),
        size: size * between(0.7, 1.25),
        gravity,
        spin: between(-6, 6),
        drag,
      });
    }
  }

  onRobotHit({ robot, shot }) {
    const view = this.views.get(robot);
    if (!view) return;
    view.splat(shot.colour);
    const at = view.aimPoint(this.scratch);
    this.burst({ at, colours: [SHOT_COLOURS[shot.colour], '#ffffff'], count: 4, speed: 3.4, shapes: ['ball', 'star'], size: 0.2, life: 0.32, gravity: 6 });
  }

  onRobotDropped(robot) {
    const view = this.views.get(robot);
    if (!view) return;
    this.views.delete(robot);
    this.dropHeld(robot);
    const big = robot.kind === 'big';
    const at = view.aimPoint(this.scratch).clone();
    const colours = ['#ffd23f', '#c9d3dd', '#ff8f3f', '#7fe7ff'];
    this.burst({ at, colours, count: big ? 40 : 12, speed: big ? 11 : 6.5, shapes: ['gear', 'bolt', 'star'], size: big ? 0.8 : 0.42, life: big ? 1.3 : 0.85, gravity: 11 });
    // Puffs of smoke.
    const puffs = this.reducedMotion ? 2 : big ? 14 : 4;
    for (let i = 0; i < puffs; i += 1) {
      this.sparks.emit({
        shape: 'puff',
        colour: '#9aa3b2',
        at: { x: at.x + between(-0.5, 0.5) * (big ? 5 : 1), y: at.y + between(-0.4, 0.5) * (big ? 5 : 1), z: at.z + between(-0.3, 0.3) },
        velocity: [between(-0.8, 0.8), between(0.5, 1.6), between(-0.5, 0.5)],
        life: between(0.7, 1.15),
        size: big ? 2.2 : 0.8,
        grow: big ? 2.4 : 0.9,
        opacity: 0.75,
        drag: 0.8,
      });
    }
    this.debris.burst(view, big ? 2.4 : 1, this.overWater(robot) ? WATER_LEVEL - 3 : undefined);
  }

  /** Whether what's falling from this robot will land in the water. */
  overWater({ x, z }) {
    const { id } = this.mission.place;
    if (id === 'canal') return z > 10 && z < 24 && Math.abs(x) > 4.6;
    return id === 'harbour' && x < -13.3 + 0.223 * z;
  }

  onSpotHit(spot, robot) {
    const view = this.views.get(robot);
    if (!view) return;
    view.splat(this.mission.stats.shots % SHOT_COLOURS.length);
    const at = view.aimPointOf(spot, this.scratch);
    this.burst({ at, colours: ['#ffd23f', '#ffffff', '#ff8f3f'], count: 4, speed: 4, shapes: ['star'], size: 0.34, life: 0.38 });
  }

  onSpotOpen(spot, robot) {
    const view = this.views.get(robot);
    if (!view) return;
    const at = view.aimPointOf(spot, this.scratch);
    this.burst({ at, colours: ['#ffd23f', '#ffffff'], count: 6, speed: 3, shapes: ['star'], size: 0.4, life: 0.6, gravity: 2 });
  }

  onSpotDone(spot, robot) {
    const view = this.views.get(robot);
    if (!view) return;
    const at = view.aimPointOf(spot, this.scratch).clone();
    this.burst({ at, colours: ['#ffd23f', '#c9d3dd', '#ff8f3f'], count: 22, speed: 8, shapes: ['gear', 'bolt', 'star'], size: 0.6, life: 0.95, gravity: 10 });
    for (let i = 0; i < 4; i += 1) {
      this.sparks.emit({ shape: 'puff', colour: '#9aa3b2', at, velocity: [between(-1, 1), between(0.6, 1.6), 0.4], life: 1, size: 1, grow: 1.1, opacity: 0.7, drag: 0.8 });
    }
  }

  /** A blob of goo appears in the hand of whoever's about to throw it. */
  onWindup(robot) {
    const mesh = new THREE.Group();
    const blob = new THREE.Mesh(this.gooShape, this.gooPaint);
    mesh.add(blob, new THREE.Mesh(this.gooShape, this.gooLine));
    if (robot.kind !== 'big') mesh.scale.setScalar(0.7);
    this.scene.add(mesh);
    this.held.set(robot, mesh);
  }

  dropHeld(robot) {
    const mesh = this.held.get(robot);
    if (!mesh) return;
    mesh.removeFromParent();
    this.held.delete(robot);
  }

  addGoo(goo, robot) {
    this.dropHeld(robot);
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(this.gooShape, this.gooPaint), new THREE.Mesh(this.gooShape, this.gooLine));
    const shine = new THREE.Mesh(this.gooShineShape, this.gooShine);
    shine.position.set(-0.17, 0.2, 0.32);
    mesh.add(shine);
    mesh.scale.setScalar(goo.big ? 1.25 : 1);
    this.group.add(mesh);
    this.gooViews.set(goo, mesh);
    this.placeGoo(goo, mesh);
  }

  placeGoo(goo, mesh) {
    mesh.position.set(goo.x, goo.y, -goo.z);
    if (this.reducedMotion) return;
    const wobble = Math.sin(this.time * 9 + goo.id) * 0.08;
    const size = goo.big ? 1.25 : 1;
    mesh.scale.set(size * (1 + wobble), size * (1 - wobble), size * (1 + wobble));
    mesh.rotation.z += 0.02;
  }

  removeGoo(goo, fizzle = false) {
    const mesh = this.gooViews.get(goo);
    if (!mesh) return;
    this.gooViews.delete(goo);
    if (fizzle) {
      const at = mesh.getWorldPosition(this.scratch);
      this.burst({ at, colours: ['#8fe03a', '#c6f24e'], count: 5, speed: 1.6, shapes: ['ball'], size: 0.22, life: 0.5, gravity: 4 });
    }
    mesh.removeFromParent();
  }

  onGooShot(goo) {
    const mesh = this.gooViews.get(goo);
    if (mesh) {
      const at = mesh.getWorldPosition(this.scratch);
      this.burst({ at, colours: ['#8fe03a', '#c6f24e', '#ffffff'], count: 12, speed: 4.2, shapes: ['ball', 'bubble', 'star'], size: 0.34, life: 0.55, gravity: 7 });
    }
    this.removeGoo(goo);
  }

  onGooBlocked(goo) {
    this.removeGoo(goo);
    this.sights.hitShield();
  }

  onGooHit(goo) {
    this.removeGoo(goo);
    this.sights.hitInCorner();
  }

  onShot() {
    this.recoil = this.reducedMotion ? 0.3 : 1;
    this.blaster.updateWorldMatrix(true, false);
    const at = this.blaster.localToWorld(this.scratch.set(0, 0.03, 1));
    this.muzzle.copy(at);
    this.sparks.emit({ shape: 'puff', colour: '#ffffff', at, velocity: [between(-0.4, 0.4), between(0.2, 0.7), 0], life: 0.22, size: 0.1, grow: 0.5, opacity: 0.55 });
  }

  onFreed(place, last) {
    const cage = this.cages.get(place.id);
    if (!cage) return;
    cage.free();
    const at = cage.root.getWorldPosition(this.scratch).clone();
    at.y += 2.2;
    this.burst({ at, colours: ['#ffd23f', '#ff7eb6', '#7fe7ff', '#7be36a'], count: 22, speed: 7, shapes: ['star', 'star', 'ball'], size: 0.5, life: 1.1, gravity: 7 });
    if (last) this.throwParty(place);
  }

  /** The end of it all: everyone who's been freed comes to join in. */
  throwParty(place) {
    const spots = [[-5.4, 13], [-1.6, 12.4], [2.2, 12.6], [5.6, 13.2]];
    const group = this.town.places[place.id];
    let spot = 0;
    for (const [id, cage] of this.cages) {
      if (id === place.id) continue;
      const [x, z] = spots[spot % spots.length];
      spot += 1;
      const friend = cage.celebrateAt(x, z);
      friend.add(blobShadow(this.shadowPaint, 1.9));
      group.add(friend);
    }
  }

  onMoving({ from, to }) {
    this.leg = { from: PLACES.indexOf(from), to: PLACES.indexOf(to) };
  }

  /* ---------- the hand ---------- */

  /** Moves the crosshair, and says what's in it. Only a hand that's in view aims at anything. */
  steer(dt, snapshot) {
    const { side } = this;
    for (const name of ['left', 'right']) {
      if (name !== side) this.gloves[name].hide();
    }
    const glove = this.gloves[side];
    glove.follow(snapshot[side], dt, this);
    if (!glove.visible || snapshot[side].status === 'missing') {
      this.aim.lose();
      return null;
    }
    const x = clamp(glove.x, 0, this.width);
    const y = clamp(glove.y, 0, this.height);
    this.targetsOnScreen = this.mission ? this.projectTargets(this.mission) : [];
    return this.aim.update(dt, x, y, this.targetsOnScreen, this.help, this.height);
  }

  /** A point in the world as pixels on the screen, and how big a size there would look. */
  toPixels(point, size) {
    const projected = this.scratch2.copy(point).project(this.camera);
    if (projected.z > 1) return null;
    const x = ((projected.x + 1) / 2) * this.width;
    const y = ((1 - projected.y) / 2) * this.height;
    const far = this.scratch2.copy(point).sub(this.cameraPosition).length();
    const pixels = (size / (far * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))) * (this.height / 2);
    return { x, y, size: pixels };
  }

  worldPointOf(target, into) {
    if (target.kind === 'spot') {
      const view = this.views.get(target.big);
      return view ? view.aimPointOf(target, into) : null;
    }
    if (target.kind === 'goo') {
      const mesh = this.gooViews.get(target);
      return mesh ? mesh.getWorldPosition(into) : null;
    }
    const view = this.views.get(target);
    return view ? view.aimPoint(into) : null;
  }

  projectTargets(mission) {
    this.camera.updateWorldMatrix(true, false);
    this.cameraPosition = this.camera.getWorldPosition(new THREE.Vector3());
    const found = [];
    const point = new THREE.Vector3();
    for (const ref of mission.targets()) {
      if (!this.worldPointOf(ref, point)) continue;
      const pixels = this.toPixels(point, AIM_SIZE[ref.kind]);
      if (!pixels) continue;
      // Only what can be seen can be aimed at.
      if (pixels.x < -40 || pixels.x > this.width + 40 || pixels.y < -40 || pixels.y > this.height + 40) continue;
      found.push({ ref, x: pixels.x, y: pixels.y, size: pixels.size });
    }
    return found;
  }

  /* ---------- every frame ---------- */

  /** How tall a peeker's cover is, going from one to the other while it hops between them. */
  coverHeightOf(robot, place) {
    const height = (cover) => COVER_HEIGHT[place.covers[cover ?? 0][2]];
    if (robot.state !== 'hopping') return height(robot.cover);
    return height(robot.hopFrom) + (height(robot.cover) - height(robot.hopFrom)) * robot.hop;
  }

  /** Each friend is a lot to draw, so only the one here is shown, and the last while leaving them. */
  showCages() {
    const { mission } = this;
    if (!mission?.place) return;
    const here = mission.place.id;
    const moving = mission.phase === 'moving';
    for (const [id, cage] of this.cages) {
      cage.root.visible = id === here || (moving && this.leg && PLACES[this.leg.from].id === id);
    }
    this.town.focusOn(PLACES.indexOf(mission.place), moving && this.leg ? this.leg.from : null);
  }

  moveTram(dt) {
    const { mission } = this;
    if (mission?.phase === 'moving' && this.leg) {
      this.town.route.along(this.leg.from, this.leg.to, ride(mission.moved), this.rig.position, this.tangent);
      this.rig.rotation.y = Math.atan2(-this.tangent.x, -this.tangent.z);
    } else if (mission?.place) {
      this.setRig(mission.place);
    }
    // A little movement of the tram itself, and of the view, towards where the hand is aiming.
    const moving = mission?.phase === 'moving';
    // At a steady rate, as easing would make its first moments the biggest change of all.
    this.haze = clamp(this.haze + ((moving ? 1 : -1) * dt) / HAZE_SECONDS, 0, 1);
    const bob = this.reducedMotion ? 0 : (moving ? Math.sin(this.time * 15) * 0.012 : Math.sin(this.time * 1.4) * 0.008);
    this.camera.position.y = EYE_HEIGHT + bob;
    const aimX = this.aim.seen && !this.reducedMotion ? (this.aim.x / this.width - 0.5) * 2 : 0;
    const aimY = this.aim.seen && !this.reducedMotion ? (this.aim.y / this.height - 0.5) * 2 : 0;
    this.panX = damp(this.panX, aimX, 3, dt);
    this.panY = damp(this.panY, aimY, 3, dt);
    this.camera.rotation.y = -this.panX * 0.022;
    this.camera.rotation.x = PITCH - this.panY * 0.012;
    this.camera.rotation.z = moving && !this.reducedMotion ? Math.sin(this.time * 7) * 0.003 : 0;
  }

  aimBlaster(dt) {
    // It points along the line through the crosshair.
    const { camera, aim, blaster } = this;
    const x = aim.seen ? aim.x : this.width / 2;
    const y = aim.seen ? aim.y : this.height * 0.52;
    this.scratch.set((x / this.width) * 2 - 1, 1 - (y / this.height) * 2, 0.5).unproject(camera);
    camera.getWorldPosition(this.scratch2);
    const way = this.scratch.sub(this.scratch2).normalize();
    const look = this.scratch2.addScaledVector(way, 18);
    const before = blaster.quaternion.clone();
    blaster.lookAt(look);
    const after = blaster.quaternion.clone();
    blaster.quaternion.copy(before).slerp(after, 1 - Math.exp(-dt * 16));
    // It kicks back with each shot.
    this.recoil = Math.max(0, this.recoil - dt * 8);
    const down = this.shieldLevel * 0.05;
    blaster.position.set(BLASTER_AT.x, this.blasterY - down, BLASTER_AT.z + this.recoil * 0.03);
    const charge = this.mission?.blaster.charge ?? 1;
    blaster.userData.fluid.scale.z = Math.max(0.02, charge);
    blaster.userData.fluid.visible = charge > 0.01;
  }

  placeShots() {
    const { mission, shotSprites } = this;
    const shots = mission?.shots ?? [];
    this.blaster.updateWorldMatrix(true, false);
    const from = this.blaster.localToWorld(this.scratch.set(0, 0.03, 1)).clone();
    shotSprites.forEach((sprite, index) => {
      const shot = shots[index];
      sprite.visible = Boolean(shot);
      if (!shot) return;
      const to = this.worldPointOf(shot.target, this.scratch2);
      if (to) shot.lastAt = (shot.lastAt ?? new THREE.Vector3()).copy(to);
      if (!shot.lastAt) {
        sprite.visible = false;
        return;
      }
      const share = 1 - shot.left / shot.flight;
      sprite.position.lerpVectors(from, shot.lastAt, share);
      sprite.material = this.shotPaints[shot.colour];
      // It looks the same size however far it's got, and a bit smaller as it gets there.
      const far = sprite.position.distanceTo(this.cameraPosition ?? from);
      sprite.scale.setScalar(far * SHOT_LOOKS * (1.25 - share * 0.5));
    });
  }

  updateRobots(dt) {
    const resting = this.mission?.resting ?? false;
    for (const [robot, view] of this.views) {
      if (robot.kind === 'peeker') view.coverHeight = this.coverHeightOf(robot, view.place);
      view.update(dt, { resting });
      const held = this.held.get(robot);
      if (held) {
        if (robot.throwing <= 0) this.dropHeld(robot);
        else view.handPoint(held.position);
      }
    }
    if (!this.mission) return;
    for (const [goo, mesh] of this.gooViews) this.placeGoo(goo, mesh);
    this.trailIn -= dt;
    if (this.trailIn <= 0 && this.gooViews.size && !this.reducedMotion) {
      this.trailIn = 0.09;
      for (const mesh of this.gooViews.values()) {
        const at = mesh.getWorldPosition(this.scratch);
        this.sparks.emit({ shape: 'ball', colour: '#a9ea55', at: { x: at.x + between(-0.15, 0.15), y: at.y + between(-0.15, 0.15), z: at.z }, velocity: [0, -0.5, 0], life: 0.4, size: 0.15, gravity: 2 });
      }
    }
    // Smoke from the big one's chimney.
    this.chimneyIn -= dt;
    if (this.chimneyIn <= 0) {
      this.chimneyIn = this.reducedMotion ? 1.2 : 0.5;
      for (const [robot, view] of this.views) {
        if (robot.kind !== 'big') continue;
        const at = view.bodyPiece.localToWorld(this.scratch.set(-2.2, 8.95, -0.9));
        this.sparks.emit({ shape: 'puff', colour: '#b6bdc9', at, velocity: [between(-0.2, 0.5), 1.4, 0], life: 1.7, size: 0.7, grow: 0.9, opacity: 0.6 });
      }
    }
  }

  /** Whatever goes with what the rules have said this frame. handState is what readHand said. */
  update(dt, handState = 'none') {
    this.time += dt;
    this.handState = handState;
    this.watchSpeed(dt);
    const wantShield = handState === 'closed' ? 1 : 0;
    const rate = wantShield ? 1 / SHIELD_UP_SECONDS : 1 / SHIELD_DOWN_SECONDS;
    // A steady rate either way, so that a quick open and close can't flicker.
    this.shieldLevel += clamp(wantShield - this.shieldLevel, -rate * dt, rate * dt);

    this.moveTram(dt);
    this.showCages();
    this.town.update(dt, this.reducedMotion);
    this.updateRobots(dt);
    for (const cage of this.cages.values()) cage.update(dt);
    this.debris.update(dt);
    this.sparks.update(dt);
    this.aimBlaster(dt);
    this.placeShots();
    this.sights.update(dt);
    this.drawSights();
  }

  crosshairLook() {
    const { handState, mission, aim } = this;
    if (!aim.seen || handState === 'none' || handState === 'unsure') return 'lost';
    if (handState === 'closed') return 'shield';
    if (mission?.blaster.charge <= 0 || mission?.blaster.fillingItself) return 'empty';
    return aim.locked ? 'firing' : 'ready';
  }

  drawSights() {
    const { mission, width, height, aim, sights } = this;
    const look = this.crosshairLook();
    const glove = this.gloves[this.side];
    const onTarget = aim.locked && this.targetsOnScreen?.find(({ ref }) => ref === aim.locked);
    const bars = [];
    const warnings = [];
    let lock = null;
    if (mission && this.showSights) {
      this.camera.updateWorldMatrix(true, false);
      this.cameraPosition = this.camera.getWorldPosition(this.cameraPosition ?? new THREE.Vector3());
      const point = new THREE.Vector3();
      for (const [robot, view] of this.views) {
        if (robot.kind === 'peeker' && robot.rise < 0.5) continue;
        if (robot.kind === 'big') {
          view.root.localToWorld(point.set(0, BAR_ABOVE.big, 0));
          const top = this.toPixels(point, 2.6);
          if (top) bars.push({ x: top.x, y: top.y, width: top.size * 2, share: robot.spots.filter(({ done }) => !done).length / robot.spots.length, blocks: robot.spots.length });
          for (const spot of robot.spots) {
            if (!spot.open) continue;
            view.aimPointOf(spot, point);
            point.y += 1.15;
            const above = this.toPixels(point, 0.95);
            if (above) bars.push({ x: above.x, y: above.y, width: above.size * 2, share: spot.hp / spot.maxHp, blocks: 1 });
          }
          continue;
        }
        view.root.localToWorld(point.set(0, BAR_ABOVE[robot.kind], 0));
        const top = this.toPixels(point, robot.kind === 'drone' ? 0.85 : 0.72);
        if (top) bars.push({ x: top.x, y: top.y, width: Math.max(38, top.size * 2), share: robot.hp / robot.maxHp, blocks: robot.maxHp });
      }
      for (const [goo, mesh] of this.gooViews) {
        mesh.getWorldPosition(point);
        const at = this.toPixels(point, 0.42);
        if (at) warnings.push({ x: at.x, y: at.y, radius: at.size, close: goo.t, shielded: mission.shield });
      }
      const cage = mission.place && this.cages.get(mission.place.id);
      if (cage && !cage.freed && mission.leftHere > 0) {
        cage.root.localToWorld(point.set(0, cage.friend.spec.build.neck > 0.3 ? 5.9 : 4.7, 0));
        const above = this.toPixels(point, 0.42);
        if (above) lock = { x: above.x, y: above.y, left: mission.leftHere, size: Math.max(22, above.size * 2) };
      }
    }
    sights.draw({
      playing: this.showSights,
      bars,
      warnings,
      lock,
      shield: this.shieldLevel,
      haze: this.haze,
      shieldX: width / 2 + ((aim.seen ? aim.x : width / 2) - width / 2) * 0.32,
      shieldY: height * 0.56,
      shieldR: height * 0.34,
      crosshair: this.showSights ? {
        seen: aim.seen && glove.visible,
        x: aim.x,
        y: aim.y,
        look,
        charge: mission?.blaster.charge ?? 1,
        radius: height * CROSSHAIR_SHARE,
        target: onTarget ? onTarget.size : 0,
        glove,
        palmSize: this.palmSize,
      } : null,
    });
  }

  /** A slow computer gives up sharpness rather than the frame rate, as that's what aiming needs. */
  watchSpeed(dt) {
    this.frames += 1;
    if (dt > SLOW_FRAME_SECONDS) this.slowFrames += 1;
    if (this.frames < SLOW_CHECK_FRAMES) return;
    const slow = this.slowFrames > this.frames * 0.5;
    this.frames = 0;
    this.slowFrames = 0;
    if (slow && this.quality > 0) {
      this.quality = 0;
      this.renderer.setPixelRatio(1);
      this.resize();
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
