// What playing with friends looks like, in High Five Racers and Sky Wings: a box on the title card for
// making or joining a race or a flight, the screen for waiting at the start, and how everyone did on the
// finish card. Each game gives its own words, and what's sent and shown about each friend. The connection
// itself is in friends.js.
import { byId as characterWithId, ROSTER } from './body/roster.js';
import { validCode } from '../server/race-room.js';
import { codeInLink, FriendsRoom, linkFor, newCode } from './friends.js';

const NAME_KEY = 'camera-games-race-name';
// A friend who has gone for this long has really gone, and their car or plane goes too. Someone who lost the
// connection for a moment is back well before.
const GONE_AFTER_MS = 4000;
const byId = (id) => document.getElementById(id);
export const ordinal = (place) => ['1st', '2nd', '3rd', '4th'][place - 1] ?? `${place}th`;
// To a tenth of a second, as friends often finish within a second of each other: 0:50.3.
export const time = (ms) => {
  const tenths = Math.round(ms / 100);
  const seconds = Math.floor(tenths / 10);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.${tenths % 10}`;
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

const box = (words) => `
  <button id="friends-toggle" class="friends-toggle" type="button" aria-expanded="false" aria-controls="friends-box">${words.toggle}</button>
  <div id="friends-box" class="friends-box" hidden>
    <div id="friends-out" class="friends-out">
      <label class="friends-field">Your name <input id="friends-name" maxlength="16" autocomplete="off" spellcheck="false"></label>
      <button id="friends-make" class="friends-button" type="button">${words.make}</button>
      <form id="friends-join" class="friends-join">
        <label class="friends-field">${words.codeLabel} <input id="friends-code" maxlength="6" autocomplete="off" spellcheck="false" autocapitalize="characters"></label>
        <button class="friends-button" type="submit">Join</button>
      </form>
    </div>
    <div id="friends-in" class="friends-in" hidden>
      <p class="friends-code-line">${words.codeName} <strong id="friends-code-shown"></strong></p>
      <button id="friends-copy" class="friends-button" type="button">Copy the link</button>
      <ul id="friends-here" class="friends-here"></ul>
      <p class="friends-how">${words.how}</p>
      <button id="friends-leave" class="friends-link" type="button">${words.leave}</button>
    </div>
    <p id="friends-status" class="friends-status" role="status"></p>
    <p class="small-print">${words.privacy}</p>
  </div>`;

const waitingCard = (words) => `
  <div class="card title-card">
    <h2>Waiting for your friends</h2>
    <ul id="friends-waiting" class="friends-here"></ul>
    <p id="friends-wait-status" class="friends-status" role="status"></p>
    <button id="friends-now" class="big-button" type="button">Start now</button>
    <button id="friends-alone" class="friends-link" type="button">${words.alone}</button>
  </div>`;

export class FriendsPanel {
  /**
   * game is the server's name for this game's rooms, '' or 'sky-wings', and linkKey the word in a link, as in
   * #race=ABC234. words is what's on the screen: see RACE_WORDS in High Five Racers for each. The game says:
   *   hello()          what friends are told about this player, apart from the name: { driver, level, length }
   *   screen()         which screen it's on, and portraits() the characters' pictures
   *   onGone(friend)   a friend has gone in the middle, and their car or plane with them
   *   resultText(result)   how someone did, from { ms, won, dropped }, for the finish card
   * titles is { first, other }, the finish card's title for coming first or not, or null to leave it be.
   * startAfter, waitingBefore and resultsAfter are where the box, the waiting screen and the results go.
   */
  constructor({ game = '', linkKey = 'race', words, hello, screen, portraits, onGone = () => {}, resultText, titles = null, startAfter, waitingBefore, resultsAfter, finishTitle }) {
    Object.assign(this, { linkKey, words, helloFor: hello, screen, portraits, onGone, resultText, titles });
    this.current = null; // The race or flight with friends being played, once it has started: see start().
    this.results = new Map(); // id: { ms, won, dropped }, how each friend did.
    this.go = null;
    this.room = new FriendsRoom(game, {
      onChange: () => this.changed(),
      onGo: (message) => this.start(message),
      onMove: (id, message) => this.current?.tracks.get(id)?.push(message, performance.now()),
      onDone: (id, message) => this.heardDone(id, message),
    });

    const friends = document.createElement('div');
    friends.className = 'friends';
    friends.innerHTML = box(words);
    startAfter.after(friends);
    const waiting = document.createElement('section');
    waiting.id = 'screen-friends';
    waiting.className = 'screen friends-screen';
    waiting.innerHTML = waitingCard(words);
    waitingBefore.before(waiting);
    this.resultsList = document.createElement('ol');
    this.resultsList.className = 'friends-results';
    this.resultsList.hidden = true;
    resultsAfter?.after(this.resultsList);
    this.finishTitle = finishTitle;
    this.finishWords = finishTitle?.textContent ?? '';

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
      else this.status(words.badCode);
    });
    byId('friends-copy').addEventListener('click', () => this.copyLink());
    byId('friends-leave').addEventListener('click', () => this.leave());
    byId('friends-now').addEventListener('click', () => this.room.go());
    byId('friends-alone').addEventListener('click', () => {
      const { go } = this;
      this.leave();
      go?.();
    });

    // A link from a friend goes straight in.
    const code = codeInLink(location.hash, linkKey);
    if (code) {
      this.openBox(true);
      this.join(code);
    }
  }

  get name() {
    return byId('friends-name').value.replace(/\s+/g, ' ').trim().slice(0, 16);
  }

  /** What friends are told about this player, and the course it would be on if they host it. */
  hello() {
    return { name: this.name, ...this.helloFor() };
  }

  openBox(open) {
    byId('friends-box').hidden = !open;
    byId('friends-toggle').setAttribute('aria-expanded', String(open));
  }

  join(code) {
    saveName(this.name);
    this.room.join(code, this.hello());
    history.replaceState(null, '', `#${this.linkKey}=${code}`);
  }

  leave() {
    this.room.leave();
    clearTimeout(this.goneTimer);
    this.current = null;
    this.go = null;
    history.replaceState(null, '', location.pathname + location.search);
  }

  async copyLink() {
    const link = linkFor(this.room.code, this.linkKey);
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
   * Ready to start: with friends, wait until everyone's ready, or the host starts. go() starts the
   * countdown. False without friends, to start at once as usual.
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

  /**
   * It starts, for those in it, on the host's course. Each friend is { id, key, spec, slot }, spec being the
   * character they chose with their own name, and slot their place in the order everyone has.
   */
  start({ level, laps, length, racers }) {
    if (!this.go || !racers.includes(this.room.you) || this.screen() !== 'waiting') return;
    const others = racers.filter((id) => id !== this.room.you);
    const friends = others.map((id) => {
      const member = this.room.members.find((each) => each.id === id) ?? { id, name: '', driver: '' };
      const character = characterWithId(member.driver) ?? ROSTER[0];
      const spec = { ...character, key: `friend-${id}`, name: member.name || character.name, nameKa: member.name || character.nameKa };
      return { id, key: spec.key, spec, slot: racers.indexOf(id) };
    });
    const size = length ?? laps;
    this.current = { level, length: size, laps: size, friends, mySlot: racers.indexOf(this.room.you), racers, tracks: new Map() };
    this.results = new Map();
    this.room.racing = true;
    const { go } = this;
    this.go = null;
    go();
  }

  /** Where this friend is comes in to this track: see Track in friends.js. */
  follow(id, track) {
    this.current?.tracks.set(id, track);
  }

  /** Where the child's car or plane is, as kind car or plane. */
  sendMove(kind, state, ms) {
    if (this.current && this.room.inRoom) this.room.sendMove(kind, state, ms);
  }

  /** The child has finished, this long after "GO!". extra is { w: 1 if they won, n: how many they dropped }. */
  finished(ms, extra = {}) {
    if (!this.current) return;
    this.results.set(this.room.you, { ms, won: extra.w !== 0, dropped: extra.n ?? 0 });
    this.room.done(ms, extra);
  }

  heardDone(id, { ms, w, n }) {
    if (!this.current?.racers.includes(id)) return;
    this.results.set(id, { ms, won: w !== 0, dropped: n ?? 0 });
    if (this.screen() === 'finish') this.showResults();
  }

  /** How everyone did so far, on the finish card: those who won by time, then the rest by how many they dropped. */
  showResults() {
    const { current } = this;
    this.resultsList.hidden = !current;
    document.body.toggleAttribute('data-friends-race', Boolean(current));
    if (!current) {
      if (this.finishTitle && this.titles) this.finishTitle.textContent = this.finishWords;
      return;
    }
    const nameOf = (id) => {
      if (id === this.room.you) return 'You';
      return current.friends.find((friend) => friend.id === id)?.spec.name ?? 'A friend';
    };
    const finished = [...this.results.entries()].sort(([, a], [, b]) => Number(b.won) - Number(a.won) || (a.won ? a.ms - b.ms : b.dropped - a.dropped || a.ms - b.ms));
    const rows = finished.map(([id], index) => `<li class="${id === this.room.you ? 'is-you' : ''}"><span class="friends-place">${ordinal(index + 1)}</span> <span class="friends-who"></span> <span class="friends-time"></span></li>`);
    // Anyone who has gone before finishing is left off.
    const gone = (id) => current.friends.some((friend) => friend.id === id && friend.gone);
    const still = current.racers.filter((id) => !this.results.has(id) && !gone(id));
    for (const id of still) rows.push(`<li class="is-racing"><span class="friends-place">…</span> <span class="friends-who"></span> <span class="friends-time">${this.words.still}</span></li>`);
    this.resultsList.innerHTML = rows.join('');
    // Names go in as text, never as markup.
    [...finished.map(([id]) => id), ...still].forEach((id, index) => {
      const row = this.resultsList.children[index];
      row.querySelector('.friends-who').textContent = nameOf(id);
      if (this.results.has(id)) row.querySelector('.friends-time').textContent = this.resultText(this.results.get(id));
    });
    const place = finished.findIndex(([id]) => id === this.room.you) + 1;
    if (this.finishTitle && this.titles) this.finishTitle.textContent = place === 1 ? this.titles.first : this.titles.other;
  }

  /** Who's here, on the title card and the waiting screen, and anyone who's gone in the middle. */
  changed() {
    const { room, words } = this;
    const inRoom = room.inRoom;
    byId('friends-out').hidden = inRoom;
    byId('friends-in').hidden = !inRoom;
    byId('friends-code-shown').textContent = room.code ?? '';
    if (room.code) byId('friends-code').value = room.code;
    this.status({ connecting: 'Connecting…', full: words.full, lost: words.lost }[room.status] ?? '');
    this.fillList(byId('friends-here'), false);
    this.fillList(byId('friends-waiting'), true);

    // Waiting at the start: the game shows that screen as soon as this has said to wait.
    const waiting = Boolean(this.go);
    byId('friends-now').hidden = !room.hosting;
    let text = '';
    if (!inRoom) text = { connecting: 'Connecting…', full: words.full, lost: words.lost }[room.status] ?? words.left;
    else if (room.members.length < 2) text = 'Nobody else is here yet. Send them the link.';
    else text = room.hosting ? 'It starts when everyone is ready, or press Start now.' : 'It starts when everyone is ready.';
    byId('friends-wait-status').textContent = waiting ? text : '';

    if (this.current) this.watchForGone();
  }

  /**
   * A friend who has gone in the middle takes their car or plane with them, unless they're back within a few
   * seconds, as they are after losing the connection for a moment.
   */
  watchForGone() {
    const now = performance.now();
    for (const friend of this.current.friends) {
      if (friend.gone) continue;
      if (this.room.members.some((member) => member.id === friend.id)) friend.missingSince = null;
      else friend.missingSince ??= now;
    }
    clearTimeout(this.goneTimer);
    if (this.current.friends.some((friend) => !friend.gone && friend.missingSince != null)) {
      this.goneTimer = setTimeout(() => this.dropGone(), GONE_AFTER_MS);
    }
  }

  dropGone() {
    if (!this.current) return;
    const now = performance.now();
    let dropped = false;
    for (const friend of this.current.friends) {
      if (friend.gone || friend.missingSince == null || now - friend.missingSince < GONE_AFTER_MS - 50) continue;
      friend.gone = true;
      this.onGone(friend);
      dropped = true;
    }
    if (dropped && this.screen() === 'finish') this.showResults();
    this.watchForGone();
  }

  fillList(list, withReady) {
    const { room } = this;
    const portraits = this.portraits() ?? {};
    list.replaceChildren(...room.members.map((member) => {
      const row = document.createElement('li');
      const character = characterWithId(member.driver) ?? ROSTER[0];
      const face = document.createElement('img');
      face.alt = '';
      face.src = portraits[character.id] ?? '';
      const name = document.createElement('span');
      name.className = 'friends-who';
      name.textContent = `${member.name || character.name}${member.id === room.you ? ' (you)' : ''}`;
      row.append(face, name);
      if (withReady) {
        const mark = document.createElement('span');
        mark.className = 'friends-mark';
        mark.textContent = member.ready ? 'Ready' : member.racing ? this.words.busy : 'Not ready yet';
        row.classList.toggle('is-ready', member.ready);
        row.append(mark);
      }
      return row;
    }));
  }
}
