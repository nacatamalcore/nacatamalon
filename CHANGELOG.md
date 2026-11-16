# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased

### Added

- **Online games, `nacatamalon/net` (experimental: it can change from one version to the next).** The same scenes run in a room of a server, with no screen
  and no sound, where what happens is decided, and in each player's page, which shows it and asks.
  `useNet()` is the network as a scene sees it, the same on both sides: `role` (`'server'` or
  `'client'`), `status`, `room`, `me`, `players`; `onJoin`, `onLeave` and `onMessage(type, (data,
  from) => …)`; a player's game `connect`s (to an address, or any connection), `send`s what the
  player did and hears `onConnect`/`onDisconnect`; the server `sendTo`s, `broadcast`s and `kick`s.
  What arrives is handed over at the start of a step, before any update, in order. `createServer({
  scenes, step, admit, roomScene })` lets players in (`admit` reads the token their game sends, and
  may give the name they go by) and gives each room a game of its own, ended when its last player
  leaves; `listen(port)` in Bun or Node (a WebSocket of its own, nothing to install), `accept(connection)` from anywhere else. `createRoom` is one room,
  for a server of someone else's (socket.io, or a framework with rooms of its own), moved by its own clock or by `step()`. A
  connection is anything that carries text both ways (`TNetConnection`): a WebSocket
  (`webSocketConnection`), socket.io or WebRTC in four functions, or `connectLoopback(server, {
  delay })`, a line in memory to a server in the same page or process.

  **Shared objects.** `useShared({ key, fields, owner, move, smooth })` makes an object one every
  game in the room sees: the server decides where it is and what its `fields` hold, and each
  player's game shows it a moment later, gliding between what it was told: as far behind as the
  line needs, one of the room's sends and the lateness the line shows (about 0.04 s on a good one),
  or what `connect`'s `interpolation` says. Nothing in a scene sends anything: the
  room sends what changed, `sendRate` times a second, to everyone, and everything to whoever comes
  later. `useNetSpawn('avatar', Avatar)` is the spawner both sides ask for by name: the server makes
  the object, and it is made in every player's game with the same arguments, and ends everywhere
  when the server destroys it. An object both sides build themselves matches by its `key`.

  **Real time.** An object with an `owner` and a `move` is that player's own: the server moves it
  with what they press, and their page moves it at once with the same `move`, ahead of the server,
  and, when the server's word comes, starts again from it and runs once more the steps the server
  had not seen. A player's game sends its actions on its own (when they change, and every step while
  it moves something of its own); `useNet().actions(player)` is that player's `useActions` on the
  server, and `useNet().rewind(player, fn)` runs `fn` with every shared object back where that
  player saw it when they pressed, so a hit on their screen is a hit, never further back than the
  room's `rewindLimit` (0.25 s unless it says) whatever a changed game claims it saw.
  `useNet().ping` is the round trip, measured every second.

  **Run by a tool.** `setNetHost` (`nacatamalon/authoring`) hands `listen(port)` and
  `connect(address)` to a tool that runs the server and its players itself, side by side: an
  editor, with nothing in the game changed.

  **A guide**, `guides/online.md` (and `online.es.md` in Spanish): a first online game in three
  files, objects everyone sees, messages, real time, shots, who gets in, what carries the lines
  (the engine's WebSocket, `ws`, socket.io, Colyseus, WebRTC with no game server), trying it with
  no internet, putting it online, and what it does not do yet.

- **Matcaps, `matcap(texture, { tint })`.** A material recipe that colours a model with a picture of
  a ball already lit, its colour, shadow and shine, read by which way each part faces the camera: no
  lamp needed nor read, the light always from the same side of the screen, the soft look of a clay
  model or a product shot. Only options of a material (`lighting: unlitLighting()` and a
  `reflection` of the picture at full, `metal: 1`), so the tint and the model's own picture multiply
  it, its `alpha` fades it as any surface's, and steps go on top. A scene document keeps it when its
  picture is a file.
- **`paintMatcap({ base, shade, shine, gloss, from, size })`** in `nacatamalon/pixels` paints one: a
  ball lit by one light, where it comes from as the camera sees it, with a highlight as glossy as
  asked. A matcap from a 3D program or a picture loads just the same.
- **The ground's bounce, `groundBounce({ color, reach, amount, groundY })`.** A material step that
  brings the ground's colour up onto what stands on it: more the closer a part is to the ground and
  the more it looks down, none `reach` above the ground nor on a face looking up. It goes on a matcap as well as on the engine's light;
  its numbers are uniforms (`groundBounceAmount`…), and a scene document keeps it.
- **A plugin's kind of drawing can look like the models round it** (`nacatamalon/extend/gpu`). Its context hands the engine's own shader functions, `context.shading` (WGSL and
  GLSL): `ambientFacing` for a two-coloured ambient, `roundReflectionUv` and `cubeReflectionUv` for a
  reflection read as a model's `reflection` reads it, and `snapToGrid` and `affineUvOf` for the
  style's corners and pictures. Each view in depth says what its scene's style asks (`style`:
  `perPixel`, `affine`, the grid `snap`), so a drawing shivers with `RENDER.STYLES.ps1` as a model
  does. A model's shaders read the same reflection, corner and picture functions, so those cannot
  drift; `ambientFacing` works out per pixel what a model works out at its corners.
- **Game systems, `registerGameSystem(name, fn)`**: code that belongs to the whole game rather than
  to a scene (music that goes on between levels, keys that work everywhere, achievements, analytics),
  for a game's own code and for plugins alike. Each game runs `fn` once before its first scene, in a
  box no change of scene touches, and tears it down after its scenes when it ends; in a frame its
  `useUpdate` run before every scene's and its `useLateUpdate` after. It runs whatever scene the game
  starts on, a level played from the editor included. A paused game pauses it, it draws nothing, the
  hooks that need a scene (cameras, lights, physics, `useRenderStyle`, `useFog`) throw inside it,
  `useScene` reaches the scenes it names (`launch('Hud')`, `pause('Level')`, `stop('Hud')`) and
  throws for `change` and the calls with no name, which would be about a scene of its own (a
  `launch` from its body, before the game has a scene, comes on the first frame, over the scene it
  starts on, the same behind a splash), and one that throws is reported while
  the game goes on. Registered while a game runs, it waits for the next one; the same name with the same function does nothing, so the body is made
  once and an install called twice is harmless. While a tool lays the game out (the editor's edit
  mode), its systems are taken down and start again when it is played.
- **A plugin's own kind of file, `registerAssetType({ kind, read, parse, release })`** in
  `nacatamalon/extend`. The engine fetches the file (in a page, headless or from `data:`), reads it as
  JSON, text or bytes, and the plugin's `parse` makes what the game uses of it, asking through its
  `help` for what the file names (a picture, a sound, another plugin file), loaded next to it and
  waited for. It hands back the kind's loading hook; its record counts in `useLoadProgress`, works with
  a loading scene's wait and `releaseAsset` (which calls `release` and lets go of what it asked for), and a scene
  document lists it as `{ type: 'plugin', kind, key, src }`, kept when saved even without the plugin.
- **A plugin's screen effect with a name, `registerPostEffect(info)`** in `nacatamalon/extend`, shaped
  as the engine's own effects: chains, render styles, scene documents and motions name it as they name
  `bloom`. **`allPostEffects()`** (tools) lists the engine's effects, then the plugins'.
- **A plugin can look at the game, `inspectGame(store)`** in `nacatamalon/extend`, for a tool that
  watches one (a debugging panel, a check for files nobody let go of). A frozen picture of the game
  now: its scenes, registered or running, with their state (`running`, `paused`, `held` or
  `stopped`) and how many of the files they asked for are ready; its systems; and every file it
  keeps, with its type, key, status, size or length, roughly how many bytes it takes, the scenes
  and systems that asked for it (those that stopped since included) and who keeps it loaded (the
  game, another file, or something made in code). **`onScenesChanged(store, listener)`** and
  **`onAssetsChanged(store, listener)`** call it once at the end of a frame in which that half
  changed, paused or not, so a panel need not ask every frame. What `inspectGame` hands back only
  gains fields and values until 2.0.
- **`useEnvironment({ around })` takes a plugin's drawing** as well as a mesh or a model: the
  surroundings are seen from where it is, followed as it moves, and it is left out of them, so a
  plugin's chrome reflects the room and not the inside of itself.
- **Mode 7, `createMode7({ key, height, horizon, fov, outside, haze })`.** A floor in perspective
  that turns and stretches as its camera moves: a kart racer's track, a world map seen from the air.
  One sprite as large as the screen (or the view it is made in) with the map as its picture, worked
  out per pixel by a material in both renderers; above the horizon nothing is drawn, so a
  `createBackdrop` behind it is the sky. Its camera is its `uniforms` (`x`, `y`, `angle`, `height`…),
  in pixels of the map, the same numbers `tileAt` and the physics read. Past the map's edges it
  repeats or shows a colour, and the far floor can fade into a haze.
- **`placeOnMode7(floor, sprite, x, y)`** stands a sprite on a point of the map: placed, scaled by
  its distance, ordered with the rest by depth and hidden behind the camera. **`mode7ToScreen`** and
  **`screenToMode7`** are the same arithmetic each way, for anything else and for clicks.

- **`useScene().restart(name, { props, transition })`** builds a running scene again, from itself,
  from the HUD over it or from a game system: with the props it was started with unless given
  others, in its place among the scenes, and, with a transition, stopped and built again behind the
  cover so the two copies never run at once. **`useScene().isRunning(name)`** asks whether a scene is
  running, by either name it answers to, before a `launch` that would throw.
- **The pointer touches shapes.** A set of shapes made with `createShapes` takes the pointer as one
  thing wherever one of its shapes is drawn, filled or outlined, in its place among the sprites:
  `listen(hud, { onClick })`, `onPointerOver` and the rest, `useDraggable`, `useDropZone` and
  `isPressing`. A listener on the object holding them covers them too, so a button of shapes and a
  label is one button with no hitbox. It carries no tags of its own: a drop zone reads its object's.
  A set scaled to nothing on either axis is not touched, as a sprite is not.

  What the pointer finds is now a `TPointerPicture`: `info.target`, `info.hits`, `pick()` and a
  drag's `zone` can be a set of shapes, so code that hands one of them to something that takes only
  sprites (`sizeOf`, `worldToLocal`, `useCameraFollow`, a hitbox's collision, `carries`) or reads its
  `anchor`, `texture` or `tags` narrows it first (`target.type === 'sprite'`). And a set of shapes
  that does not listen (a backdrop, a HUD's frame) is now what is under the pointer where it is
  drawn: `info.target === null` no longer means empty space there, and a set inside an object
  counts as that object for a touch action.

- **Every shape hook takes `uvs` and `uvScale`**, as `createGeometry` does:
  `useCubeGeometry({ width: 8, height: 3, uvs: 'box', uvScale: 1 })` lays one brick a unit, the
  same size on a wall of any size, and `usePlaneGeometry({ width: 40, depth: 40, uvs: 'planar',
  uvScale: 0.25 })` one tile every four. Each corner keeps its facing, so hard edges stay hard. A
  scene document keeps them in the shape's recipe.
  `uvScale` goes only with `uvs`: a shape's own picture places are laid once, and are not scaled.
  Each hook now says where its own picture places fall. A ring of numbers is a lathe of two points,
  from the outside in: `useLatheGeometry({ profile: [{ x: 1.3, y: 0 }, { x: 1, y: 0 }] })` faces
  up, with a strip once round it, its top at the inner edge.

- **`uvTransform` on a model's material: its picture repeated, turned and slid**, whatever the
  shape: `createMaterial({ shader: 'mesh3d', texture, uvTransform: { scale: 4, rotation, offset } })`,
  or on `createMesh` and `createModel`. Scaled, turned clockwise about the picture's top-left corner, then slid,
  the order a model file's own `KHR_texture_transform` uses, now read from the file. Its glow, its
  normal map (laid the new way round, so its relief leans right), an occlusion laid by the first
  picture coordinate and `ctx.uv` move with it. Plain numbers read every frame, so
  `material.uvTransform.offset.x += delta` scrolls a river. A scene document keeps it, and the
  editor's inspector sets it (Picture repeat, turn and slide).

- **`composerPolar(uv?, center?)`** in the shader composer, and a Polar node in a shader graph: a
  place read round a centre, `x` how far from it (`0` there, `1` at the middle of the edge) and `y`
  how far round (a turn from `0`, on the left, to `1`). A picture read at
  `composerSwizzle(composerPolar(), 'yx')` is a strip laid round a ring: a dial, a radar, rays from
  a sun, a ring that fills like a clock; with `composerTime()` added, one that spins.

### Fixed

- **`composerAtan2` at the origin is `0` on every card.** Neither shader language says what the
  angle of `(0, 0)` is, so one card could give `0` and another anything, and a picture read at it
  (the middle of a swirl or of a ring) could differ from one computer to the next.

- **A box's picture is upright on every face.** Three of its six faces (`+x`, `-z` and the top) read
  it a quarter turn round; now each reads it as it is seen from outside, as `uvs: 'box'` lays it. A
  textured box made before shows those three faces turned.
- **A disc reads its whole picture.** `useCircleGeometry`, and the lid and the base of a tube and a
  cone, read a single row of it, smeared round from the middle; now it is laid flat over them, as
  over a plane.
- **The evenly divided ball reads its picture the right way round**: `useIcoSphereGeometry` read it
  mirrored and half a turn round from `useSphereGeometry`; now both go round from `+x`, to the right
  as seen from outside. Its triangles across the seam no longer read the whole picture backwards in
  a strip, and its poles no longer pinch it.
- **A normal map reads the right way where a picture worked out by name folds.** With `uvs` by
  name (`createGeometry`, and now the shape hooks), a corner shared by triangles that read the
  picture mirrored, as the top and the bottom of a ball seen from above, kept one way across the
  surface for both, so a normal map lit one side of the fold inside out. Such a corner is split.
- **A built shape of more than 65535 corners loses no triangles.** A plane cut 255 by 255 numbered
  its last corner 65535, which WebGL2 takes as the start of a new strip, and dropped the triangles
  touching it; such a shape is now numbered the wide way.
- **A mask squashed to nothing is touched as nothing.** The pointer took a mask in the shape of a
  polygon or of shapes, scaled to 0 on either axis, as if it were at its full size, so what it hides
  could still be clicked where nothing was seen.
- **The next level stays under the HUD.** `useScene().change` built the scene coming in on top of
  every running scene, so a HUD launched beside the levels ended up under the next one, and under a
  level that restarted itself. It now takes the place of the scene it replaces, cut, covered or
  crossed, with the scenes its body launches just under it. And a restart (a change to its own
  name) when another running scene's document gives its root that same name throws before anything
  stops, where it used to stop the scene and then fail to start it again.
- **A scene built from a document answers to the name it was registered under** in every call of
  `useScene` that names one: `stop('Level1')`, `pause`, `resume`, `isPaused`, and `onPaused` and
  `onResumed` hear it by that name too. Only the name its document gave its root reached it. A
  name a scene is registered under now always means that scene; the name a document gave its root
  reaches a scene only when no scene is registered under it.
- **What a game starts behind the splash waits behind it.** A first scene that launched the level
  and the HUD from its `useReady` and stopped itself, the usual way to open a game, had them drawn
  over the splash from its first frame, and the splash's fade then waited on the scene that had
  gone. Now the whole game is behind the splash, doing exactly what it does without one: its
  scenes, what they launch (a game system's too), their changes, covered ones included. It is only
  not updated, drawn or clicked meanwhile, its systems wait with it, its sounds set to
  start on their own (`autoplay`) and `useSceneTransitionEnd` wait to be seen, and a cover it puts on is not drawn over the splash. The
  splash waits for its files and its systems', for a change being covered and for what a system
  launched, and then fades off it, letting it go halfway, on a screen of one colour. A game paused
  behind it, or with its time stopped, no longer keeps it up, and a sound a system starts on its own
  waits behind it too.
- **A picture with no step does what one with a step does.** In a game with a fixed `step`, a
  picture drawn with no step of the game in it (the screen faster than the step) moved the
  transition, but a scene change it uncovered was heard by `useSceneTransitionEnd`, and the sounds
  set to start once it was seen began, only on the next picture with a step: the scene showed
  uncovered first. Now they come on that same picture, as at the screen's own rate. A headless game
  or a room runs its first scene's `useSceneTransitionEnd` as it is made, as a page's game does on
  its first frame.
- **A game ended from inside itself stops there.** A game system whose body called the page's
  `destroy()` left the systems started before it running with no cleanup, and the first scene was
  still built; a `destroy()` from an update, a late update, `useSceneTransitionEnd` or a system
  started again when a laid-out game is played let the rest of that frame's updates run on the
  ended game. Now nothing more of it runs, and what had started is taken down. And a game destroyed
  while its splash was still arriving no longer starts its systems afterwards.
- **Nothing starts in a game that has ended.** A `useScene` handle kept past `destroy()` (from a
  promise, a timer, the editor reloading), or a `useCleanup` run as the game ends, still built the
  scenes it launched, changed to or restarted into the dead game, where their cleanups never ran.
  Now `launch`, `change` and `restart` do nothing once the game has ended.
- **A scene launched with a transition that stops itself from its `useReady`** left the screen
  covered for nothing, and every other covered change refused meanwhile. The cover now goes with it;
  changed to, the change finishes onto what is left, as a cut would.
- **A scene is not started twice while its body runs.** A body that launched its own name, or
  two scenes each launching the other if it was not running, started a second copy, or went on
  until the stack ran out. `launch` now throws for a scene whose body is running, and `isRunning`
  says `true` for it. And a `change` without a transition from a scene's own body, which left both
  scenes running, is left with a warning (from its `useReady`, or with a transition, it goes ahead).
- **A scene whose body ends the game** was listed in the ended game and its cleanups never ran; it
  is taken down instead.
- **The handle of a scene whose body threw** changed to another scene as if it were a `launch`, and
  with a transition covered a scene that never ran. It now says its scene is not running.
- **A quick tap knows where it was.** A finger's down, up and leave often come between two frames,
  and `usePointer().position()` answered `null` in the very frame `justPressed()` was true, so a game
  that asked where the tap landed lost it. It now says where the tap was for that frame, and `null`
  from the next.
- **A pack's songs and motions are found in the pack's folder.** A document in a pack listing a
  `.song` or a `.motion` fetched it from the page's root, where it is not, rather than from where the
  pack is served, as its pictures and sounds already were.

### Changed

- **`nacatamalon/extend/gpu` is no longer experimental.** `useGpuPass` and a plugin's kinds of drawing
  (`registerDrawableKind`, `createDrawable`) are kept as they are until 2.0. So are the shader pieces
  a kind is handed (`context.lights`, `context.lights2d`, `context.shading`), by name: a field or a
  function is only ever added, never taken away, renamed or given other arguments, and a kind reads
  them by name and sizes its buffers by the `floats` it is told.

- **A headless game whose first scene throws gives the browser back its own** (`fetch` and the rest it
  stood in for), as `destroy` does, rather than leaving them replaced for whatever runs next.
- **What a metal reflects no longer covers a see-through surface.** A reflection made a see-through
  surface more solid where it reflected, so a glass shows its edges; with `metal` that part now
  stays as see-through as the surface, since what it reflects is in the surface's own colour. Only a
  material with both `metal` and `alpha` under 1 looks different; the metal recipes are solid.

## 0.8.5 — 2026-11-11

### Added

- **Light at every pixel, `perPixel`.** `perPixel: true` on `createMaterial({ shader: 'mesh3d' })`,
  `createMesh`, `createMeshInstances` or `createModel` works a model's light out at every pixel
  rather than at its corners, so a shine is a round spot that slides across the surface however few
  triangles it has: the glossy plastic and chrome of the era's computer graphics. It can change while
  the game runs (`mesh.material.perPixel = true`), and a shader of your own receives it in
  `ctx.light` and `ctx.shine` unchanged, so `toonLighting()` and `rim()` take it too.
- **Reflection on a material.** `reflection` on the same four lays a picture of the surroundings over
  the surface, read round from the way each pixel faces: the picture alone, or `{ texture, front,
  edge, metal }`, how much it reflects facing the camera (default `0.04`, plastic; `0.9` is chrome),
  where it turns away (default `1`), and how much what it reflects takes the surface's colour
  (default `0`; `1` is gold). It goes with toon and rim, the numbers are uniforms that change while it
  runs, and what is reflected makes a see-through surface show its edges. A scene document keeps it.
- **Material recipes.** Thirteen functions that give back a model material's options, for
  `createMaterial` or to open with a spread: `plastic()`, `ceramic()`, `rubber()`, `carPaint()`,
  `pearl()`, `glass()`, `neon()`, `hologram()`, `chrome()`, `gold()`, `copper()`, `brass()` and
  `anodized({ tint })`, each taking `{ tint, environment }`.
- **Mirrors, `useMirror`.** `reflection: useMirror({ front, edge, metal, blur, scale })` on any flat
  model, a polished floor, a mirror on a wall, a lake: the scene drawn again from its 3D camera
  reflected across the model's plane, read where each pixel is on the screen, more of it where it is
  seen low. The plane is read from where the model ends up each frame, so it can move, and what is
  behind it is never in it.
- **The real surroundings, `useEnvironment`.** `useEnvironment({ around, height, live, size })` draws
  the scene round a model as the six faces of a cube, for chrome that reflects the room it is really
  in, leaving the model out of its own surroundings and following it as it moves. Captured once when
  the scene has loaded (`capture()` draws it again) or every frame with `live: true`. A material reads
  it as `read: 'cube'`; a shader with `envCubeUv(ctx)`, the composer with `composerCubeUv()`.
- **Normal maps.** `normalMap: texture` or `{ texture, strength }` on `createMaterial`, `createMesh`
  and `createModel` bends the surface's facing at every pixel before it is lit (`normalStrength` is
  its uniform); such a material is lit at every pixel unless it says `perPixel: false`. A scene
  document keeps it. `normalsFromHeight(pixels, { depth, wrap })` in `nacatamalon/pixels` makes one
  from a picture of heights, or from the texture itself.
- **A two-coloured ambient.** `useAmbientLight({ color, ground })`: `color` comes down from above
  and `ground` up from below, shared out by which way a surface faces. Without `ground` it is one
  colour, as before. A scene document keeps it on the ambient light.
- **Studio lighting in one line, `useStudio`.** A warm key light that casts, a cool fill panel, a
  back panel for a rim and a two-coloured ambient, and the studio painted for reflections; it gives
  back `{ ambient, key, fill, back, environment }` to change each.
- **Pictures to reflect.** `studioEnvironment({ top, horizon, ground, panels, panelColor, size })` in
  `nacatamalon/pixels` paints a photographer's studio as the round picture a reflection reads, and
  `sphereFromPanorama(pixels, { across, size })` makes a panorama or a photo into one.
- **Render styles.** `createGame({ style })` draws every scene in a style and `useRenderStyle(style)`
  one scene, giving back `{ style, set }` to change it while it runs. A style is plain data: how a
  material that does not say is drawn (`perPixel`, `affine`, `vertexSnap`), the screen effects after
  the scene's own (`post`), and the screen it brings (`width`, `height`, `pixelAspect`, `smooth`,
  `smoothScaling`), which the game can still set over it. `RENDER.STYLES` has `nes`, `snes`,
  `genesis`, `gameBoy`, `gba`, `ps1`, `saturn`, `n64`, `dreamcast` and `cgi`. A material that says
  `false` keeps out of its style.
- **`smoothScaling`** in `createGame` and in a style: how the screen is scaled up to the page, apart
  from `smooth`, which is for the pictures. Left out, it follows `smooth`, as before.
- **`useGame().setResolution(width, height)`** changes the game's resolution while it runs; a HUD
  placed in pixels is placed again in `onResized`.
- **`width` and `height` in `createGame` are optional.** Left out, they come from the style, and with
  none they are 800 × 600. A game that gives either one gives the resolution, and the one it leaves
  out is the default's, as before.

### Fixed

- **`envUv` is right from wherever the camera looks.** It worked the reflection out in the world's
  axes, so it was only right with the camera looking down -z; turned round, the picture folded in
  the middle of the chrome. With the camera looking down -z it gives what it gave before.
- **`setSmooth` changes how the screen is scaled up on the page too**, which stayed as it was when
  the game started.

### Changed

- **`vertexSnap`, `affine` and `perPixel` are written to a document when the material says them,
  `false` included.** Left out, a material takes its scene's style; before, only `true` was written.
- **A `fragmentGlsl` of your own that declares `meshLight`, `sampleLight` or `litBy` no longer
  compiles**: model materials now have them, for light at every pixel, as their WGSL already did.
