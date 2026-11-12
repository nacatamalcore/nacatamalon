import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { createScene } from '../src/scene/create_scene';
import { serializeScene } from '../src/scene';
import { useTransform } from '../src/hooks/transform';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useCamera3d } from '../src/hooks';
import { useDirectionalLight } from '../src/hooks/light';
import { createMesh } from '../src/gameobjects/mesh';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { createDrawable, registerDrawableKind } from '../src/extend/gpu';
import { destroy } from '../src/destroy/destroy';
import { findShadowSources } from '../src/render/shared/light_space';
import { beginCustomPass, beginCustomShadows, destroyCustoms, drawCustom, drawCustomShadows, newCustomsOnCard } from '../src/render/webgpu/custom/customs';
import { useSkeletalAnimation } from '../src/hooks/animation/use_skeletal_animation';
import { beginCustomPassGl, beginCustomShadowsGl, destroyCustomsGl, drawCustomsGl, drawCustomShadowsGl, newCustomsOnGl } from '../src/render/webgl2/custom/customs';
import { inSight } from '../src/game/loop/helper/collect_drawables';
import type { TDrawable } from '../src/gameobjects/types';
import type { TWebGL2State } from '../src/render/webgl2/types/t_webgl2_state';
import type { TWebGl2Drawables, TWebGl2DrawablePass, TWebGpuDrawableContext } from '../src/extend/gpu';
import { buildMeshMaterialShader } from '../src/render/webgpu/material/mesh_material_shader';
import { buildMeshMaterialShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { MESH_SHADER } from '../src/render/webgpu/mesh/mesh_shader';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { newSkeleton, restingJoint } from '../src/animation';
import { LIGHT_UNIFORM_FLOATS } from '../src/render/shared/fill_light_uniforms';
import { FRAME_FLOATS_2D, LIGHTING_2D_FLOATS } from '../src/render/shared/lighting_2d';
import { flatViewProjection } from '../src/render/shared/flat_cameras';
import { applyView2d } from '../src/render/shared/apply_view_2d';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createTestGame, startTestScene, takeDownTestGames } from './helpers/test_game';
import { createSpriteTexture } from '../src/gameobjects/sprite_texture';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useParallax } from '../src/hooks/camera/use_parallax';
import { placement3dOf } from '../src/box';
import type { TBox } from '../src/box';
import type { TDrawableKind, TWebGpuDrawablePass, TWebGpuDrawables, TCustomDrawable } from '../src/extend/gpu';
import type { TDrawCustom, TFrameContext, TRenderPass } from '../src/render/interface';
import type { TWebGPUState } from '../src/render/webgpu/types/t_webgpu_state';
import type { TSkeletalClip } from '../src/animation';
import type { TTexture } from '../src/loaders';

/**
 * A kind of drawing a plugin registers: the engine places, orders and hands over its drawings, and
 * the kind's own backend draws them.
 *
 * The rules tested most are the two halves of the bargain: what reaches `prepare` is the drawing
 * already placed in the world, following its object, and what reaches the backend is told before
 * anything is drawn, in the order the drawings are drawn.
 */

let named = 0;
/**
 * A kind of its own name for each test, since kinds are the page's.
 */
const kind = (extra: Partial<TDrawableKind<unknown>> = {}): TDrawableKind<unknown> => ({
    name: `test-kind-${++named}`,
    prepare: (drawable, world) => ({ id: drawable.id, x: world[12], y: world[13], z: world[14] }),
    ...extra,
});

const frame = (store: ReturnType<typeof createTestGame>['store']): TRenderPass => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx, 0);
    return ctx.passes[ctx.passes.length - 1];
};

const customsIn = (pass: TRenderPass): TDrawCustom[] =>
    (pass.drawables ?? []).filter((item) => item.type === 'custom') as unknown as TDrawCustom[];

afterEach(() => {
    takeDownTestGames();
    mock.restore();
});

describe('registering a kind', () => {
    it('does nothing the second time for the same kind, and refuses another under its name', () => {
        const blobs = kind();
        registerDrawableKind(blobs);
        expect(() => registerDrawableKind(blobs)).not.toThrow();
        expect(() => registerDrawableKind({ ...blobs })).toThrow(/already registered/);
    });
});

describe('making a drawing', () => {
    it('only inside something being built, and only of a kind that is registered', () => {
        const blobs = kind();
        registerDrawableKind(blobs);
        expect(() => createDrawable(blobs.name)).toThrow(/createDrawable/);

        const { store } = createTestGame();
        expect(() => startTestScene(store, 'Level', () => {
            createDrawable('test-nobody');
            return createScene();
        })).toThrow(/no kind 'test-nobody'/);
    });

    it('keeps the plugin\'s own fields beside the engine\'s', () => {
        const blobs = kind();
        registerDrawableKind(blobs);
        const { store } = createTestGame();
        let made!: TCustomDrawable & { radius: number };
        startTestScene(store, 'Level', () => {
            made = createDrawable(blobs.name, { name: 'blob', transform: { x: 2 } }, { radius: 3 });
            return createScene();
        });
        expect(made.type).toBe('custom');
        expect(made.kind).toBe(blobs.name);
        expect(made.name).toBe('blob');
        expect(made.radius).toBe(3);
        expect(made.transform.x).toBe(2);
        expect(made.transform.scaleZ).toBe(1);
    });
});

describe('where a drawing is drawn', () => {
    it('reaches its kind placed in the world, and the backend as what the kind prepared', () => {
        const blobs = kind();
        registerDrawableKind(blobs);
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', transform: { z: 5 } });
            createDrawable(blobs.name, { transform: { x: 10, y: -2 } });
            return createScene();
        });

        const [drawn] = customsIn(frame(store));
        expect(drawn.kind).toBe(blobs.name);
        expect(drawn.payload).toMatchObject({ x: 10, y: -2, z: 0 });
    });

    it('stands upright where the scene\'s models are seen through the 2D camera, as a model does', () => {
        const blobs = kind();
        registerDrawableKind(blobs);
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'orthographic', transform: { z: 800 }, follow2d: true });
            createDrawable(blobs.name, { transform: { x: 40, y: 30 } });
            return createScene();
        });
        const [drawn] = customsIn(frame(store));
        // Its own y turned over, its place left where it is.
        expect(drawn.world[5]).toBe(-1);
        expect([drawn.world[12], drawn.world[13]]).toEqual([40, 30]);

        const { store: plain } = createTestGame();
        startTestScene(plain, 'Level', () => {
            useCamera3d({ projection: 'perspective', transform: { z: 5 } });
            createDrawable(blobs.name);
            return createScene();
        });
        expect(customsIn(frame(plain))[0].world[5]).toBe(1);
    });

    it('carries its kind\'s box and where it is, for the engine to judge it by', () => {
        const box = { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } };
        const blobs = kind({ bounds: () => box });
        registerDrawableKind(blobs);
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', transform: { z: 5 } });
            createDrawable(blobs.name, { transform: { x: 3 } });
            return createScene();
        });
        const [drawn] = customsIn(frame(store));
        expect(drawn.bounds).toBe(box);
        expect(drawn.world[12]).toBe(3);
    });

    it('follows the object it was made in, as that object moves', () => {
        const blobs = kind();
        registerDrawableKind(blobs);
        const { store } = createTestGame();
        let place!: ReturnType<typeof useTransform>;
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', transform: { z: 5 } });
            useSpawn(() => {
                place = useTransform({ x: 3 });
                createDrawable(blobs.name, { transform: { x: 1 } });
            })();
            return createScene();
        });
        expect(customsIn(frame(store))[0].payload).toMatchObject({ x: 4 });

        place.x = -4;
        place.z = 2;
        expect(customsIn(frame(store))[0].payload).toMatchObject({ x: -3, z: 2 });
    });

    it('is seen through the scene\'s 3D view, and keeps its place among the models', () => {
        const blobs = kind();
        registerDrawableKind(blobs);
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', transform: { z: 5 } });
            const cube = useCubeGeometry();
            createMesh({ geometry: cube });
            createDrawable(blobs.name);
            createMesh({ geometry: cube });
            return createScene();
        });

        const pass = frame(store);
        expect((pass.drawables ?? []).map((item) => item.type)).toEqual(['mesh', 'custom', 'mesh']);
        expect(pass.viewIndex?.[1]).toBe(0);
        expect(pass.views3d).toHaveLength(1);
    });

    it('is not prepared nor handed over at all when hidden', () => {
        let prepared = 0;
        const blobs = kind({ prepare: () => ++prepared });
        registerDrawableKind(blobs);
        const { store } = createTestGame();
        let blob!: TCustomDrawable;
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', transform: { z: 5 } });
            blob = createDrawable(blobs.name);
            return createScene();
        });
        blob.visible = false;
        expect(customsIn(frame(store))).toHaveLength(0);
        expect(prepared).toBe(0);

        blob.visible = true;
        expect(customsIn(frame(store))).toHaveLength(1);
        expect(prepared).toBe(1);
    });

    it('is a caster of its scene\'s shadow, for its kind to decide about', () => {
        const blobs = kind();
        registerDrawableKind(blobs);
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', transform: { z: 5 } });
            useDirectionalLight({ castShadow: true });
            createDrawable(blobs.name);
            return createScene();
        });
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx, 0);

        const [source] = findShadowSources(ctx);
        expect(source.casters).toHaveLength(0);
        expect(source.customs.map((item) => item.kind)).toEqual([blobs.name]);
    });

    it('lets its kind go of what it kept when it is destroyed, and is left out of a scene document', () => {
        const disposed: string[] = [];
        const blobs = kind({ dispose: (drawable) => { disposed.push(drawable.id); } });
        registerDrawableKind(blobs);
        const { store } = createTestGame();
        let blob!: TCustomDrawable;
        const scene = startTestScene(store, 'Level', () => {
            blob = createDrawable(blobs.name);
            return createScene();
        });
        expect(JSON.stringify(serializeScene(scene))).not.toContain(blobs.name);

        destroy(blob, { immediate: true });
        expect(disposed).toEqual([blob.id]);
        expect(customsIn(frame(store))).toHaveLength(0);
    });
});

/**
 * Just enough of a WebGPU renderer's state for what the kinds are handed: no card, a block of lights
 * per view.
 */
const fakeCard = (views = 2): TWebGPUState => ({
    device: {} as GPUDevice,
    format: 'bgra8unorm',
    samples: 1,
    customs: newCustomsOnCard(),
    frameUniforms: { data: new Float32Array(FRAME_FLOATS_2D) },
    meshes: { lights: { data: new Float32Array(views * 256 / 4 * Math.ceil(LIGHT_UNIFORM_FLOATS * 4 / 256)) } },
} as unknown as TWebGPUState);

const space = (x: number) => ({ viewProjection: new Float32Array(16), x, y: 1, z: 2, right: [1, 0, 0], up: [0, 1, 0], width: 320, height: 180, flat: false }) as never;

/**
 * A backend that writes down what it is told.
 */
const recording = () => {
    const events: string[] = [];
    let made = 0;
    let passSeen: TWebGpuDrawablePass<unknown> | null = null;
    const factory = (): TWebGpuDrawables<unknown> => {
        made++;
        return {
            beginPass: (pass) => {
                passSeen = pass;
                events.push(`begin ${pass.items.map((item) => (item as { id: string }).id).join(',')} views ${pass.views.length}`);
            },
            draw: (_encoder, item, view) => { events.push(`draw ${(item as { id: string }).id} in ${view}`); },
            beginShadows: (shadows) => { events.push(`shadows ${shadows.map((shadow) => shadow.items.length).join(',')}`); },
            drawShadow: (_encoder, s) => { events.push(`shadow ${s}`); },
            destroy: () => { events.push('destroy'); },
        };
    };
    return { events, factory, made: () => made, pass: () => passSeen };
};

const view3d = () => ({ camera: null, lights: [], ambient: { r: 0, g: 0, b: 0, a: 1 } }) as never;

/**
 * A matrix that moves by `x`, or leaves where it is: a view through it sees -1 to 1 on each axis.
 */
const at = (x = 0): Float32Array => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]);
const UNIT = { min: { x: -0.1, y: -0.1, z: -0.1 }, max: { x: 0.1, y: 0.1, z: 0.1 } };

const item = (name: string, id: string, x = 0, bounds: TDrawCustom['bounds'] = UNIT): TDrawCustom =>
    ({ type: 'custom', kind: name, space: '3d', payload: { id }, world: at(x), bounds });

describe('what draws a kind on WebGPU', () => {
    it('is made once per card, told about each pass before it draws, and lets go at the end', () => {
        const backend = recording();
        const blobs = kind({ webgpu: backend.factory });
        registerDrawableKind(blobs);
        const gpu = fakeCard();
        const drawables = [item(blobs.name, 'a'), { type: 'mesh' } as never, item(blobs.name, 'b')];

        beginCustomPass(gpu, drawables, [1, -1, 1], [], [], [space(4), space(7)], [at(), at()], [view3d(), view3d()], [], 1.5, 320, 180);
        drawCustom(gpu, {} as GPURenderPassEncoder, 0, drawables[0] as TDrawCustom, 1);
        // The camera spaces are a list the whole renderer shares, longer than this pass needs: only
        // the pass's own scenes are handed over.
        beginCustomPass(gpu, drawables, [0, -1, 0], [], [], [space(4), space(7), space(9)], [at(), at(), at()], [view3d()], [], 2, 320, 180);
        destroyCustoms(gpu.customs);

        expect(backend.made()).toBe(1);
        expect(backend.events).toEqual(['begin a,b views 2', 'draw a in 1', 'begin a,b views 1', 'destroy']);
        const pass = backend.pass()!;
        expect(pass.time).toBe(2);
        expect(pass.views[0].eye).toEqual({ x: 4, y: 1, z: 2 });
        expect(pass.views[0].lights.length).toBe(LIGHT_UNIFORM_FLOATS);
        expect(pass.views[0].shadowMap).toBeNull();
        expect(pass.views).toHaveLength(1);
    });

    it('is told about every shadow map before one is drawn, and drawn only into those it is in', () => {
        const backend = recording();
        const blobs = kind({ webgpu: backend.factory });
        registerDrawableKind(blobs);
        const gpu = fakeCard();
        const sources = [
            { customs: [item(blobs.name, 'a')] },
            { customs: [] },
            { customs: [item(blobs.name, 'b'), item(blobs.name, 'c')] },
        ] as never;
        const matrices = [at(), at(), at()];

        const casting = beginCustomShadows(gpu, sources, matrices, 0);
        for (let s = 0; s < 3; s++) {
            drawCustomShadows(casting, {} as GPURenderPassEncoder, s);
        }
        expect(backend.events).toEqual(['shadows 1,0,2', 'shadow 0', 'shadow 2']);
    });

    it('is not told about, nor asked to draw, a drawing no camera or light can see', () => {
        const backend = recording();
        const blobs = kind({ webgpu: backend.factory });
        registerDrawableKind(blobs);
        const gpu = fakeCard();
        // The second is five to the right, past the edge of a view that sees -1 to 1; the third has
        // no box, and is always drawn.
        const drawables = [item(blobs.name, 'in'), item(blobs.name, 'out', 5), item(blobs.name, 'boxless', 5, null)];

        beginCustomPass(gpu, drawables, [0, 0, 0], [], [], [space(0)], [at()], [view3d()], [], 0, 320, 180);
        drawables.forEach((drawn, i) => drawCustom(gpu, {} as GPURenderPassEncoder, i, drawn, 0));
        const casting = beginCustomShadows(gpu, [{ customs: drawables }] as never, [at()], 0);
        drawCustomShadows(casting, {} as GPURenderPassEncoder, 0);

        expect(backend.events).toEqual(['begin in,boxless views 1', 'draw in in 0', 'draw boxless in 0', 'shadows 2', 'shadow 0']);
    });

    it('is drawn as nothing, said once, for a kind with nothing for WebGPU or one whose factory fails', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const error = spyOn(console, 'error').mockImplementation(() => {});
        const silent = kind();
        const broken = kind({ webgpu: () => { throw new Error('no adapter feature'); } });
        registerDrawableKind(silent);
        registerDrawableKind(broken);
        const gpu = fakeCard();
        const drawables = [item(silent.name, 'a'), item(broken.name, 'b')];

        beginCustomPass(gpu, drawables, [0, 0], [], [], [space(0)], [at()], [view3d()], [], 0, 320, 180);
        beginCustomPass(gpu, drawables, [0, 0], [], [], [space(0)], [at()], [view3d()], [], 0, 320, 180);
        expect(() => drawCustom(gpu, {} as GPURenderPassEncoder, 1, drawables[1], 0)).not.toThrow();

        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain(`${silent.name}: its drawings are drawn as nothing on WebGPU`);
        expect(error).toHaveBeenCalledTimes(1);
        expect(String(error.mock.calls[0][0])).toContain(broken.name);
    });
});

/**
 * Just enough of a WebGL2 renderer's state for what the kinds are handed: a guard that runs the call
 * as it is, since the state it keeps is tested on its own.
 */
const fakeGl = (): TWebGL2State => {
    const customs = newCustomsOnGl();
    const runs: string[] = [];
    customs.guard = { gl: {} as WebGL2RenderingContext, run: (callback, _careful, inPass) => { runs.push(inPass === true ? 'in pass' : 'beside'); return callback(); } };
    // What the engine sets on the real context itself, outside a kind's calls.
    const set: string[] = [];
    const gl = { CULL_FACE: 1, BACK: 2, enable: (what: number) => set.push(`enable ${what}`), cullFace: (face: number) => set.push(`cullFace ${face}`) };
    return { gl, customs, runs, set, frameUniforms: { data: new Float32Array(FRAME_FLOATS_2D) } } as unknown as TWebGL2State;
};

describe('what draws a kind on WebGL2', () => {
    it('is told about the pass, draws only what a camera sees, casts, and every call keeps the engine\'s state', () => {
        const events: string[] = [];
        const blobs = kind({
            webgl2: (): TWebGl2Drawables<unknown> => ({
                beginPass: (pass) => { events.push(`begin ${pass.items.map((one) => (one as { id: string }).id).join(',')} lights ${pass.views[0].lights.length}`); },
                draw: (one, view) => { events.push(`draw ${(one as { id: string }).id} in ${view}`); },
                beginShadows: (shadows) => { events.push(`shadows ${shadows.map((shadow) => shadow.items.length).join(',')}`); },
                drawShadow: (shadow) => { events.push(`shadow ${shadow}`); },
                destroy: () => { events.push('destroy'); },
            }),
        });
        registerDrawableKind(blobs);
        const state = fakeGl();
        const drawables = [item(blobs.name, 'in'), item(blobs.name, 'out', 5)];
        const scene = { camera: null, lights: [], ambient: { r: 0, g: 0, b: 0, a: 1 } } as never;

        const casting = beginCustomShadowsGl(state, [{ customs: drawables, view: scene }] as never, [at()], 0);
        drawCustomShadowsGl(state, casting, 0);
        beginCustomPassGl(state, drawables, [0, 0], [], [], [space(0)], [at()], [scene], [], 0, 320, 180);
        drawCustomsGl(state, drawables, 0, 1, [0, 0], []);
        destroyCustomsGl(state.customs);

        expect(events).toEqual(['shadows 1', 'shadow 0', `begin in lights ${LIGHT_UNIFORM_FLOATS}`, 'draw in in 0', 'destroy']);
        // Every call, the factory's too, with the state put back after it and the pass's framebuffer kept.
        expect((state as unknown as { runs: string[] }).runs.filter((run) => run === 'in pass').length).toBe(6);
    });

    it('is drawn as nothing, said once, for a kind with nothing for WebGL2', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const silent = kind();
        registerDrawableKind(silent);
        const state = fakeGl();
        const drawables = [item(silent.name, 'a')];
        beginCustomPassGl(state, drawables, [0], [], [], [space(0)], [at()], [view3d()], [], 0, 320, 180);
        beginCustomPassGl(state, drawables, [0], [], [], [space(0)], [at()], [view3d()], [], 0, 320, 180);
        drawCustomsGl(state, drawables, 0, 0, [0], []);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain(`${silent.name}: its drawings are drawn as nothing on WebGL2`);
    });
});

describe('drawing a kind on WebGL2, quickly', () => {
    it('draws a run of one kind\'s drawings inside one guard, the rest of it after one that throws', () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        const drawn: string[] = [];
        const blobs = kind({
            webgl2: (): TWebGl2Drawables<unknown> => ({
                beginPass: () => {},
                draw: (one) => {
                    const id = (one as { id: string }).id;
                    if (id === 'b') throw new Error('broken');
                    drawn.push(id);
                },
            }),
        });
        registerDrawableKind(blobs);
        const state = fakeGl();
        const drawables = [item(blobs.name, 'a'), item(blobs.name, 'b'), item(blobs.name, 'c')];
        beginCustomPassGl(state, drawables, [0, 0, 0], [], [], [space(0)], [at()], [view3d()], [], 0, 320, 180);
        const runs = (state as unknown as { runs: string[] }).runs;
        const before = runs.length;

        drawCustomsGl(state, drawables, 0, 2, [0, 0, 0], []);

        expect(drawn).toEqual(['a', 'c']);
        expect(runs.length - before).toBe(1);
        expect(String(error.mock.calls[0][0])).toContain(`${blobs.name}: its draw failed on WebGL2`);
    });

    it('casts each kind with the culling the shadow pass set up, not the last caster\'s', () => {
        const blobs = kind({
            webgl2: (): TWebGl2Drawables<unknown> => ({ beginPass: () => {}, draw: () => {}, beginShadows: () => {}, drawShadow: () => {} }),
        });
        registerDrawableKind(blobs);
        const state = fakeGl();
        const scene = { camera: null, lights: [], ambient: { r: 0, g: 0, b: 0, a: 1 } } as never;
        const casting = beginCustomShadowsGl(state, [{ customs: [item(blobs.name, 'a')], view: scene }] as never, [at()], 0);

        drawCustomShadowsGl(state, casting, 0);

        expect((state as unknown as { set: string[] }).set).toEqual(['enable 1', 'cullFace 2']);
    });
});

describe('a flat kind', () => {
    it('is placed and ordered like a sprite, seen through no scene in depth', () => {
        const flat = kind({ space: '2d' });
        registerDrawableKind(flat);
        const { store } = createTestGame();
        let place!: ReturnType<typeof useTransform>;
        let made!: TCustomDrawable;
        startTestScene(store, 'Level', () => {
            createSprite({ width: 4, height: 4 });
            createDrawable(flat.name, { name: 'between' });
            createSprite({ width: 4, height: 4 });
            useSpawn(() => {
                place = useTransform({ x: 30, y: 40, rotation: Math.PI / 2 });
                made = createDrawable(flat.name, { transform: { x: 2 } });
            })();
            return createScene();
        });
        expect(made.space).toBe('2d');

        const pass = frame(store);
        // In the order made, among the sprites; the one in the piece after its parent's.
        expect((pass.drawables ?? []).map((item) => item.type)).toEqual(['sprite', 'custom', 'sprite', 'custom']);
        expect(pass.viewIndex?.[1] ?? -1).toBe(-1);
        expect(pass.views3d ?? []).toHaveLength(0);
        const drawn = customsIn(pass)[1];
        expect(drawn.space).toBe('2d');
        // Two along its own x, turned a quarter round with its object: two down from (30, 40).
        expect(drawn.payload).toMatchObject({ x: 30, z: 0 });
        expect((drawn.payload as { y: number }).y).toBeCloseTo(42, 5);
        expect(drawn.world[0]).toBeCloseTo(0, 5);
        expect(drawn.world[1]).toBeCloseTo(1, 5);

        place.x = 0;
        expect((customsIn(frame(store))[1].payload as { x: number }).x).toBeCloseTo(0, 5);
    });

    it('is seen through the same arithmetic as a sprite', () => {
        const camera = { transform: { x: 30, y: -12, rotation: 0.4 }, zoom: 2 };
        const m = flatViewProjection(camera, 320, 180, new Float32Array(16));
        const point = { x: 75, y: 20 };
        const screen = applyView2d(camera, point);
        expect(m[0] * point.x + m[4] * point.y + m[12]).toBeCloseTo(screen.x / 320 * 2 - 1, 5);
        expect(m[1] * point.x + m[5] * point.y + m[13]).toBeCloseTo(-(screen.y / 180 * 2 - 1), 5);
    });

    it('is handed its pass\'s 2D views and left out of a camera that cannot see it', () => {
        const backend = recording();
        const flat = kind({ space: '2d', webgpu: backend.factory });
        registerDrawableKind(flat);
        const gpu = fakeCard();
        const flatItem = (id: string, x: number): TDrawCustom => ({ ...item(flat.name, id, x, { min: { x: -1, y: -1, z: 0 }, max: { x: 1, y: 1, z: 0 } }), space: '2d' });
        // In the game's pixels: one on the screen, one far to its right.
        const drawables = [flatItem('in', 100), flatItem('out', 5000)];
        const cameras = [{ transform: { x: 0, y: 0, rotation: 0 }, zoom: 1 }];

        beginCustomPass(gpu, drawables, [-1, -1], [0, 0], cameras, [], [], [], [], 0, 320, 180);
        drawables.forEach((drawn, i) => drawCustom(gpu, {} as GPURenderPassEncoder, i, drawn, 1));

        expect(backend.events).toEqual(['begin in views 0', 'draw in in 1']);
        const pass = backend.pass()!;
        expect(pass.cameras).toHaveLength(2);
        expect(pass.cameras[1].lights.length).toBe(LIGHTING_2D_FLOATS);
    });
});

describe('a flat kind, collected', () => {
    it('is left out when its box, moved, turned and grown with it, is outside what the camera shows', () => {
        const flat = kind({ space: '2d', bounds: () => ({ min: { x: -2, y: -2, z: 0 }, max: { x: 2, y: 2, z: 0 } }) });
        registerDrawableKind(flat);
        const place = { x: 100, y: 50, rotation: 0, scaleX: 3, scaleY: 1 };
        const drawing = { type: 'custom', kind: flat.name, space: '2d', transform: place, worldTransform: place } as unknown as TDrawable;
        const sight = (maxX: number) => ({ minX: 0, minY: 0, maxX, maxY: 100 });

        // Grown three times along x: from 94 to 106.
        expect(inSight(drawing, sight(95))).toBe(true);
        expect(inSight(drawing, sight(93))).toBe(false);
        // Turned a quarter round, its length stands up: from 98 to 102 across.
        place.rotation = Math.PI / 2;
        expect(inSight(drawing, sight(99))).toBe(true);
        expect(inSight(drawing, sight(97))).toBe(false);
    });

    it('is kept when its kind gives no box, and so is one in depth', () => {
        const flat = kind({ space: '2d' });
        registerDrawableKind(flat);
        const place = { x: 5000, y: 5000, rotation: 0, scaleX: 1, scaleY: 1 };
        const sight = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
        expect(inSight({ type: 'custom', kind: flat.name, space: '2d', transform: place } as unknown as TDrawable, sight)).toBe(true);
        expect(inSight({ type: 'custom', kind: flat.name, space: '3d', transform: place } as unknown as TDrawable, sight)).toBe(true);
    });
});

describe('a drawing seen through a picture of its own scene', () => {
    const passesOf = (store: ReturnType<typeof createTestGame>['store']): TRenderPass[] => {
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx, 0);
        return ctx.passes;
    };

    it('keeps its place on the screen when a view of the world puts it elsewhere, and its kind is asked about it', () => {
        let made!: TCustomDrawable;
        const asked: unknown[] = [];
        const flat = kind({ space: '2d', prepare: (drawable, world) => { asked.push(drawable); return { x: world[12] }; } });
        registerDrawableKind(flat);
        const level = (withView: boolean) => {
            const { store } = createTestGame();
            startTestScene(store, 'Level', () => {
                useCamera2d().transform.x = 40;
                useSpawn(() => {
                    useParallax({ x: 0.5, y: 0.5 });
                    made = createDrawable(flat.name, { transform: { x: 120 } });
                })();
                if (withView) {
                    createSpriteTexture({ width: 96, height: 64, sees: 'world' }, () => {
                        useCamera2d({ zoom: 0.25 }).transform.x = -40;
                    });
                }
                return createScene();
            });
            return store;
        };
        const alone = customsIn(passesOf(level(false)).at(-1)!)[0].world[12];

        const passes = passesOf(level(true));
        const screen = customsIn(passes.at(-1)!)[0];
        const view = passes.slice(0, -1).map(customsIn).find((items) => items.length > 0)![0];
        expect(screen.world[12]).toBeCloseTo(alone, 5);
        // Parallax against the view's own camera puts it somewhere else there.
        expect(Math.abs(view.world[12] - alone)).toBeGreaterThan(1);
        // Each view's copy is still the drawing the plugin made, to the plugin.
        expect(asked.slice(-2)).toEqual([made, made]);
    });

    it('keeps its zIndex among the models when a monitor sorts them again', () => {
        const blobs = kind();
        registerDrawableKind(blobs);
        const { store } = createTestGame();
        let monitor!: TTexture;
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', transform: { z: 10 } });
            createDrawable(blobs.name, { name: 'front', zIndex: 10 });
            createMesh({ geometry: useCubeGeometry(), zIndex: 5 });
            createDrawable(blobs.name, { name: 'back', zIndex: -10 });
            monitor = createSpriteTexture({ width: 32, height: 32, sees: '3d' }, () => {
                useCamera3d({ projection: 'perspective', transform: { z: 5 } });
            });
            return createScene();
        });
        const passes = passesOf(store);
        const order = (pass: TRenderPass) => (pass.drawables ?? []).map((item) => item.type === 'custom' ? (item as TDrawCustom).zIndex : item.type);

        expect(order(passes.at(-1)!).filter((entry) => entry !== 'sprite')).toEqual([-10, 'mesh', 10]);
        expect(order(passes.find((pass) => pass.renderTarget === monitor.gpu)!)).toEqual([-10, 'mesh', 10]);
    });
});

describe('where an object with a drawing of its own is, for physics', () => {
    it('is the drawing\'s placement, as for a model', () => {
        const blobs = kind();
        registerDrawableKind(blobs);
        const { store } = createTestGame();
        let box!: TBox;
        startTestScene(store, 'Level', () => {
            box = useSpawn(() => {
                createDrawable(blobs.name, { transform: { x: 2, y: 3, z: -4 } });
            })() as unknown as TBox;
            return createScene();
        });
        expect(placement3dOf(box)).toMatchObject({ x: 2, y: 3, z: -4 });
    });
});

describe('the animator', () => {
    it('plays the movements of anything with bones, not only a model from a file', () => {
        const skeleton = newSkeleton('body', new Int32Array([-1]), [restingJoint()], new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
        const slide: TSkeletalClip = {
            type: 'clip',
            name: 'slide',
            duration: 1,
            channels: [{ skeleton: 0, joint: 0, path: 'translation', sampler: 0 }],
            samplers: [{ input: new Float32Array([0, 1]), output: new Float32Array([0, 0, 0, 10, 0, 0]), interpolation: 'LINEAR' }],
        };
        const { store } = createTestGame();
        const scene = startTestScene(store, 'Level', () => {
            useSkeletalAnimation({ model: { clips: { slide } }, skeletons: [skeleton] }, { play: 'slide' });
            return createScene();
        });

        runHookUpdates(scene, 0);
        runHookUpdates(scene, 0.5);
        expect(skeleton.pose[0].t[0]).toBeCloseTo(5, 4);
    });
});

describe('what a kind is handed to draw like the models round it', () => {
    const styled = (style: object | null) => ({ ...(space(0) as object), style }) as never;

    it('is told each view\'s style, its grid worked out as a model\'s, all off with none', () => {
        let seen: TWebGpuDrawablePass<unknown> | null = null;
        let context: TWebGpuDrawableContext | null = null;
        const blobs = kind({
            webgpu: (made): TWebGpuDrawables<unknown> => {
                context = made;
                return { beginPass: (pass) => { seen = pass; }, draw: () => {} };
            },
        });
        registerDrawableKind(blobs);
        const gpu = fakeCard();
        const drawables = [item(blobs.name, 'a')];
        beginCustomPass(gpu, drawables, [0], [], [], [styled({ affine: true, vertexSnap: 120 }), styled(null)], [at(), at()], [view3d(), view3d()], [], 0, 320, 180);

        const views = (seen as TWebGpuDrawablePass<unknown> | null)!.views;
        // 120 rows at 320 x 180: the columns follow the view's shape, so the cells stay square.
        expect(views[0].style).toEqual({ perPixel: false, affine: true, snap: { columns: 120 * (320 / 180), rows: 120 } });
        expect(views[1].style).toEqual({ perPixel: false, affine: false, snap: { columns: 0, rows: 0 } });
        const wgsl = (context as TWebGpuDrawableContext | null)!.shading.wgsl;
        for (const name of ['fn snapToGrid(', 'fn affineUvOf(', 'fn ambientFacing(', 'fn roundReflectionUv(', 'fn cubeReflectionUv('])  {
            expect(wgsl).toContain(name);
        }
        // Its code reads nothing of a model's own: a kind's shader has no `uniforms` or `lights` of the
        // engine's. Comments may name them.
        const code = wgsl.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        expect(code).not.toContain('uniforms.');
        expect(code).not.toContain('lights.');
        destroyCustoms(gpu.customs);
    });

    it('on WebGL2 too: the style in each view and the GLSL twins in the context', () => {
        let seen: TWebGl2DrawablePass<unknown> | null = null;
        let glsl = '';
        const blobs = kind({
            webgl2: (made): TWebGl2Drawables<unknown> => {
                glsl = made.shading.glsl;
                return { beginPass: (pass) => { seen = pass; }, draw: () => {} };
            },
        });
        registerDrawableKind(blobs);
        const state = fakeGl();
        beginCustomPassGl(state, [item(blobs.name, 'a')], [0], [], [], [styled({ perPixel: true, vertexSnap: true })], [at()], [view3d()], [], 0, 320, 180);

        // `true` is the view's own pixels.
        expect((seen as TWebGl2DrawablePass<unknown> | null)!.views[0].style).toEqual({ perPixel: true, affine: false, snap: { columns: 320, rows: 180 } });
        for (const name of ['vec4 snapToGrid(', 'vec3 affineUvOf(', 'vec3 ambientFacing(', 'vec2 roundReflectionUv(', 'vec2 cubeReflectionUv(']) {
            expect(glsl).toContain(name);
        }
        destroyCustomsGl(state.customs);
    });

    it('is what a model\'s own shaders read, declared once in each', () => {
        const once = (code: string, name: string) => expect(code.split(name).length - 1).toBe(1);
        const wgsl = buildMeshMaterialShader(null, null, {}, [], false, 'back', false);
        once(wgsl, 'fn snapToGrid(');
        once(wgsl, 'fn roundReflectionUv(');
        expect(wgsl).toContain('return snapToGrid(clip, vec2<f32>(uniforms.emissive.w, uniforms.cameraPosition.w));');
        expect(wgsl).toContain('return cubeReflectionUv(reflect(-normalize(ctx.viewDir), normalize(ctx.normal)));');
        const gl = buildMeshMaterialShaderGlsl(null, null, {}, [], false, 'back', false);
        once(gl.vertex, 'vec4 snapToGrid(');
        once(gl.fragment, 'vec2 roundReflectionUv(');
        expect(MESH_SHADER).toContain('fn snapToGrid(');
    });
});
