import { createGpuResources } from '../create_gpu_resources';
import { restoreTexture } from '../texture';
import type { TWebGL2State } from '../types/t_webgl2_state';

/**
 * Keeps the game drawing through a lost WebGL2 context.
 *
 * The browser can take the GPU away from a page at any moment: a driver reset, too many contexts
 * open, the tab sent to the background on a phone. Every program, buffer and texture is gone, and
 * WebGL2 says so with `webglcontextlost`. WebGPU has the same problem under another name (a lost
 * device), but this is where it happens most.
 *
 * - **Lost**: `preventDefault()` first, because without it the browser never offers the context
 *   back. Then the backend stops touching the GPU: frames draw nothing, and every texture forgets
 *   its GL object.
 * - **Restored**: everything is built again with the same function as the boot, and every texture
 *   is uploaded again from the image it kept. The game holds the same handles as before, so it never
 *   learns anything happened.
 *
 * Returns the function that stops watching.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const watchContextLoss = (canvas: HTMLCanvasElement, state: TWebGL2State): (() => void) => {
    const onLost = (event: Event): void => {
        event.preventDefault();
        state.lost = true;
        for (const texture of state.textures) {
            texture.glTexture = null;
        }
    };

    const onRestored = (): void => {
        const { gl } = state;
        const { frameUniformBuffer, sprites, tilemaps, meshes } = createGpuResources(gl, state.sprites.defaultSmooth);
        state.frameUniforms.buffer = frameUniformBuffer;
        state.sprites = sprites;
        state.tilemaps = tilemaps;
        state.meshes = meshes;
        // The framebuffers went with the context, and the textures they pointed at are new.
        state.framebuffers.clear();
        state.upright.clear();
        state.uprightUsed.clear();
        state.multisampled.clear();
        state.multisampledUsed.clear();
        // The things built on demand went with it as well: each owns programs, buffers and
        // pictures of its own, taken straight from the context and never put in `textures`, so
        // nothing above restores them. Dropped rather than given back, because there is nothing
        // left to give back: the next frame that needs one builds it, exactly as the first frame
        // that needed one did.
        //
        // Letting them live is the failure that looks like anything but this. A lost context is
        // rare and usually unseen, the game keeps drawing, and then the one scene with an effect
        // or an emitter stops drawing it, from that moment on, with nothing in the console.
        state.post = null;
        state.particles = null;
        state.lines = null;
        state.shadow = null;
        state.shadowPipeline = null;
        for (const texture of state.textures) {
            texture.glTexture = restoreTexture(gl, texture);
        }
        state.lost = false;
    };

    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    return () => {
        canvas.removeEventListener('webglcontextlost', onLost);
        canvas.removeEventListener('webglcontextrestored', onRestored);
    };
};
