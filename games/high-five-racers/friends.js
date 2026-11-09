// Racing friends in High Five Racers: what's sent about a car, and how a friend's is moved between messages.
// The connection is in core/friends.js, and how it looks in core/friends-ui.js.
import { Track } from '../../core/friends.js';

export { codeInLink } from '../../core/friends.js';

/** A friend's car: how far along, how far across, its speed and lift, and whether it's in the air or on turbo. */
export class CarTrack extends Track {
  constructor() {
    super({ lerp: ['d', 'x', 's', 'l'], steps: ['f', 'b'], guess: (last, seconds) => ({ d: last.d + last.s * seconds }) });
  }
}
