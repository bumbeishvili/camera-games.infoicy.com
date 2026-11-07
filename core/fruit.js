// Fruit, drawn with no image files, for the hand games that have it.
import { INK } from './glove.js';

export const LOOKS = {
  apple: { skin: '#e8433f', flesh: '#fff3c9' },
  orange: { skin: '#ff9a1f', flesh: '#ffd27a' },
  banana: { skin: '#ffd93b', flesh: '#fff6c2' },
  pear: { skin: '#a8d84a', flesh: '#f6f7c8' },
  plum: { skin: '#7b3fa8', flesh: '#e2b45e' },
  peach: { skin: '#ffae8a', flesh: '#ffd9a0' },
  fig: { skin: '#6a3f8f', flesh: '#e8819a' },
  mango: { skin: '#ffb732', flesh: '#ffd97a' },
  rotten: { skin: '#6d5a44', flesh: '#4a3d2c' },
};

/** Draws a fruit about 200 across, centred. It's drawn once for each, as canvas paths are slow. */
export function paintFruit(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  ctx.translate(120, 120);
  const { skin } = LOOKS[kind];
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.fillStyle = skin;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const shine = (x, y, rx, ry) => {
    ctx.fillStyle = 'rgb(255 255 255 / 0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, -0.5, 0, Math.PI * 2);
    ctx.fill();
  };
  const leaf = (x, y) => {
    ctx.fillStyle = '#3f9d3f';
    ctx.beginPath();
    ctx.ellipse(x, y, 24, 11, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };
  const stem = (x, y) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 2, y - 18, x + 10, y - 28);
    ctx.stroke();
  };
  ctx.beginPath();
  if (kind === 'banana') {
    ctx.moveTo(-88, -46);
    ctx.quadraticCurveTo(-60, 74, 84, 58);
    ctx.quadraticCurveTo(100, 50, 92, 36);
    ctx.quadraticCurveTo(-8, 34, -56, -66);
    ctx.quadraticCurveTo(-84, -72, -88, -46);
  } else if (kind === 'pear' || kind === 'fig') {
    ctx.moveTo(0, -92);
    ctx.bezierCurveTo(36, -92, 34, -34, 62, -6);
    ctx.bezierCurveTo(98, 34, 74, 94, 0, 94);
    ctx.bezierCurveTo(-74, 94, -98, 34, -62, -6);
    ctx.bezierCurveTo(-34, -34, -36, -92, 0, -92);
  } else if (kind === 'plum') {
    ctx.ellipse(0, 4, 74, 90, 0, 0, Math.PI * 2);
  } else if (kind === 'mango') {
    ctx.ellipse(0, 4, 96, 74, -0.5, 0, Math.PI * 2);
  } else {
    ctx.arc(0, 4, 90, 0, Math.PI * 2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (kind === 'apple' || kind === 'rotten') {
    stem(0, -82);
    if (kind === 'apple') leaf(30, -86);
    shine(-40, -32, 15, 26);
  }
  if (kind === 'pear' || kind === 'fig') {
    stem(0, -92);
    shine(-30, 18, 12, 24);
  }
  if (kind === 'plum') shine(-26, -34, 12, 24);
  if (kind === 'mango') {
    leaf(52, -66);
    shine(-40, -6, 14, 24);
  }
  if (kind === 'orange') {
    shine(-40, -32, 15, 26);
    ctx.fillStyle = '#d97a0c';
    for (const [x, y] of [[26, 18], [-14, 44], [40, -28], [-44, 22], [12, -44], [52, 40]]) {
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (kind === 'peach') {
    ctx.strokeStyle = '#e8805c';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(10, -82);
    ctx.quadraticCurveTo(44, 8, 12, 88);
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 7;
    leaf(24, -84);
    shine(-42, -30, 14, 24);
  }
  if (kind === 'rotten') {
    // Soft brown patches, so it's easy to tell at a glance that this isn't one to want.
    ctx.fillStyle = '#3f3327';
    for (const [x, y, r] of [[-30, 20, 22], [32, -18, 16], [22, 44, 12], [-44, -26, 10]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return canvas;
}
