// The story and rules of Tank Patrol. Robot tanks are rolling into Joze's valley, and he's riding in the
// child's tank to stop them. The hand is a pointer: a closed hand drives the tank to where it points,
// and an open hand swings the turret there, and the gun fires by itself at any robot tank under it that
// is in range. Closing to drive nearer and opening to fire is the exercise, and that's how it's won.
//
// A hand that's missing, out of the picture or can't be read does nothing at all: it doesn't fire and
// it doesn't drive. If it's gone for a moment or stays the same for a few seconds, that's a rest, and the
// robots stop and wait. There's no screen, sound or camera in this file, so it all runs in the unit tests.
import { ramp, stepsAt } from '../../core/levels.js';
import { PLAY, SPAWNS, START, clampToPlay, groundY, valleyNav } from './valley-map.js';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const between = (random, [low, high]) => low + random() * (high - low);
const mix = (from, to, share) => from + (to - from) * share;
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
/** The shortest way round from one direction to another. */
const turnBetween = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
/** Which way it is from one place to another. Heading 0 is up the valley, away from the camera. */
export const headingTo = (dx, dz) => Math.atan2(dx, -dz);
const gapBetween = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * What each level changes, from level 1, which is the game as it always was, up to level 10. The
 * numbers are shares of, or additions to, the speed and difficulty a grown-up chose, so a level never
 * changes those choices, the number of tanks, the reach help, the tank driving itself, or Gentle being
 * impossible to lose. Resting stops everything new here, just as it stops the rest.
 */
export function levelPlan(level = 1) {
  return {
    enemy: ramp(level, 1, 1.3), // Robot tanks roll faster, up to 30% faster at level 10.
    hold: ramp(level, 1, 0.65), // They wait less long before moving on somewhere else.
    standoff: ramp(level, 0, 4), // They keep a little further off, so there's more driving to get them in range.
    lobEvery: ramp(level, 1, 0.65), // Shells come more often.
    shellSeconds: ramp(level, 1, 0.8), // They come over a little quicker, never under 80% as long.
    moreFirst: stepsAt(level, { 1: 0, 5: 1 }), // One more robot tank about from the start from level 5.
    moreMost: stepsAt(level, { 1: 0, 3: 1, 8: 2 }), // And up to one more at once from level 3, and two from level 8.
    inAir: stepsAt(level, { 1: 0, 6: 1 }), // One more shell can be on its way at once from level 6.
    dash: level >= 3, // From level 3, scouts dash from place to place.
    pairs: level >= 4, // From level 4, robot tanks come in pairs and keep together.
    lead: stepsAt(level, { 1: 0, 5: 0.15, 8: 0.3 }), // From level 5, shells allow for the tank driving along.
    retreat: level >= 6, // From level 6, a tank that's taken half its hits runs off out of range, once.
    doubleShell: stepsAt(level, { 1: 0, 7: 1, 9: 2 }), // Heavy tanks lob two shells at once, landing apart, from level 7, and bashers from level 9.
  };
}

// How fast it all goes. drive and enemy are in units a second, and out is how many robot tanks are
// about at once, from the first to the most, as more come when others are stopped.
export const PACES = {
  slow: { drive: 10, enemy: 3.2, out: [3, 4] },
  medium: { drive: 13, enemy: 4.4, out: [3, 5] },
  fast: { drive: 17, enemy: 5.8, out: [4, 6] },
};

// How hard the shells come. On Gentle the child can't lose, as hearts stop at one. toughness multiplies
// how many hits a tank can take, and lead is how much a shell allows for the tank moving.
export const LEVELS = {
  gentle: { hearts: 5, canLose: false, lobEvery: [6, 9], shellSeconds: 3.8, blast: 5, inAir: 1, healAfter: 6, firstLob: 14, toughness: 1, lead: 0 },
  medium: { hearts: 5, canLose: true, lobEvery: [4, 6.5], shellSeconds: 3.1, blast: 5.5, inAir: 2, healAfter: 10, firstLob: 7, toughness: 1.25, lead: 0.25 },
  tough: { hearts: 3, canLose: true, lobEvery: [2.6, 4.5], shellSeconds: 2.6, blast: 6, inAir: 3, healAfter: 14, firstLob: 4, toughness: 1.5, lead: 0.5 },
};

// How much the crosshair is pulled onto a robot tank near it, in units beyond the tank's own size. Even
// the least of these is generous, as precision isn't what this game is about.
export const AIM_HELP = {
  none: { radius: 6, pull: 0.75 },
  little: { radius: 10, pull: 0.92 },
  lots: { radius: 16, pull: 1 },
};

export const GUN = { range: 21, every: 0.5, aligned: 0.32, turn: 6.5, shotSpeed: 62 };

export const KINDS = {
  scout: { hp: 4, size: 3.2, speed: 1.12 },
  basher: { hp: 6, size: 3.7, speed: 1 },
  heavy: { hp: 9, size: 4.6, speed: 0.82 },
};

const CHILD = { turn: 3.2, accel: 26, brake: 42, arrive: 3.2, stopWithin: 0.9 };
const ROBOT = { turn: 1.5, accel: 8, brake: 12, turretTurn: 1.8, arrive: 2.5, reached: 2.2 };
export const STANDOFF = [GUN.range + 6, GUN.range + 14]; // Just out of the gun's reach, so that it takes driving.
const HOLD_SECONDS = [2.5, 5];
const TOO_NEAR = 10;
const THINK_AGAIN_SECONDS = 0.6; // Working out a new way to go takes a moment, so it isn't done too often.
const APART = 9.5; // How far apart robot tanks keep.
const STUN_SECONDS = 1; // A tank being fired on stays where it is, so there's no chasing it about.
const HIT_SECONDS = 0.28;
const RATTLE_SECONDS = 1.3; // It rattles to a halt.
const WAVE_SECONDS = 3.4; // Its crew climbs out and waves.
const FADE_SECONDS = 1.3; // And it fades away.
const NEXT_TANK_SECONDS = 0.9;
const DASH = 1.75; // How much faster a dashing scout goes than the others.
const PAIR_APART = 10; // How far apart a pair keeps, side by side.
const SECOND_SHELL_APART = 11; // How far the second of two shells lands from the first.
const LOBS_TWO = ['heavy', 'basher']; // In this order, as the levels go up: see levelPlan.
const WON_AFTER = 3.4; // Long enough to see the last crew climb out and wave.
const LOST_AFTER = 1;
const HURT_SECONDS = 0.8;
const SHELL_HEIGHT = 17;
const SCOOT_FROM = 0.2; // How far through a shell's flight a tank driving by itself gets out of the way.
const STOP_SHORT = 0.72; // Driving at a robot tank, it stops this far into its range and doesn't go right up to it.
const ON_A_TANK = 3; // How near the hand has to be to a robot tank to be driving at it, beyond its size.

const GONE_REST_SECONDS = 3; // With no hand, that's a rest.
const STILL_REST_SECONDS = 5; // With nothing changing, so is that.
const STILL_MOVES = 2.5; // Less movement than this, in units on the ground, is still keeping still.
const AFTER_REST_SECONDS = 2.5;

// A hand coming into view counts as closed until it has proved it's open, and so can one going past on its
// way to something else. So it has to stay closed this long before the tank goes anywhere.
const CLOSED_FOR_DRIVING = 0.22;

const FLOW_EVERY = 0.12; // How often the way to where the hand is pointing gets worked out again.
const ROUTE_EVERY = 0.1;
const STUCK_AFTER = 0.8; // Trying to move and not getting anywhere for this long...
const SLIP_SECONDS = 0.7; // ...and it goes straight through whatever's stopping it.

/** The hand in play, as this game needs it. Anything uncertain neither fires nor drives. */
export function readHand(snapshot) {
  const hand = snapshot[snapshot.side];
  if (snapshot.handOpen) return 'open';
  if (hand.status === 'closed' && hand.reason === 'closed' && !snapshot.overlap) return 'closed';
  return hand.status === 'missing' ? 'none' : 'unsure';
}

/** Which tanks come, in order: small ones to start with, and a big one to finish. */
export function tanksFor(total) {
  const mid = ['scout', 'scout', 'basher', 'scout', 'basher'];
  const line = [];
  for (let i = 0; i < total - 1; i += 1) {
    if (i >= mid.length && (i - mid.length) % 3 === 2) line.push('heavy');
    else line.push(mid[i % mid.length]);
  }
  line.push('heavy');
  return line;
}

/** Where a shell is now, going over in a high slow arc. */
export function shellPoint(shell) {
  const { share, from, to } = shell;
  return {
    x: mix(from.x, to.x, share),
    y: mix(from.y, to.y, share) + 4 * SHELL_HEIGHT * share * (1 - share),
    z: mix(from.z, to.z, share),
  };
}

let nextId = 1;

export class Patrol {
  /**
   * tanks is how many there are to stop, pace and level are from PACES and LEVELS, help is from
   * AIM_HELP, and driving is 'closed' for a closed hand or 'auto' for the tank driving itself towards
   * whatever's out of range, for a child who can't close easily.
   */
  constructor({ tanks = 6, pace = 'slow', level = 'gentle', levelNumber = 1, help = 'little', driving = 'closed', random = Math.random, onEvent = () => {} } = {}) {
    this.nav = valleyNav();
    this.random = random;
    this.onEvent = onEvent;
    this.total = tanks;
    // The level being played, from 1 to 10, which makes it harder within the grown-up's choices.
    this.levelNumber = levelNumber;
    this.plan = levelPlan(levelNumber);
    this.configure({ pace, level, help, driving });
    this.hearts = this.level.hearts;

    this.state = 'ready'; // ready, playing, won or lost.
    this.time = 0;
    this.playSeconds = 0;
    this.tank = { x: START.x, z: START.z, y: groundY(START.x, START.z), heading: 0, turret: 0, speed: 0, turnRate: 0, stuckFor: 0, slipFor: 0 };
    this.hurtLeft = 0;
    this.sinceHurt = 0;

    this.enemies = [];
    this.queue = tanksFor(tanks);
    this.shots = [];
    this.shells = [];
    this.nextSpawn = 0;
    this.spawnIn = 0;
    this.lobIn = this.level.firstLob;
    this.gunIn = 0;
    this.firstLobbed = false;
    this.endIn = null;

    this.hand = 'none';
    this.closedFor = 0;
    this.pointer = null;
    this.locked = null;
    this.firing = false;
    this.crosshair = { x: START.x, z: START.z - 10, seen: false };

    this.goal = null;
    this.flow = null;
    this.flowIn = 0;
    this.routeIn = 0;
    this.route = [];
    this.driving = false;

    this.resting = false;
    this.goneFor = 0;
    this.stillFor = 0;
    this.stillAt = null;
    this.lastHand = 'none';

    this.stats = { stopped: 0, shots: 0, hits: 0, dodged: 0, hurts: 0, driven: 0, seconds: 0, firingSeconds: 0 };
    this.fill();
  }

  /** Speed, difficulty, help with aiming and how it's driven can change at any time, from the panel. */
  configure({ pace, level, help, driving }) {
    if (pace !== undefined) this.pace = PACES[pace] ?? PACES.slow;
    if (level !== undefined) {
      this.level = LEVELS[level] ?? LEVELS.gentle;
      if (this.hearts !== undefined) this.hearts = clamp(this.hearts, 1, this.level.hearts);
    }
    if (help !== undefined) this.help = AIM_HELP[help] ?? AIM_HELP.little;
    if (driving !== undefined) this.autoDrive = driving === 'auto';
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  begin() {
    this.state = 'playing';
  }

  get stopped() {
    return this.stats.stopped;
  }

  get left() {
    return this.total - this.stats.stopped;
  }

  /** The robot tanks that are still rolling. */
  get rolling() {
    return this.enemies.filter(({ state }) => state === 'rolling');
  }

  /** What the crosshair should look like. */
  get look() {
    if (!this.crosshair.seen) return 'lost';
    if (this.hand === 'closed') return this.closedFor >= CLOSED_FOR_DRIVING ? 'go' : 'ready';
    if (this.hand !== 'open') return 'lost';
    if (!this.locked) return 'ready';
    return this.inRange(this.locked) ? 'firing' : 'far';
  }

  inRange(enemy) {
    return gapBetween(this.tank, enemy) <= GUN.range + enemy.size * 0.5;
  }

  /** Whether a shell is coming down on the tank where it is now. */
  get underShell() {
    return this.shells.some(({ to, blast }) => gapBetween(this.tank, to) <= blast);
  }

  /* ---------- robot tanks rolling in ---------- */

  get mostOut() {
    const [first, most] = this.pace.out;
    return Math.min(most + this.plan.moreMost, first + this.plan.moreFirst + Math.floor(this.stats.stopped / 2));
  }

  /* ---------- the numbers in play: the grown-up's choices, made harder by the level ---------- */

  get enemySpeed() {
    return this.pace.enemy * this.plan.enemy;
  }

  get shellSeconds() {
    return this.level.shellSeconds * this.plan.shellSeconds;
  }

  get inAir() {
    return this.level.inAir + this.plan.inAir;
  }

  get lead() {
    return this.level.lead + this.plan.lead;
  }

  fill() {
    while (this.queue.length && this.rolling.length < this.mostOut) {
      if (!this.spawn()) return;
    }
  }

  spawn() {
    // Not on top of one that's only just come in.
    const place = [0, 1, 2].map((i) => SPAWNS[(this.nextSpawn + i) % SPAWNS.length]).find((spot) => this.enemies.every((other) => other.state === 'gone' || gapBetween(other, spot) > 11));
    if (!place) {
      this.spawnIn = 0.4;
      return false;
    }
    this.nextSpawn = (SPAWNS.indexOf(place) + 1) % SPAWNS.length;
    const kind = this.queue.shift();
    const shape = KINDS[kind];
    const hp = Math.round(shape.hp * this.level.toughness);
    const enemy = {
      id: nextId,
      kind,
      x: place.x,
      z: place.z,
      y: groundY(place.x, place.z),
      heading: Math.PI,
      turret: Math.PI,
      speed: 0,
      turnRate: 0,
      hp,
      maxHp: hp,
      size: shape.size,
      top: shape.speed,
      state: 'rolling',
      stateLeft: 0,
      goal: null,
      flow: null,
      thinkIn: 0,
      holdFor: 0,
      stun: 0,
      hitLeft: 0,
      stuckFor: 0,
      slipFor: 0,
    };
    nextId += 1;
    // On the higher levels, every other one comes in as the partner of the one before, if it's still about.
    const alone = (other) => other.leader?.state !== 'rolling' && other.partner?.state !== 'rolling';
    const last = this.rolling.filter(alone).at(-1);
    if (this.plan.pairs && last) {
      enemy.leader = last;
      last.partner = enemy;
    }
    this.enemies.push(enemy);
    this.emit('spawn', { enemy });
    return true;
  }

  /** Somewhere for a tank to go next: out of the gun's reach, on the side of the child it's on already. */
  chooseGoal(enemy) {
    const { tank, random, nav } = this;
    if (enemy.leader?.state === 'rolling' && enemy.leader.goal) {
      this.followLeader(enemy);
      return;
    }
    const standoff = STANDOFF.map((far) => far + this.plan.standoff);
    let spot = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const angle = Math.atan2(enemy.x - tank.x, enemy.z - tank.z) + between(random, [-0.9, 0.9]);
      const away = between(random, standoff);
      const place = clampToPlay(tank.x + Math.sin(angle) * away, tank.z + Math.cos(angle) * away);
      spot = nav.nearestFree(clamp(place.x, PLAY.left + 3, PLAY.right - 3), clamp(place.z, PLAY.far + 2, PLAY.near - 2));
      const roomy = this.enemies.every((other) => other === enemy || !other.goal || gapBetween(other.goal, spot) > APART);
      if (roomy && gapBetween(spot, tank) > GUN.range * 0.8) break;
    }
    enemy.goal = spot;
    enemy.flow = nav.flowTo(spot.x, spot.z, enemy.flow);
    enemy.holdFor = between(random, HOLD_SECONDS) * this.plan.hold;
    enemy.thinkIn = THINK_AGAIN_SECONDS;
    // A scout on the higher levels dashes to wherever it's going next.
    enemy.dashing = this.plan.dash && enemy.kind === 'scout';
    if (enemy.dashing) this.emit('dash', { enemy });
  }

  /** The second of a pair goes where the first is going, beside it, on the side away from the child's tank. */
  followLeader(enemy) {
    const { leader } = enemy;
    const { nav, tank } = this;
    const dx = leader.goal.x - tank.x;
    const dz = leader.goal.z - tank.z;
    const far = Math.hypot(dx, dz) || 1;
    const side = enemy.id % 2 ? 1 : -1;
    const beside = clampToPlay(leader.goal.x - (dz / far) * PAIR_APART * side, leader.goal.z + (dx / far) * PAIR_APART * side);
    const spot = nav.nearestFree(beside.x, beside.z);
    enemy.goal = spot;
    enemy.flow = nav.flowTo(spot.x, spot.z, enemy.flow);
    enemy.holdFor = leader.holdFor;
    enemy.thinkIn = THINK_AGAIN_SECONDS;
    enemy.dashing = leader.dashing;
  }

  /**
   * Moves a tank towards a place, turning as it goes, and on the spot if it's facing well away from it.
   * It can't drive into anything, and if it somehow can't get anywhere, it goes straight on until it can.
   */
  roll(tank, to, top, { turn, accel, brake, arrive }, dt) {
    const dx = to.x - tank.x;
    const dz = to.z - tank.z;
    const away = Math.hypot(dx, dz);
    const off = turnBetween(headingTo(dx, dz), tank.heading);
    const turned = clamp(off, -turn * dt, turn * dt);
    tank.heading += turned;
    tank.turnRate = dt > 0 ? turned / dt : 0;
    const wanted = top * clamp(1.15 - Math.abs(off) / 1.1, 0, 1) * clamp(away / arrive, 0.12, 1);
    tank.speed += clamp(wanted - tank.speed, -brake * dt, accel * dt);
    this.advance(tank, top, wanted, dt);
  }

  /** Slows a tank to a stop. */
  coast(tank, { brake }, dt) {
    tank.turnRate = 0;
    tank.speed = Math.max(0, tank.speed - brake * dt);
    tank.stuckFor = 0;
    this.advance(tank, 1, 0, dt);
  }

  advance(tank, top, wanted, dt) {
    const { nav } = this;
    const step = tank.speed * dt;
    const nx = tank.x + Math.sin(tank.heading) * step;
    const nz = tank.z - Math.cos(tank.heading) * step;
    const [fromX, fromZ] = [tank.x, tank.z];
    tank.slipFor = Math.max(0, tank.slipFor - dt);
    if (tank.slipFor > 0 || nav.isFree(nx, nz)) {
      tank.x = nx;
      tank.z = nz;
    } else if (nav.isFree(nx, tank.z)) {
      tank.x = nx;
    } else if (nav.isFree(tank.x, nz)) {
      tank.z = nz;
    }
    const moved = Math.hypot(tank.x - fromX, tank.z - fromZ);
    const trying = wanted > top * 0.3 || (wanted > 0.5 && tank.speed > 0.5);
    tank.stuckFor = trying && moved < step * 0.4 ? tank.stuckFor + dt : 0;
    if (tank.stuckFor > STUCK_AFTER) {
      tank.stuckFor = 0;
      tank.slipFor = SLIP_SECONDS;
    }
    tank.y = groundY(tank.x, tank.z);
    return moved;
  }

  moveEnemies(dt, moving) {
    const { tank, nav } = this;
    const top = this.enemySpeed;
    for (const enemy of this.enemies) {
      enemy.hitLeft = Math.max(0, enemy.hitLeft - dt);
      if (enemy.state !== 'rolling') {
        this.settleEnemy(enemy, dt);
        continue;
      }
      enemy.stun = Math.max(0, enemy.stun - dt);
      const wait = enemy.stun > 0 || !moving;
      if (wait) {
        this.coast(enemy, ROBOT, dt);
      } else {
        enemy.thinkIn = Math.max(0, enemy.thinkIn - dt);
        const crowded = gapBetween(enemy, tank) < TOO_NEAR && enemy.goal && gapBetween(enemy.goal, tank) < TOO_NEAR;
        // The second of a pair sets off again when the first does.
        const leaderMoved = enemy.leader?.state === 'rolling' && enemy.leader.goal && enemy.followed !== enemy.leader.goal;
        if (!enemy.goal || (crowded && enemy.thinkIn === 0) || leaderMoved) {
          this.chooseGoal(enemy);
          if (enemy.leader) enemy.followed = enemy.leader.goal;
        }
        const there = gapBetween(enemy, enemy.goal) < ROBOT.reached;
        if (there) {
          this.coast(enemy, ROBOT, dt);
          enemy.dashing = false;
          enemy.running = false;
          enemy.holdFor -= dt;
          if (enemy.holdFor <= 0 && !(enemy.leader?.state === 'rolling')) this.chooseGoal(enemy);
        } else {
          const speed = top * enemy.top * (enemy.dashing ? DASH : 1);
          this.roll(enemy, nav.waypoint(enemy.flow, enemy.x, enemy.z, enemy.goal), speed, ROBOT, dt);
        }
      }
      const toChild = headingTo(tank.x - enemy.x, tank.z - enemy.z);
      enemy.turret += clamp(turnBetween(toChild, enemy.turret), -ROBOT.turretTurn * dt, ROBOT.turretTurn * dt);
    }
    this.keepApart(dt);
    this.enemies = this.enemies.filter(({ state }) => state !== 'gone');
  }

  settleEnemy(enemy, dt) {
    if (enemy.state === 'rattling') enemy.speed = Math.max(0, enemy.speed - 5 * dt);
    if (enemy.state === 'rattling' && enemy.speed > 0) {
      enemy.x += Math.sin(enemy.heading) * enemy.speed * dt;
      enemy.z -= Math.cos(enemy.heading) * enemy.speed * dt;
    }
    enemy.stateLeft -= dt;
    if (enemy.stateLeft > 0) return;
    const next = { rattling: ['waving', WAVE_SECONDS], waving: ['fading', FADE_SECONDS], fading: ['gone', 0] }[enemy.state];
    if (!next) return;
    [enemy.state, enemy.stateLeft] = next;
    if (next[0] === 'waving') this.emit('crew', { enemy });
    if (next[0] === 'gone') this.emit('gone', { enemy });
  }

  /** Robot tanks keep out of each other's way and out of the child's, who is never held up by them. */
  keepApart(dt) {
    const { rolling, tank, nav } = this;
    const push = (enemy, from, gap, wanted) => {
      if (gap >= wanted || gap < 0.01) return;
      const amount = (wanted - gap) * 2.4 * dt;
      const x = enemy.x + ((enemy.x - from.x) / gap) * amount;
      const z = enemy.z + ((enemy.z - from.z) / gap) * amount;
      if (nav.isFree(x, z)) {
        enemy.x = x;
        enemy.z = z;
        enemy.y = groundY(x, z);
      }
    };
    for (let a = 0; a < rolling.length; a += 1) {
      push(rolling[a], tank, gapBetween(rolling[a], tank), 8);
      for (let b = a + 1; b < rolling.length; b += 1) {
        const gap = gapBetween(rolling[a], rolling[b]);
        push(rolling[a], rolling[b], gap, APART);
        push(rolling[b], rolling[a], gap, APART);
      }
    }
  }

  /* ---------- shells coming over ---------- */

  lobbing(dt) {
    const { level, random, tank } = this;
    this.lobIn -= dt;
    // Nothing new while the hand has gone, as there'd be no way of getting out from under it.
    if (this.lobIn > 0 || this.goneFor > 0 || this.shells.length >= this.inAir) return;
    const able = this.rolling.filter(({ stun }) => stun === 0);
    if (!able.length) return;
    const enemy = able[Math.floor(random() * able.length)];
    this.lobIn = between(random, level.lobEvery) * this.plan.lobEvery;
    const seconds = this.shellSeconds;
    const lead = tank.speed * seconds * this.lead;
    const toX = tank.x + Math.sin(tank.heading) * lead;
    const toZ = tank.z - Math.cos(tank.heading) * lead;
    const first = !this.firstLobbed;
    this.lob(enemy, this.nav.nearestFree(toX, toZ), seconds, first);
    // On the higher levels a heavy lobs two, the second landing off to one side of the first.
    if (LOBS_TWO.slice(0, this.plan.doubleShell).includes(enemy.kind) && this.shells.length < this.inAir) {
      const side = random() < 0.5 ? -1 : 1;
      const across = { x: Math.cos(tank.heading) * side, z: Math.sin(tank.heading) * side };
      const spot = clampToPlay(toX + across.x * SECOND_SHELL_APART, toZ + across.z * SECOND_SHELL_APART);
      this.lob(enemy, this.nav.nearestFree(spot.x, spot.z), seconds, false, true);
    }
  }

  lob(enemy, landing, seconds, first, second = false) {
    const shell = {
      id: nextId,
      share: 0,
      seconds,
      blast: this.level.blast,
      from: { x: enemy.x, y: enemy.y + 4, z: enemy.z },
      to: { x: landing.x, y: groundY(landing.x, landing.z), z: landing.z },
    };
    nextId += 1;
    this.shells.push(shell);
    enemy.lobbedAt = this.time;
    this.emit('lob', { enemy, shell, first, second });
    this.firstLobbed = true;
  }

  moveShells(dt) {
    for (const shell of this.shells) shell.share += dt / shell.seconds;
    const landed = this.shells.filter(({ share }) => share >= 1);
    if (!landed.length) return;
    this.shells = this.shells.filter(({ share }) => share < 1);
    for (const shell of landed) {
      const hit = gapBetween(this.tank, shell.to) <= shell.blast;
      this.emit('land', { shell, hit });
      if (hit) this.hurt();
      else this.stats.dodged += 1;
    }
  }

  /** Anything on its way when a rest begins goes up in a puff. Nothing bad happens while resting. */
  fizzleShells() {
    for (const shell of this.shells) this.emit('fizzle', { shell });
    this.shells = [];
  }

  hurt() {
    const { level } = this;
    this.stats.hurts += 1;
    this.sinceHurt = 0;
    this.hurtLeft = HURT_SECONDS;
    this.hearts = level.canLose ? this.hearts - 1 : Math.max(1, this.hearts - 1);
    this.emit('hurt', { hearts: this.hearts });
    if (this.hearts <= 0 && this.endIn === null) {
      this.ending = 'lost';
      this.endIn = LOST_AFTER;
      this.fizzleShells();
    }
  }

  heal(dt) {
    this.hurtLeft = Math.max(0, this.hurtLeft - dt);
    if (this.hearts >= this.level.hearts || this.hearts <= 0) return;
    this.sinceHurt += dt;
    if (this.sinceHurt >= this.level.healAfter) {
      this.sinceHurt = 0;
      this.hearts += 1;
      this.emit('healed', { hearts: this.hearts });
    }
  }

  /* ---------- the hand ---------- */

  /** Whether the child is resting: no hand, or nothing changing, with nothing going on. */
  watchRest(dt, hand, pointer) {
    const gone = hand === 'none' || hand === 'unsure';
    this.goneFor = gone ? this.goneFor + dt : 0;
    let changed = hand !== this.lastHand;
    this.lastHand = hand;
    if (pointer && (!this.stillAt || gapBetween(pointer, this.stillAt) > STILL_MOVES)) {
      this.stillAt = { x: pointer.x, z: pointer.z };
      changed = true;
    }
    const busy = this.firing || this.tank.speed > 0.6;
    this.stillFor = changed || busy || gone ? 0 : this.stillFor + dt;
    const resting = this.goneFor >= GONE_REST_SECONDS || this.stillFor >= STILL_REST_SECONDS;
    if (resting === this.resting) return;
    this.resting = resting;
    if (resting) this.fizzleShells();
    else this.lobIn = Math.max(this.lobIn, AFTER_REST_SECONDS);
    this.emit('resting', { on: resting });
  }

  /** The robot tank nearest the hand, sticking with the one it has unless another is clearly nearer. */
  chooseTarget(pointer) {
    const { radius } = this.help;
    let best = null;
    let bestGap = Infinity;
    let currentGap = Infinity;
    for (const enemy of this.rolling) {
      const gap = Math.max(0, gapBetween(enemy, pointer) - enemy.size);
      if (enemy === this.locked) currentGap = gap;
      if (gap < bestGap) {
        best = enemy;
        bestGap = gap;
      }
    }
    if (currentGap <= radius * 1.3 && bestGap >= currentGap * 0.6) return this.locked;
    return bestGap <= radius ? best : null;
  }

  /** Where the crosshair is: where the hand is pointing, and pulled onto a tank if it's aiming at one. */
  aim(dt, hand, pointer) {
    this.pointer = pointer;
    const { crosshair } = this;
    crosshair.seen = Boolean(pointer);
    if (!pointer) {
      this.locked = null;
      return;
    }
    this.locked = hand === 'open' ? this.chooseTarget(pointer) : null;
    let { x, z } = pointer;
    if (this.locked) {
      const { radius, pull } = this.help;
      const gap = Math.max(0, gapBetween(this.locked, pointer) - this.locked.size);
      const closeness = clamp((radius - gap) / (radius * 0.5), 0, 1);
      const amount = pull * closeness * closeness * (3 - 2 * closeness);
      x += (this.locked.x - x) * amount;
      z += (this.locked.z - z) * amount;
    }
    crosshair.x = damp(crosshair.x, x, 20, dt);
    crosshair.z = damp(crosshair.z, z, 20, dt);
  }

  /** Where a tank that drives itself goes: towards a target out of range, or out from under a shell. */
  scootGoal() {
    const { tank, locked, shells } = this;
    const shell = shells.find(({ share, to, blast }) => share > SCOOT_FROM && gapBetween(tank, to) <= blast + 0.5);
    if (shell) {
      const dx = tank.x - shell.to.x;
      const dz = tank.z - shell.to.z;
      const gap = Math.hypot(dx, dz);
      // Straight along the way it's pointing, if it's right on top of the place.
      const [wayX, wayZ] = gap < 1 ? [Math.sin(tank.heading), -Math.cos(tank.heading)] : [dx / gap, dz / gap];
      const away = clampToPlay(shell.to.x + wayX * (shell.blast + 4), shell.to.z + wayZ * (shell.blast + 4));
      // With two shells coming down side by side, somewhere clear of both of them.
      return this.plan.doubleShell > 0 ? this.clearOfShells(away, shell) : away;
    }
    return locked && !this.inRange(locked) ? { x: locked.x, z: locked.z } : null;
  }

  /** A place clear of every shell on its way, as near as can be to the one first thought of. */
  clearOfShells(wanted, shell) {
    const clear = (spot) => this.shells.every(({ to, blast }) => gapBetween(spot, to) > blast + 1);
    if (clear(wanted)) return wanted;
    const reach = shell.blast + 4;
    let best = wanted;
    let bestGap = Infinity;
    for (let i = 0; i < 16; i += 1) {
      for (const far of [reach, reach * 1.6]) {
        const angle = (i / 16) * Math.PI * 2;
        const spot = clampToPlay(this.tank.x + Math.sin(angle) * far, this.tank.z - Math.cos(angle) * far);
        const gap = gapBetween(spot, wanted);
        if (clear(spot) && gap < bestGap) {
          best = spot;
          bestGap = gap;
        }
      }
    }
    return best;
  }

  /** The way to where the hand is pointing, worked out again when that's changed. */
  driveTowards(goal, dt) {
    const { nav } = this;
    this.flowIn -= dt;
    const place = nav.nearestFree(goal.x, goal.z);
    if (!this.flow || (this.flowIn <= 0 && (!this.goal || gapBetween(place, this.goal) > nav.cell * 0.75))) {
      this.goal = place;
      this.flow = nav.flowTo(place.x, place.z, this.flow);
      this.flowIn = FLOW_EVERY;
      this.routeIn = 0;
    }
  }

  /** The tank goes where the hand says, if the hand can be read. */
  driveChild(dt, hand, pointer) {
    const { tank, nav } = this;
    let goal = null;
    let stopShort = 0;
    if (pointer && hand === 'closed' && this.closedFor >= CLOSED_FOR_DRIVING) {
      goal = clampToPlay(pointer.x, pointer.z);
      if (this.rolling.some((enemy) => gapBetween(enemy, pointer) <= enemy.size + ON_A_TANK)) stopShort = GUN.range * STOP_SHORT;
    } else if (pointer && hand === 'open' && this.autoDrive) {
      goal = this.scootGoal();
      if (goal && this.locked && goal.x === this.locked.x && goal.z === this.locked.z) stopShort = GUN.range - 2;
    }
    this.driving = false;
    if (!goal) {
      this.coast(tank, CHILD, dt);
      this.route = [];
      return;
    }
    this.driveTowards(goal, dt);
    const away = gapBetween(tank, this.goal);
    if (away <= CHILD.stopWithin + stopShort) {
      this.coast(tank, CHILD, dt);
    } else {
      this.driving = true;
      const before = { x: tank.x, z: tank.z };
      const to = nav.waypoint(this.flow, tank.x, tank.z, this.goal);
      this.roll(tank, to, this.pace.drive, CHILD, dt);
      this.stats.driven += gapBetween(before, tank);
    }
    this.routeIn -= dt;
    if (this.routeIn <= 0) {
      this.routeIn = ROUTE_EVERY;
      this.route = nav.route(this.flow, tank.x, tank.z, this.goal);
    }
  }

  /** An open hand swings the turret to the crosshair, and it fires at whatever's there and in range. */
  gunnery(dt, hand) {
    const { tank, crosshair, locked } = this;
    this.gunIn = Math.max(0, this.gunIn - dt);
    let wanted = null;
    if (hand === 'open' && crosshair.seen) wanted = locked ? headingTo(locked.x - tank.x, locked.z - tank.z) : headingTo(crosshair.x - tank.x, crosshair.z - tank.z);
    else if (hand === 'closed' && this.driving) wanted = tank.heading;
    if (wanted !== null) {
      const off = turnBetween(wanted, tank.turret);
      tank.turret += clamp(off, -GUN.turn * dt, GUN.turn * dt);
    }
    this.firing = hand === 'open' && Boolean(locked) && this.inRange(locked);
    if (this.firing) {
      this.stats.firingSeconds += dt;
      const aligned = Math.abs(turnBetween(headingTo(locked.x - tank.x, locked.z - tank.z), tank.turret)) <= GUN.aligned;
      if (aligned && this.gunIn === 0) this.fire(locked);
    }
  }

  fire(target) {
    this.gunIn = GUN.every;
    this.stats.shots += 1;
    const seconds = Math.max(0.12, gapBetween(this.tank, target) / GUN.shotSpeed);
    const shot = { target, share: 0, seconds };
    this.shots.push(shot);
    this.emit('shot', { shot, target });
  }

  moveShots(dt) {
    for (const shot of this.shots) {
      shot.share += dt / shot.seconds;
      if (shot.share >= 1) this.hit(shot.target);
    }
    this.shots = this.shots.filter(({ share }) => share < 1);
  }

  hit(enemy) {
    if (enemy.state !== 'rolling') return;
    enemy.hp -= 1;
    enemy.hitLeft = HIT_SECONDS;
    // One running for it doesn't stop to be fired at, until it's got where it's going.
    enemy.stun = enemy.running ? 0 : STUN_SECONDS;
    this.stats.hits += 1;
    this.emit('hit', { enemy });
    if (enemy.hp <= 0) {
      this.stop(enemy);
      return;
    }
    // On the higher levels, once it's taken half its hits it runs for it, out of range, and has to be chased.
    if (this.plan.retreat && !enemy.ranOff && enemy.hp <= enemy.maxHp / 2) this.runOff(enemy);
  }

  runOff(enemy) {
    const { tank, nav } = this;
    enemy.ranOff = true;
    enemy.stun = 0;
    enemy.leader = null;
    const dx = enemy.x - tank.x;
    const dz = enemy.z - tank.z;
    const far = Math.hypot(dx, dz) || 1;
    const away = STANDOFF[1] + this.plan.standoff;
    const place = clampToPlay(tank.x + (dx / far) * away, tank.z + (dz / far) * away);
    const spot = nav.nearestFree(clamp(place.x, PLAY.left + 3, PLAY.right - 3), clamp(place.z, PLAY.far + 2, PLAY.near - 2));
    enemy.goal = spot;
    enemy.flow = nav.flowTo(spot.x, spot.z, enemy.flow);
    enemy.holdFor = between(this.random, HOLD_SECONDS) * this.plan.hold;
    enemy.thinkIn = THINK_AGAIN_SECONDS * 3;
    enemy.dashing = true;
    enemy.running = true;
    this.emit('run-off', { enemy });
  }

  /** It doesn't blow up. It rattles to a halt, and its crew climbs out and waves. */
  stop(enemy) {
    enemy.state = 'rattling';
    enemy.stateLeft = RATTLE_SECONDS;
    enemy.goal = null;
    enemy.flow = null;
    if (this.locked === enemy) this.locked = null;
    this.stats.stopped += 1;
    this.spawnIn = NEXT_TANK_SECONDS;
    this.emit('stopped', { enemy, stopped: this.stats.stopped, left: this.left });
    if (this.left === 0 && this.endIn === null) {
      this.ending = 'won';
      this.endIn = WON_AFTER;
      this.fizzleShells();
    }
  }

  /* ---------- every frame ---------- */

  /** Robot tanks rolling in before anything counts: behind the title, and during the countdown. */
  warmUp(dt) {
    this.time += dt;
    this.moveEnemies(dt, true);
  }

  /** One frame. hand is what readHand said, and pointer is where it's pointing on the ground, or null. */
  update(dt, { hand = 'none', pointer = null } = {}) {
    this.time += dt;
    this.hand = hand;
    this.closedFor = hand === 'closed' ? this.closedFor + dt : 0;
    if (this.state === 'ready') return;
    if (this.state !== 'playing') {
      this.locked = null;
      this.firing = false;
      this.coast(this.tank, CHILD, dt);
      this.moveShots(dt);
      this.moveEnemies(dt, false);
      return;
    }

    this.playSeconds += dt;
    this.stats.seconds += dt;
    this.watchRest(dt, hand, pointer);
    this.aim(dt, hand, pointer);
    this.driveChild(dt, hand, pointer);
    this.gunnery(dt, hand);
    this.moveShots(dt);
    if (this.state !== 'playing') return;
    this.heal(dt);

    const ended = this.endIn !== null;
    if (!this.resting && !ended) {
      if (this.spawnIn > 0) {
        this.spawnIn -= dt;
        if (this.spawnIn <= 0) this.fill();
      } else if (this.rolling.length < this.mostOut) {
        this.fill();
      }
      this.lobbing(dt);
    }
    this.moveEnemies(dt, !this.resting && !ended);
    this.moveShells(dt);

    if (this.endIn !== null) {
      this.endIn -= dt;
      if (this.endIn <= 0) this.finish();
    }
  }

  finish() {
    this.state = this.ending;
    this.locked = null;
    this.firing = false;
    this.emit(this.ending, { stopped: this.stats.stopped });
  }
}
