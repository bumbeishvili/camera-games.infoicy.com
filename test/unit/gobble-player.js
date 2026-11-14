// A made-up player for Gobble and Grow's unit tests: a mouth that opens and shuts, and a face that goes where each
// test says, frame by frame, as the game would hear of them from the mouth's reading.
import { FIELD } from '../../games/gobble-grow/rules.js';

export const DT = 1 / 60;
export const MIDDLE = { x: FIELD.wide / 2, y: 0.56 };

/** The face that puts the creature at a place in the field, for a soup's head setting. */
export const steerTo = (soup, place) => ({
  x: ((place.x - MIDDLE.x) / (FIELD.wide / 2)) * soup.head.x,
  y: ((place.y - MIDDLE.y) / (FIELD.tall / 2)) * soup.head.y,
});

/** Runs a soup for a while. each(t) says what the child is doing at each moment, as { open, seen, steer }. */
export function run(soup, seconds, each = () => ({}), clock = null) {
  for (let t = 0; t < seconds; t += DT) {
    if (clock) clock.now += DT;
    soup.update(DT, { open: false, seen: true, steer: { x: 0, y: 0 }, ...each(t, soup) }, clock ? clock.now : null);
  }
}

/**
 * A child playing well, as a function to call once a frame, which says what they're doing: the face goes after the
 * nearest thing that can be eaten, and the mouth opens when it's in reach, holds for a moment, and shuts to munch.
 * wobble shakes the head, as a share of the camera's picture, and lostEvery has the tracker lose the face for a
 * few frames in every so many.
 */
export function goodPlayer(soup, { wobble = 0, lostEvery = 0, holdFor = 0.45, near = null } = {}) {
  let open = false;
  let openFor = 0;
  let frame = 0;
  const aim = { ...MIDDLE };
  // near is a place this child keeps to, as children do: they go for what's nearest to there, rather than to them.
  const nearest = () => {
    let best = null;
    for (const food of soup.foods) {
      if (food.state !== 'drift' || !soup.canEat(food) || food.x < 0.15 || food.x > FIELD.wide - 0.15 || food.y < 0.24 || food.y > 0.86) continue;
      const far = Math.hypot(food.x - near.x, food.y - near.y);
      if (!best || far < best.far) best = { x: food.x, y: food.y, far };
    }
    return best;
  };
  return () => {
    frame += 1;
    const wanted = soup.creature.holding ? null : near ? nearest() : soup.wants();
    if (wanted) {
      aim.x += (wanted.x - aim.x) * 0.08;
      aim.y += (wanted.y - aim.y) * 0.08;
    }
    if (!open && soup.target) [open, openFor] = [true, 0];
    else if (open) {
      openFor += DT;
      if (openFor > holdFor) open = false;
    }
    const shake = wobble ? { x: wobble * Math.sin(frame * 1.7), y: wobble * Math.cos(frame * 1.3) } : { x: 0, y: 0 };
    const steer = steerTo(soup, aim);
    const lost = lostEvery > 0 && frame % lostEvery < 3;
    return { open: open && !lost, seen: !lost, steer: { x: steer.x + shake.x, y: steer.y + shake.y } };
  };
}

/** That child, playing a soup for a while. */
export function playWell(soup, seconds, options = {}) {
  run(soup, seconds, goodPlayer(soup, options));
}
