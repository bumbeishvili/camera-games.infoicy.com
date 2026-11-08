// The rules of a fight and the coach that runs it, without a screen or a camera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CLIPS } from '../../games/mighty-moves/clips.js';
import { Coach } from '../../games/mighty-moves/coach.js';
import { Fight } from '../../games/mighty-moves/fight.js';
import { CAN_BE_TWICE, COMBOS, DEFENCES, EXERCISES, MOVES, NPC_LEVELS, ORDER, RULES, fightLevel } from '../../games/mighty-moves/moves.js';
import { DEMOS } from '../../core/body/demos.js';
import { ICONS } from '../../core/body/icons.js';
import { ROSTER } from '../../core/body/roster.js';

const MEDIUM = { ...NPC_LEVELS.medium, mercy: 0 };

function setup(options = {}) {
  const events = [];
  const fight = new Fight({ level: MEDIUM, onEvent: (event) => events.push(event), ...options });
  fight.beginRound();
  return { fight, events };
}

const run = (fight, seconds) => {
  for (let t = 0; t < seconds; t += 0.02) fight.update(0.02);
};
const landed = (events) => events.filter(({ type }) => type === 'hit');
const lastHit = (events) => landed(events).at(-1);

/** Performs a move, and returns what it did with nothing else going on. */
function damageOf(move, options = {}, setupOptions = {}) {
  const { fight, events } = setup(setupOptions);
  fight.perform('player', move, options);
  run(fight, 1);
  return lastHit(events).damage;
}

/** Just enough of a body reader for a coach to watch. */
const fakeReader = (changes = {}) => ({
  moving: false,
  guard: false,
  dodge: 0,
  jumpEffort: 0,
  sink: 0,
  footHeight: 0,
  handHeight: { left: -0.9, right: -0.9 },
  personal: { jump: null, squat: null, leg: null, hand: null },
  jumpNeeded: 0.06,
  squatNeeded: 0.16,
  legNeeded: 0.16,
  handNeeded: 0.27,
  ...changes,
});

function coached(options = {}, coachOptions = {}) {
  const { fight, events } = setup(options);
  const reader = fakeReader();
  const coach = new Coach({ fight, reader, ...coachOptions });
  coach.beginRound();
  // Everything goes forward together, as it does in the game.
  const pass = (seconds, each = () => {}) => {
    for (let t = 0; t < seconds; t += 0.02) {
      each();
      if (reader.moving) fight.noteActivity(0.02);
      coach.update(0.02);
      fight.update(0.02);
    }
  };
  pass(RULES.firstCallAfter + 0.05);
  return { fight, events, reader, coach, pass };
}

/** What the reader would see for whatever the coach is asking for. */
const whatsAsked = ({ call }) => [{ move: call.exercise.reads[0], side: call.side, hand: 'open' }];
const named = (events, type) => events.filter((event) => event.type === type);

test('there are ten fighters, each with their own look, name and signature move', () => {
  assert.equal(ROSTER.length, 10);
  for (const field of ['id', 'name', 'nameKa', 'signature', 'signatureKa', 'shout', 'shoutKa', 'voice']) {
    assert.equal(new Set(ROSTER.map((fighter) => fighter[field])).size, field === 'voice' ? ROSTER.length : 10, field);
  }
});

test('the coach asks for concrete moves, and every one has a film, a picture and words to go with it', () => {
  for (const wanted of ['clap', 'squat', 'jump', 'handCircle', 'kneeLift', 'kick']) assert.ok(ORDER.includes(wanted), wanted);
  for (const [name, exercise] of Object.entries(EXERCISES)) {
    assert.ok(DEMOS[exercise.demo], `${name} has a film`);
    assert.ok(ICONS[name], `${name} has a picture`);
    assert.ok(CLIPS[exercise.move], `${name} has something for the fighter to do`);
    assert.ok(MOVES[exercise.move].name, `${name} has a name to call out`);
    assert.ok(exercise.reads.length > 0, name);
    assert.ok(exercise.label, name);
    assert.equal(exercise.seen.length, 2, name);
    assert.match(exercise.seen[1], /[Ⴀ-ჿ]/, name);
    if (exercise.sided) {
      assert.match(exercise.ask.left, /left/, name);
      assert.match(exercise.ask.right, /right/, name);
    } else {
      assert.equal(typeof exercise.ask, 'string', name);
    }
  }
  for (const { demo } of Object.values(DEFENCES)) assert.ok(DEMOS[demo], demo);
});

test('the first thing asked for is shown and said, and then it waits for as long as it takes', () => {
  const { coach, events, pass } = coached();
  assert.equal(coach.phase, 'asking');
  assert.equal(coach.call.name, ORDER[0]);
  assert.deepEqual(named(events, 'call').map(({ name }) => name), [ORDER[0]]);
  pass(60);
  assert.equal(coach.call.name, ORDER[0], 'a child who isn\'t moving isn\'t hurried');
  assert.equal(named(events, 'move').length, 0);
  assert.ok(named(events, 'resting').length === 1, 'and is told that\'s fine, once');
});

test('doing what was asked makes the big move, and then it asks for the next thing', () => {
  const { coach, events, fight, pass } = coached();
  coach.onMoves(whatsAsked(coach));
  assert.equal(named(events, 'call-done').length, 1);
  const [move] = named(events, 'move');
  assert.equal(move.move, MOVES[EXERCISES[ORDER[0]].move] && EXERCISES[ORDER[0]].move);
  assert.equal(move.small, false);
  pass(0.5);
  assert.ok(fight.npc.hp <= RULES.maxHp - 10, `now ${fight.npc.hp}`);
  assert.equal(fight.stats.exercises[ORDER[0]], 1);
  pass(RULES.afterMove + 0.3);
  assert.equal(coach.phase, 'asking');
  assert.equal(coach.call.name, ORDER[1]);
});

test('every move on the list gets asked for in turn', () => {
  const { coach, pass } = coached({ level: { ...MEDIUM, every: 1000 } });
  const asked = [];
  for (let i = 0; i < ORDER.length; i += 1) {
    asked.push(coach.call.name);
    coach.fight.npc.hp = RULES.maxHp;
    coach.onMoves(whatsAsked(coach));
    pass(2.6);
  }
  assert.deepEqual(asked, ORDER);
});

test('anything else does nothing big, and a big exercise that wasn\'t asked for does nothing at all', () => {
  const { coach, events, fight } = coached();
  assert.equal(coach.call.name, 'clap');
  coach.onMoves([{ move: 'stomp', exercise: 'squat' }]);
  coach.onMoves([{ move: 'flying', exercise: 'jump' }]);
  coach.onMoves([{ move: 'circle', side: 'right' }]);
  assert.equal(named(events, 'move').length, 0);
  assert.equal(fight.stats.exercises.squat, 0);
  assert.equal(coach.call.name, 'clap');
  assert.equal(named(events, 'nudge').length, 1, 'it says so, but not over and over');
});

test('ordinary punches and kicks are small hits, which land, in the way they were made', () => {
  const { coach, events, fight, pass } = coached();
  assert.equal(coach.call.name, 'clap');
  coach.onMoves([{ move: 'palm', side: 'left', hand: 'open' }]);
  pass(0.8);
  coach.onMoves([{ move: 'kick', side: 'right' }]);
  pass(0.8);
  coach.onMoves([{ move: 'uppercut', side: 'right', hand: null }]);
  pass(0.8);
  coach.onMoves([{ move: 'punch', side: 'left', hand: 'closed' }]);
  pass(0.8);
  const moves = named(events, 'move');
  assert.deepEqual(moves.map(({ move, side }) => [move, side]), [['palm', 'left'], ['kick', 'right'], ['uppercut', 'right'], ['punch', 'left']]);
  assert.ok(moves.every(({ small }) => small));
  assert.equal(landed(events).length, 4);
  const total = RULES.maxHp - fight.npc.hp;
  assert.ok(total < 15, `four small hits took ${total}`);
  assert.equal(coach.call.name, 'clap', 'and what was asked for is still what\'s asked for');
  assert.equal(fight.player.power, 0, 'and they don\'t fill the power bar');
});

test('small hits have a rest between them, so waving about isn\'t quicker than doing as asked', () => {
  const { coach, events, pass } = coached();
  for (let i = 0; i < 20; i += 1) {
    coach.onMoves([{ move: 'palm', side: 'left', hand: 'open' }]);
    pass(0.1);
  }
  const hits = named(events, 'move').length;
  assert.ok(hits <= 3 + 1, `${hits} in two seconds`);
});

test('a slow arm movement isn\'t a small hit, but it can be the push that was asked for', () => {
  const { coach, events } = coached();
  coach.nextIndex = ORDER.indexOf('push');
  coach.call = null;
  coach.startCall();
  const { side } = coach.call;
  coach.onMoves([{ move: 'palm', side: side === 'left' ? 'right' : 'left', hand: 'open', slow: true }]);
  assert.equal(named(events, 'move').length, 0);
  coach.onMoves([{ move: 'palm', side, hand: 'open', slow: true }]);
  assert.equal(named(events, 'move').length, 1);
  assert.equal(named(events, 'move')[0].small, false);
});

test('small hits can\'t win: they stop doing anything long before the opponent is beaten', () => {
  const { coach, events, fight, pass, reader } = coached({ level: { ...NPC_LEVELS.gentle, every: 1000 } }, {});
  reader.moving = true;
  for (let t = 0; t < 180; t += 0.25) {
    fight.noteActivity(0);
    coach.onMoves([{ move: 'palm', side: 'right', hand: 'open' }]);
    pass(0.25);
    coach.call.trying = 0;
  }
  assert.equal(fight.state, 'fighting');
  assert.ok(fight.npc.hp >= RULES.maxHp - RULES.smallHitsMost - 1e-9, `now ${fight.npc.hp}`);
  assert.ok(landed(events).length > 100);
  assert.ok(lastHit(events).blocked, 'the opponent just blocks them after that');
  assert.ok(named(events, 'small-hits-spent').length > 0);
});

test('a round takes about ten of the moves asked for', () => {
  const { coach, fight, pass } = coached({ rounds: 1, level: { ...MEDIUM, every: 1000 } });
  let moves = 0;
  while (fight.state === 'fighting' && moves < 40) {
    coach.onMoves(whatsAsked(coach));
    moves += 1;
    pass(2.8);
  }
  assert.equal(fight.winner, 'player');
  assert.ok(moves >= 6 && moves <= 12, `${moves} moves`);
});

test('moves on a side have to be on the side asked for', () => {
  const { coach, events } = coached({}, { side: 'right' });
  coach.nextIndex = ORDER.indexOf('handCircle');
  coach.call = null;
  coach.startCall();
  assert.equal(coach.call.side, 'right');
  coach.onMoves([{ move: 'circle', side: 'left' }]);
  assert.equal(named(events, 'move').length, 0);
  assert.equal(named(events, 'nudge').length, 1);
  coach.onMoves([{ move: 'circle', side: 'right' }]);
  assert.equal(named(events, 'move')[0].move, 'whirlwind');
});

test('most moves on a side are on the side being worked on', () => {
  const { coach } = coached({}, { side: 'left' });
  const sides = Array.from({ length: 9 }, () => coach.nextSide());
  assert.equal(sides.filter((side) => side === 'left').length, 6);
  assert.equal(sides.filter((side) => side === 'right').length, 3);
});

test('a push with a fist doesn\'t count: it\'s a small hit, and the child is asked to open their hand', () => {
  const { coach, events } = coached({}, { side: 'right' });
  coach.nextIndex = ORDER.indexOf('push');
  coach.call = null;
  coach.startCall();
  coach.onMoves([{ move: 'punch', side: 'right', hand: 'closed' }]);
  assert.equal(named(events, 'open-your-hand')[0].side, 'right');
  assert.equal(named(events, 'call-done').length, 0);
  assert.equal(named(events, 'move')[0].small, true);
  assert.equal(coach.call.name, 'push');
  coach.onMoves([{ move: 'palm', side: 'right', hand: null, slow: true }]);
  assert.equal(named(events, 'call-done').length, 1, 'a hand that can\'t be read isn\'t held against them');
});

test('jumps are never asked for when a grown-up has turned them off', () => {
  const { coach } = coached({}, { allowJumps: false });
  const asked = new Set(Array.from({ length: 60 }, () => coach.nextExercise()));
  assert.equal(asked.has('jump'), false);
  assert.equal(asked.has('starJump'), false);
  assert.ok(asked.has('squat') && asked.has('clap'));
});

test('a move that\'s too hard today is put aside, so nobody gets stuck on one', () => {
  const { coach, events, reader, pass } = coached({ level: { ...MEDIUM, every: 1000 } });
  const stuck = coach.call.name;
  reader.moving = true;
  pass(RULES.giveUpAfter + 0.1);
  assert.deepEqual(named(events, 'try-another').map(({ name }) => name), [stuck]);
  pass(RULES.afterMove + 0.1);
  assert.notEqual(coach.call.name, stuck);
  assert.equal(new Set(Array.from({ length: ORDER.length - 2 }, () => coach.nextExercise())).has(stuck), false, 'and it isn\'t asked for again');
});

test('if every move has been put aside, they all come back', () => {
  const { coach } = coached();
  for (const name of ORDER) coach.gaveUpOn.add(name);
  assert.ok(ORDER.includes(coach.nextExercise()));
  assert.equal(coach.gaveUpOn.size, 0);
});

test('what counts for a move comes down for a child who is trying', () => {
  const { coach, reader, pass } = coached({ level: { ...MEDIUM, every: 1000 } });
  coach.nextIndex = ORDER.indexOf('squat');
  coach.call = null;
  coach.startCall();
  pass(5.2, () => {
    reader.sink = 0.1;
  });
  assert.ok(reader.personal.squat > 0.07 && reader.personal.squat < 0.1, `now ${reader.personal.squat}`);
});

test('the computer takes its turn while the child is moving, with a warning, and it hits hard', () => {
  const { coach, events, fight, reader, pass } = coached();
  const asked = coach.call.name;
  reader.moving = true;
  pass(MEDIUM.every + 0.1);
  assert.equal(coach.phase, 'defending');
  assert.equal(named(events, 'warning').length, 1);
  assert.equal(named(events, 'defend')[0].kind, 'block');
  assert.ok(fight.npc.warning);
  assert.equal(fight.player.hp, RULES.maxHp, 'nothing has landed yet');

  pass(MEDIUM.warning + 0.6);
  assert.equal(fight.npc.warning, null);
  const hit = lastHit(events);
  assert.equal(hit.attacker, 'npc');
  assert.ok(hit.damage >= RULES.smallHit * 5, `${hit.damage} against a small hit of ${RULES.smallHit}`);

  pass(RULES.afterSwing + 0.2);
  assert.equal(coach.phase, 'asking');
  assert.equal(coach.call.name, asked, 'and back to what was being asked for');
});

test('at every level the computer hits much harder than a small hit, and more at each level', () => {
  const hitAt = (level) => {
    const { fight, events } = setup({ level });
    fight.perform('npc', 'palm');
    run(fight, 0.5);
    return lastHit(events).damage;
  };
  const [gentle, medium, tough] = [NPC_LEVELS.gentle, NPC_LEVELS.medium, NPC_LEVELS.tough].map(hitAt);
  assert.ok(gentle > RULES.smallHit * 3, `gentle ${gentle}`);
  assert.ok(medium > gentle);
  assert.ok(tough > medium);
});

test('hands up when asked stops the hit, and as soon as they\'re up it happens', () => {
  const { coach, events, fight, reader, pass } = coached();
  reader.moving = true;
  pass(MEDIUM.every + 0.1);
  assert.equal(coach.phase, 'defending');
  pass(0.5);
  reader.guard = true;
  pass(0.1);
  assert.equal(named(events, 'defended')[0].kind, 'block');
  reader.guard = false; // They don't have to hold it.
  pass(0.6);
  assert.equal(fight.player.hp, RULES.maxHp);
  assert.equal(lastHit(events).blocked, true);
  pass(RULES.afterSwing);
  assert.equal(fight.player.guard, false);
});

test('leaning when asked gets out of the way, and leaning when not asked doesn\'t', () => {
  const asked = coached();
  asked.coach.defences = 1; // Medium takes turns: a block and then a lean.
  asked.reader.moving = true;
  asked.pass(MEDIUM.every + 0.1);
  assert.equal(named(asked.events, 'defend')[0].kind, 'lean');
  asked.reader.dodge = 0.8;
  asked.pass(0.7);
  assert.equal(asked.fight.player.hp, RULES.maxHp);
  assert.equal(named(asked.events, 'dodged').length, 1);

  const other = coached();
  other.reader.moving = true;
  other.pass(MEDIUM.every + 0.1);
  assert.equal(named(other.events, 'defend')[0].kind, 'block');
  other.reader.dodge = 0.8;
  other.pass(MEDIUM.warning + 0.6);
  assert.ok(other.fight.player.hp < RULES.maxHp);
});

test('a child who stands still is left alone, however long they rest, even at the toughest', () => {
  const { coach, events, fight, pass } = coached({ level: NPC_LEVELS.tough });
  pass(300);
  assert.equal(fight.player.hp, RULES.maxHp);
  assert.equal(named(events, 'move').length, 0);
  assert.equal(coach.phase, 'asking');
  assert.ok(fight.resting);
});

test('a child warned who then stops moving isn\'t hit, and gets the whole warning again', () => {
  const { coach, events, fight, reader, pass } = coached({ level: NPC_LEVELS.medium });
  reader.moving = true;
  pass(NPC_LEVELS.medium.every + 0.1);
  assert.equal(coach.phase, 'defending');
  reader.moving = false;
  pass(30);
  assert.equal(fight.player.hp, RULES.maxHp);
  assert.equal(coach.phase, 'defending');
  assert.ok(named(events, 'resting').length >= 1);
  reader.moving = true;
  pass(NPC_LEVELS.medium.warning - 0.5);
  assert.equal(fight.player.hp, RULES.maxHp, 'there\'s time again');
  pass(1.2);
  assert.ok(fight.player.hp < RULES.maxHp);
});

test('waving arms about while the computer hits back is a losing game above the gentlest level', () => {
  const { coach, fight, reader, pass } = coached({ rounds: 1, level: NPC_LEVELS.medium });
  reader.moving = true;
  for (let t = 0; t < 400 && fight.state === 'fighting'; t += 0.25) {
    coach.onMoves([{ move: 'palm', side: 'right', hand: 'open' }]);
    pass(0.25);
    if (coach.call) coach.call.trying = 0;
  }
  assert.equal(fight.winner, 'npc');
  assert.ok(fight.npc.hp > 50, `the computer still has ${fight.npc.hp}`);
});

test('doing what\'s asked beats the computer, even without blocking, on the medium level', () => {
  const { coach, fight, reader, pass } = coached({ rounds: 1, level: NPC_LEVELS.medium });
  reader.moving = true;
  for (let t = 0; t < 400 && fight.state === 'fighting'; t += 0.5) {
    if (coach.phase === 'asking') coach.onMoves(whatsAsked(coach));
    pass(0.5);
  }
  assert.equal(fight.winner, 'player');
  assert.ok(fight.player.hp > 0);
});

test('a move with the hand seen open does more, and an unreadable hand gets no bonus', () => {
  const open = damageOf('palm', { side: 'left', hand: 'open' });
  assert.equal(damageOf('palm', { side: 'left', hand: null }), MOVES.palm.damage);
  assert.ok(open > MOVES.palm.damage * 1.3);
});

test('moves on the side being worked on do more', () => {
  const focus = damageOf('kick', { side: 'left' }, { focusSide: 'left' });
  const otherSide = damageOf('kick', { side: 'right' }, { focusSide: 'left' });
  assert.ok(focus > otherSide);
});

test('the moves asked for, one after the other, can be a combo', () => {
  for (const { steps, name } of COMBOS) {
    const { fight, events } = setup();
    for (const step of steps) {
      fight.perform('player', EXERCISES[step].move, { exercise: step });
      run(fight, 0.8);
    }
    assert.ok(events.some((event) => event.type === 'combo' && event.name === name), name);
    // They come one after the other on the list too, or they'd never happen.
    assert.equal(ORDER.indexOf(steps[1]), ORDER.indexOf(steps[0]) + 1, name);
  }
});

test('a combo needs its steps close enough together', () => {
  const { fight, events } = setup();
  fight.perform('player', 'stomp', { exercise: 'squat' });
  run(fight, 16);
  fight.perform('player', 'flying', { exercise: 'jump' });
  run(fight, 0.6);
  assert.equal(events.some(({ type }) => type === 'combo'), false);
});

test('sky charge does no damage itself and powers up the next move, however long that takes', () => {
  const { fight, events } = setup();
  fight.perform('player', 'skyCharge', { exercise: 'skyReach' });
  run(fight, 20);
  assert.equal(landed(events).length, 0);
  fight.perform('player', 'kick', { side: 'left', exercise: 'kick' });
  run(fight, 0.5);
  assert.ok(lastHit(events).reasons.includes('charged'));
  fight.perform('player', 'kick', { side: 'left', exercise: 'kick' });
  run(fight, 0.5);
  assert.equal(lastHit(events).reasons.includes('charged'), false, 'once only');
});

test('a small hit doesn\'t use up a charge or a full power bar', () => {
  const { fight, events } = setup();
  fight.player.power = 100;
  fight.player.charged = true;
  fight.perform('player', 'palm', { side: 'left', hand: 'open', small: true });
  run(fight, 0.4);
  assert.equal(lastHit(events).signature, false);
  assert.equal(fight.player.charged, true);
  assert.equal(fight.player.power, 100);
});

test('a full power bar turns the next big move into the fighter\'s own', () => {
  const { fight, events } = setup();
  fight.player.power = 100;
  fight.perform('player', 'stomp', { exercise: 'squat' });
  run(fight, 0.6);
  assert.equal(lastHit(events).signature, true);
  assert.ok(fight.player.power <= RULES.powerPerExercise + RULES.powerPerHit);
  assert.equal(fight.stats.signatures, 1);
});

test('the numbers for grown-ups count each side, each exercise and each kind of hand', () => {
  const { fight } = setup();
  fight.perform('player', 'palm', { side: 'left', hand: 'open', exercise: 'push' });
  fight.perform('player', 'punch', { side: 'right', hand: 'closed', small: true });
  fight.perform('player', 'palm', { side: 'right', hand: null, small: true });
  fight.perform('player', 'whirlwind', { side: 'left', hand: 'open', exercise: 'handCircle' });
  fight.perform('player', 'kick', { side: 'left', small: true });
  fight.perform('player', 'stomp', { exercise: 'squat' });
  fight.perform('player', 'flying', { exercise: 'jump' });
  const { strikes, kicks, hands, exercises } = fight.stats;
  assert.deepEqual(strikes, { left: 2, right: 2 });
  assert.deepEqual(kicks, { left: 1, right: 0 });
  assert.deepEqual(hands, { open: 2, closed: 1, unknown: 1 });
  assert.equal(exercises.squat, 1);
  assert.equal(exercises.jump, 1);
  assert.equal(exercises.handCircle, 1);
});

test('blocking stops all of a hit, and leaning avoids it', () => {
  const hitWith = (prepare) => {
    const { fight, events } = setup();
    prepare(fight);
    fight.perform('npc', 'kick');
    run(fight, 0.5);
    return { lost: RULES.maxHp - fight.player.hp, events };
  };
  assert.ok(hitWith(() => {}).lost > 0);
  assert.equal(hitWith((fight) => fight.setGuard('player', true)).lost, 0);
  const leaned = hitWith((fight) => fight.setDodge('player', 1));
  assert.equal(leaned.lost, 0);
  assert.ok(leaned.events.some(({ type }) => type === 'dodged'));
});

test('on the gentle level the computer can\'t knock a child out', () => {
  const { fight } = setup({ level: NPC_LEVELS.gentle });
  for (let i = 0; i < 200; i += 1) {
    fight.perform('npc', 'flying');
    run(fight, 0.6);
  }
  assert.equal(fight.state, 'fighting');
  assert.equal(fight.player.hp, NPC_LEVELS.gentle.mercy);
});

test('on the higher levels a fight can be lost', () => {
  const { fight, events } = setup({ level: NPC_LEVELS.medium, rounds: 1 });
  while (fight.state === 'fighting') {
    fight.perform('npc', 'flying');
    run(fight, 0.6);
  }
  assert.equal(fight.winner, 'npc');
  assert.ok(events.some(({ type, winner }) => type === 'fight-end' && winner === 'npc'));
});

test('knocking the computer out wins the round, and the fight takes two of three', () => {
  const { fight, events } = setup({ rounds: 3 });
  const knockOut = () => {
    while (fight.state === 'fighting') {
      fight.perform('player', 'stomp', { exercise: 'squat' });
      run(fight, 0.5);
    }
  };
  knockOut();
  assert.equal(fight.state, 'break');
  assert.equal(fight.npc.hp, 0);
  run(fight, 1);
  fight.beginRound();
  assert.equal(fight.npc.hp, RULES.maxHp);
  assert.equal(fight.round, 2);
  knockOut();
  assert.equal(fight.state, 'over');
  assert.equal(fight.winner, 'player');
  assert.equal(events.filter(({ type }) => type === 'round-end').length, 2);
});

test('small hits can do their bit again in a new round', () => {
  const { fight } = setup({ rounds: 3 });
  fight.player.smallHitsDealt = RULES.smallHitsMost;
  fight.npc.hp = 1;
  fight.perform('player', 'stomp', { exercise: 'squat' });
  run(fight, 0.5);
  fight.beginRound();
  assert.equal(fight.player.smallHitsDealt, 0);
});

test('health never goes below nothing, and nothing happens after the fight', () => {
  const { fight, events } = setup({ rounds: 1 });
  fight.npc.hp = 1;
  fight.perform('player', 'starBurst', { exercise: 'starJump' });
  run(fight, 0.6);
  assert.equal(fight.npc.hp, 0);
  assert.equal(fight.state, 'over');
  const count = events.length;
  assert.equal(fight.perform('player', 'palm', { side: 'left' }), null);
  run(fight, 2);
  assert.equal(events.length, count);
});

test('everything Mighty Moves says has a voice file, in English and in Georgian', () => {
  const lines = JSON.parse(readFileSync(new URL('../../games/mighty-moves/audio/voice/lines.json', import.meta.url)));
  const shared = JSON.parse(readFileSync(new URL('../../core/body/voice/lines.json', import.meta.url)));
  const core = JSON.parse(readFileSync(new URL('../../core/audio/voice/lines.json', import.meta.url)));
  const known = new Set([...lines, ...shared, ...core].map(({ text }) => text));
  for (const { id, ka } of lines) {
    assert.ok(ka, `${id} has no Georgian`);
    for (const language of ['en', 'ka']) {
      assert.ok(existsSync(new URL(`../../games/mighty-moves/audio/voice/${language}/${id}.ogg`, import.meta.url)), `${language}/${id}.ogg is missing`);
    }
  }

  const source = ['../../games/mighty-moves/main.js', '../../core/body/game.js']
    .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
    .join('\n');
  const asked = new Set();
  for (const block of source.matchAll(/const (?:SAY|ROUND_WORDS|BODY_SAY) = \{([\s\S]+?)\n?\};/g)) {
    for (const [, text] of block[1].matchAll(/'([^']+)'/g)) asked.add(text);
  }
  for (const { ask } of Object.values(EXERCISES)) {
    for (const text of typeof ask === 'string' ? [ask] : Object.values(ask)) asked.add(text);
  }
  for (const { ask } of Object.values(DEFENCES)) asked.add(ask);
  for (const { name } of Object.values(MOVES)) if (name) asked.add(`${name}!`);
  for (const { name } of COMBOS) asked.add(`${name}!`);
  for (const { signature } of ROSTER) asked.add(`${signature}!`);
  assert.ok(asked.size > 50, `only found ${asked.size} lines`);
  assert.deepEqual([...asked].filter((text) => !known.has(text)), []);
  // Nothing rendered that the game can no longer say.
  const gameLines = lines.map(({ text }) => text);
  assert.deepEqual(gameLines.filter((text) => !asked.has(text)), []);
});

test('there\'s a film of every move, which never leaves a limb past where it can reach', () => {
  for (const [name, { frames }] of Object.entries(DEMOS)) {
    assert.ok(frames.length >= 2, name);
    frames.forEach(([t], index) => {
      if (index) assert.ok(t > frames[index - 1][0], `${name} goes forwards in time`);
    });
    assert.ok(frames.at(-1)[0] >= 0.8, `${name} is slow enough to follow`);
    for (const [, pose] of frames) {
      for (const value of Object.values(pose)) assert.ok(Number.isFinite(value), name);
    }
  }
});

/* ---------- levels ---------- */

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);
const seeded = (seed = 1) => {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};
const atLevel = (levelNumber, options = {}, coachOptions = {}) => coached({ levelNumber, ...options }, { random: seeded(3), ...coachOptions });

test('level 1 is the fight as it always was, at every strength', () => {
  assert.deepEqual(fightLevel(1), { turnEvery: 1, warning: 1, afterMove: RULES.afterMove, defences: [], npcMoves: [], doubles: 0, mixed: false, twice: 0 });
  for (const strength of Object.values(NPC_LEVELS)) {
    const { coach, fight } = coached({ level: strength });
    assert.equal(fight.levelNumber, 1);
    for (const field of ['every', 'warning', 'defences', 'moves', 'damage', 'mercy']) assert.deepEqual(coach.level[field], strength[field], `${strength.name} ${field}`);
  }
  // The same order every time round, and everything asked for once.
  const { coach } = coached();
  coach.nextIndex = 0;
  assert.deepEqual(Array.from({ length: ORDER.length * 2 }, () => coach.nextExercise()), [...ORDER, ...ORDER]);
  assert.ok(Array.from({ length: 30 }, () => (coach.startCall(), coach.call.times)).every((times) => times === 1));
});

test('level 1 fights go exactly as they did before there were levels', () => {
  // A scripted child doing what's asked every 2.4 seconds and blocking now and then, at each strength,
  // gave exactly these with the code from before levels: the winner, the time, and what happened.
  const expected = ['player 36.82 72 692', 'player 39.22 77 725', 'player 39.22 77 730'];
  Object.values(NPC_LEVELS).forEach((strength, index) => {
    const happened = [];
    const fight = new Fight({ rounds: 3, level: strength, onEvent: (event) => happened.push(event.type + (event.name ?? event.kind ?? '')) });
    const reader = fakeReader({ moving: true });
    const coach = new Coach({ fight, reader });
    let t = 0;
    while (fight.state !== 'over' && t < 900) {
      fight.beginRound();
      coach.beginRound();
      let frame = 0;
      while (fight.state === 'fighting' && t < 900) {
        t += 0.02;
        frame += 1;
        if (coach.phase === 'asking' && frame % 120 === 0) coach.onMoves(whatsAsked(coach));
        reader.guard = coach.phase === 'defending' && frame % 3 === 0 && coach.defence.kind === 'block';
        fight.noteActivity(0.02);
        coach.update(0.02);
        fight.update(0.02);
      }
    }
    assert.equal(`${fight.winner} ${t.toFixed(2)} ${happened.length} ${happened.join('|').length}`, expected[index], strength.name);
  });
});

test('each level is the same as the one before or harder, in every way, and always harder in something', () => {
  for (const level of LEVELS.slice(1)) {
    const before = fightLevel(level - 1);
    const now = fightLevel(level);
    assert.ok(now.turnEvery <= before.turnEvery && now.warning <= before.warning && now.afterMove <= before.afterMove, `${level}: pace`);
    assert.ok(before.defences.every((kind) => now.defences.includes(kind)) && before.npcMoves.every((move) => now.npcMoves.includes(move)), `${level}: nothing taken away`);
    assert.ok(now.doubles >= before.doubles && now.twice >= before.twice && (now.mixed || !before.mixed), `${level}: new things stay`);
    const harder = [now.turnEvery < before.turnEvery, now.warning < before.warning, now.defences.length > before.defences.length, now.npcMoves.length > before.npcMoves.length, now.doubles > before.doubles, now.mixed && !before.mixed, now.twice > before.twice];
    assert.ok(harder.some(Boolean), `${level}: something is harder`);
  }
  // New kinds of things, from level 3.
  assert.deepEqual([3, 4, 5, 6, 7].map((level) => {
    const now = fightLevel(level);
    return [now.defences.length, now.npcMoves.length, now.doubles > 0, now.mixed, now.twice > 0];
  }), [[1, 0, false, false, false], [1, 2, false, false, false], [1, 2, true, false, false], [1, 2, true, true, false], [1, 5, true, true, true]]);
});

test('on the higher levels the computer comes more often and with more moves, but never takes away its warning', () => {
  for (const strength of Object.values(NPC_LEVELS)) {
    const { coach } = atLevel(10, { level: strength });
    assert.ok(coach.level.warning >= strength.warning * 0.7, `${strength.name}: ${coach.level.warning} seconds of warning`);
    assert.ok(coach.level.every < strength.every);
    assert.deepEqual(new Set(coach.level.defences), new Set(['block', 'lean']));
    assert.ok(coach.level.moves.length > strength.moves.length || strength.moves.length >= 7);
    assert.equal(coach.level.damage, strength.damage, 'how hard it hits is still the grown-ups\' choice');
    assert.equal(coach.level.mercy, strength.mercy);
  }
  // Leaning comes in on Gentle at level 3.
  const gentle = atLevel(3, { level: NPC_LEVELS.gentle });
  assert.deepEqual(gentle.coach.level.defences, ['block', 'lean']);
});

test('from level 5 a turn can be two hits, one to block and one to lean from, each with its whole warning', () => {
  const { coach, events, fight, reader, pass } = atLevel(10, { level: NPC_LEVELS.medium }, { random: () => 0 });
  reader.moving = true;
  pass(coach.level.every + 0.1);
  assert.equal(coach.phase, 'defending');
  assert.equal(coach.defence.then, 'lean');
  reader.guard = true;
  pass(0.1);
  reader.guard = false;
  let secondFrom = null;
  pass(RULES.swingAfterDefence + 0.4 + RULES.afterSwing + 0.2, () => {
    if (coach.defence?.second && secondFrom === null) secondFrom = coach.defence.left;
  });
  assert.equal(coach.phase, 'defending', 'straight into the second');
  assert.equal(coach.defence.kind, 'lean');
  assert.equal(coach.defence.second, true);
  assert.equal(secondFrom, coach.level.warning, 'with its whole warning');
  reader.dodge = 0.8;
  pass(1);
  reader.dodge = 0;
  pass(1.5);
  assert.equal(fight.player.hp, RULES.maxHp, 'both got out of the way of');
  assert.deepEqual(named(events, 'defended').map(({ kind }) => kind), ['block', 'lean']);
  assert.equal(coach.phase, 'asking', 'and back to what was being asked for');
});

test('from level 6 the moves come in a mixed-up order, all of them each time round, with combos together', () => {
  const { coach } = atLevel(6);
  coach.queue = [];
  const rounds = Array.from({ length: 4 }, () => Array.from({ length: ORDER.length }, () => coach.nextExercise()));
  for (const round of rounds) {
    assert.deepEqual([...round].sort(), [...ORDER].sort());
    for (const { steps } of COMBOS) assert.equal(round.indexOf(steps[1]), round.indexOf(steps[0]) + 1, steps.join(' then '));
  }
  assert.ok(rounds.some((round) => round.join() !== ORDER.join()), 'and not the same as the list');
  const noJumps = atLevel(10, {}, { allowJumps: false });
  const asked = Array.from({ length: 40 }, () => noJumps.coach.nextExercise());
  assert.ok(!asked.includes('jump') && !asked.includes('starJump'), 'and jumps that are off stay off');
});

test('from level 7 some moves are asked for twice, and only the second makes the big move', () => {
  const { coach, events, pass } = atLevel(10, { level: { ...MEDIUM, every: 1000 } }, { random: () => 0 });
  coach.nextIndex = 0;
  coach.queue = ['squat'];
  coach.call = null;
  coach.startCall();
  assert.equal(coach.call.times, 2);
  assert.equal(named(events, 'call').at(-1).times, 2);
  coach.onMoves(whatsAsked(coach));
  assert.equal(named(events, 'rep').length, 1);
  assert.equal(named(events, 'move').length, 0, 'not yet');
  coach.onMoves(whatsAsked(coach));
  assert.equal(named(events, 'move').length, 0, 'the same moment can\'t count twice');
  pass(0.6);
  coach.onMoves(whatsAsked(coach));
  assert.equal(named(events, 'move').length, 1);
  assert.equal(named(events, 'call-done').length, 1);
  // Jumps, high knees and reaching up are never asked for twice.
  for (const name of ['jump', 'starJump', 'highKnees', 'skyReach']) {
    assert.equal(CAN_BE_TWICE.has(name), false, name);
    coach.queue = [name];
    coach.call = null;
    coach.startCall();
    assert.equal(coach.call.times, 1, name);
  }
});

test('at level 10 a child standing still is still left alone, and Gentle still can\'t knock a child out', () => {
  const resting = atLevel(10, { level: NPC_LEVELS.tough });
  resting.pass(300);
  assert.equal(resting.fight.player.hp, RULES.maxHp);
  assert.equal(named(resting.events, 'move').length, 0);

  const { coach, fight, reader, pass } = atLevel(10, { level: NPC_LEVELS.gentle, rounds: 1 });
  reader.moving = true;
  pass(400, () => {
    if (coach.call) coach.call.trying = 0;
  });
  assert.equal(fight.state, 'fighting');
  assert.equal(fight.player.hp, NPC_LEVELS.gentle.mercy);
});

/**
 * A child doing what's asked: react seconds after each thing is asked for, and defend seconds after
 * each warning. Plays a whole fight, and says how long it took and how many moves it asked for.
 */
function playFight({ levelNumber, strength = NPC_LEVELS.gentle, rounds = 3, seed = 1, react = 2.5, defend = 1.2 }) {
  const fight = new Fight({ rounds, level: strength, levelNumber, onEvent: () => {} });
  const reader = fakeReader({ moving: true });
  const coach = new Coach({ fight, reader, random: seeded(seed) });
  let seconds = 0;
  let moves = 0;
  while (fight.state !== 'over' && seconds < 2000) {
    fight.beginRound();
    coach.beginRound();
    let askedFor = null;
    let askedAt = 0;
    let warned = null;
    let warnedAt = 0;
    while (fight.state === 'fighting' && seconds < 2000) {
      seconds += 0.02;
      // A new thing asked for, or the second time of one asked for twice, starts the child's clock.
      if (coach.phase === 'asking' && (coach.call !== askedFor?.call || askedFor.done !== coach.call.done)) {
        askedFor = { call: coach.call, done: coach.call.done };
        askedAt = seconds;
      }
      if (coach.phase === 'asking' && seconds - askedAt >= react) {
        coach.onMoves(whatsAsked(coach));
        moves += 1;
        askedAt = Infinity;
      }
      if (coach.defence !== warned) {
        warned = coach.defence;
        warnedAt = seconds;
        reader.guard = false;
        reader.dodge = 0;
      }
      if (warned && !warned.done && seconds - warnedAt >= defend) {
        reader.guard = warned.kind === 'block';
        reader.dodge = warned.kind === 'lean' ? 0.8 : 0;
        if (!warned.counted) moves += 1;
        warned.counted = true;
      }
      fight.noteActivity(0.02);
      coach.update(0.02);
      fight.update(0.02);
    }
    // The break between rounds, the same at every level.
    seconds += RULES.breakSeconds + 3;
  }
  return { seconds, perMinute: moves / (seconds / 60), winner: fight.winner };
}

test('level 10 is still doable: as long to react, no more than double the moves, and not much longer', () => {
  for (const strength of Object.values(NPC_LEVELS)) {
    for (const react of [1.5, 3]) {
      const mean = (levelNumber) => {
        const fights = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => playFight({ levelNumber, strength, seed, react }));
        assert.ok(fights.every(({ winner }) => winner === 'player'), `${strength.name} at level ${levelNumber}: doing as the coach says wins`);
        return { seconds: fights.reduce((sum, one) => sum + one.seconds, 0) / fights.length, perMinute: fights.reduce((sum, one) => sum + one.perMinute, 0) / fights.length };
      };
      const first = mean(1);
      const last = mean(10);
      const name = `${strength.name}, ${react} seconds to each move`;
      assert.ok(last.seconds <= first.seconds * 1.33, `${name}: ${last.seconds} seconds against ${first.seconds}`);
      assert.ok(last.perMinute <= first.perMinute * 2, `${name}: ${last.perMinute} moves a minute against ${first.perMinute}`);
    }
  }
});
