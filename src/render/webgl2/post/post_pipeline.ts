import { buildPostShaderGlsl } from './post_shader';
import { buildUniformLayout, POST_ENGINE_FIELDS, writeUniformValues } from '../../shared/material_uniforms';
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
 * Which texture unit reads the frame, which reads a palette or a table, which the effect's input,
 * which its history, and which reads the frame again blended between its pixels.
 */
const SCENE_UNIT = 0;
const DATA_UNIT = 1;
const INPUT_UNIT = 2;
const HISTORY_UNIT = 3;
const SMOOTH_UNIT = 4;

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
    const values = new Float32Array(64);
    const targets = new Map<ITexture, WebGLFramebuffer>();

    let parameters: WebGLBuffer | null = null;
    let scene: ITexture | null = null;
    /**
     * The pictures the chain passes between, by size, made the first time a size is asked for.
     */
    const pool = new Map<string, ITexture[]>();
    /**
     * Last frame and this frame, for each effect that asked to read what it showed.
     */
    const histories = new Map<TPostEffect, { pair: [ITexture, ITexture]; read: 0 | 1 }>();
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
    };

    const build = (effect: Pick<TPostEffect, 'name' | 'id' | 'fragmentGlsl' | 'uniformSig'>): TCompiled => {
        const layout = buildUniformLayout(effect.uniformSig, POST_ENGINE_FIELDS);
        const sources = buildPostShaderGlsl(effect.fragmentGlsl as string, effect.uniformSig);

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
                `[NacatamalOn] the effect "${effect.name ?? 'post'}" did not compile on WebGL2. The ` +
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
    const compiledFor = (effect: TPostEffect, fragmentGlsl: string | null): TCompiled => {
        if (fragmentGlsl === null) {
            return identityFor();
        }
        const key = `${JSON.stringify(effect.uniformSig)} ${fragmentGlsl}`;
        let entry = compiled.get(key);
        if (entry === undefined) {
            entry = build({ name: effect.name, id: effect.id, fragmentGlsl, uniformSig: effect.uniformSig });
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
            `[NacatamalOn] the effect "${effect.name ?? 'post'}" is written in WGSL only, which ` +
            'this card cannot compile. The frame is shown unchanged. Write the effect again after ' +
            'a // @glsl line to have it on both.',
        );
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

            pruneHistories(chain);

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

            const gameWidth = width / pixelRatio;
            const gameHeight = height / pixelRatio;
            let source = scene!;

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
                bindUnit(DATA_UNIT, effect.palette?.gpu ?? effect.lut?.gpu ?? blankTexture());
                bindUnit(INPUT_UNIT, input);
                bindUnit(HISTORY_UNIT, history);
                bindUnit(SMOOTH_UNIT, read);

                gl.drawArrays(gl.TRIANGLES, 0, 3);
            };

            for (let i = 0; i < chain.length; i++) {
                const effect = chain[i]!;
                const lastEffect = i === chain.length - 1;
                const input = source;
                const history = effect.history === true ? historyOf(effect) : null;
                const historyRead = history === null ? blankTexture() : history.pair[history.read];
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
                    const entry = compiledFor(effect, runnable ? step.fragmentGlsl : null);
                    if (entry.program === null) {
                        continue;
                    }
                    const own = j === planned.length - 1;

                    if (!own) {
                        const [w, h] = passSize(step.scale!, gameWidth, gameHeight);
                        const out = scratchOf(w, h, [source, input, historyRead]);
                        draw(effect, entry, framebufferFor(out), w, h, source, input, historyRead, w, h);
                        source = out;
                        continue;
                    }

                    if (history !== null) {
                        const written = history.pair[1 - history.read]!;
                        draw(effect, entry, framebufferFor(written), width, height, source, input, historyRead, gameWidth, gameHeight);
                        history.read = history.read === 0 ? 1 : 0;
                        source = written;
                        if (lastEffect) {
                            draw(effect, identityFor(), destination, width, height, written, written, written, gameWidth, gameHeight);
                        }
                        continue;
                    }

                    // The last one always writes the real destination (the screen, or where a
                    // capture is put the right way up), so there is no copy at the end.
                    if (lastEffect) {
                        draw(effect, entry, destination, width, height, source, input, historyRead, gameWidth, gameHeight);
                        continue;
                    }

                    const out = scratchOf(width, height, [source, input]);
                    draw(effect, entry, framebufferFor(out), width, height, source, input, historyRead, gameWidth, gameHeight);
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
