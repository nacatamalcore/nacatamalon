# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## 0.8.0 — 2026-11-11

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
- **A second picture coordinate in `createGeometry`.** `uv2`, two numbers a corner, in
  `createGeometry` and `updateGeometry`: for an occlusion map laid once over a shape whose colour
  repeats (`occlusion: { texture, uv: 'uv2' }`), or a hook that reads `ctx.uv2`. A corner that `uvs`
  worked out by name or `flat` splits keeps it. Left out, it is `uvs` again, as before; a glTF model
  already brought its own.
- **Many of one shape in one draw, `createMeshInstances`.** A meadow of grass, a hillside of rocks,
  a forest: `createMeshInstances({ geometry, capacity, ... })` takes what `createMesh` takes and is
  one model drawn many times over, one draw however many there are. `set(i, { x, y, z, rotationY,
  scale, tint, data })` places each instance inside it, with a colour that multiplies in and four
  numbers of its own, and `count` is how many are drawn; only the instances that changed are sent to
  the card, once a frame. Its `transform` moves them all and its material is every one's surface.
  It is lit, shadowed (casting and receiving, cut out by `alphaCutoff` too), fogged and skipped off
  screen as one model, by the box around all its instances, on both backends. It has no bones, and
  is made in code: a scene document leaves it out.
- **A material knows which instance a corner belongs to.** `VertContext` has `instance`, the four
  numbers `set` gave as `data`, and `origin`, where the instance stands (`composerInstanceData()`
  and `composerInstanceOrigin()` in the composer); both are zeros on a single model, so one material
  serves both. On a group the vertex hook runs after the instance has placed the corner, in the
  group's space, so wind crossing a field is written once for every blade. What the colour hook
  needs is handed on through `carry`.
- **A vertex hook can say which way the surface faces.** Writing `surfaceNormal = vec3<f32>(...)`
  (`vec3(...)` in GLSL) in a model material's vertex hook lights the corner by that facing, in the
  space `pos` is in, instead of the surface measured where the hook moved it: a blade of grass lit
  as if it faced up, a flat card lit as if it were round, with the engine's lamps and shadows. The
  composer writes it from `compileShader({ normal })`, and a graph file from its Normal Output node.
  Nothing written, nothing changes.
- **Where the camera stands, in a model material's colour hook.** `ctx.cameraPos`, in the world, the
  place the fog measures from, so `distance(ctx.cameraPos, ctx.worldPos)` is how far away a point is:
  bands, a fade or detail by distance, without a uniform moved by hand every frame. In the composer,
  `composerCameraPos()`, and a Camera Position node in a graph. In the shadow of a model cut out of
  its picture it is the camera's too, so what a hook leaves out by distance is left out of its shadow.
- **Models that add their colour.** `blend: 'additive'` on `createMaterial({ shader: 'mesh3d' })`,
  `createMesh`, `createMeshInstances` and `createModel` adds the model's colour to what is behind it,
  as far as its alpha says, rather than covering it: a flash, a hologram, a shield, a beam of light,
  a magic circle. It is always drawn see-through (after the solid ones, hiding nothing), casts no
  shadow, and fades into the fog by adding less. Kept in scene documents, and a Blend field in the
  editor's inspector, as sprites have.
- **The shadow warning only counts what the camera sees.** A sun's shadows reach from the camera
  out to `shadowArea` in front of it, and a square is a poor fit for a view, so there was always
  something behind the camera, off to a side or past its far end that no sensible size reaches. Its
  shadow is not on the screen either: the warning no longer asks for a bigger `shadowArea`, which
  would only have made every shadow coarser.
- **`updateBuffer(buffer, data, at)`** on a renderer writes from `at` bytes in, for a long run of
  which only a stretch changed.
- **Mipmaps.** `useLoadTexture({ src, mipmaps: true })` and `createPixelTexture(pixels, { mipmaps:
  true })` give a picture smaller and smaller copies of itself, made on the graphics card, and a
  model reads far away the copy its size on the screen asks for, so a floor, a road or a wall running
  into the distance no longer shimmers or crawls. With `smooth: true` it blends between two copies.
  `updatePixelTexture` works them out again. Only models read them; a picture without them is read
  as before.
- **Material readers that pick a mipmap.** In a model's colour hook `sampleTexture` and
  `sampleMap_<name>` read a picture with mipmaps from the copy that suits how the model's `uv` runs
  across the screen, inside an `if` too. `sampleTextureScaled(uv, scale)` and
  `sampleMapScaled_<name>(uv, scale)` are for a place that runs faster (`ctx.uv * 8.0` is
  `vec2(8.0)`), and `vec2(0.0)` reads the picture itself (a reflection's `envUv`). In the shader
  composer, `composerTextureSample(uv, { scale })` and `composerMapSample(name, uv, { scale })`, and
  a Scale on both nodes. Sprites, map layers and vertex hooks read the picture itself, as before.

- **A uniform takes what its option takes.** A point as `{ x, y }` and a colour as text or
  `{ r, g, b, a }`, as well as the card's own list, both when the effect or material is made and when
  it is changed afterwards: `zoom.uniforms.center = { x: 0.2, y: 0.8 }`,
  `glow.uniforms.color = '#ffcc00'`. The option was `{ x, y }` and the uniform had to be `[x, y]`; the
  colour was text when made and three numbers when changed. A colour given to a uniform of three
  numbers gives its `r, g, b`, and one with nothing else to go by is four. A file still keeps the
  numbers, whatever form the game used. Types `TUniformValue`, `TUniformPoint`, `TUniformPointValue`,
  `TUniformColorValue` and `TUniformNumbers` (the numbers a file keeps).
- **Retro physics, `nacatamalon/retro-physics2d`.** A second 2D physics, for the games of the old
  consoles: bodies that never turn (boxes square to the screen, balls), moved in pixels a fixed step
  at a time and stopped axis by axis, nothing to load (5 KB gzip, no WebAssembly) and the same result
  on every machine. `installRetroPhysics2d()` beside or instead of `installPhysics2d()`: a scene
  declares `useRetroWorld2d` and its objects `useRetroBody2d` (`retro-world-2d` and `retro-body-2d`
  in a scene file), and each scene is moved by the kind of world it declares.
  - A body can change size at any moment (a new `collider`, or its object scaled): standing, it
    keeps its feet where they were, so a hero that grows or shrinks stays on the floor.
  - A body is `static`, `dynamic` or `kinematic`, a `rect` or a `circle`, with `bounce` (its own,
    whole or by axis), `drag`, `maxSpeed` (whole or by axis), `gravityScale`, `mass` (how a push is
    shared), `pushable`, `solidSides` (a platform solid only on top is jumped through from below),
    `bounds` (what it does at the world's edges: `pass`, `stop`, `wrap`), `carries` (how much a
    platform carries what stands on it), `enabled`, `sensor` and the layers. All of it is read every
    step, so changing the record changes the body. The world has `gravity`, `bounds` and `timeScale`.
  - `getRetroBody2d(object)` gives what drives it: what a body of the full physics offers, plus
    `velocity`, `acceleration`, `speed`, `blocked` and `touching`/`wasTouching` by side, a picture
    that turns (`angularVelocity`) while the collider does not, `onEnter`/`onExit` told with the side
    and speed of the impact, `onTileEnter`/`onTileExit`, `onBounds`, `collidesIf`, `moveTowards`,
    `accelerateTowards` and `setVelocityFromAngle`.
  - Bodies collide with the scene's tilemaps: walls, ledges from above, slopes (a crate stands, a
    ball rolls down), belts. Pushes pass along a row of up to eight bodies; past that the last ones
    may stay a pixel into each other.
  - Things land on what is driven and ride it; what is driven pushes everything in its way.
  - `castRetroRay2d`, `findRetroBodies2d` and `isRetroAreaFree2d` ask the world about a line or a
    part of it, bodies and tiles.
  - `useTileBody2d` in a retro scene is one of its bodies: it pushes crates, rides lifts and is
    pushed, and keeps everything it does on the maps alone. Anywhere else it is as it was.
- **The debug mode.** `createGame({ debug: true })`, or `useGame().setDebugEnabled(true)` while the
  game runs, draws over every scene what it is made of: each collider of either 2D physics and of the
  3D one, in the colour of how it moves, the hitboxes, the tiles that stop things, and what a physics
  adds (a retro world's rays of the frame, its edges, where each body is going). It is never written
  into a scene.
- **For a package that adds a physics.** `TPhysicsProvider` may offer `createCharacter2d` (the
  character `useTileBody2d` gives in its scenes) and `drawDebug`, which draws its bodies with the
  `TDebugDraw` it is handed, in `DEBUG_COLORS`, both from `nacatamalon/extend`.

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
- **`setSmooth` reaches the models too.** Changing it while the game runs changed sprites and
  tilemaps and left every model with the filtering it had when the game started, on both renderers.
  On WebGL2 a lost context then rebuilt them with the new one, so the same game looked different
  before and after.
- **A failed capture on WebGPU gives its buffer back.** The buffer that brings the pixels from the
  graphics card was destroyed only when the capture worked; now it is destroyed either way.

### Changed

- **An object's body is reached by the object.** `getPhysicsBody2d(object)` from
  `nacatamalon/physics2d` and `getPhysicsBody3d(object)` from `nacatamalon/physics3d` give the body
  the simulation made of it, the one to push, stop and listen to: `getPhysicsBody2d(self)?.setLinearVelocity(80, 0)`.
  They work while the scene is built and in any frame after, from code or from a script on a box of
  a scene file, and give `null` while it has none, as in the editor while a scene is being built.
  The world's `bodyOf` is gone: `getPhysicsWorld2d()?.bodyOf(object)` is now
  `getPhysicsBody2d(object)`, and the same in 3D. `getPhysicsWorld2d` and `getPhysicsWorld3d` stay,
  for what only a world does: joints and characters added at any moment, and rays.
- **`useLines` gives the lines, and `setLines` changes them.** `useLines()` returned a pair, the
  lines and a function, and took only numbers: seven a corner with the colour from 0 to 1. Now it
  gives the lines, which are shown, hidden and moved like any drawing, and `setLines(lines, next)`
  takes either a list, `[{ from, to, color: '#ffcc00' }]`, or the `Float32Array` as before, for
  thousands rewritten every frame. `const [lines, set] = useLines({ vertices })` is now
  `const lines = useLines({ lines })` and `set(v)` is `setLines(lines, v)`. `TLinesHandle` is gone,
  `TNewLinesOptions` is `TLinesOptions`, and `TLine` is one line of the list.
- **`useCharacterBody3d`, and it is never `null`.** The 3D character was `useCharacterBody`, the one
  of its kind without its dimension, and gave `null` with no world to walk in, so every frame began
  with `if (!player) return`. Now it is `useCharacterBody3d`, like `useCharacterBody2d`, and as that
  one does it gives a character that never moves where nothing simulates (an editor building the
  scene), and says once when physics is installed and the scene has no 3D world. Its types are
  `TCharacterBody3d` and `TCharacterOptions3d`.
- **`objectFromDoc` and `copyObject`.** What `useSpawn` is given to build an object from a document
  while the game runs were `boxFromDoc` and `copyBox`: a box is what the editor and the files call
  it, and in the game it is an object. `useSpawn(boxFromDoc)(doc)` is now `useSpawn(objectFromDoc)(doc)`,
  and `useSpawn(copyBox)(enemy)` is `useSpawn(copyObject)(enemy)`. `.box` files do not change.
- **The physics doors no longer name what runs underneath.** `rapier2dProvider` is
  `physics2dProvider` and `box3dProvider` is `physics3dProvider`; `loadRapier2D()` is `loadPhysics2d()`
  and `loadBox3D()` is `loadPhysics3d()`, which now only wait until it is ready and hand nothing back.
  `TRapierModule` and `TBox3dModule` are no longer public. A game that calls `installPhysics2d()` or
  `installPhysics3d()` changes nothing, and what simulates can change later without touching a game.
- **2D physics runs on Box2D.** `nacatamalon/physics2d` now simulates with Box2D v3, compiled for
  the engine and carried inside it, instead of Rapier: the door weighs 120 KB gzip where Rapier alone
  was 1.29 MB, it steps about twice as fast, and it gives the same numbers on every machine.
  `@dimforge/rapier2d-compat` is no longer a dependency. Nothing in a game's code changes, and every
  test of the 2D physics passes as it did. What feels different:
  - A character walks up a step of up to 4 pixels on its own, where it used to stop at it.
  - A character a little inside a wall, standing still, is put out of it.
  - A soft body is built anew: each side a thin capsule hinged to the next at their corner, and its
    shape and area drawn back as a whole. It touches all along its outline, so another one can no
    longer slip in between two corners, and a heap of them squashes without folding.
  - Friction and bounce of two surfaces are still their mean.
- **`lookUniforms`, and no more "knobs".** `lookKnobs` from `nacatamalon/authoring` is
  `lookUniforms`. The guide, the docs and the messages called a uniform a knob; they say uniform now,
  as the API always did.
