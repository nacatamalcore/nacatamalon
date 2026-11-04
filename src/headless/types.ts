import type { TPixels } from '../pixels/types/t_pixels';
import type { TSceneFn } from '../scene';
import type { TGameOptions } from '../game/types/t_game_options';
import type { TGameObject } from '../hooks';
import type { TSprite } from '../gameobjects/sprite/types';
import type { TText } from '../gameobjects/text';
import type { TNineSlice } from '../gameobjects/nine_slice/types';

/**
 * How a game with no browser is made: the game's own options, its scenes, and where its files are.
 * What only a page has (the canvas's scaling, its pixel ratio, pausing when the tab is hidden, the
 * splash, the startup line) is left out.
 *
 * @category Headless
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type THeadlessGameOptions = Omit<
    TGameOptions,
    'renderer' | 'msaa' | 'scaling' | 'keep' | 'pixelRatio' | 'fullscreenScaling' | 'align' | 'pauseOnBlur' | 'banner' | 'splash'
> & {
    /**
     * The scenes, by name, as `createGame` takes them.
     */
    scenes: Readonly<Record<string, TSceneFn>>;
    /**
     * The scene it starts on. Left out, the first one.
     */
    initialScene?: string;
    /**
     * The folder a path the game loads is read from: `/assets/hero.png` is `<assets>/assets/hero.png`.
     * Default `'public'`, from where the process runs, which is where a project made with
     * `npm create nacatamalon` keeps them.
     */
    assets?: string;
};

/**
 * Something the game shows, as it would be on the screen: a sprite, a text or a panel, where it
 * lands in the game's pixels and how much of it is inside the screen.
 *
 * @category Headless
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type THeadlessPicture = {
    /** Its box's name. */
    name: string;
    kind: 'sprite' | 'text' | 'panel';
    /** What it draws, as `createSprite`, `createText` or `createNineSlice` gave it. */
    picture: TSprite | TText | TNineSlice;
    /** What a text says. */
    text?: string;
    /** The middle of what of it is on the screen, in the game's pixels. */
    x: number;
    y: number;
    /** The rectangle around all of it, in whole game pixels, turned as it is drawn. */
    left: number;
    top: number;
    width: number;
    height: number;
    /** How much of it is on the screen, from `0` to `1`. */
    seen: number;
};

/**
 * A game running with no browser and no screen: the same scenes, hooks and updates as in a page,
 * moved a frame at a time by whoever holds it, the same way every time. For checking a game from a
 * test or a script: press keys, run frames, and look at where things are and what is shown.
 *
 * @category Headless
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type THeadlessGame = {
    /** Frames run so far. */
    readonly frame: number;
    /** Seconds of game run so far: `frame` steps of `1 / step` each. */
    readonly time: number;
    /** The scenes running now, by name, in the order they draw. */
    readonly scenes: readonly string[];
    /**
     * Runs `frames` frames (one when left out), each one step of the game. A scene that throws in
     * one of them stops the run and throws here, with the scene's own error.
     */
    run(frames?: number): void;
    /** Holds a key down, by the name `useKeyboard` reads it by (`'ArrowLeft'`, `' '`, `'x'`). */
    press(key: string): void;
    /** Lets a held key go. */
    release(key: string): void;
    /** Presses a key for one frame and lets it go. */
    tap(key: string): void;
    /** The first object of that name in the scenes running, or `undefined`. */
    find(name: string): TGameObject | undefined;
    /** Every object of that name in the scenes running. */
    findAll(name: string): TGameObject[];
    /** Every sprite, text and panel shown now and inside the screen, most of it seen first. */
    drawn(): THeadlessPicture[];
    /**
     * Waits until everything the scenes are loading has arrived (or failed), up to `timeout` seconds
     * (default 5): pictures, fonts and files from the assets folder, and a physics world's engine,
     * which a page lets start between frames and here has to be there before the first one runs.
     * It ends with a picture of how things are, so a text whose font has just arrived is already
     * measured in `drawn()`.
     */
    loaded(timeout?: number): Promise<void>;
    /**
     * A picture of the screen as it is now, drawn without a graphics card: to look at what the game
     * shows from a test or a script, with no browser. Written to a file with `encodePng` from
     * `nacatamalon/authoring`.
     *
     * Drawn as the card draws the 2D of a game: sprites and sheets, texts, panels, maps, shapes,
     * particles, cameras, masks, and views of the world drawn into a picture. Pixel art drawn at
     * whole pixels comes out as on the screen; something turned or read smooth may differ by a
     * pixel at its edges. The engine's effects that make the look of pixel art are drawn too, on
     * the screen and in a filter: `paletteMatch`, `lutGrade`, `dither`, `posterize`, `mosaic`,
     * `colorAdjust`, `outline`, `dropShadow` and `glow`. **What only a card can do is left out**,
     * and said once in a warning: 3D, a material's own shader (the sprite is drawn as if it had
     * none), and every other effect, `crt` among them and any with a shader of its own.
     *
     * Nothing is drawn until it is asked for, so `run` takes the time it did; what the game hands the
     * card (each picture's pixels, each shape's corners) is kept in memory for it. It takes the
     * picture with no time in it, as `loaded()` ends: what has just arrived is laid out first.
     * Capture after `await game.loaded()`, so pictures and fonts are there.
     *
     * @param options `scale` to make every pixel a square that many across (`4` makes a 160 by 90
     * game 640 by 360, big enough to look at); `region` to keep part of the screen, in game pixels.
     */
    capture(options?: THeadlessCaptureOptions): TPixels;
    /** Ends the game: every scene's cleanups run, and `fetch` is the real one again once the last game goes. */
    destroy(): void;
};

/**
 * What `capture` takes.
 *
 * @category Headless
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type THeadlessCaptureOptions = {
    /**
     * Part of the screen, in game pixels from its top-left corner, each edge taken to the whole pixel
     * at or before it. Left out, all of it.
     */
    region?: { x: number; y: number; width: number; height: number };
    /** Every pixel as a square this many across, a whole number. `1` by default. */
    scale?: number;
};
