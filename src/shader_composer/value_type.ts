import type { TUniformType } from '../materials/types/t_uniforms';

/**
 * The type of a parameter's value, read off its shape: a number is an `f32`, a list of two, three
 * or four numbers the vector of that length.
 *
 * Anything else throws, because it is a mistake in the graph and the moment it is built is the
 * best time to hear about it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const valueType = (value: number | number[]): TUniformType => {
    if (typeof value === 'number') {
        return 'f32';
    }
    if (Array.isArray(value) && value.length >= 2 && value.length <= 4 && value.every((v) => typeof v === 'number')) {
        return `vec${value.length}<f32>` as TUniformType;
    }
    throw new Error('[NacatamalOn] shader composer: a value has to be a number, or a list of two, three or four numbers.');
};
