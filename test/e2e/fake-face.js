// For the games played with the face. There are no photos of faces in this folder, and none may be added, so
// these tests can't show the real face tracker a face, as the hand games' tests show the hand tracker real hands.
// Instead, this replaces the webcam with a drawing of a face, and the tracker with a stand-in that reports that
// same face, as the real one would report a real one: fake-face.worker.js, which the game takes in place of its
// tracker when the page is opened with ?debug (see core/face/session.js). Everything after the tracker is the real
// thing: reading the mouth, the check, the game. The real tracker is only tested for loading and running.
//
// Tests say what the child is doing in mirror terms: x is how far across the mirror the face is, from 0 on the
// left to 1 on the right, and y how far down. size is the distance between the outer corners of the eyes, as a
// share of the picture's height, and open how far apart the lips are, as a share of that: 0 is shut, and 0.4 a
// wide open mouth. yaw, pitch and roll turn the head, in degrees.
(() => {
  const WIDTH = 1280;
  const HEIGHT = 720;
  const DEFAULTS = { seen: true, x: 0.5, y: 0.42, size: 0.2, open: 0, yaw: 0, pitch: 0, roll: 0, stalled: false, others: [] };
  const scene = { ...DEFAULTS };

  // What the tracker would see: the camera's picture isn't mirrored, so across is the other way round.
  const asSeen = (face) => ({ ...face, x: 1 - face.x });
  const tell = () => {
    const worker = window.__game?.camera?.worker;
    if (!worker) return;
    worker.postMessage({ type: 'scene', scene: { seen: scene.seen, stalled: scene.stalled, faces: [asSeen(scene), ...scene.others.map(asSeen)] } });
  };

  window.__faceTracker = '/test/e2e/fake-face.worker.js';
  window.__face = {
    failWith: null,
    streams: 0,
    /** Changes what the child is doing. Anything not said stays as it was. */
    show(change) {
      Object.assign(scene, change);
      tell();
    },
    /** Nobody in the picture. */
    showNobody() {
      this.show({ seen: false });
    },
    reset() {
      Object.assign(scene, DEFAULTS);
      tell();
    },
    get scene() {
      return { ...scene };
    },
    get activeTracks() {
      return (window.__face.stream?.getTracks() ?? []).filter((track) => track.readyState === 'live').length;
    },
  };
  // The tracker may only just have started, or started again.
  setInterval(tell, 100);

  /** A face drawn with shapes, where and how the scene says, so that the mirror shows what the child is doing. */
  function drawFace(ctx, face) {
    const eyes = face.size * HEIGHT;
    ctx.save();
    ctx.translate(face.x * WIDTH, face.y * HEIGHT);
    ctx.rotate((face.roll * Math.PI) / 180);
    // Turned to the side, a face looks narrower, and its features go over to that side.
    const turned = Math.cos((face.yaw * Math.PI) / 180);
    const across = Math.sin((face.yaw * Math.PI) / 180) * eyes * 0.35;
    ctx.scale(eyes, eyes);
    const chin = 1.3 + face.open * 0.85;
    ctx.fillStyle = '#5b3a29';
    ctx.beginPath();
    ctx.ellipse(0, -0.25, 0.92 * turned + 0.1, 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c79b';
    ctx.beginPath();
    ctx.ellipse(0, (chin - 0.72) / 2, 0.8 * turned + 0.08, (chin + 0.72) / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(across / eyes, 0);
    ctx.fillStyle = '#ffffff';
    for (const x of [-0.34, 0.34]) {
      ctx.beginPath();
      ctx.ellipse(x * turned, 0, 0.17 * turned, 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#2b3440';
    for (const x of [-0.34, 0.34]) {
      ctx.beginPath();
      ctx.arc(x * turned, 0, 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#d99a6c';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(0, 0.2);
    ctx.lineTo(0.08, 0.6);
    ctx.lineTo(-0.04, 0.62);
    ctx.stroke();
    // The mouth: lips round a dark inside, as far open as the scene says.
    ctx.fillStyle = '#c4566a';
    ctx.beginPath();
    ctx.ellipse(0, 0.93 + face.open / 2, 0.3 * turned, 0.09 + face.open / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (face.open > 0.02) {
      ctx.fillStyle = '#4a1420';
      ctx.beginPath();
      ctx.ellipse(0, 0.92 + face.open / 2, 0.24 * turned, face.open / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function startCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#c9ccd1';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      if (!scene.seen) return;
      // Whoever is behind first, and the child in front.
      for (const face of [...scene.others, scene]) drawFace(ctx, asSeen({ ...DEFAULTS, ...face }));
    };
    draw();
    setInterval(draw, 33);
    return canvas.captureStream(30);
  }

  const fakeGetUserMedia = async () => {
    const { failWith } = window.__face;
    if (failWith) throw new DOMException('Simulated camera problem', failWith);
    window.__face.streams += 1;
    window.__face.stream = startCanvas();
    return window.__face.stream;
  };

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: fakeGetUserMedia },
  });
})();
