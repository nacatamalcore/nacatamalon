import type { TColor } from '../../color';
import type { TCanvasKeep } from '../../DOM/types/t_canvas_keep';
import type { TCanvasScaling } from '../../DOM/types/t_canvas_scaling';
import type { TRendererType } from '../../render';
import type { TActionMap } from '../../input';
import type { TPostChain } from '../../post';

/**
 * A game's own settings: everything that is true of the **game**, not of one scene.
 *
 * It lives on disk as `project.json` at the root of a project. The fields mirror what `createGame` takes wherever they can, so starting a game from a
 * project is a translation and not a second set of decisions that can drift.
 *
 * This is **the** format of that file: the editor writes it (its `ProjectSettings` is this type),
 * and a game, the editor's play window and an exported build all read it through `parseProject`.
 *
 * **For editors and other tools.** A game written only in code does not need it: it passes its
 * options straight to `createGame`. This exists so a tool can save those options as a file and a
 * game made with that tool can read them back.
 *
 * @category Project
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TProjectSettings = {
    format: 'nacatamalon-project';
    version: 1;
    /**
     * What the game is called.
     */
    name: string;
    /**
     * The game window in pixels: how much it **draws**, not how big it looks. Kept small by default
     * because this is a retro engine: a 320 by 224 picture blown up beats a huge canvas drawing
     * pixel art at its own size.
     */
    width: number;
    height: number;
    /**
     * What the frame is cleared to.
     */
    background: TColor;
    /**
     * Default filtering: `false` is crisp pixel art, `true` blends. A sprite can still choose.
     */
    smooth: boolean;
    /**
     * Anti-aliasing: `1` is off, which is the aliased look of the era.
     */
    msaa: 1 | 4;
    /**
     * Which backend draws: `'AUTO'`, or one named on purpose.
     */
    renderer: TRendererType;
    /**
     * How the canvas is fitted into the page.
     */
    scaling: TCanvasScaling;
    /**
     * What is kept when it is fitted.
     */
    keep: TCanvasKeep;
    /**
     * How many real pixels each game pixel is drawn with: `1` (the default, and the one for pixel
     * art), a number, or `'device'` to follow the screen. Sharper edges for 3D and HD games, at the
     * square of the cost. See `TGameOptions.pixelRatio`.
     */
    pixelRatio: number | 'device';
    /**
     * Whether the game pauses itself when the page loses focus.
     */
    pauseOnBlur: boolean;
    /**
     * The seed of the game's random numbers, or absent for a different run every time.
     */
    seed?: number;
    /**
     * Which scene the game starts on, by name. Empty means nobody has decided yet: better than
     * quietly starting whichever sorts first, which is impossible to debug later.
     */
    mainScene: string;
    /**
     * The **input map**: the named actions and what each one listens to. In the same file as
     * everything else about the game.
     */
    actions: TActionMap;
    /**
     * Whether the player's own controls survive a reload, and where they are kept. `'none'` by
     * default: writing to somebody's browser storage unasked is not something a game should start
     * doing because the engine gained a feature.
     */
    actionsPersist: 'none' | 'localStorage' | 'indexedDb';
    /**
     * The **full-screen effect chain**: the effects applied to the finished frame, in order (a
     * dither, a palette reduction, a CRT). "This game looks like a Mega Drive" is a fact about the
     * project, not about whichever room is open, so it lives here and reaches the game as
     * `TGameOptions.post`.
     */
    post: TPostChain;
};
