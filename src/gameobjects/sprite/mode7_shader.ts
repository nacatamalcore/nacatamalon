/**
 * The floor of `createMode7`, worked out for every pixel of it. The same arithmetic as
 * `mode7_points.ts`, which the CPU runs to place things on the floor and to turn a click into a
 * point of the map: the two have to agree, or a tree would stand off the road it was put on.
 *
 * In the floor's own pixels (`mu.size`, its size when it was made, which the CPU reads too, so the two
 * agree whatever the screen does afterwards): each row below the horizon is a line of the floor at
 * some distance ahead, `height · focal / rows below the horizon`, the lower the row the nearer.
 * Across the row, a pixel is as far to the side as its distance from the middle times `height / rows
 * below`. Turned by the camera's angle, that is the point of the map the pixel is looking at, in the
 * map's pixels, read from the floor's own picture. Above the horizon nothing is drawn, so whatever
 * is behind (a backdrop, a sky) shows.
 *
 * The console worked it out once per line; here it is once per pixel, which looks the same on a
 * flat floor and needs nothing from the CPU each frame.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MODE7_WGSL = /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let size = mu.size;
    let here = localUv() * size;
    let below = here.y - mu.horizon;
    if (below <= 0.0) {
        return vec4<f32>(0.0);
    }
    let focal = size.x * 0.5 / tan(radians(mu.fov) * 0.5);
    let ahead = mu.height * focal / below;
    let side = (here.x - size.x * 0.5) * mu.height / below;
    let forward = vec2<f32>(sin(mu.angle), -cos(mu.angle));
    let right = vec2<f32>(cos(mu.angle), sin(mu.angle));
    let seen = vec2<f32>(mu.x, mu.y) + forward * ahead + right * side;
    let across = seen / vec2<f32>(textureDimensions(spriteTexture, 0));

    var ground = mu.outside;
    if (mu.repeat > 0.5) {
        ground = sampleTexture(fract(across));
    } else if (all(across >= vec2<f32>(0.0)) && all(across <= vec2<f32>(1.0))) {
        ground = sampleTexture(across);
    }
    if (mu.hazeTo > mu.hazeFrom) {
        let haze = clamp((ahead - mu.hazeFrom) / (mu.hazeTo - mu.hazeFrom), 0.0, 1.0) * mu.hazeColor.a;
        ground = vec4<f32>(mix(ground.rgb, mu.hazeColor.rgb, haze), mix(ground.a, 1.0, haze));
    }
    return ground;
}
`;

/**
 * The same floor for WebGL2, line for line.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MODE7_GLSL = /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec2 size = mu.size;
    vec2 here = localUv() * size;
    float below = here.y - mu.horizon;
    if (below <= 0.0) {
        return vec4(0.0);
    }
    float focal = size.x * 0.5 / tan(radians(mu.fov) * 0.5);
    float ahead = mu.height * focal / below;
    float side = (here.x - size.x * 0.5) * mu.height / below;
    vec2 forward = vec2(sin(mu.angle), -cos(mu.angle));
    vec2 right = vec2(cos(mu.angle), sin(mu.angle));
    vec2 seen = vec2(mu.x, mu.y) + forward * ahead + right * side;
    vec2 across = seen / vec2(textureSize(spriteTexture, 0));

    vec4 ground = mu.outside;
    if (mu.repeat > 0.5) {
        ground = sampleTexture(fract(across));
    } else if (all(greaterThanEqual(across, vec2(0.0))) && all(lessThanEqual(across, vec2(1.0)))) {
        ground = sampleTexture(across);
    }
    if (mu.hazeTo > mu.hazeFrom) {
        float haze = clamp((ahead - mu.hazeFrom) / (mu.hazeTo - mu.hazeFrom), 0.0, 1.0) * mu.hazeColor.a;
        ground = vec4(mix(ground.rgb, mu.hazeColor.rgb, haze), mix(ground.a, 1.0, haze));
    }
    return ground;
}
`;
