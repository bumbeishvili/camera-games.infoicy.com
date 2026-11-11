// Playing with friends, in High Five Racers, Sky Wings, Balloon Pop, Mighty Moves, Bounce Back, Leap Trail and Giraffe's
// Maze: who's in a room, and what they pass to each other.
// The same rules run on Cloudflare (server/worker.js) and on this computer for the tests
// (tools/race-server.mjs). Each game has rooms of its own. Nothing here is kept once everyone has gone, and no
// camera picture ever comes here: only where each car or plane is, the moves a fighter makes and how it stands,
// the name a player typed, and which character drives, flies or fights.
//
// A player sends JSON messages, each { t, ... }:
//   hi     { name, driver, level, length, mode, racing }   first, after connecting, and again if any of it
//                                      changes. length is the race's laps, a flight's planes to drop, or how
//                                      many balloons a game of Balloon Pop has, and mode its maths challenge.
//                                      In Giraffe's Maze, length is how many mazes, and mode their size and seed,
//                                      and at the Smoothie Stand, how many customers, and how fast the fruit flies.
//                                      In The Lighthouse Keeper, length is how many ships there are to bring home.
//                                      racing says they're in the middle of one, for someone back mid-race
//   ready  {}                              they're waiting at the start
//   go     {}                              the host starts with whoever is ready
//   car    { ms, d, x, s, l, f, b }        where their car is, about 10 times a second, in a race
//   plane  { ms, x, y, z, h, p, r, s, f }  where their plane is, in a flight
//   score  { ms, n }                       how many they've popped, or got right, so far
//   hand   { ms, x, y, v, o, p }           where their glove is in Balloon Pop, from 0 to 1 across and down
//                                      the screen, whether it can be seen and is open, and p, its 21
//                                      points from the middle of the palm, as x, y, x, y..., in palms. In The
//                                      Lighthouse Keeper, x and y are across and down the window instead
//   world  { ms, b, q, qa }                the host's balloons in Balloon Pop, which everyone plays with:
//                                      each [id, x, y, r, colour, number, flags], and the sum being asked
//   claim  { k }                           this player's hand got to balloon k: the first to says so has it.
//                                      In Mighty Moves, k is a round this player's fighter has just won
//   hit    { r, m, d, tot, sm, sg, sd }    Mighty Moves: their fighter makes move m in round r, doing d, and
//                                      tot in all this round. sm is 1 for a small hit and sg for their
//                                      fighter's own finishing move, and sd the side, l or r, if it has one.
//                                      In Cannon Bay, one of their cannonballs hit the other ship, as their
//                                      game saw it, and tot is how many have so far
//                                      In Tank Patrol, a shot of theirs has hit the friend's tank, as their
//                                      game decides: m is the kind of shot, and tot how many hits they've made
//   pose   { ms, p }                       Mighty Moves: their body, for their fighter to copy, as POSE_NUMBERS
//                                      numbers about where their hands and feet are and how they lean (see
//                                      BODY_KEYS in games/mighty-moves/clips.js), or none when it can't be seen
//   racket { ms, x, y, v, o, r, g, p }     where their racket is in Bounce Back, along the court and how high,
//                                      whether it can be seen and is open, how big it is, how much it draws the
//                                      ball in, and p, their glove's 21 points, as in hand
//   ball   { ms, x, y, vx, vy, s, k, a, b, n, f, l, sv, g, r, w }   the host's ball in Bounce Back: where it is
//                                      and how it's going, what it's doing, which shot it is, the two scores,
//                                      the hits in a row, its kind, who hit it last, who served, who has won,
//                                      whether it's rolling, and whether the game is over
//   shot   { ms, k, x, y, vx, vy }         in Bounce Back, this player hit shot k, from there and that way. Only
//                                      the host's game hears it, as the host's game runs the ball
//   runner { ms, d, x, y, s, j, w, b }     where their runner is in Leap Trail: how far along, how far across,
//                                      how high, how fast, whether it's jumping or waiting, and how many times
//                                      it has stumbled
//   walker { ms, z, x, y, f, m, v, o, gx, gy, p }   where their character is in Giraffe's Maze: which maze, where in
//                                      it, in cells, which way it faces and whether it's walking, whether their
//                                      glove can be seen and is open, where it is, and p, its 21 points, as in hand.
//                                      Everyone makes the same mazes from the host's mode, its size and a seed, and
//                                      claims the fruit and lost friends it reaches
//   wipe   { w, c }                        The Lighthouse Keeper: their hand has wiped patches c of window w, each
//                                      a whole number from 0 to WINDOW_PATCHES - 1, all of those since the last
//                                      wipe, sent at most 10 times a second. Each patch is the first hand's to wipe
//                                      it. A wipe with no answer is sent again, so a patch can come more than once
//   stand  { ms, g, f, c, l, a }           Giraffe's Smoothie Stand, from the game running the stand for everyone:
//                                      the host's, then the next still playing. f is the fruit, each [id, x, y,
//                                      vx, vy, t, s]: where it was at t, in milliseconds since "GO!", as shares of
//                                      the screen, how it was going, in shares a second, and s 1 if it hangs still;
//                                      g is how it falls, in screen heights a second squared. c is the customer, l
//                                      what's left of their order, and a how many claimed fruit the stand has
//                                      counted. Each player claims the fruit their glove slices, and its id says
//                                      what kind of fruit it was. Their glove goes as hand, and their points as score
//   ship   { ms, x, z, h, s, v, f }        where their ship is in Cannon Bay: where on the water, which way it
//                                      heads, how fast, how far its sails are up, from 0 to 1, and f, how many
//                                      cannonballs it has fired so far, for the other game to show them coming
//   catcher { ms, x, y, v, o, p, z, h, m, n }   their glove in Spider Catcher: where it is in the garden, as a child
//                                      playing with the right hand and a little reach help would see it, 0 to 1 across
//                                      and down, whether it can be seen and is open, and p, its 21 points, as in hand.
//                                      z is which place in the garden they're at, h the spider in the glove, as the
//                                      claim it was caught with, or -1, m which of that place's spiders are home on
//                                      their screen, a bit each, and n how many they've brought home. Everyone makes
//                                      the same spiders from the seed, and claims each one their glove closes on
//   tank   { ms, x, z, h, a, s, n, r, o }   where their tank is in Tank Patrol, across and along the valley, which
//                                      way it faces and its turret points, how fast it's going, how many shots it
//                                      has fired, so the friend's game can show them coming, whether their child
//                                      is resting, when it can't be fired at, and whether their hand is open
//   done   { ms, n, w }                    they've finished, this long after "GO!", with n dropped, and w 1
//                                      if that's all of them (and in a race, always)
//   leave  {}                              they're going (closing the socket says the same)
// The room sends:
//   room   { you, members: [{ id, name, driver, ready, racing, host }] }   whenever that changes
//   go     { level, length, laps, mode, racers, seed }   the countdown starts now, on the host's course (laps is
//                                      length). seed is the same for everyone, for a game laid out by chance
//   car, plane, score, hand, world, hit, pose, racket, ball, shot, runner, walker, stand, ship, catcher, tank { from, ... } and done { from, ms, n, w }
//                                      passed on from the others: ball only from the host, shot only to the host,
//                                      and stand only from someone playing
//   claimed { k, by }                      balloon k, or round k, went to player by, sent to everyone, them too
//   wiped  { w, c, by }                    patches c of window w went to player by, as theirs wiped them first,
//                                      sent to everyone, them too. Those in a wipe that had gone to someone else
//                                      already are said again only to the one who sent it, with whose they are
//   full   {}                              the room already has as many as it holds: see mostIn
//   taken  {}                              making a new game, that code is already in use: choose another
//   nobody {}                              joining by a code, there's no game with it just now

export const MAX_RACERS = 4;
// A fight is two fighters, Bounce Back is one child on each side of the net, Cannon Bay is ship against ship,
// and a Tank Patrol battle is tank against tank. Every other game's room holds MAX_RACERS.
const MOST_IN = { 'mighty-moves': 2, 'bounce-back': 2, 'cannon-bay': 2, 'tank-patrol': 2 };
export const mostIn = (game) => MOST_IN[game] ?? MAX_RACERS;
export const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // No 0, O, 1, I or L, which look alike.
// A code is short enough to say out loud or type in a moment. A new game never takes one in use: see arrive.
export const CODE_LENGTH = 3;
const OLD_CODE_LENGTH = 6; // Links from before codes were 3 long still open their game.
export const MOST_BYTES = 1800; // A message bigger than this is ignored. The host's balloons are the biggest.
const MOST_BALLOONS = 24;
// The Lighthouse Keeper's windows: each is 14 by 9 patches of mud (see GRID in games/lighthouse/storm.js), and a
// storm has at most four of them, with room to spare.
export const WINDOW_PATCHES = 126;
const MOST_WINDOWS = 10;
const MOST_FRUIT = 16; // At the Smoothie Stand there are never more than 12 up at once, and a few on their way.
const MOST_A_SECOND = 40; // Messages a player can send in a second; more are dropped, apart from ALWAYS_HEARD.
const ALWAYS_HEARD = new Set(['ready', 'go', 'done', 'leave']);
// A player who goes and comes back as soon as this carries on as before, as when a laptop wakes up again.
export const COMES_BACK_WITHIN_MS = 120_000;
// A connection that's said nothing for this long, not even its keep-alive "ping", has died without closing.
const STALE_MS = 90_000;

/** A player's id, which a player who lost the connection for a moment brings back to keep their place. */
export const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{8,24}$/.test(id);

/** The id for a player arriving: the one they had, if they're coming back and nobody has it, or a new one. */
export function idFor(players, was, fresh) {
  return validId(was) && !players.some((player) => player.meta?.id === was) ? was : fresh();
}

/**
 * A player coming back with the id they had, whose old connection is still here: one that died without
 * closing, as when the wifi drops. The old one goes, quietly, and what was kept about them carries on with
 * the new one, so they keep their place, and hosting if they were. Returns that, or null.
 */
export function takeOver(players, was) {
  if (!validId(was)) return null;
  const old = players.find((player) => player.meta?.id === was);
  if (!old) return null;
  const kept = old.meta;
  old.setMeta(null);
  old.close();
  return kept;
}

export const validCode = (code) => typeof code === 'string' && [CODE_LENGTH, OLD_CODE_LENGTH].includes(code.length) && [...code].every((letter) => CODE_LETTERS.includes(letter));

/** A fresh room code, from a function giving random whole numbers below a limit. */
export function makeCode(randomBelow) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_LETTERS[randomBelow(CODE_LETTERS.length)];
  return code;
}

const number = (value, low, high, places) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const scale = 10 ** places;
  return Math.round(Math.min(high, Math.max(low, n)) * scale) / scale;
};

/** What a player is called: letters, numbers and a few marks, kept short. */
export function cleanName(value) {
  return String(value ?? '')
    .replace(/[^\p{L}\p{N} '.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
}

const cleanDriver = (value) => (typeof value === 'string' && /^[a-z][a-z-]{0,23}$/.test(value) ? value : '');
const cleanMove = (value) => (typeof value === 'string' && /^[a-zA-Z]{1,16}$/.test(value) ? value : '');
const cleanMode = (value) => (typeof value === 'string' && /^[A-Za-z]{1,12}$/.test(value) ? value : '');

/** Only what a plane message should hold, rounded. h is which way it heads, p and r its pitch and roll. */
export function cleanPlane(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -5000, 5000, 2),
    y: number(message.y, -100, 2000, 2),
    z: number(message.z, -5000, 5000, 2),
    h: number(message.h, -7, 7, 3),
    p: number(message.p, -2, 2, 3),
    r: number(message.r, -2, 2, 3),
    s: number(message.s, 0, 300, 1),
    f: message.f ? 1 : 0,
  };
}

/** Only what a hand message should hold, rounded, with its 21 points or none. */
export function cleanHand(message) {
  const points = Array.isArray(message.p) && message.p.length === 42 ? message.p.map((value) => number(value, -4, 4, 2)) : [];
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -0.5, 1.5, 3),
    y: number(message.y, -0.5, 1.5, 3),
    v: message.v && points.length ? 1 : 0,
    o: message.o ? 1 : 0,
    p: points,
  };
}

/** Only what the host's balloons should hold, rounded: each is [id, x, y, r, colour, number, flags]. */
export function cleanWorld(message) {
  const balloons = Array.isArray(message.b) ? message.b.slice(0, MOST_BALLOONS) : [];
  const b = balloons.filter((each) => Array.isArray(each) && each.length === 7).map(([id, x, y, r, colour, shown, flags]) => [
    number(id, 0, 1_000_000, 0),
    number(x, -0.5, 1.5, 3),
    number(y, -1, 2, 3),
    number(r, 0, 0.5, 3),
    number(colour, 0, 20, 0),
    number(shown, -1, 1000, 0),
    number(flags, 0, 7, 0),
  ]);
  const q = typeof message.q === 'string' ? message.q.replace(/[^0-9+\-−×÷=? ]/g, '').slice(0, 24) : '';
  return { ms: number(message.ms, 0, 3_600_000, 0), b, q, qa: message.qa ? 1 : 0 };
}

export const POSE_NUMBERS = 21;

/** Only what a fighter's body should hold, in Mighty Moves: POSE_NUMBERS numbers, rounded, or none. */
export function cleanPose(message) {
  const p = Array.isArray(message.p) && message.p.length === POSE_NUMBERS ? message.p.map((value) => number(value, -3, 3, 2)) : [];
  return { ms: number(message.ms, 0, 3_600_000, 0), p };
}

/** Only what a fighter's move should hold, in Mighty Moves. A move that isn't one is passed on as none. */
export function cleanHit(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    r: number(message.r, 1, 9, 0),
    m: cleanMove(message.m),
    d: number(message.d, 0, 200, 2),
    tot: number(message.tot, 0, 1000, 2),
    sm: message.sm ? 1 : 0,
    sg: message.sg ? 1 : 0,
    sd: message.sd === 'l' || message.sd === 'r' ? message.sd : '',
  };
}

/** Only what a runner message should hold, in Leap Trail, rounded. */
export function cleanRunner(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    d: number(message.d, -100, 100_000, 2),
    x: number(message.x, -5, 5, 2),
    y: number(message.y, 0, 10, 2),
    s: number(message.s, 0, 60, 1),
    j: message.j ? 1 : 0,
    w: message.w ? 1 : 0,
    b: number(message.b, 0, 999, 0),
  };
}

/** Only what a racket message should hold, rounded, with its glove's 21 points or none. */
export function cleanRacket(message) {
  const points = Array.isArray(message.p) && message.p.length === 42 ? message.p.map((value) => number(value, -4, 4, 2)) : [];
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -2, 2, 3),
    y: number(message.y, -0.5, 3, 3),
    v: message.v ? 1 : 0,
    o: message.v && message.o ? 1 : 0,
    r: number(message.r, 0, 0.6, 3),
    g: number(message.g, 0, 2, 2),
    p: points,
  };
}

/** Only what the host's ball should hold, rounded. */
export function cleanBall(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -2, 2, 3),
    y: number(message.y, -0.5, 3, 3),
    vx: number(message.vx, -6, 6, 3),
    vy: number(message.vy, -6, 6, 3),
    s: number(message.s, 0, 3, 0),
    k: number(message.k, 0, 1_000_000, 0),
    a: number(message.a, 0, 99, 0),
    b: number(message.b, 0, 99, 0),
    n: number(message.n, 0, 999, 0),
    f: number(message.f, 0, 7, 0),
    l: number(message.l, 0, 2, 0),
    sv: number(message.sv, 0, 2, 0),
    g: number(message.g, 0, 2, 0),
    r: message.r ? 1 : 0,
    w: message.w ? 1 : 0,
  };
}

/** Only what a shot in Bounce Back should hold, rounded. */
export function cleanShot(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    k: number(message.k, 0, 1_000_000, 0),
    x: number(message.x, -2, 2, 3),
    y: number(message.y, -0.5, 3, 3),
    vx: number(message.vx, -6, 6, 3),
    vy: number(message.vy, -6, 6, 3),
  };
}

/** Only what a walker in Giraffe's Maze should hold, rounded, with its glove's 21 points or none. */
export function cleanWalker(message) {
  const points = Array.isArray(message.p) && message.p.length === 42 ? message.p.map((value) => number(value, -4, 4, 2)) : [];
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    z: number(message.z, 0, 20, 0),
    x: number(message.x, -2, 40, 2),
    y: number(message.y, -2, 40, 2),
    f: number(message.f, 0, 3, 0),
    m: message.m ? 1 : 0,
    v: message.v ? 1 : 0,
    o: message.v && message.o ? 1 : 0,
    gx: number(message.gx, -4, 40, 2),
    gy: number(message.gy, -4, 40, 2),
    p: points,
  };
}

/**
 * Only what a wipe in The Lighthouse Keeper should hold: which window, and which of its patches, each a whole
 * number from 0 to WINDOW_PATCHES - 1, rounded, and each once. Anything else in the list is left out.
 */
export function cleanWipe(message) {
  const c = [];
  for (const value of Array.isArray(message.c) ? message.c : []) {
    const patch = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : -1;
    if (patch >= 0 && patch < WINDOW_PATCHES && !c.includes(patch)) c.push(patch);
  }
  return { w: number(message.w, 0, MOST_WINDOWS - 1, 0), c };
}

/**
 * Only what the Smoothie Stand should hold, rounded: each fruit as [id, x, y, vx, vy, t, s], the customer, what's
 * left of their order, and how many claimed fruit the stand has counted.
 */
export function cleanStand(message) {
  const fruit = Array.isArray(message.f) ? message.f.slice(0, MOST_FRUIT) : [];
  const f = fruit.filter((each) => Array.isArray(each) && each.length === 7).map(([id, x, y, vx, vy, t, s]) => [
    number(id, 0, 1_000_000, 0),
    number(x, -0.5, 1.5, 4),
    number(y, -1, 2, 4),
    number(vx, -2, 2, 4),
    number(vy, -4, 4, 4),
    number(t, 0, 3_600_000, 0),
    s ? 1 : 0,
  ]);
  const l = Array.isArray(message.l) ? message.l.slice(0, 3).map((left) => number(left, 0, 99, 0)) : [];
  return { ms: number(message.ms, 0, 3_600_000, 0), g: number(message.g, 0, 3, 4), f, c: number(message.c, 0, 9, 0), l, a: number(message.a, 0, 100_000, 0) };
}

/**
 * Only what a ship in Cannon Bay should hold, rounded: where it is on the water and which way it heads, how
 * fast it goes, how far its sails are up, and f, how many cannonballs it has fired so far.
 */
export function cleanShip(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -2000, 2000, 2),
    z: number(message.z, -2000, 2000, 2),
    h: number(message.h, -7, 7, 3),
    s: number(message.s, 0, 100, 1),
    v: number(message.v, 0, 1, 2),
    f: number(message.f, 0, 1_000_000, 0),
  };
}

/**
 * Only what a glove in Spider Catcher should hold, rounded, with its 21 points while it can be seen, or none. A spider
 * in it that isn't a number is none, -1.
 */
export function cleanCatcher(message) {
  const points = Array.isArray(message.p) && message.p.length === 42 ? message.p.map((value) => number(value, -4, 4, 2)) : [];
  const seen = message.v && points.length ? 1 : 0;
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -0.5, 1.5, 3),
    y: number(message.y, -0.5, 1.5, 3),
    v: seen,
    o: seen && message.o ? 1 : 0,
    p: seen ? points : [],
    z: number(message.z, 0, 20, 0),
    h: typeof message.h === 'number' && Number.isFinite(message.h) ? number(message.h, -1, 1_000_000, 0) : -1,
    m: number(message.m, 0, 1023, 0),
    n: number(message.n, 0, 1000, 0),
  };
}

/** Only what a tank in Tank Patrol should hold, rounded: where it is in the valley, which way it and its turret point, and the rest. */
export function cleanTank(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    x: number(message.x, -60, 60, 2),
    z: number(message.z, -50, 40, 2),
    h: number(message.h, -4, 4, 3),
    a: number(message.a, -4, 4, 3),
    s: number(message.s, 0, 30, 1),
    n: number(message.n, 0, 100_000, 0),
    r: message.r ? 1 : 0,
    o: message.o ? 1 : 0,
  };
}

/** Only what a car message should hold, rounded, so nothing else can be passed on. */
export function cleanCar(message) {
  return {
    ms: number(message.ms, 0, 3_600_000, 0),
    d: number(message.d, -100, 100_000, 2),
    x: number(message.x, -20, 20, 2),
    s: number(message.s, 0, 100, 1),
    l: number(message.l, 0, 20, 2),
    f: message.f ? 1 : 0,
    b: message.b ? 1 : 0,
  };
}

const byJoining = (a, b) => a.meta.joined - b.meta.joined || (a.meta.id < b.meta.id ? -1 : 1);

/** Who hosts: whoever has been in the room longest. */
function hostOf(players) {
  return players.reduce((first, player) => (!first || player.meta.joined < first.meta.joined || (player.meta.joined === first.meta.joined && player.meta.id < first.meta.id) ? player : first), null);
}

/**
 * The rules of one room. room.players() is everyone connected now, each as { meta, setMeta(meta), send(message),
 * close(), heardAt }: meta is what's kept about them, { id, joined, seen, name, driver, level, laps, ready, racing },
 * and heardAt when anything last came from them, even a keep-alive "ping". now() is the time in milliseconds.
 * recent, who has just gone, is all that's kept between calls, and the Cloudflare server saves it, as it can
 * sleep in between.
 */
export class RaceRoom {
  constructor(room, now = () => Date.now()) {
    this.room = room;
    this.now = now;
    this.counts = new Map(); // id: { second, count }, to drop a flood of messages. Fine to lose.
    this.recent = new Map(); // id: { meta, at }, for those who have just gone: see cameBack. Fine to lose too.
    this.claims = new Map(); // Balloon Pop: which balloon went to whom, this game. Cleared as each one starts.
    this.patches = new Map(); // The Lighthouse Keeper: which patch of which window went to whom, this game. The same.
  }

  /** What was kept about a player who went a moment ago and is back with their id, or null. */
  cameBack(was) {
    const now = this.now();
    for (const [id, { at }] of this.recent) if (now - at > COMES_BACK_WITHIN_MS) this.recent.delete(id);
    const recent = this.recent.get(was);
    if (!recent) return null;
    this.recent.delete(was);
    return recent.meta;
  }

  /**
   * A new player has connected. They're given an id and a seat, or told why not. kept is what was kept about
   * them from a connection they're taking over: see takeOver. most is how many the room holds. making says
   * they're making a new game, which must have a code nobody is using, even someone who has only just lost the
   * connection and is coming back. fresh says they're joining by a code, which needs a game to be there.
   */
  arrive(player, id, kept = null, { most = MAX_RACERS, making = false, fresh = false } = {}) {
    if (kept) {
      player.setMeta({ ...kept, id, seen: this.now() });
      this.tellEveryone();
      return true;
    }
    const now = this.now();
    // Someone whose connection died without closing doesn't keep the place a friend coming back needs.
    for (const each of this.room.players()) {
      if (each !== player && each.meta?.id && now - (each.heardAt ?? now) > STALE_MS) {
        each.close?.();
        this.leave(each);
      }
    }
    const others = this.room.players().filter((each) => each !== player && each.meta?.id);
    const comingBack = [...this.recent.values()].some(({ at }) => now - at <= COMES_BACK_WITHIN_MS);
    if (making && (others.length || comingBack)) {
      player.send({ t: 'taken' });
      return false;
    }
    if (fresh && !others.length && !comingBack) {
      player.send({ t: 'nobody' });
      return false;
    }
    if (others.length >= most) {
      player.send({ t: 'full' });
      return false;
    }
    player.setMeta({ id, joined: now, seen: now, name: '', driver: '', level: 1, length: 2, mode: '', ready: false, racing: false });
    this.tellEveryone();
    return true;
  }

  /** A message from a player, as the text that came in. */
  hear(player, text) {
    const { meta } = player;
    if (!meta?.id || typeof text !== 'string' || text.length > MOST_BYTES) return;
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;
    // Being ready, starting, finishing and going always get through, however much else has come: each only
    // matters once, and a finish lost would leave friends waiting for it.
    if (!ALWAYS_HEARD.has(message.t) && this.flooding(meta.id)) return;
    const players = this.room.players().filter((each) => each.meta?.id);
    const others = players.filter((each) => each !== player);
    switch (message.t) {
      case 'hi': {
        // Laps or planes up to 9, or balloons up to 60.
        const length = number(message.length ?? message.laps, 1, 100, 0) || meta.length;
        // Coming back mid-race, after losing the connection for a moment, they're still racing.
        const racing = meta.racing || (Boolean(message.racing) && !meta.ready);
        player.setMeta({ ...meta, name: cleanName(message.name), driver: cleanDriver(message.driver), level: number(message.level, 1, 10, 0) || 1, length, mode: cleanMode(message.mode), racing });
        this.tellEveryone();
        break;
      }
      case 'ready': {
        if (meta.ready && !meta.racing) return;
        player.setMeta({ ...meta, ready: true, racing: false });
        if (!this.startIfAllReady()) this.tellEveryone();
        break;
      }
      case 'go':
        if (hostOf(players) === player && meta.ready) this.start();
        break;
      case 'score':
        for (const other of others) other.send({ t: 'score', from: meta.id, ms: number(message.ms, 0, 3_600_000, 0), n: number(message.n, 0, 1000, 0) });
        break;
      case 'world':
        // Only the host's balloons are everyone's.
        if (hostOf(players) !== player) return;
        for (const other of others) other.send({ t: 'world', from: meta.id, ...cleanWorld(message) });
        break;
      case 'claim': {
        // The first hand to get there has it, and everyone is told who that was.
        const k = number(message.k, 0, 1_000_000, 0);
        if (!meta.racing || this.claims.has(k)) return;
        this.claims.set(k, meta.id);
        for (const each of players) each.send({ t: 'claimed', k, by: meta.id });
        break;
      }
      case 'wipe': {
        // The first hand to wipe a patch has it, and everyone is told which this player got. Those that had gone
        // to someone already are said again, only to this player, so a game that missed hearing it, as when the
        // connection dropped, still learns whose they are.
        if (!meta.racing) return;
        const { w, c } = cleanWipe(message);
        const got = [];
        const theirs = new Map();
        for (const patch of c) {
          const key = w * WINDOW_PATCHES + patch;
          const owner = this.patches.get(key);
          if (owner === undefined) {
            this.patches.set(key, meta.id);
            got.push(patch);
          } else {
            if (!theirs.has(owner)) theirs.set(owner, []);
            theirs.get(owner).push(patch);
          }
        }
        if (got.length) for (const each of players) each.send({ t: 'wiped', w, c: got, by: meta.id });
        for (const [by, patches] of theirs) player.send({ t: 'wiped', w, c: patches, by });
        break;
      }
      case 'hit':
        if (!meta.racing) return;
        for (const other of others) other.send({ t: 'hit', from: meta.id, ...cleanHit(message) });
        break;
      case 'ball':
        // Only the host's ball is everyone's.
        if (hostOf(players) !== player) return;
        for (const other of others) other.send({ t: 'ball', from: meta.id, ...cleanBall(message) });
        break;
      case 'stand':
        // The Smoothie Stand, from whoever runs it: the host's game, and if that goes, the next still playing,
        // which each game works out for itself, so here it only has to come from someone playing.
        if (!meta.racing) return;
        for (const other of others) other.send({ t: 'stand', from: meta.id, ...cleanStand(message) });
        break;
      case 'shot': {
        // Only the host's game runs the ball, so only it hears a shot, and only from someone playing.
        const host = hostOf(players);
        if (!meta.racing || host === player || !host) return;
        host.send({ t: 'shot', from: meta.id, ...cleanShot(message) });
        break;
      }
      case 'car':
      case 'plane':
      case 'hand':
      case 'pose':
      case 'racket':
      case 'runner':
      case 'walker':
      case 'ship':
      case 'catcher':
      case 'tank': {
        const moved = { car: cleanCar, plane: cleanPlane, hand: cleanHand, pose: cleanPose, racket: cleanRacket, runner: cleanRunner, walker: cleanWalker, ship: cleanShip, catcher: cleanCatcher, tank: cleanTank }[message.t](message);
        for (const other of others) other.send({ t: message.t, from: meta.id, ...moved });
        break;
      }
      case 'done':
        if (!meta.racing) return;
        player.setMeta({ ...meta, racing: false });
        for (const other of others) other.send({ t: 'done', from: meta.id, ms: number(message.ms, 0, 3_600_000, 0), n: number(message.n, 0, 1000, 0), w: message.w === 0 ? 0 : 1 });
        this.tellEveryone();
        break;
      case 'leave':
        this.leave(player);
        break;
      default:
    }
  }

  /** A player has gone, by leaving or by their connection closing. */
  leave(player) {
    if (!player.meta?.id) return;
    this.counts.delete(player.meta.id);
    this.recent.set(player.meta.id, { meta: player.meta, at: this.now() });
    player.setMeta(null);
    if (!this.startIfAllReady()) this.tellEveryone();
  }

  /** Everyone's ready, and there's someone to race: off they go. Otherwise the host can start anyway. */
  startIfAllReady() {
    const everyone = this.room.players().filter((each) => each.meta?.id);
    if (everyone.length < 2 || !everyone.every((each) => each.meta.ready)) return false;
    this.start();
    return true;
  }

  /** The race starts on the host's course, for everyone who's ready. */
  start() {
    const players = this.room.players().filter((each) => each.meta?.id);
    const host = hostOf(players);
    // In the order they came, the host first, which is the order they line up in on every computer.
    const racers = players.filter((each) => each.meta.ready).sort(byJoining);
    if (!host || !racers.length) return;
    for (const racer of racers) racer.setMeta({ ...racer.meta, ready: false, racing: true });
    this.claims.clear();
    this.patches.clear();
    const { level, length, mode } = host.meta;
    // One seed for everyone, so a game laid out by chance is laid out the same on every computer.
    const seed = Math.floor(Math.random() * 2 ** 31);
    const go = { t: 'go', level, length, laps: length, mode, racers: racers.map((each) => each.meta.id), seed };
    for (const player of players) player.send(go);
    this.tellEveryone();
  }

  /** Everyone is told who's here now, and each which of them they are. */
  tellEveryone() {
    const players = this.room.players().filter((each) => each.meta?.id);
    const host = hostOf(players);
    const members = players
      .slice()
      .sort(byJoining)
      .map(({ meta }) => ({ id: meta.id, name: meta.name, driver: meta.driver, ready: meta.ready, racing: meta.racing, host: meta.id === host?.meta.id }));
    for (const player of players) player.send({ t: 'room', you: player.meta.id, members });
  }

  flooding(id) {
    const second = Math.floor(this.now() / 1000);
    const count = this.counts.get(id);
    if (!count || count.second !== second) {
      this.counts.set(id, { second, count: 1 });
      return false;
    }
    count.count += 1;
    return count.count > MOST_A_SECOND;
  }
}
