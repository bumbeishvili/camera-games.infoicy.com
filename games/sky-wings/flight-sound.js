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
  // For the prizes and powers of the higher levels, all recordings already used elsewhere.
  bubble: other('balloon-pop/audio/pop.ogg'),
  whoosh: other('mighty-moves/audio/whoosh-1.ogg'),
  block: other('mighty-moves/audio/block.ogg'),
};
const PRIZE_RATES = { coin: 1, gem: 1.25, medal: 0.9, chest: 0.8 };

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

  /** A prize reaching the plane: the star chime, a little lower for the bigger prizes. */
  prize(kind) {
    this.play('star', { gain: 0.42, rate: PRIZE_RATES[kind] ?? 1 });
  }

  /** A gift box opening. */
  gift() {
    this.play('sparkle', { gain: 0.4, rate: 1.15 });
  }

  /** A pirate wrapped in a bubble: a real balloon pop, quiet and high. */
  bubble() {
    this.play('bubble', { gain: 0.2, rate: 1.45 * near(0.1) });
  }

  /** A paper plane setting off. */
  paper() {
    this.play('whoosh', { gain: 0.12, rate: 1.4 * near(0.1) });
  }

  /** A shot bouncing off the shield. */
  blocked() {
    this.play('block', { gain: 0.3, rate: 1.2 * near(0.1) });
  }

  /** A pirate slowed by a snowflake. */
  slowed() {
    this.play('sparkle', { gain: 0.18, rate: 1.6 });
  }

  down() {
    this.play('down', { gain: 0.5, rate: near(0.1) });
    this.play('sparkle', { gain: 0.32, rate: near(0.08) });
  }
}
