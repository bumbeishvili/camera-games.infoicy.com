// The light and the weather on later levels: a golden sunset that comes on slowly over the race, and a light
// shower of rain over the lake with a rainbow after it. See racePlan in rules.js for which levels have them.
//
// Nothing here may change how bright the picture is all at once, as that's how a flash is counted. The
// sunset changes colour rather than brightness, and over half a race. Every change is eased in at a slow,
// set rate, even between one race and the next. Raindrops are small and pale, and the rainbow fades in.
import * as THREE from '../../vendor/three/three.module.js';
import { clamp, mod, smoothstep } from './kit.js';
import { SKY_HORIZON, SKY_TOP } from './nature.js';

// The day's sky, at the stops the sunset's has. The day's light is whatever the race set its lights to.
const DAY_SKY = [SKY_TOP, '#b3e0ff', SKY_HORIZON, SKY_HORIZON];

// Warm, but about as bright as the day: the colours change and the light is turned up a little to make up
// for the blue that goes out of it.
const SUNSET = {
  sky: ['#7d8fdc', '#f3a6c4', '#ffbf8f', '#ffd6ad'],
  above: '#ffd8b0',
  below: '#d0ad7c',
  hemisphere: 2.25,
  sun: '#ffb676',
  sunPower: 2.95,
  fill: '#ffe2c8',
  fillPower: 1.38,
  clouds: '#ffc9b0',
  sunDisc: '#ff9f55',
};
const SKY_STOPS = [0, 0.45, 0.62, 1];

// How fast each can change, in its whole range a second.
const SUNSET_RATE = 0.12;
const RAIN_RATE = 0.5;
const RAINBOW_RATE = 0.2;
const SUNSET_FROM = 0.25; // Of the way through the race.
const SUNSET_TO = 0.6;
const RAIN_FADE = 35; // Metres at each end of the shower over which it comes and goes.
const RAINBOW_FOR = 330; // Metres after the shower that the rainbow stays.
const RAINDROPS_A_SECOND = 170;
const RAINBOW = ['#ff6b5f', '#ffa34f', '#ffd84a', '#55dd8c', '#62c6ff', '#8d7cf2'];
const RAINBOW_AWAY = 640; // Metres.
const RAINBOW_TURNS = 0.35; // How quickly it follows the view round, as a share a second.

const mix = (from, to, amount) => new THREE.Color(from).lerp(new THREE.Color(to), amount);
const ease = (value, target, rate, dt) => value + clamp(target - value, -rate * dt, rate * dt);

export class Weather {
  /** lights is { hemisphere, sunlight, fillLight }, as the race set them up for the day. */
  constructor(scene, track, world, lights, { reducedMotion }) {
    this.scene = scene;
    this.track = track;
    this.lights = lights;
    this.clouds = world.clouds;
    this.sun = world.clouds.userData.sun;
    this.reducedMotion = reducedMotion;
    const { hemisphere, sunlight, fillLight } = lights;
    this.day = {
      sky: DAY_SKY,
      above: hemisphere.color.clone(),
      below: hemisphere.groundColor.clone(),
      hemisphere: hemisphere.intensity,
      sun: sunlight.color.clone(),
      sunPower: sunlight.intensity,
      fill: fillLight.color.clone(),
      fillPower: fillLight.intensity,
      clouds: this.clouds.material.color.clone(),
      sunDisc: this.sun?.material.color.clone() ?? new THREE.Color('#ffffff'),
    };
    this.evening = SUNSET;
    this.sunset = 0;
    this.rain = 0;
    this.rainbow = 0;
    // What this race wants right now, which the sunset and the shower ease towards.
    this.sunsetWanted = 0;
    this.rainWanted = 0;
    this.drawnSunset = 0; // The sky is drawn for the day to begin with, in nature.js.
    this.applied = null;
    this.rainCarry = 0;
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.colour = new THREE.Color();
    this.rainbowArc = this.buildRainbow();
    this.apply();
  }

  buildRainbow() {
    const group = new THREE.Group();
    const outer = 300;
    const band = 12;
    RAINBOW.forEach((colour, index) => {
      const arc = new THREE.Mesh(
        new THREE.RingGeometry(outer - (index + 1) * band, outer - index * band, 72, 1, 0, Math.PI),
        new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide }),
      );
      group.add(arc);
    });
    group.visible = false;
    this.scene.add(group);
    return group;
  }

  /**
   * The rainbow stands far off ahead, and turns with the view only slowly, so it drifts gently across the sky
   * on a bend rather than being stuck to the screen or swinging out of sight.
   */
  placeRainbow(dt, camera) {
    camera.getWorldDirection(this.forward);
    const heading = Math.atan2(this.forward.x, this.forward.z);
    if (this.rainbowHeading === undefined || !this.rainbowArc.visible) this.rainbowHeading = heading;
    const turn = Math.atan2(Math.sin(heading - this.rainbowHeading), Math.cos(heading - this.rainbowHeading));
    this.rainbowHeading += turn * Math.min(1, dt * RAINBOW_TURNS);
    const { x, y, z } = camera.position;
    this.rainbowArc.position.set(x + Math.sin(this.rainbowHeading) * RAINBOW_AWAY, y - 110, z + Math.cos(this.rainbowHeading) * RAINBOW_AWAY);
    this.rainbowArc.lookAt(x, y - 110, z);
  }

  /**
   * plan is the race's plan, progress how far through the race it is from 0 to 1, position where the car is
   * on the lap, and racing whether a race is on: before one, the day is as it always was.
   */
  update(dt, { plan, progress, position, racing, camera }) {
    this.sunsetWanted = racing && plan.sunset ? smoothstep(progress, SUNSET_FROM, SUNSET_TO) : 0;
    this.sunset = ease(this.sunset, this.sunsetWanted, SUNSET_RATE, dt);
    let rainWanted = 0;
    let rainbowWanted = 0;
    if (racing && plan.rain) {
      const { from, to } = plan.rain;
      const into = mod(position - from, this.track.length);
      const length = to - from;
      if (into < length) rainWanted = Math.min(1, into / RAIN_FADE, (length - into) / RAIN_FADE);
      if (into > length * 0.6 && into < length + RAINBOW_FOR) rainbowWanted = 1;
    }
    this.rainWanted = rainWanted;
    this.rain = ease(this.rain, rainWanted, RAIN_RATE, dt);
    this.rainbow = ease(this.rainbow, rainbowWanted, RAINBOW_RATE, dt);
    this.apply();
    if (this.rainbowArc.visible && camera) this.placeRainbow(dt, camera);
  }

  apply() {
    const key = `${this.sunset} ${this.rainbow}`;
    if (key === this.applied) return;
    this.applied = key;
    const { hemisphere, sunlight, fillLight } = this.lights;
    const { day } = this;
    const s = this.sunset;
    hemisphere.color.copy(mix(day.above, this.evening.above, s));
    hemisphere.groundColor.copy(mix(day.below, this.evening.below, s));
    hemisphere.intensity = day.hemisphere + (this.evening.hemisphere - day.hemisphere) * s;
    sunlight.color.copy(mix(day.sun, this.evening.sun, s));
    sunlight.intensity = day.sunPower + (this.evening.sunPower - day.sunPower) * s;
    fillLight.color.copy(mix(day.fill, this.evening.fill, s));
    fillLight.intensity = day.fillPower + (this.evening.fillPower - day.fillPower) * s;
    this.clouds.material.color.copy(mix(day.clouds, this.evening.clouds, s));
    if (this.sun) this.sun.material.color.copy(mix(day.sunDisc, this.evening.sunDisc, s));
    if (Math.abs(s - this.drawnSunset) > 0.004 || (s === 0 && this.drawnSunset !== 0)) this.drawSky(s);
    this.rainbowArc.visible = this.rainbow > 0.005;
    if (!this.rainbowArc.visible) this.rainbowHeading = undefined;
    for (const arc of this.rainbowArc.children) arc.material.opacity = 0.5 * this.rainbow;
  }

  drawSky(s) {
    this.drawnSunset = s;
    const texture = this.scene.background;
    const canvas = texture?.image;
    if (!canvas?.getContext) return;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    if (s === 0) {
      // Exactly the day's sky, as nature.js drew it.
      gradient.addColorStop(0, SKY_TOP);
      gradient.addColorStop(0.62, SKY_HORIZON);
      gradient.addColorStop(1, SKY_HORIZON);
    } else {
      SKY_STOPS.forEach((stop, index) => gradient.addColorStop(stop, `#${mix(this.day.sky[index], this.evening.sky[index], s).getHexString()}`));
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    texture.needsUpdate = true;
    this.scene.fog.color.copy(mix(this.day.sky[3], this.evening.sky[3], s));
  }

  /** Light rain falling in front of the camera, small and pale. With reduced motion, fewer and slower. */
  rainOn(dt, particles, camera) {
    if (this.rain < 0.02) {
      this.rainCarry = 0;
      return;
    }
    const calm = this.reducedMotion ? 0.35 : 1;
    this.rainCarry += dt * RAINDROPS_A_SECOND * this.rain * particles.budget * calm;
    if (this.rainCarry < 1) return;
    camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.set(-this.forward.z, 0, this.forward.x);
    const at = camera.position;
    while (this.rainCarry >= 1) {
      this.rainCarry -= 1;
      const along = 7 + Math.random() * 40;
      const across = (Math.random() - 0.5) * 2 * (5 + along * 0.7);
      particles.emit({
        shape: 'drop',
        colour: '#d4eaff',
        x: at.x + this.forward.x * along + this.right.x * across,
        y: at.y - 2 + Math.random() * 11,
        z: at.z + this.forward.z * along + this.right.z * across,
        vx: 0.8 * calm,
        vy: -16 * calm,
        life: 0.75 / calm,
        size: 1.15,
        opacity: 0.7,
        turn: 0,
      });
    }
  }
}
