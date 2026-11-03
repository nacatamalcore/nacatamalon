import { TILEMAP_SHADER_HEAD } from '../tilemap/tilemap_shader';
import { buildUniformLayout } from '../../shared/material_uniforms';
import { flatMapsWgsl } from './flat_maps';
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
 * Where this pixel is across its tile and across the whole layer, 0 to 1, for the hook to read a map
 * at: `localUv()` a shine that runs over each tile on its own, `layerUv()` one that crosses the map.
 *
 * The tile's is worked out from its window, which sits half a texel in from each edge of its piece of
 * the sheet: put back out by that half texel, the piece runs exactly 0 to 1. A flipped tile reads its
 * piece the other way round, and its `localUv()` turns over with it.
 */
const ACROSS = /* wgsl */ `
var<private> tileAcross: vec2f;
var<private> layerAcross: vec2f;

fn localUv() -> vec2f {
    return tileAcross;
}

fn layerUv() -> vec2f {
    return layerAcross;
}

fn acrossTile(in: VertexOut) -> vec2f {
    let texel = 0.5 / vec2f(textureDimensions(tilesTexture, 0));
    let low = in.window.xy - texel;
    let high = in.window.zw + texel;
    return (in.uv - low) / max(high - low, vec2f(1e-6));
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
    tileAcross = acrossTile(in);
    layerAcross = in.acrossLayer;
    return effect(sampleTexture(tileUv(in)) * layer.tint, in.uv);
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
export const buildTilemapMaterialShader = (fragment: string, sig: TUniformSignature, mapNames: readonly string[] = []): string => {
    const { structText } = buildUniformLayout(sig);

    return [
        TILEMAP_SHADER_HEAD,
        SAMPLE,
        ACROSS,
        structText,
        `@group(${TILEMAP_MATERIAL_GROUP}) @binding(0) var<uniform> mu: MaterialUniforms;`,
        flatMapsWgsl(TILEMAP_MATERIAL_GROUP, mapNames),
        fragment,
        TAIL,
    ].join('\n');
};
