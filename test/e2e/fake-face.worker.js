// A stand-in for the face tracker (core/face/face.worker.js), for the browser tests, which have no photos of
// faces to show the real one. It takes the same messages and answers in the same way, with a made-up face
// (test/fixtures/made-up-face.js) doing whatever fake-face.js says the child is doing. It never looks at the
// camera's picture: each frame is closed as it arrives, as the real tracker closes it.
import { madeUpFace } from '../fixtures/made-up-face.js';

// About as long as the real tracker takes over a frame.
const TRACKING_MS = 12;
let scene = { seen: false, stalled: false, faces: [] };

self.onmessage = ({ data }) => {
  if (data.type === 'init') {
    self.postMessage({ type: 'ready', delegate: 'stand-in' });
    return;
  }
  if (data.type === 'scene') {
    scene = data.scene;
    return;
  }
  if (data.type === 'frame') {
    const { bitmap, timestamp, width, height } = data;
    bitmap.close();
    // A tracker that has stopped answering, as one can: the game must take that as nobody there.
    if (scene.stalled) return;
    const aspect = width / height;
    const faces = scene.seen ? scene.faces.map((face) => ({ points: madeUpFace({ ...face, aspect }) })) : [];
    setTimeout(() => self.postMessage({ type: 'result', faces, timestamp, aspect }, faces.map((face) => face.points.buffer)), TRACKING_MS);
  }
};
