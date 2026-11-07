// The story and rules of Robot Rescue. Robots have caught the friends from the other games and locked
// them up all over town. The child rides a little tram from place to place. An open hand fires at
// whatever is in the crosshair, and a closed hand raises a shield and reloads. Clearing the robots
// from a place frees the friend who's locked up there. There's no screen in this file, so it runs in
// the unit tests.
//
// Everything is in metres: x to the right of the tram, z straight ahead of it and y up, all measured
// from where the tram stops at that place.

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const mix = (from, to, share) => from + (to - from) * share;

// How fast things happen. walk is in metres a second, and atOnce is how many robots are out together.
export const PACES = {
  slow: { walk: 1.0, atOnce: 5, moveSeconds: 3, shuffleEvery: 7, peekSeconds: 4.2 },
  medium: { walk: 1.4, atOnce: 6, moveSeconds: 2.5, shuffleEvery: 5, peekSeconds: 3.4 },
  fast: { walk: 1.9, atOnce: 7, moveSeconds: 2, shuffleEvery: 3.6, peekSeconds: 2.8 },
};

// How hard the goo comes. On Gentle a child can't lose, as hearts stop at one.
export const LEVELS = {
  gentle: { hearts: 3, canLose: false, throwEvery: 4.6, gooSeconds: 3.3, gooInAir: 1, firstThrow: 5, bigSpots: 3 },
  medium: { hearts: 5, canLose: true, throwEvery: 3.4, gooSeconds: 2.8, gooInAir: 2, firstThrow: 3.5, bigSpots: 4 },
  tough: { hearts: 3, canLose: true, throwEvery: 2.5, gooSeconds: 2.3, gooInAir: 3, firstThrow: 2.5, bigSpots: 5 },
};

// How much the crosshair helps, as a share of the screen's height and of the way to the target.
// Even the least of these is generous, as precision isn't what this game is about.
export const AIM_HELP = {
  none: { radius: 0.17, pull: 0.75 },
  little: { radius: 0.3, pull: 0.92 },
  lots: { radius: 0.46, pull: 1 },
};

// How many hits each can take. The big one is different: it only takes hits in its weak spots.
export const ROBOT_KINDS = {
  walker: { hp: 5 },
  drone: { hp: 3 },
  peeker: { hp: 3 },
  big: { hp: 0 },
};

// The weak spots of the big one, in the order they open, in metres from its feet.
export const BIG_SPOTS = [
  { id: 'chest', at: [0, 5.1, 1.75], hp: 12 },
  { id: 'shoulder-left', at: [-3.75, 6.35, 1.16], hp: 12 },
  { id: 'shoulder-right', at: [3.75, 6.35, 1.16], hp: 12 },
  { id: 'belly', at: [0, 3.25, 1.7], hp: 14 },
  { id: 'knee', at: [1.7, 1.5, 0.84], hp: 14 },
];

/*
 * Each place on the way, in order. Robots come out of the doors and walk to the posts. Peekers pop
 * up from behind the covers, and drones hover around the air spots. Joze comes last, because that's
 * where the story ends, and the short rescue still has him in it.
 */
export const PLACES = [
  {
    id: 'market',
    who: 'truffle',
    thanks: 'Oink! You saved me!',
    robots: ['walker', 'walker', 'walker', 'peeker', 'walker', 'peeker', 'walker', 'drone', 'walker', 'peeker', 'walker', 'drone'],
    doors: [[-14, 13.3], [14, 12.7], [-13, 21], [13, 20], [-3, 28], [4, 28]],
    posts: [[-3.6, 9.4], [3.6, 9.8], [-1, 12.2], [2.2, 14], [-6.4, 13.6], [6.4, 14.4], [-2.6, 17]],
    covers: [[-5, 8.4, 'stall'], [5.2, 8.2, 'stall'], [-7.8, 12, 'stall'], [7.6, 11.6, 'stall']],
    air: [[-5, 4.1, 13], [5, 4.4, 14], [0, 4.8, 17]],
    cage: [8.6, 18],
  },
  {
    id: 'canal',
    who: 'kit',
    thanks: 'Free at last! Thank you!',
    robots: ['drone', 'walker', 'drone', 'walker', 'peeker', 'drone', 'walker', 'peeker', 'drone', 'walker', 'walker', 'peeker'],
    doors: [[-13, 7], [13, 7], [-1.5, 32], [1.5, 32], [-2.4, 28], [2.4, 28]],
    posts: [[-3.6, 8.4], [3.8, 8.8], [-1.6, 13.4], [1.8, 15.6], [-1, 19.2], [1.6, 22.2]],
    covers: [[-5.4, 7.6, 'crates'], [5.6, 7.4, 'crates'], [7, 14.6, 'boat'], [-2.9, 12.2, 'crates'], [2.9, 18.4, 'crates']],
    air: [[-6.5, 3.8, 13], [6, 4.2, 14], [-2, 4.8, 17], [3, 4.4, 19]],
    cage: [-7.8, 16.6],
  },
  {
    id: 'harbour',
    who: 'frost',
    thanks: 'Thank you! That was cool!',
    robots: ['peeker', 'walker', 'peeker', 'walker', 'drone', 'peeker', 'walker', 'peeker', 'drone', 'walker', 'peeker', 'walker'],
    doors: [[14, 8], [14, 21], [13, 14], [3, 30], [-1, 30]],
    posts: [[3.2, 9.2], [-1, 10], [5.6, 13], [1.2, 13.4], [-3.6, 14.2], [4.6, 16.6], [0, 18.4]],
    covers: [[-3.4, 8.4, 'barrels'], [4.8, 8.2, 'crates'], [-6, 12.4, 'barrels'], [6.6, 11.8, 'crates'], [-1.6, 11.4, 'crates'], [2.4, 15, 'barrels']],
    air: [[-6, 4, 13], [4, 4.6, 14], [-2, 4.8, 17], [6.5, 4.2, 17]],
    cage: [-7.4, 17],
  },
  {
    id: 'farm',
    who: 'mochi',
    thanks: 'Hop hop! Thank you!',
    robots: ['walker', 'walker', 'peeker', 'drone', 'walker', 'peeker', 'walker', 'drone', 'peeker', 'walker', 'walker', 'drone'],
    doors: [[-15, 11], [15, 10], [-14, 18], [14, 19], [-5, 26], [5, 26]],
    posts: [[-3.4, 9.6], [3.2, 9.8], [-1, 12.4], [1.6, 13.6], [-6, 15], [5.8, 15.4], [0, 17.4]],
    covers: [[-5, 8.4, 'hay'], [4.8, 8.6, 'hay'], [-7.2, 12.2, 'hay'], [7, 12.4, 'hay'], [-2, 15, 'hay']],
    air: [[-5, 4.2, 13], [6, 4.4, 14], [0, 5, 17], [-7, 4.6, 18]],
    cage: [9, 17.4],
  },
  {
    id: 'tower',
    who: 'joze',
    thanks: 'Hooray! We’re all free!',
    robots: ['big', 'peeker', 'peeker', 'walker', 'drone', 'peeker', 'walker', 'peeker', 'drone', 'walker', 'peeker', 'drone', 'walker'],
    doors: [[-14, 14], [14, 14], [-14, 22], [14, 22], [-9, 28], [9, 28]],
    posts: [[-3.6, 9.6], [3.6, 9.6], [-6.4, 13.8], [6.8, 13.4], [-4.6, 15], [8.6, 15.4]],
    covers: [[-4.8, 8.4, 'planters'], [4.8, 8.4, 'planters'], [-7.4, 11.6, 'planters'], [7.4, 11.6, 'planters']],
    air: [[-6.6, 4.4, 13], [6.6, 4.4, 13], [-4.8, 5, 15], [4.8, 5, 15]],
    big: [0, 20],
    cage: [-10.4, 16.4],
  },
];

const SHORT_RESCUE = ['market', 'harbour', 'tower'];

export const FIRE_RATE = 5.5; // Shots a second.
export const DRAIN_SECONDS = 3.6; // How long a full blaster lasts.
export const REFILL_SECONDS = 0.55; // How long a closed hand takes to fill an empty one.
export const FILLS_ITSELF_AFTER = 6; // So a child who can't close yet isn't stuck for good.
const FILLS_ITSELF_SECONDS = 3;
const WORTH_RELOADING = 0.9; // Fuller than this and a closed hand isn't really a reload.

export const REST_AFTER_SECONDS = 4; // A hand gone or closed for this long means someone's resting.
const THROW_AGAIN_AFTER_REST = 1.6;
const FIRST_STOP_HOLD_SECONDS = 14; // At the first stop, nothing's thrown until a robot has been dropped.

export const EYE_HEIGHT = 1.9; // How high the child's view is, riding on the tram.
const SHOT_SECONDS = 0.2;
const GOO_HP = 1;
const WINDUP_SECONDS = 0.75;
const FREE_SECONDS = 1.1; // From a friend being freed to the tram moving off.
const LONGEST_MOVE_SECONDS = 3;
const WIN_SECONDS = 3;
const LOST_SECONDS = 1.1;
const BETWEEN_ROBOTS_SECONDS = 0.35;
const BIG_NEXT_SPOT_SECONDS = 0.7;
const DRONE_ENTER_SECONDS = 1.4;
const PEEK_RISE_SECONDS = 0.32;
const PEEK_HIDDEN_SECONDS = 0.7;
const AHEAD_START = 0.6; // How far along their way the first robots already are.
export const GOO_STOPS_AT = 2.4; // Metres in front of the tram, where the shield is.
const GOO_FROM_EYE = 0.1; // How far below the eye it arrives.
const GOO_LOB = 1.5; // How high its arc goes above a straight line.

/** The hand in play, as this game needs it. Anything uncertain neither fires nor raises the shield. */
export function readHand(snapshot) {
  const hand = snapshot[snapshot.side];
  if (snapshot.handOpen) return 'open';
  if (hand.status === 'closed' && hand.reason === 'closed' && !snapshot.overlap) return 'closed';
  return hand.status === 'missing' ? 'none' : 'unsure';
}

/** The charge in the blaster. It drains while firing, and a closed hand fills it again. */
export class Blaster {
  /** reloading off means it never runs out, for a child who can't close their hand easily. */
  constructor({ reloading = true } = {}) {
    this.reloading = reloading;
    this.charge = 1;
    this.firing = false;
    this.cooldown = 0;
    this.emptyFor = 0;
    this.fillingItself = false;
    this.lowest = 1; // How low it has been since it was last full.
  }

  get empty() {
    return this.charge <= 0 && !this.fillingItself;
  }

  /**
   * One frame. aiming says something is in the crosshair. Returns what happened, as shots fired, and
   * whether it has just run out or just been filled.
   */
  update(dt, { hand, aiming }) {
    const result = { shots: 0, ranOut: false, filled: false };
    const before = this.charge;
    this.firing = hand === 'open' && aiming && this.charge > 0 && !this.fillingItself;
    if (this.firing) {
      if (this.reloading) this.charge = Math.max(0, this.charge - dt / DRAIN_SECONDS);
      this.cooldown -= dt;
      while (this.cooldown <= 0) {
        result.shots += 1;
        this.cooldown += 1 / FIRE_RATE;
      }
      if (this.charge === 0 && before > 0) result.ranOut = true;
    } else {
      this.cooldown = Math.max(0, this.cooldown - dt);
    }

    if (hand === 'closed') {
      this.emptyFor = 0;
      this.fillingItself = false;
      this.charge = Math.min(1, this.charge + dt / REFILL_SECONDS);
    } else if (this.fillingItself) {
      this.charge = Math.min(1, this.charge + dt / FILLS_ITSELF_SECONDS);
      if (this.charge === 1) this.fillingItself = false;
    } else if (this.charge === 0) {
      this.emptyFor += dt;
      if (this.emptyFor > FILLS_ITSELF_AFTER) {
        this.emptyFor = 0;
        this.fillingItself = true;
      }
    }

    // A closed hand that was nearly full anyway isn't worth making a noise about.
    this.lowest = Math.min(this.lowest, this.charge);
    if (this.charge === 1) {
      result.filled = this.lowest < WORTH_RELOADING;
      this.lowest = 1;
    }
    return result;
  }
}

/**
 * Takes the wobble out of a hand, and pulls the crosshair onto whatever is nearest. Targets are given
 * in pixels, as { ref, x, y, size }, and height is the screen's height in pixels.
 */
export class Aim {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.steadyX = 0;
    this.steadyY = 0;
    this.seen = false;
    this.target = null; // What it's being pulled towards.
    this.locked = null; // What it's actually on.
  }

  /** The hand has gone, so it isn't aiming at anything. */
  lose() {
    this.seen = false;
    this.target = null;
    this.locked = null;
  }

  /** The nearest target, sticking with the one it has unless another is clearly nearer. */
  choose(targets, radius) {
    let best = null;
    let bestGap = Infinity;
    let currentGap = Infinity;
    for (const target of targets) {
      const gap = Math.max(0, Math.hypot(target.x - this.steadyX, target.y - this.steadyY) - target.size);
      if (target.ref === this.target?.ref) currentGap = gap;
      if (gap < bestGap) {
        best = target;
        bestGap = gap;
      }
    }
    if (currentGap <= radius * 1.25 && bestGap >= currentGap * 0.6) {
      return targets.find(({ ref }) => ref === this.target.ref);
    }
    return bestGap <= radius ? best : null;
  }

  update(dt, handX, handY, targets, { radius, pull }, height) {
    if (!this.seen) {
      this.steadyX = handX;
      this.steadyY = handY;
      this.x = handX;
      this.y = handY;
      this.seen = true;
    }
    // Slow movement is mostly wobble, so it's steadied hard. Quick movement is meant, so it isn't.
    const speed = Math.hypot(handX - this.steadyX, handY - this.steadyY) / height / Math.max(dt, 0.001);
    const rate = mix(7, 34, clamp(speed / 1.1, 0, 1));
    const share = 1 - Math.exp(-rate * dt);
    this.steadyX += (handX - this.steadyX) * share;
    this.steadyY += (handY - this.steadyY) * share;

    const reach = radius * height;
    this.target = this.choose(targets, reach);
    let aimX = this.steadyX;
    let aimY = this.steadyY;
    if (this.target) {
      const gap = Math.max(0, Math.hypot(this.target.x - aimX, this.target.y - aimY) - this.target.size);
      // All the way on over most of the reach, and fading out towards the edge of it.
      const closeness = clamp((reach - gap) / (reach * 0.3), 0, 1);
      const amount = pull * closeness * closeness * (3 - 2 * closeness);
      aimX += (this.target.x - aimX) * amount;
      aimY += (this.target.y - aimY) * amount;
    }
    const follow = 1 - Math.exp(-dt * 18);
    this.x += (aimX - this.x) * follow;
    this.y += (aimY - this.y) * follow;

    this.locked = null;
    if (this.target) {
      const onIt = Math.hypot(this.target.x - this.x, this.target.y - this.y) - this.target.size;
      if (onIt <= height * 0.035) this.locked = this.target.ref;
    }
    return this.locked;
  }
}

let nextId = 1;

export class Mission {
  constructor({ stops = PLACES.length, pace = 'slow', level = 'gentle', reloading = true, random = Math.random, onEvent = () => {} } = {}) {
    this.stops = stops >= PLACES.length ? PLACES : PLACES.filter(({ id }) => SHORT_RESCUE.includes(id));
    this.random = random;
    this.onEvent = onEvent;
    this.blaster = new Blaster({ reloading });
    this.configure({ pace, level });
    this.hearts = this.level.hearts;
    this.index = -1;
    this.phase = 'ready'; // ready, fighting, freeing, moving, won or lost.
    this.phaseLeft = 0;
    this.moveSeconds = 0;
    this.robots = [];
    this.queue = [];
    this.goo = [];
    this.shots = [];
    this.spawnIn = 0;
    this.throwIn = 0;
    this.holdThrows = 0;
    this.restFor = 0;
    this.resting = false;
    this.shield = false;
    this.time = 0;
    this.freed = 0;
    this.stats = { robots: 0, friends: 0, shots: 0, gooBlocked: 0, gooShot: 0, gooHits: 0, reloads: 0 };
  }

  /** Speed and difficulty can change in the middle of a game, from the panel. */
  configure({ pace, level, reloading }) {
    if (pace !== undefined) this.pace = PACES[pace] ?? PACES.slow;
    if (level !== undefined) this.level = LEVELS[level] ?? LEVELS.gentle;
    if (reloading !== undefined) {
      this.blaster.reloading = reloading;
      if (!reloading) {
        this.blaster.charge = 1;
        this.blaster.fillingItself = false;
      }
    }
    if (this.hearts !== undefined) this.hearts = clamp(this.hearts, 1, this.level.hearts);
  }

  get place() {
    return this.stops[this.index] ?? null;
  }

  get isLastStop() {
    return this.index === this.stops.length - 1;
  }

  /** How many robots are still to be dealt with here. */
  get leftHere() {
    return this.queue.length + this.robots.length;
  }

  /** How far the way the tram has come between stops, from 0 to 1. */
  get moved() {
    return this.phase === 'moving' ? 1 - this.phaseLeft / this.moveSeconds : 1;
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  /* ---------- where the story has got to ---------- */

  /** Robots moving about before anything counts: behind the title, and during the countdown. */
  warmUp(dt) {
    if (this.phase !== 'fighting') return;
    this.time += dt;
    this.updateRobots(dt, false);
  }

  /** The first place, with the robots already on their way. */
  start() {
    this.index = 0;
    this.beginPlace();
    this.phase = 'fighting';
    this.emit('arrived', { place: this.place, index: 0 });
  }

  beginPlace() {
    this.queue = [...this.place.robots];
    this.robots = [];
    this.goo = [];
    this.shots = [];
    this.spawnIn = 0;
    this.throwIn = this.level.firstThrow;
    this.holdThrows = this.index === 0 ? FIRST_STOP_HOLD_SECONDS : 0;
    this.emit('place', { place: this.place, index: this.index, total: this.stops.length });
    this.spawnSome(AHEAD_START);
  }

  spawnSome(ahead = 0) {
    const out = this.robots.filter(({ kind }) => kind !== 'big').length;
    let room = this.pace.atOnce - out;
    // The big one doesn't count towards how many are out, and always comes first.
    while (this.queue.length && (room > 0 || this.queue[0] === 'big')) {
      const kind = this.queue.shift();
      if (kind !== 'big') room -= 1;
      this.spawn(kind, ahead);
    }
  }

  spawn(kind, ahead = 0) {
    const robot = {
      id: nextId,
      kind,
      hp: ROBOT_KINDS[kind].hp,
      maxHp: ROBOT_KINDS[kind].hp,
      x: 0,
      y: 0,
      z: 0,
      state: 'walking',
      stateFor: 0,
      phase: this.random() * Math.PI * 2,
      paint: Math.floor(this.random() * 1000),
      rise: 1,
      shakeFor: 0,
      throwing: 0,
    };
    nextId += 1;
    const placed = { walker: () => this.placeWalker(robot, ahead), drone: () => this.placeDrone(robot, ahead), peeker: () => this.placePeeker(robot), big: () => this.placeBig(robot) };
    placed[kind]();
    this.robots.push(robot);
    this.emit('robot', { robot });
    return robot;
  }

  /** A place that nobody else is using, or any of them if they're all taken. */
  freeSpot(spots, inUse) {
    const taken = new Set(this.robots.map(inUse));
    const free = spots.map((_, index) => index).filter((index) => !taken.has(index));
    const choices = free.length ? free : spots.map((_, index) => index);
    return choices[Math.floor(this.random() * choices.length)];
  }

  placeWalker(robot, ahead) {
    const { doors, posts } = this.place;
    const door = doors[Math.floor(this.random() * doors.length)];
    robot.post = this.freeSpot(posts, ({ post }) => post);
    const [x, z] = posts[robot.post];
    robot.x = mix(door[0], x, ahead);
    robot.z = mix(door[1], z, ahead);
    robot.shuffleIn = this.pace.shuffleEvery * (0.7 + this.random() * 0.6);
  }

  placeDrone(robot, ahead) {
    const { air } = this.place;
    robot.spot = this.freeSpot(air, ({ spot }) => spot);
    robot.enter = ahead;
    robot.fromX = (robot.spot % 2 ? 1 : -1) * 22;
    this.moveDrone(robot, 0);
  }

  placePeeker(robot) {
    robot.cover = this.freeSpot(this.place.covers, ({ cover }) => cover);
    robot.state = 'rising';
    robot.rise = 0;
    this.setAtCover(robot);
    this.emit('peek', { robot });
  }

  setAtCover(robot) {
    const [x, z] = this.place.covers[robot.cover];
    robot.x = x;
    robot.z = z + 0.5; // Just behind what it's hiding behind.
  }

  placeBig(robot) {
    const [x, z] = this.place.big;
    robot.x = x;
    robot.z = z;
    robot.state = 'ready';
    robot.spots = BIG_SPOTS.slice(0, this.level.bigSpots).map((spot) => ({ ...spot, kind: 'spot', big: robot, maxHp: spot.hp, open: false, done: false }));
    robot.spotIn = 0.4;
  }

  /* ---------- what can be aimed at ---------- */

  /** Everything the crosshair can be pulled onto right now. */
  targets() {
    const found = [];
    for (const robot of this.robots) {
      if (robot.kind === 'big') {
        for (const spot of robot.spots) if (spot.open) found.push(spot);
      } else if (robot.kind !== 'peeker' || robot.rise > 0.55) {
        found.push(robot);
      }
    }
    return found.concat(this.goo);
  }

  isTarget(thing) {
    return this.targets().includes(thing);
  }

  /* ---------- every frame ---------- */

  /** hand is what readHand says, and target is what's in the crosshair, if anything. */
  update(dt, { hand = 'none', target = null } = {}) {
    if (this.phase === 'ready' || this.phase === 'won' || this.phase === 'lost') return;
    this.time += dt;
    this.shield = hand === 'closed';
    this.updateRest(dt, hand);
    this.updateBlaster(dt, hand, target);
    this.updateShots(dt);
    this.updateRobots(dt);
    this.updateGoo(dt);
    this.updatePhase(dt);
  }

  updateRest(dt, hand) {
    this.restFor = hand === 'open' ? 0 : this.restFor + dt;
    const resting = this.restFor >= REST_AFTER_SECONDS;
    if (resting === this.resting) return;
    this.resting = resting;
    if (resting) {
      // Nothing bad happens to someone who's resting, so what's in the air goes too.
      for (const goo of this.goo) this.emit('goo-gone', { goo });
      this.goo = [];
      for (const robot of this.robots) robot.throwing = 0;
      this.emit('rest');
    } else {
      this.throwIn = Math.max(this.throwIn, THROW_AGAIN_AFTER_REST);
      this.emit('rest-over');
    }
  }

  updateBlaster(dt, hand, target) {
    const aiming = Boolean(target) && this.isTarget(target);
    const { shots, ranOut, filled } = this.blaster.update(dt, { hand, aiming });
    for (let i = 0; i < shots; i += 1) {
      const shot = { target, left: SHOT_SECONDS, flight: SHOT_SECONDS, colour: this.stats.shots % 4 };
      this.shots.push(shot);
      this.stats.shots += 1;
      this.emit('shot', { shot });
    }
    if (ranOut) this.emit('empty');
    if (filled) {
      this.stats.reloads += 1;
      this.emit('reloaded');
    }
  }

  updateShots(dt) {
    for (const shot of this.shots) {
      shot.left -= dt;
      if (shot.left <= 0) this.land(shot);
    }
    this.shots = this.shots.filter(({ left }) => left > 0);
  }

  /** A shot has got there. What it was aimed at may have gone by now, and that's fine. */
  land(shot) {
    const { target } = shot;
    if (!this.isTarget(target)) return;
    if (target.kind === 'goo') {
      this.gooShot(target);
    } else if (target.kind === 'spot') {
      this.hitSpot(target);
    } else {
      target.hp -= 1;
      target.shakeFor = 0.22;
      this.emit('robot-hit', { robot: target, shot });
      if (target.hp <= 0) this.drop(target);
    }
  }

  gooShot(goo) {
    goo.hp -= 1;
    if (goo.hp > 0) return;
    this.goo = this.goo.filter((other) => other !== goo);
    this.stats.gooShot += 1;
    this.emit('goo-shot', { goo });
  }

  hitSpot(spot) {
    spot.hp -= 1;
    spot.big.shakeFor = 0.22;
    this.emit('spot-hit', { spot, robot: spot.big });
    if (spot.hp > 0) return;
    spot.open = false;
    spot.done = true;
    const big = spot.big;
    big.spotIn = BIG_NEXT_SPOT_SECONDS;
    this.emit('spot-done', { spot, robot: big });
    if (big.spots.every(({ done }) => done)) {
      // All the helpers fall down with it, which is the big moment of the whole game.
      this.queue = [];
      this.drop(big);
      for (const robot of [...this.robots]) this.drop(robot);
    }
  }

  drop(robot) {
    this.robots = this.robots.filter((other) => other !== robot);
    this.stats.robots += 1;
    this.holdThrows = 0;
    this.spawnIn = Math.max(this.spawnIn, BETWEEN_ROBOTS_SECONDS);
    this.emit('robot-dropped', { robot, left: this.leftHere });
  }

  updateRobots(dt, throwing = true) {
    const fighting = this.phase === 'fighting';
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.queue.length && (fighting || this.phase === 'moving')) {
      const before = this.queue.length;
      this.spawnOne();
      if (this.queue.length < before) this.spawnIn = BETWEEN_ROBOTS_SECONDS;
    }
    for (const robot of this.robots) {
      robot.stateFor += dt;
      robot.shakeFor = Math.max(0, robot.shakeFor - dt);
      if (robot.kind === 'walker') this.updateWalker(robot, dt);
      else if (robot.kind === 'drone') this.moveDrone(robot, dt);
      else if (robot.kind === 'peeker') this.updatePeeker(robot);
      else this.updateBig(robot, dt);
      if (robot.throwing > 0) this.updateThrow(robot, dt);
    }
    if (fighting && throwing) this.updateThrowing(dt);
  }

  spawnOne() {
    const out = this.robots.filter(({ kind }) => kind !== 'big').length;
    if (out < this.pace.atOnce || this.queue[0] === 'big') this.spawn(this.queue.shift());
  }

  setState(robot, state) {
    robot.state = state;
    robot.stateFor = 0;
  }

  updateWalker(robot, dt) {
    if (this.resting) return; // They've stopped to wave.
    const [x, z] = this.place.posts[robot.post];
    if (robot.state === 'walking') {
      const gapX = x - robot.x;
      const gapZ = z - robot.z;
      const gap = Math.hypot(gapX, gapZ);
      const step = this.pace.walk * dt;
      if (gap <= step) {
        robot.x = x;
        robot.z = z;
        this.setState(robot, 'ready');
      } else {
        robot.x += (gapX / gap) * step;
        robot.z += (gapZ / gap) * step;
      }
      return;
    }
    // They don't stand about for long, so there's always something moving.
    robot.shuffleIn -= dt;
    if (robot.shuffleIn <= 0 && robot.throwing === 0) {
      robot.post = this.freeSpot(this.place.posts, ({ post }) => post);
      robot.shuffleIn = this.pace.shuffleEvery * (0.7 + this.random() * 0.6);
      this.setState(robot, 'walking');
    }
  }

  moveDrone(robot, dt) {
    const [x, y, z] = this.place.air[robot.spot];
    robot.enter = Math.min(1, robot.enter + dt / DRONE_ENTER_SECONDS);
    if (robot.enter === 1 && robot.state === 'walking') this.setState(robot, 'ready');
    const time = this.time + robot.phase;
    const hoverX = x + Math.sin(time * 0.62) * 2.2;
    const hoverY = y + Math.sin(time * 1.15) * 0.45;
    const hoverZ = z + Math.cos(time * 0.47) * 1.1;
    const smooth = robot.enter * robot.enter * (3 - 2 * robot.enter);
    robot.x = mix(robot.fromX, hoverX, smooth);
    robot.y = mix(8, hoverY, smooth);
    robot.z = mix(z + 7, hoverZ, smooth);
  }

  updatePeeker(robot) {
    const { stateFor, state } = robot;
    if (state === 'rising') {
      robot.rise = Math.min(1, stateFor / PEEK_RISE_SECONDS);
      if (robot.rise === 1) this.setState(robot, 'ready');
    } else if (state === 'ready') {
      if (this.resting || robot.throwing > 0) return; // Stay up to wave, or to finish throwing.
      if (stateFor > this.pace.peekSeconds) this.setState(robot, 'ducking');
    } else if (state === 'ducking') {
      robot.rise = Math.max(0, 1 - stateFor / PEEK_RISE_SECONDS);
      if (robot.rise === 0) this.setState(robot, 'hidden');
    } else if (stateFor > PEEK_HIDDEN_SECONDS) {
      // Up again somewhere else.
      robot.cover = this.freeSpot(this.place.covers, ({ cover }) => cover);
      this.setAtCover(robot);
      this.setState(robot, 'rising');
      this.emit('peek', { robot });
    }
  }

  updateBig(robot, dt) {
    // Nothing opens until the tram has got here, so that it can be seen happening.
    if (this.phase !== 'fighting' || robot.spots.some(({ open }) => open)) return;
    const next = robot.spots.find(({ done }) => !done);
    if (!next) return;
    robot.spotIn -= dt;
    if (robot.spotIn <= 0) {
      next.open = true;
      this.emit('spot-open', { spot: next, robot });
    }
  }

  /* ---------- goo ---------- */

  updateThrowing(dt) {
    if (this.resting) return;
    if (this.holdThrows > 0) {
      this.holdThrows -= dt;
      return;
    }
    this.throwIn -= dt;
    if (this.throwIn > 0) return;
    const inHand = this.robots.filter(({ throwing }) => throwing > 0).length;
    if (this.goo.length + inHand >= this.level.gooInAir) return;
    const able = this.robots.filter((robot) => robot.state === 'ready' && robot.throwing === 0 && (robot.kind !== 'peeker' || robot.rise === 1));
    if (!able.length) return;
    const thrower = able[Math.floor(this.random() * able.length)];
    thrower.throwing = WINDUP_SECONDS;
    this.throwIn = this.level.throwEvery * (0.8 + this.random() * 0.4);
    this.emit('windup', { robot: thrower });
  }

  updateThrow(robot, dt) {
    robot.throwing -= dt;
    if (robot.throwing > 0) return;
    robot.throwing = 0;
    if (this.resting || this.phase !== 'fighting') return;
    this.throwGoo(robot);
  }

  throwGoo(robot) {
    const heights = { walker: 2.5, drone: robot.y - 0.5, peeker: 1.9, big: 7.6 };
    const side = this.random() < 0.5 ? -1 : 1;
    const goo = {
      id: nextId,
      kind: 'goo',
      hp: GOO_HP,
      fromX: robot.x + (robot.kind === 'big' ? side * 4.5 : 0.4),
      fromY: heights[robot.kind],
      fromZ: robot.z,
      toX: side * (0.3 + this.random() * 0.5),
      x: 0,
      y: 0,
      z: 0,
      t: 0,
      seconds: this.level.gooSeconds,
      big: robot.kind === 'big',
    };
    nextId += 1;
    this.placeGoo(goo);
    this.goo.push(goo);
    this.emit('goo', { goo, robot });
  }

  placeGoo(goo) {
    const { t } = goo;
    goo.x = mix(goo.fromX, goo.toX, t);
    goo.z = mix(goo.fromZ, GOO_STOPS_AT, t);
    goo.y = mix(goo.fromY, EYE_HEIGHT - GOO_FROM_EYE, t) + GOO_LOB * 4 * t * (1 - t);
  }

  updateGoo(dt) {
    for (const goo of [...this.goo]) {
      goo.t = Math.min(1, goo.t + dt / goo.seconds);
      this.placeGoo(goo);
      if (goo.t === 1) this.gooArrives(goo);
    }
  }

  gooArrives(goo) {
    this.goo = this.goo.filter((other) => other !== goo);
    if (this.shield) {
      this.stats.gooBlocked += 1;
      this.emit('goo-blocked', { goo });
      return;
    }
    this.stats.gooHits += 1;
    this.hearts = Math.max(this.level.canLose ? 0 : 1, this.hearts - 1);
    this.emit('goo-hit', { goo, hearts: this.hearts });
    if (this.hearts === 0) {
      // The last of the goo goes, as one heart is all it takes.
      this.goo.forEach((other) => this.emit('goo-gone', { goo: other }));
      this.goo = [];
      this.setPhase('lost-soon', LOST_SECONDS);
    }
  }

  /** How close the nearest goo is to arriving, from 0 to 1. */
  get gooClose() {
    return this.goo.reduce((most, { t }) => Math.max(most, t), 0);
  }

  /* ---------- from place to place ---------- */

  setPhase(phase, seconds = 0) {
    this.phase = phase;
    this.phaseLeft = seconds;
  }

  updatePhase(dt) {
    if (this.phase === 'fighting') {
      if (this.leftHere === 0) this.free();
      return;
    }
    this.phaseLeft -= dt;
    if (this.phaseLeft > 0) return;
    if (this.phase === 'freeing') this.afterFreeing();
    else if (this.phase === 'moving') this.arrive();
    else if (this.phase === 'lost-soon') this.lose();
  }

  free() {
    const { place } = this;
    this.goo.forEach((goo) => this.emit('goo-gone', { goo }));
    this.goo = [];
    this.shots = [];
    this.freed += 1;
    this.stats.friends += 1;
    this.hearts = Math.min(this.level.hearts, this.hearts + 1); // A friend's thanks gives one back.
    this.setPhase('freeing', this.isLastStop ? WIN_SECONDS : FREE_SECONDS);
    this.emit('freed', { place, index: this.index, last: this.isLastStop, hearts: this.hearts });
  }

  afterFreeing() {
    if (this.isLastStop) {
      this.phase = 'won';
      this.emit('won');
      return;
    }
    const from = this.place;
    this.index += 1;
    // The short rescue has further to go between stops, though never more than the longest move.
    this.moveSeconds = this.stops === PLACES ? this.pace.moveSeconds : Math.min(LONGEST_MOVE_SECONDS, this.pace.moveSeconds * 1.3);
    this.setPhase('moving', this.moveSeconds);
    this.beginPlace();
    this.emit('moving', { from, to: this.place, seconds: this.moveSeconds });
  }

  arrive() {
    this.setPhase('fighting');
    this.emit('arrived', { place: this.place, index: this.index });
  }

  lose() {
    this.phase = 'lost';
    this.emit('lost');
  }
}
