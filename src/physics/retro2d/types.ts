import type { TPhysicsBodyHandle2d } from '../box2d/types';

/**
 * Which sides of a retro body something stopped in its last step: a wall on the left, the ground
 * under it. Pushing a crate that gives way is not being stopped; pushing one against a wall is.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroBlocked = {
    readonly left: boolean;
    readonly right: boolean;
    readonly up: boolean;
    readonly down: boolean;
};

/**
 * A retro body as the game drives it: everything a body of the full simulation offers, so code
 * written against `getPhysicsBody2d` works on it, and what the retro half adds, its speed to read and
 * write, its acceleration, and what stopped it.
 *
 * Of the full body's calls, `setAngularVelocity` does nothing here: a retro body never turns.
 *
 * Its position is the object's: move the object and the body is there on the next step, with
 * nothing to tell. How it moves and what it is made of are its record's (`bounce`, `drag`,
 * `maxSpeed`, `gravityScale`, `mass`), read every step, so changing the record that
 * `useRetroBody2d` returned changes the body.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroBodyHandle2d = TPhysicsBodyHandle2d & {
    /**
     * Pixels per second, read and written by the game: `x` walks, a negative `y` jumps. Gravity,
     * pushes and what it hits change it between steps.
     */
    velocity: { x: number; y: number };
    /**
     * Pixels per second squared added to its speed every step until the game changes it: an engine
     * that keeps pushing. While an axis has none, `drag` slows that axis.
     */
    acceleration: { x: number; y: number };
    /**
     * Which sides something stopped in its last step.
     */
    readonly blocked: TRetroBlocked;
};
