// The rules of a dogfight over the island. No screen, camera or sound in this file, so it all runs in
// the unit tests.
//
// It's real flying, in all three directions. Both arms held out are the wings: tipping them banks the
// plane, which turns it, and raising or lowering both puts its nose up or down. There are limits, so
// nobody gets lost or flies into anything: a ceiling, the ground, an outer edge where the plane is
// turned back towards the island, and how steeply it can climb or how far it can bank.
//
// Sky pirates hunt the child, and the child hunts them. There's a ring in the middle of the view, and
// the guns fire by themselves at any plane inside it. Nobody gets hurt: a plane that's dropped falls
// away smoking, and its pilot comes down by parachute. A child who lowers their arms glides, and after
// a while nobody shoots at them, however long they rest.
import { WORLD, floorAt } from './island-map.js';

const degrees = (value) => (value * Math.PI) / 180;

// How fast the child's plane flies, in units a second.
export const PACES = {
  slow: { speed: 38 },
  medium: { speed: 48 },
  fast: { speed: 60 },
};

// aim is the ring's size, as the angle from its middle to its edge, enemyHits is how many hits it
// takes to drop a plane, and hitChance how many of their shots find the child. assist is how much the
// plane helps with lining up. canLose says whether running out of hearts ends the flight.
export const LEVELS = {
  gentle: { aim: degrees(11), enemyHits: 14, hitChance: 0.2, huntEvery: [8, 12], burst: 3, healAfter: 5, assist: 1, canLose: false },
  medium: { aim: degrees(9), enemyHits: 18, hitChance: 0.25, huntEvery: [6, 9], burst: 3, healAfter: 7, assist: 0.6, canLose: true },
  tough: { aim: degrees(7.5), enemyHits: 24, hitChance: 0.35, huntEvery: [4.5, 7], burst: 4, healAfter: 10, assist: 0.3, canLose: true },
};

export const HEARTS = 5;
export const MOST_AT_ONCE = 3;
// The camera, from the plane: behind and above, looking the way the plane points. The ring is in the
// middle of its view, so what's in the ring on the screen is what the guns fire at.
export const CAMERA = { back: 15, up: 4.4 };
export const RANGE = 240;

const FLY = {
  turn: 1.05, // Radians a second, at a full bank.
  roll: degrees(58),
  pitch: degrees(48), // The steepest it can climb or dive.
  rollEase: 5,
  pitchEase: 2.6,
  deadZone: 0.1, // A little wobble in the arms doesn't steer.
  glide: 0.62, // How fast it goes with arms lowered, as a share of its speed.
  climbCost: 0.22, // How much slower it goes straight up, and how much faster straight down.
  restTurn: 0.14, // The gentle turn of a plane left to itself.
  restShare: 0.75, // How fast it goes then.
};
const LIMITS = { aheadLook: [1.2, 2.6], floorRoom: 60, ceilingRoom: 45, pullUp: degrees(42), pushDown: degrees(24), turnBack: 1.6 };
const ASSIST = { cone: 2.6, turn: 0.75, pitch: degrees(18), autoHeight: degrees(30) };
const REST_AFTER = 4; // Seconds of arms down before nobody shoots any more.

const SHOT = { every: 0.11, speed: 640, reach: 10, life: 1.2 };
const ENEMY = {
  turn: 0.82,
  pitch: degrees(32),
  speed: 0.84, // As a share of the child's plane.
  catchUp: 1.3, // When it's a long way behind.
  huntSpeed: 1.04,
  aim: degrees(16),
  shotSpeed: 360,
  shotEvery: 0.16,
  miss: 13,
  reached: 45,
  ahead: [95, 180],
  across: [35, 105],
  upDown: [-30, 42],
  spawnAway: [260, 340],
  spawnAngle: [0.5, 1.25], // To one side or the other, rather than straight into the ring.
  dodgeAhead: [50, 120],
  dodgeAcross: [120, 190],
  dodgeSpeed: 1.14,
  dodgeSeconds: 2.2,
  huntSeconds: 8,
  passed: 42,
  restAfterBurst: 1.5,
  fallSeconds: 5.5,
  nextIn: 1,
};
const BEHIND_EVERY = 14; // Seconds at the least between being told a plane is behind.
const WON_AFTER = 0.9;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const between = (random, [low, high]) => low + random() * (high - low);
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
/** The shortest way round from one direction to another. */
const turnBetween = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Which way a plane is pointing. Heading 0 is north, along -z, and a turn to the right adds to it. */
export function forwardOf(heading, pitch) {
  const flat = Math.cos(pitch);
  return { x: Math.sin(heading) * flat, y: Math.sin(pitch), z: -Math.cos(heading) * flat };
}

const headingTo = (dx, dz) => Math.atan2(dx, -dz);

/** Keeps a plane inside the limits, wherever it's been pushed. */
function keepInside(plane) {
  const away = Math.hypot(plane.x, plane.z);
  if (away > WORLD.limit) {
    plane.x *= WORLD.limit / away;
    plane.z *= WORLD.limit / away;
  }
  plane.y = clamp(plane.y, floorAt(plane.x, plane.z), WORLD.ceiling);
}

export class Flight {
  /**
   * planes is how many there are to drop, pace and level are from PACES and LEVELS, and climbing says
   * whether the child's arms control how high they go. If not, the plane does that by itself.
   */
  constructor({ planes = 6, pace = 'slow', level = 'gentle', climbing = true, random = Math.random, onEvent = () => {} } = {}) {
    this.pace = PACES[pace];
    this.level = LEVELS[level];
    this.climbing = climbing;
    this.random = random;
    this.onEvent = onEvent;
    this.total = planes;

    this.state = 'ready'; // ready, flying, won, lost
    this.time = 0;
    this.x = 0;
    this.y = 95;
    this.z = 770;
    this.heading = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.hearts = HEARTS;
    this.sinceHurt = 0;
    this.hurtLeft = 0;
    this.downFor = 0;
    this.resting = false;
    this.atLimit = 0;

    this.enemies = [];
    this.waiting = planes; // Still to come.
    this.spawnIn = 0;
    this.nextPilot = 0;
    this.shots = [];
    this.shotIn = 0;
    this.locked = null;
    this.firing = false;
    this.huntIn = 4 + between(random, this.level.huntEvery);
    this.hunted = null;
    this.saidBehindAt = -Infinity;
    this.wonIn = null;

    this.stats = { dropped: 0, shots: 0, hits: 0, hurts: 0, seconds: 0, wingsSeconds: 0 };
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  begin() {
    this.state = 'flying';
    this.speed = this.pace.speed;
    this.fill();
  }

  get dropped() {
    return this.stats.dropped;
  }

  get left() {
    return this.total - this.stats.dropped;
  }

  get flying() {
    return this.enemies.filter(({ state }) => state === 'flying');
  }

  get forward() {
    return forwardOf(this.heading, this.pitch);
  }

  /** Where the camera is and where it's looking, in the picture and in deciding what's in the ring. */
  get view() {
    const forward = this.forward;
    const size = Math.hypot(-forward.x * forward.y, 1 - forward.y * forward.y, -forward.z * forward.y) || 1;
    const up = { x: (-forward.x * forward.y) / size, y: (1 - forward.y * forward.y) / size, z: (-forward.z * forward.y) / size };
    return {
      forward,
      up,
      eye: {
        x: this.x - forward.x * CAMERA.back + up.x * CAMERA.up,
        y: this.y - forward.y * CAMERA.back + up.y * CAMERA.up,
        z: this.z - forward.z * CAMERA.back + up.z * CAMERA.up,
      },
    };
  }

  /** How far off the middle of the view something is, as an angle, and how far away. */
  offAim(thing, view = this.view) {
    const dx = thing.x - view.eye.x;
    const dy = thing.y - view.eye.y;
    const dz = thing.z - view.eye.z;
    const away = Math.hypot(dx, dy, dz) || 1;
    const along = (dx * view.forward.x + dy * view.forward.y + dz * view.forward.z) / away;
    return { angle: Math.acos(clamp(along, -1, 1)), away };
  }

  /* ---------- other planes ---------- */

  fill() {
    while (this.waiting > 0 && this.flying.length < MOST_AT_ONCE) this.spawn();
  }

  spawn() {
    const { random } = this;
    this.waiting -= 1;
    const away = between(random, ENEMY.spawnAway);
    const side = between(random, ENEMY.spawnAngle) * (random() < 0.5 ? -1 : 1);
    const direction = this.heading + side;
    const x = this.x + Math.sin(direction) * away;
    const z = this.z - Math.cos(direction) * away;
    const enemy = {
      index: this.nextPilot,
      x,
      z,
      y: this.y + between(random, ENEMY.upDown),
      heading: this.heading + Math.PI + (random() - 0.5),
      pitch: 0,
      roll: 0,
      speed: this.pace.speed * ENEMY.speed,
      state: 'flying',
      hitsLeft: this.level.enemyHits,
      hitLeft: 0,
      mode: 'cross',
      modeLeft: 0,
      way: null,
      burstLeft: 0,
      shotIn: 0,
      fireIn: 0.8,
      dodgeLeft: 0,
      fallLeft: 0,
    };
    keepInside(enemy);
    this.nextPilot += 1;
    this.enemies.push(enemy);
    this.emit('spawn', { enemy });
  }

  /** Somewhere for a plane to fly to, out in front of the child, so it's there to be hunted. */
  pickWay(enemy, { dodging = false } = {}) {
    const { random, forward } = this;
    const ahead = between(random, dodging ? ENEMY.dodgeAhead : ENEMY.ahead);
    const across = between(random, dodging ? ENEMY.dodgeAcross : ENEMY.across) * (random() < 0.5 ? -1 : 1);
    const x = this.x + forward.x * ahead + forward.z * across;
    const z = this.z + forward.z * ahead - forward.x * across;
    const way = { x, z, y: this.y + forward.y * ahead + between(random, ENEMY.upDown) };
    keepInside(way);
    way.y = Math.max(way.y, floorAt(way.x, way.z) + 14);
    enemy.way = way;
    enemy.modeLeft = 7;
  }

  flyEnemyTowards(enemy, target, share, dt) {
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const dz = target.z - enemy.z;
    const wanted = headingTo(dx, dz);
    const turn = clamp(turnBetween(wanted, enemy.heading), -ENEMY.turn * dt, ENEMY.turn * dt);
    enemy.heading += turn;
    enemy.pitch = damp(enemy.pitch, clamp(Math.atan2(dy, Math.hypot(dx, dz) || 1), -ENEMY.pitch, ENEMY.pitch), 2, dt);
    const sharpness = dt > 0 ? clamp(turn / (ENEMY.turn * dt), -1, 1) : 0;
    enemy.roll = damp(enemy.roll, sharpness * FLY.roll * 0.85, 4, dt);
    const forward = forwardOf(enemy.heading, enemy.pitch);
    const speed = this.pace.speed * share;
    enemy.x += forward.x * speed * dt;
    enemy.y += forward.y * speed * dt;
    enemy.z += forward.z * speed * dt;
    keepInside(enemy);
  }

  shootAtChild(enemy) {
    const { random } = this;
    const hit = random() < this.level.hitChance;
    const miss = hit ? 0 : ENEMY.miss;
    const to = {
      x: this.x + (random() - 0.5) * miss * 2 + (hit ? 0 : Math.sign(random() - 0.5) * miss * 0.5),
      y: this.y + (random() - 0.5) * miss * 2,
      z: this.z + (random() - 0.5) * miss * 2,
    };
    const away = Math.hypot(to.x - enemy.x, to.y - enemy.y, to.z - enemy.z) || 1;
    this.shots.push({
      mine: false,
      x: enemy.x,
      y: enemy.y,
      z: enemy.z,
      dx: (to.x - enemy.x) / away,
      dy: (to.y - enemy.y) / away,
      dz: (to.z - enemy.z) / away,
      left: away / ENEMY.shotSpeed,
      hit,
    });
    this.emit('enemy-shot', { enemy });
  }

  /** The hunter's guns, in short bursts, whenever the child is in front of them. */
  huntWithGuns(enemy, away, dt) {
    if (enemy.burstLeft > 0) {
      enemy.shotIn -= dt;
      if (enemy.shotIn <= 0) {
        enemy.burstLeft -= 1;
        enemy.shotIn = ENEMY.shotEvery;
        this.shootAtChild(enemy);
        if (enemy.burstLeft === 0) enemy.fireIn = ENEMY.restAfterBurst;
      }
      return;
    }
    enemy.fireIn -= dt;
    if (enemy.fireIn > 0 || away > RANGE) return;
    const forward = forwardOf(enemy.heading, enemy.pitch);
    const along = ((this.x - enemy.x) * forward.x + (this.y - enemy.y) * forward.y + (this.z - enemy.z) * forward.z) / (away || 1);
    if (Math.acos(clamp(along, -1, 1)) <= ENEMY.aim) enemy.burstLeft = this.level.burst;
  }

  moveEnemies(dt) {
    const { forward } = this;
    for (const enemy of this.enemies) {
      enemy.hitLeft = Math.max(0, enemy.hitLeft - dt);
      enemy.dodgeLeft = Math.max(0, enemy.dodgeLeft - dt);
      if (enemy.state === 'falling') {
        enemy.fallLeft -= dt;
        enemy.pitch = damp(enemy.pitch, -1, 1.2, dt);
        enemy.roll += dt * 2.4;
        enemy.heading += dt * 0.5;
        const fall = forwardOf(enemy.heading, enemy.pitch);
        const speed = this.pace.speed * 0.8;
        enemy.x += fall.x * speed * dt;
        enemy.y = Math.max(enemy.y + fall.y * speed * dt, 0);
        enemy.z += fall.z * speed * dt;
        if (enemy.fallLeft <= 0) enemy.state = 'gone';
        continue;
      }
      if (enemy.state !== 'flying') continue;

      const away = Math.hypot(this.x - enemy.x, this.y - enemy.y, this.z - enemy.z);
      const behindChild = (enemy.x - this.x) * forward.x + (enemy.y - this.y) * forward.y + (enemy.z - this.z) * forward.z < 0;

      if (enemy.mode === 'hunt') {
        enemy.modeLeft -= dt;
        if (this.resting || enemy.modeLeft <= 0 || away < ENEMY.passed) {
          enemy.mode = 'cross';
          enemy.way = null;
        } else {
          const lead = this.speed * 0.5;
          this.flyEnemyTowards(enemy, { x: this.x + forward.x * lead, y: this.y + forward.y * lead, z: this.z + forward.z * lead }, ENEMY.huntSpeed, dt);
          this.huntWithGuns(enemy, away, dt);
          continue;
        }
      }

      enemy.modeLeft -= dt;
      if (!enemy.way || enemy.modeLeft <= 0 || Math.hypot(enemy.x - enemy.way.x, enemy.y - enemy.way.y, enemy.z - enemy.way.z) < ENEMY.reached) this.pickWay(enemy);
      const share = enemy.dodgeLeft > 0 ? ENEMY.dodgeSpeed : behindChild && away > 90 ? ENEMY.catchUp : ENEMY.speed;
      this.flyEnemyTowards(enemy, enemy.way, share, dt);
    }
    this.enemies = this.enemies.filter(({ state }) => state !== 'gone');
  }

  /** Every so often one of them turns and comes after the child. */
  startHunts(dt) {
    if (this.resting) return;
    this.huntIn -= dt;
    if (this.huntIn > 0) return;
    this.huntIn = between(this.random, this.level.huntEvery);
    const hunting = this.flying.some(({ mode }) => mode === 'hunt');
    if (hunting) return;
    const free = this.flying.filter((enemy) => enemy !== this.locked);
    if (!free.length) return;
    const hunter = free[Math.floor(this.random() * free.length)];
    hunter.mode = 'hunt';
    hunter.modeLeft = ENEMY.huntSeconds;
    hunter.fireIn = 0.5;
    hunter.burstLeft = 0;
  }

  /** Which plane, if any, is hunting from where the child can't see it. */
  watchBehind() {
    const { forward } = this;
    const hunter = this.flying.find(({ mode }) => mode === 'hunt') ?? null;
    this.hunted = hunter;
    if (!hunter || this.time - this.saidBehindAt < BEHIND_EVERY) return;
    const dx = hunter.x - this.x;
    const dy = hunter.y - this.y;
    const dz = hunter.z - this.z;
    if (dx * forward.x + dy * forward.y + dz * forward.z < 0 && Math.hypot(dx, dy, dz) < 170) {
      this.saidBehindAt = this.time;
      this.emit('behind', { enemy: hunter });
    }
  }

  /* ---------- the guns ---------- */

  /** The plane in the ring that's nearest the middle of it, if there is one. */
  findTarget() {
    const view = this.view;
    let found = null;
    let nearest = Infinity;
    for (const enemy of this.flying) {
      const { angle, away } = this.offAim(enemy, view);
      if (away <= RANGE && angle <= this.level.aim && angle < nearest) {
        found = enemy;
        nearest = angle;
      }
    }
    return found;
  }

  shoot(target) {
    const side = this.stats.shots % 2 ? 1 : -1;
    const { forward } = this;
    this.shots.push({
      mine: true,
      x: this.x + forward.z * side * -3,
      y: this.y,
      z: this.z + forward.x * side * 3,
      dx: forward.x,
      dy: forward.y,
      dz: forward.z,
      left: SHOT.life,
      target,
    });
    this.stats.shots += 1;
    this.shotIn = SHOT.every;
  }

  drop(enemy) {
    enemy.state = 'falling';
    enemy.mode = 'falling';
    enemy.fallLeft = ENEMY.fallSeconds;
    this.stats.dropped += 1;
    this.emit('down', { enemy, dropped: this.stats.dropped, left: this.left });
    if (this.left === 0) this.wonIn = WON_AFTER;
    this.spawnIn = ENEMY.nextIn;
  }

  hit(enemy) {
    if (enemy.state !== 'flying') return;
    enemy.hitsLeft -= 1;
    enemy.hitLeft = 0.25;
    this.stats.hits += 1;
    this.emit('hit', { enemy });
    if (enemy.hitsLeft <= 0) {
      this.drop(enemy);
      return;
    }
    // Being shot at, it stops hunting and tries to get out of the ring, so it has to be chased.
    if (enemy.dodgeLeft === 0) {
      enemy.mode = 'cross';
      enemy.dodgeLeft = ENEMY.dodgeSeconds;
      this.pickWay(enemy, { dodging: true });
    }
  }

  hurt() {
    this.stats.hurts += 1;
    this.hearts -= 1;
    this.sinceHurt = 0;
    this.hurtLeft = 0.8;
    this.emit('hurt', { hearts: this.hearts });
    if (this.hearts > 0) return;
    if (this.level.canLose) this.lose();
    else this.hearts = 1;
  }

  lose() {
    this.state = 'lost';
    this.setFiring(false);
    this.emit('lost', { dropped: this.stats.dropped });
  }

  moveShots(dt) {
    for (const shot of this.shots) {
      shot.left -= dt;
      if (shot.mine) {
        const { target } = shot;
        // Tracers bend towards what they're fired at, as lining up exactly isn't the point.
        const dx = target.x - shot.x;
        const dy = target.y - shot.y;
        const dz = target.z - shot.z;
        const away = Math.hypot(dx, dy, dz) || 1;
        shot.dx = dx / away;
        shot.dy = dy / away;
        shot.dz = dz / away;
        const step = SHOT.speed * dt;
        shot.x += shot.dx * step;
        shot.y += shot.dy * step;
        shot.z += shot.dz * step;
        if (away <= SHOT.reach + step) {
          shot.left = 0;
          this.hit(target);
        }
      } else {
        const step = ENEMY.shotSpeed * dt;
        shot.x += shot.dx * step;
        shot.y += shot.dy * step;
        shot.z += shot.dz * step;
        if (shot.left <= 0 && shot.hit && !this.resting && this.state === 'flying') this.hurt();
      }
    }
    this.shots = this.shots.filter(({ left }) => left > 0);
  }

  setFiring(on) {
    if (on === this.firing) return;
    this.firing = on;
    this.emit('firing', { on });
  }

  /* ---------- the child's plane ---------- */

  /** The plane nearest to being lined up, for the help with aiming. */
  nearestAhead() {
    const view = this.view;
    let found = null;
    let nearest = Infinity;
    for (const enemy of this.flying) {
      const { angle, away } = this.offAim(enemy, view);
      if (away <= RANGE * 1.3 && angle < nearest) {
        found = enemy;
        nearest = angle;
      }
    }
    return found ? { enemy: found, angle: nearest } : null;
  }

  /** Where it's pointing, from the arms, with the limits and the help with aiming on top. */
  steer(dt, { out, bank, climb }) {
    const { level, resting } = this;
    const steering = out && Math.abs(bank) > FLY.deadZone ? bank : 0;
    const wantedRoll = resting ? FLY.restTurn * FLY.roll * 2 : steering * FLY.roll;
    this.roll = damp(this.roll, wantedRoll, FLY.rollEase, dt);
    this.heading += (this.roll / FLY.roll) * FLY.turn * dt;

    const target = this.nearestAhead();
    let wantedPitch = this.climbing && out && !resting ? climb * FLY.pitch : 0;
    if (target) {
      const dx = target.enemy.x - this.x;
      const dz = target.enemy.z - this.z;
      const elevation = Math.atan2(target.enemy.y - this.y, Math.hypot(dx, dz) || 1);
      const close = target.angle <= level.aim * ASSIST.cone;
      if (!this.climbing && !resting) wantedPitch = clamp(elevation, -ASSIST.autoHeight, ASSIST.autoHeight);
      else if (close && !resting) wantedPitch += clamp(elevation - this.pitch, -ASSIST.pitch, ASSIST.pitch) * level.assist;
      if (close && !resting) this.heading += clamp(turnBetween(headingTo(dx, dz), this.heading), -0.5, 0.5) * ASSIST.turn * level.assist * dt;
    }

    // The ground, a little ahead as well as here, so that a hill is climbed in good time.
    const forward = this.forward;
    let floor = floorAt(this.x, this.z);
    for (const seconds of LIMITS.aheadLook) {
      const ahead = this.pace.speed * seconds;
      floor = Math.max(floor, floorAt(this.x + forward.x * ahead, this.z + forward.z * ahead));
    }
    const aboveFloor = this.y - floor;
    if (aboveFloor < LIMITS.floorRoom) wantedPitch = Math.max(wantedPitch, LIMITS.pullUp * (1 - Math.max(0, aboveFloor) / LIMITS.floorRoom));
    const belowCeiling = WORLD.ceiling - this.y;
    if (belowCeiling < LIMITS.ceilingRoom) wantedPitch = Math.min(wantedPitch, -LIMITS.pushDown * (1 - belowCeiling / LIMITS.ceilingRoom));
    wantedPitch = clamp(wantedPitch, -FLY.pitch, FLY.pitch);
    this.pitch = damp(this.pitch, wantedPitch, FLY.pitchEase, dt);

    // The outer edge: the nearer it gets, the more the plane turns itself back towards the island.
    const fromMiddle = Math.hypot(this.x, this.z);
    this.atLimit = clamp((fromMiddle - WORLD.turnBackFrom) / (WORLD.limit - WORLD.turnBackFrom), 0, 1);
    if (this.atLimit > 0) {
      this.heading += turnBetween(headingTo(-this.x, -this.z), this.heading) * this.atLimit * LIMITS.turnBack * dt;
    }
  }

  moveChild(dt, out) {
    const { resting } = this;
    const share = (out ? 1 : resting ? FLY.restShare : FLY.glide) * (1 - Math.sin(this.pitch) * FLY.climbCost);
    this.speed = damp(this.speed, this.pace.speed * share, 2, dt);
    const forward = this.forward;
    this.x += forward.x * this.speed * dt;
    this.y += forward.y * this.speed * dt;
    this.z += forward.z * this.speed * dt;
    keepInside(this);
  }

  /** One frame. out is both arms being held out, bank which way they tip and climb how high they are. */
  update(dt, { out = false, bank = 0, climb = 0 } = {}) {
    this.time += dt;
    if (this.state === 'ready') return;
    if (this.state !== 'flying') {
      // It carries on flying, in a big gentle circle, once it's all over.
      this.steer(dt, { out: true, bank: 0.3, climb: 0 });
      this.moveChild(dt, true);
      this.moveEnemies(dt);
      this.moveShotsAfter(dt);
      return;
    }

    this.downFor = out ? 0 : this.downFor + dt;
    const resting = this.downFor > REST_AFTER;
    if (resting !== this.resting) {
      this.resting = resting;
      if (resting) this.shots = this.shots.filter(({ mine }) => mine);
      this.emit('resting', { on: resting });
    }

    this.stats.seconds += dt;
    if (out) this.stats.wingsSeconds += dt;
    this.hurtLeft = Math.max(0, this.hurtLeft - dt);
    this.sinceHurt += dt;
    if (this.hearts < HEARTS && this.sinceHurt >= this.level.healAfter) {
      this.hearts += 1;
      this.sinceHurt = 0;
      this.emit('healed', { hearts: this.hearts });
    }

    this.steer(dt, { out, bank, climb });
    this.moveChild(dt, out);

    if (this.spawnIn > 0) {
      this.spawnIn -= dt;
      if (this.spawnIn <= 0) this.fill();
    }
    this.moveEnemies(dt);
    this.startHunts(dt);
    this.watchBehind();

    this.locked = resting ? null : this.findTarget();
    this.setFiring(Boolean(this.locked));
    this.shotIn = Math.max(0, this.shotIn - dt);
    if (this.locked && this.shotIn === 0) this.shoot(this.locked);
    this.moveShots(dt);
    if (this.state !== 'flying') return;

    if (this.wonIn !== null) {
      this.wonIn -= dt;
      if (this.wonIn <= 0) {
        this.state = 'won';
        this.locked = null;
        this.setFiring(false);
        this.emit('won', { dropped: this.stats.dropped });
      }
    }
  }

  /** What's already in the air when it's all over just carries on, and harms nobody. */
  moveShotsAfter(dt) {
    for (const shot of this.shots) {
      shot.left -= dt;
      const step = (shot.mine ? SHOT.speed : ENEMY.shotSpeed) * dt;
      shot.x += shot.dx * step;
      shot.y += shot.dy * step;
      shot.z += shot.dz * step;
    }
    this.shots = this.shots.filter(({ left }) => left > 0);
  }
}
