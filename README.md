# nacatamalon

**Make games that look like 1997.**

A 2D and 3D game engine for the web, written in TypeScript, on WebGPU with a
WebGL2 fallback.

---

## A letter, before the code

There was a time when a game fit in your hands. A cartridge, a disc, a handful
of colours, a screen that drew a few hundred thousand pixels and made you
believe in whole worlds. The people who made those games did not have more. They
had less, and they knew exactly what to do with it.

nacatamalon is written for that kind of game, and for the people who still want
to make one.

It aims at the consoles from the SNES to the GameCube, and that is a choice, not
a lack. A short palette, dithering, pixels that land exactly where you put them,
light worked out per vertex, a blob of shadow under a character: these are not
things the engine settles for. They are the things it is best at, kept cheap and
close at hand, because nobody else on the web ships them and because they are
beautiful.

**The limitation is the style.** An engine that can do everything asks you to
decide everything. This one has an edge, the era it loves, and inside that edge
it tries to make every step short. It will not grow physically based rendering,
screen-space reflections or global illumination. If a game from the Dreamcast
years would not have needed something to ship, it is not here. If it would have,
a score counter, a gamepad, a tilemap, a phone to run on, it is, because a game
that looks like a SNES still needs all of that.

**Games that get finished, not projects that get abandoned.** That is the whole
point. A scene is a function. What it needs, it asks for with hooks. What it
makes is plain data you can change. You should be able to read a game written
with it from top to bottom, and to understand the engine underneath it too: it
is small enough on purpose for one person to hold in their head.

**It belongs on the web.** No install for the player, no store between you and
them. A game is a page, and publishing one is copying a folder.

If you grew up blowing into cartridges, or you never did and you simply like how
those games look, welcome. Make something small, and finish it.

Francisco José Pereira Alvarado

---

## Install

Start a new game from the template (Vite, one scene, TypeScript or JavaScript):

```bash
npm create nacatamalon@latest
```

Or add it to a project you already have:

```bash
npm install nacatamalon
```

It is an ES module with types included, meant to be used with a bundler such as
Vite. It runs on WebGPU (Chrome and Edge 113+, Safari 26) and falls back to
WebGL2 everywhere else.

> nacatamalon is young (0.x). The API is settling and can still change between
> versions.

## A game

```ts
import {
    createGame,
    createScene,
    createSprite,
    getColor,
    useKeyboard,
    useUpdate,
} from "nacatamalon";

// GameScene component
const Game = () => {
    const keys = useKeyboard();
    const paddle = createSprite({
        transform: { x: 240, y: 296 },
        width: 64,
        height: 10,
        tint: getColor("#ff6b1a"),
    });

    useUpdate((dt) => {
        if (keys.isDown("ArrowLeft")) {
            paddle.transform.x -= 340 * dt;
        }
        if (keys.isDown("ArrowRight")) {
            paddle.transform.x += 340 * dt;
        }
    });

    return createScene();
};

// Main file
const game = createGame("#app", {
    width: 480,
    height: 320,
    background: getColor("#12102b"),
});

// Set scenes
game({ Game });
```

With an element to draw into on the page:

```html
<div id="app"></div>
```

- `createGame(target, options)` makes the window; calling what it returns with
  your scenes starts it.
- A **scene** is a function that runs once, when it starts. Inside it, `create*`
  puts things in it (`createSprite`, `createText`, `createMesh`...) and `use*`
  asks for what it needs: a key, a texture, code that runs every frame.
- `useUpdate(fn)` runs `fn` every frame with the seconds since the last one, and
  the seconds the scene has been running.
- `splash: true` in the options opens the published game with a short "Made
  with NacatamalOn" (under two seconds, a key or a click skips it) while the
  first scene loads behind it. It is off unless you ask for it, and skipped while
  you develop on `localhost`.

## Coding with an AI assistant

The package carries two files written for coding assistants, so they work offline and always
match the version you installed:

- `node_modules/nacatamalon/llms.txt`: the short guide. How a game is written (a scene runs once,
  hooks only inside it, `create*` returns data, `useUpdate` runs every frame), the conventions and
  the usual mistakes.
- `node_modules/nacatamalon/llms-full.txt`: every export with its signature and documentation, in
  one file to search.

An assistant can start a project in one go, without questions; the project it makes carries an
`AGENTS.md` that points at both files:

```bash
npm create nacatamalon@latest my-game -- --template vite-ts --install
```

Assistants usually find them through the note at the top of the package's types. To be sure, add a
line to your project's instructions file (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`):

```text
This project uses the nacatamalon game engine: read node_modules/nacatamalon/llms.txt before writing game code.
```

## How the API reads

- What `create*` gives back is **data**: change its fields
  (`sprite.transform.x += 1`, `sprite.tint = red`) and the next frame shows it.
- What acts on it is a **function that takes it first**: `destroy(sprite)`,
  `setTile(map, …)`, `playParticles(emitter)`.
- What a hook gives back is a **handle with methods**:
  `keys.isDown('ArrowLeft')`, `useScene().change('Level')`.

## What it has

- **The era, first-class:** palette matching, ordered dithering, colour grading
  tables and a CRT pass as post-processing; crisp pixel art (nearest sampling
  and whole-number scaling); vertex lighting, Nintendo 64 fog, PlayStation-style
  vertex snapping and affine textures, and blob shadows.
- **2D:** sprites and atlases, sprite animation, tilemaps with solid-tile
  queries, bitmap text, nine-slice, particles.
- **3D:** meshes, glTF models with skeletal animation, up to eight lights,
  shadow maps, 3D particles, and 2D and 3D in the same frame.
- **Everything around it:** scenes with transitions and pause, keyboard,
  pointer, gamepad and named actions, audio placed in the world, stores and
  signals, tweens and timers, seeded random, and the everyday maths (`clamp`,
  `lerp`, vectors).

Text is drawn with bitmap fonts. `createText({ text: 'SCORE 0' })` works as is,
with the font the engine carries (Nacatamal Arcade, an 8 px arcade font with
lowercase, accents and ñ); load one of your own with `useLoadBitmapFont` and hand it
to `createText` as `font`.

## Physics

Both physics adapters ship inside `nacatamalon`, and so do the engines they
drive: Rapier2D for `nacatamalon/physics2d` and box3d for `nacatamalon/physics3d`.
Each sits behind its own import, so a game that does not simulate never bundles
one. Call the install function of the adapter you use once:

- `nacatamalon/physics2d`: Rapier2D's types use `Symbol.dispose`, so with
  `skipLibCheck` off, add `"ESNext.Disposable"` to `lib`.

```ts
import { installPhysics2d } from "nacatamalon/physics2d";

installPhysics2d();
```

## Community

- Website: [nacatamalon.com](https://nacatamalon.com)
- Discord: [discord.gg/jtyY3RkYTc](https://discord.gg/jtyY3RkYTc)
- X (Twitter): [@nacatamalcore](https://x.com/nacatamalcore)

## License

MIT © 2026 Francisco José Pereira Alvarado. See [LICENSE](./LICENSE).

The built-in font, Nacatamal Arcade, is derived from Press Start 2P and is
licensed under the SIL Open Font License 1.1: see [licenses/OFL.txt](./licenses/OFL.txt).
