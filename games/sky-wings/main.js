// Sky Wings: a dogfight over an island, flown with both arms as wings. Tipping them banks and turns
// the plane, and raising or lowering them flies it up and down. Sky pirates hunt the child, and the
// child hunts them: the guns fire by themselves at any plane inside the ring. This file runs it from
// start to finish, on top of what the body games share in core/body/game.js. The rules are in
// flight.js, the picture is in sky.js, and the island is in island.js.
import { BODY_SAY, BodyGame, byElementId } from '../../core/body/game.js';
import { ROSTER } from '../../core/body/roster.js';
import { mountBodyShell } from '../../core/body/shell.js';
import { FlightSound } from './flight-sound.js';
import { Flight, HEARTS, MOST_AT_ONCE } from './flight.js';
import { Lesson } from './lesson.js';
import { Sky } from './sky.js';

const COUNT_FROM = 3;
const GO_SHOWN_SECONDS = 0.9;
const AFTER_FINISH_SECONDS = 2.8;
const READY_SECONDS = 1.1;
const START_HINT_SECONDS = 4;
const WINGS_DOWN_SECONDS = 1; // How long arms can be down before being asked to put them out.
const WING_TILT_SHOWN = 32; // Degrees, at a full turn.
const WING_CLIMB_SHOWN = 22;
const MARK_MARGIN = 70; // How far from the edge of the screen the arrows to other planes stay.
const LIMIT_PROMPT_FROM = 0.25;

const DEFAULTS = { moveSize: 'small', pace: 'slow', planes: 6, level: 'gentle', climbing: 'yes', fighter: 'joze' };
const CHOICES = { pace: String, planes: Number, level: String, climbing: String };

// Every one of these has a rendered voice file: see audio/voice/lines.json.
const SAY = {
  choose: 'Who’s flying today?',
  practise: 'Let’s learn to fly!',
  wings: 'Hold your arms out like wings!',
  tipRight: 'Tip your wings to the right!',
  tipLeft: 'Tip your wings to the left!',
  climb: 'Raise both arms to fly up!',
  dive: 'Lower both arms to fly down!',
  ready: 'That’s it! You’re ready to fly!',
  start: 'Sky pirates! Get them inside the ring!',
  behind: 'Behind you! Turn around!',
  oneLeft: 'One more to go!',
  limit: 'Back to the island!',
  won: 'You dropped them all!',
  lost: 'So close! Fly again!',
};

// Words for the moment a thing has been seen, which aren't spoken.
const SEEN_WORDS = {
  wings: ['Those are wings!', 'ეს ფრთებია!'],
  tipRight: ['You tipped right!', 'მარჯვნივ დახარე!'],
  tipLeft: ['You tipped left!', 'მარცხნივ დახარე!'],
  climb: ['Up you go!', 'მაღლა მიფრინავ!'],
  dive: ['Down you go!', 'დაბლა მიფრინავ!'],
};
const GOT_ONE = { en: 'Got one!', ka: 'ერთი ჩამოაგდე!' };

class SkyWings extends BodyGame {
  constructor() {
    super({
      defaults: DEFAULTS,
      choices: CHOICES,
      lines: new URL('./audio/voice/lines.json', import.meta.url),
      createSound: (options) => new FlightSound(options),
    });
    this.flight = null;
    this.lesson = null;
    this.learned = false;
    this.timer = 0;
    this.countLeft = 0;
    this.lastNumbers = {};
    this.upperBodyOnly = true; // It can all be done sitting down.
    this.armsOut = true;
    this.wingsDownFor = 0;
    this.marks = [];
  }

  setUp() {
    this.sky = new Sky(byElementId('game'));
    this.stage = this.sky;
    this.sky.setView('choose', { snap: true });
    this.sky.onSizeChanged = () => this.sizeAim();
    this.reader.upperBodyOnly = true;

    byElementId('start').addEventListener('click', () => {
      this.sound.unlock();
      this.setScreen('choose');
      this.sound.ready.then(() => {
        if (this.screen === 'choose') this.sound.say(SAY.choose);
      });
    });
    byElementId('fly-start').addEventListener('click', () => this.openCameraThen(() => this.beginBodyCheck()));
    byElementId('fly-again').addEventListener('click', () => {
      this.confetti.stop();
      this.reader.forget();
      this.openCameraThen(() => this.beginBodyCheck());
    });
    byElementId('other-pilot').addEventListener('click', () => {
      this.confetti.stop();
      this.sky.setFlight(null);
      this.flight = null;
      this.sky.setLive(null);
      this.sky.setView('choose');
      this.setScreen('choose');
    });
    byElementId('lesson-skip').addEventListener('click', () => this.endLesson());
    byElementId('recheck').addEventListener('click', () => {
      byElementId('panel').close();
      this.learned = false;
      if (this.camera.running) this.beginBodyCheck(this.screen === 'fly' ? 'resume' : 'start');
      else this.openCameraThen(() => this.beginBodyCheck());
    });
    this.buildMarks();
    this.sizeAim();
  }

  debug() {
    const game = this;
    return {
      sky: this.sky,
      get flight() {
        return game.flight;
      },
      get lesson() {
        return game.lesson;
      },
    };
  }

  settingChanged(change) {
    if ('moveSize' in change) {
      this.reader.personal.wings = null;
      this.learned = false;
    }
    if ('level' in change) this.sizeAim();
  }

  showChosen(spec) {
    this.sky.setPilot(spec);
  }

  afterBodyCheck(then) {
    if (then === 'resume') this.setScreen('fly');
    else if (this.learned) this.beginCountdown();
    else this.beginLesson();
  }

  /** Nothing here comes from a single move: the arms are read all the time. */
  onMoves() {}

  /** The little pair of wings that shows how the arms are being read. */
  updateWingMeter() {
    const { wings } = this.reader;
    const tilt = Math.round(wings.bank * WING_TILT_SHOWN);
    const lift = Math.round(wings.climb * -WING_CLIMB_SHOWN);
    const out = wings.out ? 'yes' : 'no';
    const key = `${tilt},${lift},${out}`;
    if (this.lastNumbers.meter === key) return;
    this.lastNumbers.meter = key;
    byElementId('wing-pair').style.transform = `translateY(${lift}px) rotate(${tilt}deg)`;
    byElementId('wing-meter').dataset.out = out;
  }

  /* ---------- learning to fly ---------- */

  beginLesson() {
    this.sky.setFlight(null);
    this.flight = null;
    this.sky.setView('lesson');
    this.lastNumbers = {};
    this.readyLeft = 0;
    this.setScreen('lesson');
    this.sound.say(SAY.practise);
    const steps = ['wings', 'tipRight', 'tipLeft', ...(this.settings.climbing === 'yes' ? ['climb', 'dive'] : [])];
    this.lesson = new Lesson({
      steps,
      reader: this.reader,
      onEvent: (event) => this.onLessonEvent(event),
    });
  }

  /** The film and the words for one thing to learn. */
  lessonStep(step) {
    const { hands } = this.settings;
    return {
      wings: { demo: 'wings', text: SAY.wings, side: hands },
      tipRight: { demo: 'tip', text: SAY.tipRight, side: 'right' },
      tipLeft: { demo: 'tip', text: SAY.tipLeft, side: 'left' },
      climb: { demo: 'climb', text: SAY.climb, side: hands },
      dive: { demo: 'dive', text: SAY.dive, side: hands },
    }[step];
  }

  onLessonEvent({ type, step, index, total }) {
    if (type === 'step') {
      const { demo, text, side } = this.lessonStep(step);
      this.showCoach(demo, this.translate(text), { side });
      byElementId('lesson-count').textContent = `${index + 1} / ${total}`;
      this.sound.say(text);
    } else if (type === 'success') {
      this.hideCoach();
      this.showSeen(SEEN_WORDS[step], { x: 0.2, y: 0.42 });
    } else if (type === 'finished') {
      this.sound.say(SAY.ready);
      this.readyLeft = READY_SECONDS;
    }
  }

  updateLesson(dt, now) {
    const { lesson } = this;
    this.updateWingMeter();
    if (this.readyLeft > 0) {
      this.readyLeft -= dt;
      if (this.readyLeft <= 0) this.endLesson();
      return;
    }
    if (this.bodyLost()) {
      this.sky.setLive(null);
      this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
      return;
    }
    this.prompt.show(null, now);
    this.sky.setLive(this.reader.hasPose ? this.reader.pose : null);
    this.sky.setBank(this.reader.wings.out ? this.reader.wings.bank : 0);
    this.setCoachEffort(lesson.effort);
    lesson.update(dt);
  }

  endLesson() {
    this.lesson = null;
    this.learned = true;
    this.hideCoach();
    this.prompt.clear();
    this.beginCountdown();
  }

  /* ---------- a dogfight ---------- */

  beginCountdown() {
    const { settings, sky } = this;
    this.flight = new Flight({
      planes: settings.planes,
      pace: settings.pace,
      level: settings.level,
      climbing: settings.climbing === 'yes',
      onEvent: (event) => this.onFlightEvent(event),
    });
    this.pirates = ROSTER.filter(({ id }) => id !== this.chosen.id).slice(0, this.flight.total);
    sky.setFlight(this.flight, this.pirates);
    sky.setView('fly');
    this.lastNumbers = {};
    this.wingsDownFor = 0;
    this.sizeAim();
    this.hideCoach();
    this.updateHud();
    this.updateMarks();
    this.countLeft = COUNT_FROM;
    this.setCount(String(COUNT_FROM));
    this.sound.count(COUNT_FROM);
    this.setScreen('countdown');
  }

  updateCountdown(dt) {
    const before = Math.ceil(this.countLeft);
    this.countLeft -= dt;
    const after = Math.ceil(this.countLeft);
    if (this.countLeft <= 0) this.beginFlying();
    else if (after !== before) {
      this.setCount(String(after));
      this.sound.count(after);
    }
  }

  beginFlying() {
    this.setCount(this.translate('Go!'));
    this.sound.go();
    this.sound.startFlying();
    this.timer = GO_SHOWN_SECONDS;
    this.hintLeft = START_HINT_SECONDS;
    this.flight.begin();
    this.setScreen('fly');
    this.asking = 'tip';
    this.showCoach('tip', this.translate(SAY.start), { side: this.settings.hands });
    this.sound.say(SAY.start);
  }

  updateFlying(dt, now) {
    const { flight, reader, settings, sky } = this;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.setCount('');
    }

    // Nobody in the picture: everything waits.
    if (this.bodyLost()) {
      this.sound.guns(false);
      this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
      return;
    }

    const { wings } = reader;
    flight.update(dt, { out: wings.out, bank: wings.bank, climb: wings.climb });
    if (flight.state !== 'flying') return;

    sky.setLive(reader.hasPose ? reader.pose : null);
    this.sound.propeller(flight.speed / flight.pace.speed);
    this.updateWingMeter();
    this.updateHud();
    this.updateMarks();

    this.wingsDownFor = wings.out ? 0 : this.wingsDownFor + dt;
    if (this.hintLeft > 0) this.hintLeft -= dt;

    if (this.wingsDownFor > WINGS_DOWN_SECONDS && !flight.resting) {
      this.showAsk('wings', this.translate(SAY.wings), settings.hands);
      this.prompt.show({ key: 'wings', text: SAY.wings, side: null }, now);
    } else if (flight.atLimit > LIMIT_PROMPT_FROM) {
      this.prompt.show({ key: 'limit', text: SAY.limit, side: null, silent: flight.atLimit < 1 }, now);
      if (this.hintLeft <= 0) this.clearAsk();
    } else {
      if (this.hintLeft <= 0) this.clearAsk();
      this.prompt.show(null, now);
    }
    if (this.asking === 'wings') this.setCoachEffort(reader.effortFor('wings'));
  }

  /** Shows a film, unless it's the one already showing. */
  showAsk(demo, text, side) {
    if (this.asking === demo) return;
    this.asking = demo;
    this.showCoach(demo, text, { side });
  }

  clearAsk() {
    if (!this.asking) return;
    this.asking = null;
    this.hideCoach();
  }

  updateHud() {
    const { flight, lastNumbers } = this;
    const { left, dropped, hearts } = flight;
    if (lastNumbers.left !== left) {
      lastNumbers.left = left;
      byElementId('planes-left').textContent = String(left);
    }
    if (lastNumbers.dropped !== dropped) {
      lastNumbers.dropped = dropped;
      byElementId('dropped').textContent = String(dropped);
    }
    if (lastNumbers.hearts !== hearts) {
      lastNumbers.hearts = hearts;
      byElementId('hearts').textContent = '♥'.repeat(hearts) + '♡'.repeat(HEARTS - hearts);
    }
    const locked = flight.locked ? 'yes' : 'no';
    if (lastNumbers.locked !== locked) {
      lastNumbers.locked = locked;
      byElementId('aim').dataset.locked = locked;
    }
  }

  /* ---------- the ring, and where the other planes are ---------- */

  /** The ring on the screen is exactly what the guns fire at, whatever the size of the window. */
  sizeAim() {
    const size = `${Math.round(this.sky.aimDiameter(this.settings.level))}px`;
    const aim = byElementId('aim');
    aim.style.width = size;
    aim.style.height = size;
  }

  buildMarks() {
    const holder = byElementId('marks');
    this.marks = Array.from({ length: MOST_AT_ONCE }, () => {
      const root = document.createElement('div');
      root.className = 'mark';
      const box = document.createElement('span');
      box.className = 'mark-box';
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
      root.append(box, face, bar, arrow);
      holder.append(root);
      return { root, face, fill, arrow, enemy: null };
    });
  }

  /** A mark on each plane that can be seen, and an arrow at the edge of the screen to any that can't. */
  updateMarks() {
    const { flight, sky, marks } = this;
    const planes = flight.flying;
    // From where the camera is now, rather than a frame ago, so that the marks stay on the planes.
    sky.updateCamera(0);
    marks.forEach((mark, index) => {
      const enemy = planes[index];
      if (!enemy) {
        mark.root.dataset.where = 'none';
        mark.enemy = null;
        return;
      }
      if (mark.enemy !== enemy) {
        mark.enemy = enemy;
        const pilot = this.pirates[enemy.index % this.pirates.length];
        mark.face.src = this.portraits[pilot.id];
      }
      const seen = sky.project(enemy.x, enemy.y, enemy.z);
      const { width, height } = sky;
      const onScreen = !seen.behind && seen.x > 0 && seen.x < width && seen.y > 0 && seen.y < height;
      mark.root.dataset.hunting = enemy.mode === 'hunt' ? 'yes' : 'no';
      mark.root.dataset.locked = enemy === flight.locked ? 'yes' : 'no';
      mark.fill.style.width = `${Math.round((enemy.hitsLeft / flight.level.enemyHits) * 100)}%`;
      if (onScreen) {
        mark.root.dataset.where = 'on';
        mark.root.style.transform = `translate(${Math.round(seen.x)}px, ${Math.round(seen.y)}px)`;
        return;
      }
      // Off to one side, or round behind: the arrow says which way to turn.
      const way = seen.behind ? -1 : 1;
      const dx = (seen.x - width / 2) * way;
      const dy = (seen.y - height / 2) * way;
      const size = Math.hypot(dx, dy) || 1;
      const reach = Math.min((width / 2 - MARK_MARGIN) / Math.max(1e-3, Math.abs(dx / size)), (height / 2 - MARK_MARGIN) / Math.max(1e-3, Math.abs(dy / size)));
      mark.root.dataset.where = 'off';
      mark.root.style.transform = `translate(${Math.round(width / 2 + (dx / size) * reach)}px, ${Math.round(height / 2 + (dy / size) * reach)}px)`;
      mark.arrow.style.transform = `rotate(${Math.round((Math.atan2(dy, dx) * 180) / Math.PI)}deg)`;
    });
  }

  /* ---------- what happened ---------- */

  onFlightEvent(event) {
    const handlers = {
      firing: () => this.sound.guns(event.on),
      hit: () => this.onHit(event),
      down: () => this.onDown(event),
      'enemy-shot': () => this.sound.theirShot(),
      hurt: () => this.onHurt(),
      behind: () => this.sound.say(SAY.behind, { ifQuiet: true }),
      resting: () => this.onResting(event),
      won: () => this.onFinished(true),
      lost: () => this.onFinished(false),
    };
    handlers[event.type]?.();
  }

  onHit({ enemy }) {
    this.sky.hitEnemy(enemy);
    this.sound.hit();
  }

  onDown({ enemy, left }) {
    this.sky.enemyDown(enemy);
    this.sound.down();
    this.callout(GOT_ONE[this.settings.language] ?? GOT_ONE.en, { kind: 'is-big', x: 0.42, y: 0.26 });
    if (left === 1) this.sound.say(SAY.oneLeft, { ifQuiet: true });
  }

  onHurt() {
    this.sky.childHit();
    this.sound.hurt();
    const hearts = byElementId('hearts');
    hearts.classList.remove('is-hurt');
    void hearts.offsetWidth;
    hearts.classList.add('is-hurt');
  }

  onResting({ on }) {
    if (on) {
      this.sound.say(BODY_SAY.waiting, { ifQuiet: true });
      this.clearAsk();
    }
  }

  onFinished(won) {
    const { sky, sound } = this;
    this.won = won;
    this.camera.stop();
    this.reader.forget();
    this.latestBody = null;
    this.clearAsk();
    this.hideCoach();
    this.prompt.clear();
    this.setCount('');
    this.updateHud();
    for (const mark of this.marks) mark.root.dataset.where = 'none';
    sound.stopFlying();
    sound.finish(won ? SAY.won : SAY.lost);
    sky.setLive(null);
    sky.celebrate();
    this.timer = AFTER_FINISH_SECONDS;
    this.setScreen('finishing');
  }

  showFinish() {
    const { stats, total } = this.flight;
    const { won } = this;
    byElementId('finish-title').textContent = this.translate(won ? SAY.won : SAY.lost);
    byElementId('finish-place').textContent = `${stats.dropped} / ${total}`;
    const clock = (seconds) => {
      const whole = Math.round(seconds);
      return whole >= 60 ? `${Math.floor(whole / 60)} min ${whole % 60} sec` : `${whole} sec`;
    };
    byElementId('finish-line').textContent = `${this.chosen.name} dropped ${stats.dropped} of ${total} planes.`;
    byElementId('finish-hold').textContent = `Arms out for ${clock(stats.wingsSeconds)} of ${clock(stats.seconds)}.`;
    this.fillTallyCards(byElementId('finish-tally'), [
      { name: 'dropped', icon: 'shoot', label: 'Planes dropped', value: stats.dropped },
      { name: 'hits', icon: 'ring', label: 'Hits', value: stats.hits },
      { name: 'hurts', icon: 'wings', label: 'Times hit', value: stats.hurts },
    ]);
    if (won) this.confetti.start();
    this.setScreen('finish');
  }

  /* ---------- every frame ---------- */

  frame(dt, now) {
    switch (this.screen) {
      case 'lesson':
        this.updateLesson(dt, now);
        break;
      case 'countdown':
        this.updateCountdown(dt);
        break;
      case 'fly':
        this.updateFlying(dt, now);
        break;
      case 'finishing':
        this.flight.update(dt);
        this.timer -= dt;
        if (this.timer <= 0) this.showFinish();
        break;
      default:
    }
  }
}

mountBodyShell({
  title: 'Sky Wings',
  tagline: 'Sky pirates are hunting you over the island! Fly with your arms as wings, get them inside the ring, and drop them all.',
  startLabel: 'Choose your pilot',
  chooseTitle: 'Who’s flying today?',
  chooseSide: `
      <p class="choose-tip">Hold both arms out. Tip them to turn, and raise or lower them to fly up and down. The guns fire by themselves at any plane inside the ring.</p>
      <button id="fly-start" class="big-button" type="button">Let’s fly!</button>`,
  hud: `
  <div id="wing-meter" class="wing-meter" data-out="no" aria-hidden="true">
    <svg viewBox="0 0 120 120">
      <line class="wing-mid" x1="12" y1="60" x2="108" y2="60" />
      <g id="wing-pair" class="wing-pair">
        <path class="wing-line" d="M14 60H106" />
        <circle class="wing-body" cx="60" cy="60" r="9" />
      </g>
    </svg>
  </div>
  <div id="lesson-bar" class="lesson-bar">
    <span id="lesson-count" class="lesson-count"></span>
    <button id="lesson-skip" class="soft-button" type="button">Skip this</button>
  </div>
  <div id="marks" class="marks" aria-hidden="true"></div>
  <div id="aim" class="aim" data-locked="no" aria-hidden="true">
    <svg viewBox="0 0 200 200">
      <circle class="aim-under" cx="100" cy="100" r="93" />
      <circle class="aim-ring" cx="100" cy="100" r="93" />
      <path class="aim-under" d="M100 2V30M100 170V198M2 100H30M170 100H198" />
      <path class="aim-ticks" d="M100 2V30M100 170V198M2 100H30M170 100H198" />
      <circle class="aim-dot" cx="100" cy="100" r="4" />
    </svg>
  </div>
  <header id="sky-top" class="sky-top">
    <div class="sky-chips">
      <div class="chip sky-left"><span class="chip-label">Planes left</span><span id="planes-left" class="chip-value">6</span></div>
      <div class="chip"><span class="chip-label">Dropped</span><span id="dropped" class="chip-value">0</span></div>
      <div class="chip sky-hearts"><span class="chip-label">Hearts</span><span id="hearts" class="chip-value">♥♥♥♥♥</span></div>
    </div>
  </header>`,
  finishBody: `
      <h2 id="finish-title"></h2>
      <p id="finish-place" class="finish-place"></p>
      <p id="finish-line" class="finish-open"></p>
      <div id="finish-tally" class="finish-tally"></div>
      <p id="finish-hold" class="finish-open"></p>
      <p class="small-print">These numbers are shown once and not saved.</p>
      <div class="finish-actions">
        <button id="fly-again" class="big-button" type="button">Fly again</button>
        <button id="other-pilot" class="soft-button" type="button">Choose another pilot</button>
        <a class="all-games" href="../../index.html">All games</a>
      </div>`,
  panelLead: 'The game is paused. The child flies with both arms held out like wings, sitting or standing: tipping them turns the plane, and raising or lowering both flies it up or down. The guns fire by themselves at any plane inside the ring. The camera has to see both arms, from about 1.5 to 2.5 metres away.',
  safetyPrint: 'Please make sure there’s room for both arms out to the sides.',
  panelSettings: `
    <fieldset class="choice">
      <legend>Flying up and down</legend>
      <label><input type="radio" name="climbing" value="yes"> Raising and lowering both arms</label>
      <label><input type="radio" name="climbing" value="no"> By itself, following the other planes, so that only turning is left to do</label>
    </fieldset>
    <fieldset class="choice">
      <legend>How hard</legend>
      <label><input type="radio" name="level" value="gentle"> Gentle: a big ring, and the child can’t be shot down</label>
      <label><input type="radio" name="level" value="medium"> Medium</label>
      <label><input type="radio" name="level" value="tough"> Tough</label>
    </fieldset>
    <fieldset class="choice">
      <legend>Speed</legend>
      <label><input type="radio" name="pace" value="slow"> Slow</label>
      <label><input type="radio" name="pace" value="medium"> Medium</label>
      <label><input type="radio" name="pace" value="fast"> Fast</label>
    </fieldset>
    <fieldset class="choice">
      <legend>Planes to drop</legend>
      <label><input type="radio" name="planes" value="3"> 3</label>
      <label><input type="radio" name="planes" value="6"> 6</label>
      <label><input type="radio" name="planes" value="9"> 9</label>
    </fieldset>`,
});

new SkyWings().start();
