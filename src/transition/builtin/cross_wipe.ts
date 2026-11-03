import { AXIS } from './wipe';
import type { TTransition } from '../types/t_transition';
import type { TWipeDirection } from './wipe';

/**
 * A straight edge crosses the screen once, with the scene coming in behind it and the one going out
 * ahead of it: the wipe of the films, with no colour in the middle.
 *
 * The one going out is shown as its last picture, still, while the edge eats it.
 *
 * @param duration How long the edge takes to cross, in seconds.
 * @param direction Which way the edge travels. To the right unless you say otherwise.
 * @returns The transition, for `useScene().change(name, { transition })`.
 *
 * @example
 * ```ts
 * const scene = useScene();
 * scene.change('Level2', { transition: crossWipe(0.6, 'down') });
 * ```
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const crossWipe = (duration = 0.6, direction: TWipeDirection = 'right'): TTransition => ({
    name: 'crossWipe',
    duration,
    cross: true,
    uniforms: { direction: AXIS[direction] ?? AXIS.right },
    uniformSig: { direction: 'vec2<f32>' },
    // `step` and not a comparison, for the same reason the wipe pulls its comparisons out.
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let t = dot(uv - vec2<f32>(0.5, 0.5), mu.direction) + 0.5;
    return mix(sampleOutgoing(uv), color, step(t, mu.progress));
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    float t = dot(uv - vec2(0.5, 0.5), mu.direction) + 0.5;
    return mix(sampleOutgoing(uv), color, step(t, mu.progress));
}
`,
});
