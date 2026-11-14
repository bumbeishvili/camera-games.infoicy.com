// The ten worlds of Gobble and Grow, one for each level, from a bacterium to a galaxy: who the child is in each,
// how big that really is, the three things there are to eat there, from the smallest to the biggest, and the
// everyday thing that's bigger than the child was and smaller than they'll be next, for the picture of how much
// they grew. Only words and numbers here: how each looks is in art.js.

/** How many times bigger the child's creature gets within a world, from its first bite to its last. */
export const GROWTH = 2.2;

export const WORLDS = [
  {
    id: 'bacterium',
    mark: '🦠',
    you: 'a bacterium',
    youKa: 'ბაქტერია',
    place: 'under a microscope',
    placeKa: 'მიკროსკოპის ქვეშ',
    size: 2e-6, // Metres across, to begin with.
    foods: [
      { id: 'speck', name: 'A speck of sugar', nameKa: 'შაქრის ნამცეცი' },
      { id: 'germ', name: 'A round germ', nameKa: 'მრგვალი მიკრობი' },
      { id: 'yeast', name: 'A bud of yeast', nameKa: 'საფუარი' },
    ],
    thing: { id: 'sand', name: 'A grain of sand', nameKa: 'ქვიშის მარცვალი', size: 5e-4 },
  },
  {
    id: 'flea',
    mark: '🦐',
    you: 'a water flea',
    youKa: 'წყლის რწყილი',
    place: 'in a drop of water',
    placeKa: 'წყლის წვეთში',
    size: 1e-3,
    foods: [
      { id: 'alga', name: 'Green algae', nameKa: 'მწვანე წყალმცენარე' },
      { id: 'slipper', name: 'A slipper animal', nameKa: 'ქალამანა' },
      { id: 'amoeba', name: 'An amoeba', nameKa: 'ამება' },
    ],
    thing: { id: 'ladybird', name: 'A ladybird', nameKa: 'ჭიამაია', size: 7e-3 },
  },
  {
    id: 'fish',
    mark: '🐟',
    you: 'a fish',
    youKa: 'თევზი',
    place: 'in a pond',
    placeKa: 'ტბორში',
    size: 0.03,
    foods: [
      { id: 'waterflea', name: 'A water flea', nameKa: 'წყლის რწყილი' },
      { id: 'tadpole', name: 'A tadpole', nameKa: 'თავკომბალა' },
      { id: 'snail', name: 'A pond snail', nameKa: 'ლოკოკინა' },
    ],
    thing: { id: 'football', name: 'A football', nameKa: 'ფეხბურთის ბურთი', size: 0.22 },
  },
  {
    id: 'cat',
    mark: '🐱',
    you: 'a cat',
    youKa: 'კატა',
    place: 'in a garden',
    placeKa: 'ბაღში',
    size: 0.3,
    foods: [
      { id: 'littlefish', name: 'A little fish', nameKa: 'პატარა თევზი' },
      { id: 'cheese', name: 'A piece of cheese', nameKa: 'ყველის ნაჭერი' },
      { id: 'drumstick', name: 'A chicken leg', nameKa: 'ქათმის ბარკალი' },
    ],
    thing: { id: 'bicycle', name: 'A bicycle', nameKa: 'ველოსიპედი', size: 1.7 },
  },
  {
    id: 'elephant',
    mark: '🐘',
    you: 'an elephant',
    youKa: 'სპილო',
    place: 'on the savanna',
    placeKa: 'სავანაში',
    size: 3,
    foods: [
      { id: 'peanut', name: 'A peanut', nameKa: 'მიწის თხილი' },
      { id: 'melon', name: 'A watermelon', nameKa: 'საზამთრო' },
      { id: 'haystack', name: 'A haystack', nameKa: 'თივის ზვინი' },
    ],
    thing: { id: 'house', name: 'A house', nameKa: 'სახლი', size: 10 },
  },
  {
    id: 'whale',
    mark: '🐋',
    you: 'a whale',
    youKa: 'ვეშაპი',
    place: 'in the ocean',
    placeKa: 'ოკეანეში',
    size: 25,
    foods: [
      { id: 'shrimp', name: 'A shrimp', nameKa: 'კრევეტი' },
      { id: 'shoal', name: 'A shoal of fish', nameKa: 'თევზების გუნდი' },
      { id: 'squid', name: 'A giant squid', nameKa: 'გიგანტური კალმარი' },
    ],
    thing: { id: 'mountain', name: 'A mountain', nameKa: 'მთა', size: 2000 },
  },
  {
    id: 'cloud',
    mark: '☁️',
    you: 'a cloud giant',
    youKa: 'ღრუბლის გოლიათი',
    place: 'in the sky',
    placeKa: 'ცაში',
    size: 3000,
    foods: [
      { id: 'kite', name: 'A kite', nameKa: 'ფრანი' },
      { id: 'airballoon', name: 'A hot-air balloon', nameKa: 'საჰაერო ბუშტი' },
      { id: 'rainbow', name: 'A rainbow', nameKa: 'ცისარტყელა' },
    ],
    thing: { id: 'moon', name: 'The Moon', nameKa: 'მთვარე', size: 3.47e6 },
  },
  {
    id: 'planet',
    mark: '🪐',
    you: 'a planet',
    youKa: 'პლანეტა',
    place: 'among the moons',
    placeKa: 'მთვარეებს შორის',
    size: 6e6,
    foods: [
      { id: 'rock', name: 'A space rock', nameKa: 'ასტეროიდი' },
      { id: 'comet', name: 'A comet', nameKa: 'კომეტა' },
      { id: 'moonlet', name: 'A moon', nameKa: 'მთვარე' },
    ],
    thing: { id: 'jupiter', name: 'Jupiter', nameKa: 'იუპიტერი', size: 1.4e8 },
  },
  {
    id: 'sun',
    mark: '☀️',
    you: 'a sun',
    youKa: 'მზე',
    place: 'among the planets',
    placeKa: 'პლანეტებს შორის',
    size: 7e8,
    foods: [
      { id: 'smallmoon', name: 'A moon', nameKa: 'მთვარე' },
      { id: 'earth', name: 'A small planet', nameKa: 'პატარა პლანეტა' },
      { id: 'ringed', name: 'A planet with rings', nameKa: 'რგოლებიანი პლანეტა' },
    ],
    thing: { id: 'planets', name: 'The Sun’s family of planets', nameKa: 'მზის სისტემა', size: 9e12 },
  },
  {
    id: 'galaxy',
    mark: '🌌',
    you: 'a galaxy',
    youKa: 'გალაქტიკა',
    place: 'among the stars',
    placeKa: 'ვარსკვლავებს შორის',
    size: 4e20,
    foods: [
      { id: 'star', name: 'A star', nameKa: 'ვარსკვლავი' },
      { id: 'nebula', name: 'A cloud of stars', nameKa: 'ნისლეული' },
      { id: 'spiral', name: 'A little galaxy', nameKa: 'პატარა გალაქტიკა' },
    ],
    // Nothing is bigger: after the last world comes the whole sky.
    thing: null,
  },
];

/** The world of a level, from 1 to 10. */
export const worldAt = (level) => WORLDS[Math.min(WORLDS.length, Math.max(1, Math.round(level) || 1)) - 1];
