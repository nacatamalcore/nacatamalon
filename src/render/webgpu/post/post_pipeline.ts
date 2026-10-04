import { buildPostShader, POST_UNIFORMS_BINDING } from './post_shader';
import { buildUniformLayout, POST_ENGINE_FIELDS, writeUniformValues } from '../../shared/material_uniforms';
import { createWebGPUDataTexture, createWebGPURenderTexture } from '../resources';
import { toGpuTexture } from '../texture';
import type { ITexture } from '../../interface';
import type { TPostEffect } from '../../../post/types/t_post_effect';
import type { TUniformLayout } from '../../shared/material_uniforms';

/**
 * One slot of the shared parameter buffer. The smallest offset a card will take.
 */
const SLOT = 256;

/**
 * How many numbers fit in one, which is also the cap on how many knobs one effect may have.
 */
const SLOT_FLOATS = SLOT / 4;

type TCompiled = {
    pipeline: GPURenderPipeline | null;
    layout: TUniformLayout;
    failed: boolean;
};

/**
 * Every screen-wide effect this game has compiled, and the pictures they pass between them.
 *
 * Built the first time a frame actually has an effect in it, never at boot: it owns pictures the
 * size of the canvas, and a game with no effects should not keep two of those for its whole life.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createPostPipelines = (device: GPUDevice, format: GPUTextureFormat) => {
    const compiled = new Map<string, TCompiled>();
    const groups = new Map<GPUTexture, Map<GPUTexture, GPUBindGroup>>();
    const values = new Float32Array(SLOT_FLOATS);

    const bindGroupLayout = device.createBindGroupLayout({
        label: 'post bind group layout',
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
            {
                binding: POST_UNIFORMS_BINDING,
                visibility: GPUShaderStage.FRAGMENT,
                // One buffer with a slot per effect, so the whole chain records into one submit.
                buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: SLOT },
            },
        ],
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

    // Nearest everywhere. A palette read smoothly would invent colours it does not contain, and the
    // frame is being read at exactly its own size.
    const sampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });

    let parameters: GPUBuffer | null = null;
    let capacity = 0;
    /**
     * The picture the world is drawn into, and the two the chain passes between.
     */
    let scene: ITexture | null = null;
    const scratch: (ITexture | null)[] = [null, null];
    let width = 0;
    let height = 0;
    /**
     * A single white pixel, bound wherever an effect wants no palette.
     *
     * White and not black: an effect that reads it without asking whether it is there multiplies by
     * one, so the frame comes out as it went in.
     */
    let blank: ITexture | null = null;

    const blankTexture = (): ITexture => {
        blank ??= createWebGPUDataTexture(device, new Uint8Array([255, 255, 255, 255]), 1, 1);
        return blank;
    };

    /**
     * Throws away every picture of the old size. Called when the canvas changes shape.
     */
    const resize = (nextWidth: number, nextHeight: number): void => {
        if (nextWidth === width && nextHeight === height) {
            return;
        }
        for (const old of [scene, ...scratch]) {
            if (old !== null) {
                toGpuTexture(old).destroy();
            }
        }
        scene = null;
        scratch[0] = null;
        scratch[1] = null;
        groups.clear();
        width = nextWidth;
        height = nextHeight;
    };

    const scratchAt = (index: number): ITexture => {
        scratch[index] ??= createWebGPURenderTexture(device, format, width, height);
        return scratch[index]!;
    };

    const build = (effect: TPostEffect): TCompiled => {
        const layout = buildUniformLayout(effect.uniformSig, POST_ENGINE_FIELDS);
        if (layout.floatCount > SLOT_FLOATS) {
            console.warn(
                `[NacatamalOn] the effect "${effect.name ?? 'post'}" asks for more numbers than one ` +
                'effect can hold. It is being skipped.',
            );
            return { pipeline: null, layout, failed: true };
        }

        try {
            const module = device.createShaderModule({
                label: `post ${effect.name ?? effect.id}`,
                code: buildPostShader(effect.fragment as string, effect.uniformSig),
            });
            const pipeline = device.createRenderPipeline({
                label: `post ${effect.name ?? effect.id}`,
                layout: pipelineLayout,
                vertex: { module, entryPoint: 'vs' },
                fragment: { module, entryPoint: 'fs', targets: [{ format }] },
                primitive: { topology: 'triangle-list' },
            });
            return { pipeline, layout, failed: false };
        } catch (error) {
            console.warn(
                `[NacatamalOn] the effect "${effect.name ?? 'post'}" did not compile. The frame is ` +
                'shown unchanged.',
                error,
            );
            return { pipeline: null, layout, failed: true };
        }
    };

    /**
     * The hook that changes nothing, which an effect that will not compile falls back to.
     *
     * **Falling back and not being skipped.** The last effect in a chain is the one that writes the
     * screen, so one that dropped out would leave the frame in a picture nobody ever shows: a black
     * screen instead of an unchanged one.
     */
    let identity: TCompiled | null = null;

    const identityFor = (): TCompiled => {
        identity ??= build({
            name: 'identity',
            fragment: 'fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return color; }',
            uniformSig: {},
        } as TPostEffect);
        return identity;
    };

    const compiledFor = (effect: TPostEffect): TCompiled => {
        // By what it says and not by which object said it, so two effects running the same shader
        // compile once.
        const key = `${JSON.stringify(effect.uniformSig)} ${effect.fragment ?? ''}`;
        let entry = compiled.get(key);
        if (entry === undefined) {
            entry = build(effect);
            compiled.set(key, entry);
        }
        return entry.failed ? identityFor() : entry;
    };

    const bindGroupFor = (source: GPUTexture, data: GPUTexture): GPUBindGroup => {
        let inner = groups.get(source);
        if (inner === undefined) {
            inner = new Map();
            groups.set(source, inner);
        }
        const existing = inner.get(data);
        if (existing !== undefined) {
            return existing;
        }

        const group = device.createBindGroup({
            label: 'post bind group',
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: sampler },
                { binding: 1, resource: source.createView() },
                { binding: 2, resource: sampler },
                { binding: 3, resource: data.createView() },
                { binding: POST_UNIFORMS_BINDING, resource: { buffer: parameters!, offset: 0, size: SLOT } },
            ],
        });
        inner.set(data, group);
        return group;
    };

    return {
        /**
         * The picture the world draws into this frame, made to fit the canvas.
         *
         * Handed back as an ordinary render texture, so the passes that draw the world reach it by
         * the path they already had: the one that gives a picture drawn into its own depth.
         */
        sceneTarget: (targetWidth: number, targetHeight: number): ITexture => {
            resize(targetWidth, targetHeight);
            scene ??= createWebGPURenderTexture(device, format, width, height);
            return scene;
        },

        /**
         * Makes room for this frame's parameters **before any draw is recorded**.
         *
         * A buffer that grew in the middle would throw away the one the draws already recorded were
         * pointing at, and they would find nothing there at the moment of submitting. The same trap
         * models and maps avoid the same way.
         */
        beginFrame: (count: number): void => {
            if (parameters !== null && count <= capacity) {
                return;
            }
            parameters?.destroy();
            capacity = Math.max(8, count);
            parameters = device.createBuffer({
                label: 'post parameters',
                size: capacity * SLOT,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            // The old groups pointed at the buffer that just went.
            groups.clear();
        },

        /**
         * Runs the chain from the world's picture to the screen.
         *
         * The **last** effect always writes the real destination, so there is never a copy at the
         * end and no special case for an odd or even number of them. The ones before it alternate
         * between two scratch pictures, which are only made if there is a second effect to need one.
         *
         * `pixelRatio` is how many real pixels the picture has per game pixel. The effects run on
         * every real one, but the `resolution` they read is the game's, so a dither or a palette
         * pattern keeps the size of a game pixel instead of getting finer.
         */
        run: (
            encoder: GPUCommandEncoder,
            chain: readonly TPostEffect[],
            destination: GPUTextureView,
            time: number,
            progress: number,
            phase: number,
            pixelRatio = 1,
        ): void => {
            let source = scene!;

            for (let i = 0; i < chain.length; i++) {
                const effect = chain[i]!;
                const entry = compiledFor(effect);
                const last = i === chain.length - 1;
                if (entry.pipeline === null) {
                    continue;
                }
                const target = last ? destination : toGpuTexture(scratchAt(i % 2)).createView();

                values.fill(0);
                writeUniformValues(values, entry.layout, effect.uniforms, time, width / pixelRatio, height / pixelRatio);

                // The two the engine owns for a full-screen effect, poked in after the rest rather
                // than merged into the effect's own values: they change every frame and every frame
                // would otherwise allocate an object to carry them. The layout only has them for a
                // screen-wide effect, which is why the offset is checked rather than assumed.
                if (entry.layout.offsets.progress !== undefined) {
                    values[entry.layout.offsets.progress] = progress;
                    values[entry.layout.offsets.phase] = phase;
                }
                device.queue.writeBuffer(parameters!, i * SLOT, values, 0, SLOT_FLOATS);

                const data = effect.palette?.gpu ?? effect.lut?.gpu ?? blankTexture();

                const pass = encoder.beginRenderPass({
                    label: `post ${effect.name ?? i}`,
                    colorAttachments: [{
                        view: target,
                        // Always cleared: one triangle covers every pixel, so loading what was there
                        // would only fetch what is about to be written over.
                        loadOp: 'clear',
                        storeOp: 'store',
                        clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    }],
                });
                pass.setPipeline(entry.pipeline);
                pass.setBindGroup(0, bindGroupFor(toGpuTexture(source), toGpuTexture(data)), [i * SLOT]);
                pass.draw(3);
                pass.end();

                if (!last) {
                    source = scratchAt(i % 2);
                }
            }
        },

        destroy: (): void => {
            for (const texture of [scene, ...scratch, blank]) {
                if (texture !== null) {
                    toGpuTexture(texture).destroy();
                }
            }
            parameters?.destroy();
            compiled.clear();
            groups.clear();
        },
    };
};

/**
 * Everything this backend keeps for its screen-wide effects.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPostPipelines = ReturnType<typeof createPostPipelines>;
