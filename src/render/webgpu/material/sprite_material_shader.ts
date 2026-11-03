import { DISTANCE_FIELD_COVERAGE, SPRITE_SHADER_HEAD } from '../sprite/sprite_shader';
import { buildUniformLayout } from '../../shared/material_uniforms';
import { flatMapsWgsl } from './flat_maps';
import type { TUniformSignature } from '../../../materials';

/**
 * Where a material's own parameters are bound.
 *
 * Group 0 is the frame and group 1 is the sheet, both already spoken for by the built-in shader this
 * one begins with, so the knobs take the next one along.
 */
export const SPRITE_MATERIAL_GROUP = 2;

/**
 * What the author's hook is given to read the sheet with.
 *
 * `textureSampleLevel` with an explicit level, rather than the plain `textureSample` the built-in
 * ending uses, because a hook may well call this inside an `if` or a loop and the plain one is not
 * allowed there. With no smaller copies of the image to choose between, level zero is the same
 * picture either way.
 */
const SAMPLE = /* wgsl */ `
fn sampleTexture(uv: vec2f) -> vec4f {
    return textureSampleLevel(spriteTexture, spriteSampler, uv, 0.0);
}
`;

/**
 * Where this pixel is across the sprite, 0 to 1, for the hook to read a map at: a mask laid over the
 * sprite stays put while its frames change, which one read at the sheet's `uv` would not.
 *
 * Handed over through a value the ending sets before it calls the hook, because the hook is given
 * only the colour and the `uv`, and changing what it is given would break every hook written.
 *
 * `layerUv()` is the same here: a sprite is its own layer. It is there so one material can go on a
 * sprite and on a map's layer alike, which is what the two sharing a hook promises.
 */
const ACROSS = /* wgsl */ `
var<private> spriteAcross: vec2f;

fn localUv() -> vec2f {
    return spriteAcross;
}

fn layerUv() -> vec2f {
    return spriteAcross;
}
`;

/**
 * The ending that calls the author's hook.
 *
 * What the hook is handed is the sheet **already read and already tinted**, which is exactly what
 * the built-in ending would have returned. So a hook of `return color;` draws what the engine would
 * have drawn, and an effect is written as a change to that rather than as a whole shader.
 *
 * That is why the engine's own read is kept inside the sprite's window here as well: a sprite with
 * an effect on it would otherwise still show the frame next door along its edge, and "exactly what
 * the built-in would have returned" would stop being true the moment anything landed on a half
 * pixel. The coordinate the hook is *given* is the real one, unclamped, because an effect that
 * reaches elsewhere on the sheet is doing it on purpose and this is not the place to argue.
 */
const TAIL = /* wgsl */ `
@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
    spriteAcross = in.across;
    return effect(sampleTexture(insideWindow(in.uv, in.window, in.repeat)) * in.tint, in.uv);
}
`;

/**
 * The ending for a material on a distance field: the hook is handed what the built-in distance-field
 * ending would have returned, the tint as opaque as the edge, so an effect on a vector font's text is
 * written exactly as one on a sprite. The coverage is worked out before the hook runs, where every
 * pixel still reaches it together.
 */
const DISTANCE_FIELD_TAIL = /* wgsl */ `
@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
    spriteAcross = in.across;
    let sample = sampleTexture(insideWindow(in.uv, in.window, in.repeat));
    let coverage = distanceFieldCoverage(sample, in.uv);
    return effect(vec4f(in.tint.rgb, in.tint.a * coverage), in.uv);
}
`;

const buildWith = (tail: string, fragment: string, sig: TUniformSignature, mapNames: readonly string[]): string => {
    const { structText } = buildUniformLayout(sig);

    return [
        SPRITE_SHADER_HEAD,
        SAMPLE,
        ACROSS,
        structText,
        `@group(${SPRITE_MATERIAL_GROUP}) @binding(0) var<uniform> mu: MaterialUniforms;`,
        flatMapsWgsl(SPRITE_MATERIAL_GROUP, mapNames),
        fragment,
        tail,
    ].join('\n');
};

/**
 * Builds the whole shader for a sprite material: the engine's own preamble, the knobs the author
 * declared, the author's hook, and the ending that calls it.
 *
 * The preamble is the **same value** the built-in shader is built from, not a copy of it, so the two
 * cannot drift. That matters more than it sounds: a preamble that had drifted would place the quad
 * differently, and the effect would look like it was working on the wrong pixels rather than like a
 * mismatched header.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildSpriteMaterialShader = (fragment: string, sig: TUniformSignature, mapNames: readonly string[] = []): string =>
    buildWith(TAIL, fragment, sig, mapNames);

/**
 * The same for sprites cut from a distance field: the characters of a text in a vector font.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildSpriteDistanceFieldMaterialShader = (fragment: string, sig: TUniformSignature, mapNames: readonly string[] = []): string =>
    buildWith(DISTANCE_FIELD_COVERAGE + DISTANCE_FIELD_TAIL, fragment, sig, mapNames);
