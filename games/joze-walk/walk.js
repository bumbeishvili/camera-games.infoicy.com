// The way home: the land going by behind Joze, the tree at each stop, and the glove that picks fruit
// and carries it to his mouth. Joze himself is 3D, on his own canvas between the land and everything
// else. The tree grows on the side of the hand being played with, so feeding him is a reach across.
//
// Nothing flashes: seizures are more common in children with hemiplegia. Green fruit ripens slowly,
// and a butterfly's wings beat about once a second.
import { LOOKS, paintFruit } from '../../core/fruit.js';
import { Glove, INK } from '../../core/glove.js';
import { Picking, walkAt } from './journey.js';

const PALM_SHARE = 0.105;
const FRUIT_SHARE = 0.07;
const PICK_REACH = 1.2; // How far a hand can be from a fruit and still pick it, in palm lengths.
const MOUTH_REACH = 0.17; // How close to his mouth counts, as a share of the screen's height.
const SCROLL_SPEED = 0.34; // Screen widths a second, while walking.
const GRAVITY = 1.5;
const BACK_ON_TREE_SECONDS = 0.4;
const REACH_HELP = { none: 0, little: 0.05, lots: 0.11 }; // How much nearer the tree comes.
// Where fruit hangs on the tree, across in screen widths and down in screen heights. The first six are
// where it always hung. The rest, for the higher levels, are between those, so no further to reach.
const SPOTS = [[0, 0.34], [-0.09, 0.47], [0.09, 0.47], [0, 0.6], [-0.09, 0.22], [0.09, 0.22], [0, 0.47], [0.09, 0.6], [-0.09, 0.6], [0, 0.22]];
const UNRIPE_TINT = '#b8ec62'; // A pale lime, which stands out from the leaves.
const WIGGLE_SECONDS = 0.5; // A fruit that can't be picked yet gives a little wiggle when tried.
const BUTTERFLY_ARRIVES = 0.8;
const BUTTERFLY_LEAVES = 1.4;
const TREE_FADE_SECONDS = 0.4; // A tree comes and goes gently, as it's a big part of the picture.

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
    this.greenSprites = {};
    this.level = walkAt(1);
    this.butterfly = null;
    this.butterflyIn = 0;
    this.treeShown = 0;
    this.treeLook = null;
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

  /** What this level brings: see walkAt in journey.js. */
  setLevel(level) {
    this.level = walkAt(level);
    this.butterfly = null;
    this.butterflyIn = this.level.butterflyEvery * 0.5;
  }

  /** Where the fruit hangs at this stop, within reach of the hand. */
  hangFruit(kind, count) {
    const { width, height, side, level } = this;
    const help = REACH_HELP[this.reach];
    const across = side === 'right' ? 0.76 - help : 0.24 + help;
    // One more than is needed, so that there's a choice, and any green fruit on top of that.
    const ripe = count + 1;
    const total = Math.min(SPOTS.length, ripe + level.unripe);
    const spots = SPOTS.slice(0, total);
    // With green fruit about, it could be anywhere among the ripe.
    if (level.unripe) {
      for (let i = spots.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [spots[i], spots[j]] = [spots[j], spots[i]];
      }
    }
    this.fruit = spots.map(([dx, dy], index) => ({
      kind,
      homeX: (across + dx) * width,
      homeY: dy * height,
      x: 0,
      y: 0,
      state: 'hanging', // hanging, held, falling or gone
      r: this.fruitSize,
      vy: 0,
      backIn: 0,
      ripe: index < ripe,
      ripening: index < ripe ? 1 : 0, // From green, at 0, to ripe.
      phase: Math.random() * Math.PI * 2,
      wiggle: 0,
    }));
    this.butterfly = null;
    this.butterflyIn = level.butterflyEvery * 0.5;
    for (const fruit of this.fruit) {
      fruit.x = fruit.homeX;
      fruit.y = fruit.homeY;
    }
    this.treeAcross = across;
    this.treeLook = PLACES[this.place];
  }

  /** Whether a fruit can be picked now: hanging, ripe, and with no butterfly on it. */
  pickable(fruit) {
    return fruit.state === 'hanging' && fruit.ripe && this.butterfly?.fruit !== fruit;
  }

  /** Swaying on its branch, from the higher levels, a little less for anyone who prefers less motion. */
  hang(fruit) {
    const { sway, swayRate } = this.level;
    const swing = sway * (this.reducedMotion ? 0.5 : 1);
    fruit.x = fruit.homeX + Math.sin(this.time * swayRate + fruit.phase) * swing * this.width;
    fruit.y = fruit.homeY + Math.sin(this.time * swayRate * 1.3 + fruit.phase) * swing * 0.3 * this.width;
  }

  /** Off to somewhere else, with the land going by. */
  walkTo(place, seconds) {
    this.fromPlace = this.place;
    this.place = place;
    this.fade = 0;
    this.walking = seconds;
    this.walkLasts = seconds;
    this.fruit = [];
    this.butterfly = null;
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
    return this.fruit.find((fruit) => this.pickable(fruit) && this.isNear(fruit, glove)) ?? null;
  }

  isNear(fruit, glove) {
    return Math.hypot(fruit.x - glove.x, fruit.y - glove.y) <= this.palmSize * PICK_REACH + fruit.r;
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

    const treeWanted = this.fruit.length ? 1 : 0;
    this.treeShown += Math.sign(treeWanted - this.treeShown) * Math.min(Math.abs(treeWanted - this.treeShown), dt / TREE_FADE_SECONDS);
    for (const fruit of this.fruit) {
      if (fruit.state === 'hanging') this.hang(fruit);
      fruit.wiggle = Math.max(0, fruit.wiggle - dt);
    }
    if (playing && this.fruit.length && this.walking === 0) {
      this.ripen(dt);
      this.visit(dt);
    }
    if (playing && this.fruit.length) this.handleHand(dt);
    this.moveFruit(dt);
  }

  /** Green fruit ripens by itself after a while. */
  ripen(dt) {
    for (const fruit of this.fruit) {
      if (fruit.ripe) continue;
      fruit.ripening = Math.min(1, fruit.ripening + dt / this.level.ripenSeconds);
      if (fruit.ripening === 1) fruit.ripe = true;
    }
  }

  /** From the higher levels, a butterfly comes to sit on a ripe fruit now and then. */
  visit(dt) {
    const { level } = this;
    const flier = this.butterfly;
    if (flier) {
      flier.t += dt;
      if (flier.leaving) {
        if (flier.t >= BUTTERFLY_LEAVES) this.butterfly = null;
        return;
      }
      const glove = this.gloves[this.side];
      const shooed = glove.visible && glove.status === 'open' && this.isNear(flier.fruit, glove);
      if (shooed || flier.t >= level.butterflyStays || flier.fruit.state !== 'hanging') this.butterflyLeaves();
      return;
    }
    if (!level.butterflies) return;
    this.butterflyIn -= dt;
    if (this.butterflyIn > 0) return;
    this.butterflyIn = level.butterflyEvery;
    // Only when there'd still be another ripe one free, so it never holds anyone up.
    const free = this.fruit.filter((fruit) => this.pickable(fruit));
    if (free.length < 2) return;
    const glove = this.gloves[this.side];
    const away = free.filter((fruit) => !glove.visible || !this.isNear(fruit, glove));
    const choices = away.length ? away : free;
    this.butterfly = { fruit: choices[Math.floor(Math.random() * choices.length)], t: 0, leaving: false, flap: Math.random() * 6 };
  }

  butterflyLeaves() {
    this.butterfly.leaving = true;
    this.butterfly.t = 0;
    this.events.onButterfly?.();
  }

  handleHand(dt) {
    const glove = this.gloves[this.side];
    const seen = glove.visible;
    const { onMouth } = this;
    const before = this.picking.held;
    // A closed hand on fruit that can't be picked yet gives it a little wiggle, to show it was tried.
    if (seen && glove.status !== 'open' && !before) {
      for (const fruit of this.fruit) {
        if (fruit.state === 'hanging' && !this.pickable(fruit) && this.isNear(fruit, glove) && fruit.wiggle === 0) fruit.wiggle = WIGGLE_SECONDS;
      }
    }
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
    const look = this.treeLook ?? PLACES[this.place];
    ctx.globalAlpha = this.treeShown;
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
    ctx.globalAlpha = 1;
  }

  /** The fruit, green if it isn't ripe yet, and wiggling if it's just been tried. It comes with its tree. */
  drawHanging(ctx, fruit) {
    const shown = fruit.state === 'hanging' ? this.treeShown : 1;
    const shake = fruit.wiggle > 0 && !this.reducedMotion ? Math.sin(fruit.wiggle * 40) * fruit.r * 0.12 * (fruit.wiggle / WIGGLE_SECONDS) : 0;
    const x = fruit.x + shake - fruit.r * 1.2;
    const y = fruit.y - fruit.r * 1.2;
    const size = fruit.r * 2.4;
    ctx.globalAlpha = shown;
    if (fruit.ripening < 1) {
      ctx.drawImage(this.greenSprite(fruit.kind), x, y, size, size);
      ctx.globalAlpha = shown * fruit.ripening;
    }
    ctx.drawImage(this.sprites[fruit.kind], x, y, size, size);
    ctx.globalAlpha = 1;
  }

  greenSprite(kind) {
    if (!this.greenSprites[kind]) {
      const sprite = this.sprites[kind];
      const green = document.createElement('canvas');
      green.width = sprite.width;
      green.height = sprite.height;
      const ctx = green.getContext('2d');
      ctx.drawImage(sprite, 0, 0);
      // Its colour, but not how light or dark it is, so the outline stays dark.
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = UNRIPE_TINT;
      ctx.fillRect(0, 0, green.width, green.height);
      // Lighter, as unripe fruit is, apart from the outline.
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#a6dc5c';
      ctx.fillRect(0, 0, green.width, green.height);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.globalAlpha = 1;
      ctx.drawImage(sprite, 0, 0);
      this.greenSprites[kind] = green;
    }
    return this.greenSprites[kind];
  }

  /** A butterfly, drifting in to sit on its fruit, and away again. */
  drawButterfly(ctx) {
    const flier = this.butterfly;
    if (!flier) return;
    const { fruit } = flier;
    const size = fruit.r * 0.75;
    let x = fruit.x + fruit.r * 0.3;
    let y = fruit.y - fruit.r * 0.85;
    let alpha = 1;
    if (flier.leaving) {
      const share = flier.t / BUTTERFLY_LEAVES;
      x += share * this.height * 0.25 * (this.side === 'right' ? 1 : -1);
      y -= share * this.height * 0.35;
      alpha = 1 - share;
    } else if (flier.t < BUTTERFLY_ARRIVES) {
      const share = 1 - flier.t / BUTTERFLY_ARRIVES;
      y -= share * share * this.height * 0.25;
      alpha = 1 - share;
    }
    // About one beat of the wings a second, sitting, and two flying.
    const beat = flier.leaving || flier.t < BUTTERFLY_ARRIVES ? 12 : 6;
    const open = 0.35 + 0.65 * Math.abs(Math.sin(this.time * beat * (this.reducedMotion ? 0.5 : 1) * 0.5 + flier.flap));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.5, this.height * 0.003);
    for (const way of [-1, 1]) {
      for (const [dy, r, colour] of [[-0.25, 0.62, '#ff8ad0'], [0.35, 0.42, '#ffd23f']]) {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.ellipse(way * size * r * open, dy * size, size * r * open, size * r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.1, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
    if (this.treeShown > 0) this.drawTree(ctx);
    for (const fruit of this.fruit) {
      if (fruit.state === 'gone' || fruit.state === 'held') continue;
      this.drawHanging(ctx, fruit);
    }
    this.drawButterfly(ctx);
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
