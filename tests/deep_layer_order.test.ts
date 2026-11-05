import { describe, expect, it } from 'bun:test';
import { deepLayerOrder } from '../src/render/shared/deep_layer_order';
import type { TDrawItem } from '../src/render/interface';
import type { TDrawStencil } from '../src/render/interface/draw/t_draw_stencil';

/**
 * Where the halo of a filter laid with depth is laid in a pass: after the run of solid models
 * straight after it, so it is laid over the models it is tested against, and no further.
 */

const mesh = (alpha = 1): TDrawItem => ({ type: 'mesh', material: { alpha, tint: { r: 1, g: 1, b: 1, a: 1 } } } as unknown as TDrawItem);
const layer = (depth: boolean): TDrawItem => ({ type: 'filter-layer', picture: {}, x: 0, y: 0, width: 1, height: 1, ...(depth ? { depth: true } : {}) } as unknown as TDrawItem);
const sprite = { type: 'sprite' } as unknown as TDrawItem;
const flat = new Set<unknown>();
const order = (drawables: TDrawItem[], stencil: TDrawStencil[]) => deepLayerOrder(drawables, stencil, (layer) => !flat.has(layer));
const plain = (count: number): TDrawStencil[] => Array.from({ length: count }, () => ({ ref: 0, write: 'none', channel: 'alpha', scissor: null }) as TDrawStencil);

describe('deepLayerOrder', () => {
    it('moves the halo of a layer with depth past the solid models straight after it', () => {
        const drawables = [mesh(), layer(true), mesh(), mesh(), sprite];
        expect(order(drawables, plain(drawables.length))).toEqual([0, 3, 2, 3, 4]);
    });

    it('does not move it past a sprite, a see-through model or anything else that is not solid', () => {
        expect(order([layer(true), sprite, mesh()], plain(3))).toBeNull();
        expect(order([layer(true), mesh(0.5)], plain(2))).toBeNull();
        expect(order([layer(true), mesh(), mesh(0.5), mesh()], plain(4))).toEqual([1, 1, 2, 3]);
        expect(order([layer(true), mesh(), layer(false), mesh()], plain(4))).toEqual([1, 1, 2, 3]);
    });

    it('moves nothing when nothing solid comes after it, or when it has no depth', () => {
        expect(order([mesh(), layer(true), sprite], plain(3))).toBeNull();
        expect(order([layer(false), mesh()], plain(2))).toBeNull();
    });

    it('does not move it past anything that writes a mask', () => {
        const stencil = plain(3);
        stencil[2] = { ...stencil[2]!, write: 'add' };
        expect(order([layer(true), mesh(), mesh()], stencil)).toEqual([1, 1, 2]);
        stencil[1] = { ...stencil[1]!, write: 'add' };
        expect(order([layer(true), mesh(), mesh()], stencil)).toBeNull();
    });

    it('keeps two layers in their order when both wait for the same model', () => {
        expect(order([layer(true), layer(true), mesh()], plain(3))).toEqual([2, 2, 2]);
    });

    it('moves only a layer whose depth was kept, and goes on only through one', () => {
        const notKept = layer(true);
        flat.add(notKept);
        expect(order([layer(true), notKept, mesh()], plain(3))).toBeNull();
        expect(order([notKept, mesh()], plain(2))).toBeNull();
        flat.clear();
    });
});
