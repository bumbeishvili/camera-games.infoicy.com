// Balloon Pop's numbers, and what each level changes, with no screen in this file so it can be tested
// on its own. Level 1 is the game as it always was. A grown-up's choices are never changed by a level:
// the hand, how open it has to be, reach help, how many balloons to pop, and the maths challenge's kind.
// Balloon speed is a grown-up's choice too, and a level only goes a little faster than whichever it is.
import { ramp, rampWhole, stepsAt } from '../../core/levels.js';

// rise is in screen heights a second, every is seconds between balloons, most is how many
// can be up at once. Even fast is gentle: this is about reaching, not reaction time.
export const PACES = {
  slow: { rise: 0.085, every: 1.05, most: 7 },
  medium: { rise: 0.115, every: 0.8, most: 9 },
  fast: { rise: 0.16, every: 0.6, most: 11 },
};

export const WANDERER_CHANCE = 0.25; // Balloons that sway wide and drift across, at level 1.
// A star balloon only pops once an open hand has stayed on it this long, with a ring closing round it.
// Holding the hand open is the exercise itself, so it's a little more of what the game is for.
export const STAR_HOLD_SECONDS = 0.35;
export const MOST_ANSWERS = 5; // The most balloons with answers on them, so they fit side by side.

/** What changes from level 1 to 10. */
export function balloonLevel(level) {
  return {
    // Balloons float up faster. Even at level 10 each is on the screen for 3/4 of the time it was.
    rise: ramp(level, 1, 1.35),
    // They come along more often: the time between them, as a share of the chosen speed's.
    every: ramp(level, 1, 0.65),
    // More of them can be up at once.
    most: rampWhole(level, 0, 3),
    // More of them sway wide and drift across.
    wanderers: ramp(level, WANDERER_CHANCE, 0.5),
    // From level 4, star balloons, which need the open hand held on them for a moment.
    stars: stepsAt(level, { 1: 0, 4: 0.15, 6: 0.25, 9: 0.3 }),
    // From level 5, two balloons tied together come up as a pair, and come apart when one pops.
    pairs: stepsAt(level, { 1: 0, 5: 0.15, 8: 0.25 }),
    // From level 7, a breeze pushes every balloon slowly one way and then the other, as a share of the
    // screen's width each way.
    breeze: stepsAt(level, { 1: 0, 7: 0.03, 9: 0.045 }),
    // With the maths challenge on, from level 4 one more answer to choose from, and from level 8 two.
    answers: stepsAt(level, { 1: 0, 4: 1, 8: 2 }),
  };
}

/** How many balloons come up a minute at a speed and level, counting both of a pair. */
export function balloonsPerMinute(paceName, level) {
  const plan = balloonLevel(level);
  return (60 / (PACES[paceName].every * plan.every)) * (1 + plan.pairs);
}

/** How many seconds a balloon takes to float up the screen, at its usual pace. */
export function secondsOnScreen(paceName, level) {
  return 1 / (PACES[paceName].rise * balloonLevel(level).rise);
}
