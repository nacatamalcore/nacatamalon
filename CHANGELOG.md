# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased

### Added

- **`cull` on a model's material**: which side of its triangles is thrown away. `'back'`, the
  default, is a shape seen from outside, as before. `'none'` draws both sides, for a leaf, a sheet,
  a flag or the top of a liquid, with no second plane turned round; each side is lit as the side it
  is, since the light is worked out at the corners for both, and casts its shadow. `'front'` shows a
  shape from inside, a dome of sky or a room, lit from inside. On `createMaterial({ shader: 'mesh3d' })`,
  `createMesh` and `createModel`, in a scene document (`"cull"`, written only when not `"back"`) and
  in the editor's inspector. A glTF material marked `doubleSided` is drawn with `'none'` unless the
  game says otherwise. A colour hook tells the two sides apart with `ctx.frontFacing`, and the shader
  composer with `composerFrontFacing()`. A model that keeps the usual side is drawn exactly as before.

### Fixed

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
