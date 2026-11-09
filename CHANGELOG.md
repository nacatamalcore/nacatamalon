# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased

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

## 0.6.0 — 2026-11-08

### Added

- **2D lights without normal maps.** `useLight2d` adds a coloured lamp with a radius in world pixels
  and adjustable falloff; `useAmbientLight2d` sets the world's base brightness. Lamps light
  sprites, text, nine-slices, shapes, polygons, tilemap layers and particles in WebGPU and WebGL2,
  including their custom materials. A world can have any number: each camera is lit by the eight
  nearest what it shows. Lamps follow their box, scenes keep separate lights, and
  screen-space HUD objects stay unlit. `useUnlit2d` keeps something in the world (a fire, a neon
  sign) in its own colours, still moving with the camera. A scene once lit stays lit until it ends,
  so losing its last lamp does not turn it to daylight. Both light kinds, and what is left out, save
  and load with scene documents. No lights keeps the original colours, and a game that never makes
  one pays nothing for them. See [the 2D lighting guide](guides/lighting_2d.md).
- **A sprite's run can pause.** `useSpriteAnimation` gains `pause()`, and `play()` with no name
  carries on from the frame it held. `stop()` still holds the frame, and `play()` after it starts the
  last run again from its first frame. A run stopped while its sheet is still loading no longer
  starts when the sheet lands.
- **The pixel functions take a colour as text**, as every other option does: `fillRect(p, 0, 0, 8, 8, '#ff6b1a')`,
  `drawText(p, 'MOTEL', 4, 4, { color: 'orange' })`, `fillGradient(p, { from: '#203060', to: '#f0a070' })`.
- **A plugin can run work of its own on the GPU** (experimental), with `useGpuPass` from the new door
  `nacatamalon/extend/gpu`: a simulation in compute, a picture worked out on the GPU, anything a material or
  a post effect cannot do. It runs once a frame, before the frame draws or after, and what it draws into comes
  back as the game's own pictures, for sprites, models and materials. It goes with the component that made it,
  and comes back by itself after a lost WebGL2 context. A game never calls it: it calls the hook the plugin
  exports. A game that never imports the door carries none of it. See `guides/gpu_pass.md`.

### Changed

- **Every warning and error says who speaks first.** Messages that read as a loose sentence now
  start with what the game used, as the rest already did: `createMaterial: the material "water" did
  not compile…`, `physics3d: a sphere collider cannot be scaled…`, `store 'save': it could not be
  saved…`, `rumble: a duration of 200 seconds…`. A game that matched the old wording of a message
  needs the new one.
- **Built-in sprites share a draw across up to eight pictures.** Consecutive sprites with the same
  filtering and blend stay in their original order, including overlapping transparent ones, instead
  of ending a batch on every picture change. WebGPU and WebGL2 use the same eight slots without
  adding bytes to each sprite. A model, layer, mask-state change or custom material still cuts the
  batch; custom materials and stencil shapes keep their single-picture shader contract. WebGPU keeps
  texture groups separately for each pass. Spare batches survive 120 unused frames so blinking
  drawables reuse their groups; a longer absence releases the cache. WebGL2 compiles all built-in
  sprite variants at boot and on context restoration, keeping compilation out of the draw path.

- **Breaking: what is a subject of its own has its own import.** `nacatamalon` had 421 functions and values
  in one list, and now keeps the 187 almost every game uses. Nothing was renamed and nothing changed but
  where it is imported from, and each name is in one place only:

  | Import from | What moved there |
  |---|---|
  | `nacatamalon/math` | `clamp`, `lerp`, `TAU`, `degToRad`, `radToDeg`, `lerpAngle`, `wrapAngle`, `vec2*`, `vec3*`, `quat*`, `useRandom`, the `ease*` curves, `linear` |
  | `nacatamalon/pixels` | `createPixels`, `setPixel`, `getPixel`, `fill*`, `draw*`, `blitPixels`, `mapPixels`, `clonePixels`, `swapColors`, `outlinePixels`, `mirrorPixels`, `snapToPalette`, `checkColorLimit`, `shadeWithRamp`, `pixelsFromRows`, `sheetFromRows`, `createPixelTexture`, `updatePixelTexture`, `useLoadPixels` |
  | `nacatamalon/shader` | `composer*`, `compileShader`, `compileShaderGraph`, `parseShaderGraph`, `parseShaderFile`, `parseShaderSource`, `toonLighting`, `unlitLighting`, `mangaDots`, `rim`, `useLoadShader` |
  | `nacatamalon/effects` | `usePostProcess`, `useFilter`, every effect (`crt`, `glow`, `outline`, `dither`, `blur`…), `useLoadLut`, `useLoadPalette`, `POST_EFFECTS` |
  | `nacatamalon/transitions` | `fade`, `wipe`, `iris`, `pixelate`, `dissolve`, `crossfade`, `push`, `crossWipe`, `crossIris`, `crossDissolve` |
  | `nacatamalon/files` | `parseSceneDoc`, `parseAtlasDoc`, `parseMotionDoc`, `parsePaletteDoc`, `parseParticlesDoc`, `parseSongDoc`, `parseStoreDoc`, `parseTilemapDoc`, `parseProject`, `sceneFromDoc`, `boxFromDoc`, `applyStoreDocs`, `gameOptionsFromProject`, `DOCUMENTS` |

  A type goes with its subject, even when something on `nacatamalon` takes it: `TPixels` is in `pixels`,
  `TEaseFn` in `math`, `TTransition` in `transitions`. A format's type that a function on `nacatamalon` is
  built around stays there (`TSongDoc`, for `useSong`). To move a game over, split its imports:

  ```ts
  // Before
  import { createGame, clamp, createPixels, fade } from 'nacatamalon';

  // After
  import { createGame } from 'nacatamalon';
  import { clamp } from 'nacatamalon/math';
  import { createPixels } from 'nacatamalon/pixels';
  import { fade } from 'nacatamalon/transitions';
  ```

- **Breaking: `restitution` is `bounce`**, on a body, a collider and in a scene file. A file saved with
  `restitution` still reads.
- **Breaking: what a character's body says about where it stands reads as a question:** `onGround`, `onCeiling`, `onOneWay` and `onLadder` are `isOnGround`, `isOnCeiling`, `isOnOneWay` and
  `isOnLadder`, and a 3D character's `isGrounded` is `isOnGround` too. An `on…` is always something that
  listens now.
- **`loop: true` goes round for ever, everywhere, and `repeat` counts.** A tween takes `loop: true` in place of
  `repeat: -1`, and a clip given both says that `repeat` decides. A negative `repeat` still works, so a saved file
  keeps its meaning.
- **Breaking: a sprite's `repeat` is `tile`**, because `repeat` now only counts: `tile`, `tileOffset`, and a
  backdrop's `tileY`. A scene saved with the old names still reads.

- **Breaking: five names say what they do.** `useUvSphereGeometry` is `useSphereGeometry` (with
  `TSphereGeometryOptions`), `useHelperLines` is `useLines` (`TUseLinesOptions`, `TLinesHandle`), `useLoader` is
  `useLoadProgress` (`TLoadProgress`), `useVector` is `useDirection`, and `useLoadGltf` is `useLoadModel`
  (`TUseLoadModelOptions`). A 2D character's `onWall` is `wallSide`, since it says which side and is not a yes
  or no, and `useActions().vector()` is `direction()`, like `useDirection`. A scene file's
  `kind: 'uvSphere'` stays as it is.

### Fixed

- **A light two boxes down a turned or scaled box is where its box is.** A point, spot or rect light on a
  turret of a turned ship was placed as if the ship had not turned or grown. It now sits where a sprite in the
  same box is drawn.
- **Errors name what you were doing.** A colour that is not one says `colour`, whichever option it was given to;
  a scene that is missing or already running says `scenes`; a renderer that cannot start says `createGame` and
  why; a damaged PNG says `decodePng` (or the loader). Before, several named the engine's own insides
  (`startScene`, `createRenderer`, `inflate`, `atlasFrame`), and asking for `renderer: 'WEBGPU'` on a browser
  without a graphics adapter threw a bare message with no tag.
- **A model inside a filter keeps its depth.** It used to come back to the scene as one flat picture,
  wholly in front of or behind the other models. Now the scene hides it and is hidden by it pixel by
  pixel, and what its effects draw round it (a glow's halo, a shadow) takes the depth of the nearest
  part of it, so the halo of a part that is hidden is hidden too. A filter over 2D things alone is
  drawn as before, at no cost.
- **A project on `moduleResolution: node` finds the types of every door.** `typesVersions` named files the
  build no longer writes, so `nacatamalon/authoring`, `nacatamalon/physics2d` and the rest did not resolve there.
