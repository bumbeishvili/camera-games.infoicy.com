// Hand shapes, so a grown-up can choose what each of a game's two moves is made with: the open move, which is
// an open hand unless they choose otherwise, and the closed move, which is a closed hand. The others are made
// with some fingers straight and the rest curled, like pointing with the index finger, which a child who can't
// open the whole hand may well manage, and which is good practice for one finger at a time. They're chosen per
// game in the grown-ups' panel, and saved with the other settings.
//
// Each finger scores from 0 (curled) to 1 (straight) in hands.js. On real photos those scores are clear: pointing
// is the index at 1 and the rest at 0, a peace sign two at 1, a thumbs up the thumb at 0.68. So a finger counts as
// straight from STRAIGHT, and curled up to CURLED, with room for a hand that can't straighten all the way.

// The same five as FINGER_NAMES in hands.js, which can't be brought in here, as hands.js needs this file.
export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

export const STRAIGHT = 0.55;
export const CURLED = 0.35;
// How sure a shape has to be to be made, and how far it has to slip before it isn't, so it doesn't flicker.
export const SHAPE_MADE = 0.6;
export const SHAPE_LOST = 0.4;

// up is straight, down is curled, and a finger left out can be either. The thumb is left out of most, as thumbs
// sit every which way. The open hand goes by the hand's whole opening against its line, as always, and the
// closed hand is any hand that isn't making the open move, as always. Each prompt has a rendered voice file.
export const SHAPES = {
  open: { name: 'Open hand', move: 'open', fingers: null, prompt: null },
  closed: { name: 'Closed hand', move: 'closed', fingers: null, prompt: null },
  point: { name: 'Pointing', fingers: { index: 'up', middle: 'down', ring: 'down', pinky: 'down' }, prompt: 'Point with one finger!' },
  two: { name: 'Two fingers', fingers: { index: 'up', middle: 'up', ring: 'down', pinky: 'down' }, prompt: 'Show two fingers!' },
  three: { name: 'Three fingers', fingers: { index: 'up', middle: 'up', ring: 'up', pinky: 'down' }, prompt: 'Show three fingers!' },
  thumb: { name: 'Thumb up', fingers: { thumb: 'up', index: 'down', middle: 'down', ring: 'down', pinky: 'down' }, prompt: 'Thumbs up!' },
};
export const FINGERS_PROMPT = 'Show the fingers in the picture!';
// What a game says to a hand that's resting, when its open move is a shape.
export const SHAPE_RESTING = 'Resting is OK. Show me when you’re ready.';

// What the panel offers for each move, in order. fingers is the grown-up's own choice of fingers.
export const CHOICES = {
  open: ['open', 'point', 'two', 'three', 'thumb', 'fingers'],
  closed: ['closed', 'point', 'two', 'three', 'thumb', 'fingers'],
};
// Where the grown-up's own choice starts: the thumb and index finger straight, an L, which none of the others is.
export const FIRST_FINGERS = ['thumb', 'index'];

const named = (finger) => finger[0].toUpperCase() + finger.slice(1);

/** A shape of the grown-up's own: these fingers straight, and the rest curled. fingers is a list of FINGERS. */
export function fingersShape(fingers) {
  const chosen = FINGERS.filter((finger) => fingers.includes(finger));
  return {
    id: 'fingers',
    name: chosen.map(named).join(' + '),
    chosen,
    fingers: Object.fromEntries(FINGERS.map((finger) => [finger, chosen.includes(finger) ? 'up' : 'down'])),
    prompt: FINGERS_PROMPT,
  };
}

/** A saved choice for a move, as a shape: one of SHAPES by name, or { fingers: [...] }. Anything else is as always. */
export function shapeOf(choice, move) {
  const shape = typeof choice === 'string' ? SHAPES[choice] : null;
  if (shape && CHOICES[move].includes(choice)) return { id: choice, ...shape };
  const fingers = Array.isArray(choice?.fingers) ? FINGERS.filter((finger) => choice.fingers.includes(finger)) : [];
  if (fingers.length) return fingersShape(fingers);
  return { id: move, ...SHAPES[move] };
}

const sameFingers = (a, b) => FINGERS.every((finger) => (a.fingers[finger] ?? 'either') === (b.fingers[finger] ?? 'either'));

/**
 * The shapes for a game's two moves, from what's saved for it. moves is the game's names for them, and a game
 * whose closed hand isn't a move of its own, as in Balloon Pop, keeps the closed hand as it is. The two moves
 * can't be the same shape: then the closed one is the closed hand.
 */
export function shapesFor(saved = {}, moves = {}) {
  const open = shapeOf(saved?.open, 'open');
  let closed = moves.closed ? shapeOf(saved?.closed, 'closed') : shapeOf(null, 'closed');
  if (open.fingers && closed.fingers && sameFingers(open, closed)) closed = shapeOf(null, 'closed');
  return { open, closed };
}

export const DEFAULT_SHAPES = Object.freeze(shapesFor());

/** Whether either move has a shape chosen, rather than the open and closed hand. */
export const isShaped = (shapes) => Boolean(shapes.open.fingers || shapes.closed.fingers);

const ramp = (value, low, high) => Math.min(1, Math.max(0, (value - low) / (high - low)));

/**
 * How sure it is that these finger scores make this shape, from 0 to 1: the least sure of its fingers. Not for
 * the open hand or the closed hand, which go by the hand's whole opening, as always.
 */
export function shapeScore(fingers, shape) {
  let least = 1;
  for (const [finger, way] of Object.entries(shape.fingers ?? {})) {
    const straight = ramp(fingers[finger] ?? 0, CURLED, STRAIGHT);
    least = Math.min(least, way === 'up' ? straight : 1 - straight);
  }
  return least;
}

/** Which fingers a shape has straight, for drawing it. The open hand has them all, and the closed hand none. */
export function fingersUp(shape) {
  if (!shape.fingers) return shape.id === 'open' ? [...FINGERS] : [];
  return FINGERS.filter((finger) => shape.fingers[finger] === 'up');
}
