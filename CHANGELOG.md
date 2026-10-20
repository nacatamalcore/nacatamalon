# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased

### Added

- `usePointer().justPressed()` and `justReleased()`: a finger or a mouse button that went down or came
  up this frame, true for one frame like the keyboard's. `justPressed('right')` asks about one button.
- A scene takes props, like a component: how it is opened. `const Level = ({ level = 1 }: { level?:
  number }) => ...`, and `useScene().change(Level, { props: { level: 3 } })` or `launch(Hud, { props
  })`. Given the function, TypeScript checks the props; the name still works, unchecked. Every prop
  needs a default, since a scene also starts with none (the first one, a restart, the editor's
  Play), and `createGame` refuses one that does not have it.
- `useWatch` watches a store too: `useWatch(() => { hud.text = ... }, [gameStore, lives])` runs on the
  first frame and once a frame after any `set` or action. `useStore` stays for one value, heard
  straight away and in pause.
- `quatSlerp(a, b, t)`: turns smoothly from one 3D facing to another, a turret easing toward the
  player or a camera toward where it looks.
- Physics layers have names: `physicsLayers: ['world', 'player', 'enemy']` in `createGame` or the
  project, the first being layer 0, and a body says `layer: 'enemy', collidesWith: ['world',
  'player']` rather than `2` and a mask; `setLayers` takes names too. A saved scene keeps the
  numbers, so renaming a layer changes nothing there. A name the game did not give is said once and
  taken as layer 0.
- Tags: what something is, as many as it likes. `useTag('enemy')` gives the tag, to `add`,
  `remove`, `has`, find `all()` in the scene and `clear()`; asking is getting, and nothing registers
  it. A piece adds itself (`useTag('enemy').add(useSelf())`) or is made with
  `useSpawn(Bat, { tags: ['enemy'] })`; a sprite, text or panel carries tags on its own
  (`createSprite({ tags: ['wall'] })`). A saved scene's box keeps them.
- `useCollisionWith(Enemy, (enemy) => ...)`: a piece says itself what it collides with, by component
  or by tag, from its own body, so a bullet and an enemy written apart need no rule in the scene that knows both.
  Every frame they touch by default, or `{ when: 'start' }` on the first and `'end'` on parting.
- `sceneOf(self)`: the scene something is in, to reach the rest of it by name,
  `findObject(sceneOf(self), 'Score')`, wherever the behaviour sits.
- `useSpawn` takes a name for what it makes: `useSpawn(Button, 'Jump')`, or
  `useSpawn(Bullet, { name: 'Bullet', parent: 'scene' })` beside the place. Without one, a thing is
  still called after its component's function, but that is only a label: a published build shortens
  function names, so a touch button or a `findObject` that found `Jump` while developing found
  nothing once shipped. Anything looked up by name needs it given. While developing, a lookup that
  finds something only by its function's name says so in the console, once a name, with the line
  to write; `findObject`, `findObjects`, a touch binding, a photo and a headless `find` all tell.
- `useTouchAction('jump')`: an on-screen button says itself which action a finger on it holds, from
  its own body. No name to match with the action map, one `Button` component made twice with two
  props is two buttons, and a destroyed button presses nothing. It is the game's, not a binding, so
  a controls screen neither lists nor saves it. `{ type: 'touch', box: 'Jump' }` stays for a map
  written in a project file.

### Changed

- `halftone`'s `angle`, in degrees, is `rotation`, in radians (`Math.PI / 4` by default), like every
  other turn: angles are radians, except a 3D camera's `fov`, a `hue` and a sound's `cone`, which
  everyone says in degrees. A project or a motion that wrote `angle: 30` is read as `rotation` of
  30°; motions are version 3 now.
- Time is in seconds everywhere. Four things counted milliseconds and now count seconds, like `delta`,
  timers and tweens always did: transitions (`fade(0.3)` rather than `fade(300)`, and `wipe`, `iris`,
  `pixelate`), a pad's `rumble({ duration, delay })`, a store's `persist.throttle`, and a headless
  game's `loaded(timeout)`. A transition over ten seconds says it is probably milliseconds. Saved
  files are read as they were: a motion's transition `"ms": 400` is read as `"duration": 0.4` and
  written back so, and a store file of version 1 has its throttle read in milliseconds (they are
  version 2 now).
- A right click over the game no longer opens the browser's menu: the right button is the game's,
  as in a window of its own (`usePointer().justPressed('right')`). Only over the canvas; the page keeps
  its menu. `createGame(..., { contextMenu: true })` lets it open again, and
  `useGame().setContextMenu(true)` while it runs.
- A pointer's `button` is a name: `'main'` (the left button, or a finger), `'middle'`, `'right'`,
  `'back'` and `'forward'`, all in `POINTER_BUTTONS`, rather than the browser's `0` to `4`. `info.button
  === 2` becomes `info.button === 'right'`.
- Collisions are asked by component or by tag, not by a hitbox's group.
  `useCollisionWith(Enemy, (enemy) => enemy.api.hurt(1))` meets the pieces `useSpawn` made from
  `Enemy`, their `api` typed; `useCollisionWith('damageable', ...)` meets everything carrying the tag,
  pieces and tagged sprites alike. `useCollisionBetween` takes either on each side. A piece is
  measured by its hitboxes or what it draws, a tagged sprite by itself, and two pieces with physics
  bodies, in 2D or 3D, meet when the simulation says they touch: a game moves from hitboxes to
  physics without rewriting a collision. Only the bodies a collision asks about report contacts. `useHitbox` lost its `group`: what a thing is is its tag. A body and a sword that count for
  different things are two pieces, each with its own tag.
- One word for what touches what: `useOverlap` is `useCollisionBetween`, `overlaps` is
  `collisionBetween` and `TOverlapTarget` is `TCollisionTarget`, beside the new `useCollisionWith`.
  `useHitbox` is unchanged. The old names are gone.
- `useEvent` and `onEvent` are `useReport` and `onReport`, and `TObjectEventHandler` is
  `TReportHandler`: what a piece reports to whoever placed it, which is all they ever did, beside a
  signal that the whole game hears. They are for pieces made of data, a pack's script or a
  behaviour, which cannot be handed a function; a component of your own code takes a callback in its
  props. A pack's `on` is unchanged. The old names are gone.
- `useSceneUnmount` is `useCleanup`. It always ran when its owner went away, a component as well
  as a scene, and its name only told of the scene, so a pause menu listening on the window would not
  find it. The old name is gone: the type checker points at each call.
- `useScript(ref, props, { id })` takes the settings second, where nearly every call wants them,
  and the attachment's identity, which only a scene read from a file passes, in options at the end:
  `useScript('patrol', { speed: 80 })` rather than `useScript('patrol', undefined, { speed: 80 })`.
- `findObject` and `findObjects` leave out what is destroyed and what is inside it, from the moment
  it is destroyed: a coin collected this frame is not there to be collected again.
- `useSkeletalAnimation` moves a placed model, the one `createModel` gave back, and no longer the
  file: `const fox = createModel({ model: file }); useSkeletalAnimation(fox, { play: 'Walk' })`.
  Every model placed from a file has bones of its own (`fox.skeletons`, next to `fox.model`, the
  file), so five enemies of one file walk, jump and stand still each on their own; before, they all
  wore the file's bones and took whatever pose the last animator wrote. Passing the file is a type
  error that points at the call to change. The bones on the graphics card of a model no longer drawn
  are let go of after a couple of seconds, so enemies born and killed do not fill it.

### Fixed

- A maker from `useSpawn` called once its scene has stopped, from a `setTimeout` or a listener
  that outlived it, makes nothing and says so once, rather than building into a scene nobody draws,
  playing its sounds and starting its timers for no one. It gives back something already destroyed,
  so `destroy` and `.api` on it do what they always do. Under something destroyed it makes nothing
  either, in silence: that goes at the end of the frame.
- `useCameraFollow` follows the scene's camera whichever came first in the body. With
  `useCamera2d({ zoom: 2 })` written after it, the follow went on moving a camera of its own that
  nothing drew through, and the scene's stood still, with only a warning about a camera replaced.
- `onReport` (`onEvent` until now) stops when whoever listened goes away, not only when the object
  listened on does. A HUD listening on its scene went on hearing once destroyed, writing on a text
  that was gone, and a new HUD in its place made two. One connected inside a body now lasts as long
  as that body's object, deaf from the moment it is destroyed, and a report passes it by for the next
  one up. The function `onReport` gives back lets go of its own connection only: the same handler
  connected twice lost both.
- A sprite's `frame` and `atlas` show what they say when they are set: `chest.frame = 1` opens the
  chest, and `hero.atlas = attacking` shows the same frame of the other sheet. Until now only
  `setSpriteFrame` changed the picture, and writing the field did nothing, while a polygon's and a
  panel's `frame` did. `setSpriteFrame` stays, and is the same thing written as a call.
- A key let go of with another name than it went down with stays held no more. Shift+1 goes down
  as `'!'`, and with Shift let go first it comes up as `'1'`: `'!'` was held until the window lost
  focus. A key is now let go of by the name it went down with, known by which key it is
  (`KeyboardEvent.code`), and keeps that name through its repeats. A name two keys share, as the two
  Shifts, is held until both are let go.

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
