// Every move in the game, and the exercises that earn them. The words here are what the voice
// says, so each has a rendered file: see audio/voice/lines.json.
//
// Each level, from 1 to 10, is a little harder than the one before: see fightLevel at the end.
import { ramp, stepsAt } from '../../core/levels.js';

// There are two sizes of move. Whatever fighting moves the child makes by themselves are small
// hits, which feel good but can't win. The moves the coach asks for are what win a round.

// hitAt is how long after starting the move connects. A child's move has to feel immediate, so
// strikes land almost at once. The bigger moves take longer because they're a show.
export const MOVES = {
  palm: { name: 'Palm Strike', damage: 9, hitAt: 0.1, kind: 'arm' },
  whirlwind: { name: 'Whirlwind', damage: 13, hitAt: 0.3, kind: 'arm' },
  kick: { name: 'Power Kick', damage: 11, hitAt: 0.14, kind: 'leg' },
  knee: { name: 'Knee Strike', damage: 10, hitAt: 0.12, kind: 'leg' },
  thunderClap: { name: 'Thunder Clap', damage: 13, hitAt: 0.14, kind: 'body' },
  stomp: { name: 'Earthquake Stomp', damage: 14, hitAt: 0.32, kind: 'body' },
  flying: { name: 'Flying Smash', damage: 15, hitAt: 0.5, kind: 'body' },
  starBurst: { name: 'Star Burst', damage: 17, hitAt: 0.34, kind: 'body' },
  turbo: { name: 'Turbo Rush', damage: 14, hitAt: 0.3, kind: 'body' },
  sweep: { name: 'Ground Sweep', damage: 12, hitAt: 0.3, kind: 'body' },
  skyCharge: { name: 'Sky Charge', damage: 0, hitAt: 0.4, kind: 'body' },
  // The child's fighter only does these as small hits, from what the child does by themselves.
  punch: { damage: 7, hitAt: 0.1, kind: 'arm' },
  uppercut: { damage: 11, hitAt: 0.14, kind: 'arm' },
  chop: { damage: 10, hitAt: 0.12, kind: 'arm' },
};

// What the body reader sees, and the small hit it makes when it isn't what the coach asked for.
export const SMALL_HITS = { palm: 'palm', doublePush: 'palm', punch: 'punch', uppercut: 'uppercut', chop: 'chop', kick: 'kick', knee: 'knee' };

// What the coach asks for, in the order it asks. reads is what the body reader has to see for it
// to count, and nothing else will do. sided ones are done with one arm or leg, so they have words
// for each. demo is the film of it in core/body/demos.js. ease says what can come down for a child
// who's trying: see core/body/easing.js. needsJump marks the ones a grown-up can turn off, for a
// child whose balance makes jumping unsafe.
export const EXERCISES = {
  clap: {
    move: 'thunderClap',
    reads: ['clap'],
    demo: 'clap',
    label: 'Claps',
    ask: 'Clap your hands!',
    seen: ['You clapped!', 'ტაში დაუკარი!'],
  },
  squat: {
    move: 'stomp',
    reads: ['stomp'],
    demo: 'squat',
    ease: 'squat',
    label: 'Squats',
    ask: 'Squat down!',
    seen: ['You squatted!', 'შენ ჩაცუცქდი!'],
  },
  jump: {
    move: 'flying',
    reads: ['flying', 'starBurst'],
    demo: 'jump',
    ease: 'jump',
    needsJump: true,
    label: 'Jumps',
    ask: 'Jump!',
    seen: ['You jumped!', 'შენ ახტი!'],
  },
  handCircle: {
    move: 'whirlwind',
    reads: ['circle'],
    demo: 'handCircle',
    sided: true,
    label: 'Hand circles',
    ask: { left: 'Rotate your left hand in a big circle!', right: 'Rotate your right hand in a big circle!' },
    seen: ['You made a circle!', 'წრე დახაზე!'],
  },
  kneeLift: {
    move: 'knee',
    reads: ['knee', 'kick'],
    demo: 'kneeLift',
    ease: 'lift',
    sided: true,
    label: 'Knee lifts',
    ask: { left: 'Lift your left knee!', right: 'Lift your right knee!' },
    seen: ['You lifted your knee!', 'მუხლი ასწიე!'],
  },
  push: {
    move: 'palm',
    reads: ['palm', 'doublePush'],
    demo: 'push',
    sided: true,
    label: 'Open-hand pushes',
    ask: { left: 'Push your open left hand forward!', right: 'Push your open right hand forward!' },
    seen: ['You pushed!', 'ხელი წინ გასწიე!'],
  },
  skyReach: {
    move: 'skyCharge',
    reads: ['skyCharge'],
    demo: 'skyReach',
    label: 'Sky reaches',
    ask: 'Reach for the sky!',
    seen: ['You reached up high!', 'ცას მისწვდი!'],
  },
  starJump: {
    move: 'starBurst',
    reads: ['starBurst'],
    demo: 'starJump',
    needsJump: true,
    label: 'Star jumps',
    ask: 'Star jump!',
    seen: ['What a star jump!', 'რა ვარსკვლავია!'],
  },
  kick: {
    move: 'kick',
    reads: ['kick', 'knee'],
    demo: 'kick',
    ease: 'lift',
    sided: true,
    label: 'Kicks',
    ask: { left: 'Kick with your left leg!', right: 'Kick with your right leg!' },
    seen: ['You kicked!', 'დაარტყი!'],
  },
  toeTouch: {
    move: 'sweep',
    reads: ['sweep'],
    demo: 'toeTouch',
    label: 'Toe touches',
    ask: 'Touch your toes!',
    seen: ['You touched your toes!', 'თითებს შეეხე!'],
  },
  highKnees: {
    move: 'turbo',
    reads: ['turbo'],
    demo: 'highKnees',
    label: 'High knees',
    ask: 'High knees!',
    seen: ['Super knees!', 'სუპერ მუხლები!'],
  },
};

export const ORDER = Object.keys(EXERCISES);

// How to get out of the way when it's the computer's turn.
export const DEFENCES = {
  block: { demo: 'block', ask: 'Hands up! Block!', seen: ['You blocked!', 'დაიცავი თავი!'] },
  lean: { demo: 'lean', ask: 'Lean to the side!', seen: ['You leaned!', 'გადაიხარე!'] },
};

// Doing these one after the other, in time, adds to the last. The coach asks for them in this
// order, so they come as a reward for keeping going.
export const COMBOS = [
  { name: 'Rocket Leap', steps: ['squat', 'jump'], times: 1.6 },
  { name: 'Power Stars', steps: ['skyReach', 'starJump'], times: 1.6 },
];
export const COMBO_SECONDS = 15;

export const RULES = {
  // About ten moves to a round, which is real exercise without going on too long.
  maxHp: 100,
  // A small hit does this much, and small hits can only ever take this much in a round, so
  // winning takes the moves the coach asks for. There's a rest between them, so waving arms about
  // isn't quicker than doing as the coach says.
  smallHit: 2,
  smallHitsMost: 25,
  smallHitEvery: 0.7,
  // How much more a push does with the hand seen open.
  openHand: 1.4,
  // Moves on the side being worked on do a bit more, so it's the side worth using.
  focusSide: 1.2,
  // After Sky Charge, the next move does this much more.
  charged: 1.5,
  // A move asked for twice, on the higher levels, does this much more, so a round isn't longer for it.
  twice: 1.7,
  // Power fills with each move, and when it's full the next move is the fighter's own.
  powerPerHit: 5,
  powerPerExercise: 12,
  signature: 2,
  // Rounds stop for this long, so nobody plays hard for too long without a breath.
  breakSeconds: 5,
  // A child who hasn't moved for this long is resting, and everything waits.
  restAfter: 7,
  // The coach, in seconds.
  firstCallAfter: 0.4,
  afterMove: 0.7, // Time to see the move land, before the next thing.
  askAgainEvery: 10,
  nudgeEvery: 6, // How often it says so, when the child is doing something else.
  giveUpAfter: 14, // Seconds of moving without doing it, before trying something else.
  swingAfterDefence: 0.35,
  stillForWarning: 0.8, // Still for this share of a warning counts as resting through it.
  afterSwing: 0.6,
};

// How often the computer has a turn while the child is moving, how much warning it gives, and how
// hard it hits. It's much stronger than a small hit, so doing as the coach says is the way to win.
export const NPC_LEVELS = {
  gentle: { name: 'Gentle', every: 10, warning: 4, damage: 1.2, mercy: 20, defences: ['block'], moves: ['palm', 'kick'] },
  medium: { name: 'Medium', every: 8, warning: 3, damage: 1.8, mercy: 0, defences: ['block', 'lean'], moves: ['palm', 'kick', 'uppercut', 'knee'] },
  tough: { name: 'Tough', every: 7, warning: 2.5, damage: 2.4, mercy: 0, defences: ['block', 'lean'], moves: ['palm', 'kick', 'uppercut', 'knee', 'chop', 'stomp', 'flying'] },
};

// Moves that can be asked for twice on the higher levels. Not jumps, which are tiring and need balance,
// nor high knees, which are three lifts already, nor reaching up, which is held.
export const CAN_BE_TWICE = new Set(['clap', 'squat', 'handCircle', 'kneeLift', 'push', 'kick', 'toeTouch']);

/**
 * What a level changes, on top of the computer's strength a grown-up chose, which stays theirs: how
 * hard it hits, and whether it can knock a child out. Level 1 is the game as it always was. A child
 * standing still is still never hit, and nothing waits on how quickly a move is made.
 */
export function fightLevel(level = 1) {
  return {
    // The computer takes its turn more often: by level 10, every 80% of the time it did.
    turnEvery: ramp(level, 1, 0.8),
    // Its warning gets a little shorter, to 80% of the strength's by level 10.
    warning: ramp(level, 1, 0.8),
    // A shorter pause after a big move before the next thing is asked for.
    afterMove: ramp(level, RULES.afterMove, 0.45),
    // From level 3, leaning out of the way joins blocking, on every strength.
    defences: stepsAt(level, { 1: [], 3: ['lean'] }),
    // The computer's moves to get out of the way of, more of them from levels 4 and 7.
    npcMoves: stepsAt(level, { 1: [], 4: ['uppercut', 'knee'], 7: ['uppercut', 'knee', 'chop', 'stomp', 'flying'] }),
    // From level 5 some of its turns are two hits, one after the other: one to block and one to lean
    // from. Each has its whole warning.
    doubles: stepsAt(level, { 1: 0, 5: 0.2, 8: 0.35 }),
    // From level 6 the coach's moves come in a mixed-up order each time round, rather than always the
    // same one, with the two parts of a combo still together.
    mixed: stepsAt(level, { 1: false, 6: true }),
    // From level 7 some moves have to be done twice before the fighter makes its big move.
    twice: stepsAt(level, { 1: 0, 7: 0.2, 9: 0.3 }),
  };
}
