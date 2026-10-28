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

### Fixed

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
