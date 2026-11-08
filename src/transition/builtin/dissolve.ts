import { COVER_AMOUNT_GLSL, COVER_AMOUNT_WGSL } from './cover_amount';
import { rgbaUniform } from './rgba_uniform';
import type { TColor, TColorOption } from '../../color';
import type { TTexture } from '../../loaders/texture/types/t_texture';
import type { TTransition } from '../types/t_transition';

const BLACK: TColor = { r: 0, g: 0, b: 0, a: 1 };

/**
 * What `dissolve` accepts beyond its duration and its mask.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDissolveOptions = {
    /**
     * What the covered part is painted. Black unless you say otherwise.
     */
    color?: TColorOption;
    /**
     * How soft the edge of the shape is, from `0`, a hard edge, to `1`, which is nearly a fade. A
     * hard edge unless you say otherwise.
     */
    softness?: number;
};

/**
 * The screen is covered in the order a picture says, darkest first, and uncovered the same way back.
 *
 * **The picture is the shape.** Grey levels are the order things are covered in: a star painted
 * black outside and white in the middle closes on the middle as a star, a spiral covers as a spiral,
 * noise eats the screen grain by grain, and a picture with stripes is a set of blinds. It is stretched
 * over the whole screen and read blended between its pixels, so a small one still has smooth edges.
 *
 * Uncovering runs back the way it came, as an iris opens: what was covered last shows first.
 *
 * @param duration How long the whole thing takes in seconds, covering and uncovering together.
 * @param mask The shape: a file (`useLoadTexture`) or one painted in code (`createPixelTexture`).
 * Load it with the scene: the transition waits for it before it starts.
 * @param options The colour it covers with, and how soft its edge is.
 * @returns The transition, for `useScene().change(name, { transition })`.
 *
 * @example
 * ```ts
 * const scene = useScene();
 * // Noise is the screen eaten grain by grain; a gradient down is a curtain with a soft edge.
 * const grain = createPixelTexture(fillNoise(createPixels(80, 45), { scale: 4 }));
 * scene.change('Level2', { transition: dissolve(0.8, grain) });
 *
 * // or:
 * const fall = createPixelTexture(fillGradient(createPixels(1, 32), { from: '#000', to: '#fff' }));
 * scene.change('Level2', { transition: dissolve(0.6, fall, { softness: 0.2 }) });
 * ```
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const dissolve = (duration: number, mask: TTexture, options: TDissolveOptions = {}): TTransition => ({
    name: 'dissolve',
    duration,
    mask,
    uniforms: {
        color: rgbaUniform(options.color ?? BLACK),
        softness: Math.min(1, Math.max(0, options.softness ?? 0)),
    },
    uniformSig: { color: 'vec4<f32>', softness: 'f32' },
    // The edge is moved over a range a little longer than 0 to 1, by the width of the edge itself,
    // so that nothing at all is covered at the start, even the blackest pixel, and everything is at
    // the end, even the whitest. A hard edge is a soft one too narrow to see: smoothstep with both
    // ends the same is not defined.
    fragment: /* wgsl */ `${COVER_AMOUNT_WGSL}
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let level = dot(sampleMask(uv).rgb, vec3<f32>(0.299, 0.587, 0.114));
    let edge = max(mu.softness, 0.004);
    let at = coverAmount() * (1.0 + edge);
    let covered = 1.0 - smoothstep(at - edge, at, level);
    return vec4<f32>(mix(color.rgb, mu.color.rgb, covered), color.a);
}
`,
    fragmentGlsl: /* glsl */ `${COVER_AMOUNT_GLSL}
vec4 effect(vec4 color, vec2 uv) {
    float level = dot(sampleMask(uv).rgb, vec3(0.299, 0.587, 0.114));
    float edge = max(mu.softness, 0.004);
    float at = coverAmount() * (1.0 + edge);
    float covered = 1.0 - smoothstep(at - edge, at, level);
    return vec4(mix(color.rgb, mu.color.rgb, covered), color.a);
}
`,
});
