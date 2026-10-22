import type { TSongChip, TSongDoc } from '../types/t_song';

/**
 * One song the engine has: what it is, who wrote it, which console it is arranged for, and what a
 * game might play it for.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongBuiltinInfo = {
    /**
     * What a game asks for it by, after `nacatamalon:`: `useLoadSong({ src: 'nacatamalon:canon' })`.
     */
    key: string;
    label: string;
    composer: string;
    /**
     * When it was written, near enough.
     */
    year: number;
    chip: TSongChip;
    description: string;
    uses: string[];
};

/**
 * The songs the engine has: pieces old enough to belong to everyone, arranged here for the consoles
 * the engine imitates, each as a song of ours, so a game can change its tempo, its key and its
 * voices like any other.
 *
 * Asked for by key, like the engine's fonts: `useSong(useLoadSong({ src: 'nacatamalon:ode-to-joy' }))`,
 * or `"song": "nacatamalon:ode-to-joy"` in a scene. Each is loaded only when a game asks for it, so a
 * game carries only the ones it plays.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SONG_BUILTINS: readonly TSongBuiltinInfo[] = [
    { key: 'fur-elise', label: 'Für Elise', composer: 'Ludwig van Beethoven', year: 1810, chip: 'snes', description: 'A piano in a room: the opening, going round.', uses: ['a title screen', 'a menu', 'a music box'] },
    { key: 'ode-to-joy', label: 'Ode to Joy', composer: 'Ludwig van Beethoven', year: 1824, chip: 'nes', description: 'Bright and certain.', uses: ['a victory', 'an ending', 'a level cleared'] },
    { key: 'mountain-king', label: 'In the Hall of the Mountain King', composer: 'Edvard Grieg', year: 1875, chip: 'genesis', description: 'A theme that creeps and climbs; speed it up as the danger gets close.', uses: ['a chase', 'a battle', 'a timer running out'] },
    { key: 'turkish-march', label: 'Rondo alla Turca', composer: 'Wolfgang Amadeus Mozart', year: 1783, chip: 'nes', description: 'A quick, bouncing march.', uses: ['a world map', 'a level', 'a puzzle'] },
    { key: 'can-can', label: 'Galop infernal (the can-can)', composer: 'Jacques Offenbach', year: 1858, chip: 'nes', description: 'Fast and silly.', uses: ['a bonus stage', 'a race', 'a minigame'] },
    { key: 'william-tell', label: 'William Tell Overture, the galop', composer: 'Gioachino Rossini', year: 1829, chip: 'genesis', description: 'A gallop.', uses: ['a race', 'a charge', 'a horse'] },
    { key: 'funeral-march', label: 'Funeral March', composer: 'Frédéric Chopin', year: 1839, chip: 'snes', description: 'Slow and heavy.', uses: ['a game over', 'a defeat', 'a sad scene'] },
    { key: 'bridal-chorus', label: 'Bridal Chorus (Here Comes the Bride)', composer: 'Richard Wagner', year: 1850, chip: 'snes', description: 'Stately and happy.', uses: ['a wedding', 'a happy ending'] },
    { key: 'entertainer', label: 'The Entertainer', composer: 'Scott Joplin', year: 1902, chip: 'snes', description: 'A rag on the piano.', uses: ['a shop', 'a lobby', 'a saloon'] },
    { key: 'gymnopedie', label: 'Gymnopédie No. 1', composer: 'Erik Satie', year: 1888, chip: 'snes', description: 'Slow, still and gentle.', uses: ['the credits', 'a calm place', 'a pause'] },
    { key: 'toccata', label: 'Toccata and Fugue in D minor, the opening', composer: 'Johann Sebastian Bach', year: 1708, chip: 'snes', description: 'An organ in a stone hall.', uses: ['a castle', 'the last boss', 'a haunted house'] },
    { key: 'canon', label: 'Canon in D', composer: 'Johann Pachelbel', year: 1694, chip: 'snes', description: 'A bass going round under a slow tune.', uses: ['an ending', 'a wedding', 'a memory'] },
    { key: 'morning-mood', label: 'Morning Mood', composer: 'Edvard Grieg', year: 1875, chip: 'snes', description: 'A flute at sunrise.', uses: ['the first village', 'a new day', 'a meadow'] },
    { key: 'minuet-in-g', label: 'Minuet in G', composer: 'Christian Petzold', year: 1725, chip: 'nes', description: 'A small dance.', uses: ['a palace', 'a menu', 'a tutorial'] },
    { key: 'greensleeves', label: 'Greensleeves', composer: 'Traditional, English', year: 1580, chip: 'snes', description: 'Wistful, on a flute and a guitar.', uses: ['a tavern', 'a long road', 'a forest'] },
    { key: 'korobeiniki', label: 'Korobeiniki', composer: 'Traditional, Russian', year: 1861, chip: 'nes', description: 'A quick, catchy folk tune.', uses: ['a puzzle', 'a falling-blocks game', 'a quick level'] },
    { key: 'eine-kleine', label: 'Eine kleine Nachtmusik', composer: 'Wolfgang Amadeus Mozart', year: 1787, chip: 'snes', description: 'Bright and courtly strings.', uses: ['a palace', 'a title screen', 'a garden'] },
    { key: 'moonlight', label: 'Moonlight Sonata, the first movement', composer: 'Ludwig van Beethoven', year: 1801, chip: 'snes', description: 'Slow, rippling, dark chords.', uses: ['a haunted place', 'a sad night', 'a mystery'] },
    { key: 'prelude-in-c', label: 'Prelude in C, from the Well-Tempered Clavier', composer: 'Johann Sebastian Bach', year: 1722, chip: 'snes', description: 'One broken chord a bar, calm and turning.', uses: ['a menu', 'a library', 'a save point'] },
    { key: 'bumblebee', label: 'Flight of the Bumblebee', composer: 'Nikolai Rimsky-Korsakov', year: 1900, chip: 'genesis', description: 'A buzzing run that never stops.', uses: ['a swarm', 'a panic', 'a timer running out'] },
    { key: 'spring', label: 'Spring, from The Four Seasons', composer: 'Antonio Vivaldi', year: 1725, chip: 'snes', description: 'Bright and birdlike.', uses: ['a meadow', 'a new day', 'a forest in spring'] },
    { key: 'twinkle', label: 'Twinkle, Twinkle, Little Star', composer: 'Traditional, French', year: 1761, chip: 'nes', description: 'Gentle and simple.', uses: ['a night sky', 'a lullaby', 'a first level'] },
    { key: 'jingle-bells', label: 'Jingle Bells', composer: 'James Lord Pierpont', year: 1857, chip: 'nes', description: 'Merry, with sleigh bells.', uses: ['a snow level', 'a holiday', 'a sled race'] },
    { key: 'saints', label: 'When the Saints Go Marching In', composer: 'Traditional, spiritual', year: 1896, chip: 'nes', description: 'A brass band strutting.', uses: ['a parade', 'a celebration', 'a town festival'] },
    { key: 'oh-susanna', label: 'Oh! Susanna', composer: 'Stephen Foster', year: 1848, chip: 'nes', description: 'Bouncy and cheerful.', uses: ['a farm', 'a road trip', 'a western town'] },
    { key: 'amazing-grace', label: 'Amazing Grace', composer: 'John Newton', year: 1779, chip: 'snes', description: 'Slow and warm.', uses: ['a sunrise', 'a farewell', 'a temple'] },
    { key: 'yankee-doodle', label: 'Yankee Doodle', composer: 'Traditional', year: 1775, chip: 'nes', description: 'A fife and drum.', uses: ['a parade', 'toy soldiers', 'a march'] },
    { key: 'frere-jacques', label: 'Frère Jacques, as a round', composer: 'Traditional, French', year: 1780, chip: 'snes', description: 'Four voices coming in one after another, going round.', uses: ['a village', 'a school', 'a clockwork puzzle'] },
    { key: 'beethoven-fifth', label: 'Symphony No. 5, the opening', composer: 'Ludwig van Beethoven', year: 1808, chip: 'genesis', description: 'Four notes knocking, then the storm.', uses: ['a boss appearing', 'a dramatic reveal', 'a fateful moment'] },
    { key: 'hallelujah', label: 'Hallelujah, from Messiah', composer: 'George Frideric Handel', year: 1741, chip: 'snes', description: 'A choir of four in full glory.', uses: ['a triumph', 'a treasure found', 'a heavenly place'] },
    { key: 'stars-and-stripes', label: 'The Stars and Stripes Forever, the trio', composer: 'John Philip Sousa', year: 1896, chip: 'nes', description: 'A brass band march.', uses: ['a parade', 'a victory lap', 'a circus'] },
    { key: 'mozart-40', label: 'Symphony No. 40, the opening', composer: 'Wolfgang Amadeus Mozart', year: 1788, chip: 'snes', description: 'Restless, urgent strings.', uses: ['a chase in a palace', 'a puzzle against the clock', 'a tense menu'] },
    { key: 'habanera', label: 'Habanera, from Carmen', composer: 'Georges Bizet', year: 1875, chip: 'snes', description: 'A sultry tune sliding down over a bass that never stops.', uses: ['a dancer', 'a town square at night', 'a sly character'] },
    { key: 'toreador', label: 'Toreador Song, from Carmen', composer: 'Georges Bizet', year: 1875, chip: 'genesis', description: 'A swaggering refrain.', uses: ['an arena', 'a hero entering', 'a bullfight'] },
    { key: 'blue-danube', label: 'The Blue Danube', composer: 'Johann Strauss II', year: 1866, chip: 'snes', description: 'A slow, swaying waltz.', uses: ['a ballroom', 'floating in space', 'a boat on a river'] },
    { key: 'hungarian-rhapsody', label: 'Hungarian Rhapsody No. 2, the fast dance', composer: 'Franz Liszt', year: 1847, chip: 'nes', description: 'Wild and fast.', uses: ['a cartoon chase', 'a piano showdown', 'a frantic level'] },
    { key: 'gladiators', label: 'Entry of the Gladiators', composer: 'Julius Fučík', year: 1897, chip: 'nes', description: 'The circus march.', uses: ['a circus', 'a clown', 'a silly chase'] },
    { key: 'valkyries', label: 'Ride of the Valkyries, the call', composer: 'Richard Wagner', year: 1856, chip: 'genesis', description: 'A charge on horseback through the sky.', uses: ['an air battle', 'a charge', 'a final assault'] },
    { key: 'danse-macabre', label: 'Danse macabre, the opening', composer: 'Camille Saint-Saëns', year: 1874, chip: 'genesis', description: 'Midnight strikes twelve, and Death tunes his fiddle.', uses: ['a graveyard', 'a haunted ballroom', 'midnight'] },
];

const LOADERS: Record<string, () => Promise<TSongDoc>> = {
    'fur-elise': () => import('./songs/fur_elise').then((module) => module.song),
    'ode-to-joy': () => import('./songs/ode_to_joy').then((module) => module.song),
    'mountain-king': () => import('./songs/mountain_king').then((module) => module.song),
    'turkish-march': () => import('./songs/turkish_march').then((module) => module.song),
    'can-can': () => import('./songs/can_can').then((module) => module.song),
    'william-tell': () => import('./songs/william_tell').then((module) => module.song),
    'funeral-march': () => import('./songs/funeral_march').then((module) => module.song),
    'bridal-chorus': () => import('./songs/bridal_chorus').then((module) => module.song),
    'entertainer': () => import('./songs/entertainer').then((module) => module.song),
    'gymnopedie': () => import('./songs/gymnopedie').then((module) => module.song),
    'toccata': () => import('./songs/toccata').then((module) => module.song),
    'canon': () => import('./songs/canon').then((module) => module.song),
    'morning-mood': () => import('./songs/morning_mood').then((module) => module.song),
    'minuet-in-g': () => import('./songs/minuet_in_g').then((module) => module.song),
    'greensleeves': () => import('./songs/greensleeves').then((module) => module.song),
    'korobeiniki': () => import('./songs/korobeiniki').then((module) => module.song),
    'eine-kleine': () => import('./songs/eine_kleine').then((module) => module.song),
    'moonlight': () => import('./songs/moonlight').then((module) => module.song),
    'prelude-in-c': () => import('./songs/prelude_in_c').then((module) => module.song),
    'bumblebee': () => import('./songs/bumblebee').then((module) => module.song),
    'spring': () => import('./songs/spring').then((module) => module.song),
    'twinkle': () => import('./songs/twinkle').then((module) => module.song),
    'jingle-bells': () => import('./songs/jingle_bells').then((module) => module.song),
    'saints': () => import('./songs/saints').then((module) => module.song),
    'oh-susanna': () => import('./songs/oh_susanna').then((module) => module.song),
    'amazing-grace': () => import('./songs/amazing_grace').then((module) => module.song),
    'yankee-doodle': () => import('./songs/yankee_doodle').then((module) => module.song),
    'frere-jacques': () => import('./songs/frere_jacques').then((module) => module.song),
    'beethoven-fifth': () => import('./songs/beethoven_fifth').then((module) => module.song),
    'hallelujah': () => import('./songs/hallelujah').then((module) => module.song),
    'stars-and-stripes': () => import('./songs/stars_and_stripes').then((module) => module.song),
    'mozart-40': () => import('./songs/mozart_40').then((module) => module.song),
    'habanera': () => import('./songs/habanera').then((module) => module.song),
    'toreador': () => import('./songs/toreador').then((module) => module.song),
    'blue-danube': () => import('./songs/blue_danube').then((module) => module.song),
    'hungarian-rhapsody': () => import('./songs/hungarian_rhapsody').then((module) => module.song),
    'gladiators': () => import('./songs/gladiators').then((module) => module.song),
    'valkyries': () => import('./songs/valkyries').then((module) => module.song),
    'danse-macabre': () => import('./songs/danse_macabre').then((module) => module.song),
};

/**
 * One of the engine's songs by its key, with or without `nacatamalon:` in front, loaded the first
 * time, or `null` when there is none of that name.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadBuiltinSong = (key: string): Promise<TSongDoc> | null => {
    const name = key.startsWith('nacatamalon:') ? key.slice('nacatamalon:'.length) : key;
    return LOADERS[name]?.() ?? null;
};
