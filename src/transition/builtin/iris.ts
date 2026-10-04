import { COVER_AMOUNT_GLSL, COVER_AMOUNT_WGSL } from './cover_amount';
import type { TColor } from '../../color';
import type { TTransition } from '../types/t_transition';

const BLACK: TColor = { r: 0, g: 0, b: 0, a: 1 };

/**
 * A circle closes over the screen and opens again on the scene behind it.
 *
 * **The centre is a parameter, and that is the whole point of the effect.** An iris that can only
 * close on the middle of the screen is a decoration; one that closes on where the character is
 * standing is the shot that ends a level, and it is what this has been used for since it was done
 * with a piece of card in front of a lens.
 *
 * The circle is corrected for the shape of the window, so it stays a circle on a wide screen instead
 * of becoming an ellipse, and it opens far enough past the furthest corner that "open" really means
 * nothing covered, wherever the centre is.
 *
 * @param duration How long the whole thing takes in milliseconds, closing and opening together.
 * @param color What the outside of the circle is painted. Black unless you say otherwise.
 * @param centre Where it closes on, in screen fractions: `{ x: 0, y: 0 }` is the top left corner
 * and `{ x: 1, y: 1 }` the bottom right. The middle unless you say otherwise.
 *
 * @returns The transition, for `useScene().change(name, { transition })`.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const iris = (
    duration = 400,
    color: TColor = BLACK,
    centre: { x: number; y: number } = { x: 0.5, y: 0.5 },
): TTransition => ({
    name: 'iris',
    duration,
    uniforms: {
        color: [color.r, color.g, color.b, color.a],
        centre: [centre.x, centre.y],
    },
    uniformSig: { color: 'vec4<f32>', centre: 'vec2<f32>' },
    fragment: /* wgsl */ `${COVER_AMOUNT_WGSL}
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let aspect = vec2<f32>(mu.resolution.x / max(1.0, mu.resolution.y), 1.0);
    // The corner furthest from the centre, whichever corner that is, plus a hair so that fully
    // open leaves nothing painted along the very edge.
    let far = length(max(mu.centre, vec2<f32>(1.0) - mu.centre) * aspect) + 0.01;
    let radius = (1.0 - coverAmount()) * far;
    let outside = length((uv - mu.centre) * aspect) > radius;
    return select(color, mu.color, outside);
}
`,
    fragmentGlsl: /* glsl */ `${COVER_AMOUNT_GLSL}
vec4 effect(vec4 color, vec2 uv) {
    vec2 aspect = vec2(mu.resolution.x / max(1.0, mu.resolution.y), 1.0);
    float far = length(max(mu.centre, vec2(1.0) - mu.centre) * aspect) + 0.01;
    float radius = (1.0 - coverAmount()) * far;
    bool outside = length((uv - mu.centre) * aspect) > radius;
    return outside ? mu.color : color;
}
`,
});
