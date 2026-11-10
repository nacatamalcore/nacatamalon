import { useCleanup } from '../../hooks/scene/use_cleanup';
import { getActiveBox, getActiveGame } from '../../store';
import { sceneTilemaps } from '../../gameobjects/tilemap/scene_tilemaps';
import { resolveLayers } from '../layer_names';
import { ALL_LAYERS } from '../layers';
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
import type { TRetroArea2d, TRetroAreaOptions2d, TRetroBodyHandle2d, TRetroRayHit2d, TRetroRayOptions2d } from './types';

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
 * import { createSprite, useKeyboard, useRetroBody2d, useSelf, useUpdate } from 'nacatamalon';
 * import { getRetroBody2d } from 'nacatamalon/retro-physics2d';
 *
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
        const store = getActiveGame();
        if (root === null || store === null) return;

        const world = createRetroWorld({
            world: record,
            // A world with no `bounds` of its own ends where the game's screen does.
            screen: () => {
                const { width, height } = store.get('config');
                return { width, height };
            },
            stepLength: physicsStepOf(),
            maxSteps: MAX_STEPS_PER_FRAME,
            // Every map an object of this scene draws is part of its world, asked as it steps: a map
            // loads after the scene is built.
            tilemaps: () => sceneTilemaps(store, root),
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
        // Forgotten whatever takes it out, its object's end or the game's `destroy()` on the body,
        // so a collision asking about it hears that it touches nothing any more.
        const handle = world.addBody(box, record, () => {
            if (bodies.get(box) === handle) bodies.delete(box);
        });
        bodies.set(box, handle);
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

    // In a retro scene, `useTileBody2d` walks among the retro bodies too: it pushes crates, rides
    // lifts and is pushed. Anywhere else it is left to the character on the maps alone.
    createCharacter2d: (box, shape) => worldOf(box)?.addCharacter(box as TGameObject, shape),

    // Every body of the scene's retro world, the characters among them, where each is going, its
    // edges, and the rays cast in the frame.
    drawDebug: (scene, draw) => {
        const declared = scene.physicsWorld;
        if (declared !== null && declared._type === 'retro-world-2d') worlds.get(declared)?.drawDebug(draw);
    },
};

/**
 * Casts a ray through the retro world of `from`'s scene and gives the nearest body or tile it meets:
 * what is under the feet, whether the guard sees the player, where the shot lands. `from` is the
 * object asking, and the ray never meets its own body.
 *
 * Bodies are measured where their objects are now, sensors left out, and the maps as they are: a
 * solid tile by the side the ray enters, a slope by its surface, a ledge only from above.
 *
 * @example
 * ```ts
 * import { createSprite, useRetroBody2d, useSelf, useUpdate } from 'nacatamalon';
 * import { castRetroRay2d } from 'nacatamalon/retro-physics2d';
 *
 * const Guard = () => {
 *     const sprite = createSprite({ key: 'guard', transform: { x: 200, y: 100 } });
 *     useRetroBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 12, height: 24 } });
 *     const self = useSelf();
 *
 *     useUpdate(() => {
 *         // Is there floor a step ahead? Turn round at the edge.
 *         const ahead = sprite.flipX ? -10 : 10;
 *         const floor = castRetroRay2d(self, { x: sprite.transform.x + ahead, y: sprite.transform.y }, { x: 0, y: 1 }, { maxDistance: 20 });
 *         if (floor === null) sprite.flipX = !sprite.flipX;
 *     });
 * };
 * ```
 *
 * @param from - The object asking: its scene's world is searched, and its own body left out.
 * @param origin - Where the ray starts, in the world.
 * @param direction - Which way it goes; its length does not matter.
 * @param options - How far it reaches, which layers of bodies it meets, and whether it meets tiles.
 * @returns The nearest thing met, or `null` when it meets nothing, or when `from` is not in a retro
 *   scene.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const castRetroRay2d = (
    from: TGameObject,
    origin: { x: number; y: number },
    direction: { x: number; y: number },
    options: TRetroRayOptions2d = {},
): TRetroRayHit2d | null => {
    const world = worldOf(from);
    if (world === undefined) return null;
    const names = gameOfBox(from)?.get('config').physicsLayers ?? [];
    const mask = options.collidesWith === undefined
        ? ALL_LAYERS
        : resolveLayers({ collidesWith: options.collidesWith }, names).collidesWith ?? ALL_LAYERS;
    return world.castRay(origin, direction, {
        maxDistance: options.maxDistance ?? Infinity,
        collidesWith: mask,
        tiles: options.tiles ?? true,
        ignore: from,
    });
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

/** A layer mask from what a question was given, by number, mask or the game's layer names. */
const maskFor = (from: TGameObject, collidesWith: TRetroAreaOptions2d['collidesWith']): number => {
    if (collidesWith === undefined) return ALL_LAYERS;
    const names = gameOfBox(from)?.get('config').physicsLayers ?? [];
    return resolveLayers({ collidesWith }, names).collidesWith ?? ALL_LAYERS;
};

/**
 * The objects whose retro bodies are in a part of `from`'s world now, the nearest to its middle
 * first: what an explosion reaches, the enemies a guard can hear, the coins a magnet pulls. `from`
 * is the object asking, and is left out.
 *
 * The area is a rectangle from its top left corner, `{ x, y, width, height }`, or a circle from its
 * middle, `{ x, y, radius }`, in the world's pixels. Sensors count unless `sensors: false`.
 *
 * @example
 * ```ts
 * import { destroy, useSelf } from 'nacatamalon';
 * import { findRetroBodies2d } from 'nacatamalon/retro-physics2d';
 *
 * const Bomb = (x: number, y: number) => {
 *     const self = useSelf();
 *     // Everything within 40 pixels goes with it.
 *     const explode = () => {
 *         for (const hit of findRetroBodies2d(self, { x, y, radius: 40 }, { collidesWith: ['enemy'] })) destroy(hit);
 *         destroy(self);
 *     };
 *     void explode;
 * };
 * ```
 *
 * @param from - The object asking: its scene's world is searched, and it is left out.
 * @param area - The part of the world, a rectangle or a circle.
 * @param options - Which layers count, and whether sensors do.
 * @returns The objects found, nearest first; none when `from` is not in a retro scene.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const findRetroBodies2d = (from: TGameObject, area: TRetroArea2d, options: TRetroAreaOptions2d = {}): TGameObject[] =>
    worldOf(from)?.findBodies(area, { collidesWith: maskFor(from, options.collidesWith), sensors: options.sensors ?? true, ignore: from }) ?? [];

/**
 * Whether a part of `from`'s world is empty of anything solid now: no retro body that stops things
 * (sensors never count), and no solid tile of the maps unless `tiles: false`. Whether a crate fits
 * where it is about to be dropped, whether a character can stand up from a crouch.
 *
 * @example
 * ```ts
 * import { useSelf } from 'nacatamalon';
 * import { isRetroAreaFree2d } from 'nacatamalon/retro-physics2d';
 *
 * const Hero = () => {
 *     const self = useSelf();
 *     // Room above the head to stand up again?
 *     const canStand = (x: number, top: number) => isRetroAreaFree2d(self, { x: x - 6, y: top - 12, width: 12, height: 12 });
 *     void canStand;
 * };
 * ```
 *
 * @param from - The object asking: its scene's world is searched, and it is left out.
 * @param area - The part of the world, a rectangle from its top left or a circle from its middle.
 * @param options - Which layers of bodies count, and whether the maps do.
 * @returns `true` when nothing solid is there; also when `from` is not in a retro scene.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isRetroAreaFree2d = (from: TGameObject, area: TRetroArea2d, options: TRetroAreaOptions2d = {}): boolean =>
    worldOf(from)?.isFree(area, { collidesWith: maskFor(from, options.collidesWith), tiles: options.tiles ?? true, ignore: from }) ?? true;
