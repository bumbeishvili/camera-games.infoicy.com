// The places along the road: the grandstands and start line, a village, a tunnel through a hill, a farm,
// the lake and its bridge, a forest, Joze's family and the Harvest Fair from the other games. Each one is
// built from simple shapes and joined into a mesh or two, so all of this costs a few dozen draw calls.
import * as THREE from '../../vendor/three/three.module.js';
import { canvasTexture, faceted, handPath, lerp, Mesher, seededRandom, starPath, TAU } from './kit.js';
import { WATER_LEVEL } from './terrain.js';
import { PLACES, ROAD_HALF } from './track.js';

const STONE = '#b9ab96';
const STONE_DARK = '#9a8d7b';
const WOOD = '#8a5a3c';
const WHITE = '#f7f4ec';
const INK = '#27384b';
const BRIGHTS = ['#ff5a4f', '#ffd23f', '#3b82f6', '#27c96b', '#a855f7', '#ff8a2b', '#ff7eb6', '#14b8a6'];

/* ------------------------------- signs ------------------------------- */

const POSTERS = ['title', 'smoothie', 'balloons', 'lighthouse', 'leap', 'wings', 'mighty', 'five', 'turbo', 'joze', 'fair', 'tunnel'];
const POSTER_COLUMNS = 2;
const POSTER_ROWS = 6;
const POSTER_WIDTH = 1024;
const POSTER_HEIGHT = 340;

function drawPosters(ctx) {
  const text = (words, x, y, size, colour = '#ffffff', align = 'center') => {
    ctx.fillStyle = colour;
    ctx.font = `700 ${size}px Fredoka, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(words, x, y);
  };
  const circle = (x, y, r, colour) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  };
  const star = (x, y, r, colour) => {
    ctx.fillStyle = colour;
    starPath(ctx, x, y, r);
    ctx.fill();
  };
  const W = POSTER_WIDTH;
  const H = POSTER_HEIGHT;
  const draw = {
    title() {
      ctx.fillStyle = '#ff5a4f';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 26; i += 1) {
        ctx.fillStyle = i % 2 ? '#ffffff' : '#27384b';
        ctx.fillRect(i * 40, 0, 40, 26);
        ctx.fillStyle = i % 2 ? '#27384b' : '#ffffff';
        ctx.fillRect(i * 40, H - 26, 40, 26);
      }
      text('HIGH FIVE RACERS', W / 2, H / 2 + 6, 112);
    },
    smoothie() {
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(0, 0, W, H);
      text('Joze’s Smoothies', 620, H / 2 + 4, 88, '#8a3d10');
      ctx.fillStyle = '#ff7eb6';
      ctx.beginPath();
      ctx.moveTo(90, 70);
      ctx.lineTo(230, 70);
      ctx.lineTo(205, 300);
      ctx.lineTo(115, 300);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(180, 74);
      ctx.lineTo(220, 18);
      ctx.stroke();
      circle(250, 90, 42, '#ff8a2b');
      circle(250, 90, 26, '#ffc27a');
    },
    balloons() {
      ctx.fillStyle = '#8fd2fa';
      ctx.fillRect(0, 0, W, H);
      text('Balloon Pop', 640, H / 2 + 4, 104, '#12304d');
      for (const [x, y, c] of [[90, 130, '#ff5a4f'], [190, 100, '#ffd23f'], [280, 150, '#a855f7']]) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y + 56);
        ctx.lineTo(x + 8, y + 170);
        ctx.stroke();
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(x, y, 48, 60, 0, 0, TAU);
        ctx.fill();
      }
    },
    lighthouse() {
      ctx.fillStyle = '#1f5e8f';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#3f93c9';
      ctx.fillRect(0, H - 70, W, 70);
      text('The Lighthouse Keeper', 610, H / 2 - 10, 68);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(110, H - 50);
      ctx.lineTo(136, 80);
      ctx.lineTo(196, 80);
      ctx.lineTo(222, H - 50);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff5a4f';
      ctx.fillRect(125, 140, 82, 44);
      ctx.fillRect(116, 220, 100, 44);
      circle(166, 62, 30, '#ffe27a');
    },
    leap() {
      ctx.fillStyle = '#58c26a';
      ctx.fillRect(0, 0, W, H);
      text('Leap Trail', 640, H / 2 + 4, 110);
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 16;
      ctx.setLineDash([24, 20]);
      ctx.beginPath();
      ctx.moveTo(40, 290);
      ctx.quadraticCurveTo(190, -20, 330, 290);
      ctx.stroke();
      ctx.setLineDash([]);
      star(190, 120, 58, '#ffd23f');
    },
    wings() {
      ctx.fillStyle = '#d7f1ff';
      ctx.fillRect(0, 0, W, H);
      text('Sky Wings', 640, H / 2 + 4, 110, '#1f6fb2');
      circle(120, 240, 50, '#ffffff');
      circle(190, 250, 62, '#ffffff');
      ctx.fillStyle = '#ff5a4f';
      ctx.beginPath();
      ctx.ellipse(190, 130, 110, 34, -0.1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.roundRect(150, 70, 56, 130, 18);
      ctx.fill();
    },
    mighty() {
      ctx.fillStyle = '#6a4bd8';
      ctx.fillRect(0, 0, W, H);
      text('Mighty Moves', 620, H / 2 + 4, 100);
      star(150, H / 2, 120, '#ffd23f');
      ctx.fillStyle = '#6a4bd8';
      handPath(ctx, 150, H / 2 + 8, 120);
    },
    five() {
      ctx.fillStyle = '#ff8a2b';
      ctx.fillRect(0, 0, W, H);
      text('Give me five!', 640, H / 2 + 4, 104);
      ctx.fillStyle = '#ffffff';
      handPath(ctx, 180, H / 2 + 6, 280);
    },
    turbo() {
      ctx.fillStyle = '#12304d';
      ctx.fillRect(0, 0, W, H);
      text('OPEN WIDE!', 620, H / 2 - 56, 90, '#ffd23f');
      text('for turbo', 620, H / 2 + 56, 84);
      ctx.fillStyle = '#ff7a1f';
      ctx.beginPath();
      ctx.moveTo(170, 40);
      ctx.bezierCurveTo(250, 120, 280, 170, 260, 230);
      ctx.bezierCurveTo(240, 300, 110, 300, 90, 230);
      ctx.bezierCurveTo(70, 170, 130, 150, 140, 110);
      ctx.closePath();
      ctx.fill();
      circle(175, 225, 48, '#ffd84a');
    },
    joze() {
      ctx.fillStyle = '#6a4bd8';
      ctx.fillRect(0, 0, W, H);
      text('GO JOZE GO!', 640, H / 2 + 4, 112, '#ffd23f');
      ctx.fillStyle = '#f5c451';
      ctx.beginPath();
      ctx.ellipse(170, 150, 90, 100, 0, 0, TAU);
      ctx.fill();
      ctx.fillRect(135, 220, 70, 120);
      for (const x of [130, 210]) {
        ctx.fillStyle = '#f5c451';
        ctx.fillRect(x - 8, 28, 16, 50);
        circle(x, 26, 16, '#5a3a1c');
      }
      circle(135, 130, 22, '#ffffff');
      circle(205, 130, 22, '#ffffff');
      circle(135, 134, 11, '#2c1a0f');
      circle(205, 134, 11, '#2c1a0f');
      ctx.fillStyle = '#fff0c9';
      ctx.beginPath();
      ctx.ellipse(170, 198, 56, 38, 0, 0, TAU);
      ctx.fill();
      for (const [x, y, r] of [[85, 170, 16], [255, 170, 16], [170, 80, 14], [150, 290, 14], [192, 262, 12]]) circle(x, y, r, '#b4682c');
    },
    fair() {
      ctx.fillStyle = '#ffe9b0';
      ctx.fillRect(0, 0, W, H);
      text('Harvest Fair', 620, H / 2 + 4, 104, '#b4441c');
      circle(90, 200, 66, '#ff5a4f');
      circle(190, 150, 70, '#ff8a2b');
      circle(280, 215, 56, '#27c96b');
      ctx.fillStyle = WOOD;
      ctx.fillRect(84, 124, 12, 24);
    },
    tunnel() {
      ctx.fillStyle = '#7d7262';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = 12;
      ctx.strokeRect(14, 14, W - 28, H - 28);
      text('Joze’s Tunnel', W / 2, H / 2 + 6, 128, '#ffe27a');
    },
  };
  POSTERS.forEach((name, index) => {
    ctx.save();
    ctx.translate((index % POSTER_COLUMNS) * POSTER_WIDTH, Math.floor(index / POSTER_COLUMNS) * POSTER_HEIGHT);
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    draw[name]();
    ctx.restore();
  });
}

/** Every sign in the world, on one picture, drawn together. They aren't lit, so they're always readable. */
class Boards {
  constructor() {
    this.positions = [];
    this.uvs = [];
  }

  /** A sign facing +Z after `turn`. x, y and z are the middle of it. */
  add(poster, x, y, z, turn, width, height = width / 3) {
    const index = POSTERS.indexOf(poster);
    const column = index % POSTER_COLUMNS;
    const row = Math.floor(index / POSTER_COLUMNS);
    const u0 = column / POSTER_COLUMNS;
    const u1 = (column + 1) / POSTER_COLUMNS;
    const canvasHeight = POSTER_ROWS * POSTER_HEIGHT;
    const v1 = 1 - (row * POSTER_HEIGHT) / canvasHeight;
    const v0 = 1 - ((row + 1) * POSTER_HEIGHT) / canvasHeight;
    const across = [Math.cos(turn) * width / 2, -Math.sin(turn) * width / 2];
    const lift = height / 2;
    const corners = [
      [x - across[0], y - lift, z - across[1], u0, v0],
      [x + across[0], y - lift, z + across[1], u1, v0],
      [x + across[0], y + lift, z + across[1], u1, v1],
      [x - across[0], y + lift, z - across[1], u0, v1],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.positions.push(corners[i][0], corners[i][1], corners[i][2]);
      this.uvs.push(corners[i][3], corners[i][4]);
    }
  }

  finish(scene) {
    const texture = canvasTexture(POSTER_COLUMNS * POSTER_WIDTH, POSTER_ROWS * POSTER_HEIGHT, drawPosters);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture }));
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
}

/* ------------------------------- flags ------------------------------- */

const FLAG_CELLS = 8;

function flagPicture() {
  return canvasTexture(FLAG_CELLS * 128, 80, (ctx, w, h) => {
    const cell = 128;
    const paint = (index, draw) => {
      ctx.save();
      ctx.translate(index * cell, 0);
      ctx.beginPath();
      ctx.rect(0, 0, cell, h);
      ctx.clip();
      draw();
      ctx.restore();
    };
    const fill = (colour, x = 0, y = 0, width = cell, height = h) => {
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, width, height);
    };
    paint(0, () => {
      fill('#ff5a4f');
      ctx.fillStyle = '#ffffff';
      starPath(ctx, cell / 2, h / 2, 30);
      ctx.fill();
    });
    paint(1, () => {
      fill('#3b82f6');
      ctx.fillStyle = '#ffffff';
      handPath(ctx, cell / 2, h / 2 + 4, 62);
    });
    paint(2, () => {
      for (let x = 0; x < 8; x += 1) for (let y = 0; y < 5; y += 1) fill((x + y) % 2 ? '#ffffff' : '#27384b', x * 16, y * 16, 16, 16);
    });
    paint(3, () => {
      fill('#27c96b');
      fill('#ffffff', 0, 26, cell, 28);
    });
    // A white flag with a red cross and four small ones, for the country these games were made in.
    paint(4, () => {
      fill('#ffffff');
      fill('#e4342b', 56, 0, 16, h);
      fill('#e4342b', 0, 32, cell, 16);
      for (const [x, y] of [[28, 16], [100, 16], [28, 64], [100, 64]]) {
        fill('#e4342b', x - 3, y - 8, 6, 16);
        fill('#e4342b', x - 8, y - 3, 16, 6);
      }
    });
    paint(5, () => {
      fill('#ffd23f');
      ctx.fillStyle = '#ff5a4f';
      starPath(ctx, cell / 2, h / 2, 30);
      ctx.fill();
    });
    paint(6, () => {
      fill('#a855f7');
      fill('#ffd23f', 0, 0, 42, h);
    });
    paint(7, () => {
      fill('#ff8a2b');
      fill('#ffffff', 0, 0, cell, 16);
      fill('#ffffff', 0, h - 16, cell, 16);
    });
  }, { anisotropy: 2 });
}

/** Flags fluttering, all drawn together. The flutter is done by the graphics card, so it costs nothing. */
class Flags {
  constructor() {
    this.items = [];
  }

  add(x, y, z, turn, size = 1, cell = null) {
    this.items.push({ x, y, z, turn, size, cell: cell ?? this.items.length % FLAG_CELLS });
  }

  finish(parent, time) {
    const geometry = new THREE.PlaneGeometry(1.7, 1.06, 8, 2).translate(0.85, 0, 0);
    const cells = new Float32Array(this.items.length);
    this.items.forEach((item, index) => {
      cells[index] = item.cell;
    });
    geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
    const material = new THREE.MeshLambertMaterial({ map: flagPicture(), side: THREE.DoubleSide });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = `attribute float aCell;\nuniform float uTime;\n${shader.vertexShader}`
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          vMapUv = vec2((uv.x + aCell) / ${FLAG_CELLS.toFixed(1)}, uv.y);`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float flutter = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9;
          transformed.z += sin(position.x * 3.4 - uTime * 5.0 + flutter) * 0.16 * position.x;
          transformed.y += sin(position.x * 2.3 - uTime * 3.4 + flutter) * 0.05 * position.x - position.x * 0.06;`);
    };
    const mesh = new THREE.InstancedMesh(geometry, material, this.items.length);
    const dummy = new THREE.Object3D();
    this.items.forEach((item, index) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.y = item.turn;
      dummy.scale.setScalar(item.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.frustumCulled = false;
    parent.add(mesh);
  }
}

/* ------------------------------- people ------------------------------- */

const SHIRTS = ['#ff5a4f', '#3b82f6', '#ffd23f', '#27c96b', '#a855f7', '#ff8a2b', '#ffffff', '#ff7eb6', '#14b8a6', '#e8eef4'];
const SKINS = ['#f5cfa8', '#e8b48a', '#c98f62', '#9b6a45', '#fbe0c4', '#74492d'];

function peopleMaterial(time, cheer) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uCheer = cheer;
    shader.vertexShader = `uniform float uTime;\nuniform float uCheer;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float seed = instanceMatrix[3].x * 1.3 + instanceMatrix[3].z * 0.7;
      float pace = 3.0 + fract(seed) * 2.0;
      // Bouncing on the spot, and arms swaying over their heads.
      transformed.y += max(0.0, sin(uTime * pace + seed * 6.283)) * uCheer;
      if (position.y > 1.25) transformed.x += sin(uTime * pace * 1.3 + seed) * (position.y - 1.25) * uCheer * 1.6;`,
    );
  };
  return material;
}

/** Everyone watching. Bodies and heads are two meshes, so shirts and faces can be coloured separately. */
class Crowd {
  constructor() {
    this.items = [];
    this.random = seededRandom(31);
  }

  person(x, y, z, turn = 0, size = 1) {
    const { random } = this;
    this.items.push({
      x,
      y,
      z,
      turn: turn + (random() - 0.5) * 0.5,
      size: size * (0.92 + random() * 0.2),
      shirt: SHIRTS[Math.floor(random() * SHIRTS.length)],
      skin: SKINS[Math.floor(random() * SKINS.length)],
    });
  }

  finish(parent, time, cheer) {
    const body = new Mesher()
      .box('#3f5168', -0.13, 0.32, 0, 0.17, 0.64, 0.2)
      .box('#3f5168', 0.13, 0.32, 0, 0.17, 0.64, 0.2)
      .box('#ffffff', 0, 0.94, 0, 0.5, 0.66, 0.28)
      .box('#ffffff', -0.34, 1.42, 0, 0.13, 0.62, 0.13, { rz: 0.32 })
      .box('#ffffff', 0.34, 1.42, 0, 0.13, 0.62, 0.13, { rz: -0.32 })
      .geometry();
    const head = new Mesher()
      .add('blob', '#ffffff', 0, 1.5, 0, 0.42, 0.44, 0.42)
      .geometry();
    const material = peopleMaterial(time, cheer);
    const bodies = new THREE.InstancedMesh(body, material, this.items.length);
    const heads = new THREE.InstancedMesh(head, material, this.items.length);
    const dummy = new THREE.Object3D();
    const colour = new THREE.Color();
    this.items.forEach((item, index) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.y = item.turn;
      dummy.scale.setScalar(item.size);
      dummy.updateMatrix();
      bodies.setMatrixAt(index, dummy.matrix);
      heads.setMatrixAt(index, dummy.matrix);
      bodies.setColorAt(index, colour.set(item.shirt));
      heads.setColorAt(index, colour.set(item.skin));
    });
    for (const mesh of [bodies, heads]) {
      mesh.frustumCulled = false;
      mesh.userData.everyone = this.items.length;
      parent.add(mesh);
    }
    return [bodies, heads];
  }
}

/* ------------------------------- helpers ------------------------------- */

/** Finds where to build: a distance along the road, and how far out from the middle, with right positive. */
class Builder {
  constructor(world) {
    this.world = world;
    this.track = world.track;
    this.terrain = world.terrain;
    this.boards = new Boards();
    this.flags = new Flags();
    this.crowd = new Crowd();
    this.random = seededRandom(778);
    this.point = new THREE.Vector3();
    this.solidMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.twoSided = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  }

  at(distance, lateral) {
    return this.track.pointAt(distance, lateral, this.point).clone();
  }

  ground(x, z) {
    return this.terrain.heightAt(x, z);
  }

  /** The world spot of something placed relative to another spot and its turn. */
  offset(x, z, turn, across, out) {
    return { x: x + Math.cos(turn) * across + Math.sin(turn) * out, z: z - Math.sin(turn) * across + Math.cos(turn) * out };
  }

  /** Adds a finished mesher to the world. parent says which things a slow computer can drop. */
  solid(m, { shadow = true, parent = this.world.scene, material = this.solidMaterial } = {}) {
    if (m.isEmpty) return null;
    const mesh = new THREE.Mesh(m.geometry(), material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  pick(list) {
    return list[Math.floor(this.random() * list.length)];
  }
}

/* ------------------------------- the start line ------------------------------- */

function buildGrandstand(b, m, from, to, side, rows) {
  const { track, crowd, boards, flags, random } = b;
  const bay = 11;
  const depth = 1.25;
  for (let d = from; d < to; d += bay) {
    const middle = d + bay / 2;
    const front = b.at(middle, side * (ROAD_HALF + 6.8));
    const turn = track.facingRoad(middle, side);
    const baseY = front.y;
    m.at(front.x, baseY, front.z, turn, (s) => {
      // The front wall, the rows of seats, the back wall.
      s.box(WHITE, 0, 0.6, 0.2, bay + 0.02, 1.2, 0.5);
      for (let row = 0; row < rows; row += 1) {
        const height = 1.05 + row * 0.72;
        s.box(row % 2 ? '#cfd8e3' : '#dfe6ee', 0, height / 2 - 0.1, -row * depth - depth / 2, bay + 0.02, height + 0.2, depth);
      }
      const backZ = -rows * depth;
      const top = 1.05 + rows * 0.72 + 3;
      s.box('#a9b8c8', 0, top / 2, backZ - 0.2, bay + 0.02, top, 0.4);
      // The roof, with a stripy edge.
      s.box('#f0f3f6', 0, top + 0.2, backZ / 2 - 0.4, bay + 0.02, 0.28, -backZ + 2.8, { rx: 0.1 });
      const stripe = Math.round((d - from) / bay) % 2 ? '#ff5a4f' : '#ffffff';
      s.box(stripe, 0, top - 0.42, 1, bay + 0.02, 1, 0.14);
      s.box('#7f8fa1', -bay / 2 + 0.2, top / 2 + 0.3, 0.3, 0.26, top, 0.26);
      if (Math.round((d - from) / bay) % 2 === 0) {
        s.add('post', '#c2cad3', 0, top + 2.1, -1, 0.1, 3.8, 0.1);
      }
    });
    // Signs along the front.
    const sign = b.offset(front.x, front.z, turn, 0, 0.47);
    boards.add(b.pick(['five', 'title', 'joze', 'smoothie', 'fair', 'turbo', 'balloons', 'mighty']), sign.x, baseY + 0.62, sign.z, turn, 3 * 1, 1);
    const sign2 = b.offset(front.x, front.z, turn, -3.4, 0.47);
    boards.add(b.pick(['five', 'joze', 'wings', 'leap']), sign2.x, baseY + 0.62, sign2.z, turn, 3 * 1, 1);
    const sign3 = b.offset(front.x, front.z, turn, 3.4, 0.47);
    boards.add(b.pick(['title', 'lighthouse', 'five']), sign3.x, baseY + 0.62, sign3.z, turn, 3 * 1, 1);
    if (Math.round((d - from) / bay) % 2 === 0) {
      const top = 1.05 + rows * 0.72 + 3;
      const pole = b.offset(front.x, front.z, turn, 0, -1);
      flags.add(pole.x, baseY + top + 3.4, pole.z, turn + Math.PI / 2, 1.25);
    }

    // Everybody in their seats.
    for (let row = 0; row < rows; row += 1) {
      const seatY = baseY + 1.05 + row * 0.72;
      for (let seat = -bay / 2 + 0.5; seat < bay / 2; seat += 1.02) {
        if (random() > 0.86) continue;
        const spot = b.offset(front.x, front.z, turn, seat + (random() - 0.5) * 0.3, -row * depth - depth / 2);
        crowd.person(spot.x, seatY - 0.15, spot.z, turn, 1.08);
      }
    }
  }
}

function buildStartLine(b) {
  const { track, boards, flags } = b;
  const m = new Mesher();
  const overRoad = new Mesher();
  const point = b.at(0, 0);
  const heading = track.headingAt(0);
  const gantryOut = ROAD_HALF + 2.8;
  const beamY = 10.4;
  overRoad.at(point.x, point.y, point.z, heading, (s) => {
    for (const x of [-gantryOut, gantryOut]) {
      // Each leg is a tower of four posts with cross pieces, in the colours of the start line.
      for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
        s.add('post', '#e8edf2', x + dx, 6, dz, 0.22, 12, 0.22);
      }
      for (let y = 1; y < 12; y += 1.5) {
        s.box('#ff5a4f', x, y, -0.55, 1.2, 0.12, 0.12);
        s.box('#ff5a4f', x, y, 0.55, 1.2, 0.12, 0.12);
        s.box('#ff5a4f', x - 0.55, y, 0, 0.12, 0.12, 1.2);
        s.box('#ff5a4f', x + 0.55, y, 0, 0.12, 0.12, 1.2);
      }
      s.box('#27384b', x, 0.3, 0, 2, 0.6, 2);
    }
    s.box('#e8edf2', 0, beamY + 1.25, 0, gantryOut * 2 + 1.2, 0.4, 0.8);
    s.box('#e8edf2', 0, beamY - 1.25, 0, gantryOut * 2 + 1.2, 0.3, 0.8);
    // The housing for the lights.
    s.box(INK, 0, beamY + 2.45, 0, 7.2, 2, 0.7);
  });
  boards.add('title', point.x, point.y + beamY, point.z, heading + Math.PI, gantryOut * 2 - 1, 2.5);
  const back = b.offset(point.x, point.z, heading + Math.PI, 0, 0.45);
  boards.add('title', back.x, point.y + beamY, back.z, heading + Math.PI, gantryOut * 2 - 1, 2.5);
  const front = b.offset(point.x, point.z, heading, 0, 0.45);
  boards.add('title', front.x, point.y + beamY, front.z, heading, gantryOut * 2 - 1, 2.5);
  for (const side of [-1, 1]) {
    const pole = b.offset(point.x, point.z, heading, side * gantryOut, 0);
    flags.add(pole.x, point.y + 13.4, pole.z, heading + Math.PI / 2, 1.5, 2);
  }
  overRoad.at(point.x, point.y, point.z, heading, (s) => {
    for (const x of [-gantryOut, gantryOut]) s.add('post', '#c2cad3', x, 13, 0, 0.12, 2.4, 0.12);
  });

  // Rows of flags along both sides of the straight.
  for (let d = -112; d < 60; d += 14) {
    for (const side of [-1, 1]) {
      const at = b.at(d, side * (ROAD_HALF + 3));
      m.add('post', '#e8edf2', at.x, at.y + 2.3, at.z, 0.12, 4.6, 0.12);
      flags.add(at.x, at.y + 4.1, at.z, heading + Math.PI / 2, 1);
    }
  }

  buildGrandstand(b, m, -105, 45, 1, 8);
  buildGrandstand(b, m, -56, 21, -1, 5);

  // The garages and the tower, on the other side of the road.
  for (let d = -102; d < -60; d += 8) {
    const at = b.at(d + 4, -(ROAD_HALF + 10));
    const turn = track.facingRoad(d + 4, -1);
    const paint = BRIGHTS[Math.abs(Math.round(d / 8)) % BRIGHTS.length];
    m.at(at.x, at.y, at.z, turn, (s) => {
      s.box('#eef1f4', 0, 2.3, -3, 8.02, 4.6, 7);
      s.box(paint, 0, 1.7, 0.53, 6.4, 3.3, 0.1);
      s.box('#ffffff', 0, 2.2, 0.6, 6.4, 0.12, 0.05);
      s.box('#ffffff', 0, 1.2, 0.6, 6.4, 0.12, 0.05);
      s.box(paint, 0, 4.8, 0.3, 8.02, 0.5, 0.6);
    });
  }
  const tower = b.at(33, -(ROAD_HALF + 14));
  const towerTurn = track.facingRoad(33, -1);
  m.at(tower.x, tower.y, tower.z, towerTurn, (s) => {
    s.box('#eef1f4', 0, 6.5, 0, 6, 13, 6);
    s.box('#27384b', 0, 15, 0, 8.4, 3.4, 8.4);
    s.box('#8fd2fa', 0, 15, 0, 8.6, 2.2, 8.6);
    s.box('#ff5a4f', 0, 17, 0, 9.4, 0.7, 9.4);
    s.add('post', '#c2cad3', 0, 19.6, 0, 0.14, 4.6, 0.14);
  });
  flags.add(tower.x, tower.y + 21, tower.z, towerTurn, 2.2, 2);

  b.solid(m);
  // No shadow across the road from anything overhead, as it would darken much of the picture all at once.
  b.solid(overRoad, { shadow: false });

  // The lights: dark, then one more red for each number of the countdown, and then all green.
  const lampShape = new THREE.CircleGeometry(0.75, 20);
  const dark = new THREE.MeshBasicMaterial({ color: '#3b2e33' });
  const red = new THREE.MeshBasicMaterial({ color: '#ff4b3e' });
  const green = new THREE.MeshBasicMaterial({ color: '#3ddc84' });
  const lamps = [-2.3, 0, 2.3].map((x) => {
    const lamp = new THREE.Mesh(lampShape, dark);
    const spot = b.offset(point.x, point.z, heading + Math.PI, x, 0.4);
    lamp.position.set(spot.x, point.y + beamY + 2.45, spot.z);
    lamp.rotation.y = heading + Math.PI;
    b.world.scene.add(lamp);
    return lamp;
  });
  return {
    /** How many of them are lit up red. */
    set(count) {
      lamps.forEach((lamp, index) => {
        lamp.material = index < count ? red : dark;
      });
    },
    go() {
      for (const lamp of lamps) lamp.material = green;
    },
  };
}

/* ------------------------------- the village ------------------------------- */

/** A house with a balcony. Its front is +Z, and it sits on y = 0. */
function house(s, w, depth, floors, wall, roof, random) {
  const floor = 3.1;
  const height = floors * floor;
  s.box(wall, 0, height / 2 - 1, 0, w, height + 2, depth, { shade: 0.86 });
  s.add('roof', roof, 0, height, 0, w + 0.9, Math.max(2.2, w * 0.42), depth + 1, { shade: 0.84 });
  if (random() > 0.35) s.box(STONE_DARK, w * 0.26, height + 1.5, -depth * 0.15, 0.8, 2.4, 0.8);
  // A door, and windows on each floor.
  const doorX = (random() - 0.5) * (w - 2.4);
  s.box('#7a4c2a', doorX, 1.1, depth / 2 + 0.05, 1.2, 2.2, 0.12);
  s.box('#d9b06a', doorX + 0.4, 1.1, depth / 2 + 0.13, 0.12, 0.12, 0.06);
  for (let f = 0; f < floors; f += 1) {
    const y = f * floor + 1.8;
    const across = Math.max(2, Math.floor(w / 2.6));
    for (let i = 0; i < across; i += 1) {
      const x = (i - (across - 1) / 2) * (w / across);
      if (f === 0 && Math.abs(x - doorX) < 1.3) continue;
      s.box(WHITE, x, y, depth / 2 + 0.04, 1.14, 1.34, 0.1);
      s.box('#5fa9d6', x, y, depth / 2 + 0.09, 0.86, 1.06, 0.06);
    }
  }
  // The carved wooden balcony that the old houses here have.
  if (floors > 1) {
    const y = floor + 0.45;
    s.box('#a8703f', 0, y, depth / 2 + 0.9, w - 0.4, 0.2, 1.7);
    s.box('#c58c56', 0, y + 1.12, depth / 2 + 1.72, w - 0.4, 0.14, 0.14);
    for (let x = -w / 2 + 0.4; x < w / 2 - 0.2; x += 0.62) s.box('#c58c56', x, y + 0.56, depth / 2 + 1.72, 0.1, 1, 0.1);
    s.box('#a8703f', -w / 2 + 0.35, y + 1.35, depth / 2 + 1.7, 0.18, 2.5, 0.18);
    s.box('#a8703f', w / 2 - 0.35, y + 1.35, depth / 2 + 1.7, 0.18, 2.5, 0.18);
  }
}

/** A stone tower of the mountain villages, tall and square with a wider top. */
function stoneTower(s, x, y, z, turn, size = 1) {
  s.at(x, y, z, turn, (t) => {
    t.add('taper', STONE, 0, 9 * size, 0, 7.4 * size, 18 * size, 7.4 * size, { shade: 0.82 });
    t.box(STONE, 0, 17 * size, 0, 5.2 * size, 3 * size, 5.2 * size, { shade: 0.9 });
    for (const [wx, wz] of [[0, 2.65], [0, -2.65], [2.65, 0], [-2.65, 0]]) {
      t.box('#3b3a3a', wx * size, 17 * size, wz * size, (wz ? 1.2 : 0.2) * size, 1.5 * size, (wx ? 1.2 : 0.2) * size);
    }
    t.box(STONE_DARK, 0, 18.7 * size, 0, 5.6 * size, 0.4 * size, 5.6 * size);
    t.add('spire', '#7d6f5e', 0, 20 * size, 0, 7 * size, 2.4 * size, 7 * size);
  });
}

function church(s, x, y, z, turn) {
  s.at(x, y, z, turn, (c) => {
    c.box(STONE, 0, 3.5, 0, 7, 9, 13, { shade: 0.86 });
    c.box(STONE, 0, 3.5, 0, 12, 7, 6, { shade: 0.86 });
    c.add('roof', '#7f8b84', 0, 8, 0, 7.8, 2.6, 14);
    c.add('roof', '#7f8b84', 0, 7, 0, 7, 2.6, 12.8, { ry: Math.PI / 2 });
    c.add('cylinder', STONE, 0, 10.8, 0, 4, 5, 4, { shade: 0.9 });
    c.add('cone', '#7f8b84', 0, 14.5, 0, 4.8, 3.2, 4.8);
    c.box('#efe8d8', 0, 16.7, 0, 0.16, 1.4, 0.16);
    c.box('#efe8d8', 0, 16.9, 0, 0.8, 0.14, 0.16);
    for (const a of [0, 1.05, 2.1, 3.15, 4.2, 5.25]) c.box('#3b3a3a', Math.sin(a) * 2, 11, Math.cos(a) * 2, 0.4, 1.4, 0.4, { ry: a });
    c.box('#7a4c2a', 0, 1.3, 6.55, 1.8, 2.6, 0.12);
  });
}

function buildVillage(b) {
  const { track, random, crowd } = b;
  const m = new Mesher();
  const walls = ['#f5e6c8', '#f2c9a0', '#e8efe6', '#f4d58d', '#d9e6f2', '#e9b8a0', '#f7f0df', '#cfe3d4'];
  const roofs = ['#c9604a', '#b5533f', '#d17a54', '#8c5a4a', '#7f8b84'];
  const [from, to] = PLACES.village;
  for (const side of [-1, 1]) {
    let d = from + random() * 5;
    while (d < to) {
      const w = 6 + random() * 3.4;
      const depth = 6.5 + random() * 2;
      const floors = random() > 0.3 ? 2 : 1;
      const gap = 6.6 + random() * 1.4 + depth / 2;
      const at = b.at(d + w / 2, side * (ROAD_HALF + gap));
      const y = b.ground(at.x, at.z);
      m.at(at.x, y, at.z, track.facingRoad(d + w / 2, side), (s) => house(s, w, depth, floors, b.pick(walls), b.pick(roofs), random));
      // A second row behind, taller, and not lined up, so that it reads as a place and not a street set.
      const behind = b.at(d + w / 2 + 3, side * (ROAD_HALF + gap + depth + 5 + random() * 3));
      if (random() > 0.25) {
        const y2 = b.ground(behind.x, behind.z);
        m.at(behind.x, y2, behind.z, track.facingRoad(d + w / 2, side) + (random() - 0.5) * 0.5, (s) => house(s, w * 0.9, depth, floors + 1, b.pick(walls), b.pick(roofs), random));
      }
      d += w + 1.5 + random() * 3;
    }
  }

  // Lamps down the street, with strings of little flags across it.
  const buntingColours = ['#ff5a4f', '#ffd23f', '#3b82f6', '#27c96b', '#ff7eb6'];
  const pennants = new Mesher();
  for (let d = from + 8; d < to; d += 26) {
    const left = b.at(d, -(ROAD_HALF + 2.9));
    const right = b.at(d, ROAD_HALF + 2.9);
    for (const spot of [left, right]) {
      m.add('post', '#3f4a58', spot.x, spot.y + 4.4, spot.z, 0.18, 8.8, 0.18);
      m.add('ball', '#fff3c4', spot.x, spot.y + 8.9, spot.z, 0.6);
    }
    stringOfFlags(pennants, left, right, 8.9, 0.9, 9, buntingColours);
  }

  // Market stalls and people out in front of the houses.
  for (let d = from + 6; d < to; d += 13 + random() * 8) {
    const side = random() > 0.5 ? 1 : -1;
    const at = b.at(d, side * (ROAD_HALF + 4.4));
    const turn = track.facingRoad(d, side);
    if (random() > 0.45) {
      m.at(at.x, at.y, at.z, turn, (s) => stall(s, b.pick(buntingColours), random));
    }
    for (let i = 0; i < 3; i += 1) {
      const spot = b.offset(at.x, at.z, turn, (random() - 0.5) * 6, 0.8 + random());
      crowd.person(spot.x, at.y - 0.2, spot.z, turn);
    }
  }

  // Up on the rise behind: the church and the old stone towers.
  const up = (d, out) => {
    const at = b.at(d, out);
    return [at.x, b.ground(at.x, at.z), at.z];
  };
  const [cx, cy, cz] = up(205, 48);
  church(m, cx, cy - 0.5, cz, track.facingRoad(205, 1) - 0.3);
  for (const [d, out, size] of [[150, 46, 1.05], [172, 54, 0.9], [232, 56, 1], [252, 44, 0.85], [130, 52, 0.8]]) {
    const [x, y, z] = up(d, out);
    stoneTower(m, x, y - 0.6, z, random(), size);
  }
  b.solid(m);
  b.solid(pennants, { shadow: false, material: b.twoSided, parent: b.world.small });
}

/** A market stall, facing +Z. */
function stall(s, colour, random) {
  s.box(WOOD, -1.4, 1, -0.6, 0.12, 2, 0.12);
  s.box(WOOD, 1.4, 1, -0.6, 0.12, 2, 0.12);
  s.box(WOOD, 0, 0.7, 0.2, 3.2, 0.9, 1.1);
  s.box(colour, 0, 2.3, -0.1, 3.5, 0.14, 2.2, { rx: 0.2 });
  s.box('#ffffff', -0.9, 2.31, -0.1, 0.8, 0.15, 2.22, { rx: 0.2 });
  s.box('#ffffff', 0.9, 2.31, -0.1, 0.8, 0.15, 2.22, { rx: 0.2 });
  for (let i = 0; i < 8; i += 1) {
    s.add('ball', ['#ff5a4f', '#ff8a2b', '#ffd23f', '#7ac74f'][i % 4], -1.2 + i * 0.34, 1.25, 0.15 + (random() - 0.5) * 0.6, 0.3);
  }
}

/** Little flags on a string between two spots, hanging a little in the middle. */
function stringOfFlags(m, from, to, height, sag, count, colours) {
  const point = (share) => [
    lerp(from.x, to.x, share),
    lerp(from.y, to.y, share) + height - Math.sin(share * Math.PI) * sag,
    lerp(from.z, to.z, share),
  ];
  for (let i = 0; i < count; i += 1) {
    const a = point((i + 0.15) / count);
    const c = point((i + 0.85) / count);
    const middle = point((i + 0.5) / count);
    m.triangle(colours[i % colours.length], a, c, [middle[0], middle[1] - 0.62, middle[2]]);
  }
}

/* ------------------------------- the tunnel ------------------------------- */

const TUNNEL_WIDTH = 9.2;
const TUNNEL_WALL = 4.6;
const TUNNEL_RISE = 6.4;
const TUNNEL_TILE = 24;

/**
 * The inside of the tunnel is painted in bright, pale colours and lit evenly, with long bands of colour and
 * one unbroken strip of light, so that going in doesn't change how bright the picture is, and nothing
 * goes past in the regular flashes that tunnel lights usually do.
 */
function tunnelPainting() {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    // Across the picture is around the arch, from one floor over the roof to the other. Down the picture is along the road.
    const sky = ctx.createLinearGradient(0, 0, w, 0);
    sky.addColorStop(0, '#b8a688');
    sky.addColorStop(0.1, '#d6bf86');
    sky.addColorStop(0.2, '#7fbcd9');
    sky.addColorStop(0.5, '#9fd0ea');
    sky.addColorStop(0.8, '#7fbcd9');
    sky.addColorStop(0.9, '#d6bf86');
    sky.addColorStop(1, '#b8a688');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // Long bands, which never break, so they can't flicker.
    for (const [x, width, colour] of [[120, 26, '#e68473'], [160, 18, '#e0b35c'], [w - 146, 26, '#e68473'], [w - 178, 18, '#e0b35c']]) {
      ctx.fillStyle = colour;
      ctx.fillRect(x, 0, width, h);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(w / 2 - 52, 0, 104, h);
    ctx.fillStyle = '#fff6d8';
    ctx.fillRect(w / 2 - 24, 0, 48, h);
    // Pictures on the walls, soft enough not to jump out as they go by.
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffb703';
    starPath(ctx, 250, 110, 46);
    ctx.fill();
    starPath(ctx, w - 250, 360, 46);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    handPath(ctx, 250, 360, 110);
    handPath(ctx, w - 250, 110, 110);
    ctx.globalAlpha = 1;
  }, { repeat: true });
}

function archPoint(share) {
  const steps = 0.16;
  if (share < steps) return { lateral: -TUNNEL_WIDTH, height: (share / steps) * TUNNEL_WALL };
  if (share > 1 - steps) return { lateral: TUNNEL_WIDTH, height: ((1 - share) / steps) * TUNNEL_WALL };
  const angle = Math.PI * (1 - (share - steps) / (1 - 2 * steps));
  return { lateral: Math.cos(angle) * TUNNEL_WIDTH, height: TUNNEL_WALL + Math.sin(angle) * TUNNEL_RISE };
}

function buildTunnel(b) {
  const { track, boards, terrain, world } = b;
  const [from, to] = PLACES.tunnel;
  const stations = Math.round((to - from) / 3);
  const around = 20;
  const positions = [];
  const uvs = [];
  const indices = [];
  const corner = new THREE.Vector3();
  for (let i = 0; i <= stations; i += 1) {
    const d = from + ((to - from) * i) / stations;
    for (let j = 0; j <= around; j += 1) {
      const share = j / around;
      const { lateral, height } = archPoint(share);
      track.pointAt(d, lateral, corner);
      positions.push(corner.x, corner.y + height, corner.z);
      uvs.push(share, (d - from) / TUNNEL_TILE);
    }
  }
  for (let i = 0; i < stations; i += 1) {
    for (let j = 0; j < around; j += 1) {
      const a = i * (around + 1) + j;
      const c = a + around + 1;
      indices.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  const inside = new THREE.BufferGeometry();
  inside.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  inside.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  inside.setIndex(indices);
  const shell = new THREE.Mesh(inside, new THREE.MeshBasicMaterial({ map: tunnelPainting(), side: THREE.DoubleSide, fog: false }));
  world.scene.add(shell);

  // The hill closes over the top of the tunnel, with the same colours as the land each side of it.
  const capAcross = 14;
  const capPositions = [];
  const capColours = [];
  const capIndices = [];
  const colour = new THREE.Color();
  const capReach = 36;
  for (let i = 0; i <= stations; i += 1) {
    const d = from - 1 + ((to - from + 2) * i) / stations;
    const roadY = track.heightAt(d);
    for (let j = 0; j <= capAcross; j += 1) {
      const lateral = -capReach + (2 * capReach * j) / capAcross;
      track.pointAt(d, lateral, corner);
      const dome = 12.2 + 13 * (1 - (lateral / capReach) ** 2);
      const bumps = 1.2 * Math.sin(corner.x * 0.4 + d * 0.2) + 0.9 * Math.cos(corner.z * 0.33 - d * 0.31);
      const y = roadY + dome + bumps;
      capPositions.push(corner.x, y, corner.z);
      terrain.colourAt(colour, corner.x, y, corner.z, Math.abs(lateral) > 26 ? 0.2 : 0.55);
      capColours.push(colour.r, colour.g, colour.b);
    }
  }
  for (let i = 0; i < stations; i += 1) {
    for (let j = 0; j < capAcross; j += 1) {
      const a = i * (capAcross + 1) + j;
      const c = a + capAcross + 1;
      capIndices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(capPositions, 3));
  cap.setAttribute('color', new THREE.Float32BufferAttribute(capColours, 3));
  cap.setIndex(capIndices);
  cap.computeVertexNormals();
  const capMesh = new THREE.Mesh(cap, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  capMesh.receiveShadow = true;
  world.scene.add(capMesh);

  // The stone front at each end, with the arch cut out of it.
  const outline = new THREE.Shape();
  outline.moveTo(-34, -1.5);
  outline.lineTo(34, -1.5);
  outline.lineTo(34, 25);
  outline.lineTo(-34, 25);
  outline.closePath();
  const hole = new THREE.Path();
  const holePoints = 18;
  for (let j = 0; j <= holePoints; j += 1) {
    const { lateral, height } = archPoint(j / holePoints);
    if (j === 0) hole.moveTo(lateral, -1.5);
    hole.lineTo(lateral, height);
  }
  hole.lineTo(TUNNEL_WIDTH, -1.5);
  hole.closePath();
  outline.holes.push(hole);
  const face = faceted(new THREE.ExtrudeGeometry(outline, { depth: 3, bevelEnabled: false, curveSegments: 4 }));
  // A ring of bigger stones around the arch.
  const ringShape = new THREE.Shape();
  ringShape.moveTo(-TUNNEL_WIDTH - 1.7, -1.5);
  for (let j = 0; j <= holePoints; j += 1) {
    const { lateral, height } = archPoint(j / holePoints);
    if (height <= 0.01) continue;
    const reach = (TUNNEL_WIDTH + 1.7) / TUNNEL_WIDTH;
    const rise = height > TUNNEL_WALL ? TUNNEL_WALL + (height - TUNNEL_WALL) * ((TUNNEL_RISE + 1.7) / TUNNEL_RISE) : height;
    ringShape.lineTo(lateral * reach, rise);
  }
  ringShape.lineTo(TUNNEL_WIDTH + 1.7, -1.5);
  ringShape.closePath();
  const inner = new THREE.Path();
  for (let j = 0; j <= holePoints; j += 1) {
    const { lateral, height } = archPoint(j / holePoints);
    if (j === 0) inner.moveTo(lateral, -1.5);
    inner.lineTo(lateral, height);
  }
  inner.lineTo(TUNNEL_WIDTH, -1.5);
  inner.closePath();
  ringShape.holes.push(inner);
  const ring = faceted(new THREE.ExtrudeGeometry(ringShape, { depth: 3.5, bevelEnabled: false, curveSegments: 4 }));

  const m = new Mesher();
  const rockColours = ['#9aa3a8', '#8e979d', '#a6aeb3'];
  const random = seededRandom(14);
  for (const [d, facing] of [[from, 0], [to, Math.PI]]) {
    const point = b.at(d, 0);
    const turn = track.headingAt(d) + facing;
    m.at(point.x, point.y, point.z, turn + Math.PI, (s) => {
      s.add(face, '#b0a998', 0, 0, 0);
      s.add(ring, '#cfc2a8', 0, 0, 0);
      s.box('#f0c75e', 0, TUNNEL_WALL + TUNNEL_RISE + 0.9, 3.5, 2.2, 2.6, 0.5);
    });
    const sign = b.offset(point.x, point.z, turn + Math.PI, 0, 3.8);
    boards.add('tunnel', sign.x, point.y + TUNNEL_WALL + TUNNEL_RISE + 4.6, sign.z, turn + Math.PI, 13, 4.3);
    // Boulders where the stone meets the hill.
    for (let i = 0; i < 16; i += 1) {
      const side = i % 2 ? 1 : -1;
      const out = side * (TUNNEL_WIDTH + 4 + random() * 22);
      const spot = b.offset(point.x, point.z, turn, out, -2 - random() * 5 + 6);
      const size = 3 + random() * 6;
      m.add('rock', rockColours[i % 3], spot.x, b.ground(spot.x, spot.z) + size * 0.2, spot.z, size * 1.5, size, size * 1.2, { ry: random() * TAU, shade: 0.76 });
    }
    // Rock across the top of the arch too.
    for (let i = 0; i < 7; i += 1) {
      const out = -24 + i * 8;
      const spot = b.offset(point.x, point.z, turn + Math.PI, out, -0.5);
      const size = 3.5 + random() * 3;
      m.add('rock', rockColours[i % 3], spot.x, point.y + 22 + random() * 3, spot.z, size * 1.8, size, size * 1.3, { ry: random() * TAU, shade: 0.8 });
    }
  }
  // It doesn't throw a shadow, so going through it doesn't change how bright the picture is.
  b.solid(m, { shadow: false });
}

/* ------------------------------- the bridge ------------------------------- */

function buildBridge(b) {
  const { track, flags } = b;
  const m = new Mesher();
  const [from, to] = PLACES.bridge;
  const span = (to - from) / 3;
  const archShape = (width, height) => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, -height);
    shape.lineTo(-width / 2 + 1, -height);
    shape.absarc(0, -height + 1, width / 2 - 1, Math.PI, 0, true);
    shape.lineTo(width / 2, -height);
    shape.lineTo(width / 2, 0);
    shape.lineTo(-width / 2, 0);
    shape.closePath();
    return shape;
  };
  const roadTop = track.heightAt((from + to) / 2);
  const deepest = roadTop - WATER_LEVEL + 4;
  const arch = faceted(new THREE.ExtrudeGeometry(archShape(span + 0.3, deepest), { depth: (ROAD_HALF + 2.4) * 2, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -(ROAD_HALF + 2.4)));
  for (let i = 0; i < 3; i += 1) {
    const d = from + span * (i + 0.5);
    const point = b.at(d, 0);
    // The arch is drawn across the road, so this turns it to run along it.
    m.at(point.x, point.y - 0.12, point.z, track.headingAt(d) + Math.PI / 2, (s) => s.add(arch, STONE, 0, 0, 0));
  }
  // The walls each side of the road, with a lamp and a flag at each end.
  const step = 2.4;
  for (let d = from - 3; d < to + 3; d += step) {
    for (const side of [-1, 1]) {
      const at = b.at(d + step / 2, side * (ROAD_HALF + 1.6));
      const heading = track.headingAt(d + step / 2);
      const pillar = Math.round((d - from) / step) % 4 === 0;
      m.at(at.x, at.y, at.z, heading, (s) => {
        s.box(pillar ? '#c9bda6' : STONE, 0, pillar ? 0.75 : 0.5, 0, pillar ? 0.9 : 0.55, pillar ? 1.5 : 1, step + 0.02, { shade: 0.85 });
        s.box('#d8cdb7', 0, pillar ? 1.56 : 1.06, 0, pillar ? 1 : 0.7, 0.12, step + 0.04);
      });
    }
  }
  for (const d of [from - 2, to + 2]) {
    for (const side of [-1, 1]) {
      const at = b.at(d, side * (ROAD_HALF + 1.7));
      m.add('post', '#3f4a58', at.x, at.y + 3.8, at.z, 0.2, 7.6, 0.2);
      m.add('ball', '#fff3c4', at.x, at.y + 7.8, at.z, 0.7);
      flags.add(at.x, at.y + 6.4, at.z, track.headingAt(d) + Math.PI / 2, 1.1);
    }
  }
  b.solid(m);
}

/* ------------------------------- the lake ------------------------------- */

function buildLake(b) {
  const { track, world, random, crowd } = b;
  const m = new Mesher();
  const y = WATER_LEVEL;

  // A little island with a lighthouse, for The Lighthouse Keeper.
  const [ix, iz] = [78, -38];
  m.add('rock', '#b8b1a0', ix, y + 0.6, iz, 24, 5, 20, { shade: 0.8 });
  m.add('rock', '#a6a092', ix + 4, y + 1.6, iz - 3, 12, 5, 11, { shade: 0.8 });
  m.add('disc', '#8fd06a', ix, y + 3, iz, 9, 1, 8);
  const bands = ['#ffffff', '#ff5a4f', '#ffffff', '#ff5a4f', '#ffffff'];
  bands.forEach((colour, index) => {
    const w = 4.6 - index * 0.46;
    m.add('taper', colour, ix, y + 5 + index * 3, iz, w, 3, w, { shade: 0.9 });
  });
  m.add('cylinder', '#27384b', ix, y + 19.4, iz, 2.5, 0.3, 2.5);
  m.add('cylinder', '#ffe9a8', ix, y + 20.5, iz, 1.9, 2.2, 1.9);
  m.add('cone', '#ff5a4f', ix, y + 22.6, iz, 3, 2, 3);

  // A wooden jetty, and umbrellas on the beach, near the road.
  const jetty = b.at(636, -(ROAD_HALF + 20));
  const turn = track.facingRoad(636, -1) + Math.PI;
  m.at(jetty.x, y, jetty.z, turn, (s) => {
    s.box('#b98b5a', 0, 0.9, 12, 3.2, 0.25, 24);
    for (let z = 1; z < 24; z += 4) {
      s.add('post', '#8a5a3c', -1.5, 0.3, z, 0.24, 2, 0.24);
      s.add('post', '#8a5a3c', 1.5, 0.3, z, 0.24, 2, 0.24);
    }
  });
  for (let d = 586; d < 680; d += 9 + random() * 7) {
    const at = b.at(d, -(ROAD_HALF + 11 + random() * 7));
    const ground = b.ground(at.x, at.z);
    if (ground < y + 0.3) continue;
    const colour = b.pick(BRIGHTS);
    m.add('post', '#efe8d8', at.x, ground + 1.2, at.z, 0.1, 2.4, 0.1);
    m.add('cone', colour, at.x, ground + 2.5, at.z, 3.6, 0.9, 3.6, { shade: 0.8 });
    m.box(b.pick(BRIGHTS), at.x + 1.4, ground + 0.08, at.z + 0.5, 0.9, 0.1, 1.9, { ry: random() });
    if (random() > 0.4) crowd.person(at.x - 0.8, ground - 0.1, at.z + 1, track.facingRoad(d, -1));
  }
  b.solid(m);

  // Boats, bobbing on the water.
  const boats = [];
  for (const [x, z, sail, hull, size] of [[20, -18, '#ffffff', '#ff5a4f', 1.15], [105, -30, '#ffd23f', '#3b82f6', 1], [30, -62, '#ff7eb6', '#ffffff', 0.9], [-8, -40, '#ffffff', '#27c96b', 1], [64, -6, '#ff8a2b', '#f7f4ec', 0.85]]) {
    const hullShape = new Mesher()
      .add('ball', hull, 0, 0.3, 0, 2.2, 1.1, 5.2, { shade: 0.85 })
      .box('#f4e7bb', 0, 0.75, 0, 1.2, 0.1, 3)
      .add('post', WOOD, 0, 3.5, 0.1, 0.12, 6, 0.12)
      .geometry();
    const boat = new THREE.Mesh(hullShape, b.solidMaterial);
    const sailShape = new THREE.BufferGeometry();
    sailShape.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.4, -1.9, 0, 6.2, 0, 0, 1.4, 0.05, 0, 1.3, 0.25, 0, 5.2, 0.25, 0, 1.3, 1.9], 3));
    sailShape.computeVertexNormals();
    const sailMesh = new THREE.Mesh(sailShape, new THREE.MeshLambertMaterial({ color: sail, side: THREE.DoubleSide }));
    boat.add(sailMesh);
    boat.position.set(x, y + 0.1, z);
    boat.scale.setScalar(size);
    boat.rotation.y = random() * TAU;
    world.distant.add(boat);
    boats.push({ boat, phase: random() * TAU, baseY: boat.position.y });
  }
  if (!world.reducedMotion) {
    world.animate((dt, time) => {
      for (const { boat, phase, baseY } of boats) {
        boat.position.y = baseY + Math.sin(time * 0.9 + phase) * 0.14;
        boat.rotation.z = Math.sin(time * 0.7 + phase) * 0.05;
      }
    });
  }
}

/* ------------------------------- the farm ------------------------------- */

function buildFarm(b) {
  const { world, random, terrain } = b;
  const m = new Mesher();
  const barnAt = [150, -172];
  const by = b.ground(...barnAt);
  // A red barn, facing the road.
  m.at(barnAt[0], by, barnAt[1], 0.35, (s) => {
    s.box('#c9412f', 0, 3, 0, 12, 7, 15, { shade: 0.85 });
    s.add('roof', '#6b4a3a', 0, 6.4, 0, 13.2, 3.4, 16);
    s.box(WHITE, 0, 2.2, 7.56, 5, 4.4, 0.1);
    s.box('#a8321f', -1.2, 2.2, 7.62, 2.2, 4, 0.1);
    s.box('#a8321f', 1.2, 2.2, 7.62, 2.2, 4, 0.1);
    s.box(WHITE, 0, 6.8, 7.56, 2, 1.4, 0.1);
    // A silo beside it.
    s.add('cylinder', '#dfe4e8', 9.5, 5.5, -3, 4.4, 13, 4.4, { shade: 0.85 });
    s.add('ball', '#8fa0ae', 9.5, 12, -3, 4.6, 3.2, 4.6);
  });
  // The farmhouse.
  const houseAt = [190, -190];
  m.at(houseAt[0], b.ground(...houseAt), houseAt[1], 0.2, (s) => house(s, 9, 7.5, 2, '#f4e6c8', '#b5533f', random));

  // A windmill on the rise, with sails that go round.
  const millAt = [122, -205];
  const my = b.ground(...millAt);
  m.add('taper', '#f1eadc', millAt[0], my + 6.5, millAt[1], 8.6, 14, 8.6, { shade: 0.84 });
  m.add('cone', '#b5533f', millAt[0], my + 14.6, millAt[1], 7, 3, 7);
  m.box('#7a4c2a', millAt[0] + 2.2, my + 1.2, millAt[1] + 3.3, 1.2, 2.3, 0.2, { ry: 0.5 });
  const sails = new Mesher();
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * TAU;
    sails.box(WOOD, Math.sin(angle) * 4.2, Math.cos(angle) * 4.2, 0, 0.26, 9, 0.2, { rz: -angle });
    sails.box('#fbf7ec', Math.sin(angle) * 4.8 + Math.cos(angle) * 0.72, Math.cos(angle) * 4.8 - Math.sin(angle) * 0.72, 0.05, 1.3, 6.8, 0.08, { rz: -angle });
  }
  const sailMesh = new THREE.Mesh(sails.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  sailMesh.position.set(millAt[0] + 1.3, my + 12.5, millAt[1] + 3.9);
  sailMesh.rotation.y = 0.32;
  world.distant.add(sailMesh);
  world.animate((dt) => {
    sailMesh.rotateZ(dt * (world.reducedMotion ? 0.15 : 0.7));
  });

  // Fields in stripes, lying on the land. The colours are close, so they can't flicker.
  const field = (cx, cz, along, across, turn, a, c, rows) => {
    const cells = 6;
    for (let r = 0; r < rows; r += 1) {
      for (let k = 0; k < cells; k += 1) {
        const lx = -along / 2 + (along * (k + 0.5)) / cells;
        const lz = -across / 2 + (across * (r + 0.5)) / rows;
        const x = cx + Math.cos(turn) * lx + Math.sin(turn) * lz;
        const z = cz - Math.sin(turn) * lx + Math.cos(turn) * lz;
        m.box(r % 2 ? a : c, x, terrain.heightAt(x, z) + 0.02, z, along / cells + 0.25, 0.3, across / rows + 0.02, { ry: turn });
      }
    }
  };
  field(205, -228, 72, 44, 0.25, '#e8cf6a', '#dcbf56', 10);
  field(135, -243, 66, 40, 0.25, '#a7d65a', '#96c950', 10);
  field(262, -200, 44, 50, -0.4, '#d9a35c', '#cb9650', 12);
  field(60, -275, 60, 34, 0.2, '#f2b4c8', '#e9a5bb', 8);

  // Bales in the field, a fence along the road, and the animals.
  for (let i = 0; i < 18; i += 1) {
    const x = 180 + random() * 60;
    const z = -245 + random() * 36;
    m.add('cylinder', '#e6c766', x, b.ground(x, z) + 0.9, z, 1.8, 2, 1.8, { rz: Math.PI / 2, ry: random() * TAU, shade: 0.84 });
  }
  b.solid(m);

  const animals = new Mesher()
    .box('#ffffff', 0, 0.85, 0, 0.8, 0.75, 1.6, { shade: 0.86 })
    .box('#ffffff', 0, 1.15, 0.95, 0.5, 0.5, 0.56)
    .box('#ffffff', -0.28, 0.25, 0.6, 0.16, 0.5, 0.16)
    .box('#ffffff', 0.28, 0.25, 0.6, 0.16, 0.5, 0.16)
    .box('#ffffff', -0.28, 0.25, -0.6, 0.16, 0.5, 0.16)
    .box('#ffffff', 0.28, 0.25, -0.6, 0.16, 0.5, 0.16)
    .geometry();
  const herd = [];
  for (let i = 0; i < 26; i += 1) {
    const x = 190 + random() * 80;
    const z = -170 - random() * 22 + (i % 3) * -12;
    herd.push({ x, z, tint: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#f2e7d5' : '#7a5a44', size: 1 + random() * 0.5, spin: random() * TAU });
  }
  const mesh = new THREE.InstancedMesh(animals, b.solidMaterial, herd.length);
  const dummy = new THREE.Object3D();
  const colour = new THREE.Color();
  herd.forEach((animal, index) => {
    dummy.position.set(animal.x, b.ground(animal.x, animal.z), animal.z);
    dummy.rotation.y = animal.spin;
    dummy.scale.setScalar(animal.size);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, colour.set(animal.tint));
  });
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  world.medium.add(mesh);
}

/* ------------------------------- Joze's family ------------------------------- */

function giraffe(m, x, y, z, turn, size) {
  const hide = '#f5c451';
  const spot = '#b4682c';
  m.at(x, y, z, turn, (s) => {
    const part = (shape, colour, px, py, pz, sx, sy = sx, sz = sx, extra) => s.add(shape, colour, px * size, py * size, pz * size, sx * size, sy * size, sz * size, extra);
    for (const [lx, lz] of [[-0.42, 0.9], [0.42, 0.9], [-0.42, -0.9], [0.42, -0.9]]) {
      part('post', hide, lx, 1.35, lz, 0.32, 2.7, 0.32);
      part('post', '#5a3a1c', lx, 0.14, lz, 0.38, 0.28, 0.38);
    }
    part('ball', hide, 0, 3, 0, 1.75, 1.6, 3.2);
    part('post', hide, 0, 4.6, 1.05, 0.62, 3.8, 0.62, { rx: 0.35 });
    part('ball', hide, 0, 6.5, 1.82, 0.8, 0.86, 1.3, { rx: 0.2 });
    part('ball', '#fff0c9', 0, 6.3, 2.36, 0.56, 0.5, 0.6);
    part('ball', '#ffffff', 0.34, 6.72, 2.1, 0.26);
    part('ball', '#ffffff', -0.34, 6.72, 2.1, 0.26);
    part('ball', '#2c1a0f', 0.38, 6.72, 2.2, 0.14);
    part('ball', '#2c1a0f', -0.38, 6.72, 2.2, 0.14);
    part('post', hide, 0.2, 7.12, 1.6, 0.1, 0.5, 0.1);
    part('post', hide, -0.2, 7.12, 1.6, 0.1, 0.5, 0.1);
    part('ball', '#5a3a1c', 0.2, 7.4, 1.6, 0.17);
    part('ball', '#5a3a1c', -0.2, 7.4, 1.6, 0.17);
    part('ball', hide, 0.58, 6.86, 1.5, 0.46, 0.2, 0.2);
    part('ball', hide, -0.58, 6.86, 1.5, 0.46, 0.2, 0.2);
    for (const [px, py, pz, r] of [[0.78, 3.2, 0.7, 0.42], [0.8, 2.9, -0.5, 0.48], [0.62, 3.6, -1, 0.34], [-0.78, 3.2, 0.5, 0.44], [-0.8, 2.9, -0.7, 0.44], [-0.6, 3.6, -0.1, 0.34], [0, 3.76, 0.3, 0.42], [0, 3.72, -0.8, 0.42], [0.26, 4.6, 1.15, 0.2], [-0.26, 5, 1.35, 0.2], [0.24, 5.5, 1.55, 0.16], [-0.25, 4.1, 0.92, 0.2]]) {
      part('ball', spot, px, py, pz, r, r, r * 0.45, { ry: px > 0.3 ? Math.PI / 2 : px < -0.3 ? -Math.PI / 2 : 0, rx: Math.abs(px) < 0.3 ? -Math.PI / 2 : 0 });
    }
    part('post', hide, 0, 3.1, -1.72, 0.08, 1.4, 0.08, { rx: -0.3 });
    part('ball', '#5a3a1c', 0, 2.4, -1.92, 0.2, 0.4, 0.2);
  });
}

function buildFamily(b) {
  const { track, boards } = b;
  const m = new Mesher();
  // Close to the road, and much taller than the cars, so that nobody misses them.
  const spots = [[1026, 13, 1.75, 0.5], [1048, 17, 1.5, -0.3], [1008, 19, 1.35, 0.7], [1037, 9.5, 0.8, 0.1], [1066, 13, 1.05, 0.2]];
  for (const [d, out, size, twist] of spots) {
    const at = b.at(d, ROAD_HALF + out);
    giraffe(m, at.x, b.ground(at.x, at.z) - 0.05, at.z, track.facingRoad(d, 1) + twist, size);
  }
  // Their sign, with Joze on it.
  const sign = b.at(985, ROAD_HALF + 12);
  const turn = track.facingRoad(985, 1) - 0.5;
  const y = b.ground(sign.x, sign.z);
  m.at(sign.x, y, sign.z, turn, (s) => {
    s.add('post', WOOD, -3.6, 2.2, -0.1, 0.3, 4.4, 0.3);
    s.add('post', WOOD, 3.6, 2.2, -0.1, 0.3, 4.4, 0.3);
    s.box(WOOD, 0, 4.2, -0.15, 9.6, 3.3, 0.12);
  });
  const face = b.offset(sign.x, sign.z, turn, 0, 0);
  boards.add('joze', face.x, y + 4.2, face.z, turn, 9.2, 3.05);
  b.solid(m);
}

/* ------------------------------- the Harvest Fair ------------------------------- */

function buildFair(b) {
  const { world, random, crowd, flags } = b;
  const m = new Mesher();
  const [cx, cz] = [-196, -18];

  // The big wheel: the frame stands still and the wheel goes round.
  const wheelAt = [-212, -40];
  const wy = b.ground(...wheelAt);
  const radius = 17;
  const hub = wy + radius + 3;
  const facing = 0.75;
  m.at(wheelAt[0], wy, wheelAt[1], facing, (s) => {
    for (const z of [-2.2, 2.2]) {
      s.box('#e4e9ee', 0, hub - wy, z, 1.2, 1.2, 0.3);
      s.box('#c2cad3', -6.5, (hub - wy) / 2, z, 0.5, hub - wy + 2.5, 0.5, { rz: -0.34 });
      s.box('#c2cad3', 6.5, (hub - wy) / 2, z, 0.5, hub - wy + 2.5, 0.5, { rz: 0.34 });
    }
    s.box('#c2cad3', 0, hub - wy, 0, 0.6, 0.6, 5);
  });
  const wheel = new THREE.Group();
  wheel.position.set(wheelAt[0], hub, wheelAt[1]);
  wheel.rotation.y = facing;
  const spin = new THREE.Group();
  wheel.add(spin);
  const frame = new Mesher();
  const cabins = [];
  const count = 12;
  for (const z of [-1.1, 1.1]) {
    for (let i = 0; i < 48; i += 1) {
      const angle = (i / 48) * TAU;
      const hue = BRIGHTS[i % BRIGHTS.length];
      frame.box(i % 8 < 4 ? '#ffffff' : hue, Math.sin(angle) * radius, Math.cos(angle) * radius, z, 2.42, 0.34, 0.34, { rz: -angle });
    }
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * TAU;
      frame.box('#e4e9ee', (Math.sin(angle) * radius) / 2, (Math.cos(angle) * radius) / 2, z, 0.2, radius, 0.2, { rz: -angle });
    }
  }
  spin.add(new THREE.Mesh(frame.geometry(), b.solidMaterial));
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * TAU;
    const cabinShape = new Mesher()
      .box(BRIGHTS[i % BRIGHTS.length], 0, -1.35, 0, 2.2, 1.3, 1.5, { shade: 0.86 })
      .box('#ffffff', 0, -0.25, 0, 2.5, 0.2, 1.8)
      .box('#c2cad3', -0.95, -0.7, 0, 0.1, 1, 0.1)
      .box('#c2cad3', 0.95, -0.7, 0, 0.1, 1, 0.1)
      .geometry();
    const cabin = new THREE.Mesh(cabinShape, b.solidMaterial);
    cabin.position.set(Math.sin(angle) * radius, Math.cos(angle) * radius, 0);
    spin.add(cabin);
    cabins.push(cabin);
  }
  world.distant.add(wheel);
  const turnWheel = (dt) => {
    spin.rotation.z += dt * (world.reducedMotion ? 0.03 : 0.1);
    // The cabins hang straight, whichever way the wheel has turned.
    for (const cabin of cabins) cabin.rotation.z = -spin.rotation.z;
  };
  turnWheel(0);
  world.animate(turnWheel);

  // The roundabout, which goes round too.
  const merryAt = [-168, -2];
  const my = b.ground(...merryAt);
  m.at(merryAt[0], my, merryAt[1], 0, (s) => {
    s.add('cylinder', '#f4e7bb', 0, 0.3, 0, 13, 0.6, 13);
    s.add('cylinder', '#ff7eb6', 0, 3, 0, 2, 5.4, 2);
  });
  const merry = new THREE.Group();
  merry.position.set(merryAt[0], my, merryAt[1]);
  const top = new Mesher();
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * TAU;
    top.add('roof', i % 2 ? '#ffffff' : '#ff5a4f', Math.sin(angle) * 3.4, 5.3, Math.cos(angle) * 3.4, 3.9, 1.7, 7, { ry: angle + Math.PI / 2 });
  }
  top.add('cone', '#ffd23f', 0, 7.4, 0, 2.6, 2, 2.6);
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * TAU;
    const x = Math.sin(angle) * 5;
    const z = Math.cos(angle) * 5;
    const paint = BRIGHTS[i % BRIGHTS.length];
    top.add('post', '#d9dee3', x, 3, z, 0.12, 4.8, 0.12);
    top.at(x, 1.7, z, angle + Math.PI / 2, (h) => {
      h.add('ball', paint, 0, 0, 0, 0.74, 0.74, 1.6);
      h.add('ball', paint, 0, 0.5, 0.74, 0.5, 0.74, 0.5);
      for (const [lx, lz] of [[-0.24, 0.5], [0.24, 0.5], [-0.24, -0.5], [0.24, -0.5]]) h.add('post', paint, lx, -0.46, lz, 0.14, 0.7, 0.14);
    });
  }
  merry.add(new THREE.Mesh(top.geometry(), b.solidMaterial));
  world.distant.add(merry);
  world.animate((dt) => {
    merry.rotation.y += dt * (world.reducedMotion ? 0.05 : 0.35);
  });

  // Tents and stalls in rows, with people between them.
  const tents = [[-226, 10], [-212, 18], [-198, 24], [-184, 28], [-232, -6], [-158, 26], [-178, -32], [-164, -26], [-148, -14]];
  tents.forEach(([x, z], index) => {
    const y = b.ground(x, z);
    const paint = BRIGHTS[index % BRIGHTS.length];
    m.at(x, y, z, random(), (s) => {
      s.add('cylinder', '#ffffff', 0, 1.3, 0, 8, 2.6, 8);
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * TAU;
        s.add('roof', i % 2 ? paint : '#ffffff', Math.sin(angle) * 2, 2.6, Math.cos(angle) * 2, 3.3, 2.6, 4.4, { ry: angle + Math.PI / 2 });
      }
      s.add('post', '#d9dee3', 0, 6, 0, 0.1, 1.6, 0.1);
    });
    flags.add(x, y + 6.7, z, random() * TAU, 0.8);
  });
  for (let i = 0; i < 90; i += 1) {
    const angle = random() * TAU;
    const out = Math.sqrt(random()) * 52;
    const x = cx + Math.cos(angle) * out;
    const z = cz + Math.sin(angle) * out;
    if (Math.hypot(x - merryAt[0], z - merryAt[1]) < 8 || Math.hypot(x - wheelAt[0], z - wheelAt[1]) < 9) continue;
    crowd.person(x, b.ground(x, z) - 0.05, z, random() * TAU);
  }
  // The smoothie stand, with fruit on its roof.
  const standAt = [-196, 32];
  const sy = b.ground(...standAt);
  m.at(standAt[0], sy, standAt[1], Math.PI, (s) => {
    s.box('#ffe9b0', 0, 1.3, 0, 9, 2.6, 4);
    s.box('#ff7eb6', 0, 3.1, 0.6, 10, 0.3, 5.4, { rx: 0.14 });
    s.add('ball', '#ff8a2b', -2.8, 4.4, 0, 2.4);
    s.add('ball', '#ff5a4f', 0, 4.8, -0.4, 2.8);
    s.add('ball', '#7ac74f', 2.8, 4.4, 0, 2.2);
  });
  b.solid(m);
}

/* ------------------------------- bridges over the road, and signs ------------------------------- */

function buildFootbridge(b, d, poster) {
  const { track, boards, crowd, flags } = b;
  const m = new Mesher();
  const at = b.at(d, 0);
  const heading = track.headingAt(d);
  const out = ROAD_HALF + 4.4;
  const deck = 10.6;
  m.at(at.x, at.y, at.z, heading, (s) => {
    for (const x of [-out, out]) {
      s.box('#f0c75e', x, deck / 2, 0, 1.3, deck + 1, 1.3, { shade: 0.86 });
      s.box('#27384b', x, 0.3, 0, 2.2, 0.6, 2.2);
      s.box('#f0c75e', x, deck + 2.6, -1.6, 0.34, 3.2, 0.34);
      s.box('#f0c75e', x, deck + 2.6, 1.6, 0.34, 3.2, 0.34);
    }
    s.box('#d97b3f', 0, deck, 0, out * 2 + 1.6, 0.5, 3.8);
    s.box('#f7f4ec', 0, deck + 1.1, -1.75, out * 2 + 1.6, 0.14, 0.14);
    s.box('#f7f4ec', 0, deck + 1.1, 1.75, out * 2 + 1.6, 0.14, 0.14);
    for (let x = -out; x <= out; x += 1.6) {
      s.box('#f7f4ec', x, deck + 0.6, -1.75, 0.1, 1, 0.1);
      s.box('#f7f4ec', x, deck + 0.6, 1.75, 0.1, 1, 0.1);
    }
    s.add('roof', '#ff5a4f', 0, deck + 4.1, 0, 4.4, 1.8, out * 2 + 2.4, { ry: Math.PI / 2 });
  });
  for (const facing of [Math.PI, 0]) {
    const spot = b.offset(at.x, at.z, heading, 0, facing === Math.PI ? -2.05 : 2.05);
    boards.add(poster, spot.x, at.y + deck - 1.15, spot.z, heading + facing, 13, 2);
  }
  for (let x = -out + 1; x < out; x += 1.4) {
    const spot = b.offset(at.x, at.z, heading, x, (b.random() - 0.5) * 1.6);
    crowd.person(spot.x, at.y + deck + 0.2, spot.z, heading + Math.PI);
  }
  for (const x of [-out, out]) {
    const spot = b.offset(at.x, at.z, heading, x, 0);
    flags.add(spot.x, at.y + deck + 6, spot.z, heading + Math.PI / 2, 1.4);
    m.add('post', '#c2cad3', spot.x, at.y + deck + 5, spot.z, 0.1, 2.4, 0.1);
  }
  b.solid(m, { shadow: false });
}

function buildBillboards(b) {
  const { track, boards } = b;
  const m = new Mesher();
  const posts = [
    [62, 1, 'five'], [262, -1, 'turbo'], [316, 1, 'mighty'], [530, -1, 'smoothie'], [700, 1, 'lighthouse'], [840, 1, 'leap'],
    [905, -1, 'wings'], [990, -1, 'balloons'], [1110, 1, 'fair'], [1215, 1, 'turbo'], [1245, 1, 'smoothie'], [1275, 1, 'wings'],
    [1228, -1, 'five'], [1262, -1, 'joze'], [1300, -1, 'mighty'],
  ];
  for (const [d, side, poster] of posts) {
    const at = b.at(d, side * (ROAD_HALF + 11));
    const y = Math.max(b.ground(at.x, at.z), at.y - 0.5);
    const turn = track.facingRoad(d, side) + side * -0.45;
    const w = 15;
    const h = 5;
    m.at(at.x, y, at.z, turn, (s) => {
      s.add('post', '#7f8fa1', -w * 0.34, 3.2, -0.3, 0.42, 6.4, 0.42);
      s.add('post', '#7f8fa1', w * 0.34, 3.2, -0.3, 0.42, 6.4, 0.42);
      s.box('#f7fafc', 0, 6.3, -0.2, w + 0.8, h + 0.8, 0.3);
      s.box(INK, 0, 3.78, -0.14, w + 0.8, 0.22, 0.5);
    });
    const spot = b.offset(at.x, at.z, turn, 0, 0);
    boards.add(poster, spot.x, y + 6.3, spot.z, turn, w, h);
  }
  b.solid(m);
}

/** Small things that go by close to the road, which is most of what says how fast the car is going. */
function buildRoadside(b) {
  const { track, world, random, crowd, flags } = b;
  const near = new Mesher();
  // Marker posts, a long way apart and with soft colours, so that they can't make a flicker.
  for (let d = 10; d < track.length; d += 38) {
    if (d > PLACES.tunnel[0] - 8 && d < PLACES.tunnel[1] + 8) continue;
    for (const side of [-1, 1]) {
      const at = b.at(d, side * (ROAD_HALF + 3));
      near.add('post', '#f4f6f8', at.x, at.y + 0.5, at.z, 0.16, 1.1, 0.16);
      near.add('post', '#ff8d80', at.x, at.y + 0.86, at.z, 0.17, 0.2, 0.17);
    }
  }
  // Tyres stacked on the outside of the bends, and arrow boards to say which way it goes.
  for (let d = 0; d < track.length; d += 9) {
    const bend = track.curvatureAt(d);
    if (Math.abs(bend) < 0.016 || (d > PLACES.tunnel[0] - 10 && d < PLACES.tunnel[1] + 10)) continue;
    const side = -Math.sign(bend);
    const at = b.at(d, side * (ROAD_HALF + 4.4));
    for (let high = 0; high < 3; high += 1) {
      near.add('cylinder', high % 2 ? '#ff8d80' : '#f4f6f8', at.x, at.y + 0.2 + high * 0.34, at.z, 1, 0.32, 1);
    }
    if (Math.round(d / 9) % 3 === 0) {
      const turn = track.facingRoad(d, side) - side * 0.9;
      near.at(at.x, at.y, at.z, turn, (s) => {
        s.add('post', '#7f8fa1', 0, 1.1, -0.1, 0.14, 2.2, 0.14);
        s.box('#f7fafc', 0, 2.2, 0, 2.4, 1.1, 0.1);
        const point = bend > 0 ? -1 : 1;
        s.add('spire', '#ff6b5e', point * 0.3, 2.2, 0.08, 0.7, 0.8, 0.05, { rz: point * -Math.PI / 2 });
      });
    }
  }
  b.solid(near, { parent: world.medium });

  // Fences and walls along parts of the road.
  const fence = new Mesher();
  const along = (from, to, side, every, out, draw) => {
    for (let d = from; d < to; d += every) {
      const a = b.at(d, side * (ROAD_HALF + out));
      draw(a, d, track.headingAt(d));
    }
  };
  // A white fence along the farm, in long enough rails that they read as lines and not as stripes.
  along(495, 585, 1, 4, 5.4, (a, d, heading) => {
    fence.at(a.x, a.y, a.z, heading, (s) => {
      s.box('#f7fafc', 0, 0.55, 0, 0.14, 1.1, 0.14);
      s.box('#f7fafc', 0, 0.9, 2, 0.08, 0.12, 4);
      s.box('#f7fafc', 0, 0.5, 2, 0.08, 0.12, 4);
    });
  });
  // A low stone wall along the forest.
  for (const side of [-1, 1]) {
    along(832, 990, side, 3, 5.6, (a, d, heading) => {
      const y = Math.max(a.y - 0.3, b.ground(a.x, a.z));
      fence.at(a.x, y, a.z, heading, (s) => s.add('rock', random() > 0.5 ? STONE : STONE_DARK, 0, 0.3, 0, 1.1, 0.9, 3.4, { shade: 0.82 }));
    });
  }
  // Wooden rails along the lake side.
  along(600, 700, -1, 5, 4.8, (a, d, heading) => {
    fence.at(a.x, a.y, a.z, heading, (s) => {
      s.box(WOOD, 0, 0.6, 0, 0.16, 1.2, 0.16);
      s.box(WOOD, 0, 1, 2.5, 0.1, 0.14, 5);
    });
  });
  b.solid(fence, { parent: world.medium });

  // Groups of fans at the roadside, with flags.
  const fans = [[300, 1], [470, 1], [560, -1], [745, -1], [860, 1], [960, -1], [1060, 1], [1150, -1], [1250, 1], [1120, 1]];
  const m = new Mesher();
  for (const [d, side] of fans) {
    for (let i = 0; i < 9; i += 1) {
      const at = b.at(d + (i - 4) * 1.5 + random(), side * (ROAD_HALF + 6 + random() * 2.5));
      crowd.person(at.x, Math.max(b.ground(at.x, at.z), at.y - 0.3), at.z, track.facingRoad(d, side));
    }
    const pole = b.at(d - 7, side * (ROAD_HALF + 6));
    m.add('post', '#e8edf2', pole.x, pole.y + 2, pole.z, 0.1, 4, 0.1);
    flags.add(pole.x, pole.y + 3.6, pole.z, track.headingAt(d) + Math.PI / 2, 1);
    const pole2 = b.at(d + 7, side * (ROAD_HALF + 6));
    m.add('post', '#e8edf2', pole2.x, pole2.y + 2, pole2.z, 0.1, 4, 0.1);
    flags.add(pole2.x, pole2.y + 3.6, pole2.z, track.headingAt(d) + Math.PI / 2, 1);
  }
  b.solid(m, { parent: world.medium });
}

/** Tents and caravans in the meadow by the grandstand. */
function buildMeadow(b) {
  const { random } = b;
  const m = new Mesher();
  for (let i = 0; i < 14; i += 1) {
    const x = 16 + (i % 5) * 10 + random() * 3;
    const z = 40 + Math.floor(i / 5) * 12 + random() * 3;
    const y = b.ground(x, z);
    const paint = b.pick(BRIGHTS);
    m.at(x, y, z, random() * TAU, (s) => {
      if (i % 4 === 3) {
        s.box(WHITE, 0, 1.4, 0, 2.3, 2.1, 4.8, { shade: 0.86 });
        s.box(paint, 0, 1, 0, 2.34, 0.5, 4.84);
        s.box('#5fa9d6', 0, 1.8, 2.42, 1.4, 0.7, 0.05);
      } else {
        s.add('roof', paint, 0, 0, 0, 3.4, 2.1, 4.4, { shade: 0.82 });
      }
    });
  }
  b.solid(m, { parent: b.world.medium });
}

export function buildPlaces(world) {
  const b = new Builder(world);
  const startLights = buildStartLine(b);
  buildVillage(b);
  buildTunnel(b);
  buildFarm(b);
  buildLake(b);
  buildBridge(b);
  buildFamily(b);
  buildFair(b);
  buildFootbridge(b, 1182, 'fair');
  buildFootbridge(b, 1290, 'title');
  buildFootbridge(b, 680, 'five');
  buildBillboards(b);
  buildRoadside(b);
  buildMeadow(b);

  b.boards.finish(world.scene);
  b.flags.finish(world.scene, world.time);
  const crowd = b.crowd.finish(world.scene, world.time, world.cheer);
  return { startLights, crowd };
}

