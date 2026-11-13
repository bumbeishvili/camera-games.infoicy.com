// Playing Frost Arena in the tests, with real photos of two hands going through the real tracker. The hand in
// play is the right one unless a test says otherwise: it holds the rifle. The other is the helper. A test says
// what each is doing by which photo the fake camera shows for it, and how far across the picture the rifle hand is.
import { expect, openGame, show, waitForScreen } from '../helpers.js';

export const GAME = 'frost-arena';
export const SCALE = 0.7;

/**
 * What the two hands are doing: rifle is the hand in play and helper the other, each 'open', 'fist' or null for
 * out of the picture. across is how far the rifle hand is to one side, in the fake camera's own pixels.
 */
export const hands = (page, { rifle = 'fist', helper = null, across = 0, side = 'right' } = {}) => {
  const scene = { scale: SCALE, [`${side}OffsetX`]: across };
  const [left, right] = side === 'right' ? [helper, rifle] : [rifle, helper];
  return show(page, left, right, scene);
};

/** Gets through the hand check with the rifle hand open, and on into the match, with both hands closed after it. */
export async function startMatch(page, settings = {}, side = 'right') {
  await openGame(page, settings, GAME);
  await hands(page, { rifle: 'open', helper: null, side });
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await hands(page, { rifle: 'fist', helper: null, side });
  // The tracker takes a moment to see the hand has closed: nothing a test sets up should be fired at before it has.
  await expect.poll(() => page.evaluate(() => window.__game.monitor.snapshot.handOpen), { timeout: 10_000, intervals: [50] }).toBe(false);
}

/** How the match is, and what's on the screen. */
export const matchIs = (page) => page.evaluate(() => {
  const { match, yard } = window.__game;
  const { child } = match;
  return {
    state: match.state,
    score: [...match.score],
    goal: match.goal,
    level: match.levelNumber,
    canLose: match.level.canLose,
    stats: { ...match.stats },
    rounds: child.rounds,
    changing: child.reloadLeft > 0,
    rifle: child.rifle,
    health: child.health,
    at: { x: child.x, z: child.z },
    heading: child.heading,
    speed: child.speed,
    firing: child.firing,
    locked: match.locked ? match.locked.who : null,
    resting: match.resting,
    sides: [match.troopers.filter(({ team }) => team === 0).length, match.troopers.filter(({ team }) => team === 1).length],
    parts: match.troopers.filter(({ team }) => team === 1).map(({ part }) => part),
    crate: match.crate ? { ...match.crate } : null,
    power: { ...match.power },
    snowing: yard.snow.visible,
    helper: document.body.dataset.helper,
    sight: document.body.dataset.sight,
    film: document.body.dataset.film,
  };
});

/**
 * Stands the child at the near end of the alley down one side of the yard, looking up it, with one of the other
 * team standing still in front of them, this far off, and everyone else out of the way and standing still too.
 * Returns who it is. With away as null, there's nobody in front at all.
 */
export const someoneInFront = (page, away = 9, { health = null } = {}) => page.evaluate(([far, left]) => {
  const { match } = window.__game;
  const { child } = match;
  Object.assign(child, { x: -21, z: 13, heading: 0, speed: 0 });
  const others = match.troopers.filter((each) => each !== child);
  const first = others.find(({ team }) => team === 1);
  // Right out of the way: beyond the fence, where nobody can see them, or be seen.
  for (const each of others) Object.assign(each, { bot: false, x: 200, z: each.team ? -200 : 200, speed: 0, firing: false, safeLeft: 0 });
  if (far === null) return null;
  Object.assign(first, { x: -21, z: 13 - far, heading: Math.PI, shield: 0 });
  if (left !== null) first.health = left;
  return first.who;
}, [away, health]);

/** How bright the whole picture is, frame by frame, with everything that's drawn over it. */
export function brightnessThrough(page, frames) {
  return page.evaluate(async (count) => {
    const { yard } = window.__game;
    const small = document.createElement('canvas');
    small.width = 32;
    small.height = 18;
    const context = small.getContext('2d', { willReadFrequently: true });
    const reading = [];
    for (let i = 0; i < count; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      yard.render();
      context.drawImage(yard.canvas, 0, 0, 32, 18);
      const { data } = context.getImageData(0, 0, 32, 18);
      let total = 0;
      for (let j = 0; j < data.length; j += 4) total += (data[j] + data[j + 1] + data[j + 2]) / 3;
      reading.push(total / (32 * 18));
    }
    return reading;
  }, frames);
}

export const biggestStep = (values) => Math.max(...values.slice(1).map((value, index) => Math.abs(value - values[index])));
export const soon = (fn, timeout = 20_000) => expect.poll(fn, { timeout, intervals: [100] });
export { waitForScreen };
