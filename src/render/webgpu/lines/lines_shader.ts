import { LINE_DEPTH_NUDGE } from '../../shared/line_vertex';

/**
 * The shader lines are drawn with: each corner through the scene's camera, in its own colour.
 *
 * Nothing else. No light, because a gizmo or an outline must read the same whatever lamps the scene
 * has, and no placement, because the corners arrive already placed in the world.
 *
 * **One nudge towards the camera.** A line lying on a surface (a grid on the floor, the outline of a
 * wall) is exactly as far away as that surface, and which one wins a tie is decided by rounding.
 * The corners are placed on the CPU and a model's on the GPU, so the two round differently and the
 * surface won: the grid disappeared under the floor it was drawn on. Each line is moved
 * `LINE_DEPTH_NUDGE` of the depth range closer, enough to win a tie and far too little to show
 * through anything really in front of it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LINES_SHADER = /* wgsl */ `
struct View { viewProjection: mat4x4f };
@group(0) @binding(0) var<uniform> view: View;

struct VertexOut {
    @builtin(position) clip: vec4f,
    @location(0) color: vec4f,
};

@vertex
fn vs(@location(0) position: vec3f, @location(1) color: vec4f) -> VertexOut {
    var out: VertexOut;
    out.clip = view.viewProjection * vec4f(position, 1.0);
    out.clip.z -= ${LINE_DEPTH_NUDGE} * out.clip.w;
    out.color = color;
    return out;
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
    return in.color;
}
`;
