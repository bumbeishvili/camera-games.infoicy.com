// What a game gives to its hands, apart from any screen: reading what's chosen for each thing it can be told to
// do, telling which hand shapes are already taken on a hand, and falling back when what was saved isn't on
// offer any more. The picker that shows it is core/mapping-ui.js, and the hand shapes are in core/shapes.js.
//
// A game lists rows, each { id, name, options, fallback }, and for a game played with both hands, either hand
// (the hand it's always done with) or hands (a list of { id, name }, if a grown-up can say which hand does it).
// options are hand shapes by their ids, 'fingers' for a choice of fingers, and { id, name, icon } for anything
// that isn't a hand shape. What's chosen for a row is an option's id, or { fingers: [...] }, and for a row with
// hands, { hand, is } with one of those as is, unless it's something that isn't a hand shape, which is just its
// id.
import { FINGERS } from './shapes.js';

// An option as a game lists it, or as the picker keeps it: its id, and whether it's something a hand makes.
const idOf = (option) => (typeof option === 'string' ? option : option.id);
const isShape = (option) => typeof option === 'string' || option.shape === true;

/** What a value says is chosen: its option's id, its fingers if it's a choice of fingers, and its hand if it has one. */
export function readValue(value) {
  const hand = value && typeof value === 'object' && 'hand' in value ? value.hand : null;
  const is = hand === null ? value : value.is;
  const fingers = Array.isArray(is?.fingers) ? FINGERS.filter((finger) => is.fingers.includes(finger)) : null;
  return { hand, id: fingers ? 'fingers' : String(is ?? ''), fingers };
}

/**
 * Which hand a row is on, given what's chosen for it: the hand it always uses, the one chosen, or null for a
 * row that isn't about one hand or another, or that has been given something that isn't a hand shape.
 */
function handOf(row, value) {
  const { hand, id } = readValue(value);
  if (!row.options.some((option) => idOf(option) === id && isShape(option))) return null;
  return row.hands ? hand : row.hand ?? null;
}

/**
 * For each row, the hand shapes it can't be given just now, as { id: the name of the row that has it }: two
 * things on the same hand can't be given to the same shape, or one could never be done without the other.
 * rows are as a game lists them, and values what's chosen for each. on says which hand to look at for a row,
 * if not the one it's on now.
 */
export function taken(rows, values, on = {}) {
  const out = {};
  for (const row of rows) {
    out[row.id] = {};
    const hand = on[row.id] ?? handOf(row, values[row.id]) ?? (row.hands ? readValue(values[row.id]).hand : row.hand ?? null);
    if (hand === null) continue;
    for (const other of rows) {
      if (other === row || handOf(other, values[other.id]) !== hand) continue;
      const { id } = readValue(values[other.id]);
      if (id !== 'fingers') out[row.id][id] = other.name;
    }
  }
  return out;
}

/**
 * What a game's rows are given to, from what's saved for it: each row's saved value if the row still offers it,
 * and its fallback if not. mapping is as GameSession takes it, and open is what the open move's shape is.
 */
export function givenFor(mapping, saved = {}, open = 'open') {
  const out = {};
  const rows = mapping?.rows ?? [];
  for (const row of rows) {
    const value = saved?.[row.id];
    const { hand, id } = readValue(value);
    const offered = row.options.some((option) => idOf(option) === id);
    const special = row.options.some((option) => idOf(option) === id && !isShape(option));
    const handFits = special || !row.hands ? hand === null : row.hands.some((each) => each.id === hand);
    out[row.id] = value !== undefined && offered && handFits ? value : row.fallback;
  }
  // Two things saved to the same shape on the same hand, as can only come from an older version: the later
  // one goes back to what it is out of the box. The open move's own shape counts as the first of them.
  const first = { id: 'open', name: 'open', options: mapping?.open?.options ?? [], hand: mapping?.open?.hand };
  for (const row of rows) {
    const before = [first, ...rows.slice(0, rows.indexOf(row)), row];
    const busy = taken(before, { ...out, open })[row.id];
    if (busy[readValue(out[row.id]).id]) out[row.id] = row.fallback;
  }
  return out;
}
