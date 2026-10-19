# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased

### Added

- `nacatamalon/headless`: a game run with no browser, from Node or Bun, for checking what it does
  from a test or a script. `createHeadlessGame({ width, height, scenes, assets })` makes it held
  still on its first frame; `run(frames)` moves it a step of the game per frame (60 a second unless
  `step` says), `press`, `release` and `tap` hold and let go keys between frames, and `seed` (`1`
  unless it says) starts the random numbers, so a run is the same every time. `find(name)` and
  `findAll(name)` give the objects of a name, `drawn()` every sprite, text and panel on the screen
  with where it lands, how much of it is in and what a text says, `scenes` the scenes running, and
  `loaded()` waits for what they load. Files come from the assets folder (`public` by default):
  a picture's size when it is a PNG, other files as they are. Physics runs as in a page once the
  game installs it, and `loaded()` waits for its world to open. Sound plays silently; there is no
  pointer, pad or picture. A scene that throws throws from the `run` it threw in. It is a door of
  its own because it reads files with Node's modules, which a game's bundle never carries.

### Changed

- The lighting looks say in their names which slot they go in: `toonLighting()` and
  `unlitLighting()`, for a material's or a model's `lighting`, beside the steps `mangaDots()` and
  `rim()`. They were `toon()` and `unlit()`, which are gone; what a scene document writes
  (`look: 'toon'`) and the knobs (`toonShadow`) are unchanged.
- One idea, one name, across the screen effects and the looks. `amount` is how much an effect
  shows, `0` the picture untouched to `1`; `intensity` a brightness that may pass `1`, as a light's;
  `size` the side of a cell, a block or a dot, in game pixels; `scale` a multiplier with no unit;
  `radius` a reach in game pixels; `center` a point from `[0, 0]`, the top left, to `[1, 1]`. Renamed
  to keep to it:

  | Where | Was | Is |
  |---|---|---|
  | `ascii`, `halftone` | `color` (a number) | `ownColor` |
  | `ascii`, `halftone` | `scale` | `size` |
  | `dither` | `strength` | `amount` |
  | `zoomBlur` | `strength` | `reach` |
  | `oldFilm` | `noise` | `grain` |
  | `glitch` | `rgb` | `split` |
  | `crt` | `gamma` | `linearBlend` |
  | `rim()` | `strength` (`rimStrength`) | `amount` (`rimAmount`) |
  | `mangaDots()` | `spacing` (`mangaDotsSpacing`) | `size` (`mangaDotsSize`) |
  | `mangaDots()` | `size` (`mangaDotsSize`) | `fill` (`mangaDotsFill`) |
  | `iris` | `centre` | `center` |

  A `project.json` chain, a scene document or a motion written with an old name is read with the
  new one, and the console says so each time it is read; saved again, it is written with the new
  one. A motion says which names it was written with by its `version`, `2` from now on, since
  `mangaDotsSize` was the fill of a dot and is its spacing now. A look's number under the least it
  takes is lifted to it. Code is not translated: an old option is a type error, as `toon()` is.
- A built-in in a `project.json` chain is named by the call that makes it: `paletteMatch`,
  `lutGrade` and `colorAdjust`, where they were `palette`, `lut` and `adjust`. The old names are
  still read, and said; the effect is called by its new one too, which a motion's `post` names, and
  a motion naming the old one still finds it.
- `MATERIAL_LOOKS`, `lookKnobs` and `findMaterialLook` are on `nacatamalon/authoring`, beside
  `POST_BUILTINS`: they are what a tool lists and a game never reads. The looks themselves
  (`toonLighting()`, `mangaDots()`…) stay on the front door.
- `createMaterial` says what is wrong where it is wrong. A lighting look among the `steps`, a step
  as the `lighting` or an option it does not have is refused at the option itself
  (`'TToonLook' is not assignable to type 'TStepLook'`, `'tintt' is not an option of
  createMaterial`), where before every mistake read "'mesh3d' is not assignable to 'sprite2d'". When
  the game runs, a look in the wrong slot names the call to write (`toonLighting()`).

### Fixed

- `toonLighting()` keeps the colour of the light. It cut the light into bands by its brightness and
  gave back a grey, so a warm lamp lit a toon surface as a white one would; now only the brightness
  is cut, and each band keeps the colour the light had there. A white light gives the same greys as
  before. Several lights of different colours still blend into one another, since the bands are cut
  from the light they make together.

## 0.2.4 — 2026-10-19

### Added

- Effects and looks say what can be set on them. Each of `POST_BUILTINS` and `MATERIAL_LOOKS` has
  `fields` (`TEffectField`): every knob with its kind (a number, a colour, a point, a choice), its
  range and its default, for an editor to make a form of, the way a script's fields are. A field
  marked `rebuild` is written into the effect when it is made rather than turned (`ascii`'s
  `glyphs`), and a project's post chain keeps it in an entry's new `options`:
  `{ builtin: 'ascii', options: { glyphs: ' ░▒▓█' } }`. An option an effect does not have is left
  out with a warning. A host editing the game turns a project effect's knobs in place with the
  editor handle's `setPostUniforms(index, values)`.
- Material looks: a model's material made from recipes instead of a shader. `lighting` says how its
  surface is lit, one look in place of the engine's light: `toon()` (the light in flat bands and
  the shine in one hard spot) or `unlit()` (no light at all). `steps` says what is done to it once
  lit, in order: `mangaDots()` (dots of ink in the shadow, laid out on the screen and bigger where
  darker, exactly where toon's bands went dark when it follows toon) and `rim()` (the edge that
  turns away from the camera, mixed towards a colour). `createMaterial({ shader: 'mesh3d', lighting,
  steps })`, `createModel({ lighting, steps })` for every piece (with bones too, each over its own
  picture and colour), and `compileShader({ shader: 'mesh3d', lighting, steps })` for the shader on
  its own. Every number is a knob of the material (`toonShadow`, `mangaDotsSpacing`, `rimColor`; a
  second step of one kind is `rim2Color`), to turn or tween while the game runs. A look is plain
  data, so a scene document writes the looks and not the shader they make, and makes it again when
  opened; each knob is written in its look as it is turned at the time, and not again among the
  material's uniforms. One it does not know is left out with a warning. `MATERIAL_LOOKS` lists them,
  with the slot each goes in, and `lookKnobs` names each knob and where it lives in the looks. Both
  languages, from the shader composer.
- A model's material is told more about where it is drawing. `ctx.screen` is where the pixel is on
  the screen in the game's pixels, `(0, 0)` at the top left, whatever the window's size: a dot
  screen or a hatch lines up with the screen through it instead of sliding with the model.
  `ctx.tangent` and `ctx.bitangent` are the way across and down the surface the picture runs, in
  the world, for a relief or a ripple that moves the picture over a surface; `ctx.uv2` is a second
  picture coordinate. The corner hook's `VertContext` has the tangent, the bitangent and `uv2` too.
  The same on WebGPU and WebGL2, and on models with bones, whose tangents bend with them. In the
  shader composer: `composerScreenPos()`, `composerUv2()`, `composerWorldTangent()`,
  `composerWorldBitangent()`, `composerVertexTangent()` and `composerVertexBitangent()`.
- Every shape carries a detail run beside its corners: each corner's tangent (with which hand its
  bitangent goes) and a second picture coordinate. A glTF file's own `TANGENT` and `TEXCOORD_1` are
  kept; anything else has them worked out when it is made (tangents from how the picture is
  stretched over each triangle, the second coordinate as a copy of the first), so the engine's own
  shapes and every model have them. Only a material's shader reads the run; the engine's own
  drawing never binds it.
- Fog by height (`useFog({ height: { top, bottom } })`): below `top` things fade, and at `bottom`
  they are gone however near, for the mist at the foot of a cliff or a pit with no bottom to see.
  With `top` under `bottom` it runs upwards, into a cloud. It joins the fog by distance, the denser
  of the two winning at each corner; `distance: false` leaves only the fog by height. Both are in
  the fog record (`fog.distance`, `fog.height.enabled`, `.top`, `.bottom`), so a tween can fade
  either in, and in scene documents, which leave out what is at its default.
- `ascii()`: the frame drawn in letters. Each cell becomes one of ten, from a space to `@`, as dense
  as the picture is bright there, in the picture's own colour or in `ink` (`color` between the two).
  `scale` is the side of a cell in game pixels, rounded to a multiple of 6 so every pixel of a
  letter is the same size; `background` is how much of the picture shows behind them, `brightness`
  how bright they are. The letters are carried in the shader, so nothing is loaded; a `bloom()`
  after it makes them glow. `glyphs` picks them, darkest first (`' .oO0@'`, `' ░▒▓█'`): any
  printable ASCII character and the four blocks, 5 × 5 each, written into the shader when the effect
  is made; one it cannot draw is left out with a warning. In the catalogue as `ascii`.
- `consoleColor(color, levels)`: a colour as a console could show it, each channel moved to the
  nearest step of `COLOR_LEVELS.genesis`, `.snes` or any number. Takes what `getColor` takes or a
  `TColor`, and leaves alpha alone. Under `dither` a colour on the steps stays flat and one between
  them gets the pattern, as a gradient should; a screen effect cannot tell a tile meant to be flat
  from a sky meant to be dithered, so the colour is put on the steps where it is chosen.
- More machines in `COLOR_LEVELS`: `masterSystem` (4 steps a channel), `pcEngine` (8), `gameGear`
  (16), `saturn`, `n64` and `dreamcast` (32, their usual 16-bit frames) and `gameCube` (64, the 6-bit
  frame it dithered in), next to `genesis`, `snes` and `ps1`. For `dither`, `posterize` and
  `consoleColor`.
- `bezel` on `crt()` (`TCrtOptions`): the colour around the curved glass, any colour (`'#0b0710'`,
  a `TColor` or `[r, g, b]`), instead of black, in the corners the bulge leaves and in the soft edge the picture fades into. The page's own
  colour makes the tube sit on the page, a grey or a beige makes the plastic of the set. Black by
  default, so nothing changes without it; before, the only way was to patch the effect's shader text.
- Tweens move the fields of an object and can be waited for together (`useTween`). `tween({ target,
  to, from?, duration })` moves a sprite's, a text's or any object's numbers by their path, `to: {
  transform: { x: 200 }, tint: { a: 0 } }`, with no `onUpdate`: the path is followed again every
  frame, so a `tint` swapped halfway is the one that fades, and a field with no `from` starts where it
  is when the tween starts moving (after its `delay`), so a tween started when another ends picks up
  where that one left it. Only paths that end in a number typecheck; one that is not there at run
  time is warned about once and not moved. The handle has `onEnd(listener)` (by arriving or by
  `finish`) and `onCancel(listener)`, each handing back what stops listening, as `useMotion`'s does.
  `tween.all(handles)` is several tweens as one handle: it ends once the last of them ends, with their
  own destinations, durations and delays, which replaces a counter in every `onComplete`; with none
  (or all already over) it ends on the next frame; if one is cancelled it never ends and says so with
  `onCancel`; its `pause`, `resume`, `cancel` and `finish` act on all of them, and it can go into
  another `all`. The tween of a number with `onUpdate` and `onComplete` is as it was.
- A sprite in a scene document keeps `repeat`, `repeatOffset` and `parallax` (`TSpriteComponent`):
  read from the file, given to the sprite the scene builds, and written back by `serializeScene`
  only when they say something (`repeat: true`, an offset other than none, a parallax other than
  `{ x: 1, y: 1 }`). A tool laying out a level can make a wall of bricks or a far range of hills
  without code. A value written wrong is left out, as the other fields of a sprite are.
- `follow2d` on an orthographic 3D camera (`TCamera3d`, `TCamera3dOptions`, and in a scene document):
  its models are placed in the 2D world, as sprites are, and seen through the scene's 2D camera. A
  model at `(1600, 1600)` is drawn where a sprite at `(1600, 1600)` is, `y` going down, and the 2D
  camera's pan, turn and zoom move both alike (a tool's camera too); the 3D camera's own `x`, `y`
  and `zoom` are not read, its `z` and `far` are. The models stay upright, facing and culled as they
  were built, and a light aimed down still lights them from above. For a 2D game with pieces drawn in
  3D, which before had to place each model by hand every frame, in the 3D camera's `y` going up.
- `useCapture()`: photos of the game taken by the game, for a photography game, an album or a
  sticker. `capture({ region, hide, only, width, height, effects })` resolves the next frame with the
  game as the player sees it (screen effects included, `effects: false` for under them), cut to a
  rectangle of the screen or to the part a box covers (hidden too: a viewfinder), without some boxes
  or with only some on transparent, scaled by whole pixels; and `photo.boxes`, each sprite, text or
  panel shown in the frame (a box with hitboxes once, by them) with how much of it is in (`seen`) and
  where, for scoring what the player took. Boxes are
  named by box, by what they draw or by name. Works paused; two at once are taken one after the
  other.
- `pivot` on a sprite, a text and a panel (`createSprite`, `createText`, `createNineSlice`, and on a
  sprite or a text in a scene document): the point it turns and grows about, in 0-1 like `anchor`,
  when that is not its anchor. The anchor still says where it sits unturned and ungrown; turned, it
  turns about its pivot, and is touched (`usePointer`) and measured (`overlaps`, `useHitbox`) where it
  is drawn. Can change at any moment: a bike anchored under its back wheel that spins about its middle
  when it crashes, with no sine, cosine or offset worked out by hand. It turns about it whether its own
  placement turns or its box's (the box is the thing, the picture how it looks: a behaviour turning
  `self` turns it about its pivot); boxes further up carry it as one, with everything else in them.
  Without a pivot nothing changes.
- `fillPolygon(pixels, points, color)`: a polygon filled in a picture painted in code, a ramp, a
  slope of ground, a roof. A pixel is painted when its middle is inside or on the outline, so the
  edge is stepped, a ramp up and a ramp down are mirror images, and two polygons sharing a side leave
  no gap; the same pixels everywhere.
- Two more fonts built in, with the same characters as the default one and nothing to load:
  Nacatamal Square (`font: 'nacatamalon:square'`), the same weight with square corners, and
  Nacatamal Thin (`font: 'nacatamalon:thin'`), one-pixel strokes, six pixels to a character. A text,
  `drawText` and a scene document name them by key, and a scene lists no file for them.

### Changed

- Nacatamal Arcade, the default font, is drawn anew, letter by letter, for the engine: two-pixel
  stems, one-pixel bars and cut corners, the same characters in the same 8 x 8 cells, so texts keep
  their size and place. It is no longer derived from another font, so it is under the engine's own
  MIT licence, and `licenses/OFL.txt` is gone from the package: a game that uses it owes no credit.
  The letters of all three fonts are kept as text in `fonts/` and turned into the engine's images
  by `bun run build:fonts`.

- The colour options of the screen effects take any colour, as the rest of the engine does: `tint` in
  `colorAdjust()` and `lcd()` and `bezel` in `crt()` accept what `getColor` takes (`'#9bbc0f'`,
  `'red'`, `0x9bbc0f`), a `TColor` (from `getColor` or `consoleColor`) or the `[r, g, b]` they took
  before, which still works. `effect.uniforms` keeps the `[r, g, b]` the shader reads.
- `useTileBody2d` stands on, and is stopped by, the objects laid out with a 2D collider that never
  moves (a `'static'` body that is not a sensor), besides the maps: a floor, a wall, a platform made
  of an object rather than of tiles, measured as the rectangle around its collider, unturned. Still
  with no physics engine: it reads the objects' own data, so a game that uses no physics loads none.

### Fixed

- A material with an effect of its own works on a model with bones. Until now such a model was
  always drawn with the built-in shader, since the bone blend lived only in its corner stage, and the
  effect just did not show, with nothing to say why. Now the effect has a twin that also bends the
  model: the corner hook moves it as it stands at rest and the bones bend what it made, so a ripple
  goes with the arm it is on, and the colour hook sees the pose the model is in. The same on WebGPU
  (the bones ride in the material's own group, beside its knobs and maps) and on WebGL2.
- `dither` and `posterize` cut colours the same on WebGPU as on WebGL2. WGSL's `round()` sends a half
  to the even step, and the dither pattern lands exactly on halves: pure white under
  `dither({ levels: COLOR_LEVELS.genesis })` came out grey (219 instead of 255) on one pixel in 16
  on WebGPU only. Both shaders now round a half up, as the WebGL2 ones always did; a `strength` just
  under 1 is no longer needed to keep white white.
- `dither` leaves a colour that is on one of its steps flat, on both backends. The frame is stored in
  8 bits, and half the steps land just under themselves there (1/7 of 255 is 36.43, kept as 36): the
  dot of the pattern that takes half a step away dropped them a step, so a sprite painted in exact
  Mega Drive colours came out with a dark dot every 4x4 pixels on levels 1, 3 and 5. The shader now
  adds half a byte before cutting, so nothing needs snapping its colours up by hand first; gradients
  dither as before.
- Parallax (`parallax` on a sprite, `useParallax`, a map layer's, a backdrop) is measured against the
  scene's own 2D camera, also while a tool looks through one of its own (`setViewportCamera2d`): an
  editor panned away from where the game's camera is no longer slid a far layer off by most of the
  pan. In a game, where nothing looks through another camera, nothing changes.
