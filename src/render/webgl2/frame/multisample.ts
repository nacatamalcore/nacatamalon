import type { TWebGL2State } from '../types/t_webgl2_state';

/**
 * Points the context at a place of `width` by `height` with several samples per pixel, to draw a
 * pass in before it is resolved into `into`, and hands back where it came from.
 *
 * Made once per size and kind, and kept. The colour matches what it will be resolved into, because GL
 * refuses to resolve samples into a different format: the canvas has no alpha (`alpha: false`, see
 * `createContext`) and a picture does. Its depth has the same samples, or the pass is incomplete.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const bindMultisampled = (state: TWebGL2State, width: number, height: number): WebGLFramebuffer | null => {
    const { gl } = state;
    const into = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const toCanvas = into === null;
    const key = `${width}x${height}${toCanvas ? ' canvas' : ''}`;
    state.multisampledUsed.add(key);

    let framebuffer = state.multisampled.get(key);
    if (framebuffer === undefined) {
        framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        const color = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, color);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, state.samples, toCanvas ? gl.RGB8 : gl.RGBA8, width, height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
        const depth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, state.samples, gl.DEPTH_COMPONENT24, width, height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        state.multisampled.set(key, framebuffer);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    return into;
};

/**
 * Resolves what was drawn with several samples into `into`, one pixel each, and leaves `into` bound
 * for whatever the pass does next.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const resolveMultisampled = (state: TWebGL2State, into: WebGLFramebuffer | null, width: number, height: number): void => {
    const { gl } = state;
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, into);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, into);
};

/**
 * Lets go of every place of that kind this frame did not draw at, and starts counting the next.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const releaseUnusedMultisampled = (state: TWebGL2State): void => {
    const { gl } = state;
    for (const [key, framebuffer] of state.multisampled) {
        if (state.multisampledUsed.has(key)) {
            continue;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        const color = gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME) as WebGLRenderbuffer | null;
        const depth = gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME) as WebGLRenderbuffer | null;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteRenderbuffer(color);
        gl.deleteRenderbuffer(depth);
        gl.deleteFramebuffer(framebuffer);
        state.multisampled.delete(key);
    }
    state.multisampledUsed.clear();
};
