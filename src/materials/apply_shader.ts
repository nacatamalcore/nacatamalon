import { deriveSignature, MATERIAL_RULES } from './derive_signature';
import { checkParameterRoom } from './check_parameter_room';
import type { TMaterial } from './types/t_material';
import type { TShader } from '../loaders/shader/types/t_shader';

/**
 * What each material asked for at the call site, kept apart from what it is currently using.
 *
 * Kept apart on purpose. A file may land before the material is built or long after it, and those
 * two orders have to end in the same place. Merging at creation would make the earlier case keep the
 * call's values and the later one lose them, which is a bug that only appears on a slow connection.
 *
 * A `WeakMap` because a material that nothing holds any more should not be kept alive by this.
 */
const overrides = new WeakMap<TMaterial, Record<string, number | number[]>>();

/**
 * Remembers what a material was asked for, so a file landing later cannot wash it away.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const rememberOverrides = (material: TMaterial, values: Record<string, number | number[]>): void => {
    overrides.set(material, values);
};

/**
 * The families each file has already been told it does not fit, so a hundred sprites on one wrong
 * file say it once.
 */
const misfits = new WeakMap<TShader, Set<TMaterial['shader']>>();

/**
 * Pours a loaded file into one material: its hooks, its knobs, and the kinds of those knobs.
 *
 * The file's own values go underneath and the call site's go on top, which is the rule a reader
 * expects: the file says what a knob usually is, the scene says what it is here.
 *
 * A file for the other family is not poured in at all. Its hooks are written against the other
 * family's shader, so the card would refuse them with an error about a type the author never
 * touched (`FragContext` inside a sprite's shader); said here instead, with the two families, and
 * the material keeps the built-in look, which is what the card's refusal would have ended in too.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const applyShader = (material: TMaterial, shader: TShader): void => {
    if (shader.shader !== material.shader) {
        const told = misfits.get(shader) ?? new Set();
        if (!told.has(material.shader)) {
            told.add(material.shader);
            misfits.set(shader, told);
            console.warn(
                `[NacatamalOn] '${shader.src}' is a ${shader.shader} shader, but the material ` +
                `${material.name !== null ? `"${material.name}" ` : ''}is ${material.shader}, so it keeps the built-in look. ` +
                `Make the material with createMaterial({ shader: '${shader.shader}', ... }), or change the file's ` +
                `'// @shader' line to ${material.shader}.`,
            );
        }
        return;
    }
    material.fragment = shader.fragment;
    material.fragmentGlsl = shader.fragmentGlsl;
    material.vertex = shader.vertex;
    material.vertexGlsl = shader.vertexGlsl;

    const asked = overrides.get(material) ?? {};
    material.uniforms = { ...shader.uniforms, ...asked };
    // Derived from the merged values rather than copied from the file, because a knob the call site
    // introduced is real and has to have somewhere to live in the block the card reads.
    material.uniformSig = { ...shader.uniformSig, ...deriveSignature(asked) };
    checkParameterRoom(material.uniformSig, MATERIAL_RULES, material.name);
};
