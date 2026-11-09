// Playing Balloon Pop with friends, the host's game runs the balloons, and sends where they all are about 10
// times a second. This is how a friend's game shows them between one message and the next: a moment
// behind, each moving smoothly, matched up by its id.
const SHOW_BEHIND_MS = 120;
const KEEP = 12;

export class WorldTrack {
  constructor() {
    this.samples = [];
    this.offset = null;
  }

  /** The newest message, for the sum being asked, which doesn't need to move smoothly. */
  get latest() {
    return this.samples.at(-1) ?? null;
  }

  push(message, receivedAt) {
    const offset = receivedAt - message.ms;
    // The fastest delivery so far, drifting slowly back up, as in core/friends.js.
    this.offset = this.offset === null || offset < this.offset ? offset : this.offset + (offset - this.offset) * 0.02;
    const last = this.samples.at(-1);
    if (last && message.ms <= last.ms) return;
    this.samples.push(message);
    if (this.samples.length > KEEP) this.samples.shift();
  }

  /** The balloons as they were a moment ago, as { b, q, qa }, or null before anything has come. */
  at(now) {
    const { samples } = this;
    if (!samples.length) return null;
    const time = now - this.offset - SHOW_BEHIND_MS;
    let after = samples.findIndex((sample) => sample.ms > time);
    if (after === -1) return samples.at(-1);
    if (after === 0) return samples[0];
    const before = samples[after - 1];
    const next = samples[after];
    const share = (time - before.ms) / Math.max(1, next.ms - before.ms);
    const was = new Map(before.b.map((balloon) => [balloon[0], balloon]));
    // A balloon in both goes smoothly from one to the other. One that has only just come is where it is.
    const b = next.b.map((balloon) => {
      const from = was.get(balloon[0]);
      if (!from) return balloon;
      const [id, x, y, r, colour, shown, flags] = balloon;
      return [id, from[1] + (x - from[1]) * share, from[2] + (y - from[2]) * share, from[3] + (r - from[3]) * share, colour, shown, flags];
    });
    return { b, q: next.q, qa: next.qa };
  }
}
