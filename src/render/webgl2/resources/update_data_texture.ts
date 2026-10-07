import { toGlTexture } from '../texture';
import type { ITexture, TTextureRegion } from '../../interface';
import type { TWebGL2Texture } from '../texture';

/**
 * Sends a rectangle of a picture's bytes to the texture made from it.
 *
 * GL is told how wide a whole row is and where the rectangle starts, so it reads the rectangle
 * straight out of the full picture; those three settings go back to `0` afterwards, because every
 * other upload in this backend assumes tightly packed rows starting at the first byte.
 *
 * The texture remembers `data` as what to upload again after a lost context, so a restore brings
 * back the picture as it is now and not as it was made.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const updateWebGL2DataTexture = (
    gl: WebGL2RenderingContext,
    lost: boolean,
    texture: ITexture,
    data: Uint8Array,
    width: number,
    height: number,
    region: TTextureRegion = { x: 0, y: 0, width, height },
): void => {
    const own = texture as TWebGL2Texture;
    if (own.source.kind === 'data' && own.source.data !== data) {
        (own as { source: TWebGL2Texture['source'] }).source = { kind: 'data', data, width, height };
    }
    // A lost context has nothing to write to; the restore uploads `data` whole.
    const glTexture = toGlTexture(texture);
    if (lost || glTexture === null || region.width <= 0 || region.height <= 0) {
        return;
    }

    gl.bindTexture(gl.TEXTURE_2D, glTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, width);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, region.x);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, region.y);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, region.x, region.y, region.width, region.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
};
