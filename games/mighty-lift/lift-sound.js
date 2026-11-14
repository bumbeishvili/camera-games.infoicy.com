// The sounds of the yard. Nothing new was recorded for it: all of these are real recordings the other games
// already have, used here as they are. See CREDITS.md for where each came from.
import { Sound } from '../../core/sound.js';

const borrowed = (file) => new URL(`../${file}`, import.meta.url);

const LIFT_SOUNDS = {
  creak: borrowed('cannon-bay/audio/creak.ogg'), // A big rope creaking, while a weight hangs on it.
  thud: borrowed('cannon-bay/audio/thud.ogg'), // A weight put down hard.
  land: borrowed('leap-trail/audio/land.ogg'), // A hand drum: a weight reaching the line, or put down gently.
  cheer: borrowed('mighty-moves/audio/cheer.ogg'), // A friend freed.
  home: borrowed('spider-catcher/audio/home.ogg'), // A harp's bounce, as they hop out.
  sparkle: borrowed('mighty-moves/audio/sparkle.ogg'), // A prize.
  unlock: borrowed('robot-rescue/audio/unlock.ogg'), // A rock going up a notch on its jack.
  boing: borrowed('robot-rescue/audio/boing.ogg'), // A duckling out.
  bell: borrowed('mighty-moves/audio/bell.ogg'), // The trophy.
  whoosh: borrowed('mighty-moves/audio/whoosh-1.ogg'), // The owl flying off.
  birds: borrowed('tank-patrol/audio/birds.ogg'), // The countryside, quietly underneath.
  music: borrowed('mighty-moves/audio/music.ogg'),
};

const MUSIC_LEVEL = 0.16;
const BIRDS_LEVEL = 0.1;
const CREAK_MOST = 0.5;
const near = (spread) => 1 + (Math.random() - 0.5) * spread;

export class LiftSound extends Sound {
  constructor(options) {
    super({ ...options, sounds: LIFT_SOUNDS });
  }

  startYard() {
    this.startLoop('birds', BIRDS_LEVEL);
    this.startLoop('music', MUSIC_LEVEL);
    this.startLoop('creak', 0);
  }

  stopYard() {
    for (const name of ['birds', 'music', 'creak']) this.stopLoop(name);
  }

  /** The rope creaks while a weight hangs on it, louder the faster it's moving. strain is from 0 to 1. */
  strain(strain) {
    this.setLoopLevel('creak', Math.min(1, Math.max(0, strain)) * CREAK_MOST);
  }

  /** The weight has reached the line. */
  up() {
    this.play('land', { gain: 0.4, rate: 1.25 * near(0.08) });
  }

  /** A friend is free: the harp as they hop out, and a little cheering. */
  freed() {
    this.play('home', { gain: 0.5, rate: near(0.08) });
    this.play('cheer', { gain: 0.2 });
  }

  duckling() {
    this.play('boing', { gain: 0.3, rate: 1.5 * near(0.1) });
  }

  notch() {
    this.play('unlock', { gain: 0.5, rate: near(0.06) });
  }

  /** A star, a feather or honey: quiet, and never two on top of each other. */
  prize(rate = 1.1) {
    this.play('sparkle', { gain: 0.4, rate });
  }

  /** The weight is back on the ground: a soft drum if it was put down gently, and a thump if it wasn't. */
  down(gentle) {
    if (gentle) this.play('land', { gain: 0.3, rate: 0.8 * near(0.08) });
    else this.play('thud', { gain: 0.4, rate: near(0.1) });
  }

  owlOff() {
    this.play('whoosh', { gain: 0.3, rate: 0.7 });
  }

  trophy() {
    this.play('bell', { gain: 0.35 });
    this.play('sparkle', { gain: 0.4, rate: 0.9, after: 0.3 });
  }
}
