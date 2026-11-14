// Flap, Little Chick! with friends, each on their own computer: what a game tells the others about its chick,
// and what it makes of what they tell it. Every game lays out the same track from the same seed, flies its own
// chick along it, and shows the friends' chicks where their games say they are. Together, they're one flock: a
// chick too far ahead of the last one waits, one that's been waited for is carried up by the mother hen, and
// everyone is home when the whole flock is (the rules for that are in farm.js). Against each other it's a race home.
//
// Only numbers go between the games: where a chick is, how high, how fast, how far up each wing is, what it's
// doing, and how many flaps and pieces of corn it has. Nothing from the camera. The server cleans each one: see
// cleanChick in server/race-room.js. No DOM here, so it runs in the unit tests.

// What a chick is doing, as the number that's sent for it.
export const STATES = ['run', 'fly', 'wait', 'tumble', 'splash', 'carried', 'ride', 'door', 'home'];
const AT_HOME = STATES.indexOf('door');

// A friend's chick between what their game sends: where it is and its wings go smoothly from one to the next, and
// what it's doing changes half way. With nothing new for a moment, one that's running or flying carries on.
export const CHICK_TRACK = {
  lerp: ['d', 'y', 'v', 'l', 'r'],
  steps: ['s', 'n', 'c'],
  guess: (last, seconds) => (last.s <= 1 ? { d: last.d + last.v * seconds } : {}),
};

const round2 = (value) => Math.round(value * 100) / 100;

/** What the chick is doing, as one of STATES, by its number. */
export function chickState(farm) {
  const { chick } = farm;
  if (chick.state !== 'run') return STATES.indexOf(chick.state);
  if (chick.air) return STATES.indexOf('fly');
  return chick.waiting || chick.flockWait ? STATES.indexOf('wait') : STATES.indexOf('run');
}

/** What a game sends about its own chick, about 10 times a second. */
export function wireFor(farm) {
  const { chick, wings, stats, plan } = farm;
  const s = chickState(farm);
  return {
    d: round2(chick.x),
    y: round2(Math.max(0, chick.h)),
    v: s <= 1 ? round2(plan.speed) : 0,
    l: round2(wings.left.lift),
    r: round2(wings.right.lift),
    s,
    n: stats.flaps.left + stats.flaps.right,
    c: stats.corn,
  };
}

/**
 * A friend's chick as it's drawn and as the rules see it, from where their track says it is now, or null before
 * anything has come from them. ghost is { friend, look }, friend being who they are (see FriendsPanel.start), and
 * finished says their game has ended. A number that makes no sense is passed over: the chick is left out.
 */
export function friendFrom(at, ghost, finished = false) {
  if (!at) return null;
  const { friend, look } = ghost;
  const numbers = [at.d, at.y, at.l, at.r, at.s].every((value) => Number.isFinite(value));
  if (!numbers) return null;
  const doing = STATES[Math.round(at.s)] ?? 'run';
  return {
    id: friend.id,
    name: friend.spec?.name ?? '',
    look,
    x: at.d,
    h: Math.max(0, at.y),
    wings: { left: Math.min(1, Math.max(0, at.l)), right: Math.min(1, Math.max(0, at.r)) },
    state: ['tumble', 'splash', 'ride', 'door', 'home'].includes(doing) ? doing : 'run',
    air: doing === 'fly',
    waiting: doing === 'wait',
    carried: doing === 'carried',
    home: finished || Math.round(at.s) >= AT_HOME,
    gone: Boolean(friend.gone),
    flaps: at.n ?? 0,
    corn: at.c ?? 0,
  };
}

/**
 * The friends' chicks, as the rules want them: each { x, home, gone }. One nothing has come from yet is at the
 * start, and one whose game has ended is home.
 */
export function flockFrom(ghosts, end) {
  return ghosts.map(({ friend, shown }) => ({
    x: shown ? (shown.home ? end : shown.x) : 0,
    home: Boolean(shown?.home),
    gone: Boolean(friend.gone),
  }));
}
