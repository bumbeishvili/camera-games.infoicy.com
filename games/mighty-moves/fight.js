// The rules of a fight. No screen, camera or sound in this file: moves come in, and what happened
// comes out as events, so it all runs in the unit tests.
//
// A fighter is driven only through perform(), setGuard() and setDodge(). Today coach.js makes those
// calls for both sides. Playing over a network later means sending those same calls across, without
// changing anything in here.
import { COMBOS, COMBO_SECONDS, EXERCISES, MOVES, PRIZE_ORDER, RULES, fightLevel } from './moves.js';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const other = (who) => (who === 'player' ? 'npc' : 'player');

const emptyStats = () => ({
  strikes: { left: 0, right: 0 },
  kicks: { left: 0, right: 0 },
  // Arm moves by what the hand was seen doing. Unknown is the hand being too small or blurred.
  hands: { open: 0, closed: 0, unknown: 0 },
  exercises: Object.fromEntries(Object.keys(EXERCISES).map((name) => [name, 0])),
  damage: 0,
  combos: 0,
  signatures: 0,
  activeSeconds: 0,
  seconds: 0,
  rounds: [],
  // Prizes collected, from level 2: see PRIZES in moves.js.
  prizes: Object.fromEntries(PRIZE_ORDER.map((kind) => [kind, 0])),
  powerUps: 0,
});

class Corner {
  constructor(who) {
    this.who = who;
    this.hp = RULES.maxHp;
    this.power = 0;
    this.guard = false;
    this.dodge = 0;
    this.charged = false;
    this.pending = [];
    this.warning = null;
    this.roundsWon = 0;
    this.recent = [];
    this.smallHitsDealt = 0;
    this.duck = false;
    // Power-ups, from the higher levels. They last until they're used, so resting never loses one.
    this.shield = false;
    this.glow = 0;
    this.helper = false;
  }

  freshRound() {
    this.hp = RULES.maxHp;
    this.smallHitsDealt = 0;
    this.guard = false;
    this.dodge = 0;
    this.duck = false;
    this.pending = [];
    this.warning = null;
    this.recent = [];
  }
}

export class Fight {
  /**
   * rounds is how many there are in all, and the first to win more than half takes the fight.
   * level is the computer's strength in moves.js. focusSide is the side being worked on.
   * levelNumber is the level, from 1 to 10: see fightLevel in moves.js, which the coach follows.
   */
  constructor({ rounds = 3, level, levelNumber = 1, focusSide = 'right', onEvent = () => {} }) {
    this.totalRounds = rounds;
    this.level = level;
    this.levelNumber = levelNumber;
    this.levelRules = fightLevel(levelNumber);
    this.focusSide = focusSide;
    this.onEvent = onEvent;

    this.player = new Corner('player');
    this.npc = new Corner('npc');
    this.stats = emptyStats();
    this.state = 'ready'; // ready, fighting, break, over
    this.time = 0;
    this.round = 0;
    this.winner = null;
    this.idleSeconds = 0;
    this.bigMovesLanded = 0;
  }

  corner(who) {
    return this[who];
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  beginRound() {
    this.round += 1;
    this.player.freshRound();
    this.npc.freshRound();
    this.idleSeconds = 0;
    this.state = 'fighting';
    this.emit('round-start', { round: this.round, last: this.isLastRound() });
  }

  isLastRound() {
    const needed = Math.floor(this.totalRounds / 2) + 1;
    return this.round >= this.totalRounds
      || (this.player.roundsWon === needed - 1 && this.npc.roundsWon === needed - 1);
  }

  /** The child moved. Everything waits when this stops, so resting is always fine. */
  noteActivity(dt) {
    this.idleSeconds = 0;
    this.stats.activeSeconds += dt;
  }

  get resting() {
    return this.idleSeconds > RULES.restAfter;
  }

  setGuard(who, on) {
    this.corner(who).guard = on;
  }

  /** dodge is which way a fighter is leaning, from -1 to 1, or 0 for not at all. */
  setDodge(who, dodge) {
    this.corner(who).dodge = dodge;
  }

  /** Ducking under a high swing gets out of the way of it, like leaning. */
  setDuck(who, on) {
    this.corner(who).duck = on;
  }

  /** A prize for the child, if this level has that kind. Collected by itself. */
  award(kind, count = 1) {
    if (!this.levelRules.prizes.includes(kind) || count <= 0) return;
    this.stats.prizes[kind] += count;
    this.emit('prize', { kind, count, total: this.stats.prizes[kind] });
  }

  /**
   * A big move landed, and every so often that brings a power-up. The newest kind this level has comes
   * first, so what a level brings comes in a fight at that level, even a short one, and then they take
   * turns.
   */
  countBigMove() {
    this.bigMovesLanded += 1;
    const { powerUps } = this.levelRules;
    if (!powerUps.length || this.bigMovesLanded % RULES.powerUpEvery !== 0) return;
    const kind = powerUps[(powerUps.length - 1 + this.stats.powerUps) % powerUps.length];
    this.stats.powerUps += 1;
    this.givePowerUp(kind);
  }

  givePowerUp(kind) {
    const { player } = this;
    if (kind === 'shield') player.shield = true;
    if (kind === 'glow') player.glow = RULES.glowMoves;
    if (kind === 'helper') player.helper = true;
    this.emit('power-up', { kind });
  }

  /**
   * The child caught the computer's ball with a clap, and throws it back. Getting out of the way
   * earns a gem, as a block or a lean does.
   */
  catchBall() {
    if (this.state !== 'fighting') return null;
    this.award('gem');
    this.emit('caught');
    return this.perform('player', 'ballReturn');
  }

  /** A fighter gives notice of what's coming, so a child has time to block or lean. */
  warn(who, move) {
    this.corner(who).warning = { move };
    this.emit('warning', { who, move });
  }

  clearWarning(who) {
    this.corner(who).warning = null;
  }

  /**
   * Starts a move. side is the arm or leg used, and hand is what that hand was seen doing:
   * 'open', 'closed' or null for not known. exercise is the exercise that earned it. small makes
   * it a small hit, from something the coach didn't ask for. reps is how many times the child did
   * it, as some moves are asked for twice on the higher levels.
   */
  perform(who, move, { side = null, hand = null, exercise = null, small = false, reps = 1 } = {}) {
    if (this.state !== 'fighting') return null;
    const definition = MOVES[move];
    const corner = this.corner(who);
    const times = corner.who === 'player' ? this.scoreMove(corner, move, definition, { side, hand, exercise, small, reps }) : { value: 1, reasons: [], signature: false };

    const action = {
      who,
      move,
      side,
      hand,
      exercise,
      small,
      times: times.value,
      reasons: times.reasons,
      signature: times.signature,
      startedAt: this.time,
      hitAt: this.time + definition.hitAt,
    };
    corner.pending.push(action);
    this.emit('move', { who, move, side, hand, exercise, small, times: times.value, reasons: times.reasons, signature: times.signature, hitAt: definition.hitAt });
    return action;
  }

  /** Everything that makes the child's move stronger, all of it earned. */
  scoreMove(corner, move, definition, { side, hand, exercise, small, reps = 1 }) {
    const reasons = [];
    let value = 1;
    const add = (name, by) => {
      value *= by;
      reasons.push(name);
    };

    if (move === 'palm' && hand === 'open') add('open-hand', RULES.openHand);
    if (side && side === this.focusSide) add('focus', RULES.focusSide);
    if (reps > 1 && !small) add('twice', RULES.twice);
    this.countMove(definition, { side, hand, exercise });
    if (small) return { value, reasons, signature: false };

    if (exercise) {
      corner.recent = corner.recent.filter(({ at }) => this.time - at <= COMBO_SECONDS);
      const combo = this.findCombo(corner, exercise);
      if (combo) {
        add(combo.name, combo.times);
        this.stats.combos += 1;
        this.emit('combo', { who: corner.who, name: combo.name });
      }
      corner.recent.push({ exercise, at: this.time });
    }

    // Power-ups: a glow for the next big moves, and a friend joining in for one.
    let glowing = false;
    if (corner.glow > 0 && definition.damage > 0) {
      add('glow', RULES.glow);
      corner.glow -= 1;
      glowing = true;
    }
    if (corner.helper && definition.damage > 0) {
      add('team', RULES.team);
      corner.helper = false;
      this.emit('team', { move });
    }

    if (corner.charged && definition.damage > 0) {
      add('charged', RULES.charged);
      corner.charged = false;
    }
    if (move === 'skyCharge') {
      corner.charged = true;
      this.emit('charged', { who: corner.who });
    }

    // A full power bar turns the next move into the fighter's own finishing move.
    let signature = false;
    if (definition.damage > 0 && corner.power >= 100) {
      signature = true;
      add('signature', RULES.signature);
      corner.power = 0;
      this.stats.signatures += 1;
    }
    this.addPower(corner, RULES.powerPerExercise * (glowing ? 2 : 1));

    return { value, reasons, signature };
  }

  countMove(definition, { side, hand, exercise }) {
    const { stats } = this;
    if (definition.kind === 'arm') {
      if (side) stats.strikes[side] += 1;
      stats.hands[hand ?? 'unknown'] += 1;
    } else if (definition.kind === 'leg' && side) {
      stats.kicks[side] += 1;
    }
    if (exercise) stats.exercises[exercise] += 1;
  }

  findCombo(corner, exercise) {
    return COMBOS.find(({ steps }) => {
      if (steps[steps.length - 1] !== exercise) return false;
      const before = steps.slice(0, -1);
      const recent = corner.recent.slice(-before.length).map((entry) => entry.exercise);
      return before.every((step, index) => recent[index] === step);
    });
  }

  addPower(corner, amount) {
    const before = corner.power;
    corner.power = clamp(corner.power + amount, 0, 100);
    if (before < 100 && corner.power >= 100) this.emit('power-full', { who: corner.who });
  }

  resolve(action) {
    const attacker = this.corner(action.who);
    const target = this.corner(other(action.who));
    const definition = MOVES[action.move];
    if (definition.damage === 0) return;

    // Doing what the coach asked for always works.
    if (target.who === 'player' && (Math.abs(target.dodge) > 0.5 || target.duck)) {
      this.emit('dodged', { who: target.who, attacker: action.who, move: action.move, duck: target.duck });
      this.award('gem');
      return;
    }

    let blocked = target.guard;
    if (blocked && target.who === 'player') this.award('gem');
    // A shield bubble catches a hit that would otherwise have landed, and then it's gone.
    if (!blocked && target.who === 'player' && target.shield && !action.small) {
      target.shield = false;
      this.emit('hit', { attacker: action.who, target: target.who, move: action.move, side: action.side, damage: 0, blocked: true, bubble: true, small: false, times: action.times, reasons: ['bubble'], signature: false });
      return;
    }
    let damage = blocked ? 0 : (action.small ? RULES.smallHit : definition.damage) * action.times;
    if (action.who === 'npc') damage *= this.level.damage;

    // Small hits can only go so far. After that, the opponent just blocks them.
    if (action.small) {
      damage = Math.min(damage, RULES.smallHitsMost - attacker.smallHitsDealt);
      attacker.smallHitsDealt += damage;
      if (damage <= 0) {
        blocked = true;
        damage = 0;
        this.emit('small-hits-spent');
      }
    }

    // On the gentlest level the computer can't take a child below this, however it goes.
    if (action.who === 'npc' && this.level.mercy) damage = Math.min(damage, Math.max(0, target.hp - this.level.mercy));

    target.hp = clamp(target.hp - damage, 0, RULES.maxHp);
    if (action.who === 'player') {
      this.stats.damage += damage;
      if (!action.small) {
        this.addPower(attacker, RULES.powerPerHit);
        this.award('coin', action.signature || action.reasons.includes('team') ? 3 : 1);
      }
    }
    this.emit('hit', {
      attacker: action.who,
      target: target.who,
      move: action.move,
      side: action.side,
      damage,
      blocked,
      small: action.small,
      times: action.times,
      reasons: action.reasons,
      signature: action.signature,
    });
    if (target.hp <= 0) this.endRound(action.who);
    else if (action.who === 'player' && !action.small) this.countBigMove();
  }

  endRound(winner) {
    this.state = 'break';
    this.corner(winner).roundsWon += 1;
    this.player.pending = [];
    this.npc.pending = [];
    this.player.warning = null;
    this.npc.warning = null;
    this.stats.rounds.push({ winner });
    if (winner === 'player') this.award('medal');
    const needed = Math.floor(this.totalRounds / 2) + 1;
    const over = this.corner(winner).roundsWon >= needed || this.round >= this.totalRounds;
    this.emit('round-end', { winner, over });
    if (over) {
      this.state = 'over';
      this.winner = this.player.roundsWon >= this.npc.roundsWon ? 'player' : 'npc';
      // Beating the champion wins the trophy.
      if (this.winner === 'player' && this.levelRules.champion) this.award('trophy');
      this.emit('fight-end', { winner: this.winner });
    }
  }

  update(dt) {
    this.time += dt;
    if (this.state !== 'fighting') return;

    this.stats.seconds += dt;
    this.idleSeconds += dt;

    for (const corner of [this.player, this.npc]) {
      for (const action of corner.pending.filter(({ hitAt }) => hitAt <= this.time)) {
        corner.pending.splice(corner.pending.indexOf(action), 1);
        this.resolve(action);
        if (this.state !== 'fighting') return;
      }
    }
  }
}
