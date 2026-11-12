// Giraffe's Maze, drawn in 2D: a garden maze of hedges seen from a little above, so each hedge has its top and the
// side facing the child, and the characters stand up in the paths between them. Things further down the screen are
// nearer, so they're drawn after the hedges behind them.
//
// Nothing flashes: what comes and goes fades or grows, a sparkle is a few small stars, and the next maze fades in,
// after the last one has faded down to the bare ground, rather than cutting to it.
import { INK } from '../../core/glove.js';
import { paintFruit } from '../../core/fruit.js';
import { LABELS } from './rules.js';
import { FOLLOW_SPACING } from './play.js';

const HEDGE = 0.26; // How thick a hedge is, in cells.
const HEIGHT = 0.36; // How tall a hedge stands, in cells on the screen.
const MARGIN = 14;
const CHARACTER = 0.98; // How tall a character's body is, in cells.
const FOLLOWER = 0.84; // Friends following along are a little smaller.
const STRIDE = 0.3; // Cells walked for each picture of a walk: about 8 pictures a second at a full walk.
const WALK_FRAMES = ['stepA', 'stand', 'stepB', 'stand'];
const LABEL_SECONDS = 2.4;
const FLAG_FOOT = 0.26; // The flag by the way out in a race stands this far down the last cell, by its top hedge.
const PRIZE_FLY_SECONDS = 0.8;
const MARKS = { gem: '💎', key: '🔑', shoes: '👟', magnet: '🧲', crown: '👑', bird: '🐦', butterfly: '🦋', heart: '💛', star: '⭐' };
const BUTTERFLY_COLOURS = [['#ff8ac2', '#ffd1e6'], ['#7cc7ff', '#d6efff'], ['#ffc94a', '#fff0b8'], ['#b98cff', '#e8dbff']];
const COLOURS = {
  grass: '#8fd17a',
  grassDark: '#7cc468',
  path: '#f3e1b5',
  pathEdge: '#e7cf98',
  hedgeTop: '#64c25c',
  hedgeTopDark: '#55b04f',
  hedgeSide: '#3f9447',
  hedgeSideDark: '#357f3d',
  hedgeLine: '#2c6e35',
  shadow: 'rgb(36 70 32 / 0.18)',
};

const ease = (share) => share * share * (3 - 2 * share);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** A small picture, such as a prize, drawn once from an emoji. */
function makeMark(mark) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '100px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mark, 64, 70);
  return canvas;
}

/** A little square of leaves, repeated over the hedges so they look leafy without anything moving. */
function makeLeaves(base, dark, light, seed = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 64);
  let state = seed;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  for (let i = 0; i < 46; i += 1) {
    const x = random() * 64;
    const y = random() * 64;
    const r = 3 + random() * 4;
    ctx.fillStyle = i % 3 === 0 ? light : dark;
    for (const [dx, dy] of [[0, 0], [64, 0], [-64, 0], [0, 64], [0, -64]]) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y + dy, r, r * 0.7, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return canvas;
}

export class MazeView {
  /** language() says which language a new thing's label is in, and prizeTarget() where the prize tally is on the screen. */
  constructor(canvas, { language = () => 'en', prizeTarget = () => ({ x: 80, y: 40 }), top = () => 120 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.language = language;
    this.prizeTarget = prizeTarget;
    this.topBand = top;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.layout = null;
    this.bases = new Map();
    this.effects = [];
    this.flying = [];
    this.labels = [];
    this.introduced = new Set();
    this.wanted = new Map();
    this.marks = Object.fromEntries(Object.entries(MARKS).map(([key, mark]) => [key, makeMark(mark)]));
    this.fruit = Object.fromEntries(['apple', 'orange', 'pear', 'banana', 'plum', 'peach'].map((kind) => [kind, paintFruit(kind)]));
    const ctx = this.ctx;
    this.patterns = {
      top: ctx.createPattern(makeLeaves(COLOURS.hedgeTop, COLOURS.hedgeTopDark, '#7dd572', 7), 'repeat'),
      side: ctx.createPattern(makeLeaves(COLOURS.hedgeSide, COLOURS.hedgeSideDark, '#4ea556', 13), 'repeat'),
    };
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /* ---------- where things are on the screen ---------- */

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.bases.clear();
    this.place();
  }

  /** Where the maze goes: as big as fits under the band at the top, in the middle. */
  place() {
    const cols = this.layout?.cols ?? 7;
    const rows = this.layout?.rows ?? 4;
    const band = this.topBand();
    const across = (this.width - MARGIN * 2) / (cols + HEDGE);
    const down = (this.height - band - MARGIN) / (rows + HEDGE + HEIGHT);
    const cell = Math.max(24, Math.min(across, down));
    this.cell = cell;
    this.left = (this.width - cols * cell) / 2;
    const room = this.height - band - MARGIN - (rows + HEDGE + HEIGHT) * cell;
    this.top = band + (HEIGHT + HEDGE / 2) * cell + Math.max(0, room) / 2;
    this.palmSize = Math.max(30, cell * 0.44);
    this.area = { left: this.left, top: this.top, width: cols * cell, height: rows * cell };
  }

  /** Where a place in the maze is on the screen, on the ground. */
  at(x, y, shift = 0) {
    return { x: this.left + shift + x * this.cell, y: this.top + y * this.cell };
  }

  /** Where a place on the screen is in the maze, in cells. */
  fromScreen(x, y) {
    return { x: (x - this.left) / this.cell, y: (y - this.top) / this.cell };
  }

  /** A new maze to show. */
  setLayout(layout) {
    const resized = !this.layout || layout.cols !== this.layout.cols || layout.rows !== this.layout.rows;
    this.layout = layout;
    if (resized) {
      this.bases.clear();
      this.place();
    }
  }

  /** A new game: nothing left over from the last one. */
  reset() {
    this.effects = [];
    this.flying = [];
    this.labels = [];
    this.introduced = new Set();
    this.wanted = new Map();
  }

  /* ---------- what happens ---------- */

  update(dt) {
    this.time += dt;
    for (const effect of this.effects) effect.life -= dt;
    this.effects = this.effects.filter((effect) => effect.life > 0);
    for (const flight of this.flying) flight.t += dt;
    this.flying = this.flying.filter((flight) => flight.t < PRIZE_FLY_SECONDS);
    for (const label of this.labels) label.life -= dt;
    this.labels = this.labels.filter((label) => label.life > 0);
    this.nextLabel();
  }

  /** A few small stars, where something was picked up. */
  sparkle(x, y, colour = '#ffe066') {
    this.effects.push({ kind: 'sparkle', x, y, life: 0.6, total: 0.6, colour });
  }

  /** A little puff, as a sheep hops away or a bush goes. */
  puff(x, y, colour = '#ffffff', leaves = false) {
    this.effects.push({ kind: leaves ? 'leaves' : 'puff', x, y, life: 0.8, total: 0.8, colour });
  }

  /** Hearts rising from a friend who has just been found. */
  hearts(x, y) {
    this.effects.push({ kind: 'hearts', x, y, life: 1.3, total: 1.3 });
  }

  /** A prize flies up to the tally, from where it was in the maze. */
  prize(kind, x, y) {
    if (!this.marks[kind]) return;
    const { x: sx, y: sy } = this.at(x, y);
    this.flying.push({ kind, x: sx, y: sy - this.cell * 0.3, t: 0 });
  }

  /**
   * A new thing's label, the first time it comes along in a game. target() is where it is in the maze, or null once
   * it's gone. They come one at a time, so each is read.
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
   * The grass round the maze and the paths in it, with the hedges' shadows on them, only change with the window and
   * the maze, so they're drawn once and reused. Nothing in them moves.
   */
  baseFor(layout) {
    const key = `${layout.seed}:${layout.index}:${layout.race ? 'race' : 'own'}:${layout.size}:${this.width}x${this.height}`;
    if (this.bases.has(key)) return this.bases.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = this.canvas.width;
    canvas.height = this.canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.scale(this.ratio, this.ratio);
    const { width: w, height: h, cell: s } = this;
    const { maze, start } = layout;
    const grass = ctx.createLinearGradient(0, 0, 0, h);
    grass.addColorStop(0, '#a6dc8c');
    grass.addColorStop(1, COLOURS.grass);
    ctx.fillStyle = grass;
    ctx.fillRect(0, 0, w, h);
    // Little tufts and flowers on the grass, the same every time for this maze.
    let state = 97 + layout.index * 31;
    const random = () => {
      state = (state * 16807) % 2147483647;
      return state / 2147483647;
    };
    const petals = [['#ffffff', '#ffd23f'], ['#ff9ec7', '#fff3a8'], ['#ffd23f', '#ff8f3f'], ['#b9a2ff', '#fff3a8']];
    for (let i = 0; i < 140; i += 1) {
      const x = random() * w;
      const y = random() * h;
      if (x > this.left - s * 0.3 && x < this.left + maze.cols * s + s * 0.3 && y > this.top - s * 0.7 && y < this.top + maze.rows * s + s * 0.3) continue;
      if (i % 3) {
        ctx.strokeStyle = COLOURS.grassDark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y - 7);
        ctx.moveTo(x, y);
        ctx.lineTo(x + 3, y - 8);
        ctx.stroke();
      } else {
        const [petal, middle] = petals[i % petals.length];
        const r = Math.max(3, s * 0.035);
        ctx.fillStyle = petal;
        for (let p = 0; p < 5; p += 1) {
          const angle = (p / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(x + Math.cos(angle) * r, y + Math.sin(angle) * r, r * 0.75, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = middle;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // The paths: sand, with a soft edge and a few pebbles.
    const { x: x0, y: y0 } = this.at(0, 0);
    ctx.fillStyle = COLOURS.pathEdge;
    ctx.fillRect(x0 - 2, y0 - 2, maze.cols * s + 4, maze.rows * s + 4);
    ctx.fillStyle = COLOURS.path;
    ctx.fillRect(x0 + 3, y0 + 3, maze.cols * s - 6, maze.rows * s - 6);
    // The way in, on the left, goes out onto the grass.
    const entrance = this.at(0, maze.row(start) + 0.5);
    ctx.fillStyle = COLOURS.path;
    ctx.fillRect(0, entrance.y - s * 0.36, x0 + 4, s * 0.72);
    ctx.fillStyle = COLOURS.pathEdge;
    ctx.fillRect(0, entrance.y - s * 0.36, x0 + 4, 3);
    ctx.fillRect(0, entrance.y + s * 0.36 - 3, x0 + 4, 3);
    // And the way out, on the right. In a race, it has a chequered line across it, to get over first.
    const exit = this.at(maze.cols, maze.row(layout.goal) + 0.5);
    ctx.fillStyle = COLOURS.path;
    ctx.fillRect(exit.x - 4, exit.y - s * 0.36, w - exit.x + 4, s * 0.72);
    ctx.fillStyle = COLOURS.pathEdge;
    ctx.fillRect(exit.x - 4, exit.y - s * 0.36, w - exit.x + 4, 3);
    ctx.fillRect(exit.x - 4, exit.y + s * 0.36 - 3, w - exit.x + 4, 3);
    if (layout.race) {
      const square = (s * 0.72) / 6;
      for (let c = 0; c < 2; c += 1) {
        for (let r = 0; r < 6; r += 1) {
          ctx.fillStyle = (c + r) % 2 ? INK : '#ffffff';
          ctx.fillRect(exit.x - square + c * square, exit.y - s * 0.36 + r * square, square, square);
        }
      }
    }
    ctx.fillStyle = 'rgb(180 150 100 / 0.35)';
    for (let i = 0; i < maze.count * 5; i += 1) {
      const x = x0 + random() * maze.cols * s;
      const y = y0 + random() * maze.rows * s;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.018 + random() * s * 0.012, s * 0.012, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // The hedges' shadows, a little down and to the right of each.
    ctx.fillStyle = COLOURS.shadow;
    for (const piece of this.hedges(layout)) {
      const { x, y } = this.at(piece.x0, piece.y0);
      ctx.fillRect(x + s * 0.06, y + s * 0.08, (piece.x1 - piece.x0) * s, (piece.y1 - piece.y0) * s);
    }
    this.bases.set(key, canvas);
    if (this.bases.size > 6) this.bases.delete(this.bases.keys().next().value);
    return canvas;
  }

  /**
   * Every piece of hedge in a maze, as where it stands on the ground in cells, { x0, y0, x1, y1, line, kind }: line
   * is the row line it's drawn with, as the hedges are drawn row by row, from the back to the front.
   */
  hedges(layout) {
    if (layout.pieces) return layout.pieces;
    const { maze, start, goal } = layout;
    const half = HEDGE / 2;
    const pieces = [];
    const exitRow = maze.row(goal);
    // Along each row line, between the cells above and below it, and round the top and bottom.
    for (let line = 0; line <= maze.rows; line += 1) {
      for (let c = 0; c < maze.cols; c += 1) {
        const wall = line === 0 || line === maze.rows || !maze.isOpen(maze.id(c, line - 1), 2);
        if (wall) pieces.push({ kind: 'across', x0: c - half, y0: line - half, x1: c + 1 + half, y1: line + half, line });
      }
    }
    // Down each column line, between the cells either side, and round the left and right, but for the ways in and out.
    for (let r = 0; r < maze.rows; r += 1) {
      for (let line = 0; line <= maze.cols; line += 1) {
        let wall;
        if (line === 0) wall = r !== maze.row(start);
        else if (line === maze.cols) wall = r !== exitRow;
        else wall = !maze.isOpen(maze.id(line - 1, r), 1);
        if (wall) pieces.push({ kind: 'down', x0: line - half, y0: r - half, x1: line + half, y1: r + 1 + half, line: r + 1 });
      }
    }
    layout.pieces = pieces;
    return pieces;
  }

  /**
   * Draws everything. model is what's happening now: { layout, next, slide, walkers, items, butterflies, bird,
   * gloves, lead, time }: see main.js.
   */
  render(model = {}) {
    const { ctx, width: w, height: h, ratio } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const layout = model.layout ?? this.layout;
    if (!layout) {
      ctx.fillStyle = COLOURS.grass;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const slide = model.slide;
    if (slide && slide.next) {
      // The maze just done fades down to the bare ground, and then the next one fades up, with everyone at its
      // way in. Each part of the picture changes at most twice, slowly. Sliding the mazes across instead swept
      // hedges and paths past every part of the screen several times a second, which is a flicker.
      const share = clamp(slide.share, 0, 1);
      ctx.drawImage(this.baseFor(slide.next), 0, 0, w, h);
      ctx.globalAlpha = share < 0.5 ? ease(1 - share * 2) : ease(share * 2 - 1);
      if (share < 0.5) this.drawMaze(layout, model, 0, { withPeople: false });
      else this.drawMaze(slide.next, model, 0, { withPeople: true });
      ctx.globalAlpha = 1;
    } else {
      this.drawMaze(layout, model, 0, { withPeople: true });
    }
    this.drawOverlays(model);
  }

  /** One maze, shifted across by shift pixels, with the people in it or not. */
  drawMaze(layout, model, shift, { withPeople }) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(shift, 0);
    ctx.drawImage(this.baseFor(layout), 0, 0, this.width, this.height);
    // What stands in the maze, by how far down the screen its feet are, drawn between the rows of hedges.
    const standing = [];
    const people = withPeople ? (model.walkers ?? []) : [];
    for (const item of layout.items) if (!item.gone || item.kind === 'chest') standing.push({ y: (item.pull?.y ?? item.y) + 0.12, draw: () => this.drawItem(item, layout) });
    for (const blocker of layout.blockers) standing.push({ y: blocker.y + 0.18, draw: () => this.drawBlocker(blocker) });
    for (const lost of layout.lost) {
      if (lost.found) continue;
      standing.push({ y: lost.y + 0.05, draw: () => this.drawLost(lost, model) });
    }
    if (layout.race) standing.push({ y: layout.maze.row(layout.goal) + FLAG_FOOT, draw: () => this.drawFlag(layout) });
    for (const walker of people) {
      if (walker.layoutIndex !== undefined && walker.layoutIndex !== layout.index) continue;
      standing.push({ y: walker.y + 0.06, draw: () => this.drawWalker(walker, CHARACTER) });
      (walker.followers ?? []).forEach((follower) => standing.push({ y: follower.y + 0.05, draw: () => this.drawWalker(follower, FOLLOWER) }));
    }
    standing.sort((a, b) => a.y - b.y);
    const pieces = this.hedges(layout);
    const rows = layout.rows;
    let next = 0;
    for (let line = 0; line <= rows; line += 1) {
      // Everything standing behind this row of hedges first.
      while (next < standing.length && standing[next].y < line + HEDGE / 2) standing[next++].draw();
      this.drawHedgeLine(pieces, line);
    }
    while (next < standing.length) standing[next++].draw();
    ctx.restore();
  }

  /** One row of hedges: their sides facing the child, then their tops, with a line where they meet. */
  drawHedgeLine(pieces, line) {
    const { ctx, cell: s } = this;
    const rise = HEIGHT * s;
    const mine = pieces.filter((piece) => piece.line === line);
    // A hedge across shows its whole length, and one going down only its end.
    ctx.fillStyle = this.patterns.side;
    for (const piece of mine) {
      const a = this.at(piece.x0, piece.y1);
      const b = this.at(piece.x1, piece.y1);
      ctx.fillRect(a.x, a.y - rise, b.x - a.x, rise);
    }
    ctx.fillStyle = this.patterns.top;
    for (const piece of mine) {
      const a = this.at(piece.x0, piece.y0);
      const b = this.at(piece.x1, piece.y1);
      ctx.fillRect(a.x, a.y - rise, b.x - a.x, b.y - a.y);
    }
    // A darker line along the bottom of each side, and along the top's front edge.
    ctx.fillStyle = COLOURS.hedgeLine;
    for (const piece of mine) {
      const a = this.at(piece.x0, piece.y1);
      const b = this.at(piece.x1, piece.y1);
      ctx.fillRect(a.x, a.y - 2, b.x - a.x, 2);
      ctx.globalAlpha = 0.45;
      ctx.fillRect(a.x, a.y - rise, b.x - a.x, Math.max(1.5, s * 0.012));
      ctx.globalAlpha = 1;
    }
  }

  drawShadow(x, y, size) {
    const { ctx } = this;
    ctx.fillStyle = 'rgb(40 60 30 / 0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** A character, from its pictures, or a plain round token if they couldn't be drawn. */
  drawWalker(walker, size) {
    const { ctx, cell: s } = this;
    const { x, y } = this.at(walker.x, walker.y);
    this.drawShadow(x, y, s * 0.22 * size);
    const art = walker.art;
    if (!art) {
      ctx.fillStyle = walker.colour ?? '#f5c451';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y - s * 0.32 * size, s * 0.24 * size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      return;
    }
    const facing = walker.facing ?? 2;
    const way = facing === 0 ? 'up' : facing === 2 ? 'down' : 'side';
    let frame;
    if (walker.cheer) frame = art.frames.cheer;
    else if (walker.wave) frame = this.reducedMotion || Math.floor(this.time * 1.4 + (walker.phase ?? 0)) % 2 ? art.frames.wave : art.frames.down.stand;
    else frame = art.frames[way][walker.moving ? WALK_FRAMES[Math.floor((walker.walked ?? 0) / STRIDE) % WALK_FRAMES.length] : 'stand'];
    const scale = (size * s) / art.tall;
    const flip = facing === 3 ? -1 : 1;
    const bob = walker.cheer && !this.reducedMotion ? Math.abs(Math.sin(this.time * 6)) * s * 0.06 : 0;
    ctx.save();
    ctx.translate(x, y - bob);
    ctx.globalAlpha = walker.alpha ?? 1;
    ctx.scale(flip * scale, scale);
    ctx.drawImage(frame, -art.foot.x, -art.foot.y);
    ctx.restore();
  }

  /** Where the flag stands in a race, in the last cell by the way out, in cells. */
  flagAt(layout) {
    return { x: layout.maze.cols - 0.2, y: layout.maze.row(layout.goal) + FLAG_FOOT };
  }

  /** In a race, a chequered flag by the way out, standing still. */
  drawFlag(layout) {
    const { ctx, cell: s } = this;
    const where = this.flagAt(layout);
    const foot = this.at(where.x, where.y);
    const top = foot.y - s * 0.86;
    this.drawShadow(foot.x, foot.y, s * 0.06);
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, s * 0.03);
    ctx.beginPath();
    ctx.moveTo(foot.x, foot.y);
    ctx.lineTo(foot.x, top);
    ctx.stroke();
    // The flag itself, to the left of its pole, over the maze rather than off the edge of the screen.
    const wide = s * 0.36;
    const high = s * 0.26;
    for (let c = 0; c < 4; c += 1) {
      for (let r = 0; r < 3; r += 1) {
        ctx.fillStyle = (c + r) % 2 ? INK : '#ffffff';
        ctx.fillRect(foot.x - wide + (c * wide) / 4, top + (r * high) / 3, wide / 4, high / 3);
      }
    }
    ctx.lineWidth = Math.max(1.5, s * 0.012);
    ctx.strokeRect(foot.x - wide, top, wide, high);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(foot.x, top, s * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** A lost friend, waving, with a soft ring round their feet and a little call over their head. */
  drawLost(lost, model) {
    const { ctx, cell: s } = this;
    const { x, y } = this.at(lost.x, lost.y);
    const swell = this.reducedMotion ? 0 : Math.sin(this.time * 2.2 + lost.k) * 0.06;
    ctx.strokeStyle = 'rgb(255 255 255 / 0.75)';
    ctx.lineWidth = Math.max(2, s * 0.025);
    ctx.beginPath();
    ctx.ellipse(x, y, s * (0.36 + swell), s * (0.36 + swell) * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    const art = model.art?.[lost.who] ?? null;
    this.drawWalker({ x: lost.x, y: lost.y, art, wave: true, facing: 2, phase: lost.k, colour: '#ff9ec7' }, CHARACTER);
    if (!art) return;
    // "!" in a little bubble, by the top of their head.
    const top = y - (art.head * CHARACTER * s) / art.tall;
    const bubble = { x: x + s * 0.3, y: Math.max(this.top - s * 0.4, top) };
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bubble.x, bubble.y, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8433f';
    ctx.font = `700 ${Math.round(s * 0.19)}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', bubble.x, bubble.y + 1);
  }

  drawItem(item) {
    const { ctx, cell: s } = this;
    const where = item.pull ?? item;
    const { x, y } = this.at(where.x, where.y);
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 2 + item.k) * s * 0.025;
    if (item.kind === 'chest') {
      this.drawShadow(x, y + s * 0.02, s * 0.24);
      this.drawChest(x, y, item.opened);
      return;
    }
    const size = item.kind === 'fruit' ? s * 0.36 : s * 0.38;
    this.drawShadow(x, y + s * 0.04, size * 0.42);
    const image = item.kind === 'fruit' ? this.fruit[item.fruit] ?? this.fruit.apple : this.marks[item.kind];
    if (!image) return;
    // A soft ring round the things that help, so they stand out from the fruit.
    if (item.kind !== 'fruit') {
      ctx.fillStyle = 'rgb(255 255 255 / 0.55)';
      ctx.beginPath();
      ctx.arc(x, y - size * 0.45 + bob, size * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.drawImage(image, x - size / 2, y - size * 0.95 + bob, size, size);
  }

  drawChest(x, y, opened) {
    const { ctx, cell: s } = this;
    const w = s * 0.46;
    const h = s * 0.3;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = Math.max(2, s * 0.02);
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#b8743a';
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h, w, h, s * 0.04);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-w / 2, -h * 0.55, w, h * 0.14);
    if (opened) {
      // The lid stands open, and it's empty.
      ctx.fillStyle = '#9a5f2c';
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h - s * 0.2, w, s * 0.2, s * 0.04);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = '#c98543';
      ctx.beginPath();
      ctx.roundRect(-w / 2 - 2, -h - s * 0.12, w + 4, s * 0.14, s * 0.05);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(0, -h * 0.5, s * 0.04, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /** What stands in the way: a gate, a sleeping sheep or a bush. Each goes gently once it's out of the way. */
  drawBlocker(blocker) {
    const { ctx, cell: s } = this;
    const { x, y } = this.at(blocker.x, blocker.y);
    const gone = blocker.open ? clamp((this.time - (blocker.shownOpenAt ??= this.time)) / 0.8, 0, 1) : 0;
    if (gone >= 1) return;
    ctx.save();
    ctx.translate(x, y + s * 0.14);
    ctx.globalAlpha = 1 - ease(gone);
    if (blocker.kind === 'gate') this.drawGate(gone);
    else if (blocker.kind === 'sheep') this.drawSheep(blocker, gone);
    else this.drawBush(blocker, gone);
    ctx.restore();
  }

  drawGate(gone) {
    const { ctx, cell: s } = this;
    const w = s * 0.74;
    const h = s * 0.62;
    // Swinging open is the gate getting narrower, from its hinge on the left.
    ctx.translate(-w / 2, 0);
    ctx.scale(1 - ease(gone) * 0.85, 1);
    ctx.lineWidth = Math.max(2, s * 0.02);
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#d99a52';
    for (let i = 0; i < 5; i += 1) {
      const px = (i + 0.5) * (w / 5);
      ctx.beginPath();
      ctx.moveTo(px - w * 0.07, 0);
      ctx.lineTo(px - w * 0.07, -h * 0.86);
      ctx.lineTo(px, -h);
      ctx.lineTo(px + w * 0.07, -h * 0.86);
      ctx.lineTo(px + w * 0.07, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#b8743a';
    for (const at of [0.25, 0.68]) {
      ctx.beginPath();
      ctx.rect(0, -h * at - s * 0.035, w, s * 0.07);
      ctx.fill();
      ctx.stroke();
    }
    // The padlock.
    if (gone < 0.2) {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.roundRect(w / 2 - s * 0.08, -h * 0.5 - s * 0.06, s * 0.16, s * 0.13, s * 0.03);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2, -h * 0.5 - s * 0.06, s * 0.05, Math.PI, 0);
      ctx.stroke();
    }
  }

  drawSheep(blocker, gone) {
    const { ctx, cell: s } = this;
    // Once it's awake, it hops up and away over the hedge.
    const hop = ease(gone);
    ctx.translate(hop * s * 0.5, -Math.sin(hop * Math.PI) * s * 0.5 - hop * s * 0.4);
    const breathe = this.reducedMotion || gone ? 0 : Math.sin(this.time * 1.6) * 0.03;
    const r = s * 0.22;
    ctx.lineWidth = Math.max(2, s * 0.018);
    ctx.strokeStyle = INK;
    // Legs, folded under while it sleeps.
    ctx.fillStyle = '#3d3a3a';
    for (const lx of [-0.5, 0.45]) ctx.fillRect(lx * r - r * 0.12, -r * (gone ? 0.5 : 0.3), r * 0.24, r * (gone ? 0.5 : 0.3));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (const [bx, by, br] of [[-0.55, -0.9, 0.55], [0, -1.15, 0.62], [0.55, -0.9, 0.55], [-0.25, -0.6, 0.55], [0.3, -0.6, 0.55]]) {
      ctx.moveTo(bx * r + br * r * (1 + breathe), by * r);
      ctx.arc(bx * r, by * r, br * r * (1 + breathe), 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    for (const [bx, by, br] of [[-0.55, -0.9, 0.55], [0, -1.15, 0.62], [0.55, -0.9, 0.55], [-0.25, -0.6, 0.55], [0.3, -0.6, 0.55]]) {
      ctx.moveTo(bx * r + br * r * (1 + breathe) - 2, by * r);
      ctx.arc(bx * r, by * r, br * r * (1 + breathe) - 2, 0, Math.PI * 2);
    }
    ctx.fill();
    // The face, its eyes shut while it sleeps.
    ctx.fillStyle = '#4a4444';
    ctx.beginPath();
    ctx.ellipse(r * 0.95, -r * 0.95, r * 0.42, r * 0.5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, s * 0.012);
    ctx.beginPath();
    if (blocker.open) {
      ctx.arc(r * 0.85, -r * 1.05, r * 0.07, 0, Math.PI * 2);
      ctx.moveTo(r * 1.15, -r * 1.05);
      ctx.arc(r * 1.1, -r * 1.05, r * 0.07, 0, Math.PI * 2);
    } else {
      ctx.arc(r * 0.85, -r * 1.05, r * 0.08, 0.1, Math.PI - 0.1);
      ctx.moveTo(r * 1.18, -r * 1.05);
      ctx.arc(r * 1.1, -r * 1.05, r * 0.08, 0.1, Math.PI - 0.1);
    }
    ctx.stroke();
    if (!blocker.open) {
      // Zs drifting up, slowly.
      ctx.fillStyle = 'rgb(18 48 77 / 0.7)';
      ctx.font = `700 ${Math.round(s * 0.14)}px Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      for (let i = 0; i < 2; i += 1) {
        const t = this.reducedMotion ? 0.3 + i * 0.4 : ((this.time * 0.45 + i * 0.5) % 1);
        ctx.globalAlpha = Math.sin(t * Math.PI) * 0.9;
        ctx.fillText('z', r * (1.3 + t * 0.6), -r * (1.6 + t * 1.4));
      }
      ctx.globalAlpha = 1;
      this.drawProgress(blocker.progress, -r * 0.2, -r * 0.85, r * 1.55);
    }
  }

  drawBush(blocker, gone) {
    const { ctx, cell: s } = this;
    const shrink = 1 - blocker.progress * 0.5 - ease(gone) * 0.5;
    const r = s * 0.3 * shrink;
    ctx.lineWidth = Math.max(2, s * 0.018);
    ctx.strokeStyle = '#2c6e35';
    ctx.fillStyle = '#4fae4e';
    ctx.beginPath();
    for (let i = 0; i < 9; i += 1) {
      const angle = Math.PI + (i / 8) * Math.PI;
      const bx = Math.cos(angle) * r * 0.85;
      const by = -r * 0.8 + Math.sin(angle) * r * 0.75;
      ctx.moveTo(bx + r * 0.38, by);
      ctx.arc(bx, by, r * 0.38, 0, Math.PI * 2);
    }
    ctx.moveTo(r * 0.9, -r * 0.5);
    ctx.arc(0, -r * 0.5, r * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8433f';
    for (const [bx, by] of [[-0.4, -0.9], [0.35, -1.1], [0.1, -0.5], [-0.15, -1.35]]) {
      ctx.beginPath();
      ctx.arc(bx * r, by * r, Math.max(2, r * 0.09), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** How far along a hand is with something, as a ring that fills. */
  drawProgress(share, x, y, r) {
    if (share <= 0.01) return;
    const { ctx, cell: s } = this;
    ctx.strokeStyle = 'rgb(255 255 255 / 0.9)';
    ctx.lineWidth = Math.max(3, s * 0.035);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share);
    ctx.stroke();
  }

  /** What goes over the maze: the bluebird and its trail, butterflies, the line to the hand, gloves and labels. */
  drawOverlays(model) {
    const { ctx, cell: s } = this;
    if (model.slide) return this.drawFlying();
    const bird = model.bird;
    if (bird) this.drawBirdTrail(bird);
    for (const walker of model.walkers ?? []) this.drawCarried(walker);
    for (const fly of model.butterflies ?? []) this.drawButterfly(fly);
    if (bird?.at) this.drawBird(bird.at);
    for (const blocker of model.layout?.blockers ?? []) {
      if (blocker.kind === 'bush' && !blocker.open && blocker.progress > 0) {
        const { x, y } = this.at(blocker.x, blocker.y);
        this.drawProgress(blocker.progress, x, y - s * 0.15, s * 0.38);
      }
    }
    if (model.lead) this.drawLead(model.lead);
    for (const glove of model.gloves ?? []) this.drawGlove(glove);
    this.drawEffects();
    this.drawFlying();
    for (const walker of model.walkers ?? []) if (walker.name) this.drawTag(walker.name, this.at(walker.x, walker.y - 1.05), walker.fade ?? 1);
    for (const label of this.labels) this.drawLabel(label);
    return null;
  }

  /** The key, held up over the character's head, and how long a power-up has left. */
  drawCarried(walker) {
    const { ctx, cell: s } = this;
    if (!walker.mine) return;
    const { x, y } = this.at(walker.x, walker.y);
    const head = y - s * 1.12;
    if (walker.hasKey) {
      const size = s * 0.3;
      ctx.drawImage(this.marks.key, x - size / 2, head - size, size, size);
    }
    if (walker.power) {
      const share = clamp(walker.power.left / walker.power.seconds, 0, 1);
      ctx.strokeStyle = 'rgb(255 255 255 / 0.9)';
      ctx.lineWidth = Math.max(3, s * 0.03);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.36, s * 0.15, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share);
      ctx.stroke();
      const size = s * 0.26;
      ctx.drawImage(this.marks[walker.power.kind], x + s * 0.2, head - size * 0.4, size, size);
    }
    if (walker.stuck) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x - s * 0.26, head + s * 0.05, s * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `700 ${Math.round(s * 0.18)}px Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', x - s * 0.26, head + s * 0.06);
    }
  }

  /** A dotted line from the character to the open hand it's following. */
  drawLead({ from, to }) {
    const { ctx, cell: s } = this;
    const a = this.at(from.x, from.y - 0.45);
    const b = to;
    const gap = Math.hypot(b.x - a.x, b.y - a.y);
    if (gap < s * 0.5) return;
    ctx.save();
    ctx.strokeStyle = 'rgb(255 255 255 / 0.8)';
    ctx.lineWidth = Math.max(3, s * 0.03);
    ctx.lineCap = 'round';
    ctx.setLineDash([1, Math.max(10, s * 0.12)]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x - ((b.x - a.x) / gap) * this.palmSize * 0.8, b.y - ((b.y - a.y) / gap) * this.palmSize * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  /** A glove: { glove, offset, look }, offset being where its own coordinates start on the screen. */
  drawGlove({ glove, offset = { x: 0, y: 0 }, look = null }) {
    if (!glove?.visible) return;
    const { ctx } = this;
    ctx.save();
    ctx.translate(offset.x, offset.y);
    glove.draw(ctx, look?.palm ?? this.palmSize, look);
    ctx.restore();
  }

  drawBirdTrail(bird) {
    const { ctx, cell: s } = this;
    const fade = clamp(bird.life / 2, 0, 1);
    const shown = Math.min(bird.cells.length, Math.floor(bird.flown) + 1);
    ctx.fillStyle = `rgb(255 255 255 / ${(0.85 * fade).toFixed(3)})`;
    ctx.strokeStyle = `rgb(42 120 214 / ${(0.8 * fade).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, s * 0.015);
    for (let i = 1; i < shown; i += 1) {
      const a = this.layout.maze.centre(bird.cells[i - 1]);
      const b = this.layout.maze.centre(bird.cells[i]);
      for (const share of [0.25, 0.75]) {
        const p = this.at(a.x + (b.x - a.x) * share, a.y + (b.y - a.y) * share);
        ctx.beginPath();
        ctx.arc(p.x, p.y, s * 0.045, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  drawBird(at) {
    const { ctx } = this;
    const { x, y } = this.at(at.x, at.y - 0.7);
    const size = this.cell * 0.13;
    const flap = Math.sin(this.time * (this.reducedMotion ? 5 : 9)) * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = Math.max(2, size * 0.12);
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#5fa8ff';
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.rotate(side * (0.4 + flap));
      ctx.beginPath();
      ctx.ellipse(side * size * 0.9, -size * 0.2, size * 0.75, size * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#dff0ff';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.4, size * 0.6, size * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb703';
    ctx.beginPath();
    ctx.moveTo(size * 0.85, -size * 0.1);
    ctx.lineTo(size * 1.35, size * 0.05);
    ctx.lineTo(size * 0.85, size * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(size * 0.4, -size * 0.25, size * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** A butterfly, its wings opening and closing gently. */
  drawButterfly(fly) {
    const { ctx, cell: s } = this;
    const { x, y } = this.at(fly.x, fly.y - 0.4);
    const [wing, inner] = BUTTERFLY_COLOURS[fly.hue % BUTTERFLY_COLOURS.length];
    const flap = this.reducedMotion ? 0.8 : 0.45 + Math.abs(Math.sin(this.time * 6 + fly.wobble)) * 0.55;
    const fade = fly.leaving ? clamp(1 - (fly.age - fly.leaving), 0, 1) : clamp(fly.age / 0.5, 0, 1);
    const size = s * 0.16;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(x, y);
    ctx.rotate(Math.cos(fly.heading) * 0.25);
    ctx.lineWidth = Math.max(1.5, size * 0.1);
    ctx.strokeStyle = INK;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side * flap, 1);
      ctx.fillStyle = wing;
      ctx.beginPath();
      ctx.ellipse(size * 0.6, -size * 0.35, size * 0.62, size * 0.5, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(size * 0.5, size * 0.38, size * 0.42, size * 0.34, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = inner;
      ctx.beginPath();
      ctx.arc(size * 0.62, -size * 0.38, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.12, size * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawEffects() {
    const { ctx, cell: s } = this;
    for (const effect of this.effects) {
      const share = 1 - effect.life / effect.total;
      const { x, y } = this.at(effect.x, effect.y);
      ctx.save();
      ctx.globalAlpha = clamp(effect.life / effect.total, 0, 1);
      if (effect.kind === 'sparkle') {
        ctx.fillStyle = effect.colour;
        for (let i = 0; i < 6; i += 1) {
          const angle = (i / 6) * Math.PI * 2 + 0.4;
          const out = s * (0.12 + share * 0.28);
          this.drawStar(x + Math.cos(angle) * out, y - s * 0.3 + Math.sin(angle) * out, s * 0.05 * (1 - share * 0.5));
        }
      } else if (effect.kind === 'puff' || effect.kind === 'leaves') {
        ctx.fillStyle = effect.kind === 'leaves' ? '#5cb85c' : effect.colour;
        for (let i = 0; i < 7; i += 1) {
          const angle = Math.PI + (i / 6) * Math.PI;
          const out = s * 0.35 * (0.3 + share);
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(angle) * out, y - s * 0.2 + Math.sin(angle) * out * 0.6, s * 0.06 * (1 - share * 0.5), s * 0.04, angle, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (effect.kind === 'hearts') {
        for (let i = 0; i < 3; i += 1) {
          const size = s * 0.2;
          const hx = x + (i - 1) * s * 0.28;
          const hy = y - s * (1.1 + share * 0.6 + i * 0.08);
          ctx.drawImage(this.marks.heart, hx - size / 2, hy - size / 2, size, size);
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

  /** Prizes flying up to the tally, getting smaller. */
  drawFlying() {
    if (!this.flying.length) return;
    const { ctx } = this;
    const to = this.prizeTarget();
    for (const flight of this.flying) {
      const share = ease(Math.min(1, flight.t / PRIZE_FLY_SECONDS));
      const x = flight.x + (to.x - flight.x) * share;
      const y = flight.y + (to.y - flight.y) * share - Math.sin(share * Math.PI) * this.height * 0.06;
      const size = this.cell * 0.22 * (1.2 - 0.6 * share);
      ctx.drawImage(this.marks[flight.kind], x - size, y - size, size * 2, size * 2);
    }
  }

  /** A friend's name over their character, fading with them as they walk out of the maze. */
  drawTag(text, at, alpha = 1) {
    const { ctx, palmSize } = this;
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${Math.round(Math.max(13, palmSize * 0.36))}px Fredoka, sans-serif`;
    const width = ctx.measureText(text).width + 18;
    const height = Math.max(22, palmSize * 0.56);
    ctx.fillStyle = 'rgb(255 255 255 / 0.92)';
    ctx.beginPath();
    ctx.roundRect(at.x - width / 2, at.y - height, width, height, height / 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, at.x, at.y - height / 2 + 1);
    ctx.restore();
  }

  drawLabel(label) {
    const where = label.target();
    if (!where) return;
    const { ctx, palmSize } = this;
    const fade = clamp(Math.min((LABEL_SECONDS - label.life) / 0.3, label.life / 0.4), 0, 1);
    const { x, y } = this.at(where.x, where.y);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = `600 ${Math.round(Math.max(15, palmSize * 0.42))}px Fredoka, 'Noto Sans Georgian', sans-serif`;
    const width = ctx.measureText(label.text).width + 26;
    const height = Math.max(30, palmSize * 0.78);
    const left = clamp(x - width / 2, 8, this.width - width - 8);
    const top = Math.max(this.topBand() + 4, y - this.cell * 1.25 - height);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffb703';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(left, top, width, height, height / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.text, left + width / 2, top + height / 2 + 1);
    ctx.restore();
  }
}

export { FOLLOW_SPACING };
