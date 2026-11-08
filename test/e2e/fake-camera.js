// Replaces the webcam with a canvas showing real photos of hands. Everything after the
// camera is the real thing: the real tracker, the real model and the real game.
//
// Tests say what the child is doing in screen terms ("left hand on the left of the
// mirror"). The canvas is then flipped, because a webcam sends the unmirrored picture.
(() => {
  const WIDTH = 1280;
  const HEIGHT = 720;
  const PHOTO_HEIGHT = 430;
  const SLOT_X = { left: 330, right: 950 };
  // Which real hand each photo shows, which the tracker's label confirms. Flipped, a left
  // hand becomes a right hand, so a photo of either can stand in for both.
  const PHOTO_HAND = {
    open: 'left',
    relaxed: 'left',
    fist: 'right',
    pointing: 'right',
    victory: 'right',
    'thumbs-up': 'right',
  };

  const photos = {};
  const loadPhoto = (name) => {
    if (photos[name]) return photos[name];
    const image = new Image();
    image.src = `/test/fixtures/photos/${name}.jpg`;
    photos[name] = image;
    return image;
  };

  const DEFAULTS = {
    leftOffsetY: 0,
    rightOffsetY: 0,
    rightOffsetX: 0,
    leftOffsetX: 0, // Together with rightOffsetX, these can put a hand on the wrong side.
    leftOnTop: false, // Which hand is in front, if they overlap.
    scale: 1,
    rotate: 0, // Degrees, each hand turned the same way as seen by the child.
    brightness: 1, // Below 1 is a dimmer room.
    blur: 0, // In pixels, for a moving hand or a poor camera.
  };
  const scene = { left: 'open', right: 'open', ...DEFAULTS };

  // For whole-body games: real footage of a person, which plays as if it were the camera.
  const footage = document.createElement('video');
  footage.muted = true;
  footage.loop = true;
  footage.playsInline = true;

  window.__camera = {
    failWith: null,
    streams: 0,
    show(change) {
      scene.footage = false;
      Object.assign(scene, DEFAULTS, change);
    },
    /** Shows a clip from test/fixtures/body, from a moment in it, playing or held still. */
    /** Moves the footage that's playing across, without starting it again. See shiftX below. */
    shiftFootage(shiftX) {
      scene.footageShiftX = shiftX;
    },
    /** shiftX moves the person across, as a share of the picture's width, towards the right of the mirror. */
    async showFootage(name, { from = 0, playing = true, height = 1, shiftY = 0, shiftX = 0 } = {}) {
      const source = `/test/fixtures/body/${name}.webm`;
      if (footage.dataset.clip !== source) {
        // All of it, as the test server can't send part of a file, and a clip can't seek without that.
        const blob = await (await fetch(source)).blob();
        footage.dataset.clip = source;
        footage.src = URL.createObjectURL(blob);
        await new Promise((resolve, reject) => {
          footage.onloadeddata = resolve;
          footage.onerror = () => reject(new Error(`cannot load ${source}`));
        });
      }
      footage.pause();
      await new Promise((resolve) => {
        footage.onseeked = resolve;
        footage.currentTime = from;
      });
      scene.footage = true;
      scene.footageHeight = height;
      scene.footageShiftY = shiftY;
      scene.footageShiftX = shiftX;
      if (playing) await footage.play();
    },
    /** An empty room. */
    showNobody() {
      footage.pause();
      scene.footage = false;
      Object.assign(scene, DEFAULTS, { left: null, right: null });
    },
    get activeTracks() {
      return (window.__camera.stream?.getTracks() ?? []).filter((track) => track.readyState === 'live').length;
    },
  };

  function drawHand(ctx, name, centreX, centreY, side, scale) {
    if (!name) return;
    const image = loadPhoto(name);
    // The whole canvas is flipped afterwards, so a photo that already shows this hand has
    // to be flipped here too, to arrive at the camera the right way round.
    const flip = PHOTO_HAND[name] === side;
    if (!image.complete || !image.naturalWidth) return;
    const height = PHOTO_HEIGHT * scale;
    const width = (height * image.naturalWidth) / image.naturalHeight;
    ctx.save();
    ctx.translate(centreX, centreY);
    ctx.rotate((scene.rotate * Math.PI) / 180);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  function startCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    const draw = () => {
      ctx.setTransform(-1, 0, 0, 1, WIDTH, 0);
      ctx.fillStyle = '#c9ccd1';
      ctx.filter = 'none';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.filter = `brightness(${scene.brightness}) blur(${scene.blur}px)`;
      if (scene.footage) {
        // Webcams send the unmirrored picture, as does this footage, so undo the flip above.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const height = HEIGHT * scene.footageHeight;
        const width = (height * footage.videoWidth) / footage.videoHeight;
        // The picture isn't mirrored, so the right of the mirror is the left of this picture.
        ctx.fillStyle = '#808080';
        if (scene.footageShiftX) ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.drawImage(footage, (WIDTH - width) / 2 - (scene.footageShiftX ?? 0) * WIDTH, (HEIGHT - height) / 2 + scene.footageShiftY * HEIGHT, width, height);
        return;
      }
      const middle = HEIGHT / 2;
      const drawLeft = () => drawHand(ctx, scene.left, SLOT_X.left + scene.leftOffsetX, middle + scene.leftOffsetY, 'left', scene.scale);
      const drawRight = () => drawHand(ctx, scene.right, SLOT_X.right + scene.rightOffsetX, middle + scene.rightOffsetY, 'right', scene.scale);
      for (const draw of scene.leftOnTop ? [drawRight, drawLeft] : [drawLeft, drawRight]) draw();
    };
    draw();
    setInterval(draw, 33);
    return canvas.captureStream(30);
  }

  const fakeGetUserMedia = async () => {
    const { failWith } = window.__camera;
    if (failWith) throw new DOMException('Simulated camera problem', failWith);
    window.__camera.streams += 1;
    window.__camera.stream = startCanvas();
    return window.__camera.stream;
  };

  // Load the photos up front so a scene change is instant.
  ['open', 'fist', 'pointing', 'victory', 'thumbs-up', 'relaxed'].forEach(loadPhoto);

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: fakeGetUserMedia },
  });
})();
