// The storyteller in the hand games with a mission: a character's picture, their words on the screen
// and their voice. A game's lines are rendered whole, in that character's voice: see its lines.json.
import { byId } from './body/roster.js';

const byElement = (id) => document.getElementById(id);

export const STORY_BOX = `
  <div id="story" class="story" aria-live="polite">
    <img id="story-face" class="story-face" alt="">
    <div class="story-words">
      <strong id="story-name" class="story-name"></strong>
      <p id="story-line" class="story-line"></p>
    </div>
  </div>`;

export class StoryBox {
  /** session is the running game, with its sound, its language and pictures of the characters. */
  constructor(session) {
    this.session = session;
    this.who = null;
  }

  /** Shows who's speaking and what they say, and says it. */
  say(who, text, { quietly = false } = {}) {
    const { session } = this;
    const character = byId(who);
    if (who !== this.who) {
      this.who = who;
      byElement('story-face').src = session.portraits[who];
      byElement('story').dataset.who = who;
    }
    byElement('story-name').textContent = session.settings.language === 'ka' ? character.nameKa : character.name;
    byElement('story-line').textContent = session.translate(text);
    byElement('story').classList.add('is-visible');
    if (!quietly) session.sound.say(text);
  }

  hide() {
    byElement('story').classList.remove('is-visible');
    this.who = null;
  }
}
