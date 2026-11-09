// Each game's card plays a film of the game being played, over its picture, while the card is on the screen,
// so how each game works can be seen at a glance. Resting the pointer on a card, or the keyboard, also says
// what moves it takes. For anyone who prefers reduced motion, a film only plays, a little slower, while its
// card is pointed at or chosen. demos/ holds the films, which tools/record_demos.mjs makes.
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
  const moves = document.createElement('p');
  moves.className = 'game-moves';
  moves.textContent = card.dataset.moves;
  art.append(moves);

  const play = () => {
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
  return { film, play, pause: () => film.pause() };
}

const cards = [...document.querySelectorAll('.game-card')].map((card) => ({ card, ...filmFor(card) }));

if (still) {
  for (const { card, play, pause } of cards) {
    card.addEventListener('pointerenter', play);
    card.addEventListener('pointerleave', pause);
    card.addEventListener('focus', play);
    card.addEventListener('blur', pause);
  }
} else {
  // Playing only while on the screen keeps the page light, with a dozen films on it.
  const byCard = new Map(cards.map((each) => [each.card, each]));
  const watcher = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      const each = byCard.get(target);
      if (isIntersecting) each.play();
      else each.pause();
    }
  }, { threshold: 0.25 });
  for (const { card } of cards) watcher.observe(card);
}
