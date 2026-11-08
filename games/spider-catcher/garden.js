// The garden: each place's picture, the web, the spiders playing, and the glove that catches them and
// carries them home. Joze is 3D, on his own canvas between the garden and everything else. The spiders
// play on the side of the hand in play, and their web is across from them, so bringing one home is a
// reach across.
//
// Nothing flashes: seizures are more common in children with hemiplegia. Colours stay steady, a web
// fills in slowly, places fade into each other over more than a second, and legs only patter.
import { Glove, INK } from '../../core/glove.js';
import {
  CATCH_REACH, Catching, DASH, SPIDER_SIZE, WEB_REACH, gardenAt, pathFor, spidersFor, spiderAt, spotFor, webAt,
} from './spiders.js';

const PALM_SHARE = 0.105;
const WEB_SIZE = 0.15; // The web's radius, in screen heights.
const WEB_ACROSS = 0.38; // Where the web hangs, across the screen from the side Joze is on.
const WEB_DOWN = 0.5;
const GARDEN_ACROSS = 0.76; // The middle of where the spiders play, with no help reaching.
const GARDEN_DOWN = 0.55;
const BRANCH_DOWN = 0.17; // The branch the swinging spiders hang from.
const REACH_HELP = { none: 0, little: 0.06, lots: 0.12 }; // How much nearer the spiders play, in screen widths.
const ARRIVE_SECONDS = 0.5;
const RETURN_SECONDS = 0.9;
const LAND_SECONDS = 0.45;
const FILL_RATE = 1.2; // How quickly a web fills in, as a share a second.
const SHY_REACH = 1.3; // A shy spider notices a hand this much further off than one can catch it.
const BEHIND = 0.55; // How far behind its twin the second of a pair is, along their path.
const FURTHEST = 0.2; // A spider's path stays within this of the middle of its garden, in screen heights.
const PLACE_HOLD = 0.6; // A moment to see the full web, before moving on.
const MOVE_SECONDS = 1.4; // From one place to the next.
const COLOURS = ['#ff7eb6', '#5fc3ff', '#ffc93c', '#6ad98b', '#b48cff', '#ff9a52'];
const LEGS = [-0.95, -0.45, 0.05, 0.55]; // Leg angles from straight out, on each side.

const LOOKS = {
  gate: { sky: ['#8fd3ff', '#e9f8ff'], far: '#a8dc8a', near: '#7cc65e', leaves: '#4f9f47' },
  carrots: { sky: ['#9bd8ff', '#f1fbff'], far: '#b9e08c', near: '#86c95c', leaves: '#5aa84a' },
  honey: { sky: ['#ffd9a8', '#fff5df'], far: '#c6dd8a', near: '#93c860', leaves: '#5f9e3f' },
  pond: { sky: ['#a6dcff', '#f0faff'], far: '#a5d9a0', near: '#7cc36a', leaves: '#4a9a50' },
  house: { sky: ['#ffc9a0', '#fff1dc'], far: '#b6d98e', near: '#8bc867', leaves: '#4e9d4c' },
};

const ease = (share) => share * share * (3 - 2 * share);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** A colour made darker or lighter by an amount from -1 to 1. */
function shade(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const channels = [value >> 16, (value >> 8) & 255, value & 255].map((channel) =>
    Math.round(amount < 0 ? channel * (1 + amount) : channel + (255 - channel) * amount));
  return `rgb(${channels.join(' ')})`;
}

/**
 * A spider's round body and friendly face, about 200 across, drawn once for each colour. Its legs are
 * drawn as it moves. Big eyes, rosy cheeks and a smile, and nothing pointy.
 */
function paintSpider(colour) {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  ctx.translate(120, 120);
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.ellipse(0, 6, 96, 90, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // A lighter tummy, and a shine on top.
  ctx.fillStyle = shade(colour, 0.35);
  ctx.beginPath();
  ctx.ellipse(0, 52, 58, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgb(255 255 255 / 0.45)';
  ctx.beginPath();
  ctx.ellipse(-46, -46, 18, 11, -0.6, 0, Math.PI * 2);
  ctx.fill();
  // Big eyes.
  for (const x of [-34, 34]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x, -12, 28, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x + 4, -6, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + 9, -13, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Rosy cheeks and a smile.
  ctx.fillStyle = 'rgb(255 120 140 / 0.55)';
  for (const x of [-62, 62]) {
    ctx.beginPath();
    ctx.ellipse(x, 24, 14, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 24, 22, 0.25 * Math.PI, 0.75 * Math.PI);
  ctx.stroke();
  return canvas;
}

export class Garden {
  /** events: onCatch(), onHome(side), onLetGo(), onDash(), onArrive(), onMoved() */
  constructor({ backdrop, canvas }, events = {}) {
    this.backdropCanvas = backdrop;
    this.back = backdrop.getContext('2d', { alpha: false });
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.events = events;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    this.bodies = COLOURS.map(paintSpider);
    this.catching = new Catching();
    this.level = gardenAt(1);
    this.levelNumber = 1;
    this.side = 'right';
    this.reach = 'little';
    this.aspect = 16 / 9;
    this.time = 0;
    this.spiders = [];
    this.waiting = [];
    this.count = 0;
    this.homeHere = 0;
    this.fill = 0;
    this.place = 'gate';
    this.fromPlace = null;
    this.fade = 1;
    this.moving = 0;
    this.holdFor = 0;
    this.oldWeb = null;
    this.home = { left: 0, right: 0 };
    this.lastHand = { open: false, closed: false };
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
    this.scenes = {};
  }

  /** Which way is away from Joze: 1 when the spiders play on the right. */
  get way() {
    return this.side === 'right' ? 1 : -1;
  }

  /** Across the screen, in pixels, from the side Joze is on. */
  across(share) {
    return (this.side === 'right' ? share : 1 - share) * this.width;
  }

  get spiderSize() {
    return this.height * SPIDER_SIZE;
  }

  get catchReach() {
    return this.palmSize * CATCH_REACH + this.spiderSize;
  }

  /** The middle of where the spiders play. */
  get gardenMiddle() {
    return { x: this.across(GARDEN_ACROSS - REACH_HELP[this.reach]), y: this.height * GARDEN_DOWN };
  }

  /** Where the web is now, as it may be swaying from the higher levels. */
  get web() {
    const sway = webAt(this.level.webSway, this.time, this.reducedMotion);
    return { x: this.across(WEB_ACROSS) + sway.x * this.height, y: this.height * WEB_DOWN + sway.y * this.height, r: this.height * WEB_SIZE };
  }

  /** What this level brings: see gardenAt in spiders.js. */
  setLevel(level) {
    this.levelNumber = level;
    this.level = gardenAt(level);
  }

  /** A new place: its web is empty, and the first spiders come out to play straight away. */
  arriveAt(place, count) {
    this.place = place;
    this.fromPlace = null;
    this.fade = 1;
    this.moving = 0;
    this.oldWeb = null;
    this.count = count;
    this.homeHere = 0;
    this.fill = 0;
    this.spiders = [];
    this.catching = new Catching();
    this.waiting = spidersFor(count, this.levelNumber);
    this.letOut();
  }

  /** Off to the next place, with this one's full web fading as the next one comes. */
  moveOn() {
    this.holdFor = PLACE_HOLD;
  }

  /** Brings out more spiders while there are fewer playing than the level has at once. */
  letOut() {
    const playing = () => this.spiders.filter(({ state }) => state !== 'home' && state !== 'landing').length;
    while (this.waiting.length && playing() < this.level.atOnce) {
      const used = new Set(this.spiders.filter(({ state }) => state !== 'home' && state !== 'landing').map(({ slot }) => slot));
      let slot = 0;
      while (used.has(slot)) slot += 1;
      const plan = this.waiting.shift();
      const spider = this.makeSpider(plan, slot);
      this.spiders.push(spider);
      // Twins come out together.
      if (this.waiting[0]?.behind && plan.pair !== null) {
        const twin = this.waiting.shift();
        this.spiders.push(this.makeSpider(twin, slot, spider.path));
      }
    }
  }

  makeSpider(plan, slot, leader = null) {
    const path = leader
      ? { ...leader, phase: leader.phase - BEHIND }
      : pathFor({ kind: plan.kind, centre: spotFor(slot), phase: plan.phase, level: this.levelNumber });
    const spider = {
      ...plan,
      slot,
      path,
      shift: { x: 0, y: 0 },
      state: 'playing',
      alpha: 0,
      x: 0,
      y: 0,
      dash: null,
      dashed: false,
      back: null,
      land: null,
      spot: null,
      legs: Math.random() * Math.PI * 2,
      speed: 0,
    };
    this.placeOnPath(spider);
    this.events.onArrive?.();
    return spider;
  }

  /** Where a spider is on its path now, in pixels. */
  pathPoint(spider) {
    const at = spiderAt(spider.path, this.time);
    const middle = this.gardenMiddle;
    return {
      x: middle.x + this.way * (at.x + spider.shift.x) * this.height,
      y: middle.y + (at.y + spider.shift.y) * this.height,
    };
  }

  placeOnPath(spider) {
    const { x, y } = this.pathPoint(spider);
    spider.x = x;
    spider.y = y;
  }

  /** Whether a spider can be caught now: out playing, and not dashing off or scurrying back. */
  catchable(spider) {
    return spider.state === 'playing' && spider.alpha >= 0.5;
  }

  isNear(spider, glove, reach = this.catchReach) {
    return Math.hypot(spider.x - glove.x, spider.y - glove.y) <= reach;
  }

  /** The nearest spider a hand is by, if any. It's about the hand being there, not fingertips touching. */
  spiderNear(glove) {
    let best = null;
    let bestGap = Infinity;
    for (const spider of this.spiders) {
      if (!this.catchable(spider) || !this.isNear(spider, glove)) continue;
      const gap = Math.hypot(spider.x - glove.x, spider.y - glove.y);
      if (gap < bestGap) {
        best = spider;
        bestGap = gap;
      }
    }
    return best;
  }

  get holding() {
    return this.catching.held;
  }

  get onWeb() {
    const glove = this.gloves[this.side];
    const { web } = this;
    return glove.visible && Math.hypot(glove.x - web.x, glove.y - web.y) <= this.height * WEB_REACH;
  }

  update(dt, snapshot, { aspect = this.aspect, playing = false, showHands = false } = {}) {
    this.time += dt;
    this.aspect = aspect;
    for (const side of ['left', 'right']) {
      const glove = this.gloves[side];
      if (showHands && snapshot?.side === side) glove.follow(snapshot[side], dt, this);
      else glove.hide();
    }
    this.fill += Math.sign(this.fillWanted - this.fill) * Math.min(Math.abs(this.fillWanted - this.fill), dt * FILL_RATE);
    this.moveAlong(dt);
    for (const spider of this.spiders) this.moveSpider(spider, dt);
    if (playing && this.moving === 0) {
      this.noticeHand();
      this.handleHand(dt, snapshot);
    }
  }

  get fillWanted() {
    return this.count ? this.homeHere / this.count : 0;
  }

  /** From one place to the next: a moment with the full web, then the next place fading in. */
  moveAlong(dt) {
    if (this.holdFor > 0) {
      this.holdFor -= dt;
      if (this.holdFor <= 0) {
        this.holdFor = 0;
        this.events.onLeave?.();
      }
      return;
    }
    if (this.moving > 0) {
      this.moving = Math.max(0, this.moving - dt);
      this.fade = 1 - this.moving / MOVE_SECONDS;
      if (this.moving === 0) {
        this.fromPlace = null;
        this.oldWeb = null;
        this.events.onMoved?.();
      }
    }
  }

  /** The garden starts changing to the next place, which has its own web. */
  goTo(place) {
    this.fromPlace = this.place;
    this.place = place;
    this.oldWeb = { spiders: this.spiders.filter(({ state }) => state === 'home'), fill: this.fill };
    this.spiders = [];
    this.count = 0;
    this.homeHere = 0;
    this.fill = 0;
    this.fade = 0;
    this.moving = MOVE_SECONDS;
    this.catching = new Catching();
  }

  moveSpider(spider, dt) {
    spider.alpha = Math.min(1, spider.alpha + dt / ARRIVE_SECONDS);
    const lastX = spider.x;
    const lastY = spider.y;
    if (spider.state === 'dashing') {
      const { dash } = spider;
      dash.t += dt;
      const share = ease(Math.min(1, dash.t / dash.seconds));
      spider.shift = { x: dash.from.x + (dash.to.x - dash.from.x) * share, y: dash.from.y + (dash.to.y - dash.from.y) * share };
      if (dash.t >= dash.seconds) {
        spider.state = 'playing';
        spider.dash = null;
      }
    }
    if (spider.state === 'playing' || spider.state === 'dashing') {
      this.placeOnPath(spider);
    } else if (spider.state === 'returning') {
      const { back } = spider;
      back.t += dt;
      const share = ease(Math.min(1, back.t / RETURN_SECONDS));
      const to = this.pathPoint(spider);
      spider.x = back.x + (to.x - back.x) * share;
      spider.y = back.y + (to.y - back.y) * share;
      if (back.t >= RETURN_SECONDS) {
        spider.state = 'playing';
        spider.back = null;
      }
    } else if (spider.state === 'landing') {
      const { land } = spider;
      land.t += dt;
      const share = ease(Math.min(1, land.t / LAND_SECONDS));
      const to = this.spotInWeb(spider.spot);
      spider.x = land.x + (to.x - land.x) * share;
      spider.y = land.y + (to.y - land.y) * share;
      if (land.t >= LAND_SECONDS) spider.state = 'home';
    } else if (spider.state === 'home') {
      const to = this.spotInWeb(spider.spot);
      spider.x = to.x;
      spider.y = to.y;
    }
    if (dt > 0) {
      const speed = Math.hypot(spider.x - lastX, spider.y - lastY) / this.height / dt;
      spider.speed += (speed - spider.speed) * Math.min(1, dt * 8);
    }
    // Legs patter while it moves, about once or twice a second, never quicker.
    spider.legs += dt * (spider.state === 'home' ? 1.5 : 3 + Math.min(4, spider.speed * 40)) * (this.reducedMotion ? 0.5 : 1);
  }

  /** Where in the web a spider sits once it's home, from the middle out, round and round. */
  spotInWeb(spot, web = this.web) {
    const angle = -Math.PI / 2 + spot * 2.4;
    const out = web.r * (0.32 + 0.12 * (spot % 3));
    return { x: web.x + Math.cos(angle) * out, y: web.y + Math.sin(angle) * out };
  }

  /** From the higher levels, a shy spider scuttles a little way off the first time a hand comes near. */
  noticeHand() {
    const glove = this.gloves[this.side];
    if (!glove.visible) return;
    for (const spider of this.spiders) {
      if (!spider.shy || spider.dashed || !this.catchable(spider) || this.holding === spider) continue;
      if (!this.isNear(spider, glove, this.catchReach * SHY_REACH)) continue;
      const away = { x: spider.x - glove.x, y: spider.y - glove.y };
      const length = Math.hypot(away.x, away.y) || 1;
      // In path terms, which are mirrored for the left hand.
      const to = {
        x: spider.shift.x + ((this.way * away.x) / length) * DASH.distance,
        y: spider.shift.y + (away.y / length) * DASH.distance,
      };
      // It stays in its part of the garden.
      to.x = clamp(spider.path.cx + to.x, -FURTHEST, FURTHEST) - spider.path.cx;
      to.y = clamp(spider.path.cy + to.y, -FURTHEST, FURTHEST) - spider.path.cy;
      spider.state = 'dashing';
      spider.dashed = true;
      spider.dash = { from: { ...spider.shift }, to, t: 0, seconds: DASH.seconds * (this.reducedMotion ? 1.5 : 1) };
      this.events.onDash?.();
    }
  }

  /**
   * How sure the hand in play is. Only a hand the tracker is sure of counts as open or closed, so a hand
   * at the edge, too far off or overlapping the other is neither, and does neither.
   */
  readHand(snapshot) {
    const hand = snapshot?.[this.side];
    if (!hand) return { open: false, closed: false };
    return {
      open: hand.status === 'open' && !snapshot.overlap,
      closed: hand.status === 'closed' && hand.reason === 'closed',
    };
  }

  handleHand(dt, snapshot) {
    const glove = this.gloves[this.side];
    const seen = glove.visible;
    const { open, closed } = this.readHand(snapshot);
    this.lastHand = { open, closed };
    const before = this.catching.held;
    const result = this.catching.update(dt, {
      seen,
      open,
      closed,
      near: seen ? this.spiderNear(glove) : null,
      onWeb: this.onWeb,
    });
    if (result === 'caught') {
      this.catching.held.state = 'held';
      this.events.onCatch?.();
    } else if (result === 'home') {
      this.bringHome(before);
    } else if (result === 'let-go') {
      before.state = 'returning';
      before.back = { x: before.x, y: before.y, t: 0 };
      this.events.onLetGo?.();
    }
    if (this.catching.held) {
      this.catching.held.x = glove.x;
      this.catching.held.y = glove.y - this.palmSize * 0.15;
    }
  }

  bringHome(spider) {
    spider.state = 'landing';
    spider.land = { x: spider.x, y: spider.y, t: 0 };
    spider.spot = this.homeHere;
    this.homeHere += 1;
    this.home[this.side] += 1;
    this.events.onHome?.(this.side);
    this.letOut();
  }

  /* ---------- drawing ---------- */

  /** A place in the garden, drawn once, for behind everything. */
  sceneFor(name) {
    const key = `${name}-${this.side}-${this.reach}`;
    if (this.scenes[key]) return this.scenes[key];
    const { width, height, ratio } = this;
    const look = LOOKS[name];
    const scene = document.createElement('canvas');
    scene.width = Math.round(width * ratio);
    scene.height = Math.round(height * ratio);
    const ctx = scene.getContext('2d');
    ctx.scale(ratio, ratio);
    const sky = ctx.createLinearGradient(0, 0, 0, height * 0.7);
    sky.addColorStop(0, look.sky[0]);
    sky.addColorStop(1, look.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    // A soft round sun, away from the camera's picture.
    ctx.fillStyle = 'rgb(255 236 150 / 0.9)';
    ctx.beginPath();
    ctx.arc(this.across(0.06), height * 0.09, height * 0.06, 0, Math.PI * 2);
    ctx.fill();
    const hills = (colour, base, size, waves, shift) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 10) {
        const u = (x / width) * Math.PI * 2;
        ctx.lineTo(x, height * base - height * size * (Math.sin(u * waves + shift) * 0.6 + Math.sin(u * waves * 2 + 1 + shift) * 0.4));
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
    };
    hills(look.far, 0.62, 0.05, 2, name.length);
    hills(look.near, 0.8, 0.03, 4, name.length * 2);
    this.paintPlace(ctx, name, look);
    // Flowers along the bottom, the same every time.
    const flowers = ['#ff8ab3', '#ffd23f', '#ffffff', '#b48cff', '#ff9a52'];
    for (let i = 0; i < 26; i += 1) {
      const x = ((i * 0.618 + 0.05) % 1) * width;
      const y = height * (0.86 + ((i * 0.37) % 1) * 0.12);
      ctx.strokeStyle = '#4f9f47';
      ctx.lineWidth = Math.max(2, height * 0.004);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + height * 0.03);
      ctx.stroke();
      ctx.fillStyle = flowers[i % flowers.length];
      for (let petal = 0; petal < 5; petal += 1) {
        const angle = (petal / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * height * 0.008, y + Math.sin(angle) * height * 0.008, height * 0.007, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffb703';
      ctx.beginPath();
      ctx.arc(x, y, height * 0.005, 0, Math.PI * 2);
      ctx.fill();
    }
    // The leafy branch the swinging spiders hang from, over where they play.
    const middle = this.gardenMiddle;
    const branchY = height * BRANCH_DOWN;
    ctx.strokeStyle = '#8a5a34';
    ctx.lineWidth = height * 0.018;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.side === 'right' ? width + 10 : -10, branchY - height * 0.04);
    ctx.quadraticCurveTo(middle.x, branchY + height * 0.015, middle.x - this.way * height * 0.42, branchY - height * 0.01);
    ctx.stroke();
    ctx.fillStyle = look.leaves;
    for (let i = 0; i < 9; i += 1) {
      const x = middle.x - this.way * height * (0.38 - i * 0.1);
      ctx.beginPath();
      ctx.ellipse(x, branchY - height * (0.025 + (i % 2) * 0.02), height * 0.04, height * 0.022, (i % 2 ? 0.5 : -0.5) * this.way, 0, Math.PI * 2);
      ctx.fill();
    }
    this.scenes[key] = scene;
    return scene;
  }

  /** What makes each place itself, drawn by Joze's side so it's never in the spiders' way. */
  paintPlace(ctx, name, look) {
    const { height } = this;
    const at = (share) => this.across(share);
    ctx.lineWidth = Math.max(2, height * 0.004);
    ctx.strokeStyle = INK;
    if (name === 'gate') {
      // A little white fence with a gate in it.
      for (let i = 0; i < 14; i += 1) {
        const x = at(0.02 + i * 0.075);
        ctx.fillStyle = i === 5 || i === 6 ? '#ffd9a0' : '#fffaf0';
        ctx.beginPath();
        ctx.roundRect(x, height * 0.6, height * 0.035, height * 0.16, [height * 0.017, height * 0.017, 0, 0]);
        ctx.fill();
      }
      ctx.fillStyle = '#fffaf0';
      ctx.fillRect(0, height * 0.64, this.width, height * 0.018);
      ctx.fillRect(0, height * 0.71, this.width, height * 0.018);
    } else if (name === 'carrots') {
      // Rows of carrot tops in brown earth.
      ctx.fillStyle = '#b07a4a';
      ctx.beginPath();
      ctx.ellipse(this.width / 2, height * 0.8, this.width * 0.55, height * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 18; i += 1) {
        const x = (i / 18) * this.width + height * 0.02;
        const y = height * (0.77 + (i % 2) * 0.05);
        ctx.fillStyle = '#ff8a2a';
        ctx.beginPath();
        ctx.moveTo(x - height * 0.014, y);
        ctx.lineTo(x + height * 0.014, y);
        ctx.lineTo(x, y + height * 0.035);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = look.leaves;
        for (const lean of [-0.5, 0, 0.5]) {
          ctx.beginPath();
          ctx.ellipse(x + lean * height * 0.02, y - height * 0.025, height * 0.007, height * 0.025, lean, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (name === 'honey') {
      // A big round tree with a beehive hanging from it.
      const x = at(0.1);
      ctx.fillStyle = '#8a5a34';
      ctx.fillRect(x - height * 0.03, height * 0.32, height * 0.06, height * 0.5);
      ctx.fillStyle = look.leaves;
      for (const [dx, dy, r] of [[0, 0.22, 0.17], [-0.12, 0.3, 0.12], [0.12, 0.3, 0.12]]) {
        ctx.beginPath();
        ctx.arc(x + dx * height, dy * height, r * height, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffc93c';
      ctx.beginPath();
      ctx.ellipse(x + this.way * height * 0.1, height * 0.42, height * 0.04, height * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (name === 'pond') {
      // A round pond with lily pads.
      ctx.fillStyle = '#6cc4ee';
      ctx.beginPath();
      ctx.ellipse(this.width / 2, height * 0.84, this.width * 0.36, height * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5aa84a';
      for (const share of [0.3, 0.45, 0.62]) {
        ctx.beginPath();
        ctx.ellipse(share * this.width, height * 0.84, height * 0.03, height * 0.014, 0, 0.3, Math.PI * 2);
        ctx.lineTo(share * this.width, height * 0.84);
        ctx.fill();
      }
    } else if (name === 'house') {
      // Joze's little house, with a round window.
      const x = at(0.06);
      ctx.fillStyle = '#ffe2b0';
      ctx.fillRect(x - height * 0.1, height * 0.42, height * 0.2, height * 0.24);
      ctx.fillStyle = '#e8605a';
      ctx.beginPath();
      ctx.moveTo(x - height * 0.13, height * 0.43);
      ctx.lineTo(x, height * 0.3);
      ctx.lineTo(x + height * 0.13, height * 0.43);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#8fd3ff';
      ctx.beginPath();
      ctx.arc(x, height * 0.51, height * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * The web: spokes, a spiral that gets fuller with each spider home, and dew that stays once it's
   * there. It gets a little whiter and fuller as it fills, slowly, never all at once.
   */
  drawWeb(ctx, web, fill, alpha) {
    const { height } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Where it hangs from: a twig above, and threads down to the plants.
    ctx.strokeStyle = 'rgb(255 255 255 / 0.85)';
    ctx.lineWidth = Math.max(1.5, height * 0.003);
    ctx.beginPath();
    ctx.moveTo(web.x, web.y - web.r);
    ctx.lineTo(web.x, height * 0.12);
    ctx.moveTo(web.x - web.r * 0.8, web.y + web.r * 0.6);
    ctx.lineTo(web.x - web.r * 1.3, height * 0.86);
    ctx.moveTo(web.x + web.r * 0.8, web.y + web.r * 0.6);
    ctx.lineTo(web.x + web.r * 1.3, height * 0.86);
    ctx.stroke();
    ctx.fillStyle = '#8a5a34';
    ctx.beginPath();
    ctx.roundRect(web.x - height * 0.06, height * 0.1, height * 0.12, height * 0.022, height * 0.011);
    ctx.fill();
    // A soft pale disc behind it, a little stronger as it fills, so it stands out from the garden.
    ctx.fillStyle = `rgb(255 255 255 / ${0.16 + 0.14 * fill})`;
    ctx.beginPath();
    ctx.arc(web.x, web.y, web.r * 1.08, 0, Math.PI * 2);
    ctx.fill();
    const spokes = 12;
    const thread = Math.max(1.5, height * (0.0028 + 0.0016 * fill));
    ctx.beginPath();
    for (let i = 0; i < spokes; i += 1) {
      const angle = (i / spokes) * Math.PI * 2;
      ctx.moveTo(web.x, web.y);
      ctx.lineTo(web.x + Math.cos(angle) * web.r, web.y + Math.sin(angle) * web.r);
    }
    // The spiral: a few rings to start with, and more as spiders come home.
    const rings = 3 + fill * 5;
    const steps = Math.ceil(rings * spokes);
    for (let step = 0; step <= steps; step += 1) {
      const turn = step / spokes;
      const out = web.r * (0.12 + (0.86 * turn) / Math.max(rings, 1));
      if (out > web.r * 0.98) break;
      const angle = (step / spokes) * Math.PI * 2;
      const x = web.x + Math.cos(angle) * out;
      const y = web.y + Math.sin(angle) * out;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // A soft blue-grey line under each thread, so the web shows against a pale sky.
    ctx.strokeStyle = 'rgb(96 128 160 / 0.45)';
    ctx.lineWidth = thread * 2.4;
    ctx.stroke();
    ctx.strokeStyle = `rgb(${Math.round(235 + 20 * fill)} ${Math.round(242 + 13 * fill)} 255 / 0.95)`;
    ctx.lineWidth = thread;
    ctx.stroke();
    // Dew, which only ever arrives, so nothing twinkles.
    const drops = Math.floor(fill * 14);
    ctx.fillStyle = 'rgb(255 255 255 / 0.95)';
    for (let i = 0; i < drops; i += 1) {
      const angle = (i * 2.399) % (Math.PI * 2);
      const out = web.r * (0.3 + ((i * 0.37) % 0.6));
      ctx.beginPath();
      ctx.arc(web.x + Math.cos(angle) * out, web.y + Math.sin(angle) * out, height * 0.005, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** A spider, its legs pattering if it's moving. held tucks its legs in, peeping out of the glove. */
  drawSpider(ctx, spider, { alpha = spider.alpha, held = false } = {}) {
    const size = this.spiderSize * (held ? 0.9 : 1);
    const { x, y } = spider;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (spider.kind === 'dangle' && (spider.state === 'playing' || spider.state === 'dashing')) {
      ctx.strokeStyle = 'rgb(255 255 255 / 0.9)';
      ctx.lineWidth = Math.max(1.5, this.height * 0.0028);
      ctx.beginPath();
      ctx.moveTo(x, this.height * BRANCH_DOWN);
      ctx.lineTo(x, y - size * 0.8);
      ctx.stroke();
    }
    const colour = COLOURS[spider.colour % COLOURS.length];
    ctx.strokeStyle = shade(colour, -0.35);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.2;
    const stretch = held ? 0.55 : 1;
    for (const way of [-1, 1]) {
      LEGS.forEach((angle, index) => {
        const patter = held ? 0 : Math.sin(spider.legs * 1.5 + index * 1.6 + (way > 0 ? Math.PI : 0)) * 0.18;
        const a = angle + patter;
        const kneeX = x + way * Math.cos(a) * size * 1.15 * stretch;
        const kneeY = y + Math.sin(a) * size * 0.9 * stretch;
        const footX = kneeX + way * size * 0.45 * stretch;
        const footY = kneeY + size * 0.35 * stretch;
        ctx.beginPath();
        ctx.moveTo(x + way * size * 0.5, y + Math.sin(a) * size * 0.4);
        ctx.quadraticCurveTo(kneeX, kneeY - size * 0.25, footX, footY);
        ctx.stroke();
      });
    }
    const body = this.bodies[spider.colour % this.bodies.length];
    const across = size * 2.4;
    ctx.drawImage(body, x - across / 2, y - across / 2, across, across);
    ctx.restore();
  }

  render() {
    const { back, ctx, width, height, ratio } = this;
    back.setTransform(1, 0, 0, 1, 0, 0);
    if (this.fromPlace && this.fade < 1) {
      back.globalAlpha = 1;
      back.drawImage(this.sceneFor(this.fromPlace), 0, 0);
      back.globalAlpha = this.fade;
    } else {
      back.globalAlpha = 1;
    }
    back.drawImage(this.sceneFor(this.place), 0, 0);
    back.globalAlpha = 1;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const { web } = this;
    if (this.oldWeb) {
      // The web just filled, fading out as the next place comes, with its spiders in it.
      const gone = 1 - this.fade;
      this.drawWeb(ctx, web, this.oldWeb.fill, gone);
      for (const spider of this.oldWeb.spiders) {
        const at = this.spotInWeb(spider.spot, web);
        this.drawSpider(ctx, { ...spider, ...at }, { alpha: gone });
      }
    }
    if (!this.oldWeb || this.fade > 0) this.drawWeb(ctx, web, this.fill, this.oldWeb ? this.fade : 1);
    const held = this.catching.held;
    for (const spider of this.spiders) {
      if (spider !== held) this.drawSpider(ctx, spider);
    }
    this.gloves.left.draw(ctx, this.palmSize);
    this.gloves.right.draw(ctx, this.palmSize);
    if (held) this.drawSpider(ctx, held, { held: true });
  }
}
