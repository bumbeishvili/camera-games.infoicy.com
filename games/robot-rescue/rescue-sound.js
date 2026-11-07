// The sounds of Robot Rescue. All real recordings, prepared ahead of time: see CREDITS.md. Some of them
// are shared with the other games. There are a lot of shots, so each one is quiet and a little
// different from the last.
import { Sound } from '../../core/sound.js';

const here = (file) => new URL(`./audio/${file}`, import.meta.url);
const other = (file) => new URL(`../${file}`, import.meta.url);

const RESCUE_SOUNDS = {
  'shot-1': here('shot-1.ogg'),
  'shot-2': here('shot-2.ogg'),
  'shot-3': here('shot-3.ogg'),
  'hit-1': here('hit-1.ogg'),
  'hit-2': here('hit-2.ogg'),
  'hit-3': here('hit-3.ogg'),
  'clatter-1': here('clatter-1.ogg'),
  'clatter-2': here('clatter-2.ogg'),
  crash: here('crash.ogg'),
  gooThrow: here('goo-throw.ogg'),
  gooSplat: here('goo-splat.ogg'),
  gooPop: here('goo-pop.ogg'),
  shieldHit: here('shield-hit.ogg'),
  reload: here('reload.ogg'),
  empty: here('empty.ogg'),
  unlock: here('unlock.ogg'),
  boing: here('boing.ogg'),
  bell: here('bell.ogg'),
  tram: here('tram.ogg'),
  gulls: here('gulls.ogg'),
  music: other('mighty-moves/audio/music.ogg'),
  shieldUp: other('mighty-moves/audio/whoosh-1.ogg'),
  sparkle: other('mighty-moves/audio/sparkle.ogg'),
  boom: other('mighty-moves/audio/boom.ogg'),
};

const MUSIC_LEVEL = 0.2;
const TRAM_LEVEL = 0.34;
const GULLS_LEVEL = 0.2;
// Some things can happen a lot at once, and all of them together would be noise, and too loud.
const CLATTER_GAP_SECONDS = 0.16;
const BOING_GAP_SECONDS = 1.1;
const near = (spread) => 1 + (Math.random() - 0.5) * spread;
const oneOf = (name, count) => `${name}-${1 + Math.floor(Math.random() * count)}`;

export class RescueSound extends Sound {
  constructor(options) {
    super({ ...options, sounds: RESCUE_SOUNDS });
    this.lost = false;
    this.lastAt = { clatter: -Infinity, boing: -Infinity };
  }

  /** Whether a sound that shouldn't pile up on itself can play yet. */
  isTimeFor(name, gap) {
    const now = this.context?.currentTime ?? 0;
    if (now - this.lastAt[name] < gap) return false;
    this.lastAt[name] = now;
    return true;
  }

  startRide() {
    this.startLoop('music', MUSIC_LEVEL);
    this.startLoop('tram', 0);
    this.startLoop('gulls', 0);
  }

  stopRide() {
    for (const loop of ['music', 'tram', 'gulls']) this.stopLoop(loop);
  }

  /** The tram's wheels turn while it's going along, and gulls can be heard by the water. */
  setRide({ moving, byWater }) {
    this.setLoopLevel('tram', moving ? TRAM_LEVEL : 0);
    this.setLoopLevel('gulls', byWater ? GULLS_LEVEL : 0);
  }

  shot() {
    this.play(oneOf('shot', 3), { gain: 0.42, rate: near(0.14) });
  }

  hit() {
    this.play(oneOf('hit', 3), { gain: 0.34, rate: near(0.2) });
  }

  fallApart() {
    if (this.isTimeFor('clatter', CLATTER_GAP_SECONDS)) this.play(oneOf('clatter', 2), { gain: 0.78, rate: near(0.2) });
  }

  /** It's the loudest moment of the game, and its helpers fall down with it, so it leaves them room. */
  bigFallsApart() {
    this.lastAt.clatter = (this.context?.currentTime ?? 0) + 0.5;
    this.play('crash', { gain: 0.72 });
    this.play('boom', { gain: 0.55 });
  }

  spotDone() {
    this.play(oneOf('clatter', 2), { gain: 0.72, rate: 0.82 });
    this.play('boom', { gain: 0.34, rate: 1.1 });
  }

  spotOpen() {
    this.play('sparkle', { gain: 0.42 });
  }

  gooThrown() {
    this.play('gooThrow', { gain: 0.5, rate: near(0.2) });
  }

  gooPopped() {
    this.play('gooPop', { gain: 0.75, rate: near(0.2) });
  }

  gooBlocked() {
    this.play('shieldHit', { gain: 0.8, rate: near(0.12) });
  }

  gooHit() {
    this.play('gooSplat', { gain: 0.72, rate: near(0.12) });
  }

  shieldUp() {
    this.play('shieldUp', { gain: 0.34, rate: 0.9 });
  }

  reload() {
    this.play('reload', { gain: 0.68 });
  }

  ranOut() {
    this.play('empty', { gain: 0.6 });
  }

  popUp() {
    if (this.isTimeFor('boing', BOING_GAP_SECONDS)) this.play('boing', { gain: 0.22, rate: near(0.3) });
  }

  cageOpens() {
    this.play('unlock', { gain: 0.75 });
    this.play('sparkle', { gain: 0.5 });
  }

  bell() {
    this.play('bell', { gain: 0.5 });
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
