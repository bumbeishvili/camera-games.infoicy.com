# Camera Games

Camera games for children with hemiplegia, played by moving in front of a webcam. Opening the hand is what they practise. The right hand is the default, and the left can be chosen instead under the gear icon.

- **High Five Racers:** the car only drives while the hand is open. Steering over to a giant hand at the roadside high fives it for a boost, and opening the hand as wide as it goes is turbo. Nobody can crash or lose: if the hand closes, the car coasts to a stop and waits. See [below](#high-five-racers).
- **Balloon Pop:** balloons float up and drift around, and the open hand pops them. A closed hand just bumps them. Missing a balloon costs nothing. A grown-up can turn on a maths challenge, where the wrong answer burns the glove.
- **Mighty Moves:** a fighting game against the computer, played with the whole body. The coach shows concrete moves to do, like a clap, a squat, a jump or a hand circle, and only those can win. Ordinary punches and kicks are small hits. See [below](#mighty-moves).
- **Leap Trail:** a fast run down a country path in 3D, jumping over what's in the way and stepping from side to side between three lanes to grab lines of stars, with the child's real body. See [below](#leap-trail).
- **Sky Wings:** a dogfight over a 3D island, with both arms as wings. Tipping them banks and turns the plane, and raising or lowering them flies it up and down. Sky pirates hunt the child and the child hunts them: the guns fire by themselves at any plane inside the ring, until they've all been dropped.
- **Robot Rescue:** robots have caught the friends from the other games, and the child rides a little tram through a seaside town to free them. An open hand fires at whatever is in the crosshair, and a closed hand raises a shield and reloads. See [below](#robot-rescue).
- **Tank Patrol:** robot tanks are rolling into Joze's valley, and he rides along with his long neck sticking out of the hatch. With one hand: closing it drives the tank to where it points, and opening it fires at any robot tank under the crosshair that the gun can reach. See [below](#tank-patrol).
- **Cannon Bay:** a sea battle around the 3D island, with one hand. Moving it from side to side turns the ship's wheel, and opening it raises the sails. The cannons fire by themselves at any pirate ship in a firing zone. See [below](#cannon-bay).
- **Joze's Long Walk Home:** Joze the giraffe is lost and hungry. The child closes a hand on fruit, carries it across to his mouth and opens the hand to feed him, and each stop fed takes him closer to his family.
- **Spider Catcher:** Joze's little spider friends have run off all over the garden, scuttling about and swinging on their threads. The child opens a hand by one and closes it to pick it up, carries it across to its web and opens the hand to put it home. See [below](#spider-catcher).
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
  levels.js             the ten levels every game has, and where they show
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
  high-five-racers/     its rules, 3D world, cars, big hands and sounds
  balloon-pop/          its balloons, gloves, maths questions and sounds
  mighty-moves/         its coach, fight rules, moves, stage and sounds
  leap-trail/           its run rules, practice, 3D trail and sounds
  sky-wings/            its flight rules, lesson, island, 3D sky and sounds
  robot-rescue/         its rules, the town, the robots, the crosshair and its sounds
  tank-patrol/          its patrol rules, valley map, tanks, 3D valley and sounds
  cannon-bay/           its battle rules and sea chart, the waves, ships and sea life, and its sounds
  joze-walk/            its journey, the land Joze walks through and its sounds
  spider-catcher/       its rules and levels, the garden, the spiders and webs, and its sounds
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

Choose **Hand to play with** under the gear icon. It's remembered across the games. The other hand is ignored, so it can rest, close or leave the picture, except for one extra in High Five Racers, below, which it can never be punished for missing. It still can't overlap the hand in play, so one hand can't hold the other open. In High Five Racers, moving the hand side to side steers, measured from where it started in the hand check.

**How it tells left from right.** It uses the tracker's own left or right label, because the hand could be anywhere in the picture. The label swapped correctly on every mirrored photo, at angles up to 60° and including fists, with confidence never below 0.88. It also named both hands correctly in a photo with crossed arms. When the tracker is less than 70% sure, the hand's side of the mirror decides instead, so a child doesn't get stuck being asked for a hand they're showing. If the tracker is sure it's seeing the other hand, that hand doesn't count, and the panel says "Only sees the other hand".

## Levels

Every game has ten levels, and each is a little harder than the one before. Winning a game moves it on to the next level, up to level 10. A game that's lost comes round again at the same level. Sky Wings and Mighty Moves can be lost, and so can Robot Rescue, Tank Patrol and Cannon Bay on Medium or Tough, but never on Gentle. Each game remembers its own level. It's on the title card, under the countdown's numbers and on the finish card, with a dot for each level. A grown-up can choose any level under the gear icon, and the new level starts with the next game.

Level 1 plays the way each game always has. After that, levels bring more going on at once and a quicker pace, and from about level 4, new kinds of things to deal with. What each game changes is in its own section below, and its numbers are in its rules file.

**What a level never changes:** anything a grown-up or therapist chose. That's the hand in play, how open a hand has to be, how far there is to reach, how big a movement has to be, a gentle mode that can't be lost, help like a car that steers itself, and how long a game was set to be. Resting is never punished at any level. Even at level 10, there's still at least about 70% of level 1's time to react, no more than about twice as many moves a minute, and a game lasts at most about a third longer. Every level-10 game is also tested to make sure nothing flashes.

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

**Levels in Balloon Pop.** Level 1 is the game as described above. Each level brings balloons a little faster and a little more often, with more up at once and more of them drifting wide. From level 4 some are star balloons, which only pop once the open hand has stayed on them for about a third of a second, with a ring closing round them. From level 5 some come up as pairs tied together, and from level 7 a gentle breeze pushes them all slowly one way and back. Even at level 10 each balloon is on the screen for three quarters of the time it was at level 1, and no more than twice as many come along a minute. How many to pop, the speed chosen, reach help and the hand stay as a grown-up set them. With the maths challenge on, levels 4 and 8 each add one more answer to choose from, up to five. Missing a balloon still costs nothing. The numbers are in `balloonLevel` in `rules.js`.

## High Five Racers

A race round a lap with grandstands, a village, a tunnel, a farm, a lake, a forest, Joze's family and the Harvest Fair. Joze drives unless a grown-up picks someone else under **Who drives**, and other characters from the games drive the other cars. They stay close, so there's always someone to pass, and they ease off on the last stretch.

**High fives.** Giant open hands stand on alternating sides of the road, and the stars lead over to each one. Reaching the hand across moves the car across the road. A big hand goes green once the car is lined up, and only a hand read as open slaps it, for a burst of shapes and a boost. A closed or unreadable hand gets a soft pat and no boost.

**Turbo.** Opening the hand to about its own best from the hand check fills a meter, and then there are flames, more speed and a wider view. It goes by this hand's best, so a hand that can't open far gets it too. It ends at once if the hand closes.

**Flying, with the other hand.** Once turbo has run out, making a fist with the other hand and opening it again sets turbo off for 3.5 seconds, shown running down on the meter like a timer, and the car takes off: about 6 m up and 3 seconds in the air, or a low hop with reduced motion. "Fly!" pops up. It only counts if the other hand is seen open, then really closed in view, then open again, so a hand coming into the picture or going out of it can't set it off. The hand in play still has to be open for the car to go, and closing it ends the turbo. The flight stays under the banners, footbridges and the tunnel's roof, and flying high over a big hand is neither a high five nor a miss.

**For children with hemiplegia:**

- **How far to reach** can be set, and a side that keeps being missed brings its hands closer, each side on its own. **Car steers itself** still does all of the steering.
- **Resting is always fine.** Closing the hand brings up the brake lights and the car coasts to a stop. Everyone waits, and resting costs no places.
- **The summary counts high fives to each side.**
- **Nothing flashes.** Measured through slaps, turbo, the tunnel, a flight and a whole lap, brightness changed by less than 5% from one frame to the next. The tunnel is as bright as outdoors, and anything repeating along the road goes past fewer than three times a second.
- **On a slow computer** it gives up sharpness, then shadows, then flowers and grass, then bushes, rocks, distant things and half the crowd.

**Turbo and flying are shown, not just said.** Until turbo starts, the meter shows a hand spread wide with "Open wide!", then "Keep it open!" while it fills. If the hand has been open for a while without turbo, the meter bounces and a little film shows a hand opening wide, again every 20 seconds or so, but it's only said aloud once a race. When turbo runs out, a film by the meter shows the other hand, on its own side as in a mirror, making a fist and opening, and the car taking off. It shows the first three times each race, and after that only until the car has flown.

**Levels.** Level 1 is the race described above. Level by level the other cars race a little harder, and new things come in. From level 3 there are two big hands in a row on one side, and from level 4 a fourth car joins, with a fifth at level 8. From level 5 the others use turbo now and then, one at a time, and the child passes them back. From level 6 there's a ramp to one side of the road that jumps straight into a high five, and from level 7 a slalom of big hands through the village. At level 10 there are 19 big hands a lap instead of 13, but two on opposite sides are never less than 62 m apart, which leaves at least 70% of the time to get across. The car's speed, the laps, how far to reach, steering help and the hand never change with the level. The others still ease off at the end so the child wins, nobody uses turbo while a child rests, and while the car flies, the others make room at the edges of the road. The numbers are in `racePlan` in `rules.js`.

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

**Levels.** Levels go from 1 to 10, one fight each, and winning a fight moves on a level, while losing one stays. The computer's strength stays the grown-ups' choice: a level never makes it hit harder, and on Gentle it still can't knock a child out. Higher levels bring its turns a little more often, with a warning down to 80% as long, and a shorter pause between moves. From level 3 leaning out of the way joins blocking, and from level 4 the computer has more moves. From level 5 some turns are two hits in a row, one to block and one to lean from, and from level 6 the coach's moves come in a mixed-up order. From level 7 some moves are asked for twice, with a dot on the coach's card for each, and the fighter's move is stronger for it. Jumps, high knees and reaching up are never asked for twice, and a child standing still is never hit at any level. The numbers are in `fightLevel` in `moves.js`.

## Leap Trail

The character runs fast down the trail by itself, through a village, past fences and poles that rush by. The child's real jumps get it over what's in the way, and a jump as soon as it's asked for sends it over in a dash. Jumping is the only move asked for: there are no squats, so a child never has to work out which move is wanted, and going down before a jump is never taken for anything. All the time a child gets is set in seconds, so the running being fast doesn't ask them to move any sooner. Stars hang along the way a jump will go.

**The trail has three lanes.** The middle one is wherever the child is standing when the run starts. Stepping to one side moves the runner into the lane on that side, as in a mirror, and stepping back brings it back, with a soft swish. Obstacles fill one, two or all three lanes. One that leaves a lane free can be gone round by stepping into that lane, which counts as clearing it, or jumped; one right across needs a jump. Only the lanes it fills are painted, so the way round shows from far off, and the film and the word "Jump!" only come when the runner is in its way. The lines of stars between them are in one lane or another, and the line before a narrow obstacle leads towards its free lane. Only the lane the runner is in picks them up. A missed star costs nothing. It goes by the middle of the shoulders and hips, in torso lengths, so it's the same near the camera or far away: half a torso length out moves into a side lane, and coming back within a quarter of one returns to the middle. In between nothing changes, so standing still or swaying doesn't drift, and a move has to last 0.15 seconds, so one jumpy frame from the tracker doesn't count. A body the camera loses leaves the runner where it is. Each game uses the same ten characters, and the trail, its obstacles and the rules are all original to this game.

**A short practice comes first,** so a child knows what the game can see. Their character shows each move in a looping film, first a jump and then a step to the side, the runner copies their body beside it, and a meter shows how close they are to a jump, from standing at the bottom. As soon as a move is seen it's confirmed in words, with a chime and a green frame. If they're trying but not reaching what counts, what counts comes down to just below their best, though never as low as someone standing still. It can be skipped, and isn't repeated on the next run. There's no keyboard control: only the body moves the runner.

**Nobody fails.** A painted stretch of path before each obstacle shows where a move will count, and a move anywhere on it clears the obstacle, because the jump lasts as long as it takes. The camera adds a moment of delay to everything, so this matters. The film, a big word and the voice all say what's wanted when it comes up. If a move is missed, the obstacle is knocked aside and the run carries on, costing only the streak. A grown-up can have the runner stop and wait for the move instead, for as long as it takes.

**For children with hemiplegia:**

- **Jumping isn't the only way.** Under **How to get over things**, a grown-up can choose lifting a knee, for a child who can stand but not jump, or raising an open hand. Raising a hand can be done sitting down, as the camera then only needs the top half of the child, and then it's leaning to the side that moves across the lanes, going by the shoulders, which needs a little less. It's also the open-hand exercise: a raised fist is asked to open and doesn't count, and neither does a hand that can't be read.
- **An affected leg doesn't stop a jump counting.** It goes by the hips rising and the higher foot, so a lopsided jump is still a jump.
- **Moving across can be turned off,** under **Moving from side to side**, for a child who can't step sideways safely. The runner and every star then stay in the middle lane, and every obstacle fills the middle lane, so the whole trail is still jumps.
- **How big a movement has to be** is the same setting as in Mighty Moves. On *Small*, a bob up and down can count as a jump, and a smaller step moves across.
- **The panel says what the camera is seeing,** and what it needs right now, to help tell why a move is being missed.
- **Resting is always fine.** After 9 seconds without moving, the runner stops and waits, even when set to stumble.
- **Speed** and **length of the trail** can be set. Even *Fast* is forgiving.
- **A missed move is only a stumble,** so that the run keeps its pace. For a child who needs longer, **When a move is missed** can make the runner stop and wait for as long as it takes.
- **Nothing flashes.** Measured through jumps, landings and a long dash, at level 1 and level 10, brightness changed by less than 3% from one frame to the next.

**Levels.** Each level is a little harder than the last, always from the pace a grown-up chose: a little faster, obstacles a little closer, and the stretch where a jump counts down to 85% of what it was. Higher levels also have more obstacles that fill one or two lanes, with the free lane switching sides, and lines of stars change lanes more often. From level 3 a golden star hangs over some obstacles in one lane, caught by jumping over in that lane. A fence comes in at level 4, lines of stars that cross a lane halfway at 5, round hay bales that roll in and stop before the painted stretch at 6, and a flock of sheep at 8. Finishing a run moves on a level, as nobody loses one. The numbers are in `trailLevel` in `run.js`.

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

**Levels.** Dropping every plane moves on a level, and being shot down, on Medium or Tough, stays. A level never changes the ring's size, the help with lining up, how hard the pirates shoot, Gentle's hearts or flying up and down by itself. Higher levels make the pirates a little faster and sharper in the turn, but never as fast as the child's plane. They also hunt the child a little more often and dodge for longer when hit. From level 3 they weave from side to side as they cross, and from level 5 they climb and dive more. From level 8 the last one is the pirate captain, a bigger plane with a flag that takes more hits, and from level 9 there can be four in the air at once. Being hunted gives as long to turn as ever. The numbers are in `flightLevel` in `flight.js`.

## Robot Rescue

The hand is the aim, like an arcade light gun, so small movements cover the screen. An open hand fires by itself at whatever is in the crosshair, and a closed hand raises a shield and reloads. That makes one hand do two things, and a natural open and close builds up, with closing useful rather than a mistake. The tram does all the moving, from place to place, so there's no steering to do while aiming. Each place has a friend in a cage, freed by dealing with the robots there, and the last has a big robot whose weak spots open one at a time. A little film shows what to do until the child has fired and closed.

**For children with hemiplegia:**

- **Precision doesn't decide it.** Hand wobble is steadied, and the crosshair is pulled onto the nearest robot. **Reach help** sets how strongly. Even the least of it is generous.
- **Only what's read as open fires, and only what's read as closed raises the shield.** A hand that's gone, half out of the picture, too far away or overlapping the other does neither, and the crosshair shows a question mark.
- **Reloading can be turned off,** for a child who can't close their hand easily. If it's on, an empty blaster still fills itself after about 6 seconds, so nobody is stuck.
- **Resting is always fine.** With the hand gone or closed for 4 seconds, the robots stop throwing and wave, and any goo in the air goes.
- **On Gentle, the default, a child can't lose.** Hearts stop at one, and goo takes over 3 seconds to arrive. At the first stop nothing is thrown until a robot has been dropped, or 14 seconds have gone by. On the harder settings, running out of hearts ends it with "So close!", counts the robots dropped, and they can go again straight away.
- **Nothing flashes.** There's no muzzle flash and nothing lights up. A hit is small shapes where it happened, and the shield is see-through and rises and falls at a steady rate, so a quick open and close can't flicker it. Measured with the crosshair and shield included, brightness changed by less than 2% from one frame to the next. A haze softens the sides of the view while the tram moves, as walls going past were the one thing that flickered.

**Levels.** Each level makes walkers a little quicker and keener to move on, and peekers pop down sooner. Goo comes more often and a little faster, though never in under 2 seconds. From level 3 drones swoop down towards the tram and back up, and from level 4 peekers spring through the air from one cover to the next, and can be hit on the way. From level 5 robots on one big wheel roll from spot to spot in place of some walkers, stopping for a moment at each and never throwing. From level 6 one more robot is out at once, and one more blob of goo can be in the air. From level 7 some robots throw a second blob straight after the first, and from level 8 the big one steps from side to side, taking its weak spots with it. Swoops, hops and rollers are kept slow, so the crosshair, which goes with whatever it's on, doesn't dart about. The speed, Reach help, Reloading, How hard and the number of stops stay as a grown-up set them, and Gentle still can't be lost. Running out of hearts on Medium or Tough tries the same level again. The numbers are in `levelPlan` in `rescue.js`.

## Tank Patrol

The camera stays still, high over one toy valley that fits on the screen, so the hand always points at the same place on the ground. That's what makes one hand enough. It uses the same hand tracking as Balloon Pop, so it starts with the hand check and can be played sitting close to the camera. Right-handed unless a grown-up picks the left.

- **A closed hand drives.** The crosshair becomes a yellow marker lying on the ground, and the tank rolls to it, finding its way round what's in the way and over the bridges, with dots showing the way.
- **An open hand fires.** The crosshair becomes a ring standing up, the turret swings to it, and the gun fires by itself at any robot tank under it, turning green. There's nothing to press. **Reach help** says how strongly the ring is pulled onto a tank near it.
- **The gun has a range,** shown by a ring on the ground. A tank out of range turns the crosshair orange and dashed, with a closed hand in it. Robot tanks keep just out of range, so closing to drive nearer and opening to fire is how it's won.

**Nobody gets hurt.** Targets are robot tanks, a few at a time, with more as others are stopped. They never explode: a stopped tank rattles to a halt in soft grey smoke, bolts and stars, its little crew climbs out and waves, and it fades.

**Shells are slow and can be seen coming,** with a ring on the ground filling in where one will land, so there's time to drive away. A hit costs a heart, and hearts come back with time.

**For children with hemiplegia:**

- **Anything uncertain does nothing.** A hand that's missing, off the edge or can't be read neither fires nor drives, and it has to stay closed for a moment before the tank moves.
- **Driving** can be set to **By itself**, for a child who can't close easily: an open hand on a tank out of range drives nearer, and the tank gets out from under shells itself.
- **On Gentle, the default,** shells are slow and hearts stop at one. On Medium and Tough, running out ends it with "So close!", and they can go again straight away.
- **Resting is always fine.** With the hand gone for 3 seconds, or nothing changing for 5, the robots stop and wait, whatever was coming goes up in a puff, and nothing bad happens.
- **A little film** shows a hand closing to drive and opening to fire, until the child has done both, and comes back if nothing has happened for a while.
- **Nothing flashes.** There's no muzzle flash and no explosion, and the picture's brightness is tested through firing, stops and shells landing.

**Levels.** Each level makes the robot tanks a little quicker, keener to move on and keep further off, and shells come more often and a little faster, never under 80% as long. From level 3 scouts dash from place to place, and from level 4 tanks come in pairs and keep together. From level 5 shells allow for the tank driving along. From level 6 a tank that has taken half its hits runs off out of range, once, and has to be chased. From level 7 heavy tanks lob two shells at once, landing apart, with bashers doing it too from level 9. One more tank is about from level 3, and two from level 8. Driving by itself still chases a tank that runs, and gets out from under both shells. The speed, Reach help, Driving, How hard and the number of tanks stay as a grown-up set them, and Gentle still can't be lost. Running out of hearts on Medium or Tough tries the same level again. The numbers are in `levelPlan` in `patrol.js`.

## Cannon Bay

Pirates have come for the island's treasure, and Captain Joze, with his long neck above the rail, asks the child to drive them off. It's the island from Sky Wings seen from the sea, from behind and a little above the ship.

**One hand does everything.** Moving it from side to side turns the ship's wheel, shown big on the screen. An open hand raises the sails, and the ship goes faster the wider it's open. A closed hand lowers them and the ship slows and drifts, which is never a failure.

**The cannons fire by themselves** at any pirate ship in a firing zone. There's one zone on each side of the ship, drawn on the water, and each glows green while its cannons fire. They only fire with the hand seen to be open. Under **Cannons**, a grown-up can have them fire with a closed hand too, as long as the hand can be seen. A hand that's missing, half out of the picture or can't be read never fires.

**The pirates** are the other nine characters, each with their own ship. There are three at a time, with another along about a second after one is beaten. They come alongside and fire slow cannonballs in high arcs, with a ring on the water showing where each will land. Being hit costs a heart, and hearts come back. Arrows at the edge of the screen say which way to steer for a ship out of sight.

**Nobody gets hurt.** Nothing explodes. A beaten ship lowers its sails and slowly sinks in soft grey smoke, its crew rows away waving, and it leaves a line of gold to sail through. Missing the gold costs nothing.

**For children with hemiplegia:**

- **Steering is measured from where the hand starts,** and the ship helps keep a nearby pirate alongside. How much depends on **How hard**.
- **On Gentle, the default,** the zones are big and the ship can't be sunk: hearts stop at one. On harder settings, running out of hearts ends the battle with "So close!" and a way to go again straight away.
- **Resting is always fine.** After 4 seconds with the hand closed or gone, the pirates stop firing and sail in circles, and whatever's in the air lands harmlessly.
- **The ship can't hit anything.** It's steered gently round the coast and turned back at the edge of the world, and ships slide past each other.
- **A little film** shows the sails and the wheel until the child has done each, and comes back if they seem stuck.
- **Nothing flashes.** There are no muzzle flashes, only soft smoke and small shapes. Measured through firing, splashes and sinking, brightness changed by less than 2 out of 255 from one frame to the next.

**Levels.** Each level has pirates reload quicker and fire closer together, and sail a little faster when chasing or running. They stay alongside for less long, though never under three quarters as long, and run for it more often when hit. From level 3 a pirate running for it zigzags, and from level 5 every third pirate sails a quick little sloop that takes fewer hits. From level 6 there are four pirates at once instead of three, and from level 7 each broadside has one more ball. From level 9 the last captain sails a big flagship. The cannonballs fly just as slowly as ever. The speed, the firing zones, the help with lining up, Cannons, How hard and the number of ships stay as a grown-up set them, and Gentle still can't be sunk. Being sunk on Medium or Tough tries the same level again. The numbers are in `levelPlan` in `battle.js`.

## The games with a mission

These three use the same hand tracking as Balloon Pop, so they start with the hand check and can be played sitting close to the camera. Each one is a story, with the characters from the other games asking for help in their own voices, because a hard movement is easier to repeat for someone who needs it.

**Nobody waits for anyone to finish talking.** Each character has one short line, and the action doesn't stop for it: fruit flies from the first moment and all the way through the Smoothie Stand, the first ship is already calling at the Lighthouse, and the fruit is already on Joze's first tree. Between customers, ships and stops there's about a second or two at most.

- **Joze's Long Walk Home** is about closing a hand, keeping it closed while it moves, and opening it in the right place. Dropping a fruit costs nothing: it just goes back on the tree. **How far to reach** moves the tree closer to Joze.
- **Joze's Smoothie Stand** is right-handed unless a grown-up picks the left, like all of these. An open hand has to be moving to slice, so that it's a swipe. **How to slice** can make a touch enough, for slow or limited movement. A closed hand only bumps the fruit and is asked to open. Rotten fruit only comes with the last customers, and all it does is make the glove sticky for a moment. There's no way to lose.
- **The Lighthouse Keeper** is about reaching all over a big window with an open hand. Only an open hand wipes, and a closed one is asked to open. **Size of the window** sets how far there is to reach. A window only has to be mostly clean, as the last corners may be out of reach. The storm has no lightning, and the picture brightens slowly as each ship comes home.

**Levels in these three games:**

- **The Lighthouse Keeper:** the storm throws a little more at the window each level, but only while the child is wiping, so resting never brings anything new, and nothing has a time limit. From level 2 a wave throws a splat of mud back onto glass that's been wiped, and from level 5 two of them, sooner and a little bigger each level. From level 4 seaweed lands on the glass, and from level 7 every other window has a smiling starfish instead, which creeps slowly about. They come off by rubbing with an open hand, and a window isn't clean until they're gone. They always land in the middle of the window, never the corners. The numbers are in `stormAt` in `storm.js`.
- **Joze's Long Walk Home:** from level 2 Joze is hungrier at the river, and from level 6 at the hill too, and he walks a little quicker between trees each level. From level 3 the fruit sways on its branch in the wind, a little more each level. From level 4 there's green fruit that isn't ripe yet: a closed hand on it only gives it a wiggle, and it ripens by itself after a while. From level 7 a butterfly sits on a ripe fruit now and then, and that one can't be picked until the butterfly flies off, which it does when an open hand comes near. There's always a ripe fruit free, and the extra fruit hangs between the usual places, so there's no further to reach. The tree fades in and out between stops. The numbers are in `walkAt` and `stopsAt` in `journey.js`.
- **Joze's Smoothie Stand:** the customers' orders stay the same at every level. On top of the speed a grown-up chose, fruit falls a little faster each level, though at level 10 it's still up about 88% as long, and comes up more often, with more that isn't on the order mixed in. What's on the order still comes up at least as often as at level 1. Rotten fruit comes with earlier customers as the levels go up, and with everyone from level 8. From level 4 some fruit is thrown across from one side to the other, always within reach, and from level 6 a rotten fruit sometimes flies right beside a wanted one. From level 8 some fruit is tough, with a thick brown skin: the first swipe cracks it, and the second slices it. There are never more than 12 fruit in the air, as on Fast. The numbers are in `fairAt` in `orders.js`.

## Spider Catcher

The same grasp, carry and let go as Joze's Long Walk Home, but what's caught won't keep still. Joze's little spider friends have run off all over a sunny garden. They're round and colourful, with big eyes, rosy cheeks, smiles and short soft legs, and nothing pointy. Some scuttle about on smooth looping paths and some swing up and down on threads from a branch. Their web hangs across from where they play, by Joze, so bringing one home is a reach across. Each spider home makes its web a little fuller and whiter, and Joze claps. There are five places in the garden, each with its own web and a friend who says one short line while the spiders are already out: Joze at the gate, Mochi in the carrots, Bramble at the honey tree, Frost by the pond, and Joze again at his house. It ends when everyone is home. It uses the same hand tracking as Balloon Pop, so it starts with the hand check and can be played sitting close to the camera.

**Catching.** A hand has to be seen open and then close by a spider, within about a second, so it's a real grasp, and a fist held still can't collect spiders as they go past. Closing anywhere near one is enough, with a circle a little bigger than the palm. The spider stays in the closed hand, peeping out, wherever it goes. Opening the hand over the web lets it in. Opening anywhere else just lets it scurry back to playing, at no cost.

**It fails closed.** Only a hand the tracker is sure of counts as open or closed. A hand at the edge of the picture, too far away or overlapping the other is neither, so it can't catch a spider, and a spider it's holding stays held until the hand can be read again. A hand that leaves the picture lets go, and that never puts a spider in its web.

**The levels** ([games/spider-catcher/spiders.js](games/spider-catcher/spiders.js)). Level 1 has two spiders out at a time, slow, on simple loops, with a still web. After that there are more out at once (three from level 3, four from level 6), they go a little quicker each level, their paths go further and get twistier (figures of eight from level 3, pretzels from level 8), and the swings get longer. From level 4 the web sways slowly on its branch. From level 5 some spiders are shy: the first time a hand comes near, one scuttles a little way off, and after that it can be caught like any other. From level 7 some come in twos, holding hands, to bring home one after the other. The middle places have one more spider from level 3, and another from level 8. Level 10 is at most 1.35 times as fast as level 1, so there's still about 74% of the time to catch one going past.

**For children with hemiplegia:**

- **How far to reach** sets how far from the web the spiders play. No level changes it.
- **Resting is always fine.** The spiders just keep playing, and nothing is lost.
- **With reduced motion,** the web sways half as far, a shy spider dashes off more gently, and legs patter more slowly.
- **The summary counts spiders brought home with each hand.**
- **Nothing flashes.** Colours stay steady, a web fills in slowly, places fade into each other, and legs patter no more than about one and a half times a second. Measured through spiders moving, landing in webs, Joze clapping and moving between places, at level 1 and level 10, brightness changed by no more than 1.2 out of 255 from one frame to the next. Every place is bright, with an average brightness of over 190 out of 255.

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

**The car** is a real engine recording, played the way racing games do it: the pitch comes from a modelled rev counter with three gears, so it rises and drops through shifts. It's louder and brighter under power and falls away when coasting, so opening the hand gets an immediate rev as a reward. Tyre and wind noise builds with speed. The car also drops back while the voice speaks, so words stay clear. The levels are in [games/high-five-racers/car-sound.js](games/high-five-racers/car-sound.js). A high five is a real clap slowed down with a hand drum under it, and a boost or turbo is a real car coming past.

**The pop** is a real balloon recording, softened so it won't startle a sensitive child, and varied in pitch so no two sound the same.

**The trail** has real footsteps on grass, and a cheerful piano loop that drops back while anyone speaks. The loop is only 17 seconds long, so it may be worth changing if it gets tiring. With moves, voices and music together, the mix peaked at 0.92.

**The fight** uses real recordings too: swings through the air, softened hits, a hand drum for the heavy ones, a real clap, a boxing bell and cheering. The music drops back while anyone speaks, and sound effects and music can be turned off together. Tests check that the mix doesn't go over 1.0, which is where it would distort.

**The sky** has a real small plane's propeller, looped from the steady part of a recording and following the plane's speed, under the fight's music. The guns are real paintball shots, softer and friendlier than real guns, retimed into a steady rattle that only plays while a plane is in the ring. A wrong answer in Balloon Pop sizzles with a real egg going into a real pan.

**The rescue** uses real paintball shots, the same paintballs landing on metal drums for hits, tin cans and a bouncing nail for robots falling apart, mud and bubbles for goo, a Lego train for the tram, and a bicycle bell when it sets off, under Mighty Moves' music.

**The tank** has a real big diesel engine, looped and following its speed, under the fight's music and birds in the countryside. The gun is soft and friendly: a real champagne cork slowed right down, over a far-off bird scarer with everything sharp taken out.

**The sea** in Cannon Bay is real waves, gulls, wind in real masts and a big rope creaking, with a CC0 sea shanty under them. The wind and the water follow the sails. The cannon is a real bird-scaring gun recorded from far away, slowed and softened into a friendly thump.

**The garden** in Spider Catcher is a real wood full of birds, kept quiet underneath. A spider landing in its web is a real harp playing a cartoon bounce, and one let go scurries off through real long grass.

Where each sound came from is in [CREDITS.md](CREDITS.md).

## Privacy

Camera frames are only ever used in the browser and are never saved. Each page's security policy blocks it from sending anything to another computer, and the camera turns off as soon as a round ends. Only settings are stored, in the browser, along with which level each game is on. A round's numbers are shown once and then discarded. All libraries, the model and the sounds are in this folder, so the games also work offline.

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
- **How the games feel.** Rules, timing and every screen are tested, but only a child can say whether Leap Trail's speeds are right, whether its step to the side is the right size and lanes are easy to find, which was only tried on adult footage moved across the picture, whether the films are clear enough to copy, whether Mighty Moves' pace works, how tiring it is to hold both arms out in Sky Wings, and whether any of it is fun for more than a few minutes.
- **The burnt glove.** Only a grown-up who knows the child can judge whether it's funny or upsetting. It's easy to change if it isn't right.
- **Reading a moving hand at a distance.** Hands were only tested on sharp photos shrunk to size. A hand in the middle of a strike will be blurrier, so fewer strikes may be read than that test suggests, and a real webcam's picture may matter a lot.
- **Whether aiming and closing feel right in Robot Rescue.** Reach help, the length of a stop and how often goo comes were tuned without a real hand, and five stops have never been played through with one.
- **How Tank Patrol feels.** The gun's range, the speeds and how tiring it is were tuned without a real hand, and nobody has listened to its sound.
- **How Cannon Bay feels.** Whether the zones read clearly to a child, how long a hand can stay open, and whether the shanty gets tiring.
- **How far the big hands should be, and how wide turbo should need, on a real hand.**
- **How Spider Catcher feels.** Whether the spiders are slow enough to catch with a real affected hand, whether closing within about a second of opening is long enough for a hand that closes slowly, how big the catching circle should be, and whether a child finds the spiders cute. It was only played with photos of an adult hand, moved about by the tests, and nobody has listened to its sound.
- **Flying with the other hand, on a real child.** It was tested with photos of a fist and an open hand. A hand with hemiplegia might not read as a clear fist, and nobody has checked whether reaching out the second hand pulls the hand in play out of view.
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
