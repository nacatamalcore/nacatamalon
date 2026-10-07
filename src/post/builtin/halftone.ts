import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Prints the picture the way a comic or a newspaper did: dots that grow where it is dark
 * (`mode: 0`), or lines laid over each other as it darkens (`mode: 1`).
 *
 * The ink is black, or the picture's own colour as `color` goes to `1`. The paper is white.
 *
 * @param options `scale` is the size of one dot or the gap between lines, in game pixels; `angle`
 * turns the dot grid, in degrees.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * usePostProcess(halftone({ scale: 4, color: 1 }));
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const halftone = (options: { scale?: number; angle?: number; mode?: 0 | 1; color?: number } = {}): TBuiltinPostEffect<{
    scale: number; angle: number; mode: number; color: number;
}> => ({
    name: 'halftone',
    fragment: /* wgsl */ `
fn hatch(along: f32) -> f32 {
    return select(0.0, 1.0, fract(along / max(2.0, mu.scale)) < 0.25);
}

fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let place = uv * mu.resolution;
    let scale = max(1.0, mu.scale);
    var ink = 0.0;
    var shade = color.rgb;

    if (mu.mode < 0.5) {
        let angle = radians(mu.angle);
        let s = sin(angle);
        let c = cos(angle);
        let turned = vec2<f32>(c * place.x + s * place.y, -s * place.x + c * place.y);
        let inside = fract(turned / scale) - 0.5;
        let middle = (floor(turned / scale) + 0.5) * scale;
        let back = vec2<f32>(c * middle.x - s * middle.y, s * middle.x + c * middle.y);
        shade = sampleTexture(clamp(back / mu.resolution, vec2<f32>(0.0), vec2<f32>(1.0))).rgb;
        let dark = 1.0 - dot(shade, vec3<f32>(0.299, 0.587, 0.114));
        let r = sqrt(dark) * 0.71;
        ink = 1.0 - smoothstep(r - 0.06, r + 0.06, length(inside));
    } else {
        let lum = dot(color.rgb, vec3<f32>(0.299, 0.587, 0.114));
        if (lum < 0.8) { ink = max(ink, hatch(place.x + place.y)); }
        if (lum < 0.6) { ink = max(ink, hatch(place.x - place.y)); }
        if (lum < 0.4) { ink = max(ink, hatch(place.x + place.y - scale * 0.5)); }
        if (lum < 0.2) { ink = max(ink, hatch(place.x - place.y - scale * 0.5)); }
    }

    let inkColour = mix(vec3<f32>(0.0), shade, mu.color);
    return vec4<f32>(mix(vec3<f32>(1.0), inkColour, ink), color.a);
}
`,
    fragmentGlsl: /* glsl */ `
float hatch(float along) {
    return fract(along / max(2.0, mu.scale)) < 0.25 ? 1.0 : 0.0;
}

vec4 effect(vec4 color, vec2 uv) {
    vec2 place = uv * mu.resolution;
    float scale = max(1.0, mu.scale);
    float ink = 0.0;
    vec3 shade = color.rgb;

    if (mu.mode < 0.5) {
        float angle = radians(mu.angle);
        float s = sin(angle);
        float c = cos(angle);
        vec2 turned = vec2(c * place.x + s * place.y, -s * place.x + c * place.y);
        vec2 inside = fract(turned / scale) - 0.5;
        vec2 middle = (floor(turned / scale) + 0.5) * scale;
        vec2 back = vec2(c * middle.x - s * middle.y, s * middle.x + c * middle.y);
        shade = sampleTexture(clamp(back / mu.resolution, 0.0, 1.0)).rgb;
        float dark = 1.0 - dot(shade, vec3(0.299, 0.587, 0.114));
        float r = sqrt(dark) * 0.71;
        ink = 1.0 - smoothstep(r - 0.06, r + 0.06, length(inside));
    } else {
        float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        if (lum < 0.8) { ink = max(ink, hatch(place.x + place.y)); }
        if (lum < 0.6) { ink = max(ink, hatch(place.x - place.y)); }
        if (lum < 0.4) { ink = max(ink, hatch(place.x + place.y - scale * 0.5)); }
        if (lum < 0.2) { ink = max(ink, hatch(place.x - place.y - scale * 0.5)); }
    }

    vec3 inkColour = mix(vec3(0.0), shade, mu.color);
    return vec4(mix(vec3(1.0), inkColour, ink), color.a);
}
`,
    uniforms: {
        scale: options.scale ?? 4,
        angle: options.angle ?? 45,
        mode: options.mode ?? 0,
        color: options.color ?? 0,
    },
    uniformSig: { scale: 'f32', angle: 'f32', mode: 'f32', color: 'f32' },
});
