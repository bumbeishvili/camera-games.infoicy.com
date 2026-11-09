// The sounds of the trail. All real recordings, prepared ahead of time: see CREDITS.md.
import { Sound } from '../../core/sound.js';

const here = (file) => new URL(`./audio/${file}`, import.meta.url);
// Real recordings the other games already have, used here as they are: see CREDITS.md.
const borrowed = (file) => new URL(`../${file}`, import.meta.url);

const TRAIL_SOUNDS = {
  step1: here('step-1.ogg'),
  step2: here('step-2.ogg'),
  step3: here('step-3.ogg'),
  jump: here('jump.ogg'),
  land: here('land.ogg'),
  slide: here('slide.ogg'),
  bump: here('bump.ogg'),
  music: here('music.ogg'),
  // What later levels bring.
  boing: borrowed('robot-rescue/audio/boing.ogg'), // A trampoline.
  sparkle: borrowed('mighty-moves/audio/sparkle.ogg'), // A power-up or a key.
  unlock: borrowed('robot-rescue/audio/unlock.ogg'), // A chest opening.
  bubble: borrowed('robot-rescue/audio/goo-pop.ogg'), // The bubble shield popping.
};

const MUSIC_LEVEL = 0.3;
const MUSIC_RATE = 1.14; // A little quicker than it was recorded, to go with the running.
const near = (spread) => 1 + (Math.random() - 0.5) * spread;

export class TrailSound extends Sound {
  constructor(options) {
    super({ ...options, sounds: TRAIL_SOUNDS });
    this.stepIndex = 0;
    this.music = null;
  }

  startMusic() {
    if (!this.context || this.music) return;
    const buffer = this.buffers.get('music');
    if (!buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = MUSIC_RATE;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(MUSIC_LEVEL, this.context.currentTime, 0.6);
    source.connect(gain).connect(this.backgroundBus);
    source.start();
    this.music = { source, gain };
  }

  stopMusic() {
    if (!this.music) return;
    const { source, gain } = this.music;
    this.music = null;
    gain.gain.setTargetAtTime(0, this.context.currentTime, 0.3);
    source.stop(this.context.currentTime + 1.5);
  }

  /** A footfall, never quite the same twice. */
  step() {
    this.stepIndex = (this.stepIndex + 1) % 3;
    this.play(`step${this.stepIndex + 1}`, { gain: 0.32, rate: near(0.14) });
  }

  moved() {
    this.play('jump', { gain: 0.55, rate: near(0.08) });
  }

  /** A soft swish, moving across into another lane. */
  across() {
    this.play('slide', { gain: 0.32, rate: near(0.1) * 1.25 });
  }

  land() {
    this.play('land', { gain: 0.5, rate: near(0.1) });
  }

  cleared() {
    this.play('win', { gain: 0.16, rate: 1.5 });
  }

  /** A golden star: a star's chime, higher, with a little of the win under it. */
  gold() {
    this.play('star', { gain: 0.75, rate: 1.5 });
    this.play('win', { gain: 0.14, rate: 1.7 });
  }

  /** A coin from clearing something: a star's chime, higher and quieter. */
  coin() {
    this.play('star', { gain: 0.3, rate: 1.9 });
  }

  /** Bouncing off a trampoline. */
  bounce() {
    this.play('boing', { gain: 0.5, rate: near(0.06) });
  }

  /** A power-up or a key picked up. */
  pickedUp() {
    this.play('sparkle', { gain: 0.45, rate: 1.1 });
  }

  /** A chest opening, and coins. */
  chest() {
    this.play('unlock', { gain: 0.55 });
    this.play('win', { gain: 0.16, rate: 1.6 });
  }

  /** The bubble shield popping softly as it floats the runner over. */
  bubblePop() {
    this.play('bubble', { gain: 0.5, rate: 1.1 });
  }

  bump() {
    this.play('bump', { gain: 0.6, rate: near(0.08) });
  }
}
