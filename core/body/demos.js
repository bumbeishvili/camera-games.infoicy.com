// Little films of each move, so a child can see what they're being asked to do. A character plays
// one over and over, facing the child, as if in a mirror. Each is written for an arm or leg on the
// right of the screen, which is the character's left, because that's where the child's own right
// hand is in the mirror. They're mirrored for the other side.
//
// Each has its frames as [seconds, pose]. turn is how far the character stands side on, so that a
// move towards the child can be seen, shift moves it across to make room for that, and room is how
// much space to leave above it for a jump.
import { makePose, mirrorPose } from './characters.js';

const REST = makePose();
const pose = (changes) => ({ ...REST, ...changes });

const squatDown = pose({ hipDrop: 0.36, pitch: 0.34, footLX: 0.24, footRX: -0.24, handLX: -0.02, handLY: -0.2, handLZ: 0.95, handRX: 0.02, handRY: -0.2, handRZ: 0.95 });

const jumpCrouch = pose({ hipDrop: 0.24, pitch: 0.3, handLX: 0.36, handLY: -0.62, handLZ: -0.32, handRX: -0.36, handRY: -0.62, handRZ: -0.32 });
const jumpAir = pose({ up: 0.72, pitch: -0.04, headPitch: -0.15, footLY: 0.1, footRY: 0.1, handLX: 0.34, handLY: 0.72, handLZ: 0.3, handRX: -0.34, handRY: 0.72, handRZ: 0.3 });
const jumpLand = pose({ hipDrop: 0.2, squash: 0.05, pitch: 0.2, handLX: 0.4, handLY: -0.5, handLZ: 0.35, handRX: -0.4, handRY: -0.5, handRZ: 0.35 });

const starCrouch = pose({ hipDrop: 0.18, pitch: 0.12, handLX: 0.3, handLY: -0.85, handLZ: 0.1, handRX: -0.3, handRY: -0.85, handRZ: 0.1 });
const starAir = pose({ up: 0.45, headPitch: -0.12, footLX: 0.52, footLY: 0.06, footRX: -0.52, footRY: 0.06, handLX: 0.76, handLY: 0.64, handLZ: 0.05, handRX: -0.76, handRY: 0.64, handRZ: 0.05 });
const starLand = pose({ hipDrop: 0.18, squash: 0.04 });

const clapOpen = pose({ handLX: 0.72, handLY: -0.18, handLZ: 0.55, wristL: -0.7, handRX: -0.72, handRY: -0.18, handRZ: 0.55, wristR: -0.7 });
const clapShut = pose({ handLX: -0.48, handLY: -0.12, handLZ: 0.78, wristL: -0.35, handRX: 0.48, handRY: -0.12, handRZ: 0.78, wristR: -0.35 });

// The hand going round, starting from the bottom and coming up on the outside.
const CIRCLE = { x: 0.1, y: 0, z: 0.25, radius: 0.78 };
const CIRCLE_SECONDS = 2.8;
const CIRCLE_STEPS = 20;
const circleFrames = Array.from({ length: CIRCLE_STEPS + 1 }, (_, index) => {
  const angle = (index / CIRCLE_STEPS) * Math.PI * 2;
  return [(index / CIRCLE_STEPS) * CIRCLE_SECONDS, pose({
    handLX: CIRCLE.x + Math.sin(angle) * CIRCLE.radius,
    handLY: CIRCLE.y - Math.cos(angle) * CIRCLE.radius,
    handLZ: CIRCLE.z,
    wristL: -0.4,
  })];
});

const kneeUp = pose({ footLX: 0.12, footLY: 0.44, footLZ: 0.34, footRX: -0.12, pitch: 0.05, roll: -0.03, handLX: 0.52, handLY: -0.52, handLZ: 0.22, handRX: -0.52, handRY: -0.52, handRZ: 0.22 });

const kickReady = pose({ footLX: 0.14, footLY: 0.3, footLZ: 0.25, footRX: -0.12, handLX: 0.55, handLY: -0.45, handLZ: 0.15, handRX: -0.55, handRY: -0.45, handRZ: 0.15 });
const kickOut = pose({ footLX: 0.14, footLY: 0.5, footLZ: 0.85, footRX: -0.12, footLPitch: -0.9, pitch: -0.22, hipDrop: 0.03, handLX: 0.6, handLY: -0.35, handLZ: 0.1, handRX: -0.6, handRY: -0.35, handRZ: 0.1 });

const pushBack = pose({ twist: 0.12, handLX: 0.02, handLY: -0.25, handLZ: 0.32, wristL: -1.2 });
const pushOut = pose({ twist: -0.22, pitch: 0.1, handLX: -0.08, handLY: -0.06, handLZ: 0.99, wristL: -1.5 });

const raised = pose({ handLX: 0.22, handLY: 0.96, handLZ: 0.1, wristL: 0.2 });

const skyHigh = pose({ up: 0.1, squash: -0.05, headPitch: -0.42, handLX: 0.2, handLY: 0.97, handLZ: 0.06, wristL: 0.25, handRX: -0.2, handRY: 0.97, handRZ: 0.06, wristR: 0.25 });

const toesDown = pose({ pitch: 1.15, hipDrop: 0.04, hipZ: -0.1, headPitch: 0.2, handLX: -0.18, handLY: -0.25, handLZ: 0.96, handRX: 0.18, handRY: -0.25, handRZ: 0.96 });

const leftKnee = pose({ footLX: 0.12, footLY: 0.42, footLZ: 0.32, footRX: -0.12, handLX: 0.42, handLY: -0.55, handLZ: -0.05, handRX: -0.42, handRY: -0.3, handRZ: 0.5 });
const rightKnee = mirrorPose(leftKnee);

// Arms out like wings, with a little sway, as a plane's wings have.
const wingsLevel = pose({ handLX: 0.96, handLY: 0.02, handLZ: 0.08, handRX: -0.96, handRY: 0.02, handRZ: 0.08 });
const wingsTipped = pose({ roll: 0.18, handLX: 0.84, handLY: -0.46, handLZ: 0.08, handRX: -0.84, handRY: 0.46, handRZ: 0.08 });
const wingsHigh = pose({ headPitch: -0.2, handLX: 0.72, handLY: 0.66, handLZ: 0.08, handRX: -0.72, handRY: 0.66, handRZ: 0.08 });
const wingsLow = pose({ headPitch: 0.16, handLX: 0.76, handLY: -0.6, handLZ: 0.08, handRX: -0.76, handRY: -0.6, handRZ: 0.08 });

// A hand held out to the side, closing and opening, close enough to see.
const handShut = pose({ handLX: 0.9, handLY: 0.3, handLZ: 0.25, wristL: 0, openL: 0 });
const handOpen = pose({ handLX: 0.9, handLY: 0.3, handLZ: 0.25, wristL: 0, openL: 1 });

const guardUp = pose({ hipDrop: 0.1, pitch: 0.12, handLX: -0.3, handLY: 0.12, handLZ: 0.6, wristL: -1.35, handRX: 0.3, handRY: 0.12, handRZ: 0.6, wristR: -1.35 });

// Standing looking up at something high, and asking for it. His neck makes this very clear.
const looksUp = pose({ headPitch: -0.3, handLX: 0.3, handLY: -0.6, handLZ: 0.3, handRX: -0.3, handRY: -0.6, handRZ: 0.3 });
const looksUpHigher = pose({ up: 0.03, headPitch: -0.38, handLX: 0.34, handLY: -0.42, handLZ: 0.4, handRX: -0.34, handRY: -0.42, handRZ: 0.4 });
const bites = pose({ headPitch: 0.3, pitch: 0.1, handLX: 0.34, handLY: -0.45, handLZ: 0.4, handRX: -0.34, handRY: -0.45, handRZ: 0.4 });

// A step across to the character's left, which is the right of the screen, and back again.
const reachOut = pose({ footLX: REST.footLX + 0.3, roll: -0.05, handLX: 0.56, handLY: -0.62, handRX: -0.36 });
const steppedAcross = pose({ side: 0.38, roll: 0.02, handLX: 0.5, handLY: -0.7, handRX: -0.4 });
const reachBack = pose({ side: 0.38, footRX: REST.footRX - 0.3, roll: 0.05, handRX: -0.56, handRY: -0.62, handLX: 0.36 });

const stepA = pose({ up: 0.03, footLZ: 0.36, footRZ: -0.3, footRY: 0.1, handLX: 0.36, handLY: -0.72, handLZ: -0.28, handRX: -0.36, handRY: -0.72, handRZ: 0.28 });
const stepB = mirrorPose(stepA);

export const DEMOS = {
  squat: {
    turn: 0.4,
    frames: [[0, REST], [0.3, REST], [1, squatDown], [1.5, squatDown], [2.2, REST], [2.6, REST]],
  },
  jump: {
    room: 0.72,
    frames: [[0, REST], [0.35, REST], [0.75, jumpCrouch], [1, jumpAir], [1.3, { ...jumpAir, up: 0.68 }], [1.55, jumpLand], [1.95, REST], [2.4, REST]],
  },
  starJump: {
    room: 0.45,
    frames: [[0, REST], [0.3, REST], [0.6, starCrouch], [0.85, starAir], [1.2, starAir], [1.5, starLand], [1.85, REST], [2.2, REST]],
  },
  clap: {
    sparkAt: [0.8, 1.75],
    frames: [[0, clapOpen], [0.45, clapOpen], [0.8, clapShut], [1, clapShut], [1.4, clapOpen], [1.75, clapShut], [1.95, clapShut], [2.35, clapOpen], [2.7, clapOpen]],
  },
  handCircle: {
    ring: CIRCLE,
    linear: true,
    frames: circleFrames,
  },
  kneeLift: {
    turn: 0.5,
    frames: [[0, REST], [0.35, REST], [0.85, kneeUp], [1.35, kneeUp], [1.85, REST], [2.2, REST]],
  },
  kick: {
    turn: 0.85,
    shift: -0.25,
    frames: [[0, REST], [0.35, REST], [0.75, kickReady], [1, kickOut], [1.4, kickOut], [1.8, REST], [2.2, REST]],
  },
  push: {
    turn: 1,
    shift: -0.25,
    frames: [[0, REST], [0.3, pushBack], [0.6, pushBack], [1.05, pushOut], [1.55, pushOut], [2, pushBack], [2.3, REST], [2.6, REST]],
  },
  raise: {
    frames: [[0, REST], [0.35, REST], [1, raised], [1.3, { ...raised, handLX: 0.32 }], [1.6, { ...raised, handLX: 0.12 }], [1.9, raised], [2.5, REST], [2.8, REST]],
  },
  skyReach: {
    room: 0.1,
    frames: [[0, REST], [0.35, REST], [1.05, skyHigh], [1.7, skyHigh], [2.4, REST], [2.7, REST]],
  },
  toeTouch: {
    turn: 0.9,
    shift: -0.6,
    frames: [[0, REST], [0.35, REST], [1.1, toesDown], [1.7, toesDown], [2.45, REST], [2.8, REST]],
  },
  highKnees: {
    turn: 0.4,
    frames: [[0, leftKnee], [0.45, rightKnee], [0.9, leftKnee]],
  },
  wings: {
    frames: [[0, REST], [0.5, wingsLevel], [1.1, { ...wingsLevel, handLY: 0.1, handRY: -0.06 }], [1.7, { ...wingsLevel, handLY: -0.06, handRY: 0.1 }], [2.3, wingsLevel], [3, REST], [3.3, REST]],
  },
  tip: {
    frames: [[0, wingsLevel], [0.5, wingsLevel], [1.2, wingsTipped], [1.9, wingsTipped], [2.6, wingsLevel]],
  },
  climb: {
    frames: [[0, wingsLevel], [0.5, wingsLevel], [1.2, wingsHigh], [1.9, wingsHigh], [2.6, wingsLevel]],
  },
  dive: {
    frames: [[0, wingsLevel], [0.5, wingsLevel], [1.2, wingsLow], [1.9, wingsLow], [2.6, wingsLevel]],
  },
  openHand: {
    close: true,
    frames: [[0, handShut], [0.5, handShut], [1, handOpen], [1.9, handOpen], [2.4, handShut]],
  },
  block: {
    frames: [[0, REST], [0.25, REST], [0.6, guardUp], [1.4, guardUp], [1.75, REST], [2, REST]],
  },
  giraffeWaits: {
    turn: 0.7,
    frames: [[0, looksUp], [0.8, looksUpHigher], [1.6, looksUp]],
  },
  munch: {
    turn: 0.7,
    frames: [[0, looksUp], [0.2, bites], [0.4, looksUp], [0.6, bites], [0.8, looksUp], [1, bites], [1.2, looksUp], [2, looksUp]],
  },
  walk: {
    turn: 0.95,
    frames: [[0, stepA], [0.42, stepB], [0.84, stepA]],
  },
  sideStep: {
    shift: -0.2,
    frames: [[0, REST], [0.35, REST], [0.7, reachOut], [1, steppedAcross], [1.7, steppedAcross], [2.05, reachBack], [2.35, REST], [2.8, REST]],
  },
  lean: {
    frames: [[0, REST], [0.6, pose({ roll: 0.42, hipX: -0.05 })], [1, pose({ roll: 0.42, hipX: -0.05 })], [1.5, REST], [2.1, pose({ roll: -0.42, hipX: 0.05 })], [2.5, pose({ roll: -0.42, hipX: 0.05 })], [3, REST], [3.2, REST]],
  },
};
