// Playing with friends, in High Five Racers, Sky Wings and Balloon Pop: who's in a room, and what they pass to
// each other.
// The same rules run on Cloudflare (server/worker.js) and on this computer for the tests
// (tools/race-server.mjs). Each game has rooms of its own. Nothing here is kept once everyone has gone, and no
// camera picture ever comes here: only where each car or plane is, the name a player typed, and which
// character drives or flies.
//
// A player sends JSON messages, each { t, ... }:
//   hi     { name, driver, level, length, mode, racing }   first, after connecting, and again if any of it
//                                      changes. length is the race's laps, a flight's planes to drop, or how
//                                      many balloons a game of Balloon Pop has, and mode its maths challenge.
//                                      racing says they're in the middle of one, for someone back mid-race
//   ready  {}                              they're waiting at the start
//   go     {}                              the host starts with whoever is ready
//   car    { ms, d, x, s, l, f, b }        where their car is, about 10 times a second, in a race
//   plane  { ms, x, y, z, h, p, r, s, f }  where their plane is, in a flight
//   score  { ms, n }                       how many they've popped, or got right, so far
//   hand   { ms, x, y, v, o, p }           where their glove is in Balloon Pop, from 0 to 1 across and down
//                                      the screen, whether it can be seen and is open, and p, its 21
//                                      points from the middle of the palm, as x, y, x, y..., in palms
//   world  { ms, b, q, qa }                the host's balloons in Balloon Pop, which everyone plays with:
//                                      each [id, x, y, r, colour, number, flags], and the sum being asked
//   claim  { k }                           this player's hand got to balloon k: the first to says so has it
//   done   { ms, n, w }                    they've finished, this long after "GO!", with n dropped, and w 1
//                                      if that's all of them (and in a race, always)
//   leave  {}                              they're going (closing the socket says the same)
// The room sends:
//   room   { you, members: [{ id, name, driver, ready, racing, host }] }   whenever that changes
//   go     { level, length, laps, mode, racers }   the countdown starts now, on the host's course (laps is length)
//   car, plane, score, hand, world { from, ... } and done { from, ms, n, w }   passed on from the others
//   claimed { k, by }                      balloon k went to player by, sent to everyone, them too
//   full   {}                              there are already MAX_RACERS in the room

export const MAX_RACERS = 4;
export const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // No 0, O, 1, I or L, which look alike.
export const CODE_LENGTH = 6;
export const MOST_BYTES = 1800; // A message bigger than this is ignored. The host's balloons are the biggest.
const MOST_BALLOONS = 24;
const MOST_A_SECOND = 40; // Messages a player can send in a second; more are dropped.
const COMES_BACK_WITHIN_MS = 15_000; // A player who goes and comes back as soon as this carries on as before.

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

export const validCode = (code) => typeof code === 'string' && code.length === CODE_LENGTH && [...code].every((letter) => CODE_LETTERS.includes(letter));

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
 * The rules of one room. room.players() is everyone connected now, each as { meta, setMeta(meta), send(message) },
 * where meta is what's kept about them: { id, joined, name, driver, level, laps, ready, racing }. now() is the time
 * in milliseconds. Nothing is kept here between calls, so it works the same on a server that sleeps in between.
 */
export class RaceRoom {
  constructor(room, now = () => Date.now()) {
    this.room = room;
    this.now = now;
    this.counts = new Map(); // id: { second, count }, to drop a flood of messages. Fine to lose.
    this.recent = new Map(); // id: { meta, at }, for those who have just gone: see cameBack. Fine to lose too.
    this.claims = new Map(); // Balloon Pop: which balloon went to whom, this game. Cleared as each one starts.
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
   * A new player has connected. They're given an id and a seat, or told the room is full. kept is what was
   * kept about them from a connection they're taking over: see takeOver.
   */
  arrive(player, id, kept = null) {
    if (kept) {
      player.setMeta({ ...kept, id });
      this.tellEveryone();
      return true;
    }
    const others = this.room.players().filter((each) => each !== player && each.meta?.id);
    if (others.length >= MAX_RACERS) {
      player.send({ t: 'full' });
      return false;
    }
    player.setMeta({ id, joined: this.now(), name: '', driver: '', level: 1, length: 2, mode: '', ready: false, racing: false });
    this.tellEveryone();
    return true;
  }

  /** A message from a player, as the text that came in. */
  hear(player, text) {
    const { meta } = player;
    if (!meta?.id || typeof text !== 'string' || text.length > MOST_BYTES) return;
    if (this.flooding(meta.id)) return;
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;
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
      case 'car':
      case 'plane':
      case 'hand': {
        const moved = { car: cleanCar, plane: cleanPlane, hand: cleanHand }[message.t](message);
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
    const { level, length, mode } = host.meta;
    const go = { t: 'go', level, length, laps: length, mode, racers: racers.map((each) => each.meta.id) };
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
