import { fillFlatCameras, flatSlotOf } from '../../shared/flat_cameras';
import { LIGHTING_2D_FLOATS } from '../../shared/lighting_2d';
import type { TDrawCamera2d } from '../../interface/draw/t_draw_camera_2d';
import { LIGHTS_2D_WGSL } from '../../shared/lighting_2d_shader';
import type { TDrawableCamera } from '../../../extend/gpu/drawable_types';
import { drawableKindOf } from '../../../gameobjects/custom';
import { DEPTH_FORMAT, STENCIL_TEST } from '../frame/depth';
import { SHADOW_FORMAT } from '../shadow/shadow_map';
import { LIGHT_UNIFORM_FLOATS, shadowOf } from '../../shared/fill_light_uniforms';
import { LIGHT_STRIDE } from '../mesh/create_mesh_pipeline';
import { LIGHTS_WGSL } from '../mesh/mesh_shader';
import { customInView } from '../../shared/mesh_in_view';
import type { TCameraSpace } from '../../shared/compute_mvp_3d';
import type { TDrawCustom, TDrawItem } from '../../interface';
import type { TDrawView3d } from '../../interface/draw/t_draw_view_3d';
import type { TDrawnShadow } from '../../shared/fill_light_uniforms';
import type { TShadowSource } from '../../shared/light_space';
import type { TTexture } from '../../../loaders';
import type { TWebGPUTexture } from '../texture';
import type { TWebGPUState } from '../types/t_webgpu_state';
import type { TWebGpuDrawableContext, TWebGpuDrawables, TWebGpuDrawableView } from '../../../extend/gpu/drawable_types';

/**
 * One kind as this card draws it: what its factory made, or `null` for a kind that cannot be drawn
 * here, and what it is told, kept between frames so a frame with these drawings allocates nothing.
 */
type TKindOnCard = {
    readonly name: string;
    readonly backend: TWebGpuDrawables<unknown> | null;
    /**
     * What is handed to `beginPass`, written over each pass.
     */
    readonly pass: { items: unknown[]; views: TWebGpuDrawableView[]; cameras: TDrawableCamera[]; time: number; width: number; height: number };
    /**
     * What is handed to `beginShadows`, one per map the frame draws.
     */
    readonly shadows: { items: unknown[]; matrix: Float32Array }[];
};

/**
 * Everything the card keeps for the kinds plugins registered. Empty, and never looked at, for a
 * game with none of their drawings.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCustomsOnCard = {
    readonly byKind: Map<string, TKindOnCard>;
    /**
     * The kinds with a drawing in the pass being recorded, in the order first met.
     */
    readonly inPass: TKindOnCard[];
    /**
     * The views handed to every kind in a pass, one per scene in depth, written over each pass.
     */
    /**
     * The 2D views handed to every flat kind in a pass, written over each pass.
     */
    readonly cameras: { viewProjection: Float32Array; lights: Float32Array }[];
    readonly views: { viewProjection: Float32Array; eye: { x: number; y: number; z: number }; lights: Float32Array; shadowMap: GPUTextureView | null }[];
    /**
     * The kinds that cast into this frame's shadow maps, written over each frame.
     */
    readonly casting: TKindOnCard[];
    /**
     * Whether each entry of the pass being recorded is drawn: false for one a camera cannot see.
     */
    readonly seen: boolean[];
};

/**
 * Makes the empty keeping a renderer starts with.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newCustomsOnCard = (): TCustomsOnCard => ({ byKind: new Map(), inPass: [], cameras: [], views: [], casting: [], seen: [] });

/**
 * The GPU side of one of the game's pictures, or `null` while it is not ready: what a kind's
 * `texture` gives.
 */
const gpuTextureOf = (record: TTexture): GPUTexture | null =>
    record.status === 'ready' && record.gpu !== null ? (record.gpu as TWebGPUTexture).gpuTexture ?? null : null;

/**
 * What draws `name` on this card, made the first time it is asked for. `null` for a kind with
 * nothing to draw it with on WebGPU, said once, and drawn as nothing from then on.
 */
const kindOnCard = (gpu: TWebGPUState, name: string): TKindOnCard | null => {
    const known = gpu.customs.byKind.get(name);
    if (known !== undefined) {
        return known;
    }
    const kind = drawableKindOf(name);
    let backend: TWebGpuDrawables<unknown> | null = null;
    if (kind === undefined) {
        // `createDrawable` refuses an unknown kind, so only a record made by hand gets here.
        console.warn(`[NacatamalOn] the drawings of '${name}' are drawn as nothing: no kind of that name is registered. Register it with registerDrawableKind.`);
    } else if (kind.webgpu === undefined) {
        console.warn(`[NacatamalOn] ${name}: its drawings are drawn as nothing on WebGPU, because the kind gives nothing that draws them here.`);
    } else {
        const context: TWebGpuDrawableContext = {
            backend: 'WEBGPU',
            device: gpu.device,
            format: gpu.format,
            samples: gpu.samples,
            depthStencil: { format: DEPTH_FORMAT, ...STENCIL_TEST },
            shadowFormat: SHADOW_FORMAT,
            lights: { wgsl: LIGHTS_WGSL, floats: LIGHT_UNIFORM_FLOATS },
            lights2d: { wgsl: LIGHTS_2D_WGSL, floats: LIGHTING_2D_FLOATS },
            texture: gpuTextureOf,
        };
        try {
            backend = kind.webgpu(context) as TWebGpuDrawables<unknown>;
            if (!backend || typeof backend.beginPass !== 'function' || typeof backend.draw !== 'function') {
                throw new Error('its webgpu factory returned no beginPass and draw. Return { beginPass, draw, … } from it.');
            }
        } catch (error) {
            backend = null;
            console.error(`[NacatamalOn] ${name}: its drawings are drawn as nothing on WebGPU, because what draws them could not be made:`, error);
        }
    }
    const made: TKindOnCard = {
        name,
        backend,
        pass: { items: [], views: gpu.customs.views, cameras: gpu.customs.cameras, time: 0, width: 0, height: 0 },
        shadows: [],
    };
    gpu.customs.byKind.set(name, made);
    return made;
};

/**
 * Tells every kind with a drawing in this pass about it, before anything in it is recorded: its
 * drawings, and how each scene in depth is seen and lit. Called only for a pass with one of them.
 *
 * After the models' lights are written, which is the block each view hands over.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const beginCustomPass = (
    gpu: TWebGPUState,
    drawables: readonly TDrawItem[],
    viewIndex: readonly number[],
    cameraIndex: readonly number[],
    cameras2d: readonly TDrawCamera2d[],
    spaces: readonly TCameraSpace[],
    judges: readonly Float32Array[],
    views3d: readonly TDrawView3d[],
    shadows: readonly TDrawnShadow<GPUTextureView>[],
    time: number,
    width: number,
    height: number,
): void => {
    const customs = gpu.customs;
    for (const kind of customs.inPass) {
        kind.pass.items.length = 0;
    }
    customs.inPass.length = 0;
    // The pass's 2D views first: a flat drawing is judged by its camera.
    fillFlatCameras(customs.cameras, cameras2d, width, height, gpu.frameUniforms.data);
    const seen = customs.seen;
    seen.length = drawables.length;
    for (let i = 0; i < drawables.length; i++) {
        const item = drawables[i];
        seen[i] = false;
        if (item.type !== 'custom') {
            continue;
        }
        const kind = kindOnCard(gpu, item.kind);
        if (kind === null || kind.backend === null) {
            continue;
        }
        // Nothing of it in its view's camera: left out before its kind hears of it. Per view,
        // because what one camera leaves out another can see. One in no scene seen in depth is
        // left to its kind.
        if (item.space === '2d') {
            if (!customInView(item, customs.cameras[flatSlotOf(cameraIndex[i])]!.viewProjection)) {
                continue;
            }
        } else {
            const view = viewIndex[i] ?? -1;
            if (view >= 0 && judges[view] !== undefined && !customInView(item, judges[view])) {
                continue;
            }
        }
        seen[i] = true;
        if (kind.pass.items.length === 0) {
            customs.inPass.push(kind);
        }
        kind.pass.items.push(item.payload);
    }
    if (customs.inPass.length === 0) {
        return;
    }

    // The same views for every kind: the block a model is lit by, and the map it reads. As many as
    // the pass has scenes in depth: the list of camera spaces is shared and only ever grows.
    const lights = gpu.meshes.lights.data;
    customs.views.length = views3d.length;
    for (let v = 0; v < views3d.length; v++) {
        const at = v * LIGHT_STRIDE / 4;
        const view = customs.views[v] ??= { viewProjection: spaces[v].viewProjection, eye: { x: 0, y: 0, z: 0 }, lights: lights.subarray(at, at + LIGHT_UNIFORM_FLOATS), shadowMap: null };
        view.viewProjection = spaces[v].viewProjection;
        view.eye.x = spaces[v].x;
        view.eye.y = spaces[v].y;
        view.eye.z = spaces[v].z;
        // The buffer behind it is made again when there are more views than it holds.
        if (view.lights.buffer !== lights.buffer || view.lights.byteOffset !== at * 4) {
            view.lights = lights.subarray(at, at + LIGHT_UNIFORM_FLOATS);
        }
        view.shadowMap = shadowOf(shadows, views3d[v])?.map ?? null;
    }

    for (const kind of customs.inPass) {
        kind.pass.time = time;
        kind.pass.width = width;
        kind.pass.height = height;
        kind.backend!.beginPass(kind.pass);
    }
};

/**
 * Draws one drawing of a registered kind where it falls in the pass.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawCustom = (gpu: TWebGPUState, encoder: GPURenderPassEncoder, at: number, item: TDrawCustom, view: number): void => {
    if (gpu.customs.seen[at] === true) {
        gpu.customs.byKind.get(item.kind)?.backend?.draw(encoder, item.payload, view, item.world);
    }
};

/**
 * The kinds that cast into this frame's shadow maps, each told about every map before any is drawn.
 * Empty, and nothing told, for a frame where no drawing of a kind is in a scene that casts.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const beginCustomShadows = (gpu: TWebGPUState, sources: readonly TShadowSource[], matrices: readonly Float32Array[], time: number): readonly TKindOnCard[] => {
    let any = false;
    for (const source of sources) {
        any = any || source.customs.length > 0;
    }
    if (!any) {
        return NONE_CASTING;
    }
    const casting = gpu.customs.casting;
    casting.length = 0;
    sources.forEach((source, s) => {
        for (const item of source.customs) {
            // Judged by what the light sees, not the camera: one out of the picture can still throw
            // a shadow into it.
            if (!customInView(item, matrices[s])) {
                continue;
            }
            const kind = kindOnCard(gpu, item.kind);
            if (kind === null || kind.backend?.beginShadows === undefined || kind.backend.drawShadow === undefined) {
                continue;
            }
            if (!casting.includes(kind)) {
                casting.push(kind);
                kind.shadows.length = sources.length;
                for (let k = 0; k < sources.length; k++) {
                    const shadow = kind.shadows[k] ??= { items: [], matrix: matrices[k] };
                    shadow.items.length = 0;
                    shadow.matrix = matrices[k];
                }
            }
            kind.shadows[s].items.push(item.payload);
        }
    });
    for (const kind of casting) {
        kind.backend!.beginShadows!(kind.shadows, time);
    }
    return casting;
};

/**
 * Draws shadow `s` of every kind that casts into it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawCustomShadows = (casting: readonly TKindOnCard[], encoder: GPURenderPassEncoder, s: number): void => {
    for (const kind of casting) {
        if (kind.shadows[s].items.length > 0) {
            kind.backend!.drawShadow!(encoder, s);
        }
    }
};

/**
 * What casts in a frame where no drawing of a kind is in a scene that casts: nothing, made once.
 */
const NONE_CASTING: readonly TKindOnCard[] = [];

/**
 * Lets every kind go of what it made, when the renderer ends.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const destroyCustoms = (customs: TCustomsOnCard): void => {
    for (const kind of customs.byKind.values()) {
        try {
            kind.backend?.destroy?.();
        } catch (error) {
            console.error(`[NacatamalOn] ${kind.name}: letting go of what draws it failed:`, error);
        }
    }
    customs.byKind.clear();
};
