import { SPRITE_FRAGMENT_HEAD_GLSL, SPRITE_VERTEX_SHADER } from '../sprite/sprite_shader';
import { glslUniformBlock } from './uniform_block';
import type { TUniformSignature } from '../../../materials';

/**
 * What the author's hook reads the sheet with.
 *
 * `textureLod` with an explicit level, matching its twin's `textureSampleLevel`, so a hook that
 * calls it inside an `if` is legal in both languages.
 */
const SAMPLE = /* glsl */ `
vec4 sampleTexture(vec2 uv) {
    return textureLod(spriteTexture, uv, 0.0);
}
`;

/**
 * The ending that calls the hook, with the sheet already read and already tinted.
 */
const TAIL = /* glsl */ `
void main() {
    fragColor = effect(sampleTexture(insideWindow(vUv, vWindow)) * vTint, vUv);
}
`;

/**
 * Builds a sprite material's two halves for this backend.
 *
 * **The vertex half is the built-in one, untouched.** A sprite is a flat square whose corners the
 * engine places, and there is nothing about that an effect gets to change, which is also why a file
 * for sprites is refused if it defines a vertex hook.
 *
 * The declarations come from the same value the built-in fragment is built from, so what the hook
 * can see is exactly what the built-in ending could see. Everything after them is in an order GLSL
 * insists on: a thing has to be declared before whatever uses it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildSpriteMaterialShaderGlsl = (
    fragment: string,
    sig: TUniformSignature,
): { vertex: string; fragment: string } => ({
    vertex: SPRITE_VERTEX_SHADER,
    fragment: [SPRITE_FRAGMENT_HEAD_GLSL, glslUniformBlock(sig), SAMPLE, fragment, TAIL].join('\n'),
});
