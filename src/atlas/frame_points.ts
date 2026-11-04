import type { TAtlasFramePoints } from './types/t_sprite_atlas';

/**
 * What is wrong with one frame's named points, or `null` when nothing is. Said in words both a file's
 * reader and `createSpriteAtlas` can put after what they are reading.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const problemWithPoints = (points: unknown): string | null => {
    if (typeof points !== 'object' || points === null || Array.isArray(points)) {
        return 'has to give its points as an object, by name: { hand: { x: 14, y: 10 } }.';
    }
    for (const [name, point] of Object.entries(points)) {
        const { x, y } = (typeof point === 'object' && point !== null ? point : {}) as { x?: unknown; y?: unknown };
        if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
            return `has a point "${name}" that is not { x, y } in numbers, the frame's pixels from its top-left corner.`;
        }
    }
    return null;
};

/**
 * One frame's points, copied, so what a game does to what it wrote does not reach the sheet, and a
 * name like `__proto__` stays a name.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const copyPoints = (points: TAtlasFramePoints): TAtlasFramePoints =>
    Object.fromEntries(Object.entries(points).map(([name, { x, y }]) => [name, { x, y }]));
