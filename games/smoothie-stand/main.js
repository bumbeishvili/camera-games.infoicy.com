// Joze's Smoothie Stand: on the day of the Harvest Fair, everyone comes with an order, and the child
// slices what it needs with an open hand. The story and rules are in orders.js, and the fair is in
// field.js. It's right-handed unless a grown-up chooses the left.
import { renderPortraits } from '../../core/body/portraits.js';
import { ROSTER } from '../../core/body/roster.js';
import { GameSession } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { Stand } from './orders.js';
import { SmoothieField } from './field.js';

const HOW = 'Swipe through the fruit!';
const STICKY = 'Yuck! Keep your hand open to shake it off!';
const OPEN_TO_SLICE = { left: 'Open your left hand to slice!', right: 'Open your right hand to slice!' };
const WON = 'You won the Golden Cup!';

const NEXT_CUSTOMER_SECONDS = 1; // The fruit keeps flying, so nobody's waiting for this.
const LAST_THANKS_SECONDS = 2.8;
const HOW_AFTER_SECONDS = 5; // Time without slicing anything, before being told how.
const BUMP_PROMPT_SECONDS = 2.5;
const FILM_SECONDS = 14;

const byId = (id) => document.getElementById(id);

class SmoothieGame {
  chimeOnOpen = false; // Hands open and close all the time here, so a chime would be noise.

  constructor(session) {
    this.session = session;
    this.story = new StoryBox(session);
    this.stand = null;
    this.timer = 0;
    this.after = null;
    this.bump = null;
    this.idleFor = 0;
    this.saidSticky = false;
    this.field = new SmoothieField(byId('game'), {
      onSlice: (kind) => this.onSlice(kind),
      onBump: (side) => {
        this.bump = { side, at: session.playSeconds };
      },
      onShaken: () => session.sound.handsOpen(),
      // The first swipe on a tough fruit, from the higher levels: a crack, and one more to go.
      onCrack: () => {
        this.idleFor = 0;
        session.sound.play('chop', { gain: 0.5, rate: 1.25 });
      },
    });
    this.field.joze = Object.assign(new Image(), { src: session.portraits.joze });
    this.applySettings();
    const game = this;
    this.debug = {
      field: this.field,
      get stand() {
        return game.stand;
      },
    };
  }

  applySettings() {
    const { pace, slicing, hands } = this.session.settings;
    this.field.configure({ pace, slicing, side: hands });
  }

  setHands(side) {
    this.field.configure({ side });
  }

  settingChanged() {
    this.applySettings();
  }

  /** A new fair, at this level: see fairAt in orders.js for what each level brings. */
  prepare(level) {
    this.applySettings();
    this.field.setLevel(level);
    this.field.reset();
    this.story.hide();
    byId('order').replaceChildren();
    this.bump = null;
    this.idleFor = 0;
    this.saidSticky = false;
    this.stand = new Stand({
      short: this.session.settings.customers === 3,
      level,
      onEvent: (event) => this.onStandEvent(event),
    });
    this.field.nextFruit = () => this.stand.nextFruit();
    this.field.nextThrow = () => this.stand.nextThrow();
    this.showProgress();
  }

  /** Straight into it: the first order comes along with the first fruit. */
  begin() {
    this.field.throwing = true;
    this.field.throwIn = 0;
    this.stand.nextCustomer();
  }

  /** Does something after a while, in game time, so that the panel pauses it. */
  later(seconds, what) {
    this.timer = seconds;
    this.after = what;
  }

  /* ---------- what happens ---------- */

  onStandEvent(event) {
    const handlers = {
      customer: () => this.onCustomer(event),
      wanted: () => this.showOrder(),
      'order-done': () => this.onOrderDone(event),
      'day-over': () => this.session.finish(),
    };
    handlers[event.type]?.();
  }

  onCustomer({ customer }) {
    this.field.blenderLevel = 0;
    this.story.say(customer.who, customer.hello);
    this.showOrder();
    this.showProgress();
  }

  /** The ticket: a picture of each fruit that's wanted, and how many more. */
  showOrder() {
    const { stand, field } = this;
    const ticket = byId('order');
    const { order } = stand.customer;
    const made = (kind) => order[kind] - stand.left[kind];
    const items = Object.keys(order).map((kind) => {
      const item = document.createElement('span');
      item.className = 'order-item';
      item.dataset.fruit = kind;
      item.classList.toggle('is-done', stand.left[kind] === 0);
      const picture = document.createElement('img');
      picture.alt = '';
      picture.src = field.pictureOf(kind);
      const count = document.createElement('span');
      count.className = 'order-count';
      count.textContent = `${made(kind)} / ${order[kind]}`;
      item.append(picture, count);
      return item;
    });
    ticket.replaceChildren(...items);
    const box = ticket.getBoundingClientRect();
    field.tokenTarget = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const wanted = Object.values(order).reduce((sum, count) => sum + count, 0);
    const left = Object.values(stand.left).reduce((sum, count) => sum + count, 0);
    field.blenderLevel = (wanted - left) / wanted;
  }

  onSlice(kind) {
    const { sound } = this.session;
    sound.play('chop', { gain: 0.8, rate: 0.92 + Math.random() * 0.18 });
    this.idleFor = 0;
    const verdict = this.stand.slice(kind);
    if (verdict === 'wanted') sound.star();
    if (verdict === 'rotten' && !this.saidSticky) {
      this.saidSticky = true;
      sound.say(STICKY);
    }
    this.showProgress();
    return verdict;
  }

  onOrderDone({ customer }) {
    const { stand, field, session } = this;
    field.blenderSpin = 1.6;
    session.sound.play('mixer', { gain: 0.5 });
    this.showProgress();
    if (stand.index < stand.customers.length - 1) {
      this.later(NEXT_CUSTOMER_SECONDS, () => stand.nextCustomer());
      return;
    }
    field.throwing = false;
    this.story.say(customer.who, customer.thanks);
    this.later(LAST_THANKS_SECONDS, () => stand.nextCustomer());
  }

  showProgress() {
    const { stats, customers } = this.stand;
    byId('chip-smoothies').textContent = `${stats.smoothies} of ${customers.length}`;
    byId('race-progress-fill').style.width = `${Math.round((stats.smoothies / customers.length) * 100)}%`;
  }

  /* ---------- every frame ---------- */

  update(dt, snapshot) {
    if (this.after) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const what = this.after;
        this.after = null;
        what();
      }
    }
    this.idleFor += dt;
    this.field.update(dt, snapshot, { aspect: this.session.camera.aspect, slicing: true, showHands: true });
    const filming = this.session.playSeconds < FILM_SECONDS && this.stand.stats.wanted === 0;
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
    const counting = this.session.screen === 'countdown';
    this.field.update(dt, snapshot, { aspect: this.session.camera.aspect, showHands: counting });
  }

  render() {
    this.field.render();
  }

  prompt(snapshot, dt) {
    const { session, field } = this;
    const needed = session.handsPrompt(snapshot, dt);
    if (needed && !needed.key.startsWith('closed')) return needed;
    const { side } = snapshot;
    if (field.gloves[side].sticky > 0) return { key: `sticky-${side}`, text: STICKY, side: null, silent: true };
    if (this.bump && session.playSeconds - this.bump.at < BUMP_PROMPT_SECONDS) {
      return { key: `bump-${this.bump.side}`, text: OPEN_TO_SLICE[this.bump.side], side: this.bump.side };
    }
    if (field.throwing && this.idleFor > HOW_AFTER_SECONDS) return { key: 'how', text: HOW, side: null };
    return null;
  }

  finished() {
    this.story.hide();
    this.field.throwing = false;
  }

  summary() {
    const { smoothies, rotten } = this.stand.stats;
    const { hands } = this.session.settings;
    return {
      hero: smoothies,
      noun: 'fair',
      rows: { sliced: this.field.sliced, rotten: { left: hands === 'left' ? rotten : 0, right: hands === 'right' ? rotten : 0 } },
    };
  }
}

new GameSession({
  shell: {
    title: 'Joze’s Smoothie Stand',
    startLabel: 'Open the stand',
    againLabel: 'Another fair',
    finishTitle: WON,
    heroMark: '🥤',
    heroNoun: 'smoothies',
    extraRows: [{ id: 'sliced', label: 'Fruit sliced' }, { id: 'rotten', label: 'Rotten fruit' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span class="chip-label">Smoothies</span><span id="chip-smoothies" class="chip-value">0 of 6</span></div>
        </div>
        <div class="race-progress" aria-hidden="true"><div id="race-progress-fill" class="race-progress-fill"></div></div>
      </div>
      ${STORY_BOX}
      <div id="order" class="order" aria-hidden="true"></div>
      <div class="film" aria-hidden="true">
        <svg viewBox="0 0 220 220">
          <g class="film-apple">
            <circle cx="150" cy="90" r="34" />
            <path d="M150 58q2-14 12-20" />
          </g>
          <g class="film-halves">
            <path class="film-half-a" d="M116 90a34 34 0 0 1 68 0z" />
            <path class="film-half-b" d="M116 90a34 34 0 0 0 68 0z" />
          </g>
          <path class="film-swipe" d="M34 168Q110 110 200 34" />
          <g class="film-hand">
            <rect x="26" y="150" width="46" height="42" rx="16" />
            <path d="M32 156V128M43 152V118M55 152V116M66 156V124M72 176L90 162" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>How to slice</legend>
        <label><input type="radio" name="slicing" value="swipe"> A swipe of the open hand</label>
        <label><input type="radio" name="slicing" value="touch"> Just touching the fruit with an open hand, for slow or limited movement</label>
      </fieldset>
      <fieldset class="choice">
        <legend>How fast the fruit flies</legend>
        <label><input type="radio" name="pace" value="slow"> Slow</label>
        <label><input type="radio" name="pace" value="medium"> Medium</label>
        <label><input type="radio" name="pace" value="fast"> Fast</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Customers</legend>
        <label><input type="radio" name="customers" value="3"> Three</label>
        <label><input type="radio" name="customers" value="6"> All six</label>
      </fieldset>`,
  },
  defaults: { pace: 'slow', slicing: 'swipe', customers: 6 },
  choices: { pace: String, slicing: String, customers: Number },
  tagline: (side) => `It’s the Harvest Fair! Slice what the customers order, with your open ${side} hand.`,
  finishLine: WON,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new Sound({
    ...options,
    sounds: { chop: new URL('./audio/chop.ogg', import.meta.url), mixer: new URL('./audio/mixer.ogg', import.meta.url) },
  }),
  createGame: (session) => new SmoothieGame(session),
}).start();

