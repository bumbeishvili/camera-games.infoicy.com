# Camera Games: full details

Camera games for children with hemiplegia, played by moving in front of a webcam. Opening the hand is what they practise. The right hand is the default, and the left can be chosen instead under the gear icon.

They're played at <https://hemi.infoicy.com> in Google Chrome, on a computer with a webcam, or from this folder (see [Run it](#run-it)). The camera picture never leaves the computer, and once loaded they work offline, apart from racing a friend in High Five Racers. Each game has ten levels, and a grown-up can set how open the hand has to be, how far to reach and how big a move has to be.

- **High Five Racers:** the car only drives while the hand is open. Steering over to a giant hand at the roadside high fives it for a boost, and keeping the hand open fills up turbo. Nobody can crash or lose: if the hand closes, the car coasts to a stop and waits. See [below](#high-five-racers).
- **Balloon Pop:** balloons float up and drift around, and the open hand pops them. A closed hand just bumps them. Missing a balloon costs nothing. A grown-up can turn on a maths challenge, where the wrong answer burns the glove.
- **Mighty Moves:** a fighting game against the computer, or a friend on their own computer, played with the whole body. The coach shows concrete moves to do, like a clap, a squat, a jump or a hand circle, and only those can win. Ordinary punches and kicks are small hits. See [below](#mighty-moves).
- **Leap Trail:** a fast run down a country path in 3D, jumping over what's in the way and stepping from side to side between three lanes to grab lines of stars, with the child's real body. See [below](#leap-trail).
- **Sky Wings:** a dogfight over a 3D island, with both arms as wings. Tipping them banks and turns the plane, and raising or lowering them flies it up and down. Sky pirates hunt the child and the child hunts them: the guns fire by themselves at any plane inside the ring, until they've all been dropped.
- **Robot Rescue:** robots have caught the friends from the other games, and the child rides a little tram through a seaside town to free them. An open hand fires at whatever is in the crosshair, and a closed hand raises a shield and reloads. See [below](#robot-rescue).
- **Tank Patrol:** robot tanks are rolling into Giraffe's valley, and he rides along with his long neck sticking out of the hatch. With one hand: closing it drives the tank to where it points, and opening it fires at any robot tank under the crosshair that the gun can reach. See [below](#tank-patrol).
- **Cannon Bay:** a sea battle around the 3D island, with one hand. Moving it from side to side turns the ship's wheel, and opening it raises the sails. The cannons fire by themselves at any pirate ship in a firing zone. See [below](#cannon-bay).
- **Giraffe's Long Walk Home:** The giraffe is lost and hungry. The child closes a hand on fruit, carries it across to his mouth and opens the hand to feed him, and each stop fed takes him closer to his family.
- **Spider Catcher:** Giraffe's little spider friends have run off all over the garden, scuttling about and swinging on their threads. The child opens a hand by one and closes it to pick it up, carries it across to its web and opens the hand to put it home. See [below](#spider-catcher).
- **Giraffe's Smoothie Stand:** at the Harvest Fair, each customer orders a smoothie, and the child slices what they ordered with a swipe of the open hand. Bad fruit makes the glove sticky until it has been held open.
- **The Lighthouse Keeper:** mud from a storm has covered the windows and ships are lost at sea. Wiping a window clean with an open hand lets the light out, and brings a ship home.
- **Bounce Back:** tennis with a big, slow, floaty ball, against the computer or a friend. The open hand is the racket, and only an open hand sends the ball back over the net. Resting never loses a point. See [below](#bounce-back).
- **Giraffe's Maze:** Giraffe's friends are lost in a garden maze. The child's open hand leads him along the paths to each of them, and each friend found follows him into the next maze. A closed hand, or one that can't be seen, just leaves him waiting. On their own or with friends, all in the same maze. See [below](#giraffes-maze).

Every game's grown-ups' panel, under the gear icon, has a way back to all the games. On the page for choosing a game, each game's card plays a film of it being played, with just its name, and pointing at a card shows a line about the game. With reduced motion turned on in the computer's settings, a film only plays while its card is pointed at.

## Run it

You need Google Chrome, Python 3 and a webcam. Chrome is the only browser these games target. Nothing else to install.

```
cd camera-games.infoicy.com
npm start
```

Then open <http://localhost:8642> in Chrome and choose a game. Chrome only allows the camera on `localhost` or HTTPS, so opening `index.html` directly won't work. To play with friends from here, also run `npm run race-server`, which needs Node.

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
  friends.js, friends-ui.js    playing with friends on their own computers, and how it looks
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
  giraffe-walk/            its journey, the land Giraffe walks through and its sounds
  spider-catcher/       its rules and levels, the garden, the spiders and webs, and its sounds
  smoothie-stand/       its customers and orders, the fair and its sounds
  lighthouse/           its storm and ships, the lamp room and its sounds
  bounce-back/          its rules and levels, the court, the players' pictures, and the ball on a friend's computer
  giraffe-maze/         its mazes and how the character walks, the game as it's played, the maze drawn, the characters' pictures and its voices
tools/                  the local server, the local race server, and what prepares voices and sounds
server/                 the server for playing with friends in High Five Racers, Sky Wings, Balloon Pop, Mighty Moves, Bounce Back and Giraffe's Maze: its rules, and the Cloudflare Worker that runs them
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

Every game has ten levels, and each is a little harder than the one before. Winning a game moves it on to the next level, up to level 10. A game that's lost comes round again at the same level. Sky Wings and Mighty Moves can be lost, and so can Robot Rescue, Tank Patrol, Cannon Bay and Bounce Back on Medium or Tough, but never on Gentle. Each game remembers its own level. It's on the title card, under the countdown's numbers and on the finish card, with a dot for each level. A grown-up can choose any level under the gear icon, and the new level starts with the next game.

Level 1 plays the way each game always has. After that, levels bring more going on at once and a quicker pace, and every level from 2 brings something new to see and play with, such as a new kind of enemy or obstacle, a new kind of fire, or prizes to pick up. What's new is named on the title card and under the countdown, and the finish card shows what the next level brings. Missing a prize never costs anything. What each game changes is in its own section below, and its numbers are in its rules file.

**What a level never changes:** anything a grown-up or therapist chose. That's the hand in play, how open a hand has to be, how far there is to reach, how big a movement has to be, a gentle mode that can't be lost, help like a car that steers itself, and how long a game was set to be. Resting is never punished at any level. Even at level 10, there's still at least about 70% of level 1's time to react, no more than about twice as many moves a minute, and a game lasts at most about a third longer. Every level-10 game is also tested to make sure nothing flashes.

## Choices made for these children

- **The hand check never asks for a fist,** since making one is the opposite of what's being practised.
- **Nothing flashes.** Seizures are more common in children with hemiplegia, so there are no strobes or full-screen effects. Road markings are long and low contrast, and a pop is a small burst of colour.
- **Prompts are spoken and point at the hand,** for children who can't read yet or are unsure of left and right. Each is said twice at most, and only when nothing else is being said.
- **Racing:** steering is measured from where the hand starts, so it works wherever an affected arm is comfortable. The car can also steer itself, so a child can work on opening alone. After 15 seconds with the hand closed, the game says resting is fine.
- **Balloons:** only an open hand pops, so a child can't score with a fist. The hand can rest freely between balloons, and is only asked to open when it bumps one.
- **Balloons also help with reach:** the camera's central area fills the whole screen, so less arm movement covers more of it. Under **Reach help**, balloons drift towards a nearby open hand, and a friend's basket comes with its balloons, all of it together. Balloon speed and how many to pop can be set too.
- **Lots to do, and little to listen to.** No game stops for talking. Characters and the coach say one short thing, praise is only now and then, and there's plenty on the screen at once. The hand check takes two seconds, and the countdown about two more.
- **Little films show what to do,** rather than leaving it to words: a hand opening during the hand check, a hand going from side to side to steer, and an open hand popping a balloon.

### The maths challenge in Balloon Pop

It's off unless a grown-up chooses it under **Maths challenge**: adding up to 10, adding and taking away up to 20, or times tables. A question is shown big on the screen, the voice says "Pop the right answer!", and balloons with answers on them come up and wait, for as long as it takes. A child reaching for one answer may have to pass another, so an open hand has to stay on a balloon for about half a second to choose it, with a ring closing around it to show that's happening.

The right answer pops, and the next question comes. The wrong one goes up in smoke and burns the glove: it turns black with soot and can't pop anything until the hand has been held open to cool it, which takes about a second and a half of being open, and a fist doesn't cool it. That makes the penalty the exercise itself. No right answers are taken away. The burn is cartoon soot, and nothing flashes. The summary counts the too-hot balloons as well as the right ones.

**Levels in Balloon Pop.** Level 1 is the game as described above. Each level brings balloons a little faster and a little more often, with more up at once and more of them drifting wide, and every level from 2 brings something new, which stays for the levels after it:

| Level | What's new |
|---|---|
| 2 | **Present balloons.** Popping one drops its present on a little parachute, and catching it gives a sweet. |
| 3 | **The bubble glove.** Now and then a soap bubble floats up with a hand in it. Popping it puts a see-through bubble round the glove for 8 seconds, which pops and catches from further away. |
| 4 | **Star balloons,** which only pop once the open hand has stayed on them for about a third of a second, with a ring closing round them. Each drops a gold star. |
| 5 | **Pairs** tied together, and popping both drops a gem. The game moves to the seaside. |
| 6 | **Friends in baskets:** Giraffe first, then Mochi, Frost and Truffle float up in a basket under three balloons. Each one popped slows the basket, and the third brings it gently down on a parachute, leaving a heart. |
| 7 | **The magnet,** a power-up that draws prizes and nearby balloons to the hand for 8 seconds, and a gentle breeze that pushes every balloon slowly one way and back. |
| 8 | **Rainbow balloons,** whose pop spreads to up to six balloons round them, one after another. The game moves to the Harvest Fair. |
| 9 | **The bluebird,** a power-up that stays by the hand for 8 seconds and pops a balloon near it about once a second. |
| 10 | **Big balloons,** which pop into three ordinary ones that drift apart from where it was. |

Prizes fall slowly, taking about ten seconds to come down the screen, drift towards a hand that's near them, and are caught just by the glove coming within about a palm and a half, open or closed. One that isn't caught fades on the hills, and missing it costs nothing. They're counted on the screen from level 2, and on the finish card by kind. A power-up's bubble pops like a balloon but doesn't count as one, and a ring round the glove shows its time running out. Its time only runs while the hand is open, so resting never wastes it, and the bluebird only pops balloons while the hand is open. The magnet draws a friend's basket in too. Power-ups and friends in baskets only come during play, never behind the title or finish card, and when a game ends the bluebird flies off. The first time each new thing comes along in a game, it has a small label beside it for two seconds, such as "Pop it for a present!", in the language the voice speaks, and nothing new is said aloud. Even at level 10 each balloon is on the screen for three quarters of the time it was at level 1, and no more than twice as many come along a minute, counting the three a big balloon pops into and a basket's balloons. How many to pop, the speed chosen, reach help and the hand stay as a grown-up set them. With the maths challenge on, the balloons with answers are as before, and levels 4 and 8 each add one more answer to choose from, up to five; the new kinds of balloon, the prizes and the power-ups don't come during it, and switching it on stops the bluebird and a rainbow's spreading pop. The cards then only list what comes with it: one more answer where a level really adds one (levels 4 and 8 for adding up to 10, level 4 for the others, as five is the most), and a new place. Nothing new flashes: the bubble is see-through, prizes turn slowly, and the tally only grows a little and settles when a prize lands in it. Measured at levels 1, 6 and 10, with prizes, power-ups, baskets and rainbows on the screen, brightness changed by less than 3.5 out of 255 from one frame to the next. The numbers are in `balloonLevel` in `rules.js`.

### Playing Balloon Pop with friends

Up to 4 children can play one game together, each on their own computer with their own camera, with the same balloons and the same sums, to see who pops the most, or with the maths challenge, who gets the most right.

- **Making and joining:** under **Play with a friend** on the title card, a grown-up presses **Make a game** and tells their friend the 3-letter code, or sends the link. The friend types the code, or opens the link, and is in.
- **Starting:** everyone presses **Let’s pop!**. After the hand check, each waits until everyone is ready, and then all count down together. Whoever made the game can press **Start now**, and anyone can play on their own.
- **The time:** everyone plays for the same time instead of to a goal: a minute for the host's 20 balloons, two for 40 and three for 60. A clock shows what's left.
- **One game for everyone:** the host's game runs the balloons and the sums, and everyone sees the same ones, where they are on the host's screen. Whoever's hand gets to a balloon first has it, and it's gone for everyone: the server decides, as each touch reaches it. Each sum is the same for everyone, and once anyone has the right answer, everyone gets the next. A wrong answer burns only that child's glove, and goes for everyone.
- **Fair for everyone:** with friends, the balloons are plain ones, without the presents, stars and power-ups the levels add, at the host's speed. They come up right across the screen, as each child may play with a different hand, and none drift towards a hand, as reach help would make a balloon one child's before anyone else could get to it.
- **Scores:** everyone's score shows as they play, the most first. The finish card says who came where, and equal scores share a place.
- **Friends' hands:** each friend's glove shows in light grey, with their name over it, where their hand is on their own screen, copying it finger by finger. It's only there to see, and pops nothing.
- **Levels and settings:** a game with friends doesn't move anyone's own level on, and nobody's settings change.

Only the name typed, the character from the other games, the score, where the glove is and which balloons it got to go to friends, and from the host's game, where the balloons are and the sum. Never anything from the camera.

## High Five Racers

A race round a lap with grandstands, a village, a tunnel, a farm, a lake, a forest, Giraffe's family and the Harvest Fair. Giraffe drives unless a grown-up picks someone else under **Who drives**, and other characters from the games drive the other cars. They stay close, so there's always someone to pass, and they ease off on the last stretch.

**High fives.** Giant open hands stand on alternating sides of the road, and the stars lead over to each one. Reaching the hand across moves the car across the road. A big hand goes green once the car is lined up, and only a hand read as open slaps it, for a burst of shapes and a boost. A closed or unreadable hand gets a soft pat and no boost.

**Turbo.** Keeping the hand open fills the turbo meter, in about 4 seconds of driving, and when it's full turbo goes by itself for 3 seconds, with flames, more speed and a wider view. Then the meter fills again. It doesn't matter how wide the hand is, only that it counts as open, so a hand that can't open far gets it as often as any other. Closing the hand pauses it: turbo stops, and nothing that was filled is lost.

**Flying, with the other hand.** Making a fist with the other hand and opening it again makes the car take off, with turbo: about 6 m up and 3 seconds in the air, or a low hop with reduced motion, and "Fly!" pops up. It works any time the car is moving. The fist has to be a real one, in view: a hand cut off by the edge of the picture, too far away or touching the other one doesn't count as a fist. The hand in play still has to be open for the car to go. The flight stays under the banners, footbridges and the tunnel's roof, and flying high over a big hand is neither a high five nor a miss.

**For children with hemiplegia:**

- **How far to reach** can be set, and a side that keeps being missed brings its hands closer, each side on its own. **Car steers itself** still does all of the steering.
- **Resting is always fine.** Closing the hand brings up the brake lights and the car coasts to a stop. Everyone waits, and resting costs no places.
- **The summary counts high fives to each side.**
- **Nothing flashes.** Measured at levels 1, 6 and 10 through slaps, turbo, the tunnel, a flight and a whole lap, and through the sunset, the shower, the power-ups and the giant high ten, brightness changed by less than 5% from one frame to the next. The tunnel is as bright as outdoors, and anything repeating along the road goes past fewer than three times a second.
- **On a slow computer** it gives up sharpness, then shadows, then flowers and grass, then bushes, rocks, distant things and half the crowd.

**Turbo and flying are shown, not said.** The meter shows an open hand and "Keep your hand open!", and "Turbo!" with flames when it's on. Each time turbo runs out, a little film by the meter shows the other hand, on its own side as in a mirror, making a fist and opening, and the car taking off: the first three times each race, and after that only until the car has flown.

**Levels.** Level 1 is the race described above. Level by level the other cars race a little harder, and every level from 2 brings something new, which stays for the levels after it:

| Level | What's new |
|---|---|
| 2 | **Coins.** A big hand slapped, a car passed and the tractor passed each spill a few coins onto the road ahead, which drift over to the car. |
| 3 | **The magnet,** a power-up on a trail of stars, which for 7 seconds pulls in the stars and coins a little way ahead from right across the road. **Two big hands in a row** on one side. |
| 4 | **A tractor** comes out of the farm and trundles along the shoulder, off the road, on the side away from the next big hand, so nothing can run into it. The farmer waves, and passing it brings coins. **A fourth car.** |
| 5 | **A sunset,** which comes on slowly from about a quarter of the way through the race, changing the colours rather than how bright it is. **The others use turbo** now and then, one at a time, and the child passes them back. |
| 6 | **The bubble,** a power-up the other cars bounce softly off for 8 seconds, though two cars still never go through each other. **A ramp to one side** of the road that jumps straight into a high five. |
| 7 | **A hot-air balloon** lets a gem down onto a trail of stars, worth five coins. **A slalom** of big hands through the village. |
| 8 | **A treasure chest** at the roadside, opened by reaching over to it like a big hand, worth ten coins. **Closer hands,** a power-up that brings the big hands in to 60% of the reach for 10 seconds. **A fifth car.** |
| 9 | **A light shower** over the lake, with a rainbow after it, and **the rainbow trail,** a power-up that makes each star count twice for 8 seconds. |
| 10 | **The golden lap:** the last lap's stars turn gold and each counts twice. **A giant high ten** stands at the finish line, worth ten coins to an open hand. |

Coins are counted at the top from level 2, and on the finish card with any gems, chests and the high ten. However many spill out at once, each lands at least 14 m past the last, so fewer than three are picked up a second. Missing one, or a power-up or a prize, costs nothing. Power-ups only run down while the hand is open, like turbo, so resting never wastes one, and a hand check in the middle of a race takes nothing away. A side's reach only eases by how far over the car really was, so a high five that came with closer hands doesn't make that side harder afterwards. The first time each new thing comes into sight, a small label goes up beside it for about three seconds, in the language the voice speaks, clear of the camera's picture and the prompt, and nothing new is said aloud. A label that couldn't be seen comes again later. The giant hands start fading in 260 m ahead and stand right at the finish, so the camera following the car never comes near them, and they aren't in the view of the finish. The rainbow trail is a few little rainbows a second that fade before they reach the camera, with none at all with reduced motion. At level 10 there are 19 big hands a lap instead of 13, but two on opposite sides are never less than 62 m apart, which leaves at least 70% of the time to get across. The car's speed, the laps, how far to reach, steering help and the hand never change with the level. The others still ease off at the end so the child wins, nobody uses turbo while a child rests, and while the car flies, the others make room at the edges of the road. The numbers are in `racePlan` in `rules.js`.

**Racing friends.** Up to 4 children can race each other, each on their own computer with their own camera.

- **Making a race:** a grown-up presses **Race a friend** on the title card, then **Make a race**, and tells their friend its code, 3 letters and numbers, or sends the link. A new race never gets a code that's in use: the server says so, and the game picks another. While making or joining a race, the title card shows only that, over the game dimmed and blurred, and **Let’s race!** comes under who's here. A name can be typed there too, if they'd like one, and it's remembered. **Back** goes back to the usual title card. It's the same in Sky Wings, Balloon Pop, Mighty Moves, Bounce Back and Giraffe's Maze.
- **Joining:** the friend opens the link, or presses **Race a friend** and types the code, which joins as soon as it's typed. Links with the 6-letter codes from before still work.
- **Starting:** everyone presses **Let’s race!**. After the hand check, each waits on the grid until everyone is ready, and then all count down together. Whoever made the race can press **Start now** instead, and anyone can choose to race on their own.
- **The course** is the host's: their level and race length. Friends' cars take the place of the other cars, with each friend's name over theirs. A friend's car close to the child's is shown a little to one side, as the other cars keep out of the way, so it never sits in front of the camera.
- **The finish card** says who came where, and fills in as the others get there.
- **Levels and settings:** a race with friends doesn't move anyone's own level on, and every setting a grown-up chose for the hand stays as it was.

**What's sent, and where.** Nothing is sent unless a grown-up makes or joins a race. Then the game sends the name typed, who drives, the host's level and race length, and where the car is on the road 10 times a second: how far along and across, its speed, and whether it's in the air or on turbo. Nothing from the camera is ever sent. It all goes through a small server on Cloudflare ([server/](server/)), which passes it straight on to the others in the race and keeps nothing once they've gone. The code in a link comes after `#`, which browsers don't send to the web server the games come from.

**How it works.** Each race is one Durable Object on Cloudflare, named by its code, and each player keeps one WebSocket open to it. Each game drives its own car and shows the others' cars 120 ms behind what they last sent, so they move smoothly between messages. A connection that drops comes back by itself as the same player, trying again every few seconds for as long as it takes, and straight away when the wifi comes back or the laptop wakes up. Meanwhile the game stays with friends and says "Reconnecting…": pressing **Race again** then waits for the connection rather than racing alone, and being ready, or a finish, is said again once it's back. During a race the game checks the connection every 2 seconds and starts a new one if nothing has come back for 6, and between races every 10 seconds, and within 4 seconds of being ready or finishing. Someone back within two minutes, or after reloading the page, keeps their car, their race and hosting: the server keeps who has just gone even while it sleeps. A connection that has said nothing for a minute and a half has died without closing, and gives up its place to someone coming back. A code with no game behind it is told so, rather than waiting alone. The same rules run on this computer in [tools/race-server.mjs](tools/race-server.mjs) for the tests, and the other games with friends use the same server, with rooms of their own. To put the server online, run `npx wrangler login` once, then `npx wrangler deploy --config server/wrangler.jsonc`. It's served at `hemi-race.infoicy.com`.

## Mighty Moves

The coach calls one concrete move at a time, and the child's own character shows it in a looping film beside the fight, as a word or a still picture is hard to copy. Doing that move makes a big fighting move, and those are what win a round.

**The fighter is the child.** Whenever the camera can see them, the child's fighter copies them: their arms and hands, open or closed, how they lean and turn, how far they sink, their legs and their jumps. Raising the hands raises the fighter's, whatever the coach has asked for. Each big move then starts from just where the child is when the camera sees it, and carries on the way their own movement went: a squat sinks deeper and slams both palms on the floor, a jump keeps going up and over, a clap pushes out with the hands still together, and a toe touch sweeps both hands along the floor at the other fighter's feet. The child's lean and turn are copied at a little over half, as the camera is least sure of those.

Before a fight, the game checks it can see all of the child, from about 2 to 3 metres away, and says what to do if it can't. If they step out of the picture, everything waits.

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
- **Resting is always fine.** Against the computer, a child standing still is never hit. The coach waits, and the computer waves until they carry on. Against a friend, the friend's moves still land, as a friend's car keeps going in a race.
- **On *Gentle*, the default,** the computer gives four seconds' warning and can't knock a child out.
- **Nothing flashes.** Measured through big hits, brightness changed by less than 2% from one frame to the next. Fighters get dizzy rather than hurt.

**The fighters** are ten original characters in [core/body/roster.js](core/body/roster.js), each with their own voice and finishing move, built from simple shapes in [characters.js](core/body/characters.js). All ten share one skeleton, so any move works on any of them. To add one, add an entry to the roster with its colours and a `dress` function, and its lines to [core/body/voice/lines.json](core/body/voice/lines.json) and [the game's own](games/mighty-moves/audio/voice/lines.json). To add a film of a move, add it to [core/body/demos.js](core/body/demos.js).

**Fighting a friend.** Two children can fight each other, each on their own computer with their own camera.

- **Making a fight:** a grown-up presses **Fight a friend** on the title card, then **Make a fight**, and tells their friend the 3-letter code, or sends the link. The friend types the code, or opens the link, and is in. A fight holds two.
- **Starting:** each chooses their own fighter, and sees the other's as their opponent, then presses **Fight!**. After the body check, each waits until the other is ready, and then both start together, on the host's level and number of rounds.
- **The fight:** each child's coach asks them for their own moves, with their own settings. Every big move a child makes lands on their friend's fighter, on both screens, with the friend's fighter making the friend's moves and its name over it. There are no computer's turns, and every big move lands, as the child did what was asked. A round is whoever knocks the other out first.
- **Fair on both computers:** what a move does is worked out on the computer of the child who made it, and sent with it, so both screens show the same health. Each move also carries all that child's moves have done that round, so one missed while the connection was down is made up by the next. A knockout is checked with the server, so if both happen at once, the round is whoever's got there first. Gems, the shield bubble and the champion's trophy don't come in a fight with a friend, as they're about the computer's moves.
- **A friend who goes** in the middle leaves the fight to the one still there.
- **Levels and settings:** a fight with a friend doesn't move anyone's own level on, and nobody's settings change.

**What's sent.** Only the name typed, which fighter, the host's level and number of rounds, each of the fighter's moves (which one, how much it does, and whether it's a small hit or the finishing move), and, 10 times a second, the 21 numbers the fighter copies: where the hands and feet are, how far the hips sink, how the body leans, and whether each hand is open. That's how the friend's fighter copies the friend on the other screen. Nothing from the camera is ever sent. It goes through the same server as racing friends ([server/](server/)), whose fight rooms hold two. The rules in [fight.js](games/mighty-moves/fight.js) have no screen or camera in them: against a friend, the other corner is driven by the friend's moves as they come in, through the same `perform()` the coach uses for the computer.

**Levels.** Levels go from 1 to 10, one fight each, and winning a fight moves on a level, while losing one stays. The computer's strength stays the grown-ups' choice: a level never makes it hit harder, and on Gentle it still can't knock a child out. Higher levels bring its turns a little more often, with a warning down to 80% as long, and a shorter pause between moves, and from levels 4 and 7 it has more moves. Every level from 2 also brings something new, which stays for the levels after it:

| Level | What's new |
|---|---|
| 2 | **Coins:** one for each big move that lands, and three for the fighter's own finishing move or a team move. |
| 3 | **Leaning** out of the way joins blocking, a **gem** for each time the child gets out of the way, and a **sunset**. On Medium and Tough the computer asks for leaning from level 1, so for them it isn't new. |
| 4 | **The shield bubble**, a power-up after every four big moves that land, which catches the computer's next hit that would have landed. |
| 5 | Some of the computer's turns are **two hits** in a row, one to block and one to lean from, each with its own warning, and a **medal** for each round won. |
| 6 | The computer **swings high**, to duck under with a squat, the coach's moves come in a **mixed-up order** with the two parts of a combo still together, and it's **autumn**. |
| 7 | Some moves are asked for **twice**, with a dot on the coach's card for each, and the fighter's move is stronger for it. Jumps, high knees and reaching up never are. **The super glow** makes the next two big moves stronger and fills the power bar twice as fast. |
| 8 | The computer throws **a soft ball**, caught with a clap and thrown back. |
| 9 | **A helper friend** joins in with one big move, a team move worth three coins, and it **snows**. |
| 10 | The opponent is **the champion**, crowned and a little bigger, whose turns can be any way out rather than taking turns, and beating it wins **the trophy**. |

The way out of the way a level brings is the computer's first turn in a fight at that level, and the newest power-up the first to come, so a short fight, or a quick child, still meets them. A duck or a catch missed while the child is moving is put aside for the rest of that fight, so a child who can't do it isn't hit for it again and again, and neither the high swing nor the ball hits harder than the computer's lightest move. Ducking eases as the squat that's asked for does: over the ducks in a fight, what counts comes down to just below the child's best. A ball caught at the last moment is still held a moment before it's thrown back. Power-ups last until they're used, so resting never loses one, and any left at the end of a fight fade away. Prizes are collected by themselves, and missing one costs nothing. The first time each new thing turns up in a fight, a small label names it for a moment, and nothing new is said aloud. A child standing still is never hit at any level. The numbers are in `fightLevel` in `moves.js`.

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
- **Nothing flashes.** Measured through jumps, landings and a long dash, at level 1 and level 10, brightness changed by less than 3% from one frame to the next. At levels 6 and 10 with every new thing on screen, through a bounce, a bubble popping and a chest, it changed by at most 4.7 out of 255, and things missed and left behind never come within 2 metres of the camera.

**Levels.** Each level is a little harder than the last, always from the pace a grown-up chose: a little faster, obstacles a little closer, and the stretch where a jump counts down to 85% of what it was. Higher levels also have more obstacles that fill one or two lanes, with the free lane switching sides, and lines of stars change lanes more often. Every level from 2 also brings something new, which stays for the levels after it:

| Level | What's new |
|---|---|
| 2 | **Coins.** Clearing an obstacle, by jumping it or by stepping round it, drops a coin, which flies to the runner by itself. |
| 3 | **Golden stars** hang over some obstacles in one lane, caught by jumping over in that lane. |
| 4 | **Fences**, and **trampolines**: in front of some obstacles one lane is a blue mat, and jumping from it bounces high, through an arch of stars. From another lane it's an ordinary jump. |
| 5 | **The magnet**, a power-up that pulls stars in from every lane for 6 seconds of running, and **lines of stars that cross a lane** halfway along. |
| 6 | **Round bales** that roll in and stop before the painted stretch, and **the bubble shield**: for 15 seconds of running, the next obstacle the runner would run into, it floats over instead, keeping the streak. A jump just as it starts to float still counts as the child's own, and the bubble is kept. |
| 7 | **Ducks:** a duck and her ducklings waddle over into their lane and settle before the painted stretch, and waddle off out of the way if the runner comes on without jumping. It's **autumn**, with a few leaves falling. |
| 8 | **Sheep**, a flock crossing the trail, and **a key** on the line of stars, which opens **a chest** of coins beside the trail a few obstacles later. |
| 9 | **A running friend**, a power-up: Giraffe, or Truffle when Giraffe is running, runs alongside for 10 seconds and catches a star for every star caught. |
| 10 | **An autumn sunset**, and **a gem** at the top of each trampoline's arch. |

What a level brings comes at least once on every trail, however short. Power-ups only run down while the runner is going, so resting, or waiting for a move, never uses them up, and a missed star, coin, power-up, key or chest costs nothing. The first time each new thing comes into view in a run, a small label at the top names it for a moment, in the language the voice speaks, and it waits while the grown-ups' panel is open; nothing new is said aloud. With **Moving from side to side** turned off there's no magnet and no lines crossing lanes, as both are about the lanes, so level 5 brings nothing new, and with the runner set to stop and wait there's no bubble shield, as it never runs into anything. The title card only says what the settings really bring. Anything left behind on the trail, such as a missed trampoline's arch, a golden star or a power-up, and the falling leaves, fades before it gets near the camera. Choosing a runner and practising are always on a summer's day. With reduced motion, no leaves fall, the ducks don't waddle, and a bounce lifts the camera no more than a jump does. Finishing a run moves on a level, as nobody loses one. The numbers are in `trailLevel` in `run.js`.

## Sky Wings

The child's two arms are the wings of a toy plane, sitting or standing, and it's real flying in all three directions. Tipping the arms banks the plane, which turns it, and raising or lowering both puts its nose up or down. The camera goes with the plane, so the whole island tips and moves as it does. The island has a smoking volcano, a town with a giant statue of Giraffe, a castle, a fair with a big wheel, farms and windmills, a harbour, lighthouses, ships at sea, hot-air balloons and thousands of trees.

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
- **Nothing flashes,** and the picture's brightness is tested through firing, drops and flying right through a cloud, which fades as the plane reaches it. A shot stopped by the shield changes the brightness by under 0.1 out of 255, and flying straight through snow, no part of the picture changes by more than 1.6. There's no muzzle flash and no explosion, only small sparks and soft grey smoke.

This game doesn't read the hand at all, as the guns fire by themselves, so it doesn't practise opening the hand. It's all about the shoulders and both arms.

**Flying with friends.** Up to 4 children can fly together, each on their own computer with their own camera, the same way friends race in High Five Racers.

- **Making and joining:** under **Fly with a friend** on the title card, a grown-up presses **Make a flight** and tells their friend the 3-letter code, or sends the link. The friend types the code, or opens the link, and is in.
- **Starting:** everyone chooses a pilot and presses **Let’s fly!**. After the body check and the lesson, each waits until everyone is ready, and then all count down together, side by side. Whoever made the flight can press **Start now**, and anyone can fly on their own.
- **In the sky:** everyone flies the host's level and number of planes. Each child sees the others' planes where they really are, with a face and a name over each, and a friend's plane fires at the pirates in front of it, like the friend who helps. Each child has their own pirates, so friends help each other rather than taking each other's. A friend's character is never one of the pirates too.
- **The finish card** says how everyone did: all dropped, and how fast, or how many.
- **Levels and settings:** a flight with friends doesn't move anyone's own level on, and every setting a grown-up chose stays as it was.

Only the name typed, the pilot chosen and where the plane is, 10 times a second, go to friends, never anything from the camera.

**Levels.** Dropping every plane moves on a level, and being shot down, on Medium or Tough, stays. A level never changes the ring's size, the help with lining up, how hard the pirates shoot, Gentle's hearts or flying up and down by itself. Higher levels make the pirates a little faster and sharper in the turn, but never as fast as the child's plane, and they hunt the child a little more often and dodge for longer when hit. Being hunted gives as long to turn as ever. Every level from 2 also brings something new, which stays for the levels after it:

| Level | What's new |
|---|---|
| 2 | **Gold coins:** every pirate dropped leaves a prize, which flies to the child's plane by itself. |
| 3 | The pirates **weave** from side to side as they cross, and **gift boxes** float out in front: flying through one gives a power for a few seconds, the first being **the triple shot**, three at a time in a fan. |
| 4 | **Scouts:** small quick planes that zigzag, take fewer hits and leave a **gem**. |
| 5 | The pirates climb and dive more, **higher and lower**, and **the bubble shot** wraps a pirate up, so it floats gently down. |
| 6 | **Balloon pirates**, which drift slowly, high up, and never hunt or shoot, and a **sunset**. |
| 7 | **The snowflake shot**, which slows a pirate right down for a while, and **the shield bubble**, which the pirates' shots bounce off. |
| 8 | The last pirate is **the captain**, a bigger plane with a flag that takes more hits and leaves a medal, and pirates come in **pairs**, a leader and a wingman flying side by side. |
| 9 | **Four in the air at once**, with 6 or 9 planes to drop, **a friend who helps**, flying alongside and firing at the pirates ahead (Giraffe, or someone who isn't one of the pirates when the child flies as Giraffe), and **light snow**. |
| 10 | **The treasure airship**, just before the captain: big and slow, it takes twice the hits, never shoots and leaves a treasure chest. And **paper planes**, which find their own way to a pirate. |

The first gift box at a level holds its new power, and then they take turns. With fewer planes to drop, the kinds of pirate a level brings come first, so they still come: with three at level 8, it's a pair and the captain. The title card only says what the number of planes chosen really brings, so with three there's no "four at once". A wingman whose leader is already near comes from the distance, like any pirate, and flies over to join it. A power lasts a few seconds of flying: resting doesn't use it up, and nothing fires while resting. However a flight ends, won or lost, prizes still on their way are counted, and a power, the friend and any gift box end with it. Missing a gift box costs nothing. A balloon or the airship that's dropped comes down gently with its pilot aboard; only a plane's pilot comes down by parachute. Nothing new flashes: a shot stopped by the shield is a few small sparkles that go along with the plane, and snowflakes are soft dots a few pixels across, however near the plane flies. The numbers are in `flightLevel` in `flight.js`.

## Robot Rescue

The hand is the aim, like an arcade light gun, so small movements cover the screen. An open hand fires by itself at whatever is in the crosshair, and a closed hand raises a shield and reloads. That makes one hand do two things, and a natural open and close builds up, with closing useful rather than a mistake. The tram does all the moving, from place to place, so there's no steering to do while aiming. Each place has a friend in a cage, freed by dealing with the robots there, and the last has a big robot whose weak spots open one at a time. A little film shows what to do until the child has fired and closed.

**For children with hemiplegia:**

- **Precision doesn't decide it.** Hand wobble is steadied, and the crosshair is pulled onto the nearest robot. **Reach help** sets how strongly. Even the least of it is generous.
- **Only what's read as open fires, and only what's read as closed raises the shield.** A hand that's gone, half out of the picture, too far away or overlapping the other does neither, and the crosshair shows a question mark.
- **Reloading can be turned off,** for a child who can't close their hand easily. If it's on, an empty blaster still fills itself after about 6 seconds, so nobody is stuck.
- **Resting is always fine.** With the hand gone or closed for 4 seconds, the robots stop throwing and wave, and any goo in the air goes.
- **On Gentle, the default, a child can't lose.** Hearts stop at one, and goo takes over 3 seconds to arrive. At the first stop nothing is thrown until a robot has been dropped, or 14 seconds have gone by. On the harder settings, running out of hearts ends it with "So close!", counts the robots dropped, and they can go again straight away.
- **Nothing flashes.** There's no muzzle flash and nothing lights up. The flicker check samples the picture at 576 points, so anything small and bold crossing the same points over and over counts, and a lot was calmed for it, at every level: a hit is a small drop of paint now and then, and the robot reels back a little rather than shaking; balls of paint are a little see-through, with soft edges, and the bolder kinds of fire from power-ups come less often than paint; the blaster sits back while it fires rather than kicking with every shot; robots fall apart with a short, slow tumble, the small bits shrinking away where they are, each from its own size; walkers step and bob more gently, a hopping robot's spring bounces slowly, drone rotors turn slowly, and the crosshair's marks turn slowly while it fires. The crosshair glides onto the next robot rather than jumping, keeps its firing look while it does, and doesn't bob with a hopping robot. Prizes fly up to their own count at the top rather than into the crosshair, the name of something new stays where it came up, a lid tips back while it's bonked rather than wobbling, the shield bubble from a power-up is a thin soap-bubble rim, a bubble round a trapped robot fades in and out, and goo leaves only a few drips behind it, with the dashes of its warning ring going round slowly. The shield is see-through and rises and falls at a steady rate, so a quick open and close can't flicker it. Measured with the crosshair and shield included, at level 1, at level 10, and at levels 6 and 10 with each new kind of fire among the new kinds of robot, brightness changed by less than 1% from one frame to the next, and at most about 2% of the picture flickered, all of it where robots were being hit. A haze softens the sides of the view while the tram moves, as walls going past were the one thing that flickered.

**Levels.** Each level makes walkers a little quicker and keener to move on, and peekers pop down sooner. Goo comes more often and a little faster, though never in under 2 seconds. From level 6 one more robot is out at once and one more blob of goo can be in the air, and from level 7 some robots throw a second blob straight after the first. On top of that, every level from 2 brings something new to see and play with. It's named on the title card and under the countdown, and the first time one is seen in a game, once "GO!" has gone, its name comes up over it for a moment, with nothing said. If it goes before its name can come up, the next one of its kind gets the name.

- **Level 2:** robots that fall apart leave bolts, which fly up by themselves to where they're counted at the top, and onto the finish card. Every eighth robot, from the second, leaves a power-up in a glass ball, which flies up to its own place among the power-ups at the top, shown faintly there until it arrives. The first is the triple shot: three balls at once, the other two going for whatever's near, or just the one when nothing is.
- **Level 3:** drones swoop down towards the tram and back up, and lid robots hold up a round tin lid that shots bonk off. They lower it to walk or to throw, and after eight bonks it falls off anyway.
- **Level 4:** peekers spring through the air from one cover to the next, and the bubble shot traps a robot in a floating bubble for 4 seconds, where it can't move or throw and every hit counts twice. When the bubble goes, it carries on from where it was.
- **Level 5:** robots on one big wheel roll from spot to spot and never throw. At each stop a golden robot carries the key to a treasure chest beside the cage: when it falls apart the key flies over, and that stop's chest opens with gems and stars, even if the tram is already setting off. Bigger robots leave a gem too.
- **Level 6:** a green robot with a zip down its front comes apart into two little ones, which never throw, and the shield bubble stops goo by itself, with the hand open, though it doesn't count as the child's own shield.
- **Level 7:** the boing ball, big and slow, does twice as much and bounces on to the next robot. A power-up can be a heart, but only once one has been lost: if its turn comes while every heart is there, it waits, and comes with the first power-up after one has gone.
- **Level 8:** the big one steps from side to side, and the ride goes on into a warm sunset that's just as bright. Paper planes find a robot in view by themselves, even with nothing in the crosshair, and fly round a lid. The magnet pulls a bolt out of a robot now and then as it's hit.
- **Level 9:** at each stop a drone carries one of the other friends in a little cage. Dropping it lets the cage float down under a parachute, onto the street, or onto the water beside the canal's bridge, and the friend is counted. Slow motion makes the robots and their goo go at about half speed.
- **Level 10:** the big one is the robot king, with a crown, gold on his shoulders, a medal and a cape. A piece comes off with each weak spot, and he leaves his treasure of gold stars.

Power-ups last 6 to 8 seconds, with a bar running down at the top, and wait while the child rests and between stops. The kinds of fire change what comes out of the blaster, never how it's fired: an open hand on something. Prizes and power-ups always come over by themselves, each to its own counter, so nothing can be missed. Whatever's still on its way when the tram moves on carries on over and is counted when it gets there, and whatever's still on its way at the end is counted too. On Medium or Tough, once the last heart has gone, a heart on its way doesn't bring one back. The new kinds of robot take the place of walkers and of one drone, and there's one golden robot more at each stop. There are more robots to deal with level by level, so at level 10 a game lasts about a sixth longer than at level 1, or a quarter on Fast, with about as many movements a minute. Swoops, hops, rollers and the drone with a friend are kept slow, so the crosshair, which goes with whatever it's on, doesn't dart about. The speed, Reach help, Reloading, How hard and the number of stops stay as a grown-up set them, and Gentle still can't be lost. Running out of hearts on Medium or Tough tries the same level again. The numbers are in `levelPlan` and `NEWS` in `rescue.js`.

## Tank Patrol

The camera stays still, high over one toy valley that fits on the screen, so the hand always points at the same place on the ground. That's what makes one hand enough. It uses the same hand tracking as Balloon Pop, so it starts with the hand check and can be played sitting close to the camera. Right-handed unless a grown-up picks the left.

- **A closed hand drives.** The crosshair becomes a yellow marker lying on the ground, and the tank rolls to it, finding its way round what's in the way and over the bridges, with dots showing the way.
- **An open hand fires.** The crosshair becomes a ring standing up, the turret swings to it, and the gun fires by itself at any robot tank under it, turning green. There's nothing to press. **Reach help** says how strongly the ring is pulled onto a tank near it.
- **The gun has a range,** shown by a ring on the ground. A tank out of range turns the crosshair orange and dashed, with a closed hand in it. Robot tanks keep just out of range, so closing to drive nearer and opening to fire is how it's won.

**Nobody gets hurt.** Targets are robot tanks, a few at a time, with more as others are stopped. They never explode: a stopped tank rattles to a halt in soft grey smoke, bolts and stars, its little crew climbs out and waves, and it fades. A splitting tank comes apart in soft smoke into two little ones, and the boss's cannons tip over and shrink away.

**Shells are slow and can be seen coming,** with a ring on the ground filling in where one will land, so there's time to drive away. A hit costs a heart, and hearts come back with time.

**For children with hemiplegia:**

- **Anything uncertain does nothing.** A hand that's missing, off the edge or can't be read neither fires nor drives, and it has to stay closed for a moment before the tank moves.
- **Driving** can be set to **By itself**, for a child who can't close easily: an open hand on a tank out of range drives nearer, and the tank gets out from under shells itself.
- **On Gentle, the default,** shells are slow and hearts stop at one. On Medium and Tough, running out ends it with "So close!", and they can go again straight away.
- **Resting is always fine.** With the hand gone for 3 seconds, or nothing changing for 5, the robots stop and wait, whatever was coming goes up in a puff, and nothing bad happens.
- **A little film** shows a hand closing to drive and opening to fire, until the child has done both, and comes back if nothing has happened for a while.
- **Nothing flashes.** There's no muzzle flash and no explosion, and the picture's brightness is tested through firing, stops and shells landing. At levels 6 and 10 it's also tested with every new kind of robot tank about, every new kind of fire flying, and prizes and crates rolling over, and it changed by less than 1 out of 255 from one frame to the next. Prizes, crates and names fade in and out slowly, and a bubble shrinks away rather than popping.

**Levels.** Each level makes the robot tanks a little quicker, keener to move on and keep further off, and shells come more often and a little faster, never under 80% as long. On top of that, every level from 2 brings something new to see and play with. The first time each new thing turns up in a game, once "GO!" has gone, its name floats over it for a moment, one at a time, with nothing new said, and if it goes before its name can come up, the next one of its kind gets the name. From level 2 a stopped tank drops bolts, which bounce where they fell and then roll over to the child's tank by themselves. They're counted on a chip at the top and on the finish card. From level 3 every other tank stopped leaves a crate with a power-up in it, that level's new one first. It drifts slowly over, and comes at once if the tank drives near it or the hand points at it: at level 3 it's a triple shot, three balls at once for 10 seconds, the side ones going for any other tank near the one aimed at. Scouts dash from place to place from level 3, and one more tank is about. From level 4 shield tanks come in, with a big round shield that turns slowly to face the child's tank, more slowly than the tank can drive round it. Shots at the front bounce off with a bonk and a few stars, so driving round to the side gets past it, and after four bonks the shield gets tired and folds down anyway. Tanks come in pairs from level 4. From level 5 a crate can hold bubble shots, slow see-through balls that trap a robot tank in a floating bubble for 4 seconds, where it can't move or lob and every hit counts twice, and bigger tanks drop a gem as well. Shells allow for the tank driving along from level 5. From level 6 the robots have put a friend from the other games in a cage, which the gun fires at like a tank: five hits sink its bars into the ground, and the friend jumps for joy, hops over and climbs aboard. That's counted too, and the robots let a friend go at the end anyway. Robot tanks go round the cage, as they do a house, and never stop in it. A tank that's taken half its hits runs off, once, from level 6. From level 7 digger tanks sink into the ground, go along under it as a heap of earth that can't be fired at, and come up again nearer, within reach of the gun, up to three times each, and a crate can hold a heart, but only once one has been lost: if its turn comes while every heart is there, it waits for the first crate after one has gone. Heavy tanks lob two shells at once from level 7. From level 8 the patrol goes on into a warm sunset, just as bright as the day, and a crate can hold a boing ball, a big slow ball that bounces on to two more tanks near the one it hits, or a magnet, which brings every prize and crate over at once. Two more tanks are about from level 8. From level 9 splitting tanks come apart, in soft smoke, into two little ones, and count as stopped once both are, and a crate can hold slow motion, which slows the robot tanks to just over half their speed and their shells to 60%, for 8 seconds. Bashers lob two shells too from level 9. At level 10 the last tank is the big boss, gold, with two big side cannons and a crown. It loses one cannon and then the other with each third of its hits, and its crown last, dropping bolts and a crate each time, and it leaves a treasure chest that opens into gold stars. The new kinds of tank take the place of others, so there are as many tanks as a grown-up chose. Power-ups, crates and bubbles wait while the child rests, and diggers stay where they are. Missing a prize or a crate costs nothing, and whatever's still on its way at the end is counted, while a shot still in the air when the round is over lands on nothing. On Medium or Tough, once the last heart has gone, a heart crate doesn't bring one back. Even at level 10 a game lasts at most about a sixth longer than at level 1, with at most a fifth more movements a minute, and there's still at least 80% of the time to get out from under a shell. Driving by itself still chases a tank that runs off or pops up, and gets out from under both shells. The speed, Reach help, Driving, How hard and the number of tanks stay as a grown-up set them, and Gentle still can't be lost. Running out of hearts on Medium or Tough tries the same level again. The numbers are in `levelPlan` and `NEWS` in `patrol.js`.

## Cannon Bay

Pirates have come for the island's treasure, and Captain Giraffe, with his long neck above the rail, asks the child to drive them off. It's the island from Sky Wings seen from the sea, from behind and a little above the ship.

**One hand does everything.** Moving it from side to side turns the ship's wheel, shown big on the screen. An open hand raises the sails, and the ship goes faster the wider it's open. A closed hand lowers them and the ship slows and drifts, which is never a failure.

**The cannons fire by themselves** at any pirate ship in a firing zone. There's one zone on each side of the ship, drawn on the water, and each glows green while its cannons fire. They only fire with the hand seen to be open. Under **Cannons**, a grown-up can have them fire with a closed hand too, as long as the hand can be seen. A hand that's missing, half out of the picture or can't be read never fires.

**The pirates** are the other nine characters, each with their own ship. There are three at a time, with another along about a second after one is beaten. They come alongside and fire slow cannonballs in high arcs, with a ring on the water showing where each will land. Being hit costs a heart, and hearts come back. Arrows at the edge of the screen say which way to steer for a ship out of sight.

**Nobody gets hurt.** Nothing explodes. A beaten ship lowers its sails and slowly sinks in soft grey smoke, its crew rows away waving, and it leaves a line of gold to sail through. Missing the gold costs nothing. A barrel raft has nobody on it, so it just comes apart, and nobody rows away from it.

**For children with hemiplegia:**

- **Steering is measured from where the hand starts,** and the ship helps keep a nearby pirate alongside. How much depends on **How hard**.
- **On Gentle, the default,** the zones are big and the ship can't be sunk: hearts stop at one. On harder settings, running out of hearts ends the battle with "So close!" and a way to go again straight away.
- **Resting is always fine.** After 4 seconds with the hand closed or gone, the pirates stop firing and sail in circles, and whatever's in the air lands harmlessly.
- **The ship can't hit anything.** It's steered gently round the coast and turned back at the edge of the world, and ships slide past each other.
- **A little film** shows the sails and the wheel until the child has done each, and comes back if they seem stuck.
- **Nothing flashes.** There are no muzzle flashes, only soft smoke and small shapes. Measured through firing, splashes and sinking, brightness changed by less than 2 out of 255 from one frame to the next.

**Levels.** Each level has pirates reload quicker and fire closer together, and sail a little faster when chasing or running. They stay alongside for less long, though never under three quarters as long, and run for it more often when hit. From level 3 a pirate running for it zigzags, from level 6 there are four pirates at once instead of three, and from level 7 each broadside has one more ball. The cannonballs fly just as slowly as ever. On top of that, every level from 2 brings something new to see and play with, named on the title card and under the countdown. The first time each is seen in a battle at the level that brings it, once "GO!" has gone, a little label with its name comes up over it for a moment, in the language the voice speaks.

- **Level 2:** beaten ships drop gems, which float over to the ship, and a power-up: the triple shot, three balls at once side by side.
- **Level 3:** a pirate tows a sailor in a cage, who floats free when it's beaten and is rescued by sailing near, and some ships drop a heart, which can take the hearts two over the usual five.
- **Level 4:** barrel rafts, with nobody on them, come apart into two little rafts that never fire, and both have to be beaten too. The shield bubble makes balls bounce off the ship.
- **Level 5:** quick little sloops, which take fewer hits, and the bubble shot, which traps a ship in a bubble for a moment, where it stops and can't fire.
- **Level 6:** a pirate carries a key, shown over its mark. It's always a plain ship or a sloop, and never the last. Picking the key up brings up a treasure chest out in front, to sail to, which opens for six gems and a power-up. The magnet brings prizes and gold over from far away.
- **Level 7:** smoke ships hide in a puff of their own smoke when hit, twice, slip away, and can't be fired at for a moment, in a light sea mist.
- **Level 8:** submarines dive and come up again beside the child, and can't be fired at under the water. The bouncing ball goes on to the next ship near enough, once.
- **Level 9:** the last captain sails a big flagship, and the snow shot slows a ship down, with pale sails, and it reloads more slowly.
- **Level 10:** the last is the pirate king's ship, whose four sails come down one at a time as it's hit, at sunset, with the light just as bright.

The new kinds of ship take turns with plain ones, the newest first, so there are as many ships as a grown-up chose. Prizes float over to the ship by themselves from near enough, and from far away with the magnet, and are picked up by the hull coming near. A treasure chest has to be sailed to unless the magnet's on, and always comes up in open water well inside the edge of the world. A prize too far away goes after about half a minute, which waits while the child rests, and missing it costs nothing. Whatever's still floating over when the battle ends carries on coming, and what's still on its way when the finish card comes up is counted there, while the rest shrinks away. A power-up lasts 10 seconds, or 12 for the magnet, with a bar running down at the top, and waits while the child rests, as do a snowball's frost and a bubble round a pirate. Once the battle is over, a heart picked up doesn't bring one back. Even at level 10 a battle lasts at most about a tenth longer than at level 1, with at most a fifth more movements a minute. The speed, the firing zones, the help with lining up, Cannons, How hard and the number of ships stay as a grown-up set them, and Gentle still can't be sunk. Being sunk on Medium or Tough tries the same level again. The numbers are in `levelPlan` and `NEWS` in `battle.js`.

## The games with a mission

These three use the same hand tracking as Balloon Pop, so they start with the hand check and can be played sitting close to the camera. Each one is a story, with the characters from the other games asking for help in their own voices, because a hard movement is easier to repeat for someone who needs it.

**Nobody waits for anyone to finish talking.** Each character has one short line, and the action doesn't stop for it: fruit flies from the first moment and all the way through the Smoothie Stand, the first ship is already calling at the Lighthouse, and the fruit is already on Giraffe's first tree. Between customers, ships and stops there's about a second or two at most.

- **Giraffe's Long Walk Home** is about closing a hand, keeping it closed while it moves, and opening it in the right place. Dropping a fruit costs nothing: it just goes back on the tree. **How far to reach** moves the tree closer to Giraffe.
- **Giraffe's Smoothie Stand** is right-handed unless a grown-up picks the left, like all of these. An open hand has to be moving to slice, so that it's a swipe. **How to slice** can make a touch enough, for slow or limited movement. A closed hand only bumps the fruit and is asked to open. Rotten fruit only comes with the last customers, and all it does is make the glove sticky for a moment. There's no way to lose.
- **The Lighthouse Keeper** is about reaching all over a big window with an open hand. Only an open hand wipes, and a closed one is asked to open. **Size of the window** sets how far there is to reach. A window only has to be mostly clean, as the last corners may be out of reach. The storm has no lightning, and the picture brightens slowly as each ship comes home.

**Levels in these three games:**

- **The Lighthouse Keeper:** the storm throws a little more at the window each level, but only while the child is wiping, so resting never brings anything new, and nothing has a time limit. Each level from 2 brings something new and keeps what came before. At level 2 a wave throws mud back onto wiped glass, and shells are hidden in the mud. At 3 a little crab walks back and forth on the glass with a pearl, and lets go of it when an open hand touches it. At 4 seaweed lands on the glass and takes a rub to come off, leaving a shell. At 5 a big lantern makes each wipe bigger for a while, though rubbing goes no slower, and two splats come, sooner and bigger each level. At 6 a smiling starfish creeps about on every other window and leaves a pearl. At 7 it's night, with a moon and stars, and a bubble shield makes splats bounce off. At 8 an oyster opens for a hand held open on it, with a pearl inside. At 9 a gull flies across and wipes a wide stripe, and what the storm throws still lands away from the hand; if the hands are checked again while it flies, it waits. At 10 the last window has a treasure chest full of coins. Things only ever land in the middle of the window, never the corners, and a window isn't clean until what's stuck to it is off. Treasure is picked up by the open hand coming near it, and drifts towards a hand that's close. Nothing on a window is ever missed: when it comes clean, the treasure still on the glass, the shells under the last of the mud and the crabs' pearls all go to the count, and a crab nobody touched walks off the glass. It's shown at the top and on the finish card. Power-ups only count down while an open hand is on the glass. The first time each new thing comes, its name fades in beside it once it can be seen, what's new at this level first; a power-up picked up before its name's turn is named beside its badge, and the gull as it flies. The numbers are in `stormAt`, and what's new at each level in `NEW_AT`, in `storm.js`.
- **Giraffe's Long Walk Home:** Giraffe is hungrier at the river from level 2 and at the hill from level 6, and walks a little quicker between trees each level. Each level from 2 brings something new and keeps what came before. At level 2 one fruit on each tree is golden, and feeding it to him is a gift for his family too, whenever it's eaten. At 3 the fruit sways in the wind, and a butterfly sometimes sits on a ripe fruit. That one can't be picked until it flies off, which it does by itself, or when an open hand comes near, leaving a flower. At 4 there's green fruit, which a closed hand only wiggles, and which ripens by itself. At 5 a basket hangs on the second tree, and on the fourth from level 9: closing a hand on it, then opening it and closing it on a fruit, picks two at once. At 6 a cheeky monkey takes a ripe fruit now and then and scampers about the tree with it. Closing a hand on his fruit takes it back and he throws down a coconut, or he gives it back by himself. At 7 the bridge at the river has a plank missing, and carrying the plank from the tree to the gap mends it so Giraffe can cross. A plank dropped anywhere else goes back on the tree, like a fruit. While it's carried, the hint is to bring it to the bridge, and once Giraffe has had enough there, to close a hand on the plank; these two are shown but not said. At 8 the hill is snowy and two of its fruit are frosty: a closed hand held on one warms it, which adds up however the hand comes and goes, and then it can be picked. At 9 it's evening from the hill on, and fireflies drift round the tree, caught by closing a hand on one. At 10 a parrot's feather hangs on the first tree, and closing a hand on it brings the parrot, who carries a fruit to Giraffe by himself. Gifts drift to a hand that's near, any left when Giraffe walks on, or when he gets home, are kept, and they're counted at the top and on the finish card. The finish card counts the fruit the child's own hand fed Giraffe, with each hand and in all; the parrot's isn't the child's. When Giraffe has had enough at a tree, a butterfly on it flies off. There's always a ripe fruit free, and the basket, the feather and the plank hang where fruit would, so there's never further to reach. Nothing has a time limit. The numbers are in `walkAt`, `stopsAt` and `featuresAt`, and what's new at each level in `NEW_AT`, in `journey.js`.
- **Giraffe's Smoothie Stand:** the customers' orders stay the same at every level. On top of the speed a grown-up chose, fruit falls a little faster each level and comes up more often. At level 10 it's still up about 88% as long, and what's on the order comes up at least as often as at level 1. Each level from 2 brings something new and keeps what came before. At level 2 each customer leaves two tip coins, which float up near the hand and only need touching with an open hand. At 3 a golden fruit comes once with each order, worth three coins when sliced. At 4 some fruit is thrown across, always within reach. At 5 a power-up bubble floats up with each order, popped by touching it: first a magnet, which draws coins and what's on the order to the hand. At 6 every other order brings a watermelon instead, which a slice splits into three wedges that float up within reach, each a coin, and a rotten fruit sometimes flies beside a wanted one. At 7 every other customer brings a bee with a pot of honey: touching the bee gets the honey, and everything, fruit, coins, bubbles and the bee, floats at half speed for a while. At 8 some fruit is tough, and the first swipe cracks it. At 9 there's a big glove, which slices from further away. At 10 there's a turbo blender, which counts each fruit on the order twice. Rotten fruit comes with earlier customers as the levels go up, and with everyone from level 8. A power-up only counts down while the hand is open in the picture, and missing a coin or a power-up costs nothing. Coins are counted at the top and on the finish card. There are never more than 12 fruit in the air. The numbers are in `fairAt`, and what's new at each level in `NEW_AT`, in `orders.js`.

## Spider Catcher

The same grasp, carry and let go as Giraffe's Long Walk Home, but what's caught won't keep still. Giraffe's little spider friends have run off all over a sunny garden. They're round and colourful, with big eyes, rosy cheeks, smiles and short soft legs, and nothing pointy. Some scuttle about on smooth looping paths and some swing up and down on threads from a branch. Their web hangs across from where they play, by Giraffe, so bringing one home is a reach across. Each spider home makes its web a little fuller and whiter, and Giraffe claps. There are five places in the garden, each with its own web and a friend who says one short line while the spiders are already out: Giraffe at the gate, Mochi in the carrots, Bramble at the honey tree, Frost by the pond, and Giraffe again at his house. It ends when everyone is home. It uses the same hand tracking as Balloon Pop, so it starts with the hand check and can be played sitting close to the camera.

**Catching.** A hand has to be seen open and then close by a spider, within about a second, so it's a real grasp, and a fist held still can't collect spiders as they go past. Closing anywhere near one is enough, with a circle a little bigger than the palm. The spider stays in the closed hand, peeping out, wherever it goes. Opening the hand over the web lets it in. Opening anywhere else just lets it scurry back to playing, at no cost.

**It fails closed.** Only a hand the tracker is sure of counts as open or closed. A hand at the edge of the picture, too far away or overlapping the other is neither, so it can't catch a spider, and a spider it's holding stays held until the hand can be read again. A hand that leaves the picture lets go, and that never puts a spider in its web.

**The levels** ([games/spider-catcher/spiders.js](games/spider-catcher/spiders.js)). Level 1 has two spiders out at a time, slow, on simple loops, with a still web. After that there are more out at once (three from level 3, four from level 6), they go a little quicker each level, their paths go further and get twistier (figures of eight from level 3, pretzels from level 8), and the swings get longer. Every level from 2 also brings something new, which stays for the levels after it:

| Level | What's new |
|---|---|
| 2 | **Berries.** A spider caught leaves a berry on the leaf where it was, picked up by the hand coming back past it. |
| 3 | **The ladybird** plays at the carrots and the pond instead of one of the spiders, and goes home to her flower in the grass, not the web. While she's carried, the hint says to take her to the flower. |
| 4 | **Sleepy spiders,** which can't be caught until an open hand held by one for a moment wakes it, and then it plays on from where it is, round its own path. One left alone wakes by itself after 12 seconds. The web sways slowly on its branch. |
| 5 | **The butterfly** comes to the gate, the honey tree and Giraffe's house. Touching it sends it round over the garden for 8 seconds of the hand being open, so resting never wastes it, and the spiders slow to under half their speed to watch it. **Shy spiders** scuttle a little way off the first time a hand comes near. |
| 6 | **A basket for two** sits in the grass at each place. Picked up, it lets the hand carry two: opening away from the web pops the first one in the basket, and opening at the web puts both home. With two webs, or the ladybird, opening at one home only lets in what lives there, and the other stays in the basket. |
| 7 | **A treasure chest** at the carrots and the pond, which opens under an open hand held on it, for four berries, and **twins** holding hands. |
| 8 | **Two webs,** a pink one and a blue one, and each spider is the colour of its web. Opening at the other web just lets the spider go back to playing, and its own web glows softly. The webs are spaced so their drop areas don't meet, and the lower one stays clear of the ladybird's flower. |
| 9 | **Leaf boats:** one spider at each place sails along a little stream at the bottom of the garden. |
| 10 | **The golden spider,** one at each place, with a little crown. It's welcome in either web and brings a shower of five berries home with it. |

Berries roll towards a hand that's near them, smoothly, even one held above them, and are picked up by it coming within about a palm and a half, open or closed. Ones that aren't picked up fade when Giraffe moves on, and cost nothing. They're counted on the screen from level 2 and on the finish card, with the ladybirds taken home. The basket, the chest and the butterfly only come during play, never behind the countdown, and when Giraffe moves on they fade with the place, as the leaf boats' stream does. The first time each new thing comes along in a game, it has a small label beside it for two seconds, such as "Take her to the flower!", in the language the voice speaks, and nothing new is said aloud. The middle places have one more spider from level 3, and another from level 8, and the ladybird takes a spider's place rather than adding one. Level 10 is at most 1.35 times as fast as level 1, so there's still about 74% of the time to catch one going past.

**For children with hemiplegia:**

- **How far to reach** sets how far from the web the spiders play. No level changes it.
- **Resting is always fine.** The spiders just keep playing, and nothing is lost.
- **With reduced motion,** the web sways half as far, a shy spider dashes off more gently, legs patter more slowly, and the butterfly's wings, the leaf boats and a waking spider's stretch stay still.
- **The summary counts spiders brought home with each hand.**
- **Nothing flashes.** Colours stay steady, a web fills in slowly, places fade into each other, and legs patter no more than about one and a half times a second. Measured through spiders moving, landing in webs, Giraffe clapping and moving between places, at levels 1, 6 and 10, with berries, the butterfly, the basket, a chest and a glowing web at the higher levels, brightness changed by no more than 1.7 out of 255 from one frame to the next. Every place is bright, with an average brightness of over 190 out of 255.

## Bounce Back

Tennis on a sunny court by the sea, seen from the side, with a big, slow ball that floats like a beach ball. The child's open hand is the racket: moving the hand moves it, and an open hand shows a racket with strings round the glove, which sends the ball back over the net. A hand that isn't open shows only a dashed ring, and the ball goes straight through it. Each player is a character from the other games, standing on their half with a long cartoon arm up to their racket, and running along under it. The child is Giraffe unless a grown-up picks someone else under **Who plays**, and the computer is one of the other friends, a new one at each level. It uses the same hand tracking as Balloon Pop, so it starts with the hand check and can be played sitting close to the camera.

**How it's played.** The child serves first: the ball floats up just out of reach of their hand and waits there, and after a moment drifts over to an open hand. After that, serves take turns. Every shot is worked out to go over the net, so all there is to do is get an open hand to the ball, and the computer aims right at the child's hand. A point is over when the ball bounces twice on one side, or goes off the end, and the score is big at the top of the screen, with each player's face. The first to 5, 7 or 11 points wins, as a grown-up chooses under **Points to win**. How many hits in a row shows under the net once a rally gets going, and the finish card counts the child's hits, the score and the longest rally. A little film of an open hand sending the ball back over the net shows until the child has hit it.

**For children with hemiplegia:**

- **Only an open hand hits, and it fails closed.** A hand that's missing, at the edge of the picture, too far away, overlapping the other one or that the tracker isn't sure of never hits. The strings come and go at a steady rate, so a hand opening and closing quickly can't make them flicker.
- **Resting never costs a point.** If the hand wasn't open at any time while the ball was coming, the ball floats back up and waits for it, for as long as it takes. The computer doesn't serve until it can see the child's hand. After the ball has waited 15 seconds, the voice says resting is fine.
- **On Gentle, the default, the game can't be lost.** The ball always waits, even for a child who tried and missed, and the computer misses one of the child's shots after one to three of them at level 1. On Medium the computer aims a little way off the hand, and a ball the child tried for and missed is the computer's point. On Tough it aims further off, and misses fewer. A game lost on Medium or Tough says "So close!", and the same level comes round again.
- **Reach help** makes the racket bigger, and draws the ball towards an open hand as it comes. Even the least of it is generous. A ball waiting for the child drifts over to their open hand after a second.
- **It's slow.** At level 1 the ball takes 2.7 seconds to cross the court on Slow, 2.25 on Medium and 1.85 on Fast. Shots stay below the score at the top of the screen, unless the hand hit it from up there.
- **With the left hand,** the child's half of the court is on the left, and the mirror, the meter and the film move to keep out of its way.
- **Nothing flashes.** A hit is a small burst of short lines, a bounce a little puff of sand, and things that come and go fade or grow. Measured through serves, hits, bounces and points, at level 1 and at level 10 with stars, a power-up, flags, sandcastles and a special ball about, brightness changed by at most 2.2 out of 255 from one frame to the next, and less than 1% of the picture flickered. With a hand opening and closing four times a second, quicker than any child, about 2% did, all of it the glove copying the hand. A character doesn't take a step for every little move of the hand.

**Levels** ([games/bounce-back/rules.js](games/bounce-back/rules.js)). Each level makes the ball a little quicker, up to 1.3 times as fast at level 10, which still leaves 77% of the time to reach it, and the computer plays a little longer before it misses one, so rallies grow. On top of that, every level from 2 brings something new, which stays for the levels after it:

| Level | What's new |
|---|---|
| 2 | **Stars to catch.** Now and then a star floats down on the child's side, and the glove catches it just by coming near it, open or closed. |
| 3 | **The bubble ball,** a big soap bubble that floats even more slowly, on every third point. |
| 4 | **A flag for each hit.** A row of eight flags hangs behind the court, and each of the child's hits colours one in. A full row gives a trophy, and they start again. |
| 5 | **The big racket,** a power-up that floats up in a bubble. Touching it makes the racket bigger for 8 seconds of the hand being open. |
| 6 | **Sandcastles** on the computer's side. The child's shots often go for one, and a ball landing on a sandcastle knocks it gently over, for a shell. It's built again after a while. |
| 7 | **The rainbow ball,** which leaves a soft trail behind it, and gives a star for each hit. |
| 8 | **A breeze,** which pushes the ball gently one way and then the other, with a windsock over the net to show which. Every shot still goes over. |
| 9 | **The bluebird,** a power-up that stays by the hand for 12 seconds of it being open, and bops a ball that would bounce twice on the child's side back up to their hand. |
| 10 | **The golden ball,** on the child's last point and now and then, which gives a gem for each hit. |

Prizes fly up to their tally under the score, and they're on the finish card by kind. Missing one never costs anything, a power-up's time only runs while the hand is open, and they only come during play. The first time each new thing comes along in a game, it has a small label beside it for two seconds, in the language the voice speaks, and nothing new is said out loud. The special balls take turns on every third point, the newest first. How hard, the ball speed, reach help, the points to win and who plays stay as a grown-up set them. The numbers are in `courtLevel` and `NEWS` in `rules.js`.

### Playing Bounce Back with a friend

Two children can play each other, each on their own computer with their own camera.

- **Making and joining:** under **Play with a friend** on the title card, a grown-up presses **Make a game** and tells their friend the 3-letter code, or sends the link. The friend types the code, or opens the link, and is in. A third is told the game already has two players.
- **Starting:** both press **Let’s play!**. After the hand check, each waits until the other is ready, and then both count down together. Whoever made the game can press **Start now**, and either can play on their own instead.
- **One court:** the game of whoever made it runs the ball, and sends where it is about 10 times a second. Each game decides when its own child's racket hits the ball, as that child sees it, shows the hit at once, and sends it, so hitting feels immediate for both.
- **Each on their own side:** each child sees themselves on the side of the hand they play with, so the court is turned round for one of them. The friend's character and racket are where the friend's hand really is, with their name over the racket, and their glove copies their hand finger by finger.
- **The host's game:** both play the host's level, points to win, how hard and ball speed, in the plain game without the levels' new things, and each child keeps their own reach help. Shots go to the other child's hand, and in a long rally each one drifts a little further off it, so that it ends sometime. A miss is the other child's point even on Gentle, but resting still waits.
- **The end:** both games finish together, and the finish card says who won. A game with a friend doesn't move anyone's own level on, and if either child goes, the game is over for the other.

Only the name typed, the character from the other games, where the racket is and whether it's open, and from the host's game where the ball is and the score go to the friend. Never anything from the camera.

## Giraffe's Maze

A garden maze of hedges, seen from a little above, so each hedge shows its top and the side facing the child, with sandy paths between them. Giraffe's friends are lost in it, and the child leads him to them. He's the child's character unless a grown-up picks someone else under **Who plays**, and the friends lost are the other characters from the games, never the child's own. It uses the same hand tracking as Balloon Pop, so it starts with the hand check and can be played sitting close to the camera.

**How it's played.** The glove copies the child's hand over the maze, and while the hand is open, Giraffe walks along the paths towards it, with a dotted line from him to the glove. He goes round corners towards the hand, and never through a hedge: with the hand on the other side of one, he walks as near as the paths let him and waits, with a little question mark over his head, until the hand leads him round. Each maze has one friend lost in it, waiting by the way out on the right and waving, who calls out once, in their own voice, with their face beside what they say, while the action is already going. Reaching them, they cheer, with a few hearts, and follow along behind, and the next maze fades in, about two and a half seconds after. Fruit lies along the paths, and walking over it eats it. Finding the last friend ends the game, with the fruit, the friends found and any prizes on the finish card. A grown-up chooses 2, 3 or 5 friends to find under **Friends to find in a game**, and nobody can lose.

**For children with hemiplegia:**

- **Only an open hand leads, and it fails closed.** A hand that's closed, missing, at the edge of the picture, too far away, overlapping the other one or that the tracker isn't sure of never moves Giraffe. He just waits where he is.
- **Resting is never punished.** Nothing in a maze has a time limit and nothing goes away: everything is still there when the hand opens again. After a couple of seconds of a closed hand it asks for it to open, and after 15 seconds says resting is fine.
- **How hard** sets how big the maze is, and so how wide its paths: 5 by 3 cells on Easy, 7 by 4 on Medium, the default, and 9 by 5 on Hard. No level changes it.
- **Reach help** makes the middle of the camera picture cover the whole maze, so a smaller movement goes further: none, a little (the default), or a lot, which is 1.6 times as far.
- **Finding the way** can be changed so the character finds its own way to the open hand, round any corners, for a child who can open the hand but not yet trace a path.
- **A trembling hand doesn't jiggle him.** Standing still, he only sets off for somewhere clearly nearer the hand, and walking, he heads for the nearest point he can see, so he never goes back and forth.
- **A little film** in the corner shows an open hand going along a path with Giraffe following, and stopping while it closes, until he has walked a few cells. The voice says "Lead the way with your open hand!" once, after the friend's call.
- **Nothing flashes.** What comes and goes fades or grows, a sparkle is a few small stars, and the next maze fades in, once the last has faded down to the bare ground, rather than cutting to it. Sliding it in from the side was tried, and it swept hedges past every part of the screen several times a second, which is a flicker. With reduced motion, nothing in the maze bobs, sways or waves by itself. Walking pictures change about eight times a second at a full walk, rather than twelve, as Giraffe and the friends behind him going past a place are what changes there most quickly. Measured through walking, eating, a friend found and the next maze coming in, at level 1 and at level 10 with butterflies, the bluebird, a power-up and things in the way about, brightness changed by at most 2.3 out of 255 from one frame to the next, and less than 0.4% of the picture flickered, none of it as the next maze came in. With a hand opening and closing four times a second, quicker than any child, less than 1% did, all of it the glove copying the hand.

**Levels** ([games/giraffe-maze/rules.js](games/giraffe-maze/rules.js)). There are fewer ways round as the levels go up, so more of each maze is one long path with dead ends off it. On top of that, every level from 2 brings something new, which stays for the levels after it:

| Level | What's new |
|---|---|
| 2 | **Butterflies to catch.** Now and then a butterfly flutters over the maze, and the glove catches it just by coming near it, open or closed. |
| 3 | **A gate and its key.** A gate with a padlock stands across the way to the friend, and its key waits somewhere that can be got to without going through it, down a side path if there is one. Walking over the key picks it up, and it rides over Giraffe's head to the gate, which swings open. Led to the gate without it, the prompt says "Find the key!". |
| 4 | **Running shoes,** early on the way, which make Giraffe quicker for 8 seconds of the hand being open. |
| 5 | **A sleepy sheep** lying across the way. An open hand held on it for a second wakes it, with a ring filling round it, and it hops off over the hedge. |
| 6 | **Gems in the corners:** two in the dead ends, or down side paths when the dead ends are taken. |
| 7 | **The bluebird,** early on the way, which flies off along the paths to the friend and leaves a trail of footprints to follow for 14 seconds. |
| 8 | **Bushes to rub away.** A bush across the way goes for an open hand rubbing it, back and forth, for about a second and a half, and not for one held still. |
| 9 | **The magnet,** which for 8 seconds of the hand being open draws fruit and gems from round about to Giraffe, over the hedges. |
| 10 | **Treasure chests,** in a dead end, which open for Giraffe with a crown inside. |

The newest thing a level brings is in the first maze of the game, so it's met, and the rest take turns from maze to maze: never more things in the way of one maze than its size has room for, one on Easy, two on Medium and three on Hard, and one helper at a time. Something in the way is always the only way on, so it can't be walked round. The first time each new thing comes along in a game, it has a small label beside it for a couple of seconds, in the language the voice speaks, and nothing new is said out loud; while something holds Giraffe up, the prompt says what to do about it each time, shown but not said. So that nobody gets stuck, a sheep wakes by itself once Giraffe has waited by it for 12 seconds, and a bush goes by itself after 15. Power-ups only run down while the hand is open, prizes fly up to their tally at the top, and missing any of it costs nothing. How hard, reach help, finding the way, the friends to find and who plays stay as a grown-up set them. The numbers are in `mazeLevel`, `featuresFor` and `NEWS` in `rules.js`, and how the character walks is `stepWalker`.

### Playing Giraffe's Maze with friends

Up to 4 children can play in one maze together, each on their own computer with their own camera.

- **Making and joining:** under **Play with friends** on the title card, a grown-up presses **Make a game** and tells their friends the 3-letter code, or sends the link. A friend types the code, or opens the link, and is in. A fifth is told the game already has four players.
- **Starting:** everyone presses **Into the maze!**. After the hand check, each waits until everyone is ready, and then all count down together. Whoever made the game can press **Start now**, and anyone can play on their own instead.
- **One maze for everyone:** every game makes the same mazes from the host's size and a seed the host's game picks as it gets ready, so there's a new maze each game, at the host's level and number of mazes. It's the plain maze with its fruit, without the levels' new things, and one more friend is lost in each than there are players, spread out over it, none of them anyone's own character.
- **Everyone in it:** each child sees everyone else's character walking where it really is in the maze, a moment ago, with their name over it, and their glove in light grey, copying their hand finger by finger. Characters walk through each other, so nobody can block anyone.
- **First there has it:** whoever's character gets to a fruit or a lost friend first has it, and it's theirs on every screen: the server decides, as each one reaches it. A friend found follows whoever found them. A fruit is a point and a friend three, and everyone's points show at the top, the most first. Once all of a maze's lost friends are found, everyone moves on to the next maze together, as every game hears the same finds.
- **The end:** after the last maze, the finish card says who came where, and equal points share a place. A game with friends doesn't move anyone's own level on, and nobody's settings change: each child keeps their own reach help and way finding. Nobody's game runs the maze for the others, so a friend who goes, the host too, just takes their character with them, and everyone else plays on.

Only the name typed, the character from the other games, the host's level, size, number of mazes and seed, where the character and the glove are in the maze, and what each one reached first go to friends. Never anything from the camera.

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

**The trail** has real footsteps on grass, and a cheerful piano loop that drops back while anyone speaks. The loop is only 17 seconds long, so it may be worth changing if it gets tiring. With moves, voices and music together, the mix peaked at 0.82.

**The fight** uses real recordings too: swings through the air, softened hits, a hand drum for the heavy ones, a real clap, a boxing bell and cheering. The music drops back while anyone speaks, and sound effects and music can be turned off together. Tests check that the mix doesn't go over 1.0, which is where it would distort.

**The sky** has a real small plane's propeller, looped from the steady part of a recording and following the plane's speed, under the fight's music. The guns are real paintball shots, softer and friendlier than real guns, retimed into a steady rattle that only plays while a plane is in the ring. A wrong answer in Balloon Pop sizzles with a real egg going into a real pan.

**The rescue** uses real paintball shots, the same paintballs landing on metal drums for hits, tin cans and a bouncing nail for robots falling apart, mud and bubbles for goo, a Lego train for the tram, and a bicycle bell when it sets off, under Mighty Moves' music. Prizes arriving twinkle with Mighty Moves' sparkle, kept quiet and spaced out, a shot bonking off a lid is the shield's clank played higher, and a triple shot's three balls landing together make one hit.

**The tank** has a real big diesel engine, looped and following its speed, under the fight's music and birds in the countryside. The gun is soft and friendly: a real champagne cork slowed right down, over a far-off bird scarer with everything sharp taken out. Prizes reaching the tank twinkle with Mighty Moves' sparkle, kept quiet and spaced out, and a shot bouncing off a shield is its thump, played higher. A triple shot is one bang.

**The sea** in Cannon Bay is real waves, gulls, wind in real masts and a big rope creaking, with a CC0 sea shanty under them. The wind and the water follow the sails. The cannon is a real bird-scaring gun recorded from far away, slowed and softened into a friendly thump. Gems and hearts ring like the gold, a key or a chest clunks open with Robot Rescue's barn lock, a rescued sailor gets that game's bicycle bell, and a triple shot's three balls landing together make one thud. A ship going down starts its drum first, then its sparkle and oars a moment later, so they don't all land on top of a cannon and a voice. With all of that at once, the mix peaked at 0.89.

**The garden** in Spider Catcher is a real wood full of birds, kept quiet underneath. A spider landing in its web is a real harp playing a cartoon bounce, and one let go scurries off through real long grass.

**The court** in Bounce Back has The Lighthouse Keeper's real waves on a beach, kept quiet underneath. Nothing new was recorded for it. A hit is High Five Racers' slap, a bounce Leap Trail's hand drum, a point won Mighty Moves' cheering, kept quiet, and a prize its sparkle. The bubble ball and the bluebird boing with Robot Rescue's cartoon boing, and the computer swinging at a ball it misses is a soft whoosh. The only words said are ones the other games already say: "Open your right hand!", "Resting is OK" and now and then "Nice one!".

**The maze** in Giraffe's Maze has Spider Catcher's real wood full of birds, kept quiet underneath. Nothing new was recorded for it. Giraffe's footsteps are Leap Trail's real steps on grass, quietly, eating a fruit is the Long Walk Home's real apple crunch, a friend found Spider Catcher's harp bounce with Mighty Moves' cheering, kept quiet, and a prize Mighty Moves' sparkle. A gate or a chest opens with Robot Rescue's barn lock, a sheep hops off with its cartoon boing, a bush goes with Spider Catcher's long grass, and the next maze comes in with Mighty Moves' swish. Each lost friend's call is a new line in their own voice, as in the other games with a mission, and the coach says the hint and the finish.

Where each sound came from is in [CREDITS.md](CREDITS.md).

## Privacy

Camera frames are only ever used in the browser and are never saved. Each page's security policy blocks it from sending anything to another computer, except that High Five Racers, Sky Wings, Balloon Pop, Mighty Moves, Bounce Back and Giraffe's Maze may reach the server for playing with friends, which they only do once a grown-up makes or joins a race, a flight, a game or a fight (see [Racing friends](#high-five-racers)), and the camera turns off as soon as a round ends. Only settings are stored, in the browser, along with which level each game is on. A round's numbers are shown once and then discarded. All libraries, the model and the sounds are in this folder, so the games also work offline.

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
- **How far the big hands should be, and how long turbo should take to fill, on a real hand.**
- **How Spider Catcher feels.** Whether the spiders are slow enough to catch with a real affected hand, whether closing within about a second of opening is long enough for a hand that closes slowly, how big the catching circle should be, and whether a child finds the spiders cute. It was only played with photos of an adult hand, moved about by the tests, and nobody has listened to its sound.
- **How Bounce Back feels.** Whether the ball is slow enough for a real affected hand, how far from the hand a waiting ball should float, whether a child can tell the racket with strings from the dashed ring, and whether the long cartoon arms are funny or strange. It was only played with photos of an adult hand, moved about by the tests, nobody has listened to its sound, and playing with a friend was only tried with two browsers on one computer, not two computers far apart.
- **How Giraffe's Maze feels.** Whether leading a character along a path is clear to a young child, whether he walks quickly enough, how big the paths should be for a real affected hand, whether a second of an open hand is right to wake the sheep, and whether rubbing the bush can be done with a weak hand. It was only played with photos of an adult hand, moved about by the tests, nobody has listened to its sound, and playing with friends was only tried with browsers on one computer. The friends' calls in Georgian need a native speaker to check them.
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
