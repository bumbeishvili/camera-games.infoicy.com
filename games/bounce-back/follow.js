// Playing Bounce Back with a friend, the game of whoever made it runs the ball (rally.js), and sends where it
// is about 10 times a second. This is how the friend's game shows it in between: from the newest message,
// moved on by the same rules as it has gone since, so it's where it is now rather than a moment ago. The
// friend's own hit shows at once, before the other game has it, and then the ball is theirs again. No DOM
// here, so it can be tested on its own.
import { advanceBall, BALL_KINDS, clamp, sideOf, STATES } from './rules.js';

const AHEAD_AT_MOST = 0.4; // Seconds a message is moved on by, at most, with nothing newer.
const OWN_FOR_MS = 1500; // How long a hit here is shown before the other game must have had it.

export class BallFollower {
  constructor() {
    this.latest = null;
    this.offset = null;
    this.own = null;
  }

  /** A message from the other game: see Rally.wire. */
  push(message, receivedAt) {
    const offset = receivedAt - message.ms;
    // The quickest delivery so far, drifting slowly back up, as in core/friends.js.
    this.offset = this.offset === null || offset < this.offset ? offset : this.offset + (offset - this.offset) * 0.02;
    if (this.latest && message.ms < this.latest.ms) return;
    this.latest = message;
    if (this.own && message.k > this.own.stroke) this.own = null;
  }

  /** The child here hit the ball, numbered stroke, and it's on its way back: { u, h, vu, vh, kind }. */
  hitHere(ball, stroke, now) {
    this.own = { ball: { ...ball, state: 'flying', rolling: false }, stroke, at: now };
  }

  /** Whether a hit from here is on its way, and not yet in the other game. */
  get waitingForHit() {
    return Boolean(this.own);
  }

  /** The score and the rest, from the newest message. */
  get score() {
    const latest = this.latest;
    if (!latest) return null;
    return { A: latest.a, B: latest.b, rally: latest.n, server: sideOf(latest.sv), winner: sideOf(latest.g), over: latest.w === 1, stroke: latest.k };
  }

  /** The ball as it is now, as best this game can tell, or null before anything has come. envFor(kind) is how it moves. */
  ballAt(now, envFor) {
    const { own } = this;
    if (own) {
      if (now - own.at <= OWN_FOR_MS) {
        const ball = { ...own.ball, stroke: own.stroke + 1, by: own.ball.by };
        advanceBall(ball, (now - own.at) / 1000, envFor(ball.kind));
        return ball;
      }
      this.own = null;
    }
    const latest = this.latest;
    if (!latest) return null;
    const ball = {
      u: latest.x,
      h: latest.y,
      vu: latest.vx,
      vh: latest.vy,
      state: STATES[latest.s] ?? 'held',
      kind: BALL_KINDS[latest.f] ?? 'beach',
      stroke: latest.k,
      by: sideOf(latest.l),
      rolling: latest.r === 1,
    };
    if (ball.state === 'flying' || ball.state === 'dead') {
      advanceBall(ball, clamp((now - this.offset - latest.ms) / 1000, 0, AHEAD_AT_MOST), envFor(ball.kind));
    }
    return ball;
  }
}
