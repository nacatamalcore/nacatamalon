import { describe, expect, it } from 'bun:test';
import * as webgpuInstances from '../src/render/webgpu/sprite/write_sprite_instance';
import * as webgl2Instances from '../src/render/webgl2/sprite/write_sprite_instances';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createText } from '../src/gameobjects/text/create_text';
import { createNineSlice } from '../src/gameobjects/nine_slice/create_nine_slice';
import { textBlockSize } from '../src/gameobjects/text/expand_text';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useCameraFollow } from '../src/hooks/camera/use_camera_follow';
import { useScreenSpace } from '../src/hooks/camera/use_screen_space';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useUpdate } from '../src/hooks/loop/use_update';
import { usePointer } from '../src/hooks/input/use_pointer';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import { createTestFont } from './helpers/test_font';
import type { TFrameContext, TDrawSprite } from '../src/render/interface';
import type { TSpritePipeline as TWebGPUSpritePipeline } from '../src/render/webgpu/sprite/types/t_sprite_pipeline';
import type { TSpritePipeline as TWebGL2SpritePipeline } from '../src/render/webgl2/sprite/types/t_sprite_pipeline';
import type { TPixelSnap } from '../src/game/types/t_game_options';
import type { TTexture } from '../src/loaders';
import type { TCameraFollow } from '../src/hooks/camera/use_camera_follow';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';

/**
 * The edges of what is drawn on whole pixels, not only its place. A sprite 5 wide held by its middle
 * on a whole pixel has its edges on halves, and there the graphics card decides which texel each
 * column shows: WebGPU and WebGL2 decided it differently, a column apart, or showed one column twice.
 * Put on the pixel before, nothing is left for the card to decide. Only that tie moves anything:
 * an edge anywhere else between two pixels is left where it was.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = (x: number, y: number, rotation = 0) => ({ x, y, rotation, scaleX: 1, scaleY: 1 });

/** Where its top-left corner is drawn, from where it is drawn and the point it is held by. */
const cornerOf = (thing: { worldTransform?: { x: number; y: number; scaleX: number; scaleY: number } }, held: { x: number; y: number }, width: number, height: number) => {
    const place = thing.worldTransform!;
    return [place.x - held.x * width * place.scaleX, place.y - held.y * height * place.scaleY];
};

const frame = (store: Parameters<typeof fillFrameContext>[0]) => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return ctx.passes[0]!;
};

const scene = (body: () => void, snap: TPixelSnap = 'game') => {
    const { store } = createTestGame({ pixelSnap: snap });
    startTestScene(store, 'Level', () => {
        body();
        return createScene();
    });
    return store;
};

describe('the edges on whole pixels', () => {
    it('moves a sprite of odd size held by its middle back half a pixel, so its edges are whole', () => {
        let odd!: ReturnType<typeof createSprite>;
        let even!: ReturnType<typeof createSprite>;
        frame(scene(() => {
            odd = createSprite({ width: 5, height: 7, tint, transform: at(10, 20) });
            even = createSprite({ width: 8, height: 8, tint, transform: at(10, 20) });
        }));
        // 7.5 and 16.5 are between two pixels: the one before.
        expect(cornerOf(odd, { x: 0.5, y: 0.5 }, 5, 7)).toEqual([7, 16]);
        expect([odd.worldTransform!.x, odd.worldTransform!.y]).toEqual([9.5, 19.5]);
        // An even one already had its edges on pixels, and is drawn where it was.
        expect([even.worldTransform!.x, even.worldTransform!.y]).toEqual([10, 20]);
        // Where they are is not touched.
        expect([odd.transform.x, odd.transform.y]).toEqual([10, 20]);
    });

    it('rounds its place first, as before, and only then puts the edge on the pixel before', () => {
        let sprite!: ReturnType<typeof createSprite>;
        frame(scene(() => {
            sprite = createSprite({ width: 5, height: 5, tint, transform: at(10.6, 20.4) });
        }));
        // 11 and 20, edges at 8.5 and 17.5: 8 and 17.
        expect(cornerOf(sprite, { x: 0.5, y: 0.5 }, 5, 5)).toEqual([8, 17]);
    });

    it('leaves a turned sprite with its place rounded and nothing more: a turned edge is on no grid', () => {
        let sprite!: ReturnType<typeof createSprite>;
        frame(scene(() => {
            sprite = createSprite({ width: 5, height: 5, tint, transform: at(10.4, 20.4, 0.3) });
        }));
        expect([sprite.worldTransform!.x, sprite.worldTransform!.y]).toEqual([10, 20]);
    });

    it('puts the edges of a text held by its middle and of a panel on whole pixels too', () => {
        const font = createTestFont();
        let text!: ReturnType<typeof createText>;
        let corner!: ReturnType<typeof createText>;
        let panel!: ReturnType<typeof createNineSlice>;
        const store = scene(() => {
            // 17 wide, so by its middle its edge would be on a half.
            text = createText({ text: 'AB', font, anchor: { x: 0.5, y: 0.5 }, transform: at(40, 40) });
            corner = createText({ text: 'ABC', font, transform: at(40.4, 60.6) });
            panel = createNineSlice({ texture: { width: 24, height: 24 } as TTexture, slice: 8, width: 25, height: 31, transform: at(80, 80) });
        });
        frame(store);
        const { width, height } = textBlockSize(text);
        const [x, y] = cornerOf(text, { x: 0.5, y: 0.5 }, width, height);
        expect([Number.isInteger(x), Number.isInteger(y)]).toEqual([true, true]);
        // Held by its corner, as a text is unless it says, it is the place that is rounded.
        expect([corner.worldTransform!.x, corner.worldTransform!.y]).toEqual([40, 61]);
        expect(cornerOf(panel, { x: 0.5, y: 0.5 }, 25, 31)).toEqual([67, 64]);
    });

    it('takes the pivot into account: the edge is whole wherever the picture is held from', () => {
        let sprite!: ReturnType<typeof createSprite>;
        const store = scene(() => {
            sprite = createSprite({ width: 5, height: 5, tint, pivot: { x: 0, y: 0 }, transform: at(10, 10) });
        });
        frame(store);
        // Unturned, the pivot does not move it: it still sits by its middle, with the edge whole.
        expect(cornerOf(sprite, { x: 0.5, y: 0.5 }, 5, 5)).toEqual([7, 7]);
        // And that is where both backends draw it from, held by the pivot.
        const drawables = (frame(store).drawables ?? []) as TDrawSprite[];
        const gpu = webgpuPipeline();
        webgpuInstances.writeSpriteInstances(nothing() as GPUDevice, gpu, drawables, drawables.map(() => -1));
        const data = gpu.instanceData;
        expect([data[0]! - data[15]! * data[2]! * data[5]!, data[1]! - data[16]! * data[3]! * data[6]!]).toEqual([7, 7]);
    });

    it('puts the edges on the screen\'s pixels when zoomed, which at zoom 3 are thirds', () => {
        let sprite!: ReturnType<typeof createSprite>;
        frame(scene(() => {
            useCamera2d({ zoom: 3 });
            sprite = createSprite({ width: 5, height: 5, tint, transform: at(10, 10) });
        }, 'screen'));
        const [x] = cornerOf(sprite, { x: 0.5, y: 0.5 }, 5, 5);
        // 7.5 is 22.5 screen pixels: 22.
        expect(x * 3).toBeCloseTo(22, 9);
    });

    it('leaves an edge alone that is between two pixels but not on the half: only the tie moves', () => {
        let sprite!: TSprite;
        frame(scene(() => {
            // 5 × 0.7 is 3.5 wide, the edge 1.75 left of 10: nowhere near a tie.
            sprite = createSprite({ width: 5, height: 5, tint, transform: { x: 10, y: 10, rotation: 0, scaleX: 0.7, scaleY: 1 } });
        }));
        expect(sprite.worldTransform!.x).toBe(10);
    });

    it('lets a sprite growing by fractions grow: its far edge never steps back', () => {
        let sprite!: TSprite;
        const store = scene(() => {
            sprite = createSprite({ width: 5, height: 5, tint, transform: at(10, 10) });
        });
        let last = -Infinity;
        for (let scale = 0.5; scale <= 1.5; scale += 0.01) {
            sprite.transform.scaleX = scale;
            frame(store);
            const right = sprite.worldTransform!.x + 0.5 * 5 * scale;
            // The last column covered: the one whose middle is left of the edge.
            const column = Math.ceil(right - 0.5) - 1;
            expect(column).toBeGreaterThanOrEqual(last);
            last = column;
        }
    });

    it('puts the edges of a sprite turned the other way on whole pixels too', () => {
        let sprite!: TSprite;
        frame(scene(() => {
            sprite = createSprite({ width: 5, height: 5, tint, transform: { x: 10, y: 10, rotation: 0, scaleX: -1, scaleY: 1 } });
        }));
        const [x] = cornerOf(sprite, { x: 0.5, y: 0.5 }, 5, 5);
        expect(Number.isInteger(x)).toBe(true);
    });

    it('takes a whole turn as no turn, where a spin that went round once stops', () => {
        let sprite!: TSprite;
        frame(scene(() => {
            sprite = createSprite({ width: 5, height: 5, tint, transform: at(10, 10, Math.PI * 2) });
        }));
        expect(cornerOf(sprite, { x: 0.5, y: 0.5 }, 5, 5)).toEqual([7, 7]);
    });

    it('puts the edges of a layer with parallax on whole pixels', () => {
        let sprite!: TSprite;
        frame(scene(() => {
            useCamera2d({ transform: { x: 37.3, y: 0 } });
            sprite = createSprite({ width: 5, height: 5, tint, parallax: { x: 0.5, y: 1 }, transform: at(100, 10) });
        }));
        const [x] = cornerOf(sprite, { x: 0.5, y: 0.5 }, 5, 5);
        expect(Math.abs(x - Math.round(x))).toBeLessThan(1e-9);
    });

    it('puts the edges of what is pinned to the screen on its pixels, zoom or not', () => {
        let pinned!: TSprite;
        frame(scene(() => {
            useCamera2d({ zoom: 3 });
            useSpawn(function Hud() {
                useScreenSpace();
                pinned = createSprite({ width: 5, height: 5, tint, transform: at(10, 10) });
            })();
        }, 'screen'));
        expect(cornerOf(pinned, { x: 0.5, y: 0.5 }, 5, 5)).toEqual([7, 7]);
    });

    it('puts the edge on a pixel inside a grown box, held by a pivot', () => {
        const store = scene(() => {
            useSpawn(function Big() {
                useTransform({ x: 0, y: 0, scaleX: 3, scaleY: 3 });
                createSprite({ width: 5, height: 5, tint, pivot: { x: 0, y: 0 }, transform: at(20, 20) });
            })();
        });
        const drawables = (frame(store).drawables ?? []) as TDrawSprite[];
        const gpu = webgpuPipeline();
        webgpuInstances.writeSpriteInstances(nothing() as GPUDevice, gpu, drawables, drawables.map(() => -1));
        const data = gpu.instanceData;
        const x = data[0]! - data[15]! * data[2]! * data[5]!;
        expect(Math.abs(x - Math.round(x))).toBeLessThan(1e-9);
    });

    it('keeps a sprite of odd size that the camera follows on the same pixel of the screen', () => {
        const run = (pixelSnap: TPixelSnap) => {
            const { store } = createTestGame({ pixelSnap }, createFakeCanvas(320, 224));
            const ctx = createFrameContext();
            let hero!: TSprite;
            let follow!: TCameraFollow;
            registerScene(store, 'Level', () => {
                const object = useSpawn(function Hero() {
                    hero = createSprite({ width: 13, height: 25, tint, transform: at(100, 100) });
                    useUpdate((delta) => { hero.transform.x += 110 * delta; });
                })();
                follow = useCameraFollow(object, { deadzone: { width: 48, height: 64 } });
                return createScene();
            });
            startScene(store, 'Level');
            let now = 0;
            const onScreen = new Set<number>();
            for (let i = 0; i < 90; i++) {
                const prev = now;
                now += 1000 / 60;
                tick(store, ctx, now, prev);
                if (i > 30) onScreen.add(Math.round((hero.worldTransform!.x - 6.5 - follow.camera.transform.x) * 1000) / 1000);
            }
            return onScreen;
        };
        expect(run('game').size).toBe(1);
        expect(run('screen').size).toBe(1);
    });

    it('is touched where it is drawn: its first column and its last, and not the one past it', () => {
        const canvas = createFakeCanvas(320, 224);
        const { store } = createTestGame({ pixelSnap: 'game' }, canvas);
        const ctx = createFrameContext();
        let hits = 0;
        registerScene(store, 'Level', () => {
            createSprite({ width: 5, height: 5, tint, transform: at(10, 10), onClick: () => { hits++; } });
            usePointer();
            return createScene();
        });
        startScene(store, 'Level');
        tick(store, ctx, 0, 0);
        const click = (x: number) => {
            const before = hits;
            for (const type of ['pointerdown', 'pointerup']) {
                canvas.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: 10, button: 0, buttons: type === 'pointerdown' ? 1 : 0, pointerId: 1, pointerType: 'mouse' }));
            }
            tick(store, ctx, 1000 / 60, 0);
            return hits > before;
        };
        // Drawn on columns 7 to 11.
        expect([click(6.5), click(7.5), click(11.5), click(12.5)]).toEqual([false, true, true, false]);
    });

    it('puts the letters of a text held by its middle on whole pixels, from one layout a frame', () => {
        const font = createTestFont();
        const store = scene(() => {
            createText({ text: 'AB', font, anchor: { x: 0.5, y: 0.5 }, transform: at(40, 40) });
        });
        const letters = (frame(store).drawables ?? []) as TDrawSprite[];
        // 'AB' is 17 wide: held by its middle at 40, its edge would be on 31.5.
        expect(letters.length).toBe(2);
        for (const letter of letters) {
            expect(Number.isInteger(letter.transform.x) && Number.isInteger(letter.transform.y)).toBe(true);
        }
    });

    it('leaves it all alone when pixelSnap is off', () => {
        let sprite!: ReturnType<typeof createSprite>;
        frame(scene(() => {
            sprite = createSprite({ width: 5, height: 5, tint, transform: at(10, 10) });
        }, 'off'));
        expect(sprite.worldTransform?.x ?? sprite.transform.x).toBe(10);
    });
});

/** Anything asked of it is a function that does nothing and returns an empty object. */
const nothing = (): unknown => new Proxy(() => ({}), { get: () => nothing() });

Object.assign(globalThis, { GPUBufferUsage: { VERTEX: 32, COPY_DST: 8 } });

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

describe('both backends', () => {
    // The two place a sprite with the same code (pivotPlace, spriteSize), so what this pins is that
    // what they are handed has its corners whole, for every way of holding it.
    it('are handed sprites with whole corners, and write the same ones', () => {
        const store = scene(() => {
            createSprite({ width: 5, height: 7, tint, transform: at(10, 20) });
            createSprite({ width: 167, height: 9, tint, transform: at(130, 60.3) });
            createSprite({ width: 4, height: 4, tint, anchor: { x: 1, y: 1 }, transform: at(33.5, 12.5) });
        });
        const drawables = (frame(store).drawables ?? []) as TDrawSprite[];
        const cameras = drawables.map(() => -1);
        const gpu = webgpuPipeline();
        const gl = webgl2Pipeline();
        webgpuInstances.writeSpriteInstances(nothing() as GPUDevice, gpu, drawables, cameras);
        webgl2Instances.writeSpriteInstances(nothing() as WebGL2RenderingContext, gl, drawables, cameras);
        const corners = (data: Float32Array) => drawables.map((_, i) => {
            const o = i * webgpuInstances.SPRITE_FLOATS;
            // x less anchor × width × scale, and the same down.
            return [data[o]! - data[o + 15]! * data[o + 2]! * data[o + 5]!, data[o + 1]! - data[o + 16]! * data[o + 3]! * data[o + 6]!];
        });
        expect(corners(gl.instanceData)).toEqual(corners(gpu.instanceData));
        for (const [x, y] of corners(gpu.instanceData)) {
            expect([Number.isInteger(x), Number.isInteger(y)]).toEqual([true, true]);
        }
    });
});
