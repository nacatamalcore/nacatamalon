import { unapplyView2d } from './apply_view_2d';
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
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sightOf = (camera: TDrawCamera2d | null, width: number, height: number): TSight => {
    const sight: TSight = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const [x, y] of [[-1, -1], [width + 1, -1], [-1, height + 1], [width + 1, height + 1]]) {
        const world = unapplyView2d(camera, { x, y });
        sight.minX = Math.min(sight.minX, world.x);
        sight.minY = Math.min(sight.minY, world.y);
        sight.maxX = Math.max(sight.maxX, world.x);
        sight.maxY = Math.max(sight.maxY, world.y);
    }
    return sight;
};
