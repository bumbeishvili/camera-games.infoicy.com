// The characters in the maze: the ones from core/body/roster.js, drawn once from their 3D models into flat pictures,
// seen from a little above, as the maze is. Each faces down the screen, up it and to the side (turned a little
// towards the child, and flipped for the other side), standing and in two steps of a walk, and there's a cheer
// and a wave. The maze is 2D, and shows these pictures.
import * as THREE from '../../vendor/three/three.module.js';
import { Fighter3D, makePose } from '../../core/body/characters.js';

const PIXELS = 64; // In the pictures, for each unit of the character's own size.
const LOOK_DOWN = 0.62; // How far the view looks down on the characters, in radians, as on the maze.
const BODY = 2.05; // About how tall a character is, without a long neck.
const WIDE = 2.1;
// Which way the character faces in each picture: towards the child (down the screen), away, and to the right.
export const FACINGS = { down: 0, up: Math.PI, side: Math.PI / 2 - 0.42 };
export const STEPS = ['stand', 'stepA', 'stepB'];

const REST = makePose();
const pose = (changes) => ({ ...REST, ...changes });
const walk = (lead, bounce) => pose({
  up: bounce,
  pitch: 0.06,
  footLZ: lead,
  footRZ: -lead,
  footLY: lead < 0 ? 0.1 : 0.02,
  footRY: lead > 0 ? 0.1 : 0.02,
  handLX: 0.4,
  handLY: -0.8,
  handLZ: -lead * 0.9,
  handRX: -0.4,
  handRY: -0.8,
  handRZ: lead * 0.9,
});

export const POSES = {
  stand: { pose: pose({ handLX: 0.38, handLY: -0.84, handRX: -0.38, handRY: -0.84 }), face: 'ready' },
  stepA: { pose: walk(0.24, 0.04), face: 'ready' },
  stepB: { pose: walk(-0.24, 0.04), face: 'ready' },
  cheer: { pose: pose({ up: 0.16, handLX: 0.34, handLY: 0.92, handLZ: 0.12, handRX: -0.34, handRY: 0.92, handRZ: 0.12, headPitch: -0.12 }), face: 'happy' },
  wave: { pose: pose({ handLX: 0.4, handLY: 0.86, handLZ: 0.2, handRX: -0.38, handRY: -0.84, headPitch: -0.08 }), face: 'happy' },
};

/**
 * Draws each character from a little above, in every pose and facing. Returns, by id, { frames, width, height,
 * foot, tall }: frames.down, frames.up and frames.side each hold stand, stepA and stepB, and frames.cheer and
 * frames.wave face the child. foot is where the character stands in each picture, and tall how many pixels high
 * its body is there, without a long neck. Drawn once, as a game starts, and then only copied.
 */
export function renderWalkers(specs) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#cdd7e2', 1.6));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.1);
  sun.position.set(-3, 8, 6);
  scene.add(sun);
  const walkers = {};
  for (const spec of specs) {
    const tall = BODY + spec.build.neck;
    const up = Math.cos(LOOK_DOWN);
    const along = Math.sin(LOOK_DOWN);
    // The picture's edges, in the view's own units: room above the head for a cheer, and below the feet for the
    // ground in front of them.
    const [left, right, top, bottom] = [-WIDE / 2, WIDE / 2, (tall + 0.5) * up + 0.5 * along, -0.55 * along - 0.08];
    const width = Math.round((right - left) * PIXELS);
    const height = Math.round((top - bottom) * PIXELS);
    renderer.setSize(width, height, false);
    const camera = new THREE.OrthographicCamera(left, right, top, bottom, 0.1, 80);
    camera.position.set(0, along * 30, up * 30);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const fighter = new Fighter3D(spec);
    fighter.blinkIn = 99;
    scene.add(fighter.root);
    const shoot = (facing, name) => {
      const { pose: body, face } = POSES[name];
      fighter.faceTowards(facing);
      fighter.setPose(body);
      fighter.setExpression(face);
      fighter.update(0.5);
      scene.updateMatrixWorld(true);
      renderer.render(scene, camera);
      const image = document.createElement('canvas');
      image.width = width;
      image.height = height;
      image.getContext('2d').drawImage(canvas, 0, 0);
      return image;
    };
    const frames = {};
    for (const [way, facing] of Object.entries(FACINGS)) frames[way] = Object.fromEntries(STEPS.map((name) => [name, shoot(facing, name)]));
    frames.cheer = shoot(FACINGS.down, 'cheer');
    frames.wave = shoot(FACINGS.down + 0.25, 'wave');
    scene.remove(fighter.root);
    fighter.dispose();
    walkers[spec.id] = {
      frames,
      width,
      height,
      foot: { x: width / 2, y: (top / (top - bottom)) * height },
      tall: BODY * up * PIXELS,
      head: (tall + 0.15) * up * PIXELS,
      colour: spec.colours.body,
    };
  }
  renderer.forceContextLoss();
  renderer.dispose();
  return walkers;
}
