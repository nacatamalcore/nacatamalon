import type { TBox } from '../../box/types/t_box';

/**
 * The part of an object that can be touched, and which side it is on. Made by `useHitbox`, and
 * changed whenever the game likes: smaller while crouching, off while blinking after a hit.
 *
 * Measured like the object's picture, in its own pixels: it turns, grows and moves with it.
 *
 * @category Hitboxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type THitbox = {
    /**
     * Which side it is on: `'player'`, `'enemy'`, `'playerShot'`, `'coin'`. `useOverlap` names two.
     */
    group: string;
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
 * One `useOverlap`: the two groups it watches, and what it calls.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TOverlapListener = {
    a: string;
    b: string;
    callback: (a: TBox, b: TBox) => void;
};
