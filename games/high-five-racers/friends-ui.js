// What racing friends looks like: "Race a friend" on the title card, the screen for waiting on the grid,
// and who came where on the finish card. The connection itself is in friends.js.
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { validCode } from '../../server/race-room.js';
import { codeInLink, FriendsRoom, linkFor, newCode } from './friends.js';

const NAME_KEY = 'camera-games-race-name';
const byId = (id) => document.getElementById(id);
const ordinal = (place) => ['1st', '2nd', '3rd', '4th'][place - 1] ?? `${place}th`;
const time = (ms) => {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

function savedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Private windows can refuse. The name is just typed again.
  }
}

const STATUS = {
  connecting: 'Connecting…',
  full: 'That race already has 4 cars.',
  lost: 'Can’t reach the race. Check the internet, then try again.',
};

const BOX = `
  <button id="friends-toggle" class="friends-toggle" type="button" aria-expanded="false" aria-controls="friends-box">Race a friend</button>
  <div id="friends-box" class="friends-box" hidden>
    <div id="friends-out" class="friends-out">
      <label class="friends-field">Your name <input id="friends-name" maxlength="16" autocomplete="off" spellcheck="false"></label>
      <button id="friends-make" class="friends-button" type="button">Make a race</button>
      <form id="friends-join" class="friends-join">
        <label class="friends-field">Or a friend’s race code <input id="friends-code" maxlength="6" autocomplete="off" spellcheck="false" autocapitalize="characters"></label>
        <button class="friends-button" type="submit">Join</button>
      </form>
    </div>
    <div id="friends-in" class="friends-in" hidden>
      <p class="friends-code-line">Race code <strong id="friends-code-shown"></strong></p>
      <button id="friends-copy" class="friends-button" type="button">Copy the link</button>
      <ul id="friends-here" class="friends-here"></ul>
      <p class="friends-how">Send the link to a friend. Then you both press <b>Let’s race!</b></p>
      <button id="friends-leave" class="friends-link" type="button">Leave this race</button>
    </div>
    <p id="friends-status" class="friends-status" role="status"></p>
    <p class="small-print">Only your name, who drives and where your car is go to your friends. The camera picture stays on this computer.</p>
  </div>`;

const WAITING = `
  <div class="card title-card">
    <h2>Waiting for your friends</h2>
    <ul id="friends-waiting" class="friends-here"></ul>
    <p id="friends-wait-status" class="friends-status" role="status"></p>
    <button id="friends-now" class="big-button" type="button">Start now</button>
    <button id="friends-alone" class="friends-link" type="button">Race on your own</button>
  </div>`;

export class FriendsRace {
  /** game is the RaceGame, which this asks to show friends' cars and tells who's gone. */
  constructor(game) {
    this.game = game;
    this.session = game.session;
    this.current = null; // The race with friends being played, once it has started: see start().
    this.results = new Map(); // id: how long after "GO!" they crossed the line.
    this.go = null;
    this.room = new FriendsRoom({
      onChange: () => this.changed(),
      onGo: (message) => this.start(message),
      onCar: (id, sample) => this.current?.cars.get(id)?.track.push(sample, performance.now()),
      onDone: (id, ms) => this.crossedLine(id, ms),
    });

    const friends = document.createElement('div');
    friends.className = 'friends';
    friends.innerHTML = BOX;
    byId('start').after(friends);
    const waiting = document.createElement('section');
    waiting.id = 'screen-friends';
    waiting.className = 'screen friends-screen';
    waiting.innerHTML = WAITING;
    byId('screen-finish').before(waiting);
    this.resultsList = document.createElement('ol');
    this.resultsList.className = 'friends-results';
    this.resultsList.hidden = true;
    document.querySelector('#screen-finish .finish-hero')?.after(this.resultsList);
    this.finishTitle = document.querySelector('#screen-finish h2');
    this.finishWords = this.finishTitle?.textContent ?? '';

    byId('friends-name').value = savedName();
    byId('friends-name').addEventListener('change', () => {
      saveName(this.name);
      if (this.room.inRoom) this.room.tell(this.hello());
    });
    byId('friends-toggle').addEventListener('click', () => this.openBox(byId('friends-box').hidden));
    byId('friends-make').addEventListener('click', () => this.join(newCode()));
    byId('friends-join').addEventListener('submit', (event) => {
      event.preventDefault();
      const code = byId('friends-code').value.trim().toUpperCase();
      if (validCode(code)) this.join(code);
      else this.status('A race code is 6 letters and numbers.');
    });
    byId('friends-copy').addEventListener('click', () => this.copyLink());
    byId('friends-leave').addEventListener('click', () => this.leave());
    byId('friends-now').addEventListener('click', () => this.room.go());
    byId('friends-alone').addEventListener('click', () => {
      const { go } = this;
      this.leave();
      go?.();
    });

    // A link from a friend goes straight into their race.
    const code = codeInLink();
    if (code) {
      this.openBox(true);
      this.join(code);
    }
  }

  get name() {
    return byId('friends-name').value.replace(/\s+/g, ' ').trim().slice(0, 16);
  }

  /** What friends are told about this player, and the course the race would be on if they host it. */
  hello() {
    const { settings, levels } = this.session;
    return { name: this.name, driver: settings.fighter, level: levels.current, laps: settings.laps };
  }

  openBox(open) {
    byId('friends-box').hidden = !open;
    byId('friends-toggle').setAttribute('aria-expanded', String(open));
  }

  join(code) {
    saveName(this.name);
    this.room.join(code, this.hello());
    history.replaceState(null, '', `#race=${code}`);
  }

  leave() {
    this.room.leave();
    this.current = null;
    this.go = null;
    history.replaceState(null, '', location.pathname + location.search);
  }

  async copyLink() {
    const link = linkFor(this.room.code);
    try {
      await navigator.clipboard.writeText(link);
      this.status('Link copied. Send it to a friend.');
    } catch {
      this.status(link);
    }
  }

  status(text) {
    byId('friends-status').textContent = text;
  }

  /**
   * After the hand check: with friends, wait on the grid until everyone's ready, or the host starts. go()
   * starts the countdown.
   */
  holdStart(go) {
    if (!this.room.inRoom) {
      this.current = null;
      return false;
    }
    this.go = go;
    this.current = null;
    this.room.tell(this.hello());
    this.room.ready();
    this.changed();
    return true;
  }

  /** The race starts, for those in it, on the host's course. */
  start({ level, laps, racers }) {
    if (!this.go || !racers.includes(this.room.you) || this.session.screen !== 'waiting') return;
    const others = racers.filter((id) => id !== this.room.you);
    const friends = others.map((id) => {
      const member = this.room.members.find((each) => each.id === id) ?? { id, name: '', driver: '' };
      const character = characterWithId(member.driver) ?? ROSTER[0];
      const spec = { ...character, key: `friend-${id}`, name: member.name || character.name, nameKa: member.name || character.nameKa };
      return { id, key: spec.key, spec, slot: racers.indexOf(id) };
    });
    this.current = { level, laps, friends, mySlot: racers.indexOf(this.room.you), racers, cars: new Map() };
    this.results = new Map();
    const { go } = this;
    this.go = null;
    go();
  }

  /** Once the race has been laid out, friends' cars are there to be moved. */
  carsReady(race) {
    if (!this.current) return;
    for (const friend of this.current.friends) this.current.cars.set(friend.id, race.friendCars.get(friend.key));
  }

  sendCar(car, ms) {
    if (this.current && this.room.inRoom) this.room.sendCar(car, ms);
  }

  /** The child has crossed the line. */
  crossed(ms) {
    if (!this.current) return;
    this.results.set(this.room.you, ms);
    this.room.done(ms);
  }

  crossedLine(id, ms) {
    if (!this.current?.racers.includes(id)) return;
    this.results.set(id, ms);
    if (this.session.screen === 'finish') this.showResults();
  }

  /** Who came where, so far, on the finish card. */
  showResults() {
    const { current } = this;
    this.resultsList.hidden = !current;
    document.body.toggleAttribute('data-friends-race', Boolean(current));
    if (!current) {
      if (this.finishTitle) this.finishTitle.textContent = this.finishWords;
      return;
    }
    const nameOf = (id) => {
      if (id === this.room.you) return 'You';
      return current.friends.find((friend) => friend.id === id)?.spec.name ?? 'A friend';
    };
    const finished = [...this.results.entries()].sort((a, b) => a[1] - b[1]);
    const rows = finished.map(([id, ms], index) => `<li class="${id === this.room.you ? 'is-you' : ''}"><span class="friends-place">${ordinal(index + 1)}</span> <span class="friends-who"></span> <span class="friends-time">${time(ms)}</span></li>`);
    const still = current.racers.filter((id) => !this.results.has(id));
    for (const id of still) rows.push('<li class="is-racing"><span class="friends-place">…</span> <span class="friends-who"></span> <span class="friends-time">still racing</span></li>');
    this.resultsList.innerHTML = rows.join('');
    // Names go in as text, never as markup.
    [...finished.map(([id]) => id), ...still].forEach((id, index) => {
      this.resultsList.children[index].querySelector('.friends-who').textContent = nameOf(id);
    });
    const place = finished.findIndex(([id]) => id === this.room.you) + 1;
    if (this.finishTitle) this.finishTitle.textContent = place === 1 ? 'You won the race!' : 'Great racing!';
  }

  /** Who's here, on the title card and the waiting screen, and anyone who's gone mid-race. */
  changed() {
    const { room } = this;
    const inRoom = room.inRoom;
    byId('friends-out').hidden = inRoom;
    byId('friends-in').hidden = !inRoom;
    byId('friends-code-shown').textContent = room.code ?? '';
    if (room.code) byId('friends-code').value = room.code;
    this.status(STATUS[room.status] ?? '');
    this.fillList(byId('friends-here'), false);
    this.fillList(byId('friends-waiting'), true);

    // Waiting on the grid: the session shows that screen as soon as this has said to wait.
    const waiting = Boolean(this.go);
    byId('friends-now').hidden = !room.hosting;
    let words = '';
    if (!inRoom) words = STATUS[room.status] ?? 'You’ve left the race.';
    else if (room.members.length < 2) words = 'Nobody else is here yet. Send them the link.';
    else words = room.hosting ? 'It starts when everyone is ready, or press Start now.' : 'It starts when everyone is ready.';
    byId('friends-wait-status').textContent = waiting ? words : '';

    // A friend who has gone mid-race takes their car with them.
    if (this.current) {
      for (const friend of this.current.friends) {
        if (!room.members.some((member) => member.id === friend.id) && this.game.race.friendCars.has(friend.key)) {
          this.game.friendGone(friend.key);
        }
      }
    }
  }

  fillList(list, withReady) {
    const { room } = this;
    list.replaceChildren(...room.members.map((member) => {
      const row = document.createElement('li');
      const character = characterWithId(member.driver) ?? ROSTER[0];
      const face = document.createElement('img');
      face.alt = '';
      face.src = this.session.portraits?.[character.id] ?? '';
      const name = document.createElement('span');
      name.className = 'friends-who';
      name.textContent = `${member.name || character.name}${member.id === room.you ? ' (you)' : ''}`;
      row.append(face, name);
      if (withReady) {
        const mark = document.createElement('span');
        mark.className = 'friends-mark';
        mark.textContent = member.ready ? 'Ready' : member.racing ? 'Racing' : 'Not ready yet';
        row.classList.toggle('is-ready', member.ready);
        row.append(mark);
      }
      return row;
    }));
  }
}
