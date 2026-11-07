// Cannon Bay: pirates have come for the island's treasure, and Captain Joze asks the child to drive them
// off. One hand does it all. Moving it from side to side turns the ship's wheel, opening it raises the
// sails, and the cannons fire by themselves at any pirate ship in a firing zone. This file runs it from
// start to finish. The rules are in battle.js, the picture is in sea.js, and the ships are in ships.js.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { BaySound } from './bay-sound.js';
import { Battle, HEARTS, MOST_AT_ONCE } from './battle.js';
import { Bay } from './sea.js';

// Every one of these has a rendered voice file: see audio/voice/lines.json.
const MISSION = 'Pirates want our treasure! Help me drive them off!';
const OPEN_TO_SAIL = 'Open your hand to raise the sails!';
const TURN_WHEEL = 'Move your hand side to side to turn the wheel!';
const SAIL_BESIDE = 'Sail beside them! The cannons fire by themselves!';
const BYE_BYE = 'Bye bye! They’re rowing home!';
const ONE_LEFT = 'One more to go!';
const TURN_BACK = 'Back to the island!';
const WON = 'You drove them all off! The treasure is safe!';
const LOST = 'So close! Sail again!';

// Each captain's one line, in their own voice, as they come near.
const CAPTAINS = {
  truffle: 'Oink! That treasure smells delicious!',
  kit: 'Kit here! Your treasure is mine!',
  mochi: 'Hop hop! Hand over the treasure!',
  widget: 'Beep! Treasure found! Boop!',
  frost: 'Frost here! Let’s have a snowball fight!',
  bramble: 'Bramble here! Is the treasure honey?',
  nova: 'Meow! That treasure shines like the stars!',
  cinder: 'Cinder here! I’m all fired up!',
  tur: 'Tur here! Nobody sails like a mountain goat!',
};

const DEFAULTS = { bayPace: 'slow', bayCannons: 'open', bayLevel: 'gentle', bayShips: 6 };
const CHOICES = { bayPace: String, bayCannons: String, bayLevel: String, bayShips: Number };

const AFTER_WIN_SECONDS = 2.2; // A moment to see Joze cheering, after the last ship has gone down.
const AFTER_LOST_SECONDS = 1.4;
const STORY_SECONDS = 4.4;
const CAPTAIN_SPEAKS_WITHIN = 280;
const CAPTAIN_SPEAKS_EVERY = 14; // Children are here to move, and nobody's waiting to listen.
const FIRST_CAPTAIN_AFTER = 5;
const BYE_EVERY = 3; // Ships between one bit of praise and the next.
const OPEN_PROMPT_AFTER = 0.8;
const RESTING_PROMPT_AFTER = 15;
const LIMIT_PROMPT_FROM = 0.3;
const WHEEL_TURNS_DEGREES = 135;
const MARK_MARGIN = 74;
const MARK_TOP = 128;

// When the film of what to do comes up: until the child has done it for this long, and again if they
// seem stuck.
const SAILS_LEARNED_SECONDS = 2;
const WHEEL_LEARNED_SECONDS = 1.2;
const WHEEL_USED_FROM = 0.3;
const CLOSED_STUCK_SECONDS = 6;
const WHEEL_STUCK_SECONDS = 15;
const FILM_SHOWN_AT_LEAST = 3;
const WHEEL_PROMPT_SECONDS = 8; // The words about the wheel, which go away before the film does.
const BESIDE_AFTER_SECONDS = 9;
const BESIDE_SHOWN_FOR = 5;
const BESIDE_AGAIN_AFTER = 30;

const byElement = (id) => document.getElementById(id);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

class CannonBay {
  chimeOnOpen = false; // The sails going up have their own sound.

  constructor(session) {
    this.session = session;
    this.story = new StoryBox(session);
    this.pirateSpecs = ROSTER.filter(({ id }) => id !== 'joze');
    this.bay = new Bay(byElement('game'), characterWithId('joze'), this.pirateSpecs);
    this.buildMarks();
    this.buildWheel();
    this.lastShown = {};
    this.resetHelp();
    this.makeBattle();
    // A fine sight on the title screen, with its sails up.
    this.battle.sails = 1;
    const game = this;
    this.debug = {
      bay: this.bay,
      get battle() {
        return game.battle;
      },
      get game() {
        return game;
      },
    };
  }

  makeBattle() {
    const { bayShips, bayPace, bayLevel, bayCannons } = this.session.settings;
    // A different lot of captains each time, when there are fewer ships than characters.
    this.order = shuffled(this.pirateSpecs.map(({ id }) => id)).slice(0, bayShips);
    this.battle = new Battle({ ships: bayShips, pace: bayPace, level: bayLevel, cannons: bayCannons, onEvent: (event) => this.onBattle(event) });
    this.bay.setBattle(this.battle, this.order);
    this.buildCaptainsRow();
    this.lastShown = {};
    this.endIn = null;
    this.saidBye = 0;
    for (const mark of this.marks) mark.root.dataset.where = 'none';
  }

  resetHelp() {
    this.openFor = 0;
    this.wheelFor = 0;
    this.sinceWheel = 0;
    this.sinceFired = 0;
    this.filmHeld = 0;
    this.film = null;
    this.wheelPromptLeft = 0;
    this.storyLeft = 0;
    this.nextCaptainIn = 0;
    this.besideShown = 0;
    this.firedYet = false;
    document.body.dataset.film = 'off';
    delete document.body.dataset.filmPart;
  }

  settingChanged(change) {
    const { battle } = this;
    if ('bayPace' in change) battle.setPace(change.bayPace);
    if ('bayLevel' in change) {
      battle.setLevel(change.bayLevel);
      this.bay.shapeZones();
    }
    if ('bayCannons' in change) battle.cannons = change.bayCannons;
    if ('bayShips' in change && battle.state === 'ready') this.makeBattle();
  }

  /* ---------- the round ---------- */

  prepare() {
    this.resetHelp();
    this.story.hide();
    this.makeBattle();
    this.bay.setSailing(true);
    this.session.sound.startSea();
    this.updateHud();
  }

  begin() {
    this.battle.begin();
    this.say('joze', MISSION);
    this.nextCaptainIn = FIRST_CAPTAIN_AFTER;
  }

  resume() {
    this.session.sound.startSea();
  }

  enterCheck() {
    // A hand check in the middle of a battle: everything waits for it.
    this.session.sound.sailing(0, 0);
  }

  /** The hand as the rules need it. Anything that can't be properly read fails closed. */
  readHand(snapshot) {
    const hand = snapshot[snapshot.side];
    const readable = hand.status !== 'missing' && !snapshot.overlap && (hand.reason === null || hand.reason === 'closed');
    return { steer: snapshot.steer, drive: snapshot.drive, open: snapshot.handOpen === true, seen: readable };
  }

  update(dt, snapshot) {
    const { battle, session } = this;
    const input = this.readHand(snapshot);
    const wasOpen = battle.open;
    battle.update(dt, input);
    if (input.open && !wasOpen) session.sound.sailsUp();
    this.bay.update(dt);

    session.sound.sailing(battle.speed / battle.pace.speed, battle.sails);
    this.updateWheel(snapshot);
    this.updateHud();
    this.updateMarks();
    this.updateHelp(dt, snapshot);
    this.updateStory(dt);

    if (this.endIn !== null) {
      this.endIn -= dt;
      if (this.endIn <= 0) {
        this.endIn = null;
        session.finish();
      }
    }
  }

  idle(dt, snapshot) {
    const { battle, session } = this;
    // The sails already answer the hand in the hand check and the countdown, and the wheel does too.
    const screen = session.screen;
    if (battle.state === 'ready') {
      if (screen === 'check' || screen === 'countdown') {
        const input = this.readHand(snapshot);
        battle.update(dt, input);
        this.updateWheel(snapshot);
      }
    } else if (battle.state !== 'sailing') {
      battle.update(dt, {});
    }
    this.bay.update(dt);
  }

  render() {
    this.bay.render();
  }

  finished() {
    const { session, battle } = this;
    session.sound.stopSea();
    this.story.hide();
    this.bay.setSailing(false);
    for (const mark of this.marks) mark.root.dataset.where = 'none';
    document.body.dataset.film = 'off';
    const line = battle.state === 'lost' ? LOST : WON;
    session.finishLine = line;
    document.querySelector('#screen-finish h2').textContent = session.translate(line);
  }

  summary() {
    const { beaten } = this.battle;
    const { hands } = this.session.settings;
    const { gold } = this.battle.stats;
    const count = (value) => ({ left: hands === 'left' ? value : 0, right: hands === 'right' ? value : 0 });
    return { hero: beaten, noun: 'battle', rows: { beaten: count(beaten), gold: count(gold) } };
  }

  /* ---------- what happens ---------- */

  onBattle(event) {
    const { bay, session, battle } = this;
    const { sound } = session;
    bay.onEvent(event);
    const away = (x, z) => Math.hypot(x - battle.x, z - battle.z);
    const handlers = {
      fire: () => {
        sound.cannon();
        this.firedYet = true;
      },
      'pirate-fire': () => sound.theirCannon(away(event.pirate.x, event.pirate.z)),
      splash: () => sound.splash(away(event.x, event.z), event.size),
      hit: () => sound.hit(away(event.x, event.z)),
      hurt: () => {
        sound.hurt();
        this.shakeHearts();
      },
      spawn: () => this.showCaptains(),
      gold: () => sound.gold(),
      beaten: () => this.onBeaten(event),
      won: () => {
        this.endIn = AFTER_WIN_SECONDS;
        sound.won();
      },
      lost: () => {
        this.endIn = AFTER_LOST_SECONDS;
      },
    };
    handlers[event.type]?.();
  }

  onBeaten({ pirate, left }) {
    const { sound } = this.session;
    sound.beaten(Math.hypot(pirate.x - this.battle.x, pirate.z - this.battle.z));
    this.showCaptains();
    if (left === 1) {
      sound.say(ONE_LEFT, { ifQuiet: true });
    } else if (left > 1 && this.saidBye % BYE_EVERY === 0) {
      this.say('joze', BYE_BYE, { ifQuiet: true });
    }
    this.saidBye += 1;
  }

  /** Who's speaking, with their picture and their words, which never holds anything up. */
  say(who, text, { ifQuiet = false } = {}) {
    const { sound } = this.session;
    if (ifQuiet && (sound.currentVoice || this.storyLeft > 0)) return false;
    this.story.say(who, text, { quietly: ifQuiet });
    if (ifQuiet) sound.say(text, { ifQuiet: true });
    this.storyLeft = STORY_SECONDS;
    return true;
  }

  /** A captain says their one line as they come near, as long as nobody else is talking. */
  updateStory(dt) {
    const { battle } = this;
    if (this.storyLeft > 0) {
      this.storyLeft -= dt;
      if (this.storyLeft <= 0) this.story.hide();
    }
    this.nextCaptainIn -= dt;
    if (this.nextCaptainIn > 0 || battle.state !== 'sailing' || battle.resting) return;
    const pirate = battle.afloat.find((each) => !each.spoke && Math.hypot(each.x - battle.x, each.z - battle.z) < CAPTAIN_SPEAKS_WITHIN);
    if (!pirate) return;
    const who = this.order[pirate.index % this.order.length];
    if (this.say(who, CAPTAINS[who], { ifQuiet: true })) {
      pirate.spoke = true;
      this.nextCaptainIn = CAPTAIN_SPEAKS_EVERY;
    }
  }

  /* ---------- what to do ---------- */

  /** A film of what to do, until the child has got the idea, and again if they seem stuck. */
  updateHelp(dt, snapshot) {
    const { battle, session } = this;
    const turning = Math.abs(snapshot.steer) > WHEEL_USED_FROM;
    if (snapshot.handOpen) this.openFor += dt;
    if (turning) this.wheelFor += dt;
    this.sinceWheel = turning ? 0 : this.sinceWheel + dt;
    this.sinceFired = battle.firing ? 0 : this.sinceFired + dt;

    const needsSails = this.openFor < SAILS_LEARNED_SECONDS || session.closedSeconds > CLOSED_STUCK_SECONDS;
    const needsWheel = this.wheelFor < WHEEL_LEARNED_SECONDS || (this.sinceWheel > WHEEL_STUCK_SECONDS && this.sinceFired > WHEEL_STUCK_SECONDS);
    const part = needsSails ? 'sails' : needsWheel ? 'wheel' : null;
    this.filmHeld -= dt;
    if (part !== this.film && (this.filmHeld <= 0 || part)) {
      this.film = part;
      this.filmHeld = FILM_SHOWN_AT_LEAST;
      document.body.dataset.film = part ? 'on' : 'off';
      if (part) document.body.dataset.filmPart = part;
      if (part === 'wheel') this.wheelPromptLeft = WHEEL_PROMPT_SECONDS;
    }
    if (this.film === 'wheel' && snapshot.handOpen) this.wheelPromptLeft -= dt;
    if (this.showingBeside) this.besideShown += dt;
    if (this.sinceFired > BESIDE_AGAIN_AFTER) this.besideShown = 0;
  }

  prompt(snapshot, dt) {
    const { session, battle } = this;
    this.showingBeside = false;
    const needed = session.handsPrompt(snapshot, dt);
    if (needed && !needed.key.startsWith('closed')) return needed;
    if (battle.state !== 'sailing') return null;
    if (!snapshot.handOpen) {
      if (session.closedSeconds > RESTING_PROMPT_AFTER) return { key: 'rest', text: SPOKEN.resting, side: null };
      if (session.closedSeconds > OPEN_PROMPT_AFTER) return { key: 'open-to-sail', text: OPEN_TO_SAIL, side: null };
      return null;
    }
    if (battle.atLimit > LIMIT_PROMPT_FROM) return { key: 'limit', text: TURN_BACK, side: null };
    if (this.film === 'wheel' && this.wheelPromptLeft > 0) return { key: 'turn-wheel', text: TURN_WHEEL, side: null };
    const pirateNear = battle.afloat.length > 0;
    if (pirateNear && session.playSeconds > BESIDE_AFTER_SECONDS && this.sinceFired > BESIDE_AFTER_SECONDS && this.besideShown < BESIDE_SHOWN_FOR) {
      this.showingBeside = true;
      return { key: 'beside', text: SAIL_BESIDE, side: null };
    }
    return null;
  }

  /* ---------- what's on the screen ---------- */

  buildWheel() {
    this.wheel = byElement('ship-wheel');
    this.wheelTurn = byElement('ship-wheel-turn');
  }

  updateWheel(snapshot) {
    const hand = snapshot[snapshot.side];
    const state = hand.status === 'missing' ? 'missing' : snapshot.handOpen ? 'open' : 'closed';
    if (this.lastShown.hand !== state) {
      this.lastShown.hand = state;
      this.wheel.dataset.hand = state;
    }
    const degrees = Math.round(this.battle.wheel * WHEEL_TURNS_DEGREES);
    if (this.lastShown.wheel !== degrees) {
      this.lastShown.wheel = degrees;
      this.wheelTurn.style.transform = `rotate(${degrees}deg)`;
    }
  }

  buildCaptainsRow() {
    const row = byElement('bay-captains');
    row.replaceChildren();
    this.captainFaces = this.order.map((id) => {
      const face = document.createElement('img');
      face.className = 'captain-face';
      face.alt = '';
      face.src = this.session.portraits?.[id] ?? '';
      face.dataset.who = id;
      row.append(face);
      return face;
    });
  }

  /** A row of the captains: those still to come are faint, and those beaten have a tick. */
  showCaptains() {
    const { battle } = this;
    const afloat = new Set(battle.afloat.map(({ index }) => index));
    this.captainFaces.forEach((face, index) => {
      face.dataset.state = index < battle.nextPirate ? (afloat.has(index) ? 'here' : 'beaten') : 'coming';
    });
  }

  updateHud() {
    const { battle, lastShown } = this;
    const { left, hearts } = battle;
    const { gold } = battle.stats;
    if (lastShown.left !== left) {
      lastShown.left = left;
      byElement('bay-left').textContent = String(left);
    }
    if (lastShown.gold !== gold) {
      lastShown.gold = gold;
      byElement('bay-gold').textContent = String(gold);
    }
    if (lastShown.hearts !== hearts) {
      lastShown.hearts = hearts;
      byElement('hearts').textContent = '♥'.repeat(Math.max(0, hearts)) + '♡'.repeat(HEARTS - Math.max(0, hearts));
    }
  }

  shakeHearts() {
    const hearts = byElement('hearts');
    hearts.classList.remove('is-hurt');
    void hearts.offsetWidth;
    hearts.classList.add('is-hurt');
  }

  buildMarks() {
    const holder = byElement('marks');
    this.marks = Array.from({ length: MOST_AT_ONCE }, () => {
      const root = document.createElement('div');
      root.className = 'mark';
      root.dataset.where = 'none';
      const face = document.createElement('img');
      face.className = 'mark-face';
      face.alt = '';
      const bar = document.createElement('span');
      bar.className = 'mark-bar';
      const fill = document.createElement('span');
      fill.className = 'mark-fill';
      bar.append(fill);
      const arrow = document.createElement('span');
      arrow.className = 'mark-arrow';
      root.append(bar, face, arrow);
      holder.append(root);
      return { root, face, fill, arrow, pirate: null };
    });
  }

  /** Over each ship that can be seen, its captain and health. For one that can't, an arrow says which way to steer. */
  updateMarks() {
    const { battle, bay, marks } = this;
    const pirates = battle.afloat;
    const { width, height } = bay;
    marks.forEach((mark, index) => {
      const pirate = pirates[index];
      if (!pirate) {
        mark.root.dataset.where = 'none';
        mark.pirate = null;
        return;
      }
      if (mark.pirate !== pirate) {
        mark.pirate = pirate;
        mark.face.src = this.session.portraits[this.order[pirate.index % this.order.length]];
      }
      const firedOn = battle.zones.left.target === pirate || battle.zones.right.target === pirate;
      mark.root.dataset.state = firedOn && battle.firing ? 'fired-on' : pirate.mode === 'side' ? 'hunting' : 'sailing';
      mark.fill.style.width = `${Math.round((pirate.hitsLeft / battle.level.shipHits) * 100)}%`;
      const seen = bay.project(pirate.x, 47, pirate.z);
      const low = bay.project(pirate.x, 0, pirate.z);
      if (!seen.behind && !low.behind && low.x > 0 && low.x < width && low.y > 0 && low.y < height) {
        mark.root.dataset.where = 'on';
        mark.root.style.transform = `translate(${Math.round(seen.x)}px, ${Math.round(clamp(seen.y, 70, height))}px)`;
        return;
      }
      // Round the edge of the screen, which way to turn. Behind is out at a bottom corner, rather than
      // in the middle where the ship is, so that it still says left or right.
      const off = bay.offCamera(pirate.x, pirate.z);
      const shown = clamp(off, -2.1, 2.1);
      const x = width / 2 + Math.sin(shown) * (width / 2 - MARK_MARGIN);
      const y = clamp(height / 2 - Math.cos(shown) * (height / 2 - MARK_MARGIN), MARK_TOP, height - MARK_MARGIN);
      mark.root.dataset.where = 'off';
      mark.root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      mark.arrow.style.transform = `rotate(${Math.round((shown * 180) / Math.PI - 90)}deg)`;
    });
  }
}

new GameSession({
  shell: {
    title: 'Cannon Bay',
    startLabel: 'Set sail!',
    againLabel: 'Sail again',
    finishTitle: WON,
    heroMark: '⚓',
    heroNoun: 'pirate ships beaten',
    extraRows: [{ id: 'beaten', label: 'Ships beaten' }, { id: 'gold', label: 'Gold picked up' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span class="chip-label">Pirates left</span><span id="bay-left" class="chip-value">6</span></div>
          <div class="chip bay-gold"><span class="chip-label">Gold</span><span id="bay-gold" class="chip-value">0</span></div>
          <div class="chip bay-hearts"><span class="chip-label">Hearts</span><span id="hearts" class="chip-value">♥♥♥♥♥</span></div>
        </div>
      </div>
      <div id="bay-captains" class="bay-captains" aria-hidden="true"></div>
      <div id="marks" class="marks" aria-hidden="true"></div>
      ${STORY_BOX}
      <div id="ship-wheel" class="ship-wheel" data-hand="missing" aria-hidden="true">
        <svg viewBox="0 0 200 200">
          <circle class="wheel-state" cx="100" cy="100" r="96" />
          <g id="ship-wheel-turn" class="wheel-turn">
            <path class="wheel-spoke" d="M100 100V8M100 100V192M100 100H8M100 100H192M100 100L35 35M100 100L165 165M100 100L165 35M100 100L35 165" />
            <path class="wheel-spoke-light" d="M100 100V8M100 100V192M100 100H8M100 100H192M100 100L35 35M100 100L165 165M100 100L165 35M100 100L35 165" />
            <circle class="wheel-rim-ink" cx="100" cy="100" r="68" />
            <circle class="wheel-rim" cx="100" cy="100" r="68" />
            <circle class="wheel-rim-inner" cx="100" cy="100" r="68" />
            <circle class="wheel-hub" cx="100" cy="100" r="20" />
            <circle class="wheel-hub-middle" cx="100" cy="100" r="8" />
            <path class="wheel-top" d="M100 4l12 17H88z" />
          </g>
        </svg>
      </div>
      <div class="film" aria-hidden="true">
        <svg viewBox="0 0 220 220">
          <rect class="film-sky" width="220" height="108" />
          <rect class="film-water" y="96" width="220" height="124" />
          <g class="film-boat">
            <path class="film-mast" d="M74 92V22" />
            <path class="film-sail" d="M50 28h48l-4 52H54z" />
            <path class="film-hull" d="M34 86h82l-12 24H46z" />
          </g>
          <g class="film-small-wheel">
            <circle class="film-wheel-rim" cx="170" cy="56" r="27" />
            <path class="film-wheel-spokes" d="M170 22V90M136 56H204M146 32L194 80M194 32L146 80" />
            <circle class="film-wheel-hub" cx="170" cy="56" r="7" />
          </g>
          <g class="film-hand">
            <rect x="86" y="154" width="48" height="42" rx="16" />
            <path class="film-finger" d="M93 158V132" />
            <path class="film-finger" d="M105 154V120" />
            <path class="film-finger" d="M117 154V118" />
            <path class="film-finger" d="M128 158V128" />
            <path class="film-finger film-thumb" d="M134 178L152 162" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>Speed</legend>
        <label><input type="radio" name="bayPace" value="slow"> Slow</label>
        <label><input type="radio" name="bayPace" value="medium"> Medium</label>
        <label><input type="radio" name="bayPace" value="fast"> Fast</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Cannons</legend>
        <label><input type="radio" name="bayCannons" value="open"> Only with an open hand</label>
        <label><input type="radio" name="bayCannons" value="always"> Always, as long as the hand can be seen</label>
      </fieldset>
      <fieldset class="choice">
        <legend>How hard</legend>
        <label><input type="radio" name="bayLevel" value="gentle"> Gentle: big firing zones, and the ship can’t be sunk</label>
        <label><input type="radio" name="bayLevel" value="medium"> Medium</label>
        <label><input type="radio" name="bayLevel" value="tough"> Tough</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Ships to beat</legend>
        <label><input type="radio" name="bayShips" value="4"> 4</label>
        <label><input type="radio" name="bayShips" value="6"> 6</label>
        <label><input type="radio" name="bayShips" value="9"> 9</label>
      </fieldset>`,
  },
  defaults: DEFAULTS,
  choices: CHOICES,
  tagline: (side) => `Pirates have come for the island’s treasure! Open your ${side} hand to raise the sails, and move it to turn the wheel.`,
  finishLine: WON,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new BaySound(options),
  createGame: (session) => new CannonBay(session),
}).start();
