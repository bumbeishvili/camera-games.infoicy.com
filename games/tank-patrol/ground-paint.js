// Paints the floor of the valley onto one big picture, once, when the game loads: grass, flowers, fields,
// roads, the river's banks and the shadow of everything that stands on it. The camera never moves and
// nothing here ever does, so all of it can be baked in and costs nothing at all to draw.
import { BALES, BRIDGES, BUILDINGS, FAR_HOUSES, FIELDS, FORT_AT, MEADOW, ORCHARD, PLAY, POND, RIVER, RIVER_WIDTH, ROADS, STALLS, THINGS, WALLS, bumps, plants, seeded } from './valley-map.js';

// The part of the world the picture covers. The land beyond it just carries on in the same colour.
export const PAINTED = { left: -135, right: 135, far: -120, near: 100 };
// Where the sun is, as the way a shadow falls along the ground for each unit of height.
const SHADOW_WAY = { x: 0.34, z: 0.2 };
const SHADOW_DARK = 0.4;

const between = (random, low, high) => low + random() * (high - low);
const CROP_ROWS = {
  wheat: { ground: '#e6c65a', rows: ['#f2d871', '#d4b046'], every: 0.9, width: 0.34, spots: '#f8e79a' },
  barley: { ground: '#d9d07a', rows: ['#ebe394', '#c4bb62'], every: 0.9, width: 0.34, spots: '#f5efae' },
  lavender: { ground: '#7c8f66', rows: ['#a57fdc', '#8d66c9'], every: 1.25, width: 0.7, spots: '#c5a6ee' },
  carrots: { ground: '#a97b4c', rows: ['#6fb24b', '#5a9c3d'], every: 1.1, width: 0.42, spots: '#ff9a3c' },
};

/** Draws lots of short strokes of one colour in one go, which is much quicker than one by one. */
function batch(ctx, colour, width, draw) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  draw();
  ctx.stroke();
}

function traceLine(ctx, line, px) {
  ctx.beginPath();
  line.forEach(([x, z], index) => {
    const [cx, cy] = px(x, z);
    if (index) ctx.lineTo(cx, cy);
    else ctx.moveTo(cx, cy);
  });
}

function paintGrass(ctx, px, unit, random, { left, right, far, near }) {
  const { canvas } = ctx;
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#74b95c');
  gradient.addColorStop(0.42, '#8ccf6c');
  gradient.addColorStop(1, '#97d674');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Big soft patches of lighter and darker green, so it isn't one flat colour.
  const patches = ['rgb(166 222 124 / 0.34)', 'rgb(112 186 92 / 0.28)', 'rgb(186 228 130 / 0.26)', 'rgb(96 170 96 / 0.22)'];
  for (let i = 0; i < 1100; i += 1) {
    const [x, y] = px(between(random, left, right), between(random, far, near));
    const radius = between(random, 2.5, 13) * unit;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, patches[i % patches.length]);
    glow.addColorStop(1, 'rgb(140 200 110 / 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Tufts of grass.
  ctx.lineCap = 'round';
  for (const [colour, size] of [['rgb(110 182 88 / 0.65)', 0.13], ['rgb(170 226 128 / 0.6)', 0.11], ['rgb(92 164 86 / 0.5)', 0.12]]) {
    batch(ctx, colour, size * unit, () => {
      for (let i = 0; i < 9000; i += 1) {
        const [x, y] = px(between(random, -100, 100), between(random, -75, Math.min(near, 62)));
        const lean = between(random, -0.3, 0.3) * unit;
        ctx.moveTo(x, y);
        ctx.lineTo(x + lean, y - between(random, 0.3, 0.75) * unit);
      }
    });
  }
}

/** Patches of little flowers in the meadows. */
function paintFlowers(ctx, px, unit, random) {
  const colours = ['#fff6d6', '#ffe14d', '#ff9ec4', '#ffffff', '#c9a6ff'];
  for (const colour of colours) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    for (let i = 0; i < 1400; i += 1) {
      const wx = between(random, PLAY.left - 25, PLAY.right + 25);
      const wz = between(random, PLAY.far - 22, PLAY.near + 8);
      if (bumps(wx / 7 + 40, wz / 7 + 11) < 0.56) continue;
      const [x, y] = px(wx, wz);
      const size = between(random, 0.09, 0.17) * unit;
      ctx.moveTo(x + size, y);
      ctx.arc(x, y, size, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

function paintField(ctx, { x, z, w, d, yaw, crop }, px, unit, random) {
  const style = CROP_ROWS[crop];
  const [cx, cy] = px(x, z);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-yaw);
  const halfW = (w / 2) * unit;
  const halfD = (d / 2) * unit;
  // A dark edge and a hedge of darker grass round it.
  ctx.fillStyle = 'rgb(88 132 66 / 0.6)';
  ctx.beginPath();
  ctx.roundRect(-halfW - 0.45 * unit, -halfD - 0.45 * unit, (halfW + 0.45 * unit) * 2, (halfD + 0.45 * unit) * 2, unit * 0.7);
  ctx.fill();
  ctx.fillStyle = style.ground;
  ctx.beginPath();
  ctx.roundRect(-halfW, -halfD, halfW * 2, halfD * 2, unit * 0.45);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // The rows, running up the field, and a little wavy so they don't look drawn with a ruler.
  ctx.lineCap = 'round';
  let row = 0;
  for (let along = -halfW; along < halfW; along += style.every * unit) {
    ctx.strokeStyle = style.rows[row % style.rows.length];
    ctx.lineWidth = style.width * unit;
    ctx.beginPath();
    for (let at = -halfD; at <= halfD; at += unit * 0.8) {
      const wobble = Math.sin(at / unit + row * 1.7) * 0.05 * unit;
      if (at === -halfD) ctx.moveTo(along + wobble, at);
      else ctx.lineTo(along + wobble, at);
    }
    ctx.stroke();
    row += 1;
  }
  ctx.fillStyle = style.spots;
  ctx.beginPath();
  for (let i = 0; i < w * d * 3; i += 1) {
    const sx = between(random, -halfW, halfW);
    const sy = between(random, -halfD, halfD);
    const size = between(random, 0.06, 0.13) * unit;
    ctx.moveTo(sx + size, sy);
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function paintRoads(ctx, px, unit, random) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const passes = [
    { grow: 1.4, colour: 'rgb(122 160 84 / 0.5)' },
    { grow: 0.5, colour: '#c9ae79' },
    { grow: 0, colour: '#e7d4a4' },
  ];
  for (const { grow, colour } of passes) {
    for (const { line, width } of ROADS) {
      traceLine(ctx, line, px);
      ctx.strokeStyle = colour;
      ctx.lineWidth = (width + grow) * unit;
      ctx.stroke();
    }
  }
  // Worn in a little, with cart ruts and stones.
  for (const { line, width } of ROADS) {
    for (const side of [-0.24, 0.24]) {
      ctx.beginPath();
      line.forEach(([x, z], index) => {
        const [nx, nz] = line[Math.min(line.length - 1, index + 1)];
        const dx = nx - x;
        const dz = nz - z;
        const size = Math.hypot(dx, dz) || 1;
        const [cx, cy] = px(x + (-dz / size) * width * side, z + (dx / size) * width * side);
        if (index) ctx.lineTo(cx, cy);
        else ctx.moveTo(cx, cy);
      });
      ctx.strokeStyle = 'rgb(188 160 112 / 0.5)';
      ctx.lineWidth = 0.42 * unit;
      ctx.stroke();
    }
    ctx.fillStyle = 'rgb(170 150 118 / 0.7)';
    ctx.beginPath();
    line.forEach(([x, z]) => {
      for (let i = 0; i < 3; i += 1) {
        const [cx, cy] = px(x + between(random, -width / 2, width / 2), z + between(random, -width / 2, width / 2));
        const size = between(random, 0.06, 0.15) * unit;
        ctx.moveTo(cx + size, cy);
        ctx.arc(cx, cy, size, 0, Math.PI * 2);
      }
    });
    ctx.fill();
  }
}

function paintRiver(ctx, px, unit, random) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const passes = [
    { width: RIVER_WIDTH + 4.2, colour: 'rgb(96 150 84 / 0.55)' },
    { width: RIVER_WIDTH + 3, colour: '#eadcab' },
    { width: RIVER_WIDTH + 1.6, colour: '#d9c78f' },
    { width: RIVER_WIDTH + 0.6, colour: '#7fcdd3' },
    { width: RIVER_WIDTH, colour: '#4cb5e3' },
  ];
  for (const { width, colour } of passes) {
    traceLine(ctx, RIVER, px);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width * unit;
    ctx.stroke();
  }
  // Pebbles along the banks.
  for (const [x, z] of RIVER) {
    for (let i = 0; i < 6; i += 1) {
      const angle = random() * Math.PI * 2;
      const far = RIVER_WIDTH / 2 + between(random, 0.3, 1.5);
      const [cx, cy] = px(x + Math.cos(angle) * far, z + Math.sin(angle) * far);
      ctx.fillStyle = ['#bfb7a4', '#a9a18f', '#d6cfbd'][i % 3];
      ctx.beginPath();
      ctx.arc(cx, cy, between(random, 0.08, 0.2) * unit, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** The village's square and streets, the farmyard, and the ground under the fort. */
function paintPlaces(ctx, px, unit, random) {
  const disc = (x, z, radius, colour, squash = 1) => {
    const [cx, cy] = px(x, z);
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * unit, radius * unit * squash, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  // The square, in cobbles.
  disc(-23.5, 18, 8.2, '#c8b48c');
  disc(-23.5, 18, 7.6, '#ddceab');
  const [sx, sy] = px(-23.5, 18);
  ctx.strokeStyle = 'rgb(170 150 118 / 0.55)';
  ctx.lineWidth = 0.09 * unit;
  for (let radius = 1.2; radius < 7.6; radius += 1.1) {
    ctx.beginPath();
    ctx.arc(sx, sy, radius * unit, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The street through the village.
  ctx.lineCap = 'round';
  traceLine(ctx, [[-33, 18], [-23.5, 18], [-4, 18], [2, 16]], px);
  ctx.strokeStyle = '#c9ae79';
  ctx.lineWidth = 6.6 * unit;
  ctx.stroke();
  traceLine(ctx, [[-33, 18], [-23.5, 18], [-4, 18], [2, 16]], px);
  ctx.strokeStyle = '#e7d4a4';
  ctx.lineWidth = 6 * unit;
  ctx.stroke();
  // A churchyard of darker grass, and the farmyard's trodden earth.
  const [yx, yy] = px(-40, 12);
  ctx.fillStyle = 'rgb(106 176 92 / 0.65)';
  ctx.beginPath();
  ctx.roundRect(yx - 7 * unit, yy - 10 * unit, 14 * unit, 20 * unit, unit * 2);
  ctx.fill();
  disc(21, 11.5, 10.5, 'rgb(190 160 110 / 0.75)', 0.72);
  disc(21, 11.5, 8.6, 'rgb(205 178 128 / 0.8)', 0.72);
  // The meadow where the sheep are.
  const [mx, my] = px(MEADOW.x, MEADOW.z);
  ctx.fillStyle = 'rgb(160 222 112 / 0.75)';
  ctx.beginPath();
  ctx.roundRect(mx - (MEADOW.w / 2) * unit, my - (MEADOW.d / 2) * unit, MEADOW.w * unit, MEADOW.d * unit, unit);
  ctx.fill();
  // The orchard's mown rows.
  const [ox, oy] = px(ORCHARD.x, ORCHARD.z);
  ctx.fillStyle = 'rgb(120 186 92 / 0.8)';
  ctx.beginPath();
  ctx.roundRect(ox - (ORCHARD.w / 2) * unit, oy - (ORCHARD.d / 2) * unit, ORCHARD.w * unit, ORCHARD.d * unit, unit);
  ctx.fill();
  // The pond.
  disc(POND.x, POND.z, POND.r + 1, '#eadcab');
  disc(POND.x, POND.z, POND.r + 0.3, '#7fcdd3');
  disc(POND.x, POND.z, POND.r - 0.2, '#4cb5e3');
  disc(POND.x - 1.4, POND.z - 1.2, POND.r * 0.5, 'rgb(150 220 240 / 0.5)');
  // Lily pads.
  for (let i = 0; i < 12; i += 1) {
    const angle = random() * Math.PI * 2;
    const far = between(random, 1, POND.r - 1.2);
    disc(POND.x + Math.cos(angle) * far, POND.z + Math.sin(angle) * far, between(random, 0.35, 0.6), '#5fa858', 0.8);
  }
  // The bare ground under the fort.
  disc(FORT_AT.x, FORT_AT.z, 22, 'rgb(150 160 110 / 0.6)', 0.6);
}

/** The soft shadow of everything standing on the valley floor, drawn once and blurred. */
function paintShadows(ctx, px, unit) {
  const { canvas } = ctx;
  const layer = document.createElement('canvas');
  // At half the size, which blurs it a little too, and is a lot quicker to blur some more.
  layer.width = Math.ceil(canvas.width / 2);
  layer.height = Math.ceil(canvas.height / 2);
  const shade = layer.getContext('2d');
  shade.scale(0.5, 0.5);
  shade.fillStyle = '#143a2c';
  shade.strokeStyle = '#143a2c';

  const blob = (x, z, radius, tall) => {
    const [cx, cy] = px(x + SHADOW_WAY.x * tall, z + SHADOW_WAY.z * tall);
    shade.moveTo(cx + radius * unit * 1.25, cy);
    shade.ellipse(cx, cy, radius * unit * 1.25, radius * unit, 0, 0, Math.PI * 2);
  };
  const SIZES = { round: [2.7, 4.2], pine: [2.1, 5], poplar: [1.3, 6], birch: [1.8, 4], autumn: [2.7, 4.2], bush: [1, 0.8], rock: [1.3, 0.7], fruit: [2.2, 3.2] };
  shade.beginPath();
  for (const [kind, list] of Object.entries(plants())) {
    const [radius, tall] = SIZES[kind];
    for (const { x, z, scale } of list) blob(x, z, radius * scale, tall * scale);
  }
  for (const { x, z, r } of [...THINGS, ...BALES]) blob(x, z, r * 1.1, r * 2);
  shade.fill();

  // Buildings, by sliding their footprint along the way the shadow falls.
  for (const { x, z, w, d, yaw = 0, kind } of [...BUILDINGS, ...FAR_HOUSES]) {
    const tall = { church: 8, barn: 6, tall: 7, long: 5, cottage: 5, mill: 5 }[kind] ?? 5;
    const steps = 6;
    for (let i = 0; i <= steps; i += 1) {
      const share = (i / steps) * tall;
      const [cx, cy] = px(x + SHADOW_WAY.x * share, z + SHADOW_WAY.z * share);
      shade.save();
      shade.translate(cx, cy);
      shade.rotate(-yaw);
      shade.fillRect((-w / 2) * unit, (-d / 2) * unit, w * unit, d * unit);
      shade.restore();
    }
  }
  for (const { x, z } of STALLS) {
    const [cx, cy] = px(x + 0.5, z + 0.4);
    shade.fillRect(cx - 2.4 * unit, cy - 1.6 * unit, 4.8 * unit, 3.2 * unit);
  }
  shade.lineCap = 'round';
  for (const wall of WALLS) {
    traceLine(shade, wall.map(([x, z]) => [x + 0.25, z + 0.2]), px);
    shade.lineWidth = 1.3 * unit;
    shade.stroke();
  }
  for (const { x, z, turn, length, width } of BRIDGES) {
    const [cx, cy] = px(x + 0.4, z + 0.3);
    shade.save();
    shade.translate(cx, cy);
    shade.rotate(-turn);
    shade.fillRect((-width / 2 - 0.2) * unit, (-length / 2 + 2.5) * unit, (width + 0.4) * unit, (length - 5) * unit);
    shade.restore();
  }

  ctx.save();
  ctx.globalAlpha = SHADOW_DARK;
  ctx.filter = `blur(${Math.max(1.5, unit * 0.32)}px)`;
  ctx.drawImage(layer, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/** Fills a canvas with the valley floor. It takes up the whole of PAINTED. */
export function paintGround(canvas) {
  const ctx = canvas.getContext('2d');
  const { left, right, far, near } = PAINTED;
  const unit = canvas.width / (right - left);
  const px = (x, z) => [(x - left) * unit, (z - far) * unit];
  const random = seeded(4242);
  paintGrass(ctx, px, unit, random, PAINTED);
  paintFlowers(ctx, px, unit, random);
  for (const field of FIELDS) paintField(ctx, field, px, unit, random);
  paintPlaces(ctx, px, unit, random);
  paintRoads(ctx, px, unit, random);
  paintRiver(ctx, px, unit, random);
  paintShadows(ctx, px, unit);
}
