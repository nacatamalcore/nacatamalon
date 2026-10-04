import { deriveSignature } from './derive_signature';
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
 * Pours a loaded file into one material: its hooks, its knobs, and the kinds of those knobs.
 *
 * The file's own values go underneath and the call site's go on top, which is the rule a reader
 * expects: the file says what a knob usually is, the scene says what it is here.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const applyShader = (material: TMaterial, shader: TShader): void => {
    material.fragment = shader.fragment;
    material.fragmentGlsl = shader.fragmentGlsl;
    material.vertex = shader.vertex;
    material.vertexGlsl = shader.vertexGlsl;

    const asked = overrides.get(material) ?? {};
    material.uniforms = { ...shader.uniforms, ...asked };
    // Derived from the merged values rather than copied from the file, because a knob the call site
    // introduced is real and has to have somewhere to live in the block the card reads.
    material.uniformSig = { ...shader.uniformSig, ...deriveSignature(asked) };
};
