# Making music with NacatamalOn

NacatamalOn plays music written as **notes**, not recordings. A song is a small text file (a
`.song`), the engine turns it into sound inside the game, and because it is notes the game can
change it while it plays: faster for the last lap, in another key, a voice dropped, a voice moved
from left to right.

This guide goes from the first note to a full arrangement for the NES, the SNES or the Genesis. You
need no music software and no music theory to follow it.

- [1. Your first song](#1-your-first-song)
- [2. Writing notes](#2-writing-notes)
- [3. The consoles and their voices](#3-the-consoles-and-their-voices)
- [4. Instruments](#4-instruments)
- [5. What one note does on its own](#5-what-one-note-does-on-its-own)
- [6. Samples, echo and pan](#6-samples-echo-and-pan)
- [7. Recipes](#7-recipes)
- [8. The songs the engine has](#8-the-songs-the-engine-has)
- [9. Playing it in a game](#9-playing-it-in-a-game)
- [10. Bringing music from FamiTracker or FamiStudio](#10-bringing-music-from-famitracker-or-famistudio)
- [11. When something is wrong](#11-when-something-is-wrong)

---

## 1. Your first song

A song is a tempo, a bar, and what each voice plays. This one is four bars of a tune, a bass and a
drum, for the NES:

```json
{
    "format": 1,
    "tempo": 120,
    "meter": [4, 4],
    "voices": {
        "pulse1": { "notes": "c'4 e' g' e' | f'4 a' g'2 | e'4 c' d' b | c'1 |" },
        "triangle": { "notes": "c,2 g, | f,2 c, | a,,2 g,, | c,1 |" },
        "noise": { "notes": "x4 r x r | x4 r x r | x4 r x r | x4 x x x |" }
    }
}
```

Save it as `public/music/first.song` and play it:

```ts
import { createScene, useLoadSong, useSong } from 'nacatamalon';

const Title = () => {
    useSong(useLoadSong({ src: '/music/first.song' }), { autoplay: true });
    return createScene();
};
```

In the editor you do not even need the file by hand: open a song with **Edit song**, write in each
voice's box or click on the piano roll, and press play. What you hear there is exactly what the game
plays.

---

## 2. Writing notes

Each voice is its notes as text, separated by spaces, read left to right.

**The note.** A letter from `a` to `g`. `c` alone is middle C; `a` is the A of 440 Hz.

**Sharp and flat.** `#` raises it a semitone, `b` lowers it: `f#`, `bb`.

**The octave.** `'` raises it an octave, `,` lowers it, as many as needed: `c'` is the C above
middle C, `c,,` two octaves below.

**How long.** A number after it: `1` a whole note, `2` a half, `4` a quarter, `8` an eighth, `16`,
`32`, `64`. A dot adds half again: `4.` is a quarter and an eighth. **With no number, a note lasts
what the one before it lasted**, so `c8 d e f` is four eighths.

**Rests and drums.** `r` is a rest. In a noise voice, `x` is a drum hit.

**Held across.** `~` at the end holds a note into the next one, which must be the same note:
`c'2~ | c'2` lasts a whole note across the bar line.

**Bars.** `|` ends a bar, and it is **checked**: a bar that does not add up to the song's `meter` is a
mistake, said with its line and column. It is the best friend you have: most wrong songs are a note
too long or too short, and the bar line finds it.

**The bar.** `meter` is how many beats a bar has and which note is a beat: `[4, 4]` four quarters,
`[3, 4]` a waltz, `[6, 8]` six eighths. `tempo` counts that beat a minute.

**An intro that plays once.** `"loop": { "bar": 3 }` makes bars 1 and 2 an intro: the song plays them
once and then goes round bars 3 to the end.

---

## 3. The consoles and their voices

A song says which console it sounds like with `chip`, and that decides its voices. Each voice plays
**one note at a time**: a chord is several voices, or one voice playing an arpeggio (see
[section 4](#4-instruments)).

### NES (`"chip": "nes"`, the default)

| Voice | What it is | Good for |
|---|---|---|
| `pulse1`, `pulse2` | Square waves | The tune and the harmony |
| `triangle` | A stepped triangle | The bass |
| `noise` | Noise | Drums: `x`, or a note for its colour (higher, more of a hiss) |
| `dpcm` | Short samples at the console's grain | A drum kit, an orchestra hit |

A square voice can say its `duty`, its colour: `0.125` thin and nasal, `0.25`, `0.5` round and
hollow, `0.75`.

### SNES (`"chip": "snes"`)

Eight voices, `s1` to `s8`, and **each plays a sample**: a recording of an instrument. The engine
has its own (a piano, strings, a choir…), made by its own code so there is nobody's recording in
them. The SNES held its samples small and played them at 32000 samples a second, smoothed; the
engine does the same, so they have that warm, slightly muffled sound. It also has the SNES's
**echo**.

### Genesis (`"chip": "genesis"`)

Six **FM voices**, `fm1` to `fm6`, and the three squares and noise of its second chip, `psg1` to
`psg3` and `psgNoise`. An FM voice is four sine waves bending each other, which is where the
Genesis's bright, metallic, punchy sound comes from: electric pianos, slap bass, brass.

---

## 4. Instruments

So far each note is one flat tone. An **instrument** says how a note sounds *while it plays*: it
comes in loud and settles, its colour changes, it wobbles, it plays a chord. It is what makes a song
sound like the real thing.

### The engine's instruments

The engine has instruments ready: write `@` and the name before the notes.

```json
"pulse1": { "notes": "@lead c'4 e' g' e' |" }
```

| For | Instruments |
|---|---|
| NES squares, Genesis squares | `@lead` `@soft` `@pluck` `@bell` `@major` `@minor` `@power` `@stab` |
| NES triangle | `@bass` `@tri-kick` |
| Noise | `@kick` `@snare` `@hat` `@open-hat` `@crash` |
| Samples (`dpcm`, SNES) | `@drum-kick` `@drum-snare` `@drum-clap` `@drum-tom` `@orch-hit` `@zap` |
| SNES | `@piano` `@strings` `@brass` `@flute` `@organ` `@choir` `@marimba` `@guitar` `@synth-bass` `@square-lead` |
| Genesis FM | `@epiano` `@slap-bass` `@fm-bass` `@fm-brass` `@fm-strings` `@fm-organ` `@fm-bell` `@dist-guitar` `@fm-lead` |

`@name` changes the instrument **from there on**, and `@-` goes back to none. A voice can start
with one, `"instrument": "lead"`, and change partway:

```json
"pulse1": { "notes": "c'4 e' g' e' | @lead c'4 e' g' e' |" }
```

That first bar is plain and the second sings: an intro that blooms.

### Your own instruments

A song can define its own in `instruments`, by name. An instrument is **lists of numbers read one a
frame**, sixty times a second, from the moment the note starts, the way the consoles' music was made:

```json
"instruments": {
    "pluck": { "volume": "15 12 9 6 3 0" },
    "chord": { "volume": "12 10 9 | 8", "arpeggio": "| 0 4 7" }
}
```

- `volume`: how loud, `0` to `15` a frame. `15 12 9 6 3 0` dies away in a tenth of a second, a
  pluck; `15 14 13 12 | 11` comes in and settles.
- `duty`: a square wave's colour a frame, `0` to `3` (12.5, 25, 50, 75 %). `0 0 1` starts thin and
  turns rounder.
- `arpeggio`: semitones added a frame. `| 0 4 7` plays a major chord one note a frame, which is how
  the NES played chords; `| 0 3 7` a minor one.
- `pitch`: semitones added a frame, fractions allowed. `0 -8 -16 -20` on a noise voice is a kick
  that drops.

**Past its end a list keeps its last number**, unless a `|` says where it starts again: `15 12 | 9 8`
falls to 9 and then goes 8 9 8 9…; `| 0 4 7` repeats from the start for as long as the note lasts.

Two more that are not lists:

- `vibrato`: `{ "speed": 6, "depth": 0.25, "delay": 0.2 }`, a wobble of a quarter of a semitone six
  times a second, once the note has been held a fifth of a second. A held note that sings.
- `slide`: seconds each note takes to glide from the one before it in its voice. `0.03` on a bass
  gives it a little "bwop".

A song's own instrument of the same name as one of the engine's is played instead of it;
`@nacatamalon:kick` always means the engine's.

---

## 5. What one note does on its own

Sometimes only one note should slide or wobble. Write it in brackets right after the note, with no
spaces:

| Written | What that note does |
|---|---|
| `c'4[slide]` | Glides in from the note before (`[slide:0.1]`: in a tenth of a second) |
| `c'2[vib]` | Wobbles (`[vib:6,0.3]`: six times a second, a third of a semitone; `[vib:6,0.3,0.2]` after a delay) |
| `c'4[arp:0,4,7]` | Plays a chord, one note a frame |
| `c'4[vol:8]` | Is quieter, `0` to `15` |

Several go together: `c'2[vib][vol:10]`. A held note carries what its first part says.

---

## 6. Samples, echo and pan

### Samples

The `dpcm` voice and the SNES's voices play samples. The engine's are by name
(`nacatamalon:kick`, `nacatamalon:piano`…), and **any sound file of your game** can be one:

```json
"instruments": {
    "hit": { "sample": "/samples/hit.wav" },
    "voice": { "sample": "/samples/ah.wav", "root": 64, "loop": 0.4, "adsr": { "attack": 0.05, "release": 0.3 } }
}
```

- The note chooses how fast it plays. On `dpcm`, `c'` plays it as recorded and lower notes play it
  slower and deeper. On the SNES, `root` says which note the file is (`60`, middle C, if not said).
- `loop`: where, in seconds, it starts again, so a note can be held. Without it, it plays once.
- `adsr` (SNES): seconds to come in, seconds to fall to `sustain` (`0` to `1`), and seconds to die
  away after the note ends.

The engine loads the files a song names before it starts playing it.

### Echo (SNES)

```json
"chip": "snes",
"echo": { "delay": 0.16, "feedback": 0.45, "volume": 0.3 },
"instruments": { "lead": { "sample": "nacatamalon:flute", "echo": true } }
```

The notes of instruments with `"echo": true` are heard again `delay` seconds later (up to `0.24`),
coming round again by `feedback`. It is the sound of a cave, a cathedral, a dream. The engine's
SNES strings, piano, flute, organ and choir already go into it.

### Pan

Each voice can be heard anywhere between left (`-1`) and right (`1`):

```json
"pulse1": { "notes": "...", "pan": -0.3 },
"pulse2": { "notes": "...", "pan": 0.6 }
```

The Genesis put each of its voices left, right or in the middle, and the SNES anywhere between:
opening the voices to the sides makes a song sound wide. In the game, a tween can carry a voice
across (see [section 9](#9-playing-it-in-a-game)).

---

## 7. Recipes

**A melody that sings.** `@lead`, or your own: `{ "volume": "15 14 13 12 11 10 | 9", "duty": "0 0 1",
"vibrato": { "speed": 6, "depth": 0.25, "delay": 0.2 } }`.

**Chords with one voice.** `@major` and `@minor` play the chord of the note they are on:
`@minor a1 | @major f1 | @major c'1 | @major g1 |`.

**A drum beat on the NES.** Kick, hat, snare, hat, in eighths:

```text
@kick x8 @hat x @snare x @hat x @kick x x @snare x @hat x |
```

**A fuller kick.** The triangle can add the body: put `@tri-kick c,4` under each `@kick` hit.

**An intro, then the song.** Write the intro bars first and `"loop": { "bar": 5 }`: the intro plays
once, and bars 5 on go round.

**Music that speeds up.** Nothing in the file: in the game, `song.setTempo(song.tempo * 1.2)` when
the timer is low, carrying on from the same beat.

**The same song, three consoles.** Change `chip` and the voices' names, and pick instruments for
each: a tune on `@lead` (NES), `@flute` (SNES) or `@fm-lead` (Genesis).

---

## 8. The songs the engine has

The engine has thirty-nine pieces old enough to belong to everyone, arranged for its consoles, ready to
play by key:

```ts
import { createScene, useLoadSong, useSong } from 'nacatamalon';

const Chase = () => {
    useSong(useLoadSong({ src: 'nacatamalon:mountain-king' }), { autoplay: true });
    return createScene();
};
```

| Key | Piece | Console | Good for |
|---|---|---|---|
| `fur-elise` | Beethoven, *Für Elise* | SNES | A title, a menu |
| `ode-to-joy` | Beethoven, *Ode to Joy* | NES | A victory, an ending |
| `mountain-king` | Grieg, *In the Hall of the Mountain King* | Genesis | A chase, a battle |
| `turkish-march` | Mozart, *Rondo alla Turca* | NES | A map, a level |
| `can-can` | Offenbach, the can-can | NES | A bonus, a race |
| `william-tell` | Rossini, *William Tell*, the galop | Genesis | A race, a charge |
| `funeral-march` | Chopin, *Funeral March* | SNES | A game over |
| `bridal-chorus` | Wagner, *Bridal Chorus* | SNES | A happy ending |
| `entertainer` | Joplin, *The Entertainer* | SNES | A shop |
| `gymnopedie` | Satie, *Gymnopédie No. 1* | SNES | The credits, a calm place |
| `toccata` | Bach, *Toccata and Fugue in D minor* | SNES | A castle, the last boss |
| `canon` | Pachelbel, *Canon in D* | SNES | An ending |
| `morning-mood` | Grieg, *Morning Mood* | SNES | The first village |
| `minuet-in-g` | Petzold, *Minuet in G* | NES | A palace, a tutorial |
| `greensleeves` | *Greensleeves* | SNES | A tavern, a forest |
| `korobeiniki` | *Korobeiniki*, Russian folk song | NES | A puzzle |
| `eine-kleine` | Mozart, *Eine kleine Nachtmusik* | SNES | A palace, a title |
| `moonlight` | Beethoven, *Moonlight Sonata* | SNES | A haunted place |
| `prelude-in-c` | Bach, *Prelude in C* | SNES | A menu, a save point |
| `bumblebee` | Rimsky-Korsakov, *Flight of the Bumblebee* | Genesis | A swarm, a panic |
| `spring` | Vivaldi, *Spring* | SNES | A meadow, a new day |
| `twinkle` | *Twinkle, Twinkle, Little Star* | NES | A night sky, a lullaby |
| `jingle-bells` | Pierpont, *Jingle Bells* | NES | A snow level |
| `saints` | *When the Saints Go Marching In* | NES | A parade |
| `oh-susanna` | Foster, *Oh! Susanna* | NES | A farm, a road trip |
| `amazing-grace` | *Amazing Grace* | SNES | A sunrise, a farewell |
| `yankee-doodle` | *Yankee Doodle* | NES | Toy soldiers |
| `frere-jacques` | *Frère Jacques*, as a round | SNES | A village, a school |
| `beethoven-fifth` | Beethoven, the Fifth Symphony, the opening | Genesis | A boss appearing, a reveal |
| `hallelujah` | Handel, *Hallelujah*, from *Messiah* | SNES | A triumph, a treasure |
| `stars-and-stripes` | Sousa, *The Stars and Stripes Forever*, the trio | NES | A parade, a victory lap |
| `mozart-40` | Mozart, the Symphony No. 40, the opening | SNES | A chase in a palace, a clock |
| `habanera` | Bizet, the Habanera, from *Carmen* | SNES | A dancer, a square at night |
| `toreador` | Bizet, the Toreador song, from *Carmen* | Genesis | An arena, a hero entering |
| `blue-danube` | Johann Strauss II, *The Blue Danube* | SNES | A ballroom, floating in space |
| `hungarian-rhapsody` | Liszt, *Hungarian Rhapsody No. 2*, the fast dance | NES | A cartoon chase, a frantic level |
| `gladiators` | Fučík, *Entry of the Gladiators* | NES | A circus, a clown |
| `valkyries` | Wagner, *Ride of the Valkyries*, the call | Genesis | An air battle, a charge |
| `danse-macabre` | Saint-Saëns, *Danse macabre*, the opening | Genesis | A graveyard, midnight |

A game carries only the ones it asks for. They change tempo, key and voices like any song. In a
scene, a `song` component can name one: `"song": "nacatamalon:canon"`.

---

## 9. Playing it in a game

```ts
import { createScene, useLoadSong, useSong, useTween, useUpdate } from 'nacatamalon';

const Level = () => {
    const song = useSong(useLoadSong({ src: '/music/level.song' }), { autoplay: true });
    const tween = useTween();

    // The drums out, then back in over a second.
    song.setVoice('noise', 0);
    song.setVoice('noise', 1, 1);

    // The harmony carried from left to right in two seconds.
    tween({ target: song.pan, to: { pulse2: 1 }, duration: 2 });

    useUpdate(() => {
        // Faster as the time runs out, from the same beat it was on.
        // song.setTempo(160);
        // A step higher for the last stretch.
        // song.setTranspose(2);
    });

    song.onBeat((beat) => {
        // Something on every beat: a crowd that bounces, lights that flash.
        void beat;
    });

    return createScene();
};
```

- `play`, `stop({ fade })`, `pause`, `resume`.
- `setVolume`, `setVoice(voice, volume, fade)`, `setPan(voice, pan, fade)` and `song.pan` for a
  tween.
- `setTempo(bpm)` and `setTranspose(semitones)` carry on from the same beat, heard at once.
- The song is made into sound **as it plays**, a moment ahead of what you hear, the way the
  console played it: it starts as soon as its file is in (a few kilobytes), holds almost nothing
  while it plays, and a change of tempo or key costs a few milliseconds. While the page is hidden
  it stops where it is with the rest of the game, and carries on from there.
- `onBeat` calls you on every beat while it plays.

A sound (`useSound`) has a `pan` too: `tween({ target: sound, to: { pan: 1 }, duration: 2 })`.

---

## 10. Bringing music from FamiTracker or FamiStudio

If you compose in a tracker, export your song as **text**: in FamiTracker, *File, Export text*; in
FamiStudio, *File, Export, FamiStudio Text*. Drop the `.txt` on the editor: it becomes
`public/music/<name>.song`, with its samples in `public/samples/<name>/`, and the editor tells you
what it could not bring over.

What comes over: the instruments' macros as our lists, the notes and their lengths, the volume
column, arpeggios, vibrato, portamento, the samples, and where the song loops. What does not: the
chips some cartridges added (VRC6, VRC7, FDS, MMC5, N163, S5B), fine pitch (`Pxx`), slides up and
down, and a speed changed partway. From code, `importTrackerText` in `nacatamalon/authoring` does
the same.

A game can also load the export as it is, with no `.song` made first: `useLoadTrackerSong` reads it
when it lands and gives the same song `useLoadSong` does, its samples kept in memory, played on the
engine's NES with its tempo, key, pan and beats.

```ts
import { createScene, useLoadTrackerSong, useSong } from 'nacatamalon';
import type { TSceneFn } from 'nacatamalon';

export const Title: TSceneFn = () => {
    // A file with several songs: { song: 2 } for the third.
    useSong(useLoadTrackerSong({ src: '/music/theme.txt' }), { autoplay: true });
    return createScene();
};
```

It reads the file every time the game runs, and says once what it left out. For a finished game,
the `.song` the editor makes is quicker to load. A game that never calls it carries none of it.

---

## 11. When something is wrong

The engine never stops a song for a mistake: it plays what it can read and says the rest.

- **A bar that does not add up**: "bar 3 adds up to 3.5 beats, and a bar of 4/4 has 4", with its line
  and column. Usually a length missing or one too many.
- **A note it cannot read**: a letter outside `a` to `g`, or a length that is not 1, 2, 4… 64.
- **An instrument it does not have**: `@leed` instead of `@lead`. It lists the ones it has.
- **A list with a wrong number**: "volume of lead, word 4: 'loud' is not a number". The rest of the
  instrument still plays.
- **A sample voice with no instrument**: the `dpcm`, SNES and FM voices need one on every note.

In the editor, these show under each voice and in each instrument's card as you type; `useSong`
says the first one in the console; `renderSong` returns them all in `errors` and
`instrumentErrors`.
