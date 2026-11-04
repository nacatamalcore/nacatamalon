import type { TTexture } from '../loaders';
import { copyPoints, problemWithPoints } from './frame_points';
import type { TAtlasFramePoints, TSpriteAtlas } from './types/t_sprite_atlas';

/**
 * What `createSpriteAtlas` is asked for.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteAtlasOptions = {
    /**
     * The sheet, from `useLoadTexture`.
     */
    texture: TTexture;
    /**
     * How many frames across.
     */
    columns: number;
    /**
     * How many frames down. One for a single strip.
     */
    rows?: number;
    /**
     * Named points of its frames, by frame number, for `pointOf`: where the hand is in each one.
     * `{ 4: { hand: { x: 14, y: 10 } } }`, in the frame's pixels from its top-left corner.
     */
    points?: Readonly<Record<number, TAtlasFramePoints>>;
};

/**
 * Each frame's points, checked and copied.
 */
const readPoints = (points: Readonly<Record<number, TAtlasFramePoints>>, frames: number): Record<number, TAtlasFramePoints> => {
    if (typeof points !== 'object' || points === null) {
        throw new Error('[NacatamalOn] createSpriteAtlas: points has to be an object, by frame number: { 4: { hand: { x: 14, y: 10 } } }.');
    }
    const read: Record<number, TAtlasFramePoints> = {};
    for (const [key, named] of Object.entries(points)) {
        const frame = /^(0|[1-9]\d*)$/.test(key) ? Number(key) : -1;
        if (frame < 0 || frame >= frames) {
            throw new Error(`[NacatamalOn] createSpriteAtlas: points names frame '${key}', and this sheet has frames 0 to ${frames - 1}. Give the number of one of them.`);
        }
        const problem = problemWithPoints(named);
        if (problem !== null) {
            throw new Error(`[NacatamalOn] createSpriteAtlas: frame ${frame} ${problem}`);
        }
        read[frame] = copyPoints(named);
    }
    return read;
};

/**
 * Describes a sheet as a grid of frames, so many pictures can live in one image.
 *
 * This is what lets a whole game draw with **one texture**: sprites sharing an image are drawn
 * together, and every change of image costs the renderer a break in the batch. A sheet is also
 * how a character is animated, since its frames are the same picture at different moments.
 *
 * Nothing is loaded here and nothing is measured: a frame is a fraction of the image, so this
 * works the instant it is written, whether or not the image has arrived.
 *
 * @example
 * ```ts
 * const walk = useLoadTexture({ src: '/assets/walk.png', key: 'walk' });
 * const sheet = createSpriteAtlas({ texture: walk, columns: 6 });
 *
 * createSprite({ atlas: sheet, frame: 0, transform: { x: 80, y: 120 } });
 * ```
 *
 * @param options - The image, and how many columns and rows of frames it holds.
 * @returns The sheet, for `createSprite({ atlas, frame })`.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createSpriteAtlas = ({ texture, columns, rows = 1, points }: TSpriteAtlasOptions): TSpriteAtlas => {
    if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(rows) || rows < 1) {
        throw new Error(`[NacatamalOn] createSpriteAtlas: a grid needs whole columns and rows, got ${columns} x ${rows}.`);
    }

    const frames = columns * rows;
    return { texture, columns, rows, frames, ...(points !== undefined ? { points: readPoints(points, frames) } : {}) };
};
