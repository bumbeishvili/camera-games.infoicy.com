// Spider Catcher: Joze's little spider friends have run off all over the garden. The child opens a hand
// near one and closes it to pick it up, carries it across to its web, and opens the hand to let it in.
// The story and rules are in spiders.js, and the garden is in garden.js.
import { MoveDemo } from '../../core/body/demo.js';
import { renderPortraits } from '../../core/body/portraits.js';
import { ROSTER, byId as characterById } from '../../core/body/roster.js';
import { GameSession } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { Garden } from './garden.js';
import { Gathering, PLACES, placesAt } from './spiders.js';

const CLOSE_ON_ONE = 'Close your hand on a spider!';
const OPEN_ON_WEB = 'Bring it to the web, and open your hand!';
const ALL_HOME = 'Every spider is home!';

const LAST_WORDS_SECONDS = 2.4;
const HINT_AFTER_SECONDS = 4;
const FILM_SECONDS = 16;
const CLAP_SECONDS = 1.7; // Joze claps for each spider home, then watches again.
const BIRDS_LEVEL = 0.35;

const byId = (id) => document.getElementById(id);
const sounds = Object.fromEntries(['home', 'rustle', 'birds'].map((name) => [name, new URL(`./audio/${name}.ogg`, import.meta.url)]));

class SpiderGame {
  chimeOnOpen = false;

  constructor(session) {
    this.session = session;
    this.story = new StoryBox(session);
    this.gathering = null;
    this.timer = 0;
    this.after = null;
    this.idleFor = 0;
    this.clapUntil = 0;
    this.garden = new Garden({ backdrop: byId('backdrop'), canvas: byId('game') }, {
      onCatch: () => {
        this.idleFor = 0;
        session.sound.play('tick', { gain: 0.5 });
      },
      onHome: () => this.onHome(),
      onLetGo: () => {
        session.sound.play('rustle', { gain: 0.5, rate: 1.1 });
        this.gathering?.letGo();
      },
      onDash: () => session.sound.play('rustle', { gain: 0.4, rate: 1.25 }),
      onLeave: () => this.leave(),
      onMoved: () => this.gathering.nextPlace(),
    });
    this.joze = new MoveDemo(byId('joze-stage'));
    this.joze.setCharacter(characterById('joze'));
    this.applySettings();
    const game = this;
    this.debug = {
      garden: this.garden,
      joze: this.joze,
      get gathering() {
        return game.gathering;
      },
    };
  }

  applySettings() {
    const { hands, reach } = this.session.settings;
    this.garden.side = hands;
    this.garden.reach = reach;
    document.body.dataset.side = hands;
  }

  setHands() {
    this.applySettings();
    this.jozeDoes('jozeWaits');
  }

  settingChanged() {
    this.applySettings();
  }

  /** He faces the spiders, on the side of the hand being played with. */
  jozeDoes(name) {
    this.joze.show(name, this.session.settings.hands);
  }

  /** A new game, at this level: see gardenAt in spiders.js for what each level brings. */
  prepare(level) {
    this.applySettings();
    this.story.hide();
    this.after = null;
    this.garden.home = { left: 0, right: 0 };
    this.garden.setLevel(level);
    this.garden.arriveAt(PLACES[0].place, 0);
    this.gathering = new Gathering({ level, onEvent: (event) => this.onGathering(event) });
    this.jozeDoes('jozeWaits');
    this.showProgress();
  }

  begin() {
    this.session.sound.startLoop('birds', BIRDS_LEVEL);
    this.gathering.nextPlace();
  }

  later(seconds, what) {
    this.timer = seconds;
    this.after = what;
  }

  onGathering(event) {
    const handlers = {
      place: () => this.onPlace(event),
      home: () => this.showProgress(),
      'place-done': () => this.onPlaceDone(event),
      'all-home': () => this.session.finish(),
    };
    handlers[event.type]?.();
  }

  onPlace({ place }) {
    this.garden.arriveAt(place.place, place.count);
    this.jozeDoes('jozeWaits');
    this.story.say(place.who, place.hello);
    this.idleFor = 0;
    this.showProgress();
  }

  onHome() {
    const { sound } = this.session;
    sound.play('home', { gain: 0.75, rate: 0.95 + Math.random() * 0.12 });
    this.idleFor = 0;
    this.clapUntil = performance.now() + CLAP_SECONDS * 1000;
    this.jozeDoes('clap');
    this.gathering.spiderHome();
  }

  /** Off to the next place almost at once, except at the very end, where there's a thank-you. */
  onPlaceDone({ place }) {
    const next = this.gathering.places[this.gathering.index + 1];
    if (!next) {
      this.story.say(place.who, place.done);
      this.later(LAST_WORDS_SECONDS, () => this.gathering.nextPlace());
      return;
    }
    this.garden.moveOn();
  }

  leave() {
    const next = this.gathering.places[this.gathering.index + 1];
    if (!next) return;
    this.clapUntil = 0;
    this.jozeDoes('walk');
    this.garden.goTo(next.place);
  }

  showProgress() {
    const { gathering } = this;
    const dots = byId('spider-dots');
    if (dots.children.length !== gathering.total) {
      dots.innerHTML = Array.from({ length: gathering.total }, () => '<li></li>').join('');
    }
    [...dots.children].forEach((dot, index) => dot.classList.toggle('is-home', index < gathering.stats.home));
    byId('chip-home').textContent = `${gathering.stats.home} of ${gathering.total}`;
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
    this.garden.update(dt, snapshot, { aspect: this.session.camera.aspect, playing: true, showHands: true });
    if (this.clapUntil && performance.now() > this.clapUntil) {
      this.clapUntil = 0;
      if (this.garden.moving === 0) this.jozeDoes('jozeWaits');
    }
    if (this.garden.moving === 0 && this.joze.playing?.name === 'walk') this.jozeDoes('jozeWaits');
    this.idleFor += dt;
    const filming = this.session.playSeconds < FILM_SECONDS && this.gathering.stats.home === 0;
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
    this.garden.update(dt, snapshot, { aspect: this.session.camera.aspect, showHands: counting });
  }

  render() {
    this.garden.render();
  }

  prompt(snapshot, dt) {
    const { session, garden } = this;
    const needed = session.handsPrompt(snapshot, dt);
    // Closing the hand is part of this game, so it isn't asked to open unless it's time to.
    if (needed && !needed.key.startsWith('closed')) return needed;
    // Once they've got the idea, these only come back if they seem to have stopped.
    if (garden.holding && (this.gathering.stats.home === 0 || this.idleFor > HINT_AFTER_SECONDS)) {
      return { key: 'bring', text: OPEN_ON_WEB, side: null };
    }
    const playing = garden.spiders.some((spider) => garden.catchable(spider));
    if (!garden.holding && playing && this.idleFor > HINT_AFTER_SECONDS) return { key: 'close-on-one', text: CLOSE_ON_ONE, side: null };
    return null;
  }

  finished() {
    this.session.sound.stopLoop('birds');
    this.story.hide();
    this.joze.hide();
  }

  summary() {
    return { hero: this.gathering.stats.home, noun: 'game', rows: { home: this.garden.home } };
  }
}

const total = placesAt(1).reduce((sum, { count }) => sum + count, 0);

new GameSession({
  shell: {
    title: 'Spider Catcher',
    startLabel: 'Catch the spiders',
    againLabel: 'Play again',
    finishTitle: ALL_HOME,
    heroMark: '🏡',
    heroNoun: 'spiders brought home',
    extraRows: [{ id: 'home', label: 'Spiders home' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span class="chip-label">Home</span><span id="chip-home" class="chip-value">0 of ${total}</span></div>
        </div>
      </div>
      <ol id="spider-dots" class="spider-dots" aria-hidden="true"></ol>
      ${STORY_BOX}
      <div class="film" aria-hidden="true">
        <svg viewBox="0 0 220 220">
          <g class="film-web">
            <circle cx="50" cy="96" r="34" />
            <circle cx="50" cy="96" r="20" />
            <path d="M50 62v68M16 96h68M26 72l48 48M74 72l-48 48" />
          </g>
          <g class="film-spider">
            <path class="film-legs" d="M150 60h-20M150 66l-18 8M190 60h20M190 66l18 8" />
            <circle class="film-body" cx="170" cy="62" r="18" />
            <circle class="film-eye" cx="164" cy="58" r="5" />
            <circle class="film-eye" cx="176" cy="58" r="5" />
          </g>
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
        <legend>How far to reach (how far the spiders play from their web)</legend>
        <label><input type="radio" name="reach" value="none"> Far</label>
        <label><input type="radio" name="reach" value="little"> Medium</label>
        <label><input type="radio" name="reach" value="lots"> Close</label>
      </fieldset>`,
  },
  defaults: { reach: 'little' },
  choices: { reach: String },
  tagline: (side) => `Joze’s little spiders ran off! Close your ${side} hand on one, carry it to its web, and open your hand to put it home.`,
  finishLine: ALL_HOME,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new Sound({ ...options, sounds }),
  createGame: (session) => new SpiderGame(session),
}).start();
