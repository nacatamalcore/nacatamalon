# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## 0.3.0 — 2026-10-28

### Added

- **`useGame().setPixelSnap(mode)` and `getPixelSnap()`**: which pixels the game draws on, changed
  while it runs, from the next frame, for an option a player picks or to compare them. Nothing moves
  when it changes: only where things are drawn.
- **`RENDER.PIXEL_SNAP`**: `SCREEN`, `GAME` and `OFF`, the three `pixelSnap` takes, as constants.
- **Input maps ready to use**, `INPUT.ACTION_PRESETS`: `nes`, `genesis`, `snes` and `arcade`, whose
  actions are the console's buttons (`a`, `b`, `start`…; `button1` to `button6` and `coin` on an
  arcade) sitting on the pad where they sat on its own, and `platformer` (`jump`, `action`,
  `pause`). Every one has the four directions on the arrows, WASD, the d-pad and the left stick:
  `createGame('#app', { actions: INPUT.ACTION_PRESETS.genesis })` instead of sixteen bindings. The
  editor's agent starts a project's map from one with `use_action_preset`, adding only the actions
  it does not have yet.
- **The mouse in the action map**: `{ type: 'mouse', button: 'main' }` (`'right'`, `'middle'`,
  `'back'`, `'forward'`), so "fire" is J or a click and the game reads one action. Held like a key,
  with its edges from the events, so a click between two frames is still a `justPressed`. A pen
  counts and a finger does not: a finger touches the screen for every button drawn on it, and those
  are `touch` bindings. It belongs to the keyboard's player (`'any'` and `'keyboard'`, not a pad's
  port). `describeBinding` says `'Mouse Left'`; a controls screen binds it with
  `capture(done, { sources: ['key', 'mouse'] })`, never by default, so a click on its own buttons
  does not bind itself. The editor's `bind_action` takes `mouse`.
- **Music that fades in and out with its scene**: `fadeIn` and `fadeOut`, in seconds, on `useMusic`
  and `useSong`, in a scene document and, for a song, in the editor's inspector. `fadeOut` is how
  long it takes to go down to silence when its scene stops or its object is destroyed, heard after
  they have gone, instead of being cut; `fadeIn` is how long `autoplay` takes to come up. With both,
  two scenes cross their music: `fadeOut` on the menu's, `fadeIn` on the level's.
- **`useGame().onResized`**: told the game's new size, `{ width, height }`, each time it changes:
  the window or the container resized, full screen entered or left. Only with a `keep` other than
  `'both'`, the one where the size follows the screen. Heard at the start of the first frame with
  the new size, before any update, once per change however many times the browser said so, and not
  when only the density changes. A HUD pinned to the right edge of a `keep: 'height'` game is placed
  there again, instead of reading `getWidth()` every frame.
- **`useSceneTransitionEnd`**: runs once, when the transition a scene came in with is over and
  nothing covers it. A scene brought in with `change(name, { transition })` starts at once and
  waits behind the cover while it loads, so its body and `useReady` run before anybody sees it. Its
  clock waits with it, but a `play()` does not: started here, the music of a level begins when the
  level can be seen. Without a transition it runs on the scene's first frame, before its
  first update, so a scene does the same with its transition or without it.
- **Text that breaks its own lines.** `style.maxWidth` is how wide a line can be, in pixels, before
  its words go on to the next: a dialogue box, a panel's description, with no `\n` put in by hand
  and none to put in again when the text or its size changes. Lines break at spaces, and a word
  wider than the whole width between two letters; a `\n` still starts a line. The block is as wide
  as `maxWidth`, so `align` and `anchor` place the lines in the box rather than around the words.
  The same for a bitmap font and a vector one, in `drawText` too, in a scene document, and in the
  editor's inspector as Max Width.
- **`measureText`**: how a text is set, `{ width, height, lines }`. Given a text from `createText`,
  `measureText(label)`, with its own font and style. Given words, `measureText('CONTINUE', options)`,
  how they will be set before there is a text, with the same font and style options as `drawText`:
  a panel fitted to its label before the label is made, a title tried at smaller sizes until it
  fits, a dialogue shown letter by letter from its lines so no word jumps to the next line halfway.
  The block is measured as the engine places it, the same numbers `sizeOf`, `align` and `anchor`
  use, in the text's own pixels; `lines` says what each line says once `\n` and `maxWidth` have
  broken it. Words need no game to be measured, and measuring them in a vector font draws no letter
  into its atlas.

### Changed

- **`pixelSnap` says which pixels: `'screen'`, `'game'` or `'off'`**, no longer yes or no. Not said,
  it is `'screen'` for pixel art and `'off'` for a `smooth` game. `'screen'` puts everything flat, the
  camera and the layers with parallax on whole pixels of the screen: with the camera zoomed in to 3
  a pixel of the art is still three of the screen and stays three wide, and things move a screen
  pixel at a time, so a far layer on a slow scroll glides instead of jumping three pixels every so
  often. `'game'` is how it drew until now, everything on whole pixels of the art as the consoles
  drew, and at zoom 1 the two are the same. `createGame({ pixelSnap: true })` is now refused with the
  three names; a `project.json` that says `true` or `false` is read as `'screen'` and `'off'`.
- **A layer with parallax under `pixelSnap: 'off'` moves between pixels**, as smooth as the camera.
  It was always put on whole pixels, which in a smooth game stepped the far layers and nothing else.

### Fixed

- **A tilemap drawn bigger than 1:1 keeps its pixel art square.** To keep a cell from reading the
  tile next to it in the sheet, its corners were pulled half a texel in, which squeezed a tile's
  sixteen texels into the width of fifteen: at zoom 3 its columns came out 2, 3 and 4 screen pixels
  wide instead of all 3, and the outermost ones half as wide as the rest. The corners now show the
  whole tile and the read is kept half a texel inside it, as a sprite's is, on both cards, with a
  material and as a mask too. Every texel is as wide as the next, and a cell between two pixels
  still never shows its neighbour.
- **A camera moved by hand no longer shimmers the picture under `pixelSnap`.** Everything was drawn
  on whole pixels but the camera, unless it was a `useCameraFollow`: a `useCamera2d` panned in an
  update by a fraction a frame moved the whole picture between pixels, and a stripe one pixel wide
  came out two or four screen pixels wide depending on the frame. The scene's camera is now drawn
  from the same pixels too, and where it is keeps its fractions. The pointer reads the world through
  the camera as it is drawn (`worldX` in its events, `position()`, `touches()`, a drag's start), so
  what is touched is what is seen. A layer with parallax is left behind by its share of the camera's travel
  rounded once, so a cloud on a slow scroll only ever steps one way instead of a pixel on and one
  back.
- **A sound that starts on its own waits for its scene to be let go.** `autoplay` on `useSound`,
  `useMusic` and `useSong` started as soon as the file arrived, so in a scene coming in with a
  transition it sounded under the cover, over the music of the scene still on screen. It now waits
  for the swap, when the screen is covered.
- **A press the browser did not make is still a press.** A `pointerdown` sent by a test or a script
  carries the id of a pointer that is not there, and keeping its release on the canvas threw, so the
  press never reached `usePointer`. Now it does.
- **Each thing keeps its own colour.** `getColor` handed a colour already made back as it was, so
  texts and sprites given the same constant (`tint: gold`) all held that one object: fading one
  (`who.tint.a = 0.3`, a `fade` behaviour, a motion on `tint.a`) faded all of them and the constant
  too. `getColor` now always gives a new colour, and every option that takes one reads it through
  there. Assigning a constant (`who.tint = gold`) still shares it; `getColor(gold)` is a copy.
