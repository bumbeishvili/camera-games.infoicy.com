// The rules of the race on their own, with nothing else running. These need no browser.
import { expect, test } from '@playwright/test';
import {
  CAR_LENGTH,
  CAR_WIDTH,
  CHEVRON_SPACING,
  FASTEST_SPEED,
  gateOutcome,
  KERB_STRIPE,
  REACH,
  ReachEasing,
  rivalSpeed,
  TOP_SPEED,
  touching,
  TURBO,
  TurboMeter,
  wantedSpeed,
} from '../../../games/high-five-racers/rules.js';

const STEP = 1 / 60;

function run(meter, width, seconds) {
  for (let t = 0; t < seconds; t += STEP) meter.update(width, STEP);
}

test('turbo fills by itself while the hand is open, however open, and then goes by itself', () => {
  const meter = new TurboMeter();
  run(meter, 0.4, TURBO.fillSeconds / 2);
  expect(meter.level).toBeGreaterThan(0.4);
  expect(meter.active).toBe(false);
  run(meter, 0.4, TURBO.fillSeconds / 2 + 0.05);
  expect(meter.active).toBe(true);
  expect(meter.bonus).toBeGreaterThan(0);
  run(meter, 1, TURBO.seconds + 0.05);
  expect(meter.active).toBe(false);
  expect(meter.level).toBeLessThan(0.05);
});

for (const [name, reading] of [['closed', 0], ['unreadable', Number.NaN], ['nonsense', -1], ['missing', undefined]]) {
  test(`a ${name} hand stops turbo at once, and never fills the meter`, () => {
    const meter = new TurboMeter();
    run(meter, 1, TURBO.fillSeconds + 0.5);
    expect(meter.active).toBe(true);
    meter.update(reading, STEP);
    expect(meter.active).toBe(false);
    expect(meter.bonus).toBe(0);
    const level = meter.level;
    run(meter, reading, 3);
    expect(meter.active).toBe(false);
    expect(meter.level).toBe(level);
    expect(wantedSpeed(reading, 0.3, 2)).toBe(0);
  });
}

test('the flames grow as turbo goes on, up to a limit', () => {
  const meter = new TurboMeter();
  meter.burst();
  run(meter, 1, 0.3);
  const early = meter.grown;
  run(meter, 1, 0.5);
  expect(meter.grown).toBeGreaterThan(early);
  run(meter, 1, 1);
  expect(meter.grown).toBe(1);
});

test('nothing makes a closed hand go, and nothing goes past the fastest speed', () => {
  expect(wantedSpeed(0, 0.3, 2)).toBe(0);
  expect(wantedSpeed(0.8)).toBeCloseTo(0.8 * TOP_SPEED);
  expect(wantedSpeed(1, 0.3, 2)).toBeLessThanOrEqual(FASTEST_SPEED + 1e-9);
  expect(wantedSpeed(1, 0.3)).toBeGreaterThan(TOP_SPEED);
  expect(wantedSpeed(1, 0, 2)).toBeGreaterThan(wantedSpeed(1));
});

test('what repeats along the road goes past fewer than three times a second, even at the fastest', () => {
  expect(FASTEST_SPEED / (2 * KERB_STRIPE)).toBeLessThan(3);
  expect(FASTEST_SPEED / CHEVRON_SPACING).toBeLessThan(3);
});

test('a big hand is slapped only by an open hand that has reached it', () => {
  const reach = REACH.medium;
  expect(gateOutcome({ handOpen: true, lateral: reach, side: 1, reach })).toBe('slap');
  expect(gateOutcome({ handOpen: true, lateral: -reach - 1, side: -1, reach })).toBe('slap');
  // Open, but over on the other side, or not far enough.
  expect(gateOutcome({ handOpen: true, lateral: -reach, side: 1, reach })).toBe('passed');
  expect(gateOutcome({ handOpen: true, lateral: reach - 0.1, side: 1, reach })).toBe('passed');
  // There, but not open.
  expect(gateOutcome({ handOpen: false, lateral: reach, side: 1, reach })).toBe('closed');
  expect(gateOutcome({ handOpen: undefined, lateral: reach, side: 1, reach })).toBe('closed');
  expect(gateOutcome({ handOpen: 1, lateral: reach, side: 1, reach })).toBe('closed');
});

test('a side that\'s hard to reach comes down for a child who\'s trying, and a closed hand doesn\'t lower it', () => {
  const easing = new ReachEasing(REACH.big);
  easing.record(1, 'passed', false);
  easing.record(1, 'closed', false);
  expect(easing.reachFor(1)).toBe(REACH.big);

  easing.record(1, 'passed', true);
  const lowered = easing.reachFor(1);
  expect(lowered).toBeLessThan(REACH.big);
  // The other side is measured separately, as one side of the body may be much harder.
  expect(easing.reachFor(-1)).toBe(REACH.big);

  for (let i = 0; i < 20; i += 1) easing.record(1, 'passed', true);
  expect(easing.reachFor(1)).toBeGreaterThanOrEqual(0.9);

  const floor = easing.reachFor(1);
  easing.record(1, 'slap', true);
  expect(easing.reachFor(1)).toBeGreaterThan(floor);
});

test('resting costs no places: cars behind stop behind, and cars in front stop a little way on', () => {
  const cruise = 21;
  const follow = (start) => {
    let gap = start;
    let speed = cruise;
    for (let t = 0; t < 40; t += STEP) {
      const wanted = rivalSpeed({ gap, wish: 10, playerSpeed: 0, resting: true, rushing: false, cruise });
      speed += (wanted - speed) * (1 - Math.exp(-2.2 * STEP));
      gap += speed * STEP;
    }
    return { gap, speed };
  };
  const behind = follow(-40);
  expect(behind.gap).toBeLessThan(-3);
  expect(behind.speed).toBeLessThan(0.5);
  const ahead = follow(10);
  expect(ahead.gap).toBeLessThanOrEqual(50);
  expect(ahead.speed).toBeLessThan(0.5);
});

test('the other cars can\'t keep up with a boost or turbo, but come back afterwards', () => {
  const cruise = 21;
  expect(rivalSpeed({ gap: -5, wish: 20, playerSpeed: 34, resting: false, rushing: true, cruise })).toBeLessThan(30);
  expect(rivalSpeed({ gap: 5, wish: 20, playerSpeed: 34, resting: false, rushing: true, cruise })).toBeLessThan(30);
  expect(rivalSpeed({ gap: -5, wish: 20, playerSpeed: 20, resting: false, rushing: false, cruise })).toBeGreaterThan(20);
  // Out of sight, a car that's far behind comes past again, so that there's always someone to race.
  expect(rivalSpeed({ gap: -40, wish: 20, playerSpeed: 30, resting: false, rushing: true, comingBack: true, cruise })).toBeGreaterThan(30);
  // But never while a child is resting.
  expect(rivalSpeed({ gap: -40, wish: 20, playerSpeed: 0, resting: true, rushing: false, comingBack: true, cruise })).toBeLessThanOrEqual(cruise);
  expect(rivalSpeed({ gap: -5, wish: 20, playerSpeed: 0, resting: true, rushing: false, comingBack: true, cruise })).toBe(0);
});

test('cars touch when they overlap, and not when they\'re only close', () => {
  expect(touching({ distance: 10, lateral: 0 }, { distance: 12, lateral: 1 })).toBe(true);
  expect(touching({ distance: 10, lateral: 0 }, { distance: 10 + CAR_LENGTH + 0.1, lateral: 0 })).toBe(false);
  expect(touching({ distance: 10, lateral: 0 }, { distance: 10, lateral: CAR_WIDTH + 0.1 })).toBe(false);
});
