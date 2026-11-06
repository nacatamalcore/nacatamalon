import { SPRITE_TEXTURE_SLOTS } from '../../shared/sprite_batch';
import type { TSpritePipeline } from './types/t_sprite_pipeline';

/**
 * Group 1 for a run of one picture: the sampler `smooth` asks for, and `texture` in all eight of a
 * batch's slots, so the batch shader reads it whatever slot it is told. Made the first time that
 * pairing is drawn and reused after.
 *
 * Two entries per texture at most, because the sampler is bound inside the group: the same image
 * drawn crisp in one sprite and smooth in another is two groups, not one. Kept in a `WeakMap` so a
 * texture nobody uses any more does not keep them alive.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getTextureBindGroup = (
    device: GPUDevice,
    sprites: TSpritePipeline,
    texture: GPUTexture,
    smooth: boolean,
): GPUBindGroup => {
    const filter = smooth ? 'linear' : 'nearest';
    let cached = sprites.textureBindGroups.get(texture);

    if (cached === undefined) {
        cached = {};
        sprites.textureBindGroups.set(texture, cached);
    }

    const existing = cached[filter];
    if (existing !== undefined) {
        return existing;
    }

    const view = texture.createView();
    const bindGroup = device.createBindGroup({
        label: `sprite texture bind group (${filter})`,
        layout: sprites.layouts.texture,
        entries: [
            { binding: 0, resource: sprites.samplers[filter] },
            ...Array.from({ length: SPRITE_TEXTURE_SLOTS }, (_, i) => ({ binding: i + 1, resource: view })),
        ],
    });
    cached[filter] = bindGroup;
    return bindGroup;
};
