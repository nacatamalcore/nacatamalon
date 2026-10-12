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

### Changed

- `useSong` follows its file: when the song it plays is given new notes (through
  `TEditorHandle.updateSong`), it makes its tracks again from the same beat, at the new tempo if the
  file changed it, instead of playing the old notes until the scene starts over.
- The built package leaves out the imports of a shared chunk that bring nothing in
  (`import "./chunk-….js";`). A game's bundler dropped them anyway, since the package says it has no
  side effects, and warned about each one (`ignored-bare-import`) on every build of every game: now
  there is nothing to warn about.
