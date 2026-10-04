import { ENGINE_FIELDS } from '../../shared/material_uniforms';
import type { TUniformSignature, TUniformType } from '../../../materials';

/**
 * The four kinds, spelled the way this language spells them.
 */
const GLSL_TYPE: Record<TUniformType, string> = {
    'f32': 'float',
    'vec2<f32>': 'vec2',
    'vec3<f32>': 'vec3',
    'vec4<f32>': 'vec4',
};

/**
 * Where a material's parameters are bound in this backend.
 *
 * Numbered after the ones already spoken for: 0 is the frame's own, which the 2D programs read, and
 * 1 and 2 are a model's own and its lights. One number means one thing across this backend.
 */
export const MATERIAL_UNIFORMS_BINDING = 3;

/**
 * Declares a material's parameters as a `std140` block.
 *
 * Built by walking the **same list, in the same order** that `buildUniformLayout` gives places to.
 * That is what makes the declaration and the numbers agree by construction. Reading the offsets back
 * out of the generated WGSL would make them agree by coincidence, and a coincidence holds right up
 * until somebody adds a field.
 *
 * No padding is written out. `std140` and WGSL apply the same rules to all four kinds allowed here,
 * so both lay this out identically from the same text.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const glslUniformBlock = (
    sig: TUniformSignature,
    engineFields: [string, TUniformType][] = ENGINE_FIELDS,
): string => {
    const fields: [string, TUniformType][] = [...engineFields, ...Object.entries(sig)];
    const members = fields.map(([name, type]) => `    ${GLSL_TYPE[type]} ${name};`).join('\n');
    return `layout(std140) uniform MaterialUniforms {\n${members}\n} mu;`;
};
