/**
 * The GLSL twin of `render/webgpu/sprite/sprite_shader.ts`. The two must draw the same picture, so
 * the arithmetic is copied line for line and only the language changes:
 *
 * - The uniforms are a `std140` block. With a `vec2` of padding after the resolution and views of
 *   `vec2 + float + float`, std140 lays it out byte for byte like the WGSL struct: 272 bytes, views
 *   from byte 16, 16 bytes each. The same `Float32Array` fills both.
 * - `textureSample(texture, sampler, uv)` is `texture(sampler2D, uv)`. The filtering still comes
 *   from a sampler object bound beside the texture, which is what `bindSampler` is for.
 * - The attribute locations are the same numbers as in the WebGPU pipeline.
 *
 * Anything changed in one of the two shaders has to be changed in the other.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;

// A view is how the world is looked at: through a camera, or straight in screen pixels. Slot 0 is
// always the screen (position 0, rotation 0, zoom 1).
struct View { vec2 position; float rotation; float zoom; };
layout(std140) uniform Uniforms {
    vec2 resolution;
    vec2 padding;
    View views[16];
} u;

layout(location = 0) in vec2 corner;
layout(location = 1) in vec2 position;
layout(location = 2) in vec2 size;
layout(location = 3) in float rotation;
layout(location = 4) in vec2 scale;
layout(location = 5) in vec4 tint;
layout(location = 6) in vec2 uvOffset;
layout(location = 7) in vec2 uvScale;
layout(location = 8) in vec2 anchor;
// which of u.views this sprite is drawn through, stored as a float like everything else here
layout(location = 9) in float view;

out vec4 vTint;
out vec2 vUv;
// xy the lowest corner of this sprite's window into the sheet, zw the highest. Flat: it belongs to
// the sprite and not to the corner. See its twin in webgpu/sprite/sprite_shader.ts for why.
flat out vec4 vWindow;

void main() {
    // corner goes from -0.5 to 0.5, and the anchor says which point of the quad sits on the position.
    vec2 local = (corner + 0.5 - anchor) * size * scale;
    float c = cos(rotation);
    float s = sin(rotation);
    vec2 turned = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
    vec2 pixel = position + turned;

    // world pixels -> screen pixels through the view. Must match applyView2d in render/shared.
    View v = u.views[int(view)];
    vec2 fromCamera = pixel - v.position;
    float vc = cos(-v.rotation);
    float vs = sin(-v.rotation);
    vec2 screen = vec2(fromCamera.x * vc - fromCamera.y * vs, fromCamera.x * vs + fromCamera.y * vc) * v.zoom;

    // screen pixels -> clip space (-1..1), flipping y so it grows downwards
    vec2 clip = screen / u.resolution * 2.0 - 1.0;

    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    vTint = tint;
    // the corner moved to 0..1 and cropped to the frame, exactly as in the WGSL
    vUv = (corner + 0.5) * uvScale + uvOffset;
    vec2 far = uvOffset + uvScale;
    // Lowest and highest rather than start and width, because a mirrored sprite has a negative one.
    vWindow = vec4(min(uvOffset, far), max(uvOffset, far));
}
`;

/**
 * Fragment half of `SPRITE_VERTEX_SHADER`: the texture multiplied by the tint, so an untextured
 * sprite (the white texel) comes out as its tint.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_FRAGMENT_HEAD_GLSL = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D spriteTexture;

in vec4 vTint;
in vec2 vUv;
flat in vec4 vWindow;
out vec4 fragColor;

// The read, kept inside the window so a pixel that landed on the boundary between two columns of
// the sheet cannot come back with the frame next door. Half a texel in is the middle of the
// outermost texel, so nothing visible is lost.
vec2 insideWindow(vec2 uv, vec4 window) {
    vec2 texel = 0.5 / vec2(textureSize(spriteTexture, 0));
    vec2 lowest = window.xy + texel;
    vec2 highest = max(lowest, window.zw - texel);
    return clamp(uv, lowest, highest);
}
`;

/**
 * The built-in ending. Split from the declarations above so a material's shader can keep those and
 * bring its own ending, sharing the value rather than copying the text.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_FRAGMENT_MAIN_GLSL = /* glsl */ `
void main() {
    fragColor = texture(spriteTexture, insideWindow(vUv, vWindow)) * vTint;
}
`;

/**
 * The whole built-in fragment half.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_FRAGMENT_SHADER = SPRITE_FRAGMENT_HEAD_GLSL + SPRITE_FRAGMENT_MAIN_GLSL;
