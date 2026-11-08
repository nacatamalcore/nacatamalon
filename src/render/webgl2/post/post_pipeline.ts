import { buildPostShaderGlsl } from './post_shader';
import { buildUniformLayout, MAX_MATERIAL_FLOATS, POST_ENGINE_FIELDS, writeUniformValues } from '../../shared/material_uniforms';
import { compileProgram } from '../utils/compile_program';
import { createWebGL2DataTexture, createWebGL2RenderTexture } from '../resources';
import { toGlTexture } from '../texture';
import { passSize, postStepsOf } from '../../shared/post_steps';
import type { ITexture } from '../../interface';
import type { TPostEffect } from '../../../post/types/t_post_effect';
import type { TUniformLayout } from '../../shared/material_uniforms';

/**
 * Where a screen-wide effect's parameters are bound on this card.
 *
 * Its own number, after the four already spoken for (the frame, a model, its lights, a material).
 * One number means one thing across this backend.
 */
export const POST_UNIFORMS_BINDING = 4;

/**
 * Which texture unit reads the frame, which reads a palette, a table or a transition's mask, which
 * the effect's input, which its history, and which reads the frame again blended between its pixels.
 */
const SCENE_UNIT = 0;
const DATA_UNIT = 1;
const INPUT_UNIT = 2;
const HISTORY_UNIT = 3;
const SMOOTH_UNIT = 4;

/**
 * How many frames a size of picture nobody asked for is kept before it is let go.
 */
const KEPT_IDLE = 30;

type TCompiled = {
    program: WebGLProgram | null;
    layout: TUniformLayout;
    failed: boolean;
};

/**
 * Every screen-wide effect this game has compiled on this card, and the pictures they pass between.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createPostPipelines = (gl: WebGL2RenderingContext) => {
    const compiled = new Map<string, TCompiled>();
    const values = new Float32Array(MAX_MATERIAL_FLOATS);
    const targets = new Map<ITexture, WebGLFramebuffer>();

    let parameters: WebGLBuffer | null = null;
    let scene: ITexture | null = null;
    /**
     * The pictures the chain passes between, by size, made the first time a size is asked for.
     */
    const pool = new Map<string, ITexture[]>();
    /**
     * How many frames each size in the pool has gone unasked: a filter's sizes follow what its object
     * draws, so the ones it has grown out of are let go. See the other card.
     */
    const idle = new Map<string, number>();
    /**
     * Last frame and this frame, for each effect that asked to read what it showed.
     */
    const histories = new Map<TPostEffect, { pair: [ITexture, ITexture]; read: 0 | 1 }>();
    /**
     * The last picture of the scene going out, for a transition that crosses. Kept through a change
     * of size, as on the other card.
     */
    const photos = new Map<TPostEffect, { texture: ITexture; width: number; height: number }>();
    let width = 0;
    let height = 0;
    let blank: ITexture | null = null;
    /**
     * An array object with nothing in it, bound around the whole chain.
     *
     * The triangle is worked out from which corner it is and reads no attributes at all, and the
     * pointers a sprite set up must not still be live during a draw that wants none of them.
     */
    let emptyVao: WebGLVertexArrayObject | null = null;
    /**
     * The chain's own sampler, bound to both units.
     *
     * In GL a sampler belongs to the **unit** and not to the program, and it overrides the bound
     * texture's own settings completely. Without one of our own, whether a palette was read sharply
     * or smoothly would depend on the filtering of whatever sprite happened to be drawn last.
     */
    let sampler: WebGLSampler | null = null;
    let smoothSampler: WebGLSampler | null = null;

    const blankTexture = (): ITexture => {
        // White, not black: an effect that reads it without checking multiplies by one.
        blank ??= createWebGL2DataTexture(gl, new Uint8Array([255, 255, 255, 255]), 1, 1);
        return blank;
    };

    /**
     * A framebuffer for one of the chain's own pictures. No depth: a triangle needs none.
     */
    const framebufferFor = (texture: ITexture): WebGLFramebuffer => {
        let framebuffer = targets.get(texture);
        if (framebuffer === undefined) {
            framebuffer = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, toGlTexture(texture), 0);
            targets.set(texture, framebuffer);
        }
        return framebuffer;
    };

    const release = (texture: ITexture): void => {
        const framebuffer = targets.get(texture);
        if (framebuffer !== undefined) {
            gl.deleteFramebuffer(framebuffer);
            targets.delete(texture);
        }
        gl.deleteTexture(toGlTexture(texture));
    };

    const dropPool = (): void => {
        for (const list of pool.values()) {
            list.forEach(release);
        }
        pool.clear();
        idle.clear();
    };

    const dropHistories = (): void => {
        for (const history of histories.values()) {
            history.pair.forEach(release);
        }
        histories.clear();
    };

    const resize = (nextWidth: number, nextHeight: number): void => {
        if (nextWidth === width && nextHeight === height) {
            return;
        }
        if (scene !== null) {
            release(scene);
        }
        scene = null;
        dropPool();
        dropHistories();
        width = nextWidth;
        height = nextHeight;
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
        const made = createWebGL2RenderTexture(gl, w, h);
        list.push(made);
        return made;
    };

    const historyOf = (effect: TPostEffect) => {
        let history = histories.get(effect);
        if (history === undefined) {
            history = {
                pair: [createWebGL2RenderTexture(gl, width, height), createWebGL2RenderTexture(gl, width, height)],
                read: 0,
            };
            histories.set(effect, history);
        }
        return history;
    };

    const pruneHistories = (chain: readonly TPostEffect[]): void => {
        for (const [effect, history] of histories) {
            if (!chain.includes(effect)) {
                history.pair.forEach(release);
                histories.delete(effect);
            }
        }
        for (const [effect, photo] of photos) {
            if (!chain.includes(effect)) {
                release(photo.texture);
                photos.delete(effect);
            }
        }
    };

    /**
     * The picture a transition that crosses takes of the scene going out, at the size of this frame.
     */
    const photoOf = (effect: TPostEffect): ITexture => {
        let photo = photos.get(effect);
        if (photo !== undefined && (photo.width !== width || photo.height !== height)) {
            release(photo.texture);
            photo = undefined;
        }
        if (photo === undefined) {
            photo = { texture: createWebGL2RenderTexture(gl, width, height), width, height };
            photos.set(effect, photo);
        }
        return photo.texture;
    };

    /**
     * What `sampleOutgoing` reads, in the history's unit. See its twin on the other card.
     */
    const outgoingOf = (effect: TPostEffect, input: ITexture): ITexture => {
        if (effect.source !== 'transition') {
            return blankTexture();
        }
        return photos.get(effect)?.texture ?? input;
    };

    const build = (effect: Pick<TPostEffect, 'name' | 'id' | 'fragmentGlsl' | 'uniformSig'>, filtered = false): TCompiled => {
        const layout = buildUniformLayout(effect.uniformSig, POST_ENGINE_FIELDS);
        // Too many numbers for its slot. Said once where it was made (`checkParameterRoom`).
        if (layout.floatCount > MAX_MATERIAL_FLOATS) {
            return { program: null, layout, failed: true };
        }
        const sources = buildPostShaderGlsl(effect.fragmentGlsl as string, effect.uniformSig, filtered);

        try {
            const program = compileProgram(gl, sources.vertex, sources.fragment, `post ${effect.name ?? effect.id}`);
            gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'MaterialUniforms'), POST_UNIFORMS_BINDING);
            // A sampler uniform is set on the program it belongs to, so this has to be the current
            // one while it is written. Getting that wrong is not an error anywhere: it writes into
            // whichever program happens to be bound.
            gl.useProgram(program);
            gl.uniform1i(gl.getUniformLocation(program, 'sceneTexture'), SCENE_UNIT);
            gl.uniform1i(gl.getUniformLocation(program, 'dataTexture'), DATA_UNIT);
            gl.uniform1i(gl.getUniformLocation(program, 'inputTexture'), INPUT_UNIT);
            gl.uniform1i(gl.getUniformLocation(program, 'historyTexture'), HISTORY_UNIT);
            gl.uniform1i(gl.getUniformLocation(program, 'smoothTexture'), SMOOTH_UNIT);
            gl.useProgram(null);
            return { program, layout, failed: false };
        } catch (error) {
            console.warn(
                `[NacatamalOn] usePostProcess: the effect "${effect.name ?? 'post'}" did not compile on WebGL2. The ` +
                'frame is shown unchanged.',
                error,
            );
            return { program: null, layout, failed: true };
        }
    };

    /**
     * The hook that changes nothing, which is what an effect this card cannot run falls back to.
     *
     * **Falling back and not being skipped**, and the difference is the whole screen. The last
     * effect in a chain is the one that writes the real framebuffer, so an effect that dropped out
     * would leave the frame sitting in a picture nobody ever showed: a black screen instead of an
     * unchanged one. This path is reached far more often here than on the other card, because it
     * covers every hand-written WGSL effect that was never given a GLSL half.
     */
    let identity: TCompiled | null = null;

    const identityFor = (): TCompiled => {
        identity ??= build({
            name: 'identity',
            fragmentGlsl: 'vec4 effect(vec4 color, vec2 uv) { return color; }',
            uniformSig: {},
        } as TPostEffect);
        return identity;
    };

    /**
     * One step of an effect, compiled. A pass is compiled exactly like a hook, with the same knobs.
     */
    const compiledFor = (effect: TPostEffect, fragmentGlsl: string | null, filtered = false): TCompiled => {
        if (fragmentGlsl === null) {
            return identityFor();
        }
        // A filter's step is built apart, with its own ending.
        const key = `${JSON.stringify(effect.uniformSig)} ${fragmentGlsl}${filtered ? ' filtered' : ''}`;
        let entry = compiled.get(key);
        if (entry === undefined) {
            entry = build({ name: effect.name, id: effect.id, fragmentGlsl, uniformSig: effect.uniformSig }, filtered);
            compiled.set(key, entry);
        }
        // One that would not compile is shown through as it is, for the same reason.
        return entry.failed ? identityFor() : entry;
    };

    const warned = new Set<string>();

    /**
     * Says once that an effect was written for the other card only.
     */
    const warnOnce = (effect: TPostEffect): void => {
        const source = effect.fragment;
        if (source === null || warned.has(source)) {
            return;
        }
        warned.add(source);
        console.warn(
            `[NacatamalOn] usePostProcess: the effect "${effect.name ?? 'post'}" is written in WGSL only, which ` +
            'this card cannot compile. The frame is shown unchanged. Give it fragmentGlsl too (in a ' +
            'shader file, the same again after a // @glsl line) to have it on both.',
        );
    };

    /**
     * Runs a chain from a picture to a framebuffer: the screen's, or a filter's. `w` and `h` are the
     * picture's real pixels; the routing is its twin's, see the WebGPU `runChain`.
     */
    const runChain = (
        chain: readonly TPostEffect[],
        first: ITexture,
        w: number,
        h: number,
        destination: WebGLFramebuffer | null,
        time: number,
        progress: number,
        phase: number,
        pixelRatio: number,
        screen: boolean,
    ): void => {
        if (parameters === null) {
            parameters = gl.createBuffer();
            gl.bindBuffer(gl.UNIFORM_BUFFER, parameters);
            gl.bufferData(gl.UNIFORM_BUFFER, values.byteLength, gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.UNIFORM_BUFFER, null);
        }
        emptyVao ??= gl.createVertexArray();
        const makeSampler = (filter: number): WebGLSampler => {
            const made = gl.createSampler();
            gl.samplerParameteri(made, gl.TEXTURE_MIN_FILTER, filter);
            gl.samplerParameteri(made, gl.TEXTURE_MAG_FILTER, filter);
            gl.samplerParameteri(made, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.samplerParameteri(made, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            return made;
        };
        sampler ??= makeSampler(gl.NEAREST);
        smoothSampler ??= makeSampler(gl.LINEAR);

        // A triangle over the whole screen, blended with nothing and tested against nothing.
        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.bindVertexArray(emptyVao);
        gl.bindSampler(SCENE_UNIT, sampler);
        gl.bindSampler(DATA_UNIT, sampler);
        gl.bindSampler(INPUT_UNIT, sampler);
        gl.bindSampler(HISTORY_UNIT, sampler);
        gl.bindSampler(SMOOTH_UNIT, smoothSampler);

        const gameWidth = w / pixelRatio;
        const gameHeight = h / pixelRatio;
        let source = first;

        const bindUnit = (unit: number, texture: ITexture): void => {
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, toGlTexture(texture));
        };

        const draw = (
            effect: TPostEffect,
            entry: TCompiled,
            target: WebGLFramebuffer | null,
            targetWidth: number,
            targetHeight: number,
            read: ITexture,
            input: ITexture,
            history: ITexture,
            resolutionWidth: number,
            resolutionHeight: number,
        ): void => {
            gl.bindFramebuffer(gl.FRAMEBUFFER, target);
            gl.viewport(0, 0, targetWidth, targetHeight);
            gl.useProgram(entry.program);

            values.fill(0, 0, entry.layout.floatCount);
            writeUniformValues(values, entry.layout, effect.uniforms, time, resolutionWidth, resolutionHeight);

            // The two the engine owns for a full-screen effect, poked in after the rest rather
            // than merged into the effect's own values: they change every frame and every frame
            // would otherwise allocate an object to carry them. The layout only has them for a
            // screen-wide effect, which is why the offset is checked rather than assumed.
            if (entry.layout.offsets.progress !== undefined) {
                values[entry.layout.offsets.progress] = progress;
                values[entry.layout.offsets.phase] = phase;
            }
            gl.bindBuffer(gl.UNIFORM_BUFFER, parameters);
            gl.bufferSubData(gl.UNIFORM_BUFFER, 0, values, 0, entry.layout.floatCount);
            gl.bindBuffer(gl.UNIFORM_BUFFER, null);
            gl.bindBufferBase(gl.UNIFORM_BUFFER, POST_UNIFORMS_BINDING, parameters);

            bindUnit(SCENE_UNIT, read);
            bindUnit(DATA_UNIT, effect.palette?.gpu ?? effect.lut?.gpu ?? effect.mask?.gpu ?? blankTexture());
            // A mask is read blended between its pixels, and in GL that belongs to the unit. A
            // palette and a table are fetched by the texel, which no sampler changes.
            gl.bindSampler(DATA_UNIT, (effect.mask?.gpu ?? null) !== null ? smoothSampler : sampler);
            bindUnit(INPUT_UNIT, input);
            bindUnit(HISTORY_UNIT, history);
            bindUnit(SMOOTH_UNIT, read);

            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };

        for (let i = 0; i < chain.length; i++) {
            const effect = chain[i]!;
            const lastEffect = i === chain.length - 1;
            const input = source;
            // A filter's effect has no last frame of its own: see the other card.
            const history = effect.history === true && screen ? historyOf(effect) : null;
            // Taken again each frame while the scene going out is on screen: see the other card.
            if (effect.outgoing === 'take' || effect.outgoing === 'taken') {
                draw(effect, identityFor(), framebufferFor(photoOf(effect)), w, h, source, source, source, gameWidth, gameHeight);
            }
            const historyRead = history !== null ? history.pair[history.read] : effect.history === true ? input : outgoingOf(effect, input);
            const steps = postStepsOf(effect);
            // An effect with any step this card cannot compile is shown through as a whole: half
            // a blur is a stranger picture than none.
            const runnable = steps.every((step) => step.fragmentGlsl !== null);
            // Said once per source, here rather than inside the registry, so it is not said
            // again on every frame for the whole life of the game.
            if (!runnable) {
                warnOnce(effect);
            }
            const planned = runnable ? steps : [steps[steps.length - 1]!];

            for (let j = 0; j < planned.length; j++) {
                const step = planned[j]!;
                const entry = compiledFor(effect, runnable ? step.fragmentGlsl : null, !screen);
                if (entry.program === null) {
                    continue;
                }
                const own = j === planned.length - 1;
                // Compiled at once on this card, so drawing it is drawing it with its own hook.
                if (own && effect.outgoing === 'take') {
                    effect.outgoing = 'taken';
                }

                if (!own) {
                    const [passWidth, passHeight] = passSize(step.scale!, gameWidth, gameHeight);
                    const out = scratchOf(passWidth, passHeight, [source, input, historyRead]);
                    draw(effect, entry, framebufferFor(out), passWidth, passHeight, source, input, historyRead, passWidth, passHeight);
                    source = out;
                    continue;
                }

                if (history !== null) {
                    const written = history.pair[1 - history.read]!;
                    draw(effect, entry, framebufferFor(written), w, h, source, input, historyRead, gameWidth, gameHeight);
                    history.read = history.read === 0 ? 1 : 0;
                    source = written;
                    if (lastEffect) {
                        draw(effect, identityFor(), destination, w, h, written, written, written, gameWidth, gameHeight);
                    }
                    continue;
                }

                // The last one always writes the real destination (the screen, or where a
                // capture is put the right way up), so there is no copy at the end.
                if (lastEffect) {
                    draw(effect, entry, destination, w, h, source, input, historyRead, gameWidth, gameHeight);
                    continue;
                }

                const out = scratchOf(w, h, [source, input]);
                draw(effect, entry, framebufferFor(out), w, h, source, input, historyRead, gameWidth, gameHeight);
                source = out;
            }
        }

        // Everything put back, because the next frame's sprites assume the state they left.
        // **Depth testing stays off**: that is the state every draw in this backend leaves behind
        // and the one sprites assume, since they never switch it off themselves. Switched back on
        // here, the next frame drew its sprites against each other's depth, and of two at the
        // same depth the later one lost: a sprite over a background vanished whenever an effect
        // was on, on this card only.
        for (const unit of [SCENE_UNIT, DATA_UNIT, INPUT_UNIT, HISTORY_UNIT, SMOOTH_UNIT]) {
            gl.bindSampler(unit, null);
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindVertexArray(null);
        gl.useProgram(null);
        gl.depthMask(true);
        gl.enable(gl.BLEND);
    };

    return {
        sceneTarget: (targetWidth: number, targetHeight: number): ITexture => {
            resize(targetWidth, targetHeight);
            scene ??= createWebGL2RenderTexture(gl, width, height);
            return scene;
        },

        // `pixelRatio`: real pixels per game pixel. The hooks run on every real one, but read the
        // game's `resolution`, so a dither pattern keeps the size of a game pixel. A pass reads its
        // own size. The routing is its twin's: see the WebGPU `run`.
        run: (chain: readonly TPostEffect[], destination: WebGLFramebuffer | null, time: number, progress: number, phase: number, pixelRatio = 1): void => {
            pruneHistories(chain);
            runChain(chain, scene!, width, height, destination, time, progress, phase, pixelRatio, true);
        },

        /**
         * Runs a filter's chain over its part of a picture drawn the right way up (`content`, as
         * every picture of this card is kept), into `destination`, a framebuffer of the part's size.
         * The part is copied out turned over, which is the way up the chain reads a picture, and
         * what it writes is kept that way: the filter's layer reads it knowing so.
         */
        runFilter: (
            chain: readonly TPostEffect[],
            content: WebGLFramebuffer,
            contentWidth: number,
            contentHeight: number,
            region: { x: number; y: number; width: number; height: number },
            destination: WebGLFramebuffer,
            time: number,
            pixelRatio = 1,
        ): void => {
            const part = scratchOf(region.width, region.height, []);
            // Made, and so bound, before the copy is set up: making one binds it for reading too.
            const into = framebufferFor(part);
            // The part may hang off the picture's edge, and a copy from off it reads nothing anyone
            // can count on: it starts see-through, and only what is on the picture is copied in.
            gl.bindFramebuffer(gl.FRAMEBUFFER, into);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            const left = Math.max(0, region.x);
            const top = Math.max(0, region.y);
            const right = Math.min(contentWidth, region.x + region.width);
            const bottom = Math.min(contentHeight, region.y + region.height);
            if (right > left && bottom > top) {
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, content);
                gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, into);
                // Turned over on the way: the part's first row is its bottom one, as the chain reads.
                gl.blitFramebuffer(
                    left, top, right, bottom,
                    left - region.x, region.height - (top - region.y), right - region.x, region.height - (bottom - region.y),
                    gl.COLOR_BUFFER_BIT, gl.NEAREST,
                );
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            runChain(chain, part, region.width, region.height, destination, time, 0, 0, pixelRatio, false);
        },

        /**
         * Lets go of every size of picture nobody has asked for in a while: called once a frame.
         */
        endFrame: (): void => {
            for (const [key, frames] of idle) {
                if (frames < KEPT_IDLE) {
                    idle.set(key, frames + 1);
                    continue;
                }
                pool.get(key)?.forEach(release);
                pool.delete(key);
                idle.delete(key);
            }
        },

        destroy: (): void => {
            for (const entry of compiled.values()) {
                if (entry.program !== null) {
                    gl.deleteProgram(entry.program);
                }
            }
            compiled.clear();
            for (const framebuffer of targets.values()) {
                gl.deleteFramebuffer(framebuffer);
            }
            targets.clear();
            for (const texture of [scene, blank]) {
                if (texture !== null) {
                    gl.deleteTexture(toGlTexture(texture));
                }
            }
            dropPool();
            dropHistories();
            for (const photo of photos.values()) {
                release(photo.texture);
            }
            photos.clear();
            if (parameters !== null) {
                gl.deleteBuffer(parameters);
                parameters = null;
            }
            if (emptyVao !== null) {
                gl.deleteVertexArray(emptyVao);
                emptyVao = null;
            }
            if (sampler !== null) {
                gl.deleteSampler(sampler);
                sampler = null;
            }
            if (smoothSampler !== null) {
                gl.deleteSampler(smoothSampler);
                smoothSampler = null;
            }
        },
    };
};

/**
 * Everything this card keeps for its screen-wide effects.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPostPipelines = ReturnType<typeof createPostPipelines>;
