import type { ITexture } from '../../interface';

/**
 * What an `ITexture` is inside the WebGL2 backend. Never leaves `render/webgl2`.
 *
 * It keeps where its pixels came from, which WebGPU does not need: a lost WebGL2 context takes every
 * texture with it, and the only way to bring them back is to upload them again. The handle is what
 * the game holds, so on a restore `glTexture` is replaced and the game never notices.
 *
 * @internal
 */
export type TWebGL2Texture = ITexture & {
    /**
     * Where its pixels come from, so a restore can make it again:
     *
     * - `'image'`: a decoded file, kept and uploaded once more.
     * - `'data'`: bytes somebody worked out (a palette), kept for the same reason.
     * - `'render'`: something the game drew into. Nothing can bring back what it held, so it comes
     *   back empty and whatever drew into it draws again on the next frame.
     */
    readonly source:
        | { kind: 'image'; image: ImageBitmap }
        | { kind: 'data'; data: Uint8Array; width: number; height: number }
        | { kind: 'render'; width: number; height: number };
    /**
     * `null` while the context is lost, until the restore uploads it again.
     */
    glTexture: WebGLTexture | null;
};

/**
 * Uploads a decoded image as an RGBA8 texture.
 *
 * Nothing is flipped and nothing is premultiplied, so row 0 of the image is `v = 0` and the alpha
 * stays straight, like `copyExternalImageToTexture` in the WebGPU backend. Both are set on every
 * upload because they are global state, and anything else could have changed them.
 *
 * The filtering and wrapping set here are only a fallback: the sampler bound when drawing wins.
 * They are set anyway so the texture is complete (the default minification expects mipmaps).
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const uploadTexture = (gl: WebGL2RenderingContext, image: TexImageSource): WebGLTexture => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
};

/**
 * The `WebGLTexture` behind a handle, or `null` if it is not on the GPU right now. Only valid for
 * handles this backend created, which is every handle a WebGL2 game can hold.
 *
 * @internal
 */
export const toGlTexture = (texture: ITexture): WebGLTexture | null => (texture as TWebGL2Texture).glTexture;

/**
 * Uploads raw bytes as a texture. The other half of `uploadTexture`, for pictures that were worked
 * out rather than decoded, and for an empty one a pass will draw into.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const uploadPixels = (gl: WebGL2RenderingContext, data: Uint8Array | null, width: number, height: number): WebGLTexture => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Rows of any width, not only multiples of four: a three pixel wide palette would otherwise be
    // read slanted.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
};

/**
 * Makes a texture's pixels again after a lost context, from wherever they came from.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const restoreTexture = (gl: WebGL2RenderingContext, texture: TWebGL2Texture): WebGLTexture => {
    if (texture.source.kind === 'image') {
        return uploadTexture(gl, texture.source.image);
    }
    if (texture.source.kind === 'data') {
        return uploadPixels(gl, texture.source.data, texture.source.width, texture.source.height);
    }
    // Drawn into, so there is nothing to bring back: it comes back empty and whatever filled it
    // fills it again on the next frame.
    return uploadPixels(gl, null, texture.source.width, texture.source.height);
};

/**
 * How big a texture is, which a readback needs and only the handle knows.
 *
 * @internal
 */
export const textureSize = (texture: TWebGL2Texture): { width: number; height: number } => {
    if (texture.source.kind === 'image') {
        return { width: texture.source.image.width, height: texture.source.image.height };
    }
    return { width: texture.source.width, height: texture.source.height };
};
