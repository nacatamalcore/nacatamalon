# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

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
