
import { buildUniformLayout, writeUniformValues } from '../../shared/material_uniforms';
import { FLAT_DEPTH } from '../frame/depth';
import type { TDrawShader } from '../../interface/draw/t_draw_material';
import type { TUniformLayout } from '../../shared/material_uniforms';
import type { TUniformSignature, TUniformValues } from '../../../materials';

/**
 * What tells one flat pipeline from another: the groups it already binds, the corners it reads, how
 * they are joined up, and which builder writes its shader.
 *
 * A sprite and a map's layer differ in those four and in nothing else, so they share everything
 * below rather than having one of these apiece.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFlatMaterialKind = {
    label: string;
    format: GPUTextureFormat;
    /**
     * How many samples per pixel the passes it draws in have, as the built-in pipeline.
     */
    samples: number;
    /**
     * The groups the built-in pipeline already binds. The knobs go in the one after them.
     */
    shared: GPUBindGroupLayout[];
    vertexBuffers: GPUVertexBufferLayout[];
    topology: GPUPrimitiveTopology;
    build: (fragment: string, sig: TUniformSignature) => string;
};

/**
 * Bytes between one batch's parameters and the next.
 *
 * Not chosen: the card will only point at an offset that is a multiple of this. Sixty-four numbers
 * fit exactly, which is far more knobs than an effect has, and the same number the models already
 * use for theirs.
 */
export const FLAT_MATERIAL_STRIDE = 256;

/**
 * How many numbers that leaves, which is what a material may not exceed.
 */
const MAX_MATERIAL_FLOATS = FLAT_MATERIAL_STRIDE / 4;

/**
 * One compiled effect, or the record that it would not compile.
 */
type TCompiled = {
    pipeline: GPURenderPipeline | null;
    layout: TUniformLayout;
    /**
     * Once true, this material is drawn with the built-in shader and nothing is tried again.
     */
    failed: boolean;
};

/**
 * Every sprite effect this game has compiled, and the numbers they are drawn with.
 *
 * **Compiled effects are kept by their source, not by the material that carried it.** Two materials
 * running the same shader are then one compile rather than two, which is the point of an effect
 * being shareable at all. Keeping them by material would be simpler and would quietly compile the
 * identical text once per material that used it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createFlatMaterials = (device: GPUDevice, kind: TFlatMaterialKind) => {
    const materialLayout = device.createBindGroupLayout({
        label: `${kind.label} material layout`,
        entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    const pipelineLayout = device.createPipelineLayout({
        label: `${kind.label} material pipeline layout`,
        // The shared ones first, exactly as the built-in pipeline binds them, and the knobs last.
        bindGroupLayouts: [...kind.shared, materialLayout],
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
            label: 'flat material parameters',
            size: size * FLAT_MATERIAL_STRIDE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        // Every group pinned to the old buffer now points at nothing, so they all go.
        slotBindGroups = [];
        capacity = size;
    };

    const build = (material: TDrawShader): TCompiled => {
        const layout = buildUniformLayout(material.uniformSig ?? {});
        const source = material.fragment as string;

        if (layout.floatCount > MAX_MATERIAL_FLOATS) {
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'flat material'}" declares more parameters ` +
                `than fit in ${FLAT_MATERIAL_STRIDE} bytes. It is drawing with the built-in shader instead.`,
            );
            return { pipeline: null, layout, failed: true };
        }

        const entry: TCompiled = { pipeline: null, layout, failed: false };
        const fail = (reason: unknown): void => {
            if (entry.failed) {
                return;
            }
            entry.failed = true;
            entry.pipeline = null;
            console.warn(
                `[NacatamalOn] the material "${material.name ?? 'flat material'}" did not compile. ` +
                'It is drawing with the built-in shader instead.',
                reason,
            );
        };

        const module = device.createShaderModule({
            label: `flat material ${material.name ?? material.id}`,
            code: kind.build(source, material.uniformSig ?? {}),
        });

        // On this card a shader that will not compile is not an exception thrown here: it is
        // reported later, twice over, and either report is enough to give up on the effect.
        device.pushErrorScope('validation');
        entry.pipeline = device.createRenderPipeline({
            label: `flat material pipeline ${material.name ?? material.id}`,
            layout: pipelineLayout,
            vertex: { module, entryPoint: 'vs', buffers: kind.vertexBuffers },
            fragment: {
                module,
                entryPoint: 'fs',
                targets: [{
                    format: kind.format,
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    },
                }],
            },
            primitive: { topology: kind.topology },
            depthStencil: FLAT_DEPTH,
            multisample: { count: kind.samples },
        });
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
         * Frees every batch's slot and makes room for this frame's, **before anything is drawn**.
         *
         * Growing is what makes the order matter: it throws the old buffer away, and a draw already
         * recorded against it would be pointing at nothing by the time the frame is submitted. So
         * the count is asked for up front rather than grown into.
         */
        beginFrame: (batches: number): void => {
            used = 0;
            if (batches > capacity) {
                grow(batches);
            }
        },
        /**
         * The compiled effect for this material, compiling it the first time it is seen.
         *
         * A material with no WGSL of its own never reaches here: the caller checks that first,
         * because that is the ordinary case and it should cost nothing.
         */
        get: (material: TDrawShader): TCompiled => {
            const key = `${JSON.stringify(material.uniformSig ?? {})} ${material.fragment ?? ''}`;
            let entry = compiled.get(key);
            if (entry === undefined) {
                entry = build(material);
                compiled.set(key, entry);
            }
            return entry;
        },
        /**
         * Takes a slot, fills it with this batch's numbers, and hands back the group that reads it.
         *
         * The numbers are the material's, with the one sprite's own laid over them when it brought
         * any, which is what a property block is.
         */
        bind: (
            entry: TCompiled,
            uniforms: TUniformValues,
            overrides: TUniformValues | null,
            time: number,
            width: number,
            height: number,
        ): GPUBindGroup => {
            // `beginFrame` made room for every batch this frame has, so this cannot run out. If it
            // ever did, the last slot is reused rather than the buffer replaced mid-frame.
            const slot = Math.min(used, capacity - 1);
            used += 1;

            values.fill(0, 0, entry.layout.floatCount);
            writeUniformValues(values, entry.layout, uniforms, time, width, height, overrides);
            device.queue.writeBuffer(
                slots as GPUBuffer,
                slot * FLAT_MATERIAL_STRIDE,
                values.buffer,
                values.byteOffset,
                entry.layout.floatCount * 4,
            );

            let group = slotBindGroups[slot];
            if (group === undefined) {
                group = device.createBindGroup({
                    label: `flat material slot ${slot}`,
                    layout: materialLayout,
                    entries: [{
                        binding: 0,
                        resource: {
                            buffer: slots as GPUBuffer,
                            offset: slot * FLAT_MATERIAL_STRIDE,
                            size: FLAT_MATERIAL_STRIDE,
                        },
                    }],
                });
                slotBindGroups[slot] = group;
            }
            return group;
        },
        /**
         * Which group number the parameters are bound at, so the draw and the shader agree.
         */
        group: kind.shared.length,
        destroy: (): void => {
            slots?.destroy();
            slots = null;
            slotBindGroups = [];
            capacity = 0;
        },
    };
};

/**
 * Everything a game keeps for its sprite effects.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFlatMaterials = ReturnType<typeof createFlatMaterials>;

export type { TCompiled as TCompiledFlatMaterial };
