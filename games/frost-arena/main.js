// Frost Arena: a match of tag with rifles in a snowy yard, the child's team in blue, with Giraffe on it, against
// the computer's in red. It's played with both hands, each with its own job. The hand in play holds the rifle:
// moving it from side to side turns to look, and opening it fires, by itself, at whoever is in the sights. The
// other hand is the helper: open, it walks the way the child is looking, and a fist stops and changes the
// magazine. The rules are in arena.js and the picture is in yard.js.
import { renderPortraits } from '../../core/body/portraits.js';
import { ROSTER } from '../../core/body/roster.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { ArenaSound } from './arena-sound.js';
import { HEALTH, MAGAZINE, Match, POWERS, RIFLES, TAGS_TO_WIN, newsAt, readHelper } from './arena.js';
import { Yard } from './yard.js';

// Each of these has a rendered voice file: see audio/voice/lines.json.
const GIRAFFE_STARTS = 'Tag the red team! I’m right beside you!';
const GIRAFFE_NICE = 'Nice one!';
const GIRAFFE_ONE_MORE = 'One more!';
const GIRAFFE_BACK = 'Back at our end! Off we go again!';
const FINISH = 'We won the match!';
const SO_CLOSE = 'So close!';
const OPEN_TO_FIRE = 'Open your hand to fire!';
const OPEN_TO_WALK = 'Open your other hand to walk!';
const FIST_TO_RELOAD = 'Make a fist with your other hand to reload!';
const FIND_THEM = 'Turn to find them! Follow the arrows!';

const STORY_SECONDS = 3.2; // How long a character's picture stays up after speaking.
const FILM_AT_MOST_SECONDS = 50;
const FILM_AGAIN_AFTER_SECONDS = 12; // With nothing fired or walked for this long, it comes back.
const WALKED_ENOUGH = 8; // How far the child has to have walked to have got the idea.
const SHOTS_ENOUGH = 6; // And how many shots fired, and one magazine changed by hand.
const FIRE_PROMPT_SECONDS = 1.6; // Someone in the sights, and the rifle hand not open.
const WALK_PROMPT_SECONDS = 6; // Nobody in view, and not walking.
const FIND_PROMPT_SECONDS = 5; // Nobody in view, however much walking.
const SPOKEN_AT_MOST = 2; // Each prompt is spoken this many times in a match, and read after that.
const NICE_EVERY = 3; // Giraffe only says well done for every third tag.

// What's over the head of someone special on the other team, on the higher levels.
const BADGES = { shield: '🛡️', runner: '💨', captain: '🎖️' };

const byId = (id) => document.getElementById(id);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

class ArenaGame {
  chimeOnOpen = false; // Hands open and close all the time here, so a chime would be noise.

  constructor(session) {
    this.session = session;
    this.story = new StoryBox(session);
    this.yard = new Yard(byId('game'));
    this.match = null;
    this.preview = false;
    this.storyFor = 0;
    this.filming = false;
    this.sinceAction = 0;
    this.lockedClosedFor = 0;
    this.standingFor = 0;
    this.nobodyFor = 0;
    this.spokenTimes = new Map();
    this.lastPromptKey = null;
    this.tagsSaid = 0;
    this.shown = {};
    this.marks = [];
    this.startPreview();
    const game = this;
    this.debug = {
      yard: this.yard,
      get match() {
        return game.match;
      },
      get game() {
        return game;
      },
    };
  }

  settings() {
    const { arenaTags, arenaPace, arenaLevel, arenaHelp, arenaRifle, arenaReload } = this.session.settings;
    return { tags: arenaTags, pace: arenaPace, level: arenaLevel, help: arenaHelp, rifle: arenaRifle, reload: arenaReload };
  }

  /** The yard behind the title, with both teams about in it. Nothing's counted, and nothing's heard. */
  startPreview() {
    this.match = new Match({ ...this.settings(), onEvent: (event) => this.yard.onEvent(event) });
    this.match.begin();
    this.yard.setMatch(this.match);
    this.preview = true;
    this.buildMarks();
  }

  /** What each level brings that's new, for the cards: see NEWS in arena.js. */
  newAt(level) {
    return newsAt(level);
  }

  setHands() {
    this.showHelper('none');
  }

  /** Everything but the rifle and the number of tags can change in the middle of a match: those are for the next one. */
  settingChanged() {
    if (this.preview) return;
    const { pace, level, help, reload } = this.settings();
    this.match.configure({ pace, level, help, reload });
  }

  /* ---------- a new match ---------- */

  prepare(level = 1) {
    const { sound } = this.session;
    this.story.hide();
    this.storyFor = 0;
    this.sinceAction = 0;
    this.lockedClosedFor = 0;
    this.standingFor = 0;
    this.nobodyFor = 0;
    this.spokenTimes.clear();
    this.lastPromptKey = null;
    this.tagsSaid = 0;
    this.preview = false;
    sound.lost = false;
    this.match = new Match({ ...this.settings(), levelNumber: level, onEvent: (event) => this.onEvent(event) });
    this.yard.setMatch(this.match);
    this.buildMarks();
    this.shown = {};
    this.showHud();
    this.showHelper('none');
    document.body.dataset.sight = 'none';
  }

  begin() {
    const { sound } = this.session;
    this.match.begin();
    sound.startMatch();
    this.sayAsGiraffe(GIRAFFE_STARTS);
  }

  /* ---------- what happens ---------- */

  onEvent(event) {
    this.yard.onEvent(event);
    const { sound } = this.session;
    const { match } = this;
    const { child } = match;
    const away = (trooper) => Math.hypot(trooper.x - child.x, trooper.z - child.z);
    const handlers = {
      shot: () => {
        sound.shot(event.by.rifle, { mine: event.by === child, away: away(event.by) });
        if (event.by === child) this.sinceAction = 0;
      },
      hit: () => {
        if (event.by === child) sound.hit();
        if (event.trooper === child) this.onHurt();
      },
      tagged: () => this.onTagged(event, away(event.trooper)),
      back: () => {
        if (event.trooper === child) this.sayAsGiraffe(GIRAFFE_BACK, { quietly: true });
      },
      empty: () => sound.empty(),
      reload: () => {
        if (event.trooper === child) sound.reload();
      },
      bonk: () => {
        if (event.by === child) sound.bonk();
      },
      star: () => {
        this.showHud();
        this.bump('chip-stars-box');
      },
      'crate-got': () => sound.crate(),
      resting: () => {
        if (event.on) this.story.hide();
      },
      won: () => this.end(FINISH),
      lost: () => {
        sound.lost = true;
        this.end(SO_CLOSE);
      },
    };
    handlers[event.type]?.();
  }

  onHurt() {
    this.session.sound.hurt();
    const bar = byId('chip-health-box');
    bar.classList.remove('is-hurt');
    void bar.offsetWidth;
    bar.classList.add('is-hurt');
  }

  onTagged({ trooper, by }, away) {
    const { sound } = this.session;
    const { match } = this;
    const mine = by === match.child;
    sound.tagged({ mine, away });
    if (trooper.team !== 1) return;
    this.bump('chip-blue-box');
    if (match.left === 1) this.sayAsGiraffe(GIRAFFE_ONE_MORE, { quietly: true });
    else if (mine && match.left > 1) {
      this.tagsSaid += 1;
      if (this.tagsSaid % NICE_EVERY === 1) this.sayAsGiraffe(GIRAFFE_NICE, { quietly: true });
    }
  }

  /** A score that's gone up grows a little and settles, a move rather than a flash. */
  bump(id) {
    const chip = byId(id);
    chip.classList.remove('is-up');
    void chip.offsetWidth;
    chip.classList.add('is-up');
  }

  /** Giraffe says something, with his picture up for a moment. Quietly means only if nothing else is being said. */
  sayAsGiraffe(line, { quietly = false } = {}) {
    const { sound } = this.session;
    if (quietly && sound.currentVoice) return;
    this.story.say('giraffe', line);
    this.storyFor = STORY_SECONDS;
  }

  end(words) {
    const { session } = this;
    session.finishLine = words;
    document.querySelector('#screen-finish h2').textContent = session.translate(words);
    session.finish();
  }

  /* ---------- the numbers along the top, the sights, and where everyone is ---------- */

  showHud() {
    const { match, shown } = this;
    if (!match || this.preview) return;
    const { child, score, goal } = match;
    const set = (key, value, apply) => {
      if (shown[key] === value) return;
      shown[key] = value;
      apply(value);
    };
    set('blue', score[0], (value) => {
      byId('chip-blue').textContent = String(value);
      byId('race-progress-fill').style.width = `${Math.round((value / goal) * 100)}%`;
    });
    set('goal', goal, (value) => {
      byId('chip-goal').textContent = `of ${value}`;
    });
    set('red', score[1], (value) => {
      byId('chip-red').textContent = String(value);
    });
    set('health', Math.round((child.health / HEALTH) * 20), (value) => {
      byId('chip-health').style.width = `${value * 5}%`;
    });
    const changing = child.reloadLeft > 0;
    set('rounds', changing ? 'changing' : child.rounds, (value) => {
      byId('chip-rounds').textContent = value === 'changing' ? '…' : String(value);
      byId('chip-rounds-box').dataset.state = value === 'changing' ? 'changing' : value === 0 ? 'empty' : value <= 8 ? 'low' : 'full';
    });
    set('bullets', changing ? -1 : Math.ceil((child.rounds / MAGAZINE) * 10), (value) => {
      byId('chip-bullets').style.width = `${Math.max(0, value) * 10}%`;
    });
    // From the levels that have them: the child's gold stars, and whatever a crate has given them, running down.
    set('stars', match.plan.stars ? match.stats.stars : -1, (value) => {
      byId('chip-stars-box').hidden = value < 0;
      byId('chip-stars').textContent = String(Math.max(0, value));
    });
    const { power } = match;
    const on = power.doubleLeft > 0 ? 'double' : power.bootsLeft > 0 ? 'boots' : null;
    // In the language the voice speaks, which a grown-up can change in the middle of a match.
    const ka = this.session.settings.language === 'ka';
    set('power', `${on} ${ka}`, () => {
      byId('chip-power-box').hidden = !on;
      if (!on) return;
      byId('chip-power-mark').textContent = POWERS[on].mark;
      byId('chip-power-name').textContent = ka ? POWERS[on].nameKa : POWERS[on].name;
    });
    if (on) {
      const left = power[`${on}Left`] / POWERS[on].seconds;
      set('power-left', Math.ceil(left * 20), (value) => {
        byId('chip-power').style.width = `${value * 5}%`;
      });
    }
  }

  /** What the helper hand is doing, on its own little sign, as the meter says for the rifle hand. */
  showHelper(state) {
    if (this.shown.helper === state) return;
    this.shown.helper = state;
    document.body.dataset.helper = state;
  }

  /** The sights: in the middle while there's nobody in them, and on whoever the rifle is on once there is. */
  showSight() {
    const { match, yard } = this;
    const { child, locked } = match;
    const sight = byId('sight');
    const state = child.state !== 'in' ? 'none' : child.reloadLeft > 0 ? 'changing' : child.rounds === 0 ? 'empty' : child.firing ? 'firing' : locked ? 'on' : 'ready';
    if (this.shown.sight !== state) {
      this.shown.sight = state;
      document.body.dataset.sight = state;
    }
    let x = yard.width / 2;
    let y = yard.height / 2;
    if (locked) {
      const on = yard.project(locked.x, 1.1, locked.z);
      if (!on.behind) {
        x = on.x;
        y = on.y;
      }
    }
    this.sightX = this.sightX === undefined ? x : this.sightX + (x - this.sightX) * 0.35;
    this.sightY = this.sightY === undefined ? y : this.sightY + (y - this.sightY) * 0.35;
    sight.style.transform = `translate(${Math.round(this.sightX)}px, ${Math.round(this.sightY)}px)`;
  }

  /** A mark for each of the other players: their face, in their team's colour, with how much they have left. */
  buildMarks() {
    const holder = byId('arena-marks');
    holder.replaceChildren();
    const portraits = this.session.portraits ?? {};
    this.marks = this.match.troopers.filter((trooper) => trooper !== this.match.child).map((trooper) => {
      const root = document.createElement('div');
      root.className = 'arena-mark';
      root.dataset.team = trooper.team === 0 ? 'blue' : 'red';
      root.dataset.where = 'none';
      root.innerHTML = '<span class="arena-mark-arrow"></span><img class="arena-mark-face" alt=""><span class="arena-mark-badge"></span><span class="arena-mark-bar"><span class="arena-mark-fill"></span></span>';
      root.querySelector('img').src = portraits[trooper.who] ?? '';
      // Someone special, on the higher levels, has a badge beside their face that says what they are.
      root.querySelector('.arena-mark-badge').textContent = BADGES[trooper.part] ?? (trooper.champion ? '👑' : '');
      holder.append(root);
      return { trooper, root, fill: root.querySelector('.arena-mark-fill'), where: 'none', width: -1 };
    });
  }

  /**
   * Over each player who can be seen, their face and how much they have left. For one who's out of view, their
   * face is at the edge of the screen on the side they're on, with an arrow, which says which way to turn.
   */
  showMarks() {
    const { match, yard } = this;
    const { child } = match;
    const edge = { left: 0, right: 0 };
    for (const mark of this.marks) {
      const { trooper, root } = mark;
      let where = 'none';
      let x = 0;
      let y = 0;
      if (trooper.state === 'in' && child.state === 'in') {
        const on = yard.project(trooper.x, 2.25, trooper.z);
        const seen = !on.behind && on.x > 40 && on.x < yard.width - 40;
        if (seen) {
          // Only over someone the child can really see: nobody is given away behind a crate.
          where = match.sees(child, trooper) ? 'on' : 'none';
          x = on.x;
          y = clamp(on.y, 96, yard.height - 60);
        } else if (trooper.team === 1) {
          const side = yard.offView(trooper.x, trooper.z) >= 0 ? 'right' : 'left';
          where = side;
          x = side === 'right' ? yard.width - 46 : 46;
          y = yard.height * 0.42 + edge[side] * 74;
          edge[side] += 1;
        }
      }
      if (mark.where !== where) {
        mark.where = where;
        root.dataset.where = where;
      }
      if (where === 'none') continue;
      root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      const width = Math.round((trooper.health / trooper.most) * 10);
      if (mark.width !== width) {
        mark.width = width;
        mark.fill.style.width = `${width * 10}%`;
      }
    }
  }

  /* ---------- every frame ---------- */

  /** What both hands are doing, as the rules need it. Anything that can't be properly read does nothing. */
  readHands(snapshot) {
    const helper = readHelper(snapshot);
    this.showHelper(helper);
    return { steer: snapshot.steer, fire: snapshot.handOpen === true, walk: helper === 'open', fist: helper === 'fist' };
  }

  update(dt, snapshot) {
    const { match, session, yard } = this;
    const input = this.readHands(snapshot);
    match.update(dt, input);
    // The match may have just finished.
    if (session.screen !== 'playing') return;
    yard.update(dt);
    this.showHud();
    this.showSight();
    this.showMarks();
    const { child, stats } = match;
    session.sound.steps(child.speed, dt);

    this.sinceAction = child.firing || child.speed > 1 ? 0 : this.sinceAction + dt;
    this.lockedClosedFor = match.locked && !input.fire && child.rounds > 0 && child.reloadLeft === 0 ? this.lockedClosedFor + dt : 0;
    const anyoneInView = match.inPlay(1).some((other) => match.sees(child, other) && Math.abs(yard.offView(other.x, other.z)) < 0.7);
    this.nobodyFor = anyoneInView ? 0 : this.nobodyFor + dt;
    this.standingFor = child.speed > 0.5 || anyoneInView ? 0 : this.standingFor + dt;
    if (this.storyFor > 0) {
      this.storyFor -= dt;
      if (this.storyFor <= 0) this.story.hide();
    }
    // The film stays up until the child has walked, fired and changed a magazine, and comes back if they seem stuck.
    const learning = (stats.walked < WALKED_ENOUGH || stats.shots < SHOTS_ENOUGH || stats.byHand < 1) && session.playSeconds < FILM_AT_MOST_SECONDS;
    const stuck = this.sinceAction > FILM_AGAIN_AFTER_SECONDS && !match.resting;
    this.setFilm(learning || stuck);
  }

  setFilm(on) {
    if (on === this.filming) return;
    this.filming = on;
    document.body.dataset.film = on ? 'on' : 'off';
  }

  idle(dt, snapshot) {
    this.setFilm(false);
    const { match, session, yard } = this;
    const counting = session.screen === 'countdown';
    this.showHelper(counting ? readHelper(snapshot) : 'none');
    if (this.preview) {
      // Looking slowly round the yard, behind the title, with both teams about in it.
      match.update(dt, { steer: 0.3 });
      if (match.state !== 'playing') this.startPreview();
    } else if (session.screen === 'finish') {
      match.update(dt);
    }
    yard.update(dt);
    if (counting) {
      this.showHud();
      this.showSight();
    }
  }

  render() {
    this.yard.render();
  }

  /** A prompt is read as long as it's up, and spoken only for the first few times. asks is 'open' if it asks for that. */
  once(key, text, asks) {
    if (this.lastPromptKey !== key) {
      this.lastPromptKey = key;
      this.spokenTimes.set(key, (this.spokenTimes.get(key) ?? 0) + 1);
    }
    return { key, text, side: null, silent: this.spokenTimes.get(key) > SPOKEN_AT_MOST, asks };
  }

  prompt(snapshot, dt) {
    const { session, match } = this;
    const needed = session.handsPrompt(snapshot, dt);
    if (needed && !needed.key.startsWith('closed')) {
      this.lastPromptKey = null;
      return needed;
    }
    const { child } = match;
    if (match.resting) return this.once('resting', SPOKEN.resting);
    if (child.state !== 'in') {
      this.lastPromptKey = null;
      return null;
    }
    // An empty rifle comes first: nothing else can be done until there's a new magazine in it.
    if (child.rounds === 0 && child.reloadLeft === 0 && !match.autoReload) return this.once('reload', FIST_TO_RELOAD);
    if (this.lockedClosedFor > FIRE_PROMPT_SECONDS) return this.once('fire', OPEN_TO_FIRE, 'open');
    if (this.standingFor > WALK_PROMPT_SECONDS) return this.once('walk', OPEN_TO_WALK);
    if (this.nobodyFor > WALK_PROMPT_SECONDS + FIND_PROMPT_SECONDS) return this.once('find', FIND_THEM);
    this.lastPromptKey = null;
    return null;
  }

  finished() {
    const { sound } = this.session;
    sound.stopMatch();
    this.story.hide();
    document.body.dataset.sight = 'none';
    for (const mark of this.marks) mark.root.dataset.where = 'none';
  }

  summary() {
    const { stats, score } = this.match;
    const { hands } = this.session.settings;
    const onHand = (value, other = 0) => ({ left: hands === 'left' ? value : other, right: hands === 'right' ? value : other });
    document.querySelector('.finish-hero').lastChild.textContent = stats.tags === 1 ? ' tag' : ' tags';
    // The prizes of the higher levels, in one row, with only those this level has.
    const { plan } = this.match;
    const prizes = [plan.stars && `🌟 ${stats.stars}`, plan.power && `📦 ${stats.crates}`, plan.trophy && stats.trophy && '🏆'].filter(Boolean).join('  ');
    byId('sum-left-prizes').closest('tr').hidden = !plan.stars;
    return {
      hero: stats.tags,
      noun: 'match',
      rows: { score: onHand(`${score[0]} : ${score[1]}`, ''), magazines: onHand(stats.byHand), walked: onHand(`${Math.round(stats.walked)} m`, ''), prizes: onHand(prizes, '') },
      won: this.match.state !== 'lost',
    };
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;
const HAND_ICON = '<svg class="helper-hand" viewBox="0 0 48 56" aria-hidden="true"><g class="helper-open"><path d="M12 30V12M19 28V6M27 28V5M34 30V10" /><path d="M36 38L45 28" /><rect x="8" y="26" width="30" height="24" rx="10" /></g><g class="helper-fist"><rect x="8" y="20" width="32" height="28" rx="12" /><path d="M14 24h20M14 31h20" /></g></svg>';

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Fire', closed: null },
  shell: {
    title: 'Frost Arena',
    startLabel: 'Join the team',
    againLabel: 'Play again',
    finishTitle: FINISH,
    heroMark: '⭐',
    heroNoun: 'tags',
    extraRows: [{ id: 'score', label: 'Blue : Red' }, { id: 'magazines', label: 'Magazines changed with the other hand' }, { id: 'walked', label: 'Walked' }, { id: 'prizes', label: 'Prizes' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div id="chip-blue-box" class="chip chip-team is-blue"><span class="chip-label">Blue</span><span class="chip-value"><span id="chip-blue">0</span> <small id="chip-goal">of 5</small></span></div>
          <div id="chip-red-box" class="chip chip-team is-red"><span class="chip-label">Red</span><span id="chip-red" class="chip-value">0</span></div>
          <div id="chip-health-box" class="chip chip-bar"><span class="chip-label">Health</span><span class="chip-value"><span class="bar"><span id="chip-health" class="bar-fill is-health"></span></span></span></div>
          <div id="chip-rounds-box" class="chip chip-bar chip-rounds" data-state="full"><span class="chip-label">Rounds</span><span class="chip-value"><span id="chip-rounds" class="rounds-number">30</span><span class="bar"><span id="chip-bullets" class="bar-fill is-rounds"></span></span></span></div>
          <div id="chip-stars-box" class="chip chip-stars" hidden><span class="chip-label">Stars</span><span class="chip-value"><span aria-hidden="true">🌟</span> <span id="chip-stars">0</span></span></div>
          <div id="chip-power-box" class="chip chip-bar" hidden><span class="chip-label"><span id="chip-power-mark" aria-hidden="true"></span> <span id="chip-power-name"></span></span><span class="chip-value"><span class="bar"><span id="chip-power" class="bar-fill is-power"></span></span></span></div>
        </div>
        <div class="race-progress" aria-hidden="true"><div id="race-progress-fill" class="race-progress-fill"></div></div>
      </div>
      ${STORY_BOX}
      <div id="arena-marks" class="arena-marks" aria-hidden="true"></div>
      <div id="sight" class="sight" aria-hidden="true"><span class="sight-ring"></span><span class="sight-dot"></span></div>
      <div class="helper" aria-hidden="true">${HAND_ICON}<span class="helper-words"><span class="helper-side"></span><b class="helper-does"></b></span></div>
      <div class="film" aria-hidden="true">
        <div class="film-row film-fire">${HAND_ICON}<span class="film-sign film-sign-fire"></span><b>Open: fire</b></div>
        <div class="film-row film-walk">${HAND_ICON}<span class="film-sign film-sign-walk"></span><b>Other hand open: walk</b></div>
        <div class="film-row film-reload">${HAND_ICON}<span class="film-sign film-sign-reload"></span><b>Other hand fist: reload</b></div>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>Rifle</legend>
        ${choice('arenaRifle', 'ak', `${RIFLES.ak.name}: slower, and each shot counts for more`)}
        ${choice('arenaRifle', 'm4', `${RIFLES.m4.name}: quicker and lighter`)}
      </fieldset>
      <fieldset class="choice">
        <legend>Changing the magazine</legend>
        ${choice('arenaReload', 'hand', 'A fist of the other hand')}
        ${choice('arenaReload', 'auto', 'By itself, for a child who can’t make a fist with that hand')}
      </fieldset>
      <fieldset class="choice">
        <legend>Speed</legend>
        ${choice('arenaPace', 'slow', 'Slow')}
        ${choice('arenaPace', 'medium', 'Medium')}
        ${choice('arenaPace', 'fast', 'Fast')}
      </fieldset>
      <fieldset class="choice">
        <legend>Help with aiming (how near the middle of the sights someone has to be)</legend>
        ${choice('arenaHelp', 'none', 'A little')}
        ${choice('arenaHelp', 'little', 'More')}
        ${choice('arenaHelp', 'lots', 'A lot')}
      </fieldset>
      <fieldset class="choice">
        <legend>How hard</legend>
        ${choice('arenaLevel', 'gentle', 'Gentle: the other team hardly ever hits, and the match can’t be lost')}
        ${choice('arenaLevel', 'medium', 'Medium')}
        ${choice('arenaLevel', 'tough', 'Tough')}
      </fieldset>
      <fieldset class="choice">
        <legend>Tags to win</legend>
        ${TAGS_TO_WIN.map((tags) => choice('arenaTags', String(tags), String(tags))).join('')}
      </fieldset>`,
  },
  defaults: { arenaRifle: 'ak', arenaReload: 'hand', arenaPace: 'slow', arenaHelp: 'little', arenaLevel: 'gentle', arenaTags: 5 },
  choices: { arenaRifle: String, arenaReload: String, arenaPace: String, arenaHelp: String, arenaLevel: String, arenaTags: Number },
  tagline: (side) => `Tag the red team! Your ${side} hand looks round and fires. Your other hand walks and reloads.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new ArenaSound(options),
  createGame: (session) => new ArenaGame(session),
}).start();
