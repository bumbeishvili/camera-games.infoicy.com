// The land the road runs through: rolling hills, a big hill with a tunnel, a lake and a river.
//
// The ground always lies just under the road, so the road never has to climb over anything, and
// it rises away on each side into whatever the land is doing there.
import * as THREE from '../../vendor/three/three.module.js';
import { canvasTexture, clamp, lerp, smoothstep } from './kit.js';
import { PLACES, ROAD_HALF, within } from './track.js';

export const WATER_LEVEL = -1.5;
export const LAKE = { x: 45, z: -42, rx: 100, rz: 54 };
const LAKE_BED = -4.5;
export const RIVER = [[-30, -68], [-58, -118], [-72, -158], [-78, -182], [-84, -206], [-100, -250], [-148, -320], [-172, -400], [-160, -470]];
const RIVER_BED = -4;
export const HILL = { x: 292, z: -62, radius: 135, height: 44 };
const REACH = 1450;
const SEGMENTS = 240;
const PATCHES = 8;

const GRASS_LIGHT = new THREE.Color('#93dd63');
const GRASS_DEEP = new THREE.Color('#62c45a');
const FOREST_FLOOR = new THREE.Color('#4fa85a');
const FARM_LAND = new THREE.Color('#bfdc6a');
const DRY_GRASS = new THREE.Color('#d9d67a');
const HILL_GREEN = new THREE.Color('#48a868');
const ROCK = new THREE.Color('#9aa3a8');
const FAR_HAZE = new THREE.Color('#86bccb');
const SAND = new THREE.Color('#f2e2ae');
const LAKE_SHALLOW = new THREE.Color('#9fe0d8');
const LAKE_DEEP = new THREE.Color('#2f8fc4');

/** How far a spot is from the lake's middle: 1 is about where the shore is. */
export function lakeMeasure(x, z) {
  const dx = (x - LAKE.x) / LAKE.rx;
  const dz = (z - LAKE.z) / LAKE.rz;
  const angle = Math.atan2(dz, dx);
  return Math.hypot(dx, dz) / (1 + 0.1 * Math.sin(angle * 3 + 1) + 0.06 * Math.sin(angle * 7 + 2));
}

function riverDistance(x, z) {
  let closest = Infinity;
  for (let i = 0; i < RIVER.length - 1; i += 1) {
    const [ax, az] = RIVER[i];
    const [bx, bz] = RIVER[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    closest = Math.min(closest, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return closest;
}

export class Terrain {
  constructor(track) {
    this.track = track;
  }

  /** The land as it would be with no road. */
  naturalAt(x, z) {
    let rolling = Math.max(0, 5 + 4 * Math.sin(x * 0.013 + 1.2) * Math.cos(z * 0.011 - 0.6) + 2.5 * Math.sin(x * 0.037 - z * 0.029));
    // The middle of the circuit stays low, so the lake can be seen from all around.
    const infield = Math.hypot(x / 300, (z + 40) / 150);
    rolling *= lerp(0.2, 1, smoothstep(infield, 0.75, 1.25));

    const radius = Math.hypot(x, z);
    const angle = Math.atan2(z, x);
    const ridge = (78 + 30 * Math.sin(angle * 7 + 0.8) + 14 * Math.sin(angle * 17)) * smoothstep(radius, 430, 980);

    const fromHill = Math.hypot(x - HILL.x, z - HILL.z) / HILL.radius;
    const hill = HILL.height * (fromHill < 1 ? Math.cos(fromHill * Math.PI * 0.5) ** 1.5 : 0);
    const bump = hill > 0 ? (1.5 * Math.sin(x * 0.13) + 1.5 * Math.cos(z * 0.11)) * smoothstep(hill, 0, 12) : 0;

    let height = rolling + ridge + hill + bump;
    const lake = lakeMeasure(x, z);
    if (lake < 1.3) height = lerp(LAKE_BED, height, smoothstep(lake, 0.82, 1.3));
    return height;
  }

  /** The ground itself, which is what anything standing on it needs. */
  heightAt(x, z) {
    let height = this.naturalAt(x, z);
    const near = this.track.nearest(x, z);
    if (near) {
      // The tunnel runs through a cutting, which needs steeper sides than anywhere else.
      const tight = within(near.along, PLACES.tunnel, this.track.length);
      const from = ROAD_HALF + (tight ? 10 : 4);
      const to = ROAD_HALF + (tight ? 26 : 34);
      height = lerp(height, this.track.points[near.index].y - 0.3, 1 - smoothstep(near.gap, from, to));
    }
    // The river runs under the road, so it cuts through last. The bridge carries the road over it.
    const fromRiver = riverDistance(x, z);
    if (fromRiver < 18) height = Math.min(height, lerp(RIVER_BED, height, smoothstep(fromRiver, 6, 18)));
    return height;
  }

  colourAt(out, x, height, z, steepness) {
    const patch = 0.5 + 0.5 * Math.sin(x * 0.045 + Math.sin(z * 0.03) * 2) * Math.cos(z * 0.05);
    out.lerpColors(GRASS_LIGHT, GRASS_DEEP, patch);

    // Each part of the land has its own colour. Fields around the farm, dark under the forest,
    // and dry grass where the giraffes live.
    out.lerp(FARM_LAND, 0.75 * (1 - smoothstep(Math.hypot(x - 165, z + 195), 70, 150)));
    out.lerp(FOREST_FLOOR, 0.8 * (1 - smoothstep(Math.hypot(x + 215, z + 215), 110, 200)));
    out.lerp(DRY_GRASS, 0.85 * (1 - smoothstep(Math.hypot(x + 340, z + 40), 40, 105)));

    out.lerp(HILL_GREEN, smoothstep(height, 8, 26));
    const rock = Math.max(smoothstep(steepness, 0.75, 1.15), smoothstep(height - 6, 26, 34));
    if (Math.hypot(x - HILL.x, z - HILL.z) < HILL.radius * 1.1) out.lerp(ROCK, rock);
    out.lerp(FAR_HAZE, smoothstep(height, 40, 95));

    // Sand at the water's edge, and the bottom of the lake going deep blue.
    if (height < WATER_LEVEL + 2) out.lerp(SAND, smoothstep(height, WATER_LEVEL + 2, WATER_LEVEL + 0.6));
    if (height < WATER_LEVEL) {
      out.copy(SAND).lerp(LAKE_SHALLOW, smoothstep(height, WATER_LEVEL, WATER_LEVEL - 0.7));
      out.lerp(LAKE_DEEP, smoothstep(height, WATER_LEVEL - 0.7, WATER_LEVEL - 2.8));
    }
    return out;
  }

  buildGround(scene) {
    const size = SEGMENTS + 1;
    // More squares near the middle, where the road is, and fewer out by the mountains.
    const warp = (u) => Math.sign(u) * Math.abs(u) ** 2 * REACH;
    const heights = new Float32Array(size * size);
    const xs = new Float32Array(size);
    for (let i = 0; i < size; i += 1) xs[i] = warp(-1 + (2 * i) / SEGMENTS);
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) heights[j * size + i] = this.heightAt(xs[i], xs[j]);
    }

    const colour = new THREE.Color();
    const positions = new Float32Array(size * size * 3);
    const colours = new Float32Array(size * size * 3);
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        const at = j * size + i;
        const nextX = Math.min(i + 1, SEGMENTS);
        const nextZ = Math.min(j + 1, SEGMENTS);
        const slopeX = (heights[j * size + nextX] - heights[at]) / Math.max(0.01, xs[nextX] - xs[i]);
        const slopeZ = (heights[nextZ * size + i] - heights[at]) / Math.max(0.01, xs[nextZ] - xs[j]);
        positions.set([xs[i], heights[at], xs[j]], at * 3);
        this.colourAt(colour, xs[i], heights[at], xs[j], Math.hypot(slopeX, slopeZ));
        colours.set([colour.r, colour.g, colour.b], at * 3);
      }
    }

    // In square patches, so that the part behind the camera doesn't get drawn at all.
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const cells = Math.floor(SEGMENTS / PATCHES);
    for (let pj = 0; pj < PATCHES; pj += 1) {
      for (let pi = 0; pi < PATCHES; pi += 1) {
        const across = cells + 1;
        const patchPositions = new Float32Array(across * across * 3);
        const patchColours = new Float32Array(across * across * 3);
        for (let j = 0; j < across; j += 1) {
          for (let i = 0; i < across; i += 1) {
            const from = (pj * cells + j) * size + pi * cells + i;
            const to = (j * across + i) * 3;
            for (let axis = 0; axis < 3; axis += 1) {
              patchPositions[to + axis] = positions[from * 3 + axis];
              patchColours[to + axis] = colours[from * 3 + axis];
            }
          }
        }
        const indices = [];
        for (let j = 0; j < cells; j += 1) {
          for (let i = 0; i < cells; i += 1) {
            const a = j * across + i;
            indices.push(a, a + across, a + 1, a + 1, a + across, a + across + 1);
          }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(patchPositions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(patchColours, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        scene.add(mesh);
      }
    }
  }

  /** The lake and river, as one sheet of water that the land rises out of. */
  buildWater(scene, time) {
    const ripples = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#c4ebff';
      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      // Long, soft and low contrast, so there's nothing there to flicker.
      for (let i = 0; i < 26; i += 1) {
        const x = (i * 83) % w;
        const y = (i * 47) % h;
        const length = 24 + (i * 13) % 34;
        for (const shift of [0, -w, w]) {
          ctx.beginPath();
          ctx.moveTo(x + shift, y);
          ctx.quadraticCurveTo(x + shift + length / 2, y - 5, x + shift + length, y);
          ctx.stroke();
        }
      }
    }, { repeat: true });
    ripples.repeat.set(32, 32);

    const material = new THREE.MeshBasicMaterial({ color: '#5cc0ee', map: ripples, transparent: true, opacity: 0.8, depthWrite: false });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.fragmentShader = `uniform float uTime;\n${shader.fragmentShader}`.replace(
        '#include <map_fragment>',
        `diffuseColor *= 0.5 * (texture2D(map, vMapUv + vec2(uTime * 0.006, uTime * 0.003))
          + texture2D(map, vMapUv * 0.73 + vec2(-uTime * 0.004, uTime * 0.005)));`,
      );
    };
    const water = new THREE.Mesh(new THREE.PlaneGeometry(760, 760).rotateX(-Math.PI / 2), material);
    water.position.set(-20, WATER_LEVEL, -240);
    water.renderOrder = 1;
    scene.add(water);
    return water;
  }
}
