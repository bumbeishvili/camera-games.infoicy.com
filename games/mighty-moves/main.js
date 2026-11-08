// Mighty Moves: a fighting game played with the whole body. The coach shows one move at a time,
// and the child's fighter makes its own move only when the child has done it. This file runs the
// fight from start to finish, on top of what the body games share in core/body/game.js. The coach
// is in coach.js, the rules are in fight.js and the stage is in arena.js.
import { BODY_SAY, BodyGame, byElementId } from '../../core/body/game.js';
import { ICONS } from '../../core/body/icons.js';
import { viewProblem } from '../../core/body/reader.js';
import { ROSTER } from '../../core/body/roster.js';
import { mountBodyShell } from '../../core/body/shell.js';
import { Arena } from './arena.js';
import { Coach } from './coach.js';
import { FightSound } from './fight-sound.js';
import { Fight } from './fight.js';
import { DEFENCES, EXERCISES, MOVES, NPC_LEVELS, RULES } from './moves.js';

const INTRO_SECONDS = 1.8;
const ROUND_WORD_SECONDS = 1;
const FIGHT_WORD_SECONDS = 0.8;
const AFTER_ROUND_SECONDS = 1.2;
const AFTER_FIGHT_SECONDS = 2.4;
const FEET_PROMPT_SECONDS = 2.5;
const OPEN_HAND_PROMPT_MS = 2500;

const DEFAULTS = { moveSize: 'small', jumps: 'yes', level: 'gentle', rounds: 3, fighter: 'joze' };
const CHOICES = { jumps: String, level: String, rounds: Number };

// Every one of these has a rendered voice file: see audio/voice/lines.json.
const SAY = {
  choose: 'Choose your fighter!',
  fight: 'Fight!',
  knockout: 'Knockout!',
  youWin: 'You win!',
  roundYours: 'That round is yours!',
  roundTheirs: 'So close! You’ll get the next one!',
  fightLost: 'So close! What a fight!',
  takeBreath: 'Take a breath. Well done!',
  niceDodge: 'Nice dodge!',
  goodBlock: 'Good block!',
  openLeft: 'Open your left hand!',
  openRight: 'Open your right hand!',
  another: 'Let’s try another one!',
};
const ROUND_WORDS = { 1: 'Round one!', 2: 'Round two!', last: 'Final round!' };

class MightyMoves extends BodyGame {
  constructor() {
    super({
      defaults: DEFAULTS,
      choices: CHOICES,
      lines: new URL('./audio/voice/lines.json', import.meta.url),
      createSound: (options) => new FightSound(options),
    });
    this.fight = null;
    this.coach = null;
    this.timer = 0;
    this.opponentIndex = 1;
    this.lastNumbers = {};
    this.openHandUntil = 0;
    this.feetMissing = 0;
    this.closeUpScreens = new Set(['fight', 'countdown']);
  }

  setUp() {
    this.arena = new Arena(byElementId('game'));
    this.stage = this.arena;
    // Only the move that was asked for counts, so a slow, careful one doesn't have to stand out.
    this.reader.slowStrikes = true;
    this.arena.setView('choose', { snap: true });
    this.buildTally();
    this.wireFightControls();
  }

  debug() {
    const game = this;
    return {
      arena: this.arena,
      get fight() {
        return game.fight;
      },
      get coach() {
        return game.coach;
      },
    };
  }

  wireFightControls() {
    byElementId('start').addEventListener('click', () => {
      this.sound.unlock();
      this.setScreen('choose');
      this.sound.ready.then(() => {
        if (this.screen === 'choose') this.sound.say(SAY.choose);
      });
    });
    byElementId('next-opponent').addEventListener('click', () => this.pickOpponent(1));
    byElementId('fight-start').addEventListener('click', () => this.openCameraThen(() => this.beginBodyCheck()));
    byElementId('fight-again').addEventListener('click', () => this.playAgain());
    byElementId('other-fighter').addEventListener('click', () => {
      this.confetti.stop();
      this.arena.resetRound();
      this.arena.setFighter('npc', null);
      this.arena.player.presenting = true;
      this.arena.player.hold('wave');
      this.arena.setView('choose');
      this.setScreen('choose');
    });
    byElementId('recheck').addEventListener('click', () => {
      byElementId('panel').close();
      if (this.camera.running) this.beginBodyCheck(this.screen === 'fight' ? 'resume' : 'start');
      else this.openCameraThen(() => this.beginBodyCheck());
    });
  }

  settingChanged(change) {
    if ('moveSize' in change) this.reader.personal = { jump: null, squat: null, leg: null, hand: null };
    if (!this.fight) return;
    if ('hands' in change) {
      this.fight.focusSide = this.settings.hands;
      this.coach.side = this.settings.hands;
    }
    if ('jumps' in change) this.coach.allowJumps = this.settings.jumps === 'yes';
  }

  showChosen(spec) {
    byElementId('chosen-signature').textContent = spec.signature;
    this.arena.setFighter('player', spec);
    this.arena.player.presenting = true;
    this.arena.player.facing = 0.14;
    this.arena.player.hold('wave');
    if (!this.opponent || this.opponent.id === spec.id) this.pickOpponent(this.opponent ? 1 : 0);
  }

  pickOpponent(step = 0) {
    const others = ROSTER.filter((spec) => spec.id !== this.chosen.id);
    if (step === 0) this.opponentIndex = Math.floor(Math.random() * others.length);
    else this.opponentIndex = (this.opponentIndex + step) % others.length;
    this.opponent = others[this.opponentIndex % others.length];
    byElementId('opponent-portrait').src = this.portraits[this.opponent.id];
    byElementId('opponent-name').textContent = this.opponent.name;
  }

  /** Only what the coach asked for does anything: see coach.js. */
  onMoves(moves) {
    if (this.screen === 'fight') this.coach.onMoves(moves);
  }

  afterBodyCheck(then) {
    if (then === 'resume') this.setScreen('fight');
    else this.beginIntro();
  }

  /* ---------- the fight ---------- */

  beginIntro() {
    const { arena, settings } = this;
    arena.setFighter('player', this.chosen);
    arena.setFighter('npc', this.opponent);
    arena.resetRound();
    arena.player.presenting = false;
    arena.setView('intro');
    arena.player.body.setExpression('happy', 2.5);
    arena.npc.body.setExpression('happy', 2.5);
    byElementId('versus-player').textContent = this.chosen.name;
    byElementId('versus-npc').textContent = this.opponent.name;

    const levelNumber = this.startLevel();
    this.fight = new Fight({
      rounds: settings.rounds,
      level: NPC_LEVELS[settings.level] ?? NPC_LEVELS.gentle,
      levelNumber,
      focusSide: settings.hands,
      onEvent: (event) => this.onFightEvent(event),
    });
    this.coach = new Coach({
      fight: this.fight,
      reader: this.reader,
      side: settings.hands,
      allowJumps: settings.jumps === 'yes',
    });
    this.openHandUntil = 0;
    this.feetMissing = 0;
    this.wasResting = false;
    this.fillHud();
    this.updateTally();
    this.setScreen('intro');
    this.timer = INTRO_SECONDS;
    setTimeout(() => {
      if (this.screen === 'intro') this.sound.say(this.chosen.shout);
    }, 150);
  }

  fillHud() {
    const { portraits, chosen, opponent } = this;
    byElementId('player-portrait').src = portraits[chosen.id];
    byElementId('npc-portrait').src = portraits[opponent.id];
    byElementId('player-name').textContent = chosen.name;
    byElementId('npc-name').textContent = opponent.name;
    this.lastNumbers = {};
  }

  beginRoundCountdown() {
    const { fight } = this;
    this.arena.resetRound();
    this.arena.setView('fight');
    this.reader.forget();
    this.lastNumbers = {};
    for (const id of ['player-hp', 'npc-hp']) {
      byElementId(id).style.width = '100%';
      byElementId(id).classList.remove('is-low');
    }
    const number = fight.round + 1;
    const needed = Math.floor(fight.totalRounds / 2) + 1;
    const last = number >= fight.totalRounds || (fight.player.roundsWon === needed - 1 && fight.npc.roundsWon === needed - 1);
    const line = last && fight.totalRounds > 1 ? ROUND_WORDS.last : ROUND_WORDS[number];
    this.setCount(this.translate(line).replace('!', ''));
    this.sound.say(line);
    this.countStage = 'round';
    this.timer = ROUND_WORD_SECONDS;
    this.setScreen('countdown');
    this.sound.startFightMusic();
  }

  updateCountdown(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.countStage === 'round') {
      this.countStage = 'fight';
      this.timer = FIGHT_WORD_SECONDS;
      this.setCount(this.translate(SAY.fight));
      this.sound.bell();
      this.sound.say(SAY.fight);
      this.fight.beginRound();
      this.coach.beginRound();
      this.setScreen('fight');
    }
  }

  updateFight(dt, now) {
    const { fight, coach, arena, reader } = this;
    if (this.countStage === 'fight') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.countStage = null;
        this.setCount('');
      }
    }

    // Nobody in the picture: everything waits, so a child can't lose by stepping away.
    if (this.bodyLost()) {
      this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
      return;
    }

    if (reader.moving) fight.noteActivity(dt);
    coach.update(dt);
    fight.update(dt);
    if (fight.state !== 'fighting') return;

    arena.npc.warning = fight.npc.warning ? 1 : 0;
    arena.player.guarding = fight.player.guard;
    if (fight.resting !== this.wasResting) {
      this.wasResting = fight.resting;
      arena.npc.hold(fight.resting ? 'wave' : null);
    }
    const { showing } = coach;
    if (showing) this.setCoachEffort(reader.effortFor(showing.demo, showing.side));

    // Everything's fine if the feet come and go, as long as they come back.
    const problem = viewProblem(this.latestBody, this.aspect);
    this.feetMissing = problem === 'step-back' || problem === 'show-all' ? this.feetMissing + dt : 0;
    let prompt = null;
    if (now < this.openHandUntil) {
      const side = this.openHandSide;
      prompt = { key: `open-${side}`, text: side === 'left' ? SAY.openLeft : SAY.openRight, side };
    } else if (this.feetMissing > FEET_PROMPT_SECONDS) {
      prompt = { key: 'see-feet', text: BODY_SAY.seeFeet, side: null };
    }
    this.prompt.show(prompt, now);

    this.updateHud();
  }

  updateHud() {
    const { fight, lastNumbers } = this;
    const setWidth = (id, share, name) => {
      const value = Math.round(share * 1000) / 10;
      if (lastNumbers[name] === value) return;
      lastNumbers[name] = value;
      byElementId(id).style.width = `${value}%`;
    };
    setWidth('player-hp', fight.player.hp / RULES.maxHp, 'playerHp');
    setWidth('npc-hp', fight.npc.hp / RULES.maxHp, 'npcHp');
    setWidth('player-power', fight.player.power / 100, 'power');
    byElementId('player-hp').classList.toggle('is-low', fight.player.hp < 30);
    byElementId('npc-hp').classList.toggle('is-low', fight.npc.hp < 30);
    byElementId('power-bar').classList.toggle('is-full', fight.player.power >= 100);

    if (lastNumbers.round !== fight.round) {
      lastNumbers.round = fight.round;
      byElementId('round-word').textContent = `Round ${Math.max(1, fight.round)}`;
      const pips = (count) => '★'.repeat(count);
      byElementId('player-wins').textContent = pips(fight.player.roundsWon);
      byElementId('npc-wins').textContent = pips(fight.npc.roundsWon);
    }
  }

  buildTally() {
    const tally = byElementId('tally');
    for (const name of Object.keys(EXERCISES)) {
      const item = document.createElement('div');
      item.className = 'tally-item';
      item.dataset.exercise = name;
      item.innerHTML = ICONS[name];
      const count = document.createElement('span');
      count.className = 'tally-count';
      count.textContent = '0';
      item.append(count);
      tally.append(item);
    }
  }

  updateTally() {
    const { exercises } = this.fight.stats;
    for (const item of document.querySelectorAll('.tally-item')) {
      const value = exercises[item.dataset.exercise];
      item.querySelector('.tally-count').textContent = String(value);
      item.classList.toggle('has-some', value > 0);
    }
  }

  /* ---------- what happened ---------- */

  onFightEvent(event) {
    const handlers = {
      call: () => this.onCall(event),
      'call-again': () => this.sayCall(event),
      'call-done': () => this.onCallDone(event),
      rep: () => this.onRep(event),
      nudge: () => this.onNudge(event),
      'try-another': () => this.onTryAnother(),
      'small-hits-spent': () => this.coach.nudge(),
      'open-your-hand': () => this.onOpenYourHand(event),
      defend: () => this.onDefend(event),
      defended: () => this.onDefended(event),
      resting: () => this.sound.say(BODY_SAY.waiting, { ifQuiet: true }),
      move: () => this.onMove(event),
      hit: () => this.onHit(event),
      dodged: () => this.onDodged(event),
      combo: () => this.onCombo(event),
      charged: () => this.arena.setCharged(event.who === 'player'),
      'round-end': () => this.onRoundEnd(event),
      'fight-end': () => this.onFightEnd(event),
    };
    handlers[event.type]?.();
  }

  /** The words for an exercise, which say which side if it has one. */
  callWords({ name, side }) {
    const { ask } = EXERCISES[name];
    return side ? ask[side] : ask;
  }

  sayCall(event) {
    this.sound.say(this.callWords(event));
  }

  onCall(event) {
    const { demo } = EXERCISES[event.name];
    this.showCoach(demo, this.coachWords(event), { side: event.side ?? this.settings.hands });
    this.sayCall(event);
  }

  /**
   * What the coach's card says. A move asked for twice, on the higher levels, has a dot for each time,
   * filled in as it's done, so it needs no reading.
   */
  coachWords({ name, side, times = 1, done = 0 }) {
    const words = this.translate(this.callWords({ name, side }));
    return times > 1 ? `${words} ${'●'.repeat(done)}${'○'.repeat(times - done)}` : words;
  }

  /** One of a move asked for twice: seen, and the card shows one more to go. */
  onRep(event) {
    byElementId('coach-text').textContent = this.coachWords(event);
    this.showSeen(EXERCISES[event.name].seen, { x: 0.3, y: 0.55 });
  }

  onCallDone({ name }) {
    this.hideCoach();
    this.showSeen(EXERCISES[name].seen, { x: 0.3, y: 0.55 });
  }

  /** They're doing something else, so the card moves to catch the eye, and it's said again. */
  onNudge(event) {
    const coach = byElementId('coach');
    coach.classList.remove('is-nudged');
    void coach.offsetWidth;
    coach.classList.add('is-nudged');
    this.sayCall(event);
  }

  onTryAnother() {
    this.hideCoach();
    this.sound.say(SAY.another);
  }

  /** A fist doesn't count for a push. */
  onOpenYourHand({ side }) {
    this.openHandUntil = performance.now() + OPEN_HAND_PROMPT_MS;
    this.openHandSide = side;
  }

  onDefend({ kind }) {
    const { demo, ask } = DEFENCES[kind];
    this.showCoach(demo, this.translate(ask), { side: this.settings.hands });
    this.sound.say(ask);
  }

  onDefended({ kind }) {
    this.hideCoach();
    this.showSeen(DEFENCES[kind].seen, { x: 0.3, y: 0.55 });
  }

  onMove({ who, move, side, signature, small }) {
    this.arena.moveStarted(who, move, { side });
    this.sound.swing(move);
    if (who !== 'player') {
      this.hideCoach();
      return;
    }
    if (small) return;
    this.updateTally();
    // Every move is what the child was asked for, and it gets its name in lights.
    const word = signature ? this.chosen.signature : MOVES[move].name;
    const shown = signature && this.settings.language === 'ka' ? this.chosen.signatureKa : this.translate(`${word}!`).replace('!', '');
    this.callout(shown, { kind: 'is-big', x: 0.42, y: 0.36 });
    // Only the fighter's own big move is shouted, so that the next thing to do comes straight away.
    if (signature) this.sound.say(`${word}!`);
  }

  onHit({ attacker, target, move, damage, blocked, reasons, signature, small }) {
    this.arena.hitLanded({ attacker, target, move, blocked, signature, small });
    this.sound.impact(move, { blocked, signature, small });
    if (reasons.includes('charged') && attacker === 'player') this.arena.setCharged(false);

    const top = this.arena.toScreen(this.arena.fighterTop(target));
    if (blocked) {
      if (target === 'player') {
        this.callout(this.translate(SAY.goodBlock).replace('!', ''), { x: top.x, y: top.y });
      }
      return;
    }
    if (damage > 0) this.callout(String(Math.max(1, Math.round(damage))), { kind: 'is-number', x: top.x + 0.03, y: top.y });
    if (attacker === 'player' && reasons.includes('open-hand')) {
      this.callout(this.settings.language === 'ka' ? 'გაშლილი ხელი!' : 'Open hand!', { kind: 'is-open', x: top.x - 0.09, y: top.y + 0.1 });
    }
  }

  onDodged({ who }) {
    this.arena.dodged(who);
    if (who === 'player') {
      const top = this.arena.toScreen(this.arena.fighterTop('player'));
      this.callout(this.translate(SAY.niceDodge).replace('!', ''), { kind: 'is-open', x: top.x, y: top.y });
    }
  }

  onCombo({ who, name }) {
    if (who !== 'player') return;
    this.callout(this.translate(`${name}!`).replace('!', ''), { kind: 'is-combo', x: 0.42, y: 0.52 });
  }

  onRoundEnd({ winner, over }) {
    const { arena } = this;
    this.updateHud();
    this.hideCoach();
    arena.setCharged(false);
    arena.npc.warning = 0;
    arena.player.guarding = false;
    this.prompt.clear();
    const [won, lost] = winner === 'player' ? [arena.player, arena.npc] : [arena.npc, arena.player];
    won.hold('win');
    lost.hold('dizzy');
    this.sound.say(SAY.knockout);
    this.sound.cheer(winner === 'player' ? 0.6 : 0.3);
    if (over) return;

    const mine = winner === 'player';
    this.afterRound = setTimeout(() => {
      byElementId('break-title').textContent = this.translate(mine ? SAY.roundYours : SAY.roundTheirs);
      byElementId('break-line').textContent = this.translate(SAY.takeBreath);
      this.fillTallyCards(byElementId('break-tally'), this.exerciseCards());
      this.sound.say(mine ? SAY.roundYours : SAY.roundTheirs);
      this.setScreen('break');
      this.timer = RULES.breakSeconds;
    }, AFTER_ROUND_SECONDS * 1000);
    this.setScreen('roundend');
  }

  exerciseCards() {
    const { exercises } = this.fight.stats;
    return Object.entries(EXERCISES).map(([name, { label }]) => ({ name, icon: name, label, value: exercises[name] }));
  }

  onFightEnd({ winner }) {
    const { arena } = this;
    this.camera.stop();
    this.reader.forget();
    this.latestBody = null;
    this.sound.stopFightMusic();
    this.prompt.clear();
    this.setCount('');
    arena.setView('win');
    if (winner === 'player') arena.player.presenting = true;
    this.sound.cheer(winner === 'player' ? 0.75 : 0.35);
    this.setScreen('roundend');
    this.timer = AFTER_FIGHT_SECONDS;
    this.showAfterTimer = () => this.showFinish(winner);
    setTimeout(() => this.sound.say(winner === 'player' ? SAY.youWin : SAY.fightLost), 700);
  }

  showFinish(winner) {
    const { stats, player } = this.fight;
    const won = winner === 'player';
    byElementId('finish-title').textContent = this.translate(won ? SAY.youWin : SAY.fightLost);
    const minutes = stats.activeSeconds >= 60
      ? `${Math.floor(stats.activeSeconds / 60)} min ${Math.round(stats.activeSeconds % 60)} sec`
      : `${Math.round(stats.activeSeconds)} seconds`;
    byElementId('finish-line').textContent = `${this.chosen.name} won ${player.roundsWon} of ${stats.rounds.length} ${stats.rounds.length === 1 ? 'round' : 'rounds'}, with ${minutes} of moving.`;
    this.fillTallyCards(byElementId('finish-tally'), this.exerciseCards());
    byElementId('sum-left-strikes').textContent = String(stats.strikes.left);
    byElementId('sum-right-strikes').textContent = String(stats.strikes.right);
    byElementId('sum-left-kicks').textContent = String(stats.kicks.left);
    byElementId('sum-right-kicks').textContent = String(stats.kicks.right);
    const { open, closed } = stats.hands;
    const seen = open + closed;
    byElementId('finish-hands').textContent = seen
      ? `Hand seen open in ${open} of the ${seen} arm moves it could be read in.`
      : 'The hands were too far away to read in any arm move.';
    // A fight that's won moves on a level, and one that's lost stays on it.
    this.finishLevel(won);
    if (won) this.confetti.start();
    this.setScreen('finish');
  }

  playAgain() {
    this.confetti.stop();
    this.reader.forget();
    this.openCameraThen(() => this.beginBodyCheck());
  }

  /* ---------- every frame ---------- */

  frame(dt, now) {
    switch (this.screen) {
      case 'intro':
        this.timer -= dt;
        if (this.timer <= 0) this.beginRoundCountdown();
        break;
      case 'countdown':
        this.updateCountdown(dt);
        break;
      case 'fight':
        this.updateFight(dt, now);
        break;
      case 'roundend':
        if (this.showAfterTimer) {
          this.timer -= dt;
          if (this.timer <= 0) {
            const show = this.showAfterTimer;
            this.showAfterTimer = null;
            show();
          }
        }
        break;
      case 'break':
        this.timer -= dt;
        if (this.timer <= 0) this.beginRoundCountdown();
        break;
      default:
    }
  }
}

mountBodyShell({
  title: 'Mighty Moves',
  tagline: 'Punches and kicks do a little. Do what your fighter shows you, and it’s a mighty move!',
  startLabel: 'Choose your fighter',
  chooseTitle: 'Choose your fighter',
  chosenExtra: '<p class="chosen-move"><span class="chosen-label">Special move</span> <span id="chosen-signature"></span></p>',
  chooseSide: `
      <fieldset class="fight-mode">
        <legend class="chosen-label">Fight against</legend>
        <label><input type="radio" name="opponent-kind" value="computer" checked> The computer</label>
        <label class="is-soon"><input type="radio" name="opponent-kind" value="friend" disabled> A friend online <span class="soon">coming later</span></label>
      </fieldset>
      <button id="next-opponent" class="opponent" type="button">
        <img id="opponent-portrait" alt="">
        <span><span class="chosen-label">Your opponent</span><br><strong id="opponent-name"></strong><br><span class="opponent-change">Tap to change</span></span>
      </button>
      <button id="fight-start" class="big-button" type="button">Fight!</button>`,
  hud: `
  <header id="hud-top" class="fight-top">
    <div class="corner" data-who="player">
      <img id="player-portrait" class="corner-portrait" alt="">
      <div class="corner-bars">
        <div class="corner-name"><span id="player-name"></span><span id="player-wins" class="wins" aria-hidden="true"></span></div>
        <div class="hp"><div id="player-hp" class="hp-fill"></div></div>
        <div id="power-bar" class="power" aria-hidden="true"><div id="player-power" class="power-fill"></div><span class="power-word">Super</span></div>
      </div>
    </div>
    <div class="round-box">
      <span id="round-word" class="round-word"></span>
    </div>
    <div class="corner" data-who="npc">
      <div class="corner-bars">
        <div class="corner-name"><span id="npc-wins" class="wins" aria-hidden="true"></span><span id="npc-name"></span></div>
        <div class="hp"><div id="npc-hp" class="hp-fill"></div></div>
      </div>
      <img id="npc-portrait" class="corner-portrait" alt="">
    </div>
  </header>
  <div id="tally" class="tally" aria-hidden="true"></div>
  <div id="versus-banner" class="versus-banner" aria-live="polite">
    <span id="versus-player"></span>
    <span class="versus-word">VS</span>
    <span id="versus-npc"></span>
  </div>
  <div id="break-card" class="break-card card">
    <h2 id="break-title"></h2>
    <p id="break-line" class="tagline"></p>
    <div id="break-tally" class="break-tally"></div>
  </div>`,
  finishBody: `
      <h2 id="finish-title"></h2>
      <p id="finish-line" class="finish-open"></p>
      <div id="finish-tally" class="finish-tally"></div>
      <table class="summary fight-summary">
        <thead>
          <tr><th scope="col"><span class="visually-hidden">Measure</span></th><th scope="col">Left</th><th scope="col">Right</th></tr>
        </thead>
        <tbody>
          <tr><th scope="row">Arm moves</th><td id="sum-left-strikes"></td><td id="sum-right-strikes"></td></tr>
          <tr><th scope="row">Leg moves</th><td id="sum-left-kicks"></td><td id="sum-right-kicks"></td></tr>
        </tbody>
      </table>
      <p id="finish-hands" class="finish-hands"></p>
      <p class="small-print">These numbers are shown once and not saved.</p>
      <div class="finish-actions">
        <button id="fight-again" class="big-button" type="button">Fight again</button>
        <button id="other-fighter" class="soft-button" type="button">Choose another fighter</button>
        <a class="all-games" href="../../index.html">All games</a>
      </div>`,
  panelLead: 'The game is paused. The coach shows one move at a time, and only those moves can win a round. Ordinary punches and kicks are small hits. The camera has to see the child’s whole body, from about 2 to 3 metres away.',
  handLegend: 'Side to work on (its moves are stronger)',
  panelSettings: `
    <fieldset class="choice">
      <legend>The coach may ask for jumps and star jumps</legend>
      <label><input type="radio" name="jumps" value="yes"> Yes</label>
      <label><input type="radio" name="jumps" value="no"> No, jumping isn’t safe for this child</label>
    </fieldset>
    <fieldset class="choice">
      <legend>The computer’s strength</legend>
      <label><input type="radio" name="level" value="gentle"> Gentle: plenty of warning, and it can’t knock a child out</label>
      <label><input type="radio" name="level" value="medium"> Medium</label>
      <label><input type="radio" name="level" value="tough"> Tough</label>
    </fieldset>
    <fieldset class="choice">
      <legend>Length of a fight</legend>
      <label><input type="radio" name="rounds" value="1"> One round</label>
      <label><input type="radio" name="rounds" value="3"> Best of three, with a rest between</label>
    </fieldset>`,
});

new MightyMoves().start();
