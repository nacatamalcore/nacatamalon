# Making plugins

A plugin is a package other people's games import: a dialogue box that types, a way to drag
things, a health bar, a simulation on the GPU. It is written the way a game is, with the same
hooks, and used the way any library is: the game imports what the plugin exports and calls it.
Nothing in the engine is configured for it.

```ts
// A game using a plugin.
import { createText } from 'nacatamalon';
import { useTypewriter } from 'nacatamalon-typewriter';

const Sign = () => {
    const line = createText({ text: '' });
    useTypewriter(line, { speed: 30 }).type('Welcome to the village.');
};
```

## Starting one

You need Node.js 20.19 or newer. The people who use your plugin do not.

```bash
npm create nacatamalon@latest health-bar -- --template plugin   # nacatamalon-health-bar, useHealthBar
cd health-bar
npm install
npm run dev                    # the view: a page of your own to try the plugin on
npm run demo                   # the demo: a small game using the plugin, the store's shop window
```

The folder gives the plugin its name. From the template's `.zip` instead (on
[nacatamalon.com/docs/plugins](https://nacatamalon.com/docs/plugins), with a tutorial that makes one
from start to finish), `npm install` and then, once, `npm run rename -- health-bar`. The project's
`PLUGIN_GUIDE.md` walks through it, and its `AGENTS.md` points a coding assistant at the same rules.

```
src/index.ts       what a game imports, and nothing else
src/plugin.ts      the plugin's name and engine range, from package.json; engineFits()
src/use_*.ts       one hook per file
view/              the page you try the plugin on while you make it; never packed
demo/              a small game using the plugin by its name; the store plays it
tests/             the plugin in a game run with no browser
store/             icon and screenshots for the store page
```

## A hook

```ts
import { useSelf, useUpdate, useCleanup } from 'nacatamalon';
import { placementOf, requireEngine } from 'nacatamalon/extend';

// The template keeps this in src/plugin.ts, read from package.json.
const engineFits = (): boolean => requireEngine('nacatamalon-spin', '>=0.7.0 <1');

export const useSpin = ({ speed = 0.25 } = {}): void => {
    if (!engineFits()) return;
    const self = useSelf();
    useUpdate((delta) => {
        const placement = placementOf(self);
        if (placement) placement.rotation += speed * Math.PI * 2 * delta;
    });
    useCleanup(() => {});
};
```

A game calls it inside a component, `const Coin = () => { useSpin(); createSprite(...) }`, and it
works on that object for as long as the object lives. Nobody registers it: when it runs, the engine
has that game and that object in hand, and `useSelf` and `useUpdate` belong to them.

**The lifecycle is the hooks.** There is no separate init, update or destroy to learn:

| When | In a plugin |
|---|---|
| The object is made | the body of the hook; `useReady` once the scene is whole |
| Every frame | `useUpdate`, `useLateUpdate` |
| The object goes | `useCleanup` |
| Pause, a hidden tab, leaving the page | `useGame().onPaused`, `onResumed`, `onHidden`, `onShown`, `onLeaving` |
| A scene changes | `useScene`, `useSceneTransitionEnd` |

For something that belongs to the whole game, a plugin exports an `install…()` function the game
calls once at the start of `main.ts`, as `installPhysics2d()` does. What it installs can be a game
system (`registerGameSystem`), below.

## Code for the whole game

A save that runs whatever scene is on, analytics, a debugging aid, music that does not stop between
levels: what belongs to the game and not to a scene. `registerGameSystem(name, fn)` runs `fn` once in
each game that starts, before its first scene, in a box of its own that no change of scene touches,
and tears it down when the game ends. It is on the front door, `nacatamalon`, because a game uses it
for its own code too; a plugin exports an install function that calls it:

```ts
import { registerGameSystem, useGame, useUpdate, useCleanup } from 'nacatamalon';

// Made once, at the top of the module: the same function however many times the install is called.
const playTime = () => {
    let seconds = 0;
    useUpdate((delta) => { seconds += delta; });           // every frame, whatever scene is on
    useGame().onLeaving(() => localStorage.setItem('play-time', String(seconds)));
    useCleanup(() => { /* the game ends */ });
};

export const installPlayTime = () => registerGameSystem('nacatamalon-play-time', playTime);
```

The game calls `installPlayTime()` at the start of `main.ts`, before `createGame`; one registered
while a game runs waits for the next game, and says so. Inside, the hooks are the usual ones:

- Its `useUpdate` run before every scene's in a frame, and its `useLateUpdate` after every scene's,
  so it gets things ready for the scenes and reads where they left them.
- A paused game pauses it too (`useGame().onPaused` tells it); a paused scene does not.
- It belongs to no scene: `useScene`, the cameras, the lights, physics, `useRenderStyle` and
  `useFog` throw inside it. What it creates is drawn nowhere; to show something, it launches a scene
  of its own.
- One that throws is reported and left out, and the game goes on.
- The same name with the same function does nothing, which is why the body is made once, outside
  the install: an install called twice then does nothing. With another function it throws. It hands
  back a function that takes it out for the games that start after.
- While a tool lays the game out rather than playing it (the editor's edit mode), its systems are
  taken down, listeners and all, and started again when it is played.

It runs whatever scene the game starts on. A scene that launches the others (a `Main` that never
stops, with the levels beside it) would do the same while the game starts on it, and be missing
when it does not: a level played straight from the editor, a game made with `initialScene`, a test
that starts on the third level. A scene launched beside the levels is still the way to keep
something on screen, a score or a frame, since a system draws nothing.

## What `nacatamalon/extend` gives a plugin

A game never imports it; a plugin does.

- `requireEngine(plugin, range)`: whether the running engine is one the plugin was made for. When it
  is not, it says so once, in the plugin's name. The template's `engineFits()` calls it with the
  `peerDependencies` range of `package.json`, so the two never disagree.
- `getActiveGame()`, `getActiveGameObject()`: which game, and which of its objects, is being built
  right now, for what a plugin keeps per game.
- `placementOf`, `worldPlacementOf`, `localPositionFrom`, and the same in 3D: where an object
  really is, whether it was placed itself or through what it draws.
- `registerPhysicsProvider`: another physics engine.

`nacatamalon/extend/gpu` has `useGpuPass`, for work of the plugin's own on the GPU: a simulation in
compute, a picture worked out on the GPU. See [the GPU pass guide](gpu_pass.md). It also has a kind
of drawing of the plugin's own, below.

Everything else a plugin uses is the game's own API: `measureText`, `useKeyboard`, `createSprite`,
the stores.

## The rules

- **Only the engine's public doors**: `nacatamalon` and its subpaths in `package.json` `exports`.
  Never a path inside the engine. The template's `npm run check` says where.
- **The engine stays out of the build.** `nacatamalon` is a `peerDependency`: the game brings its
  own, and two copies would be two engines that do not see each other.
- **Everything else goes in.** A game that copies the plugin by hand has no npm to install its
  dependencies, so the build bundles them.
- **Nothing in a module-level variable** that belongs to a game: a page can hold several games.
- **Messages start with the plugin's name**, and one that could repeat every frame is said once.
- **A game that does not import the plugin pays nothing for it** (`sideEffects: false`).

## Testing it

The template's tests run the plugin in a game with no browser, from `nacatamalon/headless`: the same
every time, a frame at a time.

```ts
import { createScene, createText } from 'nacatamalon';
import { createHeadlessGame } from 'nacatamalon/headless';
import { useTypewriter } from 'nacatamalon-typewriter';

const Level = () => {
    const line = createText({ text: '' });
    useTypewriter(line).type('Hello.');
    return createScene();
};

const game = createHeadlessGame({ width: 320, height: 180, scenes: { Level } });
await game.loaded();   // runs no frame: the first game.run(1) is the first frame
game.run(30);
```

What an object is now is best read from the object itself (`text.text`, `sprite.transform`).

## Sharing it

`npm run pack` builds, checks, and leaves two files in `release/`:

- **`<name>-<version>.zip`**: send it by hand, put it on a release page, give it to the store.
- **`<name>-<version>.tgz`**: the same for npm, which is optional.

A game uses it either way. Unzipped into the game's `plugins/` folder, with
`"nacatamalon-health-bar": "file:./plugins/nacatamalon-health-bar"` in the game's `dependencies`, it
is imported by its name:

```ts
import { useHealthBar } from 'nacatamalon-health-bar';
```

or by its path, `'../plugins/nacatamalon-health-bar/dist/index.js'`, with nothing in
`dependencies`. From npm, `npm install nacatamalon-health-bar`.

## The store

The store on nacatamalon.com lists free and paid plugins. Its page for a plugin comes from the plugin
itself: the icon and screenshots in `store/`, listed in `package.json` under `nacatamalon`, and the
demo, which it plays. While `npm run demo` runs, **F9** saves the demo as a screenshot into `store/`.

`npm run check` runs the store's own checks. Then the nacatamalon team reviews each plugin, and each
new version, before it is listed. Send the plain code with it: obfuscating is possible
(`OBFUSCATE` in `scripts/build.mjs`) but slows down code that runs every frame and does not really
protect it, since the code reaches every player's browser.

## A kind of drawing of its own

A plugin that draws something no sprite, model or material can (shapes worked out in the shader
rather than made of triangles, a field of grass in one call) teaches the engine a **kind of
drawing**, from `nacatamalon/extend/gpu`. The engine treats each of its drawings like a model: it
follows its object, is ordered with the scene's models, hides and goes with it, is drawn by every
camera of its scene and can cast into the shadow maps. The plugin's pipeline draws it, inside the
engine's own passes, with the same depth, masks and lights.

```ts
import { createDrawable, registerDrawableKind } from 'nacatamalon/extend/gpu';
import type { TCustomDrawable, TDrawableKind, TWebGpuDrawableContext, TWebGpuDrawables } from 'nacatamalon/extend/gpu';

type TBlob = TCustomDrawable & { radius: number };
type TBlobPayload = { radius: number };
// The plugin's own pipeline: its shader, built on `context.depthStencil` and `context.lights.wgsl`.
declare const createBlobPipeline: (context: TWebGpuDrawableContext) => TWebGpuDrawables<TBlobPayload>;

const BLOBS: TDrawableKind<TBlobPayload> = {
    name: 'nacatamalon-blobs',
    // Once a frame for each blob, once the engine has placed it.
    prepare: (drawable) => ({ radius: (drawable as TBlob).radius }),
    webgpu: createBlobPipeline,
};

export const useBlob = (radius: number): TBlob => {
    registerDrawableKind(BLOBS);
    return createDrawable(BLOBS.name, {}, { radius });
};
```

What draws it is told about each pass before anything in it is recorded (`beginPass`, with every
one of its drawings and each scene's camera, lights and shadow map), then asked to draw each drawing
where it falls (`draw`, with where it is in that pass, `world`: read it there rather than keeping
what `prepare` was given, since a picture of the world can put a drawing somewhere else), and, to cast, told about the frame's shadow maps (`beginShadows`,
`drawShadow`). Its room in any buffer is made in `beginPass`, never while drawing. The types say the
rest: `TWebGpuDrawables`, `TWebGpuDrawableContext`. TypeScript 6 knows WebGPU's types but not its
constants (`GPUBufferUsage`, `GPUShaderStage`, `GPUTextureUsage`): a plugin that makes a pipeline adds
`@webgpu/types` to its `devDependencies` and to `types` in its `tsconfig.json`.

A kind lives in depth (the default) or flat, `space: '2d'`: then its drawings are placed and ordered
like sprites (`x`, `y`, `rotation`, `scaleX`, `scaleY`, with their parallax), and each pass hands it
its 2D views (`cameras`: the screen, then each 2D camera), each with the matrix from the world's
pixels to the screen and its 2D lights, which `context.lights2d` lights a colour with
(`illuminate2d`), as a sprite is lit.

To look like the models round it, a kind in depth draws as a model is drawn, with the engine's own
shader functions (`context.shading`, added to its shader): `ambientFacing` for the scene's ambient,
from the ground's colour below to the sky's above when it has two; `roundReflectionUv` and
`cubeReflectionUv` for where a reflection lands on a picture of the surroundings (a
`studioEnvironment`, a `useEnvironment`'s `texture`, a matcap), which the game hands to the plugin's
hook in its options (a drawing can be the `around` of its own `useEnvironment`, and is left out of
it, as a model is); and `snapToGrid` and `affineUvOf` for the style's shivering corners and swimming
pictures. Each view says what its scene's style asks (`style`: `perPixel`, `affine`, and the grid
`snap`), so with `RENDER.STYLES.ps1` a drawing shivers on the same grid as the models beside it.

A kind gives what draws it on each backend: `webgpu` and `webgl2`, the same moments on both
(`TWebGl2Drawables`, with no encoder since WebGL2 draws at once; each call runs inside the engine's
pass with the GL state put back after it, and sets every state it draws with itself). A backend it
gives nothing for leaves its drawings out, and the engine says so once; so does a game with no
browser.

The engine leaves out of each camera and each shadow map the drawings that cannot be seen in it,
when the kind says how much room each takes (`bounds`, a box in the drawing's own space, holding
whatever its shader moves too). It leaves out whole drawings: one spread over a large area, a field
or a forest, is best made as several.

## What a plugin cannot do yet

Register a file type, or put its own component in a scene document for the editor. Each one is
planned as its own part of `nacatamalon/extend`.
