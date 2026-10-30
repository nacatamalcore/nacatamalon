import { describe, expect, it } from 'bun:test';
import { watchContextLoss } from '../src/render/webgl2/context/watch_context_loss';
import type { TWebGL2State } from '../src/render/webgl2/types/t_webgl2_state';
import { createWebGL2Buffer, updateWebGL2Buffer, type TWebGL2Buffer } from '../src/render/webgl2/resources';

/**
 * What survives the browser taking the GPU away, and what must not pretend to.
 *
 * A lost context is rare, unseen and usually recovered from without the player noticing, which is
 * exactly what makes anything left pointing at the dead one so hard to find later: the game goes on
 * drawing, and only the one scene with an effect, an emitter or a shadow quietly stops.
 */

/**
 * Anything asked of it is a function that does nothing and returns another one of these.
 */
const nothing = (): unknown => new Proxy(() => ({}), { get: () => nothing() });

/**
 * A state with the three built-on-demand things present, as a game mid-play would have them.
 */
const stateWithEverything = (): TWebGL2State => ({
    gl: nothing() as WebGL2RenderingContext,
    clearColor: { r: 0, g: 0, b: 0, a: 1 },
    frameUniforms: { data: new Float32Array(4), buffer: {} as WebGLBuffer },
    sprites: { defaultSmooth: false } as TWebGL2State['sprites'],
    tilemaps: nothing() as TWebGL2State['tilemaps'],
    meshes: nothing() as TWebGL2State['meshes'],
    framebuffers: new Map(),
    upright: new Map(),
    uprightUsed: new Set(),
    canvases: new Map(),
    canvasesUsed: new Set(),
    samples: 1,
    multisampled: new Map(),
    multisampledUsed: new Set(),
    textures: new Set(),
    buffers: new Set(),
    lost: false,
    particles: nothing() as TWebGL2State['particles'],
    lines: nothing() as TWebGL2State['lines'],
    post: nothing() as TWebGL2State['post'],
    shadow: nothing() as TWebGL2State['shadow'],
    shadowPipeline: nothing() as TWebGL2State['shadowPipeline'],
    masks: nothing() as TWebGL2State['masks'],
});

/**
 * A card that remembers what each of its buffers was last given. Anything else asked of it does
 * nothing.
 */
const cardThatKeeps = () => {
    const contents = new Map<WebGLBuffer, Uint8Array>();
    let bound: WebGLBuffer | null = null;
    const own = {
        ARRAY_BUFFER: 1,
        ELEMENT_ARRAY_BUFFER: 2,
        UNIFORM_BUFFER: 3,
        DYNAMIC_DRAW: 4,
        createBuffer: () => ({}) as WebGLBuffer,
        bindBuffer: (_target: number, buffer: WebGLBuffer | null) => {
            bound = buffer;
        },
        // The boot's own buffers are given a size rather than bytes.
        bufferData: (_target: number, bytes: Uint8Array | number) => {
            contents.set(bound!, typeof bytes === 'number' ? new Uint8Array(bytes) : bytes.slice());
        },
        bufferSubData: (_target: number, offset: number, data: Float32Array) => {
            contents.get(bound!)!.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), offset);
        },
    };
    const gl = new Proxy(own, { get: (target, key) => (key in target ? target[key as keyof typeof own] : nothing()) }) as unknown as WebGL2RenderingContext;
    return {
        gl,
        // What the old context had goes with it.
        forget: () => contents.clear(),
        holds: (numbers: number[]) => [...contents.values()].some((bytes) => bytes.byteLength === numbers.length * 4 && [...new Float32Array(bytes.slice().buffer)].every((n, i) => n === numbers[i])),
        contentsOf: (buffer: TWebGL2Buffer) => [...new Float32Array(contents.get(buffer.glBuffer!)!.slice().buffer)],
    };
};

describe('coming back from a lost context', () => {
    it('drops everything that was built on demand, so the next frame builds it against the new context', () => {
        const canvas = new EventTarget() as HTMLCanvasElement;
        const state = stateWithEverything();
        watchContextLoss(canvas, state);

        canvas.dispatchEvent(new Event('webglcontextrestored'));

        // None of the three is in `textures`, so nothing above this restores them: each owns
        // programs and buffers taken straight from the context, and the context is not the same one.
        expect(state.post).toBeNull();
        expect(state.particles).toBeNull();
        expect(state.lines).toBeNull();
        expect(state.shadow).toBeNull();
        expect(state.shadowPipeline).toBeNull();
        expect(state.masks).toBeNull();
        expect(state.lost).toBe(false);
    });

    it('lets go of the framebuffers too, because the pictures they pointed at are new', () => {
        const canvas = new EventTarget() as HTMLCanvasElement;
        const state = stateWithEverything();
        state.framebuffers.set({} as never, {} as WebGLFramebuffer);
        watchContextLoss(canvas, state);

        canvas.dispatchEvent(new Event('webglcontextrestored'));

        expect(state.framebuffers.size).toBe(0);
    });

    it('stops touching the GPU the moment it is lost, and forgets every picture', () => {
        const canvas = new EventTarget() as HTMLCanvasElement;
        const state = stateWithEverything();
        const texture = { resourceType: 'texture', glTexture: {} } as never;
        state.textures.add(texture);
        watchContextLoss(canvas, state);

        canvas.dispatchEvent(new Event('webglcontextlost'));

        expect(state.lost).toBe(true);
        expect((texture as { glTexture: unknown }).glTexture).toBeNull();
    });

    it('gives back the corners of every model, map layer and shape, as last written', () => {
        const card = cardThatKeeps();
        const canvas = new EventTarget() as HTMLCanvasElement;
        const state = { ...stateWithEverything(), gl: card.gl };
        watchContextLoss(canvas, state);
        // A shape hands over a view of corners it keeps rewriting: the buffer must not follow it.
        const corners = new Float32Array([1, 2, 3, 4, 9, 9]);
        const buffer = createWebGL2Buffer(card.gl, false, corners.subarray(0, 4), 'vertex');
        state.buffers.add(buffer);
        corners.set([7, 7, 7, 7]);
        updateWebGL2Buffer(card.gl, false, buffer, new Float32Array([5, 6]));

        canvas.dispatchEvent(new Event('webglcontextlost'));
        expect(buffer.glBuffer).toBeNull();
        canvas.dispatchEvent(new Event('webglcontextrestored'));

        expect(buffer.glBuffer).not.toBeNull();
        expect(card.contentsOf(buffer)).toEqual([5, 6, 3, 4]);
    });

    it('keeps what is made or written while lost, and uploads it with the restore', () => {
        const card = cardThatKeeps();
        const canvas = new EventTarget() as HTMLCanvasElement;
        const state = { ...stateWithEverything(), gl: card.gl };
        watchContextLoss(canvas, state);
        const before = createWebGL2Buffer(card.gl, false, new Float32Array([1, 2]), 'vertex');
        state.buffers.add(before);

        canvas.dispatchEvent(new Event('webglcontextlost'));
        // A tile changed while there was no card, and a new layer was made.
        updateWebGL2Buffer(card.gl, true, before, new Float32Array([8]));
        const during = createWebGL2Buffer(card.gl, true, new Float32Array([3, 4]), 'vertex');
        state.buffers.add(during);
        expect(during.glBuffer).toBeNull();
        canvas.dispatchEvent(new Event('webglcontextrestored'));

        expect(card.contentsOf(before)).toEqual([8, 2]);
        expect(card.contentsOf(during)).toEqual([3, 4]);
    });

    it('does not bring back a buffer let go of', () => {
        const card = cardThatKeeps();
        const canvas = new EventTarget() as HTMLCanvasElement;
        const state = { ...stateWithEverything(), gl: card.gl };
        watchContextLoss(canvas, state);
        const buffer = createWebGL2Buffer(card.gl, false, new Float32Array([1, 2, 3]), 'vertex');
        state.buffers.add(buffer);
        state.buffers.delete(buffer);

        canvas.dispatchEvent(new Event('webglcontextlost'));
        card.forget();
        canvas.dispatchEvent(new Event('webglcontextrestored'));

        expect(card.holds([1, 2, 3])).toBe(false);
    });
});
