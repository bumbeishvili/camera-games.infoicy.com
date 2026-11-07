// The rules of a run. No screen, camera or sound in this file: moves come in and what happened
// comes out as events, so all of it runs in the unit tests.
//
// The trail is laid out ahead of time, and every obstacle asks for a jump or a squat. There's a
// stretch of trail before each one where that move counts, and a move anywhere in that stretch
// clears the obstacle, however early it is. The fighter just hangs in the air for longer.
// Nobody loses here. Missing a move either stops the fighter to wait for it, or costs a stumble.

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
  bough: { needs: 'squat', length: 1.1, height: 1.15 },
  arch: { needs: 'squat', length: 1.3, height: 1.2 },
};

const JUMP_KINDS = ['log', 'hay', 'rocks', 'stream'];
const SQUAT_KINDS = ['bough', 'arch'];

const FIRST_OBSTACLE_SECONDS = 3;
const AFTER_LAST_SECONDS = 1.5;
const SQUAT_EVERY = 4; // About one obstacle in this many asks for a squat.
const STOP_GAP = 1.5; // Metres short of an obstacle where the fighter stops to wait.
const BRAKE_RATE = 1.1; // Slowing down, as a share of what's left to go, each tenth of a second.
const SPEED_CHANGE = 2.2;
const SHORTEST_HOP = 0.62; // Seconds, for a move that isn't clearing anything.
const LOWEST_JUMP = 1.4;
const HIGHEST_JUMP = 3.2;
const FLIGHT_PAST = 1.22; // A jump lands this much further on than the far edge of what it clears.
const SLIDE_PAST = 1.25;
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

/** A line of stars to run through at the start, and another after each obstacle. */
function layStarLines(course, speed) {
  const lines = [];
  const lineFrom = (from) => {
    for (let i = 0; i < STAR_LINE.count; i += 1) lines.push({ at: from + i * STAR_LINE.spacing, taken: false });
  };
  lineFrom(speed * STAR_LINE.firstAfter);
  for (const { at, length } of course.slice(0, -1)) lineFrom(at + length + speed * STAR_LINE.afterObstacle);
  return lines;
}

/** Lays out a trail. Exported so the tests can look at one. */
export function layCourse({ obstacles, pace, squats = true, random = Math.random }) {
  const { speed, every } = PACES[pace];
  const course = [];
  let at = speed * FIRST_OBSTACLE_SECONDS;
  let sinceSquat = 0;
  for (let i = 0; i < obstacles; i += 1) {
    sinceSquat += 1;
    // Never in the first couple, and never twice running, so it isn't all squats by chance.
    const squat = squats && i >= 2 && sinceSquat >= 2 && random() < 1 / (SQUAT_EVERY - 1);
    if (squat) sinceSquat = 0;
    const kinds = squat ? SQUAT_KINDS : JUMP_KINDS;
    const kind = kinds[Math.floor(random() * kinds.length)];
    const { needs, length, height } = OBSTACLES[kind];
    course.push({ index: i, kind, needs, length, height, at, state: 'ahead' });
    at += length + speed * between(random, every);
  }
  return { course, starLines: layStarLines(course, speed), end: at - speed * between(random, every) + speed * AFTER_LAST_SECONDS };
}

const emptyStats = () => ({
  jumps: 0,
  squats: 0,
  cleared: 0,
  bumps: 0,
  stars: 0,
  linedStars: 0,
  streak: 0,
  bestStreak: 0,
  seconds: 0,
  movingSeconds: 0,
  hands: { open: 0 },
});

export class Run {
  /**
   * obstacles is how many there are, pace is one of PACES. squats says whether any obstacles ask
   * for one. whenMissed is 'wait' to stop and wait for the move, or 'stumble' to run into it.
   */
  constructor({
    obstacles = 20,
    pace = 'slow',
    squats = true,
    whenMissed = 'wait',
    random = Math.random,
    onEvent = () => {},
  } = {}) {
    this.settings = PACES[pace];
    this.whenMissed = whenMissed;
    this.onEvent = onEvent;
    const { course, starLines, end } = layCourse({ obstacles, pace, squats, random });
    this.course = course;
    this.starLines = starLines;
    this.nextStar = 0;
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

  /** The child squatted. */
  squat() {
    if (this.state !== 'running') return false;
    this.noteActivity();
    if (this.move?.obstacle) return false;
    this.stats.squats += 1;
    return this.startMove('squat');
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
      move.travel = reach * (kind === 'jump' ? FLIGHT_PAST : SLIDE_PAST) + 0.3;
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
  }

  bump(obstacle) {
    const { stats } = this;
    obstacle.state = 'bumped';
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

  /** How far through a slide along the ground, or 0 if not sliding. */
  get slide() {
    return this.move?.kind === 'squat' ? this.through : 0;
  }

  wantedSpeed(next) {
    const { speed } = this.settings;
    if (this.move?.obstacle) return this.move.pace;
    if (this.stumbleLeft > 0) return speed * STUMBLE_SPEED;
    if (this.resting && !this.move) return 0;
    // A move that wasn't what was wanted doesn't carry the runner into what it's waiting at.
    if (this.whenMissed === 'wait' && next && !this.move?.obstacle) {
      const left = this.gapTo(next) - STOP_GAP;
      const stoppingFrom = speed * 0.9;
      if (left <= 0) return 0;
      if (left < stoppingFrom) return speed * (left / stoppingFrom) * 0.9 + 0.3;
    }
    return speed;
  }

  /** Running through a star picks it up, whatever the runner is doing. */
  collectStars() {
    const { starLines, stats } = this;
    while (this.nextStar < starLines.length && this.distance >= starLines[this.nextStar].at) {
      const star = starLines[this.nextStar];
      star.taken = true;
      this.nextStar += 1;
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
      if (this.announced !== next.index && this.inReach(next)) {
        this.announced = next.index;
        this.emit('ask', { needs: next.needs, obstacle: next });
      }
      const isWaiting = this.speed === 0 && this.gapTo(next) <= STOP_GAP + 0.2 && !this.move?.obstacle;
      if (isWaiting !== this.waiting) {
        this.waiting = isWaiting;
        if (isWaiting) this.emit('waiting', { needs: next.needs, obstacle: next });
      }
      if (this.gapTo(next) <= 0) this.bump(next);
    }

    if (this.distance >= this.end) {
      this.state = 'finished';
      this.move = null;
      this.emit('finished', { stats });
    }
  }
}
