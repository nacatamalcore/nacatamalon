import { uniformLength } from './uniform_numbers';
import type { TUniformSignature, TUniformType, TUniformValues } from './types/t_uniforms';

/**
 * Which names the engine writes itself here, and what to call the thing that refused one.
 *
 * Two sets rather than one, because the engine fills in more for a screen-wide effect than for a
 * material, and reserving a name where it means nothing would take a perfectly good word away for a
 * reason that does not apply. `phase` is exactly what an ordinary effect wants to call a parameter.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSignatureRules = {
    reserved: ReadonlySet<string>;
    /**
     * The function an author will recognise, for the message they get when a name is refused.
     */
    caller: string;
};

/**
 * What a material may not call a parameter: the two the engine fills in for every drawable.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MATERIAL_RULES: TSignatureRules = {
    reserved: new Set(['time', 'resolution']),
    caller: 'createMaterial',
};

/**
 * What a screen-wide effect may not call one: those two, plus the pair a scene transition drives.
 *
 * `progress` and `phase` are reserved here and nowhere else, which is the promise the material rules
 * above make. A scene change drives them; outside one they read as zero, which is the true answer to
 * "how far along is the transition" when there is not one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const POST_RULES: TSignatureRules = {
    reserved: new Set(['time', 'resolution', 'progress', 'phase']),
    caller: 'usePostProcess',
};

const VECTOR: Record<number, TUniformType> = {
    2: 'vec2<f32>',
    3: 'vec3<f32>',
    4: 'vec4<f32>',
};

/**
 * Works out what kind each of a material's uniforms is by looking at what it was first set to.
 *
 * Asking for the kinds separately would be saying the same thing twice, and two statements of one
 * fact are two statements that can disagree. A number is a number; a list of two, three or four is
 * the vector of that length; anything else is a mistake worth stopping for, because it would
 * otherwise become a silent hole in the block of memory the card reads.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const deriveSignature = (values: TUniformValues, rules: TSignatureRules = MATERIAL_RULES): TUniformSignature => {
    const sig: TUniformSignature = {};

    for (const [name, value] of Object.entries(values)) {
        if (rules.reserved.has(name)) {
            throw new Error(
                `[NacatamalOn] ${rules.caller}: '${name}' is a name the engine fills in itself. ` +
                'Read it as `mu.' + name + '` and call your own parameter something else.',
            );
        }

        if (typeof value === 'number') {
            sig[name] = 'f32';
            continue;
        }

        // A point is as long as the numbers it has, and a colour four: `r, g, b, a`.
        const length = uniformLength(value);
        const vector = length === undefined ? undefined : VECTOR[length];
        if (vector === undefined) {
            throw new Error(
                `[NacatamalOn] ${rules.caller}: the uniform '${name}' has to be a number, a list of ` +
                'two, three or four, a point ({ x, y }) or a colour (\'#ffcc00\').',
            );
        }
        sig[name] = vector;
    }

    return sig;
};

/**
 * The kinds of a file's uniforms and of those a call site gave it: the file's for the names it
 * declares, the call site's for the ones it added. A colour given to a uniform the file declares as
 * `vec3` stays three numbers, where on its own it would be four.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const withFileKinds = (file: TUniformSignature, asked: TUniformSignature): TUniformSignature => {
    const sig: TUniformSignature = { ...file };
    for (const [name, type] of Object.entries(asked)) {
        if (!(name in sig)) sig[name] = type;
    }
    return sig;
};
