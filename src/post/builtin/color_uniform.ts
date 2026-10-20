import { getColor, type TColorOption } from '../../color/get_color';

/**
 * A colour as an effect's option takes it: any colour (`TColorOption`), or `[r, g, b]` from `0` to
 * `1`. Internal: each effect writes the union out in its own options.
 */
type TEffectColor = TColorOption | readonly [number, number, number];

/**
 * Any colour an effect is given, as the `[r, g, b]` its shader reads. Alpha is dropped: no effect
 * that takes a colour uses it. A new array every time, so the caller's is never the uniform.
 */
export const colorUniform = (color: TEffectColor | undefined, fallback: readonly [number, number, number]): number[] => {
    if (color === undefined) return [...fallback];
    if (Array.isArray(color)) return [color[0], color[1], color[2]];
    const { r, g, b } = getColor(color as TColorOption);
    return [r, g, b];
};
