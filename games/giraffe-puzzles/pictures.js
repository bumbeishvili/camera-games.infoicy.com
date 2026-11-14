// The pictures in Giraffe's Puzzles, each drawn by the game itself: the games' own characters, fruit and places. No
// photos, and nothing fetched. A picture is 4 across for every 3 down, drawn here 800 by 600, and whoever draws it
// scales it to the frame. Every part of each one has something of its own in it, so a piece can be told from the
// others. With life, a number of seconds, the picture moves a little: that's a finished picture come to life.
import { INK } from '../../core/glove.js';
import { byId } from '../../core/body/roster.js';

export const PICTURE = { width: 800, height: 600 };
// Which characters each picture has in it, so their pictures can be drawn before it's wanted.
export const CAST = {
  meadow: ['giraffe'],
  stall: ['truffle'],
  lighthouse: [],
  balloons: ['mochi'],
  racer: ['kit'],
  picnic: ['frost', 'bramble', 'cinder'],
  ship: ['giraffe', 'tur'],
  rocket: ['nova'],
};
// What each picture is called, for anyone who can't see it.
export const NAMES = {
  meadow: 'Giraffe in the meadow',
  stall: 'The fruit stall',
  lighthouse: 'The lighthouse',
  balloons: 'Up in the sky',
  racer: 'The racing car',
  picnic: 'A picnic with friends',
  ship: 'The sailing ship',
  rocket: 'The rocket',
};

const W = PICTURE.width;
const H = PICTURE.height;
const TAU = Math.PI * 2;

/** Gently to and fro, for something that sways once a picture comes to life. Still at life 0. */
const sway = (life, rate = 1, phase = 0) => (life > 0 ? Math.sin(life * rate + phase) : 0);

function ink(ctx, width = 4) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function fillSky(ctx, top, bottom, to = H) {
  const sky = ctx.createLinearGradient(0, 0, 0, to);
  sky.addColorStop(0, top);
  sky.addColorStop(1, bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
}

function drawSun(ctx, x, y, r, turn = 0, colour = '#ffd23f') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn);
  ctx.fillStyle = '#ffe58a';
  for (let ray = 0; ray < 12; ray += 1) {
    ctx.rotate(TAU / 12);
    ctx.beginPath();
    ctx.moveTo(r * 1.18, -r * 0.16);
    ctx.lineTo(r * 1.62, 0);
    ctx.lineTo(r * 1.18, r * 0.16);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = colour;
  ctx.fill();
  ink(ctx, 4);
  // A friendly face.
  ctx.fillStyle = INK;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + side * r * 0.34, y - r * 0.12, r * 0.09, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y + r * 0.1, r * 0.4, 0.15 * Math.PI, 0.85 * Math.PI);
  ink(ctx, 4);
}

function drawCloud(ctx, x, y, size = 1, colour = '#ffffff') {
  ctx.fillStyle = colour;
  ctx.beginPath();
  for (const [dx, dy, r] of [[-52, 8, 30], [-18, -12, 40], [26, -4, 34], [58, 12, 24], [4, 16, 36]]) {
    ctx.moveTo(x + (dx + r) * size, y + dy * size);
    ctx.arc(x + dx * size, y + dy * size, r * size, 0, TAU);
  }
  ctx.fill();
}

/** Rolling ground from y down, with a wave along its top. */
function drawHills(ctx, y, rise, colour, phase = 0, waves = 2) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, y - Math.sin((x / W) * Math.PI * waves + phase) * rise);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

function drawFlower(ctx, x, y, size, colour, lean = 0) {
  const top = { x: x + lean * 18 * size, y: y - 58 * size };
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + lean * 6 * size, y - 30 * size, top.x, top.y);
  ctx.strokeStyle = '#3f9d3f';
  ctx.lineWidth = 6 * size;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.fillStyle = '#4fb04a';
  ctx.beginPath();
  ctx.ellipse(x + 12 * size, y - 22 * size, 14 * size, 6 * size, -0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = colour;
  for (let petal = 0; petal < 6; petal += 1) {
    const angle = (petal / 6) * TAU;
    ctx.beginPath();
    ctx.arc(top.x + Math.cos(angle) * 15 * size, top.y + Math.sin(angle) * 15 * size, 11 * size, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(top.x, top.y, 10 * size, 0, TAU);
  ctx.fill();
  ink(ctx, 2.5);
}

function drawTree(ctx, x, y, size, apples = true) {
  ctx.fillStyle = '#9a6a43';
  ctx.beginPath();
  ctx.moveTo(x - 20 * size, y);
  ctx.quadraticCurveTo(x - 10 * size, y - 80 * size, x - 16 * size, y - 150 * size);
  ctx.lineTo(x + 16 * size, y - 150 * size);
  ctx.quadraticCurveTo(x + 10 * size, y - 80 * size, x + 22 * size, y);
  ctx.closePath();
  ctx.fill();
  ink(ctx, 4);
  ctx.fillStyle = '#4fae4f';
  ctx.beginPath();
  for (const [dx, dy, r] of [[-62, -170, 56], [0, -214, 70], [64, -172, 58], [0, -150, 60]]) {
    ctx.moveTo(x + (dx + r) * size, y + dy * size);
    ctx.arc(x + dx * size, y + dy * size, r * size, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = '#6cc463';
  ctx.beginPath();
  for (const [dx, dy, r] of [[-56, -188, 30], [10, -238, 36], [58, -190, 28]]) {
    ctx.moveTo(x + (dx + r) * size, y + dy * size);
    ctx.arc(x + dx * size, y + dy * size, r * size, 0, TAU);
  }
  ctx.fill();
  if (!apples) return;
  ctx.fillStyle = '#e8433f';
  for (const [dx, dy] of [[-70, -150], [-24, -196], [36, -160], [74, -196], [6, -128]]) {
    ctx.beginPath();
    ctx.arc(x + dx * size, y + dy * size, 13 * size, 0, TAU);
    ctx.fill();
    ink(ctx, 2.5);
  }
}

function drawStar(ctx, x, y, r, colour = '#ffe066') {
  ctx.fillStyle = colour;
  ctx.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    const reach = point % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
  }
  ctx.closePath();
  ctx.fill();
}

function drawBalloon(ctx, x, y, r, colour, string = 0) {
  if (string > 0) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * 1.25);
    ctx.quadraticCurveTo(x + r * 0.3, y + r * 1.25 + string * 0.5, x, y + r * 1.25 + string);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 1.18, 0, 0, TAU);
  ctx.fill();
  ink(ctx, 3.5);
  ctx.beginPath();
  ctx.moveTo(x - r * 0.16, y + r * 1.14);
  ctx.lineTo(x + r * 0.16, y + r * 1.14);
  ctx.lineTo(x, y + r * 1.34);
  ctx.closePath();
  ctx.fill();
  ink(ctx, 2.5);
  ctx.fillStyle = 'rgb(255 255 255 / 0.6)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.36, y - r * 0.44, r * 0.2, r * 0.32, -0.5, 0, TAU);
  ctx.fill();
}

function drawBird(ctx, x, y, size, flap = 0) {
  ctx.beginPath();
  ctx.moveTo(x - 22 * size, y - 8 * size * (1 + flap));
  ctx.quadraticCurveTo(x - 10 * size, y - 14 * size, x, y);
  ctx.quadraticCurveTo(x + 10 * size, y - 14 * size, x + 22 * size, y - 8 * size * (1 + flap));
  ink(ctx, 4 * size);
}

function drawButterfly(ctx, x, y, size, flap, colour = '#ff8ac2') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.3);
  ctx.fillStyle = colour;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side * (0.55 + 0.45 * Math.abs(Math.cos(flap))), 1);
    ctx.beginPath();
    ctx.ellipse(16 * size, -10 * size, 16 * size, 20 * size, 0.4, 0, TAU);
    ctx.fill();
    ink(ctx, 2.5);
    ctx.beginPath();
    ctx.ellipse(13 * size, 14 * size, 11 * size, 13 * size, -0.3, 0, TAU);
    ctx.fill();
    ink(ctx, 2.5);
    ctx.restore();
  }
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(0, 0, 4 * size, 18 * size, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * One of the characters, standing with its feet at (x, y), its body tall pixels high without a long neck. Its
 * picture comes from its 3D model: art.friends[id] is { frames, foot, tall }. Without one, as when the 3D pictures
 * couldn't be drawn, it's a round friend in its own colour.
 */
function drawFriend(ctx, art, id, frame, x, y, tall, flip = false) {
  const picture = art?.friends?.[id];
  ctx.save();
  ctx.translate(x, y);
  if (picture) {
    const scale = tall / picture.tall;
    ctx.scale(flip ? -scale : scale, scale);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(picture.frames[frame] ?? picture.frames.stand, -picture.foot.x, -picture.foot.y);
  } else {
    const colour = byId(id)?.colours?.body ?? '#f2b34a';
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.ellipse(0, -tall * 0.34, tall * 0.26, tall * 0.34, 0, 0, TAU);
    ctx.fill();
    ink(ctx, 4);
    ctx.beginPath();
    ctx.arc(0, -tall * 0.8, tall * 0.24, 0, TAU);
    ctx.fill();
    ink(ctx, 4);
    ctx.fillStyle = INK;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * tall * 0.09, -tall * 0.82, tall * 0.03, 0, TAU);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, -tall * 0.76, tall * 0.09, 0.15 * Math.PI, 0.85 * Math.PI);
    ink(ctx, 3);
  }
  ctx.restore();
}

/** A fruit from core/fruit.js, size across, turned a little. Without its picture, a round one. */
function drawFruit(ctx, art, kind, x, y, size, turn = 0) {
  const picture = art?.fruit?.[kind];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn);
  if (picture) {
    ctx.drawImage(picture, -size * 0.6, -size * 0.6, size * 1.2, size * 1.2);
  } else {
    ctx.fillStyle = '#e8433f';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.45, 0, TAU);
    ctx.fill();
    ink(ctx, 4);
  }
  ctx.restore();
}

/* ---------- the pictures ---------- */

function meadow(ctx, life, art) {
  fillSky(ctx, '#6fc1ff', '#dff3ff', 440);
  drawSun(ctx, 122, 112, 56, life * 0.25);
  drawCloud(ctx, 372 + sway(life, 0.5) * 14, 92, 1);
  drawCloud(ctx, 500 + sway(life, 0.4, 2) * 12, 212, 0.62);
  drawBird(ctx, 300, 190, 0.9, sway(life, 6) * 0.5);
  drawBird(ctx, 250, 236, 0.6, sway(life, 6, 1) * 0.5);
  drawHills(ctx, 356, 34, '#b7e39a', 0.6, 3);
  drawHills(ctx, 438, 26, '#86cf62', 2.4, 2);
  // A path winding away.
  ctx.fillStyle = '#f2dca6';
  ctx.beginPath();
  ctx.moveTo(300, H);
  ctx.quadraticCurveTo(420, 520, 368, 452);
  ctx.quadraticCurveTo(350, 430, 372, 416);
  ctx.lineTo(388, 418);
  ctx.quadraticCurveTo(376, 436, 404, 458);
  ctx.quadraticCurveTo(520, 520, 470, H);
  ctx.closePath();
  ctx.fill();
  drawTree(ctx, 196, 500, 1.02);
  drawFlower(ctx, 62, 574, 1, '#ff8ac2', sway(life, 1.6));
  drawFlower(ctx, 318, 566, 0.9, '#ffffff', sway(life, 1.6, 1));
  drawFlower(ctx, 452, 584, 1, '#b197fc', sway(life, 1.6, 2));
  drawFlower(ctx, 112, 592, 0.8, '#ffa94d', sway(life, 1.6, 3));
  drawButterfly(ctx, 438 + sway(life, 1.1) * 16, 318 + sway(life, 1.7) * 10, 1.1, life * 7);
  const frame = life > 0 ? (Math.floor(life * 1.5) % 2 ? 'wave' : 'cheer') : 'wave';
  drawFriend(ctx, art, 'giraffe', frame, 618, 592, 318);
}

function stall(ctx, life, art) {
  fillSky(ctx, '#8fd3ff', '#eaf8ff', 420);
  drawCloud(ctx, 104, 250, 0.6);
  drawCloud(ctx, 700, 270, 0.7);
  drawHills(ctx, 420, 20, '#8ed26b', 1, 2);
  // The poles, and whoever is selling, behind the counter.
  ctx.fillStyle = '#b98252';
  for (const x of [58, 716]) {
    ctx.beginPath();
    ctx.rect(x, 150, 26, 300);
    ctx.fill();
    ink(ctx, 4);
  }
  drawFriend(ctx, art, 'truffle', life > 0 && Math.floor(life * 1.4) % 2 ? 'cheer' : 'stand', 400, 524, 280);
  // The counter, of planks.
  ctx.fillStyle = '#d99b58';
  ctx.beginPath();
  ctx.rect(36, 408, 728, 192);
  ctx.fill();
  ink(ctx, 4);
  ctx.strokeStyle = '#b9793c';
  ctx.lineWidth = 3;
  for (const x of [158, 280, 402, 524, 646]) {
    ctx.beginPath();
    ctx.moveTo(x, 440);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.fillStyle = '#f3c183';
  ctx.beginPath();
  ctx.roundRect(18, 392, 764, 40, 10);
  ctx.fill();
  ink(ctx, 4);
  // A board on the front of it, with a glass on it.
  ctx.fillStyle = '#fff7df';
  ctx.beginPath();
  ctx.roundRect(318, 462, 164, 116, 14);
  ctx.fill();
  ink(ctx, 4);
  ctx.fillStyle = '#ff8fb3';
  ctx.beginPath();
  ctx.moveTo(372, 492);
  ctx.lineTo(428, 492);
  ctx.lineTo(418, 562);
  ctx.lineTo(382, 562);
  ctx.closePath();
  ctx.fill();
  ink(ctx, 3.5);
  ctx.beginPath();
  ctx.moveTo(410, 500);
  ctx.lineTo(432, 470);
  ctx.strokeStyle = '#3aa0e6';
  ctx.lineWidth = 6;
  ctx.stroke();
  // The fruit, along the counter.
  const row = [['apple', 84], ['orange', 176], ['pear', 266], ['banana', 536], ['plum', 626], ['mango', 716]];
  row.forEach(([kind, x], at) => drawFruit(ctx, art, kind, x, 352 - Math.max(0, sway(life, 3, at * 0.9)) * 14, 92, at % 2 ? 0.12 : -0.1));
  // The awning, in stripes, with a scalloped edge.
  const stripes = 8;
  const wide = 760 / stripes;
  for (let stripe = 0; stripe < stripes; stripe += 1) {
    const x = 20 + stripe * wide;
    ctx.fillStyle = stripe % 2 ? '#ffffff' : '#ff6b5e';
    ctx.beginPath();
    ctx.moveTo(x, 44);
    ctx.lineTo(x + wide, 44);
    ctx.lineTo(x + wide, 150);
    ctx.arc(x + wide / 2, 150, wide / 2, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ink(ctx, 3.5);
  }
  ctx.fillStyle = '#e2493d';
  ctx.beginPath();
  ctx.roundRect(8, 26, 784, 30, 12);
  ctx.fill();
  ink(ctx, 4);
  // Little flags, and a lantern, under the awning.
  const flags = ['#ffd23f', '#4dabf7', '#69db7c', '#f783ac', '#ffa94d'];
  flags.forEach((colour, at) => {
    const x = 150 + at * 104;
    const y = 226 + Math.sin((at / 4) * Math.PI) * 20 + sway(life, 2, at) * 4;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(x - 20, y);
    ctx.lineTo(x + 20, y);
    ctx.lineTo(x, y + 36);
    ctx.closePath();
    ctx.fill();
    ink(ctx, 3);
  });
}

function lighthouse(ctx, life) {
  fillSky(ctx, '#3d4f9e', '#ffb98f', 372);
  // Stars high up, and the sun going down.
  const stars = [[60, 52, 7], [168, 96, 5], [436, 44, 6], [540, 110, 5], [668, 58, 8], [744, 152, 5], [330, 132, 4]];
  stars.forEach(([x, y, r], at) => drawStar(ctx, x, y, r * (1 + 0.15 * sway(life, 1.2, at)), '#fff3b0'));
  ctx.fillStyle = '#ffd98a';
  ctx.beginPath();
  ctx.arc(604, 372, 74, Math.PI, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffe9bd';
  ctx.beginPath();
  ctx.arc(604, 372, 50, Math.PI, TAU);
  ctx.fill();
  drawCloud(ctx, 452, 250, 0.7, '#ffd9c2');
  drawCloud(ctx, 740, 232, 0.5, '#ffd9c2');
  // The light, sweeping slowly.
  ctx.save();
  ctx.translate(196, 150);
  ctx.rotate(-0.2 + sway(life, 0.6) * 0.22);
  const beam = ctx.createLinearGradient(0, 0, 520, 0);
  beam.addColorStop(0, 'rgb(255 244 180 / 0.85)');
  beam.addColorStop(1, 'rgb(255 244 180 / 0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(520, -92);
  ctx.lineTo(520, 92);
  ctx.lineTo(0, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // The sea.
  const sea = ctx.createLinearGradient(0, 372, 0, H);
  sea.addColorStop(0, '#3f8fd0');
  sea.addColorStop(1, '#1f5e9c');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 372, W, H - 372);
  ctx.strokeStyle = 'rgb(255 255 255 / 0.6)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const [x, y, wide] of [[330, 410, 70], [520, 436, 90], [690, 404, 60], [380, 500, 110], [610, 540, 90], [300, 566, 70], [720, 480, 50]]) {
    const shift = sway(life, 1.3, y) * 10;
    ctx.beginPath();
    ctx.moveTo(x + shift, y);
    ctx.quadraticCurveTo(x + shift + wide / 2, y - 12, x + shift + wide, y);
    ctx.stroke();
  }
  // The little boat.
  ctx.save();
  ctx.translate(606, 470);
  ctx.rotate(sway(life, 1.5) * 0.06);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(4, -112);
  ctx.lineTo(4, -16);
  ctx.lineTo(72, -16);
  ctx.closePath();
  ctx.fill();
  ink(ctx, 4);
  ctx.fillStyle = '#ff8a5c';
  ctx.beginPath();
  ctx.moveTo(-6, -98);
  ctx.lineTo(-6, -16);
  ctx.lineTo(-54, -16);
  ctx.closePath();
  ctx.fill();
  ink(ctx, 4);
  ctx.fillStyle = '#b5683a';
  ctx.beginPath();
  ctx.moveTo(-84, -10);
  ctx.lineTo(96, -10);
  ctx.quadraticCurveTo(74, 34, 40, 34);
  ctx.lineTo(-44, 34);
  ctx.quadraticCurveTo(-72, 30, -84, -10);
  ctx.closePath();
  ctx.fill();
  ink(ctx, 4);
  ctx.restore();
  // The rock, and the lighthouse on it.
  ctx.fillStyle = '#7d8794';
  ctx.beginPath();
  ctx.moveTo(-10, H);
  ctx.lineTo(-10, 470);
  ctx.quadraticCurveTo(60, 398, 150, 420);
  ctx.quadraticCurveTo(250, 400, 300, 470);
  ctx.quadraticCurveTo(360, 520, 372, H);
  ctx.closePath();
  ctx.fill();
  ink(ctx, 4);
  ctx.fillStyle = '#69727f';
  ctx.beginPath();
  ctx.ellipse(110, 520, 46, 18, 0.2, 0, TAU);
  ctx.ellipse(262, 546, 38, 14, -0.2, 0, TAU);
  ctx.fill();
  const tower = (top, bottom, y0, y1, colour) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(196 - top, y0);
    ctx.lineTo(196 + top, y0);
    ctx.lineTo(196 + bottom, y1);
    ctx.lineTo(196 - bottom, y1);
    ctx.closePath();
    ctx.fill();
    ink(ctx, 4);
  };
  const widthAt = (y) => 40 + ((y - 190) / 240) * 26;
  [[190, 250, '#ffffff'], [250, 310, '#ff6b5e'], [310, 370, '#ffffff'], [370, 430, '#ff6b5e']].forEach(([y0, y1, colour]) => tower(widthAt(y0), widthAt(y1), y0, y1, colour));
  ctx.fillStyle = '#12304d';
  ctx.beginPath();
  ctx.roundRect(180, 372, 32, 58, [16, 16, 0, 0]);
  ctx.fill();
  ctx.fillStyle = '#5b6470';
  ctx.beginPath();
  ctx.roundRect(140, 176, 112, 18, 6);
  ctx.fill();
  ink(ctx, 4);
  ctx.fillStyle = '#fff2a8';
  ctx.beginPath();
  ctx.rect(160, 120, 72, 56);
  ctx.fill();
  ink(ctx, 4);
  ctx.beginPath();
  ctx.moveTo(184, 120);
  ctx.lineTo(184, 176);
  ctx.moveTo(208, 120);
  ctx.lineTo(208, 176);
  ink(ctx, 3);
  ctx.fillStyle = '#e2493d';
  ctx.beginPath();
  ctx.moveTo(146, 122);
  ctx.lineTo(196, 72);
  ctx.lineTo(246, 122);
  ctx.closePath();
  ctx.fill();
  ink(ctx, 4);
  drawBird(ctx, 420 + sway(life, 0.8) * 20, 330, 0.8, sway(life, 6) * 0.5);
  drawBird(ctx, 700, 318 + sway(life, 0.9, 1) * 8, 0.6, sway(life, 6, 2) * 0.5);
}

function balloons(ctx, life, art) {
  fillSky(ctx, '#63bcff', '#e8f8ff');
  drawSun(ctx, 690, 96, 46, -life * 0.25);
  drawCloud(ctx, 150 + sway(life, 0.4) * 12, 520, 0.9);
  drawCloud(ctx, 560, 470, 0.7);
  drawCloud(ctx, 356, 76, 0.55);
  drawHills(ctx, 566, 18, '#9ad977', 0.4, 3);
  // Balloons all over, each a colour of its own.
  const loose = [[92, 112, 44, '#ff6b5e'], [236, 230, 36, '#ffd23f'], [118, 356, 34, '#69db7c'], [560, 250, 40, '#b197fc'], [712, 330, 38, '#ffa94d'], [640, 548, 30, '#f783ac'], [470, 96, 32, '#4dabf7']];
  loose.forEach(([x, y, r, colour], at) => drawBalloon(ctx, x, y + sway(life, 1.2, at * 1.7) * 10, r, colour, r * 1.5));
  // Three more, holding up a basket with a friend in it.
  const up = sway(life, 1) * 8;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  for (const [x, y] of [[322, 236], [392, 196], [462, 240]]) {
    ctx.beginPath();
    ctx.moveTo(x, y + up + 44);
    ctx.lineTo(392 + (x - 392) * 0.36, 392 + up);
    ctx.stroke();
  }
  drawBalloon(ctx, 322, 236 + up, 44, '#ff8ac2');
  drawBalloon(ctx, 462, 240 + up, 44, '#4dabf7');
  drawBalloon(ctx, 392, 196 + up, 50, '#ffd23f');
  drawFriend(ctx, art, 'mochi', life > 0 && Math.floor(life * 1.4) % 2 ? 'cheer' : 'stand', 392, 486 + up, 170);
  ctx.fillStyle = '#c98d4f';
  ctx.beginPath();
  ctx.moveTo(326, 420 + up);
  ctx.lineTo(458, 420 + up);
  ctx.lineTo(444, 512 + up);
  ctx.lineTo(340, 512 + up);
  ctx.closePath();
  ctx.fill();
  ink(ctx, 4);
  ctx.strokeStyle = '#a56c35';
  ctx.lineWidth = 3;
  for (const y of [446, 470, 492]) {
    ctx.beginPath();
    ctx.moveTo(332 + (y - 420) * 0.15, y + up);
    ctx.lineTo(452 - (y - 420) * 0.15, y + up);
    ctx.stroke();
  }
  ctx.fillStyle = '#e0a868';
  ctx.beginPath();
  ctx.roundRect(316, 408 + up, 152, 22, 10);
  ctx.fill();
  ink(ctx, 4);
}

function racer(ctx, life, art) {
  fillSky(ctx, '#7cc8ff', '#e3f5ff', 380);
  drawCloud(ctx, 150 - sway(life, 0.5) * 16, 86, 0.8);
  drawCloud(ctx, 480 - sway(life, 0.5, 1) * 16, 150, 0.6);
  drawHills(ctx, 330, 30, '#b7e39a', 2, 3);
  drawTree(ctx, 86, 400, 0.7, false);
  drawTree(ctx, 330, 372, 0.52, false);
  drawHills(ctx, 400, 8, '#86cf62', 0, 1);
  // The chequered flag.
  ctx.fillStyle = '#8a5a34';
  ctx.beginPath();
  ctx.rect(690, 96, 12, 310);
  ctx.fill();
  ink(ctx, 3.5);
  const wave = sway(life, 3) * 8;
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      ctx.fillStyle = (row + col) % 2 ? '#ffffff' : '#27313d';
      ctx.fillRect(590 + col * 20, 100 + row * 20 + Math.sin(col * 0.9) * wave, 20, 20);
    }
  }
  ctx.beginPath();
  ctx.rect(590, 100, 100, 80);
  ink(ctx, 3.5);
  // The road.
  ctx.fillStyle = '#6f7b8a';
  ctx.fillRect(0, 430, W, 170);
  ctx.fillStyle = '#ffffff';
  for (let dash = 0; dash < 6; dash += 1) ctx.fillRect(((dash * 150 - (life * 120) % 150) + 900) % 900 - 60, 548, 84, 14);
  ctx.fillStyle = '#e2493d';
  for (let stripe = 0; stripe < 14; stripe += 1) {
    ctx.fillStyle = stripe % 2 ? '#ffffff' : '#e2493d';
    ctx.fillRect(stripe * 60, 418, 60, 16);
  }
  // A big hand by the road, to high five.
  ctx.fillStyle = '#8a5a34';
  ctx.beginPath();
  ctx.rect(498, 262, 12, 160);
  ctx.fill();
  ink(ctx, 3.5);
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineWidth = 26;
  ctx.beginPath();
  for (const [x, top] of [[474, 196], [494, 178], [514, 178], [534, 196]]) {
    ctx.moveTo(x, 250);
    ctx.lineTo(x, top);
  }
  ctx.moveTo(548, 262);
  ctx.lineTo(576, 232);
  ctx.stroke();
  ctx.fillStyle = '#3ddc84';
  ctx.beginPath();
  ctx.roundRect(458, 230, 92, 70, 22);
  ctx.fill();
  ink(ctx, 4);
  ctx.strokeStyle = '#3ddc84';
  ctx.lineWidth = 18;
  ctx.beginPath();
  for (const [x, top] of [[474, 196], [494, 178], [514, 178], [534, 196]]) {
    ctx.moveTo(x, 250);
    ctx.lineTo(x, top);
  }
  ctx.moveTo(548, 262);
  ctx.lineTo(576, 232);
  ctx.stroke();
  // The car, with a friend at the wheel.
  const bounce = sway(life, 9) * 2;
  ctx.save();
  ctx.translate(0, bounce);
  drawFriend(ctx, art, 'kit', 'stand', 286, 520, 150);
  ctx.fillStyle = '#e8433f';
  ctx.beginPath();
  ctx.moveTo(70, 500);
  ctx.quadraticCurveTo(64, 430, 150, 424);
  ctx.lineTo(196, 424);
  ctx.quadraticCurveTo(204, 462, 244, 462);
  ctx.lineTo(332, 462);
  ctx.quadraticCurveTo(366, 462, 376, 424);
  ctx.lineTo(430, 430);
  ctx.quadraticCurveTo(520, 440, 522, 500);
  ctx.quadraticCurveTo(522, 528, 494, 528);
  ctx.lineTo(96, 528);
  ctx.quadraticCurveTo(70, 528, 70, 500);
  ctx.closePath();
  ctx.fill();
  ink(ctx, 5);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.roundRect(496, 468, 22, 18, 6);
  ctx.fill();
  ink(ctx, 3);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(292, 500, 20, 0, TAU);
  ctx.fill();
  ink(ctx, 3.5);
  ctx.fillStyle = INK;
  ctx.font = '700 26px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('5', 292, 502);
  for (const x of [156, 430]) {
    ctx.save();
    ctx.translate(x, 530);
    ctx.rotate(life * 6);
    ctx.fillStyle = '#27313d';
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, TAU);
    ctx.fill();
    ink(ctx, 4);
    ctx.fillStyle = '#d7dee6';
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#27313d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let spoke = 0; spoke < 3; spoke += 1) {
      const angle = (spoke / 3) * Math.PI;
      ctx.moveTo(Math.cos(angle) * 20, Math.sin(angle) * 20);
      ctx.lineTo(-Math.cos(angle) * 20, -Math.sin(angle) * 20);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function picnic(ctx, life, art) {
  fillSky(ctx, '#85cdff', '#e6f7ff', 300);
  drawSun(ctx, 676, 92, 50, life * 0.25);
  drawCloud(ctx, 420 + sway(life, 0.4) * 14, 70, 0.7);
  drawHills(ctx, 286, 30, '#b7e39a', 1.4, 3);
  drawHills(ctx, 340, 16, '#86cf62', 0.2, 2);
  drawTree(ctx, 118, 372, 0.94);
  // The friends, behind the blanket.
  const turn = Math.floor(life * 1.3) % 3;
  drawFriend(ctx, art, 'frost', life > 0 && turn === 0 ? 'cheer' : 'stand', 300, 470, 170);
  drawFriend(ctx, art, 'bramble', life > 0 && turn === 1 ? 'cheer' : 'stand', 478, 456, 190);
  drawFriend(ctx, art, 'cinder', life > 0 && turn === 2 ? 'cheer' : 'stand', 656, 476, 165);
  // The blanket, in squares.
  const blanket = [[150, 462], [690, 462], [770, 590], [70, 590]];
  ctx.save();
  ctx.beginPath();
  blanket.forEach(([x, y], at) => (at ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#ff6b5e';
  for (let row = 0; row < 4; row += 1) {
    const y0 = 462 + row * 32;
    const left = 150 - (row * 32 * 80) / 128;
    const wide = (690 - 150 + (row * 32 * 160) / 128) / 8;
    for (let col = row % 2; col < 9; col += 2) ctx.fillRect(left + col * wide, y0, wide, 32);
  }
  ctx.restore();
  ctx.beginPath();
  blanket.forEach(([x, y], at) => (at ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ink(ctx, 4);
  // A basket, and fruit to share.
  ctx.fillStyle = '#c98d4f';
  ctx.beginPath();
  ctx.roundRect(182, 500, 120, 68, 14);
  ctx.fill();
  ink(ctx, 4);
  ctx.beginPath();
  ctx.arc(242, 502, 52, Math.PI, TAU);
  ink(ctx, 7);
  ctx.strokeStyle = '#a56c35';
  ctx.lineWidth = 3;
  for (const y of [522, 544]) {
    ctx.beginPath();
    ctx.moveTo(188, y);
    ctx.lineTo(296, y);
    ctx.stroke();
  }
  drawFruit(ctx, art, 'apple', 392, 540, 62, -0.1);
  drawFruit(ctx, art, 'pear', 470, 528, 66, 0.1);
  drawFruit(ctx, art, 'banana', 566, 548, 74, 0.2);
  drawFruit(ctx, art, 'orange', 650, 532, 58);
  drawFlower(ctx, 44, 470, 0.7, '#ffd23f', sway(life, 1.6));
  drawFlower(ctx, 748, 452, 0.7, '#ff8ac2', sway(life, 1.6, 2));
  drawButterfly(ctx, 566 + sway(life, 1) * 14, 216 + sway(life, 1.6) * 8, 0.9, life * 7, '#ffd23f');
}

function ship(ctx, life, art) {
  fillSky(ctx, '#74c6ff', '#e8f8ff', 400);
  drawSun(ctx, 98, 92, 46, life * 0.25);
  drawCloud(ctx, 660 + sway(life, 0.4) * 14, 84, 0.8);
  drawCloud(ctx, 300, 60, 0.5);
  drawBird(ctx, 560, 200, 0.8, sway(life, 6) * 0.5);
  // The island, with a palm tree.
  ctx.fillStyle = '#f2dca6';
  ctx.beginPath();
  ctx.ellipse(110, 424, 130, 46, 0, Math.PI, TAU);
  ctx.fill();
  ink(ctx, 4);
  ctx.beginPath();
  ctx.moveTo(96, 392);
  ctx.quadraticCurveTo(84, 320, 118, 262);
  ctx.strokeStyle = '#9a6a43';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.fillStyle = '#4fae4f';
  for (const angle of [-2.6, -2, -1.2, -0.5, 0.1]) {
    ctx.save();
    ctx.translate(118, 262);
    ctx.rotate(angle + sway(life, 1.4, angle) * 0.06);
    ctx.beginPath();
    ctx.ellipse(46, 0, 50, 14, 0, 0, TAU);
    ctx.fill();
    ink(ctx, 3);
    ctx.restore();
  }
  // The sea, in bands.
  const bands = [[400, '#4aa8e0'], [460, '#3d97d4'], [526, '#2f86c6']];
  bands.forEach(([y, colour], at) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, y + Math.sin(x / 46 + at * 2 + life * 1.4) * 7);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  });
  // The ship, rocking a little.
  ctx.save();
  ctx.translate(450, 470);
  ctx.rotate(sway(life, 1.3) * 0.04);
  // Masts and sails.
  ctx.fillStyle = '#8a5a34';
  for (const x of [-70, 70]) {
    ctx.beginPath();
    ctx.rect(x - 6, -330, 12, 290);
    ctx.fill();
    ink(ctx, 3.5);
  }
  const sail = (x, y, wide, tall) => {
    ctx.fillStyle = '#fff7e0';
    ctx.beginPath();
    ctx.moveTo(x - wide / 2, y);
    ctx.quadraticCurveTo(x, y + 12, x + wide / 2, y);
    ctx.quadraticCurveTo(x + wide / 2 + 22, y + tall / 2, x + wide / 2, y + tall);
    ctx.quadraticCurveTo(x, y + tall - 12, x - wide / 2, y + tall);
    ctx.quadraticCurveTo(x - wide / 2 + 20, y + tall / 2, x - wide / 2, y);
    ctx.closePath();
    ctx.fill();
    ink(ctx, 4);
  };
  sail(-70, -300, 130, 104);
  sail(-70, -182, 156, 116);
  sail(70, -278, 120, 96);
  sail(70, -168, 144, 106);
  ctx.fillStyle = '#ff6b5e';
  ctx.beginPath();
  ctx.moveTo(-64, -330);
  ctx.lineTo(-10 + sway(life, 3) * 6, -346);
  ctx.lineTo(-64, -362);
  ctx.closePath();
  ctx.fill();
  ink(ctx, 3);
  // Whoever is sailing her, looking over the side.
  ctx.restore();
  ctx.save();
  ctx.translate(450, 470);
  ctx.rotate(sway(life, 1.3) * 0.04);
  drawFriend(ctx, art, 'tur', 'stand', 206, 34, 170);
  drawFriend(ctx, art, 'giraffe', life > 0 && Math.floor(life * 1.4) % 2 ? 'cheer' : 'stand', -214, 30, 150);
  // The hull.
  ctx.fillStyle = '#b5683a';
  ctx.beginPath();
  ctx.moveTo(-290, -52);
  ctx.lineTo(300, -52);
  ctx.quadraticCurveTo(278, 54, 190, 66);
  ctx.lineTo(-170, 66);
  ctx.quadraticCurveTo(-262, 50, -290, -52);
  ctx.closePath();
  ctx.fill();
  ink(ctx, 5);
  ctx.fillStyle = '#d98a52';
  ctx.beginPath();
  ctx.roundRect(-300, -66, 610, 24, 8);
  ctx.fill();
  ink(ctx, 4);
  ctx.fillStyle = '#ffd23f';
  for (const x of [-150, -50, 50, 150]) {
    ctx.beginPath();
    ctx.arc(x, 4, 17, 0, TAU);
    ctx.fill();
    ink(ctx, 3.5);
  }
  ctx.restore();
  // The nearest waves, in front of her.
  ctx.fillStyle = '#2573b3';
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 566 + Math.sin(x / 40 + 4 - life * 1.6) * 8);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

function rocket(ctx, life, art) {
  fillSky(ctx, '#1d2260', '#5a3f9e');
  const stars = [[70, 300, 7], [150, 470, 5], [260, 80, 6], [350, 240, 4], [596, 70, 7], [700, 170, 5], [746, 330, 6], [520, 520, 5], [90, 560, 4], [640, 440, 4], [330, 540, 6], [470, 150, 4]];
  stars.forEach(([x, y, r], at) => drawStar(ctx, x, y, r * (1 + 0.2 * sway(life, 1.4, at)), at % 3 ? '#fff3b0' : '#bfe6ff'));
  // The moon.
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(128, 126, 78, 0, TAU);
  ctx.fill();
  ink(ctx, 4);
  ctx.fillStyle = '#eadb9c';
  for (const [x, y, r] of [[100, 100, 18], [158, 152, 13], [146, 88, 9], [92, 160, 10]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  // A planet with a ring.
  ctx.save();
  ctx.translate(664, 494);
  ctx.rotate(-0.35);
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.ellipse(0, 0, 110, 26, 0, Math.PI, TAU);
  ctx.stroke();
  ctx.fillStyle = '#ff8a5c';
  ctx.beginPath();
  ctx.arc(0, 0, 62, 0, TAU);
  ctx.fill();
  ink(ctx, 4);
  ctx.fillStyle = '#ffb38a';
  ctx.beginPath();
  ctx.ellipse(-8, -22, 44, 9, 0, 0, TAU);
  ctx.ellipse(10, 18, 40, 8, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.ellipse(0, 0, 110, 26, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
  // The rocket, with a friend at the window.
  ctx.save();
  ctx.translate(410 + sway(life, 1.1) * 6, 300 + sway(life, 1.7) * 8);
  ctx.rotate(0.42);
  const flame = 1 + 0.12 * sway(life, 9);
  ctx.fillStyle = '#ff8a3c';
  ctx.beginPath();
  ctx.moveTo(-40, 150);
  ctx.quadraticCurveTo(0, 150 + 150 * flame, 40, 150);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(-22, 150);
  ctx.quadraticCurveTo(0, 150 + 90 * flame, 22, 150);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8433f';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 66, 60);
    ctx.lineTo(side * 128, 168);
    ctx.lineTo(side * 62, 148);
    ctx.closePath();
    ctx.fill();
    ink(ctx, 4);
  }
  ctx.fillStyle = '#f4f7fb';
  ctx.beginPath();
  ctx.moveTo(0, -196);
  ctx.bezierCurveTo(96, -110, 92, 70, 62, 156);
  ctx.lineTo(-62, 156);
  ctx.bezierCurveTo(-92, 70, -96, -110, 0, -196);
  ctx.closePath();
  ctx.fill();
  ink(ctx, 5);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#e8433f';
  ctx.fillRect(-100, -200, 200, 86);
  ctx.fillStyle = '#c9d4e0';
  ctx.fillRect(-100, 112, 200, 16);
  ctx.restore();
  // The window, with the pilot's face in it.
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, -22, 52, 0, TAU);
  ctx.fillStyle = '#9fdcff';
  ctx.fill();
  ctx.clip();
  ctx.rotate(-0.42);
  drawFriend(ctx, art, 'nova', 'stand', 0, 124, 190);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, -22, 52, 0, TAU);
  ctx.strokeStyle = '#5b6b7d';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -22, 57, 0, TAU);
  ink(ctx, 3.5);
  ctx.restore();
}

const DRAW = { meadow, stall, lighthouse, balloons, racer, picnic, ship, rocket };

/**
 * Draws a picture by name, 800 by 600, onto ctx as it's scaled. life is how many seconds it has been alive, or 0 for
 * the still picture the pieces are cut from. art is { friends, fruit }: the characters' pictures and the fruit's.
 */
export function drawPicture(ctx, name, { life = 0, art = null } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  (DRAW[name] ?? meadow)(ctx, life, art);
  ctx.restore();
}
