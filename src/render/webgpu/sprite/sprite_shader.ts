/**
 * Everything a sprite shader needs before it decides a colour: the views, the sheet, the instance,
 * and the vertex that places the quad.
 *
 * Split out rather than written twice because a material's shader starts with exactly this. Shared
 * and not copied, so "the same preamble" is true by construction: a copy that drifted would show up
 * as an effect that is also in the wrong place, which reads as two bugs and is one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_SHADER_HEAD = /* wgsl */ `
// A view is how the world is looked at: through a camera, or straight in screen pixels. Slot 0 is
// always the screen (position 0, rotation 0, zoom 1), so "no camera" runs the same arithmetic as a
// camera and there is no second path to keep in step.
//
// Laid out byte by byte: resolution at 0, 8 bytes of padding, then 16 views of 16 bytes each from
// byte 16. 272 bytes in total. The padding is a real field on purpose: without it the views start
// at byte 8, because a vec2f only asks for 4-byte alignment and browsers no longer insist on 16 for
// uniforms, and every camera is read shifted by one field (its y used as the zoom).
struct View { position: vec2f, rotation: f32, zoom: f32 };
const MAX_VIEWS = 16u;
struct Uniforms { resolution: vec2f, padding: vec2f, views: array<View, MAX_VIEWS> };
@group(0) @binding(0) var<uniform> u: Uniforms;

// group 1 changes per texture batch: a sprite without texture gets a single white texel
@group(1) @binding(0) var spriteSampler: sampler;
@group(1) @binding(1) var spriteTexture: texture_2d<f32>;

struct Instance {
    @location(1) position: vec2f,
    @location(2) size: vec2f,
    @location(3) rotation: f32,
    @location(4) scale: vec2f,
    @location(5) tint: vec4f,
    @location(6) uvOffset: vec2f,
    @location(7) uvScale: vec2f,
    @location(8) anchor: vec2f,
    // which of u.views this sprite is drawn through, stored as a float like everything else here
    @location(9) view: f32,
};

// Keeping the read inside the sprite's own window in the sheet.
//
// A sheet holds many frames side by side with nothing between them, and which texel a pixel reads
// is decided by where the quad landed. Put the quad on a half pixel, which happens the moment a
// centred text has an odd width or anything moves by the frame time, and the pixel at the edge asks
// for a point exactly on the boundary between two columns of the image. It gets the one next door:
// a one-pixel line of the neighbouring letter, beside the letter you asked for.
//
// So the read is kept half a texel inside the window. Half a texel is the middle of the outermost
// texel, which is the furthest the edge can be asked for while still meaning the same texel, so
// nothing visible is cut: what changes is only which side of the boundary a pixel that landed on
// the boundary falls.
//
// The window is carried flat, unchanged across the quad, because it belongs to the sprite and not
// to the corner. And it is read as a lowest and a highest rather than as an offset and a width,
// because a mirrored sprite has a negative width: spriteUvWindow folds flipping into the window,
// so its start can be on the right.
struct VertexOut {
    @builtin(position) clip: vec4f,
    @location(0) tint: vec4f,
    @location(1) uv: vec2f,
    // xy the lowest corner of this sprite's window into the sheet, zw the highest.
    @location(2) @interpolate(flat) window: vec4f,
};

// The read, kept inside the window so a pixel that landed on the boundary between two columns of
// the sheet cannot come back with the frame next door. Half a texel in is the middle of the
// outermost texel, so nothing visible is lost.
fn insideWindow(uv: vec2f, window: vec4f) -> vec2f {
    let texel = 0.5 / vec2f(textureDimensions(spriteTexture, 0));
    let lowest = window.xy + texel;
    // Guarded for a window thinner than one texel, where the two would cross over.
    let highest = max(lowest, window.zw - texel);
    return clamp(uv, lowest, highest);
}

@vertex
fn vs(@location(0) corner: vec2f, inst: Instance) -> VertexOut {
    // corner goes from -0.5 to 0.5, and the anchor says which point of the quad sits on the
    // position: 0.5, 0.5 is its middle (and the same as no anchor at all), 0.5, 1 is the bottom
    // edge, which is what makes a character stand on a floor and rotate like a pendulum.
    let local = (corner + 0.5 - inst.anchor) * inst.size * inst.scale;
    let c = cos(inst.rotation);
    let s = sin(inst.rotation);
    let turned = vec2f(local.x * c - local.y * s, local.x * s + local.y * c);
    let pixel = inst.position + turned;

    // world pixels -> screen pixels through the view: move to the camera, turn against it, then
    // magnify. The camera is undone in the reverse order an object is placed in. Must match
    // applyView2d in render/shared, which is where this is tested.
    let view = u.views[u32(inst.view)];
    let fromCamera = pixel - view.position;
    let vc = cos(-view.rotation);
    let vs = sin(-view.rotation);
    let screen = vec2f(fromCamera.x * vc - fromCamera.y * vs, fromCamera.x * vs + fromCamera.y * vc) * view.zoom;

    // screen pixels -> clip space (-1..1), flipping y so it grows downwards
    let clip = screen / u.resolution * 2.0 - 1.0;

    var out: VertexOut;
    out.clip = vec4f(clip.x, -clip.y, 0.0, 1.0);
    out.tint = inst.tint;
    // the corner, moved to 0..1: the top-left corner reads the top-left texel. A negative scale
    // mirrors the quad but not the uv, so the image mirrors with it.
    //
    // uvScale and uvOffset crop that: a full texture is scale 1 and offset 0, and half a
    // texture starting at its middle is scale (0.5, 1) and offset (0.5, 0). This is what lets
    // one image hold many frames.
    out.uv = (corner + 0.5) * inst.uvScale + inst.uvOffset;
    let far = inst.uvOffset + inst.uvScale;
    out.window = vec4f(min(inst.uvOffset, far), max(inst.uvOffset, far));
    return out;
}

`;

/**
 * The built-in ending: the sheet read where the corner says, multiplied by the sprite's own colour.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_SHADER_FRAGMENT = /* wgsl */ `@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
    return textureSample(spriteTexture, spriteSampler, insideWindow(in.uv, in.window)) * in.tint;
}
`;

/**
 * The whole built-in sprite shader.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_SHADER = SPRITE_SHADER_HEAD + SPRITE_SHADER_FRAGMENT;
