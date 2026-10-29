# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased

### Added

- **`ownerOf(drawable)`**: the object a sprite, text or mesh belongs to, the thing `useSpawn` made
  or the scene for one made in its body, and `null` once it or its piece is destroyed. The way back
  from what was touched to the whole piece: `destroy(ownerOf(info.target))` takes the piece, where
  `destroy(sprite)` takes only that sprite and leaves the piece running with its other sprites and
  its `useUpdate`, which `destroy`'s documentation now says.

- **`letterAt(text, info)`**: the letter of a text under the pointer, `{ index, char, line }`, with
  `text.text[index]` the one touched and `line` counting the ones `maxWidth` broke; `null` on a space,
  between letters or lines, or outside. Seen as drawn, through the text's own camera (one on the
  screen's layer too), turned, grown and held by its pivot. A letter is its whole step along its line,
  so a vector font's `o` is touched above and below its ink. For spelling games, words of dialogue to
  pick, a caret to place: `listen(word, { onClick: (info) => letterAt(word, info) })`.

- **`align` in `createGame` and `project.json`: where the game sits in its page.** `'center'`, a side
  (`'top'`, `'bottom'`, `'left'`, `'right'`) or a corner (`'top-left'`…), also as `RENDER.ALIGN.TOP`…
  It only says which side the space left over goes to, never the size, which `scaling` still
  decides. Said, it wins over the page's CSS. Left out, the page decides: a flexbox or a grid puts it
  where it aligns its content, and any other container in the middle both ways. Full screen is
  always the middle. `createGame('#app', { width: 320, height: 180, scaling: 'integer', align: RENDER.ALIGN.TOP })`
  for a phone with the page's controls below.

### Changed

- **What goes with a destroyed object says it is destroyed.** `destroy(piece)` took its sprites,
  texts and child objects with it, but they kept `destroyed: false`, as if only what `destroy` was
  called on had gone: a game still holding a sprite of a piece it destroyed read it as alive. Now
  they are `true` too, as their documentation already promised: true means it is no longer part of
  the game.

- **Calling a hook or a `create*` where nothing is being built says how to get what was wanted.**
  `createSprite` in a `useUpdate` said only to call it inside a scene body, and the guide answered
  "spawn things with `useSpawn`", itself a hook that throws the same there: a game that wanted fish
  while it ran made a pool of hidden sprites instead. The error now says to put the thing in a piece,
  get its maker in the body (`const spawn = useSpawn(Fish)`) and call `spawn(…)` from `useUpdate` or a
  timer; `useSpawn` says it gives a maker; any other hook, to keep what it gives. In the shape of
  every message, who, what happened, what to do: `createSprite: called where nothing is being built
  (from useUpdate, a timer, a callback or after an await). Call it inside a scene body…`. A hook's
  own advice still follows it.

- **A model's material carries its second picture's place in spare numbers.** `ctx.uv2` rides in
  the fourth number of the facing and of the place on the screen instead of a slot of its own, on
  both cards: a material drawn on both sides used all 16 slots WebGPU promises and all 15 rows
  WebGL2 does, and now leaves one, for whatever a material carries next. Nothing drawn changes.

### Fixed

- **A game shown in a window of its own runs by that window.** A host can put the canvas in another
  window (a play window popped out of a tool), and the loop took its frames from the window the
  engine was loaded in: closed, the game kept drawing into nothing, a WebGPU error every frame
  (1,129 in a second, measured in Chromium), and minimising the other one froze it while it was in
  sight. Its frames, its size, its screen's density, its full screen, its pointer capture and its
  pause when hidden are now its own window's, the way its keyboard already was; closed, it stops.
  A game on its own page is drawn exactly as before.
- **WebGPU and WebGL2 draw a sprite of odd size held by its middle the same.** `pixelSnap` put
  where it is drawn on a whole pixel, and a sprite 5 wide by its middle there has its edges on
  halves. There the graphics card chose which texel each column showed, a column one way in WebGPU,
  the other in WebGL2, and sometimes with the first twice and the last gone. Now an edge left exactly
  between two pixels goes to the one before, for sprites, texts and panels that are not turned (a
  whole turn counts as none); anything else is drawn where it was, so a sprite growing by fractions
  still grows smoothly. The lines of a text centred on several lines can still fall on halves.
  Measured with Auto Size's 167 × 167 card: 2,058 pixels different between the two, now none.
- **The canvas sits where its page asks, and centred when it asks nothing.** Since 0.3.1 the engine
  set a margin on the left, rounded to a whole pixel of the screen, and a page that also centred it
  with `display: flex` (every CLI template, the editor's demos, the playgrounds, full screen) added
  half the leftover again: 5 px to the right in a 1300 px window, 80 px on a wide monitor. Now a
  container that lays its content out itself, a flexbox or a grid, says where the game goes, by its
  own `justify-content` and `align-items` (a grid's `justify-items`), and it goes there: a corner,
  the far side, the middle. Any other container has said nothing, and the game is centred both ways,
  up and down too, as it was only in full screen. The far margins are `auto`, so the page has
  nothing left to add; in a plain container the way down is a `top`, because a margin there went out
  through it and moved the whole container down. Either way it lands on whole pixels of the screen.
  Measured in Chromium at densities 1 to 2 over eight kinds of page.
- **A container's padding is room the game does not take.** It was counted as room: 40 px of it
  round the game had the canvas sized past its edge and off-centre.
- **A container with no size of its own no longer shrinks the game.** A bare `<div id="app">`, or
  one a centring page shrinks round what it holds, is as big as the canvas, and the game was scaled
  against itself, smaller every time, down to a corner. The container is measured without the canvas
  in it now, and along a side it has no size, the game keeps its own.
- **One file is loaded once, however its path is written.** The cache went by the path as the game
  wrote it, so a game served from a folder (`base: './'`, as on itch.io) that asked for
  `./assets/tilesets/overworld.atlas` while its map asked for the same sheet as
  `/html/1234/assets/tilesets/overworld.atlas` fetched it twice and made two textures of it: measured
  on a build of a platformer, 36 requests for 34 files, now 34. A file asked for with no `key` is now
  kept under its path as the page resolves it, and a map, a model or an effect that names a file the
  game already loaded under a key of its own (`useLoadAtlas({ src, key: 'tiles' })`) shares that one.
  So does a palette, a table or a shader the project's `post` chain names. Finding it and letting it
  go by name work with the path written either way (`createSprite({ texture: './a.png' })`,
  `useGame().releaseAsset('./a.png')`), a `key` is kept exactly as given, and the same file asked for
  twice under one key no longer warns that the key names another file. Only the `key` of a file
  loaded with none reads differently: its resolved path (`'/html/1234/assets/a.png'`), not the
  string the game wrote.

## 0.3.1 — 2026-10-28

### Added

- **`pixelAspect`: pixels wider than tall, as the consoles' televisions showed them.** The NES and
  the SNES drew 256 across a 4:3 television, so each pixel was 8:7, and with square ones their
  games look squashed. `createGame({ pixelAspect: 8 / 7 })` paints each game pixel that much wider;
  only the size on screen changes, and the game draws the same `width × height`, with the camera,
  where things are, physics and the pointer as they were. With `scaling: 'integer'` the rows stay a
  whole multiple and the columns take that times 8/7, with fractions: the television's shape
  exactly (a whole multiple both ways is 9% too wide), at the price of columns a screen pixel apart
  in width, which a `crt()` on top hides. `'fill'` ignores it. In `project.json` and the editor's
  project settings ("Pixel shape"), and `useGame().setPixelAspect(aspect)` and `getPixelAspect()`
  change it while the game runs, for a player's option. The canvas says the shape it is painted at
  in `aspect-ratio` too, so a page whose style sheet sets `height: auto` on it keeps that shape
  rather than the buffer's.
- **`useGame().setScaling(scaling)` and `getScaling()`**: how the game is fitted to the page,
  changed while it runs (`'integer'`, `'contain'`, `'fill'`, `'none'`), for a player's option, crisp
  or as large as the screen. Only the size on screen changes. While full screen its own
  `fullscreenScaling` still wins, and this one is back once it is left.
- **`useGame().setPostProcessEnabled(enabled)` and `isPostProcessEnabled()`**: every screen effect
  on or off at once, the project's chain and each scene's, for a "CRT filter" in a game's options.
  Nothing is forgotten: turning them back on brings back the ones that were on. Off costs what no
  effects cost, and a scene change is still covered. Until now only a tool could do it, through
  `editorHandleOf`, which still has it.
- **`RENDER.CONSOLE_SCREENS`**: each console's screen to spread into `createGame`, its size, the
  shape of its pixels and its pictures a second: `nes` and `snes` 256 × 224 at 8:7, `genesis`
  320 × 224 at 32:35, `gameBoy` 160 × 144, `gba` 240 × 160, `ps1` and `n64` 320 × 240, all at 60.
  `createGame('#app', { ...RENDER.CONSOLE_SCREENS.snes, scaling: 'integer' })`. Only the screen: the
  controls are `INPUT.ACTION_PRESETS`, the colours `COLOR_LEVELS` and the television `crt()`.

### Changed

- **`scaling: 'integer'` counts its whole multiple in the screen's own pixels.** On a screen at
  125% or 150%, the usual Windows laptop, a CSS 3× was 3.75 or 4.5 of the screen's pixels, and
  painted with nearest neighbour a game pixel came out one width in some columns and another in the
  rest: measured in Chromium and WebKit, a game of one-pixel stripes showed 118 of 6 and 40 of 7 at
  125%, half of 7 and half of 8 at 150%. Now every game pixel is a whole number of the screen's
  (7 at 125%, 8 at 150%), so the CSS size has fractions (5.6×). On a density of 2 it also takes the
  half steps a whole CSS multiple skipped: 5.5× where it was 5×, a little bigger and as crisp. At a
  density of 1 nothing changes, nor below 1×, nor with `'contain'`, `'fill'` or `'none'`. A window
  dragged to a screen of another density fits again. The canvas is also centred on a whole pixel of
  the screen the browser can place exactly (a margin of 4 CSS pixels' steps at 1.25, 2 at 1.5), not
  with `margin: auto`: half an odd leftover started it part of a pixel in, and Chromium then painted
  up to a third of the columns a pixel narrower or wider. Its size is rounded down to the screen's
  pixels, so it never overflows its space by a fraction. Checked over 256 fits (every scaling,
  `keep`, density 1 to 2, square and 8:7 pixels, two spaces) in Chromium and WebKit.

### Fixed

- **A built-in in `createGame`'s `post` chain typechecks with only its key**:
  `post: [{ builtin: 'crt' }]`. The entry's `effect` was required, so code had to add `effect: ''`;
  it ran the same either way.
- **A font still on its way when its game goes is let go quietly**: it no longer warns that it
  "could not be loaded". A test that destroys a headless game before the built-in font arrives
  (one that changed scene a frame earlier) said so, and nothing had failed.
