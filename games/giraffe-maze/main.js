// Giraffe's Maze: Giraffe's friends are lost in a garden maze, and the child leads him to each one with an open hand.
// The character walks along the paths towards the open hand, and waits while the hand is closed or can't be seen.
// Each friend found follows along behind, into the next maze. On their own or with friends on their own computers,
// all in the same maze. The rules are in rules.js and play.js, the maze is drawn by view.js, and the characters'
// pictures come from walkers.js.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { Track } from '../../core/friends.js';
import { FriendsPanel } from '../../core/friends-ui.js';
import { Glove } from '../../core/glove.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { FOLLOW_SPACING, MazeRun } from './play.js';
import {
  castFor, facingOf, FOUND_SECONDS, friendsCast, LABELS, MAZE_COUNTS, mazeNewAt, modeWord, NEWS, newSeedWord, POINTS,
  REACH, readMode, SIZE_NAMES, SLIDE_SECONDS, Trail, WAYS,
} from './rules.js';
import { MazeView } from './view.js';
import { renderWalkers } from './walkers.js';

const byId = (id) => document.getElementById(id);
const HINT = 'Lead the way with your open hand!';
const FINISH = 'Everyone is found!';
const PRAISE = ['Nice one!', 'Great job!', 'Way to go!'];
// What each friend calls out as their maze begins, in their own voice: see audio/voice/lines.json.
const CALLS = {
  giraffe: 'Help! I’m lost in the maze!',
  truffle: 'Oink! I’m lost! Come and find me!',
  kit: 'Kit here! Can you find me?',
  mochi: 'Hop, hop! I’m lost in the hedges!',
  widget: 'Beep! Widget is lost! Find me!',
  frost: 'Brrr! I’m lost! Please find me!',
  bramble: 'Over here! Follow the path to me!',
  nova: 'Meow! I’m over here! Come and find me!',
  cinder: 'Cinder here! Which way is out?',
  tur: 'I’m lost! Please come quickly!',
};
const HINT_SECONDS = 10;
const ASK_OPEN_AFTER = 2.5; // Seconds of a closed hand before asking for it to open.
const RESTING_AFTER = 15; // And before saying that resting is fine.
const FILM_SECONDS = 25;
const BLOCKED_HINT_AFTER = 1.5; // Seconds held up by something in the way, before saying what to do.
const FILM_CELLS = 3; // The film shows until the character has walked this far.
const STEP_EVERY = 0.42; // Cells between footsteps.
const PRIZE_MARKS = { butterfly: '🦋', gem: '💎', crown: '👑' };
const PRIZE_LANDS_AFTER = 800;
// Which label goes with each thing a level brings, so the newest is named first.
const LABEL_FOR = { butterflies: 'butterfly', gate: 'key', shoes: 'shoes', sheep: 'sheep', gems: 'gem', bird: 'bird', bush: 'bush', magnet: 'magnet', chest: 'chest' };

// Playing with friends, each on their own computer. See core/friends-ui.js for what each of these is.
const MAZE_WORDS = {
  toggle: 'Play with friends',
  make: 'Make a game',
  codeLabel: 'A friend’s game code',
  codeName: 'Game code',
  how: 'Tell your friends the code. Then you all press <b>Into the maze!</b>',
  leave: 'Leave this game',
  privacy: 'Only your name, who you play as, where your character and glove are in the maze and what you find go to your friends. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That game already has 4 players.',
  lost: 'Can’t reach the game. Check the internet, then try again.',
  left: 'You’ve left the game.',
  badCode: 'A game code is 3 letters and numbers.',
  busy: 'Playing',
  still: 'still playing',
};
// A friend between what their game sends: where their character and glove are, and the glove's points, which go
// smoothly from one to the next. Which maze, which way they face, and whether they're walking change half way.
const WALKER_TRACK = { lerp: ['x', 'y', 'gx', 'gy'], lists: ['p'], steps: ['z', 'f', 'm', 'v', 'o'] };
const FRIEND_GLOVE = { fill: '#e3e8ee', ink: '#9aa8b6' };
const round2 = (value) => Math.round(value * 100) / 100;
const ids = ROSTER.map(({ id }) => id);

class MazeGame {
  chimeOnOpen = false; // The hand opens and closes all the time here, so a chime would be noise.

  constructor(session) {
    this.session = session;
    const { settings } = session;
    this.art = {};
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    this.gloveOffset = { x: 0, y: 0 };
    this.view = new MazeView(byId('game'), {
      language: () => settings.language,
      top: () => this.band(),
      prizeTarget: () => {
        const box = byId('chip-prizes')?.closest('.chip')?.getBoundingClientRect();
        return box?.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: 120, y: 50 };
      },
    });
    this.story = new StoryBox(session);
    this.events = this.runEvents();
    this.seedWord = newSeedWord();
    this.friendWalkers = new Map();
    this.points = new Map();
    this.waitingClaims = [];
    this.mode = 'solo';
    this.resetCounts();
    byId('finish-hero')?.closest('.finish-hero')?.insertAdjacentHTML('afterend', '<p id="finish-found" class="finish-found"></p><p id="finish-prizes" class="finish-prizes"></p>');
    this.friends = new FriendsPanel({
      game: 'giraffe-maze',
      linkKey: 'maze',
      words: MAZE_WORDS,
      hello: () => ({ driver: this.myCharacter().id, level: session.levels.current, length: this.mazeCount(), mode: modeWord(this.size(), this.seedWord) }),
      screen: () => session.screen,
      portraits: () => session.portraits,
      onMove: (id, message) => this.fromFriend(id, message),
      onGone: (friend) => this.friendGone(friend),
      // Whoever found the most, counting each friend found as three fruit. Equal ones share a place.
      rank: (a, b) => b.dropped - a.dropped,
      resultText: ({ dropped }) => `${dropped} ${dropped === 1 ? 'point' : 'points'}`,
      titles: { first: 'You found the most!', other: 'Great finding!' },
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
    this.run = this.soloRun(session.level);
    this.artFor([this.myCharacter().id, ...this.run.cast.flat()]);
    this.view.setLayout(this.run.layout);
    this.showFound();
    const game = this;
    this.debug = {
      view: this.view,
      gloves: this.gloves,
      get run() {
        return game.run;
      },
      get game() {
        return game;
      },
    };
  }

  resetCounts() {
    this.restFor = 0;
    this.blockedFor = 0;
    this.praised = 0;
    this.stepIn = STEP_EVERY;
    this.lastWalked = 0;
    this.filmShown = false;
    this.lastOpen = false;
  }

  /* ---------- the grown-ups' choices ---------- */

  size() {
    const { mazeSize } = this.session.settings;
    return SIZE_NAMES.includes(mazeSize) ? mazeSize : 'medium';
  }

  mazeCount() {
    const count = Number(this.session.settings.mazes);
    return MAZE_COUNTS.includes(count) ? count : 3;
  }

  ways() {
    return WAYS.includes(this.session.settings.mazeWays) ? this.session.settings.mazeWays : 'lead';
  }

  /** The child's own character: whoever they chose in the other games, or Giraffe. */
  myCharacter() {
    return characterWithId(this.session.settings.fighter) ?? ROSTER[0];
  }

  /** The band at the top of the screen, for the mirror, the meter and what's been found, which the maze stays under. */
  band() {
    const small = Math.min(230, Math.max(140, window.innerWidth * 0.15));
    const aspect = this.session.camera?.aspect || 16 / 9;
    return 12 + small / aspect + 12;
  }

  /** Pictures of these characters, drawn the first time each is needed. */
  artFor(wanted) {
    const needed = [...new Set(wanted)].filter((id) => !(id in this.art)).map((id) => characterWithId(id)).filter(Boolean);
    if (!needed.length) return;
    try {
      Object.assign(this.art, renderWalkers(needed));
    } catch (error) {
      // Without the pictures the maze still works: each character is a plain round token.
      console.warn('Could not draw the characters:', error);
      for (const spec of needed) this.art[spec.id] = null;
    }
  }

  newAt(level) {
    return mazeNewAt(level);
  }

  holdStart(go) {
    // Each game with friends is a new maze: the host's game tells everyone a new seed as it gets ready.
    this.seedWord = newSeedWord();
    return this.friends.holdStart(go);
  }

  setHands() {
    for (const glove of Object.values(this.gloves)) glove.hide();
  }

  settingChanged(change) {
    const { screen } = this.session;
    const between = screen !== 'playing' && screen !== 'countdown';
    // A new character, size or number of friends to find starts with the next game, and the title shows it now.
    if (between && ('fighter' in change || 'mazeSize' in change || 'mazes' in change)) {
      this.run = this.soloRun(this.session.level);
      this.artFor([this.myCharacter().id, ...this.run.cast.flat()]);
      this.view.setLayout(this.run.layout);
      this.showFound();
    }
    if (('fighter' in change || 'mazeSize' in change || 'mazes' in change) && this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
  }

  /** How long since "GO!", by the clock on the wall, for friends' games. */
  get sinceGo() {
    return performance.now() - this.goAt;
  }

  /* ---------- a new game ---------- */

  /** A game on their own: a new maze for each friend to find, each with a friend who isn't the child's own character. */
  soloRun(level) {
    const cast = castFor(ids, this.myCharacter().id, this.mazeCount(), level).map((id) => [id]);
    return new MazeRun({ seed: newSeedWord(), size: this.size(), level, cast, ways: this.ways(), events: this.events });
  }

  prepare(level) {
    const friendly = this.friends.current;
    this.mode = friendly ? 'friends' : 'solo';
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    this.friendWalkers = new Map();
    this.points = new Map();
    this.waitingClaims = [];
    if (friendly) {
      // Everyone makes the same mazes from the host's seed, at the host's size, level and number of mazes, with
      // one more friend lost in each than there are players.
      const { size, seed } = readMode(friendly.mode);
      const players = [this.myCharacter().id, ...friendly.friends.map((friend) => friend.spec.id)];
      const mazes = MAZE_COUNTS.includes(friendly.length) ? friendly.length : 3;
      const cast = friendsCast(ids, players, mazes, Math.min(5, friendly.racers.length + 1));
      const me = this.friends.room.you;
      this.run = new MazeRun({ seed, size, level: friendly.level, cast, ways: this.ways(), events: this.events, me, shared: { claim: (k) => this.friends.claim(k) } });
      for (const id of friendly.racers) this.points.set(id, 0);
      for (const friend of friendly.friends) {
        this.friendWalkers.set(friend.id, { id: friend.id, spec: friend.spec, name: friend.spec.name, track: new Track(WALKER_TRACK), trail: new Trail(), glove: new Glove('right'), fade: 0, found: [], z: -1, walked: 0 });
      }
      this.artFor([me, ...players, ...cast.flat()].filter((id) => ids.includes(id)));
    } else {
      this.run = this.soloRun(level);
      this.artFor([this.myCharacter().id, ...this.run.cast.flat()]);
    }
    this.view.reset();
    this.view.setLayout(this.run.layout);
    this.resetCounts();
    this.story.hide();
    this.showFound();
    this.showFruit();
    this.showPrizes();
    this.showScores();
    // Prizes only come from level 2, on the child's own.
    document.body.dataset.prizes = !friendly && level >= 2 ? 'on' : 'off';
  }

  begin() {
    this.goAt = performance.now();
    this.run.begin();
    this.session.sound.startLoop('birds', 0.14);
  }

  /** What the rules say happens, heard and seen. */
  runEvents() {
    const sound = () => this.session.sound;
    const view = () => this.view;
    return {
      onMazeStart: (index, layout) => {
        this.view.setLayout(layout);
        // On their own, the friend lost in this maze calls out, and the new things in it are named.
        if (this.mode === 'solo') {
          const [lost] = layout.lost;
          if (lost && CALLS[lost.who]) this.story.say(lost.who, CALLS[lost.who]);
          this.nameNewThings(layout);
        }
        for (const claim of this.waitingClaims.filter(({ k }) => Math.floor(k / 1000) === index)) this.run.claimed(claim.k, claim.by);
        this.waitingClaims = this.waitingClaims.filter(({ k }) => Math.floor(k / 1000) > index);
        this.showFound();
      },
      onEat: (item) => {
        sound().play('crunch', { gain: 0.45, rate: 0.95 + Math.random() * 0.15 });
        view().sparkle(item.pull?.x ?? item.x, item.pull?.y ?? item.y, '#ffffff');
        this.showFruit();
      },
      onClaimed: (item, by, mine) => {
        if (mine) this.showFruit();
      },
      onKey: (item) => {
        sound().play('sparkle', { gain: 0.3 });
        view().sparkle(item.x, item.y);
      },
      onLocked: (blocker) => view().introduce('locked', () => (blocker.open ? null : { x: blocker.x, y: blocker.y })),
      onUnblock: (blocker) => {
        if (blocker.kind === 'gate') sound().play('unlock', { gain: 0.5 });
        else if (blocker.kind === 'sheep') {
          sound().play('boing', { gain: 0.32, rate: 1.1 });
          view().puff(blocker.x, blocker.y, '#ffffff');
        } else {
          sound().play('rustle', { gain: 0.5 });
          view().puff(blocker.x, blocker.y, '#5cb85c', true);
        }
      },
      onPower: (kind) => {
        sound().handsOpen();
        view().introduce(kind, () => (this.run.power?.kind === kind ? { ...this.run.position } : null));
      },
      onBird: () => {
        sound().play('whoosh', { gain: 0.3, rate: 1.3 });
        view().introduce('bird', () => this.run.birdAt());
      },
      onChest: (item) => {
        sound().play('unlock', { gain: 0.4, rate: 1.2 });
        view().sparkle(item.x, item.y);
      },
      onPrize: (kind, at) => {
        sound().play('sparkle', { gain: 0.3, rate: 1 + Math.random() * 0.1 });
        view().prize(kind, at.x, at.y);
        setTimeout(() => this.showPrizes(true), PRIZE_LANDS_AFTER);
      },
      onButterfly: (fly) => view().introduce('butterfly', () => (fly.caught || fly.leaving ? null : { x: fly.x, y: fly.y - 0.4 })),
      onFound: (lost, by, mine) => {
        sound().play('found', { gain: mine ? 0.55 : 0.35 });
        if (mine) sound().play('cheer', { gain: 0.16 });
        view().hearts(lost.x, lost.y);
        if (this.mode === 'friends') {
          this.points.set(by, (this.points.get(by) ?? 0) + POINTS.friend);
          this.friendWalkers.get(by)?.found.push(lost.who);
          this.showScores();
        }
        if (mine) {
          this.story.hide();
          // Praise now and then, never over anything else being said.
          if (this.praised % 2 === 0) sound().say(PRAISE[Math.floor(this.praised / 2) % PRAISE.length], { ifQuiet: true });
          this.praised += 1;
        }
        this.showFound();
      },
      onSlide: () => {
        sound().play('whoosh', { gain: 0.25, rate: 0.9 });
      },
    };
  }

  /** The newest thing this level brings is named first, then whatever else is in the maze, each the first time. */
  nameNewThings(layout) {
    const { view } = this;
    const newest = (NEWS[this.run.level] ?? []).map(({ key }) => LABEL_FOR[key]);
    const named = [];
    for (const item of layout.items) {
      if (['key', 'shoes', 'gem', 'bird', 'magnet', 'chest'].includes(item.kind)) {
        named.push([item.kind, () => (item.gone || item.opened ? null : { x: item.x, y: item.y - 0.2 })]);
      }
    }
    for (const blocker of layout.blockers) {
      if (blocker.kind !== 'gate') named.push([blocker.kind, () => (blocker.open ? null : { x: blocker.x, y: blocker.y })]);
    }
    named.sort(([a], [b]) => Number(newest.includes(b)) - Number(newest.includes(a)));
    for (const [key, target] of named) view.introduce(key, target);
  }

  /* ---------- each frame ---------- */

  update(dt, snapshot) {
    this.followHand(dt, snapshot);
    const input = this.input(snapshot);
    this.lastOpen = input.open;
    this.run.update(dt, input);
    if (this.mode === 'friends') {
      this.friends.sendMove('walker', this.walkerState(input), this.sinceGo);
      this.updateFriends(dt);
    }
    this.view.update(dt);
    this.restFor = input.open ? 0 : this.restFor + dt;
    this.blockedFor = this.run.waitingAt ? this.blockedFor + dt : 0;
    this.showFilm();
    this.footsteps();
    if (this.run.over && this.session.screen === 'playing') this.session.finish();
  }

  /** The glove follows the hand in play over the maze. Reach help makes it go further than the hand does. */
  followHand(dt, snapshot) {
    const { area, palmSize } = this.view;
    const gain = REACH[this.session.settings.mazeReach] ?? REACH.little;
    const width = area.width * gain;
    const height = area.height * gain;
    this.gloveOffset = { x: area.left - (width - area.width) / 2, y: area.top - (height - area.height) / 2 };
    for (const [hand, glove] of Object.entries(this.gloves)) {
      if (hand !== snapshot.side) {
        glove.hide();
        continue;
      }
      glove.follow(snapshot[hand], dt, { aspect: this.session.camera.aspect, palmSize, width, height });
    }
  }

  /** Where the glove is in the maze, in cells, or null when it can't be seen. */
  gloveInMaze(side = this.session.settings.hands) {
    const glove = this.gloves[side];
    if (!glove?.visible) return null;
    return this.view.fromScreen(glove.x + this.gloveOffset.x, glove.y + this.gloveOffset.y);
  }

  /** What the rules are given each frame. A hand that's missing or unsure is never open. */
  input(snapshot) {
    const glove = this.gloves[snapshot.side];
    const at = this.gloveInMaze(snapshot.side);
    const gain = REACH[this.session.settings.mazeReach] ?? REACH.little;
    return {
      target: at,
      glove: at,
      open: Boolean(at && snapshot.handOpen === true),
      gloveSpeed: glove.visible ? (glove.speed * this.view.area.height * gain) / this.view.cell : 0,
    };
  }

  /** A soft footstep now and then while the character walks. */
  footsteps() {
    const walked = this.run.stats.walked;
    this.stepIn -= walked - this.lastWalked;
    this.lastWalked = walked;
    if (this.stepIn > 0) return;
    this.stepIn = STEP_EVERY;
    this.session.sound.play(this.stepOther ? 'step2' : 'step1', { gain: 0.12, rate: 1.05 + Math.random() * 0.1 });
    this.stepOther = !this.stepOther;
  }

  /** The little film of what to do, until the character has walked a few cells. */
  showFilm() {
    const wanted = this.run.stats.walked < FILM_CELLS && this.session.playSeconds < FILM_SECONDS;
    if (wanted !== this.filmShown) {
      this.filmShown = wanted;
      document.body.dataset.film = wanted ? 'on' : 'off';
    }
  }

  idle(dt, snapshot) {
    const counting = this.session.screen === 'countdown';
    if (this.filmShown) {
      this.filmShown = false;
      document.body.dataset.film = 'off';
    }
    // During the countdown the glove comes out, so the child can find their hand.
    if (counting) this.followHand(dt, snapshot);
    else for (const glove of Object.values(this.gloves)) glove.hide();
    this.view.update(dt);
  }

  render() {
    this.view.render(this.model());
  }

  /* ---------- with friends ---------- */

  /** Where the child's character and glove are, for friends' games: in cells, and the glove's points in palms. */
  walkerState(input) {
    const { run } = this;
    const at = run.position;
    const glove = this.gloves[this.session.settings.hands];
    const palm = this.view.palmSize;
    return {
      z: run.index,
      x: round2(at.x),
      y: round2(at.y),
      f: run.walker.facing,
      m: run.moving ? 1 : 0,
      v: input.glove ? 1 : 0,
      o: input.open ? 1 : 0,
      gx: round2(input.glove?.x ?? 0),
      gy: round2(input.glove?.y ?? 0),
      p: glove.visible ? glove.points.flatMap(({ x, y }) => [round2(x / palm), round2(y / palm)]) : [],
    };
  }

  /** Something from a friend's game: where their character is, or who found something first. */
  fromFriend(id, message) {
    if (message.t === 'claimed') {
      this.claimed(message);
      return;
    }
    if (message.t !== 'walker' || this.session.screen !== 'playing') return;
    this.friendWalkers.get(id)?.track.push(message, performance.now());
  }

  /** Whoever got to k first has it: the fruit or the friend goes to them, and so do the points. */
  claimed({ k, by }) {
    if (this.mode !== 'friends' || !this.friends.current?.racers.includes(by)) return;
    const maze = Math.floor(k / 1000);
    if (maze > this.run.index) {
      // From a maze this game hasn't got to yet, if a friend's game moved on a moment sooner.
      this.waitingClaims.push({ k, by });
      return;
    }
    if (maze < this.run.index) return;
    const isFriend = k % 1000 < 100;
    if (!isFriend && !this.run.layout.items.find((item) => item.k === k)?.owner) this.points.set(by, (this.points.get(by) ?? 0) + POINTS.fruit);
    this.run.claimed(k, by);
    this.showScores();
  }

  friendGone(friend) {
    this.friendWalkers.delete(friend.id);
    this.showScores();
  }

  /** Each friend's character and glove where they are in the maze, a moment ago, with whoever they've found. */
  updateFriends(dt) {
    const now = performance.now();
    const { run } = this;
    for (const friend of this.friendWalkers.values()) {
      const at = friend.track.at(now);
      friend.at = at;
      if (!at || at.z !== run.index) {
        friend.shown = false;
        continue;
      }
      if (friend.z !== at.z) {
        friend.z = at.z;
        const start = run.layout.maze.centre(run.layout.start);
        friend.trail.reset(start.x, start.y);
      }
      const before = friend.trail.points[0];
      friend.trail.add(at.x, at.y);
      if (before) friend.walked += Math.hypot(at.x - before.x, at.y - before.y) > 0.001 ? Math.min(0.2, Math.hypot(at.x - before.x, at.y - before.y)) : 0;
      friend.shown = true;
      const seen = Boolean(at.v);
      friend.fade += ((seen ? 1 : 0) - friend.fade) * (1 - Math.exp(-dt * 8));
      const { glove } = friend;
      glove.visible = seen || friend.fade > 0.05;
      glove.status = at.o ? 'open' : 'closed';
      const spot = this.view.at(at.gx, at.gy);
      glove.x = spot.x;
      glove.y = spot.y;
      const palm = this.view.palmSize * 0.8;
      if (at.p?.length === 42) {
        glove.points.forEach((point, index) => {
          point.x = at.p[index * 2] * palm;
          point.y = at.p[index * 2 + 1] * palm;
        });
      }
    }
  }

  /* ---------- what's drawn ---------- */

  /** The friends a walker has found, following along its trail, apart from one just found, who cheers where they were. */
  followersOf(trail, found, walked) {
    return found.map((entry, at) => {
      const { lost, who } = entry;
      if (lost && this.run.time - (lost.foundAt ?? -Infinity) < FOUND_SECONDS && lost.cell !== undefined && this.run.layout.lost.includes(lost)) {
        return { x: lost.x, y: lost.y, art: this.art[who], facing: 2, cheer: true };
      }
      const spot = trail.behind((at + 1) * FOLLOW_SPACING);
      if (!spot) return null;
      return { x: spot.x, y: spot.y, art: this.art[who], facing: facingOf(spot.dx, spot.dy, 1), moving: Math.hypot(spot.dx, spot.dy) > 0.02, walked: walked + at * 0.31 };
    }).filter(Boolean);
  }

  model() {
    const { run } = this;
    const me = this.myCharacter().id;
    const sliding = run.phase === 'sliding' && run.nextLayout;
    const walkers = [];
    if (sliding) {
      // Coming in at the way into the next maze, with everyone found so far lined up behind.
      const start = run.nextLayout.maze.centre(run.nextLayout.start);
      walkers.push({
        x: start.x,
        y: start.y,
        art: this.art[me],
        facing: 1,
        mine: true,
        followers: run.followers.map((follower, at) => ({ x: start.x - (at + 1) * FOLLOW_SPACING, y: start.y, art: this.art[follower.who], facing: 1 })),
      });
    } else {
      const at = run.position;
      const justFound = run.phase === 'found' && run.followers.some(({ lost }) => run.time - (lost.foundAt ?? -Infinity) < FOUND_SECONDS);
      walkers.push({
        x: at.x,
        y: at.y,
        art: this.art[me],
        facing: run.phase === 'found' ? 2 : run.walker.facing,
        moving: run.moving,
        walked: run.stats.walked,
        cheer: justFound,
        mine: true,
        hasKey: run.hasKey,
        power: run.power,
        stuck: run.stuck,
        followers: this.followersOf(run.trail, run.followers, run.stats.walked),
      });
      for (const friend of this.friendWalkers.values()) {
        if (!friend.shown || !friend.at) continue;
        const found = friend.found.map((who) => ({ who, lost: run.layout.lost.find((each) => each.owner === friend.id && each.who === who && run.time - (each.foundAt ?? -Infinity) < FOUND_SECONDS) }));
        walkers.push({
          x: friend.at.x,
          y: friend.at.y,
          art: this.art[friend.spec.id],
          facing: friend.at.f,
          moving: Boolean(friend.at.m),
          walked: friend.walked,
          name: friend.name,
          alpha: 0.95,
          followers: this.followersOf(friend.trail, found, friend.walked),
        });
      }
    }
    const gloves = [];
    for (const friend of this.friendWalkers.values()) {
      if (friend.shown && friend.glove.visible) gloves.push({ glove: friend.glove, look: { ...FRIEND_GLOVE, alpha: 0.7 * friend.fade, palm: this.view.palmSize * 0.8 } });
    }
    const mine = this.gloves[this.session.settings.hands];
    gloves.push({ glove: mine, offset: this.gloveOffset });
    const playing = this.session.screen === 'playing' && run.phase === 'walking';
    const lead = playing && this.lastOpen && mine.visible ? { from: run.position, to: { x: mine.x + this.gloveOffset.x, y: mine.y + this.gloveOffset.y } } : null;
    const bird = run.bird ? { ...run.bird, at: run.birdAt() } : null;
    return {
      layout: run.layout,
      slide: sliding ? { share: run.phaseTime / SLIDE_SECONDS, next: run.nextLayout } : null,
      walkers,
      butterflies: run.butterflies,
      bird,
      gloves,
      lead,
      art: this.art,
    };
  }

  /* ---------- the top of the screen ---------- */

  /** On their own, a face for each friend to find, which lights up once they're found. */
  showFound() {
    const list = byId('maze-found');
    if (!list) return;
    list.hidden = this.mode !== 'solo';
    const portraits = this.session.portraits ?? {};
    const faces = this.run.cast.map(([who], index) => {
      const found = index < this.run.index || (index === this.run.index && this.run.layout.lost.every((lost) => lost.owner));
      return { who, found, now: index === Math.max(0, this.run.index) && !found };
    });
    const key = faces.map(({ who, found, now }) => `${who}:${found}:${now}`).join(',');
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren(...faces.map(({ who, found, now }) => {
      const row = document.createElement('li');
      row.classList.toggle('is-found', found);
      row.classList.toggle('is-now', now);
      const face = document.createElement('img');
      face.alt = '';
      face.src = portraits[who] ?? '';
      row.append(face);
      return row;
    }));
  }

  showFruit() {
    byId('chip-fruit').textContent = String(this.run.stats.fruit);
  }

  showPrizes(landed = false) {
    const total = Object.values(this.run.stats.prizes).reduce((sum, count) => sum + count, 0);
    byId('chip-prizes').textContent = String(total);
    if (!landed) return;
    const box = byId('chip-prizes').closest('.chip');
    box.classList.remove('is-caught');
    void box.offsetWidth;
    box.classList.add('is-caught');
  }

  /** With friends, everyone's points as they play, the most first. */
  showScores() {
    const list = byId('maze-scores');
    const { current } = this.friends;
    list.hidden = this.mode !== 'friends' || !current;
    if (list.hidden) return;
    const portraits = this.session.portraits ?? {};
    const you = this.friends.room.you;
    const everyone = [{ id: you, name: 'You', who: this.myCharacter().id }, ...current.friends.filter((friend) => !friend.gone).map((friend) => ({ id: friend.id, name: friend.spec.name, who: friend.spec.id }))]
      .map((each) => ({ ...each, n: this.points.get(each.id) ?? 0 }))
      .sort((a, b) => b.n - a.n);
    const key = everyone.map(({ id, n }) => `${id}:${n}`).join(',');
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren(...everyone.map((each) => {
      const row = document.createElement('li');
      row.classList.toggle('is-you', each.id === you);
      const face = document.createElement('img');
      face.alt = '';
      face.src = portraits[each.who] ?? '';
      const name = document.createElement('span');
      name.className = 'maze-score-name';
      name.textContent = each.name;
      const score = document.createElement('span');
      score.className = 'maze-score';
      score.textContent = String(each.n);
      row.append(face, name, score);
      return row;
    }));
  }

  /* ---------- the end ---------- */

  finished() {
    const { sound } = this.session;
    sound.stopLoop('birds');
    this.story.hide();
    if (this.mode === 'friends') this.friends.finished(this.sinceGo, { n: this.points.get(this.friends.room.you) ?? 0, w: 1 });
    for (const glove of Object.values(this.gloves)) glove.hide();
    for (const friend of this.friendWalkers.values()) friend.shown = false;
  }

  prompt(snapshot, dt) {
    const { session, run } = this;
    const needed = session.handsPrompt(snapshot, dt);
    if (run.phase !== 'walking') return needed && !needed.key.startsWith('closed') ? needed : null;
    // The hand can rest whenever it likes: the character just waits. After a while, it's said that's fine.
    if (this.restFor > RESTING_AFTER) return { key: 'resting', text: SPOKEN.resting, side: null };
    if (needed && !needed.key.startsWith('closed')) return needed;
    if (needed && this.restFor > ASK_OPEN_AFTER) return needed;
    // Held up by something in the way: what to do about it, shown rather than said, every time.
    const blocker = run.waitingAt;
    if (blocker && this.blockedFor > BLOCKED_HINT_AFTER) {
      const key = blocker.kind === 'gate' ? 'locked' : blocker.kind;
      const [en, ka] = LABELS[key];
      return { key: `blocked-${key}`, text: session.settings.language === 'ka' ? ka : en, side: null, silent: true };
    }
    if (run.index === 0 && run.stats.walked < 2 && session.playSeconds < HINT_SECONDS) return { key: 'lead-hint', text: HINT, side: null };
    return null;
  }

  summary() {
    const { stats } = this.run;
    const hand = this.session.settings.hands;
    const row = (value) => ({ left: hand === 'left' ? value : '', right: hand === 'right' ? value : '' });
    const prizes = Object.values(stats.prizes).reduce((sum, count) => sum + count, 0);
    this.friends.showResults();
    const portraits = this.session.portraits ?? {};
    const found = byId('finish-found');
    found.replaceChildren(...this.run.followers.map(({ who }) => {
      const face = document.createElement('img');
      face.alt = '';
      face.src = portraits[who] ?? '';
      return face;
    }));
    byId('finish-prizes').textContent = Object.entries(stats.prizes)
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => `${PRIZE_MARKS[kind]} ${count}`)
      .join('   ');
    return {
      hero: stats.fruit,
      noun: 'game',
      rows: { found: row(stats.found), prizes: row(prizes) },
      // Nobody can lose: every friend is found in the end.
      won: true,
      // A game with friends is on the host's level, so it doesn't move the child's own level on.
      countsForLevel: !this.friends.current,
    };
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;
const characterChoices = ROSTER.map(({ id, name }) => choice('fighter', id, name)).join('\n        ');

new GameSession({
  shell: {
    title: 'Giraffe’s Maze',
    startLabel: 'Into the maze!',
    againLabel: 'Play again',
    finishTitle: FINISH,
    heroMark: '🍎',
    heroNoun: 'fruit',
    extraRows: [{ id: 'found', label: 'Friends found' }, { id: 'prizes', label: 'Prizes caught' }],
    hudTop: `
      <div class="maze-hud">
        <ol id="maze-found" class="maze-found" aria-label="Friends to find"></ol>
        <div class="chip chip-fruit"><span class="chip-label">Fruit</span><span id="chip-fruit" class="chip-value">0</span></div>
        <div class="chip chip-prizes"><span class="chip-label">Prizes</span><span id="chip-prizes" class="chip-value">0</span></div>
        <ol id="maze-scores" class="maze-scores" hidden></ol>
      </div>
      ${STORY_BOX}
      <div class="film maze-film" aria-hidden="true">
        <svg viewBox="0 0 220 150">
          <path class="film-hedge" d="M8 62h132v-50h70v126H8z" />
          <path class="film-path" d="M8 84h150V30h30v86H8z" />
          <path class="film-lead" d="M40 100h132V44" />
          <g class="film-walker">
            <circle class="film-body" cx="0" cy="0" r="11" />
            <circle class="film-spot" cx="-4" cy="-3" r="2.6" />
            <circle class="film-spot" cx="4" cy="3" r="2.2" />
            <circle class="film-eye" cx="3" cy="-4" r="1.6" />
          </g>
          <g class="film-hand">
            <rect x="-14" y="-6" width="28" height="24" rx="9" />
            <path class="film-finger" d="M-9 -3V-18" />
            <path class="film-finger" d="M-3 -5V-23" />
            <path class="film-finger" d="M4 -5V-23" />
            <path class="film-finger" d="M10 -3V-17" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>How hard (how big the maze is, and so how wide its paths are)</legend>
        ${choice('mazeSize', 'easy', 'Easy: a small maze with wide paths')}
        ${choice('mazeSize', 'medium', 'Medium')}
        ${choice('mazeSize', 'hard', 'Hard: a bigger maze with narrower paths')}
      </fieldset>
      <fieldset class="choice">
        <legend>Reach help (the middle of the camera picture covers the whole maze, so a smaller movement goes further)</legend>
        ${choice('mazeReach', 'none', 'None')}
        ${choice('mazeReach', 'little', 'A little')}
        ${choice('mazeReach', 'lots', 'A lot')}
      </fieldset>
      <fieldset class="choice">
        <legend>Finding the way</legend>
        ${choice('mazeWays', 'lead', 'The character goes where the open hand leads it, along the paths')}
        ${choice('mazeWays', 'find', 'The character finds its own way to the open hand')}
      </fieldset>
      <fieldset class="choice">
        <legend>Friends to find in a game</legend>
        ${choice('mazes', '2', '2')}
        ${choice('mazes', '3', '3')}
        ${choice('mazes', '5', '5')}
      </fieldset>
      <fieldset class="choice">
        <legend>Who plays</legend>
        ${characterChoices}
      </fieldset>`,
  },
  defaults: { mazeSize: 'medium', mazeReach: 'little', mazeWays: 'lead', mazes: 3, fighter: ROSTER[0].id },
  choices: { mazeSize: String, mazeReach: String, mazeWays: String, mazes: Number, fighter: String },
  tagline: (side) => `Friends are lost in the maze! Lead the way to them with your open ${side} hand.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new Sound({
    ...options,
    sounds: {
      crunch: new URL('../giraffe-walk/audio/crunch.ogg', import.meta.url),
      found: new URL('../spider-catcher/audio/home.ogg', import.meta.url),
      rustle: new URL('../spider-catcher/audio/rustle.ogg', import.meta.url),
      birds: new URL('../spider-catcher/audio/birds.ogg', import.meta.url),
      step1: new URL('../leap-trail/audio/step-1.ogg', import.meta.url),
      step2: new URL('../leap-trail/audio/step-2.ogg', import.meta.url),
      cheer: new URL('../mighty-moves/audio/cheer.ogg', import.meta.url),
      sparkle: new URL('../mighty-moves/audio/sparkle.ogg', import.meta.url),
      whoosh: new URL('../mighty-moves/audio/whoosh-2.ogg', import.meta.url),
      unlock: new URL('../robot-rescue/audio/unlock.ogg', import.meta.url),
      boing: new URL('../robot-rescue/audio/boing.ogg', import.meta.url),
    },
  }),
  createGame: (session) => new MazeGame(session),
}).start();
