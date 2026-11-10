# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased

### Added

- **A state machine, `useStateMachine`.** A character that stands, runs and jumps, an enemy that
  patrols, chases and goes back, a door, a boss's phases: each state says what it does on the way in
  (`onEnter`), every frame it lasts (`onUpdate`) and on the way out (`onExit`), and the machine is in
  one of them at a time. It works in a scene, in a piece made with `useSpawn` and in a behaviour, and
  belongs to that object: it updates with it, stops in a paused scene and goes when it goes (without
  `onExit`: being destroyed is not a change of state). `go(state)` changes state there and then, or,
  asked from inside a change, once that one is over, and says where two states keep sending to each
  other; going to the state it is in does nothing unless `{ restart: true }`. It tells `state`,
  `previous`, `time` (seconds in this state) and `is(...)`, and `onChange` hears every change. The
  state names come from the object, so a name it does not have is a type error. It can be watched
  with `useWatch`, and its state is saved with the object and comes back, entered, when the scene is
  opened again.
- **States inside a state.** A `useStateMachine` given `{ parent, state }` lives inside that state of
  another machine: it enters its `initial` when the other enters the state and leaves with it, from
  the inside out (`onExit` of its state, then of the other's) and in from the outside in. Each frame
  the outer `onUpdate` runs first, so what holds for every move of a state (a guard that has lost
  the hero leaves combat, whichever move it was in) is written once there. `go` on a machine that is
  not running takes its parent there and comes in straight at that state (`combat.go('swing')` from
  calm). Each has its own names, `time`, `onChange` and `active`, and a change asked for from inside
  a change of any of them waits for it. It can live in the same object or in a piece of its own, as
  deep as needed, and each one's state is saved and comes back.
- **A model material's maps, read by its vertex hook.** `sampleMap_<name>(uv)` works in `vertex` and
  `vertexGlsl` as it does in `fragment`, on both cards, and in the model's shadow too, so a picture
  can move the corners: a height map, footprints pressed into snow, ripples drawn into a texture. The
  shader composer reads a map in a model's vertex graph (`composerMapSample` in `position`). Read the
  map at a place worked out from `pos` rather than at `ctx.uv`, so the moved surface is lit as moved,
  and give a height map `smooth: true`, or it rises in flat terraces.
  Until now a vertex hook that read a map did not compile, and the model drew with the built-in
  shader.

### Fixed

- **`useData` in a behaviour gets back what it was saved with.** A scene saved while running and
  opened again handed the behaviour its first value again, and kept the saved one next to it, so each
  save wrote the state once more. Now each piece of state a scene writes says whose it is (`by`, the
  behaviour's attachment id; absent for the object's own body), and each one gets back its own, in
  the order it asks for them. A behaviour removed, reordered or not registered any more keeps its
  entries untouched and never hands them to another, and what nothing asks for (a scene shown rather
  than played) is still kept. What comes back is a copy, so changing it in place leaves the document
  as it was saved. Files written before have no `by`: their entries are kept as the object's own and
  are not handed to its behaviours, which start fresh, as they did before.

## 0.7.0 — 2026-11-09

### Added

- **A plugin can check the engine it runs on**, with `requireEngine(plugin, range)` from
  `nacatamalon/extend`. A plugin copied into a project by hand has no npm to check its
  `peerDependencies`; this does it, with the range written and read as npm does (`>=0.7.0 <1`,
  `^0.7.0`, `~0.7.2`, `0.7.x`, `0.6 - 0.8`, `||`, a preview only where the range names one), and when the engine is not one it takes, says so once, in the plugin's
  name and with both versions. It returns whether it fits and stops nothing: the plugin decides.
- **A guide to making plugins**, `guides/plugins.md` (and `guides/plugins.es.md`): starting one
  from the plugin template, the lifecycle (the hooks a game uses), what `nacatamalon/extend` gives,
  the rules a plugin keeps, testing it headless, sharing it as a `.zip` or on npm, and the store.
  `llms.txt` points coding assistants at it.
- **A plugin can teach the engine a kind of drawing**, with `registerDrawableKind` and
  `createDrawable` from `nacatamalon/extend/gpu` (experimental). The engine treats each of its
  drawings like a model (it follows its object, is ordered with the scene's models, hides and goes
  with it, is seen by every camera of its scene and can cast into the shadow maps) and the plugin's
  own WebGPU pipeline draws it inside the engine's passes, with the same depth, masks, lights and
  shadow maps. It is told about each pass and each shadow map before anything is recorded. A kind
  draws on WebGPU (`webgpu`) and on WebGL2 (`webgl2`, each call inside the engine's pass with the GL
  state put back after it). With `bounds`, the engine leaves its drawings out of the cameras and
  shadow maps that cannot see them, a camera's `cullingCamera` included. In a scene whose 3D camera
  follows the 2D one, a drawing comes to its kind already standing upright, as a model does. A kind
  can also be flat (`space: '2d'`): its drawings are placed, ordered and lit like sprites, through
  each scene's 2D camera and its 2D lights. In a game with no
  browser they are left out, said once.
- **The animator plays anything with bones**: `useSkeletalAnimation` takes a `TAnimatable`
  (movements by name and the skeletons they turn), which a model from a file already is, so a
  plugin's own bodies play, fade and layer their movements the same way.
- A view's filter (`kinds`) can name `'custom'`: the drawings of the kinds plugins registered.
