// Getting through Leap Trail, with footage of a real person in place of the webcam.
import { expect, openGame, waitForScreen } from '../helpers.js';

/** Most tests are about one obstacle at a time, so the runner waits for the move unless they say. */
export async function openTrail(page, settings = {}) {
  await openGame(page, { onMissed: 'wait', ...settings }, 'leap-trail');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
}

export const footage = (page, name, options = {}) =>
  page.evaluate(([clip, settings]) => window.__camera.showFootage(clip, settings), [name, options]);

/** A person standing still, in full view, is what the body check wants. */
export const standInView = (page) => footage(page, 'strikes', { from: 0.2, playing: false });

export async function toChoosing(page) {
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
}

/** From the title to the practice, with a person standing in view. */
export async function reachPractice(page, settings = {}) {
  await openTrail(page, settings);
  await standInView(page);
  await toChoosing(page);
  await page.locator('#run-start').click();
  await waitForScreen(page, 'practice');
}

/** From the title to running, skipping the practice. */
export async function reachRun(page, settings = {}) {
  await reachPractice(page, settings);
  await page.locator('#practice-skip').click();
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'run');
}

/** What a tracked body would do, for tests that are about what comes after. Jumping is all there is. */
export function bodyDoes(page) {
  return page.evaluate(() => window.__game.run.jump());
}

/** Moves the person in the footage across, as a share of the picture, towards the right of the mirror. */
export const standAcross = (page, shiftX) => footage(page, 'strikes', { from: 0.2, playing: false, shiftX });

export const runState = (page) => page.evaluate(() => {
  const { run } = window.__game;
  const next = run.next;
  return {
    state: run.state,
    distance: run.distance,
    speed: run.speed,
    waiting: run.waiting,
    resting: run.resting,
    stats: run.stats,
    lane: run.lane,
    next: next ? { kind: next.kind, needs: next.needs, gap: run.gapTo(next), inReach: run.inReach(next) } : null,
  };
});

/** Makes the next obstacle this one, close by, so a test needn't wait for chance to bring it. */
export function nextObstacleIs(page, kind, gap = 18) {
  return page.evaluate(async ([chosen, ahead]) => {
    const { OBSTACLES } = await import('/games/leap-trail/run.js');
    const { run, world } = window.__game;
    const next = run.next;
    world.retire(next);
    Object.assign(next, OBSTACLES[chosen], { kind: chosen, at: run.distance + ahead });
    run.announced = null; // It may have been asked for already, as something else.
    for (let i = next.index + 1; i < run.course.length; i += 1) {
      world.retire(run.course[i]);
      run.course[i].at = Math.max(run.course[i].at, next.at + 25 * (i - next.index));
    }
    run.end = Math.max(run.end, run.course.at(-1).at + 15);
  }, [kind, gap]);
}
