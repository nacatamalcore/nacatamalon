# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased

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

## 0.3.1 — 2026-10-28

### Added

- **`pixelAspect`: pixels wider than tall, as the consoles' televisions showed them.** The NES and
  the SNES drew 256 across a 4:3 television, so each pixel was 8:7, and with square ones their
  games look squashed. `createGame({ pixelAspect: 8 / 7 })` paints each game pixel that much wider;
  only the size on screen changes, and the game draws the same `width × height`, with the camera,
  where things are, physics and the pointer as they were. With `scaling: 'integer'` the rows stay a
  whole multiple and the columns take that times 8/7, with fractions: the television's shape
  exactly (a whole multiple both ways is 9% too wide), at the price of columns a screen pixel apart
  in width, which a `crt()` on top hides. `'fill'` ignores it. In `project.json` and the editor's
  project settings ("Pixel shape"), and `useGame().setPixelAspect(aspect)` and `getPixelAspect()`
  change it while the game runs, for a player's option. The canvas says the shape it is painted at
  in `aspect-ratio` too, so a page whose style sheet sets `height: auto` on it keeps that shape
  rather than the buffer's.
- **`useGame().setScaling(scaling)` and `getScaling()`**: how the game is fitted to the page,
  changed while it runs (`'integer'`, `'contain'`, `'fill'`, `'none'`), for a player's option, crisp
  or as large as the screen. Only the size on screen changes. While full screen its own
  `fullscreenScaling` still wins, and this one is back once it is left.
- **`useGame().setPostProcessEnabled(enabled)` and `isPostProcessEnabled()`**: every screen effect
  on or off at once, the project's chain and each scene's, for a "CRT filter" in a game's options.
  Nothing is forgotten: turning them back on brings back the ones that were on. Off costs what no
  effects cost, and a scene change is still covered. Until now only a tool could do it, through
  `editorHandleOf`, which still has it.
- **`RENDER.CONSOLE_SCREENS`**: each console's screen to spread into `createGame`, its size, the
  shape of its pixels and its pictures a second: `nes` and `snes` 256 × 224 at 8:7, `genesis`
  320 × 224 at 32:35, `gameBoy` 160 × 144, `gba` 240 × 160, `ps1` and `n64` 320 × 240, all at 60.
  `createGame('#app', { ...RENDER.CONSOLE_SCREENS.snes, scaling: 'integer' })`. Only the screen: the
  controls are `INPUT.ACTION_PRESETS`, the colours `COLOR_LEVELS` and the television `crt()`.

### Changed

- **`scaling: 'integer'` counts its whole multiple in the screen's own pixels.** On a screen at
  125% or 150%, the usual Windows laptop, a CSS 3× was 3.75 or 4.5 of the screen's pixels, and
  painted with nearest neighbour a game pixel came out one width in some columns and another in the
  rest: measured in Chromium and WebKit, a game of one-pixel stripes showed 118 of 6 and 40 of 7 at
  125%, half of 7 and half of 8 at 150%. Now every game pixel is a whole number of the screen's
  (7 at 125%, 8 at 150%), so the CSS size has fractions (5.6×). On a density of 2 it also takes the
  half steps a whole CSS multiple skipped: 5.5× where it was 5×, a little bigger and as crisp. At a
  density of 1 nothing changes, nor below 1×, nor with `'contain'`, `'fill'` or `'none'`. A window
  dragged to a screen of another density fits again. The canvas is also centred on a whole pixel of
  the screen the browser can place exactly (a margin of 4 CSS pixels' steps at 1.25, 2 at 1.5), not
  with `margin: auto`: half an odd leftover started it part of a pixel in, and Chromium then painted
  up to a third of the columns a pixel narrower or wider. Its size is rounded down to the screen's
  pixels, so it never overflows its space by a fraction. Checked over 256 fits (every scaling,
  `keep`, density 1 to 2, square and 8:7 pixels, two spaces) in Chromium and WebKit.

### Fixed

- **A built-in in `createGame`'s `post` chain typechecks with only its key**:
  `post: [{ builtin: 'crt' }]`. The entry's `effect` was required, so code had to add `effect: ''`;
  it ran the same either way.
- **A font still on its way when its game goes is let go quietly**: it no longer warns that it
  "could not be loaded". A test that destroys a headless game before the built-in font arrives
  (one that changed scene a frame earlier) said so, and nothing had failed.
