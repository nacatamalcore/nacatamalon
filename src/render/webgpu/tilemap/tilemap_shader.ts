/**
 * Everything a map's shader needs before it decides a colour.
 *
 * Split out because a layer with an effect of its own starts with exactly this. Shared and not
 * copied, so the two cannot drift: a preamble that had drifted would put the whole map somewhere
 * else, which reads as a camera bug rather than a shader one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const TILEMAP_SHADER_HEAD = /* wgsl */ `
// The same views as the sprite shader, and on purpose the same uniform buffer: a map and the
// characters walking over it have to be looked at through the same camera, and two copies of this
// table would be two chances to disagree.
struct View { position: vec2f, rotation: f32, zoom: f32 };
const MAX_VIEWS = 16u;
struct Uniforms { resolution: vec2f, padding: vec2f, views: array<View, MAX_VIEWS> };
@group(0) @binding(0) var<uniform> u: Uniforms;

// group 1 is the sheet, changed once per layer
@group(1) @binding(0) var tilesSampler: sampler;
@group(1) @binding(1) var tilesTexture: texture_2d<f32>;

// group 2 is what changes per layer: where the map is, its colour, and which view it looks through
struct Layer {
    position: vec2f,
    scale: vec2f,
    rotation: f32,
    view: f32,
    padding: vec2f,
    tint: vec4f,
};
@group(2) @binding(0) var<uniform> layer: Layer;

struct VertexOut {
    @builtin(position) clip: vec4f,
    @location(0) uv: vec2f,
};

// A cell's corner arrives already in its place inside the map, and carrying the piece of the sheet
// it shows. That is what lets a whole layer be one draw: a sprite says "one picture, here", and a
// thousand cells showing thirty different pieces cannot be said that way.
@vertex
fn vs(@location(0) corner: vec2f, @location(1) uv: vec2f) -> VertexOut {
    let scaled = corner * layer.scale;
    let c = cos(layer.rotation);
    let s = sin(layer.rotation);
    let turned = vec2f(scaled.x * c - scaled.y * s, scaled.x * s + scaled.y * c);
    let pixel = layer.position + turned;

    // world pixels -> screen pixels through the view. The same arithmetic as the sprite shader and
    // as applyView2d, which is where it is tested.
    let v = u.views[u32(layer.view)];
    let fromCamera = pixel - v.position;
    let vc = cos(-v.rotation);
    let vs = sin(-v.rotation);
    let screen = vec2f(fromCamera.x * vc - fromCamera.y * vs, fromCamera.x * vs + fromCamera.y * vc) * v.zoom;

    let clip = screen / u.resolution * 2.0 - 1.0;

    var out: VertexOut;
    out.clip = vec4f(clip.x, -clip.y, 0.0, 1.0);
    out.uv = uv;
    return out;
}

`;

/**
 * The built-in ending: the sheet read where the cell says, multiplied by the layer's colour.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const TILEMAP_SHADER_FRAGMENT = /* wgsl */ `@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
    return textureSample(tilesTexture, tilesSampler, in.uv) * layer.tint;
}
`;

/**
 * The whole built-in map shader.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const TILEMAP_SHADER = TILEMAP_SHADER_HEAD + TILEMAP_SHADER_FRAGMENT;
