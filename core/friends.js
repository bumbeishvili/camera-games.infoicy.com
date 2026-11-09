// Playing with friends, each on their own computer, in High Five Racers, Sky Wings and Balloon Pop. One player makes a
// race or a flight and sends the link, and the others open it. Their games talk through a small server
// (server/race-room.js), which only passes on where each car or plane is, the name typed and who drives or
// flies. The camera picture never leaves the computer, and nothing is sent at all unless a grown-up makes or
// joins one. How it looks is in friends-ui.js.
import { makeCode, validCode } from '../server/race-room.js';

// The server: the one on Cloudflare, or tools/race-server.mjs when the games are on this computer.
const LOCAL = ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname);
export const RACE_SERVER = LOCAL ? 'ws://localhost:8643' : 'wss://hemi-race.infoicy.com';
const SEND_EVERY_MS = 100; // Where the car or plane is, 10 times a second.
// A connection can die without closing, as when the wifi drops, and then nothing more comes. Asking every so
// often, and hearing nothing back for a while, is how that's noticed: quickly in a race, slowly otherwise.
const HEARTBEAT = { racing: { every: 2000, silent: 6000 }, waiting: { every: 25_000, silent: 60_000 } };
const RETRIES = 6; // Coming back within about 12 seconds.
const SHOW_BEHIND_MS = 120; // Friends are shown this far in the past, so there's always a next place to go to.
const GUESS_AHEAD_MS = 500; // With nothing new for a while, they carry on this far the way they were going.
const KEEP_SAMPLES = 30;

/** A fresh code. */
export const newCode = () => makeCode((below) => crypto.getRandomValues(new Uint32Array(1))[0] % below);

/** The code in a link, as in #race=ABC234. The part after # never goes to a web server. */
export function codeInLink(hash = location.hash, key = 'race') {
  const code = new URLSearchParams(hash.replace(/^#/, '')).get(key)?.toUpperCase();
  return validCode(code) ? code : null;
}

export const linkFor = (code, key = 'race') => `${location.origin}${location.pathname}#${key}=${code}`;

/** The shortest way round from one angle to another, in radians. */
const turn = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * Where a friend is, from what their game sends. Each message says how long after "GO!" it was sent, by
 * their clock, which is what they're placed by: messages that arrive bunched up still move them smoothly.
 * offset is how much later than that they get here at best, which the slowest ones are measured against.
 * kind says what's in a message: lerp, numbers that go smoothly from one to the next, angles, which go the
 * short way round, steps, which change half way, and guess(last, seconds), where they'd be that long after
 * the last message, going the way they were.
 */
export class Track {
  constructor({ lerp = [], angles = [], steps = [], guess = () => ({}) }) {
    Object.assign(this, { lerp, angles, steps, guess });
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

  /** Where they're to be shown at this moment, or null before anything has come. */
  at(now) {
    const { samples } = this;
    if (!samples.length) return null;
    const time = now - this.offset - SHOW_BEHIND_MS;
    const last = samples.at(-1);
    if (time >= last.ms) {
      const ahead = Math.min(time - last.ms, GUESS_AHEAD_MS) / 1000;
      return { ...last, ...this.guess(last, ahead) };
    }
    let after = samples.length - 1;
    while (after > 0 && samples[after - 1].ms > time) after -= 1;
    if (after === 0) return { ...samples[0] };
    const before = samples[after - 1];
    const next = samples[after];
    const share = (time - before.ms) / Math.max(1, next.ms - before.ms);
    const out = { ms: time };
    for (const key of this.lerp) out[key] = before[key] + (next[key] - before[key]) * share;
    for (const key of this.angles) out[key] = before[key] + turn(before[key], next[key]) * share;
    for (const key of this.steps) out[key] = share < 0.5 ? before[key] : next[key];
    return out;
  }
}

/**
 * One room, from this computer's side. game is which game's rooms, as the server keeps each game's apart:
 * '' for High Five Racers, whose rooms came first, or 'sky-wings'. events: onChange() whenever who's here or
 * the connection changes, onGo({ level, length, racers }) as it starts, onMove(id, message) for where a
 * friend is, and onDone(id, message) as they finish. status is off, connecting, in, full or lost.
 */
export class FriendsRoom {
  constructor(game = '', events = {}) {
    this.game = game;
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
      socket = new WebSocket(`${RACE_SERVER}/room/${this.game ? `${this.game}/` : ''}${this.code}${was}`);
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
    } else if (message.t === 'car' || message.t === 'plane' || message.t === 'score') {
      this.events.onMove?.(message.from, message);
    } else if (message.t === 'done') {
      this.events.onDone?.(message.from, message);
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

  /** Where the car or plane is, as kind car or plane, sent no more than 10 times a second. ms is how long since "GO!". */
  sendMove(kind, state, ms, now = performance.now()) {
    if (now - this.sentAt < SEND_EVERY_MS) return;
    this.sentAt = now;
    this.say({ t: kind, ms: Math.round(ms), ...state });
  }

  /** How many popped, or got right, so far, this long after "GO!". Only sent when it changes. */
  sendScore(n, ms) {
    this.say({ t: 'score', ms: Math.round(ms), n });
  }

  /** Finished, this long after "GO!". extra is how it went: n, how many were dropped, and w, 1 if all of them. */
  done(ms, extra = {}) {
    this.racing = false;
    this.say({ t: 'done', ms: Math.round(ms), ...extra });
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
