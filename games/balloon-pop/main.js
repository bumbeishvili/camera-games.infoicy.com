// Balloon Pop: balloons float up, and an open hand pops them. A grown-up can turn on a maths
// challenge, where the balloons have answers on them and the wrong one burns the glove.
import { GameSession } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { BalloonField } from './balloons.js';
import { MathsDeck } from './maths.js';

const POP_HINT_SECONDS = 6;
const DEMO_MATHS_SECONDS = 14;
const BUMP_PROMPT_SECONDS = 2.5;
const PRAISE_EVERY = 10;
const PRAISE_RIGHT_EVERY = 3; // Right answers between one "Great job!" and the next.
const MATHS_GOAL_SHARE = 0.5; // Each answer takes longer than a balloon, so a game has fewer of them.
const FIRST_QUESTION_AFTER = 0.8; // Lets "Go!" finish first.
const NEXT_QUESTION_AFTER = 0.6; // Time to see that it was right.
const ASK_AGAIN_EVERY = 9;
const ASKED_AT_MOST = 2;

const POP_HINT = 'Pop the balloons with your open hand!';
const OPEN_TO_POP = {
  left: 'Open your left hand to pop it!',
  right: 'Open your right hand to pop it!',
};
const PRAISE = ['Great job!', 'Nice one!', 'Way to go!'];
const MATHS_HINT = 'Pop the right answer!';
const TOO_HOT = 'Ouch! Too hot!';
const COOL_IT = 'Hold your hand open to cool it down!';

const byId = (id) => document.getElementById(id);

class BalloonGame {
  chimeOnOpen = false; // Hands open and close all the time here, so a chime would be noise.

  constructor(session) {
    this.session = session;
    this.bump = null;
    this.praiseIndex = 0;
    this.deck = null;
    this.question = null;
    this.questionIn = 0;
    this.askAgainIn = 0;
    this.timesAsked = 0;
    this.saidHint = false;
    this.burns = 0;
    const { settings, sound } = session;
    this.field = new BalloonField(byId('game'), {
      onPop: (total) => {
        // Never quite the same twice, as real balloons aren't.
        sound.play('pop', { gain: 0.55, rate: 0.88 + Math.random() * 0.32 });
        if (this.deck) this.rightAnswer(total);
        else if (total % PRAISE_EVERY === 0 && total < this.field.goal) {
          sound.say(PRAISE[this.praiseIndex++ % PRAISE.length], { ifQuiet: true });
        }
        this.showProgress();
      },
      onWrong: () => {
        this.burns += 1;
        sound.play('sizzle', { gain: 0.6 });
        sound.say(TOO_HOT);
      },
      onCooled: () => sound.handsOpen(),
      onBump: (side) => {
        this.bump = { side, at: session.playSeconds };
      },
      onGoal: () => session.finish(),
    });
    this.field.configure({ pace: settings.pace, reach: settings.reach, goal: settings.balloons, side: settings.hands });
    const game = this;
    this.debug = {
      balloons: this.field,
      get question() {
        return game.question;
      },
    };
  }

  /* ---------- the maths challenge ---------- */

  /** Starts the maths challenge if a grown-up has turned it on, or stops it if they've turned it off. */
  setUpMaths() {
    const { maths, balloons } = this.session.settings;
    const on = maths !== 'off';
    this.deck = on ? new MathsDeck(maths) : null;
    this.question = null;
    this.field.configure({ goal: on ? Math.round(balloons * MATHS_GOAL_SHARE) : balloons });
    this.field.numbered = on;
    document.body.dataset.maths = on ? 'on' : 'off';
    byId('chip-popped-label').textContent = on ? 'Right answers' : 'Popped';
    byId('maths-question').textContent = '';
    byId('maths-question').classList.remove('is-right');
  }

  nextQuestion() {
    const question = this.deck.next();
    this.question = question;
    this.field.askNumbers(question.answers, question.answer);
    const shown = byId('maths-question');
    shown.classList.remove('is-right');
    shown.textContent = `${question.shown} = ?`;
    // The sum is on the screen, so it's only said at the start, or to a child who has stopped.
    if (!this.saidHint) this.askQuestion();
    this.saidHint = true;
    this.timesAsked = 1;
    this.askAgainIn = ASK_AGAIN_EVERY;
  }

  /** The sum itself is on the screen. One line does for every question. */
  askQuestion() {
    this.session.sound.say(MATHS_HINT);
  }

  rightAnswer(total) {
    const { field, question, session } = this;
    const shown = byId('maths-question');
    shown.textContent = `${question.shown} = ${question.answer} ✓`;
    shown.classList.add('is-right');
    this.question = null;
    field.clearNumbers();
    if (total >= field.goal) return;
    if (total % PRAISE_RIGHT_EVERY === 0) session.sound.say(PRAISE[this.praiseIndex++ % PRAISE.length], { ifQuiet: true });
    this.questionIn = NEXT_QUESTION_AFTER;
  }

  updateMaths(dt) {
    if (!this.deck) return;
    if (this.questionIn > 0) {
      this.questionIn -= dt;
      if (this.questionIn <= 0) this.nextQuestion();
      return;
    }
    if (!this.question) return;
    this.askAgainIn -= dt;
    if (this.askAgainIn <= 0 && this.timesAsked < ASKED_AT_MOST) {
      this.askQuestion();
      this.timesAsked += 1;
      this.askAgainIn = ASK_AGAIN_EVERY;
    }
  }

  /** The little film of what to do, which shows until it's clear the child has it. */
  showDemo() {
    const { session, field } = this;
    const wanted = field.total === 0 && session.playSeconds < (this.deck ? DEMO_MATHS_SECONDS : POP_HINT_SECONDS);
    if (wanted !== this.demoShown) {
      this.demoShown = wanted;
      document.body.dataset.popDemo = wanted ? 'on' : 'off';
    }
  }

  /* ---------- the game ---------- */

  showProgress() {
    const { total, goal, progress } = this.field.info;
    byId('chip-popped').textContent = `${total} of ${goal}`;
    byId('race-progress-fill').style.width = `${Math.round(progress * 100)}%`;
  }

  setHands(side) {
    this.field.configure({ side });
  }

  settingChanged(change) {
    if ('pace' in change) this.field.configure({ pace: change.pace });
    if ('reach' in change) this.field.configure({ reach: change.reach });
    if ('maths' in change) this.changeMaths();
  }

  /** A grown-up can turn it on or off in the middle of a game, and it takes effect straight away. */
  changeMaths() {
    this.field.stopNumbers();
    this.setUpMaths();
    if (this.deck && this.session.screen === 'playing') this.questionIn = FIRST_QUESTION_AFTER;
    this.showProgress();
  }

  prepare() {
    const { balloons, pace, reach, hands } = this.session.settings;
    this.field.reset({ goal: balloons, pace, reach, side: hands });
    this.bump = null;
    this.saidHint = false;
    this.burns = 0;
    this.setUpMaths();
    this.showProgress();
  }

  begin() {
    if (this.deck) this.questionIn = FIRST_QUESTION_AFTER;
  }

  update(dt, snapshot) {
    this.updateMaths(dt);
    this.showDemo();
    this.field.update(dt, snapshot, {
      aspect: this.session.camera.aspect,
      popping: true,
      spawning: true,
      showHands: true,
    });
  }

  idle(dt, snapshot) {
    if (this.demoShown) {
      this.demoShown = false;
      document.body.dataset.popDemo = 'off';
    }
    const counting = this.session.screen === 'countdown';
    this.field.update(dt, snapshot, {
      aspect: this.session.camera.aspect,
      // During the countdown the glove comes out, so the child can find their hand.
      showHands: counting,
      spawning: !counting,
    });
  }

  render() {
    this.field.render();
  }

  prompt(snapshot, dt) {
    const { session } = this;
    const needed = session.handsPrompt(snapshot, dt);
    // The hand can rest here whenever it likes. A closed hand only matters when it's trying
    // to pop something, which is the bump below.
    if (needed && !needed.key.startsWith('closed')) return needed;

    const glove = this.field.gloves[snapshot.side];
    // The second time round it's only there to read.
    if (glove.burnt > 0) return { key: `cool-${snapshot.side}`, text: COOL_IT, side: null, silent: this.burns > 1 };

    if (this.bump && session.playSeconds - this.bump.at < BUMP_PROMPT_SECONDS) {
      const { side } = this.bump;
      return { key: `bump-${side}`, text: OPEN_TO_POP[side], side };
    }
    if (!this.deck && session.playSeconds < POP_HINT_SECONDS) {
      return { key: 'pop-hint', text: POP_HINT, side: null };
    }
    return null;
  }

  summary() {
    const { total, popped, wrong } = this.field.info;
    return { hero: total, noun: 'game', rows: { popped, wrong } };
  }
}

new GameSession({
  shell: {
    title: 'Balloon Pop',
    startLabel: 'Let’s pop!',
    againLabel: 'Play again',
    finishTitle: 'You popped them all!',
    heroMark: '🎈',
    heroNoun: 'balloons',
    extraRows: [{ id: 'popped', label: 'Balloons popped' }, { id: 'wrong', label: 'Too-hot balloons' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span id="chip-popped-label" class="chip-label">Popped</span><span id="chip-popped" class="chip-value">0 of 20</span></div>
        </div>
        <div class="race-progress" aria-hidden="true"><div id="race-progress-fill" class="race-progress-fill"></div></div>
      </div>
      <div id="maths-question" class="maths-question" aria-live="polite"></div>
      <div class="pop-demo" aria-hidden="true">
        <svg viewBox="0 0 220 220">
          <g class="demo-balloon">
            <path class="demo-string" d="M150 112q-10 22 2 44" />
            <ellipse cx="150" cy="62" rx="38" ry="46" />
            <path d="M150 106l-8 11h16z" />
            <text class="demo-number" x="150" y="64">3</text>
          </g>
          <path class="demo-burst" d="M150 4v14M150 106v14M92 62h14M194 62h14M109 21l10 10M181 93l10 10M191 21l-10 10M119 93l-10 10" />
          <g class="demo-hand">
            <rect x="40" y="150" width="46" height="42" rx="16" />
            <path class="demo-finger" d="M46 156V128" />
            <path class="demo-finger" d="M57 152V118" />
            <path class="demo-finger" d="M69 152V116" />
            <path class="demo-finger" d="M80 156V124" />
            <path class="demo-thumb" d="M86 176L104 162" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>Balloons to pop</legend>
        <label><input type="radio" name="balloons" value="20"> 20</label>
        <label><input type="radio" name="balloons" value="40"> 40</label>
        <label><input type="radio" name="balloons" value="60"> 60</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Balloon speed</legend>
        <label><input type="radio" name="pace" value="slow"> Slow</label>
        <label><input type="radio" name="pace" value="medium"> Medium</label>
        <label><input type="radio" name="pace" value="fast"> Fast</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Reach help (balloons drift towards an open hand)</legend>
        <label><input type="radio" name="reach" value="none"> None</label>
        <label><input type="radio" name="reach" value="little"> A little</label>
        <label><input type="radio" name="reach" value="lots"> A lot</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Maths challenge (the right answer pops, and the wrong one burns the glove until the hand has been held open to cool it)</legend>
        <label><input type="radio" name="maths" value="off"> Off</label>
        <label><input type="radio" name="maths" value="add"> Adding, up to 10</label>
        <label><input type="radio" name="maths" value="addTake"> Adding and taking away, up to 20</label>
        <label><input type="radio" name="maths" value="times"> Times tables</label>
      </fieldset>`,
  },
  defaults: { balloons: 20, pace: 'slow', reach: 'little', maths: 'off' },
  choices: { balloons: Number, pace: String, reach: String, maths: String },
  tagline: (side) => `Pop the balloons with your open ${side} hand!`,
  finishLine: 'You popped them all!',
  createSound: (options) => new Sound({
    ...options,
    sounds: { pop: new URL('./audio/pop.ogg', import.meta.url), sizzle: new URL('./audio/sizzle.ogg', import.meta.url) },
  }),
  createGame: (session) => new BalloonGame(session),
}).start();
