/**
 * The twin of `MODEL_CORNERS_WGSL` in webgpu/mesh/model_shading_wgsl.ts, which says what each does:
 * `snapToGrid` and `affineUvOf` here, `ambientFacing`, `roundReflectionUv` and `cubeReflectionUv` in
 * `MODEL_REFLECTION_GLSL`, read by a model's shader and handed to a kind together as
 * `context.shading.glsl`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MODEL_CORNERS_GLSL = /* glsl */ `
vec4 snapToGrid(vec4 clip, vec2 grid) {
    if (grid.x <= 0.0 || clip.w <= 0.0) {
        return clip;
    }
    vec2 halfGrid = grid * 0.5;
    vec2 snapped = floor(clip.xy / clip.w * halfGrid + 0.5) / halfGrid;
    return vec4(snapped * clip.w, clip.z, clip.w);
}

vec3 affineUvOf(vec2 uv, vec4 clip, bool affine) {
    float k = affine ? clip.w : 1.0;
    return vec3(uv * k, k);
}

`;

/**
 * The pixel half of `MODEL_SHADING_GLSL`: `ambientFacing`, `roundReflectionUv` and `cubeReflectionUv`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MODEL_REFLECTION_GLSL = /* glsl */ `
vec3 ambientFacing(vec3 normal, vec4 ambient, vec4 ground) {
    if (mod(ground.w, 2.0) < 0.5) {
        return ambient.rgb;
    }
    float up = normal.y * 0.5 + 0.5;
    return mix(ground.rgb, ambient.rgb, ground.w > 1.5 ? 1.0 - up : up);
}

vec2 roundReflectionUv(vec3 ray, vec4 look, vec4 ground) {
    vec3 back = dot(look.xyz, look.xyz) > 0.5 ? look.xyz : vec3(0.0, 0.0, 1.0);
    vec3 across = cross(vec3(0.0, 1.0, 0.0), back);
    vec3 right = dot(across, across) > 0.000001 ? normalize(across) : vec3(1.0, 0.0, 0.0);
    vec3 up = cross(back, right);
    vec3 v = vec3(dot(ray, right), dot(ray, up) * (ground.w > 1.5 ? -1.0 : 1.0), dot(ray, back));
    float m = max(2.0 * sqrt(v.x * v.x + v.y * v.y + (v.z + 1.0) * (v.z + 1.0)), 0.0001);
    return vec2(v.x / m + 0.5, 0.5 - v.y / m);
}

vec2 cubeReflectionUv(vec3 ray) {
    vec3 a = abs(ray);
    vec2 cell = vec2(0.0, 0.0);
    vec3 forward = vec3(1.0, 0.0, 0.0);
    vec3 right = vec3(0.0, 0.0, 1.0);
    vec3 up = vec3(0.0, 1.0, 0.0);
    if (a.x >= a.y && a.x >= a.z) {
        if (ray.x < 0.0) {
            cell = vec2(1.0, 0.0);
            forward = vec3(-1.0, 0.0, 0.0);
            right = vec3(0.0, 0.0, -1.0);
        }
    } else if (a.y >= a.z) {
        right = vec3(1.0, 0.0, 0.0);
        if (ray.y > 0.0) {
            cell = vec2(2.0, 0.0);
            forward = vec3(0.0, 1.0, 0.0);
            up = vec3(0.0, 0.0, 1.0);
        } else {
            cell = vec2(0.0, 1.0);
            forward = vec3(0.0, -1.0, 0.0);
            up = vec3(0.0, 0.0, -1.0);
        }
    } else if (ray.z > 0.0) {
        cell = vec2(1.0, 1.0);
        forward = vec3(0.0, 0.0, 1.0);
        right = vec3(-1.0, 0.0, 0.0);
    } else {
        cell = vec2(2.0, 1.0);
        forward = vec3(0.0, 0.0, -1.0);
        right = vec3(1.0, 0.0, 0.0);
    }
    float depth = max(dot(ray, forward), 0.0001);
    vec2 face = clamp(vec2(0.5 + 0.5 * dot(ray, right) / depth, 0.5 - 0.5 * dot(ray, up) / depth), vec2(0.002), vec2(0.998));
    return (cell + face) / vec2(3.0, 2.0);
}
`;

/**
 * Both halves, as a kind is handed them (`context.shading`).
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MODEL_SHADING_GLSL = `${MODEL_CORNERS_GLSL}${MODEL_REFLECTION_GLSL}`;
