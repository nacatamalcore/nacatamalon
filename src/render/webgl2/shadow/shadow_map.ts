import { SHADOW_MAP_SIZE } from '../../shared/light_space';

/**
 * The depth picture drawn from a light, and what it is hung off to be drawn into.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShadowMap = {
    /**
     * The picture itself, read back by the shaders that light the scene.
     */
    texture: WebGLTexture;
    /**
     * What the shadow pass points at so its depth lands in that picture.
     */
    framebuffer: WebGLFramebuffer;
    /**
     * How many steps across it is, which the shader needs to know how far one step is.
     */
    size: number;
    /**
     * Gives both back. Called when the game ends, the map is remade, or the context is lost.
     */
    destroy: () => void;
};

/**
 * Makes the one shadow map this backend keeps.
 *
 * Made on the first frame that has a light asking to cast, and never at boot, the same as the
 * effects chain and for the same reason: it is 16 MB.
 *
 * **This is a texture and not a renderbuffer, and that is the whole of this step.** The frame
 * already has depth in both backends, and a renderbuffer is the cheaper way to have it: the card
 * may keep it in whatever form suits it, because nobody will ever look. A shadow map is the case
 * where somebody does, so it has to be a picture from the start. There is no converting one into
 * the other afterwards.
 *
 * Two things here have no counterpart in any other texture this engine makes:
 *
 * - **Comparison mode.** With it on, reading the picture does not give the number stored there: it
 *   gives whether the number you brought is nearer, as `0` or `1`, and with linear filtering the
 *   card answers for four steps at once and averages them. That is four shades along a rim for
 *   free, and it is why the filter is linear on a picture that would otherwise have to be nearest.
 *   `LEQUAL` is the same comparison its twin in WebGPU asks for by the name `less-equal`.
 * - **No colour at all.** A framebuffer with only depth is legal but has to say so, or the card
 *   goes looking for a colour attachment that is not there and reports the whole thing incomplete.
 *   `NONE` for both is how it is said.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createShadowMap = (gl: WebGL2RenderingContext): TShadowMap | null => {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (texture === null || framebuffer === null) {
        return null;
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F,
        SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, 0,
        gl.DEPTH_COMPONENT, gl.FLOAT, null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // Past the edge there is no answer, and a picture that repeated would hand back the depth of
    // something on the far side of the scene.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);

    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    if (!complete) {
        gl.deleteTexture(texture);
        gl.deleteFramebuffer(framebuffer);
        // Said out loud rather than drawn wrong: without a map the scene is lit with no shadows,
        // which is the look this game had a moment ago and not a broken frame.
        console.warn('[NacatamalOn] shadows: this card would not give a depth picture to draw into, so the scene is lit without them.');
        return null;
    }

    return {
        texture,
        framebuffer,
        size: SHADOW_MAP_SIZE,
        destroy: () => {
            gl.deleteTexture(texture);
            gl.deleteFramebuffer(framebuffer);
        },
    };
};
