# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased

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
  `createMesh` and `createModel`, in a scene document (`"cull"`, written only when not `"back"`) and
  in the editor's inspector. A glTF material marked `doubleSided` is drawn with `'none'` unless the
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

## 0.2.8 — 2026-10-25

### Added

- **`×` in the fonts built into the engine** (Nacatamal Arcade, Square and Thin), at the height of
  `+`: a score's `×3`, a size's `2×2`. It was drawn as the missing glyph.
- **`song.notes`**, on what `useSong` hands back: the notes it plays, every voice's, in the order
  they start, each with its `voice`, its `start` and `beats` in beats, its `pitch`, and its
  `instrument` and `effects` when it has them. There once the file is in, before it plays, so a
  rhythm game lays out its notes from the song itself rather than writing them a second time, and
  places one falling towards the line by `note.start - song.beat`. Its pitches follow
  `setTranspose`; its beats stay put at another tempo.
- **A pivot in 3D**, `transform.pivot`: the point a placement turns and grows about, in its own
  units from its origin, as a sprite's `pivot` is in the plane. On a box (`useTransform({ pivot })`),
  a mesh or a model: a runner that stumbles forward over its feet with `pivot: { x: 0, y: -1, z: 0 }`
  and `rotationX`, a door on its hinge, with no parent box and no quaternions composed by hand.
  Setting it moves nothing; a turn or a growth goes about it, and what the box holds goes with it.
  Physics, sound in space and `worldToLocal3d` find it where it is drawn, and a scene document keeps
  it (`"pivot"` in a transform, written only when set). Pictures and lights inside still turn about
  the origin, as with `quaternion`.
- **Dragging.** Every sprite, text, nine-slice and object (`listen(self, …)`) has `onDragStart`,
  `onDrag` and `onDragEnd`: pressed with the main button or a finger and moved a few pixels of the
  page (more for a finger), the press is a drag and no longer a click, followed wherever the pointer
  goes, one per finger. They give where it began and how far it went (`startX`, `deltaX`…), and
  `target` and `hits` are what is under it, never itself: what it was let go over. The cursor is an
  open hand over what can be dragged and a closed one while it is. **`useDraggable(target, options)`**
  moves it: held where it was taken, along an `axis`, on a `grid`, inside `bounds`, dropped on what
  carries one of the tags `dropOn`, or into a drop zone (said in `dropped`), and back home with
  `snapBack`. It returns `enable`, `disable`, `isEnabled` and `isDragging`, to let something be
  dragged later. **`useDropZone(target, { accepts })`** makes a place to drop into, accepting one tag
  or several: `canDrop()` while something it accepts is dragged anywhere and `isOver()` while it is
  over it, read every frame to light the places a card can go, off by themselves when the drag ends;
  `onEnter`, `onLeave` and `onDrop` for the same as events, and `enable`/`disable` for a slot that
  fills. The drag events give the zone under them in `zone`.
- **Glow maps in model files.** A glTF material's `emissiveTexture` is read with its colour picture
  and its glow comes through it: lit windows on a dark wall, a screen, a logo, after the lighting
  and so lit in the dark, in both renderers and through a material's looks (`ctx.emissive`). It
  ends up on `material.emissiveTexture` of every piece. Read with the colour picture's edges and its
  first set of coordinates. A glow picture that is not fetched (`textures: false`), still on the
  way, or one the engine cannot read (only an extension names it) leaves the piece with no glow,
  rather than with the glow over all of it. Until now such a glow was always dropped.
- **`emissiveTexture` on a material built in code**: `createMaterial({ shader: 'mesh3d',
  emissiveTexture })` and `createMesh({ emissiveTexture })`, the same picture a model file gives, for
  a screen or a sign made in code; a picture drawn into (`createSpriteTexture`) makes a monitor that
  glows with what a camera sees. A scene document keeps it by asset key (`"emissiveTexture"`, written
  only when there is one).
- **Masks.** `useMask` keeps objects, and everything under them, to a rectangle or to the shape of
  another object: a list scrolling in a window, a torch over a dark level, a hole cut in a wall, a
  wipe. It masks nothing until it is added (`mask.add(box)`, as many as want it, `remove`), so one
  mask can keep a map and its enemies and leave the HUD alone. A rectangle is in the masked object's
  own space and, square to the screen, costs nothing (a scissor). A shape (`by`) is everything
  another object draws, sprites by their pictures, shapes and texts, added together; it moves, turns
  and is tweened like any object, and is not drawn unless `showShape`. `channel: 'luminance'` reads a
  black and white cut-out, `invert` draws only outside, and `soft` fades by the shape instead of
  cutting at half way. A hard mask is written into the stencil in the pass, with no picture of its
  own; only a soft one draws into pictures. A mask inside another keeps to both, `zIndex` sorts what
  is masked as it always did, and what a mask keeps out is not touched by the pointer. The same
  frame on WebGPU and WebGL2. A scene document keeps it as a `mask` component on the masked object,
  its shape named by id, and the editor edits it in the inspector and outlines it on the selection.

### Changed

- **The depth of every pass has a stencil**: `depth24plus-stencil8` on WebGPU, `DEPTH24_STENCIL8`
  and a canvas with `stencil: true` on WebGL2, which is what masks write. Most cards already keep 24
  bits of depth in 32, so it costs little or nothing; the stencil is not stored after a pass, and a
  frame with nothing masked draws exactly as before.

- **An object gives off as many lights as it asks for.** Each `use…Light` call adds one, placed by
  its own `transform`, as `createMesh` adds a model: a car's two headlights and two tail lights are
  four calls in the car, the lamps of a room calls in the scene, with no `useSpawn` for each. A
  second light used to replace the first. `box.light` is now `box.lights`, a list, and a scene
  document keeps every light of a box as a component of its own. The ambient light stays one level
  for the scene: when there are several, the last one made sets it, said once (they used to add up).
- **Eight lights per model, thirty-two per scene.** A scene used to draw its first eight lights and
  drop the rest; now it holds thirty-two (`LIMITS.SCENE_LIGHTS`), and each model is lit by the eight
  that reach it most (`LIMITS.LIGHTS`), as the consoles of the era lit each thing they drew: a sun
  always, a lamp when its `range` touches the box around the model, the strongest first. A corridor
  of torches, a street of lamps or a level of fires is lit all along, and what a corner costs to
  light is still eight lights at most. A scene of eight lights or fewer looks exactly as it did.

### Fixed

- **A model whose picture is kept inside its `.glb` lost it when its scene was saved and opened
  again.** Saving wrote that picture under the name the engine gives it inside the file
  (`car.glb#image:0`) and listed it to be fetched; opening the scene fetched that name, failed, and
  the piece was drawn without its picture. A piece of a model file now writes no picture at all: the
  file brings it back.
