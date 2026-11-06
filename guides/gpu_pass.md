# A plugin's own work on the GPU (experimental)

`useGpuPass`, in `nacatamalon/extend/gpu`, is for whoever writes a plugin that needs what a
material or a post effect cannot do: a simulation in compute, a picture worked out on the GPU. A
game never calls it: it calls the hook the plugin exports, which hands back ordinary pictures. It
can change from one version to the next.

A pass is not something in the world and does not replace how the engine draws. It is work the
engine runs once a frame, for as long as the component that made it lives, with the GPU itself in
its hands.

- **When it runs.** `stage: 'before'`, the default, runs before the frame draws anything: shadows,
  cameras or screen. What it draws is seen in that same frame. `stage: 'after'` runs once
  everything is drawn, post-processing included, and what it draws is seen the next frame. Passes
  of the same stage run in the order they were made.
- **Once a frame.** However many cameras, minimaps or captures the frame draws. No camera and no
  pass of the engine's is open while it runs.
- **Its time.** `time` is the scene's game time and `delta` what this frame moved it by. A paused
  scene keeps drawing, with `delta` at 0; a scene held behind a transition runs none of its passes.
  Hiding the component does not stop it, as it does not stop its updates.
- **The screen.** `width` and `height` are the screen in real pixels, not a camera's view.

The frame a pass is told is the same object every frame: a pass that wants to keep a value copies
it.

## Example: a picture from compute, and the same on WebGL2

The plugin makes a green picture of 64 by 64. On WebGPU it is written from compute; WebGL2 has no
compute shaders, so there it clears a framebuffer of its own.

```ts
import { createScene, createSprite } from 'nacatamalon';
import { useGpuPass } from 'nacatamalon/extend/gpu';

export const useGpuColorTexture = () => {
    const pass = useGpuPass({
        name: 'GPU color texture',
        outputs: [{ width: 64, height: 64 }],
        webgpu: ({ device, outputs }) => {
            const pipeline = device.createComputePipeline({
                layout: 'auto',
                compute: {
                    entryPoint: 'main',
                    module: device.createShaderModule({ code: `
                        @group(0) @binding(0)
                        var image: texture_storage_2d<rgba8unorm, write>;

                        @compute @workgroup_size(8, 8)
                        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
                            let size = textureDimensions(image);
                            if (id.x >= size.x || id.y >= size.y) { return; }
                            textureStore(image, vec2<i32>(id.xy), vec4<f32>(0, 1, 0, 1));
                        }
                    ` }),
                },
            });
            const bindings = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: outputs[0].createView() }],
            });
            return {
                render: ({ encoder }) => {
                    const compute = encoder.beginComputePass();
                    compute.setPipeline(pipeline);
                    compute.setBindGroup(0, bindings);
                    compute.dispatchWorkgroups(8, 8);
                    compute.end();
                },
            };
        },
        webgl2: ({ gl, outputs }) => {
            const framebuffer = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputs[0], 0);
            return {
                render: () => {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                    gl.disable(gl.SCISSOR_TEST);
                    gl.colorMask(true, true, true, true);
                    gl.clearColor(0, 1, 0, 1);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                },
                destroy: () => gl.deleteFramebuffer(framebuffer),
            };
        },
    });
    return pass.outputs[0];
};

// What the plugin hands back is one of the game's own pictures.
const Level = () => {
    createSprite({ texture: useGpuColorTexture(), width: 128, height: 128 });
    return createScene();
};
```

This door names WebGPU's types. TypeScript 6 has them; on TypeScript 5 the plugin's project adds
`@webgpu/types` and puts it in `compilerOptions.types`. A game that only uses the plugin's hook
never imports this door, and needs neither.

## What it makes and what lets go of it

`outputs` are the pictures the pass draws into, of a size fixed when it is made: RGBA, 8 bits a
channel (`rgba8unorm` on WebGPU), one sample, that can be read, drawn into and copied, and on WebGPU
written from compute too. The game gets them back at once as its own `TTexture`s, and they go with
the pass: not with `releaseAsset`, and never by destroying them on the GPU.

The factory gets the GPU side of those same pictures. To read one of the game's pictures,
`texture(picture)` gives its GPU side, or `null` while it is loading or after it was let go of. Ask
again each time rather than keeping it: when the picture is loaded again, the one kept is gone. A
pass never shares what it made with another game.

Buffers, pipelines, bind groups, vertex arrays and framebuffers are made in the factory, once, and
kept. What has to be destroyed is destroyed in the `destroy` the factory returns. A factory that
throws halfway lets go of what it made itself; the engine lets go of the pictures. A factory
returns at once: it cannot wait for anything.

`pass.enabled = false` stops running it and keeps what it made. `pass.destroy()` lets go of it
before its component goes, and twice does nothing more. Another size is another pass: destroy it
and make a new one. Nothing of a pass goes into a scene document: the plugin makes it again each
time its component is made.

A pass destroyed from its own `render` waits until the frame is sent to the GPU, so what the frame
already recorded is not left reading something gone.

## What the engine looks after, and what the pass does

**On WebGPU** the pass gets the frame's encoder with no pass of the engine's open. It ends every
pass it begins, and never calls `finish`, submits or destroys the device: the engine sends the
frame, once, with everything else. Writing a buffer with `queue.writeBuffer` does not happen between
two dispatches recorded in the same frame (both read what was written last), so two dispatches that
need different numbers read them from two different places.

**On WebGL2** the engine puts back its bindings, texture units, samplers, uniform buffers and
drawing state after everything the pass runs: the factory, each frame and `destroy`, even when they
throw. The pass is handed a `gl` that notes what it changes, so the cost is what it changes: about
12 µs a frame for a pass that changes nothing slow to read back, and some 40 µs more for each such
value it does change (the clear colour is one, the scissor one, the blend four, the stencil
fourteen). It is still a
`WebGL2RenderingContext` to `instanceof`, but not to what needs the browser's own (`new
XRWebGLLayer`), and it is the pass's way to the context: `gl.canvas.getContext('webgl2')` gives one
that notes nothing. A game that never imports this door carries none of it.

A WebGL2 pass sets the state it needs, and binds its own vertex array, framebuffer and transform
feedback before changing them. It ends any query or transform feedback it begins. Of the
extensions, what `OES_draw_buffers_indexed` and `EXT_polygon_offset_clamp` change is put back;
what `EXT_clip_control`, `WEBGL_provoking_vertex`, `WEBGL_polygon_mode` and `EXT_depth_clamp`
change is not, and a pass that changes it sets it back itself. What is inside
objects is not put back: the contents of buffers, a program's uniforms, what a framebuffer draws
into, a texture's parameters. A pass never changes the engine's own objects. Being handed the GPU
is not being kept from breaking it.

The pictures are the right way up for the engine: the first row stored is the top. WebGPU writes
them that way on its own. A framebuffer draws from the bottom up, so a WebGL2 pass that draws
something with a top and a bottom has to turn it over itself.

A `render` that throws turns its pass off and says so once, and the other passes go on. What it
already recorded stays recorded. On WebGPU, one that throws with a pass of its own still open leaves
the frame's encoder unusable: that one frame is lost, the engine's drawing too. A GPU error that
comes later is said the way the backend says it. A pass that says nothing for the backend the game
draws with fails when it is made, rather than drawing nothing.

## A lost context, headless and native

When the WebGL2 context is lost, the pass lets go of what it made and its pictures say `loading`.
When it comes back, the pictures are made again and the factory runs again, with the same
`TTexture`s, before the next frame draws. A pass made while the context is lost waits for it. What
the pictures held is gone: the pass draws it again. A pass that cannot be made again is turned off
and said once. A WebGPU device lost for good stops the game drawing, as it always does, and lets go
of the passes.

A game run headless has no GPU, even though it says it is WebGPU: no factory runs, each pass says
so once when it is made, and its pictures are never ready (`status: 'error'`).

The native runtimes have most of WebGPU but not compute yet (`createComputePipeline`,
`beginComputePass`), so the example above runs in a browser and not natively. A plugin that runs
on a host with part of WebGPU checks for what it uses.
