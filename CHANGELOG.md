# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased

### Changed

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

### Added

- **The pixel functions take a colour as text**, as every other option does: `fillRect(p, 0, 0, 8, 8, '#ff6b1a')`,
  `drawText(p, 'MOTEL', 4, 4, { color: 'orange' })`, `fillGradient(p, { from: '#203060', to: '#f0a070' })`.

### Fixed

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

## 0.5.0 — 2026-11-05

### Added

- **Shading for generated pictures.** `shadeWithRamp(pixels, ramps, { light })` moves each pixel on the
  edge of a shape one step along its ramp, up on the side facing the light and down on the other.
  `fillDither(pixels, x, y, width, height, a, b, amount)` fills a rectangle with two colours in the
  ordered pattern of the `dither()` effect.
- **Named points on a sheet's frames.** A frame can say where its hand, feet or muzzle are, in an
  `.atlas` file (`points`) or in `createSpriteAtlas({ points })`, and `pointOf(sprite, 'hand')` gives
  that place in the world for the frame showing now, with its anchor, pivot, flip, size, scale, turn
  and the objects above it applied. What hangs from it follows the art, with no table of offsets.
- **The colours of the old machines.** `BUILTIN.PALETTES` has those of the NES, the Game Boy and the
  C64, and `useLoadPalette({ src: 'nacatamalon:nes' })` gives them to `paletteMatch` with no file.
  `snapToPalette(pixels, palette)` moves a picture to the nearest of a palette's
  colours, and `checkColorLimit(pixels, { cell: 8, colors: 3 })` says which cells use more than they may.
- **A level made in code.** `createTilemap({ doc, atlas })` takes what a `.tilemap` holds and its sheet
  as objects, with no file. It is ready at once when the sheet is, and `useTileBody2d`, ladders, ledges,
  slopes, `solidAt`, `setTile` and `useCameraFollow(hero, { bounds: map })` work on it as on a file's. What is
  wrong with the document throws. `sequences` gives the runs its cycling tiles name when the sheet comes
  from `createSpriteAtlas`.
- **An outline and a mirror for pictures.** `outlinePixels(pixels, color, { corners, region })` draws a
  one-pixel border around whatever is not transparent, and `mirrorPixels(pixels, 'x' | 'y', { region })`
  copies one half of a picture onto the other, turned round.
- **A picture of a game run with no browser.** `game.capture({ scale, region })` on a
  `createHeadlessGame` draws the screen without a graphics card and gives it back as pixels, for
  `encodePng` to write to a file: a test, a script or an assistant writing a game can look at what
  it draws, change it and look again. It draws the 2D as the card does (sprites and sheets, texts,
  panels, maps, shapes, particles, cameras, masks, views of the world), and pixel art at whole
  pixels comes out the same as on the screen. The effects that make pixel art's look are drawn as
  well, on the screen and in filters (`paletteMatch`, `lutGrade`, `dither`, `posterize`, `mosaic`,
  `colorAdjust`, `outline`, `dropShadow`, `glow`). 3D, a material's own shader and every other
  effect are left out, and said once. Nothing is drawn until it is asked for.
- **Pixel art written as rows of characters.** `pixelsFromRows(rows, palette)` draws a picture one
  character a pixel, top row first, with a palette saying what colour each one is (anything
  `getColor` reads; `'.'` and `' '` are nothing), and `scale` to draw each as a bigger square.
  `sheetFromRows({ stand, walkA, walkB }, palette)` lays several frames side by side for
  `createSpriteAtlas`, and says which number each name is for a sprite's animations. A character
  missing from the palette, a row of another width or a frame of another size throws, saying where.
  No game needed, so a test or a build script can draw one too.
- **Shapes drawn by the card each frame.** `createShapes({ shapes })` draws a list of shapes as plain
  data: rectangles (with rounded corners, turned), circles and ellipses and slices of them (a pie
  filled, an arc outlined), outlines of any number of corners, hollowed in too, and lines as wide as
  asked for. Each is filled, outlined or both, in any colour; an outline turns as its `join` says
  (`miter`, `round`, `bevel`), ends as its `cap` says (`butt`, `round`, `square`), and `align` puts it
  inside or outside what it goes round. Change a number, push a shape or take one out, and the next
  frame draws it; all of one object are drawn in one go. They take a filter and make the shape of a
  mask. On both cards, in scene documents as a `shapes` component, and natively.
- **Filters: effects on one object.** `useFilter({ effects })` runs effects over what an object, and
  everything under it, draws, before it is laid on the screen, and `add` says which objects, like a
  mask. A character made of pieces gets one contour around all of them, a coin a glow, a panel a
  shadow. Three effects are made for it: `outline` (a hard line of one colour, `thickness` in game
  pixels), `dropShadow` (`offset`, a soft or a hard edge, `amount`) and `glow` (`radius`,
  `intensity`); every screen effect runs on an object too, and `rect` gives them a part of the object
  to work on, so a `crt()` curves a television's screen. What is see-through around the object stays
  see-through. A mask on the same object keeps the filtered picture to it. On both cards, in scene
  documents as a `filter` component, and natively.
- **`dissolve`: a scene change in the shape of a picture.** `dissolve(0.6, mask, { color, softness })`
  covers the screen in the order the picture's greys say, darkest first, and uncovers it the same way
  back: noise eats the screen grain by grain, a star closes as a star, stripes are blinds. The mask is
  a file (`useLoadTexture`) or painted in code (`createPixelTexture`), stretched over the screen and
  read smoothly, so a small one keeps smooth edges. The clock waits for it to load, and it is kept
  until the uncover is over even when the scene that painted it has already stopped. A transition of
  your own takes a `mask` too and reads it with `sampleMask(uv)`, on both cards.
- **A `.motion` changes scene under any transition, as code would.** A scene event's `transition`
  takes `dissolve` with its `mask` (a picture next to the motion file, or from the root with `/`) and
  `softness`, and every transition takes what it takes in code: a `color`, a wipe's `direction`, an
  iris's `center`, pixelate's `blocks`. A field given to a transition that does not take it is
  refused, naming it. The masks are fetched when the motion arrives. The editor's `set_motion_event`
  writes them all, and checks the picture is in the project.
- **A transition can move along a curve.** `ease` on any transition, one of `useTween`'s curves:
  `{ ...iris(0.6), ease: easeInOutSine }` closes and opens gently, `easeOutBounce` lands. Each half
  is spread along it, while the clock still decides how long it lasts and when the swap comes, and
  what the shader is handed stays between 0 and 1. In a `.motion`, `"ease": "easeInOutSine"` by
  name, as a key's. Left out, it is a straight line, as before.
- **Maps on the material of a sprite, a text or a map layer.** `createMaterial({ maps: { grain }, fragment })`
  takes up to four pictures by name, as a model's does, and the shader reads them with
  `sampleMap_<name>(uv)`. It reads them at `localUv()`, where the pixel is across the sprite from 0 to
  1 (one tile of a map, one letter of a text, one piece of a nine-slice), so a mask stays put while the
  frames change and turns over with a flipped sprite, or at `layerUv()`, across the whole layer. An
  enemy crumbles into grain, a text letter by letter, a shine runs over the tiles, water ripples
  through noise. On both cards, in scene documents, and in the shader
  composer with `composerLocalUv()` and `composerLayerUv()`; Map Sample works in a sprite's graph too.
- **Transitions that cross from one scene to the other, with no cover between.** `crossfade`, where
  halfway through you see half of each; `push`, where the new scene slides in and pushes the old one
  off; and `crossWipe`, `crossIris` and `crossDissolve`, the edge, the circle and the mask of the ones
  that cover, with the new scene behind them instead of a colour: a clock mask sweeps from one scene
  to the other like a hand. They wait for the new scene to load with the old one still playing, then
  swap at once and spend the whole duration mixing the new scene with the old one's last picture.
  A transition of your own does it with `cross: true` and reads that picture with
  `sampleOutgoing(uv)`, on both cards. A `.motion` names them as it names the rest.
- **A movement on part of the body.** `useSkeletalAnimation(model, { only: ['spine'] })` is a second
  animator on top of the first, on those bones and all that hangs from them: the legs run while the
  arms wave. With nothing playing it leaves them to the one below, and a movement that ends or is
  stopped hands them back, eased by its `fade`. A skeleton says what its bones are called, in
  `jointNames`.
- **`createView`: a view of the world in a rectangle of the screen.**
  `createView({ x, y, width, height }, View, ...args)` makes the view
  (`createSpriteTexture({ sees: 'world' })`) and the sprite pinned to the screen that shows it, in
  one go: half of a split screen is one line. It gives back that sprite, for `viewToWorld` and to
  move it; its `texture` is the picture, and its piece, `ownerOf(sprite)`, is the whole view, to
  hide or `destroy`. It does not take the world off the screen: a split screen still says
  `useWorldOffScreen`. A view that is round or carries a material is made as before.

- **A model's occlusion: its creases darker, as its author saw them.** A glTF's `occlusionTexture`
  is read, its `strength` and either of its first two picture coordinates, and one picture that packs
  the occlusion with the roughness and metalness serves as it is. In code, `occlusion` on
  `createMaterial({ shader: 'mesh3d' })` and `createMesh`: the picture alone, or
  `{ texture, strength, uv: 'uv2', wrap }`, its own edges the colour picture's unless it says (a
  file's comes from its own sampler). It lowers only the scene's ambient light, so a crease turned to
  a lamp or the sun is as lit as anywhere and the same crease in the shade is darker. A material of
  your own gets it already in `ctx.light`, and on its own as `ctx.occlusion` (`composerOcclusion()`
  in the shader composer). Saved in a scene document; a model file's pieces bring theirs back from
  the file.
- **Particles drawn from a sheet.** A `.particles` file's `atlas`, `frame` and `anim` are drawn: one
  frame by its place or its name, or one of the sheet's runs played by every particle from its birth,
  over its life (`animPace: 'life'`, the default: it ends as the particle dies) or at its own `fps`
  (`'clip'`, as a sprite plays it; one that does not loop rests on its last frame). `repeat` and `yoyo` count the way they
  do for a sprite. In code, `atlas` also takes a sheet from `useLoadAtlas` or `createSpriteAtlas`,
  and `anim` a run written there. The sheet comes from the game's cache, shared with its sprites and
  maps, and the particles wait for it to land before they are drawn. In 2D and 3D, with tails and
  with the effects they set off.

- **Views of the world: a minimap, a rear-view mirror, a split screen.** `createSpriteTexture({
  sees: 'world' })` draws the whole world of its scene again, sprites, maps, texts, particles and
  models, through the cameras its component asks for, without running it twice: each thing is placed
  for the view, its parallax and pixel steps included, and the screen draws exactly as it did. What
  is pinned to the screen and what shows the view itself are never in it; `hide` and `only` choose
  the rest by tag, kind or object, and `setViewFilter` changes them. `viewToWorld`, `worldToView`
  and `viewToRay` turn points between the sprite showing a view and the world it sees, a point off
  the view included. `useWorldOffScreen()` has the screen draw only what is pinned, for a split
  screen, and `resizeSpriteTexture` makes a picture another size and keeps it the same picture. A 2D
  camera has a `cullingCamera`, as a 3D one does. Saved in a scene document.
- **Pictures are drawn after the pictures they show**, a monitor showing a handheld's screen or a
  minimap showing a monitor, whatever kind each one is; two that show each other are drawn in the
  order they were made, and the first shows the other a frame late.
- **`useLoadScene`: a scene laid out in the editor, loaded like a picture.**
  `const cave = useLoadScene({ src: 'scenes/cave.scene' })` fetches the file, adds the scene under
  the name written in it (`cave.name`, not always the file's) so `change(cave.name)` starts it,
  and asks at once for what it uses; `useLoader` counts it until all of that has arrived. A game
  no longer has to fetch and read every document before it starts, and a level can be loaded when
  the player gets near it. Changing to a scene whose file is still on its way says so, rather than
  that there is no such scene.

### Changed

- **A model whose corners are moved by more than four bones bends by the four that weigh the most.**
  A glTF can give a corner a second four (`JOINTS_1`, `WEIGHTS_1`), as a face rigged in detail does;
  they were left out, and the corner followed its first four, whichever they were. The eight are now
  read together and the four heaviest kept, brought back to adding up to one.
- **`createPolygon` draws an outline hollowed in past its middle.** It was drawn from its middle out,
  which folded over itself for a C or an arrow; such an outline is now cut into triangles that cover
  it once. One that can be seen whole from its middle (a blob, a star) is drawn as before.
- **The game's screen has a group of its own, `SCREEN`.** `RENDER` keeps how the engine draws
  (`TYPE`, `PIXEL_SNAP`, `LINE_VERTEX_FLOATS`), and what shape the screen is and how it sits in its
  page moves out: `RENDER.CONSOLE_SCREENS` is now `SCREEN.CONSOLES` and `RENDER.ALIGN` is
  `SCREEN.ALIGN`, beside the new `SCREEN.SCALING` and `SCREEN.KEEP`, the names `scaling` (and
  `fullscreenScaling`) and `keep` take. Change `RENDER.CONSOLE_SCREENS.snes` to
  `SCREEN.CONSOLES.snes`, and `RENDER.ALIGN.TOP` to `SCREEN.ALIGN.TOP`.
- **What a `project.json` leaves out reads as what `createGame` does when it is not told.** A file
  with no `width` was 320 by 224 on a dark background with `scaling: 'contain'`, and the same game in
  code 800 by 600, `darkviolet`, `scaling: 'none'`. `DEFAULT_PROJECT_SETTINGS` now reads the engine's
  defaults. A project that says these is not touched, and the editor's templates say them.
- **The post effects' constants are one group, `POST_EFFECTS`.** `POST` read like sending data, and
  the names of the effects the engine carries were apart from it, in `BUILTIN.POST`. Change
  `POST.CRT_PRESETS` to `POST_EFFECTS.CRT_PRESETS`, `POST.COLOR_LEVELS` to
  `POST_EFFECTS.COLOR_LEVELS`, and `BUILTIN.POST` to `POST_EFFECTS.NAMES`.
- **What the documents say they are is one group, `DOCUMENTS`.** The twelve numbers and names a
  document's `format` and `version` hold were loose on the root, beside everything a game reads. Now
  each is under its document, named as the field it fills: `SCENE_FORMAT` is
  `DOCUMENTS.SCENE.FORMAT` and `SCENE_VERSION` is `DOCUMENTS.SCENE.VERSION`, and the same for
  `MOTION` and `STORE`; `TILEMAP_FORMAT`, `PALETTE_FORMAT`, `ATLAS_FORMAT`, `PARTICLES_FORMAT`,
  `SONG_FORMAT` and `SHADER_GRAPH_FORMAT` are `DOCUMENTS.TILEMAP.FORMAT` and so on. The files
  themselves do not change.
- **A `.particles` file with an `atlas` is drawn with it.** It used to say the sheet was not drawn
  and show its particles as squares of their colour.
- **A `wrap` the engine has no word for is refused** on a model's material, its maps and its
  occlusion, naming where it was. It left the card with no way to read the picture: on WebGPU every
  frame threw, on WebGL2 the picture was read some other way with no word why.
- **`ctx.uv2` stretches as `ctx.uv` does on an `affine` material**, so what a material lays out by
  its second picture coordinate swims with its picture instead of sliding across it. It was held
  true to the surface while the first was stretched.
- **The warning for a covered change asked while another is covering says what to do.** The first
  one wins, and the second is ignored rather than queued, since it is nearly always late (the timer
  running out after the goal was reached) and played afterwards would undo the first. A scene that
  moves on as soon as it arrives asks from `useSceneTransitionEnd`, which the warning now names.
- **A scene document is a `.scene` file**, as a box is a `.box` and a store a `.store`. It was
  `.scene.json`. What is inside does not change; a pack's scenes are looked for as `.scene` too, so
  a pack made before carries its scenes under the old name and has them left out until they are
  renamed.

### Fixed

- **Cycling tiles keep their pace.** A run's clock moved once for each tile that named it and once for
  each object that asked for the map, so water with a flipped twin flowed twice as fast.
- **A clip whose pace could never end no longer stops the game.** `useSpriteAnimation` with an `fps`
  below zero, of `Infinity` or absurdly high, or an endless `speed`, never left its frame: it now says
  so once and goes on. A tile cycling at any pace costs the same, and an `.atlas` with an `fps` that
  is not a number it can use (`1e999`) is refused when it is read.
- **`createPolygon` shows again.** Since a map's cells read a window of their sheet, its corners were
  read shifted and it was not drawn at all, on either card (the soft bodies of Jelly Piggies among
  them).
- **Letting go of an effect leaves the effects something else still sets off.** When two effect files
  set off the same one and one of them was let go of, the shared one went with it and the other was
  left setting off nothing. Now it goes with the last of them, whether that is a file let go of or an
  effect written in code that stops being drawn, and an effect the game loaded or drew itself goes only
  when the game lets go of it. An effect written in code used again asks afresh for one that has gone.
- **Letting go of what something else still uses waits for it.** An effect another one still set off,
  a sheet an effect or a map took its frames from, a picture a model, a sheet, a font or an effect
  wore: let go of by the game, it went at once, and what used it went on drawing it white, with
  nothing said. Now it stays until the last thing using it goes, and goes with it. A shape a model is
  made of goes with the model too: let go of alone, the model drew nothing.
- **A map let go of while it loads stays let go of.** It came back ready when its sheet landed, and
  held that sheet for good; one whose sheet would not load held it too.
- **A sheet let go of while it loads stays let go of**, rather than ending as broken with a warning
  that it could not be loaded.
- **A model that fails to load no longer keeps the pictures others use.** A picture the game or
  another model also wore stayed until the failed model was let go of too. The ones it sent for
  itself still go with it.
- **An effect set off by another is born where it was set off, whatever its own file says.** One
  whose file rides its emitter (`worldSpace: false`) came out at the corner of the world, and what it
  set off in turn was placed twice. In the plane and in space. Being in the world, it collides too.
- **Editing an effect reaches the particles other effects set off from it.** Edited through an emitter
  of its own, the sparks a rocket was already setting off kept the old curves and the old children;
  now they change too, and are made again when they cannot be changed in place.
- **An effect an edit no longer sets off goes**, unless the game asked for it or something else still
  sets it off. It stayed in the game for good, since it would only have gone with the one that named
  it.
- **What the editor forgets no longer holds what it used.** An effect, a map or a model taken out to
  be loaded afresh still counted as setting off its children, using its sheet and wearing its
  pictures, so those stayed for good; and one the game had let go of meanwhile never went. It is also
  forgotten under every name it was kept under, and one still on its way stops there rather than
  taking them again when it lands.
- **What the editor forgets takes with it what holds it.** An effect setting it off, an effect or a
  map on its sheet, an effect or a model wearing its picture, loaded or still on its way: kept, each
  went on with the old version once the scene was built again, so a saved spark or sheet changed
  nothing until the game started again. A sheet or a font of pictures whose picture changed goes too. An effect written in
  code asks again for what was forgotten, and an emitter still showing a forgotten file keeps what it
  uses while it is drawn, and only then. Once the scene is built again, the editor lets go of what it
  forgot (`releaseForgotten`), which stayed on the graphics card for good.
- **An effect's chain reaches as far as its particles do.** A firework whose sparks leave embers that
  leave smoke lost its smoke when followed from one file: the loader stopped one step short of the
  simulation, and a file refused its children that way kept the refusal even when asked for on its
  own. Now the particles are what stops, at the same depth wherever the chain was first asked for, and
  it is said once, also for a chain of files loaded apart, which used to stop with nothing said. (The
  loader only stops fetching past 256 different files below one first file, which no effect comes near.)
- **A particle born of a set-off sets off its own.** Effects set off at birth stopped after the first
  step: `on: 'birth'` only went off for particles the emitter made itself.
- **Editing a running effect changes what it sets off, on every emitter following it.**
  `applyParticlesDoc` kept the old children running, paired a new document's children with the old
  files by position, and resized only the emitter it was given. A child still named keeps its file and,
  unless the edit resizes the effect, its particles; the particles of one no longer named go at once;
  and one newly named stays out until the effect is loaded anew.
- **Particle files that set each other off are refused however they arrive.** Only a chain followed
  from one file, written with the full path, was caught. Two files loaded apart that named each other,
  or one naming itself on a page that wrote its path another way, got by with nothing said. Now the
  link that would close the ring is left out and said, whichever arrives second. Two effects setting
  off the same one are still fine.
- **A picture drawn into (`createSpriteTexture`) is not lost when something it draws shows it.**
  Anything made by the picture's own component that showed that picture (as its picture, or as a map
  of its material) was drawn into the picture it read, and so was a 3D effect wearing a picture that
  looks at the 3D world: on WebGPU the whole picture's pass was thrown away, and on WebGL2 it read what
  it was halfway through writing. They are now left out of that pass, as a view already left them out
  of the world it walks.
- **A scene whose change was called off can change again.** When the scene it was bringing in was
  stopped behind the cover by something other than the game (a host loading another scene, as the
  editor does), the cover went with it and the scene that asked stayed on screen, but every
  `change` it asked for afterwards was ignored without a word. It now moves on as if the first had
  never been asked.
- **A scene restarting itself with a transition is covered.** `change` to its own name with a
  `transition` was done as a hard cut, with a warning. Now the screen is covered over the old copy,
  which runs until then as the scene going out of any change does, and the new copy is built behind
  the cover once the old one has stopped. Being the same scene it has usually nothing left to load
  and is uncovered at once; if it asks for something new, the screen stays covered until it lands.
- **A scene built from a document is one scene by either of its names.** Its root answers to the
  name its document gives it, and `launch` by the name it was registered under started a second
  copy beside the first; it now says it is already running, and `change` to that name restarts it.
- **A `useScene()` handle kept by a scene someone else stopped says so on `change`**, and does
  nothing. Called later, from a promise, it started the next scene without replacing anything.
- **`stop`, `pause`, `resume` and `isPaused` with no name reach the scene that asked**, by itself
  and not by its name. A scene built from a document whose root answers to another running
  scene's name stopped or paused that one instead, and its `onPaused` and `onResumed` heard that
  one too.
- **`stop` on a model's movement stops it from anywhere.** Called before the file arrived, the movement
  played anyway when it did; a `play` with no name after it starts it. Called from a listener, what
  was still to be told that frame and the movement's `next` went ahead regardless.
- **A model's movement asked for by a name the file does not have says so**, also when it was asked
  for before the file arrived or the file has none. It waited for ever without a word.
- **Changing the post chain of a running game lets go of the effects it replaced.** The shader file of
  an effect kept every one of them. A motion moving one of them follows the new one, rather than
  going on moving the one that is gone.
- **A picture or a sheet let go of while an effect written in code still showed it goes once the
  effect stops being drawn, or its scene stops.** It stayed on the card for ever, with nothing left to
  let go of it; a scene that stopped left its emitters on their effects. Handing
  an emitter's own `file` to a new one asks again for a picture or a sheet let go of meanwhile, as
  handing it the effect does.
- **A picture an effect written in code is showing stays when a model wearing it is let go of.** The
  effect is in no cache, so nothing counted it and the picture went from under it. It holds the picture
  while it has emitters, as it holds a sheet, and asks for it again if it is used after it went.
- **A shader, a palette or a colour table let go of while it is loading stays let go of.** It came back
  as `'ready'` when it arrived, the last two with their texture on the card, or as `'error'` if it
  failed.
- **A model let go of with `releaseAsset` while it is loading stays let go of.** It came back as
  `'ready'` when it arrived, with its shapes on the card, or as `'error'` if it failed. The pictures it
  had found go with it, unless something else wears them, and it sends for no more.
- **A movement's listener that starts another leaves the rest of that frame's marks unsaid**, even when
  several fall in the same stretch.
- **Easing between two movements no longer takes a bone neither of them turns to nothing.** It went
  to where the model's origin is and stayed there after the easing ended; it now stays where it was.
- **A song, a palette or a store written by a newer engine says so.** They were read as though
  nothing had changed, so an older game would play a newer `.song` wrong with no word why. Now each
  warns and reads what it can, as a scene and a motion already did.
- **Each half of a split screen in 3D has its shadows.** There was one shadow map, around the first
  view's camera, and the other half was drawn without shadows; two monitors that `sees: '3d'` the
  same. Now each view whose scene has a light casting has a map of its own, around its own camera,
  up to four in a frame, the screen's first. Each is made the first frame a view needs it, so a game
  with one camera keeps one, and let go of after a few seconds unused.
- **A view with only a `useAmbientLight` of its own keeps the scene's lamps.** It counted as lights
  of its own, so what the view drew was lit by the ambient alone and lost the sun, and the world it
  showed did not take it at all. Now it sets how dark the shade is in all the view shows, the world
  included, as its fog does: a minimap at `intensity: 1` reads in full while the game around it is
  dark. A picture that sees `'3d'` takes it for the room it shows. A view with lamps of its own is
  lit by those, as before.
- **Particles in space are drawn among see-through models by how far they are.** Smoke behind a pane
  of glass is drawn before the glass and seen through it, and smoke in front of it after, whichever
  was made first. A cloud is as far as its emitter. They used to go after every model, so smoke
  behind glass covered it. At a tie in `zIndex` with something flat, the cloud is now drawn first
  and the flat thing over it, as a model already was. A picture that `sees: '3d'` sorts what is
  see-through by its own camera, so a monitor looking the other way sees it the other way round,
  and with `useWorldOffScreen` its models are sorted too, where they were not before.
- **Flat particles are drawn on the pixels the sprites are on.** Under `pixelSnap` their size is
  whole pixels and, unturned, their edges land between two pixels, through the camera of the screen
  or of each view. Before, a particle's edge could fall almost on the middle of a row of pixels,
  and WebGPU and WebGL2 each covered that row or not, so the same frame came out a row apart. A
  turned particle has only its middle rounded, so its edges can still fall anywhere. Nothing changes
  under `'off'`.
- **A picture read exactly on the seam between two of its texels takes the same one in WebGPU and in
  WebGL2.** A sprite drawn much smaller than its picture, as in a minimap, or a particle on whole
  pixels showing a frame of a sheet, could have a pixel's read land on the seam, and each card took
  the texel on its own side of it: the same frame a row of the picture apart. A read within a hair of
  a seam is now put just past it, in sprites, texts, panels, masks and particles; every other read is
  left where it was, a picture blown up 256 times keeping its seam on the same column.
- **Letting go of an effect or a model no longer takes a picture the game loaded itself.** A sprite
  showing the spark `useLoadTexture` gave went blank when an effect naming the same picture was let
  go of. What the game asked for goes when the game lets go of it; the same holds for a sheet from
  `useLoadAtlas`.
- **An emitter that is destroyed is let go of by its effect.** Each one stayed on the effect's list
  for as long as the game ran, and one destroyed while its file was on its way had its particles
  made for it when the file landed.
