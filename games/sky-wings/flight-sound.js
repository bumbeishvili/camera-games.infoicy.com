// The sounds of a dogfight. All real recordings, prepared ahead of time: see CREDITS.md. Some of them
// are shared with the other games.
import { Sound } from '../../core/sound.js';

const here = (file) => new URL(`./audio/${file}`, import.meta.url);
const other = (file) => new URL(`../${file}`, import.meta.url);

const SKY_SOUNDS = {
  propeller: here('propeller.ogg'),
  guns: here('guns.ogg'),
  pop: here('gun-pop.ogg'),
  music: other('mighty-moves/audio/music.ogg'),
  hit: other('mighty-moves/audio/hit-1.ogg'),
  hurt: other('mighty-moves/audio/hit-2.ogg'),
  down: other('mighty-moves/audio/boom.ogg'),
  sparkle: other('mighty-moves/audio/sparkle.ogg'),
};

const PROPELLER_LEVEL = 0.32;
const MUSIC_LEVEL = 0.2;
const GUNS_LEVEL = 0.42;
const near = (spread) => 1 + (Math.random() - 0.5) * spread;

export class FlightSound extends Sound {
  constructor(options) {
    super({ ...options, sounds: SKY_SOUNDS });
  }

  startFlying() {
    this.startLoop('propeller', PROPELLER_LEVEL);
    this.startLoop('music', MUSIC_LEVEL);
    this.startLoop('guns', 0);
  }

  stopFlying() {
    this.stopLoop('propeller');
    this.stopLoop('music');
    this.stopLoop('guns');
  }

  /** The propeller goes as fast as the plane does. */
  propeller(share) {
    const loop = this.loops.get('propeller');
    if (loop) loop.source.playbackRate.setTargetAtTime(0.85 + share * 0.3, this.context.currentTime, 0.2);
  }

  /** The guns rattle for as long as there's a plane in the ring. */
  guns(firing) {
    this.setLoopLevel('guns', firing ? GUNS_LEVEL : 0);
  }

  /** Another plane's guns, further off. */
  theirShot() {
    this.play('pop', { gain: 0.16, rate: 0.82 * near(0.14) });
  }

  hit() {
    this.play('hit', { gain: 0.18, rate: 1.3 * near(0.2) });
  }

  hurt() {
    this.play('hurt', { gain: 0.42, rate: 0.9 * near(0.14) });
  }

  down() {
    this.play('down', { gain: 0.5, rate: near(0.1) });
    this.play('sparkle', { gain: 0.32, rate: near(0.08) });
  }
}
