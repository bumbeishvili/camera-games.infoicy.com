// Everything drawn flat over the town: the crosshair, the shield, health bars, warnings about goo, and
// goo that has hit the view. A state is never shown by colour alone, as each has its own shape too.
//
// Nothing flashes or strobes, as seizures are more common in children with hemiplegia. Whatever covers
// much of the screen is see-through and takes its time to come and go, so the picture's brightness
// stays steady, and firing is shown by shapes turning, never by anything lighting up.
import { INK } from '../../core/glove.js';

const COLOURS = { ready: '#35e07a', firing: '#ffb02e', empty: '#ff8f7e', shield: '#59c8ff', lost: '#c6d0db' };
const CORNER_SPLAT_SECONDS = 3.2;
const STAR_FADE_SECONDS = 0.2; // How long the star in the middle of the crosshair takes to come and go.
const SHIELD_SPLAT_SECONDS = 1.1;
const CHARGE_TRACK = 'rgb(18 48 77 / 0.5)';
const TAU = Math.PI * 2;
const HAZE_COLOUR = '222 241 251';
const HAZE_MOST = 0.72;
const HAZE_REACH = 0.42; // How far in from each side, as a share of the view's width.
const HAZE_TOP = 0.5;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Draws a blob of goo, the same each time for the same numbers. */
function gooBlob(ctx, x, y, size, seed, colour = '#8fe03a') {
  ctx.fillStyle = colour;
  ctx.strokeStyle = '#4c8f1c';
  ctx.lineWidth = Math.max(2, size * 0.06);
  ctx.beginPath();
  const lobes = 9;
  for (let i = 0; i <= lobes; i += 1) {
    const angle = (i / lobes) * TAU;
    const reach = size * (0.72 + 0.28 * Math.sin(seed * 7.1 + i * 2.4));
    const mx = x + Math.cos(angle) * reach;
    const my = y + Math.sin(angle) * reach;
    if (i === 0) ctx.moveTo(mx, my);
    else {
      const before = ((i - 0.5) / lobes) * TAU;
      ctx.quadraticCurveTo(x + Math.cos(before) * size * 1.08, y + Math.sin(before) * size * 1.08, mx, my);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // A shine, and a drip or two.
  ctx.fillStyle = 'rgb(255 255 255 / 0.5)';
  ctx.beginPath();
  ctx.ellipse(x - size * 0.28, y - size * 0.32, size * 0.2, size * 0.12, -0.5, 0, TAU);
  ctx.fill();
}

function starPath(ctx, x, y, outer, inner, points = 5, turn = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const reach = i % 2 ? inner : outer;
    const angle = turn + (i / (points * 2)) * TAU;
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
  }
  ctx.closePath();
}

/** A little closed hand, as a picture of what to do. */
function fistIcon(ctx, x, y, size) {
  ctx.fillStyle = '#ffc21a';
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, size * 0.09);
  ctx.beginPath();
  ctx.roundRect(x - size * 0.5, y - size * 0.32, size, size * 0.74, size * 0.24);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  for (const share of [-0.25, 0, 0.25]) {
    ctx.moveTo(x + size * share, y - size * 0.32);
    ctx.lineTo(x + size * share, y - size * 0.04);
  }
  ctx.moveTo(x - size * 0.5, y + size * 0.08);
  ctx.lineTo(x + size * 0.18, y + size * 0.08);
  ctx.stroke();
}

export class Sights {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.spin = 0;
    this.ring = 0;
    this.lastLook = 'ready';
    this.lockPop = 0;
    this.starShare = 0;
    this.corners = [];
    this.shieldSplats = [];
    this.bubbleSplats = [];
    this.nextCorner = 0;
    this.prizeLooks = new Map(); // Each kind of prize, drawn once and kept.
    this.resize();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
  }

  reset() {
    this.corners = [];
    this.shieldSplats = [];
    this.bubbleSplats = [];
    this.lockPop = 0;
  }

  /** Goo has landed on the shield bubble from a power-up, and slides off it. */
  hitBubble() {
    this.bubbleSplats.push({ dx: (Math.random() - 0.5) * 0.5, age: 0, seed: Math.random() * 9 });
    if (this.bubbleSplats.length > 3) this.bubbleSplats.shift();
  }

  /** Goo has hit the view: a small splat near a corner, well out of the way of the middle. */
  hitInCorner() {
    const spots = [[0.07, 0.56], [0.93, 0.5], [0.2, 0.17], [0.78, 0.74], [0.05, 0.36], [0.95, 0.68]];
    const [x, y] = spots[this.nextCorner % spots.length];
    this.nextCorner += 1;
    const small = { x, y, size: 0.055 + (this.nextCorner % 3) * 0.012, age: 0, seed: this.nextCorner };
    this.corners.push(small);
    if (this.corners.length > 4) this.corners.shift();
  }

  /** Goo has hit the shield, somewhere near the middle of it. */
  hitShield() {
    this.shieldSplats.push({ dx: (Math.random() - 0.5) * 0.3, dy: (Math.random() - 0.65) * 0.26, age: 0, seed: Math.random() * 9 });
    if (this.shieldSplats.length > 3) this.shieldSplats.shift();
  }

  update(dt) {
    this.time += dt;
    // Its marks turn while it's firing, slowly enough that they don't flicker as they pass.
    this.spin += dt * (this.reducedMotion ? 0 : this.look === 'firing' ? 0.8 : 0.25);
    this.lockPop = Math.max(0, this.lockPop - dt * 4);
    this.starShare = Math.min(1, Math.max(0, (this.starShare ?? 0) + ((this.look === 'firing' ? 1 : -1) * dt) / STAR_FADE_SECONDS));
    for (const splat of this.corners) splat.age += dt;
    this.corners = this.corners.filter(({ age }) => age < CORNER_SPLAT_SECONDS);
    for (const splat of this.shieldSplats) splat.age += dt;
    this.shieldSplats = this.shieldSplats.filter(({ age }) => age < SHIELD_SPLAT_SECONDS);
    for (const splat of this.bubbleSplats) splat.age += dt;
    this.bubbleSplats = this.bubbleSplats.filter(({ age }) => age < SHIELD_SPLAT_SECONDS);
  }

  /** state has what's needed to draw a frame, all in pixels: see Stage.drawSights. */
  draw(state) {
    const { ctx, width, height, ratio } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!state.playing) return;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const bar of state.bars) this.drawBar(bar);
    if (state.lock) this.drawLock(state.lock);
    if (state.haze > 0.004) this.drawHaze(state.haze);
    for (const warning of state.warnings) this.drawWarning(warning);
    if (state.guard > 0.001) this.drawGuard(state);
    if (state.shield > 0.001) this.drawShield(state);
    for (const splat of this.corners) this.drawCornerSplat(splat);
    if (state.crosshair?.seen) this.drawCrosshair(state.crosshair);
    for (const prize of state.prizes ?? []) this.drawPrize(prize);
    if (state.label) this.drawLabel(state.label);
  }

  /**
   * The shield bubble from a power-up: the thin rim of a soap bubble where the shield goes, with nothing
   * over the middle, so the picture's brightness hardly changes as it comes and goes. Goo that lands on
   * it slides off.
   */
  drawGuard({ guard: share, shieldX, shieldY, shieldR }) {
    const { ctx, height } = this;
    const r = shieldR * 1.08;
    const wobble = this.reducedMotion ? 0 : Math.sin(this.time * 1.7) * 0.015;
    ctx.save();
    ctx.globalAlpha = share;
    ctx.lineWidth = Math.max(5, height * 0.008);
    ctx.strokeStyle = 'rgb(110 190 235 / 0.7)';
    ctx.beginPath();
    ctx.ellipse(shieldX, shieldY, r * (1 + wobble), r * (1 - wobble), 0, 0, TAU);
    ctx.stroke();
    // Soap-bubble colours along the rim, and a shine.
    ctx.lineWidth = Math.max(3, height * 0.005);
    for (const [from, to, colour] of [[1.05, 1.35, 'rgb(255 190 230 / 0.6)'], [1.55, 1.8, 'rgb(255 236 150 / 0.6)'], [0.1, 0.45, 'rgb(170 240 190 / 0.6)']]) {
      ctx.strokeStyle = colour;
      ctx.beginPath();
      ctx.arc(shieldX, shieldY, r * 0.965, Math.PI * from, Math.PI * to);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgb(255 255 255 / 0.6)';
    ctx.beginPath();
    ctx.ellipse(shieldX - r * 0.5, shieldY - r * 0.55, r * 0.12, r * 0.06, -0.7, 0, TAU);
    ctx.fill();
    // Goo that lands on it leaves a small, faint splat that slides off: a big one in the middle of the
    // view flickered.
    for (const splat of this.bubbleSplats) {
      const left = 1 - splat.age / SHIELD_SPLAT_SECONDS;
      ctx.globalAlpha = share * 0.55 * Math.min(1, left * 2.5) * Math.min(1, splat.age / 0.15);
      gooBlob(ctx, shieldX + splat.dx * r, shieldY - r * 0.3 + splat.age * r * 0.3, r * 0.11, splat.seed);
    }
    ctx.restore();
  }

  /** A picture of a prize, drawn once for each kind and kept. */
  prizeLook(kind, mark) {
    const key = `${kind} ${mark ?? ''}`;
    if (this.prizeLooks.has(key)) return this.prizeLooks.get(key);
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.translate(size / 2, size / 2);
    ctx.lineJoin = 'round';
    // A soft edge rather than ink, as they come thick and fast.
    ctx.strokeStyle = '#4d5d78';
    ctx.lineWidth = 3;
    if (kind === 'bolt') {
      // A nut, silver-blue, with a hole in it.
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) ctx[i ? 'lineTo' : 'moveTo'](Math.cos((i / 6) * TAU) * 22, Math.sin((i / 6) * TAU) * 22);
      ctx.closePath();
      ctx.fillStyle = '#b4c3d3';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, TAU);
      ctx.fillStyle = '#6f8299';
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'gem') {
      ctx.beginPath();
      ctx.moveTo(-20, -7);
      ctx.lineTo(-10, -18);
      ctx.lineTo(10, -18);
      ctx.lineTo(20, -7);
      ctx.lineTo(0, 22);
      ctx.closePath();
      ctx.fillStyle = '#6fd3f0';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-20, -7);
      ctx.lineTo(20, -7);
      ctx.moveTo(-6, -7);
      ctx.lineTo(0, 22);
      ctx.lineTo(6, -7);
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (kind === 'star') {
      starPath(ctx, 0, 1, 25, 11);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      ctx.stroke();
    } else {
      // A power-up: a glass ball with its picture inside.
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, TAU);
      ctx.fillStyle = '#e6f6ff';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#3f8fe0';
      ctx.stroke();
      ctx.font = '30px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mark ?? '', 0, 2);
    }
    this.prizeLooks.set(key, canvas);
    return canvas;
  }

  /** Something picked up, on its way to the crosshair. Power-ups are bigger. */
  drawPrize({ x, y, kind, mark, alpha, size }) {
    if (alpha <= 0.01) return;
    const { ctx } = this;
    const look = this.prizeLook(kind, mark);
    const wide = size * (kind === 'power' ? 1.7 : 1.2);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(look, x - wide / 2, y - wide / 2, wide, wide);
    ctx.restore();
  }

  /** The name of something new, in a little white bubble with a point at the bottom. */
  drawLabel({ x, y, words, alpha }) {
    if (alpha <= 0.01) return;
    const { ctx } = this;
    const size = clamp(this.height * 0.03, 15, 26);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${size}px Fredoka, "Noto Sans Georgian", sans-serif`;
    const wide = ctx.measureText(words).width + size * 1.2;
    const high = size * 1.7;
    const top = clamp(y - high - size * 0.5, 4, this.height - high - size);
    // Kept on the screen, with its point still under the thing it names.
    const left = clamp(x - wide / 2, 6, this.width - wide - 6);
    const point = clamp(x, left + high / 2, left + wide - high / 2);
    ctx.beginPath();
    ctx.roundRect(left, top, wide, high, high / 2);
    ctx.moveTo(point - size * 0.4, top + high);
    ctx.lineTo(point, top + high + size * 0.5);
    ctx.lineTo(point + size * 0.4, top + high);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(words, left + wide / 2, top + high / 2 + 1);
    ctx.restore();
  }

  /**
   * A soft haze at the sides and top of the view while the tram is moving, where walls and windows go
   * by quickest. It takes the contrast out of them, so they don't flicker, and it's kinder on anyone
   * who feels queasy. It's the colour of the sky, and comes and goes slowly.
   */
  drawHaze(level) {
    const { ctx, width, height } = this;
    const reach = width * HAZE_REACH;
    const fade = (from, to, size) => {
      const gradient = ctx.createLinearGradient(...from, ...to);
      gradient.addColorStop(0, `rgb(${HAZE_COLOUR} / ${HAZE_MOST * level})`);
      gradient.addColorStop(0.55, `rgb(${HAZE_COLOUR} / ${HAZE_MOST * 0.55 * level})`);
      gradient.addColorStop(1, `rgb(${HAZE_COLOUR} / 0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(...size);
    };
    fade([0, 0], [reach, 0], [0, 0, reach, height]);
    fade([width, 0], [width - reach, 0], [width - reach, 0, reach, height]);
    fade([0, 0], [0, height * HAZE_TOP], [0, 0, width, height * HAZE_TOP]);
  }

  /** How much is left of a robot: chunky blocks over its head, one for each hit it can take. */
  drawBar({ x, y, width, share, blocks }) {
    const { ctx } = this;
    const height = Math.max(9, width * 0.16);
    const left = x - width / 2;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(left - 3, y - 3, width + 6, height + 6, height * 0.55);
    ctx.fill();
    const count = Math.max(1, blocks);
    const gap = 2;
    const each = (width - gap * (count - 1)) / count;
    const filled = share * count;
    for (let i = 0; i < count; i += 1) {
      const amount = clamp(filled - i, 0, 1);
      ctx.fillStyle = 'rgb(255 255 255 / 0.22)';
      ctx.fillRect(left + i * (each + gap), y, each, height);
      if (amount > 0) {
        ctx.fillStyle = share > 0.5 ? '#6be35a' : share > 0.25 ? '#ffd23f' : '#ff9a4d';
        ctx.fillRect(left + i * (each + gap), y, each * amount, height);
      }
    }
  }

  /** Above the cage: a padlock and how many robots are left to clear before it opens. */
  drawLock({ x, y, left, size }) {
    const { ctx } = this;
    const shackle = size * 0.3;
    ctx.strokeStyle = INK;
    ctx.lineWidth = size * 0.2;
    ctx.beginPath();
    ctx.arc(x, y - size * 0.15, shackle, Math.PI, 0);
    ctx.stroke();
    ctx.strokeStyle = '#c9d3dd';
    ctx.lineWidth = size * 0.1;
    ctx.beginPath();
    ctx.arc(x, y - size * 0.15, shackle, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#ffc83d';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, size * 0.08);
    ctx.beginPath();
    ctx.roundRect(x - size * 0.5, y - size * 0.18, size, size * 0.72, size * 0.14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x, y + size * 0.1, size * 0.1, 0, TAU);
    ctx.fill();
    ctx.fillRect(x - size * 0.04, y + size * 0.1, size * 0.08, size * 0.2);
    // A dot for each robot still in the way.
    const dot = size * 0.19;
    const across = Math.min(left, 6);
    const rows = Math.ceil(left / 6);
    for (let i = 0; i < left; i += 1) {
      const row = Math.floor(i / 6);
      const inRow = row === rows - 1 && left % 6 ? left % 6 : across;
      const dx = (i % 6) - (inRow - 1) / 2;
      ctx.fillStyle = '#ff7e6b';
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.5, size * 0.05);
      ctx.beginPath();
      ctx.arc(x + dx * dot * 2.5, y - size * 0.72 - row * dot * 2.5, dot, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  /** Goo on its way: a ring that closes in as it comes, with a shield in it. */
  drawWarning({ x, y, radius, close, shielded }) {
    const { ctx } = this;
    if (close < 0.25) return;
    const share = clamp((close - 0.25) / 0.75, 0, 1);
    const ring = radius + 24 + (1 - share) * radius;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(x, y, ring, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = shielded ? COLOURS.shield : '#c6f24e';
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 10]);
    ctx.lineDashOffset = this.reducedMotion ? 0 : -this.time * 12;
    ctx.beginPath();
    ctx.arc(x, y, ring, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * The shield: a big round pane of blue glass with a thick rim and a gold star. It's see-through,
   * and comes up from the bottom of the view.
   */
  drawShield({ shield, shieldX, shieldY, shieldR }) {
    const { ctx, height } = this;
    const up = shield * shield * (3 - 2 * shield);
    const y = shieldY + (1 - up) * height * 0.8;
    const r = shieldR;
    ctx.save();
    ctx.globalAlpha = Math.min(1, up * 1.6);
    const glass = ctx.createRadialGradient(shieldX - r * 0.3, y - r * 0.4, r * 0.1, shieldX, y, r);
    glass.addColorStop(0, 'rgb(190 236 255 / 0.3)');
    glass.addColorStop(0.75, 'rgb(90 180 240 / 0.2)');
    glass.addColorStop(1, 'rgb(50 130 220 / 0.32)');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.arc(shieldX, y, r, 0, TAU);
    ctx.fill();
    // Panes in the glass.
    ctx.strokeStyle = 'rgb(255 255 255 / 0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * TAU + 0.26;
      ctx.moveTo(shieldX + Math.cos(angle) * r * 0.3, y + Math.sin(angle) * r * 0.3);
      ctx.lineTo(shieldX + Math.cos(angle) * r * 0.96, y + Math.sin(angle) * r * 0.96);
    }
    ctx.stroke();
    // The rim.
    ctx.strokeStyle = INK;
    ctx.lineWidth = r * 0.085;
    ctx.beginPath();
    ctx.arc(shieldX, y, r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#3f8fe0';
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    ctx.arc(shieldX, y, r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#a8e0ff';
    ctx.lineWidth = r * 0.016;
    ctx.beginPath();
    ctx.arc(shieldX, y, r * 0.985, Math.PI * 1.05, Math.PI * 1.6);
    ctx.stroke();
    // Rivets.
    ctx.fillStyle = '#ffd23f';
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * TAU;
      ctx.beginPath();
      ctx.arc(shieldX + Math.cos(angle) * r, y + Math.sin(angle) * r, r * 0.018, 0, TAU);
      ctx.fill();
    }
    // A gold star in the middle.
    starPath(ctx, shieldX, y, r * 0.2, r * 0.09);
    ctx.fillStyle = 'rgb(255 210 63 / 0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgb(18 48 77 / 0.8)';
    ctx.lineWidth = r * 0.018;
    ctx.stroke();
    for (const splat of this.shieldSplats) {
      const left = 1 - splat.age / SHIELD_SPLAT_SECONDS;
      ctx.globalAlpha = Math.min(1, left * 2.5) * Math.min(1, up * 1.6);
      gooBlob(ctx, shieldX + splat.dx * r * 2, y + (splat.dy + splat.age * 0.16) * r * 2, r * 0.24, splat.seed);
    }
    ctx.restore();
  }

  drawCornerSplat({ x, y, size, age, seed }) {
    const { ctx, width, height } = this;
    const left = CORNER_SPLAT_SECONDS - age;
    ctx.save();
    ctx.globalAlpha = clamp(left / 0.8, 0, 1) * clamp(age / 0.08, 0, 1);
    const big = size * height * (0.86 + Math.min(1, age / 0.14) * 0.14);
    gooBlob(ctx, x * width, y * height + age * height * 0.012, big, seed);
    ctx.restore();
  }

  /** The crosshair. Its look says what the hand is doing, and its ring how full the blaster is. */
  drawCrosshair({ x, y, look, charge, radius, target, glove, palmSize }) {
    const { ctx } = this;
    if (look !== this.lastLook) {
      if (look === 'firing') this.lockPop = 1;
      this.lastLook = look;
    }
    this.look = look;
    const r = target ? Math.max(radius * 0.78, target * 1.18) : radius;
    this.ring += (r - this.ring) * 0.25;
    const R = (this.ring || r) * (1 + this.lockPop * 0.07);
    const colour = COLOURS[look];
    ctx.save();
    ctx.translate(x, y);

    if (look === 'lost') {
      // The hand can be seen, but not well enough to trust: it neither fires nor raises the shield.
      ctx.strokeStyle = INK;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.8, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = colour;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.8, 0, TAU);
      ctx.stroke();
      ctx.font = `700 ${R * 0.9}px Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ctx.strokeText('?', 0, R * 0.04);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('?', 0, R * 0.04);
      ctx.restore();
      return;
    }

    // The ring that shows how full the blaster is, round the outside.
    const fuel = R + 11;
    ctx.strokeStyle = CHARGE_TRACK;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(0, 0, fuel, 0, TAU);
    ctx.stroke();
    if (charge > 0.005) {
      ctx.strokeStyle = charge > 0.3 ? '#7fe7ff' : '#ff9a4d';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, fuel, -Math.PI / 2, -Math.PI / 2 + charge * TAU);
      ctx.stroke();
    }

    // The crosshair itself.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.stroke();

    if (look === 'shield') {
      // A little shield in the middle, as the crosshair is a shield for now.
      this.smallShield(0, 0, R * 0.56);
    } else if (look === 'empty') {
      fistIcon(ctx, 0, 0, R * 0.92);
    } else {
      // Four marks pointing in, which spin round quickly while it's firing.
      ctx.save();
      ctx.rotate(this.spin);
      for (let i = 0; i < 4; i += 1) {
        ctx.rotate(Math.PI / 2);
        const [inner, outer] = look === 'firing' ? [R * 0.42, R * 1.02] : [R * 0.5, R * 0.98];
        ctx.strokeStyle = INK;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(0, -inner);
        ctx.lineTo(0, -outer);
        ctx.stroke();
        ctx.strokeStyle = look === 'firing' ? '#fff3c4' : '#ffffff';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(0, -inner);
        ctx.lineTo(0, -outer);
        ctx.stroke();
      }
      ctx.restore();
      // The star in the middle while firing, and a dot while not, each fading into the other.
      const star = this.starShare;
      if (star < 0.99) {
        ctx.globalAlpha = 1 - star;
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, TAU);
        ctx.fill();
      }
      if (star > 0.01) {
        ctx.globalAlpha = star;
        starPath(ctx, 0, 0, R * 0.26, R * 0.11, 5, this.spin);
        ctx.fillStyle = '#fff3c4';
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // A little copy of the hand beneath it, so the crosshair is plainly the hand.
    if (glove?.visible) {
      ctx.save();
      ctx.translate(x - glove.x, y + R + palmSize * 2.2 - glove.y);
      glove.draw(ctx, palmSize);
      ctx.restore();
    }
  }

  smallShield(x, y, size) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.85, y - size * 0.62);
    ctx.quadraticCurveTo(x + size * 0.84, y + size * 0.5, x, y + size);
    ctx.quadraticCurveTo(x - size * 0.84, y + size * 0.5, x - size * 0.85, y - size * 0.62);
    ctx.closePath();
    ctx.fillStyle = COLOURS.shield;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke();
    starPath(ctx, x, y - size * 0.05, size * 0.42, size * 0.18);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
  }
}
