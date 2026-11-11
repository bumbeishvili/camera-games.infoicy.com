// Racing friends in High Five Racers: its words, and what it sends and shows. The rest is shared with Sky
// Wings, in core/friends-ui.js.
import { FriendsPanel, time } from '../../core/friends-ui.js';

const byId = (id) => document.getElementById(id);

export const RACE_WORDS = {
  toggle: 'Race a friend', // The button on the title card.
  make: 'Make a race',
  codeLabel: 'A friend’s race code',
  codeName: 'Race code',
  how: 'Tell your friend the code. Then you both press <b>Let’s race!</b>',
  leave: 'Leave this race',
  privacy: 'Only your name, who drives and where your car is go to your friends. The camera picture stays on this computer.',
  alone: 'Race on your own',
  full: 'That race already has 4 cars.',
  lost: 'Can’t reach the race. Check the internet, then try again.',
  left: 'You’ve left the race.',
  badCode: 'A race code is 3 letters and numbers.',
  busy: 'Racing', // Someone in the middle of a race, on the waiting screen.
  still: 'still racing', // Someone who hasn't finished yet, on the finish card.
};

export class FriendsRace extends FriendsPanel {
  /** game is the RaceGame, which this asks to show friends' cars and tells who's gone. */
  constructor(game) {
    const { session } = game;
    super({
      words: RACE_WORDS,
      // laps as well as length, for a race server from before Sky Wings had friends.
      hello: () => ({ driver: session.settings.fighter, level: session.levels.current, length: session.settings.laps, laps: session.settings.laps }),
      screen: () => session.screen,
      portraits: () => session.portraits,
      onGone: (friend) => game.friendGone(friend.key),
      resultText: ({ ms }) => time(ms),
      titles: { first: 'You won the race!', other: 'Great racing!' },
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
  }

  /** Once the race has been laid out, friends' cars are there to be moved. */
  carsReady(race) {
    for (const friend of this.current?.friends ?? []) this.follow(friend.id, race.friendCars.get(friend.key).track);
  }

  sendCar(car, ms) {
    this.sendMove('car', car, ms);
  }

  /** The child has crossed the line. */
  crossed(ms) {
    this.finished(ms, { w: 1 });
  }
}
