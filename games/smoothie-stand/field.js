// The Harvest Fair behind Joze's stand: fruit flying up, a glove that copies the child's hand, and
// the blender on the counter. An open hand moving through a fruit slices it. A closed one bumps it.
//
// Nothing flashes: seizures are more common in children with hemiplegia. A slice is a few drops
// of juice where it happened, and the picture itself never changes brightness.
import { LOOKS, paintFruit } from '../../core/fruit.js';
import { Glove, INK } from '../../core/glove.js';
import { fairAt, nearestOnPath } from './orders.js';

// gravity is in screen heights a second squared, every is the seconds between throws, volley is how
// few and how many go up in a throw, and most is how many can be up at once. There's always plenty to
// slice, and even fast is gentle: this is about reaching, not reaction time.
const PACES = {
  slow: { gravity: 0.38, every: 0.85, volley: [1, 2], most: 8 },
  medium: { gravity: 0.5, every: 0.7, volley: [1, 3], most: 10 },
  fast: { gravity: 0.68, every: 0.55, volley: [2, 3], most: 12 },
};
// However high the level, never more than the fastest pace has at once, or in a throw, so the sky
// never gets so full that fruit flickers past.
const MOST_EVER = 12;
const VOLLEY_EVER = 3;
const PALM_SHARE = 0.105;
const FRUIT_SHARE = 0.085; // A fruit's radius, as a share of the screen's height.
const SWIPE_SPEED = 0.28; // How fast a hand has to be going to slice, in screen heights a second.
const COUNTER_SHARE = 0.86; // Where the counter's top is.
const STICKY_SECONDS = 1.2;
const STICKY_COLOUR = '#7a5c3a';
const BUMP_REST_SECONDS = 1.2;
const REACH = { left: [0.1, 0.62], right: [0.38, 0.9] };
const TRAIL_SECONDS = 0.22;
const ACROSS_FROM = 0.08; // Thrown across from this far inside one end of the reach to as far inside the other.
const PAIR_GAP = 2.8; // A rotten one beside another, this many fruit sizes apart, so one can be sliced alone.
const CRACK_KICK = 0.12; // The first swipe on a tough fruit knocks it up this far, in screen heights.
const CRACK_REST_SECONDS = 0.35; // The same swipe can't slice it straight after cracking it.
const SKIN = '#8a5a2b';

const between = (low, high) => low + Math.random() * (high - low);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export class SmoothieField {
  /** events: onSlice(kind, side), onBump(side), onShaken(side) */
  constructor(canvas, events = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.events = events;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sprites = Object.fromEntries(Object.keys(LOOKS).map((kind) => [kind, paintFruit(kind)]));
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    for (const glove of Object.values(this.gloves)) {
      glove.stainColour = STICKY_COLOUR;
      glove.sticky = 0;
      glove.lastX = null;
      glove.lastY = null;
      glove.bumpedAt = -Infinity;
    }
    this.fruit = [];
    this.halves = [];
    this.drops = [];
    this.tokens = [];
    this.trail = [];
    this.aspect = 16 / 9;
    this.time = 0;
    this.throwIn = 0;
    this.throwing = false;
    this.nextFruit = () => 'apple';
    // What the next throw is: see Stand.nextThrow. Only the kind, unless a level says more.
    this.nextThrow = () => ({ kind: this.nextFruit() });
    this.level = fairAt(1);
    this.blenderLevel = 0;
    this.blenderSpin = 0;
    this.joze = null;
    this.tokenTarget = { x: 120, y: 200 };
    this.sliced = { left: 0, right: 0 };
    this.configure({ pace: 'slow', side: 'right', slicing: 'swipe' });
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** What this level brings, on top of the grown-ups' pace: see fairAt in orders.js. */
  setLevel(level) {
    this.level = fairAt(level);
  }

  /** The pace the grown-ups chose, with the level's on top. */
  get pace() {
    const pace = PACES[this.paceName];
    const { gravity, every, volley, most } = this.level;
    return {
      gravity: pace.gravity * gravity,
      every: pace.every * every,
      volley: [pace.volley[0], Math.max(pace.volley[1], Math.min(VOLLEY_EVER, pace.volley[1] + volley))],
      most: Math.max(pace.most, Math.min(MOST_EVER, pace.most + most)),
    };
  }

  configure({ pace = this.paceName, side = this.side, slicing = this.slicing }) {
    this.paceName = pace;
    this.side = side;
    this.slicing = slicing;
  }

  reset() {
    this.fruit = [];
    this.halves = [];
    this.drops = [];
    this.tokens = [];
    this.trail = [];
    this.throwing = false;
    this.throwIn = 0;
    this.blenderLevel = 0;
    this.sliced = { left: 0, right: 0 };
    for (const glove of Object.values(this.gloves)) glove.sticky = 0;
  }

  /**
   * Throws one up now, somewhere exact if asked for, for the automated tests. across throws it from
   * one side of the reach to the other, tough makes it take two swipes, and withRotten throws a
   * rotten one up beside it.
   */
  throwFruit(kind, { x, y, across = false, tough = false, withRotten = false } = {}) {
    const { width, height } = this;
    const { pace } = this;
    const [low, high] = REACH[this.side];
    const startY = y ?? height + this.fruitSize * 1.4;
    const peak = between(0.34, 0.62) * height;
    const gravity = pace.gravity * height;
    const vy = y === undefined ? -Math.sqrt(2 * gravity * (startY - peak)) : 0;
    let startX = x ?? between(low, high) * width;
    let vx = x === undefined ? between(-0.03, 0.03) * width : 0;
    if (across && x === undefined) {
      // From near one end of the reach, landing near the other, so it's never out of reach.
      const leftFirst = Math.random() < 0.5;
      const from = (leftFirst ? low + ACROSS_FROM : high - ACROSS_FROM) * width;
      const to = (leftFirst ? high - ACROSS_FROM : low + ACROSS_FROM) * width;
      startX = from;
      vx = (to - from) / ((2 * -vy) / gravity);
    }
    const make = (what, atX) => ({
      kind: what,
      x: atX,
      y: startY,
      vx,
      vy,
      still: y !== undefined,
      turn: Math.random() * 6,
      spin: this.reducedMotion ? 0.3 : between(-1.6, 1.6),
      r: this.fruitSize,
      phase: Math.random() * 6,
      across,
      tough,
      cracked: false,
      rest: 0,
    });
    const fruit = make(kind, startX);
    this.fruit.push(fruit);
    if (withRotten) {
      // On whichever side there's room for it, within reach.
      const gap = this.fruitSize * PAIR_GAP;
      const right = startX + gap <= high * width ? startX + gap : null;
      const left = startX - gap >= low * width ? startX - gap : null;
      const at = Math.random() < 0.5 ? left ?? right : right ?? left;
      if (at !== null && this.fruit.length < pace.most) this.fruit.push({ ...make('rotten', at), tough: false, partner: fruit });
    }
    return fruit;
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.palmSize = Math.max(44, this.height * PALM_SHARE);
    this.fruitSize = Math.max(32, this.height * FRUIT_SHARE);
    this.paintBackdrop();
  }

  /** The fair only changes with the window, so it's drawn once and reused. */
  paintBackdrop() {
    const { width, height, ratio } = this;
    this.backdrop = document.createElement('canvas');
    this.backdrop.width = this.canvas.width;
    this.backdrop.height = this.canvas.height;
    const ctx = this.backdrop.getContext('2d');
    ctx.scale(ratio, ratio);

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#6cc3ff');
    sky.addColorStop(0.7, '#fdf3cf');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // Tents of the fair, in the distance.
    const tentColours = [['#ff7d6e', '#fff4e0'], ['#7cc4ff', '#fff4e0'], ['#ffd23f', '#fff4e0'], ['#8fd98a', '#fff4e0']];
    const ground = height * 0.74;
    ctx.fillStyle = '#9edb8f';
    ctx.fillRect(0, ground, width, height - ground);
    for (let i = 0; i < 6; i += 1) {
      const size = height * (0.13 + (i % 3) * 0.025);
      const x = (i + 0.5) * (width / 6);
      const [one, two] = tentColours[i % 4];
      const stripes = 6;
      for (let s = 0; s < stripes; s += 1) {
        ctx.fillStyle = s % 2 ? one : two;
        ctx.beginPath();
        ctx.moveTo(x, ground - size);
        ctx.lineTo(x - size * 0.9 + (s * size * 1.8) / stripes, ground);
        ctx.lineTo(x - size * 0.9 + ((s + 1) * size * 1.8) / stripes, ground);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Bunting across the top.
    const flags = ['#ff5a4f', '#ffd23f', '#27c96b', '#3b82f6', '#a855f7'];
    const count = 22;
    for (let i = 0; i < count; i += 1) {
      const x = ((i + 0.5) / count) * width;
      const y = height * 0.03 + Math.sin((i / (count - 1)) * Math.PI) * height * 0.05;
      ctx.fillStyle = flags[i % flags.length];
      ctx.beginPath();
      ctx.moveTo(x - width * 0.017, y);
      ctx.lineTo(x + width * 0.017, y);
      ctx.lineTo(x, y + height * 0.05);
      ctx.closePath();
      ctx.fill();
    }
    // The counter of the stand.
    const top = height * COUNTER_SHARE;
    ctx.fillStyle = '#e7a862';
    ctx.fillRect(0, top, width, height - top);
    ctx.fillStyle = '#c98443';
    ctx.fillRect(0, top, width, height * 0.018);
  }

  /** One frame. slicing says whether slices count, for the moments between customers. */
  update(dt, snapshot, { aspect = this.aspect, slicing = false, showHands = false } = {}) {
    this.time += dt;
    this.aspect = aspect;
    for (const side of ['left', 'right']) {
      const glove = this.gloves[side];
      glove.lastX = glove.visible ? glove.x : null;
      glove.lastY = glove.visible ? glove.y : null;
      if (showHands && snapshot?.side === side) glove.follow(snapshot[side], dt, this);
      else glove.hide();
      if (slicing) this.shakeOff(glove, dt);
    }

    const { pace } = this;
    if (this.throwing) {
      this.throwIn -= dt;
      if (this.throwIn <= 0) {
        const [few, many] = pace.volley;
        const count = Math.round(between(few, many));
        for (let i = 0; i < count && this.fruit.length < pace.most; i += 1) {
          const { kind, ...how } = this.nextThrow();
          this.throwFruit(kind, how);
        }
        this.throwIn = pace.every * between(0.85, 1.15);
      }
    }

    const gravity = pace.gravity * this.height;
    this.gravityNow = gravity;
    this.fruit = this.fruit.filter((fruit) => {
      fruit.rest = Math.max(0, (fruit.rest ?? 0) - dt);
      if (!fruit.still) {
        fruit.vy += gravity * dt;
        fruit.x += fruit.vx * dt;
        fruit.y += fruit.vy * dt;
        fruit.turn += fruit.spin * dt;
      }
      if (slicing && this.touchGloves(fruit)) return false;
      return fruit.still || fruit.y < this.height + fruit.r * 2;
    });

    const glove = this.gloves[this.side];
    if (slicing && glove.visible && glove.status === 'open' && glove.speed >= SWIPE_SPEED * 0.7) {
      this.trail.push({ x: glove.x + glove.points[12].x, y: glove.y + glove.points[12].y, life: TRAIL_SECONDS });
    }
    for (const point of this.trail) point.life -= dt;
    this.trail = this.trail.filter(({ life }) => life > 0);

    this.updateBits(dt);
    this.blenderSpin = Math.max(0, this.blenderSpin - dt);
    if (this.blenderSpin === 0 && this.blenderLevel >= 1) this.blenderLevel = 0;
  }

  /** A sticky glove comes clean by being held open. */
  shakeOff(glove, dt) {
    if (glove.sticky <= 0 || !glove.visible) {
      glove.stain = 0;
      return;
    }
    if (glove.status === 'open') {
      glove.sticky = Math.max(0, glove.sticky - dt);
      if (glove.sticky === 0) this.events.onShaken?.(glove.side);
    }
    glove.stain = glove.sticky > 0 ? 0.3 + 0.7 * (glove.sticky / STICKY_SECONDS) : 0;
  }

  /** Whether a hand has just gone through this fruit. Returns whether it was sliced. */
  touchGloves(fruit) {
    for (const glove of Object.values(this.gloves)) {
      if (!glove.visible) continue;
      const reach = fruit.r + this.palmSize * 0.5;
      const near = glove.lastX === null
        ? Math.hypot(fruit.x - glove.x, fruit.y - glove.y)
        : nearestOnPath(glove.lastX, glove.lastY, glove.x, glove.y, fruit.x, fruit.y);
      if (near > reach && glove.reachTo(fruit.x, fruit.y, this.palmSize) > fruit.r) continue;
      if (glove.status !== 'open') {
        if (this.time - glove.bumpedAt > BUMP_REST_SECONDS) {
          glove.bumpedAt = this.time;
          this.events.onBump?.(glove.side);
        }
        continue;
      }
      if (glove.sticky > 0) continue;
      // Just touching is enough if a grown-up has chosen that.
      if (this.slicing === 'swipe' && glove.speed < SWIPE_SPEED) continue;
      if (fruit.rest > 0) continue;
      if (fruit.tough && !fruit.cracked) {
        this.crack(fruit, glove);
        return false;
      }
      this.slice(fruit, glove);
      return true;
    }
    return false;
  }

  /** The first swipe on a tough fruit cracks it, and knocks it up a little, for time for the second. */
  crack(fruit, glove) {
    fruit.cracked = true;
    fruit.rest = CRACK_REST_SECONDS;
    if (!fruit.still) fruit.vy = Math.min(fruit.vy, -Math.sqrt(2 * (this.gravityNow ?? this.height) * CRACK_KICK * this.height));
    const { flesh } = LOOKS[fruit.kind];
    for (let i = 0; i < (this.reducedMotion ? 2 : 5); i += 1) {
      const angle = (i / 5) * Math.PI * 2 + Math.random();
      const speed = between(0.15, 0.35) * this.height;
      this.drops.push({ x: fruit.x, y: fruit.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: fruit.r * between(0.06, 0.1), life: 0.4, colour: flesh });
    }
    this.events.onCrack?.(fruit.kind, glove.side);
  }

  slice(fruit, glove) {
    this.sliced[glove.side] += 1;
    const moveX = glove.lastX === null ? 1 : glove.x - glove.lastX;
    const moveY = glove.lastY === null ? 0 : glove.y - glove.lastY;
    const cut = Math.atan2(moveY, moveX || 1);
    const push = this.height * 0.28;
    for (const way of [-1, 1]) {
      this.halves.push({
        kind: fruit.kind,
        x: fruit.x,
        y: fruit.y,
        vx: fruit.vx * 0.4 + Math.cos(cut + Math.PI / 2) * way * push,
        vy: fruit.vy * 0.3 + Math.sin(cut + Math.PI / 2) * way * push - this.height * 0.1,
        turn: cut,
        spin: way * between(1, 2.4),
        way,
        r: fruit.r,
        life: 1,
      });
    }
    const { flesh } = LOOKS[fruit.kind];
    const count = this.reducedMotion ? 4 : 9;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random();
      const speed = between(0.2, 0.5) * this.height;
      this.drops.push({ x: fruit.x, y: fruit.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: fruit.r * between(0.07, 0.14), life: 0.5, colour: flesh });
    }
    const verdict = this.events.onSlice?.(fruit.kind, glove.side);
    if (verdict === 'rotten') glove.sticky = STICKY_SECONDS;
    if (verdict === 'wanted') {
      this.tokens.push({ kind: fruit.kind, x: fruit.x, y: fruit.y, share: 0, fromX: fruit.x, fromY: fruit.y });
    }
  }

  updateBits(dt) {
    const gravity = this.height * 1.3;
    for (const half of this.halves) {
      half.life -= dt;
      half.vy += gravity * dt;
      half.x += half.vx * dt;
      half.y += half.vy * dt;
      half.turn += half.spin * dt;
    }
    this.halves = this.halves.filter(({ life, y }) => life > 0 && y < this.height + 80);
    for (const drop of this.drops) {
      drop.life -= dt;
      drop.vy += gravity * dt;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
    }
    this.drops = this.drops.filter(({ life }) => life > 0);
    for (const token of this.tokens) {
      token.share = Math.min(1, token.share + dt * 1.9);
      const ease = token.share * token.share * (3 - 2 * token.share);
      token.x = token.fromX + (this.tokenTarget.x - token.fromX) * ease;
      token.y = token.fromY + (this.tokenTarget.y - token.fromY) * ease;
    }
    this.tokens = this.tokens.filter(({ share }) => share < 1);
  }

  drawFruit(ctx, { kind, x, y, r, turn, tough = false, cracked = false }) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(turn);
    ctx.drawImage(this.sprites[kind], -r * 1.2, -r * 1.2, r * 2.4, r * 2.4);
    if (tough && !cracked) {
      // A thick brown skin all round, as a tough one has.
      ctx.lineWidth = r * 0.2;
      ctx.strokeStyle = SKIN;
      ctx.setLineDash([r * 0.35, r * 0.2]);
      ctx.beginPath();
      ctx.arc(0, r * 0.03, r * 1.02, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (cracked) {
      // A crack across it, showing the fruit inside.
      const crack = () => {
        ctx.beginPath();
        ctx.moveTo(-r * 0.8, -r * 0.1);
        ctx.lineTo(-r * 0.35, r * 0.15);
        ctx.lineTo(0, -r * 0.12);
        ctx.lineTo(r * 0.38, r * 0.16);
        ctx.lineTo(r * 0.8, -r * 0.05);
        ctx.stroke();
      };
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
      ctx.lineWidth = r * 0.2;
      crack();
      ctx.strokeStyle = LOOKS[kind].flesh;
      ctx.lineWidth = r * 0.1;
      crack();
    }
    ctx.restore();
  }

  drawFlies(ctx, fruit) {
    ctx.fillStyle = INK;
    for (let i = 0; i < 3; i += 1) {
      const angle = this.time * (1.6 + i * 0.3) + fruit.phase + i * 2.1;
      const size = fruit.r * (1.1 + Math.sin(this.time * 1.3 + i) * 0.15);
      ctx.beginPath();
      ctx.arc(fruit.x + Math.cos(angle) * size, fruit.y + Math.sin(angle * 1.3) * size, Math.max(2, fruit.r * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** The blender on the counter, filling up as an order comes together. */
  drawBlender(ctx) {
    const { height, width, joze } = this;
    const baseY = height * 0.985;
    const size = height * 0.2;
    const x = width * (this.side === 'right' ? 0.17 : 0.83);
    if (joze?.complete && joze.naturalWidth) {
      const picture = height * 0.3;
      ctx.drawImage(joze, x - size * 1.45, baseY - picture * 1.02, picture, picture);
    }
    const wobble = this.blenderSpin > 0 && !this.reducedMotion ? Math.sin(this.time * 40) * height * 0.002 : 0;
    ctx.save();
    ctx.translate(x + size * 0.3 + wobble, baseY);
    ctx.fillStyle = '#39455a';
    ctx.fillRect(-size * 0.32, -size * 0.2, size * 0.64, size * 0.2);
    ctx.fillStyle = 'rgb(255 255 255 / 0.65)';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, height * 0.004);
    ctx.beginPath();
    ctx.moveTo(-size * 0.26, -size * 0.2);
    ctx.lineTo(-size * 0.34, -size);
    ctx.lineTo(size * 0.34, -size);
    ctx.lineTo(size * 0.26, -size * 0.2);
    ctx.closePath();
    ctx.fill();
    const level = clamp(this.blenderLevel, 0, 1);
    if (level > 0) {
      const top = -size * 0.2 - size * 0.76 * level;
      const widthAt = size * (0.26 + 0.08 * level);
      ctx.fillStyle = '#ff9ac0';
      ctx.beginPath();
      ctx.moveTo(-size * 0.26, -size * 0.2);
      ctx.lineTo(-widthAt, top);
      ctx.lineTo(widthAt, top);
      ctx.lineTo(size * 0.26, -size * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(-size * 0.26, -size * 0.2);
    ctx.lineTo(-size * 0.34, -size);
    ctx.lineTo(size * 0.34, -size);
    ctx.lineTo(size * 0.26, -size * 0.2);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  render() {
    const { ctx, width, height, ratio } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.drawImage(this.backdrop, 0, 0, width, height);
    this.drawBlender(ctx);

    for (const fruit of this.fruit) {
      this.drawFruit(ctx, fruit);
      if (fruit.kind === 'rotten') this.drawFlies(ctx, fruit);
    }

    for (const half of this.halves) {
      ctx.save();
      ctx.translate(half.x, half.y);
      ctx.rotate(half.turn);
      ctx.beginPath();
      ctx.rect(-half.r * 1.4, half.way > 0 ? 0 : -half.r * 1.4, half.r * 2.8, half.r * 1.4);
      ctx.clip();
      ctx.drawImage(this.sprites[half.kind], -half.r * 1.2, -half.r * 1.2, half.r * 2.4, half.r * 2.4);
      ctx.fillStyle = LOOKS[half.kind].flesh;
      ctx.beginPath();
      ctx.ellipse(0, 0, half.r * 0.9, half.r * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const drop of this.drops) {
      ctx.globalAlpha = clamp(drop.life / 0.25, 0, 1);
      ctx.fillStyle = drop.colour;
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const token of this.tokens) this.drawFruit(ctx, { kind: token.kind, x: token.x, y: token.y, r: this.fruitSize * (1 - token.share * 0.6), turn: 0 });

    if (this.trail.length > 1) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < this.trail.length; i += 1) {
        const a = this.trail[i - 1];
        const b = this.trail[i];
        ctx.strokeStyle = `rgb(255 255 255 / ${clamp(b.life / TRAIL_SECONDS, 0, 1) * 0.8})`;
        ctx.lineWidth = height * 0.012 * clamp(b.life / TRAIL_SECONDS, 0.2, 1);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    this.gloves.left.draw(ctx, this.palmSize);
    this.gloves.right.draw(ctx, this.palmSize);
  }

  /** A picture of a fruit, for the order ticket. */
  pictureOf(kind) {
    return this.sprites[kind].toDataURL('image/png');
  }
}
