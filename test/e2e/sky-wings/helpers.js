// Getting through Sky Wings, with test footage of a person holding their arms out as the webcam.
import { expect, openGame, waitForScreen } from '../helpers.js';

export async function openSky(page, settings = {}) {
  await openGame(page, settings, 'sky-wings');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
}

export const footage = (page, name, options = {}) =>
  page.evaluate(([clip, settings]) => window.__camera.showFootage(clip, settings), [name, options]);

// Moments in the clip, in seconds, for what the arms are doing then.
export const ARMS = { down: 0.5, level: 4, right: 7, left: 10.5, high: 14, low: 17 };

/** Arms held still at one of the moments above. */
export const armsAre = (page, what) => footage(page, 'wings', { from: ARMS[what], playing: false });

export async function toChoosing(page) {
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
}

export async function reachLesson(page, settings = {}) {
  await openSky(page, settings);
  await armsAre(page, 'level');
  await toChoosing(page);
  await page.locator('#fly-start').click();
  await waitForScreen(page, 'lesson');
}

export async function reachFlight(page, settings = {}) {
  await reachLesson(page, settings);
  await page.locator('#lesson-skip').click();
  await waitForScreen(page, 'fly');
}

export const flightState = (page) => page.evaluate(() => {
  const { flight } = window.__game;
  return {
    state: flight.state,
    x: flight.x,
    y: flight.y,
    z: flight.z,
    heading: flight.heading,
    pitch: flight.pitch,
    roll: flight.roll,
    speed: flight.speed,
    hearts: flight.hearts,
    left: flight.left,
    dropped: flight.dropped,
    resting: flight.resting,
    locked: flight.locked?.index ?? null,
    firing: flight.firing,
    atLimit: flight.atLimit,
    stats: flight.stats,
    enemies: flight.enemies.map(({ index, state, mode, hitsLeft }) => ({ index, state, mode, hitsLeft })),
  };
});

/**
 * Keeps one plane in front of the child's, this far ahead and this far off the middle of the ring, and
 * the others a long way behind, so a test can be about one thing. Runs until it's let go.
 */
export const holdPlaneInFront = (page, { ahead = 120, across = 0, up = 0 } = {}) => page.evaluate(([far, side, high]) => {
  clearInterval(window.__holding);
  window.__holding = setInterval(() => {
    const { flight } = window.__game;
    if (!flight) return;
    const [first, ...others] = flight.flying;
    if (!first) return;
    const { view, forward } = flight;
    first.x = view.eye.x + forward.x * far - forward.z * side;
    first.y = view.eye.y + forward.y * far + high;
    first.z = view.eye.z + forward.z * far + forward.x * side;
    first.mode = 'cross';
    first.way = { x: first.x, y: first.y, z: first.z };
    first.modeLeft = 5;
    first.dodgeLeft = 1;
    for (const other of others) {
      other.x = flight.x - forward.x * 700;
      other.z = flight.z - forward.z * 700;
      other.mode = 'cross';
      other.way = { x: other.x, y: other.y, z: other.z };
      other.modeLeft = 5;
    }
    flight.huntIn = 100;
  }, 16);
}, [ahead, across, up]);

export const letPlaneGo = (page) => page.evaluate(() => clearInterval(window.__holding));

/** A child steering straight for the nearest plane, up and down too. */
export const flyWell = (page) => page.evaluate(() => {
  const { reader } = window.__game;
  reader.readWings = () => {
    const { flight } = window.__game;
    const nearest = flight?.flying.slice().sort((a, b) => Math.hypot(a.x - flight.x, a.z - flight.z) - Math.hypot(b.x - flight.x, b.z - flight.z))[0];
    let bank = 0;
    let climb = 0;
    if (nearest) {
      const wanted = Math.atan2(nearest.x - flight.x, -(nearest.z - flight.z));
      const off = Math.atan2(Math.sin(wanted - flight.heading), Math.cos(wanted - flight.heading));
      bank = Math.max(-1, Math.min(1, off * 2));
      climb = Math.max(-1, Math.min(1, Math.atan2(nearest.y - flight.y, Math.hypot(nearest.x - flight.x, nearest.z - flight.z)) * 2));
    }
    reader.wings = { seen: true, out: true, span: 3.5, tilt: 0, height: 0, bank, climb };
  };
});

/** Drops however many planes are in the air, without waiting for the guns. */
export const dropPlanes = (page, count = 1) => page.evaluate((how) => {
  const { flight } = window.__game;
  flight.flying.slice(0, how).forEach((enemy) => {
    while (enemy.state === 'flying') flight.hit(enemy);
  });
}, count);
