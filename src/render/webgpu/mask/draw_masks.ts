// everyframe
import type { TDrawMaskLayer } from '../../interface/draw/t_draw_mask_layer';
import type { TDrawStencil } from '../../interface/draw/t_draw_stencil';
import type { TSpritePipeline } from '../sprite/types/t_sprite_pipeline';
import type { TSpriteRun } from '../sprite/types/t_sprite_run';
import type { TMaskPipelines } from './mask_pipelines';

/**
 * Puts the pass in an entry's state: the stencil's reference and the box it is kept inside, set only
 * when they change from the entry before. Both outlive a change of pipeline, so a run of entries in
 * one state sets them once.
 *
 * @param previous The state the pass is in, `null` at its start: reference 0 and all of it.
 * @param ratio How many of the target's pixels each of the pass's own is.
 * @returns The state the pass is in now.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const applyStencil = (
    gpuPass: GPURenderPassEncoder,
    next: TDrawStencil,
    previous: TDrawStencil | null,
    ratio: number,
    width: number,
    height: number,
): TDrawStencil => {
    if (next === previous) {
        return next;
    }
    if (next.ref !== (previous?.ref ?? 0)) {
        gpuPass.setStencilReference(next.ref);
    }
    const box = next.scissor;
    const before = previous?.scissor ?? null;
    if (box !== before) {
        if (box === null) {
            gpuPass.setScissorRect(0, 0, width, height);
        } else {
            // In the target's pixels, and inside it: the card refuses a box that reaches out of it.
            const left = Math.min(width, Math.max(0, Math.round(box.x * ratio)));
            const top = Math.min(height, Math.max(0, Math.round(box.y * ratio)));
            const right = Math.min(width, Math.max(left, Math.round((box.x + box.width) * ratio)));
            const bottom = Math.min(height, Math.max(top, Math.round((box.y + box.height) * ratio)));
            gpuPass.setScissorRect(left, top, right - left, bottom - top);
        }
    }
    return next;
};

/**
 * Writes a run of sprites into the stencil as a mask's shape: their pictures where they are at
 * least half there, and nothing of their colour.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawMaskRun = (gpuPass: GPURenderPassEncoder, sprites: TSpritePipeline, masks: TMaskPipelines, run: TSpriteRun): void => {
    const stencil = run.stencil!;
    const write = stencil.write as Exclude<TDrawStencil['write'], 'none'>;
    gpuPass.setPipeline(masks.sprite(run.distanceField ? 'field' : stencil.channel, write));
    gpuPass.setBindGroup(0, sprites.bindGroup);
    gpuPass.setBindGroup(1, run.bindGroup);
    gpuPass.setVertexBuffer(0, sprites.quad);
    gpuPass.setVertexBuffer(1, sprites.instances);
    gpuPass.draw(4, run.count, 0, run.start);
};

/**
 * Lays a soft mask's picture over the pass, as much as its shape lets through.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawMaskLayer = (gpuPass: GPURenderPassEncoder, masks: TMaskPipelines, layer: TDrawMaskLayer): void => {
    gpuPass.setPipeline(masks.layer(layer.channel, layer.invert));
    gpuPass.setBindGroup(0, masks.layerBindGroup(layer.content, layer.shape));
    gpuPass.draw(3);
};
