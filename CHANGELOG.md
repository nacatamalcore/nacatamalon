# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## 0.2.1 — 2026-10-12

### Added

- `useReady(callback)`: runs once everything being built with it exists, before the first frame. An
  object is built before the ones inside it, so a body, or a behaviour on the root of a scene laid
  out as a document, could not find its children with `findObject`: inside `useReady` it does. For
  something spawned later, it runs before the spawner's call returns. It runs with its object as the
  one being built, so hooks inside it belong to that object.
- `TEditorHandle.setScreenCamera2d(camera)`: draws what is pinned to the screen (a HUD, a box in
  screen space) through a camera instead of in screen pixels, and `setScreenCamera2d(null)` puts
  it back. For a tool whose view is bigger than the game's screen, such as an editor's canvas fitted
  to its window: the HUD shows where the player sees it and pans and zooms with the level, instead
  of sitting in the corner of the view. With it set, particles and lines pinned to the screen are
  drawn too, which in screen pixels they are not.
- `textBlockSize(text)`, on `nacatamalon/authoring`: how big a text's block came out the last time it
  was drawn, in its own pixels before its scale, for a tool to outline it and pick it by. Zero before
  it has been drawn once.
- **Ducking**: `useSound(src, { duck: { channel, to, fade?, release? } })` makes another channel
  quieter while the sound plays (the music under a cheer) and lets it back up on its own when the
  sound ends, is stopped or leaves with its object. With several at once the quietest wins. It moves a
  volume of its own behind the channel, put in the first time the channel is held down, so the one an
  options screen set with `useAudio().setVolume` is never touched. Type `TSoundDuck`; written to the
  scene document as the sound component's `duck`.
- **Intro and loop**: `loopStart` and `loopEnd` (seconds into the file) on `useSound` and `useMusic`.
  What comes before `loopStart` plays once, and a paused tune resumes inside the loop rather than in
  the intro. Both are written to the `sound` and `music` components of the scene document.
- **Sound made from text**, with nothing of the browser in it, so the same input gives the same
  samples in a game, an editor, a test or the desktop runtime:
  - `renderSong(doc, sampleRate?)` turns a song into one track per voice of an 8-bit console (two
    square waves, a triangle and noise), all the same length and rounded to whole bars, with where the
    loop goes back to. The notes are text (`"d'4 g8 a b c' |"`): letter, `#`/`b`, `'`/`,` for the
    octave, length, `.`, `~` to hold, `r`, `x` for a drum hit, and `|` to check that a bar adds up.
    What cannot be read comes back in `errors` with its line and column, and the rest is still
    played. The four voices at full volume never go past full scale. A third argument,
    `{ transpose }`, moves every voice but the noise by semitones.
  - `parseSongDoc` reads a `.song` file and `SONG_FORMAT` is its format number; `serializeSongDoc`, on
    `nacatamalon/authoring`, writes one.
  - `renderSfx({ preset, seed?, pitch?, length?, volume? })` makes a sound effect from a preset
    (`'coin'`, `'jump'`, `'hit'`, `'explosion'`); a seed is one take, always the same.
  - On `nacatamalon/authoring`: `mixSong` (the voices in one track), `encodeWav` (a 16-bit `.wav`) and
    `analyzeAudio` (duration, peak, RMS, both in dB too, and how many samples clipped).
  - Types `TSongDoc`, `TSongVoice`, `TSongVoiceName`, `TSongNote`, `TSongError`, `TRenderedSong`,
    `TSfxOptions`, `TSfxPreset`, `TAudioMeasure`.
- **`useSong(song, options?)`** plays a song written as notes (a `.song` from `useLoadSong`, or a
  `TSongDoc` written in code), its voices as layers in time. `setVoice` drops or brings back a voice,
  `setTempo` and `setTranspose` change tempo and key carrying on from the same beat, `onBeat` follows
  it, and `errors` says what in the notes could not be read. The song's `loop` bar makes the bars
  before it an intro. Types `TSongOptions`, `TSongHandle`, `TSongAttachment`.
- `useLoadSong({ src, key? })` loads a `.song`, cached and counted by a loading scene like every
  asset. Type `TSongFile`, `TUseLoadSongOptions`.
- **`onBeat((beat, bar) => …)`** on `useMusic` too, given `bpm` (and `beatsPerBar`, `firstBeat`). It
  goes by the audio clock rather than the frames, and when the tune goes round its loop the count goes
  back to the loop's bar. Type `TBeatListener`.
- `useSound({ sfx: { preset, … } })` plays an effect made on the spot by `renderSfx`, with no file.
- The scene document has a `song` asset type and a `song` component (`song`, `volume`, `channel`,
  `autoplay`, `voices`, `tempo`, `transpose`), and the `music` component keeps `bpm`, `beatsPerBar`
  and `firstBeat`. Type `TSongComponent`. A song or an effect made in code has no file and is not
  written down.
