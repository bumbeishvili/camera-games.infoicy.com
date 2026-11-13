// Playing Frost Arena in the tests, with real photos of two hands going through the real tracker. The hand in
// play is the right one unless a test says otherwise: open, it's dragged to look round, and its thumb up fires.
// The other is dragged to walk, and its thumb up changes the magazine. A closed hand is lifted, and does
// nothing. A test says where each hand is, in palm lengths from where it's first seen, and which photo it looks
// like.
import { expect, openGame, show, waitForScreen } from '../helpers.js';

export const GAME = 'frost-arena';
export const SCALE = 0.7;
// How long a palm is in the fake camera's picture at that scale, in its own pixels, as the tracker measures it.
export const PALM = 120;
// How far the walking hand is dragged for full speed, in palm lengths, and how far the view turns for the other
// dragged a palm length across, in degrees, at the usual sensitivity: see STICK and SENSITIVITY in controls.js.
export const REACH = 0.4;
export const PER_PALM = (1.2 * 180) / Math.PI;
export const THUMB = { photo: 'thumbs-up' };
export const FIST = { photo: 'fist' };

const place = (hand) => (hand === null ? null : { photo: 'open', x: 0, y: 0, ...hand });

/**
 * Where the two hands are, and what they look like. aim is the hand in play and move the other, each
 * { photo, x, y }, with x and y in palm lengths across and down from where it came to rest, or null for a hand
 * that's out of the picture.
 */
export const hands = (page, { aim = {}, move = {}, side = 'right' } = {}) => {
  const [aimHand, moveHand] = [place(aim), place(move)];
  const other = side === 'right' ? 'left' : 'right';
  // One hand that opens, closes and makes shapes where it is, rather than a different photo somewhere else each time.
  const scene = { scale: SCALE, sameHand: true };
  for (const [name, hand] of [[side, aimHand], [other, moveHand]]) {
    if (!hand) continue;
    scene[`${name}OffsetX`] = hand.x * PALM;
    scene[`${name}OffsetY`] = hand.y * PALM;
  }
  const photo = (hand) => hand?.photo ?? null;
  return side === 'right' ? show(page, photo(moveHand), photo(aimHand), scene) : show(page, photo(aimHand), photo(moveHand), scene);
};

/** What the hands are asking for, and what's drawn of them. */
export const controlsAre = (page) => page.evaluate(() => {
  const { out } = window.__game.controls;
  return { ...out, stick: { ...out.stick }, pad: { ...out.pad } };
});

/** Gets through the hand check and on into the match, with both hands open, and so down, where they are. */
export async function startMatch(page, settings = {}, side = 'right') {
  await openGame(page, settings, GAME);
  await hands(page, { side });
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await expect.poll(async () => {
    const { stick, pad } = await controlsAre(page);
    return stick.on && pad.on;
  }, { timeout: 15_000, intervals: [50] }).toBe(true);
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
    assist: match.assist,
    stats: { ...match.stats },
    rounds: child.rounds,
    changing: child.reloadLeft > 0,
    rifle: child.rifle,
    health: child.health,
    at: { x: child.x, z: child.z },
    heading: child.heading,
    speed: child.speed,
    sprinting: child.sprinting,
    firing: child.firing,
    aimed: match.aimed ? match.aimed.who : null,
    resting: match.resting,
    sides: [match.troopers.filter(({ team }) => team === 0).length, match.troopers.filter(({ team }) => team === 1).length],
    parts: match.troopers.filter(({ team }) => team === 1).map(({ part }) => part),
    crate: match.crate ? { ...match.crate } : null,
    power: { ...match.power },
    snowing: yard.snow.visible,
    sight: document.body.dataset.sight,
    hit: document.body.dataset.hit,
    how: document.body.dataset.how,
  };
});

/**
 * Stands the player at the near end of the alley down one side of the yard, looking up it, with one of the other
 * team standing still in front of them, this far off, and everyone else out of the way and doing nothing.
 * Returns who it is. With away as null, there's nobody in front at all.
 */
export const someoneInFront = (page, away = 9, { health = null } = {}) => page.evaluate(([far, left]) => {
  const { match } = window.__game;
  const { child } = match;
  Object.assign(child, { x: -21, z: 13, heading: 0, vx: 0, vz: 0 });
  const others = match.troopers.filter((each) => each !== child);
  const first = others.find(({ team }) => team === 1);
  // Right out of the way: beyond the fence, where nobody can see them, or be seen.
  for (const each of others) Object.assign(each, { bot: false, x: 200, z: each.team ? -200 : 200, speed: 0, firing: false, safeLeft: 0 });
  if (far === null) return null;
  Object.assign(first, { x: -21, z: 13 - far, heading: Math.PI, shield: 0 });
  if (left !== null) first.health = first.most = left;
  return first.who;
}, [away, health]);

/** Out in the open with nobody about, facing up the yard, with room to walk every way. */
export const inTheOpen = (page) => page.evaluate(() => {
  const { match } = window.__game;
  for (const each of match.troopers) if (each !== match.child) Object.assign(each, { bot: false, x: 200, z: each.team ? -200 : 200, speed: 0, firing: false });
  Object.assign(match.child, { x: -7, z: 6.5, heading: 0, vx: 0, vz: 0 });
});

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
export const degrees = (radians) => (radians * 180) / Math.PI;
export { waitForScreen };
