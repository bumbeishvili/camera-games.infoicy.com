// The car: a real engine recording played the way racing games do it, with pitch from a
// modelled rev counter and real gear changes, plus tyre and wind noise.
import { Sound } from '../../core/sound.js';

const audio = (file) => new URL(`./audio/${file}`, import.meta.url);
const fromGame = (file) => new URL(`../${file}`, import.meta.url);

const lerp = (from, to, amount) => from + (to - from) * amount;

// Playback speeds of the engine recording, whose firing rate is about 43 Hz at 1.0. That
// makes 0.62 a real idle of about 800 rpm. Each gear climbs, then the shift drops the
// revs, so the sound rises and falls like a car rather than climbing like a siren.
// Staying under about 1.7 keeps it sounding like the same engine rather than a sped-up one.
const IDLE_RATE = 0.62;
const GEARS = [
  { upTo: 0.3, from: 0.8, to: 1.4 },
  { upTo: 0.62, from: 1, to: 1.55 },
  { upTo: 1, from: 1.15, to: 1.7 },
];
const THROTTLE_LIFT = 0.08; // Opening the hands revs the engine before the car has moved.
const RUSH_LIFT = 0.08; // Turbo and boosts rev it a little further, but it's still the same engine.

/** Which gear the car is in at a speed from 0 to 1. */
export function gearAt(speed) {
  const index = GEARS.findIndex((gear) => speed <= gear.upTo);
  return index === -1 ? GEARS.length - 1 : index;
}

/** How fast to play the engine recording at a speed from 0 to 1. */
export function engineRate(speed) {
  if (speed <= 0.01) return IDLE_RATE;
  const index = gearAt(speed);
  const gear = GEARS[index];
  const gearStart = index === 0 ? 0 : GEARS[index - 1].upTo;
  return lerp(gear.from, gear.to, Math.min(1, (speed - gearStart) / (gear.upTo - gearStart)));
}

const ENGINE_UPDATE_SECONDS = 0.03;
const PASS_BY_SPACING_SECONDS = 1.5; // Rivals can be passed in a bunch. One sound is enough.
const BUMP_SPACING_SECONDS = 0.5;
const TURBO_SPACING_SECONDS = 2.5; // A hand that hovers at its widest shouldn't keep setting this off.

const IDLE_LEVEL = 0.3;
const ROAD_LEVEL = 0.3;
const WANDER_HZ = 7;
const PITCH_WANDER_CENTS = 11;
const LEVEL_WANDER = 0.035;

// The voice leads and the car sits under it. Measured from a recording of the game's
// output, the voice is about 4 dB above the car at top speed, and 11 dB above it while
// the car drops back for speech.
const CAR_LEVEL = 0.65;

export class CarSound extends Sound {
  constructor(options) {
    super({
      ...options,
      sounds: {
        engineLoop: audio('engine-loop.flac'),
        engineStart: audio('engine-start.ogg'),
        passBy: audio('pass-by.ogg'),
        lap: audio('lap.ogg'),
        slap: audio('slap.ogg'),
        rush: audio('rush.ogg'),
        whoosh: fromGame('mighty-moves/audio/whoosh-2.ogg'),
        bump: fromGame('mighty-moves/audio/block.ogg'),
        landed: fromGame('mighty-moves/audio/thump.ogg'),
        sparkle: fromGame('mighty-moves/audio/sparkle.ogg'),
        cheer: fromGame('mighty-moves/audio/cheer.ogg'),
      },
    });
    this.backgroundLevel = CAR_LEVEL;
    this.engineOn = false;
    this.engineSource = null;
    this.gear = 0;
    this.lastPassByAt = -Infinity;
    this.lastBumpAt = -Infinity;
    this.lastTurboAt = -Infinity;
    this.lastEngineUpdate = 0;
  }

  buildMixer() {
    super.buildMixer();
    const { context } = this;

    // Most of this recording's energy is at 60-120 Hz, and pitching down for idle puts it
    // lower still. Laptop speakers can't play that, so it would only use up headroom. Less
    // of it and more mid-range is what makes it sound like a car on a laptop.
    this.engineHighPass = context.createBiquadFilter();
    this.engineHighPass.type = 'highpass';
    this.engineHighPass.frequency.value = 62;
    this.engineHighPass.Q.value = 0.8;
    const bass = context.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 180;
    bass.gain.value = -7;
    const middle = context.createBiquadFilter();
    middle.type = 'peaking';
    middle.frequency.value = 850;
    middle.Q.value = 0.7;
    middle.gain.value = 5;
    this.engineTone = context.createBiquadFilter();
    this.engineTone.type = 'lowpass';
    this.engineTone.frequency.value = 900;
    this.engineTone.Q.value = 0.4;
    this.engineLevel = context.createGain();
    this.engineLevel.gain.value = 0;
    this.shiftDip = context.createGain();
    this.engineHighPass.connect(bass).connect(middle).connect(this.engineTone).connect(this.engineLevel).connect(this.shiftDip).connect(this.backgroundBus);

    // Tyres and wind, which is most of what a car sounds like at speed.
    const roadHighPass = context.createBiquadFilter();
    roadHighPass.type = 'highpass';
    roadHighPass.frequency.value = 130;
    this.roadTone = context.createBiquadFilter();
    this.roadTone.type = 'lowpass';
    this.roadTone.frequency.value = 400;
    this.roadLevel = context.createGain();
    this.roadLevel.gain.value = 0;
    this.roadTone.connect(roadHighPass).connect(this.roadLevel).connect(this.backgroundBus);
  }

  /** Cranks the engine, then lets the idle take over as the start-up sound fades. */
  startEngine() {
    if (!this.context || this.engineOn) return;
    const loop = this.buffers.get('engineLoop');
    if (!loop) return;
    this.engineOn = true;
    this.gear = 0;
    const now = this.context.currentTime;
    this.play('engineStart', { gain: 0.9, bus: this.backgroundBus });

    this.roadNoise = this.makeNoise();
    this.roadNoise.connect(this.roadTone);
    this.roadNoise.start();

    this.engineSource = this.context.createBufferSource();
    this.engineSource.buffer = loop;
    this.engineSource.loop = true;
    this.engineSource.playbackRate.value = IDLE_RATE;
    this.engineSource.connect(this.engineHighPass);
    this.engineSource.start(now);

    // The recording's harmonics are unusually steady. A small random wander in pitch and
    // level stops that sounding artificial once it's pitched, as real engines never hold
    // perfectly still. Two detuned copies would do it too, but they warble like a flanger.
    this.wander = this.makeWander();
    const pitchWander = this.context.createGain();
    pitchWander.gain.value = PITCH_WANDER_CENTS;
    this.wander.connect(pitchWander).connect(this.engineSource.detune);
    const levelWander = this.context.createGain();
    levelWander.gain.value = LEVEL_WANDER;
    this.wander.connect(levelWander).connect(this.engineLevel.gain);
    this.wander.start();

    this.engineLevel.gain.cancelScheduledValues(now);
    this.engineLevel.gain.setValueAtTime(0, now);
    this.engineLevel.gain.setTargetAtTime(IDLE_LEVEL, now + 0.95, 0.25);
    this.engineTone.frequency.setValueAtTime(800, now);
    this.lastEngineUpdate = now + 1.1;
  }

  makeWander() {
    const { context } = this;
    const buffer = context.createBuffer(1, context.sampleRate * 7, context.sampleRate);
    const samples = buffer.getChannelData(0);
    const smoothing = 1 - Math.exp((-2 * Math.PI * WANDER_HZ) / context.sampleRate);
    let value = 0;
    let peak = 0;
    for (let i = 0; i < samples.length; i += 1) {
      value += smoothing * (Math.random() * 2 - 1 - value);
      samples[i] = value;
      peak = Math.max(peak, Math.abs(value));
    }
    for (let i = 0; i < samples.length; i += 1) samples[i] /= peak;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  makeNoise() {
    const { context } = this;
    const buffer = context.createBuffer(2, context.sampleRate * 3, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const samples = buffer.getChannelData(channel);
      // Brown noise: rumbling like road noise rather than hissing like white noise.
      let last = 0;
      for (let i = 0; i < samples.length; i += 1) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        samples[i] = last * 3.5;
      }
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  /**
   * speed is 0 when stopped and 1 at top speed, and goes past that with a boost. throttle is whether the
   * hand is driving, and rush is 1 during turbo or a boost.
   */
  engine(speed, throttle, rush = 0) {
    if (!this.engineOn) return;
    const now = this.context.currentTime;
    if (now - this.lastEngineUpdate < ENGINE_UPDATE_SECONDS) return;
    this.lastEngineUpdate = now;

    const gear = gearAt(speed);
    if (throttle && gear > this.gear) this.shiftUp(now);
    this.gear = gear;

    const rate = engineRate(speed) + (throttle ? THROTTLE_LIFT : 0) + rush * RUSH_LIFT;
    // Revs climb quickly under power and fall away slowly when coasting.
    this.engineSource.playbackRate.setTargetAtTime(rate, now, throttle ? 0.07 : 0.28);

    // Under power an engine is louder and brighter than when it is coasting.
    const level = (throttle ? 0.5 + 0.1 * Math.min(1, speed) : IDLE_LEVEL + 0.1 * Math.min(1, speed)) + rush * 0.05;
    const tone = (throttle ? 1500 + 2200 * Math.min(1, speed) : 800 + 1100 * Math.min(1, speed)) + rush * 600;
    this.engineLevel.gain.setTargetAtTime(level, now, throttle ? 0.05 : 0.2);
    this.engineTone.frequency.setTargetAtTime(tone, now, 0.1);

    const road = Math.min(1.3, speed);
    this.roadLevel.gain.setTargetAtTime(road * road * ROAD_LEVEL, now, 0.2);
    this.roadTone.frequency.setTargetAtTime(350 + 1100 * road, now, 0.2);
  }

  /** The brief lift in power as a gear changes. */
  shiftUp(now) {
    const { gain } = this.shiftDip;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(0.5, now, 0.012);
    gain.setTargetAtTime(1, now + 0.09, 0.06);
  }

  stopEngine() {
    if (!this.engineOn) return;
    this.engineOn = false;
    const now = this.context.currentTime;
    this.engineLevel.gain.cancelScheduledValues(now);
    this.engineLevel.gain.setTargetAtTime(0, now, 0.18);
    this.roadLevel.gain.setTargetAtTime(0, now, 0.18);
    const stopAt = now + 1.2;
    for (const source of [this.engineSource, this.roadNoise, this.wander]) source.stop(stopAt);
    this.engineSource = null;
  }

  passedCar() {
    if (!this.context) return;
    const now = this.context.currentTime;
    if (now - this.lastPassByAt < PASS_BY_SPACING_SECONDS) return;
    this.lastPassByAt = now;
    this.play('passBy', { gain: 0.5 });
  }

  lap() {
    this.play('lap', { gain: 0.55 });
  }

  /**
   * A high five: a real clap, a little chime on top, and the rush of the boost. streak is how many
   * have been slapped in a row, and each one rings a little higher, so a row of them climbs.
   */
  slap(streak = 1) {
    const step = Math.min(streak - 1, 5);
    this.play('slap', { gain: 0.9, rate: 0.96 + Math.random() * 0.08 });
    this.play('sparkle', { gain: 0.34, rate: 1 + step * 0.06 });
    this.play('rush', { gain: 0.45, rate: 1.1 });
  }

  /** The big hand goes past with the hand closed. Just a soft pat, which isn't a telling off. */
  pat() {
    this.play('bump', { gain: 0.3, rate: 1.15 });
  }

  bump() {
    if (!this.context) return;
    const now = this.context.currentTime;
    if (now - this.lastBumpAt < BUMP_SPACING_SECONDS) return;
    this.lastBumpAt = now;
    this.play('bump', { gain: 0.55, rate: 0.9 + Math.random() * 0.2 });
  }

  turboOn() {
    if (!this.context) return;
    const now = this.context.currentTime;
    if (now - this.lastTurboAt < TURBO_SPACING_SECONDS) return;
    this.lastTurboAt = now;
    this.play('rush', { gain: 0.6 });
  }

  jumped() {
    this.play('whoosh', { gain: 0.4, rate: 0.85 });
  }

  landed() {
    this.play('landed', { gain: 0.5 });
  }

  /** The crowd, as the car goes by the grandstand. */
  crowd() {
    this.play('cheer', { gain: 0.32 });
  }
}
