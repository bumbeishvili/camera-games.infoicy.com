// Frost Arena together with friends: up to four players, each on their own computer with their own camera, all
// on the blue team with Giraffe, against the computer's red team.
//
// Giraffe and the red team have to be the same on every screen, and they go by where the players are, so one
// game runs them: the game of whoever made the match. Ten times a second it tells the friends' games where each
// of them is, how much they have left, whether they're firing and at whom, and how the match is going (wire).
// The friends' games show them (follow), and look, walk and fire just as they would alone. A shot that hits one
// of the red team is decided by the game that fired it, as that's the one whose player is looking down the
// sights. A friend's game shows its own hits at once and tells the host's game (a 'tag'), which counts them
// (friendTagged). What lands on a player is decided by their own game, from whoever the host's game says is
// firing at them, and a player who's tagged out says so themselves, which is how the host's game hears of it.
//
// It's the plain match, with none of what the levels bring, as hard as whoever made it chose: on Easy no player
// can be tagged out and it can't be lost, and on Medium and Tough the red team's tags count too. There's one
// more on the red team than there are players, and the tags to win are the number chosen for each player. The
// red team only stops and waits when every player's hands are out of the picture. A friend who goes leaves the
// rest to finish, with fewer tags left to make. If theirs was the game running Giraffe and the red team, the
// game of the first player still here takes them over as they are.
//
// What everyone in the yard shares with a match against each other is in squad.js. There's no screen, sound or
// camera in this file, so it all runs in the unit tests.
import { BASES, BOT, OUT_SECONDS, REDS, RIFLES, TAGS_TO_WIN, WON_AFTER, YARD, turnBetween } from './arena.js';
import { MOST_PLAYERS, OWED_SECONDS, PLAYER_LOOKS, Squad, wrap } from './squad.js';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;
const gapBetween = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** How far a value gets to another in a frame, going quickly at first and then settling. */
const nearer = (rate, dt) => 1 - Math.exp(-rate * dt);

// Giraffe's number in every friend's game, and the red team's are from 20: see byNumber in squad.js.
export const GIRAFFE = 10;
export const FIRST_RED = 20;
/** The red team, from the characters no player looks like to their friends. */
export const TEAM_REDS = REDS.filter((who) => !PLAYER_LOOKS.includes(who));
/** How many tags win it together: the number chosen, for each player. */
export const teamTags = (tags, players) => (TAGS_TO_WIN.includes(tags) ? tags : TAGS_TO_WIN[0]) * clamp(Math.round(players) || 1, 1, MOST_PLAYERS);
/** How many are on the red team: one more than there are players. */
export const teamReds = (players) => clamp(Math.round(players) || 1, 1, MOST_PLAYERS) + 1;
const MOST_TAGS = TAGS_TO_WIN.at(-1) * MOST_PLAYERS;

// What's said of each of the computer's players in a wire: sitting out, firing, and just back.
const OUT = 1;
const FIRING = 2;
const SAFE = 4;
// And of how the match has gone: still going, won, or lost.
const ENDINGS = [null, 'won', 'lost'];
const FOLLOW_RATE = 12; // How quickly one of them on a friend's screen gets to where the host's game last had it.
const JUMPED = 4; // One this far from where the host's game has it is put there, as when it's back at its end.
const SAFE_SHOWN = 0.25;
const TAGS_AT_ONCE = 4; // More hits at once than this from a friend's game are a mistake.

export class TeamMatch extends Squad {
  /**
   * slot is this player's place, 0 for whoever made the match. runs says whether this game runs Giraffe and the
   * red team, which is the host's. players is everyone playing, this player too, as { slot, name }. seed is the
   * same in every friend's game, and says which characters the red team are. tags and level are the host's
   * number of tags and how hard. rifle and assist are this player's own.
   */
  constructor({ slot = 0, runs = true, players = [{ slot: 0 }], seed = 0, tags = 10, level = 'medium', rifle = 'ak', assist = true, random = Math.random, onEvent = () => {} } = {}) {
    const seats = Squad.seats([...(Array.isArray(players) ? players : []), { slot }]);
    // Level 1: nothing a level brings.
    super({ tags: teamTags(tags, seats.length), level, levelNumber: 1, rifle, assist, random, onEvent, slot, players: seats, seed });
    this.runs = Boolean(runs);
    this.tagged = new Map(); // The host's game: how many of each friend's hits on each of the red team have been counted.
    this.tags = new Map(); // A friend's game: how many hits this player has made on each of the red team.
    this.hostPaused = false;
    this.tookOver = false;
  }

  /** The players along the blue end in the order they joined, Giraffe beside them, and the red team at theirs. */
  enlist({ rifle, slot, players, seed }) {
    this.slot = slot;
    const [blue] = BASES;
    const home = (index) => ({ x: blue.spots[index % blue.spots.length], z: blue.z, heading: blue.heading });
    players.forEach((player, index) => this.seat(player, 0, home(index), rifle));
    this.join(0, 'giraffe', 'm4', true, { home: home(players.length), number: GIRAFFE });
    const first = Math.abs(Math.round(seed) || 0) % TEAM_REDS.length;
    for (let i = 0; i < teamReds(players.length); i += 1) this.join(1, TEAM_REDS[(first + i) % TEAM_REDS.length], i % 2 ? 'm4' : 'ak', true, { number: FIRST_RED + i });
    this.castReds();
  }

  /** Those the computer plays: Giraffe and the red team. */
  get bots() {
    return this.troopers.filter(({ bot }) => bot);
  }

  /** They only stop and wait when every player still here has their hands out of the picture. */
  get paused() {
    if (!this.runs) return this.hostPaused;
    return this.here.every((each) => (each === this.child ? this.resting : each.resting));
  }

  /* ---------- hits, on every screen ---------- */

  /**
   * What lands on a friend is for their own game to say. In a friend's game, a shot of this player's that hits
   * one of the red team shows at once, and the host's game is told how many this player has made on them so far,
   * and counts them: see friendTagged. Everything else is the host's game's to decide, as in a match alone.
   */
  hit(trooper, amount, by) {
    if (trooper === this.child) {
      this.hitOwn(amount, by);
      return;
    }
    if (!trooper.bot) return;
    if (!this.runs) {
      if (by !== this.child || this.state !== 'playing' || this.endIn !== null || trooper.state !== 'in' || trooper.safeLeft > 0 || !(trooper.health > 0)) return;
      Object.assign(trooper, { hitLeft: 0.3, tagAt: this.time, health: Math.max(0, trooper.health - amount) });
      const hits = (this.tags.get(trooper.number) ?? 0) + 1;
      this.tags.set(trooper.number, hits);
      this.emit('hit', { trooper, by, health: trooper.health });
      this.emit('tag', { id: trooper.number, hits });
      return;
    }
    const was = trooper.state;
    super.hit(trooper, amount, by);
    // Whose tag it was is counted by the game that runs them, for everyone.
    if (was === 'in' && trooper.state === 'out') trooper.taggedBy = by.number;
  }

  /** How it ends is for the game that runs Giraffe and the red team to say, for everyone. */
  checkEnd() {
    if (this.runs) super.checkEnd();
  }

  /**
   * A friend's game says they've been tagged out. Where that can lose the match, it's a tag for the red team,
   * counted by the game that runs them.
   */
  friendTaggedOut(friend, by) {
    if (this.runs && this.state === 'playing' && this.endIn === null && this.level.canLose && by?.bot && by.team !== friend.team) {
      this.score[by.team] += 1;
      by.tags += 1;
    }
    super.friendTaggedOut(friend, by);
    this.checkEnd();
  }

  /**
   * The host's game hears that the friend with this place has hit one of the red team this many times in all.
   * Each one not counted yet is a hit, with the friend's rifle, and it can tag them out.
   */
  friendTagged(slot, number, total) {
    if (!this.runs || this.state !== 'playing') return;
    const friend = this.playerAt(slot);
    if (!friend || friend === this.child || friend.state === 'gone' || !Number.isFinite(total)) return;
    const key = `${slot}:${number}`;
    // A game that has taken them over hasn't heard the hits from before: they don't count again.
    const had = this.tagged.get(key) ?? (this.tookOver ? Math.round(total) - 1 : 0);
    const fresh = Math.round(total) - had;
    if (!(fresh > 0)) return;
    this.tagged.set(key, had + fresh);
    const bot = this.byNumber(number);
    if (!bot?.bot || bot.team === friend.team) return;
    for (let i = 0; i < Math.min(fresh, TAGS_AT_ONCE); i += 1) this.hit(bot, RIFLES[friend.rifle].hit, friend);
  }

  /* ---------- Giraffe and the red team, from the host's game to the friends' ---------- */

  /**
   * What the host's game tells the friends', as rows of numbers: each of the computer's players as [number, x, z,
   * the way they face, how much they have left, how much at most, whether they're out, firing or just back, who
   * they're firing at, how fast they're going, who tagged them out last], and n: blue's tags, red's, how many win
   * it, how many each player has made, in the order they joined, whether everyone is waiting, and whether it's
   * won (1) or lost (2).
   */
  wire() {
    const e = this.bots.map((bot) => [
      bot.number,
      round(bot.x, 2),
      round(bot.z, 2),
      round(wrap(bot.heading), 3),
      bot.state === 'in' ? Math.max(1, Math.round(bot.health)) : 0,
      Math.round(bot.most),
      (bot.state === 'out' ? OUT : 0) + (bot.firing ? FIRING : 0) + (bot.safeLeft > 0 ? SAFE : 0),
      bot.seen ? bot.seen.number : -1,
      round(bot.speed, 1),
      bot.taggedBy ?? -1,
    ]);
    const tags = Array.from({ length: MOST_PLAYERS }, (_, slot) => this.playerAt(slot)?.tags ?? 0);
    return { e, s: [], n: [this.score[0], this.score[1], this.goal, ...tags, this.paused ? 1 : 0, Math.max(0, ENDINGS.indexOf(this.endIn === null ? null : this.ending))] };
  }

  /**
   * A friend's game hears where the host's game has Giraffe and the red team, and how it's going. It comes from
   * another computer, so nothing in it is taken on trust: anything that isn't a row of numbers is passed over.
   */
  follow(wire) {
    if (this.runs || !['ready', 'playing'].includes(this.state) || this.endIn !== null) return;
    const { e, n } = wire ?? {};
    const rows = Array.isArray(e) ? e.filter((row) => Array.isArray(row) && row.length >= 10 && row.every(Number.isFinite)) : [];
    const [blue = 0, red = 0, goal = 0, ...rest] = Array.isArray(n) ? n.map((value) => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0)) : [];
    const tags = rest.slice(0, MOST_PLAYERS);
    const [paused = 0, ended = 0] = rest.slice(MOST_PLAYERS);
    this.hostPaused = Boolean(paused);
    if (goal > 0) this.goal = Math.min(goal, MOST_TAGS);
    this.score = [Math.min(blue, MOST_TAGS * 2), Math.min(red, MOST_TAGS * 2)];
    tags.forEach((count, slot) => {
      const player = this.playerAt(slot);
      if (player) player.tags = count;
    });
    this.stats.tags = this.child.tags;
    for (const row of rows) this.followBot(row);
    if (this.state === 'playing' && ENDINGS[ended]) {
      this.ending = ENDINGS[ended];
      this.endIn = WON_AFTER;
    }
  }

  followBot([number, x, z, h, health, most, flags, target, speed, by]) {
    const bot = this.byNumber(number);
    if (!bot?.bot) return;
    bot.at = { x: clamp(x, -YARD.halfX, YARD.halfX), z: clamp(z, -YARD.halfZ, YARD.halfZ), h: clamp(h, -7, 7) };
    bot.most = clamp(Math.round(most), 1, 1000);
    const left = clamp(Math.round(health), 0, bot.most);
    const out = Boolean(flags & OUT);
    if (out && bot.state === 'in') {
      Object.assign(bot, { state: 'out', outLeft: OUT_SECONDS, health: 0, firing: false, speed: 0 });
      if (this.aimed === bot) this.aimed = null;
      this.emit('tagged', { trooper: bot, by: this.byNumber(by), score: [...this.score] });
    } else if (!out && bot.state === 'out') {
      Object.assign(bot, { state: 'in', x: bot.at.x, z: bot.at.z, heading: bot.at.h, health: left, tagAt: -Infinity });
      this.emit('back', { trooper: bot });
    }
    if (bot.state === 'in') {
      bot.speed = clamp(speed, 0, 20);
      if (left < bot.health) {
        // Someone else's hit, which shows here as it's counted there.
        Object.assign(bot, { health: left, hitLeft: 0.3 });
        this.emit('hit', { trooper: bot, by: null, health: left });
      } else if (left > bot.health && this.time - (bot.tagAt ?? -Infinity) > OWED_SECONDS) {
        bot.health = left;
      }
      if (flags & SAFE) bot.safeLeft = SAFE_SHOWN;
    }
    bot.firing = bot.state === 'in' && Boolean(flags & FIRING);
    const seen = this.byNumber(target);
    bot.seen = seen && seen !== bot && seen.state === 'in' ? seen : null;
  }

  /**
   * In the host's game they think for themselves. In a friend's, they go smoothly to where the host's game last
   * had them, and each fires at whoever that says, as often as it would. A shot at this player lands only some
   * of the time, as in a match alone, and it's this game that says so. The rest are only for show.
   */
  runBots(dt) {
    if (this.runs) {
      super.runBots(dt);
      return;
    }
    const share = nearer(FOLLOW_RATE, dt);
    const waiting = this.paused || this.endIn !== null;
    for (const bot of this.bots) {
      const { at } = bot;
      if (!at || bot.state !== 'in') continue;
      if (gapBetween(bot, at) > JUMPED) Object.assign(bot, { x: at.x, z: at.z, heading: at.h });
      bot.x += (at.x - bot.x) * share;
      bot.z += (at.z - bot.z) * share;
      bot.heading += turnBetween(at.h, bot.heading) * share;
      bot.fireIn = Math.max(0, bot.fireIn - dt);
      const target = bot.seen;
      if (waiting || !bot.firing || !target || target.state !== 'in' || bot.fireIn > 0) continue;
      bot.fireIn = BOT.every;
      const landed = this.random() < this.chanceOn(target, bot);
      this.emit('shot', { by: bot, at: target, hit: landed });
      if (landed && target === this.child) this.hit(target, this.botHit(bot, target), bot);
    }
  }

  /* ---------- a friend going ---------- */

  /**
   * A friend has gone. What's left to do is for those still here: as many tags fewer as their share of them. If
   * theirs was the game running Giraffe and the red team, the game of the first player still here takes them over.
   */
  friendGone(slot) {
    const before = this.here.length;
    if (!super.friendGone(slot)) return false;
    if (!['ready', 'playing'].includes(this.state) || this.endIn !== null) return true;
    if (!this.runs && this.here.every(({ number }) => number >= this.slot)) this.takeOver();
    if (this.runs) this.goal = this.score[0] + Math.max(1, Math.ceil((this.left * (before - 1)) / before));
    return true;
  }

  /** This game runs Giraffe and the red team from here, as they are. */
  takeOver() {
    this.runs = true;
    this.tookOver = true;
    this.hostPaused = false;
    this.tags.clear();
    for (const bot of this.bots) {
      Object.assign(bot, { at: null, way: null, haunt: null, seen: null, seenFor: 0, burstLeft: 0, restLeft: 0, stuckFor: 0, wayIn: 0, firing: false, sinceHit: 0, angryAt: null, angryLeft: 0 });
      // One this player had just tagged out, which the other game hadn't said so yet.
      if (bot.state === 'in' && !(bot.health > 0)) {
        bot.health = 1;
        this.hit(bot, 1, this.child);
      }
    }
  }
}
