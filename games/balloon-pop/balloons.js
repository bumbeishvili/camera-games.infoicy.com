// Balloon Pop's world: balloons floating up and swaying, and a big glove that copies the
// child's hand finger by finger. Only an open hand pops a balloon. A closed one bumps it,
// which keeps the point of the game on opening the hand. Missing balloons costs nothing.
//
// With the maths challenge on, balloons with answers on them come up and wait. The right one pops.
// The wrong one is too hot: the glove goes black with soot and can't pop anything until the child
// has held the hand open for long enough to cool it, which is the exercise this game is for.
//
// Higher levels (rules.js) bring more balloons, a little faster, and new kinds: star balloons that need
// the open hand held on them a moment, pairs tied together, and a breeze that moves them all.
//
// Nothing flashes: seizures are more common in children with hemiplegia, so pops are small
// bursts of colour and the screen itself never changes brightness.
import { Glove, INK, toScreen } from '../../core/glove.js';
import { balloonLevel, PACES, STAR_HOLD_SECONDS } from './rules.js';

export { toScreen };

const COLOURS = ['#ff5a4f', '#ffb703', '#27c96b', '#3b82f6', '#a855f7', '#ff7eb6', '#14b8a6'];

// How strongly a balloon drifts towards a nearby open hand, in screen heights a second, for
// a child whose reach is limited. It only ever helps a hand that is already open.
const REACH_HELP = { none: 0, little: 0.05, lots: 0.13 };
const REACH_HELP_RANGE = 0.36;

const PALM_SHARE = 0.105; // A glove's palm length, as a share of screen height.
const BALLOON_SHARE = 0.078; // A balloon's radius, as a share of screen height.
const BUMP_REST_SECONDS = 0.7;
const BREEZE_RATE = 0.32; // How fast the breeze turns, in radians a second: slowly, one way and then the other.


// Balloons with answers on them.
const NUMBERED_SIZE = 1.3; // Bigger than the others, to fit a number that can be read across a room.
const NUMBER_RISE = 0.42; // In screen heights a second, up to where it waits.
const NUMBER_LEAVE = 0.6; // How fast the ones not wanted any more float off.
const NUMBER_ROWS = [0.48, 0.7]; // Where they wait, as shares of the screen's height.
// How long an open hand has to stay on a balloon for it to count, so that a hand on its way to the
// right answer can pass over a wrong one without any trouble.
const CHOOSE_SECONDS = 0.45;
const COOL_SECONDS = 1.5; // How long a burnt glove has to be held open.
const SMOKE_EVERY = 0.22;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const between = (low, high) => low + Math.random() * (high - low);
function shade(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const target = amount > 0 ? 255 : 0;
  const mix = (channel) => Math.round(channel + (target - channel) * Math.abs(amount));
  return `rgb(${mix(value >> 16)} ${mix((value >> 8) & 255)} ${mix(value & 255)})`;
}

/** Drawn once for each colour, as gradients are too slow to repeat every frame. */
function makeBalloonSprite(colour) {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = shade(colour, -0.28);
  ctx.beginPath();
  ctx.moveTo(120, 230);
  ctx.lineTo(107, 252);
  ctx.quadraticCurveTo(120, 246, 133, 252);
  ctx.closePath();
  ctx.fill();

  const body = ctx.createRadialGradient(88, 78, 8, 120, 122, 132);
  body.addColorStop(0, shade(colour, 0.6));
  body.addColorStop(0.42, colour);
  body.addColorStop(1, shade(colour, -0.3));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(120, 18);
  ctx.bezierCurveTo(186, 18, 222, 70, 222, 122);
  ctx.bezierCurveTo(222, 178, 160, 222, 120, 236);
  ctx.bezierCurveTo(80, 222, 18, 178, 18, 122);
  ctx.bezierCurveTo(18, 70, 54, 18, 120, 18);
  ctx.fill();

  ctx.fillStyle = 'rgb(255 255 255 / 0.55)';
  ctx.beginPath();
  ctx.ellipse(82, 76, 15, 28, 0.55, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

const CLOUD_HEIGHT = 170;

function makeCloudSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = CLOUD_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  for (const [x, y, r] of [[70, 92, 42], [130, 66, 56], [196, 76, 48], [250, 98, 34], [160, 104, 50]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

/** A glove that the wrong answer can burn. It gets its colour back gradually, as it cools. */
class BalloonGlove extends Glove {
  burnt = 0; // Seconds of being held open still needed, after popping a wrong answer.
  smokeIn = 0;

  draw(ctx, palmSize) {
    this.stain = this.burnt > 0 ? 0.25 + 0.75 * (this.burnt / COOL_SECONDS) : 0;
    this.embers = this.burnt > 0;
    super.draw(ctx, palmSize);
  }
}

export class BalloonField {
  /** events: onPop(total), onBump(side), onGoal(), onWrong(side), onCooled(side) */
  constructor(canvas, events = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.events = events;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sprites = COLOURS.map(makeBalloonSprite);
    this.cloud = makeCloudSprite();
    this.gloves = { left: new BalloonGlove('left'), right: new BalloonGlove('right') };
    this.balloons = [];
    this.shards = [];
    this.rings = [];
    this.smoke = [];
    this.numbered = false; // Whether balloons wait with answers on them, rather than floating by.
    this.rightNumber = null;
    this.wrong = { left: 0, right: 0 };
    this.aspect = 16 / 9;
    this.time = 0;
    this.spawnTimer = 0;
    this.nextColour = 0;
    this.clouds = Array.from({ length: 6 }, (_, index) => ({
      at: index / 6 + Math.random() * 0.1,
      y: 0.05 + Math.random() * 0.42,
      size: 0.35 + Math.random() * 0.55,
      drift: 0.004 + Math.random() * 0.006,
    }));
    this.configure({ goal: 20, pace: 'slow', reach: 'little', side: 'right' });
    this.setLevel(1);
    this.resetCounts();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  configure({ goal = this.goal, pace = this.paceName, reach = this.reachName, side = this.side }) {
    this.goal = goal;
    this.paceName = pace;
    this.reachName = reach;
    this.side = side;
  }

  /** What this level changes: see rules.js. */
  setLevel(level) {
    this.level = level;
    this.plan = balloonLevel(level);
  }

  /** The chosen speed, with this level's on top. */
  get pace() {
    const chosen = PACES[this.paceName];
    const { plan } = this;
    return { rise: chosen.rise * plan.rise, every: chosen.every * plan.every, most: chosen.most + plan.most };
  }

  /** How far the breeze has pushed everything sideways just now, in pixels. */
  get breezeAt() {
    if (!this.plan.breeze) return 0;
    return Math.sin(this.time * BREEZE_RATE) * this.plan.breeze * this.width * (this.reducedMotion ? 0.4 : 1);
  }

  resetCounts() {
    this.popped = { left: 0, right: 0 };
    this.wrong = { left: 0, right: 0 };
    this.reachedGoal = false;
    this.gloves.left.burnt = 0;
    this.gloves.right.burnt = 0;
  }

  /** A new round: an empty sky and nothing popped. */
  reset(options) {
    this.configure(options);
    this.resetCounts();
    this.balloons = [];
    this.shards = [];
    this.rings = [];
    this.smoke = [];
    this.spawnTimer = 0;
    this.numbered = false;
    this.rightNumber = null;
  }

  /** Where balloons with answers wait, within reach of the hand, staggered so they don't touch. */
  numberSpots(count) {
    const [low, high] = { left: [0.1, 0.66], right: [0.34, 0.9] }[this.side];
    // For a child whose reach is limited, they're closer together.
    const tighten = { none: 0, little: 0.02, lots: 0.05 }[this.reachName];
    const from = low + tighten;
    const to = high - tighten;
    return Array.from({ length: count }, (_, index) => ({
      x: (from + ((index + 0.5) / count) * (to - from)) * this.width,
      y: NUMBER_ROWS[index % 2] * this.height,
    }));
  }

  /** Balloons with these numbers on come up and wait. Anything still up there floats away. */
  askNumbers(numbers, right) {
    this.numbered = true;
    this.rightNumber = right;
    this.clearNumbers();
    this.rightNumber = right;
    const spots = this.numberSpots(numbers.length);
    numbers.forEach((number, index) => {
      const { x, y } = spots[index];
      const balloon = this.addBalloon({ x, y: this.height + this.balloonSize * 2.4, still: true });
      Object.assign(balloon, {
        number,
        hoverY: y,
        r: this.balloonSize * NUMBERED_SIZE,
        arrived: false,
        ready: false,
        choosing: 0,
      });
    });
  }

  /** Whatever is up there floats away, and nothing can be popped until the next question. */
  clearNumbers() {
    this.rightNumber = null;
    for (const balloon of this.balloons) balloon.leaving = true;
  }

  /** Back to balloons floating by, with no numbers on them. */
  stopNumbers() {
    this.clearNumbers();
    this.numbered = false;
    this.gloves.left.burnt = 0;
    this.gloves.right.burnt = 0;
  }

  get total() {
    return this.popped.left + this.popped.right;
  }

  get info() {
    return {
      total: this.total,
      goal: this.goal,
      popped: { ...this.popped },
      wrong: { ...this.wrong },
      progress: clamp(this.total / this.goal, 0, 1),
    };
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.palmSize = Math.max(44, this.height * PALM_SHARE);
    this.balloonSize = Math.max(30, this.height * BALLOON_SHARE);
    this.paintBackdrop();
  }

  /** The sky and hills only change with the window, so they're drawn once and reused. */
  paintBackdrop() {
    const { width, height, ratio } = this;
    this.backdrop = document.createElement('canvas');
    this.backdrop.width = this.canvas.width;
    this.backdrop.height = this.canvas.height;
    const ctx = this.backdrop.getContext('2d');
    ctx.scale(ratio, ratio);

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#58b7ff');
    sky.addColorStop(0.72, '#d6f0ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const sun = ctx.createRadialGradient(width * 0.84, height * 0.16, 0, width * 0.84, height * 0.16, height * 0.3);
    sun.addColorStop(0, 'rgb(255 244 190 / 0.95)');
    sun.addColorStop(0.3, 'rgb(255 244 190 / 0.6)');
    sun.addColorStop(1, 'rgb(255 244 190 / 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, width, height);

    const hill = (colour, base, size, stretch, shift) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 8) {
        const u = (x / width) * stretch + shift;
        ctx.lineTo(x, height * base - height * size * (Math.sin(u) * 0.6 + Math.sin(u * 2.3 + 1) * 0.4));
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
    };
    hill('#a6e4b4', 0.82, 0.05, 5, 0.6);
    hill('#7ed492', 0.88, 0.045, 7, 2.4);
    hill('#5cc471', 0.95, 0.035, 9, 4.1);
  }

  /** Puts a balloon somewhere exact, for the automated tests. */
  spawnAt(x, y, { still = false } = {}) {
    return this.addBalloon({ x, y, still });
  }

  addBalloon({ x, y, still = false, star = false }) {
    const wanderer = Math.random() < this.plan.wanderers;
    const balloon = {
      homeX: x,
      x,
      y,
      still,
      r: this.balloonSize * between(0.9, 1.15),
      sprite: this.nextColour,
      pace: still ? 0 : between(0.85, 1.15) * (wanderer ? 0.72 : 1),
      phase: Math.random() * Math.PI * 2,
      swayRate: between(0.5, 0.9),
      sway: still ? 0 : this.width * (wanderer ? between(0.07, 0.11) : between(0.015, 0.035)) * (this.reducedMotion ? 0.4 : 1),
      drift: wanderer && !still ? between(-0.03, 0.03) * this.width : 0,
      push: 0,
      pushSpeed: 0,
      bumpedAt: -Infinity,
      star,
      choosing: 0,
      tie: null,
    };
    this.nextColour = (this.nextColour + 1) % this.sprites.length;
    this.balloons.push(balloon);
    return balloon;
  }

  /** Balloons come up across the hand's own side and a little past the middle. */
  spawn() {
    const { width, height } = this;
    const range = { left: [0.1, 0.66], right: [0.34, 0.9] }[this.side];
    // A few tries for a clear patch of sky, so balloons don't start on top of each other.
    let x = 0;
    for (let tries = 0; tries < 5; tries += 1) {
      x = between(range[0], range[1]) * width;
      const crowded = this.balloons.some((other) => other.y > height * 0.7 && Math.abs(other.x - x) < other.r * 2.6);
      if (!crowded) break;
    }
    const y = height + this.balloonSize * 1.6;
    const { plan } = this;
    const room = this.pace.most - this.balloons.length;
    if (room >= 2 && Math.random() < plan.pairs) {
      this.addPair(x, y);
      return;
    }
    this.addBalloon({ x, y, star: Math.random() < plan.stars });
  }

  /** Two balloons tied together, which go up together until one of them pops. */
  addPair(x, y) {
    const apart = this.balloonSize * 1.05;
    const middle = clamp(x, apart + this.balloonSize, this.width - apart - this.balloonSize);
    const first = this.addBalloon({ x: middle - apart, y });
    const second = this.addBalloon({ x: middle + apart, y: y - this.balloonSize * 0.5 });
    // They move as one: the same pace, sway and drift.
    for (const key of ['pace', 'phase', 'swayRate', 'sway', 'drift']) second[key] = first[key];
    const tie = { members: [first, second] };
    first.tie = tie;
    second.tie = tie;
    return tie;
  }

  /**
   * One frame. snapshot is the hand monitor's latest, or null for no hands. popping and
   * spawning are off outside of play, while balloons just float behind the other screens.
   */
  update(dt, snapshot, { aspect = this.aspect, popping = false, spawning = true, showHands = false } = {}) {
    this.time += dt;
    this.aspect = aspect;

    for (const side of ['left', 'right']) {
      const glove = this.gloves[side];
      if (showHands && snapshot?.side === side) glove.follow(snapshot[side], dt, this);
      else glove.hide();
      if (popping) this.coolGlove(glove, dt);
    }

    const { pace } = this;
    if (spawning && !this.numbered) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.balloons.length < pace.most) {
        this.spawn();
        this.spawnTimer = pace.every * between(0.8, 1.2);
      }
    }

    this.balloons = this.balloons.filter((balloon) => {
      this.moveBalloon(balloon, dt, pace);
      if (popping && balloon.y < this.height + balloon.r && this.touchGloves(balloon, dt)) return false;
      return balloon.y > -balloon.r * 3.2;
    });

    this.updateEffects(dt);
    for (const cloud of this.clouds) {
      if (!this.reducedMotion) cloud.at = (cloud.at + cloud.drift * dt) % 1.3;
    }

    if (popping && !this.reachedGoal && this.total >= this.goal) {
      this.reachedGoal = true;
      this.events.onGoal?.();
    }
  }

  /** A burnt glove only cools while it's held open, and it smokes until it has. */
  coolGlove(glove, dt) {
    if (glove.burnt <= 0 || !glove.visible) return;
    glove.smokeIn -= dt;
    if (glove.smokeIn <= 0) {
      glove.smokeIn = SMOKE_EVERY * (this.reducedMotion ? 2 : 1);
      this.addSmoke(glove.x, glove.y - this.palmSize * 0.5, 1);
    }
    if (glove.status !== 'open') return;
    glove.burnt = Math.max(0, glove.burnt - dt);
    if (glove.burnt === 0) this.events.onCooled?.(glove.side);
  }

  addSmoke(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      this.smoke.push({
        x: x + between(-0.5, 0.5) * this.palmSize,
        y,
        vx: between(-0.03, 0.03) * this.height,
        vy: -between(0.08, 0.16) * this.height,
        size: this.palmSize * between(0.22, 0.42),
        life: 0.9,
      });
    }
  }

  moveBalloon(balloon, dt, pace) {
    const { width, height } = this;
    if (balloon.leaving) {
      balloon.y -= NUMBER_LEAVE * height * dt;
    } else if (balloon.number === undefined) {
      balloon.y -= pace.rise * balloon.pace * height * dt;
    } else if (!balloon.arrived) {
      balloon.y -= NUMBER_RISE * height * dt;
      if (balloon.y <= balloon.hoverY) balloon.arrived = true;
    } else {
      // Waiting for as long as it takes, bobbing a little.
      const bob = this.reducedMotion ? 0 : Math.sin(this.time * 1.1 + balloon.phase) * height * 0.008;
      balloon.y += (balloon.hoverY + bob - balloon.y) * Math.min(1, dt * 3);
    }
    balloon.homeX += balloon.drift * dt;
    if (balloon.homeX < width * 0.08 || balloon.homeX > width * 0.92) balloon.drift *= -1;

    // A bump pushes a balloon aside, and it eases back.
    balloon.push += balloon.pushSpeed * dt;
    balloon.pushSpeed *= Math.exp(-dt * 3.2);
    balloon.push *= Math.exp(-dt * 0.9);

    const help = REACH_HELP[this.reachName] * height;
    if (help > 0 && !balloon.still) {
      for (const glove of Object.values(this.gloves)) {
        if (!glove.visible || glove.status !== 'open') continue;
        const dx = glove.x - balloon.x;
        const dy = glove.y - balloon.y;
        const away = Math.hypot(dx, dy);
        if (away > 1 && away < height * REACH_HELP_RANGE) {
          balloon.homeX += (dx / away) * help * dt;
          balloon.y += (dy / away) * help * dt;
        }
      }
    }

    const sway = Math.sin(this.time * balloon.swayRate + balloon.phase) * balloon.sway;
    const breeze = balloon.still || balloon.number !== undefined ? 0 : this.breezeAt;
    balloon.x = clamp(balloon.homeX + sway + breeze + balloon.push, balloon.r, width - balloon.r);
  }

  /** Whether a balloon with an answer on it has been chosen, and what that means for the glove. */
  touchNumbered(balloon, dt) {
    if (balloon.leaving || !balloon.arrived) return false;
    const glove = Object.values(this.gloves).find((each) => each.visible && each.reachTo(balloon.x, balloon.y, this.palmSize) <= balloon.r);
    // A hand that was already there when it arrived hasn't chosen it, so it has to come back.
    if (!balloon.ready) {
      if (!glove) balloon.ready = true;
      return false;
    }
    if (!glove || glove.status !== 'open' || glove.burnt > 0) {
      balloon.choosing = Math.max(0, balloon.choosing - dt * 2);
      if (glove && this.time - balloon.bumpedAt > BUMP_REST_SECONDS) {
        balloon.bumpedAt = this.time;
        balloon.pushSpeed += (Math.sign(balloon.x - glove.x) || 1) * this.height * 0.4;
        if (glove.status !== 'open') this.events.onBump?.(glove.side);
      }
      return false;
    }
    balloon.choosing += dt;
    if (balloon.choosing < CHOOSE_SECONDS) return false;
    if (balloon.number === this.rightNumber) this.pop(balloon, glove.side);
    else this.burn(balloon, glove);
    return true;
  }

  /** The wrong answer goes up in smoke, and takes the glove with it for a while. */
  burn(balloon, glove) {
    this.wrong[glove.side] += 1;
    glove.burnt = COOL_SECONDS;
    glove.smokeIn = 0;
    this.addSmoke(balloon.x, balloon.y, this.reducedMotion ? 4 : 9);
    this.events.onWrong?.(glove.side);
  }

  /** Returns whether the balloon popped. */
  touchGloves(balloon, dt) {
    if (balloon.number !== undefined) return this.touchNumbered(balloon, dt);
    if (balloon.leaving) return false;
    let held = false;
    for (const glove of Object.values(this.gloves)) {
      if (!glove.visible || glove.reachTo(balloon.x, balloon.y, this.palmSize) > balloon.r) continue;
      if (glove.status === 'open' && balloon.star) {
        // A star balloon needs the open hand to stay on it for a moment.
        held = true;
        balloon.choosing += dt;
        if (balloon.choosing < STAR_HOLD_SECONDS) continue;
        this.pop(balloon, glove.side);
        return true;
      }
      if (glove.status === 'open') {
        this.pop(balloon, glove.side);
        return true;
      }
      if (this.time - balloon.bumpedAt > BUMP_REST_SECONDS) {
        balloon.bumpedAt = this.time;
        const direction = Math.sign(balloon.x - glove.x) || 1;
        balloon.pushSpeed += direction * this.height * 0.75;
        this.events.onBump?.(glove.side);
      }
    }
    if (!held) balloon.choosing = Math.max(0, balloon.choosing - dt * 2);
    return false;
  }

  pop(balloon, side) {
    this.popped[side] += 1;
    // Its partner floats on by itself.
    if (balloon.tie) balloon.tie.members = balloon.tie.members.filter((member) => member !== balloon);
    const colour = COLOURS[balloon.sprite];
    const count = this.reducedMotion ? 7 : 15;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = between(0.35, 0.95) * this.height;
      this.shards.push({
        x: balloon.x,
        y: balloon.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spin: between(-9, 9),
        turn: Math.random() * Math.PI,
        size: balloon.r * between(0.16, 0.3),
        life: 0.55,
        colour,
      });
    }
    this.rings.push({ x: balloon.x, y: balloon.y, r: balloon.r * 0.7, life: 0.32, colour });
    this.events.onPop?.(this.total);
  }

  updateEffects(dt) {
    const gravity = this.height * 1.5;
    for (const shard of this.shards) {
      shard.life -= dt;
      shard.vy += gravity * dt;
      shard.vx *= Math.exp(-dt * 2.4);
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      shard.turn += shard.spin * dt;
    }
    this.shards = this.shards.filter((shard) => shard.life > 0);
    for (const ring of this.rings) {
      ring.life -= dt;
      ring.r += this.height * 0.6 * dt;
    }
    this.rings = this.rings.filter((ring) => ring.life > 0);
    for (const puff of this.smoke) {
      puff.life -= dt;
      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      puff.size += this.palmSize * 0.5 * dt;
    }
    this.smoke = this.smoke.filter((puff) => puff.life > 0);
  }

  drawBalloon(balloon) {
    const { ctx } = this;
    const { x, y, r } = balloon;
    // Leans into its movement, and its string trails behind.
    const breezeLean = balloon.still || balloon.number !== undefined || !this.plan.breeze
      ? 0
      : Math.cos(this.time * BREEZE_RATE) * this.plan.breeze * 2.4;
    const lean = clamp((Math.cos(this.time * balloon.swayRate + balloon.phase) * balloon.sway) / (this.width * 0.6) + balloon.pushSpeed / (this.height * 6) + breezeLean, -0.3, 0.3);
    const tail = r * 1.16;
    const flutter = Math.sin(this.time * 1.7 + balloon.phase) * r * 0.26;

    ctx.strokeStyle = 'rgb(18 48 77 / 0.45)';
    ctx.lineWidth = Math.max(1.5, r * 0.035);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - lean * tail, y + tail);
    const pair = balloon.tie?.members.length === 2 ? balloon.tie.members : null;
    if (pair) {
      // Both strings go down to one knot between them.
      const knotX = (pair[0].x + pair[1].x) / 2 - lean * r * 2;
      const knotY = Math.max(pair[0].y, pair[1].y) + tail + r * 1.4;
      ctx.quadraticCurveTo(x - lean * r, y + tail + r * 0.8, knotX, knotY);
      if (balloon === pair[0]) ctx.lineTo(knotX - lean * r - flutter * 0.4, knotY + r * 0.9);
    } else {
      ctx.quadraticCurveTo(x - lean * r * 2 + flutter, y + tail + r * 0.75, x - lean * r * 2.8 - flutter * 0.6, y + tail + r * 1.5);
    }
    ctx.stroke();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);
    ctx.drawImage(this.sprites[balloon.sprite], -r * 1.2, -r * 1.22, r * 2.4, r * 3);
    if (balloon.number !== undefined) this.drawNumber(balloon);
    else if (balloon.star) this.drawStar(balloon);
    ctx.restore();
  }

  /** A star balloon has a white star on it, and the ring that closes as an open hand stays on it. */
  drawStar({ r, choosing }) {
    const { ctx } = this;
    ctx.fillStyle = 'rgb(255 255 255 / 0.92)';
    ctx.strokeStyle = 'rgb(18 48 77 / 0.35)';
    ctx.lineWidth = Math.max(1.5, r * 0.05);
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const radius = (i % 2 === 0 ? 0.5 : 0.22) * r;
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius + r * 0.02);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (choosing > 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = r * 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, choosing / STAR_HOLD_SECONDS));
      ctx.stroke();
    }
  }

  /** The answer, and a ring around it that closes as an open hand stays on it. */
  drawNumber({ number, r, choosing }) {
    const { ctx } = this;
    ctx.font = `700 ${Math.round(r * 1.1)}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 0.16;
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#ffffff';
    ctx.strokeText(String(number), 0, r * 0.04);
    ctx.fillText(String(number), 0, r * 0.04);
    if (choosing > 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = r * 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, choosing / CHOOSE_SECONDS));
      ctx.stroke();
    }
  }

  render() {
    const { ctx, width, height, ratio } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.drawImage(this.backdrop, 0, 0, width, height);

    ctx.globalAlpha = 0.9;
    for (const cloud of this.clouds) {
      const w = height * 0.42 * cloud.size;
      ctx.drawImage(this.cloud, cloud.at * width * 1.1 - w * 0.6, cloud.y * height, w, (w * CLOUD_HEIGHT) / 320);
    }
    ctx.globalAlpha = 1;

    for (const balloon of this.balloons) this.drawBalloon(balloon);

    for (const ring of this.rings) {
      ctx.strokeStyle = ring.colour;
      ctx.globalAlpha = clamp(ring.life / 0.32, 0, 1) * 0.7;
      ctx.lineWidth = Math.max(2, height * 0.008);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const shard of this.shards) {
      ctx.fillStyle = shard.colour;
      ctx.globalAlpha = clamp(shard.life / 0.3, 0, 1);
      ctx.save();
      ctx.translate(shard.x, shard.y);
      ctx.rotate(shard.turn);
      ctx.fillRect(-shard.size / 2, -shard.size / 3, shard.size, (shard.size * 2) / 3);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    this.gloves.left.draw(ctx, this.palmSize);
    this.gloves.right.draw(ctx, this.palmSize);

    ctx.fillStyle = '#5b5552';
    for (const puff of this.smoke) {
      ctx.globalAlpha = clamp(puff.life / 0.9, 0, 1) * 0.5;
      ctx.beginPath();
      ctx.arc(puff.x, puff.y, puff.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
