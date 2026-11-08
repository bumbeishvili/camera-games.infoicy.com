// The coach runs a fight, one thing at a time. It says what to do and shows it, and then it waits.
// When the child does exactly that, their fighter makes a big move, and that's what wins a round.
// Ordinary punches and kicks are small hits, and can only ever take so much. Every so often it's the
// opponent's turn, and the coach says how to get out of the way. A child standing still is resting,
// and nothing happens to them.
//
// No screen or camera in this file: reader is a BodyReader, or anything with the same few fields,
// so all of it runs in the unit tests.
import { Easing } from '../../core/body/easing.js';
import { CAN_BE_TWICE, COMBOS, DEFENCES, EXERCISES, MOVES, ORDER, RULES, SMALL_HITS } from './moves.js';

// Moves big enough to be sure the child is doing something else, rather than just getting ready.
const CLEARLY_SOMETHING_ELSE = new Set(['stomp', 'flying', 'starBurst', 'sweep']);
const OTHER = { left: 'right', right: 'left' };
const OTHER_SIDE_EVERY = 3; // One move in this many is on the side that isn't being worked on.
const REP_GAP = 0.5; // Seconds between the two of a move asked for twice, so one can't count as both.
const unique = (list) => [...new Set(list)];

export class Coach {
  /**
   * side is the side being worked on, and allowJumps says whether it may ask for jumps. The fight's
   * level, from 1 to 10, adds to the computer's strength: see fightLevel in moves.js.
   */
  constructor({ fight, reader, side = 'right', allowJumps = true, random = Math.random }) {
    this.fight = fight;
    this.reader = reader;
    this.side = side;
    this.allowJumps = allowJumps;
    this.random = random;
    this.rules = fight.levelRules;
    const { every, warning, defences, moves } = fight.level;
    // The computer's strength, as this level plays it.
    this.level = {
      ...fight.level,
      every: every * this.rules.turnEvery,
      warning: warning * this.rules.warning,
      defences: unique([...defences, ...this.rules.defences]),
      moves: unique([...moves, ...this.rules.npcMoves]),
    };
    this.queue = [];
    this.followUp = null;
    this.phase = 'waiting'; // waiting, asking or defending
    this.timer = 0;
    this.call = null;
    this.defence = null;
    this.nextIndex = 0;
    this.sidedCalls = 0;
    this.computerIn = this.level.every;
    this.computerMoves = 0;
    this.defences = 0;
    this.gaveUpOn = new Set();
    this.lastNudge = -Infinity;
    this.lastSmallHit = -Infinity;
    this.wasResting = false;
    this.time = 0;
  }

  /** A new round: a moment to get going, and then the next thing on the list. */
  beginRound() {
    this.call = null;
    this.defence = null;
    this.followUp = null;
    this.computerIn = this.level.every;
    this.fight.setGuard('player', false);
    this.fight.setDodge('player', 0);
    this.wait(RULES.firstCallAfter);
  }

  wait(seconds) {
    this.phase = 'waiting';
    this.timer = seconds;
  }

  /** What the child is being shown right now, if anything, to measure them against. */
  get showing() {
    if (this.phase === 'asking') return { demo: this.call.exercise.demo, side: this.call.side ?? this.side };
    if (this.phase === 'defending') return { demo: DEFENCES[this.defence.kind].demo, side: this.side };
    return null;
  }

  /** The next thing on the list that this child can be asked for. */
  nextExercise() {
    const allowed = (name) => (this.allowJumps || !EXERCISES[name].needsJump) && !this.gaveUpOn.has(name);
    if (!ORDER.some(allowed)) this.gaveUpOn.clear();
    if (this.rules.mixed) {
      for (;;) {
        if (!this.queue.length) this.queue = this.mixedOrder();
        const name = this.queue.shift();
        if (allowed(name)) return name;
      }
    }
    for (;;) {
      const name = ORDER[this.nextIndex % ORDER.length];
      this.nextIndex += 1;
      if (allowed(name)) return name;
    }
  }

  /** The whole list in a new order, with the two steps of each combo still one after the other. */
  mixedOrder() {
    const pairs = COMBOS.map(({ steps }) => steps);
    const units = ORDER.filter((name) => !pairs.some((steps) => steps.slice(1).includes(name)))
      .map((name) => pairs.find((steps) => steps[0] === name) ?? [name]);
    for (let i = units.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [units[i], units[j]] = [units[j], units[i]];
    }
    return units.flat();
  }

  nextSide() {
    this.sidedCalls += 1;
    return this.sidedCalls % OTHER_SIDE_EVERY === 0 ? OTHER[this.side] : this.side;
  }

  startCall() {
    const name = this.nextExercise();
    const exercise = EXERCISES[name];
    const side = exercise.sided ? this.nextSide() : null;
    const { twice } = this.rules;
    this.call = {
      name,
      exercise,
      side,
      // How many times to do it, which is twice for some moves on the higher levels.
      times: twice > 0 && CAN_BE_TWICE.has(name) && this.random() < twice ? 2 : 1,
      done: 0,
      lastAt: -Infinity,
      trying: 0,
      askAgainIn: RULES.askAgainEvery,
      easing: exercise.ease ? new Easing(this.reader, exercise.ease, { side: side ?? this.side }) : null,
    };
    this.phase = 'asking';
    this.fight.emit('call', { name, side, times: this.call.times, done: 0 });
  }

  /** The child did something. It only matters if it's what was asked for. */
  onMoves(moves) {
    if (this.phase !== 'asking' || !moves.length) return;
    const { exercise, side } = this.call;
    const done = moves.find(({ move, side: used }) => exercise.reads.includes(move) && (!side || used === side));
    if (done) {
      if (this.time - this.call.lastAt < REP_GAP) return;
      this.call.lastAt = this.time;
      this.call.done += 1;
      if (this.call.done < this.call.times) this.rep();
      else this.succeed(done);
      return;
    }
    for (const move of moves) this.smallHit(move);
    // A closed hand is a fist, and that's the one thing a push is for not being.
    if (this.call.name === 'push' && moves.some(({ move, side: used }) => move === 'punch' && used === side)) {
      this.fight.emit('open-your-hand', { side });
      return;
    }
    const wrongSide = side && moves.some(({ move }) => exercise.reads.includes(move));
    if (wrongSide || moves.some(({ move }) => CLEARLY_SOMETHING_ELSE.has(move))) this.nudge();
  }

  /** A real fighting move, but not the one asked for. It lands, but it doesn't do much. */
  smallHit({ move, side = null, hand = null, slow = false }) {
    const strike = SMALL_HITS[move];
    if (!strike || slow || this.time - this.lastSmallHit < RULES.smallHitEvery) return;
    this.lastSmallHit = this.time;
    this.fight.noteActivity(0);
    this.fight.perform('player', strike, { side, hand, small: true });
  }

  /** The child is doing something else, so they're told again what's wanted. Now and then. */
  nudge() {
    if (this.phase !== 'asking' || this.time - this.lastNudge < RULES.nudgeEvery) return;
    this.lastNudge = this.time;
    this.call.askAgainIn = RULES.askAgainEvery;
    this.fight.emit('nudge', { name: this.call.name, side: this.call.side });
  }

  /** One of a move asked for twice: seen, and once more to go. */
  rep() {
    const { call, fight } = this;
    call.trying = 0;
    fight.noteActivity(0);
    fight.emit('rep', { name: call.name, side: call.side, done: call.done, times: call.times });
  }

  succeed({ hand = null }) {
    const { name, exercise, side } = this.call;
    this.fight.noteActivity(0);
    this.fight.emit('call-done', { name, side });
    this.fight.perform('player', exercise.move, { side, hand, exercise: name, reps: this.call.times });
    this.call = null;
    this.wait(MOVES[exercise.move].hitAt + this.rules.afterMove);
  }

  updateAsking(dt) {
    const { call, fight, reader } = this;
    if (reader.moving) call.trying += dt;
    call.easing?.update(dt);

    if (fight.resting !== this.wasResting) {
      this.wasResting = fight.resting;
      if (fight.resting) fight.emit('resting');
    }
    call.askAgainIn -= dt;
    if (call.askAgainIn <= 0) {
      call.askAgainIn = RULES.askAgainEvery;
      if (!fight.resting) fight.emit('call-again', { name: call.name, side: call.side });
    }
    // Some moves may just be too hard today, and nobody should be stuck on one.
    if (call.trying >= RULES.giveUpAfter) {
      this.gaveUpOn.add(call.name);
      fight.emit('try-another', { name: call.name });
      this.call = null;
      this.wait(this.rules.afterMove);
      return;
    }
    // The computer gets its turn if the child is up and moving, whatever they're doing.
    if (!fight.resting) this.computerIn -= dt;
    if (this.computerIn <= 0) this.startDefence();
  }

  /**
   * The computer's turn. Whatever the coach was asking for waits until it's over. On the higher
   * levels it can be two hits, the second needing the other way out, and each with its own warning.
   */
  startDefence(kind = null) {
    const { level, fight } = this;
    const second = Boolean(kind);
    kind ??= level.defences[this.defences % level.defences.length];
    const move = level.moves[this.computerMoves % level.moves.length];
    if (!second) this.defences += 1;
    this.computerMoves += 1;
    const other = level.defences.find((one) => one !== kind);
    const then = !second && other && this.rules.doubles > 0 && this.random() < this.rules.doubles ? other : null;
    this.defence = { kind, move, left: level.warning, done: false, waited: false, then, second };
    this.phase = 'defending';
    fight.warn('npc', move);
    fight.emit('defend', { kind, second });
  }

  updateDefending(dt) {
    const { defence, fight, reader, level } = this;
    if (!defence.done) {
      // They've hardly moved since being warned, so they're resting. It waits, and they get a
      // whole warning again when they do move.
      if (fight.idleSeconds >= level.warning * RULES.stillForWarning) {
        defence.left = level.warning;
        if (!defence.waited) {
          defence.waited = true;
          fight.emit('resting');
        }
        return;
      }
      const seen = defence.kind === 'block' ? reader.guard : Math.abs(reader.dodge) > 0.5;
      if (seen) {
        defence.done = true;
        defence.left = Math.min(defence.left, RULES.swingAfterDefence);
        // It stays that way until the move has landed, so a child doesn't have to hold it.
        fight.setGuard('player', defence.kind === 'block');
        fight.setDodge('player', defence.kind === 'lean' ? 1 : 0);
        fight.noteActivity(0);
        fight.emit('defended', { kind: defence.kind });
      }
    }
    defence.left -= dt;
    if (defence.left > 0) return;
    fight.clearWarning('npc');
    fight.perform('npc', defence.move);
    this.computerIn = level.every;
    this.followUp = defence.then;
    this.wait(MOVES[defence.move].hitAt + RULES.afterSwing);
    this.defence = null;
  }

  /** After a pause: back to what was being asked for, or on to the next thing. */
  advance() {
    this.fight.setGuard('player', false);
    this.fight.setDodge('player', 0);
    if (this.followUp) {
      const kind = this.followUp;
      this.followUp = null;
      this.startDefence(kind);
    } else if (this.call) {
      this.phase = 'asking';
      this.call.askAgainIn = RULES.askAgainEvery;
      this.fight.emit('call', { name: this.call.name, side: this.call.side, times: this.call.times, done: this.call.done });
    } else {
      this.startCall();
    }
  }

  update(dt) {
    this.time += dt;
    if (this.fight.state !== 'fighting') return;
    if (this.phase === 'asking') {
      this.updateAsking(dt);
    } else if (this.phase === 'defending') {
      this.updateDefending(dt);
    } else {
      this.timer -= dt;
      if (this.timer <= 0) this.advance();
    }
  }
}
