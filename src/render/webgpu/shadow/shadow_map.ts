import { SHADOW_MAP_SIZE } from '../../shared/light_space';

/**
 * What the shadow map is made of on this card.
 *
 * **Full floats, not the 24 bits the screen's own depth uses.** The screen's depth only ever has to
 * order things it can see; this one is read back and compared against a number worked out a second
 * time, in a different space, from a different camera. The rounding that nobody can see in the
 * first job is exactly what shows up in the second as the surface striping itself.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SHADOW_FORMAT: GPUTextureFormat = 'depth32float';

/**
 * The depth picture drawn from a light, and the two things needed to read it back.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShadowMap = {
    /**
     * What the shadow pass draws into.
     */
    texture: GPUTexture;
    /**
     * The same, as the pass and the reading both take it.
     */
    view: GPUTextureView;
    /**
     * How it is read: not "what number is here" but "is what I have nearer than what is here".
     *
     * The card answers that for four steps at once and hands back how many of the four said yes, so
     * a rim comes out in four shades rather than one hard staircase. It is the cheapest softening
     * there is, and on this card it is the sampler's `compare` plus linear filtering: ask for the
     * number itself and the softening quietly stops happening.
     */
    sampler: GPUSampler;
    /**
     * How many steps across it is, which the shader needs to know how far one step is.
     */
    size: number;
    /**
     * Gives the picture back. Called when the game ends or the map is remade.
     */
    destroy: () => void;
};

/**
 * Makes the one shadow map this backend keeps.
 *
 * Made on the first frame that has a light asking to cast, and never at boot: it is 16 MB, and a
 * game that never asks for a shadow must not be holding it. That is the same promise the effects
 * chain makes, kept the same way.
 *
 * The comparison is `less-equal` and **that is deliberately the same word its twin in WebGL2 uses**
 * (`LEQUAL`). The two cards offer the comparison under different names, and picking a different one
 * on each is how a surface comes out lit on one machine and striped on the other with the same
 * scene, the same numbers and nothing in the game to blame.
 *
 * Clamped at the edges for a reason worth writing down: past the edge of the map there is no
 * answer, and a picture that repeated would hand back the depth of something on the far side of the
 * scene. Clamping at least makes the wrong answer the *nearest* one, and the shader refuses to
 * believe anything from outside anyway.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createShadowMap = (device: GPUDevice): TShadowMap => {
    const texture = device.createTexture({
        label: 'shadow map',
        size: { width: SHADOW_MAP_SIZE, height: SHADOW_MAP_SIZE },
        format: SHADOW_FORMAT,
        // Both halves of the job in one word each: drawn into by the shadow pass, read by the pass
        // that lights the scene. A picture with only the first is what a renderbuffer already was.
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    const sampler = device.createSampler({
        label: 'shadow map sampler',
        compare: 'less-equal',
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
    });

    return {
        texture,
        view: texture.createView(),
        sampler,
        size: SHADOW_MAP_SIZE,
        destroy: () => { texture.destroy(); },
    };
};
