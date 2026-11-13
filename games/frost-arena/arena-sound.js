// The sounds of Frost Arena. All real recordings, prepared ahead of time and shared with the other games: see
// CREDITS.md. The rifles are paintball markers, softened, a little deeper for the Kalashnikov and a little
// higher for the M4, and each shot is a little different from the last, as there are a lot of them.
import { Sound } from '../../core/sound.js';

const other = (file) => new URL(`../${file}`, import.meta.url);

const ARENA_SOUNDS = {
  'shot-1': other('robot-rescue/audio/shot-1.ogg'),
  'shot-2': other('robot-rescue/audio/shot-2.ogg'),
  'shot-3': other('robot-rescue/audio/shot-3.ogg'),
  'hit-1': other('tank-patrol/audio/hit-1.ogg'),
  'hit-2': other('tank-patrol/audio/hit-2.ogg'),
  'hit-3': other('tank-patrol/audio/hit-3.ogg'),
  empty: other('robot-rescue/audio/empty.ogg'),
  reload: other('robot-rescue/audio/reload.ogg'),
  'step-1': other('leap-trail/audio/step-1.ogg'),
  'step-2': other('leap-trail/audio/step-2.ogg'),
  'step-3': other('leap-trail/audio/step-3.ogg'),
  music: other('mighty-moves/audio/music.ogg'),
  sparkle: other('mighty-moves/audio/sparkle.ogg'),
  thump: other('mighty-moves/audio/thump.ogg'),
  hop: other('tank-patrol/audio/hop.ogg'),
};

const MUSIC_LEVEL = 0.12;
const RIFLE_RATE = { ak: 0.82, m4: 1.06 };
const near = (spread) => 1 + (Math.random() - 0.5) * spread;
const oneOf = (name, count) => `${name}-${1 + Math.floor(Math.random() * count)}`;
/** Quieter from further off: full within a few paces, and never quite gone inside the yard. */
const from = (away) => Math.max(0.18, Math.min(1, 6 / Math.max(6, away)));

export class ArenaSound extends Sound {
  constructor(options) {
    super({ ...options, sounds: ARENA_SOUNDS });
    this.lost = false;
    this.stepAt = 0;
  }

  startMatch() {
    this.startLoop('music', MUSIC_LEVEL);
  }

  stopMatch() {
    this.stopLoop('music');
  }

  /** The child's own rifle, or someone else's, from however far off they are. */
  shot(rifle, { away = 0, mine = true } = {}) {
    this.play(oneOf('shot', 3), { gain: mine ? 0.42 : 0.3 * from(away), rate: near(0.1) * (RIFLE_RATE[rifle] ?? 1) });
  }

  /** The child's shot landing on someone. */
  hit() {
    this.play(oneOf('hit', 3), { gain: 0.2, rate: near(0.2) * 1.2 });
  }

  /** One landing on the child: a soft thump. Nothing is lost that doesn't come back. */
  hurt() {
    this.play('thump', { gain: 0.3, rate: near(0.1) * 1.1 });
  }

  /** The magazine is empty: a dry click. */
  empty() {
    this.play('empty', { gain: 0.5 });
  }

  /** A new magazine going in. */
  reload() {
    this.play('reload', { gain: 0.6 });
  }

  /** The child's shot bouncing off a shield. */
  bonk() {
    this.play('thump', { gain: 0.22, rate: near(0.1) * 1.4 });
  }

  /** A crate picked up. */
  crate() {
    this.play('hop', { gain: 0.36, rate: near(0.1) });
    this.play('sparkle', { gain: 0.3, rate: near(0.1) * 1.1 });
  }

  /** Someone's tagged out: a little hop and a twinkle, louder for the child's own tag. */
  tagged({ mine = false, away = 0 } = {}) {
    this.play('hop', { gain: (mine ? 0.42 : 0.3) * from(away), rate: near(0.14) });
    if (mine) this.play('sparkle', { gain: 0.3, rate: near(0.1) });
  }

  /** The child's boots in the snow, in step with how fast they're walking. */
  steps(speed, dt) {
    if (speed < 0.6) return;
    this.stepAt -= dt * speed;
    if (this.stepAt > 0) return;
    this.stepAt = 1.9;
    this.play(oneOf('step', 3), { gain: 0.16, rate: near(0.16) * 0.9 });
  }

  /** The end of a match: a kinder sound for not quite getting there, with no fanfare to be sad about. */
  finish(line) {
    if (!this.lost) {
      super.finish(line);
      return;
    }
    this.play('sparkle', { gain: 0.4 });
    setTimeout(() => this.say(line), 450);
  }
}
