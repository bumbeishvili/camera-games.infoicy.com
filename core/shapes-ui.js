// The grown-ups' choice of hand shape for each of a game's moves, in the panel, and little pictures of the shapes.
// What the shapes are, and how they're told apart, is in core/shapes.js.
import { CHOICES, FINGERS, FIRST_FINGERS, fingersShape, fingersUp, shapeOf } from './shapes.js';

// The hand from the hand demo in core/shell.js, with each finger straight or curled: the thumb is on the right.
const DRAWN = {
  pinky: ['M33 62V36', 'M33 62V55'],
  ring: ['M45 58V24', 'M45 58V50'],
  middle: ['M57 58V22', 'M57 58V49'],
  index: ['M68 62V32', 'M68 62V54'],
  thumb: ['M74 82L92 66', 'M74 82L81 75'],
};

/** A small picture of a shape, as markup. */
export function shapeIcon(shape) {
  const up = new Set(fingersUp(shape));
  const fingers = FINGERS.map((finger) => `<path d="${DRAWN[finger][up.has(finger) ? 0 : 1]}" />`).join('');
  return `<svg class="shape-icon" viewBox="14 12 90 96" aria-hidden="true"><rect x="26" y="58" width="48" height="42" rx="16" />${fingers}</svg>`;
}

const named = (finger) => finger[0].toUpperCase() + finger.slice(1);

/** One move's choices: a picture and a name for each shape, and the fingers for a shape of the grown-up's own. */
class MoveChoice {
  constructor(parent, move, name, onShape) {
    this.move = move;
    this.onShape = onShape;
    const row = document.createElement('div');
    row.className = 'shape-move';
    row.dataset.move = move;
    const title = document.createElement('p');
    title.className = 'shape-move-name';
    title.id = `shape-${move}-name`;
    title.textContent = name;

    const options = document.createElement('div');
    options.className = 'shape-options';
    options.setAttribute('role', 'radiogroup');
    options.setAttribute('aria-labelledby', title.id);
    this.inputs = {};
    this.pictures = {};
    for (const id of CHOICES[move]) {
      const shape = id === 'fingers' ? fingersShape(FIRST_FINGERS) : shapeOf(id, move);
      const label = document.createElement('label');
      label.className = 'shape-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `shape-${move}`;
      input.value = id;
      const picture = document.createElement('span');
      picture.className = 'shape-picture';
      picture.innerHTML = shapeIcon(shape);
      const words = document.createElement('span');
      words.textContent = id === 'fingers' ? 'Choose fingers' : shape.name;
      label.append(input, picture, words);
      options.append(label);
      input.addEventListener('change', () => {
        if (input.checked) this.onShape(move, id === 'fingers' ? { fingers: this.chosenFingers() } : id);
      });
      this.inputs[id] = input;
      this.pictures[id] = picture;
    }

    // The fingers for a shape of their own: these straight, and the rest curled.
    this.fingersBox = document.createElement('div');
    this.fingersBox.className = 'shape-fingers';
    this.fingersBox.hidden = true;
    const lead = document.createElement('span');
    lead.textContent = 'Straight:';
    this.fingersBox.append(lead);
    this.boxes = {};
    for (const finger of FINGERS) {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = finger;
      box.checked = FIRST_FINGERS.includes(finger);
      label.append(box, ` ${named(finger)}`);
      this.fingersBox.append(label);
      // At least one finger has to be straight, or it would be a fist, which the closed hand already is.
      box.addEventListener('change', () => {
        if (!this.chosenFingers().length) box.checked = true;
        this.onShape(move, { fingers: this.chosenFingers() });
      });
      this.boxes[finger] = box;
    }

    row.append(title, options, this.fingersBox);
    parent.append(row);
  }

  chosenFingers() {
    return FINGERS.filter((finger) => this.boxes[finger].checked);
  }

  /** Shows the shape chosen, and keeps the one the other move has from being chosen here too. */
  set(shape, other) {
    this.inputs[shape.id].checked = true;
    this.fingersBox.hidden = shape.id !== 'fingers';
    if (shape.id === 'fingers') {
      for (const finger of FINGERS) this.boxes[finger].checked = shape.chosen.includes(finger);
    }
    this.pictures.fingers.innerHTML = shapeIcon(fingersShape(this.chosenFingers()));
    for (const [id, input] of Object.entries(this.inputs)) input.disabled = id !== 'fingers' && id === other.id;
  }
}

/** The panel's choice of hand shapes, for the moves of the game being played. */
export class ShapesPicker {
  /** moves is the game's names for its moves, and onShape(move, choice) hears each change. */
  constructor(root, { moves, onShape }) {
    this.moves = moves;
    const block = document.createElement('fieldset');
    block.className = 'choice shapes';
    const legend = document.createElement('legend');
    legend.textContent = 'Hand shapes';
    const lead = document.createElement('p');
    lead.className = 'shapes-lead';
    lead.textContent = 'Which hand shape makes each move in this game. Pointing or a few fingers can be easier than a whole open hand, and good practice too.';
    block.append(legend, lead);
    this.rows = {};
    for (const move of ['open', 'closed']) {
      if (moves[move]) this.rows[move] = new MoveChoice(block, move, moves[move], onShape);
    }
    this.note = document.createElement('p');
    this.note.className = 'shapes-note';
    block.append(this.note);
    root.append(block);
  }

  set(shapes) {
    this.rows.open.set(shapes.open, shapes.closed);
    this.rows.closed?.set(shapes.closed, shapes.open);
    const { closed: otherMove } = this.moves;
    const notes = [];
    if (shapes.closed.fingers) {
      notes.push('A hand making neither shape keeps on with the move it made last, so it can rest in between.');
    } else if (shapes.open.fingers) {
      notes.push(otherMove ? `Any other hand: ${otherMove.toLowerCase()}.` : 'Any other hand rests.');
    }
    if (shapes.open.fingers) notes.push('“How open counts as open” is only for the open hand, so it’s put away for now.');
    this.note.textContent = notes.join(' ');
    this.note.hidden = notes.length === 0;
  }
}
