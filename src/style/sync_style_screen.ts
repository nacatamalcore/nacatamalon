import type { TBox } from '../box';
import type { TPixelSnap } from '../game/types/t_game_options';
import type { TRuntimeStore } from '../store';
import type { TRenderStyle } from './t_render_style';

/**
 * What of the screen a style can set: the game's own settings of the same names. `pixelSnap` is not
 * the style's to say: it follows `smooth`, as it does in `createGame`, when the game left it to.
 * `smoothScaling` left `null` follows `smooth` by itself, wherever it comes from.
 */
type TScreen = { width: number; height: number; smooth: boolean; smoothScaling: boolean | null; pixelAspect: number; pixelSnap: TPixelSnap };
type TScreenKey = keyof TScreen;

const KEYS: readonly TScreenKey[] = ['width', 'height', 'smooth', 'smoothScaling', 'pixelAspect', 'pixelSnap'];

/**
 * Per game: the scene style whose screen is in force, what the game had before it for each setting
 * the style changed, and what the style set it to, to tell later whether someone changed it since.
 */
const installed = new WeakMap<TRuntimeStore, { style: TRenderStyle | null; own: Partial<TScreen>; set: Partial<TScreen> }>();

/**
 * Styles already told that half a resolution is none.
 */
const halfSaid = new WeakSet<TRenderStyle>();

/**
 * The pixel snap `createGame` works out from `smooth` when the game does not say one.
 */
const snapFor = (smooth: boolean): TPixelSnap => (smooth ? 'off' : 'screen');

/**
 * What a style asks of the screen, setting by setting, given the game's settings now.
 *
 * Width and height are one decision: a style with only one of them asks for no resolution, and says
 * so once. The pixel snap follows the style's `smooth` only while the game's follows its own.
 */
const wantedOf = (style: TRenderStyle | null, config: TScreen): Partial<TScreen> => {
    if (style === null) {
        return {};
    }
    const wanted: Partial<TScreen> = {};
    if (style.width !== undefined && style.height !== undefined) {
        wanted.width = style.width;
        wanted.height = style.height;
    } else if ((style.width !== undefined || style.height !== undefined) && !halfSaid.has(style)) {
        halfSaid.add(style);
        console.warn(`[NacatamalOn] useRenderStyle: a style gives ${style.width !== undefined ? 'a width' : 'a height'} with no ${style.width !== undefined ? 'height' : 'width'}, so it keeps the game's resolution. Give both.`);
    }
    if (style.smooth !== undefined) {
        wanted.smooth = style.smooth;
        if (config.pixelSnap === snapFor(config.smooth)) {
            wanted.pixelSnap = snapFor(style.smooth);
        }
    }
    if (style.smoothScaling !== undefined) {
        wanted.smoothScaling = style.smoothScaling;
    }
    if (style.pixelAspect !== undefined) {
        wanted.pixelAspect = style.pixelAspect;
    }
    return wanted;
};

/**
 * The style of the scene the game is seen in: the topmost scene running, not held behind a
 * transition, that has one of its own. `null` when none has, which is the game's own.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const topSceneStyle = (scenes: readonly TBox[]): TRenderStyle | null => {
    let style: TRenderStyle | null = null;
    for (const scene of scenes) {
        if (!scene.held && scene.renderStyle !== null) {
            style = scene.renderStyle;
        }
    }
    return style;
};

/**
 * Lays the resolution and the smoothing of a scene's style over the game's own, once, when the style
 * changes, and puts the game's back when it goes: a level in `ps1` is drawn at 320 x 240 and pixelated,
 * and the menu after it at the game's 640 x 480 again.
 *
 * Written into the game's settings, as `setResolution` and `setSmooth` write them, so everything that
 * reads them (the canvas, the renderer, `isSmooth`, a world that ends where the screen does) follows.
 * A setting the game changed while the style was on is the game's word, and stays when it goes.
 *
 * The game's own style is not laid here: what it says is in the game's settings from the start, under
 * whatever `createGame` said itself. Only a scene's (`useRenderStyle`) comes and goes.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const syncStyleScreen = (store: TRuntimeStore, style: TRenderStyle | null): void => {
    const current = installed.get(store) ?? { style: null, own: {}, set: {} };
    if (current.style === style) {
        return;
    }
    const config = store.get('config') as unknown as TScreen;
    const wanted = wantedOf(style, config);
    const patch: Partial<TScreen> = {};
    const own: Partial<TScreen> = {};
    const set: Partial<TScreen> = {};
    const write = (into: Partial<TScreen>, key: TScreenKey, value: unknown): void => {
        (into as Record<TScreenKey, unknown>)[key] = value;
    };

    for (const key of KEYS) {
        const had = key in current.own;
        // Changed since the style before set it: the game's word now, not the style's.
        const changed = had && config[key] !== current.set[key];
        if (wanted[key] !== undefined) {
            write(own, key, had && !changed ? current.own[key] : config[key]);
            write(set, key, wanted[key]);
            if (config[key] !== wanted[key]) write(patch, key, wanted[key]);
        } else if (had && !changed && config[key] !== current.own[key]) {
            write(patch, key, current.own[key]);
        }
    }

    installed.set(store, { style, own, set });
    if (Object.keys(patch).length > 0) {
        store.setState('config', patch);
    }
};

/**
 * Lays a scene's style's screen at once, when a scene asks for its style (`useRenderStyle`, or `set`
 * on it), rather than at the next frame: the scene is built, and its HUD placed, at the size it will
 * be drawn at. The frame lays it again anyway, so this only brings the moment forward.
 *
 * Only for the screen's scenes: a picture is drawn at its own size. And not while a scene is being
 * built behind a transition's cover: the scene going out is still on screen, and it keeps its size
 * until the swap, where the frame lays the new one.
 *
 * @param store The game.
 * @param scene The scene root whose style was asked for, perhaps still being built.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const styleScreenNow = (store: TRuntimeStore, scene: TBox): void => {
    if (scene.parent !== null || scene.spriteTexture !== null || scene.held) {
        return;
    }
    const transition = store.get('transition').active;
    if (transition !== null && transition.incoming === null) {
        return;
    }
    const scenes = store.get('world').scenes;
    // Being built, it is not listed yet; it goes on top when it is.
    syncStyleScreen(store, topSceneStyle(scenes.includes(scene) ? scenes : [...scenes, scene]));
};
