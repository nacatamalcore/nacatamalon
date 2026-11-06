// everyframe
import { SPRITE_TEXTURE_SLOTS } from '../../shared/sprite_batch';
import type { TSpritePipeline } from './types/t_sprite_pipeline';
import type { TSpriteRun } from './types/t_sprite_run';

/**
 * Whether the group kept on the run was made with the pictures and the filtering it has now.
 */
const stillBound = (run: TSpriteRun): boolean => {
    const bound = run.boundTextures;
    if (run.batchBindGroup === undefined || bound === undefined || run.boundSmooth !== run.smooth) return false;
    if (bound.length !== run.textures.length) return false;
    for (let i = 0; i < bound.length; i++) {
        if (bound[i] !== run.textures[i]) return false;
    }
    return true;
};

/**
 * Group 1 for a run that draws several pictures: the sampler, then the pictures in their slots,
 * with white in the slots nobody uses.
 *
 * Each run keeps the last group it was given, and it is made again only when the pictures, their
 * order or the filtering change: a game that draws the same thing every frame makes none after the
 * first. A new one never touches the old, which an earlier pass may already have recorded. Only that
 * one is kept, not every mix of pictures the game ever drew, and it is let go of after
 * `SPARE_SPRITE_FRAMES` without being drawn.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const batchBindGroup = (device: GPUDevice, sprites: TSpritePipeline, run: TSpriteRun): GPUBindGroup => {
    run.batchUnusedFor = 0;
    if (stillBound(run)) {
        return run.batchBindGroup!;
    }
    const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: run.smooth ? sprites.samplers.linear : sprites.samplers.nearest }];
    for (let i = 0; i < SPRITE_TEXTURE_SLOTS; i++) {
        entries.push({ binding: i + 1, resource: (run.textures[i] ?? sprites.whiteTexture).createView() });
    }
    run.batchBindGroup = device.createBindGroup({ label: 'sprite batch textures', layout: sprites.layouts.texture, entries });
    run.boundTextures = run.textures.slice();
    run.boundSmooth = run.smooth;
    return run.batchBindGroup;
};
