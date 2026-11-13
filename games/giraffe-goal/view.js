// Giraffe's Goal, drawn in 2D, from inside the goal: its posts down each side and its bar along the top, the pitch
// going away to the far end with a stand full of people, the kickers at the penalty spot with Giraffe watching from
// the side, the balls coming, each with a ring where it will arrive, and the child's glove in front of it all.
//
// Nothing flashes: a ball grows as it comes, a ring closes slowly round where it will arrive, a save is a few small
// stars, and whatever comes and goes fades or slides.
import { INK } from '../../core/glove.js';
import { BALL, EXTRAS, LABELS, RUN_UP, SPOT } from './goal.js';

const LABEL_SECONDS = 2.4;
const PRIZE_FLY_SECONDS = 0.9;
// The pitch, seen from the goal line: how far down the screen the far horizon is, and how the ground comes towards
// the child from there. A place d yards out from the goal line is at HORIZON + DEPTH / (d + NEAR) down the screen,
// and X yards across from the middle is X * ACROSS / (d + NEAR) of the screen's width from its middle. The penalty
// spot, 12 yards out, is at SPOT, and the posts, 4 yards either side, are at the screen's edges.
const HORIZON = 0.45;
const NEAR = 5.14;
const DEPTH = 2.57;
const ACROSS = 0.5975;
// The goal's frame: its bar along the top, under the band with the tally, and its posts, in from each edge.
const BAR = { top: 0.172, bottom: 0.204 };
const POST = { from: 0.01, to: 0.034 };
// Giraffe, on the pitch by the post on the side away from the child's hand: how far in from the edge, where his feet
// are, and how tall his body is, as shares of the screen.
export const GIRAFFE = { x: 0.105, feet: 0.94, tall: 0.24 };
export const KICKER_TALL = 0.2; // A kicker's body at the penalty spot, in screen heights.
const RUN_FROM = 0.045; // How far back from the ball a kicker starts the run-up, down the screen.
const BEHIND_BALL = 0.014;
const MARKS = { star: '⭐', cup: '🏆' };
// Each kind of ball: its colour, its patches' colour, and how it's patterned.
const BALLS = {
  plain: { base: '#ffffff', patch: '#2b3440', style: 'football' },
  curl: { base: '#fff1dc', patch: '#f08a24', style: 'football' },
  heavy: { base: '#9a7658', patch: '#5b4332', style: 'bands' },
  double: { base: '#eaf4ff', patch: '#2f7fd8', style: 'football' },
  golden: { base: '#ffd23f', patch: '#d99a1f', style: 'football' },
  bounce: { base: '#ffe3f0', patch: '#e0569b', style: 'football' },
  bubbles: { base: 'rgb(150 215 255 / 0.8)', patch: 'rgb(255 255 255 / 0.5)', style: 'bubble' },
  trick: { base: '#efe6ff', patch: '#7a4ad8', style: 'football' },
};
const CROWD = ['#ff6b6b', '#ffd23f', '#4dabf7', '#69db7c', '#f783ac', '#ffffff', '#ffa94d', '#b197fc'];

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const ease = (share) => share * share * (3 - 2 * share);

/** A small picture from an emoji, drawn once. */
function makeMark(mark) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.font = '124px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mark, 80, 88);
  return canvas;
}

export class GoalView {
  /** language() says which language a new thing's label is in, and prizeTarget() where the stars' tally is. */
  constructor(canvas, { language = () => 'en', prizeTarget = () => ({ x: 80, y: 40 }) } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.language = language;
    this.prizeTarget = prizeTarget;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.base = null;
    this.effects = [];
    this.flying = [];
    this.labels = [];
    this.introduced = new Set();
    this.wanted = new Map();
    this.marks = Object.fromEntries(Object.entries(MARKS).map(([key, mark]) => [key, makeMark(mark)]));
    this.giraffe = null; // The pictures of Giraffe, and of the kickers by id, if they could be drawn.
    this.players = {};
    this.cheerUntil = 0;
    this.gladUntil = 0;
    this.partyUntil = 0;
    this.partyNext = 0;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.palmSize = Math.max(40, this.height * 0.085);
    this.base = null;
  }

  /** A new match: nothing left over from the last one. */
  reset() {
    this.effects = [];
    this.flying = [];
    this.labels = [];
    this.introduced = new Set();
    this.wanted = new Map();
    this.cheerUntil = 0;
    this.gladUntil = 0;
    this.partyUntil = 0;
  }

  /** Where a place in the goal is on the screen. */
  at(x, y) {
    return { x: x * this.width, y: y * this.height };
  }

  /** Where a place on the pitch is on the screen: across yards from the middle, and out yards from the goal line. */
  ground(across, out) {
    return { x: (0.5 + (across * ACROSS) / (out + NEAR)) * this.width, y: (HORIZON + DEPTH / (out + NEAR)) * this.height };
  }

  update(dt) {
    this.time += dt;
    for (const effect of this.effects) effect.life -= dt;
    this.effects = this.effects.filter((effect) => effect.life > 0);
    for (const flight of this.flying) flight.t += dt;
    this.flying = this.flying.filter((flight) => flight.t < PRIZE_FLY_SECONDS);
    for (const label of this.labels) label.life -= dt;
    this.labels = this.labels.filter((label) => label.life > 0 && label.target());
    this.nextLabel();
    // The party once the match is won: small stars here and there, one after another.
    if (this.time < this.partyUntil && this.time >= this.partyNext) {
      this.partyNext = this.time + 0.16;
      const turn = this.time * 7.3;
      this.sparkle(this.width * (0.5 + 0.36 * Math.sin(turn)), this.height * (0.42 + 0.2 * Math.cos(turn * 1.7)), ['#ffe066', '#ff9ec4', '#9ad8ff'][Math.floor(turn) % 3]);
    }
  }

  /** A few small stars, as something good happens. */
  sparkle(x, y, colour = '#ffe066') {
    if (this.effects.length < 40) this.effects.push({ kind: 'sparkle', x, y, life: 0.7, total: 0.7, colour });
  }

  /** A save: a ring of stars going out from the glove. */
  burst(x, y, colour = '#ffe066') {
    this.effects.push({ kind: 'burst', x, y, life: 0.8, total: 0.8, colour });
  }

  /** A bubble pops: a ring, going out and fading. */
  pop(x, y) {
    this.effects.push({ kind: 'pop', x, y, life: 0.4, total: 0.4, colour: '#bfe6ff' });
  }

  /** Stars fly up to the tally, from where they were in the goal: count of them, one after another. */
  prize(kind, x, y, count = 1) {
    if (!this.marks[kind]) return;
    const at = this.at(x, y);
    for (let n = 0; n < count; n += 1) this.flying.push({ kind, x: at.x + (n - (count - 1) / 2) * this.height * 0.05, y: at.y, t: -n * 0.12 });
  }

  /** Giraffe cheers for a while. */
  cheer(seconds = 1.2) {
    this.cheerUntil = Math.max(this.cheerUntil, this.time + seconds);
  }

  /** The kickers are pleased with themselves for a while. */
  glad(seconds = 1) {
    this.gladUntil = this.time + seconds;
  }

  /** The match is won: Giraffe cheers and stars go off, until the finish card. */
  party(seconds) {
    this.partyUntil = this.time + seconds;
    this.partyNext = this.time;
    this.cheer(seconds + 1);
  }

  /**
   * A new thing's label, the first time it comes along in a game. target() says where it is, in the goal, or null
   * once it has gone. They come one at a time, so each is read.
   */
  introduce(key, target) {
    if (this.introduced.has(key) || !LABELS[key] || this.wanted.has(key)) return;
    this.wanted.set(key, target);
  }

  nextLabel() {
    if (this.labels.length) return;
    for (const [key, target] of this.wanted) {
      this.wanted.delete(key);
      if (!target()) continue;
      this.introduced.add(key);
      const [en, ka] = LABELS[key];
      this.labels.push({ key, target, life: LABEL_SECONDS, text: this.language() === 'ka' ? ka : en });
      return;
    }
  }

  /* ---------- drawing ---------- */

  /**
   * The sky, the stand and the pitch only change with the window, and so does the goal's frame, so they're drawn
   * once: the pitch behind everyone on it, and the frame in front of them, as { back, front }.
   */
  baseFor() {
    if (this.base) return this.base;
    const layer = () => {
      const canvas = document.createElement('canvas');
      canvas.width = this.canvas.width;
      canvas.height = this.canvas.height;
      const context = canvas.getContext('2d');
      context.scale(this.ratio, this.ratio);
      return [canvas, context];
    };
    const [back, behind] = layer();
    const [front, ctx] = layer();
    this.drawPitch(behind);
    this.drawFrame(ctx);
    this.base = { back, front };
    return this.base;
  }

  /** The sky, the hills, the stand with its crowd, and the pitch with its lines, the same every time. */
  drawPitch(ctx) {
    const { width: w, height: h } = this;
    let seed = 11;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const sky = ctx.createLinearGradient(0, 0, 0, h * HORIZON);
    sky.addColorStop(0, '#8fd0ff');
    sky.addColorStop(1, '#e4f5ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // A few still clouds.
    ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
    for (const [x, y, size] of [[0.24, 0.215, 1], [0.6, 0.235, 0.8], [0.86, 0.26, 0.6]]) {
      for (const [dx, dy, r] of [[-0.05, 0.006, 0.026], [0, -0.008, 0.036], [0.05, 0.006, 0.026], [0.024, 0.012, 0.03], [-0.024, 0.012, 0.03]]) {
        ctx.beginPath();
        ctx.ellipse(w * x + h * dx * size, h * (y + dy * size), h * r * size * 1.5, h * r * size, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Hills, and trees either side of the stand.
    ctx.fillStyle = '#a9dc8a';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.4);
    for (let x = 0; x <= w; x += w / 24) ctx.lineTo(x, h * (0.345 + Math.sin((x / w) * 6.1 + 0.9) * 0.028));
    ctx.lineTo(w, h * 0.5);
    ctx.lineTo(0, h * 0.5);
    ctx.fill();
    for (const side of [0, 1]) {
      for (let n = 0; n < 5; n += 1) {
        const x = side ? w * (1 - 0.012 - n * 0.022) : w * (0.012 + n * 0.022);
        const top = h * (0.365 + random() * 0.03);
        ctx.fillStyle = n % 2 ? '#4f9e54' : '#5aae5c';
        ctx.beginPath();
        ctx.ellipse(x, top, h * 0.034, h * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // The stand: a long low terrace across the far end, under a roof, full of people.
    const [left, right, top, bottom] = [w * 0.085, w * 0.915, h * 0.3, h * 0.447];
    ctx.fillStyle = '#6f8499';
    ctx.beginPath();
    ctx.roundRect(left - w * 0.012, top - h * 0.024, right - left + w * 0.024, h * 0.03, 6);
    ctx.fill();
    ctx.fillStyle = '#d6e0ea';
    ctx.fillRect(left, top, right - left, bottom - top);
    const rows = 5;
    const step = h * 0.021;
    for (let row = 0; row < rows; row += 1) {
      const y = top + ((row + 0.85) * (bottom - top)) / (rows + 0.5);
      ctx.fillStyle = row % 2 ? '#c5d1dd' : '#cbd7e2';
      ctx.fillRect(left, y + h * 0.006, right - left, h * 0.006);
      for (let x = left + step * (0.6 + (row % 2) * 0.5); x < right - step * 0.4; x += step) {
        if (random() < 0.08) continue;
        const colour = CROWD[Math.floor(random() * CROWD.length)];
        const up = random() * h * 0.004;
        // A body in the team's colours, and a head.
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.ellipse(x, y + h * 0.004 - up, h * 0.0085, h * 0.008, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ['#f3cfa8', '#e0ac7e', '#b9814f', '#8d5a34'][Math.floor(random() * 4)];
        ctx.beginPath();
        ctx.arc(x, y - h * 0.0065 - up, h * 0.0052, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Boards along the far end of the pitch, in plain colours.
    const boards = 9;
    const far = this.ground(0, 110).y;
    for (let n = 0; n < boards; n += 1) {
      ctx.fillStyle = ['#ff6b6b', '#ffd23f', '#4dabf7', '#69db7c', '#ffffff'][n % 5];
      ctx.fillRect(left + (n * (right - left)) / boards, bottom, (right - left) / boards - 2, far - bottom + 1);
    }
    // The pitch, mown in stripes that get closer together as they go away.
    ctx.fillStyle = '#62b548';
    ctx.fillRect(0, far, w, h - far);
    ctx.fillStyle = '#6fc253';
    for (let out = 96; out >= 0; out -= 12) {
      const from = this.ground(0, out + 6).y;
      const to = this.ground(0, out).y;
      ctx.fillRect(0, from, w, to - from);
    }
    // Its lines: the far end, the edge of the penalty area with its arc, the six-yard line and the goal line.
    const line = (out, wide) => {
      const { y } = this.ground(0, out);
      ctx.fillStyle = 'rgb(255 255 255 / 0.9)';
      ctx.fillRect(0, y - wide / 2, w, wide);
    };
    line(110, Math.max(1, h * 0.002));
    line(18, Math.max(1.5, h * 0.004));
    line(6, Math.max(2, h * 0.006));
    line(0, Math.max(3, h * 0.012));
    ctx.strokeStyle = 'rgb(255 255 255 / 0.9)';
    ctx.lineWidth = Math.max(1.5, h * 0.0035);
    const [arcLeft, arcRight, arcTop] = [this.ground(-8, 18), this.ground(8, 18), this.ground(0, 22)];
    ctx.beginPath();
    ctx.moveTo(arcLeft.x, arcLeft.y);
    ctx.quadraticCurveTo(arcTop.x, arcTop.y * 2 - arcLeft.y, arcRight.x, arcRight.y);
    ctx.stroke();
    // The penalty spot.
    ctx.fillStyle = 'rgb(255 255 255 / 0.95)';
    ctx.beginPath();
    ctx.ellipse(w * SPOT.x, h * (SPOT.y + 0.012), h * 0.013, h * 0.0045, 0, 0, Math.PI * 2);
    ctx.fill();
    // The worn grass in the goal mouth.
    const worn = ctx.createLinearGradient(0, h * 0.95, 0, h);
    worn.addColorStop(0, 'rgb(70 140 52 / 0)');
    worn.addColorStop(1, 'rgb(70 140 52 / 0.55)');
    ctx.fillStyle = worn;
    ctx.fillRect(0, h * 0.95, w, h * 0.05);
  }

  /** The goal's frame, which the child looks out through: a post down each side and the bar along the top. */
  drawFrame(ctx) {
    const { width: w, height: h } = this;
    const bar = { top: h * BAR.top, tall: h * (BAR.bottom - BAR.top) };
    const post = { from: w * POST.from, wide: w * (POST.to - POST.from) };
    const round = (x, y, wide, tall, shade) => {
      const paint = shade === 'down' ? ctx.createLinearGradient(0, y, 0, y + tall) : ctx.createLinearGradient(x, 0, x + wide, 0);
      paint.addColorStop(0, '#ffffff');
      paint.addColorStop(0.55, '#f1f4f7');
      paint.addColorStop(1, '#c3ccd6');
      ctx.fillStyle = paint;
      ctx.fillRect(x, y, wide, tall);
      ctx.strokeStyle = '#8fa0b2';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, wide, tall);
    };
    // Each post's shadow on the grass, then the posts, then the bar across them.
    ctx.fillStyle = 'rgb(18 48 77 / 0.16)';
    ctx.fillRect(post.from + post.wide, h * 0.955, post.wide * 0.7, h * 0.045);
    ctx.fillRect(w - post.from - post.wide * 1.7, h * 0.955, post.wide * 0.7, h * 0.045);
    round(post.from, bar.top, post.wide, h - bar.top, 'across');
    round(w - post.from - post.wide, bar.top, post.wide, h - bar.top, 'across');
    round(post.from, bar.top, w - post.from * 2, bar.tall, 'down');
  }

  /**
   * Draws everything. model is { goal, glove, palm, big, side, waving }: the match as it is, the child's glove and
   * how big its palm is drawn, how much bigger than usual that is, from 0 to 1, which hand is in play, and whether
   * Giraffe waves.
   */
  render(model = {}) {
    const { ctx, width: w, height: h, ratio } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const { back, front } = this.baseFor();
    ctx.drawImage(back, 0, 0, w, h);
    const { goal, glove } = model;
    if (goal) for (const kicker of goal.kickers) this.drawKicker(kicker, goal);
    this.drawGiraffe(model);
    ctx.drawImage(front, 0, 0, w, h);
    if (goal) {
      for (const shot of goal.shots) this.drawRing(shot);
      for (const star of goal.stars) this.drawStarPrize(star);
      for (const bubble of goal.bubbles) this.drawBubble(bubble);
    }
    // A ball the glove has is behind it, as the child's own hand would be in front of it. One on its way is in front
    // of the glove, so it's never lost sight of.
    const held = (shot) => shot.state === 'saved' || shot.state === 'pushing';
    if (goal) for (const shot of goal.shots.filter(held)) this.drawShot(shot, goal);
    if (glove?.visible) this.drawGlove(glove, model.palm ?? this.palmSize, model.big ?? 0);
    if (goal) {
      for (const shot of goal.shots.filter((shot) => !held(shot))) this.drawShot(shot, goal);
      if (goal.cup) this.drawCup(goal.cup);
    }
    this.drawEffects();
    this.drawFlying();
    for (const label of this.labels) this.drawLabel(label);
  }

  /** Giraffe, on the pitch by the post on the side away from the child's hand, waving, cheering or watching. */
  drawGiraffe(model) {
    const art = this.giraffe;
    if (!art) return;
    const { ctx, width: w, height: h } = this;
    const onLeft = model.side !== 'left';
    let frame = art.frames.stand;
    if (this.time < this.cheerUntil) frame = art.frames.cheer;
    else if (model.waving && !this.reducedMotion) frame = Math.floor(this.time * 1.4) % 2 ? art.frames.wave : art.frames.stand;
    const scale = (h * GIRAFFE.tall) / art.tall;
    const x = w * (onLeft ? GIRAFFE.x : 1 - GIRAFFE.x);
    ctx.fillStyle = 'rgb(18 48 77 / 0.18)';
    ctx.beginPath();
    ctx.ellipse(x, h * GIRAFFE.feet, h * GIRAFFE.tall * 0.3, h * GIRAFFE.tall * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, h * GIRAFFE.feet);
    // His pictures turn towards the right of the screen, so on the right he's flipped, to turn to the goal.
    ctx.scale(onLeft ? scale : -scale, scale);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame, -art.foot.x, -art.foot.y);
    ctx.restore();
  }

  /** How far through a run-up a kicker is, from 0 to 1: the second of two starts theirs before their turn. */
  runOf(kicker, goal) {
    if (kicker.state === 'runup') return kicker.t;
    if (kicker.state === 'kicked') return 1;
    const later = goal.pending.find((each) => each.kicker === kicker);
    return later ? clamp(1 - later.left / RUN_UP, 0, 1) : 0;
  }

  /** A kicker at the penalty spot, with the ball there until it's kicked: standing, running up, or kicking. */
  drawKicker(kicker, goal) {
    const { ctx, width: w, height: h } = this;
    const run = this.runOf(kicker, goal);
    const feet = kicker.y - BEHIND_BALL - (1 - run) * RUN_FROM;
    const size = (feet - HORIZON) / (SPOT.y - HORIZON);
    const x = w * kicker.x;
    ctx.fillStyle = 'rgb(18 48 77 / 0.2)';
    ctx.beginPath();
    ctx.ellipse(x, h * feet, h * KICKER_TALL * 0.26 * size, h * KICKER_TALL * 0.05 * size, 0, 0, Math.PI * 2);
    ctx.fill();
    const art = this.players[kicker.who];
    if (art) {
      let name = 'stand';
      if (this.time < this.gladUntil) name = 'cheer';
      else if (kicker.state === 'kicked') name = kicker.t < 0.45 ? 'kick' : 'stand';
      else if (run > 0 && run < 1) name = Math.floor(run * 6) % 2 ? 'stepB' : 'stepA';
      const scale = ((h * KICKER_TALL) / art.tall) * size;
      ctx.save();
      ctx.translate(x, h * feet);
      ctx.scale(scale, scale);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(art.frames[name], -art.foot.x, -art.foot.y);
      ctx.restore();
    }
    // The ball waits on the spot until it's kicked.
    if (kicker.state !== 'kicked') this.drawBall(x, h * kicker.y, h * BALL.far, kicker.kind, 0);
  }

  /** The ring where a ball will arrive: wide at first, and closing as the ball comes. Green once the glove is there. */
  drawRing(shot) {
    if (shot.state !== 'flying' && shot.state !== 'pushing') return;
    const { ctx, height: h } = this;
    const { x, y } = this.at(shot.to.x, shot.to.y);
    const left = shot.state === 'pushing' ? 0 : 1 - clamp(shot.t, 0, 1);
    const r = h * shot.near * (1.08 + 1.5 * left);
    const colour = shot.covered ? '#3ddc84' : shot.kind === 'golden' ? '#ffd23f' : '#ffffff';
    ctx.save();
    ctx.fillStyle = shot.covered ? 'rgb(61 220 132 / 0.18)' : 'rgb(255 255 255 / 0.14)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    for (const [stroke, wide] of [[INK, h * 0.0125], [colour, h * 0.0075]]) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = wide + (shot.covered ? h * 0.003 : 0);
      ctx.globalAlpha = stroke === INK ? 0.55 : 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Where the ball will be, in the middle, and for a heavy ball how long it has been held back.
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, h * 0.006, 0, Math.PI * 2);
    ctx.fill();
    if (shot.state === 'pushing') {
      ctx.strokeStyle = '#3ddc84';
      ctx.lineWidth = h * 0.014;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y, r + h * 0.014, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(shot.pushed / EXTRAS.heavyHold, 0.02, 1));
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A ball on its way, at the line, in the glove for a moment once it's saved, or going in. */
  drawShot(shot, goal) {
    const { height: h } = this;
    if (shot.state === 'saved') {
      const share = clamp(shot.gone / 0.4, 0, 1);
      const { x, y } = this.at(shot.at.x, shot.at.y);
      this.drawBall(x, y, h * shot.near * (1 - 0.25 * share), shot.kind, 0, 1 - share * share);
      return;
    }
    const ball = goal.ballAt(shot);
    const { x, y } = this.at(ball.x, ball.y);
    if (shot.state === 'in') {
      // Past the glove and into the net behind: bigger, and fading.
      const share = clamp(shot.gone / 0.45, 0, 1);
      this.drawBall(x, y, h * ball.r * (1 + 0.6 * share), shot.kind, this.time * 5, 1 - share);
      return;
    }
    if (shot.kind === 'golden') this.drawGlow(x, y, h * ball.r * 2.1, 'rgb(255 220 90 / 0.5)');
    this.drawBall(x, y, h * ball.r, shot.kind, shot.state === 'pushing' ? 0 : this.time * 5);
  }

  /** A soft still glow round something special. */
  drawGlow(x, y, r, colour) {
    const { ctx } = this;
    const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    glow.addColorStop(0, colour);
    glow.addColorStop(1, colour.replace(/\/ [\d.]+\)/, '/ 0)'));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** One ball, r across its radius, turned so far, of a kind: see BALLS. */
  drawBall(x, y, r, kind, turn, alpha = 1) {
    const { ctx } = this;
    const look = BALLS[kind] ?? BALLS.plain;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = look.base;
    ctx.fill();
    if (r > 4) {
      ctx.save();
      ctx.clip();
      ctx.rotate(turn);
      ctx.fillStyle = look.patch;
      if (look.style === 'football') {
        const patch = (cx, cy, size, spin) => {
          ctx.beginPath();
          for (let i = 0; i < 5; i += 1) {
            const angle = spin + (i * Math.PI * 2) / 5;
            ctx.lineTo(cx + Math.cos(angle) * size, cy + Math.sin(angle) * size);
          }
          ctx.closePath();
          ctx.fill();
        };
        patch(0, 0, r * 0.36, -Math.PI / 2);
        for (let i = 0; i < 5; i += 1) {
          const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
          patch(Math.cos(angle) * r * 0.98, Math.sin(angle) * r * 0.98, r * 0.36, angle + Math.PI);
        }
      } else if (look.style === 'bands') {
        // A heavy leather ball, with a band round it each way.
        ctx.fillRect(-r, -r * 0.16, r * 2, r * 0.32);
        ctx.fillRect(-r * 0.16, -r, r * 0.32, r * 2);
      } else {
        // A bubble: little ones inside it.
        for (const [bx, by, br] of [[0.3, 0.2, 0.3], [-0.35, 0.3, 0.22], [-0.1, -0.4, 0.26], [0.45, -0.3, 0.16]]) {
          ctx.beginPath();
          ctx.arc(bx * r, by * r, br * r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      ctx.fillStyle = 'rgb(255 255 255 / 0.6)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.36, -r * 0.42, r * 0.24, r * 0.14, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** The child's glove, with a soft ring round it when the hand is spread wide, thumb and all, which makes it bigger. */
  drawGlove(glove, palm, big) {
    const { ctx } = this;
    if (big > 0.05) this.drawGlow(glove.x, glove.y, palm * 2.3, `rgb(255 255 255 / ${(0.42 * big).toFixed(3)})`);
    glove.draw(ctx, palm);
  }

  /** A star knocked out of a saved ball, waiting to be touched, and fading as its time runs out. */
  drawStarPrize(star) {
    const { height: h } = this;
    const { x, y } = this.at(star.x, star.y);
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 3 + star.id) * h * 0.006;
    this.drawGlow(x, y + bob, h * 0.075, 'rgb(255 230 120 / 0.45)');
    this.drawMark('star', x, y + bob, h * 0.085 * clamp(star.age / 0.3, 0.3, 1), clamp(star.left / 1.2, 0, 1));
  }

  /** A bubble, drifting, to pop. */
  drawBubble(bubble) {
    const { ctx, height: h } = this;
    const { x, y } = this.at(bubble.x, bubble.y);
    const r = h * 0.05 * clamp(bubble.age / 0.4, 0.3, 1);
    ctx.save();
    ctx.globalAlpha = clamp(bubble.left / 1.2, 0, 1);
    ctx.fillStyle = 'rgb(170 225 255 / 0.5)';
    ctx.strokeStyle = 'rgb(255 255 255 / 0.95)';
    ctx.lineWidth = Math.max(2, h * 0.005);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.36, y - r * 0.4, r * 0.24, r * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.drawMark('star', x, y, r * 1.1, clamp(bubble.left / 1.2, 0, 1) * 0.9);
  }

  /** The cup, floating down to be caught. */
  drawCup(cup) {
    const { height: h } = this;
    const { x, y } = this.at(cup.x, cup.y);
    const bob = cup.state === 'waiting' && !this.reducedMotion ? Math.sin(this.time * 2.4) * h * 0.008 : 0;
    const size = h * 0.2;
    this.drawGlow(x, y + bob, size * 0.85, 'rgb(255 226 110 / 0.5)');
    this.drawMark('cup', x, y + bob, size);
  }

  drawMark(kind, x, y, size, alpha = 1) {
    const image = this.marks[kind];
    if (!image) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
    ctx.restore();
  }

  drawEffects() {
    const { ctx, height: h } = this;
    for (const effect of this.effects) {
      const share = 1 - effect.life / effect.total;
      ctx.save();
      ctx.globalAlpha = clamp(effect.life / effect.total, 0, 1);
      ctx.fillStyle = effect.colour;
      if (effect.kind === 'pop') {
        ctx.strokeStyle = effect.colour;
        ctx.lineWidth = h * 0.006;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, h * (0.045 + share * 0.04), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const burst = effect.kind === 'burst';
        const count = burst ? 10 : 6;
        for (let i = 0; i < count; i += 1) {
          const angle = (i / count) * Math.PI * 2 + 0.4;
          const out = h * (burst ? 0.05 + share * 0.09 : 0.02 + share * 0.04);
          this.drawStar(effect.x + Math.cos(angle) * out, effect.y + Math.sin(angle) * out, h * (burst ? 0.012 : 0.008) * (1 - share * 0.5));
        }
      }
      ctx.restore();
    }
  }

  drawStar(x, y, r) {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const reach = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
    }
    ctx.closePath();
    ctx.fill();
  }

  /** Stars flying up to the tally, getting smaller. */
  drawFlying() {
    if (!this.flying.length) return;
    const to = this.prizeTarget();
    for (const flight of this.flying) {
      if (flight.t < 0) continue;
      const share = ease(Math.min(1, flight.t / PRIZE_FLY_SECONDS));
      const x = flight.x + (to.x - flight.x) * share;
      const y = flight.y + (to.y - flight.y) * share - Math.sin(share * Math.PI) * this.height * 0.06;
      this.drawMark(flight.kind, x, y, this.height * 0.07 * (1.2 - 0.6 * share));
    }
  }

  drawLabel(label) {
    const where = label.target();
    if (!where) return;
    const { ctx, palmSize, height: h } = this;
    const fade = clamp(Math.min((LABEL_SECONDS - label.life) / 0.3, label.life / 0.4), 0, 1);
    const { x, y } = this.at(where.x, where.y);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = `600 ${Math.round(Math.max(15, palmSize * 0.42))}px Fredoka, 'Noto Sans Georgian', sans-serif`;
    const wide = ctx.measureText(label.text).width + 26;
    const high = Math.max(30, palmSize * 0.78);
    const left = clamp(x - wide / 2, 8, this.width - wide - 8);
    const top = clamp(y - h * 0.11 - high, h * 0.2, h - high - 8);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffb703';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(left, top, wide, high, high / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.text, left + wide / 2, top + high / 2 + 1);
    ctx.restore();
  }
}
