import type { TSprite } from '../../gameobjects/sprite/types/t_sprite';
import type { TSpriteAnimation } from './types/t_sprite_animation';

/**
 * Which animator each sprite has, kept apart from the sprite because an animator is behaviour and a
 * sprite is a record. Weak, so a sprite that goes away takes its entry with it.
 */
const animators = new WeakMap<TSprite, TSpriteAnimation>();

/**
 * Remembers the animator `useSpriteAnimation` just made for `sprite`, so it can be found again.
 *
 * @internal
 */
export const rememberSpriteAnimation = (sprite: TSprite, animation: TSpriteAnimation): void => {
    animators.set(sprite, animation);
};

/**
 * The animator a sprite already has, or `null` when nothing animates it.
 *
 * A sprite from a scene file can arrive already moving: the file says which run it starts on, and
 * the scene started it. This is how a behaviour reaches that same animator to change the run,
 * instead of making a second one that fights the first for the same sprite every frame. If more
 * than one was made for a sprite, it is the last.
 *
 * @param sprite The sprite to ask about.
 * @returns Its animator, or `null`.
 *
 * @example
 * ```ts
 * const punch = (self: TGameObject) => {
 *     const sprite = self.drawables.find((drawable) => drawable.type === 'sprite');
 *     const anim = sprite === undefined ? null : getSpriteAnimation(sprite);
 *     const keys = useKeyboard();
 *
 *     useUpdate(() => {
 *         if (keys.justPressed('f')) anim?.play('punch');
 *     });
 * };
 * ```
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getSpriteAnimation = (sprite: TSprite): TSpriteAnimation | null => animators.get(sprite) ?? null;
