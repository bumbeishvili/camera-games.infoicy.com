// A character showing a move, over and over, in the card where the coach says what to do. A word
// or a still picture is hard to copy, and a child can simply do what their own character is doing.
import * as THREE from '../../vendor/three/three.module.js';
import { ARM_REACH, Fighter3D, makePose, mirrorPose, sampleClip } from './characters.js';
import { DEMOS } from './demos.js';
import { Sparks } from './sparks.js';

const FRAME_SECONDS = 1 / 30; // A small picture of a slow movement doesn't need more than this.
const CAMERA_DISTANCE = 8;
const HEAD_TOP = 2.05; // About how tall a character is, without its neck.
const STILL_SPEED = 0.7; // For anyone who prefers reduced motion. It's still the instruction.
const CLOSE_HEIGHT = 1.15; // How much fits in the picture for a film of a hand.
const CLOSE_SPOT = { x: 0.82, y: 1.25 };

export class MoveDemo {
  constructor(canvas) {
    this.canvas = canvas;
    this.speed = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? STILL_SPEED : 1;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.ratio = Math.min(window.devicePixelRatio || 1, 1.5);

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#cdd7e2', 1.5));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.position.set(2, 6, 7);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(24, 1, 0.1, 40);

    // A shadow that stays on the floor shows how far off it a jump goes.
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#12304d', transparent: true, opacity: 0.2, depthWrite: false }),
    );
    this.scene.add(this.shadow);

    // The path a hand should take, for a move that goes round.
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.035, 8, 48),
      new THREE.MeshBasicMaterial({ color: '#ffb703' }),
    );
    this.ring.visible = false;
    this.scene.add(this.ring);

    this.sparks = new Sparks(this.scene);
    this.pose = makePose();
    this.clips = new Map();
    this.fighter = null;
    this.spec = null;
    this.playing = null;
    this.sinceFrame = Infinity;
    this.shoulder = new THREE.Vector3();
  }

  /** Which character shows the moves. It's whoever the child has chosen. */
  setCharacter(spec) {
    if (this.spec === spec) return;
    if (this.fighter) {
      this.scene.remove(this.fighter.root);
      this.fighter.dispose();
    }
    this.spec = spec;
    this.fighter = new Fighter3D(spec);
    this.fighter.setExpression('happy');
    this.scene.add(this.fighter.root);
    if (this.playing) this.frameCamera(this.playing.demo);
  }

  clipFor(name, side) {
    const key = `${name}-${side}`;
    if (!this.clips.has(key)) {
      const { frames, linear = false } = DEMOS[name];
      this.clips.set(key, {
        linear,
        duration: frames.at(-1)[0],
        frames: frames.map(([t, pose]) => ({ t, pose: side === 'left' ? mirrorPose(pose) : pose })),
      });
    }
    return this.clips.get(key);
  }

  frameCamera({ room = 0, close = false }) {
    const height = close ? CLOSE_HEIGHT : HEAD_TOP + this.spec.build.neck + room + 0.3;
    const centreX = close ? CLOSE_SPOT.x * this.playing.sign : 0;
    const centreY = close ? CLOSE_SPOT.y : height / 2 - 0.12;
    this.camera.position.set(centreX, centreY, CAMERA_DISTANCE);
    this.camera.lookAt(centreX, centreY, 0);
    this.camera.fov = (2 * Math.atan(height / 2 / CAMERA_DISTANCE) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
  }

  /** Starts showing a move. side is which of the child's sides it's for. */
  show(name, side = 'right') {
    const demo = DEMOS[name];
    const clip = this.clipFor(name, side);
    this.playing = { name, side, demo, clip, t: 0, sign: side === 'left' ? -1 : 1 };
    this.fighter.faceTowards((demo.turn ?? 0) * this.playing.sign);
    this.fighter.root.position.x = (demo.shift ?? 0) * this.playing.sign;
    this.shadow.position.x = this.fighter.root.position.x;
    this.frameCamera(demo);
    this.sinceFrame = Infinity;
  }

  hide() {
    this.playing = null;
  }

  /** Where the character's head is on the page, for things that happen at its mouth. */
  headOnPage() {
    if (!this.fighter || !this.width) return null;
    const at = this.fighter.head.getWorldPosition(this.shoulder).project(this.camera);
    const box = this.canvas.getBoundingClientRect();
    return { x: box.left + ((at.x + 1) / 2) * box.width, y: box.top + ((1 - at.y) / 2) * box.height };
  }

  fitCanvas() {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (!width || !height) return false;
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.renderer.setPixelRatio(this.ratio);
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    return true;
  }

  sparkle() {
    const hand = this.fighter.palmL.getWorldPosition(new THREE.Vector3());
    hand.x = 0;
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2;
      this.sparks.emit({
        shape: 'star',
        colour: i % 2 ? '#ffd23f' : '#ff8f3f',
        at: hand,
        velocity: [Math.cos(angle) * 1.5, Math.sin(angle) * 1.5, 0.4],
        life: 0.4,
        size: 0.26,
        spin: 3,
      });
    }
  }

  /** One frame of the game. The picture is only drawn while there's something to show. */
  update(dt) {
    const { playing, pose, fighter } = this;
    if (!playing) return;
    const { clip, demo } = playing;
    const before = playing.t;
    playing.t = (playing.t + dt * this.speed) % clip.duration;
    sampleClip(clip, playing.t, pose);
    pose.forward = 0;
    fighter.setPose(pose);
    fighter.update(dt);
    this.sinceFrame += dt;
    for (const at of demo.sparkAt ?? []) {
      if (before < at && playing.t >= at) this.sparkle();
    }
    this.sparks.update(dt);
    if (this.sinceFrame < FRAME_SECONDS || !this.fitCanvas()) return;
    this.sinceFrame = 0;

    const size = 1 - Math.min(0.5, pose.up * 0.6);
    this.shadow.scale.set(size, 1, size);
    this.ring.visible = Boolean(demo.ring);
    if (demo.ring) {
      const shoulder = playing.sign > 0 ? fighter.upperL : fighter.upperR;
      shoulder.getWorldPosition(this.shoulder);
      this.ring.position.set(
        this.shoulder.x + demo.ring.x * ARM_REACH * playing.sign,
        this.shoulder.y + demo.ring.y * ARM_REACH,
        this.shoulder.z + demo.ring.z * ARM_REACH,
      );
      this.ring.scale.setScalar(demo.ring.radius * ARM_REACH);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
