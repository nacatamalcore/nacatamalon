import { describe, expect, it } from 'bun:test';
import * as webgpuInstances from '../src/render/webgpu/sprite/write_sprite_instance';
import * as webgl2Instances from '../src/render/webgl2/sprite/write_sprite_instances';
import type { TSpritePipeline as TWebGPUSpritePipeline } from '../src/render/webgpu/sprite/types/t_sprite_pipeline';
import type { TSpritePipeline as TWebGL2SpritePipeline } from '../src/render/webgl2/sprite/types/t_sprite_pipeline';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { createScene } from '../src/scene';
import { createText } from '../src/gameobjects/text/create_text';
import { createTestGame, startTestScene } from './helpers/test_game';
import { createTestFont } from './helpers/test_font';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import type { TSpriteMaterial } from '../src/materials';
import type { TFrameContext, TRenderPass } from '../src/render/interface';
import type { TRuntimeStore } from '../src/store';
import type { TDrawShader, TDrawSprite } from '../src/render/interface';

/**
 * How sprites are grouped into draws once effects exist.
 *
 * An effect is a different pipeline, and no call can set two, so it has to be part of what makes a
 * batch. The thing worth pinning is that it only costs what it has to: sprites sharing an effect
 * still come out in one call, and a screen of sprites with no effect at all is grouped exactly as it
 * was before any of this was written.
 *
 * Both backends are asked the same questions, because the two group by hand, separately.
 */

/**
 * Anything asked of it is a function that does nothing and returns an empty object.
 */
const nothing = (): unknown => new Proxy(() => ({}), { get: () => nothing() });

Object.assign(globalThis, { GPUBufferUsage: { VERTEX: 32, COPY_DST: 8 } });

const fakeDevice = nothing() as GPUDevice;
const fakeGl = nothing() as WebGL2RenderingContext;

const webgpuPipeline = (): TWebGPUSpritePipeline => ({
    pipeline: nothing() as GPURenderPipeline,
    distanceFieldPipeline: nothing() as GPURenderPipeline,
    additivePipeline: nothing() as GPURenderPipeline,
    additiveDistanceFieldPipeline: nothing() as GPURenderPipeline,
    layouts: nothing() as TWebGPUSpritePipeline['layouts'],
    materials: nothing() as TWebGPUSpritePipeline['materials'],
    distanceFieldMaterials: nothing() as TWebGPUSpritePipeline['materials'],
    quad: {} as GPUBuffer,
    bindGroup: {} as GPUBindGroup,
    instances: nothing() as GPUBuffer,
    instanceData: new Float32Array(webgpuInstances.INITIAL_SPRITE_CAPACITY * webgpuInstances.SPRITE_FLOATS),
    capacity: webgpuInstances.INITIAL_SPRITE_CAPACITY,
    samplers: { nearest: {} as GPUSampler, linear: {} as GPUSampler },
    defaultSmooth: false,
    whiteBindGroup: {} as GPUBindGroup,
    textureBindGroups: new WeakMap(),
    runs: [],
    runCount: 0,
});

const webgl2Pipeline = (): TWebGL2SpritePipeline => ({
    materials: nothing() as TWebGL2SpritePipeline['materials'],
    distanceFieldMaterials: nothing() as TWebGL2SpritePipeline['materials'],
    program: {} as WebGLProgram,
    distanceFieldProgram: {} as WebGLProgram,
    vao: {} as WebGLVertexArrayObject,
    quad: {} as WebGLBuffer,
    instances: {} as WebGLBuffer,
    instanceData: new Float32Array(webgl2Instances.INITIAL_SPRITE_CAPACITY * webgl2Instances.SPRITE_FLOATS),
    capacity: webgl2Instances.INITIAL_SPRITE_CAPACITY,
    samplers: { nearest: {} as WebGLSampler, linear: {} as WebGLSampler },
    defaultSmooth: false,
    whiteTexture: {} as WebGLTexture,
    runs: [],
    runCount: 0,
});

const sprite = (fields: Partial<TDrawSprite> = {}): TDrawSprite => ({
    type: 'sprite',
    transform: { x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 },
    texture: null,
    tint: { r: 1, g: 1, b: 1, a: 1 },
    width: 16,
    height: 16,
    ...fields,
});

const effect = (name: string): TDrawShader => ({
    id: name,
    name,
    fragment: `fn effect(color: vec4f, uv: vec2f) -> vec4f { return color; } // ${name}`,
    fragmentGlsl: `vec4 effect(vec4 color, vec2 uv) { return color; } // ${name}`,
    vertex: null,
    vertexGlsl: null,
    uniforms: { strength: 1 },
    uniformSig: { strength: 'f32' },
});

/**
 * One frame's worth of things to draw, which is where a text has already become its letters.
 */
const frame = (store: TRuntimeStore): TRenderPass => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return ctx.passes[0];
};

/**
 * How many draws each backend would make of this list.
 */
const runsFor = (drawables: TDrawSprite[]): { webgpu: number; webgl2: number } => {
    const gpu = webgpuPipeline();
    const gl = webgl2Pipeline();
    const cameras = drawables.map(() => -1);
    webgpuInstances.writeSpriteInstances(fakeDevice, gpu, drawables, cameras);
    webgl2Instances.writeSpriteInstances(fakeGl, gl, drawables, cameras);
    return { webgpu: gpu.runCount, webgl2: gl.runCount };
};

describe('grouping sprites once effects exist', () => {
    it('leaves a screen of plain sprites in one draw, exactly as before', () => {
        expect(runsFor([sprite(), sprite(), sprite(), sprite()])).toEqual({ webgpu: 1, webgl2: 1 });
    });

    it('keeps sprites sharing one effect in a single draw', () => {
        const crt = effect('crt');

        expect(runsFor([sprite({ material: crt }), sprite({ material: crt }), sprite({ material: crt })]))
            .toEqual({ webgpu: 1, webgl2: 1 });
    });

    it('splits where the effect changes, because no draw can run two shaders', () => {
        const crt = effect('crt');
        const blur = effect('blur');

        expect(runsFor([sprite({ material: crt }), sprite({ material: blur })]))
            .toEqual({ webgpu: 2, webgl2: 2 });
    });

    it('splits where an effect starts and where it ends', () => {
        const crt = effect('crt');

        expect(runsFor([sprite(), sprite({ material: crt }), sprite()]))
            .toEqual({ webgpu: 3, webgl2: 3 });
    });

    it('gives a sprite with its own settings a draw to itself, which is what they cost', () => {
        const crt = effect('crt');

        // Three sprites, one effect, but each turning its own knob: three draws and one compile.
        expect(runsFor([
            sprite({ material: crt, uniforms: { strength: 0.1 } }),
            sprite({ material: crt, uniforms: { strength: 0.5 } }),
            sprite({ material: crt, uniforms: { strength: 0.9 } }),
        ])).toEqual({ webgpu: 3, webgl2: 3 });
    });

    it('does not let one sprite with its own settings break the batch around it', () => {
        const crt = effect('crt');

        // The two plain ones on either side still find each other on their own sides.
        expect(runsFor([
            sprite({ material: crt }),
            sprite({ material: crt, uniforms: { strength: 0.5 } }),
            sprite({ material: crt }),
            sprite({ material: crt }),
        ])).toEqual({ webgpu: 3, webgl2: 3 });
    });

    it('splits where the blend changes, and keeps additive sprites together', () => {
        expect(runsFor([sprite({ blend: 'additive' }), sprite({ blend: 'additive' })]))
            .toEqual({ webgpu: 1, webgl2: 1 });
        expect(runsFor([sprite(), sprite({ blend: 'additive' }), sprite({ blend: 'alpha' })]))
            .toEqual({ webgpu: 3, webgl2: 3 });
        // `'alpha'` written out and left out are the same thing, so they still share a draw.
        expect(runsFor([sprite(), sprite({ blend: 'alpha' })])).toEqual({ webgpu: 1, webgl2: 1 });
    });

    it('splits an effect where its blend changes, since that is another pipeline', () => {
        const crt = effect('crt');

        expect(runsFor([sprite({ material: crt }), sprite({ material: crt, blend: 'additive' })]))
            .toEqual({ webgpu: 2, webgl2: 2 });
    });

    it('agrees with itself across the two backends, whatever the list', () => {
        const crt = effect('crt');
        const blur = effect('blur');
        const mixed = [
            sprite(), sprite({ material: crt }), sprite({ material: crt }),
            sprite({ material: blur }), sprite(), sprite(),
            sprite({ material: blur, uniforms: { strength: 0.2 } }),
        ];
        const counts = runsFor(mixed);

        expect(counts.webgpu).toBe(counts.webgl2);
    });
});

describe('what a text and a map layer do with a material', () => {
    it('gives every letter of a text the very same material object', () => {
        const { store } = createTestGame();
        const font = createTestFont();
        const shimmer = createMaterial({
            fragment: 'fn effect(color: vec4f, uv: vec2f) -> vec4f { return color; }',
            uniforms: { hue: 0.5 },
        }) as TSpriteMaterial;

        startTestScene(store, 'Level', () => {
            createText({
                text: 'ABC',
                font,
                material: shimmer,
                uniforms: { hue: 0.2 },
                transform: { x: 10, y: 10, rotation: 0, scaleX: 1, scaleY: 1 },
            });
            return createScene();
        });

        const letters = (frame(store).drawables ?? [])
            .filter((drawable): drawable is TDrawSprite => drawable.type === 'sprite');

        expect(letters.length).toBeGreaterThan(1);
        // The same object, not an equal one: sharing it by identity is what lets the batching above
        // keep a whole title in one draw instead of one draw per character.
        for (const letter of letters) {
            expect(letter.material).toBe(shimmer);
            expect(letter.uniforms).toEqual({ hue: 0.2 });
        }
        // Same material and same sheet on every letter is, by the rule proved above, one draw for
        // the whole title. Asserted as the two facts rather than run through a pretend card, because
        // that is what the rule is actually made of.
        const sheet = letters[0]!.texture;
        for (const letter of letters) {
            expect(letter.texture).toBe(sheet);
        }
    });
});
