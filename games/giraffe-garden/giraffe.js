// Giraffe for the garden, drawn once from his 3D model (core/body/characters.js) into three flat pictures: standing,
// cheering and waving. Seen from the front and nearly level, as he looks over the bush by the fence, and drawn at
// the size he's shown on this screen, so he's sharp. The maze's pictures of him are seen from above, and small.
import * as THREE from '../../vendor/three/three.module.js';
import { Fighter3D } from '../../core/body/characters.js';
import { POSES } from '../giraffe-maze/walkers.js';

const LOOK_DOWN = 0.12; // In radians: only a little from above.
const BODY = 2.05; // About how tall a character is without a long neck, in its own units.
const WIDE = 2.5; // The pictures' width, in the same units, with room for his arms up in a cheer.
const TURNED = 0.12; // Turned this far, in radians, from facing the child towards the right of the screen.
const MOST_PIXELS = 760; // The most his body is drawn, in pixels, however big the screen.

/** How many pixels tall Giraffe's body should be drawn, to be sharp at this many screen pixels tall. */
export function giraffePixels(cssTall, ratio = 1) {
  return Math.round(Math.min(MOST_PIXELS, Math.max(120, cssTall * ratio)));
}

/**
 * Giraffe's three pictures, for a body this many pixels tall, turned a little towards the right of the screen, where
 * the garden is when he stands on the left (they're flipped for the other side). Returns { frames: { stand, cheer,
 * wave }, width, height, foot, tall }: foot is where he stands in each picture, and tall how many pixels high his
 * body is there, without his neck.
 */
export function renderGiraffe(spec, bodyPixels) {
  const up = Math.cos(LOOK_DOWN);
  const along = Math.sin(LOOK_DOWN);
  const pixels = bodyPixels / (BODY * up);
  const tall = BODY + spec.build.neck;
  // The pictures' edges, in the view's own units: room above his head for a cheer.
  const [left, right, top, bottom] = [-WIDE / 2, WIDE / 2, (tall + 0.75) * up + 0.5 * along, -0.4 * along - 0.06];
  const width = Math.round((right - left) * pixels);
  const height = Math.round((top - bottom) * pixels);
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(width, height, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#cdd7e2', 1.6));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.1);
  sun.position.set(-3, 8, 6);
  scene.add(sun);
  const camera = new THREE.OrthographicCamera(left, right, top, bottom, 0.1, 80);
  camera.position.set(0, along * 30, up * 30);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  const fighter = new Fighter3D(spec);
  fighter.blinkIn = 99;
  scene.add(fighter.root);
  // A friendly smile, not a fighter's ready face, and a big happy one for a cheer.
  const shoot = (name) => {
    fighter.faceTowards(TURNED);
    fighter.setPose(POSES[name].pose);
    fighter.setExpression(name === 'cheer' ? 'happy' : 'glad');
    fighter.update(0.5);
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
    const image = document.createElement('canvas');
    image.width = width;
    image.height = height;
    image.getContext('2d').drawImage(canvas, 0, 0);
    return image;
  };
  const frames = { stand: shoot('stand'), cheer: shoot('cheer'), wave: shoot('wave') };
  scene.remove(fighter.root);
  fighter.dispose();
  renderer.forceContextLoss();
  renderer.dispose();
  return { frames, width, height, foot: { x: width / 2, y: (top / (top - bottom)) * height }, tall: BODY * up * pixels };
}
