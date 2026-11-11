import { describe, expect, it } from 'bun:test';
import { getPixel, studioEnvironment } from '../src/pixels';

/**
 * `studioEnvironment`: a photographer's studio painted as the round picture a material's
 * `reflection` reads. Each pixel is painted by the direction it reflects, so what is pinned here is
 * that a direction lands where `envUv` will read it: straight up in the sky, straight down on the
 * floor, behind the camera at the horizon, and the softboxes behind the camera, not behind the model.
 */

/**
 * Where a reflected direction (in the camera's axes) lands on the picture, as envUv works it out.
 */
const envUv = (x: number, y: number, z: number): [number, number] => {
    const m = Math.max(2 * Math.sqrt(x * x + y * y + (z + 1) * (z + 1)), 0.0001);
    return [x / m + 0.5, 0.5 - y / m];
};

const at = (size: number, [u, v]: [number, number]): [number, number] =>
    [Math.min(size - 1, Math.floor(u * size)), Math.min(size - 1, Math.floor(v * size))];

const brightness = (c: { r: number; g: number; b: number }): number => (c.r + c.g + c.b) / 3;

describe('the picture', () => {
    it('is square, of the size asked, and solid everywhere', () => {
        const studio = studioEnvironment({ size: 32 });
        expect(studio.width).toBe(32);
        expect(studio.height).toBe(32);
        for (let i = 3; i < studio.data.length; i += 4) {
            expect(studio.data[i]).toBe(255);
        }
    });

    it('puts the sky where up reflects, the floor where down does, and the horizon behind the camera', () => {
        const size = 64;
        const studio = studioEnvironment({ size, panels: 0, top: '#ffffff', horizon: '#808080', ground: '#000000' });
        const up = getPixel(studio, ...at(size, envUv(0, 1, 0)));
        const down = getPixel(studio, ...at(size, envUv(0, -1, 0)));
        const behindCamera = getPixel(studio, ...at(size, envUv(0, 0, 1)));

        expect(brightness(up)).toBeGreaterThan(0.95);
        expect(brightness(down)).toBeLessThan(0.05);
        // The horizon, which the floor starts darkening from right below: the middle pixel of an even
        // picture sits half a pixel under it, so between the floor and the sky rather than exactly grey.
        expect(brightness(behindCamera)).toBeGreaterThan(0.3);
        expect(brightness(behindCamera)).toBeLessThan(0.6);
    });

    it('lights its softboxes behind the camera, where a photographer stands them, and none when asked for none', () => {
        const size = 64;
        const plain = { size, top: '#202020', horizon: '#202020', ground: '#202020', panelColor: '#ffffff' };
        const without = studioEnvironment({ ...plain, panels: 0 });
        const withTwo = studioEnvironment({ ...plain, panels: 2 });

        const white = (pixels: ReturnType<typeof studioEnvironment>): number => {
            let count = 0;
            for (let i = 0; i < pixels.data.length; i += 4) {
                if (pixels.data[i]! > 200) count++;
            }
            return count;
        };
        expect(white(without)).toBe(0);
        expect(white(withTwo)).toBeGreaterThan(20);

        // The first one, up to the right and in front of the model.
        const across = 0.62;
        const up = 0.42;
        const direction: [number, number, number] = [Math.sin(across) * Math.cos(up), Math.sin(up), Math.cos(across) * Math.cos(up)];
        expect(brightness(getPixel(withTwo, ...at(size, envUv(...direction))))).toBeGreaterThan(0.9);
    });
});
