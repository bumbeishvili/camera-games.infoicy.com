// Small shapes where something happened, and lines going past at speed.
//
// Nothing here flashes: seizures are more common in children with hemiplegia, so there are no
// full-screen effects and nothing that changes the picture's brightness. A slap, a bump or a turbo
// is a handful of little shapes that fade out where it happened.
import * as THREE from '../../vendor/three/three.module.js';
import { canvasTexture, clamp, handPath, lerp, starPath, TAU } from './kit.js';

const ATLAS_CELLS = 4;
const CELL = 96;
const LARGEST_SHARE = 0.085; // Of the height of the picture. Nothing small may ever be big.
const SHAPE_INDEX = { star: 0, spark: 1, puff: 2, flame: 3, ring: 4, hand: 5, paper: 6, dot: 7, drop: 8, coin: 9, gem: 10 };

function shapeAtlas() {
  const texture = canvasTexture(ATLAS_CELLS * CELL, ATLAS_CELLS * CELL, (ctx) => {
    const draw = (index, paint) => {
      ctx.save();
      ctx.translate((index % ATLAS_CELLS) * CELL + CELL / 2, Math.floor(index / ATLAS_CELLS) * CELL + CELL / 2);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffffff';
      paint();
      ctx.restore();
    };
    draw(SHAPE_INDEX.star, () => {
      starPath(ctx, 0, 0, 42);
      ctx.fill();
    });
    draw(SHAPE_INDEX.spark, () => {
      starPath(ctx, 0, 0, 44, 10, 4);
      ctx.fill();
    });
    draw(SHAPE_INDEX.puff, () => {
      const glow = ctx.createRadialGradient(0, 0, 8, 0, 0, 44);
      glow.addColorStop(0, 'rgba(255,255,255,1)');
      glow.addColorStop(0.55, 'rgba(255,255,255,0.75)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 44, 0, TAU);
      ctx.fill();
    });
    draw(SHAPE_INDEX.flame, () => {
      ctx.beginPath();
      ctx.moveTo(0, -44);
      ctx.bezierCurveTo(24, -16, 32, 2, 24, 22);
      ctx.bezierCurveTo(18, 38, -18, 38, -24, 22);
      ctx.bezierCurveTo(-30, 6, -12, 0, -9, -12);
      ctx.bezierCurveTo(-5, -24, -5, -33, 0, -44);
      ctx.fill();
    });
    draw(SHAPE_INDEX.ring, () => {
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, 38, 0, TAU);
      ctx.stroke();
    });
    draw(SHAPE_INDEX.hand, () => {
      handPath(ctx, -1, 3, 72);
    });
    draw(SHAPE_INDEX.paper, () => {
      ctx.fillRect(-18, -28, 36, 56);
    });
    draw(SHAPE_INDEX.dot, () => {
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, TAU);
      ctx.fill();
    });
    // A long thin raindrop, pointing down, soft at the top.
    draw(SHAPE_INDEX.drop, () => {
      const fade = ctx.createLinearGradient(0, -44, 0, 40);
      fade.addColorStop(0, 'rgba(255,255,255,0)');
      fade.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = fade;
      ctx.beginPath();
      ctx.moveTo(0, -44);
      ctx.quadraticCurveTo(7, 20, 6, 32);
      ctx.arc(0, 32, 6, 0, Math.PI);
      ctx.quadraticCurveTo(-7, 20, 0, -44);
      ctx.fill();
    });
    // A coin: a disc with a ring stamped in it.
    draw(SHAPE_INDEX.coin, () => {
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 27, 0, TAU);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.stroke();
    });
    // A gem, cut like a diamond.
    draw(SHAPE_INDEX.gem, () => {
      ctx.beginPath();
      ctx.moveTo(-34, -12);
      ctx.lineTo(-18, -34);
      ctx.lineTo(18, -34);
      ctx.lineTo(34, -12);
      ctx.lineTo(0, 40);
      ctx.closePath();
      ctx.fill();
    });
  }, { anisotropy: 1 });
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

/** A pool of little shapes, all drawn together as one draw call, however many are in the air. */
export class Particles {
  constructor(scene, count = 560) {
    this.count = count;
    this.next = 0;
    this.items = Array.from({ length: count }, () => ({ life: 0, total: 1, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0, grow: 0, spin: 0, opacity: 1 }));
    this.positions = new Float32Array(count * 3);
    this.colours = new Float32Array(count * 4);
    this.sizes = new Float32Array(count);
    this.turns = new Float32Array(count);
    this.shapes = new Float32Array(count);
    this.positions.fill(-5000);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aColour', new THREE.BufferAttribute(this.colours, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aTurn', new THREE.BufferAttribute(this.turns, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aShape', new THREE.BufferAttribute(this.shapes, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: shapeAtlas() }, uScale: { value: 500 }, uLargest: { value: 64 } },
      vertexShader: `
        attribute vec4 aColour;
        attribute float aSize;
        attribute float aTurn;
        attribute float aShape;
        uniform float uScale;
        uniform float uLargest;
        varying vec4 vColour;
        varying float vTurn;
        varying float vShape;
        void main() {
          vColour = aColour;
          vTurn = aTurn;
          vShape = aShape;
          vec4 place = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * place;
          float away = max(0.5, -place.z);
          // Close to the camera a shape would fill the view, so it stays small, and fades out.
          gl_PointSize = min(aSize * uScale / away, uLargest);
          vColour.a *= smoothstep(2.0, 7.0, away);
        }`,
      fragmentShader: `
        uniform sampler2D uAtlas;
        varying vec4 vColour;
        varying float vTurn;
        varying float vShape;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vTurn);
          float s = sin(vTurn);
          p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
          if (p.x < 0.01 || p.x > 0.99 || p.y < 0.01 || p.y > 0.99) discard;
          float cell = floor(vShape + 0.5);
          vec2 uv = (vec2(mod(cell, 4.0), floor(cell / 4.0)) + p) / 4.0;
          float alpha = texture2D(uAtlas, vec2(uv.x, 1.0 - uv.y)).a * vColour.a;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(vColour.rgb, alpha);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
    this.budget = 1;
    this.colour = new THREE.Color();
  }

  /** turn is which way up the shape is drawn, at random unless it's given, as for rain. */
  emit({ shape = 'star', colour = '#ffffff', x, y, z, vx = 0, vy = 0, vz = 0, life = 0.7, size = 0.5, grow = 0, gravity = 0, drag = 0, spin = 0, opacity = 1, turn = null }) {
    const slot = this.next;
    this.next = (this.next + 1) % this.count;
    const item = this.items[slot];
    Object.assign(item, { life, total: life, vx, vy, vz, gravity, drag, grow, spin, opacity });
    this.positions[slot * 3] = x;
    this.positions[slot * 3 + 1] = y;
    this.positions[slot * 3 + 2] = z;
    this.colour.set(colour);
    this.colours[slot * 4] = this.colour.r;
    this.colours[slot * 4 + 1] = this.colour.g;
    this.colours[slot * 4 + 2] = this.colour.b;
    this.colours[slot * 4 + 3] = opacity;
    this.sizes[slot] = size;
    this.turns[slot] = turn ?? Math.random() * TAU;
    this.shapes[slot] = SHAPE_INDEX[shape];
  }

  /** A burst of shapes going every way, for a high five or a star. */
  burst(at, { count = 12, shapes = ['star'], colours = ['#ffd23f'], speed = 5, up = 3, life = 0.7, size = 0.5, gravity = 8, drag = 0.8 }) {
    const amount = Math.max(3, Math.round(count * this.budget));
    for (let i = 0; i < amount; i += 1) {
      const angle = Math.random() * TAU;
      const rise = Math.random();
      const pace = speed * (0.45 + Math.random() * 0.65);
      this.emit({
        shape: shapes[i % shapes.length],
        colour: colours[i % colours.length],
        x: at.x,
        y: at.y,
        z: at.z,
        vx: Math.cos(angle) * pace,
        vy: up * (0.4 + rise),
        vz: Math.sin(angle) * pace,
        life: life * (0.7 + Math.random() * 0.6),
        size: size * (0.7 + Math.random() * 0.6),
        gravity,
        drag,
        spin: (Math.random() - 0.5) * 7,
      });
    }
  }

  update(dt, camera, viewHeight) {
    this.material.uniforms.uScale.value = viewHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.material.uniforms.uLargest.value = viewHeight * LARGEST_SHARE;
    for (let slot = 0; slot < this.count; slot += 1) {
      const item = this.items[slot];
      if (item.life <= 0) continue;
      item.life -= dt;
      if (item.life <= 0) {
        this.colours[slot * 4 + 3] = 0;
        this.sizes[slot] = 0;
        continue;
      }
      item.vy -= item.gravity * dt;
      const slow = Math.exp(-item.drag * dt);
      item.vx *= slow;
      item.vy *= slow;
      item.vz *= slow;
      this.positions[slot * 3] += item.vx * dt;
      this.positions[slot * 3 + 1] += item.vy * dt;
      this.positions[slot * 3 + 2] += item.vz * dt;
      this.sizes[slot] += item.grow * dt;
      this.turns[slot] += item.spin * dt;
      this.colours[slot * 4 + 3] = item.opacity * Math.min(1, (item.life / item.total) * 2.4);
    }
    const { attributes } = this.points.geometry;
    attributes.position.needsUpdate = true;
    attributes.aColour.needsUpdate = true;
    attributes.aSize.needsUpdate = true;
    attributes.aTurn.needsUpdate = true;
    attributes.aShape.needsUpdate = true;
  }
}

/**
 * Thin white lines going past near the edges of the view, which come out as the car gets fast. They're
 * soft and pale, and never in the middle of the picture where the child is looking.
 */
export class SpeedLines {
  constructor(scene, count = 42) {
    this.count = count;
    const texture = canvasTexture(128, 8, (ctx, w, h) => {
      const fade = ctx.createLinearGradient(0, 0, w, 0);
      fade.addColorStop(0, 'rgba(255,255,255,0)');
      fade.addColorStop(0.35, 'rgba(255,255,255,1)');
      fade.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, w, h);
    }, { anisotropy: 1 });
    this.material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.material, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    scene.add(this.mesh);

    this.lines = Array.from({ length: count }, (_, index) => {
      const side = index % 2 ? 1 : -1;
      const out = 6 + Math.random() * 13;
      const high = Math.random() < 0.3;
      return {
        across: high ? (Math.random() - 0.5) * 22 : side * out,
        up: high ? 7 + Math.random() * 7 : -2.5 + Math.random() * 9,
        along: 10 + Math.random() * 60,
        speed: 0.9 + Math.random() * 0.5,
        width: 0.03 + Math.random() * 0.04,
      };
    });
    this.matrix = new THREE.Matrix4();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.at = new THREE.Vector3();
    this.toCamera = new THREE.Vector3();
    this.edge = new THREE.Vector3();
    this.scale = 1;
  }

  /** strength is 0 for none, up to 1 at the fastest. */
  update(dt, camera, speed, strength) {
    const showing = strength > 0.01;
    this.mesh.visible = showing;
    if (!showing) return;
    this.material.opacity = lerp(0, 0.5, clamp(strength, 0, 1));
    camera.getWorldDirection(this.forward);
    this.right.crossVectors(this.forward, camera.up).normalize();
    this.up.crossVectors(this.right, this.forward);
    const length = 2.5 + speed * 0.24;
    for (let i = 0; i < this.count; i += 1) {
      const line = this.lines[i];
      line.along -= speed * line.speed * dt;
      if (line.along < 8) line.along += 62;
      this.at.copy(camera.position)
        .addScaledVector(this.forward, line.along)
        .addScaledVector(this.right, line.across)
        .addScaledVector(this.up, line.up);
      this.toCamera.subVectors(camera.position, this.at).normalize();
      this.edge.crossVectors(this.forward, this.toCamera).normalize();
      this.matrix.set(
        this.forward.x * length, this.edge.x * line.width, this.toCamera.x, this.at.x,
        this.forward.y * length, this.edge.y * line.width, this.toCamera.y, this.at.y,
        this.forward.z * length, this.edge.z * line.width, this.toCamera.z, this.at.z,
        0, 0, 0, 1,
      );
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
