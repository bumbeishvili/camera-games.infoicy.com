// The rules of Frost Arena. No screen, camera or sound in this file, so it all runs in the unit tests.
//
// A small snowy yard with crates and containers to go round, a team at each end, and a match of tag with
// rifles: the child's team in blue, with Giraffe on it, against the computer's in red. It's played with both
// hands, each with its own job. The hand in play holds the rifle: moving it from side to side turns to look,
// and opening it fires, by itself, at whoever is in the sights. The other hand is the helper: open, it walks
// forward the way the child is looking, and making a fist stops and puts a new magazine in. There are
// magazines without end, but each holds thirty rounds, and changing one takes a moment.
//
// Nobody gets hurt. A player who's been hit enough is tagged out: they sit down, and are back at their own
// end a few seconds later. The child's team wins with the number of tags a grown-up chose, and the other team,
// on Medium and Tough, by tagging the child that many times. Only an open hand
// does anything: a hand that's missing, closed or can't be read never fires and never walks, and with both
// hands down for a few seconds it's a rest, when the other team stops and waits, and nothing can happen.
import { ramp, stepsAt } from '../../core/levels.js';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const between = (random, [low, high]) => low + random() * (high - low);
/** The shortest way round from one direction to another. */
export const turnBetween = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
/** Which way it is from one place to another. Heading 0 is up the yard, along -z, and turning right adds to it. */
export const headingTo = (dx, dz) => Math.atan2(dx, -dz);
export const forwardOf = (heading) => ({ x: Math.sin(heading), z: -Math.cos(heading) });
const gapBetween = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const degrees = (value) => (value * Math.PI) / 180;

/* ---------- the yard ---------- */

// The yard is 44 across and 30 from end to end, with a team's end at each: blue's is the near one, and red's the far.
export const YARD = { halfX: 22, halfZ: 15 };
export const BODY = 0.45; // How wide a player is, from the middle, to things in the way.

// What's in the way, as { x, z, w, d, h, kind }: where its middle is, how wide and deep it is, and how tall.
// One half of the yard is listed, and the other is the same turned half way round, so neither end has it
// easier. The long container in the middle is its own other half.
const HALF_YARD = [
  { x: -10, z: 1.5, w: 2.6, d: 7, h: 2.6, kind: 'container' },
  { x: -5, z: -6, w: 2.4, d: 2.4, h: 1.7, kind: 'crate' },
  { x: -17, z: -6, w: 5, d: 1.2, h: 2.1, kind: 'wall' },
  { x: -15.5, z: 7, w: 3, d: 3, h: 2.4, kind: 'crates' },
  { x: -3.5, z: 10.4, w: 4, d: 1.2, h: 1.5, kind: 'wall' },
];
export const BLOCKS = [
  { x: 0, z: 0, w: 8, d: 2.6, h: 2.6, kind: 'container' },
  ...HALF_YARD,
  ...HALF_YARD.map((block) => ({ ...block, x: -block.x, z: -block.z })),
];

// Where each team comes in, and comes back to: three places along its own end, facing the other.
export const BASES = [
  { z: 13, heading: 0, spots: [0, -6, 6] },
  { z: -13, heading: Math.PI, spots: [0, 6, -6] },
];
// Places worth going to, for a player the computer plays: the middle, the alleys and each end.
const HAUNTS = [
  { x: 0, z: 4.5 }, { x: 0, z: -4.5 }, { x: -6.5, z: 0 }, { x: 6.5, z: 0 },
  { x: -20, z: 0 }, { x: 20, z: 0 }, { x: -13, z: -10 }, { x: 13, z: 10 },
  { x: -8, z: 9 }, { x: 8, z: -9 }, { x: 13, z: -2 }, { x: -13, z: 2 },
];

const inside = (block, x, z, grow) => Math.abs(x - block.x) < block.w / 2 + grow && Math.abs(z - block.z) < block.d / 2 + grow;

/** Whether a player can stand at a place: inside the yard, and clear of everything in the way. */
export function freeAt(x, z, body = BODY) {
  if (Math.abs(x) > YARD.halfX - body || Math.abs(z) > YARD.halfZ - body) return false;
  return !BLOCKS.some((block) => inside(block, x, z, body));
}

/** Whether there's a clear line between two places, with nothing in the way: what can be seen, and hit. */
export function clearLine(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  for (const block of BLOCKS) {
    // Where along the line it goes into and comes out of the block's width, and its depth.
    let enter = 0;
    let leave = 1;
    let missed = false;
    for (const [start, step, middle, half] of [[from.x, dx, block.x, block.w / 2], [from.z, dz, block.z, block.d / 2]]) {
      if (Math.abs(step) < 1e-9) {
        if (Math.abs(start - middle) >= half) missed = true;
        continue;
      }
      const a = (middle - half - start) / step;
      const b = (middle + half - start) / step;
      enter = Math.max(enter, Math.min(a, b));
      leave = Math.min(leave, Math.max(a, b));
    }
    if (!missed && enter < leave) return false;
  }
  return true;
}

/** How far a shot goes along a heading before it meets something: a block, or the yard's fence. */
export function reachAlong(from, heading, most = 60) {
  const forward = forwardOf(heading);
  let near = most;
  const edges = [[forward.x, YARD.halfX - from.x, -YARD.halfX - from.x], [forward.z, YARD.halfZ - from.z, -YARD.halfZ - from.z]];
  for (const [step, high, low] of edges) {
    if (Math.abs(step) < 1e-9) continue;
    near = Math.min(near, (step > 0 ? high : low) / step);
  }
  for (let away = 0.5; away < near; away += 0.25) {
    const x = from.x + forward.x * away;
    const z = from.z + forward.z * away;
    if (BLOCKS.some((block) => inside(block, x, z, 0))) return away;
  }
  return Math.max(0, near);
}

// The yard as squares a pace across, for finding the way round things.
const CELL = 1;
const COLS = Math.round((YARD.halfX * 2) / CELL);
const ROWS = Math.round((YARD.halfZ * 2) / CELL);
const colOf = (x) => clamp(Math.floor((x + YARD.halfX) / CELL), 0, COLS - 1);
const rowOf = (z) => clamp(Math.floor((z + YARD.halfZ) / CELL), 0, ROWS - 1);
const centreOf = (index) => ({ x: ((index % COLS) + 0.5) * CELL - YARD.halfX, z: (Math.floor(index / COLS) + 0.5) * CELL - YARD.halfZ });
const OPEN_CELLS = Array.from({ length: COLS * ROWS }, (_, index) => {
  const { x, z } = centreOf(index);
  return freeAt(x, z, BODY + 0.15);
});

/** The nearest square a player can stand in to a place. */
function nearestOpen(x, z) {
  const start = rowOf(z) * COLS + colOf(x);
  if (OPEN_CELLS[start]) return start;
  let best = start;
  let least = Infinity;
  OPEN_CELLS.forEach((open, index) => {
    if (!open) return;
    const at = centreOf(index);
    const away = Math.hypot(at.x - x, at.z - z);
    if (away < least) {
      least = away;
      best = index;
    }
  });
  return best;
}

/** How many squares it is from everywhere to a place, going round what's in the way: walking downhill gets there. */
export function wayTo(x, z) {
  const far = new Int16Array(COLS * ROWS).fill(-1);
  const goal = nearestOpen(x, z);
  far[goal] = 0;
  const queue = [goal];
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      const next = r * COLS + c;
      if (!OPEN_CELLS[next] || far[next] >= 0) continue;
      far[next] = far[index] + 1;
      queue.push(next);
    }
  }
  return { far, goal: centreOf(goal) };
}

/** The next place to walk to on the way somewhere: the middle of the neighbouring square that's nearest to it. */
export function stepTowards(way, x, z) {
  const here = nearestOpen(x, z);
  const col = here % COLS;
  const row = Math.floor(here / COLS);
  let best = here;
  let least = way.far[here] < 0 ? Infinity : way.far[here];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const c = col + dc;
    const r = row + dr;
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
    const next = r * COLS + c;
    // Across a corner only if both squares beside it are open, so nobody cuts through the corner of a crate.
    if (dc !== 0 && dr !== 0 && !(OPEN_CELLS[row * COLS + c] && OPEN_CELLS[r * COLS + col])) continue;
    if (way.far[next] >= 0 && way.far[next] < least) {
      least = way.far[next];
      best = next;
    }
  }
  return best === here ? way.goal : centreOf(best);
}

/* ---------- the rifles, and what a grown-up can choose ---------- */

// Two rifles. every is the time between shots, hit how much each takes off, kick how far it jumps, and reload
// how long a new magazine takes. The Kalashnikov is slower and hits harder, and the M4 is quicker and lighter.
// Either way it takes about two and a half seconds on someone to tag them out, and a magazine is good for two
// or three of them, so changing it comes round often.
export const RIFLES = {
  ak: { name: 'Kalashnikov', nameKa: 'კალაშნიკოვი', every: 0.22, hit: 9, kick: 1, reload: 2.2 },
  m4: { name: 'M4', nameKa: 'M4', every: 0.15, hit: 6.5, kick: 0.7, reload: 1.8 },
};
export const MAGAZINE = 30;

// How fast everyone goes, in paces a second, and how quickly the child turns, in radians a second at full lock.
export const PACES = {
  slow: { walk: 3.2, turn: 1.5 },
  medium: { walk: 4.2, turn: 1.9 },
  fast: { walk: 5.2, turn: 2.3 },
};

// How hard the other team is. aim is how many of their shots at the child land, hit how much each takes off,
// react how long they take to start firing once they see someone, and canLose whether the child can be tagged
// out and the match lost. On Gentle the child's health stops just above nothing, and red can't win.
export const LEVELS = {
  gentle: { aim: 0.12, hit: 8, react: 1.4, burst: [3, 5], rest: [1.6, 2.6], canLose: false },
  medium: { aim: 0.2, hit: 10, react: 1, burst: [3, 6], rest: [1.2, 2], canLose: true },
  tough: { aim: 0.3, hit: 12, react: 0.7, burst: [4, 7], rest: [0.9, 1.6], canLose: true },
};

// How much the rifle helps: how far off the middle of the sights someone can be and still be fired at, and how
// strongly the view is drawn onto someone near the middle. Even the least is generous, as it isn't about aiming.
export const AIM_HELP = {
  none: { cone: degrees(7), pull: 0.5 },
  little: { cone: degrees(11), pull: 1 },
  lots: { cone: degrees(17), pull: 1.6 },
};

export const TAGS_TO_WIN = [5, 8, 12];
export const HEALTH = 100;
export const REST_AFTER = 4; // Seconds with neither hand open before it counts as a rest.
const SIGHT = 34; // How far anyone can see, and fire, on a clear day.
const OUT_SECONDS = 3; // How long a player who's been tagged out sits before they're back at their own end.
const SAFE_SECONDS = 2; // Just back, nobody can be hit for a moment.
const HEAL_AFTER = 3.5; // Health comes back once nothing has hit for this long...
const HEAL_RATE = 30; // ...this much a second.
const EMPTY_WAIT = 4; // With the magazine empty and no fist made, a new one goes in by itself after this long.
const WON_AFTER = 1.6;
const STEP_UP = 9; // How quickly anyone gets up to speed, and stops.
const PULL_CONE = 2.2; // The view is drawn onto someone up to this many times the firing cone from the middle.
const MATE_HIT = 0.35; // The child's team-mates take off a third of what the child does, so it's the child who wins it.
// For a player the computer plays: how fast it turns, how well lined up it has to be to fire, how near somewhere
// counts as there, how often it works out the way again, how long not getting anywhere means it's stuck, and how
// near someone has to be for it to stop and fire. From further off it carries on its way, so nobody just stands
// at their own end firing down the yard.
const BOT = { turn: 3.2, aimWithin: degrees(9), reach: 1.2, thinkEvery: 0.5, stuckAfter: 1.2, fightWithin: 15 };
// Something in the way: these turns to either side are tried, the least first.
const SLIDES = [0.35, 0.7, 1.05, 1.4, 1.75];
const ALONG_TURN = 1.6; // How quickly the child comes round to look along something they're walking along.
const STEERING = 0.25; // The rifle hand this far to one side is turning, and anything less is holding still.
const STEADY = 0.14; // Less than this far to one side doesn't turn the view at all.

/**
 * What each level changes, from level 1, the plain match, up to level 10. The numbers are shares of what a
 * grown-up chose, so a level never changes those choices: the speed, how hard, how many tags, the rifle, the
 * help with aiming, or Gentle being impossible to lose. Resting stops everything here, as it stops the rest.
 */
export function levelPlan(level = 1) {
  return {
    aim: ramp(level, 1, 1.5), // The other team's shots land a little more often.
    react: ramp(level, 1, 0.6), // And they start firing sooner.
    health: ramp(level, 1, 1.3), // Each of them takes more hits.
    reds: stepsAt(level, { 1: 2, 4: 3 }), // Two on the other team, and three from level 4.
    blues: stepsAt(level, { 1: 1, 4: 2 }), // Giraffe on the child's, and one more friend from level 4.
    // Something new to see and play with at every level from 2, on top of all that. See NEWS below.
    stars: level >= 2, // Each tag of the child's is a gold star, counted along the top.
    shield: level >= 3, // One of the other team carries a shield, which the first shots bounce off.
    three: level >= 4, // Three a side.
    runner: level >= 5, // One of the other team is a runner: quick, and never still.
    power: level >= 6, // A crate of double shots turns up in the yard: each shot counts twice for a while.
    snow: level >= 7, // It's snowing, and nobody can see as far.
    captain: level >= 8, // The other team's captain takes twice the hits, and is worth two tags.
    boots: level >= 9, // A crate of snow boots turns up too: walking is quicker for a while.
    champions: level >= 10, // The other team are the champions, in gold helmets, and all take more hits.
    trophy: level >= 10, // And beating them wins the trophy.
  };
}

/**
 * What each level brings that's new, shown on the title card, under the countdown and as coming up next. Each
 * key is something levelPlan switches on at that level.
 */
export const NEWS = {
  2: [{ key: 'stars', mark: '🌟', name: 'Gold stars', nameKa: 'ოქროს ვარსკვლავები' }],
  3: [{ key: 'shield', mark: '🛡️', name: 'Shield carrier', nameKa: 'ფარიანი მოთამაშე' }],
  4: [{ key: 'three', mark: '🤝', name: 'Three a side', nameKa: 'სამი სამზე' }],
  5: [{ key: 'runner', mark: '💨', name: 'Runner', nameKa: 'მორბენალი' }],
  6: [{ key: 'power', mark: '⚡', name: 'Double shots', nameKa: 'ორმაგი გასროლა' }],
  7: [{ key: 'snow', mark: '🌨️', name: 'Snowfall', nameKa: 'თოვა' }],
  8: [{ key: 'captain', mark: '🎖️', name: 'Captain', nameKa: 'კაპიტანი' }],
  9: [{ key: 'boots', mark: '🥾', name: 'Snow boots', nameKa: 'თოვლის ჩექმები' }],
  10: [{ key: 'champions', mark: '👑', name: 'Champions', nameKa: 'ჩემპიონები' }, { key: 'trophy', mark: '🏆', name: 'Trophy', nameKa: 'თასი' }],
};

/** What's new at a level, as the shared level cards want it. Level 1 has nothing new. */
export const newsAt = (level) => NEWS[level] ?? [];

// What comes in crates, from the levels that have them: how long each lasts.
export const POWERS = {
  double: { mark: '⚡', name: 'Double shots', nameKa: 'ორმაგი გასროლა', seconds: 10 },
  boots: { mark: '🥾', name: 'Snow boots', nameKa: 'თოვლის ჩექმები', seconds: 12 },
};
// Where a crate turns up: out in the open, either side of the middle, the same distance from both ends.
export const CRATE_SPOTS = [{ x: -6.5, z: 0 }, { x: 6.5, z: 0 }, { x: -20, z: 0 }, { x: 20, z: 0 }];
const CRATE = { first: 8, every: 18, reach: 1.3, seconds: 40 };
const SHIELD_HITS = 6; // A shield takes this many shots, each time its carrier comes back, and then it's down.
const RUNNER = { speed: 1.45, health: 0.6 };
const CAPTAIN = { health: 2, tags: 2 };
const CHAMPION_HEALTH = 1.25;
const BOOTS_SPEED = 1.4;
const SNOW_SIGHT = 22; // How far anyone can see when it's snowing.

// Who plays for each team, from the roster of characters: Giraffe is always on the child's.
export const BLUES = ['giraffe', 'mochi', 'kit'];
export const REDS = ['bramble', 'frost', 'cinder', 'nova', 'tur', 'truffle', 'widget'];

/**
 * What the helper hand is doing, from the hand monitor's snapshot: 'open', a 'fist', or 'none' for anything that
 * can't be properly read. A hand that's missing, cut off, too far away or touching the other one does nothing.
 */
export function readHelper(snapshot) {
  const hand = snapshot.other;
  if (!hand || snapshot.overlap) return 'none';
  if (hand.status === 'open') return 'open';
  if (hand.status === 'closed' && hand.reason === 'closed') return 'fist';
  return 'none';
}

let nextId = 1;

export class Match {
  /**
   * tags is how many win it. pace, level and help are from PACES, LEVELS and AIM_HELP. rifle is the child's, from
   * RIFLES. reload is 'hand' for a fist of the helper hand, or 'auto' for a new magazine going in by itself as
   * soon as one is empty, for a child who can't make a fist with that hand.
   */
  constructor({ tags = 5, pace = 'slow', level = 'gentle', levelNumber = 1, help = 'little', rifle = 'ak', reload = 'hand', random = Math.random, onEvent = () => {} } = {}) {
    this.random = random;
    this.onEvent = onEvent;
    this.goal = tags;
    this.levelNumber = levelNumber;
    this.plan = levelPlan(levelNumber);
    this.configure({ pace, level, help, reload });
    this.state = 'ready'; // ready, playing, won or lost.
    this.time = 0;
    this.score = [0, 0];
    this.endIn = null;
    this.resting = false;
    this.idleFor = 0;

    this.troopers = [];
    this.child = this.join(0, 'child', rifle, false);
    for (let i = 0; i < this.plan.blues; i += 1) this.join(0, BLUES[i % BLUES.length], i % 2 ? 'ak' : 'm4', true);
    const first = Math.floor(random() * REDS.length);
    for (let i = 0; i < this.plan.reds; i += 1) this.join(1, REDS[(first + i) % REDS.length], i % 2 ? 'm4' : 'ak', true);
    this.castReds();

    // What the levels bring: stars for the child's tags, and crates with something in them for a while.
    this.crate = null;
    this.crateIn = CRATE.first;
    this.cratesOut = 0;
    this.power = { doubleLeft: 0, bootsLeft: 0 };

    this.locked = null; // Who the child's rifle is on.
    this.emptyFor = 0;
    this.helperWasClosed = false;
    this.stats = { tags: 0, shots: 0, hits: 0, reloads: 0, byHand: 0, walked: 0, seconds: 0, firingSeconds: 0, walkingSeconds: 0, out: 0, stars: 0, crates: 0, trophy: 0 };
  }

  /** Speed, how hard, help with aiming and how a magazine is changed can change at any time, from the panel. */
  configure({ pace, level, help, reload }) {
    if (pace !== undefined) this.pace = PACES[pace] ?? PACES.slow;
    if (level !== undefined) this.level = LEVELS[level] ?? LEVELS.gentle;
    if (help !== undefined) this.help = AIM_HELP[help] ?? AIM_HELP.little;
    if (reload !== undefined) this.autoReload = reload === 'auto';
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  /** Someone joins a team, at the next place along its end. */
  join(team, who, rifle, bot) {
    const base = BASES[team];
    const slot = this.troopers.filter((each) => each.team === team).length;
    const trooper = {
      id: nextId,
      team,
      who,
      bot,
      slot,
      rifle: RIFLES[rifle] ? rifle : 'ak',
      x: base.spots[slot % base.spots.length],
      z: base.z,
      heading: base.heading,
      speed: 0,
      turning: 0,
      health: HEALTH,
      most: HEALTH,
      state: 'in', // in, or out for a few seconds after being tagged.
      outLeft: 0,
      safeLeft: 0,
      sinceHit: Infinity,
      hitLeft: 0,
      rounds: MAGAZINE,
      reloadLeft: 0,
      fireIn: 0,
      firing: false,
      // For one the computer plays.
      way: null,
      wayIn: 0,
      haunt: null,
      seen: null,
      seenFor: 0,
      burstLeft: 0,
      restLeft: 0,
      stuckFor: 0,
      part: null, // On the higher levels, one of the other team can be the captain, a shield carrier or a runner.
      shield: 0, // How many more shots a shield carrier's shield takes.
      champion: false,
      round: 0, // Which side it last went round something in its way...
      aside: 0, // ...and how far round from the way it faces it's going, while it does.
    };
    nextId += 1;
    this.troopers.push(trooper);
    return trooper;
  }

  /**
   * On the higher levels, some of the other team are something special: the captain first, then the shield
   * carrier, then the runner, and with only two of them, the newest of those.
   */
  castReds() {
    const { plan } = this;
    const reds = this.troopers.filter(({ team }) => team === 1);
    const parts = [plan.captain && 'captain', plan.shield && 'shield', plan.runner && 'runner'].filter(Boolean).slice(0, reds.length);
    reds.forEach((trooper, index) => {
      const part = parts[index] ?? null;
      trooper.part = part;
      let health = HEALTH * plan.health * (plan.champions ? CHAMPION_HEALTH : 1);
      if (part === 'captain') health *= CAPTAIN.health;
      if (part === 'runner') health *= RUNNER.health;
      trooper.most = trooper.health = Math.round(health);
      trooper.shield = part === 'shield' ? SHIELD_HITS : 0;
      trooper.champion = Boolean(plan.champions);
    });
  }

  begin() {
    this.state = 'playing';
  }

  get left() {
    return Math.max(0, this.goal - this.score[0]);
  }

  /** Those still in, on a team. */
  inPlay(team) {
    return this.troopers.filter((each) => each.team === team && each.state === 'in');
  }

  /** How far anyone can see: not as far when it's snowing. */
  get sight() {
    return this.plan.snow ? SNOW_SIGHT : SIGHT;
  }

  /** Whether one player can see another: in play, near enough, and with nothing in the way. */
  sees(from, target) {
    return target.state === 'in' && gapBetween(from, target) <= this.sight && clearLine(from, target);
  }

  /* ---------- the child ---------- */

  /**
   * Who the rifle is on: of the other team's players the child can see, the one nearest the middle of the
   * sights, if that's near enough. It sticks with the one it has unless another is clearly nearer the middle.
   */
  chooseTarget() {
    const { child, help } = this;
    let best = null;
    let bestOff = help.cone;
    for (const other of this.inPlay(1)) {
      // Not one who's only just back, and can't be hit yet: there'd be no point.
      if (other.safeLeft > 0 || !this.sees(child, other)) continue;
      const off = Math.abs(turnBetween(headingTo(other.x - child.x, other.z - child.z), child.heading));
      const counted = other === this.locked ? off * 0.7 : off;
      if (counted <= bestOff) {
        best = other;
        bestOff = counted;
      }
    }
    return best;
  }

  /** The way the child looks turns with the rifle hand, and is drawn a little onto someone near the middle. */
  look(dt, steer) {
    const { child, help, pace } = this;
    const before = child.heading;
    // A hand held nearly in the middle is holding still: closing it moves where it's seen to be a little, and
    // that mustn't set the view drifting.
    const turn = Number.isFinite(steer) && Math.abs(steer) >= STEADY ? clamp(steer, -1, 1) : 0;
    child.heading += Math.sign(turn) * ((Math.abs(turn) - STEADY) / (1 - STEADY)) * pace.turn * dt;
    let nearest = null;
    let least = help.cone * PULL_CONE;
    for (const other of this.inPlay(1)) {
      if (!this.sees(child, other)) continue;
      const off = turnBetween(headingTo(other.x - child.x, other.z - child.z), child.heading);
      if (Math.abs(off) < Math.abs(least)) {
        least = off;
        nearest = other;
      }
    }
    // A child turning hard gets their way: the pull is for holding on, not for taking over.
    if (nearest) child.heading += least * Math.min(1, help.pull * 2.4 * dt) * (1 - 0.8 * Math.abs(clamp(steer || 0, -1, 1)));
    child.turning = dt > 0 ? turnBetween(child.heading, before) / dt : 0;
  }

  /**
   * Walks someone the way they face. Something in the way never stops them: they go along it, as fast as they
   * were walking, and so round the end of it. side is which way to go round it, 1 for the right and -1 for the
   * left, if there's a say in it: otherwise it's the side they were going round already.
   */
  walk(trooper, wanted, dt, side = 0) {
    trooper.speed += clamp(wanted - trooper.speed, -STEP_UP * dt, STEP_UP * dt);
    if (trooper.speed <= 0.01) return 0;
    const step = trooper.speed * dt;
    const [fromX, fromZ] = [trooper.x, trooper.z];
    const go = (heading) => {
      const forward = forwardOf(heading);
      const x = trooper.x + forward.x * step;
      const z = trooper.z + forward.z * step;
      if (!freeAt(x, z)) return false;
      trooper.x = x;
      trooper.z = z;
      return true;
    };
    trooper.aside = 0;
    if (go(trooper.heading)) {
      trooper.round = 0;
      return step;
    }
    // The side it went round last time first, so it doesn't dither between the two.
    const first = side || trooper.round || 1;
    for (const turn of SLIDES) {
      if (go(trooper.heading + first * turn)) {
        trooper.round = first;
        trooper.aside = first * turn;
        break;
      }
      if (go(trooper.heading - first * turn)) {
        trooper.round = -first;
        trooper.aside = -first * turn;
        break;
      }
    }
    return Math.hypot(trooper.x - fromX, trooper.z - fromZ);
  }

  /** The child's rifle: it fires by itself at whoever is in the sights, with the rifle hand open. */
  shoot(dt, open) {
    const { child } = this;
    const rifle = RIFLES[child.rifle];
    child.fireIn = Math.max(0, child.fireIn - dt);
    this.locked = child.state === 'in' ? this.chooseTarget() : null;
    const ready = child.state === 'in' && child.reloadLeft === 0 && child.rounds > 0;
    child.firing = open && ready && Boolean(this.locked);
    if (!child.firing) return;
    this.stats.firingSeconds += dt;
    if (child.fireIn > 0) return;
    child.fireIn = rifle.every;
    child.rounds -= 1;
    this.stats.shots += 1;
    this.stats.hits += 1;
    this.emit('shot', { by: child, at: this.locked, hit: true });
    // With double shots from a crate, each one counts twice.
    this.hit(this.locked, rifle.hit * (this.power.doubleLeft > 0 ? 2 : 1), child);
    if (child.rounds === 0) {
      this.emptyFor = 0;
      this.emit('empty', { trooper: child });
      if (this.autoReload) this.reload(child, false);
    }
  }

  /** A new magazine: it takes a moment, and the rifle can't fire until it's in. */
  reload(trooper, byHand) {
    if (trooper.reloadLeft > 0 || trooper.rounds >= MAGAZINE || trooper.state !== 'in') return false;
    trooper.reloadLeft = RIFLES[trooper.rifle].reload;
    if (trooper === this.child) {
      this.stats.reloads += 1;
      if (byHand) this.stats.byHand += 1;
    }
    this.emit('reload', { trooper, byHand });
    return true;
  }

  finishReloads(dt) {
    for (const trooper of this.troopers) {
      if (trooper.reloadLeft === 0) continue;
      trooper.reloadLeft = Math.max(0, trooper.reloadLeft - dt);
      if (trooper.reloadLeft === 0) {
        trooper.rounds = MAGAZINE;
        this.emit('loaded', { trooper });
      }
    }
  }

  /* ---------- hits, and being tagged out ---------- */

  hit(trooper, amount, by) {
    if (trooper.state !== 'in' || trooper.safeLeft > 0 || this.state !== 'playing') return;
    trooper.sinceHit = 0;
    trooper.hitLeft = 0.3;
    // A shield takes the first few shots, with a bonk, and then it's down until its carrier is back.
    if (trooper.shield > 0) {
      trooper.shield -= 1;
      this.emit('bonk', { trooper, by, down: trooper.shield === 0 });
      return;
    }
    trooper.health -= amount;
    // On Gentle the child is never tagged out: their health stops just above nothing.
    if (trooper === this.child && !this.level.canLose) trooper.health = Math.max(1, trooper.health);
    this.emit('hit', { trooper, by, health: trooper.health });
    if (trooper.health > 0) return;
    trooper.health = 0;
    trooper.state = 'out';
    trooper.outLeft = OUT_SECONDS;
    trooper.firing = false;
    trooper.burstLeft = 0;
    trooper.speed = 0;
    // Every tag the child's team makes is a point, and the other team's captain is worth two. The other team's
    // only count when it's the child they tag, so whether the match is lost is up to the child, and not to how
    // their friends get on.
    const worth = trooper.part === 'captain' ? CAPTAIN.tags : 1;
    if (by.team === 0 || trooper === this.child) this.score[by.team] += worth;
    if (by === this.child) {
      this.stats.tags += 1;
      // From level 2, each of the child's tags is a gold star, and the captain is two.
      if (this.plan.stars) {
        this.stats.stars += worth;
        this.emit('star', { trooper, stars: this.stats.stars, worth });
      }
    }
    if (trooper === this.child) this.stats.out += 1;
    if (this.locked === trooper) this.locked = null;
    this.emit('tagged', { trooper, by, score: [...this.score] });
    this.checkEnd();
  }

  /** The first team to the tags wins. On Gentle only the child's team can. */
  checkEnd() {
    if (this.endIn !== null) return;
    if (this.score[0] >= this.goal) this.ending = 'won';
    else if (this.score[1] >= this.goal && this.level.canLose) this.ending = 'lost';
    else return;
    this.endIn = WON_AFTER;
  }

  /** Those tagged out come back at their own end, and health comes back with time. */
  recover(dt) {
    for (const trooper of this.troopers) {
      trooper.hitLeft = Math.max(0, trooper.hitLeft - dt);
      trooper.safeLeft = Math.max(0, trooper.safeLeft - dt);
      if (trooper.state === 'out') {
        trooper.outLeft -= dt;
        if (trooper.outLeft > 0) continue;
        const base = BASES[trooper.team];
        Object.assign(trooper, { state: 'in', x: base.spots[trooper.slot % base.spots.length], z: base.z, heading: base.heading, health: trooper.most, rounds: MAGAZINE, reloadLeft: 0, safeLeft: SAFE_SECONDS, sinceHit: Infinity, way: null, haunt: null, seen: null, burstLeft: 0, speed: 0, shield: trooper.part === 'shield' ? SHIELD_HITS : 0 });
        this.emit('back', { trooper });
        continue;
      }
      trooper.sinceHit += dt;
      if (trooper.health < trooper.most && trooper.sinceHit >= HEAL_AFTER) trooper.health = Math.min(trooper.most, trooper.health + HEAL_RATE * dt);
    }
  }

  /* ---------- the players the computer plays ---------- */

  think(bot, dt) {
    if (bot.state !== 'in') return;
    const rifle = RIFLES[bot.rifle];
    bot.fireIn = Math.max(0, bot.fireIn - dt);
    bot.restLeft = Math.max(0, bot.restLeft - dt);
    // Whoever it can see of the other team that's near enough to fire at, nearest first, sticking with the one it
    // has while it can still see them.
    const others = this.inPlay(1 - bot.team).filter((other) => gapBetween(bot, other) <= BOT.fightWithin && this.sees(bot, other));
    const seen = others.includes(bot.seen) ? bot.seen : others.sort((a, b) => gapBetween(bot, a) - gapBetween(bot, b))[0] ?? null;
    bot.seenFor = seen && seen === bot.seen ? bot.seenFor + dt : 0;
    bot.seen = seen;
    bot.firing = false;
    if (seen) {
      // It stops, turns to them, and fires a few at a time once it has had a moment to take aim.
      const off = turnBetween(headingTo(seen.x - bot.x, seen.z - bot.z), bot.heading);
      bot.heading += clamp(off, -BOT.turn * dt, BOT.turn * dt);
      // A runner never stands still: it keeps on the move, from side to side, while it fires.
      if (bot.part === 'runner') this.dodge(bot, dt);
      else this.walk(bot, 0, dt);
      const aimed = Math.abs(off) <= BOT.aimWithin && bot.seenFor >= this.level.react * this.plan.react;
      if (!aimed || bot.reloadLeft > 0 || bot.restLeft > 0) return;
      if (bot.rounds === 0) {
        this.reload(bot, false);
        return;
      }
      if (bot.burstLeft === 0) bot.burstLeft = Math.round(between(this.random, this.level.burst));
      bot.firing = true;
      if (bot.fireIn > 0) return;
      bot.fireIn = rifle.every * 1.6;
      bot.rounds -= 1;
      bot.burstLeft -= 1;
      if (bot.burstLeft === 0) bot.restLeft = between(this.random, this.level.rest);
      // The other team's shots at the child land only now and then. Everyone else's mostly do.
      const chance = seen === this.child ? this.level.aim * this.plan.aim : 0.55;
      const landed = this.random() < chance;
      this.emit('shot', { by: bot, at: seen, hit: landed });
      if (landed) this.hit(seen, bot.team === 0 ? rifle.hit * MATE_HIT : seen === this.child ? this.level.hit : rifle.hit * 0.6, bot);
      return;
    }
    // Nobody in sight: it goes somewhere worth going, by the way round, and then somewhere else.
    bot.burstLeft = 0;
    bot.wayIn -= dt;
    if (!bot.haunt || gapBetween(bot, bot.haunt) < BOT.reach || bot.stuckFor > BOT.stuckAfter) {
      bot.haunt = HAUNTS[Math.floor(this.random() * HAUNTS.length)];
      bot.way = null;
      bot.stuckFor = 0;
    }
    if (!bot.way || bot.wayIn <= 0) {
      bot.way = wayTo(bot.haunt.x, bot.haunt.z);
      bot.wayIn = BOT.thinkEvery;
    }
    const next = stepTowards(bot.way, bot.x, bot.z);
    const off = turnBetween(headingTo(next.x - bot.x, next.z - bot.z), bot.heading);
    bot.heading += clamp(off, -BOT.turn * dt, BOT.turn * dt);
    const pace = this.pace.walk * 0.8 * (bot.part === 'runner' ? RUNNER.speed : 1);
    const moved = this.walk(bot, Math.abs(off) < 1 ? pace : 0, dt);
    bot.stuckFor = moved < pace * dt * 0.3 ? bot.stuckFor + dt : 0;
  }

  /** A runner's side-step: a few paces one way, and then the other, still facing whoever it's firing at. */
  dodge(bot, dt) {
    bot.dodgeIn = (bot.dodgeIn ?? 0) - dt;
    if (bot.dodgeIn <= 0) {
      bot.dodgeIn = 0.9;
      bot.dodgeWay = bot.dodgeWay === 1 ? -1 : 1;
    }
    const side = forwardOf(bot.heading + (Math.PI / 2) * bot.dodgeWay);
    const step = this.pace.walk * 0.8 * RUNNER.speed * 0.6 * dt;
    const x = bot.x + side.x * step;
    const z = bot.z + side.z * step;
    if (freeAt(x, z)) Object.assign(bot, { x, z, speed: step / dt });
    else bot.dodgeIn = 0;
  }

  /* ---------- crates, from the levels that have them ---------- */

  /** Which kinds of crate this level has: double shots from level 6, and snow boots too from level 9. */
  get crateKinds() {
    return [this.plan.power && 'double', this.plan.boots && 'boots'].filter(Boolean);
  }

  /**
   * A crate turns up in the open every so often, one at a time, the newest kind first. Walking over it picks
   * it up. Missing it costs nothing: it goes after a while, and another comes. All of it waits while the child rests.
   */
  crates(dt) {
    const kinds = this.crateKinds;
    const { child, power } = this;
    for (const key of ['doubleLeft', 'bootsLeft']) {
      if (power[key] <= 0) continue;
      power[key] = Math.max(0, power[key] - dt);
      if (power[key] === 0) this.emit('power-off', { kind: key === 'doubleLeft' ? 'double' : 'boots' });
    }
    if (!kinds.length) return;
    if (!this.crate) {
      this.crateIn -= dt;
      if (this.crateIn > 0) return;
      // The newest kind first, and then turn about, at the place furthest from the child, so it's a walk.
      const kind = kinds[(kinds.length - 1 + this.cratesOut) % kinds.length];
      const spot = CRATE_SPOTS.slice().sort((a, b) => gapBetween(b, child) - gapBetween(a, child))[this.cratesOut % 2];
      this.crate = { kind, x: spot.x, z: spot.z, left: CRATE.seconds };
      this.cratesOut += 1;
      this.emit('crate', { crate: this.crate });
      return;
    }
    const { crate } = this;
    crate.left -= dt;
    if (child.state === 'in' && gapBetween(crate, child) <= CRATE.reach) {
      power[`${crate.kind}Left`] = POWERS[crate.kind].seconds;
      this.stats.crates += 1;
      this.emit('crate-got', { crate });
    } else if (crate.left <= 0) {
      this.emit('crate-gone', { crate });
    } else {
      return;
    }
    this.crate = null;
    this.crateIn = CRATE.every;
  }

  /* ---------- every frame ---------- */

  /**
   * One frame. steer is how far the rifle hand is to one side, from -1 to 1. fire says the rifle hand counts as
   * open. walk says the helper hand is open, and fist that it's closed. Anything that can't be read is neither.
   */
  update(dt, { steer = 0, fire = false, walk = false, fist = false } = {}) {
    this.time += dt;
    const { child } = this;
    if (this.state !== 'playing') {
      child.firing = false;
      this.walk(child, 0, dt);
      this.finishReloads(dt);
      for (const trooper of this.troopers) {
        trooper.hitLeft = Math.max(0, trooper.hitLeft - dt);
        if (trooper.bot) {
          trooper.firing = false;
          this.walk(trooper, 0, dt);
        }
      }
      return;
    }
    this.stats.seconds += dt;
    this.watchRest(dt, fire === true || walk === true || Math.abs(steer) > STEERING);

    if (child.state === 'in') {
      this.look(dt, steer);
      // A child who's turning says which way round something in the way they go.
      const turning = Number.isFinite(steer) && Math.abs(steer) >= STEERING ? Math.sign(steer) : 0;
      const moved = this.walk(child, walk === true ? this.pace.walk * (this.power.bootsLeft > 0 ? BOOTS_SPEED : 1) : 0, dt, turning);
      this.stats.walked += moved;
      if (moved > 0) this.stats.walkingSeconds += dt;
      // Going along something that was in the way, with the rifle hand in the middle, the child comes round to
      // look where they're going, rather than walking sideways with their nose to a wall. A child who's turning
      // gets their way.
      if (child.aside && !turning) child.heading += clamp(child.aside, -ALONG_TURN * dt, ALONG_TURN * dt);
    } else {
      child.speed = 0;
    }
    // Making a fist with the helper hand puts a new magazine in: once for each time it closes.
    const closed = fist === true;
    if (closed && !this.helperWasClosed && !this.autoReload) this.reload(child, true);
    this.helperWasClosed = closed;
    // An empty rifle waits a little while for that fist, and then does it by itself, so nobody is ever stuck.
    if (child.rounds === 0 && child.reloadLeft === 0 && child.state === 'in') {
      this.emptyFor += dt;
      if (this.emptyFor >= EMPTY_WAIT) this.reload(child, false);
    }
    this.shoot(dt, fire === true);
    this.finishReloads(dt);
    if (!this.resting && this.endIn === null) this.crates(dt);

    // While the child rests, and once it's decided, everyone the computer plays stops where they are and waits.
    const waiting = this.resting || this.endIn !== null;
    for (const trooper of this.troopers) {
      if (!trooper.bot) continue;
      if (!waiting) {
        this.think(trooper, dt);
        continue;
      }
      trooper.firing = false;
      trooper.burstLeft = 0;
      this.walk(trooper, 0, dt);
    }
    this.recover(dt);

    if (this.endIn !== null) {
      this.endIn -= dt;
      if (this.endIn <= 0) {
        this.state = this.ending;
        this.locked = null;
        child.firing = false;
        // Beating the champions, at level 10, wins the trophy.
        if (this.ending === 'won' && this.plan.trophy) this.stats.trophy = 1;
        this.emit(this.ending, { score: [...this.score], trophy: this.stats.trophy === 1 });
      }
    }
  }

  /** With neither hand doing anything for a few seconds, it's a rest: everyone the computer plays stops and waits. */
  watchRest(dt, busy) {
    this.idleFor = busy ? 0 : this.idleFor + dt;
    const resting = this.idleFor >= REST_AFTER;
    if (resting === this.resting) return;
    this.resting = resting;
    this.emit('resting', { on: resting });
  }
}
