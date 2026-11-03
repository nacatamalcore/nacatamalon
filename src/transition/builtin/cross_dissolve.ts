import type { TTexture } from '../../loaders/texture/types/t_texture';
import type { TTransition } from '../types/t_transition';

/**
 * What `crossDissolve` accepts beyond its duration and its mask.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCrossDissolveOptions = {
    /**
     * How soft the edge of the shape is, from `0`, a hard edge, to `1`, which is nearly a crossfade.
     * A hard edge unless you say otherwise.
     */
    softness?: number;
};

/**
 * The scene coming in shows through in the order a picture says, darkest first, until the one going
 * out is gone: a `dissolve` with the new scene where the colour was, in one run instead of two.
 *
 * The picture is the shape, as in `dissolve`: a clock face sweeps like a hand, a star opens from the
 * middle as a star, noise eats the old scene grain by grain. The one going out is shown as its last
 * picture, still.
 *
 * @param duration How long it takes in seconds, from all of the old scene to all of the new.
 * @param mask The shape: a file (`useLoadTexture`) or one painted in code (`createPixelTexture`).
 * The transition waits for it before it starts, with the old scene still playing.
 * @param options How soft its edge is.
 * @returns The transition, for `useScene().change(name, { transition })`.
 *
 * @example
 * ```ts
 * const scene = useScene();
 * const clock = useLoadTexture({ src: '/assets/masks/clock.png' });
 * scene.change('Night', { transition: crossDissolve(1.2, clock, { softness: 0.05 }) });
 * ```
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const crossDissolve = (duration: number, mask: TTexture, options: TCrossDissolveOptions = {}): TTransition => ({
    name: 'crossDissolve',
    duration,
    cross: true,
    mask,
    uniforms: { softness: Math.min(1, Math.max(0, options.softness ?? 0)) },
    uniformSig: { softness: 'f32' },
    // The edge moves over a range a little longer than 0 to 1, as in `dissolve`, so the blackest
    // pixel is still the old scene at the start and the whitest is the new one at the end.
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let level = dot(sampleMask(uv).rgb, vec3<f32>(0.299, 0.587, 0.114));
    let edge = max(mu.softness, 0.004);
    let at = mu.progress * (1.0 + edge);
    let shown = 1.0 - smoothstep(at - edge, at, level);
    return mix(sampleOutgoing(uv), color, shown);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    float level = dot(sampleMask(uv).rgb, vec3(0.299, 0.587, 0.114));
    float edge = max(mu.softness, 0.004);
    float at = mu.progress * (1.0 + edge);
    float shown = 1.0 - smoothstep(at - edge, at, level);
    return mix(sampleOutgoing(uv), color, shown);
}
`,
});
