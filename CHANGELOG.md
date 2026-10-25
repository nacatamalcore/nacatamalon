# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased

### Added

- **`×` in the fonts built into the engine** (Nacatamal Arcade, Square and Thin), at the height of
  `+`: a score's `×3`, a size's `2×2`. It was drawn as the missing glyph.
- **`song.notes`**, on what `useSong` hands back: the notes it plays, every voice's, in the order
  they start, each with its `voice`, its `start` and `beats` in beats, its `pitch`, and its
  `instrument` and `effects` when it has them. There once the file is in, before it plays, so a
  rhythm game lays out its notes from the song itself rather than writing them a second time, and
  places one falling towards the line by `note.start - song.beat`. Its pitches follow
  `setTranspose`; its beats stay put at another tempo.
- **A pivot in 3D**, `transform.pivot`: the point a placement turns and grows about, in its own
  units from its origin, as a sprite's `pivot` is in the plane. On a box (`useTransform({ pivot })`),
  a mesh or a model: a runner that stumbles forward over its feet with `pivot: { x: 0, y: -1, z: 0 }`
  and `rotationX`, a door on its hinge, with no parent box and no quaternions composed by hand.
  Setting it moves nothing; a turn or a growth goes about it, and what the box holds goes with it.
  Physics, sound in space and `worldToLocal3d` find it where it is drawn, and a scene document keeps
  it (`"pivot"` in a transform, written only when set). Pictures and lights inside still turn about
  the origin, as with `quaternion`.
- **Dragging.** Every sprite, text, nine-slice and object (`listen(self, …)`) has `onDragStart`,
  `onDrag` and `onDragEnd`: pressed with the main button or a finger and moved a few pixels of the
  page (more for a finger), the press is a drag and no longer a click, followed wherever the pointer
  goes, one per finger. They give where it began and how far it went (`startX`, `deltaX`…), and
  `target` and `hits` are what is under it, never itself: what it was let go over. The cursor is an
  open hand over what can be dragged and a closed one while it is. **`useDraggable(target, options)`**
  moves it: held where it was taken, along an `axis`, on a `grid`, inside `bounds`, dropped on what
  carries one of the tags `dropOn`, or into a drop zone (said in `dropped`), and back home with
  `snapBack`. It returns `enable`, `disable`, `isEnabled` and `isDragging`, to let something be
  dragged later. **`useDropZone(target, { accepts })`** makes a place to drop into, accepting one tag
  or several: `canDrop()` while something it accepts is dragged anywhere and `isOver()` while it is
  over it, read every frame to light the places a card can go, off by themselves when the drag ends;
  `onEnter`, `onLeave` and `onDrop` for the same as events, and `enable`/`disable` for a slot that
  fills. The drag events give the zone under them in `zone`.
- **Glow maps in model files.** A glTF material's `emissiveTexture` is read with its colour picture
  and its glow comes through it: lit windows on a dark wall, a screen, a logo, after the lighting
  and so lit in the dark, in both renderers and through a material's looks (`ctx.emissive`). It
  ends up on `material.emissiveTexture` of every piece. Read with the colour picture's edges and its
  first set of coordinates. A glow picture that is not fetched (`textures: false`), still on the
  way, or one the engine cannot read (only an extension names it) leaves the piece with no glow,
  rather than with the glow over all of it. Until now such a glow was always dropped.
- **`emissiveTexture` on a material built in code**: `createMaterial({ shader: 'mesh3d',
  emissiveTexture })` and `createMesh({ emissiveTexture })`, the same picture a model file gives, for
  a screen or a sign made in code; a picture drawn into (`createSpriteTexture`) makes a monitor that
  glows with what a camera sees. A scene document keeps it by asset key (`"emissiveTexture"`, written
  only when there is one).
- **Masks.** `useMask` keeps objects, and everything under them, to a rectangle or to the shape of
  another object: a list scrolling in a window, a torch over a dark level, a hole cut in a wall, a
  wipe. It masks nothing until it is added (`mask.add(box)`, as many as want it, `remove`), so one
  mask can keep a map and its enemies and leave the HUD alone. A rectangle is in the masked object's
  own space and, square to the screen, costs nothing (a scissor). A shape (`by`) is everything
  another object draws, sprites by their pictures, shapes and texts, added together; it moves, turns
  and is tweened like any object, and is not drawn unless `showShape`. `channel: 'luminance'` reads a
  black and white cut-out, `invert` draws only outside, and `soft` fades by the shape instead of
  cutting at half way. A hard mask is written into the stencil in the pass, with no picture of its
  own; only a soft one draws into pictures. A mask inside another keeps to both, `zIndex` sorts what
  is masked as it always did, and what a mask keeps out is not touched by the pointer. The same
  frame on WebGPU and WebGL2. A scene document keeps it as a `mask` component on the masked object,
  its shape named by id, and the editor edits it in the inspector and outlines it on the selection.

### Changed

- **The depth of every pass has a stencil**: `depth24plus-stencil8` on WebGPU, `DEPTH24_STENCIL8`
  and a canvas with `stencil: true` on WebGL2, which is what masks write. Most cards already keep 24
  bits of depth in 32, so it costs little or nothing; the stencil is not stored after a pass, and a
  frame with nothing masked draws exactly as before.

- **An object gives off as many lights as it asks for.** Each `use…Light` call adds one, placed by
  its own `transform`, as `createMesh` adds a model: a car's two headlights and two tail lights are
  four calls in the car, the lamps of a room calls in the scene, with no `useSpawn` for each. A
  second light used to replace the first. `box.light` is now `box.lights`, a list, and a scene
  document keeps every light of a box as a component of its own. The ambient light stays one level
  for the scene: when there are several, the last one made sets it, said once (they used to add up).
- **Eight lights per model, thirty-two per scene.** A scene used to draw its first eight lights and
  drop the rest; now it holds thirty-two (`LIMITS.SCENE_LIGHTS`), and each model is lit by the eight
  that reach it most (`LIMITS.LIGHTS`), as the consoles of the era lit each thing they drew: a sun
  always, a lamp when its `range` touches the box around the model, the strongest first. A corridor
  of torches, a street of lamps or a level of fires is lit all along, and what a corner costs to
  light is still eight lights at most. A scene of eight lights or fewer looks exactly as it did.

### Fixed

- **A model whose picture is kept inside its `.glb` lost it when its scene was saved and opened
  again.** Saving wrote that picture under the name the engine gives it inside the file
  (`car.glb#image:0`) and listed it to be fetched; opening the scene fetched that name, failed, and
  the piece was drawn without its picture. A piece of a model file now writes no picture at all: the
  file brings it back.

## 0.2.7 — 2026-10-23

### Added

- **A synthetic voice, `nacatamalon/speech`**, that speaks and sings, made sample by sample the way
  the machines of the eighties talked: a throat, five formants, noise for the s, the stops and the
  nose. `renderSpeech` says text or phonemes, `renderSinging` sings notes with a syllable each, and
  both hand back a sound for `useSound`. Spanish is read by rules (`textToPhonemes` shows how);
  any other language is written as phonemes. A door of its own, so a game that never speaks carries
  none of it.
- **A song sung over, `accompany(vocal, song)`**, from `nacatamalon/speech`: a song's voice written
  apart, as a vocal part (a `.vocal` file, loaded with `useLoadVocal`, or a `TVocalDoc` in code), and
  sung over any `.song` by `useSong`. The part is made as it plays, like the song, in a lane of its
  own (`vocal`), at the song's tempo and in its key, following them when they change, round its loop.
  A part can have several singers, each line sung by some of them, each one's voice and range their
  own. `lyricsAt(vocal, song.beat)` says the line being sung, its words so far and who sings it, for
  words that come up in time. The `.song` format is unchanged.
- **`useRectLight`**, a panel: a lamp shaped like a rectangle that shines from its front only, its
  `width` and `height` along its own X and Y and its `range` from the nearest point of the panel. It
  faces down unless turned, like a light in the ceiling: a strip light, a window, a screen, a sign.
  It casts no shadows. Scenes keep it (`kind: 'rect'`).
- **Instruments** for a song's voices, the way an 8-bit tracker shapes a note: `volume`, `duty`,
  `arpeggio` and `pitch` as lists of numbers read one a frame (a sixtieth of a second), with a `|`
  where a list starts again, plus `vibrato` and `slide`. A song keeps them in `instruments`, a voice
  starts with its `instrument`, and `@name` in its notes changes it (`@-` for none). What cannot be
  read in them is in `instrumentErrors`, with the instrument, the field and the word, and
  `songInstrumentErrors` finds the same without making the sound. A song with no instruments sounds
  exactly as it did.
- **What one note does on its own**, written in brackets after it: `[slide]`, `[vib]`,
  `[arp:0,4,7]`, `[vol:8]`.
- **The engine's instruments** (`SONG_INSTRUMENTS`), played by name with nothing to define: `@lead`,
  `@pluck`, `@major`, `@bass`, `@kick`, `@snare`… A song's own of the same name is played instead;
  `@nacatamalon:kick` always means the engine's.
- **A fifth voice, `dpcm`**, that plays samples at the console's grain: the engine's (`SONG_SAMPLES`:
  a drum kit, an orchestra hit, a zap, made by its own code) or a sound file of the game, which
  `useLoadSong` loads before the song is ready.
- **Two more consoles**, by a song's `chip`: `'snes'`, eight voices of samples in the console's BRR,
  at its rate and smoothing, with envelopes (`adsr`) and an `echo` the instruments go into; and
  `'genesis'`, six FM voices of four operators (`fm`: the eight algorithms and feedback) and the
  squares and noise of its second chip. The engine has instruments for both: `@piano`, `@strings`,
  `@choir`… and `@epiano`, `@slap-bass`, `@fm-brass`…
- **Thirty-nine songs the engine has** (`SONG_BUILTINS`): public domain pieces (Beethoven, Grieg,
  Mozart, Bach, Handel, Vivaldi, Wagner, Bizet, Satie, Joplin, Sousa, and folk songs and hymns)
  arranged for the three consoles, asked for by key,
  `useLoadSong({ src: 'nacatamalon:ode-to-joy' })`, and loaded only when a game asks for one.
- **Pan**, where between left (`-1`) and right (`1`) a sound is heard: `useSound(clip, { pan })`, and
  for a song each voice's `pan` in its file or `useSong(song, { pan: { pulse2: 0.6 } })`. Both
  handles move it with a fade (`setPan`) and have a `pan` a tween can carry across:
  `tween({ target: sound, to: { pan: 1 } })`, `tween({ target: song.pan, to: { pulse2: -1 } })`.
  Scenes keep it.
- **Where a song is heard**: `song.position`, the seconds into it that are reaching the speaker now,
  by the audio clock and with the output's delay taken off, `song.beat`, the same in beats from the
  start (`3.5`, right at any tempo), and `song.latency`, that delay: what a
  rhythm game judges a press against, and how early to start a sound meant to land on a beat.
  `onBeat`, a song's and a piece of music's, now comes on the beat heard, that much later than it is
  played. `useAudio().setOffset(seconds)` adds the player's own delay (Bluetooth headphones), which a
  game measures and keeps as it likes, and all of these count it. Music from files (`useMusic`) has
  them too: `position`, `positionAt`, `latency`, and `beat` counted from its `firstBeat` at its `bpm`.
- **When a press happened**: `keys.pressedAt(key)`, `pointer.pressedAt(button?)`,
  `pad.pressedAt(button)` and `actions.pressedAt(name)` say when it went down, the frame it did, and every pointer event has its
  `time`: the moment of the hand, from the event itself, up to a frame before the frame that tells of
  it. `song.positionAt(moment)` is where the song was being heard then, for judging a press against
  the beat.
- **`importTrackerText`** in `nacatamalon/authoring`: a text export of FamiTracker or FamiStudio as one
  of our songs, its instruments, its samples as sound files, and what could not be brought over. The
  editor does it when one is dropped on it.
- **`useLoadTrackerSong({ src })`**: the same export loaded by a game as it is, read when it lands,
  its samples kept in memory: the song `useLoadSong` gives, for `useSong`. A game that does not call
  it carries none of the reading.

### Changed

- **A hidden page holds the game's sound too** (`pauseOnBlur`, on by default): every sound and song
  stops where it is while the page cannot be seen and carries on from there when it is back, where
  until now the game stopped and its music played on unseen. An editor holding the sound still while
  it runs the game a frame at a time keeps it so when the page comes back.

- **A song is made into sound as it plays**, half a second ahead of what is heard, the way the
  console played it, instead of all at once before it starts. It starts at once, holds a moment of
  sound rather than tens of megabytes, and a change of tempo or key is heard at once (20 ms on) and
  costs a few milliseconds where it cost a quarter of a second. What it plays is, sample for sample,
  what `renderSong` makes, round its loop as many times as it goes. The SNES's echo goes on round the
  loop by itself rather than having what spills past the end carried back to where it starts.
  A game that stops for longer than half a second (a frame of seconds) hears a silence and goes on
  from where the song is by then, never what it missed all at once. On the native runtimes, where
  the game's code is interpreted, it is what makes a song playable at all: a Genesis song that took
  seconds of a frozen game to make costs a few milliseconds a frame. `useSong` and everything it
  hands back are as they were. A log of the game's sound (a clip with its sound) counts a voice of a
  song as one sound heard, however many stretches it took.

- **One way to write every type's name**: small letters, words joined by a hyphen, and `2d` or `3d`
  after a hyphen too, as `physics-world-2d` and `particle-collider-2d` already were. In scenes and
  boxes: `camera2d` is now `camera-2d`, `camera3d` `camera-3d`, `particles3d` `particles-3d`, and a
  body is called what it is, `physics2d` now `physics-body-2d` and `physics3d` `physics-body-3d`,
  as `usePhysicsBody2d` says. Among assets, and in packs, `bitmapFont` is now `bitmap-font`. A
  `.particles` file's `kind` is `particles-2d` or `particles-3d`. The records a game holds say the
  same in their `type` (`_type` for a body), and a font's or a map's: `bitmap-font`,
  `tilemap-asset`. An old name is read as any type the engine does not have: a scene says so and
  leaves that component or asset out (kept, so saving loses nothing), and a `.particles` file is
  refused. Write the new name in its place.
- **The engine's constants are on the root in groups**, read only and frozen all the way down, so
  writing into one throws instead of changing it for every game on the page:
  `import { LIMITS, BUILTIN } from 'nacatamalon'`. A game carries only the groups it reads.
  - `RENDER`: `TYPE` (was `GAME_CONFIG.RENDER_TYPE`, which is gone) and `LINE_VERTEX_FLOATS`.
  - `INPUT`: `GAMEPAD_BUTTONS`, `GAMEPAD_AXES`, `GAMEPAD_BUTTON_LABELS`, `GAMEPAD_AXIS_LABELS`,
    `POINTER_BUTTONS`; `DEADZONE` (was `DEFAULT_ACTION_DEADZONE`, now also the pad's, one number
    for both) and `ACTION_PRESS` (was `DEFAULT_ACTION_PRESS`).
  - `LIMITS`: `LIGHTS` (was `MAX_LIGHTS`), `PHYSICS_LAYERS`, `PALETTE_COLORS` (was
    `MAX_PALETTE_COLORS`).
  - `PHYSICS`: `ALL_LAYERS`.
  - `POST`: `CRT_PRESETS`, `COLOR_LEVELS`.
  - `BUILTIN`, what the engine carries by kind: `FONTS` (new), `MUSIC.SONGS` (was `SONG_BUILTINS`),
    `MUSIC.INSTRUMENTS` (was `SONG_INSTRUMENTS`), `MUSIC.SAMPLES` (was `SONG_SAMPLES`), `SOUNDS`
    (was `SFX_PRESETS`), and the keys of the post effects (`POST`) and material looks (`LOOKS`).

  The loose names are gone from the root.

### Fixed

- **A FamiTracker song keeps how its notes die away.** A row with no note that only changes the
  volume (how a tracker writes a note fading, a row at a time, and how songs taken from a game are
  written almost throughout) was read for the next note only, so every note sounded at the volume it
  started at until the next one: the last notes of a song held loud until it went round. Each note
  whose volume moves now plays with an instrument of its own whose `volume` list says the same a
  frame at a time, its instrument's own list taken along; notes that die away alike share one. On
  songs taken from games, how loud each voice is goes from following the tracker's a third of the
  way to all the way.

- **A song's change of tempo or key carries on from where it is**, not from where it was when the
  change was asked: making the new tracks takes a moment (a quarter of a second on a fast machine),
  the old ones play on meanwhile, and that moment was heard twice.
