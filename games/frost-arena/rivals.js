// Frost Arena against friends: up to four players, each on their own computer with their own camera, in the
// same yard, everyone for themselves. Nobody is played by the computer. The first to the number of tags chosen by
// whoever made the match ends it, and everyone is told how many they made.
//
// Each game runs only its own player. A shot that hits a friend is decided by the game that fired it, as that's
// the one whose player is looking down the sights: it shows at once, and the friend's game is told how many this
// player has made on them so far (a 'zap'), and counts them (hitBy). How much a player has left, and when they're
// tagged out, is for their own game to say, and it tells everyone who by. So every game counts the same tags:
// each player's are the times the others say that player tagged them out.
//
// A player who's tagged out sits for a few seconds and is back at their own start, as in a match alone, and
// nothing is lost but the tag. A friend who goes leaves the rest to carry on, and with nobody left it's over.
//
// What everyone in the yard shares with a match together is in squad.js. There's no screen, sound or camera in
// this file, so it all runs in the unit tests.
import { LEVELS, RIFLES, WON_AFTER } from './arena.js';
import { MOST_PLAYERS, Squad } from './squad.js';

// Where each player starts, and comes back to, by their place: one at each end, and one in the alley down each side.
export const RIVAL_STARTS = [
  { x: 0, z: 13, heading: 0 },
  { x: 0, z: -13, heading: Math.PI },
  { x: -20, z: 0, heading: Math.PI / 2 },
  { x: 20, z: 0, heading: -Math.PI / 2 },
];
const HITS_AT_ONCE = 4; // More hits at once than this from a friend's game are a mistake.

export class Rivals extends Squad {
  /**
   * slot is this player's place, 0 for whoever made the match. players is everyone playing, this player too, as
   * { slot, name }. tags is the host's number of tags. rifle and assist are this player's own.
   */
  constructor({ slot = 0, players = [{ slot: 0 }], tags = 10, rifle = 'ak', assist = true, random = Math.random, onEvent = () => {} } = {}) {
    const seats = Squad.seats([...(Array.isArray(players) ? players : []), { slot }]);
    super({ tags, level: 'medium', levelNumber: 1, rifle, assist, random, onEvent, slot, players: seats });
    this.runs = false; // Nobody is played by the computer here.
    this.zaps = Array.from({ length: MOST_PLAYERS }, () => 0); // How many hits this player has made on each friend.
    this.zapped = Array.from({ length: MOST_PLAYERS }, () => 0); // How many of each friend's hits on this player have been counted.
  }

  /** Each player is a team of one, at their own start. */
  enlist({ rifle, slot, players }) {
    this.slot = slot;
    this.score = Array.from({ length: MOST_PLAYERS }, () => 0);
    for (const player of players) this.seat(player, player.slot, RIVAL_STARTS[player.slot], rifle);
  }

  /** Here a player can always be tagged out, however hard a match alone is set to be: that's how a tag is made. */
  configure(options) {
    super.configure(options);
    this.level = { ...(this.level ?? LEVELS.medium), canLose: true };
  }

  /** How many tags this player has made. */
  get mine() {
    return this.score[this.slot];
  }

  get left() {
    return Math.max(0, this.goal - this.mine);
  }

  /** Nothing waits for anyone, against each other. */
  get paused() {
    return false;
  }

  /** The friend who's made the most tags of those still here, or of all of them if nobody is. */
  get leader() {
    const { friends } = this;
    const still = friends.filter(({ state }) => state !== 'gone');
    return (still.length ? still : friends).reduce((best, each) => (!best || this.score[each.number] > this.score[best.number] ? each : best), null);
  }

  /* ---------- hits, on every screen ---------- */

  /**
   * A shot of this player's that hits a friend shows at once, and their game is told how many this player has
   * made on them so far. A hit on this player, which a friend's game has told of, is this game's to count.
   */
  hit(trooper, amount, by) {
    const { child } = this;
    if (trooper === child) {
      if (this.hitOwn(amount, by)) this.checkEnd();
      return;
    }
    if (by !== child || trooper.bot || this.state !== 'playing' || this.endIn !== null) return;
    if (trooper.state !== 'in' || trooper.safeLeft > 0 || !(trooper.health > 0)) return;
    Object.assign(trooper, { hitLeft: 0.3, tagAt: this.time, health: Math.max(0, trooper.health - amount) });
    this.zaps[trooper.number] += 1;
    this.emit('hit', { trooper, by, health: trooper.health });
    this.emit('zap', { slot: trooper.number, rifle: child.rifle, hits: this.zaps[trooper.number] });
  }

  /**
   * The friend with this place has hit this player this many times in all, with this rifle, as their game
   * decides. Each one not counted yet lands, unless this player is sitting out or only just back.
   */
  hitBy(slot, rifle, total) {
    if (this.state !== 'playing' || this.endIn !== null) return;
    const friend = this.playerAt(slot);
    if (!friend || friend === this.child || friend.state === 'gone' || !Number.isFinite(total)) return;
    const fresh = Math.round(total) - this.zapped[slot];
    if (!(fresh > 0)) return;
    this.zapped[slot] += fresh;
    for (let i = 0; i < Math.min(fresh, HITS_AT_ONCE); i += 1) this.hit(this.child, (RIFLES[rifle] ?? RIFLES.ak).hit, friend);
  }

  update(dt, input) {
    super.update(dt, input);
    if (this.state === 'playing') this.checkEnd();
  }

  /** Each player's tags are the times the others say that player tagged them out. */
  tally() {
    const players = this.troopers.filter(({ bot }) => !bot);
    for (let slot = 0; slot < MOST_PLAYERS; slot += 1) {
      this.score[slot] = players.reduce((sum, each) => sum + (each.number === slot ? 0 : each.outBy[slot]), 0);
    }
    for (const each of players) each.tags = this.score[each.number];
    this.stats.tags = this.mine;
  }

  friendTaggedOut(friend, by) {
    this.tally();
    super.friendTaggedOut(friend, by);
    this.checkEnd();
  }

  /** The first to the tags ends it, for everyone: won for whoever made them, and over for the rest. */
  checkEnd() {
    if (this.endIn !== null || this.state !== 'playing') return;
    this.tally();
    if (Math.max(...this.score) < this.goal) return;
    this.ending = this.mine >= this.goal ? 'won' : 'over';
    this.endIn = WON_AFTER;
  }

  /** A friend has gone. The rest carry on, and with nobody left it's over. */
  friendGone(slot) {
    if (!super.friendGone(slot)) return false;
    if (this.state !== 'playing' || this.endIn !== null) return true;
    if (this.here.length < 2) {
      this.ending = 'over';
      this.endIn = WON_AFTER;
    }
    return true;
  }
}
