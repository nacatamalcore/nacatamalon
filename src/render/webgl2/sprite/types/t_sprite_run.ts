/**
 * Consecutive sprites that share one texture, one filtering and one effect, drawn with a single
 * call.
 *
 * The effect is part of what makes a batch, not just the texture: two sprites running different
 * shaders are two programs, and no call can use two. Sharing one, they still come out in a single
 * draw. Its twin in the other backend groups by exactly the same three things.
 *
 * @internal
 */
export type TSpriteRun = {
    /**
     * The texture bound for this run.
     */
    texture: WebGLTexture;
    /**
     * How it is read: the nearest or the linear sampler.
     */
    sampler: WebGLSampler;
    /**
     * The effect these sprites share, or `null` for the built-in shader.
     */
    material: TDrawShader | null;
    /**
     * The knobs of the one sprite in this run, when it brought its own.
     */
    uniforms: TUniformValues | null;
    /**
     * Index of the run's first sprite in the instance buffer.
     */
    start: number;
    /**
     * Where that first sprite sat in the frame's list of things to draw, so a map's layer drawn in
     * between keeps its place.
     */
    firstDrawable: number;
    /**
     * How many sprites the run draws.
     */
    count: number;
};

import type { TDrawShader } from '../../../interface/draw/t_draw_material';
import type { TUniformValues } from '../../../../materials/types/t_uniforms';
