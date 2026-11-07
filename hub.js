// While the pointer rests on a game, or the keyboard is on it, a film shows it being played and says
// what moves it takes. demos/ holds the films, which tools/record_demos.mjs makes.
const WAIT_MS = 200; // A pointer on its way across the page shouldn't set off every film it passes.
const EDGE = 12;
const SLOWER = 0.7; // For anyone who prefers reduced motion. The film is still the instruction.

const panel = document.getElementById('game-demo');
const film = document.getElementById('game-demo-film');
const moves = document.getElementById('game-demo-moves');
let waiting = null;
let shownCard = null;

const rate = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? SLOWER : 1);
const clamp = (value, low, high) => Math.min(Math.max(low, high), Math.max(low, value));

/** Over its card, a little above it where there's room, and always all of it on the screen. */
function place(card) {
  const box = card.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = panel;
  panel.style.left = `${clamp(box.left + box.width / 2 - width / 2, EDGE, innerWidth - width - EDGE)}px`;
  panel.style.top = `${clamp(box.top + box.height / 2 - height / 2, EDGE, innerHeight - height - EDGE)}px`;
}

function show(card) {
  shownCard = card;
  film.src = `demos/${card.dataset.game}.webm`;
  film.playbackRate = rate();
  moves.textContent = card.dataset.moves;
  panel.classList.add('is-showing');
  panel.dataset.game = card.dataset.game;
  place(card);
  // A browser can refuse to play for now, and that only means no film.
  film.play().catch(() => {});
}

function hide(card) {
  clearTimeout(waiting);
  if (shownCard !== card) return;
  shownCard = null;
  panel.classList.remove('is-showing');
  film.pause();
}

for (const card of document.querySelectorAll('.game-card')) {
  const showSoon = () => {
    clearTimeout(waiting);
    waiting = setTimeout(() => show(card), WAIT_MS);
  };
  const hideNow = () => hide(card);
  card.addEventListener('pointerenter', showSoon);
  card.addEventListener('pointerleave', hideNow);
  card.addEventListener('focus', showSoon);
  card.addEventListener('blur', hideNow);
}

// The server can't jump to a place in a file, so a film goes round by starting again.
film.addEventListener('ended', () => {
  film.load();
  film.playbackRate = rate();
  film.play().catch(() => {});
});

// The card has moved away from under it.
addEventListener('scroll', () => shownCard && hide(shownCard), { passive: true });
