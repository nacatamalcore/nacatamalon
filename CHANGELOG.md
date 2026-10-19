# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## 0.2.5 — 2026-10-19

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
