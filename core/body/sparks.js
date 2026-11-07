// Small shapes flying about: the effects in the body games. Nothing flashes or strobes, as
// seizures are more common in children with hemiplegia. A hit or a catch is a burst of shapes
// where it happened, and the picture itself never changes brightness.
import * as THREE from '../../vendor/three/three.module.js';

const MOST_AT_ONCE = 140;

export function spriteTexture(draw, size = 96) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 100, size / 100);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const blob = (ctx, r) => {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
};

function starPath(ctx, points, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 ? inner : outer;
    const angle = (i / points) * Math.PI - Math.PI / 2;
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  ctx.closePath();
}

export const SHAPES = {
  star: (ctx) => {
    starPath(ctx, 5, 46, 20);
    ctx.fill();
  },
  spark: (ctx) => {
    starPath(ctx, 4, 48, 11);
    ctx.fill();
  },
  puff: (ctx) => {
    blob(ctx, 34);
    for (const [x, y] of [[-24, -10], [24, -6], [-8, 24], [12, -24]]) {
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  ring: (ctx) => {
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.stroke();
  },
  bubble: (ctx) => {
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.25;
    blob(ctx, 36);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(-13, -15, 8, 0, Math.PI * 2);
    ctx.fill();
  },
  leaf: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.quadraticCurveTo(40, -10, 0, 46);
    ctx.quadraticCurveTo(-40, -10, 0, -46);
    ctx.fill();
  },
  rock: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(-34, -20);
    ctx.lineTo(-6, -40);
    ctx.lineTo(32, -26);
    ctx.lineTo(42, 14);
    ctx.lineTo(14, 38);
    ctx.lineTo(-30, 28);
    ctx.closePath();
    ctx.fill();
  },
  gear: (ctx) => {
    starPath(ctx, 8, 46, 34);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    blob(ctx, 14);
  },
  snow: (ctx) => {
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i += 1) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, -42);
      ctx.lineTo(0, 42);
      ctx.moveTo(-14, -28);
      ctx.lineTo(0, -16);
      ctx.lineTo(14, -28);
      ctx.moveTo(-14, 28);
      ctx.lineTo(0, 16);
      ctx.lineTo(14, 28);
      ctx.stroke();
    }
  },
  honey: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.bezierCurveTo(34, -6, 34, 40, 0, 40);
    ctx.bezierCurveTo(-34, 40, -34, -6, 0, -46);
    ctx.fill();
  },
  flame: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(0, -48);
    ctx.bezierCurveTo(26, -18, 36, 2, 26, 26);
    ctx.bezierCurveTo(20, 42, -20, 42, -26, 26);
    ctx.bezierCurveTo(-34, 6, -14, 0, -10, -14);
    ctx.bezierCurveTo(-6, -26, -6, -36, 0, -48);
    ctx.fill();
  },
};

/** A small pool of shapes flying about. Old ones are reused rather than adding more. */
export class Sparks {
  constructor(scene) {
    this.textures = Object.fromEntries(Object.entries(SHAPES).map(([name, draw]) => [name, spriteTexture(draw)]));
    this.items = Array.from({ length: MOST_AT_ONCE }, () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textures.star, transparent: true, depthWrite: false }));
      sprite.visible = false;
      scene.add(sprite);
      return { sprite, life: 0, total: 1, vx: 0, vy: 0, vz: 0, gravity: 0, grow: 0, size: 1, spin: 0, drag: 0 };
    });
    this.next = 0;
  }

  emit({ shape = 'star', colour = '#ffffff', at, velocity = [0, 0, 0], life = 0.6, size = 0.3, grow = 0, gravity = 0, spin = 0, drag = 0, opacity = 1 }) {
    const item = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    const { sprite } = item;
    sprite.material.map = this.textures[shape];
    sprite.material.color.set(colour);
    sprite.material.rotation = Math.random() * Math.PI * 2;
    sprite.material.opacity = opacity;
    sprite.position.set(at.x, at.y, at.z);
    sprite.scale.setScalar(size);
    sprite.visible = true;
    Object.assign(item, { life, total: life, vx: velocity[0], vy: velocity[1], vz: velocity[2], gravity, grow, size, spin, drag, opacity });
  }

  update(dt) {
    for (const item of this.items) {
      if (item.life <= 0) continue;
      item.life -= dt;
      const { sprite } = item;
      if (item.life <= 0) {
        sprite.visible = false;
        continue;
      }
      item.vy -= item.gravity * dt;
      const slow = Math.exp(-item.drag * dt);
      item.vx *= slow;
      item.vy *= slow;
      item.vz *= slow;
      sprite.position.x += item.vx * dt;
      sprite.position.y = Math.max(0.05, sprite.position.y + item.vy * dt);
      sprite.position.z += item.vz * dt;
      item.size += item.grow * dt;
      sprite.scale.setScalar(Math.max(0.01, item.size));
      sprite.material.rotation += item.spin * dt;
      sprite.material.opacity = item.opacity * Math.min(1, (item.life / item.total) * 2.5);
    }
  }
}
