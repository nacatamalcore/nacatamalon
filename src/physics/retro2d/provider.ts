import { useCleanup } from '../../hooks/scene/use_cleanup';
import { getActiveBox } from '../../store';
import { gameOfBox } from '../../box/box_game';
import { firstTimeIn } from '../../utils/first_time_in';
import { registerPhysicsProvider } from '../physics_provider';
import { physicsStepOf } from '../step_length';
import { createRetroWorld } from './retro_world';
import type { TBox } from '../../box';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TPhysicsBody, TPhysicsWorld } from '../types/t_physics';
import type { TRetroWorld2d } from '../types/t_retro_physics';
import type { TPhysicsProvider } from '../physics_provider';
import type { TRetroWorld } from './retro_world';
import type { TRetroBodyHandle2d } from './types';

/**
 * The most steps one frame may take: a frame that comes after a long pause catches up this far and
 * lets the rest go, instead of freezing the game to simulate all of it.
 */
const MAX_STEPS_PER_FRAME = 5;

/**
 * Each scene's retro world, by the record its root keeps: a body finds its own scene's, so two scenes
 * alive at once, the one leaving and the one arriving, never trade bodies.
 */
const worlds = new WeakMap<TRetroWorld2d, TRetroWorld>();

/** Each object's retro body, for `getRetroBody2d`. */
const bodies = new WeakMap<TBox, TRetroBodyHandle2d>();

/**
 * The world an object's body goes into: the one of the nearest object above it, itself included,
 * that declares a world. A world of another kind there means the object is in a scene the retro half
 * does not move.
 */
const worldOf = (box: TBox): TRetroWorld | undefined => {
    for (let at: TBox | null = box; at !== null; at = at.parent) {
        const declared = at.physicsWorld;
        if (declared === null) continue;
        return declared._type === 'retro-world-2d' ? worlds.get(declared) : undefined;
    }
    return undefined;
};

/**
 * Gives the retro body that moves an object, to push, listen and read what stopped it. `null` for an
 * object with no retro body, or before the retro physics is installed.
 *
 * It is the same body `getPhysicsBody2d` would give for a body of the full simulation, with what the
 * retro half adds: `velocity`, `acceleration` and `blocked`.
 *
 * @example
 * ```ts
 * const Hero = () => {
 *     createSprite({ key: 'hero', transform: { x: 40, y: 100 } });
 *     useRetroBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 12, height: 24 } });
 *     const body = getRetroBody2d(useSelf());
 *     const keys = useKeyboard();
 *
 *     useUpdate(() => {
 *         if (body === null) return;
 *         body.velocity.x = ((keys.isDown('ArrowRight') ? 1 : 0) - (keys.isDown('ArrowLeft') ? 1 : 0)) * 90;
 *         if (keys.justPressed('x') && body.blocked.down) body.velocity.y = -300;
 *     });
 * };
 * ```
 *
 * @param object - The object whose body it is.
 * @returns Its retro body, or `null`.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getRetroBody2d = (object: TGameObject): TRetroBodyHandle2d | null => bodies.get(object) ?? null;

/**
 * Moves the retro bodies a scene declares: the provider `installRetroPhysics2d()` installs.
 *
 * It takes only what is its own, `retro-world-2d` and `retro-body-2d`, and leaves the rest to the
 * other providers, so it can be installed beside the full simulation: each scene is moved by the
 * kind of world it declares.
 *
 * ```ts
 * import { registerPhysicsProvider } from 'nacatamalon/extend';
 * import { retroPhysics2dProvider } from 'nacatamalon/retro-physics2d';
 *
 * registerPhysicsProvider(retroPhysics2dProvider);
 * ```
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const retroPhysics2dProvider: TPhysicsProvider = {
    createWorld: (record: TPhysicsWorld) => {
        if (record._type !== 'retro-world-2d') return;
        const root = getActiveBox();
        if (root === null) return;

        const world = createRetroWorld({
            gravity: record.gravity,
            stepLength: physicsStepOf(),
            maxSteps: MAX_STEPS_PER_FRAME,
        });
        worlds.set(record, world);
        // Moved once every update of the scene has set its speeds, and before hitboxes are compared
        // and late updates run: see `runMoves`.
        root.moveCallbacks.push((dt) => world.frame(dt));
        useCleanup(() => {
            world.close();
            worlds.delete(record);
        });
    },

    createBody: (box: TGameObject, record: TPhysicsBody) => {
        if (record._type !== 'retro-body-2d') return;

        const world = worldOf(box);
        if (world === undefined) {
            if (firstTimeIn(gameOfBox(box), 'retro physics: body with no world')) {
                console.warn(`[NacatamalOn] retro-physics2d: '${box.name}' has a retro body and its scene has no retro world, so it sits still. Give the scene's root a Retro World 2D (useRetroWorld2d).`);
            }
            return;
        }
        const handle = world.addBody(box, record);
        bodies.set(box, handle);
        box.cleanups.push(() => {
            if (bodies.get(box) === handle) bodies.delete(box);
        });
    },

    watchContacts: (box, told) => {
        const body = bodies.get(box);
        if (body === undefined) return false;
        body.onEnter((other) => told(other, true));
        body.onExit((other) => told(other, false));
        return true;
    },

    hasBody: (box) => {
        if (box.physics === null || box.physics._type !== 'retro-body-2d') return undefined;
        return bodies.has(box);
    },
};

/**
 * Installs the retro half of physics: bodies that never turn, moved in pixels a fixed step at a time
 * and stopped against each other axis by axis. **The one line a game writes** to make its retro
 * bodies move, beside or instead of `installPhysics2d()`.
 *
 * ```ts
 * import { installRetroPhysics2d } from 'nacatamalon/retro-physics2d';
 *
 * installRetroPhysics2d();
 * ```
 *
 * Installing twice does nothing the second time.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const installRetroPhysics2d = (): void => {
    registerPhysicsProvider(retroPhysics2dProvider);
};
