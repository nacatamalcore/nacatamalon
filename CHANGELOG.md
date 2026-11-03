# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased

### Added

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

- **Letting go of an effect leaves the effects something else still sets off.** When two effect files
  set off the same one and one of them was let go of, the shared one went with it and the other was
  left setting off nothing. Now it goes with the last of them, whether that is a file let go of or an
  effect written in code that stops being drawn, and an effect the game loaded or drew itself goes only
  when the game lets go of it. An effect written in code used again asks afresh for one that has gone.
- **Letting go of an effect another one still sets off waits for that one.** The one setting it off
  went on setting it off, with its picture already off the card and nothing said. Now it stays until
  the last effect setting it off goes too, and goes with it.
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

## 0.4.0 — 2026-10-31

### Added

- **`useScene().launch` and `stop` take a transition**, as `change` does: `launch('PauseMenu', {
  transition: iris(0.4) })` opens a menu on top behind an iris, and `stop('PauseMenu', { transition })`,
  or `stop({ transition })` from the menu itself, closes it behind one. The scene launched waits
  behind the cover until it has loaded, and the one stopped goes, cleanups and all, at the swap. The
  scenes underneath keep running: pause them first to freeze the game behind a menu. One covered
  change at a time, as before, and a transition WebGL2 cannot draw is a cut.
- **Tweens are declared once and played as many times as needed, and put together.** A tween made
  while the scene is built is kept and played on every hit, every press, every level:
  `const hurt = tween({ ... }); useCollisionWith(Enemy, () => hurt.play());`.
  - `tween.chain(a, b, c)` plays them one after another, and a step with no `from` starts where the
    one before left it. The time one leaves over goes to the next, so a chain lasts exactly what its
    steps add up to, where a chain written by hand with `onEnd` lost a frame between steps.
  - `tween.all(a, b)` plays them at the same time. Both are tweens, nest in each other, and are
    what is played: a tween inside one is played by it, and calling `play`, `pause` or `stop` on it
    is an error that says so.
  - `by: { transform: { x: -12 } }` moves a field by an amount, from wherever it is each time it is
    played: a knockback, a jump. `to` makes the same trip from the same start every time.
  - `reset()` puts every value back where the play started.
  - A tween declared from a callback and never played warns once, the forgotten `.play()`.

- **What a 2D camera cannot see is not drawn.** A sprite, a text or a panel wholly outside what its
  camera shows, in the size each pass is drawn (the screen, a picture, a capture), is left out as
  the frame is collected: nothing after that sorts it, lays it out, counts it or writes it for the
  card, and the pointer does not look through it either. Placed as it is drawn, parallax and
  `pixelSnap` included, held by its anchor, turned about its pivot; a text measured as it is laid
  out that frame. Measured with 60,000 sprites in a field the camera looks away from: from about
  52 ms a frame to under 10. A map layer draws only the rows of cells its camera shows, as one
  draw when it is seen whole as before: where each cell starts among its corners is noted when the
  layer is built, four bytes a cell. Its cycling tiles, shapes and particles are drawn whole as
  before. Every frame of the native parity scenes is the same pixel for pixel.

- **What a camera cannot see is not drawn.** A model wholly outside a view is skipped before it
  costs anything there (its numbers, its draw, every corner the card would have moved), judged per
  camera, so what one leaves out another still draws, and its shadow judged by the light, so one
  out of the picture still throws it in. A model that bends is judged in the pose it is in. One
  whose material moves its corners in a `vertex` hook is always drawn until it says how far with
  `boundsMargin`, in its own units; `alwaysDrawn: true` never skips one. Both on `createMesh`,
  `createModel` (every piece) and the scene document, and in the editor's inspector. To look at
  what a camera skips from outside it, `camera.cullingCamera = other` draws only what `other` sees,
  between two cameras of the same kind (both following the 2D one, or neither).

- **`ownerOf(drawable)`**: the object a sprite, text or mesh belongs to, the thing `useSpawn` made
  or the scene for one made in its body, and `null` once it or its piece is destroyed. The way back
  from what was touched to the whole piece: `destroy(ownerOf(info.target))` takes the piece, where
  `destroy(sprite)` takes only that sprite and leaves the piece running with its other sprites and
  its `useUpdate`, which `destroy`'s documentation now says.

- **`letterAt(text, info)`**: the letter of a text under the pointer, `{ index, char, line }`, with
  `text.text[index]` the one touched and `line` counting the ones `maxWidth` broke; `null` on a space,
  between letters or lines, or outside. Seen as drawn, through the text's own camera (one on the
  screen's layer too), turned, grown and held by its pivot. A letter is its whole step along its line,
  so a vector font's `o` is touched above and below its ink. For spelling games, words of dialogue to
  pick, a caret to place: `listen(word, { onClick: (info) => letterAt(word, info) })`.

- **`align` in `createGame` and `project.json`: where the game sits in its page.** `'center'`, a side
  (`'top'`, `'bottom'`, `'left'`, `'right'`) or a corner (`'top-left'`…), also as `RENDER.ALIGN.TOP`…
  It only says which side the space left over goes to, never the size, which `scaling` still
  decides. Said, it wins over the page's CSS. Left out, the page decides: a flexbox or a grid puts it
  where it aligns its content, and any other container in the middle both ways. Full screen is
  always the middle. `createGame('#app', { width: 320, height: 180, scaling: 'integer', align: RENDER.ALIGN.TOP })`
  for a phone with the page's controls below.

- **Animations go round and there and back in a tween's words.** A sprite's run (and an `.atlas`
  sequence) and `useSkeletalAnimation` take `repeat`, how many extra times (`2` is three times,
  negative for ever), and `yoyo`, back the other way each time with the ends shown once: a breath or
  a float without drawing the way back, a blow that lands three times without counting it in
  `onEnd`. With no `repeat`, `loop` says it as before. Every one of them, tweens included, has
  `onRepeat((…, times) => …)`, told each time it starts again; `onEnd` still says the last. Marks are
  passed on the way there and not on the way back.

### Changed

- **`encodePng` writes compressed files.** Each row behind the PNG filter that suits it and the whole
  squeezed with deflate, each block in a code built for it when that is shorter, as an image editor
  saves: a painted 320×180 sky is under 1 KB instead of 225. Nothing is lost: every pixel reads back
  exactly. Still in plain JavaScript and at once, with nothing to wait for. What the editor saves
  from its drawing tools shrinks with it.
- **`createSpriteTexture({ sees: 'scene' })` is now `sees: '3d'`**, the name for what it takes from
  the world around it: its models and particles, not its sprites or texts. What the picture's own
  component draws is drawn either way. `'scene'` is refused with a message that names the new value.
  A scene document saved with `"sees": "scene"` is read as `'3d'` with a warning, and saving it
  writes `"3d"`.
- **A tween does not move until `play()`.** `useTween()`'s function declares it. Every tween
  started by hand needs `.play()` at the end: `tween({ target: coin, to: { ... }, duration: 1 }).play()`.
  - `play()` starts it from the beginning whether it never played, is over, stopped or playing,
    as a sound and a motion do.
  - `cancel()` is now `stop()` and `onCancel` is `onStop`, the word the sound, the music, the motion
    and the animations already used. They do the same: it stays where it is, `onEnd` does not run.
  - `done` is now `playing`, which is true from `play()` until it ends or is stopped.
  - `tween.all` takes the tweens one by one, `tween.all(a, b)` or `tween.all(...list)`, never
    played and in no other chain or group, and plays them itself. It no longer waits for tweens
    something else already started.
  - `finish()` on a tween with `yoyo` and repeats left ends where its last trip ends, not where the
    trip it was on would have.

- **A big scene costs less a frame.** Sorting by `zIndex` reads each drawable once and does nothing
  when the tree already lists things in the order of their numbers, as a game built level first and
  HUD after does, and keeps what it works with
  between frames instead of making five lists of the scene's size each time. The renderer counts
  what a pass draws in one walk instead of one per kind, and goes from one batch of sprites to the
  next instead of past every sprite in it. Measured with 60,000 sprites: the sort from a fifth of
  the frame to a twenty-fifth, the renderer's walk from about 9 ms a frame to about 3. Nothing drawn
  changes: every frame of the native parity scenes is the same pixel for pixel as before.

- **A model says how each movement plays in `clips`, its marks with them.** `useSkeletalAnimation`
  takes `clips: { Death: { loop: false, next: 'Idle' }, Attack: { repeat: 2, events: [...] } }`: what
  a sprite's clip says, said per movement because a glTF has nowhere to put it. A movement not
  named plays by the options. A game that kept a table of which movements loop and called
  `setLoop` before each `play` (the Flatwood example did) needs neither, and `next` plays what comes
  after one that ends, eased in by `fade`. The marks moved there: `events: { Attack: [...] }` is now
  `clips: { Attack: { events: [...] } }`, one place for all a movement says.
- **A model's movement played backwards that does not go round ends at its start.** With a negative
  `setSpeed` and `loop: false` it stopped at the beginning without telling anybody; it now says so
  with `onEnd`, as one played forwards does at its end.
- **What goes with a destroyed object says it is destroyed.** `destroy(piece)` took its sprites,
  texts and child objects with it, but they kept `destroyed: false`, as if only what `destroy` was
  called on had gone: a game still holding a sprite of a piece it destroyed read it as alive. Now
  they are `true` too, as their documentation already promised: true means it is no longer part of
  the game.

- **Calling a hook or a `create*` where nothing is being built says how to get what was wanted.**
  `createSprite` in a `useUpdate` said only to call it inside a scene body, and the guide answered
  "spawn things with `useSpawn`", itself a hook that throws the same there: a game that wanted fish
  while it ran made a pool of hidden sprites instead. The error now says to put the thing in a piece,
  get its maker in the body (`const spawn = useSpawn(Fish)`) and call `spawn(…)` from `useUpdate` or a
  timer; `useSpawn` says it gives a maker; any other hook, to keep what it gives. In the shape of
  every message, who, what happened, what to do: `createSprite: called where nothing is being built
  (from useUpdate, a timer, a callback or after an await). Call it inside a scene body…`. A hook's
  own advice still follows it.

- **A model's material carries its second picture's place in spare numbers.** `ctx.uv2` rides in
  the fourth number of the facing and of the place on the screen instead of a slot of its own, on
  both cards: a material drawn on both sides used all 16 slots WebGPU promises and all 15 rows
  WebGL2 does, and now leaves one, for whatever a material carries next. Nothing drawn changes.

### Fixed

- **A picture kept inside a model file goes up to the card once however many files carry it.** It
  was named after the model and where in the file it sat, so two `.glb` files exported with the same
  colour sheet, or one carrying it twice, sent it up twice. It is found by what it holds now (the
  same bytes, not the same pixels saved differently).
- **Letting go of a model, an atlas, a font or a particle file keeps a picture another one still
  wears**, a model still loading that has already found it included. `releaseAsset` took it off the
  card for all of them, so the model left showed nothing; the last one to go takes it now, and a
  particle file that shares one with its child lets go of it with the child. Letting go of the
  picture itself, by its own key, still takes it.
- **A glTF animation with curved keys (`CUBICSPLINE`) moves along its curve.** It was walked evenly
  from key to key, with a warning; now each key's slopes shape the way it leaves and arrives, as the
  format defines, rotations included.
- **A model stretched more one way than another is lit along its surface.** A model scaled unevenly
  (`scaleX: 2`, a ball squashed as it lands), or a piece of a model file inside a node stretched that
  way, had its facings turned like its surface and leaned the wrong way, so it was lit as though its
  sides faced somewhere else. They are turned by the inverse of the placement now. Evenly scaled
  models look as they did. The shadow of a material cut by its own colour hook is cut by the same
  facing as the model. A skinned model's facings are turned by the inverse of its bones' mix too, which
  changes more than bones that stretch: two bones that only turn, mixed at a bent elbow or knee, make
  an uneven mix as well, so every rig is lit a little differently at its bent joints (about 20° at a
  right angle shared half and half), and correctly, where its facings leaned towards the bend before.
- **A covered scene change asked for while the scene of another is being built is refused.** A
  `change` with a transition whose new scene asked for one of its own from its body or its
  `useReady` had that one written over, leaving its scene held, never drawn or updated. The cover is
  in flight before the scene is built now, so the second is refused with a warning, as it is later.
- **A tile body standing a little inside a wall no longer goes through it when it walks away.**
  Landing past the corner of a step could leave `useTileBody2d` up to half a pixel into the wall
  beside it, and walking away slowly enough to still touch it (on ice, say) threw it out of the
  wall's far side. Only a wall ahead of where it was stops it now.
- **A scene saved with a model whose pieces share a name opens with each piece in its place.** A
  node drawn in two materials, two nodes the file left unnamed or two named alike all came back as
  copies of the first. A model's piece now says which of its name it is: its geometry source has
  `occurrence` (from 0, written only when it is not 0), and `node` is written as `""` for a piece
  with no name. They are counted over the whole file, in the order it is walked, so the number is
  the same however much of the file was loaded. A document with neither `node` nor `occurrence`
  still takes the first piece of the file. An `occurrence` that is not a whole number from 0, one
  with no `node`, or a `node` that is not text is not read. A document saved before this cannot be
  told apart: its pieces come back as they did.
- **Models, map layers and shapes come back after WebGL2 loses its context.** The browser can take
  the card away (a phone sending the tab to the background, a driver reset), and on its return
  sprites, text, pictures, particles and effects were drawn again, but every model and map layer
  was gone and `createPolygon` shapes left stray lines: their corners lived only on the old card.
  Each buffer now keeps a copy of its bytes on this side and is uploaded again with the restore,
  including one made or rewritten while the card was away. Only WebGL2 keeps that copy.
- **A game in a window of its own follows that window's size, and its sound comes back there.**
  Tried in Chrome with a real popped-out window: the container was watched by an observer from the
  window the engine was loaded in, which is never told about a container in another, so the game
  kept its first size however the window was resized. And the sound was let run by a click or a key
  in that other window only, so once the game's window had been minimised and opened again its
  sound stayed off. Both are now the game's own window's.

- **`emptyParticlesDoc` refuses a kind it does not know.** Anything but `'particles-2d'` made a 3D
  effect without a word, so a kind written the old way (`particles2d`) made a file that a 2D
  emitter then would not draw. Now it says so, as the reader does with such a file.

- **Models following the 2D camera pan with the sprites under `pixelSnap`.** The sprites were drawn
  through the 2D camera rounded to the pixels, and a `follow2d` camera's models through it as it
  was, so the two slid apart by the rounding as the camera moved: a third of a pixel at zoom 3. Now
  both go through the same, in a picture with `sees: 'scene'` too; a tool's camera is still not
  rounded. And a picture borrowing the scene's following 3D camera with a 2D camera of its own no
  longer leaves the screen's models drawn through the picture's 2D camera.

- **A run that `onRepeat` starts is not ended in the same frame.** When one frame of a sprite's run
  or a model's movement went round and also finished (a short clip, a high `speed`), and an
  `onRepeat` listener started another, the end was put on the new one: `onEnd` named it at once,
  and a model's stopped playing. Now what a frame passed is told about the run that passed it, the
  same clip started again included, and its marks, repeats and end stop at the first listener that
  starts another. A sprite's run started from a mark on the first picture begins the next frame, so
  its own first mark is told, and told once.

- **A `useSceneTransitionEnd` that leaves the scene stops the ones after it.** When one of them
  stopped its scene (sending the game elsewhere) or destroyed a box, the ones still waiting in that
  same frame ran anyway, in a scene already gone. Now each is asked again just before it runs. The
  same goes for a sound set to start once a scene is no longer held.

- **A material with more numbers than it holds draws the built-in look on WebGL2 too.** A material
  or a screen effect holds 64 numbers, `mu.time` and `mu.resolution` included; on WebGL2 one that
  asked for more threw out of the middle of every frame, so nothing else in the game was drawn
  either. Now both cards draw it the built-in way (a screen effect is skipped), and it is said once,
  when the material or effect is made, with how many it needs, rather than by WebGPU alone when it
  was first drawn.

- **A model whose file's bone weights do not add up to one is read as if they did.** A file rounded
  on the way out often misses by a little, which left a bending corner a hair off where its bones
  put it; now each corner's four are brought back to one when it is read. A corner moved by no bone
  is left as it was.

- **A game shown in a window of its own runs by that window.** A host can put the canvas in another
  window (a play window popped out of a tool), and the loop took its frames from the window the
  engine was loaded in: closed, the game kept drawing into nothing, a WebGPU error every frame
  (1,129 in a second, measured in Chromium), and minimising the other one froze it while it was in
  sight. Its frames, its size, its screen's density, its full screen, its pointer capture and its
  pause when hidden are now its own window's, the way its keyboard already was; closed, it stops.
  A game on its own page is drawn exactly as before.
- **WebGPU and WebGL2 draw a sprite of odd size held by its middle the same.** `pixelSnap` put
  where it is drawn on a whole pixel, and a sprite 5 wide by its middle there has its edges on
  halves. There the graphics card chose which texel each column showed, a column one way in WebGPU,
  the other in WebGL2, and sometimes with the first twice and the last gone. Now an edge left exactly
  between two pixels goes to the one before, for sprites, texts and panels that are not turned (a
  whole turn counts as none); anything else is drawn where it was, so a sprite growing by fractions
  still grows smoothly. The lines of a text centred on several lines can still fall on halves.
  Measured with Auto Size's 167 × 167 card: 2,058 pixels different between the two, now none.
- **The canvas sits where its page asks, and centred when it asks nothing.** Since 0.3.1 the engine
  set a margin on the left, rounded to a whole pixel of the screen, and a page that also centred it
  with `display: flex` (every CLI template, the editor's demos, the playgrounds, full screen) added
  half the leftover again: 5 px to the right in a 1300 px window, 80 px on a wide monitor. Now a
  container that lays its content out itself, a flexbox or a grid, says where the game goes, by its
  own `justify-content` and `align-items` (a grid's `justify-items`), and it goes there: a corner,
  the far side, the middle. Any other container has said nothing, and the game is centred both ways,
  up and down too, as it was only in full screen. The far margins are `auto`, so the page has
  nothing left to add; in a plain container the way down is a `top`, because a margin there went out
  through it and moved the whole container down. Either way it lands on whole pixels of the screen.
  Measured in Chromium at densities 1 to 2 over eight kinds of page.
- **A container's padding is room the game does not take.** It was counted as room: 40 px of it
  round the game had the canvas sized past its edge and off-centre.
- **A container with no size of its own no longer shrinks the game.** A bare `<div id="app">`, or
  one a centring page shrinks round what it holds, is as big as the canvas, and the game was scaled
  against itself, smaller every time, down to a corner. The container is measured without the canvas
  in it now, and along a side it has no size, the game keeps its own.
- **One file is loaded once, however its path is written.** The cache went by the path as the game
  wrote it, so a game served from a folder (`base: './'`, as on itch.io) that asked for
  `./assets/tilesets/overworld.atlas` while its map asked for the same sheet as
  `/html/1234/assets/tilesets/overworld.atlas` fetched it twice and made two textures of it: measured
  on a build of a platformer, 36 requests for 34 files, now 34. A file asked for with no `key` is now
  kept under its path as the page resolves it, and a map, a model or an effect that names a file the
  game already loaded under a key of its own (`useLoadAtlas({ src, key: 'tiles' })`) shares that one.
  So does a palette, a table or a shader the project's `post` chain names. Finding it and letting it
  go by name work with the path written either way (`createSprite({ texture: './a.png' })`,
  `useGame().releaseAsset('./a.png')`), a `key` is kept exactly as given, and the same file asked for
  twice under one key no longer warns that the key names another file. Only the `key` of a file
  loaded with none reads differently: its resolved path (`'/html/1234/assets/a.png'`), not the
  string the game wrote.
