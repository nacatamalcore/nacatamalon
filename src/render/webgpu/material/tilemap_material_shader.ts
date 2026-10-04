import { TILEMAP_SHADER_HEAD } from '../tilemap/tilemap_shader';
import { buildUniformLayout } from '../../shared/material_uniforms';
import type { TUniformSignature } from '../../../materials';

/**
 * Where a layer material's own parameters are bound.
 *
 * Group 0 is the frame, group 1 the sheet and group 2 the layer, all three already spoken for by the
 * built-in shader this one begins with.
 */
export const TILEMAP_MATERIAL_GROUP = 3;

/**
 * What the author's hook is given to read the sheet with, valid inside a branch.
 */
const SAMPLE = /* wgsl */ `
fn sampleTexture(uv: vec2f) -> vec4f {
    return textureSampleLevel(tilesTexture, tilesSampler, uv, 0.0);
}
`;

/**
 * The ending that calls the author's hook.
 *
 * The hook is handed the sheet **already read and already tinted by the layer**, which is exactly
 * what the built-in ending would have returned, and it is handed the same `uv` a sprite's hook gets.
 * So one effect written for a sprite works on a map's layer without a word changed, which is the
 * whole reason the two share a hook signature.
 */
const TAIL = /* wgsl */ `
@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
    return effect(sampleTexture(in.uv) * layer.tint, in.uv);
}
`;

/**
 * Builds the whole shader for a map layer's material.
 *
 * The preamble is the **same value** the built-in map shader is built from, so a layer with an
 * effect is placed exactly where the same layer without one would be.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildTilemapMaterialShader = (fragment: string, sig: TUniformSignature): string => {
    const { structText } = buildUniformLayout(sig);

    return [
        TILEMAP_SHADER_HEAD,
        SAMPLE,
        structText,
        `@group(${TILEMAP_MATERIAL_GROUP}) @binding(0) var<uniform> mu: MaterialUniforms;`,
        fragment,
        TAIL,
    ].join('\n');
};
