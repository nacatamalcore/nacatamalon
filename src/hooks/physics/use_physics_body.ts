import { getActiveBox } from '../../store';
import { isShowingOnly } from './is_showing_only';
import { placement3dOf, placementOf } from '../../box';
import { getPhysicsProviders, createPhysicsBody2d, createPhysicsBody3d, warnMissingPhysicsProvider } from '../../physics';
import type {
    TCollider2d, TCollider3d, TPhysicsBody2d, TPhysicsBody3d, TPhysicsBodyType, TPhysicsSurface,
} from '../../physics';

/**
 * What a flat body is made from: how it moves, its shape, and how it feels to touch. `id` and
 * `name` are only for keeping the identity a scene document gave it.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsBody2dOptions = {
    id?: string;
    name?: string;
    body: TPhysicsBodyType;
    collider: TCollider2d;
} & Partial<TPhysicsSurface>;

/**
 * The same for a body in space.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsBody3dOptions = {
    id?: string;
    name?: string;
    body: TPhysicsBodyType;
    collider: TCollider3d;
    offset?: [number, number, number];
} & Partial<TPhysicsSurface>;

/**
 * Gives this object a flat shape to collide with.
 *
 * **It does two things, and that is the whole design.** It writes down what the object is made of,
 * so a scene saved from code says it and comes back with it; and it hands that to whatever is
 * installed to simulate, so it moves. One way in, whether the scene was typed by a person or opened
 * from a file, which is what makes those two behave the same.
 *
 * Where it is comes from the object, never from here: the object's own placement if it has one, and
 * otherwise the placement of what it draws, which is where you put it with `createSprite`.
 *
 * With nothing installed to simulate, this is still worth calling: the shape is recorded, the scene
 * opens and saves without losing it, and it sits still. That is what a tool wants while somebody is
 * building a level.
 *
 * @example
 * ```ts
 * const BROWN = getColor('#8b5a2b');
 *
 * const Crate = (x: number, y: number) => {
 *     createSprite({ tint: BROWN, width: 24, height: 24, transform: { x, y } });
 *     usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 24, height: 24 }, restitution: 0.2 });
 * };
 * ```
 *
 * @param options - Its kind (`'dynamic'`, `'static'` or `'kinematic'`), its shape, and what it is
 *   made of.
 * @returns The body as the scene keeps it. It moves once a physics adapter is installed.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const usePhysicsBody2d = (options: TPhysicsBody2dOptions): TPhysicsBody2d => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] usePhysicsBody2d: call it inside a scene body.');
    }

    const record = createPhysicsBody2d({ name: box.name, ...options });
    // Written on the object before anything can decline to simulate it, so a scene with no adapter
    // still saves every collider it declares.
    box.physics = record;

    // Nowhere to be is nowhere to write a simulated position back to, so it is recorded and left
    // alone rather than simulated into a place nobody can see. Said out loud, because the shape is
    // there in the file and nothing would be moving.
    if (placementOf(box) === null) {
        console.warn(`[NacatamalOn] usePhysicsBody2d: '${box.name}' is not anywhere, so its collider was written down and not simulated. Place it with useTransform, or give it something to draw.`);
        return record;
    }

    // Shown, not played: written down and not simulated.
    if (isShowingOnly()) {
        return record;
    }
    const installed = getPhysicsProviders();
    if (installed.length === 0) {
        warnMissingPhysicsProvider();
        return record;
    }
    // Every one of them, because each answers for its own dimension and ignores the rest: a game
    // with a flat world and a solid one installs both.
    for (const provider of installed) {
        provider.createBody(box, record);
    }
    return record;
};

/**
 * Gives this object a shape in three dimensions to collide with. The sibling of
 * {@link usePhysicsBody2d}; see it for why declaring and simulating are one call.
 *
 * `offset` is where the shape sits inside the object, which is what a model imported standing on
 * its own feet needs so that its collider is not buried half in the floor.
 *
 * @param options - Its kind (`'dynamic'`, `'static'` or `'kinematic'`), its shape, and what it is
 *   made of.
 * @returns The body as the scene keeps it. It moves once a physics adapter is installed.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const usePhysicsBody3d = (options: TPhysicsBody3dOptions): TPhysicsBody3d => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] usePhysicsBody3d: call it inside a scene body.');
    }

    const record = createPhysicsBody3d({ name: box.name, ...options });
    box.physics = record;

    // The same reason as above, asked of space: an object is where it is, or where the shape it
    // draws is. A picture's placement is not an answer here, because it has no depth and no way of
    // facing, so an object that only draws one is treated as being nowhere.
    if (placement3dOf(box) === null) {
        console.warn(`[NacatamalOn] usePhysicsBody3d: '${box.name}' is not anywhere in space, so its collider was written down and not simulated. Place it with useTransform, or give it a shape to draw.`);
        return record;
    }

    // Shown, not played: written down and not simulated.
    if (isShowingOnly()) {
        return record;
    }
    const installed = getPhysicsProviders();
    if (installed.length === 0) {
        warnMissingPhysicsProvider();
        return record;
    }
    // Every one of them, because each answers for its own dimension and ignores the rest: a game
    // with a flat world and a solid one installs both.
    for (const provider of installed) {
        provider.createBody(box, record);
    }
    return record;
};
