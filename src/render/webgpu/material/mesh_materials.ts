import { buildMeshMaterialShader, MESH_MATERIAL_GROUP } from './mesh_material_shader';
import { buildUniformLayout, writeUniformValues } from '../../shared/material_uniforms';
import { describeMeshPipeline, MESH_COLORS, MESH_CORNERS } from '../mesh/pipeline_state';
import type { TDrawShader } from '../../interface/draw/t_draw_material';
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
) => {
    const materialLayout = device.createBindGroupLayout({
        label: 'mesh material layout',
        entries: [{
            binding: 0,
            // Both stages, because a corner hook turns knobs as readily as a colour hook does.
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
        }],
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
    let slotBindGroups: Array<GPUBindGroup | undefined> = [];
    let capacity = 0;
    let used = 0;

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
        slotBindGroups = [];
        capacity = size;
    };

    const build = (material: TDrawShader): TCompiled => {
        const layout = buildUniformLayout(material.uniformSig ?? {});

        if (layout.floatCount > MAX_MATERIAL_FLOATS) {
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'mesh material'}" declares more parameters ` +
                `than fit in ${MESH_MATERIAL_STRIDE} bytes. It is drawing with the built-in shader instead.`,
            );
            return { pipeline: null, transparentPipeline: null, layout, failed: true };
        }

        const entry: TCompiled = { pipeline: null, transparentPipeline: null, layout, failed: false };
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
            code: buildMeshMaterialShader(material.fragment, material.vertex, material.uniformSig ?? {}),
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
        bind: (
            entry: TCompiled,
            uniforms: TUniformValues,
            overrides: TUniformValues | null,
            time: number,
            width: number,
            height: number,
        ): GPUBindGroup => {
            const slot = Math.min(used, capacity - 1);
            used += 1;

            values.fill(0, 0, entry.layout.floatCount);
            writeUniformValues(values, entry.layout, uniforms, time, width, height, overrides);
            device.queue.writeBuffer(
                slots as GPUBuffer,
                slot * MESH_MATERIAL_STRIDE,
                values.buffer,
                values.byteOffset,
                entry.layout.floatCount * 4,
            );

            let group = slotBindGroups[slot];
            if (group === undefined) {
                group = device.createBindGroup({
                    label: `mesh material slot ${slot}`,
                    layout: materialLayout,
                    entries: [{
                        binding: 0,
                        resource: {
                            buffer: slots as GPUBuffer,
                            offset: slot * MESH_MATERIAL_STRIDE,
                            size: MESH_MATERIAL_STRIDE,
                        },
                    }],
                });
                slotBindGroups[slot] = group;
            }
            return group;
        },
        group: MESH_MATERIAL_GROUP,
        destroy: (): void => {
            slots?.destroy();
            slots = null;
            slotBindGroups = [];
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
