// Pictures of the characters, for the cards they're chosen from.
import * as THREE from '../../vendor/three/three.module.js';
import { Fighter3D, makePose } from './characters.js';

/** Draws one fighter by itself. Returns a data URL, which is used on the choosing cards. */
export function renderPortraits(roster, { width = 220, height = 220 } = {}) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#cdd7e2', 1.5));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.position.set(2, 6, 7);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(22, width / height, 0.1, 40);

  const pictures = {};
  for (const spec of roster) {
    const fighter = new Fighter3D(spec);
    // A long neck puts the head higher up, so the picture goes with it.
    camera.position.set(0.85, 1.95 + spec.build.neck, 4.2);
    camera.lookAt(0, 1.46 + spec.build.neck, 0);
    fighter.setPose(makePose());
    fighter.blinkIn = 99;
    fighter.update(0.5);
    scene.add(fighter.root);
    renderer.render(scene, camera);
    pictures[spec.id] = canvas.toDataURL('image/png');
    scene.remove(fighter.root);
    fighter.dispose();
  }
  renderer.forceContextLoss();
  renderer.dispose();
  return pictures;
}
