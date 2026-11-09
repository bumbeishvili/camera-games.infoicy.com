// Racing friends, each on their own computer. One player makes a race and sends the link, and the others
// open it. Their games talk through a small server (server/race-room.js), which only passes on where each
// car is, the name typed and who drives. The camera picture never leaves the computer, and nothing is
// sent at all unless a grown-up makes or joins a race.
import { makeCode, validCode } from '../../server/race-room.js';

// The race server: the one on Cloudflare, or tools/race-server.mjs when the games are on this computer.
const LOCAL = ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname);
export const RACE_SERVER = LOCAL ? 'ws://localhost:8643' : 'wss://hemi-race.infoicy.com';
const SEND_EVERY_MS = 100; // Where the car is, 10 times a second.
// A connection can die without closing, as when the wifi drops, and then nothing more comes. Asking every so
// often, and hearing nothing back for a while, is how that's noticed: quickly in a race, slowly otherwise.
const HEARTBEAT = { racing: { every: 2000, silent: 6000 }, waiting: { every: 25_000, silent: 60_000 } };
const RETRIES = 6; // Coming back within about 12 seconds.
const SHOW_BEHIND_MS = 120; // Friends' cars are shown this far in the past, so there's always a next place to go to.
const GUESS_AHEAD_MS = 500; // With nothing new for a while, a car carries on this far at the speed it was going.
const KEEP_SAMPLES = 30;

/** A fresh race code. */
export const newCode = () => makeCode((below) => crypto.getRandomValues(new Uint32Array(1))[0] % below);

/** The race code in a link, as in #race=ABC234. The part after # never goes to a web server. */
export function codeInLink(hash = location.hash) {
  const code = new URLSearchParams(hash.replace(/^#/, '')).get('race')?.toUpperCase();
  return validCode(code) ? code : null;
}

export const linkFor = (code) => `${location.origin}${location.pathname}#race=${code}`;

/**
 * Where a friend's car is, from what their game sends. Each message says how long after "GO!" it was sent,
 * by their clock, which is what the car is placed by: messages that arrive bunched up still move it
 * smoothly. offset is how much later than that they get here at best, which the slowest ones are measured
 * against.
 */
export class CarTrack {
  constructor() {
    this.clear();
  }

  clear() {
    this.samples = [];
    this.offset = null;
  }

  push(sample, receivedAt) {
    const offset = receivedAt - sample.ms;
    // The best so far, drifting slowly back up, so that a slower connection later on is caught up with.
    this.offset = this.offset === null || offset < this.offset ? offset : this.offset + (offset - this.offset) * 0.02;
    const last = this.samples.at(-1);
    if (last && sample.ms <= last.ms) return;
    this.samples.push(sample);
    if (this.samples.length > KEEP_SAMPLES) this.samples.shift();
  }

  /** Where the car is to be shown at this moment, or null before anything has come. */
  at(now) {
    const { samples } = this;
    if (!samples.length) return null;
    const time = now - this.offset - SHOW_BEHIND_MS;
    const last = samples.at(-1);
    if (time >= last.ms) {
      const ahead = Math.min(time - last.ms, GUESS_AHEAD_MS) / 1000;
      return { ...last, d: last.d + last.s * ahead };
    }
    let after = samples.length - 1;
    while (after > 0 && samples[after - 1].ms > time) after -= 1;
    if (after === 0) return { ...samples[0] };
    const before = samples[after - 1];
    const next = samples[after];
    const share = (time - before.ms) / Math.max(1, next.ms - before.ms);
    const mix = (key) => before[key] + (next[key] - before[key]) * share;
    return { ms: time, d: mix('d'), x: mix('x'), s: mix('s'), l: mix('l'), f: share < 0.5 ? before.f : next.f, b: share < 0.5 ? before.b : next.b };
  }
}

/**
 * One race room, from this computer's side. events: onChange() whenever who's here or the connection
 * changes, onGo({ level, laps, racers }) as a race starts, onCar(id, sample) and onDone(id, ms).
 * status is off, connecting, in, full or lost.
 */
export class FriendsRoom {
  constructor(events = {}) {
    this.events = events;
    this.status = 'off';
    this.code = null;
    this.members = [];
    this.you = null;
    this.hello = null;
    this.socket = null;
    this.sentAt = -Infinity;
    this.racing = false; // In a race, which a connection lost for a moment and back again carries on with.
  }

  get inRoom() {
    return this.status === 'in';
  }

  get me() {
    return this.members.find(({ id }) => id === this.you) ?? null;
  }

  get hosting() {
    return Boolean(this.me?.host);
  }

  /** Makes a new race, or joins the one with this code. hello is { name, driver, level, laps }. */
  join(code, hello) {
    this.leave();
    this.code = code;
    this.hello = hello;
    this.tries = 0;
    this.connect();
  }

  connect() {
    this.status = 'connecting';
    this.events.onChange?.();
    let socket;
    try {
      // Coming back after losing the connection, with the same id, so friends still see the same car.
      const was = this.you ? `?was=${encodeURIComponent(this.you)}` : '';
      socket = new WebSocket(`${RACE_SERVER}/room/${this.code}${was}`);
    } catch {
      this.reconnect();
      return;
    }
    this.socket = socket;
    socket.addEventListener('open', () => {
      this.tries = 0;
      this.heardAt = performance.now();
      this.pingedAt = this.heardAt;
      this.say({ t: 'hi', ...this.hello, racing: this.racing });
      clearInterval(this.pinger);
      this.pinger = setInterval(() => this.beat(), 1000);
    });
    socket.addEventListener('message', ({ data }) => this.hear(data));
    socket.addEventListener('close', () => {
      if (this.socket !== socket || this.status === 'full') return;
      this.reconnect();
    });
  }

  /**
   * A moment's break is put right by itself, with a new connection, as the same player. The old one isn't
   * waited for: one that died without closing could take a long time to say so.
   */
  reconnect() {
    const { socket } = this;
    this.socket = null;
    clearInterval(this.pinger);
    try {
      socket?.close();
    } catch {
      // Already closing.
    }
    if (this.tries >= RETRIES) {
      this.lost();
      return;
    }
    this.tries += 1;
    clearTimeout(this.retry);
    this.retry = setTimeout(() => this.connect(), 600 * this.tries);
  }

  /** Asks the server now and then, and starts again if it has gone quiet. */
  beat(now = performance.now()) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const { every, silent } = this.racing ? HEARTBEAT.racing : HEARTBEAT.waiting;
    if (now - this.heardAt > silent) {
      this.reconnect();
      return;
    }
    if (now - this.pingedAt >= every) {
      this.pingedAt = now;
      this.send('ping');
    }
  }

  lost() {
    this.socket = null;
    this.status = 'lost';
    this.racing = false;
    this.members = [];
    this.events.onChange?.();
  }

  hear(text) {
    this.heardAt = performance.now();
    if (text === 'pong') return;
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (message.t === 'room') {
      this.status = 'in';
      this.you = message.you;
      this.members = message.members;
      this.events.onChange?.();
    } else if (message.t === 'full') {
      this.status = 'full';
      this.socket?.close();
      this.socket = null;
      this.events.onChange?.();
    } else if (message.t === 'go') {
      this.events.onGo?.(message);
    } else if (message.t === 'car') {
      this.events.onCar?.(message.from, message);
    } else if (message.t === 'done') {
      this.events.onDone?.(message.from, message.ms);
    }
  }

  send(text) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(text);
  }

  say(message) {
    this.send(JSON.stringify(message));
  }

  /** The name, driver or course has changed. */
  tell(hello) {
    this.hello = { ...this.hello, ...hello };
    this.say({ t: 'hi', ...this.hello, racing: this.racing });
  }

  ready() {
    this.racing = false;
    this.say({ t: 'ready' });
  }

  /** The host starts the race with whoever is ready. */
  go() {
    this.say({ t: 'go' });
  }

  /** Where the car is, sent no more than 10 times a second. ms is how long since "GO!". */
  sendCar(car, ms, now = performance.now()) {
    if (now - this.sentAt < SEND_EVERY_MS) return;
    this.sentAt = now;
    this.say({ t: 'car', ms: Math.round(ms), ...car });
  }

  done(ms) {
    this.racing = false;
    this.say({ t: 'done', ms: Math.round(ms) });
  }

  leave() {
    clearTimeout(this.retry);
    clearInterval(this.pinger);
    const { socket } = this;
    this.socket = null;
    if (socket) {
      try {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'leave' }));
        socket.close();
      } catch {
        // Already closing.
      }
    }
    this.status = 'off';
    this.racing = false;
    this.members = [];
    this.you = null;
    this.code = null;
    this.events.onChange?.();
  }
}
