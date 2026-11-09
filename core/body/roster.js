// The ten fighters. Each one is an original character: a colour scheme, a shape, and a
// function that dresses the shared body from characters.js with what makes it itself.
//
// signature names the fighter's own finishing move, and burst what it throws. voice is the
// Kokoro voice for its English lines, and pitch how far its Georgian lines are shifted so
// the fighters don't all sound alike.

const shape = (changes = {}) => ({
  width: 1,
  height: 1,
  depth: 1,
  headWidth: 1,
  headHeight: 1,
  headDepth: 1,
  arms: 1,
  legs: 1,
  feet: 1,
  hands: 1,
  digits: 4,
  neck: 0, // How much higher than usual the head sits.
  ...changes,
});

const face = (changes = {}) => ({
  eyeX: 0.2,
  eyeY: 0.05,
  eyeZ: 0.37,
  eyeSize: 0.11,
  mouthY: -0.17,
  mouthZ: 0.44,
  ...changes,
});

/** A flat patch on the surface of an egg shape, around it by turn and up it by rise, in radians. */
const patchOn = (centre, [rx, ry, rz], turn, rise) => ({
  at: [
    centre[0] + rx * Math.cos(rise) * Math.sin(turn),
    centre[1] + ry * Math.sin(rise),
    centre[2] + rz * Math.cos(rise) * Math.cos(turn),
  ],
  turn: [-rise, turn, 0],
});

export const ROSTER = [
  {
    id: 'giraffe',
    name: 'Giraffe',
    nameKa: 'ჟირაფი',
    species: 'Giraffe',
    speciesKa: 'ჟირაფი',
    title: 'The Tallest Striker',
    signature: 'Neck Swing',
    signatureKa: 'კისრის მოქნევა',
    burst: 'leaf',
    burstColours: ['#7ac74f', '#3f9d3f', '#ffd23f'],
    voice: 'am_michael',
    pitch: 0,
    shout: 'Look up! Here comes the giraffe!',
    shoutKa: 'ზემოთ აიხედე! ჟირაფი მოდის!',
    colours: {
      body: '#f5c451',
      belly: '#fff0c9',
      pants: '#6a4bd8',
      leg: '#f5c451',
      foot: '#5a3a1c',
      hand: '#f5c451',
      ink: '#4a2c10',
    },
    build: shape({ width: 0.88, depth: 0.9, neck: 0.6, headWidth: 0.8, headHeight: 0.82, headDepth: 0.84, arms: 0.86, legs: 0.86, feet: 0.92, digits: 3 }),
    face: face({ eyeX: 0.195, eyeY: 0.1, eyeZ: 0.305, eyeSize: 0.098, mouthY: -0.235, mouthZ: 0.46, mouthSize: 0.82, pupil: '#2c1a0f', brow: '#6b4016' }),
    dress({ add, side, ball, taper, curl, colours: c }) {
      const spot = '#b4682c';
      // The long neck, with a mane down the back of it.
      add('torso', taper(0.2, 0.135, 0.72), c.body, [0, 0.42, 0]);
      add('torso', curl([[0, 0.62, -0.2], [0, 0.84, -0.17], [0, 1.04, -0.15], [0, 1.2, -0.17]], 0.055, 0.03), '#8a4f1d');

      // Spots on the neck.
      for (const [turn, y, size] of [[0.5, 0.74, 1], [-0.9, 0.82, 0.9], [1.6, 0.86, 1], [-1.9, 0.72, 1], [0.1, 0.97, 0.8], [-0.5, 1.06, 0.75], [1.1, 1.08, 0.75], [2.7, 0.92, 0.85], [-2.7, 1.04, 0.8]]) {
        const radius = 0.2 + ((0.135 - 0.2) * (y - 0.42)) / 0.72;
        const { at, turn: facing } = patchOn([0, y, 0], [radius, 0, radius], turn, 0);
        add('torso', ball(0.052 * size, 0.062 * size, 0.014), spot, at, undefined, facing);
      }
      // Spots on the body, around the pale belly.
      const body = [0.326, 0.47, 0.279];
      for (const [turn, rise, size] of [[1.15, 0.5, 1], [-1.2, 0.35, 1], [1.5, -0.1, 0.9], [-1.55, -0.2, 1], [2.3, 0.45, 1.1], [-2.35, 0.55, 1], [3.14, 0.1, 1.15], [2.45, -0.3, 0.9], [-2.6, -0.4, 1]]) {
        const { at, turn: facing } = patchOn([0, 0.27, 0], body, turn, rise);
        add('torso', ball(0.06 * size, 0.07 * size, 0.016), spot, at, undefined, facing);
      }
      // A long pale muzzle with nostrils.
      add('head', ball(0.19, 0.16, 0.2), '#fff0c9', [0, -0.135, 0.27]);
      side('head', ball(0.022, 0.016, 0.012), c.ink, [0.07, -0.075, 0.455]);
      // Spots on the head.
      for (const [x, y, z, size] of [[0.27, 0.2, 0.17, 0.8], [-0.27, 0.2, 0.17, 0.8], [0.06, 0.32, 0.17, 0.75], [-0.13, 0.31, 0.1, 0.6], [0.2, -0.1, 0.24, 0.6], [-0.2, -0.1, 0.24, 0.6]]) {
        add('head', ball(0.05 * size, 0.055 * size, 0.012), spot, [x, y, z], undefined, [-Math.atan2(y, z), Math.atan2(x, z), 0]);
      }
      // Two little horns with soft dark tips, and ears out to the sides.
      for (const x of [0.11, -0.11]) {
        add('head', taper(0.04, 0.03, 0.21), c.body, [x, 0.31, -0.03], undefined, [-0.12, 0, -x * 1.3]);
        add('head', ball(0.056), '#5a3a1c', [x * 1.28, 0.55, -0.06]);
      }
      side('head', ball(0.12, 0.052, 0.058), c.body, [0.36, 0.17, -0.05], undefined, [0, 0, 0.45]);
      side('head', ball(0.08, 0.03, 0.032), '#ffc9a8', [0.37, 0.175, 0.002], undefined, [0, 0, 0.45]);
      // A purple bow tie, and shorts to match.
      add('torso', ball(0.045), '#8f6cf0', [0, 0.53, 0.205]);
      side('torso', ball(0.1, 0.066, 0.03), '#6a4bd8', [0.1, 0.53, 0.2], undefined, [0, 0, 0.14]);
      for (const leg of ['thighL', 'thighR']) {
        add(leg, ball(0.118, 0.17, 0.122), c.pants, [0, -0.08, 0]);
      }
      // A thin tail with a tuft.
      add('hips', curl([[0, 0.1, -0.24], [0, 0.0, -0.42], [0, -0.26, -0.5]], 0.028, 0.02), c.body);
      add('hips', ball(0.06, 0.1, 0.06), '#5a3a1c', [0, -0.32, -0.5]);
    },
  },
  {
    id: 'truffle',
    name: 'Truffle',
    nameKa: 'ტრაფლი',
    species: 'Pig',
    speciesKa: 'გოჭი',
    title: 'The Bouncing Champion',
    signature: 'Belly Bounce',
    signatureKa: 'მუცლის ნახტომი',
    burst: 'bubble',
    burstColours: ['#ffd23f', '#ffa8c0', '#7cc4ff'],
    voice: 'am_puck',
    pitch: 2,
    shout: 'Oink oink! Here I come!',
    shoutKa: 'ღრუტ-ღრუტ! მოვდივარ!',
    colours: {
      body: '#ffa6bf',
      chest: '#2f6fed',
      pants: '#2f6fed',
      leg: '#ffa6bf',
      foot: '#c9486f',
      hand: '#ffa6bf',
      ink: '#4a1f3d',
    },
    build: shape({ width: 1.2, depth: 1.15, height: 0.96, legs: 1.15, headWidth: 1.06 }),
    face: face({ eyeX: 0.21, eyeY: 0.1, eyeZ: 0.36, mouthY: -0.26, mouthZ: 0.4 }),
    dress({ add, side, ball, limb, curl, star, colours: c }) {
      // A big round snout, facing the front.
      add('head', ball(0.2, 0.15, 0.1), '#ff8bab', [0, -0.07, 0.45]);
      side('head', ball(0.036, 0.05, 0.02), '#a33a5f', [0.075, -0.07, 0.54]);
      // Small folded-over ears.
      side('head', ball(0.13, 0.15, 0.05), '#ff8bab', [0.36, 0.38, 0.03], undefined, [0.5, 0, -0.5]);
      // The wrestler's outfit: a singlet with straps and a gold belt with a star.
      add('torso', ball(0.385, 0.25, 0.315), c.body, [0, 0.56, 0]);
      for (const x of [0.2, -0.2]) {
        add('torso', curl([[x, 0.36, 0.33], [x * 1.04, 0.56, 0.28], [x * 1.08, 0.72, 0.13], [x * 1.08, 0.74, -0.1], [x * 1.04, 0.56, -0.28], [x, 0.36, -0.33]], 0.052, 0.052), '#2f6fed');
      }
      add('torso', ball(0.475, 0.075, 0.385), '#ffd23f', [0, 0.03, 0]);
      add('torso', star(0.1, 0.045, 0.03), '#ff9f1c', [0, 0.02, 0.37]);
      // A blue headband, tied at the back.
      add('head', ball(0.535, 0.075, 0.475), '#2f6fed', [0, 0.25, -0.015], undefined, [-0.12, 0, 0]);
      side('head', limb(0.04, 0.02, 0.26, 8), '#2f6fed', [0.07, 0.25, -0.47], undefined, [0.75, 0, -0.35]);
      // A curly tail.
      add('hips', curl([[0, 0.1, -0.26], [0, 0.19, -0.42], [0.09, 0.27, -0.36], [0.05, 0.2, -0.3], [-0.03, 0.26, -0.33]], 0.036, 0.02), c.body);
    },
  },
  {
    id: 'kit',
    name: 'Kit',
    nameKa: 'კიტი',
    species: 'Fox',
    speciesKa: 'მელია',
    title: 'The Quiet Ninja',
    signature: 'Shadow Dash',
    signatureKa: 'ჩრდილის ნახტომი',
    burst: 'leaf',
    burstColours: ['#ff8a2b', '#16b5a6', '#ffe0b8'],
    voice: 'af_nicole',
    pitch: 1,
    shout: 'Quick as a shadow!',
    shoutKa: 'ჩრდილივით სწრაფი ვარ!',
    colours: {
      body: '#f7822b',
      belly: '#fff1dd',
      pants: '#2b2f52',
      leg: '#2b2f52',
      foot: '#1c1f3d',
      arm: '#f7822b',
      forearm: '#2b2f52',
      hand: '#f7822b',
      ink: '#3a1d12',
    },
    build: shape({ width: 0.92, depth: 0.92, headDepth: 0.92, arms: 0.92, legs: 0.92 }),
    face: face({ eyeX: 0.2, eyeY: 0.05, eyeZ: 0.34, eyeSize: 0.105, mouthY: -0.235, mouthZ: 0.5, mouthSize: 0.8, brow: '#5a2a10' }),
    dress({ add, side, ball, taper, curl, colours: c }) {
      // White cheeks and a pointed muzzle.
      side('head', ball(0.2, 0.17, 0.14), '#fff1dd', [0.23, -0.14, 0.24]);
      add('head', ball(0.14, 0.12, 0.2), '#fff1dd', [0, -0.13, 0.37]);
      add('head', ball(0.05, 0.04, 0.035), c.ink, [0, -0.085, 0.565]);
      // Tall ears with dark tips.
      side('head', taper(0.15, 0.03, 0.34), c.body, [0.3, 0.34, -0.03], [1, 1, 0.55], [0, 0, -0.32]);
      side('head', taper(0.075, 0.03, 0.13), '#3a1d12', [0.4, 0.61, -0.03], [1, 1, 0.65], [0, 0, -0.32]);
      side('head', taper(0.08, 0.02, 0.2), '#ffe0c4', [0.3, 0.38, 0.045], [1, 1, 0.3], [0, 0, -0.32]);
      // The ninja's scarf and trailing ribbons.
      add('torso', ball(0.31, 0.11, 0.3), '#16b5a6', [0, 0.62, 0]);
      add('torso', curl([[0.06, 0.62, -0.26], [0.14, 0.5, -0.46], [0.08, 0.36, -0.6], [0.16, 0.24, -0.72]], 0.055, 0.02), '#16b5a6');
      add('torso', curl([[-0.06, 0.62, -0.26], [-0.14, 0.46, -0.42], [-0.1, 0.3, -0.54], [-0.18, 0.14, -0.62]], 0.055, 0.02), '#0f9587');
      // A belt.
      add('torso', ball(0.345, 0.05, 0.29), '#16b5a6', [0, 0.05, 0]);
      // The big bushy tail, with a white tip.
      add('hips', curl([[0, 0.02, -0.22], [0, 0.0, -0.42], [0, 0.18, -0.66], [0, 0.48, -0.74]], 0.1, 0.13), c.body);
      add('hips', ball(0.15, 0.2, 0.15), '#fff1dd', [0, 0.57, -0.76]);
      // Wrapped wrists.
      side('foreL', ball(0.1, 0.05, 0.1), '#16b5a6', [0, -0.26, 0]);
      side('foreR', ball(0.1, 0.05, 0.1), '#16b5a6', [0, -0.26, 0]);
    },
  },
  {
    id: 'mochi',
    name: 'Mochi',
    nameKa: 'მოჩი',
    species: 'Bunny',
    speciesKa: 'კურდღელი',
    title: 'The Kicking Star',
    signature: 'Moon Hop',
    signatureKa: 'მთვარის ხტომა',
    burst: 'star',
    burstColours: ['#ff7eb6', '#ffe16b', '#ffffff'],
    voice: 'af_sky',
    pitch: 4,
    shout: 'Hop, hop, hooray!',
    shoutKa: 'ხტუნვა, ხტუნვა, ვაშა!',
    colours: {
      body: '#fff7f0',
      belly: '#ffe3ec',
      pants: '#ff5fa2',
      leg: '#fff7f0',
      foot: '#fff7f0',
      hand: '#fff7f0',
      ink: '#4b2e4a',
    },
    build: shape({ width: 0.88, depth: 0.9, feet: 1.45, legs: 0.98, arms: 0.85, headHeight: 0.96 }),
    face: face({ eyeX: 0.2, eyeY: 0.04, eyeSize: 0.125, mouthY: -0.18, mouthZ: 0.44, mouthSize: 0.7, pupil: '#a51d62', brow: '#c9778f' }),
    dress({ add, side, ball, taper, colours: c }) {
      // Very long ears, with pink inside.
      side('head', taper(0.11, 0.075, 0.62), c.body, [0.19, 0.32, -0.05], [1, 1, 0.6], [-0.1, 0, -0.16]);
      side('head', taper(0.06, 0.04, 0.5), '#ffb3cd', [0.2, 0.38, 0.0], [1, 1, 0.3], [-0.1, 0, -0.16]);
      // A pink nose, rosy cheeks and two front teeth.
      add('head', ball(0.05, 0.035, 0.03), '#ff5fa2', [0, -0.08, 0.455]);
      side('head', ball(0.08, 0.05, 0.02), '#ffc6d8', [0.33, -0.1, 0.3], undefined, [0, 0.65, 0]);
      for (const x of [-0.021, 0.021]) add('head', ball(0.019, 0.033, 0.012), '#ffffff', [x, -0.272, 0.405]);
      // Sporty shorts with a stripe.
      add('thighL', ball(0.12, 0.17, 0.125), c.pants, [0, -0.08, 0]);
      add('thighR', ball(0.12, 0.17, 0.125), c.pants, [0, -0.08, 0]);
      add('thighL', ball(0.125, 0.03, 0.13), '#ffffff', [0, -0.16, 0]);
      add('thighR', ball(0.125, 0.03, 0.13), '#ffffff', [0, -0.16, 0]);
      // A cotton tail.
      add('hips', ball(0.11), '#ffffff', [0, 0.1, -0.3]);
      // A band around the middle, with a star.
      add('torso', ball(0.335, 0.045, 0.285), '#ff5fa2', [0, 0.03, 0]);
    },
  },
  {
    id: 'widget',
    name: 'Widget',
    nameKa: 'ვიჯეტი',
    species: 'Robot',
    speciesKa: 'რობოტი',
    title: 'The Clever Machine',
    signature: 'Gear Storm',
    signatureKa: 'კბილანების ქარიშხალი',
    burst: 'gear',
    burstColours: ['#ffd23f', '#7fd8ff', '#c7d3df'],
    voice: 'am_echo',
    pitch: -1,
    shout: 'Power on! Beep boop!',
    shoutKa: 'ჩავირთე! ბიპ-ბუპ!',
    colours: {
      body: '#5d8fc9',
      leg: '#8fa6bd',
      arm: '#8fa6bd',
      forearm: '#5d8fc9',
      shin: '#5d8fc9',
      foot: '#3a5c86',
      hand: '#c7d3df',
      ink: '#14263d',
    },
    build: shape({ boxy: true, width: 1.05, customFeet: false, arms: 0.85, legs: 0.85, digits: 3, hands: 1.05 }),
    face: {
      visor: true,
      white: '#7ff0ff',
      eyeX: 0.17,
      eyeY: 0.05,
      eyeZ: 0.385,
      eyeSize: 0.085,
      brow: '#7ff0ff',
      mouthY: -0.2,
      mouthZ: 0.41,
      mouthSize: 0.9,
      mouthTilt: 0,
    },
    dress({ add, side, ball, limb, star, roundedBox, colours: c }) {
      // A boxy body and head.
      add('torso', roundedBox(0.68, 0.72, 0.5, 0.12), c.body, [0, 0.27, 0]);
      add('hips', roundedBox(0.52, 0.28, 0.42, 0.09), '#3a5c86', [0, 0.02, 0]);
      add('head', roundedBox(0.92, 0.72, 0.76, 0.17), c.body);
      // A dark face screen.
      add('head', roundedBox(0.72, 0.44, 0.1, 0.05), '#10233b', [0, 0.02, 0.34]);
      // Ear bolts and an antenna with a ball on top.
      side('head', ball(0.08, 0.1, 0.1), '#ffd23f', [0.48, 0, 0]);
      add('head', limb(0.02, 0.02, 0.22, 8), '#c7d3df', [0, 0.57, 0]);
      add('head', ball(0.065), '#ff5a4f', [0, 0.6, 0]);
      // The chest panel, with a star and two buttons.
      add('torso', roundedBox(0.42, 0.34, 0.05, 0.03), '#d8e3ee', [0, 0.3, 0.24]);
      add('torso', star(0.085, 0.04, 0.02), '#ff9f1c', [-0.07, 0.31, 0.265]);
      add('torso', ball(0.03, 0.03, 0.012), '#27c96b', [0.1, 0.37, 0.27]);
      add('torso', ball(0.03, 0.03, 0.012), '#ff5a4f', [0.1, 0.25, 0.27]);
      // Round joints at the shoulders, elbows and knees.
      add('upperL', ball(0.12), '#ffd23f');
      add('upperR', ball(0.12), '#ffd23f');
      add('foreL', ball(0.09), '#ffd23f');
      add('foreR', ball(0.09), '#ffd23f');
      add('shinL', ball(0.1), '#ffd23f');
      add('shinR', ball(0.1), '#ffd23f');
    },
  },
  {
    id: 'frost',
    name: 'Frost',
    nameKa: 'ფროსტი',
    species: 'Penguin',
    speciesKa: 'პინგვინი',
    title: 'The Cool Slider',
    signature: 'Snow Slide',
    signatureKa: 'თოვლის სრიალი',
    burst: 'snow',
    burstColours: ['#ffffff', '#a9e4ff', '#6fb7ff'],
    voice: 'bf_emma',
    pitch: 3,
    shout: 'Stay cool! Here comes the snow!',
    shoutKa: 'აბა, თოვლი მოდის!',
    colours: {
      body: '#27406b',
      belly: '#ffffff',
      pants: '#27406b',
      leg: '#ff9f1c',
      foot: '#ff9f1c',
      arm: '#27406b',
      hand: '#27406b',
      ink: '#0d1830',
    },
    build: shape({ width: 1.02, height: 1.12, depth: 1.04, legs: 0.72, feet: 1.32, arms: 1.05, hands: 1.05, digits: 3 }),
    face: face({ eyeX: 0.16, eyeY: 0.09, eyeZ: 0.41, eyeSize: 0.1, mouthY: -0.2, mouthZ: 0.5, mouthSize: 0.7 }),
    dress({ add, side, ball, limb, taper, colours: c }) {
      // A white face mask and a bright beak.
      side('head', ball(0.22, 0.24, 0.13), '#ffffff', [0.14, 0.03, 0.32]);
      add('head', ball(0.16, 0.2, 0.1), '#ffffff', [0, -0.15, 0.37]);
      add('head', taper(0.1, 0.02, 0.16), '#ff9f1c', [0, -0.08, 0.42], [1.1, 1, 0.6], [1.5, 0, 0]);
      // A striped winter hat with a pompom.
      add('head', ball(0.51, 0.3, 0.46), '#ff5a4f', [0, 0.25, -0.01]);
      add('head', ball(0.525, 0.08, 0.475), '#ffffff', [0, 0.18, 0]);
      add('head', ball(0.13), '#ffffff', [0, 0.59, 0]);
      add('head', ball(0.49, 0.05, 0.445), '#ffd23f', [0, 0.36, -0.01]);
      // A matching scarf.
      add('torso', ball(0.33, 0.085, 0.31), '#ff5a4f', [0, 0.65, 0]);
      add('torso', limb(0.05, 0.05, 0.26, 8), '#ff5a4f', [0.14, 0.64, 0.27], [1, 1, 0.55], [0.15, 0, 0.12]);
      // Flippers rather than sleeves.
      for (const side of ['L', 'R']) {
        add(`upper${side}`, limb(0.11, 0.09, 0.3, 12), c.body, undefined, [0.65, 1, 1]);
        add(`fore${side}`, limb(0.09, 0.085, 0.28, 12), c.body, undefined, [0.65, 1, 1]);
      }
      // A little tail.
      add('hips', ball(0.09, 0.05, 0.14), c.body, [0, -0.1, -0.28]);
    },
  },
  {
    id: 'bramble',
    name: 'Bramble',
    nameKa: 'ბრემბლი',
    species: 'Bear',
    speciesKa: 'დათვი',
    title: 'The Gentle Giant',
    signature: 'Honey Hug',
    signatureKa: 'თაფლის ჩახუტება',
    burst: 'honey',
    burstColours: ['#ffc23f', '#ffdf80', '#d98a1f'],
    voice: 'bm_george',
    pitch: -3,
    shout: 'A big bear hug for you!',
    shoutKa: 'დიდი დათვური ჩახუტება!',
    colours: {
      body: '#a4693a',
      leg: '#a4693a',
      pants: '#6b3f1f',
      foot: '#7f4f2b',
      hand: '#a4693a',
      ink: '#2d1708',
    },
    build: shape({ width: 1.28, depth: 1.18, height: 1.05, arms: 1.36, legs: 1.25, hands: 1.25, headWidth: 1.03 }),
    face: face({ eyeX: 0.19, eyeY: 0.12, eyeZ: 0.38, eyeSize: 0.098, mouthY: -0.24, mouthZ: 0.5, brow: '#3d1f0b' }),
    dress({ add, side, ball, colours: c }) {
      // Round ears with a lighter middle.
      side('head', ball(0.16, 0.16, 0.08), c.body, [0.39, 0.37, -0.02]);
      side('head', ball(0.095, 0.095, 0.05), '#e7c49a', [0.39, 0.36, 0.04]);
      // A pale muzzle and a big dark nose.
      add('head', ball(0.21, 0.17, 0.14), '#e7c49a', [0, -0.13, 0.4]);
      add('head', ball(0.08, 0.06, 0.045), '#2d1708', [0, -0.07, 0.54]);
      // A green vest, open at the arms, with a leaf.
      add('torso', ball(0.492, 0.41, 0.38), '#2e8f4e', [0, 0.27, 0]);
      add('torso', ball(0.29, 0.32, 0.1), '#d8a878', [0, 0.2, 0.3]);
      // A leaf badge, and a rope belt.
      add('torso', ball(0.075, 0.042, 0.02), '#a6e36c', [0.29, 0.42, 0.3], undefined, [0, 0.7, 0.6]);
      add('torso', ball(0.495, 0.05, 0.385), '#e7c49a', [0, 0.02, 0]);
      // Claws, and a stub of a tail.
      add('hips', ball(0.11), c.body, [0, 0.03, -0.33]);
    },
  },
  {
    id: 'nova',
    name: 'Nova',
    nameKa: 'ნოვა',
    species: 'Space Cat',
    speciesKa: 'კოსმოსური კატა',
    title: 'The Star Whisperer',
    signature: 'Comet Pounce',
    signatureKa: 'კომეტის ნახტომი',
    burst: 'star',
    burstColours: ['#ffe16b', '#c9a0ff', '#7ee8ff'],
    voice: 'af_bella',
    pitch: 2,
    shout: 'To the stars! Meow!',
    shoutKa: 'ვარსკვლავებისკენ! მიაუ!',
    colours: {
      body: '#8d6ae0',
      belly: '#d9caff',
      pants: '#4a3796',
      leg: '#8d6ae0',
      foot: '#5e45b5',
      hand: '#8d6ae0',
      ink: '#221344',
    },
    build: shape({ width: 0.9, depth: 0.9, arms: 0.9, legs: 0.92 }),
    face: face({ eyeX: 0.21, eyeY: 0.05, eyeSize: 0.122, mouthY: -0.195, mouthZ: 0.43, mouthSize: 0.68, white: '#fff8cf', pupil: '#2a1b5e', brow: '#3b2675' }),
    dress({ add, side, ball, limb, taper, curl, star, colours: c }) {
      // Pointed ears, pink inside.
      side('head', taper(0.15, 0.03, 0.27), c.body, [0.31, 0.3, -0.03], [1, 1, 0.55], [0, 0, -0.38]);
      side('head', taper(0.09, 0.02, 0.15), '#ffb3e0', [0.33, 0.34, 0.04], [1, 1, 0.3], [0, 0, -0.38]);
      // A star on the forehead, a small nose and whiskers.
      add('head', star(0.085, 0.04, 0.02), '#ffe16b', [0, 0.3, 0.38], undefined, [-0.5, 0, 0]);
      add('head', ball(0.032, 0.024, 0.02), '#ff8fd0', [0, -0.09, 0.455]);
      side('head', limb(0.007, 0.004, 0.2, 5), c.ink, [0.14, -0.12, 0.4], undefined, [0, 0, 1.45]);
      side('head', limb(0.007, 0.004, 0.2, 5), c.ink, [0.14, -0.16, 0.39], undefined, [0, 0, 1.75]);
      // A silver collar with a star, and a cape of night sky.
      add('torso', ball(0.3, 0.06, 0.28), '#dbe4f0', [0, 0.65, 0]);
      add('torso', star(0.07, 0.033, 0.02), '#ffe16b', [0, 0.62, 0.27]);
      add('torso', ball(0.36, 0.56, 0.05), '#2b2070', [0, 0.17, -0.31], undefined, [0.12, 0, 0]);
      for (const [x, y] of [[-0.17, 0.42], [0.14, 0.26], [-0.08, 0.04], [0.2, -0.04], [0.02, -0.17], [-0.21, -0.1]]) {
        add('torso', star(0.03, 0.013, 0.008), '#ffe16b', [x, y, -0.375 + (0.3 - y) * 0.11], undefined, [Math.PI, 0.12, 0]);
      }
      // The long thin tail, curling up behind.
      add('hips', curl([[0, 0.02, -0.25], [0.05, -0.05, -0.5], [0.12, 0.2, -0.7], [0.06, 0.52, -0.66], [-0.08, 0.62, -0.5]], 0.05, 0.03), c.body);
      add('hips', ball(0.05), '#ffe16b', [-0.09, 0.63, -0.48]);
    },
  },
  {
    id: 'cinder',
    name: 'Cinder',
    nameKa: 'სინდერი',
    species: 'Baby Dragon',
    speciesKa: 'პატარა დრაკონი',
    title: 'The Warm Heart',
    signature: 'Ember Spin',
    signatureKa: 'ნაკვერჩხლის ტრიალი',
    burst: 'flame',
    burstColours: ['#ff5a2b', '#ffb703', '#ffe16b'],
    voice: 'am_adam',
    pitch: 1,
    shout: 'Fired up and ready!',
    shoutKa: 'ცეცხლივით მზად ვარ!',
    colours: {
      body: '#e8452f',
      belly: '#ffd98a',
      leg: '#e8452f',
      foot: '#a92c1c',
      hand: '#e8452f',
      ink: '#3d0d08',
    },
    build: shape({ width: 0.98, legs: 1.05, digits: 3, hands: 0.95, headDepth: 1.02 }),
    face: face({ eyeX: 0.2, eyeY: 0.14, eyeZ: 0.36, eyeSize: 0.11, mouthY: -0.2, mouthZ: 0.53, mouthSize: 1.05, white: '#fffbe0', pupil: '#3d1205' }),
    dress({ add, side, ball, taper, curl, flat, colours: c }) {
      // A short snout with nostrils.
      add('head', ball(0.28, 0.2, 0.22), c.body, [0, -0.13, 0.32]);
      side('head', ball(0.022, 0.018, 0.012), c.ink, [0.08, -0.04, 0.53]);
      // Two small horns and a crest of flame.
      add('head', curl([[0.2, 0.37, -0.03], [0.26, 0.54, -0.1], [0.24, 0.68, -0.22]], 0.07, 0.012), '#ffeec2');
      add('head', curl([[-0.2, 0.37, -0.03], [-0.26, 0.54, -0.1], [-0.24, 0.68, -0.22]], 0.07, 0.012), '#ffeec2');
      add('head', taper(0.09, 0.015, 0.22), '#ffb703', [0, 0.42, 0.06], [0.55, 1, 1], [0.1, 0, 0]);
      add('head', taper(0.075, 0.012, 0.15), '#ffb703', [0, 0.4, -0.13], [0.55, 1, 1], [-0.45, 0, 0]);
      // Wings.
      const wing = flat([[0, 0], [0.22, 0.22], [0.52, 0.44], [0.66, 0.24], [0.52, 0.12], [0.5, -0.04], [0.32, -0.02], [0.24, -0.2], [0.08, -0.14], [0, 0]], 0.012);
      add('torso', wing, '#ff9f1c', [0.14, 0.44, -0.27], undefined, [0.1, -0.42, 0]);
      add('torso', wing, '#ff9f1c', [-0.14, 0.44, -0.27], undefined, [0.1, Math.PI + 0.42, 0]);
      // A spade on the end of the tail.
      add('hips', curl([[0, 0.0, -0.2], [0, -0.12, -0.46], [0, -0.02, -0.74], [0, 0.18, -0.86]], 0.11, 0.035), c.body);
      add('hips', taper(0.085, 0.012, 0.2), '#ffb703', [0, 0.2, -0.88], [1, 1, 0.3], [-0.2, 0, 0]);
      // Belly stripes.
      for (const y of [0.11, 0.24, 0.37]) add('torso', ball(0.22 - Math.abs(y - 0.24) * 0.4, 0.01, 0.025), '#e8a948', [0, y, 0.345 - Math.abs(y - 0.24) * 0.14]);
    },
  },
  {
    id: 'tur',
    name: 'Tur',
    nameKa: 'ჯიხვი',
    species: 'Mountain Goat',
    speciesKa: 'მთის ჯიხვი',
    title: 'The Caucasus Climber',
    signature: 'Mountain Charge',
    signatureKa: 'მთის იერიში',
    burst: 'rock',
    burstColours: ['#c9a37a', '#ffd23f', '#8c1f2d'],
    voice: 'bm_lewis',
    pitch: -1,
    shout: 'Up the mountain! Here I come!',
    shoutKa: 'მთას მივუყვები, მოვდივარ!',
    colours: {
      body: '#c9a37a',
      belly: '#8c1f2d',
      pants: '#3a2a22',
      leg: '#b48f68',
      foot: '#3a2a22',
      arm: '#8c1f2d',
      forearm: '#c9a37a',
      hand: '#c9a37a',
      ink: '#2c1a0f',
    },
    build: shape({ width: 1.02, legs: 1.02, arms: 1.05, digits: 3, headHeight: 1.03, headWidth: 0.94 }),
    face: face({ eyeX: 0.195, eyeY: 0.12, eyeZ: 0.35, eyeSize: 0.1, mouthY: -0.285, mouthZ: 0.42, mouthSize: 0.75, white: '#fff6dc', pupil: '#2c1a0f' }),
    dress({ add, side, ball, limb, curl, colours: c }) {
      // A long pale muzzle.
      add('head', ball(0.2, 0.22, 0.2), '#e8d3b4', [0, -0.15, 0.27]);
      side('head', ball(0.023, 0.018, 0.012), c.ink, [0.07, -0.13, 0.46]);
      // Great curving horns, the mountain goat's pride, with rings.
      const horn = '#6b5641';
      for (const x of [1, -1]) {
        add('head', curl([[x * 0.14, 0.33, 0.02], [x * 0.3, 0.6, -0.08], [x * 0.56, 0.7, -0.24], [x * 0.76, 0.5, -0.32], [x * 0.72, 0.28, -0.22]], 0.105, 0.022), horn);
      }
      // Floppy ears and a small beard.
      side('head', limb(0.08, 0.05, 0.24, 10), c.body, [0.46, 0.15, -0.02], [1, 1, 0.45], [0, 0, 1.0]);
      add('head', limb(0.06, 0.012, 0.21, 10), '#f2e6d0', [0, -0.34, 0.28], undefined, [0.12, 0, 0]);
      // A crimson coat with gold trim and rows of little pockets, in the old mountain style.
      add('torso', ball(0.39, 0.5, 0.33), '#8c1f2d', [0, 0.27, 0]);
      for (const y of [0.17, 0.3, 0.43]) add('torso', ball(0.026, 0.026, 0.012), '#ffd23f', [0, y, 0.33 - (y - 0.27) * (y - 0.27) * 0.5]);
      for (const y of [0.3, 0.38, 0.46]) side('torso', ball(0.055, 0.017, 0.012), '#ffd23f', [0.19, y, 0.27 - Math.abs(y - 0.3) * 0.22], undefined, [0, 0.55, 0]);
      add('torso', ball(0.395, 0.05, 0.335), '#2c1a0f', [0, 0.04, 0]);
      add('torso', ball(0.042, 0.042, 0.016), '#ffd23f', [0, 0.04, 0.33]);
      // A short tail.
      add('hips', ball(0.075, 0.1, 0.075), c.body, [0, 0.12, -0.28]);
    },
  },
];

export const byId = (id) => ROSTER.find((character) => character.id === id);
