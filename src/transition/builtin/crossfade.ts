import type { TTransition } from '../types/t_transition';

/**
 * The scene going out fades into the one coming in, both on screen at once, with no colour between.
 *
 * Halfway through you see half of each. The one going out is shown as its last picture, still: it
 * has stopped by then, and the one coming in is already playing underneath it.
 *
 * @param duration How long it takes in seconds, from all of the old scene to all of the new.
 * @returns The transition, for `useScene().change(name, { transition })`.
 *
 * @example
 * ```ts
 * const scene = useScene();
 * scene.change('Level2', { transition: crossfade(0.8) });
 * ```
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const crossfade = (duration = 0.6): TTransition => ({
    name: 'crossfade',
    duration,
    cross: true,
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    return mix(sampleOutgoing(uv), color, mu.progress);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    return mix(sampleOutgoing(uv), color, mu.progress);
}
`,
});
