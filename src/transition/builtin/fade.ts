import { COVER_AMOUNT_GLSL, COVER_AMOUNT_WGSL } from './cover_amount';
import type { TColor } from '../../color';
import type { TTransition } from '../types/t_transition';

const BLACK: TColor = { r: 0, g: 0, b: 0, a: 1 };

/**
 * The screen sinks into one colour, the scenes swap behind it, and it comes back.
 *
 * The one every game reaches for, and the one to reach for when nothing else fits: it says "we went
 * somewhere else" without saying anything about where, so it never looks wrong.
 *
 * Note that a fade runs **before** the rest of the chain, so on a game that reduces its colours the
 * middle of it is quantized like everything else: stepped, not smooth. That is how a fade looked on
 * the hardware this engine is aimed at, and it is the reason the transition goes first.
 *
 * @param duration How long the whole thing takes in milliseconds, covering and uncovering together.
 * @param color What the screen sinks into. Black unless you say otherwise.
 * @returns The transition, for `useScene().change(name, { transition })`.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fade = (duration = 300, color: TColor = BLACK): TTransition => ({
    name: 'fade',
    duration,
    uniforms: { color: [color.r, color.g, color.b, color.a] },
    uniformSig: { color: 'vec4<f32>' },
    fragment: /* wgsl */ `${COVER_AMOUNT_WGSL}
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    return vec4<f32>(mix(color.rgb, mu.color.rgb, coverAmount()), color.a);
}
`,
    fragmentGlsl: /* glsl */ `${COVER_AMOUNT_GLSL}
vec4 effect(vec4 color, vec2 uv) {
    return vec4(mix(color.rgb, mu.color.rgb, coverAmount()), color.a);
}
`,
});
