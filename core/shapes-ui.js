// The grown-ups' choice of hand shape for a game's active move, in the panel, and little pictures of the shapes.
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

/**
 * The panel's choice of hand shape for the game's active move, named as the game names it, like Drive. The
 * passive move is always the closed hand: any hand not making the active move's shape, as a resting hand does.
 */
export class ShapesPicker {
  /** moves is the game's names for its moves, and onShape(choice) hears each change. */
  constructor(root, { moves, onShape }) {
    this.onShape = onShape;
    const block = document.createElement('fieldset');
    block.className = 'choice shapes';
    const legend = document.createElement('legend');
    legend.textContent = 'Hand shapes';
    const lead = document.createElement('p');
    lead.className = 'shapes-lead';
    lead.textContent = 'Which hand shape makes the move in this game. Pointing or a few fingers can be easier than a whole open hand, and good practice too.';

    const row = document.createElement('div');
    row.className = 'shape-move';
    const title = document.createElement('p');
    title.className = 'shape-move-name';
    title.id = 'shape-open-name';
    title.textContent = moves.open;
    const options = document.createElement('div');
    options.className = 'shape-options';
    options.setAttribute('role', 'radiogroup');
    options.setAttribute('aria-labelledby', title.id);
    this.inputs = {};
    for (const id of CHOICES) {
      const shape = id === 'fingers' ? fingersShape(FIRST_FINGERS) : shapeOf(id);
      const label = document.createElement('label');
      label.className = 'shape-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'shape-open';
      input.value = id;
      const picture = document.createElement('span');
      picture.className = 'shape-picture';
      picture.innerHTML = shapeIcon(shape);
      const words = document.createElement('span');
      words.textContent = id === 'fingers' ? 'Choose fingers' : shape.name;
      label.append(input, picture, words);
      options.append(label);
      input.addEventListener('change', () => {
        if (input.checked) this.onShape(id === 'fingers' ? { fingers: this.chosenFingers() } : id);
      });
      this.inputs[id] = input;
      if (id === 'fingers') this.fingersPicture = picture;
    }

    // The fingers for a shape of their own: these straight, and the rest curled.
    this.fingersBox = document.createElement('div');
    this.fingersBox.className = 'shape-fingers';
    this.fingersBox.hidden = true;
    const straight = document.createElement('span');
    straight.textContent = 'Straight:';
    this.fingersBox.append(straight);
    this.boxes = {};
    for (const finger of FINGERS) {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = finger;
      box.checked = FIRST_FINGERS.includes(finger);
      label.append(box, ` ${named(finger)}`);
      this.fingersBox.append(label);
      // At least one finger has to be straight, or it would be a fist, which is the closed hand.
      box.addEventListener('change', () => {
        if (!this.chosenFingers().length) box.checked = true;
        this.onShape({ fingers: this.chosenFingers() });
      });
      this.boxes[finger] = box;
    }

    // The passive move, which is always the closed hand.
    const rest = document.createElement('p');
    rest.className = 'shapes-rest';
    rest.textContent = moves.closed ? `${moves.closed}: any other hand, as when it rests.` : 'Any other hand rests.';

    row.append(title, options, this.fingersBox);
    block.append(legend, lead, row, rest);
    root.append(block);
  }

  chosenFingers() {
    return FINGERS.filter((finger) => this.boxes[finger].checked);
  }

  /** Shows the shape chosen for the open move. */
  set(shapes) {
    const shape = shapes.open;
    this.inputs[shape.id].checked = true;
    this.fingersBox.hidden = shape.id !== 'fingers';
    if (shape.id === 'fingers') {
      for (const finger of FINGERS) this.boxes[finger].checked = shape.chosen.includes(finger);
    }
    this.fingersPicture.innerHTML = shapeIcon(fingersShape(this.chosenFingers()));
  }
}
