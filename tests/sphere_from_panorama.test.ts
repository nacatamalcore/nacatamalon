import { describe, expect, it } from 'bun:test';
import { createPixels, fillRect, getPixel, sphereFromPanorama } from '../src/pixels';

/**
 * `sphereFromPanorama`: a panorama or a photo made into the round picture a `reflection` reads. The
 * middle of the photo lands where a surface facing the camera reflects, and up stays up.
 */

// A photo in three bands, sky above, a red middle and a floor below, with a green spot in the middle.
const photo = () => {
    const pixels = createPixels(160, 90, '#202020');
    fillRect(pixels, 0, 0, 160, 30, '#ffffff');
    fillRect(pixels, 0, 30, 160, 30, '#ff0000');
    fillRect(pixels, 70, 40, 20, 10, '#00ff00');
    return pixels;
};

describe('the round picture', () => {
    it('is square and of the size asked', () => {
        const sphere = sphereFromPanorama(photo(), { size: 64 });
        expect([sphere.width, sphere.height]).toEqual([64, 64]);
    });

    it('puts the middle of the photo in its middle, the sky above it and the floor below', () => {
        const sphere = sphereFromPanorama(photo(), { size: 64, across: 120 });
        const middle = getPixel(sphere, 32, 32);
        expect(middle.g).toBeGreaterThan(0.8);
        expect(middle.r).toBeLessThan(0.2);
        // A little above the middle reflects a little up: the sky's band.
        expect(getPixel(sphere, 32, 20).b).toBeGreaterThan(0.8);
        // A little below, the floor's.
        expect(getPixel(sphere, 32, 46).r).toBeLessThan(0.2);
    });

    it('shows the photo\'s right on its left, as a mirror does', () => {
        const pixels = createPixels(160, 90, '#000000');
        fillRect(pixels, 100, 0, 60, 90, '#ffffff');
        const sphere = sphereFromPanorama(pixels, { size: 64, across: 120 });
        expect(getPixel(sphere, 16, 32).r).toBeGreaterThan(0.8);
        expect(getPixel(sphere, 48, 32).r).toBeLessThan(0.2);
    });

    it('fills what a photo does not reach with it mirrored, never with nothing', () => {
        const sphere = sphereFromPanorama(photo(), { size: 64, across: 90 });
        for (let i = 3; i < sphere.data.length; i += 4) {
            expect(sphere.data[i]).toBe(255);
        }
    });
});
