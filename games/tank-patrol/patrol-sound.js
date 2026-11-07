// The sounds of Tank Patrol. All real recordings, prepared ahead of time: see CREDITS.md. Some of them are
// shared with the other games. The gun is big but soft and friendly, and there are a lot of its shots,
// so each one is a little different from the last.
import { Sound } from '../../core/sound.js';

const here = (file) => new URL(`./audio/${file}`, import.meta.url);
const other = (file) => new URL(`../${file}`, import.meta.url);

const TANK_SOUNDS = {
  engine: here('engine.ogg'),
  birds: here('birds.ogg'),
  'shot-1': here('shot-1.ogg'),
  'shot-2': here('shot-2.ogg'),
  'hit-1': here('hit-1.ogg'),
  'hit-2': here('hit-2.ogg'),
  'hit-3': here('hit-3.ogg'),
  lob: here('lob.ogg'),
  land: here('land.ogg'),
  rattle: here('rattle.ogg'),
  splutter: here('splutter.ogg'),
  hop: here('hop.ogg'),
  music: other('mighty-moves/audio/music.ogg'),
  sparkle: other('mighty-moves/audio/sparkle.ogg'),
  bump: other('mighty-moves/audio/thump.ogg'),
};

const MUSIC_LEVEL = 0.16;
const BIRDS_LEVEL = 0.22;
const ENGINE_IDLE = { level: 0.1, rate: 0.82 };
const ENGINE_DRIVING = { level: 0.34, rate: 1.14 };
const near = (spread) => 1 + (Math.random() - 0.5) * spread;
const oneOf = (name, count) => `${name}-${1 + Math.floor(Math.random() * count)}`;

export class PatrolSound extends Sound {
  constructor(options) {
    super({ ...options, sounds: TANK_SOUNDS });
    this.lost = false;
  }

  startPatrol() {
    this.startLoop('music', MUSIC_LEVEL);
    this.startLoop('birds', BIRDS_LEVEL);
    this.startLoop('engine', ENGINE_IDLE.level);
  }

  stopPatrol() {
    for (const loop of ['music', 'birds', 'engine']) this.stopLoop(loop);
  }

  /** The engine ticks over when it's waiting, and picks up with how fast the tank's going. */
  engine(share) {
    const loop = this.loops.get('engine');
    if (!loop) return;
    const going = Math.min(1, Math.max(0, share));
    this.setLoopLevel('engine', ENGINE_IDLE.level + (ENGINE_DRIVING.level - ENGINE_IDLE.level) * going);
    loop.source.playbackRate.setTargetAtTime(ENGINE_IDLE.rate + (ENGINE_DRIVING.rate - ENGINE_IDLE.rate) * going, this.context.currentTime, 0.18);
  }

  shot() {
    this.play(oneOf('shot', 2), { gain: 0.5, rate: near(0.12) });
  }

  hit() {
    this.play(oneOf('hit', 3), { gain: 0.34, rate: near(0.2) });
  }

  /** A robot tank has lobbed a shell, a good way off. */
  lob() {
    this.play('lob', { gain: 0.42, rate: near(0.12) });
  }

  /** A shell coming down, which is louder if it hits. */
  land(hit) {
    this.play('land', { gain: hit ? 0.58 : 0.42, rate: near(0.1) });
    if (hit) this.play('bump', { gain: 0.42, rate: 0.9 });
  }

  /** A robot tank rattling to a halt. */
  stopped() {
    this.play('splutter', { gain: 0.5, rate: near(0.14) });
    this.play('rattle', { gain: 0.52, rate: near(0.14) });
  }

  /** Its crew climbs out. */
  crew() {
    this.play('hop', { gain: 0.38, rate: near(0.16) });
    this.play('sparkle', { gain: 0.26, rate: near(0.1) });
  }

  /** The end of a game: a kinder sound for not quite getting there, with no fanfare to be sad about. */
  finish(line) {
    if (!this.lost) {
      super.finish(line);
      return;
    }
    this.play('sparkle', { gain: 0.4 });
    setTimeout(() => this.say(line), 450);
  }
}
