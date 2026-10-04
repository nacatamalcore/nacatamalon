import { textureSize } from '../texture';
import type { ITexture, TCaptureResult } from '../../interface';
import type { TWebGL2Texture } from '../texture';

/**
 * Brings a picture's pixels back from the graphics card.
 *
 * The picture has to be hung off a framebuffer first, because reading always reads from one. The rows
 * come back in the order the texture keeps them, and a picture is kept **top row first** (the frame
 * turns it over as it copies it in, see `copyUpright`), so they are already in the order the
 * interface promises: top-left first, the same on both backends.
 *
 * Not really asynchronous here (WebGPU's is), but it answers a promise all the same, because the
 * shape of the answer belongs to the interface and not to whichever backend happens to be running.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readWebGL2Texture = async (gl: WebGL2RenderingContext, texture: ITexture): Promise<TCaptureResult> => {
    const handle = texture as TWebGL2Texture;
    const { width, height } = textureSize(handle);
    const data = new Uint8Array(width * height * 4);

    if (handle.glTexture === null) {
        // The context is gone: an empty picture rather than an error, which is what reading one
        // nothing has drawn into gives back anyway.
        return { width, height, data };
    }

    const framebuffer = gl.createFramebuffer();
    const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, handle.glTexture, 0);

    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);

    gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
    gl.deleteFramebuffer(framebuffer);

    return { width, height, data };
};
