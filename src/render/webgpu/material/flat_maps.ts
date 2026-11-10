import { MAX_MATERIAL_MAPS } from '../../shared/material_maps';

/**
 * The extra maps of a sprite's or a map layer's material, in the group its knobs are in: always all
 * four slots after the knobs, so every flat material shader has the same layout, and one reader per
 * name the shader uses, in the order it first reads them, which is the order they are bound in.
 *
 * The same `sampleMap_<name>` and `sampleMapScaled_<name>` a model's material reads, so a hook
 * written for one reads its maps the same way on the other. Both read the picture itself, never one
 * of its mipmaps: what is flat is drawn at the size it is, so the scale changes nothing here.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const flatMapsWgsl = (group: number, names: readonly string[]): string => {
    const slots = Array.from({ length: MAX_MATERIAL_MAPS }, (_, i) =>
        `@group(${group}) @binding(${1 + i * 2}) var mapSampler${i}: sampler;\n` +
        `@group(${group}) @binding(${2 + i * 2}) var mapTexture${i}: texture_2d<f32>;`).join('\n');
    const readers = names.map((name, i) =>
        `fn sampleMap_${name}(uv: vec2f) -> vec4f {\n    return textureSampleLevel(mapTexture${i}, mapSampler${i}, uv, 0.0);\n}\n` +
        `fn sampleMapScaled_${name}(uv: vec2f, scale: vec2f) -> vec4f {\n    return sampleMap_${name}(uv);\n}`).join('\n');
    return `${slots}\n${readers}`;
};
