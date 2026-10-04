import { uploadPixels } from '../texture';
import type { ITexture } from '../../interface';
import type { TWebGL2Texture } from '../texture';

/**
 * An empty picture a pass can draw into and anything else can then show.
 *
 * In WebGL2 there is nothing special about it: it is an ordinary texture, and what makes a pass draw
 * into it is hanging it off a framebuffer, which the frame does.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createWebGL2RenderTexture = (gl: WebGL2RenderingContext, width: number, height: number): ITexture => {
    const size = { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(height)) };
    const texture: TWebGL2Texture = {
        resourceType: 'texture',
        source: { kind: 'render', ...size },
        glTexture: uploadPixels(gl, null, size.width, size.height),
    };
    return texture;
};
