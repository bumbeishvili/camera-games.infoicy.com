// The lamp room of the lighthouse: a big window with mud on it, and the sea outside. An open hand
// wipes the mud off, and when it's clean the light goes out across the water to bring a ship home.
// The window is on the side of the hand being played with.
//
// Nothing flashes, as seizures are more common in children with hemiplegia. The beam comes on slowly
// and stays steady, there's no lightning, and the picture brightens gradually as the storm clears.
import { Glove, INK, mixColours } from '../../core/glove.js';

const PALM_SHARE = 0.105;
const WIPE_SIZE = 0.15; // The size of a wipe, as a share of the screen's height.
const SIZES = { none: [0.05, 0.95], little: [0.2, 0.95], lots: [0.38, 0.95] }; // Across the screen, for the right hand.
const TOP = 0.13;
const BOTTOM = 0.88;
const SAIL_SECONDS = 2.4;
const BEAM_SECONDS = 0.8;
const BOAT_COLOURS = { ice: '#d7f2ff', fishing: '#ff9a5c', tin: '#a9b6c4', honey: '#ffcf4a' };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export class LampRoom {
  /** events: onWiped(amount), onSailed() */
  constructor(canvas, events = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.events = events;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    this.side = 'right';
    this.reach = 'none';
    this.aspect = 16 / 9;
    this.time = 0;
    this.calm = 0;
    this.shownCalm = 0;
    this.mud = null;
    this.mudLeft = 0;
    this.boat = null;
    this.sailing = 0;
    this.beam = 0;
    this.wipeSpeed = 0;
    this.last = null;
    this.drops = [];
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  configure({ side = this.side, reach = this.reach }) {
    this.side = side;
    this.reach = reach;
    this.placeWindow();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.palmSize = Math.max(44, this.height * PALM_SHARE);
    this.placeWindow();
  }

  placeWindow() {
    const [from, to] = SIZES[this.reach];
    const [left, right] = this.side === 'right' ? [from, to] : [1 - to, 1 - from];
    this.window = {
      x: left * this.width,
      y: TOP * this.height,
      width: (right - left) * this.width,
      height: (BOTTOM - TOP) * this.height,
    };
  }

  /** Fresh mud on the window, from the storm. */
  muddy() {
    const { window: glass, ratio } = this;
    const mud = document.createElement('canvas');
    mud.width = Math.round(glass.width * ratio);
    mud.height = Math.round(glass.height * ratio);
    const ctx = mud.getContext('2d');
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(0, 0, mud.width, mud.height);
    for (let i = 0; i < 170; i += 1) {
      ctx.fillStyle = ['#7c5733', '#5e3f24', '#876139', '#553820'][i % 4];
      ctx.beginPath();
      ctx.arc(Math.random() * mud.width, Math.random() * mud.height, 10 + Math.random() * mud.height * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    this.mud = mud;
    this.mudLeft = 1;
    this.last = null;
  }

  /** The last of the mud slides away. */
  clearMud() {
    this.mudFading = true;
  }

  /** A boat, out at sea and lost. */
  setBoat(kind) {
    this.boat = { kind, share: 0 };
    this.beam = 0;
    this.sailing = 0;
  }

  /** The beam comes on and the boat sails in. */
  sailHome() {
    this.sailing = SAIL_SECONDS;
  }

  update(dt, snapshot, { aspect = this.aspect, wiping = false, showHands = false, wipe = () => 0 } = {}) {
    this.time += dt;
    this.aspect = aspect;
    for (const side of ['left', 'right']) {
      const glove = this.gloves[side];
      if (showHands && snapshot?.side === side) glove.follow(snapshot[side], dt, this);
      else glove.hide();
    }
    this.shownCalm += (this.calm - this.shownCalm) * (1 - Math.exp(-dt * 0.8));

    const glove = this.gloves[this.side];
    let wipedNow = 0;
    if (wiping && this.mud && glove.visible && glove.status === 'open') wipedNow = this.wipeAt(glove, wipe);
    else this.last = null;
    this.wipeSpeed += (Math.min(1, wipedNow > 0 ? 1 : glove.speed * 1.5) * (glove.visible && glove.status === 'open' ? 1 : 0) - this.wipeSpeed) * (1 - Math.exp(-dt * 10));

    for (const drop of this.drops) {
      drop.life -= dt;
      drop.y += drop.vy * dt;
    }
    this.drops = this.drops.filter(({ life }) => life > 0);

    if (this.mudFading) {
      this.mudLeft = Math.max(0, this.mudLeft - dt * 1.2);
      if (this.mudLeft === 0) {
        this.mudFading = false;
        this.mud = null;
      }
    }
    if (this.sailing > 0) {
      this.sailing = Math.max(0, this.sailing - dt);
      this.beam = Math.min(1, this.beam + dt / BEAM_SECONDS);
      if (this.boat) this.boat.share = 1 - this.sailing / SAIL_SECONDS;
      if (this.sailing === 0) this.events.onSailed?.();
    } else if (this.beam > 0 && !this.boat) {
      this.beam = Math.max(0, this.beam - dt);
    }
  }

  /** Takes mud off along the way the hand has gone, and tells the rules how much of the window. */
  wipeAt(glove, wipe) {
    const { window: glass, ratio, height } = this;
    const x = glove.x - glass.x;
    const y = glove.y - glass.y;
    const inside = x > -height * 0.1 && x < glass.width + height * 0.1 && y > -height * 0.1 && y < glass.height + height * 0.1;
    if (!inside) {
      this.last = null;
      return 0;
    }
    const size = WIPE_SIZE * height;
    const ctx = this.mud.getContext('2d');
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineWidth = size * 2 * ratio;
    ctx.beginPath();
    const from = this.last ?? { x, y };
    ctx.moveTo(from.x * ratio, from.y * ratio);
    ctx.lineTo(x * ratio + 0.01, y * ratio);
    ctx.stroke();
    ctx.restore();

    // Along the way too, as a quick hand can go a long way between pictures.
    let added = 0;
    const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / (size * 0.5)));
    for (let i = 1; i <= steps; i += 1) {
      const px = from.x + ((x - from.x) * i) / steps;
      const py = from.y + ((y - from.y) * i) / steps;
      added += wipe(px / glass.width, py / glass.height, size / glass.width, size / glass.height);
    }
    this.last = { x, y };
    if (added) this.addDrips(glove);
    return added;
  }

  addDrips(glove) {
    if (this.drops.length > 30 || this.reducedMotion) return;
    this.drops.push({ x: glove.x + (Math.random() - 0.5) * this.palmSize, y: glove.y, vy: this.height * 0.2, life: 0.7, size: this.height * (0.004 + Math.random() * 0.006) });
  }

  drawSea(ctx) {
    const { window: glass, height, time } = this;
    const calm = this.shownCalm;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(glass.x, glass.y, glass.width, glass.height, 22);
    ctx.clip();
    const sky = ctx.createLinearGradient(0, glass.y, 0, glass.y + glass.height);
    sky.addColorStop(0, mixColours('#27384f', '#8fd2fa', calm));
    sky.addColorStop(0.62, mixColours('#3c536b', '#ffe1b0', calm));
    ctx.fillStyle = sky;
    ctx.fillRect(glass.x, glass.y, glass.width, glass.height);

    const seaTop = glass.y + glass.height * 0.62;
    const wave = (colour, base, size, rate, length) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(glass.x, glass.y + glass.height);
      const swell = this.reducedMotion ? 0.4 : 1;
      for (let x = 0; x <= glass.width; x += 14) {
        const height2 = Math.sin(x / length + time * rate) * size * swell * (1 - calm * 0.65);
        ctx.lineTo(glass.x + x, base + height2);
      }
      ctx.lineTo(glass.x + glass.width, glass.y + glass.height);
      ctx.closePath();
      ctx.fill();
    };
    wave(mixColours('#23435f', '#3d9ad9', calm), seaTop, height * 0.016, 0.9, 110);
    this.drawBoat(ctx, seaTop);
    wave(mixColours('#1b3650', '#2b86c7', calm), seaTop + height * 0.08, height * 0.02, 1.2, 80);
    wave(mixColours('#142a40', '#2373ad', calm), seaTop + height * 0.17, height * 0.024, 1.5, 60);
    ctx.restore();
  }

  drawBoat(ctx, seaTop) {
    if (!this.boat) return;
    const { window: glass, height, time, boat, side } = this;
    // It comes in towards the hand's side of the window, and gets bigger as it does.
    const share = boat.share * boat.share * (3 - 2 * boat.share);
    const near = 0.34 + share * 0.86;
    const direction = side === 'right' ? 1 : -1;
    const start = side === 'right' ? 0.22 : 0.78;
    const x = glass.x + glass.width * (start + direction * share * 0.5);
    const y = seaTop + Math.sin(time * 1.3) * height * 0.012 * (this.reducedMotion ? 0.3 : 1);
    const size = height * 0.13 * near;
    ctx.save();
    ctx.translate(x, y);
    if (!this.reducedMotion) ctx.rotate(Math.sin(time * 1.1) * 0.05);
    ctx.fillStyle = BOAT_COLOURS[boat.kind];
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, height * 0.004);
    ctx.beginPath();
    ctx.moveTo(-size, -size * 0.1);
    ctx.lineTo(size, -size * 0.1);
    ctx.lineTo(size * 0.72, size * 0.34);
    ctx.lineTo(-size * 0.72, size * 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.1);
    ctx.lineTo(0, -size);
    ctx.stroke();
    ctx.fillStyle = '#fff4e0';
    ctx.beginPath();
    ctx.moveTo(size * 0.05, -size * 0.92);
    ctx.lineTo(size * 0.62, -size * 0.2);
    ctx.lineTo(size * 0.05, -size * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Its little lantern, for finding it in the dark.
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(-size * 0.5, -size * 0.28, size * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawBeam(ctx) {
    if (this.beam <= 0) return;
    const { window: glass, height, side } = this;
    const fromX = side === 'right' ? glass.x : glass.x + glass.width;
    const fromY = glass.y + height * 0.08;
    const way = side === 'right' ? 1 : -1;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(glass.x, glass.y, glass.width, glass.height, 22);
    ctx.clip();
    const gradient = ctx.createLinearGradient(fromX, 0, fromX + way * glass.width, 0);
    gradient.addColorStop(0, `rgb(255 233 150 / ${0.75 * this.beam})`);
    gradient.addColorStop(1, 'rgb(255 233 150 / 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(fromX + way * glass.width * 1.1, glass.y + glass.height * 0.46);
    ctx.lineTo(fromX + way * glass.width * 1.1, glass.y + glass.height * 0.86);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  render() {
    const { ctx, width, height, ratio, window: glass } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    // The room around the window, warm against the night outside.
    ctx.fillStyle = '#4a3a33';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#5a463d';
    for (let y = 0; y < height; y += height * 0.09) ctx.fillRect(0, y, width, height * 0.004);

    this.drawSea(ctx);
    this.drawBeam(ctx);

    if (this.mud) {
      ctx.globalAlpha = this.mudLeft;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(glass.x, glass.y, glass.width, glass.height, 22);
      ctx.clip();
      ctx.drawImage(this.mud, glass.x, glass.y, glass.width, glass.height);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = '#e7dcc4';
    ctx.lineWidth = height * 0.018;
    ctx.beginPath();
    ctx.roundRect(glass.x, glass.y, glass.width, glass.height, 22);
    ctx.stroke();
    ctx.lineWidth = height * 0.006;
    ctx.strokeStyle = 'rgb(231 220 196 / 0.8)';
    ctx.beginPath();
    ctx.moveTo(glass.x + glass.width / 2, glass.y);
    ctx.lineTo(glass.x + glass.width / 2, glass.y + glass.height);
    ctx.moveTo(glass.x, glass.y + glass.height / 2);
    ctx.lineTo(glass.x + glass.width, glass.y + glass.height / 2);
    ctx.stroke();

    ctx.fillStyle = '#4f3620';
    for (const drop of this.drops) {
      ctx.globalAlpha = clamp(drop.life / 0.3, 0, 1);
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    this.gloves.left.draw(ctx, this.palmSize);
    this.gloves.right.draw(ctx, this.palmSize);
  }
}
