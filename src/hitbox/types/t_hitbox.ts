import type { TTag, TTaggable } from '../../tags/tags';
import type { TGameObject } from '../../hooks/spawn/use_spawn';

/**
 * The part of an object that can be touched. Made by `useHitbox`, and changed whenever the game
 * likes: smaller while crouching, off while blinking after a hit. What the object is (`'enemy'`) is
 * its tag, not the hitbox's: see `useTag`.
 *
 * Measured like the object's picture, in its own pixels: it turns, grows and moves with it.
 *
 * @category Hitboxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type THitbox = {
    /**
     * How far its centre is moved from the centre of the picture, in the object's own pixels.
     * `0, 0` by default.
     */
    x: number;
    y: number;
    /**
     * Its size, in the object's own pixels. `undefined` takes the picture's, frame after frame, so it
     * follows an animation whose frames change size; a number fixes it.
     */
    width: number | undefined;
    height: number | undefined;
    /**
     * Off, nothing touches it: a character blinking after a hit, a sword between swings. `true` by
     * default.
     */
    enabled: boolean;
};

/**
 * When `useCollisionWith` calls: on the first frame two things touch, every frame they do, or on the
 * first they no longer do.
 *
 * @category Hitboxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCollisionWhen = 'start' | 'touching' | 'end';

/**
 * What a collision is asked by: a tag (what `useTag` gives, or its name), which meets everything
 * carrying it, or a component, which meets the pieces `useSpawn` made from it.
 *
 * @category Hitboxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCollisionMatch = string | TTag | ((...args: never[]) => unknown);

/**
 * What a collision asked by `M` is called with: a piece of that component, its `api` typed, for a
 * component; a piece, or a sprite, text or panel tagged on its own, for a tag.
 *
 * @category Hitboxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCollisionMatched<M> = M extends (...args: never[]) => infer R ? TGameObject<R> : TTaggable;

/**
 * A collision's match as it is kept: a tag's name, or the component itself.
 *
 * @internal
 */
export type TCollisionKey = string | Function;

/**
 * One `useCollisionBetween` (two matches) or one `useCollisionWith` (the box it is on against a
 * match, with what it touched last frame), and what it calls.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCollisionListener =
    | { kind: 'between'; a: TCollisionKey; b: TCollisionKey; callback: (a: TTaggable, b: TTaggable) => void }
    | { kind: 'with'; match: TCollisionKey; when: TCollisionWhen; callback: (other: TTaggable) => void; touching: Set<TTaggable> };
