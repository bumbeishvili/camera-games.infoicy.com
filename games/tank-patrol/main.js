// Tank Patrol: robot tanks are rolling into Giraffe's valley, and he's riding in the child's tank to stop
// them. A closed hand drives the tank to where it points, and an open hand fires at any robot tank under
// the crosshair that the gun can reach. The story and rules are in patrol.js, the valley is in valley.js,
// and the picture is in field.js.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterById } from '../../core/body/roster.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { Field } from './field.js';
import { POWERS, PRIZES, Patrol, newsAt, readHand } from './patrol.js';
import { PatrolSound } from './patrol-sound.js';

// Each of these has a rendered voice file: see audio/voice/lines.json.
const GIRAFFE_ASKS = 'Robot tanks in my valley! Let’s stop them!';
const GIRAFFE_WAVING = 'Look! The little robot’s waving!';
const GIRAFFE_TICKLES = 'Ooh, that tickles!';
const GIRAFFE_ONE_MORE = 'One more tank!';
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
const TICKLES_AT_MOST = 2; // Giraffe only says this now and then.
const NAMES_AFTER_SECONDS = 1.3; // Names of new things wait until "GO!" has gone.

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
    window.addEventListener('resize', () => this.measureTop());
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

  /** What each level brings that's new, for the cards: see NEWS in patrol.js. */
  newAt(level) {
    return newsAt(level);
  }

  applySettings() {
    const { hands, language } = this.session.settings;
    this.field.configure({ side: hands, language });
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
    this.field.configure({ side: settings.hands, language: settings.language });
    this.field.reset(this.patrol);
    this.field.showMarks = true;
    this.powerShown = null;
    this.showHearts();
    this.showProgress();
    this.showHaul();
    this.showPower();
  }

  begin() {
    const { sound } = this.session;
    this.patrol.begin();
    sound.startPatrol();
    this.story.say('giraffe', GIRAFFE_ASKS);
    this.storyFor = STORY_SECONDS;
    this.field.child.cheer(1.6);
  }

  /* ---------- what happens ---------- */

  onEvent(event) {
    this.field.onEvent(event);
    const { sound } = this.session;
    const handlers = {
      shot: () => {
        // A triple shot's two side balls go with the middle one, which makes the one sound.
        if (!event.side) sound.shot();
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
      prize: () => {
        this.prizeSound();
        this.showHaul();
      },
      'chest-open': () => sound.crew(),
      'crate-got': () => sound.crew(),
      power: () => this.showPower(),
      'power-off': () => this.showPower(),
      bonk: () => sound.bump(),
      'shield-down': () => sound.stopped(),
      bubbled: () => sound.crew(),
      dig: () => sound.land(false),
      'pop-up': () => sound.land(false),
      split: () => sound.stopped(),
      'part-off': () => sound.stopped(),
      'cage-hit': () => sound.hit(),
      freed: () => {
        if (event.byChild) sound.crew();
        this.showHaul();
      },
    };
    handlers[event.type]?.();
    this.showProgress();
  }

  onStopped({ left, part }) {
    const { sound } = this.session;
    sound.stopped();
    if (left === 1 && !part) this.sayAsGiraffe(GIRAFFE_ONE_MORE, { quietly: true });
  }

  /** Prizes come in handfuls, so their twinkle isn't played for every one. */
  prizeSound() {
    const now = performance.now();
    if (now - (this.lastPrizeSound ?? 0) < 140) return;
    this.lastPrizeSound = now;
    this.session.sound.prize();
  }

  /** What's been picked up, on the chip at the top: only what this level has, and only once there's some. */
  showHaul() {
    const { patrol } = this;
    if (!patrol || this.preview) return;
    const chip = byId('chip-haul');
    chip.hidden = !patrol.plan.bolts;
    const haul = patrol.haul;
    for (const [key, value] of Object.entries(haul)) {
      const item = chip.querySelector(`[data-haul='${key}']`);
      item.hidden = key !== 'bolts' && value === 0;
      item.querySelector('.haul-count').textContent = String(value);
    }
    this.measureTop();
  }

  /** Where the chips along the top end, for what goes under them, as they can need a second row. */
  measureTop() {
    const bottom = Math.round(document.querySelector('.hud-top')?.getBoundingClientRect().bottom ?? 0);
    if (bottom > 0 && bottom !== this.topBottom) {
      this.topBottom = bottom;
      document.documentElement.style.setProperty('--hud-bottom', `${bottom}px`);
    }
  }

  /** The power-up that's on, with a bar that runs down. */
  showPower() {
    const { patrol } = this;
    const chip = byId('chip-power');
    const on = patrol && !this.preview ? [['fire', patrol.fireKind, patrol.power.fireLeft], ['magnet', patrol.power.magnetLeft > 0 && 'magnet', patrol.power.magnetLeft], ['slow', patrol.slowing && 'slow', patrol.power.slowLeft]].filter(([, name]) => name) : [];
    // Its name is in the language the voice speaks, which a grown-up can change in the middle of a round.
    const ka = this.session.settings.language === 'ka';
    const key = `${on.map(([, name]) => name).join(',')} ${ka}`;
    if (key !== this.powerShown) {
      this.powerShown = key;
      chip.hidden = !on.length;
      chip.querySelector('.chip-value').innerHTML = on.map(([slot, name]) => `<span class="power" data-power="${slot}"><span class="power-mark" aria-hidden="true">${POWERS[name].mark}</span><span class="power-bar"><span></span></span></span>`).join('');
      chip.querySelector('.chip-label').textContent = on.length === 1 ? (ka ? POWERS[on[0][1]].nameKa : POWERS[on[0][1]].name) : 'Power-ups';
      this.measureTop();
    }
    for (const [slot, name, left] of on) {
      const bar = chip.querySelector(`[data-power='${slot}'] .power-bar span`);
      if (bar) bar.style.width = `${Math.round((left / POWERS[name].seconds) * 100)}%`;
    }
  }

  onCrew() {
    this.session.sound.crew();
    if (!this.saidWaving) {
      this.saidWaving = true;
      this.sayAsGiraffe(GIRAFFE_WAVING);
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
      this.sayAsGiraffe(GIRAFFE_TICKLES, { quietly: true });
    }
  }

  onResting({ on }) {
    if (on) this.story.hide();
  }

  /** Giraffe says something, with his picture up for a moment. Quietly means only if nothing else is being said. */
  sayAsGiraffe(line, { quietly = false } = {}) {
    const { sound } = this.session;
    if (quietly && sound.currentVoice) return;
    this.story.say('giraffe', line);
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
    field.playing = session.playSeconds > NAMES_AFTER_SECONDS;
    field.update(dt, hand);
    this.showPower();
    this.measureIn = (this.measureIn ?? 0) - dt;
    if (this.measureIn <= 0) {
      this.measureIn = 0.5;
      this.measureTop();
    }
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
    field.playing = false;
    if (this.preview || counting) patrol.warmUp(dt);
    // Behind the finish, the crews carry on waving and Giraffe carries on cheering.
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
    // What the gun can fire at, as it fires: robot tanks that can be seen, and the cage, but not a
    // digger under the ground.
    const nearOne = patrol.targets.some((target) => patrol.inRange(target));
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
    const onHand = (value, other = 0) => ({ left: hands === 'left' ? value : other, right: hands === 'right' ? value : other });
    // What was picked up, from level 2 on, and any friend let out of a cage, from level 6.
    const { plan } = this.patrol;
    const haul = Object.entries(this.patrol.haul).filter(([key, value]) => key !== 'friends' && (value > 0 || key === 'bolts'));
    const prizes = haul.map(([key, value]) => `${PRIZES[key.slice(0, -1)].mark} ${value}`).join('  ');
    byId('sum-left-prizes').closest('tr').hidden = !plan.bolts;
    byId('sum-left-friends').closest('tr').hidden = !plan.cage;
    // Running out of hearts, which only Medium and Tough allow, means trying the same level again.
    return { hero: stats.stopped, noun: 'patrol', rows: { tanks: onHand(stats.stopped), prizes: onHand(plan.bolts ? prizes : '', ''), friends: onHand(stats.friends) }, won: this.patrol.state !== 'lost' };
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
    extraRows: [{ id: 'tanks', label: 'Tanks stopped' }, { id: 'prizes', label: 'Prizes' }, { id: 'friends', label: 'Friends freed' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span class="chip-label">Tanks left</span><span id="chip-left" class="chip-value">6</span></div>
          <div class="chip"><span class="chip-label">Stopped</span><span id="chip-stopped" class="chip-value">0</span></div>
          <div class="chip chip-hearts"><span class="chip-label">Hearts</span><span id="chip-hearts" class="chip-value"></span></div>
        </div>
        <div class="race-progress" aria-hidden="true"><div id="race-progress-fill" class="race-progress-fill"></div></div>
        <div class="chips chips-more">
          <div id="chip-haul" class="chip chip-haul" hidden><span class="chip-label">Prizes</span><span class="chip-value">${['bolts', 'gems', 'stars', 'friends'].map((key) => `<span class="haul" data-haul="${key}" ${key === 'bolts' ? '' : 'hidden'}><span aria-hidden="true">${{ bolts: '🔩', gems: '💎', stars: '🌟', friends: '🤗' }[key]}</span><span class="haul-count">0</span></span>`).join('')}</span></div>
          <div id="chip-power" class="chip chip-power" hidden><span class="chip-label">Power-up</span><span class="chip-value"></span></div>
        </div>
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
  tagline: (side) => `Robot tanks are rolling into Giraffe’s valley! Close your ${side} hand to drive, and open it to fire.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits([characterById('giraffe')]),
  createSound: (options) => new PatrolSound(options),
  createGame: (session) => new TankGame(session),
}).start();
