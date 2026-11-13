// What does what, in the grown-ups' panel: one row for each thing a game can be told to do with a hand, and under
// it a chip for everything it can be given to, each with a little picture of the hand making it. Every game uses
// this one picker, so they all look and work the same. A game with one move has one row, for its open move, and
// a game that gives several jobs to its hands, as Frost Arena does, has a row for each.
//
// What the hand shapes are, and how the ones for an open move are told apart, is in core/shapes.js.
import { FINGERS, FIRST_FINGERS, fingersShape, fingersUp, signOf } from './shapes.js';
import { readValue, taken } from './mapping.js';

// The hand from the hand demo in core/shell.js, with each finger straight or curled: the thumb is on the right.
const DRAWN = {
  pinky: ['M33 62V36', 'M33 62V55'],
  ring: ['M45 58V24', 'M45 58V50'],
  middle: ['M57 58V22', 'M57 58V49'],
  index: ['M68 62V32', 'M68 62V54'],
  thumb: ['M74 82L92 66', 'M74 82L81 75'],
};
// Where each finger is, across the hand, and where its tip is when it's bent half way to meet the thumb.
const ACROSS = { pinky: 33, ring: 45, middle: 57, index: 68 };
const HALF_WAY = 45;

/**
 * A small picture of a hand shape, as markup: the fingers that are straight, the ones that are curled, and for a
 * pinch the finger bent half way with the thumb's tip against it, marked with a dot.
 */
export function shapeIcon(shape) {
  const up = new Set(fingersUp(shape));
  const parts = [];
  for (const finger of FINGERS) {
    if (finger === shape.pinch) {
      const x = ACROSS[finger];
      // The first finger is beside the thumb. For the others the thumb comes across the palm, drawn in the
      // palm's own colour's opposite so it shows.
      parts.push(`<path d="M${x} ${finger === 'index' || finger === 'pinky' ? 62 : 58}V${HALF_WAY + 6}" />`);
      parts.push(finger === 'index' ? `<path d="M76 82L${x + 5} ${HALF_WAY + 8}" />` : `<path class="shape-icon-over" d="M72 80L${x + 5} ${HALF_WAY + 14}" />`);
      parts.push(`<circle class="shape-icon-dot" cx="${x + 3}" cy="${HALF_WAY}" r="7" />`);
    } else if (finger === 'thumb' && shape.pinch) {
      // Drawn with the finger it meets.
    } else if (finger === shape.hook) {
      // Curled over by itself, like a hook.
      parts.push(`<path d="M${ACROSS[finger]} 62V44h-10" />`);
    } else {
      parts.push(`<path d="${DRAWN[finger][up.has(finger) ? 0 : 1]}" />`);
    }
  }
  return `<svg class="shape-icon" viewBox="14 12 90 96" aria-hidden="true"><rect x="26" y="58" width="48" height="42" rx="16" />${parts.join('')}</svg>`;
}

// Pictures for things that aren't a hand shape: nothing at all, and a hand pushed right out.
const OTHER_ICONS = {
  none: '<svg class="shape-icon is-other" viewBox="0 0 90 96" aria-hidden="true"><circle cx="45" cy="50" r="27" /><path d="M26 69L64 31" /></svg>',
  push: '<svg class="shape-icon is-other" viewBox="0 0 90 96" aria-hidden="true"><circle cx="45" cy="56" r="27" /><path d="M45 66V30M33 42L45 30L57 42" /></svg>',
};

const named = (finger) => finger[0].toUpperCase() + finger.slice(1);

/**
 * What a row can be given to, from how the game listed it: a hand shape's id, 'fingers' for a grown-up's own
 * choice of fingers, or { id, name, icon } for something that isn't a hand shape. Returns { id, name, picture,
 * shape }, with shape true for anything a hand makes.
 */
function optionOf(option) {
  if (typeof option !== 'string') return { id: option.id, name: option.name, picture: OTHER_ICONS[option.icon] ?? option.icon ?? '', shape: false };
  if (option === 'fingers') return { id: 'fingers', name: 'Choose fingers', picture: shapeIcon(fingersShape(FIRST_FINGERS)), shape: true };
  const sign = signOf(option);
  if (!sign) throw new Error(`No hand shape is called ${option}`);
  return { id: option, name: sign.name, picture: shapeIcon(sign), shape: true };
}

export class MappingPicker {
  /**
   * rows is the list of things the game can be told to do with a hand, each { id, name, options }, and for a
   * game played with both hands, either hand (the hand it's always done with, which only matters for telling
   * what's taken) or hands (a list of { id, name }, if a grown-up can say which hand does it).
   *
   * options is what it can be given to: hand shapes by their ids (see SHAPES and SIGNS in core/shapes.js),
   * 'fingers' for a choice of fingers, and { id, name, icon } for anything that isn't a hand shape, where icon
   * is 'none', 'push' or a picture's own markup.
   *
   * onChange(id, value) hears each change. A value is the option's id, or { fingers: [...] } for a choice of
   * fingers, and for a row with hands, { hand, is } with one of those as is, unless it's something that isn't a
   * hand shape, which is just its id. legend, lead and rest are the words round the rows.
   */
  constructor(root, { legend = 'Hand shapes', lead = '', rest = '', rows, onChange }) {
    this.onChange = onChange;
    this.rows = rows.map((row) => ({ ...row, options: row.options.map(optionOf) }));
    this.values = {};
    this.parts = {};
    const block = document.createElement('fieldset');
    block.className = 'choice shapes';
    const title = document.createElement('legend');
    title.textContent = legend;
    block.append(title);
    if (lead) {
      const words = document.createElement('p');
      words.className = 'shapes-lead';
      words.textContent = lead;
      block.append(words);
    }
    for (const row of this.rows) block.append(this.build(row));
    if (rest) {
      const words = document.createElement('p');
      words.className = 'shapes-rest';
      words.textContent = rest;
      block.append(words);
    }
    root.append(block);
  }

  /** One row: its name, which hand if that can be chosen, and a chip for each thing it can be given to. */
  build(row) {
    const part = { inputs: {}, labels: {}, hands: {}, boxes: {}, hand: row.hands?.[0].id ?? null };
    this.parts[row.id] = part;
    const box = document.createElement('div');
    box.className = 'shape-move';
    box.dataset.row = row.id;
    const title = document.createElement('p');
    title.className = 'shape-move-name';
    title.id = `shape-${row.id}-name`;
    title.textContent = row.name;
    box.append(title);

    if (row.hands) {
      const hands = document.createElement('div');
      hands.className = 'shape-hands';
      hands.setAttribute('role', 'radiogroup');
      hands.setAttribute('aria-label', `${row.name}: which hand`);
      for (const { id, name } of row.hands) {
        const label = document.createElement('label');
        label.className = 'shape-hand';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `shape-${row.id}-hand`;
        input.value = id;
        label.append(input, name);
        hands.append(label);
        input.addEventListener('change', () => {
          if (input.checked) this.chooseHand(row, id);
        });
        part.hands[id] = input;
      }
      part.handsBox = hands;
      box.append(hands);
    }

    const options = document.createElement('div');
    options.className = 'shape-options';
    options.setAttribute('role', 'radiogroup');
    options.setAttribute('aria-labelledby', title.id);
    for (const option of row.options) {
      const label = document.createElement('label');
      label.className = 'shape-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `shape-${row.id}`;
      input.value = option.id;
      const picture = document.createElement('span');
      picture.className = 'shape-picture';
      picture.innerHTML = option.picture;
      const words = document.createElement('span');
      words.textContent = option.name;
      label.append(input, picture, words);
      options.append(label);
      input.addEventListener('change', () => {
        if (input.checked) this.choose(row, option.id);
      });
      part.inputs[option.id] = input;
      part.labels[option.id] = label;
      if (option.id === 'fingers') part.fingersPicture = picture;
    }
    box.append(options);

    // The fingers for a shape of their own: these straight, and the rest curled.
    if (part.inputs.fingers) {
      part.fingersBox = document.createElement('div');
      part.fingersBox.className = 'shape-fingers';
      part.fingersBox.hidden = true;
      const straight = document.createElement('span');
      straight.textContent = 'Straight:';
      part.fingersBox.append(straight);
      for (const finger of FINGERS) {
        const label = document.createElement('label');
        const tick = document.createElement('input');
        tick.type = 'checkbox';
        tick.value = finger;
        tick.checked = FIRST_FINGERS.includes(finger);
        label.append(tick, ` ${named(finger)}`);
        part.fingersBox.append(label);
        // At least one finger has to be straight, or it would be a fist, which is the closed hand.
        tick.addEventListener('change', () => {
          if (!this.chosenFingers(row.id).length) tick.checked = true;
          this.choose(row, 'fingers');
        });
        part.boxes[finger] = tick;
      }
      box.append(part.fingersBox);
    }
    return box;
  }

  chosenFingers(id) {
    return FINGERS.filter((finger) => this.parts[id].boxes[finger].checked);
  }

  /** A chip was chosen: the row is given to it, on the hand that's chosen for the row if it has a choice of hand. */
  choose(row, id) {
    const part = this.parts[row.id];
    const option = row.options.find((each) => each.id === id);
    const is = id === 'fingers' ? { fingers: this.chosenFingers(row.id) } : id;
    this.onChange(row.id, row.hands && option.shape ? { hand: part.hand, is } : is);
  }

  /**
   * The other hand was chosen for a row. What the row is given to goes with it, unless something on that hand
   * already has it: then it's given to the first thing there that's free.
   */
  chooseHand(row, hand) {
    const part = this.parts[row.id];
    part.hand = hand;
    const { id, fingers } = readValue(this.values[row.id]);
    const option = row.options.find((each) => each.id === id);
    // Something that isn't a hand shape isn't on either hand: the choice of hand waits for one that is.
    if (!option?.shape) return this.show();
    const busy = taken(this.rows, this.values, { [row.id]: hand })[row.id];
    const free = busy[id] ? row.options.find((each) => each.shape && !busy[each.id]) : option;
    if (!free) return this.show();
    this.onChange(row.id, { hand, is: free.id === 'fingers' ? { fingers: fingers ?? this.chosenFingers(row.id) } : free.id });
  }

  /** Shows what's chosen for every row, as { id: value }, and which chips can't be chosen just now. */
  set(values) {
    this.values = { ...values };
    this.show();
  }

  show() {
    const busy = taken(this.rows, this.values, Object.fromEntries(this.rows.filter((row) => row.hands).map((row) => [row.id, this.handFor(row)])));
    for (const row of this.rows) {
      const part = this.parts[row.id];
      const { id, fingers } = readValue(this.values[row.id]);
      if (part.inputs[id]) part.inputs[id].checked = true;
      if (row.hands) {
        const hand = this.handFor(row);
        part.hand = hand;
        if (part.hands[hand]) part.hands[hand].checked = true;
        // With something that isn't a hand shape chosen, which hand doesn't come into it.
        part.handsBox.toggleAttribute('data-idle', !row.options.some((option) => option.id === id && option.shape));
      }
      for (const option of row.options) {
        const by = option.shape && option.id !== id ? busy[row.id][option.id] : null;
        part.inputs[option.id].disabled = Boolean(by);
        part.labels[option.id].title = by ? `Already given to ${by} on this hand` : '';
      }
      if (part.fingersBox) {
        part.fingersBox.hidden = id !== 'fingers';
        if (fingers) for (const finger of FINGERS) part.boxes[finger].checked = fingers.includes(finger);
        part.fingersPicture.innerHTML = shapeIcon(fingersShape(this.chosenFingers(row.id)));
      }
    }
  }

  /** The hand a row with a choice of hand is on: the one in what's chosen for it, or the one last chosen. */
  handFor(row) {
    return readValue(this.values[row.id]).hand ?? this.parts[row.id].hand;
  }
}
