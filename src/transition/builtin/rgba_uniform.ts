import { getColor } from '../../color';
import type { TColorOption } from '../../color';

/**
 * Any colour a transition is given, as the `[r, g, b, a]` its shader reads.
 */
export const rgbaUniform = (color: TColorOption): number[] => {
    const { r, g, b, a } = getColor(color);
    return [r, g, b, a];
};
