import { getActiveBox } from '../../store';
import type { THitbox } from '../../hitbox/types/t_hitbox';

/**
 * How a hitbox starts. Only `group` is needed: the rest begins as the picture.
 *
 * @category Hitboxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type THitboxOptions = {
    group: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    enabled?: boolean;
};

/**
 * Gives this object a part that can be touched, on one side: what `useOverlap` and `overlaps`
 * compare.
 *
 * **Apart from the picture, because that is how these games were made.** The hero's hitbox is
 * smaller than his sprite, so a bullet that grazes his hair misses; a sword only hurts on the frames
 * of the swing. Left without a size it is the size of the picture, frame after frame, and it is
 * changed whenever the game likes: written to, it takes effect on the next comparison.
 *
 * It is measured like the picture, in the object's own pixels, from the picture's centre: it turns,
 * grows and moves with the object. An object can have several, each in its own group: a body that is
 * hurt and a sword that hurts.
 *
 * @param options Its group, and optionally where it is and how big.
 * @returns The hitbox, to change: `x`, `y`, `width`, `height` (`undefined` to follow the picture
 *   again) and `enabled`.
 *
 * @example
 * ```ts
 * const Hero = () => {
 *     const keys = useKeyboard();
 *     createSprite({ key: 'hero', transform: { x: 40, y: 160 } });
 *     const body = useHitbox({ group: 'player', width: 10 });
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
export const useHitbox = (options: THitboxOptions): THitbox => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useHitbox: call it inside a scene body, or inside something created with useSpawn.');
    }
    const hitbox: THitbox = {
        group: options.group,
        x: options.x ?? 0,
        y: options.y ?? 0,
        width: options.width,
        height: options.height,
        enabled: options.enabled ?? true,
    };
    box.hitboxes.push(hitbox);
    return hitbox;
};
