# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## 0.2.2 — 2026-10-12

### Added

- `writeSongNotes(notes, voice, meter)`, on `nacatamalon/authoring`: one voice's notes written as text,
  the inverse of reading them, so a tool that changes notes by hand (a click on a piano roll) gives
  back a voice a person can still read. Every bar is closed with `|`, a note that crosses a bar or
  that no single length can write is held across with `~`, the gaps are rests, a length is only
  written when it changes, and the bars go four to a line. Reading what it writes gives back the same
  notes.
- `parseSongNotes(text, voice, meter)`, on `nacatamalon/authoring`: one voice's text read into its
  notes, where it ends and its mistakes with their line and column, the same reading `renderSong`
  does, for a tool that shows or changes the notes without making them into sound.
- `TEditorHandle.updateSong(src, doc)`: a `.song` saved again while the game runs is heard changed.
  Every loaded song from that `src` (or kept under that key) takes the new notes, and each `useSong`
  playing it makes its tracks again and carries on from the same beat. Says how many it changed:
  none when the game has not loaded the file.
- `TEditorHandle.stepFrames(count, dt?)`: runs several frames of a paused game in one go and draws
  only the last, so a host gets to a later point of the game (a song that changes at 45 seconds)
  without waiting for it. Each frame runs as an ordinary one; particles, which move while drawing,
  advance one frame.
- `TEditorHandle.setAudioClock('audio' | 'frames')`: what the music counts time by. On `'frames'` a
  song's position and its beats (`onBeat`) move with the game's frames, stepped or paused with it,
  and the audio engine is held still; back on `'audio'` every tune plays on from where the frames
  got it to.
- `TEditorHandle.startSoundLog()`: keeps a log of what the game sounds like (every sound, when it
  began and stopped on the clock the music counts by, from where in it, its fades, its channel's
  volume) until the function it gives back is called, which hands the log over (`TSoundLog`, on
  `nacatamalon/authoring`). What a clip made a frame at a time, with the audio engine silent, gets
  its sound from, mixed offline afterwards. Placing in the world, ducking and changes of speed along
  the way are not kept.
- Four sound-effect presets for games with people in them: `crowd` (a stand murmuring, rising and
  falling on its own; as long as `length` asks), `cheer` (an ovation, the crowd roaring up with
  clapping over it), `whistle` (a referee's, warbling) and `bat` (a wooden bat on a ball: a crack
  over a hollow knock). Through `renderSfx` and `useSound({ sfx })` like the others.
- `SFX_PRESETS`: the presets `renderSfx` makes, in order, for a tool that offers them.
- Motions: values of a scene moved over time by keys, in a `.motion` file (a camera sweeping a field,
  a title coming in, a menu opening). Each track names a box by its id (and by its name when no box
  has that id), optionally one of its components, and a field (`x`, `zoom`, `tint.a`, `visible`),
  with keys that move along any of the easing curves by name. Events on the way play a sound the
  scene carries, change the scene under a transition, or call a mark a behaviour listens for.
  - `useLoadMotion({ src })` and `useMotion(motion, { autoplay, loop, speed })`, whose handle has
    `play`, `pause`, `resume`, `stop`, `seek`, `on(mark, …)` and `onEnd`. It moves on the scene's
    clock, so it stops with the scene's pause and steps with the editor's frames.
  - A `motion` component in scene documents, and a `motion` asset, so a scene plays one with no
    code. A scene shown rather than played (`scripts: 'attach'`) keeps it still.
  - `parseMotionDoc`, `MOTION_FORMAT` and `MOTION_VERSION`.
  - `serializeMotionDoc(doc)`, on `nacatamalon/authoring`: a motion as the text of its file, a key a
    line, for a tool that saves one.
  - `TEditorHandle.previewMotion(doc, seconds)` puts the running scenes where a motion has them at a
    moment without playing it, `endMotionPreview()` puts back what it touched, and
    `updateMotion(src, doc)` hands a saved `.motion` to what plays it, from the same moment.

### Changed

- `useSong` follows its file: when the song it plays is given new notes (through
  `TEditorHandle.updateSong`), it makes its tracks again from the same beat, at the new tempo if the
  file changed it, instead of playing the old notes until the scene starts over.
- The built package leaves out the imports of a shared chunk that bring nothing in
  (`import "./chunk-….js";`). A game's bundler dropped them anyway, since the package says it has no
  side effects, and warned about each one (`ignored-bare-import`) on every build of every game: now
  there is nothing to warn about.
- A sound effect playing while a host steps the game (music on `'frames'`) carries on from where the
  frames got it to when the game plays again, or is gone if it ran out meanwhile, instead of picking
  up where the frozen audio engine left it.
- A transition stepped by a host (`stepFrame`) moves by the step's time, not by however long the
  page took between two frames.

### Fixed

- A looping song or piece of music no longer calls `onBeat` twice for the first beat of its loop when
  its position lands a hair short of the loop's end (time added up a frame at a time does): that is
  the start of the loop, counted once.
