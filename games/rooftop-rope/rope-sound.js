// The sounds of the rooftops. Nothing new was recorded for it: all of these are real recordings the other games
// already have, used here as they are. See CREDITS.md for where each came from.
import { Sound } from '../../core/sound.js';

const borrowed = (file) => new URL(`../${file}`, import.meta.url);

const ROPE_SOUNDS = {
  wind: borrowed('cannon-bay/audio/wind.ogg'), // Up among the rooftops, quietly underneath.
  creak: borrowed('cannon-bay/audio/creak.ogg'), // A rope creaking, while the walker wobbles on it.
  music: borrowed('leap-trail/audio/music.ogg'),
  step: borrowed('leap-trail/audio/land.ogg'), // A hand drum: stepping onto a rooftop.
  sparkle: borrowed('mighty-moves/audio/sparkle.ogg'), // A prize.
  pop: borrowed('balloon-pop/audio/pop.ogg'), // A balloon.
  whoosh: borrowed('mighty-moves/audio/whoosh-1.ogg'), // Dropping to the net, and a gust of wind.
  boing: borrowed('robot-rescue/audio/boing.ogg'), // Bouncing in the net.
  bell: borrowed('robot-rescue/audio/bell.ogg'), // A bicycle bell: the light going green.
  home: borrowed('spider-catcher/audio/home.ogg'), // A harp's bounce: the bird's feather.
  gong: borrowed('mighty-moves/audio/bell.ogg'), // The cup.
  cheer: borrowed('mighty-moves/audio/cheer.ogg'),
};

const MUSIC_LEVEL = 0.13;
const WIND_LEVEL = 0.12;
const CREAK_MOST = 0.45;
const near = (spread) => 1 + (Math.random() - 0.5) * spread;

export class RopeSound extends Sound {
  constructor(options) {
    super({ ...options, sounds: ROPE_SOUNDS });
  }

  startCity() {
    this.startLoop('wind', WIND_LEVEL);
    this.startLoop('music', MUSIC_LEVEL);
    this.startLoop('creak', 0);
  }

  stopCity() {
    for (const name of ['wind', 'music', 'creak']) this.stopLoop(name);
  }

  /** The rope creaks as the walker wobbles on it, louder the more it wobbles. wobble is from 0 to 1. */
  wobble(wobble) {
    this.setLoopLevel('creak', Math.min(1, Math.max(0, wobble)) * CREAK_MOST);
  }

  /** Onto a rooftop. */
  crossed() {
    this.play('step', { gain: 0.4, rate: near(0.08) });
    this.play('sparkle', { gain: 0.3, rate: 1.2 });
  }

  pop() {
    this.play('pop', { gain: 0.5, rate: near(0.1) });
  }

  feather() {
    this.play('home', { gain: 0.45 });
  }

  green() {
    this.play('bell', { gain: 0.35 });
  }

  gust() {
    this.play('whoosh', { gain: 0.3, rate: 0.7 });
  }

  /** Down into the net, and a bounce. */
  fall() {
    this.play('whoosh', { gain: 0.35 });
    this.play('boing', { gain: 0.35, rate: 0.8, after: 1.1 });
  }

  cup() {
    this.play('gong', { gain: 0.3 });
    this.play('sparkle', { gain: 0.4, rate: 0.9, after: 0.3 });
  }

  cheer() {
    this.play('cheer', { gain: 0.25 });
  }
}
