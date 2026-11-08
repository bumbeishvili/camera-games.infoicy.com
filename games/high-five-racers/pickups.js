// Things on the road: stars to catch, and ramps to jump. Neither is in the way, and missing either
// costs nothing. Where they are depends on the level (rules.js), and both are laid out again for each.
import * as THREE from '../../vendor/three/three.module.js';
import { canvasTexture, lerp, mod, TAU } from './kit.js';
import { GATE_SPOTS, RAMP_SPOTS } from './track.js';

const STAR_HEIGHT = 1.55;
const STARS_PER_TRAIL = 6;
const STAR_SPACING = 8.5;
const RAMP_LENGTH = 7;
const RAMP_HEIGHT = 1.05;
export const RAMP_HALF_WIDTH = 2.9;
const STAR_ROOM = 160; // Stars the one mesh has room for, which is more than any level has.
const LEVEL_ONE_RAMPS = RAMP_SPOTS.map((along) => ({ along, lateral: 0 }));

function starGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? 1 : 0.46;
    const angle = (i / 10) * TAU + Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 });
  geometry.translate(0, 0, -0.1);
  return geometry;
}

/** Trails of stars that lead across the road to the next big hand, so following them gets you there. */
export class StarField {
  constructor(scene, track) {
    this.track = track;
    this.mesh = new THREE.InstancedMesh(
      starGeometry(),
      new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#c98a00', emissiveIntensity: 0.55, roughness: 0.35 }),
      STAR_ROOM,
    );
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.dummy = new THREE.Object3D();
    scene.add(this.mesh);
    this.setLayout(GATE_SPOTS, LEVEL_ONE_RAMPS);
  }

  /** Stars for a level's big hands, a list of [along, side], and its ramps, a list of { along, lateral }. */
  setLayout(gateSpots, ramps) {
    const { track } = this;
    this.stars = [];
    const add = (along, lateral, lift = 0) => {
      const position = track.pointAt(along, lateral, new THREE.Vector3());
      position.y += STAR_HEIGHT + lift;
      this.stars.push({ along: mod(along, track.length), lateral, position, takenOnLap: -2, spin: along * 0.3 });
    };
    // A ramp to one side has its own stars, so a trail doesn't go through them.
    const overSideRamp = (along) => ramps.some((ramp) => ramp.lateral !== 0 && along > ramp.along - 4 && along < ramp.along + 30);
    gateSpots.forEach(([along, side], index) => {
      const fromSide = index === 0 ? 0 : gateSpots[index - 1][1] * 1.2;
      // Two big hands close together have a shorter trail, which starts after the first.
      const after = index === 0 ? -Infinity : gateSpots[index - 1][0] + 6;
      let count = STARS_PER_TRAIL;
      while (count > 2 && along - 12 - (count - 1) * STAR_SPACING < after) count -= 1;
      for (let i = 0; i < count; i += 1) {
        const share = i / (count - 1);
        const eased = share * share * (3 - 2 * share);
        const at = along - 12 - (count - 1 - i) * STAR_SPACING;
        if (!overSideRamp(at)) add(at, lerp(fromSide, side * 3.6, eased));
      }
    });
    // An arc of stars over each ramp, in the air where a jump goes.
    for (const ramp of ramps) {
      for (let i = 0; i < 5; i += 1) {
        const share = i / 4;
        add(ramp.along + 7 + i * 5.2, ramp.lateral, 0.5 + 1.6 * Math.sin(share * Math.PI));
      }
    }
    this.stars = this.stars.slice(0, STAR_ROOM);
    this.mesh.count = this.stars.length;
  }

  reset() {
    for (const star of this.stars) star.takenOnLap = -2;
  }

  /** The nearest star still ahead, for when the car is steering itself. */
  nextLane(position, lap) {
    let lane = null;
    let nearest = 46;
    for (const star of this.stars) {
      if (star.takenOnLap === lap) continue;
      const ahead = mod(star.along - position, this.track.length);
      if (ahead < nearest) {
        nearest = ahead;
        lane = star.lateral;
      }
    }
    return lane;
  }

  collect(position, lateral, lap, onCollect) {
    for (const star of this.stars) {
      if (star.takenOnLap === lap) continue;
      const between = Math.abs(star.along - position);
      if (between < 3.4 && Math.abs(star.lateral - lateral) < 2.6) {
        star.takenOnLap = lap;
        onCollect(star);
      }
    }
  }

  update(time, lap, visible) {
    this.stars.forEach((star, index) => {
      const show = visible && star.takenOnLap !== lap;
      this.dummy.position.copy(star.position);
      this.dummy.position.y += Math.sin(time * 2 + star.spin) * 0.14;
      this.dummy.rotation.y = time * 1.6 + star.spin;
      this.dummy.scale.setScalar(show ? 0.85 : 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function rampTexture() {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ffb627';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff6dc';
    ctx.lineWidth = 0;
    for (const y of [36, 110, 184]) {
      ctx.beginPath();
      ctx.moveTo(w / 2, y - 26);
      ctx.lineTo(w - 14, y + 22);
      ctx.lineTo(w - 44, y + 22);
      ctx.lineTo(w / 2, y - 4);
      ctx.lineTo(44, y + 22);
      ctx.lineTo(14, y + 22);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#ff6a4d';
    ctx.fillRect(0, 0, 10, h);
    ctx.fillRect(w - 10, 0, 10, h);
  });
}

/** A wedge on the road. Anything going over it at speed takes off, and lands softly. */
export class Ramps {
  constructor(scene, track) {
    this.track = track;
    this.scene = scene;
    this.materials = [new THREE.MeshLambertMaterial({ map: rampTexture() }), new THREE.MeshLambertMaterial({ color: '#d9553c' })];
    const shape = new THREE.BufferGeometry();
    const hw = RAMP_HALF_WIDTH;
    const L = RAMP_LENGTH;
    const H = RAMP_HEIGHT;
    // Back to front along +Z, with the high end at the far side.
    const positions = new Float32Array([
      // The slope.
      -hw, 0, 0, hw, H, L, hw, 0, 0, -hw, 0, 0, -hw, H, L, hw, H, L,
      // The sides and the far end.
      hw, 0, 0, hw, H, L, hw, 0, L, -hw, 0, 0, -hw, 0, L, -hw, H, L,
      -hw, 0, L, hw, 0, L, hw, H, L, -hw, 0, L, hw, H, L, -hw, H, L,
    ]);
    const uvs = new Float32Array(18 * 2);
    uvs.set([0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1]);
    shape.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    shape.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    shape.computeVertexNormals();
    shape.addGroup(0, 6, 0);
    shape.addGroup(6, 12, 1);
    this.shape = shape;
    this.pool = [];
    this.setLayout(LEVEL_ONE_RAMPS);
  }

  /** Puts the ramps where a level says: a list of { along, lateral }, with lateral 0 for the middle. */
  setLayout(ramps) {
    const { track } = this;
    while (this.pool.length < ramps.length) {
      const mesh = new THREE.Mesh(this.shape, this.materials);
      mesh.rotation.order = 'YXZ';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.pool.push(mesh);
    }
    ramps.forEach(({ along, lateral }, index) => {
      const mesh = this.pool[index];
      track.pointAt(along, lateral, mesh.position);
      mesh.position.y += 0.06;
      mesh.rotation.y = track.headingAt(along);
      mesh.rotation.x = -track.pitchAt(along);
      mesh.visible = true;
    });
    for (const mesh of this.pool.slice(ramps.length)) mesh.visible = false;
    this.layout = ramps.map((ramp) => ({ ...ramp }));
    this.spots = ramps.map(({ along }) => along);
  }

  /** How far up a ramp the road is here, or 0. */
  liftAt(distance, lateral) {
    const here = mod(distance, this.track.length);
    for (const ramp of this.layout) {
      if (Math.abs(lateral - ramp.lateral) > RAMP_HALF_WIDTH) continue;
      const onto = here - ramp.along;
      if (onto >= 0 && onto <= RAMP_LENGTH) return (onto / RAMP_LENGTH) * RAMP_HEIGHT;
    }
    return 0;
  }

  /** Whether a car going from one distance to the next just went off the end of a ramp. */
  launches(from, to, lateral) {
    const a = mod(from, this.track.length);
    const moved = to - from;
    if (moved <= 0 || moved > 6) return false;
    return this.layout.some((ramp) => Math.abs(lateral - ramp.lateral) <= RAMP_HALF_WIDTH && mod(ramp.along + RAMP_LENGTH - a, this.track.length) <= moved);
  }
}
