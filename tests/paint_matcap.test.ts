import { describe, expect, it } from 'bun:test';
import { getPixel, paintMatcap } from '../src/pixels';

/**
 * `paintMatcap`: a ball lit by one light, seen from in front. What is pinned here is that a surface
 * facing some way reads, through `envUv`, the place on the ball that faces that way: so the side the
 * light comes from is the bright one on the model too.
 */

/**
 * Where a surface facing `n` (in the camera's axes, looked at head-on) reads the picture: its
 * reflection of the camera's look, placed as envUv places it.
 */
const readAt = (size: number, n: [number, number, number]): [number, number] => {
    const length = Math.hypot(...n);
    const [x, y, z] = [n[0] / length, n[1] / length, n[2] / length];
    // The look, straight into the screen, reflected off the surface.
    const d = -z;
    const r = [-2 * d * x, -2 * d * y, -1 - 2 * d * z];
    const m = Math.max(2 * Math.sqrt(r[0]! * r[0]! + r[1]! * r[1]! + (r[2]! + 1) * (r[2]! + 1)), 0.0001);
    const [u, v] = [r[0]! / m + 0.5, 0.5 - r[1]! / m];
    return [Math.min(size - 1, Math.floor(u * size)), Math.min(size - 1, Math.floor(v * size))];
};

const brightness = (c: { r: number; g: number; b: number }): number => (c.r + c.g + c.b) / 3;

describe('the painted matcap', () => {
    it('is square, of the size asked, and solid everywhere', () => {
        const ball = paintMatcap({ size: 32 });
        expect([ball.width, ball.height]).toEqual([32, 32]);
        for (let i = 3; i < ball.data.length; i += 4) {
            expect(ball.data[i]).toBe(255);
        }
    });

    it('is read by a surface where the ball faces the same way as it does', () => {
        const size = 64;
        const ball = paintMatcap({ size });
        // Facing the camera: the middle of the ball.
        expect(readAt(size, [0, 0, 1])).toEqual([32, 32]);
        // Facing up: the top of the ball's rim; facing left, its left rim.
        expect(readAt(size, [0, 1, 0.0001])[1]).toBeLessThan(2);
        expect(readAt(size, [-1, 0, 0.0001])[0]).toBeLessThan(2);
        expect(ball.width).toBe(size);
    });

    it('lights the side the light comes from, and darkens the other', () => {
        const size = 64;
        const ball = paintMatcap({ size, base: '#ffffff', shade: '#000000', gloss: 0 });
        const towards = getPixel(ball, ...readAt(size, [-0.5, 0.6, 0.6]));
        const away = getPixel(ball, ...readAt(size, [0.5, -0.6, 0.4]));
        expect(brightness(towards)).toBeGreaterThan(0.8);
        expect(brightness(away)).toBeLessThan(0.3);

        const fromRight = paintMatcap({ size, base: '#ffffff', shade: '#000000', gloss: 0, from: { x: 1, y: 0 } });
        expect(brightness(getPixel(fromRight, ...readAt(size, [1, 0, 0.3])))).toBeGreaterThan(brightness(getPixel(fromRight, ...readAt(size, [-1, 0, 0.3]))));
    });

    it('puts a highlight in the shine colour when glossy, and none when matte', () => {
        const size = 64;
        const plain = { size, base: '#404040', shade: '#404040', shine: '#ffffff' };
        const brightest = (gloss: number): number => {
            const ball = paintMatcap({ ...plain, gloss });
            let most = 0;
            for (let i = 0; i < ball.data.length; i += 4) most = Math.max(most, ball.data[i]!);
            return most;
        };
        expect(brightest(0)).toBeLessThan(80);
        expect(brightest(1)).toBeGreaterThan(200);
    });

    it('darkens the shade from the base when it is not given', () => {
        const ball = paintMatcap({ size: 64, base: '#ff0000', gloss: 0 });
        const dark = getPixel(ball, ...readAt(64, [0.6, -0.6, 0.3]));
        expect(dark.r).toBeLessThan(0.45);
        expect(dark.g).toBeLessThan(0.05);
    });
});
