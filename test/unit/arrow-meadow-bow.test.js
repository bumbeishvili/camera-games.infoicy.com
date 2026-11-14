// Arrow Meadow's bow: the two hands, one holding the bow and one the string. These run the real hand monitor on what
// the real model made of photos of hands (test/fixtures/photo-hands.json), moved about as a child would move them,
// at the speed a camera sends pictures and the speed a screen draws them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HandMonitor } from '../../core/hands.js';
import { shapesFor } from '../../core/shapes.js';
import { Bow, DRAW_FROM, REACHES, REACH_NAMES, TILT } from '../../games/arrow-meadow/bow.js';
import { ANGLES, MIN_DRAW } from '../../games/arrow-meadow/meadow.js';
import { FIST, FRAME_ASPECT, OPEN, handAt } from './photo-hands.js';

const CAMERA_MS = 1000 / 30;
const SCREEN_MS = 1000 / 60;
const PALM = 0.14; // How long the palm is in the picture, in frame heights: a child about arm's length from a laptop.
const degrees = (radians) => (radians * 180) / Math.PI;

function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** A hand part of the way from one photo's to another's: fingers on their way, or a hand that's only relaxed. */
function between(from, to, share) {
  const mix = (a, b) => ({ x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share, z: a.z + (b.z - a.z) * share });
  return { ...from, image: from.image.map((point, index) => mix(point, to.image[index])), world: from.world.map((point, index) => mix(point, to.world[index])) };
}

/**
 * A child in front of a camera, holding a bow. The string hand is the hand in play, and the bow hand the other.
 * Each is { photo, x, y }: which photo it looks like, and where it is, in palm lengths across and down the picture
 * from the middle, or null for a hand that's out of it. toward and by have it that much of the way to another photo.
 */
function archer({ side = 'right', palm = PALM, reach = 'small', shake = 0, seed = 3, shapes = null } = {}) {
  const monitor = new HandMonitor({}, side);
  if (shapes) monitor.setShapes(shapesFor(shapes));
  const bow = new Bow({ reach });
  const random = seeded(seed);
  const other = side === 'right' ? 'left' : 'right';
  const rig = { monitor, bow, now: 1000, sinceCamera: Infinity, states: [], state: bow.state, shots: [], slacks: 0 };
  const raw = (which, hand) => {
    if (!hand) return null;
    const wobble = () => (random() - 0.5) * 2 * shake * palm;
    const at = [0.5 + ((hand.x ?? 0) * palm + wobble()) / FRAME_ASPECT, 0.5 + (hand.y ?? 0) * palm + wobble()];
    const options = { palm, label: which === 'left' ? 'Left' : 'Right' };
    let made = handAt(hand.photo ?? OPEN, ...at, options);
    if (hand.toward && hand.by) made = between(made, handAt(hand.toward, ...at, options), hand.by);
    return made;
  };
  /** Time passes, with the hands as they are, or as a function of the seconds gone by says they are. */
  rig.run = (seconds, hands) => {
    const start = rig.now;
    const first = rig.states.length;
    while (rig.now - start < seconds * 1000 - 0.001) {
      rig.now += SCREEN_MS;
      rig.sinceCamera += SCREEN_MS;
      const shown = typeof hands === 'function' ? hands((rig.now - start) / 1000) : hands;
      if (rig.sinceCamera >= CAMERA_MS) {
        rig.sinceCamera = 0;
        monitor.update([raw(side, shown.string), raw(other, shown.bow)].filter(Boolean), rig.now, FRAME_ASPECT);
      }
      rig.state = bow.read(monitor.snapshot, FRAME_ASPECT, rig.now);
      rig.states.push({ ...rig.state, at: rig.now });
      if (rig.state.loosed) rig.shots.push({ ...rig.state.loosed, at: rig.now });
      if (rig.state.slack) rig.slacks += 1;
    }
    return rig.states.slice(first);
  };
  return rig;
}

// The string hand is on its own side of the picture, the right for the right hand, and the bow hand on the other:
// so far apart across, in palm lengths, with the bow hand so much higher.
const held = (apart, lift = 0, { string = FIST, bow = OPEN, side = 'right' } = {}) => {
  const sign = side === 'right' ? 1 : -1;
  return { string: { photo: string, x: (sign * apart) / 2, y: lift / 2 }, bow: { photo: bow, x: (-sign * apart) / 2, y: -lift / 2 } };
};
const letGo = (apart, lift = 0, options = {}) => held(apart, lift, { ...options, string: OPEN });

/* ---------- holding the string, and letting go ---------- */

test('a string hand that isn\'t open takes the string, and opening it lets one arrow go', () => {
  const rig = archer();
  // A hand that has just come into the picture takes a moment to be believed.
  const took = rig.run(0.8, held(3.4));
  const first = took.find((state) => state.nocked);
  assert.ok(first && first.at - took[0].at < 600, 'the string is held well within a second of the hands being seen');
  assert.equal(rig.state.nocked, true);
  assert.deepEqual([rig.state.bowSeen, rig.state.stringSeen, rig.state.both], [true, true, true]);
  // Held for as long as anyone likes, nothing flies.
  rig.run(8, held(3.4));
  assert.equal(rig.shots.length, 0);
  assert.equal(rig.state.nocked, true);
  // The hand opens: one arrow, within about a third of a second, and the string is no longer held.
  const opened = rig.run(1, letGo(3.4));
  assert.equal(rig.shots.length, 1);
  assert.ok(rig.shots[0].at - opened[0].at < 400, `let go after ${Math.round(rig.shots[0].at - opened[0].at)} ms`);
  assert.equal(rig.state.nocked, false);
  // Staying open sends no more.
  rig.run(3, letGo(3.4));
  assert.equal(rig.shots.length, 1);
});

test('each time the hand closes and opens is one arrow, and the next is ready at once', () => {
  const rig = archer();
  rig.run(1, letGo(3.4));
  for (let n = 0; n < 5; n += 1) {
    const closing = rig.run(0.5, held(3.4));
    assert.equal(rig.state.nocked, true, `arrow ${n + 1} is on the string`);
    // A hand already in the picture has the next arrow a third of a second after it closes.
    const took = closing.find((state) => state.nocked);
    assert.ok(took.at - closing[0].at < 350, `arrow ${n + 1} was ready after ${Math.round(took.at - closing[0].at)} ms`);
    rig.run(0.5, letGo(3.4));
  }
  assert.equal(rig.shots.length, 5);
  assert.equal(rig.slacks, 0);
});

test('a hand that\'s only relaxed holds the string as well as a fist does: a tight fist is never needed', () => {
  // Half way from open to a fist: fingers curled in a little, as a hand at rest is.
  const relaxed = { ...held(3.4), string: { photo: OPEN, toward: FIST, by: 0.5, x: 1.7, y: 0 } };
  const rig = archer();
  rig.run(0.8, relaxed);
  assert.equal(rig.monitor.snapshot.right.status, 'closed', 'the monitor doesn\'t count it as open');
  assert.equal(rig.state.nocked, true);
  rig.run(0.6, letGo(3.4));
  assert.equal(rig.shots.length, 1);
});

test('a fist never lets an arrow go, however it moves, and nor does a hand that was open all along', () => {
  const rig = archer();
  rig.run(1, held(3.4));
  rig.run(1, held(4.5, 1.5));
  rig.run(1, held(2.2, -0.8));
  rig.run(1, held(3.4));
  assert.equal(rig.shots.length, 0);
  // Open from the start: it never took the string, so there's nothing to let go of. A hand that has only just come
  // into the picture reads as not open for a moment, and that mustn't count as closing and opening.
  const open = archer();
  open.run(2, letGo(3.4));
  open.run(1, letGo(4.5, 1));
  assert.equal(open.shots.length, 0);
  assert.equal(open.state.nocked, false);
  assert.ok(open.states.every((state) => !state.nocked), 'it never had the string, even for a moment');
  // Nor does an open hand that goes out of the picture and comes back, again and again.
  for (let n = 0; n < 4; n += 1) {
    open.run(0.7, { string: null, bow: letGo(3.4).bow });
    open.run(0.9, letGo(3.4));
  }
  assert.equal(open.shots.length, 0);
  assert.ok(open.states.every((state) => !state.nocked));
});

/* ---------- aiming, and drawing ---------- */

test('the bow tilts by how much higher the bow hand is than the string hand, wherever they are in the picture', () => {
  const rig = archer();
  rig.run(0.8, held(3.4, 0));
  assert.ok(Math.abs(degrees(rig.state.angle)) < 1.5, `level hands: ${degrees(rig.state.angle)}`);
  for (const lift of [0.5, 1, 2]) {
    rig.run(0.8, held(3.4, lift));
    assert.ok(Math.abs(degrees(rig.state.angle) - lift * degrees(TILT)) < 2.5, `${lift} palms up: ${degrees(rig.state.angle)}`);
  }
  // The same lift with both hands lower in the picture, and further to one side, is the same tilt.
  const moved = held(3.4, 1);
  for (const hand of [moved.string, moved.bow]) Object.assign(hand, { x: hand.x - 0.8, y: hand.y + 1.2 });
  rig.run(0.8, moved);
  assert.ok(Math.abs(degrees(rig.state.angle) - degrees(TILT)) < 2.5, `moved: ${degrees(rig.state.angle)}`);
  // Below the string hand, the bow points down a little, and it never tilts further than it can.
  rig.run(0.8, held(3.4, -0.3));
  assert.ok(rig.state.angle < 0 && rig.state.angle >= ANGLES.low);
  rig.run(0.8, held(2.4, 3.6));
  assert.equal(rig.state.angle, ANGLES.high);
  rig.run(0.8, held(3.4, -2));
  assert.equal(rig.state.angle, ANGLES.low);
});

test('the further apart the hands, the further the bow is drawn, up to what a grown-up chose for a full draw', () => {
  assert.deepEqual(REACH_NAMES, ['small', 'medium', 'large']);
  assert.ok(REACHES.small < REACHES.medium && REACHES.medium < REACHES.large);
  for (const reach of REACH_NAMES) {
    const rig = archer({ reach, palm: 0.11 });
    const full = REACHES[reach];
    rig.run(0.8, held(DRAW_FROM));
    assert.ok(rig.state.draw < 0.08, `${reach}: not drawn with the hands close: ${rig.state.draw}`);
    rig.run(0.8, held((DRAW_FROM + full) / 2));
    assert.ok(Math.abs(rig.state.draw - 0.5) < 0.08, `${reach}: half way: ${rig.state.draw}`);
    rig.run(0.8, held(full + 0.1));
    assert.ok(rig.state.draw > 0.97, `${reach}: full: ${rig.state.draw}`);
    rig.run(0.8, held(full + 1.5));
    assert.equal(rig.state.draw, 1, 'and no further than full');
    // The arrow leaves with the draw the bow had.
    rig.run(0.6, letGo(full + 1.5));
    assert.equal(rig.shots.at(-1).draw, 1);
  }
  // The smallest asks for no more than hands held as far apart as a child's shoulders: about four of their palms.
  assert.ok(REACHES.small <= 3.5);
});

test('letting go of a bow that isn\'t drawn far enough is no shot, and costs nothing', () => {
  const rig = archer({ reach: 'large' });
  rig.run(0.8, held(2.2));
  assert.equal(rig.state.nocked, true);
  assert.ok(rig.state.draw < MIN_DRAW);
  rig.run(0.6, letGo(2.2));
  assert.equal(rig.shots.length, 0);
  assert.equal(rig.slacks, 1);
  // Drawn further, the same hand shoots.
  rig.run(0.8, held(5));
  rig.run(0.6, letGo(5));
  assert.equal(rig.shots.length, 1);
  assert.ok(rig.shots[0].draw >= MIN_DRAW);
});

test('the arrow goes where the bow was pointing before the hand opened, not where an opening hand jerks to', () => {
  const rig = archer();
  rig.run(1, held(3.4, 1));
  const aimed = rig.state.angle;
  // As it opens, the string hand jumps up by most of a palm, which would tip the bow down by 15 degrees and more.
  const jerked = letGo(3.4, 1);
  jerked.string.y -= 0.7;
  rig.run(0.8, jerked);
  assert.equal(rig.shots.length, 1);
  assert.ok(Math.abs(degrees(rig.shots[0].angle - aimed)) < 1.5, `aimed ${degrees(aimed)}, flew ${degrees(rig.shots[0].angle)}`);
  assert.ok(degrees(aimed - rig.state.angle) > 8, 'the bow itself has followed the hand since');
});

test('trembling hands hold the bow nearly still', () => {
  const rig = archer({ shake: 0.03 });
  rig.run(1, held(3.4, 1));
  const states = rig.run(4, held(3.4, 1));
  const angles = states.map((state) => degrees(state.angle));
  const draws = states.map((state) => state.draw);
  assert.ok(Math.max(...angles) - Math.min(...angles) < 2, `the tilt wandered ${Math.max(...angles) - Math.min(...angles)} degrees`);
  assert.ok(Math.max(...draws) - Math.min(...draws) < 0.08);
  assert.equal(rig.shots.length, 0);
  assert.ok(states.every((state) => state.nocked));
});

/* ---------- hands that can't be seen, or trusted ---------- */

test('without the bow hand the string hand does nothing, and with the two together nothing happens either', () => {
  const rig = archer();
  const alone = rig.run(3, { string: held(3.4).string, bow: null });
  assert.deepEqual([rig.state.nocked, rig.state.bowSeen, rig.state.stringSeen], [false, false, true]);
  assert.ok(alone.every((state) => !state.nocked), 'it never has the string, even for a moment');
  rig.run(1, { string: letGo(3.4).string, bow: null });
  assert.equal(rig.shots.length, 0);
  // The bow hand alone.
  rig.run(1, { string: null, bow: held(3.4).bow });
  assert.deepEqual([rig.state.nocked, rig.state.bowSeen, rig.state.stringSeen], [false, true, false]);
  // Both, so close that one could be holding the other.
  rig.run(1, held(1));
  assert.equal(rig.monitor.snapshot.overlap, true);
  assert.deepEqual([rig.state.nocked, rig.state.both], [false, false]);
  rig.run(1, letGo(1));
  assert.equal(rig.shots.length, 0);
});

test('a look the tracker drops keeps the string held, and a hand gone for longer lets it down with no shot', () => {
  const rig = archer();
  rig.run(1, held(3.4, 1));
  const { angle, draw } = rig.state;
  // The bow hand missing for a fifth of a second: the bow stays as it was.
  rig.run(0.2, { string: held(3.4, 1).string, bow: null });
  assert.equal(rig.state.nocked, true);
  assert.deepEqual([rig.state.angle, rig.state.draw], [angle, draw]);
  rig.run(0.5, held(3.4, 1));
  // The string hand lost as it opens, and seen open when it's back a moment later: that's letting go.
  rig.run(0.15, { string: null, bow: held(3.4, 1).bow });
  rig.run(0.6, letGo(3.4, 1));
  assert.equal(rig.shots.length, 1);
  // Held again, and then gone for a second: the string is let down, the bow isn't drawn, and nothing flies.
  rig.run(1, held(3.4, 1));
  rig.run(1, { string: null, bow: held(3.4, 1).bow });
  assert.deepEqual([rig.state.nocked, rig.state.draw], [false, 0]);
  rig.run(1, letGo(3.4, 1));
  assert.equal(rig.shots.length, 1);
});

test('a string hand cut off by the edge of the picture doesn\'t hold the string', () => {
  const rig = archer({ palm: 0.2 });
  // Far out to its own side, with its fingers past the edge.
  rig.run(1, { string: { photo: FIST, x: 4.2, y: 0 }, bow: { photo: OPEN, x: -1.5, y: 0 } });
  assert.equal(rig.monitor.snapshot.right.reason, 'edge');
  assert.deepEqual([rig.state.nocked, rig.state.stringSeen], [false, false]);
});

/* ---------- which hand, and what counts as open ---------- */

test('with the left hand in play, the left is the string hand and the right holds the bow', () => {
  const rig = archer({ side: 'left' });
  rig.run(0.8, held(3.4, 1, { side: 'left' }));
  assert.equal(rig.state.nocked, true);
  assert.ok(Math.abs(degrees(rig.state.angle) - degrees(TILT)) < 2.5);
  // The right hand opening and closing does nothing: it's the bow hand.
  rig.run(0.6, held(3.4, 1, { side: 'left', bow: FIST }));
  rig.run(0.6, held(3.4, 1, { side: 'left', bow: OPEN }));
  assert.equal(rig.shots.length, 0);
  rig.run(0.6, letGo(3.4, 1, { side: 'left' }));
  assert.equal(rig.shots.length, 1);
});

test('with another hand shape chosen for letting go, that shape lets go, and an open hand holds on', () => {
  const rig = archer({ shapes: { open: 'point' } });
  rig.run(0.8, held(3.4));
  assert.equal(rig.state.nocked, true);
  // An open hand isn't the shape, so it still holds the string.
  rig.run(0.8, letGo(3.4));
  assert.equal(rig.shots.length, 0);
  assert.equal(rig.state.nocked, true);
  rig.run(0.8, held(3.4, 0, { string: 'pointing_up' }));
  assert.equal(rig.shots.length, 1);
});
