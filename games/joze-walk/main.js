// Joze's Long Walk Home: Joze is lost, and hungry at every stop on the way back to his family. The
// child closes a hand on fruit, carries it to his mouth and opens to feed him. The story is in
// journey.js, and the land he walks through is in walk.js.
import { MoveDemo } from '../../core/body/demo.js';
import { renderPortraits } from '../../core/body/portraits.js';
import { ROSTER, byId as characterById } from '../../core/body/roster.js';
import { GameSession } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { Journey, STOPS } from './journey.js';
import { Walk } from './walk.js';

const CLOSE_ON_IT = 'Close your hand on the fruit!';
const OPEN_FOR_JOZE = 'Bring it to Joze, and open your hand!';
const HOME = 'Joze is home!';

const LAST_WORDS_SECONDS = 2.4;
const WALK_SECONDS = 2.8; // Between one tree and the next.
const HINT_AFTER_SECONDS = 4;
const FILM_SECONDS = 16;
const MOUTH_HOLD_MS = 2200;
const MOUTH_FORWARD = 0.09; // Where his mouth is from the middle of his head, in screen heights.
const MOUTH_DOWN = 0.03;

const byId = (id) => document.getElementById(id);

class WalkGame {
  chimeOnOpen = false;

  constructor(session) {
    this.session = session;
    this.story = new StoryBox(session);
    this.journey = null;
    this.timer = 0;
    this.after = null;
    this.idleFor = 0;
    this.eatingUntil = 0;
    this.walk = new Walk({ backdrop: byId('backdrop'), canvas: byId('game') }, {
      onPick: () => {
        this.idleFor = 0;
        session.sound.play('tick', { gain: 0.5 });
      },
      onFed: () => this.onFed(),
      onDropped: () => this.journey?.dropped(),
      onWalked: () => this.journey.nextStop(),
    });
    this.joze = new MoveDemo(byId('joze-stage'));
    this.joze.setCharacter(characterById('joze'));
    this.applySettings();
    const game = this;
    this.debug = {
      walk: this.walk,
      joze: this.joze,
      get journey() {
        return game.journey;
      },
    };
  }

  applySettings() {
    const { hands, reach } = this.session.settings;
    this.walk.side = hands;
    this.walk.reach = reach;
    document.body.dataset.side = hands;
  }

  setHands() {
    this.applySettings();
    this.jozeDoes('jozeWaits');
  }

  settingChanged() {
    this.applySettings();
  }

  /** He faces the tree, on the side of the hand being played with. */
  jozeDoes(name) {
    this.joze.show(name, this.session.settings.hands);
  }

  prepare() {
    this.applySettings();
    this.story.hide();
    this.walk.fruit = [];
    this.walk.fed = { left: 0, right: 0 };
    this.walk.arriveAt(STOPS[0].place);
    this.journey = new Journey({ onEvent: (event) => this.onJourney(event) });
    this.jozeDoes('jozeWaits');
    this.showProgress();
  }

  begin() {
    this.journey.nextStop();
  }

  later(seconds, what) {
    this.timer = seconds;
    this.after = what;
  }

  onJourney(event) {
    const handlers = {
      stop: () => this.onStop(event),
      fed: () => this.showProgress(),
      'stop-done': () => this.onStopDone(event),
      home: () => this.session.finish(),
    };
    handlers[event.type]?.();
  }

  onStop({ stop }) {
    this.walk.arriveAt(stop.place);
    this.jozeDoes('jozeWaits');
    this.story.say(stop.who, stop.hello);
    this.idleFor = 0;
    this.walk.hangFruit(stop.fruit, stop.count);
    this.showProgress();
  }

  onFed() {
    const { sound } = this.session;
    sound.play('crunch', { gain: 0.8, rate: 0.95 + Math.random() * 0.12 });
    this.idleFor = 0;
    this.eatingUntil = performance.now() + MOUTH_HOLD_MS;
    this.jozeDoes('munch');
    this.journey.feed();
  }

  /** Off to the next tree straight away, except at the very end, where there's a thank-you. */
  onStopDone({ stop }) {
    this.walk.fruit = [];
    const next = STOPS[this.journey.index + 1];
    if (!next) {
      this.story.say(stop.who, stop.done);
      this.later(LAST_WORDS_SECONDS, () => this.journey.nextStop());
      return;
    }
    this.jozeDoes('walk');
    this.walk.walkTo(next.place, WALK_SECONDS);
  }

  showProgress() {
    const { journey } = this;
    const share = journey.progress;
    byId('chip-stops').textContent = `${Math.max(1, Math.min(STOPS.length, journey.index + 1))} of ${STOPS.length}`;
    byId('race-progress-fill').style.width = `${Math.round(share * 100)}%`;
    byId('map-joze').style.left = `${Math.round(share * 1000) / 10}%`;
  }

  update(dt, snapshot) {
    if (this.after) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const what = this.after;
        this.after = null;
        what();
      }
    }
    this.joze.update(dt);
    const head = this.joze.headOnPage();
    if (head) {
      // His mouth is at the front of his head, and he's facing the tree.
      const way = this.session.settings.hands === 'right' ? 1 : -1;
      this.walk.setMouth(head.x + way * window.innerHeight * MOUTH_FORWARD, head.y + window.innerHeight * MOUTH_DOWN);
    }
    this.walk.update(dt, snapshot, { aspect: this.session.camera.aspect, playing: true, showHands: true });
    if (this.eatingUntil && performance.now() > this.eatingUntil) {
      this.eatingUntil = 0;
      if (this.walk.walking === 0 && this.walk.fruit.length) this.jozeDoes('jozeWaits');
    }
    this.idleFor += dt;
    const filming = this.session.playSeconds < FILM_SECONDS && this.journey.stats.fed === 0;
    if (filming !== this.filming) {
      this.filming = filming;
      document.body.dataset.film = filming ? 'on' : 'off';
    }
  }

  idle(dt, snapshot) {
    if (this.filming) {
      this.filming = false;
      document.body.dataset.film = 'off';
    }
    this.joze.update(dt);
    const counting = this.session.screen === 'countdown';
    this.walk.update(dt, snapshot, { aspect: this.session.camera.aspect, showHands: counting });
  }

  render() {
    this.walk.render();
  }

  prompt(snapshot, dt) {
    const { session, walk } = this;
    const needed = session.handsPrompt(snapshot, dt);
    // Closing the hand is part of this game, so it isn't asked to open unless it's time to.
    if (needed && !needed.key.startsWith('closed')) return needed;
    // Once they've got the idea, this only comes back if they seem to have stopped.
    if (walk.holding && (this.journey.stats.fed === 0 || this.idleFor > HINT_AFTER_SECONDS)) {
      return { key: 'bring', text: OPEN_FOR_JOZE, side: null };
    }
    if (!walk.holding && walk.fruit.length && this.idleFor > HINT_AFTER_SECONDS) return { key: 'close-on-it', text: CLOSE_ON_IT, side: null };
    return null;
  }

  finished() {
    this.story.hide();
    this.joze.hide();
  }

  summary() {
    return { hero: this.journey.stats.fed, noun: 'walk', rows: { fed: this.walk.fed } };
  }
}

new GameSession({
  shell: {
    title: 'Joze’s Long Walk Home',
    startLabel: 'Help Joze',
    againLabel: 'Walk again',
    finishTitle: HOME,
    heroMark: '🍎',
    heroNoun: 'fruit fed to Joze',
    extraRows: [{ id: 'fed', label: 'Fruit fed' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span class="chip-label">Stop</span><span id="chip-stops" class="chip-value">1 of 5</span></div>
        </div>
      </div>
      <div class="map" aria-hidden="true">
        <div class="race-progress"><div id="race-progress-fill" class="race-progress-fill"></div></div>
        <span id="map-joze" class="map-joze">🦒</span>
        <span class="map-home">🏠</span>
      </div>
      ${STORY_BOX}
      <div class="film" aria-hidden="true">
        <svg viewBox="0 0 220 220">
          <circle class="film-mouth" cx="44" cy="100" r="26" />
          <path class="film-smile" d="M28 100q16 18 32 0" />
          <circle class="film-fruit" cx="170" cy="60" r="20" />
          <g class="film-hand">
            <rect x="150" y="96" width="46" height="42" rx="16" />
            <path class="film-finger" d="M156 102V74" />
            <path class="film-finger" d="M167 98V64" />
            <path class="film-finger" d="M179 98V62" />
            <path class="film-finger" d="M190 102V70" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>How far to reach (how close the tree is to Joze)</legend>
        <label><input type="radio" name="reach" value="none"> Far</label>
        <label><input type="radio" name="reach" value="little"> Medium</label>
        <label><input type="radio" name="reach" value="lots"> Close</label>
      </fieldset>`,
  },
  defaults: { reach: 'little' },
  choices: { reach: String },
  tagline: (side) => `Joze is lost! Pick fruit with your ${side} hand, carry it to him, and open your hand to feed him, all the way home.`,
  finishLine: HOME,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new Sound({ ...options, sounds: { crunch: new URL('./audio/crunch.ogg', import.meta.url) } }),
  createGame: (session) => new WalkGame(session),
}).start();
