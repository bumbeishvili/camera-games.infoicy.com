// Things on the road: stars to catch, and ramps to jump. Neither is in the way, and missing either
// costs nothing. Where they are depends on the level (rules.js), and both are laid out again for each.
import * as THREE from '../../vendor/three/three.module.js';
import { canvasTexture, damp, mod, TAU } from './kit.js';
import { starSpots } from './rules.js';
import { GATE_SPOTS, RAMP_SPOTS } from './track.js';

const STAR_HEIGHT = 1.55;
const STAR_COLOUR = new THREE.Color('#ffd23f');
const STAR_GLOW = new THREE.Color('#c98a00');
// On the golden lap, a deeper gold that glows more, and a little bigger.
const GOLDEN_COLOUR = new THREE.Color('#ffb21a');
const GOLDEN_GLOW = new THREE.Color('#e07b00');
const RAMP_LENGTH = 7;
const RAMP_HEIGHT = 1.05;
export const RAMP_HALF_WIDTH = 2.9;
const STAR_ROOM = 160; // Stars the one mesh has room for, which is more than any level has.
// A star the magnet pulled over stays there while it's this close ahead of the car, or behind it, in metres. The
// magnet only reaches 34 m ahead, and the camera is about 13 m behind the car.
const PULLED_STAYS = { ahead: 60, behind: 40 };
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
      new THREE.MeshStandardMaterial({ color: STAR_COLOUR, emissive: STAR_GLOW, emissiveIntensity: 0.55, roughness: 0.35 }),
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
    this.stars = starSpots(gateSpots, ramps).slice(0, STAR_ROOM).map(({ along, lateral, lift }) => {
      const position = track.pointAt(along, lateral, new THREE.Vector3());
      position.y += STAR_HEIGHT + lift;
      // pulled is where a magnet has drawn it to across the road. It goes back once the car has gone by.
      return { along: mod(along, track.length), lateral, lift, pulled: lateral, position, takenOnLap: -2, spin: along * 0.3 };
    });
    this.mesh.count = this.stars.length;
    this.golden = 0;
  }

  reset() {
    for (const star of this.stars) {
      star.takenOnLap = -2;
      if (star.pulled !== star.lateral) {
        star.pulled = star.lateral;
        this.place(star);
      }
    }
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
      if (between < 3.4 && Math.abs(star.pulled - lateral) < 2.6) {
        star.takenOnLap = lap;
        onCollect(star);
      }
    }
  }

  /**
   * A magnet draws the stars a little way ahead over to the car, wherever they are across the road. position
   * and lateral are where the car is on the lap, and reach how far ahead the magnet pulls, or 0 without one.
   * When the magnet runs out, a star it pulled over stays where it is, so nothing jumps back across the road in
   * front of the car. It only goes back to its own place once it's well out of sight behind, for the next lap.
   */
  pull(dt, { position, lateral, reach }) {
    const { length } = this.track;
    for (const star of this.stars) {
      const ahead = mod(star.along - position, length);
      if (ahead < reach) {
        if (Math.abs(lateral - star.pulled) < 1e-3) continue;
        star.pulled = damp(star.pulled, lateral, 7, dt);
        this.place(star);
      } else if (star.pulled !== star.lateral && ahead > PULLED_STAYS.ahead && length - ahead > PULLED_STAYS.behind) {
        star.pulled = star.lateral;
        this.place(star);
      }
    }
  }

  place(star) {
    this.track.pointAt(star.along, star.pulled, star.position);
    star.position.y += STAR_HEIGHT + star.lift;
  }

  /** golden is 1 on the golden lap and 0 otherwise. It changes over a second or so, so nothing flashes. */
  setGolden(golden, dt) {
    if (Math.abs(golden - this.golden) < 1e-3) return;
    this.golden = damp(this.golden, golden, 3, dt);
    if (Math.abs(golden - this.golden) < 0.01) this.golden = golden;
    const { material } = this.mesh;
    material.color.lerpColors(STAR_COLOUR, GOLDEN_COLOUR, this.golden);
    material.emissive.lerpColors(STAR_GLOW, GOLDEN_GLOW, this.golden);
  }

  update(time, lap, visible) {
    const size = 0.85 * (1 + 0.15 * this.golden);
    this.stars.forEach((star, index) => {
      const show = visible && star.takenOnLap !== lap;
      this.dummy.position.copy(star.position);
      this.dummy.position.y += Math.sin(time * 2 + star.spin) * 0.14;
      this.dummy.rotation.y = time * 1.6 + star.spin;
      this.dummy.scale.setScalar(show ? size : 0);
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
