import { drawnRect, hitboxRect, pictureOf, pictureRect, rectsOverlap } from './hitbox_shape';
import type { TTurnedRect } from './hitbox_shape';
import type { TBox } from '../box/types/t_box';
import type { TSprite } from '../gameobjects/sprite/types/t_sprite';
import type { TText } from '../gameobjects/text/types/t_text';
import type { TNineSlice } from '../gameobjects/nine_slice/types/t_nine_slice';

/**
 * A rectangle in the world, unturned: its top-left corner and its size.
 *
 * @category Hitboxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRect = { x: number; y: number; width: number; height: number };

/**
 * Anything `overlaps` can compare: an object, something it draws, or a rectangle of the world.
 *
 * @category Hitboxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TOverlapTarget = TBox | TSprite | TText | TNineSlice | TRect;

/**
 * The rectangles a target is touched by. An object with hitboxes is touched by those that are on,
 * and by nothing when all are off; one without is touched by its picture.
 */
const rectsOf = (target: TOverlapTarget): TTurnedRect[] => {
    if ('children' in target) {
        if (target.hitboxes.length > 0) {
            return target.hitboxes.filter((hitbox) => hitbox.enabled).map((hitbox) => hitboxRect(target, hitbox));
        }
        const picture = pictureOf(target);
        return picture === null ? [] : [pictureRect(picture, target)];
    }
    if ('type' in target) {
        return [drawnRect(target)];
    }
    return [{ cx: target.x + target.width / 2, cy: target.y + target.height / 2, hx: Math.abs(target.width) / 2, hy: Math.abs(target.height) / 2, rotation: 0 }];
};

/**
 * Whether two things touch right now: a bullet and a brick, the player and a door, a sword and
 * whatever is in front of it. With no physics: just whether their rectangles share any area.
 *
 * Each side can be an object, a sprite, a text, a panel, or a rectangle of the world
 * (`{ x, y, width, height }`, from its top-left corner). An object is measured by its hitboxes
 * (`useHitbox`) when it has any, and by what it draws when it has none. Everything is measured
 * where it is drawn: turned, grown and moved with everything above it. Edges that only meet do not
 * count, so two tiles side by side are not touching.
 *
 * For many things against many, every frame, `useOverlap` with groups says it once.
 *
 * @param a One thing.
 * @param b The other.
 * @returns Whether they share any area.
 *
 * @example
 * ```ts
 * declare const bullet: TSprite;
 * declare const brick: TSprite;
 *
 * useUpdate(() => {
 *     if (overlaps(bullet, brick)) {
 *         bullet.visible = false;
 *     }
 * });
 * ```
 *
 * @category Hitboxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const overlaps = (a: TOverlapTarget, b: TOverlapTarget): boolean => {
    const first = rectsOf(a);
    if (first.length === 0) {
        return false;
    }
    const second = rectsOf(b);
    return first.some((one) => second.some((other) => rectsOverlap(one, other)));
};
