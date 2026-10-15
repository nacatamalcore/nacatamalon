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

- `createGame({ step })` (`TGameStep`, also `step` in the project file): `60`, or `50` for PAL, moves
  the game in steps of exactly `1 / step` seconds whatever the screen, the way the consoles did. A
  144 Hz screen and a 60 Hz one play the same game: `delta` is always the step, a jump is the same
  height, `x += 2` is two pixels a frame, and the same keys on the same steps give the same result. A
  press made on a picture with no step waits for the next one, and two steps in one picture hand it
  to the first only. A machine that falls behind runs up to four steps before drawing and then slows
  down rather than jumping ahead. With `timeScale` below 1 fewer steps run, each still exact; the
  scene-change transition stays on real time. Absent or `'display'`, the default, it is one update per
  picture as before. The 2D and 3D physics worlds step by exactly the game's step, once per step, so
  at `step: 50` bodies move as evenly as at 60; on the screen's time they keep their own 1/60.
  `TEditorHandle.stepFrame()` and `stepFrames(n)` with no `dt` step by one frame of the game, its
  `step` (1/50 at `step: 50`), instead of always 1/60.

- Touch, one finger apart from another: `TPointerInfo` carries `pointerId` and `pointerType`
  (`'mouse' | 'touch' | 'pen'`); two fingers moving in one frame keep two positions, each has its own
  click, and lifting one leaves the other pressing.
- The pointer can be asked, like the keyboard, from an update: `usePointer().isDown()`,
  `position()`, `touches()` (`TPointerTouch`, every finger pressing) and `isPressing(target)`, whether
  a finger is on a sprite, text, nine-slice or whole object right now. It follows the finger, so a
  thumb sliding from one on-screen button to the next presses the next.
- Actions bound to touch: `{ type: 'touch', box: 'Jump' }` holds the action while a finger is on the
  object named `Jump`, for an on-screen pad drawn by the engine; it counts for a handle on every
  device. Written to and read from the project file like the other bindings.
- `actions.heldFor(name)` and `useAction(name).heldFor()`: how long an action has been held, in
  seconds of game time, still set on the frame it is let go, for charged shots.
- The built-in font has `← → ↑ ↓ ▲ ▼ ◀ ▶ Ⓐ Ⓑ Ⓧ Ⓨ ★ ♥ ● ■`, drawn for Nacatamal Arcade, for on-screen
  prompts. Its image is better compressed too, half the size it was.

- `useSpawn`: what the component returns is the new object's `api`, typed (`TGameObject<TApi>`). An
  enemy that returns `{ hurt }` is hurt by the level that made it with `bat.api.hurt(1)`, with no
  signal and no lookup. It is set once the maker returns, `undefined` for a component that returns
  nothing, and never written to a saved scene.
- `worldToLocal(object, point)` and `localToWorld(object, point)`, with `worldToLocal3d` and
  `localToWorld3d`: a point of the world measured on an object, along its own turned and resized
  axes, and the way back, through everything above it. They take a whole object, or a sprite, text,
  nine-slice or model it draws. For where a hit landed on something and where a shot leaves it from.
- Platformer tiles: a tile in a `.tilemap` can say `oneWay` (a ledge stood on from above and passed
  through from below), `ladder`, `slope: [left, right]` (the floor's height at each edge, 0 to 1),
  `damage` (a value for the game, which the engine reports and never applies), `push: { x, y }` (a
  belt or a current, in pixels per second) and `props`, words, numbers and true or false the engine
  carries for the game. They combine: the top of a ladder is `ladder` and `oneWay`. A field written
  wrong is refused with the tile's number rather than dropped. `tileInfoAtPoint(map, layer, x, y)`
  reads the tile under a point of the world. The editor keeps them when it saves a map.
- Hitboxes, for what touches what with no physics. `overlaps(a, b)` says whether two things share any
  area right now: objects, sprites, texts, panels or a rectangle of the world, measured where they are
  drawn and turned as they are drawn (edges that only meet do not count). `useHitbox({ group })` gives
  an object a part that can be touched, the size of its picture until given one, moved with `x`/`y`
  and switched off with `enabled`, all changeable at any time. `useOverlap('shot', 'enemy', (shot,
  enemy) => ...)` calls for every pair of the two groups touching, every frame they touch, once the
  scene's updates are over and before `useLateUpdate`; something destroyed by an earlier call is not
  passed again, so a bullet hits one enemy and not the three behind it.
- `useCharacterBody2d({ width, height })` from `nacatamalon/physics2d` (`TCharacterBody2d`,
  `TCharacterOptions2d`): a platformer's character in the 2D world. The game writes its speed into
  `velocity` (pixels per second) and it goes exactly that fast, with no sliding or bouncing, while the
  world stops it at walls, holds it on ledges and slopes, and lets it push crates. It falls with the
  world's gravity up to `maxFall` (420 by default, seven pixels a frame at `step: 60`), and reports
  `onGround`, `onCeiling`, `onWall`, `onOneWay` (with `dropThrough()`), `onLadder` (the game sets
  `climbing`, which turns gravity off and goes back to `false` off the ladder), `ground` (the tile
  underfoot) and `damage`; belts and currents (`push`) carry it. It moves once the scene's updates are
  over, so what the game decides this frame is seen this frame, and before hitboxes and `useLateUpdate`.
  Where nothing simulates, as in a tool showing the scene, it never moves.
- `useTileBody2d({ width, height })`: the same character with no physics engine, walking on the
  scene's maps the classic way, in pixels: across and against walls, then up or down against floors
  and ceilings, in pieces no longer than half a tile so nothing is passed through at any speed. Same
  fields as `useCharacterBody2d` (both return `TCharacterBody2d`), so a game moves between the two by
  changing one line; it knows only the maps, and pushes nothing. Slopes are measured under the middle
  of the feet, and a block of any height on flat ground is a wall.
- Both characters report `onLadder` standing on a ladder's top too (standing, not in the air above
  it), so down there starts climbing down through it. Climbing ends once the character no longer
  touches the ladder, so one that climbs out of a top that is a ledge stands on it.
- Joints in the 2D world: `useJoint2d(a, b, joint)` from `nacatamalon/physics2d` (`TJoint2d`,
  `TJointHandle2d`), or `getPhysicsWorld2d().addJoint` to join things in the middle of the game.
  `'hinge'` (bridge planks, pendulums, doors; `limits`, and a `motor` for a windmill), `'rope'` (never
  further than its length), `'spring'` (said as `frequency` and `damping`, so a heavy weight bounces
  like a light one), `'slider'` (along an axis, with `limits` and a `motor`) and `'weld'`. Points are
  given in the world, where the pin is; `b` as `null` ties to a fixed point. Joined bodies do not
  collide with each other unless `collide: true`. A joint goes with either of its objects, or with
  `destroy()`. A character (`useCharacterBody2d`) walks on a bridge of hinged planks. A hinge or a
  slider takes `friction`, how much of its turning or sliding it loses a second whatever the bodies
  weigh (`2` calms a swing in a few seconds), since nothing else in the world slows a joint down.
- `useCameraFollow(target, { deadzone, bounds, lead, smooth, round })` (`TCameraFollow`): a
  platformer's camera. The target moves inside a dead zone without the camera moving, the camera never
  shows past `bounds` (a map, which is its own rectangle, or a rectangle of the world), looks ahead by
  `lead`, follows at once or glides with `smooth` (seconds, alike at any refresh rate), and stays on
  whole pixels. It moves in `useLateUpdate`, once every update and every body's move is over, at any
  `zoom`. `shake(strength, seconds)` shakes the view and dies away; `snap()` jumps to the target; the
  target and every setting can be changed at any time.
- Rooms on `useCameraFollow`: `rooms` (a list of rectangles of the world, or one size for a grid of
  equal rooms) keeps the camera inside the room the target is in, and when the target walks into
  another it scrolls across over `scroll` seconds (`0.6`; `0` cuts), from wherever it was, even
  halfway through another scroll. A gap between rooms keeps the one it was in. `onRoom(room, from)` is
  called as each room is entered, and `room` and `scrolling` say where it is, for a game that stops
  its characters while the screen scrolls.
- `createGame({ pixelSnap })`: draws sprites, texts, panels and maps on whole pixels of the game,
  rounding where they are drawn and never where they are, so they move as fast as they say. With the
  camera on whole pixels (`useCameraFollow`), a character it follows stays on the same pixel of the
  screen instead of shaking back and forth by one. On by default unless the game is `smooth`. Something
  slower than a pixel a frame now steps a pixel at a time, as on the consoles.
- Sprites that repeat: `repeat: true` lays the picture (or its frame of a sheet) across the sprite's
  size instead of stretching it, on both backends, and `repeatOffset` scrolls the pattern inside it.
- Parallax: `parallax: { x, y }` on a sprite, `useParallax(factor)` on an object and everything under
  it, and `parallax` on a map's layer (in the `.tilemap` file too): how much each moves with the camera,
  `1` as everything, `0` not at all. Only how it is drawn and touched by the pointer; its placement
  stays as written. It moves in whole pixels, and is nothing to what is pinned to the screen.
- `createBackdrop({ key, parallax, y })` (`TBackdropOptions`): a picture repeated endlessly across the
  world behind everything, moving with the camera only so much: the far layers of a 16-bit level, one
  sprite and nothing to move every frame. `repeatY` fills everything.
- `useCharacterBody2d` stands still on what the simulation moves. It puts its weight on what it
  stands on (`mass`, or its size at a crate's density), the solver leaves that pair alone, and it
  pushes what it walks into sideways only. Before, a character standing on a bridge and the bridge
  bounced off each other by several pixels for as long as the game ran.
- `createPolygon({ points, texture | atlas, uvs, tint })` (`TPolygon`, `TPolygonOptions`): a shape
  whose corners the game moves, its picture stretched over them. `points` are plain numbers on the
  record, changed every frame and drawn the next; each corner keeps its point of the picture (the
  box the first outline fits in, unless `uvs` says), so moving it stretches the picture under it.
  Drawn from its middle out, in the scene's order, through the 2D camera, on whole pixels with
  `pixelSnap`, in both backends. Without a picture it is its `tint`. Not written to a saved scene.
- `useSoftBody2d({ shape, ... })` (`TSoftBody2d`, `TSoftBodyOptions2d`, `TSoftBodyShape2d`), from
  `nacatamalon/physics2d`: the object being built becomes a soft body in the scene's 2D world, a
  ring of corners held together by springs that falls, squashes, wobbles and rolls, on the map and
  against the other bodies. `'disk'` (`radius`, `corners`), `'polygon'` (`points`) or `'rope'` (`to`,
  `corners`); `softness` (how quickly it springs back, `5` a second), `damping`, `keepShape` (on by default:
  without it, a ring under a weight gives way),
  `mass`, `friction`, `bounce`, `pinned` corners, and `polygon` to move the corners of a
  `createPolygon` shape with it. The object is kept at its middle and `outline` says where the
  corners are; `push(x, y)` pushes it this frame and `kick(x, y)` adds to its speed at once.
  `useCharacterBody2d` does not stand on soft bodies.

### Changed

- A scene with a 2D world (`usePhysicsWorld2d`) puts its maps in it: `solid` tiles are walls,
  `oneWay` tiles are ledges that hold what lands on them from above and let through what comes from
  below, and `slope` tiles are ramps. A crate falls onto a map's floor, and breaking a tile with
  `setTile` opens the floor under it. Walls side by side are joined, so nothing catches on the seams
  of a floor. A map can be moved and scaled; a turned one is said once and left out.
- `createMaterial` given `uniforms` (which `compileShader` always gives) returns a material whose
  `uniforms` is typed as there, so a parameter is animated with `material.uniforms.glow = 1` and no
  `?? {}`. To keep that true, a material handed `uniforms` with no shader of its own gives the same
  bag back instead of `null`.

### Fixed

- `applyForce` on a 2D body pushes as hard as it says. Rapier keeps a force on a body from one step
  to the next until it is reset, so a force asked for every frame, as its comment invited, grew every
  frame: a push of 100 on a body of mass 100 for two seconds moved it 79 pixels instead of 2. The
  world now hands Rapier only the last frame's push (several calls in one frame add up), takes it off
  when the game stops asking, and pushes alike at any refresh rate.

- A touch the system took back (a browser gesture, a call coming in) was never released: the pointer
  ignored `pointercancel`, so what it pressed stayed pressed. It now ends like a release, with no click.
- Two fingers on the screen were one pointer: their moves were folded into one position, which jumped
  between them, and lifting either released both.
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
