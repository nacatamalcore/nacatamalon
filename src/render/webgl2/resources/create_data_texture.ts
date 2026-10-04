import { uploadPixels } from '../texture';
import type { ITexture } from '../../interface';
import type { TWebGL2Texture } from '../texture';

/**
 * Uploads raw bytes as a picture: what is worked out rather than decoded, like a palette.
 *
 * The size is checked here, because bytes that do not match it are read past the end and come back
 * as colours that look plausible and are wrong.
 *
 * The bytes are kept on the handle: there is no file to decode again if the context is lost.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createWebGL2DataTexture = (gl: WebGL2RenderingContext, data: Uint8Array, width: number, height: number): ITexture => {
    const expected = width * height * 4;
    if (data.length !== expected) {
        throw new Error(`[NacatamalOn] createDataTexture: ${width} by ${height} needs ${expected} bytes and ${data.length} were given.`);
    }

    const texture: TWebGL2Texture = {
        resourceType: 'texture',
        source: { kind: 'data', data, width, height },
        glTexture: uploadPixels(gl, data, width, height),
    };
    return texture;
};
