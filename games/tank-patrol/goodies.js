// What the higher levels bring onto the valley floor: the prizes stopped tanks leave behind, the crates
// with power-ups in them, and the cage with a friend in it. The rules for all of them are in patrol.js,
// and this only shows what they say.
//
// Nothing flashes. Prizes and crates are soft-edged pictures in steady colours, which grow in gently and
// roll or drift over to the child's tank, and a cage opens by its bars sinking slowly into the ground.
import * as THREE from '../../vendor/three/three.module.js';
import { Fighter3D, ball, makePose, mergeParts, outlineMaterial, toon } from '../../core/body/characters.js';
import { byId } from '../../core/body/roster.js';
import { POWERS, PRIZES } from './patrol.js';

const INK = '#1d2740';
const PRIZE_SIZE = { bolt: 2.3, gem: 2.6, star: 2.6, chest: 4.4 };
const CRATE_SIZE = 5.4;
const FRIEND_SIZE = 3;
const GROW_SECONDS = 0.35;
const CRATE_COLOURS = { spread: '#fff1c2', bubble: '#9fd3ff', heart: '#ffe0ea', boing: '#ffe0cc', magnet: '#eef2f6', slow: '#e3f3cf' };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const easeOut = (share) => 1 - (1 - share) ** 3;

function pictureTexture(draw, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 100, size / 100);
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function emoji(ctx, mark, size, y = 2) {
  ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mark, 0, y);
}

/** A prize: its picture on a soft round badge, so it shows up on grass, water or road. */
const prizePicture = (mark) => pictureTexture((ctx) => {
  ctx.fillStyle = 'rgb(255 250 232 / 0.92)';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  emoji(ctx, mark, 52);
});

/** A wooden crate, with what's in it on the front, on a colour of its own. */
const cratePicture = (mark, behind) => pictureTexture((ctx) => {
  ctx.fillStyle = '#d29a55';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(-44, -44, 88, 88, 12);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#a8713a';
  ctx.lineWidth = 6;
  for (const y of [-30, 30]) {
    ctx.beginPath();
    ctx.moveTo(-40, y);
    ctx.lineTo(40, y);
    ctx.stroke();
  }
  ctx.fillStyle = behind;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 27, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  emoji(ctx, mark, 36);
});

/** The boss's treasure chest. */
const chestPicture = () => pictureTexture((ctx) => {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.fillStyle = '#b5652b';
  ctx.beginPath();
  ctx.roundRect(-42, -8, 84, 46, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#c97a3a';
  ctx.beginPath();
  ctx.moveTo(-42, -8);
  ctx.quadraticCurveTo(0, -48, 42, -8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  for (const x of [-26, 22]) {
    ctx.beginPath();
    ctx.rect(x, -24, 8, 62);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.roundRect(-9, -2, 18, 18, 4);
  ctx.fill();
  ctx.stroke();
});

const marks = { bolt: PRIZES.bolt.mark, gem: PRIZES.gem.mark, star: PRIZES.star.mark };

export class Loot {
  constructor(scene, shadowTexture, reducedMotion) {
    this.scene = scene;
    this.reducedMotion = reducedMotion;
    this.shadowTexture = shadowTexture;
    this.pictures = {
      ...Object.fromEntries(Object.entries(marks).map(([type, mark]) => [type, prizePicture(mark)])),
      chest: chestPicture(),
      ...Object.fromEntries(Object.entries(POWERS).map(([name, { mark }]) => [`crate-${name}`, cratePicture(mark, CRATE_COLOURS[name])])),
    };
    this.materials = new Map();
    this.shown = new Map();
    this.time = 0;
  }

  material(key) {
    // Drawn over everything, like the marks, so a prize is never lost behind a tank or a house.
    if (!this.materials.has(key)) this.materials.set(key, new THREE.SpriteMaterial({ map: this.pictures[key], transparent: true, depthWrite: false, depthTest: false }));
    return this.materials.get(key);
  }

  add(thing, key, size) {
    const sprite = new THREE.Sprite(this.material(key));
    sprite.renderOrder = 10;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.shadowTexture, color: '#102a22', transparent: true, opacity: 0.32, depthWrite: false }));
    shadow.renderOrder = 1;
    this.scene.add(sprite, shadow);
    const view = { sprite, shadow, size, age: 0 };
    this.shown.set(thing, view);
    return view;
  }

  remove(thing) {
    const view = this.shown.get(thing);
    view.sprite.removeFromParent();
    view.shadow.removeFromParent();
    view.shadow.geometry.dispose();
    view.shadow.material.dispose();
    this.shown.delete(thing);
  }

  clear() {
    for (const thing of [...this.shown.keys()]) this.remove(thing);
  }

  /** Each frame: a picture for every prize and crate there is, and none for those that have gone. */
  update(dt, patrol) {
    this.time += dt;
    const here = new Set();
    for (const prize of patrol?.prizes ?? []) {
      here.add(prize);
      const view = this.shown.get(prize) ?? this.add(prize, prize.type, PRIZE_SIZE[prize.type]);
      view.age += dt;
      // A hop or two where it fell, and then a little bounce as it rolls along.
      const settling = clamp(1 - prize.age / 0.9, 0, 1);
      const hop = this.reducedMotion ? 0 : Math.abs(Math.sin(prize.age * 7 + prize.id)) * (0.4 + settling * 1.4);
      this.place(view, prize, 1.3 + hop);
    }
    for (const crate of patrol?.crates ?? []) {
      here.add(crate);
      const view = this.shown.get(crate) ?? this.add(crate, `crate-${crate.power}`, CRATE_SIZE);
      view.age += dt;
      const bob = this.reducedMotion ? 0 : Math.sin(this.time * 2.1 + crate.id) * 0.35;
      this.place(view, crate, 2.6 + bob);
    }
    for (const thing of [...this.shown.keys()]) if (!here.has(thing)) this.remove(thing);
  }

  place(view, { x, y, z }, up) {
    const grown = easeOut(clamp(view.age / GROW_SECONDS, 0, 1));
    const size = view.size * (0.3 + 0.7 * grown);
    view.sprite.scale.set(size, size, 1);
    view.sprite.position.set(x, y + up, z);
    view.shadow.position.set(x + 0.3, y + 0.13, z + 0.2);
    view.shadow.scale.set(size * 0.8, 1, size * 0.5);
  }
}

/* ------------------------------- the cage ------------------------------- */

const BARS = 10;
const CAGE_RADIUS = 2.6;
const CAGE_HEIGHT = 5.4;

/** A round cage with a friend from the other games in it, who hops out and waves when it opens. */
export class CageView {
  constructor(cage, scene, reducedMotion) {
    this.cage = cage;
    this.scene = scene;
    this.reducedMotion = reducedMotion;
    this.time = Math.random() * 5;
    this.root = new THREE.Group();
    this.root.position.set(cage.x, cage.y, cage.z);
    scene.add(this.root);
    const paint = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() });
    const line = outlineMaterial(INK, 0.06);
    this.materials = [paint, line];
    const solid = (parts) => {
      const geometry = mergeParts(parts);
      const group = new THREE.Group();
      group.add(new THREE.Mesh(geometry, paint), new THREE.Mesh(geometry, line));
      return group;
    };
    this.floor = solid([{ geometry: new THREE.CylinderGeometry(CAGE_RADIUS + 0.4, CAGE_RADIUS + 0.6, 0.5, 24), colour: '#8a8fa8', at: [0, 0.25, 0] }]);
    const bars = [];
    for (let i = 0; i < BARS; i += 1) {
      const angle = (i / BARS) * Math.PI * 2;
      bars.push({ geometry: new THREE.CylinderGeometry(0.13, 0.13, CAGE_HEIGHT, 8), colour: '#8f9ab5', at: [Math.sin(angle) * CAGE_RADIUS, CAGE_HEIGHT / 2 + 0.4, Math.cos(angle) * CAGE_RADIUS] });
    }
    // An open ring on top, rather than a roof, so the friend inside can be seen from above.
    bars.push({ geometry: new THREE.TorusGeometry(CAGE_RADIUS, 0.24, 8, 28).rotateX(Math.PI / 2), colour: '#ff6f61', at: [0, CAGE_HEIGHT + 0.4, 0] });
    bars.push({ geometry: new THREE.TorusGeometry(CAGE_RADIUS, 0.16, 8, 28).rotateX(Math.PI / 2), colour: '#8f9ab5', at: [0, CAGE_HEIGHT * 0.5, 0] });
    for (let i = 0; i < 2; i += 1) bars.push({ geometry: new THREE.CylinderGeometry(0.12, 0.12, CAGE_RADIUS * 2, 8).rotateZ(Math.PI / 2).rotateY(i * Math.PI / 2), colour: '#ff6f61', at: [0, CAGE_HEIGHT + 0.4, 0] });
    bars.push({ geometry: ball(0.5), colour: '#ffd23f', at: [0, CAGE_HEIGHT + 0.7, 0] });
    this.bars = solid(bars);
    this.root.add(this.floor, this.bars);

    this.friend = new Fighter3D(byId(cage.friend));
    this.friend.root.scale.setScalar(FRIEND_SIZE);
    this.friend.root.position.y = 0.5;
    this.friend.setExpression('hurt');
    this.root.add(this.friend.root);
    this.pose = makePose();
    this.opened = 0;
    this.away = 0;
    this.wobble = 0;
  }

  hit() {
    this.wobble = 1;
  }

  open() {
    this.friend.setExpression('happy');
  }

  /** childAt is where the child's tank is, which the friend hops over to and climbs aboard. */
  update(dt, childAt) {
    const { cage, friend, pose, reducedMotion } = this;
    this.time += dt;
    this.wobble = Math.max(0, this.wobble - dt * 3);
    const shake = reducedMotion ? 0 : this.wobble * this.wobble * 0.12;
    this.bars.rotation.z = Math.sin(this.time * 30) * shake;
    const open = cage.state === 'open';
    if (open) this.opened = Math.min(1, this.opened + dt / 1.1);
    // The bars sink into the ground.
    this.bars.position.y = -this.opened * (CAGE_HEIGHT + 2.6);
    this.bars.visible = this.opened < 1;
    // Inside, the friend waves for help. Out, they jump for joy and hop over to the child's tank.
    const waving = reducedMotion ? 0.2 : Math.sin(this.time * (open ? 9 : 5)) * 0.25;
    Object.assign(pose, {
      handRX: -0.5 + waving,
      handRY: open ? 0.7 : 0.45,
      handRZ: 0.2,
      handLX: open ? 0.5 - waving : 0.42,
      handLY: open ? 0.7 : -0.6,
      handLZ: 0.2,
      headTurn: Math.sin(this.time * 0.8) * (reducedMotion ? 0 : 0.2),
    });
    friend.setPose(pose);
    friend.update(dt);
    friend.root.rotation.y = 0;
    if (!open || this.opened < 1) {
      friend.root.position.set(0, 0.5 + (open && !reducedMotion ? Math.abs(Math.sin(this.time * 6)) * 0.6 : 0), 0);
      return;
    }
    this.away = Math.min(1, this.away + dt / 3.2);
    const share = easeOut(this.away);
    const from = { x: cage.x, z: cage.z };
    const x = from.x + (childAt.x - from.x) * share;
    const z = from.z + (childAt.z - from.z) * share;
    const hops = reducedMotion ? 0 : Math.abs(Math.sin(this.away * Math.PI * 5)) * 1.6;
    friend.root.position.set(x - cage.x, (childAt.y - cage.y) * share + 0.5 + hops, z - cage.z);
    friend.root.scale.setScalar(FRIEND_SIZE * (this.away > 0.85 ? clamp((1 - this.away) / 0.15, 0.01, 1) : 1));
    friend.root.visible = this.away < 1;
    this.floor.scale.setScalar(Math.max(0.01, 1 - this.away));
    this.floor.visible = this.away < 1;
  }

  dispose() {
    this.root.removeFromParent();
    this.root.traverse((node) => node.geometry?.dispose());
    for (const material of this.materials) material.dispose();
  }
}
