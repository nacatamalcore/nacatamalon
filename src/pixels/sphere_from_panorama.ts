import { createPixels } from './create_pixels';
import { put } from './bytes';
import type { TPixels } from './types/t_pixels';

/**
 * What `sphereFromPanorama` is asked for. Both optional.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSphereFromPanoramaOptions = {
    /**
     * How many degrees round the picture covers, side to side. Default `360`, a whole panorama (the
     * long 2:1 picture that goes all the way round). A photo covers less, `90` to `120`; what it does
     * not cover is filled with it mirrored, so the reflection has no seam.
     */
    across?: number;
    /**
     * How many pixels across the round picture is: it is square. Default `256`.
     */
    size?: number;
};

/**
 * One colour of the picture at a place between its pixels, `0` to `1` each way, blended from the
 * four around it so a small picture made from a big one is smooth.
 */
const sampleAt = (picture: TPixels, u: number, v: number, into: number[]): void => {
    const x = Math.min(Math.max(u * picture.width - 0.5, 0), picture.width - 1);
    const y = Math.min(Math.max(v * picture.height - 0.5, 0), picture.height - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, picture.width - 1);
    const y1 = Math.min(y0 + 1, picture.height - 1);
    const fx = x - x0;
    const fy = y - y0;
    for (let c = 0; c < 4; c++) {
        const a = picture.data[(y0 * picture.width + x0) * 4 + c]!;
        const b = picture.data[(y0 * picture.width + x1) * 4 + c]!;
        const d = picture.data[(y1 * picture.width + x0) * 4 + c]!;
        const e = picture.data[(y1 * picture.width + x1) * 4 + c]!;
        into[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
    }
};

/**
 * Folds a place along a line that has run past `0` to `1` back inside, as a mirror does: past the
 * right edge it comes back from the right, so the picture meets itself without a seam.
 */
const mirrored = (u: number): number => {
    const t = ((u % 2) + 2) % 2;
    return t > 1 ? 2 - t : t;
};

/**
 * Turns a panorama, or a plain photo, into the round picture a material's `reflection` reads: the
 * surroundings as a ball of chrome would show them seen from in front.
 *
 * The middle of the panorama lands in the middle of the round picture, which is what is behind the
 * camera and so what a surface facing it reflects: a ball of chrome shows the middle of the photo
 * where it faces you, and the rest round towards its rim. Up stays up, and left and right swap, as in
 * any mirror: what is on the photo's right is behind the camera on its left. A whole panorama (`across:
 * 360`) goes all the way round; a photo covers what it covers, and the rest is it mirrored. Each pixel
 * is painted by the direction it reflects, worked out as the shader reads it back.
 *
 * @param panorama The picture, a panorama or a photo, loaded (`useLoadPixels`) or painted.
 * @param options How far round it reaches, and how big the round picture is.
 * @returns The round picture, to make a texture of.
 *
 * @example
 * ```ts
 * import { createMaterial, createMesh, chrome, useSphereGeometry } from 'nacatamalon';
 * import { createPixelTexture, sphereFromPanorama, useLoadPixels } from 'nacatamalon/pixels';
 *
 * const photo = useLoadPixels({ src: '/assets/canal.png' });
 * const surroundings = createPixelTexture(photo, (pixels) => sphereFromPanorama(pixels, { across: 120 }));
 * createMesh({ geometry: useSphereGeometry(), material: createMaterial(chrome({ environment: surroundings })) });
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sphereFromPanorama = (panorama: TPixels, options: TSphereFromPanoramaOptions = {}): TPixels => {
    const size = Math.max(2, Math.floor(options.size ?? 256));
    const across = (Math.min(Math.max(options.across ?? 360, 1), 360) * Math.PI) / 180;
    // As far up and down as it reaches, by its shape: a 2:1 panorama of 360 is 180 tall.
    const tall = Math.min(Math.PI, across * (panorama.height / Math.max(panorama.width, 1)));
    const sphere = createPixels(size, size);
    const colour = [0, 0, 0, 0];

    for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
            let x = ((px + 0.5) / size) * 2 - 1;
            let y = 1 - ((py + 0.5) / size) * 2;
            const reach = Math.hypot(x, y);
            if (reach > 1) {
                x /= reach;
                y /= reach;
            }
            // The way this pixel reflects, the inverse of envUv, as studioEnvironment works it out.
            const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
            const rx = 2 * z * x;
            const ry = 2 * z * y;
            const rz = 2 * z * z - 1;
            const round = Math.atan2(rx, rz);
            const up = Math.asin(Math.max(-1, Math.min(1, ry)));

            // Round to the camera's right is the photo's left: it was taken facing the other way.
            const u = across >= Math.PI * 2 - 1e-6
                ? (((0.5 - round / across) % 1) + 1) % 1
                : mirrored(0.5 - round / across);
            const v = Math.min(Math.max(0.5 - up / tall, 0), 1);
            sampleAt(panorama, u, v, colour);
            put(sphere, px, py, Math.round(colour[0]!), Math.round(colour[1]!), Math.round(colour[2]!), 255);
        }
    }
    return sphere;
};
