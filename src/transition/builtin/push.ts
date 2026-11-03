import { AXIS } from './wipe';
import type { TTransition } from '../types/t_transition';
import type { TWipeDirection } from './wipe';

/**
 * The scene coming in slides onto the screen and pushes the one going out off the other side.
 *
 * The two travel together, edge to edge, so nothing is ever covered: what leaves on the right came
 * in on the left. The one going out is shown as its last picture, still.
 *
 * @param duration How long it takes in seconds, from all of the old scene to all of the new.
 * @param direction Which way both scenes travel. `'right'` brings the new one in from the left. To
 * the right unless you say otherwise.
 * @returns The transition, for `useScene().change(name, { transition })`.
 *
 * @example
 * ```ts
 * const scene = useScene();
 * // The next room is to the right, so the screen moves left.
 * scene.change('RoomEast', { transition: push(0.5, 'left') });
 * ```
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const push = (duration = 0.5, direction: TWipeDirection = 'right'): TTransition => ({
    name: 'push',
    duration,
    cross: true,
    uniforms: { direction: AXIS[direction] ?? AXIS.right },
    uniformSig: { direction: 'vec2<f32>' },
    // Where this pixel was in the old scene, and where it is in the new one, which sits one screen
    // behind it. Inside the old scene's screen is the old scene; anything else is the new one. The
    // check is a clamp and not a comparison, which WGSL reads badly inside an expression: see wipe.
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let shift = mu.direction * mu.progress;
    let old = uv - shift;
    let inside = all(clamp(old, vec2<f32>(0.0), vec2<f32>(1.0)) == old);
    return select(sampleTexture(old + mu.direction), sampleOutgoing(old), inside);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec2 shift = mu.direction * mu.progress;
    vec2 old = uv - shift;
    bool inside = clamp(old, vec2(0.0), vec2(1.0)) == old;
    return inside ? sampleOutgoing(old) : sampleTexture(old + mu.direction);
}
`,
});
