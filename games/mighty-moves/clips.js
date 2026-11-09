// How each move looks: short sequences of poses that the fighter's limbs blend through. Every
// strike is written for the right side and mirrored for the left. Hands stay open throughout,
// except for the one move that's made with a closed hand, because that's what a fist becomes.
import { makePose, mirrorPose } from '../../core/body/characters.js';

const REST = makePose();

const pose = (changes) => ({ ...REST, ...changes });

/** The ready stance: light on the feet, with palms up and forward. */
export const STANCE = pose({
  hipDrop: 0.07,
  pitch: 0.1,
  handLX: 0.02, handLY: -0.2, handLZ: 0.66,
  handRX: -0.02, handRY: -0.1, handRZ: 0.74,
  wristL: -1.25, wristR: -1.25,
  footLX: 0.25, footLZ: 0.15,
  footRX: -0.25, footRZ: -0.15,
});

const stance = (changes) => ({ ...STANCE, ...changes });

// t is seconds from the start. lunge means forward is a share of the gap to the opponent, so a
// strike always reaches them. Otherwise forward is a distance.
const CLIP_SOURCES = {
  palm: {
    lunge: true,
    frames: [
      [0.0, stance({ twist: -0.28, handRX: -0.12, handRY: -0.16, handRZ: 0.36, wristR: -0.9 })],
      [0.1, stance({ forward: 1, twist: 0.5, pitch: 0.24, hipZ: 0.06, handRX: 0.08, handRY: -0.02, handRZ: 1.02, wristR: -1.5, footRZ: -0.3 })],
      [0.22, stance({ forward: 1, twist: 0.46, pitch: 0.22, hipZ: 0.06, handRX: 0.08, handRY: -0.02, handRZ: 1.02, wristR: -1.5, footRZ: -0.3 })],
      [0.42, STANCE],
    ],
  },
  punch: {
    lunge: true,
    frames: [
      [0.0, stance({ twist: -0.28, handRX: -0.12, handRY: -0.16, handRZ: 0.36, wristR: 0, openR: 0 })],
      [0.1, stance({ forward: 1, twist: 0.5, pitch: 0.24, hipZ: 0.06, handRX: 0.08, handRY: -0.02, handRZ: 1.02, wristR: -0.1, openR: 0, footRZ: -0.3 })],
      [0.22, stance({ forward: 1, twist: 0.46, pitch: 0.22, hipZ: 0.06, handRX: 0.08, handRY: -0.02, handRZ: 1.02, wristR: -0.1, openR: 0, footRZ: -0.3 })],
      [0.42, STANCE],
    ],
  },
  uppercut: {
    lunge: true,
    frames: [
      [0.0, stance({ hipDrop: 0.18, twist: -0.3, handRX: -0.1, handRY: -0.75, handRZ: 0.42, wristR: -0.6 })],
      [0.14, stance({ forward: 1, hipDrop: 0, up: 0.1, twist: 0.4, pitch: -0.08, handRX: 0.05, handRY: 0.72, handRZ: 0.66, wristR: -1.3 })],
      [0.27, stance({ forward: 1, hipDrop: 0.02, up: 0.05, twist: 0.36, pitch: -0.06, handRX: 0.05, handRY: 0.72, handRZ: 0.66, wristR: -1.3 })],
      [0.48, STANCE],
    ],
  },
  chop: {
    lunge: true,
    frames: [
      [0.0, stance({ handRX: -0.22, handRY: 0.86, handRZ: 0.3, wristR: 0.2, pitch: -0.06 })],
      [0.12, stance({ forward: 1, twist: 0.32, pitch: 0.3, handRX: 0.04, handRY: -0.2, handRZ: 0.96, wristR: -0.2 })],
      [0.25, stance({ forward: 1, twist: 0.3, pitch: 0.28, handRX: 0.04, handRY: -0.26, handRZ: 0.94, wristR: -0.2 })],
      [0.45, STANCE],
    ],
  },
  thunderClap: {
    lunge: true,
    frames: [
      [0.0, stance({ hipDrop: 0.12, handLX: 0.85, handLY: 0.1, handLZ: 0.25, handRX: -0.85, handRY: 0.1, handRZ: 0.25, wristL: -0.5, wristR: -0.5 })],
      [0.14, stance({ forward: 0.85, pitch: 0.22, handLX: -0.5, handLY: -0.02, handLZ: 0.85, handRX: 0.5, handRY: -0.02, handRZ: 0.85, wristL: -0.6, wristR: -0.6 })],
      [0.3, stance({ forward: 0.85, pitch: 0.22, handLX: -0.5, handLY: -0.02, handLZ: 0.85, handRX: 0.5, handRY: -0.02, handRZ: 0.85, wristL: -0.6, wristR: -0.6 })],
      [0.6, STANCE],
    ],
  },
  whirlwind: {
    lunge: true,
    frames: [
      [0.0, stance({ handRX: -0.7, handRY: -0.7, handRZ: 0.1 })],
      [0.1, stance({ forward: 0.35, twist: -0.3, handRX: -0.95, handRY: 0.05, handRZ: 0.1 })],
      [0.2, stance({ forward: 0.7, twist: -0.1, handRX: -0.3, handRY: 0.95, handRZ: 0.1 })],
      [0.3, stance({ forward: 1, twist: 0.45, pitch: 0.25, handRX: 0.1, handRY: 0.2, handRZ: 1, wristR: -1.5 })],
      [0.46, stance({ forward: 1, twist: 0.42, pitch: 0.24, handRX: 0.1, handRY: 0.2, handRZ: 1, wristR: -1.5 })],
      [0.8, STANCE],
    ],
  },
  kick: {
    lunge: true,
    frames: [
      [0.0, stance({ footRX: -0.15, footRY: 0.3, footRZ: 0.1, pitch: -0.04 })],
      [0.14, stance({ forward: 1, pitch: -0.34, hipDrop: 0.04, footLX: 0.17, footLZ: 0, footRX: -0.14, footRY: 0.5, footRZ: 0.86, footRPitch: -0.9, handLY: -0.3, handRX: -0.3, handRY: -0.3, handRZ: 0.2 })],
      [0.27, stance({ forward: 1, pitch: -0.3, hipDrop: 0.04, footLX: 0.17, footLZ: 0, footRX: -0.14, footRY: 0.5, footRZ: 0.86, footRPitch: -0.9, handLY: -0.3, handRX: -0.3, handRY: -0.3, handRZ: 0.2 })],
      [0.5, STANCE],
    ],
  },
  knee: {
    lunge: true,
    frames: [
      [0.0, stance({ footRY: 0.16, footRZ: 0.08, pitch: 0.04 })],
      [0.12, stance({ forward: 1, up: 0.08, pitch: 0.24, footLX: 0.17, footLZ: 0, footRX: -0.13, footRY: 0.4, footRZ: 0.36, handLY: -0.06, handRY: -0.02 })],
      [0.25, stance({ forward: 1, up: 0.05, pitch: 0.22, footLX: 0.17, footLZ: 0, footRX: -0.13, footRY: 0.38, footRZ: 0.34, handLY: -0.06, handRY: -0.02 })],
      [0.45, STANCE],
    ],
  },
  stomp: {
    frames: [
      [0.0, stance({ hipDrop: 0.2, squash: 0.08, handLX: 0.52, handLY: -0.5, handLZ: 0.2, handRX: -0.52, handRY: -0.5, handRZ: 0.2, wristL: 0, wristR: 0 })],
      [0.17, stance({ up: 0.62, squash: -0.1, hipDrop: 0.08, footLX: 0.26, footLY: 0.12, footRX: -0.26, footRY: 0.12, footLZ: 0, footRZ: 0, handLX: 0.5, handLY: 0.72, handLZ: 0.12, handRX: -0.5, handRY: 0.72, handRZ: 0.12, wristL: 0, wristR: 0 })],
      [0.31, stance({ up: 0, squash: 0.22, hipDrop: 0.3, pitch: 0.34, footLX: 0.32, footRX: -0.32, footLZ: 0, footRZ: 0, handLX: 0.34, handLY: -0.92, handLZ: 0.2, handRX: -0.34, handRY: -0.92, handRZ: 0.2, wristL: 0, wristR: 0 })],
      [0.48, stance({ up: 0, squash: 0.1, hipDrop: 0.26, pitch: 0.28, footLX: 0.32, footRX: -0.32, footLZ: 0, footRZ: 0, handLX: 0.34, handLY: -0.9, handLZ: 0.2, handRX: -0.34, handRY: -0.9, handRZ: 0.2, wristL: 0, wristR: 0 })],
      [0.75, STANCE],
    ],
  },
  flying: {
    lunge: true,
    frames: [
      [0.0, stance({ hipDrop: 0.22, squash: 0.1, pitch: 0.2, handLX: 0.3, handLY: -0.6, handLZ: -0.2, handRX: -0.3, handRY: -0.6, handRZ: -0.2, wristL: 0, wristR: 0 })],
      [0.2, stance({ forward: 0.4, up: 1.5, squash: -0.1, hipDrop: 0, pitch: -0.14, footLY: 0.16, footRY: 0.2, footLZ: -0.1, footRZ: -0.2, handLX: 0.1, handLY: 0.88, handLZ: 0.3, handRX: -0.1, handRY: 0.88, handRZ: 0.3, wristL: -0.5, wristR: -0.5 })],
      [0.4, stance({ forward: 0.85, up: 1.2, squash: -0.05, pitch: 0.5, footLY: 0.2, footRY: 0.2, footLZ: -0.25, footRZ: -0.25, handLX: -0.05, handLY: 0.2, handLZ: 1, handRX: 0.05, handRY: 0.2, handRZ: 1, wristL: -1.45, wristR: -1.45 })],
      [0.5, stance({ forward: 1, up: 0.34, pitch: 0.6, footLY: 0.1, footRY: 0.1, handLX: -0.05, handLY: -0.2, handLZ: 1, handRX: 0.05, handRY: -0.2, handRZ: 1, wristL: -1.45, wristR: -1.45 })],
      [0.68, stance({ forward: 0.72, up: 0, squash: 0.2, hipDrop: 0.26, pitch: 0.3 })],
      [1.05, STANCE],
    ],
  },
  starBurst: {
    frames: [
      [0.0, stance({ hipDrop: 0.2, squash: 0.1, footLX: 0.17, footRX: -0.17, footLZ: 0, footRZ: 0, handLX: 0.3, handLY: -0.8, handLZ: 0.1, handRX: -0.3, handRY: -0.8, handRZ: 0.1, wristL: 0, wristR: 0 })],
      [0.16, pose({ up: 0.52, squash: -0.1, hipDrop: 0.02, footLX: 0.5, footLY: 0.08, footRX: -0.5, footRY: 0.08, handLX: 0.78, handLY: 0.62, handLZ: 0.05, handRX: -0.78, handRY: 0.62, handRZ: 0.05, headPitch: -0.2 })],
      [0.42, pose({ up: 0.42, squash: -0.08, hipDrop: 0.02, footLX: 0.5, footLY: 0.1, footRX: -0.5, footRY: 0.1, handLX: 0.78, handLY: 0.62, handLZ: 0.05, handRX: -0.78, handRY: 0.62, handRZ: 0.05, headPitch: -0.2 })],
      [0.56, stance({ up: 0, squash: 0.16, hipDrop: 0.2 })],
      [0.85, STANCE],
    ],
  },
  turbo: {
    lunge: true,
    frames: [
      [0.0, stance({ pitch: 0.42, hipDrop: 0.12, footRY: 0.28, footRZ: 0.28, handRZ: 0.2, handRY: -0.4, handLZ: 0.86 })],
      [0.1, stance({ forward: 0.34, pitch: 0.46, hipDrop: 0.1, footRZ: -0.3, footLY: 0.3, footLZ: 0.32, handRZ: 0.86, handLZ: 0.2, handLY: -0.4 })],
      [0.2, stance({ forward: 0.68, pitch: 0.46, hipDrop: 0.1, footLZ: -0.3, footRY: 0.3, footRZ: 0.32, handLZ: 0.86, handRZ: 0.2, handRY: -0.4 })],
      [0.3, stance({ forward: 1, pitch: 0.24, hipDrop: 0.06, footRY: 0.4, footRZ: 0.46, handLX: -0.1, handLY: 0, handLZ: 1, handRX: 0.1, handRY: 0, handRZ: 1, wristL: -1.5, wristR: -1.5 })],
      [0.5, stance({ forward: 1, pitch: 0.2, hipDrop: 0.06, handLX: -0.1, handLY: 0, handLZ: 1, handRX: 0.1, handRY: 0, handRZ: 1, wristL: -1.5, wristR: -1.5 })],
      [0.85, STANCE],
    ],
  },
  sweep: {
    lunge: true,
    frames: [
      [0.0, stance({ hipDrop: 0.26, pitch: 0.7, handLX: 0.1, handLY: -0.95, handLZ: 0.4, handRX: -0.1, handRY: -0.95, handRZ: 0.4, wristL: 0, wristR: 0 })],
      [0.16, stance({ forward: 0.5, hipDrop: 0.32, twist: -0.5, pitch: 0.42, footLX: 0.3, footLZ: 0.05, footRX: -0.55, footRY: 0.04, footRZ: 0.3, handLX: 0.5, handLY: -0.8, handLZ: 0.2, handRX: -0.5, handRY: -0.6, handRZ: -0.3, wristL: 0, wristR: 0 })],
      [0.3, stance({ forward: 1, hipDrop: 0.34, twist: 0.5, pitch: 0.4, footLX: 0.3, footLZ: 0.05, footRX: 0.3, footRY: 0.05, footRZ: 0.8, handLX: 0.6, handLY: -0.6, handLZ: -0.2, handRX: -0.5, handRY: -0.7, handRZ: 0.1, wristL: 0, wristR: 0 })],
      [0.46, stance({ forward: 1, hipDrop: 0.32, twist: 0.42, pitch: 0.38, footLX: 0.3, footRX: 0.2, footRY: 0.05, footRZ: 0.76 })],
      [0.8, STANCE],
    ],
  },
  skyCharge: {
    frames: [
      [0.0, stance({ hipDrop: 0.1, pitch: 0.06, handLX: 0.3, handLY: -0.3, handLZ: 0.3, handRX: -0.3, handRY: -0.3, handRZ: 0.3 })],
      [0.28, pose({ up: 0.16, squash: -0.08, hipDrop: 0, headPitch: -0.45, handLX: 0.2, handLY: 0.98, handLZ: 0.05, handRX: -0.2, handRY: 0.98, handRZ: 0.05, wristL: 0.3, wristR: 0.3, footLX: 0.2, footRX: -0.2 })],
      [0.6, pose({ up: 0.14, squash: -0.07, hipDrop: 0, headPitch: -0.45, handLX: 0.2, handLY: 0.98, handLZ: 0.05, handRX: -0.2, handRY: 0.98, handRZ: 0.05, wristL: 0.3, wristR: 0.3, footLX: 0.2, footRX: -0.2 })],
      [0.95, STANCE],
    ],
  },
  // A two-handed throw from over the head, for the soft ball, either way.
  throw: {
    frames: [
      [0.0, stance({ hipDrop: 0.08, pitch: -0.12, handLX: 0.22, handLY: 0.95, handLZ: -0.05, handRX: -0.22, handRY: 0.95, handRZ: -0.05, wristL: 0.2, wristR: 0.2 })],
      [0.22, stance({ hipDrop: 0.1, pitch: -0.2, handLX: 0.2, handLY: 1, handLZ: -0.2, handRX: -0.2, handRY: 1, handRZ: -0.2, wristL: 0.3, wristR: 0.3 })],
      [0.4, stance({ pitch: 0.3, handLX: 0.18, handLY: 0.3, handLZ: 0.95, handRX: -0.18, handRY: 0.3, handRZ: 0.95, wristL: -1.2, wristR: -1.2, footRZ: -0.3 })],
      [0.55, stance({ pitch: 0.26, handLX: 0.18, handLY: 0.2, handLZ: 0.95, handRX: -0.18, handRY: 0.2, handRZ: 0.95, wristL: -1.3, wristR: -1.3, footRZ: -0.3 })],
      [0.85, STANCE],
    ],
  },
  hit: {
    frames: [
      [0.0, stance({ forward: -0.1, pitch: -0.38, twist: -0.3, headPitch: -0.3, handLX: 0.4, handLY: -0.2, handLZ: 0.5, handRX: -0.4, handRY: -0.1, handRZ: 0.5 })],
      [0.1, stance({ forward: -0.26, pitch: -0.42, twist: -0.34, headPitch: -0.32, squash: -0.05, handLX: 0.5, handLY: -0.1, handLZ: 0.4, handRX: -0.5, handRY: 0, handRZ: 0.4 })],
      [0.42, STANCE],
    ],
  },
  bighit: {
    frames: [
      [0.0, stance({ forward: -0.3, up: 0.1, pitch: -0.55, headPitch: -0.35, handLX: 0.7, handLY: 0.2, handLZ: 0.3, handRX: -0.7, handRY: 0.2, handRZ: 0.3, footLY: 0.1, footRY: 0.1 })],
      [0.2, stance({ forward: -0.72, up: 0.36, pitch: -0.65, headPitch: -0.4, handLX: 0.8, handLY: 0.36, handLZ: 0.2, handRX: -0.8, handRY: 0.36, handRZ: 0.2, footLY: 0.2, footRY: 0.2, footLZ: 0.2, footRZ: 0.2 })],
      [0.42, stance({ forward: -0.9, up: 0, squash: 0.14, hipDrop: 0.2, pitch: -0.1 })],
      [0.8, STANCE],
    ],
  },
  block: {
    frames: [
      [0.0, stance({ forward: -0.06, hipDrop: 0.14, pitch: 0.2, handLX: -0.26, handLY: 0.02, handLZ: 0.6, handRX: 0.26, handRY: 0.08, handRZ: 0.62 })],
      [0.2, stance({ forward: -0.12, hipDrop: 0.14, pitch: 0.2, handLX: -0.26, handLY: 0.02, handLZ: 0.6, handRX: 0.26, handRY: 0.08, handRZ: 0.62 })],
      [0.4, STANCE],
    ],
  },
};

function build(source, mirrored) {
  const frames = source.frames.map(([t, frame]) => ({ t, pose: mirrored ? mirrorPose(frame) : frame }));
  return { lunge: source.lunge ?? false, frames, duration: frames.at(-1).t };
}

export const CLIPS = Object.fromEntries(
  Object.entries(CLIP_SOURCES).map(([name, source]) => [name, { right: build(source, false), left: build(source, true) }]),
);
// The computer's high swing is its big arm swing, and both ways of throwing the ball are the throw.
CLIPS.highSwing = CLIPS.whirlwind;
CLIPS.ball = CLIPS.throw;
CLIPS.ballReturn = CLIPS.throw;

/** Poses held for as long as something lasts, rather than played through once. */
export const HELD = {
  guard: stance({ hipDrop: 0.13, pitch: 0.18, handLX: -0.3, handLY: 0.02, handLZ: 0.56, handRX: 0.3, handRY: 0.1, handRZ: 0.58, wristL: -1.4, wristR: -1.4 }),
  lookOut: stance({ hipDrop: 0.15, twist: -0.42, pitch: -0.05, handLX: 0.2, handLY: -0.1, handLZ: 0.5, handRX: -0.46, handRY: 0.02, handRZ: -0.2, wristR: -0.5, footRZ: -0.3 }),
  dizzy: pose({ hipDrop: 0.44, pitch: -0.2, roll: 0.1, footLX: 0.34, footLZ: 0.42, footLPitch: -1, footRX: -0.34, footRZ: 0.42, footRPitch: -1, handLX: 0.55, handLY: -0.85, handLZ: 0.1, handRX: -0.55, handRY: -0.85, handRZ: 0.1 }),
  win: pose({ headPitch: -0.2, handLX: 0.36, handLY: 0.92, handLZ: 0.1, handRX: -0.36, handRY: 0.92, handRZ: 0.1, footLX: 0.22, footRX: -0.22 }),
  wave: stance({ pitch: 0, hipDrop: 0.02, handRX: -0.46, handRY: 0.84, handRZ: 0.2, wristR: 0.12 }),
  // Down low under a high swing, with the hands over the head.
  duck: stance({ hipDrop: 0.34, squash: 0.14, pitch: 0.36, handLX: 0.3, handLY: 0.25, handLZ: 0.35, handRX: -0.3, handRY: 0.25, handRZ: 0.35, wristL: -0.4, wristR: -0.4, footLX: 0.32, footRX: -0.32, footLZ: 0, footRZ: 0 }),
  // Holding the soft ball up, ready to throw it.
  ballUp: stance({ hipDrop: 0.08, pitch: -0.12, handLX: 0.22, handLY: 0.95, handLZ: -0.05, handRX: -0.22, handRY: 0.95, handRZ: -0.05, wristL: 0.2, wristR: 0.2 }),
};
