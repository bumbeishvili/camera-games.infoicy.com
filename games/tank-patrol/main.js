// Tank Patrol: robot tanks are rolling into Joze's valley, and he's riding in the child's tank to stop
// them. A closed hand drives the tank to where it points, and an open hand fires at any robot tank under
// the crosshair that the gun can reach. The story and rules are in patrol.js, the valley is in valley.js,
// and the picture is in field.js.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterById } from '../../core/body/roster.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { Field } from './field.js';
import { Patrol, readHand } from './patrol.js';
import { PatrolSound } from './patrol-sound.js';

// Each of these has a rendered voice file: see audio/voice/lines.json.
const JOZE_ASKS = 'Robot tanks in my valley! Let’s stop them!';
const JOZE_WAVING = 'Look! The little robot’s waving!';
const JOZE_TICKLES = 'Ooh, that tickles!';
const JOZE_ONE_MORE = 'One more tank!';
const FINISH = 'You saved the valley!';
const SO_CLOSE = 'So close!';
const CLOSE_TO_DRIVE = 'Close your hand to drive!';
const OPEN_TO_FIRE = 'Open your hand to fire!';
const TOO_FAR = 'Too far! Close your hand and drive closer!';
const LOOK_OUT = 'Look out! Drive away from the ring!';

const STORY_SECONDS = 3.2; // How long a character's picture stays up after speaking.
const FILM_AT_MOST_SECONDS = 45;
const FILM_AGAIN_AFTER_SECONDS = 11; // With nothing fired or driven for this long, it comes back.
const DRIVEN_ENOUGH = 8; // How far the tank has to have been driven to have got the idea.
const SHOTS_ENOUGH = 3; // And how many shots fired.
const TOO_FAR_PROMPT_SECONDS = 0.5;
const OPEN_PROMPT_SECONDS = 2.2; // Closed, with a tank in reach, and not driving anywhere.
const CLOSE_PROMPT_SECONDS = 4; // Open, with nothing in reach.
const SPOKEN_AT_MOST = 2; // Each prompt is spoken this many times in a game, and read after that.
const TICKLES_AT_MOST = 2; // Joze only says this now and then.

const byId = (id) => document.getElementById(id);
const HEART = '<svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C5 15.500 2 12 2 8a5.500 5.500 0 0 1 10-3 5.500 5.500 0 0 1 10 3c0 4-3 7.500-10 13z"/></svg>';

class TankGame {
  chimeOnOpen = false; // Hands open and close all the time here, so a chime would be noise.

  constructor(session) {
    this.session = session;
    this.story = new StoryBox(session);
    this.field = new Field(byId('game'), byId('marks'));
    this.patrol = null;
    this.storyFor = 0;
    this.filming = false;
    this.sinceAction = 0;
    this.openFor = 0;
    this.closedFor = 0;
    this.farFor = 0;
    this.spokenTimes = new Map();
    this.ticklesSaid = 0;
    this.saidWaving = false;
    this.applySettings();
    this.startPreview();
    const game = this;
    this.debug = {
      field: this.field,
      get patrol() {
        return game.patrol;
      },
      get game() {
        return game;
      },
    };
  }

  /** The valley behind the title, with robot tanks rolling about in it. Nothing's fired, or counted. */
  startPreview() {
    this.patrol = new Patrol({ tanks: 15, pace: 'slow', onEvent: (event) => this.field.onEvent(event) });
    this.field.reset(this.patrol);
    this.preview = true;
  }

  applySettings() {
    const { hands } = this.session.settings;
    this.field.configure({ side: hands });
    if (this.patrol) {
      const { reach, pace, tankLevel, driving } = this.session.settings;
      this.patrol.configure({ help: reach, pace, level: tankLevel, driving });
      this.showHearts();
    }
  }

  setHands() {
    this.applySettings();
  }

  /** Everything but the number of tanks can change in the middle of a game, which is for the next one. */
  settingChanged() {
    if (this.preview) return;
    this.applySettings();
  }

  /* ---------- a new game ---------- */

  /**
   * The robot tanks are on their way before the countdown has finished, so there's nothing to wait for.
   * level, from 1 to 10, makes it harder within the grown-up's choices: see levelPlan in patrol.js.
   */
  prepare(level = 1) {
    const { settings, sound } = this.session;
    this.story.hide();
    this.storyFor = 0;
    this.sinceAction = 0;
    this.openFor = 0;
    this.closedFor = 0;
    this.farFor = 0;
    this.spokenTimes.clear();
    this.ticklesSaid = 0;
    this.saidWaving = false;
    this.preview = false;
    sound.lost = false;
    this.patrol = new Patrol({
      tanks: settings.tanks,
      pace: settings.pace,
      level: settings.tankLevel,
      levelNumber: level,
      help: settings.reach,
      driving: settings.driving,
      onEvent: (event) => this.onEvent(event),
    });
    this.field.reset(this.patrol);
    this.field.configure({ side: settings.hands });
    this.field.showMarks = true;
    this.showHearts();
    this.showProgress();
  }

  begin() {
    const { sound } = this.session;
    this.patrol.begin();
    sound.startPatrol();
    this.story.say('joze', JOZE_ASKS);
    this.storyFor = STORY_SECONDS;
    this.field.child.cheer(1.6);
  }

  /* ---------- what happens ---------- */

  onEvent(event) {
    this.field.onEvent(event);
    const { sound } = this.session;
    const handlers = {
      shot: () => {
        sound.shot();
        this.sinceAction = 0;
      },
      hit: () => sound.hit(),
      stopped: () => this.onStopped(event),
      crew: () => this.onCrew(),
      lob: () => sound.lob(),
      land: () => sound.land(event.hit),
      hurt: () => this.onHurt(event),
      healed: () => this.showHearts(),
      resting: () => this.onResting(event),
      won: () => this.end(FINISH),
      lost: () => this.onLost(),
    };
    handlers[event.type]?.();
    this.showProgress();
  }

  onStopped({ left }) {
    const { sound } = this.session;
    sound.stopped();
    if (left === 1) this.sayAsJoze(JOZE_ONE_MORE, { quietly: true });
  }

  onCrew() {
    this.session.sound.crew();
    if (!this.saidWaving) {
      this.saidWaving = true;
      this.sayAsJoze(JOZE_WAVING);
    }
  }

  onHurt({ hearts }) {
    this.showHearts(hearts);
    const chip = document.querySelector('.chip-hearts');
    chip.classList.remove('is-hurt');
    void chip.offsetWidth;
    chip.classList.add('is-hurt');
    if (this.ticklesSaid < TICKLES_AT_MOST && hearts > 0) {
      this.ticklesSaid += 1;
      this.sayAsJoze(JOZE_TICKLES, { quietly: true });
    }
  }

  onResting({ on }) {
    if (on) this.story.hide();
  }

  /** Joze says something, with his picture up for a moment. Quietly means only if nothing else is being said. */
  sayAsJoze(line, { quietly = false } = {}) {
    const { sound } = this.session;
    if (quietly && sound.currentVoice) return;
    this.story.say('joze', line);
    this.storyFor = STORY_SECONDS;
  }

  onLost() {
    const { session } = this;
    session.sound.lost = true;
    this.end(SO_CLOSE);
  }

  end(words) {
    const { session } = this;
    session.finishLine = words;
    document.querySelector('#screen-finish h2').textContent = session.translate(words);
    document.querySelector('.finish-hero').lastChild.textContent = this.patrol.stopped === 1 ? ' tank stopped' : ' tanks stopped';
    session.finish();
  }

  showProgress() {
    const { patrol } = this;
    if (!patrol || this.preview) return;
    byId('chip-left').textContent = String(patrol.left);
    byId('chip-stopped').textContent = String(patrol.stopped);
    byId('race-progress-fill').style.width = `${Math.round((patrol.stopped / patrol.total) * 100)}%`;
  }

  showHearts(hearts = this.patrol?.hearts) {
    const { patrol } = this;
    if (!patrol) return;
    const box = byId('chip-hearts');
    const most = patrol.level.hearts;
    if (box.children.length !== most) box.innerHTML = HEART.repeat(most);
    [...box.children].forEach((heart, index) => heart.classList.toggle('is-gone', index >= hearts));
  }

  /* ---------- every frame ---------- */

  /** What the hand is doing, which the meter on the screen says too. */
  readTheHand(snapshot) {
    const hand = readHand(snapshot);
    if (hand !== this.handShown) {
      this.handShown = hand;
      document.body.dataset.handRead = hand;
    }
    return hand;
  }

  update(dt, snapshot) {
    const { field, patrol, session } = this;
    const hand = this.readTheHand(snapshot);
    field.aspect = session.camera.aspect;
    const pointer = field.steer(dt, snapshot);
    patrol.update(dt, { hand, pointer });
    // The game may have just finished.
    if (session.screen !== 'playing') return;
    field.showMarks = true;
    field.update(dt, hand);
    session.sound.engine(patrol.tank.speed / patrol.pace.drive);

    this.sinceAction = patrol.firing || patrol.tank.speed > 1 ? 0 : this.sinceAction + dt;
    this.closedFor = hand === 'closed' ? this.closedFor + dt : 0;
    this.openFor = hand === 'open' ? this.openFor + dt : 0;
    this.farFor = patrol.look === 'far' ? this.farFor + dt : 0;
    if (this.storyFor > 0) {
      this.storyFor -= dt;
      if (this.storyFor <= 0) this.story.hide();
    }
    this.updateFilm();
  }

  /** The film stays up until the child has driven and fired, and comes back if they seem stuck. */
  updateFilm() {
    const { session, patrol } = this;
    const { stats } = patrol;
    const learning = (stats.driven < DRIVEN_ENOUGH || stats.shots < SHOTS_ENOUGH) && session.playSeconds < FILM_AT_MOST_SECONDS;
    // With no hand there's nothing to show it to, and being asked for the hand comes first.
    const stuck = this.sinceAction > FILM_AGAIN_AFTER_SECONDS && patrol.hand !== 'none';
    const filming = learning || stuck;
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
    const { field, patrol, session } = this;
    const counting = session.screen === 'countdown';
    const hand = this.readTheHand(snapshot);
    if (this.preview || counting) patrol.warmUp(dt);
    // Behind the finish, the crews carry on waving and Joze carries on cheering.
    else if (session.screen === 'finish') patrol.update(dt);
    field.showMarks = counting;
    if (counting) {
      field.aspect = session.camera.aspect;
      const pointer = field.steer(dt, snapshot);
      patrol.hand = hand;
      patrol.closedFor = hand === 'closed' ? patrol.closedFor + dt : 0;
      patrol.aim(dt, hand, pointer);
      field.update(dt, hand);
    } else {
      field.update(dt, 'none');
    }
  }

  render() {
    this.field.render();
  }

  /** A prompt is read as long as it's up, and spoken only for the first few times. */
  once(key, text) {
    if (this.lastPromptKey !== key) {
      this.lastPromptKey = key;
      this.spokenTimes.set(key, (this.spokenTimes.get(key) ?? 0) + 1);
    }
    return { key, text, side: null, silent: this.spokenTimes.get(key) > SPOKEN_AT_MOST };
  }

  prompt(snapshot, dt) {
    const { session, patrol } = this;
    const needed = session.handsPrompt(snapshot, dt);
    if (needed && !needed.key.startsWith('closed')) {
      this.lastPromptKey = null;
      return needed;
    }
    const hand = readHand(snapshot);
    // Nothing else says what the ring on the ground means.
    if (!patrol.autoDrive && patrol.underShell) return this.once('look-out', LOOK_OUT);
    if (patrol.resting && hand === 'closed') return this.once('resting', SPOKEN.resting);
    if (!patrol.autoDrive && this.farFor > TOO_FAR_PROMPT_SECONDS) return this.once('far', TOO_FAR);
    const nearOne = patrol.rolling.some((enemy) => patrol.inRange(enemy));
    if (hand === 'closed' && nearOne && !patrol.driving && this.closedFor > OPEN_PROMPT_SECONDS) return this.once('fire', OPEN_TO_FIRE);
    if (!patrol.autoDrive && hand === 'open' && !nearOne && this.openFor > CLOSE_PROMPT_SECONDS) return this.once('drive', CLOSE_TO_DRIVE);
    this.lastPromptKey = null;
    return null;
  }

  finished() {
    const { sound } = this.session;
    sound.stopPatrol();
    this.story.hide();
    this.field.showMarks = false;
    this.field.update(0, 'none');
  }

  summary() {
    const { stats } = this.patrol;
    const { hands } = this.session.settings;
    const onHand = (value) => ({ left: hands === 'left' ? value : 0, right: hands === 'right' ? value : 0 });
    // Running out of hearts, which only Medium and Tough allow, means trying the same level again.
    return { hero: stats.stopped, noun: 'patrol', rows: { tanks: onHand(stats.stopped) }, won: this.patrol.state !== 'lost' };
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;

new GameSession({
  shell: {
    title: 'Tank Patrol',
    startLabel: 'Climb aboard',
    againLabel: 'Go again',
    finishTitle: FINISH,
    heroMark: '⭐',
    heroNoun: 'tanks stopped',
    extraRows: [{ id: 'tanks', label: 'Tanks stopped' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span class="chip-label">Tanks left</span><span id="chip-left" class="chip-value">6</span></div>
          <div class="chip"><span class="chip-label">Stopped</span><span id="chip-stopped" class="chip-value">0</span></div>
          <div class="chip chip-hearts"><span class="chip-label">Hearts</span><span id="chip-hearts" class="chip-value"></span></div>
        </div>
        <div class="race-progress" aria-hidden="true"><div id="race-progress-fill" class="race-progress-fill"></div></div>
      </div>
      ${STORY_BOX}
      <div class="film" aria-hidden="true">
        <svg viewBox="0 0 220 220">
          <rect class="film-ground" width="220" height="220" />
          <path class="film-road" d="M30 140L100 92L190 50" />
          <g class="film-go-mark">
            <ellipse class="film-go-edge" cx="104" cy="88" rx="28" ry="21" />
            <ellipse class="film-go" cx="104" cy="88" rx="28" ry="21" />
          </g>
          <g class="film-robot">
            <rect class="film-treads" x="-27" y="4" width="54" height="13" rx="6" />
            <rect class="film-robot-body" x="-23" y="-16" width="46" height="24" rx="8" />
            <circle class="film-robot-eye" cx="-9" cy="-6" r="7" />
            <circle class="film-robot-eye" cx="9" cy="-6" r="7" />
            <circle class="film-pupil" cx="-10" cy="-5" r="3" />
            <circle class="film-pupil" cx="8" cy="-5" r="3" />
          </g>
          <g class="film-stars">
            <path class="film-star" d="M0-12l3.500 8 8.500 1-6.500 5.500 2 8.500-7.500-4.500-7.500 4.500 2-8.500L-11-3l8.500-1z" />
          </g>
          <g class="film-sight-mark">
            <circle class="film-sight-edge" cx="172" cy="44" r="32" />
            <circle class="film-sight" cx="172" cy="44" r="32" />
          </g>
          <g class="film-balls"><circle class="film-ball" r="5" /><circle class="film-ball" r="5" /><circle class="film-ball" r="5" /></g>
          <g class="film-tank">
            <rect class="film-treads" x="-28" y="8" width="56" height="14" rx="7" />
            <rect class="film-body" x="-24" y="-8" width="48" height="20" rx="7" />
            <g class="film-turret">
              <rect class="film-gun" x="10" y="-15" width="30" height="7" rx="3" transform="rotate(-34 10 -12)" />
            </g>
            <path class="film-neck" d="M-4-8L-8-34" />
            <path class="film-horns" d="M-14-46l-2-6M-4-46l2-6" />
            <ellipse class="film-head" cx="-9" cy="-40" rx="10" ry="8" />
            <circle class="film-eye" cx="-12" cy="-41" r="1.800" />
            <circle class="film-eye" cx="-5" cy="-41" r="1.800" />
          </g>
          <g class="film-hand">
            <rect x="28" y="168" width="44" height="36" rx="15" />
            <path d="M34 172V148" />
            <path d="M45 168V138" />
            <path d="M57 168V136" />
            <path d="M67 172V144" />
            <path class="film-thumb" d="M72 192L90 178" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>Driving</legend>
        ${choice('driving', 'closed', 'A closed hand drives the tank')}
        ${choice('driving', 'auto', 'By itself, towards any tank out of range, for a child who can’t close their hand easily')}
      </fieldset>
      <fieldset class="choice">
        <legend>Speed</legend>
        ${choice('pace', 'slow', 'Slow')}
        ${choice('pace', 'medium', 'Medium')}
        ${choice('pace', 'fast', 'Fast')}
      </fieldset>
      <fieldset class="choice">
        <legend>Reach help (the crosshair is pulled onto a tank near it)</legend>
        ${choice('reach', 'none', 'A little')}
        ${choice('reach', 'little', 'More')}
        ${choice('reach', 'lots', 'A lot')}
      </fieldset>
      <fieldset class="choice">
        <legend>How hard</legend>
        ${choice('tankLevel', 'gentle', 'Gentle: the shells are slow, and it can’t be lost')}
        ${choice('tankLevel', 'medium', 'Medium')}
        ${choice('tankLevel', 'tough', 'Tough')}
      </fieldset>
      <fieldset class="choice">
        <legend>Robot tanks to stop</legend>
        ${choice('tanks', '6', '6')}
        ${choice('tanks', '10', '10')}
        ${choice('tanks', '15', '15')}
      </fieldset>`,
  },
  defaults: { pace: 'slow', reach: 'little', driving: 'closed', tankLevel: 'gentle', tanks: 6 },
  choices: { pace: String, reach: String, driving: String, tankLevel: String, tanks: Number },
  tagline: (side) => `Robot tanks are rolling into Joze’s valley! Close your ${side} hand to drive, and open it to fire.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits([characterById('joze')]),
  createSound: (options) => new PatrolSound(options),
  createGame: (session) => new TankGame(session),
}).start();
