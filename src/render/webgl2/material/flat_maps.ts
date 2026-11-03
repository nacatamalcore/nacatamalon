import { MAX_MATERIAL_MAPS } from '../../shared/material_maps';
import { textureWrapOf, wrapKey } from '../../shared/texture_wrap';
import { MESH_MAP_UNITS } from '../bindings';
import { toGlTexture } from '../texture';
import type { TDrawShader } from '../../interface/draw/t_draw_material';
import type { TTextureWrap } from '../../../materials';

/**
 * The extra maps of a sprite's or a map layer's material: a sampler and a reader per name the shader
 * uses, in the order it first reads them, which is the order they are bound in.
 *
 * Only those, and not all four as a model's: a material that reads none is drawn without binding
 * its units, so a sampler it declared and never read must not be there to see what was left on them.
 *
 * Not turned over, like a model's: a map is a picture loaded or painted, stored top row first, so it
 * is already the way up its `uv` is.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const flatMapsGlsl = (names: readonly string[]): string => {
    const slots = names.slice(0, MAX_MATERIAL_MAPS).map((_, i) => `uniform sampler2D flatMap${i};`).join('\n');
    const readers = names.map((name, i) =>
        `vec4 sampleMap_${name}(vec2 uv) {\n    return textureLod(flatMap${i}, uv, 0.0);\n}`).join('\n');
    return `${slots}\n${readers}`;
};

/**
 * Points a flat material's program at the units its maps are bound on. The same units a model's maps
 * use: every draw that reads them binds them first, so they are never read as something else left
 * them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const placeFlatMaps = (gl: WebGL2RenderingContext, program: WebGLProgram): void => {
    MESH_MAP_UNITS.forEach((unit, i) => {
        gl.uniform1i(gl.getUniformLocation(program, `flatMap${i}`), unit);
    });
};

/**
 * Binds a flat material's maps before its batch: what the white pixel, the samplers and the warning
 * about a missing map need, kept for the life of the game.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createFlatMapBinder = (gl: WebGL2RenderingContext) => {
    let white: WebGLTexture | null = null;
    const samplers = new Map<string, WebGLSampler>();
    const warned = new Set<string>();

    const whiteTexture = (): WebGLTexture => {
        if (white === null) {
            white = gl.createTexture();
            gl.activeTexture(gl.TEXTURE0 + MESH_MAP_UNITS[0]!);
            gl.bindTexture(gl.TEXTURE_2D, white);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
        }
        return white!;
    };

    // The card's name for each thing a picture can do past its edge.
    const wrapMode: Record<TTextureWrap, number> = { repeat: gl.REPEAT, clamp: gl.CLAMP_TO_EDGE, mirror: gl.MIRRORED_REPEAT };

    const samplerOf = (filter: 'nearest' | 'linear', u: TTextureWrap, v: TTextureWrap): WebGLSampler => {
        const key = wrapKey(filter, u, v);
        let sampler = samplers.get(key);
        if (sampler === undefined) {
            sampler = gl.createSampler();
            const mode = filter === 'linear' ? gl.LINEAR : gl.NEAREST;
            gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, mode);
            gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, mode);
            gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, wrapMode[u]);
            gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, wrapMode[v]);
            samplers.set(key, sampler);
        }
        return sampler;
    };

    return {
        /**
         * Binds the maps `mapNames` reads, in its order. A map the material does not carry, or one
         * still loading, reads as white, and what wears it is drawn anyway. A map with nothing said
         * about it is read as smoothly as the sheet it is drawn over (`smooth`).
         */
        bind: (material: TDrawShader, mapNames: readonly string[], smooth: boolean): void => {
            // A shader that reads none never looks at the units, so nothing is bound for it.
            if (mapNames.length === 0) {
                return;
            }
            MESH_MAP_UNITS.forEach((unit, i) => {
                const name = mapNames[i];
                const map = name === undefined ? undefined : material.maps?.[name];
                if (name !== undefined && map === undefined) {
                    const said = `${material.name ?? material.id} ${name}`;
                    if (!warned.has(said)) {
                        warned.add(said);
                        console.warn(`[NacatamalOn] the material "${material.name ?? 'flat material'}" reads the map '${name}' and has none by that name, so it reads as white. Add it to the material's maps.`);
                    }
                }
                const ready = map !== undefined && map.texture.status === 'ready' && map.texture.gpu !== null;
                const picture = ready ? toGlTexture(map.texture.gpu!) : whiteTexture();
                gl.activeTexture(gl.TEXTURE0 + unit);
                gl.bindTexture(gl.TEXTURE_2D, picture);
                const { u, v } = textureWrapOf(map ?? {});
                gl.bindSampler(unit, samplerOf((map?.smooth ?? smooth) ? 'linear' : 'nearest', u, v));
            });
            // The sheet is bound on the first unit next, by whoever drew this, and assumes it is active.
            gl.activeTexture(gl.TEXTURE0);
        },
        destroy: (): void => {
            if (white !== null) {
                gl.deleteTexture(white);
                white = null;
            }
            for (const sampler of samplers.values()) {
                gl.deleteSampler(sampler);
            }
            samplers.clear();
        },
    };
};

/**
 * What a flat material keeps to bind its maps.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFlatMapBinder = ReturnType<typeof createFlatMapBinder>;
