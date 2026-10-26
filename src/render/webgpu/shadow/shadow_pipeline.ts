import { MESH_BONES, MESH_COLORS, MESH_CORNERS, MESH_DETAIL } from '../mesh/pipeline_state';
import { cullOf } from '../../shared/cull_of';
import { SHADOW_DEPTH_BIAS, SHADOW_SLOPE_BIAS } from '../../shared/light_space';
import { SHADOW_FORMAT } from './shadow_map';
import { SHADOW_CUT_SKINNED_WGSL, SHADOW_CUT_WGSL, SHADOW_SKINNED_WGSL, SHADOW_WGSL } from './shadow_shader';
import { textureBindGroup } from '../mesh/draw_meshes';
import { toGpuBuffer } from '../resources';
import type { TDrawMaterial, TDrawMesh } from '../../interface';
import type { TMeshPipeline } from '../mesh/types/t_mesh_pipeline';

/**
 * One caster's slot: the light's matrix and the model's, which is the smallest a card will take.
 */
const SLOT = 256;

/**
 * How many of those are there to begin with, doubled from here as a scene needs more.
 */
const INITIAL_CASTERS = 32;

/**
 * The bones of a bending model, laid out exactly as the shape's own skin buffer already is.
 */
const SKIN_CORNERS: GPUVertexBufferLayout = {
    arrayStride: 32,
    stepMode: 'vertex',
    attributes: [
        { shaderLocation: 3, offset: 0, format: 'float32x4' },
        { shaderLocation: 4, offset: 16, format: 'float32x4' },
    ],
};

/**
 * Whether a caster may be drawn through its material's own shader, and so take one of the
 * materials' slots in the shadow pass: a hook that moves its corners, or a colour hook that cuts it
 * out. The frame counts these before the pass, to make the room and send the pass on its own.
 *
 * @internal
 */
export const castsThroughHook = (material: TDrawMaterial): boolean =>
    material.vertex !== null || ((material.alphaCutoff ?? 0) > 0 && material.fragment !== null);

/**
 * Everything the shadow pass draws with: two pipelines, and a slot per caster.
 *
 * Built the first time a frame has a light asking to cast, next to the map itself and for the same
 * reason. Two pipelines and not one because a model that bends has to cast **the pose it is in**,
 * and the bone blend happens in the corner stage: there is no way to have one pipeline do both.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createShadowPipeline = (device: GPUDevice) => {
    const uniformsLayout = device.createBindGroupLayout({
        label: 'shadow uniforms layout',
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });
    const jointsLayout = device.createBindGroupLayout({
        label: 'shadow skeleton layout',
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }],
    });

    /**
     * What both pipelines share. There is no `fragment` at all: nothing is being coloured, and the
     * card fills in depth by itself.
     *
     * The face culling is the same word the pass that lights the scene uses, so a shape casts what
     * it shows. Core culls here on one card and not on the other, which is a shape casting two
     * different shadows depending on the machine. A material that keeps another side keeps it here
     * too: a leaf drawn on both sides casts from both.
     */
    const describe = (label: string, module: GPUShaderModule, layout: GPUPipelineLayout, buffers: GPUVertexBufferLayout[], cull: GPUCullMode = 'back', cuts = false): GPURenderPipelineDescriptor => ({
        label,
        layout,
        vertex: { module, entryPoint: 'vs', buffers },
        // A caster cut out of its picture has a colour stage after all, writing no colour: it only
        // throws away the pixels its picture leaves out.
        ...(cuts ? { fragment: { module, entryPoint: 'fs', targets: [] } } : {}),
        primitive: { topology: 'triangle-list', cullMode: cull },
        depthStencil: {
            format: SHADOW_FORMAT,
            depthWriteEnabled: true,
            depthCompare: 'less',
            depthBias: SHADOW_DEPTH_BIAS,
            depthBiasSlopeScale: SHADOW_SLOPE_BIAS,
        },
    });

    const plain = device.createShaderModule({ label: 'shadow', code: SHADOW_WGSL });
    const bending = device.createShaderModule({ label: 'shadow skinned', code: SHADOW_SKINNED_WGSL });

    const plainLayout = device.createPipelineLayout({ bindGroupLayouts: [uniformsLayout] });
    const bendingLayout = device.createPipelineLayout({ bindGroupLayouts: [uniformsLayout, jointsLayout] });
    const pipeline = device.createRenderPipeline(describe('shadow', plain, plainLayout, [MESH_CORNERS]));
    const skinnedPipeline = device.createRenderPipeline(describe('shadow skinned', bending, bendingLayout, [MESH_CORNERS, SKIN_CORNERS]));

    // The other sides, made the first time a caster asks for one.
    const sides = new Map<'front' | 'none', { pipeline: GPURenderPipeline; skinnedPipeline: GPURenderPipeline }>();
    const sided = (cull: 'front' | 'none'): { pipeline: GPURenderPipeline; skinnedPipeline: GPURenderPipeline } => {
        let made = sides.get(cull);
        if (made === undefined) {
            made = {
                pipeline: device.createRenderPipeline(describe(`shadow, cull ${cull}`, plain, plainLayout, [MESH_CORNERS], cull)),
                skinnedPipeline: device.createRenderPipeline(describe(`shadow skinned, cull ${cull}`, bending, bendingLayout, [MESH_CORNERS, SKIN_CORNERS], cull)),
            };
            sides.set(cull, made);
        }
        return made;
    };

    // A material whose hook moves its corners casts through a shader of its own, built from that
    // hook (see buildMeshMaterialShadowShader): made the first time one casts, by its module and the
    // side its material throws away. Its own group sits where the material's always does, the
    // fourth, so the two between are bound empty. One cut out of its picture reads that picture in
    // the second, as the drawn model does, and has a colour stage that cuts.
    const empty = device.createBindGroupLayout({ label: 'shadow nothing', entries: [] });
    const nothing = device.createBindGroup({ label: 'shadow nothing', layout: empty, entries: [] });
    // Each compiled and checked apart from the frame, like the material's own: `'pending'` until
    // then, `null` if the card refused it.
    const hooked = new Map<GPUShaderModule, Map<string, GPURenderPipeline | 'pending' | null>>();
    const hookedPipeline = (
        module: GPUShaderModule,
        materialLayout: GPUBindGroupLayout,
        skinned: boolean,
        cull: GPUCullMode,
        textureLayout: GPUBindGroupLayout | null,
    ): GPURenderPipeline | 'pending' | null => {
        let byCull = hooked.get(module);
        if (byCull === undefined) {
            byCull = new Map();
            hooked.set(module, byCull);
        }
        const held = byCull.get(cull);
        if (held !== undefined) {
            return held;
        }
        const cache = byCull;
        cache.set(cull, 'pending');
        void device.createRenderPipelineAsync(describe(
            `material shadow${textureLayout === null ? '' : ' cut'}, cull ${cull}`,
            module,
            device.createPipelineLayout({
                bindGroupLayouts: textureLayout === null
                    ? [uniformsLayout, empty, empty, materialLayout]
                    : [cutUniformsLayout, textureLayout, empty, materialLayout],
            }),
            // The runs a material's pipeline reads, in its order: the bones before the detail.
            skinned ? [MESH_CORNERS, MESH_COLORS, MESH_BONES, MESH_DETAIL] : [MESH_CORNERS, MESH_COLORS, MESH_DETAIL],
            cull,
            textureLayout !== null,
        )).then((made) => { cache.set(cull, made); }, (error: unknown) => {
            cache.set(cull, null);
            console.warn('[NacatamalOn] a material\'s shadow could not be built, so it casts the shape of its file.', error);
        });
        return 'pending';
    };

    // A caster cut out of its picture (`alphaCutoff`) reads that picture, its tint's alpha and its
    // corners' colour, so its pipelines read more: made the first time one casts, by the side its
    // material throws away, with the model pass's own picture group. Its block is the usual two
    // matrices and how it is cut, read by both stages.
    const cutUniformsLayout = device.createBindGroupLayout({
        label: 'shadow cut uniforms layout',
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    let cutModules: { plain: GPUShaderModule; bending: GPUShaderModule } | null = null;
    const cutSides = new Map<GPUCullMode, { pipeline: GPURenderPipeline; skinnedPipeline: GPURenderPipeline }>();
    const cutPipelines = (textureLayout: GPUBindGroupLayout, cull: GPUCullMode): { pipeline: GPURenderPipeline; skinnedPipeline: GPURenderPipeline } => {
        let made = cutSides.get(cull);
        if (made === undefined) {
            cutModules ??= {
                plain: device.createShaderModule({ label: 'shadow cut', code: SHADOW_CUT_WGSL }),
                bending: device.createShaderModule({ label: 'shadow cut skinned', code: SHADOW_CUT_SKINNED_WGSL }),
            };
            made = {
                pipeline: device.createRenderPipeline(describe(
                    `shadow cut, cull ${cull}`, cutModules.plain,
                    device.createPipelineLayout({ bindGroupLayouts: [cutUniformsLayout, textureLayout] }),
                    [MESH_CORNERS, MESH_COLORS], cull, true,
                )),
                skinnedPipeline: device.createRenderPipeline(describe(
                    `shadow cut skinned, cull ${cull}`, cutModules.bending,
                    device.createPipelineLayout({ bindGroupLayouts: [cutUniformsLayout, jointsLayout, textureLayout] }),
                    [MESH_CORNERS, SKIN_CORNERS, MESH_COLORS], cull, true,
                )),
            };
            cutSides.set(cull, made);
        }
        return made;
    };

    let capacity = INITIAL_CASTERS;
    let buffer = device.createBuffer({
        label: 'shadow uniforms',
        size: capacity * SLOT,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    let groups: GPUBindGroup[] = [];
    let cutGroups: GPUBindGroup[] = [];
    // One place for the 36 numbers a caster needs (the last four only read when it is cut out),
    // written and sent one caster at a time. A frame with two hundred casters holds this and nothing
    // else.
    const slotData = new Float32Array(36);
    const jointGroups = new Map<string, { group: GPUBindGroup; buffer: GPUBuffer }>();

    const groupFor = (slot: number): GPUBindGroup => {
        groups[slot] ??= device.createBindGroup({
            label: `shadow uniforms ${slot}`,
            layout: uniformsLayout,
            entries: [{ binding: 0, resource: { buffer, offset: slot * SLOT, size: 128 } }],
        });
        return groups[slot];
    };
    const cutGroupFor = (slot: number): GPUBindGroup => {
        cutGroups[slot] ??= device.createBindGroup({
            label: `shadow cut uniforms ${slot}`,
            layout: cutUniformsLayout,
            entries: [{ binding: 0, resource: { buffer, offset: slot * SLOT, size: 144 } }],
        });
        return cutGroups[slot];
    };

    return {
        /**
         * Makes room for this frame's casters, before a single one is written.
         */
        beginFrame: (casters: number): void => {
            if (casters <= capacity) {
                return;
            }
            while (capacity < casters) {
                capacity *= 2;
            }
            buffer.destroy();
            buffer = device.createBuffer({
                label: 'shadow uniforms',
                size: capacity * SLOT,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            // The groups that are gone were pointing at the buffer that just went.
            groups = [];
            cutGroups = [];
        },

        /**
         * Draws one caster into the map, and says whether it drew.
         *
         * A shape with nothing on the card is skipped rather than drawn as something else, exactly
         * as it is in the pass that lights the scene.
         *
         * `time`, `width` and `height` are what a material's corner hook is told, as in that pass.
         */
        draw: (
            pass: GPURenderPassEncoder,
            meshes: TMeshPipeline,
            mesh: TDrawMesh,
            lightViewProj: Float32Array,
            model: Float32Array,
            slot: number,
            time = 0,
            width = 0,
            height = 0,
        ): boolean => {
            const geometry = mesh.geometry;
            if (geometry === null || geometry.vertexBuffer === null || geometry.indexBuffer === null || geometry.indexCount === 0) {
                return false;
            }

            slotData.set(lightViewProj, 0);
            slotData.set(model, 16);
            const surface = mesh.material;
            slotData[32] = surface.alphaCutoff ?? 0;
            slotData[33] = surface.alpha * surface.tint.a;
            device.queue.writeBuffer(buffer, slot * SLOT, slotData);

            const bends = mesh.skeleton !== null && geometry.skinBuffer !== null;
            const cull = cullOf(mesh);

            // Cut out of its picture, by the same alpha and cutoff the model is drawn with. A shape
            // with no painted colours on the card casts whole, as before cutting existed.
            const cuts = (surface.alphaCutoff ?? 0) > 0 && geometry.colorBuffer !== null;

            // A hook that moves the corners moves them here too, or the map holds the shape the file
            // made and that flat ghost shadows the model wherever the hook takes it behind. Cut out,
            // a colour hook casts through its own shader too: what it leaves out is left out here.
            const effect = (surface.vertex !== null || (cuts && surface.fragment !== null)) && geometry.colorBuffer !== null && geometry.detailBuffer !== null
                ? meshes.materials.get(surface, bends, cull)
                : null;
            // Its shadow's shader is asked for at once, so it is compiled alongside the material's
            // rather than after it, and the model does not stand there a few frames casting nothing.
            const shadow = effect !== null && !effect.failed ? meshes.materials.shadow(surface, bends, cuts) : null;
            // A model not drawn yet, while its material compiles, casts nothing yet either.
            if (effect !== null && effect.pending) {
                return false;
            }
            const hookedOne = shadow !== null && shadow !== 'pending'
                ? hookedPipeline(shadow.module, shadow.layout, bends, cull, cuts ? meshes.layouts.texture : null)
                : shadow;
            if (hookedOne === 'pending') {
                return false;
            }
            if (shadow !== null && shadow !== 'pending' && hookedOne !== null) {
                pass.setPipeline(hookedOne);
                pass.setBindGroup(0, cuts ? cutGroupFor(slot) : groupFor(slot));
                pass.setBindGroup(1, cuts ? textureBindGroup(device, meshes, mesh) : nothing);
                pass.setBindGroup(2, nothing);
                const joints = bends ? meshes.joints.upload(mesh.skeleton!) : null;
                const bound = meshes.materials.bind(effect!, surface, meshes.defaultSmooth, null, time, width, height, joints);
                pass.setBindGroup(meshes.materials.group, bound.group, [bound.offset]);
                pass.setVertexBuffer(0, toGpuBuffer(geometry.vertexBuffer));
                pass.setVertexBuffer(1, toGpuBuffer(geometry.colorBuffer!));
                if (bends) {
                    pass.setVertexBuffer(2, toGpuBuffer(geometry.skinBuffer!));
                }
                pass.setVertexBuffer(bends ? 3 : 2, toGpuBuffer(geometry.detailBuffer!));
                pass.setIndexBuffer(toGpuBuffer(geometry.indexBuffer), geometry.indexType);
                pass.drawIndexed(geometry.indexCount);
                return true;
            }

            // Cut by its picture alone: a material with no hooks, or one whose shadow shader the card
            // refused.
            const set = cuts ? cutPipelines(meshes.layouts.texture, cull) : cull === 'back' ? { pipeline, skinnedPipeline } : sided(cull);
            pass.setPipeline(bends ? set.skinnedPipeline : set.pipeline);
            pass.setBindGroup(0, cuts ? cutGroupFor(slot) : groupFor(slot));
            pass.setVertexBuffer(0, toGpuBuffer(geometry.vertexBuffer));
            if (cuts) {
                pass.setBindGroup(bends ? 2 : 1, textureBindGroup(device, meshes, mesh));
                pass.setVertexBuffer(bends ? 2 : 1, toGpuBuffer(geometry.colorBuffer!));
            }

            if (bends) {
                // The bones are the ones the scene's own pass uploaded: the same run of numbers,
                // named again here because this pipeline has a layout of its own.
                const skeleton = mesh.skeleton!;
                const jointBuffer = meshes.joints.upload(skeleton);
                const held = jointGroups.get(skeleton.key);
                if (held === undefined || held.buffer !== jointBuffer) {
                    jointGroups.set(skeleton.key, {
                        buffer: jointBuffer,
                        group: device.createBindGroup({
                            label: `shadow skeleton ${skeleton.key}`,
                            layout: jointsLayout,
                            entries: [{ binding: 0, resource: { buffer: jointBuffer } }],
                        }),
                    });
                }
                pass.setBindGroup(1, jointGroups.get(skeleton.key)!.group);
                pass.setVertexBuffer(1, toGpuBuffer(geometry.skinBuffer!));
            }

            pass.setIndexBuffer(toGpuBuffer(geometry.indexBuffer), geometry.indexType);
            pass.drawIndexed(geometry.indexCount);
            return true;
        },

        destroy: (): void => { buffer.destroy(); },
    };
};

/**
 * The shadow pass, as this backend holds it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShadowPipeline = ReturnType<typeof createShadowPipeline>;
