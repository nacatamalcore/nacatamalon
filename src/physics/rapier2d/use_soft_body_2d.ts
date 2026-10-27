import { getActiveBox, getActiveGame } from '../../store';
import { firstTimeIn } from '../../utils/first_time_in';
import { getPhysicsProviders } from '../physics_provider';
import { getPhysicsWorld2d } from './provider';
import type { TSoftBody2d, TSoftBodyOptions2d } from './t_soft_body_2d';

/**
 * A body that does nothing: where nothing simulates, a soft body stays the shape it was drawn.
 */
const inert = (): TSoftBody2d => ({
    outline: [],
    velocity: { x: 0, y: 0 },
    push: () => {},
    kick: () => {},
    destroy: () => {},
});

/**
 * Makes the object being built a soft body in the scene's 2D world: something that squashes, wobbles
 * and rolls rather than keeping its shape. A blob of goo, a jelly, a ball of dough, a rope.
 *
 * It is a ring of corners held to one another, and to the area they enclose, by springs. It falls,
 * lands on the map and on the other bodies, rolls down slopes and squashes against walls. The object
 * is kept at its middle, and `outline` says where its corners are. Give it a `polygon` made with
 * `createPolygon` and the corners of that are moved to the body's every frame, the picture stretching
 * with them.
 *
 * A soft body rolls without turning its object: its turn is in where its corners are.
 *
 * @param options The shape it starts as and what it is made of: see {@link TSoftBodyOptions2d}.
 * @returns The body: its corners, and ways to move it.
 *
 * @example
 * ```ts
 * import { createGame, createPolygon, createScene, getColor, useKeyboard, usePhysicsWorld2d, useSpawn, useTransform, useUpdate } from 'nacatamalon';
 * import { installPhysics2d, useSoftBody2d } from 'nacatamalon/physics2d';
 *
 * installPhysics2d();
 *
 * // A green blob that hops with space.
 * const Blob = () => {
 *     useTransform({ x: 160, y: 40 });
 *     const ring = Array.from({ length: 16 }, (_, i) => ({ x: Math.cos(i / 16 * Math.PI * 2) * 20, y: Math.sin(i / 16 * Math.PI * 2) * 20 }));
 *     const polygon = createPolygon({ points: ring, tint: getColor('#5bd75b') });
 *     const blob = useSoftBody2d({ shape: 'disk', radius: 20, polygon });
 *     const keys = useKeyboard();
 *     useUpdate(() => {
 *         if (keys.justPressed(' ')) blob.kick(0, -300);
 *     });
 * };
 *
 * const Level = () => {
 *     usePhysicsWorld2d();
 *     useSpawn(Blob)();
 *     return createScene();
 * };
 *
 * createGame('#app', { width: 320, height: 180 })({ Level });
 * ```
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useSoftBody2d = (options: TSoftBodyOptions2d): TSoftBody2d => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useSoftBody2d: call it inside a scene body, or inside something created with useSpawn.');
    }
    if (options.shape === 'polygon' && options.points.length < 3) {
        throw new Error(`[NacatamalOn] useSoftBody2d: a 'polygon' needs at least three corners, and was given ${options.points.length}.`);
    }
    const world = getPhysicsWorld2d();
    if (world === null) {
        if (getPhysicsProviders().length > 0 && firstTimeIn(getActiveGame(), 'useSoftBody2d: no world')) {
            console.warn('[NacatamalOn] useSoftBody2d: the scene has no 2D world, so the body never moves. Call usePhysicsWorld2d() in the scene\'s body, before what is in it.');
        }
        return inert();
    }
    return world.addSoftBody(box as Parameters<typeof world.addSoftBody>[0], options);
};
