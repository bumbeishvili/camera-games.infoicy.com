// The big hands at the roadside, on alternating sides, waiting for a high five. Steering over to one
// with an open hand slaps it: that's what makes the child reach to each side.
import * as THREE from '../../vendor/three/three.module.js';
import { ball, mergeParts, outlineMaterial, roundedBox, toon } from '../../core/body/characters.js';
import { canvasTexture, damp, lerp, mod, starPath, TAU } from './kit.js';
import { GATE_SPOTS, LANE_LIMIT, ROAD_HALF } from './track.js';

const HAND_SIZE = 2.1;
const WRIST_HEIGHT = 2.2;
const POST_OUT = ROAD_HALF + 1.3;
const TUCKED_OUT = ROAD_HALF + 2.6;
const TUCKS_BEHIND_CAR = 40; // It's back at the roadside for this far behind the car.
const STRIP_LENGTH = 38;
const STRIP_STEPS = 19;
export const HAND_COLOURS = ['#ffd23f', '#ff7eb6', '#5ccfff', '#b18cff', '#ff9f45'];
const READY_COLOUR = '#3ddc84';

function capsule(length, radius) {
  const geometry = new THREE.CapsuleGeometry(radius, length, 5, 12);
  geometry.translate(0, length / 2, 0);
  return geometry;
}

/** A big open hand, fingers up and palm towards +Z. Its thumb is on the road's side of it. */
function handGeometry(thumbSide) {
  const fingers = [
    { x: 0.42, length: 0.68, fan: 0.17 },
    { x: 0.145, length: 0.84, fan: 0.05 },
    { x: -0.145, length: 0.76, fan: -0.05 },
    { x: -0.42, length: 0.56, fan: -0.2 },
  ];
  const parts = [{ geometry: ball(0.62, 0.68, 0.26), colour: '#ffffff', at: [0, 0.68, 0] }];
  for (const { x, length, fan } of fingers) {
    parts.push({ geometry: capsule(length, 0.135), colour: '#ffffff', at: [x * thumbSide, 1.08, 0], turn: [0, 0, -fan * thumbSide] });
  }
  parts.push({ geometry: capsule(0.46, 0.15), colour: '#ffffff', at: [0.5 * thumbSide, 0.46, 0.03], turn: [0, 0, -1 * thumbSide] });
  // The cuff, in white, which is what makes it read as a big cartoon glove.
  parts.push({ geometry: roundedBox(1.02, 0.28, 0.42, 0.12), colour: '#ffffff', at: [0, 0.03, 0] });
  return mergeParts(parts);
}

function palmTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 124, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffb703';
    starPath(ctx, w / 2, h / 2, 118, 62);
    ctx.fill();
    ctx.fillStyle = '#27384b';
    ctx.font = '700 132px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('5', w / 2, h / 2 + 10);
  });
}

function stripTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 20;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const y of [36, 100]) {
      ctx.beginPath();
      ctx.moveTo(20, y + 22);
      ctx.lineTo(w / 2, y - 18);
      ctx.lineTo(w - 20, y + 22);
      ctx.stroke();
    }
  }, { repeat: true });
}

export class HighFiveGates {
  constructor(scene, track, { reducedMotion }) {
    this.track = track;
    this.reducedMotion = reducedMotion;
    this.reachFor = () => 2.6;

    const handShapes = { '-1': handGeometry(1), 1: handGeometry(-1) };
    const outline = outlineMaterial('#27384b', 0.018);
    const paints = HAND_COLOURS.map((colour) => new THREE.MeshToonMaterial({ color: colour, gradientMap: toon() }));
    this.readyPaint = new THREE.MeshToonMaterial({ color: READY_COLOUR, gradientMap: toon() });
    const palm = new THREE.MeshBasicMaterial({ map: palmTexture(), transparent: true });
    const palmShape = new THREE.CircleGeometry(0.46, 28);
    const armPaint = new THREE.MeshLambertMaterial({ vertexColors: true });
    const beamShape = new THREE.CylinderGeometry(0.17, 0.17, 1, 8).rotateZ(Math.PI / 2);
    const beamPaint = new THREE.MeshLambertMaterial({ color: '#f7fafc' });

    this.gates = GATE_SPOTS.map(([along, side], index) => {
      const root = new THREE.Group();
      track.pointAt(along, 0, root.position);
      // Facing whoever's coming up the road. Across this, +X is the driver's right.
      root.rotation.y = track.headingAt(along) + Math.PI;

      const paint = paints[index % paints.length];
      const pivot = new THREE.Group();
      const hand = new THREE.Group();
      hand.scale.setScalar(HAND_SIZE);
      const glove = new THREE.Mesh(handShapes[side], paint);
      glove.castShadow = true;
      const lines = new THREE.Mesh(handShapes[side], outline);
      const face = new THREE.Mesh(palmShape, palm);
      face.position.set(0, 0.68, 0.272);
      hand.add(glove, lines, face);
      pivot.add(hand);
      root.add(pivot);

      const arm = new THREE.Mesh(this.armGeometry(paint.color), armPaint);
      arm.castShadow = true;
      root.add(arm);
      const beam = new THREE.Mesh(beamShape, beamPaint);
      beam.castShadow = true;
      root.add(beam);
      scene.add(root);

      return { along, side, index, root, pivot, hand, glove, arm, beam, paint, swing: 0, swingSpeed: 0, ready: 0, handX: 0, tucked: 0, wave: index * 1.3 };
    });

    // One painted strip on the road, which moves along to whichever big hand is next.
    this.stripMaterial = new THREE.MeshBasicMaterial({
      map: stripTexture(),
      color: HAND_COLOURS[0],
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      side: THREE.DoubleSide,
    });
    const stripGeometry = new THREE.BufferGeometry();
    const stations = STRIP_STEPS + 1;
    stripGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(stations * 6), 3));
    stripGeometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(stations * 4), 2));
    const indices = [];
    for (let i = 0; i < STRIP_STEPS; i += 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    stripGeometry.setIndex(indices);
    this.strip = new THREE.Mesh(stripGeometry, this.stripMaterial);
    this.strip.frustumCulled = false;
    this.strip.renderOrder = 2;
    scene.add(this.strip);
    this.stripGate = null;
    this.stripReach = 0;

    this.corner = new THREE.Vector3();
    this.applyReach();
  }

  armGeometry(colour) {
    const hex = `#${colour.getHexString()}`;
    const parts = [
      { geometry: new THREE.CylinderGeometry(0.2, 0.26, 2.4, 10), colour: '#f7fafc', at: [0, 1.2, 0] },
      { geometry: new THREE.CylinderGeometry(0.28, 0.34, 0.5, 10), colour: hex, at: [0, 0.25, 0] },
      { geometry: ball(0.3), colour: hex, at: [0, 2.4, 0] },
    ];
    return mergeParts(parts);
  }

  /** Where each hand stands depends on how far the child has to reach. */
  applyReach() {
    for (const gate of this.gates) {
      const reach = this.reachFor(gate.side);
      gate.handX = gate.side * Math.min(reach + 1.9, ROAD_HALF - 0.6);
      gate.arm.position.set(gate.side * POST_OUT, 0, 0);
      this.placeHand(gate);
    }
  }

  /** The hand on its arm, which pulls back to the roadside once the car has gone by. */
  placeHand(gate) {
    const x = lerp(gate.handX, gate.side * TUCKED_OUT, gate.tucked);
    gate.pivot.position.set(x, WRIST_HEIGHT, 0);
    const length = Math.abs(gate.side * POST_OUT - x) + 0.2;
    gate.beam.scale.x = length;
    gate.beam.position.set((gate.side * POST_OUT + x) / 2, WRIST_HEIGHT + 0.12, 0);
  }

  /** The next big hand along the road from a distance. */
  next(distance) {
    const here = mod(distance, this.track.length);
    let best = null;
    let nearest = Infinity;
    for (const gate of this.gates) {
      const ahead = mod(gate.along - here, this.track.length);
      if (ahead < nearest) {
        nearest = ahead;
        best = gate;
      }
    }
    return { gate: best, ahead: nearest };
  }

  /** The strip on the road shows how far over to go for the next hand. */
  showStrip(gate, ready) {
    const reach = this.reachFor(gate.side);
    if (gate !== this.stripGate || reach !== this.stripReach) {
      this.stripGate = gate;
      this.stripReach = reach;
      const position = this.strip.geometry.attributes.position;
      const uv = this.strip.geometry.attributes.uv;
      const near = gate.side * reach;
      const far = gate.side * (LANE_LIMIT + 1.3);
      for (let i = 0; i <= STRIP_STEPS; i += 1) {
        const along = gate.along - STRIP_LENGTH + (STRIP_LENGTH * i) / STRIP_STEPS;
        const { corner } = this;
        this.track.pointAt(along, near, corner);
        position.setXYZ(i * 2, corner.x, corner.y + 0.12, corner.z);
        this.track.pointAt(along, far, corner);
        position.setXYZ(i * 2 + 1, corner.x, corner.y + 0.12, corner.z);
        const v = (along - gate.along) / 3.6;
        uv.setXY(i * 2, 0, v);
        uv.setXY(i * 2 + 1, Math.abs(far - near) / 3.6, v);
      }
      position.needsUpdate = true;
      uv.needsUpdate = true;
      this.strip.geometry.computeBoundingSphere();
    }
    this.stripMaterial.color.set(ready ? READY_COLOUR : gate.paint.color);
  }

  hideStrip() {
    this.strip.visible = false;
  }

  /** The hand was slapped, and swings back on its arm. */
  slap(gate) {
    gate.swingSpeed = this.reducedMotion ? 4 : 11;
  }

  /** Something went by close to it: it only wobbles. */
  brush(gate, amount = 3) {
    gate.swingSpeed = Math.max(gate.swingSpeed, this.reducedMotion ? amount * 0.4 : amount);
  }

  update(dt, time, { next, ready, stripOn, carDistance }) {
    const { length } = this.track;
    for (const gate of this.gates) {
      // Once the car has gone by, the hand gets out of the way of the camera following it.
      const behindCar = mod(carDistance - gate.along, length);
      const tuck = behindCar < TUCKS_BEHIND_CAR ? 1 : 0;
      gate.tucked = damp(gate.tucked, tuck, tuck ? 18 : 5, dt);
      this.placeHand(gate);

      // A loose spring, so it swings back, over, and settles.
      gate.swingSpeed += (-gate.swing * 42 - gate.swingSpeed * 4.2) * dt;
      gate.swing += gate.swingSpeed * dt;
      const isNext = gate === next;
      gate.ready = damp(gate.ready, isNext && ready ? 1 : 0, 10, dt);
      const wave = isNext && !this.reducedMotion ? Math.sin(time * 3.2 + gate.wave) * 0.1 : 0;
      gate.pivot.rotation.set(-gate.swing, 0, wave - gate.side * 0.06, 'XYZ');
      gate.hand.scale.setScalar(HAND_SIZE * (1 + gate.ready * 0.1) * (1 - gate.tucked * 0.25));
      gate.glove.material = gate.ready > 0.5 ? this.readyPaint : gate.paint;
    }
    this.strip.visible = stripOn && next !== null;
    if (this.strip.visible) {
      this.showStrip(next, ready);
      if (!this.reducedMotion) this.stripMaterial.map.offset.y = -time * 0.55;
    }
  }
}
