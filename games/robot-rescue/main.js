// Robot Rescue: robots have caught all the friends from the other games and locked them up around
// town. The child rides a little tram from place to place, and frees each friend by dealing with the
// robots there. An open hand fires at whatever is in the crosshair, and a closed hand raises a shield
// and reloads. The story and rules are in rescue.js, and the town and robots are in stage.js.
import { renderPortraits } from '../../core/body/portraits.js';
import { ROSTER } from '../../core/body/roster.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { Mission, readHand } from './rescue.js';
import { RescueSound } from './rescue-sound.js';
import { Stage } from './stage.js';

const OPEN_TO_FIRE = 'Open your hand to fire!';
const CLOSE_TO_RELOAD = 'Close your hand to reload!';
const CLOSE_FOR_SHIELD = 'Close your hand for the shield!';
const GOLD_STARS = 'Shoot the gold stars on the big robot!';
const FINISH = 'You saved everyone!';
const SO_CLOSE = 'So close!';
const JOZE_ASKS = 'Help! The robots caught all of us!';

const BY_THE_END = {
  won: { mark: '🎉', one: 'friend freed', many: 'friends freed' },
  lost: { mark: '🤖', one: 'robot dropped', many: 'robots dropped' },
};
const STORY_SECONDS = 3.2; // How long a character's picture stays up after speaking.
const FILM_AT_MOST_SECONDS = 40;
const FILM_AGAIN_AFTER_SECONDS = 12; // Without firing, it comes back.
const CLOSED_PROMPT_SECONDS = 1.6;
const SHIELD_PROMPT_CLOSE = 0.42; // How near the goo is to arriving before the child is told.
const SPOKEN_AT_MOST = 2; // Each prompt is spoken this many times in a game, and read after that.
const STARS_SHOWN_SECONDS = 4;
const GOT_IT_CLOSED_SECONDS = 0.4; // A closed hand held this long has plainly been done on purpose.
const BY_THE_WATER = new Set(['canal', 'harbour']);

const byId = (id) => document.getElementById(id);
const HEART = '<svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C5 15.500 2 12 2 8a5.500 5.500 0 0 1 10-3 5.500 5.500 0 0 1 10 3c0 4-3 7.500-10 13z"/></svg>';

class RescueGame {
  chimeOnOpen = false; // Hands open and close all the time here, so a chime would be noise.

  constructor(session) {
    this.session = session;
    this.story = new StoryBox(session);
    this.stage = new Stage(byId('game'), byId('sights'));
    this.mission = null;
    this.storyFor = 0;
    this.closedFor = 0;
    this.firedAgo = 0;
    this.filming = false;
    this.gotIt = { fired: false, closed: false };
    this.starsFor = 0;
    this.spokenTimes = new Map();
    this.wasShielding = false;
    this.ended = null;
    this.applySettings();
    this.startPreview();
    const game = this;
    this.debug = {
      stage: this.stage,
      get mission() {
        return game.mission;
      },
      get game() {
        return game;
      },
    };
  }

  /** The town behind the title, with robots marching about in it. Nothing's thrown, or counted. */
  startPreview() {
    const mission = new Mission({ pace: 'slow', onEvent: (event) => this.stage.onEvent(event) });
    this.stage.reset(mission);
    mission.start();
    this.mission = mission;
    this.preview = true;
  }

  applySettings() {
    const { hands, reach } = this.session.settings;
    this.stage.configure({ side: hands, reach });
  }

  setHands() {
    this.applySettings();
  }

  /** Speed and difficulty can change in the middle of a game. The number of stops is for the next. */
  settingChanged(change) {
    this.applySettings();
    if (this.preview) return;
    if ('pace' in change) this.mission.configure({ pace: change.pace });
    if ('rescueLevel' in change) {
      this.mission.configure({ level: change.rescueLevel });
      this.showHearts();
    }
    if ('reloading' in change) this.mission.configure({ reloading: change.reloading === 'on' });
  }

  /* ---------- a new game ---------- */

  /**
   * The robots are on their way before the countdown has finished, so there's nothing to wait for.
   * level, from 1 to 10, makes it harder within the grown-up's choices: see levelPlan in rescue.js.
   */
  prepare(level = 1) {
    const { settings } = this.session;
    this.applySettings();
    this.story.hide();
    this.storyFor = 0;
    this.closedFor = 0;
    this.firedAgo = 0;
    // With reloading off, closing the hand is only for the shield, and the film needn't wait for it.
    this.gotIt = { fired: false, closed: settings.reloading === 'off' };
    this.spokenTimes.clear();
    this.ended = null;
    this.saidStars = false;
    this.starsFor = 0;
    this.session.sound.lost = false;
    this.preview = false;
    this.mission = new Mission({
      stops: settings.stops,
      pace: settings.pace,
      level: settings.rescueLevel,
      levelNumber: level,
      reloading: settings.reloading !== 'off',
      onEvent: (event) => this.onEvent(event),
    });
    this.stage.reset(this.mission);
    this.mission.start();
    this.stage.showSights = true;
    this.showHearts();
    this.showProgress();
  }

  begin() {
    const { sound } = this.session;
    sound.startRide();
    this.story.say('joze', JOZE_ASKS);
    this.storyFor = STORY_SECONDS;
  }

  /* ---------- what happens ---------- */

  onEvent(event) {
    this.stage.onEvent(event);
    const { sound } = this.session;
    const handlers = {
      shot: () => {
        sound.shot();
        this.firedAgo = 0;
        this.gotIt.fired = true;
      },
      'robot-hit': () => sound.hit(),
      'spot-hit': () => sound.hit(),
      peek: () => sound.popUp(),
      hop: () => sound.popUp(),
      'robot-dropped': () => this.onDropped(event),
      'spot-open': () => this.onSpotOpen(),
      'spot-done': () => sound.spotDone(),
      goo: () => sound.gooThrown(),
      'goo-shot': () => sound.gooPopped(),
      'goo-blocked': () => {
        sound.gooBlocked();
        this.gotIt.closed = true;
      },
      'goo-hit': () => this.onGooHit(event),
      empty: () => sound.ranOut(),
      reloaded: () => {
        sound.reload();
        this.gotIt.closed = true;
      },
      freed: () => this.onFreed(event),
      moving: () => sound.bell(),
      arrived: () => this.showProgress(),
      won: () => this.end(FINISH),
      lost: () => this.onLost(),
    };
    handlers[event.type]?.();
    this.showProgress();
  }

  onDropped({ robot }) {
    const { sound } = this.session;
    if (robot.kind === 'big') sound.bigFallsApart();
    else sound.fallApart();
  }

  onSpotOpen() {
    const { sound } = this.session;
    sound.spotOpen();
    if (!this.saidStars) {
      this.saidStars = true;
      this.starsFor = STARS_SHOWN_SECONDS;
      sound.say(GOLD_STARS);
    }
  }

  onGooHit({ hearts }) {
    this.session.sound.gooHit();
    this.showHearts(hearts);
  }

  onFreed({ place, hearts }) {
    this.session.sound.cageOpens();
    this.story.say(place.who, place.thanks);
    this.storyFor = STORY_SECONDS;
    this.showHearts(hearts);
  }

  onLost() {
    this.session.sound.lost = true;
    this.end(SO_CLOSE);
  }

  /** The last words on the card. Not getting there counts what was done, and doesn't throw a party. */
  end(words) {
    this.ended = words;
    const { session } = this;
    const { mark, one, many } = BY_THE_END[words === SO_CLOSE ? 'lost' : 'won'];
    session.finishLine = words;
    document.querySelector('#screen-finish h2').textContent = session.translate(words);
    document.querySelector('#screen-finish .hero-mark').textContent = mark;
    document.querySelector('#screen-finish .finish-hero').lastChild.textContent = ` ${this.heroCount() === 1 ? one : many}`;
    session.finish();
  }

  showProgress() {
    const { mission } = this;
    if (!mission || this.preview) return;
    byId('chip-friends').textContent = `${mission.freed} of ${mission.stops.length}`;
    byId('chip-robots').textContent = String(mission.stats.robots);
    const here = mission.place ? mission.place.robots.length : 1;
    const share = mission.freed + (mission.phase === 'fighting' ? 1 - mission.leftHere / here : 0);
    byId('race-progress-fill').style.width = `${Math.round((share / mission.stops.length) * 100)}%`;
  }

  showHearts(hearts = this.mission?.hearts) {
    const { mission } = this;
    if (!mission) return;
    const box = byId('chip-hearts');
    const most = mission.level.hearts;
    if (box.children.length !== most) {
      box.innerHTML = HEART.repeat(most);
    }
    [...box.children].forEach((heart, index) => heart.classList.toggle('is-gone', index >= hearts));
  }

  /* ---------- every frame ---------- */

  update(dt, snapshot) {
    const { stage, mission, session } = this;
    const hand = readHand(snapshot);
    stage.showSights = true;
    stage.aspect = session.camera.aspect;
    const target = stage.steer(dt, snapshot);
    mission.update(dt, { hand, target });
    // The game may have just finished.
    if (session.screen !== 'playing') return;
    stage.update(dt, hand);
    if (hand === 'closed' && !this.wasShielding) session.sound.shieldUp();
    this.wasShielding = hand === 'closed';
    this.closedFor = hand === 'open' || hand === 'none' ? 0 : this.closedFor + dt;
    if (hand === 'closed' && this.closedFor > GOT_IT_CLOSED_SECONDS) this.gotIt.closed = true;
    this.firedAgo += dt;
    this.starsFor = Math.max(0, this.starsFor - dt);
    this.showShield(hand === 'closed');
    session.sound.setRide({ moving: mission.phase === 'moving', byWater: BY_THE_WATER.has(mission.place?.id) });
    if (this.storyFor > 0) {
      this.storyFor -= dt;
      if (this.storyFor <= 0) this.story.hide();
    }
    this.updateFilm();
  }

  /** Here a closed hand is doing something useful, so the meter says so: see style.css. */
  showShield(up) {
    const wanted = up ? 'up' : 'down';
    if (document.body.dataset.shield !== wanted) document.body.dataset.shield = wanted;
  }

  /** The film stays up until the child has fired and closed, and comes back if they've stopped firing. */
  updateFilm() {
    const { session, gotIt, mission } = this;
    const learning = !(gotIt.fired && gotIt.closed) && session.playSeconds < FILM_AT_MOST_SECONDS;
    const stuck = this.firedAgo > FILM_AGAIN_AFTER_SECONDS && mission.phase === 'fighting' && !mission.resting;
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
    const { stage, mission, session } = this;
    if (this.preview || session.screen === 'countdown') mission.warmUp(dt);
    const counting = session.screen === 'countdown';
    this.showShield(counting && readHand(snapshot) === 'closed');
    stage.aspect = session.camera.aspect;
    if (counting) stage.steer(dt, snapshot);
    stage.showSights = counting;
    stage.update(dt, counting ? readHand(snapshot) : 'none');
  }

  render() {
    this.stage.render();
  }

  /** A prompt is read as long as it's up, and spoken only for the first few times. */
  once(key, text) {
    const said = this.spokenTimes.get(key) ?? 0;
    if (this.lastPromptKey !== key) {
      this.lastPromptKey = key;
      this.spokenTimes.set(key, said + 1);
    }
    return { key, text, side: null, silent: said >= SPOKEN_AT_MOST };
  }

  prompt(snapshot, dt) {
    const { session, mission } = this;
    const needed = session.handsPrompt(snapshot, dt);
    if (needed && !needed.key.startsWith('closed')) {
      this.lastPromptKey = null;
      return needed;
    }
    const hand = readHand(snapshot);
    const fighting = mission.phase === 'fighting';
    if (fighting && mission.resting && hand === 'closed') return this.once('resting', SPOKEN.resting);
    if (hand === 'open' && mission.blaster.empty && mission.leftHere > 0) return this.once('reload', CLOSE_TO_RELOAD);
    if (fighting && hand !== 'closed' && mission.gooClose > SHIELD_PROMPT_CLOSE && !this.blockedOne()) return this.once('shield', CLOSE_FOR_SHIELD);
    if (fighting && hand === 'closed' && !mission.goo.length && this.closedFor > CLOSED_PROMPT_SECONDS) return this.once('fire', OPEN_TO_FIRE);
    // The words of what's just been said, for as long as it takes to find the first star.
    if (this.starsFor > 0) return { key: 'stars', text: GOLD_STARS, side: null, silent: true };
    this.lastPromptKey = null;
    return null;
  }

  /** Once the child has stopped a few with the shield, they don't need telling any more. */
  blockedOne() {
    return this.mission.stats.gooBlocked >= 2;
  }

  finished() {
    const { sound } = this.session;
    sound.stopRide();
    this.story.hide();
    this.stage.showSights = false;
    this.stage.update(0, 'none');
  }

  /** The big number on the card: friends freed, or robots dropped by someone who didn't quite get there. */
  heroCount() {
    const { stats } = this.mission;
    return this.ended === SO_CLOSE ? stats.robots : stats.friends;
  }

  summary() {
    const { stats } = this.mission;
    const { hands } = this.session.settings;
    const onHand = (value) => ({ left: hands === 'left' ? value : 0, right: hands === 'right' ? value : 0 });
    // Running out of hearts, which only Medium and Tough allow, means trying the same level again.
    const won = this.ended !== SO_CLOSE;
    return { hero: this.heroCount(), noun: 'rescue', rows: { robots: onHand(stats.robots), friends: onHand(stats.friends) }, won };
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;

new GameSession({
  shell: {
    title: 'Robot Rescue',
    startLabel: 'Ride to the rescue',
    againLabel: 'Go again',
    finishTitle: FINISH,
    heroMark: '🎉',
    heroNoun: 'friends freed',
    extraRows: [{ id: 'robots', label: 'Robots dropped' }, { id: 'friends', label: 'Friends freed' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span class="chip-label">Friends</span><span id="chip-friends" class="chip-value">0 of 5</span></div>
          <div class="chip"><span class="chip-label">Robots</span><span id="chip-robots" class="chip-value">0</span></div>
          <div class="chip chip-hearts"><span class="chip-label">Hearts</span><span id="chip-hearts" class="chip-value"></span></div>
        </div>
        <div class="race-progress" aria-hidden="true"><div id="race-progress-fill" class="race-progress-fill"></div></div>
      </div>
      ${STORY_BOX}
      <div class="film" aria-hidden="true">
        <svg viewBox="0 0 220 220">
          <rect class="film-sky" width="220" height="220" />
          <g transform="translate(150 66)">
            <g class="film-robot">
              <rect class="film-robot-body" x="-24" y="-22" width="48" height="46" rx="8" />
              <rect class="film-robot-body" x="-16" y="-44" width="32" height="24" rx="7" />
              <circle class="film-robot-face" cx="-7" cy="-33" r="6" />
              <circle class="film-robot-face" cx="7" cy="-33" r="6" />
              <circle class="film-robot-eye" cx="-7" cy="-32" r="2.500" />
              <circle class="film-robot-eye" cx="7" cy="-32" r="2.500" />
              <rect class="film-robot-face" x="-13" y="-10" width="26" height="16" rx="3" />
            </g>
            <g class="film-bits">
              <circle cx="-20" cy="-14" r="6" />
              <path d="M18-24l4 8 9 1-6 6 1 9-8-4-8 4 1-9-6-6 9-1z" />
              <circle cx="14" cy="14" r="5" />
              <circle cx="-14" cy="16" r="4" />
            </g>
            <g class="film-shots"><circle r="6" /><circle r="6" /><circle r="6" /></g>
            <g class="film-crosshair">
              <circle r="27" />
              <path d="M0-34v14M0 20v14M-34 0h14M20 0h14" />
            </g>
          </g>
          <g transform="translate(112 100)">
            <circle class="film-goo" r="17" />
          </g>
          <g class="film-shield">
            <circle class="film-shield-glass" cx="112" cy="118" r="58" />
            <path class="film-shield-star" d="M112 96l6 14 15 1-11 10 3 15-13-8-13 8 3-15-11-10 15-1z" />
          </g>
          <g class="film-hand">
            <g class="film-hand-shape">
              <rect x="28" y="168" width="44" height="36" rx="15" />
              <path d="M34 172V148" />
              <path d="M45 168V138" />
              <path d="M57 168V136" />
              <path d="M67 172V144" />
              <path class="film-thumb" d="M72 192L90 178" />
            </g>
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>How fast it all goes</legend>
        ${choice('pace', 'slow', 'Slow')}
        ${choice('pace', 'medium', 'Medium')}
        ${choice('pace', 'fast', 'Fast')}
      </fieldset>
      <fieldset class="choice">
        <legend>Reach help (the crosshair is pulled onto a robot near it)</legend>
        ${choice('reach', 'none', 'A little')}
        ${choice('reach', 'little', 'More')}
        ${choice('reach', 'lots', 'A lot')}
      </fieldset>
      <fieldset class="choice">
        <legend>Reloading (closing the hand fills the blaster)</legend>
        ${choice('reloading', 'on', 'On')}
        ${choice('reloading', 'off', 'Off: it never runs out, for a child who can’t close their hand easily')}
      </fieldset>
      <fieldset class="choice">
        <legend>How hard it is</legend>
        ${choice('rescueLevel', 'gentle', 'Gentle: the goo is slow, and it can’t be lost')}
        ${choice('rescueLevel', 'medium', 'Medium')}
        ${choice('rescueLevel', 'tough', 'Tough')}
      </fieldset>
      <fieldset class="choice">
        <legend>Stops on the way</legend>
        ${choice('stops', '3', 'Three')}
        ${choice('stops', '5', 'All five')}
      </fieldset>`,
  },
  defaults: { pace: 'slow', reach: 'little', reloading: 'on', rescueLevel: 'gentle', stops: 5 },
  choices: { pace: String, reach: String, reloading: String, rescueLevel: String, stops: Number },
  tagline: (side) => `Robots have caught your friends! Ride the tram through town. Open your ${side} hand to fire, and close it for your shield.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new RescueSound(options),
  createGame: (session) => new RescueGame(session),
}).start();
