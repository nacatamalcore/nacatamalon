import { spriteVertexShader, spriteFragmentHeadGlsl, distanceFieldCoverageGlsl } from './sprite_shader';
import { SPRITE_TEXTURE_SLOTS } from '../../shared/sprite_batch';

const textures = Array.from({ length: SPRITE_TEXTURE_SLOTS }, (_, i) => i === 0 ? 'spriteTexture' : `spriteTexture${i}`);
const declarations = textures.slice(1).map(name => `uniform sampler2D ${name};`).join('\n');
const dimensions = `ivec2 spriteDimensions(int slot) {
    switch (slot) {
        ${textures.slice(1).map((name, i) => `case ${i + 1}: return textureSize(${name}, 0);`).join('\n')}
        default: return textureSize(spriteTexture, 0);
    }
}`;
// GLSL only lets a sampler be chosen by a constant, hence the switch. The gradients are worked out
// before it, so a read stays well defined where two neighbouring sprites pick different pictures,
// as in the WGSL twin.
const sample = `vec4 spriteSample(int slot, vec2 uv, vec2 dx, vec2 dy) {
    switch (slot) {
        ${textures.slice(1).map((name, i) => `case ${i + 1}: return textureGrad(${name}, uv, dx, dy);`).join('\n')}
        default: return textureGrad(spriteTexture, uv, dx, dy);
    }
}`;

/**
 * The corners of a batch of several pictures: the same placement as `SPRITE_VERTEX_SHADER`, which
 * also hands on the picture each sprite reads.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_BATCH_VERTEX_SHADER = spriteVertexShader(true);
const head = spriteFragmentHeadGlsl({ textures: declarations, helpers: dimensions + '\n' + sample });

const read = `vec2 uv = insideWindow(vUv, vWindow);
    vec4 sampled = spriteSample(vTextureSlot, uv, dFdx(uv), dFdy(uv));`;

/**
 * The built-in ending for a batch: each sprite's own picture multiplied by its tint. Only built-in
 * sprites are batched this way; an effect keeps its one picture.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_BATCH_FRAGMENT_SHADER = head + `void main() {
    ${read}
    fragColor = sampled * vTint;
}`;

/**
 * The distance-field ending for a batch: letters of several vector fonts in one draw.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_BATCH_DISTANCE_FIELD_FRAGMENT_SHADER = head + distanceFieldCoverageGlsl(true) + `void main() {
    ${read}
    fragColor = vec4(vTint.rgb, vTint.a * distanceFieldCoverage(sampled, vUv));
}`;
