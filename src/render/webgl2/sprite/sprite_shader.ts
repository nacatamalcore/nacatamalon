import { OFF_THE_SEAM_GLSL } from '../../shared/texel_seam';
import { DISTANCE_FIELD_RANGE } from '../../shared/distance_field';
import { MAX_VIEWS } from './write_sprite_instances';

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
 * With `batch` the view number is also read for the picture each sprite takes from its batch, which
 * it hands on to the fragment half.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const spriteVertexShader = (batch = false): string => /* glsl */ `#version 300 es
precision highp float;

// A view is how the world is looked at: through a camera, or straight in screen pixels. Slot 0 is
// always the screen (position 0, rotation 0, zoom 1).
struct View { vec2 position; float rotation; float zoom; };
layout(std140) uniform Uniforms {
    vec2 resolution;
    vec2 padding;
    View views[${MAX_VIEWS}];
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
// A repeated sprite: how many times its picture is laid across and down, and where the pattern
// starts, in pictures. 1, 1 and 0, 0 for one that does not repeat.
layout(location = 10) in vec2 tiles;
layout(location = 11) in vec2 shift;

${batch ? 'flat out int vTextureSlot;' : ''}
out vec4 vTint;
out vec2 vUv;
// xy the lowest corner of this sprite's window into the sheet, zw the highest. Flat: it belongs to
// the sprite and not to the corner. See its twin in webgpu/sprite/sprite_shader.ts for why.
flat out vec4 vWindow;
// 1 for a sprite whose read wraps round inside its window, laying its picture again and again.
flat out float vRepeat;
// Where this pixel is across the sprite as it is drawn, 0 to 1: what a material's localUv() reads.
out vec2 vAcross;

void main() {
    // corner goes from -0.5 to 0.5, and the anchor says which point of the quad sits on the position.
    vec2 local = (corner + 0.5 - anchor) * size * scale;
    float c = cos(rotation);
    float s = sin(rotation);
    vec2 turned = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
    vec2 pixel = position + turned;

    // world pixels -> screen pixels through the view. Must match applyView2d in render/shared.
    View v = u.views[int(view)${batch ? ` % ${MAX_VIEWS}` : ''}];
    vec2 fromCamera = pixel - v.position;
    float vc = cos(-v.rotation);
    float vs = sin(-v.rotation);
    vec2 screen = vec2(fromCamera.x * vc - fromCamera.y * vs, fromCamera.x * vs + fromCamera.y * vc) * v.zoom;

    // screen pixels -> clip space (-1..1), flipping y so it grows downwards
    vec2 clip = screen / u.resolution * 2.0 - 1.0;

    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    vTint = tint;
    ${batch ? `vTextureSlot = int(view) / ${MAX_VIEWS};` : ''}
    // the corner moved to 0..1 and cropped to the frame, exactly as in the WGSL
    // A repeated sprite runs across its picture as many times as tiles says, starting shift pictures in.
    vUv = ((corner + 0.5) * tiles + shift) * uvScale + uvOffset;
    vec2 far = uvOffset + uvScale;
    // Lowest and highest rather than start and width, because a mirrored sprite has a negative one.
    vWindow = vec4(min(uvOffset, far), max(uvOffset, far));
    vRepeat = (tiles != vec2(1.0) || shift != vec2(0.0)) ? 1.0 : 0.0;
    // The whole sprite, turned over with the picture when its frame is read the other way round.
    vAcross = mix(corner + 0.5, 0.5 - corner, vec2(lessThan(uvScale, vec2(0.0))));
}
`;

/**
 * The corners of a sprite of one picture, for the built-in ending, effects and masks.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_VERTEX_SHADER = spriteVertexShader();

/**
 * Fragment half of `SPRITE_VERTEX_SHADER`: the texture multiplied by the tint, so an untextured
 * sprite (the white texel) comes out as its tint.
 *
 * With `batch` it declares the batch's other pictures and the functions that pick one of them, and
 * measures the picture the sprite reads instead of the first.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const spriteFragmentHeadGlsl = (batch: { textures: string; helpers: string } | null = null): string => /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D spriteTexture;
${batch ? 'flat in int vTextureSlot;' : ''}
${batch?.textures ?? ''}
${batch?.helpers ?? ''}

in vec4 vTint;
in vec2 vUv;
flat in vec4 vWindow;
flat in float vRepeat;
out vec4 fragColor;

// The read, kept inside the window so a pixel that landed on the boundary between two columns of
// the sheet cannot come back with the frame next door. Half a texel in is the middle of the
// outermost texel, so nothing visible is lost. A repeated sprite's read runs on past its window,
// once for each time the picture is laid, and is wrapped back into it first.
${OFF_THE_SEAM_GLSL}
vec2 insideWindow(vec2 uv, vec4 window) {
    vec2 texel = 0.5 / vec2(${batch ? 'spriteDimensions(vTextureSlot)' : 'textureSize(spriteTexture, 0)'});
    vec2 size = window.zw - window.xy;
    vec2 read = vRepeat > 0.5 ? window.xy + (uv - window.xy) - floor((uv - window.xy) / size) * size : uv;
    // A read on a seam takes the same texel on both cards: see OFF_THE_SEAM_GLSL.
    read = offTheSeam(read, vec2(${batch ? 'spriteDimensions(vTextureSlot)' : 'textureSize(spriteTexture, 0)'}));
    vec2 lowest = window.xy + texel;
    vec2 highest = max(lowest, window.zw - texel);
    return clamp(read, lowest, highest);
}
`;

/**
 * The declarations for one picture, which an effect's shader starts with.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_FRAGMENT_HEAD_GLSL = spriteFragmentHeadGlsl();

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

/**
 * The GLSL twin of `DISTANCE_FIELD_COVERAGE`: how much of a pixel a distance-field read covers, with
 * the edge one screen pixel soft at whatever size the letter is drawn. Line for line the same
 * arithmetic, so a vector font's text looks the same on both backends.
 *
 * With `batch` the edge is measured on the picture the sprite reads, not on the first.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const distanceFieldCoverageGlsl = (batch = false): string => /* glsl */ `
const float DISTANCE_FIELD_RANGE = ${DISTANCE_FIELD_RANGE}.0;

float distanceFieldCoverage(vec4 sampled, vec2 uv) {
    float distance = max(min(sampled.r, sampled.g), min(max(sampled.r, sampled.g), sampled.b)) - 0.5;
    vec2 unit = vec2(DISTANCE_FIELD_RANGE) / vec2(${batch ? 'spriteDimensions(vTextureSlot)' : 'textureSize(spriteTexture, 0)'});
    vec2 screen = 1.0 / fwidth(uv);
    float range = max(0.5 * dot(unit, screen), 1.0);
    return clamp(distance * range + 0.5, 0.0, 1.0);
}
`;

/**
 * The coverage for one picture, which an effect on a vector font's letters uses.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const DISTANCE_FIELD_COVERAGE_GLSL = distanceFieldCoverageGlsl();

/**
 * The built-in ending for a distance field: the tint, as opaque as the edge says.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_DISTANCE_FIELD_MAIN_GLSL = /* glsl */ `
void main() {
    vec4 sampled = texture(spriteTexture, insideWindow(vUv, vWindow));
    fragColor = vec4(vTint.rgb, vTint.a * distanceFieldCoverage(sampled, vUv));
}
`;

/**
 * The whole fragment half for sprites cut from a distance field: a vector font's letters.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPRITE_DISTANCE_FIELD_FRAGMENT_SHADER = SPRITE_FRAGMENT_HEAD_GLSL + DISTANCE_FIELD_COVERAGE_GLSL + SPRITE_DISTANCE_FIELD_MAIN_GLSL;
