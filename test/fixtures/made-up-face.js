// A made-up face, as the face tracker would report it: 478 points as x, y, z, x, y, z..., for the unit tests of
// core/face/mouth.js and for the stand-in tracker the browser tests use (test/e2e/fake-face.worker.js). There are
// no photos of faces in this folder, and none may be added, so this is a face drawn with numbers: eyes, cheeks, a
// forehead, a chin and lips, in the places the real tracker puts them, with a mouth that opens, and a head that
// turns, tips and tilts.
import { FACE_OVAL, FACE_POINTS, LIPS_INNER, LIPS_OUTER } from '../../core/face/mouth.js';

const radians = (degrees) => (degrees * Math.PI) / 180;
// The forehead slopes back from the chin by this much on a face that's straight on, as the real tracker has it.
const SLOPE = Math.tan(radians(5));
const BROW_Y = -0.72;

/**
 * x and y are where the face is, between the eyes, from 0 to 1 across and down the picture as the camera sends it,
 * which isn't mirrored. size is the distance between the outer corners of the eyes, as a share of the picture's
 * height, and open how far apart the lips are, as a share of that distance: 0 is shut, and about 0.4 a wide yawn.
 * yaw, pitch and roll turn the head to the side, tip it down and tilt it over, in degrees.
 */
export function madeUpFace({ x = 0.5, y = 0.4, size = 0.2, open = 0, yaw = 0, pitch = 0, roll = 0, aspect = 16 / 9 } = {}) {
  // Each point across, down and away from the camera, measured in distances between the eyes, from between them.
  const chinY = 1.3 + open * 0.85;
  const model = Array.from({ length: FACE_POINTS }, () => [0, 0.4, 0]);
  FACE_OVAL.forEach((index, order) => {
    const turn = (order / FACE_OVAL.length) * Math.PI * 2;
    const middle = (chinY + BROW_Y) / 2;
    const y0 = middle - Math.cos(turn) * ((chinY - BROW_Y) / 2);
    model[index] = [Math.sin(turn) * 0.8, y0, 0.55 * Math.sin(turn) ** 2 + SLOPE * (y0 - BROW_Y)];
  });
  // The lips' two outlines: the outer one, and the inner one, which is what opens.
  const ring = (indices, top, bottom, halfWide, z) => {
    const middle = (top + bottom) / 2;
    const half = (bottom - top) / 2;
    indices.forEach((index, order) => {
      const turn = (order / indices.length) * Math.PI * 2;
      model[index] = [-Math.cos(turn) * halfWide, middle + Math.sin(turn) * half, z];
    });
  };
  ring(LIPS_OUTER, 0.84, 1.02 + open, 0.3, -0.1);
  ring(LIPS_INNER, 0.92, 0.92 + open, 0.26, -0.12);
  Object.assign(model, {
    33: [-0.5, 0, 0.06], // The outer corners of the eyes,
    263: [0.5, 0, 0.06],
    133: [-0.17, 0, 0.02], // and the inner ones.
    362: [0.17, 0, 0.02],
    234: [-0.78, 0.3, 0.55], // The edge of the face by each ear.
    454: [0.78, 0.3, 0.55],
    10: [0, BROW_Y, 0], // The top of the forehead, and the chin, which drops as the mouth opens.
    152: [0, chinY, SLOPE * (chinY - BROW_Y)],
    1: [0, 0.52, -0.3], // The tip of the nose, and under it.
    2: [0, 0.62, -0.12],
    168: [0, 0, 0], // Between the eyes.
  });

  const [sinRoll, cosRoll] = [Math.sin(radians(roll)), Math.cos(radians(roll))];
  const [sinPitch, cosPitch] = [Math.sin(radians(pitch)), Math.cos(radians(pitch))];
  const [sinYaw, cosYaw] = [Math.sin(radians(yaw)), Math.cos(radians(yaw))];
  const points = new Float32Array(FACE_POINTS * 3);
  model.forEach(([px, py, pz], index) => {
    // Tilted over, then tipped, then turned.
    const [rx, ry] = [px * cosRoll - py * sinRoll, px * sinRoll + py * cosRoll];
    const [ty, tz] = [ry * cosPitch - pz * sinPitch, ry * sinPitch + pz * cosPitch];
    const [fx, fz] = [rx * cosYaw + tz * sinYaw, -rx * sinYaw + tz * cosYaw];
    points[index * 3] = x + (fx * size) / aspect;
    points[index * 3 + 1] = y + ty * size;
    points[index * 3 + 2] = (fz * size) / aspect;
  });
  return points;
}

/** What the tracker's worker would send for these faces: see core/face/face.worker.js. */
export const madeUpFaces = (...faces) => faces.map((face) => ({ points: madeUpFace(face) }));
