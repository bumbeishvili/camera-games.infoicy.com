// The way home: the land going by behind Joze, the tree at each stop, and the glove that picks fruit
// and carries it to his mouth. Joze himself is 3D, on his own canvas between the land and everything
// else. The tree grows on the side of the hand being played with, so feeding him is a reach across.
//
// Nothing flashes: seizures are more common in children with hemiplegia. Green fruit ripens slowly,
// and a butterfly's wings beat about once a second. Golden fruit shines steadily, fireflies glow
// softly, frost melts slowly, and snow drifts down. The first time each new thing comes in a game, a
// little label with its name fades in beside it and out again.
import { LOOKS, paintFruit } from '../../core/fruit.js';
import { Glove, INK } from '../../core/glove.js';
import { NEW_THINGS, Picking, STOPS, featuresAt, newAt, walkAt, warm } from './journey.js';

const PALM_SHARE = 0.105;
const FRUIT_SHARE = 0.07;
const PICK_REACH = 1.2; // How far a hand can be from a fruit and still pick it, in palm lengths.
// And from a basket, a feather or the plank: further, as a hand's middle moves a little as it closes.
const ITEM_REACH = 1.8;
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
const GOLD_TINT = '#ffc928';
const GIFT_PULL = 3.2; // A gift drifts towards a hand within this many palm lengths.
const GIFT_REACH = 1.3; // And is picked up within this many.
const GIFT_PULL_SPEED = 0.35; // In screen heights a second.
const FLY_SECONDS = 0.8; // A gift flying up to the count of them.
const LABEL_SECONDS = 2.4; // A new thing's name, beside it the first time it comes.
const LABEL_WAIT = 3; // How long an older thing's name waits its turn before it's let go.
const MONKEY_ARRIVES = 0.9;
const MONKEY_LEAVES = 1.1;
const MONKEY_RUN = 0.035; // How quickly he scampers about with a fruit, in screen widths a second.
const PARROT_TO_FRUIT = 1.1;
const PARROT_TO_MOUTH = 1.5;
const FIREFLY_SPEED = 0.35; // How quickly a firefly goes round its loop, in radians a second.
const BRIDGE_DOWN = 0.63; // Where the bridge is, in screen heights.
// How near the gap the plank has to be let go, in screen heights: more than for his mouth, as a hand
// moves a little as it opens.
const GAP_REACH = 0.2;
const SNOWFLAKES = 36;

const PLACES = {
  baobab: { sky: ['#ffd9a0', '#fff1d6'], far: '#e9c98b', near: '#d8a860', tree: '#6f8f3f' },
  grass: { sky: ['#8fd2fa', '#e6f7ff'], far: '#b9dd7f', near: '#94c85c', tree: '#4f9f47' },
  river: { sky: ['#a7d8f5', '#f6ecd4'], far: '#d9c08f', near: '#c9a56b', tree: '#6a9b4e' },
  hill: { sky: ['#7cc0f0', '#e4f4ff'], far: '#a4b7a8', near: '#8ba77a', tree: '#4b8c52' },
  home: { sky: ['#ffb98a', '#ffe9c4'], far: '#9bd0d6', near: '#7fc47a', tree: '#3f9d5b' },
};
// The snowy hill and the evening, from the higher levels.
const SNOWY = { far: '#dfe9f2', near: '#f2f6fa', tree: '#3f7f5a' };
const EVENING = { sky: ['#6d5ba8', '#ffc59a'] };

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
    this.goldSprites = {};
    this.giftSprites = { flower: paintGift('flower'), coconut: paintGift('coconut'), firefly: paintGift('firefly') };
    this.level = walkAt(1);
    this.levelNumber = 1;
    this.items = []; // A basket, a feather or a plank, from the higher levels.
    this.gifts = []; // Gifts for Joze's family, waiting to be picked up.
    this.flying = []; // Gifts on their way up to the count.
    this.flies = []; // Fireflies.
    this.snow = [];
    this.monkey = null;
    this.monkeyIn = 0;
    this.parrot = null;
    this.basket = false; // Whether the hand has the basket, for taking two.
    this.extra = null; // The second fruit, in the basket.
    this.bridge = null; // The bridge at the river, from level 7: { fixed }.
    this.features = featuresAt(1, 0);
    this.labels = [];
    this.introduced = new Set();
    this.fresh = new Set(); // What's new at this level, whose names always get their turn.
    this.language = 'en';
    this.tallyAt = { x: 80, y: 40 };
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
    const key = `${name}${this.snowyAt(name) ? '-snow' : ''}${this.eveningAt(name) ? '-evening' : ''}`;
    if (this.scenes[key]) return this.scenes[key];
    const { width, height, ratio } = this;
    const look = this.lookOf(name);
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
    this.scenes[key] = scene;
    return scene;
  }

  /** How a place looks at this level: snowy, or in the evening, from the higher ones. */
  lookOf(name) {
    const look = { ...PLACES[name] };
    if (this.snowyAt(name)) Object.assign(look, SNOWY);
    if (this.eveningAt(name)) Object.assign(look, EVENING);
    return look;
  }

  featuresOf(name) {
    return featuresAt(this.levelNumber, Math.max(0, STOPS.findIndex(({ place }) => place === name)));
  }

  snowyAt(name) {
    return this.featuresOf(name).snowy;
  }

  eveningAt(name) {
    return this.featuresOf(name).evening;
  }

  /**
   * The first time something new comes in a game, its name fades in beside it for a moment. at says
   * where it is now, on the screen.
   */
  introduce(key, at) {
    if (this.introduced.has(key) || !NEW_THINGS[key]) return;
    this.introduced.add(key);
    const { mark, name, nameKa } = NEW_THINGS[key];
    this.labels.push({ key, mark, text: this.language === 'ka' ? nameKa : name, at, t: 0 });
  }

  /** What this level brings: see walkAt in journey.js. */
  setLevel(level) {
    this.level = walkAt(level);
    this.levelNumber = level;
    this.butterfly = null;
    this.butterflyIn = this.level.butterflyEvery * 0.5;
    this.labels = [];
    this.introduced = new Set();
    this.fresh = new Set(newAt(level).map(({ key }) => key));
    this.flying = [];
    this.gifts = [];
    this.items = [];
    this.flies = [];
    this.snow = [];
    this.monkey = null;
    this.parrot = null;
    this.bridge = null;
    this.basket = false;
    this.extra = null;
    this.scenes = {};
  }

  /** Where the fruit hangs at this stop, within reach of the hand. */
  hangFruit(kind, count, features = featuresAt(this.levelNumber, 0)) {
    const { width, height, side, level } = this;
    this.features = features;
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
      golden: false,
      frost: false,
    }));
    // Golden and frosty fruit are among the ripe ones.
    const ripeOnes = this.fruit.filter((fruit) => fruit.ripe);
    for (let i = 0; i < features.golden && i < ripeOnes.length; i += 1) ripeOnes[i].golden = true;
    for (let i = 0; i < features.frost && features.golden + i < ripeOnes.length; i += 1) ripeOnes[features.golden + i].frost = true;
    this.butterfly = null;
    this.butterflyIn = level.butterflyEvery * 0.5;
    this.monkey = null;
    this.monkeyIn = level.monkeyEvery * 0.4;
    this.parrot = null;
    this.basket = false;
    this.extra = null;
    for (const fruit of this.fruit) {
      fruit.x = fruit.homeX;
      fruit.y = fruit.homeY;
    }
    this.treeAcross = across;
    this.treeLook = this.lookOf(this.place);
    // A basket, a feather or the plank hangs in a place on the tree that has no fruit, so it's no
    // further to reach.
    const towardsJoze = side === 'right' ? -1 : 1;
    // Each falls and goes back on the tree like a fruit when it's dropped, so it needs the same fields.
    const item = (what, dx, dy) => ({ kind: what, homeX: (across + dx) * width, homeY: dy * height, x: (across + dx) * width, y: dy * height, state: 'hanging', r: this.fruitSize, vy: 0, backIn: 0 });
    const free = SPOTS.slice(total).reverse();
    this.items = [];
    if (features.basket && free.length) this.items.push(item('basket', ...free.shift()));
    if (features.parrot && free.length) this.items.push(item('feather', ...free.shift()));
    this.bridge = features.bridge ? { fixed: false } : null;
    if (features.bridge) {
      // The plank, blown into the tree, in the free place furthest from the gap, so it's a carry.
      const { gap } = this;
      const spots = free.length ? free : [[towardsJoze * -0.09, 0.22]];
      const far = spots.reduce((best, spot) => {
        const distance = ([dx, dy]) => Math.hypot((across + dx) * width - gap.x, dy * height - gap.y);
        return distance(spot) > distance(best) ? spot : best;
      });
      this.items.push(item('plank', ...far));
    }
    this.flies = Array.from({ length: features.fireflies }, (_, i) => ({
      cx: (across + towardsJoze * (0.02 + i * 0.06)) * width,
      cy: (0.3 + i * 0.16) * height,
      rx: width * 0.05,
      ry: height * 0.06,
      phase: i * 2.4,
      caught: false,
      x: (across + towardsJoze * (0.02 + i * 0.06)) * width,
      y: (0.3 + i * 0.16) * height,
    }));
    this.snow = features.snowy && !this.reducedMotion
      ? Array.from({ length: SNOWFLAKES }, () => ({ x: Math.random() * width, y: Math.random() * height, r: between(2, 4.5), speed: between(0.03, 0.06), phase: Math.random() * 6 }))
      : [];
  }

  /**
   * Where the gap in the bridge is, on the screen: between Joze and the tree, nearer him, but clear of
   * him. The bridge is behind him, as it's in the land he walks through.
   */
  get gap() {
    const tree = this.treeAcross * this.width;
    const mouth = this.mouth.x || tree - (this.side === 'right' ? 1 : -1) * this.width * 0.3;
    return { x: mouth + (tree - mouth) * 0.32, y: BRIDGE_DOWN * this.height };
  }

  get onGap() {
    const glove = this.gloves[this.side];
    return glove.visible && Math.hypot(glove.x - this.gap.x, glove.y - this.gap.y) <= this.height * GAP_REACH;
  }

  /** Whether a fruit can be picked now: hanging, ripe, and with no butterfly on it. */
  pickable(fruit) {
    return fruit.state === 'hanging' && fruit.ripe && !fruit.frost && this.butterfly?.fruit !== fruit && this.parrot?.fruit !== fruit;
  }

  /** Whether the monkey is holding this fruit. */
  withMonkey(fruit) {
    return this.monkey?.fruit === fruit && this.monkey.state === 'holding';
  }

  /** Swaying on its branch, from the higher levels, a little less for anyone who prefers less motion. */
  hang(fruit) {
    if (this.withMonkey(fruit)) {
      fruit.x = this.monkey.x;
      fruit.y = this.monkey.y + fruit.r * 0.9;
      return;
    }
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
    this.items = [];
    this.flies = [];
    this.butterfly = null;
    this.monkey = null;
    this.parrot = null;
    this.basket = false;
    this.extra = null;
    this.picking = new Picking();
    this.keepWaitingGifts();
  }

  /** Gifts still waiting have been found, so they go to the count: as Joze walks on, and at the very end. */
  keepWaitingGifts() {
    for (const gift of this.gifts) this.giftFound(gift);
    this.gifts = [];
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
    // A basket, a feather or the plank first, as there's only ever the one, then the monkey's fruit,
    // as taking it back is the thing to do, then a golden one, and then fruit as always.
    const item = this.items.find((thing) => thing.state === 'hanging' && this.isNear(thing, glove, ITEM_REACH));
    if (item) return item;
    const monkeys = this.monkey?.state === 'holding' ? this.monkey.fruit : null;
    if (monkeys && this.pickable(monkeys) && this.isNear(monkeys, glove)) return monkeys;
    const near = (fruit) => this.pickable(fruit) && this.isNear(fruit, glove);
    return this.fruit.find((fruit) => fruit.golden && near(fruit)) ?? this.fruit.find(near) ?? null;
  }

  isNear(fruit, glove, reach = PICK_REACH) {
    return Math.hypot(fruit.x - glove.x, fruit.y - glove.y) <= this.palmSize * reach + fruit.r;
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
    if (playing && this.fruit.length && this.walking === 0) this.runMonkey(dt);
    for (const fruit of this.fruit) {
      if (fruit.state === 'hanging') this.hang(fruit);
      fruit.wiggle = Math.max(0, fruit.wiggle - dt);
    }
    if (playing && this.fruit.length && this.walking === 0) {
      this.ripen(dt);
      this.visit(dt);
      this.flyParrot(dt);
    }
    if (playing && this.fruit.length) this.handleHand(dt);
    this.moveFruit(dt);
    this.moveGifts(dt, playing);
    for (const flake of this.snow) {
      flake.y += flake.speed * this.height * dt;
      flake.x += Math.sin(this.time * 0.8 + flake.phase) * this.height * 0.01 * dt;
      if (flake.y > this.height) flake.y = -10;
    }
    this.labels = stepLabels(this.labels, dt, this.fresh);
  }

  /** From the higher levels, the monkey takes a ripe fruit now and then and scampers off with it. */
  runMonkey(dt) {
    const { level, features } = this;
    const monkey = this.monkey;
    if (monkey) {
      monkey.t += dt;
      if (monkey.state === 'coming') {
        const share = Math.min(1, monkey.t / MONKEY_ARRIVES);
        monkey.x = monkey.fromX + (monkey.fruit.x - monkey.fromX) * share;
        monkey.y = monkey.fromY + (monkey.fruit.y - monkey.fruit.r * 0.9 - monkey.fromY) * share;
        if (share === 1) Object.assign(monkey, { state: 'holding', t: 0, startX: monkey.x });
        if (!this.pickable(monkey.fruit)) Object.assign(monkey, { state: 'going', t: 0, fromX: monkey.x, fromY: monkey.y });
      } else if (monkey.state === 'holding') {
        // About the canopy, from side to side, never far from where the fruit hangs.
        monkey.x = monkey.startX + Math.sin(monkey.t * MONKEY_RUN * 20) * this.width * 0.08;
        monkey.y = (0.26 + 0.06 * Math.sin(monkey.t * 0.7)) * this.height;
        if (monkey.fruit.state !== 'hanging') {
          // Taken from him: a coconut for Joze, thrown down to the hand.
          this.addGift('coconut', monkey.x, monkey.y);
          this.events.onMonkey?.();
          Object.assign(monkey, { state: 'going', t: 0, fromX: monkey.x, fromY: monkey.y });
        } else if (monkey.t >= level.monkeyStays) {
          // He gives it back by himself.
          Object.assign(monkey, { state: 'going', t: 0, fromX: monkey.x, fromY: monkey.y });
        }
      } else if (monkey.state === 'going') {
        const share = Math.min(1, monkey.t / MONKEY_LEAVES);
        monkey.x = monkey.fromX + (monkey.homeX - monkey.fromX) * share;
        monkey.y = monkey.fromY + (monkey.homeY - monkey.fromY) * share;
        if (share === 1) this.monkey = null;
      }
      return;
    }
    if (!features.monkey) return;
    this.monkeyIn -= dt;
    if (this.monkeyIn > 0) return;
    this.monkeyIn = level.monkeyEvery;
    // Only when there'd still be another ripe one free, so he never holds anyone up.
    const free = this.fruit.filter((fruit) => this.pickable(fruit));
    if (free.length < 2) return;
    const glove = this.gloves[this.side];
    const away = free.filter((fruit) => !glove.visible || !this.isNear(fruit, glove));
    const fruit = (away.length ? away : free)[Math.floor(Math.random() * (away.length || free.length))];
    const homeX = this.treeAcross * this.width;
    const homeY = 0.08 * this.height;
    this.monkey = { state: 'coming', fruit, t: 0, x: homeX, y: homeY, fromX: homeX, fromY: homeY, homeX, homeY };
    this.events.onMonkeyComes?.(this.monkey);
  }

  /** The parrot, from the feather: off to a fruit, and then to Joze's mouth with it. */
  sendParrot() {
    const free = this.fruit.filter((fruit) => this.pickable(fruit) && !this.withMonkey(fruit));
    if (!free.length) return;
    // The lowest, so it flies below the camera's picture at the top.
    const fruit = free.reduce((low, one) => (one.homeY > low.homeY ? one : low));
    const fromX = this.side === 'right' ? this.width * 1.05 : -this.width * 0.05;
    const fromY = this.height * 0.45;
    this.parrot = { fruit, t: 0, state: 'to-fruit', x: fromX, y: fromY, fromX, fromY };
    this.events.onParrot?.(this.parrot);
  }

  flyParrot(dt) {
    const parrot = this.parrot;
    if (!parrot) return;
    parrot.t += dt;
    if (parrot.state === 'to-fruit') {
      const share = Math.min(1, parrot.t / PARROT_TO_FRUIT);
      const ease = share * share * (3 - 2 * share);
      parrot.x = parrot.fromX + (parrot.fruit.x - parrot.fromX) * ease;
      parrot.y = parrot.fromY + (parrot.fruit.y - parrot.fruit.r - parrot.fromY) * ease;
      if (share === 1) {
        Object.assign(parrot, { state: 'to-mouth', t: 0, fromX: parrot.x, fromY: parrot.y });
        parrot.fruit.state = 'parrot';
      }
    } else if (parrot.state === 'to-mouth') {
      const share = Math.min(1, parrot.t / PARROT_TO_MOUTH);
      const ease = share * share * (3 - 2 * share);
      parrot.x = parrot.fromX + (this.mouth.x - parrot.fromX) * ease;
      parrot.y = parrot.fromY + (this.mouth.y - parrot.fruit.r - parrot.fromY) * ease + Math.sin(share * Math.PI) * this.height * 0.05;
      parrot.fruit.x = parrot.x;
      parrot.fruit.y = parrot.y + parrot.fruit.r;
      if (share === 1) {
        parrot.fruit.state = 'gone';
        this.burst(parrot.fruit);
        if (parrot.fruit.golden) this.flying.push({ kind: 'golden', fromX: this.mouth.x, fromY: this.mouth.y, t: 0 });
        this.events.onFed?.(null, { count: 1, golden: parrot.fruit.golden ? 1 : 0, by: 'parrot' });
        Object.assign(parrot, { state: 'away', t: 0, fromX: parrot.x, fromY: parrot.y });
      }
    } else {
      const share = Math.min(1, parrot.t / PARROT_TO_FRUIT);
      // Away past Joze and off the side, rather than up past the camera's picture.
      parrot.x = parrot.fromX + (this.side === 'right' ? -1 : 1) * share * this.width * 0.5;
      parrot.y = parrot.fromY + share * this.height * 0.1;
      if (share === 1) this.parrot = null;
    }
  }

  /** A gift for Joze's family, where something happened: it waits there to be picked up. */
  addGift(kind, x, y) {
    const gift = { kind, x, y, age: 0 };
    this.gifts.push(gift);
    this.events.onGiftOut?.(gift);
    return gift;
  }

  /** Gifts drift to a hand nearby, whatever it's doing, and fireflies are caught by a closed hand. */
  moveGifts(dt, playing) {
    const glove = this.gloves[this.side];
    for (const gift of [...this.gifts]) {
      gift.age += dt;
      if (!playing || !glove.visible || gift.age < 0.4) continue;
      const distance = Math.hypot(glove.x - gift.x, glove.y - gift.y);
      if (distance <= this.palmSize * GIFT_REACH) {
        this.gifts = this.gifts.filter((other) => other !== gift);
        this.giftFound(gift);
      } else if (distance <= this.palmSize * GIFT_PULL) {
        const step = Math.min(distance, GIFT_PULL_SPEED * this.height * dt);
        gift.x += ((glove.x - gift.x) / distance) * step;
        gift.y += ((glove.y - gift.y) / distance) * step;
      }
    }
    for (const fly of this.flies) {
      if (fly.caught) continue;
      const turn = this.time * FIREFLY_SPEED * (this.reducedMotion ? 0.5 : 1) + fly.phase;
      fly.x = fly.cx + Math.sin(turn) * fly.rx;
      fly.y = fly.cy + Math.sin(turn * 2) * fly.ry * 0.6;
      if (playing && this.walking === 0 && glove.visible && glove.status !== 'open' && Math.hypot(glove.x - fly.x, glove.y - fly.y) <= this.palmSize * GIFT_REACH) {
        fly.caught = true;
        this.giftFound({ kind: 'firefly', x: fly.x, y: fly.y });
      }
    }
    for (const flier of this.flying) flier.t += dt / FLY_SECONDS;
    this.flying = this.flying.filter(({ t }) => t < 1);
  }

  /** A gift picked up, flying up to the count. */
  giftFound(gift) {
    this.flying.push({ kind: gift.kind, fromX: gift.x, fromY: gift.y, t: 0, fruit: gift.fruit });
    this.events.onGift?.(gift.kind);
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
      // Shooed off by a hand, it leaves a flower for Joze's family.
      if (shooed && flier.t >= BUTTERFLY_ARRIVES) this.addGift('flower', flier.fruit.x + flier.fruit.r * 0.3, flier.fruit.y - flier.fruit.r * 0.85);
      if (shooed || flier.t >= level.butterflyStays || flier.fruit.state !== 'hanging') this.butterflyLeaves();
      return;
    }
    if (!level.butterflies) return;
    this.butterflyIn -= dt;
    if (this.butterflyIn > 0) return;
    this.butterflyIn = level.butterflyEvery;
    // Only when there'd still be another ripe one free, so it never holds anyone up.
    const free = this.fruit.filter((fruit) => this.pickable(fruit) && !this.withMonkey(fruit) && this.monkey?.fruit !== fruit);
    if (free.length < 2) return;
    const glove = this.gloves[this.side];
    const away = free.filter((fruit) => !glove.visible || !this.isNear(fruit, glove));
    const choices = away.length ? away : free;
    this.butterfly = { fruit: choices[Math.floor(Math.random() * choices.length)], t: 0, leaving: false, flap: Math.random() * 6 };
    this.events.onButterflyComes?.(this.butterfly);
  }

  butterflyLeaves() {
    this.butterfly.leaving = true;
    this.butterfly.t = 0;
    this.events.onButterfly?.();
  }

  handleHand(dt) {
    const glove = this.gloves[this.side];
    const seen = glove.visible;
    const closed = glove.status !== 'open';
    const before = this.picking.held;
    if (seen && closed && !before) {
      for (const fruit of this.fruit) {
        if (fruit.state !== 'hanging' || !this.isNear(fruit, glove)) continue;
        // A closed hand on frosty fruit warms it, and the warmth adds up.
        if (fruit.frost && fruit.ripe) {
          if (warm(fruit, dt, this.level.thawSeconds)) this.events.onThawed?.(fruit);
          continue;
        }
        // A closed hand on fruit that can't be picked yet gives it a little wiggle, to show it was tried.
        if (!this.pickable(fruit) && fruit.wiggle === 0) fruit.wiggle = WIGGLE_SECONDS;
      }
    }
    const result = this.picking.update(dt, {
      seen,
      closed,
      near: seen ? this.fruitNear(glove) : null,
      // The plank goes in the gap in the bridge, and everything else to Joze's mouth.
      onMouth: before?.kind === 'plank' ? this.onGap : this.onMouth,
    });
    if (result === 'picked') {
      const held = this.picking.held;
      if (held.kind === 'basket' || held.kind === 'feather') {
        // Not carried: the basket goes onto the hand, and the feather calls the parrot.
        held.state = 'gone';
        this.picking.held = null;
        if (held.kind === 'basket') {
          this.basket = true;
          this.events.onBasket?.();
        } else {
          this.sendParrot();
        }
      } else {
        held.state = 'held';
        if (this.basket && held.kind !== 'plank' && (this.events.canTakeTwo?.() ?? true)) {
          // With the basket, another fruit comes too: the nearest one free.
          const others = this.fruit.filter((fruit) => fruit !== held && this.pickable(fruit) && !this.withMonkey(fruit));
          const other = others.sort((a, b) => Math.hypot(a.x - held.x, a.y - held.y) - Math.hypot(b.x - held.x, b.y - held.y))[0];
          if (other) {
            other.state = 'held';
            this.extra = other;
            this.basket = false;
          }
        }
      }
      this.events.onPick?.();
    } else if (result === 'fed') {
      if (before.kind === 'plank') {
        before.state = 'placed';
        this.bridge.fixed = true;
        this.events.onBridge?.();
      } else {
        const eaten = [before, this.extra].filter(Boolean);
        for (const fruit of eaten) {
          fruit.state = 'gone';
          this.burst(fruit);
          // A golden one is a gift for his family too, and goes up to the count of them.
          if (fruit.golden) this.flying.push({ kind: 'golden', fromX: this.mouth.x, fromY: this.mouth.y, t: 0 });
        }
        this.fed[this.side] += eaten.length;
        this.extra = null;
        this.events.onFed?.(this.side, { count: eaten.length, golden: eaten.filter(({ golden }) => golden).length });
      }
    } else if (result === 'dropped') {
      for (const thing of [before, this.extra].filter(Boolean)) {
        thing.state = 'falling';
        thing.vy = 0;
      }
      // The basket is kept, for the next try.
      if (this.extra) this.basket = true;
      this.extra = null;
      this.events.onDropped?.();
    }
    if (this.picking.held) {
      this.picking.held.x = glove.x;
      this.picking.held.y = glove.y;
    }
    if (this.extra) {
      this.extra.x = glove.x + this.extra.r * 0.9;
      this.extra.y = glove.y - this.extra.r * 0.5;
    }
  }

  moveFruit(dt) {
    for (const fruit of [...this.fruit, ...this.items]) {
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
    ctx.drawImage(fruit.golden ? this.goldSprite(fruit.kind) : this.sprites[fruit.kind], x, y, size, size);
    if (fruit.frost) this.drawFrost(ctx, fruit, shown);
    ctx.globalAlpha = 1;
  }

  /** Frost on a fruit: icy and pale, with snow on top, melting as a closed hand warms it. */
  drawFrost(ctx, fruit, shown) {
    const left = 1 - (fruit.warmth ?? 0) / this.level.thawSeconds;
    const { x, y, r } = fruit;
    ctx.save();
    ctx.globalAlpha = shown * (0.2 + 0.45 * left);
    ctx.fillStyle = '#cdeaff';
    ctx.beginPath();
    ctx.arc(x, y + r * 0.03, r * 0.98, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = shown * left;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.5, this.height * 0.003);
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.72, r * 0.62, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Little ice crystals.
    ctx.strokeStyle = '#8ccdf2';
    ctx.lineWidth = Math.max(2, this.height * 0.004);
    for (const [dx, dy] of [[-0.35, 0.1], [0.3, 0.3]]) {
      for (let i = 0; i < 3; i += 1) {
        const angle = (i / 3) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(x + dx * r - Math.cos(angle) * r * 0.16, y + dy * r - Math.sin(angle) * r * 0.16);
        ctx.lineTo(x + dx * r + Math.cos(angle) * r * 0.16, y + dy * r + Math.sin(angle) * r * 0.16);
        ctx.stroke();
      }
    }
    if (fruit.warmth > 0) {
      ctx.globalAlpha = shown;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = Math.max(3, this.height * 0.007);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - left));
      ctx.stroke();
    }
    ctx.restore();
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
    if (this.bridge && this.treeShown > 0) {
      back.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.drawBridge(back);
    }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (this.treeShown > 0) this.drawTree(ctx);
    for (const item of this.items) {
      if (item.state === 'hanging' || item.state === 'falling') this.drawItem(ctx, item, item.x, item.y, this.treeShown);
    }
    for (const fruit of this.fruit) {
      if (fruit.state === 'gone' || fruit.state === 'held' || fruit.state === 'parrot') continue;
      this.drawHanging(ctx, fruit);
    }
    this.drawMonkey(ctx);
    this.drawButterfly(ctx);
    this.drawParrot(ctx);
    this.drawFlies(ctx);
    for (const gift of this.gifts) this.drawGift(ctx, gift.kind, gift.x, gift.y, Math.min(1, gift.age / 0.4));
    for (const bit of this.bits) {
      ctx.fillStyle = bit.colour;
      ctx.beginPath();
      ctx.arc(bit.x, bit.y, bit.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgb(255 255 255 / 0.9)';
    for (const flake of this.snow) {
      ctx.beginPath();
      ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
      ctx.fill();
    }
    this.gloves.left.draw(ctx, this.palmSize);
    this.gloves.right.draw(ctx, this.palmSize);
    const held = this.picking.held;
    const glove = this.gloves[this.side];
    if (this.basket && glove.visible) this.drawItem(ctx, { kind: 'basket', r: this.fruitSize }, glove.x + this.palmSize * 0.7, glove.y - this.palmSize * 0.7, 1, 0.7);
    if (held?.kind === 'plank') this.drawItem(ctx, held, held.x, held.y, 1);
    else if (held) this.drawCarried(ctx, held);
    if (this.extra) this.drawCarried(ctx, this.extra);
    for (const flier of this.flying) {
      const ease = flier.t * flier.t * (3 - 2 * flier.t);
      const x = flier.fromX + (this.tallyAt.x - flier.fromX) * ease;
      const y = flier.fromY + (this.tallyAt.y - flier.fromY) * ease - Math.sin(flier.t * Math.PI) * height * 0.08;
      this.drawGift(ctx, flier.kind, x, y, 1.1 - ease * 0.5);
    }
    const [label] = this.labels;
    if (label) drawLabel(ctx, label, label.at(), width, height, LABEL_SECONDS);
  }

  /** A fruit in the hand, golden if it's a golden one. */
  drawCarried(ctx, fruit) {
    const sprite = fruit.golden ? this.goldSprite(fruit.kind) : this.sprites[fruit.kind];
    ctx.drawImage(sprite, fruit.x - fruit.r * 1.2, fruit.y - fruit.r * 1.2, fruit.r * 2.4, fruit.r * 2.4);
  }

  goldSprite(kind) {
    if (!this.goldSprites[kind]) {
      const sprite = this.sprites[kind];
      const { width: wide, height: high } = sprite;
      const shape = (colour) => {
        const canvas = document.createElement('canvas');
        canvas.width = wide;
        canvas.height = high;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(sprite, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = colour(ctx);
        ctx.fillRect(0, 0, wide, high);
        return canvas;
      };
      const gold = document.createElement('canvas');
      gold.width = wide;
      gold.height = high;
      const ctx = gold.getContext('2d');
      // The fruit's own shape in bright gold, inside a dark outline.
      ctx.drawImage(shape(() => INK), 0, 0);
      const inside = shape((context) => {
        const shine = context.createRadialGradient(wide * 0.4, high * 0.38, 10, wide / 2, high / 2, wide * 0.5);
        shine.addColorStop(0, '#fff3a6');
        shine.addColorStop(0.55, '#ffd23f');
        shine.addColorStop(1, '#f0a81c');
        return shine;
      });
      ctx.drawImage(inside, wide * 0.035, high * 0.035, wide * 0.93, high * 0.93);
      ctx.fillStyle = 'rgb(255 255 255 / 0.6)';
      ctx.beginPath();
      ctx.ellipse(wide * 0.36, high * 0.38, wide * 0.06, high * 0.1, -0.5, 0, Math.PI * 2);
      ctx.fill();
      // A little sparkle on it.
      ctx.fillStyle = '#fffbe0';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2;
        const reach = i % 2 ? 9 : 26;
        ctx.lineTo(wide * 0.72 + Math.cos(angle) * reach, high * 0.25 + Math.sin(angle) * reach);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      this.goldSprites[kind] = gold;
    }
    return this.goldSprites[kind];
  }

  /** The bridge over the stream at the river, with a gap until the plank goes in. */
  drawBridge(ctx) {
    const { width, height } = this;
    const { x, y } = this.gap;
    const half = width * 0.11;
    ctx.save();
    ctx.globalAlpha = this.treeShown;
    ctx.fillStyle = '#6cc3ee';
    ctx.beginPath();
    ctx.ellipse(x, y + height * 0.06, half * 1.35, height * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, height * 0.004);
    const plankWidth = (half * 2) / 7;
    for (let i = 0; i < 7; i += 1) {
      const px = x - half + i * plankWidth;
      if (i === 3) {
        if (!this.bridge.fixed) continue;
      }
      ctx.fillStyle = i % 2 ? '#b8743a' : '#c98a4b';
      ctx.beginPath();
      ctx.roundRect(px + 1, y - height * 0.025, plankWidth - 2, height * 0.05, 3);
      ctx.fill();
      ctx.stroke();
    }
    // Ropes along it.
    ctx.strokeStyle = '#8a5a34';
    ctx.lineWidth = Math.max(2, height * 0.005);
    ctx.beginPath();
    ctx.moveTo(x - half, y - height * 0.05);
    ctx.quadraticCurveTo(x, y - height * 0.02, x + half, y - height * 0.05);
    ctx.stroke();
    if (!this.bridge.fixed) {
      // Where the plank goes, gently marked.
      ctx.strokeStyle = 'rgb(255 255 255 / 0.85)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.roundRect(x - plankWidth / 2 + 1, y - height * 0.025, plankWidth - 2, height * 0.05, 3);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  /** A basket, a feather or a plank. */
  drawItem(ctx, item, x, y, alpha = 1, scale = 1) {
    const r = item.r * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, this.height * 0.004);
    ctx.lineJoin = 'round';
    if (item.kind === 'basket') {
      ctx.beginPath();
      ctx.arc(0, -r * 0.2, r * 0.7, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = '#d9a35b';
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, -r * 0.2);
      ctx.lineTo(r * 0.95, -r * 0.2);
      ctx.lineTo(r * 0.7, r * 0.75);
      ctx.lineTo(-r * 0.7, r * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#a8742f';
      for (const dy of [0.1, 0.4]) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.85, r * dy);
        ctx.lineTo(r * 0.85, r * dy);
        ctx.stroke();
      }
    } else if (item.kind === 'feather') {
      ctx.rotate(-0.5);
      for (const [colour, w] of [['#2fb36b', 0.42], ['#ff5a4f', 0.3], ['#3b82f6', 0.16]]) {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * w, r * 1.05, 0, 0, Math.PI * 2);
        ctx.fill();
        if (colour === '#2fb36b') ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, r * 1.05);
      ctx.lineTo(0, r * 1.4);
      ctx.stroke();
    } else if (item.kind === 'plank') {
      ctx.rotate(-0.15);
      ctx.fillStyle = '#c98a4b';
      ctx.beginPath();
      ctx.roundRect(-r * 0.45, -r * 1.1, r * 0.9, r * 2.2, r * 0.15);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#9c6532';
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, -r * 0.8);
      ctx.lineTo(-r * 0.15, r * 0.8);
      ctx.moveTo(r * 0.18, -r * 0.6);
      ctx.lineTo(r * 0.18, r * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The cheeky monkey, coming down to a fruit, scampering about with it, and going back up. */
  drawMonkey(ctx) {
    const { monkey } = this;
    if (!monkey) return;
    const size = this.fruitSize * 0.95;
    let alpha = this.treeShown;
    if (monkey.state === 'coming') alpha *= Math.min(1, monkey.t / (MONKEY_ARRIVES * 0.5));
    if (monkey.state === 'going') alpha *= 1 - Math.min(1, monkey.t / MONKEY_LEAVES);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(monkey.x, monkey.y);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, this.height * 0.004);
    ctx.lineCap = 'round';
    // A curly tail, swinging slowly.
    const swing = this.reducedMotion ? 0 : Math.sin(this.time * 2) * 0.3;
    ctx.strokeStyle = '#8a5a34';
    ctx.lineWidth = size * 0.16;
    ctx.beginPath();
    ctx.moveTo(size * 0.3, size * 0.6);
    ctx.quadraticCurveTo(size * (1.1 + swing), size * 0.8, size * (0.9 + swing), size * 0.1);
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, this.height * 0.004);
    ctx.fillStyle = '#9b6a3c';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.55, size * 0.45, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (const way of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(way * size * 0.62, -size * 0.1, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, -size * 0.05, size * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f2c99a';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.08, size * 0.38, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    for (const way of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(way * size * 0.18, -size * 0.12, size * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, size * 0.1, size * 0.16, 0.2, Math.PI - 0.2);
    ctx.stroke();
    // Arms down to the fruit he's holding.
    if (monkey.state === 'holding') {
      ctx.strokeStyle = '#8a5a34';
      ctx.lineWidth = size * 0.14;
      for (const way of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(way * size * 0.35, size * 0.5);
        ctx.lineTo(way * size * 0.3, size * 0.95);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** The parrot helper, a bright little bird, wings beating about twice a second. */
  drawParrot(ctx) {
    const { parrot } = this;
    if (!parrot) return;
    const size = this.fruitSize * 0.9;
    const flap = Math.sin(this.time * Math.PI * 2 * (this.reducedMotion ? 0.8 : 2));
    const way = parrot.state === 'to-mouth' ? (this.side === 'right' ? -1 : 1) : (this.side === 'right' ? -1 : 1);
    ctx.save();
    ctx.translate(parrot.x, parrot.y);
    ctx.scale(way, 1);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, this.height * 0.004);
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#2fb36b';
    ctx.beginPath();
    ctx.moveTo(-size * 0.1, -size * 0.1);
    ctx.quadraticCurveTo(-size * 0.6, -size * (0.4 + flap * 0.6), -size * 1.1, -size * (0.2 + flap * 0.5));
    ctx.quadraticCurveTo(-size * 0.6, size * 0.1, -size * 0.1, size * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, size * 0.1);
    ctx.lineTo(-size * 1.1, size * 0.45);
    ctx.lineTo(-size * 0.4, size * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff5a4f';
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.55, size * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(size * 0.45, -size * 0.25, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(size * 0.7, -size * 0.3);
    ctx.quadraticCurveTo(size * 1.05, -size * 0.25, size * 0.75, -size * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size * 0.5, -size * 0.32, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(size * 0.52, -size * 0.32, size * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (parrot.state === 'to-mouth') this.drawCarried(ctx, parrot.fruit);
  }

  /** Fireflies, glowing softly and steadily, going round their loops. */
  drawFlies(ctx) {
    for (const fly of this.flies) {
      if (fly.caught || fly.x === undefined) continue;
      this.drawGift(ctx, 'firefly', fly.x, fly.y, this.treeShown);
    }
  }

  drawGift(ctx, kind, x, y, scale) {
    if (scale <= 0) return;
    if (kind === 'golden') {
      const r = this.fruitSize * 0.8 * scale;
      ctx.drawImage(this.goldSprite(STOPS.find(({ place }) => place === this.place)?.fruit ?? 'apple'), x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
      return;
    }
    const size = this.fruitSize * 0.85 * scale;
    ctx.drawImage(this.giftSprites[kind], x - size, y - size, size * 2, size * 2);
  }
}

/** Gifts for Joze's family, drawn once each. */
function paintGift(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  ctx.translate(60, 60);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  if (kind === 'flower') {
    ctx.fillStyle = '#ff8ad0';
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * 20, Math.sin(angle) * 20, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (kind === 'coconut') {
    ctx.fillStyle = '#8a5a34';
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#4a2f18';
    for (const [x, y] of [[-10, -8], [10, -8], [0, 8]]) {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgb(255 255 255 / 0.35)';
    ctx.beginPath();
    ctx.ellipse(-14, -18, 8, 5, -0.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // A firefly: a soft steady glow, little wings, and a smile.
    const glow = ctx.createRadialGradient(0, 8, 4, 0, 8, 46);
    glow.addColorStop(0, 'rgb(255 240 120 / 0.9)');
    glow.addColorStop(1, 'rgb(255 240 120 / 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 8, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgb(255 255 255 / 0.8)';
    for (const way of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(way * 14, -14, 12, 8, way * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath();
    ctx.ellipse(0, 6, 13, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5a4a3a';
    ctx.beginPath();
    ctx.arc(0, -12, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  return canvas;
}

/**
 * One name at a time, so they never pile up. The names of what's new at this level always get their
 * turn, but an older one that's waited a while is let go, and so is one whose thing has gone.
 */
function stepLabels(labels, dt, fresh) {
  labels.forEach((label, index) => {
    if (index === 0) label.t += dt;
    else label.wait = (label.wait ?? 0) + dt;
  });
  return labels.filter((label, index) => label.t < LABEL_SECONDS && (index === 0 || ((fresh.has(label.key) || label.wait < LABEL_WAIT) && label.at() !== null)));
}

/** A new thing's name in a little rounded box above it, fading in and out, with a soft ring. */
function drawLabel(ctx, label, now, width, height, lasts) {
  // Where its thing is, or was last, if it's just gone. The ring follows it, and the name stays
  // where it first came, so nothing bright moves quickly.
  const at = now ?? label.last;
  if (!at) return;
  label.last = { x: at.x, y: at.y };
  label.home ??= { x: at.x, y: at.y };
  const fade = Math.min(1, label.t / 0.4, (lasts - label.t) / 0.6);
  if (fade <= 0) return;
  const font = Math.round(height * 0.03);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = 'rgb(255 236 150 / 0.9)';
  ctx.lineWidth = Math.max(3, height * 0.006);
  ctx.beginPath();
  ctx.arc(at.x, at.y, height * (0.075 + 0.01 * Math.min(1, label.t)), 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `600 ${font}px Fredoka, system-ui, sans-serif`;
  const text = `${label.mark} ${label.text}`;
  const wide = ctx.measureText(text).width + font * 1.2;
  const x = Math.min(width - wide / 2 - 8, Math.max(wide / 2 + 8, label.home.x));
  // Above its thing, or below it near the top, where the camera's picture is.
  const above = label.home.y - height * 0.12 - Math.min(1, label.t) * height * 0.01;
  const y = above < height * 0.24 ? label.home.y + height * 0.12 : above;
  ctx.fillStyle = '#fffaf0';
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, height * 0.004);
  ctx.beginPath();
  ctx.roundRect(x - wide / 2, y - font * 0.85, wide, font * 1.7, font * 0.85);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + font * 0.05);
  ctx.restore();
}
