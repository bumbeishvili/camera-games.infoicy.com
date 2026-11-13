// Hand shapes, so a grown-up can choose what a game's active move is made with: the open move, which is an open
// hand unless they choose otherwise. The others are made with some fingers straight and the rest curled, like
// pointing with the index finger, which a child who can't open the whole hand may well manage, and which is good
// practice for one finger at a time. The passive move is always the closed hand, which is any hand not making the
// active move's shape, as a resting hand does: stopping, in a race. They're chosen per game in the grown-ups'
// panel, and saved with the other settings.
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
// closed hand is any hand that isn't making the open move. Each prompt has a rendered voice file. words is how
// a card says it in the middle of a line, and mark a little picture of it for a button.
export const SHAPES = {
  open: { name: 'Open hand', move: 'open', fingers: null, prompt: null, words: 'open your hand', mark: '🖐️' },
  closed: { name: 'Closed hand', move: 'closed', fingers: null, prompt: null, words: 'close your hand', mark: '✊' },
  point: { name: 'Pointing', fingers: { index: 'up', middle: 'down', ring: 'down', pinky: 'down' }, prompt: 'Point with one finger!', words: 'point with one finger', mark: '☝️' },
  two: { name: 'Two fingers', fingers: { index: 'up', middle: 'up', ring: 'down', pinky: 'down' }, prompt: 'Show two fingers!', words: 'show two fingers', mark: '✌️' },
  three: { name: 'Three fingers', fingers: { index: 'up', middle: 'up', ring: 'up', pinky: 'down' }, prompt: 'Show three fingers!', words: 'show three fingers', mark: '🤟' },
  thumb: { name: 'Thumb up', fingers: { thumb: 'up', index: 'down', middle: 'down', ring: 'down', pinky: 'down' }, prompt: 'Thumbs up!', words: 'thumb up', mark: '👍' },
};

// Other things a hand can be told to be doing, for a game that gives each of several jobs to something different,
// as Frost Arena does. They aren't for the open move, and nothing in this file tells them apart: a game that
// offers them reads them itself. pinch is the finger the thumb's tip touches, and hook a finger curled by
// itself, as round a trigger. They're here so that every game names and draws them the same way.
export const SIGNS = {
  'pinch-index': { name: 'Pinch first finger', words: 'pinch thumb and first finger', mark: '🤏', pinch: 'index' },
  'pinch-middle': { name: 'Pinch middle finger', words: 'pinch thumb and middle finger', mark: '🤏', pinch: 'middle' },
  'pinch-ring': { name: 'Pinch ring finger', words: 'pinch thumb and ring finger', mark: '🤏', pinch: 'ring' },
  'pinch-pinky': { name: 'Pinch little finger', words: 'pinch thumb and little finger', mark: '🤏', pinch: 'pinky' },
  trigger: { name: 'First finger curled', words: 'curl your first finger', mark: '☝️', hook: 'index' },
};

/** Anything a hand can be given a job with, by name: one of SHAPES or SIGNS, with its id, or null. */
export function signOf(id) {
  const sign = Object.hasOwn(SHAPES, id) ? SHAPES[id] : Object.hasOwn(SIGNS, id) ? SIGNS[id] : null;
  return sign ? { id, ...sign } : null;
}
export const FINGERS_PROMPT = 'Show the fingers in the picture!';
// What a game says to a hand that's resting, when its open move is a shape.
export const SHAPE_RESTING = 'Resting is OK. Show me when you’re ready.';

// What the panel offers for the open move, in order. fingers is the grown-up's own choice of fingers.
export const CHOICES = ['open', 'point', 'two', 'three', 'thumb', 'fingers'];
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

/**
 * A saved choice for the open move, as a shape: one of SHAPES by name, or { fingers: [...] }. Anything else is the
 * open hand, and so is anything a game doesn't offer, if it says what it offers.
 */
export function shapeOf(choice, offered = CHOICES) {
  const shape = typeof choice === 'string' ? SHAPES[choice] : null;
  if (shape && CHOICES.includes(choice) && offered.includes(choice)) return { id: choice, ...shape };
  const fingers = Array.isArray(choice?.fingers) ? FINGERS.filter((finger) => choice.fingers.includes(finger)) : [];
  if (fingers.length && offered.includes('fingers')) return fingersShape(fingers);
  return { id: 'open', ...SHAPES.open };
}

const CLOSED = Object.freeze({ id: 'closed', ...SHAPES.closed });

/**
 * The shapes for a game's two moves, from what's saved for it: its open move's, and the closed hand. offered is
 * what the game lets the open move be, if not everything.
 */
export function shapesFor(saved = {}, offered = CHOICES) {
  return { open: shapeOf(saved?.open, offered), closed: CLOSED };
}

/** A shape as a choice to save, or to show as chosen: its name, or its fingers if it's a grown-up's own. */
export const choiceOf = (shape) => (shape.id === 'fingers' ? { fingers: [...shape.chosen] } : shape.id);

export const DEFAULT_SHAPES = Object.freeze(shapesFor());

/** Whether the open move has a shape chosen, rather than the open hand. */
export const isShaped = (shapes) => Boolean(shapes.open.fingers);

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

/**
 * Which fingers a shape has straight, for drawing it. The open hand has them all, and the closed hand none. A
 * pinch has all but the two that touch, and a curled finger all but that one and the thumb.
 */
export function fingersUp(shape) {
  if (shape.pinch) return FINGERS.filter((finger) => finger !== 'thumb' && finger !== shape.pinch);
  if (shape.hook) return FINGERS.filter((finger) => finger !== 'thumb' && finger !== shape.hook);
  if (!shape.fingers) return shape.id === 'open' ? [...FINGERS] : [];
  return FINGERS.filter((finger) => shape.fingers[finger] === 'up');
}
