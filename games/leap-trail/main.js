// Leap Trail: an endless-feeling run down a country path, with obstacles to jump over and squat
// under, using the child's real body. This file runs it from start to finish, on top of what the
// body games share in core/body/game.js. The rules are in run.js and the world is in world.js.
import { BODY_SAY, BodyGame, byElementId } from '../../core/body/game.js';
import { mountBodyShell } from '../../core/body/shell.js';
import { Practice } from './practice.js';
import { Run } from './run.js';
import { TrailSound } from './trail-sound.js';
import { World } from './world.js';

const AFTER_FINISH_SECONDS = 2.4;
const COUNT_FROM = 3;
const GO_SHOWN_SECONDS = 0.9;
const FEET_PROMPT_SECONDS = 2.5;
const READY_SECONDS = 1.1;
const REST_LOW = -0.9; // Where a resting hand hangs, in torso lengths above the shoulder.
const STREAKS = { 5: 'Five in a row!', 10: 'Ten in a row!' };
const NEARLY_THERE = 0.85;

const DEFAULTS = {
  moveSize: 'small',
  jumpWith: 'jump',
  pace: 'slow',
  obstacles: 20,
  onMissed: 'stumble',
  squatObstacles: 'yes',
  fighter: 'joze',
};
const CHOICES = { jumpWith: String, pace: String, obstacles: Number, onMissed: String, squatObstacles: String };

// Every one of these has a rendered voice file: see audio/voice/lines.json.
const SAY = {
  choose: 'Who’s running today?',
  jump: 'Jump!',
  squat: 'Squat down!',
  jumpReady: 'Jump when you’re ready!',
  squatReady: 'Squat when you’re ready!',
  raiseReady: 'Raise your hand when you’re ready!',
  raiseLeft: 'Raise your open left hand!',
  raiseRight: 'Raise your open right hand!',
  openLeft: 'Open your left hand!',
  openRight: 'Open your right hand!',
  lift: 'Lift your knee!',
  liftReady: 'Lift your knee when you’re ready!',
  nearly: 'Almost there!',
  madeIt: 'You made it to the end of the trail!',
  practise: 'Let’s practise!',
  jumpHigh: 'Jump as high as you can!',
  squatLow: 'Squat as low as you can!',
  kneeHigh: 'Lift your knee as high as you can!',
  raiseHigh: 'Raise your open hand as high as you can!',
  greatJump: 'Great jump!',
  greatSquat: 'Great squat!',
  greatJob: 'Great job!',
  readyNow: 'That’s it! You’re ready!',
};

// The moment a move is seen, the child is told what it was, as words on the screen.
const SEEN_WORDS = {
  jump: ['You jumped!', 'შენ ახტი!'],
  squat: ['You squatted!', 'შენ ჩაცუცქდი!'],
  lift: ['You lifted your knee!', 'მუხლი ასწიე!'],
  raise: ['You raised your hand!', 'ხელი ასწიე!'],
};

class LeapTrail extends BodyGame {
  constructor() {
    super({
      defaults: DEFAULTS,
      choices: CHOICES,
      lines: new URL('./audio/voice/lines.json', import.meta.url),
      createSound: (options) => new TrailSound(options),
    });
    this.run = null;
    this.timer = 0;
    this.countLeft = 0;
    this.closeUpScreens = new Set(['practice', 'countdown', 'run']);
    this.handUsed = false;
    this.feetMissing = 0;
    this.saidNearly = false;
    this.wasResting = false;
    this.lastNumbers = {};
    this.practice = null;
    this.practised = false;
  }

  /** Whether this child jumps for real, or raises an open hand instead. */
  get raisingHand() {
    return this.settings.jumpWith === 'reach';
  }

  setUp() {
    this.world = new World(byElementId('game'));
    this.stage = this.world;
    this.world.setView('choose', { snap: true });
    this.world.onStep = () => this.sound.step();
    this.world.onStar = () => this.sound.star();
    this.applyJumpWith();

    byElementId('start').addEventListener('click', () => {
      this.sound.unlock();
      this.setScreen('choose');
      this.sound.ready.then(() => {
        if (this.screen === 'choose') this.sound.say(SAY.choose);
      });
    });
    byElementId('run-start').addEventListener('click', () => this.openCameraThen(() => this.beginBodyCheck()));
    byElementId('run-again').addEventListener('click', () => this.runAgain());
    byElementId('other-runner').addEventListener('click', () => {
      this.confetti.stop();
      this.world.setRun(null);
      this.world.setLive(null);
      this.world.won = false;
      this.world.runner.presenting = true;
      this.world.setView('choose');
      this.setScreen('choose');
    });
    byElementId('practice-skip').addEventListener('click', () => this.endPractice());
    byElementId('recheck').addEventListener('click', () => {
      byElementId('panel').close();
      this.practised = false;
      if (this.camera.running) this.beginBodyCheck(this.screen === 'run' ? 'resume' : 'start');
      else this.openCameraThen(() => this.beginBodyCheck());
    });
  }

  debug() {
    const game = this;
    return {
      world: this.world,
      get run() {
        return game.run;
      },
    };
  }

  applyJumpWith() {
    this.upperBodyOnly = this.raisingHand;
    this.reader.upperBodyOnly = this.raisingHand;
    this.reader.personal = { jump: null, squat: null, leg: null, hand: null };
    document.body.dataset.jumpWith = this.settings.jumpWith;
  }

  /** The move that gets the runner over things: 'jump', 'lift' or 'raise'. */
  get overMove() {
    return { jump: 'jump', lift: 'lift', reach: 'raise' }[this.settings.jumpWith] ?? 'jump';
  }

  /** Whether there are obstacles to squat under. Raising a hand can be done sitting down. */
  get hasSquats() {
    return this.settings.squatObstacles === 'yes' && !this.raisingHand;
  }

  settingChanged(change) {
    if ('jumpWith' in change) {
      this.applyJumpWith();
      this.practised = false;
    }
    if ('moveSize' in change) this.reader.personal = { jump: null, squat: null, leg: null, hand: null };
    if ('jumpWith' in change || 'hands' in change) this.handUsed = false;
  }

  showChosen(spec) {
    this.world.setRunner(spec);
  }

  /* ---------- the body ---------- */

  onMoves(moves) {
    if (this.screen === 'practice') {
      this.practice?.onMoves(moves);
      return;
    }
    if (this.screen !== 'run') return;
    for (const { move } of moves) {
      this.run.noteActivity();
      if (move === 'stomp') {
        if (this.hasSquats) this.run.squat();
      } else if (this.overMove === 'jump' && (move === 'flying' || move === 'starBurst')) this.run.jump(); // A star jump leaves the ground too.
      else if (this.overMove === 'lift' && (move === 'kick' || move === 'knee')) this.run.jump();
    }
  }

  /**
   * For a child who can't jump safely: raising the hand being worked on, open, is the jump. It
   * can be done sitting down, and it's the open-hand exercise as well. A closed hand is asked to
   * open and doesn't count, as in the other games. A hand has to come down before it counts again.
   * done is what to do with a raised open hand.
   */
  readRaisedHand(now, done) {
    const side = this.settings.hands;
    const up = this.reader.handsUp[side];
    if (!up) {
      this.handUsed = false;
      return null;
    }
    if (this.handUsed) return null;
    const state = this.reader.hands.stateOf(side, now);
    if (state === 'open') {
      this.handUsed = true;
      done();
      return null;
    }
    return { key: `open-${side}`, text: side === 'left' ? SAY.openLeft : SAY.openRight, side };
  }

  /* ---------- how the body is being seen ---------- */

  /** Moves the marker on the meter, so the child can see their own movement being read. */
  updateMeter() {
    const { reader } = this;
    let value;
    if (this.overMove === 'raise') {
      const height = reader.handHeight[this.settings.hands];
      value = (height - REST_LOW) / Math.max(0.1, reader.handNeeded - REST_LOW);
    } else if (this.overMove === 'lift') {
      const down = (reader.sink ?? 0) / reader.squatNeeded;
      const up = reader.footHeight / reader.legNeeded;
      value = up > Math.max(down, 0.2) ? up : -Math.max(down, 0);
    } else {
      value = reader.meter;
    }
    const shown = Math.round(Math.min(1.2, Math.max(-1.2, value)) * 100);
    if (this.lastNumbers.meter === shown) return;
    this.lastNumbers.meter = shown;
    byElementId('meter-dot').style.bottom = `${50 + shown * 0.4}%`;
    const meter = byElementId('move-meter');
    meter.dataset.zone = shown >= 100 ? 'up' : shown <= -100 ? 'down' : 'middle';
  }

  /** The move was seen: squat, or this child's way over. */
  sawMove(what) {
    const inPractice = this.screen === 'practice';
    this.showSeen(SEEN_WORDS[what], { x: inPractice ? 0.26 : 0.42, y: inPractice ? 0.45 : 0.62 });
  }

  /* ---------- practising ---------- */

  beginPractice() {
    const { world } = this;
    world.setRun(null);
    world.won = false;
    world.runner.presenting = true;
    world.setView('practice');
    this.lastNumbers = {};
    this.handUsed = false;
    this.readyLeft = 0;
    this.setScreen('practice');
    this.sound.say(SAY.practise);
    const steps = [this.overMove, ...(this.hasSquats ? ['squat'] : [])];
    this.practice = new Practice({
      steps,
      reader: this.reader,
      side: this.settings.hands,
      onEvent: (event) => this.onPracticeEvent(event),
    });
  }

  onPracticeEvent({ type, step, index, total }) {
    if (type === 'step') {
      const { demo } = this.askFor(step === 'squat' ? 'squat' : 'jump');
      const text = { jump: SAY.jumpHigh, squat: SAY.squatLow, lift: SAY.kneeHigh, raise: SAY.raiseHigh }[step];
      this.showCoach(demo, this.translate(text), { side: this.settings.hands });
      byElementId('practice-count').textContent = `${index + 1} / ${total}`;
      // After "Let's practise!" the first time.
      setTimeout(() => {
        if (this.screen === 'practice' && this.practice?.step === step) this.sound.say(text, { ifQuiet: true });
      }, index === 0 ? 1200 : 150);
    } else if (type === 'success') {
      this.hideCoach();
      this.sawMove(step);
      this.world.hop();
      this.sound.say(step === 'squat' ? SAY.greatSquat : step === 'jump' ? SAY.greatJump : SAY.greatJob);
    } else if (type === 'finished') {
      this.sound.say(SAY.readyNow);
      this.readyLeft = READY_SECONDS;
    }
  }

  updatePractice(dt, now) {
    const { practice } = this;
    this.updateMeter();
    if (this.readyLeft > 0) {
      this.readyLeft -= dt;
      if (this.readyLeft <= 0) this.endPractice();
      return;
    }
    if (this.bodyLost()) {
      this.world.setLive(null);
      this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
      return;
    }
    this.world.setLive(this.reader.hasPose ? this.reader.pose : null);
    this.setCoachEffort(this.reader.effortFor(this.askFor(practice.step === 'squat' ? 'squat' : 'jump').demo, this.settings.hands));
    const handPrompt = practice.step === 'raise' ? this.readRaisedHand(now / 1000, () => practice.succeed()) : null;
    this.prompt.show(handPrompt, now);
    practice.update(dt);
  }

  endPractice() {
    this.practice = null;
    this.practised = true;
    this.hideCoach();
    this.prompt.clear();
    this.beginCountdown();
  }

  /* ---------- a run ---------- */

  afterBodyCheck(then) {
    if (then === 'resume') this.setScreen('run');
    else if (this.practised) this.beginCountdown();
    else this.beginPractice();
  }

  beginCountdown() {
    const { settings, world } = this;
    this.run = new Run({
      obstacles: settings.obstacles,
      pace: settings.pace,
      squats: this.hasSquats,
      whenMissed: settings.onMissed,
      onEvent: (event) => this.onRunEvent(event),
    });
    world.won = false;
    world.setRun(this.run);
    world.runner.presenting = false;
    world.setLive(null);
    world.setView('run');
    this.lastNumbers = {};
    this.handUsed = false;
    this.feetMissing = 0;
    this.saidNearly = false;
    this.wasResting = false;
    byElementId('runner-portrait').src = this.portraits[this.chosen.id];
    this.hideCoach();
    this.updateHud();
    this.countLeft = COUNT_FROM;
    this.setCount(String(COUNT_FROM));
    this.sound.count(COUNT_FROM);
    this.setScreen('countdown');
  }

  updateCountdown(dt) {
    const before = Math.ceil(this.countLeft);
    this.countLeft -= dt;
    const after = Math.ceil(this.countLeft);
    if (this.countLeft <= 0) this.beginRun();
    else if (after !== before) {
      this.setCount(String(after));
      this.sound.count(after);
    }
  }

  beginRun() {
    this.setCount(this.translate('Go!'));
    this.sound.go();
    this.sound.startMusic();
    this.timer = GO_SHOWN_SECONDS;
    this.run.begin();
    this.setScreen('run');
  }

  updateRun(dt, now) {
    const { run, reader } = this;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.setCount('');
    }

    // Nobody in the picture: everything waits.
    if (this.bodyLost()) {
      this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
      return;
    }

    if (reader.moving) run.noteActivity(dt);
    this.world.setLive(reader.hasPose ? reader.pose : null);
    this.updateMeter();
    const asked = run.next && run.inReach(run.next) ? this.askFor(run.next.needs).demo : null;
    if (asked) this.setCoachEffort(reader.effortFor(asked, this.settings.hands));
    const handPrompt = this.raisingHand ? this.readRaisedHand(now / 1000, () => run.jump({ hand: 'open' })) : null;
    run.update(dt);
    if (run.state === 'finished') return;

    if (run.resting !== this.wasResting) {
      this.wasResting = run.resting;
      if (run.resting) this.sound.say(BODY_SAY.waiting, { ifQuiet: true });
    }
    if (!this.saidNearly && run.distance > run.end * NEARLY_THERE) {
      this.saidNearly = true;
      this.sound.say(SAY.nearly, { ifQuiet: true });
    }

    const problemFeet = !this.raisingHand && this.feetProblem(dt);
    let prompt = handPrompt;
    if (!prompt && run.waiting) prompt = this.waitingPrompt();
    if (!prompt && problemFeet) prompt = { key: 'see-feet', text: BODY_SAY.seeFeet, side: null };
    this.prompt.show(prompt, now);
    this.updateHud();
  }

  feetProblem(dt) {
    const { left, right } = this.reader.floor;
    const body = this.latestBody;
    const hidden = !body || left === null || right === null || body.image[27].visibility < 0.5 || body.image[28].visibility < 0.5;
    this.feetMissing = hidden ? this.feetMissing + dt : 0;
    return this.feetMissing > FEET_PROMPT_SECONDS;
  }

  /** What to say to a child the runner is waiting for. */
  waitingPrompt() {
    const next = this.run.next;
    if (!next) return null;
    if (next.needs === 'squat') return { key: 'squat-ready', text: SAY.squatReady, side: null };
    if (this.raisingHand) return { key: 'raise-ready', text: SAY.raiseReady, side: null };
    if (this.overMove === 'lift') return { key: 'lift-ready', text: SAY.liftReady, side: null };
    return { key: 'jump-ready', text: SAY.jumpReady, side: null };
  }

  updateHud() {
    const { run, lastNumbers } = this;
    const share = Math.min(1, run.distance / run.end);
    const percent = Math.round(share * 1000) / 10;
    if (lastNumbers.percent !== percent) {
      lastNumbers.percent = percent;
      byElementId('trail-fill').style.width = `${percent}%`;
      byElementId('runner-portrait').style.left = `${percent}%`;
    }
    const { streak } = run.stats;
    const stars = run.stats.stars + run.stats.linedStars;
    if (lastNumbers.stars !== stars) {
      lastNumbers.stars = stars;
      byElementId('stars').textContent = String(stars);
    }
    if (lastNumbers.streak !== streak) {
      lastNumbers.streak = streak;
      byElementId('streak').textContent = String(streak);
    }
    const left = run.course.filter(({ state }) => state === 'ahead' || state === 'passing').length;
    if (lastNumbers.left !== left) {
      lastNumbers.left = left;
      byElementId('obstacles-left').textContent = String(left);
    }
  }

  /* ---------- what happened ---------- */

  onRunEvent(event) {
    const handlers = {
      ask: () => this.onAsk(event),
      'star-line': () => this.onStarLine(),
      move: () => this.onMove(event),
      cleared: () => this.onCleared(event),
      bump: () => this.onBump(event),
      landed: () => this.onLanded(event),
      'wrong-move': () => this.onWrongMove(event),
      finished: () => this.onFinished(),
    };
    handlers[event.type]?.();
  }

  /** The words and the move to show for what's being asked for: a squat, or this child's way over. */
  askFor(needs) {
    if (needs === 'squat') return { demo: 'squat', text: SAY.squat };
    if (this.overMove === 'raise') {
      return { demo: 'raise', text: this.settings.hands === 'left' ? SAY.raiseLeft : SAY.raiseRight };
    }
    if (this.overMove === 'lift') return { demo: 'kneeLift', text: SAY.lift };
    return { demo: 'jump', text: SAY.jump };
  }

  onAsk({ needs }) {
    const { demo, text } = this.askFor(needs);
    this.showCoach(demo, this.translate(text), { side: this.settings.hands });
    this.callout(this.translate(text).replace('!', ''), { kind: 'is-big', x: 0.42, y: 0.34 });
    // This is the one thing the child needs to hear, so it's next after anything being said.
    this.sound.say(text);
  }

  /** The child did something, but something else is wanted. They're told both. */
  onWrongMove({ needs }) {
    this.sound.say(this.askFor(needs).text);
  }

  onMove({ kind, counts }) {
    this.world.moved(kind, counts);
    this.sound.moved(kind);
    this.sawMove(kind === 'squat' ? 'squat' : this.overMove);
    if (!counts) return;
    this.hideCoach();
    this.world.moveCounted({ kind, obstacle: this.run.move.obstacle, move: this.run.move });
  }

  onCleared({ obstacle, streak }) {
    this.world.cleared(obstacle);
    this.sound.cleared();
    const word = STREAKS[streak];
    if (word) {
      this.callout(this.translate(word).replace('!', ''), { kind: 'is-big', x: 0.5, y: 0.3 });
      this.sound.say(word, { ifQuiet: true });
    }
    this.callout('+3 ★', { kind: 'is-number', x: 0.46, y: 0.42 });
  }

  onBump({ obstacle }) {
    this.world.bumped(obstacle);
    this.hideCoach();
    this.sound.bump();
  }

  onStarLine() {
    this.world.tookStar();
    this.sound.star();
  }

  onLanded({ kind }) {
    if (kind !== 'jump') return;
    this.world.landed();
    this.sound.land();
  }

  onFinished() {
    const { world, sound } = this;
    world.setLive(null);
    this.camera.stop();
    this.reader.forget();
    this.latestBody = null;
    this.hideCoach();
    this.prompt.clear();
    this.setCount('');
    this.updateHud();
    sound.stopMusic();
    sound.finish(SAY.madeIt);
    world.celebrate();
    this.timer = AFTER_FINISH_SECONDS;
    this.setScreen('finishing');
  }

  showFinish() {
    const { stats, course } = this.run;
    byElementId('finish-stars').textContent = String(stats.stars + stats.linedStars);
    const seconds = Math.round(stats.movingSeconds);
    const moving = seconds >= 60 ? `${Math.floor(seconds / 60)} min ${seconds % 60} sec` : `${seconds} seconds`;
    const movingWords = seconds > 0 ? `, with ${moving} of moving` : '';
    byElementId('finish-line').textContent = `${this.chosen.name} cleared ${stats.cleared} of ${course.length} obstacles${movingWords}.`;
    const raised = this.raisingHand;
    const overCard = {
      jump: { name: 'jumps', icon: 'jump', label: 'Jumps', value: stats.jumps },
      lift: { name: 'lifts', icon: 'highKnees', label: 'Knee lifts', value: stats.jumps },
      raise: { name: 'raised', icon: 'handUp', label: 'Hand raised, open', value: stats.hands.open },
    }[this.overMove];
    const entries = [
      overCard,
      { name: 'squats', icon: 'squat', label: 'Squats', value: stats.squats },
      { name: 'streak', icon: 'starJump', label: 'Most in a row', value: stats.bestStreak },
    ].filter(({ name }) => !(raised && name === 'squats'));
    this.fillTallyCards(byElementId('finish-tally'), entries);
    this.confetti.start();
    this.setScreen('finish');
  }

  runAgain() {
    this.confetti.stop();
    this.reader.forget();
    this.openCameraThen(() => this.beginBodyCheck());
  }

  /* ---------- every frame ---------- */

  frame(dt, now) {
    switch (this.screen) {
      case 'practice':
        this.updatePractice(dt, now);
        break;
      case 'countdown':
        this.updateCountdown(dt);
        break;
      case 'run':
        this.updateRun(dt, now);
        break;
      case 'finishing':
        this.run.update(dt);
        this.timer -= dt;
        if (this.timer <= 0) this.showFinish();
        break;
      default:
    }
  }
}

mountBodyShell({
  title: 'Leap Trail',
  tagline: 'Run down the trail! Jump over what’s in the way, and squat under what’s too low.',
  startLabel: 'Choose your runner',
  chooseTitle: 'Who’s running today?',
  chooseSide: `
      <p class="choose-tip">Jump for real, and your runner jumps too. Squat, and it slides under the low ones.</p>
      <button id="run-start" class="big-button" type="button">Let’s run!</button>`,
  hud: `
  <div id="move-meter" class="move-meter" data-zone="middle" aria-hidden="true">
    <div class="meter-zone meter-zone-up"></div>
    <div class="meter-zone meter-zone-down"></div>
    <div class="meter-middle"></div>
    <div id="meter-dot" class="meter-dot"></div>
  </div>
  <div id="practice-bar" class="practice-bar">
    <span id="practice-count" class="practice-count"></span>
    <button id="practice-skip" class="soft-button" type="button">Skip practice</button>
  </div>
  <header id="trail-top" class="trail-top">
    <div class="trail-chips">
      <div class="chip"><span class="chip-label">Stars</span><span id="stars" class="chip-value">0</span></div>
      <div class="chip"><span class="chip-label">In a row</span><span id="streak" class="chip-value">0</span></div>
      <div class="chip"><span class="chip-label">Still to go</span><span id="obstacles-left" class="chip-value">0</span></div>
    </div>
    <div class="trail-track" aria-hidden="true">
      <div id="trail-fill" class="trail-fill"></div>
      <img id="runner-portrait" class="trail-runner" alt="">
      <span class="trail-flag">🏁</span>
    </div>
  </header>`,
  finishBody: `
      <h2 id="finish-title">You made it!</h2>
      <p class="finish-hero"><span class="hero-mark" aria-hidden="true">★</span> <span id="finish-stars">0</span> stars</p>
      <p id="finish-line" class="finish-open"></p>
      <div id="finish-tally" class="finish-tally"></div>
      <p class="small-print">These numbers are shown once and not saved.</p>
      <div class="finish-actions">
        <button id="run-again" class="big-button" type="button">Run again</button>
        <button id="other-runner" class="soft-button" type="button">Choose another runner</button>
        <a class="all-games" href="../../index.html">All games</a>
      </div>`,
  panelLead: 'The game is paused. To jump for real, the camera has to see the child’s whole body, from about 2 to 3 metres away.',
  handLegend: 'Hand to raise, if raising a hand instead of jumping',
  panelSettings: `
    <fieldset class="choice">
      <legend>How to get over things</legend>
      <label><input type="radio" name="jumpWith" value="jump"> Really jumping, or a star jump</label>
      <label><input type="radio" name="jumpWith" value="lift"> Lifting a knee or a foot, for a child who can stand but not jump</label>
      <label><input type="radio" name="jumpWith" value="reach"> Raising an open hand, which can be done sitting down</label>
    </fieldset>
    <fieldset class="choice">
      <legend>Obstacles to squat under</legend>
      <label><input type="radio" name="squatObstacles" value="yes"> Yes</label>
      <label><input type="radio" name="squatObstacles" value="no"> No, only ones to jump</label>
    </fieldset>
    <fieldset class="choice">
      <legend>When a move is missed</legend>
      <label><input type="radio" name="onMissed" value="stumble"> The runner stumbles and carries on</label>
      <label><input type="radio" name="onMissed" value="wait"> The runner stops and waits for it, for a child who needs longer</label>
    </fieldset>
    <fieldset class="choice">
      <legend>Speed</legend>
      <label><input type="radio" name="pace" value="slow"> Slow</label>
      <label><input type="radio" name="pace" value="medium"> Medium</label>
      <label><input type="radio" name="pace" value="fast"> Fast</label>
    </fieldset>
    <fieldset class="choice">
      <legend>Length of the trail</legend>
      <label><input type="radio" name="obstacles" value="10"> 10 obstacles</label>
      <label><input type="radio" name="obstacles" value="20"> 20 obstacles</label>
      <label><input type="radio" name="obstacles" value="40"> 40 obstacles</label>
    </fieldset>`,
});

new LeapTrail().start();
