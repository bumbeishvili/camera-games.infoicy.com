// Giraffe's Paint Box: the ten pictures to colour in, one for each level, and the shapes they're made of. Each is
// drawn here, by the game itself, from the games' own characters and places: no pictures come from anywhere else.
//
// There's no screen in this file, so the rules (paint.js) and the unit tests read the same shapes the screen draws
// (view.js). A sheet is 150 wide and 100 tall, x across from the left and y down from the top.
//
// A picture is a list of parts, in the order they're drawn, so a later one lies on top of an earlier one where they
// overlap. Each part is { id, colour, shapes }: the colour its dot asks for, and one or more shapes, which together
// are the part. A part with no colour isn't for painting: it's only there to be seen, and to hide what's behind it.
// It's white paper, unless it has a fill, a colour it comes in. A part can say where its dot goes, as dot: [x, y].
// A shape is a short list, its kind and then its numbers:
//   ['c', x, y, r]                  a circle
//   ['e', x, y, rx, ry, turn]       an ellipse, turned by so many degrees
//   ['r', x, y, wide, high, round]  a rectangle from its top left corner, with round corners
//   ['p', x, y, x, y, ...]          a shape with straight sides
//   ['s', x, y, x, y, ...]          a smooth shape through these points
// ink is what's drawn over everything in the outline's own colour, and never painted: eyes, strings, smiles.
//   ['line', x, y, x, y, ...]       a line through these points
//   ['bend', x, y, x, y, ...]       a smooth line through them
//   ['dot', x, y, r]                a filled dot, and ['glint', x, y, r] a white one, as in an eye
//   ['fill', x, y, x, y, ...]       a filled shape with straight sides, and ['wheel', x, y, r] a filled circle
//   ['word', x, y, size, text]      a few letters or a number

export const SHEET = { width: 150, height: 100 };
export const RAINBOW = 'rainbow';

// The paints, in the order their pots stand. Each has a name in English and Georgian, for the tests and the docs.
export const COLOURS = {
  red: { hex: '#f0504a', name: 'red', nameKa: 'წითელი' },
  orange: { hex: '#ff9838', name: 'orange', nameKa: 'ნარინჯისფერი' },
  yellow: { hex: '#ffd43b', name: 'yellow', nameKa: 'ყვითელი' },
  green: { hex: '#4fc46c', name: 'green', nameKa: 'მწვანე' },
  blue: { hex: '#4a94ff', name: 'blue', nameKa: 'ლურჯი' },
  purple: { hex: '#9d6cf0', name: 'purple', nameKa: 'იისფერი' },
  pink: { hex: '#ff8fc4', name: 'pink', nameKa: 'ვარდისფერი' },
  brown: { hex: '#b0703c', name: 'brown', nameKa: 'ყავისფერი' },
};
// Every paint there is, the rainbow last: a part's paint is kept as its place in this list.
export const COLOUR_NAMES = [...Object.keys(COLOURS), RAINBOW];
// The colours of the rainbow paint, which change as the brush goes along.
export const RAINBOW_HEXES = ['#f0504a', '#ff9838', '#ffd43b', '#4fc46c', '#4a94ff', '#9d6cf0'];

// What two paints make in the mixing dish.
const MIXES = { 'red+yellow': 'orange', 'blue+yellow': 'green', 'blue+red': 'purple' };
const pair = (a, b) => [a, b].sort().join('+');

/** What two paints make together, or null if they make nothing new. */
export const mixOf = (a, b) => (a === b ? null : MIXES[pair(a, b)] ?? null);

/** The two paints that make a colour, or null if it can't be mixed. */
export function recipeFor(colour) {
  const found = Object.entries(MIXES).find(([, made]) => made === colour);
  return found ? found[0].split('+') : null;
}

/** Whether a paint can go in the mixing dish: only the ones that make something. */
export const mixes = (colour) => Object.keys(MIXES).some((key) => key.split('+').includes(colour));

/* ---------- shapes ---------- */

const TURN = Math.PI / 180;

/** A shape's edge, as a flat list of points all the way round: x, y, x, y... */
export function outlineOf([kind, ...n]) {
  const points = [];
  if (kind === 'c' || kind === 'e') {
    const [x, y, rx, ry = rx, turn = 0] = n;
    const steps = Math.max(24, Math.min(72, Math.round(Math.max(rx, ry) * 3)));
    const [cos, sin] = [Math.cos(turn * TURN), Math.sin(turn * TURN)];
    for (let i = 0; i < steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const [dx, dy] = [Math.cos(angle) * rx, Math.sin(angle) * ry];
      points.push(x + dx * cos - dy * sin, y + dx * sin + dy * cos);
    }
  } else if (kind === 'r') {
    const [x, y, wide, high, round = 0] = n;
    const r = Math.min(round, wide / 2, high / 2);
    if (r <= 0) return [x, y, x + wide, y, x + wide, y + high, x, y + high];
    // Each corner is a quarter of a circle, starting from the top left and going round.
    const corners = [[x + r, y + r, 180], [x + wide - r, y + r, 270], [x + wide - r, y + high - r, 0], [x + r, y + high - r, 90]];
    for (const [cx, cy, from] of corners) {
      for (let i = 0; i <= 6; i += 1) {
        const angle = (from + (i / 6) * 90) * TURN;
        points.push(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      }
    }
  } else if (kind === 'p') {
    return n.slice();
  } else if (kind === 's') {
    const count = n.length / 2;
    const at = (i) => [n[((i % count) + count) % count * 2], n[((i % count) + count) % count * 2 + 1]];
    for (let i = 0; i < count; i += 1) {
      const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
      for (let step = 0; step < 10; step += 1) {
        const t = step / 10;
        const [t2, t3] = [t * t, t * t * t];
        for (const axis of [0, 1]) {
          points.push(0.5 * (2 * p1[axis] + (p2[axis] - p0[axis]) * t + (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 + (3 * p1[axis] - p0[axis] - 3 * p2[axis] + p3[axis]) * t3));
        }
      }
    }
  } else {
    throw new Error(`No such shape: ${kind}`);
  }
  return points;
}

/** Whether a point is inside an edge from outlineOf. */
export function insideOutline(outline, x, y) {
  let inside = false;
  for (let i = 0, j = outline.length - 2; i < outline.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [outline[i], outline[i + 1], outline[j], outline[j + 1]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The box an edge fits in. */
export function boxOf(outline) {
  const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (let i = 0; i < outline.length; i += 2) {
    box.left = Math.min(box.left, outline[i]);
    box.right = Math.max(box.right, outline[i]);
    box.top = Math.min(box.top, outline[i + 1]);
    box.bottom = Math.max(box.bottom, outline[i + 1]);
  }
  return box;
}

/** A wavy line from one side to the other, as points, for the top of the sea or the grass. */
function wave(from, to, y, high, bumps) {
  const points = [];
  const steps = bumps * 8;
  for (let i = 0; i <= steps; i += 1) {
    const along = i / steps;
    points.push(from + (to - from) * along, y + Math.sin(along * bumps * Math.PI * 2) * high);
  }
  return points;
}

/** The same shape on the other side of the sheet, for the mirror page. */
function flip([kind, ...n]) {
  if (kind === 'c') return [kind, SHEET.width - n[0], n[1], n[2]];
  if (kind === 'e') return [kind, SHEET.width - n[0], n[1], n[2], n[3], -(n[4] ?? 0)];
  if (kind === 'r') return [kind, SHEET.width - n[0] - n[2], n[1], n[2], n[3], n[4] ?? 0];
  return [kind, ...n.map((value, index) => (index % 2 ? value : SHEET.width - value))];
}

const part = (id, colour, shapes, more = {}) => ({ id, colour, shapes, ...more });
/** A part that isn't for painting: white paper, or a colour it comes in. */
const paper = (id, shapes, fill = null) => ({ id, colour: null, shapes, ...(fill ? { fill } : {}) });

/* ---------- the pictures ---------- */

// 1. Giraffe, in a party hat, with a balloon and the sun.
const giraffe = {
  id: 'giraffe',
  name: 'Giraffe',
  parts: [
    part('sun', 'orange', [['c', 16, 15, 10]]),
    part('neck', 'yellow', [['p', 30, 100, 96, 100, 80, 66, 46, 66]]),
    part('ear-left', 'yellow', [['e', 31, 43, 12, 7, -22]]),
    part('ear-right', 'yellow', [['e', 95, 43, 12, 7, 22]]),
    part('horns', 'brown', [['r', 48.5, 12, 6, 20, 2], ['c', 51.5, 11, 5], ['r', 71.5, 12, 6, 20, 2], ['c', 74.5, 11, 5]]),
    part('head', 'yellow', [['e', 63, 50, 30, 27]]),
    part('muzzle', 'orange', [['e', 63, 69, 22, 15.5]]),
    part('hat', 'purple', [['p', 63, 1.5, 73.5, 27, 52.5, 27]]),
    part('balloon', 'red', [['e', 126, 33, 20, 23], ['p', 123, 55, 129, 55, 130, 61, 122, 61]]),
  ],
  ink: [
    ['dot', 51.5, 46, 3.8], ['glint', 52.8, 44.6, 1.2], ['dot', 74.5, 46, 3.8], ['glint', 75.8, 44.6, 1.2],
    ['dot', 56, 65, 1.6], ['dot', 70, 65, 1.6],
    ['bend', 51, 73, 57, 78, 63, 79.5, 69, 78, 75, 73],
    ['bend', 25, 44, 31, 42.5, 37, 44], ['bend', 89, 44, 95, 42.5, 101, 44],
    ['bend', 126, 61, 129, 72, 123, 86, 127, 100],
    ['bend', 113, 25, 115, 18, 121, 15],
    ['line', 16, 1.5, 16, 3.5], ['line', 27.5, 15, 30, 15], ['line', 24.2, 6.8, 26, 5], ['line', 24.2, 23.2, 26, 25], ['line', 16, 26.5, 16, 29], ['line', 7.8, 23.2, 6, 25],
  ],
  life: [
    { parts: ['ear-left'], move: 'sway', by: 9, at: [42, 46] },
    { parts: ['ear-right'], move: 'sway', by: -9, at: [84, 46] },
    { parts: ['balloon'], move: 'bob', by: 1.6 },
  ],
};

// 2. Balloons tied to a present. The big one in the middle asks for rainbow paint.
const balloons = {
  id: 'balloons',
  name: 'Balloons',
  parts: [
    part('box', 'purple', [['r', 53, 73, 44, 25, 2]]),
    part('lid', 'blue', [['r', 49, 65, 52, 10, 2]]),
    part('ribbon', 'yellow', [['r', 71, 65, 8, 33, 0]]),
    part('bow', 'pink', [['e', 66.5, 60, 8, 5, 18], ['e', 83.5, 60, 8, 5, -18], ['c', 75, 61.5, 3.4]]),
    part('tag', 'green', [['c', 88.5, 86, 5.5]]),
    part('balloon-red', 'red', [['e', 27, 31, 13.5, 16.5]]),
    part('balloon-blue', 'blue', [['e', 123, 31, 13.5, 16.5]]),
    part('balloon-yellow', 'yellow', [['e', 51, 21, 13.5, 16.5]]),
    part('balloon-green', 'green', [['e', 99, 21, 13.5, 16.5]]),
    part('balloon-rainbow', RAINBOW, [['e', 75, 20, 15, 18]], { plain: 'purple' }),
  ],
  ink: [
    ['bend', 27, 47.5, 44, 54, 72, 61], ['bend', 123, 47.5, 106, 54, 78, 61],
    ['bend', 51, 37.5, 60, 50, 73, 60], ['bend', 99, 37.5, 90, 50, 77, 60],
    ['line', 75, 38, 75, 58],
    ['fill', 25.4, 47, 28.6, 47, 29.4, 49.6, 24.6, 49.6], ['fill', 121.4, 47, 124.6, 47, 125.4, 49.6, 120.6, 49.6],
    ['fill', 49.4, 37, 52.6, 37, 53.4, 39.6, 48.6, 39.6], ['fill', 97.4, 37, 100.6, 37, 101.4, 39.6, 96.6, 39.6],
    ['fill', 73.4, 37.6, 76.6, 37.6, 77.4, 40.2, 72.6, 40.2],
    ['bend', 18, 26, 19.5, 21, 23, 18], ['bend', 114, 26, 115.5, 21, 119, 18],
  ],
  life: [
    { parts: ['balloon-red'], move: 'bob', by: 1.4 },
    { parts: ['balloon-yellow'], move: 'bob', by: 1.4, late: 0.3 },
    { parts: ['balloon-rainbow'], move: 'bob', by: 1.6, late: 0.6 },
    { parts: ['balloon-green'], move: 'bob', by: 1.4, late: 0.9 },
    { parts: ['balloon-blue'], move: 'bob', by: 1.4, late: 1.2 },
  ],
};

// 3. The party cake, with three candles.
const cake = {
  id: 'cake',
  name: 'Cake',
  parts: [
    part('plate', 'blue', [['e', 75, 91.5, 56, 6.5]]),
    part('tier-bottom', 'pink', [['r', 28, 63, 94, 27, 4]]),
    part('icing-bottom', 'brown', [['p', 28, 60, 122, 60, 122, 67, 116.5, 72, 110, 66.5, 103.5, 72, 97, 66.5, 90.5, 72, 84, 66.5, 77.5, 72, 71, 66.5, 64.5, 72, 58, 66.5, 51.5, 72, 45, 66.5, 38.5, 72, 33, 66.5, 28, 70]]),
    part('heart', 'red', [['c', 71.6, 79.4, 4.2], ['c', 78.4, 79.4, 4.2], ['p', 67.8, 81.2, 82.2, 81.2, 75, 88.6]]),
    part('tier-middle', 'yellow', [['r', 44, 40, 62, 22, 4]]),
    part('icing-middle', 'red', [['p', 44, 37, 106, 37, 106, 43, 100.5, 48, 94, 43, 87.5, 48, 81, 43, 75, 48, 69, 43, 62.5, 48, 56, 43, 49.5, 48, 44, 44]]),
    part('tier-top', 'pink', [['r', 58, 22, 34, 17, 4]]),
    part('candle-left', 'green', [['r', 61.5, 9, 6, 13.5, 1]]),
    part('candle-right', 'green', [['r', 82.5, 9, 6, 13.5, 1]]),
    part('candle-middle', RAINBOW, [['r', 71.5, 7, 7, 15.5, 1]], { plain: 'blue' }),
    part('flames', 'yellow', [['e', 64.5, 5, 2.7, 3.8], ['e', 85.5, 5, 2.7, 3.8], ['e', 75, 3.6, 2.9, 3.4]]),
  ],
  ink: [
    ['dot', 38, 79, 1.3], ['dot', 48, 84, 1.3], ['dot', 58, 79.5, 1.3], ['dot', 92, 79.5, 1.3], ['dot', 102, 84, 1.3], ['dot', 112, 79, 1.3],
    ['dot', 54, 55, 1.2], ['dot', 66, 57, 1.2], ['dot', 78, 54.5, 1.2], ['dot', 90, 57, 1.2], ['dot', 99, 54, 1.2],
  ],
  life: [
    { parts: ['flames'], move: 'flicker', by: 0.14, at: [75, 8.5] },
    { parts: ['tier-top', 'candle-left', 'candle-right', 'candle-middle'], move: 'bob', by: 0.7 },
  ],
};

// 4. The lighthouse on its rock, with a boat going by. The sea is big, and the roller is for that.
const lighthouse = {
  id: 'lighthouse',
  name: 'Lighthouse',
  parts: [
    part('sun', 'orange', [['c', 22, 19, 11]]),
    paper('cloud', [['c', 112, 20, 6], ['c', 121, 17, 8], ['c', 130, 20.5, 6], ['r', 110, 20, 22, 6, 2]]),
    part('rock', 'brown', [['s', 30, 84, 38, 71, 52, 64.5, 75, 62.5, 98, 64.5, 110, 71, 118, 84, 74, 90]]),
    paper('tower', [['p', 61, 65, 89, 65, 84.5, 22, 65.5, 22]]),
    part('stripe-bottom', 'red', [['p', 61, 65, 89, 65, 87.9, 54.2, 62.1, 54.2]]),
    part('stripe-top', 'red', [['p', 63.2, 43.5, 86.8, 43.5, 85.7, 32.8, 64.3, 32.8]]),
    part('door', 'brown', [['r', 70.5, 54.5, 9, 10.5, 4]]),
    part('window', 'yellow', [['c', 75, 38.2, 3.6]]),
    paper('gallery', [['r', 61, 18.5, 28, 4.5, 1.5]]),
    part('lamp', 'yellow', [['r', 66.5, 8, 17, 11, 1.5]]),
    part('roof', 'red', [['p', 75, 0.8, 87, 8.4, 63, 8.4]]),
    part('hull', 'brown', [['p', 106, 69, 142, 69, 135, 81, 113, 81]]),
    part('sail-small', 'green', [['p', 121.5, 49, 121.5, 66.5, 109, 66.5]]),
    part('sail-big', RAINBOW, [['p', 126, 43, 126, 66.5, 142.5, 66.5]], { plain: 'orange' }),
    part('sea', 'blue', [['p', ...wave(0, 150, 77.5, 1.7, 6), 150, 100, 0, 100]]),
  ],
  ink: [
    ['line', 123.8, 41, 123.8, 69],
    ['line', 22, 3.5, 22, 6.5], ['line', 22, 31.5, 22, 34.5], ['line', 6.5, 19, 9.5, 19], ['line', 34.5, 19, 37.5, 19],
    ['line', 11, 8, 13.2, 10.2], ['line', 30.8, 27.8, 33, 30], ['line', 33, 8, 30.8, 10.2], ['line', 13.2, 27.8, 11, 30],
    ['line', 75, 8, 75, 19],
    ['bend', 10, 88, 14, 86.5, 18, 88, 22, 86.5, 26, 88], ['bend', 52, 93, 56, 91.5, 60, 93, 64, 91.5, 68, 93], ['bend', 96, 89, 100, 87.5, 104, 89, 108, 87.5, 112, 89],
  ],
  roller: [30, 88],
  life: [
    { parts: ['hull', 'sail-small', 'sail-big'], move: 'sway', by: 4, at: [124, 78] },
    { parts: ['sun'], move: 'pulse', by: 0.05 },
  ],
};

// 5. Giraffe's garden: a big flower, a tulip, his watering can, a kite, and a bush with someone hiding in it.
const garden = {
  id: 'garden',
  name: 'Garden',
  parts: [
    part('sun', 'yellow', [['c', 15, 14, 10]]),
    part('kite', RAINBOW, [['p', 121, 4, 135, 21, 121, 44, 107, 21]], { plain: 'red' }),
    part('stem-flower', 'green', [['r', 48, 50, 5, 37, 1]]),
    part('leaf-left', 'green', [['e', 40, 71, 9.5, 4.6, -24]]),
    part('leaf-right', 'green', [['e', 61, 65, 9.5, 4.6, 24]]),
    part('petals', 'pink', [['c', 50.5, 19.5, 9.5], ['c', 62.6, 26.5, 9.5], ['c', 62.6, 40.5, 9.5], ['c', 50.5, 47.5, 9.5], ['c', 38.4, 40.5, 9.5], ['c', 38.4, 26.5, 9.5]]),
    part('middle', 'yellow', [['c', 50.5, 33.5, 9]]),
    part('stem-tulip', 'green', [['r', 93, 56, 5, 31, 1]]),
    part('leaf-tulip', 'green', [['e', 104, 72, 9.5, 4.6, -24]]),
    part('tulip', 'red', [['p', 84, 34, 89.5, 42, 95.5, 34, 101.5, 42, 107, 34, 107, 49, 101, 57.5, 90, 57.5, 84, 49]]),
    part('can', 'blue', [['r', 6, 64, 20, 19, 3], ['p', 25, 71, 37, 60.5, 40, 63.5, 25, 79]]),
    part('grass', 'green', [['p', ...wave(0, 150, 84, 1.4, 5), 150, 100, 0, 100]]),
    part('bush', 'green', [['c', 124, 81, 11], ['c', 138, 76, 11], ['c', 139, 89, 11], ['c', 124, 92, 10]]),
  ],
  ink: [
    ['bend', 121, 44, 124, 51, 119, 57, 123, 64, 119, 70],
    ['line', 121, 4, 121, 44], ['line', 107, 21, 135, 21],
    ['bend', 9, 64, 8, 55, 16, 53.5, 24, 55, 23, 64],
    ['dot', 47.5, 31.5, 1], ['dot', 53.5, 31.5, 1], ['bend', 46.5, 35.5, 50.5, 38, 54.5, 35.5],
    ['line', 15, 0.5, 15, 2.5], ['line', 26.5, 14, 29, 14], ['line', 23.2, 5.8, 25, 4], ['line', 23.2, 22.2, 25, 24], ['line', 15, 25.5, 15, 28], ['line', 6.8, 22.2, 5, 24],
  ],
  roller: [78, 92],
  friend: { part: 'bush', mark: '🐰', at: [131, 68], size: 15 },
  life: [
    { parts: ['petals', 'middle'], move: 'sway', by: 7, at: [50.5, 33.5] },
    { parts: ['tulip'], move: 'sway', by: 6, at: [95.5, 57] },
    { parts: ['kite'], move: 'sway', by: 7, at: [121, 44] },
  ],
};

// 6. A butterfly: what's painted on one wing is painted on the other at the same time.
const wing = [
  part('wing-top', 'blue', [['s', 72, 47, 62, 24, 44, 9, 22, 10, 10, 26, 18, 44, 46, 52]]),
  part('wing-bottom', 'purple', [['s', 72, 53, 50, 55, 27, 60, 19, 75, 28, 89, 47, 92, 64, 78]]),
  part('spot-big', 'yellow', [['c', 33, 27, 9]]),
  part('spot-small', 'red', [['c', 54, 37, 5.2]]),
  part('spot-low', 'pink', [['c', 38, 74, 7.5]]),
  part('spot-in', 'yellow', [['c', 54, 64, 4.6]]),
];
const butterfly = {
  id: 'butterfly',
  name: 'Butterfly',
  mirror: true,
  parts: [
    ...wing.map((each) => ({ ...each, id: `${each.id}-left` })),
    ...wing.map((each) => ({ ...each, id: `${each.id}-right`, shapes: each.shapes.map(flip) })),
    part('body', 'brown', [['e', 75, 55, 5.5, 25]]),
    part('head', 'brown', [['c', 75, 26, 7]]),
  ],
  ink: [
    ['bend', 72, 20.5, 68, 12, 61, 7], ['bend', 78, 20.5, 82, 12, 89, 7], ['dot', 61, 7, 1.6], ['dot', 89, 7, 1.6],
    ['dot', 72.4, 25, 1.1], ['dot', 77.6, 25, 1.1], ['bend', 72.5, 28.5, 75, 30, 77.5, 28.5],
    ['line', 70.5, 45, 79.5, 45], ['line', 70, 57, 80, 57], ['line', 70.8, 68, 79.2, 68],
  ],
  roller: [75, 92],
  life: [
    { parts: ['wing-top-left', 'wing-bottom-left', 'spot-big-left', 'spot-small-left', 'spot-low-left', 'spot-in-left'], move: 'flap', by: 0.4, at: [72, 50] },
    { parts: ['wing-top-right', 'wing-bottom-right', 'spot-big-right', 'spot-small-right', 'spot-low-right', 'spot-in-right'], move: 'flap', by: 0.4, at: [78, 50] },
  ],
};

// 7. The racing car. Its pots are only red, yellow and blue: orange and green have to be mixed.
const car = {
  id: 'car',
  name: 'Racing car',
  mix: ['orange', 'green'],
  parts: [
    part('sun', 'orange', [['c', 96, 14, 10]]),
    part('pennant', 'blue', [['p', 22, 6, 48, 14, 22, 22]]),
    part('cup', 'yellow', [['p', 121, 9, 141, 9, 137.5, 24, 124.5, 24], ['r', 128.5, 23, 5, 7, 0]]),
    part('cup-foot', 'blue', [['r', 123, 29, 16, 5, 1.5]]),
    part('grass', 'green', [['p', ...wave(0, 150, 89, 1.2, 4), 150, 100, 0, 100]]),
    part('flame', 'orange', [['p', 21, 62, 5, 58, 12, 66, 2, 70.5, 12, 72, 6, 79, 21, 75]]),
    part('spoiler', 'yellow', [['r', 13, 41, 20, 6, 2], ['r', 24, 46, 4.5, 11, 0]]),
    part('body', 'red', [['s', 20, 66, 25, 56, 46, 53, 61, 42.5, 87, 41, 100, 51, 125, 55, 134, 65, 133, 76, 76, 79, 22, 77]]),
    part('window', 'blue', [['p', 63, 46, 85, 44.5, 95.5, 53, 60, 54.5]]),
    part('stripe', 'orange', [['r', 34, 60, 86, 6, 3]]),
    part('badge', 'yellow', [['c', 77, 64.5, 8]], { dot: [77, 70] }),
    part('bumper', 'blue', [['r', 127, 66, 9, 8, 3]]),
    paper('tyre-back', [['c', 46, 79, 12]], '#44505e'),
    paper('tyre-front', [['c', 108, 79, 12]], '#44505e'),
    part('hub-back', 'yellow', [['c', 46, 79, 6]]),
    part('hub-front', 'yellow', [['c', 108, 79, 6]]),
    part('cone', 'orange', [['p', 141.5, 69, 147.5, 90.5, 135.5, 90.5]]),
  ],
  ink: [
    ['line', 22, 6, 22, 41],
    ['word', 77, 64.8, 9, '1'],
    ['line', 41, 79, 51, 79], ['line', 46, 74, 46, 84], ['line', 103, 79, 113, 79], ['line', 108, 74, 108, 84],
    ['bend', 124, 13, 119, 14, 119.5, 19, 125.5, 21], ['bend', 138, 13, 143, 14, 142.5, 19, 136.5, 21],
    ['line', 137.6, 81.5, 145.4, 81.5],
  ],
  roller: [74, 94],
  friend: { part: 'window', mark: '🦊', at: [77.5, 46.5], size: 12 },
  life: [
    { parts: ['hub-back'], move: 'spin', by: 300, at: [46, 79] },
    { parts: ['hub-front'], move: 'spin', by: 300, at: [108, 79] },
    { parts: ['flame'], move: 'flicker', by: 0.16, at: [21, 68.5], sideways: true },
    { parts: ['pennant'], move: 'sway', by: 5, at: [22, 14] },
  ],
};

// 8. Widget the robot, coloured by numbers: each part has a number, and so has each pot.
const robot = {
  id: 'robot',
  name: 'Robot',
  numbers: true,
  parts: [
    part('feet', 'blue', [['r', 46, 88, 25, 10, 4], ['r', 79, 88, 25, 10, 4]]),
    part('legs', 'purple', [['r', 53, 76, 13, 15, 2], ['r', 84, 76, 13, 15, 2]]),
    part('arms', 'orange', [['r', 21, 47, 24, 10, 4], ['r', 105, 47, 24, 10, 4]]),
    part('hands', 'red', [['c', 18, 52, 7.5], ['c', 132, 52, 7.5]]),
    part('neck', 'purple', [['r', 68, 36, 14, 9, 0]]),
    part('body', 'green', [['r', 42, 42, 66, 37, 7]]),
    part('panel', 'yellow', [['r', 55, 48, 40, 16, 3]]),
    part('button-left', 'red', [['c', 60, 71, 3.6]]),
    part('button-middle', 'orange', [['c', 75, 71, 3.6]]),
    part('button-right', 'purple', [['c', 90, 71, 3.6]]),
    part('ears', 'orange', [['r', 43, 18, 9, 12, 2], ['r', 98, 18, 9, 12, 2]]),
    part('head', 'blue', [['r', 50, 9, 50, 29, 7]]),
    part('eye-left', 'yellow', [['c', 64, 21, 6.5]]),
    part('eye-right', 'yellow', [['c', 86, 21, 6.5]]),
    part('mouth', 'red', [['r', 63, 30.5, 24, 4.6, 2.3]]),
    part('ball', 'red', [['c', 75, 3.8, 3.6]]),
  ],
  ink: [
    ['line', 75, 7, 75, 9],
    ['dot', 64, 21, 2.2], ['dot', 86, 21, 2.2], ['glint', 64.8, 20.2, 0.7], ['glint', 86.8, 20.2, 0.7],
    ['line', 69, 30.5, 69, 35.1], ['line', 75, 30.5, 75, 35.1], ['line', 81, 30.5, 81, 35.1],
  ],
  roller: [18, 84],
  friend: { part: 'panel', mark: '🐱', at: [75, 56], size: 13 },
  life: [
    { parts: ['arms', 'hands'], move: 'bob', by: 1.6 },
    { parts: ['eye-left', 'eye-right'], move: 'bob', by: 0.7, under: 'head' },
    { parts: ['ball'], move: 'pulse', by: 0.18 },
  ],
};

// 9. The ship in Cannon Bay, with an island, fish, and a chest someone is hiding in. Green has to be mixed.
const ship = {
  id: 'ship',
  name: 'Ship',
  mix: ['green'],
  parts: [
    part('sun', 'yellow', [['c', 136, 15, 10]]),
    part('island', 'yellow', [['s', 0, 88, 4, 72, 16, 65.5, 30, 67, 40, 76, 44, 88, 20, 92]]),
    part('trunk', 'brown', [['p', 18.5, 68, 24, 68, 27.5, 39, 23, 39]]),
    part('leaves', 'green', [['e', 14, 37, 12, 4.6, -18], ['e', 36, 37, 12, 4.6, 18], ['e', 25, 30, 4.6, 10.5, 0]]),
    part('chest', 'brown', [['r', 4, 73, 14, 10, 2]]),
    part('hull', 'brown', [['p', 56, 62, 132, 62, 121, 86, 67, 86]]),
    part('rail', 'red', [['r', 54, 57, 80, 6.5, 2]]),
    part('portholes', 'yellow', [['c', 76, 71, 3.6], ['c', 94, 71, 3.6], ['c', 112, 71, 3.6]]),
    part('sail-front', 'green', [['p', 63, 22, 63, 52, 47, 52]]),
    part('sail-main', 'red', [['p', 67, 16, 97, 16, 100, 53, 64, 53]]),
    part('sail-back', RAINBOW, [['p', 104, 23, 124, 23, 127, 53, 101, 53]], { plain: 'orange' }),
    part('flag', 'red', [['p', 82.5, 3, 96, 8, 82.5, 13]]),
    part('flag-back', 'yellow', [['p', 114, 13, 125.5, 17.5, 114, 22]]),
    part('sea', 'blue', [['p', ...wave(0, 150, 84, 1.7, 6), 150, 100, 0, 100]]),
    part('fish-left', 'orange', [['e', 30, 93, 8, 4.4, 0], ['p', 37, 93, 43, 88.6, 43, 97.4]]),
    part('fish-right', 'yellow', [['e', 136, 92, 8, 4.4, 0], ['p', 129, 92, 123, 87.6, 123, 96.4]]),
    part('buoy', 'red', [['c', 62, 91.5, 4.8]]),
  ],
  ink: [
    ['line', 82.5, 3, 82.5, 57], ['line', 114, 13, 114, 57], ['line', 57.2, 91.5, 66.8, 91.5],
    ['dot', 26.5, 92, 0.9], ['dot', 139.5, 91, 0.9],
    ['line', 4, 77.5, 18, 77.5], ['dot', 11, 79.2, 1],
    ['line', 136, 1, 136, 3], ['line', 122, 15, 124.5, 15], ['line', 126.1, 5.1, 127.9, 6.9], ['line', 126.1, 24.9, 127.9, 23.1], ['line', 136, 27, 136, 29.5],
    ['bend', 70, 28, 82, 30.5, 94, 28], ['bend', 68.5, 40, 82, 43, 96, 40],
  ],
  roller: [88, 94],
  friend: { part: 'chest', mark: '🐧', at: [11, 68], size: 12 },
  life: [
    { parts: ['hull', 'rail', 'portholes', 'sail-front', 'sail-main', 'sail-back', 'flag', 'flag-back'], move: 'sway', by: 2.4, at: [94, 84] },
    { parts: ['buoy'], move: 'sway', by: 12, at: [62, 96], under: 'sea' },
    { parts: ['fish-left'], move: 'hop', by: 3, under: 'sea' },
    { parts: ['fish-right'], move: 'hop', by: 3, late: 0.5, under: 'sea' },
  ],
};

// 10. The party: flags, balloons, presents and a cake, and an empty picture in a frame to draw anything in.
const FLAGS = ['red', 'yellow', 'blue', 'orange', 'red', 'yellow', 'blue'];
const party = {
  id: 'party',
  name: 'Party',
  mix: ['orange'],
  parts: [
    ...FLAGS.map((colour, index) => {
      const x = 12 + index * 21;
      const y = 5 + Math.sin((index / (FLAGS.length - 1)) * Math.PI) * 3.4;
      return part(`flag-${index + 1}`, colour, [['p', x - 8, y, x + 8, y, x, y + 16.5]]);
    }),
    part('frame', 'yellow', [['r', 35, 27, 80, 54, 3]]),
    part('canvas', null, [['r', 41, 33, 68, 42, 1]], { free: true }),
    part('balloon-left', 'red', [['e', 16, 47, 10.5, 13.5]]),
    part('balloon-right', RAINBOW, [['e', 134, 47, 10.5, 13.5]], { plain: 'blue' }),
    part('present-left', 'blue', [['r', 6, 78, 24, 19, 2]]),
    part('ribbon-left', 'yellow', [['r', 15, 78, 6, 19, 0], ['e', 13.5, 75, 5, 3, 20], ['e', 22.5, 75, 5, 3, -20]]),
    part('present-right', 'red', [['r', 120, 80, 24, 17, 2]]),
    part('ribbon-right', 'orange', [['r', 129, 80, 6, 17, 0], ['e', 127.5, 77, 5, 3, 20], ['e', 136.5, 77, 5, 3, -20]]),
    part('cake', 'orange', [['r', 59, 86, 32, 12, 3]]),
    part('candle', 'blue', [['r', 63.5, 78.5, 4.4, 8.5, 1]]),
    part('cherry', 'red', [['c', 75, 83.6, 3.6]]),
  ],
  ink: [
    ['bend', 2, 3.6, 38, 8.6, 75, 9.4, 112, 8.6, 148, 3.6],
    ['bend', 16, 60.5, 18, 68, 17, 73], ['bend', 134, 60.5, 132, 68, 133, 75],
    ['fill', 14.6, 60, 17.4, 60, 18.2, 62.4, 13.8, 62.4], ['fill', 132.6, 60, 135.4, 60, 136.2, 62.4, 131.8, 62.4],
    ['bend', 59, 90, 64.3, 92.4, 69.6, 90, 75, 92.4, 80.3, 90, 85.6, 92.4, 91, 90],
    ['bend', 75.6, 80.4, 77, 77.4, 79.4, 76.4],
  ],
  roller: [100, 90],
  friend: { part: 'present-left', mark: '🐻', at: [18, 69], size: 12 },
  life: [
    ...FLAGS.map((_, index) => ({ parts: [`flag-${index + 1}`], move: 'sway', by: index % 2 ? 7 : -7, at: [12 + index * 21, 5 + Math.sin((index / (FLAGS.length - 1)) * Math.PI) * 3.4] })),
    { parts: ['balloon-left'], move: 'bob', by: 1.5 },
    { parts: ['balloon-right'], move: 'bob', by: 1.5, late: 0.5 },
  ],
};

/** The ten pictures, the first for level 1. */
export const PAGES = [giraffe, balloons, cake, lighthouse, garden, butterfly, car, robot, ship, party];
