// Moto Mountain's rules: a motorbike going up a winding mountain road, steered by leaning the body. The bike
// rides by itself. In a bend it drifts to the outside, and leaning into the bend holds it on the road: a gentle
// bend needs a small lean and a tight one a deep lean, held until the road straightens. It's the game about
// leaning the trunk to each side and holding it there, which children with hemiplegia find hard, above all
// towards their weaker side.
//
// No screen, camera or sound in this file, so all of it runs in the unit tests. Distances are in metres along
// the road from the start line, x is across the road with the right side positive, and a lean is a share of
// this child's own lean to that side: 1 is as far as a bend ever asks for.
import { BEND_RAMP, FULL_CURVE, bendShare, nearestApproach, shapeOf } from './road.js';

export { FULL_CURVE, bendShare };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const smooth = (share) => {
  const t = clamp(share, 0, 1);
  return t * t * (3 - 2 * t);
};
const RAD = Math.PI / 180;

/* ------------------------------- the child's lean ------------------------------- */

// MediaPipe's numbers for the points this game reads.
const POINTS = { leftShoulder: 11, rightShoulder: 12, leftHip: 23, rightHip: 24 };
const SURE = 0.5; // A point the tracker is less sure of than this isn't used.

export const LEAN = {
  // How far the body leans for a whole lean, in degrees from upright, by the grown-ups' setting for how big a
  // movement has to be. It's never more than most of this child's own lean to that side, from the warm-up.
  full: { tiny: 7, small: 10, medium: 14, big: 19 },
  ofBest: 0.85,
  // A side the warm-up didn't measure, as when it's skipped, asks for no more than this: nothing is known of
  // how far this child leans, and a body bending at the waist is read as only about half as far as it bends.
  unmeasured: 8,
  least: 3.5, // A whole lean is never less than this, however small the child's own is.
  // Around upright nothing counts, so a child sitting a little crooked rides straight: this share of a whole
  // lean, and never less than this many degrees, which is what the tracker wobbles by.
  dead: 0.14,
  deadLeast: 1.6,
  most: 1.25,
  follow: 10, // How quickly the reading follows the body, per second.
  settle: 1.5, // And how quickly the slow average does, which is where upright is taken from.
  uprightMost: 10, // A body leaning more than this isn't taken as upright.
  wild: 22, // A jump of more than this many degrees between two looks is the tracker's mistake,
  wildLooks: 2, // unless it's still there after this many more.
  hipsFollow: 1.5, // How quickly hips coming into the picture, or going out of it, change how the lean is read.
  lostAfter: 0.5, // Seconds without a body before the lean is let go.
  letGo: 3, // And how quickly the bike then comes upright, per second.
  easedBy: 0.85, // What a whole lean comes down to, each time a child who's trying can't make a bend.
};

/**
 * The two things a lean is read from, each in radians, from what the tracker reports: positive towards the
 * child's right, which is the right of the picture as they see it in the mirror. shoulders is the tilt of the
 * line between the shoulders, and trunk the tilt of the line from the middle of the hips to the middle of the
 * shoulders, or null with the hips hidden, as behind a table. Returns null with no shoulders to go by.
 */
export function leanParts(body, aspect = 16 / 9) {
  const image = body?.image;
  if (!image) return null;
  const at = (index) => {
    const point = image[index];
    return point ? { x: (1 - point.x) * aspect, y: point.y, sure: point.visibility ?? 1 } : null;
  };
  const left = at(POINTS.leftShoulder);
  const right = at(POINTS.rightShoulder);
  if (!left || !right || left.sure < SURE || right.sure < SURE) return null;
  const across = right.x - left.x;
  // Shoulders one behind the other, as when the child turns away, say nothing about leaning.
  if (!(across > 0.02)) return null;
  const shoulders = Math.atan2(right.y - left.y, across);
  const leftHip = at(POINTS.leftHip);
  const rightHip = at(POINTS.rightHip);
  if (!leftHip || !rightHip || leftHip.sure < SURE || rightHip.sure < SURE) return { shoulders, trunk: null };
  const up = (leftHip.y + rightHip.y) / 2 - (left.y + right.y) / 2;
  if (!(up > 0.03)) return { shoulders, trunk: null };
  return { shoulders, trunk: Math.atan2((left.x + right.x) / 2 - (leftHip.x + rightHip.x) / 2, up) };
}

/**
 * How far the body leans to the side, in radians, from one look: the tilt of the shoulders and the tilt of the
 * trunk, half of each, or the shoulders alone with the hips hidden. hips, from 0 to 1, is how much the trunk
 * counts. The trunk is what shifting the weight sideways moves, and a shoulder alone can be hitched up without
 * leaning at all, so both are read. A body leaning all in a piece tips both the same, and one bending at the
 * waist tips its shoulders about twice as far as the line from its hips: on real footage of that, the reading
 * is a little under half the bend at the top of the spine, and goes evenly with it.
 */
export function leanOf(body, aspect = 16 / 9, hips = 1) {
  const parts = leanParts(body, aspect);
  if (!parts) return null;
  if (parts.trunk === null) return parts.shoulders;
  return parts.shoulders + (parts.trunk - parts.shoulders) * 0.5 * hips;
}

/** The child's lean in their own terms: where upright is, and how far a whole lean is to each side. */
export class Leaner {
  constructor({ size = 'medium' } = {}) {
    this.best = { left: null, right: null }; // The child's own lean each way, in radians, from the warm-up.
    this.eased = { left: 1, right: 1 };
    this.zero = 0;
    this.setSize(size);
    this.forget();
  }

  setSize(name) {
    this.sizeName = LEAN.full[name] ? name : 'medium';
    this.full = LEAN.full[this.sizeName] * RAD;
  }

  /** The child stepped away or the camera restarted. Where upright is, and their own lean, are kept. */
  forget() {
    this.angle = null;
    this.slow = null;
    this.last = null;
    this.hips = null; // How much the hips count, from 0 to 1: see read().
    this.trunkOff = 0;
    this.wild = 0;
    this.raw = 0;
    this.share = 0;
    this.seen = false;
    this.unseen = 0;
  }

  /** How far a whole lean is to one side, in radians. */
  reachOf(side) {
    const best = this.best[side];
    const most = Math.min(this.full, best === null ? LEAN.unmeasured * RAD : best * LEAN.ofBest);
    return Math.max(LEAN.least * RAD, most * this.eased[side]);
  }

  get reach() {
    return { left: this.reachOf('left'), right: this.reachOf('right') };
  }

  /**
   * Wherever the body has settled is upright from now on, unless it's leaning a long way. A child who sits a
   * little to one side, as many do, then rides straight without trying.
   */
  restHere() {
    if (this.slow === null || Math.abs(this.slow) > LEAN.uprightMost * RAD) return false;
    this.zero = this.slow;
    return true;
  }

  /** The warm-up measured how far this child leans to one side, in radians. */
  measured(side, best) {
    this.best[side] = best;
    this.eased[side] = 1;
  }

  /** A child who's trying and can't make a bend: a whole lean to that side comes down to meet them. */
  ease(side) {
    const before = this.reachOf(side);
    this.eased[side] *= LEAN.easedBy;
    return this.reachOf(side) < before - 1e-9;
  }

  /**
   * One look from the tracker, as the body it reports. Hips that come into the picture or go out of it, as at
   * the bottom edge of it, change how the lean is read little by little, so the bike is never jolted by them.
   */
  read(body, aspect, dt) {
    const parts = leanParts(body, aspect);
    if (!parts) return this.update(null, dt);
    const seen = parts.trunk !== null;
    this.hips = this.hips === null ? Number(seen) : this.hips + (Number(seen) - this.hips) * (1 - Math.exp(-LEAN.hipsFollow * dt));
    // While they're out of sight, the trunk is taken to be where it last was against the shoulders.
    if (seen) this.trunkOff = parts.trunk - parts.shoulders;
    return this.update(parts.shoulders + this.trunkOff * 0.5 * this.hips, dt);
  }

  /** One look from the tracker: the lean in radians, or null with nobody to see. Returns the lean as a share. */
  update(angle, dt) {
    if (angle === null || !Number.isFinite(angle)) {
      this.unseen += dt;
      if (this.unseen >= LEAN.lostAfter) {
        this.seen = false;
        this.angle = null;
        this.slow = null;
        this.last = null;
      }
      // With nobody to copy, the bike comes upright by itself, gently.
      this.share *= Math.exp(-LEAN.letGo * dt);
      this.raw *= Math.exp(-LEAN.letGo * dt);
      if (Math.abs(this.share) < 0.01) this.share = 0;
      return this.share;
    }
    // One wild look is the tracker's mistake. The same one a few times running is the child.
    if (this.last !== null && Math.abs(angle - this.last) > LEAN.wild * RAD && this.wild < LEAN.wildLooks) {
      this.wild += 1;
      return this.share;
    }
    this.wild = 0;
    this.last = angle;
    this.unseen = 0;
    this.seen = true;
    const towards = (value, rate) => (value === null ? angle : value + (angle - value) * (1 - Math.exp(-rate * dt)));
    this.angle = towards(this.angle, LEAN.follow);
    this.slow = towards(this.slow, LEAN.settle);

    this.raw = this.angle - this.zero;
    const reach = this.reachOf(this.raw < 0 ? 'left' : 'right');
    const dead = Math.min(0.5, Math.max(LEAN.dead, (LEAN.deadLeast * RAD) / reach));
    const size = Math.abs(this.raw) / reach;
    this.share = size <= dead ? 0 : Math.sign(this.raw) * Math.min(LEAN.most, (size - dead) / (1 - dead));
    return this.share;
  }
}

export const WARM = {
  sides: ['left', 'right'],
  hold: 0.8, // A lean counts as far as it was held for this long, so a lurch isn't taken as the child's lean.
  least: 4, // Degrees: less than this isn't a lean that was measured.
  back: 0.45, // Coming back to under this share of it says the lean is over.
  patience: 9, // Seconds on one side before moving on with whatever there was.
  between: 0.9, // Seconds between one side and the other.
};

/**
 * Before the first ride, the child leans as far as they comfortably can to each side, and that's what a whole
 * lean is set from, each side by itself. It can be skipped, and then a whole lean is the grown-ups' setting.
 */
export class Warmup {
  constructor({ leaner, sides = WARM.sides, onEvent = () => {} }) {
    this.leaner = leaner;
    this.sides = sides;
    this.onEvent = onEvent;
    this.index = 0;
    this.done = false;
    this.results = {};
    this.startSide();
  }

  get side() {
    return this.sides[this.index] ?? null;
  }

  /** How far through the lean being asked for the child is, for the bar under the film. */
  get share() {
    return clamp(this.towards / this.leaner.full, 0, 1);
  }

  startSide() {
    this.time = 0;
    this.best = 0;
    this.towards = 0;
    this.recent = [];
    this.wait = 0;
  }

  update(dt) {
    if (this.done) return;
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0) this.next();
      return;
    }
    const { leaner } = this;
    this.time += dt;
    const sign = this.side === 'left' ? -1 : 1;
    this.towards = leaner.seen ? Math.max(0, leaner.raw * sign) : 0;
    // The least it has been over the last moment is how far it was held.
    this.recent.push({ at: this.time, value: this.towards });
    while (this.recent.length && this.time - this.recent[0].at > WARM.hold) this.recent.shift();
    const held = this.time >= WARM.hold ? Math.min(...this.recent.map(({ value }) => value)) : 0;
    if (held > this.best) this.best = held;

    const enough = this.best >= WARM.least * RAD;
    if (enough && this.towards < this.best * WARM.back) this.measure();
    else if (this.time >= WARM.patience) this.measure();
  }

  measure() {
    const side = this.side;
    const best = this.best >= WARM.least * RAD ? this.best : null;
    this.results[side] = best;
    if (best !== null) this.leaner.measured(side, best);
    this.onEvent({ type: 'measured', side, best });
    this.wait = WARM.between;
  }

  next() {
    this.index += 1;
    if (this.index >= this.sides.length) this.finish(true);
    else {
      this.startSide();
      this.onEvent({ type: 'side', side: this.side });
    }
  }

  /** The warm-up is over, by being done or by the button that skips it. */
  finish(measured = false) {
    if (this.done) return;
    this.done = true;
    this.onEvent({ type: 'done', measured });
  }
}

/* ------------------------------- the road ------------------------------- */

export const ROAD = {
  half: 4.2, // From the middle of the road to the edge of the tarmac.
  verge: 2.4, // The grass beside it, which a bike can still ride on, slowly.
  bridgeHalf: 2.8, // A bridge is narrower,
  rail: 0.5, // with this much plank beyond that before its railing.
  taper: 8, // And the road narrows down to it over this many metres.
  start: 70, // The straight before the first bend,
  end: 85, // and after the last, up to the finish.
};
export const BEND_COUNTS = [6, 10, 14];
export const PACES = { gentle: 0.78, usual: 1, quick: 1.18 };
// A bend comes on at the same pace whatever the level: a lean of a little over half a whole one is asked for
// over this many seconds at the bike's fastest, and a deeper one over longer. So a tighter bend on a faster
// road leaves a child as long to lean into it as a gentle one at level 1.
const ONSET = { seconds: 1, need: 0.55, fastest: 1.16 };
// And then it's held for this many seconds, at the usual pace.
const HOLD_SECONDS = [1.4, 3.4];
// Where two bends in three go one way, those are the shorter ones and the others the longer, so the road
// doesn't wind round and round.
const HOLD_SECONDS_MORE = { towards: [1.4, 2.2], away: [3.2, 4.2] };
const LAY_OUT_TRIES = 12;
const ROOM_BETWEEN = 90; // Metres the road keeps from itself, for the hillside between.
const GAP_LENGTH = [42, 62];
// The big bend, from level 8: most of the way round, with the lean held all the way.
const BIG = { need: 0.72, turn: 150 * RAD };
const STAR_GAP = 10;
const STAR_SIDE = 2;
const SNOW_FROM = 0.55; // The share of the road after which there's snow, at level 10.

// What comes along in the straights, how long a straight it needs, and how many a ride has at most.
const FEATURES = {
  puddle: { room: [58, 70], most: 4 },
  boost: { room: [58, 70], most: 4 },
  sheep: { room: [64, 76], most: 3 },
  bridge: { room: [78, 88], most: 2 },
  ramp: { room: [70, 80], most: 3 },
  scooter: { room: [104, 114], most: 2 },
};
const FEATURE_ORDER = ['puddle', 'boost', 'sheep', 'bridge', 'ramp', 'scooter'];
const FEATURE_CHANCE = 0.62;

export const NEW_THINGS = {
  2: [{ id: 'star', mark: '⭐', name: 'Gold stars', nameKa: 'ოქროს ვარსკვლავები' }],
  3: [{ id: 'puddle', mark: '💦', name: 'Puddles', nameKa: 'გუბეები' }],
  4: [{ id: 'boost', mark: '⏩', name: 'Speed arrows', nameKa: 'სიჩქარის ისრები' }],
  5: [{ id: 'sheep', mark: '🐑', name: 'Sheep on the road', nameKa: 'ცხვრები გზაზე' }],
  6: [{ id: 'bridge', mark: '🌉', name: 'A narrow bridge', nameKa: 'ვიწრო ხიდი' }],
  7: [{ id: 'ramp', mark: '🚀', name: 'A jump', nameKa: 'ტრამპლინი' }],
  8: [{ id: 'big', mark: '↩️', name: 'The big bend', nameKa: 'დიდი მოსახვევი' }],
  9: [{ id: 'scooter', mark: '🛵', name: 'A friend to pass', nameKa: 'მეგობარი, რომელსაც გაუსწრებ' }],
  10: [{ id: 'snow', mark: '⛄', name: 'Snow at the top, and the cup', nameKa: 'თოვლი მწვერვალზე და თასი' }],
};
const clampLevel = (level) => clamp(Math.round(Number(level) || 1), 1, 10);
export const newThingsAt = (level) => NEW_THINGS[clampLevel(level)] ?? [];
/** What's new at a level, for the cards: nothing at level 1. */
export const newAt = (level) => newThingsAt(level).map(({ mark, name, nameKa }) => ({ mark, name, nameKa }));
/** Everything a level has that level 1 hasn't, the newest last, for naming each thing the first time it comes. */
export const thingsUpTo = (level) => Object.keys(NEW_THINGS).map(Number).filter((from) => from <= clampLevel(level)).flatMap((from) => NEW_THINGS[from]);

const ramp = (level, from, to) => from + ((to - from) * (level - 1)) / 9;

/**
 * What a level changes. Level 1 is the plain road. How many bends a ride has, which way most of them go, how
 * far a lean has to be and how fast the bike goes stay as a grown-up chose: a level only brings its new thing,
 * bends a little tighter, and a bike a fifth faster by level 10, which still leaves over 80% of level 1's
 * time to see what's coming. With friends it's the plain road with its stars and speed arrows, at any level.
 */
export function rideLevel(level = 1, plain = false) {
  const at = clampLevel(level);
  return {
    level: at,
    cruise: ramp(at, 15, 18.2), // Metres a second.
    need: [ramp(at, 0.5, 0.6), ramp(at, 0.58, 0.78)], // How much of a whole lean the bends need.
    star: plain || at >= 2,
    puddle: !plain && at >= 3,
    boost: plain || at >= 4,
    sheep: !plain && at >= 5,
    bridge: !plain && at >= 6,
    ramp: !plain && at >= 7,
    big: !plain && at >= 8,
    scooter: !plain && at >= 9,
    snow: !plain && at >= 10,
    cup: !plain && at >= 10,
    plain,
  };
}

/**
 * Lays out a ride: its bends, and what's on the road. The same numbers from random lay out the same ride, so
 * friends each get the same road. side is the side being worked on, and favour 'more' sends two bends in every
 * three that way.
 */
export function layOut(options = {}, room = ROOM_BETWEEN) {
  let plan = layOutOnce(options);
  // A road that turns more one way than the other could come round on itself. One that would is laid out
  // again, from the numbers that come next, which are the same on every friend's computer. As the bends are
  // now, none does: this is here for when they change. room is how far the road has to keep from itself.
  for (let tries = 1; tries < LAY_OUT_TRIES && nearestApproach(shapeOf(plan)) < room; tries += 1) {
    plan = layOutOnce(tries < LAY_OUT_TRIES - 2 ? options : { ...options, favour: 'even' });
  }
  return plan;
}

function layOutOnce({ level = 1, bends = 10, favour = 'even', side = 'left', random = Math.random, plain = false } = {}) {
  const rules = rideLevel(level, plain);
  const count = BEND_COUNTS.includes(bends) ? bends : 10;
  const between = ([low, high]) => low + (high - low) * random();
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

  // Which way each bend goes: one way and then the other, or two in three towards the side being worked on,
  // and never three the same way running, which would send the road round in a ring.
  const turns = [];
  const worked = side === 'right' ? 1 : -1;
  if (favour === 'more') {
    const phase = Math.floor(random() * 3);
    for (let i = 0; i < count; i += 1) turns.push((i + phase) % 3 === 2 ? -worked : worked);
  } else {
    const first = random() < 0.5 ? -1 : 1;
    for (let i = 0; i < count; i += 1) turns.push(i % 2 ? -first : first);
  }
  // The big bend is near the middle of the ride. Where most bends go one way, it goes the other.
  let bigIndex = -1;
  if (rules.big) {
    bigIndex = Math.floor(count / 2);
    if (favour === 'more') {
      const others = turns.map((turn, index) => (turn === -worked ? index : -1)).filter((index) => index >= 0);
      bigIndex = others.reduce((nearest, index) => (Math.abs(index - count / 2) < Math.abs(nearest - count / 2) ? index : nearest), others[0]);
    }
  }

  // What's in each straight between two bends. The newest thing comes first, so it's met right away, and
  // again in the second half.
  const unlocked = FEATURE_ORDER.filter((name) => rules[name]);
  const newest = newThingsAt(level).map(({ id }) => id).find((id) => unlocked.includes(id)) ?? null;
  const used = Object.fromEntries(FEATURE_ORDER.map((name) => [name, 0]));
  const features = new Array(count).fill(null); // features[i] is in the straight after bend i - 1. 0 is the start.
  const take = (slot, name) => {
    if (!name || features[slot] || used[name] >= FEATURES[name].most) return false;
    features[slot] = name;
    used[name] += 1;
    return true;
  };
  if (newest && !plain) {
    take(1, newest);
    take(Math.min(count - 1, Math.ceil(count / 2) + 1), newest);
  }
  for (let slot = 1; slot < count; slot += 1) {
    if (features[slot] || !unlocked.length || random() >= FEATURE_CHANCE) continue;
    const free = unlocked.filter((name) => used[name] < FEATURES[name].most);
    if (free.length) take(slot, pick(free));
  }

  const list = [];
  const things = [];
  const add = (thing) => things.push(thing);
  let at = ROAD.start;
  for (let i = 0; i < count; i += 1) {
    const big = i === bigIndex;
    const need = big ? BIG.need : between(rules.need);
    // A bend turns as far as its lean and its length make it.
    const onset = Math.max(BEND_RAMP, rules.cruise * ONSET.fastest * ONSET.seconds * (need / ONSET.need));
    const holds = favour === 'more' ? HOLD_SECONDS_MORE[turns[i] === worked ? 'towards' : 'away'] : HOLD_SECONDS;
    const length = big ? BIG.turn / (BIG.need * FULL_CURVE) + onset : 2 * onset + between(holds) * rules.cruise;
    const bend = { index: i, from: at, to: at + length, turn: turns[i], need, big, ramp: onset };
    list.push(bend);
    if (rules.star) {
      // Stars down the middle of the bend, for the bike that's leaning as far as the bend needs.
      const stars = big ? 5 : 3;
      const middle = (bend.from + bend.to) / 2;
      for (let n = 0; n < stars; n += 1) add({ kind: 'star', at: middle + (n - (stars - 1) / 2) * STAR_GAP, x: 0 });
    }
    at = bend.to;
    if (i === count - 1) break;

    // The straight after it, and what's in it.
    const feature = features[i + 1];
    const gap = feature ? between(FEATURES[feature].room) : between(GAP_LENGTH);
    const from = at;
    const to = at + gap;
    const middle = (from + to) / 2;
    const oneSide = (random() < 0.5 ? -1 : 1);
    if (feature === 'puddle') add({ kind: 'puddle', at: middle, x: oneSide * 2.1, reach: 1.9 });
    else if (feature === 'boost') add({ kind: 'boost', at: middle, x: oneSide * 2.1, reach: 1.7 });
    else if (feature === 'sheep') add({ kind: 'sheep', at: middle + 6, x: oneSide * 1.6, reach: 1.9 });
    else if (feature === 'ramp') add({ kind: 'ramp', at: middle, x: oneSide * 1.7, reach: 1.5 });
    else if (feature === 'bridge') add({ kind: 'bridge', at: from + 18, from: from + 18, to: to - 16 });
    else if (feature === 'scooter') add({ kind: 'scooter', at: from + 46, from: from + 46, to: to - 14, x: oneSide * 2, reach: 1.9 });
    else if (rules.star && random() < 0.5) {
      for (let n = -1; n <= 1; n += 1) add({ kind: 'star', at: middle + n * STAR_GAP, x: oneSide * STAR_SIDE });
    }
    at = to;
  }
  const length = at + ROAD.end;
  // At level 10 the top of the road is under snow, and the stars up there are heaps of snow to burst through.
  const snowFrom = rules.snow ? length * SNOW_FROM : null;
  if (snowFrom !== null) {
    for (const thing of things) if (thing.kind === 'star' && thing.at >= snowFrom) thing.kind = 'snow';
  }
  things.sort((a, b) => a.at - b.at);
  return {
    rules,
    bends: list,
    things,
    length,
    snowFrom,
    stars: things.filter(({ kind }) => kind === 'star').length,
    snows: things.filter(({ kind }) => kind === 'snow').length,
  };
}

/* ------------------------------- the ride ------------------------------- */

// How far the lean can be from what a bend needs, as a share of a whole lean, with the bike still on the
// road in the end: the grown-ups' setting for how much help the road gives.
export const HELP = { lots: 0.42, some: 0.3, little: 0.2 };
export const BIKE = {
  pull: 0.9, // How strongly the road draws the bike back to the middle, per second.
  speedUp: 4, // Metres a second, each second.
  brake: 7,
  verge: 0.45, // The share of its speed the bike keeps on the grass.
  flowStep: 0.04, // A bend ridden all on the road makes the bike this much faster,
  flowMost: 4, // up to this many times, until it next touches the grass.
  boost: 1.3,
  boostSeconds: 2.2,
  splash: 0.7,
  splashSeconds: 0.9,
  leanMost: 32 * RAD, // How far over the bike goes for a whole lean.
  rollFollow: 9,
  starReach: 1.5,
  snowReach: 1.7,
  jumpSeconds: 1.5,
  jumpHeight: 2.1,
  jumpLeast: 6, // A bike slower than this rolls over a ramp and doesn't fly.
};
const WAIT = {
  into: 0.12, // Leaning this much into a bend is enough to get going again.
  after: 2.2, // Seconds on the grass in a bend without leaning into it before the bike stops to wait.
  away: 0.6, // Seconds with nobody in the picture before it does.
  said: 5, // Seconds stopped before the child is told there's no hurry.
  tow: 10, // Seconds stopped in a bend, with the child there, before the bike is helped round it.
};
const TRY = {
  angle: 1.2, // Degrees past upright, the right way, which is a child trying.
  seconds: 3, // This long trying, on the grass on the outside of a bend, and a whole lean comes down.
};
const HINT_BEFORE = 10; // Metres before the first bend that its lean is asked for: leaning sooner would take the bike off a straight road.
const COUNTS = { on: 0.35, off: 0.15, share: 0.25 }; // What counts as a lean, for the numbers at the finish.
const SHEEP = { stopAt: 4, near: 6.5, waits: 1.2, goes: 1.5, seen: 45 };
const SCOOTER = { speed: 0.35, starts: 45, follows: 5, near: 8, patience: 3, aside: 1 };
const LEASH = { ahead: 45, slack: 30, slowest: 0.5, behind: 25, tow: 1.2 }; // Riding together: see update().

export class Ride {
  /**
   * level, bends, favour and side lay the road out: see layOut. pace is the grown-ups' setting for how fast
   * the bike goes. team is true when friends ride together, as one convoy. onEvent hears what happens.
   */
  constructor({ level = 1, bends = 10, favour = 'even', side = 'left', pace = 'usual', help = 'some', random = Math.random, plain = false, team = false, leaner = null, plan = null, onEvent = () => {} } = {}) {
    // A ride already laid out can be handed in, as the tests do.
    this.plan = plan ?? layOut({ level, bends, favour, side, random, plain });
    this.rules = this.plan.rules;
    this.levelNumber = this.rules.level;
    this.plain = plain;
    this.team = team;
    this.leaner = leaner;
    this.onEvent = onEvent;
    this.cruise = this.rules.cruise * (PACES[pace] ?? 1);
    // Metres a second the bike goes sideways when the lean is a whole lean away from what the bend needs.
    this.side = (ROAD.half * BIKE.pull) / (HELP[help] ?? HELP.some);
    this.towed = null; // The bend the bike is being helped round, after a long wait.
    this.things = this.plan.things.map((thing) => ({ ...thing, done: false }));
    this.bridges = this.things.filter(({ kind }) => kind === 'bridge');
    // What the bike goes past, in the order it comes to them, and what can be in its way.
    this.passing = this.things.filter(({ kind }) => ['star', 'snow', 'puddle', 'boost', 'ramp', 'sheep'].includes(kind));
    this.scooters = this.things.filter(({ kind }) => kind === 'scooter');
    for (const scooter of this.scooters) scooter.pos = scooter.from;
    this.blockers = this.things.filter(({ kind }) => kind === 'sheep' || kind === 'scooter');
    this.state = 'ready';
    this.s = 0;
    this.x = 0;
    this.v = 0;
    this.roll = 0; // How far over the bike is, in radians, the right side positive.
    this.height = 0; // Off the ground, in a jump.
    this.air = null;
    this.flow = 0;
    this.boostLeft = 0;
    this.splashLeft = 0;
    this.elapsed = 0;
    this.away = 0;
    this.waiting = null; // 'away' with nobody in the picture, 'bend' stopped on the grass until the child leans.
    this.waited = 0;
    this.idle = 0;
    this.struggle = 0;
    this.offRoad = false;
    this.onBridge = false;
    this.riding = null; // The bend the bike is in: { bend, off }.
    this.nextBend = 0;
    this.nextThing = 0;
    this.leaning = null;
    this.leanFor = 0;
    this.stats = {
      seconds: 0,
      bends: this.plan.bends.length,
      clean: 0,
      stars: 0,
      snow: 0,
      splashes: 0,
      boosts: 0,
      jumps: 0,
      passed: 0,
      stops: 0,
      medal: false,
      cup: false,
      leans: { left: 0, right: 0 },
      leanSeconds: { left: 0, right: 0 },
      longest: 0,
      eased: { left: 0, right: 0 },
      tows: 0,
      vergeSeconds: 0,
      waitSeconds: 0,
    };
  }

  begin() {
    if (this.state !== 'ready') return;
    this.state = 'riding';
    this.onEvent({ type: 'go' });
  }

  /** The bend at a place, or null on a straight. */
  bendAt(s) {
    for (const bend of this.plan.bends) if (s > bend.from && s < bend.to) return bend;
    return null;
  }

  /** How much lean the road needs at a place, and which way: the right positive. */
  needAt(s) {
    const bend = this.bendAt(s);
    return bend ? bend.turn * bend.need * bendShare(bend, s) : 0;
  }

  /** How far the road has narrowed for a bridge at a place: 0 on the open road, 1 on the bridge. */
  narrowAt(s) {
    let most = 0;
    for (const { from, to } of this.bridges) {
      const into = Math.min(s - (from - ROAD.taper), to + ROAD.taper - s) / ROAD.taper;
      if (into > 0) most = Math.max(most, smooth(into));
    }
    return most;
  }

  /** From the middle of the road to the edge of the tarmac at a place, which is less on a bridge. */
  halfAt(s) {
    return ROAD.half + (ROAD.bridgeHalf - ROAD.half) * this.narrowAt(s);
  }

  /** The furthest the bike can be from the middle at a place: the far edge of the grass, or a bridge's railing. */
  edgeAt(s) {
    return this.halfAt(s) + ROAD.verge + (ROAD.rail - ROAD.verge) * this.narrowAt(s);
  }

  /** The bend the bike is in or coming to, for the arrow on the screen: null with none near. */
  get ahead() {
    const bend = this.riding?.bend ?? this.plan.bends[this.nextBend] ?? null;
    if (!bend) return null;
    return { index: bend.index, turn: bend.turn, need: bend.need, big: bend.big, in: Math.max(0, bend.from - this.s), through: clamp((this.s - bend.from) / (bend.to - bend.from), 0, 1) };
  }

  /** What to ask of the child, if anything: 'left' or 'right' for a lean, 'both' for nothing to do but wait. */
  get hint() {
    if (this.state !== 'riding' || this.waiting === 'away') return null;
    const bend = this.riding?.bend;
    const side = (turn) => (turn < 0 ? 'left' : 'right');
    if (this.waiting === 'bend' && bend) return side(bend.turn);
    // On the grass on the outside of a bend: lean into it.
    if (bend && this.offRoad && this.x * bend.turn < 0) return side(bend.turn);
    // Until the first lean of the ride, the first bend says which way.
    const first = this.plan.bends[0];
    if (this.stats.leans.left + this.stats.leans.right === 0 && this.s < first.to && first.from - this.s < HINT_BEFORE) return side(first.turn);
    return null;
  }

  get resting() {
    return this.waiting !== null;
  }

  /**
   * One frame. lean is the child's lean: { share, raw, seen }, as a Leaner has it. mates are the friends in a
   * ride together, each { s }, how far along the road they are.
   */
  update(dt, lean, mates = []) {
    if (this.state !== 'riding') return;
    const { stats } = this;
    this.elapsed += dt;
    const seen = Boolean(lean?.seen);
    const share = seen ? clamp(lean.share ?? 0, -1, 1) : 0;
    this.away = seen ? 0 : this.away + dt;

    const bend = this.bendAt(this.s);
    const turn = bend?.turn ?? 0;
    // A bike being helped round a bend rides it as if it were straight.
    const need = this.towed ? 0 : this.needAt(this.s);
    const flying = this.air !== null;

    this.countLean(share, dt);
    this.decideWaiting(share, turn, dt);
    this.readTrying(lean, bend, dt);

    // How fast it wants to go: slower on the grass, in a puddle and behind something, faster with an arrow
    // and for bends ridden well.
    let wanted = this.cruise * (1 + BIKE.flowStep * this.flow);
    if (this.boostLeft > 0) wanted *= BIKE.boost;
    if (this.splashLeft > 0) wanted *= BIKE.splash;
    if (this.offRoad || this.towed) wanted *= BIKE.verge;
    wanted *= this.convoy(mates);
    if (this.waiting) wanted = 0;
    wanted = Math.min(wanted, this.blockedTo(dt));
    if (!flying) {
      const rate = wanted > this.v ? BIKE.speedUp : BIKE.brake;
      this.v += clamp(wanted - this.v, -rate * dt, rate * dt);
    }
    this.boostLeft = Math.max(0, this.boostLeft - dt);
    this.splashLeft = Math.max(0, this.splashLeft - dt);

    // Across the road: the bend carries the bike to its outside, the lean carries it the way it leans, and
    // the road draws it back to the middle. A bike that's hardly moving hardly goes sideways.
    const moving = clamp(this.v / 3, 0, 1);
    if (!flying) this.x += (this.side * ((this.towed ? 0 : share) - need) - BIKE.pull * this.x) * moving * dt;
    const edge = this.edgeAt(this.s);
    this.x = clamp(this.x, -edge, edge);
    this.roll += (share * BIKE.leanMost - this.roll) * (1 - Math.exp(-BIKE.rollFollow * dt));

    const before = this.s;
    this.s = Math.min(this.plan.length, this.s + this.v * dt);
    if (flying) this.fly(dt);

    // On or off the tarmac.
    const off = !flying && Math.abs(this.x) > this.halfAt(this.s) + 1e-6;
    if (off !== this.offRoad) {
      this.offRoad = off;
      if (off) {
        this.flow = 0;
        if (this.riding) this.riding.off = true;
      }
      this.onEvent({ type: off ? 'verge' : 'road', side: this.x < 0 ? 'left' : 'right' });
    }
    if (off) stats.vergeSeconds += dt;
    if (this.waiting) stats.waitSeconds += dt;

    this.passBends(before);
    this.passThings();
    this.moveScooters(dt);
    this.crossBridges();

    if (this.s >= this.plan.length) this.finish();
  }

  /** Leans, counted and timed, for the numbers at the finish. */
  countLean(share, dt) {
    const { stats } = this;
    const size = Math.abs(share);
    const side = share < 0 ? 'left' : 'right';
    if (size >= COUNTS.share) stats.leanSeconds[side] += dt;
    if (this.leaning && (size < COUNTS.off || side !== this.leaning)) {
      this.leaning = null;
      this.leanFor = 0;
    }
    if (!this.leaning && size >= COUNTS.on) {
      this.leaning = side;
      this.leanFor = 0;
      stats.leans[side] += 1;
      this.onEvent({ type: 'lean', side });
    }
    if (this.leaning) {
      this.leanFor += dt;
      if (this.leanFor > stats.longest) stats.longest = this.leanFor;
    }
  }

  /**
   * Resting is never punished, and nothing is ever lost: with nobody in the picture the bike stops and waits,
   * and a bike left on the grass in a bend stops there until the child leans into the bend, even a little.
   */
  decideWaiting(share, turn, dt) {
    let waiting = null;
    if (this.away >= WAIT.away) waiting = 'away';
    else if (this.towed) this.idle = 0;
    else if (turn && this.offRoad) {
      // On the grass in a bend with no lean into it: that's the outside, where the bend carries a bike that
      // isn't leaning. A bike on the inside got there by leaning into the bend, and leaning is what keeps it going.
      const into = share * turn;
      this.idle = into >= WAIT.into ? 0 : this.idle + dt;
      if (this.idle >= WAIT.after) waiting = 'bend';
    } else {
      this.idle = 0;
    }
    if (waiting !== this.waiting) {
      this.waiting = waiting;
      this.waited = 0;
      this.onEvent({ type: waiting ? 'waiting' : 'going', why: waiting });
    }
    if (!waiting) return;
    const before = this.waited;
    this.waited += dt;
    if (before < WAIT.said && this.waited >= WAIT.said) this.onEvent({ type: 'resting' });
    // Nobody is left stuck: after a long wait in a bend, with the child there, the bike is helped round it.
    if (waiting === 'bend' && this.waited >= WAIT.tow && this.riding) {
      this.towed = this.riding.bend;
      this.waiting = null;
      this.idle = 0;
      this.stats.tows += 1;
      this.onEvent({ type: 'tow', bend: this.towed });
    }
  }

  /**
   * A child who's leaning the right way, on the outside of a bend all the same, is trying and not getting
   * there. After a few seconds of that, a whole lean to that side comes down to meet them.
   */
  readTrying(lean, bend, dt) {
    if (!bend || !this.leaner || !lean?.seen || !this.offRoad || this.x * bend.turn >= 0) {
      this.struggle = Math.max(0, this.struggle - dt);
      return;
    }
    const towards = (lean.raw ?? 0) * bend.turn;
    if (towards < TRY.angle * RAD) return;
    this.struggle += dt;
    if (this.struggle < TRY.seconds) return;
    this.struggle = 0;
    const side = bend.turn < 0 ? 'left' : 'right';
    if (this.leaner.ease(side)) {
      this.stats.eased[side] += 1;
      this.onEvent({ type: 'eased', side });
    }
  }

  /**
   * Riding together, friends stay in one convoy: whoever is a long way in front of the last of them eases off,
   * down to half speed, and whoever is a long way behind the first gets a tow. Nobody is ever stopped by it.
   */
  convoy(mates) {
    if (!this.team) return 1;
    const others = mates.filter((mate) => mate && Number.isFinite(mate.s));
    if (!others.length) return 1;
    const last = Math.min(...others.map(({ s }) => s));
    const first = Math.max(...others.map(({ s }) => s));
    const ahead = this.s - last;
    if (ahead > LEASH.ahead) return 1 - (1 - LEASH.slowest) * clamp((ahead - LEASH.ahead) / LEASH.slack, 0, 1);
    if (first - this.s > LEASH.behind) return LEASH.tow;
    return 1;
  }

  /**
   * The fastest the bike may go for what's in front of it: a sheep in its way, which it stops for, or a
   * scooter, which it follows. Neither can be hit. A sheep that's been waited for walks off, and a scooter
   * that's been followed for a while pulls over.
   */
  blockedTo(dt) {
    let most = Infinity;
    for (const thing of this.blockers) {
      if (thing.done) continue;
      const gap = (thing.kind === 'scooter' ? thing.pos : thing.at) - this.s;
      if (gap <= 0 || gap > SHEEP.seen) continue;
      const inWay = Math.abs(this.x - thing.x) < thing.reach && !thing.aside;
      if (thing.kind === 'sheep') {
        if (thing.going !== undefined) {
          // Walking off: the bike stays where it is until the road is clear.
          thing.going += dt;
          if (thing.going >= SHEEP.goes) thing.aside = true;
          if (!thing.aside) most = 0;
          continue;
        }
        if (!inWay) continue;
        most = Math.min(most, Math.sqrt(2 * BIKE.brake * Math.max(0, gap - SHEEP.stopAt)));
        if (gap < SHEEP.near && this.v < 0.8) {
          thing.waited = (thing.waited ?? 0) + dt;
          if (thing.waited >= SHEEP.waits) {
            thing.going = 0;
            thing.stopped = true;
            this.stats.stops += 1;
            this.onEvent({ type: 'sheep-goes', thing });
          }
        }
      } else if (thing.moving && inWay) {
        const own = this.cruise * SCOOTER.speed;
        most = Math.min(most, own + Math.sqrt(2 * BIKE.brake * Math.max(0, gap - SCOOTER.follows)));
        if (gap < SCOOTER.near) {
          thing.behind = (thing.behind ?? 0) + dt;
          if (thing.behind >= SCOOTER.patience) {
            thing.aside = true;
            thing.stopped = true;
            this.stats.stops += 1;
            this.onEvent({ type: 'scooter-aside', thing });
          }
        }
      }
    }
    return most;
  }

  /** A friend's scooter sets off when the bike comes near, and trundles along its side of the road. */
  moveScooters(dt) {
    for (const thing of this.scooters) {
      // Pulled over, it drifts to the edge of the grass and waits there, even once the bike has gone by.
      if (thing.aside) thing.over = Math.min(1, (thing.over ?? 0) + dt / SCOOTER.aside);
      if (thing.done) continue;
      if (!thing.moving && thing.from - this.s <= SCOOTER.starts) {
        thing.moving = true;
        this.onEvent({ type: 'scooter', thing });
      }
      if (!thing.moving) continue;
      if (thing.pos < thing.to) thing.pos = Math.min(thing.to, thing.pos + this.cruise * SCOOTER.speed * dt);
      else thing.aside = true;
      if (this.s > thing.pos + 2) {
        thing.done = true;
        if (!thing.stopped) {
          this.stats.passed += 1;
          this.onEvent({ type: 'pass', kind: 'scooter', thing });
        }
      }
    }
  }

  fly(dt) {
    const { air } = this;
    air.t += dt;
    const share = air.t / BIKE.jumpSeconds;
    this.height = Math.max(0, 4 * BIKE.jumpHeight * share * (1 - share));
    if (share < 1) return;
    this.air = null;
    this.height = 0;
    this.stats.jumps += 1;
    this.onEvent({ type: 'land' });
  }

  passBends(before) {
    const { stats } = this;
    const next = this.plan.bends[this.nextBend];
    if (next && before <= next.from && this.s > next.from) {
      this.riding = { bend: next, off: this.offRoad };
      this.nextBend += 1;
      this.onEvent({ type: 'bend', bend: next });
    }
    const { riding } = this;
    if (riding && this.s >= riding.bend.to) {
      this.riding = null;
      this.struggle = 0;
      this.towed = null;
      if (riding.off) {
        this.onEvent({ type: 'rough', bend: riding.bend });
        return;
      }
      stats.clean += 1;
      this.flow = Math.min(BIKE.flowMost, this.flow + 1);
      if (riding.bend.big) stats.medal = true;
      this.onEvent({ type: 'clean', bend: riding.bend, flow: this.flow });
    }
  }

  /** Whatever the bike has just gone past, and whether it was near enough across the road to matter. */
  passThings() {
    const { stats, passing } = this;
    while (this.nextThing < passing.length && passing[this.nextThing].at <= this.s) {
      const thing = passing[this.nextThing];
      this.nextThing += 1;
      thing.done = true;
      const near = Math.abs(this.x - thing.x);
      const grounded = this.air === null;
      if (thing.kind === 'star' && near <= BIKE.starReach) {
        thing.taken = true;
        stats.stars += 1;
        this.onEvent({ type: 'star', thing });
      } else if (thing.kind === 'snow' && near <= BIKE.snowReach) {
        thing.taken = true;
        stats.snow += 1;
        this.onEvent({ type: 'snow', thing });
      } else if (thing.kind === 'puddle' && grounded && near <= thing.reach) {
        thing.taken = true;
        stats.splashes += 1;
        this.splashLeft = BIKE.splashSeconds;
        this.onEvent({ type: 'splash', thing });
      } else if (thing.kind === 'boost' && grounded && near <= thing.reach) {
        thing.taken = true;
        stats.boosts += 1;
        this.boostLeft = BIKE.boostSeconds;
        this.onEvent({ type: 'boost', thing });
      } else if (thing.kind === 'ramp' && grounded && near <= thing.reach && this.v >= BIKE.jumpLeast) {
        thing.taken = true;
        this.air = { t: 0 };
        this.onEvent({ type: 'jump', thing });
      } else if (thing.kind === 'sheep' && !thing.stopped) {
        stats.passed += 1;
        this.onEvent({ type: 'pass', kind: 'sheep', thing });
      }
    }
  }

  crossBridges() {
    const on = this.bridges.some(({ from, to }) => this.s >= from && this.s <= to);
    if (on === this.onBridge) return;
    this.onBridge = on;
    this.onEvent({ type: on ? 'bridge' : 'bridge-end' });
  }

  finish() {
    if (this.state !== 'riding') return;
    this.state = 'finished';
    this.stats.seconds = this.elapsed;
    this.air = null;
    this.height = 0;
    if (this.rules.cup) {
      this.stats.cup = true;
      this.onEvent({ type: 'cup' });
    }
    this.onEvent({ type: 'finished' });
  }
}
