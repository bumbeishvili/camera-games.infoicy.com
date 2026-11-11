// The Lighthouse Keeper: a storm has muddied the lighthouse windows and ships are lost at sea. Wiping
// a window clean with an open hand lets the light out, and brings one of them home. The story is in
// storm.js, and the room and the sea are in lamp-room.js.
import { renderPortraits } from '../../core/body/portraits.js';
import { ROSTER } from '../../core/body/roster.js';
import { GameSession } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { LampRoom } from './lamp-room.js';
import { Storm, newAt } from './storm.js';

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
    const { hands, reach, language } = this.session.settings;
    this.room.configure({ side: hands, reach });
    // The names of new things are in the language the voice speaks, even if it changes mid-round.
    this.room.language = language;
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

  /** What's new at a level, for the title card and the countdown: see NEW_AT in storm.js. */
  newAt(level) {
    return newAt(level);
  }

  /** A new storm, at this level: see stormAt in storm.js for what each level brings. */
  prepare(level) {
    this.applySettings();
    this.story.hide();
    this.room.restart();
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
    this.room.storm = this.storm;
    this.room.night = this.storm.level.night;
    this.room.fresh = new Set(newAt(level).map(({ key }) => key));
    // Treasure only comes from level 2, so level 1 looks as it always did.
    const treasure = this.storm.level.shells > 0;
    byId('chip-treasure-box').hidden = !treasure;
    byId('sum-left-treasure').closest('tr').hidden = !treasure;
    this.showProgress();
  }


  /**
   * Where collected things fly to: the count at the top. It's looked up as they fly, as the count is still
   * hidden when play begins and can move if the screen changes, keeping the last place it was seen.
   */
  keepTallyMeasured(chip, target) {
    let seen = target.tallyAt ?? { x: 80, y: 40 };
    const look = () => {
      const box = chip.getBoundingClientRect();
      if (box.width > 0) seen = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      return seen;
    };
    target.tallyAt = {
      get x() {
        return look().x;
      },
      get y() {
        return look().y;
      },
    };
  }

  begin() {
    const { sound } = this.session;
    sound.startLoop('waves', WAVES_LEVEL);
    sound.startLoop('wipe', 0);
    this.room.muddy();
    this.keepTallyMeasured(byId('chip-treasure'), this.room);
    this.storm.nextShip();
  }

  onStorm(event) {
    const { room, session, storm } = this;
    // Where something on the glass is, for its name the first time it comes, while it's there.
    const on = (list, thing) => () => (list().includes(thing) ? room.onScreen(thing) : null);
    const born = room.time;
    const handlers = {
      ship: () => this.onShip(event),
      'window-clean': () => this.onWindowClean(),
      splat: () => {
        room.splat(event);
        room.introduce('splats', () => (room.time - born < 2 ? room.onScreen(event) : null));
      },
      'splat-bounced': () => room.bounce(event),
      lump: () => {
        room.lumps = this.storm.lumps;
        room.introduce(event.lump.kind, on(() => storm.lumps, event.lump));
      },
      'lump-off': () => {
        room.lumps = this.storm.lumps;
        room.dropLump(event.lump);
        session.sound.handsOpen();
      },
      'prize-out': () => {
        if (event.prize.kind === 'shell') room.introduce('shells', on(() => storm.prizes, event.prize));
      },
      prize: () => {
        room.prizeFlies(event.prize);
        session.sound.star();
        this.showProgress();
      },
      crab: () => room.introduce('crab', on(() => storm.crabs, event.crab)),
      'crab-caught': () => {
        room.crabLeaves(event.crab);
        session.sound.handsOpen();
      },
      // A crab nobody touched, letting go of its pearl as the window comes clean.
      'crab-off': () => room.crabLeaves(event.crab),
      'power-out': () => room.introduce(event.power.kind, on(() => storm.powers, event.power)),
      // Picked up before its name had its turn, a power-up is named beside its badge while it's on.
      power: () => {
        room.sparkle(event.power);
        room.introduce(event.power.kind, () => room.badgeAt(event.power.kind));
        session.sound.handsOpen();
      },
      // And the gull beside the gull, as it flies across.
      gull: () => {
        room.sparkle(event.power, '#ffffff');
        room.sendGull(event.y);
        room.introduce('gull', () => room.gullAt());
        session.sound.handsOpen();
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
    const { room } = this;
    room.clearMud();
    // The night sky, with its moon, is only all there to see once the first window is clean.
    if (this.storm.level.night) room.introduce('night', () => ({ x: room.window.x + room.window.width * (room.side === 'right' ? 0.84 : 0.16), y: room.window.y + room.window.height * 0.16 }));
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
    byId('chip-treasure').textContent = `🐚 ${storm.treasure}`;
    const windowShare = storm.mud && storm.index >= 0 && storm.index < storm.ships.length ? storm.mud.share : 0;
    byId('race-progress-fill').style.width = `${Math.round(((storm.home + Math.min(1, windowShare) * 0.999) / storm.ships.length) * 100)}%`;
  }

  wipe = (x, y, sizeX, sizeY, moved, how) => this.storm.wipe(x, y, sizeX, sizeY, moved, how);

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
    // Only with a ship waiting, so that the story is heard first.
    const wiping = Boolean(storm.ship) && Boolean(room.mud) && !room.mudFading && room.sailing === 0;
    storm.update(dt, { still: room.reducedMotion, hand: wiping ? room.handOnGlass() : null });
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
    if (this.closedFor > CLOSED_PROMPT_SECONDS) return { key: 'open-to-wipe', text: OPEN_TO_WIPE, side: null, asks: 'open' };
    return null;
  }

  finished() {
    const { sound } = this.session;
    sound.stopLoop('waves');
    sound.stopLoop('wipe');
    this.story.hide();
    this.room.labels = [];
  }

  summary() {
    const { home, treasure } = this.storm;
    const { hands } = this.session.settings;
    const byHand = (count) => ({ left: hands === 'left' ? count : 0, right: hands === 'right' ? count : 0 });
    return { hero: home, noun: 'storm', rows: { ships: byHand(home), treasure: byHand(treasure) } };
  }
}

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Wipe', closed: null },
  shell: {
    title: 'The Lighthouse Keeper',
    startLabel: 'Climb the lighthouse',
    againLabel: 'Another storm',
    finishTitle: FINISH,
    heroMark: '⛵',
    heroNoun: 'ships home',
    extraRows: [{ id: 'ships', label: 'Ships brought home' }, { id: 'treasure', label: 'Treasure found' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span class="chip-label">Ships home</span><span id="chip-ships" class="chip-value">0 of 4</span></div>
          <div id="chip-treasure-box" class="chip" hidden><span class="chip-label">Treasure</span><span id="chip-treasure" class="chip-value">🐚 0</span></div>
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
