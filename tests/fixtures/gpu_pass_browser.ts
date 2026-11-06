// A check of `useGpuPass` on a real card, which Bun cannot run. Bundled for a page served from
// localhost, it gives `window.probe(backend, samples)`: a game with a pass whose picture is drawn by
// a sprite and a cube, three views, a pass after the frame, one that lets itself go, and on WebGL2 a
// lost and restored context. The WebGL2 passes leave the GL state as wrong as they can, so the
// engine's drawing afterwards shows whether it was put back.
import { createTestGame, startTestScene } from '../helpers/test_game';
import { createWebGPURenderer } from '../../src/render/webgpu/webgpu_renderer';
import { createWebGL2Renderer } from '../../src/render/webgl2/webgl2_renderer';
import { createScene, createSprite, createMesh, useCubeGeometry, useCamera3d, useDirectionalLight } from '../../src/index';
import { useGpuPass } from '../../src/extend/gpu';
import { fillFrameContext } from '../../src/game/loop/fill_frame_context';
import { stopScene } from '../../src/scene/stop_scene';

// Every piece of GL state a careless pass could leave behind.
const poison = (gl: WebGL2RenderingContext, uniform: WebGLBuffer, vao: WebGLVertexArrayObject) => {
    gl.bindVertexArray(vao);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.NEVER);
    gl.colorMask(false, false, false, false);
    gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
    gl.depthRange(0.2, 0.3);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, 0, 0);
    gl.activeTexture(gl.TEXTURE0 + 7);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, uniform);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, uniform);
    gl.pixelStorei(gl.PACK_ROW_LENGTH, 17);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 17);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
};

const COMPUTE = /* wgsl */ `
    @group(0) @binding(0) var image: texture_storage_2d<rgba8unorm, write>;
    @group(0) @binding(1) var<storage, read_write> positions: array<vec4<f32>>;

    @compute @workgroup_size(8, 8)
    fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        if (id.x >= 16u || id.y >= 16u) { return; }
        let i = id.y * 16u + id.x;
        positions[i].x += 1.0;
        textureStore(image, vec2<i32>(id.xy), vec4<f32>(positions[i].x / 255.0, 1.0, 0.0, 1.0));
    }
`;

(window as any).probe = async (backend: 'WEBGPU' | 'WEBGL2', samples: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    document.body.append(canvas);
    const create = backend === 'WEBGPU' ? createWebGPURenderer : createWebGL2Renderer;
    const renderer = await create(canvas, { msaa: samples as 1 | 4 });
    const { store } = createTestGame({ width: 64, height: 64, background: { r: 0, g: 0, b: 1, a: 1 } }, canvas);
    store.setState('screen', { renderer });

    let runs = 0;
    let after = 0;
    let builds = 0;
    let destroyed = 0;
    const errors: string[] = [];
    let pass!: ReturnType<typeof useGpuPass>;

    startTestScene(store, 'World', () => {
        // Counts each frame in red: 3 after three frames shows it ran once a frame, not once a view.
        pass = useGpuPass({
            name: 'compute output',
            outputs: [{ width: 16, height: 16 }],
            webgpu: ({ device, outputs, texture }) => {
                builds++;
                device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
                if (texture({ status: 'loading' } as any) !== null) throw new Error('a loading texture was resolved');
                const positions = device.createBuffer({ size: 16 * 16 * 16, usage: GPUBufferUsage.STORAGE });
                const pipeline = device.createComputePipeline({
                    layout: 'auto',
                    compute: { module: device.createShaderModule({ code: COMPUTE }), entryPoint: 'main' },
                });
                const group = device.createBindGroup({
                    layout: pipeline.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: outputs[0].createView() },
                        { binding: 1, resource: { buffer: positions } },
                    ],
                });
                return {
                    render: ({ encoder }) => {
                        runs++;
                        const compute = encoder.beginComputePass();
                        compute.setPipeline(pipeline);
                        compute.setBindGroup(0, group);
                        compute.dispatchWorkgroups(2, 2);
                        compute.end();
                    },
                    destroy: () => {
                        destroyed++;
                        positions.destroy();
                    },
                };
            },
            webgl2: ({ gl, outputs }) => {
                builds++;
                let count = 0;
                const framebuffer = gl.createFramebuffer()!;
                gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputs[0], 0);
                const uniform = gl.createBuffer()!;
                gl.bindBuffer(gl.UNIFORM_BUFFER, uniform);
                gl.bufferData(gl.UNIFORM_BUFFER, 1024, gl.DYNAMIC_DRAW);
                const vao = gl.createVertexArray()!;
                return {
                    render: () => {
                        runs++;
                        count++;
                        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
                        gl.disable(gl.SCISSOR_TEST);
                        gl.colorMask(true, true, true, true);
                        gl.clearColor(count / 255, 1, 0, 1);
                        gl.clear(gl.COLOR_BUFFER_BIT);
                        poison(gl, uniform, vao);
                    },
                    destroy: () => {
                        destroyed++;
                        gl.deleteFramebuffer(framebuffer);
                        gl.deleteBuffer(uniform);
                        gl.deleteVertexArray(vao);
                    },
                };
            },
        });

        useGpuPass({
            name: 'after state',
            stage: 'after',
            webgpu: () => ({ render: () => { after++; } }),
            webgl2: ({ gl }) => {
                const uniform = gl.createBuffer()!;
                gl.bindBuffer(gl.UNIFORM_BUFFER, uniform);
                gl.bufferData(gl.UNIFORM_BUFFER, 1024, gl.DYNAMIC_DRAW);
                const vao = gl.createVertexArray()!;
                return {
                    render: () => {
                        after++;
                        poison(gl, uniform, vao);
                    },
                    destroy: () => {
                        gl.deleteBuffer(uniform);
                        gl.deleteVertexArray(vao);
                    },
                };
            },
        });

        const oneShot = useGpuPass({
            name: 'one-shot',
            webgpu: ({ device }) => {
                const buffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST });
                return {
                    render: ({ encoder }) => {
                        encoder.clearBuffer(buffer);
                        oneShot.destroy();
                    },
                    destroy: () => buffer.destroy(),
                };
            },
            webgl2: () => ({ render: () => oneShot.destroy() }),
        });

        useCamera3d({ projection: 'perspective', transform: { z: 8 } });
        useDirectionalLight({ intensity: 1 });
        createMesh({ geometry: useCubeGeometry(), texture: pass.outputs[0], transform: { x: 2, y: 1 } });
        createSprite({ texture: pass.outputs[0], width: 32, height: 32, anchor: { x: 0, y: 0 } });
        createSprite({ tint: 'red', width: 8, height: 8, anchor: { x: 0, y: 0 }, transform: { x: 4, y: 4 } });
        return createScene();
    });

    // Two captures as well as the screen: three views a frame.
    const targets = [renderer.createRenderTexture(64, 64), renderer.createRenderTexture(64, 64)];
    const step = () => {
        const ctx: any = { passes: [{}], time: 1, progress: 0, phase: 0 };
        fillFrameContext(store, ctx, 1 / 60);
        ctx.passes.unshift(...targets.map((renderTarget) => ({ ...ctx.passes[0], renderTarget })));
        renderer.frame(ctx);
    };
    const pixelsOf = async () => {
        const read: any = await renderer.readTexture(targets[0]);
        const bytes = read.data ?? read.pixels;
        if (!bytes) throw new Error(`No pixels in what was read: ${Object.keys(read)}`);
        return (x: number, y: number) => [...bytes.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
    };

    for (let i = 0; i < 3; i++) step();
    const pixel = await pixelsOf();
    const before = {
        runs, after, builds, destroyed,
        color: pixel(20, 20),
        foreground: pixel(6, 6),
        background: pixel(50, 50),
        model: pixel(45, 25),
        ready: pass.outputs[0].status,
    };

    let restoration: unknown = null;
    if (backend === 'WEBGL2') {
        const gl = canvas.getContext('webgl2')!;
        const lose = gl.getExtension('WEBGL_lose_context')!;
        const output = pass.outputs[0];
        await new Promise<void>((resolve) => {
            canvas.addEventListener('webglcontextlost', () => resolve(), { once: true });
            lose.loseContext();
        });
        const lost = output.status;
        await new Promise((resolve) => setTimeout(resolve, 100));
        await new Promise<void>((resolve) => {
            canvas.addEventListener('webglcontextrestored', () => resolve(), { once: true });
            lose.restoreContext();
        });
        const restoredBeforeCollection = output.status;
        step();
        const restored = await pixelsOf();
        restoration = { lost, restoredBeforeCollection, sameRecord: pass.outputs[0] === output, builds, color: restored(20, 20), glError: gl.getError() };
    }

    stopScene(store, 'World');
    const released = pass.outputs[0].status;
    const finalCounts = { runs, after, builds, destroyed };
    renderer.destroy();
    canvas.remove();
    return { backend, samples, before, restoration, released, finalCounts, errors };
};
