import { OFF_THE_SEAM_WGSL } from '../../shared/texel_seam';
/**
 * The whole shader a particle is drawn with.
 *
 * Its own and not the sprite's, for the same reason its instance is narrower: a particle is square,
 * placed by its middle and sized by one number, so the arithmetic that gives a sprite an anchor, two
 * scales, a repeat and a flip is arithmetic a particle would pay for and never use.
 *
 * What it **does** share is the view table, read exactly the way a sprite reads it: slot 0 is the
 * screen and a camera is its own slot. And the window into a sheet, read the same way too, kept half
 * a texel inside the frame. Working that out a second way here is how a cloud of sparks
 * would end up not quite following the camera the sprites follow.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PARTICLES_SHADER = /* wgsl */ `
struct View { position: vec2f, rotation: f32, zoom: f32 };
const MAX_VIEWS = 16u;
struct Uniforms { resolution: vec2f, padding: vec2f, views: array<View, MAX_VIEWS> };
@group(0) @binding(0) var<uniform> u: Uniforms;

@group(1) @binding(0) var particleSampler: sampler;
@group(1) @binding(1) var particleTexture: texture_2d<f32>;

struct Instance {
    @location(1) position: vec2f,
    @location(2) size: f32,
    @location(3) rotation: f32,
    @location(4) tint: vec4f,
    @location(5) view: f32,
    // Where its picture starts in the sheet, and how wide and tall it is: the whole picture without one.
    @location(6) window: vec4f,
};

struct VertexOut {
    @builtin(position) clip: vec4f,
    @location(0) tint: vec4f,
    @location(1) uv: vec2f,
    // The lowest corner of the window and the highest, the same over the whole square.
    @location(2) @interpolate(flat) window: vec4f,
};

// Kept half a texel inside its window, as a sprite's read is: a pixel that lands on the boundary
// between two frames of a sheet would otherwise come back with a line of the frame next door.
${OFF_THE_SEAM_WGSL}
fn insideWindow(uv: vec2f, window: vec4f) -> vec2f {
    let texel = 0.5 / vec2f(textureDimensions(particleTexture, 0));
    let lowest = window.xy + texel;
    // Guarded for a window thinner than one texel, where the two would cross over.
    let highest = max(lowest, window.zw - texel);
    // A read on a seam takes the same texel on both cards, as a sprite's does.
    return clamp(offTheSeam(uv, vec2f(textureDimensions(particleTexture, 0))), lowest, highest);
}

@vertex
fn vs(@location(0) corner: vec2f, inst: Instance) -> VertexOut {
    // Square, and turned about its own middle: there is no anchor here because a particle has
    // nothing to stand on.
    let local = corner * inst.size;
    let c = cos(inst.rotation);
    let s = sin(inst.rotation);
    let turned = vec2f(local.x * c - local.y * s, local.x * s + local.y * c);
    let pixel = inst.position + turned;

    // World pixels to screen pixels through the view, which must match what a sprite does or a
    // cloud would drift against the things it was meant to be part of.
    let view = u.views[u32(inst.view)];
    let fromCamera = pixel - view.position;
    let vc = cos(-view.rotation);
    let vs = sin(-view.rotation);
    let screen = vec2f(fromCamera.x * vc - fromCamera.y * vs, fromCamera.x * vs + fromCamera.y * vc) * view.zoom;

    let clip = screen / u.resolution * 2.0 - 1.0;

    var out: VertexOut;
    out.clip = vec4f(clip.x, -clip.y, 0.0, 1.0);
    out.tint = inst.tint;
    out.uv = inst.window.xy + (corner + 0.5) * inst.window.zw;
    out.window = vec4f(inst.window.xy, inst.window.xy + inst.window.zw);
    return out;
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
    return textureSample(particleTexture, particleSampler, insideWindow(in.uv, in.window)) * in.tint;
}
`;
