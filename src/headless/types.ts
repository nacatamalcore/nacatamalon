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
    'renderer' | 'msaa' | 'scaling' | 'keep' | 'pixelRatio' | 'fullscreenScaling' | 'pauseOnBlur' | 'banner' | 'splash'
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
     * Waits until everything the scenes are loading has arrived (or failed), up to `timeoutMs`
     * (default 5000): pictures, fonts and files from the assets folder, and a physics world's engine,
     * which a page lets start between frames and here has to be there before the first one runs.
     * It ends with a picture of how things are, so a text whose font has just arrived is already
     * measured in `drawn()`.
     */
    loaded(timeoutMs?: number): Promise<void>;
    /** Ends the game: every scene's cleanups run, and `fetch` is the real one again once the last game goes. */
    destroy(): void;
};
