// Playing Spider Catcher with friends, each on their own computer with their own camera: how they share one garden.
//
// Every game makes the same spiders, from the seed they're all given as it starts (go, in server/race-room.js), at
// the host's level, and they go round the same paths by the same clock, the time since go came. So they're where they
// really are on every screen, without anything being sent about them. What happens to them is shared. Whoever's hand
// closes on a spider first has it, which the server decides (claim and claimed). And about 10 times a second, each
// game says, with where its glove is, what's in it and which spiders are home on its screen (catcher). So a spider
// goes home, or back to playing, on every screen, and a message lost on the way is put right by the next one.
//
// Each child sees the garden from their own side, with their own reach help, so where a friend's glove is goes from
// their garden to this one through acrossGardens. There's no screen in this file, so it runs in the unit tests.
import { seededRandom } from '../../core/friends.js';

/** Random numbers that are the same on every friend's computer: from the game's seed, for one place in the garden. */
export const placeRandom = (seed, place) => seededRandom((seed + place * 7919) >>> 0);

// A spider is known by its place and where it comes in that place's line, as place × 10 + that. It's caught with a
// claim for that × 1000, plus how many times it has been caught and let go before, so that a claim from before it was
// last let go is told apart from a new one.
export const MOST_AT_A_PLACE = 10;
export const catchKey = (place, index, catches) => (place * MOST_AT_A_PLACE + index) * 1000 + catches;

export function readKey(k) {
  const spider = Math.floor(k / 1000);
  return { place: Math.floor(spider / MOST_AT_A_PLACE), index: spider % MOST_AT_A_PLACE, catches: k % 1000 };
}

const isHome = (spider) => spider.state === 'home' || spider.state === 'landing';

/**
 * What the server's answer to a claim means for a spider, as this game has it: { state, holder, catches }, holder
 * being whose glove it's in. catches is how many times it had been let go when it was claimed, by is who has it, and
 * me is this player. It's:
 *   'old'     home already, or let go since that claim: nothing changes
 *   'mine'    this child's own catch: it stays in their glove
 *   'gone'    this child's own catch, which they've let go of already: so it was caught, and let go
 *   'theirs'  a friend's: it goes to their glove, even out of this child's, if both closed on it at once
 */
export function answerFor(spider, catches, by, me) {
  if (isHome(spider) || catches < spider.catches) return 'old';
  if (by !== me) return 'theirs';
  return spider.holder === me ? 'mine' : 'gone';
}

/**
 * What a friend's latest message says about the spiders at this place, as this game has them. h is what's in their
 * glove, as the claim it was caught with, or -1, and m which spiders are home on their screen, a bit each for where
 * they come in the line. Returns the spiders to bring home here, and those in their glove here that they've let go of.
 */
export function readFriend(spiders, place, id, { h, m }) {
  const home = spiders.filter((spider) => !isHome(spider) && Math.floor(m / 2 ** spider.index) % 2 === 1);
  const letGo = spiders.filter((spider) => spider.holder === id && !home.includes(spider) && catchKey(place, spider.index, spider.catches) !== h);
  return { home, letGo };
}

/** Which spiders at a place are home on this screen, a bit each, for friends' games: see readFriend. */
export const homeBits = (spiders) => spiders.filter(isHome).reduce((bits, spider) => bits + 2 ** spider.index, 0);

// Where the spiders play, this far either way from the middle of the garden, a friend's glove keeps its distance from
// the middle, so it's by the same spider on every screen. Between there and the web, it's stretched to fit, so it's at
// the web when it's at theirs.
export const SPIDERS_BAND = 0.25; // In screen heights.

/**
 * How far from the web something is in one child's garden, from how far it is in another's: in screen heights, away
 * from the web, towards where the spiders play. from and to are how far each garden's middle is from its web, which
 * reach help and the shape of the screen change.
 */
export function acrossGardens(distance, from, to) {
  const [near, nearTo] = [from - SPIDERS_BAND, to - SPIDERS_BAND];
  // A screen too narrow to have room between the web and the spiders just keeps the distance from the middle.
  if (distance >= near || near < 0.04 || nearTo < 0.04) return distance - from + to;
  return (distance * nearTo) / near;
}
