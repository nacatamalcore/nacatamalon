# Changelog

What changed in the current release of `nacatamalon`, and what is waiting for the next one. Earlier
releases are in [changelog/](./changelog/), one file each.

## Unreleased

### Added

- **Instruments** for a song's voices, the way an 8-bit tracker shapes a note: `volume`, `duty`,
  `arpeggio` and `pitch` as lists of numbers read one a frame (a sixtieth of a second), with a `|`
  where a list starts again, plus `vibrato` and `slide`. A song keeps them in `instruments`, a voice
  starts with its `instrument`, and `@name` in its notes changes it (`@-` for none). What cannot be
  read in them is in `instrumentErrors`, with the instrument, the field and the word, and
  `songInstrumentErrors` finds the same without making the sound. A song with no instruments sounds
  exactly as it did.
- **What one note does on its own**, written in brackets after it: `[slide]`, `[vib]`,
  `[arp:0,4,7]`, `[vol:8]`.
- **The engine's instruments** (`SONG_INSTRUMENTS`), played by name with nothing to define: `@lead`,
  `@pluck`, `@major`, `@bass`, `@kick`, `@snare`… A song's own of the same name is played instead;
  `@nacatamalon:kick` always means the engine's.
- **A fifth voice, `dpcm`**, that plays samples at the console's grain: the engine's (`SONG_SAMPLES`:
  a drum kit, an orchestra hit, a zap, made by its own code) or a sound file of the game, which
  `useLoadSong` loads before the song is ready.
- **Two more consoles**, by a song's `chip`: `'snes'`, eight voices of samples in the console's BRR,
  at its rate and smoothing, with envelopes (`adsr`) and an `echo` the instruments go into; and
  `'genesis'`, six FM voices of four operators (`fm`: the eight algorithms and feedback) and the
  squares and noise of its second chip. The engine has instruments for both: `@piano`, `@strings`,
  `@choir`… and `@epiano`, `@slap-bass`, `@fm-brass`…
- **Thirty-nine songs the engine has** (`SONG_BUILTINS`): public domain pieces (Beethoven, Grieg,
  Mozart, Bach, Handel, Vivaldi, Wagner, Bizet, Satie, Joplin, Sousa, and folk songs and hymns)
  arranged for the three consoles, asked for by key,
  `useLoadSong({ src: 'nacatamalon:ode-to-joy' })`, and loaded only when a game asks for one.
- **Pan**, where between left (`-1`) and right (`1`) a sound is heard: `useSound(clip, { pan })`, and
  for a song each voice's `pan` in its file or `useSong(song, { pan: { pulse2: 0.6 } })`. Both
  handles move it with a fade (`setPan`) and have a `pan` a tween can carry across:
  `tween({ target: sound, to: { pan: 1 } })`, `tween({ target: song.pan, to: { pulse2: -1 } })`.
  Scenes keep it.
- **Where a song is heard**: `song.position`, the seconds into it that are reaching the speaker now,
  by the audio clock and with the output's delay taken off, `song.beat`, the same in beats from the
  start (`3.5`, right at any tempo), and `song.latency`, that delay: what a
  rhythm game judges a press against, and how early to start a sound meant to land on a beat.
  `onBeat`, a song's and a piece of music's, now comes on the beat heard, that much later than it is
  played. `useAudio().setOffset(seconds)` adds the player's own delay (Bluetooth headphones), which a
  game measures and keeps as it likes, and all of these count it. Music from files (`useMusic`) has
  them too: `position`, `positionAt`, `latency`, and `beat` counted from its `firstBeat` at its `bpm`.
- **When a press happened**: `keys.pressedAt(key)`, `pointer.pressedAt(button?)`,
  `pad.pressedAt(button)` and `actions.pressedAt(name)` say when it went down, the frame it did, and every pointer event has its
  `time`: the moment of the hand, from the event itself, up to a frame before the frame that tells of
  it. `song.positionAt(moment)` is where the song was being heard then, for judging a press against
  the beat.
- **`importTrackerText`** in `nacatamalon/authoring`: a text export of FamiTracker or FamiStudio as one
  of our songs, its instruments, its samples as sound files, and what could not be brought over. The
  editor does it when one is dropped on it.
- **`useLoadTrackerSong({ src })`**: the same export loaded by a game as it is, read when it lands,
  its samples kept in memory: the song `useLoadSong` gives, for `useSong`. A game that does not call
  it carries none of the reading.

## 0.2.6 — 2026-10-21

### Added

- `project.json` keeps what `createGame` takes about the page and the console that it could not say
  before: `pixelSnap` (left out, it follows `smooth`), `fullscreenScaling`, `contextMenu`, `banner`
  and `splash`. A project written before reads them as the defaults, and `gameOptionsFromProject`
  hands them on, so a game made in the editor can open with its splash or let a right click open the
  browser's menu. The editor shows them in the project's settings.

- A panel (`createNineSlice`) is kept in scene documents, as a `nine-slice` component with its
  picture or sheet, its size, its four borders and how it fills, so a level saved from a running game
  keeps its buttons and dialogue boxes instead of leaving them out. One whose picture is missing is
  said and left out, and the rest of the scene opens. A cell of a sheet made in code, which has no file
  to name, is kept as its picture and the window into it (`uvOffset`, `uvScale`), as a sprite's is.
  The editor shows it as a Panel (selected and moved in the 2D view, sized by its width and height),
  and turns a sprite into a panel and back.
- `T3dOptions`, the 3D side of `T2dOptions`: what a shape (`createMesh`) and a placed model
  (`createModel`) share, written once, with `TMeshSurfaceOptions` inside it for how the surface is
  painted. `TMeshOptions` and `TModelOptions` are it plus what is their own. Like `T2dOptions`, it is
  for its family only: particles and lines keep options of their own.
- `createSprite({ texture: 'hero' })` and `createNineSlice({ texture: 'panel' })` name their picture by
  the key it was loaded under, the way a text names its font; `key` stays.
- `sizeOf(thing)` and `boundsOf(thing)`: how big a sprite, a text or a panel is, and the rectangle it
  covers. A sprite given no size measures its picture, and a text its letters, the moment it is made
  (in the font the engine carries too, before it has loaded);
  `boundsOf` takes the anchor, the pivot and the scale into account, in the place its `transform` is
  written, so things of one box line up: a box behind a label, a coin after a score.
- A placed model is used like any other drawing: `tint`, `alpha`, `zIndex` and `castShadow` (new, also
  an option of `createModel`) on what `createModel` returns change every piece at once, the ones still
  on the way too, and each piece keeps its own colour under the tint (a tint changed in place,
  `model.tint.a = 0.5` or a tween of it, reaches them too); `destroy(model)` takes it all,
  and one destroyed while its file loads never comes. `parts` stays for one piece alone.
  `createMesh({ material, tint })` says, once, that a material's colours go in the material.
- A text and a panel take `parallax` and `blend` too, as a sprite does, now that they are in
  `T2dOptions`: a far sign that slides by slowly, a glowing "LEVEL UP!". What is pinned to the screen
  has no parallax whatever it says, so a HUD stays put. To mirror a text or a panel, `scaleX: -1`. A
  scene document keeps a text's `blend` and `parallax` too, and the editor's inspector shows them, with
  `Blend` for a sprite as well. A panel keeps them in scene documents too.
- `T2dOptions`: what a sprite, a text and a panel share (`transform`, `anchor`, `pivot`, `tint`,
  `visible`, `zIndex`, `smooth`, `tags`, `material`, `uniforms` and the pointer events), written once.
  `TSpriteOptions`, `TTextOptions` and `TNineSliceOptions` are it plus what is their own.
- A colour is said the same way wherever one is asked for: `'#ff6b1a'`, `0xff6b1a`, `'tomato'`, any CSS
  colour, or a `TColor` (the type is `TColorOption`). `tint` on every object, lights, fog, materials,
  transitions, the background, the helpers: they took only a `TColor` and needed `getColor` around
  every one; the screen effects and the looks already took them all. What is read back is a `TColor`
  as before. `getColor` takes a `TColor` too and hands it back as it is.
- `usePointer().justPressed()` and `justReleased()`: a finger or a mouse button that went down or came
  up this frame, true for one frame like the keyboard's. `justPressed('right')` asks about one button,
  also when it is pressed or let go while another is held.
- A scene takes props, like a component: how it is opened. `const Level = ({ level = 1 }: { level?:
  number }) => ...`, and `useScene().change(Level, { props: { level: 3 } })` or `launch(Hud, { props
  })`. Given the function, TypeScript checks the props; the name still works, unchecked. Every prop
  needs a default, since a scene also starts with none (the first one, a restart, the editor's
  Play), and TypeScript refuses to hand `createGame` one that does not have it.
- `useWatch` watches a store too: `useWatch(() => { hud.text = ... }, [gameStore, lives])` runs on the
  first frame and once a frame after any `set` or action. `useStore` stays for one value, heard
  straight away and in pause.
- `quatSlerp(a, b, t)`: turns smoothly from one 3D facing to another, a turret easing toward the
  player or a camera toward where it looks.
- Physics layers have names: `physicsLayers: ['world', 'player', 'enemy']` in `createGame` or the
  project, the first being layer 0, and a body says `layer: 'enemy', collidesWith: ['world',
  'player']` rather than `2` and a mask; `setLayers` takes names too. A saved scene keeps the
  numbers, so renaming a layer changes nothing there. A name the game did not give is said once and
  taken as layer 0.
- Tags: what something is, as many as it likes. `useTag('enemy')` gives the tag, to `add`,
  `remove`, `has`, find `all()` in the scene and `clear()`; asking is getting, and nothing registers
  it. A piece adds itself (`useTag('enemy').add(useSelf())`) or is made with
  `useSpawn(Bat, { tags: ['enemy'] })`; a sprite, text or panel carries tags on its own
  (`createSprite({ tags: ['wall'] })`). A saved scene's box keeps them.
- `useCollisionWith(Enemy, (enemy) => ...)`: a piece says itself what it collides with, by component
  or by tag, from its own body, so a bullet and an enemy written apart need no rule in the scene that knows both.
  Every frame they touch by default, or `{ when: 'start' }` on the first and `'end'` on parting.
- `sceneOf(self)`: the scene something is in, to reach the rest of it by name,
  `findObject(sceneOf(self), 'Score')`, wherever the behaviour sits.
- `useSpawn` takes a name for what it makes: `useSpawn(Button, 'Jump')`, or
  `useSpawn(Bullet, { name: 'Bullet', parent: 'scene' })` beside the place. Without one, a thing is
  still called after its component's function, but that is only a label: a published build shortens
  function names, so a touch button or a `findObject` that found `Jump` while developing found
  nothing once shipped. Anything looked up by name needs it given. While developing, a lookup that
  finds something only by its function's name says so in the console, once a name, with the line
  to write; `findObject`, `findObjects`, a touch binding, a photo and a headless `find` all tell.
- `useTouchAction('jump')`: an on-screen button says itself which action a finger on it holds, from
  its own body. No name to match with the action map, one `Button` component made twice with two
  props is two buttons, and a destroyed button presses nothing. It is the game's, not a binding, so
  a controls screen neither lists nor saves it. `{ type: 'touch', box: 'Jump' }` stays for a map
  written in a project file.

### Changed

- A behaviour shares with the others on its object the way a component does with `useSpawn`: what
  its function returns is its api, and `useScriptApi('spin')` reaches it by the name it was
  registered under, the same word as in `requires`. `useApi` is now `useScriptApi`, and `provide('spin',
  { stop })` in a behaviour called `spin` is simply `return { stop }`. `provide` stays for a word of
  its own: several behaviours that answer to one word (`provide('health', …)` in a slime and in a
  boss), or a second thing from one behaviour; `useScriptApi('health')` reaches it the same way.
- In `project.json`'s screen-effect chain, an effect of the game's own is named by `effect`, as code
  names it (`usePostProcess({ effect })`, a material's `effect`): `{ "effect": "shaders/crt.shader" }`
  rather than `"shader"`. A project written before is read the same and saved with the new name.
  `shader` stays what it is elsewhere, the family the code is for (`shader: 'mesh3d'`, `// @shader
  mesh3d`).
- A screen effect is made with what a person writes, as `crt`'s `maskType` already was: points as `{ x,
  y }` (`distort`, `godrays`, `shockwave` and `zoomBlur`'s `center`, `motionBlur`'s `velocity`,
  `rgbSplit`'s channels), modes by name (`halftone({ mode: 'lines' })`, `wave({ axis: 'columns' })`)
  and yes or no as booleans (`grain`'s `animated`, `crt`'s `interlace` and `linearBlend`, and
  `CRT_PRESETS`). `effect.uniforms` keep the numbers and `[x, y]` the shader reads, so project files
  and motions do not change.
- `useLight` is `useDirectionalLight`, as its sisters say what they are (`usePointLight`,
  `useSpotLight`, `useAmbientLight`) and as `createDirectionalLight` already was.
- Lights and cameras are placed with `transform`, like everything else: `useCamera3d({ transform: { z:
  5 }, fov: 60 })` rather than `useCamera3d({ z: 5, fov: 60 })`, and the same for `useCamera2d`,
  `useDirectionalLight`, `usePointLight`, `useSpotLight` and their `create…`. They were written flat and read
  as `.transform`; now both are `transform`. What is their own (`fov`, `zoom`, `color`, `range`…)
  stays where it was. Scene documents do not change.
- `halftone`'s `angle`, in degrees, is `rotation`, in radians (`Math.PI / 4` by default), like every
  other turn: angles are radians, except a 3D camera's `fov`, a `hue` and a sound's `cone`, which
  everyone says in degrees. A project or a motion that wrote `angle: 30` is read as `rotation` of
  30°, on a halftone the project named itself too; motions are version 3 now.
- Time is in seconds everywhere. Four things counted milliseconds and now count seconds, like `delta`,
  timers and tweens always did: transitions (`fade(0.3)` rather than `fade(300)`, and `wipe`, `iris`,
  `pixelate`), a pad's `rumble({ duration, delay })`, a store's `persist.throttle`, and a headless
  game's `loaded(timeout)`. A transition over ten seconds says it is probably milliseconds, and so do
  a rumble over its five, a throttle over a minute and a `loaded` wait over two. Saved
  files are read as they were: a motion's transition `"ms": 400` is read as `"duration": 0.4` and
  written back so, and a store file of version 1 has its throttle read in milliseconds (they are
  version 2 now).
- A right click over the game no longer opens the browser's menu: the right button is the game's,
  as in a window of its own (`usePointer().justPressed('right')`). Only over the canvas; the page keeps
  its menu. `createGame(..., { contextMenu: true })` lets it open again, and
  `useGame().setContextMenu(true)` while it runs.
- A pointer's `button` is a name: `'main'` (the left button, or a finger), `'middle'`, `'right'`,
  `'back'` and `'forward'`, all in `POINTER_BUTTONS`, rather than the browser's `0` to `4`. `info.button
  === 2` becomes `info.button === 'right'`.
- Collisions are asked by component or by tag, not by a hitbox's group.
  `useCollisionWith(Enemy, (enemy) => enemy.api.hurt(1))` meets the pieces `useSpawn` made from
  `Enemy`, their `api` typed; `useCollisionWith('damageable', ...)` meets everything carrying the tag,
  pieces and tagged sprites alike. `useCollisionBetween` takes either on each side. A piece is
  measured by its hitboxes or what it draws, a tagged sprite by itself, and two pieces with physics
  bodies, in 2D or 3D, meet when the simulation says they touch: a game moves from hitboxes to
  physics without rewriting a collision. Every body tells when a touch begins and ends from the
  moment it is made, so a crate placed resting on the floor counts, and so does one met by a rule
  made after it landed; a body taken away, or one destroyed, touches nothing from then on. A piece
  does not touch what it draws itself (its own tagged sprite), and something made during a frame's
  updates meets things from the next frame, as it moves from the next. `useHitbox` lost its `group`:
  what a thing is is its tag. A body and a sword that count for
  different things are two pieces, each with its own tag.
- One word for what touches what: `useOverlap` is `useCollisionBetween`, `overlaps` is
  `collisionBetween` and `TOverlapTarget` is `TCollisionTarget`, beside the new `useCollisionWith`.
  `useHitbox` is unchanged. The old names are gone.
- `useEvent` and `onEvent` are `useReport` and `onReport`, and `TObjectEventHandler` is
  `TReportHandler`: what a piece reports to whoever placed it, which is all they ever did, beside a
  signal that the whole game hears. They are for pieces made of data, a pack's script or a
  behaviour, which cannot be handed a function; a component of your own code takes a callback in its
  props. A pack's `on` is unchanged. The old names are gone.
- `useSceneUnmount` is `useCleanup`. It always ran when its owner went away, a component as well
  as a scene, and its name only told of the scene, so a pause menu listening on the window would not
  find it. The old name is gone: the type checker points at each call.
- `useScript(ref, props, { id })` takes the settings second, where nearly every call wants them,
  and the attachment's identity, which only a scene read from a file passes, in options at the end:
  `useScript('patrol', { speed: 80 })` rather than `useScript('patrol', undefined, { speed: 80 })`.
- `findObject` and `findObjects` leave out what is destroyed and what is inside it, from the moment
  it is destroyed: a coin collected this frame is not there to be collected again.
- `useSkeletalAnimation` moves a placed model, the one `createModel` gave back, and no longer the
  file: `const fox = createModel({ model: file }); useSkeletalAnimation(fox, { play: 'Walk' })`.
  Every model placed from a file has bones of its own (`fox.skeletons`, next to `fox.model`, the
  file), so five enemies of one file walk, jump and stand still each on their own; before, they all
  wore the file's bones and took whatever pose the last animator wrote. Passing the file is a type
  error that points at the call to change. The bones on the graphics card of a model no longer drawn
  are let go of after a couple of seconds, so enemies born and killed do not fill it.

### Fixed

- The fonts the engine carries and its splash show on a page with a strict Content Security Policy:
  they are read from inside the engine instead of fetched from a `data:` address, which such a page
  refuses.
- A collider is added to its own game's physics world only. A scene with no world of its own, in a
  page where another game had left one open (the editor's Play next to the edited game, or a scene
  abandoned without stopping), put its bodies in that one instead of saying it had none. Two scenes of
  one game running together still share the world made last.
- A key that already names a file, asked for with another (`useLoadTexture({ src: '/b.png', key:
  'hero' })` after `/a.png`), handed back the first without a word, in all fourteen `useLoad…`. It is
  said now, once.
- A maker from `useSpawn` called once its scene has stopped, from a `setTimeout` or a listener
  that outlived it, makes nothing and says so once, rather than building into a scene nobody draws,
  playing its sounds and starting its timers for no one. It gives back something already destroyed,
  so `destroy` and `.api` on it do what they always do. Under something destroyed it makes nothing
  either, in silence: that goes at the end of the frame.
- `useCameraFollow` follows the scene's camera whichever came first in the body. With
  `useCamera2d({ zoom: 2 })` written after it, the follow went on moving a camera of its own that
  nothing drew through, and the scene's stood still, with only a warning about a camera replaced.
- `onReport` (`onEvent` until now) stops when whoever listened goes away, not only when the object
  listened on does. A HUD listening on its scene went on hearing once destroyed, writing on a text
  that was gone, and a new HUD in its place made two. One connected inside a body now lasts as long
  as that body's object, deaf from the moment it is destroyed, and a report passes it by for the next
  one up. The function `onReport` gives back lets go of its own connection only: the same handler
  connected twice lost both.
- A sprite's `frame` and `atlas` show what they say when they are set: `chest.frame = 1` opens the
  chest, and `hero.atlas = attacking` shows the same frame of the other sheet. Until now only
  `setSpriteFrame` changed the picture, and writing the field did nothing, while a polygon's and a
  panel's `frame` did. `setSpriteFrame` stays, and is the same thing written as a call.
- A key let go of with another name than it went down with stays held no more. Shift+1 goes down
  as `'!'`, and with Shift let go first it comes up as `'1'`: `'!'` was held until the window lost
  focus. A key is now let go of by the name it went down with, known by which key it is
  (`KeyboardEvent.code`), and keeps that name through its repeats. A name two keys share, as the two
  Shifts, is held until both are let go.
