// Each game's card plays a film of the game being played, over its picture, while the card is on the screen,
// so how each game works can be seen at a glance, with just its name below. Pointing at a card, or choosing it
// with the keyboard, shows what the game is about, along the bottom of the film. For anyone who prefers reduced
// motion, a film only plays, a little slower, while its card is pointed at or chosen. demos/ holds the films,
// which tools/record_demos.mjs makes.
//
// Above the cards, a search finds games, and its filters find them by kind. A card the search hides stops its
// film, and doesn't fetch one, until it comes back.
const SLOWER = 0.7;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rate = () => (still ? SLOWER : 1);

function filmFor(card) {
  const art = card.querySelector('.game-art');
  const film = document.createElement('video');
  film.className = 'game-film';
  film.muted = true;
  film.playsInline = true;
  film.preload = 'none';
  film.setAttribute('aria-hidden', 'true');
  art.append(film);
  // What the game is about goes over the bottom of the film, where it only shows while the card is pointed at.
  const about = card.querySelector(':scope > p');
  if (about) {
    about.classList.add('game-about');
    art.append(about);
  }

  const play = () => {
    if (card.hidden) return;
    // Only fetched once its card is first on the screen.
    if (!film.src) film.src = `demos/${card.dataset.game}.webm`;
    film.playbackRate = rate();
    // A browser can refuse to play for now, and that only means the picture stays.
    film.play().catch(() => {});
  };
  // The picture shows until the film has something to show, and then the film fades in over it.
  film.addEventListener('playing', () => card.classList.add('is-playing'));
  // The local server can't jump to a place in a file, so a film goes round by starting again.
  film.addEventListener('ended', () => {
    film.load();
    play();
  });
  // A hidden card's film stops, and stops loading too if it was still on its way, so that it starts again from
  // the picture when the card comes back.
  const stop = () => {
    film.pause();
    if (film.networkState === film.NETWORK_LOADING) {
      film.removeAttribute('src');
      film.load();
      card.classList.remove('is-playing');
    }
  };
  return { film, play, pause: () => film.pause(), stop };
}

const cards = [...document.querySelectorAll('.game-card')].map((card) => ({ card, ...filmFor(card) }));
const byCard = new Map(cards.map((each) => [each.card, each]));

// Playing only while on the screen keeps the page light, with a dozen films on it.
const watcher = still ? null : new IntersectionObserver((entries) => {
  for (const { target, isIntersecting } of entries) {
    const each = byCard.get(target);
    if (isIntersecting) each.play();
    else each.pause();
  }
}, { threshold: 0.25 });

/** Shows or hides a card. One shown again is looked at afresh, to play if it's on the screen. */
function showCard(each, shown) {
  if (each.card.hidden === !shown) return;
  each.card.hidden = !shown;
  if (!shown) each.stop();
  else if (watcher) {
    watcher.unobserve(each.card);
    watcher.observe(each.card);
  }
}

// ---------- the search, and its filters ----------
// Typing finds a game by its name, what it's about, the filters it's under and their words, and its own
// data-words. Each word typed has to be the start of one of those, ignoring capitals, accents and apostrophes.
// In "Kind of game" and "Played with", a game needs only one of the filters chosen, and it needs every one in
// "Can be played". The search and filters go in the address, so going back to this page brings them back, while
// "All games" in a game shows all the games.
const box = document.getElementById('hub-search');
const toggle = document.getElementById('hub-filters-toggle');
const panel = document.getElementById('hub-filters');
const chosenCount = document.getElementById('hub-filters-count');
const clearFilters = document.getElementById('hub-filters-clear');
const found = document.getElementById('hub-found');
const foundLine = found.parentElement;
const none = document.getElementById('hub-none');
const [showAllHere] = document.querySelectorAll('.hub-found-line .hub-show-all');
const groups = [...panel.querySelectorAll('fieldset')].map((set) => ({
  any: set.hasAttribute('data-any'),
  checks: [...set.querySelectorAll('input[type="checkbox"]')],
}));
const checks = groups.flatMap((group) => group.checks);

/** Lower case, without accents or apostrophes, and anything that isn't a letter or a digit as a space. */
const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/['’‘`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The words typed. One ending in s also finds the word without it, so "balls" finds a ball. */
const wordsTyped = (text) => fold(text).split(' ').filter(Boolean)
  .map((word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word));

const wordsOf = new Map(checks.map((check) => [check.value, `${check.labels[0].textContent} ${check.dataset.words ?? ''}`]));
const games = cards.map((each) => {
  const { card } = each;
  const tags = new Set((card.dataset.tags ?? '').split(/\s+/).filter(Boolean));
  // The friends badge, which says so on the card, is what puts a game under "With friends".
  if (card.querySelector('.game-friends')) tags.add('friends');
  const text = [card.querySelector('h2')?.textContent, card.querySelector('p')?.textContent, card.dataset.words,
    ...[...tags].map((tag) => wordsOf.get(tag))].join(' ');
  return { ...each, tags, words: ` ${fold(text)}` };
});

function update() {
  const typed = wordsTyped(box.value);
  const chosen = groups.map(({ any, checks: inGroup }) => ({ any, tags: inGroup.filter((check) => check.checked).map((check) => check.value) }))
    .filter(({ tags }) => tags.length > 0);
  let shown = 0;
  for (const game of games) {
    const fits = typed.every((word) => game.words.includes(` ${word}`))
      && chosen.every(({ any, tags }) => (any ? tags.some((tag) => game.tags.has(tag)) : tags.every((tag) => game.tags.has(tag))));
    showCard(game, fits);
    if (fits) shown += 1;
  }
  const filters = chosen.reduce((sum, { tags }) => sum + tags.length, 0);
  const narrowed = typed.length > 0 || filters > 0;
  const saying = !narrowed ? 'All games' : shown > 0 ? `${shown} of ${games.length} games` : 'No games match';
  // Only when it changes, so a screen reader doesn't say it again.
  if (found.textContent !== saying) found.textContent = saying;
  // It's only shown once some games are left out. With nothing to show, the box saying so takes over, and either
  // way this still says it to a screen reader.
  const quiet = !narrowed || shown === 0;
  found.classList.toggle('visually-hidden', quiet);
  foundLine.classList.toggle('is-quiet', quiet);
  none.hidden = shown > 0;
  showAllHere.hidden = !narrowed || shown === 0;
  chosenCount.textContent = filters;
  chosenCount.parentElement.hidden = filters === 0;
  clearFilters.hidden = filters === 0;
}

function remember() {
  const query = new URLSearchParams();
  const text = box.value.trim();
  if (text) query.set('search', text);
  for (const check of checks) if (check.checked) query.append('filter', check.value);
  const search = query.toString();
  // A browser can refuse to change the address, and then it's only not remembered.
  try {
    history.replaceState(history.state, '', `${search ? `?${search}` : location.pathname}${location.hash}`);
  } catch {}
}

const changed = () => {
  update();
  remember();
};

// What the address says, before any film starts.
const asked = new URLSearchParams(location.search);
box.value = asked.get('search') ?? '';
const askedFilters = new Set(asked.getAll('filter'));
for (const check of checks) check.checked = askedFilters.has(check.value);
update();

// A moment after the last letter typed, so a quick word changes the cards once rather than with every letter.
let typing = 0;
box.addEventListener('input', () => {
  clearTimeout(typing);
  typing = setTimeout(changed, 150);
});
box.form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearTimeout(typing);
  changed();
  // On a phone, the keyboard goes, to show what was found.
  if (matchMedia('(pointer: coarse)').matches) box.blur();
});
panel.addEventListener('change', changed);

const setOpen = (open) => {
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
};
toggle.addEventListener('click', () => setOpen(panel.hidden));
document.getElementById('hub-filters-done').addEventListener('click', () => {
  setOpen(false);
  toggle.focus();
});
box.form.addEventListener('keydown', (event) => {
  // Escape in the search box empties it, and anywhere else here closes the filters.
  if (event.key === 'Escape' && event.target !== box && !panel.hidden) {
    setOpen(false);
    toggle.focus();
  }
  // Enter chooses a filter, as well as the space bar.
  if (event.key === 'Enter' && event.target.type === 'checkbox') {
    event.preventDefault();
    event.target.click();
  }
});

// A button pressed from the keyboard (detail 0) hands the keyboard on, as the button itself goes.
clearFilters.addEventListener('click', (event) => {
  for (const check of checks) check.checked = false;
  changed();
  if (event.detail === 0) checks[0].focus();
});
for (const button of document.querySelectorAll('.hub-show-all')) {
  button.addEventListener('click', (event) => {
    clearTimeout(typing);
    box.value = '';
    for (const check of checks) check.checked = false;
    changed();
    if (event.detail === 0) box.focus();
  });
}

// ---------- the films ----------
if (still) {
  for (const { card, play, pause } of cards) {
    card.addEventListener('pointerenter', play);
    card.addEventListener('pointerleave', pause);
    card.addEventListener('focus', play);
    card.addEventListener('blur', pause);
  }
} else {
  for (const { card } of cards) watcher.observe(card);
}
