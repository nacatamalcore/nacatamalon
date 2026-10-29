import type { TDrawCamera2d } from '../interface';

/**
 * The part of the world a camera shows, as a rectangle lined up with the world: a flat drawable
 * wholly outside it is not drawn there, and a map layer draws only the cells inside it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSight = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * What a camera shows of the world when it draws into something `width` by `height` game pixels: the
 * rectangle around where the four corners of that land, one pixel bigger all round. A turned camera
 * shows a turned rectangle, and the one around it is a little more than it shows, which only keeps
 * a few things that will not be seen. `null` is a camera of screen pixels, which shows the screen.
 * The same arithmetic as `unapplyView2d`, which the pointer reads the world with.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sightOf = (camera: TDrawCamera2d | null, width: number, height: number): TSight => {
    if (camera === null) {
        return { minX: -1, minY: -1, maxX: width + 1, maxY: height + 1 };
    }
    // `unapplyView2d` worked out once for all four corners: shrink by the zoom, turn with the camera,
    // add its place.
    const c = Math.cos(camera.transform.rotation) / camera.zoom;
    const s = Math.sin(camera.transform.rotation) / camera.zoom;
    const sight: TSight = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (let k = 0; k < 4; k++) {
        const x = k & 1 ? width + 1 : -1;
        const y = k & 2 ? height + 1 : -1;
        const wx = x * c - y * s + camera.transform.x;
        const wy = x * s + y * c + camera.transform.y;
        sight.minX = Math.min(sight.minX, wx);
        sight.minY = Math.min(sight.minY, wy);
        sight.maxX = Math.max(sight.maxX, wx);
        sight.maxY = Math.max(sight.maxY, wy);
    }
    return sight;
};
