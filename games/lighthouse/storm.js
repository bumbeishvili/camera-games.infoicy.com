// The story of The Lighthouse Keeper. A storm has covered the lighthouse windows with mud, and ships
// out at sea can't see the light. Each window the child wipes clean with an open hand brings one of
// them home. There's no screen in this file, so it runs in the unit tests.
import { ramp, stepsAt } from '../../core/levels.js';

export const SHIPS = [
  { who: 'frost', boat: 'ice', ask: 'Frost here! I can’t see! Wipe the mud off the window!', thanks: 'Safe! Thank you!' },
  { who: 'kit', boat: 'fishing', ask: 'Kit here! I’m lost in the dark! Wipe it clean!', thanks: 'I’m home! You’re the best!' },
  { who: 'widget', boat: 'tin', ask: 'Widget here! Beep! Light my way!', thanks: 'Thank you! Boop!' },
  { who: 'bramble', boat: 'honey', ask: 'Bramble here! The waves are huge! One last window!', thanks: 'Honey for everyone!' },
];

export const CLEAN_ENOUGH = 0.88; // The last bits fall away by themselves after this.

// Where on the window the storm throws things, as shares of its width and height. Never the corners,
// which may be out of reach.
const MIDDLE = { left: 0.14, right: 0.86, top: 0.18, bottom: 0.82 };
const SPLAT = { rx: 0.1, ry: 0.15 }; // A splat's size at level 2, as a share of the window.
const LUMP = { rx: 0.075, ry: 0.11 };
const LAST_SPLAT_AT = 0.8; // Every splat has landed by the time this much is clean.

/**
 * What each level of the storm brings, from 1 to 10. Level 1 is the storm as it always was. Nothing
 * here has a time limit: nothing goes away by itself or can be missed, and it all comes from wiping,
 * so resting brings nothing new. The number of ships and the size of the window are the grown-ups'.
 */
export function stormAt(level) {
  return {
    // Mud the waves throw back onto glass that's been wiped, per window: from level 2, and two from 5.
    splats: stepsAt(level, { 1: 0, 2: 1, 5: 2 }),
    // How much of the window is clean when the first one lands: sooner each level.
    splatFrom: ramp(level, 0.6, 0.35),
    // How big a splat is: a little bigger each level.
    splatSize: ramp(level, 1, 1.3),
    // From level 4, seaweed slapped onto the glass, which takes a rub to come off. From level 7, every
    // other window has a starfish instead, which creeps about on the glass.
    lump: stepsAt(level, { 1: null, 4: 'weed', 7: 'mixed' }),
    // How much rubbing each needs, in lengths of a wipe: the hand moving over it, open.
    weedRub: ramp(level, 3, 3.5),
    starRub: ramp(level, 4, 5),
    // How quickly a starfish creeps, in window widths a second. Slower than any hand.
    creep: ramp(level, 0.02, 0.04),
    // A wilder sea outside, just to look at.
    swell: ramp(level, 1, 1.3),
  };
}

/** How much of a window has been wiped, in a grid, as a share of its width and height. */
export class Mud {
  constructor(columns = 14, rows = 9) {
    this.columns = columns;
    this.rows = rows;
    this.cells = new Uint8Array(columns * rows);
    this.wiped = 0;
  }

  /** Calls back with each cell inside an oval, as (index, x, y). */
  eachIn(x, y, sizeX, sizeY, visit) {
    const { columns, rows } = this;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const dx = ((column + 0.5) / columns - x) / sizeX;
        const dy = ((row + 0.5) / rows - y) / sizeY;
        if (dx * dx + dy * dy <= 1) visit(row * columns + column);
      }
    }
  }

  /** A wipe around a point, with its size given as a share of the window's width and height. */
  wipe(x, y, sizeX, sizeY) {
    let added = 0;
    this.eachIn(x, y, sizeX, sizeY, (index) => {
      if (!this.cells[index]) {
        this.cells[index] = 1;
        added += 1;
      }
    });
    this.wiped += added;
    return added;
  }

  /** Mud back on, as when a wave throws some. Returns how many cells it covered again. */
  unwipe(x, y, sizeX, sizeY) {
    let covered = 0;
    this.eachIn(x, y, sizeX, sizeY, (index) => {
      if (this.cells[index]) {
        this.cells[index] = 0;
        covered += 1;
      }
    });
    this.wiped -= covered;
    return covered;
  }

  /** The middle of each cell that's clean, as { x, y }. */
  cleanSpots() {
    const spots = [];
    for (let index = 0; index < this.cells.length; index += 1) {
      if (!this.cells[index]) continue;
      spots.push({ x: ((index % this.columns) + 0.5) / this.columns, y: (Math.floor(index / this.columns) + 0.5) / this.rows });
    }
    return spots;
  }

  get share() {
    return this.wiped / this.cells.length;
  }
}

export class Storm {
  /** ships says how many come in, and level is from 1 to 10. */
  constructor({ ships = SHIPS.length, level = 1, random = Math.random, onEvent = () => {} } = {}) {
    // Always the last one too, as that's where the story ends.
    this.ships = ships >= SHIPS.length ? SHIPS : [...SHIPS.slice(0, ships - 1), SHIPS.at(-1)];
    this.level = stormAt(level);
    this.random = random;
    this.onEvent = onEvent;
    this.index = -1;
    this.mud = null;
    this.home = 0;
    this.clean = false;
    this.coming = []; // What this window has still to come, as { at, what }, by how clean it is.
    this.lumps = []; // Seaweed and starfish on the glass now.
    this.lastWipe = null;
    this.stats = { splats: 0, lumps: 0 };
  }

  get ship() {
    return this.ships[this.index] ?? null;
  }

  get over() {
    return this.index >= this.ships.length;
  }

  /** How much of the storm has gone, from 0 to 1, as every ship comes home. */
  get calm() {
    return this.home / this.ships.length;
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  nextShip() {
    this.index += 1;
    if (this.over) {
      this.emit('all-home');
      return;
    }
    this.mud = new Mud();
    this.clean = false;
    this.lumps = [];
    this.lastWipe = null;
    this.coming = this.plan(this.index);
    this.emit('ship', { ship: this.ship, index: this.index, total: this.ships.length });
  }

  /** What the storm throws at this window, and when, by how much of it is clean. */
  plan(index) {
    const { splats, splatFrom, lump } = this.level;
    const coming = [];
    for (let i = 0; i < splats; i += 1) {
      coming.push({ at: splats === 1 ? splatFrom : splatFrom + ((LAST_SPLAT_AT - splatFrom) * i) / (splats - 1), what: 'splat' });
    }
    if (lump) {
      const kind = lump === 'mixed' && index % 2 === 1 ? 'star' : 'weed';
      // Halfway between the splats, or about halfway through if there's only the one.
      coming.push({ at: splats > 1 ? (coming[0].at + coming[1].at) / 2 : (splatFrom + LAST_SPLAT_AT) / 2 - 0.05, what: kind });
    }
    return coming.sort((a, b) => a.at - b.at);
  }

  /**
   * A wipe, as in Mud.wipe, with moved saying how far the hand went in it, in lengths of a wipe, which
   * is what rubs seaweed and starfish off. It returns how much mud it cleaned, and says when the
   * window is clean enough.
   */
  wipe(x, y, sizeX, sizeY, moved = 0) {
    if (!this.mud || this.clean) return 0;
    const added = this.mud.wipe(x, y, sizeX, sizeY);
    this.lastWipe = { x, y };
    if (moved > 0) this.rub(x, y, sizeX, sizeY, moved);
    while (this.coming.length && this.mud.share >= this.coming[0].at && this.mud.share < CLEAN_ENOUGH) {
      const { what } = this.coming.shift();
      if (what === 'splat') this.splat();
      else this.addLump(what);
    }
    this.checkClean();
    return added;
  }

  rub(x, y, sizeX, sizeY, moved) {
    for (const lump of this.lumps) {
      const dx = (lump.x - x) / (sizeX + lump.rx);
      const dy = (lump.y - y) / (sizeY + lump.ry);
      if (dx * dx + dy * dy > 1) continue;
      lump.rubbed += moved;
      if (lump.rubbed >= lump.needs) {
        this.lumps = this.lumps.filter((other) => other !== lump);
        this.stats.lumps += 1;
        this.emit('lump-off', { lump });
      }
    }
  }

  checkClean() {
    if (this.clean || !this.mud || this.mud.share < CLEAN_ENOUGH || this.lumps.length) return;
    this.clean = true;
    this.coming = [];
    this.emit('window-clean', { ship: this.ship });
  }

  /** Somewhere clean in the middle of the window, away from where the hand is wiping if it can be. */
  spotForSomething() {
    const inMiddle = this.mud.cleanSpots().filter(({ x, y }) => x >= MIDDLE.left && x <= MIDDLE.right && y >= MIDDLE.top && y <= MIDDLE.bottom);
    const from = this.lastWipe ?? { x: 0.5, y: 0.5 };
    const away = inMiddle.filter(({ x, y }) => Math.hypot(x - from.x, y - from.y) >= 0.3);
    const choices = away.length ? away : inMiddle;
    if (!choices.length) return { x: 0.5, y: 0.5 };
    return choices[Math.floor(this.random() * choices.length)];
  }

  splat() {
    const { x, y } = this.spotForSomething();
    const rx = SPLAT.rx * this.level.splatSize;
    const ry = SPLAT.ry * this.level.splatSize;
    const covered = this.mud.unwipe(x, y, rx, ry);
    this.stats.splats += 1;
    this.emit('splat', { x, y, rx, ry, covered });
  }

  addLump(kind) {
    const { x, y } = this.spotForSomething();
    const star = kind === 'star';
    const lump = {
      kind,
      x,
      y,
      rx: LUMP.rx,
      ry: LUMP.ry,
      needs: star ? this.level.starRub : this.level.weedRub,
      rubbed: 0,
      heading: this.random() * Math.PI * 2,
      speed: star ? this.level.creep : 0,
    };
    this.lumps.push(lump);
    this.emit('lump', { lump });
  }

  /** Starfish creep about in the middle of the window. still is for anyone who prefers less motion. */
  update(dt, { still = false } = {}) {
    if (still) return;
    for (const lump of this.lumps) {
      if (!lump.speed) continue;
      lump.heading += Math.sin(lump.x * 9 + lump.y * 7) * dt * 0.8;
      lump.x += Math.cos(lump.heading) * lump.speed * dt;
      lump.y += Math.sin(lump.heading) * lump.speed * dt * 1.6;
      // Turning back at the edge of the middle.
      if (lump.x < MIDDLE.left || lump.x > MIDDLE.right) lump.heading = Math.PI - lump.heading;
      if (lump.y < MIDDLE.top || lump.y > MIDDLE.bottom) lump.heading = -lump.heading;
      lump.x = Math.min(MIDDLE.right, Math.max(MIDDLE.left, lump.x));
      lump.y = Math.min(MIDDLE.bottom, Math.max(MIDDLE.top, lump.y));
    }
  }

  shipHome() {
    this.home += 1;
    this.emit('ship-home', { ship: this.ship, home: this.home });
  }
}
