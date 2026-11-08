// The sounds of the trail. All real recordings, prepared ahead of time: see CREDITS.md.
import { Sound } from '../../core/sound.js';

const here = (file) => new URL(`./audio/${file}`, import.meta.url);

const TRAIL_SOUNDS = {
  step1: here('step-1.ogg'),
  step2: here('step-2.ogg'),
  step3: here('step-3.ogg'),
  jump: here('jump.ogg'),
  land: here('land.ogg'),
  slide: here('slide.ogg'),
  bump: here('bump.ogg'),
  music: here('music.ogg'),
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

  bump() {
    this.play('bump', { gain: 0.6, rate: near(0.08) });
  }
}
