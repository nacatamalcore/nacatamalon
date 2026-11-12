/**
 * What a model's shader does that a plugin's kind of drawing can do the same way, in two halves: the
 * corners put on the style's grid and the picture stretched without depth (this one, for the corners),
 * and the ambient by facing and where a reflection lands (`MODEL_REFLECTION_WGSL`, for a pixel).
 * Each takes what it needs as arguments rather than reading a model's own uniforms, so a model's shader
 * reads them through it (`snapToPixels`, `affineUv`, `envUv`, `envCubeUv`) and a kind's reads them the
 * same: the two cannot drift. Handed to a kind together as `context.shading.wgsl`. The twin of
 * `MODEL_CORNERS_GLSL` in webgl2/mesh/model_shading_glsl.ts.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MODEL_CORNERS_WGSL = /* wgsl */ `
// A corner put on a coarse grid of the screen, the way the PlayStation drew: things shivered as they
// moved. grid is its columns and rows; zero columns is no snapping, and a corner behind the eye is
// left alone rather than divided by nothing.
fn snapToGrid(clip: vec4<f32>, grid: vec2<f32>) -> vec4<f32> {
    if (grid.x <= 0.0 || clip.w <= 0.0) {
        return clip;
    }
    let halfGrid = grid * 0.5;
    let snapped = floor(clip.xy / clip.w * halfGrid + 0.5) / halfGrid;
    return vec4<f32>(snapped * clip.w, clip.z, clip.w);
}

// Where in the picture a corner is, carried so the pixel can undo the card's depth correction when
// affine, the PlayStation's swimming pictures: the pixel reads uv.xy / uv.z. The card corrects every
// value it smears for depth; carrying uv times w and w itself, and dividing one by the other at the
// pixel, cancels that out. Not affine, the third number is one and the division gives back the
// corrected picture of always. A corner behind the eye keeps its w too: the card cuts the triangle at
// the near plane before dividing, smearing both numbers by the same amount.
fn affineUvOf(uv: vec2<f32>, clip: vec4<f32>, affine: bool) -> vec3<f32> {
    let k = select(1.0, clip.w, affine);
    return vec3<f32>(uv * k, k);
}

`;

/**
 * The pixel half of `MODEL_SHADING_WGSL`: the ambient a surface gets by the way it faces, and where a
 * reflection lands.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MODEL_REFLECTION_WGSL = /* wgsl */ `
// The light from all around at a surface facing normal (in the world, of length one): ambient's
// alone when the scene's has no ground, and from ground's colour facing straight down to ambient's
// facing straight up when it has one. Both are the lights block's own, ambient and ground;
// through the 2D camera, where the world's y runs down, up is the other way. A model works the same
// out at its corners (ambientAt and skyward in mesh_shader.ts, their twins).
fn ambientFacing(normal: vec3<f32>, ambient: vec4<f32>, ground: vec4<f32>) -> vec3<f32> {
    if (ground.w % 2.0 < 0.5) {
        return ambient.rgb;
    }
    let up = normal.y * 0.5 + 0.5;
    return mix(ground.rgb, ambient.rgb, select(up, 1.0 - up, ground.w > 1.5));
}

// Where a reflection lands on a round picture of the surroundings, the way the consoles laid chrome
// on. ray is the way the surface sends the eye's sight on, in the world: reflect(-toEye, normal),
// both of length one. It is turned to the camera's own axes first, so the middle of the picture is
// what is behind the camera whichever way it looks, and the rim, where the picture pinches to a point,
// is always behind the model. The camera's back is look (the lights block's); its up is the world's,
// so the sky stays up in the picture; looking straight up or down, the world's x stands in. ground is
// the lights block's too: through the 2D camera, where the world's y runs down, what shows above is the
// other way. Both zero keep the world's own axes.
fn roundReflectionUv(ray: vec3<f32>, look: vec4<f32>, ground: vec4<f32>) -> vec2<f32> {
    let back = select(vec3<f32>(0.0, 0.0, 1.0), look.xyz, dot(look.xyz, look.xyz) > 0.5);
    let across = cross(vec3<f32>(0.0, 1.0, 0.0), back);
    let right = select(vec3<f32>(1.0, 0.0, 0.0), normalize(across), dot(across, across) > 0.000001);
    let up = cross(back, right);
    let v = vec3<f32>(dot(ray, right), dot(ray, up) * select(1.0, -1.0, ground.w > 1.5), dot(ray, back));
    let m = max(2.0 * sqrt(v.x * v.x + v.y * v.y + (v.z + 1.0) * (v.z + 1.0)), 0.0001);
    return vec2<f32>(v.x / m + 0.5, 0.5 - v.y / m);
}

// Where a reflection lands on a picture of the surroundings drawn as the six faces of a cube, three
// across and two down (+x, -x, +y; -y, +z, -z), each seen from its middle by a camera of 90 degrees as
// useEnvironment draws them: in the world's own axes, so the same from wherever it is seen. ray as for
// the round one. Kept a hair inside each face, so a read never takes the next face's edge.
fn cubeReflectionUv(ray: vec3<f32>) -> vec2<f32> {
    let a = abs(ray);
    var cell = vec2<f32>(0.0, 0.0);
    var forward = vec3<f32>(1.0, 0.0, 0.0);
    var right = vec3<f32>(0.0, 0.0, 1.0);
    var up = vec3<f32>(0.0, 1.0, 0.0);
    if (a.x >= a.y && a.x >= a.z) {
        if (ray.x < 0.0) {
            cell = vec2<f32>(1.0, 0.0);
            forward = vec3<f32>(-1.0, 0.0, 0.0);
            right = vec3<f32>(0.0, 0.0, -1.0);
        }
    } else if (a.y >= a.z) {
        right = vec3<f32>(1.0, 0.0, 0.0);
        if (ray.y > 0.0) {
            cell = vec2<f32>(2.0, 0.0);
            forward = vec3<f32>(0.0, 1.0, 0.0);
            up = vec3<f32>(0.0, 0.0, 1.0);
        } else {
            cell = vec2<f32>(0.0, 1.0);
            forward = vec3<f32>(0.0, -1.0, 0.0);
            up = vec3<f32>(0.0, 0.0, -1.0);
        }
    } else if (ray.z > 0.0) {
        cell = vec2<f32>(1.0, 1.0);
        forward = vec3<f32>(0.0, 0.0, 1.0);
        right = vec3<f32>(-1.0, 0.0, 0.0);
    } else {
        cell = vec2<f32>(2.0, 1.0);
        forward = vec3<f32>(0.0, 0.0, -1.0);
        right = vec3<f32>(1.0, 0.0, 0.0);
    }
    let depth = max(dot(ray, forward), 0.0001);
    let face = clamp(vec2<f32>(0.5 + 0.5 * dot(ray, right) / depth, 0.5 - 0.5 * dot(ray, up) / depth), vec2<f32>(0.002), vec2<f32>(0.998));
    return (cell + face) / vec2<f32>(3.0, 2.0);
}
`;

/**
 * Both halves, as a kind is handed them (`context.shading`).
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MODEL_SHADING_WGSL = `${MODEL_CORNERS_WGSL}${MODEL_REFLECTION_WGSL}`;
