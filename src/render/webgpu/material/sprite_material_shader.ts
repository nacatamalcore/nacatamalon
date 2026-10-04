import { SPRITE_SHADER_HEAD } from '../sprite/sprite_shader';
import { buildUniformLayout } from '../../shared/material_uniforms';
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
    return effect(sampleTexture(insideWindow(in.uv, in.window)) * in.tint, in.uv);
}
`;

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
export const buildSpriteMaterialShader = (fragment: string, sig: TUniformSignature): string => {
    const { structText } = buildUniformLayout(sig);

    return [
        SPRITE_SHADER_HEAD,
        SAMPLE,
        structText,
        `@group(${SPRITE_MATERIAL_GROUP}) @binding(0) var<uniform> mu: MaterialUniforms;`,
        fragment,
        TAIL,
    ].join('\n');
};
