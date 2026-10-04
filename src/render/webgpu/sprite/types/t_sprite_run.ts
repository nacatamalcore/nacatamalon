/**
 * Consecutive sprites that share one sheet and one effect, drawn with a single call.
 *
 * The effect is part of what makes a batch, not just the sheet: two sprites running different
 * shaders are two pipelines, and no call can set two. Sharing one, though, they still come out in a
 * single draw, which is the thing this engine has that drawing a quad apiece would not.
 *
 * @internal
 */
export type TSpriteRun = {
    /**
     * Group 1 for this run: the sampler and the texture.
     */
    bindGroup: GPUBindGroup;
    /**
     * The effect these sprites share, or `null` for the built-in shader.
     */
    material: TDrawShader | null;
    /**
     * The knobs of the one sprite in this run, when it brought its own.
     *
     * Its presence is why the run has one sprite in it: the numbers are written once per run, so
     * sprites wanting different ones cannot be in the same one.
     */
    uniforms: TUniformValues | null;
    /**
     * Index of the run's first sprite in the instance buffer.
     */
    start: number;
    /**
     * Where that first sprite sat in the frame's list of things to draw.
     *
     * The frame draws in the order it was given, and a map's layer sits **between** sprites: the
     * ground under the characters, the treetops over them. This is what lets the two lists be
     * walked together instead of drawing every sprite and then every layer.
     */
    firstDrawable: number;
    /**
     * How many sprites the run draws.
     */
    count: number;
};

import type { TDrawShader } from '../../../interface/draw/t_draw_material';
import type { TUniformValues } from '../../../../materials/types/t_uniforms';
