import { describe, expect, it } from 'bun:test';
import { createMeshInstances } from '../src/gameobjects/mesh/create_mesh_instances';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { createScene } from '../src/scene/create_scene';
import { destroy, flushDestroyed } from '../src/destroy';
import { serializeScene } from '../src/scene/document';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { meshInView } from '../src/render/shared/mesh_in_view';
import { reportCastersOutside } from '../src/render/shared/light_space';
import { lightSpaceMatrix } from '../src/render/shared/light_space';
import { fillCameraSpace, newCameraSpace } from '../src/render/shared/compute_mvp_3d';
import { INSTANCE_BYTES, INSTANCE_FLOATS, INSTANCE_LOCATION, meshBoundsOf } from '../src/render/shared/mesh_instances';
import { MESH_INSTANCES } from '../src/render/webgpu/mesh/pipeline_state';
import { instancedShaderFor } from '../src/render/webgpu/mesh/instanced_shader';
import { meshShaderFor } from '../src/render/webgpu/mesh/mesh_shader';
import { buildMeshMaterialShader, buildMeshMaterialShadowShader } from '../src/render/webgpu/material/mesh_material_shader';
import { SHADOW_CUT_INSTANCED_WGSL, SHADOW_INSTANCED_WGSL } from '../src/render/webgpu/shadow/shadow_shader';
import { updateWebGPUBuffer } from '../src/render/webgpu/resources/create_buffer';
import { instancedVertexGlsl } from '../src/render/webgl2/mesh/instanced_shader';
import { meshFragmentGlsl, meshVertexGlsl } from '../src/render/webgl2/mesh/mesh_shader';
import { buildMeshMaterialShaderGlsl, buildMeshMaterialShadowShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { SHADOW_CUT_INSTANCED_VERTEX_GLSL, SHADOW_INSTANCED_VERTEX_GLSL } from '../src/render/webgl2/shadow/shadow_shader';
import { createWebGL2Buffer, updateWebGL2Buffer } from '../src/render/webgl2/resources/create_buffer';
import { vertexArrayFor } from '../src/render/webgl2/mesh/draw_meshes';
import { compileShader, composerAdd, composerInstanceData, composerInstanceOrigin, composerSwizzle, composerVertexPosition } from '../src/shader_composer';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TMeshInstances, TMeshInstancesOptions } from '../src/gameobjects/mesh';
import type { TDrawCamera3d } from '../src/render/interface/draw/t_draw_camera_3d';
import type { TDrawMesh } from '../src/render/interface/draw/t_draw_mesh';
import type { TFrameContext, IBuffer } from '../src/render/interface';
import type { TMeshPipeline as TGlMeshPipeline } from '../src/render/webgl2/mesh/types/t_mesh_pipeline';
import type { TRuntimeStore } from '../src/store';

/**
 * Many of one shape in one draw: what `createMeshInstances` keeps, what goes up to the card and when,
 * and what each backend's shaders read of an instance.
 */

/** Makes a group inside a scene body, with a camera that sees the middle of the world. */
const made = (options: Partial<TMeshInstancesOptions> = {}, more?: () => void) => {
    const game = createTestGame();
    let group: TMeshInstances | null = null;
    startTestScene(game.store, 'Level', () => {
        useCamera3d({ projection: 'perspective', transform: { z: 10 } });
        group = createMeshInstances({ geometry: useCubeGeometry(), capacity: 4, ...options });
        more?.();
        return createScene();
    });
    return { ...game, group: group! };
};

/** Fills a frame in, as the loop does before it hands it to the renderer. */
const frame = (store: TRuntimeStore): TFrameContext => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return ctx;
};

/** One instance's twenty numbers. */
const numbersOf = (group: TMeshInstances, index: number): number[] =>
    Array.from(group.instances.data.subarray(index * INSTANCE_FLOATS, (index + 1) * INSTANCE_FLOATS));

/** The run of instances among the buffers the fake renderer was asked for. */
const runOf = (game: ReturnType<typeof made>) => game.renderer.buffers.find((buffer) => buffer.handle === game.group.instances.buffer)!;

const close = (got: readonly number[], wanted: readonly number[]): void => {
    expect(got).toHaveLength(wanted.length);
    got.forEach((value, i) => expect(value).toBeCloseTo(wanted[i]!, 5));
};

describe('createMeshInstances', () => {
    it('is a model like any other, with room for its instances and none drawn yet', () => {
        const { group } = made({ tint: '#ff0000', transform: { x: 3 } });

        expect(group.type).toBe('mesh');
        expect(group.transform.x).toBe(3);
        expect(group.material.tint.r).toBe(1);
        expect(group.skeleton).toBeNull();
        expect(group.capacity).toBe(4);
        expect(group.count).toBe(0);
        expect(group.instances.data).toHaveLength(4 * INSTANCE_FLOATS);
    });

    it('writes an instance as the three rows of its placement, its colour and its four numbers', () => {
        const { group } = made();
        group.set(1, { x: 2, y: 3, z: 4, scale: 2, tint: '#ff8000', data: [0.5, 7] });

        close(numbersOf(group, 1), [
            2, 0, 0, 2,
            0, 2, 0, 3,
            0, 0, 2, 4,
            1, 128 / 255, 0, 1,
            0.5, 7, 0, 0,
        ]);
    });

    it('turns it as a model is turned, and sizes each way apart', () => {
        const { group } = made();
        // A quarter turn about Y carries +X to -Z.
        group.set(0, { rotationY: Math.PI / 2, scaleX: 3 });

        const [m00, , , , , m11, , , m20] = numbersOf(group, 0);
        expect(m00).toBeCloseTo(0, 5);
        expect(m11).toBeCloseTo(1, 5);
        expect(m20).toBeCloseTo(-3, 5);
    });

    it('sets one whole: what is left out goes back to the plain answer', () => {
        const { group } = made();
        group.set(0, { x: 5, tint: '#000000', data: [1, 2, 3, 4] });
        group.set(0);

        close(numbersOf(group, 0), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0]);
    });

    it('draws as far as the last one set, and as few as it is told', () => {
        const { group } = made();
        group.set(2);
        expect(group.count).toBe(3);

        group.set(0);
        expect(group.count).toBe(3);

        group.count = 1;
        group.set(0, { x: 1 });
        expect(group.count).toBe(1);
    });

    it('says what is wrong with a capacity or a place that cannot be', () => {
        const game = createTestGame();
        startTestScene(game.store, 'Level', () => {
            expect(() => createMeshInstances({ geometry: useCubeGeometry(), capacity: 0 })).toThrow('capacity is how many instances there is room for');
            expect(() => createMeshInstances({ geometry: useCubeGeometry(), capacity: 2.5 })).toThrow('2.5 was given');
            const group = createMeshInstances({ geometry: useCubeGeometry(), capacity: 2 });
            expect(() => group.set(2)).toThrow('set(2) is outside the 2 instances there is room for');
            expect(() => group.set(-1)).toThrow('outside');
            return createScene();
        });
    });

    it('cannot be made outside a scene, and says so under its own name', () => {
        expect(() => createMeshInstances({ geometry: null as never, capacity: 1 })).toThrow('createMeshInstances');
    });
});

describe('a run of instances, frame by frame', () => {
    it('goes up whole the first frame it is drawn, and not again while nothing changes', () => {
        const game = made();
        game.group.set(0, { x: 1 });
        game.group.set(1, { x: 2 });
        expect(game.group.instances.buffer).toBeNull();

        frame(game.store);
        const run = runOf(game);
        expect(run.usage).toBe('vertex');
        expect(run.size).toBe(4 * INSTANCE_BYTES);
        expect(run.writes).toBe(0);

        frame(game.store);
        frame(game.store);
        expect(run.writes).toBe(0);
        expect(game.renderer.buffers.filter((buffer) => buffer.size === 4 * INSTANCE_BYTES)).toHaveLength(1);
    });

    it('sends only the stretch that changed, from where it starts', () => {
        const game = made();
        for (let i = 0; i < 4; i++) game.group.set(i, { x: i });
        frame(game.store);

        game.group.set(2, { x: 20 });
        game.group.set(1, { x: 10 });
        frame(game.store);

        const run = runOf(game);
        expect(run.writes).toBe(1);
        expect(run.lastAt).toBe(1 * INSTANCE_BYTES);
        expect(run.data).toHaveLength(2 * INSTANCE_FLOATS);
        expect(run.data[3]).toBe(10);
        expect(run.data[INSTANCE_FLOATS + 3]).toBe(20);

        frame(game.store);
        expect(run.writes).toBe(1);
    });

    it('is drawn as its model, with how many to draw kept within its room', () => {
        const game = made();
        game.group.set(0);
        game.group.set(1);

        game.group.count = 9;
        const ctx = frame(game.store);
        const drawn = (ctx.passes[0]!.drawables ?? []).find((item) => item.type === 'mesh') as TDrawMesh;
        expect(drawn).toBe(game.group as unknown as TDrawMesh);
        expect(drawn.instances!.count).toBe(4);
        expect(drawn.instances!.buffer).toBe(game.group.instances.buffer);

        game.group.count = -3;
        frame(game.store);
        expect(game.group.instances.count).toBe(0);

        game.group.count = 1.9;
        frame(game.store);
        expect(game.group.instances.count).toBe(1);
    });

    it('measures the box all its drawn instances fit in, and again when one moves or fewer are drawn', () => {
        const game = made();
        game.group.set(0, { x: -4 });
        game.group.set(1, { x: 6, scale: 2 });
        frame(game.store);

        // A unit cube at -4, and one twice the size at 6.
        expect(game.group.instances.bounds).toEqual({ min: { x: -4.5, y: -1, z: -1 }, max: { x: 7, y: 1, z: 1 } });
        expect(meshBoundsOf(game.group as unknown as TDrawMesh)).toBe(game.group.instances.bounds);
        const before = game.group.instances.bounds;

        frame(game.store);
        expect(game.group.instances.bounds).toBe(before);

        game.group.set(0, { x: -10 });
        frame(game.store);
        expect(game.group.instances.bounds!.min.x).toBe(-10.5);

        game.group.count = 1;
        frame(game.store);
        expect(game.group.instances.bounds).toEqual({ min: { x: -10.5, y: -0.5, z: -0.5 }, max: { x: -9.5, y: 0.5, z: 0.5 } });

        game.group.count = 0;
        frame(game.store);
        expect(game.group.instances.bounds).toBeNull();
    });

    it('lets go of its run on the card when it is destroyed', () => {
        const game = made();
        game.group.set(0);
        frame(game.store);
        const run = runOf(game);
        expect(run.alive).toBe(true);

        destroy(game.group);
        flushDestroyed(game.store);
        expect(run.alive).toBe(false);
        expect(game.group.instances.buffer).toBeNull();
    });

    it('is left out of a scene document, whose code says again where each one is', () => {
        const game = createTestGame();
        const box = startTestScene(game.store, 'Level', () => {
            createMesh({ geometry: useCubeGeometry() });
            createMeshInstances({ geometry: useCubeGeometry(), capacity: 3 }).set(0);
            return createScene();
        });

        const written = JSON.stringify(serializeScene(box));
        expect(written.match(/"type":"mesh"/g)).toHaveLength(1);
    });
});

describe('a group the camera cannot see', () => {
    const eye: TDrawCamera3d = {
        projection: 'perspective',
        transform: { x: 0, y: 0, z: 10, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
        fov: 60, near: 0.1, far: 50, zoom: 1,
    };
    const view = fillCameraSpace(newCameraSpace(), eye, 320, 240).viewProjection;

    /** A group at the middle of the world whose instances are in `bounds`. */
    const group = (bounds: NonNullable<TDrawMesh['instances']>['bounds'], fields: Record<string, unknown> = {}): TDrawMesh => ({
        type: 'mesh',
        geometry: {
            vertexBuffer: null, indexBuffer: null, indexCount: 0, indexType: 'uint16',
            skinBuffer: null, colorBuffer: null, detailBuffer: null,
            bounds: { min: { x: -0.5, y: -0.5, z: -0.5 }, max: { x: 0.5, y: 0.5, z: 0.5 } },
        },
        transform: { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
        material: { vertex: null, vertexGlsl: null } as unknown as TDrawMesh['material'],
        skeleton: null,
        instances: { buffer: null, count: 2, bounds },
        ...fields,
    }) as TDrawMesh;

    it('is judged by the box around its instances, not by its shape at its own place', () => {
        // The shape itself would be in view at the middle; every instance is far to the left.
        expect(meshInView(group({ min: { x: -80, y: -1, z: -1 }, max: { x: -60, y: 1, z: 1 } }), view)).toBe(false);
        // And the other way: the shape's own place would be judged the same, but one instance reaches in.
        expect(meshInView(group({ min: { x: -80, y: -1, z: -1 }, max: { x: 0, y: 1, z: 1 } }), view)).toBe(true);
    });

    it('is judged by its instances even when it was handed bones, which it never bends by', () => {
        const far = { key: 'rig', jointMatrices: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 80, 0, 0, 1]) };
        expect(meshInView(group({ min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } }, { skeleton: far }), view)).toBe(true);
    });

    it('is never skipped while its box is not known', () => {
        expect(meshInView(group(null, { transform: { x: -80, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } }), view)).toBe(true);
    });
});

describe('the warning about a caster outside what the sun covers', () => {
    const sun = { type: 'directional', color: { r: 1, g: 1, b: 1, a: 1 }, intensity: 1, castShadow: true, shadowArea: 10, transform: { x: 0, y: 0, z: 0, rotation: 0, rotationX: -Math.PI / 2, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } };
    const at = (x: number, bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null) => ({
        type: 'mesh',
        transform: { x, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
        instances: { buffer: null, count: 1, bounds },
    }) as unknown as TDrawMesh;

    it('judges a group by where its instances are, not where the group itself is', () => {
        const matrix = lightSpaceMatrix(sun as never, null, new Float32Array(16));
        const warn = console.warn;
        const said: unknown[] = [];
        console.warn = (...args: unknown[]) => { said.push(args); };
        try {
            // The group is far out, its instances brought back to the middle: no warning.
            reportCastersOutside([at(500, { min: { x: -501, y: -1, z: -1 }, max: { x: -499, y: 1, z: 1 } })], sun as never, matrix, {});
            expect(said).toHaveLength(0);
            // The group at the middle, its instances far out: warned.
            reportCastersOutside([at(0, { min: { x: 499, y: -1, z: -1 }, max: { x: 501, y: 1, z: 1 } })], sun as never, matrix, {});
            expect(said).toHaveLength(1);
        } finally {
            console.warn = warn;
        }
    });
});

describe('what a shader reads of an instance', () => {
    const places = [0, 1, 2, 3, 4].map((i) => INSTANCE_LOCATION + i);

    it('is laid out on the card as five groups of four, once an instance', () => {
        expect(MESH_INSTANCES.stepMode).toBe('instance');
        expect(MESH_INSTANCES.arrayStride).toBe(INSTANCE_BYTES);
        expect([...MESH_INSTANCES.attributes].map((a) => [a.shaderLocation, a.offset, a.format])).toEqual(
            places.map((place, i) => [place, i * 16, 'float32x4']),
        );
        // After everything a corner has, so a shape is bound the same way drawn once or many times.
        expect(INSTANCE_LOCATION).toBe(8);
    });

    it('places each corner by its instance in the built-in shader, in both languages', () => {
        const wgsl = instancedShaderFor('back');
        const glsl = instancedVertexGlsl('back');

        for (const place of places) {
            expect(wgsl).toContain(`@location(${place}) instance`);
            expect(glsl).toContain(`layout(location = ${place}) in vec4 aInstance`);
        }
        expect(wgsl).toContain('uniforms.mvp * placed');
        expect(glsl).toContain('uniforms.mvp * placed');
        // Its colour over the one painted on the corners.
        expect(wgsl).toContain('out.color = color * instanceColor;');
        expect(glsl).toContain('vColor = aColor * aInstanceColor;');
        // Lit along its own surface, however its instance is stretched.
        expect(wgsl).toContain('facingTurnOf(mat3x3<f32>(instance[0].xyz, instance[1].xyz, instance[2].xyz)) * normal');
        expect(glsl).toContain('facingTurnOf(mat3(instance)) * aNormal');
    });

    it('shares its ending with a single model, word for word', () => {
        const single = meshShaderFor('none', true);
        const many = instancedShaderFor('none', true);
        expect(many.slice(many.indexOf('@fragment'))).toBe(single.slice(single.indexOf('@fragment')));
        // On the other card the ending is the same program text, used unchanged.
        expect(meshFragmentGlsl('none', true)).toContain('void main()');
    });

    it('leaves a single model reading nothing of one', () => {
        expect(meshShaderFor('back')).not.toContain('instanceRow0');
        expect(meshVertexGlsl('back')).not.toContain('aInstanceRow0');
        expect(buildMeshMaterialShader(null, null, {})).not.toContain('instanceRow0');
        expect(buildMeshMaterialShaderGlsl(null, null, {}).vertex).not.toContain('aInstanceRow0');
    });

    it('casts every instance where it stands, whole and cut out', () => {
        expect(SHADOW_INSTANCED_WGSL).toContain('shadow.lightViewProj * shadow.model * (instance * vec4<f32>(position, 1.0))');
        expect(SHADOW_INSTANCED_VERTEX_GLSL).toContain('uLightViewProj * uModel * (instancePlace() * vec4(aPosition, 1.0))');
        expect(SHADOW_CUT_INSTANCED_WGSL).toContain('out.alpha = color.a * instanceColor.a;');
        expect(SHADOW_CUT_INSTANCED_VERTEX_GLSL).toContain('vAlpha = aColor.a * aInstanceColor.a;');
    });
});

describe('a material on a model drawn as many', () => {
    const VERT = 'fn vertex(pos: vec3<f32>, ctx: VertContext) -> vec3<f32> { carry = ctx.instance; return pos + ctx.origin; }';
    const VERT_GLSL = 'vec3 vertex(vec3 pos, VertContext ctx) { carry = ctx.instance; return pos + ctx.origin; }';

    it('runs its corner hook after the instance has placed the corner, and tells it about the instance', () => {
        const wgsl = buildMeshMaterialShader(null, VERT, {}, [], false, 'back', true);
        const glsl = buildMeshMaterialShaderGlsl(null, VERT_GLSL, {}, [], false, 'back', true).vertex;

        expect(wgsl).toContain('let rest = (instance * vec4<f32>(position, 1.0)).xyz;');
        expect(wgsl).toContain('let local = vertex(rest, ctx);');
        expect(wgsl).toContain('ctx.instance = restInstance;');
        expect(wgsl).toContain('let restInstance = instanceData;');
        expect(wgsl).toContain('let restOrigin = instance[3].xyz;');
        expect(wgsl).toContain('let restColor = color * instanceColor;');
        // The surface measured again where the hook moved it, from where the instance put it.
        expect(wgsl).toContain('vertex(rest + tangent *');

        expect(glsl).toContain('vec3 rest = (instance * vec4(aPosition, 1.0)).xyz;');
        expect(glsl).toContain('vec3 local = vertex(rest, ctx);');
        expect(glsl).toContain('vec4 restInstance = aInstanceData;');
        expect(glsl).toContain('vec3 restOrigin = instance[3].xyz;');
        expect(glsl).toContain('vColor = restColor;');
        expect(glsl).toContain('vertex(rest + tangent *');
    });

    it('tells a single model zeros, so one hook is written for both', () => {
        const wgsl = buildMeshMaterialShader(null, VERT, {});
        const glsl = buildMeshMaterialShaderGlsl(null, VERT_GLSL, {}).vertex;

        expect(wgsl).toContain('let rest = position;');
        expect(wgsl).toContain('let restInstance = vec4<f32>(0.0);');
        expect(wgsl).toContain('let restOrigin = vec3<f32>(0.0);');
        expect(glsl).toContain('vec3 rest = aPosition;');
        expect(glsl).toContain('vec4 restInstance = vec4(0.0);');
    });

    it('carries no more to the colour stage than a single model does', () => {
        const outs = (vertex: string) => [...vertex.matchAll(/^\s*out\s+\w+\s+\w+\s*;/gm)].map((m) => m[0].trim());
        for (const cull of ['back', 'front', 'none'] as const) {
            expect(outs(buildMeshMaterialShaderGlsl(null, VERT_GLSL, {}, [], false, cull, true).vertex))
                .toEqual(outs(buildMeshMaterialShaderGlsl(null, VERT_GLSL, {}, [], false, cull).vertex));
            expect(outs(instancedVertexGlsl(cull))).toEqual(outs(meshVertexGlsl(cull)));
        }
    });

    it('moves the corners of its shadow the same way, whole and cut out', () => {
        for (const cut of [null, { fragment: null }]) {
            const wgsl = buildMeshMaterialShadowShader(VERT, {}, [], false, cut, true);
            const glsl = buildMeshMaterialShadowShaderGlsl(VERT_GLSL, {}, [], false, cut, true).vertex;
            expect(wgsl).toContain('let local = vertex(rest, ctx);');
            expect(wgsl).toContain('let rest = (instance * vec4<f32>(position, 1.0)).xyz;');
            expect(wgsl).toContain('fn facingTurnOf');
            expect(glsl).toContain('vec3 rest = (instance * vec4(aPosition, 1.0)).xyz;');
            expect(glsl.match(/mat3 facingTurnOf/g)).toHaveLength(1);
        }
    });

    it('is reached from the composer, in the vertex stage', () => {
        const compiled = compileShader({
            shader: 'mesh3d',
            position: composerAdd(composerAdd(composerVertexPosition(), composerInstanceOrigin()), composerSwizzle(composerInstanceData(), 'xyz')),
        });
        expect(compiled.vertex).toContain('ctx.origin');
        expect(compiled.vertex).toContain('ctx.instance');
        expect(compiled.vertexGlsl).toContain('ctx.origin');
        expect(compiled.vertexGlsl).toContain('ctx.instance');
    });

    it('wears a material made for it like any model', () => {
        const { group } = made({ material: createMaterial({ shader: 'mesh3d', vertex: VERT, vertexGlsl: VERT_GLSL }) });
        expect(group.material.vertex).toBe(VERT);
    });
});

describe('writing part of a buffer', () => {
    it('starts where it is told on WebGPU, and refuses what would run past the end', () => {
        const writes: Array<[number, number]> = [];
        const device = { queue: { writeBuffer: (_buffer: unknown, at: number, data: ArrayBufferView) => { writes.push([at, data.byteLength]); } } } as unknown as GPUDevice;
        const buffer = { resourceType: 'buffer', gpuBuffer: {}, capacity: 160 } as unknown as IBuffer;

        updateWebGPUBuffer(device, buffer, new Float32Array(20), 80);
        updateWebGPUBuffer(device, buffer, new Float32Array(20));
        expect(writes).toEqual([[80, 80], [0, 80]]);
        expect(() => updateWebGPUBuffer(device, buffer, new Float32Array(20), 120)).toThrow('80 bytes at 120 do not fit in a buffer of 160');
    });

    it('starts where it is told on WebGL2, and keeps it for a restore', () => {
        const writes: Array<[number, number]> = [];
        const gl = {
            ARRAY_BUFFER: 1, ELEMENT_ARRAY_BUFFER: 2, UNIFORM_BUFFER: 3, DYNAMIC_DRAW: 4,
            createBuffer: () => ({}), bindBuffer: () => {}, bufferData: () => {},
            bufferSubData: (_target: number, at: number, data: ArrayBufferView) => { writes.push([at, data.byteLength]); },
        } as unknown as WebGL2RenderingContext;
        const buffer = createWebGL2Buffer(gl, false, new Float32Array(40), 'vertex');

        updateWebGL2Buffer(gl, false, buffer, new Float32Array(20).fill(7), 80);
        expect(writes).toEqual([[80, 80]]);
        const kept = new Float32Array(buffer.kept.buffer, buffer.kept.byteOffset, 40);
        expect(kept[19]).toBe(0);
        expect(kept[20]).toBe(7);
        expect(() => updateWebGL2Buffer(gl, false, buffer, new Float32Array(21), 80)).toThrow('do not fit');
    });
});

describe('the bindings of a shape drawn as many on WebGL2', () => {
    /** A card that remembers which attributes were pointed where, and how often each is read. */
    const recordingGl = () => {
        const divisors = new Map<number, number>();
        const pointers: Array<[number, number, number]> = [];
        const deleted: unknown[] = [];
        let made = 0;
        const gl = {
            ARRAY_BUFFER: 1, ELEMENT_ARRAY_BUFFER: 2, FLOAT: 3, UNSIGNED_BYTE: 4,
            createVertexArray: () => ({ vao: ++made }),
            deleteVertexArray: (vao: unknown) => { deleted.push(vao); },
            bindVertexArray: () => {}, bindBuffer: () => {}, enableVertexAttribArray: () => {},
            vertexAttribPointer: (place: number, _size: number, _type: number, _norm: boolean, stride: number, offset: number) => { pointers.push([place, stride, offset]); },
            vertexAttribDivisor: (place: number, divisor: number) => { divisors.set(place, divisor); },
        } as unknown as WebGL2RenderingContext;
        return { gl, divisors, pointers, deleted, count: () => made };
    };
    const buffer = (): IBuffer => ({ resourceType: 'buffer', glBuffer: {} }) as unknown as IBuffer;
    const meshes = () => ({ vertexArrays: new WeakMap(), skinnedVertexArrays: new WeakMap(), instancedVertexArrays: new WeakMap() }) as unknown as TGlMeshPipeline;
    const shape = () => ({
        vertexBuffer: buffer(), indexBuffer: buffer(), indexCount: 36, indexType: 'uint16' as const,
        skinBuffer: null, colorBuffer: buffer(), detailBuffer: buffer(),
    });
    const drawn = (geometry: ReturnType<typeof shape>, run: IBuffer | null): TDrawMesh => ({ geometry, instances: { buffer: run, count: 2, bounds: null } }) as unknown as TDrawMesh;

    it('reads the instance once an instance, after the corners, and keeps the bindings by the run', () => {
        const { gl, divisors, pointers, count } = recordingGl();
        const held = meshes();
        const geometry = shape();
        const run = buffer();

        const vao = vertexArrayFor(gl, held, drawn(geometry, run));
        expect(vao).not.toBeNull();
        expect([...divisors]).toEqual([8, 9, 10, 11, 12].map((place) => [place, 1]));
        expect(pointers.filter(([place]) => place >= 8)).toEqual([8, 9, 10, 11, 12].map((place, i) => [place, INSTANCE_BYTES, i * 16]));
        // Its corners as any model's: where, facing and picture, colour, detail. No bones.
        expect(pointers.filter(([place]) => place < 8).map(([place]) => place)).toEqual([0, 1, 2, 5, 6, 7]);

        expect(vertexArrayFor(gl, held, drawn(geometry, run))).toBe(vao);
        expect(count()).toBe(1);
        // The same shape drawn once keeps bindings of its own.
        expect(vertexArrayFor(gl, held, { geometry } as unknown as TDrawMesh)).not.toBe(vao);
    });

    it('binds again when the shape was made again, and has none before the run is on the card', () => {
        const { gl, deleted, count } = recordingGl();
        const held = meshes();
        const run = buffer();

        const first = vertexArrayFor(gl, held, drawn(shape(), run));
        const second = vertexArrayFor(gl, held, drawn(shape(), run));
        expect(second).not.toBe(first);
        expect(deleted).toEqual([first]);
        expect(count()).toBe(2);

        expect(vertexArrayFor(gl, held, drawn(shape(), null))).toBeNull();
    });
});
