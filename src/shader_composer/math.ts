import { newNode } from './new_node';
import { asNode, composerVec2, composerVec3, composerVec4 } from './constructors';
import type { TUniformType } from '../materials/types/t_uniforms';
import type { TComposerInput, TComposerNode, TComposerStep } from './types/t_composer_node';

// Arithmetic and the built-in functions, with the result types the shader languages give them.
// Every operation checks its operands and fails while the graph is being built, because a mistake
// there is the author's and the card's message about it would name nothing they wrote.

const isVec = (type: TUniformType): boolean => type !== 'f32';

/**
 * The result of an operation done lane by lane: equal types stay, a number spreads over the vector
 * on the other side, and two vectors of different sizes are an error.
 */
const combine = (op: string, a: TUniformType, b: TUniformType): TUniformType => {
    if (a === b) {
        return a;
    }
    if (a === 'f32') {
        return b;
    }
    if (b === 'f32') {
        return a;
    }
    throw new Error(`[NacatamalOn] shader composer: cannot "${op}" a ${a} with a ${b}.`);
};

/**
 * Spreads a number over a vector of `target`, for the functions that want all their arguments the
 * same size (`pow`, `min`, `mix`...). A value already of that type passes; another vector is an
 * error.
 */
const splat = (n: TComposerNode, target: TUniformType): TComposerNode => {
    if (n.type === target) {
        return n;
    }
    if (n.type === 'f32') {
        if (target === 'vec2<f32>') {
            return composerVec2(n);
        }
        if (target === 'vec3<f32>') {
            return composerVec3(n);
        }
        if (target === 'vec4<f32>') {
            return composerVec4(n);
        }
    }
    throw new Error(`[NacatamalOn] shader composer: expected a ${target} (or a number), got a ${n.type}.`);
};

/**
 * A call to one of the language's own functions.
 */
const call = (fn: string, type: TUniformType, args: TComposerNode[]): TComposerNode =>
    newNode('call', type, args, { params: [fn] });

/**
 * The two ways to call a two-operand node: both operands give a value, one gives a step for
 * `composerPipe`, with the value coming down the pipe as the first operand.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TComposerBinaryOp = {
    (a: TComposerInput, b: TComposerInput): TComposerNode;
    (b: TComposerInput): TComposerStep;
};

/**
 * Lets a two-operand function also be a step of `composerPipe`. With both operands it builds the
 * value; with one it returns a step that puts the value flowing through on the **left**, so
 * `composerPipe(x, composerMul(2), composerAdd(1))` reads as `x * 2 + 1`.
 *
 * Only the functions where the value naturally goes on the left get this (arithmetic, `pow`,
 * `min`, `max`, `mod`). Where that reading would surprise (`step`, `clamp`, `mix`, `dot`...) they
 * stay strict.
 */
const binary = (build: (a: TComposerInput, b: TComposerInput) => TComposerNode): TComposerBinaryOp =>
    ((a: TComposerInput, b?: TComposerInput): TComposerNode | TComposerStep =>
        (b === undefined ? (value: TComposerNode) => build(value, a) : build(a, b))) as TComposerBinaryOp;

const makeBinop = (op: string) => (a: TComposerInput, b: TComposerInput): TComposerNode => {
    const na = asNode(a);
    const nb = asNode(b);
    return newNode('binop', combine(op, na.type, nb.type), [na, nb], { params: [op] });
};

/**
 * A one-operand function whose result is the same type as its operand.
 */
const unary = (fn: string) => (a: TComposerInput): TComposerNode => {
    const n = asNode(a);
    return call(fn, n.type, [n]);
};

/**
 * Adds lane by lane, a number spreading over a vector (`composerAdd(color, 0.1)` lightens every
 * channel). Two vectors of different sizes are an error.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerAdd = binary(makeBinop('+'));

/**
 * Subtracts lane by lane, a number spreading over a vector.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerSub = binary(makeBinop('-'));

/**
 * Multiplies lane by lane, a number spreading over a vector (`composerMul(color, 2)` doubles the
 * brightness; two vectors multiply lane by lane).
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerMul = binary(makeBinop('*'));

/**
 * Divides lane by lane, a number spreading over a vector.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerDiv = binary(makeBinop('/'));

/**
 * The value without its sign, lane by lane.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerAbs = unary('abs');

/**
 * The largest whole number not above each lane.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerFloor = unary('floor');

/**
 * What is left after the whole part (`x - floor(x)`), lane by lane: the basis of anything that
 * repeats or tiles.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerFract = unary('fract');

/**
 * Sine of each lane, in radians.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerSin = unary('sin');

/**
 * Cosine of each lane, in radians.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerCos = unary('cos');

/**
 * Square root of each lane.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerSqrt = unary('sqrt');

/**
 * The sign of each lane: -1, 0 or +1.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerSign = unary('sign');

/**
 * The same direction, one unit long. Vectors only.
 * @param a - The vector.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerNormalize = (a: TComposerNode): TComposerNode => {
    if (!isVec(a.type)) {
        throw new Error('[NacatamalOn] shader composer: normalize expects a vector.');
    }
    return call('normalize', a.type, [a]);
};

/**
 * How long a vector is (`f32`).
 * @param a - The vector.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerLength = (a: TComposerNode): TComposerNode => {
    if (!isVec(a.type)) {
        throw new Error('[NacatamalOn] shader composer: length expects a vector.');
    }
    return call('length', 'f32', [a]);
};

/**
 * How far apart two points of the same size are (`f32`).
 * @param a - One point.
 * @param b - The other.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerDistance = (a: TComposerNode, b: TComposerNode): TComposerNode => {
    if (a.type !== b.type || !isVec(a.type)) {
        throw new Error('[NacatamalOn] shader composer: distance expects two vectors of the same size.');
    }
    return call('distance', 'f32', [a, b]);
};

/**
 * The dot product of two vectors of the same size (`f32`): how much they point the same way, and
 * the heart of any lighting sum.
 * @param a - One vector.
 * @param b - The other, the same size.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerDot = (a: TComposerNode, b: TComposerNode): TComposerNode => {
    if (a.type !== b.type || !isVec(a.type)) {
        throw new Error('[NacatamalOn] shader composer: dot expects two vectors of the same size.');
    }
    return call('dot', 'f32', [a, b]);
};

/**
 * A vector at right angles to two `vec3`s.
 * @param a - One `vec3`.
 * @param b - The other.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerCross = (a: TComposerNode, b: TComposerNode): TComposerNode => {
    if (a.type !== 'vec3<f32>' || b.type !== 'vec3<f32>') {
        throw new Error('[NacatamalOn] shader composer: cross expects two vec3s.');
    }
    return call('cross', 'vec3<f32>', [a, b]);
};

/**
 * `base` to the power of `exp`, lane by lane. A number as `exp` spreads over `base`.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerPow = binary((base, exp) => {
    const b = asNode(base);
    return call('pow', b.type, [b, splat(asNode(exp), b.type)]);
});

/**
 * The smaller of two values, lane by lane. A number spreads over a vector.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerMin = binary((a, b) => {
    const na = asNode(a);
    const nb = asNode(b);
    const type = combine('min', na.type, nb.type);
    return call('min', type, [splat(na, type), splat(nb, type)]);
});

/**
 * The larger of two values, lane by lane. A number spreads over a vector.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerMax = binary((a, b) => {
    const na = asNode(a);
    const nb = asNode(b);
    const type = combine('max', na.type, nb.type);
    return call('max', type, [splat(na, type), splat(nb, type)]);
});

/**
 * Keeps `value` between `lo` and `hi`, lane by lane. Numbers as bounds spread over `value`.
 * @param value - What to keep inside.
 * @param lo - The lowest it may be.
 * @param hi - The highest it may be.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerClamp = (value: TComposerInput, lo: TComposerInput, hi: TComposerInput): TComposerNode => {
    const v = asNode(value);
    return call('clamp', v.type, [v, splat(asNode(lo), v.type), splat(asNode(hi), v.type)]);
};

/**
 * Blends from `a` to `b` by `t`: 0 gives `a`, 1 gives `b`. `a` and `b` are the same size, and `t`
 * is either a number or that size too.
 * @param a - What `0` gives.
 * @param b - What `1` gives.
 * @param t - How far from `a` to `b`.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerMix = (a: TComposerInput, b: TComposerInput, t: TComposerInput): TComposerNode => {
    const na = asNode(a);
    const nb = asNode(b);
    const type = combine('mix', na.type, nb.type);
    const nt = asNode(t);
    if (nt.type !== 'f32' && nt.type !== type) {
        throw new Error(`[NacatamalOn] shader composer: the mix factor must be a number or a ${type}, got a ${nt.type}.`);
    }
    return call('mix', type, [splat(na, type), splat(nb, type), nt]);
};

/**
 * A hard cut: 0 where `value` is below `edge`, 1 from there on, lane by lane. A number as `edge`
 * spreads over `value`.
 * @param edge - Where the cut is.
 * @param value - What is cut.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerStep = (edge: TComposerInput, value: TComposerInput): TComposerNode => {
    const v = asNode(value);
    return call('step', v.type, [splat(asNode(edge), v.type), v]);
};

/**
 * A soft cut: eases from 0 to 1 as `value` goes from `edge0` to `edge1`. Numbers as edges spread
 * over `value`.
 * @param edge0 - Where the ramp starts.
 * @param edge1 - Where it ends.
 * @param value - What is ramped.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerSmoothstep = (
    edge0: TComposerInput,
    edge1: TComposerInput,
    value: TComposerInput,
): TComposerNode => {
    const v = asNode(value);
    return call('smoothstep', v.type, [splat(asNode(edge0), v.type), splat(asNode(edge1), v.type), v]);
};

/**
 * Bounces the direction `i` off a surface facing `n`. Both vectors of the same size.
 * @param i - The direction that arrives.
 * @param n - The way the surface faces.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerReflect = (i: TComposerNode, n: TComposerNode): TComposerNode => {
    if (i.type !== n.type || !isVec(i.type)) {
        throw new Error('[NacatamalOn] shader composer: reflect expects two vectors of the same size.');
    }
    return call('reflect', i.type, [i, n]);
};

/**
 * The remainder the way shader authors expect it, `x - y * floor(x / y)`, which always takes the
 * sign of `y`. Built from the pieces above, because WGSL's own `%` keeps the sign of `x` instead
 * and the two backends would disagree on negative numbers. A number as `y` spreads over `x`.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerMod = binary((x, y) => {
    const nx = asNode(x);
    const ny = asNode(y);
    return composerSub(nx, composerMul(ny, composerFloor(composerDiv(nx, ny))));
});

/**
 * `1 - x`, lane by lane: the opposite of a mask or of a falloff, in one step of a pipe.
 * @param a - The value.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerOneMinus = (a: TComposerInput): TComposerNode => composerSub(1, a);

/**
 * Keeps each lane between 0 and 1, in one step of a pipe. Short for `composerClamp(x, 0, 1)`.
 * @param a - The value.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerSaturate = (a: TComposerInput): TComposerNode => composerClamp(a, 0, 1);
