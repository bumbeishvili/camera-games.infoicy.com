// The story of The Lighthouse Keeper. A storm has covered the lighthouse windows with mud, and ships
// out at sea can't see the light. Each window the child wipes clean with an open hand brings one of
// them home. There's no screen in this file, so it runs in the unit tests.

export const SHIPS = [
  { who: 'frost', boat: 'ice', ask: 'Frost here! I can’t see! Wipe the mud off the window!', thanks: 'Safe! Thank you!' },
  { who: 'kit', boat: 'fishing', ask: 'Kit here! I’m lost in the dark! Wipe it clean!', thanks: 'I’m home! You’re the best!' },
  { who: 'widget', boat: 'tin', ask: 'Widget here! Beep! Light my way!', thanks: 'Thank you! Boop!' },
  { who: 'bramble', boat: 'honey', ask: 'Bramble here! The waves are huge! One last window!', thanks: 'Honey for everyone!' },
];

export const CLEAN_ENOUGH = 0.88; // The last bits fall away by themselves after this.

/** How much of a window has been wiped, in a grid, as a share of its width and height. */
export class Mud {
  constructor(columns = 14, rows = 9) {
    this.columns = columns;
    this.rows = rows;
    this.cells = new Uint8Array(columns * rows);
    this.wiped = 0;
  }

  /** A wipe around a point, with its size given as a share of the window's width and height. */
  wipe(x, y, sizeX, sizeY) {
    const { columns, rows, cells } = this;
    let added = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const dx = ((column + 0.5) / columns - x) / sizeX;
        const dy = ((row + 0.5) / rows - y) / sizeY;
        const index = row * columns + column;
        if (dx * dx + dy * dy <= 1 && !cells[index]) {
          cells[index] = 1;
          added += 1;
        }
      }
    }
    this.wiped += added;
    return added;
  }

  get share() {
    return this.wiped / this.cells.length;
  }
}

export class Storm {
  /** ships says how many come in. */
  constructor({ ships = SHIPS.length, onEvent = () => {} } = {}) {
    // Always the last one too, as that's where the story ends.
    this.ships = ships >= SHIPS.length ? SHIPS : [...SHIPS.slice(0, ships - 1), SHIPS.at(-1)];
    this.onEvent = onEvent;
    this.index = -1;
    this.mud = null;
    this.home = 0;
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
    this.emit('ship', { ship: this.ship, index: this.index, total: this.ships.length });
  }

  /** A wipe, as in Mud.wipe. It returns how much it cleaned, and says so when it's clean enough. */
  wipe(x, y, sizeX, sizeY) {
    if (!this.mud || this.mud.share >= CLEAN_ENOUGH) return 0;
    const added = this.mud.wipe(x, y, sizeX, sizeY);
    if (added && this.mud.share >= CLEAN_ENOUGH) this.emit('window-clean', { ship: this.ship });
    return added;
  }

  shipHome() {
    this.home += 1;
    this.emit('ship-home', { ship: this.ship, home: this.home });
  }
}
