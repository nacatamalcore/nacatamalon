import { fillFlatCameras, flatSlotOf } from '../../shared/flat_cameras';
import { LIGHTING_2D_FLOATS } from '../../shared/lighting_2d';
import type { TDrawCamera2d } from '../../interface/draw/t_draw_camera_2d';
import { LIGHTS_2D_GLSL } from '../../shared/lighting_2d_shader';
import type { TDrawableCamera } from '../../../extend/gpu/drawable_types';
import { drawableKindOf } from '../../../gameobjects/custom';
import { fillLightUniforms, LIGHT_UNIFORM_FLOATS, shadowOf } from '../../shared/fill_light_uniforms';
import { customInView } from '../../shared/mesh_in_view';
import { LIGHTS_GLSL } from '../mesh/mesh_shader';
import { toGlClip } from '../mesh/depth_range';
import { createGlGuard } from '../extensions/guard_gl_state';
import { toGlTexture } from '../texture';
import type { TGlGuard } from '../extensions/guard_gl_state';
import type { TCameraSpace } from '../../shared/compute_mvp_3d';
import type { TDrawItem } from '../../interface';
import type { TDrawView3d } from '../../interface/draw/t_draw_view_3d';
import type { TDrawnShadow } from '../../shared/fill_light_uniforms';
import type { TShadowSource } from '../../shared/light_space';
import type { TTexture } from '../../../loaders';
import type { TWebGL2State } from '../types/t_webgl2_state';
import type { TWebGl2DrawableContext, TWebGl2Drawables, TWebGl2DrawableView } from '../../../extend/gpu/drawable_types';

/**
 * One kind as this context draws it: what its factory made, or `null` for a kind that cannot be
 * drawn here, and what it is told, kept between frames.
 */
type TKindOnGl = {
    readonly name: string;
    readonly backend: TWebGl2Drawables<unknown> | null;
    readonly pass: { items: unknown[]; views: TWebGl2DrawableView[]; cameras: TDrawableCamera[]; time: number; width: number; height: number };
    readonly shadows: { items: unknown[]; matrix: Float32Array }[];
};

/**
 * Everything the context keeps for the kinds plugins registered. Empty, and never looked at, for a
 * game with none of their drawings.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCustomsOnGl = {
    readonly byKind: Map<string, TKindOnGl>;
    readonly inPass: TKindOnGl[];
    /**
     * The 2D views handed to every flat kind in a pass, written over each pass.
     */
    readonly cameras: { viewProjection: Float32Array; lights: Float32Array }[];
    readonly views: { viewProjection: Float32Array; eye: { x: number; y: number; z: number }; lights: Float32Array; shadowMap: WebGLTexture | null }[];
    readonly casting: TKindOnGl[];
    /**
     * Whether each entry of the pass being drawn is drawn: false for one a camera cannot see.
     */
    readonly seen: boolean[];
    /**
     * Each shadow map's light matrix in WebGL2's depth range, for the kinds that cast.
     */
    readonly glMatrices: Float32Array[];
    /**
     * What every call of a kind runs inside, so it leaves the engine's state as it found it. Made
     * the first time a kind is.
     */
    guard: TGlGuard | null;
};

/**
 * Makes the empty keeping a renderer starts with.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newCustomsOnGl = (): TCustomsOnGl => ({ byKind: new Map(), inPass: [], cameras: [], views: [], casting: [], seen: [], glMatrices: [], guard: null });

/**
 * Runs a call of a kind's inside the engine's pass, with the state put back after it. One that
 * throws is said, and the frame goes on.
 */
const call = (customs: TCustomsOnGl, kind: TKindOnGl, what: string, callback: () => void): void => {
    try {
        customs.guard!.run(callback, false, true);
    } catch (error) {
        console.error(`[NacatamalOn] ${kind.name}: its ${what} failed on WebGL2:`, error);
    }
};

/**
 * What draws `name` on this context, made the first time it is asked for. `null` for a kind with
 * nothing to draw it with on WebGL2, said once, and drawn as nothing from then on.
 */
const kindOnGl = (state: TWebGL2State, name: string): TKindOnGl | null => {
    const customs = state.customs;
    const known = customs.byKind.get(name);
    if (known !== undefined) {
        return known;
    }
    const kind = drawableKindOf(name);
    let backend: TWebGl2Drawables<unknown> | null = null;
    if (kind === undefined) {
        console.warn(`[NacatamalOn] the drawings of '${name}' are drawn as nothing: no kind of that name is registered. Register it with registerDrawableKind.`);
    } else if (kind.webgl2 === undefined) {
        console.warn(`[NacatamalOn] ${name}: its drawings are drawn as nothing on WebGL2, because the kind gives nothing that draws them here.`);
    } else {
        customs.guard ??= createGlGuard(state.gl);
        const context: TWebGl2DrawableContext = {
            backend: 'WEBGL2',
            gl: customs.guard.gl,
            lights: { glsl: LIGHTS_GLSL, floats: LIGHT_UNIFORM_FLOATS },
            lights2d: { glsl: LIGHTS_2D_GLSL, floats: LIGHTING_2D_FLOATS },
            texture: (record: TTexture) => record.status === 'ready' && record.gpu !== null ? toGlTexture(record.gpu) : null,
        };
        const factory = kind.webgl2;
        try {
            backend = customs.guard.run(() => factory(context) as TWebGl2Drawables<unknown>, true, true);
            if (!backend || typeof backend.beginPass !== 'function' || typeof backend.draw !== 'function') {
                throw new Error('its webgl2 factory returned no beginPass and draw. Return { beginPass, draw, … } from it.');
            }
        } catch (error) {
            backend = null;
            console.error(`[NacatamalOn] ${name}: its drawings are drawn as nothing on WebGL2, because what draws them could not be made:`, error);
        }
    }
    const made: TKindOnGl = {
        name,
        backend,
        pass: { items: [], views: customs.views, cameras: customs.cameras, time: 0, width: 0, height: 0 },
        shadows: [],
    };
    customs.byKind.set(name, made);
    return made;
};

/**
 * Tells every kind with a drawing in this pass about it, before anything in it is drawn, and notes
 * which of them the pass's cameras can see. Called only for a pass with one of them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const beginCustomPassGl = (
    state: TWebGL2State,
    drawables: readonly TDrawItem[],
    viewIndex: readonly number[],
    cameraIndex: readonly number[],
    cameras2d: readonly TDrawCamera2d[],
    spaces: readonly TCameraSpace[],
    judges: readonly Float32Array[],
    views3d: readonly TDrawView3d[],
    shadows: readonly TDrawnShadow<WebGLTexture>[],
    time: number,
    width: number,
    height: number,
): void => {
    const customs = state.customs;
    for (const kind of customs.inPass) {
        kind.pass.items.length = 0;
    }
    customs.inPass.length = 0;
    // The pass's 2D views first: a flat drawing is judged by its camera.
    fillFlatCameras(customs.cameras, cameras2d, width, height, state.frameUniforms.data);
    const seen = customs.seen;
    seen.length = drawables.length;
    for (let i = 0; i < drawables.length; i++) {
        const item = drawables[i];
        seen[i] = false;
        if (item.type !== 'custom') {
            continue;
        }
        const kind = kindOnGl(state, item.kind);
        if (kind === null || kind.backend === null) {
            continue;
        }
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

    // Each scene's lights filled once for every kind, the way a model's are, with its own shadow.
    customs.views.length = views3d.length;
    for (let v = 0; v < views3d.length; v++) {
        const scene = views3d[v];
        const view = customs.views[v] ??= { viewProjection: spaces[v].viewProjection, eye: { x: 0, y: 0, z: 0 }, lights: new Float32Array(LIGHT_UNIFORM_FLOATS), shadowMap: null };
        view.viewProjection = spaces[v].viewProjection;
        view.eye.x = spaces[v].x;
        view.eye.y = spaces[v].y;
        view.eye.z = spaces[v].z;
        const its = shadowOf(shadows, scene);
        fillLightUniforms(view.lights, scene.lights, scene.ambient, its?.uniforms ?? null, scene.fog ?? null, scene.camera, scene.ground ?? null);
        view.shadowMap = its?.map ?? null;
    }

    for (const kind of customs.inPass) {
        kind.pass.time = time;
        kind.pass.width = width;
        kind.pass.height = height;
        call(customs, kind, 'beginPass', () => kind.backend!.beginPass(kind.pass));
    }
};

/**
 * The run `drawCustomsGl` is drawing, read by the one callback it guards, so a run makes no closure.
 */
const run = {
    state: null as TWebGL2State | null,
    kind: null as TKindOnGl | null,
    drawables: [] as readonly TDrawItem[],
    viewIndex: [] as readonly number[],
    cameraIndex: [] as readonly number[],
    from: 0,
    to: 0,
};

const drawRun = (): void => {
    const { state, kind, drawables, viewIndex, cameraIndex, from, to } = run;
    for (let i = from; i <= to; i++) {
        const item = drawables[i];
        if (state!.customs.seen[i] !== true || item.type !== 'custom') {
            continue;
        }
        // One that throws is said, and the rest of the run is drawn.
        try {
            kind!.backend!.draw(item.payload, item.space === '2d' ? flatSlotOf(cameraIndex[i]) : viewIndex[i] ?? -1, item.world);
        } catch (error) {
            console.error(`[NacatamalOn] ${kind!.name}: its draw failed on WebGL2:`, error);
        }
    }
};

/**
 * Draws entries `from` to `to` of the pass, drawings of one kind in a row under the same mask, each
 * one its cameras can see. The run goes inside one guard, which puts every binding back after it:
 * asking for the whole state and setting it back costs hundreds of calls, too many to pay for each
 * drawing. Between two of its own drawings the kind finds the state as it left it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawCustomsGl = (
    state: TWebGL2State,
    drawables: readonly TDrawItem[],
    from: number,
    to: number,
    viewIndex: readonly number[],
    cameraIndex: readonly number[],
): void => {
    const customs = state.customs;
    const first = drawables[from];
    const kind = first.type === 'custom' ? customs.byKind.get(first.kind) : undefined;
    if (kind?.backend === undefined || kind.backend === null) {
        return;
    }
    let any = false;
    for (let i = from; i <= to && !any; i++) {
        any = customs.seen[i] === true;
    }
    if (!any) {
        return;
    }
    run.state = state;
    run.kind = kind;
    run.drawables = drawables;
    run.viewIndex = viewIndex;
    run.cameraIndex = cameraIndex;
    run.from = from;
    run.to = to;
    try {
        customs.guard!.run(drawRun, false, true);
    } finally {
        // Nothing of the pass is held on to past it.
        run.state = null;
        run.kind = null;
        run.drawables = [];
        run.viewIndex = [];
        run.cameraIndex = [];
    }
};

/**
 * What casts in a frame where no drawing of a kind is in a scene that casts.
 */
const NONE_CASTING: readonly TKindOnGl[] = [];

/**
 * The kinds that cast into this frame's shadow maps, each told about every map before any is drawn.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const beginCustomShadowsGl = (state: TWebGL2State, sources: readonly TShadowSource[], matrices: readonly Float32Array[], time: number): readonly TKindOnGl[] => {
    let any = false;
    for (const source of sources) {
        any = any || source.customs.length > 0;
    }
    if (!any) {
        return NONE_CASTING;
    }
    const customs = state.customs;
    const casting = customs.casting;
    casting.length = 0;
    // The maps are drawn in WebGL2's depth range, as the engine's own shadow pass draws them.
    for (let s = 0; s < sources.length; s++) {
        const glMatrix = customs.glMatrices[s] ??= new Float32Array(16);
        glMatrix.set(matrices[s]);
        toGlClip(glMatrix);
    }
    for (let s = 0; s < sources.length; s++) {
        for (const item of sources[s].customs) {
            if (!customInView(item, matrices[s])) {
                continue;
            }
            const kind = kindOnGl(state, item.kind);
            if (kind === null || kind.backend?.beginShadows === undefined || kind.backend.drawShadow === undefined) {
                continue;
            }
            if (!casting.includes(kind)) {
                casting.push(kind);
                kind.shadows.length = sources.length;
                for (let k = 0; k < sources.length; k++) {
                    const shadow = kind.shadows[k] ??= { items: [], matrix: customs.glMatrices[k] };
                    shadow.items.length = 0;
                    shadow.matrix = customs.glMatrices[k];
                }
            }
            kind.shadows[s].items.push(item.payload);
        }
    }
    for (const kind of casting) {
        call(customs, kind, 'beginShadows', () => kind.backend!.beginShadows!(kind.shadows, time));
    }
    return casting;
};

/**
 * Draws shadow `s` of every kind that casts into it, into the map already bound.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawCustomShadowsGl = (state: TWebGL2State, casting: readonly TKindOnGl[], s: number): void => {
    const gl = state.gl;
    for (const kind of casting) {
        // Each kind finds the map as the shadow pass set it up, not as the last caster left it: a
        // model drawn with both faces turns culling off, and the next kind would cast differently
        // depending on what was drawn before it.
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        if (kind.shadows[s].items.length > 0) {
            call(state.customs, kind, 'drawShadow', () => kind.backend!.drawShadow!(s));
        }
    }
};

/**
 * Lets every kind go of what it made: when the renderer ends, and when the context is lost, after
 * which each is made again the first frame that needs it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const destroyCustomsGl = (customs: TCustomsOnGl, lost = false): void => {
    for (const kind of customs.byKind.values()) {
        try {
            if (lost || customs.guard === null) {
                kind.backend?.destroy?.();
            } else {
                customs.guard.run(() => kind.backend?.destroy?.(), true, true);
            }
        } catch (error) {
            console.error(`[NacatamalOn] ${kind.name}: letting go of what draws it failed:`, error);
        }
    }
    customs.byKind.clear();
    customs.inPass.length = 0;
};
