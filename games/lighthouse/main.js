// The Lighthouse Keeper: a storm has muddied the lighthouse windows and ships are lost at sea. Wiping
// a window clean with an open hand lets the light out, and brings one of them home. The story is in
// storm.js, and the room and the sea are in lamp-room.js.
import { renderPortraits } from '../../core/body/portraits.js';
import { ROSTER } from '../../core/body/roster.js';
import { GameSession } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { LampRoom } from './lamp-room.js';
import { Storm } from './storm.js';

const OPEN_TO_WIPE = 'Open your hand to wipe!';
const FINISH = 'You saved every ship!';

const NEXT_SHIP_SECONDS = 0.4;
const LAST_SHIP_SECONDS = 1.6;
const FILM_SECONDS = 16;
const CLOSED_PROMPT_SECONDS = 1.2;
const WAVES_LEVEL = 0.4;
const WIPE_LEVEL = 0.7;

const byId = (id) => document.getElementById(id);

class LighthouseGame {
  chimeOnOpen = false;

  constructor(session) {
    this.session = session;
    this.story = new StoryBox(session);
    this.storm = null;
    this.timer = 0;
    this.after = null;
    this.closedFor = 0;
    this.room = new LampRoom(byId('game'), { onSailed: () => this.onSailed() });
    this.applySettings();
    const game = this;
    this.debug = {
      room: this.room,
      get storm() {
        return game.storm;
      },
    };
  }

  applySettings() {
    const { hands, reach } = this.session.settings;
    this.room.configure({ side: hands, reach });
  }

  setHands() {
    this.applySettings();
  }

  settingChanged() {
    this.applySettings();
  }

  later(seconds, what) {
    this.timer = seconds;
    this.after = what;
  }

  /** A new storm, at this level: see stormAt in storm.js for what each level brings. */
  prepare(level) {
    this.applySettings();
    this.story.hide();
    this.room.mud = null;
    this.room.setBoat(null);
    this.room.boat = null;
    this.room.calm = 0;
    this.room.shownCalm = 0;
    this.storm = new Storm({
      ships: this.session.settings.ships,
      level,
      onEvent: (event) => this.onStorm(event),
    });
    this.room.swell = this.storm.level.swell;
    this.room.lumps = this.storm.lumps;
    this.showProgress();
  }

  begin() {
    const { sound } = this.session;
    sound.startLoop('waves', WAVES_LEVEL);
    sound.startLoop('wipe', 0);
    this.room.muddy();
    this.storm.nextShip();
  }

  onStorm(event) {
    const handlers = {
      ship: () => this.onShip(event),
      'window-clean': () => this.onWindowClean(),
      splat: () => this.room.splat(event),
      lump: () => {
        this.room.lumps = this.storm.lumps;
      },
      'lump-off': () => {
        this.room.lumps = this.storm.lumps;
        this.room.dropLump(event.lump);
        this.session.sound.handsOpen();
      },
      'ship-home': () => this.onShipHome(),
      'all-home': () => this.onAllHome(),
    };
    handlers[event.type]?.();
  }

  onShip({ ship }) {
    if (!this.room.mud) this.room.muddy();
    this.room.setBoat(ship.boat);
    this.room.lumps = this.storm.lumps;
    this.story.say(ship.who, ship.ask);
    this.showProgress();
  }

  onWindowClean() {
    const { sound } = this.session;
    this.room.clearMud();
    sound.play('horn', { gain: 0.5 });
    sound.handsOpen();
    this.story.say(this.storm.ship.who, this.storm.ship.thanks);
    this.room.sailHome();
  }

  onSailed() {
    this.storm.shipHome();
  }

  onShipHome() {
    this.room.calm = this.storm.calm;
    this.room.boat = null;
    this.showProgress();
    this.later(NEXT_SHIP_SECONDS, () => this.storm.nextShip());
  }

  onAllHome() {
    this.room.calm = 1;
    this.later(LAST_SHIP_SECONDS, () => this.session.finish());
  }

  showProgress() {
    const { storm } = this;
    byId('chip-ships').textContent = `${storm.home} of ${storm.ships.length}`;
    const windowShare = storm.mud && storm.index >= 0 && storm.index < storm.ships.length ? storm.mud.share : 0;
    byId('race-progress-fill').style.width = `${Math.round(((storm.home + Math.min(1, windowShare) * 0.999) / storm.ships.length) * 100)}%`;
  }

  wipe = (x, y, sizeX, sizeY, moved) => this.storm.wipe(x, y, sizeX, sizeY, moved);

  update(dt, snapshot) {
    if (this.after) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const what = this.after;
        this.after = null;
        what();
      }
    }
    const { room, storm } = this;
    storm.update(dt, { still: room.reducedMotion });
    // Only with a ship waiting, so that the story is heard first.
    const wiping = Boolean(storm.ship) && Boolean(room.mud) && !room.mudFading && room.sailing === 0;
    room.update(dt, snapshot, { aspect: this.session.camera.aspect, wiping, showHands: true, wipe: this.wipe });
    this.session.sound.setLoopLevel('wipe', wiping ? room.wipeSpeed * WIPE_LEVEL : 0);
    this.showProgress();
    const glove = room.gloves[room.side];
    this.closedFor = wiping && glove.visible && glove.status !== 'open' ? this.closedFor + dt : 0;
    const filming = this.session.playSeconds < FILM_SECONDS && storm.home === 0 && (!storm.mud || storm.mud.share < 0.2);
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
    this.room.update(dt, snapshot, { aspect: this.session.camera.aspect, showHands: counting });
  }

  render() {
    this.room.render();
  }

  prompt(snapshot, dt) {
    const { session } = this;
    const needed = session.handsPrompt(snapshot, dt);
    if (needed && !needed.key.startsWith('closed')) return needed;
    if (this.closedFor > CLOSED_PROMPT_SECONDS) return { key: 'open-to-wipe', text: OPEN_TO_WIPE, side: null };
    return null;
  }

  finished() {
    const { sound } = this.session;
    sound.stopLoop('waves');
    sound.stopLoop('wipe');
    this.story.hide();
  }

  summary() {
    const { home } = this.storm;
    const { hands } = this.session.settings;
    return { hero: home, noun: 'storm', rows: { ships: { left: hands === 'left' ? home : 0, right: hands === 'right' ? home : 0 } } };
  }
}

new GameSession({
  shell: {
    title: 'The Lighthouse Keeper',
    startLabel: 'Climb the lighthouse',
    againLabel: 'Another storm',
    finishTitle: FINISH,
    heroMark: '⛵',
    heroNoun: 'ships home',
    extraRows: [{ id: 'ships', label: 'Ships brought home' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span class="chip-label">Ships home</span><span id="chip-ships" class="chip-value">0 of 4</span></div>
        </div>
        <div class="race-progress" aria-hidden="true"><div id="race-progress-fill" class="race-progress-fill"></div></div>
      </div>
      ${STORY_BOX}
      <div class="film" aria-hidden="true">
        <svg viewBox="0 0 220 220">
          <rect class="film-glass" x="14" y="24" width="192" height="172" rx="14" />
          <rect class="film-mud" x="14" y="24" width="192" height="172" rx="14" />
          <g class="film-wiper">
            <rect x="40" y="96" width="46" height="42" rx="16" />
            <path d="M46 102V74M57 98V64M69 98V62M80 102V70M86 122L104 108" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>Size of the window, which is how far there is to reach</legend>
        <label><input type="radio" name="reach" value="none"> Big</label>
        <label><input type="radio" name="reach" value="little"> Medium</label>
        <label><input type="radio" name="reach" value="lots"> Small</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Ships to bring home</legend>
        <label><input type="radio" name="ships" value="2"> Two</label>
        <label><input type="radio" name="ships" value="4"> All four</label>
      </fieldset>`,
  },
  defaults: { reach: 'little', ships: 4 },
  choices: { reach: String, ships: Number },
  tagline: (side) => `Ships are lost in the storm! Wipe the mud off the lighthouse windows with your open ${side} hand, and bring them home.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new Sound({
    ...options,
    sounds: {
      wipe: new URL('./audio/wipe.ogg', import.meta.url),
      horn: new URL('./audio/horn.ogg', import.meta.url),
      waves: new URL('./audio/waves.ogg', import.meta.url),
    },
  }),
  createGame: (session) => new LighthouseGame(session),
}).start();
