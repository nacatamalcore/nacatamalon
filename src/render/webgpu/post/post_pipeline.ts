import { buildPostShader, POST_UNIFORMS_BINDING } from './post_shader';
import { failWithLines } from '../material/fail_with_lines';
import { buildUniformLayout, MAX_MATERIAL_FLOATS, POST_ENGINE_FIELDS, writeUniformValues } from '../../shared/material_uniforms';
import { createWebGPUDataTexture, createWebGPURenderTexture } from '../resources';
import { toGpuTexture } from '../texture';
import { passSize, postStepsOf } from '../../shared/post_steps';
import type { ITexture } from '../../interface';
import type { TPostEffect } from '../../../post/types/t_post_effect';
import type { TUniformLayout } from '../../shared/material_uniforms';

/**
 * One slot of the shared parameter buffer. The smallest offset a card will take.
 */
const SLOT = 256;

/**
 * How many numbers fit in one, which is also the cap on how many uniforms one effect may have.
 */
const SLOT_FLOATS = MAX_MATERIAL_FLOATS;

/**
 * How many frames a size of picture nobody asked for is kept before it is let go.
 */
const KEPT_IDLE = 30;

/**
 * Copies a part of a picture into one of the part's size, by drawing it: each pixel read from where
 * it is in the whole. Drawn rather than copied so it takes nothing a card does not already do for
 * every other picture.
 */
const PART_SHADER = /* wgsl */ `
@group(0) @binding(0) var whole: texture_2d<f32>;
@group(0) @binding(1) var<uniform> corner: vec4<f32>;

@vertex
fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
    let at = vec2<f32>(f32((index << 1u) & 2u), f32(index & 2u));
    return vec4<f32>(at * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
    // The part may hang off the picture's edge: what is off it is see-through.
    let pixel = vec2<i32>(at.xy) + vec2<i32>(corner.xy);
    let size = vec2<i32>(textureDimensions(whole));
    if (pixel.x < 0 || pixel.y < 0 || pixel.x >= size.x || pixel.y >= size.y) {
        return vec4<f32>(0.0);
    }
    return textureLoad(whole, pixel, 0);
}
`;

type TCompiled = {
    pipeline: GPURenderPipeline | null;
    layout: TUniformLayout;
    failed: boolean;
    /**
     * Still being compiled and checked, apart from the frame. Until it is, the frame is shown
     * without it, as it is when it fails.
     */
    pending: boolean;
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
    const groups = new Map<string, GPUBindGroup>();
    const values = new Float32Array(SLOT_FLOATS);

    /**
     * A number for each picture, so a bind group can be found by the four it binds.
     */
    const ids = new WeakMap<GPUTexture, number>();
    let nextId = 0;
    const idOf = (texture: GPUTexture): number => {
        let id = ids.get(texture);
        if (id === undefined) {
            id = nextId++;
            ids.set(texture, id);
        }
        return id;
    };

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
            { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: {} },
            { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        ],
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

    // Nearest everywhere. A palette read smoothly would invent colours it does not contain, and the
    // frame is being read at exactly its own size.
    const sampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });
    // For `sampleTextureSmooth`: a pass at a smaller size, a bent picture, a blur.
    const smoothSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    let parameters: GPUBuffer | null = null;
    let capacity = 0;
    /**
     * The picture the world is drawn into.
     */
    let scene: ITexture | null = null;
    /**
     * The pictures the chain passes between, by size. Made the first time a size is asked for, so a
     * chain of one-step effects only ever has two, both the size of the canvas.
     */
    const pool = new Map<string, ITexture[]>();
    /**
     * How many frames each size in the pool has gone unasked. The screen's sizes are asked every
     * frame; a filter's follow what its object draws, so the ones it has grown out of are let go.
     */
    const idle = new Map<string, number>();
    /**
     * Last frame and this frame, for each effect that asked to read what it showed.
     */
    const histories = new Map<TPostEffect, { pair: [ITexture, ITexture]; read: 0 | 1 }>();
    /**
     * The last picture of the scene going out, for a transition that crosses.
     *
     * Kept through a change of size: it is read stretched over the screen, so a picture of the old
     * size still shows the old scene where it was, and dropping it would cut the crossing short.
     */
    const photos = new Map<TPostEffect, { texture: ITexture; width: number; height: number }>();
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
        if (scene !== null) {
            toGpuTexture(scene).destroy();
        }
        scene = null;
        dropPool();
        for (const history of histories.values()) {
            history.pair.forEach((texture) => toGpuTexture(texture).destroy());
        }
        histories.clear();
        groups.clear();
        width = nextWidth;
        height = nextHeight;
    };

    const dropPool = (): void => {
        for (const list of pool.values()) {
            list.forEach((texture) => toGpuTexture(texture).destroy());
        }
        pool.clear();
        idle.clear();
    };

    /**
     * Lets go of every size nobody has asked for in a while: called once a frame.
     */
    const pruneIdle = (): void => {
        for (const [key, frames] of idle) {
            if (frames < KEPT_IDLE) {
                idle.set(key, frames + 1);
                continue;
            }
            pool.get(key)?.forEach((texture) => toGpuTexture(texture).destroy());
            pool.delete(key);
            idle.delete(key);
            groups.clear();
        }
    };

    /**
     * A picture of this size that is none of the ones this draw reads.
     */
    const scratchOf = (w: number, h: number, avoid: readonly ITexture[]): ITexture => {
        const key = `${w}x${h}`;
        let list = pool.get(key);
        if (list === undefined) {
            list = [];
            pool.set(key, list);
        }
        idle.set(key, 0);
        const free = list.find((texture) => !avoid.includes(texture));
        if (free !== undefined) {
            return free;
        }
        const made = createWebGPURenderTexture(device, format, w, h);
        list.push(made);
        return made;
    };

    const historyOf = (effect: TPostEffect) => {
        let history = histories.get(effect);
        if (history === undefined) {
            history = {
                pair: [
                    createWebGPURenderTexture(device, format, width, height),
                    createWebGPURenderTexture(device, format, width, height),
                ],
                read: 0,
            };
            histories.set(effect, history);
        }
        return history;
    };

    /**
     * Lets go of the history of every effect that has left the chain, and the picture of every
     * transition that has.
     */
    const pruneHistories = (chain: readonly TPostEffect[]): void => {
        for (const [effect, history] of histories) {
            if (!chain.includes(effect)) {
                history.pair.forEach((texture) => toGpuTexture(texture).destroy());
                histories.delete(effect);
                groups.clear();
            }
        }
        for (const [effect, photo] of photos) {
            if (!chain.includes(effect)) {
                toGpuTexture(photo.texture).destroy();
                photos.delete(effect);
                groups.clear();
            }
        }
    };

    /**
     * The picture a transition that crosses takes of the scene going out, at the size of this frame.
     * One of another size, from before the canvas changed shape, is made again.
     */
    const photoOf = (effect: TPostEffect): ITexture => {
        let photo = photos.get(effect);
        if (photo !== undefined && (photo.width !== width || photo.height !== height)) {
            toGpuTexture(photo.texture).destroy();
            groups.clear();
            photo = undefined;
        }
        if (photo === undefined) {
            photo = { texture: createWebGPURenderTexture(device, format, width, height), width, height };
            photos.set(effect, photo);
        }
        return photo.texture;
    };

    /**
     * `now` builds the pipeline at once, for the one shader known to be good (the identity below).
     * Any other is compiled and checked apart from the frame and used once the card says it is
     * good: this card reports a broken shader later rather than throwing here, and a broken
     * pipeline used in the meantime throws away the whole frame, every frame.
     */
    const build = (effect: Pick<TPostEffect, 'name' | 'id' | 'fragment' | 'uniformSig'>, now = false, filtered = false): TCompiled => {
        const layout = buildUniformLayout(effect.uniformSig, POST_ENGINE_FIELDS);
        // Too many numbers for its slot. Said once where it was made (`checkParameterRoom`).
        if (layout.floatCount > SLOT_FLOATS) {
            return { pipeline: null, layout, failed: true, pending: false };
        }

        // Caught here: what is wrong is said once below, in this engine's words and with its lines.
        device.pushErrorScope('validation');
        const module = device.createShaderModule({
            label: `post ${effect.name ?? effect.id}`,
            code: buildPostShader(effect.fragment as string, effect.uniformSig, filtered),
        });
        void device.popErrorScope();
        const described: GPURenderPipelineDescriptor = {
            label: `post ${effect.name ?? effect.id}`,
            layout: pipelineLayout,
            vertex: { module, entryPoint: 'vs' },
            fragment: { module, entryPoint: 'fs', targets: [{ format }] },
            primitive: { topology: 'triangle-list' },
        };
        if (now) {
            return { pipeline: device.createRenderPipeline(described), layout, failed: false, pending: false };
        }

        const entry: TCompiled = { pipeline: null, layout, failed: false, pending: true };
        void device.createRenderPipelineAsync(described).then((made) => {
            entry.pipeline = made;
            entry.pending = false;
        }, (error: unknown) => failWithLines(module, error, (reason) => {
            entry.failed = true;
            entry.pending = false;
            console.warn(
                `[NacatamalOn] usePostProcess: the effect "${effect.name ?? 'post'}" did not compile. The frame is ` +
                'shown unchanged.',
                reason,
            );
        }));
        return entry;
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
        } as TPostEffect, true);
        return identity;
    };

    /**
     * One step of an effect, compiled. A pass is compiled exactly like a hook, with the same uniforms.
     */
    const compiledFor = (effect: TPostEffect, fragment: string | null, filtered = false): TCompiled => {
        if (fragment === null) {
            return identityFor();
        }
        // By what it says and not by which object said it, so two effects running the same shader
        // compile once. A filter's step is built apart, with its own ending.
        const key = `${JSON.stringify(effect.uniformSig)} ${fragment}${filtered ? ' filtered' : ''}`;
        let entry = compiled.get(key);
        if (entry === undefined) {
            entry = build({ name: effect.name, id: effect.id, fragment, uniformSig: effect.uniformSig }, false, filtered);
            compiled.set(key, entry);
        }
        return entry.failed || entry.pending ? identityFor() : entry;
    };

    /**
     * Whether a step's own hook is still being compiled, and so drawn as the identity meanwhile.
     */
    const stillCompiling = (effect: TPostEffect, fragment: string | null): boolean =>
        fragment !== null && compiled.get(`${JSON.stringify(effect.uniformSig)} ${fragment}`)?.pending === true;

    /**
     * What `sampleOutgoing` reads, in the slot a history has: the picture of the scene going out for
     * a transition that crosses, and the frame it was handed for any other transition, so one that
     * asks without crossing, or that never had a frame to take it from, shows a cut rather than white.
     * Every other effect gets white, as it does for a history it did not ask for.
     */
    const outgoingOf = (effect: TPostEffect, input: ITexture): ITexture => {
        if (effect.source !== 'transition') {
            return blankTexture();
        }
        return photos.get(effect)?.texture ?? input;
    };

    const bindGroupFor = (source: GPUTexture, data: GPUTexture, input: GPUTexture, history: GPUTexture): GPUBindGroup => {
        const key = `${idOf(source)} ${idOf(data)} ${idOf(input)} ${idOf(history)}`;
        const existing = groups.get(key);
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
                { binding: 5, resource: smoothSampler },
                { binding: 6, resource: input.createView() },
                { binding: 7, resource: history.createView() },
            ],
        });
        groups.set(key, group);
        return group;
    };

    /**
     * Runs a chain from a picture to a destination: the screen's, or a filter's.
     *
     * The **last** draw always writes the real destination, so there is never a copy at the end
     * for an ordinary chain. Every other draw writes a picture from the pool that is none of the
     * ones it reads, which is what lets an effect's passes and its hook read the effect's input
     * while writing somewhere else. The one exception is an effect that keeps a history and is
     * last: it writes its history, because next frame has to read it, and that is copied out.
     *
     * `w` and `h` are the picture's real pixels and `pixelRatio` how many of those each game pixel
     * is. The hooks run on every real one, but the `resolution` they read is the game's, so a dither
     * or a palette pattern keeps the size of a game pixel instead of getting finer. A pass reads its
     * own size.
     */
    const runChain = (
        encoder: GPUCommandEncoder,
        chain: readonly TPostEffect[],
        first: ITexture,
        w: number,
        h: number,
        destination: GPUTextureView,
        time: number,
        progress: number,
        phase: number,
        pixelRatio: number,
        screen: boolean,
    ): void => {
        const gameWidth = w / pixelRatio;
        const gameHeight = h / pixelRatio;
        let source = first;
        let slot = 0;

        const draw = (
            effect: TPostEffect,
            entry: TCompiled,
            target: GPUTextureView,
            read: ITexture,
            input: ITexture,
            history: ITexture,
            resolutionWidth: number,
            resolutionHeight: number,
        ): void => {
            values.fill(0);
            writeUniformValues(values, entry.layout, effect.uniforms, time, resolutionWidth, resolutionHeight);

            // The two the engine owns for a full-screen effect, poked in after the rest rather
            // than merged into the effect's own values: they change every frame and every frame
            // would otherwise allocate an object to carry them. The layout only has them for a
            // screen-wide effect, which is why the offset is checked rather than assumed.
            if (entry.layout.offsets.progress !== undefined) {
                values[entry.layout.offsets.progress] = progress;
                values[entry.layout.offsets.phase] = phase;
            }
            device.queue.writeBuffer(parameters!, slot * SLOT, values, 0, SLOT_FLOATS);

            const data = effect.palette?.gpu ?? effect.lut?.gpu ?? effect.mask?.gpu ?? blankTexture();

            const pass = encoder.beginRenderPass({
                label: `post ${effect.name ?? effect.id}`,
                colorAttachments: [{
                    view: target,
                    // Always cleared: one triangle covers every pixel, so loading what was there
                    // would only fetch what is about to be written over.
                    loadOp: 'clear',
                    storeOp: 'store',
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                }],
            });
            pass.setPipeline(entry.pipeline!);
            pass.setBindGroup(
                0,
                bindGroupFor(toGpuTexture(read), toGpuTexture(data), toGpuTexture(input), toGpuTexture(history)),
                [slot * SLOT],
            );
            pass.draw(3);
            pass.end();
            slot++;
        };

        for (let i = 0; i < chain.length; i++) {
            const effect = chain[i]!;
            const lastEffect = i === chain.length - 1;
            const input = source;
            // A filter's effect has no last frame of its own: its object's part of the screen
            // moves and changes size. It reads the frame it was handed there instead.
            const history = effect.history === true && screen ? historyOf(effect) : null;
            // While the scene going out is still on screen, what this effect is handed is its
            // picture, taken again each frame so it is the last one when the swap comes.
            if (effect.outgoing === 'take' || effect.outgoing === 'taken') {
                const photo = photoOf(effect);
                draw(effect, identityFor(), toGpuTexture(photo).createView(), source, source, source, gameWidth, gameHeight);
            }
            const historyRead = history !== null ? history.pair[history.read] : effect.history === true ? input : outgoingOf(effect, input);
            const steps = postStepsOf(effect);

            for (let j = 0; j < steps.length; j++) {
                const step = steps[j]!;
                const entry = compiledFor(effect, step.fragment, !screen);
                if (entry.pipeline === null) {
                    continue;
                }
                const own = j === steps.length - 1;
                // Drawn with its picture and its own hook: the swap may come. One whose hook will
                // not compile counts too, or the change would wait for a hook that never comes.
                if (own && effect.outgoing === 'take' && !stillCompiling(effect, step.fragment)) {
                    effect.outgoing = 'taken';
                }

                if (!own) {
                    const [passWidth, passHeight] = passSize(step.scale!, gameWidth, gameHeight);
                    const out = scratchOf(passWidth, passHeight, [source, input, historyRead]);
                    draw(effect, entry, toGpuTexture(out).createView(), source, input, historyRead, passWidth, passHeight);
                    source = out;
                    continue;
                }

                if (history !== null) {
                    const written = history.pair[1 - history.read]!;
                    draw(effect, entry, toGpuTexture(written).createView(), source, input, historyRead, gameWidth, gameHeight);
                    history.read = history.read === 0 ? 1 : 0;
                    source = written;
                    if (lastEffect) {
                        draw(effect, identityFor(), destination, written, written, written, gameWidth, gameHeight);
                    }
                    continue;
                }

                if (lastEffect) {
                    draw(effect, entry, destination, source, input, historyRead, gameWidth, gameHeight);
                    continue;
                }

                const out = scratchOf(w, h, [source, input]);
                draw(effect, entry, toGpuTexture(out).createView(), source, input, historyRead, gameWidth, gameHeight);
                source = out;
            }
        }
    };

    /**
     * What copies a filter's part out of its picture, made the first time a filter asks. Its corner
     * goes in one slot: each filter's pass is sent on its own, so one slot is never wanted by two.
     */
    let part: { pipeline: GPURenderPipeline; layout: GPUBindGroupLayout; corner: GPUBuffer; groups: WeakMap<ITexture, GPUBindGroup> } | null = null;
    const cornerValues = new Float32Array(4);

    const copyPart = (encoder: GPUCommandEncoder, whole: ITexture, region: { x: number; y: number; width: number; height: number }, into: ITexture): void => {
        if (part === null) {
            const module = device.createShaderModule({ label: 'filter part', code: PART_SHADER });
            const layout = device.createBindGroupLayout({
                label: 'filter part',
                entries: [
                    { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
                    { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                ],
            });
            part = {
                pipeline: device.createRenderPipeline({
                    label: 'filter part',
                    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
                    vertex: { module, entryPoint: 'vs' },
                    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
                    primitive: { topology: 'triangle-list' },
                }),
                layout,
                corner: device.createBuffer({ label: 'filter part corner', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
                groups: new WeakMap(),
            };
        }
        cornerValues[0] = region.x;
        cornerValues[1] = region.y;
        device.queue.writeBuffer(part.corner, 0, cornerValues);
        let group = part.groups.get(whole);
        if (group === undefined) {
            group = device.createBindGroup({
                label: 'filter part',
                layout: part.layout,
                entries: [
                    { binding: 0, resource: toGpuTexture(whole).createView() },
                    { binding: 1, resource: { buffer: part.corner } },
                ],
            });
            part.groups.set(whole, group);
        }
        const pass = encoder.beginRenderPass({
            label: 'filter part',
            colorAttachments: [{ view: toGpuTexture(into).createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
        });
        pass.setPipeline(part.pipeline);
        pass.setBindGroup(0, group);
        pass.draw(3);
        pass.end();
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
         *
         * `count` is draws and not effects: `countPostSteps` says how many a chain makes.
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
         * `pixelRatio` is how many real pixels the picture has per game pixel.
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
            pruneHistories(chain);
            runChain(encoder, chain, scene!, width, height, destination, time, progress, phase, pixelRatio, true);
        },

        /**
         * Runs a filter's chain over its part of a picture: the part is drawn out into one of its
         * own size, so its effects read it as a whole screen (`uv` from corner to corner, and its
         * size as `resolution`), and the last of them writes `into`, which is that size too.
         */
        runFilter: (
            encoder: GPUCommandEncoder,
            chain: readonly TPostEffect[],
            content: ITexture,
            region: { x: number; y: number; width: number; height: number },
            into: ITexture,
            time: number,
            pixelRatio = 1,
        ): void => {
            const copied = scratchOf(region.width, region.height, []);
            copyPart(encoder, content, region, copied);
            runChain(encoder, chain, copied, region.width, region.height, toGpuTexture(into).createView(), time, 0, 0, pixelRatio, false);
        },

        /**
         * Lets go of every size of picture nobody has asked for in a while: called once a frame,
         * whether the frame had effects or not, so what a filter that has gone used is given back.
         */
        endFrame: pruneIdle,

        destroy: (): void => {
            for (const texture of [scene, blank, ...[...photos.values()].map((photo) => photo.texture)]) {
                if (texture !== null) {
                    toGpuTexture(texture).destroy();
                }
            }
            photos.clear();
            dropPool();
            for (const history of histories.values()) {
                history.pair.forEach((texture) => toGpuTexture(texture).destroy());
            }
            histories.clear();
            parameters?.destroy();
            part?.corner.destroy();
            part = null;
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
