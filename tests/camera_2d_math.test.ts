import { describe, expect, it } from 'bun:test';
import { applyView2d, unapplyView2d } from '../src/render/shared/apply_view_2d';

/**
 * A camera as the renderer reads it.
 */
const camera = (x: number, y: number, rotation = 0, zoom = 1) => ({ transform: { x, y, rotation }, zoom });

describe('applyView2d', () => {
    it('leaves a point alone with no camera: that is screen space', () => {
        expect(applyView2d(null, { x: 37, y: 12 })).toEqual({ x: 37, y: 12 });
    });

    it('is the same as no camera at the origin, not turned, with no zoom', () => {
        expect(applyView2d(camera(0, 0), { x: 37, y: 12 })).toEqual({ x: 37, y: 12 });
    });

    it('puts the camera position on the top-left corner of the screen', () => {
        expect(applyView2d(camera(100, 50), { x: 100, y: 50 })).toEqual({ x: 0, y: 0 });
        expect(applyView2d(camera(100, 50), { x: 340, y: 210 })).toEqual({ x: 240, y: 160 });
    });

    it('magnifies with zoom 2: distances on screen double', () => {
        const near = applyView2d(camera(0, 0, 0, 2), { x: 10, y: 0 });
        const far = applyView2d(camera(0, 0, 0, 2), { x: 30, y: 0 });

        expect(far.x - near.x).toBe(40);
    });

    it('turns the world against the camera', () => {
        const turned = applyView2d(camera(0, 0, Math.PI / 2), { x: 1, y: 0 });

        expect(turned.x).toBeCloseTo(0, 10);
        expect(turned.y).toBeCloseTo(-1, 10);
    });

    it('moves first, then turns, then magnifies', () => {
        // The camera sits on (100, 100) turned a quarter and zoomed twice: a point 10 to its right
        // ends 20 above the corner, not somewhere the other orders would put it.
        const point = applyView2d(camera(100, 100, Math.PI / 2, 2), { x: 110, y: 100 });

        expect(point.x).toBeCloseTo(0, 10);
        expect(point.y).toBeCloseTo(-20, 10);
    });

    it('is undone exactly by unapplyView2d, with position, turn and zoom together', () => {
        const view = camera(123, -45, 0.7, 2.5);
        const back = unapplyView2d(view, applyView2d(view, { x: 310, y: 77 }));

        expect(back.x).toBeCloseTo(310, 9);
        expect(back.y).toBeCloseTo(77, 9);
        expect(unapplyView2d(null, { x: 5, y: 6 })).toEqual({ x: 5, y: 6 });
    });
});
