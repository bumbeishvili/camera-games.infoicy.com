# Camera Games

Camera games for children with hemiplegia, played by moving in front of a webcam. Opening the hand is what they practise. The right hand is the default, and the left can be chosen instead under the gear icon.

- **High Five Racers:** the car only drives while the hand is open. Nobody can crash or lose: if the hand closes, the car coasts to a stop and waits.
- **Balloon Pop:** balloons float up and drift around, and the open hand pops them. A closed hand just bumps them. Missing a balloon costs nothing. A grown-up can turn on a maths challenge, where the wrong answer burns the glove.
- **Mighty Moves:** a fighting game against the computer, played with the whole body. The coach shows concrete moves to do, like a clap, a squat, a jump or a hand circle, and only those can win. Ordinary punches and kicks are small hits. See [below](#mighty-moves).
- **Leap Trail:** a fast run down a country path in 3D, grabbing lines of stars, jumping over what's in the way and squatting under what's too low, with the child's real body. See [below](#leap-trail).
- **Sky Wings:** a dogfight over a 3D island, with both arms as wings. Tipping them banks and turns the plane, and raising or lowering them flies it up and down. Sky pirates hunt the child and the child hunts them: the guns fire by themselves at any plane inside the ring, until they've all been dropped.
- **Joze's Long Walk Home:** Joze the giraffe is lost and hungry. The child closes a hand on fruit, carries it across to his mouth and opens the hand to feed him, and each stop fed takes him closer to his family.
- **Joze's Smoothie Stand:** at the Harvest Fair, each customer orders a smoothie, and the child slices what they ordered with a swipe of the open hand. Bad fruit makes the glove sticky until it has been held open.
- **The Lighthouse Keeper:** mud from a storm has covered the windows and ships are lost at sea. Wiping a window clean with an open hand lets the light out, and brings a ship home.

Every game's grown-ups' panel, under the gear icon, has a way back to all the games. On the page for choosing a game, resting the pointer on one plays a film of it, and says which moves it takes.

## Run it

You need Google Chrome, Python 3 and a webcam. Chrome is the only browser these games target. Nothing else to install.

```
cd camera-games.infoicy.com
npm start
```

Then open <http://localhost:8642> in Chrome and choose a game. Chrome only allows the camera on `localhost` or HTTPS, so opening `index.html` directly won't work.

## How the folder is organised

```
index.html, hub.css, hub.js    the page for choosing a game
demos/                  the films of each game on that page, made with tools/record_demos.mjs
core/                   what every game shares
  hands.js              decides whether a hand is open
  session.js            runs a game: title, hand check, countdown, play, finish
  shell.js, hud.js      the shared screens, hand meters, prompts and grown-ups' panel
  sound.js, audio/      voice lines and shared sound effects
  camera.js, tracker.worker.js    the webcam and hand tracking
  settings.js, base.css
  glove.js              the glove that copies a hand, finger by finger
  story.js, fruit.js    who's speaking, and the fruit, in the games with a mission
  body/                 what the whole-body games share
    reader.js           turns a tracked body into moves
    game.js, shell.js   camera, body check, choosing a character, panel, shared screens
    demo.js, demos.js   the character showing a move in a looping film
    easing.js           what counts coming down for a child who's trying
    characters.js, roster.js    the ten characters
    pose.worker.js      whole-body tracking, and reading hands from close-ups
    voice/              lines they share, and each character's own
games/
  high-five-racers/     its 3D world, its engine sound, its own settings
  balloon-pop/          its balloons, gloves, maths questions and sounds
  mighty-moves/         its coach, fight rules, moves, stage and sounds
  leap-trail/           its run rules, practice, 3D trail and sounds
  sky-wings/            its flight rules, lesson, island, 3D sky and sounds
  joze-walk/            its journey, the land Joze walks through and its sounds
  smoothie-stand/       its customers and orders, the fair and its sounds
  lighthouse/           its storm and ships, the lamp room and its sounds
tools/                  the local server, and what prepares voices and sounds
vendor/                 libraries, the tracking model and fonts
test/                   unit tests, and Playwright tests for the hub and each game
```

**To add a game,** make a folder in `games/` with an `index.html` (copy one) and a `main.js`. That file gives `GameSession` the game's words and settings, plus an object with a few methods: `prepare`, `begin`, `update`, `idle`, `render`, `prompt` and `summary`. They're described at the top of [core/session.js](core/session.js), and [games/balloon-pop/main.js](games/balloon-pop/main.js) is a short example. Then add a card to the root `index.html`. Hand tracking, the hand check, voice, pausing and the panel all come with it.

**To add a whole-body game,** extend `BodyGame` in [core/body/game.js](core/body/game.js), whose top lists what a game has to fill in, and call `mountBodyShell` for the screens. [games/leap-trail/main.js](games/leap-trail/main.js) is an example. The camera, the check that it can see the child, the ten characters and the panel all come with it.

## How "open" is decided

All of this is in [core/hands.js](core/hands.js).

Each finger scores 0 (curled) to 1 (straight) from two measurements that must agree: how much it bends along its length, and how far its tip reaches from the wrist. The thumb scores on how far its tip is from the palm. Overall openness then weighs the weakest finger as much as the average, and gives the thumb a full third, so one curled finger or a thumb tucked into the palm costs a lot.

What the real model scored on real photos:

| Pose | Openness |
|---|---|
| Fist | 0.00 |
| Pointing | 0.08 |
| Peace sign | 0.17 |
| Thumbs up | 0.23 |
| Loosely open, curved fingers | 0.55–0.73 |
| Wide open | 0.91–1.00 |

**The hand sets its own line.** The hand check at the start measures its best opening, and by default it must reach 80% of that. An affected hand that can't open fully can still play, and the grown-ups' panel can move the line.

**A fist can never pass.** However low the settings go, the line never drops below 0.35. Across rotation, dim light and blur, a fist's score stayed below 0.2. A hand that can't reach 0.35 can't play, which with a tucked thumb means fingers about half straight. To change that for a child who needs it, edit `floor` in `OPEN_RULES`.

**Anything uncertain counts as not open:** a hand out of view, cut off by the edge of the picture, too far away, overlapped by the other hand (so one hand can't hold the other open), or a stalled tracker.

The numbers worth tuning with a therapist are `OPEN_RULES` at the top of `hands.js`.

## Choosing the hand

Choose **Hand to play with** under the gear icon. It's remembered across the games. The other hand is ignored, so it can rest, close or leave the picture. It still can't overlap the hand in play, so one hand can't hold the other open. In High Five Racers, moving the hand side to side steers, measured from where it started in the hand check.

**How it tells left from right.** It uses the tracker's own left or right label, because the hand could be anywhere in the picture. The label swapped correctly on every mirrored photo, at angles up to 60° and including fists, with confidence never below 0.88. It also named both hands correctly in a photo with crossed arms. When the tracker is less than 70% sure, the hand's side of the mirror decides instead, so a child doesn't get stuck being asked for a hand they're showing. If the tracker is sure it's seeing the other hand, that hand doesn't count, and the panel says "Only sees the other hand".

## Choices made for these children

- **The hand check never asks for a fist,** since making one is the opposite of what's being practised.
- **Nothing flashes.** Seizures are more common in children with hemiplegia, so there are no strobes or full-screen effects. Road markings are long and low contrast, and a pop is a small burst of colour.
- **Prompts are spoken and point at the hand,** for children who can't read yet or are unsure of left and right. Each is said twice at most, and only when nothing else is being said.
- **Racing:** steering is measured from where the hand starts, so it works wherever an affected arm is comfortable. The car can also steer itself, so a child can work on opening alone. After 15 seconds with the hand closed, the game says resting is fine.
- **Balloons:** only an open hand pops, so a child can't score with a fist. The hand can rest freely between balloons, and is only asked to open when it bumps one.
- **Balloons also help with reach:** the camera's central area fills the whole screen, so less arm movement covers more of it. Under **Reach help**, balloons drift towards a nearby open hand. Balloon speed and how many to pop can be set too.
- **Lots to do, and little to listen to.** No game stops for talking. Characters and the coach say one short thing, praise is only now and then, and there's plenty on the screen at once. The hand check takes two seconds, and the countdown about two more.
- **Little films show what to do,** rather than leaving it to words: a hand opening during the hand check, a hand going from side to side to steer, and an open hand popping a balloon.

### The maths challenge in Balloon Pop

It's off unless a grown-up chooses it under **Maths challenge**: adding up to 10, adding and taking away up to 20, or times tables. A question is shown big on the screen, the voice says "Pop the right answer!", and balloons with answers on them come up and wait, for as long as it takes. A child reaching for one answer may have to pass another, so an open hand has to stay on a balloon for about half a second to choose it, with a ring closing around it to show that's happening.

The right answer pops, and the next question comes. The wrong one goes up in smoke and burns the glove: it turns black with soot and can't pop anything until the hand has been held open to cool it, which takes about a second and a half of being open, and a fist doesn't cool it. That makes the penalty the exercise itself. No right answers are taken away. The burn is cartoon soot, and nothing flashes. The summary counts the too-hot balloons as well as the right ones.

## Mighty Moves

The coach calls one concrete move at a time, and the child's own character shows it in a looping film beside the fight, as a word or a still picture is hard to copy. Doing that move makes a big fighting move, and those are what win a round. Before a fight, the game checks it can see all of the child, from about 2 to 3 metres away, and says what to do if it can't. If they step out of the picture, everything waits.

**What the coach asks for, in this order** ([games/mighty-moves/moves.js](games/mighty-moves/moves.js)):

| The child | The fighter |
|---|---|
| **Claps** | **Thunder Clap** |
| **Squats** | **Earthquake Stomp** |
| **Jumps** | **Flying Smash** |
| **Rotates a hand in a big circle** | **Whirlwind** |
| **Lifts a knee** | **Knee Strike** |
| **Pushes an open hand forward** | **Palm Strike** |
| **Reaches for the sky** and holds it | **Sky Charge**, which powers up the next move |
| **Star jumps** (or steps out with arms up) | **Star Burst** |
| **Kicks** | **Power Kick** |
| **Touches toes** | **Ground Sweep** |
| **High knees**, three quick lifts of alternate legs | **Turbo Rush** |

The moves on one side say which side, and that's the one that counts: two of every three are on the side being worked on. A bar under the film fills as the body gets close to what's asked for. When a move is seen, the child is told so in words, with a chime and a green frame around their camera picture.

**Ordinary fighting moves are small hits.** A real punch, push, swing or kick that wasn't asked for still makes the fighter do it, with a small hit of 2 out of 100. There's a rest between them, and they can only ever take 25 in a round, so after that the opponent just blocks them and the coach says again what's wanted. The only way to win a round is the moves the coach asks for. The fighter stands ready between moves rather than copying the child, so nothing happens by accident.

**The computer hits hard,** at about six times a small hit or more. Every so often it's the computer's turn: it warns, the coach shows how to get out of the way, by raising the hands to block or leaning, and doing that stops the hit completely.

Saying the moves in this order makes two combos come up by themselves, a squat then a jump for **Rocket Leap**, and a sky reach then a star jump for **Power Stars**. A full power bar turns the next big move into the fighter's own finishing move.

**The open-hand rule carries over.** Hands are too small to read in a picture of a whole body, so the game takes a close-up of one hand with each frame, from the camera's full-size picture. Hands stayed readable on photos shrunk to the size they'd be at this distance, down to about 40 pixels tall even when blurred: open hands scored 0.53 or more, a fist 0.15 or less, and the other closed poses 0.31 or less. A push made with a fist doesn't count as the push: it's a small hit, and the child is asked to open their hand. A push with the hand seen open does 40% more, and a hand that can't be read gets the plain push. The summary says how many arm moves it could read and how many of those were open.

**For children with hemiplegia:**

- **A slow push counts.** Only what's asked for counts, so a careful move doesn't have to be quick to stand out.
- **What counts comes down for a child who's trying,** on squats, jumps and leg lifts, never so far that a child standing still would count.
- **Nobody gets stuck.** After 14 seconds of moving without getting a move, the coach says "Let's try another one" and doesn't ask for it again that fight.
- **How big a movement has to be** can be set, because a small movement may be a big effort. *Small* is the default, and there one arm is enough for the moves that otherwise take two.
- **Side to work on** uses the same hand choice as the other games, and moves on that side do 20% more. The summary counts each side separately.
- **Jumps can be turned off,** so the coach never asks for them when balance makes them unsafe.
- **Resting is always fine.** A child standing still is never hit. The coach waits, and the computer waves until they carry on.
- **On *Gentle*, the default,** the computer gives four seconds' warning and can't knock a child out.
- **Nothing flashes.** Measured through big hits, brightness changed by less than 2% from one frame to the next. Fighters get dizzy rather than hurt.

**The fighters** are ten original characters in [core/body/roster.js](core/body/roster.js), each with their own voice and finishing move, built from simple shapes in [characters.js](core/body/characters.js). All ten share one skeleton, so any move works on any of them. To add one, add an entry to the roster with its colours and a `dress` function, and its lines to [core/body/voice/lines.json](core/body/voice/lines.json) and [the game's own](games/mighty-moves/audio/voice/lines.json). To add a film of a move, add it to [core/body/demos.js](core/body/demos.js).

**Playing over a network** isn't built yet, but it's been kept in mind. The rules in [fight.js](games/mighty-moves/fight.js) have no screen or camera in them, and a fighter is only driven through `perform()`, `setGuard()` and `setDodge()`. [coach.js](games/mighty-moves/coach.js) makes those calls for both sides today, so another player's moves can arrive over a connection in the computer's place. Only moves would need sending, never camera pictures.

## Leap Trail

The character runs fast down the trail by itself, through a village, past fences and poles that rush by, and over lines of stars it picks up just by running through them. The child's real jumps and squats get it past what's in the way, and a move as soon as it's asked for sends it over in a dash. All the time a child gets is set in seconds, so the running being fast doesn't ask them to move any sooner. Stars hang along the way a jump or a slide will go. Each game uses the same ten characters, and the trail, its obstacles and the rules are all original to this game.

**A short practice comes first,** so a child knows what the game can see. Their character shows each move in a looping film, the runner copies their body beside it, and a meter shows how far they are between a squat and a jump. As soon as a move is seen it's confirmed in words, with a chime and a green frame. If they're trying but not reaching what counts, what counts comes down to just below their best, though never as low as someone standing still. It can be skipped, and isn't repeated on the next run. There's no keyboard control: only the body moves the runner.

**Nobody fails.** A painted stretch of path before each obstacle shows where a move will count, and a move anywhere on it clears the obstacle, because the jump lasts as long as it takes. The camera adds a moment of delay to everything, so this matters. The film, a big word and the voice all say what's wanted when it comes up, and the wrong move gets told what's wanted instead. If a move is missed, the obstacle is knocked aside and the run carries on, costing only the streak. A grown-up can have the runner stop and wait for the move instead, for as long as it takes.

**For children with hemiplegia:**

- **Jumping isn't the only way.** Under **How to get over things**, a grown-up can choose lifting a knee, for a child who can stand but not jump, or raising an open hand. Raising a hand can be done sitting down, as the camera then only needs the top half of the child, and there are no squats. It's also the open-hand exercise: a raised fist is asked to open and doesn't count, and neither does a hand that can't be read.
- **An affected leg doesn't stop a jump counting.** It goes by the hips rising and the higher foot, so a lopsided jump is still a jump.
- **Squats can be turned off,** leaving only obstacles to jump.
- **How big a movement has to be** is the same setting as in Mighty Moves. On *Small*, a bob up and down can count as a jump.
- **The panel says what the camera is seeing,** and what it needs right now, to help tell why a move is being missed.
- **Resting is always fine.** After 9 seconds without moving, the runner stops and waits, even when set to stumble.
- **Speed** and **length of the trail** can be set. Even *Fast* is forgiving.
- **A missed move is only a stumble,** so that the run keeps its pace. For a child who needs longer, **When a move is missed** can make the runner stop and wait for as long as it takes.
- **Nothing flashes.** Measured through jumps and landings, brightness changed by less than 1% from one frame to the next.

## Sky Wings

The child's two arms are the wings of a toy plane, sitting or standing, and it's real flying in all three directions. Tipping the arms banks the plane, which turns it, and raising or lowering both puts its nose up or down. The camera goes with the plane, so the whole island tips and moves as it does. The island has a smoking volcano, a town with a giant statue of Joze, a castle, a fair with a big wheel, farms and windmills, a harbour, lighthouses, ships at sea, hot-air balloons and thousands of trees.

**The mission:** sky pirates are hunting the child, and the child hunts them, until they've all been dropped. There are at most three in the air at once, and another comes along as soon as one is dropped. Nobody gets hurt: a plane that's dropped falls away smoking, and its pilot comes down by parachute.

**The ring** is always in the middle of the screen, and the guns fire by themselves at any plane inside it, turning green as they do. There's nothing to press and nothing to do with the hands. What's inside the ring on the screen is exactly what the guns fire at, whatever the size of the window. Marks show each plane, and an arrow at the edge of the screen says which way to turn for one that's out of sight. It turns red for one that's hunting the child.

**The limits:** there's a ceiling, nothing can fly into the land or the sea, it can only climb or bank so far, so nobody ends up upside down, and a plane heading out to sea is turned back towards the island before a wall of cloud.

**A short lesson comes first,** with the child's character showing each thing in a looping film and a pair of little wings on screen tipping along with their arms.

**For children with hemiplegia:**

- **It learns this child's arms.** However the arms are held in the lesson becomes level, so an arm that doesn't come up as far doesn't make the plane fly in circles. As far as they tip each way becomes a full turn.
- **The plane helps with lining up.** When a plane is near the ring, the child's plane turns towards it a little. How much depends on **How hard**.
- **Flying up and down can be left to the plane,** under **Flying up and down**, for a child who can't raise both arms: it follows the height of the other planes, and only turning is left to do.
- **On Gentle, the default,** the ring is big and the child can't be shot down: hearts stop at one, and they come back.
- **Resting is always fine.** With arms down the plane glides and the film asks for them back. After 4 seconds it flies itself in a gentle circle and nobody shoots at all, however long the rest goes on.
- **Nothing flashes,** and the picture's brightness is tested through firing, drops and flying right through a cloud, which fades as the plane reaches it. There's no muzzle flash and no explosion, only small sparks and soft grey smoke.

This game doesn't read the hand at all, as the guns fire by themselves, so it doesn't practise opening the hand. It's all about the shoulders and both arms.

## The games with a mission

These three use the same hand tracking as Balloon Pop, so they start with the hand check and can be played sitting close to the camera. Each one is a story, with the characters from the other games asking for help in their own voices, because a hard movement is easier to repeat for someone who needs it.

**Nobody waits for anyone to finish talking.** Each character has one short line, and the action doesn't stop for it: fruit flies from the first moment and all the way through the Smoothie Stand, the first ship is already calling at the Lighthouse, and the fruit is already on Joze's first tree. Between customers, ships and stops there's about a second or two at most.

- **Joze's Long Walk Home** is about closing a hand, keeping it closed while it moves, and opening it in the right place. Dropping a fruit costs nothing: it just goes back on the tree. **How far to reach** moves the tree closer to Joze.
- **Joze's Smoothie Stand** is right-handed unless a grown-up picks the left, like all of these. An open hand has to be moving to slice, so that it's a swipe. **How to slice** can make a touch enough, for slow or limited movement. A closed hand only bumps the fruit and is asked to open. Rotten fruit only comes with the last customers, and all it does is make the glove sticky for a moment. There's no way to lose.
- **The Lighthouse Keeper** is about reaching all over a big window with an open hand. Only an open hand wipes, and a closed one is asked to open. **Size of the window** sets how far there is to reach. A window only has to be mostly clean, as the last corners may be out of reach. The storm has no lightning, and the picture brightens slowly as each ship comes home.

## Sound

**A line is never cut off,** in any of the games, as nothing sounds more robotic. If something is being said, a new line waits for it to finish, after a short pause, and only the newest one waits, so a queue can't build up. A line that has waited more than 4 seconds is out of date and goes unsaid, and small remarks are simply dropped if anything's being said. Lines only stop mid-way if everything is stopping, such as when the panel opens.

**The English voices** are rendered ahead of time with [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) on this computer, and the games just play the files. The coach is `af_heart`, and Mighty Moves also has an announcer and a voice for each fighter. To change what's said, edit a `lines.json` ([core/audio/voice/](core/audio/voice/lines.json) or [the game's own](games/mighty-moves/audio/voice/lines.json)) and run `npm run voice`. Rendering needs the Kokoro install from the `explainer-video` skill. Playing doesn't.

**The Georgian voices** are Microsoft's neural voices: Eka as the coach, and Giorgi as Mighty Moves' announcer, with pitch shifted so the fighters don't all sound alike. [tools/render_voice_ka.py](tools/render_voice_ka.py) renders them through the open-source `edge-tts` tool, which sends only the text of the lines. Choose **Voice language** under the gear icon. Spoken prompts then appear in Georgian too, as do Mighty Moves' move names and big words, though the rest of the screen stays in English for now.

**How the voice was chosen.** Since nobody here could listen, each candidate's clips went through Georgian speech recognizers, to see how much they could make out. On ten of the lines, with lower being better, one recognizer scored Giorgi 0.59, Eka 0.61, a Georgian voice model running on this computer 0.65, and Piper's Natia, the earlier stand-in, 0.84. That recognizer drops syllables on short clips, so only the comparison means much. A stronger one, Meta's Omnilingual, got Eka's lines 97% right and Natia's 93%, with most of the remaining errors being very short clips it heard nothing in. Microsoft's two also had by far the cleanest background. This shows the words are clear, but not that they sound natural or friendly, which needs a person to listen.

**To use a real person's voice instead,** record each line in `lines.json` as its own file named after its `id`, such as `open-right-hand.m4a`. A phone's voice memos are fine. Then run:

```
npm run voice:import -- <folder of recordings> ka
```

Each recording is trimmed and set to the same level as the rest. Any lines not recorded yet keep their current voice, so it can be done in parts.

**The car** is a real engine recording, played the way racing games do it: the pitch comes from a modelled rev counter with three gears, so it rises and drops through shifts. It's louder and brighter under power and falls away when coasting, so opening the hand gets an immediate rev as a reward. Tyre and wind noise builds with speed. The car also drops back while the voice speaks, so words stay clear. The levels are in [games/high-five-racers/car-sound.js](games/high-five-racers/car-sound.js).

**The pop** is a real balloon recording, softened so it won't startle a sensitive child, and varied in pitch so no two sound the same.

**The trail** has real footsteps on grass, and a cheerful piano loop that drops back while anyone speaks. The loop is only 17 seconds long, so it may be worth changing if it gets tiring. With moves, voices and music together, the mix peaked at 0.92.

**The fight** uses real recordings too: swings through the air, softened hits, a hand drum for the heavy ones, a real clap, a boxing bell and cheering. The music drops back while anyone speaks, and sound effects and music can be turned off together. Tests check that the mix doesn't go over 1.0, which is where it would distort.

**The sky** has a real small plane's propeller, looped from the steady part of a recording and following the plane's speed, under the fight's music. The guns are real paintball shots, softer and friendlier than real guns, retimed into a steady rattle that only plays while a plane is in the ring. A wrong answer in Balloon Pop sizzles with a real egg going into a real pan.

Where each sound came from is in [CREDITS.md](CREDITS.md).

## Privacy

Camera frames are only ever used in the browser and are never saved. Each page's security policy blocks it from sending anything to another computer, and the camera turns off as soon as a round ends. Only settings are stored, in the browser. A round's numbers are shown once and then discarded. All libraries, the model and the sounds are in this folder, so the games also work offline.

## Tests

```
npm install     # once, for Playwright
npm test
```

Unit tests run the rules against what the real model reported for real photos and videos. The Playwright tests run the real games, trackers and models in your installed Chrome, with the webcam replaced by a canvas showing photos of hands, or footage of a person for the whole-body games ([test/e2e/fake-camera.js](test/e2e/fake-camera.js)). They write screenshots to `test-results/screens/`.

[tools/record_pose.mjs](tools/record_pose.mjs) records what the model reports for a video, which is where [test/fixtures/body-moves.json](test/fixtures/body-moves.json) came from. What happens in each clip was checked by eye against its frames.

There's no free footage of a person clapping, circling a hand or holding their arms out in full view of a camera, so [tools/render_test_moves.py](tools/render_test_moves.py) renders it in Blender with a rigged character. The real tracker reads those pictures, so what's made up is the person, not the tracking. Those three moves have only been tried on that rendered person.

## Not tested yet

- **Children's hands, and hands with hemiplegia.** Everything so far uses photos of adult hands. A flexed wrist, a pronated forearm or a very small hand could all read differently. This is the most important thing to try next, and the panel's live finger bars are there to help with it.
- **Children's bodies, and bodies with hemiplegia, in the whole-body games.** The move rules were tuned on videos of fit adults, doing karate and workouts, and on a rendered character for claps, hand circles and arms held out as wings. A child's moves may be slower and smaller, and an affected side may move very differently. *How big a movement has to be* is the setting to try first.
- **How the games feel.** Rules, timing and every screen are tested, but only a child can say whether Leap Trail's speeds are right, whether the films are clear enough to copy, whether Mighty Moves' pace works, how tiring it is to hold both arms out in Sky Wings, and whether any of it is fun for more than a few minutes.
- **The burnt glove.** Only a grown-up who knows the child can judge whether it's funny or upsetting. It's easy to change if it isn't right.
- **Reading a moving hand at a distance.** Hands were only tested on sharp photos shrunk to size. A hand in the middle of a strike will be blurrier, so fewer strikes may be read than that test suggests, and a real webcam's picture may matter a lot.
- **Kicks seen from the front.** The only kick footage available was filmed from the side, which confuses the tracker's left and right legs, so kicks were tested with a real standing body that had its legs moved by the test.
- **A real webcam.** Only simulated camera feeds have been used. Real lighting, backgrounds and motion may need some tuning. That goes double for Balloon Pop: how hard balloons are to reach, and how it feels to chase them, can only be judged with a real hand moving.
- **The left and right label on these hands.** It has only been checked on photos of adult hands, so a child's hand or a hand with hemiplegia could be named wrongly. If the tracker is confidently wrong, the hand won't count, and the panel says "Only sees the other hand", so it's quick to spot.
- **How it all sounds.** Loading, levels, clipping and timing are tested and the mix was measured, but the sound choices, the music and the balance need a human ear. The Georgian especially needs a native speaker's, both the voices and my translations.
- **Real phones and tablets.** The layouts were checked at those sizes in desktop Chrome.

## Known limits

- **Space.** Mighty Moves needs the child's whole body in view, which takes about 2 to 3 metres from the camera, and it needs a clear floor. Sky Wings needs room for both arms out to the sides. They can't tell if there's something nearby to bump into.
- **A circle has to be drawn facing the camera.** Hand circles are read from the picture, so an arm going round in line with the camera, from front to back, looks like a line and doesn't count. About two thirds of the way round is enough, as a hand crossing in front of the body is often lost for a moment. A hand's wrist turning on the spot isn't read either.
- **A clap can't be heard.** It's read from the hands coming together, so hands meeting silently count too.
- **Distance.** In the hand games, the tracker only finds a new hand when the palm is at least about 15% of the picture's height. Once found, it follows the hand down to about 6%. For a child's hand on a typical webcam, that works out at roughly 60 cm and 1.5 m from the camera. Those distances are calculated rather than measured. The hand check shows how big hands need to look.
- **A hand hidden behind the hand in play can't be seen.** The camera only sees what's in front, so a child could hold the hand open from behind. An adult watching will notice, but the game won't.
- **The wrist isn't measured.** Hand tracking can't see the forearm, so it can't tell if a child opens their fingers by bending the wrist down, a common way of compensating. A therapist may want to watch for this.

These games are not medical devices and don't replace therapy. Please check targets and how long to play with the child's therapist.

## Third-party parts

| Part | Version | Licence |
|---|---|---|
| [MediaPipe Tasks Vision](https://www.npmjs.com/package/@mediapipe/tasks-vision), and the hand and pose landmarker models | 1.2.2 | Apache 2.0 |
| [Three.js](https://threejs.org) | 0.187.0 | MIT |
| [Fredoka](https://fonts.google.com/specimen/Fredoka) font | 5.3.0 (Fontsource) | SIL Open Font License |
| Noto Sans Georgian font | 5.3.0 (Fontsource) | SIL Open Font License |
| Sounds and voices | See [CREDITS.md](CREDITS.md) | Sounds are CC0 except the engine loop (CC-BY 3.0, credit required). Check the Georgian voices' terms before publishing the games: see CREDITS.md. |

The test photos come from MediaPipe's test assets. The filmed test videos and the numbers taken from them are CC BY-SA 4.0: see CREDITS.md.
