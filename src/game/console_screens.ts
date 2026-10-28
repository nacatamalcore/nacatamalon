import type { TGameOptions } from './types/t_game_options';

/**
 * Which consoles `RENDER.CONSOLE_SCREENS` has the screen of.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TConsoleScreenName = 'nes' | 'snes' | 'genesis' | 'gameBoy' | 'gba' | 'ps1' | 'n64';

/**
 * A console's screen as `createGame` takes it: how many pixels it drew, their shape and how many
 * pictures a second. Spread into the options, and whatever comes after wins:
 * `createGame('#app', { ...RENDER.CONSOLE_SCREENS.snes, scaling: 'integer' })`.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TConsoleScreen = Required<Pick<TGameOptions, 'width' | 'height' | 'pixelAspect' | 'step'>>;

/**
 * Each console's screen. Only the screen: its controls are `INPUT.ACTION_PRESETS`, its colours
 * `COLOR_LEVELS`, and the look of a television `crt()` or `ntsc()`, each to be taken or left.
 *
 * The NES drew 240 rows and a television hid about eight at the top and eight at the bottom, so its
 * screen here is the 224 a player saw, as the SNES's. Their pixels were 8:7, a little wider than
 * tall, and the Genesis's at 320 across 32:35; the handhelds, the PlayStation and the Nintendo 64
 * drew square ones. Sixty pictures a second, as the American and Japanese machines did.
 */
export const CONSOLE_SCREENS: Readonly<Record<TConsoleScreenName, TConsoleScreen>> = {
    nes: { width: 256, height: 224, pixelAspect: 8 / 7, step: 60 },
    snes: { width: 256, height: 224, pixelAspect: 8 / 7, step: 60 },
    genesis: { width: 320, height: 224, pixelAspect: 32 / 35, step: 60 },
    gameBoy: { width: 160, height: 144, pixelAspect: 1, step: 60 },
    gba: { width: 240, height: 160, pixelAspect: 1, step: 60 },
    ps1: { width: 320, height: 240, pixelAspect: 1, step: 60 },
    n64: { width: 320, height: 240, pixelAspect: 1, step: 60 },
};
