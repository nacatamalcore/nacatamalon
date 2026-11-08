import { spriteShaderHead, distanceFieldCoverage } from './sprite_shader';
import { SPRITE_TEXTURE_SLOTS } from '../../shared/sprite_batch';

const textures = Array.from({ length: SPRITE_TEXTURE_SLOTS }, (_, i) => i === 0 ? 'spriteTexture' : `spriteTexture${i}`);
const declarations = textures.slice(1).map((name, i) => `@group(1) @binding(${i + 2}) var ${name}: texture_2d<f32>;`).join('\n');
const dimensions = `fn spriteDimensions(slot: u32) -> vec2u {
    switch slot {
        ${textures.slice(1).map((name, i) => `case ${i + 1}u: { return textureDimensions(${name}, 0); }`).join('\n')}
        default: { return textureDimensions(spriteTexture, 0); }
    }
}`;
// The gradients are worked out before the picture is chosen. Neighbouring sprites can choose
// different pictures, and a gradient taken inside a branch that differs between them is not valid
// WGSL.
const sample = `fn spriteSample(slot: u32, uv: vec2f, dx: vec2f, dy: vec2f) -> vec4f {
    switch slot {
        ${textures.slice(1).map((name, i) => `case ${i + 1}u: { return textureSampleGrad(${name}, spriteSampler, uv, dx, dy); }`).join('\n')}
        default: { return textureSampleGrad(spriteTexture, spriteSampler, uv, dx, dy); }
    }
}`;

// Only the built-in endings choose a picture. The placement, the window and the seams are the
// one-picture shader's, which an effect keeps. The view and the picture share the view number
// (view + slot * MAX_VIEWS), so a sprite takes no more bytes than before.
const head = spriteShaderHead({ textures: declarations, helpers: dimensions + '\n' + sample });

const read = `let slot = in.textureSlot;
    let uv = insideWindow(in.uv, in.window, in.repeat, slot);
    let sampled = spriteSample(slot, uv, dpdx(uv), dpdy(uv));`;

/**
 * The built-in sprite shader: each sprite's own picture, of up to eight, multiplied by its tint.
 * A run with one picture uses it too, with that picture in every slot.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_BATCH_SHADER = head + `@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
    ${read}
    return illuminate2d(sampled * in.tint, in.worldPixel, in.lightView);
}`;

/**
 * The built-in shader for vector fonts' letters: several fonts in one draw.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_BATCH_DISTANCE_FIELD_SHADER = head + distanceFieldCoverage(true) + `@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
    ${read}
    return illuminate2d(vec4f(in.tint.rgb, in.tint.a * distanceFieldCoverage(sampled, in.uv, slot)), in.worldPixel, in.lightView);
}`;
