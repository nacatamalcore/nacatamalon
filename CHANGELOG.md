# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## 0.2.9 — 2026-10-27

### Added

- **Shapes of your own.** `createGeometry({ positions, indices?, normals?, uvs?, colors?, flat? })`
  makes one corner by corner: a terrain from a height map, a ramp, a trail, anything the shape hooks
  do not make. Only `positions` has to be there: without `indices` every three corners are a
  triangle, without `normals` the facings are worked out (smooth, or one per triangle with `flat`),
  without `uvs` the picture's top left, without `colors` white. Each list is checked and refused in
  its own terms. `uvs` can also be the name of a way to work the picture out from where the corners
  are: `'box'`, each face from the side it faces most (a rock, a building); `'planar'`, from above (a
  terrain); `'cylinder'`, once round and down (a barrel, a column); `'sphere'` (a planet). A corner
  two faces want at two places of the picture is split, so a box or a seam needs no corner given
  twice. The picture is stretched once over the shape, or laid `uvScale` times a unit of the
  corners as given (before the object's `transform`), so a long wall and a short one get bricks of
  one size; round an axis it goes a whole number of times, so the seam meets itself. It belongs to the object that made it and goes with it, unlike a shape hook's,
  which is shared. `updateGeometry(geometry, data)` changes it while the game runs, from a
  `useUpdate`: written over what the card holds while it fits, in new room with some to spare when
  it grows past it. A shape hook's shape is shared, so it is refused.
- **`useLatheGeometry({ profile, segments })`**: half an outline, from the bottom up, turned on a
  lathe into a round solid: a bottle, a glass, a vase, a chess piece, a column, a bowling pin, in a
  handful of points. A point on the axis closes it; a point given twice in a row is a hard edge, as
  the rim of a base. The same profile is the same shape, shared like the other shape hooks, and a
  scene document writes it as its recipe (`{ "kind": "lathe", "profile", "segments" }`).
- **`carry`: four numbers a model material's vertex hook hands on to its colour hook.** The vertex
  hook writes them, `carry = vec4<f32>(lift, 0.0, 0.0, 0.0);` (`carry = vec4(lift, 0.0, 0.0, 0.0);` in GLSL), and the colour hook
  reads them as `ctx.carry`, smeared across the triangle like everything else a corner carries: how
  high a wave lifted the water, for foam on its crests; a light of the game's own worked out at the
  corners, the look of the era; `pos`, where the corner is in the model's own space, so bands or a
  bottle's fill line stay on the model as it moves and turns. Nothing written is zeros. In the shader composer, `carry` on
  `compileShader` (a number up to a `vec4`, filled out with zeros), written with `position` so what
  they share is worked out once, and read with `composerCarry()`; in a `.shader` graph, the Carry
  Output and Carry nodes. On both cards and every `cull`, in the shadow of a material cut out of its
  picture too. A material's fog rides in the fourth number of its world position now, to leave
  the place, and draws exactly as before. `carry` and `carried` are the engine's names in a
  material's shader now: a hand-written hook that declared its own at the top of the file renames
  it.
- **`cull` on a model's material**: which side of its triangles is thrown away. `'back'`, the
  default, is a shape seen from outside, as before. `'none'` draws both sides, for a leaf, a sheet,
  a flag or the top of a liquid, with no second plane turned round; each side is lit as the side it
  is, since the light is worked out at the corners for both, and casts its shadow. `'front'` shows a
  shape from inside, a dome of sky or a room, lit from inside. On `createMaterial({ shader: 'mesh3d' })`,
  `createMesh` and `createModel`, in a scene document (`"cull"`, written whenever the material says
  it, `"back"` included) and in the editor's inspector. A glTF material marked `doubleSided` is drawn with `'none'` unless the
  game says otherwise. A colour hook tells the two sides apart with `ctx.frontFacing`, and the shader
  composer with `composerFrontFacing()`. A model that keeps the usual side is drawn exactly as before.

- **`alphaCutoff` on a model's material: its picture cut out rather than blended**, the fences,
  railings, leaves, grass and paper figures of the era. A pixel whose alpha is below it is not
  drawn at all and every other one is drawn solid, so a fence of crossed planes hides what is
  behind it, needs no sorting, and casts the shadow of its bars rather than of its square, on both
  sides with `cull: 'none'`. The edge is as hard as the picture is read: in steps of pixels without
  `smooth`, rounded with it. The alpha cut is the picture's times the tint, the corners' colour and
  `alpha`, or what a colour hook returns, so a shader of your own cuts by its own (a dissolve). On
  `createMaterial({ shader: 'mesh3d' })`, `createMesh` and `createModel`, from 0 to 1 and refused
  outside it, in a scene document (`"alphaCutoff"`, written only when set) and in the editor's
  inspector. A glTF material with `alphaMode: 'MASK'` is cut at its `alphaCutoff` (a half unless
  it says) unless the game says otherwise; until now it was drawn with its picture's square. The
  shadow of a material with hooks is cut the same way: a flag full of holes waved by its `vertex`
  hook casts the waved holes, and a dissolve its colour hook cuts casts what is left of it (the
  hook is told a plain white light there, since no light has reached anything yet). Its shadow's
  shader is compiled alongside the material's, so a model does not stand a few frames casting
  nothing.
- **`useGame().releaseAsset(asset | key)`**: lets go of something the game loaded, off the graphics
  card, off the sound card and out of the game, for a level with files of its own when it is left for
  good. It knows what it is given by its `type`, and takes what is its own with it: a model's
  pictures and shapes, an atlas's, a font's or a particle effect's picture. Given a key, everything
  kept under it goes, the picture and the sound both called `'hero'`. Nothing is let go on its own,
  so a loading scene that loads everything up front, or a game going back to a scene it left, keeps
  what it loaded. The record ends `'released'` (a new `TLoadStatus`): whatever still shows it is not
  drawn, and is counted in a warning; a load still on its way is thrown away when it arrives; the
  same key asked for again loads afresh. What belongs to something in the game (a picture made with
  `createSpriteTexture` or `createPixelTexture`, a shape made with `createGeometry`) is refused, and
  then nothing goes. `TAsset` names every kind it takes.
- **The game hears its page**: `useGame().onHidden`, `onShown` (another tab, a minimised window, a
  phone's home screen, and back), `onBlurred`, `onFocused` (the keyboard elsewhere while the game is
  still in sight) and `onLeaving` (the page closing or reloading, for what is done at once). Each
  hands back what stops it, and one set up in a scene or a piece leaves with it. Heard whether or not
  the game pauses itself while hidden. `isHidden()` and `hasFocus()` ask how the page is right now.

### Changed

- **What the engine tells a game is heard through its handles, like the rest**: `useGame().onPaused`
  and `onResumed` (with `{ reason }`), `useScene().onPaused` and `onResumed` (the scene that asks,
  or another by its name), and a physics body's `onEnter` and `onExit`, which are called now
  (`body.onEnter((other) => …)`) rather than handed to `useSignal`. Each gives back what stops it,
  and one set up in a scene or a piece leaves with it. The `gamePaused`, `gameResumed`,
  `scenePaused` and `sceneResumed` signals are gone, and with them `TScenePauseEvent`
  (`TGamePauseEvent` stays, beside `TGameHandle`). They belonged to the page, so a second game on it
  heard the first one's pauses; these belong to their game. Signals are now only what a game makes
  for itself with `createGameSignal`.
- **A tween's end is heard only with `onEnd`: the `onComplete` option is gone.** There were two
  ways to hear the same moment, and an animation or a motion has only the handle's `onEnd`, so the
  tween now has the same: `tween({ from, to, duration, onUpdate }).onEnd(() => …)`. It runs when
  `onComplete` ran, by arriving or by `finish`, never by `cancel`, never while it repeats for ever,
  and a tween started from it still waits for the next frame. Code passing `onComplete` has to
  move it to `.onEnd(…)`; TypeScript says where.
- **The published types are one file per door.** `dist/types` held a declaration for every file of
  the engine, 1,106 of them, and "go to definition" landed in its insides; now each door has its
  own (`dist/types/index.d.ts`, `physics2d.d.ts`, `authoring.d.ts`…), holding what it exports and
  the types those name, with what two doors share written once in `shared/`, so a type is the same
  in `nacatamalon` and `nacatamalon/physics2d`. 19 files, 1.1 MB instead of 4.9. Nothing a game
  imports changes. The build stops when a door names a type no door exports, which found three:
  `TCollisionMatch` and `TCollisionMatched` (what `useCollisionWith` takes and hands back) are on
  the root now, and `TBox` (what `onReport` and `listen` name) on `nacatamalon/extend`.
- **What the engine keeps for itself is no longer in the published types.** What is marked
  internal is left out of them, a whole type or one field of a public one, and the build stops
  when something shown still names it. That took out of `TRuntimeStore` (`getActiveGame()`, on
  `nacatamalon/extend`) the renderer, the input sources, the audio manager and clock, full screen,
  the canvas fit and the capture and preview requests, and `collisionCallbacks` out of `TBox`;
  nothing outside the engine read them. `TMotionPreview`, what `previewMotion` answers, is on
  `nacatamalon/authoring` now, and `TMotionEase` is named by the easing curves themselves.
- **`nacatamalon/authoring` compiles on TypeScript 5 without `@webgpu/types`.**
  `PREVIEW_VERTEX_BUFFERS` is a `TPreviewVertexLayout` list, a type of its own in the shape WebGPU's
  `GPUVertexBufferLayout` takes, handed to `createRenderPipeline` as it is; it was WebGPU's, which
  TypeScript 5 does not have, so a project on it that loaded the door did not compile. The package
  check compiles the doors of tools on TypeScript 5.4 with no WebGPU types.
- **A shader written in WGSL alone says how to have it on both cards.** On WebGL2 such a material
  draws with the built-in shader, and the warning only told to write it again after a `// @glsl`
  line, which is how a shader file says it; it names the shader composer now (`compileShader`
  writes both from one graph) and `fragmentGlsl` for one written by hand in code, and so do the
  docs of `fragmentGlsl` and `vertexGlsl` and the guide for coding assistants (`llms.txt`).
- **`createGame({ renderer })` is read in capitals whatever way it is written**: `'webgl2'` is
  `'WEBGL2'` and `'webgpu'` is `'WEBGPU'`. A lowercase name used to stop the game with "Unknown
  renderer requested". A name that is none of `'AUTO'`, `'WEBGPU'` or `'WEBGL2'` is refused at
  `createGame`, saying the ones there are.

### Fixed

- **A pad kept shaking after its game's tab was hidden or closed**, until the game was opened again
  and shook once more: a hidden page gets no frames, so nothing was left to stop it. Every pad that
  was shaking is stopped when the page goes out of sight and when it is closed, through the motor it
  shook with, since a hidden page may no longer be handed its pads.
- **A store saving by itself (`mode: 'auto'`) lost the last change made before the page went**: it
  waits `throttle` seconds before writing, and a tab closed in between never wrote it. It writes what
  it still owes when the page is hidden and when it is leaving now. A store in `'manual'` still saves
  only when the game says.
- **A sprite showing a picture whose box was destroyed** (`createSpriteTexture`, `createPixelTexture`)
  was drawn as a square of its tint, though the code said it drew nothing. It is not drawn now.
- **A warning said once is said once in each game, not once for the page.** The engine says some
  mistakes only the first time, so one that repeats every frame does not bury the console: `listen`
  on something destroyed, a collider with no world, a physics layer the game does not name, more
  lights than a scene holds, a second light casting shadows, more scenes with a camera than fit, and
  others. It remembered that for the whole page, so a second game in the same page said nothing: the
  next test of a file run with `nacatamalon/headless`, a React page mounting `<Game>` again. Each
  game remembers its own now. The editor never showed it, since each Play is a page of its own.
  Three are still once for the page, having no game to hand: a skinned animation's cubic keys, a
  rumble given in milliseconds, and a store's throttle (stores belong to the page).
- **The voice's mistakes start like every other message**, `[NacatamalOn] speech:` and
  `[NacatamalOn] textToPhonemes:`, rather than `speech:` alone.
- **`createMaterial` is typed for a game of some size.** Called from a function of the game's own
  that takes its options as a type parameter, it did not compile, with an error a screen long; with
  options of any type it gave a material that could not be handed to `createMesh` without a cast.
  It is plain overloads now: options for a model give a model's material however they arrive, a
  sprite's a sprite's, options that could be either a material that could be either, to narrow by
  its `shader`, and an option it does not have is still refused where it is written.
- **A torch's shadow no longer lets light through a thin wall along its edges.** `shadowBias`, how
  far the shadow test is pushed off a surface so it does not shadow itself, was taken off the depth
  in the shadow map, and a torch's depth is not even: the default was a few centimetres near it and
  two metres across a room. Whatever stood that close behind a wall facing a street lamp, a floor
  at its foot, the walls meeting it in a corner, was taken as lit straight through it, in bands of
  light. The point tested is now moved towards the light by `shadowBias` in the world's units, the
  same distance for a sun and a torch, near and far; the default stays `0.002`, and a sun's shadows
  start a little nearer what casts them than they did. Both cards.
- **Rewriting an odd number of 16 bit triangle points works on WebGPU.** Writing over a buffer sent
  what it was given as it was, and this card takes only whole fours of bytes, so a shape with an odd
  number of triangles that was changed was refused there and stopped changing. It is rounded up as
  the first upload already was.
- **A shader that does not compile no longer takes whole frames down on WebGPU.** This card says a
  shader is broken a moment after it is made, and a pipeline used in that moment throws away every
  draw of its pass: one bad material blanked the frame for the first frame or two, and one bad
  screen effect (`usePostProcess`) did it every frame. A material's pipeline, a sprite's or a map's
  effect, a screen effect and a material's shadow are now compiled and checked apart from the frame,
  and used once the card says they are good. Until then what wears it is not drawn, as a sprite is
  not drawn until its sheet is there, for a frame or so; a broken one falls back to the built-in
  shader (the frame unchanged, for a screen effect) and says why once, with the shader's own lines.
  WebGL2 already checked its shaders as they were made.
- **A material whose `vertex` hook moves its corners casts the shape it moves them into.** The
  shadow map drew every model as its file or geometry made it, so a flag waved by its hook cast a
  flat sheet, and that flat ghost shadowed the cloth itself wherever the wave took it behind: a dark
  band across the flag. The shadow is drawn now with the material's own hook, told the same things
  (`ctx`, its `uniforms`, `mu.time`, its bones on a model that bends), on both cards and on the side
  its `cull` keeps, shader composer graphs and their noise included. A hook that reads what only the
  drawn model has casts the file's shape, as before, and says so once.
- **`quatFromAxisAngle` turns by the whole angle about an axis of any length**, as its docs always
  said. The axis was taken as a unit, so one a little short of it gave a quaternion that was not a
  unit and turned by less than asked: a plane meant to lean 42° about `(0, 0, 0.669)` leaned 26°.
  It is made a unit first now, and an axis of no length is no turn at all. Its docs also listed
  `angle` first; it is the last argument, as it always was.
- **`worldMatrix` on a mesh, an emitter in depth or a set of lines is there every frame**, as its
  type said, also when no box above moves it. It was left `undefined` then, so a `useUpdate` that
  read where a model in the scene itself was found nothing. It is its own placement as a matrix in
  that case, written into the same one each frame.
