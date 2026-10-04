import type { TUniformSignature, TUniformType, TUniformValues } from '../../materials';

/**
 * How each kind of parameter sits in memory: what it has to start on, and how much of it there is.
 *
 * The pair that matters, and the one that is easy to get wrong: **a `vec3` starts on a multiple of
 * 16 but only takes up 12**, so a single number written after one lands four bytes later, not
 * sixteen. That is the whole of the rule, and WGSL and GLSL's `std140` happen to agree on it, which
 * is what lets one table serve both cards. Written out twice it would be a fault that only shows on
 * one of them, which is why this file sits where neither backend owns it.
 */
const LAYOUT: Record<TUniformType, { align: number; size: number }> = {
    'f32': { align: 4, size: 4 },
    'vec2<f32>': { align: 8, size: 8 },
    'vec3<f32>': { align: 16, size: 12 },
    'vec4<f32>': { align: 16, size: 16 },
};

/**
 * What the engine puts in every material's parameters without being asked, before anything the
 * author declared.
 *
 * They go first so their place never moves: a shader written last year reads `mu.time` from the
 * same spot as one written today, whatever parameters the author added in between.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const ENGINE_FIELDS: [string, TUniformType][] = [
    ['time', 'f32'],
    ['resolution', 'vec2<f32>'],
];

/**
 * The same, for an effect over the whole screen, which gets two more.
 *
 * `progress` and `phase` are how a scene change tells its effect how far along it is. They are
 * deliberately absent from the list above: a material on a sprite offering a `mu.progress` that is
 * structurally always zero is a parameter that invites being used and can never work.
 *
 * A scene change is what writes them, and it is the only thing that does: outside one they are both
 * zero, which is the right answer to "nothing is covering the screen".
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const POST_ENGINE_FIELDS: [string, TUniformType][] = [
    ...ENGINE_FIELDS,
    ['progress', 'f32'],
    ['phase', 'f32'],
];

/**
 * Where every parameter lives, and the text that declares them, worked out together.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUniformLayout = {
    /**
     * The WGSL `struct MaterialUniforms { ... };`, members in the order they are stored.
     */
    structText: string;
    /**
     * How long the backing array is, rounded up so the whole block is a multiple of 16 bytes.
     */
    floatCount: number;
    /**
     * Which number each parameter starts at, engine ones included, by name.
     */
    offsets: Record<string, number>;
};

const roundUp = (value: number, align: number): number => Math.ceil(value / align) * align;

/**
 * Works out where each of a material's parameters goes, and writes the declaration that matches.
 *
 * **Both halves come out of one walk of one list**, and that is the point of the function. The
 * offsets and the text a card compiles have to agree exactly, and deriving them from the same list
 * makes that true by construction. Reading the offsets back out of the generated text would make it
 * true by coincidence, which is the same thing right up until it is not.
 *
 * The order of the author's own parameters is the order they were written in, which for a file is
 * the order of its `@uniform` lines. That ordering is part of the contract: change it and every
 * offset after the change moves.
 *
 * @param sig What the author declared, by name.
 * @param engineFields What the engine adds first. The screen-wide list for a full-screen effect.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildUniformLayout = (
    sig: TUniformSignature,
    engineFields: [string, TUniformType][] = ENGINE_FIELDS,
): TUniformLayout => {
    const fields: [string, TUniformType][] = [...engineFields, ...Object.entries(sig)];

    const offsets: Record<string, number> = {};
    let offsetBytes = 0;
    for (const [name, type] of fields) {
        const { align, size } = LAYOUT[type];
        offsetBytes = roundUp(offsetBytes, align);
        offsets[name] = offsetBytes / 4;
        // By its size and not by its aligned size, which is what lets a single number tuck into the
        // four bytes a `vec3` leaves behind.
        offsetBytes += size;
    }

    // A card will only take a block of parameters whose length is a multiple of 16 bytes. Whatever
    // is left over at the end stays zero and nobody reads it.
    const floatCount = roundUp(offsetBytes, 16) / 4;

    const members = fields.map(([name, type]) => `    ${name}: ${type},`).join('\n');
    const structText = `struct MaterialUniforms {\n${members}\n};`;

    return { structText, floatCount, offsets };
};

/**
 * Copies a bag of values into the array at the places the layout gave them.
 */
const writeValues = (out: Float32Array, layout: TUniformLayout, values: TUniformValues): void => {
    for (const [name, value] of Object.entries(values)) {
        const offset = layout.offsets[name];
        // A name the shader does not declare is skipped rather than refused: a value left behind
        // after an effect was edited should stop doing anything, not stop the game.
        if (offset === undefined) {
            continue;
        }
        if (typeof value === 'number') {
            out[offset] = value;
        } else {
            out.set(value, offset);
        }
    }
};

/**
 * Fills one material's parameters for one draw: what the engine knows, then what the material says,
 * then whatever this one object says on top.
 *
 * **The object wins**, and that is the whole of a property block: fifteen sprites share one compiled
 * effect and one pipeline, and each still runs it with its own numbers. Without it, varying a single
 * parameter would mean a material apiece, which is a compile of the identical shader apiece.
 *
 * Called once per draw. Nothing is cleared first, so a parameter nobody wrote keeps whatever was
 * there, which is zero the first time and the previous value afterwards.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const writeUniformValues = (
    out: Float32Array,
    layout: TUniformLayout,
    values: TUniformValues,
    time: number,
    width: number,
    height: number,
    overrides: TUniformValues | null = null,
): void => {
    out[layout.offsets.time] = time;
    const resolution = layout.offsets.resolution;
    out[resolution] = width;
    out[resolution + 1] = height;

    writeValues(out, layout, values);
    if (overrides !== null) {
        writeValues(out, layout, overrides);
    }
};
