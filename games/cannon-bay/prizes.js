// The prizes of Cannon Bay's higher levels, floating on the water: gems, hearts, a key, a treasure chest,
// a sailor in a cage, and the power-ups, which are ring buoys with a picture of what they do above them.
// They bob gently and turn slowly, and nothing about them flashes: they're mid-bright colours, and go
// by shrinking away rather than blinking. All built from simple shapes, with no image files.
import * as THREE from '../../vendor/three/three.module.js';
import { mergeParts, toon } from '../../core/body/characters.js';

const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const pole = (top, bottom, height, sides = 8) => new THREE.CylinderGeometry(top, bottom, height, sides);
const ball = (x = 1, y = x, z = x) => new THREE.SphereGeometry(1, 12, 9).scale(x, y, z);

const MOST = { gem: 40, heart: 6, key: 3, chest: 3, cage: 4, power: 8 };
// The power-ups' colours and pictures. The pictures are the same as on the cards and the top of the screen.
export const POWER_LOOKS = {
  triple: { colour: '#ff9f43', mark: '🍡' },
  shield: { colour: '#4fb6ff', mark: '🛡️' },
  bubble: { colour: '#7fd6ff', mark: '🫧' },
  magnet: { colour: '#ff5d6c', mark: '🧲' },
  bounce: { colour: '#ffb03b', mark: '🏐' },
  snow: { colour: '#b9e6ff', mark: '❄️' },
};
const GEM_COLOURS = ['#4cc3ff', '#ff6fae', '#62e38a'];

function heartGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -1.6);
  shape.bezierCurveTo(-0.6, -0.9, -2.2, -0.3, -2.1, 0.8);
  shape.bezierCurveTo(-2, 1.9, -0.6, 2.2, 0, 1.1);
  shape.bezierCurveTo(0.6, 2.2, 2, 1.9, 2.1, 0.8);
  shape.bezierCurveTo(2.2, -0.3, 0.6, -0.9, 0, -1.6);
  return new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 2, curveSegments: 10 }).translate(0, 0, -0.45);
}

const KEY = () => mergeParts([
  { geometry: new THREE.TorusGeometry(1.3, 0.42, 8, 16), colour: '#f2b830', at: [-2.4, 0, 0] },
  { geometry: box(4.2, 0.7, 0.7), colour: '#f2b830', at: [0.7, 0, 0] },
  { geometry: box(0.6, 1.2, 0.7), colour: '#f2b830', at: [2.2, -0.8, 0] },
  { geometry: box(0.6, 0.9, 0.7), colour: '#f2b830', at: [1.2, -0.7, 0] },
]);

const CHEST = () => mergeParts([
  { geometry: box(9, 5, 6), colour: '#9a5b2a', at: [0, 2.5, 0] },
  { geometry: pole(3, 3, 9, 12).rotateZ(Math.PI / 2), colour: '#b8743a', at: [0, 5, 0], size: [1, 0.55, 1] },
  { geometry: box(9.4, 0.8, 6.3), colour: '#f2b830', at: [0, 4.6, 0] },
  { geometry: box(0.8, 7.6, 6.4), colour: '#f2b830', at: [-3, 3.6, 0] },
  { geometry: box(0.8, 7.6, 6.4), colour: '#f2b830', at: [3, 3.6, 0] },
  { geometry: box(1.6, 1.8, 0.6), colour: '#f2b830', at: [0, 3.6, 3.2] },
  // A float underneath, so it sits up out of the water.
  { geometry: pole(5.6, 5.6, 1.2, 16), colour: '#e6d3a8', at: [0, -0.3, 0] },
]);

/** A round raft with a cage on it, and a sailor in a striped top inside, waving. */
const CAGE = () => {
  const parts = [
    { geometry: pole(5, 5, 1.2, 16), colour: '#b8743a', at: [0, 0, 0] },
    { geometry: pole(4.4, 4.4, 0.5, 16), colour: '#8a5a2b', at: [0, 6.6, 0] },
    { geometry: ball(0.9), colour: '#8a5a2b', at: [0, 7.3, 0] },
    // The sailor: legs, body, head with a little hat.
    { geometry: pole(0.9, 1.1, 2.4, 8), colour: '#2f4fa0', at: [0, 1.8, 0] },
    { geometry: pole(1.2, 1.3, 2, 10), colour: '#f4efe2', at: [0, 3.9, 0] },
    { geometry: pole(1.25, 1.25, 0.5, 10), colour: '#2f6fed', at: [0, 3.9, 0] },
    { geometry: ball(1.05), colour: '#f2c8a0', at: [0, 5.5, 0] },
    { geometry: pole(0.9, 1.1, 0.5, 10), colour: '#ffffff', at: [0, 6.3, 0] },
    { geometry: ball(0.32, 0.6, 0.32), colour: '#f2c8a0', at: [1.5, 5.6, 0.3], turn: [0, 0, -0.5] },
  ];
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    parts.push({ geometry: pole(0.18, 0.18, 6.2, 5), colour: '#6a4524', at: [Math.cos(angle) * 4.1, 3.5, Math.sin(angle) * 4.1] });
  }
  return mergeParts(parts);
};

const RING = () => mergeParts([
  { geometry: new THREE.TorusGeometry(3.2, 1.05, 10, 22).rotateX(Math.PI / 2), colour: '#ffffff' },
]);

const RING_BANDS = () => mergeParts([0, 1, 2, 3].map((i) => ({ geometry: new THREE.TorusGeometry(3.22, 1.12, 8, 4, 0.5).rotateX(Math.PI / 2).rotateY((i / 4) * Math.PI * 2), colour: '#ffffff' })));

function instanced(scene, geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  return mesh;
}

/** A picture in a soft round badge, to stand over a power-up. */
function badgeTexture(mark, colour) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.strokeStyle = colour;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = '70px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mark, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class PrizeDrawing {
  constructor(scene, waterHeight, reducedMotion) {
    this.waterHeight = waterHeight;
    this.calm = reducedMotion ? 0.35 : 1;
    const paint = () => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() });
    this.meshes = {
      gem: instanced(scene, new THREE.OctahedronGeometry(2.3).scale(1, 1.45, 1), new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toon() }), MOST.gem),
      heart: instanced(scene, heartGeometry(), new THREE.MeshToonMaterial({ color: '#f0506e', gradientMap: toon() }), MOST.heart),
      key: instanced(scene, KEY(), paint(), MOST.key),
      chest: instanced(scene, CHEST(), paint(), MOST.chest),
      cage: instanced(scene, CAGE(), paint(), MOST.cage),
      power: instanced(scene, RING(), new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toon() }), MOST.power),
      bands: instanced(scene, RING_BANDS(), new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toon() }), MOST.power),
    };
    const tint = new THREE.Color();
    for (let i = 0; i < MOST.gem; i += 1) this.meshes.gem.setColorAt(i, tint.set(GEM_COLOURS[i % GEM_COLOURS.length]));
    for (let i = 0; i < MOST.power; i += 1) {
      this.meshes.power.setColorAt(i, tint.set('#ffffff'));
      this.meshes.bands.setColorAt(i, tint.set('#e8433f'));
    }
    this.badges = new Map(Object.entries(POWER_LOOKS).map(([kind, { mark, colour }]) => [kind, new THREE.SpriteMaterial({ map: badgeTexture(mark, colour), transparent: true, depthWrite: false })]));
    this.sprites = Array.from({ length: MOST.power }, () => {
      const sprite = new THREE.Sprite(this.badges.get('triple'));
      sprite.visible = false;
      sprite.scale.setScalar(7);
      scene.add(sprite);
      return sprite;
    });
    this.matrix = new THREE.Matrix4();
    this.at = new THREE.Vector3();
    this.turn = new THREE.Quaternion();
    this.tilt = new THREE.Euler();
    this.size = new THREE.Vector3();
    this.tint = tint;
    // The colour each gem and each power-up's bands have now, so they're only sent again when they change.
    this.colours = { gem: Array.from({ length: MOST.gem }, (_, i) => i % GEM_COLOURS.length), bands: [] };
  }

  /** Gives one gem or power-up its colour, if it hasn't got it already. */
  colour(kind, index, colour) {
    if (this.colours[kind][index] === colour) return;
    this.colours[kind][index] = colour;
    this.meshes[kind].setColorAt(index, this.tint.set(kind === 'gem' ? GEM_COLOURS[colour % GEM_COLOURS.length] : colour));
    this.recoloured.add(kind);
  }

  /** prizes from the rules, and the cages being towed behind pirate ships, as [{ x, z }]. */
  update(prizes, towed, time) {
    const { matrix, at, turn, tilt, size, calm, meshes } = this;
    const counts = { gem: 0, heart: 0, key: 0, chest: 0, cage: 0, power: 0 };
    this.recoloured = new Set();
    const place = (kind, x, z, lift, spin, scale, phase, colourIndex = null) => {
      const index = counts[kind];
      if (index >= MOST[kind]) return -1;
      counts[kind] += 1;
      const bob = Math.sin(time * 1.8 + phase) * 0.5 * calm;
      at.set(x, this.waterHeight(x, z) + lift + bob, z);
      tilt.set(Math.sin(time * 1.1 + phase) * 0.06 * calm, spin, Math.cos(time * 0.9 + phase) * 0.06 * calm);
      turn.setFromEuler(tilt);
      size.setScalar(scale);
      meshes[kind].setMatrixAt(index, matrix.compose(at, turn, size));
      if (colourIndex !== null && kind === 'gem') this.colour('gem', index, colourIndex);
      return index;
    };
    for (const sprite of this.sprites) sprite.visible = false;
    for (const prize of prizes) {
      // Each shrinks away at the very end of its time.
      const scale = Number.isFinite(prize.left) ? Math.min(1, prize.left / 1.2) : 1;
      const spin = time * 0.9 * Math.max(0.4, calm) + prize.phase;
      if (prize.kind === 'gem') place('gem', prize.x, prize.z, 4.2, spin, scale, prize.phase, prize.colour ?? 0);
      else if (prize.kind === 'heart') place('heart', prize.x, prize.z, 5, spin, scale * 1.15, prize.phase);
      else if (prize.kind === 'key') place('key', prize.x, prize.z, 4.5, spin, scale * 1.2, prize.phase);
      else if (prize.kind === 'chest') place('chest', prize.x, prize.z, 0.6, prize.phase, scale, prize.phase);
      else if (prize.kind === 'cage') place('cage', prize.x, prize.z, 0.4, prize.phase + time * 0.2, scale, prize.phase);
      else if (prize.kind === 'power') {
        const index = place('power', prize.x, prize.z, 0.8, spin * 0.4, scale, prize.phase);
        if (index < 0) continue;
        meshes.bands.setMatrixAt(index, matrix);
        const look = POWER_LOOKS[prize.power];
        if (look) this.colour('bands', index, look.colour);
        const sprite = this.sprites[index];
        sprite.material = this.badges.get(prize.power) ?? sprite.material;
        sprite.visible = true;
        sprite.position.set(prize.x, this.waterHeight(prize.x, prize.z) + 9 + Math.sin(time * 1.8 + prize.phase) * 0.5 * calm, prize.z);
        sprite.scale.setScalar(8 * scale);
      }
    }
    for (const { x, z, phase } of towed) place('cage', x, z, 0.4, phase, 1, phase);
    counts.bands = counts.power;
    // Only what's on the water is sent to the graphics card: most of the time, that's nothing at all.
    for (const [kind, mesh] of Object.entries(meshes)) {
      mesh.count = counts[kind];
      if (mesh.count === 0) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (this.recoloured.has(kind)) mesh.instanceColor.needsUpdate = true;
    }
  }
}
