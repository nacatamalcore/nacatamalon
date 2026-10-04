import { describe, expect, it } from 'bun:test';
import { watchContextLoss } from '../src/render/webgl2/context/watch_context_loss';
import type { TWebGL2State } from '../src/render/webgl2/types/t_webgl2_state';

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
    lost: false,
    particles: nothing() as TWebGL2State['particles'],
    lines: nothing() as TWebGL2State['lines'],
    post: nothing() as TWebGL2State['post'],
    shadow: nothing() as TWebGL2State['shadow'],
    shadowPipeline: nothing() as TWebGL2State['shadowPipeline'],
});

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
});
