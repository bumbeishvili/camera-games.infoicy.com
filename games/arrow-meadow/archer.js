// Giraffe, the archer: drawn once from his 3D model (core/body/characters.js) into flat pictures, side on and turned
// a little towards the child so his face shows, standing as an archer stands. Both his arms are left out of them,
// as the meadow draws them: one out to the bow and one back to the string, wherever the child's hands have them.
import * as THREE from '../../vendor/three/three.module.js';
import { Fighter3D, makePose } from '../../core/body/characters.js';

const WIDE = 2.1; // How much of his own size fits across a picture.
const BELOW = 0.06;
const ABOVE = 0.5; // Room over his head for a little jump.
const BODY = 2.05; // About how tall a character is, without a long neck.
const MOST_PIXELS = 520; // The most his body is drawn, in pixels, however big the screen.
// Facing the way the picture faces, which is to the right, and turned this far towards the child.
const FACING = Math.PI / 2 - 0.5;

const REST = makePose();
const pose = (changes) => ({ ...REST, ...changes });
const STANCE = { hipDrop: 0.03, footLX: 0.2, footRX: -0.2, footLZ: 0.2, footRZ: -0.18 };
// Each picture: a pose for his body, and a face. Aiming, he leans back a little and looks along the arrow.
const POSES = {
  ready: { pose: pose({ ...STANCE, pitch: -0.04, headPitch: -0.05 }), face: 'ready' },
  glad: { pose: pose({ ...STANCE, pitch: -0.08, headPitch: -0.14, up: 0.07, footLY: 0.03, footRY: 0.03 }), face: 'happy' },
};

/** How many pixels tall his body should be drawn, to be sharp at this many screen pixels tall. */
export function archerPixels(cssTall, ratio = 1) {
  return Math.round(Math.min(MOST_PIXELS, Math.max(100, cssTall * ratio)));
}

/**
 * Giraffe's pictures, for a body this many pixels tall. Returns { frames, width, height, foot, body, arm }: frames
 * has each pose as { image, near, far }, the two shoulders his arms come from, in the picture's pixels, the nearer
 * to the child and the further. foot is where he stands in the picture, body how tall he is there without his
 * neck, and arm his arms' colours.
 */
export function renderArcher(spec, bodyPixels) {
  const pixels = bodyPixels / BODY;
  const tall = BODY + spec.build.neck;
  const [left, right, top, bottom] = [-WIDE / 2, WIDE / 2, tall + ABOVE, -BELOW];
  const width = Math.round((right - left) * pixels);
  const height = Math.round((top - bottom) * pixels);
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(width, height, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#cdd7e2', 1.5));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.position.set(2, 6, 7);
  scene.add(sun);
  const camera = new THREE.OrthographicCamera(left, right, top, bottom, 0.1, 40);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  const point = new THREE.Vector3();
  const toPicture = (vector) => {
    vector.project(camera);
    return { x: ((vector.x + 1) / 2) * width, y: ((1 - vector.y) / 2) * height };
  };

  const fighter = new Fighter3D(spec);
  fighter.faceTowards(FACING);
  fighter.upperL.visible = false;
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
    // Facing right, his right shoulder is the one nearer the child.
    frames[name] = { image, near: toPicture(fighter.upperR.getWorldPosition(point)), far: toPicture(fighter.upperL.getWorldPosition(point)) };
  }
  scene.remove(fighter.root);
  fighter.dispose();
  renderer.forceContextLoss();
  renderer.dispose();
  const { colours } = spec;
  return {
    frames,
    width,
    height,
    foot: { x: width / 2, y: height - BELOW * pixels },
    body: BODY * pixels,
    arm: { skin: colours.arm ?? colours.body, hand: colours.hand ?? colours.arm ?? colours.body, ink: colours.ink },
  };
}
