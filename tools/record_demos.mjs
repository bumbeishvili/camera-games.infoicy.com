// Films each game for the previews on the page for choosing a game. Each one is the real game, with
// the real tracker, playing test footage or photos as the webcam, and the camera picture made big
// enough to see the movement in. Run it with the server going, after changing how a game looks:
//
//   npm start                     (in another terminal)
//   node tools/record_demos.mjs   (or name just the games to film)
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const FFMPEG = readFileSync(join(homedir(), '.cache/explainer-video/ffmpeg-path'), 'utf8').trim();
const OUT = join(ROOT, 'demos');
const SITE = `http://localhost:${process.env.PORT ?? 8642}`;
mkdirSync(OUT, { recursive: true });

// Makes what the child is doing easy to see in a small picture, and tidies away what isn't needed.
const BIG_CAMERA = `
  #open-panel, .tally, .move-meter, .hands-bar { display: none !important; }
  .camera-frame { --camera-small: 34vw !important; }
  .wing-meter { left: calc(12px + 34vw + 14px) !important; }
  .film { display: none !important; }
`;

const screenIs = (page, name) => page.waitForFunction((wanted) => window.__game?.screen === wanted, name, { timeout: 90_000 });
const wait = (page, ms) => page.waitForTimeout(ms);
const footage = (page, name, options = {}) => page.evaluate(([clip, settings]) => window.__camera.showFootage(clip, settings), [name, options]);

/**
 * Keeps a glove going after wherever target() says, by moving the photo of the hand that the fake
 * camera is showing. Runs in the page until it's stopped. hand() says which photo to show.
 */
const CHASE = `
  window.__chase = (glove, target, hand = () => 'open', gain = 0.1) => {
    let x = 0;
    let y = 0;
    const timer = setInterval(() => {
      const on = glove();
      const wanted = target();
      if (on.visible && wanted) {
        x += ((wanted.x - on.x) / innerWidth) * 1280 * gain;
        y += ((wanted.y - on.y) / innerHeight) * 720 * gain;
      }
      window.__camera.show({ left: null, right: hand(), scale: 0.7, rightOffsetX: x, rightOffsetY: y });
    }, 33);
    return () => clearInterval(timer);
  };
`;

const FILMS = {
  'robot-rescue': {
    settings: { reach: 'lots', pace: 'medium' },
    css: '.camera-frame { --camera-small: 26vw !important; }',
    async ready(page) {
      await page.evaluate(() => window.__camera.show({ left: null, right: 'open', scale: 0.7 }));
      await page.locator('#start').click();
      await screenIs(page, 'playing');
      await wait(page, 1200);
    },
    async play(page) {
      // The hand goes to the nearest robot and fires. Every so often it closes, for the shield and to
      // reload, and goo comes along for it to stop.
      await page.evaluate(() => new Promise((done) => {
        const { stage, mission } = window.__game;
        mission.holdThrows = 0;
        mission.level = { ...mission.level, throwEvery: 2.6, gooSeconds: 2 };
        // The goo is left for the shield to stop, so that the film shows it.
        const realTargets = mission.targets.bind(mission);
        mission.targets = () => realTargets().filter(({ kind }) => kind !== 'goo');
        const started = performance.now();
        let x = 0;
        let y = 0;
        let closedUntil = 0;
        const timer = setInterval(() => {
          const now = performance.now();
          const glove = stage.gloves.right;
          let best = null;
          let bestGap = Infinity;
          for (const target of stage.targetsOnScreen ?? []) {
            const gap = Math.hypot(target.x - glove.x, target.y - glove.y);
            if (target.ref.kind !== 'goo' && gap < bestGap) {
              best = target;
              bestGap = gap;
            }
          }
          if (glove.visible && best) {
            x = Math.max(-830, Math.min(210, x + ((best.x - glove.x) / innerWidth) * 128));
            y = Math.max(-190, Math.min(190, y + ((best.y - glove.y) / innerHeight) * 72));
          }
          // Close in good time for goo that's nearly here, and when it's run out.
          if (mission.gooClose > 0.62 || mission.blaster.charge <= 0.02) closedUntil = now + 800;
          const closed = now < closedUntil;
          window.__camera.show({ left: null, right: closed ? 'fist' : 'open', scale: 0.7, rightOffsetX: x, rightOffsetY: y });
          if (now - started > 14_000) {
            clearInterval(timer);
            done();
          }
        }, 33);
      }));
    },
    report: (page) => page.evaluate(() => window.__game.mission.stats),
  },
  'tank-patrol': {
    settings: { pace: 'medium', tanks: 15, tankLevel: 'gentle' },
    css: '.camera-frame { --camera-small: 22vw !important; right: 12px !important; } .prompt { display: none !important; }',
    async ready(page) {
      await page.evaluate(() => window.__camera.show({ left: null, right: 'open', scale: 0.7 }));
      await page.addScriptTag({ content: CHASE });
      await page.locator('#start').click();
      await screenIs(page, 'playing');
      await wait(page, 700);
    },
    async play(page) {
      // Closes the hand to drive at the next robot tank, and opens it to fire once it's in range.
      await page.evaluate(() => new Promise((done) => {
        const { field, patrol } = window.__game;
        const stop = window.__chase(
          () => field.gloves.right,
          () => {
            const [target] = patrol.rolling;
            return target ? field.project(target.x, target.y, target.z) : null;
          },
          () => {
            const [target] = patrol.rolling;
            return target && patrol.inRange(target) ? 'open' : 'fist';
          },
        );
        setTimeout(() => {
          stop();
          done();
        }, 14_000);
      }));
    },
    report: (page) => page.evaluate(() => window.__game.patrol.stats),
  },
  'cannon-bay': {
    settings: { bayPace: 'medium', bayShips: 9 },
    css: '.camera-frame { --camera-small: 24vw !important; } .story { display: none !important; }',
    async ready(page) {
      await page.evaluate(() => window.__camera.show({ left: null, right: 'open', scale: 0.7 }));
      await page.locator('#start').click();
      await screenIs(page, 'playing');
      await page.waitForFunction(() => window.__game.battle.afloat.length > 0, null, { timeout: 30_000 });
      // Ships near the end of their health, so that they go down and their crews row away in the film.
      await page.evaluate(() => {
        const { battle, game } = window.__game;
        game.openFor = 99;
        game.wheelFor = 99;
        battle.afloat.forEach((pirate, index) => {
          pirate.hitsLeft = 7 + index * 7;
        });
      });
      await wait(page, 3500);
    },
    async play(page) {
      // The real hand: open and going from side to side, which turns the wheel, and shut for a moment
      // to bring the sails down.
      await page.evaluate(() => new Promise((done) => {
        const started = performance.now();
        const timer = setInterval(() => {
          const t = (performance.now() - started) / 1000;
          const shut = t > 8.5 && t < 10;
          window.__camera.show({ left: null, right: shut ? 'fist' : 'open', scale: 0.7, rightOffsetX: Math.sin(t * 0.8) * 120 });
          if (t > 13) {
            clearInterval(timer);
            done();
          }
        }, 33);
      }));
    },
    report: (page) => page.evaluate(() => window.__game.battle.stats),
  },
  'giraffe-walk': {
    settings: { reach: 'little' },
    css: '.camera-frame { --camera-small: 24vw !important; left: 66% !important; }',
    async ready(page) {
      await page.evaluate(() => window.__camera.show({ left: null, right: 'open', scale: 0.7 }));
      await page.addScriptTag({ content: CHASE });
      await page.locator('#start').click();
      await screenIs(page, 'playing');
      await page.waitForFunction(() => window.__game.walk.fruit.length > 0, null, { timeout: 30_000 });
      await wait(page, 800);
    },
    async play(page) {
      // Onto a fruit with an open hand, shut on it, across to his mouth, and open.
      await page.evaluate(() => new Promise((done) => {
        const { walk } = window.__game;
        const glove = walk.gloves.right;
        let phase = 'reach';
        let since = performance.now();
        const go = (next) => {
          phase = next;
          since = performance.now();
        };
        const stop = window.__chase(
          () => glove,
          () => {
            if (phase === 'reach' || phase === 'shut') return walk.fruit.find(({ state }) => state === 'hanging');
            if (phase === 'carry' || phase === 'open') return walk.mouth;
            return null;
          },
          () => (phase === 'shut' || phase === 'carry' ? 'fist' : 'open'),
        );
        const steps = setInterval(() => {
          const held = performance.now() - since;
          const near = (at) => at && Math.hypot(at.x - glove.x, at.y - glove.y) < walk.palmSize * 0.5;
          if (phase === 'reach' && held > 500 && near(walk.fruit.find(({ state }) => state === 'hanging'))) go('shut');
          if (phase === 'shut' && walk.holding) go('carry');
          if (phase === 'carry' && held > 500 && walk.onMouth) go('open');
          if (phase === 'open' && held > 900) go('reach');
        }, 50);
        setTimeout(() => {
          stop();
          clearInterval(steps);
          done();
        }, 13_000);
      }));
    },
    report: (page) => page.evaluate(() => window.__game.journey.stats),
  },
  'spider-catcher': {
    settings: { reach: 'little', levels: { 'spider-catcher': 3 } },
    css: '.camera-frame { --camera-small: 24vw !important; left: 66% !important; }',
    async ready(page) {
      await page.evaluate(() => window.__camera.show({ left: null, right: 'open', scale: 0.7 }));
      await page.addScriptTag({ content: CHASE });
      await page.locator('#start').click();
      await screenIs(page, 'playing');
      await page.waitForFunction(() => window.__game.garden.spiders.some((spider) => window.__game.garden.catchable(spider)), null, { timeout: 30_000 });
      await wait(page, 600);
    },
    async play(page) {
      // An open hand goes after a spider that's moving, shuts on it, carries it across to the web, and
      // opens there to put it home.
      await page.evaluate(() => new Promise((done) => {
        const { garden } = window.__game;
        const glove = garden.gloves.right;
        let phase = 'reach';
        let since = performance.now();
        let chosen = null;
        const go = (next) => {
          phase = next;
          since = performance.now();
        };
        const stop = window.__chase(
          () => glove,
          () => {
            if (phase === 'reach' || phase === 'shut') {
              if (!chosen || !garden.catchable(chosen)) chosen = garden.spiders.find((spider) => garden.catchable(spider));
              return chosen;
            }
            if (phase === 'carry' || phase === 'open') return garden.web;
            return null;
          },
          () => (phase === 'shut' || phase === 'carry' ? 'fist' : 'open'),
          0.16,
        );
        const steps = setInterval(() => {
          const held = performance.now() - since;
          const near = (at) => at && Math.hypot(at.x - glove.x, at.y - glove.y) < garden.palmSize * 0.6;
          if (phase === 'reach' && held > 400 && near(chosen)) go('shut');
          if (phase === 'shut' && garden.holding) go('carry');
          if (phase === 'shut' && held > 1500) go('reach');
          if (phase === 'carry' && held > 400 && garden.onWeb) go('open');
          if (phase === 'open' && held > 900) {
            chosen = null;
            go('reach');
          }
        }, 50);
        setTimeout(() => {
          stop();
          clearInterval(steps);
          done();
        }, 14_000);
      }));
    },
    report: (page) => page.evaluate(() => window.__game.gathering.stats),
  },
  'smoothie-stand': {
    settings: { pace: 'medium' },
    async ready(page) {
      await page.evaluate(() => window.__camera.show({ left: null, right: 'open', scale: 0.7 }));
      await page.addScriptTag({ content: CHASE });
      await page.locator('#start').click();
      await screenIs(page, 'playing');
      await page.waitForFunction(() => window.__game.field.throwing, null, { timeout: 30_000 });
      await wait(page, 800);
    },
    async play(page) {
      // Big swipes back and forth across where the fruit comes up.
      await page.evaluate(() => new Promise((done) => {
        const started = performance.now();
        const timer = setInterval(() => {
          const t = (performance.now() - started) / 1000;
          window.__camera.show({ left: null, right: 'open', scale: 0.7, rightOffsetX: -90 + Math.sin(t * 2.7) * 190, rightOffsetY: -30 + Math.sin(t * 1.15) * 110 });
          if (t > 13) {
            clearInterval(timer);
            done();
          }
        }, 33);
      }));
    },
    report: (page) => page.evaluate(() => window.__game.stand.stats),
  },
  lighthouse: {
    settings: { reach: 'little' },
    async ready(page) {
      await page.evaluate(() => window.__camera.show({ left: null, right: 'open', scale: 0.7 }));
      await page.addScriptTag({ content: CHASE });
      await page.locator('#start').click();
      await screenIs(page, 'playing');
      await page.waitForFunction(() => window.__game.storm.ship, null, { timeout: 30_000 });
      await wait(page, 500);
    },
    async play(page) {
      // Across the window and back, lower each time, as anyone would clean a window.
      await page.evaluate(() => new Promise((done) => {
        const { room } = window.__game;
        const glass = room.window;
        const started = performance.now();
        const ROWS = 4;
        const ROW_SECONDS = 2.1;
        const stop = window.__chase(
          () => room.gloves.right,
          () => {
            const t = (performance.now() - started) / 1000 / ROW_SECONDS;
            const row = Math.min(ROWS - 1, Math.floor(t));
            const along = t - Math.floor(t);
            const share = row % 2 ? along : 1 - along;
            return { x: glass.x + glass.width * (0.03 + share * 0.94), y: glass.y + glass.height * ((row + 0.5) / ROWS) };
          },
        );
        setTimeout(() => {
          stop();
          done();
        }, 14_000);
      }));
    },
    report: (page) => page.evaluate(() => ({ home: window.__game.storm.home, clean: window.__game.storm.mud?.share })),
  },
  'mighty-moves': {
    settings: { level: 'gentle' },
    async ready(page) {
      await footage(page, 'demo-fight', { from: 0, playing: false });
      await page.locator('#start').click();
      await page.locator('#fight-start').click();
      await screenIs(page, 'fight');
      await page.waitForFunction(() => window.__game.coach?.phase === 'asking', null, { timeout: 30_000 });
      await page.evaluate(() => {
        window.__game.coach.computerIn = 1000;
      });
    },
    async play(page) {
      await footage(page, 'demo-fight', { from: 0, playing: true });
      await wait(page, 13_500);
    },
    report: (page) => page.evaluate(() => window.__game.fight.stats.exercises),
  },
  'leap-trail': {
    settings: { pace: 'slow' },
    async ready(page) {
      await footage(page, 'demo-trail', { from: 0, playing: false });
      await page.locator('#start').click();
      await page.locator('#run-start').click();
      await screenIs(page, 'practice');
      await page.locator('#practice-skip').click();
      await screenIs(page, 'run');
      await wait(page, 1200);
    },
    async play(page) {
      // Each obstacle fills the lanes given, right across unless it says.
      const obstacle = (kind, gap, lanes = [-1, 0, 1]) => page.evaluate(async ([chosen, ahead, filled]) => {
        const { OBSTACLES } = await import('/games/leap-trail/run.js');
        const { run, world } = window.__game;
        const next = run.next;
        world.retire(next);
        delete next.gold;
        Object.assign(next, OBSTACLES[chosen], { kind: chosen, at: run.distance + ahead, lanes: filled });
        run.announced = null;
        for (let i = next.index + 1; i < run.course.length; i += 1) {
          world.retire(run.course[i]);
          run.course[i].at = Math.max(run.course[i].at, next.at + 40 * (i - next.index));
        }
        run.end = Math.max(run.end, run.course.at(-1).at + 15);
      }, [kind, gap, lanes]);
      await obstacle('log', 46);
      await footage(page, 'demo-trail', { from: 0, playing: true });
      await wait(page, 3700);
      // Rocks in two lanes, and stars in the free one: a step to the side goes round them, and back.
      await obstacle('rocks', 62, [-1, 0]);
      await page.evaluate(() => {
        const { run } = window.__game;
        const at = run.distance + 22;
        for (let i = 0; i < 8; i += 1) run.starLines.splice(run.nextStar + i, 0, { at: at + i * 5, lane: 1, taken: false });
        window.__camera.shiftFootage(0.09);
      });
      await wait(page, 4200);
      await page.evaluate(() => window.__camera.shiftFootage(0));
      await wait(page, 600);
      await obstacle('hay', 40);
      await wait(page, 3700);
    },
    report: (page) => page.evaluate(() => window.__game.run.stats),
  },
  'sky-wings': {
    settings: { pace: 'slow', planes: 9 },
    css: '.camera-frame { --camera-small: 26vw !important; } .wing-meter { left: calc(12px + 26vw + 14px) !important; }',
    async ready(page) {
      await footage(page, 'wings', { from: 3.5, playing: false });
      await page.locator('#start').click();
      await page.locator('#fly-start').click();
      await screenIs(page, 'lesson');
      await page.locator('#lesson-skip').click();
      await screenIs(page, 'fly');
      // Over the island, heading for the town, with the volcano behind it.
      await page.evaluate(() => {
        const { flight, game } = window.__game;
        Object.assign(flight, { x: 40, y: 120, z: 560, heading: 0, pitch: -0.1 });
        game.clearAsk();
      });
      await wait(page, 1200);
    },
    async play(page) {
      // The arms are the real footage. Planes are kept coming across the ring so that it's not a long
      // wait in a short film, one at a time, and each is let go once it's been hit a few times.
      await footage(page, 'wings', { from: 3.2, playing: true });
      await page.evaluate(() => {
        const started = performance.now();
        setInterval(() => {
          const { flight } = window.__game;
          const [target] = flight.flying;
          if (!target || !flight.view) return;
          const t = (performance.now() - started) / 1000;
          const { eye, forward } = flight.view;
          const ahead = 95 + Math.sin(t * 0.7) * 15;
          const across = Math.sin(t * 1.1) * 12;
          target.x = eye.x + forward.x * ahead - forward.z * across;
          target.y = eye.y + forward.y * ahead + Math.cos(t * 0.9) * 6;
          target.z = eye.z + forward.z * ahead + forward.x * across;
          target.heading = flight.heading + 0.5;
          target.mode = 'cross';
          target.way = { x: target.x, y: target.y, z: target.z };
          target.modeLeft = 5;
          target.dodgeLeft = 1;
          flight.huntIn = 100;
        }, 16);
      });
      await wait(page, 11_500);
    },
    report: (page) => page.evaluate(() => window.__game.flight.stats),
  },
  'high-five-racers': {
    settings: { laps: 4, steering: 'help' },
    async ready(page) {
      await page.evaluate(() => window.__camera.show({ left: null, right: 'open', scale: 0.7 }));
      await page.locator('#start').click();
      await screenIs(page, 'playing');
      await wait(page, 1500);
    },
    async play(page) {
      // The open hand goes across to each big hand as it comes up, so the film shows high fives.
      await page.evaluate(() => new Promise((done) => {
        const { race } = window.__game;
        const TOWARDS = { 1: 150, '-1': -220 };
        const started = performance.now();
        let x = 0;
        const timer = setInterval(() => {
          const along = race.distance - race.track.length * Math.max(0, race.lapIndex);
          const { gates } = race.gates;
          const next = gates.find((gate) => gate.along > along) ?? gates[0];
          x += (TOWARDS[next.side] - x) * 0.08;
          window.__camera.show({ left: null, right: 'open', scale: 0.7, rightOffsetX: x });
          if (performance.now() - started > 13_000) {
            clearInterval(timer);
            done();
          }
        }, 33);
      }));
    },
    report: (page) => page.evaluate(() => {
      const { fives, fivesLeft, fivesRight, gatesMet } = window.__game.race;
      return { fives, fivesLeft, fivesRight, gatesMet };
    }),
  },
  'bounce-back': {
    settings: { bounceHelp: 'lots', bouncePace: 'medium', levels: { 'bounce-back': 6 } },
    css: '.camera-frame { --camera-small: 22vw !important; }',
    async ready(page) {
      await page.evaluate(() => window.__camera.show({ left: null, right: 'open', scale: 0.7 }));
      await page.addScriptTag({ content: CHASE });
      await page.locator('#start').click();
      await screenIs(page, 'playing');
      await wait(page, 500);
    },
    async play(page) {
      // The open hand goes to the ball whenever it comes over the net, and back to the middle of its half
      // after hitting it, as a child would.
      await page.evaluate(() => new Promise((done) => {
        const { court, rally, gloves } = window.__game;
        const stop = window.__chase(
          () => gloves.right,
          () => {
            const { ball } = rally;
            return ball.side === 'A' ? court.at(ball.u, ball.h) : court.at(-0.62, 0.45);
          },
          () => 'open',
          0.16,
        );
        setTimeout(() => {
          stop();
          done();
        }, 14_000);
      }));
    },
    report: (page) => page.evaluate(() => {
      const { stats, scores } = window.__game.rally;
      return { hits: stats.hits, longest: stats.longest, prizes: stats.prizes, scores };
    }),
  },
  'giraffe-maze': {
    settings: { mazeReach: 'lots', mazes: 3, levels: { 'giraffe-maze': 2 } },
    css: '.camera-frame { --camera-small: 22vw !important; } .maze-film { display: none !important; }',
    async ready(page) {
      await page.evaluate(() => window.__camera.show({ left: null, right: 'open', scale: 0.62 }));
      await page.addScriptTag({ content: CHASE });
      await page.locator('#start').click();
      await screenIs(page, 'playing');
      await wait(page, 600);
    },
    async play(page) {
      // The open hand leads Giraffe along the paths, a little ahead of him, to the friend lost in the maze, as a
      // child would. Each friend found follows him into the next maze.
      await page.evaluate(() => new Promise((done) => {
        const { game, view } = window.__game;
        const stop = window.__chase(
          () => {
            const glove = game.gloves.right;
            return { visible: glove.visible, x: glove.x + game.gloveOffset.x, y: glove.y + game.gloveOffset.y };
          },
          () => {
            const { run } = window.__game;
            if (run.phase !== 'walking') return null;
            const ahead = run.wayAhead(run.nextCell(), 1.3);
            return view.at(ahead.x, ahead.y);
          },
          () => 'open',
          0.14,
        );
        setTimeout(() => {
          stop();
          done();
        }, 15_000);
      }));
    },
    report: (page) => page.evaluate(() => {
      const { stats, index } = window.__game.run;
      return { found: stats.found, fruit: stats.fruit, prizes: stats.prizes, maze: index };
    }),
  },
  'giraffe-garden': {
    settings: { plants: 6, levels: { 'giraffe-garden': 2 } },
    css: '.camera-frame { --camera-small: 22vw !important; } .garden-film { display: none !important; }',
    async ready(page) {
      await page.evaluate(() => window.__camera.show({ left: null, right: 'palm', scale: 0.62 }));
      await page.locator('#start').click();
      await screenIs(page, 'playing');
      await wait(page, 800);
    },
    async play(page) {
      // The palm holds the can over a thirsty plant, and the hand turns over to pour, its back to the camera, as a
      // child would, one plant after another, and the bees come to each new flower.
      await page.evaluate(() => new Promise((done) => {
        let x = 0;
        let y = 0;
        const started = performance.now();
        const timer = setInterval(() => {
          const { game, garden, view, gloves } = window.__game;
          const glove = gloves.right;
          const plant = garden.nextPlant(glove.visible ? glove.x / innerWidth : 0.5);
          let pouring = false;
          if (glove.visible && plant) {
            const aim = garden.aimFor(plant);
            const to = view.at(aim.x, aim.y);
            const falls = view.waterAt(glove.x, glove.y, game.spoutSide);
            x += ((to.x - falls.x) / innerWidth) * 1280 * 0.1;
            y += ((to.y - falls.y) / innerHeight) * 720 * 0.1;
            pouring = Math.hypot(to.x - falls.x, to.y - falls.y) < innerHeight * (game.flow > 0 ? 0.1 : 0.05);
          }
          window.__camera.show({ left: null, right: pouring ? 'back' : 'palm', scale: 0.62, rightOffsetX: x, rightOffsetY: y });
          if (performance.now() - started > 15_000) {
            clearInterval(timer);
            done();
          }
        }, 33);
      }));
    },
    report: (page) => page.evaluate(() => {
      const { stats } = window.__game.garden;
      return { flowers: stats.flowers, pours: stats.pours, prizes: stats.prizes };
    }),
  },
  'giraffe-goal': {
    settings: { goalSaves: 14, levels: { 'giraffe-goal': 3 } },
    css: '.camera-frame { --camera-small: 22vw !important; } .goal-film { display: none !important; }',
    async ready(page) {
      await page.evaluate(() => window.__camera.show({ left: null, right: 'palm', scale: 0.62 }));
      await page.locator('#start').click();
      await screenIs(page, 'playing');
      await wait(page, 600);
    },
    async play(page) {
      // The open hand, held up, goes to each ring before its ball does, as a child would, and then to the star the
      // save knocks out: a curling shot from the fox, and plain ones from the pig.
      await page.evaluate(() => new Promise((done) => {
        let x = 0;
        let y = 0;
        const started = performance.now();
        const timer = setInterval(() => {
          const { goal, gloves } = window.__game;
          const glove = gloves.right;
          const wanted = goal.wants();
          if (glove.visible && wanted) {
            x += (wanted.x - glove.x / innerWidth) * 1280 * 0.12;
            y += (wanted.y - glove.y / innerHeight) * 720 * 0.12;
          }
          window.__camera.show({ left: null, right: 'palm', scale: 0.62, rightOffsetX: x, rightOffsetY: y });
          if (performance.now() - started > 15_000) {
            clearInterval(timer);
            done();
          }
        }, 33);
      }));
    },
    report: (page) => page.evaluate(() => {
      const { saves, goals, stars, shots } = window.__game.goal.stats;
      return { saves, goals, stars, shots };
    }),
  },
  'frost-arena': {
    settings: { arenaHard: 'gentle', levels: { 'frost-arena': 3 } },
    css: '.camera-frame { --camera-small: 24vw !important; }',
    async ready(page) {
      await page.evaluate(() => window.__camera.show({ left: 'open', right: 'open', scale: 0.7, sameHand: true }));
      await page.locator('#start').click();
      await screenIs(page, 'playing');
      await wait(page, 500);
    },
    async play(page) {
      // Two hands, as two thumbs on the glass of a phone. The right one, open, is dragged to look round: towards
      // whoever can be seen, or the way to go. When it has been dragged as far as is comfortable it closes, comes
      // back, and opens to drag again, and its thumb goes up on someone in the sights, and stays up while they're
      // nearly in them. The left one, open, is dragged to walk: forwards along the way with nobody about, slowly
      // from side to side while firing, and its thumb goes up for a moment when the magazine wants changing.
      await page.evaluate(async () => {
        const { wayTo, stepTowards } = await import('/games/frost-arena/arena.js');
        await new Promise((done) => {
          const started = performance.now();
          const REACH = 0.4; // How far the walking hand is dragged for full speed, in palm lengths.
          const FAR = 0.45; // How far across the other is dragged before it's brought back, in palm lengths.
          let tick = 0;
          let across = 0; // Where the hand that looks round is, in palm lengths from where it began.
          let down = 0; // And where it last went down.
          let phase = 'drag'; // drag, close, back or open.
          let phaseFor = 0;
          let stickX = 0;
          let stickY = 0;
          let onFor = 0;
          let thumbFor = 0;
          let thumbUp = 0;
          let way = null;
          let goal = { x: -6.5, z: 0 };
          const timer = setInterval(() => {
            tick += 1;
            const { match, controls } = window.__game;
            const { child } = match;
            const palm = (controls.aim.palm || 0.165) * 720;
            const seen = match.foesOf(child).filter((other) => other.safeLeft <= 0 && match.sees(child, other)).sort((a, b) => Math.hypot(a.x - child.x, a.z - child.z) - Math.hypot(b.x - child.x, b.z - child.z))[0];
            if (Math.hypot(child.x - goal.x, child.z - goal.z) < 2.5) goal = { x: goal.x < 0 ? 6.5 : -6.5, z: -goal.z - 3 };
            if (!way || tick % 15 === 0) way = wayTo(goal.x, goal.z);
            const to = seen ?? stepTowards(way, child.x, child.z);
            const wanted = Math.atan2(to.x - child.x, -(to.z - child.z));
            const off = Math.atan2(Math.sin(wanted - child.heading), Math.cos(wanted - child.heading));
            const within = seen ? Math.min(0.09, Math.atan2(0.3, Math.hypot(seen.x - child.x, seen.z - child.z))) : 0;
            onFor = seen && Math.abs(off) < within ? onFor + 1 : 0;
            // The thumb goes up once the sights have been on someone for a moment, and stays up while they're nearly on them.
            if (onFor > 2) thumbUp = 12;
            else if (!seen || Math.abs(off) > within * 3) thumbUp = 0;
            else if (thumbUp > 0) thumbUp -= 1;
            phaseFor += 1;
            if (phase === 'drag') {
              // What the game has seen of the hand is a moment behind where the hand is: the turn still on its
              // way is allowed for.
              const coming = (across - down - controls.aim.offset.x) * controls.gain;
              const step = Math.max(-0.07, Math.min(0.07, ((off - coming) / controls.gain) * 0.35));
              // As far as is comfortable, with a good way still to turn: it lets go, to come back and drag again.
              if (Math.abs(across + step) > FAR && Math.abs(off) > 0.25 && Math.sign(step) === Math.sign(across)) [phase, phaseFor] = ['close', 0];
              else across += step;
            } else if (phase === 'close' && phaseFor > 3) {
              [phase, phaseFor] = ['back', 0];
            } else if (phase === 'back') {
              const home = -Math.sign(off) * FAR * 0.7;
              across += Math.max(-0.12, Math.min(0.12, home - across));
              if (Math.abs(home - across) < 0.01) [phase, phaseFor] = ['open', 0];
            } else if (phase === 'open' && phaseFor > 2) {
              [phase, phaseFor, down] = ['drag', 0, across];
            }
            const lifted = phase === 'close' || phase === 'back';
            stickX += ((seen ? Math.sign(Math.sin(tick * 0.06)) * 0.45 : 0) - stickX) * 0.2;
            stickY += ((seen ? 0 : Math.abs(off) < 0.9 ? -1.05 : -0.3) - stickY) * 0.2;
            if (!seen && child.rounds < 12 && child.reloadLeft === 0 && thumbFor === 0) thumbFor = 8;
            if (thumbFor > 0) thumbFor -= 1;
            window.__camera.show({ left: thumbFor > 2 ? 'thumbs-up' : 'open', right: lifted ? 'fist' : thumbUp > 0 ? 'thumbs-up' : 'open', scale: 0.7, sameHand: true, rightOffsetX: across * palm, leftOffsetX: stickX * REACH * palm, leftOffsetY: stickY * REACH * palm });
            if (performance.now() - started > 18_000) {
              clearInterval(timer);
              done();
            }
          }, 33);
        });
      });
    },
    report: (page) => page.evaluate(() => {
      const { tags, shots, hits, reloads, walked } = window.__game.match.stats;
      return { tags, shots, hits, reloads, walked: Math.round(walked) };
    }),
  },
  'mighty-lift': {
    settings: { levels: { 'mighty-lift': 2 }, lifts: 12 },
    css: '.lift-meter { display: none !important; }',
    async ready(page) {
      await footage(page, 'lifts', { from: 0.3, playing: false });
      await page.locator('#start').click();
      await page.locator('#lift-start').click();
      await screenIs(page, 'warmup');
      await page.locator('#warm-skip').click();
      await screenIs(page, 'playing');
      await wait(page, 600);
    },
    async play(page) {
      // The right arm goes right up and holds it there while the friend scrambles out and the star is had, and a
      // moment after they're free it comes down with care, and up again for the next: the footage goes on from where
      // the person in it starts lowering their arm, and back to its start for the next lift.
      const started = Date.now();
      while (Date.now() - started < 12_000) {
        await footage(page, 'lifts', { from: 1.2, playing: true });
        await page.waitForFunction(() => window.__game.lifting.phase === 'freed', null, { timeout: 20_000 });
        await wait(page, 700);
        await footage(page, 'lifts', { from: 5.1, playing: true });
        await page.waitForFunction(() => window.__game.lifting.phase !== 'freed', null, { timeout: 20_000 });
        // Down, and resting there until the next friend is in.
        await footage(page, 'lifts', { from: 0.6, playing: false });
        await page.waitForFunction(() => window.__game.lifting.phase === 'lifting', null, { timeout: 20_000 });
      }
    },
    report: (page) => page.evaluate(() => window.__game.lifting.stats),
  },
  'balloon-pop': {
    settings: { reach: 'none', pace: 'medium' },
    async ready(page) {
      await page.evaluate(() => window.__camera.show({ left: null, right: 'open', scale: 0.7 }));
      await page.locator('#start').click();
      await screenIs(page, 'playing');
      await wait(page, 1200);
    },
    async play(page) {
      await page.evaluate(() => new Promise((done) => {
        const started = performance.now();
        let nextBalloon = 0;
        const timer = setInterval(() => {
          const t = (performance.now() - started) / 1000;
          const x = -170 + Math.sin(t * 0.8) * 180;
          const y = Math.sin(t * 1.6) * 110;
          window.__camera.show({ left: null, right: 'open', rightOffsetX: x, rightOffsetY: y, scale: 0.7 });
          const { balloons } = window.__game;
          const glove = balloons.gloves.right;
          // A balloon a little ahead of where the hand is going.
          if (t > nextBalloon && glove.visible) {
            nextBalloon = t + 1.7;
            const dx = Math.cos(t * 0.8) * 150;
            const dy = Math.cos(t * 1.6) * 120;
            balloons.spawnAt(Math.min(balloons.width - 90, Math.max(90, glove.x + dx * 0.9)), Math.min(balloons.height - 90, Math.max(190, glove.y + dy * 0.9)), { still: true });
          }
          if (t > 11) {
            clearInterval(timer);
            done();
          }
        }, 33);
      }));
    },
    report: (page) => page.evaluate(() => window.__game.balloons.popped),
  },
};

const wanted = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--mute-audio'] });

for (const [game, film] of Object.entries(FILMS)) {
  if (wanted.length && !wanted.includes(game)) continue;
  const dir = mkdtempSync(join(tmpdir(), 'camera-games-demo-'));
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    bypassCSP: true, // Only to make the camera picture bigger here.
    recordVideo: { dir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  const opened = Date.now();
  page.on('pageerror', (error) => console.error(game, 'page error', error.message));
  await page.addInitScript({ path: join(ROOT, 'test/e2e/fake-camera.js') });
  await page.addInitScript((saved) => localStorage.setItem('camera-games-settings', JSON.stringify(saved)), { voice: false, sound: false, ...film.settings });
  await page.goto(`${SITE}/games/${game}/index.html?debug`);
  await page.waitForFunction(() => window.__game, null, { timeout: 60_000 });
  await page.addStyleTag({ content: BIG_CAMERA + (film.css ?? '') });
  await film.ready(page);
  const from = (Date.now() - opened) / 1000;
  await film.play(page);
  const to = (Date.now() - opened) / 1000;
  console.log(game, JSON.stringify(await film.report(page)));
  const video = page.video();
  await context.close();
  const raw = await video.path();
  const finished = join(OUT, `${game}.webm`);
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(from), '-to', String(to), '-i', raw, '-vf', 'scale=720:-2', '-c:v', 'libvpx-vp9', '-b:v', '420k', '-crf', '36', '-pix_fmt', 'yuv420p', '-an', finished]);
  console.log(`${game}: ${Math.round(statSync(finished).size / 1024)} KB, ${(to - from).toFixed(1)} s`);
}
await browser.close();
