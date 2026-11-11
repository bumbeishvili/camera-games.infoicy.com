// Real hands from photos, for the hand rules' tests: test/fixtures/photo-hands.json holds what the real model
// reported for each photo, and these put one wherever it's wanted on screen, as a webcam would send it.
import { readFileSync } from 'node:fs';
import { HandMonitor } from '../../core/hands.js';

export const photos = JSON.parse(readFileSync(new URL('../fixtures/photo-hands.json', import.meta.url)));
export const FRAME_ASPECT = 16 / 9;

/** A real hand from a photo, moved to a place on screen. A webcam sends x unmirrored. */
export function handAt(name, screenX, screenY = 0.5, { palm = 0.2, index = 0, label = null, confidence = hands => hands.score } = {}) {
  const { aspect, hands } = photos[name];
  const hand = hands[index];
  const centre = [0, 5, 9, 13, 17].reduce(
    (sum, i) => ({ x: sum.x + hand.image[i].x / 5, y: sum.y + hand.image[i].y / 5 }),
    { x: 0, y: 0 },
  );
  const wrist = hand.image[0];
  const knuckle = hand.image[9];
  const palmLength = Math.hypot((wrist.x - knuckle.x) * aspect, wrist.y - knuckle.y);
  const k = palm / palmLength;
  return {
    score: confidence(hand),
    label,
    world: hand.world,
    image: hand.image.map((p) => ({
      x: 1 - screenX + ((p.x - centre.x) * aspect * k) / FRAME_ASPECT,
      y: screenY + (p.y - centre.y) * k,
      z: p.z,
    })),
  };
}

export const OPEN = 'left_hands';
export const FIST = 'fist';
// The right hand, where it naturally is in the mirror, and the left hand on its own side.
export const rightHand = (name, options) => handAt(name, 0.73, 0.5, { label: 'Right', ...options });
export const leftHand = (name, options) => handAt(name, 0.27, 0.5, { label: 'Left', ...options });

/** Feeds the same view to the monitor for a while, at camera speed. */
export function feed(monitor, clock, ms, hands) {
  let snapshot = monitor.snapshot;
  for (let elapsed = 0; elapsed < ms; elapsed += 33) {
    clock.now += 33;
    snapshot = monitor.update(hands, clock.now, FRAME_ASPECT);
  }
  return snapshot;
}

export const setup = (options, side) => ({ monitor: new HandMonitor(options, side), clock: { now: 1000 } });
