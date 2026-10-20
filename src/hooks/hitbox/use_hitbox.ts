import { getActiveBox } from '../../store';
import type { THitbox } from '../../hitbox/types/t_hitbox';

/**
 * How a hitbox starts. All of it is optional: it begins as the picture.
 *
 * @category Hitboxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type THitboxOptions = {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    enabled?: boolean;
};

/**
 * Gives this object a part that can be touched: what `useCollisionWith`, `useCollisionBetween` and
 * `collisionBetween` measure it by instead of its picture. What it is (`'enemy'`) is its tag
 * (`useTag`), not the hitbox's.
 *
 * **Apart from the picture, because that is how these games were made.** The hero's hitbox is
 * smaller than his sprite, so a bullet that grazes his hair misses; a sword only hurts on the frames
 * of the swing. Left without a size it is the size of the picture, frame after frame, and it is
 * changed whenever the game likes: written to, it takes effect on the next comparison.
 *
 * It is measured like the picture, in the object's own pixels, from the picture's centre: it turns,
 * grows and moves with the object. A sword that hurts beside a body that is hurt is a piece of its
 * own, with its own tag.
 *
 * @param options Where it is and how big, and whether it is on.
 * @returns The hitbox, to change: `x`, `y`, `width`, `height` (`undefined` to follow the picture
 *   again) and `enabled`.
 *
 * @example
 * ```ts
 * const Hero = () => {
 *     const keys = useKeyboard();
 *     createSprite({ key: 'hero', transform: { x: 40, y: 160 } });
 *     useTag('player').add(useSelf());
 *     const body = useHitbox({ width: 10 });
 *
 *     useUpdate(() => {
 *         // A hero 24 pixels tall, crouching: 12 tall, and 6 lower so the feet stay where they were.
 *         const crouching = keys.isDown('ArrowDown');
 *         body.height = crouching ? 12 : undefined;
 *         body.y = crouching ? 6 : 0;
 *     });
 * };
 * ```
 *
 * @category Hitboxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useHitbox = (options: THitboxOptions = {}): THitbox => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useHitbox: call it inside a scene body, or inside something created with useSpawn.');
    }
    const hitbox: THitbox = {
        x: options.x ?? 0,
        y: options.y ?? 0,
        width: options.width,
        height: options.height,
        enabled: options.enabled ?? true,
    };
    box.hitboxes.push(hitbox);
    return hitbox;
};
