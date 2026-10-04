import { createWebGL2RenderTexture, destroyWebGL2Texture } from '../resources';
import { textureSize } from '../texture';
import type { ITexture } from '../../interface';
import type { TWebGL2State } from '../types/t_webgl2_state';
import type { TWebGL2Texture } from '../texture';

/**
 * The picture a pass for another canvas is drawn into first, made to that canvas's size.
 *
 * A GL context draws on its own canvas and on nothing else, so a pass that asks for another one is
 * drawn into a picture like any other, which gives it the effects, the depth and the right way up
 * for free, and its pixels are carried over at the end (`presentToCanvas`). Kept per canvas and made
 * again only when the canvas changes size. `null` when the canvas will not give a 2D context, which
 * is a canvas somebody already drew on some other way: the pass is skipped rather than failing every
 * frame.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const canvasTargetFor = (state: TWebGL2State, canvas: HTMLCanvasElement): ITexture | null => {
    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    state.canvasesUsed.add(canvas);

    const kept = state.canvases.get(canvas);
    if (kept !== undefined) {
        const size = textureSize(kept.texture as TWebGL2Texture);
        if (size.width === width && size.height === height) {
            return kept.texture;
        }
        destroyWebGL2Texture(state, kept.texture);
        state.canvases.delete(canvas);
    }

    const context = kept?.context ?? canvas.getContext('2d');
    if (context === null) {
        return null;
    }
    const texture = createWebGL2RenderTexture(state.gl, width, height);
    state.textures.add(texture as TWebGL2Texture);
    state.canvases.set(canvas, { texture, context, image: context.createImageData(width, height) });
    return texture;
};

/**
 * Carries a pass's picture over to the canvas it was for.
 *
 * Read back at once and pasted. It stalls the card for as long as a small picture takes, which is
 * the price of a second canvas on this backend and is only paid while somebody is looking at one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const presentToCanvas = (state: TWebGL2State, canvas: HTMLCanvasElement): void => {
    const { gl } = state;
    const kept = state.canvases.get(canvas);
    const framebuffer = kept === undefined ? undefined : state.framebuffers.get(kept.texture as TWebGL2Texture);
    if (kept === undefined || framebuffer === undefined) {
        return;
    }
    const { width, height } = kept.image;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    // A picture is kept top row first (see `copyUpright`), which is the order a canvas wants.
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(kept.image.data.buffer));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    kept.context.putImageData(kept.image, 0, 0);
};

/**
 * Lets go of the picture of every canvas no pass drew for this frame, and starts counting the next.
 * A preview that was closed would otherwise keep its picture for the rest of the game.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const releaseUnusedCanvasTargets = (state: TWebGL2State): void => {
    for (const [canvas, kept] of state.canvases) {
        if (!state.canvasesUsed.has(canvas)) {
            destroyWebGL2Texture(state, kept.texture);
            state.canvases.delete(canvas);
        }
    }
    state.canvasesUsed.clear();
};
