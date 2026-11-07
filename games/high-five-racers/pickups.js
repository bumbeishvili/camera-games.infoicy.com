// Things on the road: stars to catch, and ramps to jump. Neither is in the way, and missing either
// costs nothing.
import * as THREE from '../../vendor/three/three.module.js';
import { canvasTexture, lerp, mod, TAU } from './kit.js';
import { GATE_SPOTS, RAMP_SPOTS } from './track.js';

const STAR_HEIGHT = 1.55;
const STARS_PER_TRAIL = 6;
const STAR_SPACING = 8.5;
const RAMP_LENGTH = 7;
const RAMP_HEIGHT = 1.05;
export const RAMP_HALF_WIDTH = 2.9;

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
    this.stars = [];
    const add = (along, lateral, lift = 0) => {
      const position = track.pointAt(along, lateral, new THREE.Vector3());
      position.y += STAR_HEIGHT + lift;
      this.stars.push({ along: mod(along, track.length), lateral, position, takenOnLap: -2, spin: along * 0.3 });
    };
    GATE_SPOTS.forEach(([along, side], index) => {
      const fromSide = index === 0 ? 0 : GATE_SPOTS[index - 1][1] * 1.2;
      for (let i = 0; i < STARS_PER_TRAIL; i += 1) {
        const share = i / (STARS_PER_TRAIL - 1);
        const eased = share * share * (3 - 2 * share);
        add(along - 12 - (STARS_PER_TRAIL - 1 - i) * STAR_SPACING, lerp(fromSide, side * 3.6, eased));
      }
    });
    // An arc of stars over each ramp, in the air where a jump goes.
    for (const along of RAMP_SPOTS) {
      for (let i = 0; i < 5; i += 1) {
        const share = i / 4;
        add(along + 7 + i * 5.2, 0, 0.5 + 1.6 * Math.sin(share * Math.PI));
      }
    }
    this.mesh = new THREE.InstancedMesh(
      starGeometry(),
      new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#c98a00', emissiveIntensity: 0.55, roughness: 0.35 }),
      this.stars.length,
    );
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.dummy = new THREE.Object3D();
    scene.add(this.mesh);
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
    this.spots = RAMP_SPOTS;
    const top = new THREE.MeshLambertMaterial({ map: rampTexture() });
    const side = new THREE.MeshLambertMaterial({ color: '#d9553c' });
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
    for (const along of RAMP_SPOTS) {
      const mesh = new THREE.Mesh(shape, [top, side]);
      track.pointAt(along, 0, mesh.position);
      mesh.position.y += 0.06;
      mesh.rotation.order = 'YXZ';
      mesh.rotation.y = track.headingAt(along);
      mesh.rotation.x = -track.pitchAt(along);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }

  /** How far up a ramp the road is here, or 0. */
  liftAt(distance, lateral) {
    if (Math.abs(lateral) > RAMP_HALF_WIDTH) return 0;
    const here = mod(distance, this.track.length);
    for (const along of this.spots) {
      const onto = here - along;
      if (onto >= 0 && onto <= RAMP_LENGTH) return (onto / RAMP_LENGTH) * RAMP_HEIGHT;
    }
    return 0;
  }

  /** Whether a car going from one distance to the next just went off the end of a ramp. */
  launches(from, to, lateral) {
    if (Math.abs(lateral) > RAMP_HALF_WIDTH) return false;
    const a = mod(from, this.track.length);
    const moved = to - from;
    if (moved <= 0 || moved > 6) return false;
    return this.spots.some((along) => mod(along + RAMP_LENGTH - a, this.track.length) <= moved);
  }
}
