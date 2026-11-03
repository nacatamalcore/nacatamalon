import { TILEMAP_FRAGMENT_HEAD_GLSL, TILEMAP_VERTEX_SHADER } from '../tilemap/tilemap_shader';
import { glslUniformBlock } from './uniform_block';
import { flatMapsGlsl } from './flat_maps';
import type { TUniformSignature } from '../../../materials';

/**
 * What the author's hook reads the sheet with, valid inside a branch.
 */
const SAMPLE = /* glsl */ `
vec4 sampleTexture(vec2 uv) {
    return textureLod(tilesTexture, uv, 0.0);
}

in vec2 vAcrossLayer;

// Across its tile, from its window put back out by the half texel it sits in: see its twin.
vec2 localUv() {
    vec2 texel = 0.5 / vec2(textureSize(tilesTexture, 0));
    vec2 low = vWindow.xy - texel;
    vec2 high = vWindow.zw + texel;
    return (vUv - low) / max(high - low, vec2(1e-6));
}

vec2 layerUv() {
    return vAcrossLayer;
}
`;

/**
 * The ending that calls the hook, with the sheet already read and already tinted by the layer.
 */
const TAIL = /* glsl */ `
void main() {
    fragColor = effect(sampleTexture(tileUv()) * layerTint, vUv);
}
`;

/**
 * Builds a map layer material's two halves for this backend.
 *
 * **The vertex half is the built-in one, untouched.** A layer's cells are placed by the map, and
 * there is nothing about that an effect gets to change, exactly as with a sprite.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildTilemapMaterialShaderGlsl = (
    fragment: string,
    sig: TUniformSignature,
    mapNames: readonly string[] = [],
): { vertex: string; fragment: string } => ({
    vertex: TILEMAP_VERTEX_SHADER,
    fragment: [TILEMAP_FRAGMENT_HEAD_GLSL, glslUniformBlock(sig), SAMPLE, flatMapsGlsl(mapNames), fragment, TAIL].join('\n'),
});
