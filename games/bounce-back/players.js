// The players on the court: the characters from core/body/roster.js, drawn once from their 3D models into
// flat pictures, side on and turned a little towards the child so their faces show, in each pose the court
// needs. The court is 2D, and shows these pictures. The arm that holds the racket is left out of them, as
// the court draws it reaching to wherever the hand is.
import * as THREE from '../../vendor/three/three.module.js';
import { Fighter3D, makePose } from '../../core/body/characters.js';

const PIXELS = 150; // In the pictures, for each unit of the character's own size.
const WIDE = 1.9; // How much of the character's own size fits across a picture.
const BELOW = 0.06;
const ABOVE = 0.62; // Room over the head for a jump.
const BODY = 2.05; // About how tall a character is, without a long neck.
// Facing the way the picture faces, which is to the right, and turned this far towards the child.
const FACING = Math.PI / 2 - 0.62;

const REST = makePose();
const pose = (changes) => ({ ...REST, ...changes });
const run = (lead, lift, bounce) => pose({
  pitch: 0.18,
  up: bounce,
  footLX: 0.17,
  footRX: -0.17,
  footLZ: lead,
  footRZ: -lead,
  footLY: lead < 0 ? lift : 0.02,
  footRY: lead > 0 ? lift : 0.02,
  handLX: 0.45,
  handLY: -0.55,
  handLZ: -lead * 1.2,
});

/** Each picture: a pose for the body, and a face. */
export const POSES = {
  ready: { pose: pose({ hipDrop: 0.07, pitch: 0.1, footLX: 0.22, footRX: -0.22, footLZ: 0.1, footRZ: -0.1, handLX: 0.55, handLY: -0.45, handLZ: 0.35, wristL: -0.3 }), face: 'ready' },
  run0: { pose: run(0.3, 0.14, 0.02), face: 'ready' },
  run1: { pose: run(0.06, 0.2, 0.07), face: 'ready' },
  run2: { pose: run(-0.3, 0.14, 0.02), face: 'ready' },
  run3: { pose: run(-0.06, 0.2, 0.07), face: 'ready' },
  hit: { pose: pose({ hipDrop: 0.05, pitch: 0.16, twist: -0.3, footLX: 0.22, footRX: -0.22, footLZ: 0.22, footRZ: -0.16, handLX: 0.62, handLY: -0.25, handLZ: -0.35 }), face: 'happy' },
  cheer: { pose: pose({ up: 0.3, footLY: 0.12, footRY: 0.08, handLX: 0.3, handLY: 0.95, handLZ: 0.15, wristL: 0.2, headPitch: -0.12 }), face: 'happy' },
  oops: { pose: pose({ pitch: -0.14, headPitch: 0.12, roll: 0.06, footLX: 0.24, footRX: -0.2, handLX: 0.85, handLY: 0.15, handLZ: 0.1 }), face: 'dizzy' },
  reach: { pose: pose({ up: 0.1, pitch: -0.06, headPitch: -0.3, footLY: 0.04, footRY: 0.04, footLPitch: 0.4, footRPitch: 0.4, handLX: 0.5, handLY: -0.55, handLZ: 0.1 }), face: 'ready' },
};
export const RUN_FRAMES = ['run0', 'run1', 'run2', 'run3'];

/**
 * Draws each character in every pose. Returns, by id, { frames, width, height, foot, body, arm } where frames
 * has each pose as { image, shoulder, head }: the shoulder the racket arm comes from and the top of the head,
 * in the picture's pixels. foot is where the character stands in the picture, body how tall it is there
 * without its neck, and arm the racket arm's colours. Drawn once, as a game starts, and then only copied.
 */
export function renderPlayers(specs) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#cdd7e2', 1.5));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.position.set(2, 6, 7);
  scene.add(sun);
  const point = new THREE.Vector3();
  const players = {};
  for (const spec of specs) {
    const tall = BODY + spec.build.neck;
    const [left, right, top, bottom] = [-WIDE / 2, WIDE / 2, tall + ABOVE, -BELOW];
    const width = Math.round((right - left) * PIXELS);
    const height = Math.round((top - bottom) * PIXELS);
    renderer.setSize(width, height, false);
    const camera = new THREE.OrthographicCamera(left, right, top, bottom, 0.1, 40);
    camera.position.set(0, 0, 12);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const toPicture = (vector) => {
      vector.project(camera);
      return { x: ((vector.x + 1) / 2) * width, y: ((1 - vector.y) / 2) * height };
    };

    const fighter = new Fighter3D(spec);
    fighter.faceTowards(FACING);
    fighter.upperR.visible = false;
    fighter.blinkIn = 99;
    scene.add(fighter.root);
    const frames = {};
    for (const [name, { pose: body, face }] of Object.entries(POSES)) {
      fighter.setPose(body);
      fighter.setExpression(face);
      fighter.update(0.5);
      scene.updateMatrixWorld(true);
      renderer.render(scene, camera);
      const image = document.createElement('canvas');
      image.width = width;
      image.height = height;
      image.getContext('2d').drawImage(canvas, 0, 0);
      const shoulder = toPicture(fighter.upperR.getWorldPosition(point));
      const head = toPicture(fighter.head.getWorldPosition(point).add(new THREE.Vector3(0, 0.5 * spec.build.headHeight, 0)));
      frames[name] = { image, shoulder, head };
    }
    scene.remove(fighter.root);
    fighter.dispose();
    const { colours } = spec;
    players[spec.id] = {
      frames,
      width,
      height,
      foot: { x: width / 2, y: height - BELOW * PIXELS },
      body: BODY * PIXELS,
      arm: { skin: colours.arm ?? colours.body, sleeve: colours.forearm ?? colours.arm ?? colours.body, hand: colours.hand ?? colours.arm ?? colours.body, ink: colours.ink },
    };
  }
  renderer.forceContextLoss();
  renderer.dispose();
  return players;
}

/**
 * An open hand, as the 21 points a glove is drawn from, from the middle of the palm, in palm lengths: the
 * computer's, and anyone's whose hand can't be seen just now. It's a right hand in the mirror, with the thumb
 * to the left, and flipped for a hand on the left.
 */
export const OPEN_HAND = [
  [0, 0.62],
  [-0.28, 0.42], [-0.48, 0.22], [-0.62, 0.02], [-0.74, -0.14],
  [-0.22, -0.2], [-0.3, -0.52], [-0.35, -0.74], [-0.39, -0.93],
  [-0.03, -0.26], [-0.04, -0.62], [-0.05, -0.86], [-0.06, -1.06],
  [0.16, -0.22], [0.21, -0.55], [0.25, -0.77], [0.28, -0.95],
  [0.32, -0.12], [0.42, -0.38], [0.49, -0.55], [0.55, -0.71],
];
