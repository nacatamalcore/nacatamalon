import type { ITexture } from '../../interface';
import type { TWebGL2Texture } from '../texture';
import type { TWebGL2State } from '../types/t_webgl2_state';

/**
 * Lets a texture go, and everything this backend made around it.
 *
 * More than the texture itself in WebGL2, in three places:
 *
 * - **Its framebuffer and depth**, made the first time a pass drew into it (`bindTarget`). The depth
 *   is not kept anywhere else, so it is asked of the framebuffer before that goes.
 * - **The list a restore uploads again.** Left there, a lost context would bring back a texture
 *   nobody holds any more.
 * - **The image it was uploaded from**, kept for that same restore.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const destroyWebGL2Texture = (state: TWebGL2State, texture: ITexture): void => {
    const { gl } = state;
    const handle = texture as TWebGL2Texture;

    const framebuffer = state.framebuffers.get(handle);
    if (framebuffer !== undefined) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        const depth = gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME) as WebGLRenderbuffer | null;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteRenderbuffer(depth);
        gl.deleteFramebuffer(framebuffer);
        state.framebuffers.delete(handle);
    }

    gl.deleteTexture(handle.glTexture);
    handle.glTexture = null;
    if (handle.source.kind === 'image') {
        handle.source.image.close();
    }
    state.textures.delete(handle);
};
