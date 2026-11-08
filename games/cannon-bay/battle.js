// The rules of Cannon Bay. No screen, camera or sound in this file, so it all runs in the unit tests.
//
// Pirates have come for the island's treasure, and the child's ship drives them off. One hand does
// everything. Moving it from side to side turns the wheel. Opening it raises the sails, and the wider
// it's open the faster the ship goes, which is the sustained opening being practised. Closing it lowers
// them, and the ship slows and drifts, and that's never a failure.
//
// The cannons fire by themselves, at any pirate ship in the firing zone on either side, as ships fire
// from their sides. They only fire with the hand seen to be open, unless a grown-up has set them to
// fire always, and even then only with the hand in view. Pirates hunt the child's ship and turn side on
// to fire slow cannonballs in high arcs. Nobody gets hurt: a beaten ship lowers its sails and slowly
// sinks, and its crew rows away in a lifeboat. A hand that's gone or stays closed is a rest: the
// pirates stop firing and sail in circles, and nothing bad can happen.
import { ramp, stepsAt } from '../../core/levels.js';
import { WORLD } from '../sky-wings/island-map.js';
import { getChart } from './chart.js';

const degrees = (value) => (value * Math.PI) / 180;

/**
 * What each level changes, from level 1, which is the game as it always was, up to level 10. The
 * numbers are shares of, or additions to, the speed and difficulty a grown-up chose, so a level never
 * changes those choices, the number of ships, the firing zones, the help with lining up, the cannons
 * firing always, or Gentle being impossible to lose. Resting stops everything new here, just as it
 * stops the rest.
 */
export function levelPlan(level = 1) {
  return {
    fireEvery: ramp(level, 1, 0.7), // Pirates reload quicker.
    apart: ramp(level, 1, 0.7), // And broadsides come closer together.
    chase: ramp(level, 1, 1.15), // They sail up to 15% faster when chasing or running.
    side: ramp(level, 1, 0.75), // They stay alongside for less long before sailing off, never under three quarters as long.
    runEvery: ramp(level, 0.33, 0.22), // Being hit, they run for it more often: this is a share of their hits.
    weave: level >= 3, // From level 3, a pirate running for it zigzags, so it takes more steering to stay with.
    sloops: level >= 5, // From level 5, every third pirate sails a quick little sloop.
    atOnce: stepsAt(level, { 1: 0, 6: 1 }), // From level 6, four pirates at once rather than three.
    balls: stepsAt(level, { 1: 0, 7: 1 }), // From level 7, each broadside has one more ball.
    flagship: level >= 9, // From level 9, the last captain sails a big flagship.
  };
}

// The kinds of pirate ship: how many of the level's hits beat it, how fast it is, and how big it looks.
export const SHIP_KINDS = {
  ship: { hits: 1, speed: 1, size: 1, balls: 0 },
  sloop: { hits: 0.6, speed: 1.2, size: 0.72, balls: 0 },
  flagship: { hits: 1.5, speed: 1, size: 1.3, balls: 1 },
};

// How fast the child's ship can go, in units a second.
export const PACES = {
  slow: { speed: 24 },
  medium: { speed: 32 },
  fast: { speed: 42 },
};

// zone is the firing zone on each side: how far round from the bow it starts and ends, and how far out
// it reaches. shipHits is how many hits beat a ship, hitChance how many of their cannonballs are aimed
// true, and fireEvery how long a pirate takes to reload, with apart the least time between any two
// broadsides. assist is how much the ship helps to keep a nearby pirate alongside. canLose says whether
// running out of hearts ends the battle.
export const LEVELS = {
  gentle: { zone: { from: degrees(20), to: degrees(135), reach: 172 }, shipHits: 30, hitChance: 0.12, fireEvery: [7, 10], balls: 2, apart: 4.5, healAfter: 6, assist: 1, canLose: false },
  medium: { zone: { from: degrees(26), to: degrees(125), reach: 155 }, shipHits: 36, hitChance: 0.14, fireEvery: [6, 9], balls: 2, apart: 3.6, healAfter: 8, assist: 0.6, canLose: true },
  tough: { zone: { from: degrees(38), to: degrees(115), reach: 135 }, shipHits: 44, hitChance: 0.14, fireEvery: [5, 7], balls: 3, apart: 3.6, healAfter: 10, assist: 0.3, canLose: true },
};

export const HEARTS = 5;
export const MOST_AT_ONCE = 3;
export const REST_AFTER = 4; // Seconds of the hand not being open before it counts as a rest.
export const HULL = { half: 17, beam: 6 }; // Half its length and half its width.
export const GUN_SPOTS = [9, 3, -3, -9]; // Along the side of a ship, forward of its middle.
export const GUN_HEIGHT = 5.5;

const START = { x: -120, z: 860, heading: 0 };

const SAIL = {
  raise: 2.2,
  lower: 1.4,
  lowest: 0.62, // How much of its speed a ship has with the hand only just open.
  driveFrom: 0.8, // snapshot.drive when the hand is only just open.
  drift: 0.09, // How much of its speed it keeps with the sails down.
  speedUp: 0.9,
  slowDown: 0.55,
  turn: 0.62, // Radians a second at full wheel.
  turnDrifting: 0.45, // How much of that it can do with hardly any way on.
  wheelEase: 7,
};
const COAST = { keep: 66, least: 30, lookBase: 24, lookSeconds: 1.7, turn: 2.2, tilt: 0.25, tiltMore: 0.5, push: 70 };
const EDGE = { turnBackFrom: WORLD.limit - 110, turn: 1.4, sayEvery: 18 };
const ASSIST = { from: 1.5, middle: degrees(78), most: 0.7, turn: 0.42, against: 0.65 };
const SHOT = { every: 0.45, speed: 170, shortest: 0.3, longest: 1.25, arc: 4, arcPerUnit: 0.09, height: 6.5, spread: 9 };
const BALL = { speed: 46, shortest: 2, longest: 3.2, arc: 30, arcPerUnit: 0.17, every: 0.24, near: 4, miss: [7, 26], missAlong: 26, hitWiden: 3 };
const PIRATE = {
  turn: 0.52,
  // How fast they go, as shares of how fast the child's ship can go, so that they can always catch up.
  chase: 1.12,
  catchUp: 1.35,
  keener: 0.04, // How much faster it goes for each second of the chase.
  keenestMore: 0.6,
  far: 260,
  closeEnough: 150,
  leaveRange: 235,
  alongside: 95, // How far out they sit when side on to the child.
  alongsideMore: 26, // A bit further for each one, so that they're not on top of each other.
  sideSeconds: [5, 8],
  awaySeconds: [4.5, 6.5],
  awayTo: { away: [150, 250], angle: [degrees(18), degrees(75)] }, // Out in front, to be chased.
  awayShare: 1,
  beamWithin: degrees(35),
  circle: 0.4,
  circleTurn: 0.22,
  relocateAway: 680,
  relocateUnhit: 40,
  stuckAfter: 5,
  stuckAway: 150,
  // With the child's ship going round and round, one that hasn't been hit for a while slows down to be
  // caught, and then tries coming closer again. Otherwise the two of them could go on chasing each
  // other's tails for ever.
  slowsEvery: 22,
  slowsFor: 10,
  slowsWithin: 230,
  slowsWhenTurning: 0.4,
  slowShare: 0.3,
  firstBroadside: 7,
  firstFire: [1.5, 4],
  afterRest: 1.8,
  sinkSeconds: 7,
  sailsDown: 0.7,
  nextIn: 1,
  apart: 46,
};
const WEAVE = { turn: 0.75, every: 1.4 }; // How far each way, in radians, and how quickly a weaving pirate turns.
const GIVE_WAY = { within: 82, cone: degrees(42), turn: 2.2 }; // The child's ship steers round a pirate right in front of it.
// Nobody sails into the place the child is watching from, behind their ship, and blocks the view.
const VIEW_KEPT_CLEAR = { behind: 72, radius: 50 };
const SPAWN = { away: [270, 340], angle: [degrees(15), degrees(62)], room: 60, tries: 24 };
const ROW = { speed: 7, seconds: 13, startOut: 20, aside: 1.05 };
// What a beaten ship leaves floating: a line of gold leading from where it went down towards the child.
const GOLD = { coins: 6, from: 22, apart: 12, reach: 13, seconds: 26, least: 10 };
const WON_AFTER = 2.6;
const AFTER_WIN_WHEEL = 0.3;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const between = (random, [low, high]) => low + random() * (high - low);
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
/** The shortest way round from one direction to another. */
const turnBetween = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const headingTo = (dx, dz) => Math.atan2(dx, -dz);

/** Which way a ship is pointing. Heading 0 is north, along -z, and a turn to the right adds to it. */
export const forwardOf = (heading) => ({ x: Math.sin(heading), z: -Math.cos(heading) });
/** Its right-hand side. */
export const rightOf = (heading) => ({ x: Math.cos(heading), z: Math.sin(heading) });

/**
 * Turns anything on the water along the coast as it nears it, the nearer the more, so that it goes
 * round rather than hitting it, and back from the edge of the world. A ship has a little look ahead too,
 * further the faster it's going, so that it starts in good time.
 */
function steerRound(ship, dt) {
  const chart = getChart();
  const forward = forwardOf(ship.heading);
  const look = COAST.lookBase + ship.speed * COAST.lookSeconds;
  const roomHere = chart.room(ship.x, ship.z);
  let room = roomHere;
  let fromX = ship.x;
  let fromZ = ship.z;
  for (const share of [0.33, 0.66, 1]) {
    const x = ship.x + forward.x * look * share;
    const z = ship.z + forward.z * look * share;
    const there = chart.room(x, z);
    // Land further ahead doesn't matter as much yet.
    const counted = there + look * share * 0.5;
    if (counted < room) {
      room = counted;
      // With land close by already, what matters is getting away from that.
      if (there > 0 && roomHere > COAST.keep) {
        fromX = x;
        fromZ = z;
      }
    }
    if (there <= 0) break;
  }
  ship.coast = clamp((COAST.keep - room) / (COAST.keep - COAST.least), 0, 1);
  if (ship.coast > 0) {
    const out = chart.away(fromX, fromZ);
    const tilt = COAST.tilt + COAST.tiltMore * ship.coast;
    if (forward.x * out.x + forward.z * out.z < Math.sin(tilt)) {
      const outward = headingTo(out.x, out.z);
      const oneWay = turnBetween(outward + Math.PI / 2 - tilt, ship.heading);
      const otherWay = turnBetween(outward - Math.PI / 2 + tilt, ship.heading);
      const way = Math.abs(oneWay) < Math.abs(otherWay) ? oneWay : otherWay;
      ship.heading += clamp(way, -1, 1) * COAST.turn * ship.coast * dt;
    }
  }
  const fromMiddle = Math.hypot(ship.x, ship.z);
  ship.atLimit = clamp((fromMiddle - EDGE.turnBackFrom) / (WORLD.limit - EDGE.turnBackFrom), 0, 1);
  if (ship.atLimit > 0) ship.heading += turnBetween(headingTo(-ship.x, -ship.z), ship.heading) * ship.atLimit * EDGE.turn * dt;
}

/** However it got there, nothing can be closer to the land than this, or further out than the edge. */
function keepOnTheWater(ship, dt) {
  const chart = getChart();
  const room = chart.room(ship.x, ship.z);
  if (room < COAST.least) {
    const out = chart.away(ship.x, ship.z);
    const push = Math.min(COAST.least - room, COAST.push * dt);
    ship.x += out.x * push;
    ship.z += out.z * push;
  }
  const fromMiddle = Math.hypot(ship.x, ship.z);
  if (fromMiddle > WORLD.limit) {
    ship.x *= WORLD.limit / fromMiddle;
    ship.z *= WORLD.limit / fromMiddle;
  }
}

export class Battle {
  /** ships is how many there are to beat. pace, level and cannons are the grown-ups' settings. */
  constructor({ ships = 6, pace = 'slow', level = 'gentle', levelNumber = 1, cannons = 'open', random = Math.random, onEvent = () => {} } = {}) {
    this.random = random;
    this.onEvent = onEvent;
    this.total = ships;
    // The level being played, from 1 to 10, which makes it harder within the grown-up's choices.
    this.levelNumber = levelNumber;
    this.plan = levelPlan(levelNumber);
    this.setPace(pace);
    this.setLevel(level);
    this.cannons = cannons;

    this.state = 'ready'; // ready, sailing, won, lost
    this.time = 0;
    this.x = START.x;
    this.z = START.z;
    this.heading = START.heading;
    this.speed = 0;
    this.sails = 0;
    this.wheel = 0;
    this.turning = 0;
    this.coast = 0;
    this.atLimit = 0;
    this.saidLimitAt = -Infinity;

    this.hearts = HEARTS;
    this.sinceHurt = 0;
    this.hurtLeft = 0;
    this.notOpenFor = 0;
    this.resting = false;
    this.open = false;
    this.wasOpen = false;
    this.canFire = false;

    this.pirates = [];
    this.waiting = ships; // Still to come.
    this.nextPirate = 0;
    this.spawnIn = 0;
    this.broadsideIn = PIRATE.firstBroadside;
    this.zones = { left: this.emptyZone(), right: this.emptyZone() };
    this.shots = []; // The child's.
    this.balls = []; // The pirates'.
    this.boats = [];
    this.coins = [];
    this.wonIn = null;

    this.stats = { beaten: 0, shots: 0, hits: 0, hurts: 0, seconds: 0, openSeconds: 0, openings: 0, crewsAway: 0, gold: 0 };
  }

  emptyZone() {
    return { target: null, inside: false, firing: false, reload: 0, nextGun: 0 };
  }

  setPace(pace) {
    this.pace = PACES[pace] ?? PACES.slow;
  }

  setLevel(level) {
    this.level = LEVELS[level] ?? LEVELS.gentle;
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  begin() {
    this.state = 'sailing';
    this.fill();
  }

  get beaten() {
    return this.stats.beaten;
  }

  get left() {
    return this.total - this.stats.beaten;
  }

  get afloat() {
    return this.pirates.filter(({ state }) => state === 'sailing');
  }

  get firing() {
    return this.zones.left.firing || this.zones.right.firing;
  }

  /* ---------- pirates ---------- */

  /** How many pirates there are about at once. */
  get mostAtOnce() {
    return MOST_AT_ONCE + this.plan.atOnce;
  }

  fill() {
    while (this.waiting > 0 && this.afloat.length < this.mostAtOnce) this.spawn();
  }

  /** What sort of ship the next pirate sails: the last is a flagship and every third a sloop, on the higher levels. */
  kindFor(index) {
    if (this.plan.flagship && index === this.total - 1) return 'flagship';
    if (this.plan.sloops && index % 3 === 1) return 'sloop';
    return 'ship';
  }

  /** Somewhere for a ship to come from, out in front of the child if there's water there. */
  findOpenWater() {
    const chart = getChart();
    const { random } = this;
    const fits = (x, z) => chart.room(x, z) >= SPAWN.room && Math.hypot(x, z) < WORLD.limit - 40;
    for (let attempt = 0; attempt < SPAWN.tries; attempt += 1) {
      // Out in front to begin with, and anywhere at all if that's all land.
      const spread = attempt < SPAWN.tries / 2 ? between(random, SPAWN.angle) : random() * Math.PI;
      const direction = this.heading + spread * (random() < 0.5 ? -1 : 1);
      const away = between(random, SPAWN.away);
      const x = this.x + Math.sin(direction) * away;
      const z = this.z - Math.cos(direction) * away;
      if (fits(x, z)) return { x, z };
    }
    const forward = forwardOf(this.heading);
    return { x: this.x + forward.x * SPAWN.away[0], z: this.z + forward.z * SPAWN.away[0] };
  }

  spawn() {
    const { random } = this;
    this.waiting -= 1;
    const { x, z } = this.findOpenWater();
    const kind = this.kindFor(this.nextPirate);
    const hits = Math.round(this.level.shipHits * SHIP_KINDS[kind].hits);
    const pirate = {
      index: this.nextPirate,
      kind,
      maxHits: hits,
      x,
      z,
      heading: headingTo(this.x - x, this.z - z) + (random() - 0.5),
      speed: this.pace.speed * PIRATE.chase,
      state: 'sailing',
      hitsLeft: hits,
      hitLeft: 0,
      mode: 'chase',
      modeLeft: 0,
      spot: null,
      runAt: hits * 0.66,
      childSide: random() < 0.5 ? -1 : 1, // Which side of the child's ship it comes up on.
      way: random() < 0.5 ? -1 : 1,
      fireIn: between(random, PIRATE.firstFire),
      chasing: 0,
      sinceHit: 0,
      pressed: 0,
      burstLeft: 0,
      burstIn: 0,
      burstSide: 1,
      sink: 0,
      sails: 1,
      turning: 0,
      coast: 0,
      atLimit: 0,
    };
    this.nextPirate += 1;
    this.pirates.push(pirate);
    this.emit('spawn', { pirate });
  }

  /** How much faster than usual this pirate sails when chasing or running for it: see levelPlan and SHIP_KINDS. */
  quicker(pirate) {
    return this.plan.chase * SHIP_KINDS[pirate.kind].speed;
  }

  /** Sails a pirate towards a direction, and round anything in the way. */
  sailPirate(pirate, wanted, share, dt) {
    const before = pirate.heading;
    pirate.heading += clamp(turnBetween(wanted, pirate.heading), -PIRATE.turn * dt, PIRATE.turn * dt);
    pirate.speed = damp(pirate.speed, this.pace.speed * share, 1.1, dt);
    steerRound(pirate, dt);
    const forward = forwardOf(pirate.heading);
    pirate.x += forward.x * pirate.speed * dt;
    pirate.z += forward.z * pirate.speed * dt;
    keepOnTheWater(pirate, dt);
    if (dt > 0) pirate.turning = damp(pirate.turning, clamp(turnBetween(pirate.heading, before) / (PIRATE.turn * dt), -1, 1), 3, dt);
  }

  /** Where a pirate wants to be, level with the child's ship and out to one side of it. */
  stationFor(pirate) {
    const chart = getChart();
    const across = rightOf(this.heading);
    const out = Math.min(PIRATE.alongside + (pirate.index % this.mostAtOnce) * PIRATE.alongsideMore, this.level.zone.reach * 0.85);
    const spot = (side) => ({ x: this.x + across.x * side * out, z: this.z + across.z * side * out });
    // With the child's ship turning hard, it can only keep up on the inside of the turn.
    if (Math.abs(this.turning) > 0.5) pirate.childSide = this.turning > 0 ? 1 : -1;
    const wanted = spot(pirate.childSide);
    if (chart.room(wanted.x, wanted.z) > 30) return wanted;
    pirate.childSide = -pirate.childSide;
    return spot(pirate.childSide);
  }

  /** Somewhere out in front of the child's ship, to sail to and be chased. */
  sendAway(pirate, seconds = between(this.random, PIRATE.awaySeconds)) {
    const { random } = this;
    const direction = this.heading + between(random, PIRATE.awayTo.angle) * (random() < 0.5 ? -1 : 1);
    const away = between(random, PIRATE.awayTo.away);
    pirate.spot = { x: this.x + Math.sin(direction) * away, z: this.z - Math.cos(direction) * away };
    pirate.mode = 'away';
    pirate.modeLeft = seconds;
  }

  movePirate(pirate, dt) {
    pirate.hitLeft = Math.max(0, pirate.hitLeft - dt);
    if (pirate.state === 'sinking') {
      this.sinkPirate(pirate, dt);
      return;
    }
    const dx = this.x - pirate.x;
    const dz = this.z - pirate.z;
    const away = Math.hypot(dx, dz);

    // Round the far side of the island is too far to wait for anyone, so it comes from somewhere nearer.
    pirate.pressed = pirate.coast > 0.25 ? pirate.pressed + dt : 0;
    pirate.sinceHit += dt;
    const stuck = pirate.pressed > PIRATE.stuckAfter && away > PIRATE.stuckAway;
    if (away > PIRATE.relocateAway || stuck || (pirate.sinceHit > PIRATE.relocateUnhit && away > PIRATE.closeEnough)) {
      const { x, z } = this.findOpenWater();
      Object.assign(pirate, { x, z, heading: headingTo(this.x - x, this.z - z), mode: 'chase', pressed: 0, chasing: 0, sinceHit: 0 });
      return;
    }
    if (this.resting) {
      pirate.mode = 'circle';
      this.sailPirate(pirate, pirate.heading + pirate.way * PIRATE.circleTurn, PIRATE.circle, dt);
      return;
    }
    if (pirate.mode === 'circle') pirate.mode = 'chase';

    pirate.fireIn -= dt;
    pirate.modeLeft -= dt;
    if (pirate.sinceHit % PIRATE.slowsEvery > PIRATE.slowsEvery - PIRATE.slowsFor && away < PIRATE.slowsWithin && Math.abs(this.turning) > PIRATE.slowsWhenTurning) {
      this.sailPirate(pirate, pirate.heading, PIRATE.slowShare, dt);
      const off = turnBetween(headingTo(dx, dz), pirate.heading);
      this.fireWhenSideOn(pirate, away, off, off >= 0 ? 1 : -1);
      this.carryOnFiring(pirate, dt);
      return;
    }
    if (pirate.mode === 'away') {
      const toX = pirate.spot.x - pirate.x;
      const toZ = pirate.spot.z - pirate.z;
      if (pirate.modeLeft <= 0 || Math.hypot(toX, toZ) < 30) pirate.mode = 'chase';
      else this.sailPirate(pirate, headingTo(toX, toZ) + this.weaving(pirate), PIRATE.awayShare * this.quicker(pirate), dt);
    }
    if (pirate.mode === 'chase') {
      if (away < PIRATE.closeEnough) {
        pirate.mode = 'side';
        pirate.chasing = 0;
        pirate.modeLeft = between(this.random, PIRATE.sideSeconds) * this.plan.side;
        // The side it's on already, rather than crossing the child's bows to get to the other.
        const across = rightOf(this.heading);
        pirate.childSide = -dx * across.x - dz * across.z >= 0 ? 1 : -1;
      } else {
        // Straight for the child, and for a place beside them from further off, a little faster the
        // longer it goes on, so that nobody can be left going round and round out of reach.
        pirate.chasing += dt;
        const station = away > PIRATE.far ? this.stationFor(pirate) : this;
        const share = ((away > PIRATE.far ? PIRATE.catchUp : PIRATE.chase) + Math.min(PIRATE.keenestMore, pirate.chasing * PIRATE.keener)) * this.quicker(pirate);
        this.sailPirate(pirate, headingTo(station.x - pirate.x, station.z - pirate.z), share, dt);
      }
    }
    if (pirate.mode === 'side') {
      if (away > PIRATE.leaveRange) {
        pirate.mode = 'chase';
      } else if (pirate.modeLeft <= 0) {
        this.sendAway(pirate);
      } else {
        this.sailAlongside(pirate, dt);
      }
    }
    this.carryOnFiring(pirate, dt);
  }

  /** On the higher levels, a pirate running for it zigzags from side to side. */
  weaving(pirate) {
    return this.plan.weave ? Math.sin(this.time * WEAVE.every + pirate.index * 1.7) * WEAVE.turn : 0;
  }

  /** Side on to the child and going the same way, as ships really did, and firing when it's ready. */
  sailAlongside(pirate, dt) {
    const station = this.stationFor(pirate);
    const toX = station.x - pirate.x;
    const toZ = station.z - pirate.z;
    const gap = Math.hypot(toX, toZ);
    const keepUp = this.speed / this.pace.speed;
    const forward = forwardOf(pirate.heading);
    const ahead = toX * forward.x + toZ * forward.z;
    // Well off its station it heads for it, and on it it goes the same way as the child's ship.
    const share = Math.max(0.2, Math.min(PIRATE.catchUp, keepUp + ahead * 0.012));
    const onStation = clamp(gap / 40, 0, 1);
    const wanted = this.heading + turnBetween(headingTo(toX, toZ), this.heading) * onStation;
    this.sailPirate(pirate, wanted, share, dt);
    const dx = this.x - pirate.x;
    const dz = this.z - pirate.z;
    const off = turnBetween(headingTo(dx, dz), pirate.heading);
    this.fireWhenSideOn(pirate, Math.hypot(dx, dz), off, off >= 0 ? 1 : -1);
  }

  fireWhenSideOn(pirate, away, off, facing) {
    if (pirate.burstLeft > 0 || pirate.fireIn > 0 || this.broadsideIn > 0 || away > PIRATE.leaveRange) return;
    if (Math.abs(Math.abs(off) - Math.PI / 2) > PIRATE.beamWithin) return;
    pirate.burstLeft = this.level.balls + this.plan.balls + SHIP_KINDS[pirate.kind].balls;
    pirate.burstIn = 0;
    pirate.burstSide = facing;
    pirate.fireIn = between(this.random, this.level.fireEvery) * this.plan.fireEvery;
    this.broadsideIn = this.level.apart * this.plan.apart;
  }

  carryOnFiring(pirate, dt) {
    if (pirate.burstLeft <= 0) return;
    pirate.burstIn -= dt;
    if (pirate.burstIn > 0) return;
    pirate.burstLeft -= 1;
    pirate.burstIn = BALL.every;
    this.fireBall(pirate);
  }

  /** A slow ball in a high arc, to where the child's ship looks like being when it lands. */
  fireBall(pirate) {
    const { random } = this;
    const side = rightOf(pirate.heading);
    const forward = forwardOf(pirate.heading);
    const along = GUN_SPOTS[pirate.burstLeft % GUN_SPOTS.length];
    const from = {
      x: pirate.x + forward.x * along + side.x * pirate.burstSide * HULL.beam,
      y: GUN_HEIGHT,
      z: pirate.z + forward.z * along + side.z * pirate.burstSide * HULL.beam,
    };
    const dx = this.x - from.x;
    const dz = this.z - from.z;
    const away = Math.hypot(dx, dz);
    const seconds = clamp(away / BALL.speed, BALL.shortest, BALL.longest);
    // Most land just beside the ship, near enough to see, and only some are aimed true.
    const mine = forwardOf(this.heading);
    const across = rightOf(this.heading);
    const aimedTrue = random() < this.level.hitChance;
    const out = aimedTrue ? (random() - 0.5) * BALL.near : (HULL.beam + BALL.hitWiden + between(random, BALL.miss)) * (random() < 0.5 ? -1 : 1);
    const ahead = (random() - 0.5) * (aimedTrue ? BALL.near : BALL.missAlong) + this.speed * seconds;
    const to = {
      x: this.x + mine.x * ahead + across.x * out,
      z: this.z + mine.z * ahead + across.z * out,
    };
    const ball = { from, to, t: 0, seconds, arc: BALL.arc + away * BALL.arcPerUnit, x: from.x, y: from.y, z: from.z, harmless: this.resting, pirate };
    this.balls.push(ball);
    this.emit('pirate-fire', { pirate, ball });
  }

  sinkPirate(pirate, dt) {
    pirate.sink = Math.min(1, pirate.sink + dt / PIRATE.sinkSeconds);
    pirate.sails = Math.max(0, pirate.sails - dt / PIRATE.sailsDown);
    pirate.speed = damp(pirate.speed, 0, 0.8, dt);
    const forward = forwardOf(pirate.heading);
    pirate.x += forward.x * pirate.speed * dt;
    pirate.z += forward.z * pirate.speed * dt;
    if (pirate.sink >= 1) pirate.state = 'gone';
  }

  /** Nobody ever bumps: ships only slide apart, with the pirates doing most of the moving. */
  keepApart() {
    const ships = this.pirates.filter(({ state }) => state !== 'gone');
    const mine = forwardOf(this.heading);
    const viewX = this.x - mine.x * VIEW_KEPT_CLEAR.behind;
    const viewZ = this.z - mine.z * VIEW_KEPT_CLEAR.behind;
    for (let i = 0; i < ships.length; i += 1) {
      const pirate = ships[i];
      const fromView = Math.hypot(pirate.x - viewX, pirate.z - viewZ) || 1;
      if (fromView < VIEW_KEPT_CLEAR.radius) {
        const push = VIEW_KEPT_CLEAR.radius - fromView;
        pirate.x += ((pirate.x - viewX) / fromView) * push;
        pirate.z += ((pirate.z - viewZ) / fromView) * push;
      }
      const dx = pirate.x - this.x;
      const dz = pirate.z - this.z;
      const away = Math.hypot(dx, dz) || 1;
      if (away < PIRATE.apart) {
        const push = PIRATE.apart - away;
        pirate.x += (dx / away) * push * 0.8;
        pirate.z += (dz / away) * push * 0.8;
        this.x -= (dx / away) * push * 0.2;
        this.z -= (dz / away) * push * 0.2;
      }
      for (let j = i + 1; j < ships.length; j += 1) {
        const other = ships[j];
        const ox = other.x - pirate.x;
        const oz = other.z - pirate.z;
        const gap = Math.hypot(ox, oz) || 1;
        if (gap < PIRATE.apart) {
          const push = (PIRATE.apart - gap) / 2;
          other.x += (ox / gap) * push;
          other.z += (oz / gap) * push;
          pirate.x -= (ox / gap) * push;
          pirate.z -= (oz / gap) * push;
        }
      }
    }
  }

  /* ---------- the cannons ---------- */

  /** Which firing zone any part of a ship is in, as what's seen in the zone is what gets fired at. */
  zoneOf(pirate) {
    const { from, to, reach } = this.level.zone;
    const forward = forwardOf(pirate.heading);
    for (const along of [0, HULL.half, -HULL.half]) {
      const dx = pirate.x + forward.x * along - this.x;
      const dz = pirate.z + forward.z * along - this.z;
      if (Math.hypot(dx, dz) > reach) continue;
      const off = turnBetween(headingTo(dx, dz), this.heading);
      if (Math.abs(off) >= from && Math.abs(off) <= to) return off > 0 ? 'right' : 'left';
    }
    return null;
  }

  aimCannons(dt) {
    const nearest = { left: null, right: null };
    const distance = { left: Infinity, right: Infinity };
    for (const pirate of this.afloat) {
      const side = this.zoneOf(pirate);
      if (!side) continue;
      const away = Math.hypot(pirate.x - this.x, pirate.z - this.z);
      if (away < distance[side]) {
        distance[side] = away;
        nearest[side] = pirate;
      }
    }
    for (const side of ['left', 'right']) {
      const zone = this.zones[side];
      zone.target = nearest[side];
      zone.inside = Boolean(zone.target);
      const firing = zone.inside && this.canFire;
      if (firing !== zone.firing) {
        zone.firing = firing;
        this.emit('firing', { side, on: firing });
      }
      zone.reload = Math.max(0, zone.reload - dt);
      if (firing && zone.reload === 0) this.fire(side);
    }
  }

  fire(side) {
    const zone = this.zones[side];
    const { target } = zone;
    const sign = side === 'right' ? 1 : -1;
    const forward = forwardOf(this.heading);
    const across = rightOf(this.heading);
    const gun = zone.nextGun;
    zone.nextGun = (gun + 1) % GUN_SPOTS.length;
    zone.reload = SHOT.every;
    const along = GUN_SPOTS[gun];
    const from = {
      x: this.x + forward.x * along + across.x * sign * HULL.beam,
      y: GUN_HEIGHT,
      z: this.z + forward.z * along + across.z * sign * HULL.beam,
    };
    const away = Math.hypot(target.x - from.x, target.z - from.z);
    const shot = {
      from,
      target,
      side,
      gun,
      t: 0,
      seconds: clamp(away / SHOT.speed, SHOT.shortest, SHOT.longest),
      arc: SHOT.arc + away * SHOT.arcPerUnit,
      along: (this.random() - 0.5) * SHOT.spread * 2,
      x: from.x,
      y: from.y,
      z: from.z,
    };
    this.shots.push(shot);
    this.stats.shots += 1;
    this.emit('fire', { side, gun, shot, from });
  }

  /** Each shot goes to wherever its target has got to, as lining up exactly isn't the point. */
  moveShots(dt) {
    for (const shot of this.shots) {
      shot.t = Math.min(1, shot.t + dt / shot.seconds);
      const { target, from, t } = shot;
      const forward = forwardOf(target.heading);
      const toX = target.x + forward.x * shot.along;
      const toZ = target.z + forward.z * shot.along;
      shot.x = from.x + (toX - from.x) * t;
      shot.z = from.z + (toZ - from.z) * t;
      shot.y = from.y + (SHOT.height - from.y) * t + 4 * shot.arc * t * (1 - t);
      if (t >= 1) {
        if (target.state === 'sailing') this.hit(target, shot);
        else this.emit('splash', { x: shot.x, z: shot.z, size: 0.5, mine: true });
      }
    }
    this.shots = this.shots.filter(({ t }) => t < 1);
  }

  hit(pirate, shot) {
    pirate.hitsLeft -= 1;
    pirate.hitLeft = 0.35;
    pirate.sinceHit = 0;
    this.stats.hits += 1;
    this.emit('hit', { pirate, x: shot.x, y: shot.y, z: shot.z });
    if (pirate.hitsLeft <= 0) {
      this.beat(pirate);
      return;
    }
    // Being fired at, it runs for it now and then, and has to be chased.
    if (pirate.hitsLeft <= pirate.runAt) {
      pirate.runAt -= pirate.maxHits * this.plan.runEvery;
      this.sendAway(pirate);
    }
  }

  /** Its sails come down and it slowly sinks, and its crew has already got away in the lifeboat. */
  beat(pirate) {
    pirate.state = 'sinking';
    pirate.mode = 'sinking';
    pirate.burstLeft = 0;
    this.stats.beaten += 1;
    const boat = this.launchBoat(pirate);
    this.dropGold(pirate);
    this.emit('beaten', { pirate, boat, beaten: this.stats.beaten, left: this.left });
    if (this.left === 0) this.wonIn = WON_AFTER;
    else this.spawnIn = PIRATE.nextIn;
  }

  /** Off to the side of its ship, so that it's easy to see, and away from the child's. */
  launchBoat(pirate) {
    const away = headingTo(pirate.x - this.x, pirate.z - this.z);
    const mine = forwardOf(this.heading);
    const oneWay = forwardOf(away + ROW.aside);
    const otherWay = forwardOf(away - ROW.aside);
    const inFront = (way) => way.x * mine.x + way.z * mine.z;
    const heading = away + (inFront(oneWay) > inFront(otherWay) ? ROW.aside : -ROW.aside);
    const forward = forwardOf(heading);
    const boat = {
      index: pirate.index,
      x: pirate.x + forward.x * ROW.startOut,
      z: pirate.z + forward.z * ROW.startOut,
      heading,
      speed: ROW.speed,
      left: ROW.seconds,
      coast: 0,
      atLimit: 0,
    };
    keepOnTheWater(boat, 1);
    this.boats.push(boat);
    return boat;
  }

  /** The gold it stole, floating in a line, which is a reason to steer that way. */
  dropGold(pirate) {
    const chart = getChart();
    const way = forwardOf(headingTo(this.x - pirate.x, this.z - pirate.z));
    for (let i = 0; i < GOLD.coins; i += 1) {
      const out = GOLD.from + i * GOLD.apart;
      const x = pirate.x + way.x * out;
      const z = pirate.z + way.z * out;
      if (chart.room(x, z) >= GOLD.least) this.coins.push({ x, z, left: GOLD.seconds, phase: i * 0.9 });
    }
  }

  /** Sailing near it picks it up. Missing it costs nothing, and it's gone after a while. */
  moveCoins(dt) {
    for (const coin of this.coins) {
      coin.left -= dt;
      if (this.distanceFromHull(coin.x, coin.z) <= GOLD.reach) {
        coin.left = 0;
        this.stats.gold += 1;
        this.emit('gold', { x: coin.x, z: coin.z, gold: this.stats.gold });
      }
    }
    this.coins = this.coins.filter(({ left }) => left > 0);
  }

  moveBoats(dt) {
    for (const boat of this.boats) {
      boat.left -= dt;
      const wanted = headingTo(boat.x - this.x, boat.z - this.z);
      boat.heading += clamp(turnBetween(wanted, boat.heading), -0.12 * dt, 0.12 * dt);
      steerRound(boat, dt);
      const forward = forwardOf(boat.heading);
      boat.x += forward.x * boat.speed * dt;
      boat.z += forward.z * boat.speed * dt;
      keepOnTheWater(boat, dt);
      if (boat.left <= 0) this.stats.crewsAway += 1;
    }
    this.boats = this.boats.filter(({ left }) => left > 0);
  }

  /* ---------- their cannonballs ---------- */

  moveBalls(dt) {
    for (const ball of this.balls) {
      ball.t = Math.min(1, ball.t + dt / ball.seconds);
      const { from, to, t } = ball;
      ball.x = from.x + (to.x - from.x) * t;
      ball.z = from.z + (to.z - from.z) * t;
      ball.y = from.y * (1 - t) + 4 * ball.arc * t * (1 - t);
      if (t >= 1) this.landBall(ball);
    }
    this.balls = this.balls.filter(({ t }) => t < 1);
  }

  /** How far a place on the water is from the child's hull, which is long and thin. */
  distanceFromHull(x, z) {
    const forward = forwardOf(this.heading);
    const dx = x - this.x;
    const dz = z - this.z;
    const along = clamp(dx * forward.x + dz * forward.z, -HULL.half, HULL.half);
    return Math.hypot(dx - forward.x * along, dz - forward.z * along);
  }

  landBall(ball) {
    const onHull = !ball.harmless && !this.resting && this.state === 'sailing' && this.distanceFromHull(ball.to.x, ball.to.z) <= HULL.beam + BALL.hitWiden;
    if (onHull) this.hurt(ball);
    else this.emit('splash', { x: ball.to.x, z: ball.to.z, size: 1 });
  }

  hurt(ball) {
    this.stats.hurts += 1;
    this.hearts -= 1;
    this.sinceHurt = 0;
    this.hurtLeft = 0.9;
    this.emit('hurt', { hearts: this.hearts, x: ball.to.x, z: ball.to.z });
    if (this.hearts > 0) return;
    if (this.level.canLose) this.lose();
    else this.hearts = 1;
  }

  lose() {
    this.state = 'lost';
    this.quietCannons();
    this.emit('lost', { beaten: this.stats.beaten });
  }

  quietCannons() {
    for (const side of ['left', 'right']) {
      const zone = this.zones[side];
      zone.target = null;
      zone.inside = false;
      if (zone.firing) {
        zone.firing = false;
        this.emit('firing', { side, on: false });
      }
    }
  }

  /* ---------- the child's ship ---------- */

  /** The wheel and the sails follow the hand at once, even before the battle has begun. */
  readHand(dt, steer, drive, open) {
    const wantedWheel = Number.isFinite(steer) ? clamp(steer, -1, 1) : 0;
    this.wheel = damp(this.wheel, wantedWheel, SAIL.wheelEase, dt);
    const width = Number.isFinite(drive) ? clamp((drive - SAIL.driveFrom) / (1 - SAIL.driveFrom), 0, 1) : 0;
    const wanted = open ? SAIL.lowest + (1 - SAIL.lowest) * width : 0;
    this.sails = damp(this.sails, wanted, wanted > this.sails ? SAIL.raise : SAIL.lower, dt);
  }

  /** Helps to keep the nearest pirate alongside, in the middle of a firing zone. */
  helpAlongside(dt) {
    const { reach } = this.level.zone;
    let nearest = null;
    let least = reach * ASSIST.from;
    for (const pirate of this.afloat) {
      const away = Math.hypot(pirate.x - this.x, pirate.z - this.z);
      if (away < least) {
        least = away;
        nearest = pirate;
      }
    }
    if (!nearest) return;
    const off = turnBetween(headingTo(nearest.x - this.x, nearest.z - this.z), this.heading);
    const wanted = off - (off >= 0 ? 1 : -1) * ASSIST.middle;
    const help = clamp(wanted, -ASSIST.most, ASSIST.most) * ASSIST.turn * this.level.assist;
    // A child steering hard the other way gets their way.
    const against = this.wheel * help < 0 ? 1 - ASSIST.against * Math.abs(this.wheel) : 1;
    this.heading += help * against * dt;
  }

  /** Nobody ever bumps: with a pirate right in front, it goes past, which brings it alongside. */
  giveWay(dt) {
    let nearest = null;
    let least = GIVE_WAY.within;
    for (const pirate of this.pirates) {
      if (pirate.state === 'gone') continue;
      const away = Math.hypot(pirate.x - this.x, pirate.z - this.z);
      if (away < least) {
        least = away;
        nearest = pirate;
      }
    }
    if (!nearest) return;
    const off = turnBetween(headingTo(nearest.x - this.x, nearest.z - this.z), this.heading);
    if (Math.abs(off) < GIVE_WAY.cone) this.heading -= (off >= 0 ? 1 : -1) * GIVE_WAY.turn * (1 - least / GIVE_WAY.within) * dt;
  }

  sail(dt) {
    const before = this.heading;
    const wanted = this.pace.speed * Math.max(SAIL.drift, this.sails);
    this.speed = damp(this.speed, wanted, wanted > this.speed ? SAIL.speedUp : SAIL.slowDown, dt);
    const way = this.speed / this.pace.speed;
    this.heading += this.wheel * SAIL.turn * (SAIL.turnDrifting + (1 - SAIL.turnDrifting) * Math.min(1, way)) * dt;
    if (this.canFire && !this.resting) this.helpAlongside(dt);
    this.giveWay(dt);
    steerRound(this, dt);
    const forward = forwardOf(this.heading);
    this.x += forward.x * this.speed * dt;
    this.z += forward.z * this.speed * dt;
    keepOnTheWater(this, dt);
    if (dt > 0) this.turning = damp(this.turning, clamp(turnBetween(this.heading, before) / (SAIL.turn * dt), -1, 1), 3, dt);
    if (this.atLimit > 0.2 && this.time - this.saidLimitAt > EDGE.sayEvery) {
      this.saidLimitAt = this.time;
      this.emit('limit');
    }
  }

  /** Resting is never punished: whatever's in the air lands harmlessly, and they all stop firing. */
  watchForRest(dt, open) {
    this.notOpenFor = open ? 0 : this.notOpenFor + dt;
    const resting = this.notOpenFor > REST_AFTER;
    if (resting === this.resting) return;
    this.resting = resting;
    if (resting) {
      for (const ball of this.balls) ball.harmless = true;
      for (const pirate of this.pirates) pirate.burstLeft = 0;
    } else {
      for (const pirate of this.afloat) pirate.fireIn = Math.max(pirate.fireIn, PIRATE.afterRest);
      this.broadsideIn = Math.max(this.broadsideIn, PIRATE.afterRest);
    }
    this.emit('resting', { on: resting });
  }

  /**
   * One frame. steer and drive are from the hand, as in snapshot.steer and snapshot.drive. open says the
   * hand counts as open, and seen that it's in view and can be read. Anything else fails closed.
   */
  update(dt, { steer = 0, drive = 0, open = false, seen = false } = {}) {
    this.time += dt;
    if (this.state === 'won' || this.state === 'lost') {
      this.afterTheEnd(dt);
      return;
    }
    this.open = open === true;
    this.canFire = this.open || (this.cannons === 'always' && seen === true);
    this.readHand(dt, steer, drive, this.open);
    if (this.state === 'ready') return;

    this.watchForRest(dt, this.open);
    this.stats.seconds += dt;
    if (this.open) {
      this.stats.openSeconds += dt;
      if (!this.wasOpen) this.stats.openings += 1;
    }
    this.wasOpen = this.open;
    this.hurtLeft = Math.max(0, this.hurtLeft - dt);
    this.sinceHurt += dt;
    if (this.hearts < HEARTS && this.sinceHurt >= this.level.healAfter) {
      this.hearts += 1;
      this.sinceHurt = 0;
      this.emit('healed', { hearts: this.hearts });
    }

    this.sail(dt);
    if (this.spawnIn > 0) {
      this.spawnIn -= dt;
      if (this.spawnIn <= 0) this.fill();
    }
    this.broadsideIn = Math.max(0, this.broadsideIn - dt);
    for (const pirate of this.pirates) this.movePirate(pirate, dt);
    this.pirates = this.pirates.filter(({ state }) => state !== 'gone');
    this.keepApart();
    keepOnTheWater(this, dt);
    for (const pirate of this.afloat) keepOnTheWater(pirate, dt);

    this.aimCannons(dt);
    this.moveShots(dt);
    this.moveBalls(dt);
    this.moveBoats(dt);
    this.moveCoins(dt);
    if (this.state !== 'sailing') return;

    if (this.wonIn !== null) {
      this.wonIn -= dt;
      if (this.wonIn <= 0) {
        this.state = 'won';
        this.quietCannons();
        this.emit('won', { beaten: this.stats.beaten });
      }
    }
  }

  /** It's all over: what's left carries on quietly and harms nobody, and a winner takes a lap of honour. */
  afterTheEnd(dt) {
    const won = this.state === 'won';
    this.open = false;
    this.canFire = false;
    this.readHand(dt, won ? AFTER_WIN_WHEEL : 0, won ? 1 : 0, won);
    this.resting = true;
    for (const ball of this.balls) ball.harmless = true;
    this.sail(dt);
    for (const pirate of this.pirates) this.movePirate(pirate, dt);
    this.pirates = this.pirates.filter(({ state }) => state !== 'gone');
    this.keepApart();
    keepOnTheWater(this, dt);
    this.moveShots(dt);
    this.moveBalls(dt);
    this.moveBoats(dt);
  }
}
