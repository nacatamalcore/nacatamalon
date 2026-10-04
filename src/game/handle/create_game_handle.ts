import type { TColor } from '../../color';
import type { TRuntimeStore } from '../../store';
import type { TBox } from '../../box';
import { gamePaused, gameResumed } from '../../signal/engine_signals';
import { screenSizeOf } from '../../DOM/screen_size';
import type { TGameHandle } from './t_game_handle';

/**
 * The game's background as CSS, for the bars round a full-screen game.
 */
const cssColor = ({ r, g, b, a }: TColor): string =>
    `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

/**
 * Every drawing in a tree, the box's own and its children's.
 */
const countDrawables = (box: TBox): number =>
    box.children.reduce((total, child) => total + countDrawables(child), box.drawables.length);

/**
 * What a hold is called when nobody says.
 */
const GAME = 'game';

/**
 * Wraps a running game in the handle a game is allowed to hold.
 *
 * Every method reads or writes the game's own settings rather than keeping a copy, so a handle
 * taken at the start of a scene still answers correctly an hour later, and two handles never
 * disagree.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createGameHandle = (store: TRuntimeStore): TGameHandle => ({
    // The canvas, not the requested size: `width` in the options is what was asked for, and a
    // resize or a scaling mode can make the truth something else. In game pixels, though, not the
    // buffer's: with a `pixelRatio` the buffer is bigger than the game.
    getWidth: () => screenSizeOf(store.get('screen').canvas).width,
    getHeight: () => screenSizeOf(store.get('screen').canvas).height,

    getBackground: () => store.get('config').background,
    setBackground: (color: TColor) => store.setState('config', { background: color }),

    isSmooth: () => store.get('config').smooth,
    setSmooth: (smooth: boolean) => store.setState('config', { smooth }),

    getTimeScale: () => store.get('loop').timeScale,
    setTimeScale: (scale: number) => store.setState('loop', { timeScale: scale }),

    pause: (reason = GAME) => {
        const { pausedBy } = store.get('loop');
        // Asking twice is not two holds: a menu that opens again while it is already open must
        // not need two `resume` calls to undo.
        if (pausedBy.includes(reason)) {
            return;
        }
        store.setState('loop', { pausedBy: [...pausedBy, reason] });
        // The first hold is what pauses the game; a second one changes nothing anyone should hear.
        if (pausedBy.length === 0) {
            gamePaused.emit({ reason });
        }
    },
    resume: (reason = GAME) => {
        const { pausedBy } = store.get('loop');
        if (!pausedBy.includes(reason)) {
            return;
        }
        store.setState('loop', { pausedBy: pausedBy.filter((held) => held !== reason) });
        // Running again only once nothing holds it any more.
        if (pausedBy.length === 1) {
            gameResumed.emit({ reason });
        }
    },
    isPaused: () => store.get('loop').pausedBy.length > 0,

    getBackend: () => store.get('screen').renderer.capabilities.backend,
    getFps: () => store.get('stats').fps,
    getSceneCount: () => store.get('world').scenes.length,
    getDrawableCount: () => store.get('world').scenes.reduce((total, scene) => total + countDrawables(scene), 0),

    enterFullscreen: async () => {
        const fullscreen = store.get('screen').fullscreen;
        return fullscreen === null ? false : fullscreen.enter(cssColor(store.get('config').background));
    },
    exitFullscreen: async () => {
        await store.get('screen').fullscreen?.exit();
    },
    isFullscreen: () => store.get('screen').fullscreen?.isActive() ?? false,
});
