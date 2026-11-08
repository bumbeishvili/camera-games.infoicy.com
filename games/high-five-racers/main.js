// High Five Racers: the car only drives while the hand in play is open. Steering over to a big hand
// at the roadside slaps it for a boost, and opening the hand as wide as it goes is turbo. Once turbo has
// run out, a fist and then an open hand with the other hand sets it off again, and the car flies.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { GameSession, SPOKEN as SPOKEN_EVERYWHERE } from '../../core/session.js';
import { CarSound } from './car-sound.js';
import { Race } from './game.js';
import { TOP_SPEED } from './rules.js';

const STEER_HINT_SECONDS = 6;
const REST_AFTER_SECONDS = 15;
const FIVE_HINT_WITHIN = 65; // Metres before a big hand that the hint comes up.
const HINT_UNTIL_FIVES = 2; // Once a child has got the idea, nothing more is said about it.
const FILM_AGAIN_AFTER_MISSES = 3;
const TURBO_HINT_AFTER_SECONDS = 14;
const TURBO_HINT_SECONDS = 5;
const TURBO_TOAST_SPACING_SECONDS = 9;
const SPEED_SHOWN_PER_METRE = 5; // Metres a second, as a number that's fun to see going up.

const STEER_HINT = 'Move your hand side to side to catch stars';
// Only this game says these. Each has a rendered voice file: see core/audio/voice/lines.json.
const SPOKEN = {
  bigHand: 'High five the big hand!',
  turbo: 'Open wide for turbo!',
};
const PRAISE = ['Great job!', 'Nice one!', 'You passed a car!', 'Way to go!'];
const PRAISE_EVERY = 5; // Cars passed between one bit of praise and the next.

// Little words that pop up beside the action. The Georgian needs a native speaker's check.
const WORDS = {
  en: {
    five: 'High five!',
    row: (count) => `${count} in a row!`,
    passed: (spec) => `You passed ${spec.name}!`,
    turbo: 'Turbo!',
    fly: 'Fly!',
  },
  ka: {
    five: 'ყოჩაღ!',
    row: (count) => `${count} ზედიზედ!`,
    passed: (spec) => `გაასწარი: ${spec.nameKa}!`,
    turbo: 'ტურბო!',
    fly: 'გაფრინდი!',
  },
};

const byId = (id) => document.getElementById(id);
const ordinal = (place) => ['1st', '2nd', '3rd', '4th'][place - 1] ?? `${place}th`;

/** Who drives what. Whoever the child chose in the other games drives, and Joze if nobody was. */
function castFor(settings) {
  const driver = characterWithId(settings.fighter) ?? ROSTER[0];
  return { driver, rivals: ROSTER.filter((spec) => spec !== driver).slice(0, 3) };
}

class RaceGame {
  chimeOnOpen = true;

  constructor(session) {
    this.session = session;
    this.praiseIndex = 0;
    this.passed = 0;
    this.missesInARow = 0;
    this.fiveHintSpoken = false;
    this.turboHintFrom = null;
    this.lastTurboToast = -Infinity;
    const { sound } = session;
    this.cast = castFor(session.settings);
    this.race = new Race(byId('game'), {
      onStar: () => sound.star(),
      onPlace: (place, previous) => {
        if (place < previous) {
          sound.passedCar();
          this.passed += 1;
          if (this.passed % PRAISE_EVERY === 1) sound.say(PRAISE[this.praiseIndex++ % PRAISE.length], { ifQuiet: true });
        }
      },
      onOvertake: (spec) => this.toast(this.words.passed(spec), spec),
      onLap: (lap) => {
        sound.lap();
        sound.say(lap === this.race.laps ? 'Last lap!' : `Lap ${lap}!`);
      },
      onFive: (total, side, streak) => {
        sound.slap(streak);
        this.missesInARow = 0;
        this.toast(streak >= 3 ? this.words.row(streak) : this.words.five);
      },
      onGate: (gate, outcome) => {
        if (outcome === 'passed' && this.race.drive > 0) this.missesInARow += 1;
        if (outcome === 'closed') sound.pat();
      },
      onBump: () => sound.bump(),
      onTurbo: (on) => {
        if (!on) return;
        sound.turboOn();
        // Taking off says so itself.
        if (this.race.soaring) return;
        if (session.playSeconds - this.lastTurboToast > TURBO_TOAST_SPACING_SECONDS) {
          this.lastTurboToast = session.playSeconds;
          this.toast(this.words.turbo);
        }
      },
      onJump: () => sound.jumped(),
      onFly: () => {
        sound.jumped();
        this.toast(this.words.fly);
      },
      onLanded: () => sound.landed(),
      onCrowd: () => sound.crowd(),
      onFinish: () => session.finish(),
    }, { ...this.cast, reach: session.settings.reach });
    this.race.setMode('attract');
    this.showSteering(session.settings.steering);
    this.buildOrder();
    this.turboFill = byId('turbo-fill');
    this.turboBox = byId('turbo');
    this.turboWord = byId('turbo-word');
    this.speedShown = byId('speed-value');
    this.toastBox = byId('toast');
    this.toastFace = byId('toast-face');
    this.toastText = byId('toast-text');
    // Otherwise it would play again whenever the race's screen comes back.
    this.toastBox.addEventListener('animationend', () => this.toastBox.classList.remove('is-showing'));
    const game = this;
    this.debug = {
      race: this.race,
      get game() {
        return game;
      },
    };
  }

  get words() {
    return WORDS[this.session.settings.language] ?? WORDS.en;
  }

  /** A picture of each racer, in the order they're going, which swap places as they overtake. */
  buildOrder() {
    const list = byId('race-order');
    this.orderRows = new Map();
    list.replaceChildren();
    for (const spec of [this.cast.driver, ...this.cast.rivals]) {
      const row = document.createElement('li');
      row.className = 'order-row';
      row.dataset.who = spec.id;
      if (spec === this.cast.driver) row.classList.add('is-you');
      const face = document.createElement('img');
      face.alt = '';
      face.src = this.session.portraits?.[spec.id] ?? '';
      const number = document.createElement('span');
      number.className = 'order-number';
      row.append(number, face);
      list.append(row);
      this.orderRows.set(spec.id, { row, number });
    }
  }

  toast(text, spec = null) {
    this.toastText.textContent = text;
    if (spec) this.toastFace.src = this.session.portraits?.[spec.id] ?? '';
    this.toastFace.classList.toggle('is-hidden', !spec);
    this.toastBox.classList.remove('is-showing');
    void this.toastBox.offsetWidth;
    this.toastBox.classList.add('is-showing');
  }

  showSteering(steering) {
    byId('wheel').classList.toggle('is-auto', steering === 'auto');
  }

  showProgress() {
    const { race } = this;
    const { place, lap, laps, stars, fives, progress, speed, turbo, turboOn } = race.info;
    byId('chip-place').textContent = ordinal(place);
    byId('chip-lap').textContent = `${lap} of ${laps}`;
    byId('chip-stars').textContent = String(stars);
    byId('chip-fives').textContent = String(fives);
    byId('race-progress-fill').style.width = `${Math.round(progress * 100)}%`;

    this.turboFill.style.transform = `scaleX(${turbo.toFixed(3)})`;
    const state = turboOn ? 'on' : turbo > 0.02 ? 'filling' : 'idle';
    if (this.turboBox.dataset.state !== state) {
      this.turboBox.dataset.state = state;
      this.turboWord.textContent = turboOn ? this.words.turbo : this.words.turbo.replace('!', '');
    }
    this.speedShown.textContent = String(Math.round(speed * TOP_SPEED * SPEED_SHOWN_PER_METRE));

    race.order.forEach((spec, index) => {
      const entry = this.orderRows.get(spec.id);
      if (!entry) return;
      entry.row.style.setProperty('--slot', String(index));
      entry.number.textContent = String(index + 1);
    });
  }

  setHands(side) {
    this.race.setDriverHand(side);
  }

  settingChanged(change) {
    if ('steering' in change) this.showSteering(change.steering);
    if ('reach' in change) this.race.setReach(change.reach);
    if ('fighter' in change) {
      this.cast = castFor(this.session.settings);
      this.race.setDrivers(this.cast.driver, this.cast.rivals);
      this.buildOrder();
    }
  }

  enterCheck() {
    this.session.sound.stopEngine();
    this.race.setMode('grid');
    this.race.world.places.startLights.set(0);
  }

  prepare() {
    this.race.reset(this.session.settings.laps);
    this.race.setMode('grid');
    this.race.world.places.startLights.set(0);
    this.missesInARow = 0;
    this.turboHintFrom = null;
    this.lastTurboToast = -Infinity;
    this.showProgress();
    this.session.sound.startEngine();
  }

  begin() {
    this.race.setMode('race');
    this.race.world.places.startLights.go();
    this.race.celebrateAtLine();
  }

  resume() {
    this.session.sound.startEngine();
    this.race.setMode('race');
    this.race.world.places.startLights.go();
  }

  update(dt, snapshot) {
    const { session, race } = this;
    const hand = snapshot[snapshot.side];
    race.update(dt, {
      drive: snapshot.drive,
      // How open this hand is, against the best it managed in the hand check. That's what turbo goes by.
      width: snapshot.handOpen ? hand.openness / Math.max(hand.best, hand.target + 0.01) : 0,
      steer: snapshot.steer,
      steering: session.settings.steering,
      left: snapshot.left,
      right: snapshot.right,
      // The other hand: a fist and then open, once turbo has run out, sets it off again and the car flies.
      other: snapshot.other,
    });
    const { speed, turboOn, boosting } = race.info;
    session.sound.engine(speed, snapshot.drive > 0, turboOn || boosting ? 1 : 0);
    this.showProgress();
  }

  idle(dt, { left, right, steer }) {
    this.race.update(dt, { left, right, steer });
    // The lights over the start line come on, one for each number of the countdown.
    if (this.session.screen === 'countdown') this.race.world.places.startLights.set(this.session.countWait > 0 ? 0 : 4 - Math.ceil(this.session.countLeft));
  }

  render() {
    this.race.render();
  }

  /** A film of what to do with the next big hand, until the child has got the idea. */
  showFiveFilm(side) {
    const film = side ?? '';
    if (this.shownFilm === film) return;
    this.shownFilm = film;
    if (side) document.body.dataset.fiveFilm = side;
    else delete document.body.dataset.fiveFilm;
  }

  prompt(snapshot, dt) {
    const { session, race } = this;
    const steerable = session.settings.steering !== 'auto';
    const { gateNext: gate, gateAhead: ahead } = race;
    const side = gate?.side < 0 ? 'left' : 'right';
    const needsFiveHelp = race.fives < HINT_UNTIL_FIVES || this.missesInARow >= FILM_AGAIN_AFTER_MISSES;
    const gateHintDue = needsFiveHelp && steerable && ahead < FIVE_HINT_WITHIN;

    // Turbo isn't obvious, so it's mentioned once, to anyone who hasn't found it by themselves. It
    // waits for a gap, and then has its say, so the two hints can't keep taking turns.
    const turboHintDue = !race.turbo.everFull && !gateHintDue && session.playSeconds > TURBO_HINT_AFTER_SECONDS;
    if (this.turboHintFrom === null && turboHintDue) this.turboHintFrom = session.playSeconds;
    const turboHint = this.turboHintFrom !== null && !race.turbo.everFull && session.playSeconds - this.turboHintFrom < TURBO_HINT_SECONDS;
    this.turboBox.classList.toggle('is-hint', turboHint);

    const gateHint = gateHintDue && !turboHint;
    const steerHint = session.playSeconds < STEER_HINT_SECONDS && steerable && !gateHint;
    // While a hint is up, a little film shows what it means.
    document.body.toggleAttribute('data-steer-hint', steerHint);
    document.body.toggleAttribute('data-turbo-hint', turboHint);
    this.showFiveFilm(gateHint && snapshot.handOpen ? side : null);

    const needed = session.handsPrompt(snapshot, dt);
    if (needed) {
      // After a while with the hand closed, stop asking and make resting feel fine.
      if (needed.key.startsWith('closed') && session.closedSeconds > REST_AFTER_SECONDS) {
        return { key: 'rest', text: SPOKEN_EVERYWHERE.resting, side: null };
      }
      return needed;
    }
    if (turboHint) return { key: 'turbo-hint', text: SPOKEN.turbo, side: null };
    if (gateHint) {
      const silent = this.fiveHintSpoken;
      this.fiveHintSpoken = true;
      return { key: `five-${side}`, text: SPOKEN.bigHand, side, silent };
    }
    if (steerHint) return { key: 'steer-hint', text: STEER_HINT, side: null };
    return null;
  }

  finished() {
    this.session.sound.stopEngine();
    this.showFiveFilm(null);
    document.body.removeAttribute('data-turbo-hint');
    this.race.setMode('finished');
  }

  summary() {
    const { race } = this;
    const fives = `${race.fives} of ${race.gatesMet}`;
    const sides = `Left ${race.fivesLeft}, right ${race.fivesRight}`;
    return {
      hero: race.info.stars,
      noun: 'race',
      rows: { fives: { left: fives, right: fives }, sides: { left: sides, right: sides } },
    };
  }
}

const driverChoices = ROSTER.map(({ id, name }) => `<label><input type="radio" name="fighter" value="${id}"> ${name}</label>`).join('\n        ');

new GameSession({
  shell: {
    title: 'High Five Racers',
    startLabel: 'Let’s race!',
    againLabel: 'Race again',
    finishTitle: 'You won the race!',
    heroMark: '★',
    heroNoun: 'stars',
    withWheel: true,
    extraRows: [{ id: 'fives', label: 'High fives' }, { id: 'sides', label: 'To each side' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span class="chip-label">Place</span><span id="chip-place" class="chip-value">4th</span></div>
          <div class="chip"><span class="chip-label">Lap</span><span id="chip-lap" class="chip-value">1 of 2</span></div>
          <div class="chip"><span class="chip-label">Stars</span><span id="chip-stars" class="chip-value">0</span></div>
          <div class="chip"><span class="chip-label">Fives</span><span id="chip-fives" class="chip-value">0</span></div>
        </div>
        <div class="race-progress" aria-hidden="true"><div id="race-progress-fill" class="race-progress-fill"></div></div>
        <ol id="race-order" class="race-order" aria-hidden="true"></ol>
      </div>
      <div id="turbo" class="turbo" data-state="idle" aria-hidden="true">
        <svg class="turbo-flame" viewBox="0 0 40 52"><path d="M20 2c5 10 15 15 15 29a15 15 0 0 1-30 0c0-7 3-11 7-15 1 4 3 6 5 6 2-6 0-13 3-20z"/><path class="turbo-flame-core" d="M20 24c3 5 7 7 7 13a7 7 0 0 1-14 0c0-5 4-7 7-13z"/></svg>
        <div class="turbo-parts">
          <div class="turbo-words"><span id="turbo-word" class="turbo-word">Turbo</span><span class="turbo-speed"><span id="speed-value">0</span></span></div>
          <div class="turbo-track"><div id="turbo-fill" class="turbo-fill"></div></div>
        </div>
      </div>
      <div id="toast" class="toast" aria-live="polite"><img id="toast-face" class="toast-face is-hidden" alt=""><span id="toast-text"></span></div>
      <div class="five-film" aria-hidden="true">
        <svg viewBox="0 0 120 110">
          <g class="five-film-big">
            <rect x="82" y="46" width="30" height="30" rx="12"/>
            <path d="M88 50V24M97 46V16M105 46V18M113 52V28M84 66L72 56"/>
          </g>
          <g class="five-film-small">
            <rect x="14" y="62" width="24" height="24" rx="9"/>
            <path d="M18 66V46M25 62V40M32 62V42M38 66V50M15 78L6 70"/>
          </g>
          <g class="five-film-burst"><path d="M64 44l4 10 11 1-8 7 2 11-9-6-10 6 3-11-8-7 11-1z"/></g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>Steering</legend>
        <label><input type="radio" name="steering" value="auto"> Car steers itself</label>
        <label><input type="radio" name="steering" value="help"> A little help</label>
        <label><input type="radio" name="steering" value="none"> No help</label>
      </fieldset>
      <fieldset class="choice">
        <legend>How far to reach for the big hands</legend>
        <label><input type="radio" name="reach" value="small"> A small reach</label>
        <label><input type="radio" name="reach" value="medium"> A medium reach</label>
        <label><input type="radio" name="reach" value="big"> Right to the edge of the road</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Race length (with the hand open)</legend>
        <label><input type="radio" name="laps" value="1"> 1 lap, about a minute</label>
        <label><input type="radio" name="laps" value="2"> 2 laps, about 2 minutes</label>
        <label><input type="radio" name="laps" value="4"> 4 laps, about 4 minutes</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Who drives</legend>
        ${driverChoices}
      </fieldset>`,
  },
  defaults: { steering: 'help', laps: 2, reach: 'medium', fighter: ROSTER[0].id },
  choices: { steering: String, laps: Number, reach: String, fighter: String },
  tagline: (side) => `Open your ${side} hand to make your car go!`,
  finishLine: 'You did it! Great racing!',
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new CarSound(options),
  createGame: async (session) => {
    // The signs and banners draw text, so their font has to be ready first.
    await document.fonts.load('700 104px Fredoka');
    return new RaceGame(session);
  },
}).start();
