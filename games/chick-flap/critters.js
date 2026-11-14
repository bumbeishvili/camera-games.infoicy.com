// Flap, Little Chick!: the chick, the fox, the mother hen and the duck, drawn in 2D. Each is drawn in its own
// units, a little longer than the chick is tall, with its feet at the origin and facing the right of the screen,
// and y going down the screen, so a view only has to move and scale the canvas before calling one of these.
//
// The chick's two wings are the child's two hands: the wing nearest the viewer is the right hand's and the one
// behind is the left hand's, and each is raised as far as that hand is up.
import { INK } from '../../core/glove.js';

const TAU = Math.PI * 2;
const mix = (from, to, share) => from + (to - from) * share;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// The chick's colours: the child's own, and one for each friend's, by their place in the order everyone joined.
export const CHICK_LOOKS = [
  { body: '#ffd84a', belly: '#ffeb99', wing: '#ffc21a', far: '#eda514', tuft: '#ffb703' },
  { body: '#fff3d6', belly: '#ffffff', wing: '#f3d9a4', far: '#d9b676', tuft: '#e8c98a' },
  { body: '#f4a259', belly: '#ffd2a6', wing: '#e07f2f', far: '#bd6520', tuft: '#c96a1f' },
  { body: '#9ad8f5', belly: '#d6f1ff', wing: '#62bde8', far: '#3d9bcb', tuft: '#4aa9d6' },
];

function outline(ctx, wide = 0.045) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = wide;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function blob(ctx, x, y, rx, ry, colour, wide) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = colour;
  ctx.fill();
  outline(ctx, wide);
}

/** One wing, from its shoulder: a rounded feather shape with three tips, turned up as far as lift says. */
function wing(ctx, x, y, lift, colour, { long = 0.44, spread = 0, raised = 1.25 } = {}) {
  ctx.save();
  ctx.translate(x, y);
  // Folded, it lies back and down along the body. Up, it points at the sky, like a hand held up for a high five.
  ctx.rotate(mix(-0.62, raised, lift));
  const wide = 0.15 + 0.07 * spread;
  ctx.beginPath();
  ctx.moveTo(0.05, -0.02);
  ctx.quadraticCurveTo(-long * 0.45, -wide * 1.5, -long, -wide * 0.55);
  // Three feather tips.
  ctx.quadraticCurveTo(-long * 1.08, -wide * 0.2, -long * 0.9, 0);
  ctx.quadraticCurveTo(-long * 1.04, wide * 0.4, -long * 0.82, wide * 0.5);
  ctx.quadraticCurveTo(-long * 0.9, wide * 1.05, -long * 0.62, wide * 0.95);
  ctx.quadraticCurveTo(-long * 0.25, wide * 1.25, 0.05, 0.04);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
  outline(ctx, 0.04);
  ctx.restore();
}

/**
 * The chick. wings is { left, right }, each how far up that wing is, from 0 to 1. pose is 'run', 'fly', 'wait',
 * 'tumble', 'splash', 'dizzy', 'sit' (on the hen's back or the duck's) or 'cheer'. time is the seconds gone, for
 * its legs, and turn how far it has rolled over, in radians. open spreads the feathers.
 */
export function drawChick(ctx, { wings = { left: 0, right: 0 }, pose = 'run', time = 0, turn = 0, look = CHICK_LOOKS[0], open = 0, moving = true } = {}) {
  ctx.save();
  if (turn) {
    ctx.translate(0, -0.38);
    ctx.rotate(turn);
    ctx.translate(0, 0.38);
  }
  const flying = pose === 'fly';
  const bob = pose === 'run' && moving ? Math.abs(Math.sin(time * 11)) * 0.03 : pose === 'wait' || pose === 'cheer' ? Math.abs(Math.sin(time * (pose === 'cheer' ? 7 : 3.2))) * (pose === 'cheer' ? 0.1 : 0.03) : 0;
  ctx.translate(0, -bob);

  // Legs: running, tucked up in the air, or folded under when sitting.
  if (pose !== 'sit' && pose !== 'splash') {
    ctx.strokeStyle = '#f08a24';
    ctx.lineWidth = 0.055;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [at, phase] of [[-0.09, 0], [0.09, Math.PI]]) {
      const swing = pose === 'run' && moving ? Math.sin(time * 11 + phase) * 0.16 : 0;
      const lift = flying || pose === 'tumble' ? 0.07 : pose === 'run' && moving ? Math.max(0, Math.cos(time * 11 + phase)) * 0.05 : 0;
      const foot = { x: at + swing + (flying ? -0.06 : 0), y: bob - lift };
      ctx.beginPath();
      ctx.moveTo(at, -0.12);
      ctx.lineTo(foot.x, foot.y - 0.02);
      ctx.moveTo(foot.x - 0.05, foot.y);
      ctx.lineTo(foot.x + 0.09, foot.y);
      ctx.stroke();
    }
  }

  // The far wing, behind the body: the left hand's. Up, it stands straight up behind the head, clear of the near one.
  wing(ctx, 0.1, -0.5, wings.left, look.far, { spread: open, raised: 1.6, long: 0.46 });
  // A little tail.
  ctx.beginPath();
  ctx.moveTo(-0.3, -0.42);
  ctx.lineTo(-0.5, -0.56);
  ctx.lineTo(-0.34, -0.26);
  ctx.closePath();
  ctx.fillStyle = look.wing;
  ctx.fill();
  outline(ctx, 0.04);
  // The body and the head, as one round shape.
  ctx.beginPath();
  ctx.moveTo(-0.36, -0.34);
  ctx.bezierCurveTo(-0.38, -0.62, -0.1, -0.66, 0, -0.62);
  ctx.bezierCurveTo(0.02, -0.86, 0.42, -0.86, 0.42, -0.6);
  ctx.bezierCurveTo(0.42, -0.5, 0.38, -0.46, 0.36, -0.42);
  ctx.bezierCurveTo(0.42, -0.1, 0.16, -0.04, 0, -0.04);
  ctx.bezierCurveTo(-0.2, -0.04, -0.36, -0.12, -0.36, -0.34);
  ctx.closePath();
  ctx.fillStyle = look.body;
  ctx.fill();
  outline(ctx);
  // Its pale tummy.
  ctx.beginPath();
  ctx.ellipse(0.06, -0.22, 0.2, 0.13, 0, 0, TAU);
  ctx.fillStyle = look.belly;
  ctx.fill();
  // A tuft on top.
  ctx.beginPath();
  ctx.moveTo(0.16, -0.8);
  ctx.quadraticCurveTo(0.1, -0.93, 0.02, -0.9);
  ctx.moveTo(0.2, -0.8);
  ctx.quadraticCurveTo(0.2, -0.95, 0.12, -0.97);
  ctx.strokeStyle = look.tuft;
  ctx.lineWidth = 0.05;
  ctx.lineCap = 'round';
  ctx.stroke();
  // The beak, open when it cheers or tumbles.
  const gape = pose === 'cheer' || pose === 'tumble' || pose === 'dizzy' || pose === 'splash' ? 0.05 : 0;
  ctx.beginPath();
  ctx.moveTo(0.4, -0.66 - gape);
  ctx.lineTo(0.56, -0.6 - gape * 0.4);
  ctx.lineTo(0.4, -0.57);
  ctx.closePath();
  ctx.fillStyle = '#ff9d1c';
  ctx.fill();
  outline(ctx, 0.035);
  if (gape) {
    ctx.beginPath();
    ctx.moveTo(0.4, -0.56);
    ctx.lineTo(0.52, -0.53);
    ctx.lineTo(0.4, -0.5);
    ctx.closePath();
    ctx.fillStyle = '#f08a24';
    ctx.fill();
    outline(ctx, 0.035);
  }
  // A rosy cheek and an eye: a dot, a happy arc, or a little cross when it's dizzy.
  ctx.beginPath();
  ctx.ellipse(0.25, -0.55, 0.06, 0.04, 0, 0, TAU);
  ctx.fillStyle = 'rgb(255 140 120 / 0.55)';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.04;
  ctx.lineCap = 'round';
  if (pose === 'dizzy' || pose === 'tumble') {
    ctx.beginPath();
    ctx.moveTo(0.22, -0.72);
    ctx.lineTo(0.32, -0.64);
    ctx.moveTo(0.32, -0.72);
    ctx.lineTo(0.22, -0.64);
    ctx.stroke();
  } else if (pose === 'cheer') {
    ctx.beginPath();
    ctx.arc(0.27, -0.66, 0.05, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  } else {
    // It blinks now and then.
    const blink = (time % 3.4) > 3.28;
    ctx.beginPath();
    if (blink) {
      ctx.moveTo(0.22, -0.68);
      ctx.lineTo(0.32, -0.68);
      ctx.stroke();
    } else {
      ctx.arc(0.27, -0.68, 0.05, 0, TAU);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0.285, -0.695, 0.017, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }
  // The near wing, in front: the right hand's. Up, it leans back a little.
  wing(ctx, -0.06, -0.4, wings.right, look.wing, { spread: open, raised: 1 });
  ctx.restore();
}

/**
 * The fox. pose is 'trot', 'sit' (puffing), 'crouch' (waiting on the track, drawn facing the other way by the
 * view), 'leap' or 'flat' (after a leap that missed). time is for his legs and tail.
 */
export function drawFox(ctx, { pose = 'trot', time = 0 } = {}) {
  const coat = '#f08a3c';
  const dark = '#8a4a1f';
  const cream = '#fff4e2';
  ctx.save();
  const sitting = pose === 'sit';
  const crouching = pose === 'crouch';
  const flat = pose === 'flat';
  const leaping = pose === 'leap';
  const bounce = pose === 'trot' ? Math.abs(Math.sin(time * 9)) * 0.04 : 0;
  ctx.translate(0, -bounce);
  if (leaping) ctx.rotate(-0.5);
  if (flat) {
    ctx.translate(0, 0.02);
    ctx.rotate(0.12);
  }

  // The tail: big, bushy, with a white tip, swishing.
  const sway = Math.sin(time * (crouching ? 5 : 3)) * (crouching ? 0.22 : 0.08);
  ctx.save();
  ctx.translate(sitting ? -0.34 : -0.5, sitting ? -0.14 : flat ? -0.3 : -0.56);
  ctx.rotate((sitting ? 0.18 : crouching ? -0.9 : flat ? 0.5 : -0.25) + sway);
  ctx.beginPath();
  ctx.moveTo(0.06, 0.06);
  ctx.bezierCurveTo(-0.2, 0.26, -0.72, 0.18, -0.86, -0.06);
  ctx.bezierCurveTo(-0.7, -0.22, -0.22, -0.26, 0.06, -0.08);
  ctx.closePath();
  ctx.fillStyle = coat;
  ctx.fill();
  outline(ctx);
  ctx.beginPath();
  ctx.moveTo(-0.6, 0.15);
  ctx.bezierCurveTo(-0.74, 0.14, -0.84, 0.04, -0.86, -0.06);
  ctx.bezierCurveTo(-0.8, -0.13, -0.7, -0.17, -0.6, -0.19);
  ctx.quadraticCurveTo(-0.5, -0.02, -0.6, 0.15);
  ctx.closePath();
  ctx.fillStyle = cream;
  ctx.fill();
  outline(ctx, 0.035);
  ctx.restore();

  // Legs: trotting, straight down in front when he sits, tucked under when he lies, stretched out in a leap.
  const legs = sitting ? [[0.2, 0], [0.32, 0]] : flat ? [] : [[-0.34, 0], [-0.2, Math.PI], [0.26, Math.PI], [0.4, 0]];
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.09;
  ctx.lineCap = 'round';
  for (const [at, phase] of legs) {
    const swing = pose === 'trot' ? Math.sin(time * 9 + phase) * 0.2 : leaping ? (at > 0 ? 0.3 : -0.3) : crouching ? (at > 0 ? 0.12 : -0.05) : 0;
    ctx.beginPath();
    ctx.moveTo(at, sitting ? -0.5 : crouching ? -0.22 : -0.34);
    ctx.lineTo(at + swing, bounce + (leaping ? -0.1 : 0));
    ctx.stroke();
  }

  // The body: long when he trots, low when he crouches, and sitting up on his haunches when he sits.
  if (sitting) {
    blob(ctx, -0.16, -0.27, 0.3, 0.27, coat);
    ctx.save();
    ctx.translate(0.04, -0.5);
    ctx.rotate(-1.05);
    blob(ctx, 0, 0, 0.42, 0.23, coat);
    ctx.beginPath();
    ctx.ellipse(0.02, 0.1, 0.3, 0.1, 0, 0, TAU);
    ctx.fillStyle = cream;
    ctx.fill();
    ctx.restore();
    // A hind foot, tucked in front of his haunch.
    ctx.strokeStyle = dark;
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.moveTo(-0.14, -0.04);
    ctx.lineTo(0.08, -0.04);
    ctx.stroke();
  } else {
    const low = crouching ? 0.12 : flat ? 0.22 : 0;
    blob(ctx, 0, -0.48 + low, 0.56, 0.23, coat);
    ctx.beginPath();
    ctx.ellipse(0.2, -0.4 + low, 0.3, 0.12, 0.1, 0, TAU);
    ctx.fillStyle = cream;
    ctx.fill();
  }

  // The head: pointed ears with dark tips, white cheeks, a long snout and a black nose.
  ctx.save();
  ctx.translate(sitting ? 0.24 : 0.56, sitting ? -0.96 : crouching ? -0.5 : flat ? -0.2 : -0.72);
  if (sitting) ctx.rotate(0.1);
  if (flat) ctx.rotate(0.35);
  for (const [x, lean] of [[-0.12, -0.25], [0.06, 0.12]]) {
    ctx.beginPath();
    ctx.moveTo(x - 0.09, -0.14);
    ctx.lineTo(x + lean * 0.3, -0.42);
    ctx.lineTo(x + 0.1, -0.16);
    ctx.closePath();
    ctx.fillStyle = coat;
    ctx.fill();
    outline(ctx, 0.04);
    ctx.beginPath();
    ctx.moveTo(x - 0.03, -0.3);
    ctx.lineTo(x + lean * 0.3, -0.42);
    ctx.lineTo(x + 0.045, -0.31);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(-0.24, -0.06);
  ctx.bezierCurveTo(-0.26, -0.26, 0.14, -0.3, 0.22, -0.1);
  ctx.lineTo(0.5, 0.04);
  ctx.bezierCurveTo(0.46, 0.14, 0.2, 0.2, 0.04, 0.2);
  ctx.bezierCurveTo(-0.14, 0.2, -0.24, 0.1, -0.24, -0.06);
  ctx.closePath();
  ctx.fillStyle = coat;
  ctx.fill();
  outline(ctx);
  ctx.beginPath();
  ctx.moveTo(-0.2, 0.04);
  ctx.bezierCurveTo(-0.06, 0.02, 0.1, 0.02, 0.48, 0.05);
  ctx.bezierCurveTo(0.44, 0.13, 0.2, 0.19, 0.04, 0.19);
  ctx.bezierCurveTo(-0.1, 0.19, -0.18, 0.13, -0.2, 0.04);
  ctx.closePath();
  ctx.fillStyle = cream;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0.49, 0.04, 0.045, 0, TAU);
  ctx.fillStyle = INK;
  ctx.fill();
  // His eye: narrowed and keen, shut tight when he's flat on his nose.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  if (flat) {
    ctx.moveTo(0.02, -0.1);
    ctx.lineTo(0.12, -0.04);
    ctx.moveTo(0.12, -0.1);
    ctx.lineTo(0.02, -0.04);
    ctx.stroke();
  } else {
    ctx.arc(0.08, -0.06, 0.045, 0, TAU);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -0.14);
    ctx.lineTo(0.16, -0.11);
    ctx.stroke();
  }
  // Puffing, with his tongue out, when he sits.
  if (sitting) {
    ctx.beginPath();
    ctx.moveTo(0.26, 0.15);
    ctx.quadraticCurveTo(0.3, 0.3 + Math.sin(time * 6) * 0.02, 0.36, 0.14);
    ctx.closePath();
    ctx.fillStyle = '#ff8fa3';
    ctx.fill();
    outline(ctx, 0.03);
  }
  ctx.restore();
  ctx.restore();
}

/** The mother hen, flying: plump and white, with a red comb, her wings beating. */
export function drawHen(ctx, { time = 0, flying = true } = {}) {
  const white = '#fffaf0';
  const shade = '#ecdcc0';
  const red = '#e5484d';
  ctx.save();
  const beat = flying ? Math.sin(time * 14) : 0;
  // Tail feathers.
  ctx.beginPath();
  ctx.moveTo(-0.42, -0.5);
  ctx.quadraticCurveTo(-0.86, -0.98, -0.7, -0.42);
  ctx.quadraticCurveTo(-0.94, -0.56, -0.62, -0.24);
  ctx.closePath();
  ctx.fillStyle = shade;
  ctx.fill();
  outline(ctx);
  // Legs.
  ctx.strokeStyle = '#f0a020';
  ctx.lineWidth = 0.06;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-0.1, -0.08);
  ctx.lineTo(-0.16, flying ? 0.08 : 0);
  ctx.moveTo(0.12, -0.08);
  ctx.lineTo(0.06, flying ? 0.08 : 0);
  ctx.stroke();
  // The far wing, then the body, then the near wing.
  ctx.save();
  ctx.translate(0.1, -0.62);
  ctx.rotate(0.5 + beat * 0.6);
  ctx.beginPath();
  ctx.ellipse(-0.3, 0, 0.36, 0.14, 0, 0, TAU);
  ctx.fillStyle = shade;
  ctx.fill();
  outline(ctx, 0.04);
  ctx.restore();
  blob(ctx, 0, -0.44, 0.52, 0.4, white);
  // The head, with her comb, her beak and her wattle.
  ctx.beginPath();
  ctx.moveTo(0.34, -0.96);
  ctx.quadraticCurveTo(0.36, -1.12, 0.44, -1);
  ctx.quadraticCurveTo(0.5, -1.14, 0.54, -0.98);
  ctx.quadraticCurveTo(0.62, -1.06, 0.6, -0.9);
  ctx.closePath();
  ctx.fillStyle = red;
  ctx.fill();
  outline(ctx, 0.035);
  blob(ctx, 0.46, -0.78, 0.2, 0.19, white);
  ctx.beginPath();
  ctx.moveTo(0.62, -0.82);
  ctx.lineTo(0.8, -0.76);
  ctx.lineTo(0.62, -0.7);
  ctx.closePath();
  ctx.fillStyle = '#ffb21c';
  ctx.fill();
  outline(ctx, 0.035);
  ctx.beginPath();
  ctx.ellipse(0.6, -0.62, 0.05, 0.08, 0, 0, TAU);
  ctx.fillStyle = red;
  ctx.fill();
  outline(ctx, 0.03);
  ctx.beginPath();
  ctx.arc(0.5, -0.82, 0.04, 0, TAU);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.save();
  ctx.translate(-0.06, -0.56);
  ctx.rotate(0.35 + beat * 0.75);
  ctx.beginPath();
  ctx.moveTo(0.06, 0);
  ctx.quadraticCurveTo(-0.3, -0.26, -0.62, -0.06);
  ctx.quadraticCurveTo(-0.56, 0.06, -0.44, 0.08);
  ctx.quadraticCurveTo(-0.3, 0.2, 0.06, 0.08);
  ctx.closePath();
  ctx.fillStyle = white;
  ctx.fill();
  outline(ctx, 0.04);
  ctx.restore();
  ctx.restore();
}

/** The duck, on the water: white, with an orange beak. Her feet are under the water, so the origin is the waterline. */
export function drawDuck(ctx, { time = 0, swimming = false } = {}) {
  ctx.save();
  ctx.translate(0, Math.sin(time * 2.4) * 0.015);
  ctx.beginPath();
  ctx.moveTo(-0.62, -0.2);
  ctx.quadraticCurveTo(-0.82, -0.44, -0.56, -0.34);
  ctx.bezierCurveTo(-0.3, -0.42, 0.2, -0.4, 0.42, -0.26);
  ctx.bezierCurveTo(0.5, -0.06, 0.3, 0.04, 0, 0.04);
  ctx.bezierCurveTo(-0.34, 0.04, -0.6, -0.02, -0.62, -0.2);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  outline(ctx);
  // Her neck and head.
  ctx.beginPath();
  ctx.moveTo(0.26, -0.28);
  ctx.bezierCurveTo(0.3, -0.5, 0.26, -0.62, 0.36, -0.72);
  ctx.bezierCurveTo(0.56, -0.84, 0.72, -0.62, 0.6, -0.52);
  ctx.bezierCurveTo(0.52, -0.46, 0.5, -0.34, 0.46, -0.24);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  outline(ctx);
  ctx.beginPath();
  ctx.moveTo(0.62, -0.66);
  ctx.quadraticCurveTo(0.86, -0.66, 0.86, -0.58);
  ctx.quadraticCurveTo(0.74, -0.52, 0.62, -0.55);
  ctx.closePath();
  ctx.fillStyle = '#ff9d1c';
  ctx.fill();
  outline(ctx, 0.035);
  ctx.beginPath();
  ctx.arc(0.5, -0.67, 0.035, 0, TAU);
  ctx.fillStyle = INK;
  ctx.fill();
  // A folded wing.
  ctx.beginPath();
  ctx.moveTo(-0.34, -0.26);
  ctx.quadraticCurveTo(-0.06, -0.36, 0.16, -0.22);
  ctx.quadraticCurveTo(-0.06, -0.08, -0.34, -0.26);
  ctx.closePath();
  ctx.fillStyle = '#eef3f8';
  ctx.fill();
  outline(ctx, 0.035);
  // The water she pushes aside as she swims.
  if (swimming) {
    ctx.strokeStyle = 'rgb(255 255 255 / 0.8)';
    ctx.lineWidth = 0.04;
    for (const out of [0.74, 0.92]) {
      ctx.beginPath();
      ctx.arc(-out + 0.1 + (Math.sin(time * 5 + out) * 0.03), 0.02, 0.12, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A piece of corn: a little cob in its green leaves. */
export function drawCorn(ctx, { time = 0, phase = 0 } = {}) {
  ctx.save();
  ctx.rotate(Math.sin(time * 2 + phase) * 0.12 + 0.35);
  ctx.beginPath();
  ctx.moveTo(-0.12, 0.2);
  ctx.quadraticCurveTo(-0.22, -0.04, -0.04, -0.06);
  ctx.lineTo(0.04, -0.06);
  ctx.quadraticCurveTo(0.22, -0.04, 0.12, 0.2);
  ctx.quadraticCurveTo(0, 0.28, -0.12, 0.2);
  ctx.closePath();
  ctx.fillStyle = '#6cc04a';
  ctx.fill();
  outline(ctx, 0.03);
  ctx.beginPath();
  ctx.ellipse(0, -0.02, 0.1, 0.2, 0, 0, TAU);
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  outline(ctx, 0.03);
  ctx.strokeStyle = 'rgb(217 154 31 / 0.8)';
  ctx.lineWidth = 0.018;
  ctx.beginPath();
  for (const y of [-0.12, -0.04, 0.04]) {
    ctx.moveTo(-0.08, y);
    ctx.lineTo(0.08, y);
  }
  ctx.moveTo(0, -0.2);
  ctx.lineTo(0, 0.1);
  ctx.stroke();
  ctx.restore();
}

export { clamp, mix, TAU };
