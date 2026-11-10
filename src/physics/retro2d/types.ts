import type { TPhysicsBodyHandle2d } from '../box2d/types';
import type { TPhysicsLayer } from '../layer_names';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TTilemap } from '../../gameobjects/tilemap/types/t_tilemap';
import type { TTileDoc } from '../../loaders/tilemap/types/t_tilemap_doc';

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
 * A side of a retro body.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroSide = 'up' | 'down' | 'left' | 'right';

/**
 * Which sides of a retro body touch something, pressed against it or only resting beside it: a
 * body, a solid tile, the ground, an edge of the world.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroTouching = TRetroBlocked;

/**
 * How two retro bodies met, as one of them is told it: which of its sides the other is on, and how
 * fast they were closing when they met, in pixels per second. What a landing sound, or damage from a
 * fall, is worked out from.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroContact2d = {
    side: TRetroSide;
    speed: number;
};

/**
 * A tile a retro body touches: what the file says about it, and where it is, with its layer, as
 * `setTile` takes it to take a coin out of the map.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroTileTouch2d = {
    tile: TTileDoc;
    cell: { map: TTilemap; layer: number; column: number; row: number };
};

/**
 * A part of the world, in its pixels: a rectangle from its top left corner, or a circle from its
 * middle.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroArea2d = { x: number; y: number; width: number; height: number } | { x: number; y: number; radius: number };

/**
 * Where something is to head for: a point of the world, or an object, followed wherever it goes.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroTarget = { x: number; y: number } | TGameObject;

/**
 * A retro body as the game drives it: everything a body of the full simulation offers, so code
 * written against `getPhysicsBody2d` works on it, and what the retro half adds.
 *
 * Its position is the object's: move the object and the body is there on the next step, with
 * nothing to tell. How it moves and what it is made of are its record's (`bounce`, `drag`,
 * `maxSpeed`, `gravityScale`, `mass`, `enabled`, `pushable`, `solidSides`, `bounds`, `carries`, and its
 * collider's size), read every step, so changing the record that `useRetroBody2d` returned changes
 * the body: a smaller collider while crouching, off while blinking.
 *
 * Its collider never turns. `setAngularVelocity` and the `angular` fields turn its picture, the
 * object, which a ball rolling or a coin spinning wants.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroBodyHandle2d = Omit<TPhysicsBodyHandle2d, 'onEnter' | 'onExit'> & {
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
     * Its whole speed, in pixels per second, whichever way it goes.
     */
    readonly speed: number;
    /**
     * Which sides something stopped in its last step: what it pushed against and could not move.
     */
    readonly blocked: TRetroBlocked;
    /**
     * Which sides touch something now, pressed or not, and which did a step before: `touching.down`
     * and not `wasTouching.down` is the step it landed.
     */
    readonly touching: TRetroTouching;
    readonly wasTouching: TRetroTouching;
    /**
     * How fast its picture turns, in radians per second, and what speeds it up and slows it down.
     * Its collider stays square to the screen.
     */
    angularVelocity: number;
    angularAcceleration: number;
    angularDrag: number;
    /**
     * Runs `listener` each time another body starts touching this one, with the other object and how
     * they met: the side it is on, and how fast they were closing. Set up in a scene or a piece, it
     * leaves with it.
     *
     * @returns What stops it sooner.
     */
    onEnter(listener: (other: TGameObject, contact: TRetroContact2d) => void): () => void;
    /**
     * Runs `listener` each time another body stops touching this one, or is switched off.
     *
     * @returns What stops it sooner.
     */
    onExit(listener: (other: TGameObject, contact: TRetroContact2d) => void): () => void;
    /**
     * Runs `listener` each time it starts touching a tile of a map, in any layer, solid or not: a
     * coin drawn in the map, spikes, a door. What it stands on and leans on counts.
     *
     * @returns What stops it sooner.
     */
    onTileEnter(listener: (touch: TRetroTileTouch2d) => void): () => void;
    /**
     * Runs `listener` each time it stops touching a tile.
     *
     * @returns What stops it sooner.
     */
    onTileExit(listener: (touch: TRetroTileTouch2d) => void): () => void;
    /**
     * Runs `listener` when it reaches an edge of the world it stops at (once, until it leaves it), or
     * each time it wraps round one, with the edge.
     *
     * @returns What stops it sooner.
     */
    onBounds(listener: (side: TRetroSide) => void): () => void;
    /**
     * Collides with another body only while `test` says so, asked with the other object every time
     * they would meet: through friends, not through enemies. A body given several tests needs them
     * all; the other's tests count too. While a test says no, the two do not touch at all.
     *
     * @returns What takes the test away.
     */
    collidesIf(test: (other: TGameObject) => boolean): () => void;
    /**
     * Heads for `target` at `speed` pixels per second, and stops on it: sets its velocity, so ask
     * every frame to follow something that moves. A dynamic body still falls, and is still stopped.
     *
     * @returns How far it still is.
     */
    moveTowards(target: TRetroTarget, speed: number): number;
    /**
     * Accelerates towards `target` at `rate` pixels per second squared: sets its acceleration, so it
     * overshoots and comes back, like something chasing. `maxSpeed` keeps it in hand.
     *
     * @returns How far it still is.
     */
    accelerateTowards(target: TRetroTarget, rate: number): number;
    /**
     * Sets its velocity from a direction, in radians clockwise from the right (as an object turns),
     * and a speed: a shot fired the way a turret faces.
     */
    setVelocityFromAngle(angle: number, speed: number): void;
};

/**
 * What a retro ray met: a body or a tile of a map, where, the way its surface faces there, and how
 * far along the ray.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroRayHit2d = {
    /**
     * The object whose body it met, or `null` for a tile.
     */
    object: TGameObject | null;
    /**
     * The cell of the map it met, or `null` for a body: what `setTile` takes to break a brick.
     */
    cell: { map: TTilemap; column: number; row: number } | null;
    /**
     * What the file says about that tile (`props`, `damage`…), or `undefined` for a body.
     */
    tile: TTileDoc | undefined;
    /**
     * Where the ray met it, in the world.
     */
    point: { x: number; y: number };
    /**
     * The way its surface faces there, one pixel long: up on a floor, square to the line of a slope.
     */
    normal: { x: number; y: number };
    /**
     * Pixels from where the ray started.
     */
    distance: number;
};

/**
 * How far a retro ray reaches and what it may meet.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroRayOptions2d = {
    /**
     * Pixels. As far as anything is, when left out.
     */
    maxDistance?: number;
    /**
     * The layers of the bodies it meets, by number, mask or the names the game gave them. Every
     * layer when left out. Tiles have no layer.
     */
    collidesWith?: number | readonly TPhysicsLayer[];
    /**
     * Whether it meets the maps' solid tiles, slopes and ledges (from above). `true` when left out.
     */
    tiles?: boolean;
};

/**
 * Which bodies a question about a part of the world counts.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRetroAreaOptions2d = {
    /**
     * The layers of the bodies it counts, by number, mask or name. Every layer when left out.
     */
    collidesWith?: number | readonly TPhysicsLayer[];
    /**
     * Whether sensors count. `findRetroBodies2d` counts them unless told not to (the coins near the
     * player); `isRetroAreaFree2d` never does, since nothing is stopped by one.
     */
    sensors?: boolean;
    /**
     * Whether the maps' solid tiles fill the area, for `isRetroAreaFree2d`. `true` when left out.
     */
    tiles?: boolean;
};
