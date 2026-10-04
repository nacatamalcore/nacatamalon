import { newNode } from './new_node';
import type { TUniformType } from '../materials/types/t_uniforms';
import type { TComposerInput, TComposerNode } from './types/t_composer_node';

/**
 * How many numbers a type holds.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const componentCount = (type: TUniformType): number => (type === 'f32' ? 1 : Number(type[3]));

/**
 * Turns an operand into a value, a plain number becoming a constant.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const asNode = (value: TComposerInput): TComposerNode =>
    (typeof value === 'number' ? composerFloat(value) : value);

/**
 * A constant number. The only kind of constant: vectors are made with `composerVec2`,
 * `composerVec3` and `composerVec4`, which wrap their plain numbers in this on their own.
 * @param value - The number.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerFloat = (value: number): TComposerNode => newNode('literal', 'f32', [], { params: [value] });

/**
 * A vector of `size` from parts that add up to `size` (`vec3(r, g, b)`, `vec4(rgb, a)`), or from one
 * number copied into every lane (`vec3(0.5)`).
 *
 * The count is checked here, so a vector with a part too many fails while it is being built instead
 * of as a shader error nobody can place.
 */
const makeVec = (size: 2 | 3 | 4, args: TComposerInput[]): TComposerNode => {
    const type = `vec${size}<f32>` as TUniformType;
    const deps = args.map(asNode);
    const total = deps.reduce((sum, d) => sum + componentCount(d.type), 0);
    const isSplat = deps.length === 1 && deps[0].type === 'f32';
    if (!isSplat && total !== size) {
        throw new Error(
            `[NacatamalOn] shader composer: vec${size} needs ${size} components (or one number to copy into all of them), got ${total}.`,
        );
    }
    return newNode('construct', type, deps);
};

/**
 * A vector of two. Two numbers, one `vec2`, or one number copied into both.
 * @param args - Two numbers or nodes, one `vec2`, or one number for both.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerVec2 = (...args: TComposerInput[]): TComposerNode => makeVec(2, args);

/**
 * A vector of three, the everyday one for colours and directions. Three numbers, a `vec2` and a
 * number, one `vec3`, or one number copied into all three.
 * @param args - Three numbers or nodes, a smaller vector and the rest, or one number for all.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerVec3 = (...args: TComposerInput[]): TComposerNode => makeVec(3, args);

/**
 * A vector of four, usually a colour with its alpha. Four numbers, a `vec3` and a number (colour
 * and alpha), one `vec4`, or one number copied into all four.
 * @param args - Four numbers or nodes, smaller vectors and the rest, or one number for all.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerVec4 = (...args: TComposerInput[]): TComposerNode => makeVec(4, args);

/**
 * Picks components of a vector by their letters (`'bgr'`, `'xy'`). The number of letters, one to
 * four, is the size of the result, and a single letter gives a plain number.
 *
 * The letters come from one set, `xyzw` or `rgba`, never both in one mask, and each must exist in
 * the value it reads: both are checked here rather than left to the card.
 * @param value - The vector to read.
 * @param mask - One to four letters from `xyzw` or `rgba`.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerSwizzle = (value: TComposerNode, mask: string): TComposerNode => {
    if (mask.length < 1 || mask.length > 4) {
        throw new Error(`[NacatamalOn] shader composer: swizzle mask "${mask}" must be 1 to 4 letters.`);
    }
    const set = 'xyzw'.includes(mask[0]) ? 'xyzw' : 'rgba';
    const limit = componentCount(value.type);
    for (const c of mask) {
        const index = set.indexOf(c);
        if (index === -1 || index >= limit) {
            throw new Error(
                `[NacatamalOn] shader composer: swizzle "${mask}" reads "${c}", which a ${value.type} does not have ` +
                '(and a mask cannot mix xyzw with rgba).',
            );
        }
    }
    const type = (mask.length === 1 ? 'f32' : `vec${mask.length}<f32>`) as TUniformType;
    return newNode('swizzle', type, [value], { params: [mask] });
};

/**
 * The first component of a vector, as a number. Short for `composerSwizzle(v, 'x')`.
 * @param value - The vector.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerX = (value: TComposerNode): TComposerNode => composerSwizzle(value, 'x');

/**
 * The second component of a vector, as a number. Short for `composerSwizzle(v, 'y')`.
 * @param value - The vector.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerY = (value: TComposerNode): TComposerNode => composerSwizzle(value, 'y');

/**
 * The third component of a vector, as a number. Short for `composerSwizzle(v, 'z')`.
 * @param value - The vector.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerZ = (value: TComposerNode): TComposerNode => composerSwizzle(value, 'z');

/**
 * The fourth component of a vector, as a number. Short for `composerSwizzle(v, 'w')`.
 * @param value - The vector.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerW = (value: TComposerNode): TComposerNode => composerSwizzle(value, 'w');
