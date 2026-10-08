import { buildMeshMaterialShader, MESH_MATERIAL_GROUP } from './mesh_material_shader';
import { buildUniformLayout, writeUniformValues } from '../../shared/material_uniforms';
import { mapNamesOf, MAX_MATERIAL_MAPS } from '../../shared/material_maps';
import { textureWrapOf, wrapKey } from '../../shared/texture_wrap';
import { toGpuTexture } from '../texture';
import { describeMeshPipeline, MESH_COLORS, MESH_CORNERS } from '../mesh/pipeline_state';
import type { TDrawMaterial, TDrawShader } from '../../interface/draw/t_draw_material';
import type { TMeshPipeline } from '../mesh/types/t_mesh_pipeline';
import type { TUniformLayout } from '../../shared/material_uniforms';
import type { TUniformValues } from '../../../materials';

/**
 * Bytes between one model's parameters and the next. The same stride its placement already uses,
 * and for the same reason: the card will only point at a multiple of it.
 */
export const MESH_MATERIAL_STRIDE = 256;

/**
 * How many numbers that leaves, which is what a material may not exceed.
 */
const MAX_MATERIAL_FLOATS = MESH_MATERIAL_STRIDE / 4;

type TCompiled = {
    pipeline: GPURenderPipeline | null;
    /**
     * The same effect for a see-through model, which writes no depth. Built with the other, from the same module.
     */
    transparentPipeline: GPURenderPipeline | null;
    layout: TUniformLayout;
    failed: boolean;
    /**
     * The maps the shader reads, in the order of their slots.
     */
    mapNames: string[];
};

/**
 * Every model effect this game has compiled, and the numbers they are drawn with.
 *
 * Kept by source, like the sprites', so two materials running the same effect are one compile.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createMeshMaterials = (
    device: GPUDevice,
    format: GPUTextureFormat,
    samples: number,
    layouts: TMeshPipeline['layouts'],
    whiteTexture: GPUTexture,
    wrapSamplers: Map<string, GPUSampler>,
) => {
    const mapEntries: GPUBindGroupLayoutEntry[] = [];
    for (let i = 0; i < MAX_MATERIAL_MAPS; i++) {
        mapEntries.push(
            { binding: 1 + i * 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            { binding: 2 + i * 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        );
    }
    const materialLayout = device.createBindGroupLayout({
        label: 'mesh material layout',
        entries: [{
            binding: 0,
            // Both stages, because a corner hook turns knobs as readily as a colour hook does.
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            // Where this model's numbers start is given at draw time, so a group depends only on the
            // maps it binds and not on which slot of the buffer this model landed in.
            buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: MESH_MATERIAL_STRIDE },
        }, ...mapEntries],
    });
    const pipelineLayout = device.createPipelineLayout({
        label: 'mesh material pipeline layout',
        // The first three are the ones the built-in pipeline already binds: the lights of the scene,
        // the picture, and this model's own numbers. A material changes the shader and nothing else.
        bindGroupLayouts: [layouts.lights, layouts.texture, layouts.uniforms, materialLayout],
    });

    const compiled = new Map<string, TCompiled>();
    const values = new Float32Array(MAX_MATERIAL_FLOATS);

    let slots: GPUBuffer | null = null;
    let capacity = 0;
    let used = 0;

    /**
     * Bind groups by the four pictures and samplers they hold. Cleared when the buffer they point at
     * is replaced, and when it grows past what a game with a sensible number of maps would make.
     */
    const groups = new Map<string, GPUBindGroup>();
    const ids = new WeakMap<GPUTexture, number>();
    let nextId = 0;
    const idOf = (texture: GPUTexture): number => {
        let id = ids.get(texture);
        if (id === undefined) {
            id = nextId++;
            ids.set(texture, id);
        }
        return id;
    };
    const warned = new Set<string>();

    const grow = (needed: number): void => {
        let size = Math.max(capacity === 0 ? 8 : capacity, 1);
        while (size < needed) {
            size *= 2;
        }
        slots?.destroy();
        slots = device.createBuffer({
            label: 'mesh material parameters',
            size: size * MESH_MATERIAL_STRIDE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        groups.clear();
        capacity = size;
    };

    const build = (material: TDrawShader): TCompiled => {
        const layout = buildUniformLayout(material.uniformSig ?? {});
        const mapNames = mapNamesOf(material.fragment);

        if (layout.floatCount > MAX_MATERIAL_FLOATS) {
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'mesh material'}" declares more parameters ` +
                `than fit in ${MESH_MATERIAL_STRIDE} bytes. It is drawing with the built-in shader instead.`,
            );
            return { pipeline: null, transparentPipeline: null, layout, failed: true, mapNames };
        }
        if (mapNames.length > MAX_MATERIAL_MAPS) {
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'mesh material'}" reads ${mapNames.length} maps ` +
                `(${mapNames.join(', ')}) and a material has ${MAX_MATERIAL_MAPS}. It is drawing with the built-in shader instead.`,
            );
            return { pipeline: null, transparentPipeline: null, layout, failed: true, mapNames };
        }

        const entry: TCompiled = { pipeline: null, transparentPipeline: null, layout, failed: false, mapNames };
        const fail = (reason: unknown): void => {
            if (entry.failed) {
                return;
            }
            entry.failed = true;
            entry.pipeline = null;
            entry.transparentPipeline = null;
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'mesh material'}" did not compile. ` +
                'It is drawing with the built-in shader instead.',
                reason,
            );
        };

        const module = device.createShaderModule({
            label: `mesh material ${material.name ?? material.id}`,
            code: buildMeshMaterialShader(material.fragment, material.vertex, material.uniformSig ?? {}, mapNames),
        });

        device.pushErrorScope('validation');
        entry.pipeline = device.createRenderPipeline(describeMeshPipeline(
            `mesh material pipeline ${material.name ?? material.id}`,
            module,
            pipelineLayout,
            [MESH_CORNERS, MESH_COLORS],
            format,
            samples,
        ));
        entry.transparentPipeline = device.createRenderPipeline(describeMeshPipeline(
            `see-through mesh material pipeline ${material.name ?? material.id}`,
            module,
            pipelineLayout,
            [MESH_CORNERS, MESH_COLORS],
            format,
            samples,
            false,
        ));
        void device.popErrorScope().then((error) => {
            if (error !== null) {
                fail(error.message);
            }
        });
        void module.getCompilationInfo().then((info) => {
            const bad = info.messages.filter((message) => message.type === 'error');
            if (bad.length > 0) {
                fail(bad.map((message) => `${message.lineNum}: ${message.message}`).join('\n'));
            }
        });

        return entry;
    };

    return {
        /**
         * Frees every slot and makes room for this frame's, before anything is drawn.
         */
        beginFrame: (models: number): void => {
            used = 0;
            if (models > capacity) {
                grow(models);
            }
        },
        get: (material: TDrawShader): TCompiled => {
            const key = `${JSON.stringify(material.uniformSig ?? {})} ${material.fragment ?? ''} ${material.vertex ?? ''}`;
            let entry = compiled.get(key);
            if (entry === undefined) {
                entry = build(material);
                compiled.set(key, entry);
            }
            return entry;
        },
        /**
         * Writes this model's numbers into a slot of their own and gives back the group that binds its
         * maps, with the offset of that slot to pass alongside it.
         *
         * A map the shader reads and the material does not have, or one still loading, reads as white:
         * a map is a second picture, and a model should not vanish while one is on its way.
         */
        bind: (
            entry: TCompiled,
            material: TDrawMaterial,
            defaultSmooth: boolean,
            overrides: TUniformValues | null,
            time: number,
            width: number,
            height: number,
        ): { group: GPUBindGroup; offset: number } => {
            const slot = Math.min(used, capacity - 1);
            used += 1;

            values.fill(0, 0, entry.layout.floatCount);
            writeUniformValues(values, entry.layout, material.uniforms ?? {}, time, width, height, overrides);
            device.queue.writeBuffer(
                slots as GPUBuffer,
                slot * MESH_MATERIAL_STRIDE,
                values.buffer,
                values.byteOffset,
                entry.layout.floatCount * 4,
            );

            const views: GPUTexture[] = [];
            const samplers: string[] = [];
            for (let i = 0; i < MAX_MATERIAL_MAPS; i++) {
                const name = entry.mapNames[i];
                const map = name === undefined ? undefined : material.maps?.[name];
                if (name !== undefined && map === undefined) {
                    const said = `${material.name ?? material.id} ${name}`;
                    if (!warned.has(said)) {
                        warned.add(said);
                        console.warn(`[NacatamalOn] the material "${material.name ?? 'mesh material'}" reads the map '${name}' and has none by that name, so it reads as white. Add it to the material's maps.`);
                    }
                }
                const ready = map !== undefined && map.texture.status === 'ready' && map.texture.gpu !== null;
                views.push(ready ? toGpuTexture(map.texture.gpu!) : whiteTexture);
                const filter = (map?.smooth ?? material.smooth ?? defaultSmooth) ? 'linear' : 'nearest';
                const { u, v } = textureWrapOf(map ?? {});
                samplers.push(wrapKey(filter, u, v));
            }

            const key = views.map((view, i) => `${idOf(view)} ${samplers[i]}`).join('|');
            let group = groups.get(key);
            if (group === undefined) {
                if (groups.size > 512) {
                    groups.clear();
                }
                const entries: GPUBindGroupEntry[] = [{
                    binding: 0,
                    resource: { buffer: slots as GPUBuffer, offset: 0, size: MESH_MATERIAL_STRIDE },
                }];
                for (let i = 0; i < MAX_MATERIAL_MAPS; i++) {
                    entries.push(
                        { binding: 1 + i * 2, resource: wrapSamplers.get(samplers[i]!)! },
                        { binding: 2 + i * 2, resource: views[i]!.createView() },
                    );
                }
                group = device.createBindGroup({ label: 'mesh material', layout: materialLayout, entries });
                groups.set(key, group);
            }
            return { group, offset: slot * MESH_MATERIAL_STRIDE };
        },
        group: MESH_MATERIAL_GROUP,
        destroy: (): void => {
            slots?.destroy();
            slots = null;
            groups.clear();
            capacity = 0;
        },
    };
};

/**
 * Everything a game keeps for its model effects.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeshMaterials = ReturnType<typeof createMeshMaterials>;
