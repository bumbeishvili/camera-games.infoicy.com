// The way home: the land going by behind Joze, the tree at each stop, and the glove that picks fruit
// and carries it to his mouth. Joze himself is 3D, on his own canvas between the land and everything
// else. The tree grows on the side of the hand being played with, so feeding him is a reach across.
//
// Nothing flashes: seizures are more common in children with hemiplegia.
import { LOOKS, paintFruit } from '../../core/fruit.js';
import { Glove, INK } from '../../core/glove.js';
import { Picking } from './journey.js';

const PALM_SHARE = 0.105;
const FRUIT_SHARE = 0.07;
const PICK_REACH = 1.2; // How far a hand can be from a fruit and still pick it, in palm lengths.
const MOUTH_REACH = 0.17; // How close to his mouth counts, as a share of the screen's height.
const SCROLL_SPEED = 0.34; // Screen widths a second, while walking.
const GRAVITY = 1.5;
const BACK_ON_TREE_SECONDS = 0.4;
const REACH_HELP = { none: 0, little: 0.05, lots: 0.11 }; // How much nearer the tree comes.

const PLACES = {
  baobab: { sky: ['#ffd9a0', '#fff1d6'], far: '#e9c98b', near: '#d8a860', tree: '#6f8f3f' },
  grass: { sky: ['#8fd2fa', '#e6f7ff'], far: '#b9dd7f', near: '#94c85c', tree: '#4f9f47' },
  river: { sky: ['#a7d8f5', '#f6ecd4'], far: '#d9c08f', near: '#c9a56b', tree: '#6a9b4e' },
  hill: { sky: ['#7cc0f0', '#e4f4ff'], far: '#a4b7a8', near: '#8ba77a', tree: '#4b8c52' },
  home: { sky: ['#ffb98a', '#ffe9c4'], far: '#9bd0d6', near: '#7fc47a', tree: '#3f9d5b' },
};

const between = (low, high) => low + Math.random() * (high - low);

export class Walk {
  /** events: onPick(), onFed(side), onDropped(), onWalked() */
  constructor({ backdrop, canvas }, events = {}) {
    this.backdropCanvas = backdrop;
    this.back = backdrop.getContext('2d', { alpha: false });
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.events = events;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    this.sprites = Object.fromEntries(Object.keys(LOOKS).map((kind) => [kind, paintFruit(kind)]));
    this.picking = new Picking();
    this.side = 'right';
    this.reach = 'little';
    this.aspect = 16 / 9;
    this.time = 0;
    this.fruit = [];
    this.bits = [];
    this.place = 'baobab';
    this.fromPlace = null;
    this.fade = 1;
    this.scroll = 0;
    this.walking = 0;
    this.treeShift = 0;
    this.mouth = { x: 0, y: 0 };
    this.fed = { left: 0, right: 0 };
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    for (const canvas of [this.backdropCanvas, this.canvas]) {
      canvas.width = Math.round(this.width * this.ratio);
      canvas.height = Math.round(this.height * this.ratio);
    }
    this.palmSize = Math.max(44, this.height * PALM_SHARE);
    this.fruitSize = Math.max(26, this.height * FRUIT_SHARE);
    this.scenes = {};
  }

  /** A wide picture of a place, for going by behind Joze. It's only drawn once. */
  sceneFor(name) {
    if (this.scenes[name]) return this.scenes[name];
    const { width, height, ratio } = this;
    const look = PLACES[name];
    const scene = document.createElement('canvas');
    scene.width = Math.round(width * ratio * 2);
    scene.height = Math.round(height * ratio);
    const ctx = scene.getContext('2d');
    ctx.scale(ratio, ratio);
    const sky = ctx.createLinearGradient(0, 0, 0, height * 0.75);
    sky.addColorStop(0, look.sky[0]);
    sky.addColorStop(1, look.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width * 2, height);
    const hills = (colour, base, size, waves) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width * 2; x += 10) {
        // Whole waves across the picture, so that its two ends meet when it repeats.
        const u = (x / (width * 2)) * Math.PI * 2;
        ctx.lineTo(x, height * base - height * size * (Math.sin(u * waves) * 0.6 + Math.sin(u * waves * 2 + 1) * 0.4));
      }
      ctx.lineTo(width * 2, height);
      ctx.closePath();
      ctx.fill();
    };
    hills(look.far, 0.66, 0.07, 3);
    hills(look.near, 0.8, 0.04, 5);
    if (name === 'home') {
      // The watering hole, at last.
      ctx.fillStyle = '#5db8e8';
      ctx.beginPath();
      ctx.ellipse(width * 0.5, height * 0.86, width * 0.4, height * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    this.scenes[name] = scene;
    return scene;
  }

  /** Where the fruit hangs at this stop, within reach of the hand. */
  hangFruit(kind, count) {
    const { width, height, side } = this;
    const help = REACH_HELP[this.reach];
    const across = side === 'right' ? 0.76 - help : 0.24 + help;
    const spots = [[0, 0.34], [-0.09, 0.47], [0.09, 0.47], [0, 0.6], [-0.09, 0.22], [0.09, 0.22]];
    // One more than is needed, so that there's a choice.
    this.fruit = Array.from({ length: count + 1 }, (_, index) => ({
      kind,
      homeX: (across + spots[index % spots.length][0]) * width,
      homeY: spots[index % spots.length][1] * height,
      x: 0,
      y: 0,
      state: 'hanging', // hanging, held, falling or gone
      r: this.fruitSize,
      vy: 0,
      backIn: 0,
    }));
    for (const fruit of this.fruit) {
      fruit.x = fruit.homeX;
      fruit.y = fruit.homeY;
    }
    this.treeAcross = across;
  }

  /** Off to somewhere else, with the land going by. */
  walkTo(place, seconds) {
    this.fromPlace = this.place;
    this.place = place;
    this.fade = 0;
    this.walking = seconds;
    this.walkLasts = seconds;
    this.fruit = [];
    this.picking = new Picking();
  }

  arriveAt(place) {
    this.place = place;
    this.fromPlace = null;
    this.fade = 1;
    this.walking = 0;
  }

  /** Where his mouth is, on the page, from the 3D picture of him. */
  setMouth(x, y) {
    this.mouth = { x, y };
  }

  get holding() {
    return this.picking.held;
  }

  get onMouth() {
    const glove = this.gloves[this.side];
    return glove.visible && Math.hypot(glove.x - this.mouth.x, glove.y - this.mouth.y) <= this.height * MOUTH_REACH;
  }

  /**
   * The fruit a hand is around, if any. Closing a hand brings its fingers in, which takes fingertips
   * off a fruit they were just on, so it's about the hand being there rather than touching it.
   */
  fruitNear(glove) {
    const reach = this.palmSize * PICK_REACH;
    return this.fruit.find((fruit) => fruit.state === 'hanging' && Math.hypot(fruit.x - glove.x, fruit.y - glove.y) <= reach + fruit.r) ?? null;
  }

  update(dt, snapshot, { aspect = this.aspect, playing = false, showHands = false } = {}) {
    this.time += dt;
    this.aspect = aspect;
    for (const side of ['left', 'right']) {
      const glove = this.gloves[side];
      if (showHands && snapshot?.side === side) glove.follow(snapshot[side], dt, this);
      else glove.hide();
    }

    if (this.walking > 0) {
      this.walking = Math.max(0, this.walking - dt);
      this.scroll += SCROLL_SPEED * dt * (this.side === 'right' ? 1 : -1);
      this.fade = 1 - this.walking / this.walkLasts;
      if (this.walking === 0) {
        this.fromPlace = null;
        this.events.onWalked?.();
      }
    }

    if (playing && this.fruit.length) this.handleHand(dt);
    this.moveFruit(dt);
  }

  handleHand(dt) {
    const glove = this.gloves[this.side];
    const seen = glove.visible;
    const { onMouth } = this;
    const before = this.picking.held;
    const result = this.picking.update(dt, {
      seen,
      closed: glove.status !== 'open',
      near: seen ? this.fruitNear(glove) : null,
      onMouth,
    });
    if (result === 'picked') {
      this.picking.held.state = 'held';
      this.events.onPick?.();
    } else if (result === 'fed') {
      before.state = 'gone';
      this.fed[this.side] += 1;
      this.burst(before);
      this.events.onFed?.(this.side);
    } else if (result === 'dropped') {
      before.state = 'falling';
      before.vy = 0;
      this.events.onDropped?.();
    }
    if (this.picking.held) {
      this.picking.held.x = glove.x;
      this.picking.held.y = glove.y;
    }
  }

  moveFruit(dt) {
    for (const fruit of this.fruit) {
      if (fruit.state !== 'falling') continue;
      fruit.vy += GRAVITY * this.height * dt;
      fruit.y += fruit.vy * dt;
      if (fruit.y > this.height + fruit.r * 2) {
        // Back on the tree, after a moment.
        fruit.backIn += dt;
        if (fruit.backIn >= BACK_ON_TREE_SECONDS) Object.assign(fruit, { state: 'hanging', x: fruit.homeX, y: fruit.homeY, vy: 0, backIn: 0 });
      }
    }
    for (const bit of this.bits) {
      bit.life -= dt;
      bit.vy += GRAVITY * this.height * dt * 0.5;
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
    }
    this.bits = this.bits.filter(({ life }) => life > 0);
  }

  /** Some crumbs where the fruit was eaten. */
  burst(fruit) {
    const count = this.reducedMotion ? 3 : 7;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const speed = between(0.1, 0.3) * this.height;
      this.bits.push({ x: this.mouth.x, y: this.mouth.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.45, size: fruit.r * 0.14, colour: LOOKS[fruit.kind].flesh });
    }
  }

  drawTree(ctx) {
    const { height, width } = this;
    const look = PLACES[this.place];
    const x = this.treeAcross * width;
    ctx.fillStyle = '#8a5a34';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, height * 0.004);
    ctx.beginPath();
    ctx.roundRect(x - width * 0.02, height * 0.5, width * 0.04, height * 0.5, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = look.tree;
    for (const [dx, dy, r] of [[0, 0.36, 0.25], [-0.11, 0.44, 0.19], [0.11, 0.44, 0.19], [-0.08, 0.24, 0.16], [0.08, 0.24, 0.16]]) {
      ctx.beginPath();
      ctx.arc(x + dx * width, dy * height, r * height, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  render() {
    const { back, ctx, width, height, ratio } = this;
    back.setTransform(1, 0, 0, 1, 0, 0);
    const drawScene = (name, alpha) => {
      const scene = this.sceneFor(name);
      const offset = (((this.scroll % 2) + 2) % 2) * width * ratio;
      back.globalAlpha = alpha;
      back.drawImage(scene, -offset, 0);
      back.drawImage(scene, scene.width - offset, 0);
    };
    if (this.fromPlace && this.fade < 1) {
      drawScene(this.fromPlace, 1);
      drawScene(this.place, this.fade);
    } else {
      drawScene(this.place, 1);
    }
    back.globalAlpha = 1;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (this.fruit.length) this.drawTree(ctx);
    for (const fruit of this.fruit) {
      if (fruit.state === 'gone' || fruit.state === 'held') continue;
      ctx.drawImage(this.sprites[fruit.kind], fruit.x - fruit.r * 1.2, fruit.y - fruit.r * 1.2, fruit.r * 2.4, fruit.r * 2.4);
    }
    for (const bit of this.bits) {
      ctx.fillStyle = bit.colour;
      ctx.beginPath();
      ctx.arc(bit.x, bit.y, bit.size, 0, Math.PI * 2);
      ctx.fill();
    }
    this.gloves.left.draw(ctx, this.palmSize);
    this.gloves.right.draw(ctx, this.palmSize);
    const held = this.picking.held;
    if (held) ctx.drawImage(this.sprites[held.kind], held.x - held.r * 1.2, held.y - held.r * 1.2, held.r * 2.4, held.r * 2.4);
  }
}
