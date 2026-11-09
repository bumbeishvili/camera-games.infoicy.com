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
import { Cage, Chest, Debris, FloatingCage, SHOT_COLOURS, blobShadow, carriedFriend, makeKey, makeRobotView } from './robots.js';
import { AIM_HELP, Aim, EYE_HEIGHT, KEY_SECONDS, PALS, PLACES, POWERS, newsAt } from './rescue.js';
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
const SHOTS_AT_ONCE = 18; // The triple shot has three balls in the air for each one of the others.
const CAGE_BASE = { market: 'cart', canal: 'raft', harbour: 'stone', farm: 'hay', tower: 'stone' };
// How much of each kind of thing the aim can land on, in metres.
const AIM_SIZE = { walker: 1, roller: 0.95, drone: 1, peeker: 0.72, spot: 0.82, goo: 0.5, lid: 1.05, splitter: 1, mini: 0.7, keybot: 1, carrier: 1.1 };
const BAR_ABOVE = { walker: 3.4, roller: 3.1, peeker: 2, drone: 1.3, big: 11.3, lid: 3.4, splitter: 3.4, mini: 3.4, keybot: 3.4, carrier: 1.3 };
// How big each kind of shot looks, next to a ball of paint.
const SHOT_SIZE = { paint: 1, bubble: 1.35, boing: 1.5, plane: 1.5 };
// How see-through each kind of shot is on its way, for the same reason as the paint's soft edge.
// The kinds of fire from power-ups come less often than paint, so they can be bolder, and are easy to see.
const SHOT_OPACITY = { paint: 0.52, bubble: 0.75, boing: 0.72, plane: 0.85 };
const SIDE_OPACITY = 0.4; // The triple shot's other two balls.
// How big a bubble round a trapped robot is, in metres, and how high its middle is.
const BUBBLE_SIZE = { walker: 1.5, lid: 1.6, splitter: 1.5, keybot: 1.5, mini: 1, drone: 1.35, carrier: 1.35, peeker: 1.05, roller: 1.45 };
const BUBBLE_FLOAT = 0.25; // How far up a trapped robot floats.
const BUBBLE_FADE_SECONDS = 0.4; // How long a bubble takes to fade in and out, at its full size.
const BUBBLE_RISE_SECONDS = 0.9; // How long a trapped robot takes to float up, and down again.
const KING_CROWN = 1.5; // How much taller the robot king is, with his crown on.
const LOOK_HOLD_SECONDS = 0.45; // See crosshairLook.
const LABEL_SECONDS = 2.6; // How long the name of something new stays up, the first time it turns up.
const LABEL_WAITS_AT_MOST = 8;
const LABEL_BELOW_TOP = 34; // How far a name stays below the chips along the top, in pixels.
const HOME_FOLLOW = 8; // How quickly a prize's way over follows its counter, if that moves, a share a second.
// Robots on foot, which have a shadow under them, as do rollers and the big one.
const SHADOWS = { walker: 2.6, lid: 2.6, splitter: 2.6, mini: 2.6, keybot: 2.6, roller: 2, big: 11 };
const GUARD_SECONDS = 0.5; // How long the shield bubble takes to come and go.
// Where the chest sits by each cage, in the cage's own metres: beside it, towards the middle of the view.
const CHEST_AT = { x: 1.75, z: 1.75 };
const CHEST_FLOOR = { cart: 0.35, raft: 0.24, stone: 0.1, hay: 0.25 };
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

/** What the kinds of fire from power-ups look like: a soap bubble, a big boing ball and a paper plane. */
function shotLooks() {
  return {
    bubble: spriteTexture((ctx) => {
      const glass = ctx.createRadialGradient(-14, -16, 4, 0, 0, 44);
      glass.addColorStop(0, 'rgb(240 250 255 / 0.55)');
      glass.addColorStop(0.7, 'rgb(170 220 245 / 0.28)');
      glass.addColorStop(1, 'rgb(120 190 235 / 0.5)');
      ctx.fillStyle = glass;
      ctx.beginPath();
      ctx.arc(0, 0, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgb(110 175 220 / 0.7)';
      ctx.stroke();
      ctx.fillStyle = 'rgb(255 255 255 / 0.75)';
      ctx.beginPath();
      ctx.ellipse(-16, -18, 9, 6, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }),
    boing: spriteTexture((ctx) => {
      ctx.fillStyle = '#e8743a';
      ctx.strokeStyle = '#a4552b';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-42, 0);
      ctx.lineTo(42, 0);
      ctx.moveTo(0, -42);
      ctx.lineTo(0, 42);
      ctx.moveTo(-26, -32);
      ctx.quadraticCurveTo(-8, 0, -26, 32);
      ctx.moveTo(26, -32);
      ctx.quadraticCurveTo(8, 0, 26, 32);
      ctx.stroke();
    }),
    plane: spriteTexture((ctx) => {
      // Pointing to the right, which the sprite's rotation turns to the way it's going. Pale blue paper
      // with a soft edge, as they go all over the place.
      ctx.lineJoin = 'round';
      ctx.fillStyle = '#dfe9f4';
      ctx.strokeStyle = '#7d8eab';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(44, 0);
      ctx.lineTo(-38, -30);
      ctx.lineTo(-22, 0);
      ctx.lineTo(-38, 30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c3d3e6';
      ctx.beginPath();
      ctx.moveTo(44, 0);
      ctx.lineTo(-22, 0);
      ctx.lineTo(-30, 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }),
  };
}

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

    // A ball of paint with an edge a little darker than the rest. They come thick and fast, always along
    // the same way from the blaster to the robot, and dark edges flickered as they went by.
    const shotShape = spriteTexture((ctx) => {
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, Math.PI * 2);
      ctx.fillStyle = '#c3c9d6';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 36, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    });
    // Each shot has a paint of its own, as each fades as it lands, and paper planes turn as they go.
    this.shotLooks = { paint: shotShape, ...shotLooks() };
    this.shotSprites = Array.from({ length: SHOTS_AT_ONCE }, () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: shotShape, color: SHOT_COLOURS[0], transparent: true, depthWrite: false, depthTest: false }));
      sprite.visible = false;
      sprite.scale.setScalar(0.34);
      this.scene.add(sprite);
      return sprite;
    });
    // A soap bubble round a trapped robot: clear in the middle, with a blue edge and a shine, so it can be
    // seen even far off without hiding the robot.
    this.bubbleLook = spriteTexture((ctx) => {
      const glass = ctx.createRadialGradient(0, 0, 10, 0, 0, 48);
      glass.addColorStop(0, 'rgb(225 245 255 / 0.06)');
      glass.addColorStop(0.72, 'rgb(205 238 255 / 0.16)');
      glass.addColorStop(0.9, 'rgb(130 200 240 / 0.36)');
      glass.addColorStop(1, 'rgb(130 200 240 / 0)');
      ctx.fillStyle = glass;
      ctx.beginPath();
      ctx.arc(0, 0, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgb(255 255 255 / 0.5)';
      ctx.beginPath();
      ctx.ellipse(-20, -22, 9, 5, -0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgb(255 205 235 / 0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 42, 0.2, 1.1);
      ctx.stroke();
    }, 128);
    this.bubbles = new Map();
    this.prizeLooks = new Map();
    this.labels = [];
    this.named = [];
    this.chests = new Map();
    this.keys = [];
    this.floating = [];
    this.guardShare = 0;
    this.language = 'en';
    this.playing = false; // Whether the game is being played, rather than counting down: see main.js.
    this.prizeHomes = {}; // Where on the screen each kind of prize is counted: see main.js.

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

  configure({ side = this.side, reach, language }) {
    this.side = side;
    if (reach !== undefined) this.help = AIM_HELP[reach] ?? AIM_HELP.little;
    if (language !== undefined) this.language = language;
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
    for (const view of this.views.values()) {
      view.friend?.root.removeFromParent(); // A friend still being carried about, kept for next time.
      view.root.removeFromParent();
    }
    this.views.clear();
    for (const mesh of this.gooViews.values()) mesh.removeFromParent();
    this.gooViews.clear();
    for (const mesh of this.held.values()) mesh.removeFromParent();
    this.held.clear();
    for (const cage of this.cages.values()) cage.dispose();
    this.cages.clear();
    for (const { mesh } of this.bubbles.values()) mesh.removeFromParent();
    this.bubbles.clear();
    this.prizeLooks.clear();
    for (const { key } of this.keys) key.removeFromParent();
    this.keys = [];
    for (const floating of this.floating) floating.dispose();
    this.floating = [];
    this.chests.clear();
    this.mission = mission;
    this.leg = null;
    this.aim.lose();
    this.sights.reset();
    this.shieldLevel = 0;
    this.guardShare = 0;
    // What this level brings that's new, each named the first time it turns up.
    this.news = new Map(newsAt(mission.levelNumber).map((news) => [news.key, news]));
    this.labels = [];
    this.named = [];
    // The friends drones carry about, from level 9, made now, behind the title or the countdown.
    if (mission.plan.carrier) mission.stops.forEach((_, index) => carriedFriend(characterById(PALS[index % PALS.length])));
    for (const place of mission.stops) this.buildCage(place);
    this.setRig(mission.stops[0]);
    this.town.setEvening(Boolean(mission.plan.sunset));
    if (mission.plan.sunset) this.name('sunset', () => ({ x: this.width / 2, y: this.height * 0.2 }));
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
    if (this.mission.plan.keyChest) {
      // Beside the cage, on the side towards the middle of the view.
      const chest = new Chest(this.reducedMotion);
      chest.root.position.set(x > 0 ? -CHEST_AT.x : CHEST_AT.x, CHEST_FLOOR[base] ?? 0.2, CHEST_AT.z);
      cage.root.add(chest.root);
      this.chests.set(place.id, chest);
    }
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
      'goo-blocked': () => this.onGooBlocked(event.goo, event.bubble),
      'goo-hit': () => this.onGooHit(event.goo),
      'goo-gone': () => this.removeGoo(event.goo, true),
      freed: () => this.onFreed(event.place, event.last),
      shot: () => this.onShot(event),
      moving: () => this.onMoving(event),
      'prize-out': () => this.onPrizeOut(event.prize),
      prize: () => this.prizeLooks.delete(event.prize),
      bubbled: () => this.onBubbled(event.robot),
      bonk: () => this.onBonk(event.robot),
      'lid-off': () => this.onLidOff(event.robot),
      split: () => this.onSplit(event.robot),
      key: () => this.onKey(event.robot),
      'chest-open': () => this.onChestOpen(event.place),
      'pal-freed': () => this.onPalFreed(event.robot),
      swoop: () => this.nameRobot('swoop', event.robot),
      hop: () => this.nameRobot('hop', event.robot),
      arrived: () => this.onArrived(),
    };
    handlers[event.type]?.();
  }

  /* ---------- naming what's new ---------- */

  /**
   * The first time one of this level's new things turns up, its name floats over it for a moment. at()
   * says where on the screen, or null while it can't be seen, and gone() whether the thing has gone. One
   * name at a time, and nothing is said. A name only counts as shown once it has really come up: one
   * whose thing goes first waits for the next of its kind, and goes with that.
   */
  name(key, at, gone = () => false) {
    const news = this.news?.get(key);
    if (!news || this.named.includes(key)) return;
    const waiting = this.labels.find((label) => label.key === key);
    if (waiting) {
      if (!waiting.pinned) Object.assign(waiting, { at, gone, waited: 0 });
      return;
    }
    const stage = this;
    this.labels.push({
      key,
      news,
      at,
      gone,
      age: 0,
      waited: 0,
      pinned: null,
      // In the language the voice speaks, which a grown-up can change in the middle of a game.
      get words() {
        return stage.language === 'ka' && news.nameKa ? news.nameKa : news.name;
      },
    });
  }

  /** The name of something new over a robot's head, for as long as it's about. */
  nameRobot(key, robot) {
    const point = new THREE.Vector3();
    this.name(key, () => {
      const view = this.views.get(robot);
      if (!view) return null;
      view.root.localToWorld(point.set(0, (BAR_ABOVE[robot.kind] ?? 3) + (robot.king ? KING_CROWN : 0) + 0.9, 0));
      const at = this.toPixels(point, 0.5);
      // It waits for the robot to come into view.
      return at && at.x > 30 && at.x < this.width - 30 && at.y > 0 && at.y < this.height ? at : null;
    }, () => !this.views.has(robot));
  }

  /**
   * The name of a prize or a power-up, which comes up over it on its way over. A power-up that's got
   * there before its name could come up is still there, on, so its name comes up under its place among
   * the power-ups at the top.
   */
  namePrize(key, prize) {
    const power = prize.kind === 'power' && prize.power !== 'heart' ? prize.power : null;
    const on = () => Boolean(power && this.mission?.powersOn.includes(power));
    this.name(key, () => {
      const look = this.prizeLooks.get(prize);
      if (look?.screen) return { x: look.screen.x, y: look.screen.y - 18 };
      const home = on() ? this.prizeHomes?.[`power:${power}`] : null;
      return home ? { x: home.x, y: home.y } : null;
    }, () => !this.prizeLooks.has(prize) && !on());
  }

  /**
   * Names only come up and count down while the game is being played, not behind the countdown. Each
   * stays where it first came up, over the thing it names: words sliding along with a robot flickered.
   * While none is up, the first in line whose thing can be seen comes up, so one waiting for its thing to
   * come into view, or for the next of its kind, never holds up the others.
   */
  updateLabels(dt) {
    if (!this.playing) return;
    const [showing] = this.labels;
    if (showing?.pinned) {
      showing.age += dt;
      if (showing.age >= LABEL_SECONDS) this.labels.shift();
      return;
    }
    for (const label of [...this.labels]) {
      const at = label.gone() ? null : label.at();
      if (at) {
        // Clear of the chips along the top, where prizes are counted.
        label.pinned = { x: at.x, y: Math.max(at.y, (this.hudBottom ?? 0) + LABEL_BELOW_TOP) };
        this.named.push(label.key);
        this.labels = [label, ...this.labels.filter((other) => other !== label)];
        return;
      }
      // One that has waited a long while goes, and the next of its kind is named instead.
      label.waited += dt;
      if (label.waited >= LABEL_WAITS_AT_MOST) this.labels = this.labels.filter((other) => other !== label);
    }
  }

  /* ---------- prizes ---------- */

  /** Where a prize starts, in the world: where the robot was, the weak spot, or the chest. */
  onPrizeOut(prize) {
    const start = new THREE.Vector3();
    const { source } = prize;
    const view = typeof source === 'object' && source ? this.views.get(source) : null;
    const chest = source === 'chest' ? this.chests.get(prize.place) : null;
    if (source?.kind === 'spot' && this.worldPointOf(source, start)) {
      // The weak spot's own place.
    } else if (view) {
      view.aimPoint(start);
    } else if (chest) {
      chest.topPoint(start);
    } else {
      const group = this.town.places[prize.place] ?? this.group;
      group.localToWorld(start.set(prize.from.x, prize.from.y, -prize.from.z));
    }
    this.prizeLooks.set(prize, { start, side: prize.id % 2 ? 1 : -1, screen: null });
    if (prize.kind === 'power') this.namePrize(prize.power, prize);
    else if (prize.kind === 'bolt') this.namePrize('bolts', prize);
    else if (prize.kind === 'gem' && source !== 'chest') this.namePrize('gems', prize);
    else if (prize.treasure) this.namePrize('treasure', prize);
  }

  /**
   * Where each prize is on the screen: out of where it came from, and over to where it's counted at the
   * top, each to its own counter, or a power-up to its place among the power-ups, or a heart to the
   * hearts. Flying into the crosshair, where the robots are being hit, made too much going on in one
   * place, which flickered. dt is how long since the last frame.
   */
  placePrizes(dt = 0) {
    const { mission, aim } = this;
    const found = [];
    if (!mission?.prizes.length) return found;
    const fallback = aim.seen && this.showSights ? { x: aim.x, y: aim.y } : { x: this.width / 2, y: this.height * 0.84 };
    const homes = this.prizeHomes ?? {};
    const point = new THREE.Vector3();
    const follow = 1 - Math.exp(-HOME_FOLLOW * dt);
    for (const prize of mission.prizes) {
      const look = this.prizeLooks.get(prize);
      if (!look || prize.t < 0) continue;
      const home = (prize.kind === 'power' ? homes[`power:${prize.power}`] : homes[prize.kind]) ?? fallback;
      // It eases over to its counter if that moves, as one appearing beside it can push it along.
      look.to = look.to ? { x: look.to.x + (home.x - look.to.x) * follow, y: look.to.y + (home.y - look.to.y) * follow } : { ...home };
      const to = look.to;
      const t = Math.min(1, prize.t);
      const out = Math.min(1, t / 0.3);
      point.copy(look.start);
      point.x += look.side * 0.8 * out;
      point.y += Math.sin((out * Math.PI) / 2) * 1.1;
      // Where it came from, on the screen, or where that last was if the tram has turned away from it.
      const from = this.toPixels(point, 0.3) ?? look.from;
      if (!from) continue;
      look.from = { x: from.x, y: from.y };
      const along = t < 0.3 ? 0 : (t - 0.3) / 0.7;
      const s = along * along * (3 - 2 * along);
      const arc = Math.sin(Math.PI * s) * 46 * look.side;
      const x = from.x + (to.x - from.x) * s + arc;
      const y = from.y + (to.y - from.y) * s - Math.abs(arc) * 0.4;
      look.screen = { x, y };
      // It shrinks and fades into the crosshair at the end, rather than landing in it, as a few of them
      // arriving one after the other flickered there.
      const alpha = 0.85 * Math.min(1, t / 0.12) * (t > 0.62 ? Math.max(0, (1 - t) / 0.38) : 1);
      found.push({ x, y, kind: prize.kind, mark: prize.kind === 'power' ? POWERS[prize.power]?.mark : null, alpha, size: Math.max(18, this.height * 0.036) * (1 - s * 0.6) });
    }
    return found;
  }

  /* ---------- the new kinds of robot ---------- */

  /** A robot floating in a bubble: the bubble grows round it, and it floats up a little. */
  onBubbled(robot) {
    if (this.bubbles.has(robot)) return;
    const mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.bubbleLook, transparent: true, depthWrite: false }));
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);
    this.bubbles.set(robot, { mesh, share: 0, rise: 0, size: BUBBLE_SIZE[robot.kind] ?? 1.4 });
  }

  updateBubbles(dt) {
    const point = new THREE.Vector3();
    for (const [robot, bubble] of this.bubbles) {
      const view = this.views.get(robot);
      const inside = Boolean(view) && robot.bubbled > 0;
      // It fades in and out at its full size, at a steady rate, so it never pops in or out, and its edge
      // doesn't sweep across the picture as it would if it grew.
      bubble.share = clamp(bubble.share + ((inside ? 1 : -1) * dt) / BUBBLE_FADE_SECONDS, 0, 1);
      bubble.rise = clamp(bubble.rise + ((inside ? 1 : -1) * dt) / BUBBLE_RISE_SECONDS, 0, 1);
      if (view) {
        view.root.position.y += BUBBLE_FLOAT * bubble.rise * bubble.rise * (3 - 2 * bubble.rise);
        view.aimPoint(point);
        // In front of the robot, towards the tram, so that it's round the robot rather than behind it.
        const camera = this.camera.getWorldPosition(this.scratch2);
        bubble.mesh.position.copy(point).addScaledVector(camera.sub(point).normalize(), bubble.size * 0.9);
      }
      const wobble = this.reducedMotion ? 0 : Math.sin(this.time * 3 + robot.id) * 0.03;
      const across = 2 * bubble.size;
      bubble.mesh.scale.set(across * (1 + wobble), across * (1 - wobble), 1);
      bubble.mesh.material.opacity = bubble.share;
      if (!inside && bubble.share === 0) {
        bubble.mesh.material.dispose();
        bubble.mesh.removeFromParent();
        this.bubbles.delete(robot);
      }
    }
  }

  onBonk(robot) {
    const view = this.views.get(robot);
    if (!view?.lid) return;
    view.bonk();
    // A little star now and then, as they come thick and fast.
    if ((robot.bonks ?? 0) % 3 !== 1) return;
    const at = view.lid.getWorldPosition(this.scratch);
    this.burst({ at, colours: ['#ffd23f'], count: 1, speed: 2.2, shapes: ['star'], size: 0.2, life: 0.3, gravity: 5, opacity: 0.8 });
  }

  /** The lid falls off, spinning, and is gone. */
  onLidOff(robot) {
    const view = this.views.get(robot);
    if (!view?.lid) return;
    const { lid } = view;
    view.lid = null;
    this.throwAway(lid, 1);
  }

  /** Something knocked off flies a little way, bounces and shrinks away, like the bits of a robot. */
  throwAway(thing, power = 1) {
    thing.updateWorldMatrix(true, false);
    this.debris.parent.attach(thing);
    this.debris.bits.push({ bit: thing, life: 1.4, vx: (Math.random() - 0.5) * 4 * power, vy: 3.2 * Math.sqrt(power), vz: 1.2, spinX: (Math.random() - 0.5) * 7, spinZ: (Math.random() - 0.5) * 7, floor: 0.25 });
  }

  onSplit(robot) {
    const at = this.scratch.set(robot.x, 1.4, -robot.z);
    this.group.localToWorld(at);
    for (let i = 0; i < (this.reducedMotion ? 2 : 4); i += 1) {
      this.sparks.emit({ shape: 'puff', colour: '#a9b4c2', at: { x: at.x + between(-0.6, 0.6), y: at.y + between(-0.3, 0.4), z: at.z }, velocity: [between(-0.7, 0.7), between(0.4, 1.2), 0], life: 0.9, size: 0.8, grow: 0.9, opacity: 0.65, drag: 0.8 });
    }
  }

  /** The golden robot's key flies over to the chest, turning slowly. */
  onKey(robot) {
    const chest = this.chests.get(this.mission.place?.id);
    const view = this.views.get(robot);
    if (!chest || !view) return;
    const key = makeKey();
    const from = view.aimPoint(new THREE.Vector3());
    key.position.copy(from);
    this.scene.add(key);
    this.keys.push({ key, from, chest, age: 0 });
  }

  updateKeys(dt) {
    const to = new THREE.Vector3();
    for (const flight of this.keys) {
      flight.age += dt;
      const share = Math.min(1, flight.age / KEY_SECONDS);
      const s = share * share * (3 - 2 * share);
      flight.chest.topPoint(to);
      flight.key.position.lerpVectors(flight.from, to, s);
      flight.key.position.y += Math.sin(Math.PI * s) * 2.2;
      flight.key.rotation.y += dt * (this.reducedMotion ? 1 : 3);
      flight.key.scale.setScalar(1.9 * (share > 0.85 ? Math.max(0.05, (1 - share) / 0.15) : 1));
      if (share === 1) flight.key.removeFromParent();
    }
    this.keys = this.keys.filter(({ key }) => key.parent);
  }

  onChestOpen(place) {
    const chest = this.chests.get(place?.id);
    if (!chest) return;
    chest.open = true;
    const at = chest.topPoint(this.scratch).clone();
    this.burst({ at, colours: ['#ffd23f', '#7fe7ff', '#ff9fd0'], count: 8, speed: 3, shapes: ['star'], size: 0.3, life: 0.7, gravity: 3 });
  }

  /** The friend a drone was carrying floats down under a parachute, cheering. */
  onPalFreed(robot) {
    const view = this.views.get(robot);
    if (!view?.cage) return;
    this.town.places[view.place.id].attach(view.cage);
    this.floating.push(new FloatingCage(view, this.reducedMotion, this.landingFor(view.place.id, view.cage.position.x, -view.cage.position.z)));
    view.friend = null; // It belongs to the cage floating down now.
  }

  /**
   * Where something floating down at a place lands, in its own metres: on the street, on the canal's
   * bridge clear of its low walls, or on the water, where it bobs.
   */
  landingFor(id, x, z) {
    if (id === 'canal' && z > 9.5 && z < 24.5) {
      return Math.abs(x) < 4.6 ? { x: clamp(x, -3.6, 3.6), y: 0 } : { x: Math.sign(x) * Math.max(Math.abs(x), 5.7), y: WATER_LEVEL - 0.05, water: true };
    }
    if (id === 'harbour' && x < -13.3 + 0.223 * z) return { x, y: WATER_LEVEL - 0.05, water: true };
    return { x, y: 0 };
  }

  /** At the last stop on level 10, the robot king. */
  onArrived() {
    const big = this.mission?.robots.find(({ kind }) => kind === 'big');
    if (big?.king) this.nameRobot('king', big);
  }

  addRobot(robot) {
    const { place } = this.mission;
    const style = place.covers[robot.cover ?? 0][2];
    const view = makeRobotView(robot, this.reducedMotion, COVER_HEIGHT[style], robot.pal ? carriedFriend(characterById(robot.pal)) : null);
    view.place = place;
    if (SHADOWS[robot.kind]) view.root.add(blobShadow(this.shadowPaint, SHADOWS[robot.kind]));
    this.town.places[place.id].add(view.root);
    this.views.set(robot, view);
    const news = { lid: 'lids', splitter: 'splitters', carrier: 'carrier', roller: 'rollers', keybot: 'keyChest' }[robot.kind];
    if (news) this.nameRobot(news, robot);
  }

  burst({ at, colours, count, speed = 5, shapes = ['star'], size = 0.34, life = 0.55, gravity = 8, drag = 0.6, opacity = 1 }) {
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
        opacity,
      });
    }
  }

  onRobotHit({ robot, shot }) {
    const view = this.views.get(robot);
    if (!view) return;
    view.splat(shot.colour);
    const at = view.aimPoint(this.scratch);
    // A small drop in the shot's own colour, now and then. White ones, or more of them, flickered, as
    // they all fly out from the one place.
    if (shot.id % 2) this.burst({ at, colours: [SHOT_COLOURS[shot.colour]], count: 1, speed: 3, shapes: ['ball'], size: 0.15, life: 0.3, gravity: 6, opacity: 0.7 });
  }

  onRobotDropped(robot) {
    const view = this.views.get(robot);
    if (!view) return;
    this.views.delete(robot);
    this.dropHeld(robot);
    const big = robot.kind === 'big';
    const at = view.aimPoint(this.scratch).clone();
    const colours = ['#ffd23f', '#c9d3dd', '#ff8f3f', '#7fe7ff'];
    this.burst({ at, colours, count: big ? 40 : 3, speed: big ? 11 : 3.5, shapes: ['gear', 'bolt', 'star'], size: big ? 0.8 : 0.36, life: big ? 1.3 : 0.75, gravity: 11 });
    // Puffs of smoke.
    const puffs = this.reducedMotion ? 2 : big ? 14 : 3;
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
    // The king loses a bit of his finery with each one, until the last, when all of him goes.
    if (robot.king && robot.spots.some(({ done }) => !done)) {
      const part = view.knockOff();
      if (part) this.throwAway(part, 2.2);
    }
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

  onGooBlocked(goo, bubble = false) {
    this.removeGoo(goo);
    if (bubble) this.sights.hitBubble();
    else this.sights.hitShield();
  }

  onGooHit(goo) {
    this.removeGoo(goo);
    this.sights.hitInCorner();
  }

  /**
   * A shot leaves the blaster. A little puff comes out of it now and then, not with every shot: the
   * same thing in the same place five times a second flickered there.
   */
  onShot() {
    this.blaster.updateWorldMatrix(true, false);
    const at = this.blaster.localToWorld(this.scratch.set(0, 0.03, 1));
    this.muzzle.copy(at);
    this.puffIn = (this.puffIn ?? 0) - 1;
    if (this.puffIn > 0) return;
    this.puffIn = 4;
    this.sparks.emit({ shape: 'puff', colour: '#ffffff', at, velocity: [between(-0.4, 0.4), between(0.2, 0.7), 0], life: 0.3, size: 0.1, grow: 0.5, opacity: 0.35 });
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
    // It sits back a little while it's firing. It used to kick back with each shot, which, five times a
    // second, flickered round its edges.
    const firing = this.mission?.blaster.firing ? (this.reducedMotion ? 0.3 : 1) : 0;
    this.recoil = damp(this.recoil, firing, 7, dt);
    const down = this.shieldLevel * 0.05;
    blaster.position.set(BLASTER_AT.x, this.blasterY - down, BLASTER_AT.z + this.recoil * 0.03);
    const charge = this.mission?.blaster.charge ?? 1;
    blaster.userData.fluid.scale.z = Math.max(0.02, charge);
    blaster.userData.fluid.visible = charge > 0.01;
  }

  /** Where a shot is going: what it was aimed at, or where that was when it went. */
  shotEnd(shot) {
    const to = shot.target ? this.worldPointOf(shot.target, this.scratch2) : null;
    if (to) shot.lastAt = (shot.lastAt ?? new THREE.Vector3()).copy(to);
    return shot.lastAt ?? null;
  }

  placeShots() {
    const { mission, shotSprites } = this;
    const shots = mission?.shots ?? [];
    this.blaster.updateWorldMatrix(true, false);
    const from = this.blaster.localToWorld(this.scratch.set(0, 0.03, 1)).clone();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    const ahead = new THREE.Vector3();
    shotSprites.forEach((sprite, index) => {
      const shot = shots[index];
      sprite.visible = Boolean(shot);
      if (!shot) return;
      const end = this.shotEnd(shot);
      if (!end) {
        sprite.visible = false;
        return;
      }
      const kind = shot.kind ?? 'paint';
      // A boing ball bouncing on starts from where the last one landed.
      const start = shot.from?.lastAt ?? from;
      const share = 1 - shot.left / shot.flight;
      const place = (at, into) => {
        into.lerpVectors(start, end, at);
        const bulge = Math.sin(Math.PI * at);
        if (kind === 'boing' && shot.from) into.y += bulge * 1.1;
        if (kind === 'plane') into.addScaledVector(right, bulge * 0.9 * (shot.id % 2 ? 1 : -1)).y += bulge * 0.5;
        return into;
      };
      place(share, sprite.position);
      const { material } = sprite;
      material.map = this.shotLooks[kind] ?? this.shotLooks.paint;
      material.color.set(kind === 'paint' ? SHOT_COLOURS[shot.colour] : '#ffffff');
      // It fades as it gets there, so that a stream of them landing doesn't flicker.
      material.opacity = (shot.side ? SIDE_OPACITY : SHOT_OPACITY[kind] ?? 0.52) * (share > 0.75 ? Math.max(0, (1 - share) / 0.25) * 0.7 + 0.3 : 1);
      material.rotation = 0;
      if (kind === 'plane') {
        const now = this.toPixels(sprite.position, 1);
        const next = this.toPixels(place(Math.min(1, share + 0.05), ahead), 1);
        if (now && next) material.rotation = Math.atan2(now.y - next.y, next.x - now.x);
      }
      // It looks the same size however far it's got, and a bit smaller as it gets there.
      const far = sprite.position.distanceTo(this.cameraPosition ?? from);
      sprite.scale.setScalar(far * SHOT_LOOKS * (SHOT_SIZE[kind] ?? 1) * (1.05 - share * 0.4));
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
    // A few drips behind goo on its way. A drip every tenth of a second, one after the other along the
    // same way, flickered there.
    this.trailIn -= dt;
    if (this.trailIn <= 0 && this.gooViews.size && !this.reducedMotion) {
      this.trailIn = 0.24;
      for (const mesh of this.gooViews.values()) {
        const at = mesh.getWorldPosition(this.scratch);
        this.sparks.emit({ shape: 'ball', colour: '#a9ea55', at: { x: at.x + between(-0.15, 0.15), y: at.y + between(-0.15, 0.15), z: at.z }, velocity: [0, -0.5, 0], life: 0.4, size: 0.15, gravity: 2, opacity: 0.6 });
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
    this.updateBubbles(dt);
    this.updateKeys(dt);
    for (const chest of this.chests.values()) chest.update(dt);
    this.floating = this.floating.filter((floating) => floating.update(dt));
    this.updateLabels(dt);
    // The shield bubble from a power-up comes and goes at a steady rate.
    const guard = this.mission?.guarded && this.showSights ? 1 : 0;
    this.guardShare = clamp(this.guardShare + ((guard ? 1 : -1) * dt) / GUARD_SECONDS, 0, 1);
    this.aimBlaster(dt);
    this.placeShots();
    this.sights.update(dt);
    this.drawSights(dt);
  }

  crosshairLook() {
    const { handState, mission, aim } = this;
    if (!aim.seen || handState === 'none' || handState === 'unsure') return 'lost';
    if (handState === 'closed') return 'shield';
    if (mission?.blaster.charge <= 0 || mission?.blaster.fillingItself) return 'empty';
    if (aim.locked) this.lockedAt = this.time;
    // It keeps its firing look for a moment while it goes on to the next robot. Flicking to the other
    // look and straight back, each time a robot fell apart, flickered in the middle of the picture.
    return aim.locked || this.time - (this.lockedAt ?? -Infinity) < LOOK_HOLD_SECONDS ? 'firing' : 'ready';
  }

  drawSights(dt = 0) {
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
          // Over the king's crown, rather than on it.
          view.root.localToWorld(point.set(0, BAR_ABOVE.big + (robot.king ? KING_CROWN : 0), 0));
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
    const [label] = this.labels;
    const labelAt = label && this.showSights && this.playing ? label.pinned : null;
    sights.draw({
      playing: this.showSights,
      bars,
      warnings,
      lock,
      prizes: this.showSights ? this.placePrizes(dt) : [],
      guard: this.guardShare,
      label: labelAt ? { x: labelAt.x, y: labelAt.y, words: label.words, alpha: Math.min(1, label.age / 0.4, (LABEL_SECONDS - label.age) / 0.6) } : null,
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
