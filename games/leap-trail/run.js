// The rules of a run. No screen, camera or sound in this file: moves come in and what happened
// comes out as events, so all of it runs in the unit tests.
//
// The trail is laid out ahead of time. Jumping is the only move asked for: there are no squats, so a
// child never has to wonder which move is wanted. There's a stretch of trail before each obstacle
// where a jump counts, and a jump anywhere in that stretch clears it, however early it is. The
// fighter just hangs in the air for longer. The trail has three lanes. Most obstacles go right across
// and need a jump, but some only fill one or two lanes, and those can be passed by stepping into a
// free lane as well as by jumping them, which is what makes moving across worth it. Lines of stars
// are in one lane or another, often the free one. Nobody loses here. Missing a jump either stops the
// fighter to wait for it, or costs a stumble, and a missed star costs nothing.
//
// Each level, from 1 to 10, is a little harder than the one before: see trailLevel below.
import { clampLevel, ramp, stepsAt } from '../../core/levels.js';

export const PACES = {
  // speed is metres a second, every is seconds between obstacles, and early is how long before
  // an obstacle a move starts to count. The running is fast, but all the time a child gets is set in
  // seconds, so going faster doesn't ask them to move any sooner. It's generous on purpose: this is
  // about moving, not reaction time, and the camera adds a moment of delay to everything. A move as
  // soon as it's asked for sends the runner straight over, in a dash.
  slow: { speed: 14, every: [3, 3.9], early: 2 },
  medium: { speed: 18, every: [2.6, 3.3], early: 1.7 },
  fast: { speed: 24, every: [2.1, 2.7], early: 1.4 },
};

export const OBSTACLES = {
  log: { needs: 'jump', length: 0.9, height: 0.75 },
  hay: { needs: 'jump', length: 1.2, height: 1.05 },
  rocks: { needs: 'jump', length: 1.4, height: 0.7 },
  stream: { needs: 'jump', length: 2.4, height: 0.1 },
  // Later levels bring new things to jump, from the level given. Each still goes right across.
  fence: { needs: 'jump', length: 0.5, height: 1.1, from: 4 },
  bale: { needs: 'jump', length: 1.25, height: 1.2, from: 6 }, // Round bales, which roll in and stop.
  sheep: { needs: 'jump', length: 0.8, height: 0.95, from: 8 }, // A flock crossing the trail.
};

// The lanes, from the child's left to their right as seen in the mirror. 0 is the middle.
export const LANES = [-1, 0, 1];
export const GOLD_STARS = 5; // What a golden star is worth.

/**
 * What a level changes. Level 1 is the game as it always was. The pace and the length a grown-up
 * chose stay theirs, and a level only goes a little beyond that pace. All the time a child gets is
 * still in seconds, and at level 10 it's never under 85% of level 1's.
 */
export function trailLevel(level = 1) {
  return {
    // Running a little faster, up to 12% by level 10, which is most of what feels harder.
    speed: ramp(level, 1, 1.12),
    // Obstacles a little closer together in time, down to 85% of the pace's gaps by level 10.
    gaps: ramp(level, 1, 0.85),
    // The stretch where a jump counts, in seconds, down to 85% of the pace's by level 10.
    early: ramp(level, 1, 0.85),
    // How often a line of stars is in a different lane from the one before.
    laneMoves: ramp(level, 0.65, 0.85),
    // From level 3, a golden star over some obstacles, in one lane: jumping over in that lane catches
    // it, so it's a step and then a jump. Missing it costs nothing.
    gold: stepsAt(level, { 1: 0, 3: 0.25, 5: 0.35, 7: 0.45, 9: 0.5 }),
    // From level 5, some lines of stars cross into the next lane halfway along.
    zigzag: stepsAt(level, { 1: 0, 5: 0.2, 7: 0.3, 9: 0.4 }),
    // How many obstacles go right across, and how many fill only one lane. The rest fill two. At
    // level 1 most go across. A stream always does.
    full: ramp(level, 0.75, 0.3),
    single: ramp(level, 0, 0.35),
    // How often the free lane is on the other side from the last obstacle's, so it's a step each time.
    freeSwitch: ramp(level, 0.3, 0.85),
    // How often stars wait in the free lane beside an obstacle, for stepping round it.
    freeStars: ramp(level, 0.5, 0.9),
    // New obstacles: a fence from level 4, round bales rolling in from 6, and sheep from 8.
    kinds: Object.keys(OBSTACLES).filter((kind) => (OBSTACLES[kind].from ?? 1) <= clampLevel(level)),
  };
}

/** A pace, as a level plays it. At level 1 it's the pace itself. */
export function paceAt(pace, level = 1) {
  const { speed, every, early } = PACES[pace];
  const rules = trailLevel(level);
  return { speed: speed * rules.speed, every: every.map((seconds) => seconds * rules.gaps), early: early * rules.early };
}

const FIRST_OBSTACLE_SECONDS = 3;
const AFTER_LAST_SECONDS = 1.5;
const STOP_GAP = 1.5; // Metres short of an obstacle where the fighter stops to wait.
const BRAKE_RATE = 1.1; // Slowing down, as a share of what's left to go, each tenth of a second.
const SPEED_CHANGE = 2.2;
const SHORTEST_HOP = 0.62; // Seconds, for a move that isn't clearing anything.
const LOWEST_JUMP = 1.4;
const HIGHEST_JUMP = 3.2;
const FLIGHT_PAST = 1.22; // A jump lands this much further on than the far edge of what it clears.
const LONGEST_MOVE = 1.35; // Seconds. A move made early goes faster, to be over by then.
const STUMBLE_SECONDS = 0.7;
const STUMBLE_SPEED = 0.5;
const STARS_FOR_CLEARING = 3;
const REST_AFTER = 9; // A child who hasn't moved for this long is resting, and the fighter waits.
// Lines of stars on the path, picked up just by running through them.
const STAR_LINE = { count: 6, spacing: 2.6, firstAfter: 0.5, afterObstacle: 0.45 };

const between = (random, [low, high]) => low + random() * (high - low);

/**
 * A jump is an arc across the distance it travels. This makes the arc high enough to be well over
 * the obstacle at both its near and far edges, wherever in the arc those fall.
 */
function jumpHeight(obstacle, gap, travel) {
  const near = Math.max(0.1, gap / travel);
  const far = (gap + obstacle.length) / travel;
  const lowest = Math.min(near * (1 - near), far * (1 - far));
  const needed = (obstacle.height + 0.25) / (4 * lowest);
  return Math.min(HIGHEST_JUMP, Math.max(LOWEST_JUMP + travel * 0.06, needed));
}

/** Whether an obstacle fills this lane. One without lanes goes right across. */
export const fills = (obstacle, lane) => (obstacle.lanes ?? LANES).includes(lane);
const freeLanes = (obstacle) => LANES.filter((lane) => !fills(obstacle, lane));

/**
 * Which lanes each obstacle fills: all three, two or one. With the lanes on, the free lane is often on
 * the other side from the last one. With them off, the runner is always in the middle, so every
 * obstacle fills the middle lane and still needs its jump.
 */
function layWidths(course, lanes, random, rules) {
  let lastFree = null;
  for (const obstacle of course) {
    obstacle.lanes = [...LANES];
    if (obstacle.kind === 'stream') continue;
    const roll = random();
    if (roll < rules.full) continue;
    const width = roll < rules.full + rules.single ? 1 : 2;
    if (!lanes) {
      obstacle.lanes = width === 1 ? [0] : random() < 0.5 ? [-1, 0] : [0, 1];
      continue;
    }
    const pick = (options) => options[Math.floor(random() * options.length)];
    if (lastFree === null) lastFree = pick(LANES);
    // Whether the lane that was free last time is filled this time, so it's a step across.
    const switching = random() < rules.freeSwitch;
    obstacle.switched = switching;
    if (width === 2) {
      // The one free lane: across from the last free lane when it switches, and the same one if not.
      const free = !switching ? lastFree : lastFree === 0 ? pick([-1, 1]) : -lastFree;
      obstacle.lanes = LANES.filter((lane) => lane !== free);
      lastFree = free;
    } else {
      // The one lane filled: the lane that was free last time when it switches, and another if not.
      const filled = switching ? lastFree : pick(LANES.filter((lane) => lane !== lastFree));
      obstacle.lanes = [filled];
      lastFree = switching ? (filled === 0 ? pick([-1, 1]) : -filled) : lastFree;
    }
  }
}

/**
 * A line of stars to run through at the start, and another after each obstacle. The first is in the
 * middle lane, where the runner starts. After that, each is often in a different lane from the one
 * before, so there's a reason to move across, but never more than one lane's step away. A line before
 * an obstacle that leaves a lane free leads towards that lane, and stars often wait in it beside the
 * obstacle. On later levels a golden star over an obstacle is on that path too, and a line can cross
 * a lane halfway.
 */
function layStarLines(course, speed, lanes, random, rules) {
  const lines = [];
  let lane = 0;
  const nextTo = () => {
    const options = LANES.filter((other) => Math.abs(other - lane) === 1);
    return options[Math.floor(random() * options.length)];
  };
  const lineFrom = (from, straight = false) => {
    const crosses = !straight && lanes && rules.zigzag > 0 && random() < rules.zigzag;
    const half = Math.ceil(STAR_LINE.count / 2);
    for (let i = 0; i < STAR_LINE.count; i += 1) {
      if (crosses && i === half) lane = nextTo();
      lines.push({ at: from + i * STAR_LINE.spacing, lane, taken: false });
    }
  };
  /** Before an obstacle that leaves a lane free: a step towards the nearest free lane. */
  const leadTowards = (obstacle) => {
    if (!lanes || !obstacle || obstacle.lanes.length === LANES.length) return false;
    const open = freeLanes(obstacle);
    if (!open.includes(lane)) {
      const nearest = open.reduce((best, other) => (Math.abs(other - lane) < Math.abs(best - lane) ? other : best));
      lane += Math.sign(nearest - lane);
    }
    return true;
  };
  lineFrom(speed * STAR_LINE.firstAfter, leadTowards(course[0]));
  course.forEach((obstacle, index) => {
    if (rules.gold > 0 && random() < rules.gold) {
      // Over a lane the obstacle fills, in the lane the stars were in or one step from it.
      const near = lanes ? obstacle.lanes.filter((other) => Math.abs(other - lane) <= 1) : obstacle.lanes.filter((other) => other === 0);
      if (near.length) {
        lane = near[Math.floor(random() * near.length)];
        obstacle.gold = { lane, taken: false, missed: false };
      }
    }
    const open = freeLanes(obstacle);
    if (!obstacle.gold && lanes && open.includes(lane) && random() < rules.freeStars) {
      // Stars beside the obstacle, in the free lane, for stepping round it.
      for (const at of [obstacle.at - 5, obstacle.at + obstacle.length / 2, obstacle.at + obstacle.length + 4]) lines.push({ at, lane, taken: false, beside: true });
    }
    if (index === course.length - 1) return;
    const leading = leadTowards(course[index + 1]);
    if (!leading && lanes && random() < rules.laneMoves) lane = nextTo();
    lineFrom(obstacle.at + obstacle.length + speed * STAR_LINE.afterObstacle, leading);
  });
  return lines.sort((a, b) => a.at - b.at);
}

/** Lays out a trail, at a level. Exported so the tests can look at one. */
export function layCourse({ obstacles, pace, lanes = true, random = Math.random, levelNumber = 1 }) {
  const rules = trailLevel(levelNumber);
  const { speed, every } = paceAt(pace, levelNumber);
  const course = [];
  let at = speed * FIRST_OBSTACLE_SECONDS;
  for (let i = 0; i < obstacles; i += 1) {
    const kind = rules.kinds[Math.floor(random() * rules.kinds.length)];
    const { needs, length, height } = OBSTACLES[kind];
    course.push({ index: i, kind, needs, length, height, at, state: 'ahead' });
    at += length + speed * between(random, every);
  }
  const end = at - speed * between(random, every) + speed * AFTER_LAST_SECONDS;
  layWidths(course, lanes, random, rules);
  return { course, starLines: layStarLines(course, speed, lanes, random, rules), end };
}

const emptyStats = () => ({
  jumps: 0,
  cleared: 0,
  bumps: 0,
  stars: 0,
  linedStars: 0,
  gold: 0,
  stepped: 0, // Obstacles passed by stepping into a free lane, which counts as clearing them.
  laneMoves: 0,
  streak: 0,
  bestStreak: 0,
  seconds: 0,
  movingSeconds: 0,
  hands: { open: 0 },
});

export class Run {
  /**
   * obstacles is how many there are, pace is one of PACES. lanes says whether the lines of stars
   * move between lanes, or all stay in the middle. whenMissed is 'wait' to stop and wait for the
   * move, or 'stumble' to run into it. levelNumber is the level, from 1 to 10: see trailLevel.
   */
  constructor({
    obstacles = 20,
    pace = 'slow',
    lanes = true,
    whenMissed = 'wait',
    levelNumber = 1,
    random = Math.random,
    onEvent = () => {},
  } = {}) {
    this.levelNumber = levelNumber;
    this.levelRules = trailLevel(levelNumber);
    this.settings = paceAt(pace, levelNumber);
    this.whenMissed = whenMissed;
    this.onEvent = onEvent;
    const { course, starLines, end } = layCourse({ obstacles, pace, lanes, random, levelNumber });
    this.course = course;
    this.starLines = starLines;
    this.nextStar = 0;
    this.lane = 0; // Which of LANES the runner is in.
    this.end = end;
    this.distance = 0;
    this.speed = 0;
    this.time = 0;
    this.state = 'ready'; // ready, running, finished
    this.move = null; // What the fighter is doing: { kind, startedAt, lasts, height }.
    this.stumbleLeft = 0;
    this.waiting = false;
    this.idleSeconds = 0;
    this.stats = emptyStats();
    this.announced = null;
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  begin() {
    this.state = 'running';
    this.emit('begin');
  }

  /** The next obstacle not yet dealt with, if any. */
  get next() {
    return this.course.find(({ state }) => state === 'ahead') ?? null;
  }

  /** How far ahead an obstacle's near edge is. */
  gapTo(obstacle) {
    return obstacle.at - this.distance;
  }

  /** Whether this obstacle is in the runner's lane, so it has to be jumped rather than gone round. */
  blocks(obstacle) {
    return obstacle !== null && fills(obstacle, this.lane);
  }

  /** Whether a jump is wanted right now: the next obstacle is close and in the runner's lane. */
  get mustJump() {
    const { next } = this;
    return Boolean(next) && next.state === 'ahead' && this.inReach(next) && this.blocks(next);
  }

  /** Whether a move right now would count for this obstacle. */
  inReach(obstacle) {
    return obstacle !== null && this.gapTo(obstacle) <= this.reachDistance;
  }

  /** How long before an obstacle a move counts, in metres. */
  get reachDistance() {
    return this.settings.speed * this.settings.early;
  }

  get resting() {
    return this.idleSeconds > REST_AFTER;
  }

  /** The child moved. The fighter only stops and waits for a child who has stopped. */
  noteActivity(dt = 0) {
    this.idleSeconds = 0;
    this.stats.movingSeconds += dt;
  }

  /** The child jumped. details can say how: { hand: 'open' } for a raised open hand. */
  jump({ hand = null } = {}) {
    if (this.state !== 'running') return false;
    this.noteActivity();
    if (this.move?.obstacle) return false; // Already on the way over something.
    this.stats.jumps += 1;
    if (hand === 'open') this.stats.hands.open += 1;
    return this.startMove('jump');
  }

  /** The child moved across into a lane, which is one of LANES. That's always allowed, even mid-jump. */
  setLane(lane) {
    if (!LANES.includes(lane) || lane === this.lane) return;
    const from = this.lane;
    this.lane = lane;
    if (this.state !== 'running') return;
    this.noteActivity();
    this.stats.laneMoves += 1;
    this.emit('lane', { lane, from });
  }

  /**
   * Starts the fighter's move. If an obstacle wanting this move is close enough, the move lasts
   * until the fighter is past it, so it clears whenever it was started, even from a standstill.
   * Otherwise it's a short one for the fun of it, and costs nothing. Doing a move while one's
   * going starts it over.
   */
  startMove(kind) {
    const obstacle = this.next;
    const counts = obstacle && obstacle.needs === kind && this.inReach(obstacle);
    const move = { kind, startedAt: this.time, from: this.distance, lasts: SHORTEST_HOP, travel: null, height: LOWEST_JUMP, obstacle: null };
    if (counts) {
      const gap = this.gapTo(obstacle);
      const reach = gap + obstacle.length;
      move.travel = reach * FLIGHT_PAST + 0.3;
      move.height = jumpHeight(obstacle, gap, move.travel);
      move.obstacle = obstacle;
      move.pace = Math.max(this.settings.speed, move.travel / LONGEST_MOVE);
      move.lasts = move.travel / move.pace;
      // Everything's now decided, so a slow moment on this computer can't turn it into a bump.
      obstacle.state = 'passing';
      this.speed = Math.max(this.speed, move.pace * 0.9);
    } else if (obstacle && this.inReach(obstacle)) {
      this.emit('wrong-move', { kind, needs: obstacle.needs });
    }
    this.move = move;
    if (counts) this.waiting = false;
    this.emit('move', { kind, counts: Boolean(counts), lasts: move.lasts, height: move.height });
    return Boolean(counts);
  }

  clear(obstacle) {
    const { stats } = this;
    obstacle.state = 'cleared';
    stats.cleared += 1;
    stats.streak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    stats.stars += STARS_FOR_CLEARING;
    this.emit('cleared', { obstacle, streak: stats.streak, stars: stats.stars });
    if (obstacle.gold) this.reachGold(obstacle);
  }

  /** Over the middle of an obstacle with a golden star: it's caught in its own lane, and only there. */
  reachGold(obstacle) {
    const { gold } = obstacle;
    if (gold.lane !== this.lane) {
      gold.missed = true;
      return;
    }
    gold.taken = true;
    this.stats.gold += 1;
    this.stats.stars += GOLD_STARS;
    this.emit('gold', { obstacle, stars: this.stats.stars });
  }

  /** Gone round, in a free lane: that clears it, as a jump would. */
  passBy(obstacle) {
    obstacle.state = 'passing';
    obstacle.steppedRound = true;
    this.stats.stepped += 1;
    this.emit('passed-by', { obstacle });
  }

  bump(obstacle) {
    const { stats } = this;
    obstacle.state = 'bumped';
    if (obstacle.gold) obstacle.gold.missed = true;
    stats.bumps += 1;
    stats.streak = 0;
    this.stumbleLeft = STUMBLE_SECONDS;
    this.emit('bump', { obstacle });
  }

  /** How far through its move the fighter is, from 0 to 1. */
  get through() {
    const { move } = this;
    if (!move) return 0;
    const share = move.travel ? (this.distance - move.from) / move.travel : (this.time - move.startedAt) / move.lasts;
    return Math.min(1, share);
  }

  /** How high the fighter is off the ground, and how far through its jump, right now. */
  get air() {
    if (this.move?.kind !== 'jump') return { height: 0, through: 0 };
    const { through } = this;
    return { height: this.move.height * 4 * through * (1 - through), through };
  }

  wantedSpeed(next) {
    const { speed } = this.settings;
    if (this.move?.obstacle) return this.move.pace;
    if (this.stumbleLeft > 0) return speed * STUMBLE_SPEED;
    if (this.resting && !this.move) return 0;
    // A move that wasn't what was wanted doesn't carry the runner into what it's waiting at. Only
    // something in the runner's lane is waited at: one with a free lane can be gone round.
    if (this.whenMissed === 'wait' && next && !this.move?.obstacle && this.blocks(next)) {
      const left = this.gapTo(next) - STOP_GAP;
      const stoppingFrom = speed * 0.9;
      if (left <= 0) return 0;
      if (left < stoppingFrom) return speed * (left / stoppingFrom) * 0.9 + 0.3;
    }
    return speed;
  }

  /** Running through a star in the same lane picks it up, whatever the runner is doing. */
  collectStars() {
    const { starLines, stats } = this;
    while (this.nextStar < starLines.length && this.distance >= starLines[this.nextStar].at) {
      const star = starLines[this.nextStar];
      this.nextStar += 1;
      if (star.lane !== this.lane) {
        star.missed = true;
        continue;
      }
      star.taken = true;
      stats.linedStars += 1;
      this.emit('star-line', { star });
    }
  }

  update(dt) {
    if (this.state !== 'running' && this.state !== 'finished') return;
    this.time += dt;
    if (this.state === 'finished') {
      this.speed = Math.max(0, this.speed - dt * this.settings.speed * 0.8);
      this.distance += this.speed * dt;
      return;
    }
    const { stats } = this;
    stats.seconds += dt;
    this.idleSeconds += dt;

    if (this.stumbleLeft > 0) this.stumbleLeft = Math.max(0, this.stumbleLeft - dt);

    const next = this.next;
    const wanted = this.wantedSpeed(next);
    const rate = wanted < this.speed ? SPEED_CHANGE * 2 : SPEED_CHANGE;
    this.speed += (wanted - this.speed) * Math.min(1, dt * rate);
    if (wanted === 0 && this.speed < 0.08) this.speed = 0;
    this.distance += this.speed * dt;
    this.collectStars();

    if (this.move && this.through >= 1) {
      const finished = this.move;
      this.move = null;
      this.emit('landed', { kind: finished.kind });
    }

    for (const obstacle of this.course) {
      if (obstacle.state === 'passing' && this.distance >= obstacle.at + obstacle.length * 0.5) this.clear(obstacle);
    }

    if (next && next.state === 'ahead') {
      // Time to ask for the move, once it would count.
      if (this.announced !== next.index && this.inReach(next) && this.blocks(next)) {
        this.announced = next.index;
        this.emit('ask', { needs: next.needs, obstacle: next });
      }
      const isWaiting = this.speed === 0 && this.gapTo(next) <= STOP_GAP + 0.2 && !this.move?.obstacle && this.blocks(next);
      if (isWaiting !== this.waiting) {
        this.waiting = isWaiting;
        if (isWaiting) this.emit('waiting', { needs: next.needs, obstacle: next });
      }
      if (this.gapTo(next) <= 0) {
        if (!this.blocks(next)) this.passBy(next);
        else if (this.whenMissed === 'wait') {
          // Stepped into its lane at the last moment: it waits right here, rather than running into it.
          this.distance = next.at - 0.01;
          this.speed = 0;
        } else this.bump(next);
      }
    }

    if (this.distance >= this.end) {
      this.state = 'finished';
      this.move = null;
      this.emit('finished', { stats });
    }
  }
}
