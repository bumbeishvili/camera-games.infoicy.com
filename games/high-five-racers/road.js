// The road surface and what's painted on it.
//
// Nothing here is allowed to flicker at speed. Road markings are long and low contrast, and a kerb's
// stripes are long enough to pass fewer than three times a second, even with a boost and turbo together.
import * as THREE from '../../vendor/three/three.module.js';
import { canvasTexture, handPath, seededRandom, starPath } from './kit.js';
import { KERB_STRIPE } from './rules.js';
import { PLACES, ROAD_HALF, within } from './track.js';

const ROAD_TILE = 18; // Metres of road that one copy of the texture covers.
const SHOULDER = 1.7;
const SKIRT = 3.4;
const LIFT = 0.05;
const KERB_WIDTH = 1.25;

const colourOf = (hex) => new THREE.Color(hex);
const SHOULDER_COLOURS = {
  plain: colourOf('#efe2b4'),
  village: colourOf('#d9d2c4'),
  forest: colourOf('#d8c48a'),
  lake: colourOf('#f4e7bb'),
  stone: colourOf('#c9c6bf'),
  grand: colourOf('#e8e2d2'),
  tunnel: colourOf('#b9b3a6'),
};
const SKIRT_COLOUR = colourOf('#8ccf62');
const KERB_RED = colourOf('#e4665a');
const KERB_WHITE = colourOf('#f6f0e3');

function roadTexture() {
  const texture = canvasTexture(512, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#5f6c7d';
    ctx.fillRect(0, 0, w, h);
    // Worn lines where the wheels go, very soft.
    for (const x of [150, 362]) {
      const wear = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
      wear.addColorStop(0, 'rgba(70,80,94,0)');
      wear.addColorStop(0.5, 'rgba(70,80,94,0.5)');
      wear.addColorStop(1, 'rgba(70,80,94,0)');
      ctx.fillStyle = wear;
      ctx.fillRect(x - 60, 0, 120, h);
    }
    // Grit, which gives the surface some life without making a pattern anyone could see move.
    const random = seededRandom(5);
    for (let i = 0; i < 5200; i += 1) {
      const pale = random() > 0.5;
      ctx.fillStyle = pale ? `rgba(150,160,175,${0.08 + random() * 0.14})` : `rgba(40,50,62,${0.08 + random() * 0.16})`;
      ctx.fillRect(random() * w, random() * h, 1 + random() * 2.5, 1 + random() * 2.5);
    }
    // Solid edges and one long, soft centre dash.
    ctx.fillStyle = '#f0f3f6';
    ctx.fillRect(14, 0, 13, h);
    ctx.fillRect(w - 27, 0, 13, h);
    ctx.fillStyle = '#a9b4c1';
    ctx.fillRect(w / 2 - 7, 90, 14, 560);
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 16;
  return texture;
}

/** A strip following the road, with one set of corners every step. Sides are metres from the middle. */
function roadStrip(track, { left, right, lift = 0, from = 0, to = track.length, every = track.step, colour = null, textureLength = 0 }) {
  const count = Math.max(1, Math.round((to - from) / every));
  const positions = [];
  const normals = [];
  const uvs = [];
  const colours = [];
  const indices = [];
  const point = new THREE.Vector3();
  for (let i = 0; i <= count; i += 1) {
    const d = from + ((to - from) * i) / count;
    const a = track.pointAt(d, left, point).toArray();
    positions.push(a[0], a[1] + lift, a[2]);
    const b = track.pointAt(d, right, point).toArray();
    positions.push(b[0], b[1] + lift, b[2]);
    normals.push(0, 1, 0, 0, 1, 0);
    if (textureLength) {
      const v = (d - from) / textureLength;
      uvs.push(0, v, 1, v);
    }
    if (colour) {
      const c = colour(d);
      colours.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    if (i < count) {
      const n = i * 2;
      indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (textureLength) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (colour) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  return geometry;
}

function shoulderColour(d, length) {
  if (within(d, PLACES.tunnel, length)) return SHOULDER_COLOURS.tunnel;
  if (within(d, PLACES.bridge, length)) return SHOULDER_COLOURS.stone;
  if (within(d, PLACES.village, length)) return SHOULDER_COLOURS.village;
  if (within(d, PLACES.grandstand, length)) return SHOULDER_COLOURS.grand;
  if (within(d, PLACES.lake, length)) return SHOULDER_COLOURS.lake;
  if (within(d, PLACES.forest, length)) return SHOULDER_COLOURS.forest;
  return SHOULDER_COLOURS.plain;
}

/** The road, a pale shoulder on each side, and a slope down to the grass, in pieces that can be culled. */
function buildSurface(scene, track) {
  const road = new THREE.MeshLambertMaterial({ map: roadTexture() });
  const painted = new THREE.MeshLambertMaterial({ vertexColors: true });
  const piece = 200;
  for (let from = 0; from < track.length; from += piece) {
    const to = Math.min(from + piece, track.length);
    const add = (geometry, material) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      scene.add(mesh);
    };
    add(roadStrip(track, { left: -ROAD_HALF, right: ROAD_HALF, lift: LIFT, from, to, textureLength: ROAD_TILE }), road);
    const colour = (d) => shoulderColour(d, track.length);
    add(roadStrip(track, { left: -ROAD_HALF - SHOULDER, right: -ROAD_HALF, lift: 0.02, from, to, colour }), painted);
    add(roadStrip(track, { left: ROAD_HALF, right: ROAD_HALF + SHOULDER, lift: 0.02, from, to, colour }), painted);
    const skirt = (d) => {
      const side = shoulderColour(d, track.length);
      return side === SHOULDER_COLOURS.stone || side === SHOULDER_COLOURS.tunnel ? side : SKIRT_COLOUR;
    };
    for (const [left, right, outer] of [[-ROAD_HALF - SHOULDER - SKIRT, -ROAD_HALF - SHOULDER, 0], [ROAD_HALF + SHOULDER, ROAD_HALF + SHOULDER + SKIRT, 1]]) {
      const geometry = roadStrip(track, { left, right, lift: 0, from, to, colour: skirt });
      // The side away from the road sinks into the ground, so the road never looks as if it's floating.
      const positions = geometry.attributes.position;
      for (let i = outer; i < positions.count; i += 2) positions.setY(i, positions.getY(i) - 0.55);
      geometry.computeVertexNormals();
      add(geometry, painted);
    }
  }
}

/** Red and white kerbs on the bends, except where the road runs through somewhere that wouldn't have them. */
function buildKerbs(scene, track) {
  const noKerbs = [PLACES.tunnel, PLACES.bridge, PLACES.village, PLACES.grandstand];
  const allowed = (d) => !noKerbs.some((place) => within(d, place, track.length));
  const positions = [];
  const normals = [];
  const colours = [];
  const corner = new THREE.Vector3();
  const stripe = KERB_STRIPE;
  const quad = (a0, a1, b0, b1, colour) => {
    for (const p of [a0, b0, a1, a1, b0, b1]) {
      positions.push(p[0], p[1], p[2]);
      normals.push(0, 1, 0);
      colours.push(colour.r, colour.g, colour.b);
    }
  };
  const count = Math.floor(track.length / stripe);
  for (let i = 0; i < count; i += 1) {
    const from = i * stripe;
    const middle = from + stripe / 2;
    const bend = track.curvatureAt(middle);
    if (Math.abs(bend) < 0.0075 || !allowed(middle)) continue;
    // The inside of the bend always, and the outside too when it's a tight one.
    const sides = Math.abs(bend) > 0.016 ? [-1, 1] : [Math.sign(bend)];
    const colour = i % 2 ? KERB_RED : KERB_WHITE;
    for (const side of sides) {
      const inner = side * (ROAD_HALF - 0.1);
      const outer = side * (ROAD_HALF - 0.1 + KERB_WIDTH);
      const pieces = 3;
      for (let k = 0; k < pieces; k += 1) {
        const d0 = from + (stripe * k) / pieces;
        const d1 = from + (stripe * (k + 1)) / pieces;
        const at = (d, lateral, lift) => {
          track.pointAt(d, lateral, corner);
          return [corner.x, corner.y + lift, corner.z];
        };
        const [a0, a1, b0, b1] = [at(d0, inner, 0.1), at(d0, outer, 0.06), at(d1, inner, 0.1), at(d1, outer, 0.06)];
        if (side < 0) quad(a0, a1, b0, b1, colour);
        else quad(a1, a0, b1, b0, colour);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
}

// What's painted on the road, all on one picture so it's one draw call.
const ATLAS = 1024;
const CELLS = {
  finish: [0, 0, 1024, 128],
  title: [0, 128, 1024, 128],
  grid: [0, 256, 256, 256],
  hand: [256, 256, 256, 256],
  star: [512, 256, 256, 256],
  skid: [768, 256, 256, 256],
  patch: [0, 512, 512, 256],
  go: [512, 512, 512, 256],
};

function decalAtlas() {
  return canvasTexture(ATLAS, ATLAS, (ctx) => {
    const cell = (name, draw) => {
      const [x, y, w, h] = CELLS[name];
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
      draw(w, h);
      ctx.restore();
    };
    cell('finish', (w, h) => {
      const size = h / 3;
      for (let column = 0; column * size < w; column += 1) {
        for (let row = 0; row < 3; row += 1) {
          ctx.fillStyle = (column + row) % 2 ? '#f7f8f9' : '#27384b';
          ctx.fillRect(column * size, row * size, size, size);
        }
      }
    });
    cell('title', (w, h) => {
      ctx.fillStyle = 'rgba(255,255,255,0.86)';
      ctx.font = '700 104px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HIGH FIVE!', w / 2, h / 2 + 6);
    });
    cell('grid', (w, h) => {
      ctx.strokeStyle = 'rgba(245,247,250,0.9)';
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(24, h - 16);
      ctx.lineTo(24, 24);
      ctx.lineTo(w - 24, 24);
      ctx.lineTo(w - 24, h - 16);
      ctx.stroke();
    });
    cell('hand', (w, h) => {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      handPath(ctx, w / 2, h / 2 + 6, h * 0.82);
    });
    cell('star', (w, h) => {
      ctx.fillStyle = 'rgba(255,214,70,0.55)';
      starPath(ctx, w / 2, h / 2, h * 0.44);
      ctx.fill();
    });
    cell('skid', (w, h) => {
      for (const x of [w * 0.28, w * 0.72]) {
        const fade = ctx.createLinearGradient(0, 0, 0, h);
        fade.addColorStop(0, 'rgba(30,36,46,0)');
        fade.addColorStop(0.4, 'rgba(30,36,46,0.3)');
        fade.addColorStop(1, 'rgba(30,36,46,0)');
        ctx.fillStyle = fade;
        ctx.fillRect(x - 12, 0, 24, h);
      }
    });
    cell('patch', (w, h) => {
      ctx.fillStyle = 'rgba(66,76,90,0.42)';
      ctx.beginPath();
      ctx.roundRect(12, 12, w - 24, h - 24, 26);
      ctx.fill();
    });
    cell('go', (w, h) => {
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = '700 150px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GO!', w / 2, h / 2 + 8);
    });
  });
}

function buildDecals(scene, track) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const corner = new THREE.Vector3();

  /** Follows the road, so it lies flat over rises and around bends. The picture's top is further along. */
  const paint = (name, d, lateral, width, length) => {
    const [cx, cy, cw, ch] = CELLS[name];
    const pieces = Math.max(1, Math.ceil(length / 3));
    const u0 = cx / ATLAS;
    const u1 = (cx + cw) / ATLAS;
    const vAt = (share) => 1 - (cy + ch * (1 - share)) / ATLAS;
    for (let i = 0; i < pieces; i += 1) {
      const a = d - length / 2 + (length * i) / pieces;
      const b = d - length / 2 + (length * (i + 1)) / pieces;
      const at = (along, side) => track.pointAt(along, lateral + (side * width) / 2, corner).toArray();
      // The driver's right is +lateral, and is the right of the picture too.
      const a0 = at(a, -1);
      const a1 = at(a, 1);
      const b0 = at(b, -1);
      const b1 = at(b, 1);
      const va = vAt(i / pieces);
      const vb = vAt((i + 1) / pieces);
      for (const [p, u, v] of [[a0, u0, va], [b0, u0, vb], [a1, u1, va], [a1, u1, va], [b0, u0, vb], [b1, u1, vb]]) {
        positions.push(p[0], p[1] + LIFT + 0.03, p[2]);
        normals.push(0, 1, 0);
        uvs.push(u, v);
      }
    }
  };

  paint('finish', 0, 0, ROAD_HALF * 2, 2.6);
  paint('title', 14, 0, 11, 3.4);
  // A box on the road for each car waiting at the start.
  for (const [behind, lane] of [[44, 0], [33, -3.2], [22, 3.2], [11, 0]]) paint('grid', -behind + 2, lane, 3.2, 6);
  paint('go', 34, 0, 8, 4);

  // Small things that make the road look lived in, and a hand or a star here and there.
  const random = seededRandom(404);
  const noPaint = [PLACES.bridge];
  for (let d = 60; d < track.length - 150; d += 22 + random() * 40) {
    if (noPaint.some((place) => within(d, place, track.length))) continue;
    const kind = random();
    const bend = Math.abs(track.curvatureAt(d));
    if (bend > 0.009) paint('skid', d, (random() - 0.5) * 6, 2.2, 14 + random() * 10);
    else if (kind < 0.45) paint('patch', d, (random() - 0.5) * 7, 2.5 + random() * 2.5, 2.5 + random() * 3.5);
    else if (kind < 0.62) paint('hand', d, (random() - 0.5) * 6, 3.2, 3.2);
    else if (kind < 0.76) paint('star', d, (random() - 0.5) * 6, 2.8, 2.8);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ map: decalAtlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
}

export function buildRoad(scene, track) {
  buildSurface(scene, track);
  buildKerbs(scene, track);
  buildDecals(scene, track);
}

