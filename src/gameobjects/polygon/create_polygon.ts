import { getColor } from '../../color';
import { trackDrawableOwner } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { createRecord } from '../create_record';
import { uvsFitting } from './polygon_state';
import type { TColor } from '../../color';
import type { TTexture } from '../../loaders';
import type { TSpriteAtlas } from '../../atlas';
import type { TTransform2d } from '../types/t_transform_2d';
import type { TPolygon } from './types/t_polygon';

/**
 * What `createPolygon` is told.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPolygonOptions = {
    /**
     * The outline, at least three corners, one after the other around it, measured from `transform`.
     */
    points: Array<{ x: number; y: number }>;
    /**
     * Which point of the picture each corner holds, from `0, 0` to `1, 1`. Left out, the picture is
     * stretched over the box the outline fits in.
     */
    uvs?: Array<{ x: number; y: number }>;
    /**
     * The picture. Left out (and no `atlas`), a shape of a plain colour.
     */
    texture?: TTexture;
    /**
     * A sheet, to show one of its frames.
     */
    atlas?: TSpriteAtlas;
    /**
     * Which frame of `atlas`. `0` by default.
     */
    frame?: number;
    /**
     * Multiplies the colour of the picture; the colour itself without one. White by default.
     */
    tint?: TColor;
    transform?: Partial<TTransform2d>;
    zIndex?: number;
    visible?: boolean;
    smooth?: boolean;
    parallax?: { x: number; y: number };
    name?: string;
};

/**
 * Puts a shape in the scene whose corners the game moves: a picture stretched over an outline that
 * can change every frame. For what a rectangle cannot be: a blob that squashes as it lands, a jelly,
 * a flag, a drop.
 *
 * Each corner holds on to its point of the picture, so moving it stretches the picture under it.
 * The corners are `points`, plain numbers on what comes back: change them every frame, from a
 * physics body, a wave or anything else, and the next frame draws them. It is drawn from its middle
 * out, so it suits outlines that can be seen whole from their middle.
 *
 * Drawn in the scene's order like a sprite, through the scene's camera, in either backend.
 *
 * @example
 * ```ts
 * export const Pond: TSceneFn = () => {
 *     // A blob of twelve corners round a circle, wobbling.
 *     const corners = Array.from({ length: 12 }, (_, i) => ({ angle: (i / 12) * Math.PI * 2 }));
 *     const blob = createPolygon({
 *         points: corners.map(({ angle }) => ({ x: Math.cos(angle) * 24, y: Math.sin(angle) * 24 })),
 *         tint: getColor('#5bd75b'),
 *         transform: { x: 160, y: 90 },
 *     });
 *
 *     useUpdate((_delta, time) => {
 *         corners.forEach(({ angle }, i) => {
 *             const r = 24 + Math.sin(time * 4 + angle * 3) * 3;
 *             blob.points[i].x = Math.cos(angle) * r;
 *             blob.points[i].y = Math.sin(angle) * r;
 *         });
 *     });
 *     return createScene();
 * };
 * ```
 *
 * @param options - Its outline, picture, place and look: see {@link TPolygonOptions}.
 * @returns The shape. Change `points` to change it; `destroy(shape)` removes it.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createPolygon = (options: TPolygonOptions): TPolygon => {
    const box = getActiveBox();
    const store = getActiveGame();
    if (box === null || store === null) {
        throw new Error('[NacatamalOn] createPolygon: call it inside a scene body, or inside something created with useSpawn.');
    }
    if (options.points.length < 3) {
        throw new Error(`[NacatamalOn] createPolygon: an outline needs at least three corners, and was given ${options.points.length}.`);
    }
    if (options.uvs !== undefined && options.uvs.length !== options.points.length) {
        throw new Error(`[NacatamalOn] createPolygon: ${options.uvs.length} points of the picture for ${options.points.length} corners. Give one for each.`);
    }

    const points = options.points.map((p) => ({ x: p.x, y: p.y }));
    const polygon: TPolygon = createRecord('polygon', {
        ...(options.name === undefined ? {} : { name: options.name }),
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, ...options.transform },
        points,
        uvs: options.uvs?.map((uv) => ({ x: uv.x, y: uv.y })) ?? uvsFitting(points),
        texture: options.texture ?? options.atlas?.texture ?? null,
        ...(options.atlas === undefined ? {} : { atlas: options.atlas, frame: options.frame ?? 0 }),
        tint: options.tint ?? getColor('white'),
        ...(options.smooth === undefined ? {} : { smooth: options.smooth }),
        zIndex: options.zIndex ?? 0,
        ...(options.visible === undefined ? {} : { visible: options.visible }),
        ...(options.parallax === undefined ? {} : { parallax: options.parallax }),
        destroyed: false,
    });

    box.drawables.push(polygon);
    trackDrawableOwner(polygon, box, store);
    return polygon;
};
