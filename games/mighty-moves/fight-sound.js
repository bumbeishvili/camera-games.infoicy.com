// The sounds of a fight. Everything is a real recording, prepared ahead of time: see
// CREDITS.md for where each came from. Strikes are varied a little in pitch, as no two real
// hits sound the same. Impacts are kept soft enough not to startle a sensitive child.
import { Sound } from '../../core/sound.js';

const here = (file) => new URL(`./audio/${file}`, import.meta.url);

const FIGHT_SOUNDS = {
  whoosh1: here('whoosh-1.ogg'),
  whoosh2: here('whoosh-2.ogg'),
  whoosh3: here('whoosh-3.ogg'),
  clap: here('clap.ogg'),
  hit1: here('hit-1.ogg'),
  hit2: here('hit-2.ogg'),
  hit3: here('hit-3.ogg'),
  thump: here('thump.ogg'),
  block: here('block.ogg'),
  boom: here('boom.ogg'),
  jump: here('jump.ogg'),
  sparkle: here('sparkle.ogg'),
  bell: here('bell.ogg'),
  cheer: here('cheer.ogg'),
  music: here('music.ogg'),
};

const MUSIC_LEVEL = 0.28;
const HEAVY = new Set(['stomp', 'flying', 'starBurst', 'turbo', 'sweep', 'thunderClap', 'whirlwind']);

const pick = (names) => names[Math.floor(Math.random() * names.length)];
const near = (spread) => 1 + (Math.random() - 0.5) * spread;

export class FightSound extends Sound {
  constructor(options) {
    super({ ...options, sounds: FIGHT_SOUNDS });
  }

  startFightMusic() {
    this.startLoop('music', MUSIC_LEVEL);
  }

  stopFightMusic() {
    this.stopLoop('music');
  }

  /** The air moving as a move starts. */
  swing(move) {
    if (move === 'flying' || move === 'starBurst') {
      this.play('jump', { gain: 0.5, rate: near(0.08) });
      return;
    }
    if (move === 'skyCharge') {
      this.play('sparkle', { gain: 0.42 });
      return;
    }
    if (move === 'thunderClap') {
      this.play('clap', { gain: 0.8, rate: near(0.06) });
      return;
    }
    const heavy = HEAVY.has(move);
    this.play(pick(['whoosh1', 'whoosh2', 'whoosh3']), { gain: heavy ? 0.55 : 0.42, rate: near(0.16) * (heavy ? 0.85 : 1) });
  }

  /** The move connecting. */
  impact(move, { blocked = false, signature = false, small = false } = {}) {
    if (blocked) {
      this.play('block', { gain: 0.45, rate: near(0.12) });
      return;
    }
    if (small) {
      this.play(pick(['hit1', 'hit2', 'hit3']), { gain: 0.3, rate: near(0.14) });
      return;
    }
    if (move === 'stomp') this.play('boom', { gain: 0.6, rate: near(0.06) });
    if (HEAVY.has(move)) this.play('thump', { gain: 0.6, rate: near(0.1) });
    else this.play(pick(['hit1', 'hit2', 'hit3']), { gain: 0.5, rate: near(0.14) });
    if (move === 'starBurst' || signature) this.play('sparkle', { gain: 0.4, rate: near(0.08) });
  }

  /** A prize collected: a little sparkle, lighter for coins, which come most often. */
  prize(kind) {
    this.play('sparkle', { gain: kind === 'coin' ? 0.2 : 0.32, rate: kind === 'coin' ? 1.35 * near(0.08) : 1.15 });
  }

  /** A power-up arriving. */
  powerUp() {
    this.play('sparkle', { gain: 0.4, rate: 0.9 });
  }

  /** The shield bubble catching a hit: soft, like a block. */
  bubble() {
    this.play('block', { gain: 0.35, rate: 1.3 });
  }

  /** The soft ball caught: the child's clap. */
  caught() {
    this.play('clap', { gain: 0.6, rate: near(0.06) });
  }

  bell() {
    this.play('bell', { gain: 0.55 });
  }

  cheer(level = 0.5) {
    this.play('cheer', { gain: level });
  }
}
