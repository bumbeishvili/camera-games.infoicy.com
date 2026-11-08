// The race: the player's car and the others on the road, the big hands to slap, stars to catch and
// ramps to jump, and the camera following it all. The world itself is in world.js.
//
// The car follows the road by itself and steering only moves it across the road, so nobody can
// crash or get stuck. There is no failing here on purpose. The one thing that matters is `drive`,
// which comes straight from the hand monitor and is 0 unless the hand in play is open.
//
// Nothing flashes or strobes: seizures are more common in children with hemiplegia, so road markings
// are low contrast and long, there are no full-screen effects, and the tunnel is as bright as outdoors.
// Anything that happens is a burst of small shapes where it happened.
//
// Each level (rules.js, racePlan) brings more cars, more big hands and ramps, and keener racing.
import * as THREE from '../../vendor/three/three.module.js';
import { makeDriver, RaceCar, RIVAL_STYLES } from './cars.js';
import { Particles, SpeedLines } from './effects.js';
import { HAND_COLOURS, HighFiveGates, PALM_HEIGHT } from './gates.js';
import { canvasTexture, clamp, damp, mod, softCircleTexture } from './kit.js';
import { Ramps, StarField } from './pickups.js';
import { CAR_LENGTH, CAR_WIDTH, FASTEST_SPEED, FistAndOpen, gateOutcome, racePlan, REACH, ReachEasing, RIVAL_TURBO, rivalSpeed, SLAP, TOP_SPEED, touching, TurboMeter, wantedSpeed } from './rules.js';
import { LANE_LIMIT, START_BEHIND_LINE, Track } from './track.js';
import { World } from './world.js';

const ACCELERATION = 10;
const COAST_DOWN = 13;
const OVER_TOP_DOWN = 7; // Slowing from a boost is gentler than slowing to a stop.

const RIVAL_CRUISE = 0.82 * TOP_SPEED;
// For each of the other cars, in order: the first three race at every level, and the others from level 4 and 8.
const RIVAL_LANES = [-3.2, 3.2, 0, -1.6, 1.6];
const RIVAL_WISHES = [9, 17, 25, 33, 41]; // The middle of how far ahead each likes to be.
const RIVAL_WISH_SWING = 12;
const RIVAL_COMES_BACK_FROM = [24, 32, 40, 48, 56]; // How far behind each gets before it comes past again.
const RIVAL_TURBO_NEAR = [-45, 12];
const GRID_ROWS = [1, 2, 3, 2, 1];
const SOARING_MAKES_ROOM = 30; // Metres either side of a flying car that the others make room in. // Which row of the grid each starts in, 11 m apart. // A rival only uses turbo with the child in sight, from behind to a little ahead.
const LAST_STRETCH = 170; // In the last of the race they ease off, so that the child wins clearly.
const TURBO_PULLS_AWAY_SECONDS = 4; // After this they keep up with turbo, or nobody would ever see them again.
const RIVAL_SLAP_REACH = 1.5;
const RESTING_SPEED = 6;
const CROWD_CHEER_SPACING_SECONDS = 25;
const JUMP_GRAVITY = 21;
// The flight from the other hand's turbo: a long, floaty hop rather than a ramp's quick one, about 6 m up
// and 3 seconds in the air, or a low hop with reduced motion. It stays under everything over the road: the
// lowest is the signs on the footbridges, at about 8.4 m, and the car's roof stays below 7.5 m. The view
// hardly moves, and the car rises up the picture instead: the whole picture sliding up and back down
// again would make lots of it change brightness at once, which is how a flash is counted.
const FLIGHT = { liftSpeed: 8.5, gravity: 6, lowLiftSpeed: 5, overGatesAbove: 2.5, cameraFollows: 0.08, lookFollows: 0.12 };
const jumpSpeed = (speed) => 3 + speed * 0.22;
const FINISH_STOP = 3; // Rivals pull up this far before the line, so the child gets there first.
const PASSED_BY = 1.5; // How far clear a car has to be to have passed, so two side by side don't keep swapping.
const SAY_PASSED_AGAIN_AFTER_SECONDS = 8;

const STEERING = {
  // The car's place on the road follows the hand. That's easier than turning a wheel for a child who
  // has to hold an arm out, and it makes reaching further the way to get further across.
  help: { rate: 12, follow: 3.4, span: 5.6, drift: 0 },
  none: { rate: 11, follow: 0, span: 0, drift: 0.2 },
};

const QUALITY_CHECK_SECONDS = 4;
const QUALITY_GOOD_FPS = 36;
const QUALITY_LEVELS = 4;

const IDLE_FINGERS = { thumb: 1, index: 1, middle: 1, ring: 1, pinky: 1 };

function skyReflection(renderer) {
  const picture = canvasTexture(256, 128, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#5aa8ea');
    sky.addColorStop(0.46, '#e6f5ff');
    sky.addColorStop(0.52, '#f8fcff');
    sky.addColorStop(0.54, '#7fbf6a');
    sky.addColorStop(1, '#5f9e58');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [x, y, r] of [[50, 30, 16], [70, 34, 12], [170, 22, 18], [195, 28, 12], [120, 42, 10]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.6, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { anisotropy: 1 });
  picture.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  const { texture } = generator.fromEquirectangular(picture);
  generator.dispose();
  picture.dispose();
  return texture;
}

export class Race {
  /**
   * events: onStar(total), onPlace(place, previous), onOvertake(spec, byPlayer), onLap(lap), onFinish(),
   * onFive(total, side, streak), onGate(gate, outcome), onBump(), onTurbo(on), onJump(), onFly(), onLanded(), onCrowd().
   * Modes: attract (title screen), grid (waiting on the line), race, finished.
   * driver is who's driving the child's car, rivals who could be in the others, in order, and reach how
   * far to reach for a big hand. level is from 1 to 10: see setLevel.
   */
  constructor(canvas, events = {}, { driver, rivals, reach = 'medium', level = 1 }) {
    this.events = events;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.track = new Track();
    this.world = new World(this.scene, this.track, { reducedMotion: this.reducedMotion });

    this.scene.add(new THREE.HemisphereLight('#e8f6ff', '#bcd2a4', 1.75));
    this.sunlight = new THREE.DirectionalLight('#fff4dc', 2.3);
    this.sunlight.castShadow = true;
    this.sunlight.shadow.mapSize.set(1024, 1024);
    const reach3d = 46;
    Object.assign(this.sunlight.shadow.camera, { left: -reach3d, right: reach3d, top: reach3d, bottom: -reach3d, near: 1, far: 260 });
    this.scene.add(this.sunlight, this.sunlight.target);
    // A soft light from the viewer, so the side of the car and gloves we look at isn't dark.
    this.fillLight = new THREE.DirectionalLight('#ffffff', 1.1);
    this.scene.add(this.fillLight, this.fillLight.target);

    const environment = skyReflection(this.renderer);
    const glowTexture = softCircleTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
    this.environment = environment;
    this.glowTexture = glowTexture;
    this.player = new RaceCar({ styleName: 'roadster', paint: '#ff5a4f', trim: '#ffd23f', spec: driver, environment, glowTexture, isPlayer: true });
    this.driver = makeDriver();
    this.driver.setSleeveColour(driver.colours.arm ?? driver.colours.body);
    this.player.group.add(this.driver.group);
    this.scene.add(this.player.group);

    // Everyone who could be in the other cars, and the cars made so far. More are made when a level needs them.
    this.cast = rivals;
    this.garage = [];
    this.rivals = [];
    this.racers = [null]; // In order, with null for the player. See order.
    this.stars = new StarField(this.scene, this.track);
    this.ramps = new Ramps(this.scene, this.track);
    this.reach = new ReachEasing(REACH[reach] ?? REACH.medium);
    this.gates = new HighFiveGates(this.scene, this.track, { reducedMotion: this.reducedMotion });
    this.gates.reachFor = (side) => this.reach.reachFor(side);
    this.gates.applyReach();
    this.particles = new Particles(this.scene);
    this.particles.budget = this.reducedMotion ? 0.5 : 1;
    this.speedLines = new SpeedLines(this.scene);
    this.turbo = new TurboMeter();
    this.otherHand = new FistAndOpen();

    this.setLevel(level);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.5, 3200);
    this.cameraTarget = new THREE.Vector3();
    this.cameraLook = new THREE.Vector3();
    this.currentLook = new THREE.Vector3();
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
    this.tmpC = new THREE.Vector3();

    this.time = 0;
    this.orbit = 0;
    this.quality = { frames: 0, seconds: 0, level: 0 };
    this.mode = 'attract';
    this.drive = 0;
    this.handSide = 'right';
    this.reset(2);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    // Gets the graphics card ready for everything now, so the first flames or big hand don't make it stutter.
    this.renderer.compile(this.scene, this.camera);
  }

  /** The next of the other cars, which then waits in the garage for any level that has it. */
  makeRival(index) {
    const spec = this.cast[index];
    const [paint, trim] = this.paintsFor(spec, index);
    const car = new RaceCar({ styleName: RIVAL_STYLES[index % RIVAL_STYLES.length], paint, trim, spec, environment: this.environment, glowTexture: this.glowTexture });
    this.scene.add(car.group);
    return {
      car,
      spec,
      lane: RIVAL_LANES[index],
      distance: 0,
      lateral: 0,
      shove: 0,
      speed: 0,
      wishPhase: index * 2.2,
      wanderPhase: index * 1.7,
      bumpWait: 0,
      lift: 0,
      liftSpeed: 0,
      flying: false,
      turboLeft: 0,
      turboIn: Infinity,
    };
  }

  /**
   * What this level's race has: how many other cars and how they race, where the big hands, stars and
   * ramps are. See racePlan in rules.js. Called before a race, and before reset().
   */
  setLevel(level) {
    this.level = level;
    const plan = racePlan(level);
    this.plan = plan;
    while (this.garage.length < plan.rivals) {
      const rival = this.makeRival(this.garage.length);
      this.garage.push(rival);
      // A car made after the start is got ready now, so that it can't stutter when it first comes into view.
      if (this.camera) {
        rival.car.setDetail(this.quality.level < 3);
        this.renderer.compile(rival.car.group, this.camera, this.scene);
      }
    }
    this.rivals = this.garage.slice(0, plan.rivals);
    this.garage.forEach((rival, index) => {
      rival.car.group.visible = index < plan.rivals;
    });
    this.racers = [null, ...this.rivals];
    this.gates.setLayout(plan.gates);
    this.stars.setLayout(plan.gates, plan.ramps);
    this.ramps.setLayout(plan.ramps);
  }

  paintsFor(spec, index) {
    const fallback = [['#3b82f6', '#ffd23f'], ['#a855f7', '#7ee8ff'], ['#14b8a6', '#ffe0b8']][index % 3];
    const main = spec.colours.pants ?? spec.colours.chest ?? fallback[0];
    return [main, spec.burstColours[0] === main ? fallback[1] : spec.burstColours[0]];
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  reset(laps) {
    this.laps = laps;
    this.raceDistance = laps * this.track.length;
    this.distance = -START_BEHIND_LINE;
    this.previousDistance = this.distance;
    this.lateral = 0;
    this.lateralVelocity = 0;
    this.shove = 0;
    this.speed = 0;
    this.starTotal = 0;
    this.fives = 0;
    this.gatesMet = 0;
    this.fivesLeft = 0;
    this.fivesRight = 0;
    this.streak = 0;
    this.lap = 1;
    this.place = this.rivals.length + 1;
    this.drive = 0;
    this.finished = false;
    this.boostLeft = 0;
    this.reachOut = 0;
    this.reachAcross = 0;
    this.afterSlap = 0;
    this.lift = 0;
    this.liftSpeed = 0;
    this.flying = false;
    this.soaring = false;
    this.otherHand.reset();
    this.nosePitch = 0;
    this.gateNext = null;
    this.gateAhead = Infinity;
    this.gateLined = false;
    this.crowdCheeredAt = -Infinity;
    this.airWait = 0;
    this.restingFor = 0;
    this.turbo.reset();
    this.rivals.forEach((rival, index) => {
      // The first three line up one behind another, and the others from higher levels beside them, in the
      // other half of the road, so they're no closer together and all start behind the line.
      rival.distance = -START_BEHIND_LINE + 11 * GRID_ROWS[index];
      rival.lateral = rival.lane;
      rival.shove = 0;
      rival.speed = 0;
      rival.bumpWait = 0;
      rival.wasAhead = true;
      rival.passedAt = -Infinity;
      rival.lift = 0;
      rival.liftSpeed = 0;
      rival.flying = false;
      rival.comingBack = false;
      rival.turboLeft = 0;
      // Spread out, so they take turns.
      rival.turboIn = this.plan.rivalTurboEvery * (0.5 + index * 0.37);
    });
    this.stars.reset();
    this.snapCamera = true;
  }

  setMode(mode) {
    this.mode = mode;
    this.snapCamera = true;
  }

  /** Only the hand being played with appears on the car. */
  setDriverHand(side) {
    this.handSide = side;
    const { left, right, sleeves } = this.driver;
    left.root.visible = side === 'left';
    sleeves.left.visible = side === 'left';
    right.root.visible = side === 'right';
    sleeves.right.visible = side === 'right';
    this.player.setFreeArm(side);
  }

  /** How far the child has to reach for a big hand. */
  setReach(reach) {
    this.reach.setBase(REACH[reach] ?? REACH.medium);
    this.gates.applyReach();
  }

  /** Puts different characters in the cars. */
  setDrivers(driver, rivals) {
    this.player.setCharacter(driver);
    this.player.setFreeArm(this.handSide);
    this.driver.setSleeveColour(driver.colours.arm ?? driver.colours.body);
    this.cast = rivals;
    this.garage.forEach((rival, index) => {
      rival.spec = rivals[index];
      rival.car.setCharacter(rivals[index]);
    });
    this.setCarDetail();
  }

  get info() {
    return {
      lap: this.lap,
      laps: this.laps,
      place: this.place,
      stars: this.starTotal,
      fives: this.fives,
      progress: clamp((this.distance + START_BEHIND_LINE) / (this.raceDistance + START_BEHIND_LINE), 0, 1),
      speed: this.speed / TOP_SPEED,
      turbo: this.turbo.level,
      turboOn: this.turbo.active,
      boosting: this.boostLeft > 0,
      flying: this.soaring,
    };
  }

  /**
   * Everyone in order, first first. Two other cars side by side only swap places on the list when one
   * is clearly ahead, so that it doesn't keep jumping about.
   */
  get order() {
    const { racers } = this;
    const inFront = (a, b) => {
      if (a === null) return !b.wasAhead;
      if (b === null) return a.wasAhead;
      return a.distance > b.distance + 2;
    };
    for (let i = 0; i < racers.length - 1; i += 1) {
      if (inFront(racers[i + 1], racers[i])) [racers[i], racers[i + 1]] = [racers[i + 1], racers[i]];
    }
    return racers.map((racer) => (racer ? racer.spec : this.player.spec));
  }

  get lapIndex() {
    return Math.floor(this.distance / this.track.length);
  }

  /** The car steers itself to the next big hand, or else the next star. */
  autoLane() {
    const { gate, ahead } = this.gates.next(this.distance);
    if (ahead < 42) return gate.side * Math.max(this.reach.reachFor(gate.side) + 0.5, 3.4);
    return this.stars.nextLane(mod(this.distance, this.track.length), this.lapIndex) ?? 0;
  }

  updatePlayer(dt, { drive = 0, steer = 0, steering = 'help', other = null }) {
    this.drive = drive;
    const handOpen = drive > 0;
    const wasTurbo = this.turbo.active;
    // A fist and then an open hand with the other hand makes the car fly, with turbo. The car still only
    // goes while the hand in play is open.
    const otherHandDidIt = this.otherHand.update(other);
    if (otherHandDidIt && handOpen && !this.soaring) {
      this.turbo.burst();
      this.takeOff();
    }
    this.turbo.update(handOpen ? 1 : 0, dt);
    if (this.turbo.active !== wasTurbo) this.events.onTurbo?.(this.turbo.active);
    this.boostLeft = handOpen ? Math.max(0, this.boostLeft - dt) : 0;

    const targetSpeed = wantedSpeed(drive, this.turbo.bonus, this.boostLeft);
    if (targetSpeed > this.speed) {
      this.speed = Math.min(targetSpeed, this.speed + ACCELERATION * dt);
    } else {
      const down = handOpen ? OVER_TOP_DOWN : COAST_DOWN;
      this.speed = Math.max(targetSpeed, this.speed - down * dt);
    }
    this.previousDistance = this.distance;
    this.distance += this.speed * dt;

    // Standing still means no sliding sideways either.
    const grip = clamp(this.speed / (TOP_SPEED * 0.4), 0, 1);
    this.shove = damp(this.shove, 0, 5, dt);
    if (steering === 'auto') {
      this.lateralVelocity = clamp((this.autoLane() - this.lateral) * 1.8, -7, 7) * grip;
    } else {
      const tune = STEERING[steering] ?? STEERING.help;
      const wanted = tune.follow ? clamp((steer * tune.span - this.lateral) * tune.follow, -tune.rate, tune.rate) : steer * tune.rate;
      const push = -this.track.curvatureAt(this.distance) * this.speed ** 2 * tune.drift;
      this.lateralVelocity = wanted * grip + push;
    }
    this.lateral = clamp(this.lateral + (this.lateralVelocity + this.shove * grip) * dt, -LANE_LIMIT, LANE_LIMIT);

    const lapPosition = mod(this.distance, this.track.length);
    if (this.distance > 0) {
      this.stars.collect(lapPosition, this.lateral, this.lapIndex, (star) => {
        this.starTotal += 1;
        this.particles.burst(star.position, { count: 9, shapes: ['star', 'dot'], colours: ['#ffe27a', '#fff3b8'], speed: 3.5, up: 3.5, life: 0.55, size: 0.45 });
        this.events.onStar?.(this.starTotal);
      });
    }
    this.updateGates(dt, handOpen);
    this.updateJump(dt);

    const lap = clamp(this.lapIndex + 1, 1, this.laps);
    if (lap !== this.lap) {
      this.lap = lap;
      this.celebrateAtLine();
      this.events.onLap?.(lap);
    }

    this.watchOvertaking();
    const place = 1 + this.rivals.filter((rival) => rival.wasAhead).length;
    if (place !== this.place) {
      const previous = this.place;
      this.place = place;
      this.events.onPlace?.(place, previous);
    }

    if (this.distance >= this.raceDistance && !this.finished) {
      this.finished = true;
      this.events.onFinish?.();
    }
  }

  /** Whoever gets overtaken, or does the overtaking, looks over and waves. It's all friendly. */
  watchOvertaking() {
    for (const rival of this.rivals) {
      const gap = rival.distance - this.distance;
      const ahead = rival.wasAhead ? gap > -PASSED_BY : gap > PASSED_BY;
      if (ahead === rival.wasAhead) continue;
      rival.wasAhead = ahead;
      rival.car.wave = 1.8;
      if (ahead) continue;
      // Past someone: you wave, they wave, and a few stars come out.
      this.player.wave = 1.4;
      const at = this.tmpC.copy(rival.car.group.position);
      at.y += 2.4;
      this.particles.burst(at, { count: 8, shapes: ['star'], colours: ['#ffffff', '#ffe27a'], speed: 3, up: 3, life: 0.6, size: 0.4 });
      if (this.time - rival.passedAt > SAY_PASSED_AGAIN_AFTER_SECONDS) this.events.onOvertake?.(rival.spec);
      rival.passedAt = this.time;
    }
  }

  updateGates(dt, handOpen) {
    const { gate: next, ahead } = this.gates.next(this.distance);
    const reach = this.reach.reachFor(next.side);
    const lined = this.lateral * next.side >= reach;
    // The arm goes out just before the hands meet, and comes back after.
    const timeLeft = ahead / Math.max(this.speed, 1);
    this.afterSlap = Math.max(0, this.afterSlap - dt);
    const reaching = (handOpen && lined && timeLeft < 0.34 && this.distance > 0) || this.afterSlap > 0;
    if (reaching && this.afterSlap <= 0) this.reachAcross = this.lateral - next.handX;
    this.reachOut = damp(this.reachOut, reaching ? 1 : 0, 20, dt);
    this.gateNext = next;
    this.gateAhead = ahead;
    this.gateLined = lined && handOpen;

    const moved = this.distance - this.previousDistance;
    if (moved <= 0 || moved > 8 || this.distance <= 0) return;
    const from = mod(this.previousDistance, this.track.length);
    for (const gate of this.gates.gates) {
      if (mod(gate.along - from, this.track.length) > moved) continue;
      // Flying high over a big hand is neither a high five nor a miss, so it costs nothing.
      if (this.soaring && this.lift > FLIGHT.overGatesAbove) continue;
      const outcome = gateOutcome({ handOpen, lateral: this.lateral, side: gate.side, reach: this.reach.reachFor(gate.side) });
      this.gatesMet += 1;
      this.reach.record(gate.side, outcome, handOpen);
      this.gates.applyReach({ snap: false });
      if (outcome === 'slap') this.slapGate(gate);
      else if (outcome === 'closed') this.gates.brush(gate, 4);
      else this.gates.brush(gate, 1.2);
      if (outcome !== 'slap') this.streak = 0;
      this.events.onGate?.(gate, outcome);
    }
  }

  slapGate(gate) {
    this.fives += 1;
    if (gate.side < 0) this.fivesLeft += 1;
    else this.fivesRight += 1;
    this.streak += 1;
    this.boostLeft = SLAP.boostSeconds;
    this.speed = Math.min(FASTEST_SPEED, this.speed + SLAP.kick);
    this.afterSlap = 0.16;
    this.gates.slap(gate);
    const where = this.tmpA;
    this.track.pointAt(gate.along, gate.handX, where);
    where.y += 3.6;
    const colour = `#${gate.paint.color.getHexString()}`;
    const bigger = Math.min(1.5, 1 + this.streak * 0.08);
    this.particles.burst(where, {
      count: 38 * bigger,
      shapes: ['star', 'hand', 'spark', 'paper'],
      colours: [colour, '#ffffff', '#ffe27a', HAND_COLOURS[(gate.index + 2) % HAND_COLOURS.length]],
      speed: 9,
      up: 8,
      life: 0.95,
      size: 0.85,
      gravity: 9,
    });
    this.particles.emit({ shape: 'ring', colour: '#ffffff', x: where.x, y: where.y, z: where.z, life: 0.4, size: 1.4, grow: 13, opacity: 0.85 });
    this.player.fighter.setExpression('happy', 1.4);
    this.events.onFive?.(this.fives, gate.side, this.streak);
  }

  /** Up into the air, from the other hand's turbo. */
  takeOff() {
    this.flying = true;
    this.soaring = true;
    this.liftSpeed = Math.max(this.liftSpeed, this.reducedMotion ? FLIGHT.lowLiftSpeed : FLIGHT.liftSpeed);
    this.lift = Math.max(this.lift, 0.2);
    this.player.fighter.setExpression('happy', 2);
    this.events.onFly?.();
  }

  updateJump(dt) {
    const onRamp = this.ramps.liftAt(this.distance, this.lateral);
    if (this.flying) {
      this.liftSpeed -= (this.soaring ? FLIGHT.gravity : JUMP_GRAVITY) * dt;
      this.lift += this.liftSpeed * dt;
      if (this.lift <= 0) {
        this.lift = 0;
        this.flying = false;
        this.soaring = false;
        this.liftSpeed = 0;
        this.puffAtWheels(10);
        this.events.onLanded?.();
      }
    } else if (onRamp > 0 && this.speed > 4) {
      this.lift = onRamp;
    } else if (this.ramps.launches(this.previousDistance, this.distance, this.lateral) && this.speed > 4) {
      this.flying = true;
      this.liftSpeed = jumpSpeed(this.speed);
      this.lift = 1;
      this.events.onJump?.();
    } else {
      this.lift = damp(this.lift, 0, 14, dt);
    }
  }

  puffAtWheels(count) {
    const at = this.player.group.position;
    for (let i = 0; i < count; i += 1) {
      this.particles.emit({
        shape: 'puff',
        colour: '#e8e4da',
        x: at.x + (Math.random() - 0.5) * 2,
        y: at.y + 0.2,
        z: at.z + (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.5) * 3,
        vy: 0.8 + Math.random() * 1.2,
        vz: (Math.random() - 0.5) * 3,
        life: 0.55,
        size: 0.7,
        grow: 1.5,
        opacity: 0.34,
      });
    }
  }

  updateRivals(dt, chasing) {
    const resting = chasing && this.drive === 0 && this.speed < RESTING_SPEED;
    const rushing = this.boostLeft > 0 || (this.turbo.active && this.turbo.heldFor < TURBO_PULLS_AWAY_SECONDS);
    const lastStretch = this.raceDistance - this.distance < LAST_STRETCH;
    this.restingFor = resting ? this.restingFor + dt : 0;
    const finishLine = this.raceDistance - FINISH_STOP;
    const pace = this.plan.rivalPace;
    // From level 5 the others use turbo now and then, one at a time, but never on the last stretch or while
    // a child is resting.
    const turboAllowed = chasing && !resting && !lastStretch;
    let anyTurbo = this.rivals.some((rival) => rival.turboLeft > 0);

    this.rivals.forEach((rival, index) => {
      const gap = rival.distance - this.distance;
      let wanted = RIVAL_CRUISE * 0.5;
      if (chasing) {
        // Each drifts nearer and further ahead, at its own pace.
        const wish = lastStretch
          ? -10 - index * 9
          : RIVAL_WISHES[index] + pace.wishAhead + RIVAL_WISH_SWING * Math.sin(this.time * (0.21 + index * 0.05) + rival.wishPhase);
        if (gap < -RIVAL_COMES_BACK_FROM[index] * pace.comesBackScale) rival.comingBack = true;
        if (gap > wish || lastStretch) rival.comingBack = false;
        wanted = rivalSpeed({ gap, wish, playerSpeed: this.speed, resting, rushing, comingBack: rival.comingBack, cruise: RIVAL_CRUISE, pace });
      }
      if (turboAllowed) {
        rival.turboIn -= dt;
        const inSight = gap > RIVAL_TURBO_NEAR[0] && gap < RIVAL_TURBO_NEAR[1];
        if (rival.turboIn <= 0 && !anyTurbo && !rushing && inSight && this.speed > RESTING_SPEED) {
          rival.turboLeft = RIVAL_TURBO.seconds;
          rival.turboIn = this.plan.rivalTurboEvery;
          anyTurbo = true;
          this.events.onRivalTurbo?.(rival.spec);
        }
      } else {
        rival.turboLeft = 0;
      }
      if (rival.turboLeft > 0) {
        rival.turboLeft = Math.max(0, rival.turboLeft - dt);
        wanted = Math.max(wanted, Math.min(FASTEST_SPEED, this.speed + RIVAL_TURBO.gain));
      }
      rival.speed = damp(rival.speed, wanted, 2.2, dt);
      if (chasing) rival.speed = Math.min(rival.speed, Math.max(0, finishLine - rival.distance) * 1.6);
      rival.distance += rival.speed * dt;
      // Everyone gets to finish: rivals never cross the line before the player does.
      if (chasing) rival.distance = Math.min(rival.distance, finishLine);

      // Wander across the road, and keep out of each other's way. They try to keep out of the
      // player's way too, but a child steering over can still catch one.
      let lane = rival.lane + Math.sin(this.time * 0.37 + rival.wanderPhase) * 1.3;
      for (const other of this.rivals) {
        if (other === rival) continue;
        if (Math.abs(other.distance - rival.distance) < 7 && Math.abs(other.lateral - rival.lateral) < 3) {
          lane += rival.lateral >= other.lateral ? 2 : -2;
        }
      }
      if (chasing && Math.abs(gap) < 9 && Math.abs(rival.lateral - this.lateral) < 2.6) {
        lane += rival.lateral >= this.lateral ? 2.4 : -2.4;
      }
      // While the child's car flies, those near it make room at the edges of the road, so that they go past
      // beside the camera rather than right under it, which with a crowd behind could change much of the
      // picture at once.
      if (chasing && this.soaring && gap > -SOARING_MAKES_ROOM && gap < SOARING_MAKES_ROOM) {
        lane = (rival.lateral >= this.lateral ? 1 : -1) * LANE_LIMIT;
      }
      rival.shove = damp(rival.shove, 0, 3.4, dt);
      const before = rival.lateral;
      rival.lateral = clamp(damp(rival.lateral, clamp(lane, -LANE_LIMIT, LANE_LIMIT), 1.6, dt) + rival.shove * dt, -LANE_LIMIT, LANE_LIMIT);
      rival.lateralVelocity = (rival.lateral - before) / Math.max(dt, 0.001);
      rival.bumpWait = Math.max(0, rival.bumpWait - dt);
      this.rivalOverRamps(rival, dt);

      if (chasing && this.speed > 1 && touching(this, rival)) this.bump(rival);
      if (chasing) this.rivalPassesGates(rival, dt);

      // Being beside the child means looking over and, as they pass, a wave.
      const beside = Math.abs(rival.distance - this.distance) < 14;
      const looking = beside ? clamp((this.lateral - rival.lateral) / 5, -1, 1) * -1.1 : 0;
      rival.car.look = resting && gap > 0 ? -2.4 : looking;
      if (resting && gap > 0 && this.restingFor > 1.5 && rival.car.wave <= 0 && Math.sin(this.time * 0.7 + index) > 0.8) rival.car.wave = 2.2;
    });
  }

  /** The others take the ramps too, rather than driving through them. */
  rivalOverRamps(rival, dt) {
    const onRamp = this.ramps.liftAt(rival.distance, rival.lateral);
    if (rival.flying) {
      rival.liftSpeed -= JUMP_GRAVITY * dt;
      rival.lift += rival.liftSpeed * dt;
      if (rival.lift <= 0) {
        rival.lift = 0;
        rival.flying = false;
      }
    } else if (onRamp > 0) {
      rival.lift = onRamp;
    } else if (this.ramps.launches(rival.distance - rival.speed * dt, rival.distance, rival.lateral) && rival.speed > 4) {
      rival.flying = true;
      rival.liftSpeed = jumpSpeed(rival.speed);
      rival.lift = 1;
    } else {
      rival.lift = damp(rival.lift, 0, 14, dt);
    }
  }

  /** The others high five the big hands as well, which shows what they're there for. */
  rivalPassesGates(rival, dt) {
    const moved = rival.speed * dt;
    if (moved <= 0 || rival.distance <= 0) return;
    const from = mod(rival.distance - moved, this.track.length);
    for (const gate of this.gates.gates) {
      if (mod(gate.along - from, this.track.length) > moved) continue;
      if (rival.lateral * gate.side < RIVAL_SLAP_REACH) continue;
      this.gates.brush(gate, 6);
      rival.car.wave = Math.max(rival.car.wave, 0.8);
      const at = this.tmpC.copy(rival.car.group.position);
      at.y += 3;
      this.particles.burst(at, { count: 10, shapes: ['star', 'spark'], colours: ['#ffffff', '#ffe27a'], speed: 4, up: 4, life: 0.5, size: 0.5 });
    }
  }

  /**
   * Two cars touch: a little shove sideways and a few sparks, and everyone carries on. They never go
   * through each other: whichever way they overlap least, that's the way they're moved apart.
   */
  bump(rival) {
    const side = rival.lateral >= this.lateral ? 1 : -1;
    const ahead = rival.distance >= this.distance ? 1 : -1;
    const across = CAR_WIDTH - Math.abs(rival.lateral - this.lateral);
    const along = CAR_LENGTH - Math.abs(rival.distance - this.distance);
    rival.shove = side * 9;
    this.shove = -side * 3;
    if (across < along) {
      rival.lateral = clamp(rival.lateral + side * across * 0.6, -LANE_LIMIT, LANE_LIMIT);
      this.lateral = clamp(this.lateral - side * across * 0.4, -LANE_LIMIT, LANE_LIMIT);
    } else {
      // Whoever's behind gives the one in front a push.
      rival.distance += ahead * along;
      rival.speed = ahead > 0 ? Math.max(rival.speed, this.speed) : Math.min(rival.speed, this.speed * 0.9);
    }
    if (rival.bumpWait > 0) return;
    rival.bumpWait = 0.9;
    rival.car.fighter.setExpression('dizzy', 1);
    const at = this.tmpA.copy(this.player.group.position).lerp(rival.car.group.position, 0.5);
    at.y += 0.7;
    this.particles.burst(at, { count: 14, shapes: ['spark', 'star'], colours: ['#ffd23f', '#ff9f45', '#ffffff'], speed: 7, up: 4, life: 0.45, size: 0.42, gravity: 12 });
    this.events.onBump?.();
  }

  /** Little things drifting across the view, which say where you are, and show how fast you're going past. */
  emitAir(dt) {
    this.airWait -= dt;
    if (this.airWait > 0 || this.reducedMotion || this.mode !== 'race' || this.particles.budget < 1) return;
    this.airWait = 0.09;
    const air = this.world.airAt(this.distance + 30);
    if (!air) return;
    const at = this.track.pointAt(this.distance + 14 + Math.random() * 46, (Math.random() - 0.5) * 34, this.tmpC);
    this.particles.emit({
      shape: air.shape,
      colour: air.colours[Math.floor(Math.random() * air.colours.length)],
      x: at.x,
      y: at.y + 4 + Math.random() * 8,
      z: at.z,
      vx: (Math.random() - 0.5) * 1.6,
      vy: -1.5,
      vz: (Math.random() - 0.5) * 1.6,
      life: 2.6,
      size: air.size,
      spin: (Math.random() - 0.5) * 5,
    });
  }

  /** Paper coming down from the gantry, whenever someone goes through the start line. */
  celebrateAtLine() {
    const at = this.track.pointAt(4, 0, this.tmpC);
    at.y += 11;
    this.particles.burst(at, {
      count: 46,
      shapes: ['paper', 'paper', 'star'],
      colours: [...HAND_COLOURS, '#ffffff', '#ff5a4f'],
      speed: 11,
      up: 1,
      life: 1.9,
      size: 0.46,
      gravity: 4,
      drag: 1.1,
    });
  }

  emitExhaust(dt, car, carSpeed, throttle, flames) {
    car.exhaustWait = (car.exhaustWait ?? 0) - dt;
    if (car.exhaustWait > 0) return;
    if (this.particles.budget < 0.5 && !flames) return;
    car.exhaustWait = flames ? 0.05 : throttle ? 0.13 : 0.34;
    const pipe = car.exhaustAt(Math.floor(this.time * 30), this.tmpB);
    const heading = car.group.rotation.y;
    const backX = -Math.sin(heading);
    const backZ = -Math.cos(heading);
    if (flames) {
      // Warm little puffs behind the flames, which go with the car and fade straight away.
      this.particles.emit({
        shape: 'puff',
        colour: Math.random() > 0.5 ? '#ffb347' : '#ff8a3c',
        x: pipe.x + backX * 1.3,
        y: pipe.y,
        z: pipe.z + backZ * 1.3,
        vx: Math.sin(heading) * carSpeed * 0.7 + (Math.random() - 0.5),
        vy: 0.6 + Math.random() * 0.8,
        vz: Math.cos(heading) * carSpeed * 0.7 + (Math.random() - 0.5),
        life: 0.26,
        size: 0.42,
        grow: 0.8,
        opacity: 0.7,
      });
    } else {
      // A proper puff when the engine's working, and hardly anything when it's only cruising.
      const working = carSpeed > (car.puffSpeed ?? 0) + 0.01;
      car.puffSpeed = carSpeed;
      this.particles.emit({
        shape: 'puff',
        colour: '#f2efe8',
        x: pipe.x,
        y: pipe.y,
        z: pipe.z,
        vx: Math.sin(heading) * carSpeed * 0.6 + (Math.random() - 0.5) * 0.8,
        vy: 0.5 + Math.random() * 0.6,
        vz: Math.cos(heading) * carSpeed * 0.6 + (Math.random() - 0.5) * 0.8,
        life: working ? 0.55 : 0.3,
        size: working ? 0.2 : 0.14,
        grow: working ? 1.5 : 1,
        opacity: working ? 0.42 : 0.2,
      });
    }
  }

  update(dt, input = {}) {
    this.time += dt;
    this.watchFrameRate(dt);

    if (this.mode === 'race') {
      this.updatePlayer(dt, input);
      this.updateRivals(dt, true);
    } else if (this.mode === 'grid') {
      this.speed = 0;
      this.drive = 0;
      this.previousDistance = this.distance;
    } else {
      // Title and finish screens: everyone cruises around while the camera circles.
      const cruise = this.mode === 'attract' ? 11 : 13;
      this.speed = damp(this.speed, cruise, 2, dt);
      this.distance += this.speed * dt;
      this.lateral = damp(this.lateral, Math.sin(this.time * 0.3) * 2, 1, dt);
      this.lateralVelocity = 0;
      this.drive = 1;
      this.updateRivals(dt, false);
    }

    const racing = this.mode === 'race';
    const turboOn = racing && this.turbo.active;
    const boosting = racing && this.boostLeft > 0;
    const rushing = turboOn || boosting;

    const yaw = clamp(-this.lateralVelocity * 0.022, -0.3, 0.3);
    // The nose dips under braking and lifts under power, which is much of what makes a car feel heavy.
    const slowing = racing && this.drive === 0 && this.speed > 0.5;
    const wantedPitch = (slowing ? 0.055 : 0) + (rushing ? -0.04 : 0) + (this.flying ? -clamp(this.liftSpeed * 0.035, -0.28, 0.28) : 0);
    this.nosePitch = damp(this.nosePitch, this.reducedMotion ? 0 : wantedPitch, 8, dt);
    this.player.place(this.track, this.distance, this.lateral, this.speed, yaw, dt, {
      lift: this.lift,
      pitch: this.nosePitch,
      roll: clamp(this.lateralVelocity * 0.006, -0.06, 0.06),
    });

    const braking = racing && this.drive === 0;
    this.player.setBraking(braking ? 1 : 0, dt);
    const flameLevel = turboOn ? 0.55 + this.turbo.grown * 0.45 : boosting ? 0.5 : 0;
    this.player.setFlames(flameLevel, dt, this.reducedMotion);
    this.emitExhaust(dt, this.player, this.speed, this.drive > 0, flameLevel > 0.1);
    this.driver.reachOut(this.handSide, this.reachOut, this.reachAcross, PALM_HEIGHT);
    this.player.look = this.reachOut > 0.1 ? clamp(this.reachAcross, -0.9, 0.9) : clamp(-this.lateralVelocity * 0.05, -0.5, 0.5);
    this.player.updateDriver(dt, { steer: input.steer ?? 0, excited: rushing ? 1 : 0 });
    if (slowing && Math.random() < dt * 14) this.puffAtWheels(1);

    for (const rival of this.rivals) {
      const rivalYaw = clamp(-(rival.lateralVelocity ?? 0) * 0.03, -0.25, 0.25);
      rival.car.place(this.track, rival.distance, rival.lateral, rival.speed, rivalYaw, dt, {
        lift: rival.lift,
        pitch: rival.flying ? -clamp(rival.liftSpeed * 0.035, -0.28, 0.28) : 0,
      });
      const stoppedWaiting = racing && rival.speed < 3;
      rival.car.setBraking(stoppedWaiting ? 0.7 : 0, dt);
      const rivalFlames = racing && rival.turboLeft > 0 ? 0.6 : 0;
      rival.car.setFlames(rivalFlames, dt, this.reducedMotion);
      const gap = rival.distance - this.distance;
      const near = Math.abs(gap) < (this.quality.level >= QUALITY_LEVELS ? 60 : 110);
      rival.car.fighter.root.visible = near;
      if (near) rival.car.updateDriver(dt, { steer: rivalYaw * -2 });
      // A name over each car ahead, but not over one so close to the camera that it would be in the way.
      rival.car.showTag(racing && gap > -3 ? 1 - clamp((gap - 14) / 36, 0, 1) : 0);
      if (near) this.emitExhaust(dt, rival.car, rival.speed, rival.speed > 6, rivalFlames > 0);
    }

    this.poseDriver(dt, input);
    this.emitAir(dt);

    this.stars.update(this.time, this.lapIndex, racing || this.mode === 'grid');
    const showGates = racing || this.mode === 'grid';
    this.gates.update(dt, this.time, {
      next: showGates ? this.gateNext ?? this.gates.gates[0] : null,
      ready: this.gateLined,
      stripOn: racing && this.gateAhead < 60,
      carDistance: this.distance,
    });
    const speedShare = this.speed / TOP_SPEED;
    const crowdNear = this.world.crowdNearness(this.distance);
    if (racing && crowdNear > 0.6 && this.time - this.crowdCheeredAt > CROWD_CHEER_SPACING_SECONDS) {
      this.crowdCheeredAt = this.time;
      this.events.onCrowd?.();
    }
    this.world.update(dt, this.time, { crowdNear, excited: rushing ? 1 : 0 });

    this.updateCamera(dt);

    const carPosition = this.player.group.position;
    this.sunlight.position.set(carPosition.x + 55, carPosition.y + 90, carPosition.z + 32);
    this.sunlight.target.position.copy(carPosition);
    this.fillLight.position.copy(this.camera.position);
    this.fillLight.target.position.copy(carPosition);

    const lineStrength = this.reducedMotion ? 0 : racing ? clamp((speedShare - 0.85) / 0.4, 0, 1) : 0;
    this.speedLines.update(dt, this.camera, this.speed, this.quality.level >= 3 ? 0 : lineStrength);
    this.particles.update(dt, this.camera, this.renderer.domElement.height);
  }

  poseDriver(dt, { left = null, right = null, steer = 0 }) {
    const liveHands = (this.mode === 'race' || this.mode === 'grid') && left && right;
    if (liveHands) {
      this.driver.left.setPose(left.fingers, left.status, dt);
      this.driver.right.setPose(right.fingers, right.status, dt);
    } else {
      this.driver.left.setPose(IDLE_FINGERS, 'open', dt);
      this.driver.right.setPose(IDLE_FINGERS, 'open', dt);
    }
    // Seen from behind, rotating about +Z lifts the screen-left hand and lowers the screen-right hand,
    // so the driver leans into a turn.
    const idleWave = liveHands || this.reducedMotion ? 0 : Math.sin(this.time * 1.4) * 0.05;
    this.driver.group.rotation.z = damp(this.driver.group.rotation.z, steer * 0.14 + idleWave, 10, dt);
  }

  updateCamera(dt) {
    const carPosition = this.player.group.position;
    if (this.mode === 'attract' || this.mode === 'finished') {
      if (!this.reducedMotion) this.orbit += dt * 0.22;
      const heading = this.track.headingAt(this.distance) + 2.45 + Math.sin(this.orbit) * 0.5;
      this.cameraTarget.set(
        carPosition.x + Math.sin(heading) * 12.5,
        carPosition.y + 3.9,
        carPosition.z + Math.cos(heading) * 12.5,
      );
      // On a wide screen the car goes to one side, so that the card in the middle doesn't hide who's in it.
      const aside = this.camera.aspect > 1.3 ? 6.4 : 0;
      this.cameraLook.set(
        carPosition.x + Math.cos(heading) * aside,
        carPosition.y + 2.2,
        carPosition.z - Math.sin(heading) * aside,
      );
    } else {
      // Looks down far enough to keep the car clear of the hand meters at the bottom, and follows the
      // car sideways enough that it stays above them at the road's edge.
      const rush = this.mode === 'race' && (this.turbo.active || this.boostLeft > 0) && !this.reducedMotion ? 1 : 0;
      this.pullBack = damp(this.pullBack ?? 0, rush, 2.6, dt);
      this.track.pointAt(this.distance - 12.5 + this.pullBack * 1.4, this.lateral * 0.72, this.tmpA);
      this.track.pointAt(this.distance + 8.8, this.lateral * 0.62, this.tmpB);
      const [follows, looks] = this.soaring ? [FLIGHT.cameraFollows, FLIGHT.lookFollows] : [0.35, 0.5];
      this.cameraTarget.set(this.tmpA.x, this.tmpA.y + 5.5 + this.lift * follows, this.tmpA.z);
      this.cameraLook.set(this.tmpB.x, this.tmpB.y + 0.7 + this.lift * looks, this.tmpB.z);
    }

    if (this.snapCamera) {
      this.camera.position.copy(this.cameraTarget);
      this.currentLook.copy(this.cameraLook);
      this.snapCamera = false;
    } else {
      const blend = 1 - Math.exp(-dt * 14);
      this.camera.position.lerp(this.cameraTarget, blend);
      this.currentLook.lerp(this.cameraLook, blend);
    }
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.currentLook);

    if (!this.reducedMotion) {
      // Going faster widens the view, and turbo or a slap widens it a good deal more.
      const fov = 57 + Math.min(1, this.speed / TOP_SPEED) * 5 + (this.pullBack ?? 0) * 8;
      if (Math.abs(fov - this.camera.fov) > 0.02) {
        this.camera.fov = damp(this.camera.fov, fov, 3, dt);
        this.camera.updateProjectionMatrix();
      }
    }
  }

  setCarDetail() {
    const full = this.quality.level < 3;
    this.player.setDetail(full);
    for (const rival of this.garage) rival.car.setDetail(full);
  }

  /**
   * On a slow computer, trade sharpness, then shadows, then the small things for a steady frame rate. It
   * only watches during a race, as a title screen doesn't matter, and the first moments of anything
   * are slow while the graphics card gets ready.
   */
  watchFrameRate(dt) {
    const quality = this.quality;
    if (this.mode !== 'race') {
      quality.frames = 0;
      quality.seconds = 0;
      return;
    }
    quality.frames += 1;
    quality.seconds += dt;
    if (quality.seconds < QUALITY_CHECK_SECONDS) return;
    const framesPerSecond = quality.frames / quality.seconds;
    quality.frames = 0;
    quality.seconds = 0;
    if (framesPerSecond >= QUALITY_GOOD_FPS || quality.level >= QUALITY_LEVELS) return;
    quality.level += 1;
    this.applyQuality();
  }

  applyQuality() {
    const { level } = this.quality;
    if (level >= 1) this.renderer.setPixelRatio(1);
    if (level >= 2 && this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = false;
      this.sunlight.castShadow = false;
      this.scene.traverse((object) => {
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => {
          material.needsUpdate = true;
        });
      });
    }
    // Level 3 drops flowers, grass and ink lines. Level 4 drops bushes, rocks, things far away and half the crowd.
    this.world.setDetail(level - 1);
    this.particles.budget = (level >= 4 ? 0.3 : level >= 3 ? 0.55 : 1) * (this.reducedMotion ? 0.5 : 1);
    this.setCarDetail();
    this.resize();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

