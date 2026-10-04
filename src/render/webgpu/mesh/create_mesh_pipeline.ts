import { LIGHT_UNIFORM_FLOATS, MESH_UNIFORM_FLOATS } from '../../shared';
import { MESH_SHADER } from './mesh_shader';
import { SHADOW_FORMAT } from '../shadow/shadow_map';
import { SKINNED_SHADER } from './skinned_shader';
import { createJointPalette } from './joint_palette';
import { createMeshMaterials } from '../material/mesh_materials';
import { describeMeshPipeline, MESH_COLORS, MESH_CORNERS } from './pipeline_state';
import type { TMeshPipeline } from './types/t_mesh_pipeline';
import { TEXTURE_WRAPS, wrapKey } from '../../shared/texture_wrap';
import type { TTextureWrap } from '../../../materials/types/t_material';

/**
 * Bytes between one model's numbers and the next. Not chosen: the card will only point at an
 * offset that is a multiple of this. Sixty-four numbers is exactly 256 bytes, so nothing is wasted.
 *
 * @internal
 */
export const MESH_STRIDE = 256;

/**
 * The same for a scene's lights: 132 numbers is 528 bytes, which rounds up to three slots' worth.
 *
 * @internal
 */
export const LIGHT_STRIDE = 768;

const INITIAL_MESHES = 16;

/**
 * The card's name for each thing a picture can do past its edge.
 */
const ADDRESS_MODE: Record<TTextureWrap, GPUAddressMode> = {
    repeat: 'repeat',
    clamp: 'clamp-to-edge',
    mirror: 'mirror-repeat',
};

const INITIAL_VIEWS = 2;


/**
 * Creates the pipeline that draws models.
 *
 * Three groups, and each one changes at a different rate: the lights once a scene, the picture once
 * a run of models that share one, and the placement once a model. Splitting them that way is what
 * keeps eight lights costing one upload a frame instead of one per model.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createMeshPipeline = (
    device: GPUDevice,
    format: GPUTextureFormat,
    samples: number,
    samplers: { nearest: GPUSampler; linear: GPUSampler },
    defaultSmooth: boolean,
    whiteTexture: GPUTexture,
): TMeshPipeline => {
    // Spelled out rather than worked out from the shader, because the two pipelines below share
    // their first three groups: a bind group made once has to be usable by both, and one worked out
    // for each would be two of everything that cannot be told apart by looking.
    const lightsLayout = device.createBindGroupLayout({
        label: 'mesh lights layout',
        entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
            // The shadow map, in the group that already means "how this view is lit". A layout is
            // fixed once and for all, so these two are always here and a scene that casts nothing
            // binds a single step of depth instead: four bytes, so that there is one layout and one
            // pipeline rather than two of each.
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
        ],
    });
    const textureLayout = device.createBindGroupLayout({
        label: 'mesh texture layout',
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        ],
    });
    const uniformsLayout = device.createBindGroupLayout({
        label: 'mesh uniforms layout',
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    const jointsLayout = device.createBindGroupLayout({
        label: 'skeleton layout',
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }],
    });

    const describe = (label: string, module: GPUShaderModule, layout: GPUPipelineLayout, buffers: GPUVertexBufferLayout[], writesDepth = true): GPURenderPipelineDescriptor =>
        describeMeshPipeline(label, module, layout, buffers, format, samples, writesDepth);


    const CORNERS = MESH_CORNERS;
    const COLORS = MESH_COLORS;

    /**
     * And, for a model that bends, a third run beside them: which four bones carry the corner, and
     * how much of it each one owns.
     *
     * A run of its own so that the first stays exactly what it always was: a shape that does not
     * bend pays nothing, and the same shape could be drawn either way.
     */
    const BONES: GPUVertexBufferLayout = {
        arrayStride: 32,
        stepMode: 'vertex',
        attributes: [
            { shaderLocation: 3, offset: 0, format: 'float32x4' },
            { shaderLocation: 4, offset: 16, format: 'float32x4' },
        ],
    };

    const module = device.createShaderModule({ label: 'mesh shader', code: MESH_SHADER });
    const layouts = { lights: lightsLayout, texture: textureLayout, uniforms: uniformsLayout, joints: jointsLayout };

    const meshLayout = device.createPipelineLayout({ bindGroupLayouts: [lightsLayout, textureLayout, uniformsLayout] });
    const pipeline = device.createRenderPipeline(describe('mesh pipeline', module, meshLayout, [CORNERS, COLORS]));
    const transparentPipeline = device.createRenderPipeline(describe('see-through mesh pipeline', module, meshLayout, [CORNERS, COLORS], false));

    const skinnedModule = device.createShaderModule({ label: 'skinned mesh shader', code: SKINNED_SHADER });
    const skinnedLayout = device.createPipelineLayout({ bindGroupLayouts: [lightsLayout, textureLayout, uniformsLayout, jointsLayout] });
    const skinnedPipeline = device.createRenderPipeline(describe('skinned mesh pipeline', skinnedModule, skinnedLayout, [CORNERS, COLORS, BONES]));
    const transparentSkinnedPipeline = device.createRenderPipeline(describe('see-through skinned mesh pipeline', skinnedModule, skinnedLayout, [CORNERS, COLORS, BONES], false));

    // One step of depth, bound wherever a scene casts no shadow. Four bytes, and what they buy is
    // that there is one layout and one pipeline instead of two of each: the shader is told there is
    // nothing to read by the `-1` in its numbers and never looks at this at all.
    const blankShadow = device.createTexture({
        label: 'no shadow',
        size: { width: 1, height: 1 },
        format: SHADOW_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    }).createView();
    const shadowSampler = device.createSampler({ label: 'mesh shadow sampler', compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });

    const lights = {
        buffer: device.createBuffer({ label: 'mesh lights', size: INITIAL_VIEWS * LIGHT_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
        data: new Float32Array(INITIAL_VIEWS * LIGHT_STRIDE / 4),
        capacity: INITIAL_VIEWS,
        bindGroups: [] as GPUBindGroup[],
        blankShadow,
        shadowSampler,
        // Which map the groups above were made against, so they are made again when it appears.
        boundShadow: null as GPUTextureView | null,
    };

    const meshes = {
        buffer: device.createBuffer({ label: 'mesh uniforms', size: INITIAL_MESHES * MESH_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
        data: new Float32Array(INITIAL_MESHES * MESH_STRIDE / 4),
        capacity: INITIAL_MESHES,
        bindGroups: [] as GPUBindGroup[],
    };

    const textureGroups = (texture: GPUTexture) => ({
        nearest: device.createBindGroup({
            layout: textureLayout,
            entries: [{ binding: 0, resource: samplers.nearest }, { binding: 1, resource: texture.createView() }],
        }),
        linear: device.createBindGroup({
            layout: textureLayout,
            entries: [{ binding: 0, resource: samplers.linear }, { binding: 1, resource: texture.createView() }],
        }),
    });

    // Every way a model's picture can be read, made now: two filters, and three things the picture
    // can do past its edge each way. The sprites' two samplers stretch the edge, which is right for
    // a sheet and wrong for a hillside of repeated grass.
    const wrapSamplers = new Map<string, GPUSampler>();
    for (const filter of ['nearest', 'linear'] as const) {
        for (const u of TEXTURE_WRAPS) {
            for (const v of TEXTURE_WRAPS) {
                wrapSamplers.set(wrapKey(filter, u, v), device.createSampler({
                    label: `mesh ${wrapKey(filter, u, v)}`,
                    magFilter: filter,
                    minFilter: filter,
                    addressModeU: ADDRESS_MODE[u],
                    addressModeV: ADDRESS_MODE[v],
                }));
            }
        }
    }

    void LIGHT_UNIFORM_FLOATS;
    void MESH_UNIFORM_FLOATS;

    return {
        pipeline,
        skinnedPipeline,
        transparentPipeline,
        transparentSkinnedPipeline,
        layouts,
        materials: createMeshMaterials(device, format, samples, layouts),
        joints: createJointPalette(device),
        jointBindGroups: new Map(),
        samplers,
        defaultSmooth,
        whiteTexture,
        wrapSamplers,
        textureBindGroups: new WeakMap(),
        whiteBindGroups: textureGroups(whiteTexture),
        lights,
        meshes,
    };
};
