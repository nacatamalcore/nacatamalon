import type { TTransition } from '../types/t_transition';

/**
 * A circle opens from a point with the scene coming in inside it, until the one going out is gone
 * past the corners.
 *
 * The one going out is shown as its last picture, still, around the circle. As with `iris`, the
 * circle stays a circle on a wide screen, and it opens past the furthest corner wherever its centre is.
 *
 * @param duration How long it takes to open, in seconds.
 * @param center Where it opens from, in screen fractions: `{ x: 0, y: 0 }` is the top left corner
 * and `{ x: 1, y: 1 }` the bottom right. The middle unless you say otherwise.
 * @returns The transition, for `useScene().change(name, { transition })`.
 *
 * @example
 * ```ts
 * const scene = useScene();
 * // Opening on the door the player went through.
 * scene.change('Inside', { transition: crossIris(0.6, { x: 0.8, y: 0.7 }) });
 * ```
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const crossIris = (duration = 0.6, center: { x: number; y: number } = { x: 0.5, y: 0.5 }): TTransition => ({
    name: 'crossIris',
    duration,
    cross: true,
    uniforms: { center: [center.x, center.y] },
    uniformSig: { center: 'vec2<f32>' },
    // A hair added to the distance, so a pixel whose middle is the centre itself is not the new
    // scene already at the start, when the circle has no size at all.
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let aspect = vec2<f32>(mu.resolution.x / max(1.0, mu.resolution.y), 1.0);
    let far = length(max(mu.center, vec2<f32>(1.0) - mu.center) * aspect) + 0.01;
    let inside = step(length((uv - mu.center) * aspect) + 0.0001, mu.progress * far);
    return mix(sampleOutgoing(uv), color, inside);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec2 aspect = vec2(mu.resolution.x / max(1.0, mu.resolution.y), 1.0);
    float far = length(max(mu.center, vec2(1.0) - mu.center) * aspect) + 0.01;
    float inside = step(length((uv - mu.center) * aspect) + 0.0001, mu.progress * far);
    return mix(sampleOutgoing(uv), color, inside);
}
`,
});
