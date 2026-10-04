import type { TColor } from '../../color';
import type { TTransition } from '../types/t_transition';

const BLACK: TColor = { r: 0, g: 0, b: 0, a: 1 };

/**
 * Which way the edge travels. `uv.y` points down, so `'down'` is a curtain falling.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TWipeDirection = 'left' | 'right' | 'up' | 'down';

const AXIS: Record<TWipeDirection, [number, number]> = {
    right: [1, 0],
    left: [-1, 0],
    down: [0, 1],
    up: [0, -1],
};

/**
 * A straight edge crosses the screen, and crosses it again the same way to uncover.
 *
 * The direction travels to the card as a **vector**, not as the word it was written with. A shader
 * that branched on a name would need one branch per direction and a fifth for anything mistyped;
 * projected onto an axis, all four are one line of arithmetic and a diagonal would cost nothing.
 *
 * This is the one built-in that does **not** ask `coverAmount()`. It reads `progress` and `phase`
 * itself and flips which side of the edge is covered, so the edge goes on travelling the same way in
 * both halves. Taking the leftover of `progress` instead would bring the edge back the way it came.
 *
 * @param duration How long the whole thing takes in milliseconds, covering and uncovering together.
 * @param direction Which way the edge travels. To the right unless you say otherwise.
 * @param color What the covered side is painted. Black unless you say otherwise.
 * @returns The transition, for `useScene().change(name, { transition })`.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const wipe = (duration = 300, direction: TWipeDirection = 'right', color: TColor = BLACK): TTransition => ({
    name: 'wipe',
    duration,
    uniforms: {
        color: [color.r, color.g, color.b, color.a],
        direction: AXIS[direction] ?? AXIS.right,
    },
    uniformSig: { color: 'vec4<f32>', direction: 'vec2<f32>' },
    // `before` and `after` are pulled out into their own names rather than written inside the
    // `select`, and that is **required, not style**. Inlined, WGSL reads the `<` of one and the `>`
    // of the other as a template argument list and rejects the whole shader. WebGPU reports a
    // shader error asynchronously, so the only symptom is a wipe that quietly never draws.
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let t = dot(uv - vec2<f32>(0.5, 0.5), mu.direction) + 0.5;
    let before = t < mu.progress;
    let after = t > mu.progress;
    let covered = select(before, after, mu.phase > 0.5);
    return select(color, mu.color, covered);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    float t = dot(uv - vec2(0.5, 0.5), mu.direction) + 0.5;
    bool before = t < mu.progress;
    bool after = t > mu.progress;
    bool covered = mu.phase > 0.5 ? after : before;
    return covered ? mu.color : color;
}
`,
});
