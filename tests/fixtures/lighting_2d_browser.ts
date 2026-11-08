// Bundle for localhost and call window.probeLighting2d(backend). Checks real pixel values,
// including the batched, custom material and tilemap paths, with a moving camera and lamp.
import { createWebGPURenderer } from '../../src/render/webgpu/webgpu_renderer';
import { createWebGL2Renderer } from '../../src/render/webgl2/webgl2_renderer';
import { createTestGame, startTestScene } from '../helpers/test_game';
import { createParticles, createScene, createSprite, createMaterial, useLight2d, useAmbientLight2d, useCamera2d, useScreenSpace, useSpawn, useUnlit2d } from '../../src/index';
import type { TParticlesEffect2d } from '../../src/index';
import { fillFrameContext } from '../../src/game/loop/fill_frame_context';
import type { TDrawTilemapLayer } from '../../src/render/interface/draw/t_draw_tilemap_layer';
import type { TFrameContext } from '../../src/render';

(window as any).probeLighting2d = async (backend: 'WEBGPU' | 'WEBGL2') => {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 96; document.body.append(canvas);
    const renderer = await (backend === 'WEBGPU' ? createWebGPURenderer : createWebGL2Renderer)(canvas, { msaa: 1 });
    const { store } = createTestGame({ width: 128, height: 96, pixelSnap: 'off' }, canvas);
    store.setState('screen', { renderer });
    let lamp!: ReturnType<typeof useLight2d>;
    let camera!: ReturnType<typeof useCamera2d>;
    let flatMaterial!: ReturnType<typeof createMaterial>;
    const root = startTestScene(store, 'World', () => {
        useAmbientLight2d({ intensity: 0.1 });
        lamp = useLight2d({ transform: { x: 64, y: 48 }, radius: 40, color: '#ff0000', intensity: 0.8 });
        camera = useCamera2d();
        createSprite({ width: 128, height: 32, anchor: { x: 0, y: 0 }, transform: { x: 0, y: 0 } });
        const material = flatMaterial = createMaterial({
            fragment: 'fn effect(color: vec4f, uv: vec2f) -> vec4f { return color; }',
            fragmentGlsl: 'vec4 effect(vec4 color, vec2 uv) { return color; }',
        });
        createSprite({ width: 128, height: 32, anchor: { x: 0, y: 0 }, transform: { x: 0, y: 64 }, material });
        useSpawn(() => {
            useScreenSpace();
            createSprite({ width: 8, height: 8, anchor: { x: 0, y: 0 } });
        })();
        // Left out of the lights: white in the dark, in the world.
        useSpawn(() => {
            useUnlit2d();
            createSprite({ width: 8, height: 8, anchor: { x: 0, y: 0 }, transform: { x: 112, y: 84 } });
        })();
        // One green particle that stays put, lit like the rest of the world, and one left out.
        const still: TParticlesEffect2d = {
            kind: 'particles-2d', emission: { rate: 0, burst: 1, duration: 0, loop: false }, life: 1000, speed: 0, size: 8,
            colorOverLife: [{ t: 0, color: '#00ff00', alpha: 1 }, { t: 1, color: '#00ff00', alpha: 1 }],
            sizeOverLife: [{ t: 0, scale: 1 }, { t: 1, scale: 1 }],
        };
        createParticles({ effect: still, transform: { x: 24, y: 16 } });
        useSpawn(() => {
            useUnlit2d();
            createParticles({ effect: still, transform: { x: 104, y: 16 } });
        })();
        return createScene();
    });
    const corners = new Float32Array([
        0, 32, 0, 0, 0.5, 0.5, 0.5, 0.5, 128, 32, 1, 0, 0.5, 0.5, 0.5, 0.5, 0, 64, 0, 1, 0.5, 0.5, 0.5, 0.5,
        0, 64, 0, 1, 0.5, 0.5, 0.5, 0.5, 128, 32, 1, 0, 0.5, 0.5, 0.5, 0.5, 128, 64, 1, 1, 0.5, 0.5, 0.5, 0.5,
    ]);
    const buffer = renderer.createBuffer(corners, 'vertex');
    const texture = renderer.createDataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    let tilemap: TDrawTilemapLayer = {
        type: 'tilemap', transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        texture: { status: 'ready', gpu: texture, width: 1, height: 1 },
        tint: { r: 1, g: 1, b: 1, a: 1 }, meshes: [{ buffer, vertexCount: 6 }],
    };
    const target = renderer.createRenderTexture(128, 96);
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    const draw = () => {
        fillFrameContext(store, ctx);
        const pass = ctx.passes[0]!;
        pass.renderTarget = target;
        pass.drawables = [...pass.drawables!, tilemap];
        pass.cameraIndex = [...pass.cameraIndex!, 0];
        pass.viewIndex = [...pass.viewIndex!, -1];
        renderer.frame(ctx);
    };
    const sample = async () => {
        const { data } = await renderer.readTexture(target);
        const pixel = (x: number, y: number) => [...data.slice((y * 128 + x) * 4, (y * 128 + x) * 4 + 4)];
        return { hud: pixel(4, 4), outside: pixel(10, 16), sprite: pixel(64, 16), tile: pixel(64, 48), material: pixel(64, 80), unlit: pixel(116, 88), dust: pixel(24, 16), spark: pixel(104, 16), dustMoved: pixel(4, 16), sparkMoved: pixel(84, 16) };
    };
    // Wait for actual output, with a deadline: WebGPU compiles materials asynchronously.
    const ready = async () => {
        const deadline = performance.now() + 10000;
        while (performance.now() < deadline) {
            draw(); await new Promise(resolve => setTimeout(resolve, 30));
            const result = await sample();
            if (result.material[0]! > 0 && result.tile[0]! > 0 && result.spark[1]! > 0) return result;
        }
        throw new Error(`${backend}: custom material did not become drawable`);
    };
    const before = await ready();
    tilemap = { ...tilemap, material: flatMaterial };
    // Wait for the tilemap's own material pipeline too: a pending layer is absent.
    const customTile = await ready();
    lamp.transform.x += 20; camera.transform.x += 20;
    draw();
    // What is left out of the lights moves with the camera like the rest of the world.
    const { unlit: _gone, dust: _dust, spark: _spark, dustMoved: _d, sparkMoved: _s, ...moved } = await sample();
    lamp.radius = 0; draw();
    const disabled = await sample();
    // No lights left: a world once lit stays dark, rather than turning to daylight.
    root.lights.length = 0; draw();
    const unlit = await sample();
    const equal = (a: unknown, b: unknown, label: string) => {
        if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${backend} ${label}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
    };
    equal(before, customTile, 'custom tile material');
    const { unlit: unlitBefore, dust, spark, dustMoved: _dm, sparkMoved: _sm, ...world } = before;
    equal(world, moved, 'camera and lamp move together');
    equal(unlitBefore, [255, 255, 255, 255], 'left out of the lights');
    // A particle is lit as a sprite is, by the ambient out there, and one left out keeps its green.
    equal(dust, [0, 26, 0, 255], 'lit particle');
    equal(spark, [0, 255, 0, 255], 'particle left out of the lights');
    equal(before.hud, [255, 255, 255, 255], 'HUD');
    equal(before.outside, [26, 26, 26, 255], 'outside radius');
    equal(before.tile, [226, 26, 26, 255], 'lamp centre');
    equal(before.sprite, [69, 26, 26, 255], 'sprite falloff');
    equal(before.material, [64, 26, 26, 255], 'material falloff');
    for (const key of ['outside', 'sprite', 'tile', 'material'] as const) {
        equal(disabled[key], [26, 26, 26, 255], `zero radius ${key}`);
        equal(unlit[key], [0, 0, 0, 255], `no lights left ${key}`);
    }
    // The camera went 20 to the right: the two particles are 20 to the left on the screen.
    equal(disabled.dustMoved, [0, 26, 0, 255], 'zero radius particle');
    equal(unlit.dustMoved, [0, 0, 0, 255], 'no lights left, particle');
    equal(unlit.sparkMoved, [0, 255, 0, 255], 'no lights left, particle left out');
    renderer.destroyTexture(target); renderer.destroyTexture(texture); renderer.destroyBuffer(buffer); renderer.destroy(); canvas.remove();
    return { backend, before, customTile, moved, disabled, unlit };
};
