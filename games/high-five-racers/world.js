// Everything the race goes through, put together, and what has to happen each frame to keep it alive.
//
// A slow computer gets rid of the small things first. See setDetail.
import * as THREE from '../../vendor/three/three.module.js';
import { mod, smoothstep } from './kit.js';
import { buildBalloons, buildBirds, buildNature, buildSky } from './nature.js';
import { buildPlaces } from './places.js';
import { buildRoad } from './road.js';
import { Terrain } from './terrain.js';
import { PLACES, within } from './track.js';

const CONFETTI = { shape: 'paper', colours: ['#ff5a4f', '#ffd23f', '#3b82f6', '#27c96b', '#a855f7', '#ffffff'], size: 0.46 };
const LEAVES = { shape: 'paper', colours: ['#f4b63f', '#ef8f5a', '#7bd65b', '#d9832f'], size: 0.36 };

export class World {
  constructor(scene, track, { reducedMotion }) {
    this.scene = scene;
    this.track = track;
    this.reducedMotion = reducedMotion;
    this.time = { value: 0 };
    this.cheer = { value: 0.2 };
    this.animated = [];

    // What can be left out on a slow computer, in the order it goes.
    this.small = new THREE.Group();
    this.medium = new THREE.Group();
    this.trees = new THREE.Group();
    this.distant = new THREE.Group();
    scene.add(this.small, this.medium, this.trees, this.distant);

    this.terrain = new Terrain(track);
    this.terrain.buildGround(scene);
    this.terrain.buildWater(scene, this.time);
    buildRoad(scene, track);
    this.clouds = buildSky(scene);
    this.balloons = buildBalloons(this.distant);
    buildBirds(this);
    buildNature(this);
    this.places = buildPlaces(this);
  }

  /** How close a distance along the road is to the grandstands, from 0 to 1. */
  crowdNearness(distance) {
    const [from, to] = PLACES.grandstand;
    const middle = (from + to) / 2;
    const half = (to - from) / 2;
    const size = this.track.length;
    const away = Math.abs(mod(distance - middle + size / 2, size) - size / 2);
    return 1 - smoothstep(away, half, half + 30);
  }

  /** What's drifting in the air at a distance along the road: paper by the crowds, and leaves in the forest. */
  airAt(distance) {
    if (within(distance, PLACES.grandstand, this.track.length) || within(distance, PLACES.fair, this.track.length)) return CONFETTI;
    if (within(distance, PLACES.forest, this.track.length)) return LEAVES;
    return null;
  }

  /** Something to run every frame, like a windmill going round. */
  animate(update) {
    this.animated.push(update);
  }

  /** near is how close the player's car is to the crowd, from 0 to 1. */
  update(dt, time, { crowdNear = 0, excited = 0 }) {
    // The water and the leaves stand still for anyone who prefers less motion.
    if (!this.reducedMotion) this.time.value = time;
    const wanted = this.reducedMotion ? 0.05 : 0.14 + crowdNear * 0.34 + excited * 0.1;
    this.cheer.value += (wanted - this.cheer.value) * Math.min(1, dt * 3);
    for (const balloon of this.balloons) {
      balloon.mesh.position.y = balloon.baseY + Math.sin(time * 0.35 + balloon.phase) * 3;
    }
    this.clouds.rotation.y = time * 0.003;
    for (const update of this.animated) update(dt, time);
  }

  /**
   * Level 0 and 1 draw everything. At 2 the smallest things go, like flowers and grass, and at 3 so do
   * bushes and rocks, the things far away, and half the crowd.
   */
  setDetail(level) {
    this.small.visible = level < 2;
    this.medium.visible = level < 3;
    this.distant.visible = level < 3;
    for (const crowd of this.places.crowd) crowd.count = level < 3 ? crowd.userData.everyone : Math.floor(crowd.userData.everyone / 2);
  }
}
