import type { TRendererType } from './render';

/**
 * The shape of `GAME_CONFIG`: the names the engine gives its renderers.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TConstGameConfig = {
    RENDER_TYPE: Record<string, TRendererType>;
};

/**
 * The renderers' names, for `createGame`'s `renderer` option: `GAME_CONFIG.RENDER_TYPE.WEBGL2` is
 * the same as writing `'WEBGL2'`.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const GAME_CONFIG = {
    RENDER_TYPE: {
        AUTO: 'AUTO',
        WEBGPU: 'WEBGPU',
        WEBGL2: 'WEBGL2',
    },
} as const satisfies TConstGameConfig;
