# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased (0.2.3)

### Added

- `useLateUpdate(callback)`: runs once per frame after every `useUpdate` of the scene, tweens and
  physics included, with the same `delta` and `time`. For what reads where something ended up rather
  than moving it: a camera that follows the player, a marker over an enemy, a shadow under a sprite.
  In `useUpdate` the scene runs before the objects inside it, so a camera there read the player one
  step behind, and the character shook against the screen whenever its speed changed. It stops while
  the scene is paused, starts on the frame after its object is spawned, and is skipped by an object
  destroyed during the updates (and by everything beneath it).
- `useSound({ samples, sampleRate, key? })` (`TSampledSound`): a sound worked out in code, sample by
  sample, played like any other (an engine whose note follows the revolutions, a tone made from a
  seed). The samples are copied when it is made; any rate from 3000 to 768000 works. Like `{ sfx }`,
  nothing is written to a saved scene for it, since there is no file to name.
- `composerAtan2(y, x)`, in the composer and in the shader-graph catalogue (`atan2`): the angle of a
  point around the origin, lane by lane, for swirls, rays, rings and patterns wrapped round a centre.
  One helper spelled `atan2` in WGSL and `atan` in GLSL, so it works in either hook on both backends.

### Changed

- `createMaterial` given `uniforms` (which `compileShader` always gives) returns a material whose
  `uniforms` is typed as there, so a parameter is animated with `material.uniforms.glow = 1` and no
  `?? {}`. To keep that true, a material handed `uniforms` with no shader of its own gives the same
  bag back instead of `null`.

### Fixed

- A shader composed with noise (`composerSimplexNoise`, `composerFbm`, `composerCellularNoise`) in
  `position` and anything in `color` did not compile on WebGL2 (`'sgNoise3' : no matching overloaded
  function found`): the material fell back to the built-in shader with a warning, and the dent
  vanished without anything looking broken. GLSL compiles the two hooks as two programs, and the
  noise functions were written only before the colour one. Each GLSL hook now takes the helpers its
  own half of the graph calls; WGSL, one module, is unchanged.
- A model around `z = 0` was not drawn by an orthographic camera at `z = 0`, which is where
  `useCamera3d()` puts it, nor with no camera at all: the near plane at 0.1 in front cut away its
  front half, and the back half faced away and was culled. An orthographic view now sees `far`
  behind the camera as well as in front, so a model sits around its `z` as a sprite would. `near` is
  read by a perspective camera only.
- With an orthographic camera, the shine and `composerFresnel` were brighter on one side of every
  model: the way towards the viewer was measured from the camera's place (the bottom-left corner of
  the screen, for one that measures in pixels). Its rays are parallel, so the way is now the same for
  every point, the camera's facing turned round. A perspective camera is unchanged.
