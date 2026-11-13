// The kickers in Giraffe's Goal: characters from core/body/roster.js, drawn once from their 3D models into flat
// pictures, as Giraffe's own are (games/giraffe-garden/giraffe.js). Each faces the child, who is in goal, standing,
// in two steps of a run, kicking, and cheering, and is drawn at the size it's shown on this screen, so it's sharp.
import * as THREE from '../../vendor/three/three.module.js';
import { Fighter3D, makePose } from '../../core/body/characters.js';

const LOOK_DOWN = 0.14; // In radians: only a little from above.
const BODY = 2.05; // About how tall a character is without a long neck, in its own units.
const WIDE = 2.3; // The pictures' width, in the same units, with room for arms up in a cheer.
const MOST_PIXELS = 460; // The most a body is drawn, in pixels, however big the screen.

const REST = makePose();
const pose = (changes) => ({ ...REST, ...changes });
const run = (lead) => pose({
  up: 0.07,
  pitch: 0.12,
  footLZ: lead,
  footRZ: -lead,
  footLY: lead < 0 ? 0.26 : 0.02,
  footRY: lead > 0 ? 0.26 : 0.02,
  handLX: 0.44,
  handLY: -0.62,
  handLZ: -lead * 1.2,
  handRX: -0.44,
  handRY: -0.62,
  handRZ: lead * 1.2,
});

// Each picture's pose and face. The kick is towards the child: the leg comes up and out at the camera.
export const POSES = {
  stand: { pose: pose({ handLX: 0.38, handLY: -0.84, handRX: -0.38, handRY: -0.84 }), face: 'ready' },
  stepA: { pose: run(0.3), face: 'ready' },
  stepB: { pose: run(-0.3), face: 'ready' },
  kick: { pose: pose({ footLX: 0.16, footLY: 0.46, footLZ: 0.85, footRX: -0.12, footLPitch: -0.9, pitch: -0.2, hipDrop: 0.03, handLX: 0.66, handLY: -0.3, handLZ: 0.1, handRX: -0.66, handRY: -0.2, handRZ: -0.2 }), face: 'ready' },
  cheer: { pose: pose({ up: 0.16, handLX: 0.34, handLY: 0.92, handLZ: 0.12, handRX: -0.34, handRY: 0.92, handRZ: 0.12, headPitch: -0.12 }), face: 'happy' },
};
export const FRAMES = Object.keys(POSES);

/** How many pixels tall a kicker's body should be drawn, to be sharp at this many screen pixels tall. */
export function playerPixels(cssTall, ratio = 1) {
  return Math.round(Math.min(MOST_PIXELS, Math.max(90, cssTall * ratio)));
}

/**
 * Pictures of each character, for bodies this many pixels tall. Returns, by id, { frames: { stand, stepA, stepB,
 * kick, cheer }, width, height, foot, tall }: foot is where the character stands in each picture, and tall how many
 * pixels high its body is there, without a long neck.
 */
export function renderPlayers(specs, bodyPixels) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#cdd7e2', 1.6));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.1);
  sun.position.set(-3, 8, 6);
  scene.add(sun);
  const up = Math.cos(LOOK_DOWN);
  const along = Math.sin(LOOK_DOWN);
  const pixels = bodyPixels / (BODY * up);
  const players = {};
  for (const spec of specs) {
    const tall = BODY + spec.build.neck;
    // The pictures' edges, in the view's own units: room above the head for a cheer.
    const [left, right, top, bottom] = [-WIDE / 2, WIDE / 2, (tall + 0.7) * up + 0.5 * along, -0.4 * along - 0.06];
    const width = Math.round((right - left) * pixels);
    const height = Math.round((top - bottom) * pixels);
    renderer.setSize(width, height, false);
    const camera = new THREE.OrthographicCamera(left, right, top, bottom, 0.1, 80);
    camera.position.set(0, along * 30, up * 30);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const fighter = new Fighter3D(spec);
    fighter.blinkIn = 99;
    scene.add(fighter.root);
    const shoot = (name) => {
      fighter.faceTowards(0);
      fighter.setPose(POSES[name].pose);
      fighter.setExpression(POSES[name].face);
      fighter.update(0.5);
      scene.updateMatrixWorld(true);
      renderer.render(scene, camera);
      const image = document.createElement('canvas');
      image.width = width;
      image.height = height;
      image.getContext('2d').drawImage(canvas, 0, 0);
      return image;
    };
    const frames = Object.fromEntries(FRAMES.map((name) => [name, shoot(name)]));
    scene.remove(fighter.root);
    fighter.dispose();
    players[spec.id] = { frames, width, height, foot: { x: width / 2, y: (top / (top - bottom)) * height }, tall: BODY * up * pixels };
  }
  renderer.forceContextLoss();
  renderer.dispose();
  return players;
}
