import type { TColor } from './color';
import { getColor, type TColorOption } from './get_color';

/**
 * A colour as a console could show it: each channel moved to the nearest of the steps that machine
 * had, `COLOR_LEVELS.genesis` (8) for a Mega Drive, `COLOR_LEVELS.snes` (32) for a SNES.
 *
 * Why it matters under `dither`: the effect leaves a colour that is on one of its steps flat, and
 * puts its pattern on everything in between, because in between is what a gradient is. A tile tinted
 * `'#e8423f'` sits between steps, so it comes out checkered; `consoleColor('#e8423f',
 * COLOR_LEVELS.genesis)` is `#db4949`, on the steps, and comes out flat, while a sky's gradient still
 * gets the pattern. A screen effect cannot make that choice: it sees pixels, not which ones were
 * meant to be flat.
 *
 * Takes what `getColor` takes, or a colour already made. Alpha is left as it is, and the colour given
 * is never changed.
 *
 * @param color - A colour: a hex number or string, any CSS colour, or a `TColor`.
 * @param levels - Steps per channel, from `COLOR_LEVELS` or any number from `2` up.
 * @returns A new colour on those steps.
 *
 * @example
 * ```ts
 * usePostProcess(dither({ levels: COLOR_LEVELS.genesis }));
 * createSprite({ width: 16, height: 16, tint: consoleColor('#e8423f', COLOR_LEVELS.genesis) });
 * ```
 *
 * @category Color & palettes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const consoleColor = (color: TColorOption, levels: number): TColor => {
    const from = getColor(color);
    const top = Math.max(2, Math.round(levels)) - 1;
    const step = (channel: number): number => Math.round(Math.min(1, Math.max(0, channel)) * top) / top;
    return { r: step(from.r), g: step(from.g), b: step(from.b), a: from.a };
};
