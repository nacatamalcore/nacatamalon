import { buildMeshMaterialShader, buildMeshMaterialShadowShader, MESH_MATERIAL_GROUP, MESH_MATERIAL_JOINTS_BINDING } from './mesh_material_shader';
import { failWithLines } from './fail_with_lines';
import { buildUniformLayout, MAX_MATERIAL_FLOATS, writeUniformValues } from '../../shared/material_uniforms';
import { mapNamesOf, MAX_MATERIAL_MAPS } from '../../shared/material_maps';
import { textureWrapOf, wrapKey } from '../../shared/texture_wrap';
import { toGpuTexture } from '../texture';
import { describeMeshPipeline, MESH_BONES, MESH_COLORS, MESH_CORNERS, MESH_DETAIL } from '../mesh/pipeline_state';
import type { TDrawMaterial, TDrawShader } from '../../interface/draw/t_draw_material';
import type { TMeshPipeline } from '../mesh/types/t_mesh_pipeline';
import type { TUniformLayout } from '../../shared/material_uniforms';
import type { TCullMode, TUniformValues } from '../../../materials';

/**
 * Bytes between one model's parameters and the next. The same stride its placement already uses,
 * and for the same reason: the card will only point at a multiple of it.
 */
export const MESH_MATERIAL_STRIDE = 256;

type TCompiled = {
    pipeline: GPURenderPipeline | null;
    /**
     * The same effect for a see-through model, which writes no depth. Built with the other, from the same module.
     */
    transparentPipeline: GPURenderPipeline | null;
    layout: TUniformLayout;
    failed: boolean;
    /**
     * Still being compiled and checked, apart from the frame. Until it is, a model wearing it is not
     * drawn: drawn with the built-in shader it would show a frame with the wrong look, and drawn with
     * a pipeline that turns out to be broken it would take the whole pass down with it.
     */
    pending: boolean;
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
    const knobsEntry: GPUBindGroupLayoutEntry = {
        binding: 0,
        // Both stages, because a corner hook turns knobs as readily as a colour hook does.
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        // Where this model's numbers start is given at draw time, so a group depends only on the
        // maps it binds and not on which slot of the buffer this model landed in.
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: MESH_MATERIAL_STRIDE },
    };
    const materialLayout = device.createBindGroupLayout({
        label: 'mesh material layout',
        entries: [knobsEntry, ...mapEntries],
    });
    // The same group with the bones in it too, for a model that bends.
    const skinnedMaterialLayout = device.createBindGroupLayout({
        label: 'skinned mesh material layout',
        entries: [knobsEntry, ...mapEntries, {
            binding: MESH_MATERIAL_JOINTS_BINDING,
            visibility: GPUShaderStage.VERTEX,
            buffer: { type: 'read-only-storage' },
        }],
    });
    const pipelineLayout = device.createPipelineLayout({
        label: 'mesh material pipeline layout',
        // The first three are the ones the built-in pipeline already binds: the lights of the scene,
        // the picture, and this model's own numbers. A material changes the shader and nothing else.
        bindGroupLayouts: [layouts.lights, layouts.texture, layouts.uniforms, materialLayout],
    });
    const skinnedPipelineLayout = device.createPipelineLayout({
        label: 'skinned mesh material pipeline layout',
        bindGroupLayouts: [layouts.lights, layouts.texture, layouts.uniforms, skinnedMaterialLayout],
    });

    const compiled = new Map<string, TCompiled>();
    const values = new Float32Array(MAX_MATERIAL_FLOATS);

    let slots: GPUBuffer | null = null;
    let capacity = 0;
    let used = 0;

    /**
     * Bind groups by the four pictures and samplers they hold, and the bones for a model that bends.
     * Cleared when the buffer they point at is replaced, and when it grows past what a game with a
     * sensible number of maps would make.
     */
    const groups = new Map<string, GPUBindGroup>();
    const ids = new WeakMap<GPUTexture | GPUBuffer, number>();
    let nextId = 0;
    const idOf = (held: GPUTexture | GPUBuffer): number => {
        let id = ids.get(held);
        if (id === undefined) {
            id = nextId++;
            ids.set(held, id);
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

    const build = (material: TDrawShader, skinned: boolean, cull: TCullMode): TCompiled => {
        const layout = buildUniformLayout(material.uniformSig ?? {});
        const mapNames = mapNamesOf(material.fragment);

        // Too many numbers for its slot. Said once where it was made (`checkParameterRoom`).
        if (layout.floatCount > MAX_MATERIAL_FLOATS) {
            return { pipeline: null, transparentPipeline: null, layout, failed: true, pending: false, mapNames };
        }
        if (mapNames.length > MAX_MATERIAL_MAPS) {
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'mesh material'}" reads ${mapNames.length} maps ` +
                `(${mapNames.join(', ')}) and a material has ${MAX_MATERIAL_MAPS}. It is drawing with the built-in shader instead.`,
            );
            return { pipeline: null, transparentPipeline: null, layout, failed: true, pending: false, mapNames };
        }

        const entry: TCompiled = { pipeline: null, transparentPipeline: null, layout, failed: false, pending: true, mapNames };
        const fail = (reason: unknown): void => {
            if (entry.failed) {
                return;
            }
            entry.failed = true;
            entry.pending = false;
            entry.pipeline = null;
            entry.transparentPipeline = null;
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'mesh material'}" did not compile. ` +
                'It is drawing with the built-in shader instead.',
                reason,
            );
        };

        const kind = skinned ? 'skinned mesh material' : 'mesh material';
        // Caught here: what is wrong is said once below, in this engine's words and with its lines.
        device.pushErrorScope('validation');
        const module = device.createShaderModule({
            label: `${kind} ${material.name ?? material.id}`,
            code: buildMeshMaterialShader(material.fragment, material.vertex, material.uniformSig ?? {}, mapNames, skinned, cull),
        });
        void device.popErrorScope();
        const wiring = skinned ? skinnedPipelineLayout : pipelineLayout;
        // The detail run last, after the bones when there are any: slot 2 or 3 at draw time.
        const buffers = skinned ? [MESH_CORNERS, MESH_COLORS, MESH_BONES, MESH_DETAIL] : [MESH_CORNERS, MESH_COLORS, MESH_DETAIL];

        // Compiled and checked apart from the frame, and only used once the card says both are good.
        void Promise.all([
            device.createRenderPipelineAsync(describeMeshPipeline(`${kind} pipeline ${material.name ?? material.id}`, module, wiring, buffers, format, samples, true, cull)),
            device.createRenderPipelineAsync(describeMeshPipeline(`see-through ${kind} pipeline ${material.name ?? material.id}`, module, wiring, buffers, format, samples, false, cull)),
        ]).then(([solid, glass]) => {
            if (entry.failed) {
                return;
            }
            entry.pipeline = solid;
            entry.transparentPipeline = glass;
            entry.pending = false;
        }, (error: unknown) => failWithLines(module, error, fail));

        return entry;
    };

    /**
     * The shadows of materials that move their corners or are cut out of their pictures, by the same
     * key as the effects and whether they cut: the module,
     * `ready` once the card has said it compiled, or `null` once it has failed, so a hook that cannot
     * cast is drawn flat instead.
     */
    const shadows = new Map<string, { module: GPUShaderModule; layout: GPUBindGroupLayout; ready: boolean } | null>();

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
        /**
         * The compiled effect, for a model that bends (`skinned`) or one that does not, and for the
         * side of its triangles thrown away: each built the first time it is wanted.
         */
        get: (material: TDrawShader, skinned = false, cull: TCullMode = 'back'): TCompiled => {
            const key = `${skinned ? 'skinned ' : ''}${cull === 'back' ? '' : `cull ${cull} `}${JSON.stringify(material.uniformSig ?? {})} ${material.fragment ?? ''} ${material.vertex ?? ''}`;
            let entry = compiled.get(key);
            if (entry === undefined) {
                entry = build(material, skinned, cull);
                compiled.set(key, entry);
            }
            return entry;
        },
        /**
         * The shadow of a material with a corner hook: the hook moving the corners as it does when
         * the model is drawn, seen from the light. With `cuts`, also one with only a colour hook:
         * the pixels its picture and its hook leave out left out (see buildMeshMaterialShadowShader). With the material's group layout, which the
         * shadow binds in the same place. `null` when it did not compile: the model then casts its
         * file's shape, as it always did, and says so once.
         *
         * `'pending'` until the card has answered that it compiled, which it does a moment later:
         * a module that failed, used in the meantime, would throw the whole shadow pass away with
         * it, every caster in the map and not just this one. A model whose shadow is pending casts
         * nothing, as a model whose look is pending is not drawn.
         */
        shadow: (material: TDrawShader, skinned = false, cuts = false): { module: GPUShaderModule; layout: GPUBindGroupLayout } | 'pending' | null => {
            if (material.vertex === null && !(cuts && material.fragment !== null)) {
                return null;
            }
            const key = `${skinned ? 'skinned ' : ''}${cuts ? 'cut ' : ''}${JSON.stringify(material.uniformSig ?? {})} ${material.fragment ?? ''} ${material.vertex ?? ''}`;
            let held = shadows.get(key);
            if (held === undefined) {
                const mapNames = mapNamesOf(material.fragment);
                const cut = cuts ? { fragment: material.fragment } : null;
                // Caught here, as the effect's is: the warning below says it once, in this engine's
                // words, rather than the card printing it on its own as well.
                device.pushErrorScope('validation');
                const module = device.createShaderModule({
                    label: `${skinned ? 'skinned ' : ''}${cuts ? 'cut ' : ''}mesh material shadow ${material.name ?? material.id}`,
                    code: buildMeshMaterialShadowShader(material.vertex, material.uniformSig ?? {}, mapNames, skinned, cut),
                });
                void device.popErrorScope();
                const made = { module, layout: skinned ? skinnedMaterialLayout : materialLayout, ready: false };
                held = made;
                shadows.set(key, made);
                void module.getCompilationInfo().then((info) => {
                    const bad = info.messages.filter((message) => message.type === 'error');
                    if (bad.length === 0) {
                        made.ready = true;
                    } else {
                        shadows.set(key, null);
                        console.warn(
                            `[NacatamalOn] the shadow of the material "${material.name ?? 'mesh material'}" did not compile, so it casts the shape of its file${cuts ? ', cut by its picture alone' : ''}. ` +
                            'Its hooks read something only the drawn model has.',
                            bad.map((message) => `${message.lineNum}: ${message.message}`).join('\n'),
                        );
                    }
                });
            }
            return held === null ? null : held.ready ? held : 'pending';
        },
        /**
         * Writes this model's numbers into a slot of their own and gives back the group that binds its
         * maps, with the offset of that slot to pass alongside it.
         *
         * A map the shader reads and the material does not have, or one still loading, reads as white:
         * a map is a second picture, and a model should not vanish while one is on its way.
         *
         * `joints` is a bending model's bones, this frame's, bound in the same group; `null` for one
         * that does not bend.
         */
        bind: (
            entry: TCompiled,
            material: TDrawMaterial,
            defaultSmooth: boolean,
            overrides: TUniformValues | null,
            time: number,
            width: number,
            height: number,
            joints: GPUBuffer | null = null,
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

            const key = views.map((view, i) => `${idOf(view)} ${samplers[i]}`).join('|') + (joints === null ? '' : `|bones ${idOf(joints)}`);
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
                if (joints !== null) {
                    entries.push({ binding: MESH_MATERIAL_JOINTS_BINDING, resource: { buffer: joints } });
                }
                group = device.createBindGroup({
                    label: joints === null ? 'mesh material' : 'skinned mesh material',
                    layout: joints === null ? materialLayout : skinnedMaterialLayout,
                    entries,
                });
                groups.set(key, group);
            }
            return { group, offset: slot * MESH_MATERIAL_STRIDE };
        },
        group: MESH_MATERIAL_GROUP,
        destroy: (): void => {
            slots?.destroy();
            slots = null;
            groups.clear();
            shadows.clear();
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
