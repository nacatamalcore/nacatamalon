/**
 * Consecutive sprites that share a filtering, blend and effect, drawn with a single call. Their
 * pictures may differ, up to eight of them.
 *
 * The effect is part of what makes a batch, and the picture no longer is: two sprites running different
 * shaders are two pipelines, and no call can set two. Sharing one, though, they still come out in a
 * single draw, which is the thing this engine has that drawing a quad apiece would not.
 *
 * @internal
 */
export type TSpriteRun = {
    /**
     * Frames in a row this record has not been drawn, 0 while it is. It is dropped after
     * `SPARE_SPRITE_FRAMES`.
     */
    spareFor: number;
    /**
     * The run's pictures, in the order they first appear. A sprite's slot is its place here. A run
     * with an effect or that cuts a mask's shape always has one.
     */
    textures: GPUTexture[];
    /**
     * Group 1 for this run: the sampler and eight picture slots. With one picture it is that
     * picture's own group, in all eight.
     */
    bindGroup: GPUBindGroup;
    /**
     * The last group made for this run record when it held several pictures, kept for the next
     * frame, which usually draws the same ones.
     */
    batchBindGroup?: GPUBindGroup;
    /**
     * The pictures `batchBindGroup` was made with, in their slots.
     */
    boundTextures?: GPUTexture[];
    /**
     * The filtering `batchBindGroup` was made with.
     */
    boundSmooth?: boolean;
    /**
     * Frames in a row `batchBindGroup` has not been drawn with, whether the run went back to one
     * picture or stopped drawing. It is let go of after `SPARE_SPRITE_FRAMES`.
     */
    batchUnusedFor: number;
    /**
     * The effect these sprites share, or `null` for the built-in shader.
     */
    material: TDrawShader | null;
    /**
     * Whether their sheet is read blended between its pixels, which is how the effect's maps are read
     * too when they say nothing. The same for the whole run, which is broken where it changes.
     */
    smooth: boolean;
    /**
     * Whether its sheet is a distance field (a vector font's letters), which is drawn with its own
     * ending.
     */
    distanceField: boolean;
    /**
     * Whether these sprites add their light to what is behind them rather than covering it.
     */
    additive: boolean;
    /**
     * The knobs of the one sprite in this run, when it brought its own.
     *
     * Its presence is why the run has one sprite in it: the numbers are written once per run, so
     * sprites wanting different ones cannot be in the same one.
     */
    uniforms: TUniformValues | null;
    /**
     * Where these sprites may draw and what they do to the stencil, or `null` in a pass where
     * nothing is masked. A run never mixes two: a mask's shape and what it keeps in are told apart
     * here.
     */
    stencil: TDrawStencil | null;
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
import type { TDrawStencil } from '../../../interface/draw/t_draw_stencil';
import type { TUniformValues } from '../../../../materials/types/t_uniforms';
